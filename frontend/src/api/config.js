// ============================================================================
// src/api/config.js
// API base URL resolution (window.SAPS_CONFIG -> localStorage -> sessionStorage).
// ============================================================================

import { STORAGE_KEYS } from '../constants.js';
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
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
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

/**
 * Persist an API base URL supplied as ?api=... on the page URL.
 *
 * getApiBaseUrl() already prefers a stored override, so persisting the query
 * parameter once at startup means a deployed frontend can be pointed at a
 * backend by visiting `?api=https://your-api.example.com` a single time --
 * the choice then survives navigation and reloads.
 *
 * @returns {string} the persisted URL, or '' when no override was supplied
 */
function persistApiBaseUrlOverride() {
  const queryUrl = new URLSearchParams(window.location.search).get('api');
  if (typeof queryUrl !== 'string' || !queryUrl.trim()) {
    return '';
  }
  return setApiBaseUrl(queryUrl);
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

export {
  getApiBaseUrl,
  resolveApiUrl,
  persistApiBaseUrlOverride,
};
