// ============================================================================
// src/state.js
// The single mutable application state object shared by every module.
// ============================================================================

import { STORAGE_KEYS } from './constants.js';
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

export {
  state,
};
