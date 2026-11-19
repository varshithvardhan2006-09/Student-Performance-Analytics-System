// ============================================================================
// src/data.js
// Upload data loading and dashboard readiness polling.
// ============================================================================

import { requestJson } from './api/client.js';
import { STORAGE_KEYS } from './constants.js';
import { loadFilteredDashboardData } from './pages/dashboard.js';
import { loadHistory } from './pages/history.js';
import { getDashboardAnalytics, getDashboardStudents, getSubjectFilterOptions } from './selectors.js';
import { renderPage } from './shell.js';
import { state } from './state.js';
import { delay } from './utils/format.js';
// The API returns students in pages (1000 at most), so keep asking until every
// page is in -- a large class must not be silently cut short.
async function fetchAllStudents(uploadId) {
  const pageSize = 1000;
  const students = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await requestJson(
      `/api/students/${encodeURIComponent(uploadId)}?limit=${pageSize}&page=${page}`
    );
    if (Array.isArray(response.students)) {
      students.push(...response.students);
    }
    totalPages = Number(response.totalPages) || 1;
    page += 1;
  }

  return students;
}

async function loadUploadData(uploadId) {
  if (!uploadId) {
    return null;
  }

  const [uploadResponse, loadedStudents] = await Promise.all([
    requestJson(`/api/uploads/${encodeURIComponent(uploadId)}`),
    fetchAllStudents(uploadId),
  ]);

  state.currentUpload = uploadResponse.upload;
  state.analytics = uploadResponse.analytics;
  state.students = loadedStudents;
  state.sourceAnalytics = state.analytics;
  state.sourceStudents = state.students;
  state.dashboardAnalytics = state.analytics;
  state.dashboardStudents = state.students;
  state.dashboardFilters = {
    subject: 'all',
    student: 'all',
  };
  state.dashboardFilterOptions = {
    subjects: getSubjectFilterOptions(),
    students: state.sourceStudents.map((student) => ({
      rollNo: String(student.rollNo || ''),
      studentName: String(student.studentName || ''),
      label: `${student.studentName} (${student.rollNo})`,
    })),
  };
  state.currentUploadId = uploadId;
  sessionStorage.setItem(STORAGE_KEYS.currentUploadId, uploadId);
  state.insights = null;
  state.queryReply = '';
  return uploadResponse.upload;
}

function getUploadIdFromResponse(response) {
  return String(response?.uploadId || response?.upload?._id || response?.upload?.id || '').trim();
}

async function waitForDashboardData(uploadId, attempts = 5) {
  const resolvedUploadId = String(uploadId || '').trim();
  if (!resolvedUploadId) {
    throw new Error('Upload finished, but the backend did not return an upload ID.');
  }

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      state.processing.message = attempt === 1
        ? 'Upload completed. Loading verified analytics from the database...'
        : 'Still preparing dashboard data. Checking the database again...';
      state.processing.progress = Math.max(state.processing.progress || 0, attempt === 1 ? 96 : 98);
      renderPage();

      await loadHistory();
      await loadUploadData(resolvedUploadId);
      await loadFilteredDashboardData();

      const hasAnalytics = Boolean(state.currentUpload && getDashboardAnalytics());
      const hasStudents = Array.isArray(getDashboardStudents()) && getDashboardStudents().length > 0;
      if (hasAnalytics && hasStudents) {
        return resolvedUploadId;
      }

      lastError = new Error('Dashboard data is not ready yet.');
    } catch (error) {
      lastError = error;
    }

    await delay(500 * attempt);
  }

  throw lastError || new Error('Upload completed, but dashboard data could not be loaded.');
}

export {
  loadUploadData,
  getUploadIdFromResponse,
  waitForDashboardData,
};
