// ============================================================================
// src/routes/analytics.js
// Analytics endpoints: the stored figures for an upload, and a variant
// recomputed for a chosen subject or student.
// ============================================================================

const express = require('express');

const { ObjectId } = require('mongodb');

const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const { buildFilteredDashboardData } = require('../services/analytics');
const { isValidObjectId } = require('../utils/validators');

const router = express.Router();
// GET /api/analytics/:uploadId/filtered
router.get('/api/analytics/:uploadId/filtered', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }
    const { subject = 'all', student = 'all' } = req.query;

    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found for this upload.' });
    }

    const students = await dbState.studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
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
router.get('/api/analytics/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    // Fetch analytics
    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found for this upload.' });
    }

    // Fetch upload info
    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });

    // Fetch subject info
    let subject = null;
    if (uploadDoc && uploadDoc.subjectId) {
      subject = await dbState.subjectsCol.findOne({ _id: new ObjectId(uploadDoc.subjectId) });
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
module.exports = router;