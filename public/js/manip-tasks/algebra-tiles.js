// Algebra Tiles: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// tiles (manip-data.js ALGEBRA: one, x, x², y, y², xy and the opposites mone, mx, mx2, my). A tile and its opposite are
// a zero pair. An equation's two sides are work mats labeled Left and Right; a tile is on a side when its middle is on
// that mat. Expressions are typed in the answer box (kind 'poly': any order, x^2 or x², "x = 4" for a number; kind
// 'factored': written as a product). Every variation hides the board's totals ("Expression 2x − 3" gives answers away).
import { boardWith, rowPlaces, objSizeOf } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';

export const SLUG = 'algebra-tiles';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
const KINDS = Object.keys(DEFS);
/** Each kind's term and sign: x is +1 of 'x', mx is -1 of 'x'. */
const TERM = { one: ['', 1], mone: ['', -1], x: ['x', 1], mx: ['x', -1], x2: ['x2', 1], mx2: ['x2', -1], y: ['y', 1], my: ['y', -1], xy: ['xy', 1], y2: ['y2', 1] };
const OPP = { one: 'mone', mone: 'one', x: 'mx', mx: 'x', x2: 'mx2', mx2: 'x2', y: 'my', my: 'y' };

// ---------------------------------------------------------------- words
/** Terms { x2: 1, x: -3, '': 4 } as text: "x² − 3x + 4" (keyed: "x^2-3x+4" for the answer key). */
export function exprText(terms, { key = false } = {}) {
  const order = ['x2', 'xy', 'y2', 'x', 'y', ''], out = [];
  for (const t of order) {
    const c = terms[t] || 0; if (!c) continue;
    const v = t === 'x2' ? (key ? 'x^2' : 'x²') : t === 'y2' ? (key ? 'y^2' : 'y²') : t;
    const mag = Math.abs(c) === 1 && v ? v : `${Math.abs(c)}${v}`;
    out.push(out.length ? `${c < 0 ? (key ? '-' : '−') : '+'}${key ? '' : ' '}${mag}` : `${c < 0 ? (key ? '-' : '−') : ''}${mag}`);
  }
  return out.length ? out.join(key ? '' : ' ') : '0';
}
/** 1x is x. */
const cx = n => (n === 1 ? 'x' : `${n}x`);
const sgn = (n, v = '') => `${n < 0 ? '−' : '+'} ${Math.abs(n) === 1 && v ? '' : Math.abs(n)}${v}`;
/** (x + 3), (x − 2), (2x + 1) */
const bin = (c, n) => `(${c === 1 ? '' : c}x ${n < 0 ? '−' : '+'} ${Math.abs(n)})`;
const binKey = (c, n) => `(${c === 1 ? '' : c}x${n < 0 ? '-' : '+'}${Math.abs(n)})`;
/** Tiles for terms: { x2: 1, x: -3, '': 4 } -> { x2: 1, mx: 3, one: 4 }. */
function tilesFor(terms) {
  const out = {};
  for (const [t, c] of Object.entries(terms)) { if (!c) continue; const k = { x2: 'x2', x: 'x', '': 'one', y: 'y', y2: 'y2', xy: 'xy' }[t]; out[c > 0 ? k : OPP[k]] = (out[c > 0 ? k : OPP[k]] || 0) + Math.abs(c); }
  return out;
}
const addTiles = (a, b) => { const o = { ...a }; for (const [k, n] of Object.entries(b)) o[k] = (o[k] || 0) + n; return o; };

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const tile = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** Tiles for `has` in rows from (x0, y0), at most `wide` across, big ones first. */
function tilesAt(x0, y0, wide, has, locked) {
  const out = []; let x = x0, y = y0, rowH = 0;
  for (const kind of ['x2', 'mx2', 'xy', 'y2', 'x', 'mx', 'y', 'my', 'one', 'mone']) {
    const n = has[kind] || 0; if (!n) continue;
    if (x > x0) { x = x0; y += rowH + 14; rowH = 0; }
    for (let j = 0; j < n; j++) {
      const d = DEFS[kind];
      if (x + d.w > x0 + wide) { x = x0; y += rowH + 12; rowH = 0; }
      out.push(tile(kind, x, y, locked)); x += d.w + 12; rowH = Math.max(rowH, d.h);
    }
  }
  return out;
}
/** Tiles for `has` scattered over a grid of spots (like terms not together), in an R-shuffled order. */
function scattered(R, has, x0, y0) {
  const list = Object.entries(has).flatMap(([k, n]) => Array(n).fill(k)), cols = 6, out = [];
  R.shuffle(list).forEach((k, i) => { const d = DEFS[k]; out.push(tile(k, x0 + (i % cols) * 120 + (104 - d.w) / 2, y0 + Math.floor(i / cols) * 112 + (100 - d.h) / 2)); });
  return out;
}
/** A board: mats [{ label, has }] in a row, centered, their tiles inside (unlocked: students move them); loose tiles. */
export function tileBoard({ mats = [], loose = null, pieces = null } = {}) {
  const objs = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { label: m.label, ...(m.h ? { h: m.h } : {}) } }));
  const places = objs.length ? rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st))) : [];
  const out = [];
  objs.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; if (mats[i].has) out.push(...tilesAt(o.x + 20, o.y + 50, 400, mats[i].has, false)); });
  if (loose) out.push(...tilesAt(1650, 900, 700, loose, false));
  if (pieces) out.push(...pieces);
  out.forEach((p, i) => { p.id = `t${i + 1}`; });
  return boardWith(SLUG, objs, out);
}
/** The solution: the same board with every unlocked tile replaced by `has` (loose), or each mat's tiles by want[label]. */
function solved(setup, { has = null, mats = null } = {}) {
  const b = JSON.parse(JSON.stringify(setup));
  if (has) b.pieces = [...b.pieces.filter(p => p.locked), ...tilesAt(1500, 300, 900, has, false)];
  if (mats) {
    b.pieces = b.pieces.filter(p => p.locked);
    for (const [label, want] of Object.entries(mats)) { const o = b.objects.find(x => x.st.label === label); b.pieces.push(...tilesAt(o.x + 20, o.y + 50, 400, want, false)); }
  }
  b.pieces.forEach((p, i) => { p.id = `s${i + 1}`; });
  return b;
}

