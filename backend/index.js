const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'tbp';
const STUDENTS_COLLECTION = process.env.MONGODB_COLLECTION || 'students';
const DEFAULT_SEMESTER = process.env.DEFAULT_SEMESTER || 'Semester 1';
const SEMESTERS = Array.from({ length: 8 }, (_, index) => `Semester ${index + 1}`);
const SUBJECTS_BY_SEMESTER = {
    'Semester 1': [
        'Engineering Mathematics - I',
        'Engineering Physics',
        'English',
        'Programming for Problem Solving using C',
        'Indian Constitution',
        'Physics Lab',
        'English Laboratory',
        'Programming for Problem Solving using C Lab',
        'Basic Workshop Practice',
    ],
    'Semester 2': [
        'Engineering Mathematics - II',
        'Engineering Chemistry',
        'Problem Solving using Python Programming',
        'Basic Electronics & Sensors',
        'Effective Technical Communication in English',
        'Chemistry Lab',
        'Problem Solving using Python Programming Lab',
        'Basic Electronics & Sensors Lab',
        'Engineering Drawing Practice',
        'Computational Mathematics Lab',
    ],
    'Semester 3': [
        'Logic and Switching Theory',
        'Database Management Systems',
        'Discrete Mathematics',
        "Data Structures and Algorithms Using C",
        'Object Oriented Programming using JAVA',
        'Environmental Science',
        'Database Management Systems Lab',
        "Data Structures and Algorithms Using C Lab",
        'Object Oriented Programming Using JAVA Lab',
    ],
    'Semester 4': [
        'Computer Organization and Microprocessor',
        'Web Programming',
        'Finance & Accounting',
        'Software Engineering',
        'Engineering Mathematics-III (Probability & Statistics)',
        'Computer Organization and Microprocessor Lab',
        'Web Programming Lab',
        'Software Engineering Lab',
        'Theme Based Project',
    ],
    'Semester 5': [
        'Design and Analysis of Algorithms',
        'Operating Systems',
        'Automata Languages and Computation',
        'Computer Networks',
        'Professional Elective - I',
        'Design and Analysis of Algorithms Lab',
        'Full Stack Development Lab',
        'Operating Systems Lab',
        'Computer Networks Lab',
        'Mini Project',
    ],
    'Semester 6': [
        'Embedded Systems and IoT',
        'Compiler Construction',
        'Artificial Intelligence and Machine Learning',
        'Professional Elective - II',
        'Professional Elective - III',
        'Open Elective - I',
        'Embedded Systems and IoT Lab',
        'Artificial Intelligence and Machine Learning Lab',
        'DevOps Lab',
        'Summer Internship',
    ],
    'Semester 7': [
        'Neural Networks & Deep Learning',
        'Distributed Systems & Cloud Computing',
        'Professional Elective - IV',
        'Open Elective - II',
        'Essence of Indian Traditional Knowledge',
        'Neural Networks & Deep Learning Lab',
        'Mobile Application Development Lab',
        'Distributed Systems & Cloud Computing Lab',
        'Project Work - I',
        'Summer Internship',
    ],
    'Semester 8': [
        'Professional Elective - V',
        'Open Elective - III',
        'Project Work - II',
    ],
};

const ALL_SUBJECTS = [...new Set(Object.values(SUBJECTS_BY_SEMESTER).flat())];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const LOGIN_CREDENTIALS = {
    username: process.env.TBP_USERNAME || 'admin',
    password: process.env.TBP_PASSWORD || 'tbp123',
};

const client = new MongoClient(MONGODB_URI);
let studentsCollection;

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

function normalizeSemester(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.toLowerCase() === 'undefined' || raw.toLowerCase() === 'null') {
        return DEFAULT_SEMESTER;
    }

    const exactMatch = SEMESTERS.find((semester) => semester.toLowerCase() === raw.toLowerCase());
    return exactMatch || raw;
}

function normalizeSemesterKey(value) {
    return normalizeSemester(value).toLowerCase();
}

function getSemesterSubjects(semester) {
    return SUBJECTS_BY_SEMESTER[normalizeSemester(semester)] || SUBJECTS_BY_SEMESTER[DEFAULT_SEMESTER];
}

function normalizeSubjectKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function buildSubjectAliasMap() {
    const aliases = new Map();

    for (const subject of ALL_SUBJECTS) {
        const key = normalizeSubjectKey(subject);
        aliases.set(key, subject);
        aliases.set(key.replace(/\s+/g, ''), subject);
    }

    aliases.set('engineering mathematics i', 'Engineering Mathematics - I');
    aliases.set('engineering mathematics ii', 'Engineering Mathematics - II');
    aliases.set('engineering mathematics 1', 'Engineering Mathematics - I');
    aliases.set('engineering mathematics 2', 'Engineering Mathematics - II');
    aliases.set('english lab', 'English Laboratory');
    aliases.set('physics laboratory', 'Physics Lab');
    aliases.set('chemistry laboratory', 'Chemistry Lab');
    aliases.set('python', 'Problem Solving using Python Programming');
    aliases.set('c programming', 'Programming for Problem Solving using C');
    aliases.set('python programming', 'Problem Solving using Python Programming');
    aliases.set('programming for problem solving using python', 'Problem Solving using Python Programming');
    aliases.set('problem solving using python', 'Problem Solving using Python Programming');
    aliases.set('programming for problem solving using python lab', 'Problem Solving using Python Programming Lab');
    aliases.set('problem solving using python lab', 'Problem Solving using Python Programming Lab');
    aliases.set('basic electronics and sensors', 'Basic Electronics & Sensors');
    aliases.set('basic electronics and sensors lab', 'Basic Electronics & Sensors Lab');
    aliases.set('effective technical communication in english', 'Effective Technical Communication in English');
    aliases.set('engineering drawing', 'Engineering Drawing Practice');
    aliases.set('workshop practice', 'Basic Workshop Practice');
    aliases.set('oops using java', 'Object Oriented Programming using JAVA');
    aliases.set('data structures and algorithms using c', 'Data Structures and Algorithms Using C');
    aliases.set('engineering mathematics iii probability statistics', 'Engineering Mathematics-III (Probability & Statistics)');
    aliases.set('engineering mathematics-iii probability statistics', 'Engineering Mathematics-III (Probability & Statistics)');
    aliases.set('ai ml', 'Artificial Intelligence and Machine Learning');
    aliases.set('nn dl', 'Neural Networks & Deep Learning');
    aliases.set('professional elective i', 'Professional Elective - I');
    aliases.set('professional elective ii', 'Professional Elective - II');
    aliases.set('professional elective iii', 'Professional Elective - III');
    aliases.set('professional elective iv', 'Professional Elective - IV');
    aliases.set('professional elective v', 'Professional Elective - V');
    aliases.set('open elective i', 'Open Elective - I');
    aliases.set('open elective ii', 'Open Elective - II');
    aliases.set('open elective iii', 'Open Elective - III');
    aliases.set('project work i', 'Project Work - I');
    aliases.set('project work ii', 'Project Work - II');

    return aliases;
}

const SUBJECT_ALIASES = buildSubjectAliasMap();

function canonicalSubjectName(name) {
    const normalized = normalizeSubjectKey(name);
    return SUBJECT_ALIASES.get(normalized)
        || SUBJECT_ALIASES.get(normalized.replace(/\s+/g, ''))
        || String(name || '').trim();
}

function normalizeSubjects(record, semester) {
    const subjects = {};
    const subjectSource = record.Subjects && typeof record.Subjects === 'object' ? record.Subjects : {};
    const semesterSubjects = getSemesterSubjects(semester);
    const acceptedSubjects = new Set([...semesterSubjects, ...ALL_SUBJECTS]);

    for (const [name, value] of Object.entries(subjectSource)) {
        const canonical = canonicalSubjectName(name);
        if (!canonical || !acceptedSubjects.has(canonical)) {
            continue;
        }
        subjects[canonical] = Number(value);
    }

    for (const subject of acceptedSubjects) {
        if (record[subject] !== undefined && record[subject] !== null && record[subject] !== '') {
            subjects[subject] = Number(record[subject]);
        }
    }

    return subjects;
}

function computeTotalPercentage(subjects, fallbackMarks) {
    const values = Object.values(subjects).filter((value) => Number.isFinite(value));

    if (values.length) {
        const total = values.reduce((sum, value) => sum + value, 0);
        return Number((total / values.length).toFixed(2));
    }

    const numericFallback = Number(fallbackMarks);
    return Number.isFinite(numericFallback) ? numericFallback : NaN;
}

