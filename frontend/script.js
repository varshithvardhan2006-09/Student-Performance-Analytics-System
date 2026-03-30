const state = {
    students: [],
    stats: null,
    charts: [],
    semesters: [],
    subjectsBySemester: {},
    selectedSemester: localStorage.getItem('tbp-semester') || '',
    isLoggedIn: sessionStorage.getItem('tbp-auth') === 'true',
    theme: localStorage.getItem('tbp-theme') || 'light',
};

const moduleConfig = {
    visuals: {
        title: 'Visual Dashboard',
        path: 'module.html?module=visuals',
    },
    ranks: {
        title: 'Rankings',
        path: 'module.html?module=ranks',
    },
    subjects: {
        title: 'Subject Wise Marks',
        path: 'module.html?module=subjects',
    },
    average: {
        title: 'Class Statistics',
        path: 'module.html?module=average',
    },
    add: {
        title: 'Add or Import Student Data',
        path: 'module.html?module=add',
    },
};

const chartAnimation = {
    duration: 1200,
    easing: 'easeOutQuart',
};

const STUDENTS_PER_PAGE = 8;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSelectedSemester() {
    return state.selectedSemester || state.semesters[0] || 'Semester 1';
}

function getSubjects(semester = getSelectedSemester()) {
    const subjects = state.subjectsBySemester?.[semester];
    if (Array.isArray(subjects) && subjects.length) {
        return subjects;
    }

    return state.subjectsBySemester?.['Semester 1'] || [];
}

function renderSemesterOptions(selected = getSelectedSemester()) {
    return state.semesters.map((semester) => `
        <option value="${escapeHtml(semester)}" ${semester === selected ? 'selected' : ''}>${escapeHtml(semester)}</option>
    `).join('');
}

function renderSubjectInputs(student = {}, semester = getSelectedSemester()) {
    return getSubjects(semester).map((subject) => `
        <label>
            <span>${escapeHtml(subject)}</span>
            <input name="subject_${escapeHtml(subject)}" type="number" min="0" max="100" placeholder="0-100" value="${student.Subjects?.[subject] ?? ''}">
        </label>
    `).join('');
}

function renderSubjectChips(subjects = {}) {
    const entries = Object.entries(subjects || {}).filter(([, marks]) => Number.isFinite(Number(marks)));
    if (!entries.length) {
        return '<span class="subject-chip muted-chip">Overall percentage only</span>';
    }

    return entries.map(([subject, marks]) => `
        <span class="subject-chip">${escapeHtml(subject)} ${Number(marks)}%</span>
    `).join('');
}

function buildPayloadFromForm(form) {
    const formData = new FormData(form);
    const payload = {};
    const subjects = {};

    for (const [key, value] of formData.entries()) {
        if (key.startsWith('subject_')) {
            const subject = key.replace('subject_', '');
            if (value !== '') {
                subjects[subject] = Number(value);
            }
            continue;
        }

        payload[key] = value;
    }

    payload.Subjects = subjects;
    return payload;
}

