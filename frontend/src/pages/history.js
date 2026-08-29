// ============================================================================
// src/pages/history.js
// Upload history page.
// ============================================================================

import { requestJson } from '../api/client.js';
import { STORAGE_KEYS } from '../constants.js';
import { loadUploadData } from '../data.js';
import { ensureInsights } from './insights.js';
import { renderEmptyState, renderLoadingSkeleton, renderPage, setView } from '../shell.js';
import { state } from '../state.js';
import { escapeHtml, formatDate, formatPercent } from '../utils/format.js';
function renderHistoryPage() {
  if (!state.history.length) {
    return renderEmptyState(
      'No uploads yet',
      'Your upload history will appear here after the first subject file is processed.',
      'Go to Upload',
      'upload'
    );
  }

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Upload History</p>
          <h1 class="page-title">Store every analysis</h1>
          <p class="page-copy">Use history to reopen analytics, download reports, or remove old uploads.</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="upload">Upload New File</button>
        </div>
      </div>

      <section class="history-card">
        <div class="table-head">
          <div>
            <p class="eyebrow">Saved Uploads</p>
            <h3>All processed subject files</h3>
          </div>
          <span class="badge">${state.history.length} uploads</span>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Upload Date</th>
              <th>Subject</th>
              <th>Class</th>
              <th>Student Count</th>
              <th>Average</th>
              <th>Pass %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.history.map((upload) => `
              <tr>
                <td>${escapeHtml(formatDate(upload.uploadDate))}</td>
                <td>${escapeHtml(upload.subjectName)}</td>
                <td>${escapeHtml(upload.className)}</td>
                <td>${escapeHtml(upload.studentCount ?? upload.analytics?.totalStudents ?? 0)}</td>
                <td>${escapeHtml(formatPercent(upload.analytics?.averageMarks || 0))}</td>
                <td>${escapeHtml(formatPercent(upload.analytics?.passPercentage || 0))}</td>
                <td>
                  <div class="history-actions">
                    <button class="mini-btn" type="button" data-history-action="view" data-upload-id="${escapeHtml(upload._id)}">View Analytics</button>
                    <button class="mini-btn" type="button" data-history-action="pdf" data-upload-id="${escapeHtml(upload._id)}">PDF</button>
                    <button class="mini-btn" type="button" data-history-action="excel" data-upload-id="${escapeHtml(upload._id)}">Excel</button>
                    <button class="mini-btn" type="button" data-history-action="csv" data-upload-id="${escapeHtml(upload._id)}">CSV</button>
                    <button class="mini-btn danger-btn" type="button" data-history-action="delete" data-upload-id="${escapeHtml(upload._id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    </section>
  `;
}

async function loadHistory() {
  const response = await requestJson('/api/uploads?page=1&limit=50');
  state.history = Array.isArray(response.uploads) ? response.uploads : [];
  if (state.currentUploadId) {
    const selected = state.history.find((upload) => String(upload._id) === String(state.currentUploadId));
    if (selected) {
      sessionStorage.setItem(STORAGE_KEYS.currentUploadId, selected._id);
    }
  }
  return state.history;
}

async function openHistoryUpload(uploadId) {
  // Paint a skeleton rather than leaving the previous page frozen while the
  // upload and its student rows are fetched.
  renderLoadingSkeleton('cards');
  await loadUploadData(uploadId);
  state.queryReply = '';
  state.insights = null;
  setView('dashboard');
  await Promise.allSettled([ensureInsights(false)]);
}

async function deleteHistoryUpload(uploadId) {
  const confirmed = window.confirm('Delete this upload and all related analytics?');
  if (!confirmed) {
    return;
  }

  await requestJson(`/api/uploads/${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
    headers: {},
  });

  await loadHistory();

  if (String(state.currentUploadId) === String(uploadId)) {
    state.currentUploadId = '';
    state.currentUpload = null;
    state.analytics = null;
    state.students = [];
    state.insights = null;
    sessionStorage.removeItem(STORAGE_KEYS.currentUploadId);
  }

  if (state.view === 'history') {
    renderPage();
  } else if (!state.currentUploadId) {
    setView('upload');
  }
}

export {
  renderHistoryPage,
  loadHistory,
  openHistoryUpload,
  deleteHistoryUpload,
};
