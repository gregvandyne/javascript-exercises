// Grammar Lab, the grammar and writing course, on the course platform's own tables (docs: scripts/grammar-lab-build.js
// for the data, services/grammar-lab-mastery.js for the mastery rule, services/grammar-lab-access.js for the flag).
//   - Bands hold units (pathways); a unit holds topics in order; each topic is defined once, by id, so mastering it
//     counts in every unit and band that uses it. A topic opens when the one before it in its unit is mastered (the
//     platform admin may open any, and still has to earn the mastery).
//   - A mastered topic is a course_progress row (course 'grammar-lab', step = the topic id) with completed_at set. It is
//     written only when the server-graded quiz reaches mastery: opening a topic, its card or its quiz completes nothing.
//   - Guests play freely, but their mastery is a pending win (course_pending_wins, kind 'win'), honored when they sign
//     in (services/courses.js applyPendingWins, through onPendingWin below).
//   - The quiz runs on the server (grammar_lab_quiz): the page gets a question's words (or its choices) and the line that
//     asks it, never its answer, and sends back what the player marked: word places (tap, capfix), the gaps where they
//     put a comma (gaps) or the choice they picked (choice). Formats: scripts/grammar-lab-build.js.
//   - A topic with a Mistake Hunt room (topics.json rooms; planted at build time) opens it in the Mistake Hunt game with
//     ?glroom=<topic>&unit=<unit> (routes/games.js). The game hands in through this server (roomSave), which checks the
//     fixes with Mistake Hunt's own checker (services/proof-steps.js markAll); the room counts as passed when about 80% of
//     its mistakes are found (the room's need), never on the game's own end screen. A passed room is its own mark on the
//     topic (grammar_lab_quiz row 'room:<topic>'): it does not change mastery, the lock or the unit's ring.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, now } from '../db.js';
import { onAccountMerge } from './schools.js';
import { stashPendingFact, isGuestUser, onPendingWin } from './courses.js';
import { tokenize, normTyped } from './grammar-lab-text.js';
import * as M from './grammar-lab-mastery.js';
import * as PS from './proof-steps.js';

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
/** A unit: { id, title, band, parts, topics: [ids in order], marks: { id: 'checkpoint' | 'review' } }, or null. */
export function pathway(id, bandId = null) {
  const p = Object.hasOwn(data().pathways, id) ? data().pathways[id] : null;
  const b = p && data().bands.find(x => x.pathways.includes(id) && (!bandId || x.id === bandId));
  return p && b ? { id, title: p.title, band: b.id, parts: p.parts, topics: p.parts.flatMap(x => x.topics), marks: p.marks || {} } : null;
}
/** Every unit that uses a topic (in every band): [unit]. */
export const unitsWith = id => data().bands.flatMap(b => b.pathways.map(p => pathway(p, b.id)).filter(p => p && p.topics.includes(id)));
export const pathwaysOf = bandId => (band(bandId) ? band(bandId).pathways.map(id => pathway(id, bandId)) : []);
const BAND_ID = /^(k-2|3-5|6-8|9-12)$/;
/** A unit as a request names it: its id, and the band it was opened in when that is one of the unit's bands (a unit
 *  shared by two bands, like Kinds of Words in K-2 and 3-5, suggests its next topic in the band the student is in). */
export const unitFor = (id, bandId) => pathway(id, typeof bandId === 'string' && BAND_ID.test(bandId) ? bandId : null) || pathway(id);
/** Is this topic's card read aloud (the K-2 band)? With a unit: only in a band that reads aloud, so a K-2 topic shared
 *  into a 3-5 unit is not read aloud there. */
export const readsAloud = (t, p = null) => !!(t && band(t.band) && band(t.band).readAloud && (!p || (band(p.band) && band(p.band).readAloud)));

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
 *  [{ topic, mastered, pending, open, started, part, mark, room }]. A topic opens when the one before it in the unit is
 *  mastered; a topic mastered anywhere (it is shared) is mastered, and open, in every unit that uses it.
 *  part: the part title above it (on a part's first topic only); mark: 'checkpoint' | 'review' | null; room: null (no
 *  room) or { passed }. */
