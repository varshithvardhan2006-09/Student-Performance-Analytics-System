// ============================================================================
// src/utils/normalizers.js
// Normalisers that absorb the variation in real mark sheets: column header
// spellings, report types, subject-mark shapes and role casing.
// ============================================================================

const { cleanHeaderLabel, isPlainObject } = require('./validators');
function normalizeReportType(value) {
  return String(value || 'single').trim().toLowerCase() === 'multiple' ? 'multiple' : 'single';
}

function normalizeSubjectMarks(subjectMarks) {
  if (!isPlainObject(subjectMarks)) {
    return {};
  }

  return Object.entries(subjectMarks).reduce((accumulator, [key, value]) => {
    const label = cleanHeaderLabel(key);
    if (!label || value === null || value === undefined || String(value).trim() === '') {
      return accumulator;
    }
    accumulator[label] = value;
    return accumulator;
  }, {});
}

function extractSubjectMarks(record) {
  if (!isPlainObject(record)) {
    return {};
  }

  if (isPlainObject(record.subjectMarks)) {
    return normalizeSubjectMarks(record.subjectMarks);
  }

  if (isPlainObject(record.marks)) {
    return normalizeSubjectMarks(record.marks);
  }

  return {};
}

function hasSubjectMarks(record) {
  return Object.keys(extractSubjectMarks(record)).length > 0;
}

function detectRecordsReportType(records, fallback = 'single') {
  if (Array.isArray(records) && records.some((record) => hasSubjectMarks(record))) {
    return 'multiple';
  }

  return normalizeReportType(fallback);
}

function getSubjectNamesFromStudents(students = [], analytics = null) {
  const subjectNames = [];
  const addSubjectName = (name) => {
    const label = cleanHeaderLabel(name);
    if (label && !subjectNames.includes(label)) {
      subjectNames.push(label);
    }
  };

  if (Array.isArray(analytics?.subjectSummary)) {
    analytics.subjectSummary.forEach((subject) => addSubjectName(subject.subjectName));
  }

  students.forEach((student) => {
    Object.keys(extractSubjectMarks(student)).forEach(addSubjectName);
  });

  return subjectNames;
}

/**
 * Normalize column names from parsed file data
 */
function normalizeColumnName(col) {
  const normalized = col.toString().trim().toLowerCase().replace(/[.\s_-]+/g, ' ').trim();

  const rollNoVariations = ['roll no', 'rollno', 'roll_no', 'roll number', 'roll', 'id', 'sno', 's.no', 's no'];
  const nameVariations = ['student name', 'studentname', 'student_name', 'name', 'student'];
  const marksVariations = ['marks', 'mark', 'score', 'scores', 'total', 'total marks'];

  if (rollNoVariations.includes(normalized)) return 'rollNo';
  if (nameVariations.includes(normalized)) return 'studentName';
  if (marksVariations.includes(normalized)) return 'marks';

  return null;
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeMarksValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Roles are stored lowercase everywhere ("teacher") so that a role check such
 * as `user.role === 'teacher'` behaves identically for every account, no
 * matter which code path created it.
 * @param {*} value raw role value from a request body or a database document
 * @returns {string} lowercase, trimmed role; defaults to 'teacher'
 */
function normalizeRole(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized || 'teacher';
}

module.exports = {
  normalizeRole,
  normalizeReportType,
  normalizeSubjectMarks,
  extractSubjectMarks,
  hasSubjectMarks,
  detectRecordsReportType,
  getSubjectNamesFromStudents,
  normalizeColumnName,
  extractJsonObject,
  normalizeMarksValue,
};
