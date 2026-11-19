// ============================================================================
// src/services/analytics.js
// The analytics engine. Turns validated records into ranked, categorised
// students and computes the class-level figures shown on the dashboard.
// ============================================================================

const { extractSubjectMarks, getSubjectNamesFromStudents, normalizeReportType } = require('../utils/normalizers');
const { isPlainObject } = require('../utils/validators');
// A student scoring below this percentage is in the weak band. The dashboard,
// the query engine and the AI insights all use this one value.
const WEAK_THRESHOLD_PERCENT = 40;

/**
 * In a multi-subject report a student passes only by clearing the passing mark
 * in every subject, so one failed subject fails the report as a whole.
 */
function hasFailedSubject(subjectMarks, passingMarks) {
  return Object.values(extractSubjectMarks({ subjectMarks })).some((value) => {
    const mark = parseFloat(value);
    return Number.isFinite(mark) && mark < Number(passingMarks);
  });
}

function buildStudentPerformance(student, marks, maxMarks, passingMarks, rank = student.rank || 0, forceFail = false) {
  const { marks: safeMarks, percentage, status, category } = classifyPerformance(marks, maxMarks, passingMarks, forceFail);

  return {
    ...student,
    marks: safeMarks,
    percentage,
    status,
    category,
    rank,
  };
}

function calculateAnalyticsForSubset(students, maxMarks, reportType = 'single') {
  if (!Array.isArray(students) || students.length === 0) {
    return {
      totalStudents: 0,
      passedStudents: 0,
      failedStudents: 0,
      averageMarks: 0,
      highestMarks: 0,
      lowestMarks: 0,
      passPercentage: 0,
      failPercentage: 0,
      marksDistribution: {
        range_0_35: 0,
        range_36_50: 0,
        range_51_70: 0,
        range_71_85: 0,
        range_86_100: 0,
      },
      reportType: normalizeReportType(reportType),
      subjectSummary: [],
    };
  }

  return calculateAnalytics(students, maxMarks, reportType);
}

function buildFilteredDashboardData(uploadDoc, students, analytics, subjectFilter = 'all', studentFilter = 'all') {
  const maxMarks = Number(uploadDoc.maxMarks) || 100;
  const passingMarks = Number(uploadDoc.passingMarks) || 35;
  const reportType = normalizeReportType(uploadDoc.subjectType || analytics?.reportType);
  const subjectNames = getSubjectNamesFromStudents(students, analytics);
  const subjectOptions = subjectNames.length
    ? subjectNames
    : [uploadDoc.subjectName].filter(Boolean);
  const selectedSubject = String(subjectFilter || 'all').trim();
  const selectedStudent = String(studentFilter || 'all').trim();
  const normalizedSubject = selectedSubject.toLowerCase();
  const normalizedStudent = selectedStudent.toLowerCase();

  const studentOptions = students.map((student) => ({
    rollNo: String(student.rollNo || ''),
    studentName: String(student.studentName || ''),
    label: `${student.studentName} (${student.rollNo})`,
  }));

  let filteredStudents = students.filter((student) => {
    if (normalizedStudent === 'all') {
      return true;
    }

    return String(student.rollNo || '').toLowerCase() === normalizedStudent
      || String(student.studentName || '').toLowerCase() === normalizedStudent;
  });

  if (normalizedSubject !== 'all' && subjectNames.length) {
    filteredStudents = filteredStudents
      .map((student) => {
        const subjectMarks = extractSubjectMarks(student);
        const matchedSubject = subjectNames.find((subjectName) => subjectName.toLowerCase() === normalizedSubject);
        if (!matchedSubject || subjectMarks[matchedSubject] === undefined) {
          return null;
        }

        return buildStudentPerformance(
          {
            ...student,
            selectedSubject: matchedSubject,
            subjectMarks,
          },
          subjectMarks[matchedSubject],
          maxMarks,
          passingMarks,
          student.rank
        );
      })
      .filter(Boolean);
  } else {
    filteredStudents = filteredStudents.map((student) => buildStudentPerformance(
      student,
      student.marks,
      maxMarks,
      passingMarks,
      student.rank,
      subjectNames.length > 0 && hasFailedSubject(student.subjectMarks, passingMarks)
    ));
  }

  filteredStudents.sort((left, right) => Number(right.marks) - Number(left.marks));
  filteredStudents.forEach((student, index) => {
    student.rank = index + 1;
  });

  const filteredAnalytics = calculateAnalyticsForSubset(
    filteredStudents,
    maxMarks,
    subjectNames.length ? 'multiple' : reportType
  );

  if (normalizedSubject !== 'all' && subjectNames.length) {
    const subjectName = subjectNames.find((name) => name.toLowerCase() === normalizedSubject) || selectedSubject;
    const subjectMarks = filteredStudents.map((student) => Number(student.marks)).filter(Number.isFinite);
    filteredAnalytics.subjectSummary = [{
      subjectName,
      averageMarks: subjectMarks.length ? parseFloat((subjectMarks.reduce((sum, mark) => sum + mark, 0) / subjectMarks.length).toFixed(2)) : 0,
      highestMarks: subjectMarks.length ? Math.max(...subjectMarks) : 0,
      lowestMarks: subjectMarks.length ? Math.min(...subjectMarks) : 0,
    }];
  }

  return {
    analytics: filteredAnalytics,
    students: filteredStudents,
    filters: {
      selectedSubject: selectedSubject || 'all',
      selectedStudent: selectedStudent || 'all',
      subjectOptions,
      studentOptions,
    },
  };
}

