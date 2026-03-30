const state = {
    students: [],
    stats: null,
    charts: [],
    isLoggedIn: sessionStorage.getItem('tbp-auth') === 'true',
    theme: localStorage.getItem('tbp-theme') || 'light',
};

const chartAnimation = {
    duration: 1200,
    easing: 'easeOutQuart',
};

const moduleTemplates = {
    visuals() {
        return `
            <div class="viz-container slide-in-panel">
                <section class="chart-box slide-card">
                    <div class="section-heading">
                        <h3>Marks Overview</h3>
                        <p>Compare student scores across the class.</p>
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
                        <h3>Attendance vs Marks</h3>
                        <p>Spot students whose attendance may be affecting performance.</p>
                    </div>
                    <canvas id="lineChart"></canvas>
                </section>
            </div>`;
    },
    ranks() {
        const sorted = [...state.students].sort((left, right) => right.Marks - left.Marks);
        const rows = sorted.map((student, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${student.ID}</td>
                <td>${student.Name}</td>
                <td>${student.Marks}%</td>
                <td>${student.Attendance}%</td>
            </tr>
        `).join('');

        return `
            <div class="table-shell slide-in-panel">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Marks</th>
                            <th>Attendance</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    },
    average() {
        const stats = state.stats;
        const topPerformer = stats.topPerformer
            ? `${stats.topPerformer.Name} is currently leading with ${stats.topPerformer.Marks}% marks and ${stats.topPerformer.Attendance}% attendance.`
            : 'No performance records are available yet.';

        return `
            <div class="stats-grid slide-in-panel">
                <article class="info-card slide-card">
                    <span>Average Marks</span>
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
            <section class="insight-panel slide-card">
                <h3>Class Insight</h3>
                <p>${topPerformer}</p>
            </section>`;
    },
    add() {
        return `
            <div class="stacked-panels slide-in-panel">
                <form id="studentForm" class="student-form panel-card slide-card">
                    <div class="section-heading">
                        <h3>Add One Student</h3>
                        <p>Enter a single student manually.</p>
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
                            <span>Marks</span>
                            <input name="Marks" type="number" min="0" max="100" placeholder="0-100" required>
                        </label>
                        <label>
                            <span>Attendance</span>
                            <input name="Attendance" type="number" min="0" max="100" placeholder="0-100" required>
                        </label>
                    </div>
                    <div class="form-actions">
                        <button class="primary-btn" type="submit">Save Student</button>
                    </div>
                </form>

                <form id="importForm" class="student-form panel-card slide-card">
                    <div class="section-heading">
                        <h3>Import from File</h3>
                        <p>Upload Excel, PDF, or Word files that contain student records with ID, Name, Marks, and Attendance.</p>
                    </div>
                    <label class="upload-label">
                        <span>Supported formats</span>
                        <input name="file" type="file" accept=".xlsx,.xls,.pdf,.docx" required>
                    </label>
                    <div class="upload-tip">
                        Use columns or text fields named <code>ID</code>, <code>Name</code>, <code>Marks</code>, and <code>Attendance</code>.
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

    if (!message) {
        feedback.textContent = '';
        feedback.className = 'inline-feedback hidden';
        return;
    }

    feedback.textContent = message;
    feedback.className = `inline-feedback ${type}`;
}

function updateDashboardStats() {
    if (!state.stats) {
        return;
    }

    document.getElementById('totalStudents').textContent = state.stats.totalStudents;
    document.getElementById('averageMarks').textContent = `${state.stats.averageMarks}%`;
    document.getElementById('averageAttendance').textContent = `${state.stats.averageAttendance}%`;
    document.getElementById('topPerformer').textContent = state.stats.topPerformer
        ? `${state.stats.topPerformer.Name} (${state.stats.topPerformer.Marks}%)`
        : 'No data';
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
    const marks = state.students.map((student) => student.Marks);
    const attendance = state.students.map((student) => student.Attendance);
    const gradeCounts = state.stats.gradeCounts;

    state.charts.push(
        new Chart(document.getElementById('barChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Marks',
                    data: marks,
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
                        label: 'Marks',
                        data: marks,
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

function showModule(type) {
    const title = document.getElementById('moduleTitle');
    const content = document.getElementById('moduleContent');

    document.getElementById('homeGrid').classList.add('hidden');
    document.getElementById('moduleView').classList.remove('hidden');
    document.getElementById('moduleView').classList.remove('module-exit');
    document.getElementById('moduleView').classList.add('module-enter');
    setFeedback('');

    if (type === 'visuals') {
        title.textContent = 'Visual Dashboard';
    } else if (type === 'ranks') {
        title.textContent = 'Rankings';
    } else if (type === 'average') {
        title.textContent = 'Class Statistics';
    } else {
        title.textContent = 'Add or Import Student Data';
    }

    content.innerHTML = moduleTemplates[type]();
    applyMotion(content);

    if (type === 'visuals') {
        renderCharts();
    }

    if (type === 'add') {
        document.getElementById('studentForm').addEventListener('submit', submitStudentForm);
        document.getElementById('importForm').addEventListener('submit', submitImportForm);
    }
}

function showHome() {
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
        const [students, stats] = await Promise.all([
            fetchJson('/api/students'),
            fetchJson('/api/stats'),
        ]);

        state.students = students;
        state.stats = stats;
        updateDashboardStats();

        if (showMessage) {
            setFeedback('Dashboard data refreshed successfully.', 'success');
        }
    } catch (error) {
        setFeedback(error.message, 'error');
    }
}

async function submitStudentForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        await fetchJson('/api/students', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        form.reset();
        await refreshData();
        setFeedback('Student added successfully.', 'success');
    } catch (error) {
        setFeedback(error.message, 'error');
    }
}

async function submitImportForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
        const result = await fetchJson('/api/import-students', {
            method: 'POST',
            body: formData,
        });

        form.reset();
        await refreshData();

        const summary = [`Imported ${result.importedCount} student record(s).`];
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
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('moduleView').classList.add('hidden');
    document.getElementById('homeGrid').classList.remove('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    setFeedback('');
    setLoginFeedback('');
}

async function bootApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    applyMotion(document);
    await refreshData();
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('backButton').addEventListener('click', showHome);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('refreshDashboardBtn').addEventListener('click', async () => {
    await refreshData(true);
});
document.getElementById('themeToggleLogin').addEventListener('click', toggleTheme);
document.getElementById('themeToggleApp').addEventListener('click', toggleTheme);

document.querySelectorAll('[data-module]').forEach((button) => {
    button.addEventListener('click', () => showModule(button.dataset.module));
});

applyMotion(document);
applyTheme(state.theme);

if (state.isLoggedIn) {
    bootApp();
}
