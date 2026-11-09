// Standards beyond computer science (docs/decisions.md "Standards beyond computer science", 9 Nov 2026): Common Core
// Math and ELA tags on a teacher's own lessons and steps (table lesson_standards, migration 0064), the codes Oomba's
// official games / live modes / Number Quest practise (server/standards/official-tags.js), and the class Standards tab's
// CCSS view: coverage (which codes the class's assigned lessons, their games, its live runs and the courses its
// students are in hit) and per-student mastery from work that is already recorded. Nothing new is stored about students.
// The CSTA view (services/standards.js) is untouched.
//
// Evidence, per student and code (only the class's active students, only work in this class):
//   practiced   a finished step (status 'done') of an assigned lesson whose step or lesson is tagged with the code, or
//               a finished game step playing an official game that practises it; a Number Quest step completed.
//   checked     right / answered questions about the code: lesson quiz items (an item's own `cat` when it is a code of
//               the framework, else the quiz step's / lesson's tags), live-run items the same way, a whole live run's
//               correct / answered when the run's mode practises the code (Tug of Math Live at its grade) or the run
//               plays a tagged step, and a Number Quest step's 3-question check (check_score of 3).
//   rubric      scores from rubric sources (registerRubricSource below): none are built in. The rubrics work plugs in
//               here without this module knowing its tables.
// A student meets a code with >= 80% right over >= 3 answered questions, or a best rubric score >= 2/3 of its maximum.
// The class row reads "Meets" when >= 80% of the class's students meet it (the CSTA tab's rule).
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as FW from '../standards/frameworks.js';
import * as OT from '../standards/official-tags.js';

export const MEETS_PCT = 80;
export const MEETS_SHARE = 0.8;
export const MIN_ANSWERED = 3;
export const RUBRIC_MEETS = 2 / 3;
export const MAX_TAGS = 60;
export const LEVELS = Object.freeze(['none', 'practiced', 'developing', 'meets']);
export const STATUSES = Object.freeze(['notYet', 'covered', 'practiced', 'checked', 'meets']);
/** Step kinds a lesson-level tag counts as practice for (a step-level tag counts on any step it is put on). */
const LESSON_TAG_KINDS = new Set(['game', 'question', 'build']);
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const parse = (s, d) => { try { const x = JSON.parse(s || ''); return x == null ? d : x; } catch { return d; } };

// ---------------------------------------------------------------- teacher tags
/** A lesson's tags: [{ step_id ('' = the lesson), framework, code }] in file order per framework. */
export function lessonTags(lessonId, framework = null) {
  const rows = q.all(`SELECT step_id, framework, code, created_at FROM lesson_standards WHERE lesson_id=?${framework ? ' AND framework=?' : ''}`, ...(framework ? [lessonId, framework] : [lessonId]));
  const order = r => { const fw = FW.CCSS[r.framework]; const s = fw && fw.byId(r.code); return s ? fw.all().indexOf(s) : 1e9; };
  return rows.sort((a, b) => a.framework.localeCompare(b.framework) || order(a) - order(b) || a.created_at - b.created_at);
}
/** Tags of many lessons at once: Map lessonId -> rows. */
function tagsOfLessons(ids, framework) {
  const m = new Map(ids.map(id => [id, []]));
  if (!ids.length) return m;
  for (const r of q.all(`SELECT lesson_id, step_id, code FROM lesson_standards WHERE framework=? AND lesson_id IN (${ids.map(() => '?').join(',')})`, framework, ...ids)) m.get(r.lesson_id).push(r);
  return m;
}
/** Tag a lesson (stepId '' / null) or one of its steps with a Common Core code. Only someone who can edit the lesson. */
export function addTag(u, lessonId, { framework, code, stepId = '' } = {}) {
  const l = L.getLesson(lessonId);
  if (!L.canEditLesson(u, l)) return fail('notFound');
  if (!FW.isCcss(framework)) return fail('badFramework');
  const c = FW.ccssCode(code, framework); if (!c) return fail('badCode');
  const sid = stepId ? String(stepId) : '';
  if (sid) { const s = L.getStep(sid); if (!s || s.lesson_id !== l.id) return fail('badStep'); }
  if (q.get('SELECT 1 FROM lesson_standards WHERE lesson_id=? AND step_id=? AND framework=? AND code=?', l.id, sid, framework, c.code)) return ok({ code: c.code, added: false });
  if (q.get('SELECT COUNT(*) n FROM lesson_standards WHERE lesson_id=?', l.id).n >= MAX_TAGS) return fail('tooMany');
  q.run('INSERT INTO lesson_standards(lesson_id, step_id, framework, code, added_by, created_at) VALUES (?,?,?,?,?,?)', l.id, sid, framework, c.code, u.id, now());
  audit(u.id, 'lesson.standard_add', l.id, { framework, code: c.code, step: sid || undefined });
  return ok({ code: c.code, added: true });
}
export function removeTag(u, lessonId, { framework, code, stepId = '' } = {}) {
  const l = L.getLesson(lessonId);
  if (!L.canEditLesson(u, l)) return fail('notFound');
  const c = FW.isCcss(framework) ? FW.ccssCode(code, framework) : null; if (!c) return fail('badCode');
  const r = q.run('DELETE FROM lesson_standards WHERE lesson_id=? AND step_id=? AND framework=? AND code=?', l.id, stepId ? String(stepId) : '', framework, c.code);
  if (r.changes) audit(u.id, 'lesson.standard_remove', l.id, { framework, code: c.code, step: stepId || undefined });
  return ok({ removed: r.changes > 0 });
}

