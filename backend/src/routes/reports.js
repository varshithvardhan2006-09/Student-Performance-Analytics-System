// ============================================================================
// src/routes/reports.js
// Report downloads: PDF, Excel and CSV exports of an upload, each recorded
// in the reports collection.
// ============================================================================

const express = require('express');

const { ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');
const xlsx = require('xlsx');

const { dbState } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const { extractSubjectMarks, getSubjectNamesFromStudents, normalizeReportType } = require('../utils/normalizers');
const { escapeCsvValue, isValidObjectId } = require('../utils/validators');

const router = express.Router();

// Record the download before streaming it, so a dropped connection cannot
// leave a delivered report with no history entry.
async function logReport(uploadId, userId, reportType, fileName) {
  await dbState.reportsCol.insertOne({
    uploadId,
    reportType,
    fileName,
    userId,
    generatedAt: new Date()
  });
}
// GET /api/reports/:uploadId/pdf
router.get('/api/reports/:uploadId/pdf', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    // Fetch data
    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found.' });
    }

    const students = await dbState.studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();

    await logReport(uploadId, userId, 'pdf', 'report.pdf');

    // Create PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');

    doc.pipe(res);

    // Title
    doc.fontSize(22).font('Helvetica-Bold')
      .text('Student Performance Analytics Report', { align: 'center' });
    doc.moveDown(0.5);

    // Horizontal line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Subject Info
    doc.fontSize(14).font('Helvetica-Bold').text('Subject Information');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Subject: ${uploadDoc.subjectName}`);
    doc.text(`Class: ${uploadDoc.className}`);
    doc.text(`Maximum Marks: ${uploadDoc.maxMarks}`);
    doc.text(`Passing Marks: ${uploadDoc.passingMarks}`);
    doc.text(`Upload Date: ${new Date(uploadDoc.uploadDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.moveDown(0.8);

    // Analytics Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Analytics Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Students: ${analytics.totalStudents}`);
    doc.text(`Passed: ${analytics.passedStudents}`);
    doc.text(`Failed: ${analytics.failedStudents}`);
    doc.text(`Average Marks: ${analytics.averageMarks}`);
    doc.text(`Highest Marks: ${analytics.highestMarks}`);
    doc.text(`Lowest Marks: ${analytics.lowestMarks}`);
    doc.text(`Pass Percentage: ${analytics.passPercentage}%`);
    doc.text(`Fail Percentage: ${analytics.failPercentage}%`);
    doc.moveDown(0.8);

    // Student Table
    doc.fontSize(14).font('Helvetica-Bold').text('Student Details');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const colWidths = { rank: 35, rollNo: 55, name: 140, marks: 50, pct: 55, status: 45, category: 115 };
    const startX = 40;

    // Draw header background
    doc.rect(startX, tableTop, 515, 18).fill('#2c3e50');

    doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
    let xPos = startX + 4;
    doc.text('Rank', xPos, tableTop + 5, { width: colWidths.rank });
    xPos += colWidths.rank;
    doc.text('Roll No', xPos, tableTop + 5, { width: colWidths.rollNo });
    xPos += colWidths.rollNo;
    doc.text('Student Name', xPos, tableTop + 5, { width: colWidths.name });
    xPos += colWidths.name;
    doc.text('Marks', xPos, tableTop + 5, { width: colWidths.marks });
    xPos += colWidths.marks;
    doc.text('Percentage', xPos, tableTop + 5, { width: colWidths.pct });
    xPos += colWidths.pct;
    doc.text('Status', xPos, tableTop + 5, { width: colWidths.status });
    xPos += colWidths.status;
    doc.text('Category', xPos, tableTop + 5, { width: colWidths.category });

    doc.fillColor('black');
    let rowY = tableTop + 20;

    // Table rows
    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      // Check if we need a new page
      if (rowY > 750) {
        doc.addPage();
        rowY = 40;

        // Redraw header on new page
        doc.rect(startX, rowY, 515, 18).fill('#2c3e50');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
        let hxPos = startX + 4;
        doc.text('Rank', hxPos, rowY + 5, { width: colWidths.rank });
        hxPos += colWidths.rank;
        doc.text('Roll No', hxPos, rowY + 5, { width: colWidths.rollNo });
        hxPos += colWidths.rollNo;
        doc.text('Student Name', hxPos, rowY + 5, { width: colWidths.name });
        hxPos += colWidths.name;
        doc.text('Marks', hxPos, rowY + 5, { width: colWidths.marks });
        hxPos += colWidths.marks;
        doc.text('Percentage', hxPos, rowY + 5, { width: colWidths.pct });
        hxPos += colWidths.pct;
        doc.text('Status', hxPos, rowY + 5, { width: colWidths.status });
        hxPos += colWidths.status;
        doc.text('Category', hxPos, rowY + 5, { width: colWidths.category });
        doc.fillColor('black');
        rowY += 20;
      }

      // Alternate row background
      if (i % 2 === 0) {
        doc.rect(startX, rowY, 515, 16).fill('#f8f9fa');
        doc.fillColor('black');
      }

      doc.fontSize(8).font('Helvetica');
      xPos = startX + 4;
      doc.text(String(student.rank), xPos, rowY + 4, { width: colWidths.rank });
      xPos += colWidths.rank;
      doc.text(String(student.rollNo), xPos, rowY + 4, { width: colWidths.rollNo });
      xPos += colWidths.rollNo;
      doc.text(student.studentName, xPos, rowY + 4, { width: colWidths.name });
      xPos += colWidths.name;
      doc.text(String(student.marks), xPos, rowY + 4, { width: colWidths.marks });
      xPos += colWidths.marks;
      doc.text(`${student.percentage}%`, xPos, rowY + 4, { width: colWidths.pct });
      xPos += colWidths.pct;

      // Status color
      const statusColor = student.status === 'Pass' ? '#27ae60' : '#e74c3c';
      doc.fillColor(statusColor);
      doc.text(student.status, xPos, rowY + 4, { width: colWidths.status });
      xPos += colWidths.status;

      doc.fillColor('black');
      doc.text(student.category, xPos, rowY + 4, { width: colWidths.category });

      rowY += 16;
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#666666');
    doc.text(`Report generated on: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[PDF REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF report.' });
    }
  }
});

// GET /api/reports/:uploadId/excel
router.get('/api/reports/:uploadId/excel', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    // Fetch data
    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const analytics = await dbState.analyticsCol.findOne({ uploadId, userId });
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found.' });
    }

    const students = await dbState.studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();
    const subjectNames = getSubjectNamesFromStudents(students, analytics);
    const isMultiSubject = normalizeReportType(uploadDoc.subjectType || analytics.reportType) === 'multiple' || subjectNames.length > 0;

    // Create workbook
    const workbook = xlsx.utils.book_new();

    // Sheet 1: Analytics Summary
    const summaryData = [
      ['Metric', 'Value'],
      ['Subject', uploadDoc.subjectName],
      ['Report Type', isMultiSubject ? 'Multiple Subjects' : 'Single Subject'],
      ['Class', uploadDoc.className],
      ['Maximum Marks', uploadDoc.maxMarks],
      ['Passing Marks', uploadDoc.passingMarks],
      ['Upload Date', new Date(uploadDoc.uploadDate).toLocaleDateString()],
      ['', ''],
      ['Total Students', analytics.totalStudents],
      ['Passed Students', analytics.passedStudents],
      ['Failed Students', analytics.failedStudents],
      ['Average Marks', analytics.averageMarks],
      ['Highest Marks', analytics.highestMarks],
      ['Lowest Marks', analytics.lowestMarks],
      ['Pass Percentage', `${analytics.passPercentage}%`],
      ['Fail Percentage', `${analytics.failPercentage}%`],
      ['', ''],
      ['Marks Distribution', ''],
      ['0-35%', analytics.marksDistribution.range_0_35],
      ['36-50%', analytics.marksDistribution.range_36_50],
      ['51-70%', analytics.marksDistribution.range_51_70],
      ['71-85%', analytics.marksDistribution.range_71_85],
      ['86-100%', analytics.marksDistribution.range_86_100]
    ];
    if (subjectNames.length && Array.isArray(analytics.subjectSummary)) {
      summaryData.push(['', '']);
      summaryData.push(['Subject Wise Analysis', '']);
      summaryData.push(['Subject', 'Average Marks', 'Highest Marks', 'Lowest Marks']);
      for (const subject of analytics.subjectSummary) {
        summaryData.push([
          subject.subjectName,
          subject.averageMarks,
          subject.highestMarks,
          subject.lowestMarks,
        ]);
      }
    }
    const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Analytics Summary');

    // Sheet 2: Student Data
    const studentData = [
      [
        'Rank',
        'Roll No',
        'Student Name',
        ...subjectNames,
        isMultiSubject ? 'Average Marks' : 'Marks',
        'Percentage',
        'Status',
        'Category'
      ]
    ];
    for (const s of students) {
      const subjectMarks = extractSubjectMarks(s);
      studentData.push([
        s.rank,
        s.rollNo,
        s.studentName,
        ...subjectNames.map((subjectName) => subjectMarks[subjectName] ?? ''),
        s.marks,
        s.percentage,
        s.status,
        s.category
      ]);
    }
    const studentSheet = xlsx.utils.aoa_to_sheet(studentData);
    studentSheet['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 25 },
      ...subjectNames.map(() => ({ wch: 12 })),
      { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 20 }
    ];
    xlsx.utils.book_append_sheet(workbook, studentSheet, 'Student Data');

    // Generate buffer and send
    await logReport(uploadId, userId, 'excel', 'report.xlsx');

    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.send(Buffer.from(excelBuffer));
  } catch (err) {
    console.error('[EXCEL REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate Excel report.' });
    }
  }
});

// GET /api/reports/:uploadId/csv
router.get('/api/reports/:uploadId/csv', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.userId.toString();
    if (!isValidObjectId(uploadId)) {
      return res.status(400).json({ success: false, message: 'Invalid upload ID.' });
    }

    // Fetch data
    const uploadDoc = await dbState.uploadsCol.findOne({ _id: new ObjectId(uploadId), userId });
    if (!uploadDoc) {
      return res.status(404).json({ success: false, message: 'Upload not found.' });
    }

    const students = await dbState.studentsCol
      .find({ uploadId, userId })
      .sort({ rank: 1 })
      .toArray();

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'No student data found.' });
    }

    const subjectNames = getSubjectNamesFromStudents(students);
    const isMultiSubject = normalizeReportType(uploadDoc.subjectType) === 'multiple' || subjectNames.length > 0;

    // Build CSV content
    const headers = [
      'Rank',
      'Roll No',
      'Student Name',
      ...subjectNames,
      isMultiSubject ? 'Average Marks' : 'Marks',
      'Percentage',
      'Status',
      'Category'
    ];
    const csvRows = [headers.map(escapeCsvValue).join(',')];

    for (const s of students) {
      const subjectMarks = extractSubjectMarks(s);
      const row = [
        s.rank,
        s.rollNo,
        s.studentName,
        ...subjectNames.map((subjectName) => subjectMarks[subjectName] ?? ''),
        s.marks,
        s.percentage,
        s.status,
        s.category
      ];
      csvRows.push(row.map(escapeCsvValue).join(','));
    }

    await logReport(uploadId, userId, 'csv', 'report.csv');

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=report.csv');
    res.send(csvContent);
  } catch (err) {
    console.error('[CSV REPORT ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate CSV report.' });
    }
  }
});

// ============================================================================
// Upload History APIs
// ============================================================================
module.exports = router;