export function unitStates(user, p) {
  const done = masteredSet(user), pend = pendingSet(user), passed = roomPassedSet(user);
  const started = new Set(user ? q.all('SELECT topic FROM grammar_lab_quiz WHERE user_id=?', user.id).map(r => r.topic) : []);
  const admin = !!user && user.role === 'admin';
  const partOf = new Map();
  for (const part of p.parts || []) if (part.title && part.topics.length) partOf.set(part.topics[0], part.title);
  let prev = true;
  return p.topics.map(id => {
    const t = topic(id);
    const mastered = done.has(id), pending = pend.has(id);
    // A guest's pending win opens the next topic for this sitting, as a guest's facts do in the other courses.
    const s = { topic: t, mastered, pending, open: admin || prev || mastered || pending, started: started.has(id),
      part: partOf.get(id) || null, mark: (p.marks || {})[id] || null, room: room(id) ? { passed: passed.has(id) } : null };
    prev = mastered || pending;
    return s;
  });
}
/** A unit's ring: { done, total } from the live topic states. */
export function unitProgress(user, p) {
  const list = unitStates(user, p);
  return { done: list.filter(s => s.mastered).length, total: list.length };
}
/** The next topic to master, live, never a mastered one (nor a guest's pending one, nor `afterId`): the first open one in
 *  this unit, else the first open one in the band's other units, in order. -> { ...state, unit } or null. */
