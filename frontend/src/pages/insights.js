// ============================================================================
// src/pages/insights.js
// AI insights page and the AI chat query pipeline.
// ============================================================================

import { requestJson } from '../api/client.js';
import { getCurrentUpload, getCurrentUploadId, getImprovementRate, getSourceStudents, getTopPerformers, getWeakCount, getWeakStudents } from '../selectors.js';
import { renderEmptyState, renderPage } from '../shell.js';
import { state } from '../state.js';
import { escapeHtml, formatPercent } from '../utils/format.js';
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
      <div class="ai-answer">${escapeHtml(cleanedText || 'No data yet.').replace(/\n/g, '<br>')}</div>
    </article>
  `;
}

function buildFallbackInsights() {
  const analytics = state.analytics;
  // Whole-upload figures, to stay consistent with the analytics object above.
  const uploadStudents = getSourceStudents();
  if (!analytics) {
    return {
      overallSummary: 'Upload a subject file to generate AI insights.',
      weakStudentAnalysis: 'Weak student analysis will appear after data is uploaded.',
      topPerformerAnalysis: 'Top performer analysis will appear after data is uploaded.',
    };
  }

  const weakStudents = getWeakCount(uploadStudents);
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
  const topPerformerAnalysis = getTopPerformers(3, uploadStudents)
    .map((student, index) => `${index + 1}. ${student.studentName} scored ${formatPercent(Number(student.percentage ?? student.marks) || 0)}.`)
    .join('\n') || 'Top performers will appear when student records are available.';

  return {
    overallSummary,
    weakStudentAnalysis,
    topPerformerAnalysis,
  };
}

// Strengths and focus areas are worked out from this upload's own figures.
function buildFocusTags(analytics, weakCount, topPerformers) {
  const passPercentage = Number(analytics.passPercentage) || 0;
  const averageMarks = Number(analytics.averageMarks) || 0;
  const failed = Number(analytics.failedStudents) || 0;
  const subjects = Array.isArray(analytics.subjectSummary)
    ? [...analytics.subjectSummary].sort((a, b) => b.averageMarks - a.averageMarks)
    : [];

  const strengthTags = [];
  if (passPercentage >= 70) strengthTags.push(`${formatPercent(passPercentage)} of students passed`);
  if (topPerformers.length) strengthTags.push(`Top scorer: ${topPerformers[0].studentName}`);
  if (subjects.length > 1) strengthTags.push(`Strongest subject: ${subjects[0].subjectName}`);
  if (weakCount === 0) strengthTags.push('No students below 40%');
  if (!strengthTags.length) strengthTags.push(`Class average is ${formatPercent(averageMarks)}`);

  const improvementTags = [];
  if (failed > 0) improvementTags.push(`${failed} student${failed === 1 ? '' : 's'} failed`);
  if (weakCount > 0) improvementTags.push(`${weakCount} student${weakCount === 1 ? '' : 's'} below 40%`);
  if (subjects.length > 1) improvementTags.push(`Weakest subject: ${subjects[subjects.length - 1].subjectName}`);
  if (!improvementTags.length) improvementTags.push('No weak areas found in this upload');

  return { strengthTags, improvementTags };
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
  const uploadStudents = getSourceStudents();
  const weakCount = getWeakCount(uploadStudents);
  const improvementRate = getImprovementRate();
  // These lists and the summary cards above them must read the same dataset,
  // or a dashboard filter makes the page contradict itself -- a "Top 5" of one
  // mid-ranked student beside a headline "highest mark" from someone else.
  const topPerformers = getTopPerformers(5, uploadStudents);
  const passPercentage = Number(analytics.passPercentage) || 0;
  const lowestMarks = Number(analytics.lowestMarks) || 0;
  const highestMarks = Number(analytics.highestMarks) || 0;
  const averageMarks = Number(analytics.averageMarks) || 0;
  const { strengthTags, improvementTags } = buildFocusTags(analytics, weakCount, topPerformers);

  return `
    <section class="page">
      <div class="hero-card page-card">
        <div>
          <h1 class="page-title">Find trends in your class results and generate detailed reports.</h1>
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
          <h3>Ask any question about your data and get an instant answer.</h3>
          <form id="queryForm" class="ai-query">
            <input id="queryInput" type="text" placeholder="Which topics do students find most difficult?">
            <button class="primary-btn" type="button" data-query-submit>Generate Answer</button>
          </form>
          <div class="ai-answer" id="queryAnswer">${escapeHtml(state.queryReply || 'Ask a question to generate a tailored reply.').replace(/\n/g, '<br>')}</div>
        </section>

        <section class="insight-card">
          <h3>What is going well</h3>
          <div class="tag-list">
            ${strengthTags.map((text) => `<span class="tag">${escapeHtml(text)}</span>`).join('')}
          </div>
        </section>

        <section class="insight-card">
          <h3>Where to focus next</h3>
          <div class="tag-list">
            ${improvementTags.map((text) => `<span class="tag">${escapeHtml(text)}</span>`).join('')}
          </div>
        </section>

        <section class="insight-card">
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
            <h3>Focused summary</h3>
            <p>The cards below show only useful insights from the uploaded student data.</p>
          </div>
        </div>

        <div class="insight-grid">
          ${renderInsightSection('Overall Summary', insights.overallSummary || fallback.overallSummary || '')}
          ${renderInsightSection('Weak Student Analysis', insights.weakStudentAnalysis || fallback.weakStudentAnalysis || '')}
          ${renderInsightSection('Top Performer Analysis', insights.topPerformerAnalysis || fallback.topPerformerAnalysis || '')}
        </div>

        <div class="page-card" style="margin-top:1rem;background:#f8fbff;">
          <p class="page-copy">Insights are generated using the uploaded data. Please review the results alongside your own teaching expertise before making decisions.</p>
        </div>
      </section>
    </section>
  `;
}

async function ensureInsights(force = false) {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    return null;
  }

  if (!force && state.insights) {
    return state.insights;
  }

  const url = `/api/ai-insights/${encodeURIComponent(uploadId)}`;

  // "Generate Insights" always creates a fresh set. Otherwise reuse the saved
  // insights, and only generate them when none exist for this upload yet.
  if (force) {
    state.insights = (await requestJson(url, { method: 'POST' })).insights || null;
  } else {
    state.insights = (await requestJson(url)).insights || null;
    if (!state.insights) {
      state.insights = (await requestJson(url, { method: 'POST' })).insights || null;
    }
  }

  if (state.view === 'insights') {
    renderPage();
  }

  return state.insights;
}

function getInsightAnswer(question) {
  const lower = question.toLowerCase();
  const students = state.students;
  const uploadStudents = getSourceStudents();
  const topStudents = getTopPerformers(3, uploadStudents);
  const weakStudents = getWeakStudents(3, uploadStudents);
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


async function getGroqAnswer(question) {
  const uploadId = getCurrentUploadId();
  if (!uploadId) {
    return '';
  }

  // Only the question travels. The server reads the upload's analytics and
  // student rows straight from the database, so the large `context` payload
  // this used to send was ignored on arrival -- it just risked tripping the
  // request-body size limit on big classes.
  try {
    const response = await requestJson(`/api/ai-query/${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      body: { question },
    });

    let answer = response?.answer;
    if (typeof answer === 'string' && answer.trim().startsWith('{')) {
      try {
        answer = JSON.parse(answer)?.answer ?? answer;
      } catch {
        // Not JSON after all -- keep the original string.
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

  const show = (text) => {
    state.queryReply = text;
    if (answer) {
      answer.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    }
  };

  if (!question) {
    show('Please type a question first.');
    return;
  }

  if (!getCurrentUploadId()) {
    show('Upload a marks file first, then ask a question about it.');
    return;
  }

  // The backend owns the answering logic. This page used to keep its own copy
  // of the query engine, which drifted from the server's and produced
  // different answers for the same question; there is now a single source of
  // truth. getInsightAnswer() remains only as an offline fallback.
  show('Analyzing your question...');

  try {
    const apiAnswer = await getGroqAnswer(question);
    show(apiAnswer || getInsightAnswer(question));
  } catch (error) {
    console.warn('[QUERY ERROR]', error.message);
    show(getInsightAnswer(question));
  }
}

export {
  renderInsightsPage,
  ensureInsights,
  submitQueryForm,
};
