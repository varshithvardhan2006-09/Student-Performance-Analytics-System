// ============================================================================
// src/pages/upload.js
// Upload page rendering and file submission.
// ============================================================================

import { requestJson } from '../api/client.js';
import { getUploadIdFromResponse, waitForDashboardData } from '../data.js';
import { showAuth } from './auth.js';
import { completeProcessing, startProcessing } from './processing.js';
import { renderPage, setView } from '../shell.js';
import { state } from '../state.js';
import { delay, escapeHtml, formatErrorDetails } from '../utils/format.js';
function renderUploadPage() {
  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Home / Upload</p>
          <h1 class="page-title">Upload Subject Marks</h1>
          <p class="page-copy">Upload single-subject marks files or structured multi-subject reports to generate performance analytics.</p>
          <div class="hero-info">
            <span class="badge">CSV</span>
            <span class="badge">Excel</span>
            <span class="badge">Structured PDF</span>
            <span class="badge">Multi-file ready</span>
            <span class="badge">Single / Multiple Subjects</span>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="dashboard">Go to Dashboard</button>
          <button class="primary-btn" type="button" data-view="history">Open History</button>
        </div>
      </div>

      <div class="upload-layout">
        <section class="page-card">
          <div class="page-head">
            <div>
              <p class="eyebrow">1. Subject Details</p>
              <h3>Upload Subject Marks</h3>
              <p>Use the same subject details your teacher record uses in MongoDB.</p>
            </div>
          </div>

          <form id="uploadForm" class="upload-form-shell">
            <div class="upload-form-grid">
              <label class="field">
                <span>Subject Type *</span>
                <select name="subjectType" id="subjectType" required>
                  <option value="single" selected>Single Subject</option>
                  <option value="multiple">Multiple Subjects</option>
                </select>
              </label>
              <label class="field">
                <span>Subject / Report Name *</span>
                <input name="subjectName" type="text" placeholder="Example: DBMS or Semester 1 report" required>
              </label>
              <label class="field">
                <span>Class *</span>
                <select name="className" required>
                  <option value="" selected disabled>Select class</option>
                  <option>BCA</option>
                  <option>BSc CS</option>
                  <option>BSc IT</option>
                  <option>BCom</option>
                  <option>BA</option>
                  <option>B.Tech</option>
                  <option>B.E</option>
                  <option>MCA</option>
                  <option>MSc</option>
                  <option>Other</option>
                </select>
              </label>
              <label class="field">
                <span>Maximum Marks *</span>
                <input name="maxMarks" type="number" min="1" max="1000" placeholder="Enter maximum marks" value="100" required>
              </label>
              <label class="field">
                <span>Passing Marks *</span>
                <input name="passingMarks" type="number" min="1" max="1000" placeholder="Enter passing marks" value="35" required>
              </label>
            </div>

            <div class="field">
              <span>Choose File *</span>
              <label id="dropZone" class="drop-zone" for="marksFile">
                <div class="drop-icon">⇪</div>
                <strong>Drag and drop your file here</strong>
                <span>or</span>
                <button class="ghost-btn" type="button" id="chooseFileBtn">Choose File</button>
                <small>Supported formats: CSV, Excel (.xlsx, .xls), PDF (structured)</small>
                <small>Maximum file size: 10MB per file</small>
                <input id="marksFile" name="file" type="file" accept=".csv,.xlsx,.xls,.pdf" class="hidden" multiple>
              </label>
              <div class="upload-meta" id="selectedFileMeta">No file selected yet.</div>
            </div>

            <button class="primary-btn" type="button" data-upload-submit>Upload &amp; Analyze</button>
            <div id="uploadFeedback" class="inline-feedback hidden" role="status" aria-live="polite"></div>
          </form>
        </section>

        <aside class="upload-side">
          <section class="check-card">
            <p class="eyebrow">File Requirements</p>
            <h3>Keep the upload clean</h3>
            <ul class="check-list">
              <li><span class="check-icon">✓</span><span>File must be CSV, Excel, or structured PDF.</span></li>
              <li><span class="check-icon">✓</span><span>File should not be empty.</span></li>
              <li><span class="check-icon">✓</span><span>Required columns: Roll No, Student Name, and Marks or subject columns.</span></li>
              <li><span class="check-icon">✓</span><span>Marks should be numeric and within the maximum marks range.</span></li>
              <li><span class="check-icon">✓</span><span>No duplicate roll numbers.</span></li>
              <li><span class="check-icon">✓</span><span>Multi-subject reports may include one column per subject.</span></li>
            </ul>
          </section>

          <section class="check-card alt">
            <p class="eyebrow">Required Columns</p>
            <h3>Your file must contain</h3>
            <ul class="check-list">
              <li><span class="check-icon">1</span><span><strong>Roll No</strong></span></li>
              <li><span class="check-icon">2</span><span><strong>Student Name</strong></span></li>
              <li><span class="check-icon">3</span><span><strong>Marks or subject columns</strong></span></li>
            </ul>
          </section>

          <section class="check-card note">
            <p class="eyebrow">Note</p>
            <h3>After upload</h3>
            <p>Once the file is processed, the system will take you to the analytics dashboard automatically. For multi-subject PDFs, keep the header row with Roll No, Student Name, and each subject column.</p>
          </section>
        </aside>
      </div>
    </section>
  `;
}

async function submitUploadForm(form) {
  if (!state.token) {
    showAuth();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const formData = new FormData(form);
  const fileInput = form.querySelector('input[name="file"]');
  const files = Array.from(fileInput?.files || []);

  if (!files.length) {
    const feedback = document.getElementById('uploadFeedback');
    if (feedback) {
      feedback.textContent = 'Please choose a marks file first.';
      feedback.className = 'inline-feedback error';
      feedback.classList.remove('hidden');
    }
    return;
  }

  const startedAt = Date.now();
  const totalSize = files.reduce((sum, currentFile) => sum + (currentFile?.size || 0), 0);
  const fileLabel = files.length === 1 ? files[0].name : `${files.length} files`;
  startProcessing(fileLabel, totalSize);

  try {
    const response = await requestJson('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });

    state.processing.message = 'File uploaded. Verifying saved analytics...';
    renderPage();

    const visibleWait = Math.max(900, 1600 - (Date.now() - startedAt));
    if (visibleWait > 0) {
      await delay(visibleWait);
    }

    const uploadId = getUploadIdFromResponse(response);
    await waitForDashboardData(uploadId);
    completeProcessing('File verified successfully. Redirecting to dashboard...');

    await delay(650);
    setView('dashboard');
  } catch (error) {
    completeProcessing(error.message || 'Upload failed.');
    const detailLines = formatErrorDetails(error.details);
    const feedbackHtml = [error.message, ...detailLines]
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
    state.processing.message = error.message;
    renderPage();
    await delay(1200);
    state.view = 'upload';
    renderPage();
    const feedback = document.getElementById('uploadFeedback');
    if (feedback) {
      feedback.innerHTML = feedbackHtml;
      feedback.className = 'inline-feedback error';
      feedback.classList.remove('hidden');
    }
  }
}

async function handleUpload(event) {
  event.preventDefault();
  await submitUploadForm(event.currentTarget);
}

function updateSelectedFileLabel(fileOrFiles) {
  const label = document.getElementById('selectedFileMeta');
  if (!label) {
    return;
  }

  const files = Array.isArray(fileOrFiles)
    ? fileOrFiles
    : fileOrFiles?.length
      ? Array.from(fileOrFiles)
      : fileOrFiles
        ? [fileOrFiles]
        : [];

  if (files.length === 1) {
    const size = Math.max(1, Math.round((files[0].size || 0) / 1024));
    label.textContent = `${files[0].name} • ${size} KB`;
    return;
  }

  if (files.length > 1) {
    const totalSize = files.reduce((sum, currentFile) => sum + (currentFile?.size || 0), 0);
    const size = Math.max(1, Math.round(totalSize / 1024));
    label.textContent = `${files.length} files selected • ${size} KB total`;
    return;
  }

  label.textContent = 'No file selected yet.';
}

export {
  renderUploadPage,
  submitUploadForm,
  handleUpload,
  updateSelectedFileLabel,
};
