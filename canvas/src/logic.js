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

import { evalExpr } from './expr.js';

export const MAX_PROBLEMS = 30;
export const MAX_COUNT = 12;
export const SUPPORTS = ['watch', 'count', 'guided', 'own'];
/** 1.2.0, config.purpose: practice on screen, a printable worksheet (with its answer key), a question generator. */
export const PURPOSES = ['screen', 'worksheet', 'generator'];

/** A small seeded random source (the same xorshift as the dashboard's seeded()): a fresh set per student. */
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const between = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const lcm = (a, b) => (a / gcd(a, b)) * b;
/** A number or [n, d] -> { n, d } (d > 0), or null. */
export function ratOf(v) {
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
// 1.6.0: story, the Builder's own line for the problem in the activity's theme ("The farm packs {a} eggs, then {b}
// more. How many eggs?"): a template with {a} and {b}, so the numbers always match (the Activity panel may change them).
// The generator's regroup ("some": every problem carries (add) or borrows (sub) at least once; "all": in every column
// that can; "none": never) and lo / hi (each number's range, inside its number of digits) keep a set on the skill asked.
// Hints use the problem's own digits and the column the student is on: hints(p, st, focus).
const OPS = { 'digits.add': (a, b) => a + b, 'digits.sub': (a, b) => a - b, 'digits.mul': (a, b) => a * b };
export const REGROUP = ['some', 'all', 'none'];
const storyOf = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 160) : '');
/** The columns of a column sum, from the ones: [{ i, x, y, c, s, out }]. c: what came in (a carry, or a borrow taken
 *  from this column), s: the column's sum, difference (after a borrow) or product, out: the carry or borrow passed on. */
export function columnsOf(tool, a, b) {
  const A = digitsOf(a), B = digitsOf(b), out = [];
  if (tool === 'digits.add') { let c = 0; for (let i = 0; i < Math.max(A.length, B.length); i++) { const x = A[i] || 0, y = B[i] || 0, s = x + y + c; out.push({ i, x, y, c, s, out: s >= 10 ? 1 : 0 }); c = s >= 10 ? 1 : 0; } }
  else if (tool === 'digits.sub') { let bw = 0; for (let i = 0; i < A.length; i++) { const x = A[i] - bw, y = B[i] || 0, take = x < y ? 1 : 0; out.push({ i, x, y, c: bw, s: x + take * 10 - y, out: take }); bw = take; } }
  else { let c = 0; for (let i = 0; i < A.length; i++) { const x = A[i], s = x * b + c; out.push({ i, x, y: b, c, s, out: Math.floor(s / 10) }); c = Math.floor(s / 10); } }
  return out;
}
/** The columns that can regroup: addition, the columns where both numbers have a digit; subtraction, every column of a
 *  but its top one; multiplication, every digit of a. */
