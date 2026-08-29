// ============================================================================
// src/middleware/cors.js
//
// Origin whitelist (never a wildcard). The list is built entirely from
// configuration -- see ALLOWED_ORIGINS / FRONTEND_URL in src/config/env.js.
// ============================================================================

const { ALLOWED_ORIGINS, PORT } = require('../config/env');

function corsMiddleware(req, res, next) {
  const requestOrigin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!requestOrigin || ALLOWED_ORIGINS.has(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin || `http://localhost:${PORT}`);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'false');
  if (req.method === 'OPTIONS') {
    if (requestOrigin && !ALLOWED_ORIGINS.has(requestOrigin)) {
      return res.sendStatus(403);
    }
    return res.sendStatus(200);
  }
  next();
}

module.exports = { corsMiddleware };
