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
  sourceAnalytics: null,
  sourceStudents: [],
  dashboardAnalytics: null,
  dashboardStudents: null,
  dashboardFilters: {
    subject: 'all',
    student: 'all',
  },
  dashboardFilterOptions: {
    subjects: [],
    students: [],
  },
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
  const urlParams = new URLSearchParams(window.location.search);
  const queryUrl = urlParams.get('api');

  const configuredUrl = [
    queryUrl,
    window.SAPS_CONFIG?.apiBaseUrl,
    localStorage.getItem(STORAGE_KEYS.apiBaseUrl),
    sessionStorage.getItem(STORAGE_KEYS.apiBaseUrl),
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  const hostname = window.location.hostname || '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.vercel.app')) {
    return window.location.origin.replace(/\/+$/, '');
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

function setApiBaseUrl(apiBaseUrl) {
  const normalized = String(apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (normalized) {
    localStorage.setItem(STORAGE_KEYS.apiBaseUrl, normalized);
    sessionStorage.setItem(STORAGE_KEYS.apiBaseUrl, normalized);
    return normalized;
  }

  localStorage.removeItem(STORAGE_KEYS.apiBaseUrl);
  sessionStorage.removeItem(STORAGE_KEYS.apiBaseUrl);
  return '';
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

function getDashboardAnalytics() {
  return state.dashboardAnalytics || state.analytics;
}

function getDashboardStudents() {
  return Array.isArray(state.dashboardStudents) ? state.dashboardStudents : state.students;
}

function getSourceStudents() {
  return state.sourceStudents.length ? state.sourceStudents : state.students;
}

function getSourceAnalytics() {
  return state.sourceAnalytics || state.analytics;
}

function normalizeFilterValue(value) {
  return String(value || 'all').trim() || 'all';
}

function resetStudentTableFilters() {
  state.filters = {
    search: '',
    status: 'all',
    category: 'all',
    range: 'all',
  };
}

function getActiveDashboardFilterInfo() {
  const selectedSubject = normalizeFilterValue(state.dashboardFilters.subject);
  const selectedStudent = normalizeFilterValue(state.dashboardFilters.student);
  const subjectLabel = selectedSubject === 'all' ? 'All Subjects' : selectedSubject;
  const studentOption = (state.dashboardFilterOptions.students || []).find((student) => {
    const rollNo = String(student.rollNo || '');
    const name = String(student.studentName || '');
    return rollNo === selectedStudent || name === selectedStudent;
  });

  return {
    selectedSubject,
    selectedStudent,
    subjectLabel,
    studentLabel: selectedStudent === 'all'
      ? 'All Students'
      : studentOption?.label || studentOption?.studentName || selectedStudent,
    hasSubject: selectedSubject !== 'all',
    hasStudent: selectedStudent !== 'all',
  };
}

function buildStudentPerformanceView(student, marks, rank = student.rank || 0) {
  const upload = getCurrentUpload() || {};
  const maxMarks = Number(upload.maxMarks) || 100;
  const passingMarks = Number(upload.passingMarks) || 35;
  const numericMarks = Number(marks);
  const safeMarks = Number.isFinite(numericMarks) ? numericMarks : 0;
  const percentage = Number(((safeMarks / maxMarks) * 100).toFixed(2));
  const status = safeMarks >= passingMarks ? 'Pass' : 'Fail';
  let category = 'Average Performer';

  if (status === 'Fail') category = 'Failed';
  else if (percentage > 80) category = 'Top Performer';
  else if (percentage < 40) category = 'Weak Student';

  return {
    ...student,
    marks: Number(safeMarks.toFixed(2)),
    percentage,
    status,
    category,
    rank,
  };
}

function getPerformanceStatus(percentage) {
  const value = Number(percentage) || 0;
  if (value >= 90) return 'Excellent';
  if (value >= 75) return 'Good';
  if (value >= 50) return 'Average';
  return 'Needs Improvement';
}

function calculateAnalyticsFromStudents(students, reportType = 'single') {
  const totalStudents = students.length;
  const marksDistribution = {
    range_0_35: 0,
    range_36_50: 0,
    range_51_70: 0,
    range_71_85: 0,
    range_86_100: 0,
  };

  if (!totalStudents) {
    return {
      totalStudents: 0,
      passedStudents: 0,
      failedStudents: 0,
      averageMarks: 0,
      highestMarks: 0,
      lowestMarks: 0,
      passPercentage: 0,
      failPercentage: 0,
      marksDistribution,
      reportType,
      subjectSummary: [],
    };
  }

  const passedStudents = students.filter((student) => String(student.status).toLowerCase() === 'pass').length;
  const failedStudents = totalStudents - passedStudents;
  const marks = students.map((student) => Number(student.marks) || 0);

  students.forEach((student) => {
    const percentage = Number(student.percentage) || 0;
    if (percentage <= 35) marksDistribution.range_0_35 += 1;
    else if (percentage <= 50) marksDistribution.range_36_50 += 1;
    else if (percentage <= 70) marksDistribution.range_51_70 += 1;
    else if (percentage <= 85) marksDistribution.range_71_85 += 1;
    else marksDistribution.range_86_100 += 1;
  });

  return {
    totalStudents,
    passedStudents,
    failedStudents,
    averageMarks: Number((marks.reduce((sum, mark) => sum + mark, 0) / totalStudents).toFixed(2)),
    highestMarks: Math.max(...marks),
    lowestMarks: Math.min(...marks),
    passPercentage: Number(((passedStudents / totalStudents) * 100).toFixed(2)),
    failPercentage: Number(((failedStudents / totalStudents) * 100).toFixed(2)),
    marksDistribution,
    reportType,
    subjectSummary: [],
  };
}

function calculateLocalDashboardFilter() {
  const sourceStudents = getSourceStudents();
  const sourceAnalytics = getSourceAnalytics();
  const subject = normalizeFilterValue(state.dashboardFilters.subject);
  const student = normalizeFilterValue(state.dashboardFilters.student);
  const subjectNames = getSubjectNamesFrom(sourceStudents, sourceAnalytics);
  const normalizedSubject = subject.toLowerCase();
  const normalizedStudent = student.toLowerCase();
  const selectedSubjectName = subjectNames.find((name) => name.toLowerCase() === normalizedSubject);

  let filteredStudents = sourceStudents.filter((item) => {
    if (normalizedStudent === 'all') return true;
    return String(item.rollNo || '').toLowerCase() === normalizedStudent
      || String(item.studentName || '').toLowerCase() === normalizedStudent;
  });

  if (selectedSubjectName) {
    filteredStudents = filteredStudents
      .map((item) => {
        const value = item.subjectMarks?.[selectedSubjectName];
        if (value === undefined || value === null || value === '') return null;
        return buildStudentPerformanceView({ ...item, selectedSubject: selectedSubjectName }, value);
      })
      .filter(Boolean);
  } else {
    filteredStudents = filteredStudents.map((item) => buildStudentPerformanceView(item, item.marks));
  }

  filteredStudents.sort((left, right) => Number(right.marks) - Number(left.marks));
  filteredStudents.forEach((item, index) => {
    item.rank = index + 1;
  });

  const analytics = calculateAnalyticsFromStudents(filteredStudents, subjectNames.length ? 'multiple' : 'single');

  if (selectedSubjectName) {
    const marks = filteredStudents.map((item) => Number(item.marks)).filter(Number.isFinite);
    analytics.subjectSummary = [{
      subjectName: selectedSubjectName,
      averageMarks: marks.length ? Number((marks.reduce((sum, mark) => sum + mark, 0) / marks.length).toFixed(2)) : 0,
      highestMarks: marks.length ? Math.max(...marks) : 0,
      lowestMarks: marks.length ? Math.min(...marks) : 0,
    }];
  } else if (subjectNames.length) {
    analytics.subjectSummary = getSubjectSummaryFrom(filteredStudents, { subjectSummary: [] });
  } else {
    analytics.subjectSummary = [];
  }

  return { analytics, students: filteredStudents };
}

function getSubjectNamesFrom(students = getSourceStudents(), analytics = getSourceAnalytics()) {
  const names = [];
  const addName = (name) => {
    const label = String(name || '').trim();
    if (label && !names.includes(label)) {
      names.push(label);
    }
  };

  if (Array.isArray(analytics?.subjectSummary)) {
    analytics.subjectSummary.forEach((subject) => addName(subject.subjectName));
  }

  students.forEach((student) => {
    if (student?.subjectMarks && typeof student.subjectMarks === 'object' && !Array.isArray(student.subjectMarks)) {
      Object.keys(student.subjectMarks).forEach(addName);
    }
  });

  return names;
}

function getSubjectNames() {
  return getSubjectNamesFrom(getSourceStudents(), getSourceAnalytics());
}

function getSubjectFilterOptions() {
  const subjectNames = getSubjectNames();
  if (subjectNames.length) {
    return subjectNames;
  }

  const upload = getCurrentUpload();
  return upload?.subjectName ? [upload.subjectName] : [];
}

function getSubjectSummaryFrom(students = getDashboardStudents(), analytics = getDashboardAnalytics()) {
  const fromAnalytics = Array.isArray(analytics?.subjectSummary) ? analytics.subjectSummary : [];
  if (fromAnalytics.length) {
    return fromAnalytics;
  }

  const subjectNames = getSubjectNamesFrom(students, analytics);
  return subjectNames.map((subjectName) => {
    const marks = students
      .map((student) => Number(student.subjectMarks?.[subjectName]))
      .filter(Number.isFinite);
    const total = marks.reduce((sum, mark) => sum + mark, 0);
    return {
      subjectName,
      averageMarks: marks.length ? Number((total / marks.length).toFixed(2)) : 0,
      highestMarks: marks.length ? Math.max(...marks) : 0,
      lowestMarks: marks.length ? Math.min(...marks) : 0,
    };
  });
}

function getSubjectSummary() {
  return getSubjectSummaryFrom(getDashboardStudents(), getDashboardAnalytics());
}

function formatSubjectMark(student, subjectName) {
  const value = student?.subjectMarks?.[subjectName];
  const number = Number(value);
  return Number.isFinite(number) ? number : '-';
}

function getAverageMarks() {
  const number = Number(getDashboardAnalytics()?.averageMarks);
  return Number.isFinite(number) ? number : 0;
}

function getWeakCount() {
  return getDashboardStudents().filter((student) => Number(student.percentage) < 40 || String(student.category || '').toLowerCase().includes('weak')).length;
}

function getTopPerformers(limit = 5) {
  return [...getDashboardStudents()]
    .sort((left, right) => Number(right.marks) - Number(left.marks) || Number(left.rank) - Number(right.rank))
    .slice(0, limit);
}

function getWeakStudents(limit = 5) {
  return [...getDashboardStudents()]
    .filter((student) => Number(student.percentage) < 40 || String(student.status).toLowerCase() === 'fail')
    .sort((left, right) => Number(left.marks) - Number(right.marks))
    .slice(0, limit);
}

function getFilteredStudents() {
  const search = state.filters.search.trim().toLowerCase();
  const selectedStatus = String(state.filters.status || 'all').toLowerCase();
  const selectedCategory = String(state.filters.category || 'all').toLowerCase();
  return [...getDashboardStudents()].filter((student) => {
    const rollNo = String(student.rollNo || '').toLowerCase();
    const studentName = String(student.studentName || '').toLowerCase();
    const status = String(student.status || '').toLowerCase();
    const category = String(student.category || '').toLowerCase();
    const marks = Number(student.percentage);

    if (search && !rollNo.includes(search) && !studentName.includes(search)) {
      return false;
    }
    if (selectedStatus !== 'all' && status !== selectedStatus) {
      return false;
    }
    if (selectedCategory !== 'all' && category !== selectedCategory) {
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

  for (const student of getDashboardStudents()) {
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

function getSelectedDashboardStudent() {
  const selectedStudent = normalizeFilterValue(state.dashboardFilters.student);
  if (selectedStudent === 'all') {
    return null;
  }

  const normalized = selectedStudent.toLowerCase();
  return getSourceStudents().find((student) => (
    String(student.rollNo || '').toLowerCase() === normalized
    || String(student.studentName || '').toLowerCase() === normalized
  )) || getDashboardStudents()[0] || null;
}

function getSelectedSubjectName() {
  const selectedSubject = normalizeFilterValue(state.dashboardFilters.subject);
  if (selectedSubject === 'all') {
    return '';
  }

  return getSubjectNames().find((subjectName) => subjectName === selectedSubject) || selectedSubject;
}

function getStudentSubjectRows(student = getSelectedDashboardStudent()) {
  if (!student) {
    return [];
  }

  const upload = getCurrentUpload() || {};
  const maxMarks = Number(upload.maxMarks) || 100;
  const subjectNames = getSubjectNames();
  const subjectSummary = getSubjectSummaryFrom(getSourceStudents(), getSourceAnalytics());
  const selectedSubject = getSelectedSubjectName();
  const names = selectedSubject
    ? [selectedSubject]
    : (subjectNames.length ? subjectNames : [upload.subjectName || 'Current Subject']);

  return names.map((subjectName) => {
    const rawMark = subjectNames.length
      ? student.subjectMarks?.[subjectName]
      : student.marks;
    const mark = Number(rawMark);
    const summary = subjectSummary.find((item) => item.subjectName === subjectName);
    const classAverage = Number(summary?.averageMarks ?? getSourceAnalytics()?.averageMarks ?? 0);
    const percentage = Number.isFinite(mark) ? Number(((mark / maxMarks) * 100).toFixed(2)) : 0;
    const rankedStudents = getSourceStudents()
      .map((item) => {
        const value = subjectNames.length ? item.subjectMarks?.[subjectName] : item.marks;
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
          ? { rollNo: item.rollNo, studentName: item.studentName, marks: numericValue }
          : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.marks - left.marks || String(left.studentName).localeCompare(String(right.studentName)));
    const rank = rankedStudents.findIndex((item) => (
      String(item.rollNo || '') === String(student.rollNo || '')
      || String(item.studentName || '').toLowerCase() === String(student.studentName || '').toLowerCase()
    )) + 1;

    return {
      subjectName,
      marks: Number.isFinite(mark) ? mark : 0,
      percentage,
      classAverage,
      rank: rank || 0,
      status: percentage >= 90 ? 'Excellent' : percentage >= 75 ? 'Good' : percentage >= 50 ? 'Average' : 'Needs Improvement',
    };
  }).filter((row) => row.subjectName);
}

function getStudentOverallPercentage(rows = getStudentSubjectRows()) {
  if (!rows.length) {
    return 0;
  }

  return Number((rows.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0) / rows.length).toFixed(2));
}

function buildStudentInsights(student, rows, selectedSubject = '') {
  if (!student || !rows.length) {
    return {
      title: 'No personalized data available',
      points: ['Select a student with valid marks to generate personalized insights.'],
    };
  }

  const sorted = [...rows].sort((left, right) => right.percentage - left.percentage);
  const best = sorted[0];
  const weakest = sorted.at(-1);
  const overall = getStudentOverallPercentage(rows);
  const totalMarks = rows.reduce((sum, row) => sum + (Number(row.marks) || 0), 0);

  if (selectedSubject && rows[0]) {
    const row = rows[0];
    const gap = Number((row.marks - row.classAverage).toFixed(2));
    return {
      title: `${student.studentName} in ${row.subjectName}`,
      summary: `${student.studentName} scored ${row.marks} in ${row.subjectName}, which is ${formatPercent(row.percentage)} and categorized as ${row.status}.`,
      points: [
        `${row.marks} marks (${formatPercent(row.percentage)}) places the student in the ${row.status} category.`,
        row.rank ? `Subject rank is ${row.rank} among students for ${row.subjectName}.` : 'Rank is unavailable for this subject.',
        gap >= 0 ? `The score is ${gap} marks above the class average.` : `The score is ${Math.abs(gap)} marks below the class average.`,
        row.percentage >= 75 ? 'Recommendation: maintain consistency with advanced practice questions.' : 'Recommendation: schedule focused revision and topic-wise practice for this subject.',
      ],
    };
  }

  return {
    title: `${student.studentName} across all subjects`,
    summary: `${student.studentName}'s personalized dashboard is based only on their marks across ${rows.length} subject${rows.length === 1 ? '' : 's'}.`,
    points: [
      `Overall percentage is ${formatPercent(overall)} across ${rows.length} subject${rows.length === 1 ? '' : 's'}.`,
      `Total marks obtained: ${totalMarks}. The donut chart shows how these marks are distributed across subjects.`,
      `Strongest subject: ${best.subjectName} (${formatPercent(best.percentage)}).`,
      `Weakest subject: ${weakest.subjectName} (${formatPercent(weakest.percentage)}).`,
      overall >= 75 ? 'Recommendation: continue enrichment tasks and maintain steady preparation.' : 'Recommendation: prioritize weak subjects and review mistakes after each assessment.',
    ],
  };
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

  const activeFilterInfo = getActiveDashboardFilterInfo();
  if (activeFilterInfo.hasStudent) {
    renderStudentCharts(activeFilterInfo);
    return;
  }

  const analytics = getDashboardAnalytics();
  const students = getDashboardStudents();
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

function renderStudentCharts(activeFilterInfo = getActiveDashboardFilterInfo()) {
  const student = getSelectedDashboardStudent();
  const selectedSubject = activeFilterInfo.hasSubject ? getSelectedSubjectName() : '';
  const rows = getStudentSubjectRows(student);
  if (!student || !rows.length) {
    return;
  }

  const labels = rows.map((row) => row.subjectName);
  const marks = rows.map((row) => Number(row.marks) || 0);
  const percentages = rows.map((row) => Number(row.percentage) || 0);
  const classAverages = rows.map((row) => Number(row.classAverage) || 0);
  const chartPalette = ['#2563eb', '#16a34a', '#7c3aed', '#ef4444', '#0ea5e9', '#f59e0b', '#14b8a6', '#ec4899'];

  const subjectMarksCanvas = document.getElementById('studentSubjectMarksChart');
  const distributionCanvas = document.getElementById('studentDistributionChart');
  const trendCanvas = document.getElementById('studentTrendChart');
  const radarCanvas = document.getElementById('studentRadarChart');
  const comparisonCanvas = document.getElementById('studentClassAverageChart');
  const gaugeCanvas = document.getElementById('studentStatusGaugeChart');

  if (subjectMarksCanvas) {
    state.charts.push(new Chart(subjectMarksCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Marks',
          data: marks,
          backgroundColor: '#2563eb',
          borderRadius: 12,
        }],
      },
      options: chartOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        },
      }),
    }));
  }

  if (distributionCanvas) {
    state.charts.push(new Chart(distributionCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: marks,
          backgroundColor: labels.map((_, index) => chartPalette[index % chartPalette.length]),
          borderColor: '#ffffff',
          borderWidth: 3,
        }],
      },
      options: chartOptions({
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#334155',
              boxWidth: 12,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = Number(context.raw) || 0;
                const total = marks.reduce((sum, mark) => sum + mark, 0);
                const share = total ? (value / total) * 100 : 0;
                return `${context.label}: ${value} marks (${formatPercent(share)})`;
              },
            },
          },
        },
      }),
    }));
  }

  if (trendCanvas) {
    state.charts.push(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: selectedSubject ? ['Current Upload'] : labels,
        datasets: [{
          label: selectedSubject ? `${selectedSubject} Marks` : 'Subject Performance',
          data: selectedSubject ? [marks[0]] : marks,
          tension: 0.35,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.18)' } },
        },
      }),
    }));
  }

  if (radarCanvas) {
    state.charts.push(new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: `${student.studentName}`,
          data: percentages,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.16)',
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            pointLabels: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.25)' },
          },
        },
      }),
    }));
  }

  if (comparisonCanvas) {
    state.charts.push(new Chart(comparisonCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: student.studentName, data: marks, backgroundColor: '#2563eb', borderRadius: 10 },
          { label: 'Class Average', data: classAverages, backgroundColor: '#f59e0b', borderRadius: 10 },
        ],
      },
      options: chartOptions({
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        },
      }),
    }));
  }

  if (gaugeCanvas) {
    const value = percentages[0] || 0;
    state.charts.push(new Chart(gaugeCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Score', 'Remaining'],
        datasets: [{
          data: [value, Math.max(0, 100 - value)],
          backgroundColor: [value >= 90 ? '#22c55e' : value >= 75 ? '#2563eb' : value >= 50 ? '#f59e0b' : '#ef4444', '#e5edff'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        cutout: '70%',
        circumference: 180,
        rotation: 270,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => context.label === 'Score' ? `${formatPercent(value)} ${rows[0].status}` : '',
            },
          },
        },
      }),
    }));
  }
}