const canRegroup = (tool, a, b) => (tool === 'digits.add' ? Math.min(digitsOf(a).length, digitsOf(b).length) : tool === 'digits.sub' ? digitsOf(a).length - 1 : digitsOf(a).length);
/** How a problem regroups: { n: the columns that carry or borrow, can: the columns that could }. */
export function regroupsOf(tool, a, b) {
  const can = canRegroup(tool, a, b), cols = columnsOf(tool, a, b);
  return { n: cols.filter(c => c.out > 0).length, can, all: can > 0 && cols.slice(0, can).every(c => c.out > 0) };
}
/** Does { a, b } practise this regrouping ("some": at least once, "all": in every column that can, "none": never)? */
export function fitsRegroup(tool, a, b, want) {
  if (!REGROUP.includes(want)) return true;
  const r = regroupsOf(tool, a, b);
  return want === 'none' ? r.n === 0 : want === 'all' ? r.all : r.n > 0;
}
const colTool = tool => {
  const op = OPS[tool];
  const t = {
    clean(p) {
      if (!isInt(p.a, 0, 99999) || !isInt(p.b, 0, 99999)) return fail('"a" and "b" must be whole numbers from 0 to 99999', t.clean);
      if (tool === 'digits.sub' && p.b > p.a) return fail('"a" must be at least "b" (no negative answers)', t.clean);
      if (tool === 'digits.mul' && (p.a > 9999 || !isInt(p.b, 1, 9))) return fail('"a" must be up to 9999 and "b" a single digit from 1 to 9', t.clean);
      if (p.story !== undefined && p.story !== null && p.story !== '') {
        const s = storyOf(p.story), rest = s.replace(/\{[ab]\}/g, '');
        if (!s || !s.includes('{a}') || !s.includes('{b}') || /[{}<>]/.test(rest)) return fail('"story" must be one short line with {a} and {b} where the two numbers go (no other { } and no < >)', t.clean);
        return { tool, a: p.a, b: p.b, story: s };
      }
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
        if (w === undefined) { if (isInt(got, 1, 9)) return { ok: false, hint: { k: 'fbCol', v: { place: PLACE[i] || 'ones' } }, col: i }; continue; }
        if (got !== w) return { ok: false, hint: { k: got === null || got === undefined ? 'fbFill' : 'fbCol', v: { place: PLACE[i] || 'ones' } }, col: i };
      }
      return { ok: true, hint: null };
    },
    solve(p) { const want = digitsOf(op(p.a, p.b)), ans = Array(t.cols(p)).fill(null); want.forEach((d, i) => { ans[i] = d; }); return { ans }; },
    steps(p) {
      const A = digitsOf(p.a), B = digitsOf(p.b), out = [];
      if (tool === 'digits.add') {
        let c = 0;
        for (let i = 0; i < Math.max(A.length, B.length) && out.length < 4; i++) { const x = A[i] || 0, y = B[i] || 0, s = x + y + c; out.push({ k: c ? 'colAddC' : 'colAdd', v: { place: PLACE[i], x, y, c }, ans: s, col: i }); c = s >= 10 ? 1 : 0; }
      } else if (tool === 'digits.sub') {
        let borrow = 0;
        for (let i = 0; i < A.length && out.length < 4; i++) { let x = A[i] - borrow; const y = B[i] || 0; borrow = 0; if (x < y) { out.push({ k: 'colBorrow', v: { place: PLACE[i], x, y } }); x += 10; borrow = 1; } out.push({ k: 'colSub', v: { place: PLACE[i], x, y }, ans: x - y, col: i }); }
      } else {
        let c = 0;
        for (let i = 0; i < A.length && out.length < 4; i++) { const x = A[i], s = x * p.b + c; out.push({ k: c ? 'colMulC' : 'colMul', v: { place: PLACE[i], x, y: p.b, c }, ans: s, col: i }); c = Math.floor(s / 10); }
      }
      return [...out.slice(0, 4), { k: 'colWrite', v: {} }, PRESS];
    },
    /** 1.6.0: three hints with this problem's own digits, for one column: by default the first whose answer box is not
     *  right yet; focus (a column index) when the last answer or step box was wrong there. [a nudge for that column,
     *  its worked line ("Ones: 6 + 8 = 14. Write 4 and carry 1 to the tens."), the next column's worked line]. */
    hints(p, st, focus) {
      const cols = columnsOf(tool, p.a, p.b), want = digitsOf(op(p.a, p.b)), ans = Array.isArray(st && st.ans) ? st.ans : [];
      let at = Number.isInteger(focus) && focus >= 0 && focus < cols.length ? focus : cols.findIndex((c, i) => ans[i] !== want[i]);
      if (at < 0) at = 0;
      const line = (c, worked) => {
        const v = { place: PLACE[c.i] || 'ones', x: c.x, y: c.y, c: c.c, s: c.s, d: c.s % 10, next: PLACE[c.i + 1] || 'tens' }, top = c.i === cols.length - 1, C = c.c ? 'C' : '';
        if (tool === 'digits.sub') {
          if (c.x < 0) return { k: 'hSub0', v };   // a 0 on top that already gave 1 away (503 − 128, the tens)
          if (!worked) return { k: c.c ? 'hSubC1' : 'hSub1', v };
          return c.out ? { k: 'hSub10', v: { ...v, t: c.x + 10 } } : { k: 'hSub2', v };
        }
        const m = tool === 'digits.mul' ? 'Mul' : 'Add';
        if (!worked) return { k: `h${m}${C}1`, v };
        if (c.s >= 10) return { k: `h${m}${C}${top ? 'Top' : '10'}`, v: { ...v, k: Math.floor(c.s / 10) } };
        return { k: `h${m}${C}2`, v };
      };
      return [line(cols[at], false), line(cols[at], true), at + 1 < cols.length ? line(cols[at + 1], true) : { k: 'hLast', v: {} }];
    },
    task: p => (p.story ? { text: p.story.replace(/\{a\}/g, String(p.a)).replace(/\{b\}/g, String(p.b)) } : { k: tool === 'digits.add' ? 'addTask' : tool === 'digits.sub' ? 'subTask' : 'mulTask', v: { a: p.a, b: p.b } }),
    ask: () => ({ k: 'digQ', v: {} }),
    gen(rnd, o) {
      const size = isInt(o.digits, 1, 4) ? o.digits : 2, lo0 = 10 ** (size - 1), hi0 = 10 ** size - 1;
      // 1.6.0: lo / hi, each number's range, always inside its number of digits ("bigger numbers" stay that size)
      const lo = isInt(o.lo, lo0, hi0) ? o.lo : lo0, hi = isInt(o.hi, lo, hi0) ? o.hi : hi0;
      const want = REGROUP.includes(o.regroup) ? o.regroup : o.regroup === true ? 'some' : o.regroup === false ? 'none' : null, story = storyOf(o.story);
      const make = () => {
        if (tool === 'digits.mul') return [between(rnd, Math.max(2, lo), Math.max(2, hi)), between(rnd, 2, 9)];
        const a = between(rnd, lo, hi), b = between(rnd, lo, hi);
        return tool === 'digits.sub' && b > a ? [b, a] : [a, b];
      };
      let [a, b] = make();
      for (let i = 0; want && i < 600 && !fitsRegroup(tool, a, b, want); i++) [a, b] = make();
      return { tool, a, b, ...(story ? { story } : {}) };
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

// ---------------------------------------------------------------- figure questions (1.2.0)
// A question about a figure (Oomba Figures, docs/figures-api.md): the student reads the figure and types a number
// (figure.number) or taps one of 2 to 4 answers (figure.choice). The Builder writes the question, the figure's data,
// the answer and the WORKED answer (the lines the answer key prints, and the student sees after a second try); the kit
// checks the answer exactly (to dp decimal places) and the self-test checks the worked answer ends on it.
//   figure.number { q, fig?: { kind, ...data }, answer: a number 0 or more, dp?: decimal places (0 to 3), unit?,
//                   work: [lines], hints?: [1 to 3 lines], tol?: how far off still counts }
//   figure.choice { q, fig?, choices: [2 to 4 short answers], answer: the index of the right one, work, hints? }
// A generator makes fresh ones from a template: { tool, vars: { m: [lo, hi] | [lo, hi, step] | { of: [values] } },
// where?: a formula that must hold, q, fig, answer: a number or a formula, dp, unit, work, hints, choices }: in text
// "{m}" is a value and "{=m*a}" a formula (canvas/src/expr.js: + - * / ^, sqrt, sin in degrees, round...); in the
// figure's data a string that is only "{m}" or "{=formula}" becomes the number itself.
const FIG_JSON_MAX = 4000;
const figLine = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const figLines = (v, lo, hi) => (Array.isArray(v) && v.length >= lo && v.length <= hi && v.every(x => typeof x === 'string' && x.trim() && x.length <= 160) ? v.map(x => x.replace(/\s+/g, ' ').trim()) : null);
/** A figure's data: undefined -> null (no figure); a { kind } object of at most 4,000 characters -> a copy; else false. */
function figData(f) {
  if (f === undefined || f === null) return null;
  if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.kind !== 'string' || !/^[a-zA-Z]{2,20}$/.test(f.kind)) return false;
  const s = JSON.stringify(f); return s.length > FIG_JSON_MAX ? false : JSON.parse(s);
}
/** A number as the kit writes and reads it: at most dp decimals, no trailing zeros, a point for the decimal mark. */
export function numText(x, dp = 3) { const k = 10 ** dp, r = Math.round((x + Math.sign(x) * 1e-12) * k) / k; return String(r === 0 ? 0 : r); }
const decimalsOf = x => { const s = numText(x, 6); return s.includes('.') ? s.split('.')[1].length : 0; };
const figCommon = (p, tool, T) => {
  if (typeof p.why === 'string') return fail(`the generator: ${p.why}`, T.clean);
  const q = figLine(p.q, 200); if (!q) return fail('"q" must be the question (one or two short sentences)', T.clean);
  const fig = figData(p.fig); if (fig === false) return fail('"fig" must be a figure: { "kind": one of the Oomba Figures, ...its data } (at most 4,000 characters)', T.clean);
  const work = figLines(p.work, 1, 6); if (!work) return fail('"work" must be the worked answer: 1 to 6 short lines, the last one ending on the answer', T.clean);
  const hints = p.hints === undefined ? null : figLines(p.hints, 1, 3); if (p.hints !== undefined && !hints) return fail('"hints" must be 1 to 3 short lines', T.clean);
  return { tool, q, ...(fig ? { fig } : {}), work, ...(hints ? { hints } : {}) };
};
const FIG_STEPS = (p, last) => [{ k: 'figRead', v: {} }, { k: 'figWork', v: {} }, last, PRESS];
const figHints = p => (p.hints ? p.hints.map(text => ({ text })) : [{ k: 'figH1', v: {} }, { k: 'figH2', v: {} }, { k: 'figH3', v: {} }]);
const figNumber = {
  clean(p) {
    const T = figNumber, c = figCommon(p, 'figure.number', T); if (!c) return null;
    if (typeof p.answer !== 'number' || !Number.isFinite(p.answer) || p.answer < 0 || p.answer > 1e7) return fail('"answer" must be a number from 0 up (ask for a size and say any direction in words: the keypad has no minus sign)', T.clean);
    const dp = p.dp === undefined ? Math.min(3, decimalsOf(p.answer)) : p.dp;
    if (!isInt(dp, 0, 3)) return fail('"dp" (decimal places in the answer) must be 0 to 3', T.clean);
    if (Math.abs(+numText(p.answer, dp) - p.answer) > 1e-9) return fail(`"answer" ${p.answer} has more than ${dp} decimal places: round it, or raise "dp"`, T.clean);
    if (p.tol !== undefined && (typeof p.tol !== 'number' || !(p.tol >= 0) || p.tol > Math.max(1, p.answer))) return fail('"tol" must be a small number 0 or more', T.clean);
    const unit = figLine(p.unit, 12);
    return { ...c, answer: +numText(p.answer, dp), dp, ...(unit ? { unit } : {}), ...(p.tol !== undefined ? { tol: p.tol } : {}) };
  },
  start: () => ({ typed: '' }),
  check(p, st) {
    const t = st && typeof st.typed === 'string' ? st.typed : '';
    if (!/\d/.test(t)) return { ok: false, hint: { k: 'fbNum', v: {} } };
    const v = Number(t);
    if (!Number.isFinite(v)) return { ok: false, hint: { k: 'fbNum', v: {} } };
    return Math.abs(v - p.answer) <= (p.tol || 0) + 1e-9 ? { ok: true, hint: null } : { ok: false, hint: { k: 'fbFig', v: {} } };
  },
  solve: p => ({ typed: numText(p.answer, p.dp) }),
  steps: p => FIG_STEPS(p, { k: p.unit ? 'figTypeU' : 'figType', v: { u: { text: p.unit || '' } } }),
  hints: figHints,
  task: p => ({ text: p.q }),
  ask: p => (p.dp ? { k: 'figAskDp', v: { dp: p.dp } } : { k: 'figAsk', v: {} }),
  gen: (rnd, o) => figGen(rnd, o, 'figure.number'),
  key: p => `fn:${p.q}:${p.answer}`,
};
const figChoice = {
  clean(p) {
    const T = figChoice, c = figCommon(p, 'figure.choice', T); if (!c) return null;
    const ch = Array.isArray(p.choices) && p.choices.length >= 2 && p.choices.length <= 4 ? p.choices.map(x => figLine(typeof x === 'number' ? String(x) : x, 60)) : null;
    if (!ch || ch.some(x => !x) || new Set(ch.map(x => x.toLowerCase())).size !== ch.length) return fail('"choices" must list 2 to 4 different short answers', T.clean);
    if (!isInt(p.answer, 0, ch.length - 1)) return fail('"answer" must be the index of the right choice (0 for the first)', T.clean);
    return { ...c, choices: ch, answer: p.answer };
  },
  start: () => ({ pick: null }),
  check(p, st) {
    const k = st && st.pick;
    if (!isInt(k, 0, p.choices.length - 1)) return { ok: false, hint: { k: 'fbPickOne', v: {} } };
    return k === p.answer ? { ok: true, hint: null } : { ok: false, hint: { k: 'fbFig', v: {} } };
  },
  solve: p => ({ pick: p.answer }),
  steps: p => FIG_STEPS(p, { k: 'figPick', v: {} }),
  hints: figHints,
  task: p => ({ text: p.q }),
  ask: () => ({ k: 'figPickQ', v: {} }),
  gen: (rnd, o) => figGen(rnd, o, 'figure.choice'),
  key: p => `fc:${p.q}:${p.choices.join('|')}`,
};
/** One problem from a figure generator's template (see above), or an object clean() turns away with its reason. */
function figGen(rnd, o, tool) {
  const vars = o && o.vars && typeof o.vars === 'object' && !Array.isArray(o.vars) ? o.vars : {};
  const names = Object.keys(vars).filter(k => /^[a-zA-Z_][a-zA-Z0-9_]{0,15}$/.test(k)).slice(0, 8);
  let val = null;
  for (let tries = 0; tries < 40 && !val; tries++) {
    const v = {};
    for (const k of names) {
      const r = vars[k];
      if (Array.isArray(r) && r.length >= 2 && r.length <= 3 && r.every(x => typeof x === 'number' && Number.isFinite(x)) && r[1] >= r[0]) {
        const step = r[2] > 0 ? r[2] : 1, n = Math.floor((r[1] - r[0]) / step + 1e-9);
        v[k] = +numText(r[0] + between(rnd, 0, Math.min(n, 100000)) * step, 6);
      } else if (r && Array.isArray(r.of) && r.of.length) v[k] = pick(rnd, r.of.slice(0, 50));
      else return { tool, why: `vars.${k} must be [lo, hi], [lo, hi, step] or { "of": [values] }` };
    }
    try { if (typeof o.where !== 'string' || evalExpr(o.where, numsOf(v))) val = v; } catch (e) { return { tool, why: `"where": ${e.message}` }; }
  }
  if (!val) return { tool, why: '"where" was never true for the values: widen the ranges' };
  const nums = numsOf(val), dp = isInt(o.dp, 0, 3) ? o.dp : undefined;
  const fill = s => String(s).replace(/\{=([^{}]{1,200})\}/g, (m, e) => numText(evalExpr(e, nums), 3)).replace(/\{([a-zA-Z_][a-zA-Z0-9_]{0,15})\}/g, (m, k) => (k in val ? String(val[k]) : m));
  const deep = x => {
    if (typeof x === 'string') { const one = /^\{=([^{}]{1,200})\}$/.exec(x), name = /^\{([a-zA-Z_][a-zA-Z0-9_]{0,15})\}$/.exec(x); return one ? +numText(evalExpr(one[1], nums), 6) : name && name[1] in val ? val[name[1]] : fill(x); }
    if (Array.isArray(x)) return x.map(deep);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, deep(y)]));
    return x;
  };
  try {
    const answer = typeof o.answer === 'string' ? evalExpr(o.answer, nums) : o.answer;
    return {
      tool, q: fill(o.q || ''), ...(o.fig ? { fig: deep(o.fig) } : {}), work: Array.isArray(o.work) ? o.work.map(fill) : o.work,
      ...(Array.isArray(o.hints) ? { hints: o.hints.map(fill) } : {}), ...(o.unit ? { unit: fill(o.unit) } : {}), ...(o.tol !== undefined ? { tol: o.tol } : {}),
      ...(tool === 'figure.choice' ? { choices: Array.isArray(o.choices) ? o.choices.map(fill) : o.choices, answer: Math.round(answer) } : { answer: dp === undefined ? +numText(answer, 3) : +numText(answer, dp), ...(dp !== undefined ? { dp } : {}) }),
    };
  } catch (e) { return { tool, why: String(e.message) }; }
}
/** Does the last worked line say this answer? A number must stand on its own ("= 6 N" says 6, "16" does not); a decimal
 *  comma reads as a point ("9,8"), and a thousands comma or space is ignored ("1,200", "1 200"). */
