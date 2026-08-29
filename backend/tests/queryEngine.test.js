// ============================================================================
// tests/queryEngine.test.js
// Unit tests for the free-text query engine (src/services/queryEngine.js).
// Every assertion checks the answer is both CORRECT and SPECIFIC -- an answer
// that dodges the question ("Top performers: ..." when asked for a count) is a
// failure, because that is exactly the class of bug these tests exist to stop.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');

const {
  answerQuestionFromData,
  parseRange,
  parseThreshold,
  findStudent,
} = require('../src/services/queryEngine');

// --- fixture: 15 students, multi-subject, pass mark 60 -> 13 pass / 2 fail --
const RAW = [
  ['601', 'Akash Goud',     97.5,  'Pass', 'Top Performer'],
  ['602', 'Bhavana Rao',    95,    'Pass', 'Top Performer'],
  ['603', 'Chetan Kumar',   92.25, 'Pass', 'Top Performer'],
  ['604', 'Divya Sree',     90,    'Pass', 'Top Performer'],
  ['605', 'Eshan Patel',    88,    'Pass', 'Top Performer'],
  ['606', 'Farhan Ali',     86.5,  'Pass', 'Top Performer'],
  ['607', 'Gayatri Devi',   85,    'Pass', 'Top Performer'],
  ['608', 'Harsha Vardhan', 83,    'Pass', 'Top Performer'],
  ['609', 'Ishaan Verma',   80,    'Pass', 'Average Performer'],
  ['610', 'Jyothi Reddy',   78,    'Pass', 'Average Performer'],
  ['611', 'Kiran Chandra',  75,    'Pass', 'Average Performer'],
  ['612', 'Lavanya Nair',   69.75, 'Pass', 'Average Performer'],
  ['613', 'Manoj Pillai',   65,    'Pass', 'Average Performer'],
  ['614', 'Nikhil Raj',     58,    'Fail', 'Failed'],
  ['615', 'Ojas Bhat',      50.5,  'Fail', 'Failed'],
];

const students = RAW.map(([rollNo, studentName, marks, status, category], i) => ({
  rollNo, studentName, marks, percentage: marks, status, category, rank: i + 1,
  subjectMarks: { Maths: marks + 1, Physics: marks - 1, Chemistry: marks, English: marks },
}));

const analytics = {
  totalStudents: 15,
  passedStudents: 13,
  failedStudents: 2,
  averageMarks: 79.57,
  highestMarks: 97.5,
  lowestMarks: 50.5,
  passPercentage: 86.67,
  failPercentage: 13.33,
  marksDistribution: { range_0_35: 0, range_36_50: 0, range_51_70: 3, range_71_85: 5, range_86_100: 7 },
  reportType: 'multiple',
  subjectSummary: [
    { subjectName: 'Maths', averageMarks: 80.57, highestMarks: 98.5, lowestMarks: 51.5 },
    { subjectName: 'Physics', averageMarks: 78.57, highestMarks: 96.5, lowestMarks: 49.5 },
    { subjectName: 'Chemistry', averageMarks: 79.57, highestMarks: 97.5, lowestMarks: 50.5 },
    { subjectName: 'English', averageMarks: 79.57, highestMarks: 97.5, lowestMarks: 50.5 },
  ],
};

const ask = (q) => answerQuestionFromData(q, analytics, students, { subjectName: 'multi' });

// ---------------------------------------------------------------- counts ---
test('"how many students failed?" answers with the count, not a name list', () => {
  const a = ask('how many students failed?');
  assert.match(a, /\b2 students failed\b/, a);
  assert.match(a, /out of 15/, a);
});

test('"how many students passed?" answers 13', () => {
  const a = ask('how many students passed?');
  assert.match(a, /\b13 students passed\b/, a);
});

test('"how many students are there?" answers 15', () => {
  const a = ask('how many students are there?');
  assert.match(a, /\b15 students\b/, a);
});

