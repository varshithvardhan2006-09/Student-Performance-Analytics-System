// ============================================================================
// Student Performance Analytics System - Backend Server
// ============================================================================
// Tech: Express 5, MongoDB Native Driver, JWT, Multer, XLSX, CSV, PDF, Groq AI
// ============================================================================

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const csvParser = require('csv-parser');
const { PDFParse } = require('pdf-parse');
const PDFDocument = require('pdfkit');
const Groq = require('groq-sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

// ============================================================================
// Custom .env Loader
// ============================================================================
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('[ENV] No .env file found, using existing environment variables');
      return;
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('[ENV] Environment variables loaded from .env file');
  } catch (err) {
    console.error('[ENV] Error loading .env file:', err.message);
  }
}

loadEnv();

// ============================================================================
// Configuration
// ============================================================================
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'student_analytics';
const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || 'users';
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_change_me';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MONGO_CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS || '5000', 10),
};
const DEMO_TEACHER = {
  fullName: process.env.DEMO_TEACHER_NAME || 'Demo Teacher',
  email: process.env.DEMO_TEACHER_EMAIL || 'demo.teacher@saps.local',
  password: process.env.DEMO_TEACHER_PASSWORD || 'Demo@1234',
};

// ============================================================================
// Express App Setup
// ============================================================================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.use(async (req, res, next) => {
  try {
    await ensureDatabaseReady();
    next();
  } catch (error) {
    next(error);
  }
});

// Multer setup - memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Allowed: CSV, XLSX, XLS, PDF'));
    }
  }
});

// ============================================================================
// MongoDB Collection References (initialized at startup)
// ============================================================================
let db;
let usersCol;
let subjectsCol;
let uploadsCol;
let studentsCol;
let analyticsCol;
let aiInsightsCol;
let reportsCol;
let mongoClient;
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

function candidateMongoBins() {
  const candidates = [
    'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
  ];

  if (process.env.MONGOD_BIN && fs.existsSync(process.env.MONGOD_BIN)) {
    candidates.unshift(process.env.MONGOD_BIN);
  }

  return candidates.filter((candidate) => fs.existsSync(candidate));
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
  if (mongoClient && db && usersCol && subjectsCol && uploadsCol && studentsCol && analyticsCol && aiInsightsCol && reportsCol) {
    return db;
  }

  if ((process.env.VERCEL || process.env.NODE_ENV === 'production') && isLocalMongoUri(MONGODB_URI)) {
    throw new Error('Vercel cannot connect to mongodb://127.0.0.1:27017. Use a cloud MongoDB URI such as MongoDB Atlas in the Vercel environment variables.');
  }

  console.log('[STARTUP] Connecting to MongoDB...');
  try {
    mongoClient = new MongoClient(MONGODB_URI, MONGO_CLIENT_OPTIONS);
    await mongoClient.connect();
  } catch (error) {
    if (isLocalMongoUri(MONGODB_URI) && isConnectionRefusedError(error)) {
      console.warn('[STARTUP] Local MongoDB is not running. Attempting auto-start...');
      await ensureLocalMongoProcess();
      mongoClient = new MongoClient(MONGODB_URI, MONGO_CLIENT_OPTIONS);
      await mongoClient.connect();
    } else {
      throw error;
    }
  }
  console.log('[STARTUP] Connected to MongoDB successfully');

  db = mongoClient.db(MONGODB_DB);
  usersCol = db.collection(USERS_COLLECTION);
  subjectsCol = db.collection('subjects');
  uploadsCol = db.collection('uploads');
  studentsCol = db.collection('students');
  analyticsCol = db.collection('analytics');
  aiInsightsCol = db.collection('aiInsights');
  reportsCol = db.collection('reports');
  console.log('[STARTUP] All 7 collections initialized');

  console.log('[STARTUP] Creating indexes...');
  await usersCol.createIndex({ emailKey: 1 }, { unique: true });
  await uploadsCol.createIndex({ userId: 1 });
  await studentsCol.createIndex({ uploadId: 1 });
  await analyticsCol.createIndex({ uploadId: 1 }, { unique: true });
  await aiInsightsCol.createIndex({ uploadId: 1 });
  console.log('[STARTUP] Indexes created successfully');

  await seedDemoUser();
  return db;
}

async function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initializeDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

// ============================================================================
// Authentication Middleware
// ============================================================================
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. Invalid token format.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token has expired. Please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeReportType(value) {
  return String(value || 'single').trim().toLowerCase() === 'multiple' ? 'multiple' : 'single';
}

function cleanHeaderLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSubjectMarks(subjectMarks) {
  if (!isPlainObject(subjectMarks)) {
    return {};
  }

  return Object.entries(subjectMarks).reduce((accumulator, [key, value]) => {
    const label = cleanHeaderLabel(key);
    if (!label || value === null || value === undefined || String(value).trim() === '') {
      return accumulator;
    }
    accumulator[label] = value;
    return accumulator;
  }, {});
}

function extractSubjectMarks(record) {
  if (!isPlainObject(record)) {
    return {};
  }

  if (isPlainObject(record.subjectMarks)) {
    return normalizeSubjectMarks(record.subjectMarks);
  }

  if (isPlainObject(record.marks)) {
    return normalizeSubjectMarks(record.marks);
  }

  return {};
}

function hasSubjectMarks(record) {
  return Object.keys(extractSubjectMarks(record)).length > 0;
}

function detectRecordsReportType(records, fallback = 'single') {
  if (Array.isArray(records) && records.some((record) => hasSubjectMarks(record))) {
    return 'multiple';
  }

  return normalizeReportType(fallback);
}

function getSubjectNamesFromStudents(students = [], analytics = null) {
  const subjectNames = [];
  const addSubjectName = (name) => {
    const label = cleanHeaderLabel(name);
    if (label && !subjectNames.includes(label)) {
      subjectNames.push(label);
    }
  };

  if (Array.isArray(analytics?.subjectSummary)) {
    analytics.subjectSummary.forEach((subject) => addSubjectName(subject.subjectName));
  }

  students.forEach((student) => {
    Object.keys(extractSubjectMarks(student)).forEach(addSubjectName);
  });

  return subjectNames;
}

function escapeCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildStudentPerformance(student, marks, maxMarks, passingMarks, rank = student.rank || 0) {
  const numericMarks = Number(marks);
  const safeMarks = Number.isFinite(numericMarks) ? numericMarks : 0;
  const percentage = parseFloat(((safeMarks / maxMarks) * 100).toFixed(2));
  const status = safeMarks >= passingMarks ? 'Pass' : 'Fail';
  let category = 'Average Performer';

  if (status === 'Fail') {
    category = 'Failed';
  } else if (percentage > 80) {
    category = 'Top Performer';
  } else if (percentage < 40) {
    category = 'Weak Student';
  }

  return {
    ...student,
    marks: parseFloat(safeMarks.toFixed(2)),
    percentage,
    status,
    category,
    rank,
  };
}

function calculateAnalyticsForSubset(students, maxMarks, reportType = 'single') {
  if (!Array.isArray(students) || students.length === 0) {
    return {
      totalStudents: 0,
      passedStudents: 0,
      failedStudents: 0,
      averageMarks: 0,
      highestMarks: 0,
      lowestMarks: 0,
      passPercentage: 0,
      failPercentage: 0,
      marksDistribution: {
        range_0_35: 0,
        range_36_50: 0,
        range_51_70: 0,
        range_71_85: 0,
        range_86_100: 0,
      },
      reportType: normalizeReportType(reportType),
      subjectSummary: [],
    };
  }

  return calculateAnalytics(students, maxMarks, reportType);
}

function buildFilteredDashboardData(uploadDoc, students, analytics, subjectFilter = 'all', studentFilter = 'all') {
  const maxMarks = Number(uploadDoc.maxMarks) || 100;
  const passingMarks = Number(uploadDoc.passingMarks) || 35;
  const reportType = normalizeReportType(uploadDoc.subjectType || analytics?.reportType);
  const subjectNames = getSubjectNamesFromStudents(students, analytics);
  const subjectOptions = subjectNames.length
    ? subjectNames
    : [uploadDoc.subjectName].filter(Boolean);
  const selectedSubject = String(subjectFilter || 'all').trim();
  const selectedStudent = String(studentFilter || 'all').trim();
  const normalizedSubject = selectedSubject.toLowerCase();
  const normalizedStudent = selectedStudent.toLowerCase();

  const studentOptions = students.map((student) => ({
    rollNo: String(student.rollNo || ''),
    studentName: String(student.studentName || ''),
    label: `${student.studentName} (${student.rollNo})`,
  }));

  let filteredStudents = students.filter((student) => {
    if (normalizedStudent === 'all') {
      return true;
    }

    return String(student.rollNo || '').toLowerCase() === normalizedStudent
      || String(student.studentName || '').toLowerCase() === normalizedStudent;
  });

  if (normalizedSubject !== 'all' && subjectNames.length) {
    filteredStudents = filteredStudents
      .map((student) => {
        const subjectMarks = extractSubjectMarks(student);
        const matchedSubject = subjectNames.find((subjectName) => subjectName.toLowerCase() === normalizedSubject);
        if (!matchedSubject || subjectMarks[matchedSubject] === undefined) {
          return null;
        }

        return buildStudentPerformance(
          {
            ...student,
            selectedSubject: matchedSubject,
            subjectMarks,
          },
          subjectMarks[matchedSubject],
          maxMarks,
          passingMarks,
          student.rank
        );
      })
      .filter(Boolean);
  } else {
    filteredStudents = filteredStudents.map((student) => buildStudentPerformance(
      student,
      student.marks,
      maxMarks,
      passingMarks,
      student.rank
    ));
  }

  filteredStudents.sort((left, right) => Number(right.marks) - Number(left.marks));
  filteredStudents.forEach((student, index) => {
    student.rank = index + 1;
  });

  const filteredAnalytics = calculateAnalyticsForSubset(
    filteredStudents,
    maxMarks,
    subjectNames.length ? 'multiple' : reportType
  );

  if (normalizedSubject !== 'all' && subjectNames.length) {
    const subjectName = subjectNames.find((name) => name.toLowerCase() === normalizedSubject) || selectedSubject;
    const subjectMarks = filteredStudents.map((student) => Number(student.marks)).filter(Number.isFinite);
    filteredAnalytics.subjectSummary = [{
      subjectName,
      averageMarks: subjectMarks.length ? parseFloat((subjectMarks.reduce((sum, mark) => sum + mark, 0) / subjectMarks.length).toFixed(2)) : 0,
      highestMarks: subjectMarks.length ? Math.max(...subjectMarks) : 0,
      lowestMarks: subjectMarks.length ? Math.min(...subjectMarks) : 0,
    }];
  }

  return {
    analytics: filteredAnalytics,
    students: filteredStudents,
    filters: {
      selectedSubject: selectedSubject || 'all',
      selectedStudent: selectedStudent || 'all',
      subjectOptions,
      studentOptions,
    },
  };
}

