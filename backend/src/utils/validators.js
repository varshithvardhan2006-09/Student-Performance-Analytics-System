// ============================================================================
// src/utils/validators.js
// Small pure validators and escapers shared across the services.
// ============================================================================

const path = require('path');
/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanHeaderLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getFileSignatureError(file) {
  const fileName = file?.originalname || 'uploaded file';
  const extension = path.extname(fileName).toLowerCase();
  const buffer = file?.buffer;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return `${fileName} is empty or could not be read.`;
  }

  if (extension === '.pdf') {
    return buffer.subarray(0, 5).toString('utf8') === '%PDF-'
      ? ''
      : `${fileName} is not a valid PDF file.`;
  }

  if (extension === '.xlsx') {
    const zipMagic = buffer.subarray(0, 4).toString('hex');
    return ['504b0304', '504b0506', '504b0708'].includes(zipMagic)
      ? ''
      : `${fileName} is not a valid XLSX file.`;
  }

  if (extension === '.xls') {
    const cfbMagic = buffer.subarray(0, 8).toString('hex');
    return cfbMagic === 'd0cf11e0a1b11ae1'
      ? ''
      : `${fileName} is not a valid XLS file.`;
  }

  if (extension === '.csv') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    return sample.includes(0)
      ? `${fileName} is not a valid text CSV file.`
      : '';
  }

  return `${fileName} has an unsupported file extension.`;
}

/** True for a 24-character hex string, the only shape a Mongo ObjectId takes. */
function isValidObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

module.exports = {
  isValidEmail,
  normalizeEmail,
  escapeRegExp,
  cleanHeaderLabel,
  getFileSignatureError,
  isPlainObject,
  isValidObjectId,
  escapeCsvValue,
};
