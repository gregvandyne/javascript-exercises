// Typing Pets for teachers: each student's typing progress, read from the game's own cloud save (seed-games/typing-pets.html,
// BRB.storage key 'typing-pets-v1'), so practice at home or in free play shows up too, not only assigned lesson steps.
// The save is written by the game in the student's browser, so everything read here is checked and clamped: a tampered
// save can only show odd numbers for that one student, never break the page or show anything but numbers and known keys.
// Who may see it is the caller's job (routes/progress.js checkPage: the class's own teachers and school leaders).
import * as games from './games.js';
import { q } from '../db.js';

export const SLUG = 'typing-pets';
export const SAVE_KEY = 'typing-pets-v1';
/** The game's lessons, in order (LESSONS in the game; tests/unit/typing.test.js checks the two agree). */
export const LESSONS = Array.from({ length: 28 }, (_, i) => `l${String(i + 1).padStart(2, '0')}`);
/** The game's lesson names, in order (the Assign picker; the game's own LESSONS hold the same). */
export const LESSON_NAMES = ['F and J', 'D and K', 'S and L', 'A and ;', 'Home row words', 'G and H', 'E and I', 'R and U',
  'T and Y', 'W and O', 'Q and P', 'Top row words', 'V and M', 'C and comma', 'B and N', 'X, Z and period', 'Every row words',
  'Big letters', 'Sentences', 'Speed run', '4 and 7', '5 and 6', '3 and 8', '2 and 9', '1 and 0', 'Words and numbers', '? and !', "' and -"];
/** The timed tests (minutes), chapter ids t1, t3, t5. */
export const TESTS = [1, 3, 5];
const KEYS = new Set("abcdefghijklmnopqrstuvwxyz0123456789;,./'-".split(''));
const MAX_WPM = 200;

