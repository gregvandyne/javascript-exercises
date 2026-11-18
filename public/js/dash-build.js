// Classroom dashboards: "Build it" practice sets (docs/decisions.md "Classroom dashboards: Build it"). The teacher makes a
// set of targets for a maths tool (typed, "347, 1205, 58" or "3:45, 7:10", or from a ready-made generator), gives an
// instruction and sends it; each student builds one target at a time on their own copy of the tool, with its answer
// readout hidden, and presses Check. Pure: no DOM, no network, no storage. The same code runs in the browser (the
// student's feedback, the teacher's sheet) and on the server (server/services/dash.js checks what a student sends again
// and keeps only right / not yet for each target).
//
// Each tool (a mode id, as in TOOL_SPECS) has:
//   parse(text, base, intl)  one typed target -> the target, or null (not something this tool can build)
//   clean(x, base)           a target as a browser sent it -> the same target, or null (the server keeps only these)
//   text(x, base, intl)      the target as the student reads it ("347", "3:45", "3/4")
//   gens                     ready-made generators: id -> (rnd, base) => target
//   start(base, x)           the tool's state the student starts from (nothing built, the answer hidden)
//   check(st, x, base)       -> { ok, hint } (hint: { k, ...vars } for dash.build.hint.<k>, or null)
//   solve(base, x)           a state that shows the target built (the teacher's "Show on the board"), or null
import * as M from './dash-math.js';
import * as M4 from './dash-math4.js';
import * as M5 from './dash-math5.js';

export const MAX_TARGETS = 12;
export { seeded } from './dash-math4.js';
export const COUNTS = [3, 4, 5, 6, 8, 10];
export const DEFAULT_COUNT = 5;
const clone = x => JSON.parse(JSON.stringify(x));
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const pick = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const nf = (n, intl) => new Intl.NumberFormat(intl).format(n);
const minus = v => String(v).replace(/^-/, '−');
const plain = t => String(t ?? '').trim().replace(/[−–—]/g, '-').replace(/\s+/g, ' ');
/** A whole number typed with or without grouping marks ("1205", "1,205") -> the number, or null. */
const wholeOf = (t, intl) => { const r = M.pvParse(t, intl, 0); return r.ok ? r.v / 1000 : null; };
/** "3/4", "1 1/2", "2", "0.25", "1,5" -> { n, d } (not simplified) or null. */
function fracOf(t) {
  const s = plain(t);
  const f = M.parseFraction(s); if (f) return { n: f.n, d: f.d };
  const m = /^(-)?(\d{0,4})[.,](\d{1,3})$/.exec(s);
  if (!m || (!m[2] && !m[3])) return null;
  const d = 10 ** m[3].length, n = Number(m[2] || '0') * d + Number(m[3]);
  return { n: m[1] ? -n : n, d };
}
const sameFrac = (a, b) => a.n * b.d === b.n * a.d;
const PLACE_KEYS = { h: 'hundreds', t: 'tens', o: 'ones' };

