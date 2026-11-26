// Homeroom lessons (step 2b; docs/decisions.md "Homeroom, step 2b"): what a lesson's settings are for each game it can
// be built for, and how its exact problems are made. Shared by the lesson builder (public/js/homeroom-lessons.js: the
// settings, the problems it shows in the worksheet preview, a version for each group) and the server
// (services/homeroom-lessons.js: it checks every setting and every problem again, and turns them into the game's own
// question set, which services/game-sets.js cleans as any set). Numbers, fixed words and the teacher's crossword words
// and flashcards only; nothing here knows who will play.
//
//   arithmetic-lab   { op, method, size, count, level, problems: [[a, b]], seed }  ->  one item { k, p, l, m? }
//   algebra-builder  { mode, level, count, tiles, problems: ['2x+3=7'], seed }     ->  [{ a, p, s, l }]
//   crossword        { words: [[word, clue]], bank, hints, seed }                  ->  one item { t, w, r, b, h }
//   flashcards       { cards: [[term, definition, emoji]], a: 't'|'d', seed }       ->  one item { t, c, a }
//
// A lesson is exact: the problems are made once (from a seed, so the builder's preview and the saved set are the same
// problems) and every student of a version gets those. "New problems" is a new seed.

/** The games a lesson can be built for now, in the spec's order; the rest of the order comes later. */
export const LESSON_SLUGS = ['arithmetic-lab', 'algebra-builder', 'crossword', 'flashcards'];
/** What comes next in the builder (docs/homeroom.md "Lesson builder order"), shown as coming later. */
export const LATER = ['quiz', 'atlas-quest', 'sudoku', 'manipulatives', 'figures', 'reading'];

export const ARITH = {
  ops: ['add', 'subtract', 'multiply', 'divide'],
  methods: { add: ['standard'], subtract: ['standard'], multiply: ['standard', 'area', 'partial'], divide: ['standard', 'ladder', 'area'] },
  // [name, the top number's range, the bottom number's range] from easiest to hardest (the game's own rules hold for all)
  sizes: {
    add: [['2', [10, 99], [10, 99]], ['3', [100, 999], [100, 999]], ['4', [1000, 9999], [1000, 9999]]],
    subtract: [['2', [10, 99], [10, 99]], ['3', [100, 999], [100, 999]], ['4', [1000, 9999], [1000, 9999]]],
    multiply: [['2x1', [10, 99], [2, 9]], ['3x1', [100, 999], [2, 9]], ['2x2', [10, 99], [10, 99]], ['3x2', [100, 999], [10, 99]]],
    divide: [['2/1', [10, 99], [2, 9]], ['3/1', [100, 999], [2, 9]], ['4/1', [1000, 9999], [2, 9]], ['4/2', [1000, 9999], [11, 99]]],
  },
  counts: [5, 10, 15, 20],
  // The game's help levels, most help first (Arithmetic Lab: Watch, Count up, Guided, On my own).
  levels: ['watch', 'countUp', 'guided', 'onMyOwn'],
};
export const ALGEBRA = { modes: ['solve', 'multiply', 'factor'], levels: ['easy', 'medium', 'hard'], counts: [5, 8, 10], tiles: ['all', 'none'] };
export const CROSS = { min: 3, max: 30, word: 24, clue: 150 };
/** Flashcards' limits (services/game-sets.js FLASH): cards, a term's and a definition's length. a: what students answer
 *  with in Learn and Test, 't' the term (they see the definition) or 'd' the definition. */
export const FLASH = { min: 2, max: 50, term: 60, def: 160, answers: ['t', 'd'] };

// ---------------------------------------------------------------- a seeded random (the same problems from a seed)
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const newSeed = () => 1 + Math.floor(Math.random() * 999998);
const cleanSeed = s => (Number.isInteger(s) && s >= 1 && s <= 999999 ? s : 1);

// ---------------------------------------------------------------- Arithmetic Lab
const sizeOf = (op, name) => (ARITH.sizes[op] || []).find(x => x[0] === name) || null;
/** Is [a, b] a problem of this operation and size (and one the game works: services/game-sets.js bbCheck agrees)? */
export function arithFits(op, size, a, b) {
  const z = sizeOf(op, size);
  if (!z || !Number.isInteger(a) || !Number.isInteger(b)) return false;
  const [, [tl, th], [bl, bh]] = z;
  if (a < tl || a > th || b < bl || b > bh) return false;
  if (op === 'subtract') return a > b;
  if (op === 'divide') return a >= b;
  if (op === 'multiply') return String(b).length <= String(a).length;
  return true;
}
/** count problems of this operation and size from a seed, no two the same (as many as there are when the size is small). */
export function makeArith(op, size, count, seed) {
  const z = sizeOf(op, size); if (!z) return [];
  const r = rng(seed), [, [tl, th], [bl, bh]] = z, out = [], seen = new Set();
  const pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let tries = 0; out.length < count && tries < 4000; tries++) {
    let a = pick(tl, th), b = pick(bl, bh);
    if (op === 'subtract' && a < b) [a, b] = [b, a];
    // Long division: mostly with a remainder, sometimes coming out even (the game's own sets mix them too).
    if (op === 'divide' && r() < 0.35) a -= a % b;
    if (!arithFits(op, size, a, b)) continue;
    const k = `${a}:${b}`; if (seen.has(k)) continue;
    seen.add(k); out.push([a, b]);
  }
  return out;
}

