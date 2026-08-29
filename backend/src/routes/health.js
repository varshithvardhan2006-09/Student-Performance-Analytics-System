// ============================================================================
// src/routes/health.js
// GET /api/health -- unauthenticated liveness probe reporting database,
// demo-account and AI configuration status.
// ============================================================================

const express = require('express');

const { dbState } = require('../db/connection');

const router = express.Router();
// ============================================================================
// Health Check Route (public)
// ============================================================================
router.get('/api/health', async (req, res) => {
  let databaseStatus = 'disconnected';
  let statusCode = 200;

  try {
    await dbState.db.command({ ping: 1 });
    databaseStatus = 'connected';
  } catch {
    statusCode = 503;
  }

  res.status(statusCode).json({
    success: true,
    message: 'Student Performance Analytics System API is running',
    timestamp: new Date().toISOString(),
    database: databaseStatus
  });
});

// ============================================================================
// Auth Routes (public)
// ============================================================================
module.exports = router;