test('"how many students scored above 90?" answers a count of 3', () => {
  const a = ask('how many students scored above 90?');
  assert.match(a, /^3 students scored above 90/, a);
  assert.ok(!a.includes('Akash'), `a count question must not dump names: ${a}`);
});

test('"how many students scored between 60 and 80?" answers a count of 5', () => {
  const a = ask('how many students scored between 60 and 80?');
  assert.match(a, /^5 students scored between 60 and 80/, a);
});

test('"how many students are weak?" answers zero for this class', () => {
  const a = ask('how many students are weak?');
  assert.match(a, /No students are in the weak band/i, a);
});

// ------------------------------------------------------------ superlatives --
test('"what is the highest mark?" answers the value and who scored it', () => {
  const a = ask('what is the highest mark?');
  assert.match(a, /highest mark is 97\.5/, a);
  assert.match(a, /Akash Goud/, a);
});

test('"what is the lowest mark?" answers the value and who scored it', () => {
  const a = ask('what is the lowest mark?');
  assert.match(a, /lowest mark is 50\.5/, a);
  assert.match(a, /Ojas Bhat/, a);
});

test('"who is the topper?" names one student, not a list of five', () => {
  const a = ask('who is the topper?');
  assert.match(a, /topper is Akash Goud/, a);
  assert.ok(!a.includes('Bhavana'), `the topper is a single student: ${a}`);
});

test('"highest and lowest marks" answers both', () => {
  const a = ask('what are the highest and lowest marks?');
  assert.match(a, /97\.5/, a);
  assert.match(a, /50\.5/, a);
});

// ------------------------------------------------------------------ lists --
test('"list top 5 students" returns exactly five, ranked', () => {
  const a = ask('list top 5 students');
  assert.match(a, /^Top 5 students:/, a);
  assert.match(a, /Akash Goud/, a);
  assert.match(a, /Eshan Patel/, a);
  assert.ok(!a.includes('Farhan Ali'), `only five: ${a}`);
});

test('"top 3 students" honours the requested number', () => {
  const a = ask('top 3 students');
  assert.match(a, /^Top 3 students:/, a);
  assert.ok(!a.includes('Divya Sree'), `only three: ${a}`);
});

test('"who failed?" lists both failing students by name', () => {
  const a = ask('who failed?');
  assert.match(a, /Nikhil Raj/, a);
  assert.match(a, /Ojas Bhat/, a);
});

// ------------------------------------------------------------- aggregates --
test('"what is the class average?" answers the average', () => {
  const a = ask('what is the class average?');
  assert.match(a, /79\.57/, a);
});

test('"what is the pass percentage?" answers the rate', () => {
  const a = ask('what is the pass percentage?');
  assert.match(a, /86\.67%/, a);
});

test('"marks distribution" reports every band', () => {
  const a = ask('show me the marks distribution');
  assert.match(a, /0-35%: 0/, a);
  assert.match(a, /86-100%: 7/, a);
});

// -------------------------------------------------------- per-student ------
test('a student asked for by name gets their own record', () => {
  const a = ask('how did Jyothi Reddy do?');
  assert.match(a, /Jyothi Reddy/, a);
  assert.match(a, /Roll No 610/, a);
  assert.match(a, /78 marks/, a);
});

test('a student asked for by roll number gets their own record', () => {
  const a = ask('what are the marks of roll no 614?');
  assert.match(a, /Nikhil Raj/, a);
  assert.match(a, /58 marks/, a);
  assert.match(a, /Fail/, a);
});

test('a per-student answer includes their subject breakdown', () => {
  const a = ask('how did Akash Goud perform?');
  assert.match(a, /Subject marks:/, a);
  assert.match(a, /Maths 98\.5/, a);
});

// ------------------------------------------------------------------ rank ---
test('"who is rank 3?" names the third-ranked student', () => {
  const a = ask('who is rank 3?');
  assert.match(a, /Rank 3 is Chetan Kumar/, a);
});