// ---------------------------------------------------------------- the checks
/** The tiles a check is about: unlocked ones, on the mat labeled c.in (its middle on it) when given. */
function tilesOf(c, b) {
  const ps = ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind] && !p.locked);
  if (!c.in) return ps;
  const o = ((b && Array.isArray(b.objects)) ? b.objects : []).find(x => x && x.k === 'mat' && x.st && x.st.label === c.in);
  if (!o) return null;
  const z = objSizeOf(SLUG, 'mat', o.st), s = num(o.s, 1), r = { x: num(o.x), y: num(o.y), w: z.w * s, h: z.h * s };
  return ps.filter(p => { const cx = num(p.x) + num(p.w, DEFS[p.kind].w) / 2, cy = num(p.y) + num(p.h, DEFS[p.kind].h) / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
}
const countOf = (ps, k) => ps.filter(p => p.kind === k).length;
export const conds = {
  /** Exactly these tiles (none of any other kind). */
  tiles: (c, b) => { const ps = tilesOf(c, b); return !!ps && KINDS.every(k => countOf(ps, k) === num(c.has && c.has[k])); },
  /** The tiles' value is these terms ({ x2: 1, x: -2, '': 3 }), zero pairs or not. */
  net: (c, b) => {
    const ps = tilesOf(c, b); if (!ps) return false;
    const got = {}; for (const p of ps) { const [t, s] = TERM[p.kind]; got[t] = (got[t] || 0) + s; }
    return [...new Set([...Object.keys(got), ...Object.keys(c.terms || {})])].every(t => (got[t] || 0) === num(c.terms[t]));
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const shuffled = (R, options, right) => { const o = R.shuffle(options); return { options: o, correct: o.indexOf(right) }; };
const sides = (left, right) => tileBoard({ mats: [{ label: 'Left', has: left }, { label: 'Right', has: right }] });
const polyBox = (terms, label = 'the expression') => ({ key: exprText(terms, { key: true }), kind: 'poly', label: terms.x2 ? `${label} (type x² as x^2)` : label, say: 'Count each kind of tile. Zero pairs count as nothing.' });
const xBox = x => ({ key: String(x), kind: 'poly', label: 'x =', say: 'Look at how many unit tiles match one x tile.' });
const ones = n => (n > 0 ? { one: n } : n < 0 ? { mone: -n } : {});

export const TASKS = [
  T('build-x-4-x-3', 'Build (x+4)(x+3)', 'HSA-APR.A.1', '8',
    'Build the area model for a product like (x + 4)(x + 3) and read off the expanded expression from the tiles.',
    'The rectangle must be complete with no gaps: x², 7 x-tiles and 12 units. Reading the product off the picture is the skill.',
    R => {
      const a = R.int(1, 5), b = R.int(1, 6), terms = { x2: 1, x: a + b, '': a * b }, setup = tileBoard({});
      return {
        prompt: `Build the area model for ${bin(1, a)}${bin(1, b)}: one side x + ${a}, the other x + ${b}. Read the tiles: what is the expression, multiplied out?`,
        setup, answer: { board: [{ t: 'tiles', has: tilesFor(terms), say: `The rectangle needs one x² tile, ${a + b} x tiles and ${a * b} unit tiles.` }], box: polyBox(terms) },
        hints: [`Put an x² tile in the corner. Along one side add ${a} x tile${a > 1 ? 's' : ''}, along the other ${b}.`, `Fill the corner: ${a} by ${b} unit tiles, ${a * b} of them.`, `x² + ${cx(a)} + ${cx(b)} + ${a * b} = ${exprText(terms)}.`],
        explain: `The rectangle has one x², ${a + b} x tiles and ${a * b} units, so ${bin(1, a)}${bin(1, b)} = ${exprText(terms)}.`,
        solution: { board: solved(setup, { has: tilesFor(terms) }), box: exprText(terms, { key: true }) },
      };
    }),
  T('solve-x-3-7', 'Solve x + 3 = 7', '6.EE.B.7', '6',
    'The equation is modeled with tiles on a Left and a Right mat. Take the same unit tiles away from both sides to leave x alone, then type x.',
    'Whatever is added to one side must be added to the other: the balance rule. Zero pairs let children remove the +3 legally.',
    R => {
      const a = R.int(1, 6), c = R.int(a + 1, 12), x = c - a, setup = sides({ x: 1, one: a }, { one: c });
      return {
        prompt: `The mats show x + ${a} = ${c}. Take away the same number of unit tiles from both sides until x is alone on the Left. What is x?`,
        setup, answer: { board: [{ t: 'tiles', in: 'Left', has: { x: 1 }, say: 'Leave only the x tile on the Left mat.' }, { t: 'tiles', in: 'Right', has: { one: x }, say: `Take ${a} unit tiles away from the Right mat too, to keep it balanced.` }], box: xBox(x) },
        hints: [`There are ${a} unit tiles with x on the Left.`, `Hold a unit tile and pick Delete. Take ${a} from the Left and ${a} from the Right.`, `${c} - ${a} = ${x}, so x = ${x}.`],
        explain: `Taking ${a} from both sides keeps them equal: x = ${c} - ${a} = ${x}.`,
        solution: { board: solved(setup, { mats: { Left: { x: 1 }, Right: { one: x } } }), box: String(x) },
      };
    }),
  T('simplify-with-zero-pairs', 'Simplify with zero pairs', '7.EE.A.1', '7',
    'The tiles show an expression like 3x + 2 − x − 5. Take away zero pairs and type the simplest expression the tiles show.',
    'x and −x cancel, +2 and −5 leave −3: answer 2x − 3. Children must flip tiles to negatives before pairing.',
    R => {
      let a, b, c, d;
      do { a = R.int(2, 5); c = R.int(1, 4); b = R.int(1, 5); d = R.int(1, 6); } while (a === c || b === d);
      const terms = { x: a - c, '': b - d }, setup = tileBoard({ loose: { x: a, one: b, mx: c, mone: d } });
      return {
        prompt: `The tiles show ${a}x + ${b} − ${c === 1 ? '' : c}x − ${d}. Take away every zero pair. What is the simplest expression the tiles show?`,
        setup, answer: { board: [{ t: 'tiles', has: tilesFor(terms), say: 'Take away every zero pair: an x with a −x, a 1 with a −1.' }], box: polyBox(terms) },
        hints: ['A tile and its opposite make a zero pair: together they are worth 0.', `Pair ${Math.min(a, c)} x with ${Math.min(a, c)} −x, and ${Math.min(b, d)} unit${Math.min(b, d) > 1 ? 's' : ''} with ${Math.min(b, d)} −1. Select a pair and Delete it.`, `What is left: ${exprText(terms)}.`],
        explain: `${a}x − ${c === 1 ? '' : c}x = ${exprText({ x: a - c })} and ${b} − ${d} = ${b - d}, so the simplest form is ${exprText(terms)}.`,
        solution: { board: solved(setup, { has: tilesFor(terms) }), box: exprText(terms, { key: true }) },
      };
    }),
  T('factor-x-5x-6', 'Factor x² + 5x + 6', 'HSA-SSE.B.3a', '8',
    'The tiles for an expression like x² + 5x + 6 are on the board. Arrange them into one complete rectangle and type its side lengths as a product.',
    'The rectangle is (x+2)(x+3). If the arrangement has gaps, the factorization is wrong: the rectangle is self-checking.',
    R => {
      const c = R.chance(0.35) ? 2 : 1, p = R.int(1, c === 2 ? 5 : 6), q = R.int(1, c === 2 ? 4 : 7);
      const terms = { x2: c, x: p + c * q, '': p * q }, key = `${binKey(c, p)}${binKey(1, q)}`, setup = tileBoard({ loose: tilesFor(terms) });
      return {
        prompt: `The tiles show ${exprText(terms)}. Arrange all of them into one rectangle with no gaps. What are its side lengths? Type them as a product, like (x + 1)(x + 2).`,
        setup, answer: { box: { key, kind: 'factored', label: 'side lengths', say: 'Type the two side lengths in brackets, side by side.' } },
        hints: [`Put the x² tile${c > 1 ? 's' : ''} in the corner, then the x tiles along two sides.`, `The ${p * q} unit tiles fill the last corner as a rectangle: try ${p} by ${q}.`, `The sides are ${bin(c, p)} and ${bin(1, q)}.`],
        explain: `${bin(c, p)}${bin(1, q)} = ${exprText(terms)}. When all the tiles make one rectangle, its sides are the factors.`,
        solution: { box: key },
      };
    }),
  T('zero-pair-clean-up', 'Zero pair clean up', '7.EE.A.1', '7',
    'The tiles show an expression like 2x − 3 + x + 5. Pair the zeros and type the cleaned expression.',
    'Pairs remove -3 with 3 of the 5, leaving 3x + 2. Cleaning before counting prevents sign slips.',
    R => {
      let a, b, c, d;
      do { a = R.int(1, 4); c = R.int(1, 4); b = R.int(1, 6); d = R.int(1, 7); } while (b === d);
      const terms = { x: a + c, '': d - b }, setup = tileBoard({ loose: { x: a + c, mone: b, one: d } });
      return {
        prompt: `The tiles show ${a === 1 ? '' : a}x − ${b} + ${c === 1 ? '' : c}x + ${d}. Pair up the zeros and take them away. What is the cleaned expression?`,
        setup, answer: { board: [{ t: 'tiles', has: tilesFor(terms), say: 'Take away every zero pair: a 1 with a −1.' }], box: polyBox(terms) },
        hints: [`The x tiles have no opposites here: ${a} + ${c} = ${a + c} of them stay.`, `Pair each −1 with a 1: ${Math.min(b, d)} zero pair${Math.min(b, d) > 1 ? 's' : ''}.`, `What is left: ${exprText(terms)}.`],
        explain: `${a}x + ${c}x = ${a + c}x and −${b} + ${d} = ${exprText({ '': d - b })}, so the cleaned expression is ${exprText(terms)}.`,
        solution: { board: solved(setup, { has: tilesFor(terms) }), box: exprText(terms, { key: true }) },
      };
    }),
  T('distribute-with-tiles', 'Distribute with tiles', '7.EE.A.1', '7',
    'Build an expression like 3(x + 2) as identical rows. Read the expanded form from the tiles.',
    'Three rows each x + 2 give 3x + 6. Rows make distribution a copying action, not a rule to memorize.',
    R => {
      const k = R.int(2, 5), a = R.int(1, 5) * (R.chance(0.3) ? -1 : 1), terms = { x: k, '': k * a }, setup = tileBoard({});
      return {
        prompt: `Build ${k}${bin(1, a)} as ${k} rows, each row x ${a < 0 ? '−' : '+'} ${Math.abs(a)}. What is the expression multiplied out?`,
        setup, answer: { board: [{ t: 'tiles', has: tilesFor(terms), say: `Make ${k} rows, each with 1 x tile and ${Math.abs(a)} ${a < 0 ? '−1' : 'unit'} tile${Math.abs(a) > 1 ? 's' : ''}.` }], box: polyBox(terms) },
        hints: [`One row is an x tile and ${Math.abs(a)} ${a < 0 ? '−1' : 'unit'} tile${Math.abs(a) > 1 ? 's' : ''}. Hold it and pick Copy to make the next row.`, `${k} rows: ${k} x tiles and ${k} × ${Math.abs(a)} = ${k * Math.abs(a)} ${a < 0 ? '−1' : 'unit'} tiles.`, `${k}${bin(1, a)} = ${exprText(terms)}.`],
        explain: `Each of the ${k} rows has x and ${a}, so ${k}${bin(1, a)} = ${k}x ${sgn(k * a)}: the ${k} multiplies both parts.`,
        solution: { board: solved(setup, { has: tilesFor(terms) }), box: exprText(terms, { key: true }) },
      };
    }),
  T('equation-balance', 'Equation balance', '8.EE.C.7', '8',
    'The mats model an equation like 2x + 1 = 7. Take the units away from both sides to leave only x tiles on the Left, then share the Right among them to find x.',
    'Remove 1 from both sides, split 6 into two groups for the two x tiles: x = 3. Balance language must accompany every move.',
    R => {
      const a = R.int(2, 4), x = R.int(1, 5), b = R.int(1, 5), c = a * x + b, setup = sides({ x: a, one: b }, { one: c });
      return {
        prompt: `The mats show ${a}x + ${b} = ${c}. Take the same unit tiles away from both sides until only the x tiles are on the Left. Then share the Right equally among them. What is x?`,
        setup, answer: { board: [{ t: 'tiles', in: 'Left', has: { x: a }, say: `Leave only the ${a} x tiles on the Left mat.` }, { t: 'tiles', in: 'Right', has: { one: c - b }, say: `Take ${b} unit tiles from the Right too, to keep it balanced.` }], box: xBox(x) },
        hints: [`Take ${b} unit tile${b > 1 ? 's' : ''} away from each side.`, `Now ${a} x tiles balance ${c - b} unit tiles. Share them into ${a} equal groups.`, `${c - b} ÷ ${a} = ${x}, so x = ${x}.`],
        explain: `${a}x + ${b} = ${c}; take ${b} from both sides: ${a}x = ${c - b}; share into ${a} groups: x = ${x}.`,
        solution: { board: solved(setup, { mats: { Left: { x: a }, Right: { one: c - b } } }), box: String(x) },
      };
    }),
  T('negative-area-talk', 'Negative area talk', 'HSA-APR.A.1', '8',
    'Build a product like (x − 1)(x + 3) in the area model. Pick which regions are negative and type the final expression.',
    'The -1 row creates negative regions: x squared + 2x - 3. Signed regions are the hard, valuable part of this model.',
    R => {
      let a, b; do { a = R.int(1, 5); b = R.int(1, 6); } while (a === b && R.chance(0.7));
      const terms = { x2: 1, x: b - a, '': -a * b }, setup = tileBoard({}), area = { x2: 1, x: b, mx: a, mone: a * b };
      const right = `The ${a} −x tile${a > 1 ? 's' : ''} and the ${a * b} −1 tiles`;
      const choice = { ...shuffled(R, [right, 'The x² tile', `The ${b} x tiles`], right), say: 'A negative times a positive is negative.' };
      return {
        prompt: `Build the area model for ${bin(1, -a)}${bin(1, b)}: one side x − ${a}, the other x + ${b}. Which regions are negative? What is the final expression?`,
        setup, answer: { board: [{ t: 'net', terms, say: `The rectangle needs one x², ${b} x tiles, ${a} −x tile${a > 1 ? 's' : ''} and ${a * b} −1 tiles (zero pairs may go).` }], box: polyBox(terms, 'the final expression'), choice },
        hints: [`x times x is x². x times ${b} gives ${b} x tiles; x times −${a} gives ${a} −x tile${a > 1 ? 's' : ''}.`, `The corner is −${a} times ${b}: ${a * b} −1 tiles. Those and the −x tiles are the negative regions.`, `x² + ${cx(b)} − ${cx(a)} − ${a * b} = ${exprText(terms)}.`],
        explain: `${bin(1, -a)}${bin(1, b)} = x² + ${cx(b)} − ${cx(a)} − ${a * b} = ${exprText(terms)}. The −${a} side makes every region it touches negative.`,
        solution: { board: solved(setup, { has: area }), box: exprText(terms, { key: true }), choice: choice.correct },
      };
    }),
  T('like-terms-sort', 'Like terms sort', '6.EE.A.3', '6',
    'Tiles for several terms are scattered on the board. Group like terms together and type the sum.',
    'Only same shape and size group together: 3x squared + 4x + 3. Tiles make unlike terms visibly unlike.',
    R => {
      const kinds = ['x2', 'x', 'one', 'y'], parts = [];
      const n = R.int(4, 5);
      for (let i = 0; i < n; i++) parts.push([R.pick(kinds), R.int(1, 4)]);
      if (new Set(parts.map(p => p[0])).size === parts.length) parts.push([parts[0][0], R.int(1, 3)]);
      const has = {}, terms = {};
      for (const [k, c] of parts) { has[k] = (has[k] || 0) + c; const t = TERM[k][0]; terms[t] = (terms[t] || 0) + c; }
      const words = parts.map(([k, c]) => (k === 'one' ? `${c}` : `${c === 1 ? '' : c}${k === 'x2' ? 'x²' : k}`)).join(' + ');
      const setup = tileBoard({ pieces: scattered(R, has, 1600, 950) });
      return {
        prompt: `The tiles show ${words}, all mixed up. Group the like terms together. What is the sum, with like terms combined?`,
        setup, answer: { box: polyBox(terms, 'the sum') },
        hints: ['Like terms are tiles of the same shape and size: x² with x², x with x.', 'Drag each kind into its own group, then count each group.', `The sum is ${exprText(terms)}.`],
        explain: `Same-shaped tiles join up: ${exprText(terms)}. Tiles of different shapes stay apart, so unlike terms never combine.`,
        solution: { box: exprText(terms, { key: true }) },
      };
    }),
  T('solve-with-negatives', 'Solve with negatives', '7.EE.B.4', '7',
    'The mats model an equation like x − 4 = 3. Add positive units (or zero pairs) to both sides to free x, then type x.',
    'Adding 4 to both sides is the legal move the tiles enforce: x = 7. Taking away from one side only breaks the balance.',
    R => {
      let a, c, x; do { a = R.int(1, 6); c = R.int(-4, 8); x = c + a; } while (!c || !x);
      const setup = sides({ x: 1, mone: a }, ones(c));
      return {
        prompt: `The mats show x − ${a} = ${c}. Add ${a} unit tiles to both sides, then take away the zero pairs, so x is alone on the Left. What is x?`,
        setup, answer: { board: [{ t: 'tiles', in: 'Left', has: { x: 1 }, say: 'Leave only the x tile on the Left mat.' }, { t: 'tiles', in: 'Right', has: ones(x), say: `Add ${a} unit tiles to the Right as well, then take away any zero pairs.` }], box: xBox(x) },
        hints: [`Each −1 on the Left needs a 1 to make a zero pair. Add ${a} unit tiles to the Left, and ${a} to the Right to keep it balanced.`, 'Take away the zero pairs on both mats.', `${c} + ${a} = ${x}, so x = ${x}.`],
        explain: `Adding ${a} to both sides keeps the balance: x − ${a} + ${a} = ${c} + ${a}, so x = ${x}.`,
        solution: { board: solved(setup, { mats: { Left: { x: 1 }, Right: ones(x) } }), box: String(x) },
      };
    }),
  T('factor-a-negative', 'Factor a negative', 'HSA-SSE.B.3a', '8',
    'Factor an expression like x² − x − 6 into a rectangle. Type the side lengths, with their signs, as a product.',
    'Sides are (x - 3) and (x + 2). Negative unit tiles must fill the corner exactly, which checks the signs.',
    R => {
      let p, q; do { p = R.int(1, 6); q = R.int(1, 6); } while (p === q);
      const terms = { x2: 1, x: q - p, '': -p * q }, key = `${binKey(1, -p)}${binKey(1, q)}`, setup = tileBoard({ loose: tilesFor(terms) });
      return {
        prompt: `The tiles show ${exprText(terms)}. Make one rectangle: add zero pairs of x and −x tiles if you need them. What are its side lengths? Type them as a product, like (x − 1)(x + 2).`,
        setup, answer: { box: { key, kind: 'factored', label: 'side lengths', say: 'Type the two side lengths in brackets, with their signs.' } },
        hints: [`The ${p * q} −1 tiles fill the corner: the two numbers multiply to −${p * q}.`, `The two numbers also add to ${q - p} (the x tiles). Try ${q} and −${p}.`, `The sides are ${bin(1, -p)} and ${bin(1, q)}.`],
        explain: `${bin(1, -p)}${bin(1, q)} = x² + ${q === 1 ? '' : q}x − ${p === 1 ? '' : p}x − ${p * q} = ${exprText(terms)}. The negative corner means the signs are different.`,
        solution: { box: key },
      };
    }),
  T('expression-match', 'Expression match', 'HSA-APR.A.1', '8',
    'Build an expression like x² + 3x + 2, arrange the same tiles into a rectangle, and type it as a product like (x + 1)(x + 2).',
    'Expansion and factoring are the same tiles read two ways. Children should physically rearrange between the two readings.',
    R => {
      const c = R.chance(0.4) ? 2 : 1, a = R.int(1, c === 2 ? 5 : 6), b = R.int(1, c === 2 ? 4 : 6), terms = { x2: c, x: a + c * b, '': a * b }, key = `${binKey(c, a)}${binKey(1, b)}`, setup = tileBoard({});
      return {
        prompt: `Build ${exprText(terms)} with tiles. Then move the same tiles into one rectangle. Type it as a product, like (x + 1)(x + 2).`,
        setup, answer: { board: [{ t: 'tiles', has: tilesFor(terms), say: `Build ${exprText(terms)}: ${c} x², ${a + c * b} x and ${a * b} unit tiles.` }], box: { key, kind: 'factored', label: 'the product', say: 'Read the rectangle\'s two side lengths.' } },
        hints: [`Build it: ${c} x² tile${c > 1 ? 's' : ''}, ${a + c * b} x tiles, ${a * b} unit tiles.`, `The ${a * b} units make a ${a} by ${b} corner.`, `The rectangle is ${bin(c, a)}${bin(1, b)}.`],
        explain: `The same tiles read two ways: ${exprText(terms)} = ${bin(c, a)}${bin(1, b)}.`,
        solution: { board: solved(setup, { has: tilesFor(terms) }), box: key },
      };
    }),
  T('inequality-tiles', 'Inequality tiles', '7.EE.B.4b', '7',
    'The mats model an inequality like x + 2 > 5. Take the same units from both sides to free x, then pick the values of x that work.',
    'Tiles show the threshold x = 3, with greater values beyond. The boundary case is the discussion point.',
    R => {
      const a = R.int(1, 6), c = R.int(a + 1, 12), op = R.pick(['>', '<']), t = c - a, flip = op === '>' ? '<' : '>';
      const setup = sides({ x: 1, one: a }, { one: c }), right = `x ${op} ${t}`;
      const choice = { ...shuffled(R, [right, `x ${flip} ${t}`, `x ${op} ${c + a}`, `x = ${t}`], right), say: 'Take the same away from both sides: the sign stays the same.' };
      return {
        prompt: `The Left mat shows x + ${a} and the Right shows ${c}, with x + ${a} ${op === '>' ? 'greater' : 'less'} than ${c}: x + ${a} ${op} ${c}. Take the same units from both sides to free x. Which values of x work?`,
        setup, answer: { board: [{ t: 'tiles', in: 'Left', has: { x: 1 }, say: 'Leave only the x tile on the Left mat.' }, { t: 'tiles', in: 'Right', has: { one: t }, say: `Take ${a} unit tiles from the Right too.` }], choice },
        hints: [`Take ${a} unit tile${a > 1 ? 's' : ''} from each side.`, `x is ${op === '>' ? 'greater' : 'less'} than what is left on the Right: ${t}.`, `${right}. At x = ${t} the two sides are equal, so ${t} itself does not work.`],
        explain: `x + ${a} ${op} ${c} becomes x ${op} ${t}. Every value ${op === '>' ? 'above' : 'below'} ${t} works; ${t} is the boundary.`,
        solution: { board: solved(setup, { mats: { Left: { x: 1 }, Right: { one: t } } }), choice: choice.correct },
      };
    }),
  T('two-variable-terms', 'Two variable terms', '7.EE.A.1', '7',
    'Tiles show an expression like 2x + 3y + x + y. Combine like terms, type the result, and pick why x and y tiles cannot merge.',
    'Different lengths mean different variables: 3x + 4y. Shape difference is the reason, not a rule.',
    R => {
      const a = R.int(1, 4), b = R.int(1, 4), c = R.int(1, 4), d = R.int(1, 4), terms = { x: a + c, y: b + d };
      const setup = tileBoard({ pieces: scattered(R, { x: a + c, y: b + d }, 1600, 950) }), right = 'x and y stand for different unknowns';
      const choice = { ...shuffled(R, [right, 'x is always bigger than y', 'y tiles are negative'], right), say: 'Think about what each tile stands for.' };
      const t = (n, v) => `${n === 1 ? '' : n}${v}`;
      return {
        prompt: `The tiles show ${t(a, 'x')} + ${t(b, 'y')} + ${t(c, 'x')} + ${t(d, 'y')}. Combine like terms. What is the result, and why can't an x tile and a y tile merge?`,
        setup, answer: { box: polyBox(terms, 'the result'), choice },
        hints: ['Put the x tiles in one group and the y tiles in another.', `${a} + ${c} x tiles and ${b} + ${d} y tiles.`, `${exprText(terms)}. x and y are different unknowns, so they stay apart.`],
        explain: `${exprText(terms)}. x and y can have different values, so an x and a y are not like terms and never combine.`,
        solution: { box: exprText(terms, { key: true }), choice: choice.correct },
      };
    }),
  T('square-a-binomial', 'Square a binomial', 'HSA-APR.A.1', '8',
    'Build a square like (x + 2)² as a square array. Name the regions: the expression, the tiles in each middle region, or the corner.',
    'Regions x squared, 2x, 2x and 4 give x squared + 4x + 4. The two middle regions being equal surprises many learners.',
    R => {
      const a = R.int(1, 6) * (R.chance(0.3) ? -1 : 1), q = R.pick(['expr', 'middle', 'corner']);
      const terms = { x2: 1, x: 2 * a, '': a * a }, setup = tileBoard({}), area = { x2: 1, [a < 0 ? 'mx' : 'x']: 2 * Math.abs(a), one: a * a };
      const box = q === 'expr' ? polyBox(terms, 'the total') : q === 'middle' ? { key: String(Math.abs(a)), label: `${a < 0 ? '−x' : 'x'} tiles in each middle region` } : { key: String(a * a), label: 'unit tiles in the corner' };
      const ask = q === 'expr' ? 'What is the total expression?' : q === 'middle' ? `How many ${a < 0 ? '−x' : 'x'} tiles are in each of the two middle regions?` : 'How many unit tiles fill the corner?';
      return {
        prompt: `Build ${bin(1, a)}² as a square: both sides x ${a < 0 ? '−' : '+'} ${Math.abs(a)}. ${ask}`,
        setup, answer: { board: [{ t: 'net', terms, say: `The square needs one x², ${2 * Math.abs(a)} ${a < 0 ? '−x' : 'x'} tiles and ${a * a} unit tiles.` }], box },
        hints: [`Put the x² in the corner. Each side has x and ${a < 0 ? '−' : ''}${Math.abs(a)}.`, `Two middle regions of ${Math.abs(a)} ${a < 0 ? '−x' : 'x'} tiles each, and a ${Math.abs(a)} by ${Math.abs(a)} corner of ${a * a} unit tiles${a < 0 ? ' (−1 times −1 is +1)' : ''}.`, q === 'expr' ? `${exprText(terms)}.` : q === 'middle' ? `${Math.abs(a)} in each.` + ' The two middle regions match.' : `${Math.abs(a)} × ${Math.abs(a)} = ${a * a}.`],
        explain: `${bin(1, a)}² = x² ${sgn(a, 'x')} ${sgn(a, 'x')} + ${a * a} = ${exprText(terms)}: two equal middle regions and a square corner.`,
        solution: { board: solved(setup, { has: area }), box: box.key },
      };
    }),
  T('equation-from-tiles', 'Equation from tiles', '6.EE.B.7', '6',
    'A balance shows x tiles on the Left and unit tiles on the Right. Write the equation in your head and type x: share the units equally among the x tiles.',
    'Each x must be 4 units. Division appears as sharing the units equally among the x tiles.',
    R => {
      const a = R.int(2, 6), k = R.int(2, 8), c = a * k, setup = sides({ x: a }, { one: c });
      return {
        prompt: `The Left mat shows ${a} x tiles and the Right shows ${c} unit tiles, and they balance: ${a}x = ${c}. What is x?`,
        setup, answer: { box: xBox(k) },
        hints: [`Share the ${c} unit tiles equally among the ${a} x tiles.`, `${c} ÷ ${a}: how many units does each x get?`, `${c} ÷ ${a} = ${k}, so x = ${k}.`],
        explain: `${a}x = ${c}, so each x is ${c} ÷ ${a} = ${k}.`,
        solution: { box: String(k) },
      };
    }),
];
