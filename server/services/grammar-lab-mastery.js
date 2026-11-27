// Grammar Lab's mastery rule (owner, 2026-11-27), as pure code over a plain state object (stored as JSON per student
// per topic by services/grammar-lab.js, so the page holds nothing it could change):
//   - A topic has levels, each with a set number of questions: 3 levels of 4 (12 questions) for a standard topic.
//   - A level ends once its questions are answered AND its last two answers were right in a row. When the level's last
//     question is answered right but the one before it was not, the level gets one more question.
//   - A wrong answer adds one question to the level (once per question), empties the streak and shows the hint; the
//     question stays on screen with the wrong pick marked, and the student fixes it. The fix moves on to the next
//     question but is not a right answer: it never counts toward the streak or the bar.
//   - Picking too many words is a near miss: nothing changes, nothing is counted, the student unpicks and tries again.
//   - The counter counts questions presented (each question once, however many tries). The bar has one segment per
//     question in the topic's total; a segment fills (green) when its question is answered right, and a missed
//     question's segment is marked as missed, never filled. Retries never count twice.
// A new level starts with an empty streak. Items come in a seeded order, each once. A missed item comes back later in
// the run as "Try this one again" (owner, 2026-11-27): never right after it was missed (at least two other questions
// in between while fresh ones remain), and two of them never back to back while a fresh item could go between. Once
// every item has been shown, the missed ones come back again (never the one just shown). An item is never shown twice
// otherwise: only when a run needs more questions than that allows (the topic's last item missed, say) does an item
// answered right come back, least recently shown first, labeled as one seen before (cur.seen).
import crypto from 'node:crypto';

export const NEED_IN_A_ROW = 2;
export const DEFAULT_LEVELS = Object.freeze([4, 4, 4]);