// ---------------------------------------------------------------- the tools
export const BUILD = {
  // Base-ten blocks: a whole number 1-999; the blocks' value must be it (any trades allowed).
  base10: {
    parse: (t, b, intl) => int(wholeOf(t, intl), 1, 999),
    clean: x => int(x, 1, 999),
    text: (x, b, intl) => nf(x, intl),
    gens: { d1: rnd => pick(rnd, 1, 9), d2: rnd => pick(rnd, 10, 99), d3: rnd => pick(rnd, 100, 999), round: rnd => pick(rnd, 1, 9) * 10 + pick(rnd, 0, 9) * 100 },
    start: () => ({ h: 0, t: 0, o: 0 }),
    check(st, x) {
      const v = M.blocksValue(st);
      if (v === x) return { ok: true, hint: null };
      if (!v) return { ok: false, hint: { k: 'empty' } };
      const want = M.blocksOf(x);
      if (st.t < 10 && st.o < 10) for (const p of ['h', 't', 'o']) if (st[p] !== want[p]) return { ok: false, hint: { k: 'place', place: PLACE_KEYS[p], a: st[p], b: want[p] } };
      return { ok: false, hint: { k: 'made', a: v, b: x } };
    },
    solve: (b, x) => M.blocksOf(x),
  },
  // Place value chart: a number 0.001-9,999.999 (thousandths), whole numbers only without the decimal columns.
  placeval: {
    parse: (t, b, intl) => { const r = M.pvParse(t, intl, b && b.dec === false ? 0 : 3); return r.ok && r.v > 0 ? r.v : null; },
    clean: (x, b) => (int(x, 1, M.PV_MAX) !== null && (b.dec !== false || x % 1000 === 0) ? x : null),
    text: (x, b, intl) => M.pvFormat(x, intl),
    gens: {
      d3: rnd => pick(rnd, 100, 999) * 1000, d4: rnd => pick(rnd, 1000, 9999) * 1000,
      dec1: rnd => pick(rnd, 1, 999) * 1000 + pick(rnd, 1, 9) * 100, dec2: rnd => pick(rnd, 0, 99) * 1000 + pick(rnd, 1, 99) * 10,
    },
    decGens: ['dec1', 'dec2'],
    start: b => ({ ...b, v: 0 }),
    check(st, x) {
      if (st.v === x) return { ok: true, hint: null };
      if (!st.v) return { ok: false, hint: { k: 'empty' } };
      const a = M.pvDigits(st.v), w = M.pvDigits(x);
      const i = a.findIndex((d, k) => d !== w[k]);
      return { ok: false, hint: { k: 'place', place: M.PLACES[i].k, a: a[i], b: w[i] } };
    },
    solve: (b, x) => ({ ...b, v: x }),
  },
  // Ten frames: a number of counters 1-20 ("7"), or two colours ("3 + 4": 3 red, 4 yellow).
  tenframe: {
    parse(t) {
      const s = plain(t), m = /^(\d{1,2}) ?\+ ?(\d{1,2})$/.exec(s);
      if (m) { const r = +m[1], y = +m[2]; return r + y >= 1 && r + y <= 20 ? { r, y } : null; }
      const n = /^\d{1,2}$/.test(s) ? +s : null;
      return n >= 1 && n <= 20 ? { n } : null;
    },
    clean(x) {
      if (!x || typeof x !== 'object') return null;
      if ('n' in x) return int(x.n, 1, 20) !== null ? { n: x.n } : null;
      return int(x.r, 0, 20) !== null && int(x.y, 0, 20) !== null && x.r + x.y >= 1 && x.r + x.y <= 20 ? { r: x.r, y: x.y } : null;
    },
    text: (x, b, intl) => ('n' in x ? nf(x.n, intl) : `${nf(x.r, intl)} + ${nf(x.y, intl)}`),
    gens: {
      to10: rnd => ({ n: pick(rnd, 1, 10) }), to20: rnd => ({ n: pick(rnd, 11, 20) }),
      bonds: rnd => { const r = pick(rnd, 1, 9); return { r, y: 10 - r }; }, pairs: rnd => { const r = pick(rnd, 1, 9); return { r, y: pick(rnd, 1, 10 - r) }; },
    },
    start: (b, x) => ({ frames: total(x) > 10 ? 2 : 1, cells: Array(20).fill(0), bond: false }),
    check(st, x) {
      const c = (st.cells || []).slice(0, (st.frames || 1) * 10), r = c.filter(v => v === 1).length, y = c.filter(v => v === 2).length;
      if ('n' in x) {
        if (r + y === x.n) return { ok: true, hint: null };
        return { ok: false, hint: r + y ? { k: 'made', a: r + y, b: x.n } : { k: 'empty' } };
      }
      if (r === x.r && y === x.y) return { ok: true, hint: null };
      return { ok: false, hint: r + y ? { k: 'colours', a: r, b: y, c: x.r, d: x.y } : { k: 'empty' } };
    },
    solve(b, x) {
      const r = 'n' in x ? x.n : x.r, y = 'n' in x ? 0 : x.y;
      return { frames: r + y > 10 ? 2 : 1, cells: Array.from({ length: 20 }, (_, i) => (i < r ? 1 : i < r + y ? 2 : 0)), bond: !('n' in x) };
    },
  },
  // Number chart: find and shade one number.
  hundreds: {
    parse: (t, b, intl) => { const n = wholeOf(t, intl), [lo, hi] = chartRange(b); return n !== null && n >= lo && n <= hi ? n : null; },
    clean: (x, b) => { const [lo, hi] = chartRange(b); return int(x, lo, hi); },
    text: (x, b, intl) => nf(x, intl),
    gens: { any: (rnd, b) => { const [lo, hi] = chartRange(b); return pick(rnd, Math.max(1, lo), hi); }, round: (rnd, b) => pick(rnd, 1, chartRange(b)[1] >= 120 ? 12 : 10) * 10, d2: rnd => pick(rnd, 11, 99) },
    start: b => ({ start: b.start, upto: b.upto, shade: [], skip: 0, hide: 'none' }),
    check(st, x) {
      const s = st.shade || [];
      if (s.length === 1 && s[0] === x) return { ok: true, hint: null };
      if (!s.length) return { ok: false, hint: { k: 'empty' } };
      if (s.length > 1) return { ok: false, hint: { k: 'oneCell' } };
      return { ok: false, hint: { k: 'cell', a: s[0], b: x } };
    },
    solve: (b, x) => ({ start: b.start, upto: b.upto, shade: [x], skip: 0, hide: 'none' }),
  },
  // Number line: put one point on a number (a tick of the teacher's line: whole, a fraction or a decimal).
  numline: {
    parse(t, b) {
      const f = fracOf(t); if (!f) return null;
      const sub = lineSub(b), tick = (f.n * sub) / f.d;
      return Number.isInteger(tick) && tick >= b.lo * sub && tick <= b.hi * sub ? tick : null;
    },
    clean: (x, b) => int(x, b.lo * lineSub(b), b.hi * lineSub(b)),
    text: (x, b) => M.tickLabel(x, lineSub(b), b.mode),
    gens: {
      whole: (rnd, b) => pick(rnd, Math.ceil(b.lo), Math.floor(b.hi)) * lineSub(b),
      tick: (rnd, b) => pick(rnd, b.lo * lineSub(b), b.hi * lineSub(b)),
    },
    start: b => ({ ...b, tool: 'point', points: [], jumps: [] }),
    check(st, x, b) {
      const p = st.points || [];
      if (p.length === 1 && p[0] === x) return { ok: true, hint: null };
      if (!p.length) return { ok: false, hint: { k: 'empty' } };
      if (p.length > 1) return { ok: false, hint: { k: 'onePoint' } };
      return { ok: false, hint: { k: 'point', a: M.tickLabel(p[0], lineSub(b), b.mode), b: M.tickLabel(x, lineSub(b), b.mode) } };
    },
    solve: (b, x) => ({ ...b, tool: 'point', points: [x], jumps: [] }),
  },
  // Teaching clock: a time; on a 12-hour clock 3:45 and 15:45 are the same hands.
  tclock: {
    parse(t, b) {
      const m = /^(\d{1,2})(?:[:.h](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)?$/.exec(plain(t).toLowerCase());
      if (!m) return null;
      let h = +m[1]; const mm = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : '';
      if (h > 23 || mm > 59 || (ap && (h < 1 || h > 12))) return null;
      if (ap) h = (h % 12) + (ap === 'p' ? 12 : 0);
      const v = h * 60 + mm;
      return b && b.h24 ? v : v % 720;
    },
    clean: (x, b) => int(x, 0, b.h24 ? 1439 : 719),
    // A 12-hour clock's hands have no morning or afternoon: "3:45", never "3:45 AM".
    text: (x, b, intl) => new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit', hour12: !b.h24, timeZone: 'UTC' })
      .formatToParts(new Date(Date.UTC(2020, 0, 1, 0, x || (b.h24 ? 0 : 720)))).filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim(),
    gens: { hour: () => 0, half: () => 0, quarter: () => 0, five: () => 0 },
    // The hands start at 12:00 (at 6:00 when the target is 12:00, so nothing is right before the student starts).
    start: (b, x) => ({ ...b, t: x % 720 ? 0 : 360, digital: false, el: false }),
    check(st, x, b) {
      const t = M.wrapMin(st.t), same = b.h24 ? t === x : t % 720 === x % 720;
      if (same) return { ok: true, hint: null };
      if (t % 60 !== x % 60) return { ok: false, hint: { k: 'clockMin', a: t % 60, b: x % 60 } };
      return { ok: false, hint: { k: 'clockHour' } };
    },
    solve: (b, x) => ({ ...b, t: x, el: false }),
  },
  // Shape board (square grid): a closed shape with this area, in square units (halves too: 4 1/2).
  geoboard: {
    parse(t, b) { const f = fracOf(t); if (!f || f.d < 1) return null; const a2 = (2 * f.n) / f.d; return Number.isInteger(a2) ? int(a2, 1, maxArea2(b)) : null; },
    clean: (x, b) => int(x, 1, maxArea2(b)),
    text: x => M4.mixed(x, 2),
    gens: { small: rnd => 2 * pick(rnd, 2, 9), halves: rnd => 2 * pick(rnd, 1, 7) + 1, big: (rnd, b) => 2 * pick(rnd, 10, Math.min(24, maxArea2(b) / 2)) },
    start: b => ({ pegs: b.pegs || 7, cur: -1, show: false, bands: [] }),
    check(st, x) {
      const n = st.pegs || 7, ok = s => s && s.closed && (s.pts || []).length >= 3 && M4.simpleOn('square', n, s.pts);
      const shapes = (st.bands || []).filter(ok);
      if (shapes.some(s => M4.shapeArea('square', n, s.pts).a2 === x)) return { ok: true, hint: null };
      if (!shapes.length) return { ok: false, hint: { k: 'shape' } };
      const s = ok((st.bands || [])[st.cur]) ? st.bands[st.cur] : shapes[shapes.length - 1];
      return { ok: false, hint: { k: 'area', a: M4.mixed(M4.shapeArea('square', n, s.pts).a2, 2), b: M4.mixed(x, 2) } };
    },
    solve: (b, x) => ({ pegs: b.pegs || 7, cur: 0, show: false, bands: [{ pts: areaShape(x, b.pegs || 7), closed: true, c: 0 }] }),
  },
  // Fraction bars: shade a fraction (Compare, one bar; an equal one, 6/8 for 3/4, is right too), or, since "fractions:
  // equations" (docs/decisions.md), work out an equation ({ op, a, b }: "1/2 + 1/4") and shade its answer on a bar of up
  // to three wholes (st.bars: one bar a whole, all cut the same). parse and the generators make equations when the
  // sheet's base says so (base.task 'eq', base.ops which ones); everything else knows a target by its shape.
  fractions: {
    parse(t, b) {
      if (b && b.task === 'eq') return eqParse(t);
      const f = fracOf(t); return f && f.d >= 1 && f.d <= 12 && f.n >= 0 && f.n <= f.d ? { n: f.n, d: f.d } : null;
    },
    clean: x => (isEq(x) ? eqClean(x) : x && int(x.d, 1, 12) !== null && int(x.n, 0, x.d) !== null ? { n: x.n, d: x.d } : null),
    text: x => (isEq(x) ? eqText(x) : `${x.n}/${x.d}`),
    gens: { unit: rnd => ({ n: 1, d: pick(rnd, 2, 10) }), proper: rnd => { const d = pick(rnd, 2, 12); return { n: pick(rnd, 1, d - 1), d }; }, eighths: rnd => { const d = [2, 4, 8][pick(rnd, 0, 2)]; return { n: pick(rnd, 1, d - 1), d }; } },
    // The equations' generators (gensFor picks the ones that suit the sheet's "Which equations?").
    eqGens: {},
    start: (b, x) => ({ shape: isEq(x) ? 'bar' : b.shape || 'bar', bars: [{ n: 0, d: 2 }], same: false, hide: true }),
    check(st, x) {
      if (isEq(x)) return eqCheck(st, x);
      const f = (st.bars || [])[0] || { n: 0, d: 1 };
      if (sameFrac(f, x)) return { ok: true, hint: null };
      if (!f.n) return { ok: false, hint: { k: 'empty' } };
      return { ok: false, hint: { k: 'made', a: `${f.n}/${f.d}`, b: `${x.n}/${x.d}` } };
    },
    // The teacher's tool may be on Add, Divide…: a fraction shows in Compare, the mode the set is built in; an equation
    // turns the tool to its operation with its two fractions and the answer shown (the working from its start).
    solve: (b, x) => (isEq(x) ? { shape: b.shape || 'bar', mode: x.op, a: { ...x.a }, b: { ...x.b }, fit: 0, step: 0, hide: false }
      : { shape: b.shape || 'bar', mode: 'compare', fit: 0, step: 0, bars: [{ n: x.n, d: x.d }], same: false, hide: false }),
  },
  // Fraction, decimal, percent: show an amount ("3/4", "0.25", "25%"); any equal fraction is right.
  fdp: {
    parse(t) {
      const s = plain(t), p = /^(\d{1,3}(?:[.,]\d)?) ?%$/.exec(s);
      const f = p ? { n: Math.round(Number(p[1].replace(',', '.')) * 10), d: 1000, as: 'p' } : fracOf(s);
      if (!f) return null;
      const as = p ? 'p' : /[.,]/.test(s) ? 'd' : 'f', g = as === 'f' ? f : M.simplify(f.n, f.d);
      return g.d >= 1 && g.d <= 100 && g.n >= 0 && g.n <= g.d ? { n: g.n, d: g.d, as } : null;
    },
    clean: x => (x && int(x.d, 1, 100) !== null && int(x.n, 0, x.d) !== null && ['f', 'd', 'p'].includes(x.as) ? { n: x.n, d: x.d, as: x.as } : null),
    text: x => (x.as === 'p' ? M.percentString(x.n, x.d) : x.as === 'd' ? M.decimalString(x.n, x.d) : `${x.n}/${x.d}`),
    gens: {
      tenths: rnd => ({ ...M.simplify(pick(rnd, 1, 9), 10), as: 'd' }), hundredths: rnd => ({ ...M.simplify(pick(rnd, 1, 99), 100), as: 'd' }),
      percent: rnd => ({ ...M.simplify(pick(rnd, 1, 19) * 5, 100), as: 'p' }),
      common: rnd => ({ ...[{ n: 1, d: 2 }, { n: 1, d: 4 }, { n: 3, d: 4 }, { n: 1, d: 5 }, { n: 2, d: 5 }, { n: 3, d: 5 }, { n: 1, d: 10 }, { n: 7, d: 10 }][pick(rnd, 0, 7)], as: 'f' }),
    },
    start: () => ({ n: 0, d: 10 }),
    check(st, x) {
      if (sameFrac(st, x)) return { ok: true, hint: null };
      if (!st.n) return { ok: false, hint: { k: 'empty' } };
      return { ok: false, hint: { k: 'made', a: `${st.n}/${st.d}`, b: BUILD.fdp.text(x) } };
    },
    solve: (b, x) => ({ n: x.n, d: x.d }),
  },
  // Arrays: rows × columns ("3 × 4", either way round), or a number to make as any array ("12").
  area: {
    parse(t) {
      const s = plain(t), m = /^(\d{1,2}) ?[x×*] ?(\d{1,2})$/i.exec(s);
      if (m) { const a = +m[1], b = +m[2]; return a >= 1 && a <= 12 && b >= 1 && b <= 12 ? { a, b } : null; }
      const n = /^\d{1,3}$/.test(s) ? +s : null;
      return n >= 1 && n <= 144 ? { p: n } : null;
    },
    clean: x => (x && 'p' in x ? (int(x.p, 1, 144) !== null ? { p: x.p } : null) : x && int(x.a, 1, 12) !== null && int(x.b, 1, 12) !== null ? { a: x.a, b: x.b } : null),
    text: (x, b, intl) => ('p' in x ? nf(x.p, intl) : `${x.a} × ${x.b}`),
    gens: { facts5: rnd => ({ a: pick(rnd, 2, 5), b: pick(rnd, 2, 5) }), facts10: rnd => ({ a: pick(rnd, 2, 10), b: pick(rnd, 2, 10) }), products: rnd => ({ p: [6, 8, 10, 12, 15, 16, 18, 20, 24, 30, 36][pick(rnd, 0, 10)] }) },
    start: () => ({ a: 1, b: 1, view: 'array', sa: 0, sb: 0 }),
    check(st, x) {
      const ok = 'p' in x ? st.a * st.b === x.p : (st.a === x.a && st.b === x.b) || (st.a === x.b && st.b === x.a);
      if (ok) return { ok: true, hint: null };
      return { ok: false, hint: { k: 'made', a: `${st.a} × ${st.b} = ${st.a * st.b}`, b: BUILD.area.text(x, null, 'en') } };
    },
    solve(b, x) {
      if (!('p' in x)) return { a: x.a, b: x.b, view: 'array', sa: 0, sb: 0 };
      let a = Math.floor(Math.sqrt(x.p)); while (a > 1 && (x.p % a || x.p / a > 12)) a--;
      return { a, b: x.p / a, view: 'array', sa: 0, sb: 0 };
    },
  },
  // Coins and money: make an amount (in cents, or plain units for the plain set).
  coins: {
    parse(t, b, intl) {
      const s = plain(t).replace(/[$€£]/g, '').trim(), cents = /^(\d{1,4}) ?(¢|c|p)$/i.exec(s);
      if (cents) return b.cur === 'gen' ? null : int(+cents[1], 1, 10000);
      if (b.cur === 'gen') return int(wholeOf(s, intl), 1, 10000);
      const f = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(s); if (!f) return null;
      return int(Number(f[1]) * 100 + Number((f[2] || '').padEnd(2, '0') || '0'), 1, 10000);
    },
    clean: x => int(x, 1, 10000),
    text: (x, b, intl) => M4.moneyText(b.cur, x, intl),
    gens: { coins1: (rnd, b) => (b.cur === 'gen' ? pick(rnd, 2, 20) : pick(rnd, 5, 99)), coins5: (rnd, b) => (b.cur === 'gen' ? pick(rnd, 20, 100) : pick(rnd, 101, 500)) },
    start: b => ({ cur: b.cur, mode: 'count', counts: M4.denoms(b.cur).map(() => 0) }),
    check(st, x, b, intl) {
      const v = M4.moneyTotal(b.cur, st.counts || []);
      if (v === x) return { ok: true, hint: null };
      return { ok: false, hint: v ? { k: 'made', a: M4.moneyText(b.cur, v, intl), b: M4.moneyText(b.cur, x, intl) } : { k: 'empty' } };
    },
    solve: (b, x) => ({ cur: b.cur, mode: 'count', counts: M4.fewest(b.cur, x) }),
  },
  // Angle maker: an angle in degrees.
  angle: {
    parse: t => { const m = /^(\d{1,3}) ?°?$/.exec(plain(t)); return m ? int(+m[1], 0, 360) : null; },
    clean: x => int(x, 0, 360),
    text: x => `${x}°`,
    gens: { deg10: rnd => pick(rnd, 1, 17) * 10, deg5: rnd => pick(rnd, 1, 35) * 5, named: rnd => [30, 45, 60, 90, 120, 135, 150, 180][pick(rnd, 0, 7)] },
    start: b => ({ ...b, a: 0 }),
    check(st, x) { return st.a === x ? { ok: true, hint: null } : { ok: false, hint: { k: 'made', a: `${st.a}°`, b: `${x}°` } }; },
    solve: (b, x) => ({ ...b, a: x }),
  },
  // Pattern blocks: blocks that make this much of a hexagon ("1 1/2", "2/3").
  pattern: {
    parse(t) { const f = fracOf(t); if (!f || f.n <= 0) return null; const s = (6 * f.n) / f.d; return Number.isInteger(s) ? int(s, 1, 36) : null; },
    clean: x => int(x, 1, 36),
    text: x => M4.mixed(x, 6),
    gens: { part: rnd => pick(rnd, 1, 5), wholes: rnd => pick(rnd, 1, 3) * 6, mixed: rnd => pick(rnd, 7, 17) },
    start: () => ({ blocks: [] }),
    check(st, x) {
      const s = M4.hexFraction(st.blocks || []).sixths;
      if (s === x) return { ok: true, hint: null };
      return { ok: false, hint: s ? { k: 'made', a: M4.mixed(s, 6), b: M4.mixed(x, 6) } : { k: 'empty' } };
    },
    solve: null,
  },
  // Coordinate plane: plot one point.
  coord: {
    split: text => (String(text).match(/\(?\s*[-−]?\d{1,2}\s*[,;]\s*[-−]?\d{1,2}\s*\)?/g) || []),
    parse(t, b) {
      const m = /^\(?\s*(-?\d{1,2})\s*[,;]\s*(-?\d{1,2})\s*\)?$/.exec(plain(t)); if (!m) return null;
      const x = +m[1], y = +m[2], [lo, hi] = planeRange(b);
      return x >= lo && x <= hi && y >= lo && y <= hi ? { x, y } : null;
    },
    clean: (p, b) => { const [lo, hi] = planeRange(b); return p && int(p.x, lo, hi) !== null && int(p.y, lo, hi) !== null ? { x: p.x, y: p.y } : null; },
    text: p => `(${minus(p.x)}, ${minus(p.y)})`,
    gens: { q1: (rnd, b) => ({ x: pick(rnd, 1, planeRange(b)[1]), y: pick(rnd, 1, planeRange(b)[1]) }), all: (rnd, b) => { const [lo, hi] = planeRange(b); return { x: pick(rnd, lo, hi), y: pick(rnd, lo, hi) }; } },
    start: b => ({ ...b, points: [], line: false, table: false }),
    check(st, x) {
      const p = st.points || [];
      if (p.length === 1 && p[0].x === x.x && p[0].y === x.y) return { ok: true, hint: null };
      if (!p.length) return { ok: false, hint: { k: 'empty' } };
      if (p.length > 1) return { ok: false, hint: { k: 'onePoint' } };
      return { ok: false, hint: { k: 'point', a: BUILD.coord.text(p[0]), b: BUILD.coord.text(x) } };
    },
    solve: (b, x) => ({ ...b, points: [x], line: false, table: false }),
  },
  // Number rods: a train (rods end to end) this long.
  rods: {
    parse: (t, b, intl) => int(wholeOf(t, intl), 1, 30),
    clean: x => int(x, 1, 30),
    text: (x, b, intl) => nf(x, intl),
    gens: { to10: rnd => pick(rnd, 2, 10), to20: rnd => pick(rnd, 11, 20), round: rnd => pick(rnd, 1, 3) * 10 },
    start: b => ({ ...b, rods: [], eq: false, model: false }),
    check(st, x) {
      const ts = M5.trains(st.rods || []);
      if (ts.some(t => t.len === x)) return { ok: true, hint: null };
      if (!ts.length) return { ok: false, hint: { k: 'empty' } };
      const near = ts.reduce((a, t) => (Math.abs(t.len - x) < Math.abs(a.len - x) ? t : a));
      return { ok: false, hint: { k: 'train', a: near.len, b: x } };
    },
    solve(b, x) { const rods = []; let left = x, at = 0; while (left > 0) { const n = Math.min(10, left); rods.push({ n, x: at, y: 2, v: false }); at += n; left -= n; } return { ...b, rods, eq: false, model: false }; },
  },
};
export const BUILD_TOOLS = Object.keys(BUILD);
// The clock's generators are worked out from the clock's own kind (12 or 24 hours).
const clockGen = step => (rnd, b) => { const v = pick(rnd, 0, (b && b.h24 ? 1440 : 720) / step - 1) * step; return v; };
Object.assign(BUILD.tclock.gens, { hour: clockGen(60), half: clockGen(30), quarter: clockGen(15), five: clockGen(5) });

// ---------------------------------------------------------------- fractions: equations
// (docs/decisions.md "Classroom dashboards: fractions, equations"). An equation is { op, a, b }: two fractions inside the
// fraction tool's own limits (M.OP_LIMITS: a bottom number 1-12, a top number 0-12, at most three wholes), never divided
// by zero, with an answer the student can shade: more than zero, at most three wholes, and a bottom number of at most 12
// in its simplest form (so a bar cut into 1-12 parts can show it).
/** "Which equations?" on the teacher's sheet -> the operations it covers. */
export const EQ_OPS = { add: ['add'], sub: ['sub'], addsub: ['add', 'sub'], mul: ['mul'], div: ['div'], all: ['add', 'sub', 'mul', 'div'] };
export const EQ_SETS = Object.keys(EQ_OPS);
/** The generators each "Which equations?" offers, simplest first. */
const EQ_GEN_LIST = {
  add: ['eqSame', 'eqMult', 'eqAny'], sub: ['eqSame', 'eqMult', 'eqAny'], addsub: ['eqSame', 'eqMult', 'eqAny'],
  mul: ['eqUnit', 'eqWholeMul', 'eqAny'], div: ['eqMult', 'eqWholeDiv', 'eqAny'], all: ['eqEasy', 'eqAny'],
};
const EQ_SIGN = { add: '+', sub: '−', mul: '×', div: '÷' };
const isEq = x => !!(x && typeof x === 'object' && Object.prototype.hasOwnProperty.call(x, 'op'));
const fracOk = f => f && int(f.d, 1, M.OP_LIMITS.dMax) !== null && int(f.n, 0, Math.min(M.OP_LIMITS.nMax, M.OP_LIMITS.wholes * f.d)) !== null;
/** The answer of a { op, a, b } (lowest terms), or null when it is not an equation a student can shade. */
export function eqAnswer(x) {
  if (!x || !M.OPS[x.op] || !fracOk(x.a) || !fracOk(x.b)) return null;
  if (x.op === 'div' && !x.b.n) return null;   // never divide by zero
  const r = M.operate(x.op, x.a, x.b), s = r.simple;
  return s.n > 0 && s.d <= 12 && s.n <= M.OP_LIMITS.wholes * s.d ? s : null;
}
function eqClean(x) {
  const e = { op: x.op, a: x.a && { n: x.a.n, d: x.a.d }, b: x.b && { n: x.b.n, d: x.b.d } };
  return eqAnswer(e) ? e : null;
}
const opText = f => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);
const eqText = x => `${opText(x.a)} ${EQ_SIGN[x.op]} ${opText(x.b)}`;
/** One fraction of an equation as typed: "3/4", "2", "1 1/2" (not a negative one). */
function operandOf(t) { const f = fracOf(t); return f && f.n >= 0 && Number.isInteger(f.n) && Number.isInteger(f.d) ? { n: f.n, d: f.d } : null; }
const OP_OF = { '+': 'add', '-': 'sub', x: 'mul', '×': 'mul', '*': 'mul', '·': 'mul', '÷': 'div', ':': 'div' };
/** "1/2 + 1/4", "3/4 − 1/8", "2/3 x 3/4", "1/2 ÷ 1/4", "1/2 : 1/4", "1/2 / 1/4" (a slash with spaces round it divides),
 *  with or without "= ?" -> { op, a, b } or null. */