function calculateTotalPercentage(subjects) {
    const values = Object.values(subjects).filter((value) => Number.isFinite(Number(value))).map(Number);
    if (!values.length) {
        return '--';
    }

    const total = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${total.toFixed(2)}%`;
}

function getStudentTotal(student) {
    const subjectValues = Object.values(student?.Subjects || {})
        .filter((value) => Number.isFinite(Number(value)))
        .map(Number);
    const calculated = subjectValues.length
        ? Number((subjectValues.reduce((sum, value) => sum + value, 0) / subjectValues.length).toFixed(2))
        : NaN;
    const total = Number.isFinite(calculated)
        ? calculated
        : Number(student?.TotalPercentage ?? student?.Marks);
    return Number.isFinite(total) ? total : 0;
}

function getStudentSemester(student) {
    const semester = String(student?.Semester || '').trim();
    return semester && semester !== 'undefined' ? semester : getSelectedSemester();
}

function getSemesterSubjectSummary(semester = getSelectedSemester()) {
    const subjects = getSubjects(semester);
    if (!subjects.length) {
        return 'No subjects are configured for this semester yet.';
    }

    const preview = subjects.slice(0, 4).join(', ');
    return subjects.length > 4
        ? `${preview}, and ${subjects.length - 4} more subjects.`
        : preview;
}

function compareStudentIds(left, right) {
    return String(left?.ID || '').localeCompare(String(right?.ID || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

function getStudentPageForSemester(semester = getSelectedSemester()) {
    if (!state.studentPages) {
        state.studentPages = {};
    }

    return state.studentPages[semester] || 1;
}

function setStudentPageForSemester(semester, page) {
    if (!state.studentPages) {
        state.studentPages = {};
    }

    state.studentPages[semester] = page;
}

function getPagedStudents(students, semester = getSelectedSemester()) {
    const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
    const activePage = Math.min(getStudentPageForSemester(semester), totalPages);
    const start = (activePage - 1) * STUDENTS_PER_PAGE;

    setStudentPageForSemester(semester, activePage);

    return {
        students: students.slice(start, start + STUDENTS_PER_PAGE),
        totalPages,
        activePage,
    };
}

function renderStudentPager(semester = getSelectedSemester(), totalPages = 1, activePage = 1) {
    if (totalPages <= 1) {
        return '';
    }

    return `
        <div class="subject-pager" aria-label="Student pages">
            ${Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1;
                return `
                    <button
                        class="subject-page-btn ${page === activePage ? 'active' : ''}"
                        type="button"
                        data-student-page="${page}"
                        data-semester="${escapeHtml(semester)}"
                        aria-label="Show student page ${page}"
                    >${page}</button>
                `;
            }).join('')}
        </div>
    `;
}

const moduleTemplates = {
    visuals() {
        const semester = getSelectedSemester();
        return `
            <section class="module-hero slide-in-panel">
                <div>
                    <p class="eyebrow">Semester Analytics</p>
                    <h3>${semester} performance visuals</h3>
                    <p class="module-hero-copy">Charts below are filtered to ${semester} and use total percentage, so teachers can focus on the term they are currently evaluating.</p>
                </div>
                <div class="module-hero-badge">
                    <span>Records</span>
                    <strong>${state.students.length}</strong>
                </div>
            </section>
            <div class="viz-container slide-in-panel">
                <section class="chart-box slide-card">
                    <div class="section-heading">
                        <h3>Total Percentage Overview</h3>
                        <p>Compare ${semester} total percentages across the class.</p>
                    </div>
                    <canvas id="barChart"></canvas>
                </section>
                <section class="chart-box slide-card">
                    <div class="section-heading">
                        <h3>Grade Split</h3>
                        <p>Quick view of excellence, good performance, and support needs.</p>
                    </div>
                    <canvas id="pieChart"></canvas>
                </section>
                <section class="chart-box full slide-card">
                    <div class="section-heading">
                        <h3>Attendance vs Percentage</h3>
                        <p>Spot students whose ${semester} attendance may be affecting performance.</p>
                    </div>
                    <canvas id="lineChart"></canvas>
                </section>
            </div>`;
    },
    ranks() {
        const sorted = [...state.students].sort((left, right) => getStudentTotal(right) - getStudentTotal(left));
        const semester = getSelectedSemester();
        const rows = sorted.map((student, index) => `
            <tr>
                <td><span class="rank-pill">#${index + 1}</span></td>
                <td>${student.ID}</td>
                <td>${student.Name}</td>
                <td><span class="score-chip">${getStudentTotal(student)}%</span></td>
                <td>${student.Attendance}%</td>
            </tr>
        `).join('');

        return `
            <section class="module-hero slide-in-panel">
                <div>
                    <p class="eyebrow">Merit List</p>
                    <h3>${semester} rankings</h3>
                    <p class="module-hero-copy">This list is ordered by total percentage, so teachers can quickly identify top performers and students who may need extra support.</p>
                </div>
                <div class="module-hero-badge">
                    <span>Students</span>
                    <strong>${sorted.length}</strong>
                </div>
            </section>
            <div class="table-shell slide-in-panel">
                <div class="table-header">
                    <div>
                        <p class="eyebrow">Full Rankings</p>
                        <h3>Ordered by total percentage</h3>
                    </div>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Total %</th>
                            <th>Attendance</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    },
    subjects() {
        const semester = getSelectedSemester();
        const semesterSubjects = getSubjects(semester);
        const orderedStudents = [...state.students].sort(compareStudentIds);
        const { students, totalPages, activePage } = getPagedStudents(orderedStudents, semester);

        const subjectCards = semesterSubjects.map((subject) => {
            const values = orderedStudents
                .map((student) => student.Subjects?.[subject])
                .filter((marks) => Number.isFinite(Number(marks)))
                .map(Number);
            const average = values.length
                ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)}%`
                : '--';

            return `
                <article class="info-card slide-card">
                    <span>${escapeHtml(subject)}</span>
                    <strong>${average}</strong>
                </article>
            `;
        }).join('');

        return `
            <section class="module-hero slide-in-panel">
                <div>
                    <p class="eyebrow">Subject Analysis</p>
                    <h3>${semester} subject-wise marks</h3>
                    <p class="module-hero-copy">All subjects stay together for each student, while the student list is split across smaller pages so the screen stays easy to read.</p>
                </div>
                <div class="module-hero-badge">
                    <span>Students</span>
                    <strong>${orderedStudents.length}</strong>
                </div>
            </section>
            <section class="subject-summary-grid slide-in-panel">
                ${subjectCards}
            </section>
            <div class="table-shell slide-in-panel">
                <div class="table-header">
                    <div>
                        <p class="eyebrow">Subject Breakdown</p>
                        <h3>${semester} student records</h3>
                        <p>Showing students ${((activePage - 1) * STUDENTS_PER_PAGE) + 1}-${Math.min(activePage * STUDENTS_PER_PAGE, orderedStudents.length)} of ${orderedStudents.length}, ordered by roll number.</p>
                    </div>
                </div>
                <div class="student-records">
                    ${students.map((student) => `
                        <article class="student-record slide-card">
                            <div class="student-record-header">
                                <div>
                                    <p class="student-record-id">${escapeHtml(student.ID)}</p>
                                    <h4>${escapeHtml(student.Name)}</h4>
                                </div>
                                <div class="student-record-meta">
                                    <span class="score-chip">${getStudentTotal(student)}%</span>
                                    <span class="attendance-chip">${Number(student.Attendance) || 0}% attendance</span>
                                </div>
                            </div>
                            <div class="student-subject-grid">
                                ${semesterSubjects.map((subject) => `
                                    <div class="student-subject-cell">
                                        <span>${escapeHtml(subject)}</span>
                                        <strong>${student.Subjects?.[subject] ?? '--'}</strong>
                                    </div>
                                `).join('')}
                            </div>
                        </article>
                    `).join('')}
                </div>
            </div>
            ${renderStudentPager(semester, totalPages, activePage)}
        `;
    },
    average() {
        const stats = state.stats;
        const semester = getSelectedSemester();
        const semesterSubjects = getSubjects(semester);
        const topPerformer = stats.topPerformer
            ? `${stats.topPerformer.Name} is currently leading ${semester} with ${getStudentTotal(stats.topPerformer)}% total percentage and ${stats.topPerformer.Attendance}% attendance.`
            : `No performance records are available yet for ${semester}.`;

        const subjectAverageCards = semesterSubjects.map((subject) => {
            const values = state.students
                .map((student) => student.Subjects?.[subject])
                .filter((marks) => Number.isFinite(Number(marks)))
                .map(Number);
            const average = values.length
                ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)}%`
                : '--';

            return `
                <article class="info-card slide-card">
                    <span>${escapeHtml(subject)}</span>
                    <strong>${average}</strong>
                </article>
            `;
        }).join('');

        return `
            <section class="module-hero slide-in-panel">
                <div>
                    <p class="eyebrow">Semester Snapshot</p>
                    <h3>${semester} statistics overview</h3>
                    <p class="module-hero-copy">Review total percentage, attendance, and subject-wise averages for ${semester} only.</p>
                </div>
                <div class="module-hero-badge">
                    <span>Average Total</span>
                    <strong>${stats.averageMarks}%</strong>
                </div>
            </section>
            <div class="stats-grid slide-in-panel">
                <article class="info-card slide-card">
                    <span>Average Total Percentage</span>
                    <strong>${stats.averageMarks}%</strong>
                </article>
                <article class="info-card slide-card">
                    <span>Average Attendance</span>
                    <strong>${stats.averageAttendance}%</strong>
                </article>
                <article class="info-card slide-card">
                    <span>Excellent Scores</span>
                    <strong>${stats.gradeCounts.excellent}</strong>
                </article>
                <article class="info-card slide-card">
                    <span>Needs Support</span>
                    <strong>${stats.gradeCounts.needsSupport}</strong>
                </article>
            </div>
            <section class="subject-summary-grid slide-in-panel">
                ${subjectAverageCards}
            </section>
            <section class="insight-panel slide-card">
                <h3>Class Insight</h3>
                <p>${topPerformer}</p>
            </section>`;
    },
    add() {
        return `
            <section class="module-hero slide-in-panel">
                <div>
                    <p class="eyebrow">Semester Entry</p>
                    <h3>Manage semester totals and subject marks</h3>
                    <p class="module-hero-copy">Teachers can record subject-wise marks for each student, and the system will automatically calculate the semester total percentage.</p>
                </div>
                <div class="module-hero-badge">
                    <span>Active Semester</span>
                    <strong>${getSelectedSemester()}</strong>
                </div>
            </section>
            <div class="stacked-panels slide-in-panel">
                <form id="studentForm" class="student-form panel-card slide-card">
                    <div class="section-heading">
                        <h3>Add One Semester Result</h3>
                        <p>Enter one student's subject marks for a specific semester.</p>
                    </div>
                    <div class="form-grid">
                        <label>
                            <span>Student ID</span>
                            <input name="ID" type="text" placeholder="2451-22-733-007" required>
                        </label>
                        <label>
                            <span>Student Name</span>
                            <input name="Name" type="text" placeholder="Student name" required>
                        </label>
                        <label>
                            <span>Semester</span>
                            <select name="Semester" class="form-select" required>${renderSemesterOptions()}</select>
                        </label>
                        <label>
                            <span>Attendance</span>
                            <input name="Attendance" type="number" min="0" max="100" placeholder="0-100" required>
                        </label>
                    </div>
                    <div class="semester-subject-note">
                        <span>Subjects in this semester</span>
                        <strong id="subjectTemplateLabel">${getSemesterSubjectSummary()}</strong>
                    </div>
                    <div id="subjectInputGrid" class="subject-form-grid">
                        ${renderSubjectInputs({}, getSelectedSemester())}
                    </div>
                    <div class="calculated-total">
                        <span>Total Percentage</span>
                        <strong id="calculatedTotal">--</strong>
                    </div>
                    <div class="form-actions">
                        <button class="primary-btn" type="submit">Save Result</button>
                    </div>
                </form>

                <form id="importForm" class="student-form panel-card slide-card">
                    <div class="section-heading">
                        <h3>Import Semester Results</h3>
                        <p>Upload Excel, PDF, or Word files with either a total percentage or subject-wise columns for the selected semester.</p>
                    </div>
                    <label>
                        <span>Semester</span>
                        <select name="semester" class="form-select" required>${renderSemesterOptions()}</select>
                    </label>
                    <label class="upload-label">
                        <span>Supported formats</span>
                        <input name="file" type="file" accept=".xlsx,.xls,.pdf,.docx" required>
                    </label>
                    <div id="importSubjectTip" class="upload-tip">
                        Use columns or text fields named <code>ID</code>, <code>Name</code>, <code>Semester</code>, <code>Attendance</code>, and the subject columns configured for the selected semester.
                    </div>
                    <div class="form-actions">
                        <button class="primary-btn" type="submit">Import File</button>
                    </div>
                </form>
            </div>`;
    },
};