// ---------------------------------------------------------------- rubric sources (an interface, nothing built in)
/**
 * A rubric source gives scored rubric evidence for a class: fn({ classId, framework, studentIds: Set }) ->
 * [{ userId, code, score, max, at? }] where score is 0..max (e.g. a 0-3 mark with max 3). Unknown codes, other
 * students and bad numbers are ignored. The rubrics work registers one; this module never reads its tables.
 */
const rubricSources = [];
export const registerRubricSource = fn => { if (typeof fn === 'function' && !rubricSources.includes(fn)) rubricSources.push(fn); return () => { const i = rubricSources.indexOf(fn); if (i >= 0) rubricSources.splice(i, 1); }; };

// ---------------------------------------------------------------- the class view
const blank = () => ({ practiced: false, right: 0, answered: 0, rubric: [], last: 0 });

/**
 * The class's Common Core picture in one framework:
 * { framework, classId, students: [{ id, name, noData }], lessons: [classLesson], grades: [grade with any code],
 *   rows: [row], summary: [{ grade, covered, total }] } where a row is
 * { id, grade, domain, parent, statement, sources: { lessons: [clId], games: [slug], live: n, courses: [slug] },
 *   practiced, right, answered, pct | null, checkedStudents, rubricMean (0-1) | null, rubricN, meets, needsLook: [userId],
 *   last | null, status, by: Map userId -> { practiced, right, answered, pct | null, rubric: { best, n } | null, level } }.
 * Rows: every code with a source or evidence; grade: also every top-level code of that grade.
 */