async function seedDemoUser() {
  if (!usersCol) {
    return;
  }

  const emailKey = normalizeEmail(DEMO_TEACHER.email);
  const now = new Date();
  const passwordHash = await bcrypt.hash(DEMO_TEACHER.password, 12);

  const existingDemoUser = await usersCol.findOne({
    $or: [
      { emailKey },
      { email: { $regex: `^${escapeRegExp(DEMO_TEACHER.email.trim())}$`, $options: 'i' } },
    ],
  });

  if (existingDemoUser) {
    await usersCol.updateOne(
      { _id: existingDemoUser._id },
      {
        $set: {
          fullName: existingDemoUser.fullName || DEMO_TEACHER.fullName.trim(),
          email: existingDemoUser.email || DEMO_TEACHER.email.trim(),
          emailKey,
          passwordHash,
          role: existingDemoUser.role || 'teacher',
          updatedAt: now,
        },
      }
    );
    console.log(`[STARTUP] Verified demo teacher ${DEMO_TEACHER.email}`);
    return;
  }

  await usersCol.insertOne({
    fullName: DEMO_TEACHER.fullName.trim(),
    email: DEMO_TEACHER.email.trim(),
    emailKey,
    passwordHash,
    role: 'teacher',
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[STARTUP] Seeded demo teacher ${DEMO_TEACHER.email}`);
}

/**
 * Normalize column names from parsed file data
 */
function normalizeColumnName(col) {
  const normalized = col.toString().trim().toLowerCase().replace(/[.\s_-]+/g, ' ').trim();

  const rollNoVariations = ['roll no', 'rollno', 'roll_no', 'roll number', 'roll', 'id', 'sno', 's.no', 's no'];
  const nameVariations = ['student name', 'studentname', 'student_name', 'name', 'student'];
  const marksVariations = ['marks', 'mark', 'score', 'scores', 'total', 'total marks'];

  if (rollNoVariations.includes(normalized)) return 'rollNo';
  if (nameVariations.includes(normalized)) return 'studentName';
  if (marksVariations.includes(normalized)) return 'marks';

  return null;
}

/**
 * Normalize records by mapping column names
 */
function normalizeRecords(rawRecords, reportType = 'single') {
  if (!rawRecords || rawRecords.length === 0) return [];

  const normalizedReportType = normalizeReportType(reportType);

  // Get column mapping from first record
  const firstRecord = rawRecords[0];
  const columnMap = {};
  const subjectKeys = [];
  let hasMarksColumn = false;
  let hasExtraColumns = false;
  let hasStructuredSubjectMarks = false;

  for (const key of Object.keys(firstRecord)) {
    const mapped = normalizeColumnName(key);
    if (mapped) {
      columnMap[key] = mapped;
      if (mapped === 'marks') {
        hasMarksColumn = true;
      }
    } else if (key === 'subjectMarks') {
      hasStructuredSubjectMarks = true;
    } else {
      hasExtraColumns = true;
      subjectKeys.push(key);
    }
  }

  for (const record of rawRecords) {
    if (isPlainObject(record?.subjectMarks) || isPlainObject(record?.marks)) {
      hasStructuredSubjectMarks = true;
      break;
    }
  }

  const effectiveReportType = normalizedReportType === 'multiple'
    || hasStructuredSubjectMarks
    || (!hasMarksColumn && hasExtraColumns)
    ? 'multiple'
    : 'single';

  // Map all records
  return rawRecords.map(record => {
    const normalized = {};
    for (const [originalKey, mappedKey] of Object.entries(columnMap)) {
      normalized[mappedKey] = record[originalKey];
    }

    if (effectiveReportType === 'multiple') {
      const subjectMarks = {};
      const recordSubjectMarks = isPlainObject(record.subjectMarks) ? record.subjectMarks : null;

      if (recordSubjectMarks) {
        Object.assign(subjectMarks, normalizeSubjectMarks(recordSubjectMarks));
      }

      if (isPlainObject(record.marks)) {
        Object.assign(subjectMarks, normalizeSubjectMarks(record.marks));
      }

      for (const key of subjectKeys) {
        const value = record[key];
        if (value === null || value === undefined || String(value).trim() === '') {
          continue;
        }
        subjectMarks[cleanHeaderLabel(key)] = value;
      }

      if (Object.keys(subjectMarks).length > 0) {
        normalized.subjectMarks = subjectMarks;
      }
    }

    if (effectiveReportType === 'single' && record.marks !== undefined && normalized.marks === undefined) {
      normalized.marks = record.marks;
    }

    return normalized;
  });
}

/**
 * Parse CSV buffer into records
 */
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];
    const readable = Readable.from(buffer);
    readable
      .pipe(csvParser())
      .on('data', (row) => {
        records.push(row);
      })
      .on('end', () => {
        resolve(records);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Parse Excel buffer into records
 */
function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel file has no sheets');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const records = xlsx.utils.sheet_to_json(worksheet);
  return records;
}

/**
 * Parse PDF buffer into records
 */
function parsePDFTextToRecords(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const records = [];
  let subjectHeaders = [];
  let headerFound = false;

  const splitLine = (line) => line.split(/\s+/).map((part) => part.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = splitLine(line);
    if (parts.length < 3) {
      continue;
    }

    const normalized = parts.map((part) => cleanHeaderLabel(part).toLowerCase());
    const isRollHeader = normalized[0] === 'roll' && normalized[1] === 'no';
    const isStudentHeader = normalized[2] === 'student' && normalized[3] === 'name';

    if (!headerFound && isRollHeader && isStudentHeader && parts.length >= 5) {
      subjectHeaders = parts.slice(4).map((part) => cleanHeaderLabel(part)).filter(Boolean);
      headerFound = subjectHeaders.length > 0;
      continue;
    }

    if (headerFound) {
      const subjectCount = subjectHeaders.length;
      if (parts.length < 2 + subjectCount) {
        continue;
      }

      const rollNo = parts[0];
      const studentName = parts.slice(1, parts.length - subjectCount).join(' ');
      const subjectValues = parts.slice(-subjectCount);
      const hasNumericSubjectValues = subjectValues.every((value) => Number.isFinite(parseFloat(value)));

      if (!hasNumericSubjectValues) {
        continue;
      }

      if (subjectCount === 1 && /^(marks?|score|total)$/i.test(subjectHeaders[0])) {
        records.push({
          rollNo,
          studentName,
          marks: subjectValues[0],
        });
        continue;
      }

      const subjectMarks = {};
      let validRow = true;
      for (let index = 0; index < subjectHeaders.length; index++) {
        const subjectName = subjectHeaders[index];
        const value = subjectValues[index];
        if (value === undefined || value === null || String(value).trim() === '') {
          validRow = false;
          break;
        }
        subjectMarks[subjectName] = value;
      }

      if (validRow) {
        records.push({
          rollNo,
          studentName,
          subjectMarks,
        });
      }
    }
  }

  if (records.length === 0) {
    for (const line of lines) {
      const parts = splitLine(line);
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        if (!isNaN(parseFloat(lastPart))) {
          records.push({
            rollNo: parts[0],
            studentName: parts.slice(1, parts.length - 1).join(' '),
            marks: lastPart
          });
        }
      }
    }
  }

  return records;
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizePdfRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => {
    const normalized = {
      rollNo: String(record?.rollNo ?? record?.roll_no ?? record?.roll ?? '').trim(),
      studentName: String(record?.studentName ?? record?.student_name ?? record?.name ?? '').trim(),
    };

    if (isPlainObject(record?.subjectMarks)) {
      normalized.subjectMarks = normalizeSubjectMarks(record.subjectMarks);
    } else if (isPlainObject(record?.marks)) {
      normalized.subjectMarks = normalizeSubjectMarks(record.marks);
    } else {
      const marksValue = record?.marks ?? record?.score ?? record?.mark ?? '';
      normalized.marks = String(marksValue).trim();
    }

    return normalized;
  }).filter((record) => record.rollNo || record.studentName || record.marks || Object.keys(record.subjectMarks || {}).length);
}

async function parsePDF(buffer, fileName = 'uploaded.pdf') {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();
  const text = String(data.text || '').trim();
  const localRecords = parsePDFTextToRecords(text);

  if (!text) {
    throw new Error('The PDF does not contain readable text. Please upload a searchable PDF, CSV, or Excel file.');
  }

  if (GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You validate student marks PDFs. Return only JSON with keys valid, reason, reportType, and records. For single-subject sheets, records must be an array of objects with rollNo, studentName, and marks. For multi-subject sheets, records must be an array of objects with rollNo, studentName, and subjectMarks, where subjectMarks is an object mapping subject names to numeric marks. If the file is not a valid student marks sheet, set valid to false and explain why.',
          },
          {
            role: 'user',
            content: [
              `File name: ${fileName}`,
              'Determine whether the text below is a valid student marks table.',
              'If it is a single-subject sheet, extract every row into JSON records with rollNo, studentName, and marks.',
              'If it is a multi-subject sheet, extract every row into JSON records with rollNo, studentName, and subjectMarks.',
              'Return only JSON.',
              '',
              'PDF text:',
              text.slice(0, 12000),
            ].join('\n'),
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0,
      });

      const aiContent = completion.choices?.[0]?.message?.content || '';
      const payload = extractJsonObject(aiContent);
      if (!payload) {
        throw new Error('Groq returned an unreadable PDF validation response.');
      }

      if (payload.valid === false) {
        throw new Error(payload.reason || 'The uploaded PDF is not a valid student marks sheet.');
      }

      const groqRecords = normalizePdfRecords(payload.records);
      if (groqRecords.length > 0) {
        return groqRecords;
      }
    } catch (error) {
      if (localRecords.length > 0) {
        console.warn('[PDF GROQ FALLBACK]', error.message);
        return localRecords;
      }
      throw error;
    }
  }

  return localRecords;
}

/**
 * Validate parsed student records
 */
function validateRecords(records, maxMarks, reportType = 'single') {
  const errors = [];
  const normalizedReportType = normalizeReportType(reportType);

  if (!records || records.length === 0) {
    errors.push('No student records found in the file.');
    return { valid: false, errors };
  }

  // Check required columns
  const firstRecord = records[0];
  const hasRollNo = 'rollNo' in firstRecord;
  const hasName = 'studentName' in firstRecord;
  const hasMarks = 'marks' in firstRecord;
  const hasSubjectMarks = Object.keys(extractSubjectMarks(firstRecord)).length > 0;

  if (!hasRollNo) errors.push('Missing required column: Roll No');
  if (!hasName) errors.push('Missing required column: Student Name');
  if (normalizedReportType === 'single' && !hasMarks) errors.push('Missing required column: Marks');
  if (normalizedReportType === 'multiple' && !hasSubjectMarks && !hasMarks) errors.push('Missing required subject mark columns.');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check for duplicate roll numbers
  const rollNos = new Set();
  const duplicates = new Set();
  for (const record of records) {
    const rollNo = String(record.rollNo).trim();
    if (rollNos.has(rollNo)) {
      duplicates.add(rollNo);
    }
    rollNos.add(rollNo);
  }
  if (duplicates.size > 0) {
    errors.push(`Duplicate roll numbers found: ${Array.from(duplicates).join(', ')}`);
  }

  // Validate each record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowNum = i + 1;

    if (normalizedReportType === 'multiple') {
      const subjectMarks = extractSubjectMarks(record);
      const subjectEntries = Object.entries(subjectMarks);

      if (subjectEntries.length === 0) {
        errors.push(`Row ${rowNum}: No subject marks found.`);
        continue;
      }

      for (const [subjectName, subjectValue] of subjectEntries) {
        const marks = parseFloat(subjectValue);
        if (isNaN(marks)) {
          errors.push(`Row ${rowNum}: ${subjectName} marks must be a number (got "${subjectValue}")`);
        } else if (marks < 0) {
          errors.push(`Row ${rowNum}: ${subjectName} marks cannot be negative (got ${marks})`);
        } else if (marks > maxMarks) {
          errors.push(`Row ${rowNum}: ${subjectName} marks (${marks}) exceed maximum marks (${maxMarks})`);
        }
      }
      continue;
    }

    const marks = parseFloat(record.marks);
    if (isNaN(marks)) {
      errors.push(`Row ${rowNum}: Marks must be a number (got "${record.marks}")`);
    } else if (marks < 0) {
      errors.push(`Row ${rowNum}: Marks cannot be negative (got ${marks})`);
    } else if (marks > maxMarks) {
      errors.push(`Row ${rowNum}: Marks (${marks}) exceed maximum marks (${maxMarks})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Process student records - calculate percentage, status, category, rank
 */
function processStudents(records, maxMarks, passingMarks, reportType = 'single') {
  const normalizedReportType = normalizeReportType(reportType);

  const students = records.map((record) => {
    if (normalizedReportType === 'multiple') {
      const subjectMarks = extractSubjectMarks(record);
      const subjectValues = Object.values(subjectMarks)
        .map((value) => parseFloat(value))
        .filter((value) => Number.isFinite(value));
      const marks = subjectValues.length > 0
        ? parseFloat((subjectValues.reduce((sum, value) => sum + value, 0) / subjectValues.length).toFixed(2))
        : 0;
      const percentage = parseFloat(((marks / maxMarks) * 100).toFixed(2));
      const status = marks >= passingMarks ? 'Pass' : 'Fail';

      let category;
      if (status === 'Fail') {
        category = 'Failed';
      } else if (percentage > 80) {
        category = 'Top Performer';
      } else if (percentage >= 50 && percentage <= 80) {
        category = 'Average Performer';
      } else if (percentage < 40) {
        category = 'Weak Student';
      } else {
        category = 'Average Performer';
      }

      return {
        rollNo: String(record.rollNo).trim(),
        studentName: String(record.studentName).trim(),
        marks,
        percentage,
        status,
        category,
        subjectMarks,
      };
    }

    const marks = parseFloat(record.marks);
    const percentage = parseFloat(((marks / maxMarks) * 100).toFixed(2));
    const status = marks >= passingMarks ? 'Pass' : 'Fail';

    let category;
    if (status === 'Fail') {
      category = 'Failed';
    } else if (percentage > 80) {
      category = 'Top Performer';
    } else if (percentage >= 50 && percentage <= 80) {
      category = 'Average Performer';
    } else if (percentage < 40) {
      category = 'Weak Student';
    } else {
      category = 'Average Performer';
    }

    return {
      rollNo: String(record.rollNo).trim(),
      studentName: String(record.studentName).trim(),
      marks,
      percentage,
      status,
      category
    };
  });

  // Sort by marks descending and assign rank
  students.sort((a, b) => b.marks - a.marks);
  students.forEach((student, index) => {
    student.rank = index + 1;
  });

  return students;
}

/**
 * Calculate analytics from processed students
 */
function calculateAnalytics(students, maxMarks, reportType = 'single') {
  if (!Array.isArray(students) || students.length === 0) {
    return calculateAnalyticsForSubset([], maxMarks, reportType);
  }

  const totalStudents = students.length;
  const passedStudents = students.filter((s) => s.status === 'Pass').length;
  const failedStudents = students.filter((s) => s.status === 'Fail').length;
  const allMarks = students.map((s) => s.marks);
  const averageMarks = parseFloat((allMarks.reduce((a, b) => a + b, 0) / totalStudents).toFixed(2));
  const highestMarks = Math.max(...allMarks);
  const lowestMarks = Math.min(...allMarks);
  const passPercentage = parseFloat(((passedStudents / totalStudents) * 100).toFixed(2));
  const failPercentage = parseFloat(((failedStudents / totalStudents) * 100).toFixed(2));

  // Marks distribution based on percentage
  const marksDistribution = {
    range_0_35: 0,
    range_36_50: 0,
    range_51_70: 0,
    range_71_85: 0,
    range_86_100: 0
  };

  for (const student of students) {
    const pct = student.percentage;
    if (pct <= 35) {
      marksDistribution.range_0_35++;
    } else if (pct <= 50) {
      marksDistribution.range_36_50++;
    } else if (pct <= 70) {
      marksDistribution.range_51_70++;
    } else if (pct <= 85) {
      marksDistribution.range_71_85++;
    } else {
      marksDistribution.range_86_100++;
    }
  }

  const subjectSummary = normalizeReportType(reportType) === 'multiple'
    ? (() => {
        const aggregation = new Map();
        for (const student of students) {
          if (!isPlainObject(student.subjectMarks)) {
            continue;
          }

          for (const [subjectName, subjectValue] of Object.entries(student.subjectMarks)) {
            const marks = parseFloat(subjectValue);
            if (!Number.isFinite(marks)) {
              continue;
            }

            const bucket = aggregation.get(subjectName) || {
              subjectName,
              total: 0,
              count: 0,
              highest: marks,
              lowest: marks,
            };
            bucket.total += marks;
            bucket.count += 1;
            bucket.highest = Math.max(bucket.highest, marks);
            bucket.lowest = Math.min(bucket.lowest, marks);
            aggregation.set(subjectName, bucket);
          }
        }

        return Array.from(aggregation.values()).map((bucket) => ({
          subjectName: bucket.subjectName,
          averageMarks: parseFloat((bucket.total / bucket.count).toFixed(2)),
          highestMarks: bucket.highest,
          lowestMarks: bucket.lowest,
        }));
      })()
    : [];

  return {
    totalStudents,
    passedStudents,
    failedStudents,
    averageMarks,
    highestMarks,
    lowestMarks,
    passPercentage,
    failPercentage,
    marksDistribution,
    reportType: normalizeReportType(reportType),
    subjectSummary,
  };
}

/**
 * Generate fallback AI insights when no API key is available
 */
function generateFallbackInsights(analytics, subjectName) {
  const {
    totalStudents, passedStudents, failedStudents,
    averageMarks, highestMarks, lowestMarks,
    passPercentage, failPercentage, marksDistribution
  } = analytics;

  // Overall Summary
  let overallSummary = '';
  if (passPercentage >= 80) {
    overallSummary = `The overall performance in ${subjectName} is commendable with a pass percentage of ${passPercentage}%. Out of ${totalStudents} students, ${passedStudents} students passed successfully. The class demonstrates a strong understanding of the subject matter.`;
  } else if (passPercentage >= 60) {
    overallSummary = `The performance in ${subjectName} is moderate with a pass percentage of ${passPercentage}%. While ${passedStudents} out of ${totalStudents} students passed, there is room for improvement. Targeted interventions for struggling students are recommended.`;
  } else if (passPercentage >= 40) {
    overallSummary = `The performance in ${subjectName} is below expectations with only ${passPercentage}% students passing. ${failedStudents} out of ${totalStudents} students failed, indicating significant gaps in understanding. Immediate remedial measures are needed.`;
  } else {
    overallSummary = `The performance in ${subjectName} is concerning with a very low pass percentage of ${passPercentage}%. ${failedStudents} students out of ${totalStudents} have failed. This requires urgent attention and a comprehensive review of teaching methodology.`;
  }

  // Average Analysis
  let averageAnalysis = '';
  if (averageMarks >= 70) {
    averageAnalysis = `The class average of ${averageMarks} marks indicates strong overall performance. Students are grasping concepts well and the teaching approach is effective. Focus on pushing top performers to excellence while maintaining the current standard.`;
  } else if (averageMarks >= 50) {
    averageAnalysis = `The class average of ${averageMarks} marks is satisfactory but shows room for growth. While the majority understands core concepts, the gap between highest (${highestMarks}) and lowest (${lowestMarks}) marks suggests varying levels of understanding that need attention.`;
  } else {
    averageAnalysis = `The class average of ${averageMarks} marks is below the expected standard. With the highest marks at ${highestMarks} and lowest at ${lowestMarks}, there is a significant disparity in student performance. A review of the teaching approach and additional support sessions are recommended.`;
  }

  // Top Performer Analysis
  const topPerformers = marksDistribution.range_86_100 + marksDistribution.range_71_85;
  let topPerformerAnalysis = `${topPerformers} students (${((topPerformers / totalStudents) * 100).toFixed(1)}%) scored above 70%, demonstrating excellent grasp of the subject. `;
  if (topPerformers > totalStudents * 0.3) {
    topPerformerAnalysis += 'This is a healthy proportion of high achievers. Consider providing advanced challenges and peer tutoring opportunities to leverage their abilities.';
  } else if (topPerformers > 0) {
    topPerformerAnalysis += 'While these students show promise, increasing the number of top performers should be a goal. Consider enrichment activities and competitive academic exercises.';
  } else {
    topPerformerAnalysis += 'The absence of top performers is a concern. Review the difficulty level of assessments and ensure adequate preparation time is provided to students.';
  }

  // Weak Student Analysis
  const weakStudents = marksDistribution.range_0_35;
  let weakStudentAnalysis = `${weakStudents} students (${((weakStudents / totalStudents) * 100).toFixed(1)}%) scored 35% or below, placing them in the weak category. `;
  if (weakStudents === 0) {
    weakStudentAnalysis += 'The absence of very weak students is a positive indicator. Continue with the current support mechanisms.';
  } else if (weakStudents <= totalStudents * 0.2) {
    weakStudentAnalysis += 'These students need personalized attention, including extra classes, simplified study materials, and regular progress monitoring.';
  } else {
    weakStudentAnalysis += 'The high number of weak students is alarming. Consider peer-learning groups, remedial classes, parent-teacher meetings, and a thorough review of foundational concepts.';
  }

  // Recommendations
  const recommendations = [];
  if (failPercentage > 30) {
    recommendations.push('Conduct remedial classes for failed students focusing on weak areas identified through mark analysis.');
  }
  if (averageMarks < 60) {
    recommendations.push('Review and simplify teaching methodology; incorporate more practical examples and visual aids.');
  }
  recommendations.push('Implement regular formative assessments to track student progress before summative exams.');
  recommendations.push('Create study groups pairing top performers with weaker students for peer-assisted learning.');
  recommendations.push('Schedule one-on-one mentoring sessions for students scoring below the passing threshold.');
  if (marksDistribution.range_86_100 < totalStudents * 0.1) {
    recommendations.push('Introduce challenging problems and advanced topics to push capable students toward excellence.');
  }
  recommendations.push('Maintain a performance tracking dashboard to monitor improvement trends across assessments.');

  // Improvement Strategy
  let improvementStrategy = 'Based on the current performance data, the following strategy is recommended: ';
  if (passPercentage < 60) {
    improvementStrategy += 'Priority should be given to increasing the pass rate through foundational concept revision, additional practice sessions, and differentiated instruction. ';
  }
  improvementStrategy += `Focus on moving students from the 36-50% bracket (${marksDistribution.range_36_50} students) to the 51-70% range through targeted practice. `;
  improvementStrategy += 'Implement weekly quizzes, provide additional study resources, and establish clear learning objectives for each topic.';

  // Action Plan
  const actionPlan = [
    'Analyze question-wise performance to identify specific topics where students struggle.',
    'Develop supplementary study materials targeting identified weak areas.',
    'Schedule bi-weekly extra classes for students scoring below passing marks.',
    'Create a peer tutoring program pairing top performers with struggling students.',
    'Implement weekly short quizzes to continuously assess understanding.',
    'Hold parent-teacher meetings for students in the "Failed" category to create home support plans.',
    'Review and adjust the teaching pace based on class comprehension levels.',
    'Set measurable improvement targets for each student for the next assessment cycle.'
  ].join('\n');

  return {
    overallSummary,
    averageAnalysis,
    topPerformerAnalysis,
    weakStudentAnalysis,
    recommendations: recommendations.slice(0, 5).join('\n'),
    improvementStrategy,
    actionPlan
  };
}

function normalizeMarksValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildQueryStudentList(students = []) {
  return [...students]
    .map((student) => ({
      rollNo: String(student.rollNo ?? '').trim(),
      studentName: String(student.studentName ?? '').trim(),
      marks: normalizeMarksValue(student.marks) ?? 0,
      percentage: normalizeMarksValue(student.percentage) ?? 0,
      status: String(student.status ?? '').trim(),
      category: String(student.category ?? '').trim(),
      rank: normalizeMarksValue(student.rank) ?? 0,
      subjectMarks: extractSubjectMarks(student),
    }))
    .filter((student) => student.rollNo || student.studentName);
}

function buildQueryFacts(analytics, students, subjectName) {
  const sortedStudents = buildQueryStudentList(students).sort((left, right) => (left.rank || 0) - (right.rank || 0) || (right.percentage || 0) - (left.percentage || 0));
  const topStudents = sortedStudents.slice(0, 5);
  const failedStudents = sortedStudents
    .filter((student) => String(student.status).toLowerCase() === 'fail')
    .slice(0, 5);
  const weakStudents = sortedStudents
    .filter((student) => student.percentage < 40 || String(student.status).toLowerCase() === 'fail')
    .slice(0, 5);

  return {
    subjectName,
    analytics: {
      totalStudents: analytics.totalStudents || sortedStudents.length || 0,
      passedStudents: analytics.passedStudents || 0,
      failedStudents: analytics.failedStudents || 0,
      averageMarks: analytics.averageMarks || 0,
      highestMarks: analytics.highestMarks || 0,
      lowestMarks: analytics.lowestMarks || 0,
      passPercentage: analytics.passPercentage || 0,
      failPercentage: analytics.failPercentage || 0,
      marksDistribution: analytics.marksDistribution || {},
      reportType: analytics.reportType || 'single',
      subjectSummary: Array.isArray(analytics.subjectSummary) ? analytics.subjectSummary : [],
    },
    topStudents,
    failedStudents,
    weakStudents,
    students: sortedStudents,
  };
}

function parseQuestionRange(question) {
  const normalized = String(question || '').toLowerCase();
  const match = normalized.match(/(?:between|from)?\s*(\d+(?:\.\d+)?)\s*(?:to|-|and)\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  return {
    lower: Math.min(first, second),
    upper: Math.max(first, second),
    usePercentage: normalized.includes('percent') || normalized.includes('percentage') || normalized.includes('%'),
  };
}

function parseQuestionThreshold(question) {
  const normalized = String(question || '').toLowerCase();
  const thresholdMatch = normalized.match(/\b(less than|below|under|greater than|more than|above|over|at least|minimum|maximum)\s+(\d+(?:\.\d+)?)\b/i);
  if (!thresholdMatch) {
    return null;
  }

  const operatorText = thresholdMatch[1].toLowerCase();
  const value = Number(thresholdMatch[2]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const usePercentage = normalized.includes('percent') || normalized.includes('percentage') || normalized.includes('%');
  let operator = 'lt';
  if (['greater than', 'more than', 'above', 'over'].includes(operatorText)) {
    operator = 'gt';
  } else if (operatorText === 'at least' || operatorText === 'minimum') {
    operator = 'gte';
  } else if (operatorText === 'maximum') {
    operator = 'lte';
  }

  return { operator, value, usePercentage };
}

const DATA_QUERY_SCOPE_MESSAGE = 'Please ask questions regarding your uploaded student performance data.';
const DATA_QUERY_KEYWORDS = [
  'student', 'students', 'roll', 'name', 'names', 'mark', 'marks', 'score', 'scores',
  'percentage', 'percent', 'pass', 'passed', 'fail', 'failed', 'weak', 'risk',
  'top', 'best', 'highest', 'lowest', 'average', 'mean', 'rank', 'performer',
  'performance', 'subject', 'subjects', 'class', 'analytics', 'analysis',
  'distribution', 'range', 'between', 'above', 'below', 'count', 'total',
  'grade', 'category', 'dashboard', 'upload', 'data', 'report', 'result',
  'results', 'insight', 'recommendation', 'improvement', 'strength', 'weakness',
];
const OFF_TOPIC_QUERY_PATTERNS = [
  /\b(hello|hi|hey|bye|good morning|good afternoon|good evening|good night)\b/i,
  /\bweather\b/i,
  /\bnews\b/i,
  /\bjoke\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\brecipe\b/i,
  /\bmovie\b/i,
  /\bsong\b/i,
  /\blyrics\b/i,
  /\bcricket\b/i,
  /\bfootball\b/i,
  /\bstock\b/i,
  /\bcrypto\b/i,
  /\bcapital of\b/i,
  /\bpresident\b/i,
  /\bprime minister\b/i,
  /\bwrite (a )?(code|program|script)\b/i,
  /\bmake (a )?(code|program|script)\b/i,
  /\bapi key\b/i,
  /\bpassword\b/i,
  /\bignore (previous|all) instructions\b/i,
  /\bsystem prompt\b/i,
];
const CONCEPT_QUERY_PATTERN = /\b(what is|what are|explain|define|meaning of|definition of|teach me|tell me about)\b/i;

function collectKnownQueryTerms(students = [], analytics = {}, subjectName = '') {
  const terms = new Set();
  const addTerm = (value) => {
    const term = String(value || '').trim().toLowerCase();
    if (term.length >= 2) {
      terms.add(term);
    }
  };

  addTerm(subjectName);
  if (Array.isArray(analytics?.subjectSummary)) {
    analytics.subjectSummary.forEach((subject) => addTerm(subject.subjectName));
  }

  buildQueryStudentList(students).forEach((student) => {
    addTerm(student.rollNo);
    addTerm(student.studentName);
    Object.keys(student.subjectMarks || {}).forEach(addTerm);
  });

  return Array.from(terms);
}

function hasUploadedDataSignal(question, analytics, students, subjectName) {
  const normalized = String(question || '').toLowerCase();
  if (parseQuestionRange(question)) {
    return true;
  }

  if (parseQuestionThreshold(question)) {
    return true;
  }

  const hasKeyword = DATA_QUERY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (hasKeyword) {
    return true;
  }

  return collectKnownQueryTerms(students, analytics, subjectName)
    .some((term) => term && normalized.includes(term));
}

function isMostlyConceptQuestion(question, analytics, students, subjectName) {
  const normalized = String(question || '').toLowerCase();
  if (!CONCEPT_QUERY_PATTERN.test(normalized)) {
    return false;
  }

  const metricSignals = DATA_QUERY_KEYWORDS.filter((keyword) => !['subject', 'subjects', 'class', 'data'].includes(keyword));
  const hasMetricSignal = metricSignals.some((keyword) => normalized.includes(keyword)) || parseQuestionRange(question) || parseQuestionThreshold(question);
  if (hasMetricSignal) {
    return false;
  }

  return collectKnownQueryTerms(students, analytics, subjectName)
    .some((term) => term && normalized.includes(term));
}

function hasOffTopicSignal(question) {
  return OFF_TOPIC_QUERY_PATTERNS.some((pattern) => pattern.test(String(question || '')));
}

function buildCleanDataQuestion(question) {
  const normalized = String(question || '').toLowerCase();
  const range = parseQuestionRange(question);
  const threshold = parseQuestionThreshold(question);
  if (range) {
    return `Which students are in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range?`;
  }
  if (threshold) {
    const direction = ['gt', 'gte'].includes(threshold.operator) ? 'above' : 'below';
    return `Which students scored ${direction} ${threshold.value} ${threshold.usePercentage ? 'percent' : 'marks'}?`;
  }
  if (normalized.includes('failed') || normalized.includes('failure') || normalized.includes('fail')) {
    return 'Which students failed in the uploaded data?';
  }
  if (normalized.includes('weak') || normalized.includes('risk')) {
    return 'Which students need improvement in the uploaded data?';
  }
  if (normalized.includes('top') || normalized.includes('best') || normalized.includes('highest')) {
    return 'Who are the top performers in the uploaded data?';
  }
  if (normalized.includes('average') || normalized.includes('mean')) {
    return 'What is the class average in the uploaded data?';
  }
  if (normalized.includes('subject')) {
    return 'Which subject has the highest and lowest performance in the uploaded data?';
  }
  return 'Show the pass/fail summary for the uploaded data.';
}

function classifyQuestionScope(question, analytics, students, subjectName) {
  const text = String(question || '').trim();
  if (!text) {
    return { allowed: false, message: 'Please type a question about your uploaded student performance data.' };
  }

  const hasDataSignal = hasUploadedDataSignal(text, analytics, students, subjectName);
  if (!hasDataSignal || isMostlyConceptQuestion(text, analytics, students, subjectName)) {
    return { allowed: false, message: DATA_QUERY_SCOPE_MESSAGE };
  }

  if (hasOffTopicSignal(text)) {
    return {
      allowed: false,
      message: `${DATA_QUERY_SCOPE_MESSAGE} Try asking: "${buildCleanDataQuestion(text)}"`,
    };
  }

  return { allowed: true, message: '' };
}

function answerQuestionFromData(question, analytics, students) {
  const normalized = String(question || '').toLowerCase();
  const range = parseQuestionRange(question);
  const threshold = parseQuestionThreshold(question);
  const list = buildQueryStudentList(students);
  const topStudents = [...list].slice(0, 5);
  const failedStudents = list.filter((student) => String(student.status).toLowerCase() === 'fail').slice(0, 5);
  const weakStudents = list.filter((student) => student.percentage < 40 || String(student.status).toLowerCase() === 'fail').slice(0, 5);
  const subjectSummary = Array.isArray(analytics.subjectSummary) ? analytics.subjectSummary : [];
  const selectedStudent = list.length === 1 ? list[0] : null;
  const selectedSubjectMarks = selectedStudent
    ? Object.entries(selectedStudent.subjectMarks || {})
        .map(([subjectName, subjectValue]) => ({
          subjectName,
          marks: normalizeMarksValue(subjectValue),
        }))
        .filter((entry) => entry.subjectName && entry.marks !== null)
    : [];

  if (selectedStudent && selectedSubjectMarks.length > 0 && (
    normalized.includes('subject')
    || normalized.includes('weak')
    || normalized.includes('strong')
    || normalized.includes('highest')
    || normalized.includes('lowest')
    || normalized.includes('best')
    || normalized.includes('marks')
  )) {
    const rankedSubjects = [...selectedSubjectMarks].sort((left, right) => right.marks - left.marks);
    const strongestSubject = rankedSubjects[0];
    const weakestSubject = rankedSubjects[rankedSubjects.length - 1];

    if (normalized.includes('weak') || normalized.includes('lowest')) {
      return `${selectedStudent.studentName}'s weakest subject is ${weakestSubject.subjectName} with ${weakestSubject.marks} marks.`;
    }

    if (normalized.includes('strong') || normalized.includes('highest') || normalized.includes('best')) {
      return `${selectedStudent.studentName}'s strongest subject is ${strongestSubject.subjectName} with ${strongestSubject.marks} marks.`;
    }

    return `${selectedStudent.studentName}'s subject marks are: ${selectedSubjectMarks
      .map((entry) => `${entry.subjectName}: ${entry.marks}`)
      .join('; ')}. Strongest subject is ${strongestSubject.subjectName} (${strongestSubject.marks}) and weakest subject is ${weakestSubject.subjectName} (${weakestSubject.marks}).`;
  }

  if (range) {
    const matchingStudents = list.filter((student) => {
      const value = range.usePercentage ? student.percentage : student.marks;
      return value >= range.lower && value <= range.upper;
    });

    if (!matchingStudents.length) {
      return `No students were found in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range.`;
    }

    return `Students in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range: ${matchingStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, Marks ${student.marks}, ${student.percentage}%)`)
      .join('; ')}.`;
  }

  if (threshold) {
    const matchingStudents = list.filter((student) => {
      const value = threshold.usePercentage ? student.percentage : student.marks;
      if (!Number.isFinite(value)) return false;
      if (threshold.operator === 'gt') return value > threshold.value;
      if (threshold.operator === 'gte') return value >= threshold.value;
      if (threshold.operator === 'lte') return value <= threshold.value;
      return value < threshold.value;
    });
    const direction = ['gt', 'gte'].includes(threshold.operator) ? 'above' : 'below';
    const metric = threshold.usePercentage ? 'percentage' : 'marks';
    const isCountQuestion = /\b(how many|count|number of|total)\b/i.test(normalized);

    if (!matchingStudents.length) {
      return `No students scored ${direction} ${threshold.value} ${metric}.`;
    }

    if (isCountQuestion) {
      return `${matchingStudents.length} student${matchingStudents.length === 1 ? '' : 's'} scored ${direction} ${threshold.value} ${metric}.`;
    }

    return `Students who scored ${direction} ${threshold.value} ${metric}: ${matchingStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, Marks ${student.marks}, ${student.percentage}%)`)
      .join('; ')}.`;
  }

  if (normalized.includes('failed') || normalized.includes('failure') || normalized.includes('students who are failed')) {
    if (!failedStudents.length) {
      return 'No failed students were found in the current upload.';
    }

    return `Failed students: ${failedStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, Marks ${student.marks}, ${student.percentage}%)`)
      .join('; ')}.`;
  }

  if (normalized.includes('top') || normalized.includes('best') || normalized.includes('highest')) {
    if (!topStudents.length) {
      return 'No top performers are available for the current upload.';
    }

    return `Top performers: ${topStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${student.percentage}%)`)
      .join('; ')}.`;
  }

  if (normalized.includes('weak') || normalized.includes('risk')) {
    if (!weakStudents.length) {
      return 'No weak students were found in the current upload.';
    }

    return `Weak students: ${weakStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${student.percentage}%)`)
      .join('; ')}.`;
  }

  if (normalized.includes('pass') || normalized.includes('fail')) {
    return `Pass/fail summary: ${analytics.passedStudents || 0} passed and ${analytics.failedStudents || 0} failed out of ${analytics.totalStudents || list.length || 0} students. Pass percentage is ${analytics.passPercentage || 0}%.`;
  }

  if (normalized.includes('average') || normalized.includes('mean')) {
    return `The class average is ${analytics.averageMarks || 0}. The highest mark is ${analytics.highestMarks || 0} and the lowest mark is ${analytics.lowestMarks || 0}.`;
  }

  if (subjectSummary.length && (normalized.includes('subject') || normalized.includes('which subject') || normalized.includes('highest subject') || normalized.includes('lowest subject'))) {
    const rankedSubjects = [...subjectSummary].sort((left, right) => (right.averageMarks || 0) - (left.averageMarks || 0));
    const bestSubject = rankedSubjects[0];
    const weakestSubject = rankedSubjects[rankedSubjects.length - 1];
    return `Subject-wise summary: ${subjectSummary
      .map((subject) => `${subject.subjectName} average ${subject.averageMarks}`)
      .join('; ')}. Highest average is ${bestSubject.subjectName} (${bestSubject.averageMarks}), and lowest average is ${weakestSubject.subjectName} (${weakestSubject.averageMarks}).`;
  }

  return '';
}

async function generateQuestionAnswer(question, analytics, students, subjectName) {
  const scope = classifyQuestionScope(question, analytics, students, subjectName);
  if (!scope.allowed) {
    return scope.message;
  }

  const deterministicAnswer = answerQuestionFromData(question, analytics, students);
  if (deterministicAnswer) {
    return deterministicAnswer;
  }

  if (!GROQ_API_KEY) {
    return `I can only answer questions based on the uploaded ${subjectName} data. Ask me about marks, ranges, top performers, weak students, or pass/fail trends.`;
  }

  const context = buildQueryFacts(analytics, students, subjectName);
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: [
          'You answer questions about student performance data.',
          'Use only the facts provided in the context.',
          'Never invent names, marks, percentages, or counts.',
          `If the question is unrelated to the uploaded data, answer exactly: "${DATA_QUERY_SCOPE_MESSAGE}"`,
          'If the question mixes uploaded-data analysis with unrelated tasks, ask the user to submit only the uploaded-data question.',
          'If the answer is not available from the context, say that clearly.',
          'When listing students, include their names, roll numbers, marks, percentages, and subject marks when relevant.',
          'Respect any selected subject or selected student already reflected in the context.',
          'Be concise and answer the exact question the user asked.',
          'Return only JSON with a single key called "answer".',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Subject: ${subjectName}`,
          `Question: ${question}`,
          'Context:',
          JSON.stringify(context, null, 2),
        ].join('\n'),
      },
    ],
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
  });

  const aiContent = completion.choices?.[0]?.message?.content || '';
  const payload = extractJsonObject(aiContent);
  if (payload && payload.answer !== undefined && payload.answer !== null) {
    if (typeof payload.answer === 'string' && payload.answer.trim()) {
      return payload.answer.trim();
    }
    if (typeof payload.answer === 'number') {
      return `Answer: ${payload.answer}`;
    }
  }

  const trimmedContent = aiContent.trim();
  if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
    return `I could not generate a reliable answer from the ${subjectName} data. Please ask a clear question about marks, students, subjects, ranges, or pass/fail results.`;
  }

  return trimmedContent || `I could not generate a reliable answer from the ${subjectName} data.`;
}