async function fetchJson(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

function setFeedback(message, type = 'info') {
    const feedback = document.getElementById('feedback');

    if (!feedback) {
        return;
    }

    if (!message) {
        feedback.textContent = '';
        feedback.className = 'feedback hidden';
        return;
    }

    feedback.textContent = message;
    feedback.className = `feedback ${type}`;
}

function setLoginFeedback(message, type = 'info') {
    const feedback = document.getElementById('loginFeedback');

    if (!feedback) {
        return;
    }

    if (!message) {
        feedback.textContent = '';
        feedback.className = 'inline-feedback hidden';
        return;
    }

    feedback.textContent = message;
    feedback.className = `inline-feedback ${type}`;
}

function updateSemesterLabels() {
    const label = `Showing results for ${getSelectedSemester()}`;
    const activeSemesterLabel = document.getElementById('activeSemesterLabel');
    const moduleSemesterLabel = document.getElementById('moduleSemesterLabel');

    if (activeSemesterLabel) {
        activeSemesterLabel.textContent = label;
    }

    if (moduleSemesterLabel) {
        moduleSemesterLabel.textContent = label;
    }
}

function syncSemesterControls() {
    const options = renderSemesterOptions();
    document.querySelectorAll('.semester-select').forEach((select) => {
        select.innerHTML = options;
        select.value = getSelectedSemester();
    });
    updateSemesterLabels();
}

function updateImportTip(semester) {
    const tip = document.getElementById('importSubjectTip');
    if (!tip) {
        return;
    }

    const subjects = getSubjects(semester);
    tip.innerHTML = `Use columns or text fields named <code>ID</code>, <code>Name</code>, <code>Semester</code>, <code>Attendance</code>, and subject columns for ${escapeHtml(semester)} such as ${subjects.map((subject) => `<code>${escapeHtml(subject)}</code>`).join(', ')}.`;
}

function updateSubjectFieldsForSemester(semester) {
    const form = document.getElementById('studentForm');
    const grid = document.getElementById('subjectInputGrid');
    const templateLabel = document.getElementById('subjectTemplateLabel');

    if (!form || !grid || !templateLabel) {
        return;
    }

    const previousSubjects = buildPayloadFromForm(form).Subjects;
    const student = { Subjects: previousSubjects };
    grid.innerHTML = renderSubjectInputs(student, semester);
    templateLabel.textContent = getSemesterSubjectSummary(semester);
    updateCalculatedTotalDisplay(form);
}

function updateDashboardStats() {
    if (!state.stats) {
        return;
    }

    const totalStudents = document.getElementById('totalStudents');
    const averageMarks = document.getElementById('averageMarks');
    const averageAttendance = document.getElementById('averageAttendance');
    const topPerformer = document.getElementById('topPerformer');

    if (totalStudents) {
        totalStudents.textContent = state.stats.totalStudents;
    }

    if (averageMarks) {
        averageMarks.textContent = `${state.stats.averageMarks}%`;
    }

    if (averageAttendance) {
        averageAttendance.textContent = `${state.stats.averageAttendance}%`;
    }

    if (topPerformer) {
        topPerformer.textContent = state.stats.topPerformer
            ? `${state.stats.topPerformer.Name} (${getStudentTotal(state.stats.topPerformer)}%)`
            : 'No data';
    }
}

function updateThemeButtons() {
    const label = state.theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    document.querySelectorAll('.theme-toggle').forEach((button) => {
        button.textContent = label;
    });
}

function applyTheme(theme) {
    state.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('tbp-theme', theme);
    updateThemeButtons();
}

function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function destroyCharts() {
    state.charts.forEach((chart) => chart.destroy());
    state.charts = [];
}

function applyMotion(root = document) {
    root.querySelectorAll('.slide-card').forEach((element, index) => {
        element.style.setProperty('--delay', `${index * 90}ms`);
    });
}

function renderCharts() {
    destroyCharts();

    const labels = state.students.map((student) => student.Name);
    const totals = state.students.map((student) => student.TotalPercentage);
    const attendance = state.students.map((student) => student.Attendance);
    const gradeCounts = state.stats.gradeCounts;

    state.charts.push(
        new Chart(document.getElementById('barChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Total Percentage',
                    data: totals,
                    backgroundColor: '#ff8a3d',
                    borderRadius: 10,
                }],
            },
            options: {
                responsive: true,
                animation: chartAnimation,
                plugins: {
                    legend: { display: false },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                    },
                },
            },
        })
    );

    state.charts.push(
        new Chart(document.getElementById('pieChart'), {
            type: 'doughnut',
            data: {
                labels: ['Excellent', 'Good', 'Needs Support'],
                datasets: [{
                    data: [gradeCounts.excellent, gradeCounts.good, gradeCounts.needsSupport],
                    backgroundColor: ['#ff8a3d', '#2ec4b6', '#7a3cff'],
                }],
            },
            options: {
                responsive: true,
                animation: chartAnimation,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                },
            },
        })
    );

    state.charts.push(
        new Chart(document.getElementById('lineChart'), {
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Total Percentage',
                        data: totals,
                        borderColor: '#ff8a3d',
                        backgroundColor: 'rgba(255, 138, 61, 0.18)',
                        fill: true,
                        tension: 0.35,
                    },
                    {
                        type: 'line',
                        label: 'Attendance',
                        data: attendance,
                        borderColor: '#2ec4b6',
                        backgroundColor: 'rgba(46, 196, 182, 0.12)',
                        fill: false,
                        tension: 0.35,
                    },
                ],
            },
            options: {
                responsive: true,
                animation: chartAnimation,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                    },
                },
            },
        })
    );
}

