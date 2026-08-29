// ============================================================================
// src/routes/uploads.js
// Upload history: list, fetch one, and delete an upload together with all
// of its student, analytics, insight and report records.
// ============================================================================

const express = require('express');

const { ObjectId } = require('mongodb');

const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
// GET /api/uploads
router.get('/api/uploads', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId.toString();

    // Pagination. A teacher with hundreds of uploads should not receive them
    // all in one response, so the page size is capped. Callers that send no
    // parameters get the most recent DEFAULT_LIMIT uploads.
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 200;

    const requestedPage = parseInt(req.query.page, 10);
    const requestedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const total = await dbState.uploadsCol.countDocuments({ userId });

    const uploads = await dbState.uploadsCol
      .find({ userId })
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Fetch the analytics for this page in one query rather than one per
    // upload -- the previous per-upload lookup was an N+1 round trip.
    const uploadIds = uploads.map((uploadDoc) => uploadDoc._id.toString());
    const analyticsDocs = uploadIds.length
      ? await dbState.analyticsCol.find({ uploadId: { $in: uploadIds }, userId }).toArray()
      : [];
    const analyticsByUploadId = new Map(analyticsDocs.map((doc) => [doc.uploadId, doc]));

    const uploadsWithAnalytics = uploads.map((uploadDoc) => {
      const analytics = analyticsByUploadId.get(uploadDoc._id.toString());
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
    });

    res.json({
      success: true,
      uploads: uploadsWithAnalytics,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: skip + uploads.length < total,
      }
    });
  } catch (err) {
    console.error('[UPLOADS LIST ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch uploads.' });
  }
});

// GET /api/uploads/:id
router.get('/api/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId.toString();

    let uploadDoc;
    try {
      uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(id), userId });
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const uploadIdStr = uploadDoc._id.toString();
    const analytics = await dbState.analyticsCol.findOne({ uploadId: uploadIdStr, userId });

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
router.delete('/api/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId.toString();

    let uploadDoc;
    try {
      uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(id), userId });
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const uploadIdStr = uploadDoc._id.toString();

    // Delete all related data
    await Promise.all([
      dbState.studentsCol.deleteMany({ uploadId: uploadIdStr }),
      dbState.analyticsCol.deleteMany({ uploadId: uploadIdStr }),
      dbState.aiInsightsCol.deleteMany({ uploadId: uploadIdStr }),
      dbState.reportsCol.deleteMany({ uploadId: uploadIdStr }),
      dbState.uploadsCol.deleteOne({ _id: new ObjectId(id) })
    ]);

    // Also delete the subject if it was created for this upload
    if (uploadDoc.subjectId) {
      try {
        await dbState.subjectsCol.deleteOne({ _id: new ObjectId(uploadDoc.subjectId) });
      } catch {
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
module.exports = router;