/** A seeded shuffle of 0..n-1. */
export function seededOrder(seed, n) {
  const order = [...Array(n).keys()];
  let h = crypto.createHash('sha256').update(String(seed)).digest(), k = 0;
  for (let i = n - 1; i > 0; i--) {
    if (k + 2 > h.length) { h = crypto.createHash('sha256').update(h).digest(); k = 0; }
    const j = ((h[k] << 8) | h[k + 1]) % (i + 1); k += 2;
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** A fresh run, with its first question presented. */
export function newRun({ levels = DEFAULT_LEVELS, items, seed = 'run' }) {
  if (!Number.isInteger(items) || items < 1) throw new Error('newRun: no items');
  const s = { v: 2, seed: String(seed), items, levels: levels.map(n => ({ quota: n, presented: 0, base: n })), level: 0, streak: 0,
    queue: seededOrder(`${seed}|0`, items), again: [], seq: [], deal: 1, cur: null, history: [], presented: 0, mastered: false };
  present(s);
  return s;
}
/** Questions between a miss and its retry, at least (while fresh items remain). */
export const RETRY_GAP = 2;
/** The items shown so far, in order (a run from before v2 has only its history to go by). */
const seqOf = s => (s.seq ||= s.history.map(h => h.item));
/** The next item and how it is shown: { item, retry?, seen? }.
 *  1. a missed item whose turn has come (RETRY_GAP questions after its miss), unless the last one was a retry too;
 *  2. a fresh item (each item once, in the run's seeded order);
 *  3. with no fresh item left: a missed item waiting for its retry, then any missed item (a second retry), least
 *     recently shown first, never the one just shown;
 *  4. only when nothing else can go: an item answered right, least recently shown first (seen: one from before). */
function nextItem(s) {
  const last = s.cur ? s.cur.item : -1, lastRetry = !!(s.cur && s.cur.retry), n = s.presented + 1;
  s.again ||= [];
  const take = a => { s.again.splice(s.again.indexOf(a), 1); return { item: a.item, retry: true }; };
  const due = s.again.find(a => a.at <= n && a.item !== last);
  if (due && !lastRetry) return take(due);
  // (a run from before v2 refilled its queue with the missed items and a new deal: only fresh, never-shown items count)
  const seen = new Set(seqOf(s));
  while (s.queue.length && seen.has(s.queue[0])) s.queue.shift();
  if (s.queue.length) return { item: s.queue.shift() };
  const waiting = s.again.find(a => a.item !== last);
  if (waiting) return take(waiting);
  const lastShown = i => seqOf(s).lastIndexOf(i);
  const byOldest = list => [...new Set(list)].filter(i => i !== last).sort((a, b) => lastShown(a) - lastShown(b));
  const missed = byOldest(s.history.filter(h => !h.ok).map(h => h.item));
  if (missed.length) return { item: missed[0], retry: true };
  const right = byOldest(s.history.filter(h => h.ok).map(h => h.item));
  if (right.length) return { item: right[0], seen: true };
  return { item: last >= 0 ? last : 0, ...(last >= 0 ? { seen: true } : {}) };
}
function present(s) {
  const next = nextItem(s);
  s.cur = { item: next.item, missed: false, ...(next.retry ? { retry: true } : {}), ...(next.seen ? { seen: true } : {}) };
  s.levels[s.level].presented++;
  s.presented++;
  seqOf(s).push(next.item);
}
/** The topic's total questions as it stands (grows with wrong answers). */
export const totalOf = s => s.levels.reduce((n, l) => n + l.quota, 0);

/**
 * One graded try on the current question: result 'right' | 'wrong' | 'near'. Changes s in place.
 * -> { kind: 'right' | 'wrong' | 'again' | 'fixed' | 'near', levelDone: level index or null, mastered }
 *   right: answered right first time; wrong: first miss on this question (one question added); again: missed again
 *   (nothing changes); fixed: the missed question answered right (on to the next, not counted); near: too many words.
 */
export function answer(s, result) {
  const out = { kind: result, levelDone: null, mastered: false };
  if (s.mastered || !s.cur) return { ...out, kind: 'done' };
  if (result === 'near') return out;
  const L = s.levels[s.level];
  if (result === 'wrong') {
    if (s.cur.missed) return { ...out, kind: 'again' };
    s.cur.missed = true; s.streak = 0; L.quota++;
    s.history.push({ item: s.cur.item, ok: false, level: s.level });
    // it comes back later as "Try this one again" (nextItem)
    (s.again ||= []).push({ item: s.cur.item, at: s.presented + RETRY_GAP + 1 });
    return out;
  }
  if (result !== 'right') throw new Error(`answer: unknown result ${result}`);
  if (s.cur.missed) { present(s); return { ...out, kind: 'fixed' }; }
  s.streak++;
  s.history.push({ item: s.cur.item, ok: true, level: s.level });
  if (L.presented >= L.quota) {
    if (s.streak >= NEED_IN_A_ROW) {
      out.levelDone = s.level;
      if (s.level === s.levels.length - 1) { s.mastered = true; s.cur = null; out.mastered = true; return out; }
      s.level++; s.streak = 0;
    } else L.quota++;
  }
  present(s);
  return out;
}

/** The questions a level starts with (its quota before any miss). */
const baseOf = (l, i) => (Number.isInteger(l.base) ? l.base : DEFAULT_LEVELS[i] || DEFAULT_LEVELS[0]);
/** What the page shows, and nothing it could use to find an answer: the level, the streak, the counter and the bar.
 *  base: the topic's questions before any miss (12 for 3 levels of 4); added: the questions misses added (total - base);
 *  levelSize / levelBase: how many questions each level took so far and started with; firstTry: questions answered right
 *  on the first try, of answered (each question once). */
export function summary(s) {
  const total = totalOf(s), base = s.levels.reduce((n, l, i) => n + baseOf(l, i), 0);
  return {
    level: Math.min(s.level, s.levels.length - 1) + 1, levels: s.levels.length, need: NEED_IN_A_ROW,
    streak: s.mastered ? NEED_IN_A_ROW : s.streak,
    levelsDone: s.mastered ? s.levels.length : s.level,
    counter: s.presented, total, base, added: Math.max(0, total - base),
    levelSize: s.levels.map(l => l.presented), levelBase: s.levels.map(baseOf),
    firstTry: s.history.filter(h => h.ok).length, answered: s.history.length,
    bar: Array.from({ length: total }, (_, i) => (s.history[i] ? (s.history[i].ok ? 'right' : 'missed') : i >= base ? 'added' : 'empty')),
    missed: !!(s.cur && s.cur.missed), mastered: s.mastered,
  };
}
