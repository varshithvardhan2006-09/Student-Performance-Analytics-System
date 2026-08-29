// ============================================================================
// src/charts/renderer.js
// All Chart.js rendering and teardown.
// ============================================================================

import { getActiveDashboardFilterInfo, getCategoryCounts, getCurrentUpload, getDashboardAnalytics, getDashboardStudents, getSelectedDashboardStudent, getSelectedSubjectName, getStudentSubjectRows, getTopPerformers, getTrendData } from '../selectors.js';
import { state } from '../state.js';
import { formatPercent } from '../utils/format.js';
function destroyCharts() {
  for (const chart of state.charts) {
    chart.destroy();
  }
  state.charts = [];
}

function chartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#334155',
          font: {
            family: 'Manrope, sans-serif',
          },
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#fff',
        bodyColor: '#fff',
      },
      ...extra.plugins,
    },
    ...extra,
  };
}

/**
 * Replace every chart canvas on the page with a short explanation.
 * Used when the Chart.js CDN could not be reached -- the numeric tables on the
 * dashboard remain fully populated, so only the visualisation is lost.
 */
function showChartFallback() {
  const canvases = document.querySelectorAll('canvas[id$="Chart"]');
  for (const canvas of canvases) {
    const holder = canvas.parentElement;
    if (!holder || holder.dataset.chartFallback === 'true') {
      continue;
    }
    holder.dataset.chartFallback = 'true';
    holder.innerHTML =
      '<p class="chart-fallback">Charts could not be loaded (the Chart.js CDN is '
      + 'unreachable). All figures are still available in the tables below.</p>';
  }
}

function renderCharts() {
  destroyCharts();
  if (!window.Chart) {
    // The CDN failed -- degrade to the static tables.
    showChartFallback();
    return;
  }

  const activeFilterInfo = getActiveDashboardFilterInfo();
  if (activeFilterInfo.hasStudent) {
    renderStudentCharts(activeFilterInfo);
    return;
  }

  const analytics = getDashboardAnalytics();
  const students = getDashboardStudents();
  if (!analytics || !students.length) {
    return;
  }

  const pieCanvas = document.getElementById('passFailChart');
  const barCanvas = document.getElementById('distributionChart');
  const topCanvas = document.getElementById('topPerformerChart');
  const categoryCanvas = document.getElementById('categoryChart');
  const trendCanvas = document.getElementById('trendChart');

  if (pieCanvas) {
    state.charts.push(new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: ['Passed', 'Failed'],
        datasets: [{
          data: [analytics.passedStudents || 0, analytics.failedStudents || 0],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      }),
    }));
  }

  if (barCanvas) {
    const distribution = analytics.marksDistribution || {};
    state.charts.push(new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: ['0-35', '36-50', '51-70', '71-85', '86-100'],
        datasets: [{
          label: 'Students',
          data: [
            distribution.range_0_35 || 0,
            distribution.range_36_50 || 0,
            distribution.range_51_70 || 0,
            distribution.range_71_85 || 0,
            distribution.range_86_100 || 0,
          ],
          backgroundColor: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#0f55e9'],
          borderRadius: 10,
        }],
      },
      options: chartOptions({
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' },
          },
        },
      }),
    }));
  }

  if (topCanvas) {
    // Five, to match the "Top 5 Students" heading on the card this canvas sits
    // in. Chart.js draws the first entry at the top of a horizontal bar chart,
    // so the ranked order is used as-is and the highest scorer leads.
    const topStudents = getTopPerformers(5);
    state.charts.push(new Chart(topCanvas, {
      type: 'bar',
      data: {
        labels: topStudents.map((student) => `${student.studentName}`),
        datasets: [{
          label: 'Marks',
          data: topStudents.map((student) => Number(student.marks) || 0),
          backgroundColor: '#22c55e',
          borderRadius: 12,
        }],
      },
      options: chartOptions({
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.18)' },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
        },
      }),
    }));
  }

  if (categoryCanvas) {
    const counts = getCategoryCounts();
    state.charts.push(new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ['#2563eb', '#22c55e', '#f59e0b', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      }),
    }));
  }

  if (trendCanvas) {
    const trend = getTrendData();
    state.charts.push(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: [{
          label: 'Average Marks',
          data: trend.values,
          tension: 0.35,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#475569' },
            grid: { display: false },
          },
          y: {
            ticks: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.18)' },
          },
        },
      }),
    }));
  }
}

