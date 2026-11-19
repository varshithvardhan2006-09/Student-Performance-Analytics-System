// ============================================================================
// src/services/fileParser.js
// Multi-format ingestion: CSV, XLSX/XLS and text-based PDF mark sheets are
// all normalised into the same record shape.
// ============================================================================

const Groq = require('groq-sdk');
const { PDFParse } = require('pdf-parse');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const xlsx = require('xlsx');

const { GROQ_API_KEY } = require('../config/env');
const { extractJsonObject, normalizeColumnName, normalizeReportType, normalizeSubjectMarks } = require('../utils/normalizers');
const { cleanHeaderLabel, isPlainObject } = require('../utils/validators');
/**
 * Normalize records by mapping column names
 */
/**
 * Is this parsed row entirely empty?
 *
 * Spreadsheet exports routinely carry trailing blank lines and rows of bare
 * separators (",,"), and a blank line can sit between sections. Those are
 * artefacts of the export, not students, so they are dropped before validation.
 *
 * A row is only considered blank when *every* value is empty. A row that has a
 * roll number or a name but no marks is a genuine mistake in the sheet and is
 * kept, so validateRecords() can report it against its own row number.
 *
 * @param {object} record a raw parsed row
 * @returns {boolean} true when the row carries no data at all
 */
function isBlankRecord(record) {
  if (!isPlainObject(record)) {
    return true;
  }

  return Object.values(record).every((value) => {
    if (value === null || value === undefined) {
      return true;
    }
    if (isPlainObject(value)) {
      return Object.values(value).every(
        (inner) => inner === null || inner === undefined || String(inner).trim() === ''
      );
    }
    return String(value).trim() === '';
  });
}

function normalizeRecords(rawRecords, reportType = 'single') {
  if (!rawRecords || rawRecords.length === 0) return [];

  // Drop blank rows up front so they never reach validation. Without this a
  // trailing newline in the sheet became "Row 4: Marks must be a number
  // (got undefined)" and the whole upload was rejected.
  const records = rawRecords.filter((record) => !isBlankRecord(record));
  if (records.length === 0) return [];

  const normalizedReportType = normalizeReportType(reportType);

  // Get column mapping from first record
  const firstRecord = records[0];
  const columnMap = {};
  const subjectKeys = [];
  let hasMarksColumn = false;
  let hasExtraColumns = false;
  let hasStructuredSubjectMarks = false;

  for (const key of Object.keys(firstRecord)) {
    const mapped = normalizeColumnName(key);
    if (mapped) {
      columnMap[key] = mapped;
      if (mapped === 'marks') {
        hasMarksColumn = true;
      }
    } else if (key === 'subjectMarks') {
      hasStructuredSubjectMarks = true;
    } else {
      hasExtraColumns = true;
      subjectKeys.push(key);
    }
  }

  for (const record of records) {
    if (isPlainObject(record?.subjectMarks) || isPlainObject(record?.marks)) {
      hasStructuredSubjectMarks = true;
      break;
    }
  }

  const effectiveReportType = normalizedReportType === 'multiple'
    || hasStructuredSubjectMarks
    || (!hasMarksColumn && hasExtraColumns)
    ? 'multiple'
    : 'single';

  // Map all records
  return records.map(record => {
    const normalized = {};
    for (const [originalKey, mappedKey] of Object.entries(columnMap)) {
      normalized[mappedKey] = record[originalKey];
    }

    if (effectiveReportType === 'multiple') {
      const subjectMarks = {};
      const recordSubjectMarks = isPlainObject(record.subjectMarks) ? record.subjectMarks : null;

      if (recordSubjectMarks) {
        Object.assign(subjectMarks, normalizeSubjectMarks(recordSubjectMarks));
      }

      if (isPlainObject(record.marks)) {
        Object.assign(subjectMarks, normalizeSubjectMarks(record.marks));
      }

      for (const key of subjectKeys) {
        const value = record[key];
        if (value === null || value === undefined || String(value).trim() === '') {
          continue;
        }
        subjectMarks[cleanHeaderLabel(key)] = value;
      }

      if (Object.keys(subjectMarks).length > 0) {
        normalized.subjectMarks = subjectMarks;
      }
    }

    if (effectiveReportType === 'single' && record.marks !== undefined && normalized.marks === undefined) {
      normalized.marks = record.marks;
    }

    return normalized;
  });
}

