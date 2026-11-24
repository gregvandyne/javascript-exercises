// Typing Pets for teachers: each student's typing progress, read from the game's own cloud save (seed-games/typing-pets.html,
// BRB.storage key 'typing-pets-v1'), so practice at home or in free play shows up too, not only assigned lesson steps.
// The save is written by the game in the student's browser, so everything read here is checked and clamped: a tampered
// save can only show odd numbers for that one student, never break the page or show anything but numbers and known keys.
// Who may see it is the caller's job (routes/progress.js checkPage: the class's own teachers and school leaders).
import * as games from './games.js';

export const SLUG = 'typing-pets';
export const SAVE_KEY = 'typing-pets-v1';
/** The game's lessons, in order (LESSONS in the game; tests/unit/typing.test.js checks the two agree). */
export const LESSONS = Array.from({ length: 20 }, (_, i) => `l${String(i + 1).padStart(2, '0')}`);
const KEYS = new Set('abcdefghijklmnopqrstuvwxyz;,.'.split(''));
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
  if (!lessons.length) return null;
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
    bestWpm: Math.max(...lessons.map(l => l.wpm)),
    acc: Math.round(lessons.reduce((n, l) => n + l.acc, 0) / lessons.length),
    pets: Math.min(40, Object.keys(obj(s.pets)).length),
    tricky,
    minutes: Math.round(int(s.secs, 0, 1e8) / 60),
    last: Math.max(int(s.last, 0, 8.64e15), ...lessons.map(l => l.at)) || null,
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
