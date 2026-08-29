// ============================================================================
// src/db/connection.js
// MongoDB connection lifecycle: connect (auto-starting a local mongod in
// development if none is listening), create indexes, seed the demo
// teacher, and expose the live collection handles.
// ============================================================================

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const { DEMO_TEACHER, MONGODB_DB, MONGODB_URI, MONGO_CLIENT_OPTIONS, USERS_COLLECTION } = require('../config/env');
const { escapeRegExp, normalizeEmail } = require('../utils/validators');
const { normalizeRole } = require('../utils/normalizers');

// Mutable shared handle. Populated by initializeDatabase(); every other
// module reads collections through this object so the reference stays live.
const dbState = {
  db: null,
  mongoClient: null,
  usersCol: null,
  subjectsCol: null,
  uploadsCol: null,
  studentsCol: null,
  analyticsCol: null,
  aiInsightsCol: null,
  reportsCol: null,
};
let databaseReadyPromise = null;

let localMongoStartupPromise = null;

function isLocalMongoUri(uri) {
  return /mongodb:\/\/(127\.0\.0\.1|localhost)/i.test(String(uri || ''));
}

function isConnectionRefusedError(error) {
  return Boolean(
    error &&
    (
      error.code === 'ECONNREFUSED' ||
      String(error.message || '').includes('ECONNREFUSED') ||
      String(error.message || '').includes('Server selection timed out')
    )
  );
}

/**
 * Locate a mongod binary to auto-start in development.
 *
 * Set MONGOD_BIN to point at a specific binary; otherwise the usual install
 * locations for the current platform are searched, followed by anything named
 * `mongod` on PATH. Returns an empty list when none is found, in which case the
 * caller reports that MongoDB must be started manually.
 */
function candidateMongoBins() {
  const candidates = [];

  if (process.env.MONGOD_BIN) {
    candidates.push(process.env.MONGOD_BIN);
  }

  const versions = ['8.2', '8.0', '7.0', '6.0'];

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    for (const version of versions) {
      candidates.push(path.join(programFiles, 'MongoDB', 'Server', version, 'bin', 'mongod.exe'));
    }
  } else if (process.platform === 'darwin') {
    // Homebrew on Apple Silicon, then Intel, then a manual install.
    candidates.push('/opt/homebrew/bin/mongod', '/opt/homebrew/opt/mongodb-community/bin/mongod');
    candidates.push('/usr/local/bin/mongod', '/usr/local/opt/mongodb-community/bin/mongod');
    for (const version of versions) {
      candidates.push(`/usr/local/Cellar/mongodb-community/${version}/bin/mongod`);
    }
  } else {
    candidates.push('/usr/bin/mongod', '/usr/local/bin/mongod', '/opt/mongodb/bin/mongod');
    for (const version of versions) {
      candidates.push(`/opt/mongodb-linux-x86_64-${version}/bin/mongod`);
    }
  }

  // Anything named mongod on PATH, whatever the platform.
  const pathDirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const binaryName = process.platform === 'win32' ? 'mongod.exe' : 'mongod';
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, binaryName));
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate || seen.has(candidate)) return false;
    seen.add(candidate);
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function waitForPort(host, port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

function ensurePortAvailable(port) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer()
      .once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Open http://localhost:${port} or stop the existing server before starting another one.`));
          return;
        }

        reject(error);
      })
      .once('listening', () => {
        tester.close(resolve);
      })
      .listen(port, '127.0.0.1');
  });
}

function isHttpServerAlreadyRunning(port) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/health',
      timeout: 1200,
    }, (res) => {
      res.resume();
      resolve(true);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

async function ensureLocalMongoProcess() {
  if (!isLocalMongoUri(MONGODB_URI)) {
    return;
  }

  if (!isConnectionRefusedError(await tryMongoConnectOnce())) {
    return;
  }

  if (localMongoStartupPromise) {
    return localMongoStartupPromise;
  }

  localMongoStartupPromise = (async () => {
    const mongoBin = candidateMongoBins()[0];
    if (!mongoBin) {
      throw new Error('Local MongoDB is not running and mongod.exe was not found. Start MongoDB Server or set MONGODB_URI to a cloud database.');
    }

    const localDataDir = process.env.LOCAL_MONGODB_DATA_DIR || path.join(__dirname, '.mongodb-data');
    fs.mkdirSync(localDataDir, { recursive: true });
    fs.mkdirSync(path.join(localDataDir, 'log'), { recursive: true });
    fs.mkdirSync(path.join(localDataDir, 'db'), { recursive: true });
    const logPath = path.join(localDataDir, 'log', 'mongod.log');

    console.log(`[STARTUP] Launching local MongoDB from ${mongoBin}`);
    const child = spawn(
      mongoBin,
      [
        '--dbpath', path.join(localDataDir, 'db'),
        '--bind_ip', '127.0.0.1',
        '--port', '27017',
        '--logpath', logPath,
        '--logappend',
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    child.unref();
    await waitForPort('127.0.0.1', 27017, 30000);
    console.log('[STARTUP] Local MongoDB is ready');
  })().catch((error) => {
    localMongoStartupPromise = null;
    throw error;
  });

  return localMongoStartupPromise;
}

async function tryMongoConnectOnce() {
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 2500 });
    await client.connect();
    await client.close();
    return null;
  } catch (error) {
    return error;
  }
}

