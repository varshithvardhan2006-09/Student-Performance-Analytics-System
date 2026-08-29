// ============================================================================
// src/routes/students.js
// GET /api/students/:uploadId -- the paginated, searchable student table.
// ============================================================================

const express = require('express');

const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
// GET /api/students/:uploadId
router.get('/api/students/:uploadId', authMiddleware, async (req, res) => {
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
    const total = await dbState.studentsCol.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    // Get students with pagination
    const students = await dbState.studentsCol
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
module.exports = router;