/**
 * Process student records - calculate percentage, status, category, rank
 */
/**
 * The single definition of how a student's marks become a percentage, a
 * pass/fail status and a performance category.
 *
 * Every caller goes through this function. The classification used to be
 * written out separately in processStudents() (twice -- once per report type)
 * and again in buildStudentPerformance(); three copies of the same rules is
 * three chances for them to drift apart.
 *
 * Categories:
 *   Failed             - below the passing mark
 *   Top Performer      - passed, above 80%
 *   Weak Student       - passed, below 40%
 *   Average Performer  - everyone else who passed
 *
 * @param {number} marks        marks obtained
 * @param {number} maxMarks     maximum possible marks
 * @param {number} passingMarks minimum marks required to pass
 * @param {boolean} [forceFail] true when the student already failed on another rule
 * @returns {{marks:number, percentage:number, status:string, category:string}}
 */
function classifyPerformance(marks, maxMarks, passingMarks, forceFail = false) {
  const numericMarks = Number(marks);
  const safeMarks = Number.isFinite(numericMarks) ? numericMarks : 0;
  const safeMax = Number(maxMarks) > 0 ? Number(maxMarks) : 100;

  const percentage = parseFloat(((safeMarks / safeMax) * 100).toFixed(2));
  const status = !forceFail && safeMarks >= Number(passingMarks) ? 'Pass' : 'Fail';

  let category;
  if (status === 'Fail') {
    category = 'Failed';
  } else if (percentage > 80) {
    category = 'Top Performer';
  } else if (percentage < WEAK_THRESHOLD_PERCENT) {
    category = 'Weak Student';
  } else {
    category = 'Average Performer';
  }

  return { marks: parseFloat(safeMarks.toFixed(2)), percentage, status, category };
}

