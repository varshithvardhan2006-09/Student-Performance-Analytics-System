const STORAGE_KEYS = {
  token: 'saps-token',
  user: 'saps-user',
  rememberEmail: 'saps-remember-email',
  currentUploadId: 'saps-current-upload-id',
  apiBaseUrl: 'saps-api-base-url',
};

const PAGE_META = {
  upload: {
    title: 'Welcome, Teacher!',
    subtitle: 'Upload subject marks and get AI-powered insights.',
  },
  dashboard: {
    title: 'Analytics Dashboard',
    subtitle: 'Here is the performance analytics for the uploaded subject.',
  },
  insights: {
    title: 'AI Insights & Reports',
    subtitle: 'Generate AI insights and comprehensive reports for your data.',
  },
  history: {
    title: 'Upload History',
    subtitle: 'Review every uploaded subject analysis.',
  },
  profile: {
    title: 'Profile',
    subtitle: 'View your account details and activity.',
  },
  processing: {
    title: 'File Validation & Processing',
    subtitle: 'Please wait while we validate and process your uploaded file.',
  },
};

const state = {
  token: sessionStorage.getItem(STORAGE_KEYS.token) || '',
  user: JSON.parse(sessionStorage.getItem(STORAGE_KEYS.user) || 'null'),
  rememberEmail: localStorage.getItem(STORAGE_KEYS.rememberEmail) || '',
  authMode: 'login',
  view: 'upload',
  sidebarOpen: false,
  currentUploadId: sessionStorage.getItem(STORAGE_KEYS.currentUploadId) || '',
  currentUpload: null,
  analytics: null,
  students: [],
  history: [],
  profile: null,
  profileStats: null,
  insights: null,
  queryReply: '',
  filters: {
    search: '',
    status: 'all',
    category: 'all',
    range: 'all',
  },
  processing: {
    active: false,
    progress: 0,
    step: 0,
    message: 'Preparing upload...',
    fileName: '',
    fileSize: 0,
    timer: null,
  },
  charts: [],
};

function getApiBaseUrl() {
  const configuredUrl = [
    window.SAPS_CONFIG?.apiBaseUrl,
    localStorage.getItem(STORAGE_KEYS.apiBaseUrl),
    sessionStorage.getItem(STORAGE_KEYS.apiBaseUrl),
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  return '';
}

function resolveApiUrl(pathname) {
  if (!pathname) {
    return '';
  }

  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

const pageHost = document.getElementById('pageHost');
const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const topbarTitle = document.getElementById('topbarTitle');
const topbarSubtitle = document.getElementById('topbarSubtitle');
const teacherInitial = document.getElementById('teacherInitial');
const teacherName = document.getElementById('teacherName');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value, options = {}) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
}

function formatDateOnly(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPercent(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '--';
  }

  return `${number.toFixed(digits)}%`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return [];
  }

  return details
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        return item.message || item.reason || JSON.stringify(item);
      }
      return String(item);
    })
    .filter(Boolean);
}

function getAuthHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${state.token}`,
  };
}

async function requestJson(pathname, options = {}) {
  const {
    body,
    headers = {},
    method = 'GET',
  } = options;

  const fetchOptions = {
    method,
    headers: getAuthHeaders(headers),
  };

  if (body instanceof FormData) {
    fetchOptions.body = body;
    delete fetchOptions.headers['Content-Type'];
  } else if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
    fetchOptions.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(resolveApiUrl(pathname), fetchOptions);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || data?.error || text || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.details = data?.errors || data?.details || data || null;
    error.status = response.status;
    throw error;
  }

  return data;
}

async function requestBlob(pathname, filename) {
  const response = await fetch(resolveApiUrl(pathname), {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : null;
      message = parsed?.message || parsed?.error || text || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setAuthFeedback(message, type = 'info', mode = 'login') {
  const element = document.getElementById(mode === 'signup' ? 'signupFeedback' : 'loginFeedback');
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `inline-feedback ${type}`;
  element.classList.remove('hidden');
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

function getCategoryClass(category) {
  const lower = String(category || '').toLowerCase();
  if (lower.includes('top')) {
    return 'top';
  }
  if (lower.includes('weak')) {
    return 'weak';
  }
  if (lower.includes('fail')) {
    return 'fail';
  }
  return 'average';
}

function getStatusClass(status) {
  return String(status || '').toLowerCase() === 'pass' ? 'pass' : 'fail';
}

function getCurrentUpload() {
  return state.currentUpload || null;
}

function getCurrentUploadId() {
  return state.currentUploadId || state.currentUpload?._id || '';
}

function getAverageMarks() {
  const number = Number(state.analytics?.averageMarks);
  return Number.isFinite(number) ? number : 0;
}

function getWeakCount() {
  return state.students.filter((student) => Number(student.percentage) < 40 || String(student.category || '').toLowerCase().includes('weak')).length;
}

function getTopPerformers(limit = 5) {
  return [...state.students]
    .sort((left, right) => Number(right.marks) - Number(left.marks) || Number(left.rank) - Number(right.rank))
    .slice(0, limit);
}

function getWeakStudents(limit = 5) {
  return [...state.students]
    .filter((student) => Number(student.percentage) < 40 || String(student.status).toLowerCase() === 'fail')
    .sort((left, right) => Number(left.marks) - Number(right.marks))
    .slice(0, limit);
}

function getFilteredStudents() {
  const search = state.filters.search.trim().toLowerCase();
  return [...state.students].filter((student) => {
    const rollNo = String(student.rollNo || '').toLowerCase();
    const studentName = String(student.studentName || '').toLowerCase();
    const status = String(student.status || '').toLowerCase();
    const category = String(student.category || '').toLowerCase();
    const marks = Number(student.percentage);

    if (search && !rollNo.includes(search) && !studentName.includes(search)) {
      return false;
    }
    if (state.filters.status !== 'all' && status !== state.filters.status) {
      return false;
    }
    if (state.filters.category !== 'all' && category !== state.filters.category) {
      return false;
    }
    if (state.filters.range !== 'all') {
      if (state.filters.range === '0-39' && marks >= 40) return false;
      if (state.filters.range === '40-59' && (marks < 40 || marks >= 60)) return false;
      if (state.filters.range === '60-79' && (marks < 60 || marks >= 80)) return false;
      if (state.filters.range === '80-100' && marks < 80) return false;
    }
    return true;
  });
}

function getCategoryCounts() {
  const counts = {
    'Top Performer': 0,
    'Average Performer': 0,
    'Weak Student': 0,
    Failed: 0,
  };

  for (const student of state.students) {
    if (counts[student.category] !== undefined) {
      counts[student.category] += 1;
    } else if (String(student.status).toLowerCase() === 'pass') {
      counts['Average Performer'] += 1;
    } else {
      counts.Failed += 1;
    }
  }

  return counts;
}

function getTrendData() {
  const uploads = [...state.history]
    .filter((upload) => upload.analytics?.averageMarks !== undefined)
    .sort((left, right) => new Date(left.uploadDate) - new Date(right.uploadDate));

  const labels = uploads.map((upload) => formatDateOnly(upload.uploadDate));
  const values = uploads.map((upload) => Number(upload.analytics.averageMarks) || 0);

  if (!labels.length && state.currentUpload && state.analytics) {
    return {
      labels: [formatDateOnly(state.currentUpload.uploadDate)],
      values: [Number(state.analytics.averageMarks) || 0],
    };
  }

  return { labels, values };
}

function getImprovementRate() {
  const trend = getTrendData();
  if (trend.values.length < 2) {
    const average = getAverageMarks();
    return Math.round(average / 5);
  }

  const last = trend.values.at(-1);
  const prev = trend.values.at(-2);
  return Math.round(last - prev);
}

function destroyCharts() {
  for (const chart of state.charts) {
    chart.destroy();
  }
  state.charts = [];
}

function chartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#334155',
          font: {
            family: 'Manrope, sans-serif',
          },
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#fff',
        bodyColor: '#fff',
      },
      ...extra.plugins,
    },
    ...extra,
  };
}

function renderCharts() {
  destroyCharts();
  if (!window.Chart) {
    return;
  }

  const analytics = state.analytics;
  const students = state.students;
  if (!analytics || !students.length) {
    return;
  }

  const pieCanvas = document.getElementById('passFailChart');
  const barCanvas = document.getElementById('distributionChart');
  const topCanvas = document.getElementById('topPerformerChart');
  const categoryCanvas = document.getElementById('categoryChart');
  const trendCanvas = document.getElementById('trendChart');

  if (pieCanvas) {
    state.charts.push(new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: ['Passed', 'Failed'],
        datasets: [{
          data: [analytics.passedStudents || 0, analytics.failedStudents || 0],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      }),
    }));
  }

  if (barCanvas) {
    const distribution = analytics.marksDistribution || {};
    state.charts.push(new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: ['0-35', '36-50', '51-70', '71-85', '86-100'],
        datasets: [{
          label: 'Students',
          data: [
            distribution.range_0_35 || 0,
            distribution.range_36_50 || 0,
            distribution.range_51_70 || 0,
            distribution.range_71_85 || 0,
            distribution.range_86_100 || 0,
          ],
          backgroundColor: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#0f55e9'],
          borderRadius: 10,
        }],
      },
      options: chartOptions({
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' },
          },
        },
      }),
    }));
  }

  if (topCanvas) {
    const topStudents = getTopPerformers(10).reverse();
    state.charts.push(new Chart(topCanvas, {
      type: 'bar',
      data: {
        labels: topStudents.map((student) => `${student.studentName}`),
        datasets: [{
          label: 'Marks',
          data: topStudents.map((student) => Number(student.marks) || 0),
          backgroundColor: '#22c55e',
          borderRadius: 12,
        }],
      },
      options: chartOptions({
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.18)' },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
        },
      }),
    }));
  }

  if (categoryCanvas) {
    const counts = getCategoryCounts();
    state.charts.push(new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ['#2563eb', '#22c55e', '#f59e0b', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      }),
    }));
  }

  if (trendCanvas) {
    const trend = getTrendData();
    state.charts.push(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: [{
          label: 'Average Marks',
          data: trend.values,
          tension: 0.35,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.18)' },
          },
        },
      }),
    }));
  }
}

function renderSummaryCards() {
  const analytics = state.analytics;
  if (!analytics) {
    return '';
  }

  const total = analytics.totalStudents || state.students.length || 0;
  const weak = getWeakCount();

  const cards = [
    { label: 'Total Students', value: total, note: 'Students in the current subject', accent: 'low' },
    { label: 'Passed Students', value: analytics.passedStudents || 0, note: `${formatPercent(analytics.passPercentage || 0)} pass rate`, accent: 'pass' },
    { label: 'Failed Students', value: analytics.failedStudents || 0, note: `${formatPercent(analytics.failPercentage || 0)} fail rate`, accent: 'fail' },
    { label: 'Average Marks', value: formatPercent(analytics.averageMarks || 0), note: 'Class average for the upload', accent: 'avg' },
    { label: 'Highest Marks', value: analytics.highestMarks ?? 0, note: 'Best score in the file', accent: 'high' },
    { label: 'Weak Students', value: weak, note: 'Students below 40%', accent: 'weak' },
  ];

  return cards.map((card) => `
    <article class="summary-card ${card.accent}">
      <span class="summary-label">${escapeHtml(card.label)}</span>
      <strong class="summary-value">${escapeHtml(card.value)}</strong>
      <span class="summary-note">${escapeHtml(card.note)}</span>
      <span class="summary-accent"></span>
    </article>
  `).join('');
}

function renderUploadPage() {
  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Home / Upload</p>
          <h1 class="page-title">Upload Subject Marks</h1>
          <p class="page-copy">Upload marks file for a single subject to generate performance analytics.</p>
          <div class="hero-info">
            <span class="badge">CSV</span>
            <span class="badge">Excel</span>
            <span class="badge">Structured PDF</span>
            <span class="badge">Single subject</span>
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
                <span>Subject Name *</span>
                <input name="subjectName" type="text" placeholder="Enter subject name" required>
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
                <input name="passingMarks" type="number" min="0" max="1000" placeholder="Enter passing marks" value="35" required>
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
                <small>Maximum file size: 10MB</small>
                <input id="marksFile" name="file" type="file" accept=".csv,.xlsx,.xls,.pdf" class="hidden">
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
              <li><span class="check-icon">✓</span><span>Required columns: Roll No, Student Name, Marks.</span></li>
              <li><span class="check-icon">✓</span><span>Marks should be numeric and within the maximum marks range.</span></li>
              <li><span class="check-icon">✓</span><span>No duplicate roll numbers.</span></li>
            </ul>
          </section>

          <section class="check-card alt">
            <p class="eyebrow">Required Columns</p>
            <h3>Your file must contain</h3>
            <ul class="check-list">
              <li><span class="check-icon">1</span><span><strong>Roll No</strong></span></li>
              <li><span class="check-icon">2</span><span><strong>Student Name</strong></span></li>
              <li><span class="check-icon">3</span><span><strong>Marks</strong></span></li>
            </ul>
          </section>

          <section class="check-card note">
            <p class="eyebrow">Note</p>
            <h3>After upload</h3>
            <p>Once the file is processed, the system will take you to the analytics dashboard automatically.</p>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderProcessingPage() {
  const upload = state.processing;
  const progress = Math.max(0, Math.min(100, upload.progress || 0));
  const validationItems = [
    { title: 'File type is valid', done: progress >= 18, state: progress >= 18 ? 'Completed' : 'Pending' },
    { title: 'File is not empty', done: progress >= 22, state: progress >= 22 ? 'Completed' : 'Pending' },
    { title: 'Required columns found', done: progress >= 42, state: progress >= 42 ? 'Completed' : 'Pending' },
    { title: 'Marks are numeric', done: progress >= 58, state: progress >= 58 ? 'Completed' : 'Pending' },
    { title: 'No duplicate roll numbers', done: progress >= 72, state: progress >= 72 ? 'Completed' : 'Pending' },
    { title: 'Marks are within the valid range', done: progress >= 86, state: progress >= 86 ? 'Completed' : 'Pending' },
  ];
  const stepData = [
    { title: 'File Uploaded', state: progress >= 20 ? 'Completed' : 'Pending', done: progress >= 20, active: progress >= 10 && progress < 20 },
    { title: 'Validating File', state: progress >= 45 ? 'Completed' : progress >= 20 ? 'In Progress' : 'Pending', done: progress >= 45, active: progress >= 20 && progress < 45 },
    { title: 'Processing Data', state: progress >= 80 ? 'Completed' : progress >= 45 ? 'In Progress' : 'Pending', done: progress >= 80, active: progress >= 45 && progress < 80 },
    { title: 'Completed', state: progress >= 100 ? 'Completed' : 'Pending', done: progress >= 100, active: progress >= 80 && progress < 100 },
  ];

  return `
    <section class="page">
      <div class="processing-card">
        <div class="page-head">
          <div>
            <p class="eyebrow">File Validation &amp; Processing</p>
            <h3>Please wait while we validate and process your uploaded file.</h3>
            <p>${escapeHtml(upload.fileName || 'Selected file')}</p>
          </div>
          <div class="badge-row">
            <span class="badge">${escapeHtml(upload.fileSize ? `${Math.max(1, Math.round(upload.fileSize / 1024))} KB` : 'Processing')}</span>
            <span class="badge">${progress}%</span>
          </div>
        </div>

        <div class="progress-shell">
          <div class="status-line">
            <span>Processing Student Records...</span>
            <span>${progress}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar" style="width:${progress}%"></div>
          </div>
        </div>

        <div class="section-split" style="margin-top:1rem;">
          <section class="check-card">
            <p class="eyebrow">Validation Results</p>
            <h3>Checks completed before analytics</h3>
            <ul class="check-list">
              ${validationItems.map((item) => `
                <li class="${item.done ? 'done' : ''}">
                  <span class="check-icon">${item.done ? '✓' : '○'}</span>
                  <span>${escapeHtml(item.title)}</span>
                  <span class="step-state">${escapeHtml(item.state)}</span>
                </li>
              `).join('')}
            </ul>
          </section>

          <section class="check-card alt">
            <p class="eyebrow">Processing Status</p>
            <h3>Current workflow</h3>
            <div class="step-list">
              ${stepData.map((step) => `
                <div class="step-item ${step.done ? 'done' : step.active ? 'active' : ''}">
                  <div class="left">
                    <span class="step-bullet">${step.done ? '✓' : step.active ? '•' : '○'}</span>
                    <span>${escapeHtml(step.title)}</span>
                  </div>
                  <span class="step-state">${escapeHtml(step.state)}</span>
                </div>
              `).join('')}
            </div>
          </section>
        </div>

        <div class="processing-summary" style="margin-top:1rem;">
          ${escapeHtml(upload.message || 'We are validating and processing your file. Please wait a moment.')}
        </div>
      </div>
    </section>
  `;
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

function renderDashboardPage() {
  const upload = getCurrentUpload();
  if (!upload || !state.analytics || !state.students.length) {
    return renderEmptyState(
      'No analytics loaded yet',
      'Upload a subject file or pick one from the history page to see the dashboard.',
      'Go to Upload',
      'upload'
    );
  }

  const passMarks = upload.passingMarks ?? 35;
  const maxMarks = upload.maxMarks ?? 100;
  const currentAverage = Number(state.analytics.averageMarks) || 0;
  const improvementRate = getImprovementRate();
  const categoryCounts = getCategoryCounts();
  const topPerformers = getTopPerformers(5);
  const weakStudents = getWeakStudents(5);
  const filteredStudents = getFilteredStudents();
  const weakCount = getWeakCount();
  const passPercentage = Number(state.analytics.passPercentage) || 0;
  const failPercentage = Number(state.analytics.failPercentage) || 0;

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Welcome, Teacher!</p>
          <h1 class="page-title">Subject: ${escapeHtml(upload.subjectName)}</h1>
          <p class="page-copy">Class: ${escapeHtml(upload.className)} | Uploaded on: ${escapeHtml(formatDate(upload.uploadDate))}</p>
          <div class="hero-info">
            <span class="badge">Pass Marks: ${escapeHtml(passMarks)}</span>
            <span class="badge">Max Marks: ${escapeHtml(maxMarks)}</span>
            <span class="badge">Records: ${escapeHtml(state.students.length)}</span>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="upload">Upload Another File</button>
          <button class="ghost-btn" type="button" data-generate-insights>Open AI Insights</button>
          <button class="primary-btn" type="button" data-download-report="pdf">Download PDF Report</button>
        </div>
      </div>

      <div class="summary-grid">
        ${renderSummaryCards()}
      </div>

      <div class="subnote-bar">
        Pass Marks: ${escapeHtml(passMarks)} | Max Marks: ${escapeHtml(maxMarks)} | Pass Percentage: ${escapeHtml(formatPercent(passPercentage))} | Fail Percentage: ${escapeHtml(formatPercent(failPercentage))}
      </div>

      <div class="section-grid">
        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Performance</p>
              <h3>Pass / Fail Distribution</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="passFailChart"></canvas>
          </div>
        </section>

        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Analysis</p>
              <h3>Marks Distribution</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="distributionChart"></canvas>
          </div>
        </section>

        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Top Performers</p>
              <h3>Top 5 Students</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="topPerformerChart"></canvas>
          </div>
        </section>
      </div>

      <div class="section-grid">
        <section class="chart-card large">
          <div class="card-head">
            <div>
              <p class="eyebrow">Performance Table</p>
              <h3>Top Performers</h3>
            </div>
          </div>
          <div class="stack-list">
            ${topPerformers.map((student, index) => `
              <div class="performer-row">
                <span class="index">${index + 1}</span>
                <div>
                  <strong>${escapeHtml(student.studentName)}</strong>
                  <p style="margin:0;color:var(--muted);">Roll No ${escapeHtml(student.rollNo)} | Rank ${escapeHtml(student.rank)}</p>
                </div>
                <strong>${escapeHtml(formatPercent(student.percentage))}</strong>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="chart-card large">
          <div class="card-head">
            <div>
              <p class="eyebrow">Support List</p>
              <h3>Weak Students</h3>
            </div>
          </div>
          <div class="stack-list">
            ${weakStudents.length ? weakStudents.map((student, index) => `
              <div class="performer-row">
                <span class="index">${index + 1}</span>
                <div>
                  <strong>${escapeHtml(student.studentName)}</strong>
                  <p style="margin:0;color:var(--muted);">Roll No ${escapeHtml(student.rollNo)} | Status ${escapeHtml(student.status)}</p>
                </div>
                <strong>${escapeHtml(formatPercent(student.percentage))}</strong>
              </div>
            `).join('') : `<div class="upload-empty"><strong>No weak students found</strong><p>All students are above the weak-student threshold for this upload.</p></div>`}
          </div>
        </section>

        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Status</p>
              <h3>Category Distribution</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="categoryChart"></canvas>
          </div>
        </section>
      </div>

      <section class="table-card">
        <div class="table-head">
          <div>
            <p class="eyebrow">All Students Performance</p>
            <h3>Student Performance Table</h3>
          </div>
          <div class="table-toolbar">
            <input id="studentSearch" type="search" placeholder="Search by roll no or name..." value="${escapeHtml(state.filters.search)}">
            <div class="toolbar-group">
              <select id="statusFilter">
                <option value="all"${state.filters.status === 'all' ? ' selected' : ''}>All Status</option>
                <option value="pass"${state.filters.status === 'pass' ? ' selected' : ''}>Pass</option>
                <option value="fail"${state.filters.status === 'fail' ? ' selected' : ''}>Fail</option>
              </select>
              <select id="categoryFilter">
                <option value="all"${state.filters.category === 'all' ? ' selected' : ''}>All Category</option>
                <option value="Top Performer"${state.filters.category === 'Top Performer' ? ' selected' : ''}>Top Performer</option>
                <option value="Average Performer"${state.filters.category === 'Average Performer' ? ' selected' : ''}>Average Performer</option>
                <option value="Weak Student"${state.filters.category === 'Weak Student' ? ' selected' : ''}>Weak Student</option>
                <option value="Failed"${state.filters.category === 'Failed' ? ' selected' : ''}>Failed</option>
              </select>
              <select id="rangeFilter">
                <option value="all"${state.filters.range === 'all' ? ' selected' : ''}>All Range</option>
                <option value="0-39"${state.filters.range === '0-39' ? ' selected' : ''}>0-39</option>
                <option value="40-59"${state.filters.range === '40-59' ? ' selected' : ''}>40-59</option>
                <option value="60-79"${state.filters.range === '60-79' ? ' selected' : ''}>60-79</option>
                <option value="80-100"${state.filters.range === '80-100' ? ' selected' : ''}>80-100</option>
              </select>
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Marks</th>
                <th>Percentage</th>
                <th>Status</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents.map((student) => `
                <tr>
                  <td>${escapeHtml(student.rank)}</td>
                  <td>${escapeHtml(student.rollNo)}</td>
                  <td>${escapeHtml(student.studentName)}</td>
                  <td>${escapeHtml(student.marks)}</td>
                  <td>${escapeHtml(formatPercent(student.percentage))}</td>
                  <td><span class="status-pill ${getStatusClass(student.status)}">${escapeHtml(student.status)}</span></td>
                  <td><span class="category-pill ${getCategoryClass(student.category)}">${escapeHtml(student.category)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  `;
}