/**
 * Parse AI response text into structured sections
 */
function parseAIResponse(text) {
  const sections = {
    overallSummary: '',
    averageAnalysis: '',
    topPerformerAnalysis: '',
    weakStudentAnalysis: '',
    recommendations: '',
    improvementStrategy: '',
    actionPlan: ''
  };

  const sectionPatterns = [
    { key: 'overallSummary', patterns: ['overall performance summary', 'overall summary', '1)', '1.', '1:'] },
    { key: 'averageAnalysis', patterns: ['average marks analysis', 'average analysis', '2)', '2.', '2:'] },
    { key: 'topPerformerAnalysis', patterns: ['top performer', '3)', '3.', '3:'] },
    { key: 'weakStudentAnalysis', patterns: ['weak student', '4)', '4.', '4:'] },
    { key: 'recommendations', patterns: ['teacher recommendation', 'recommendations', '5)', '5.', '5:'] },
    { key: 'improvementStrategy', patterns: ['improvement strategy', '6)', '6.', '6:'] },
    { key: 'actionPlan', patterns: ['action plan', 'academic action plan', '7)', '7.', '7:'] }
  ];

  // Try to split by section headers
  const lines = text.split('\n');
  let currentSection = 'overallSummary';
  let sectionContent = {};

  for (const sectionDef of sectionPatterns) {
    sectionContent[sectionDef.key] = [];
  }

  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();

    // Check if this line is a section header
    let foundSection = null;
    for (const sectionDef of sectionPatterns) {
      for (const pattern of sectionDef.patterns) {
        if (lowerLine.includes(pattern) && lowerLine.length < 100) {
          foundSection = sectionDef.key;
          break;
        }
      }
      if (foundSection) break;
    }

    if (foundSection) {
      currentSection = foundSection;
      // Check if there's content after a colon on the same line
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1 && colonIndex < line.length - 1) {
        const afterColon = line.substring(colonIndex + 1).trim();
        if (afterColon) {
          sectionContent[currentSection].push(afterColon);
        }
      }
    } else if (line.trim()) {
      sectionContent[currentSection].push(line.trim());
    }
  }

  for (const key of Object.keys(sections)) {
    sections[key] = sectionContent[key] ? sectionContent[key].join('\n') : '';
  }

  // If parsing didn't work well, put entire text in overallSummary
  const totalContent = Object.values(sections).join('').trim();
  if (!totalContent) {
    sections.overallSummary = text;
  }

  return sections;
}