export function nextTopic(user, p, afterId = null) {
  const pick = u => {
    const s = unitStates(user, u).find(x => x.open && !x.mastered && !x.pending && x.topic.id !== afterId);
    return s ? { ...s, unit: u } : null;
  };
  const here = pick(p);
  if (here) return here;
  for (const u of pathwaysOf(p.band)) if (u.id !== p.id) { const s = pick(u); if (s) return s; }
  return null;
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
/** What the page marks a question with: 'tap' (word places: tap, capfix), 'gaps' (the gaps after word i), 'choice' (the
 *  option picked: choice, and passage, whose options are the passage's sentences) or 'fix' (a typed sentence, or after
 *  a wrong answer the version picked). */
export const kindOf = (t, it = null) => {
  // a 6-8 topic's items each have their own format (scripts/grammar-lab-build.js "grades 6-8")
  const f = (it && it.format) || t.format;
  return f === 'gaps' ? 'gaps' : f === 'marks' ? 'marks' : f === 'choice' || f === 'passage' ? 'choice' : f === 'fix' ? 'fix' : 'tap';
};
const formatOf = (t, it) => (it && it.format) || t.format;
/** A question as the page gets it, never its answer: the line that asks it, and its words (tap, capfix, gaps) or the
 *  sentence around its blank and its choices in a fixed order (choice; whole: the choices are whole sentences), or the
 *  words and the marks as written with the chip bank (marks). */
export function questionFor(t, s) {
  if (!s || !s.cur) return null;
  const it = t.items[s.cur.item], kind = kindOf(t, it), f = formatOf(t, it);
  const base = { id: it.id, n: s.presented, ask: it.ask || t.ask, kind };
  if (f === 'passage') return { ...base, before: '', after: '', options: it.options, whole: true, italic: false, passage: true };
  if (kind === 'choice') {
    const [before, after] = it.whole || it.plain ? [it.plain ? it.text : '', ''] : it.text.split('___');
    // prompt: what the choice is about, shown above it (two thoughts to join, the sentence with its verb to fix);
    // plain: the sentence itself, with no blank (sentence or fragment); cycle: press-to-cycle in the blank.
    return { ...base, before, after, options: it.options, whole: !!it.whole, italic: !!it.italic,
      ...(it.prompt ? { prompt: it.prompt } : {}), ...(it.plain ? { plain: true } : {}), ...(t.cycle || it.cycle ? { cycle: true } : {}),
      ...(it.focus && it.focus.length ? { words: tokenize(it.text), focus: it.focus } : {}), ...(it.titleAt ? { titleAt: it.titleAt } : {}) };
  }
  // punctuation chips: the words without their marks, the marks as written, and the chip bank (never the marks wanted)
  if (kind === 'marks') return { ...base, words: it.words, start: it.start, chips: it.chips, ...(it.asIs ? { asIs: true } : {}) };
  // A fix: the sentence to fix in a box; once missed, the versions to press through (the right one among them, unsaid).
  if (kind === 'fix') return { ...base, text: it.text, ...(s.cur.missed ? { options: it.options } : {}), ...(it.asIs && !s.cur.missed ? { asIs: true } : {}) };
  return { ...base, words: tokenize(it.text), need: it.answer.length, ...(f === 'capfix' ? { capfix: true } : {}), ...(it.focus && it.focus.length ? { focus: it.focus } : {}), ...(it.titleAt ? { titleAt: it.titleAt } : {}) };
}
/** A list of distinct whole numbers below n, or null. */
const places = (marked, n) => {
  if (!Array.isArray(marked) || !marked.length || marked.length > n) return null;
  if (!marked.every(i => Number.isInteger(i) && i >= 0 && i < n)) return null;
  const set = new Set(marked);
  return set.size === marked.length ? set : null;
};
/** Grade what the player marked against an item, on the server: 'right' | 'wrong' | 'near' (more than the answer can
 *  take: a near miss, never counted) | null (nothing usable was sent).
 *    tap, capfix: word places; right when they are the answer's.
 *    gaps: the gaps a comma went in; right when every needed one is there and the rest are optional ones (a list's last
 *          comma: with or without it is a valid fix).
 *    choice: [the option picked]; right when it is a right one. */
export function grade(item, marked, kind = 'tap', { missed = false } = {}) {
  const n = tokenize(item.text).length;
  // "It's right as it is" (a topic with read.asIs): right when the sentence needs no fix
  if (marked === AS_IS && item.asIs && (kind === 'marks' || (kind === 'fix' && !missed))) {
    return (kind === 'fix' ? item.accept.some(a => normTyped(a) === normTyped(item.text)) : sameMarks(item.start, item.want) && !item.optional.length) ? 'right' : 'wrong';
  }
  if (marked === AS_IS) return null;
  if (kind === 'marks') {
    // [[gap, mark]]: every needed mark in its gap, an optional one there or not, no other gap holding a mark
    if (!Array.isArray(marked) || marked.length > item.words.length) return null;
    const got = new Map();
    for (const p of marked) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || p[0] < 0 || p[0] >= item.words.length - 1 || !item.chips.includes(p[1]) || got.has(p[0])) return null;
      got.set(p[0], p[1]);
    }
    if (sameMarks([...got], item.start)) return null;
    const want = new Map(item.want), opt = new Map(item.optional);
    for (const [g, m] of want) if (got.get(g) !== m) return 'wrong';
    for (const [g, m] of got) if (want.get(g) !== m && opt.get(g) !== m) return 'wrong';
    return 'right';
  }
  if (kind === 'fix') {
    // typed: right when it is one of the accepted fixes (a run-on: any valid fix); unchanged or empty is nothing sent.
    if (typeof marked === 'string') {
      const typed = normTyped(marked);
      if (!typed || typed.length > 400 || typed === normTyped(item.text)) return null;
      return item.accept.some(a => normTyped(a) === typed) ? 'right' : 'wrong';
    }
    // a version picked: only once the versions were shown (after a wrong answer)
    if (!missed) return null;
    const set = places(marked, item.options.length);
    if (!set || set.size !== 1) return null;
    return item.answer.includes(marked[0]) ? 'right' : 'wrong';
  }
  if (kind === 'choice') {
    const set = places(marked, item.options.length);
    if (!set || set.size !== 1) return null;
    return item.answer.includes(marked[0]) ? 'right' : 'wrong';
  }
  if (kind === 'gaps') {
    const set = places(marked, n - 1);
    if (!set) return null;
    const optional = item.optional || [];
    if (set.size > item.answer.length + optional.length) return 'near';
    return item.answer.every(i => set.has(i)) && [...set].every(i => item.answer.includes(i) || optional.includes(i)) ? 'right' : 'wrong';
  }
  const set = places(marked, n);
  if (!set) return null;
  // a phrase: its words, and any optional ones (an article) with them; another mention of the same person is right too
  const ways = [{ answer: item.answer, optional: item.optional || [] }, ...(item.alts || [])];
  if (ways.some(w => w.answer.every(i => set.has(i)) && [...set].every(i => w.answer.includes(i) || w.optional.includes(i)))) return 'right';
  if (set.size > Math.max(...ways.map(w => w.answer.length + w.optional.length))) return 'near';
  return 'wrong';
}
/** The page's "It's right as it is". */
export const AS_IS = 'as-is';
const sameMarks = (a, b) => { const A = new Map(a), Bm = new Map(b); return A.size === Bm.size && [...A].every(([g, m]) => Bm.get(g) === m); };
/** One try on the question on screen. -> { result, kind, levelDone, mastered, summary, question, hint, win } or null
 *  when there is no question to answer. win: 'mastered' (recorded) | 'pending' (a guest's, kept until sign-in). */
