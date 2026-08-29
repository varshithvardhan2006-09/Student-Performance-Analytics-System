// ============================================================================
// src/config/env.js
// Loads the .env file and exposes every runtime configuration value as a
// frozen constant. Requiring this module is what makes process.env
// available to the rest of the app, so it is imported first.
// ============================================================================

const fs = require('fs');
const path = require('path');
// ============================================================================
// Custom .env Loader
// ============================================================================
function loadEnv() {
  try {
    // backend/src/config/env.js -> backend/.env
    const envPath = path.join(__dirname, '..', '..', '.env');
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

// Load .env before any configuration constant below is evaluated.
loadEnv();

// ============================================================================
// Configuration
// ============================================================================
const PORT = parseInt(process.env.PORT, 10) || 3000;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

const MONGODB_DB = process.env.MONGODB_DB || 'student_analytics';

const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || 'users';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'local-development-only-saps-jwt-secret-change-before-deploy');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const JSON_LIMIT = process.env.JSON_LIMIT || '2mb';

const MONGO_CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS || '5000', 10),
};

const DEFAULT_ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const ALLOWED_ORIGINS = new Set(
  [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map((origin) => String(origin || '').trim().replace(/\/$/, ''))
    .filter(Boolean)
);

const DEMO_TEACHER = {
  fullName: process.env.DEMO_TEACHER_NAME || 'Demo Teacher',
  email: process.env.DEMO_TEACHER_EMAIL || 'demo.teacher@saps.local',
  password: process.env.DEMO_TEACHER_PASSWORD || 'Demo@1234',
};

function validateRuntimeConfig() {
  const weakSecrets = new Set(['default_jwt_secret_change_me', 'change_me', 'secret', 'jwt_secret']);
  if (!JWT_SECRET || JWT_SECRET.length < 32 || weakSecrets.has(JWT_SECRET)) {
    const message = 'JWT_SECRET must be set to a strong value with at least 32 characters.';
    if (IS_PRODUCTION) {
      throw new Error(message);
    }
    console.warn(`[ENV WARNING] ${message} Using a local development-only fallback.`);
  }
}

validateRuntimeConfig();

module.exports = {
  PORT,
  MONGODB_URI,
  MONGODB_DB,
  USERS_COLLECTION,
  JWT_SECRET,
  GROQ_API_KEY,
  JSON_LIMIT,
  MONGO_CLIENT_OPTIONS,
  ALLOWED_ORIGINS,
  DEMO_TEACHER,
};
