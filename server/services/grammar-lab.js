// Grammar Lab, the grammar and writing course, on the course platform's own tables (docs: scripts/grammar-lab-build.js
// for the data, services/grammar-lab-mastery.js for the mastery rule, services/grammar-lab-access.js for the flag).
//   - Bands hold units (pathways); a unit holds topics in order; each topic is defined once, by id, so mastering it
//     counts in every unit and band that uses it. A topic opens when the one before it in its unit is mastered (the
//     platform admin may open any, and still has to earn the mastery).
//   - A mastered topic is a course_progress row (course 'grammar-lab', step = the topic id) with completed_at set. It is
//     written only when the server-graded quiz reaches mastery: opening a topic, its card or its quiz completes nothing.
//   - Guests play freely, but their mastery is a pending win (course_pending_wins, kind 'win'), honored when they sign
//     in (services/courses.js applyPendingWins, through onPendingWin below).
//   - The quiz runs on the server (grammar_lab_quiz): the page gets a question's words and the line that asks it, never
//     its answer, and sends back the places of the words it marked.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, now } from '../db.js';
import { onAccountMerge } from './schools.js';
import { stashPendingFact, isGuestUser, onPendingWin } from './courses.js';
import { tokenize } from './grammar-lab-text.js';
import * as M from './grammar-lab-mastery.js';

export const SLUG = 'grammar-lab';
/** This course's grade store runs to grade 12 (owner, 2026-11-27); Number Quest's stays at 8 (its own deriveGrade). */
export const GRADE_CAP = 12;
const COURSE = Object.freeze({ slug: SLUG });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'seed-lessons/grammar-lab/topics.json');

let cache = null;
const data = () => (cache ||= JSON.parse(fs.readFileSync(FILE, 'utf8')));
export const reload = () => { cache = null; };

// ------------------------------------------------------------------------------------------------- the course
export const bands = () => data().bands;
export const band = id => data().bands.find(b => b.id === id) || null;
export const topic = id => (Object.hasOwn(data().topics, id) ? data().topics[id] : null);
/** A unit: { id, title, band, parts, topics: [ids in order] }, or null. */
export function pathway(id, bandId = null) {
  const p = Object.hasOwn(data().pathways, id) ? data().pathways[id] : null;
  const b = p && data().bands.find(x => x.pathways.includes(id) && (!bandId || x.id === bandId));
  return p && b ? { id, title: p.title, band: b.id, parts: p.parts, topics: p.parts.flatMap(x => x.topics) } : null;
}
export const pathwaysOf = bandId => (band(bandId) ? band(bandId).pathways.map(id => pathway(id, bandId)) : []);
/** Is this topic's card read aloud (the K-2 band)? */
export const readsAloud = t => !!(t && band(t.band) && band(t.band).readAloud);

// ------------------------------------------------------------------------------------------------- progress
/** The topics this player has mastered: Set of ids (a guest has none: theirs are pending wins). */
export function masteredSet(user) {
  if (!user || isGuestUser(user)) return new Set();
  return new Set(q.all('SELECT step FROM course_progress WHERE user_id=? AND course=? AND completed_at IS NOT NULL', user.id, SLUG).map(r => r.step));
}
/** A guest's topics waiting for sign-in: Set of ids. */
export function pendingSet(user) {
  if (!user || !isGuestUser(user)) return new Set();
  return new Set(q.all("SELECT step FROM course_pending_wins WHERE user_id=? AND course=? AND kind='win'", user.id, SLUG).map(r => r.step));
}
/** Each topic of a unit with its state, worked out now from the rows (never cached):
 *  [{ topic, mastered, pending, open, started }]. A topic opens when the one before it is mastered. */
export function unitStates(user, p) {
  const done = masteredSet(user), pend = pendingSet(user);
  const started = new Set(user ? q.all('SELECT topic FROM grammar_lab_quiz WHERE user_id=?', user.id).map(r => r.topic) : []);
  const admin = !!user && user.role === 'admin';
  let prev = true;
  return p.topics.map(id => {
    const t = topic(id);
    // A guest's pending win opens the next topic for this sitting, as a guest's facts do in the other courses.
    const s = { topic: t, mastered: done.has(id), pending: pend.has(id), open: admin || prev, started: started.has(id) };
    prev = s.mastered || s.pending;
    return s;
  });
}
/** A unit's ring: { done, total } from the live topic states. */
export function unitProgress(user, p) {
  const list = unitStates(user, p);
  return { done: list.filter(s => s.mastered).length, total: list.length };
}
/** The next topic to master in this unit after `afterId` (or the first unmastered one), live; never a mastered one. */
export function nextTopic(user, p, afterId = null) {
  const list = unitStates(user, p).filter(s => !s.mastered && !s.pending && s.topic.id !== afterId);
  return (list.find(s => s.open) || list[0] || null);
}
function markMastered(user, id) {
  const t = now(), b = (topic(id) || {}).band || '';
  q.run('INSERT OR IGNORE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,NULL,NULL,0,NULL,NULL)', user.id, SLUG, id, b);
  q.run('UPDATE course_progress SET read_at=COALESCE(read_at, ?), checked_at=COALESCE(checked_at, ?), completed_at=COALESCE(completed_at, ?) WHERE user_id=? AND course=? AND step=?', t, t, t, user.id, SLUG, id);
}
// A guest's mastery, once they sign in (services/courses.js applyPendingWins): the topic is mastered for real.
onPendingWin(SLUG, (user, id) => { if (!topic(id)) return false; markMastered(user, id); return true; });

