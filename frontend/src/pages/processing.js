// ============================================================================
// src/pages/processing.js
// Processing page and its progress indicator.
// ============================================================================

import { renderPage, renderSidebar } from '../shell.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/format.js';
import { icon } from '../utils/icons.js';
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
            <h3>Checks completed before analytics</h3>
            <ul class="check-list">
              ${validationItems.map((item) => `
                <li class="${item.done ? 'done' : ''}">
                  <span class="check-icon">${icon(item.done ? 'check' : 'circle', 14)}</span>
                  <span>${escapeHtml(item.title)}</span>
                  <span class="step-state">${escapeHtml(item.state)}</span>
                </li>
              `).join('')}
            </ul>
          </section>

          <section class="check-card alt">
            <h3>Current workflow</h3>
            <div class="step-list">
              ${stepData.map((step) => `
                <div class="step-item ${step.done ? 'done' : step.active ? 'active' : ''}">
                  <div class="left">
                    <span class="step-bullet">${icon(step.done ? 'check' : step.active ? 'dot' : 'circle', 14)}</span>
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

/**
 * Start the processing view for an in-flight upload.
 *
 * NOTE: this is a time-based estimate, not real server progress.
 * POST /api/upload is a single request that returns only when parsing,
 * validation and analytics are complete; the server sends no intermediate
 * progress events, so there is nothing real to report while it runs. The bar
 * below is a deliberate, time-based *estimate*: it advances on a timer, is
 * capped at 95% so it can never claim completion the server has not confirmed,
 * and only completeProcessing() -- called from the actual HTTP response --
 * moves it to 100%. The step captions describe the stages the backend really
 * performs, in order, so the estimate stays honest about what is happening.
 *
 * To make this genuine progress the upload route would need to stream status
 * over Server-Sent Events or a WebSocket, or the client would need to use
 * XMLHttpRequest and report xhr.upload.onprogress for the transfer phase.
 */
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

  // Simulated advance -- see the UX SIMULATION note above. Capped at 95%.
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

export {
  renderProcessingPage,
  startProcessing,
  completeProcessing,
};