test('a rank beyond the class size is reported honestly', () => {
  const a = ask('who is rank 40?');
  assert.match(a, /no student at rank 40/i, a);
});

// --------------------------------------------------------------- subjects --
test('"average in Maths" uses the subject, not the overall average', () => {
  const a = ask('what is the average in Maths?');
  assert.match(a, /Maths/, a);
  assert.match(a, /80\.57/, a);
});

test('"who is best in Physics" names the subject topper', () => {
  const a = ask('who is best in Physics?');
  assert.match(a, /Physics/, a);
  assert.match(a, /Akash Goud/, a);
});

test('"how many subjects" counts them', () => {
  const a = ask('how many subjects are there?');
  assert.match(a, /4 subjects/, a);
  assert.match(a, /Maths/, a);
});

// ------------------------------------------------------- threshold parsing --
test('parseThreshold understands worded and symbolic forms', () => {
  assert.deepStrictEqual(parseThreshold('above 90'), { operator: 'gt', value: 90, usePercentage: false });
  assert.deepStrictEqual(parseThreshold('below 40'), { operator: 'lt', value: 40, usePercentage: false });
  assert.deepStrictEqual(parseThreshold('at least 60'), { operator: 'gte', value: 60, usePercentage: false });
  assert.deepStrictEqual(parseThreshold('>= 75'), { operator: 'gte', value: 75, usePercentage: false });
  assert.deepStrictEqual(parseThreshold('more than 50 percent'), { operator: 'gt', value: 50, usePercentage: true });
  assert.strictEqual(parseThreshold('who is the topper'), null);
});

test('parseRange understands between/from/dash forms', () => {
  assert.deepStrictEqual(parseRange('between 60 and 80'), { lower: 60, upper: 80, usePercentage: false });
  assert.deepStrictEqual(parseRange('from 40 to 70'), { lower: 40, upper: 70, usePercentage: false });
  assert.deepStrictEqual(parseRange('scored 50-60'), { lower: 50, upper: 60, usePercentage: false });
  assert.strictEqual(parseRange('how many passed'), null);
});

test('findStudent matches the longest name, not a shorter substring', () => {
  const two = [
    { rollNo: '1', studentName: 'Ravi', marks: 50 },
    { rollNo: '2', studentName: 'Ravi Kumar', marks: 90 },
  ];
  assert.strictEqual(findStudent('how did ravi kumar do', two).rollNo, '2');
});

// ------------------------------------------------------------ empty input --
test('an unanswerable question returns an empty string so the caller can escalate', () => {
  assert.strictEqual(ask('what is the meaning of life'), '');
});

test('an empty question returns an empty string', () => {
  assert.strictEqual(ask(''), '');
});

test('an upload with no students says so instead of throwing', () => {
  const a = answerQuestionFromData('how many failed?', { totalStudents: 0 }, []);
  assert.match(a, /no student data/i, a);
});

// ------------------------------------------------- single-subject uploads ---
test('single-subject uploads answer without inventing subject breakdowns', () => {
  const single = students.map(({ subjectMarks: _subjectMarks, ...rest }) => rest);
  const singleAnalytics = { ...analytics, reportType: 'single', subjectSummary: [] };
  const a = answerQuestionFromData('how did Akash Goud do?', singleAnalytics, single, { subjectName: 'Physics' });
  assert.match(a, /Akash Goud/, a);
  assert.ok(!a.includes('Subject marks:'), `no subject list for a single-subject upload: ${a}`);
});

// ------------------------------------------------ consistency with analytics -
test('every count answer agrees with the analytics document', () => {
  assert.match(ask('how many passed?'), new RegExp(`\\b${analytics.passedStudents} students passed\\b`));
  assert.match(ask('how many failed?'), new RegExp(`\\b${analytics.failedStudents} students failed\\b`));
  assert.match(ask('how many students?'), new RegExp(`\\b${analytics.totalStudents} students\\b`));
});
