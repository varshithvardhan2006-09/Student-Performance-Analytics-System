// ============================================================================
// src/routes/auth.js
// Authentication and profile endpoints: signup, login, profile, stats.
// ============================================================================

const express = require('express');
const { normalizeRole } = require('../utils/normalizers');

const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');
const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { escapeRegExp, isValidEmail, normalizeEmail } = require('../utils/validators');

const router = express.Router();
// POST /api/signup
router.post('/api/signup', authRateLimiter, async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    // Validate required fields (and that they are plain strings, not objects)
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (![fullName, email, password, confirmPassword].every((value) => typeof value === 'string')) {
      return res.status(400).json({ success: false, message: 'All fields must be text.' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    // bcrypt only uses the first 72 bytes, so refuse longer passwords outright.
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Password must be at most 72 bytes long.' });
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
    await dbState.usersCol.insertOne({
      fullName: fullName.trim(),
      email: email.trim(),
      emailKey,
      passwordHash,
      role: normalizeRole('teacher'),
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
router.post('/api/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password must be text.' });
    }

    // Find user
    const emailKey = normalizeEmail(email);
    const user = await dbState.usersCol.findOne({
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
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
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
router.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await dbState.usersCol.findOne(
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
router.get('/api/profile/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId.toString();
    const totalUploads = await dbState.uploadsCol.countDocuments({ userId });
    const totalReports = await dbState.reportsCol.countDocuments({ userId });

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
module.exports = router;