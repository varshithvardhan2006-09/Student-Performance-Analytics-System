// ============================================================================
// src/pages/reports.js
// PDF / Excel / CSV report downloads.
// ============================================================================

import { requestBlob } from '../api/client.js';
import { getCurrentUploadId } from '../selectors.js';
import { state } from '../state.js';
async function downloadReport(uploadId, format) {
  if (!uploadId) {
    return;
  }

  const normalizedFormat = ['pdf', 'excel', 'csv'].includes(format) ? format : 'pdf';
  const filename = `${state.currentUpload?.subjectName || 'report'}-${normalizedFormat}.${normalizedFormat === 'excel' ? 'xlsx' : normalizedFormat}`;
  await requestBlob(`/api/reports/${encodeURIComponent(uploadId)}/${normalizedFormat}`, filename);
}

async function downloadCurrentReport(format) {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    alert('Upload a subject file first.');
    return;
  }

  await downloadReport(uploadId, format);
}

export {
  downloadReport,
  downloadCurrentReport,
};