// ---------------------------------------------------------------- Algebra Builder (its own practice maker, seeded)
/** A polynomial (lowest power first) as a teacher types it: 2x^2-5x-3. */
export function polyText(p) {
  let s = '';
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i]; if (!c) continue;
    const a = Math.abs(c), sign = c < 0 ? '-' : s ? '+' : '';
    s += sign + (i === 0 ? String(a) : `${a === 1 ? '' : a}${i === 1 ? 'x' : `x^${i}`}`);
  }
  return s || '0';
}
const mul = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
function makeOne(mode, level, r) {
  const rand = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const nonzero = (lo, hi) => { let n = 0; while (n === 0) n = rand(lo, hi); return n; };
  if (mode === 'solve') {
    const x = level === 'easy' ? rand(1, 9) : nonzero(-6, 9);
    if (level === 'hard') {
      let a = rand(1, 5), c = rand(1, 5);
      if (a === c) return null;
      if (r() < 0.5) [a, c] = [c, a];
      const b = rand(-9, 9), d = a * x + b - c * x;
      if (Math.abs(d) > 12 || (b === 0 && d === 0)) return null;
      return `${polyText([b, a])}=${polyText([d, c])}`;
    }
    const a = level === 'easy' ? rand(1, 3) : rand(2, 4), b = level === 'easy' ? rand(0, 9) : nonzero(-9, 9);
    if (a === 1 && b === 0) return null;
    const c = a * x + b;
    if (c === 0 || Math.abs(c) > 25) return null;
    return `${polyText([b, a])}=${c}`;
  }
  let p = 1, q = 1, a, b;
  if (level === 'easy') {
    if (r() < 0.3) { p = rand(1, 2); a = 0; } else a = rand(1, 6);
    b = rand(1, 6);
  } else if (level === 'medium') {
    a = nonzero(-6, 6); b = nonzero(-6, 6);
    if (a > 0 && b > 0) return null;
  } else {
    p = rand(1, 2); q = rand(2, 3); a = nonzero(-4, 4); b = nonzero(-4, 4);
    if (p * q > 4) return null;
  }
  const f1 = [a, p], f2 = [b, q];
  const first = a === 0 ? polyText(f1) : `(${polyText(f1)})`;
  return mode === 'multiply' ? `${first}(${polyText(f2)})` : polyText(mul(f1, f2));
}
/** count problems of one activity and level from a seed, no two the same. */
export function makeAlgebra(mode, level, count, seed) {
  const r = rng(seed), out = [];
  for (let tries = 0; out.length < count && tries < 4000; tries++) {
    const p = makeOne(mode, level, r);
    if (p && !out.includes(p) && p.length <= 40) out.push(p);
  }
  return out;
}
/** A problem as it reads on paper and in the preview: 2x^2-5x-3 -> 2x² − 5x − 3. */
export const algebraText = p => String(p).replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/([+=])/g, ' $1 ').replace(/([^\s(=])-/g, '$1 − ').replace(/-/g, '−').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- settings
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
/** A game's settings as the builder starts them (the defaults the owner approved in the mockup). */
export function defaults(slug, seed = newSeed()) {
  if (slug === 'arithmetic-lab') return fill(slug, { op: 'divide', method: 'standard', size: '3/1', count: 10, level: 'guided', seed });
  if (slug === 'algebra-builder') return fill(slug, { mode: 'solve', level: 'easy', count: 5, tiles: 'all', seed });
  if (slug === 'flashcards') return { cards: [], a: 't', seed };
  return { words: [], bank: true, hints: true, seed };
}
/** The settings with every choice checked and the problems made again when they don't match (a changed size, count or
 *  seed, or problems that were never made). Crossword's words and the flashcards are kept as typed (the server checks
 *  them). */
export function fill(slug, s = {}) {
  const seed = cleanSeed(s.seed);
  if (slug === 'arithmetic-lab') {
    const op = oneOf(s.op, ARITH.ops, 'divide'), method = oneOf(s.method, ARITH.methods[op], 'standard');
    const size = sizeOf(op, s.size) ? s.size : ARITH.sizes[op][0][0], count = oneOf(s.count, ARITH.counts, 10), level = oneOf(s.level, ARITH.levels, 'guided');
    const ok = Array.isArray(s.problems) && s.problems.length === count && s.problems.every(x => Array.isArray(x) && x.length === 2 && arithFits(op, size, x[0], x[1]))
      && new Set(s.problems.map(x => x.join(':'))).size === count;
    return { op, method, size, count, level, seed, problems: ok ? s.problems.map(x => [x[0], x[1]]) : makeArith(op, size, count, seed) };
  }
  if (slug === 'algebra-builder') {
    const mode = oneOf(s.mode, ALGEBRA.modes, 'solve'), level = oneOf(s.level, ALGEBRA.levels, 'easy'), count = oneOf(s.count, ALGEBRA.counts, 5), tiles = oneOf(s.tiles, ALGEBRA.tiles, 'all');
    const made = makeAlgebra(mode, level, count, seed);
    const ok = Array.isArray(s.problems) && s.problems.length === count && s.problems.every(p => typeof p === 'string' && made.includes(p));
    return { mode, level, count, tiles, seed, problems: ok ? s.problems.slice() : made };
  }
  if (slug === 'flashcards') {
    const cards = Array.isArray(s.cards) ? s.cards.filter(x => Array.isArray(x) && (x.length === 2 || x.length === 3))
      .map(([w, d, p]) => [String(w ?? '').slice(0, 80), String(d ?? '').slice(0, 200), typeof p === 'string' ? p.slice(0, 32) : '']).slice(0, FLASH.max) : [];
    return { cards, a: oneOf(s.a, FLASH.answers, 't'), seed };
  }
  const words = Array.isArray(s.words) ? s.words.filter(x => Array.isArray(x) && x.length === 2).map(([w, c]) => [String(w ?? '').slice(0, 40), String(c ?? '').slice(0, 200)]).slice(0, CROSS.max) : [];
  return { words, bank: s.bank !== false, hints: s.hints !== false, seed };
}
/** How many problems (Crossword: words; Flashcards: cards) the settings make. */
export const countOf = (slug, s) => (slug === 'crossword' ? (s.words || []).length : slug === 'flashcards' ? (s.cards || []).length : (s.problems || []).length);
/** What a lesson counts: 'words' (Crossword), 'cards' (Flashcards) or 'problems'. */
export const unitOf = slug => (slug === 'crossword' ? 'words' : slug === 'flashcards' ? 'cards' : 'problems');

/** A pasted list of cards (Flashcards' own reading of one, seed-games/flashcards.html parseList): one card a line, the
 *  term, then its definition after a tab, " - " (or a dash with spaces), ": ", " = " or the first comma. Bullets,
 *  numbers and a header row go; a term twice is kept once. -> [[term, definition]] (a definition may be ''). */
export function parseCards(text, max = FLASH.max) {
  const out = [], seen = new Set(), key = w => w.normalize('NFC').toLocaleLowerCase();
  const split = line => {
    let m;
    if (line.includes('\t')) { m = line.split('\t'); return [m[0], m.slice(1).join(' ')]; }
    if ((m = /^(.+?)\s+[-\u2013\u2014]\s+(.+)$/.exec(line))) return [m[1], m[2]];
    if ((m = /^([^:]+?):\s+(.+)$/.exec(line)) && !/^\d+$/.test(m[1].trim())) return [m[1], m[2]];
    if ((m = /^(.+?)\s+=\s+(.+)$/.exec(line))) return [m[1], m[2]];
    const c = line.indexOf(',');
    return c > 0 ? [line.slice(0, c), line.slice(c + 1)] : [line, ''];
  };
  String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n').forEach((raw, n) => {
    if (out.length >= max) return;
    const line = raw.replace(/^\s*(?:[-*\u2022\u25cf\u25aa]|\d{1,3}[.)])\s+/, '').trim();
    if (!line) return;
    const [a, b] = split(line), w = a.replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim(), d = b.replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim();
    if (n === 0 && /^(term|word|front|question|vocab(ulary)?)s?$/i.test(w) && (!d || /^(definition|meaning|back|answer|clue)s?$/i.test(d))) return;
    if (!w || seen.has(key(w))) return;
    seen.add(key(w)); out.push([w.slice(0, FLASH.term), d.slice(0, FLASH.def)]);
  });
  return out;
}

