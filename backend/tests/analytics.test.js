// ============================================================================
// tests/analytics.test.js
// Unit tests for the analytics engine (src/services/analytics.js).
// Run with:  npm test        (uses Node's built-in test runner, no extra deps)
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');

const {
  calculateAnalytics,
  calculateAnalyticsForSubset,
  processStudents,
} = require('../src/services/analytics');

// --- helpers ---------------------------------------------------------------
// processStudents() is the function that turns raw parsed rows into the
// student shape the analytics engine consumes, so tests go through it rather
// than hand-building objects that could drift from production behaviour.
const MAX = 100;
const PASS = 40;

function build(rows, reportType = 'single') {
  return processStudents(rows, MAX, PASS, reportType);
}

// ---------------------------------------------------------------------------
test('class average, highest and lowest for three students', () => {
  const students = build([
    { rollNo: '1', studentName: 'Alice', marks: 80 },
    { rollNo: '2', studentName: 'Bob', marks: 60 },
    { rollNo: '3', studentName: 'Carol', marks: 70 },
  ]);

  const r = calculateAnalytics(students, MAX);

  assert.strictEqual(r.totalStudents, 3);
  assert.strictEqual(r.averageMarks, 70);
  assert.strictEqual(r.highestMarks, 80);
  assert.strictEqual(r.lowestMarks, 60);
  assert.strictEqual(r.passPercentage, 100);
  assert.strictEqual(r.failPercentage, 0);
  assert.strictEqual(r.reportType, 'single');
});

test('pass and fail counts respect the 40-mark passing threshold', () => {
  const students = build([
    { rollNo: '1', studentName: 'Alice', marks: 40 }, // exactly at the threshold => Pass
    { rollNo: '2', studentName: 'Bob', marks: 39 },   // one below => Fail
    { rollNo: '3', studentName: 'Carol', marks: 95 },
    { rollNo: '4', studentName: 'Dan', marks: 12 },
  ]);

  const r = calculateAnalytics(students, MAX);

  assert.strictEqual(r.passedStudents, 2);
  assert.strictEqual(r.failedStudents, 2);
  assert.strictEqual(r.passPercentage, 50);
  assert.strictEqual(r.failPercentage, 50);
});

test('marks distribution buckets students by percentage band', () => {
  const students = build([
    { rollNo: '1', studentName: 'A', marks: 20 },  // 0-35
    { rollNo: '2', studentName: 'B', marks: 35 },  // 0-35  (boundary, inclusive)
    { rollNo: '3', studentName: 'C', marks: 50 },  // 36-50 (boundary, inclusive)
    { rollNo: '4', studentName: 'D', marks: 70 },  // 51-70 (boundary, inclusive)
    { rollNo: '5', studentName: 'E', marks: 85 },  // 71-85 (boundary, inclusive)
    { rollNo: '6', studentName: 'F', marks: 100 }, // 86-100
  ]);

  const d = calculateAnalytics(students, MAX).marksDistribution;

  assert.deepStrictEqual(d, {
    range_0_35: 2,
    range_36_50: 1,
    range_51_70: 1,
    range_71_85: 1,
    range_86_100: 1,
  });
  const bucketTotal = Object.values(d).reduce((a, b) => a + b, 0);
  assert.strictEqual(bucketTotal, students.length, 'every student lands in exactly one bucket');
});

test('percentage is computed against maxMarks, not assumed to be 100', () => {
  const students = processStudents(
    [{ rollNo: '1', studentName: 'Alice', marks: 25 }],
    50,   // maxMarks
    20,   // passingMarks
  );

  assert.strictEqual(students[0].percentage, 50);
  assert.strictEqual(students[0].status, 'Pass');
});

test('student categories follow the documented performance bands', () => {
  // processStudents() ranks students by marks, so look each one up by name
  // rather than by position in the returned array.
  const students = build([
    { rollNo: '1', studentName: 'Top', marks: 90 },     // > 80       => Top Performer
    { rollNo: '2', studentName: 'Mid', marks: 65 },     // 50..80     => Average Performer
    { rollNo: '3', studentName: 'Boundary', marks: 80 },// exactly 80 => Average Performer
    { rollNo: '4', studentName: 'Failing', marks: 10 }, // below pass => Failed
  ]);
  const by = (name) => students.find((s) => s.studentName === name);

  assert.strictEqual(by('Top').category, 'Top Performer');
  assert.strictEqual(by('Mid').category, 'Average Performer');
  assert.strictEqual(by('Boundary').category, 'Average Performer');
  assert.strictEqual(by('Failing').category, 'Failed');
  assert.strictEqual(by('Failing').status, 'Fail');
});

test('processStudents ranks students from highest to lowest marks', () => {
  const students = build([
    { rollNo: '1', studentName: 'Low', marks: 30 },
    { rollNo: '2', studentName: 'High', marks: 95 },
    { rollNo: '3', studentName: 'Middle', marks: 60 },
  ]);

  assert.deepStrictEqual(students.map((s) => s.studentName), ['High', 'Middle', 'Low']);
});

test('empty student list returns a zeroed analytics object instead of NaN', () => {
  const r = calculateAnalytics([], MAX);

  assert.strictEqual(r.totalStudents, 0);
  assert.ok(Number.isFinite(r.averageMarks), 'averageMarks must be a finite number');
  assert.ok(!Number.isNaN(r.passPercentage), 'passPercentage must not be NaN');
});

test('multi-subject uploads produce a per-subject summary', () => {
  const students = build([
    { rollNo: '1', studentName: 'Alice', subjectMarks: { Math: 90, Physics: 70 } },
    { rollNo: '2', studentName: 'Bob', subjectMarks: { Math: 50, Physics: 30 } },
  ], 'multiple');

  const r = calculateAnalytics(students, MAX, 'multiple');

  assert.strictEqual(r.reportType, 'multiple');
  const math = r.subjectSummary.find((s) => s.subjectName === 'Math');
  assert.ok(math, 'Math must appear in the subject summary');
  assert.strictEqual(math.averageMarks, 70);
  assert.strictEqual(math.highestMarks, 90);
  assert.strictEqual(math.lowestMarks, 50);
});

test('single-subject uploads carry an empty subject summary', () => {
  const students = build([{ rollNo: '1', studentName: 'Alice', marks: 80 }]);
  assert.deepStrictEqual(calculateAnalytics(students, MAX).subjectSummary, []);
});

test('calculateAnalyticsForSubset matches calculateAnalytics on the same input', () => {
  const students = build([
    { rollNo: '1', studentName: 'Alice', marks: 80 },
    { rollNo: '2', studentName: 'Bob', marks: 30 },
  ]);

  const full = calculateAnalytics(students, MAX);
  const subset = calculateAnalyticsForSubset(students, MAX);

  assert.strictEqual(subset.averageMarks, full.averageMarks);
  assert.strictEqual(subset.passedStudents, full.passedStudents);
  assert.strictEqual(subset.totalStudents, full.totalStudents);
});