const lastHas = (lines, ans) => {
  const raw = String(lines[lines.length - 1] || '').toLowerCase(), a = String(ans).toLowerCase();
  if (!/^[\d.]+$/.test(a)) return raw.includes(a);
  const l = raw.replace(/(\d)[, \u00a0\u202f](?=\d{3}(?!\d))/g, '$1').replace(/(\d),(?=\d)/g, '$1.');
  return new RegExp(`(^|[^\\d.])${a.replace('.', '\\.')}(?!\\d|\\.\\d)`).test(l);
};
const numsOf = v => Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number'));

/** Every tool, by id. The four manipulatives (fractions, numberline, digits, tiles) and, since 1.2.0, figure questions. */
export const TOOLS = {
  'fractions.equiv': equiv, 'fractions.shade': shade, 'fractions.compare': compare,
  'numberline.point': point, 'numberline.jump': jump,
  'digits.add': colTool('digits.add'), 'digits.sub': colTool('digits.sub'), 'digits.mul': colTool('digits.mul'),
  'tiles.sort': sort, 'tiles.order': order,
  'figure.number': figNumber, 'figure.choice': figChoice,
};
export const TOOL_IDS = Object.keys(TOOLS);
export const manipulativeOf = id => String(id || '').split('.')[0];
export { PLACE, ratOf as rat, lcm };

