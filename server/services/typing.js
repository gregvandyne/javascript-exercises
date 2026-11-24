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
  if (!lessons.length && !bestTest) return null;
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
export const GOAL_LIMITS = { wpm: [5, 120], acc: [50, 100] };
export function getGoal(classId) {
  const r = q.get('SELECT wpm, acc FROM typing_goals WHERE class_id=?', classId);
  return r ? { wpm: r.wpm, acc: r.acc } : null;
}
/** Save (or, with no speed, clear) a class's goal. -> the goal, or null when cleared. */
export function setGoal(classId, { wpm, acc } = {}) {
  if (wpm === '' || wpm === undefined || wpm === null) { q.run('DELETE FROM typing_goals WHERE class_id=?', classId); return null; }
  const g = { wpm: int(wpm, ...GOAL_LIMITS.wpm), acc: acc === '' || acc === undefined || acc === null ? 90 : int(acc, ...GOAL_LIMITS.acc) };
  q.run('INSERT INTO typing_goals(class_id, wpm, acc, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO UPDATE SET wpm=excluded.wpm, acc=excluded.acc, updated_at=excluded.updated_at', classId, g.wpm, g.acc, Date.now());
  return g;
}
/** Has this student's best test met the goal? (true / false; null with no goal or no test yet) */
export function meetsGoal(summary, goal) {
  if (!goal || !summary || !summary.tests.length) return null;
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
