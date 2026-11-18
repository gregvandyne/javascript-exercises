/*! Oomba Canvas 1.0.0 | (c) Oomba Academy | the classroom activity kit: docs/canvas-api.md */
(function () {
'use strict';
// ---- logic.js
// Oomba Canvas: the manipulatives' maths. Pure: no DOM, no network, no storage, no clock. The same code runs in the game
// (the student's Check) and on the server (scripts/build-canvas.js bundles it into the versioned kit file, and
// server/services/canvaskit.js runs that frozen file's selfTest before a Builder version is saved).
//
// The contract of each tool (the Classroom dashboard's "Build it" contract, public/js/dash-build.js, copied in here and
// frozen with the kit version, never imported from the site):
//   clean(p)      a problem as data (from the Builder) -> the problem, or null with clean.why (not something it can be)
//   start(p)      the state the student starts from (nothing made yet)
//   check(p, st)  -> { ok, hint } (hint: { k, v } for the words table, or null)
//   solve(p)      the state that shows the worked answer, or null (it cannot be made: the self-test names it)
//   steps(p)      the worked steps: [{ k, v, ans? }] (ans: a whole number the student types in a step box)
//   hints(p)      up to three hints: [{ k, v }]
//   task(p)       the problem's line: { k, v }; ask(p) the bottom band's question: { k, v }
//   gen(rnd, o)   a new problem from a generator's options (o: the GEN block)
//   key(p)        a short id, so a fresh set never deals the same problem twice
// A value that is a fraction is [n, d] in a v: the game draws it stacked, and reads it as "n/d".

const MAX_PROBLEMS = 30;
const MAX_COUNT = 12;
const SUPPORTS = ['watch', 'count', 'guided', 'own'];

/** A small seeded random source (the same xorshift as the dashboard's seeded()): a fresh set per student. */
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const between = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const lcm = (a, b) => (a / gcd(a, b)) * b;
/** A number or [n, d] -> { n, d } (d > 0), or null. */
function ratOf(v) {
  if (Number.isInteger(v)) return { n: v, d: 1 };
  if (typeof v === 'number' && Number.isFinite(v)) { for (const d of [2, 4, 5, 8, 10, 100]) { const n = Math.round(v * d); if (Math.abs(n / d - v) < 1e-9) return { n, d }; } return null; }
  if (Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[1] > 0 && Math.abs(v[0]) <= 10000 && v[1] <= 100) return { n: v[0], d: v[1] };
  return null;
}
const ratV = r => (r.d === 1 ? r.n : [r.n, r.d]);
const ratCmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
const fail = (why, fn) => { fn.why = why; return null; };
const fracList = (v, lo, hi) => Array.isArray(v) && v.length >= 1 && v.length <= 8 && v.every(x => isInt(x, lo, hi)) ? v.slice() : null;
const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'tenThousands'];
const digitsOf = n => String(Math.abs(n)).split('').reverse().map(Number);
const PRESS = { k: 'pressCheck', v: {} };

// ---------------------------------------------------------------- fractions
/** Make n/d out of 1/D pieces (equivalent fractions). p: { from: [n, d], to: D, tray?: [other piece sizes] } */
const equiv = {
  clean(p) {
    const f = Array.isArray(p.from) ? p.from : null;
    if (!f || !isInt(f[0], 1, 24) || !isInt(f[1], 2, 12) || f[0] > f[1]) return fail('"from" must be a fraction [n, d] with d from 2 to 12 and n from 1 to d', equiv.clean);
    if (!isInt(p.to, 2, 24) || p.to === f[1]) return fail('"to" must be a different piece size from 2 to 24', equiv.clean);
    const tray = p.tray === undefined ? null : fracList(p.tray, 2, 24);
    if (p.tray !== undefined && !tray) return fail('"tray" must list up to 8 piece sizes from 2 to 24', equiv.clean);
    return { tool: 'fractions.equiv', from: [f[0], f[1]], to: p.to, ...(tray ? { tray } : {}) };
  },
  start: () => ({ pieces: [] }),
  need: p => (p.from[0] * p.to) / p.from[1],
  check(p, st) {
    const pcs = Array.isArray(st && st.pieces) ? st.pieces : [];
    if (!pcs.length) return { ok: false, hint: { k: 'fbEmpty', v: {} } };
    if (pcs.some(x => x !== p.to)) return { ok: false, hint: { k: 'fbNotThese', v: { u: [1, p.to] } } };
    const need = equiv.need(p);
    if (pcs.length === need) return { ok: true, hint: null };
    return { ok: false, hint: { k: pcs.length < need ? 'fbMore' : 'fbLess', v: {} } };
  },
  solve(p) { const need = equiv.need(p); return Number.isInteger(need) ? { pieces: Array(need).fill(p.to) } : fail(`${p.from[0]}/${p.from[1]} cannot be made with pieces of 1/${p.to}`, equiv.solve); },
  steps(p) {
    const [n, d] = p.from, k = p.to / d, m = n * k, u = [1, p.to];
    if (!Number.isInteger(k)) return [{ k: 'eqDrag', v: { m: '?', u } }, PRESS];
    return [{ k: 'eqOne', v: { u, f: [1, d] }, ans: k }, { k: 'eqMany', v: { a: [n, d], u }, ans: m }, { k: 'eqDrag', v: { m, u } }, PRESS];
  },
  hints(p) { const [n, d] = p.from, k = p.to / d, u = [1, p.to]; return [{ k: 'eqH1', v: { f: [1, d], k, u } }, { k: 'eqH2', v: { n, k, m: n * k } }, { k: 'eqH3', v: { m: n * k, u } }]; },
  task: p => ({ k: 'eqTask', v: { a: p.from, u: [1, p.to] } }),
  ask: p => ({ k: 'eqQ', v: { a: p.from } }),
  gen(rnd, o) {
    const dens = fracList(o.dens, 2, 12) || [2, 3, 4], mult = fracList(o.mult, 2, 4) || [2, 3];
    const d = pick(rnd, dens), n = between(rnd, 1, d - 1);
    return { tool: 'fractions.equiv', from: [n, d], to: d * pick(rnd, mult) };
  },
  key: p => `${p.from[0]}/${p.from[1]}>${p.to}`,
};
/** Shade n/d of a bar cut into d equal parts. p: { n, d } */
const shade = {
  clean(p) {
    if (!isInt(p.d, 2, 12) || !isInt(p.n, 1, 12) || p.n > p.d) return fail('"d" must be 2 to 12 and "n" 1 to d', shade.clean);
    return { tool: 'fractions.shade', n: p.n, d: p.d };
  },
  start: () => ({ on: [] }),
  check(p, st) {
    const on = Array.isArray(st && st.on) ? new Set(st.on.filter(i => isInt(i, 0, p.d - 1))) : new Set();
    if (!on.size) return { ok: false, hint: { k: 'fbEmpty', v: {} } };
    if (on.size === p.n) return { ok: true, hint: null };
    return { ok: false, hint: { k: on.size < p.n ? 'fbMore' : 'fbLess', v: {} } };
  },
  solve: p => ({ on: Array.from({ length: p.n }, (_, i) => i) }),
  steps: p => [{ k: 'shCut', v: { d: p.d }, ans: p.d }, { k: 'shCount', v: { a: [p.n, p.d] }, ans: p.n }, { k: 'shTap', v: { n: p.n } }, PRESS],
  hints: p => [{ k: 'shH1', v: { d: p.d } }, { k: 'shH2', v: { a: [p.n, p.d], n: p.n } }, { k: 'shH3', v: { n: p.n } }],
  task: p => ({ k: 'shTask', v: { a: [p.n, p.d] } }),
  ask: p => ({ k: 'shQ', v: { a: [p.n, p.d] } }),
  gen(rnd, o) { const d = pick(rnd, fracList(o.dens, 2, 12) || [3, 4, 5, 6, 8]); return { tool: 'fractions.shade', n: between(rnd, 1, d - 1), d }; },
  key: p => `${p.n}/${p.d}`,
};
/** Compare two fractions: <, = or >. p: { a: [n, d], b: [n, d] } */
const SIGNS = ['<', '=', '>'];
const compare = {
  clean(p) {
    const ok = f => Array.isArray(f) && isInt(f[1], 1, 12) && isInt(f[0], 0, 24);
    if (!ok(p.a) || !ok(p.b)) return fail('"a" and "b" must be fractions [n, d] with d from 1 to 12', compare.clean);
    return { tool: 'fractions.compare', a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]] };
  },
  start: () => ({ pick: null }),
  sign: p => SIGNS[ratCmp({ n: p.a[0], d: p.a[1] }, { n: p.b[0], d: p.b[1] }) + 1],
  check(p, st) {
    const s = st && st.pick;
    if (!SIGNS.includes(s)) return { ok: false, hint: { k: 'fbPick', v: {} } };
    return s === compare.sign(p) ? { ok: true, hint: null } : { ok: false, hint: { k: 'fbSign', v: {} } };
  },
  solve: p => ({ pick: compare.sign(p) }),
  steps(p) { const L = lcm(p.a[1], p.b[1]), u = [1, L]; return [{ k: 'cmpA', v: { a: p.a, u }, ans: (p.a[0] * L) / p.a[1] }, { k: 'cmpB', v: { b: p.b, u }, ans: (p.b[0] * L) / p.b[1] }, { k: 'cmpPick', v: {} }, PRESS]; },
  hints(p) { const L = lcm(p.a[1], p.b[1]); return [{ k: 'cmpH1', v: {} }, { k: 'cmpH2', v: { u: [1, L] } }, { k: 'cmpH3', v: { a: p.a, b: p.b, x: (p.a[0] * L) / p.a[1], y: (p.b[0] * L) / p.b[1] } }]; },
  task: p => ({ k: 'cmpTask', v: { a: p.a, b: p.b } }),
  ask: () => ({ k: 'cmpQ', v: {} }),
  gen(rnd, o) {
    const dens = fracList(o.dens, 2, 12) || [2, 3, 4, 6, 8];
    const f = () => { const d = pick(rnd, dens); return [between(rnd, 1, d - 1), d]; };
    let a = f(), b = f(); for (let i = 0; i < 6 && a[1] === b[1] && a[0] === b[0]; i++) b = f();
    return { tool: 'fractions.compare', a, b };
  },
  key: p => `${p.a.join('/')}?${p.b.join('/')}`,
};

// ---------------------------------------------------------------- the number line
// lo..hi wholes, each cut into sub parts; the student taps a tick. A value is a whole number or [n, d].
// point: { at, lo, hi, sub }   jump: { from, by, lo, hi, sub } (land on from + by)
const lineClean = (p, tool, which) => {
  const lo = Number.isInteger(p.lo) ? p.lo : 0, hi = Number.isInteger(p.hi) ? p.hi : lo + 1, sub = Number.isInteger(p.sub) ? p.sub : 1;
  if (lo < -20 || hi > 100 || hi <= lo || hi - lo > 20 || sub < 1 || sub > 12 || (hi - lo) * sub > 60) return fail('"lo" and "hi" must be whole numbers (hi - lo from 1 to 20), "sub" 1 to 12, and at most 60 ticks', which);
  const out = { tool, lo, hi, sub };
  for (const k of tool === 'numberline.point' ? ['at'] : ['from', 'by']) { const r = ratOf(p[k]); if (!r) return fail(`"${k}" must be a whole number or a fraction [n, d]`, which); out[k] = ratV(r); }
  return out;
};
const lineTarget = p => { const r = p.tool === 'numberline.point' ? ratOf(p.at) : (() => { const a = ratOf(p.from), b = ratOf(p.by); return { n: a.n * b.d + b.n * a.d, d: a.d * b.d }; })(); return (r.n * p.sub) / r.d; };
const lineBase = which => ({
  start: () => ({ tick: null }),
  check(p, st) {
    const t = st && st.tick, want = lineTarget(p);
    if (!Number.isInteger(t)) return { ok: false, hint: { k: 'fbTap', v: {} } };
    if (t === want) return { ok: true, hint: null };
    return { ok: false, hint: { k: t < want ? 'fbRight' : 'fbLeft', v: {} } };
  },
  solve(p) {
    const t = lineTarget(p);
    if (!Number.isInteger(t)) return fail(`the answer is not on a tick: each whole has ${p.sub} part${p.sub > 1 ? 's' : ''}`, which.solve);
    if (t < p.lo * p.sub || t > p.hi * p.sub) return fail(`the answer is off the line (it runs from ${p.lo} to ${p.hi})`, which.solve);
    return { tick: t };
  },
  key: p => `${p.tool}:${JSON.stringify([p.at, p.from, p.by, p.lo, p.hi, p.sub])}`,
});
const point = {
  ...lineBase(null),
  clean: p => lineClean(p, 'numberline.point', point.clean),
  steps(p) { const t = lineTarget(p) - p.lo * p.sub; return [{ k: 'nlParts', v: {}, ans: p.sub }, { k: 'nlCount', v: { a: p.at, lo: p.lo }, ans: Number.isInteger(t) ? t : 0 }, { k: 'nlTap', v: {} }, PRESS]; },
  hints(p) { const t = lineTarget(p) - p.lo * p.sub; return [{ k: 'nlH1', v: { sub: p.sub } }, { k: 'nlH2', v: { a: p.at, t, lo: p.lo } }, { k: 'nlH3', v: { t, lo: p.lo } }]; },
  task: p => ({ k: 'nlTask', v: { a: p.at } }),
  ask: () => ({ k: 'nlQ', v: {} }),
  gen(rnd, o) {
    const sub = pick(rnd, fracList(o.subs, 1, 12) || [2, 3, 4, 5, 8, 10]), lo = Number.isInteger(o.lo) ? o.lo : 0, hi = Number.isInteger(o.hi) && o.hi > lo ? Math.min(o.hi, lo + 5) : lo + 1;
    const t = between(rnd, lo * sub + 1, hi * sub - 1), g = gcd(t, sub);
    return { tool: 'numberline.point', at: sub / g === 1 ? t / g : [t / g, sub / g], lo, hi, sub };
  },
};
Object.assign(point, { solve: lineBase(point).solve });
const jump = {
  ...lineBase(null),
  clean: p => lineClean(p, 'numberline.jump', jump.clean),
  steps(p) { const b = ratOf(p.by), t = (b.n * p.sub) / b.d; return [{ k: 'nlFrom', v: { a: p.from } }, { k: 'nlJumpTicks', v: { b: p.by }, ans: Number.isInteger(t) ? t : 0 }, { k: 'nlTap', v: {} }, PRESS]; },
  hints(p) { const b = ratOf(p.by), t = (b.n * p.sub) / b.d; return [{ k: 'nlH1', v: { sub: p.sub } }, { k: 'nlJH2', v: { b: p.by, t } }, { k: 'nlJH3', v: { a: p.from, t } }]; },
  task: p => ({ k: 'nlJump', v: { a: p.from, b: p.by } }),
  ask: () => ({ k: 'nlQ', v: {} }),
  gen(rnd, o) {
    const sub = pick(rnd, fracList(o.subs, 1, 12) || [1, 2, 4]), lo = Number.isInteger(o.lo) ? o.lo : 0, hi = Number.isInteger(o.hi) && o.hi > lo ? Math.min(o.hi, lo + 12) : lo + 10;
    const f = between(rnd, lo * sub, hi * sub - 1), by = between(rnd, 1, Math.max(1, hi * sub - f));
    const v = t => { const g = gcd(t, sub); return sub / g === 1 ? t / g : [t / g, sub / g]; };
    return { tool: 'numberline.jump', from: v(f), by: v(by), lo, hi, sub };
  },
};
Object.assign(jump, { solve: lineBase(jump).solve });

// ---------------------------------------------------------------- digit boxes (column add, subtract, multiply)
// p: { a, b }. The student fills the answer's digits in graph-paper boxes, ones on the right. st.ans: digits by column
// from the ones (null for an empty box). Leading empty boxes are fine; a wrong or missing digit is not.
const OPS = { 'digits.add': (a, b) => a + b, 'digits.sub': (a, b) => a - b, 'digits.mul': (a, b) => a * b };
const colTool = tool => {
  const op = OPS[tool];
  const t = {
    clean(p) {
      if (!isInt(p.a, 0, 99999) || !isInt(p.b, 0, 99999)) return fail('"a" and "b" must be whole numbers from 0 to 99999', t.clean);
      if (tool === 'digits.sub' && p.b > p.a) return fail('"a" must be at least "b" (no negative answers)', t.clean);
      if (tool === 'digits.mul' && (p.a > 9999 || !isInt(p.b, 1, 9))) return fail('"a" must be up to 9999 and "b" a single digit from 1 to 9', t.clean);
      return { tool, a: p.a, b: p.b };
    },
    result: p => op(p.a, p.b),
    cols: p => Math.max(digitsOf(op(p.a, p.b)).length, digitsOf(p.a).length, digitsOf(p.b).length + (tool === 'digits.mul' ? 1 : 0)),
    start: p => ({ ans: Array(t.cols(p)).fill(null) }),
    check(p, st) {
      const ans = Array.isArray(st && st.ans) ? st.ans : [], want = digitsOf(op(p.a, p.b));
      if (!ans.some(x => isInt(x, 0, 9))) return { ok: false, hint: { k: 'fbEmpty', v: {} } };
      for (let i = 0; i < Math.max(ans.length, want.length); i++) {
        const got = ans[i], w = want[i];
        if (w === undefined) { if (isInt(got, 1, 9)) return { ok: false, hint: { k: 'fbCol', v: { place: PLACE[i] || 'ones' } } }; continue; }
        if (got !== w) return { ok: false, hint: { k: got === null || got === undefined ? 'fbFill' : 'fbCol', v: { place: PLACE[i] || 'ones' } } };
      }
      return { ok: true, hint: null };
    },
    solve(p) { const want = digitsOf(op(p.a, p.b)), ans = Array(t.cols(p)).fill(null); want.forEach((d, i) => { ans[i] = d; }); return { ans }; },
    steps(p) {
      const A = digitsOf(p.a), B = digitsOf(p.b), out = [];
      if (tool === 'digits.add') {
        let c = 0;
        for (let i = 0; i < Math.max(A.length, B.length) && out.length < 4; i++) { const x = A[i] || 0, y = B[i] || 0, s = x + y + c; out.push({ k: c ? 'colAddC' : 'colAdd', v: { place: PLACE[i], x, y, c }, ans: s }); c = s >= 10 ? 1 : 0; }
      } else if (tool === 'digits.sub') {
        let borrow = 0;
        for (let i = 0; i < A.length && out.length < 4; i++) { let x = A[i] - borrow; const y = B[i] || 0; borrow = 0; if (x < y) { out.push({ k: 'colBorrow', v: { place: PLACE[i], x, y } }); x += 10; borrow = 1; } out.push({ k: 'colSub', v: { place: PLACE[i], x, y }, ans: x - y }); }
      } else {
        let c = 0;
        for (let i = 0; i < A.length && out.length < 4; i++) { const x = A[i], s = x * p.b + c; out.push({ k: c ? 'colMulC' : 'colMul', v: { place: PLACE[i], x, y: p.b, c }, ans: s }); c = Math.floor(s / 10); }
      }
      return [...out.slice(0, 4), { k: 'colWrite', v: {} }, PRESS];
    },
    hints: p => [{ k: 'colH1', v: {} }, { k: tool === 'digits.add' ? 'colH2add' : tool === 'digits.sub' ? 'colH2sub' : 'colH2mul', v: {} }, { k: 'colH3', v: { d: digitsOf(op(p.a, p.b))[0] } }],
    task: p => ({ k: tool === 'digits.add' ? 'addTask' : tool === 'digits.sub' ? 'subTask' : 'mulTask', v: { a: p.a, b: p.b } }),
    ask: () => ({ k: 'digQ', v: {} }),
    gen(rnd, o) {
      const size = isInt(o.digits, 1, 4) ? o.digits : 2, lo = 10 ** (size - 1), hi = 10 ** size - 1;
      if (tool === 'digits.mul') return { tool, a: between(rnd, Math.max(2, lo), hi), b: between(rnd, 2, 9) };
      let a = between(rnd, lo, hi), b = between(rnd, lo, hi);
      if (tool === 'digits.sub' && b > a) [a, b] = [b, a];
      return { tool, a, b };
    },
    key: p => `${tool}:${p.a}:${p.b}`,
  };
  return t;
};