function renderInsightSection(title, text, extraClass = '') {
  return `
    <article class="insight-card ${extraClass}">
      <p class="eyebrow">${escapeHtml(title)}</p>
      <div class="ai-answer">${escapeHtml(text || 'No data yet.').replace(/\n/g, '<br>')}</div>
    </article>
  `;
}

function buildFallbackInsights() {
  const analytics = state.analytics;
  if (!analytics) {
    return {
      overallSummary: 'Upload a subject file to generate AI insights.',
      weakStudentAnalysis: 'Weak student analysis will appear after data is uploaded.',
      recommendations: 'Recommendations will appear after the file is processed.',
      improvementStrategy: 'Improvement strategy will appear after the file is processed.',
      actionPlan: 'Action plan will appear after the file is processed.',
    };
  }

  const weakStudents = getWeakCount();
  const passPercentage = Number(analytics.passPercentage) || 0;
  const averageMarks = Number(analytics.averageMarks) || 0;
  const highest = Number(analytics.highestMarks) || 0;
  const lowest = Number(analytics.lowestMarks) || 0;

  let overallSummary = `The overall performance in ${state.currentUpload.subjectName} is moderate with a pass percentage of ${formatPercent(passPercentage)}. The class average is ${formatPercent(averageMarks)}.`;
  if (passPercentage >= 80) {
    overallSummary = `The overall performance in ${state.currentUpload.subjectName} is strong with a pass percentage of ${formatPercent(passPercentage)}.`;
  } else if (passPercentage < 50) {
    overallSummary = `The overall performance in ${state.currentUpload.subjectName} needs immediate attention because the pass percentage is ${formatPercent(passPercentage)}.`;
  }

  const weakStudentAnalysis = `${weakStudents} students are in the weak-student range. The gap between the highest mark (${highest}) and lowest mark (${lowest}) should be monitored carefully.`;
  const recommendations = [
    'Schedule focused remedial sessions for students below the passing threshold.',
    'Review topics where average performance is low and add practice exercises.',
    'Use peer tutoring by pairing top performers with weaker students.',
    'Run short quizzes to identify concept gaps early.',
  ].join('\n');
  const improvementStrategy = `Use the current average (${formatPercent(averageMarks)}) as the baseline and work toward steady gains in the next assessment cycle.`;
  const actionPlan = [
    'Shortlist weak students and assign weekly follow-up tasks.',
    'Meet individually with at-risk students to understand learning blockers.',
    'Track improvement after each new upload to monitor progress.',
  ].join('\n');

  return {
    overallSummary,
    weakStudentAnalysis,
    recommendations,
    improvementStrategy,
    actionPlan,
  };
}