/** 1.6.0: the activity's theme (task.theme) as the kit shows it: { icon: one emoji, cheers: up to 4 short lines for a
 *  right answer, end: the end card's line }, or null. Anything else in it is left out. */
const themeLine = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export function themeOf(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const ic = typeof t.icon === 'string' ? t.icon.trim() : '';
  const icon = ic && [...ic].length <= 8 && !/[\p{L}\p{N}<>{}]/u.test(ic) ? ic : '';
  const cheers = Array.isArray(t.cheers) ? t.cheers.map(x => themeLine(x, 60)).filter(Boolean).slice(0, 4) : [];
  const end = themeLine(t.end, 100);
  return icon || cheers.length || end ? { icon, cheers, end } : null;
}
/** What is wrong with a theme, or '' (the self-test's words for the Builder). */
function themeWhy(t) {
  if (t === undefined || t === null) return '';
  if (typeof t !== 'object' || Array.isArray(t)) return 'task.theme must be { "icon": one emoji, "cheers": [up to 4 short lines], "end": one short line }';
  if (t.icon !== undefined && !(themeOf({ icon: t.icon }) || {}).icon) return 'task.theme.icon must be one emoji';
  if (t.cheers !== undefined && (!Array.isArray(t.cheers) || t.cheers.length > 4 || t.cheers.some(x => typeof x !== 'string' || !x.trim() || x.length > 60))) return 'task.theme.cheers must be up to 4 short lines (60 characters each)';
  if (t.end !== undefined && (typeof t.end !== 'string' || t.end.length > 100)) return 'task.theme.end must be one short line (100 characters)';
  return '';
}

