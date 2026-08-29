// ============================================================================
// src/services/queryEngine.js
// ============================================================================
// Answers a teacher's free-text question directly from the stored analytics and
// student rows -- no AI call required. Groq is only consulted for questions this
// engine cannot answer, so the common cases stay instant, deterministic and
// correct even with no API key configured.
//
// Every answer is derived from the SAME dataset the caller passes in, so the
// numbers can never disagree with the dashboard the teacher is looking at.
// ============================================================================

const { normalizeReportType } = require('../utils/normalizers');

// ---------------------------------------------------------------- formatting

/** Trim pointless trailing zeros: 78.00 -> 78, 69.75 -> 69.75. */
function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(parseFloat(n.toFixed(2)));
}

function pct(value) {
  return `${num(value)}%`;
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : (pluralForm || `${singular}s`)}`;
}

/** "A, B and C" */
function joinWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describe(student) {
  return `${student.studentName} (Roll No ${student.rollNo}, ${num(student.marks)} marks, ${pct(student.percentage)})`;
}

/** Render a student list, capping the output so an answer stays readable. */
function listStudents(students, cap = 12) {
  const shown = students.slice(0, cap).map(describe).join('; ');
  const rest = students.length - cap;
  return rest > 0 ? `${shown}; and ${rest} more` : shown;
}

// ------------------------------------------------------------------ parsing

const COUNT_RE = /\b(how many|how much|number of|count of|count|total number|no\. of)\b/i;
const LIST_RE = /\b(list|show|name|names|who|whom|which)\b/i;

/** "between 60 and 80", "from 60 to 80", "60-80", "in the 60 to 80 range" */
function parseRange(question) {
  const q = String(question || '').toLowerCase();
  const explicit = q.match(/\b(?:between|from|range of|in the)\s+(\d+(?:\.\d+)?)\s*(?:to|-|and|–)\s*(\d+(?:\.\d+)?)/);
  const bare = q.match(/\b(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\b/);
  const match = explicit || bare;
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return {
    lower: Math.min(a, b),
    upper: Math.max(a, b),
    usePercentage: /percent|percentage|%/.test(q),
  };
}

/**
 * "above 90", "below 40", "more than 75", "at least 60", ">= 50", "under 35".
 * Returns null when the question carries no threshold.
 */
function parseThreshold(question) {
  const q = String(question || '').toLowerCase();

  const worded = q.match(/\b(less than|lower than|below|under|fewer than|greater than|more than|higher than|above|over|at least|minimum of|min|at most|maximum of|max|not more than)\s+(\d+(?:\.\d+)?)/);
  const symbolic = q.match(/(>=|<=|>|<)\s*(\d+(?:\.\d+)?)/);

  let operator = null;
  let value = null;

  if (worded) {
    const word = worded[1];
    value = Number(worded[2]);
    if (['greater than', 'more than', 'higher than', 'above', 'over'].includes(word)) operator = 'gt';
    else if (['at least', 'minimum of', 'min'].includes(word)) operator = 'gte';
    else if (['at most', 'maximum of', 'max', 'not more than'].includes(word)) operator = 'lte';
    else operator = 'lt';
  } else if (symbolic) {
    value = Number(symbolic[2]);
    operator = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[symbolic[1]];
  }

  if (operator === null || !Number.isFinite(value)) return null;

  return { operator, value, usePercentage: /percent|percentage|%/.test(q) };
}

function compare(value, { operator, value: target }) {
  if (operator === 'gt') return value > target;
  if (operator === 'gte') return value >= target;
  if (operator === 'lte') return value <= target;
  return value < target;
}

function thresholdWords({ operator, value }, metric) {
  const word = { gt: 'above', gte: 'at least', lt: 'below', lte: 'at most' }[operator];
  return `${word} ${num(value)} ${metric}`;
}

// --------------------------------------------------------------- data lookup

function metricOf(student, usePercentage) {
  return Number(usePercentage ? student.percentage : student.marks);
}

function sortByMarksDesc(students) {
  return [...students].sort((a, b) => Number(b.marks) - Number(a.marks));
}

function subjectNamesFrom(students, analytics) {
  const names = new Set();
  for (const entry of (analytics?.subjectSummary || [])) {
    if (entry?.subjectName) names.add(String(entry.subjectName));
  }
  for (const student of students) {
    const marks = student?.subjectMarks;
    if (marks && typeof marks === 'object') {
      for (const key of Object.keys(marks)) names.add(String(key));
    }
  }
  return [...names];
}

/** Find the one student a question is asking about, by roll number or name. */
function findStudent(question, students) {
  const q = String(question || '').toLowerCase();

  const rollMatch = q.match(/\b(?:roll(?:\s*no\.?|\s*number)?)\s*[:#-]?\s*([a-z0-9/-]+)/);
  if (rollMatch) {
    const roll = rollMatch[1];
    const hit = students.find((s) => String(s.rollNo).toLowerCase() === roll);
    if (hit) return hit;
  }

  // Longest name first, so "Ravi Kumar" wins over a student called "Ravi".
  const byLength = [...students].sort(
    (a, b) => String(b.studentName).length - String(a.studentName).length
  );
  for (const student of byLength) {
    const name = String(student.studentName || '').toLowerCase().trim();
    if (name.length >= 3 && q.includes(name)) return student;
  }

  // Bare roll number: "610 marks", "what did 610 get"
  const bare = q.match(/\b(\d{2,})\b/);
  if (bare) {
    const hit = students.find((s) => String(s.rollNo).toLowerCase() === bare[1]);
    if (hit) return hit;
  }

  return null;
}

function findSubject(question, subjects) {
  const q = String(question || '').toLowerCase();
  const byLength = [...subjects].sort((a, b) => b.length - a.length);
  return byLength.find((name) => name.length >= 3 && q.includes(name.toLowerCase())) || null;
}

// ------------------------------------------------------------------- answers

/**
 * Answer a question from the supplied dataset.
 *
 * @param {string} question         the teacher's free text
 * @param {object} analytics        the analytics document for this upload
 * @param {Array}  students         every student row for this upload
 * @param {object} [options]
 * @param {string} [options.subjectName] the upload's subject label
 * @returns {string} the answer, or '' when the engine cannot answer confidently
 */
function answerQuestionFromData(question, analytics, students, options = {}) {
  const q = String(question || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return '';

  const rows = Array.isArray(students) ? students.filter(Boolean) : [];
  const stats = analytics || {};
  const subjectLabel = options.subjectName || stats.subjectName || 'this upload';
  const total = Number(stats.totalStudents) || rows.length;

  if (!rows.length && !total) {
    return 'There is no student data in this upload yet. Upload a marks file first.';
  }

  const wantsCount = COUNT_RE.test(q);
  const wantsList = LIST_RE.test(q);
  const ranked = sortByMarksDesc(rows);
  const subjects = subjectNamesFrom(rows, stats);
  const isMulti = normalizeReportType(stats.reportType) === 'multiple' || subjects.length > 0;

  const failed = rows.filter((s) => String(s.status).toLowerCase() === 'fail');
  const passed = rows.filter((s) => String(s.status).toLowerCase() === 'pass');
  const weak = rows.filter(
    (s) => Number(s.percentage) < 40 || String(s.category).toLowerCase() === 'weak student'
  );

  // -- 1. a specific subject ------------------------------------------------
  const subject = subjects.length ? findSubject(q, subjects) : null;
  if (subject) {
    const scored = rows
      .map((s) => ({ student: s, mark: Number(s.subjectMarks?.[subject]) }))
      .filter((e) => Number.isFinite(e.mark))
      .sort((a, b) => b.mark - a.mark);

    if (scored.length) {
      if (/\b(top|best|highest|topper|maximum|max)\b/.test(q)) {
        const best = scored[0];
        return `The highest mark in ${subject} is ${num(best.mark)}, scored by ${best.student.studentName} (Roll No ${best.student.rollNo}).`;
      }
      if (/\b(lowest|worst|minimum|min|weakest)\b/.test(q)) {
        const worst = scored[scored.length - 1];
        return `The lowest mark in ${subject} is ${num(worst.mark)}, scored by ${worst.student.studentName} (Roll No ${worst.student.rollNo}).`;
      }
      if (/\b(average|mean|avg)\b/.test(q)) {
        const avg = scored.reduce((sum, e) => sum + e.mark, 0) / scored.length;
        return `The class average in ${subject} is ${num(avg)} (highest ${num(scored[0].mark)}, lowest ${num(scored[scored.length - 1].mark)}, across ${plural(scored.length, 'student')}).`;
      }
      const threshold = parseThreshold(q);
      if (threshold) {
        const hits = scored.filter((e) => compare(e.mark, threshold));
        const phrase = thresholdWords(threshold, `in ${subject}`);
        if (!hits.length) return `No students scored ${phrase}.`;
        return `${plural(hits.length, 'student')} scored ${phrase}: ${hits
          .slice(0, 12)
          .map((e) => `${e.student.studentName} (Roll No ${e.student.rollNo}, ${num(e.mark)})`)
          .join('; ')}${hits.length > 12 ? `; and ${hits.length - 12} more` : ''}.`;
      }
      const avg = scored.reduce((sum, e) => sum + e.mark, 0) / scored.length;
      return `${subject}: average ${num(avg)}, highest ${num(scored[0].mark)} (${scored[0].student.studentName}), lowest ${num(scored[scored.length - 1].mark)} (${scored[scored.length - 1].student.studentName}), across ${plural(scored.length, 'student')}.`;
    }
  }

  // -- 2. how many subjects -------------------------------------------------
  if (/\bsubjects?\b/.test(q) && (wantsCount || /\bwhat\b/.test(q)) && !/(mark|score|average|pass|fail)/.test(q)) {
    if (!subjects.length) {
      return `${subjectLabel} is a single-subject upload, so there is only one subject.`;
    }
    return `This upload covers ${plural(subjects.length, 'subject')}: ${joinWords(subjects)}.`;
  }

  // -- 3. one named student -------------------------------------------------
  const student = findStudent(q, rows);
  if (student) {
    const parts = [
      `${student.studentName} (Roll No ${student.rollNo}) scored ${num(student.marks)} marks (${pct(student.percentage)})`,
      `status ${student.status}`,
      `category ${student.category}`,
    ];
    if (Number.isFinite(Number(student.rank))) {
      parts.push(`rank ${student.rank} of ${total}`);
    }
    let answer = `${parts.join(', ')}.`;
    if (isMulti && student.subjectMarks && Object.keys(student.subjectMarks).length) {
      const perSubject = Object.entries(student.subjectMarks)
        .map(([name, mark]) => `${name} ${num(mark)}`)
        .join(', ');
      answer += ` Subject marks: ${perSubject}.`;
    }
    return answer;
  }

  // -- 4. rank lookup -------------------------------------------------------
  const rankMatch = q.match(/\b(?:rank|position)\s*(?:no\.?|number)?\s*(\d+)\b/) || q.match(/\b(\d+)(?:st|nd|rd|th)\s+(?:rank|position)\b/);
  if (rankMatch) {
    const wanted = Number(rankMatch[1]);
    const hit = ranked[wanted - 1];
    if (!hit) return `There is no student at rank ${wanted} -- this upload has only ${plural(total, 'student')}.`;
    return `Rank ${wanted} is ${describe(hit)}.`;
  }

  // -- 5. an explicit range -------------------------------------------------
  const range = parseRange(q);
  if (range) {
    const metric = range.usePercentage ? 'percentage' : 'marks';
    const hits = rows.filter((s) => {
      const value = metricOf(s, range.usePercentage);
      return Number.isFinite(value) && value >= range.lower && value <= range.upper;
    });
    const band = `between ${num(range.lower)} and ${num(range.upper)} ${metric}`;
    if (!hits.length) return `No students scored ${band}.`;
    if (wantsCount && !wantsList) {
      return `${plural(hits.length, 'student')} scored ${band}.`;
    }
    return `${plural(hits.length, 'student')} scored ${band}: ${listStudents(sortByMarksDesc(hits))}.`;
  }

  // -- 6. an explicit threshold --------------------------------------------
  const threshold = parseThreshold(q);
  if (threshold) {
    const metric = threshold.usePercentage ? 'percentage' : 'marks';
    const hits = rows.filter((s) => {
      const value = metricOf(s, threshold.usePercentage);
      return Number.isFinite(value) && compare(value, threshold);
    });
    const phrase = thresholdWords(threshold, metric);
    if (!hits.length) return `No students scored ${phrase}.`;
    if (wantsCount && !wantsList) {
      return `${plural(hits.length, 'student')} scored ${phrase}.`;
    }
    return `${plural(hits.length, 'student')} scored ${phrase}: ${listStudents(sortByMarksDesc(hits))}.`;
  }

  // -- 7. failures ----------------------------------------------------------
  if (/\b(fail|failed|failing|failure|failures|unsuccessful)\b/.test(q)) {
    const failCount = Number.isFinite(Number(stats.failedStudents)) ? Number(stats.failedStudents) : failed.length;
    if (!failed.length) {
      return failCount > 0
        ? `${plural(failCount, 'student')} failed in ${subjectLabel}.`
        : `No students failed in ${subjectLabel} -- all ${plural(total, 'student')} passed.`;
    }
    const head = `${plural(failed.length, 'student')} failed out of ${total} (${pct(stats.failPercentage ?? (failed.length / total) * 100)}).`;
    if (wantsCount && !wantsList) return head;
    return `${head} They are: ${listStudents(sortByMarksDesc(failed))}.`;
  }

  // -- 8. passes ------------------------------------------------------------
  if (/\b(pass|passed|passing|cleared|successful)\b/.test(q)) {
    const passCount = Number.isFinite(Number(stats.passedStudents)) ? Number(stats.passedStudents) : passed.length;
    const passRate = pct(stats.passPercentage ?? (passCount / (total || 1)) * 100);
    if (/\b(percentage|percent|rate|%)\b/.test(q)) {
      return `The pass percentage for ${subjectLabel} is ${passRate} -- ${passCount} of ${plural(total, 'student')} passed.`;
    }
    const head = `${plural(passCount, 'student')} passed out of ${total} (${passRate}).`;
    if (wantsCount && !wantsList) return head;
    if (!passed.length) return head;
    return `${head} They are: ${listStudents(sortByMarksDesc(passed))}.`;
  }

  // -- 9. weak students / at risk ------------------------------------------
  if (/\b(weak|at risk|at-risk|struggling|poor|need help|needs help|attention)\b/.test(q)) {
    if (!weak.length) {
      return `No students are in the weak band (below 40%) for ${subjectLabel}.`;
    }
    const head = `${plural(weak.length, 'student')} ${weak.length === 1 ? 'is' : 'are'} in the weak band (below 40%).`;
    if (wantsCount && !wantsList) return head;
    return `${head} They are: ${listStudents([...weak].sort((a, b) => Number(a.marks) - Number(b.marks)))}.`;
  }

  // -- 10. highest / lowest mark (a value, not a list) ---------------------
  const asksHighest = /\b(highest|maximum|max|top)\b/.test(q);
  const asksLowest = /\b(lowest|minimum|min|least|worst)\b/.test(q);
  const asksScalarMark = /\b(mark|marks|score|scores|percentage|percent)\b/.test(q);

  if (asksHighest && asksLowest) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    return `The highest mark is ${num(best.marks)} (${best.studentName}, Roll No ${best.rollNo}) and the lowest is ${num(worst.marks)} (${worst.studentName}, Roll No ${worst.rollNo}). The class average is ${num(stats.averageMarks)}.`;
  }

  if (asksLowest && ranked.length) {
    const worst = ranked[ranked.length - 1];
    if (asksScalarMark && !/\b(students|list)\b/.test(q)) {
      return `The lowest mark is ${num(worst.marks)} (${pct(worst.percentage)}), scored by ${worst.studentName} (Roll No ${worst.rollNo}).`;
    }
    const bottom = ranked.slice(-5).reverse();
    return `Lowest scorers: ${listStudents(bottom)}.`;
  }

  if (asksHighest && ranked.length) {
    const best = ranked[0];
    if (asksScalarMark && !/\b(students|list|performers|5|10|three|five)\b/.test(q)) {
      return `The highest mark is ${num(best.marks)} (${pct(best.percentage)}), scored by ${best.studentName} (Roll No ${best.rollNo}).`;
    }
  }

  // -- 11. top performers ---------------------------------------------------
  if (/\b(top|topper|toppers|best|leading|rank list|ranking|performers?)\b/.test(q)) {
    const askedFor = q.match(/\btop\s+(\d+)\b/);
    const limit = askedFor ? Math.max(1, Math.min(Number(askedFor[1]), rows.length)) : 5;
    if (/\btopper\b/.test(q) || /\bwho is (the )?(top|best|first)\b/.test(q)) {
      const best = ranked[0];
      return `The topper is ${describe(best)}.`;
    }
    const top = ranked.slice(0, limit);
    return `Top ${top.length} ${top.length === 1 ? 'student' : 'students'}: ${listStudents(top, limit)}.`;
  }

  // -- 12. average ----------------------------------------------------------
  if (/\b(average|mean|avg)\b/.test(q)) {
    return `The class average for ${subjectLabel} is ${num(stats.averageMarks)} (${pct(stats.averageMarks)}). The highest mark is ${num(stats.highestMarks)} and the lowest is ${num(stats.lowestMarks)}, across ${plural(total, 'student')}.`;
  }

  // -- 13. distribution / grades / categories ------------------------------
  if (/\b(distribution|spread|bands?|grades?|categor(y|ies)|breakdown)\b/.test(q)) {
    const d = stats.marksDistribution || {};
    const bands = [
      ['0-35%', d.range_0_35],
      ['36-50%', d.range_36_50],
      ['51-70%', d.range_51_70],
      ['71-85%', d.range_71_85],
      ['86-100%', d.range_86_100],
    ].filter(([, count]) => Number.isFinite(Number(count)));
    if (!bands.length) return '';
    return `Marks distribution for ${subjectLabel}: ${bands.map(([label, count]) => `${label}: ${count}`).join(', ')}.`;
  }

  // -- 14. how many students in total --------------------------------------
  if (/\bstudents?\b/.test(q) && (wantsCount || /\btotal\b/.test(q))) {
    return `There ${total === 1 ? 'is' : 'are'} ${plural(total, 'student')} in ${subjectLabel}. ${stats.passedStudents ?? passed.length} passed and ${stats.failedStudents ?? failed.length} failed.`;
  }

  // -- 15. general summary --------------------------------------------------
  if (/\b(summary|overview|overall|how did|performance|result|results|analysis|report)\b/.test(q)) {
    const best = ranked[0];
    return `${subjectLabel}: ${plural(total, 'student')}, class average ${num(stats.averageMarks)} (${pct(stats.averageMarks)}), pass percentage ${pct(stats.passPercentage)}. ${stats.passedStudents ?? passed.length} passed, ${stats.failedStudents ?? failed.length} failed. Highest ${num(stats.highestMarks)}${best ? ` (${best.studentName})` : ''}, lowest ${num(stats.lowestMarks)}.`;
  }

  // -- 16. a bare list request ---------------------------------------------
  if (/\b(all students|every student|full list|student list|list of students)\b/.test(q)) {
    return `All ${plural(total, 'student')}: ${listStudents(ranked, 20)}.`;
  }

  return '';
}

module.exports = {
  answerQuestionFromData,
  parseRange,
  parseThreshold,
  findStudent,
};
