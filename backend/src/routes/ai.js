// ============================================================================
// src/routes/ai.js
// AI endpoints: generate and fetch insights for an upload, and answer a
// free-text question about it.
// ============================================================================

const express = require('express');

const Groq = require('groq-sdk');
const { ObjectId } = require('mongodb');

const { GROQ_API_KEY } = require('../config/env');
const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const { generateFallbackInsights, generateQuestionAnswer, parseAIResponse } = require('../services/aiService');const { isValidObjectId } = require('../utils/validators');

const { WEAK_THRESHOLD_PERCENT } = require('../services/analytics');

const router = express.Router();

function countWeakStudents(uploadId, userId) {
  return dbState.studentsCol.countDocuments({
    uploadId,
    userId,
    percentage: { $lt: WEAK_THRESHOLD_PERCENT },
  });
}
// POST /api/ai-insights/:uploadId
router.post('/api/ai-insights/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    // Fetch analytics
    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found. Please upload data first.' });
    }

    // Fetch upload for subject info
    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const subjectName = uploadDoc.subjectName || 'Unknown Subject';
    let insights;

    if (GROQ_API_KEY) {
      // Use Groq AI
      try {
        const groq = new Groq({ apiKey: GROQ_API_KEY });

        const weakStudentCount = await dbState.studentsCol.countDocuments({
          uploadId,
          userId,
          percentage: { $lt: WEAK_THRESHOLD_PERCENT },
        });

        const userPrompt = `Analyze the following student performance data for ${subjectName}:

- Total Students: ${analytics.totalStudents}
- Passed: ${analytics.passedStudents}
- Failed: ${analytics.failedStudents}
- Average Marks: ${analytics.averageMarks}
- Highest Marks: ${analytics.highestMarks}
- Lowest Marks: ${analytics.lowestMarks}
- Pass Percentage: ${analytics.passPercentage}%
- Fail Percentage: ${analytics.failPercentage}%
- Weak Students (scoring below ${WEAK_THRESHOLD_PERCENT}%): ${weakStudentCount}

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
        insights = generateFallbackInsights(analytics, subjectName, await countWeakStudents(uploadId, userId));
      }
    } else {
      // No API key - use fallback
      insights = generateFallbackInsights(analytics, subjectName, await countWeakStudents(uploadId, userId));
    }

    // Store insights in DB (upsert)
    const now = new Date();
    await dbState.aiInsightsCol.updateOne(
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
router.post('/api/ai-query/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }
    const question = String(req.body?.question || '').trim();

    if (!question) {
      return res.status(400).json({ success: false, message: 'Question is required.' });
    }

    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found. Please upload data first.' });
    }

    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const students = await dbState.studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1, percentage: -1, marks: -1, studentName: 1 })
      .toArray();

    // A question is about the upload as a whole, so it is answered against the
    // whole upload -- never narrowed by whatever filter the dashboard happens
    // to have applied, which would make "how many students failed?" report on
    // a single selected student. To ask about one student, name them in the
    // question ("how did Varshith do?"): the engine resolves names and roll
    // numbers directly.
    const subjectName = uploadDoc.subjectName || 'Current Subject';
    const answer = await generateQuestionAnswer(question, analytics, students, subjectName);

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
router.get('/api/ai-insights/:uploadId', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    const insightDoc = await dbState.aiInsightsCol.findOne({ uploadId, userId });
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
module.exports = router;