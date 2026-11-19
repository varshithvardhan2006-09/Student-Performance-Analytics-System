// ============================================================================
// src/routes/upload.js
// POST /api/upload -- the ingestion pipeline. Validates the request, checks
// each file's real format, parses it, validates every record, computes
// analytics and persists the result.
// ============================================================================

const express = require('express');

const path = require('path');

const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const { uploadRateLimiter } = require('../middleware/rateLimiter');
const { upload } = require('../middleware/upload');
const { calculateAnalytics, processStudents } = require('../services/analytics');
const { normalizeRecords, parseCSV, parseExcel, parsePDF } = require('../services/fileParser');
const { validateRecords } = require('../services/validation');
const { detectRecordsReportType, normalizeReportType } = require('../utils/normalizers');
const { getFileSignatureError } = require('../utils/validators');

const router = express.Router();

// Undo a partly saved upload. Failures here are logged, not rethrown, so the
// original error is the one reported to the client.
async function rollbackUpload({ subjectId, uploadId, uploadObjectId }) {
  try {
    if (uploadId) {
      await Promise.all([
        dbState.studentsCol.deleteMany({ uploadId }),
        dbState.analyticsCol.deleteMany({ uploadId }),
        dbState.uploadsCol.deleteOne({ _id: uploadObjectId }),
      ]);
    }
    if (subjectId) {
      await dbState.subjectsCol.deleteOne({ _id: subjectId });
    }
  } catch (cleanupErr) {
    console.error('[UPLOAD ROLLBACK ERROR]', cleanupErr.message);
  }
}
// POST /api/upload
router.post('/api/upload', authMiddleware, uploadRateLimiter, upload.array('file'), async (req, res) => {
  try {
    const { subjectName, className, maxMarks, passingMarks, subjectType } = req.body;
    const userId = req.userId.toString();
    const requestedReportType = normalizeReportType(subjectType);
    let reportType = requestedReportType;

    // Step 1: Validate subject fields
    if (!subjectName || !className || !maxMarks || !passingMarks) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: subjectName, className, maxMarks, passingMarks, subjectType.'
      });
    }

    const maxMarksNum = parseFloat(maxMarks);
    const passingMarksNum = parseFloat(passingMarks);

    if (isNaN(maxMarksNum) || maxMarksNum <= 0) {
      return res.status(400).json({ success: false, message: 'Maximum marks must be a positive number.' });
    }

    if (isNaN(passingMarksNum) || passingMarksNum <= 0) {
      return res.status(400).json({ success: false, message: 'Passing marks must be a positive number.' });
    }

    if (passingMarksNum > maxMarksNum) {
      return res.status(400).json({ success: false, message: 'Passing marks cannot exceed maximum marks.' });
    }

    // Step 2: Validate files
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ success: false, message: 'Please upload at least one file.' });
    }

    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.pdf'];
    const allRecords = [];

    for (const currentFile of uploadedFiles) {
      const fileExtension = path.extname(currentFile.originalname).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file format in ${currentFile.originalname}. Allowed formats: CSV, XLSX, XLS, PDF.`
        });
      }

      const signatureError = getFileSignatureError(currentFile);
      if (signatureError) {
        return res.status(400).json({
          success: false,
          message: signatureError
        });
      }

      let rawRecords = [];
      const buffer = currentFile.buffer;

      try {
        if (fileExtension === '.csv') {
          rawRecords = await parseCSV(buffer);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
          rawRecords = parseExcel(buffer);
        } else if (fileExtension === '.pdf') {
          rawRecords = await parsePDF(buffer, currentFile.originalname);
        }
      } catch (parseErr) {
        console.error('[FILE PARSE ERROR]', parseErr);
        return res.status(400).json({
          success: false,
          message: `Failed to parse ${currentFile.originalname}: ${parseErr.message}`
        });
      }

      const records = normalizeRecords(rawRecords, reportType);
      const fileReportType = detectRecordsReportType(records, reportType);
      if (fileReportType === 'multiple') {
        reportType = 'multiple';
      }

      const validation = validateRecords(records, maxMarksNum, fileReportType);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `File validation failed for ${currentFile.originalname}.`,
          errors: validation.errors
        });
      }

      allRecords.push(...records);
    }

    // Step 3: Validate merged records
    const combinedValidation = validateRecords(allRecords, maxMarksNum, reportType);
    if (!combinedValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Combined file validation failed.',
        errors: combinedValidation.errors
      });
    }

    // Step 4: Process students (calculate percentage, status, category, rank)
    const students = processStudents(allRecords, maxMarksNum, passingMarksNum, reportType);

    // Step 5: Calculate analytics
    const analyticsData = calculateAnalytics(students, maxMarksNum, reportType);

    // Step 6: Save to MongoDB
    const now = new Date();
    const fileNames = uploadedFiles.map((file) => file.originalname);
    const totalFileSize = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    // MongoDB (standalone) has no multi-document transaction, so remember what
    // was written and delete it again if a later insert fails.
    const written = {};
    try {
      // Insert subject
      const subjectResult = await dbState.subjectsCol.insertOne({
        name: subjectName.trim(),
        className: className.trim(),
        maxMarks: maxMarksNum,
        passingMarks: passingMarksNum,
        subjectType: reportType,
        userId,
        createdAt: now
      });
      const subjectId = subjectResult.insertedId.toString();
      written.subjectId = subjectResult.insertedId;

      // Insert upload
      const uploadResult = await dbState.uploadsCol.insertOne({
        subjectId,
        subjectName: subjectName.trim(),
        className: className.trim(),
        maxMarks: maxMarksNum,
        passingMarks: passingMarksNum,
        subjectType: reportType,
        fileName: fileNames[0],
        fileNames,
        fileCount: fileNames.length,
        originalName: fileNames[0],
        fileSize: totalFileSize,
        studentCount: students.length,
        userId,
        uploadDate: now,
        status: 'completed'
      });
      const uploadId = uploadResult.insertedId.toString();
      written.uploadId = uploadId;
      written.uploadObjectId = uploadResult.insertedId;

      // Insert students
      const studentDocs = students.map(student => ({
        uploadId,
        rollNo: student.rollNo,
        studentName: student.studentName,
        marks: student.marks,
        percentage: student.percentage,
        status: student.status,
        category: student.category,
        rank: student.rank,
        subjectMarks: student.subjectMarks || null,
        subjectType: reportType,
        userId
      }));
      await dbState.studentsCol.insertMany(studentDocs);

      // Insert analytics
      await dbState.analyticsCol.insertOne({
        uploadId,
        ...analyticsData,
        userId,
        calculatedAt: now
      });

      // Step 7: Return response
      return res.status(201).json({
        success: true,
        uploadId,
        upload: {
          _id: uploadId,
          subjectName: subjectName.trim(),
          className: className.trim(),
          maxMarks: maxMarksNum,
          passingMarks: passingMarksNum,
          subjectType: reportType,
          fileName: fileNames[0],
          fileNames,
          fileCount: fileNames.length,
          studentCount: students.length,
          uploadDate: now,
          status: 'completed',
        },
        analytics: analyticsData,
        studentCount: students.length,
        fileCount: fileNames.length,
        subjectType: reportType,
        message: 'File processed successfully'
      });
    } catch (saveErr) {
      await rollbackUpload(written);
      throw saveErr;
    }

  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    res.status(500).json({ success: false, message: 'An error occurred while processing the file.' });
  }
});

// ============================================================================
// Analytics APIs
// ============================================================================
module.exports = router;