async function initializeDatabase() {
  if (dbState.mongoClient && dbState.db && dbState.usersCol && dbState.subjectsCol && dbState.uploadsCol && dbState.studentsCol && dbState.analyticsCol && dbState.aiInsightsCol && dbState.reportsCol) {
    return dbState.db;
  }

  if (process.env.NODE_ENV === 'production' && isLocalMongoUri(MONGODB_URI)) {
    throw new Error('Production environment cannot connect to mongodb://127.0.0.1:27017. Use a cloud MongoDB URI.');
  }

  console.log('[STARTUP] Connecting to MongoDB...');

  // Connect a local client first and publish it onto dbState only once it is
  // live. If the first attempt fails, that client must be closed before a
  // replacement is built -- an abandoned MongoClient keeps its socket pool and
  // its background server-monitoring timers alive for the life of the process.
  let client = new MongoClient(MONGODB_URI, MONGO_CLIENT_OPTIONS);
  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => {});
    if (isLocalMongoUri(MONGODB_URI) && isConnectionRefusedError(error)) {
      console.warn('[STARTUP] Local MongoDB is not running. Attempting auto-start...');
      await ensureLocalMongoProcess();
      client = new MongoClient(MONGODB_URI, MONGO_CLIENT_OPTIONS);
      try {
        await client.connect();
      } catch (retryError) {
        await client.close().catch(() => {});
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  dbState.mongoClient = client;
  console.log('[STARTUP] Connected to MongoDB successfully');

  dbState.db = client.db(MONGODB_DB);
  dbState.usersCol = dbState.db.collection(USERS_COLLECTION);
  dbState.subjectsCol = dbState.db.collection('subjects');
  dbState.uploadsCol = dbState.db.collection('uploads');
  dbState.studentsCol = dbState.db.collection('students');
  dbState.analyticsCol = dbState.db.collection('analytics');
  dbState.aiInsightsCol = dbState.db.collection('aiInsights');
  dbState.reportsCol = dbState.db.collection('reports');
  console.log('[STARTUP] All 7 collections initialized');

  console.log('[STARTUP] Creating indexes...');
  await dbState.usersCol.createIndex({ emailKey: 1 }, { unique: true });
  await dbState.usersCol.createIndex({ email: 1 });
  await dbState.uploadsCol.createIndex({ userId: 1 });
  await dbState.uploadsCol.createIndex({ userId: 1, uploadDate: -1 });
  await dbState.uploadsCol.createIndex({ userId: 1, subjectName: 1 });
  await dbState.studentsCol.createIndex({ uploadId: 1 });
  await dbState.studentsCol.createIndex({ userId: 1, uploadId: 1 });
  await dbState.studentsCol.createIndex({ uploadId: 1, rollNo: 1 });
  await dbState.studentsCol.createIndex({ uploadId: 1, studentName: 1 });
  await dbState.studentsCol.createIndex({ userId: 1, rollNo: 1 });
  await dbState.analyticsCol.createIndex({ uploadId: 1 }, { unique: true });
  await dbState.aiInsightsCol.createIndex({ uploadId: 1 });
  await dbState.aiInsightsCol.createIndex({ uploadId: 1, userId: 1 });
  await dbState.reportsCol.createIndex({ userId: 1, createdAt: -1 });
  console.log('[STARTUP] Indexes created successfully');

  // Roles are compared as lowercase everywhere. Older documents were written
  // with a capitalised value, so normalise any that remain -- a role check
  // must not depend on which code path created the account.
  const roleFix = await dbState.usersCol.updateMany(
    { role: { $exists: true, $not: /^[a-z]+$/ } },
    [{ $set: { role: { $toLower: '$role' } } }]
  );
  if (roleFix.modifiedCount > 0) {
    console.log(`[STARTUP] Normalised role casing on ${roleFix.modifiedCount} user document(s)`);
  }

  await seedDemoUser();
  return dbState.db;
}

/**
 * The only supported way to reach the database.
 *
 * initializeDatabase() is deliberately not called directly anywhere: this
 * function memoises the in-flight promise so concurrent requests share one
 * connection attempt, and a failure clears the memo so the next request
 * retries. Calling initializeDatabase() directly would defeat both.
 */
async function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initializeDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

async function seedDemoUser() {
  if (!dbState.usersCol) {
    return;
  }

  const emailKey = normalizeEmail(DEMO_TEACHER.email);
  const now = new Date();
  const passwordHash = await bcrypt.hash(DEMO_TEACHER.password, 12);

  const existingDemoUser = await dbState.usersCol.findOne({
    $or: [
      { emailKey },
      { email: { $regex: `^${escapeRegExp(DEMO_TEACHER.email.trim())}$`, $options: 'i' } },
    ],
  });

  if (existingDemoUser) {
    await dbState.usersCol.updateOne(
      { _id: existingDemoUser._id },
      {
        $set: {
          fullName: existingDemoUser.fullName || DEMO_TEACHER.fullName.trim(),
          email: existingDemoUser.email || DEMO_TEACHER.email.trim(),
          emailKey,
          passwordHash,
          role: normalizeRole(existingDemoUser.role),
          updatedAt: now,
        },
      }
    );
    console.log(`[STARTUP] Verified demo teacher ${DEMO_TEACHER.email}`);
    return;
  }

  await dbState.usersCol.insertOne({
    fullName: DEMO_TEACHER.fullName.trim(),
    email: DEMO_TEACHER.email.trim(),
    emailKey,
    passwordHash,
    role: normalizeRole('teacher'),
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[STARTUP] Seeded demo teacher ${DEMO_TEACHER.email}`);
}

module.exports = {
  dbState,
  ensurePortAvailable,
  isHttpServerAlreadyRunning,
  ensureDatabaseReady,
};