function renderInsightsPage() {
  const upload = getCurrentUpload();
  if (!upload || !state.analytics || !state.students.length) {
    return renderEmptyState(
      'No AI insights available yet',
      'Upload a subject file first, then open AI Insights to generate summaries and reports.',
      'Go to Upload',
      'upload'
    );
  }

  const analytics = state.analytics;
  const fallback = buildFallbackInsights();
  const insights = state.insights || fallback;
  const weakCount = getWeakCount();
  const improvementRate = getImprovementRate();
  const topPerformers = getTopPerformers(5);
  const trend = getTrendData();
  const passPercentage = Number(analytics.passPercentage) || 0;
  const lowestMarks = Number(analytics.lowestMarks) || 0;
  const highestMarks = Number(analytics.highestMarks) || 0;
  const averageMarks = Number(analytics.averageMarks) || 0;

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">AI Insights &amp; Report Generation</p>
          <h1 class="page-title">Leverage AI to uncover trends and generate detailed reports.</h1>
          <p class="page-copy">Subject: ${escapeHtml(upload.subjectName)} | Class: ${escapeHtml(upload.className)}</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-generate-insights>Generate Insights</button>
          <button class="primary-btn" type="button" data-download-report="pdf">Download Full Report</button>
        </div>
      </div>

      <div class="summary-grid">
        <article class="summary-card pass"><span class="summary-label">Pass Percentage</span><strong class="summary-value">${escapeHtml(formatPercent(passPercentage))}</strong><span class="summary-note">Current upload</span><span class="summary-accent"></span></article>
        <article class="summary-card avg"><span class="summary-label">Average Marks</span><strong class="summary-value">${escapeHtml(formatPercent(averageMarks))}</strong><span class="summary-note">Class average</span><span class="summary-accent"></span></article>
        <article class="summary-card high"><span class="summary-label">Highest Marks</span><strong class="summary-value">${escapeHtml(highestMarks)}</strong><span class="summary-note">Top score</span><span class="summary-accent"></span></article>
        <article class="summary-card low"><span class="summary-label">Lowest Marks</span><strong class="summary-value">${escapeHtml(lowestMarks)}</strong><span class="summary-note">Lowest score</span><span class="summary-accent"></span></article>
        <article class="summary-card fail"><span class="summary-label">Students at Risk</span><strong class="summary-value">${escapeHtml(weakCount)}</strong><span class="summary-note">Below 40%</span><span class="summary-accent"></span></article>
        <article class="summary-card weak"><span class="summary-label">Improvement Rate</span><strong class="summary-value">${escapeHtml(improvementRate)}</strong><span class="summary-note">Compared to prior upload</span><span class="summary-accent"></span></article>
      </div>

      <div class="section-grid">
        <section class="chart-card large">
          <div class="card-head">
            <div>
              <p class="eyebrow">Performance Trend</p>
              <h3>Track performance improvement over time</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="trendChart"></canvas>
          </div>
        </section>

        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Marks Distribution</p>
              <h3>Performance by Range</h3>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="categoryChart"></canvas>
          </div>
        </section>

        <section class="chart-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Top Performers</p>
              <h3>Top 5 Students</h3>
            </div>
          </div>
          <div class="stack-list">
            ${topPerformers.map((student, index) => `
              <div class="performer-row">
                <span class="index">${index + 1}</span>
                <div>
                  <strong>${escapeHtml(student.studentName)}</strong>
                  <p style="margin:0;color:var(--muted);">Roll No ${escapeHtml(student.rollNo)}</p>
                </div>
                <strong>${escapeHtml(Number(student.marks) || 0)}</strong>
              </div>
            `).join('')}
          </div>
        </section>
      </div>

      <div class="report-grid">
        <section class="insight-card large">
          <p class="eyebrow">Ask Doubts or Query</p>
          <h3>Ask any question about your data and get instant AI-powered answers.</h3>
          <form id="queryForm" class="ai-query">
            <input id="queryInput" type="text" placeholder="Which topics do students find most difficult?">
            <button class="primary-btn" type="button" data-query-submit>Generate Answer</button>
          </form>
          <div class="ai-answer" id="queryAnswer">${escapeHtml(state.queryReply || 'Ask a question to generate a tailored reply.').replace(/\n/g, '<br>')}</div>
        </section>

        <section class="insight-card">
          <p class="eyebrow">Top Strengths</p>
          <h3>What is going well</h3>
          <div class="tag-list">
            <span class="tag">Strong passes in the current upload</span>
            <span class="tag">Top performers are clearly identified</span>
            <span class="tag">Analytics are stored in MongoDB</span>
            <span class="tag">Reports can be exported in multiple formats</span>
          </div>
        </section>

        <section class="insight-card">
          <p class="eyebrow">Areas for Improvement</p>
          <h3>Where to focus next</h3>
          <div class="tag-list">
            <span class="tag">Support weak students with revision sessions</span>
            <span class="tag">Review low-scoring subjects after each upload</span>
            <span class="tag">Track progress against previous uploads</span>
            <span class="tag">Share actionable feedback with teachers</span>
          </div>
        </section>

        <section class="insight-card">
          <p class="eyebrow">Report Generation</p>
          <h3>Download files for submission</h3>
          <div class="report-options">
            <select id="reportTypeSelect">
              <option value="pdf">PDF Report</option>
              <option value="excel">Excel Report</option>
              <option value="csv">CSV Report</option>
            </select>
            <button class="primary-btn report-btn" type="button" data-download-selected-report>Download Selected Report</button>
          </div>
        </section>
      </div>

      <section class="page-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">AI Insights</p>
            <h3>Structured summary</h3>
            <p>The cards below combine the generated AI insights and a safe fallback summary.</p>
          </div>
          <div class="badge-row">
            <span class="badge">Trend lines from history</span>
            <span class="badge">Local fallback ready</span>
          </div>
        </div>

        <div class="insight-grid">
          ${renderInsightSection('Overall Summary', insights.overallSummary || fallback.overallSummary || '')}
          ${renderInsightSection('Weak Student Analysis', insights.weakStudentAnalysis || fallback.weakStudentAnalysis || '')}
          ${renderInsightSection('Teacher Recommendations', insights.recommendations || fallback.recommendations || '')}
          ${renderInsightSection('Improvement Strategy', insights.improvementStrategy || fallback.improvementStrategy || '')}
          ${renderInsightSection('Academic Action Plan', insights.actionPlan || fallback.actionPlan || '', 'full')}
        </div>

        <div class="page-card" style="margin-top:1rem;background:linear-gradient(180deg,#f8fbff,#fff);">
          <p class="eyebrow">AI Disclaimer</p>
          <p class="page-copy">Insights are generated using the uploaded data. Please review the results alongside your own teaching expertise before making decisions.</p>
        </div>
      </section>
    </section>
  `;
}

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

function renderProfilePage() {
  if (!state.profile) {
    return renderEmptyState(
      'Profile not loaded',
      'Log in again or refresh the page so we can load your profile details from MongoDB.',
      'Refresh App',
      'upload'
    );
  }

  const profile = state.profile;
  const stats = state.profileStats || {};
  const joinedDate = profile.createdAt || profile.updatedAt || new Date();

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Profile</p>
          <h1 class="page-title">${escapeHtml(profile.fullName)}</h1>
          <p class="page-copy">${escapeHtml(profile.email)} | ${escapeHtml(profile.role || 'teacher')}</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="history">Open Upload History</button>
        </div>
      </div>

      <div class="profile-grid">
        <article class="profile-card">
          <p class="eyebrow">Teacher Details</p>
          <strong>${escapeHtml(profile.fullName)}</strong>
          <p>${escapeHtml(profile.email)}</p>
          <div class="profile-tag">Joined ${escapeHtml(formatDate(joinedDate))}</div>
        </article>

        <article class="profile-card">
          <p class="eyebrow">Access Level</p>
          <strong>${escapeHtml(profile.role || 'teacher')}</strong>
          <p>You can upload a single subject file, review analytics, and export reports.</p>
          <div class="profile-tag">Protected by JWT</div>
        </article>

        <article class="profile-card">
          <span class="profile-stat">
            <span>Total Uploads</span>
            <strong>${escapeHtml(stats.totalUploads ?? state.history.length ?? 0)}</strong>
          </span>
        </article>

        <article class="profile-card">
          <span class="profile-stat">
            <span>Total Reports</span>
            <strong>${escapeHtml(stats.totalReports ?? 0)}</strong>
          </span>
        </article>
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

async function loadProfile() {
  const response = await requestJson('/api/profile');
  state.profile = response.user;
  return response.user;
}

async function loadProfileStats() {
  const response = await requestJson('/api/profile/stats');
  state.profileStats = {
    totalUploads: response.totalUploads || 0,
    totalReports: response.totalReports || 0,
  };
  return state.profileStats;
}

async function loadHistory() {
  const response = await requestJson('/api/uploads');
  state.history = Array.isArray(response.uploads) ? response.uploads : [];
  if (state.currentUploadId) {
    const selected = state.history.find((upload) => String(upload._id) === String(state.currentUploadId));
    if (selected) {
      sessionStorage.setItem(STORAGE_KEYS.currentUploadId, selected._id);
    }
  }
  return state.history;
}

async function loadUploadData(uploadId) {
  if (!uploadId) {
    return null;
  }

  const [uploadResponse, studentsResponse] = await Promise.all([
    requestJson(`/api/uploads/${encodeURIComponent(uploadId)}`),
    requestJson(`/api/students/${encodeURIComponent(uploadId)}?limit=500`),
  ]);

  state.currentUpload = uploadResponse.upload;
  state.analytics = uploadResponse.analytics;
  state.students = Array.isArray(studentsResponse.students) ? studentsResponse.students : [];
  state.currentUploadId = uploadId;
  sessionStorage.setItem(STORAGE_KEYS.currentUploadId, uploadId);
  state.insights = null;
  state.queryReply = '';
  return uploadResponse.upload;
}

async function ensureInsights(force = false) {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    return null;
  }

  if (!force && state.insights) {
    return state.insights;
  }

  try {
    const existing = await requestJson(`/api/ai-insights/${encodeURIComponent(uploadId)}`);
    state.insights = existing.insights || null;
  } catch (error) {
    if (force || String(error.message).toLowerCase().includes('not found')) {
      const generated = await requestJson(`/api/ai-insights/${encodeURIComponent(uploadId)}`, { method: 'POST' });
      state.insights = generated.insights || null;
    } else {
      throw error;
    }
  }

  if (state.view === 'insights') {
    renderPage();
  }

  return state.insights;
}

function startProcessing(fileName, fileSize) {
  if (state.processing.timer) {
    clearInterval(state.processing.timer);
  }

  state.processing = {
    active: true,
    progress: 8,
    step: 1,
    message: 'Preparing upload...',
    fileName,
    fileSize,
    timer: null,
  };
  state.view = 'processing';
  renderSidebar();
  renderPage();

  state.processing.timer = setInterval(() => {
    if (!state.processing.active) {
      return;
    }

    const progress = state.processing.progress;
    let increment = 6;
    if (progress < 25) increment = 8;
    if (progress < 60) increment = 5;
    if (progress < 85) increment = 3;
    state.processing.progress = Math.min(95, progress + increment);

    if (state.processing.progress < 25) state.processing.message = 'File uploaded successfully.';
    else if (state.processing.progress < 55) state.processing.message = 'Validating file structure.';
    else if (state.processing.progress < 85) state.processing.message = 'Calculating analytics and rankings.';
    else state.processing.message = 'Storing data and preparing the dashboard.';

    renderPage();
  }, 320);
}

function completeProcessing(message = 'Analytics generated successfully.') {
  if (state.processing.timer) {
    clearInterval(state.processing.timer);
    state.processing.timer = null;
  }

  state.processing.active = false;
  state.processing.progress = 100;
  state.processing.step = 4;
  state.processing.message = message;
  renderPage();
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
    setAuthFeedback(error.message, 'error', 'signup');
  }
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
  const file = fileInput?.files?.[0];

  if (!file) {
    const feedback = document.getElementById('uploadFeedback');
    if (feedback) {
      feedback.textContent = 'Please choose a marks file first.';
      feedback.className = 'inline-feedback error';
      feedback.classList.remove('hidden');
    }
    return;
  }

  const startedAt = Date.now();
  startProcessing(file.name, file.size);

  try {
    const response = await requestJson('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });

    state.processing.message = 'File verified successfully. Preparing analytics dashboard...';
    renderPage();

    const visibleWait = Math.max(900, 1600 - (Date.now() - startedAt));
    if (visibleWait > 0) {
      await delay(visibleWait);
    }

    await loadHistory();
    await loadUploadData(response.uploadId);
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

function updateSelectedFileLabel(file) {
  const label = document.getElementById('selectedFileMeta');
  if (!label) {
    return;
  }

  if (file) {
    const size = Math.max(1, Math.round(file.size / 1024));
    label.textContent = `${file.name} • ${size} KB`;
  } else {
    label.textContent = 'No file selected yet.';
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

async function openHistoryUpload(uploadId) {
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

function getInsightAnswer(question) {
  const lower = question.toLowerCase();
  const students = state.students;
  const topStudents = getTopPerformers(3);
  const weakStudents = getWeakStudents(3);
  const analytics = state.analytics || {};
  const fallback = buildFallbackInsights();

  if (lower.includes('weak') || lower.includes('risk') || lower.includes('low')) {
    if (!weakStudents.length) {
      return 'There are no weak students in the current upload. Every student is above the weak-student threshold.';
    }
    return `Weak students: ${weakStudents.map((student) => `${student.studentName} (${student.rollNo}, ${formatPercent(student.percentage)})`).join('; ')}. Focus on revision sessions and one-on-one guidance.`;
  }

  if (lower.includes('top') || lower.includes('best') || lower.includes('highest')) {
    return `Top performers: ${topStudents.map((student) => `${student.studentName} (${student.rollNo}, ${formatPercent(student.percentage)})`).join('; ')}. Encourage peer mentoring and advanced practice.`;
  }

  if (lower.includes('pass') || lower.includes('fail')) {
    return `Pass/fail summary: ${analytics.passedStudents || 0} passed and ${analytics.failedStudents || 0} failed out of ${analytics.totalStudents || students.length || 0} students. Pass percentage is ${formatPercent(analytics.passPercentage || 0)}.`;
  }

  if (lower.includes('average') || lower.includes('mean')) {
    return `The class average is ${formatPercent(analytics.averageMarks || 0)}. The highest mark is ${analytics.highestMarks ?? 0} and the lowest mark is ${analytics.lowestMarks ?? 0}.`;
  }

  return state.insights?.overallSummary || fallback.overallSummary;
}

async function submitQueryForm(form) {
  const input = form?.querySelector('#queryInput');
  const answer = document.getElementById('queryAnswer');
  const question = String(input?.value || '').trim();
  if (!question) {
    if (answer) {
      answer.textContent = 'Please type a question first.';
    }
    return;
  }

  const response = getInsightAnswer(question);
  state.queryReply = response;
  if (answer) {
    answer.innerHTML = escapeHtml(response).replace(/\n/g, '<br>');
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

async function initializeApp() {
  attachPasswordVisibilityToggles();
  setAuthMode('login');
  applyRememberedEmail();
  renderTeacherChip();

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
      updateSelectedFileLabel(marksFileInput.files[0]);
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
      state.filters.search = event.target.value;
      renderPage();
      return;
    }
  });

  pageHost.addEventListener('change', (event) => {
    if (event.target.matches('#marksFile')) {
      updateSelectedFileLabel(event.target.files?.[0] || null);
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
  setAuthMode('login');
  applyRememberedEmail();
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSidebar();
  }
});

document.addEventListener('DOMContentLoaded', initializeApp);