function renderStudentCharts(activeFilterInfo = getActiveDashboardFilterInfo()) {
  const student = getSelectedDashboardStudent();
  const selectedSubject = activeFilterInfo.hasSubject ? getSelectedSubjectName() : '';
  const rows = getStudentSubjectRows(student);
  if (!student || !rows.length) {
    return;
  }

  const labels = rows.map((row) => row.subjectName);
  const marks = rows.map((row) => Number(row.marks) || 0);
  const percentages = rows.map((row) => Number(row.percentage) || 0);
  const classAverages = rows.map((row) => Number(row.classAverage) || 0);
  const chartPalette = ['#2563eb', '#16a34a', '#7c3aed', '#ef4444', '#0ea5e9', '#f59e0b', '#14b8a6', '#ec4899'];

  const subjectMarksCanvas = document.getElementById('studentSubjectMarksChart');
  const distributionCanvas = document.getElementById('studentDistributionChart');
  const trendCanvas = document.getElementById('studentTrendChart');
  const radarCanvas = document.getElementById('studentRadarChart');
  const comparisonCanvas = document.getElementById('studentClassAverageChart');
  const gaugeCanvas = document.getElementById('studentStatusGaugeChart');

  if (subjectMarksCanvas) {
    state.charts.push(new Chart(subjectMarksCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Marks',
          data: marks,
          backgroundColor: '#2563eb',
          borderRadius: 12,
        }],
      },
      options: chartOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        },
      }),
    }));
  }

  if (distributionCanvas) {
    state.charts.push(new Chart(distributionCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: marks,
          backgroundColor: labels.map((_, index) => chartPalette[index % chartPalette.length]),
          borderColor: '#ffffff',
          borderWidth: 3,
        }],
      },
      options: chartOptions({
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#334155',
              boxWidth: 12,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = Number(context.raw) || 0;
                const total = marks.reduce((sum, mark) => sum + mark, 0);
                const share = total ? (value / total) * 100 : 0;
                return `${context.label}: ${value} marks (${formatPercent(share)})`;
              },
            },
          },
        },
      }),
    }));
  }

  if (trendCanvas) {
    state.charts.push(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: selectedSubject ? ['Current Upload'] : labels,
        datasets: [{
          label: selectedSubject ? `${selectedSubject} Marks` : 'Subject Performance',
          data: selectedSubject ? [marks[0]] : marks,
          tension: 0.35,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.18)' } },
        },
      }),
    }));
  }

  if (radarCanvas) {
    state.charts.push(new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: `${student.studentName}`,
          data: percentages,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.16)',
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: chartOptions({
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            pointLabels: { color: '#475569' },
            grid: { color: 'rgba(148, 163, 184, 0.25)' },
          },
        },
      }),
    }));
  }

  if (comparisonCanvas) {
    state.charts.push(new Chart(comparisonCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: student.studentName, data: marks, backgroundColor: '#2563eb', borderRadius: 10 },
          { label: 'Class Average', data: classAverages, backgroundColor: '#f59e0b', borderRadius: 10 },
        ],
      },
      options: chartOptions({
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { beginAtZero: true, max: Number(getCurrentUpload()?.maxMarks) || 100, ticks: { color: '#475569' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        },
      }),
    }));
  }

  if (gaugeCanvas) {
    const value = percentages[0] || 0;
    state.charts.push(new Chart(gaugeCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Score', 'Remaining'],
        datasets: [{
          data: [value, Math.max(0, 100 - value)],
          backgroundColor: [value >= 90 ? '#22c55e' : value >= 75 ? '#2563eb' : value >= 50 ? '#f59e0b' : '#ef4444', '#e5edff'],
          borderWidth: 0,
        }],
      },
      options: chartOptions({
        cutout: '70%',
        circumference: 180,
        rotation: 270,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => context.label === 'Score' ? `${formatPercent(value)} ${rows[0].status}` : '',
            },
          },
        },
      }),
    }));
  }
}

export {
  renderCharts,
};
