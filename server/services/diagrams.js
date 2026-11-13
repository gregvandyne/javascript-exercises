// The drawn diagram types that views/nq-diagrams.js draws (grid, squares, lines, chart, table), cleaned the way
// services/courses.js cleanSlide cleans the older types: strictly shaped per type, every string capped, every
// number checked; anything malformed returns null and the slide drops the whole visual (fromDeck reports it).
export const DIAGRAM_TYPES = Object.freeze(['grid', 'squares', 'lines', 'chart', 'table', 'letters', 'spinner', 'build', 'tally', 'swap', 'split', 'ladder', 'fix', 'counters']);
export const LINE_KINDS = Object.freeze(['parallel', 'perpendicular', 'crossing']);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const txt = (x, max) => (typeof x === 'number' && Number.isFinite(x) ? String(x) : str(x, max));

/** One cleaned diagram ({ type, label, ...its data }) or null. `label` is the already-cleaned alt label. */
export function cleanDiagram(v, label) {
  if (!label || !v || typeof v !== 'object') return null;
  if (v.type === 'grid') {
    if (!int(v.cols, 2, 8) || !int(v.rows, 2, 6)) return null;
    const p = v.point;
    if (p != null && !(p && int(p.x, 0, v.cols) && int(p.y, 0, v.rows) && (p.label == null || str(p.label, 10)))) return null;
    return { type: 'grid', label, cols: v.cols, rows: v.rows,
      ...(p ? { point: { x: p.x, y: p.y, ...(p.label ? { label: str(p.label, 10) } : {}) } } : {}),
      ...(v.walk && p ? { walk: true } : {}),
      ...(str(v.xName, 8) ? { xName: str(v.xName, 8) } : {}), ...(str(v.yName, 8) ? { yName: str(v.yName, 8) } : {}) };
  }
  if (v.type === 'squares') {
    if (!Array.isArray(v.shapes) || v.shapes.length < 1 || v.shapes.length > 3) return null;
    if (!v.shapes.every(q => q && int(q.rows, 1, 6) && int(q.cols, 1, 10) && (q.tone == null || int(q.tone, 0, 3)))) return null;
    if (v.shapes.reduce((a, q) => a + q.cols, 0) > 16) return null;
    return { type: 'squares', label, ...(v.fence ? { fence: true } : {}),
      shapes: v.shapes.map(q => ({ rows: q.rows, cols: q.cols, ...(q.tone != null ? { tone: q.tone } : {}),
        ...(txt(q.top, 10) ? { top: txt(q.top, 10) } : {}), ...(txt(q.side, 10) ? { side: txt(q.side, 10) } : {}), ...(str(q.name, 24) ? { name: str(q.name, 24) } : {}) })) };
  }
  if (v.type === 'lines') {
    if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > 3) return null;
    if (!v.items.every(it => it && LINE_KINDS.includes(it.kind) && str(it.name, 14))) return null;
    return { type: 'lines', label, items: v.items.map(it => ({ kind: it.kind, name: str(it.name, 14) })) };
  }
  if (v.type === 'chart') {
    if (!int(v.max, 1, 1000) || !int(v.step, 1, v.max) || v.max % v.step || v.max / v.step > 10) return null;
    if (!Array.isArray(v.bars) || v.bars.length < 2 || v.bars.length > 5) return null;
    if (!v.bars.every(b => b && str(b.label, 10) && typeof b.value === 'number' && b.value >= 0 && b.value <= v.max && (b.tone == null || int(b.tone, 0, 3)))) return null;
    return { type: 'chart', label, max: v.max, step: v.step, ...(str(v.unit, 20) ? { unit: str(v.unit, 20) } : {}),
      bars: v.bars.map(b => ({ label: str(b.label, 10), value: b.value, ...(b.tone != null ? { tone: b.tone } : {}) })) };
  }
  if (v.type === 'table') {
    if (!Array.isArray(v.head) || v.head.length < 2 || v.head.length > 5 || !v.head.every(h => txt(h, 10))) return null;
    if (!Array.isArray(v.rows) || v.rows.length < 1 || v.rows.length > 4) return null;
    if (!v.rows.every(r => Array.isArray(r) && r.length === v.head.length && r.every(c => txt(c, 10)))) return null;
    if (v.mark != null && !int(v.mark, 0, v.rows.length - 1)) return null;
    return { type: 'table', label, head: v.head.map(h => txt(h, 10)), rows: v.rows.map(r => r.map(c => txt(c, 10))), ...(v.mark != null ? { mark: v.mark } : {}) };
  }
  if (v.type === 'letters') {
    if (!Array.isArray(v.items) || v.items.length < 2 || v.items.length > 4) return null;
    if (!v.items.every(it => it && /^[A-Z]$/.test(it.ch) && str(it.name, 14))) return null;
    return { type: 'letters', label, items: v.items.map(it => ({ ch: it.ch, name: str(it.name, 14), ...(it.fold ? { fold: true } : {}) })) };
  }
  if (v.type === 'spinner') {
    if (!int(v.parts, 2, 12) || !int(v.shaded, 0, v.parts)) return null;
    // `pie` (Launchpad Unit 6): a circle cut in equal shares with some shaded, and no pointer (a pie, not a spinner)
    return { type: 'spinner', label, parts: v.parts, shaded: v.shaded, ...(v.pie ? { pie: true } : {}), ...(str(v.left, 16) ? { left: str(v.left, 16) } : {}), ...(str(v.right, 16) ? { right: str(v.right, 16) } : {}) };
  }
  if (v.type === 'build') {
    if (!Array.isArray(v.digits) || v.digits.length < 2 || v.digits.length > 5 || !v.digits.every(d => /^\d$/.test(d))) return null;
    return { type: 'build', label, digits: [...v.digits], ...(str(v.number, 8) ? { number: str(v.number, 8) } : {}) };
  }
  if (v.type === 'tally') {
    // a survey's tally: one row per answer, its marks drawn in fives (four lines, one across) and its count
    if (!Array.isArray(v.rows) || v.rows.length < 2 || v.rows.length > 4) return null;
    if (!v.rows.every(r => r && str(r.label, 10) && int(r.n, 0, 15))) return null;
    return { type: 'tally', label, rows: v.rows.map(r => ({ label: str(r.label, 10), n: r.n })) };
  }
  if (v.type === 'swap') {
    const ok = a => Array.isArray(a) && a.length >= 2 && a.length <= 4 && a.every(t => txt(t, 3));
    if (!ok(v.before) || !ok(v.after) || !Array.isArray(v.mark) || v.mark.length < 1 || !v.mark.every(i => int(i, 0, v.before.length - 1))) return null;
    return { type: 'swap', label, before: v.before.map(t => txt(t, 3)), after: v.after.map(t => txt(t, 3)), mark: [...new Set(v.mark)],
      ...(str(v.badName, 14) ? { badName: str(v.badName, 14) } : {}), ...(str(v.goodName, 16) ? { goodName: str(v.goodName, 16) } : {}) };
  }
  if (v.type === 'split') {
    if (!Array.isArray(v.parts) || v.parts.length < 2 || v.parts.length > 3) return null;
    if (!v.parts.every(p => p && typeof p.w === 'number' && p.w > 0 && p.w <= 1 && txt(p.label, 14) && (p.tone == null || int(p.tone, 0, 3)))) return null;
    if (Math.abs(v.parts.reduce((a, p) => a + p.w, 0) - 1) > 0.02) return null;
    return { type: 'split', label, ...(str(v.whole, 16) ? { whole: str(v.whole, 16) } : {}), parts: v.parts.map(p => ({ w: p.w, label: txt(p.label, 14), ...(p.tone != null ? { tone: p.tone } : {}) })) };
  }
  if (v.type === 'ladder') {
    if (!Array.isArray(v.words) || v.words.length < 2 || v.words.length > 5 || !v.words.every(w => str(w, 14))) return null;
    return { type: 'ladder', label, words: v.words.map(w => str(w, 14)), ...(str(v.up, 14) ? { up: str(v.up, 14) } : {}), ...(str(v.down, 14) ? { down: str(v.down, 14) } : {}) };
  }
  if (v.type === 'fix') {
    // a Jumble beat: the wrong answer, the trick's steps (1-2 lines, so the two cards fit the frame), the right answer; the card names are optional
    // every line whole (a cut equation would teach something false): over 18 characters, the diagram is dropped
    const line = t => !!txt(t, 18) && String(t).trim().length <= 18;
    if (!line(v.wrong) || !line(v.right) || !Array.isArray(v.steps) || v.steps.length < 1 || v.steps.length > 2 || !v.steps.every(line)) return null;
    return { type: 'fix', label, wrong: txt(v.wrong, 18), steps: v.steps.map(t => txt(t, 18)), right: txt(v.right, 18),
      ...(str(v.badName, 18) ? { badName: str(v.badName, 18) } : {}), ...(str(v.goodName, 18) ? { goodName: str(v.goodName, 18) } : {}), ...(str(v.wrongNote, 18) ? { wrongNote: str(v.wrongNote, 18) } : {}) };
  }
  if (v.type === 'counters') {
    // counters to count and match (Launchpad): one group of 1-20, or two rows of 1-10 set one under the other so they
    // match one to one; `count` numbers each counter in order; `frame` sets a single group's first ten in a ten-frame;
    // `split` (Unit 2) shows a single group of 2-10 as two parts, the first `split` counters and the rest in a second
    // tone with each part's size under it, and `away` draws the second part as empty outlines (they went away);
    // `tens` (Unit 3) draws a number from 10 to 99 as sticks of ten and loose ones (one number, or two side by side);
    // `balance` (Unit 4, on the diagram itself) sets two groups of 1-20 on the two sides of a see-saw beam, level when
    // they are the same and leaning to the heavier side when not: a side may be `split` into two parts (5 + 2), and
    // `hide` (with `split`) draws its second part as a box marked "?" that weighs nothing yet (8 + ?);
    // `hundreds` (Unit 5) draws one number from 100 to 999 as flats of a hundred, sticks of ten and loose ones, with
    // an empty place left empty (407 has no sticks)
    if (!Array.isArray(v.groups) || v.groups.length < 1 || v.groups.length > 2) return null;
    if (v.groups.some(q => q && q.hundreds)) {
      const q = v.groups[0];
      if (v.groups.length !== 1 || v.balance || !int(q.n, 100, 999) || q.tone != null || q.name != null || q.frame || q.count || q.split != null || q.away || q.tens || q.hide) return null;
      return { type: 'counters', label, groups: [{ n: q.n, hundreds: true }] };
    }
    if (v.balance) {
      if (v.groups.length !== 2 || !v.groups.every(q => q && int(q.n, 1, 20) && q.tone == null && q.name == null && !q.frame && !q.count && !q.away && !q.tens
        && (q.split == null || int(q.split, 1, q.n - 1)) && (!q.hide || q.split != null))) return null;
      return { type: 'counters', label, balance: true, groups: v.groups.map(q => ({ n: q.n, ...(q.split != null ? { split: q.split } : {}), ...(q.hide ? { hide: true } : {}) })) };
    }
    if (v.groups.some(q => q && q.tens)) {
      if (!v.groups.every(q => q && q.tens && int(q.n, 10, 99) && q.tone == null && q.name == null && !q.frame && !q.count && q.split == null && !q.away)) return null;
      return { type: 'counters', label, groups: v.groups.map(q => ({ n: q.n, tens: true })) };
    }
    if (!v.groups.every(q => q && int(q.n, 1, 20) && (q.tone == null || int(q.tone, 0, 3)))) return null;
    const two = v.groups.length === 2;
    if (two && v.groups.some(q => q.n > 10 || q.frame || q.split != null || q.away)) return null;
    if (v.groups.some(q => (q.split != null && !(q.n <= 10 && int(q.split, 1, q.n - 1))) || (q.away && (q.split == null || q.frame)))) return null;
    return { type: 'counters', label, groups: v.groups.map(q => ({ n: q.n, ...(q.tone != null ? { tone: q.tone } : {}), ...(txt(q.name, two ? 8 : 12) ? { name: txt(q.name, two ? 8 : 12) } : {}),
      ...(q.frame ? { frame: true } : {}), ...(q.count ? { count: true } : {}), ...(q.split != null ? { split: q.split } : {}), ...(q.away ? { away: true } : {}) })) };
  }
  return null;
}
