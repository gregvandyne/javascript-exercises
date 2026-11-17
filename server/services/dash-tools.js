// Classroom dashboards, stage 3: the teaching tools' state (docs/decisions.md "Classroom dashboards, stage 3"). A tool's
// state is what the teacher (or a student, on their own screen) has set up: the fractions shown, a number line's range,
// a line's slope... It is kept in the widget's hidden `state` setting and, when the teacher sends the tool to students,
// copied into the push. Everything a browser sends is rebuilt here from the tool's spec: unknown keys are dropped,
// numbers clamped, lists cut, text clipped. The whiteboard's drawings are never part of any state: they never leave the
// browser. The shape board's pen strokes and labels are the teacher's own (simplified and capped, like other teacher
// text); a student's are never kept on the server (cleanToolState(..., { student: true })).
//
// Spec: { key: ['int', lo, hi, def] | ['enum', [values], def] | ['bool', def] | ['text', max, def]
//              | ['textm', max, def] (several lines) | ['ints', maxLen, lo, hi, def] | ['list', maxLen, { spec }, def]
//              | ['obj', { spec }] (one object, each key its own default) }
// then fix(state) for rules that tie keys together (a numerator no bigger than its denominator...).

const SAFE_TEXT = (v, max) => [...String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/[‪-‮⁦-⁩]/g, '').trim()].slice(0, max).join('');
const SAFE_LINES = (v, max) => [...String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/[‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').trim()].slice(0, max).join('');
const toInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return v !== null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export const TOOL_SPECS = {
  // hide: the answer starts hidden (students work it out first); a state saved with it shown keeps it shown.
  // Compare (bars) and, since "help on the maths tools", Add, Subtract, Multiply and Divide two fractions a and b (a bottom number
  // 1-12, a top number 0-12 and at most three wholes; public/js/dash-math.js OP_LIMITS and OP_START, tested to agree).
  // mode, a and b are kept only when one of them is not its starting value, so a Compare state is stored exactly as it
  // always was and layouts saved before the modes load unchanged.
  fractions: {
    spec: { shape: ['enum', ['bar', 'circle'], 'bar'], bars: ['list', 3, { n: ['int', 0, 12, 1], d: ['int', 1, 12, 2] }, [{ n: 3, d: 4 }, { n: 5, d: 8 }]], same: ['bool', false], hide: ['bool', true],
      mode: ['enum', ['compare', 'add', 'sub', 'mul', 'div'], 'compare'], a: ['obj', { n: ['int', 0, 12, 1], d: ['int', 1, 12, 2] }], b: ['obj', { n: ['int', 0, 12, 1], d: ['int', 1, 12, 3] }],
      // Since "fractions: dividing as measuring": fit is how many copies of the second fraction Divide has laid along the
      // first (Fit one more; at most 12 ÷ 1/12 = 144), step how many steps of the working are showing (at most 4). Both are
      // kept only when they are not 0, so states saved before them come back as they were.
      fit: ['int', 0, 144, 0], step: ['int', 0, 4, 0] },
    fix: s => {
      if (!s.bars.length) s.bars = [{ n: 1, d: 2 }];
      for (const b of s.bars) b.n = Math.min(b.n, b.d);
      for (const f of [s.a, s.b]) f.n = Math.min(f.n, 3 * f.d);
      if (s.mode === 'div' && !s.b.n) s.b.n = 1;   // never divide by zero
      if (s.mode === 'div') s.fit = Math.min(s.fit, Math.ceil((s.a.n * s.b.d) / (s.a.d * s.b.n)));   // no more copies than fit
      if (s.mode !== 'div' || !s.fit) delete s.fit;
      if (s.mode === 'compare' || !s.step) delete s.step;
      if (s.mode === 'compare' && s.a.n === 1 && s.a.d === 2 && s.b.n === 1 && s.b.d === 3) { delete s.mode; delete s.a; delete s.b; }
    },
  },
  numline: {
    spec: { lo: ['int', -100, 999, 0], hi: ['int', -99, 1000, 10], sub: ['enum', [1, 2, 3, 4, 5, 6, 8, 10, 12], 1], mode: ['enum', ['whole', 'fraction', 'decimal'], 'whole'],
      tool: ['enum', ['point', 'jump'], 'jump'], points: ['ints', 20, -12000, 12000], jumps: ['list', 12, { a: ['int', -12000, 12000, 0], b: ['int', -12000, 12000, 0] }, []] },
    fix: s => {
      if (s.hi <= s.lo) s.hi = s.lo + 1;
      if (s.mode === 'decimal' && [3, 6, 12].includes(s.sub)) s.sub = 10;
      if (s.mode === 'whole') s.sub = 1;
      while ((s.hi - s.lo) * s.sub > 240 && s.sub > 1) s.sub = [1, 2, 3, 4, 5, 6, 8, 10, 12].filter(x => x < s.sub).pop();
      if ((s.hi - s.lo) * s.sub > 240) s.hi = s.lo + 240;
      const lo = s.lo * s.sub, hi = s.hi * s.sub, inside = x => x >= lo && x <= hi;
      s.points = [...new Set(s.points.filter(inside))];
      s.jumps = s.jumps.filter(j => inside(j.a) && inside(j.b) && j.a !== j.b);
    },
  },
  coord: {
    spec: { quads: ['enum', [4, 1], 4], size: ['enum', [5, 10], 5], mi: ['int', 0, 20, 15], b: ['int', -10, 10, 1], line: ['bool', true], table: ['bool', true],
      points: ['list', 20, { x: ['int', -20, 20, 0], y: ['int', -20, 20, 0] }, []] },
    fix: s => {
      const lo = s.quads === 1 ? 0 : -s.size, hi = s.quads === 1 ? 2 * s.size : s.size;
      const seen = new Set();
      s.points = s.points.filter(p => p.x >= lo && p.x <= hi && p.y >= lo && p.y <= hi && !seen.has(`${p.x},${p.y}`) && seen.add(`${p.x},${p.y}`));
    },
  },
  graph: {
    spec: { kind: ['enum', ['bar', 'line', 'picture', 'dot'], 'bar'], title: ['text', 60, ''], icon: ['int', 0, 11, 0], per: ['enum', [1, 2, 5, 10], 1],
      rows: ['list', 12, { l: ['text', 24, ''], v: ['int', 0, 999, 0] }, [{ l: '', v: 3 }, { l: '', v: 5 }, { l: '', v: 2 }, { l: '', v: 4 }]] },
  },
  base10: { spec: { h: ['int', 0, 9, 1], t: ['int', 0, 19, 2], o: ['int', 0, 19, 4] } },
  placeval: { spec: { v: ['int', 0, 9999999, 3405270], discs: ['bool', true], dec: ['bool', true] }, fix: s => { if (!s.dec) s.v -= s.v % 1000; } },
  tenframe: { spec: { frames: ['enum', [1, 2], 1], cells: ['ints', 20, 0, 2, [1, 1, 1, 1, 1, 1, 1, 2, 2]], bond: ['bool', true] },
    fix: s => { s.cells = Array.from({ length: 20 }, (_, i) => (i < s.frames * 10 ? s.cells[i] || 0 : 0)); } },
  // Maths tools combined: the number chart also runs 1-120 (upto 120, from 1 only); upto is stored only when it is 120,
  // so a chart saved before it is stored exactly as it was.
  hundreds: { spec: { start: ['enum', [1, 0], 1], shade: ['ints', 120, 0, 120], skip: ['int', 0, 10, 0], hide: ['enum', ['none', 'shaded', 'all'], 'none'], upto: ['enum', [100, 120], 100] },
    fix: s => {
      if (!s.start) s.upto = 100;
      const lo = s.start, hi = s.start ? s.upto : 99; s.shade = [...new Set(s.shade)].filter(x => x >= lo && x <= hi).sort((a, b) => a - b); if (s.skip === 1) s.skip = 0;
      if (s.upto === 100) delete s.upto;
    } },
  area: { spec: { a: ['int', 1, 99, 4], b: ['int', 1, 99, 6], view: ['enum', ['array', 'area'], 'array'], sa: ['int', 0, 98, 0], sb: ['int', 0, 98, 0] },
    fix: s => { if (s.sa >= s.a) s.sa = 0; if (s.sb >= s.b) s.sb = 0; } },
  times: { spec: { size: ['enum', [10, 12], 10], r: ['int', 0, 12, 0], c: ['int', 0, 12, 0], mark: ['enum', ['fact', 'row', 'col', 'squares', 'turn'], 'fact'], hide: ['bool', false] },
    fix: s => { if (s.r > s.size) s.r = 0; if (s.c > s.size) s.c = 0; } },
  tclock: { spec: { t: ['int', 0, 1439, 580], digital: ['bool', true], h24: ['bool', false], el: ['bool', false], end: ['int', 0, 1439, 735] } },
  fdp: { spec: { n: ['int', 0, 100, 3], d: ['int', 1, 100, 8] }, fix: s => { s.n = Math.min(s.n, s.d); } },
  // ---- stage 4 (docs/decisions.md "Classroom dashboards, stage 4"); the lists match public/js/dash-math4.js (tested)
  // Shape board (docs/decisions.md "Shape board"): a square grid, triangle dots or a circle (ring pegs round a centre peg);
  // up to 12 bands in 7 colours (c; a band saved before colours has none and takes its place's colour), the view toggles,
  // the teacher's challenge title, text labels and pen strokes (x, y in the board's 1000 × 1000 units). The keys added
  // for the shape board are stored only when they differ from their start, so a geoboard saved before it (pegs, cur,
  // show, bands) is stored exactly as it was. A student's own screen never keeps labels or pen strokes (student: true):
  // drawings and typed notes on a student's copy stay in their browser.
  geoboard: {
    spec: { pegs: ['enum', [5, 7, 9, 11], 7], cur: ['int', -1, 11, 0], show: ['bool', true],
      bands: ['list', 12, { pts: ['list', 16, { x: ['int', 0, 24, 0], y: ['int', 0, 10, 0] }, []], closed: ['bool', false], c: ['int', -1, 6, -1] }, [{ pts: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 3 }, { x: 2, y: 3 }], closed: true }]],
      board: ['enum', ['square', 'iso', 'circle'], 'square'], ring: ['enum', [6, 8, 10, 12, 16, 24], 12],
      fills: ['bool', true], lines: ['bool', false], angles: ['bool', false], labels: ['bool', false], title: ['text', 80, ''],
      notes: ['list', 12, { x: ['int', 0, 1000, 500], y: ['int', 0, 1000, 500], t: ['text', 40, ''] }, []],
      ink: ['list', 30, { c: ['int', 0, 4, 0], p: ['ints', 240, 0, 1000] }, []] },
    fix: (s, o = {}) => {
      const circle = s.board === 'circle';
      for (const b of s.bands) {
        b.pts = b.pts.filter(p => (circle ? p.y === 0 && p.x <= s.ring : p.x < s.pegs && p.y < s.pegs)).filter((p, i, a) => !i || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
        if (b.pts.length > 1 && b.pts[0].x === b.pts.at(-1).x && b.pts[0].y === b.pts.at(-1).y) { b.pts.pop(); b.closed = true; }
        if (b.pts.length < 3) b.closed = false;
        if (b.c < 0) delete b.c;
      }
      if (s.cur >= s.bands.length) s.cur = Math.max(0, s.bands.length - 1);
      s.notes = s.notes.filter(n => n.t);
      for (const k of s.ink) if (k.p.length % 2) k.p.pop();
      s.ink = s.ink.filter(k => k.p.length >= 2);
      if (o.student) { s.notes = []; s.ink = []; }
      const start = { board: 'square', ring: 12, fills: true, lines: false, angles: false, labels: false, title: '' };
      for (const [k, v] of Object.entries(start)) if (s[k] === v) delete s[k];
      for (const k of ['notes', 'ink']) if (!s[k].length) delete s[k];
    },
  },
  pattern: {
    spec: { blocks: ['list', 40, { k: ['enum', ['hex', 'trap', 'rhom', 'tri', 'sq', 'thin'], 'hex'], x: ['int', 0, 30, 0], y: ['int', 0, 10, 0], r: ['int', 0, 11, 0] },
      [{ k: 'hex', x: 3, y: 5, r: 0 }, { k: 'trap', x: 9, y: 5, r: 0 }, { k: 'tri', x: 15, y: 5, r: 0 }, { k: 'rhom', x: 19, y: 5, r: 0 }]] },
    fix: s => { for (const b of s.blocks) if ((b.x + b.y) % 2) b.x += b.x < 30 ? 1 : -1; },
  },
  angle: { spec: { a: ['int', 0, 360, 50], proto: ['bool', true], step: ['enum', [1, 5, 15], 5], arc: ['bool', true] } },
  solids: { spec: { shape: ['enum', ['cube', 'cuboid', 'triprism', 'hexprism', 'sqpyramid', 'tripyramid', 'cylinder', 'cone'], 'cube'], fold: ['int', 0, 100, 100], yaw: ['int', 0, 359, 35],
    mark: ['enum', ['none', 'faces', 'edges', 'vertices'], 'none'] } },
  transform: {
    spec: { shape: ['enum', ['tri', 'flag', 'ell', 'arrow'], 'tri'], ox: ['int', -9, 7, 0], oy: ['int', -9, 7, 0], op: ['enum', ['translate', 'reflect', 'rotate'], 'translate'],
      dx: ['int', -8, 8, 3], dy: ['int', -8, 8, -5], axis: ['enum', ['y', 'x', 'yx', 'ynx'], 'y'], turn: ['enum', [90, 180, 270], 90], ghost: ['bool', true], table: ['bool', true] },
    fix: s => {
      // The shape stays on the grid (−8 to 8): its corners run from 1 to 5 before the offset.
      const span = { tri: [4, 3], flag: [3, 5], ell: [4, 4], arrow: [5, 5] }[s.shape];
      s.ox = Math.max(-9, Math.min(8 - span[0], s.ox)); s.oy = Math.max(-9, Math.min(8 - span[1], s.oy));
    },
  },
  balance: {
    spec: { x: ['int', 1, 9, 3], lx: ['int', 0, 9, 3], lu: ['int', 0, 30, 2], rx: ['int', 0, 9, 1], ru: ['int', 0, 30, 8], show: ['bool', false], where: ['enum', ['both', 'left', 'right'], 'both'],
      hist: ['list', 12, { lx: ['int', 0, 9, 0], lu: ['int', 0, 30, 0], rx: ['int', 0, 9, 0], ru: ['int', 0, 30, 0], op: ['enum', ['addx', 'subx', 'add1', 'sub1', 'div', 'new'], 'new'], n: ['int', 0, 9, 0], w: ['enum', ['both', 'left', 'right'], 'both'] }, []] },
  },
  algebra: {
    spec: { tiles: ['list', 36, { k: ['enum', ['x2', 'x', '1'], 'x'], neg: ['bool', false] },
      [{ k: 'x2', neg: false }, { k: 'x2', neg: false }, { k: 'x', neg: false }, { k: 'x', neg: false }, { k: 'x', neg: false }, { k: 'x', neg: true }, { k: '1', neg: false }, { k: '1', neg: false }, { k: '1', neg: true }]] },
  },
  coins: {
    spec: { cur: ['enum', ['auto', 'usd', 'eur', 'gbp', 'gen'], 'auto'], mode: ['enum', ['count', 'change'], 'count'], counts: ['ints', 11, 0, 20, [3, 1, 2, 1]],
      cost: ['int', 0, 10000, 37], paid: ['int', 0, 10000, 100] },
    fix: s => { const n = { usd: 9, eur: 11, gbp: 11, gen: 7, auto: 11 }[s.cur]; s.counts = Array.from({ length: n }, (_, i) => s.counts[i] || 0); },
  },
  chance: {
    spec: { kind: ['enum', ['coin', 'dice', 'spinner'], 'coin'], dice: ['enum', [1, 2], 1], parts: ['int', 2, 8, 4], runs: ['int', 1, 1000, 100], counts: ['ints', 11, 0, 1000000, []] },
    fix: s => { const n = s.kind === 'coin' ? 2 : s.kind === 'spinner' ? s.parts : s.dice === 2 ? 11 : 6; s.counts = Array.from({ length: n }, (_, i) => s.counts[i] || 0); },
  },
  // ---- bar models and number rods (docs/decisions.md "Bar models and number rods"); the limits match
  // public/js/dash-math5.js BAR_LIMITS, BAR_START, ROD_W, ROD_H, ROD_MAX and EQ_START (tested to agree).
  // Bar models, a mode of Multiply and divide: groups × each (mul), parts of a whole (part) or two bars compared (cmp);
  // unk is which quantity is "?" (mul: total, groups, each; part: whole, then each part; cmp: difference, first,
  // second). story is the word problem: the teacher's own text in a layout or a sent copy; a student's own screen never
  // keeps it (student: true), so what a student writes stays in their browser.
  bars: {
    spec: { kind: ['enum', ['mul', 'part', 'cmp'], 'mul'], g: ['int', 1, 12, 3], e: ['int', 1, 100, 4], p: ['ints', 4, 1, 999, [5, 3]],
      ca: ['int', 1, 999, 9], cb: ['int', 1, 999, 5], unk: ['int', 0, 4, 0], hide: ['bool', true], bw: ['bool', true], bp: ['bool', true],
      max: ['int', 10, 1000, 50], story: ['textm', 240, ''] },
    fix: (s, o = {}) => {
      while (s.p.length < 2) s.p.push(1);
      const n = s.kind === 'part' ? s.p.length + 1 : 3;
      if (s.unk >= n) s.unk = 0;
      if (o.student) s.story = '';
    },
  },
  // Number rods: rods 1-20 units long on a 30 × 16 unit board (x, y: the rod's top left unit; v: standing up, never a rod
  // longer than 16), at most
  // 60; the equation (eq: shown) is l = r, terms 1-20 with exactly one 0, the missing box; model: its two trains shown.
  rods: {
    spec: { rods: ['list', 60, { n: ['int', 1, 20, 1], x: ['int', 0, 29, 0], y: ['int', 0, 15, 0], v: ['bool', false] }, []],
      dir: ['enum', ['h', 'v'], 'h'], grid: ['bool', true], units: ['bool', true], long: ['int', 11, 20, 12],
      eq: ['bool', true], l: ['ints', 3, 0, 20, [5, 4]], r: ['ints', 3, 0, 20, [0, 3]], model: ['bool', false] },
    fix: s => {
      for (const r of s.rods) {
        if (r.v && r.n > 16) r.v = false;
        r.x = Math.min(r.x, 30 - (r.v ? 1 : r.n)); r.y = Math.min(r.y, 16 - (r.v ? r.n : 1));
      }
      if (!rodEquation(s.l, s.r)) { s.l = [5, 4]; s.r = [0, 3]; s.model = false; }
    },
  },
  letters: {
    spec: { word: ['ints', 12, 0, 25, [2]], fam: ['enum', ['', 'at', 'an', 'ap', 'ig', 'in', 'ip', 'op', 'ot', 'ug', 'un', 'et', 'en', 'ell', 'ake', 'ine'], 'at'], caps: ['bool', false] },
    fix: s => { if (s.fam) s.word = s.word.slice(0, 2); },
  },
  // A sequence has n steps and main idea and details has d details (review: the teacher adds and takes away boxes); the
  // other kinds have a fixed number of boxes. Layouts saved before d existed get the old 3 details.
  organizer: {
    spec: { kind: ['enum', ['venn', 'tchart', 'kwl', 'story', 'main', 'seq'], 'venn'], n: ['int', 2, 10, 4], d: ['int', 2, 6, 3], title: ['text', 60, ''],
      boxes: ['list', 10, { h: ['text', 40, ''], t: ['textm', 400, ''] }, []] },
    fix: s => { const n = organizerBoxes(s); s.boxes = Array.from({ length: n }, (_, i) => s.boxes[i] || { h: '', t: '' }); },
  },
  map: {
    spec: { kind: ['enum', ['world', 'grid'], 'world'], names: ['bool', true], pins: ['list', 12, { x: ['int', 0, 1000, 500], y: ['int', 0, 500, 250], l: ['text', 24, ''] }, []] },
  },
};
/** How many boxes each graphic organizer has; a sequence's steps (n) and main idea's details (d) are set by the teacher. */
export const ORGANIZER_BOXES = { venn: 3, tchart: 2, kwl: 3, story: 5 };
/** The organizers whose boxes can be added and taken away: the state key, the fewest and the most (public/js/dash-tools4.js). */
export const ORGANIZER_GROW = { seq: { key: 'n', lo: 2, hi: 10 }, main: { key: 'd', lo: 2, hi: 6 } };
/** An organizer state's number of boxes (main idea and details: the idea and its details). */
export const organizerBoxes = s => ORGANIZER_BOXES[s.kind] || (s.kind === 'main' ? 1 + s.d : s.n);
/** The tools a teacher can send to students (each student gets their own copy). Since "maths tools combined" this also
 *  holds the retired tools' ids: they are modes of another tool now, and their specs clean those modes' states. */
export const TOOL_IDS = Object.keys(TOOL_SPECS);
/** Maths tools combined (docs/decisions.md "Classroom dashboards: maths tools combined"): a tool with modes and, in
 *  order, its modes. The first mode is the tool's own (its state's own keys, as always); every other mode is a tool that
 *  used to stand alone, and its state lives under its old id (placeval's { v, discs, dec, base10: { h, t, o } }). Which
 *  mode shows is `tab` (`mode` is already the fraction tool's Compare|Add..., the number line's and the coins'). */
export const TOOL_MODES = {
  placeval: ['placeval', 'base10'],
  fractions: ['fractions', 'fdp'],
  area: ['area', 'times', 'bars'],
  geoboard: ['geoboard', 'angle'],
  pattern: ['pattern', 'solids', 'transform'],
  algebra: ['algebra', 'balance'],
  chance: ['chance', 'graph'],
};
/** Modes that never were a tool of their own (bar models, docs/decisions.md "Bar models and number rods"): nothing was
 *  ever saved with their id as a widget's type, so they are not retired types. */
export const NEW_MODES = ['bars'];
/** A retired tool's id -> the tool it is a mode of now. */
export const MODE_HOME = Object.fromEntries(Object.entries(TOOL_MODES).flatMap(([id, modes]) => modes.slice(1).filter(m => !NEW_MODES.includes(m)).map(m => [m, id])));

/** Number rods: is l = r an equation the board can model (each side 1-3 terms of 0-20, exactly one 0, the missing term
 *  1-20 and each side at most 20 long)? public/js/dash-math5.js eqValid, tested to agree. */
export function rodEquation(l, r) {
  if (!Array.isArray(l) || !Array.isArray(r) || !l.length || !r.length || l.length > 3 || r.length > 3) return false;
  const all = [...l, ...r], sum = a => a.reduce((x, y) => x + y, 0);
  if (all.filter(x => x === 0).length !== 1) return false;
  const m = l.includes(0) ? sum(r) - sum(l) : sum(l) - sum(r);
  return m >= 1 && m <= 20 && sum(l) + (l.includes(0) ? m : 0) <= 20 && sum(r) + (r.includes(0) ? m : 0) <= 20;
}
function cleanBy(spec, src) {
  const o = src && typeof src === 'object' && !Array.isArray(src) ? src : {}, out = {};
  for (const [k, d] of Object.entries(spec)) {
    const v = o[k];
    if (d[0] === 'int') out[k] = toInt(v, d[1], d[2], d[3]);
    else if (d[0] === 'enum') out[k] = d[1].includes(v) ? v : d[1].includes(Number(v)) && typeof d[1][0] === 'number' ? Number(v) : d[2];
    else if (d[0] === 'bool') out[k] = v === undefined ? d[1] : v === true || v === 1 || v === 'true';
    else if (d[0] === 'text') out[k] = v === undefined ? d[2] : SAFE_TEXT(v, d[1]);
    else if (d[0] === 'textm') out[k] = v === undefined ? d[2] : SAFE_LINES(v, d[1]);
    else if (d[0] === 'ints') out[k] = (Array.isArray(v) ? v : d[4] || []).slice(0, d[1]).map(x => toInt(x, d[2], d[3], null)).filter(x => x !== null);
    else if (d[0] === 'obj') out[k] = cleanBy(d[1], v);
    else if (d[0] === 'list') out[k] = Array.isArray(v) ? v.slice(0, d[1]).filter(x => x && typeof x === 'object').map(x => cleanBy(d[2], x)) : d[3].map(x => JSON.parse(JSON.stringify(x)));
  }
  return out;
}
/** A tool's state as a browser sent it -> what may be stored or sent to students. Nothing else survives. o.student: it is
 *  saved on a student's own screen (the shape board then keeps no labels or drawings). */
export function cleanToolState(type, v, o = {}) {
  const t = TOOL_SPECS[type]; if (!t) return null;
  const s = cleanBy(t.spec, v);
  if (t.fix) t.fix(s, o);
  // A tool with modes: which one shows (kept only when it isn't the tool's own) and each other mode's state, cleaned by
  // its own spec and kept only when it differs from its start. So a state saved before the modes is stored exactly as it
  // was, and switching modes never loses what was set up in another.
  const modes = TOOL_MODES[type];
  if (modes) {
    const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    if (modes.includes(src.tab) && src.tab !== type) s.tab = src.tab;
    for (const m of modes.slice(1)) {
      if (!src[m] || typeof src[m] !== 'object' || Array.isArray(src[m])) continue;
      const sub = cleanToolState(m, src[m], o);
      if (JSON.stringify(sub) !== JSON.stringify(cleanToolState(m, {}, o))) s[m] = sub;
    }
  }
  return s;
}
/** A state of a retired tool -> the same state as a mode of the tool it is now ({ type, state }); anything else unchanged. */
export function moveToolState(type, state) {
  const home = MODE_HOME[type];
  return home ? { type: home, state: cleanToolState(home, { tab: type, [type]: state && typeof state === 'object' ? state : {} }) } : { type, state };
}