// ============================================================================
// Health Check Route (public)
// ============================================================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Student Performance Analytics System API is running',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'disconnected'
  });
});

// ============================================================================
// Auth Routes (public)
// ============================================================================

// POST /api/signup
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const emailKey = normalizeEmail(email);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user
    const now = new Date();
    await usersCol.insertOne({
      fullName: fullName.trim(),
      email: email.trim(),
      emailKey,
      passwordHash,
      role: 'Teacher',
      createdAt: now,
      updatedAt: now
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully'
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in instead.' });
    }

    console.error('[SIGNUP ERROR]', err.message || err);
    res.status(500).json({ success: false, message: 'An error occurred during signup. Please try again.' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Find user
    const emailKey = normalizeEmail(email);
    const user = await usersCol.findOne({
      $or: [
        { emailKey },
        { email: { $regex: `^${escapeRegExp(String(email).trim())}$`, $options: 'i' } },
      ],
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    const isDemoTeacher = normalizeEmail(email) === normalizeEmail(DEMO_TEACHER.email);
    const isLegacyDemoPassword = isDemoTeacher && (password === 'Demo@123' || password === 'Demo@1234');

    if (!isPasswordValid && !isLegacyDemoPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (isLegacyDemoPassword && (!isPasswordValid || user.emailKey !== emailKey)) {
      await usersCol.updateOne(
        { _id: user._id },
        {
          $set: {
            emailKey,
            passwordHash: await bcrypt.hash(DEMO_TEACHER.password, 12),
            updatedAt: new Date(),
          },
        }
      );
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ success: false, message: 'An error occurred during login. Please try again.' });
  }
});

// ============================================================================
// Protected Routes - Apply auth middleware
// ============================================================================

// GET /api/profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { passwordHash: 0 } }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('[PROFILE ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

// GET /api/profile/stats
app.get('/api/profile/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId.toString();
    const totalUploads = await uploadsCol.countDocuments({ userId });
    const totalReports = await reportsCol.countDocuments({ userId });

    res.json({
      success: true,
      totalUploads,
      totalReports
    });
  } catch (err) {
    console.error('[PROFILE STATS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile stats.' });
  }
});

