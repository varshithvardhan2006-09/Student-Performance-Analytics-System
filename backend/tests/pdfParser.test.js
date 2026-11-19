const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePDFTextToRecords } = require('../src/services/fileParser');

test('a single-subject table with a header row is parsed', () => {
  const rows = parsePDFTextToRecords('Roll No Student Name Marks\n101 Asha Rao 78\n102 Ravi Kumar 45');
  assert.deepEqual(rows, [
    { rollNo: '101', studentName: 'Asha Rao', marks: '78' },
    { rollNo: '102', studentName: 'Ravi Kumar', marks: '45' },
  ]);
});

test('a multi-subject table keeps one mark per subject', () => {
  const rows = parsePDFTextToRecords('Roll No Student Name Maths Physics\n7 Meena S 90 80');
  assert.deepEqual(rows[0].subjectMarks, { Maths: '90', Physics: '80' });
  assert.equal(rows[0].studentName, 'Meena S');
});

test('pipe separated cells and names containing digits work', () => {
  const rows = parsePDFTextToRecords('Roll No | Name | Marks\nB-12 | Student 2nd Year | 66');
  assert.equal(rows[0].studentName, 'Student 2nd Year');
  assert.equal(rows[0].marks, '66');
});

test('page footers and titles are not read as students', () => {
  const rows = parsePDFTextToRecords('Class Result Sheet 2024\nRoll No Student Name Marks\n1 Asha 50\nPage 1 of 2');
  assert.equal(rows.length, 1);
});

test('lines without a header still parse when they look like rows', () => {
  const rows = parsePDFTextToRecords('1 Asha Rao 50\nTotal students are 2 here');
  assert.equal(rows.length, 1);
});