/** A version for a group, made from the base: steps up or down (offset > 0: harder, < 0: easier), as a suggestion the
 *  teacher can change. Arithmetic Lab: the size one step and the help one step; Algebra Builder: the level; Crossword:
 *  the word bank on for an easier version, off for a harder one; Flashcards: the same cards (the teacher changes a
 *  group's cards). New problems (a new seed) for any change. */
export function suggest(slug, base, offset, seed = newSeed()) {
  const b = fill(slug, base);
  if (!offset) return { ...b };
  const step = (list, v, d) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + d))];
  if (slug === 'arithmetic-lab') {
    const names = ARITH.sizes[b.op].map(x => x[0]);
    return fill(slug, { ...b, size: step(names, b.size, offset), level: step(ARITH.levels, b.level, offset), seed, problems: null });
  }
  if (slug === 'algebra-builder') return fill(slug, { ...b, level: step(ALGEBRA.levels, b.level, offset), seed, problems: null });
  if (slug === 'flashcards') return { ...b, cards: b.cards.map(x => x.slice()) };
  return { ...b, bank: offset < 0 ? true : offset > 0 ? false : b.bank, hints: offset < 0 ? true : b.hints };
}
/** Which way a group's version leans by its place among the groups: the first harder, the last easier, the middle as
 *  the base (Stretch, On track, Building). A single group: as the base. */
