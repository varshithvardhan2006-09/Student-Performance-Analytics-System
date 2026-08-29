// ============================================================================
// frontend/script.js  --  application entry point
// ============================================================================
// This module only wires the pieces together and boots the app; all behaviour
// lives in frontend/src/. Loaded from index.html with <script type="module">,
// which also defers execution until the DOM has been parsed.
//
//   src/constants.js   storage keys, page metadata
//   src/state.js       the shared mutable state object
//   src/dom.js         cached shell element references
//   src/api/           base URL resolution + fetch wrappers
//   src/utils/         pure formatting helpers
//   src/selectors.js   derived views over state
//   src/shell.js       view routing, sidebar, page dispatch
//   src/charts/        Chart.js rendering
//   src/pages/         one module per view
// ============================================================================

import { persistApiBaseUrlOverride } from './src/api/config.js';
import { loadUploadData } from './src/data.js';
import { pageHost, sidebar, sidebarBackdrop } from './src/dom.js';
import { applyRememberedEmail, attachPasswordVisibilityToggles, clearSession, handleLogin, handleLogout, handleSignup, renderApiWarning, setAuthFeedback, setAuthMode, showApp, showAuth } from './src/pages/auth.js';
import { applyDashboardFilters } from './src/pages/dashboard.js';
import { loadHistory } from './src/pages/history.js';
import { submitQueryForm } from './src/pages/insights.js';
import { loadProfile, loadProfileStats } from './src/pages/profile.js';
import { handleUpload, updateSelectedFileLabel } from './src/pages/upload.js';
import { resetStudentTableFilters } from './src/selectors.js';
import { closeSidebar, handleSidebarClick, openSidebar, renderPage, renderSidebar, renderTeacherChip, setView } from './src/shell.js';
import { state } from './src/state.js';
async function initializeApp() {
  // Honour ?api=... once, so a deployed page can be pointed at a backend.
  persistApiBaseUrlOverride();

  attachPasswordVisibilityToggles();
  setAuthMode('login');
  applyRememberedEmail();
  renderTeacherChip();
  renderApiWarning();

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const loginSwitchButtons = document.querySelectorAll('[data-switch-auth]');
  const forgotPasswordButtons = document.querySelectorAll('[data-forgot-password]');

  loginForm?.addEventListener('submit', handleLogin);
  signupForm?.addEventListener('submit', handleSignup);
  logoutBtn?.addEventListener('click', handleLogout);
  sidebar?.addEventListener('click', handleSidebarClick);
  sidebarToggle?.addEventListener('click', () => {
    if (state.view === 'processing') {
      setView('upload');
      return;
    }

    if (state.sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  sidebarBackdrop?.addEventListener('click', closeSidebar);

  loginSwitchButtons.forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.switchAuth));
  });

  forgotPasswordButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setAuthFeedback('Please use the demo login or sign up with your email to create a new account.', 'info', 'login');
      setAuthMode('login');
    });
  });

  pageHost.addEventListener('click', handleSidebarClick);
  pageHost.addEventListener('dragover', (event) => {
    const dropZone = event.target.closest('#dropZone');
    if (!dropZone) {
      return;
    }
    event.preventDefault();
    dropZone.classList.add('dragover');
  });
  pageHost.addEventListener('dragleave', (event) => {
    const dropZone = event.target.closest('#dropZone');
    if (dropZone) {
      dropZone.classList.remove('dragover');
    }
  });
  pageHost.addEventListener('drop', (event) => {
    const dropZone = event.target.closest('#dropZone');
    if (!dropZone) {
      return;
    }
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const marksFileInput = document.getElementById('marksFile');
    if (event.dataTransfer?.files?.length && marksFileInput) {
      marksFileInput.files = event.dataTransfer.files;
      updateSelectedFileLabel(marksFileInput.files);
    }
  });
  pageHost.addEventListener('keydown', async (event) => {
    if (event.target.matches('#queryInput') && event.key === 'Enter') {
      event.preventDefault();
      const queryForm = document.getElementById('queryForm');
      if (queryForm) {
        await submitQueryForm(queryForm);
      }
    }
  });
  pageHost.addEventListener('submit', async (event) => {
    if (event.target.id === 'uploadForm') {
      await handleUpload(event);
      return;
    }
    if (event.target.id === 'queryForm') {
      event.preventDefault();
      await submitQueryForm(event.target);
    }
  });

  pageHost.addEventListener('input', (event) => {
    if (event.target.matches('#studentSearch')) {
      const cursorPosition = event.target.selectionStart;
      state.filters.search = event.target.value;
      renderPage();
      requestAnimationFrame(() => {
        const searchInput = document.getElementById('studentSearch');
        if (searchInput) {
          searchInput.focus();
          const nextPosition = Math.min(cursorPosition ?? state.filters.search.length, state.filters.search.length);
          searchInput.setSelectionRange(nextPosition, nextPosition);
        }
      });
      return;
    }
  });

  pageHost.addEventListener('change', async (event) => {
    if (event.target.matches('#marksFile')) {
      updateSelectedFileLabel(event.target.files || null);
      const feedback = document.getElementById('uploadFeedback');
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'inline-feedback hidden';
      }
      return;
    }
    if (event.target.matches('#statusFilter')) {
      state.filters.status = event.target.value;
      renderPage();
      return;
    }
    if (event.target.matches('#categoryFilter')) {
      state.filters.category = event.target.value;
      renderPage();
      return;
    }
    if (event.target.matches('#rangeFilter')) {
      state.filters.range = event.target.value;
      renderPage();
      return;
    }
    if (event.target.matches('#dashboardSubjectFilter')) {
      state.dashboardFilters.subject = event.target.value;
      resetStudentTableFilters();
      await applyDashboardFilters();
      return;
    }
    if (event.target.matches('#dashboardStudentFilter')) {
      state.dashboardFilters.student = event.target.value;
      resetStudentTableFilters();
      await applyDashboardFilters();
      return;
    }
    if (event.target.matches('#reportTypeSelect')) {
      return;
    }
  });

  if (state.token) {
    showApp();
    state.view = 'upload';
    renderSidebar();
    renderPage();

    try {
      await Promise.allSettled([loadProfile(), loadProfileStats(), loadHistory()]);
      renderTeacherChip();
      renderPage();

      if (state.currentUploadId) {
        await loadUploadData(state.currentUploadId);
        renderPage();
      }
    } catch (error) {
      clearSession();
      showAuth();
      setAuthFeedback(error.message || 'Please log in again.', 'error', 'login');
    }
  } else {
    showAuth();
    renderPage();
  }

  renderTeacherChip();
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSidebar();
  }
});

document.addEventListener('DOMContentLoaded', initializeApp);
