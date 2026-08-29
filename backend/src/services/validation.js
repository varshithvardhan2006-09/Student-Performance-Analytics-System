// ============================================================================
// src/services/validation.js
// Record validation. Produces a specific, row-numbered error for every
// problem found, so a teacher can fix their sheet without guessing.
// ============================================================================

const { extractSubjectMarks, normalizeReportType } = require('../utils/normalizers');
/**
 * Validate parsed student records
 */
function validateRecords(records, maxMarks, reportType = 'single') {
  const errors = [];
  const normalizedReportType = normalizeReportType(reportType);

  if (!records || records.length === 0) {
    errors.push('No student records found in the file.');
    return { valid: false, errors };
  }

  // Check required columns
  const firstRecord = records[0];
  const hasRollNo = 'rollNo' in firstRecord;
  const hasName = 'studentName' in firstRecord;
  const hasMarks = 'marks' in firstRecord;
  const hasSubjectMarks = Object.keys(extractSubjectMarks(firstRecord)).length > 0;

  if (!hasRollNo) errors.push('Missing required column: Roll No');
  if (!hasName) errors.push('Missing required column: Student Name');
  if (normalizedReportType === 'single' && !hasMarks) errors.push('Missing required column: Marks');
  if (normalizedReportType === 'multiple' && !hasSubjectMarks && !hasMarks) errors.push('Missing required subject mark columns.');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check for duplicate roll numbers
  const rollNos = new Set();
  const duplicates = new Set();
  for (const record of records) {
    const rollNo = String(record.rollNo ?? '').trim();
    // An absent roll number is reported per row below; counting several of them
    // as duplicates of each other produced "Duplicate roll numbers: undefined".
    if (!rollNo) {
      continue;
    }
    if (rollNos.has(rollNo)) {
      duplicates.add(rollNo);
    }
    rollNos.add(rollNo);
  }
  if (duplicates.size > 0) {
    errors.push(`Duplicate roll numbers found: ${Array.from(duplicates).join(', ')}`);
  }

  // Validate each record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowNum = i + 1;

    if (normalizedReportType === 'multiple') {
      const subjectMarks = extractSubjectMarks(record);
      const subjectEntries = Object.entries(subjectMarks);

      if (subjectEntries.length === 0) {
        errors.push(`Row ${rowNum}: No subject marks found.`);
        continue;
      }

      for (const [subjectName, subjectValue] of subjectEntries) {
        const marks = parseFloat(subjectValue);
        if (isNaN(marks)) {
          errors.push(`Row ${rowNum}: ${subjectName} marks must be a number (got "${subjectValue}")`);
        } else if (marks < 0) {
          errors.push(`Row ${rowNum}: ${subjectName} marks cannot be negative (got ${marks})`);
        } else if (marks > maxMarks) {
          errors.push(`Row ${rowNum}: ${subjectName} marks (${marks}) exceed maximum marks (${maxMarks})`);
        }
      }
      continue;
    }

    const marks = parseFloat(record.marks);
    if (isNaN(marks)) {
      errors.push(`Row ${rowNum}: Marks must be a number (got "${record.marks}")`);
    } else if (marks < 0) {
      errors.push(`Row ${rowNum}: Marks cannot be negative (got ${marks})`);
    } else if (marks > maxMarks) {
      errors.push(`Row ${rowNum}: Marks (${marks}) exceed maximum marks (${maxMarks})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateRecords,
};
