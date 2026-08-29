// ============================================================================
// src/utils/format.js
// Pure formatting helpers, including the escapeHtml() XSS guard.
// ============================================================================
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

export {
  escapeHtml,
  formatDate,
  formatDateOnly,
  formatPercent,
  delay,
  formatErrorDetails,
};