function processStudents(records, maxMarks, passingMarks, reportType = 'single') {
  const normalizedReportType = normalizeReportType(reportType);

  const students = records.map((record) => {
    if (normalizedReportType === 'multiple') {
      const subjectMarks = extractSubjectMarks(record);
      const subjectValues = Object.values(subjectMarks)
        .map((value) => parseFloat(value))
        .filter((value) => Number.isFinite(value));
      const marks = subjectValues.length > 0
        ? parseFloat((subjectValues.reduce((sum, value) => sum + value, 0) / subjectValues.length).toFixed(2))
        : 0;
      const { percentage, status, category } = classifyPerformance(
        marks,
        maxMarks,
        passingMarks,
        hasFailedSubject(subjectMarks, passingMarks)
      );

      return {
        rollNo: String(record.rollNo).trim(),
        studentName: String(record.studentName).trim(),
        marks,
        percentage,
        status,
        category,
        subjectMarks,
      };
    }

    const marks = parseFloat(record.marks);
    const { percentage, status, category } = classifyPerformance(marks, maxMarks, passingMarks);

    return {
      rollNo: String(record.rollNo).trim(),
      studentName: String(record.studentName).trim(),
      marks,
      percentage,
      status,
      category
    };
  });

  // Sort by marks descending and assign rank
  students.sort((a, b) => b.marks - a.marks);
  students.forEach((student, index) => {
    student.rank = index + 1;
  });

  return students;
}

/**
 * Calculate analytics from processed students
 */
function calculateAnalytics(students, maxMarks, reportType = 'single') {
  if (!Array.isArray(students) || students.length === 0) {
    return calculateAnalyticsForSubset([], maxMarks, reportType);
  }

  const totalStudents = students.length;
  const passedStudents = students.filter((s) => s.status === 'Pass').length;
  const failedStudents = students.filter((s) => s.status === 'Fail').length;
  const allMarks = students.map((s) => s.marks);
  const averageMarks = parseFloat((allMarks.reduce((a, b) => a + b, 0) / totalStudents).toFixed(2));
  const highestMarks = Math.max(...allMarks);
  const lowestMarks = Math.min(...allMarks);
  const passPercentage = parseFloat(((passedStudents / totalStudents) * 100).toFixed(2));
  const failPercentage = parseFloat(((failedStudents / totalStudents) * 100).toFixed(2));

  // Marks distribution based on percentage
  const marksDistribution = {
    range_0_35: 0,
    range_36_50: 0,
    range_51_70: 0,
    range_71_85: 0,
    range_86_100: 0
  };

  for (const student of students) {
    const pct = student.percentage;
    if (pct <= 35) {
      marksDistribution.range_0_35++;
    } else if (pct <= 50) {
      marksDistribution.range_36_50++;
    } else if (pct <= 70) {
      marksDistribution.range_51_70++;
    } else if (pct <= 85) {
      marksDistribution.range_71_85++;
    } else {
      marksDistribution.range_86_100++;
    }
  }

  const subjectSummary = normalizeReportType(reportType) === 'multiple'
    ? (() => {
        const aggregation = new Map();
        for (const student of students) {
          if (!isPlainObject(student.subjectMarks)) {
            continue;
          }

          for (const [subjectName, subjectValue] of Object.entries(student.subjectMarks)) {
            const marks = parseFloat(subjectValue);
            if (!Number.isFinite(marks)) {
              continue;
            }

            const bucket = aggregation.get(subjectName) || {
              subjectName,
              total: 0,
              count: 0,
              highest: marks,
              lowest: marks,
            };
            bucket.total += marks;
            bucket.count += 1;
            bucket.highest = Math.max(bucket.highest, marks);
            bucket.lowest = Math.min(bucket.lowest, marks);
            aggregation.set(subjectName, bucket);
          }
        }

        return Array.from(aggregation.values()).map((bucket) => ({
          subjectName: bucket.subjectName,
          averageMarks: parseFloat((bucket.total / bucket.count).toFixed(2)),
          highestMarks: bucket.highest,
          lowestMarks: bucket.lowest,
        }));
      })()
    : [];

  return {
    totalStudents,
    passedStudents,
    failedStudents,
    averageMarks,
    highestMarks,
    lowestMarks,
    passPercentage,
    failPercentage,
    marksDistribution,
    reportType: normalizeReportType(reportType),
    subjectSummary,
  };
}

module.exports = {
  WEAK_THRESHOLD_PERCENT,
  classifyPerformance,
  calculateAnalyticsForSubset,
  buildFilteredDashboardData,
  processStudents,
  calculateAnalytics,
};
