// ============================================================================
// src/shell.js
// App shell: view routing, sidebar, topbar, page dispatch.
// ============================================================================

import { renderCharts } from './charts/renderer.js';
import { PAGE_META } from './constants.js';
import { pageHost, sidebar, sidebarBackdrop, teacherInitial, teacherName, topbarSubtitle, topbarTitle } from './dom.js';
import { applyDashboardFilters, renderDashboardPage } from './pages/dashboard.js';
import { deleteHistoryUpload, openHistoryUpload, renderHistoryPage } from './pages/history.js';
import { ensureInsights, renderInsightsPage, submitQueryForm } from './pages/insights.js';
import { renderProcessingPage } from './pages/processing.js';
import { renderProfilePage } from './pages/profile.js';
import { downloadCurrentReport, downloadReport } from './pages/reports.js';
import { renderUploadPage, submitUploadForm } from './pages/upload.js';
import { resetStudentTableFilters } from './selectors.js';
import { state } from './state.js';
import { escapeHtml } from './utils/format.js';
function setView(view) {
  state.view = view;
  const meta = PAGE_META[view] || PAGE_META.upload;
  topbarTitle.textContent = meta.title;
  topbarSubtitle.textContent = meta.subtitle;
  renderSidebar();
  renderTopbarToggle();
  renderPage();

  if (view === 'insights') {
    ensureInsights().catch(() => {});
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSidebar() {
  const homeButton = document.querySelector('.nav-item[data-home-nav="true"]');
  if (homeButton) {
    const homeView = ['upload', 'processing'].includes(state.view) ? 'upload' : 'dashboard';
    homeButton.dataset.view = homeView;
    homeButton.textContent = homeView === 'upload' ? 'Home / Upload' : 'Home / Dashboard';
    homeButton.classList.toggle('active', ['upload', 'processing', 'dashboard', 'insights'].includes(state.view));
  }

  document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
    if (button === homeButton) {
      return;
    }
    button.classList.toggle('active', button.dataset.view === state.view);
  });
}

function renderTopbarToggle() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (!sidebarToggle) {
    return;
  }

  if (state.view === 'processing') {
    sidebarToggle.textContent = '←';
    sidebarToggle.setAttribute('aria-label', 'Back to upload');
    return;
  }

  sidebarToggle.textContent = '☰';
  sidebarToggle.setAttribute('aria-label', 'Toggle navigation');
}

function renderTeacherChip() {
  const name = state.user?.fullName || state.profile?.fullName || 'Teacher';
  teacherName.textContent = name;
  teacherInitial.textContent = name.trim().charAt(0).toUpperCase() || 'T';
}

function renderEmptyState(title, message, buttonLabel, targetView) {
  return `
    <section class="page">
      <div class="page-card dashboard-empty">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
        <div class="history-actions" style="margin-top:1rem;">
          <button class="primary-btn" type="button" data-view="${escapeHtml(targetView)}">${escapeHtml(buttonLabel)}</button>
        </div>
      </div>
    </section>
  `;
}

function renderPage() {
  if (!pageHost) {
    return;
  }

  const renderMap = {
    upload: renderUploadPage,
    dashboard: renderDashboardPage,
    insights: renderInsightsPage,
    history: renderHistoryPage,
    profile: renderProfilePage,
    processing: renderProcessingPage,
  };

  const template = renderMap[state.view] || renderUploadPage;
  pageHost.innerHTML = template();

  if (state.view === 'dashboard' || state.view === 'insights') {
    requestAnimationFrame(() => renderCharts());
  }
}

async function handleSidebarClick(event) {
  const chooseFileButton = event.target.closest('#chooseFileBtn');
  if (chooseFileButton) {
    const marksFileInput = document.getElementById('marksFile');
    marksFileInput?.click();
    return;
  }

  const uploadSubmitButton = event.target.closest('[data-upload-submit]');
  if (uploadSubmitButton) {
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
      await submitUploadForm(uploadForm);
    }
    return;
  }

  const dashboardFilterReset = event.target.closest('[data-dashboard-filter-reset]');
  if (dashboardFilterReset) {
    state.dashboardFilters = {
      subject: 'all',
      student: 'all',
    };
    resetStudentTableFilters();
    await applyDashboardFilters();
    return;
  }

  const querySubmitButton = event.target.closest('[data-query-submit]');
  if (querySubmitButton) {
    const queryForm = document.getElementById('queryForm');
    if (queryForm) {
      await submitQueryForm(queryForm);
    }
    return;
  }

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    const view = viewButton.dataset.view;
    if (view === 'dashboard' || view === 'insights' || view === 'history' || view === 'profile' || view === 'upload') {
      setView(view);
    }
    closeSidebar();
    return;
  }

  const downloadButton = event.target.closest('[data-download-report]');
  if (downloadButton) {
    const format = downloadButton.dataset.downloadReport;
    await downloadCurrentReport(format);
    return;
  }

  const selectedReportButton = event.target.closest('[data-download-selected-report]');
  if (selectedReportButton) {
    const select = document.getElementById('reportTypeSelect');
    const format = select?.value || 'pdf';
    await downloadCurrentReport(format);
    return;
  }

  const generateInsightsButton = event.target.closest('[data-generate-insights]');
  if (generateInsightsButton) {
    try {
      // AI generation is slow -- show a skeleton while it runs.
      renderLoadingSkeleton('list');
      await ensureInsights(true);
      setView('insights');
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const historyAction = event.target.closest('[data-history-action]');
  if (historyAction) {
    const action = historyAction.dataset.historyAction;
    const uploadId = historyAction.dataset.uploadId;
    if (!uploadId) {
      return;
    }

    if (action === 'view') {
      await openHistoryUpload(uploadId);
      return;
    }
    if (action === 'delete') {
      await deleteHistoryUpload(uploadId);
      return;
    }
    await downloadReport(uploadId, action);
    return;
  }

  const queryButton = event.target.closest('#queryForm button[type="submit"]');
  if (queryButton) {
    return;
  }
}

function openSidebar() {
  sidebar?.classList.add('open');
  sidebarBackdrop?.classList.remove('hidden');
  state.sidebarOpen = true;
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  sidebarBackdrop?.classList.add('hidden');
  state.sidebarOpen = false;
}

/**
 * Show a skeleton placeholder while a page's data is still being fetched,
 * instead of leaving the main area blank.
 * @param {string} variant 'cards' for the dashboard/insights, 'list' otherwise
 */
function renderLoadingSkeleton(variant = 'cards') {
  if (!pageHost) {
    return;
  }

  const block = (cls) => `<div class="skeleton ${cls}"></div>`;
  const body = variant === 'cards'
    ? `<div class="skeleton-grid">${block('skeleton-card').repeat(4)}</div>
       <div class="skeleton-row">${block('skeleton-panel')}${block('skeleton-panel')}</div>`
    : `<div class="skeleton-list">${block('skeleton-line').repeat(6)}</div>`;

  pageHost.innerHTML = `
    <section class="page-section" aria-busy="true" aria-live="polite">
      ${block('skeleton-title')}
      ${body}
      <span class="sr-only">Loading, please wait.</span>
    </section>
  `;
}

export {
  renderLoadingSkeleton,
  setView,
  renderSidebar,
  renderTeacherChip,
  renderEmptyState,
  renderPage,
  handleSidebarClick,
  openSidebar,
  closeSidebar,
};
