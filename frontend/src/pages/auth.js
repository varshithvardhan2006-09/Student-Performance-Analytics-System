// ============================================================================
// src/pages/auth.js
// Login / signup screen, session handling, logout.
// ============================================================================

import { requestJson } from '../api/client.js';
import { getApiBaseUrl } from '../api/config.js';
import { PAGE_META, STORAGE_KEYS } from '../constants.js';
import { loadUploadData } from '../data.js';
import { appShell, authScreen, topbarSubtitle, topbarTitle } from '../dom.js';
import { loadHistory } from './history.js';
import { loadProfile, loadProfileStats } from './profile.js';
import { closeSidebar, renderPage, renderSidebar, renderTeacherChip } from '../shell.js';
import { state } from '../state.js';
function setAuthFeedback(message, type = 'info', mode = 'login') {
  const element = document.getElementById(mode === 'signup' ? 'signupFeedback' : 'loginFeedback');
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `inline-feedback ${type}`;
  element.classList.remove('hidden');
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderApiWarning() {
  const loginFeedback = document.getElementById('loginFeedback');
  const apiBaseUrl = getApiBaseUrl();

  if (!loginFeedback || apiBaseUrl) {
    return;
  }

  loginFeedback.textContent = 'Backend URL is not set. Add ?api=https://your-backend-url or save it in localStorage as saps-api-base-url.';
  loginFeedback.className = 'inline-feedback error';
  loginFeedback.classList.remove('hidden');
}

function hideAuthFeedback(mode = 'login') {
  const element = document.getElementById(mode === 'signup' ? 'signupFeedback' : 'loginFeedback');
  if (!element) {
    return;
  }

  element.textContent = '';
  element.className = 'inline-feedback hidden';
}

function setAuthMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'login';

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const authTitle = document.querySelector('[data-auth-title]');
  const authCopy = document.querySelector('[data-auth-copy]');
  const authCard = document.querySelector('.auth-card');

  if (loginForm) {
    loginForm.classList.toggle('hidden', state.authMode !== 'login');
  }
  if (signupForm) {
    signupForm.classList.toggle('hidden', state.authMode !== 'signup');
  }
  if (authTitle) {
    authTitle.textContent = state.authMode === 'signup' ? 'Create Account' : 'Welcome Back!';
  }
  if (authCopy) {
    authCopy.textContent = state.authMode === 'signup'
      ? 'Create your teacher account to start uploading marks'
      : 'Login to access your dashboard';
  }
  if (authCard) {
    authCard.dataset.mode = state.authMode;
  }

  hideAuthFeedback('login');
  hideAuthFeedback('signup');
}

function applyRememberedEmail() {
  const input = document.querySelector('#loginForm input[name="email"]');
  const remember = document.querySelector('#loginForm input[name="rememberMe"]');
  if (!input) {
    return;
  }

  input.value = state.rememberEmail || '';
  if (remember) {
    remember.checked = Boolean(state.rememberEmail);
  }
}

function attachPasswordVisibilityToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const wrap = button.closest('.input-wrap');
      const input = wrap?.querySelector('input');
      if (!input) {
        return;
      }

      const nextType = input.type === 'password' ? 'text' : 'password';
      input.type = nextType;
      button.textContent = nextType === 'password' ? 'Show' : 'Hide';
      button.setAttribute('aria-label', nextType === 'password' ? 'Show password' : 'Hide password');
    });
  });
}

function setSession(user, token) {
  state.user = user;
  state.token = token;
  sessionStorage.setItem(STORAGE_KEYS.token, token);
  sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));

  if (state.rememberEmail) {
    localStorage.setItem(STORAGE_KEYS.rememberEmail, state.rememberEmail);
  }
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.currentUploadId = '';
  state.currentUpload = null;
  state.analytics = null;
  state.students = [];
  state.history = [];
  state.profile = null;
  state.profileStats = null;
  state.insights = null;
  state.queryReply = '';
  sessionStorage.removeItem(STORAGE_KEYS.token);
  sessionStorage.removeItem(STORAGE_KEYS.user);
  sessionStorage.removeItem(STORAGE_KEYS.currentUploadId);
}

function showAuth() {
  authScreen.classList.remove('hidden');
  appShell.classList.add('hidden');
  document.body.style.overflow = 'auto';
}

function showApp() {
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  document.body.style.overflow = 'auto';
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const rememberMe = Boolean(formData.get('rememberMe'));

  if (!email || !password) {
    setAuthFeedback('Please enter both email and password.', 'error', 'login');
    return;
  }

  try {
    const response = await requestJson('/api/login', {
      method: 'POST',
      body: { email, password },
      headers: {},
    });

    state.rememberEmail = rememberMe ? email : '';
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEYS.rememberEmail, email);
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberEmail);
    }

    setSession(response.user, response.token);
    renderTeacherChip();
    showApp();
    state.view = 'upload';
    topbarTitle.textContent = PAGE_META.upload.title;
    topbarSubtitle.textContent = PAGE_META.upload.subtitle;
    renderSidebar();
    renderPage();

    await Promise.allSettled([loadProfile(), loadProfileStats(), loadHistory()]);
    setAuthFeedback('Login successful. You can now upload a subject file.', 'success', 'login');

    if (state.history.length && !state.currentUploadId) {
      const latest = state.history[0];
      if (latest?._id) {
        state.currentUploadId = String(latest._id);
        sessionStorage.setItem(STORAGE_KEYS.currentUploadId, state.currentUploadId);
        await loadUploadData(state.currentUploadId);
        renderPage();
      }
    }
  } catch (error) {
    setAuthMode('login');
    setAuthFeedback(error.message, 'error', 'login');
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (password !== confirmPassword) {
    setAuthFeedback('Passwords do not match.', 'error', 'signup');
    return;
  }

  try {
    await requestJson('/api/signup', {
      method: 'POST',
      body: {
        fullName,
        email,
        password,
        confirmPassword,
      },
      headers: {},
    });

    form.reset();
    setAuthMode('login');
    const loginEmail = document.querySelector('#loginForm input[name="email"]');
    if (loginEmail) {
      loginEmail.value = email;
    }
    setAuthFeedback('Account created successfully. Please log in with your email and password.', 'success', 'login');
  } catch (error) {
    setAuthMode('signup');
    setAuthFeedback(error.message, 'error', 'signup');
  }
}

async function handleLogout() {
  clearSession();
  closeSidebar();
  showAuth();
  state.view = 'login';
  state.processing.active = false;
  if (state.processing.timer) {
    clearInterval(state.processing.timer);
    state.processing.timer = null;
  }
  state.filters = {
    search: '',
    status: 'all',
    category: 'all',
    range: 'all',
  };
  state.currentUploadId = '';
  state.currentUpload = null;
  state.analytics = null;
  state.students = [];
  state.sourceAnalytics = null;
  state.sourceStudents = [];
  state.dashboardAnalytics = null;
  state.dashboardStudents = null;
  state.dashboardFilters = {
    subject: 'all',
    student: 'all',
  };
  state.dashboardFilterOptions = {
    subjects: [],
    students: [],
  };
  state.insights = null;
  state.queryReply = '';
  setAuthMode('login');
  applyRememberedEmail();
}

export {
  setAuthFeedback,
  renderApiWarning,
  setAuthMode,
  applyRememberedEmail,
  attachPasswordVisibilityToggles,
  clearSession,
  showAuth,
  showApp,
  handleLogin,
  handleSignup,
  handleLogout,
};
