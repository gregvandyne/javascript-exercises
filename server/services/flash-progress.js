// Flashcards: how each student is doing on each card of an assigned set (docs/decisions.md "Flashcards").
//
// A set reaches a class the way every set game's does: Assign (BRB.assign -> /teach/assign) or a Hub handout makes a
// lesson step of kind 'game' on the Flashcards game whose options open the set (chapter=s-xxxxxxxxxx&lock=1). Play time,
// the end of a Learn round and a Test's score are that step's step_progress row, written by the play page exactly as
// for any game. On top, Learn and Test report each card's state (BRB.flashProgress -> POST
// /api/progress/:cl/:step/flash), kept in the same row's marks column, which no other part of a game step reads:
//   marks = <one level a card> ':' <one miss count a card>
//   level  '-' not studied yet, '0' missed last time, '1' learning (right once), '2' almost (right on multiple choice
//          and once typed), '3' mastered (right typed twice in a row, services' mirror of the game's flash-core rules)
//   misses '0'-'9', 'a'-'z': how many times the card was missed, capped at 35 (base 36, one character)
// The card order is the set's own. Misses only ever go up (the larger of the stored and the sent count, so a second
// device does not wipe them); the level is the latest. Only the student the step is assigned to writes their own row
// (progress.context); the teacher reads it on the lesson's page (routes/progress.js, views/flash-step.js), never
// another student. No names here: the page that shows it already has the teacher's roster.
import { q } from '../db.js';
import * as P from './progress.js';
import * as games from './games.js';
import * as gameSets from './game-sets.js';
import { parseParams } from './play-params.js';

export const SLUG = 'flashcards';
export const LEVELS = '-0123';
const MISS_MAX = 35;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });

/** The Flashcards set a lesson step opens ({ id, items } of the official game's set), or null. step: a lesson_steps row. */
export function setOfStep(step) {
  if (!step || step.kind !== 'game' || !step.game_id) return null;
  const g = games.getGame(step.game_id);
  if (!g || g.source !== 'seed' || g.slug !== SLUG) return null;
  const ch = parseParams(String(step.options || '')).chapter;
  if (!ch || !gameSets.SET_ID.test(ch)) return null;
  const s = gameSets.get(g.id, ch);
  return s && Array.isArray(s.items) && s.items[0] && Array.isArray(s.items[0].c) ? s : null;
}

/** The marks column -> { levels: [char], misses: [int] } for n cards (anything else reads as nothing studied). */
export function readMarks(marks, n) {
  const [a = '', b = ''] = String(marks || '').split(':');
  const levels = Array.from({ length: n }, (_, i) => (LEVELS.includes(a[i]) && a[i] ? a[i] : '-'));
  const misses = Array.from({ length: n }, (_, i) => { const v = parseInt(b[i] || '0', 36); return Number.isFinite(v) ? Math.min(MISS_MAX, v) : 0; });
  return { levels, misses };
}
export const writeMarks = (levels, misses) => `${levels.join('')}:${misses.map(m => Math.max(0, Math.min(MISS_MAX, m | 0)).toString(36)).join('')}`;

/** What the game sends -> clean { levels, misses } for n cards, or null. cards: [[level 0-3 or -1 (not studied), misses]]. */
export function cleanCards(cards, n) {
  if (!Array.isArray(cards) || cards.length !== n) return null;
  const levels = [], misses = [];
  for (const c of cards) {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || c[0] < -1 || c[0] > 3 || !Number.isInteger(c[1]) || c[1] < 0 || c[1] > 9999) return null;
    levels.push(c[0] < 0 ? '-' : String(c[0])); misses.push(Math.min(MISS_MAX, c[1]));
  }
  return { levels, misses };
}

/** A student's card states on their assigned step. -> { ok, mastered, n } | fail('notFound'|'badRequest'). The row is
 *  started (as opening the game does) when there is none yet; its status, score and time are left to the game events. */
export function record(u, clId, stepId, cards) {
  const c = P.context(u, clId, stepId); if (!c.ok) return c;
  const s = setOfStep(c.step); if (!s) return fail('notFound');
  const n = s.items[0].c.length, got = cleanCards(cards, n);
  if (!got) return fail('badRequest');
  if (!P.get(clId, stepId, u.id)) { const r = P.gameStarted(u, clId, stepId); if (!r.ok) return r; }
  const old = readMarks((P.get(clId, stepId, u.id) || {}).marks, n);
  const misses = got.misses.map((m, i) => Math.max(m, old.misses[i]));
  q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', writeMarks(got.levels, misses), clId, stepId, u.id);
  return ok({ mastered: got.levels.filter(l => l === '3').length, n });
}

/** The teacher's view of one step: each student's counts (in the order given) and the cards missed most.
 *  cells: step_progress rows (or null) in roster order. -> { n, rows: [{ mastered, learning, missed, fresh, pct, started }],
 *  cards: [{ i, term, def, pic, misses, students, mastered }] sorted by misses (most first), totals } */
export function summary(set, cells) {
  const cards = set.items[0].c, n = cards.length;
  // pic: the card's emoji (one of our pictures, 'img:<id>', is left out of this list)
  const per = cards.map((c, i) => ({ i, term: c[0], def: c[1], pic: c[2] && !String(c[2]).startsWith('img:') ? c[2] : '', misses: 0, students: 0, mastered: 0 }));
  const rows = cells.map(x => {
    if (!x || !x.marks) return { mastered: 0, learning: 0, missed: 0, fresh: n, pct: 0, started: !!x };
    const m = readMarks(x.marks, n);
    m.levels.forEach((l, i) => { if (l === '3') per[i].mastered++; });
    m.misses.forEach((v, i) => { per[i].misses += v; if (v) per[i].students++; });
    const mastered = m.levels.filter(l => l === '3').length, learning = m.levels.filter(l => l === '1' || l === '2').length, missed = m.levels.filter(l => l === '0').length;
    return { mastered, learning, missed, fresh: n - mastered - learning - missed, pct: Math.round((100 * mastered) / n), started: true };
  });
  const missedMost = per.filter(c => c.misses > 0).sort((a, b) => b.misses - a.misses || b.students - a.students || a.i - b.i);
  return { n, rows, cards: missedMost, studied: rows.filter(r => r.started && r.fresh < n).length };
}
