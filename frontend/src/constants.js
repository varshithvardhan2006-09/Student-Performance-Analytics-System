// ============================================================================
// src/constants.js
// Storage keys and per-view page metadata.
// ============================================================================
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

export {
  STORAGE_KEYS,
  PAGE_META,
};
