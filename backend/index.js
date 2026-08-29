// ============================================================================
// Student Performance Analytics System - Backend Server (entry point)
// ============================================================================
// Tech: Express 5, MongoDB Native Driver, JWT, Multer, XLSX, CSV, PDF, Groq AI
//
// This file is deliberately thin: it wires modules together and starts the
// server. All behaviour lives under src/ --
//   src/config/     environment loading + validated runtime configuration
//   src/db/         MongoDB connection, index creation, demo-user seeding
//   src/middleware/ security headers, CORS, rate limiting, JWT auth, multer
//   src/services/   file parsing, record validation, analytics, Groq AI
//   src/routes/     one Express Router per resource (18 endpoints total)
//   src/utils/      pure helpers (validators, normalizers)
// ============================================================================

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Requiring the config module loads .env and validates the runtime config.
const { PORT, MONGODB_DB, GROQ_API_KEY, JSON_LIMIT } = require('./src/config/env');
const { dbState, ensureDatabaseReady, ensurePortAvailable, isHttpServerAlreadyRunning } = require('./src/db/connection');
const { securityHeaders } = require('./src/middleware/security');
const { corsMiddleware } = require('./src/middleware/cors');

const healthRoutes = require('./src/routes/health');
const authRoutes = require('./src/routes/auth');
const uploadRoutes = require('./src/routes/upload');
const analyticsRoutes = require('./src/routes/analytics');
const studentsRoutes = require('./src/routes/students');
const aiRoutes = require('./src/routes/ai');
const reportsRoutes = require('./src/routes/reports');
const uploadsRoutes = require('./src/routes/uploads');

// ============================================================================
// Express App Setup
// ============================================================================
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// Express 5 leaves req.body undefined when no body parser matched the request
// (a text/plain body, or no Content-Type at all). Routes destructure it, so
// default it to an empty object -- each route's own required-field check then
// answers with a 400 instead of throwing a TypeError.
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) {
    req.body = {};
  }
  next();
});

app.use(securityHeaders);
app.use(corsMiddleware);

// Serve static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Every route except /api/health waits for MongoDB to be ready.
app.use(async (req, res, next) => {
  if (req.path === '/api/health') {
    return next();
  }
  try {
    await ensureDatabaseReady();
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// API Routes - 18 endpoints. Mount order matches the original file so that
// more specific paths still shadow the generic ones.
// ============================================================================
app.use(healthRoutes);
app.use(authRoutes);
app.use(uploadRoutes);
app.use(analyticsRoutes);
app.use(studentsRoutes);
app.use(aiRoutes);
app.use(reportsRoutes);
app.use(uploadsRoutes);

// ============================================================================
// Unmatched API routes
// ============================================================================
// Any /api path no router claimed is an API error, not a page request. Without
// this it would fall through to the SPA catch-all below and return index.html
// with status 200, which the client would treat as a successful response.
app.all('/api/{*path}', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Unknown API endpoint: ${req.method} ${req.path}`,
  });
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
  // Expected client mistakes (a too-large file, a malformed body) are logged as
  // one-line warnings; only genuinely unexpected failures get a full stack, so
  // real problems stay visible in the log instead of drowning in routine 4xx.
  const isClientError = err instanceof multer.MulterError
    || err.type === 'entity.too.large'
    || err.type === 'entity.parse.failed'
    || (err instanceof SyntaxError && 'body' in err)
    || (err.message && err.message.includes('Invalid file format'));

  if (isClientError) {
    console.warn(`[CLIENT ERROR] ${req.method} ${req.path} - ${err.message}`);
  } else {
    console.error('[GLOBAL ERROR]', err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File size exceeds the maximum limit of 10MB.' });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }

  if (err.message && err.message.includes('Invalid file format')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // A body larger than JSON_LIMIT, or one containing malformed JSON, is a
  // client error. Report it as such so callers can tell the difference between
  // "you sent something wrong" and "the server broke".
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: `Request body is too large. The maximum accepted size is ${JSON_LIMIT}.`,
    });
  }

  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({
      success: false,
      message: 'Request body is not valid JSON.',
    });
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
        if (dbState.mongoClient) {
          await dbState.mongoClient.close();
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