/**
 * Parse CSV buffer into records
 */
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];
    const readable = Readable.from(buffer);
    readable
      .pipe(csvParser())
      .on('data', (row) => {
        records.push(row);
      })
      .on('end', () => {
        resolve(records);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Parse Excel buffer into records
 */
function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel file has no sheets');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const records = xlsx.utils.sheet_to_json(worksheet);
  return records;
}

/**
 * Parse PDF buffer into records
 */
// Text extracted from a PDF has no real columns, so rows are split on tabs or
// pipes when the table uses them and on whitespace otherwise.
function splitPdfLine(line) {
  const cells = /[\t|]/.test(line) ? line.split(/[\t|]/) : line.split(/\s+/);
  return cells.map((part) => part.trim()).filter(Boolean);
}

// A roll number looks like an id: letters, digits, "-", "/" or "_", with at
// least one digit. This keeps page footers and titles out of the records.
function looksLikeRollNo(value) {
  return /^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(value) && /\d/.test(value);
}

function isPageFooter(line) {
  return /^(page\s+\d+(\s*(of|\/)\s*\d+)?|\d+\s*(of|\/)\s*\d+)$/i.test(line.trim());
}

function parsePDFTextToRecords(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !isPageFooter(line));
  const records = [];
  let subjectHeaders = [];
  let headerFound = false;

  for (const line of lines) {
    const parts = splitPdfLine(line);
    if (parts.length < 3) {
      continue;
    }

    const normalized = parts.map((part) => cleanHeaderLabel(part).toLowerCase().replace(/[.:]/g, ''));
    const nameIndex = normalized.findIndex((part, index) => index > 0 && (part === 'name' || part === 'studentname'));
    const isHeaderLine = !headerFound
      && nameIndex > 0
      && normalized.slice(0, nameIndex).some((part) => part === 'roll' || part === 'rollno' || part === 'roll no' || part === 'id');

    if (isHeaderLine) {
      subjectHeaders = parts.slice(nameIndex + 1).map((part) => cleanHeaderLabel(part)).filter(Boolean);
      headerFound = subjectHeaders.length > 0;
      continue;
    }

    if (headerFound) {
      const subjectCount = subjectHeaders.length;
      if (parts.length < 2 + subjectCount) {
        continue;
      }

      const rollNo = parts[0];
      const studentName = parts.slice(1, parts.length - subjectCount).join(' ');
      const subjectValues = parts.slice(-subjectCount);
      const hasNumericSubjectValues = subjectValues.every((value) => Number.isFinite(parseFloat(value)));

      if (!looksLikeRollNo(rollNo) || !studentName || !hasNumericSubjectValues) {
        continue;
      }

      if (subjectCount === 1 && /^(marks?|score|total)$/i.test(subjectHeaders[0])) {
        records.push({
          rollNo,
          studentName,
          marks: subjectValues[0],
        });
        continue;
      }

      const subjectMarks = {};
      for (let index = 0; index < subjectHeaders.length; index++) {
        subjectMarks[subjectHeaders[index]] = subjectValues[index];
      }

      records.push({
        rollNo,
        studentName,
        subjectMarks,
      });
    }
  }

  // No header row: accept "roll no, name..., marks" lines.
  if (records.length === 0) {
    for (const line of lines) {
      const parts = splitPdfLine(line);
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        const studentName = parts.slice(1, parts.length - 1).join(' ');
        if (looksLikeRollNo(parts[0]) && studentName && !isNaN(parseFloat(lastPart))) {
          records.push({
            rollNo: parts[0],
            studentName,
            marks: lastPart
          });
        }
      }
    }
  }

  return records;
}

function normalizePdfRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => {
    const normalized = {
      rollNo: String(record?.rollNo ?? record?.roll_no ?? record?.roll ?? '').trim(),
      studentName: String(record?.studentName ?? record?.student_name ?? record?.name ?? '').trim(),
    };

    if (isPlainObject(record?.subjectMarks)) {
      normalized.subjectMarks = normalizeSubjectMarks(record.subjectMarks);
    } else if (isPlainObject(record?.marks)) {
      normalized.subjectMarks = normalizeSubjectMarks(record.marks);
    } else {
      const marksValue = record?.marks ?? record?.score ?? record?.mark ?? '';
      normalized.marks = String(marksValue).trim();
    }

    return normalized;
  }).filter((record) => record.rollNo || record.studentName || record.marks || Object.keys(record.subjectMarks || {}).length);
}

async function parsePDF(buffer, fileName = 'uploaded.pdf') {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();
  const text = String(data.text || '').trim();
  const localRecords = parsePDFTextToRecords(text);

  if (!text) {
    throw new Error('The PDF does not contain readable text. Please upload a searchable PDF, CSV, or Excel file.');
  }

  if (GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You validate student marks PDFs. Return only JSON with keys valid, reason, reportType, and records. For single-subject sheets, records must be an array of objects with rollNo, studentName, and marks. For multi-subject sheets, records must be an array of objects with rollNo, studentName, and subjectMarks, where subjectMarks is an object mapping subject names to numeric marks. If the file is not a valid student marks sheet, set valid to false and explain why.',
          },
          {
            role: 'user',
            content: [
              `File name: ${fileName}`,
              'Determine whether the text below is a valid student marks table.',
              'If it is a single-subject sheet, extract every row into JSON records with rollNo, studentName, and marks.',
              'If it is a multi-subject sheet, extract every row into JSON records with rollNo, studentName, and subjectMarks.',
              'Return only JSON.',
              '',
              'PDF text:',
              text.slice(0, 12000),
            ].join('\n'),
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0,
      });

      const aiContent = completion.choices?.[0]?.message?.content || '';
      const payload = extractJsonObject(aiContent);
      if (!payload) {
        throw new Error('Groq returned an unreadable PDF validation response.');
      }

      if (payload.valid === false) {
        throw new Error(payload.reason || 'The uploaded PDF is not a valid student marks sheet.');
      }

      const groqRecords = normalizePdfRecords(payload.records);
      if (groqRecords.length > 0) {
        return groqRecords;
      }
    } catch (error) {
      if (localRecords.length > 0) {
        console.warn('[PDF GROQ FALLBACK]', error.message);
        return localRecords;
      }
      throw error;
    }
  }

  return localRecords;
}

module.exports = {
  parsePDFTextToRecords,
  normalizeRecords,
  parseCSV,
  parseExcel,
  parsePDF,
};