export function classView(classId, framework, { grade = '' } = {}) {
  const fw = FW.CCSS[framework];
  if (!fw) throw new Error(`not a CCSS framework: ${framework}`);
  const lessons = L.classLessons(classId);
  const students = S.roster(classId).filter(p => p.role === 'student');
  const sid = new Set(students.map(p => p.id));
  const seen = new Set();
  const lessonIds = [...new Set(lessons.map(cl => cl.lesson_id))];
  const steps = lessonIds.length ? q.all(`SELECT s.id, s.lesson_id, s.kind, s.items, g.slug game_slug, g.source game_source FROM lesson_steps s LEFT JOIN games g ON g.id=s.game_id
    WHERE s.lesson_id IN (${lessonIds.map(() => '?').join(',')})`, ...lessonIds) : [];
  const tags = tagsOfLessons(lessonIds, framework);
  const valid = c => (fw.isId(c) ? fw.byId(c).id : null);
  // A lesson's grade ("3", "Grade 3", "K"): Tug of Math is played at a grade, so its step practises that grade's codes.
  const gradeOf = new Map(lessons.map(cl => { const m = /^\s*(?:grade\s*)?(k|[1-8])\b/i.exec(String(cl.grade || '')); return [cl.lesson_id, m ? m[1].toUpperCase() : '']; }));
  // Per step: practice codes, quiz item codes, run codes (a live run that plays the step), and its official game.
  const stepInfo = new Map();
  for (const s of steps) {
    const t = tags.get(s.lesson_id) || [];
    const own = t.filter(x => x.step_id === s.id).map(x => x.code), whole = t.filter(x => !x.step_id).map(x => x.code);
    const game = s.kind === 'game' && s.game_source === 'seed' ? OT.stepGameCodes(s.game_slug, framework, gradeOf.get(s.lesson_id)) : [];
    const practice = [...new Set([...own, ...(LESSON_TAG_KINDS.has(s.kind) ? whole : []), ...game])];
    const fallback = [...new Set([...own, ...whole])];
    const items = s.kind === L.QUIZ_KIND ? L.quizItemsOf(s).map(it => { const c = it && typeof it.cat === 'string' ? valid(it.cat) : null; return c ? [c] : fallback; }) : [];
    stepInfo.set(s.id, { ...s, practice, items, run: [...new Set([...own, ...whole, ...game])], game: game.length ? s.game_slug : null });
  }
  // Coverage: which assigned lessons / official games / live runs / courses hit each code.
  const src = new Map();
  const cover = code => { if (!src.has(code)) src.set(code, { lessons: new Set(), games: new Set(), live: new Set(), courses: new Set() }); return src.get(code); };
  const clOf = new Map(lessons.map(cl => [cl.lesson_id, cl.id]));
  for (const s of stepInfo.values()) {
    const clId = clOf.get(s.lesson_id);
    for (const c of new Set([...s.practice, ...s.items.flat(), ...s.run])) cover(c).lessons.add(clId);
    if (s.game) for (const c of OT.stepGameCodes(s.game, framework, gradeOf.get(s.lesson_id))) cover(c).games.add(s.game);
  }
  for (const r of tags.values()) for (const x of r) if (!x.step_id) for (const cl of lessons.filter(y => y.lesson_id === x.lesson_id)) cover(x.code).lessons.add(cl.id);

  const ev = new Map();
  const cell = (code, u) => { if (!ev.has(code)) ev.set(code, new Map()); const m = ev.get(code); if (!m.has(u)) m.set(u, blank()); return m.get(u); };
  const mark = (code, u, right, answered, at) => { const c = cell(code, u); c.right += right; c.answered += answered; c.last = Math.max(c.last, at || 0); };
  // Lesson work.
  const prog = classId ? q.all(`SELECT p.step_id, p.user_id, p.status, p.marks, p.done_at, p.updated_at FROM step_progress p
    JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id WHERE c.class_id=?`, classId) : [];
  for (const r of prog) {
    if (!sid.has(r.user_id)) continue;
    seen.add(r.user_id);
    const s = stepInfo.get(r.step_id); if (!s) continue;
    const at = r.done_at || r.updated_at || 0;
    if (r.status === 'done' && s.kind !== L.QUIZ_KIND) for (const c of s.practice) { const x = cell(c, r.user_id); x.practiced = true; x.last = Math.max(x.last, at); }
    if (s.kind === L.QUIZ_KIND) {
      const ms = String(r.marks || '');
      s.items.forEach((codes, i) => { const m = ms[i]; if (m !== '1' && m !== '0') return; for (const c of codes) mark(c, r.user_id, m === '1' ? 1 : 0, 1, r.updated_at || at); });
    }
  }
  // Live runs in the class.
  const runs = classId ? q.all(`SELECT r.id, r.mode, r.settings, r.items, r.step_id, r.ended_at, sc.user_id, sc.correct, sc.answered, sc.marks FROM live_runs r
    JOIN live_run_scores sc ON sc.run_id=r.id WHERE r.class_id=?`, classId) : [];
  const runCodes = new Map();
  for (const r of runs) {
    if (!runCodes.has(r.id)) {
      const items = parse(r.items, []);
      const itemCodes = Array.isArray(items) ? items.map(it => (it && typeof it.cat === 'string' ? valid(it.cat) : null)) : [];
      const whole = [...new Set([...OT.liveRunCodes(r.mode, parse(r.settings, {})).map(valid).filter(Boolean), ...(r.step_id && stepInfo.has(r.step_id) ? stepInfo.get(r.step_id).run : [])])];
      runCodes.set(r.id, { itemCodes, whole });
      for (const c of new Set([...itemCodes.filter(Boolean), ...whole])) cover(c).live.add(r.id);
    }
    if (!sid.has(r.user_id)) continue;
    seen.add(r.user_id);
    const { itemCodes, whole } = runCodes.get(r.id);
    if (itemCodes.some(Boolean)) {
      const ms = String(r.marks || '');
      itemCodes.forEach((c, i) => { if (c && (ms[i] === '1' || ms[i] === '0')) mark(c, r.user_id, ms[i] === '1' ? 1 : 0, 1, r.ended_at); });
    } else if (whole.length && r.answered > 0) {
      for (const c of whole) mark(c, r.user_id, Math.min(r.correct || 0, r.answered), r.answered, r.ended_at);
    }
  }
  // Courses the class's students are in (Number Quest: Math).
  for (const [slug, info] of Object.entries(OT.COURSES)) {
    if (info.framework !== framework || !students.length) continue;
    const map = info.steps();
    const rows = q.all(`SELECT user_id, step, read_at, checked_at, check_score, completed_at, played_at FROM course_progress WHERE course=? AND user_id IN (${students.map(() => '?').join(',')})`, slug, ...students.map(p => p.id));
    for (const r of rows) {
      const codes = map.get(r.step); if (!codes) continue;
      for (const c of codes) cover(c).courses.add(slug);
      const at = Math.max(r.completed_at || 0, r.checked_at || 0, r.read_at || 0, r.played_at || 0);
      if (r.completed_at || (r.read_at && r.checked_at)) for (const c of codes) { const x = cell(c, r.user_id); x.practiced = true; x.last = Math.max(x.last, at); }
      if (r.checked_at) for (const c of codes) mark(c, r.user_id, Math.max(0, Math.min(3, r.check_score || 0)), 3, r.checked_at);
    }
  }
  // Rubric sources.
  for (const fn of rubricSources) {
    let list = [];
    try { list = fn({ classId, framework, studentIds: new Set(sid) }) || []; } catch { list = []; }
    for (const x of Array.isArray(list) ? list : []) {
      const c = x && valid(x.code); if (!c || !sid.has(x.userId)) continue;
      const max = +x.max, score = +x.score;
      if (!(max > 0) || !Number.isFinite(score) || score < 0 || score > max) continue;
      seen.add(x.userId);
      const e = cell(c, x.userId); e.rubric.push(score / max); e.last = Math.max(e.last, +x.at || 0);
    }
  }

  const G = grade && fw.grades.includes(String(grade).toUpperCase()) ? String(grade).toUpperCase() : '';
  const ids = new Set([...src.keys(), ...ev.keys()]);
  if (G) for (const s of fw.all({ grade: G, top: true })) ids.add(s.id);
  const m = students.length;
  const rows = fw.sort([...ids]).map(id => {
    const s = fw.byId(id), e = ev.get(id) || new Map(), so = src.get(id);
    const by = new Map();
    let practiced = 0, right = 0, answered = 0, checkedStudents = 0, rubricSum = 0, rubricN = 0, meets = 0, last = 0; const needsLook = [];
    for (const p of students) {
      const c = e.get(p.id);
      if (!c) { by.set(p.id, { practiced: false, right: 0, answered: 0, pct: null, rubric: null, level: 'none' }); continue; }
      if (c.practiced) practiced++;
      if (c.answered) { checkedStudents++; right += c.right; answered += c.answered; if (c.answered >= 2 && c.right === 0) needsLook.push(p.id); }
      const pct = c.answered ? Math.round((100 * c.right) / c.answered) : null;
      const rubric = c.rubric.length ? { best: Math.max(...c.rubric), n: c.rubric.length } : null;
      if (rubric) { rubricSum += c.rubric.reduce((a, b) => a + b, 0); rubricN += c.rubric.length; }
      const yes = (c.answered >= MIN_ANSWERED && pct >= MEETS_PCT) || (rubric && rubric.best >= RUBRIC_MEETS - 1e-9);
      const level = yes ? 'meets' : c.answered || rubric ? 'developing' : c.practiced ? 'practiced' : 'none';
      if (yes) meets++;
      last = Math.max(last, c.last);
      by.set(p.id, { practiced: c.practiced, right: c.right, answered: c.answered, pct, rubric, level });
    }
    const sources = { lessons: so ? [...so.lessons] : [], games: so ? [...so.games] : [], live: so ? so.live.size : 0, courses: so ? [...so.courses] : [] };
    const covered = sources.lessons.length || sources.games.length || sources.live || sources.courses.length;
    const status = m && meets && meets >= MEETS_SHARE * m ? 'meets' : checkedStudents || rubricN ? 'checked' : practiced ? 'practiced' : covered ? 'covered' : 'notYet';
    return { id, grade: s.grade, domain: s.domain, parent: s.parent || null, statement: s.statement, sources, practiced, right, answered,
      pct: answered ? Math.round((100 * right) / answered) : null, checkedStudents, rubricMean: rubricN ? Math.round((100 * rubricSum) / rubricN) / 100 : null, rubricN,
      meets, needsLook, last: last || null, status, by };
  });
  // Coverage per grade: top-level codes hit (themselves or through a sub-standard) out of the grade's top-level codes.
  const hit = new Set(rows.filter(r => r.status !== 'notYet').map(r => r.parent || r.id));
  const grades = fw.grades.filter(g => rows.some(r => r.grade === g && r.status !== 'notYet') || g === G);
  const summary = grades.map(g => { const top = fw.all({ grade: g, top: true }); return { grade: g, covered: top.filter(s => hit.has(s.id)).length, total: top.length }; });
  return { framework, classId, students: students.map(p => ({ id: p.id, name: p.roster_name || p.display_name, noData: !seen.has(p.id) })), lessons, grades, grade: G, rows, summary };
}

/** One student's codes in a class (the drill-down): the rows with only that student's cell. */
export const studentRows = (view, userId) => view.rows.map(r => ({ ...r, me: r.by.get(userId) || null }));
