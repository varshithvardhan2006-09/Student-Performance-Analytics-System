// ============================================================================
// src/middleware/upload.js
// Multer configuration for mark-sheet uploads: memory storage (nothing is
// written to disk), a 10 MB cap, and an extension allow-list.
// ============================================================================

const multer = require('multer');
const path = require('path');
// Multer setup - memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Allowed: CSV, XLSX, XLS, PDF'));
    }
  }
});

module.exports = {
  upload,
};