// ---------------------------------------------------------------- tiles (sort into groups, put in order)
// sort: { items: [values], rule: 'evenodd' | 'less' | 'mult' | 'half', n? } (the kit knows the groups) or
//       { items: [{ t, bin }], bins: [labels] } (the Builder's own groups: bin is the index of the right group)
// order: { items: [values], dir: 'up' | 'down' } (values: whole numbers or [n, d])
const RULES = {
  evenodd: { bins: () => [{ k: 'binEven', v: {} }, { k: 'binOdd', v: {} }], of: v => (Number.isInteger(v) ? (Math.abs(v) % 2 ? 1 : 0) : null) },
  less: { bins: n => [{ k: 'binLess', v: { n } }, { k: 'binAtLeast', v: { n } }], of: (v, n) => { const r = ratOf(v); return r ? (ratCmp(r, { n, d: 1 }) < 0 ? 0 : 1) : null; } },
  mult: { bins: n => [{ k: 'binMult', v: { n } }, { k: 'binNotMult', v: { n } }], of: (v, n) => (Number.isInteger(v) ? (v % n === 0 ? 0 : 1) : null) },
  half: { bins: () => [{ k: 'binLess', v: { n: [1, 2] } }, { k: 'binAtLeast', v: { n: [1, 2] } }], of: v => { const r = ratOf(v); return r ? (ratCmp(r, { n: 1, d: 2 }) < 0 ? 0 : 1) : null; } },
};
const label = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 40) : '');
const sort = {
  clean(p) {
    const items = Array.isArray(p.items) ? p.items : null;
    if (!items || items.length < 2 || items.length > 12) return fail('"items" must list 2 to 12 tiles', sort.clean);
    if (p.rule !== undefined) {
      const R = RULES[p.rule]; if (!R) return fail(`"rule" must be one of ${Object.keys(RULES).join(', ')}`, sort.clean);
      const n = p.rule === 'less' || p.rule === 'mult' ? p.n : undefined;
      if ((p.rule === 'less' && !isInt(n, -100, 10000)) || (p.rule === 'mult' && !isInt(n, 2, 12))) return fail(`rule "${p.rule}" needs a whole number "n"`, sort.clean);
      const vals = items.map(v => (ratOf(v) ? (Array.isArray(v) ? [v[0], v[1]] : v) : null));
      if (vals.some(v => v === null || R.of(v, n) === null)) return fail(`every tile must be a ${p.rule === 'evenodd' || p.rule === 'mult' ? 'whole number' : 'number or a fraction [n, d]'} for rule "${p.rule}"`, sort.clean);
      return { tool: 'tiles.sort', rule: p.rule, ...(n !== undefined ? { n } : {}), items: vals };
    }
    const bins = Array.isArray(p.bins) ? p.bins.map(label) : [];
    if (bins.length < 2 || bins.length > 4 || bins.some(b => !b)) return fail('"bins" must name 2 to 4 groups (or give a "rule")', sort.clean);
    const out = items.map(x => (x && typeof x === 'object' && !Array.isArray(x) && label(String(x.t ?? '')) && isInt(x.bin, 0, bins.length - 1) ? { t: label(String(x.t)), bin: x.bin } : null));
    if (out.some(x => !x)) return fail('each tile must be { t: its text, bin: the index of its group }', sort.clean);
    return { tool: 'tiles.sort', bins, items: out };
  },
  binOf: (p, i) => (p.rule ? RULES[p.rule].of(p.items[i], p.n) : p.items[i].bin),
  bins: p => (p.rule ? RULES[p.rule].bins(p.n) : p.bins.map(t => ({ text: t }))),
  start: p => ({ at: p.items.map(() => null) }),
  check(p, st) {
    const at = Array.isArray(st && st.at) ? st.at : [];
    if (!at.some(x => x !== null && x !== undefined)) return { ok: false, hint: { k: 'fbEmpty', v: {} } };
    if (p.items.some((_, i) => at[i] === null || at[i] === undefined)) return { ok: false, hint: { k: 'fbSortAll', v: {} } };
    const wrong = p.items.filter((_, i) => at[i] !== sort.binOf(p, i)).length;
    return wrong ? { ok: false, hint: { k: 'fbSortWrong', v: { n: wrong } } } : { ok: true, hint: null };
  },
  solve: p => ({ at: p.items.map((_, i) => sort.binOf(p, i)) }),
  steps: () => [{ k: 'sortRead', v: {} }, { k: 'sortEach', v: {} }, PRESS],
  hints: p => [{ k: 'sortH1', v: {} }, { k: 'sortH2', v: {} }, { k: 'sortH3', v: { t: p.rule ? p.items[0] : p.items[0].t, g: sort.bins(p)[sort.binOf(p, 0)] } }],
  task: () => ({ k: 'sortTask', v: {} }),
  ask: () => ({ k: 'sortQ', v: {} }),
  gen(rnd, o) {
    const rule = RULES[o.rule] ? o.rule : 'evenodd', lo = isInt(o.lo, 0, 9999) ? o.lo : 1, hi = isInt(o.hi, lo + 6, 10000) ? o.hi : lo + 99;
    const n = rule === 'mult' ? (isInt(o.n, 2, 12) ? o.n : 5) : rule === 'less' ? (isInt(o.n, lo + 1, hi) ? o.n : Math.round((lo + hi) / 2)) : undefined;
    const count = isInt(o.tiles, 4, 10) ? o.tiles : 6, seen = new Set(), items = [];
    if (rule === 'half') { const dens = fracList(o.dens, 2, 12) || [3, 4, 5, 6, 8]; for (let i = 0; i < 40 && items.length < count; i++) { const d = pick(rnd, dens), f = [between(rnd, 1, d - 1), d], k = f.join('/'); if (!seen.has(k)) { seen.add(k); items.push(f); } } }
    else for (let i = 0; i < 80 && items.length < count; i++) { const v = between(rnd, lo, hi); if (!seen.has(v)) { seen.add(v); items.push(v); } }
    return { tool: 'tiles.sort', rule, ...(n !== undefined ? { n } : {}), items };
  },
  key: p => `sort:${JSON.stringify(p.items)}`,
};
const order = {
  clean(p) {
    const items = Array.isArray(p.items) ? p.items : null;
    if (!items || items.length < 3 || items.length > 8 || items.some(v => !ratOf(v))) return fail('"items" must list 3 to 8 whole numbers or fractions [n, d]', order.clean);
    const vals = items.map(v => (Array.isArray(v) ? [v[0], v[1]] : v));
    const rs = vals.map(ratOf);
    if (rs.some((r, i) => rs.some((s, j) => j > i && ratCmp(r, s) === 0))) return fail('two tiles have the same value, so the order is not clear', order.clean);
    return { tool: 'tiles.order', items: vals, dir: p.dir === 'down' ? 'down' : 'up' };
  },
  sorted: p => p.items.map((v, i) => ({ r: ratOf(v), i })).sort((a, b) => ratCmp(a.r, b.r) * (p.dir === 'down' ? -1 : 1)).map(x => x.i),
  start: p => ({ slots: p.items.map(() => null) }),
  check(p, st) {
    const s = Array.isArray(st && st.slots) ? st.slots : [];
    if (!s.some(x => x !== null && x !== undefined)) return { ok: false, hint: { k: 'fbEmpty', v: {} } };
    if (p.items.some((_, i) => !isInt(s[i], 0, p.items.length - 1)) || new Set(s).size !== p.items.length) return { ok: false, hint: { k: 'fbOrderAll', v: {} } };
    const want = order.sorted(p);
    return want.every((w, i) => w === s[i]) ? { ok: true, hint: null } : { ok: false, hint: { k: 'fbOrderWrong', v: {} } };
  },
  solve: p => ({ slots: order.sorted(p) }),
  steps: p => [{ k: p.dir === 'down' ? 'orderBig' : 'orderSmall', v: {} }, { k: 'orderNext', v: {} }, PRESS],
  hints: p => [{ k: p.dir === 'down' ? 'orderBig' : 'orderSmall', v: {} }, { k: 'orderH2', v: {} }, { k: 'orderH3', v: { t: p.items[order.sorted(p)[0]] } }],
  task: p => ({ k: p.dir === 'down' ? 'orderDown' : 'orderUp', v: {} }),
  ask: () => ({ k: 'orderQ', v: {} }),
  gen(rnd, o) {
    const count = isInt(o.tiles, 3, 8) ? o.tiles : 5, seen = new Set(), items = [];
    if (o.fractions) { const dens = fracList(o.dens, 2, 12) || [2, 3, 4, 6, 8]; for (let i = 0; i < 60 && items.length < count; i++) { const d = pick(rnd, dens), f = [between(rnd, 1, d - 1), d], r = ratOf(f), k = r.n / gcd(r.n, r.d) + '/' + r.d / gcd(r.n, r.d); if (!seen.has(k)) { seen.add(k); items.push(f); } } }
    else { const lo = isInt(o.lo, 0, 99999) ? o.lo : 1, hi = isInt(o.hi, lo + 10, 100000) ? o.hi : lo + 999; for (let i = 0; i < 80 && items.length < count; i++) { const v = between(rnd, lo, hi); if (!seen.has(v)) { seen.add(v); items.push(v); } } }
    return { tool: 'tiles.order', items, dir: o.dir === 'down' ? 'down' : 'up' };
  },
  key: p => `order:${p.dir}:${JSON.stringify(p.items)}`,
};

/** Every tool, by id. The four manipulatives: fractions, numberline, digits, tiles. */
const TOOLS = {
  'fractions.equiv': equiv, 'fractions.shade': shade, 'fractions.compare': compare,
  'numberline.point': point, 'numberline.jump': jump,
  'digits.add': colTool('digits.add'), 'digits.sub': colTool('digits.sub'), 'digits.mul': colTool('digits.mul'),
  'tiles.sort': sort, 'tiles.order': order,
};
const TOOL_IDS = Object.keys(TOOLS);
const manipulativeOf = id => String(id || '').split('.')[0];

/** A problem as data -> { p } (the cleaned problem) or { why }. */
function cleanProblem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { why: 'a problem must be an object with a "tool"' };
  const T = TOOLS[raw.tool]; if (!T) return { why: `unknown tool "${String(raw.tool).slice(0, 30)}" (tools: ${TOOL_IDS.join(', ')})` };
  T.clean.why = '';
  const p = T.clean(raw);
  return p ? { p } : { why: T.clean.why || 'not a problem this tool can make' };
}
/** Deal a set: the fixed problems, or count new ones from the generator (fresh: never one from seen). */
function deal(activity, { seed = 1, seen = [] } = {}) {
  const a = activity || {}, cfg = a.config || {};
  const count = isInt(cfg.count, 1, MAX_COUNT) ? cfg.count : 5;
  const gen = a.gen && TOOLS[a.gen.tool] ? a.gen : null;
  if (gen && (cfg.fresh !== false || !Array.isArray(a.problems) || !a.problems.length)) {
    const rnd = seeded(seed), T = TOOLS[gen.tool], keys = new Set(seen), out = [];
    for (let i = 0; i < count * 12 && out.length < count; i++) {
      const c = cleanProblem(T.gen(rnd, gen)); if (!c.p) continue;
      const k = T.key(c.p); if (keys.has(k)) continue;
      keys.add(k); out.push(c.p);
    }
    // a small generator may run out of new ones: then repeats are allowed
    for (let i = 0; out.length < count && i < count * 4; i++) { const c = cleanProblem(T.gen(rnd, gen)); if (c.p) out.push(c.p); }
    return out;
  }
  return (Array.isArray(a.problems) ? a.problems : []).slice(0, MAX_PROBLEMS).map(x => cleanProblem(x).p).filter(Boolean);
}

/**
 * The self-test (the Builder's check before a version is saved, and Oc.selfTest() in the game): every problem (or 30 a
 * generator makes) must be solvable by its worked answer, the empty start must never count as right, and the steps and
 * hints must be there. -> { ok, problems: [{ at: 'problem 3' | 'generator', why }] } (English, for the Builder's model).
 */
function selfTest(activity, words = null) {
  const out = [], a = activity && typeof activity === 'object' ? activity : {};
  const add = (at, why) => { if (out.length < 12) out.push({ at, why }); };
  const cfg = a.config && typeof a.config === 'object' ? a.config : {};
  if (cfg.support !== undefined && !SUPPORTS.includes(cfg.support)) add('config', `support must be one of ${SUPPORTS.join(', ')}`);
  if (cfg.count !== undefined && !isInt(cfg.count, 1, MAX_COUNT)) add('config', `count must be a whole number from 1 to ${MAX_COUNT}`);
  const fixed = Array.isArray(a.problems) ? a.problems : [];
  if (a.problems !== undefined && !Array.isArray(a.problems)) add('problems', 'problems must be a list');
  if (fixed.length > MAX_PROBLEMS) add('problems', `at most ${MAX_PROBLEMS} problems`);
  const gen = a.gen && typeof a.gen === 'object' ? a.gen : null;
  if (a.gen && (!gen || !TOOLS[gen.tool])) add('generator', `unknown generator tool "${String(gen && gen.tool).slice(0, 30)}" (tools: ${TOOL_IDS.join(', ')})`);
  if (!fixed.length && !(gen && TOOLS[gen.tool])) add('problems', 'there are no problems and no generator');
  const one = (raw, at) => {
    const c = cleanProblem(raw); if (!c.p) return add(at, c.why);
    const T = TOOLS[c.p.tool], p = c.p;
    T.solve.why = '';
    const s = T.solve(p);
    if (!s) return add(at, `cannot be solved: ${T.solve.why || 'no worked answer'}`);
    if (!T.check(p, s).ok) return add(at, 'its worked answer does not pass the check');
    if (T.check(p, T.start(p)).ok) return add(at, 'the empty start already counts as right');
    const steps = T.steps(p), hints = T.hints(p);
    if (!Array.isArray(steps) || !steps.length) return add(at, 'it has no steps');
    if (!Array.isArray(hints) || !hints.length || hints.length > 3) return add(at, 'it needs one to three hints');
    if (words) for (const x of [T.task(p), T.ask(p), ...steps, ...hints]) if (!(x.k in words)) return add(at, `the words table has no "${x.k}"`);
    return null;
  };
  fixed.slice(0, MAX_PROBLEMS).forEach((raw, i) => one(raw, `problem ${i + 1}`));
  if (gen && TOOLS[gen.tool]) {
    const T = TOOLS[gen.tool];
    for (let i = 1; i <= 30; i++) { const raw = T.gen(seeded(i * 7919), gen); if (!cleanProblem(raw).p || one(raw, 'generator') !== null) { if (!cleanProblem(raw).p) add('generator', `made a problem it cannot use (${cleanProblem(raw).why})`); break; } if (out.some(x => x.at === 'generator')) break; }
  }
  // The Builder's own steps and hints (text only): short lines, at most 3 hints a tool.
  for (const [k, list] of Object.entries(a.steps && typeof a.steps === 'object' ? a.steps : {})) if (!TOOLS[k] || !Array.isArray(list) || list.length > 6 || list.some(s => typeof s !== 'string' || !s.trim() || s.length > 160)) add('steps', `steps for "${k.slice(0, 30)}" must be up to 6 short lines for a known tool`);
  for (const [k, list] of Object.entries(a.hints && typeof a.hints === 'object' ? a.hints : {})) if (!TOOLS[k] || !Array.isArray(list) || list.length > 3 || list.some(s => typeof s !== 'string' || !s.trim() || s.length > 160)) add('hints', `hints for "${k.slice(0, 30)}" must be 1 to 3 short lines for a known tool`);
  return { ok: !out.length, problems: out };
}

