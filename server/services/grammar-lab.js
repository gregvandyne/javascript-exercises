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
import { reachOf } from './grammar-lab-access.js';

export const SLUG = 'grammar-lab';
/** This course's grade store runs to grade 12 (owner, 2026-11-27); Number Quest's stays at 8 (its own deriveGrade). */
export const GRADE_CAP = 12;
const COURSE = Object.freeze({ slug: SLUG });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'seed-lessons/grammar-lab/topics.json');

let cache = null, usedIn = new Map();
const data = () => (cache ||= JSON.parse(fs.readFileSync(FILE, 'utf8')));
export const reload = () => { cache = null; usedIn = new Map(); };
// Read once, off the first request's path: the first lesson after a start or a deploy opens as fast as any other.
setImmediate(() => { try { data(); } catch { /* the first request reports it */ } });

// ------------------------------------------------------------------------------------------------- the course
export const bands = () => data().bands;
export const band = id => data().bands.find(b => b.id === id) || null;
export const topic = id => (Object.hasOwn(data().topics, id) ? data().topics[id] : null);
/** A unit: { id, title, band, parts, topics: [ids in order], marks: { id: 'checkpoint' | 'review' } }, or null. A unit
 *  shared by two bands may have a part for one band only (part.band: the K-2 and 3-5 Adjectives and Adverbs each have
 *  their own adverb topic). */
export function pathway(id, bandId = null) {
  const p = Object.hasOwn(data().pathways, id) ? data().pathways[id] : null;
  const b = p && data().bands.find(x => x.pathways.includes(id) && (!bandId || x.id === bandId));
  if (!p || !b) return null;
  const parts = p.parts.filter(x => !x.band || x.band === b.id);
  return { id, title: p.title, band: b.id, parts, topics: parts.flatMap(x => x.topics), marks: p.marks || {} };
}
/** Every unit that uses a topic (in every band): [unit]. */
export function unitsWith(id) {
  if (!usedIn.has(id)) usedIn.set(id, data().bands.flatMap(b => b.pathways.map(p => pathway(p, b.id)).filter(p => p && p.topics.includes(id))));
  return usedIn.get(id);
}
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
/** A guest's topics waiting for sign-in: Set of ids (a passed room waits as 'room:<topic>': roomPendingSet). */
export function pendingSet(user) {
  if (!user || !isGuestUser(user)) return new Set();
  return new Set(q.all("SELECT step FROM course_pending_wins WHERE user_id=? AND course=? AND kind='win'", user.id, SLUG).map(r => r.step).filter(k => !k.startsWith(ROOM_PREFIX)));
}
const ROOM_PREFIX = 'room:';
// What else wants to know when a player masters a topic or passes a room (services/grammar-lab-assign.js: the class
// assignments that this completes). Registered on import; called after the row is written.
const changeHandlers = [];
export const onGrammarChange = fn => { changeHandlers.push(fn); };
const changed = (user, what) => { for (const fn of changeHandlers) { try { fn(user, what); } catch { /* an assignment's sync never breaks the quiz */ } } };
/** Each topic of a unit with its state, worked out now from the rows (never cached):
 *  [{ topic, mastered, pending, open, started, part, mark, room }]. A topic opens when the one before it in the unit is
 *  mastered; a topic mastered anywhere (it is shared) is mastered, and open, in every unit that uses it.
 *  part: the part title above it (on a part's first topic only); mark: 'checkpoint' | 'review' | null; room: null (no
 *  room) or { passed, open }.
 *  A student who reaches only assigned work (services/grammar-lab-access.js reachOf): an assigned unit's topics open in
 *  the unit's order, an assigned topic and an assigned room open at once, and nothing else opens (a topic they mastered
 *  stays open); assigned says which topics are theirs to do. reach: the visitor's reach, when the caller has it. */
