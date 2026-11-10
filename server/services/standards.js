// CS Quest: the class Standards tab (plan section 9.4, P12; docs/cs-quest.md "Standards tab"). Teachers only. For each
// CSTA id it counts three honest tiers per student of the class and shows them per class:
//   Practiced  the student finished an activity whose step standards carry the id: a game step done, a question step
//              answered, a build step handed in (status 'done' on game / question / build steps; never a quiz step).
//   Checked    exit-ticket items whose cat is the id: lesson quiz steps (step_progress.marks x items[i].cat) and live runs
//              of a derived "exit ticket" set (live_run_scores.marks x live_runs.items[i].cat). Accuracy is right / answered
//              over every such item; a student *meets* when, on the MOST RECENT ticket that asked the id, >= 2 of the items
//              tagged with it are right, or all of them when fewer than 2 are tagged (brief, decision 1 / CA-5).
//   Applied    rubric marks 0-3 on question / build steps whose rubric line carries the id (P11); a student meets with a
//              mark >= 2 on any such line.
// A student meets the standard when Checked OR Applied meets; the class row reads "Meets" when >= 80% of its students do.
// Nothing new is stored: everything is read from step_progress / live_run_scores of the class's assigned lessons and
// runs, for the class's active students. A student with no work in the class at all shows "no data", never 0.
// Coverage is claimed per class (pairs: only the signed-in student counts). Deleted with the class (hook below).
import { q } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as CSTA from '../standards/csta.js';

export const MEETS_SHARE = 0.8;
export const APPLIED_MIN = 2;
export const STATUSES = Object.freeze(['notYet', 'assigned', 'practiced', 'checked', 'meets']);
const PRACTICE_KINDS = new Set(['game', 'question', 'build']);
/** Derived exit-ticket sets (lesson-templates.js setTitles: "CSQ 1.2 exit ticket (3-5)"), subject 'cs-quest'. */
const EXIT_SET = "ls.subject='cs-quest' AND ls.title LIKE 'CSQ % exit ticket %'";

const parse = (s, d) => { try { const x = JSON.parse(s || ''); return x == null ? d : x; } catch { return d; } };
const idsOf = text => CSTA.parseList(text || '').ids;
const catOf = it => (it && typeof it.cat === 'string' && CSTA.isId(it.cat) ? CSTA.normId(it.cat) : null);
const round1 = x => Math.round(x * 10) / 10;

/** Every tag in one lesson step: { practice: [ids], items: [id|null per quiz item], rubric: [[ids] per line] }. */
function tagsOf(step) {
  return {
    practice: PRACTICE_KINDS.has(step.kind) ? idsOf(step.standards) : [],
    items: step.kind === L.QUIZ_KIND ? L.quizItemsOf(step).map(catOf) : [],
    rubric: L.RUBRIC_KINDS.includes(step.kind) ? L.rubricOf(step).map(r => (r.ids || []).filter(CSTA.isId).map(CSTA.normId)) : [],
  };
}
const blank = () => ({ practiced: false, checks: [], right: 0, answered: 0, marks: [], last: 0 });

/**
 * The class's standards: { classId, students: [{ id, name, username, noData }], lessons: [classLesson],
 * levels: ['1B', '2'] (from the tags of the assigned lessons), rows: [row] } where a row is
 * { id, level, concept, subconcept, statement, lessons: [clId], practiced: n, checkedPct: % | null, items, checkedStudents,
 *   right, answered, appliedMean: 0-3 | null, marked, marksN, marksSum, needsLook: [userId], meets: n, last: ms | null, status,
 *   by: Map userId -> { practiced, checked: { right, answered, pct, ticket: { tagged, right }, meets } | null,
 *                       applied: { mean, best, n, meets } | null, meets } }.
 * all: every one of the 44 ids, not only the levels the class's lessons tag.
 */