export function eqParse(t) {
  const s = plain(t).replace(/\s*=\s*\??$/, '');
  const read = str => {
    const m = /^(.+?)\s*([+\-x×*·÷:])\s*(.+)$/i.exec(str); if (!m) return null;
    const a = operandOf(m[1]), b = operandOf(m[3]), op = OP_OF[m[2].toLowerCase()];
    if (!a || !b || !op) return null;
    const e = { op, a, b }; return eqAnswer(e) ? e : null;
  };
  return read(s.replace(/\s*\/\s*/g, '/')) || (/\s\/\s/.test(s) ? read(s.replace(/\s+\/\s+/, ' ÷ ').replace(/\s*\/\s*/g, '/')) : null);
}
/** A shaded answer as bars, one a whole, each cut into d parts: `shaded` parts in all, over `wholes` bars. */
export function answerBars(shaded, d, wholes = 1) {
  const w = Math.max(1, Math.min(M.OP_LIMITS.wholes, wholes)), t = Math.max(0, Math.min(shaded, w * d));
  return Array.from({ length: w }, (_, i) => ({ n: Math.max(0, Math.min(d, t - i * d)), d }));
}
/** What a student shaded: { n (parts in all), d (parts a whole), f (the amount, exact) }. */
function shadedOf(st) {
  const bars = (Array.isArray(st.bars) ? st.bars : []).slice(0, M.OP_LIMITS.wholes).filter(b => b && int(b.d, 1, 12) !== null && int(b.n, 0, b.d) !== null);
  if (!bars.length) return { n: 0, d: 1, f: { n: 0, d: 1 } };
  const L = bars.reduce((m, b) => M.lcm(m, b.d), 1), n = bars.reduce((s, b) => s + (b.n * L) / b.d, 0);
  const d = bars.every(b => b.d === bars[0].d) ? bars[0].d : L;
  return { n: (n * d) / L, d, f: M.simplify(n, L) };
}
/** The student's answer bar against the equation's answer: right (any equal fraction: 6/8 for 3/4) with a one-line why,
 *  or a hint: nothing shaded; tops and bottoms added; pieces that can't make the answer; too much or too little. */