// ---- words.js
// Oomba Canvas: every word a student reads, in the site's languages (BRB.user.lang; en-GB and any other regional code
// falls back to its base language, then to English). {name} is a value: a number, a fraction (drawn stacked, read
// "n/d"), or another key of this table (a place name, a group). The Builder's own TASK, STEPS and HINTS lines are written
// in the builder's language and shown as they are; these are the kit's fixed lines.
const WORDS = {
  en: {
    watch: 'Watch', count: 'Count up', guided: 'Guided', own: 'On my own', keypad: 'Keypad', problemOf: 'Problem {n} of {total}',
    readAloud: 'Read the task aloud', steps: 'Steps', showSteps: 'Show steps', hideSteps: 'Hide steps', check: 'Check', next: 'Next',
    hint: 'Hint', stuck: 'Stuck?', clear: 'Clear', hintOf: 'Hint {n} of {total}', noMoreHints: 'That was the last hint. Have a go, then press Check.',
    right: 'Right!', notYet: 'Not yet.', tryAgain: 'Have another go.', shown: 'Here is one way to do it. On to the next one.',
    watchNow: 'Watch how it is done.', youTry: 'Now you try', toGo: '{n} to go', endH: '{right} of {total} right', endAll: 'Every one right. Brilliant!',
    endSome: 'Good work. Practice makes it easier.', newSet: 'Try new ones', again: 'Try again', back: 'Back', target: 'Target', yours: 'Yours',
    pieces: 'Pieces', placed: '{n} placed', box: 'Answer box', del: 'Delete', up: 'One more', down: 'One less', task: 'Task', workspace: 'Workspace',
    groups: 'Groups', tiles: 'Tiles', order: 'Order', pickTile: 'Pick a tile, then a place for it.', board: 'Board',
    eqTask: 'Make {a} using {u} pieces.', eqQ: 'Does your bar match {a}?', shTask: 'Shade {a} of the bar.', shQ: 'Have you shaded {a}?',
    cmpTask: 'Which is bigger: {a} or {b}?', cmpQ: 'Pick <, = or >.', nlTask: 'Put a point at {a} on the number line.', nlJump: 'Start at {a} and jump on {b}. Where do you land?',
    nlQ: 'Tap the tick where it goes.', addTask: 'Work out {a} + {b}.', subTask: 'Work out {a} − {b}.', mulTask: 'Work out {a} × {b}.', digQ: 'Fill in the answer, ones on the right.',
    sortTask: 'Sort the tiles into the groups.', sortQ: 'Is every tile in the right group?', orderUp: 'Put these in order, smallest first.', orderDown: 'Put these in order, biggest first.', orderQ: 'Are they in order?',
    pressCheck: 'Press Check.', eqOne: 'How many {u} pieces make {f}?', eqMany: 'So {a} is how many {u} pieces?', eqDrag: 'Put {m} pieces of {u} on your bar.',
    shCut: 'How many equal parts does the bar have?', shCount: 'How many parts do you shade for {a}?', shTap: 'Tap {n} parts.',
    cmpA: '{a} is how many pieces of {u}?', cmpB: '{b} is how many pieces of {u}?', cmpPick: 'More pieces means bigger. Pick the sign.',
    nlParts: 'How many equal parts is each whole cut into?', nlCount: 'How many ticks after {lo} is {a}?', nlTap: 'Tap that tick.', nlFrom: 'Find {a} on the line.', nlJumpTicks: 'How many ticks is a jump of {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} carried = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} is less than {y}, so take 1 from the next column.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} carried = ?', colWrite: 'Write each ones digit in its box and carry the tens.',
    sortRead: 'Read the groups.', sortEach: 'Put each tile in its group.', orderSmall: 'Find the smallest one first.', orderBig: 'Find the biggest one first.', orderNext: 'Then the next one, and so on.',
    eqH1: 'Each {f} is the same as {k} pieces of {u}.', eqH2: '{n} of them make {n} × {k} = {m} pieces.', eqH3: 'Put {m} pieces of {u} on your bar, then press Check.',
    shH1: 'Count the parts of the bar: there are {d}.', shH2: 'The top number of {a} says how many to shade: {n}.', shH3: 'Tap {n} parts so they light up.',
    cmpH1: 'Look at the two bars: which is longer?', cmpH2: 'Cut both into pieces of {u} and count.', cmpH3: '{a} is {x} pieces and {b} is {y} pieces.',
    nlH1: 'Each whole is cut into {sub} parts.', nlH2: '{a} is {t} ticks after {lo}.', nlH3: 'Count {t} ticks on from {lo}, then tap.', nlJH2: 'A jump of {b} is {t} ticks.', nlJH3: 'Start at {a} and count {t} ticks on.',
    colH1: 'Start with the ones column, on the right.', colH2add: 'If a column makes 10 or more, carry 1 to the next column.', colH2sub: 'If the top digit is smaller, take 1 from the next column.', colH2mul: 'Multiply each digit, then add what you carried.', colH3: 'The ones digit of the answer is {d}.',
    sortH1: 'Read the name of each group.', sortH2: 'Check one tile at a time.', sortH3: '{t} goes in: {g}.', orderH2: 'Compare two tiles at a time.', orderH3: 'The first one is {t}.',
    fbEmpty: 'Nothing is there yet.', fbNotThese: 'Use only {u} pieces.', fbMore: 'Not enough yet.', fbLess: 'That is a little too much.', fbPick: 'Pick a sign first.', fbSign: 'Look again at the two sizes.',
    fbTap: 'Tap a tick first.', fbRight: 'A little further to the right.', fbLeft: 'A little further to the left.', fbFill: 'Fill in this column: {place}.', fbCol: 'Look again at this column: {place}.',
    fbSortAll: 'Put every tile in a group.', fbSortWrong: 'Tiles in the wrong group: {n}.', fbOrderAll: 'Fill every place.', fbOrderWrong: 'Not in order yet.',
    binEven: 'Even', binOdd: 'Odd', binLess: 'Less than {n}', binAtLeast: '{n} or more', binMult: 'Multiple of {n}', binNotMult: 'Not a multiple of {n}',
    ones: 'Ones', tens: 'Tens', hundreds: 'Hundreds', thousands: 'Thousands', tenThousands: 'Ten thousands',
  },
  es: {
    watch: 'Mirar', count: 'Contar', guided: 'Guiado', own: 'Por mi cuenta', keypad: 'Teclado', problemOf: 'Problema {n} de {total}',
    readAloud: 'Leer la tarea en voz alta', steps: 'Pasos', showSteps: 'Ver pasos', hideSteps: 'Ocultar pasos', check: 'Comprobar', next: 'Siguiente',
    hint: 'Pista', stuck: '¿Atascado?', clear: 'Borrar', hintOf: 'Pista {n} de {total}', noMoreHints: 'Era la última pista. Inténtalo y pulsa Comprobar.',
    right: '¡Correcto!', notYet: 'Todavía no.', tryAgain: 'Inténtalo otra vez.', shown: 'Así se puede hacer. Vamos al siguiente.',
    watchNow: 'Mira cómo se hace.', youTry: 'Ahora tú', toGo: 'Faltan {n}', endH: '{right} de {total} bien', endAll: 'Todos bien. ¡Genial!',
    endSome: 'Buen trabajo. Practicar lo hace más fácil.', newSet: 'Probar otros nuevos', again: 'Otra vez', back: 'Volver', target: 'Objetivo', yours: 'El tuyo',
    pieces: 'Piezas', placed: '{n} puestas', box: 'Casilla de respuesta', del: 'Borrar', up: 'Uno más', down: 'Uno menos', task: 'Tarea', workspace: 'Zona de trabajo',
    groups: 'Grupos', tiles: 'Fichas', order: 'Orden', pickTile: 'Elige una ficha y luego su lugar.', board: 'Pizarra',
    eqTask: 'Forma {a} con piezas de {u}.', eqQ: '¿Tu barra es igual a {a}?', shTask: 'Colorea {a} de la barra.', shQ: '¿Has coloreado {a}?',
    cmpTask: '¿Cuál es mayor: {a} o {b}?', cmpQ: 'Elige <, = o >.', nlTask: 'Pon un punto en {a} en la recta numérica.', nlJump: 'Empieza en {a} y salta {b}. ¿Dónde caes?',
    nlQ: 'Toca la marca donde va.', addTask: 'Calcula {a} + {b}.', subTask: 'Calcula {a} − {b}.', mulTask: 'Calcula {a} × {b}.', digQ: 'Escribe el resultado, las unidades a la derecha.',
    sortTask: 'Clasifica las fichas en los grupos.', sortQ: '¿Está cada ficha en su grupo?', orderUp: 'Ordénalas de menor a mayor.', orderDown: 'Ordénalas de mayor a menor.', orderQ: '¿Están en orden?',
    pressCheck: 'Pulsa Comprobar.', eqOne: '¿Cuántas piezas de {u} forman {f}?', eqMany: 'Entonces, ¿{a} son cuántas piezas de {u}?', eqDrag: 'Pon {m} piezas de {u} en tu barra.',
    shCut: '¿Cuántas partes iguales tiene la barra?', shCount: '¿Cuántas partes coloreas para {a}?', shTap: 'Toca {n} partes.',
    cmpA: '¿{a} son cuántas piezas de {u}?', cmpB: '¿{b} son cuántas piezas de {u}?', cmpPick: 'Más piezas es más grande. Elige el signo.',
    nlParts: '¿En cuántas partes iguales se divide cada unidad?', nlCount: '¿Cuántas marcas después de {lo} está {a}?', nlTap: 'Toca esa marca.', nlFrom: 'Busca {a} en la recta.', nlJumpTicks: '¿Cuántas marcas es un salto de {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} que llevas = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} es menor que {y}, así que pide 1 a la columna siguiente.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} que llevas = ?', colWrite: 'Escribe cada unidad en su casilla y lleva las decenas.',
    sortRead: 'Lee los grupos.', sortEach: 'Pon cada ficha en su grupo.', orderSmall: 'Busca primero la más pequeña.', orderBig: 'Busca primero la más grande.', orderNext: 'Luego la siguiente, y así.',
    eqH1: 'Cada {f} es igual a {k} piezas de {u}.', eqH2: '{n} de ellas son {n} × {k} = {m} piezas.', eqH3: 'Pon {m} piezas de {u} en tu barra y pulsa Comprobar.',
    shH1: 'Cuenta las partes de la barra: hay {d}.', shH2: 'El número de arriba de {a} dice cuántas colorear: {n}.', shH3: 'Toca {n} partes para colorearlas.',
    cmpH1: 'Mira las dos barras: ¿cuál es más larga?', cmpH2: 'Corta las dos en piezas de {u} y cuenta.', cmpH3: '{a} son {x} piezas y {b} son {y} piezas.',
    nlH1: 'Cada unidad se divide en {sub} partes.', nlH2: '{a} está {t} marcas después de {lo}.', nlH3: 'Cuenta {t} marcas desde {lo} y toca.', nlJH2: 'Un salto de {b} son {t} marcas.', nlJH3: 'Empieza en {a} y cuenta {t} marcas.',
    colH1: 'Empieza por la columna de las unidades, a la derecha.', colH2add: 'Si una columna da 10 o más, lleva 1 a la siguiente.', colH2sub: 'Si el número de arriba es menor, pide 1 a la columna siguiente.', colH2mul: 'Multiplica cada cifra y suma lo que llevas.', colH3: 'La cifra de las unidades del resultado es {d}.',
    sortH1: 'Lee el nombre de cada grupo.', sortH2: 'Revisa las fichas de una en una.', sortH3: '{t} va en: {g}.', orderH2: 'Compara las fichas de dos en dos.', orderH3: 'La primera es {t}.',
    fbEmpty: 'Todavía no hay nada.', fbNotThese: 'Usa solo piezas de {u}.', fbMore: 'Todavía no es suficiente.', fbLess: 'Es un poco demasiado.', fbPick: 'Elige primero un signo.', fbSign: 'Mira otra vez los dos tamaños.',
    fbTap: 'Toca primero una marca.', fbRight: 'Un poco más a la derecha.', fbLeft: 'Un poco más a la izquierda.', fbFill: 'Completa esta columna: {place}.', fbCol: 'Mira otra vez esta columna: {place}.',
    fbSortAll: 'Pon cada ficha en un grupo.', fbSortWrong: 'Fichas en el grupo equivocado: {n}.', fbOrderAll: 'Llena cada lugar.', fbOrderWrong: 'Todavía no están en orden.',
    binEven: 'Par', binOdd: 'Impar', binLess: 'Menos de {n}', binAtLeast: '{n} o más', binMult: 'Múltiplo de {n}', binNotMult: 'No es múltiplo de {n}',
    ones: 'Unidades', tens: 'Decenas', hundreds: 'Centenas', thousands: 'Millares', tenThousands: 'Decenas de millar',
  },
  fr: {
    watch: 'Regarder', count: 'Compter', guided: 'Guidé', own: 'Tout seul', keypad: 'Clavier', problemOf: 'Problème {n} sur {total}',
    readAloud: 'Lire la consigne à voix haute', steps: 'Étapes', showSteps: 'Voir les étapes', hideSteps: 'Cacher les étapes', check: 'Vérifier', next: 'Suivant',
    hint: 'Indice', stuck: 'Bloqué ?', clear: 'Effacer', hintOf: 'Indice {n} sur {total}', noMoreHints: 'C’était le dernier indice. Essaie, puis appuie sur Vérifier.',
    right: 'Bravo !', notYet: 'Pas encore.', tryAgain: 'Essaie encore.', shown: 'Voici une façon de faire. Au suivant.',
    watchNow: 'Regarde comment on fait.', youTry: 'À toi', toGo: 'Encore {n}', endH: '{right} sur {total} justes', endAll: 'Tout est juste. Bravo !',
    endSome: 'Bon travail. On progresse en s’entraînant.', newSet: 'Essayer de nouveaux', again: 'Recommencer', back: 'Retour', target: 'Cible', yours: 'La tienne',
    pieces: 'Pièces', placed: '{n} posées', box: 'Case réponse', del: 'Effacer', up: 'Un de plus', down: 'Un de moins', task: 'Consigne', workspace: 'Espace de travail',
    groups: 'Groupes', tiles: 'Tuiles', order: 'Ordre', pickTile: 'Choisis une tuile, puis sa place.', board: 'Tableau',
    eqTask: 'Fais {a} avec des pièces de {u}.', eqQ: 'Ta barre est-elle égale à {a} ?', shTask: 'Colorie {a} de la barre.', shQ: 'As-tu colorié {a} ?',
    cmpTask: 'Lequel est le plus grand : {a} ou {b} ?', cmpQ: 'Choisis <, = ou >.', nlTask: 'Place un point à {a} sur la droite graduée.', nlJump: 'Pars de {a} et avance de {b}. Où arrives-tu ?',
    nlQ: 'Touche la graduation qui convient.', addTask: 'Calcule {a} + {b}.', subTask: 'Calcule {a} − {b}.', mulTask: 'Calcule {a} × {b}.', digQ: 'Écris le résultat, les unités à droite.',
    sortTask: 'Range les tuiles dans les groupes.', sortQ: 'Chaque tuile est-elle dans le bon groupe ?', orderUp: 'Range-les du plus petit au plus grand.', orderDown: 'Range-les du plus grand au plus petit.', orderQ: 'Sont-elles dans l’ordre ?',
    pressCheck: 'Appuie sur Vérifier.', eqOne: 'Combien de pièces de {u} font {f} ?', eqMany: 'Alors {a}, c’est combien de pièces de {u} ?', eqDrag: 'Pose {m} pièces de {u} sur ta barre.',
    shCut: 'Combien de parts égales a la barre ?', shCount: 'Combien de parts colories-tu pour {a} ?', shTap: 'Touche {n} parts.',
    cmpA: '{a}, c’est combien de pièces de {u} ?', cmpB: '{b}, c’est combien de pièces de {u} ?', cmpPick: 'Plus de pièces, c’est plus grand. Choisis le signe.',
    nlParts: 'En combien de parts égales chaque unité est-elle coupée ?', nlCount: '{a} est à combien de graduations après {lo} ?', nlTap: 'Touche cette graduation.', nlFrom: 'Trouve {a} sur la droite.', nlJumpTicks: 'Un saut de {b}, c’est combien de graduations ?',
    colAdd: '{place} : {x} + {y} = ?', colAddC: '{place} : {x} + {y} + {c} de retenue = ?', colSub: '{place} : {x} − {y} = ?', colBorrow: '{place} : {x} est plus petit que {y}, alors prends 1 à la colonne suivante.',
    colMul: '{place} : {x} × {y} = ?', colMulC: '{place} : {x} × {y} + {c} de retenue = ?', colWrite: 'Écris chaque chiffre des unités dans sa case et retiens les dizaines.',
    sortRead: 'Lis les groupes.', sortEach: 'Mets chaque tuile dans son groupe.', orderSmall: 'Trouve d’abord le plus petit.', orderBig: 'Trouve d’abord le plus grand.', orderNext: 'Puis le suivant, et ainsi de suite.',
    eqH1: 'Chaque {f} vaut {k} pièces de {u}.', eqH2: '{n} d’entre elles font {n} × {k} = {m} pièces.', eqH3: 'Pose {m} pièces de {u} sur ta barre, puis appuie sur Vérifier.',
    shH1: 'Compte les parts de la barre : il y en a {d}.', shH2: 'Le nombre du haut de {a} dit combien colorier : {n}.', shH3: 'Touche {n} parts pour les colorier.',
    cmpH1: 'Regarde les deux barres : laquelle est la plus longue ?', cmpH2: 'Coupe les deux en pièces de {u} et compte.', cmpH3: '{a}, c’est {x} pièces et {b}, c’est {y} pièces.',
    nlH1: 'Chaque unité est coupée en {sub} parts.', nlH2: '{a} est à {t} graduations après {lo}.', nlH3: 'Compte {t} graduations à partir de {lo}, puis touche.', nlJH2: 'Un saut de {b}, c’est {t} graduations.', nlJH3: 'Pars de {a} et compte {t} graduations.',
    colH1: 'Commence par la colonne des unités, à droite.', colH2add: 'Si une colonne fait 10 ou plus, retiens 1 pour la suivante.', colH2sub: 'Si le chiffre du haut est plus petit, prends 1 à la colonne suivante.', colH2mul: 'Multiplie chaque chiffre, puis ajoute la retenue.', colH3: 'Le chiffre des unités du résultat est {d}.',
    sortH1: 'Lis le nom de chaque groupe.', sortH2: 'Vérifie une tuile à la fois.', sortH3: '{t} va dans : {g}.', orderH2: 'Compare les tuiles deux par deux.', orderH3: 'La première est {t}.',
    fbEmpty: 'Il n’y a encore rien.', fbNotThese: 'Utilise seulement des pièces de {u}.', fbMore: 'Pas encore assez.', fbLess: 'C’est un peu trop.', fbPick: 'Choisis d’abord un signe.', fbSign: 'Regarde encore les deux tailles.',
    fbTap: 'Touche d’abord une graduation.', fbRight: 'Un peu plus à droite.', fbLeft: 'Un peu plus à gauche.', fbFill: 'Remplis cette colonne : {place}.', fbCol: 'Regarde encore cette colonne : {place}.',
    fbSortAll: 'Mets chaque tuile dans un groupe.', fbSortWrong: 'Tuiles dans le mauvais groupe : {n}.', fbOrderAll: 'Remplis chaque place.', fbOrderWrong: 'Pas encore dans l’ordre.',
    binEven: 'Pair', binOdd: 'Impair', binLess: 'Moins de {n}', binAtLeast: '{n} ou plus', binMult: 'Multiple de {n}', binNotMult: 'Pas un multiple de {n}',
    ones: 'Unités', tens: 'Dizaines', hundreds: 'Centaines', thousands: 'Milliers', tenThousands: 'Dizaines de mille',
  },
  de: {
    watch: 'Zuschauen', count: 'Hochzählen', guided: 'Mit Hilfe', own: 'Allein', keypad: 'Ziffern', problemOf: 'Aufgabe {n} von {total}',
    readAloud: 'Aufgabe vorlesen', steps: 'Schritte', showSteps: 'Schritte zeigen', hideSteps: 'Schritte ausblenden', check: 'Prüfen', next: 'Weiter',
    hint: 'Tipp', stuck: 'Hängst du?', clear: 'Löschen', hintOf: 'Tipp {n} von {total}', noMoreHints: 'Das war der letzte Tipp. Probier es und drück auf Prüfen.',
    right: 'Richtig!', notYet: 'Noch nicht.', tryAgain: 'Versuch es noch einmal.', shown: 'So kann man es machen. Weiter zur nächsten.',
    watchNow: 'Schau, wie es geht.', youTry: 'Jetzt du', toGo: 'Noch {n}', endH: '{right} von {total} richtig', endAll: 'Alles richtig. Super!',
    endSome: 'Gut gemacht. Mit Üben wird es leichter.', newSet: 'Neue Aufgaben', again: 'Noch einmal', back: 'Zurück', target: 'Ziel', yours: 'Deins',
    pieces: 'Teile', placed: '{n} gelegt', box: 'Antwortfeld', del: 'Löschen', up: 'Eins mehr', down: 'Eins weniger', task: 'Aufgabe', workspace: 'Arbeitsfläche',
    groups: 'Gruppen', tiles: 'Kärtchen', order: 'Reihenfolge', pickTile: 'Wähle ein Kärtchen, dann seinen Platz.', board: 'Tafel',
    eqTask: 'Lege {a} mit {u}-Teilen.', eqQ: 'Passt dein Streifen zu {a}?', shTask: 'Färbe {a} des Streifens.', shQ: 'Hast du {a} gefärbt?',
    cmpTask: 'Was ist größer: {a} oder {b}?', cmpQ: 'Wähle <, = oder >.', nlTask: 'Setze einen Punkt bei {a} auf den Zahlenstrahl.', nlJump: 'Starte bei {a} und springe {b} weiter. Wo landest du?',
    nlQ: 'Tippe auf den passenden Strich.', addTask: 'Rechne {a} + {b}.', subTask: 'Rechne {a} − {b}.', mulTask: 'Rechne {a} × {b}.', digQ: 'Trag das Ergebnis ein, die Einer rechts.',
    sortTask: 'Sortiere die Kärtchen in die Gruppen.', sortQ: 'Ist jedes Kärtchen in der richtigen Gruppe?', orderUp: 'Ordne sie, das Kleinste zuerst.', orderDown: 'Ordne sie, das Größte zuerst.', orderQ: 'Stimmt die Reihenfolge?',
    pressCheck: 'Drück auf Prüfen.', eqOne: 'Wie viele {u}-Teile ergeben {f}?', eqMany: 'Also sind {a} wie viele {u}-Teile?', eqDrag: 'Lege {m} {u}-Teile auf deinen Streifen.',
    shCut: 'Wie viele gleiche Teile hat der Streifen?', shCount: 'Wie viele Teile färbst du für {a}?', shTap: 'Tippe auf {n} Teile.',
    cmpA: '{a} sind wie viele {u}-Teile?', cmpB: '{b} sind wie viele {u}-Teile?', cmpPick: 'Mehr Teile heißt größer. Wähle das Zeichen.',
    nlParts: 'In wie viele gleiche Teile ist jedes Ganze geteilt?', nlCount: 'Wie viele Striche nach {lo} liegt {a}?', nlTap: 'Tippe auf diesen Strich.', nlFrom: 'Finde {a} auf dem Strahl.', nlJumpTicks: 'Wie viele Striche ist ein Sprung von {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} übertragen = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} ist kleiner als {y}, also nimm 1 von der nächsten Stelle.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} übertragen = ?', colWrite: 'Schreib jede Einerziffer in ihr Feld und übertrag die Zehner.',
    sortRead: 'Lies die Gruppen.', sortEach: 'Leg jedes Kärtchen in seine Gruppe.', orderSmall: 'Such zuerst das Kleinste.', orderBig: 'Such zuerst das Größte.', orderNext: 'Dann das nächste und so weiter.',
    eqH1: 'Jedes {f} ist so groß wie {k} {u}-Teile.', eqH2: '{n} davon sind {n} × {k} = {m} Teile.', eqH3: 'Leg {m} {u}-Teile auf deinen Streifen und drück auf Prüfen.',
    shH1: 'Zähl die Teile des Streifens: es sind {d}.', shH2: 'Die obere Zahl von {a} sagt, wie viele du färbst: {n}.', shH3: 'Tippe auf {n} Teile, damit sie sich färben.',
    cmpH1: 'Schau die zwei Streifen an: welcher ist länger?', cmpH2: 'Teil beide in {u}-Teile und zähl.', cmpH3: '{a} sind {x} Teile und {b} sind {y} Teile.',
    nlH1: 'Jedes Ganze ist in {sub} Teile geteilt.', nlH2: '{a} liegt {t} Striche nach {lo}.', nlH3: 'Zähl {t} Striche ab {lo} und tippe.', nlJH2: 'Ein Sprung von {b} sind {t} Striche.', nlJH3: 'Starte bei {a} und zähl {t} Striche weiter.',
    colH1: 'Fang mit der Einerspalte rechts an.', colH2add: 'Ergibt eine Spalte 10 oder mehr, übertrag 1 in die nächste.', colH2sub: 'Ist die obere Ziffer kleiner, nimm 1 von der nächsten Stelle.', colH2mul: 'Multipliziere jede Ziffer und zähl den Übertrag dazu.', colH3: 'Die Einerziffer des Ergebnisses ist {d}.',
    sortH1: 'Lies den Namen jeder Gruppe.', sortH2: 'Prüf ein Kärtchen nach dem anderen.', sortH3: '{t} gehört zu: {g}.', orderH2: 'Vergleiche immer zwei Kärtchen.', orderH3: 'Das erste ist {t}.',
    fbEmpty: 'Da ist noch nichts.', fbNotThese: 'Nimm nur {u}-Teile.', fbMore: 'Noch nicht genug.', fbLess: 'Das ist ein bisschen zu viel.', fbPick: 'Wähle zuerst ein Zeichen.', fbSign: 'Schau dir die zwei Größen noch einmal an.',
    fbTap: 'Tippe zuerst auf einen Strich.', fbRight: 'Etwas weiter nach rechts.', fbLeft: 'Etwas weiter nach links.', fbFill: 'Füll diese Spalte aus: {place}.', fbCol: 'Schau dir diese Spalte noch einmal an: {place}.',
    fbSortAll: 'Leg jedes Kärtchen in eine Gruppe.', fbSortWrong: 'Kärtchen in der falschen Gruppe: {n}.', fbOrderAll: 'Füll jeden Platz.', fbOrderWrong: 'Noch nicht in der richtigen Reihenfolge.',
    binEven: 'Gerade', binOdd: 'Ungerade', binLess: 'Kleiner als {n}', binAtLeast: '{n} oder mehr', binMult: 'Vielfaches von {n}', binNotMult: 'Kein Vielfaches von {n}',
    ones: 'Einer', tens: 'Zehner', hundreds: 'Hunderter', thousands: 'Tausender', tenThousands: 'Zehntausender',
  },
  it: {
    watch: 'Guarda', count: 'Conta', guided: 'Guidato', own: 'Da solo', keypad: 'Tastierino', problemOf: 'Problema {n} di {total}',
    readAloud: 'Leggi la consegna ad alta voce', steps: 'Passi', showSteps: 'Mostra i passi', hideSteps: 'Nascondi i passi', check: 'Controlla', next: 'Avanti',
    hint: 'Aiuto', stuck: 'Bloccato?', clear: 'Cancella', hintOf: 'Aiuto {n} di {total}', noMoreHints: 'Era l’ultimo aiuto. Prova e poi premi Controlla.',
    right: 'Giusto!', notYet: 'Non ancora.', tryAgain: 'Riprova.', shown: 'Ecco un modo per farlo. Avanti con il prossimo.',
    watchNow: 'Guarda come si fa.', youTry: 'Ora tu', toGo: 'Ne mancano {n}', endH: '{right} su {total} giusti', endAll: 'Tutti giusti. Bravissimo!',
    endSome: 'Bel lavoro. Esercitarsi rende tutto più facile.', newSet: 'Provane di nuovi', again: 'Riprova', back: 'Indietro', target: 'Obiettivo', yours: 'Il tuo',
    pieces: 'Pezzi', placed: '{n} messi', box: 'Casella della risposta', del: 'Cancella', up: 'Uno in più', down: 'Uno in meno', task: 'Consegna', workspace: 'Area di lavoro',
    groups: 'Gruppi', tiles: 'Tessere', order: 'Ordine', pickTile: 'Scegli una tessera, poi il suo posto.', board: 'Lavagna',
    eqTask: 'Forma {a} con pezzi da {u}.', eqQ: 'La tua barra è uguale a {a}?', shTask: 'Colora {a} della barra.', shQ: 'Hai colorato {a}?',
    cmpTask: 'Quale è più grande: {a} o {b}?', cmpQ: 'Scegli <, = o >.', nlTask: 'Metti un punto su {a} nella linea dei numeri.', nlJump: 'Parti da {a} e salta avanti di {b}. Dove arrivi?',
    nlQ: 'Tocca la tacca giusta.', addTask: 'Calcola {a} + {b}.', subTask: 'Calcola {a} − {b}.', mulTask: 'Calcola {a} × {b}.', digQ: 'Scrivi il risultato, le unità a destra.',
    sortTask: 'Metti le tessere nei gruppi.', sortQ: 'Ogni tessera è nel gruppo giusto?', orderUp: 'Mettile in ordine, dal più piccolo.', orderDown: 'Mettile in ordine, dal più grande.', orderQ: 'Sono in ordine?',
    pressCheck: 'Premi Controlla.', eqOne: 'Quanti pezzi da {u} fanno {f}?', eqMany: 'Allora {a} sono quanti pezzi da {u}?', eqDrag: 'Metti {m} pezzi da {u} sulla tua barra.',
    shCut: 'Quante parti uguali ha la barra?', shCount: 'Quante parti colori per {a}?', shTap: 'Tocca {n} parti.',
    cmpA: '{a} sono quanti pezzi da {u}?', cmpB: '{b} sono quanti pezzi da {u}?', cmpPick: 'Più pezzi vuol dire più grande. Scegli il segno.',
    nlParts: 'In quante parti uguali è diviso ogni intero?', nlCount: 'Quante tacche dopo {lo} si trova {a}?', nlTap: 'Tocca quella tacca.', nlFrom: 'Trova {a} sulla linea.', nlJumpTicks: 'Quante tacche è un salto di {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} di riporto = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} è minore di {y}, quindi prendi 1 dalla colonna dopo.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} di riporto = ?', colWrite: 'Scrivi ogni cifra delle unità nella sua casella e riporta le decine.',
    sortRead: 'Leggi i gruppi.', sortEach: 'Metti ogni tessera nel suo gruppo.', orderSmall: 'Trova prima il più piccolo.', orderBig: 'Trova prima il più grande.', orderNext: 'Poi il successivo, e così via.',
    eqH1: 'Ogni {f} è uguale a {k} pezzi da {u}.', eqH2: '{n} di loro fanno {n} × {k} = {m} pezzi.', eqH3: 'Metti {m} pezzi da {u} sulla barra, poi premi Controlla.',
    shH1: 'Conta le parti della barra: sono {d}.', shH2: 'Il numero in alto di {a} dice quante colorarne: {n}.', shH3: 'Tocca {n} parti per colorarle.',
    cmpH1: 'Guarda le due barre: quale è più lunga?', cmpH2: 'Dividi tutte e due in pezzi da {u} e conta.', cmpH3: '{a} sono {x} pezzi e {b} sono {y} pezzi.',
    nlH1: 'Ogni intero è diviso in {sub} parti.', nlH2: '{a} è {t} tacche dopo {lo}.', nlH3: 'Conta {t} tacche da {lo}, poi tocca.', nlJH2: 'Un salto di {b} è {t} tacche.', nlJH3: 'Parti da {a} e conta {t} tacche.',
    colH1: 'Comincia dalla colonna delle unità, a destra.', colH2add: 'Se una colonna fa 10 o più, riporta 1 alla successiva.', colH2sub: 'Se la cifra in alto è più piccola, prendi 1 dalla colonna dopo.', colH2mul: 'Moltiplica ogni cifra, poi aggiungi il riporto.', colH3: 'La cifra delle unità del risultato è {d}.',
    sortH1: 'Leggi il nome di ogni gruppo.', sortH2: 'Controlla una tessera alla volta.', sortH3: '{t} va in: {g}.', orderH2: 'Confronta due tessere alla volta.', orderH3: 'Il primo è {t}.',
    fbEmpty: 'Non c’è ancora niente.', fbNotThese: 'Usa solo pezzi da {u}.', fbMore: 'Non basta ancora.', fbLess: 'È un po’ troppo.', fbPick: 'Prima scegli un segno.', fbSign: 'Guarda di nuovo le due misure.',
    fbTap: 'Prima tocca una tacca.', fbRight: 'Un po’ più a destra.', fbLeft: 'Un po’ più a sinistra.', fbFill: 'Completa questa colonna: {place}.', fbCol: 'Guarda di nuovo questa colonna: {place}.',
    fbSortAll: 'Metti ogni tessera in un gruppo.', fbSortWrong: 'Tessere nel gruppo sbagliato: {n}.', fbOrderAll: 'Riempi ogni posto.', fbOrderWrong: 'Non sono ancora in ordine.',
    binEven: 'Pari', binOdd: 'Dispari', binLess: 'Meno di {n}', binAtLeast: '{n} o più', binMult: 'Multiplo di {n}', binNotMult: 'Non multiplo di {n}',
    ones: 'Unità', tens: 'Decine', hundreds: 'Centinaia', thousands: 'Migliaia', tenThousands: 'Decine di migliaia',
  },
  pt: {
    watch: 'Assistir', count: 'Contar', guided: 'Com ajuda', own: 'Sozinho', keypad: 'Teclado', problemOf: 'Problema {n} de {total}',
    readAloud: 'Ler a tarefa em voz alta', steps: 'Passos', showSteps: 'Mostrar passos', hideSteps: 'Esconder passos', check: 'Conferir', next: 'Próximo',
    hint: 'Dica', stuck: 'Travou?', clear: 'Limpar', hintOf: 'Dica {n} de {total}', noMoreHints: 'Essa foi a última dica. Tente e depois toque em Conferir.',
    right: 'Certo!', notYet: 'Ainda não.', tryAgain: 'Tente de novo.', shown: 'Este é um jeito de fazer. Vamos ao próximo.',
    watchNow: 'Veja como se faz.', youTry: 'Agora é você', toGo: 'Faltam {n}', endH: '{right} de {total} certos', endAll: 'Todos certos. Demais!',
    endSome: 'Bom trabalho. Praticar deixa mais fácil.', newSet: 'Tentar novos', again: 'De novo', back: 'Voltar', target: 'Alvo', yours: 'O seu',
    pieces: 'Peças', placed: '{n} colocadas', box: 'Caixa da resposta', del: 'Apagar', up: 'Mais um', down: 'Menos um', task: 'Tarefa', workspace: 'Área de trabalho',
    groups: 'Grupos', tiles: 'Fichas', order: 'Ordem', pickTile: 'Escolha uma ficha e depois o lugar dela.', board: 'Lousa',
    eqTask: 'Forme {a} com peças de {u}.', eqQ: 'Sua barra é igual a {a}?', shTask: 'Pinte {a} da barra.', shQ: 'Você pintou {a}?',
    cmpTask: 'Qual é maior: {a} ou {b}?', cmpQ: 'Escolha <, = ou >.', nlTask: 'Marque um ponto em {a} na reta numérica.', nlJump: 'Comece em {a} e pule {b}. Onde você para?',
    nlQ: 'Toque no tracinho certo.', addTask: 'Calcule {a} + {b}.', subTask: 'Calcule {a} − {b}.', mulTask: 'Calcule {a} × {b}.', digQ: 'Escreva a resposta, as unidades à direita.',
    sortTask: 'Separe as fichas nos grupos.', sortQ: 'Cada ficha está no grupo certo?', orderUp: 'Coloque em ordem, do menor para o maior.', orderDown: 'Coloque em ordem, do maior para o menor.', orderQ: 'Estão em ordem?',
    pressCheck: 'Toque em Conferir.', eqOne: 'Quantas peças de {u} formam {f}?', eqMany: 'Então {a} são quantas peças de {u}?', eqDrag: 'Coloque {m} peças de {u} na sua barra.',
    shCut: 'Quantas partes iguais a barra tem?', shCount: 'Quantas partes você pinta para {a}?', shTap: 'Toque em {n} partes.',
    cmpA: '{a} são quantas peças de {u}?', cmpB: '{b} são quantas peças de {u}?', cmpPick: 'Mais peças quer dizer maior. Escolha o sinal.',
    nlParts: 'Em quantas partes iguais cada inteiro é dividido?', nlCount: 'Quantos tracinhos depois de {lo} fica {a}?', nlTap: 'Toque nesse tracinho.', nlFrom: 'Ache {a} na reta.', nlJumpTicks: 'Um pulo de {b} são quantos tracinhos?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} que vai = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} é menor que {y}, então pegue 1 da próxima coluna.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} que vai = ?', colWrite: 'Escreva cada unidade na sua caixa e passe as dezenas adiante.',
    sortRead: 'Leia os grupos.', sortEach: 'Coloque cada ficha no grupo dela.', orderSmall: 'Ache primeiro o menor.', orderBig: 'Ache primeiro o maior.', orderNext: 'Depois o próximo, e assim por diante.',
    eqH1: 'Cada {f} é igual a {k} peças de {u}.', eqH2: '{n} delas são {n} × {k} = {m} peças.', eqH3: 'Coloque {m} peças de {u} na barra e toque em Conferir.',
    shH1: 'Conte as partes da barra: são {d}.', shH2: 'O número de cima de {a} diz quantas pintar: {n}.', shH3: 'Toque em {n} partes para pintar.',
    cmpH1: 'Olhe as duas barras: qual é mais comprida?', cmpH2: 'Divida as duas em peças de {u} e conte.', cmpH3: '{a} são {x} peças e {b} são {y} peças.',
    nlH1: 'Cada inteiro é dividido em {sub} partes.', nlH2: '{a} fica {t} tracinhos depois de {lo}.', nlH3: 'Conte {t} tracinhos a partir de {lo} e toque.', nlJH2: 'Um pulo de {b} são {t} tracinhos.', nlJH3: 'Comece em {a} e conte {t} tracinhos.',
    colH1: 'Comece pela coluna das unidades, à direita.', colH2add: 'Se uma coluna der 10 ou mais, passe 1 para a próxima.', colH2sub: 'Se o algarismo de cima for menor, pegue 1 da próxima coluna.', colH2mul: 'Multiplique cada algarismo e some o que foi.', colH3: 'O algarismo das unidades da resposta é {d}.',
    sortH1: 'Leia o nome de cada grupo.', sortH2: 'Confira uma ficha de cada vez.', sortH3: '{t} vai em: {g}.', orderH2: 'Compare duas fichas de cada vez.', orderH3: 'O primeiro é {t}.',
    fbEmpty: 'Ainda não tem nada aí.', fbNotThese: 'Use só peças de {u}.', fbMore: 'Ainda não é suficiente.', fbLess: 'Passou um pouco.', fbPick: 'Escolha um sinal primeiro.', fbSign: 'Olhe de novo os dois tamanhos.',
    fbTap: 'Toque num tracinho primeiro.', fbRight: 'Um pouco mais para a direita.', fbLeft: 'Um pouco mais para a esquerda.', fbFill: 'Complete esta coluna: {place}.', fbCol: 'Olhe de novo esta coluna: {place}.',
    fbSortAll: 'Coloque cada ficha num grupo.', fbSortWrong: 'Fichas no grupo errado: {n}.', fbOrderAll: 'Preencha todos os lugares.', fbOrderWrong: 'Ainda não estão em ordem.',
    binEven: 'Par', binOdd: 'Ímpar', binLess: 'Menor que {n}', binAtLeast: '{n} ou mais', binMult: 'Múltiplo de {n}', binNotMult: 'Não é múltiplo de {n}',
    ones: 'Unidades', tens: 'Dezenas', hundreds: 'Centenas', thousands: 'Milhares', tenThousands: 'Dezenas de milhar',
  },
  nl: {
    watch: 'Kijken', count: 'Optellen', guided: 'Met hulp', own: 'Zelf', keypad: 'Cijfers', problemOf: 'Opgave {n} van {total}',
    readAloud: 'Lees de opdracht voor', steps: 'Stappen', showSteps: 'Stappen tonen', hideSteps: 'Stappen verbergen', check: 'Controleer', next: 'Volgende',
    hint: 'Tip', stuck: 'Vast?', clear: 'Wissen', hintOf: 'Tip {n} van {total}', noMoreHints: 'Dat was de laatste tip. Probeer het en druk op Controleer.',
    right: 'Goed zo!', notYet: 'Nog niet.', tryAgain: 'Probeer het nog eens.', shown: 'Zo kun je het doen. Op naar de volgende.',
    watchNow: 'Kijk hoe het gaat.', youTry: 'Nu jij', toGo: 'Nog {n}', endH: '{right} van {total} goed', endAll: 'Allemaal goed. Super!',
    endSome: 'Goed gewerkt. Oefenen maakt het makkelijker.', newSet: 'Nieuwe proberen', again: 'Opnieuw', back: 'Terug', target: 'Doel', yours: 'Van jou',
    pieces: 'Stukken', placed: '{n} gelegd', box: 'Antwoordvak', del: 'Wissen', up: 'Eén meer', down: 'Eén minder', task: 'Opdracht', workspace: 'Werkvlak',
    groups: 'Groepen', tiles: 'Kaartjes', order: 'Volgorde', pickTile: 'Kies een kaartje en dan zijn plek.', board: 'Bord',
    eqTask: 'Maak {a} met stukken van {u}.', eqQ: 'Is jouw strook gelijk aan {a}?', shTask: 'Kleur {a} van de strook.', shQ: 'Heb je {a} gekleurd?',
    cmpTask: 'Wat is groter: {a} of {b}?', cmpQ: 'Kies <, = of >.', nlTask: 'Zet een punt bij {a} op de getallenlijn.', nlJump: 'Begin bij {a} en spring {b} verder. Waar kom je uit?',
    nlQ: 'Tik op het juiste streepje.', addTask: 'Reken {a} + {b} uit.', subTask: 'Reken {a} − {b} uit.', mulTask: 'Reken {a} × {b} uit.', digQ: 'Vul het antwoord in, de eenheden rechts.',
    sortTask: 'Sorteer de kaartjes in de groepen.', sortQ: 'Zit elk kaartje in de goede groep?', orderUp: 'Zet ze op volgorde, de kleinste eerst.', orderDown: 'Zet ze op volgorde, de grootste eerst.', orderQ: 'Staan ze op volgorde?',
    pressCheck: 'Druk op Controleer.', eqOne: 'Hoeveel stukken van {u} zijn samen {f}?', eqMany: 'Dus {a} is hoeveel stukken van {u}?', eqDrag: 'Leg {m} stukken van {u} op je strook.',
    shCut: 'Hoeveel gelijke delen heeft de strook?', shCount: 'Hoeveel delen kleur je voor {a}?', shTap: 'Tik op {n} delen.',
    cmpA: '{a} is hoeveel stukken van {u}?', cmpB: '{b} is hoeveel stukken van {u}?', cmpPick: 'Meer stukken is groter. Kies het teken.',
    nlParts: 'In hoeveel gelijke delen is elk geheel verdeeld?', nlCount: 'Hoeveel streepjes na {lo} ligt {a}?', nlTap: 'Tik op dat streepje.', nlFrom: 'Zoek {a} op de lijn.', nlJumpTicks: 'Hoeveel streepjes is een sprong van {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} onthouden = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} is kleiner dan {y}, dus leen 1 van de volgende kolom.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} onthouden = ?', colWrite: 'Schrijf elk eenhedencijfer in zijn vak en onthoud de tientallen.',
    sortRead: 'Lees de groepen.', sortEach: 'Leg elk kaartje in zijn groep.', orderSmall: 'Zoek eerst de kleinste.', orderBig: 'Zoek eerst de grootste.', orderNext: 'Dan de volgende, enzovoort.',
    eqH1: 'Elke {f} is even groot als {k} stukken van {u}.', eqH2: '{n} daarvan zijn {n} × {k} = {m} stukken.', eqH3: 'Leg {m} stukken van {u} op je strook en druk op Controleer.',
    shH1: 'Tel de delen van de strook: het zijn er {d}.', shH2: 'Het bovenste getal van {a} zegt hoeveel je kleurt: {n}.', shH3: 'Tik op {n} delen om ze te kleuren.',
    cmpH1: 'Kijk naar de twee stroken: welke is langer?', cmpH2: 'Verdeel beide in stukken van {u} en tel.', cmpH3: '{a} is {x} stukken en {b} is {y} stukken.',
    nlH1: 'Elk geheel is verdeeld in {sub} delen.', nlH2: '{a} ligt {t} streepjes na {lo}.', nlH3: 'Tel {t} streepjes vanaf {lo} en tik.', nlJH2: 'Een sprong van {b} is {t} streepjes.', nlJH3: 'Begin bij {a} en tel {t} streepjes verder.',
    colH1: 'Begin met de kolom van de eenheden, rechts.', colH2add: 'Is een kolom 10 of meer, onthoud dan 1 voor de volgende.', colH2sub: 'Is het bovenste cijfer kleiner, leen dan 1 van de volgende kolom.', colH2mul: 'Vermenigvuldig elk cijfer en tel erbij wat je onthield.', colH3: 'Het eenhedencijfer van het antwoord is {d}.',
    sortH1: 'Lees de naam van elke groep.', sortH2: 'Controleer één kaartje tegelijk.', sortH3: '{t} hoort bij: {g}.', orderH2: 'Vergelijk steeds twee kaartjes.', orderH3: 'De eerste is {t}.',
    fbEmpty: 'Er ligt nog niets.', fbNotThese: 'Gebruik alleen stukken van {u}.', fbMore: 'Nog niet genoeg.', fbLess: 'Dat is een beetje te veel.', fbPick: 'Kies eerst een teken.', fbSign: 'Kijk nog eens naar de twee groottes.',
    fbTap: 'Tik eerst op een streepje.', fbRight: 'Iets verder naar rechts.', fbLeft: 'Iets verder naar links.', fbFill: 'Vul deze kolom in: {place}.', fbCol: 'Kijk nog eens naar deze kolom: {place}.',
    fbSortAll: 'Leg elk kaartje in een groep.', fbSortWrong: 'Kaartjes in de verkeerde groep: {n}.', fbOrderAll: 'Vul elke plek.', fbOrderWrong: 'Nog niet op volgorde.',
    binEven: 'Even', binOdd: 'Oneven', binLess: 'Minder dan {n}', binAtLeast: '{n} of meer', binMult: 'Veelvoud van {n}', binNotMult: 'Geen veelvoud van {n}',
    ones: 'Eenheden', tens: 'Tientallen', hundreds: 'Honderdtallen', thousands: 'Duizendtallen', tenThousands: 'Tienduizendtallen',
  },
  ru: {
    watch: 'Смотреть', count: 'Считать', guided: 'С подсказками', own: 'Сам', keypad: 'Цифры', problemOf: 'Задача {n} из {total}',
    readAloud: 'Прочитать задание вслух', steps: 'Шаги', showSteps: 'Показать шаги', hideSteps: 'Скрыть шаги', check: 'Проверить', next: 'Дальше',
    hint: 'Подсказка', stuck: 'Застрял?', clear: 'Стереть', hintOf: 'Подсказка {n} из {total}', noMoreHints: 'Это была последняя подсказка. Попробуй и нажми «Проверить».',
    right: 'Верно!', notYet: 'Пока нет.', tryAgain: 'Попробуй ещё раз.', shown: 'Вот как это можно сделать. Переходим к следующей.',
    watchNow: 'Посмотри, как это делается.', youTry: 'Теперь ты', toGo: 'Осталось: {n}', endH: 'Верно: {right} из {total}', endAll: 'Всё верно. Отлично!',
    endSome: 'Хорошая работа. С практикой будет легче.', newSet: 'Новые задачи', again: 'Ещё раз', back: 'Назад', target: 'Цель', yours: 'Твоя',
    pieces: 'Части', placed: 'Положено: {n}', box: 'Клетка для ответа', del: 'Стереть', up: 'На один больше', down: 'На один меньше', task: 'Задание', workspace: 'Рабочее поле',
    groups: 'Группы', tiles: 'Карточки', order: 'Порядок', pickTile: 'Выбери карточку, потом её место.', board: 'Доска',
    eqTask: 'Составь {a} из частей по {u}.', eqQ: 'Твоя полоска равна {a}?', shTask: 'Закрась {a} полоски.', shQ: 'Ты закрасил {a}?',
    cmpTask: 'Что больше: {a} или {b}?', cmpQ: 'Выбери <, = или >.', nlTask: 'Поставь точку в {a} на числовой прямой.', nlJump: 'Начни с {a} и прыгни вперёд на {b}. Где ты окажешься?',
    nlQ: 'Нажми на нужное деление.', addTask: 'Вычисли {a} + {b}.', subTask: 'Вычисли {a} − {b}.', mulTask: 'Вычисли {a} × {b}.', digQ: 'Запиши ответ, единицы справа.',
    sortTask: 'Разложи карточки по группам.', sortQ: 'Каждая карточка в своей группе?', orderUp: 'Расставь по порядку, от меньшего.', orderDown: 'Расставь по порядку, от большего.', orderQ: 'Они по порядку?',
    pressCheck: 'Нажми «Проверить».', eqOne: 'Сколько частей по {u} составляют {f}?', eqMany: 'Значит, {a} это сколько частей по {u}?', eqDrag: 'Положи {m} частей по {u} на полоску.',
    shCut: 'Сколько равных частей у полоски?', shCount: 'Сколько частей закрасить для {a}?', shTap: 'Нажми на {n} частей.',
    cmpA: '{a} это сколько частей по {u}?', cmpB: '{b} это сколько частей по {u}?', cmpPick: 'Больше частей значит больше. Выбери знак.',
    nlParts: 'На сколько равных частей разделена каждая единица?', nlCount: 'Через сколько делений после {lo} стоит {a}?', nlTap: 'Нажми на это деление.', nlFrom: 'Найди {a} на прямой.', nlJumpTicks: 'Сколько делений в прыжке на {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} в уме = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} меньше, чем {y}, поэтому займи 1 у следующего разряда.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} в уме = ?', colWrite: 'Запиши каждую цифру единиц в клетку, а десятки держи в уме.',
    sortRead: 'Прочитай названия групп.', sortEach: 'Положи каждую карточку в её группу.', orderSmall: 'Сначала найди самое маленькое.', orderBig: 'Сначала найди самое большое.', orderNext: 'Потом следующее, и так далее.',
    eqH1: 'Каждая {f} равна {k} частям по {u}.', eqH2: '{n} таких это {n} × {k} = {m} частей.', eqH3: 'Положи {m} частей по {u} на полоску и нажми «Проверить».',
    shH1: 'Посчитай части полоски: их {d}.', shH2: 'Верхнее число в {a} говорит, сколько закрасить: {n}.', shH3: 'Нажми на {n} частей, чтобы закрасить их.',
    cmpH1: 'Посмотри на две полоски: какая длиннее?', cmpH2: 'Раздели обе на части по {u} и посчитай.', cmpH3: '{a} это {x} частей, а {b} это {y} частей.',
    nlH1: 'Каждая единица разделена на {sub} частей.', nlH2: '{a} стоит через {t} делений после {lo}.', nlH3: 'Отсчитай {t} делений от {lo} и нажми.', nlJH2: 'Прыжок на {b} это {t} делений.', nlJH3: 'Начни с {a} и отсчитай {t} делений.',
    colH1: 'Начни с разряда единиц, справа.', colH2add: 'Если в разряде 10 или больше, перенеси 1 в следующий.', colH2sub: 'Если верхняя цифра меньше, займи 1 у следующего разряда.', colH2mul: 'Умножь каждую цифру и прибавь то, что держал в уме.', colH3: 'Цифра единиц в ответе: {d}.',
    sortH1: 'Прочитай название каждой группы.', sortH2: 'Проверяй по одной карточке.', sortH3: '{t} идёт в группу: {g}.', orderH2: 'Сравнивай по две карточки.', orderH3: 'Первое: {t}.',
    fbEmpty: 'Пока здесь ничего нет.', fbNotThese: 'Используй только части по {u}.', fbMore: 'Пока не хватает.', fbLess: 'Немного слишком много.', fbPick: 'Сначала выбери знак.', fbSign: 'Посмотри ещё раз на два размера.',
    fbTap: 'Сначала нажми на деление.', fbRight: 'Чуть правее.', fbLeft: 'Чуть левее.', fbFill: 'Заполни этот разряд: {place}.', fbCol: 'Посмотри ещё раз на этот разряд: {place}.',
    fbSortAll: 'Положи каждую карточку в группу.', fbSortWrong: 'Карточек не в своей группе: {n}.', fbOrderAll: 'Заполни каждое место.', fbOrderWrong: 'Пока не по порядку.',
    binEven: 'Чётные', binOdd: 'Нечётные', binLess: 'Меньше {n}', binAtLeast: '{n} и больше', binMult: 'Кратные {n}', binNotMult: 'Не кратные {n}',
    ones: 'Единицы', tens: 'Десятки', hundreds: 'Сотни', thousands: 'Тысячи', tenThousands: 'Десятки тысяч',
  },
  ja: {
    watch: '見る', count: '数える', guided: 'ヒントあり', own: 'ひとりで', keypad: 'すうじ', problemOf: 'もんだい {n} / {total}',
    readAloud: 'もんだいを読み上げる', steps: 'ステップ', showSteps: 'ステップを見る', hideSteps: 'ステップをかくす', check: 'たしかめる', next: 'つぎへ',
    hint: 'ヒント', stuck: 'こまった？', clear: 'けす', hintOf: 'ヒント {n} / {total}', noMoreHints: 'これが最後のヒントです。やってみて「たしかめる」をおしてね。',
    right: 'せいかい！', notYet: 'まだだよ。', tryAgain: 'もう一度やってみよう。', shown: 'こうするとできるよ。つぎのもんだいへ。',
    watchNow: 'やり方を見てみよう。', youTry: 'こんどはきみ', toGo: 'あと {n}', endH: '{total} もん中 {right} もんせいかい', endAll: 'ぜんぶせいかい。すごい！',
    endSome: 'よくがんばったね。れんしゅうするともっとかんたんになるよ。', newSet: '新しいもんだい', again: 'もう一度', back: 'もどる', target: 'おてほん', yours: 'きみの',
    pieces: 'ピース', placed: '{n} こおいた', box: 'こたえのマス', del: 'けす', up: '1 ふやす', down: '1 へらす', task: 'もんだい', workspace: 'さぎょうスペース',
    groups: 'グループ', tiles: 'カード', order: 'じゅんばん', pickTile: 'カードをえらんで、おく場所をえらぼう。', board: '黒板',
    eqTask: '{u} のピースで {a} をつくろう。', eqQ: 'きみのテープは {a} と同じ？', shTask: 'テープの {a} をぬろう。', shQ: '{a} をぬれたかな？',
    cmpTask: '{a} と {b}、大きいのはどっち？', cmpQ: '<、=、> をえらぼう。', nlTask: '数直線の {a} に点をうとう。', nlJump: '{a} から {b} すすむと、どこにつく？',
    nlQ: 'めもりをタップしよう。', addTask: '{a} + {b} を計算しよう。', subTask: '{a} − {b} を計算しよう。', mulTask: '{a} × {b} を計算しよう。', digQ: 'こたえを書こう。一の位は右だよ。',
    sortTask: 'カードをグループに分けよう。', sortQ: 'カードはぜんぶ正しいグループにある？', orderUp: '小さいじゅんにならべよう。', orderDown: '大きいじゅんにならべよう。', orderQ: 'じゅんばんになってる？',
    pressCheck: '「たしかめる」をおそう。', eqOne: '{u} のピースがいくつで {f} になる？', eqMany: 'では {a} は {u} のピースいくつ分？', eqDrag: '{u} のピースを {m} こテープにおこう。',
    shCut: 'テープは同じ大きさにいくつに分かれている？', shCount: '{a} ならいくつぬる？', shTap: '{n} こタップしよう。',
    cmpA: '{a} は {u} のピースいくつ分？', cmpB: '{b} は {u} のピースいくつ分？', cmpPick: 'ピースが多いほうが大きいよ。記号をえらぼう。',
    nlParts: '1 は同じ大きさにいくつに分かれている？', nlCount: '{a} は {lo} からいくつめのめもり？', nlTap: 'そのめもりをタップしよう。', nlFrom: '数直線で {a} を見つけよう。', nlJumpTicks: '{b} すすむのはめもりいくつ分？',
    colAdd: '{place}：{x} + {y} = ?', colAddC: '{place}：{x} + {y} + くり上がり {c} = ?', colSub: '{place}：{x} − {y} = ?', colBorrow: '{place}：{x} は {y} より小さいので、となりの位から 1 くり下げよう。',
    colMul: '{place}：{x} × {y} = ?', colMulC: '{place}：{x} × {y} + くり上がり {c} = ?', colWrite: '一の位の数をマスに書いて、十の位はくり上げよう。',
    sortRead: 'グループの名前を読もう。', sortEach: 'カードをそれぞれのグループに入れよう。', orderSmall: 'まず一番小さいのを見つけよう。', orderBig: 'まず一番大きいのを見つけよう。', orderNext: 'つぎはそのつぎ、というようにならべよう。',
    eqH1: '{f} 1 つは {u} のピース {k} こ分だよ。', eqH2: 'それが {n} こで {n} × {k} = {m} こ分。', eqH3: '{u} のピースを {m} こおいて「たしかめる」をおそう。',
    shH1: 'テープの数を数えよう：{d} こあるね。', shH2: '{a} の上の数がぬる数だよ：{n}。', shH3: '{n} こタップしてぬろう。',
    cmpH1: '2 本のテープを見よう。どっちが長い？', cmpH2: 'どちらも {u} のピースに分けて数えよう。', cmpH3: '{a} は {x} こ、{b} は {y} こ分だよ。',
    nlH1: '1 は {sub} こに分かれているよ。', nlH2: '{a} は {lo} から {t} めもりめ。', nlH3: '{lo} から {t} めもり数えてタップしよう。', nlJH2: '{b} すすむのは {t} めもり分。', nlJH3: '{a} から {t} めもり数えよう。',
    colH1: '右の一の位からはじめよう。', colH2add: '10 以上になったら、となりの位に 1 くり上げよう。', colH2sub: '上の数が小さいときは、となりの位から 1 くり下げよう。', colH2mul: 'それぞれの数をかけて、くり上がりをたそう。', colH3: 'こたえの一の位は {d} だよ。',
    sortH1: 'それぞれのグループの名前を読もう。', sortH2: 'カードを 1 まいずつたしかめよう。', sortH3: '{t} は {g} に入るよ。', orderH2: 'カードを 2 まいずつくらべよう。', orderH3: '最初は {t} だよ。',
    fbEmpty: 'まだ何もないよ。', fbNotThese: '{u} のピースだけをつかおう。', fbMore: 'まだたりないよ。', fbLess: 'ちょっと多すぎるよ。', fbPick: 'まず記号をえらぼう。', fbSign: '2 つの大きさをもう一度見てみよう。',
    fbTap: 'まずめもりをタップしよう。', fbRight: 'もう少し右だよ。', fbLeft: 'もう少し左だよ。', fbFill: 'この位をうめよう：{place}。', fbCol: 'この位をもう一度見てみよう：{place}。',
    fbSortAll: 'カードをぜんぶグループに入れよう。', fbSortWrong: 'ちがうグループにあるカード：{n}。', fbOrderAll: 'ぜんぶの場所をうめよう。', fbOrderWrong: 'まだじゅんばんになっていないよ。',
    binEven: 'ぐう数', binOdd: 'き数', binLess: '{n} より小さい', binAtLeast: '{n} 以上', binMult: '{n} のばい数', binNotMult: '{n} のばい数ではない',
    ones: '一の位', tens: '十の位', hundreds: '百の位', thousands: '千の位', tenThousands: '一万の位',
  },
  'zh-Hant': {
    watch: '看示範', count: '往上數', guided: '有提示', own: '自己來', keypad: '數字鍵', problemOf: '第 {n} 題，共 {total} 題',
    readAloud: '朗讀題目', steps: '步驟', showSteps: '顯示步驟', hideSteps: '隱藏步驟', check: '檢查', next: '下一題',
    hint: '提示', stuck: '卡住了？', clear: '清除', hintOf: '提示 {n} / {total}', noMoreHints: '這是最後一個提示了。試試看，然後按「檢查」。',
    right: '答對了！', notYet: '還沒有喔。', tryAgain: '再試一次。', shown: '可以這樣做。我們做下一題。',
    watchNow: '看看怎麼做。', youTry: '換你試試', toGo: '還有 {n} 題', endH: '{total} 題答對 {right} 題', endAll: '全部答對，太棒了！',
    endSome: '做得好。多練習就會更容易。', newSet: '做新的題目', again: '再做一次', back: '返回', target: '目標', yours: '你的',
    pieces: '小塊', placed: '已放 {n} 塊', box: '答案格', del: '刪除', up: '多一', down: '少一', task: '題目', workspace: '工作區',
    groups: '分組', tiles: '卡片', order: '順序', pickTile: '先選一張卡片，再選它的位置。', board: '黑板',
    eqTask: '用 {u} 的小塊拼出 {a}。', eqQ: '你的長條和 {a} 一樣嗎？', shTask: '把長條的 {a} 塗上顏色。', shQ: '你塗了 {a} 嗎？',
    cmpTask: '{a} 和 {b}，哪個比較大？', cmpQ: '選 <、= 或 >。', nlTask: '在數線上的 {a} 點一個點。', nlJump: '從 {a} 開始，往前跳 {b}，會到哪裡？',
    nlQ: '點一下正確的刻度。', addTask: '算一算 {a} + {b}。', subTask: '算一算 {a} − {b}。', mulTask: '算一算 {a} × {b}。', digQ: '寫出答案，個位在右邊。',
    sortTask: '把卡片分到各組。', sortQ: '每張卡片都在正確的組嗎？', orderUp: '從小到大排好。', orderDown: '從大到小排好。', orderQ: '排好順序了嗎？',
    pressCheck: '按「檢查」。', eqOne: '幾塊 {u} 等於 {f}？', eqMany: '那麼 {a} 是幾塊 {u}？', eqDrag: '在長條上放 {m} 塊 {u}。',
    shCut: '長條被分成幾等份？', shCount: '{a} 要塗幾份？', shTap: '點 {n} 份。',
    cmpA: '{a} 是幾塊 {u}？', cmpB: '{b} 是幾塊 {u}？', cmpPick: '塊數越多就越大。選出符號。',
    nlParts: '每個 1 被分成幾等份？', nlCount: '{a} 在 {lo} 後面第幾個刻度？', nlTap: '點那個刻度。', nlFrom: '在數線上找到 {a}。', nlJumpTicks: '往前跳 {b} 是幾個刻度？',
    colAdd: '{place}：{x} + {y} = ?', colAddC: '{place}：{x} + {y} + 進位 {c} = ?', colSub: '{place}：{x} − {y} = ?', colBorrow: '{place}：{x} 比 {y} 小，所以向下一位借 1。',
    colMul: '{place}：{x} × {y} = ?', colMulC: '{place}：{x} × {y} + 進位 {c} = ?', colWrite: '把每個個位數寫進格子裡，十位數進位。',
    sortRead: '讀一讀每一組的名稱。', sortEach: '把每張卡片放進它的組。', orderSmall: '先找出最小的。', orderBig: '先找出最大的。', orderNext: '再找下一個，依此類推。',
    eqH1: '每個 {f} 等於 {k} 塊 {u}。', eqH2: '{n} 個就是 {n} × {k} = {m} 塊。', eqH3: '在長條上放 {m} 塊 {u}，然後按「檢查」。',
    shH1: '數一數長條有幾份：共有 {d} 份。', shH2: '{a} 上面的數字是要塗的份數：{n}。', shH3: '點 {n} 份把它們塗上顏色。',
    cmpH1: '看看兩個長條：哪個比較長？', cmpH2: '把兩個都分成 {u} 的小塊再數一數。', cmpH3: '{a} 是 {x} 塊，{b} 是 {y} 塊。',
    nlH1: '每個 1 被分成 {sub} 份。', nlH2: '{a} 在 {lo} 後面第 {t} 個刻度。', nlH3: '從 {lo} 數 {t} 個刻度再點。', nlJH2: '跳 {b} 是 {t} 個刻度。', nlJH3: '從 {a} 開始數 {t} 個刻度。',
    colH1: '從右邊的個位開始。', colH2add: '一位加起來是 10 或更多，就向前一位進 1。', colH2sub: '上面的數字比較小，就向下一位借 1。', colH2mul: '每一位相乘，再加上進位。', colH3: '答案的個位數是 {d}。',
    sortH1: '讀一讀每一組的名稱。', sortH2: '一次檢查一張卡片。', sortH3: '{t} 放在：{g}。', orderH2: '一次比較兩張卡片。', orderH3: '第一個是 {t}。',
    fbEmpty: '這裡還沒有東西。', fbNotThese: '只用 {u} 的小塊。', fbMore: '還不夠。', fbLess: '有一點太多了。', fbPick: '先選一個符號。', fbSign: '再看看兩個的大小。',
    fbTap: '先點一個刻度。', fbRight: '再往右一點。', fbLeft: '再往左一點。', fbFill: '把這一位填好：{place}。', fbCol: '再看看這一位：{place}。',
    fbSortAll: '把每張卡片都放進一組。', fbSortWrong: '放錯組的卡片：{n} 張。', fbOrderAll: '把每個位置都填好。', fbOrderWrong: '還沒有排好順序。',
    binEven: '雙數', binOdd: '單數', binLess: '小於 {n}', binAtLeast: '{n} 或更多', binMult: '{n} 的倍數', binNotMult: '不是 {n} 的倍數',
    ones: '個位', tens: '十位', hundreds: '百位', thousands: '千位', tenThousands: '萬位',
  },
  ar: {
    watch: 'شاهد', count: 'عُدّ', guided: 'بمساعدة', own: 'وحدي', keypad: 'الأرقام', problemOf: 'المسألة {n} من {total}',
    readAloud: 'اقرأ المهمة بصوت عالٍ', steps: 'الخطوات', showSteps: 'أظهر الخطوات', hideSteps: 'أخفِ الخطوات', check: 'تحقّق', next: 'التالي',
    hint: 'تلميح', stuck: 'محتار؟', clear: 'امسح', hintOf: 'تلميح {n} من {total}', noMoreHints: 'كان هذا آخر تلميح. حاول ثم اضغط تحقّق.',
    right: 'صحيح!', notYet: 'ليس بعد.', tryAgain: 'حاول مرة أخرى.', shown: 'هذه طريقة لحلّها. إلى المسألة التالية.',
    watchNow: 'شاهد كيف تُحلّ.', youTry: 'جرّب أنت الآن', toGo: 'بقي {n}', endH: '{right} من {total} صحيحة', endAll: 'كلها صحيحة. رائع!',
    endSome: 'عمل جيد. التمرين يجعلها أسهل.', newSet: 'جرّب مسائل جديدة', again: 'مرة أخرى', back: 'رجوع', target: 'الهدف', yours: 'لك',
    pieces: 'القطع', placed: 'وُضعت {n}', box: 'خانة الإجابة', del: 'احذف', up: 'واحد أكثر', down: 'واحد أقل', task: 'المهمة', workspace: 'مساحة العمل',
    groups: 'المجموعات', tiles: 'البطاقات', order: 'الترتيب', pickTile: 'اختر بطاقة ثم مكانها.', board: 'السبورة',
    eqTask: 'كوّن {a} بقطع من {u}.', eqQ: 'هل شريطك يساوي {a}؟', shTask: 'لوّن {a} من الشريط.', shQ: 'هل لوّنت {a}؟',
    cmpTask: 'أيهما أكبر: {a} أم {b}؟', cmpQ: 'اختر < أو = أو >.', nlTask: 'ضع نقطة عند {a} على خط الأعداد.', nlJump: 'ابدأ عند {a} واقفز {b} إلى الأمام. أين تصل؟',
    nlQ: 'اضغط على العلامة الصحيحة.', addTask: 'احسب {a} + {b}.', subTask: 'احسب {a} − {b}.', mulTask: 'احسب {a} × {b}.', digQ: 'اكتب الناتج، الآحاد على اليمين.',
    sortTask: 'صنّف البطاقات في المجموعات.', sortQ: 'هل كل بطاقة في مجموعتها الصحيحة؟', orderUp: 'رتّبها من الأصغر إلى الأكبر.', orderDown: 'رتّبها من الأكبر إلى الأصغر.', orderQ: 'هل هي مرتّبة؟',
    pressCheck: 'اضغط تحقّق.', eqOne: 'كم قطعة من {u} تساوي {f}؟', eqMany: 'إذن {a} تساوي كم قطعة من {u}؟', eqDrag: 'ضع {m} قطع من {u} على شريطك.',
    shCut: 'كم جزءًا متساويًا في الشريط؟', shCount: 'كم جزءًا تلوّن لـ {a}؟', shTap: 'اضغط على {n} أجزاء.',
    cmpA: '{a} تساوي كم قطعة من {u}؟', cmpB: '{b} تساوي كم قطعة من {u}؟', cmpPick: 'قطع أكثر تعني أكبر. اختر الإشارة.',
    nlParts: 'إلى كم جزءًا متساويًا قُسّم كل واحد صحيح؟', nlCount: 'كم علامة بعد {lo} يقع {a}؟', nlTap: 'اضغط على تلك العلامة.', nlFrom: 'جد {a} على الخط.', nlJumpTicks: 'كم علامة في قفزة مقدارها {b}؟',
    colAdd: '{place}: {x} + {y} = ؟', colAddC: '{place}: {x} + {y} + {c} محمول = ؟', colSub: '{place}: {x} − {y} = ؟', colBorrow: '{place}: {x} أصغر من {y}، فاستلف 1 من الخانة التالية.',
    colMul: '{place}: {x} × {y} = ؟', colMulC: '{place}: {x} × {y} + {c} محمول = ؟', colWrite: 'اكتب رقم الآحاد في خانته واحمل العشرات.',
    sortRead: 'اقرأ المجموعات.', sortEach: 'ضع كل بطاقة في مجموعتها.', orderSmall: 'جد الأصغر أولًا.', orderBig: 'جد الأكبر أولًا.', orderNext: 'ثم التالي، وهكذا.',
    eqH1: 'كل {f} تساوي {k} قطع من {u}.', eqH2: '{n} منها تساوي {n} × {k} = {m} قطع.', eqH3: 'ضع {m} قطع من {u} على شريطك ثم اضغط تحقّق.',
    shH1: 'عُدّ أجزاء الشريط: عددها {d}.', shH2: 'العدد العلوي في {a} يقول كم تلوّن: {n}.', shH3: 'اضغط على {n} أجزاء لتلوينها.',
    cmpH1: 'انظر إلى الشريطين: أيهما أطول؟', cmpH2: 'قسّم الاثنين إلى قطع من {u} وعُدّ.', cmpH3: '{a} تساوي {x} قطع و{b} تساوي {y} قطع.',
    nlH1: 'كل واحد صحيح مقسّم إلى {sub} أجزاء.', nlH2: '{a} يقع بعد {lo} بـ {t} علامات.', nlH3: 'عُدّ {t} علامات من {lo} ثم اضغط.', nlJH2: 'قفزة مقدارها {b} تساوي {t} علامات.', nlJH3: 'ابدأ عند {a} وعُدّ {t} علامات.',
    colH1: 'ابدأ بخانة الآحاد على اليمين.', colH2add: 'إذا كان مجموع الخانة 10 أو أكثر فاحمل 1 إلى التالية.', colH2sub: 'إذا كان الرقم العلوي أصغر فاستلف 1 من الخانة التالية.', colH2mul: 'اضرب كل رقم ثم أضف المحمول.', colH3: 'رقم آحاد الناتج هو {d}.',
    sortH1: 'اقرأ اسم كل مجموعة.', sortH2: 'تحقّق من بطاقة واحدة في كل مرة.', sortH3: '{t} تذهب إلى: {g}.', orderH2: 'قارن بطاقتين في كل مرة.', orderH3: 'الأول هو {t}.',
    fbEmpty: 'لا يوجد شيء بعد.', fbNotThese: 'استخدم قطع {u} فقط.', fbMore: 'ليس كافيًا بعد.', fbLess: 'هذا أكثر قليلًا.', fbPick: 'اختر إشارة أولًا.', fbSign: 'انظر مرة أخرى إلى الحجمين.',
    fbTap: 'اضغط على علامة أولًا.', fbRight: 'أبعد قليلًا إلى اليمين.', fbLeft: 'أبعد قليلًا إلى اليسار.', fbFill: 'املأ هذه الخانة: {place}.', fbCol: 'انظر مرة أخرى إلى هذه الخانة: {place}.',
    fbSortAll: 'ضع كل بطاقة في مجموعة.', fbSortWrong: 'بطاقات في المجموعة الخطأ: {n}.', fbOrderAll: 'املأ كل مكان.', fbOrderWrong: 'ليست مرتّبة بعد.',
    binEven: 'زوجي', binOdd: 'فردي', binLess: 'أقل من {n}', binAtLeast: '{n} أو أكثر', binMult: 'من مضاعفات {n}', binNotMult: 'ليس من مضاعفات {n}',
    ones: 'الآحاد', tens: 'العشرات', hundreds: 'المئات', thousands: 'الآلاف', tenThousands: 'عشرات الآلاف',
  },
  he: {
    watch: 'צפייה', count: 'ספירה', guided: 'עם עזרה', own: 'לבד', keypad: 'ספרות', problemOf: 'תרגיל {n} מתוך {total}',
    readAloud: 'הקראת המשימה', steps: 'שלבים', showSteps: 'הצגת השלבים', hideSteps: 'הסתרת השלבים', check: 'בדיקה', next: 'הבא',
    hint: 'רמז', stuck: 'נתקעת?', clear: 'ניקוי', hintOf: 'רמז {n} מתוך {total}', noMoreHints: 'זה היה הרמז האחרון. נסו ואז לחצו על בדיקה.',
    right: 'נכון!', notYet: 'עוד לא.', tryAgain: 'נסו שוב.', shown: 'זו דרך אחת לפתור. ממשיכים לבא.',
    watchNow: 'צפו איך עושים את זה.', youTry: 'עכשיו תורכם', toGo: 'נשארו {n}', endH: '{right} מתוך {total} נכונים', endAll: 'הכול נכון. מצוין!',
    endSome: 'עבודה טובה. תרגול עושה את זה קל יותר.', newSet: 'לנסות חדשים', again: 'שוב', back: 'חזרה', target: 'המטרה', yours: 'שלכם',
    pieces: 'חלקים', placed: 'הונחו {n}', box: 'תיבת תשובה', del: 'מחיקה', up: 'עוד אחד', down: 'אחד פחות', task: 'משימה', workspace: 'משטח עבודה',
    groups: 'קבוצות', tiles: 'כרטיסים', order: 'סדר', pickTile: 'בחרו כרטיס, ואז את המקום שלו.', board: 'לוח',
    eqTask: 'בנו את {a} מחלקים של {u}.', eqQ: 'האם הפס שלכם שווה ל־{a}?', shTask: 'צבעו {a} מהפס.', shQ: 'צבעתם {a}?',
    cmpTask: 'מה גדול יותר: {a} או {b}?', cmpQ: 'בחרו <, = או >.', nlTask: 'שימו נקודה ב־{a} על ציר המספרים.', nlJump: 'התחילו ב־{a} וקפצו קדימה {b}. לאן הגעתם?',
    nlQ: 'לחצו על השנתה הנכונה.', addTask: 'חשבו {a} + {b}.', subTask: 'חשבו {a} − {b}.', mulTask: 'חשבו {a} × {b}.', digQ: 'כתבו את התשובה, האחדות מימין.',
    sortTask: 'מיינו את הכרטיסים לקבוצות.', sortQ: 'כל כרטיס בקבוצה הנכונה?', orderUp: 'סדרו מהקטן לגדול.', orderDown: 'סדרו מהגדול לקטן.', orderQ: 'הם מסודרים?',
    pressCheck: 'לחצו על בדיקה.', eqOne: 'כמה חלקים של {u} הם {f}?', eqMany: 'אז {a} הם כמה חלקים של {u}?', eqDrag: 'שימו {m} חלקים של {u} על הפס.',
    shCut: 'לכמה חלקים שווים מחולק הפס?', shCount: 'כמה חלקים צובעים בשביל {a}?', shTap: 'לחצו על {n} חלקים.',
    cmpA: '{a} הם כמה חלקים של {u}?', cmpB: '{b} הם כמה חלקים של {u}?', cmpPick: 'יותר חלקים זה גדול יותר. בחרו את הסימן.',
    nlParts: 'לכמה חלקים שווים מחולקת כל שלמה?', nlCount: 'כמה שנתות אחרי {lo} נמצא {a}?', nlTap: 'לחצו על השנתה הזו.', nlFrom: 'מצאו את {a} על הציר.', nlJumpTicks: 'כמה שנתות היא קפיצה של {b}?',
    colAdd: '{place}: {x} + {y} = ?', colAddC: '{place}: {x} + {y} + {c} שהעברנו = ?', colSub: '{place}: {x} − {y} = ?', colBorrow: '{place}: {x} קטן מ־{y}, אז פורטים 1 מהעמודה הבאה.',
    colMul: '{place}: {x} × {y} = ?', colMulC: '{place}: {x} × {y} + {c} שהעברנו = ?', colWrite: 'כתבו כל ספרת אחדות בתיבה שלה והעבירו את העשרות.',
    sortRead: 'קראו את שמות הקבוצות.', sortEach: 'שימו כל כרטיס בקבוצה שלו.', orderSmall: 'מצאו קודם את הקטן ביותר.', orderBig: 'מצאו קודם את הגדול ביותר.', orderNext: 'אחר כך את הבא, וכן הלאה.',
    eqH1: 'כל {f} שווה ל־{k} חלקים של {u}.', eqH2: '{n} כאלה הם {n} × {k} = {m} חלקים.', eqH3: 'שימו {m} חלקים של {u} על הפס ולחצו על בדיקה.',
    shH1: 'ספרו את חלקי הפס: יש {d}.', shH2: 'המספר העליון של {a} אומר כמה לצבוע: {n}.', shH3: 'לחצו על {n} חלקים כדי לצבוע אותם.',
    cmpH1: 'הסתכלו על שני הפסים: איזה ארוך יותר?', cmpH2: 'חלקו את שניהם לחלקים של {u} וספרו.', cmpH3: '{a} הם {x} חלקים ו־{b} הם {y} חלקים.',
    nlH1: 'כל שלמה מחולקת ל־{sub} חלקים.', nlH2: '{a} נמצא {t} שנתות אחרי {lo}.', nlH3: 'ספרו {t} שנתות מ־{lo} ולחצו.', nlJH2: 'קפיצה של {b} היא {t} שנתות.', nlJH3: 'התחילו ב־{a} וספרו {t} שנתות.',
    colH1: 'מתחילים בעמודת האחדות, מימין.', colH2add: 'אם בעמודה יוצא 10 או יותר, מעבירים 1 לעמודה הבאה.', colH2sub: 'אם הספרה העליונה קטנה יותר, פורטים 1 מהעמודה הבאה.', colH2mul: 'כופלים כל ספרה ומוסיפים את מה שהעברנו.', colH3: 'ספרת האחדות של התשובה היא {d}.',
    sortH1: 'קראו את השם של כל קבוצה.', sortH2: 'בדקו כרטיס אחד בכל פעם.', sortH3: '{t} שייך ל: {g}.', orderH2: 'השוו שני כרטיסים בכל פעם.', orderH3: 'הראשון הוא {t}.',
    fbEmpty: 'עדיין אין כאן כלום.', fbNotThese: 'השתמשו רק בחלקים של {u}.', fbMore: 'עדיין לא מספיק.', fbLess: 'זה קצת יותר מדי.', fbPick: 'בחרו קודם סימן.', fbSign: 'הסתכלו שוב על שני הגדלים.',
    fbTap: 'לחצו קודם על שנתה.', fbRight: 'עוד קצת ימינה.', fbLeft: 'עוד קצת שמאלה.', fbFill: 'מלאו את העמודה הזו: {place}.', fbCol: 'הסתכלו שוב על העמודה הזו: {place}.',
    fbSortAll: 'שימו כל כרטיס בקבוצה.', fbSortWrong: 'כרטיסים בקבוצה הלא נכונה: {n}.', fbOrderAll: 'מלאו כל מקום.', fbOrderWrong: 'עדיין לא מסודרים.',
    binEven: 'זוגי', binOdd: 'אי־זוגי', binLess: 'פחות מ־{n}', binAtLeast: '{n} ומעלה', binMult: 'כפולה של {n}', binNotMult: 'לא כפולה של {n}',
    ones: 'אחדות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים', tenThousands: 'עשרות אלפים',
  },
};
const WORD_LANGS = Object.keys(WORDS);
/** The table for a site language: the language, its base ('en-GB' -> 'en'), then English, key by key. */
function wordsFor(lang) {
  const l = String(lang || 'en'), base = WORDS[l] || WORDS[l.split('-')[0]] || {};
  return new Proxy(base, { get: (o, k) => (typeof k === 'string' && o[k] != null ? o[k] : WORDS.en[k]), has: (o, k) => k in WORDS.en });
}

