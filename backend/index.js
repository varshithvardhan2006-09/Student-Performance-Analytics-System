const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const csv = require('csv-parser');
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const CSV_PATH = process.env.CSV_PATH || path.join(__dirname, 'data.csv');
const CSV_HEADERS = ['ID', 'Name', 'Marks', 'Attendance'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const LOGIN_CREDENTIALS = {
    username: process.env.TBP_USERNAME || 'admin',
    password: process.env.TBP_PASSWORD || 'tbp123',
};

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

function normalizeStudent(record) {
    return {
        ID: String(record.ID || '').trim(),
        Name: String(record.Name || '').trim(),
        Marks: Number(record.Marks),
        Attendance: Number(record.Attendance),
    };
}

function escapeCsvValue(value) {
    const stringValue = String(value ?? '');
    return `"${stringValue.replace(/"/g, '""')}"`;
}

function validateStudent(input) {
    const student = normalizeStudent(input);

    if (!student.ID) {
        return { ok: false, message: 'Student ID is required.' };
    }

    if (!student.Name) {
        return { ok: false, message: 'Student name is required.' };
    }

    if (!Number.isFinite(student.Marks) || student.Marks < 0 || student.Marks > 100) {
        return { ok: false, message: 'Marks must be a number between 0 and 100.' };
    }

    if (!Number.isFinite(student.Attendance) || student.Attendance < 0 || student.Attendance > 100) {
        return { ok: false, message: 'Attendance must be a number between 0 and 100.' };
    }

    return { ok: true, student };
}

function readStudents() {
    return new Promise((resolve, reject) => {
        const students = [];

        fs.createReadStream(CSV_PATH)
            .on('error', reject)
            .pipe(csv())
            .on('data', (row) => {
                students.push(normalizeStudent(row));
            })
            .on('end', () => resolve(students))
            .on('error', reject);
    });
}

function buildStats(students) {
    const totalStudents = students.length;

    if (!totalStudents) {
        return {
            totalStudents: 0,
            averageMarks: 0,
            averageAttendance: 0,
            topPerformer: null,
            gradeCounts: { excellent: 0, good: 0, needsSupport: 0 },
        };
    }

    const totals = students.reduce(
        (accumulator, student) => {
            accumulator.marks += student.Marks;
            accumulator.attendance += student.Attendance;

            if (student.Marks >= 80) {
                accumulator.gradeCounts.excellent += 1;
            } else if (student.Marks >= 60) {
                accumulator.gradeCounts.good += 1;
            } else {
                accumulator.gradeCounts.needsSupport += 1;
            }

            return accumulator;
        },
        {
            marks: 0,
            attendance: 0,
            gradeCounts: { excellent: 0, good: 0, needsSupport: 0 },
        }
    );

    const topPerformer = [...students].sort((left, right) => right.Marks - left.Marks)[0];

    return {
        totalStudents,
        averageMarks: Number((totals.marks / totalStudents).toFixed(2)),
        averageAttendance: Number((totals.attendance / totalStudents).toFixed(2)),
        topPerformer,
        gradeCounts: totals.gradeCounts,
    };
}

async function appendStudents(students) {
    if (!students.length) {
        return;
    }

    const lines = students.map((student) => CSV_HEADERS.map((header) => escapeCsvValue(student[header])).join(','));
    await fsp.appendFile(CSV_PATH, `\n${lines.join('\n')}`, 'utf8');
}

function findColumn(row, aliases) {
    for (const alias of aliases) {
        if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') {
            return row[alias];
        }
    }

    return '';
}

function parseRowsToStudents(rows) {
    return rows
        .map((row) => ({
            ID: findColumn(row, ['ID', 'Id', 'Student ID', 'student_id']),
            Name: findColumn(row, ['Name', 'Student Name', 'student_name']),
            Marks: findColumn(row, ['Marks', 'Score', 'scores']),
            Attendance: findColumn(row, ['Attendance', 'Attendance %', 'attendance']),
        }))
        .filter((row) => row.ID || row.Name || row.Marks || row.Attendance);
}