export function classStandards(classId, { all = false } = {}) {
  const lessons = L.classLessons(classId);
  const students = S.roster(classId).filter(p => p.role === 'student');
  const sid = new Set(students.map(p => p.id));
  const byLesson = new Map(lessons.map(cl => [cl.lesson_id, cl]));
  const steps = lessons.length ? q.all(`SELECT id, lesson_id, kind, standards, rubric, items FROM lesson_steps WHERE lesson_id IN (${lessons.map(() => '?').join(',')})`, ...lessons.map(cl => cl.lesson_id)) : [];
  const tags = new Map(steps.map(s => [s.id, tagsOf(s)]));
  const kindOf = new Map(steps.map(s => [s.id, s.kind]));
  // Which assigned lessons tag each id (any step: standards, quiz cat, rubric line).
  const lessonsOf = new Map();
  for (const s of steps) {
    const t = tags.get(s.id), cl = byLesson.get(s.lesson_id);
    for (const id of new Set([...t.practice, ...t.items.filter(Boolean), ...t.rubric.flat()])) {
      if (!lessonsOf.has(id)) lessonsOf.set(id, new Set());
      lessonsOf.get(id).add(cl.id);
    }
  }
  // per id -> per student evidence; asked items per id (distinct "source:index")
  const ev = new Map(), asked = new Map(), seen = new Set();
  const cell = (id, u) => { if (!ev.has(id)) ev.set(id, new Map()); const m = ev.get(id); if (!m.has(u)) m.set(u, blank()); return m.get(u); };
  const ask = (id, key) => { if (!asked.has(id)) asked.set(id, new Set()); asked.get(id).add(key); };
  const ticket = (u, src, cats, marks, at) => {
    const per = new Map();
    cats.forEach((id, i) => {
      if (!id) return; const m = marks[i];
      const x = per.get(id) || { tagged: 0, right: 0, answered: 0 }; x.tagged++;
      if (m === '1' || m === '0') { x.answered++; ask(id, `${src}:${i}`); }
      if (m === '1') x.right++;
      per.set(id, x);
    });
    for (const [id, x] of per) {
      if (!x.answered) continue;
      const c = cell(id, u); c.right += x.right; c.answered += x.answered; c.checks.push({ at, tagged: x.tagged, right: x.right }); c.last = Math.max(c.last, at);
    }
  };
  const rows = classId ? q.all(`SELECT p.class_lesson_id cl, p.step_id, p.user_id, p.status, p.marks, p.done_at, p.updated_at, p.reviewed_at FROM step_progress p
    JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=?`, classId) : [];
  for (const r of rows) {
    if (!sid.has(r.user_id)) continue;
    seen.add(r.user_id);
    const t = tags.get(r.step_id), kind = kindOf.get(r.step_id); if (!t) continue;
    const at = r.done_at || r.updated_at || 0;
    if (r.status === 'done' && PRACTICE_KINDS.has(kind)) for (const id of t.practice) { const c = cell(id, r.user_id); c.practiced = true; c.last = Math.max(c.last, at); }
    if (kind === L.QUIZ_KIND && t.items.length) ticket(r.user_id, `s${r.step_id}@${r.cl}`, t.items, String(r.marks || ''), r.updated_at || at);
    if (t.rubric.length) {
      const ms = String(r.marks || '');
      t.rubric.forEach((ids, i) => { if (!/^[0-3]$/.test(ms[i] || '')) return; for (const id of ids) { const c = cell(id, r.user_id); c.marks.push(+ms[i]); c.last = Math.max(c.last, r.reviewed_at || r.updated_at || 0); } });
    }
  }
  // Live runs of exit-ticket sets in this class: the saved items keep cat (classlive-results itemRow).
  const live = classId ? q.all(`SELECT r.id, r.items, r.ended_at, sc.user_id, sc.marks FROM live_runs r JOIN live_run_scores sc ON sc.run_id=r.id
    JOIN live_sets ls ON ls.id=r.set_id WHERE r.class_id=? AND ${EXIT_SET}`, classId) : [];
  for (const r of live) {
    if (!sid.has(r.user_id)) continue;
    seen.add(r.user_id);
    const items = parse(r.items, []); if (!Array.isArray(items)) continue;
    ticket(r.user_id, `r${r.id}`, items.map(catOf), String(r.marks || ''), r.ended_at || 0);
  }
  // Any other live score in the class also means the student has work here (so they are not "no data").
  if (classId) for (const r of q.all('SELECT DISTINCT sc.user_id FROM live_run_scores sc JOIN live_runs r ON r.id=sc.run_id WHERE r.class_id=?', classId)) if (sid.has(r.user_id)) seen.add(r.user_id);

  const levels = [...new Set([...lessonsOf.keys(), ...ev.keys()].map(id => (CSTA.byId(id) || {}).level).filter(Boolean))].sort();
  const list = all || !levels.length ? CSTA.all() : CSTA.all().filter(s => levels.includes(s.level));
  const m = students.length;
  const out = list.map(s => {
    const e = ev.get(s.id) || new Map();
    const by = new Map();
    let practiced = 0, right = 0, answered = 0, checkedStudents = 0, marked = 0, marksN = 0, marksSum = 0, meets = 0, last = 0; const needsLook = [];
    for (const p of students) {
      const c = e.get(p.id);
      if (!c) { by.set(p.id, { practiced: false, checked: null, applied: null, meets: false }); continue; }
      if (c.practiced) practiced++;
      let checked = null, applied = null;
      if (c.answered) {
        checkedStudents++; right += c.right; answered += c.answered;
        const latest = c.checks.reduce((a, b) => (b.at >= a.at ? b : a));
        const ok = latest.tagged >= 2 ? latest.right >= 2 : latest.right === latest.tagged;
        checked = { right: c.right, answered: c.answered, pct: Math.round((100 * c.right) / c.answered), ticket: { tagged: latest.tagged, right: latest.right }, meets: ok };
        if (c.answered >= 2 && c.right === 0) needsLook.push(p.id);
      }
      if (c.marks.length) {
        marked++; marksN += c.marks.length; marksSum += c.marks.reduce((a, b) => a + b, 0);
        const best = Math.max(...c.marks);
        applied = { mean: round1(c.marks.reduce((a, b) => a + b, 0) / c.marks.length), best, n: c.marks.length, meets: best >= APPLIED_MIN };
      }
      const yes = !!((checked && checked.meets) || (applied && applied.meets));
      if (yes) meets++;
      last = Math.max(last, c.last);
      by.set(p.id, { practiced: c.practiced, checked, applied, meets: yes });
    }
    const ls = [...(lessonsOf.get(s.id) || [])];
    const status = m && meets && meets >= MEETS_SHARE * m ? 'meets' : checkedStudents ? 'checked' : practiced ? 'practiced' : ls.length ? 'assigned' : 'notYet';
    return { id: s.id, level: s.level, concept: s.concept, subconcept: s.subconcept, statement: s.statement, lessons: ls,
      practiced, checkedPct: answered ? Math.round((100 * right) / answered) : null, items: (asked.get(s.id) || new Set()).size, checkedStudents, right, answered,
      appliedMean: marksN ? round1(marksSum / marksN) : null, marked, marksN, marksSum, needsLook, meets, last: last || null, status, by };
  });
  return { classId, students: students.map(p => ({ id: p.id, name: p.roster_name || p.display_name, username: p.username, noData: !seen.has(p.id) })), lessons, levels, rows: out };
}

