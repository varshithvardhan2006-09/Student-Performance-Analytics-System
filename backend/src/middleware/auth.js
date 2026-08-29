// ============================================================================
// src/middleware/auth.js
// Verifies the JWT on every protected route and attaches the caller's
// identity to the request.
// ============================================================================

const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');
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

module.exports = {
  authMiddleware,
};