/** A problem as data -> { p } (the cleaned problem) or { why }. */
export function cleanProblem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { why: 'a problem must be an object with a "tool"' };
  const T = TOOLS[raw.tool]; if (!T) return { why: `unknown tool "${String(raw.tool).slice(0, 30)}" (tools: ${TOOL_IDS.join(', ')})` };
  T.clean.why = '';
  const p = T.clean(raw);
  return p ? { p } : { why: T.clean.why || 'not a problem this tool can make' };
}
/** Deal a set: the fixed problems, or count new ones from the generator (fresh: never one from seen). */
export function deal(activity, { seed = 1, seen = [], count: want = null } = {}) {
  const a = activity || {}, cfg = a.config || {};
  // want (1.2.0): a printed sheet's own number of questions (up to MAX_PROBLEMS); else the set's config.count
  const count = isInt(want, 1, MAX_PROBLEMS) ? want : isInt(cfg.count, 1, MAX_COUNT) ? cfg.count : 5;
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
  const fixed = (Array.isArray(a.problems) ? a.problems : []).slice(0, MAX_PROBLEMS).map(x => cleanProblem(x).p).filter(Boolean);
  return isInt(want, 1, MAX_PROBLEMS) ? fixed.slice(0, want) : fixed;
}

/**
 * The self-test (the Builder's check before a version is saved, and Oc.selfTest() in the game): every problem (or 30 a
 * generator makes) must be solvable by its worked answer, the empty start must never count as right, and the steps and
 * hints must be there. -> { ok, problems: [{ at: 'problem 3' | 'generator', why }] } (English, for the Builder's model).
 */