function eqCheck(st, x) {
  const ans = eqAnswer(x); if (!ans) return { ok: false, hint: null };
  const r = M.operate(x.op, x.a, x.b), me = shadedOf(st), a = `${me.n}/${me.d}`;
  if (!me.n) return { ok: false, hint: { k: 'empty' } };
  if (M.equivalent(me.f, ans)) return { ok: true, hint: eqWhy(x, r) };
  if (x.op === 'add' && sameFrac(me.f, { n: x.a.n + x.b.n, d: x.a.d + x.b.d })) return { ok: false, hint: { k: 'eqTops', a } };
  if (me.d % ans.d) {
    const L = x.op === 'add' || x.op === 'sub' || x.op === 'mul' ? r.L : ans.d;
    return { ok: false, hint: { k: x.op === 'add' || x.op === 'sub' ? 'eqSize' : 'eqParts', a, n: L <= 12 ? L : ans.d } };
  }
  return { ok: false, hint: { k: M.compare(me.f, ans) > 0 ? 'eqMore' : 'eqLess', a } };
}
/** Why the answer is right, in one line: the same-size pieces (add, subtract), tops and bottoms multiplied, how many fit. */
function eqWhy(x, r) {
  const fr = f => `${f.n}/${f.d}`, s = r.simple, simpler = s.n !== r.raw.n || s.d !== r.raw.d;
  const more = s.n > s.d && s.d > 1;   // 5/4 = 1 1/4
  const end = `${fr(r.raw)}${simpler ? ` = ${s.d === 1 ? s.n : fr(s)}` : ''}${more ? ` = ${M.mixedText(s)}` : ''}`;
  if (x.op === 'add' || x.op === 'sub') return { k: 'whySame', n: r.L, x: `${fr(r.a2)} ${EQ_SIGN[x.op]} ${fr(r.b2)} = ${end}` };
  if (x.op === 'mul') return { k: 'whyMul', x: `${fr(r.a)} × ${fr(r.b)} = ${end}` };
  return { k: 'whyDiv', a: opText(x.a), b: opText(x.b), n: M.mixedText(s) };
}
// The generators: kid-sized numbers, every answer one a bar can show. Each tries a few times for one that fits.
const eqTry = make => (rnd, b) => {
  const ops = EQ_OPS[(b && b.ops) || 'add'] || EQ_OPS.add;
  for (let i = 0; i < 60; i++) { const op = ops[pick(rnd, 0, ops.length - 1)], e = make(rnd, op); if (e && eqAnswer(e)) return e; }
  return { op: 'add', a: { n: 1, d: 2 }, b: { n: 1, d: 4 } };
};
const proper = (rnd, d) => ({ n: pick(rnd, 1, d - 1), d });
/** A fraction less than one whole in its simplest form (3/4, never 6/8). */
const simplest = (rnd, d) => { for (let i = 0; i < 20; i++) { const n = pick(rnd, 1, d - 1); if (M.gcd(n, d) === 1) return { n, d }; } return { n: 1, d }; };
/** Subtracting: the bigger one first (an answer below zero can't be shaded). */
const ordered = (op, a, b) => (op === 'sub' && M.compare(a, b) < 0 ? { op, a: b, b: a } : { op, a, b });
const EQ_MAKE = {
  // The same bottom number: 1/5 + 2/5, 7/8 − 3/8, 3/4 ÷ 1/4 (multiplying: unit fractions).
  eqSame(rnd, op) { const d = pick(rnd, 2, 12); return op === 'add' || op === 'sub' ? ordered(op, proper(rnd, d), proper(rnd, d)) : op === 'div' ? { op, a: proper(rnd, d), b: proper(rnd, d) } : EQ_MAKE.eqUnit(rnd, op); },
  // One bottom number a multiple of the other: 1/2 + 1/4, 2/3 − 1/6, 1/2 ÷ 1/4 (multiplying: unit fractions).
  eqMult(rnd, op) {
    const d1 = pick(rnd, 2, 6), d2 = d1 * pick(rnd, 2, Math.max(2, Math.floor(12 / d1)));
    const [p, q] = rnd() < 0.5 ? [simplest(rnd, d1), simplest(rnd, d2)] : [simplest(rnd, d2), simplest(rnd, d1)];
    return op === 'mul' ? EQ_MAKE.eqUnit(rnd, op) : ordered(op, p, q);
  },
  // Unit fractions multiplied: 1/2 × 1/3.
  eqUnit(rnd, op) { const p = pick(rnd, 2, 6); return { op, a: { n: 1, d: p }, b: { n: 1, d: pick(rnd, 2, Math.max(2, Math.floor(12 / p))) } }; },
  // A whole number times a fraction: 3 × 1/4, 2 × 2/5.
  eqWholeMul(rnd, op) { const w = { n: pick(rnd, 2, 4), d: 1 }, f = simplest(rnd, pick(rnd, 2, 8)); return rnd() < 0.5 ? { op, a: w, b: f } : { op, a: f, b: w }; },
  // A whole number divided by a unit fraction (1 ÷ 1/3: the answer stays three wholes or less) or a fraction divided by
  // a whole number (1/2 ÷ 3, 3/4 ÷ 3).
  eqWholeDiv(rnd, op) { return rnd() < 0.4 ? { op, a: { n: 1, d: 1 }, b: { n: 1, d: pick(rnd, 2, 3) } } : { op, a: simplest(rnd, pick(rnd, 2, 6)), b: { n: pick(rnd, 2, 4), d: 1 } }; },
  // Easier ones of every operation: the same bottom number to add or subtract, unit fractions to multiply, related
  // bottom numbers to divide.
  eqEasy(rnd, op) { return op === 'mul' ? EQ_MAKE.eqUnit(rnd, op) : op === 'div' ? EQ_MAKE.eqMult(rnd, op) : EQ_MAKE.eqSame(rnd, op); },
  // Any two fractions (less than a whole, or a little more) whose answer can be shaded.
  eqAny(rnd, op) { const f = () => { const d = pick(rnd, 2, 12), g = simplest(rnd, d); return rnd() < 0.8 || d > 6 ? g : { n: g.n + d, d }; }; return ordered(op, f(), f()); },
};
for (const [k, make] of Object.entries(EQ_MAKE)) BUILD.fractions.eqGens[k] = eqTry(make);