// ------------------------------------------------------------------------------------------------- the quiz
function readRun(user, id) {
  const r = user && q.get('SELECT state FROM grammar_lab_quiz WHERE user_id=? AND topic=?', user.id, id);
  if (!r) return null;
  try { return JSON.parse(r.state); } catch { return null; }
}
function saveRun(user, id, s) {
  const t = now();
  q.run('INSERT INTO grammar_lab_quiz(user_id, topic, state, started_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, topic) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at', user.id, id, JSON.stringify(s), t, t);
}
/** What the page shows of a run (services/grammar-lab-mastery.js summary). */
export const summaryOf = s => M.summary(s);
/** The run on screen, or null. */
export const currentRun = (user, id) => readRun(user, id);
/** Start this player's run on a topic: a run in progress is kept (unless again is asked); a finished one starts over. */
export function startRun(user, t, { again = false } = {}) {
  const have = readRun(user, t.id);
  if (have && !have.mastered && !again) return have;
  const s = M.newRun({ levels: t.levels, items: t.items.length, seed: `${user.id}|${t.id}|${crypto.randomBytes(6).toString('hex')}` });
  // The questions of the last mastered run stay for "look back" while the student practices again.
  const last = have && (have.mastered ? have.history : have.lastMastered);
  if (last) s.lastMastered = last;
  saveRun(user, t.id, s);
  return s;
}
/** A question as the page gets it: its words and the line that asks it, never its answer. */
export function questionFor(t, s) {
  if (!s || !s.cur) return null;
  const it = t.items[s.cur.item];
  return { id: it.id, n: s.presented, ask: t.ask, words: tokenize(it.text), need: it.answer.length };
}
/** Grade a set of marked word places against an item, on the server: 'right' | 'wrong' | 'near' (more words than the
 *  answer has: a near miss, never counted) | null (nothing usable was sent). */
export function grade(item, marked) {
  const n = tokenize(item.text).length;
  if (!Array.isArray(marked) || !marked.length || marked.length > n) return null;
  if (!marked.every(i => Number.isInteger(i) && i >= 0 && i < n)) return null;
  const set = new Set(marked);
  if (set.size !== marked.length) return null;
  if (set.size > item.answer.length) return 'near';
  return set.size === item.answer.length && item.answer.every(i => set.has(i)) ? 'right' : 'wrong';
}
/** One try on the question on screen. -> { result, kind, levelDone, mastered, summary, question, hint, win } or null
 *  when there is no question to answer. win: 'mastered' (recorded) | 'pending' (a guest's, kept until sign-in). */
export function answerRun(user, t, marked) {
  const s = readRun(user, t.id);
  if (!s || s.mastered || !s.cur) return null;
  const item = t.items[s.cur.item];
  const result = grade(item, marked);
  if (!result) return null;
  const out = M.answer(s, result);
  saveRun(user, t.id, s);
  let win = null;
  if (out.mastered) {
    if (isGuestUser(user)) { stashPendingFact(user, COURSE, { key: t.id }, 'win'); win = 'pending'; }
    else { markMastered(user, t.id); win = 'mastered'; }
  }
  return { result, kind: out.kind, levelDone: out.levelDone, mastered: out.mastered, summary: M.summary(s), question: questionFor(t, s),
    hint: out.kind === 'wrong' || out.kind === 'again' ? item.hint : null, win };
}
/** The questions of this player's last run, after mastery, for "look back": [{ text, words, answer, ok }]. */
export function reviewOf(user, t) {
  const s = readRun(user, t.id);
  const list = s && (s.mastered ? s.history : s.lastMastered);
  if (!list) return [];
  return list.map(h => { const it = t.items[h.item]; return { text: it.text, words: tokenize(it.text), answer: it.answer, ok: h.ok }; });
}

// ------------------------------------------------------------------------------------------------- read aloud
/** The teaching card as one spoken text (services/tts.js reads it; the page never sends text). */
export function cardSpoken(t) {
  const c = t.card, end = x => (/[.!?]$/.test(x) ? x : `${x}.`);
  return [c.definition, c.example && c.example.text, c.example && c.example.note, c.how, ...c.tips.flatMap(x => [x.text, x.note])]
    .filter(Boolean).map(x => end(String(x).trim())).join(' ');
}

// ------------------------------------------------------------------------------------------------- grade store
/** The current grade from a declared grade and its date: +1 each September 1 since, capped at grade 12 for this course
 *  (the same rollover as Number Quest's deriveGrade, which stays capped at 8). 'K' is grade 0. */
export function deriveGrade(declared, declaredAt, at = now()) {
  if (declared === null || declared === undefined) return null;
  const g = declared === 'K' || declared === 'k' ? 0 : Number(declared);
  if (!Number.isInteger(g) || g < 0 || g > GRADE_CAP) return null;
  if (!declaredAt) return g;
  const d = new Date(declaredAt), a = new Date(at);
  const dDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  let roll = 0;
  for (let y = d.getUTCFullYear(); y <= a.getUTCFullYear(); y++) { const s1 = Date.UTC(y, 8, 1); if (s1 > dDay && s1 <= aDay) roll++; }
  return Math.min(GRADE_CAP, g + roll);
}

// A school account merged into a student's own account brings its quiz runs (the student's own rows win).
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE grammar_lab_quiz SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM grammar_lab_quiz WHERE user_id=?', from);
});