// ---- style.js
// Oomba Canvas: the look. A game runs in an opaque sandbox frame and cannot load the site's CSS, so the site's colour
// tokens (public/css/app.css :root and its two dark blocks) and the dashboard's fraction look (public/css/dash.css .dt-*)
// are COPIED here and frozen with the kit version (tests/unit/canvas-kit.test.js compares them with app.css). The kit
// puts this in a <style> of its own; scripts/build-canvas.js also writes it next to the kit as oomba-canvas.css.
// Theme: the site's (BRB.theme -> html[data-oc-theme]), else the device's.
const LIGHT = '--bg:#F4F1E6;--card:#FFFDF2;--card-2:#F9F6EB;--line:#E2DDCB;--edge:#8A8573;--text:#141414;--text-2:#3B3A35;--muted:#5B584F;--accent:#66C792;--accent-press:#1F9D63;--accent-soft:#E1F1E1;--accent-ink:#0F5A37;--spark:#FFD23F;--spark-soft:#FFF3C4;--warn-bg:#FFF0B8;--warn-ink:#6B4C00;--bad-bg:#F9E3DC;--bad-ink:#A12A20;--focus:#141414;--shadow:0 1px 0 rgba(20,20,20,.04),0 4px 16px rgba(20,20,20,.06);color-scheme:light';
const DARK = '--bg:#141414;--card:#1E1E1B;--card-2:#262622;--line:#36352F;--edge:#7E796C;--text:#FFFDF2;--text-2:#E3DED0;--muted:#B8B3A1;--accent-soft:#1E3326;--accent-ink:#9EDDBA;--spark-soft:#352E14;--warn-bg:#3A3113;--warn-ink:#FFD23F;--bad-bg:#3B201C;--bad-ink:#FFA294;--focus:#FFD23F;--shadow:0 1px 0 rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.32);color-scheme:dark';
const TOKENS = { light: LIGHT, dark: DARK };
const CSS = `:root{${LIGHT};--r:20px;--r-sm:12px;--font:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Hebrew","Noto Sans Arabic",sans-serif;
--c0:color-mix(in srgb,var(--accent) 88%,var(--card));--c1:color-mix(in srgb,var(--spark) 92%,var(--card));--c2:color-mix(in srgb,#5AA9D6 88%,var(--card));--grid:color-mix(in srgb,var(--line) 60%,transparent)}
@media (prefers-color-scheme:dark){:root:not([data-oc-theme="light"]){${DARK}}}
:root[data-oc-theme="dark"]{${DARK}}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--card);color:var(--text);font:500 17px/1.45 var(--font);-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
.oc{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh;background-color:var(--card);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:28px 28px}
.oc-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:8px max(14px,env(safe-area-inset-right)) 8px max(14px,env(safe-area-inset-left));background:var(--card);border-bottom:2px solid var(--line)}
.oc-strip h1{margin:0;font-size:1.15rem;font-weight:800;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oc-grow{flex:1 1 auto}
.oc-chip{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 12px;border-radius:999px;font-weight:700;font-size:.9rem;white-space:nowrap;background:var(--card-2);font-variant-numeric:tabular-nums}
.oc-sup,.oc-ok{background:color-mix(in srgb,var(--accent) 22%,var(--card));color:var(--accent-ink)}
.oc-no{background:var(--bad-bg);color:var(--bad-ink)}
.oc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;min-width:48px;padding:0 20px;border-radius:999px;border:0;font:700 1rem var(--font);cursor:pointer;background:var(--card);color:var(--text);box-shadow:inset 0 0 0 2px var(--line);white-space:nowrap;touch-action:manipulation}
.oc-btn:hover:not(:disabled){background:var(--card-2)}
.oc-btn:active:not(:disabled){transform:translateY(1px)}
.oc-btn:disabled{opacity:.5;cursor:default}
.oc-btn:focus-visible,.oc-tile:focus-visible,.oc-part:focus-visible,.oc-tick:focus-visible,.oc-cell:focus-visible,.oc-box:focus-visible,.oc-slotbox:focus-visible,.oc-binlab:focus-visible,.oc-key:focus-visible,.oc-say:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.oc-sm{min-height:40px;min-width:40px;padding:0 14px;font-size:.92rem}
.oc-primary{background:var(--accent);color:#141414;box-shadow:inset 0 -4px 0 var(--accent-press);min-width:120px}
.oc-primary:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 85%,#fff)}
.oc-lit{background:var(--spark);color:#141414;box-shadow:inset 0 0 0 2px #C99A00}
.oc-task{display:flex;align-items:center;gap:14px;margin:14px 16px 0;padding:14px 18px;background:var(--card);border-radius:var(--r);box-shadow:inset 0 4px 0 #E0699B,0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent),var(--shadow)}
.oc-taskt{min-width:0}
.oc-n{display:block;font-size:.8rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.oc-task p{margin:2px 0 0;font-size:1.45rem;font-weight:800;line-height:1.25}
.oc-say{margin-inline-start:auto;flex:none;width:48px;height:48px;border-radius:999px;border:0;background:var(--card-2);font-size:1.25rem;cursor:pointer}
.oc-main{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;padding:14px 16px;align-items:start}
.oc-card{display:flex;flex-direction:column;gap:12px;min-width:0;background:color-mix(in srgb,var(--card) 88%,transparent);border-radius:var(--r);padding:16px 18px;box-shadow:0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent),var(--shadow)}
.oc-work{min-height:280px;justify-content:center}
.oc-stack{display:flex;flex-direction:column;gap:16px}
.oc-row{display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center;gap:12px}
.oc-lab{display:flex;flex-direction:column;align-items:center;gap:4px}
.oc-lab small{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.oc-lab .oc-frac{font-size:2rem}
.oc-q{color:var(--muted);font-weight:800;font-size:1.6rem}
.oc-big .oc-frac{font-size:2.4rem}
.oc-frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;margin:0 .15em}
.oc-fl{display:block;align-self:stretch;min-width:1.1em;height:.1em;min-height:2px;background:currentColor;margin:.12em 0}
.oc-task .oc-frac,.oc-ask .oc-frac,.oc-steps .oc-frac,.oc-hint .oc-frac,.oc-fb .oc-frac,.oc-binlab .oc-frac{font-size:.85em}
.oc-bar{position:relative;display:flex;width:100%;height:84px;border:3px solid var(--text);border-radius:4px;background:var(--card);overflow:hidden}
.oc-tall{height:96px}
.oc-part{flex:none;height:100%;border:0;border-inline-end:2.5px solid var(--text);background:var(--card);padding:0;font:inherit;color:var(--text);display:grid;place-items:center}
.oc-part:last-child{border-inline-end:0}
button.oc-part{cursor:pointer}
button.oc-part:hover:not(:disabled):not(.oc-on){background:var(--card-2)}
.oc-on.oc-c0{background:var(--c0)}.oc-on.oc-c1{background:var(--c1)}.oc-on.oc-c2{background:var(--c2)}
.oc-part .oc-frac{font-size:1rem;color:#141414}
.oc-slot{flex:none;height:calc(100% - 8px);margin:4px 0;border:2px dashed color-mix(in srgb,var(--text) 35%,transparent);border-radius:3px}
.oc-barwrap{position:relative}
.oc-guide{position:absolute;top:-10px;bottom:-10px;width:0;border-inline-start:3px dashed #2F6F5E;pointer-events:none}
.oc-tray{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:var(--r-sm);background:var(--card-2);border:2px dashed var(--line);min-height:76px}
.oc-tray b{font-size:.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-inline-end:4px}
.oc-tile{position:relative;display:inline-grid;place-items:center;min-width:56px;min-height:56px;padding:4px 10px;border:3px solid var(--text);border-radius:6px;background:var(--card);color:#141414;font:800 1.15rem var(--font);cursor:grab;touch-action:none;user-select:none}
.oc-tile.oc-c1{background:var(--c1)}.oc-tile.oc-c2{background:var(--c2)}
.oc-word{color:var(--text);background:var(--card)}
.oc-tile:disabled{cursor:default}
.oc-sel{box-shadow:0 0 0 4px #5AA9D6}
.oc-ghost{position:fixed;z-index:50;pointer-events:none;transform:rotate(-4deg);box-shadow:0 12px 22px rgba(20,20,20,.28)}
.oc-count{margin-inline-start:auto;font-weight:800}
.oc-signs{display:flex;align-items:center;justify-content:center;gap:18px;font-size:2rem}
.oc-signbtns{display:flex;gap:10px}
.oc-sign{min-width:64px;min-height:64px;font-size:1.8rem;border-radius:16px}
.oc-sign[aria-pressed="true"]{background:var(--text);color:var(--card)}
.oc-line{position:relative;height:120px;margin:0 28px}
.oc-axis{position:absolute;left:-14px;right:-14px;top:50px;height:4px;background:var(--text);border-radius:2px}
.oc-tick{position:absolute;top:22px;width:40px;height:62px;margin-left:-20px;border:0;background:none;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center}
.oc-tick i{display:block;width:3px;height:26px;margin-top:17px;background:var(--text);border-radius:2px}
.oc-tick.oc-whole i{height:40px;margin-top:10px;width:4px}
.oc-tick:hover:not(:disabled) i{background:#5AA9D6}
.oc-tick.oc-on::before{content:"";position:absolute;top:18px;width:26px;height:26px;border-radius:50%;background:var(--c1);border:3px solid var(--text)}
.oc-tick.oc-start::after{content:"";position:absolute;top:21px;width:18px;height:18px;border-radius:50%;background:var(--c2);border:3px solid var(--text)}
.oc-tlab{position:absolute;top:66px;font-weight:800;font-size:1.05rem}
.oc-cols{align-items:center}
.oc-paper{display:inline-flex;flex-direction:column;padding:10px 14px;border-radius:var(--r-sm);background:var(--card);box-shadow:0 0 0 1px var(--line)}
.oc-crow{display:flex}
.oc-cell{width:56px;height:56px;display:grid;place-items:center;font:800 1.7rem var(--font);font-variant-numeric:tabular-nums;color:var(--text)}
.oc-cell.oc-sign{color:var(--muted)}
.oc-rule{height:4px;background:var(--text);border-radius:2px;margin:4px 0 6px 56px}
.oc-dbox{border:0;margin:3px;width:50px;height:50px;border-radius:6px;background:var(--card-2);box-shadow:inset 0 0 0 2px var(--edge);cursor:pointer}
.oc-dbox.oc-sel{box-shadow:inset 0 0 0 3px #5AA9D6,0 0 0 3px color-mix(in srgb,#5AA9D6 30%,transparent)}
.oc-bins{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.oc-bin{display:flex;flex-direction:column;gap:8px;min-height:140px;padding:10px;border-radius:var(--r-sm);background:var(--card);box-shadow:inset 0 4px 0 #5AA9D6,0 0 0 2px var(--line)}
.oc-binlab{border:0;background:none;font:800 1.05rem var(--font);color:var(--text);text-align:start;padding:4px 2px;cursor:pointer;min-height:40px}
.oc-binlab:disabled{cursor:default;opacity:1}
.oc-binin{display:flex;flex-wrap:wrap;gap:8px}
.oc-slots{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.oc-slotbox{position:relative;min-width:72px;min-height:72px;border-radius:8px;border:2px dashed var(--edge);background:var(--card);font:800 1.3rem var(--font);color:var(--text);cursor:pointer;display:grid;place-items:center;padding:6px 10px}
.oc-slotbox small{position:absolute;top:2px;inset-inline-start:6px;font-size:.72rem;color:var(--muted)}
.oc-slotbox.oc-full{border-style:solid;border-color:var(--text);background:var(--c1);color:#141414}
.oc-steps{box-shadow:inset 0 4px 0 #9B8CE0,0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent),var(--shadow);background:var(--card)}
.oc-steps-top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.oc-steps h2{margin:0;font-size:1.05rem}
.oc-steps ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.oc-steps li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:start;padding:10px;border-radius:var(--r-sm);background:var(--card-2)}
.oc-k{width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:.9rem;background:var(--card);box-shadow:inset 0 0 0 2px var(--line)}
.oc-done .oc-k{background:var(--accent);color:#141414;box-shadow:none}
.oc-now{background:color-mix(in srgb,#5AA9D6 18%,var(--card))!important;box-shadow:inset 0 0 0 2px #5AA9D6}
.oc-now .oc-k{background:#5AA9D6;color:#fff;box-shadow:none}
.oc-todo{opacity:.7}
.oc-steps p{margin:0;font-weight:700;line-height:1.3}
.oc-ans{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px}
.oc-ans .oc-primary{min-width:0;padding:0 14px}
.oc-box{min-width:48px;height:48px;padding:0 8px;border:0;border-radius:6px;background:var(--card);box-shadow:inset 0 0 0 2px var(--accent);font:800 1.3rem var(--font);color:var(--text);cursor:pointer;font-variant-numeric:tabular-nums}
.oc-box.oc-sel{box-shadow:inset 0 0 0 3px #5AA9D6}
.oc-box.oc-try{box-shadow:inset 0 0 0 3px var(--spark)}
.oc-box:disabled{cursor:default;opacity:1}
.oc-band{position:sticky;bottom:0;z-index:5;background:var(--card);border-top:2px solid var(--line);padding:10px 16px max(12px,env(safe-area-inset-bottom))}
.oc-hint{display:flex;gap:10px;align-items:flex-start;max-width:960px;margin:0 auto 10px;padding:10px 14px;border-radius:var(--r-sm);background:var(--spark-soft);color:var(--text);box-shadow:inset 0 0 0 2px #F5D06B}
.oc-hint b{display:block;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--warn-ink)}
.oc-hint p{margin:2px 0 0}
.oc-fb{max-width:960px;margin:0 auto;font-weight:700}
.oc-fb:empty{display:none}
.oc-fb.oc-good,.oc-fb.oc-try,.oc-fb.oc-shown{margin-bottom:10px;padding:8px 14px;border-radius:var(--r-sm)}
.oc-fb.oc-good{background:var(--accent-soft);color:var(--accent-ink)}
.oc-fb.oc-try{background:var(--warn-bg);color:var(--warn-ink)}
.oc-fb.oc-shown{background:var(--card-2)}
.oc-act{display:flex;align-items:center;gap:10px;max-width:960px;margin:0 auto}
.oc-ask{margin:0;font-size:1.15rem;font-weight:800;flex:1 1 auto;min-width:0}
.oc-btns{display:flex;gap:10px;flex-wrap:wrap}
.oc-keys{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:6px;max-width:960px;margin:10px auto 0}
.oc-key{min-height:52px;border:0;border-radius:12px;background:var(--card-2);box-shadow:inset 0 0 0 2px var(--line);font:800 1.4rem var(--font);color:var(--text);cursor:pointer}
.oc-end{margin:auto;max-width:620px;width:calc(100% - 32px);text-align:center;padding:28px 20px;background:var(--card);border-radius:var(--r);box-shadow:0 0 0 1px var(--line),var(--shadow)}
.oc-end h2{margin:0 0 6px;font-size:2rem}
.oc-end p{margin:0 0 18px;color:var(--muted);font-weight:700}
.oc-end .oc-btns{justify-content:center}
.oc-board{font-size:22px}
.oc-board .oc-task p{font-size:2rem}
@media (max-width:820px){
  .oc-main{grid-template-columns:minmax(0,1fr);padding:10px 12px}
  .oc-task{margin:10px 12px 0;padding:12px 14px}
  .oc-task p{font-size:1.2rem}
  .oc-strip{gap:6px;padding:8px 10px}.oc-strip h1{font-size:1rem;flex:1 1 100%}.oc-chip{min-height:30px;padding:0 9px;font-size:.8rem}
  .oc-grow{display:none}
  .oc-keybtn{margin-inline-start:auto}
  .oc-say{width:40px;height:40px}
  .oc-row{grid-template-columns:56px minmax(0,1fr);gap:8px}
  .oc-lab .oc-frac{font-size:1.5rem}
  .oc-bar{height:64px}.oc-tall{height:72px}
  .oc-tile{min-width:48px;min-height:48px;font-size:1rem}
  .oc-count{flex-basis:100%;margin:0;font-size:.9rem}
  .oc-steps .oc-done,.oc-steps .oc-todo{display:none}
  .oc-steps.oc-closed{padding-block:10px}
  .oc-act{flex-wrap:wrap}.oc-ask{flex-basis:100%;font-size:1.05rem}
  .oc-btns{flex:1 1 100%}.oc-btns .oc-btn{flex:1 1 0;min-width:0;padding:0 10px}
  .oc-cell{width:46px;height:46px;font-size:1.4rem}.oc-dbox{width:40px;height:40px}.oc-rule{margin-left:46px}
  .oc-line{margin:0 16px}.oc-tick{width:28px;margin-left:-14px}
  .oc-signs{font-size:1.5rem;gap:10px}.oc-sign{min-width:52px;min-height:52px}
  .oc-hint{font-size:.92rem}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

// ---- ui.js
// Oomba Canvas: the activity on the page. A task card, a graph-paper workspace with one manipulative, a Steps panel,
// and a bottom band with the problem's question and Check / Hint / Clear. Each student works on their own copy, on
// their own device: their place in the set is kept in their own game save (BRB.storage 'oc-progress-v1'), and nothing
// leaves the device but the end result (BRB.gameOver once per set). Students only tap, drag and type digits (the
// kit's own keypad and digit keys): there is no text field anywhere.

const VERSION = '1.0.0';
const SAVE_KEY = 'oc-progress-v1';
const IDLE_MS = 45000;

const B = () => (typeof window !== 'undefined' && window.BRB) || {};
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return undefined; } };
const sfx = name => call(() => { const s = B().sfx; if (s && s.play) s.play(name); });
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
/** A short signature of the activity, so a saved place is only resumed in the same activity. */
function sigOf(a) { const s = JSON.stringify([a.problems || null, a.gen || null, (a.config || {}).count || null]); let x = 5381; for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0; return x.toString(36); }

/** One stacked fraction (the dashboard's .dt-frac). */
const frac = (n, d) => h('span', { class: 'oc-frac', role: 'img', 'aria-label': `${n}/${d}` }, h('span', { class: 'oc-fn' }, n), h('span', { class: 'oc-fl', 'aria-hidden': 'true' }), h('span', { class: 'oc-fd' }, d));

function activity(input) {
  if (typeof document === 'undefined') return null;
  const A = input && typeof input === 'object' ? input : {};
  const cfg = A.config && typeof A.config === 'object' ? A.config : {};
  const lang = (B().user && B().user.lang) || cfg.lang || 'en', W = wordsFor(lang), dir = (B().user && B().user.dir) || (/^(ar|he)\b/.test(lang) ? 'rtl' : 'ltr');
  const support = SUPPORTS.includes(cfg.support) ? cfg.support : 'guided', board = cfg.board === true;
  const task = A.task && typeof A.task === 'object' ? A.task : {};
  const ownSteps = A.steps && typeof A.steps === 'object' ? A.steps : {}, ownHints = A.hints && typeof A.hints === 'object' ? A.hints : {};

  // ---- words: {name} values are numbers, fractions [n, d], keys of the table, or { k, v } / { text } groups
  const val = v => (Array.isArray(v) && v.length === 2 ? frac(v[0], v[1]) : v && typeof v === 'object' ? (v.text !== undefined ? String(v.text) : rich(v.k, v.v)) : typeof v === 'string' && v in WORDS.en ? W[v] : String(v));
  function rich(key, vars = {}) {
    const out = document.createDocumentFragment(), src = String(W[key] != null ? W[key] : key);
    let at = 0; const re = /\{(\w+)\}/g; let m;
    while ((m = re.exec(src))) { if (m.index > at) out.append(src.slice(at, m.index)); const v = vars[m[1]]; out.append(v === undefined ? m[0] : val(v)); at = m.index + m[0].length; }
    if (at < src.length) out.append(src.slice(at));
    return out;
  }
  const plain = (key, vars = {}) => String(W[key] != null ? W[key] : key).replace(/\{(\w+)\}/g, (m, n) => { const v = vars[n]; return v === undefined ? m : Array.isArray(v) ? `${v[0]}/${v[1]}` : v && typeof v === 'object' ? (v.text !== undefined ? String(v.text) : plain(v.k, v.v)) : typeof v === 'string' && v in WORDS.en ? W[v] : String(v); });
  const T = (k, v) => plain(k, v);

  // ---- the page
  document.documentElement.lang = lang; document.documentElement.dir = dir;
  const theme = B().theme; if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-oc-theme', theme);
  if (!document.getElementById('oc-style')) document.head.append(h('style', { id: 'oc-style' }, CSS));
  loadFont();
  const root = document.getElementById('oc-app') || document.body.appendChild(h('div', { id: 'oc-app' }));
  root.textContent = '';
  const el = {};
  const strip = h('header', { class: 'oc-strip' },
    el.title = h('h1', { dir: 'auto' }, String(task.title || document.title || '').slice(0, 80)),
    h('span', { class: 'oc-chip oc-sup' }, T(support)),
    board ? h('span', { class: 'oc-chip' }, T('board')) : null,
    h('span', { class: 'oc-grow' }),
    el.ok = h('span', { class: 'oc-chip oc-ok' }), el.no = h('span', { class: 'oc-chip oc-no' }), el.left = h('span', { class: 'oc-chip' }),
    el.keyBtn = h('button', { type: 'button', class: 'oc-btn oc-sm oc-keybtn', 'aria-pressed': 'false', 'aria-controls': 'oc-keys', onclick: () => keypad(!S.keys) }, '⌨ ', T('keypad')));
  const canSay = !!(task.say && B().speak);
  const card = h('section', { class: 'oc-task', 'aria-label': T('task') },
    h('div', { class: 'oc-taskt' }, el.n = h('span', { class: 'oc-n' }), el.task = h('p', { id: 'oc-taskline' })),
    canSay ? h('button', { type: 'button', class: 'oc-say', 'aria-label': T('readAloud'), onclick: () => call(() => B().speak(String(task.say).slice(0, 300), { lang: cfg.lang || lang })) }, '🔊') : null);
  el.work = h('section', { class: 'oc-card oc-work', 'aria-label': T('workspace') });
  el.stepsBox = h('aside', { class: 'oc-card oc-steps', 'aria-labelledby': 'oc-steps-h' },
    h('div', { class: 'oc-steps-top' }, h('h2', { id: 'oc-steps-h' }, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('steps')),
      el.stepsToggle = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-expanded': support === 'own' ? 'false' : 'true', 'aria-controls': 'oc-steps-list', onclick: () => { S.stepsOpen = !S.stepsOpen; paintSteps(); } })),
    el.steps = h('ol', { id: 'oc-steps-list' }));
  el.hint = h('div', { class: 'oc-hint', role: 'note', hidden: true });
  el.fb = h('div', { class: 'oc-fb', role: 'status', 'aria-live': 'polite' });
  el.ask = h('p', { class: 'oc-ask' });
  el.check = h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => (S.phase === 'done' ? next() : doCheck()) });
  el.hintBtn = h('button', { type: 'button', class: 'oc-btn', onclick: showHint });
  el.clear = h('button', { type: 'button', class: 'oc-btn', onclick: clear }, '⌫ ', T('clear'));
  el.keys = h('div', { class: 'oc-keys', id: 'oc-keys', hidden: true, dir: 'ltr', role: 'group', 'aria-label': T('keypad') },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => h('button', { type: 'button', class: 'oc-key', onclick: () => typeDigit(+d) }, d)),
    h('button', { type: 'button', class: 'oc-key', 'aria-label': T('del'), onclick: () => typeDigit(null) }, '⌫'));
  const band = h('footer', { class: 'oc-band' }, el.hint, el.fb, h('div', { class: 'oc-act' }, el.ask, h('div', { class: 'oc-btns' }, el.check, el.hintBtn, el.clear)), el.keys);
  el.end = h('section', { class: 'oc-end', hidden: true, 'aria-labelledby': 'oc-end-h' });
  el.main = h('div', { class: 'oc-main' }, el.work, el.stepsBox);
  const shell = h('div', { class: `oc${board ? ' oc-board' : ''}`, 'data-support': support }, strip, card, el.main, band, el.end);
  root.append(shell);

  // ---- the set: fresh per student (a seed of their own, never the same problem twice), and where they were
  const sig = sigOf(A);
  const saved = (() => { const v = call(() => B().storage && B().storage.get(SAVE_KEY)); return v && typeof v === 'object' && v.sig === sig ? v : null; })();
  const S = {
    seed: saved && Number.isInteger(saved.seed) ? saved.seed : (Math.floor(Math.random() * 2 ** 31) || 7), seen: saved && Array.isArray(saved.seen) ? saved.seen.slice(-200) : [],
    set: [], i: 0, right: 0, wrong: 0, st: null, tries: 0, phase: 'work', hintN: 0, stuck: false, keys: false, stepsOpen: support !== 'own', stepVal: [], stepDone: [], sel: null, watching: false, reported: false, idle: 0,
  };
  function dealSet(resume) {
    S.set = deal(A, { seed: S.seed, seen: S.seen });
    S.i = 0; S.right = 0; S.wrong = 0; S.reported = false;
    if (resume && saved && !saved.done && Number.isInteger(saved.i) && saved.i < S.set.length) { S.i = saved.i; S.right = saved.right | 0; S.wrong = saved.wrong | 0; }
    for (const p of S.set) { const k = TOOLS[p.tool].key(p); if (!S.seen.includes(k)) S.seen.push(k); }
  }
  const save = (extra = {}) => call(() => B().storage && B().storage.set(SAVE_KEY, { sig, seed: S.seed, seen: S.seen.slice(-200), i: S.i, right: S.right, wrong: S.wrong, st: S.phase === 'work' ? S.st : null, ...extra }));

  // ---- one problem
  const P = () => S.set[S.i];
  const Tool = () => TOOLS[P().tool];
  function begin(resumeSt) {
    const p = P(), t = Tool();
    S.st = resumeSt && typeof resumeSt === 'object' ? resumeSt : t.start(p); S.tries = 0; S.phase = 'work'; S.hintN = 0; S.stuck = false; S.sel = null; S.idle = Date.now();
    const steps = stepList(p); S.stepVal = steps.map(() => null); S.stepDone = steps.map(() => false);
    el.hint.hidden = true; el.fb.textContent = ''; el.fb.className = 'oc-fb';
    S.watching = support === 'watch' && !resumeSt;
    if (S.watching) { S.st = t.solve(p) || S.st; steps.forEach((s, i) => { if (s.ans !== undefined) { S.stepVal[i] = s.ans; } S.stepDone[i] = true; }); }
    paint();
    if (S.watching) feedback('', rich('watchNow'), { button: [T('youTry'), () => { S.watching = false; S.st = t.start(p); S.stepVal = S.stepVal.map(() => null); S.stepDone = S.stepDone.map(() => false); feedback('', ''); paint(); }] });
  }
  /** The steps of this problem: the Builder's own lines for this tool (text only), or the kit's (with step answers). */
  function stepList(p) {
    const own = ownSteps[p.tool];
    if (Array.isArray(own) && own.length) return own.slice(0, 6).map(s => ({ text: String(s).slice(0, 160) }));
    return TOOLS[p.tool].steps(p);
  }
  function hintList(p) {
    const own = ownHints[p.tool];
    if (Array.isArray(own) && own.length) return own.slice(0, 3).map(s => ({ text: String(s).slice(0, 160) }));
    return TOOLS[p.tool].hints(p).slice(0, 3);
  }
  const line = x => (x.text !== undefined ? document.createTextNode(x.text) : rich(x.k, x.v));

  function paint() {
    const p = P(), t = Tool(), total = S.set.length;
    el.ok.textContent = `✓ ${S.right}`; el.ok.setAttribute('aria-label', `${T('right')} ${S.right}`);
    el.no.textContent = `✗ ${S.wrong}`; el.no.setAttribute('aria-label', `${T('notYet')} ${S.wrong}`);
    el.left.textContent = T('toGo', { n: total - S.i - (S.phase === 'done' ? 1 : 0) });
    el.n.textContent = T('problemOf', { n: S.i + 1, total });
    const tk = t.task(p); el.task.textContent = ''; el.task.append(rich(tk.k, tk.v));
    const q = t.ask(p); el.ask.textContent = ''; el.ask.append(rich(q.k, q.v));
    el.check.textContent = S.phase === 'done' ? `${T('next')} ›` : `✓ ${T('check')}`;
    el.check.disabled = S.watching;
    el.hintBtn.textContent = ''; el.hintBtn.append(S.stuck ? '🙋 ' : '💡 ', T(S.stuck ? 'stuck' : 'hint'));
    el.hintBtn.classList.toggle('oc-lit', S.stuck && S.phase === 'work'); el.hintBtn.disabled = S.phase !== 'work' || S.watching;
    el.clear.disabled = S.phase !== 'work' || S.watching;
    el.work.dataset.tool = p.tool;
    el.work.textContent = '';
    el.work.append(VIEWS[p.tool](p, S.st, { locked: S.phase !== 'work' || S.watching, set, rich, T, guide: support !== 'own', select: sel => { S.sel = sel; paint(); }, sel: S.sel }));
    paintSteps();
  }
  function paintSteps() {
    const p = P(), steps = stepList(p), now = steps.findIndex((s, i) => s.ans !== undefined && !S.stepDone[i]);
    const at = now >= 0 ? now : Math.max(0, steps.findIndex(s => s.k === 'pressCheck'));
    const allDone = S.phase === 'done' && S.lastOk;
    el.stepsToggle.textContent = T(S.stepsOpen ? 'hideSteps' : 'showSteps'); el.stepsToggle.setAttribute('aria-expanded', String(S.stepsOpen));
    el.steps.hidden = !S.stepsOpen;
    el.stepsBox.classList.toggle('oc-closed', !S.stepsOpen);
    el.steps.textContent = '';
    steps.forEach((s, i) => {
      const done = allDone || S.stepDone[i] || (s.ans === undefined && i < at), cur = !done && i === at;
      const li = h('li', { class: done ? 'oc-done' : cur ? 'oc-now' : 'oc-todo', ...(cur ? { 'aria-current': 'step' } : {}) },
        h('span', { class: 'oc-k', 'aria-hidden': 'true' }, done ? '✓' : String(i + 1)), h('div', {}, h('p', {}, line(s))));
      if (s.ans !== undefined && (support !== 'own' || S.stepsOpen)) li.lastChild.append(stepBox(i, s, done));
      el.steps.append(li);
    });
  }
  /** A step's answer box: digits from the keypad or the keyboard (Guided, On my own), or ▲ ▼ (Count up). */
  function stepBox(i, s, done) {
    const v = S.stepVal[i], selected = S.sel === `step:${i}`;
    const box = h('button', { type: 'button', class: `oc-box${selected ? ' oc-sel' : ''}${S.stepBad === i ? ' oc-try' : ''}`, 'aria-label': `${T('box')} ${i + 1}`, 'aria-pressed': String(selected), disabled: done || S.phase !== 'work' || S.watching, dir: 'ltr',
      onclick: () => { S.sel = `step:${i}`; if (support !== 'count' && coarse()) keypad(true); paint(); } }, v === null ? '' : String(v));
    if (support !== 'count' || done) return h('span', { class: 'oc-ans' }, box);
    const bump = d => { S.stepVal[i] = Math.max(0, Math.min(999, (S.stepVal[i] || 0) + d)); sfx('click'); paintSteps(); };
    return h('span', { class: 'oc-ans' }, h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('down'), onclick: () => bump(-1) }, '▼'), box,
      h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('up'), onclick: () => bump(1) }, '▲'),
      h('button', { type: 'button', class: 'oc-btn oc-sm oc-primary', 'aria-label': T('check'), onclick: () => stepCheck(i) }, '✓'));
  }
  function stepCheck(i) {
    const s = stepList(P())[i]; if (!s || s.ans === undefined) return;
    if (S.stepVal[i] === s.ans) { S.stepDone[i] = true; S.stepBad = null; S.sel = null; sfx('coin'); }
    else { S.stepBad = i; S.wrongMoves = (S.wrongMoves || 0) + 1; if (S.wrongMoves >= 2) S.stuck = true; }
    paint();
  }
  /** A digit from the keypad or the keyboard: into the selected step box or digit box (null: delete). */
  function typeDigit(d) {
    S.idle = Date.now();
    if (!S.sel || S.phase !== 'work' || S.watching) return;
    if (S.sel.startsWith('step:')) {
      const i = +S.sel.slice(5), s = stepList(P())[i]; if (!s || s.ans === undefined || S.stepDone[i]) return;
      const cur = S.stepVal[i] === null ? '' : String(S.stepVal[i]);
      const nx = d === null ? cur.slice(0, -1) : (cur + d).slice(-3);
      S.stepVal[i] = nx === '' ? null : +nx; S.stepBad = null;
      if (d !== null && nx.length >= String(s.ans).length) stepCheck(i); else paint();
      return;
    }
    if (S.sel.startsWith('col:') && S.st && Array.isArray(S.st.ans)) {
      const c = +S.sel.slice(4), ans = S.st.ans.slice();
      ans[c] = d; set({ ans });
      if (d !== null && c + 1 < ans.length) { S.sel = `col:${c + 1}`; paint(); }
    }
  }
  /** A new state for the manipulative (a move). */
  function set(st) { if (S.phase !== 'work' || S.watching) return; S.st = st; S.idle = Date.now(); sfx('click'); save(); paint(); }
  function clear() { if (S.phase !== 'work') return; S.st = Tool().start(P()); S.sel = null; feedback('', ''); save(); paint(); }
  function feedback(kind, content, o = {}) {
    el.fb.className = `oc-fb${kind ? ` oc-${kind}` : ''}`; el.fb.textContent = '';
    if (content) el.fb.append(content);
    if (o.button) el.fb.append(' ', h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: o.button[1] }, o.button[0]));
  }
  function showHint() {
    if (S.phase !== 'work') return;
    const list = hintList(P());
    el.hint.hidden = false; el.hint.textContent = '';
    if (S.hintN >= list.length) { el.hint.append(h('span', { 'aria-hidden': 'true' }, '💡'), h('div', {}, h('p', {}, T('noMoreHints')))); return; }
    const x = list[S.hintN++];
    el.hint.append(h('span', { 'aria-hidden': 'true' }, '💡'), h('div', {}, h('b', {}, T('hintOf', { n: S.hintN, total: list.length })), h('p', {}, line(x))));
    S.stuck = false; paint();
  }
  function doCheck() {
    if (S.phase !== 'work' || S.watching) return;
    const p = P(), t = Tool(), r = t.check(p, S.st);
    S.tries++;
    if (r.ok) {
      S.right++; S.phase = 'done'; S.lastOk = true; sfx('coin');
      feedback('good', rich('right'));
      call(() => { if (!reduced() && B().fx && B().fx.pop) B().fx.pop(el.work); });
    } else if (S.tries < 2) {
      S.stuck = true; S.wrongMoves = 0;
      const f = document.createDocumentFragment(); f.append(h('b', {}, T('notYet')), ' ', r.hint ? rich(r.hint.k, r.hint.v) : '', ' ', T('tryAgain'));
      feedback('try', f);
    } else {
      S.wrong++; S.phase = 'done'; S.lastOk = false; S.st = t.solve(p) || S.st;
      const steps = stepList(p); steps.forEach((s, i) => { if (s.ans !== undefined) S.stepVal[i] = s.ans; S.stepDone[i] = true; });
      feedback('shown', rich('shown'));
    }
    save({ i: S.phase === 'done' ? S.i + 1 : S.i });
    paint();
    el.check.focus({ preventScroll: true });
  }
  function next() {
    if (S.i + 1 >= S.set.length) return finish();
    S.i++; save(); begin(); el.task.scrollIntoView && call(() => el.task.scrollIntoView({ block: 'nearest' }));
    el.check.focus({ preventScroll: true });
  }
  function finish() {
    const total = S.set.length;
    save({ i: total, done: true });
    if (!board && !S.reported) { S.reported = true; call(() => B().gameOver && B().gameOver({ won: S.right === total, score: S.right })); }
    sfx('win'); call(() => { if (S.right && !reduced() && B().fx && B().fx.confetti) B().fx.confetti(); });
    el.main.hidden = true; card.hidden = true; band.hidden = true;
    el.end.hidden = false; el.end.textContent = '';
    el.end.append(h('h2', { id: 'oc-end-h' }, T('endH', { right: S.right, total })), h('p', {}, T(S.right === total ? 'endAll' : 'endSome')),
      h('div', { class: 'oc-btns' },
        h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: again }, A.gen ? `🎲 ${T('newSet')}` : `↻ ${T('again')}`),
        B().back ? h('button', { type: 'button', class: 'oc-btn', onclick: () => call(() => B().back()) }, `← ${T('back')}`) : null));
    el.left.textContent = T('toGo', { n: 0 });
    el.end.querySelector('button').focus({ preventScroll: true });
  }
  function again() {
    if (A.gen) S.seed = (S.seed * 48271 + 11) % 2147483647 || 7;
    dealSet(false); save();
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    begin();
  }
  function keypad(on) { S.keys = !!on; el.keys.hidden = !S.keys; el.keyBtn.setAttribute('aria-pressed', String(S.keys)); }
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // ---- keys: digits and Backspace for the selected box; Enter checks
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) && S.sel) { e.preventDefault(); typeDigit(+e.key); }
    else if (e.key === 'Backspace' && S.sel) { e.preventDefault(); typeDigit(null); }
  });
  // "Stuck?" lights up after 45 s without a move, the same as the Big Divide
  setInterval(() => { if (S.phase === 'work' && !S.watching && !S.stuck && Date.now() - S.idle > IDLE_MS) { S.stuck = true; paint(); } }, 5000);

  dealSet(true);
  if (!S.set.length) { el.work.append(h('p', {}, T('fbEmpty'))); return { selfTest: () => selfTest(A, WORDS.en) }; }
  if (saved && saved.done) { S.i = 0; }
  begin(saved && !saved.done && saved.i === S.i ? saved.st : null);
  if (support === 'own') S.stepsOpen = false, paintSteps();
  const api = {
    version: VERSION, selfTest: () => selfTest(A, WORDS.en),
    state: () => ({ screen: el.end.hidden ? 'work' : 'end', problem: S.i + 1, problems: S.set.length, right: S.right, wrong: S.wrong, tool: P() && P().tool, phase: S.phase, score: S.right, controls: 'none' }),
  };
  call(() => { window.__brbTest = { state: api.state, start() {} }; });
  return api;
}

// ---------------------------------------------------------------- drag and tap
// A tile can be tapped (then a place tapped) or dragged onto a place: both end in the same drop(). Pointer events only,
// so it works with a mouse, a pen and touch; the tap path is the keyboard's too (buttons).
function draggable(btn, payload, drop) {
  let start = null, ghost = null, moved = false;
  btn.addEventListener('pointerdown', e => { if (btn.disabled || e.button > 0) return; start = { x: e.clientX, y: e.clientY }; moved = false; btn.setPointerCapture && btn.setPointerCapture(e.pointerId); });
  btn.addEventListener('pointermove', e => {
    if (!start) return;
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { moved = true; ghost = btn.cloneNode(true); ghost.className += ' oc-ghost'; ghost.removeAttribute('id'); document.body.append(ghost); }
    if (ghost) { ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`; ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`; }
  });
  const end = e => {
    if (!start) return; start = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (!moved) return;
    btn.dataset.dragged = '1'; setTimeout(() => { delete btn.dataset.dragged; }, 0);
    const at = document.elementFromPoint(e.clientX, e.clientY), zone = at && at.closest('[data-drop]');
    if (zone) drop(payload, zone.dataset.drop);
  };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', () => { start = null; if (ghost) { ghost.remove(); ghost = null; } });
  return btn;
}
const tapped = (btn, fn) => { btn.addEventListener('click', e => { if (btn.dataset.dragged) { e.preventDefault(); return; } fn(e); }); return btn; };

// ---------------------------------------------------------------- the manipulatives' views
// view(p, st, ctx) -> an element. ctx: { locked, set(newState), rich, T, guide (show the dotted guide), select, sel }.
const pct = x => `${Math.round(x * 100000) / 1000}%`;
/** A bar cut into d parts with n shaded (the target). */
const targetBar = (n, d, c = 'c0') => h('div', { class: 'oc-bar', role: 'img', 'aria-label': `${n}/${d}` }, ...Array.from({ length: d }, (_, i) => h('span', { class: `oc-part${i < n ? ` oc-on oc-${c}` : ''}`, style: `width:${pct(1 / d)}` })));
const row = (label, fr, body) => h('div', { class: 'oc-row' }, h('div', { class: 'oc-lab' }, label ? h('small', {}, label) : null, fr), body);
const sizes = p => { const set = new Set([p.to, ...(p.tray || [p.from[1], [3, 6, 5, 10, 12, 4, 2].find(x => x !== p.to && x !== p.from[1])])]); return [...set].sort((a, b) => a - b); };

const VIEWS = {
  'fractions.equiv'(p, st, c) {
    const pcs = st.pieces || [], used = pcs.reduce((s, d) => s + 1 / d, 0), all = pcs.every(d => d === p.to);
    const add = d => { if (c.locked) return; if (used + 1 / d > 1 + 1e-9) return; c.set({ pieces: [...pcs, d] }); };
    const yours = h('div', { class: 'oc-barwrap', 'data-drop': 'bar' },
      h('div', { class: 'oc-bar oc-yours', 'aria-label': c.T('placed', { n: pcs.length }) },
        ...pcs.map((d, i) => tapped(h('button', { type: 'button', class: `oc-part oc-on ${d === p.to ? 'oc-c1' : 'oc-c2'}`, style: `width:${pct(1 / d)}`, disabled: c.locked, 'aria-label': `1/${d}` }, frac(1, d)), () => { if (!c.locked) c.set({ pieces: pcs.filter((_, j) => j !== i) }); })),
        used < 1 - 1e-9 ? h('span', { class: 'oc-slot', style: `width:${pct(1 - used)}` }) : null),
      c.guide ? h('span', { class: 'oc-guide', style: `inset-inline-start:${pct(p.from[0] / p.from[1])}`, 'aria-hidden': 'true' }) : null);
    const tray = h('div', { class: 'oc-tray', role: 'group', 'aria-label': c.T('pieces') }, h('b', {}, c.T('pieces')),
      ...sizes(p).map(d => draggable(tapped(h('button', { type: 'button', class: `oc-tile ${d === p.to ? 'oc-c1' : 'oc-c2'}`, style: `min-width:${Math.max(56, 360 / d)}px`, disabled: c.locked, 'aria-label': `1/${d}` }, frac(1, d)), () => add(d)), d, (dd, zone) => { if (zone === 'bar') add(dd); })),
      h('span', { class: 'oc-count' }, c.T('placed', { n: pcs.length })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row(c.T('target'), frac(p.from[0], p.from[1]), targetBar(p.from[0], p.from[1])),
      row(c.T('yours'), all && pcs.length ? frac(pcs.length, p.to) : h('span', { class: 'oc-q' }, pcs.length ? '?' : '–'), yours), tray);
  },
  'fractions.shade'(p, st, c) {
    const on = new Set(st.on || []);
    const bar = h('div', { class: 'oc-bar oc-tall', role: 'group', 'aria-label': c.T('workspace') }, ...Array.from({ length: p.d }, (_, i) => tapped(h('button', { type: 'button', class: `oc-part${on.has(i) ? ' oc-on oc-c1' : ''}`, style: `width:${pct(1 / p.d)}`, 'aria-pressed': String(on.has(i)), 'aria-label': `${i + 1}/${p.d}`, disabled: c.locked }), () => { const n = new Set(on); n.has(i) ? n.delete(i) : n.add(i); c.set({ on: [...n] }); })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row(c.T('target'), frac(p.n, p.d), h('div', { class: 'oc-q oc-big' }, frac(p.n, p.d))), row(c.T('yours'), frac(on.size, p.d), bar));
  },
  'fractions.compare'(p, st, c) {
    const signs = ['<', '=', '>'].map(s => tapped(h('button', { type: 'button', class: 'oc-btn oc-sign', 'aria-pressed': String(st.pick === s), disabled: c.locked }, s), () => c.set({ pick: s })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row('', frac(p.a[0], p.a[1]), targetBar(p.a[0], p.a[1], 'c0')), row('', frac(p.b[0], p.b[1]), targetBar(p.b[0], p.b[1], 'c2')),
      h('div', { class: 'oc-signs' }, frac(p.a[0], p.a[1]), h('div', { class: 'oc-signbtns', role: 'group' }, ...signs), frac(p.b[0], p.b[1])));
  },
  'numberline.point': (p, st, c) => lineView(p, st, c, null),
  'numberline.jump': (p, st, c) => lineView(p, st, c, p.from),
  'digits.add': (p, st, c) => colView(p, st, c, '+'),
  'digits.sub': (p, st, c) => colView(p, st, c, '−'),
  'digits.mul': (p, st, c) => colView(p, st, c, '×'),
  'tiles.sort'(p, st, c) {
    const at = st.at || p.items.map(() => null), T = TOOLS['tiles.sort'], bins = T.bins(p);
    const text = i => (p.rule ? (Array.isArray(p.items[i]) ? frac(p.items[i][0], p.items[i][1]) : String(p.items[i])) : p.items[i].t);
    const put = (i, b) => { if (c.locked) return; const n = at.slice(); n[i] = b; c.select(null); c.set({ at: n }); };
    const tile = i => draggable(tapped(h('button', { type: 'button', class: `oc-tile oc-word${c.sel === `tile:${i}` ? ' oc-sel' : ''}`, 'aria-pressed': String(c.sel === `tile:${i}`), disabled: c.locked, dir: 'auto' }, text(i)),
      () => { if (at[i] !== null && at[i] !== undefined && c.sel !== `tile:${i}`) return put(i, null); c.select(c.sel === `tile:${i}` ? null : `tile:${i}`); }), i, (ii, zone) => put(ii, zone === 'tray' ? null : +zone.slice(4)));
    const sel = c.sel && c.sel.startsWith('tile:') ? +c.sel.slice(5) : null;
    return h('div', { class: 'oc-stack' },
      h('div', { class: 'oc-tray', 'data-drop': 'tray', role: 'group', 'aria-label': c.T('tiles') }, h('b', {}, c.T('tiles')), ...p.items.map((_, i) => (at[i] === null || at[i] === undefined ? tile(i) : null)), h('span', { class: 'oc-count' }, c.T('pickTile'))),
      h('div', { class: 'oc-bins' }, ...bins.map((b, k) => tapped(h('div', { class: 'oc-bin', 'data-drop': `bin:${k}`, role: 'group', 'aria-label': b.text !== undefined ? b.text : c.T(b.k, b.v) },
        h('button', { type: 'button', class: 'oc-binlab', disabled: c.locked || sel === null, dir: 'auto' }, b.text !== undefined ? b.text : c.rich(b.k, b.v)), h('div', { class: 'oc-binin' }, ...p.items.map((_, i) => (at[i] === k ? tile(i) : null)))), () => { if (sel !== null) put(sel, k); }))));
  },
  'tiles.order'(p, st, c) {
    const slots = st.slots || p.items.map(() => null);
    const text = i => (Array.isArray(p.items[i]) ? frac(p.items[i][0], p.items[i][1]) : String(p.items[i]));
    const place = (i, k) => { if (c.locked) return; const n = slots.map(x => (x === i ? null : x)); n[k] = i; c.select(null); c.set({ slots: n }); };
    const sel = c.sel && c.sel.startsWith('tile:') ? +c.sel.slice(5) : null;
    const tile = i => draggable(tapped(h('button', { type: 'button', class: `oc-tile oc-word${sel === i ? ' oc-sel' : ''}`, 'aria-pressed': String(sel === i), disabled: c.locked }, text(i)), () => c.select(sel === i ? null : `tile:${i}`)), i, (ii, zone) => { if (zone.startsWith('slot:')) place(ii, +zone.slice(5)); });
    return h('div', { class: 'oc-stack', dir: 'ltr' },
      h('div', { class: 'oc-slots', role: 'group', 'aria-label': c.T('order') }, ...slots.map((x, k) => tapped(h('button', { type: 'button', class: `oc-slotbox${x === null ? '' : ' oc-full'}`, 'data-drop': `slot:${k}`, disabled: c.locked, 'aria-label': `${k + 1}` }, h('small', {}, k + 1), x === null ? '' : text(x)),
        () => { if (sel !== null) place(sel, k); else if (x !== null) { const n = slots.slice(); n[k] = null; c.set({ slots: n }); } }))),
      h('div', { class: 'oc-tray', role: 'group', 'aria-label': c.T('tiles') }, h('b', {}, c.T('tiles')), ...p.items.map((_, i) => (slots.includes(i) ? null : tile(i))), h('span', { class: 'oc-count' }, c.T('pickTile'))));
  },
};
function lineView(p, st, c, from) {
  const lo = p.lo * p.sub, hi = p.hi * p.sub, n = hi - lo, R = v => { const r = Array.isArray(v) ? { n: v[0], d: v[1] } : { n: v, d: 1 }; return (r.n * p.sub) / r.d; };
  const ticks = [];
  for (let t = lo; t <= hi; t++) {
    const whole = t % p.sub === 0, on = st.tick === t, start = from !== null && R(from) === t;
    ticks.push(tapped(h('button', { type: 'button', class: `oc-tick${whole ? ' oc-whole' : ''}${on ? ' oc-on' : ''}${start ? ' oc-start' : ''}`, style: `left:${pct((t - lo) / n)}`, 'aria-pressed': String(on), disabled: c.locked,
      'aria-label': whole ? String(t / p.sub) : `${t - Math.floor(t / p.sub) * p.sub}/${p.sub} + ${Math.floor(t / p.sub)}` }, h('i', { 'aria-hidden': 'true' }), whole ? h('span', { class: 'oc-tlab' }, String(t / p.sub)) : null), () => c.set({ tick: t })));
  }
  return h('div', { class: 'oc-stack', dir: 'ltr' }, h('div', { class: 'oc-line' }, h('div', { class: 'oc-axis', 'aria-hidden': 'true' }), ...ticks));
}
function colView(p, st, c, sign) {
  const ans = st.ans || [], cols = ans.length, A = String(p.a).split('').reverse(), Bd = String(p.b).split('').reverse();
  const cell = (txt, cls = '') => h('span', { class: `oc-cell ${cls}` }, txt === undefined ? '' : txt);
  const rowOf = (digits, lead) => h('div', { class: 'oc-crow' }, cell(lead, 'oc-sign'), ...Array.from({ length: cols }, (_, k) => cell(digits[cols - 1 - k])));
  const boxes = h('div', { class: 'oc-crow oc-answer' }, cell(''), ...Array.from({ length: cols }, (_, k) => {
    const i = cols - 1 - k, on = c.sel === `col:${i}`;
    return tapped(h('button', { type: 'button', class: `oc-cell oc-dbox${on ? ' oc-sel' : ''}`, 'aria-pressed': String(on), 'aria-label': `${c.T('box')}: ${c.T(['ones', 'tens', 'hundreds', 'thousands', 'tenThousands'][i] || 'ones')}`, disabled: c.locked }, ans[i] === null || ans[i] === undefined ? '' : String(ans[i])), () => c.select(on ? null : `col:${i}`));
  }));
  return h('div', { class: 'oc-stack oc-cols', dir: 'ltr' }, h('div', { class: 'oc-paper' }, rowOf(A, ''), rowOf(Bd, sign), h('div', { class: 'oc-rule', 'aria-hidden': 'true' }), boxes));
}

// ---------------------------------------------------------------- the font (Bricolage Grotesque, self-hosted next to the kit)
let fontDone = false;
const KIT_BASE = (() => { try { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, '') : ''; } catch (e) { return ''; } })();
function loadFont() {
  if (fontDone || !KIT_BASE || typeof FontFace === 'undefined') return; fontDone = true;
  for (const [f, range] of [['bricolage-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'], ['bricolage-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF']]) {
    try { const face = new FontFace('Bricolage Grotesque', `url(${KIT_BASE}fonts/${f}) format('woff2')`, { weight: '200 800', unicodeRange: range, display: 'swap' }); document.fonts.add(face); face.load().catch(() => {}); } catch (e) { /* the system font */ }
  }
}


// ---- index.js
// Oomba Canvas: the global a game uses. window.OombaCanvas (alias Oc):
//   Oc.activity({ config, task, problems, gen, steps, hints })   draw the activity and run it (docs/canvas-api.md)
//   Oc.selfTest(activity)                                        the Builder's check (every problem solvable, never right empty)
//   Oc.tools, Oc.words, Oc.version
// In a page with no document (the server's check, server/services/canvaskit.js) only the pure parts are there.

const OombaCanvas = Object.freeze({
  version: VERSION,
  activity,
  selfTest: a => selfTest(a, WORDS.en),
  tools: Object.freeze(Object.keys(TOOLS)),
  logic: Object.freeze({ TOOLS, deal, seeded, cleanProblem }),
  words: WORDS,
});
globalThis.OombaCanvas = OombaCanvas;
globalThis.Oc = OombaCanvas;

})();