/** How many counters a ten-frame target has. */
function total(x) { return 'n' in x ? x.n : x.r + x.y; }
/** A number chart's first and last number. */
function chartRange(b = {}) { const start = b.start === 0 ? 0 : 1; return [start, start ? (b.upto === 120 ? 120 : 100) : 99]; }
/** A number line's ticks per whole (1 for whole numbers). */
function lineSub(b = {}) { return b.mode === 'whole' ? 1 : b.sub || 1; }
/** A coordinate plane's smallest and biggest number on each axis. */
function planeRange(b = {}) { const n = b.size || 5; return b.quads === 1 ? [0, 2 * n] : [-n, n]; }
/** Twice the biggest area on the board (a square of pegs − 1). */
function maxArea2(b = {}) { const n = (b.pegs || 7) - 1; return 2 * n * n; }
/** A shape with twice-area a2 on an n × n peg board: full rows, then part of a row (a half square as a slanted end). */
export function areaShape(a2, n = 7) {
  const W = n - 1, whole = Math.floor(a2 / 2), half = a2 % 2, r = Math.floor(whole / W), p = whole % W;
  let pts;
  if (!r) pts = half ? [[0, 0], [p + 1, 0], [p, 1], [0, 1]] : [[0, 0], [p, 0], [p, 1], [0, 1]];
  else if (!p && !half) pts = [[0, 0], [W, 0], [W, r], [0, r]];
  else pts = half ? [[0, 0], [W, 0], [W, r], [p + 1, r], [p, r + 1], [0, r + 1]] : [[0, 0], [W, 0], [W, r], [p, r], [p, r + 1], [0, r + 1]];
  const out = [];
  for (const [x, y] of pts) if (!out.length || out[out.length - 1].x !== x || out[out.length - 1].y !== y) out.push({ x, y });
  if (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out;
}

// ---------------------------------------------------------------- sets of targets
const key = x => JSON.stringify(x);
/** Split what the teacher typed into pieces: commas followed by a space, semicolons and new lines always; a comma
 *  with no space or a single space only where the piece doesn't read as one target ("1,205" stays one number). */
function pieces(tool, text, base, intl) {
  const b = BUILD[tool];
  if (b.split) return b.split(text);
  const out = [];
  for (const chunk of String(text ?? '').split(/[;\n]+|,\s+|\s{2,}|\t+/)) {
    const c = chunk.trim(); if (!c) continue;
    if (b.parse(c, base, intl) !== null) { out.push(c); continue; }
    const grouped = /^\d{1,3}([,.]\d{3})+([.,]\d+)?$/.test(c);   // "1,205": one number (too big, or not), never 1 and 205
    const parts = grouped ? [c] : c.split(/,|\s+/).map(x => x.trim()).filter(Boolean);
    // "1,205" or "1 1/2" read as one target; otherwise each piece is a target of its own (or left out on its own).
    out.push(...(parts.length > 1 && parts.some(x => b.parse(x, base, intl) !== null) ? parts : [c]));
  }
  return out;
}
/** What the teacher typed -> { targets (at most MAX_TARGETS, no repeats), bad (the pieces that are not targets for this
 *  tool, as typed), over (true when more were typed than fit) }. */
export function parseTargets(tool, text, base = {}, intl = 'en') {
  const b = BUILD[tool]; if (!b) return { targets: [], bad: [], over: false };
  const targets = [], bad = [], seen = new Set();
  let over = false;
  for (const p of pieces(tool, text, base, intl)) {
    const x = b.parse(p, base, intl);
    if (x === null) { bad.push([...p].slice(0, 20).join('')); continue; }
    if (seen.has(key(x))) continue;
    if (targets.length >= MAX_TARGETS) { over = true; continue; }
    seen.add(key(x)); targets.push(x);
  }
  return { targets, bad, over };
}
/** The generators a tool offers for this starting state (the decimal ones only with the decimal columns). */
export function gensFor(tool, base = {}) {
  const b = BUILD[tool]; if (!b) return [];
  if (b.eqGens && base.task === 'eq') return EQ_GEN_LIST[base.ops] || EQ_GEN_LIST.add;
  return Object.keys(b.gens).filter(g => !(b.decGens || []).includes(g) || base.dec !== false);
}
/** n targets from a generator, different from each other where the generator has that many. */
export function makeTargets(tool, gen, n = DEFAULT_COUNT, base = {}, rnd = Math.random) {
  const b = BUILD[tool], g = b && (b.eqGens && base.task === 'eq' ? b.eqGens : b.gens)[gen]; if (!g) return [];
  const want = Math.max(1, Math.min(MAX_TARGETS, n)), out = [], seen = new Set();
  for (let tries = 0; out.length < want && tries < want * 40; tries++) {
    const x = b.clean(g(rnd, base), base); if (x === null) continue;
    if (seen.has(key(x))) continue;
    seen.add(key(x)); out.push(x);
  }
  return out;
}
/** Targets as a browser sent them -> the ones this tool can build (cleaned), at most MAX_TARGETS, no repeats. */
export function cleanTargets(tool, list, base = {}) {
  const b = BUILD[tool]; if (!b || !Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const x of list.slice(0, MAX_TARGETS * 2)) {
    const y = b.clean(x, base); if (y === null || seen.has(key(y))) continue;
    seen.add(key(y)); out.push(y);
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}
export const targetText = (tool, x, base = {}, intl = 'en') => BUILD[tool].text(x, base, intl);
export const startState = (tool, base = {}, x) => clone(BUILD[tool].start(clone(base), x));
export const checkBuild = (tool, st, x, base = {}, intl = 'en') => BUILD[tool].check(st || {}, x, base, intl);
export const solveState = (tool, base = {}, x) => (BUILD[tool].solve ? clone(BUILD[tool].solve(clone(base), x)) : null);
/** The teacher's tool state, as the base a set is built from: the coins' "auto" currency is the teacher's own. */
export function baseFor(tool, st = {}, intl = 'en') {
  const b = clone(st || {});
  delete b.qh;
  if (tool === 'coins' && (!b.cur || b.cur === 'auto')) b.cur = M4.currencyFor(intl);
  return b;
}
