// ============================================================================
// src/api/client.js
// Central fetch wrappers: auth headers, JSON requests, blob downloads.
// ============================================================================

import { resolveApiUrl } from './config.js';
import { state } from '../state.js';
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
    // A non-JSON body (an HTML error page from a proxy, say) must not become
    // the Error message shown to the user -- fall back to a short, readable one.
    const fallback = `Request failed with status ${response.status}.`;
    const rawText = typeof text === 'string' ? text.trim() : '';
    const usableText = rawText && !rawText.startsWith('<') && rawText.length <= 200 ? rawText : '';
    const message = data?.message || data?.error || usableText || fallback;
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

export {
  requestJson,
  requestBlob,
};