export function answerRun(user, t, marked) {
  const s = readRun(user, t.id);
  if (!s || s.mastered || !s.cur) return null;
  const item = t.items[s.cur.item];
  const result = grade(item, marked, kindOf(t, item), { missed: !!s.cur.missed });
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
/** One item as "look back" shows it: the right sentence and the words to mark in it ({ i, role }). */
export function rightOf(t, it) {
  const f = formatOf(t, it);
  if (f === 'tap' && it.format) return { text: it.text, marks: it.answer.map(i => ({ i, role: 'key' })) };
  if (f === 'marks') return { text: it.right, marks: [...it.want, ...it.optional].filter(([, m]) => m === ',').map(([i]) => ({ i, role: 'comma' })).sort((a, b) => a.i - b.i) };
  if (f === 'tap') {
    const role = t.card.example && t.card.example.marks[0] ? t.card.example.marks[0].role : 'key';
    return { text: it.text, marks: it.answer.map(i => ({ i, role })) };
  }
  if (f === 'capfix') return { text: it.right, marks: it.answer.map(i => ({ i, role: 'capital' })) };
  if (f === 'gaps') return { text: it.right, marks: [...it.answer, ...(it.optional || [])].sort((a, b) => a - b).map(i => ({ i, role: 'comma' })) };
  // sentence or fragment: the sentence and its label; a passage or a pick of two: the sentence that does the job
  if (it.label) return { text: it.text, marks: [], note: it.label };
  return { text: it.right, marks: [], ...(it.italic ? { italic: it.options[it.answer[0]] } : {}) };
}
/** The questions of this player's last run, after mastery, for "look back": [{ text, marks, italic?, ok }]. */
export function reviewOf(user, t) {
  const s = readRun(user, t.id);
  const list = s && (s.mastered ? s.history : s.lastMastered);
  if (!list) return [];
  return list.map(h => ({ ...rightOf(t, t.items[h.item]), ok: h.ok }));
}

// ------------------------------------------------------------------------------------------------- Mistake Hunt rooms
/** A topic's room as built (topics.json rooms: { title, passages, need, kinds }), or null. */
export const room = id => (data().rooms && Object.hasOwn(data().rooms, id) ? data().rooms[id] : null);
const ROOM_KEY = id => `room:${id}`;
/** The topics whose room this player has passed: Set of ids. */
export function roomPassedSet(user) {
  if (!user) return new Set();
  return new Set(q.all("SELECT topic, state FROM grammar_lab_quiz WHERE user_id=? AND topic LIKE 'room:%'", user.id)
    .filter(r => { try { return JSON.parse(r.state).passed === true; } catch { return false; } }).map(r => r.topic.slice(5)));
}
/** The room as a proofread step (services/proof-steps.js reads it the same way as a class's): hints allowed. */
const roomStep = r => ({ title: r.title, items: JSON.stringify({ tell: 'total', hints: true, passages: r.passages }), show_answers: 0 });
function readRoom(user, id) {
  const st = readRun(user, ROOM_KEY(id)) || {};
  return { edits: Array.isArray(st.edits) ? st.edits : [], handedIn: !!st.handedIn, marks: st.marks || '', score: st.score ?? null, hints: st.hints || 0,
    passed: st.passed === true, passedAt: st.passedAt || null, found: st.found || 0, tries: st.tries || 0 };
}
const rowOf = st => ({ status: st.handedIn ? 'done' : 'started', marks: st.marks, answer: JSON.stringify(st.edits), score: st.score, hints: st.hints });
/** The room as the game gets it (BRB.proofStep: the words students see, never the key until they hand in), plus the
 *  room's pass line and whether it is passed. */
function roomViewOf(id, st) {
  const r = room(id), step = roomStep(r);
  const view = PS.viewFor(step, null, rowOf(st), { teacher: st.handedIn });
  return { ...view, glRoom: { need: r.need, passed: st.passed } };
}
/** Opening the room: a try already handed in starts over (a room can be tried again); fixes not handed in are kept. */
export function roomOpen(user, id) {
  if (!user || !room(id)) return null;
  const st = readRoom(user, id);
  if (st.handedIn) { Object.assign(st, { edits: [], handedIn: false, marks: '', score: null, hints: 0, found: 0 }); saveRun(user, ROOM_KEY(id), st); }
  return roomViewOf(id, st);
}
/** The room's fixes from the game: saved, a hint answered (the key stays here), or handed in and checked with Mistake
 *  Hunt's checker. Handing in passes the room when at least its need of mistakes are found.
 *  -> { ok, view, hint?, passed? } | { ok: false, code } */
export function roomSave(user, id, edits, { handIn = false, hint = null } = {}) {
  const r = room(id);
  if (!user || !r) return { ok: false, code: 'notFound' };
  const step = roomStep(r), st = readRoom(user, id);
  if (st.handedIn) return { ok: false, code: 'handedIn' };
  const ce = PS.cleanEdits(step, edits);
  if (!ce.ok) return ce;
  st.edits = ce.edits;
  let h;
  if (Number.isInteger(hint)) {
    h = PS.hintFor(step, ce.edits, hint);
    if (h === undefined) return { ok: false, code: 'badRequest' };
    if (h) st.hints = Math.min(PS.HINTS_MAX, st.hints + 1);
  } else if (handIn) {
    const m = PS.markAll(step, ce.edits);
    Object.assign(st, { handedIn: true, marks: m.marks, score: m.score, found: m.found, tries: st.tries + 1 });
    if (m.found >= r.need && !st.passed) { st.passed = true; st.passedAt = now(); }
  }
  saveRun(user, ROOM_KEY(id), st);
  return { ok: true, view: roomViewOf(id, st), ...(h !== undefined ? { hint: h } : {}), ...(handIn ? { passed: st.passed } : {}) };
}
/** The link that opens a topic's room in the Mistake Hunt game (the band too when the unit is opened in a band other
 *  than its first, so "back" returns there). */
export const roomHref = (unitId, id, bandId = null) => {
  const first = pathway(unitId);
  return `/play/mistake-hunt?glroom=${encodeURIComponent(id)}&unit=${encodeURIComponent(unitId)}${bandId && first && first.band !== bandId ? `&band=${encodeURIComponent(bandId)}` : ''}`;
};

// ------------------------------------------------------------------------------------------------- read aloud
/** The teaching card as one spoken text (services/tts.js reads it; the page never sends text). */
export function cardSpoken(t) {
  const c = t.card;
  // a writing card: each section's question, its passage and its note
  if (c.sections) return c.sections.flatMap(x => [x.title, x.question, ...x.passage.map(y => y.text), x.note]).filter(Boolean).map(x => (/[.!?]$/.test(x) ? x : `${x}.`)).join(' ');
  // a lead or a note that runs into its quote ("The title is") is read with it, as one sentence
  const unit = u => (u ? [[u.lead, u.text].filter(Boolean).join(' '), u.then ? [u.note, u.then.text].filter(Boolean).join(' ') : u.note, u.then && u.then.note] : []);
  const end = x => (/[.!?]$/.test(x) ? x : `${x}.`);
  return [c.definition, ...unit(c.example), ...((c.example && c.example.more) || []).flatMap(unit), c.how, ...c.tips.flatMap(unit)]
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