export const leanOf = (i, n) => (n < 2 ? 0 : i === 0 ? 1 : i === n - 1 ? -1 : 0);

/** A group's identity for matching a lesson's versions in any class: its own name, or (an unnamed default) its key. */
export const groupIdent = g => (g && g.name ? `n:${String(g.name).trim().toLocaleLowerCase()}` : g && g.key ? `k:${g.key}` : '');

// ---------------------------------------------------------------- Crossword's layout for paper (the preview and Print)
/** A layout of the words for a printed crossword: { w, h, e: [[word index, 'a'|'d', row, col]] } (the shape
 *  services/crossword-print.js takes), or null. Longest words first, each crossing what is down already where it fits
 *  (most crossings, then the smallest box), the seed breaking ties; a word that fits nowhere is left off. The game lays
 *  its own grid out on screen; this is the paper one. */
export function crossLayout(words, seed = 1, max = 25) {
  const letters = words.map(w => [...String(w).normalize('NFC').replace(/[ '’-]/g, '').toLocaleUpperCase()]);
  const order = letters.map((l, i) => i).filter(i => letters[i].length >= 2 && letters[i].length <= max).sort((a, b) => letters[b].length - letters[a].length || a - b);
  if (!order.length) return null;
  const r = rng(seed), cells = new Map(), placed = [];
  const at = (y, x) => cells.get(`${y},${x}`);
  const box = () => { let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9; for (const k of cells.keys()) { const [y, x] = k.split(',').map(Number); y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { y0, y1, x0, x1 }; };
  const fits = (L, dir, y, x) => {
    const dy = dir === 'd' ? 1 : 0, dx = dir === 'a' ? 1 : 0;
    if (at(y - dy, x - dx) || at(y + dy * L.length, x + dx * L.length)) return -1;
    let cross = 0;
    for (let i = 0; i < L.length; i++) {
      const cy = y + dy * i, cx = x + dx * i, c = at(cy, cx);
      if (c) { if (c.ch !== L[i] || c[dir]) return -1; cross++; continue; }
      if (at(cy + dx, cx + dy) || at(cy - dx, cx - dy)) return -1;
    }
    return cross;
  };
  const put = (i, dir, y, x) => {
    const L = letters[i], dy = dir === 'd' ? 1 : 0, dx = dir === 'a' ? 1 : 0;
    for (let j = 0; j < L.length; j++) { const k = `${y + dy * j},${x + dx * j}`, c = cells.get(k) || { ch: L[j] }; c[dir] = 1; cells.set(k, c); }
    placed.push([i, dir, y, x]);
  };
  put(order[0], 'a', 0, 0);
  for (const i of order.slice(1)) {
    const L = letters[i]; let best = null;
    for (const [k, c] of cells) {
      const [cy, cx] = k.split(',').map(Number);
      for (let j = 0; j < L.length; j++) {
        if (L[j] !== c.ch) continue;
        for (const dir of ['a', 'd']) {
          if (c[dir]) continue;
          const y = dir === 'd' ? cy - j : cy, x = dir === 'a' ? cx - j : cx, n = fits(L, dir, y, x);
          if (n < 1) continue;
          const b = box(), w = Math.max(b.x1, x + (dir === 'a' ? L.length - 1 : 0)) - Math.min(b.x0, x) + 1, h = Math.max(b.y1, y + (dir === 'd' ? L.length - 1 : 0)) - Math.min(b.y0, y) + 1;
          if (w > max || h > max) continue;
          const score = n * 100 - (w + h) * 2 - Math.abs(w - h) + r();
          if (!best || score > best.score) best = { score, dir, y, x };
        }
      }
    }
    if (best) put(i, best.dir, best.y, best.x);
  }
  const b = box();
  return { w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, e: placed.map(([i, dir, y, x]) => [i, dir, y - b.y0, x - b.x0]) };
}