const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** The last 7 days' practice from a save's days ({ 'YYYY-MM-DD': seconds }, the student's own calendar day):
 *  [{ day, secs }] for days within a week of today (a day either side of the server's date, for time zones). */
export function practiceDays(raw, today = Date.now()) {
  const d = obj(raw), out = [];
  for (const [k, v] of Object.entries(d)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const at = Date.parse(`${k}T12:00:00Z`);
    if (!Number.isFinite(at) || at > today + 1.5 * 864e5 || at < today - 7.5 * 864e5) continue;
    out.push({ day: k, secs: int(v, 0, 86400) });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-8);
}
/** One save (the stored JSON string or object) -> a clean summary, or null when the student hasn't typed yet. */
export function summarize(raw) {
  let s = raw;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { return null; } }
  s = obj(s);
  const done = obj(s.done);
  const lessons = LESSONS.filter(id => done[id] && typeof done[id] === 'object').map(id => {
    const d = done[id];
    return { id, n: LESSONS.indexOf(id) + 1, stars: int(d.s, 1, 3), wpm: int(d.w, 0, MAX_WPM), acc: int(d.a, 0, 100), tries: int(d.n, 1, 100000), at: int(d.t, 0, 8.64e15) };
  });
  // Timed tests: the best run of each length, and the overall best speed in any test with its accuracy.
  const tests = obj(s.tests);
  const testBest = TESTS.map(m => { const r = obj(tests[`t${m}`]); return r.w !== undefined ? { min: m, wpm: int(r.w, 0, MAX_WPM), acc: int(r.a, 0, 100), runs: int(r.n, 1, 100000) } : null; }).filter(Boolean);
  const bestTest = testBest.slice().sort((a, b) => b.wpm - a.wpm || b.acc - a.acc)[0] || null;
  if (!lessons.length && !bestTest && !practiceDays(s.days).length) return null;
  const keyStats = Object.entries(obj(s.keys)).filter(([k, v]) => KEYS.has(k) && Array.isArray(v))
    .map(([k, v]) => ({ key: k, hits: int(v[0], 0, 1e7), misses: int(v[1], 0, 1e7) }));
  // Tricky keys: the ones missed most often for how often they came up (at least 8 tries and 1 in 20 missed), worst first.
  const tricky = keyStats.map(x => ({ ...x, rate: x.misses / Math.max(1, x.hits + x.misses) }))
    .filter(x => x.hits + x.misses >= 8 && x.rate >= 0.05).sort((a, b) => b.rate - a.rate || b.misses - a.misses).slice(0, 3)
    .map(x => ({ key: x.key, pct: Math.round(100 * x.rate) }));
  const next = LESSONS.find(id => !done[id]);
  return {
    done: lessons.length,
    total: LESSONS.length,
    next: next ? LESSONS.indexOf(next) + 1 : null,
    stars: lessons.reduce((n, l) => n + l.stars, 0),
    bestWpm: Math.max(0, ...lessons.map(l => l.wpm), ...testBest.map(x => x.wpm)),
    acc: lessons.length ? Math.round(lessons.reduce((n, l) => n + l.acc, 0) / lessons.length) : bestTest.acc,
    tests: testBest,
    bestTest,
    practiced: int(obj(s.practice).n, 0, 100000),
    days: practiceDays(s.days),
    week: Math.round(practiceDays(s.days).reduce((n, d) => n + d.secs, 0) / 60),
    pets: Math.min(40, Object.keys(obj(s.pets)).length),
    tricky,
    minutes: Math.round(int(s.secs, 0, 1e8) / 60),
    last: Math.max(int(s.last, 0, 8.64e15), ...lessons.map(l => l.at), int(obj(tests[`t${(bestTest || {}).min}`]).t, 0, 8.64e15)) || null,
    lessons,
  };
}

/** The class's typing rows: one per student ({ user, ...summary } or { user, summary: null }), or null when the game
 *  isn't on this site. Students only: pass the gradebook's students (the class's own roster). */
export function classTyping(students) {
  const g = games.getGameBySlug(SLUG);
  if (!g) return null;
  return {
    game: g,
    rows: students.map(user => {
      const save = games.getSave(g.id, user.id);
      return { user, typing: summarize(save[SAVE_KEY]) };
    }),
  };
}

// ---------------------------------------------------------------- class goals
// A class's typing goal (typing_goals, migration 0115): a speed (wpm) and an accuracy (%) a student's best test is
// measured against on the progress page. Set by the class's teachers (the route checks canManageClass).
export const GOAL_LIMITS = { wpm: [5, 120], acc: [50, 100], mins: [0, 60] };
export function getGoal(classId) {
  const r = q.get('SELECT wpm, acc, mins FROM typing_goals WHERE class_id=?', classId);
  return r ? { wpm: r.wpm, acc: r.acc, mins: r.mins } : null;
}
/** Save (or, with no speed, clear) a class's goal. -> the goal, or null when cleared. */
/** A speed goal needs a speed; a daily goal needs minutes; with neither, the goal is cleared (null). wpm 0 = no speed goal. */
export function setGoal(classId, { wpm, acc, mins } = {}) {
  const blank = v => v === '' || v === undefined || v === null;
  const g = { wpm: blank(wpm) ? 0 : int(wpm, ...GOAL_LIMITS.wpm), acc: blank(acc) ? 90 : int(acc, ...GOAL_LIMITS.acc), mins: blank(mins) ? 0 : int(mins, ...GOAL_LIMITS.mins) };
  if (!g.wpm && !g.mins) { q.run('DELETE FROM typing_goals WHERE class_id=?', classId); return null; }
  q.run('INSERT INTO typing_goals(class_id, wpm, acc, mins, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id) DO UPDATE SET wpm=excluded.wpm, acc=excluded.acc, mins=excluded.mins, updated_at=excluded.updated_at', classId, g.wpm, g.acc, g.mins, Date.now());
  return g;
}
/** Days in the last week the student practiced at least the daily goal's minutes (null with no daily goal). */
export function daysMet(summary, goal) {
  if (!goal || !goal.mins || !summary) return null;
  return summary.days.filter(d => d.secs >= goal.mins * 60).length;
}
/** Has this student's best test met the goal? (true / false; null with no goal or no test yet) */
export function meetsGoal(summary, goal) {
  if (!goal || !goal.wpm || !summary || !summary.tests.length) return null;
  return summary.tests.some(x => x.wpm >= goal.wpm && x.acc >= goal.acc);
}

// ---------------------------------------------------------------- the Assign picker
/** What a teacher can assign: every lesson, then the tests. [{ value: 'chapter=l07&lock=1', label }] */
export function assignChoices(t) {
  return [...LESSONS.map((id, i) => ({ value: `chapter=${id}&lock=1`, label: `${t('progress.typing.lessonN', { n: i + 1 })}: ${LESSON_NAMES[i]}` })),
    ...TESTS.map(m => ({ value: `chapter=t${m}&lock=1`, label: t('progress.typing.testN', { n: m }) })),
    { value: 'chapter=tricky&lock=1', label: t('progress.typing.trickyPractice') }];
}
/** A chosen option, checked against that list (anything else is free choice). -> { value, label } | null */
export function assignChoice(t, raw) {
  return assignChoices(t).find(c => c.value === String(raw || '')) || null;
}

// ---------------------------------------------------------------- pass marks
// A pass mark rides in an assignment's lesson parameters as mode=a<accuracy>-w<speed> (either part may be left out);
// the game reports the step done only for a run that reaches it (seed-games/typing-pets.html passMark).
export const PASS = { acc: [50, 100], wpm: [1, 120] };
const num = v => (v === undefined || v === null || String(v).trim() === '' ? null : Number(v));
/** -> { acc, wpm, mode } or null (no pass mark). Out-of-range numbers are clamped; a non-number counts as left out. */
export function passMode(rawAcc, rawWpm) {
  const a = num(rawAcc), w = num(rawWpm);
  const acc = Number.isFinite(a) ? int(a, ...PASS.acc) : null, wpm = Number.isFinite(w) ? int(w, ...PASS.wpm) : null;
  if (acc === null && wpm === null) return null;
  return { acc, wpm, mode: [acc !== null ? `a${acc}` : '', wpm !== null ? `w${wpm}` : ''].filter(Boolean).join('-') };
}
export function passLabel(t, p) {
  return [p.acc !== null ? `${p.acc}%` : '', p.wpm !== null ? t('progress.typing.wpm', { n: p.wpm }) : ''].filter(Boolean).join(', ').replace(/^/, `${t('progress.typing.passShort')} `);
}