function renderSummaryCards() {
  const analytics = getDashboardAnalytics();
  if (!analytics) {
    return '';
  }

  const total = analytics.totalStudents || getDashboardStudents().length || 0;
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

function renderDashboardFilters() {
  const subjectOptions = state.dashboardFilterOptions.subjects.length
    ? state.dashboardFilterOptions.subjects
    : getSubjectFilterOptions();
  const studentOptions = state.dashboardFilterOptions.students.length
    ? state.dashboardFilterOptions.students
    : getSourceStudents().map((student) => ({
        rollNo: String(student.rollNo || ''),
        studentName: String(student.studentName || ''),
        label: `${student.studentName} (${student.rollNo})`,
      }));
  const selectedSubject = normalizeFilterValue(state.dashboardFilters.subject);
  const selectedStudent = normalizeFilterValue(state.dashboardFilters.student);

  return `
    <section class="dashboard-filter-card">
      <div>
        <p class="eyebrow">Dashboard Filters</p>
        <h3>Refine Analytics View</h3>
      </div>
      <div class="dashboard-filter-grid">
        <label class="filter-field">
          <span>Subject</span>
          <select id="dashboardSubjectFilter">
            <option value="all"${selectedSubject === 'all' ? ' selected' : ''}>All Subjects</option>
            ${subjectOptions.map((subjectName) => `
              <option value="${escapeHtml(subjectName)}"${selectedSubject === subjectName ? ' selected' : ''}>${escapeHtml(subjectName)}</option>
            `).join('')}
          </select>
        </label>
        <label class="filter-field">
          <span>Student</span>
          <select id="dashboardStudentFilter">
            <option value="all"${selectedStudent === 'all' ? ' selected' : ''}>All Students</option>
            ${studentOptions.map((student) => `
              <option value="${escapeHtml(student.rollNo)}"${selectedStudent === student.rollNo ? ' selected' : ''}>${escapeHtml(student.label || `${student.studentName} (${student.rollNo})`)}</option>
            `).join('')}
          </select>
        </label>
        <button class="ghost-btn filter-reset-btn" type="button" data-dashboard-filter-reset>Reset Filters</button>
      </div>
    </section>
  `;
}

function renderActiveFilterSummary() {
  const info = getActiveDashboardFilterInfo();
  if (!info.hasSubject && !info.hasStudent) {
    return '';
  }

  const students = getDashboardStudents();
  const selectedStudent = info.hasStudent && students.length === 1 ? students[0] : null;
  const subjectText = info.hasSubject ? info.subjectLabel : 'all subjects';
  const studentText = info.hasStudent ? info.studentLabel : 'all students';

  return `
    <section class="active-filter-card">
      <div>
        <p class="eyebrow">Filtered Result</p>
        <h3>Showing ${escapeHtml(studentText)} in ${escapeHtml(subjectText)}</h3>
        <p>${escapeHtml(students.length)} matching record${students.length === 1 ? '' : 's'} found from the selected filters.</p>
      </div>
      <div class="active-filter-chips">
        <span class="badge">Subject: ${escapeHtml(info.subjectLabel)}</span>
        <span class="badge">Student: ${escapeHtml(info.studentLabel)}</span>
      </div>
      ${selectedStudent ? `
        <div class="exact-result-grid">
          <article>
            <span>Roll No</span>
            <strong>${escapeHtml(selectedStudent.rollNo)}</strong>
          </article>
          <article>
            <span>Marks</span>
            <strong>${escapeHtml(selectedStudent.marks)}</strong>
          </article>
          <article>
            <span>Percentage</span>
            <strong>${escapeHtml(formatPercent(selectedStudent.percentage))}</strong>
          </article>
          <article>
            <span>Status</span>
            <strong>${escapeHtml(selectedStudent.status)}</strong>
          </article>
          <article>
            <span>Category</span>
            <strong>${escapeHtml(selectedStudent.category)}</strong>
          </article>
        </div>
      ` : ''}
    </section>
  `;
}

function renderSubjectSummaryPanel() {
  const subjects = getSubjectSummary();
  if (!subjects.length) {
    return '';
  }

  return `
    <section class="table-card subject-summary-card">
      <div class="table-head compact">
        <div>
          <p class="eyebrow">Subject Wise Analysis</p>
          <h3>Multi-Subject Performance</h3>
        </div>
      </div>
      <table class="data-table subject-summary-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Average Marks</th>
            <th>Highest Marks</th>
            <th>Lowest Marks</th>
          </tr>
        </thead>
        <tbody>
          ${subjects.map((subject) => `
            <tr>
              <td><strong>${escapeHtml(subject.subjectName)}</strong></td>
              <td>${escapeHtml(formatPercent(subject.averageMarks || 0))}</td>
              <td>${escapeHtml(subject.highestMarks ?? 0)}</td>
              <td>${escapeHtml(subject.lowestMarks ?? 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

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

function renderStudentDashboardPage(activeFilterInfo = getActiveDashboardFilterInfo()) {
  const upload = getCurrentUpload();
  const student = getSelectedDashboardStudent();
  const rows = getStudentSubjectRows(student);

  if (!upload || !student || !rows.length) {
    return renderEmptyState(
      'No matching student data',
      'The selected student does not have marks for the current dashboard filter.',
      'Reset Filters',
      'dashboard'
    );
  }

  const selectedSubject = activeFilterInfo.hasSubject ? getSelectedSubjectName() : '';
  const selectedRow = selectedSubject
    ? rows.find((row) => row.subjectName.toLowerCase() === selectedSubject.toLowerCase()) || rows[0]
    : null;
  const maxMarks = Number(upload.maxMarks) || 100;
  const overallPercentage = getStudentOverallPercentage(rows);
  const totalMarks = rows.reduce((sum, row) => sum + (Number(row.marks) || 0), 0);
  const totalPossibleMarks = rows.length * maxMarks;
  const insights = buildStudentInsights(student, rows, selectedSubject);
  const subjectLabel = selectedSubject || 'All Subjects';
  const rankLabel = selectedRow?.rank ? `Rank ${selectedRow.rank}` : 'Rank not available';
  const subjectPercentage = selectedRow ? (Number(selectedRow.marks) / maxMarks) * 100 : overallPercentage;
  const statusLabel = getPerformanceStatus(subjectPercentage);
  const overallStatusLabel = getPerformanceStatus(overallPercentage);
  const exactSubjectStudents = selectedSubject
    ? getSourceStudents().filter((item) => Number.isFinite(Number(item.subjectMarks?.[selectedSubject] ?? item.marks))).length
    : getSourceStudents().length;
  const exactRank = selectedRow?.rank || 0;
  const exactRankPercentile = exactRank && exactSubjectStudents
    ? Number(((exactRank / exactSubjectStudents) * 100).toFixed(2))
    : 0;
  const exactGap = selectedRow ? Number((Number(selectedRow.marks || 0) - Number(selectedRow.classAverage || 0)).toFixed(2)) : 0;
  const achievementWidth = Math.max(0, Math.min(100, subjectPercentage));
  const recommendations = selectedRow
    ? [
        exactGap >= 0 ? 'You are performing above the class average.' : 'You are below the class average; focus revision is recommended.',
        subjectPercentage >= 75 ? `Strong understanding in ${subjectLabel}.` : `Revise core concepts in ${subjectLabel}.`,
        subjectPercentage >= 90 ? 'Aim for consistency with advanced questions.' : subjectPercentage >= 75 ? 'Practice advanced and mixed-difficulty questions.' : 'Create a weekly practice plan and retest weak topics.',
      ]
    : [];

  const allSubjectVisuals = `
    <div class="summary-grid student-focus-grid">
      <article class="summary-card avg">
        <span class="summary-label">Overall Percentage</span>
        <strong class="summary-value">${escapeHtml(formatPercent(overallPercentage))}</strong>
        <span class="summary-note">Total marks: ${escapeHtml(totalMarks)} / ${escapeHtml(totalPossibleMarks)} | ${escapeHtml(overallStatusLabel)}</span>
        <span class="summary-accent"></span>
      </article>
    </div>

    <div class="section-grid student-visual-grid">
      <section class="chart-card large">
        <div class="card-head">
          <div>
            <p class="eyebrow">Subject Wise</p>
            <h3>Subject-wise Marks</h3>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="studentSubjectMarksChart"></canvas>
        </div>
      </section>

      <section class="chart-card large">
        <div class="card-head">
          <div>
            <p class="eyebrow">Distribution</p>
            <h3>Subject Performance Distribution</h3>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="studentDistributionChart"></canvas>
        </div>
      </section>

      <section class="chart-card large">
        <div class="card-head">
          <div>
            <p class="eyebrow">Strength Map</p>
            <h3>Strengths vs Weak Subjects</h3>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="studentRadarChart"></canvas>
        </div>
      </section>

      <section class="chart-card large">
        <div class="card-head">
          <div>
            <p class="eyebrow">Comparison</p>
            <h3>Student vs Class Average</h3>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="studentClassAverageChart"></canvas>
        </div>
      </section>
    </div>
  `;

  const exactSubjectVisuals = `
    <div class="summary-grid student-exact-kpi-grid">
      <article class="summary-card ${statusLabel === 'Excellent' ? 'high' : statusLabel === 'Good' ? 'pass' : statusLabel === 'Average' ? 'avg' : 'weak'}">
        <span class="summary-label">Subject Marks</span>
        <strong class="summary-value">${escapeHtml(selectedRow?.marks ?? 0)} / ${escapeHtml(maxMarks)}</strong>
        <span class="summary-note">${escapeHtml(formatPercent(subjectPercentage))} | ${escapeHtml(statusLabel)}</span>
        <span class="summary-accent"></span>
      </article>

      <article class="summary-card low">
        <span class="summary-label">Subject Rank</span>
        <strong class="summary-value">${escapeHtml(rankLabel)}${exactSubjectStudents ? ` / ${escapeHtml(exactSubjectStudents)}` : ''}</strong>
        <span class="summary-note">${exactRankPercentile ? `Top ${escapeHtml(formatPercent(exactRankPercentile))}` : 'Position among all students'}</span>
        <span class="summary-accent"></span>
      </article>
    </div>

    <div class="section-grid student-visual-grid exact-subject-grid">
      <section class="chart-card large">
        <div class="card-head">
          <div>
            <p class="eyebrow">Comparison</p>
            <h3>Student Score vs Class Average</h3>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="studentClassAverageChart"></canvas>
        </div>
      </section>

      <section class="chart-card large subject-breakdown-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Breakdown</p>
            <h3>Subject Performance Breakdown</h3>
          </div>
        </div>
        <div class="breakdown-layout">
          <div class="breakdown-progress">
            <span class="breakdown-ring" style="--score:${escapeHtml(achievementWidth)};">
              <strong>${escapeHtml(formatPercent(subjectPercentage))}</strong>
              <small>Achieved</small>
            </span>
            <div class="mini-progress">
              <span style="width:${escapeHtml(achievementWidth)}%;"></span>
            </div>
          </div>
          <div class="breakdown-metrics">
            <span class="status-pill ${statusLabel.toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(statusLabel)}</span>
            <p><strong>Marks Obtained</strong><b>${escapeHtml(selectedRow?.marks ?? 0)} / ${escapeHtml(maxMarks)}</b></p>
            <p><strong>Class Average</strong><b>${escapeHtml(selectedRow?.classAverage ?? 0)} / ${escapeHtml(maxMarks)}</b></p>
            <p><strong>Marks ${exactGap >= 0 ? 'Above' : 'Below'} Avg.</strong><b>${exactGap >= 0 ? '+' : ''}${escapeHtml(exactGap)}</b></p>
            <p><strong>Rank Percentile</strong><b>${exactRankPercentile ? escapeHtml(formatPercent(exactRankPercentile)) : '-'}</b></p>
          </div>
        </div>
        <div class="breakdown-recommendations">
          <strong>Insights & Recommendations</strong>
          ${recommendations.map((item, index) => `
            <p><span>${index < 2 ? '✓' : '!'}</span>${escapeHtml(item)}</p>
          `).join('')}
        </div>
      </section>

      <section class="chart-card full">
        <div class="card-head">
          <div>
            <p class="eyebrow">Status</p>
            <h3>Performance Status</h3>
          </div>
          <span class="badge">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="chart-wrap gauge-wrap">
          <canvas id="studentStatusGaugeChart"></canvas>
        </div>
      </section>
    </div>
  `;

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Personalized Analytics</p>
          <h1 class="page-title">${escapeHtml(student.studentName)} • ${escapeHtml(subjectLabel)}</h1>
          <p class="page-copy">Roll No ${escapeHtml(student.rollNo)} | Class: ${escapeHtml(upload.className)} | Uploaded on: ${escapeHtml(formatDate(upload.uploadDate))}</p>
          <div class="hero-info">
            <span class="badge">Mode: ${escapeHtml(selectedSubject ? 'Student + Subject' : 'Student + All Subjects')}</span>
            <span class="badge">Subjects: ${escapeHtml(rows.length)}</span>
            <span class="badge">Overall: ${escapeHtml(formatPercent(overallPercentage))}</span>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="upload">Upload Another File</button>
          <button class="ghost-btn" type="button" data-generate-insights>Open AI Insights</button>
          <button class="primary-btn" type="button" data-download-report="pdf">Download PDF Report</button>
        </div>
      </div>

      ${renderDashboardFilters()}
      ${renderActiveFilterSummary()}

      ${selectedSubject ? exactSubjectVisuals : allSubjectVisuals}

      <section class="insight-card student-insight-card">
        <p class="eyebrow">Personalized Insights</p>
        <h3>${escapeHtml(selectedSubject ? `${student.studentName} in ${subjectLabel}` : `${student.studentName} across all subjects`)}</h3>
        <p>${escapeHtml(insights.summary)}</p>
        <div class="insight-list">
          ${insights.points.map((point) => `<span>${escapeHtml(point)}</span>`).join('')}
        </div>
      </section>
    </section>
  `;
}

function renderDashboardPage() {
  const upload = getCurrentUpload();
  const analytics = getDashboardAnalytics();
  const dashboardStudents = getDashboardStudents();
  const sourceStudents = getSourceStudents();
  if (!upload || !analytics || !sourceStudents.length) {
    return renderEmptyState(
      'No analytics loaded yet',
      'Upload a subject file or pick one from the history page to see the dashboard.',
      'Go to Upload',
      'upload'
    );
  }

  const passMarks = upload.passingMarks ?? 35;
  const maxMarks = upload.maxMarks ?? 100;
  const currentAverage = Number(analytics.averageMarks) || 0;
  const improvementRate = getImprovementRate();
  const categoryCounts = getCategoryCounts();
  const activeFilterInfo = getActiveDashboardFilterInfo();
  if (activeFilterInfo.hasStudent) {
    return renderStudentDashboardPage(activeFilterInfo);
  }

  const isExactStudentSubject = activeFilterInfo.hasSubject && activeFilterInfo.hasStudent;
  const topPerformers = getTopPerformers(5);
  const weakStudents = getWeakStudents(5);
  const filteredStudents = isExactStudentSubject ? dashboardStudents : getFilteredStudents();
  const weakCount = getWeakCount();
  const passPercentage = Number(analytics.passPercentage) || 0;
  const failPercentage = Number(analytics.failPercentage) || 0;
  const subjectNames = getSubjectNames();
  const selectedSubject = normalizeFilterValue(state.dashboardFilters.subject);
  const visibleSubjectNames = selectedSubject !== 'all' ? subjectNames.filter((subjectName) => subjectName === selectedSubject) : subjectNames;
  const isMultiSubject = upload.subjectType === 'multiple' || subjectNames.length > 0;
  const subjectHeaderCells = isMultiSubject ? visibleSubjectNames.map((subjectName) => `<th>${escapeHtml(subjectName)}</th>`).join('') : '';

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <p class="eyebrow">Welcome, Teacher!</p>
          <h1 class="page-title">Subject: ${escapeHtml(upload.subjectName)}</h1>
          <p class="page-copy">Class: ${escapeHtml(upload.className)} | Uploaded on: ${escapeHtml(formatDate(upload.uploadDate))}</p>
          <div class="hero-info">
            <span class="badge">Mode: ${escapeHtml(upload.subjectType === 'multiple' ? 'Multiple Subjects' : 'Single Subject')}</span>
            <span class="badge">Pass Marks: ${escapeHtml(passMarks)}</span>
            <span class="badge">Max Marks: ${escapeHtml(maxMarks)}</span>
            <span class="badge">Records: ${escapeHtml(dashboardStudents.length)}</span>
          </div>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" data-view="upload">Upload Another File</button>
          <button class="ghost-btn" type="button" data-generate-insights>Open AI Insights</button>
          <button class="primary-btn" type="button" data-download-report="pdf">Download PDF Report</button>
        </div>
      </div>

      ${renderDashboardFilters()}

      ${renderActiveFilterSummary()}

      <div class="summary-grid">
        ${renderSummaryCards()}
      </div>

      <div class="subnote-bar">
        Pass Marks: ${escapeHtml(passMarks)} | Max Marks: ${escapeHtml(maxMarks)} | Pass Percentage: ${escapeHtml(formatPercent(passPercentage))} | Fail Percentage: ${escapeHtml(formatPercent(failPercentage))}
      </div>

      ${isMultiSubject ? renderSubjectSummaryPanel() : ''}

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
              <p class="eyebrow">${isExactStudentSubject ? 'Selected Record' : 'Top Performers'}</p>
              <h3>${isExactStudentSubject ? 'Selected Student Score' : 'Top 5 Students'}</h3>
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
              <p class="eyebrow">${isExactStudentSubject ? 'Exact Match' : 'Performance Table'}</p>
              <h3>${isExactStudentSubject ? 'Selected Student Performance' : 'Top Performers'}</h3>
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
              <p class="eyebrow">${isExactStudentSubject ? 'Student Status' : 'Support List'}</p>
              <h3>${isExactStudentSubject ? 'Support Status' : 'Weak Students'}</h3>
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
            `).join('') : `<div class="upload-empty"><strong>${isExactStudentSubject ? 'Selected student is not weak' : 'No weak students found'}</strong><p>${isExactStudentSubject ? 'This student is above the weak-student threshold for the selected subject.' : 'All students are above the weak-student threshold for this upload.'}</p></div>`}
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
        </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Roll No</th>
                <th>Student Name</th>
                ${subjectHeaderCells}
                <th>${isMultiSubject ? 'Average Marks' : 'Marks'}</th>
                <th>Percentage</th>
                <th>Status</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents.length ? filteredStudents.map((student) => `
                <tr>
                  <td>${escapeHtml(student.rank)}</td>
                  <td>${escapeHtml(student.rollNo)}</td>
                  <td>${escapeHtml(student.studentName)}</td>
                  ${isMultiSubject ? visibleSubjectNames.map((subjectName) => `<td>${escapeHtml(formatSubjectMark(student, subjectName))}</td>`).join('') : ''}
                  <td>${escapeHtml(student.marks)}</td>
                  <td>${escapeHtml(formatPercent(student.percentage))}</td>
                  <td><span class="status-pill ${getStatusClass(student.status)}">${escapeHtml(student.status)}</span></td>
                  <td><span class="category-pill ${getCategoryClass(student.category)}">${escapeHtml(student.category)}</span></td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="${escapeHtml(isMultiSubject ? visibleSubjectNames.length + 7 : 7)}">
                    <div class="upload-empty">
                      <strong>No matching students found</strong>
                      <p>Change the subject or student filter to see more records.</p>
                    </div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </section>
    </section>
  `;
}

function cleanInsightText(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderInsightSection(title, text, extraClass = '') {
  const cleanedText = cleanInsightText(text);
  return `
    <article class="insight-card ${extraClass}">
      <p class="eyebrow">${escapeHtml(title)}</p>
      <div class="ai-answer">${escapeHtml(cleanedText || 'No data yet.').replace(/\n/g, '<br>')}</div>
    </article>
  `;
}

function buildFallbackInsights() {
  const analytics = state.analytics;
  if (!analytics) {
    return {
      overallSummary: 'Upload a subject file to generate AI insights.',
      weakStudentAnalysis: 'Weak student analysis will appear after data is uploaded.',
      topPerformerAnalysis: 'Top performer analysis will appear after data is uploaded.',
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
  const topPerformerAnalysis = getTopPerformers(3)
    .map((student, index) => `${index + 1}. ${student.studentName} scored ${formatPercent(Number(student.percentage ?? student.marks) || 0)}.`)
    .join('\n') || 'Top performers will appear when student records are available.';

  return {
    overallSummary,
    weakStudentAnalysis,
    topPerformerAnalysis,
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
            <h3>Focused summary</h3>
            <p>The cards below show only useful insights from the uploaded student data.</p>
          </div>
        </div>

        <div class="insight-grid">
          ${renderInsightSection('Overall Summary', insights.overallSummary || fallback.overallSummary || '')}
          ${renderInsightSection('Weak Student Analysis', insights.weakStudentAnalysis || fallback.weakStudentAnalysis || '')}
          ${renderInsightSection('Top Performer Analysis', insights.topPerformerAnalysis || fallback.topPerformerAnalysis || '')}
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
          <p>You can upload one or more subject files, review analytics, and export reports.</p>
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

async function loadFilteredDashboardData() {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    return;
  }

  const subject = normalizeFilterValue(state.dashboardFilters.subject);
  const student = normalizeFilterValue(state.dashboardFilters.student);
  const params = new URLSearchParams({ subject, student });

  try {
    const response = await requestJson(`/api/analytics/${encodeURIComponent(uploadId)}/filtered?${params.toString()}`);
    state.dashboardAnalytics = response.analytics || state.analytics;
    state.dashboardStudents = Array.isArray(response.students) ? response.students : state.students;
    state.dashboardFilterOptions = {
      subjects: response.filters?.subjectOptions || getSubjectFilterOptions(),
      students: response.filters?.studentOptions || state.dashboardFilterOptions.students,
    };
  } catch (error) {
    console.warn('[DASHBOARD FILTER FALLBACK]', error.message);
    const fallback = calculateLocalDashboardFilter();
    state.dashboardAnalytics = fallback.analytics;
    state.dashboardStudents = fallback.students;
  }
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

async function applyDashboardFilters() {
  await loadFilteredDashboardData();
  renderPage();
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

    if (state.processing.progress < 25) state.processing.message = 'Uploading file to the backend.';
    else if (state.processing.progress < 55) state.processing.message = 'Studying file structure and validating columns.';
    else if (state.processing.progress < 85) state.processing.message = 'Understanding marks data and calculating analytics.';
    else state.processing.message = 'Saving verified data and preparing the dashboard.';

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

function parseQuestionRange(question) {
  const normalized = String(question || '').toLowerCase();
  const rangeMatch = normalized.match(/(?:between|from)?\s*(\d+(?:\.\d+)?)\s*(?:to|-|and)\s*(\d+(?:\.\d+)?)/i);
  if (!rangeMatch) {
    return null;
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const usePercentage = normalized.includes('percent') || normalized.includes('percentage') || normalized.includes('%');
  return { lower, upper, usePercentage };
}

function parseQuestionThreshold(question) {
  const normalized = String(question || '').toLowerCase();
  const thresholdMatch = normalized.match(/\b(less than|below|under|greater than|more than|above|over|at least|minimum|maximum)\s+(\d+(?:\.\d+)?)\b/i);
  if (!thresholdMatch) {
    return null;
  }

  const operatorText = thresholdMatch[1].toLowerCase();
  const value = Number(thresholdMatch[2]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const usePercentage = normalized.includes('percent') || normalized.includes('percentage') || normalized.includes('%');
  let operator = 'lt';
  if (['greater than', 'more than', 'above', 'over'].includes(operatorText)) {
    operator = 'gt';
  } else if (operatorText === 'at least' || operatorText === 'minimum') {
    operator = 'gte';
  } else if (operatorText === 'maximum') {
    operator = 'lte';
  }

  return { operator, value, usePercentage };
}

const DATA_QUERY_SCOPE_MESSAGE = 'Please ask questions regarding your uploaded student performance data.';
const DATA_QUERY_KEYWORDS = [
  'student', 'students', 'roll', 'name', 'names', 'mark', 'marks', 'score', 'scores',
  'percentage', 'percent', 'pass', 'passed', 'fail', 'failed', 'weak', 'risk',
  'top', 'best', 'highest', 'lowest', 'average', 'mean', 'rank', 'performer',
  'performance', 'subject', 'subjects', 'class', 'analytics', 'analysis',
  'distribution', 'range', 'between', 'above', 'below', 'count', 'total',
  'grade', 'category', 'dashboard', 'upload', 'data', 'report', 'result',
  'results', 'insight', 'recommendation', 'improvement', 'strength', 'weakness',
];
const OFF_TOPIC_QUERY_PATTERNS = [
  /\b(hello|hi|hey|bye|good morning|good afternoon|good evening|good night)\b/i,
  /\bweather\b/i,
  /\bnews\b/i,
  /\bjoke\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\brecipe\b/i,
  /\bmovie\b/i,
  /\bsong\b/i,
  /\blyrics\b/i,
  /\bcricket\b/i,
  /\bfootball\b/i,
  /\bstock\b/i,
  /\bcrypto\b/i,
  /\bcapital of\b/i,
  /\bpresident\b/i,
  /\bprime minister\b/i,
  /\bwrite (a )?(code|program|script)\b/i,
  /\bmake (a )?(code|program|script)\b/i,
  /\bapi key\b/i,
  /\bpassword\b/i,
  /\bignore (previous|all) instructions\b/i,
  /\bsystem prompt\b/i,
];
const CONCEPT_QUERY_PATTERN = /\b(what is|what are|explain|define|meaning of|definition of|teach me|tell me about)\b/i;

function collectKnownQueryTerms() {
  const terms = new Set();
  const addTerm = (value) => {
    const term = String(value || '').trim().toLowerCase();
    if (term.length >= 2) {
      terms.add(term);
    }
  };

  addTerm(state.currentSubject?.name);
  addTerm(state.currentUpload?.subjectName);
  getSubjectSummary().forEach((subject) => addTerm(subject.subjectName));
  getDashboardStudents().forEach((student) => {
    addTerm(student.rollNo);
    addTerm(student.studentName);
    if (student?.subjectMarks && typeof student.subjectMarks === 'object' && !Array.isArray(student.subjectMarks)) {
      Object.keys(student.subjectMarks).forEach(addTerm);
    }
  });

  return Array.from(terms);
}

function hasUploadedDataSignal(question) {
  const normalized = String(question || '').toLowerCase();
  if (parseQuestionRange(question)) {
    return true;
  }

  if (parseQuestionThreshold(question)) {
    return true;
  }

  if (DATA_QUERY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  return collectKnownQueryTerms().some((term) => term && normalized.includes(term));
}

function isMostlyConceptQuestion(question) {
  const normalized = String(question || '').toLowerCase();
  if (!CONCEPT_QUERY_PATTERN.test(normalized)) {
    return false;
  }

  const metricSignals = DATA_QUERY_KEYWORDS.filter((keyword) => !['subject', 'subjects', 'class', 'data'].includes(keyword));
  const hasMetricSignal = metricSignals.some((keyword) => normalized.includes(keyword)) || parseQuestionRange(question) || parseQuestionThreshold(question);
  if (hasMetricSignal) {
    return false;
  }

  return collectKnownQueryTerms().some((term) => term && normalized.includes(term));
}

function hasOffTopicSignal(question) {
  return OFF_TOPIC_QUERY_PATTERNS.some((pattern) => pattern.test(String(question || '')));
}

function buildCleanDataQuestion(question) {
  const normalized = String(question || '').toLowerCase();
  const range = parseQuestionRange(question);
  const threshold = parseQuestionThreshold(question);
  if (range) {
    return `Which students are in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range?`;
  }
  if (threshold) {
    const direction = ['gt', 'gte'].includes(threshold.operator) ? 'above' : 'below';
    return `Which students scored ${direction} ${threshold.value} ${threshold.usePercentage ? 'percent' : 'marks'}?`;
  }
  if (normalized.includes('failed') || normalized.includes('failure') || normalized.includes('fail')) {
    return 'Which students failed in the uploaded data?';
  }
  if (normalized.includes('weak') || normalized.includes('risk')) {
    return 'Which students need improvement in the uploaded data?';
  }
  if (normalized.includes('top') || normalized.includes('best') || normalized.includes('highest')) {
    return 'Who are the top performers in the uploaded data?';
  }
  if (normalized.includes('average') || normalized.includes('mean')) {
    return 'What is the class average in the uploaded data?';
  }
  if (normalized.includes('subject')) {
    return 'Which subject has the highest and lowest performance in the uploaded data?';
  }
  return 'Show the pass/fail summary for the uploaded data.';
}

function classifyQuestionScope(question) {
  const text = String(question || '').trim();
  if (!text) {
    return { allowed: false, message: 'Please type a question about your uploaded student performance data.' };
  }

  if (!hasUploadedDataSignal(text) || isMostlyConceptQuestion(text)) {
    return { allowed: false, message: DATA_QUERY_SCOPE_MESSAGE };
  }

  if (hasOffTopicSignal(text)) {
    return {
      allowed: false,
      message: `${DATA_QUERY_SCOPE_MESSAGE} Try asking: "${buildCleanDataQuestion(text)}"`,
    };
  }

  return { allowed: true, message: '' };
}

function getQuestionAnswerFromData(question) {
  const normalized = String(question || '').toLowerCase();
  const analytics = getDashboardAnalytics() || {};
  const students = Array.isArray(getDashboardStudents()) ? getDashboardStudents() : [];
  const topStudents = getTopPerformers(5);
  const failedStudents = students.filter((student) => String(student.status).toLowerCase() === 'fail').slice(0, 5);
  const weakStudents = getWeakStudents(5);
  const range = parseQuestionRange(question);
  const threshold = parseQuestionThreshold(question);

  if (range) {
    const matches = students.filter((student) => {
      const value = range.usePercentage ? Number(student.percentage) : Number(student.marks);
      return Number.isFinite(value) && value >= range.lower && value <= range.upper;
    });

    if (!matches.length) {
      return `No students were found in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range.`;
    }

    return `Students in the ${range.lower} to ${range.upper} ${range.usePercentage ? 'percentage' : 'marks'} range: ${matches
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${formatPercent(student.percentage)})`)
      .join('; ')}.`;
  }

  if (threshold) {
    const matches = students.filter((student) => {
      const value = threshold.usePercentage ? Number(student.percentage) : Number(student.marks);
      if (!Number.isFinite(value)) return false;
      if (threshold.operator === 'gt') return value > threshold.value;
      if (threshold.operator === 'gte') return value >= threshold.value;
      if (threshold.operator === 'lte') return value <= threshold.value;
      return value < threshold.value;
    });
    const direction = ['gt', 'gte'].includes(threshold.operator) ? 'above' : 'below';
    const metric = threshold.usePercentage ? 'percentage' : 'marks';
    const isCountQuestion = /\b(how many|count|number of|total)\b/i.test(normalized);

    if (!matches.length) {
      return `No students scored ${direction} ${threshold.value} ${metric}.`;
    }

    if (isCountQuestion) {
      return `${matches.length} student${matches.length === 1 ? '' : 's'} scored ${direction} ${threshold.value} ${metric}.`;
    }

    return `Students who scored ${direction} ${threshold.value} ${metric}: ${matches
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${student.marks} marks, ${formatPercent(student.percentage)})`)
      .join('; ')}.`;
  }

  if (normalized.includes('failed') || normalized.includes('failure') || normalized.includes('students who are failed')) {
    if (!failedStudents.length) {
      return 'No failed students were found in the current upload.';
    }
    return `Failed students: ${failedStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${student.marks} marks, ${formatPercent(student.percentage)})`)
      .join('; ')}.`;
  }

  if (normalized.includes('top') || normalized.includes('best') || normalized.includes('highest')) {
    if (!topStudents.length) {
      return 'No top performers are available for the current upload yet.';
    }
    return `Top performers: ${topStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${formatPercent(student.percentage)})`)
      .join('; ')}.`;
  }

  if (normalized.includes('weak') || normalized.includes('risk') || normalized.includes('fail')) {
    if (!weakStudents.length) {
      return 'No weak students were found in the current upload.';
    }
    return `Weak students: ${weakStudents
      .map((student) => `${student.studentName} (Roll No ${student.rollNo}, ${formatPercent(student.percentage)})`)
      .join('; ')}.`;
  }

  if (normalized.includes('pass') || normalized.includes('fail')) {
    return `Pass/fail summary: ${analytics.passedStudents || 0} passed and ${analytics.failedStudents || 0} failed out of ${analytics.totalStudents || students.length || 0} students. Pass percentage is ${formatPercent(analytics.passPercentage || 0)}.`;
  }

  if (normalized.includes('average') || normalized.includes('mean')) {
    return `The class average is ${formatPercent(analytics.averageMarks || 0)}. The highest mark is ${analytics.highestMarks ?? 0} and the lowest mark is ${analytics.lowestMarks ?? 0}.`;
  }

  return '';
}

async function getGroqAnswer(question) {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    return '';
  }

  const analytics = getDashboardAnalytics() || {};
  const students = Array.isArray(getDashboardStudents()) ? getDashboardStudents() : [];
  const subjectName = state.currentSubject?.name || state.currentUpload?.subjectName || 'Current Subject';
  const context = {
    subjectName,
    analytics: {
      totalStudents: analytics.totalStudents || students.length || 0,
      passedStudents: analytics.passedStudents || 0,
      failedStudents: analytics.failedStudents || 0,
      averageMarks: analytics.averageMarks || 0,
      highestMarks: analytics.highestMarks || 0,
      lowestMarks: analytics.lowestMarks || 0,
      passPercentage: analytics.passPercentage || 0,
      failPercentage: analytics.failPercentage || 0,
      marksDistribution: analytics.marksDistribution || {},
    },
    topStudents: getTopPerformers(10).map((student) => ({
      rollNo: student.rollNo,
      studentName: student.studentName,
      marks: student.marks,
      percentage: student.percentage,
      status: student.status,
      category: student.category,
      rank: student.rank,
    })),
    weakStudents: getWeakStudents(10).map((student) => ({
      rollNo: student.rollNo,
      studentName: student.studentName,
      marks: student.marks,
      percentage: student.percentage,
      status: student.status,
      category: student.category,
      rank: student.rank,
    })),
    students: students.slice(0, 200).map((student) => ({
      rollNo: student.rollNo,
      studentName: student.studentName,
      marks: student.marks,
      percentage: student.percentage,
      status: student.status,
      category: student.category,
      rank: student.rank,
    })),
  };

  try {
    const response = await requestJson(`/api/ai-query/${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      body: {
        question,
        context,
        filters: {
          subject: normalizeFilterValue(state.dashboardFilters.subject),
          student: normalizeFilterValue(state.dashboardFilters.student),
        },
      },
    });
    let answer = response?.answer;
    if (typeof answer === 'string' && answer.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(answer);
        answer = parsed?.answer ?? answer;
      } catch {
        // Keep original answer.
      }
    }
    if (typeof answer === 'number') {
      return `Answer: ${answer}`;
    }
    if (answer && typeof answer === 'object') {
      answer = answer.answer ?? answer.message ?? '';
    }
    return String(answer || '').trim();
  } catch (error) {
    console.warn('[QUERY API ERROR]', error.message);
    return '';
  }
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

  const scope = classifyQuestionScope(question);
  if (!scope.allowed) {
    state.queryReply = scope.message;
    if (answer) {
      answer.innerHTML = escapeHtml(scope.message).replace(/\n/g, '<br>');
    }
    return;
  }

  const localResponse = getQuestionAnswerFromData(question) || getInsightAnswer(question);
  state.queryReply = localResponse;
  if (answer) {
    answer.innerHTML = escapeHtml(localResponse).replace(/\n/g, '<br>');
  }

  void (async () => {
    const apiResponse = await getGroqAnswer(question);
    const response = apiResponse || localResponse;
    if (response && response !== localResponse) {
      state.queryReply = response;
      if (answer) {
        answer.innerHTML = escapeHtml(response).replace(/\n/g, '<br>');
      }
    }
  })();
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

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSidebar();
  }
});

document.addEventListener('DOMContentLoaded', initializeApp);