// ============================================================================
// File Upload & Processing
// ============================================================================

// POST /api/upload
app.post('/api/upload', authMiddleware, upload.array('file'), async (req, res) => {
  try {
    const { subjectName, className, maxMarks, passingMarks, subjectType } = req.body;
    const userId = req.userId.toString();
    const requestedReportType = normalizeReportType(subjectType);
    let reportType = requestedReportType;

    // Step 1: Validate subject fields
    if (!subjectName || !className || !maxMarks || !passingMarks) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: subjectName, className, maxMarks, passingMarks, subjectType.'
      });
    }

    const maxMarksNum = parseFloat(maxMarks);
    const passingMarksNum = parseFloat(passingMarks);

    if (isNaN(maxMarksNum) || maxMarksNum <= 0) {
      return res.status(400).json({ success: false, message: 'Maximum marks must be a positive number.' });
    }

    if (isNaN(passingMarksNum) || passingMarksNum <= 0) {
      return res.status(400).json({ success: false, message: 'Passing marks must be a positive number.' });
    }

    if (passingMarksNum > maxMarksNum) {
      return res.status(400).json({ success: false, message: 'Passing marks cannot exceed maximum marks.' });
    }

    // Step 2: Validate files
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ success: false, message: 'Please upload at least one file.' });
    }

    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.pdf'];
    const allRecords = [];

    for (const currentFile of uploadedFiles) {
      const fileExtension = path.extname(currentFile.originalname).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file format in ${currentFile.originalname}. Allowed formats: CSV, XLSX, XLS, PDF.`
        });
      }

      let rawRecords = [];
      const buffer = currentFile.buffer;

      try {
        if (fileExtension === '.csv') {
          rawRecords = await parseCSV(buffer);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
          rawRecords = parseExcel(buffer);
        } else if (fileExtension === '.pdf') {
          rawRecords = await parsePDF(buffer, currentFile.originalname);
        }
      } catch (parseErr) {
        console.error('[FILE PARSE ERROR]', parseErr);
        return res.status(400).json({
          success: false,
          message: `Failed to parse ${currentFile.originalname}: ${parseErr.message}`
        });
      }

      const records = normalizeRecords(rawRecords, reportType);
      const fileReportType = detectRecordsReportType(records, reportType);
      if (fileReportType === 'multiple') {
        reportType = 'multiple';
      }

      const validation = validateRecords(records, maxMarksNum, fileReportType);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `File validation failed for ${currentFile.originalname}.`,
          errors: validation.errors
        });
      }

      allRecords.push(...records);
    }

    // Step 3: Validate merged records
    const combinedValidation = validateRecords(allRecords, maxMarksNum, reportType);
    if (!combinedValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Combined file validation failed.',
        errors: combinedValidation.errors
      });
    }

    // Step 4: Process students (calculate percentage, status, category, rank)
    const students = processStudents(allRecords, maxMarksNum, passingMarksNum, reportType);

    // Step 5: Calculate analytics
    const analyticsData = calculateAnalytics(students, maxMarksNum, reportType);

    // Step 6: Save to MongoDB
    const now = new Date();
    const fileNames = uploadedFiles.map((file) => file.originalname);
    const totalFileSize = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    // Insert subject
    const subjectResult = await subjectsCol.insertOne({
      name: subjectName.trim(),
      className: className.trim(),
      maxMarks: maxMarksNum,
      passingMarks: passingMarksNum,
      subjectType: reportType,
      userId,
      createdAt: now
    });
    const subjectId = subjectResult.insertedId.toString();

    // Insert upload
    const uploadResult = await uploadsCol.insertOne({
      subjectId,
      subjectName: subjectName.trim(),
      className: className.trim(),
      maxMarks: maxMarksNum,
      passingMarks: passingMarksNum,
      subjectType: reportType,
      fileName: fileNames[0],
      fileNames,
      fileCount: fileNames.length,
      originalName: fileNames[0],
      fileSize: totalFileSize,
      studentCount: students.length,
      userId,
      uploadDate: now,
      status: 'completed'
    });
    const uploadId = uploadResult.insertedId.toString();

    // Insert students
    const studentDocs = students.map(student => ({
      uploadId,
      rollNo: student.rollNo,
      studentName: student.studentName,
      marks: student.marks,
      percentage: student.percentage,
      status: student.status,
      category: student.category,
      rank: student.rank,
      subjectMarks: student.subjectMarks || null,
      subjectType: reportType,
      userId
    }));
    await studentsCol.insertMany(studentDocs);

    // Insert analytics
    await analyticsCol.insertOne({
      uploadId,
      ...analyticsData,
      userId,
      calculatedAt: now
    });

    // Step 7: Return response
    res.status(201).json({
      success: true,
      uploadId,
      upload: {
        _id: uploadId,
        subjectName: subjectName.trim(),
        className: className.trim(),
        maxMarks: maxMarksNum,
        passingMarks: passingMarksNum,
        subjectType: reportType,
        fileName: fileNames[0],
        fileNames,
        fileCount: fileNames.length,
        studentCount: students.length,
        uploadDate: now,
        status: 'completed',
      },
      analytics: analyticsData,
      studentCount: students.length,
      fileCount: fileNames.length,
      subjectType: reportType,
      message: 'File processed successfully'
    });
  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    res.status(500).json({ success: false, message: 'An error occurred while processing the file.' });
  }
});

// ============================================================================
// Analytics APIs
// ============================================================================

// GET /api/analytics/:uploadId/filtered
app.get('/api/analytics/:uploadId/filtered', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    const { subject = 'all', student = 'all' } = req.query;

    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found for this upload.' });
    }

    const students = await studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .limit(5000)
      .toArray();

    const filteredData = buildFilteredDashboardData(uploadDoc, students, analytics, subject, student);

    res.json({
      success: true,
      upload: uploadDoc,
      ...filteredData,
    });
  } catch (err) {
    console.error('[FILTERED ANALYTICS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch filtered analytics.' });
  }
});

// GET /api/analytics/:uploadId
app.get('/api/analytics/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    // Fetch analytics
    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found for this upload.' });
    }

    // Fetch upload info
    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });

    // Fetch subject info
    let subject = null;
    if (uploadDoc && uploadDoc.subjectId) {
      subject = await subjectsCol.findOne({ _id: new ObjectId(uploadDoc.subjectId) });
    }

    res.json({
      success: true,
      analytics,
      upload: uploadDoc,
      subject
    });
  } catch (err) {
    console.error('[ANALYTICS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
});

// GET /api/students/:uploadId
app.get('/api/students/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    const { search, status, category, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(1000, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Build query filter
    const filter = { uploadId, userId };

    if (status) {
      filter.status = status;
    }

    if (category) {
      filter.category = category;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { rollNo: searchRegex },
        { studentName: searchRegex }
      ];
    }

    // Get total count
    const total = await studentsCol.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    // Get students with pagination
    const students = await studentsCol
      .find(filter)
      .sort({ rank: 1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.json({
      success: true,
      students,
      total,
      page: pageNum,
      totalPages
    });
  } catch (err) {
    console.error('[STUDENTS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
});

// ============================================================================
// AI Insights APIs
// ============================================================================

// POST /api/ai-insights/:uploadId
app.post('/api/ai-insights/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    // Fetch analytics
    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found. Please upload data first.' });
    }

    // Fetch upload for subject info
    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const subjectName = uploadDoc.subjectName || 'Unknown Subject';
    let insights;

    if (GROQ_API_KEY) {
      // Use Groq AI
      try {
        const groq = new Groq({ apiKey: GROQ_API_KEY });

        const weakStudentCount = analytics.marksDistribution.range_0_35;

        const userPrompt = `Analyze the following student performance data for ${subjectName}:

- Total Students: ${analytics.totalStudents}
- Passed: ${analytics.passedStudents}
- Failed: ${analytics.failedStudents}
- Average Marks: ${analytics.averageMarks}
- Highest Marks: ${analytics.highestMarks}
- Lowest Marks: ${analytics.lowestMarks}
- Pass Percentage: ${analytics.passPercentage}%
- Fail Percentage: ${analytics.failPercentage}%
- Weak Students (scoring below 35%): ${weakStudentCount}

Please provide:
1) Overall Performance Summary (2-3 sentences)
2) Average Marks Analysis
3) Top Performer Analysis
4) Weak Student Analysis
5) Teacher Recommendations (5 bullet points)
6) Improvement Strategy
7) Academic Action Plan (numbered steps)`;

        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are an experienced academic advisor analyzing student performance data. Provide detailed, actionable insights in a structured format. Be specific and practical in your recommendations.'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          model: 'llama-3.1-8b-instant'
        });

        const aiText = completion.choices[0].message.content;
        insights = parseAIResponse(aiText);
      } catch (aiErr) {
        console.error('[GROQ AI ERROR]', aiErr);
        // Fallback to rule-based insights on AI error
        insights = generateFallbackInsights(analytics, subjectName);
      }
    } else {
      // No API key - use fallback
      insights = generateFallbackInsights(analytics, subjectName);
    }

    // Store insights in DB (upsert)
    const now = new Date();
    await aiInsightsCol.updateOne(
      { uploadId, userId },
      {
        $set: {
          uploadId,
          insights,
          userId,
          generatedAt: now
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      insights,
      generatedAt: now
    });
  } catch (err) {
    console.error('[AI INSIGHTS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to generate AI insights.' });
  }
});

// POST /api/ai-query/:uploadId
app.post('/api/ai-query/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    const question = String(req.body?.question || '').trim();
    const selectedSubject = String(req.body?.filters?.subject || 'all').trim();
    const selectedStudent = String(req.body?.filters?.student || 'all').trim();

    if (!question) {
      return res.status(400).json({ success: false, message: 'Question is required.' });
    }

    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found. Please upload data first.' });
    }

    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const students = await studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1, percentage: -1, marks: -1, studentName: 1 })
      .toArray();

    const filteredData = buildFilteredDashboardData(uploadDoc, students, analytics, selectedSubject, selectedStudent);
    const subjectName = filteredData.filters?.selectedSubject && filteredData.filters.selectedSubject !== 'all'
      ? filteredData.filters.selectedSubject
      : (uploadDoc.subjectName || 'Current Subject');
    const answer = await generateQuestionAnswer(question, filteredData.analytics, filteredData.students, subjectName);

    res.json({
      success: true,
      answer,
    });
  } catch (err) {
    console.error('[AI QUERY ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to answer the question.' });
  }
});

// GET /api/ai-insights/:uploadId
app.get('/api/ai-insights/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    const insightDoc = await aiInsightsCol.findOne({ uploadId, userId });
    if (!insightDoc) {
      return res.status(404).json({ success: false, message: 'No AI insights found for this upload. Generate insights first.' });
    }

    res.json({
      success: true,
      insights: insightDoc.insights,
      generatedAt: insightDoc.generatedAt
    });
  } catch (err) {
    console.error('[GET AI INSIGHTS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch AI insights.' });
  }
});

// ============================================================================
// Report Generation APIs
// ============================================================================

// GET /api/reports/:uploadId/pdf
app.get('/api/reports/:uploadId/pdf', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    // Fetch data
    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found.' });
    }

    const students = await studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();
    const subjectNames = getSubjectNamesFromStudents(students, analytics);
    const isMultiSubject = normalizeReportType(uploadDoc.subjectType || analytics.reportType) === 'multiple' || subjectNames.length > 0;

    // Create PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');

    doc.pipe(res);

    // Title
    doc.fontSize(22).font('Helvetica-Bold')
      .text('Student Performance Analytics Report', { align: 'center' });
    doc.moveDown(0.5);

    // Horizontal line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Subject Info
    doc.fontSize(14).font('Helvetica-Bold').text('Subject Information');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Subject: ${uploadDoc.subjectName}`);
    doc.text(`Class: ${uploadDoc.className}`);
    doc.text(`Maximum Marks: ${uploadDoc.maxMarks}`);
    doc.text(`Passing Marks: ${uploadDoc.passingMarks}`);
    doc.text(`Upload Date: ${new Date(uploadDoc.uploadDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.moveDown(0.8);

    // Analytics Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Analytics Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Students: ${analytics.totalStudents}`);
    doc.text(`Passed: ${analytics.passedStudents}`);
    doc.text(`Failed: ${analytics.failedStudents}`);
    doc.text(`Average Marks: ${analytics.averageMarks}`);
    doc.text(`Highest Marks: ${analytics.highestMarks}`);
    doc.text(`Lowest Marks: ${analytics.lowestMarks}`);
    doc.text(`Pass Percentage: ${analytics.passPercentage}%`);
    doc.text(`Fail Percentage: ${analytics.failPercentage}%`);
    doc.moveDown(0.8);

    // Student Table
    doc.fontSize(14).font('Helvetica-Bold').text('Student Details');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const colWidths = { rank: 35, rollNo: 55, name: 140, marks: 50, pct: 55, status: 45, category: 115 };
    const startX = 40;

    // Draw header background
    doc.rect(startX, tableTop, 515, 18).fill('#2c3e50');

    doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
    let xPos = startX + 4;
    doc.text('Rank', xPos, tableTop + 5, { width: colWidths.rank });
    xPos += colWidths.rank;
    doc.text('Roll No', xPos, tableTop + 5, { width: colWidths.rollNo });
    xPos += colWidths.rollNo;
    doc.text('Student Name', xPos, tableTop + 5, { width: colWidths.name });
    xPos += colWidths.name;
    doc.text('Marks', xPos, tableTop + 5, { width: colWidths.marks });
    xPos += colWidths.marks;
    doc.text('Percentage', xPos, tableTop + 5, { width: colWidths.pct });
    xPos += colWidths.pct;
    doc.text('Status', xPos, tableTop + 5, { width: colWidths.status });
    xPos += colWidths.status;
    doc.text('Category', xPos, tableTop + 5, { width: colWidths.category });

    doc.fillColor('black');
    let rowY = tableTop + 20;

    // Table rows
    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      // Check if we need a new page
      if (rowY > 750) {
        doc.addPage();
        rowY = 40;

        // Redraw header on new page
        doc.rect(startX, rowY, 515, 18).fill('#2c3e50');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
        let hxPos = startX + 4;
        doc.text('Rank', hxPos, rowY + 5, { width: colWidths.rank });
        hxPos += colWidths.rank;
        doc.text('Roll No', hxPos, rowY + 5, { width: colWidths.rollNo });
        hxPos += colWidths.rollNo;
        doc.text('Student Name', hxPos, rowY + 5, { width: colWidths.name });
        hxPos += colWidths.name;
        doc.text('Marks', hxPos, rowY + 5, { width: colWidths.marks });
        hxPos += colWidths.marks;
        doc.text('Percentage', hxPos, rowY + 5, { width: colWidths.pct });
        hxPos += colWidths.pct;
        doc.text('Status', hxPos, rowY + 5, { width: colWidths.status });
        hxPos += colWidths.status;
        doc.text('Category', hxPos, rowY + 5, { width: colWidths.category });
        doc.fillColor('black');
        rowY += 20;
      }

      // Alternate row background
      if (i % 2 === 0) {
        doc.rect(startX, rowY, 515, 16).fill('#f8f9fa');
        doc.fillColor('black');
      }

      doc.fontSize(8).font('Helvetica');
      xPos = startX + 4;
      doc.text(String(student.rank), xPos, rowY + 4, { width: colWidths.rank });
      xPos += colWidths.rank;
      doc.text(String(student.rollNo), xPos, rowY + 4, { width: colWidths.rollNo });
      xPos += colWidths.rollNo;
      doc.text(student.studentName, xPos, rowY + 4, { width: colWidths.name });
      xPos += colWidths.name;
      doc.text(String(student.marks), xPos, rowY + 4, { width: colWidths.marks });
      xPos += colWidths.marks;
      doc.text(`${student.percentage}%`, xPos, rowY + 4, { width: colWidths.pct });
      xPos += colWidths.pct;

      // Status color
      const statusColor = student.status === 'Pass' ? '#27ae60' : '#e74c3c';
      doc.fillColor(statusColor);
      doc.text(student.status, xPos, rowY + 4, { width: colWidths.status });
      xPos += colWidths.status;

      doc.fillColor('black');
      doc.text(student.category, xPos, rowY + 4, { width: colWidths.category });

      rowY += 16;
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#666666');
    doc.text(`Report generated on: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });

    doc.end();

    // Save report record
    await reportsCol.insertOne({
      uploadId,
      reportType: 'pdf',
      fileName: 'report.pdf',
      userId,
      generatedAt: new Date()
    });
  } catch (err) {
    console.error('[PDF REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF report.' });
    }
  }
});

// GET /api/reports/:uploadId/excel
app.get('/api/reports/:uploadId/excel', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    // Fetch data
    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found.' });
    }

    const students = await studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();
    const subjectNames = getSubjectNamesFromStudents(students, analytics);
    const isMultiSubject = normalizeReportType(uploadDoc.subjectType || analytics.reportType) === 'multiple' || subjectNames.length > 0;

    // Create workbook
    const workbook = xlsx.utils.book_new();

    // Sheet 1: Analytics Summary
    const summaryData = [
      ['Metric', 'Value'],
      ['Subject', uploadDoc.subjectName],
      ['Report Type', isMultiSubject ? 'Multiple Subjects' : 'Single Subject'],
      ['Class', uploadDoc.className],
      ['Maximum Marks', uploadDoc.maxMarks],
      ['Passing Marks', uploadDoc.passingMarks],
      ['Upload Date', new Date(uploadDoc.uploadDate).toLocaleDateString()],
      ['', ''],
      ['Total Students', analytics.totalStudents],
      ['Passed Students', analytics.passedStudents],
      ['Failed Students', analytics.failedStudents],
      ['Average Marks', analytics.averageMarks],
      ['Highest Marks', analytics.highestMarks],
      ['Lowest Marks', analytics.lowestMarks],
      ['Pass Percentage', `${analytics.passPercentage}%`],
      ['Fail Percentage', `${analytics.failPercentage}%`],
      ['', ''],
      ['Marks Distribution', ''],
      ['0-35%', analytics.marksDistribution.range_0_35],
      ['36-50%', analytics.marksDistribution.range_36_50],
      ['51-70%', analytics.marksDistribution.range_51_70],
      ['71-85%', analytics.marksDistribution.range_71_85],
      ['86-100%', analytics.marksDistribution.range_86_100]
    ];
    if (subjectNames.length && Array.isArray(analytics.subjectSummary)) {
      summaryData.push(['', '']);
      summaryData.push(['Subject Wise Analysis', '']);
      summaryData.push(['Subject', 'Average Marks', 'Highest Marks', 'Lowest Marks']);
      for (const subject of analytics.subjectSummary) {
        summaryData.push([
          subject.subjectName,
          subject.averageMarks,
          subject.highestMarks,
          subject.lowestMarks,
        ]);
      }
    }
    const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Analytics Summary');

    // Sheet 2: Student Data
    const studentData = [
      [
        'Rank',
        'Roll No',
        'Student Name',
        ...subjectNames,
        isMultiSubject ? 'Average Marks' : 'Marks',
        'Percentage',
        'Status',
        'Category'
      ]
    ];
    for (const s of students) {
      const subjectMarks = extractSubjectMarks(s);
      studentData.push([
        s.rank,
        s.rollNo,
        s.studentName,
        ...subjectNames.map((subjectName) => subjectMarks[subjectName] ?? ''),
        s.marks,
        s.percentage,
        s.status,
        s.category
      ]);
    }
    const studentSheet = xlsx.utils.aoa_to_sheet(studentData);
    studentSheet['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 25 },
      ...subjectNames.map(() => ({ wch: 12 })),
      { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 20 }
    ];
    xlsx.utils.book_append_sheet(workbook, studentSheet, 'Student Data');

    // Generate buffer and send
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.send(Buffer.from(excelBuffer));

    // Save report record
    await reportsCol.insertOne({
      uploadId,
      reportType: 'excel',
      fileName: 'report.xlsx',
      userId,
      generatedAt: new Date()
    });
  } catch (err) {
    console.error('[EXCEL REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate Excel report.' });
    }
  }
});

// GET /api/reports/:uploadId/csv
app.get('/api/reports/:uploadId/csv', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();

    // Fetch data
    const uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const students = await studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'No student data found.' });
    }

    const subjectNames = getSubjectNamesFromStudents(students);
    const isMultiSubject = normalizeReportType(uploadDoc.subjectType) === 'multiple' || subjectNames.length > 0;

    // Build CSV content
    const headers = [
      'Rank',
      'Roll No',
      'Student Name',
      ...subjectNames,
      isMultiSubject ? 'Average Marks' : 'Marks',
      'Percentage',
      'Status',
      'Category'
    ];
    const csvRows = [headers.map(escapeCsvValue).join(',')];

    for (const s of students) {
      const subjectMarks = extractSubjectMarks(s);
      const row = [
        s.rank,
        s.rollNo,
        s.studentName,
        ...subjectNames.map((subjectName) => subjectMarks[subjectName] ?? ''),
        s.marks,
        s.percentage,
        s.status,
        s.category
      ];
      csvRows.push(row.map(escapeCsvValue).join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=report.csv');
    res.send(csvContent);

    // Save report record
    await reportsCol.insertOne({
      uploadId,
      reportType: 'csv',
      fileName: 'report.csv',
      userId,
      generatedAt: new Date()
    });
  } catch (err) {
    console.error('[CSV REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate CSV report.' });
    }
  }
});

// ============================================================================
// Upload History APIs
// ============================================================================

// GET /api/uploads
app.get('/api/uploads', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId.toString();

    // Fetch uploads sorted by date desc
    const uploads = await uploadsCol
      .find({ userId })
      .sort({ uploadDate: -1 })
      .toArray();

    // Join with analytics for each upload
    const uploadsWithAnalytics = await Promise.all(
      uploads.map(async (uploadDoc) => {
        const uploadIdStr = uploadDoc._id.toString();
        const analytics = await analyticsCol.findOne({ uploadId: uploadIdStr, userId });
        return {
          ...uploadDoc,
          analytics: analytics ? {
            totalStudents: analytics.totalStudents,
            passedStudents: analytics.passedStudents,
            failedStudents: analytics.failedStudents,
            averageMarks: analytics.averageMarks,
            passPercentage: analytics.passPercentage,
            highestMarks: analytics.highestMarks,
            lowestMarks: analytics.lowestMarks
          } : null
        };
      })
    );

    res.json({
      success: true,
      uploads: uploadsWithAnalytics
    });
  } catch (err) {
    console.error('[UPLOADS LIST ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch uploads.' });
  }
});

// GET /api/uploads/:id
app.get('/api/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId.toString();

    let uploadDoc;
    try {
      uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(id), userId });
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const uploadIdStr = uploadDoc._id.toString();
    const analytics = await analyticsCol.findOne({ uploadId: uploadIdStr, userId });

    res.json({
      success: true,
      upload: uploadDoc,
      analytics
    });
  } catch (err) {
    console.error('[UPLOAD DETAIL ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch upload details.' });
  }
});

// DELETE /api/uploads/:id
app.delete('/api/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId.toString();

    let uploadDoc;
    try {
      uploadDoc = await uploadsCol.findOne({ _id: new ObjectId(id), userId });
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const uploadIdStr = uploadDoc._id.toString();

    // Delete all related data
    await Promise.all([
      studentsCol.deleteMany({ uploadId: uploadIdStr }),
      analyticsCol.deleteMany({ uploadId: uploadIdStr }),
      aiInsightsCol.deleteMany({ uploadId: uploadIdStr }),
      reportsCol.deleteMany({ uploadId: uploadIdStr }),
      uploadsCol.deleteOne({ _id: new ObjectId(id) })
    ]);

    // Also delete the subject if it was created for this upload
    if (uploadDoc.subjectId) {
      try {
        await subjectsCol.deleteOne({ _id: new ObjectId(uploadDoc.subjectId) });
      } catch (e) {
        // Non-critical, ignore
      }
    }

    res.json({
      success: true,
      message: 'Upload deleted successfully'
    });
  } catch (err) {
    console.error('[DELETE UPLOAD ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to delete upload.' });
  }
});

// ============================================================================
// Catch-all Route - Serve frontend (Express 5 syntax)
// ============================================================================
app.get('/{*path}', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ success: false, message: 'Frontend not found.' });
  }
});

// ============================================================================
// Global Error Handler
// ============================================================================
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File size exceeds the maximum limit of 10MB.' });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }

  // Handle multer file filter errors
  if (err.message && err.message.includes('Invalid file format')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error. Please try again later.'
  });
});

// ============================================================================
// Server Startup
// ============================================================================
async function startServer() {
  let server;

  try {
    console.log('============================================================');
    console.log('  Student Performance Analytics System');
    console.log('============================================================');
    if (await isHttpServerAlreadyRunning(PORT)) {
      throw new Error(`The backend is already running at http://localhost:${PORT}. Keep using that window, or stop it before starting another server.`);
    }

    await ensurePortAvailable(PORT);
    await ensureDatabaseReady();

    await new Promise((resolve, reject) => {
      server = app.listen(PORT, () => {
        console.log('------------------------------------------------------------');
        console.log(`[SERVER] Running on http://localhost:${PORT}`);
        console.log(`[SERVER] Database: ${MONGODB_DB}`);
        console.log(`[SERVER] Frontend: ${frontendPath}`);
        console.log(`[SERVER] Groq AI: ${GROQ_API_KEY ? 'Configured' : 'Not configured (fallback mode)'}`);
        console.log('------------------------------------------------------------');
        console.log('[SERVER] Ready to accept requests');
        resolve();
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${PORT} is already in use. Open http://localhost:${PORT} or stop the existing server before starting another one.`));
          return;
        }

        reject(error);
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n[SHUTDOWN] ${signal} received. Closing connections...`);
      try {
        if (server) {
          await new Promise((resolve) => server.close(resolve));
        }
        if (mongoClient) {
          await mongoClient.close();
        }
        console.log('[SHUTDOWN] MongoDB connection closed');
      } catch (e) {
        console.error('[SHUTDOWN] Error closing MongoDB:', e.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (err) {
    console.error(`[STARTUP ERROR] ${err.message || 'Failed to start server.'}`);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.app = app;
module.exports.startServer = startServer;
module.exports.ensureDatabaseReady = ensureDatabaseReady;