function normalizeStudent(record, fallbackSemester) {
    const semester = normalizeSemester(record.Semester || fallbackSemester);
    const subjects = normalizeSubjects(record, semester);
    const totalPercentage = computeTotalPercentage(subjects, record.TotalPercentage ?? record.Marks);

    return {
        ID: String(record.ID || '').trim(),
        Name: String(record.Name || '').trim(),
        Semester: semester,
        TotalPercentage: totalPercentage,
        Attendance: Number(record.Attendance),
        Subjects: subjects,
    };
}

function buildStorageStudent(student) {
    return {
        ...student,
        IDKey: student.ID.toLowerCase(),
        SemesterKey: normalizeSemesterKey(student.Semester),
        updatedAt: new Date(),
    };
}

function sanitizeStudentDocument(document) {
    const semester = normalizeSemester(document.Semester);
    const subjects = normalizeSubjects(document, semester);
    const totalPercentage = Number.isFinite(Number(document.TotalPercentage))
        ? Number(document.TotalPercentage)
        : computeTotalPercentage(subjects, document.Marks);

    return {
        ID: document.ID,
        Name: document.Name,
        Semester: semester,
        TotalPercentage: totalPercentage,
        Attendance: Number(document.Attendance),
        Subjects: subjects,
        Marks: totalPercentage,
    };
}

function validateStudent(input, fallbackSemester) {
    const student = normalizeStudent(input, fallbackSemester);
    const semesterSubjects = new Set(getSemesterSubjects(student.Semester));

    if (!student.ID) {
        return { ok: false, message: 'Student ID is required.' };
    }

    if (!student.Name) {
        return { ok: false, message: 'Student name is required.' };
    }

    if (!student.Semester) {
        return { ok: false, message: 'Semester is required.' };
    }

    if (!SEMESTERS.includes(student.Semester)) {
        return { ok: false, message: 'Please select a valid semester between Semester 1 and Semester 8.' };
    }

    if (!Number.isFinite(student.TotalPercentage) || student.TotalPercentage < 0 || student.TotalPercentage > 100) {
        return { ok: false, message: 'Total percentage must be a number between 0 and 100.' };
    }

    if (!Number.isFinite(student.Attendance) || student.Attendance < 0 || student.Attendance > 100) {
        return { ok: false, message: 'Attendance must be a number between 0 and 100.' };
    }

    for (const [subject, marks] of Object.entries(student.Subjects)) {
        if (!semesterSubjects.has(subject)) {
            return { ok: false, message: `${subject} is not a valid subject for ${student.Semester}.` };
        }

        if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
            return { ok: false, message: `Subject marks for ${subject} must be between 0 and 100.` };
        }
    }

    return { ok: true, student };
}

function getSemesterFilter(rawSemester) {
    if (!rawSemester) {
        return {};
    }

    return { SemesterKey: normalizeSemesterKey(rawSemester) };
}

async function listSemesters() {
    return SEMESTERS;
}

async function readStudents(semester) {
    const students = await studentsCollection
        .find(getSemesterFilter(semester), { projection: { _id: 0, IDKey: 0, SemesterKey: 0, updatedAt: 0 } })
        .sort({ TotalPercentage: -1, Name: 1, ID: 1 })
        .toArray();

    return students.map(sanitizeStudentDocument);
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
            accumulator.marks += student.TotalPercentage;
            accumulator.attendance += student.Attendance;

            if (student.TotalPercentage >= 80) {
                accumulator.gradeCounts.excellent += 1;
            } else if (student.TotalPercentage >= 60) {
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

    const topPerformer = [...students].sort((left, right) => right.TotalPercentage - left.TotalPercentage)[0];

    return {
        totalStudents,
        averageMarks: Number((totals.marks / totalStudents).toFixed(2)),
        averageAttendance: Number((totals.attendance / totalStudents).toFixed(2)),
        topPerformer,
        gradeCounts: totals.gradeCounts,
    };
}

function findColumn(row, aliases) {
    for (const alias of aliases) {
        if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') {
            return row[alias];
        }
    }

    return '';
}