export function selfTest(activity, words = null) {
  const out = [], a = activity && typeof activity === 'object' ? activity : {};
  const add = (at, why) => { if (out.length < 12) out.push({ at, why }); };
  const cfg = a.config && typeof a.config === 'object' ? a.config : {};
  if (cfg.support !== undefined && !SUPPORTS.includes(cfg.support)) add('config', `support must be one of ${SUPPORTS.join(', ')}`);
  // 1.1.0: the help modes it offers (the switcher): one to four of them, no repeats, and support (where it starts) one of them
  if (cfg.supports !== undefined && (!Array.isArray(cfg.supports) || !cfg.supports.length || cfg.supports.length > SUPPORTS.length || cfg.supports.some(x => !SUPPORTS.includes(x)) || new Set(cfg.supports).size !== cfg.supports.length)) add('config', `supports must be a list of one to four of ${SUPPORTS.join(', ')}, each once`);
  else if (Array.isArray(cfg.supports) && cfg.support !== undefined && SUPPORTS.includes(cfg.support) && !cfg.supports.includes(cfg.support)) add('config', 'support must be one of supports (where the activity starts)');
  if (cfg.count !== undefined && !isInt(cfg.count, 1, MAX_COUNT)) add('config', `count must be a whole number from 1 to ${MAX_COUNT}`);
  const thWhy = themeWhy(a.task && typeof a.task === 'object' ? a.task.theme : undefined); if (thWhy) add('task', thWhy);
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
    if (words) for (const x of [T.task(p), T.ask(p), ...steps, ...hints]) if (x.text === undefined && !(x.k in words)) return add(at, `the words table has no "${x.k}"`);
    // 1.2.0, figure questions: the worked answer (what the answer key prints) must end on the answer itself
    if (p.tool === 'figure.number' && !lastHas(p.work, numText(p.answer, p.dp))) return add(at, `the worked answer must end on the answer: its last line does not say ${numText(p.answer, p.dp)}`);
    if (p.tool === 'figure.choice' && !lastHas(p.work, p.choices[p.answer])) return add(at, `the worked answer must end on the answer: its last line does not say "${p.choices[p.answer]}"`);
    return null;
  };
  fixed.slice(0, MAX_PROBLEMS).forEach((raw, i) => one(raw, `problem ${i + 1}`));
  if (gen && TOOLS[gen.tool]) {
    const T = TOOLS[gen.tool];
    for (let i = 1; i <= 30; i++) { const raw = T.gen(seeded(i * 7919), gen); if (!cleanProblem(raw).p || one(raw, 'generator') !== null) { if (!cleanProblem(raw).p) add('generator', `made a problem it cannot use (${cleanProblem(raw).why})`); break; } if (out.some(x => x.at === 'generator')) break; }
    // 1.6.0: a column generator's regroup ("some" | "all" | "none") must be one it can keep with its numbers
    if (/^digits\./.test(gen.tool) && gen.regroup !== undefined) {
      const want = gen.regroup === true ? 'some' : gen.regroup === false ? 'none' : gen.regroup;
      if (!REGROUP.includes(want)) add('generator', 'regroup must be "some" (every problem regroups at least once), "all" (in every column) or "none"');
      else for (let i = 1; i <= 30; i++) { const p = T.gen(seeded(i * 7919), gen); if (!fitsRegroup(gen.tool, p.a, p.b, want)) { add('generator', `regroup "${want}" cannot be kept with these numbers (it made ${p.a} and ${p.b}): widen lo and hi or change digits`); break; } }
    }
  }
  // 1.2.0: what the activity is for. A question generator needs a generator; a printed worksheet needs problems (or a
  // generator), and a sheet of N questions must have N answers in its key (sheet.js makes both from the same problems).
  if (cfg.purpose !== undefined) {
    const pu = cfg.purpose;
    if (!Array.isArray(pu) || !pu.length || pu.some(x => !PURPOSES.includes(x)) || new Set(pu).size !== pu.length) add('config', `purpose must be a list of one to three of ${PURPOSES.join(', ')}, each once`);
    else {
      if (pu.includes('generator') && !(gen && TOOLS[gen.tool])) add('config', 'purpose "generator" needs a generator ("gen"): each New sheet is a fresh set from it');
      if (pu.includes('worksheet') || pu.includes('generator')) {
        const n = isInt(cfg.count, 1, MAX_COUNT) ? cfg.count : 5, want = gen && TOOLS[gen.tool] ? n : Math.min(n, fixed.length);
        for (const seed of [1, 2]) {
          const set = deal(a, { seed, count: want });
          if (set.length !== want) { add('worksheet', `a printed sheet of ${want} questions came out with ${set.length}`); break; }
          const keyed = set.filter(p => { const T = TOOLS[p.tool], st = T.solve(p); return st && T.check(p, st).ok; });
          if (keyed.length !== set.length) { add('worksheet', `a printed sheet of ${want} questions has only ${keyed.length} answers in its key`); break; }
        }
      }
    }
  }
  // The Builder's own steps and hints (text only): short lines, at most 3 hints a tool.
  for (const [k, list] of Object.entries(a.steps && typeof a.steps === 'object' ? a.steps : {})) if (!TOOLS[k] || !Array.isArray(list) || list.length > 6 || list.some(s => typeof s !== 'string' || !s.trim() || s.length > 160)) add('steps', `steps for "${k.slice(0, 30)}" must be up to 6 short lines for a known tool`);
  for (const [k, list] of Object.entries(a.hints && typeof a.hints === 'object' ? a.hints : {})) if (!TOOLS[k] || !Array.isArray(list) || list.length > 3 || list.some(s => typeof s !== 'string' || !s.trim() || s.length > 160)) add('hints', `hints for "${k.slice(0, 30)}" must be 1 to 3 short lines for a known tool`);
  return { ok: !out.length, problems: out };
}
