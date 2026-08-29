// ============================================================================
// src/pages/dashboard.js
// Dashboard page: summary cards, filters, student table.
// ============================================================================

import { requestJson } from '../api/client.js';
import { buildStudentInsights, calculateLocalDashboardFilter, formatSubjectMark, getActiveDashboardFilterInfo, getCategoryClass, getCurrentUpload, getCurrentUploadId, getDashboardAnalytics, getDashboardStudents, getFilteredStudents, getPerformanceStatus, getSelectedDashboardStudent, getSelectedSubjectName, getSourceStudents, getStatusClass, getStudentOverallPercentage, getStudentSubjectRows, getSubjectFilterOptions, getSubjectNames, getSubjectSummary, getTopPerformers, getWeakCount, getWeakStudents, normalizeFilterValue } from '../selectors.js';
import { renderEmptyState, renderPage } from '../shell.js';
import { state } from '../state.js';
import { escapeHtml, formatDate, formatPercent } from '../utils/format.js';
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
  const activeFilterInfo = getActiveDashboardFilterInfo();
  if (activeFilterInfo.hasStudent) {
    return renderStudentDashboardPage(activeFilterInfo);
  }

  const topPerformers = getTopPerformers(5);
  const weakStudents = getWeakStudents(5);
  const filteredStudents = getFilteredStudents();
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

async function applyDashboardFilters() {
  await loadFilteredDashboardData();
  renderPage();
}

export {
  renderDashboardPage,
  loadFilteredDashboardData,
  applyDashboardFilters,
};