function parseRowsToStudents(rows, fallbackSemester) {
    return rows
        .map((row) => {
            const semester = normalizeSemester(findColumn(row, ['Semester', 'Sem', 'semester', 'sem']) || fallbackSemester || DEFAULT_SEMESTER);
            const semesterSubjects = getSemesterSubjects(semester);
            const parsed = {
                ID: findColumn(row, ['ID', 'Id', 'Student ID', 'student_id']),
                Name: findColumn(row, ['Name', 'Student Name', 'student_name']),
                Semester: semester,
                Attendance: findColumn(row, ['Attendance', 'Attendance %', 'attendance']),
                TotalPercentage: findColumn(row, ['Total Percentage', 'Percentage', 'Total', 'Marks', 'Score', 'scores']),
                Subjects: {},
            };

            for (const [key, value] of Object.entries(row)) {
                const canonical = canonicalSubjectName(key);
                if (!semesterSubjects.includes(canonical) || value === '' || value === null || value === undefined) {
                    continue;
                }

                parsed.Subjects[canonical] = value;
            }

            return parsed;
        })
        .filter((row) => row.ID || row.Name || row.TotalPercentage || Object.keys(row.Subjects).length || row.Attendance);
}

function extractStudentsFromText(text, fallbackSemester) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const students = [];
    let current = {};

    for (const line of lines) {
        const pairs = [...line.matchAll(/\b(ID|Name|Attendance|Semester|Total Percentage|Percentage|Marks|[A-Za-z&()' -]+)\s*[:=-]\s*([^,|]+)/g)];
        if (!pairs.length) {
            continue;
        }

        for (const [, key, value] of pairs) {
            const trimmedKey = key.trim();
            const canonical = canonicalSubjectName(trimmedKey);

            if (ALL_SUBJECTS.includes(canonical)) {
                current.Subjects = current.Subjects || {};
                current.Subjects[canonical] = value.trim();
            } else if (/^(marks|percentage|total percentage)$/i.test(trimmedKey)) {
                current.TotalPercentage = value.trim();
            } else {
                current[trimmedKey.replace(/\b\w/g, (match) => match.toUpperCase())] = value.trim();
            }
        }

        if (current.ID && current.Name && (current.TotalPercentage || Object.keys(current.Subjects || {}).length) && current.Attendance) {
            students.push({
                ...current,
                Semester: normalizeSemester(current.Semester || fallbackSemester),
            });
            current = {};
        }
    }

    return students;
}

async function parseUploadedFile(file, fallbackSemester) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (extension === '.xlsx' || extension === '.xls') {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        return parseRowsToStudents(rows, fallbackSemester);
    }

    if (extension === '.pdf') {
        const parsed = await pdfParse(file.buffer);
        return extractStudentsFromText(parsed.text, fallbackSemester);
    }

    if (extension === '.docx') {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        return extractStudentsFromText(parsed.value, fallbackSemester);
    }

    throw new Error('Unsupported file type. Please upload Excel (.xlsx, .xls), PDF (.pdf), or Word (.docx).');
}

async function persistStudents(candidateStudents, fallbackSemester) {
    const seenRecords = new Set();
    const acceptedStudents = [];
    const rejected = [];
    const validatedStudents = [];

    for (const candidate of candidateStudents) {
        const validation = validateStudent(candidate, fallbackSemester);

        if (!validation.ok) {
            rejected.push({
                record: candidate,
                reason: validation.message,
            });
            continue;
        }

        const normalizedRecordKey = `${validation.student.ID.toLowerCase()}::${normalizeSemesterKey(validation.student.Semester)}`;
        if (seenRecords.has(normalizedRecordKey)) {
            rejected.push({
                record: candidate,
                reason: 'Duplicate student ID for the selected semester.',
            });
            continue;
        }

        seenRecords.add(normalizedRecordKey);
        validatedStudents.push(validation.student);
    }

    if (!validatedStudents.length) {
        return { added: acceptedStudents, rejected };
    }

    const existingStudents = await studentsCollection
        .find(
            {
                $or: validatedStudents.map((student) => ({
                    IDKey: student.ID.toLowerCase(),
                    SemesterKey: normalizeSemesterKey(student.Semester),
                })),
            },
            { projection: { IDKey: 1, SemesterKey: 1 } }
        )
        .toArray();

    const existingKeys = new Set(existingStudents.map((student) => `${student.IDKey}::${student.SemesterKey}`));
    const documentsToInsert = [];

    for (const student of validatedStudents) {
        const recordKey = `${student.ID.toLowerCase()}::${normalizeSemesterKey(student.Semester)}`;

        if (existingKeys.has(recordKey)) {
            rejected.push({
                record: student,
                reason: 'Duplicate student ID for the selected semester.',
            });
            continue;
        }

        acceptedStudents.push(student);
        documentsToInsert.push(buildStorageStudent(student));
    }

    if (documentsToInsert.length) {
        await studentsCollection.insertMany(documentsToInsert, { ordered: true });
    }

    return {
        added: acceptedStudents,
        rejected,
    };
}

app.get('/api/health', async (req, res, next) => {
    try {
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            database: DB_NAME,
            collection: STUDENTS_COLLECTION,
            semesters: SEMESTERS,
            subjectsBySemester: SUBJECTS_BY_SEMESTER,
        });
    } catch (error) {
        next(error);
    }
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

app.get('/api/semesters', async (req, res, next) => {
    try {
        res.json({
            semesters: SEMESTERS,
            defaultSemester: DEFAULT_SEMESTER,
            subjectsBySemester: SUBJECTS_BY_SEMESTER,
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/students', async (req, res, next) => {
    try {
        const students = await readStudents(req.query.semester);
        res.json(students);
    } catch (error) {
        next(error);
    }
});

app.get('/api/stats', async (req, res, next) => {
    try {
        const students = await readStudents(req.query.semester);
        res.json(buildStats(students));
    } catch (error) {
        next(error);
    }
});

async function createStudent(req, res, next) {
    try {
        const { added, rejected } = await persistStudents([req.body], req.body.semester);

        if (!added.length) {
            return res.status(rejected[0]?.reason?.includes('Duplicate') ? 409 : 400).json({
                success: false,
                message: rejected[0]?.reason || 'Unable to add student result.',
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

        const fallbackSemester = normalizeSemester(req.body.semester);
        const parsedStudents = await parseUploadedFile(req.file, fallbackSemester);

        if (!parsedStudents.length) {
            return res.status(400).json({
                success: false,
                message: 'No student records were found in the uploaded file.',
            });
        }

        const result = await persistStudents(parsedStudents, fallbackSemester);

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

async function startServer() {
    await client.connect();
    const database = client.db(DB_NAME);
    studentsCollection = database.collection(STUDENTS_COLLECTION);

    const indexes = await studentsCollection.indexes();
    const legacyIndex = indexes.find((index) => index.name === 'IDKey_1');
    if (legacyIndex) {
        await studentsCollection.dropIndex('IDKey_1');
    }

    await studentsCollection.updateMany(
        { ID: { $type: 'string' } },
        [
            {
                $set: {
                    Semester: {
                        $cond: [
                            { $gt: [{ $strLenCP: { $ifNull: ['$Semester', ''] } }, 0] },
                            '$Semester',
                            DEFAULT_SEMESTER,
                        ],
                    },
                    IDKey: { $toLower: '$ID' },
                    SemesterKey: {
                        $toLower: {
                            $cond: [
                                { $gt: [{ $strLenCP: { $ifNull: ['$Semester', ''] } }, 0] },
                                '$Semester',
                                DEFAULT_SEMESTER,
                            ],
                        },
                    },
                    TotalPercentage: {
                        $cond: [
                            { $and: [{ $ne: ['$TotalPercentage', null] }, { $ne: ['$TotalPercentage', ''] }] },
                            '$TotalPercentage',
                            {
                                $cond: [
                                    { $and: [{ $ne: ['$Marks', null] }, { $ne: ['$Marks', ''] }] },
                                    '$Marks',
                                    0,
                                ],
                            },
                        ],
                    },
                    Subjects: { $ifNull: ['$Subjects', {}] },
                    updatedAt: '$$NOW',
                },
            },
        ]
    );

    await studentsCollection.createIndex(
        { IDKey: 1, SemesterKey: 1 },
        {
            unique: true,
            partialFilterExpression: {
                IDKey: { $type: 'string' },
                SemesterKey: { $type: 'string' },
            },
        }
    );

    app.listen(PORT, () => {
        console.log(`Server: http://localhost:${PORT}`);
        console.log(`MongoDB: ${MONGODB_URI}/${DB_NAME}.${STUDENTS_COLLECTION}`);
    });
}

startServer().catch((error) => {
    console.error('Failed to start server.');
    console.error(error);
    process.exit(1);
});