/**
 * The principal's coverage report for a school: aggregate only, never a student name. Per id across the school's
 * (unarchived) classes: { id, level, concept, statement, classes (that were assigned a lesson tagging it), lessons:
 * [{ title, first (earliest open / assigned date) }], items (asked), right, answered, pct, appliedMean, marksN, meetsClasses }.
 * -> { classes: [{ id, name, students }], rows }.
 */
export function schoolReport(schoolId, { all = false } = {}) {
  const classes = S.classesOfSchool(schoolId);
  const per = classes.map(c => ({ c, r: classStandards(c.id, { all: true }) }));
  const levels = [...new Set(per.flatMap(x => x.r.levels))].sort();
  const list = all || !levels.length ? CSTA.all() : CSTA.all().filter(s => levels.includes(s.level));
  const rows = list.map(s => {
    const lessons = new Map(); let nClasses = 0, items = 0, right = 0, answered = 0, marksN = 0, marksSum = 0, meetsClasses = 0;
    for (const { r } of per) {
      const row = r.rows.find(x => x.id === s.id); if (!row) continue;
      if (row.lessons.length) nClasses++;
      for (const clId of row.lessons) {
        const cl = r.lessons.find(x => x.id === clId); if (!cl) continue;
        const at = cl.opens_at || cl.assigned_at; const was = lessons.get(cl.title);
        if (!was || at < was) lessons.set(cl.title, at);
      }
      items += row.items; right += row.right; answered += row.answered; marksN += row.marksN; marksSum += row.marksSum;
      if (row.status === 'meets') meetsClasses++;
    }
    return { id: s.id, level: s.level, concept: s.concept, statement: s.statement, classes: nClasses,
      lessons: [...lessons].map(([title, first]) => ({ title, first })).sort((a, b) => a.first - b.first),
      items, right, answered, pct: answered ? Math.round((100 * right) / answered) : null, appliedMean: marksN ? round1(marksSum / marksN) : null, marksN, meetsClasses };
  });
  return { classes: per.map(({ c, r }) => ({ id: c.id, name: c.name, students: r.students.length })), levels, rows };
}

// ---------------------------------------------------------------- deletion
/** Class data the tab reads, when a class is deleted ({ classId } only): rows of step_progress whose assignment is gone
 *  (schools.deleteClass removes class_lessons first), so rubric marks and answers never outlive their class. A student
 *  leaving keeps their work with the school exactly like the gradebook (restorable when they come back): the tab only
 *  ever counts active members, so nothing is shown for them. Account merges move step_progress in schools.js. */
export function forgetClass({ classId, userId = null } = {}) {
  if (!classId || userId) return;
  q.run('DELETE FROM step_progress WHERE class_lesson_id NOT IN (SELECT id FROM class_lessons)');
}
S.onClassLeave(forgetClass);
