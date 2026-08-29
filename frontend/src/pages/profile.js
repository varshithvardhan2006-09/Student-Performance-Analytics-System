// ============================================================================
// src/pages/profile.js
// Teacher profile page.
// ============================================================================

import { requestJson } from '../api/client.js';
import { renderEmptyState } from '../shell.js';
import { state } from '../state.js';
import { escapeHtml, formatDate } from '../utils/format.js';
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

export {
  renderProfilePage,
  loadProfile,
  loadProfileStats,
};
