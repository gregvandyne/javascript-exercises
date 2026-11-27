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
// A new level starts with an empty streak. Items come in a seeded order; when a run needs more questions than the topic
// has items, the missed ones come back first, never the one just shown.
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
  const s = { v: 1, seed: String(seed), items, levels: levels.map(n => ({ quota: n, presented: 0 })), level: 0, streak: 0,
    queue: seededOrder(`${seed}|0`, items), deal: 1, cur: null, history: [], presented: 0, mastered: false };
  present(s);
  return s;
}
/** The next item: the queue's next; a new deal when it runs out (missed items first, not the one just shown). */
function nextItem(s) {
  if (!s.queue.length) {
    const last = s.cur ? s.cur.item : -1;
    const missed = [...new Set(s.history.filter(h => !h.ok).map(h => h.item))];
    const rest = seededOrder(`${s.seed}|${s.deal++}`, s.items).filter(i => !missed.includes(i));
    s.queue = [...missed, ...rest];
    if (s.queue.length > 1 && s.queue[0] === last) s.queue.push(s.queue.shift());
  }
  return s.queue.shift();
}
function present(s) {
  s.cur = { item: nextItem(s), missed: false };
  s.levels[s.level].presented++;
  s.presented++;
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

/** What the page shows, and nothing it could use to find an answer: the level, the streak, the counter and the bar. */
export function summary(s) {
  const total = totalOf(s);
  return {
    level: Math.min(s.level, s.levels.length - 1) + 1, levels: s.levels.length, need: NEED_IN_A_ROW,
    streak: s.mastered ? NEED_IN_A_ROW : s.streak,
    levelsDone: s.mastered ? s.levels.length : s.level,
    counter: s.presented, total,
    bar: Array.from({ length: total }, (_, i) => (s.history[i] ? (s.history[i].ok ? 'right' : 'missed') : 'empty')),
    missed: !!(s.cur && s.cur.missed), mastered: s.mastered,
  };
}