function extractStudentsFromText(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const students = [];
    let current = {};

    for (const line of lines) {
        const csvMatch = line.match(/^([^,]+),([^,]+),([^,]+),([^,]+)$/);
        if (csvMatch) {
            students.push({
                ID: csvMatch[1].trim(),
                Name: csvMatch[2].trim(),
                Marks: csvMatch[3].trim(),
                Attendance: csvMatch[4].trim(),
            });
            current = {};
            continue;
        }

        const pairs = [...line.matchAll(/\b(ID|Name|Marks|Attendance)\s*[:=-]\s*([^,|]+)/gi)];
        if (pairs.length) {
            for (const [, key, value] of pairs) {
                current[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()] = value.trim();
            }

            if (current.ID && current.Name && current.Marks && current.Attendance) {
                students.push(current);
                current = {};
            }
        }
    }

    return students;
}

async function parseUploadedFile(file) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (extension === '.xlsx' || extension === '.xls') {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        return parseRowsToStudents(rows);
    }

    if (extension === '.pdf') {
        const parsed = await pdfParse(file.buffer);
        return extractStudentsFromText(parsed.text);
    }

    if (extension === '.docx') {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        return extractStudentsFromText(parsed.value);
    }

    throw new Error('Unsupported file type. Please upload Excel (.xlsx, .xls), PDF (.pdf), or Word (.docx).');
}

async function persistStudents(candidateStudents) {
    const existingStudents = await readStudents();
    const existingIds = new Set(existingStudents.map((student) => student.ID.toLowerCase()));
    const seenIds = new Set();
    const acceptedStudents = [];
    const rejected = [];

    for (const candidate of candidateStudents) {
        const validation = validateStudent(candidate);

        if (!validation.ok) {
            rejected.push({
                record: candidate,
                reason: validation.message,
            });
            continue;
        }

        const normalizedId = validation.student.ID.toLowerCase();

        if (existingIds.has(normalizedId) || seenIds.has(normalizedId)) {
            rejected.push({
                record: candidate,
                reason: 'Duplicate student ID.',
            });
            continue;
        }

        seenIds.add(normalizedId);
        acceptedStudents.push(validation.student);
    }

    await appendStudents(acceptedStudents);

    return {
        added: acceptedStudents,
        rejected,
    };
}

app.get('/api/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username === LOGIN_CREDENTIALS.username && password === LOGIN_CREDENTIALS.password) {
        return res.json({
            success: true,
            user: {
                username: LOGIN_CREDENTIALS.username,
                role: 'Teacher',
            },
        });
    }

    res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
    });
});

app.get('/api/students', async (req, res, next) => {
    try {
        const students = await readStudents();
        res.json(students);
    } catch (error) {
        next(error);
    }
});

app.get('/api/stats', async (req, res, next) => {
    try {
        const students = await readStudents();
        res.json(buildStats(students));
    } catch (error) {
        next(error);
    }
});

async function createStudent(req, res, next) {
    try {
        const { added, rejected } = await persistStudents([req.body]);

        if (!added.length) {
            return res.status(rejected[0]?.reason === 'Duplicate student ID.' ? 409 : 400).json({
                success: false,
                message: rejected[0]?.reason || 'Unable to add student.',
            });
        }

        res.status(201).json({ success: true, student: added[0] });
    } catch (error) {
        next(error);
    }
}

app.post('/api/students', createStudent);
app.post('/api/add-student', createStudent);

app.post('/api/import-students', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please choose a file to import.',
            });
        }

        const parsedStudents = await parseUploadedFile(req.file);

        if (!parsedStudents.length) {
            return res.status(400).json({
                success: false,
                message: 'No student records were found in the uploaded file.',
            });
        }

        const result = await persistStudents(parsedStudents);

        res.status(201).json({
            success: true,
            importedCount: result.added.length,
            rejectedCount: result.rejected.length,
            importedStudents: result.added,
            rejected: result.rejected,
        });
    } catch (error) {
        next(error);
    }
});

app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: error.message || 'Something went wrong while processing the request.',
    });
});

app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
});