export function unitStates(user, p, reach = reachOf(user)) {
  const done = masteredSet(user), pend = pendingSet(user), passed = roomPassedSet(user);
  const runs = runLevels(user);
  const admin = !!user && user.role === 'admin';
  const partOf = new Map();
  for (const part of p.parts || []) if (part.title && part.topics.length) partOf.set(part.topics[0], part.title);
  let prev = true;
  return p.topics.map(id => {
    const t = topic(id);
    const mastered = done.has(id), pending = pend.has(id);
    // A guest's pending win opens the next topic for this sitting, as a guest's facts do in the other courses.
    const inOrder = reach.all || reach.units.has(p.id);
    const open = admin || mastered || pending || (inOrder && prev) || (!reach.all && reach.topics.has(id));
    const lv = runs.get(id);
    const s = { topic: t, mastered, pending, open, started: runs.has(id), level: !mastered && lv && lv.live ? lv : null, also: alsoIn(id, p),
      assigned: reach.all ? null : reach.units.has(p.id) || reach.topics.has(id),
      part: partOf.get(id) || null, mark: (p.marks || {})[id] || null,
      room: room(id) ? { passed: passed.has(id), open: open || (!reach.all && reach.rooms.has(id)) } : null };
    prev = mastered || pending;
    return s;
  });
}
/** Each topic this player has a quiz run on: Map(topic id -> { live (a run in progress, not mastered), level, levels }). */
function runLevels(user) {
  const out = new Map();
  if (!user) return out;
  for (const r of q.all("SELECT topic, state FROM grammar_lab_quiz WHERE user_id=? AND topic NOT LIKE 'room:%'", user.id)) {
    let st = null; try { st = JSON.parse(r.state); } catch { st = null; }
    const levels = st && Array.isArray(st.levels) ? st.levels.length : 0;
    out.set(r.topic, { live: !!(st && !st.mastered && levels), level: levels ? Math.min(st.level || 0, levels - 1) + 1 : 1, levels });
  }
  return out;
}
/** The other units that use this topic, by title, each once: mastering it here counts there too. With a unit: the other
 *  units of that unit's band (a K-2 student is not told about a 3-5 unit). */
export function alsoIn(id, p = null) {
  const seen = new Set(p ? [p.title] : []), out = [];
  for (const u of unitsWith(id)) if ((!p || u.band === p.band) && !seen.has(u.title)) { seen.add(u.title); out.push({ id: u.id, band: u.band, title: u.title }); }
  return out;
}
/** A unit's ring: { done, total, started (in progress: a run going, not mastered) } from the live topic states. */
export function unitProgress(user, p, reach = reachOf(user)) {
  const list = unitStates(user, p, reach);
  return { done: list.filter(s => s.mastered).length, total: list.length, started: list.filter(s => !s.mastered && s.level).length };
}
/** A band's counts for the course page: distinct topics mastered and in progress across its units. */
export function bandProgress(user, units) {
  const mastered = new Set(), started = new Set();
  for (const { p } of units) for (const s of unitStates(user, p)) { if (s.mastered) mastered.add(s.topic.id); else if (s.level) started.add(s.topic.id); }
  return { mastered: mastered.size, started: started.size };
}
/** The next topic to master, live, never a mastered one (nor a guest's pending one, nor `afterId`): the first open one in
 *  this unit, else the first open one in the band's other units, in order. -> { ...state, unit } or null. */