function getApiUrl(pathname, semester = getSelectedSemester()) {
    const url = new URL(pathname, window.location.origin);
    if (semester) {
        url.searchParams.set('semester', semester);
    }
    return url.pathname + url.search;
}

function getModulePath(type) {
    const module = moduleConfig[type];
    if (!module) {
        return '';
    }

    const url = new URL(module.path, window.location.origin);
    url.searchParams.set('semester', getSelectedSemester());
    return `${url.pathname}${url.search}`;
}

function updateModuleUrlSemester() {
    if (document.body.dataset.page !== 'module') {
        return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('semester', getSelectedSemester());
    window.history.replaceState({}, '', url);
}

async function loadSemesters() {
    const data = await fetchJson('/api/semesters');
    state.semesters = data.semesters?.length ? data.semesters : [data.defaultSemester || 'Semester 1'];
    state.subjectsBySemester = data.subjectsBySemester || {};

    const requestedSemester = new URLSearchParams(window.location.search).get('semester');
    if (!state.selectedSemester || !state.semesters.includes(state.selectedSemester)) {
        state.selectedSemester = state.semesters.includes(requestedSemester)
            ? requestedSemester
            : state.semesters[0];
    }

    localStorage.setItem('tbp-semester', state.selectedSemester);
    syncSemesterControls();
    updateModuleUrlSemester();
}

async function handleSemesterChange(nextSemester) {
    if (!nextSemester || nextSemester === state.selectedSemester) {
        return;
    }

    state.selectedSemester = nextSemester;
    localStorage.setItem('tbp-semester', nextSemester);
    setStudentPageForSemester(nextSemester, 1);
    syncSemesterControls();
    updateModuleUrlSemester();
    await refreshData(true);
}

function attachSubjectCalculator() {
    const form = document.getElementById('studentForm');
    const calculatedTotal = document.getElementById('calculatedTotal');
    if (!form || !calculatedTotal) {
        return;
    }

    if (form.dataset.subjectCalculatorAttached === 'true') {
        updateCalculatedTotalDisplay(form);
        return;
    }

    form.addEventListener('input', (event) => {
        if (event.target?.name?.startsWith('subject_')) {
            updateCalculatedTotalDisplay(form);
        }
    });

    form.elements.Semester?.addEventListener('change', (event) => {
        updateSubjectFieldsForSemester(event.currentTarget.value);
    });

    form.dataset.subjectCalculatorAttached = 'true';
    updateSubjectFieldsForSemester(form.elements.Semester?.value || getSelectedSemester());
}

function updateCalculatedTotalDisplay(form) {
    const calculatedTotal = document.getElementById('calculatedTotal');
    if (!form || !calculatedTotal) {
        return;
    }

    const payload = buildPayloadFromForm(form);
    calculatedTotal.textContent = calculateTotalPercentage(payload.Subjects);
}

function attachImportSemesterHint() {
    const form = document.getElementById('importForm');
    if (!form) {
        return;
    }

    const semesterSelect = form.elements.semester;
    if (form.dataset.subjectHintAttached !== 'true') {
        semesterSelect?.addEventListener('change', (event) => {
            updateImportTip(event.currentTarget.value);
        });
        form.dataset.subjectHintAttached = 'true';
    }

    updateImportTip(semesterSelect?.value || getSelectedSemester());
}

function showModule(type) {
    const module = moduleConfig[type];
    if (!module) {
        return;
    }

    if (document.body.dataset.page !== 'module') {
        window.location.href = getModulePath(type);
        return;
    }

    const title = document.getElementById('moduleTitle');
    const content = document.getElementById('moduleContent');
    const moduleView = document.getElementById('moduleView');

    moduleView.classList.remove('hidden', 'module-exit');
    moduleView.classList.add('module-enter');
    setFeedback('');
    title.textContent = module.title;

    content.innerHTML = moduleTemplates[type]();
    applyMotion(content);

    if (type === 'visuals') {
        renderCharts();
    }

    if (type === 'add') {
        document.getElementById('studentForm').addEventListener('submit', submitStudentForm);
        document.getElementById('importForm').addEventListener('submit', submitImportForm);
        attachSubjectCalculator();
        attachImportSemesterHint();
    }

    if (type === 'subjects') {
        content.querySelectorAll('[data-student-page]').forEach((button) => {
            button.addEventListener('click', () => {
                setStudentPageForSemester(getSelectedSemester(), Number(button.dataset.studentPage));
                showModule('subjects');
            });
        });
    }
}

function showHome() {
    if (document.body.dataset.page === 'module') {
        window.location.href = 'index.html';
        return;
    }

    destroyCharts();
    setFeedback('');
    const moduleView = document.getElementById('moduleView');
    moduleView.classList.remove('module-enter');
    moduleView.classList.add('module-exit');
    setTimeout(() => {
        document.getElementById('homeGrid').classList.remove('hidden');
        moduleView.classList.add('hidden');
    }, 220);
}

async function refreshData(showMessage = false) {
    try {
        if (!state.semesters.length) {
            await loadSemesters();
        }

        const [students, stats] = await Promise.all([
            fetchJson(getApiUrl('/api/students')),
            fetchJson(getApiUrl('/api/stats')),
        ]);

        state.students = students;
        state.stats = stats;
        updateDashboardStats();
        updateSemesterLabels();

        if (document.body.dataset.page === 'module') {
            const currentModule = new URLSearchParams(window.location.search).get('module') || 'visuals';
            showModule(currentModule);
        }

        if (showMessage) {
            setFeedback(`Dashboard data refreshed for ${getSelectedSemester()}.`, 'success');
        }
    } catch (error) {
        setFeedback(error.message, 'error');
    }
}

async function submitStudentForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = buildPayloadFromForm(form);

    try {
        await fetchJson('/api/students', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (!state.semesters.includes(payload.Semester)) {
            state.semesters.push(payload.Semester);
            state.semesters.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
            syncSemesterControls();
        }

        form.reset();
        attachSubjectCalculator();

        if (payload.Semester === getSelectedSemester()) {
            await refreshData();
        } else {
            await handleSemesterChange(payload.Semester);
        }
        setFeedback(`Semester result with subject marks added successfully for ${payload.Semester}.`, 'success');
    } catch (error) {
        setFeedback(error.message, 'error');
    }
}

async function submitImportForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const semester = formData.get('semester');

    try {
        const result = await fetchJson('/api/import-students', {
            method: 'POST',
            body: formData,
        });

        if (!state.semesters.includes(semester)) {
            state.semesters.push(semester);
            state.semesters.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
            syncSemesterControls();
        }

        form.reset();

        if (semester === getSelectedSemester()) {
            await refreshData();
        } else {
            await handleSemesterChange(semester);
        }

        const summary = [`Imported ${result.importedCount} student record(s) into ${semester}.`];
        if (result.rejectedCount) {
            summary.push(`${result.rejectedCount} record(s) were skipped.`);
        }

        setFeedback(summary.join(' '), result.rejectedCount ? 'info' : 'success');
    } catch (error) {
        setFeedback(error.message, 'error');
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
        await fetchJson('/api/login', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        sessionStorage.setItem('tbp-auth', 'true');
        state.isLoggedIn = true;
        setLoginFeedback('');
        form.reset();
        await bootApp();
    } catch (error) {
        setLoginFeedback(error.message, 'error');
    }
}

function logout() {
    sessionStorage.removeItem('tbp-auth');
    state.isLoggedIn = false;
    destroyCharts();
    setFeedback('');

    if (document.body.dataset.page === 'module') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('moduleView').classList.add('hidden');
    document.getElementById('homeGrid').classList.remove('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    setLoginFeedback('');
}

async function bootApp() {
    if (document.body.dataset.page === 'module' && !state.isLoggedIn) {
        window.location.href = 'index.html';
        return;
    }

    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
        loginScreen.classList.add('hidden');
    }

    const appShell = document.getElementById('appShell');
    if (appShell) {
        appShell.classList.remove('hidden');
    }

    applyMotion(document);
    await loadSemesters();
    await refreshData();
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
}

const backButton = document.getElementById('backButton');
if (backButton) {
    backButton.addEventListener('click', showHome);
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener('click', async () => {
        await refreshData(true);
    });
}

const themeToggleLogin = document.getElementById('themeToggleLogin');
if (themeToggleLogin) {
    themeToggleLogin.addEventListener('click', toggleTheme);
}

const themeToggleApp = document.getElementById('themeToggleApp');
if (themeToggleApp) {
    themeToggleApp.addEventListener('click', toggleTheme);
}

document.querySelectorAll('.semester-select').forEach((select) => {
    select.addEventListener('change', async (event) => {
        await handleSemesterChange(event.currentTarget.value);
    });
});

document.querySelectorAll('[data-module]').forEach((button) => {
    button.addEventListener('click', () => showModule(button.dataset.module));
});

applyMotion(document);
applyTheme(state.theme);

if (state.isLoggedIn) {
    bootApp();
}
