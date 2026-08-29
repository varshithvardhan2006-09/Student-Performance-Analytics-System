// ============================================================================
// src/selectors.js
// Derived read-only views over state (filters, subject stats, rankings).
// ============================================================================

import { state } from './state.js';
import { formatDateOnly, formatPercent } from './utils/format.js';
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

/** @param {Array} [source] see getTopPerformers(). */
function getWeakCount(source = null) {
  return (Array.isArray(source) ? source : getDashboardStudents()).filter((student) => Number(student.percentage) < 40 || String(student.category || '').toLowerCase().includes('weak')).length;
}

/**
 * @param {number} limit    how many to return
 * @param {Array}  [source] explicit student list; defaults to the dashboard's
 *                          (possibly filtered) set. The Insights page passes
 *                          the whole upload so its lists match its headline
 *                          figures -- see the note in pages/insights.js.
 */
function getTopPerformers(limit = 5, source = null) {
  return [...(Array.isArray(source) ? source : getDashboardStudents())]
    .sort((left, right) => Number(right.marks) - Number(left.marks) || Number(left.rank) - Number(right.rank))
    .slice(0, limit);
}

/** @param {Array} [source] see getTopPerformers(). */
function getWeakStudents(limit = 5, source = null) {
  return [...(Array.isArray(source) ? source : getDashboardStudents())]
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

export {
  getCategoryClass,
  getStatusClass,
  getCurrentUpload,
  getCurrentUploadId,
  getDashboardAnalytics,
  getDashboardStudents,
  getSourceStudents,
  normalizeFilterValue,
  resetStudentTableFilters,
  getActiveDashboardFilterInfo,
  getPerformanceStatus,
  calculateLocalDashboardFilter,
  getSubjectNames,
  getSubjectFilterOptions,
  getSubjectSummary,
  formatSubjectMark,
  getWeakCount,
  getTopPerformers,
  getWeakStudents,
  getFilteredStudents,
  getCategoryCounts,
  getSelectedDashboardStudent,
  getSelectedSubjectName,
  getStudentSubjectRows,
  getStudentOverallPercentage,
  buildStudentInsights,
  getTrendData,
  getImprovementRate,
};