export function nextTopic(user, p, afterId = null) {
  const reach = reachOf(user);
  const pick = u => {
    const s = unitStates(user, u, reach).find(x => x.open && !x.mastered && !x.pending && x.topic.id !== afterId);
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
  changed(user, { topic: id });
}
// A guest's mastery, once they sign in (services/courses.js applyPendingWins): the topic is mastered for real. A guest's
// passed room ('room:<topic>') is carried over the same way: the room is passed on the account (its own fixes stay with
// the guest's sitting; the pass is what counts).
onPendingWin(SLUG, (user, id) => {
  if (id.startsWith(ROOM_PREFIX)) { const tid = id.slice(ROOM_PREFIX.length); if (!room(tid)) return false; markRoomPassed(user, tid); return true; }
  if (!topic(id)) return false; markMastered(user, id); return true;
});

// ------------------------------------------------------------------------------------------------- the quiz
function readRun(user, id) {
  const r = user && q.get('SELECT state FROM grammar_lab_quiz WHERE user_id=? AND topic=?', user.id, id);
  if (!r) return null;
  let s; try { s = JSON.parse(r.state); } catch { return null; }
  return id.startsWith(ROOM_PREFIX) ? s : fitRun(user, id, s);
}
/** A run kept across a change to its topic's items (a rebuild that added or took out items): its progress stays (level,
 *  streak, counter, bar), and every item place it holds is one the topic has now. A question on screen whose item is
 *  gone is swapped for one the run has not shown. -> the run (saved when it changed). */
function fitRun(user, id, s) {
  const t = topic(id);
  if (!s || !t || s.mastered || !s.cur || !Array.isArray(s.levels)) return s;
  const n = t.items.length;
  if (s.items === n && s.cur.item < n) return s;
  const ok = i => Number.isInteger(i) && i >= 0 && i < n;
  s.items = n;
  s.queue = (s.queue || []).filter(ok);
  s.again = (s.again || []).filter(a => ok(a.item));
  s.history = s.history.filter(h => ok(h.item));
  s.seq = (s.seq || []).filter(ok);
  const shown = new Set(s.seq);
  for (let i = 0; i < n; i++) if (!shown.has(i) && !s.queue.includes(i)) s.queue.push(i);
  if (!ok(s.cur.item)) s.cur = { item: s.queue.length ? s.queue.shift() : 0, missed: false };
  saveRun(user, id, s);
  return s;
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
  // how many times this player started the topic's quiz (the teacher's "attempts")
  s.runs = ((have && have.runs) || (have ? 1 : 0)) + 1;
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
  // again: a missed question back for another try; seen: one answered right before (only when a run needs it)
  // hint: a question already missed keeps its hint (a page opened again, another tab, a re-sync: the hint is not lost)
  const base = { id: it.id, n: s.presented, ask: it.ask || t.ask, kind, ...(s.cur.retry ? { again: true } : {}), ...(s.cur.seen ? { seen: true } : {}), ...(s.cur.missed && it.hint ? { hint: it.hint } : {}) };
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
  return { ...base, words: tokenize(it.text), need: it.answer.length, ...(f === 'capfix' ? { capfix: true } : {}), ...(it.asIs ? { asIs: true } : {}), ...(it.focus && it.focus.length ? { focus: it.focus } : {}), ...(it.titleAt ? { titleAt: it.titleAt } : {}) };
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
  // "It's right as it is" (a topic with read.asIs): right when the sentence needs no fix (marks, a fix, capitalization)
  if (marked === AS_IS && item.asIs && (kind === 'marks' || kind === 'tap' || (kind === 'fix' && !missed))) {
    if (kind === 'tap') return item.answer.length ? 'wrong' : 'right';   // capitalization: no word to fix
    // marks: right when every needed mark is there as written and the rest are optional ones (a comma before a trailing
    // "including" is taken with or without)
    return (kind === 'fix' ? item.accept.some(a => normTyped(a) === normTyped(item.text)) : marksAsWritten(item)) ? 'right' : 'wrong';
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
  // a sentence right as it is: any word tapped is wrong (not a near miss)
  if (!item.answer.length) return 'wrong';
  // a phrase: its words, and any optional ones (an article) with them; another mention of the same person is right too
  const ways = [{ answer: item.answer, optional: item.optional || [] }, ...(item.alts || [])];
  if (ways.some(w => w.answer.every(i => set.has(i)) && [...set].every(i => w.answer.includes(i) || w.optional.includes(i)))) return 'right';
  if (set.size > Math.max(...ways.map(w => w.answer.length + w.optional.length))) return 'near';
  return 'wrong';
}
/** The page's "It's right as it is". */
export const AS_IS = 'as-is';
const marksAsWritten = it => {
  const s = new Map(it.start), w = new Map(it.want), o = new Map(it.optional);
  return [...w].every(([g, m]) => s.get(g) === m) && [...s].every(([g, m]) => w.get(g) === m || o.get(g) === m);
};
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
  if (handIn && st.passed) {
    // A guest's pass waits for sign-in, as a mastered topic does (honored by onPendingWin above).
    if (isGuestUser(user)) stashPendingFact(user, COURSE, { key: `${ROOM_PREFIX}${id}` }, 'win');
    else changed(user, { room: id });
  }
  return { ok: true, view: roomViewOf(id, st), ...(h !== undefined ? { hint: h } : {}), ...(handIn ? { passed: st.passed } : {}) };
}
/** A room passed on this account without a try here (a guest's pass honored at sign-in): kept when already passed. */
function markRoomPassed(user, id) {
  const st = readRoom(user, id);
  if (st.passed) return;
  Object.assign(st, { passed: true, passedAt: now() });
  saveRun(user, ROOM_KEY(id), st);
  changed(user, { room: id });
}
/** A room's tries for one player: { passed, tries, found, passedAt } (the teacher's views). */
export const roomInfo = (user, id) => { const st = readRoom(user, id); return { passed: st.passed, tries: st.tries, found: st.found, passedAt: st.passedAt }; };
/** The link that opens a topic's room in the Mistake Hunt game (the band too when the unit is opened in a band other
 *  than its first, so "back" returns there). */
export const roomHref = (unitId, id, bandId = null) => {
  const first = pathway(unitId);
  return `/play/mistake-hunt?glroom=${encodeURIComponent(id)}&unit=${encodeURIComponent(unitId)}${bandId && first && first.band !== bandId ? `&band=${encodeURIComponent(bandId)}` : ''}`;
};

// ------------------------------------------------------------------------------------------------- read aloud
/** The teaching card as one spoken text (services/tts.js reads it; the page never sends text). */
export function cardSpoken(t, { small = false } = {}) {
  const c = t.card;
  // a writing card: each section's question, its passage and its note (the hint's small card: no passage)
  if (c.sections) return c.sections.flatMap(x => [x.title, x.question, ...(small ? [] : x.passage.map(y => y.text)), x.note]).filter(Boolean).map(x => (/[.!?]$/.test(x) ? x : `${x}.`)).join(' ');
  // a lead or a note that runs into its quote ("The title is") is read with it, as one sentence
  const unit = u => (u ? [[u.lead, u.text].filter(Boolean).join(' '), u.then ? [u.note, u.then.text].filter(Boolean).join(' ') : u.note, u.then && u.then.note] : []);
  const end = x => (/[.!?]$/.test(x) ? x : `${x}.`);
  return [c.definition, ...unit(c.example), ...((c.example && c.example.more) || []).flatMap(unit), c.how, ...(small ? [] : c.tips.flatMap(unit))]
    .filter(Boolean).map(x => end(String(x).trim())).join(' ');
}
const said = x => { const v = String(x || '').replace(/\s+/g, ' ').trim(); return !v ? '' : /[.!?]["'\u201d\u2019)]*$/.test(v) ? v : `${v}.`; };
/** The question on screen as it is read aloud (a K-2 question's listen button; routes/tts.js ctx 'grammar'): the line
 *  that asks, then the sentence (its blank read as "blank") and the choices, exactly as the page shows them. Course text
 *  only, never anything the student typed or their name. '' with no question on screen. */
export function questionSpoken(t, s) {
  const qn = questionFor(t, s);
  if (!qn) return '';
  const it = t.items[s.cur.item];
  const parts = [qn.ask];
  if (qn.kind === 'choice') {
    if (qn.prompt) parts.push(qn.prompt);
    if (!qn.whole) parts.push(it.plain ? it.text : String(it.text).replace(/_{3,}/g, 'blank'));
    parts.push(...qn.options);
  } else if (qn.kind === 'marks') {
    const at = new Map(qn.start || []);
    parts.push(qn.words.map((w, i) => `${w}${at.get(i) || ''}`).join(' '));
  } else parts.push(it.text);
  return parts.map(said).filter(Boolean).join(' ');
}
/** The hint as it is read aloud, only once it shows (after a wrong answer): the hint's line, then the small card under
 *  it. '' when no hint is showing. */
export function hintSpoken(t, s) {
  if (!s || !s.cur || !s.cur.missed) return '';
  const it = t.items[s.cur.item];
  return [said(it.hint), cardSpoken(t, { small: true })].filter(Boolean).join(' ');
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

// ------------------------------------------------------------------------------------------------- placement
// Number Quest's pattern (services/number-quest-placement.js: the grade seeds the start, a grown-up's override is
// absolute), without a placement game: the grade the platform knows picks the band, and a teacher's choice of band
// always wins. The grade, first found of: the grade the student declared here (grammar_lab_place, moving up each
// September 1 by deriveGrade, to grade 12), Number Quest's declared grade (moving the same way, here to grade 12), the
// school's roster grade, the class's grade. A guest has none stored: their band is the one they pick for this visit.
export const BAND_IDS = Object.freeze(['k-2', '3-5', '6-8', '9-12']);
/** The band of a grade (0 is K): K-2, 3-5, 6-8 or 9-12. */
export const bandOfGrade = g => (g <= 2 ? 'k-2' : g <= 5 ? '3-5' : g <= 8 ? '6-8' : '9-12');
/** A grade as people write it ("K", "4", "Grade 4", "3-4": the first one) -> 0..12, or null. */
export function gradeNumber(v) {
  const m = /(?:^|\D)(k|\d{1,2})(?!\d)/i.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  const g = m[1].toLowerCase() === 'k' ? 0 : Number(m[1]);
  return g >= 0 && g <= GRADE_CAP ? g : null;
}
const placeRow = id => (id ? q.get('SELECT * FROM grammar_lab_place WHERE user_id=?', id) : null) || null;
/** The student's grade now, and where it came from: { grade (0..12) | null, from: 'declared' | 'number-quest' |
 *  'school' | 'class' | null }. */
export function gradeOf(user) {
  if (!user || !user.id || isGuestUser(user)) return { grade: null, from: null };
  const row = placeRow(user.id);
  if (row && row.grade !== null) { const g = deriveGrade(row.grade, row.grade_declared_at); if (g !== null) return { grade: g, from: 'declared' }; }
  const nq = q.get('SELECT grade, grade_declared_at FROM nq_placement WHERE user_id=?', user.id);
  if (nq && nq.grade !== null) { const g = deriveGrade(nq.grade, nq.grade_declared_at); if (g !== null) return { grade: g, from: 'number-quest' }; }
  for (const r of q.all("SELECT grade FROM school_members WHERE user_id=? AND role='student' AND status='active' ORDER BY joined_at", user.id)) {
    const g = gradeNumber(r.grade); if (g !== null) return { grade: g, from: 'school' };
  }
  for (const r of q.all(`SELECT c.grade FROM class_members m JOIN classrooms c ON c.id=m.class_id AND c.archived_at IS NULL
      WHERE m.user_id=? AND m.role='student' AND m.status='active' ORDER BY m.joined_at`, user.id)) {
    const g = gradeNumber(r.grade); if (g !== null) return { grade: g, from: 'class' };
  }
  return { grade: null, from: null };
}
/** Where this student starts: { band (a band id) | null, grade, from: 'teacher' (a teacher's choice, absolute) |
 *  'grade' (seeded by the grade) | null (nothing known yet), setBy }. */
export function placeOf(user) {
  const g = gradeOf(user), row = user && user.id && !isGuestUser(user) ? placeRow(user.id) : null;
  if (row && row.band && BAND_IDS.includes(row.band)) return { band: row.band, grade: g.grade, gradeFrom: g.from, from: 'teacher', setBy: row.set_by || null };
  if (g.grade !== null) return { band: bandOfGrade(g.grade), grade: g.grade, gradeFrom: g.from, from: 'grade', setBy: null };
  return { band: null, grade: null, gradeFrom: null, from: null, setBy: null };
}
/** The student's own grade, declared on the course page (0..12; 'K' is 0). Never for a guest. -> placeOf | null */
export function declareGrade(user, grade) {
  const g = gradeNumber(grade);
  if (!user || !user.id || isGuestUser(user) || g === null) return null;
  const t = now();
  q.run(`INSERT INTO grammar_lab_place(user_id, grade, grade_declared_at, band, set_by, updated_at) VALUES (?,?,?,NULL,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET grade=excluded.grade, grade_declared_at=excluded.grade_declared_at, updated_at=excluded.updated_at`, user.id, g, t, t);
  return placeOf(user);
}
/** A teacher's choice of band for a student (absolute: it wins over any grade), or null to go back to the grade. The
 *  caller checks who may (services/grammar-lab-assign.js setBand). -> placeOf */
export function setBandFor(student, band, byId) {
  const b = band === null || band === '' ? null : BAND_IDS.includes(band) ? band : undefined;
  if (!student || !student.id || isGuestUser(student) || b === undefined) return null;
  q.run(`INSERT INTO grammar_lab_place(user_id, grade, grade_declared_at, band, set_by, updated_at) VALUES (?,NULL,NULL,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET band=excluded.band, set_by=excluded.set_by, updated_at=excluded.updated_at`, student.id, b, b ? byId : null, now());
  return placeOf(student);
}

// A school account merged into a student's own account brings its quiz runs and placement (the student's own rows win).
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE grammar_lab_quiz SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM grammar_lab_quiz WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE grammar_lab_place SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM grammar_lab_place WHERE user_id=?', from);
});
