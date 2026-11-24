/*! Oomba Canvas 1.5.0 | (c) Oomba Academy | the classroom activity kit: docs/canvas-api.md */
(function () {
'use strict';
// ---- expr.js
// A small, safe arithmetic language for data (Oomba Canvas 1.2.0's question generators and Oomba Figures' graphs):
// numbers, named values, + - * / ^ %, brackets, comparisons (1 or 0), and a fixed list of functions. It is parsed by
// hand into a tree and worked out by walking it: no eval or Function constructor, no property access, nothing but numbers.
// Angles are in degrees (school maths). Shared by both kits: scripts/build-canvas.js and scripts/build-figures.js
// each bundle their own frozen copy.
//   evalExpr('m * a', { m: 2, a: 3 }) -> 6        evalExpr('round(sqrt(x), 1)', { x: 2 }) -> 1.4
//   evalExpr('if(u > f, 1, 0)', { u: 30, f: 10 }) -> 1
// Errors throw an Error whose message says what is wrong (the self-test passes it on to the Builder's model).
const EXPR_FUNCS = {
  sqrt: [1, Math.sqrt], abs: [1, Math.abs], floor: [1, Math.floor], ceil: [1, Math.ceil], exp: [1, Math.exp],
  ln: [1, Math.log], log: [1, Math.log10], sign: [1, Math.sign],
  sin: [1, x => Math.sin((x * Math.PI) / 180)], cos: [1, x => Math.cos((x * Math.PI) / 180)], tan: [1, x => Math.tan((x * Math.PI) / 180)],
  asin: [1, x => (Math.asin(x) * 180) / Math.PI], acos: [1, x => (Math.acos(x) * 180) / Math.PI], atan: [1, x => (Math.atan(x) * 180) / Math.PI],
  round: [-1, (x, dp = 0) => { const k = 10 ** Math.max(0, Math.min(6, Math.round(dp))); return Math.round((x + Math.sign(x) * 1e-12) * k) / k; }],
  min: [-2, (...a) => Math.min(...a)], max: [-2, (...a) => Math.max(...a)], pow: [2, (a, b) => a ** b],
  if: [3, (c, a, b) => (c ? a : b)],
};
const EXPR_CONSTS = { pi: Math.PI, e: Math.E };
const EXPR_MAX = 300;

/** Text -> tokens: [{ t: 'n', v } | { t: 'id', v } | { t: 'op', v }]. */
function exprTokens(src) {
  const s = String(src), out = [];
  if (s.length > EXPR_MAX) throw new Error(`a formula may be at most ${EXPR_MAX} characters`);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = /^(<=|>=|==|!=|[-+*/^%(),<>×÷−])/.exec(s.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] === '×' ? '*' : op[0] === '÷' ? '/' : op[0] === '−' ? '-' : op[0] }); i += op[0].length; continue; }
    throw new Error(`the formula has a character it cannot use: "${c}"`);
  }
  return out;
}
/** Tokens -> a tree (precedence climbing). */
function exprParse(src) {
  const tk = exprTokens(src); let i = 0;
  const peek = () => tk[i], eat = v => { const x = tk[i]; if (!x || x.t !== 'op' || x.v !== v) throw new Error(`the formula expected "${v}"`); i++; };
  const PREC = { '==': 1, '!=': 1, '<': 2, '>': 2, '<=': 2, '>=': 2, '+': 3, '-': 3, '*': 4, '/': 4, '%': 4, '^': 6 };
  function unary() {
    const x = peek();
    if (x && x.t === 'op' && (x.v === '-' || x.v === '+')) { i++; const a = climb(5); return x.v === '-' ? { op: 'neg', a } : a; }
    return primary();
  }
  function primary() {
    const x = tk[i++];
    if (!x) throw new Error('the formula ends too soon');
    if (x.t === 'n') return { n: x.v };
    if (x.t === 'id') {
      const nx = peek();
      if (nx && nx.t === 'op' && nx.v === '(') {
        const f = EXPR_FUNCS[x.v]; if (!f) throw new Error(`unknown function "${x.v}" (functions: ${Object.keys(EXPR_FUNCS).join(', ')})`);
        i++; const args = [];
        if (!(peek() && peek().t === 'op' && peek().v === ')')) { args.push(climb(0)); while (peek() && peek().t === 'op' && peek().v === ',') { i++; args.push(climb(0)); } }
        eat(')');
        const want = f[0];
        if ((want > 0 && args.length !== want) || (want === -1 && (args.length < 1 || args.length > 2)) || (want === -2 && args.length < 1)) throw new Error(`"${x.v}" was given ${args.length} value(s)`);
        return { fn: x.v, args };
      }
      return { id: x.v };
    }
    if (x.t === 'op' && x.v === '(') { const a = climb(0); eat(')'); return a; }
    throw new Error(`the formula has "${x.v}" where a number should be`);
  }
  function climb(min) {
    let a = unary();
    for (;;) {
      const x = peek(); if (!x || x.t !== 'op' || !(x.v in PREC)) break;
      const p = PREC[x.v]; if (p < min) break;
      i++;
      const b = climb(x.v === '^' ? p : p + 1);   // ^ is right-associative
      a = { op: x.v, a, b };
    }
    return a;
  }
  const tree = climb(0);
  if (i < tk.length) throw new Error(`the formula has something extra at "${tk[i].v}"`);
  return tree;
}
function exprRun(n, vars) {
  if ('n' in n) return n.n;
  if ('id' in n) {
    if (Object.prototype.hasOwnProperty.call(vars, n.id) && typeof vars[n.id] === 'number') return vars[n.id];
    if (Object.prototype.hasOwnProperty.call(EXPR_CONSTS, n.id)) return EXPR_CONSTS[n.id];
    throw new Error(`the formula names "${n.id}", which is not one of the values`);
  }
  if ('fn' in n) return EXPR_FUNCS[n.fn][1](...n.args.map(x => exprRun(x, vars)));
  const a = exprRun(n.a, vars);
  if (n.op === 'neg') return -a;
  const b = exprRun(n.b, vars);
  switch (n.op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b; case '^': return a ** b;
    case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
    case '==': return Math.abs(a - b) < 1e-9 ? 1 : 0; case '!=': return Math.abs(a - b) < 1e-9 ? 0 : 1;
    default: throw new Error('unknown operation');
  }
}
const exprCache = new Map();
/** A formula and its values -> a finite number, or it throws. */
function evalExpr(src, vars = {}) {
  let tree = exprCache.get(src);
  if (!tree) { tree = exprParse(src); if (exprCache.size > 200) exprCache.clear(); exprCache.set(src, tree); }
  const v = exprRun(tree, vars || {});
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('the formula does not give a finite number (a division by zero?)');
  return v;
}
/** Does this text parse as a formula? -> '' or why not. */
function exprProblem(src) { try { exprParse(src); return ''; } catch (e) { return String(e.message); } }

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
/** 1.2.0, config.purpose: practice on screen, a printable worksheet (with its answer key), a question generator. */
const PURPOSES = ['screen', 'worksheet', 'generator'];

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
function numText(x, dp = 3) { const k = 10 ** dp, r = Math.round((x + Math.sign(x) * 1e-12) * k) / k; return String(r === 0 ? 0 : r); }
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
const TOOLS = {
  'fractions.equiv': equiv, 'fractions.shade': shade, 'fractions.compare': compare,
  'numberline.point': point, 'numberline.jump': jump,
  'digits.add': colTool('digits.add'), 'digits.sub': colTool('digits.sub'), 'digits.mul': colTool('digits.mul'),
  'tiles.sort': sort, 'tiles.order': order,
  'figure.number': figNumber, 'figure.choice': figChoice,
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
function deal(activity, { seed = 1, seen = [], count: want = null } = {}) {
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
function selfTest(activity, words = null) {
  const out = [], a = activity && typeof activity === 'object' ? activity : {};
  const add = (at, why) => { if (out.length < 12) out.push({ at, why }); };
  const cfg = a.config && typeof a.config === 'object' ? a.config : {};
  if (cfg.support !== undefined && !SUPPORTS.includes(cfg.support)) add('config', `support must be one of ${SUPPORTS.join(', ')}`);
  // 1.1.0: the help modes it offers (the switcher): one to four of them, no repeats, and support (where it starts) one of them
  if (cfg.supports !== undefined && (!Array.isArray(cfg.supports) || !cfg.supports.length || cfg.supports.length > SUPPORTS.length || cfg.supports.some(x => !SUPPORTS.includes(x)) || new Set(cfg.supports).size !== cfg.supports.length)) add('config', `supports must be a list of one to four of ${SUPPORTS.join(', ')}, each once`);
  else if (Array.isArray(cfg.supports) && cfg.support !== undefined && SUPPORTS.includes(cfg.support) && !cfg.supports.includes(cfg.support)) add('config', 'support must be one of supports (where the activity starts)');
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

// ---- words.js
// Oomba Canvas: every word a student reads, in the site's languages (BRB.user.lang; en-GB and any other regional code
// falls back to its base language, then to English). {name} is a value: a number, a fraction (drawn stacked, read
// "n/d"), or another key of this table (a place name, a group). The Builder's own TASK, STEPS and HINTS lines are written
// in the builder's language and shown as they are; these are the kit's fixed lines.
const WORDS = {
  en: {
    helpMode: 'Help', watch: 'Watch', count: 'Count up', guided: 'Guided', own: 'On my own', keypad: 'Keypad', problemOf: 'Problem {n} of {total}',
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
    helpMode: 'Ayuda', watch: 'Mirar', count: 'Contar', guided: 'Guiado', own: 'Por mi cuenta', keypad: 'Teclado', problemOf: 'Problema {n} de {total}',
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
    helpMode: 'Aide', watch: 'Regarder', count: 'Compter', guided: 'Guidé', own: 'Tout seul', keypad: 'Clavier', problemOf: 'Problème {n} sur {total}',
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
    helpMode: 'Hilfe', watch: 'Zuschauen', count: 'Hochzählen', guided: 'Mit Hilfe', own: 'Allein', keypad: 'Ziffern', problemOf: 'Aufgabe {n} von {total}',
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
    helpMode: 'Aiuto', watch: 'Guarda', count: 'Conta', guided: 'Guidato', own: 'Da solo', keypad: 'Tastierino', problemOf: 'Problema {n} di {total}',
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
    helpMode: 'Ajuda', watch: 'Assistir', count: 'Contar', guided: 'Com ajuda', own: 'Sozinho', keypad: 'Teclado', problemOf: 'Problema {n} de {total}',
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
    helpMode: 'Hulp', watch: 'Kijken', count: 'Optellen', guided: 'Met hulp', own: 'Zelf', keypad: 'Cijfers', problemOf: 'Opgave {n} van {total}',
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
    helpMode: 'Помощь', watch: 'Смотреть', count: 'Считать', guided: 'С подсказками', own: 'Сам', keypad: 'Цифры', problemOf: 'Задача {n} из {total}',
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
    helpMode: 'てつだい', watch: '見る', count: '数える', guided: 'ヒントあり', own: 'ひとりで', keypad: 'すうじ', problemOf: 'もんだい {n} / {total}',
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
    helpMode: '協助', watch: '看示範', count: '往上數', guided: '有提示', own: '自己來', keypad: '數字鍵', problemOf: '第 {n} 題，共 {total} 題',
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
    helpMode: 'المساعدة', watch: 'شاهد', count: 'عُدّ', guided: 'بمساعدة', own: 'وحدي', keypad: 'الأرقام', problemOf: 'المسألة {n} من {total}',
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
    helpMode: 'עזרה', watch: 'צפייה', count: 'ספירה', guided: 'עם עזרה', own: 'לבד', keypad: 'ספרות', problemOf: 'תרגיל {n} מתוך {total}',
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
// 1.2.0: figure questions and printed worksheets (merged into the tables above).
const WORDS_120 = {
  en: {
    figRead: 'Look at the figure and read the question.', figWork: 'Work it out. Write your working on paper if it helps.', figType: 'Type your answer.', figTypeU: 'Type your answer in {u}.',
    figPick: 'Tap the answer you think is right.', figAsk: 'Type the answer, then press Check.', figAskDp: 'Type the answer to {dp} decimal places, then press Check.', figPickQ: 'Tap an answer, then press Check.',
    figH1: 'Read every label and number on the figure.', figH2: 'Write down what you know and what you need to find.', figH3: 'Check your working and your units.',
    fbNum: 'Type a number first.', fbPickOne: 'Tap an answer first.', fbFig: 'Look at the figure again.', point: 'Decimal point', figMissing: 'The figure could not be drawn here.',
    ansShade: 'Shade {n} of the {d} parts.', ansValue: '{x}',
    print: 'Print worksheet', printH: 'Print a worksheet', printCount: 'Questions', fewer: 'Fewer', more: 'More', paper: 'Paper', a4: 'A4', letter: 'US Letter',
    keyAdd: 'Add the answer key (on its own page)', sheetNo: 'Sheet {code}', sheetNoH: 'Sheet number', sheetType: 'To print a sheet again, tap the number and type it.',
    newSheet: 'New sheet', printGo: 'Print', close: 'Close', printBusy: 'Getting the page ready…', printOk: 'The print window is open.', printNo: 'Printing is not available here.',
    printErr: 'That did not print. Try again.', printTap: 'Tap Print again.', keyTeacher: 'The answer key is for teachers.',
  },
  es: {
    figRead: 'Mira la figura y lee la pregunta.', figWork: 'Resuélvelo. Si te ayuda, escribe los pasos en papel.', figType: 'Escribe tu respuesta.', figTypeU: 'Escribe tu respuesta en {u}.',
    figPick: 'Toca la respuesta que crees correcta.', figAsk: 'Escribe la respuesta y pulsa Comprobar.', figAskDp: 'Escribe la respuesta con {dp} decimales y pulsa Comprobar.', figPickQ: 'Toca una respuesta y pulsa Comprobar.',
    figH1: 'Lee cada etiqueta y cada número de la figura.', figH2: 'Anota lo que sabes y lo que tienes que hallar.', figH3: 'Revisa tus cálculos y las unidades.',
    fbNum: 'Primero escribe un número.', fbPickOne: 'Primero toca una respuesta.', fbFig: 'Vuelve a mirar la figura.', point: 'Coma decimal', figMissing: 'Aquí no se pudo dibujar la figura.',
    ansShade: 'Colorea {n} de las {d} partes.', ansValue: '{x}',
    print: 'Imprimir ficha', printH: 'Imprimir una ficha', printCount: 'Preguntas', fewer: 'Menos', more: 'Más', paper: 'Papel', a4: 'A4', letter: 'Carta (EE. UU.)',
    keyAdd: 'Añadir las soluciones (en una página aparte)', sheetNo: 'Ficha {code}', sheetNoH: 'Número de ficha', sheetType: 'Para volver a imprimir una ficha, toca el número y escríbelo.',
    newSheet: 'Ficha nueva', printGo: 'Imprimir', close: 'Cerrar', printBusy: 'Preparando la página…', printOk: 'Se abrió la ventana de impresión.', printNo: 'Aquí no se puede imprimir.',
    printErr: 'No se pudo imprimir. Inténtalo de nuevo.', printTap: 'Vuelve a tocar Imprimir.', keyTeacher: 'Las soluciones son para el profesorado.',
  },
  fr: {
    figRead: 'Regarde la figure et lis la question.', figWork: 'Cherche la réponse. Écris tes calculs sur papier si cela t’aide.', figType: 'Tape ta réponse.', figTypeU: 'Tape ta réponse en {u}.',
    figPick: 'Touche la réponse qui te semble juste.', figAsk: 'Tape la réponse, puis appuie sur Vérifier.', figAskDp: 'Tape la réponse avec {dp} décimales, puis appuie sur Vérifier.', figPickQ: 'Touche une réponse, puis appuie sur Vérifier.',
    figH1: 'Lis chaque étiquette et chaque nombre de la figure.', figH2: 'Note ce que tu sais et ce que tu dois trouver.', figH3: 'Vérifie tes calculs et tes unités.',
    fbNum: 'Tape d’abord un nombre.', fbPickOne: 'Touche d’abord une réponse.', fbFig: 'Regarde encore la figure.', point: 'Virgule', figMissing: 'La figure n’a pas pu être dessinée ici.',
    ansShade: 'Colorie {n} des {d} parts.', ansValue: '{x}',
    print: 'Imprimer la fiche', printH: 'Imprimer une fiche', printCount: 'Questions', fewer: 'Moins', more: 'Plus', paper: 'Papier', a4: 'A4', letter: 'Lettre US',
    keyAdd: 'Ajouter le corrigé (sur une page à part)', sheetNo: 'Fiche {code}', sheetNoH: 'Numéro de fiche', sheetType: 'Pour réimprimer une fiche, touche le numéro et tape-le.',
    newSheet: 'Nouvelle fiche', printGo: 'Imprimer', close: 'Fermer', printBusy: 'Préparation de la page…', printOk: 'La fenêtre d’impression est ouverte.', printNo: 'L’impression n’est pas possible ici.',
    printErr: 'L’impression n’a pas marché. Réessaie.', printTap: 'Touche encore Imprimer.', keyTeacher: 'Le corrigé est réservé aux enseignants.',
  },
  de: {
    figRead: 'Sieh dir die Abbildung an und lies die Frage.', figWork: 'Rechne es aus. Schreib deinen Rechenweg auf Papier, wenn es hilft.', figType: 'Tippe deine Antwort ein.', figTypeU: 'Tippe deine Antwort in {u} ein.',
    figPick: 'Tippe auf die Antwort, die du für richtig hältst.', figAsk: 'Tippe die Antwort ein und drücke dann Prüfen.', figAskDp: 'Tippe die Antwort mit {dp} Nachkommastellen ein und drücke dann Prüfen.', figPickQ: 'Tippe auf eine Antwort und drücke dann Prüfen.',
    figH1: 'Lies jede Beschriftung und jede Zahl in der Abbildung.', figH2: 'Schreib auf, was du weißt und was du suchst.', figH3: 'Prüfe deinen Rechenweg und die Einheiten.',
    fbNum: 'Tippe zuerst eine Zahl ein.', fbPickOne: 'Tippe zuerst auf eine Antwort.', fbFig: 'Sieh dir die Abbildung noch einmal an.', point: 'Komma', figMissing: 'Die Abbildung konnte hier nicht gezeichnet werden.',
    ansShade: 'Male {n} der {d} Teile an.', ansValue: '{x}',
    print: 'Arbeitsblatt drucken', printH: 'Ein Arbeitsblatt drucken', printCount: 'Aufgaben', fewer: 'Weniger', more: 'Mehr', paper: 'Papier', a4: 'A4', letter: 'US-Letter',
    keyAdd: 'Lösungen dazu (auf einer eigenen Seite)', sheetNo: 'Blatt {code}', sheetNoH: 'Blattnummer', sheetType: 'Um ein Blatt noch einmal zu drucken, tippe auf die Nummer und gib sie ein.',
    newSheet: 'Neues Blatt', printGo: 'Drucken', close: 'Schließen', printBusy: 'Die Seite wird vorbereitet …', printOk: 'Das Druckfenster ist offen.', printNo: 'Drucken ist hier nicht möglich.',
    printErr: 'Das Drucken hat nicht geklappt. Versuch es noch einmal.', printTap: 'Tippe noch einmal auf Drucken.', keyTeacher: 'Die Lösungen sind für Lehrkräfte.',
  },
  it: {
    figRead: 'Guarda la figura e leggi la domanda.', figWork: 'Risolvilo. Se ti aiuta, scrivi i passaggi su carta.', figType: 'Scrivi la tua risposta.', figTypeU: 'Scrivi la tua risposta in {u}.',
    figPick: 'Tocca la risposta che pensi sia giusta.', figAsk: 'Scrivi la risposta, poi premi Controlla.', figAskDp: 'Scrivi la risposta con {dp} cifre decimali, poi premi Controlla.', figPickQ: 'Tocca una risposta, poi premi Controlla.',
    figH1: 'Leggi ogni etichetta e ogni numero della figura.', figH2: 'Scrivi quello che sai e quello che devi trovare.', figH3: 'Controlla i calcoli e le unità di misura.',
    fbNum: 'Prima scrivi un numero.', fbPickOne: 'Prima tocca una risposta.', fbFig: 'Guarda di nuovo la figura.', point: 'Virgola', figMissing: 'Qui non è stato possibile disegnare la figura.',
    ansShade: 'Colora {n} delle {d} parti.', ansValue: '{x}',
    print: 'Stampa la scheda', printH: 'Stampa una scheda', printCount: 'Domande', fewer: 'Meno', more: 'Più', paper: 'Carta', a4: 'A4', letter: 'Letter USA',
    keyAdd: 'Aggiungi le soluzioni (su una pagina a parte)', sheetNo: 'Scheda {code}', sheetNoH: 'Numero della scheda', sheetType: 'Per ristampare una scheda, tocca il numero e scrivilo.',
    newSheet: 'Nuova scheda', printGo: 'Stampa', close: 'Chiudi', printBusy: 'Preparo la pagina…', printOk: 'La finestra di stampa è aperta.', printNo: 'Qui non si può stampare.',
    printErr: 'La stampa non è riuscita. Riprova.', printTap: 'Tocca di nuovo Stampa.', keyTeacher: 'Le soluzioni sono per gli insegnanti.',
  },
  pt: {
    figRead: 'Observa a figura e lê a pergunta.', figWork: 'Resolve. Se ajudar, escreve as contas no papel.', figType: 'Escreve a tua resposta.', figTypeU: 'Escreve a tua resposta em {u}.',
    figPick: 'Toca na resposta que achas certa.', figAsk: 'Escreve a resposta e carrega em Verificar.', figAskDp: 'Escreve a resposta com {dp} casas decimais e carrega em Verificar.', figPickQ: 'Toca numa resposta e carrega em Verificar.',
    figH1: 'Lê cada legenda e cada número da figura.', figH2: 'Escreve o que sabes e o que precisas de encontrar.', figH3: 'Confirma as contas e as unidades.',
    fbNum: 'Primeiro escreve um número.', fbPickOne: 'Primeiro toca numa resposta.', fbFig: 'Observa outra vez a figura.', point: 'Vírgula decimal', figMissing: 'Não foi possível desenhar a figura aqui.',
    ansShade: 'Pinta {n} das {d} partes.', ansValue: '{x}',
    print: 'Imprimir ficha', printH: 'Imprimir uma ficha', printCount: 'Perguntas', fewer: 'Menos', more: 'Mais', paper: 'Papel', a4: 'A4', letter: 'Carta (EUA)',
    keyAdd: 'Juntar as soluções (numa página à parte)', sheetNo: 'Ficha {code}', sheetNoH: 'Número da ficha', sheetType: 'Para voltar a imprimir uma ficha, toca no número e escreve-o.',
    newSheet: 'Nova ficha', printGo: 'Imprimir', close: 'Fechar', printBusy: 'A preparar a página…', printOk: 'A janela de impressão está aberta.', printNo: 'Não é possível imprimir aqui.',
    printErr: 'Não foi possível imprimir. Tenta outra vez.', printTap: 'Toca outra vez em Imprimir.', keyTeacher: 'As soluções são para os professores.',
  },
  nl: {
    figRead: 'Bekijk de figuur en lees de vraag.', figWork: 'Reken het uit. Schrijf je berekening op papier als dat helpt.', figType: 'Typ je antwoord.', figTypeU: 'Typ je antwoord in {u}.',
    figPick: 'Tik op het antwoord dat volgens jou klopt.', figAsk: 'Typ het antwoord en druk dan op Controleren.', figAskDp: 'Typ het antwoord met {dp} decimalen en druk dan op Controleren.', figPickQ: 'Tik op een antwoord en druk dan op Controleren.',
    figH1: 'Lees elk label en elk getal in de figuur.', figH2: 'Schrijf op wat je weet en wat je moet vinden.', figH3: 'Controleer je berekening en de eenheden.',
    fbNum: 'Typ eerst een getal.', fbPickOne: 'Tik eerst op een antwoord.', fbFig: 'Kijk nog eens naar de figuur.', point: 'Komma', figMissing: 'De figuur kon hier niet getekend worden.',
    ansShade: 'Kleur {n} van de {d} delen.', ansValue: '{x}',
    print: 'Werkblad afdrukken', printH: 'Een werkblad afdrukken', printCount: 'Vragen', fewer: 'Minder', more: 'Meer', paper: 'Papier', a4: 'A4', letter: 'US Letter',
    keyAdd: 'Antwoorden erbij (op een eigen pagina)', sheetNo: 'Blad {code}', sheetNoH: 'Bladnummer', sheetType: 'Tik op het nummer en typ het om een blad opnieuw af te drukken.',
    newSheet: 'Nieuw blad', printGo: 'Afdrukken', close: 'Sluiten', printBusy: 'De pagina wordt klaargemaakt…', printOk: 'Het afdrukvenster is open.', printNo: 'Afdrukken kan hier niet.',
    printErr: 'Afdrukken is niet gelukt. Probeer het opnieuw.', printTap: 'Tik nog eens op Afdrukken.', keyTeacher: 'De antwoorden zijn voor leraren.',
  },
  ru: {
    figRead: 'Посмотри на рисунок и прочитай вопрос.', figWork: 'Реши. Если удобно, запиши решение на бумаге.', figType: 'Введи ответ.', figTypeU: 'Введи ответ в {u}.',
    figPick: 'Нажми на ответ, который считаешь верным.', figAsk: 'Введи ответ и нажми «Проверить».', figAskDp: 'Введи ответ с {dp} знаками после запятой и нажми «Проверить».', figPickQ: 'Нажми на ответ, потом «Проверить».',
    figH1: 'Прочитай все подписи и числа на рисунке.', figH2: 'Запиши, что известно и что нужно найти.', figH3: 'Проверь решение и единицы измерения.',
    fbNum: 'Сначала введи число.', fbPickOne: 'Сначала выбери ответ.', fbFig: 'Посмотри на рисунок ещё раз.', point: 'Десятичная запятая', figMissing: 'Здесь не удалось нарисовать рисунок.',
    ansShade: 'Закрась {n} из {d} частей.', ansValue: '{x}',
    print: 'Распечатать лист', printH: 'Распечатать рабочий лист', printCount: 'Вопросы', fewer: 'Меньше', more: 'Больше', paper: 'Бумага', a4: 'A4', letter: 'US Letter',
    keyAdd: 'Добавить ответы (на отдельной странице)', sheetNo: 'Лист {code}', sheetNoH: 'Номер листа', sheetType: 'Чтобы снова распечатать лист, нажми на номер и введи его.',
    newSheet: 'Новый лист', printGo: 'Печать', close: 'Закрыть', printBusy: 'Готовим страницу…', printOk: 'Окно печати открыто.', printNo: 'Здесь печать недоступна.',
    printErr: 'Не получилось распечатать. Попробуй ещё раз.', printTap: 'Нажми «Печать» ещё раз.', keyTeacher: 'Ответы — для учителей.',
  },
  ja: {
    figRead: '図を見て、問題を読もう。', figWork: '考えて解こう。紙に式を書いてもいいよ。', figType: '答えを入力しよう。', figTypeU: '答えを{u}で入力しよう。',
    figPick: '正しいと思う答えをタップしよう。', figAsk: '答えを入力して「答え合わせ」を押そう。', figAskDp: '答えを小数第{dp}位まで入力して「答え合わせ」を押そう。', figPickQ: '答えをタップして「答え合わせ」を押そう。',
    figH1: '図のラベルと数をすべて読もう。', figH2: 'わかっていることと、求めるものを書き出そう。', figH3: '計算と単位を見直そう。',
    fbNum: 'まず数を入力しよう。', fbPickOne: 'まず答えをタップしよう。', fbFig: 'もう一度図を見てみよう。', point: '小数点', figMissing: 'ここでは図をかけませんでした。',
    ansShade: '{d}こに分けたうちの{n}こをぬる。', ansValue: '{x}',
    print: 'プリントを印刷', printH: 'プリントを印刷する', printCount: '問題の数', fewer: '減らす', more: '増やす', paper: '用紙', a4: 'A4', letter: 'USレター',
    keyAdd: '解答も付ける（別のページ）', sheetNo: 'プリント {code}', sheetNoH: 'プリント番号', sheetType: '同じプリントをもう一度印刷するには、番号をタップして入力してね。',
    newSheet: '新しいプリント', printGo: '印刷', close: '閉じる', printBusy: 'ページを準備しています…', printOk: '印刷画面が開きました。', printNo: 'ここでは印刷できません。',
    printErr: '印刷できませんでした。もう一度試してね。', printTap: 'もう一度「印刷」をタップしてね。', keyTeacher: '解答は先生用です。',
  },
  'zh-Hant': {
    figRead: '看看圖，讀一讀題目。', figWork: '算算看。需要的話，可以把算式寫在紙上。', figType: '輸入你的答案。', figTypeU: '用{u}輸入你的答案。',
    figPick: '點選你認為正確的答案。', figAsk: '輸入答案，再按「檢查」。', figAskDp: '輸入答案到小數點後{dp}位，再按「檢查」。', figPickQ: '點選一個答案，再按「檢查」。',
    figH1: '讀一讀圖上每個標示和數字。', figH2: '寫下已知的和要找的。', figH3: '檢查你的算式和單位。',
    fbNum: '先輸入一個數。', fbPickOne: '先點選一個答案。', fbFig: '再看一次圖。', point: '小數點', figMissing: '這裡畫不出這張圖。',
    ansShade: '把{d}份中的{n}份塗色。', ansValue: '{x}',
    print: '列印學習單', printH: '列印一張學習單', printCount: '題數', fewer: '減少', more: '增加', paper: '紙張', a4: 'A4', letter: '美式 Letter',
    keyAdd: '附上解答（另起一頁）', sheetNo: '學習單 {code}', sheetNoH: '學習單編號', sheetType: '要再印一次同一張，點一下編號並輸入它。',
    newSheet: '新的一張', printGo: '列印', close: '關閉', printBusy: '正在準備頁面…', printOk: '列印視窗已開啟。', printNo: '這裡不能列印。',
    printErr: '沒有印成功，請再試一次。', printTap: '請再點一次「列印」。', keyTeacher: '解答是給老師用的。',
  },
  ar: {
    figRead: 'انظر إلى الشكل واقرأ السؤال.', figWork: 'احسبها. اكتب خطوات الحل على ورقة إن ساعدك ذلك.', figType: 'اكتب إجابتك.', figTypeU: 'اكتب إجابتك بوحدة {u}.',
    figPick: 'اضغط على الإجابة التي تظنها صحيحة.', figAsk: 'اكتب الإجابة ثم اضغط تحقّق.', figAskDp: 'اكتب الإجابة بـ{dp} منازل عشرية ثم اضغط تحقّق.', figPickQ: 'اضغط على إجابة ثم اضغط تحقّق.',
    figH1: 'اقرأ كل تسمية وكل رقم في الشكل.', figH2: 'اكتب ما تعرفه وما عليك إيجاده.', figH3: 'راجع خطوات الحل والوحدات.',
    fbNum: 'اكتب رقمًا أولًا.', fbPickOne: 'اضغط على إجابة أولًا.', fbFig: 'انظر إلى الشكل مرة أخرى.', point: 'الفاصلة العشرية', figMissing: 'تعذّر رسم الشكل هنا.',
    ansShade: 'لوّن {n} من الأجزاء الـ{d}.', ansValue: '{x}',
    print: 'اطبع ورقة العمل', printH: 'طباعة ورقة عمل', printCount: 'الأسئلة', fewer: 'أقل', more: 'أكثر', paper: 'الورق', a4: 'A4', letter: 'Letter الأمريكي',
    keyAdd: 'أضف مفتاح الإجابات (في صفحة مستقلة)', sheetNo: 'الورقة {code}', sheetNoH: 'رقم الورقة', sheetType: 'لطباعة ورقة مرة أخرى، اضغط على الرقم واكتبه.',
    newSheet: 'ورقة جديدة', printGo: 'اطبع', close: 'إغلاق', printBusy: 'جارٍ تجهيز الصفحة…', printOk: 'نافذة الطباعة مفتوحة.', printNo: 'الطباعة غير متاحة هنا.',
    printErr: 'لم تتم الطباعة. حاول مرة أخرى.', printTap: 'اضغط اطبع مرة أخرى.', keyTeacher: 'مفتاح الإجابات للمعلمين.',
  },
  he: {
    figRead: 'הסתכלו באיור וקראו את השאלה.', figWork: 'פתרו. אם זה עוזר, כתבו את הדרך על דף.', figType: 'הקלידו את התשובה.', figTypeU: 'הקלידו את התשובה ב־{u}.',
    figPick: 'לחצו על התשובה שנראית לכם נכונה.', figAsk: 'הקלידו את התשובה ולחצו על בדיקה.', figAskDp: 'הקלידו את התשובה עם {dp} ספרות אחרי הנקודה ולחצו על בדיקה.', figPickQ: 'לחצו על תשובה ואז על בדיקה.',
    figH1: 'קראו כל תווית וכל מספר באיור.', figH2: 'כתבו מה ידוע ומה צריך למצוא.', figH3: 'בדקו את הדרך ואת היחידות.',
    fbNum: 'קודם הקלידו מספר.', fbPickOne: 'קודם לחצו על תשובה.', fbFig: 'הסתכלו שוב באיור.', point: 'נקודה עשרונית', figMissing: 'לא הצלחנו לצייר כאן את האיור.',
    ansShade: 'צבעו {n} מתוך {d} החלקים.', ansValue: '{x}',
    print: 'הדפסת דף עבודה', printH: 'הדפסת דף עבודה', printCount: 'שאלות', fewer: 'פחות', more: 'יותר', paper: 'נייר', a4: 'A4', letter: 'Letter אמריקאי',
    keyAdd: 'להוסיף דף תשובות (בעמוד נפרד)', sheetNo: 'דף {code}', sheetNoH: 'מספר הדף', sheetType: 'כדי להדפיס שוב דף, לחצו על המספר והקלידו אותו.',
    newSheet: 'דף חדש', printGo: 'הדפסה', close: 'סגירה', printBusy: 'מכינים את הדף…', printOk: 'חלון ההדפסה פתוח.', printNo: 'אי אפשר להדפיס כאן.',
    printErr: 'ההדפסה לא הצליחה. נסו שוב.', printTap: 'לחצו שוב על הדפסה.', keyTeacher: 'דף התשובות מיועד למורים.',
  },
};
for (const l of Object.keys(WORDS_120)) Object.assign(WORDS[l], WORDS_120[l]);
// 1.3.0: the teacher's controls (teach.js) and the worked answer's heading (merged into the tables above).
const WORDS_130 = {
  en: {
    teacher: "Teacher", teacherOnly: "students don't see this bar", teacherNote: "Only you see this. Students never do.", showAnswer: "Show answer", showAnswerD: "The worked steps for this problem. It won't count.", boardMode: "Board mode", boardModeD: "Big type for the board. You drive, no score is sent.", leaveBoard: "Leave board mode", boardChip: "Board mode · no scores sent", helpHere: "Help on this screen", newSetT: "New set", newProblems: "New problems", newProblemsD: "Start a fresh set from the generator.", newSetNone: "This activity has no question generator.", shownByTeacher: "Answer shown by the teacher. This one is not counted.", workedAnswer: "Worked answer", nOfN: "{n} of {total}",
  },
  es: {
    teacher: "Docente", teacherOnly: "el alumnado no ve esta barra", teacherNote: "Solo lo ves tú. Los estudiantes nunca.", showAnswer: "Mostrar respuesta", showAnswerD: "Los pasos resueltos de este problema. No contará.", boardMode: "Modo pizarra", boardModeD: "Letra grande para la pizarra. Tú decides; no se envía ninguna nota.", leaveBoard: "Salir del modo pizarra", boardChip: "Modo pizarra · no se envían notas", helpHere: "Ayuda en esta pantalla", newSetT: "Serie nueva", newProblems: "Problemas nuevos", newProblemsD: "Empieza una serie nueva con el generador.", newSetNone: "Esta actividad no tiene generador de preguntas.", shownByTeacher: "Respuesta mostrada por el docente. Esta no cuenta.", workedAnswer: "Respuesta resuelta", nOfN: "{n} de {total}",
  },
  fr: {
    teacher: "Enseignant", teacherOnly: "les élèves ne voient pas cette barre", teacherNote: "Vous seul voyez ceci. Les élèves jamais.", showAnswer: "Montrer la réponse", showAnswerD: "Les étapes résolues de ce problème. Il ne comptera pas.", boardMode: "Mode tableau", boardModeD: "Gros caractères pour le tableau. Vous menez, aucune note n'est envoyée.", leaveBoard: "Quitter le mode tableau", boardChip: "Mode tableau · aucune note envoyée", helpHere: "Aide sur cet écran", newSetT: "Nouvelle série", newProblems: "Nouveaux problèmes", newProblemsD: "Commencer une nouvelle série avec le générateur.", newSetNone: "Cette activité n'a pas de générateur de questions.", shownByTeacher: "Réponse montrée par l'enseignant. Celle-ci ne compte pas.", workedAnswer: "Réponse résolue", nOfN: "{n} sur {total}",
  },
  de: {
    teacher: "Lehrkraft", teacherOnly: "Schüler sehen diese Leiste nicht", teacherNote: "Nur Sie sehen das. Schüler nie.", showAnswer: "Antwort zeigen", showAnswerD: "Die gelösten Schritte dieser Aufgabe. Sie zählt nicht.", boardMode: "Tafelmodus", boardModeD: "Große Schrift für die Tafel. Sie steuern, es wird kein Ergebnis gesendet.", leaveBoard: "Tafelmodus beenden", boardChip: "Tafelmodus · keine Ergebnisse gesendet", helpHere: "Hilfe auf diesem Bildschirm", newSetT: "Neue Runde", newProblems: "Neue Aufgaben", newProblemsD: "Eine neue Runde aus dem Generator starten.", newSetNone: "Diese Aktivität hat keinen Aufgabengenerator.", shownByTeacher: "Antwort von der Lehrkraft gezeigt. Diese Aufgabe zählt nicht.", workedAnswer: "Gelöste Antwort", nOfN: "{n} von {total}",
  },
  it: {
    teacher: "Insegnante", teacherOnly: "gli studenti non vedono questa barra", teacherNote: "Lo vede solo lei. Gli studenti mai.", showAnswer: "Mostra la risposta", showAnswerD: "I passaggi risolti di questo problema. Non conterà.", boardMode: "Modalità lavagna", boardModeD: "Testo grande per la lavagna. Guida lei, nessun punteggio viene inviato.", leaveBoard: "Esci dalla modalità lavagna", boardChip: "Modalità lavagna · nessun punteggio inviato", helpHere: "Aiuto su questa schermata", newSetT: "Nuova serie", newProblems: "Nuovi problemi", newProblemsD: "Inizia una nuova serie dal generatore.", newSetNone: "Questa attività non ha un generatore di domande.", shownByTeacher: "Risposta mostrata dall'insegnante. Questa non conta.", workedAnswer: "Risposta svolta", nOfN: "{n} di {total}",
  },
  pt: {
    teacher: "Professor", teacherOnly: "os alunos não veem esta barra", teacherNote: "Só você vê isto. Os alunos nunca.", showAnswer: "Mostrar resposta", showAnswerD: "Os passos resolvidos deste problema. Não vai contar.", boardMode: "Modo quadro", boardModeD: "Letra grande para o quadro. Você conduz, nenhuma nota é enviada.", leaveBoard: "Sair do modo quadro", boardChip: "Modo quadro · nenhuma nota enviada", helpHere: "Ajuda nesta tela", newSetT: "Nova série", newProblems: "Novos problemas", newProblemsD: "Comece uma nova série a partir do gerador.", newSetNone: "Esta atividade não tem gerador de perguntas.", shownByTeacher: "Resposta mostrada pelo professor. Esta não conta.", workedAnswer: "Resposta resolvida", nOfN: "{n} de {total}",
  },
  nl: {
    teacher: "Leraar", teacherOnly: "leerlingen zien deze balk niet", teacherNote: "Alleen u ziet dit. Leerlingen nooit.", showAnswer: "Antwoord tonen", showAnswerD: "De uitgewerkte stappen van deze opgave. Die telt niet mee.", boardMode: "Bordmodus", boardModeD: "Grote letters voor het bord. U stuurt, er wordt geen score verstuurd.", leaveBoard: "Bordmodus verlaten", boardChip: "Bordmodus · er worden geen scores verstuurd", helpHere: "Hulp op dit scherm", newSetT: "Nieuwe reeks", newProblems: "Nieuwe opgaven", newProblemsD: "Begin een nieuwe reeks uit de generator.", newSetNone: "Deze activiteit heeft geen vragengenerator.", shownByTeacher: "Antwoord getoond door de leraar. Deze telt niet mee.", workedAnswer: "Uitgewerkt antwoord", nOfN: "{n} van {total}",
  },
  ru: {
    teacher: "Учитель", teacherOnly: "ученики не видят эту панель", teacherNote: "Это видите только вы. Ученики — никогда.", showAnswer: "Показать ответ", showAnswerD: "Решение этой задачи по шагам. Она не будет засчитана.", boardMode: "Режим доски", boardModeD: "Крупный шрифт для доски. Ведёте вы, результаты не отправляются.", leaveBoard: "Выйти из режима доски", boardChip: "Режим доски · результаты не отправляются", helpHere: "Помощь на этом экране", newSetT: "Новый набор", newProblems: "Новые задачи", newProblemsD: "Начать новый набор из генератора.", newSetNone: "В этом задании нет генератора вопросов.", shownByTeacher: "Ответ показал учитель. Эта задача не засчитывается.", workedAnswer: "Решение", nOfN: "{n} из {total}",
  },
  ja: {
    teacher: "先生", teacherOnly: "生徒にはこのバーは表示されません", teacherNote: "これはあなただけに表示されます。生徒には表示されません。", showAnswer: "答えを見せる", showAnswerD: "この問題の解き方の手順です。採点されません。", boardMode: "黒板モード", boardModeD: "黒板用の大きな文字。先生が進め、点数は送信されません。", leaveBoard: "黒板モードを終わる", boardChip: "黒板モード・点数は送信されません", helpHere: "この画面のヘルプ", newSetT: "新しいセット", newProblems: "新しい問題", newProblemsD: "問題ジェネレーターで新しいセットを始めます。", newSetNone: "このアクティビティには問題ジェネレーターがありません。", shownByTeacher: "先生が答えを見せました。この問題は数えません。", workedAnswer: "解き方", nOfN: "{n} / {total}",
  },
  'zh-Hant': {
    teacher: "老師", teacherOnly: "學生看不到這一列", teacherNote: "只有你看得到，學生永遠看不到。", showAnswer: "顯示答案", showAnswerD: "這一題的解題步驟。這一題不計分。", boardMode: "黑板模式", boardModeD: "黑板用的大字。由你操作，不會送出分數。", leaveBoard: "離開黑板模式", boardChip: "黑板模式 · 不送出分數", helpHere: "這個畫面的協助", newSetT: "新的一組", newProblems: "新的題目", newProblemsD: "用題目產生器開始新的一組。", newSetNone: "這個活動沒有題目產生器。", shownByTeacher: "答案由老師顯示。這一題不計分。", workedAnswer: "解題過程", nOfN: "{n} / {total}",
  },
  ar: {
    teacher: "المعلم", teacherOnly: "لا يرى الطلاب هذا الشريط", teacherNote: "أنت وحدك ترى هذا. الطلاب لا يرونه أبدًا.", showAnswer: "اعرض الإجابة", showAnswerD: "خطوات حل هذه المسألة. لن تُحتسب.", boardMode: "وضع السبورة", boardModeD: "خط كبير للسبورة. أنت تقود، ولا تُرسل أي نتيجة.", leaveBoard: "اخرج من وضع السبورة", boardChip: "وضع السبورة · لا تُرسل نتائج", helpHere: "المساعدة في هذه الشاشة", newSetT: "مجموعة جديدة", newProblems: "مسائل جديدة", newProblemsD: "ابدأ مجموعة جديدة من المولّد.", newSetNone: "لا يوجد في هذا النشاط مولّد أسئلة.", shownByTeacher: "عرض المعلم الإجابة. هذه المسألة لا تُحتسب.", workedAnswer: "الإجابة المحلولة", nOfN: "{n} من {total}",
  },
  he: {
    teacher: "מורה", teacherOnly: "תלמידים לא רואים את הסרגל הזה", teacherNote: "רק אתם רואים את זה. תלמידים אף פעם לא.", showAnswer: "הצגת התשובה", showAnswerD: "שלבי הפתרון של התרגיל הזה. הוא לא ייספר.", boardMode: "מצב לוח", boardModeD: "אותיות גדולות ללוח. אתם מובילים, ולא נשלח ציון.", leaveBoard: "יציאה ממצב לוח", boardChip: "מצב לוח · לא נשלחים ציונים", helpHere: "עזרה במסך הזה", newSetT: "סדרה חדשה", newProblems: "תרגילים חדשים", newProblemsD: "להתחיל סדרה חדשה מהמחולל.", newSetNone: "בפעילות הזאת אין מחולל שאלות.", shownByTeacher: "המורה הציג את התשובה. התרגיל הזה לא נספר.", workedAnswer: "הפתרון", nOfN: "{n} מתוך {total}",
  },
};
for (const l of Object.keys(WORDS_130)) Object.assign(WORDS[l], WORDS_130[l]);
// 1.4.0: worksheets (sets.js): My worksheets, a worksheet a link opened, and printing one (merged into the tables above).
const WORDS_140 = {
  en: {
    wsShort: "Worksheets",
    wsTitle: "My worksheets", wsMenuD: "Save the questions on screen, or open, print and share one you saved.", wsUntitled: "Worksheet", wsOne: "1 question", wsMany: "{n} questions",
    wsSave: "Save as worksheet", wsSaveD: "Saves the {n} questions on screen under a class code.", wsSaving: "Saving…", wsSaved: "Saved. Class code: {code}",
    wsOnScreen: "On screen: {title}", wsLoading: "Loading your worksheets…", wsLoadFail: "Couldn't load your worksheets.", wsRetry: "Try again",
    wsEmpty: "No worksheets yet. Save the questions on screen to make one.", wsCodeSay: "Class code {code}", wsPrintFor: "Print {title}", wsMore: "More", wsMoreFor: "More for {title}",
    wsKey: "Answer key", wsCopy: "Copy link", wsCopied: "Link copied.", wsCopyNo: "Couldn't copy. The link is {link}", wsDup: "Duplicate", wsDupDone: "Copy made. It's at the top of the list.",
    wsRename: "Rename", wsName: "Worksheet name", wsRenameSave: "Save", wsCancel: "Cancel", wsRenamed: "Renamed.", wsBadName: "That name isn't allowed. Try another.",
    wsDelete: "Delete", wsDelAsk: "Delete “{title}”? Its class code and link stop working.", wsKeep: "Keep it", wsDeleted: "Deleted.",
    wsFull: "You've saved as many worksheets as you can here. Delete one first.", wsCannot: "These questions can't be saved.", wsGone: "That worksheet isn't there any more.", wsErr: "That didn't work. Try again.",
    wsPrints: "Prints worksheet {code}: {n} questions, with its class code.", wsMissing: "This worksheet isn't on Oomba any more. Here are the activity's own questions.",
  },
  es: {
    wsShort: "Fichas",
    wsTitle: "Mis fichas", wsMenuD: "Guarda las preguntas de la pantalla, o abre, imprime y comparte una ficha guardada.", wsUntitled: "Ficha", wsOne: "1 pregunta", wsMany: "{n} preguntas",
    wsSave: "Guardar como ficha", wsSaveD: "Guarda las {n} preguntas de la pantalla con un código de clase.", wsSaving: "Guardando…", wsSaved: "Guardada. Código de clase: {code}",
    wsOnScreen: "En pantalla: {title}", wsLoading: "Cargando tus fichas…", wsLoadFail: "No se pudieron cargar tus fichas.", wsRetry: "Reintentar",
    wsEmpty: "Aún no hay fichas. Guarda las preguntas de la pantalla para crear una.", wsCodeSay: "Código de clase {code}", wsPrintFor: "Imprimir {title}", wsMore: "Más", wsMoreFor: "Más opciones de {title}",
    wsKey: "Solucionario", wsCopy: "Copiar enlace", wsCopied: "Enlace copiado.", wsCopyNo: "No se pudo copiar. El enlace es {link}", wsDup: "Duplicar", wsDupDone: "Copia hecha. Está al principio de la lista.",
    wsRename: "Cambiar nombre", wsName: "Nombre de la ficha", wsRenameSave: "Guardar", wsCancel: "Cancelar", wsRenamed: "Nombre cambiado.", wsBadName: "Ese nombre no está permitido. Prueba otro.",
    wsDelete: "Eliminar", wsDelAsk: "¿Eliminar «{title}»? Su código de clase y su enlace dejarán de funcionar.", wsKeep: "Conservarla", wsDeleted: "Eliminada.",
    wsFull: "Ya guardaste todas las fichas posibles aquí. Elimina una primero.", wsCannot: "Estas preguntas no se pueden guardar.", wsGone: "Esa ficha ya no está.", wsErr: "No funcionó. Inténtalo de nuevo.",
    wsPrints: "Imprime la ficha {code}: {n} preguntas, con su código de clase.", wsMissing: "Esta ficha ya no está en Oomba. Aquí están las preguntas de la actividad.",
  },
  fr: {
    wsShort: "Fiches",
    wsTitle: "Mes fiches", wsMenuD: "Enregistrez les questions à l'écran, ou ouvrez, imprimez et partagez une fiche enregistrée.", wsUntitled: "Fiche", wsOne: "1 question", wsMany: "{n} questions",
    wsSave: "Enregistrer comme fiche", wsSaveD: "Enregistre les {n} questions à l'écran avec un code de classe.", wsSaving: "Enregistrement…", wsSaved: "Enregistrée. Code de classe : {code}",
    wsOnScreen: "À l'écran : {title}", wsLoading: "Chargement de vos fiches…", wsLoadFail: "Impossible de charger vos fiches.", wsRetry: "Réessayer",
    wsEmpty: "Pas encore de fiche. Enregistrez les questions à l'écran pour en créer une.", wsCodeSay: "Code de classe {code}", wsPrintFor: "Imprimer {title}", wsMore: "Plus", wsMoreFor: "Plus d'options pour {title}",
    wsKey: "Corrigé", wsCopy: "Copier le lien", wsCopied: "Lien copié.", wsCopyNo: "Copie impossible. Le lien est {link}", wsDup: "Dupliquer", wsDupDone: "Copie faite. Elle est en haut de la liste.",
    wsRename: "Renommer", wsName: "Nom de la fiche", wsRenameSave: "Enregistrer", wsCancel: "Annuler", wsRenamed: "Renommée.", wsBadName: "Ce nom n'est pas autorisé. Essayez-en un autre.",
    wsDelete: "Supprimer", wsDelAsk: "Supprimer « {title} » ? Son code de classe et son lien ne fonctionneront plus.", wsKeep: "La garder", wsDeleted: "Supprimée.",
    wsFull: "Vous avez enregistré le maximum de fiches ici. Supprimez-en une d'abord.", wsCannot: "Ces questions ne peuvent pas être enregistrées.", wsGone: "Cette fiche n'existe plus.", wsErr: "Cela n'a pas marché. Réessayez.",
    wsPrints: "Imprime la fiche {code} : {n} questions, avec son code de classe.", wsMissing: "Cette fiche n'est plus sur Oomba. Voici les questions de l'activité.",
  },
  de: {
    wsShort: "Arbeitsblätter",
    wsTitle: "Meine Arbeitsblätter", wsMenuD: "Die Aufgaben auf dem Bildschirm speichern oder ein gespeichertes Blatt öffnen, drucken und teilen.", wsUntitled: "Arbeitsblatt", wsOne: "1 Aufgabe", wsMany: "{n} Aufgaben",
    wsSave: "Als Arbeitsblatt speichern", wsSaveD: "Speichert die {n} Aufgaben auf dem Bildschirm unter einem Klassencode.", wsSaving: "Wird gespeichert…", wsSaved: "Gespeichert. Klassencode: {code}",
    wsOnScreen: "Auf dem Bildschirm: {title}", wsLoading: "Deine Arbeitsblätter werden geladen…", wsLoadFail: "Die Arbeitsblätter konnten nicht geladen werden.", wsRetry: "Erneut versuchen",
    wsEmpty: "Noch keine Arbeitsblätter. Speichere die Aufgaben auf dem Bildschirm, um eins zu erstellen.", wsCodeSay: "Klassencode {code}", wsPrintFor: "{title} drucken", wsMore: "Mehr", wsMoreFor: "Mehr zu {title}",
    wsKey: "Lösungsblatt", wsCopy: "Link kopieren", wsCopied: "Link kopiert.", wsCopyNo: "Kopieren ging nicht. Der Link ist {link}", wsDup: "Duplizieren", wsDupDone: "Kopie erstellt. Sie steht oben in der Liste.",
    wsRename: "Umbenennen", wsName: "Name des Arbeitsblatts", wsRenameSave: "Speichern", wsCancel: "Abbrechen", wsRenamed: "Umbenannt.", wsBadName: "Dieser Name ist nicht erlaubt. Versuche einen anderen.",
    wsDelete: "Löschen", wsDelAsk: "„{title}“ löschen? Klassencode und Link funktionieren dann nicht mehr.", wsKeep: "Behalten", wsDeleted: "Gelöscht.",
    wsFull: "Du hast hier schon so viele Arbeitsblätter wie möglich gespeichert. Lösche zuerst eins.", wsCannot: "Diese Aufgaben können nicht gespeichert werden.", wsGone: "Dieses Arbeitsblatt gibt es nicht mehr.", wsErr: "Das hat nicht geklappt. Versuche es noch einmal.",
    wsPrints: "Druckt Arbeitsblatt {code}: {n} Aufgaben, mit seinem Klassencode.", wsMissing: "Dieses Arbeitsblatt ist nicht mehr auf Oomba. Hier sind die Aufgaben der Aktivität.",
  },
  it: {
    wsShort: "Schede",
    wsTitle: "Le mie schede", wsMenuD: "Salva le domande sullo schermo, oppure apri, stampa e condividi una scheda salvata.", wsUntitled: "Scheda", wsOne: "1 domanda", wsMany: "{n} domande",
    wsSave: "Salva come scheda", wsSaveD: "Salva le {n} domande sullo schermo con un codice classe.", wsSaving: "Salvataggio…", wsSaved: "Salvata. Codice classe: {code}",
    wsOnScreen: "Sullo schermo: {title}", wsLoading: "Caricamento delle tue schede…", wsLoadFail: "Impossibile caricare le tue schede.", wsRetry: "Riprova",
    wsEmpty: "Ancora nessuna scheda. Salva le domande sullo schermo per crearne una.", wsCodeSay: "Codice classe {code}", wsPrintFor: "Stampa {title}", wsMore: "Altro", wsMoreFor: "Altro per {title}",
    wsKey: "Soluzioni", wsCopy: "Copia link", wsCopied: "Link copiato.", wsCopyNo: "Impossibile copiare. Il link è {link}", wsDup: "Duplica", wsDupDone: "Copia fatta. È in cima alla lista.",
    wsRename: "Rinomina", wsName: "Nome della scheda", wsRenameSave: "Salva", wsCancel: "Annulla", wsRenamed: "Rinominata.", wsBadName: "Questo nome non è consentito. Provane un altro.",
    wsDelete: "Elimina", wsDelAsk: "Eliminare «{title}»? Il codice classe e il link smetteranno di funzionare.", wsKeep: "Tienila", wsDeleted: "Eliminata.",
    wsFull: "Hai già salvato tutte le schede possibili qui. Eliminane prima una.", wsCannot: "Queste domande non si possono salvare.", wsGone: "Quella scheda non c'è più.", wsErr: "Non ha funzionato. Riprova.",
    wsPrints: "Stampa la scheda {code}: {n} domande, con il suo codice classe.", wsMissing: "Questa scheda non è più su Oomba. Ecco le domande dell'attività.",
  },
  pt: {
    wsShort: "Fichas",
    wsTitle: "Minhas fichas", wsMenuD: "Salve as perguntas da tela, ou abra, imprima e compartilhe uma ficha salva.", wsUntitled: "Ficha", wsOne: "1 pergunta", wsMany: "{n} perguntas",
    wsSave: "Salvar como ficha", wsSaveD: "Salva as {n} perguntas da tela com um código de turma.", wsSaving: "Salvando…", wsSaved: "Salva. Código da turma: {code}",
    wsOnScreen: "Na tela: {title}", wsLoading: "Carregando suas fichas…", wsLoadFail: "Não foi possível carregar suas fichas.", wsRetry: "Tentar de novo",
    wsEmpty: "Ainda não há fichas. Salve as perguntas da tela para criar uma.", wsCodeSay: "Código da turma {code}", wsPrintFor: "Imprimir {title}", wsMore: "Mais", wsMoreFor: "Mais opções de {title}",
    wsKey: "Gabarito", wsCopy: "Copiar link", wsCopied: "Link copiado.", wsCopyNo: "Não deu para copiar. O link é {link}", wsDup: "Duplicar", wsDupDone: "Cópia feita. Ela está no topo da lista.",
    wsRename: "Renomear", wsName: "Nome da ficha", wsRenameSave: "Salvar", wsCancel: "Cancelar", wsRenamed: "Renomeada.", wsBadName: "Esse nome não é permitido. Tente outro.",
    wsDelete: "Excluir", wsDelAsk: "Excluir “{title}”? O código da turma e o link vão parar de funcionar.", wsKeep: "Manter", wsDeleted: "Excluída.",
    wsFull: "Você já salvou o máximo de fichas aqui. Exclua uma primeiro.", wsCannot: "Estas perguntas não podem ser salvas.", wsGone: "Essa ficha não existe mais.", wsErr: "Não funcionou. Tente de novo.",
    wsPrints: "Imprime a ficha {code}: {n} perguntas, com o código da turma.", wsMissing: "Esta ficha não está mais no Oomba. Aqui estão as perguntas da atividade.",
  },
  nl: {
    wsShort: "Werkbladen",
    wsTitle: "Mijn werkbladen", wsMenuD: "Bewaar de opgaven op het scherm, of open, print en deel een bewaard werkblad.", wsUntitled: "Werkblad", wsOne: "1 opgave", wsMany: "{n} opgaven",
    wsSave: "Opslaan als werkblad", wsSaveD: "Bewaart de {n} opgaven op het scherm onder een klascode.", wsSaving: "Opslaan…", wsSaved: "Opgeslagen. Klascode: {code}",
    wsOnScreen: "Op het scherm: {title}", wsLoading: "Je werkbladen worden geladen…", wsLoadFail: "Je werkbladen konden niet worden geladen.", wsRetry: "Opnieuw proberen",
    wsEmpty: "Nog geen werkbladen. Bewaar de opgaven op het scherm om er een te maken.", wsCodeSay: "Klascode {code}", wsPrintFor: "{title} printen", wsMore: "Meer", wsMoreFor: "Meer voor {title}",
    wsKey: "Antwoordblad", wsCopy: "Link kopiëren", wsCopied: "Link gekopieerd.", wsCopyNo: "Kopiëren lukte niet. De link is {link}", wsDup: "Dupliceren", wsDupDone: "Kopie gemaakt. Die staat bovenaan de lijst.",
    wsRename: "Naam wijzigen", wsName: "Naam van het werkblad", wsRenameSave: "Opslaan", wsCancel: "Annuleren", wsRenamed: "Naam gewijzigd.", wsBadName: "Die naam mag niet. Probeer een andere.",
    wsDelete: "Verwijderen", wsDelAsk: "“{title}” verwijderen? De klascode en de link werken dan niet meer.", wsKeep: "Bewaren", wsDeleted: "Verwijderd.",
    wsFull: "Je hebt hier al zoveel werkbladen bewaard als kan. Verwijder er eerst een.", wsCannot: "Deze opgaven kunnen niet worden bewaard.", wsGone: "Dat werkblad bestaat niet meer.", wsErr: "Dat lukte niet. Probeer het opnieuw.",
    wsPrints: "Print werkblad {code}: {n} opgaven, met de klascode.", wsMissing: "Dit werkblad staat niet meer op Oomba. Hier zijn de opgaven van de activiteit.",
  },
  ru: {
    wsShort: "Листы",
    wsTitle: "Мои рабочие листы", wsMenuD: "Сохраните задачи с экрана или откройте, распечатайте и отправьте сохранённый лист.", wsUntitled: "Рабочий лист", wsOne: "Задач: 1", wsMany: "Задач: {n}",
    wsSave: "Сохранить как рабочий лист", wsSaveD: "Сохраняет задачи с экрана ({n}) под кодом класса.", wsSaving: "Сохраняем…", wsSaved: "Сохранено. Код класса: {code}",
    wsOnScreen: "На экране: {title}", wsLoading: "Загружаем ваши рабочие листы…", wsLoadFail: "Не удалось загрузить рабочие листы.", wsRetry: "Повторить",
    wsEmpty: "Рабочих листов пока нет. Сохраните задачи с экрана, чтобы создать лист.", wsCodeSay: "Код класса {code}", wsPrintFor: "Печать: {title}", wsMore: "Ещё", wsMoreFor: "Ещё: {title}",
    wsKey: "Ответы", wsCopy: "Копировать ссылку", wsCopied: "Ссылка скопирована.", wsCopyNo: "Не удалось скопировать. Ссылка: {link}", wsDup: "Дублировать", wsDupDone: "Копия готова. Она вверху списка.",
    wsRename: "Переименовать", wsName: "Название листа", wsRenameSave: "Сохранить", wsCancel: "Отмена", wsRenamed: "Переименовано.", wsBadName: "Такое название нельзя. Попробуйте другое.",
    wsDelete: "Удалить", wsDelAsk: "Удалить «{title}»? Код класса и ссылка перестанут работать.", wsKeep: "Оставить", wsDeleted: "Удалено.",
    wsFull: "Здесь сохранено максимальное число листов. Сначала удалите один.", wsCannot: "Эти задачи нельзя сохранить.", wsGone: "Этого листа больше нет.", wsErr: "Не получилось. Попробуйте ещё раз.",
    wsPrints: "Печатает лист {code}: задач {n}, с кодом класса.", wsMissing: "Этого листа больше нет в Oomba. Вот задачи самого задания.",
  },
  ja: {
    wsShort: "プリント",
    wsTitle: "マイプリント", wsMenuD: "画面の問題を保存したり、保存したプリントを開いて印刷・共有したりします。", wsUntitled: "プリント", wsOne: "1問", wsMany: "{n}問",
    wsSave: "プリントとして保存", wsSaveD: "画面の{n}問をクラスコード付きで保存します。", wsSaving: "保存しています…", wsSaved: "保存しました。クラスコード：{code}",
    wsOnScreen: "表示中：{title}", wsLoading: "プリントを読み込んでいます…", wsLoadFail: "プリントを読み込めませんでした。", wsRetry: "もう一度",
    wsEmpty: "まだプリントはありません。画面の問題を保存して作りましょう。", wsCodeSay: "クラスコード {code}", wsPrintFor: "{title}を印刷", wsMore: "その他", wsMoreFor: "{title}のその他の操作",
    wsKey: "解答", wsCopy: "リンクをコピー", wsCopied: "リンクをコピーしました。", wsCopyNo: "コピーできませんでした。リンク：{link}", wsDup: "複製", wsDupDone: "コピーを作りました。リストのいちばん上にあります。",
    wsRename: "名前を変更", wsName: "プリントの名前", wsRenameSave: "保存", wsCancel: "キャンセル", wsRenamed: "名前を変更しました。", wsBadName: "その名前は使えません。別の名前にしてください。",
    wsDelete: "削除", wsDelAsk: "「{title}」を削除しますか？クラスコードとリンクは使えなくなります。", wsKeep: "残す", wsDeleted: "削除しました。",
    wsFull: "ここに保存できるプリントの数が上限です。先に1つ削除してください。", wsCannot: "この問題は保存できません。", wsGone: "そのプリントはもうありません。", wsErr: "うまくいきませんでした。もう一度試してください。",
    wsPrints: "プリント {code} を印刷します：{n}問、クラスコード付き。", wsMissing: "このプリントはもうOombaにありません。アクティビティの問題を表示しています。",
  },
  'zh-Hant': {
    wsShort: "學習單",
    wsTitle: "我的學習單", wsMenuD: "儲存畫面上的題目，或開啟、列印、分享已儲存的學習單。", wsUntitled: "學習單", wsOne: "1 題", wsMany: "{n} 題",
    wsSave: "儲存為學習單", wsSaveD: "把畫面上的 {n} 題存成學習單，附上班級代碼。", wsSaving: "儲存中…", wsSaved: "已儲存。班級代碼：{code}",
    wsOnScreen: "畫面上：{title}", wsLoading: "正在載入你的學習單…", wsLoadFail: "無法載入你的學習單。", wsRetry: "再試一次",
    wsEmpty: "還沒有學習單。儲存畫面上的題目就能建立一份。", wsCodeSay: "班級代碼 {code}", wsPrintFor: "列印 {title}", wsMore: "更多", wsMoreFor: "{title} 的更多選項",
    wsKey: "解答", wsCopy: "複製連結", wsCopied: "已複製連結。", wsCopyNo: "無法複製。連結是 {link}", wsDup: "複製一份", wsDupDone: "已複製一份，在清單最上面。",
    wsRename: "重新命名", wsName: "學習單名稱", wsRenameSave: "儲存", wsCancel: "取消", wsRenamed: "已重新命名。", wsBadName: "這個名稱不能使用，請換一個。",
    wsDelete: "刪除", wsDelAsk: "要刪除「{title}」嗎？它的班級代碼和連結將無法使用。", wsKeep: "保留", wsDeleted: "已刪除。",
    wsFull: "這裡能儲存的學習單已達上限，請先刪除一份。", wsCannot: "這些題目無法儲存。", wsGone: "這份學習單已經不在了。", wsErr: "沒有成功，請再試一次。",
    wsPrints: "列印學習單 {code}：{n} 題，附班級代碼。", wsMissing: "這份學習單已不在 Oomba 上。以下是活動本身的題目。",
  },
  ar: {
    wsShort: "أوراق العمل",
    wsTitle: "أوراق العمل الخاصة بي", wsMenuD: "احفظ الأسئلة التي على الشاشة، أو افتح ورقة محفوظة واطبعها وشاركها.", wsUntitled: "ورقة عمل", wsOne: "سؤال واحد", wsMany: "عدد الأسئلة: {n}",
    wsSave: "احفظ كورقة عمل", wsSaveD: "يحفظ الأسئلة التي على الشاشة ({n}) برمز للصف.", wsSaving: "جارٍ الحفظ…", wsSaved: "تم الحفظ. رمز الصف: {code}",
    wsOnScreen: "على الشاشة: {title}", wsLoading: "جارٍ تحميل أوراق العمل…", wsLoadFail: "تعذّر تحميل أوراق العمل.", wsRetry: "حاول مرة أخرى",
    wsEmpty: "لا توجد أوراق عمل بعد. احفظ الأسئلة التي على الشاشة لإنشاء واحدة.", wsCodeSay: "رمز الصف {code}", wsPrintFor: "اطبع {title}", wsMore: "المزيد", wsMoreFor: "المزيد لـ {title}",
    wsKey: "مفتاح الإجابات", wsCopy: "انسخ الرابط", wsCopied: "تم نسخ الرابط.", wsCopyNo: "تعذّر النسخ. الرابط هو {link}", wsDup: "اصنع نسخة", wsDupDone: "تمت النسخة. إنها في أعلى القائمة.",
    wsRename: "أعد التسمية", wsName: "اسم ورقة العمل", wsRenameSave: "احفظ", wsCancel: "إلغاء", wsRenamed: "تمت إعادة التسمية.", wsBadName: "هذا الاسم غير مسموح. جرّب اسمًا آخر.",
    wsDelete: "احذف", wsDelAsk: "حذف «{title}»؟ سيتوقف رمز الصف والرابط عن العمل.", wsKeep: "أبقِها", wsDeleted: "تم الحذف.",
    wsFull: "حفظت هنا أكبر عدد ممكن من أوراق العمل. احذف واحدة أولًا.", wsCannot: "لا يمكن حفظ هذه الأسئلة.", wsGone: "ورقة العمل هذه لم تعد موجودة.", wsErr: "لم ينجح ذلك. حاول مرة أخرى.",
    wsPrints: "يطبع ورقة العمل {code}: عدد الأسئلة {n}، مع رمز الصف.", wsMissing: "ورقة العمل هذه لم تعد على Oomba. إليك أسئلة النشاط نفسه.",
  },
  he: {
    wsShort: "דפי עבודה",
    wsTitle: "דפי העבודה שלי", wsMenuD: "שמרו את השאלות שעל המסך, או פתחו, הדפיסו ושתפו דף שמור.", wsUntitled: "דף עבודה", wsOne: "שאלה אחת", wsMany: "{n} שאלות",
    wsSave: "שמירה כדף עבודה", wsSaveD: "שומר את {n} השאלות שעל המסך עם קוד כיתה.", wsSaving: "שומרים…", wsSaved: "נשמר. קוד כיתה: {code}",
    wsOnScreen: "על המסך: {title}", wsLoading: "טוענים את דפי העבודה…", wsLoadFail: "לא הצלחנו לטעון את דפי העבודה.", wsRetry: "לנסות שוב",
    wsEmpty: "עדיין אין דפי עבודה. שמרו את השאלות שעל המסך כדי ליצור דף.", wsCodeSay: "קוד כיתה {code}", wsPrintFor: "הדפסת {title}", wsMore: "עוד", wsMoreFor: "עוד עבור {title}",
    wsKey: "דף תשובות", wsCopy: "העתקת קישור", wsCopied: "הקישור הועתק.", wsCopyNo: "לא הצלחנו להעתיק. הקישור הוא {link}", wsDup: "שכפול", wsDupDone: "נוצר עותק. הוא בראש הרשימה.",
    wsRename: "שינוי שם", wsName: "שם דף העבודה", wsRenameSave: "שמירה", wsCancel: "ביטול", wsRenamed: "השם שונה.", wsBadName: "השם הזה אסור. נסו שם אחר.",
    wsDelete: "מחיקה", wsDelAsk: "למחוק את „{title}”? קוד הכיתה והקישור יפסיקו לעבוד.", wsKeep: "להשאיר", wsDeleted: "נמחק.",
    wsFull: "שמרתם כאן את מספר הדפים המרבי. מחקו קודם דף אחד.", wsCannot: "אי אפשר לשמור את השאלות האלה.", wsGone: "דף העבודה הזה כבר לא קיים.", wsErr: "זה לא הצליח. נסו שוב.",
    wsPrints: "מדפיס את דף העבודה {code}: {n} שאלות, עם קוד הכיתה.", wsMissing: "דף העבודה הזה כבר לא ב־Oomba. הנה השאלות של הפעילות עצמה.",
  },
};
for (const l of Object.keys(WORDS_140)) Object.assign(WORDS[l], WORDS_140[l]);
// 1.4.1 (first made as 1.3.1, never shipped): the short label of New sheet on a narrow phone (Print worksheet uses printGo).
const WORDS_141 = {
  en: { newShort: 'New' }, es: { newShort: 'Nueva' }, fr: { newShort: 'Nouvelle' }, de: { newShort: 'Neu' }, it: { newShort: 'Nuova' },
  pt: { newShort: 'Nova' }, nl: { newShort: 'Nieuw' }, ru: { newShort: 'Новый' }, ja: { newShort: '新しく' }, 'zh-Hant': { newShort: '換一張' },
  ar: { newShort: 'جديدة' }, he: { newShort: 'חדש' },
};
for (const l of Object.keys(WORDS_141)) Object.assign(WORDS[l], WORDS_141[l]);
const WORD_LANGS = Object.keys(WORDS);
/** The table for a site language: the language, its base ('en-GB' -> 'en'), then English, key by key. */
function wordsFor(lang) {
  const l = String(lang || 'en'), base = WORDS[l] || WORDS[l.split('-')[0]] || {};
  return new Proxy(base, { get: (o, k) => (typeof k === 'string' && o[k] != null ? o[k] : WORDS.en[k]), has: (o, k) => k in WORDS.en });
}

// ---- sheet.js
// Oomba Canvas 1.2.0: the printable worksheet, as data. sheet(activity, { seed, n, lang }) deals the same set the kit
// deals for that seed (deal(), N questions) and writes each question, its picture, its answer and its worked answer in
// the reader's language as plain pieces: strings and { frac: [n, d] } (a stacked fraction). Pure: the server's printer
// (server/services/canvas-print.js) runs it from the kit's own frozen file and turns the pieces into the printable page,
// and the self-test checks that a sheet of N questions has N answers. No HTML here, so nothing in the data can become
// markup: the printer escapes every string.

/** A line ({ k, v } in the words table, or { text }) -> pieces. */
function pieces(x, W) {
  if (!x) return [];
  if (x.text !== undefined) return [String(x.text)];
  const src = String(W[x.k] != null ? W[x.k] : x.k), out = [], vars = x.v || {};
  let at = 0; const re = /\{(\w+)\}/g; let m;
  const val = v => (Array.isArray(v) && v.length === 2 ? [{ frac: [v[0], v[1]] }] : v && typeof v === 'object' ? (v.text !== undefined ? [String(v.text)] : pieces(v, W)) : typeof v === 'string' && v in WORDS.en ? [String(W[v])] : [String(v)]);
  while ((m = re.exec(src))) { if (m.index > at) out.push(src.slice(at, m.index)); const v = vars[m[1]]; out.push(...(v === undefined ? [m[0]] : val(v))); at = m.index + m[0].length; }
  if (at < src.length) out.push(src.slice(at));
  return out;
}
const sheetRatV = r => (r.d === 1 ? r.n : [r.n, r.d]);
const sheetList = (items, W) => items.flatMap((v, i) => [...(i ? [', '] : []), ...pieces({ k: 'ansValue', v: { x: v } }, W)]);

/** The answer the key prints for one problem (its worked answer's result), as pieces. */
function answerOf(p, W) {
  const T = TOOLS[p.tool];
  switch (p.tool) {
    case 'fractions.equiv': return [{ frac: [T.need(p), p.to] }];
    case 'fractions.shade': return pieces({ k: 'ansShade', v: { n: p.n, d: p.d } }, W);
    case 'fractions.compare': return [{ frac: p.a }, ` ${T.sign(p)} `, { frac: p.b }];
    case 'numberline.point': return pieces({ k: 'ansValue', v: { x: p.at } }, W);
    case 'numberline.jump': { const a = ratOf(p.from), b = ratOf(p.by), n = a.n * b.d + b.n * a.d, d = a.d * b.d, g = sheetGcd(n, d); return pieces({ k: 'ansValue', v: { x: sheetRatV({ n: n / g, d: d / g }) } }, W); }
    case 'digits.add': case 'digits.sub': case 'digits.mul': return [String(T.result(p))];
    case 'tiles.sort': { const bins = T.bins(p); return bins.flatMap((b, k) => [...(k ? ['; '] : []), ...pieces(b.text !== undefined ? { text: b.text } : b, W), ': ', ...sheetList(p.items.filter((_, i) => T.binOf(p, i) === k).map(v => (p.rule ? v : { text: v.t })), W)]); }
    case 'tiles.order': return sheetList(T.sorted(p).map(i => p.items[i]), W);
    case 'figure.number': return [`${numText(p.answer, p.dp)}${p.unit ? ` ${p.unit}` : ''}`];
    case 'figure.choice': return [`${String.fromCharCode(65 + p.answer)}) ${p.choices[p.answer]}`];
    default: return [];
  }
}
const sheetGcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
/** The worked answer's lines: the Builder's own (figure questions), or the kit's steps with each step's answer. */
function workOf(p, W) {
  if (Array.isArray(p.work)) return p.work.map(t => [t]);
  return TOOLS[p.tool].steps(p).filter(s => s.k !== 'pressCheck').map(s => [...pieces(s, W), ...(s.ans !== undefined ? [` ${s.ans}`] : [])]);
}
/** What the printed question draws besides its words: the figure's data, or a plain picture of the manipulative. */
function pictureOf(p) {
  switch (p.tool) {
    case 'fractions.equiv': return { pic: 'bars', bars: [[p.from[0], p.from[1]], [0, p.to]] };
    case 'fractions.shade': return { pic: 'bars', bars: [[0, p.d]] };
    case 'fractions.compare': return { pic: 'bars', bars: [[p.a[0], p.a[1]], [p.b[0], p.b[1]]] };
    case 'numberline.point': case 'numberline.jump': return { pic: 'line', lo: p.lo, hi: p.hi, sub: p.sub, from: p.tool === 'numberline.jump' ? p.from : null };
    case 'digits.add': case 'digits.sub': case 'digits.mul': return { pic: 'columns', a: p.a, b: p.b, op: p.tool.slice(7), cols: TOOLS[p.tool].cols(p) };
    case 'tiles.sort': return { pic: 'sort', items: p.items.map(v => (p.rule ? v : v.t)) };
    case 'tiles.order': return { pic: 'order', items: p.items };
    case 'figure.choice': return { pic: 'choices', choices: p.choices, ...(p.fig ? { fig: p.fig } : {}) };
    default: return p.fig ? { fig: p.fig } : null;
  }
}

/**
 * The worksheet: { title, say, seed, n, items: [{ n, tool, task, ask, picture, answer, work }] } with task, ask and
 * answer as pieces and work as lines of pieces. n: how many questions (1 to 30; a fixed list gives at most its own
 * length). seed: the sheet's number (the same number makes the same sheet again).
 */
function sheet(activity, { seed = 1, n = null, lang = 'en' } = {}) {
  const a = activity && typeof activity === 'object' ? activity : {}, cfg = a.config || {}, task = a.task || {}, W = wordsFor(lang);
  const want = Number.isInteger(n) && n >= 1 && n <= MAX_PROBLEMS ? n : Number.isInteger(cfg.count) ? cfg.count : 5;
  const s = Number.isInteger(seed) && seed > 0 && seed < 1e6 ? seed : 1;
  const set = deal(a, { seed: s, count: want });
  return {
    title: String(task.title || '').slice(0, 80), say: String(task.say || '').slice(0, 200), seed: s, n: set.length,
    items: set.map((p, i) => {
      const T = TOOLS[p.tool];
      return { n: i + 1, tool: p.tool, task: pieces(T.task(p), W), ask: pieces(T.ask(p), W), picture: pictureOf(p), answer: answerOf(p, W), work: workOf(p, W), ...(p.unit ? { unit: p.unit } : {}) };
    }),
  };
}

// ---- style.js
// Oomba Canvas: the look. A game runs in an opaque sandbox frame and cannot load the site's CSS, so the site's colour
// tokens (public/css/app.css :root and its two dark blocks) and the dashboard's fraction look (public/css/dash.css .dt-*)
// are COPIED here and frozen with the kit version (tests/unit/canvas-kit.test.js compares them with app.css). The kit
// puts this in a <style> of its own; scripts/build-canvas.js also writes it next to the kit as oomba-canvas.css.
// Theme: the site's (BRB.theme -> html[data-oc-theme]), else the device's.
// 1.5.0: the Crossword look (seed-games/crossword.html, the Builder's classroom style 2): the page is the dotted mint
// board (--paper, --dots), the problem line is the dark "Now" bar (--current, --on-current, the site's own tokens), and
// Check is a flat pill with an ink outline (no raised edge); the band's other buttons and the end card's take the ink
// outline too. Everything else is as in 1.4.1.
const LIGHT = '--bg:#F4F1E6;--card:#FFFDF2;--card-2:#F9F6EB;--line:#E2DDCB;--edge:#8A8573;--text:#141414;--text-2:#3B3A35;--muted:#5B584F;--accent:#66C792;--accent-press:#1F9D63;--accent-soft:#E1F1E1;--accent-ink:#0F5A37;--spark:#FFD23F;--spark-soft:#FFF3C4;--warn-bg:#FFF0B8;--warn-ink:#6B4C00;--bad-bg:#F9E3DC;--bad-ink:#A12A20;--focus:#141414;--paper:#E1F1E1;--dots:#66C792;--current:#141414;--on-current:#FFFDF2;--shadow:0 1px 0 rgba(20,20,20,.04),0 4px 16px rgba(20,20,20,.06);color-scheme:light';
const DARK = '--bg:#141414;--card:#1E1E1B;--card-2:#262622;--line:#36352F;--edge:#7E796C;--text:#FFFDF2;--text-2:#E3DED0;--muted:#B8B3A1;--accent-soft:#1E3326;--accent-ink:#9EDDBA;--spark-soft:#352E14;--warn-bg:#3A3113;--warn-ink:#FFD23F;--bad-bg:#3B201C;--bad-ink:#FFA294;--focus:#FFD23F;--paper:#141414;--dots:#2E5A41;--current:#66C792;--on-current:#141414;--shadow:0 1px 0 rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.32);color-scheme:dark';
const TOKENS = { light: LIGHT, dark: DARK };
const CSS = `:root{${LIGHT};--r:20px;--r-sm:12px;--font:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Hebrew","Noto Sans Arabic",sans-serif;
--c0:color-mix(in srgb,var(--accent) 88%,var(--card));--c1:color-mix(in srgb,var(--spark) 92%,var(--card));--c2:color-mix(in srgb,#5AA9D6 88%,var(--card))}
@media (prefers-color-scheme:dark){:root:not([data-oc-theme="light"]){${DARK}}}
:root[data-oc-theme="dark"]{${DARK}}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%;background-color:var(--paper);background-image:radial-gradient(var(--dots) 1.5px,transparent 1.6px);background-size:22px 22px;color:var(--text);font:500 17px/1.45 var(--font);-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
.oc{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}
.oc-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:8px max(14px,env(safe-area-inset-right)) 8px max(14px,env(safe-area-inset-left));background:var(--card);border-bottom:2px solid var(--line)}
.oc-strip h1{margin:0;font-size:1.15rem;font-weight:800;line-height:1.2;flex:1 1 14em;min-width:min(14em,100%);overflow-wrap:break-word}
.oc-stat,.oc-acts{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:4px;margin:-4px}
.oc-stat::-webkit-scrollbar,.oc-acts::-webkit-scrollbar{display:none}
.oc-stat>*,.oc-acts>*{flex:none}
.oc-acts{gap:8px;margin-inline-start:auto}
.oc-ls{display:none}
.oc-chip{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 12px;border-radius:999px;font-weight:700;font-size:.9rem;white-space:nowrap;background:var(--card-2);font-variant-numeric:tabular-nums}
.oc-sup,.oc-ok{background:color-mix(in srgb,var(--accent) 22%,var(--card));color:var(--accent-ink)}
.oc-modes{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,var(--card));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 40%,var(--card))}
.oc-mode{min-height:44px;min-width:44px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:var(--accent-ink);font:inherit;font-weight:700;font-size:.88rem;white-space:nowrap;cursor:pointer}
.oc-mode:hover{background:color-mix(in srgb,var(--accent) 22%,var(--card))}
.oc-mode[aria-pressed="true"]{background:var(--accent-press);color:#fff}
.oc-mode:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.oc-no{background:var(--bad-bg);color:var(--bad-ink)}
.oc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;min-width:48px;padding:0 20px;border-radius:999px;border:0;font:700 1rem var(--font);cursor:pointer;background:var(--card);color:var(--text);box-shadow:inset 0 0 0 2px var(--line);white-space:nowrap;touch-action:manipulation}
.oc-btn:hover:not(:disabled){background:var(--card-2)}
.oc-btn:active:not(:disabled){transform:translateY(1px)}
.oc-btn:disabled{opacity:.5;cursor:default}
.oc-btn:focus-visible,.oc-tile:focus-visible,.oc-part:focus-visible,.oc-tick:focus-visible,.oc-cell:focus-visible,.oc-box:focus-visible,.oc-slotbox:focus-visible,.oc-binlab:focus-visible,.oc-key:focus-visible,.oc-say:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.oc-sm{min-height:44px;min-width:44px;padding:0 14px;font-size:.92rem}
.oc-primary{background:var(--accent);color:#141414;box-shadow:inset 0 0 0 2px var(--text);min-width:120px}
.oc-band .oc-btn,.oc-endbtns .oc-btn{box-shadow:inset 0 0 0 2px var(--text)}
.oc-primary:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 85%,#fff)}
.oc-lit{background:var(--spark);color:#141414;box-shadow:inset 0 0 0 2px #C99A00}
.oc-task{display:flex;align-items:center;gap:14px;min-height:84px;margin:14px 16px 0;padding:14px 18px;background:var(--current);color:var(--on-current);border-radius:var(--r-sm)}
.oc-taskt{min-width:0}
.oc-n{display:block;font-size:.8rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.oc-task .oc-n{color:inherit;opacity:.9}
.oc-task .oc-say:focus-visible{outline-color:var(--on-current)}
.oc-task p{margin:2px 0 0;font-size:1.45rem;font-weight:800;line-height:1.25}
.oc-say{margin-inline-start:auto;flex:none;width:48px;height:48px;border-radius:999px;border:0;background:var(--card);box-shadow:inset 0 0 0 2px var(--on-current);font-size:1.25rem;cursor:pointer}
.oc-main{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;padding:14px 16px;align-items:start}
.oc-card{display:flex;flex-direction:column;gap:12px;min-width:0;background:var(--card);border-radius:var(--r);padding:16px 18px;box-shadow:0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent),var(--shadow)}
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
.oc-tick{position:absolute;top:22px;width:min(44px,var(--oc-gap,44px));height:62px;transform:translateX(-50%);border:0;background:none;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center}
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
.oc-binlab{border:0;background:none;font:800 1.05rem var(--font);color:var(--text);text-align:start;padding:4px 2px;cursor:pointer;min-height:44px}
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
.oc-end{container-type:inline-size}
.oc-endbtns{justify-content:center;gap:10px}
.oc-endbtns .oc-btn{flex:0 1 auto;min-width:min-content;min-height:52px;padding:8px 22px;white-space:normal;line-height:1.2;text-align:center;overflow-wrap:normal}
@container (max-width:479px){.oc-endbtns{flex-direction:column;align-items:stretch}.oc-endbtns .oc-btn{width:100%}}
@supports not (container-type:inline-size){@media (max-width:540px){.oc-endbtns{flex-direction:column;align-items:stretch}.oc-endbtns .oc-btn{width:100%}}}
.oc-board{font-size:22px}
.oc-board .oc-task p{font-size:2rem}
@media (max-width:820px){
  .oc-main{grid-template-columns:minmax(0,1fr);padding:10px 12px}
  .oc-task{margin:10px 12px 0;padding:12px 14px}
  .oc-task p{font-size:1.2rem}
  .oc-strip{gap:8px 6px;padding:8px 10px}.oc-strip h1{font-size:1.05rem;flex:1 1 100%}.oc-chip{min-height:30px;padding:0 8px;font-size:.8rem}
  .oc-mode{min-height:44px;min-width:44px;padding:0 9px;font-size:.8rem}
  .oc-modes{padding:2px;gap:0;flex-wrap:nowrap}
  .oc-stat>.oc-modes{flex:0 1 auto;min-width:min-content}.oc-modes .oc-mode{flex:0 1 auto;min-width:min-content;padding:0 11px;white-space:normal;line-height:1.05;text-align:center}
  .oc-keys{grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
  .oc-acts .oc-btn{padding:0 12px;font-size:.88rem;gap:4px}
  .oc-say{width:44px;height:44px}
  .oc-row{grid-template-columns:56px minmax(0,1fr);gap:8px}
  .oc-lab .oc-frac{font-size:1.5rem}
  .oc-bar{height:64px}.oc-tall{height:72px}
  .oc-tile{min-width:48px;min-height:48px;font-size:1rem}
  .oc-count{flex-basis:100%;margin:0;font-size:.9rem}
  .oc-steps .oc-done,.oc-steps .oc-todo{display:none}
  .oc-steps.oc-closed{padding-block:10px}
  .oc-act{flex-wrap:wrap}.oc-ask{flex-basis:100%;font-size:1.05rem}
  .oc-band .oc-btns{flex:1 1 100%}.oc-band .oc-btns .oc-btn{flex:1 1 auto;min-width:min-content;padding:4px 10px;white-space:normal;line-height:1.15;text-align:center}
  .oc-cell{width:46px;height:46px;font-size:1.4rem}.oc-dbox{width:44px;height:44px;margin:1px}.oc-rule{margin-left:46px}
  .oc-line{margin:0 22px}
  .oc-signs{font-size:1.5rem;gap:10px}.oc-sign{min-width:52px;min-height:52px}
  .oc-hint{font-size:.92rem}
}
.oc-fig{display:flex;justify-content:center;width:100%}
.oc-fig svg{display:block;width:auto;max-width:min(100%,560px);max-height:52vh;height:auto}
.oc-figq{align-items:center}
.oc-figans{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:6px}
.oc-figbox{min-width:8ch;height:56px;font-size:1.45rem}
.oc-unit{font-weight:800;font-size:1.2rem}
.oc-figmiss{color:var(--bad-ink);font-weight:700}
.oc-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;width:100%;max-width:640px;margin-top:6px}
.oc-choice{justify-content:flex-start;white-space:normal;text-align:start;min-height:52px}
.oc-choice b{display:inline-grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:var(--card-2);font-size:.9rem}
.oc-choice[aria-pressed="true"]{background:var(--text);color:var(--card)}
.oc-choice[aria-pressed="true"] b{background:var(--card);color:var(--text)}
.oc-print{margin:10px max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left));padding:12px 16px;display:flex;flex-direction:column;gap:10px;border:2px solid var(--line)}
.oc-ptop{display:flex;align-items:center;justify-content:space-between;gap:10px}
.oc-ptop h2{margin:0;font-size:1.1rem;font-weight:800}
.oc-prow{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}
.oc-plab{font-weight:700;min-width:7.5em}
.oc-pstep,.oc-pseg{display:inline-flex;align-items:center;gap:6px}
.oc-pnum{min-width:2.4ch;text-align:center;font-size:1.2rem;font-variant-numeric:tabular-nums}
.oc-tog{white-space:normal;line-height:1.2;padding-block:6px;text-align:start}
.oc-tog[aria-pressed="true"]{background:var(--accent-press);color:#fff;box-shadow:none}
.oc-seed{min-width:8ch}
.oc-psmall{margin:0;font-size:.85rem;color:var(--muted)}
.oc-pmsg{font-weight:700;color:var(--accent-ink)}
.oc{--tc:#7B61D9;--tc-soft:color-mix(in srgb,#9B8CE0 16%,var(--card));--tc-line:color-mix(in srgb,#9B8CE0 45%,var(--card));--tc-ink:#4B3A9A}
:root[data-oc-theme="dark"] .oc{--tc-ink:#C9BEF5}
@media (prefers-color-scheme:dark){:root:not([data-oc-theme="light"]) .oc{--tc-ink:#C9BEF5}}
.oc-tb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px max(14px,env(safe-area-inset-right)) 7px max(14px,env(safe-area-inset-left));background:var(--tc-soft);border-bottom:2px solid var(--tc-line)}
.oc-tb-lab{display:inline-flex;align-items:center;gap:4px;font-weight:800;font-size:.85rem;color:var(--tc-ink);margin-inline-end:4px}
.oc-tb-lab small{font-weight:600;color:var(--muted);font-size:.8rem}
@media (max-width:1439px){.oc-tb-lab small{display:none}}
@media (max-width:1179px){.oc-tb-wsl{display:none}.oc-tb .oc-tb-ws{padding:0 10px;min-width:44px}}
.oc-tb .oc-btn{background:var(--card);box-shadow:inset 0 0 0 2px var(--tc-line)}
.oc-tb .oc-btn[aria-pressed="true"],.oc-tbtn{background:var(--tc);color:#fff;box-shadow:none}
.oc-tb-help,.oc-tm4{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:999px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--tc-line)}
.oc-tb-help button,.oc-tm4 button{min-height:44px;min-width:44px;padding:0 11px;border:0;border-radius:999px;background:transparent;color:var(--tc-ink);font:700 .85rem var(--font);white-space:nowrap;cursor:pointer}
.oc-tb-help button[aria-pressed="true"],.oc-tm4 button[aria-pressed="true"]{background:var(--tc);color:#fff}
.oc-tb-help button:focus-visible,.oc-tm4 button:focus-visible,.oc-tmi:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.oc-tb-hl{align-self:center;padding:0 6px 0 8px;font:800 .8rem var(--font);color:var(--tc-ink)}
.oc-tb-on .oc-tb-board{order:9;margin-inline-start:auto}
.oc-boardmode .oc-tb-lab small{display:none}
.oc-tmenu{position:fixed;z-index:50;top:56px;inset-inline-end:12px;width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 70px);overflow:auto;background:var(--card);border-radius:20px;box-shadow:0 0 0 2px var(--tc-line),0 12px 40px rgba(20,20,20,.22);padding:14px;display:grid;gap:8px}
.oc-tmenu h2{margin:0 0 2px;font-size:1rem;color:var(--tc-ink)}
.oc-tnote{margin:0 0 4px;font-size:.82rem;color:var(--muted);font-weight:600}
.oc-tmi{display:grid;grid-template-columns:36px 1fr;gap:2px 10px;align-items:center;text-align:start;padding:10px 12px;border-radius:14px;border:0;background:var(--card-2);font:inherit;color:var(--text);min-height:56px;cursor:pointer}
.oc-tmi:disabled{opacity:.6;cursor:default}
.oc-tme{grid-row:1/3;font-size:1.4rem;text-align:center}
.oc-tmi b{font-size:.98rem}.oc-tmi span:last-child{font-size:.82rem;color:var(--muted);font-weight:600}
.oc-tmh{padding:10px 12px;border-radius:14px;background:var(--card-2);display:grid;gap:8px}
.oc-tm4{display:grid;grid-template-columns:repeat(4,1fr);border-radius:14px}
.oc-tm4 button{border-radius:11px;white-space:normal;line-height:1.1;padding:0 4px}
.oc-tscrim{position:fixed;inset:0;z-index:40;background:rgba(20,20,20,.28)}
.oc-tgrab{display:none}
.oc-fb.oc-tans{background:var(--tc-soft);box-shadow:inset 0 0 0 2px var(--tc-line);color:var(--tc-ink)}
.oc-worked{box-shadow:inset 0 4px 0 var(--tc),0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent),var(--shadow)}
.oc-worked li.oc-done .oc-k{background:var(--tc);color:#fff}
.oc-worked li.oc-last{background:var(--accent-soft);color:var(--accent-ink)}
.oc-steps.oc-worked .oc-done{display:grid}
.oc-bchip{background:var(--tc-soft);color:var(--tc-ink);box-shadow:inset 0 0 0 2px var(--tc-line)}
.oc-bnav{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-variant-numeric:tabular-nums}
:root.oc-boardon body{zoom:1.5}
.oc-boardmode .oc-ok,.oc-boardmode .oc-no,.oc-boardmode .oc-togo,.oc-boardmode .oc-keybtn,.oc-boardmode .oc-keys,.oc-boardmode .oc-modes,.oc-boardmode .oc-sup,.oc-boardmode [aria-controls="oc-print"]{display:none!important}
.oc-ws,.oc-wsbar{margin:10px max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left))}
.oc-ws{padding:12px 16px 14px;gap:10px;border:2px solid var(--line)}
.oc-wsbody{display:flex;flex-direction:column;gap:10px}
.oc-ws .oc-sm{min-height:44px;min-width:44px}
.oc-ws h2{outline:none}
.oc-wssave{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px}
.oc-wsnow,.oc-wsbar{margin-block:0;display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-weight:700;font-size:.92rem}
.oc-wsbar{padding:8px 14px;border-radius:14px;background:var(--accent-soft);color:var(--accent-ink)}
.oc-wsmsg:empty{display:none}
.oc-wsbad{color:var(--bad-ink)}
.oc-wsl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.oc-wsr{border-top:1px solid var(--line)}
.oc-wsr:first-child{border-top:0}
.oc-wsrow{position:relative;display:flex;align-items:center;gap:2px;min-height:60px}
.oc-wso{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:10px 8px;border:0;background:transparent;font:inherit;color:var(--text);text-align:start;cursor:pointer;border-radius:14px}
.oc-wso::after{content:"";position:absolute;inset:2px 0;border-radius:14px}
.oc-wsrow:hover{background:var(--card-2);border-radius:14px}
.oc-wso:focus-visible{outline:none}.oc-wso:focus-visible::after{outline:3px solid var(--focus);outline-offset:-1px}
.oc-wst{max-width:100%;font-weight:800;font-size:1rem;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-wsm{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:.84rem;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.oc-wsc{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-ink);font:800 .74rem/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.04em;white-space:nowrap}
.oc-wsnew .oc-wst::after{content:"";display:inline-block;width:8px;height:8px;margin-inline-start:8px;border-radius:9px;background:var(--accent-press);vertical-align:middle}
.oc-wstools{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:2px}
.oc-wsmw{position:relative;display:inline-flex}
.oc-wsup .oc-wstools{z-index:40}
.oc-wsi{width:44px;height:44px;display:inline-grid;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--text-2);font:700 1.15rem var(--font);cursor:pointer;touch-action:manipulation}
.oc-wsi:hover,.oc-wsi[aria-expanded="true"]{background:color-mix(in srgb,var(--line) 70%,var(--card))}
.oc-wsi:focus-visible,.oc-wsmi:focus-visible{outline:3px solid var(--focus);outline-offset:1px}
.oc-wsmenu{position:absolute;top:calc(100% + 4px);inset-inline-end:0;z-index:30;min-width:12.5em;max-width:min(18em,calc(100vw - 40px));padding:6px;background:var(--card);border-radius:16px;box-shadow:0 0 0 1px var(--line),0 12px 32px rgba(20,20,20,.18);display:flex;flex-direction:column}
.oc-wsmi{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border:0;border-radius:11px;background:transparent;font:700 .95rem var(--font);color:var(--text);text-align:start;cursor:pointer;white-space:nowrap}
.oc-wsmi span:first-child{width:1.4em;text-align:center}
.oc-wsmi:hover,.oc-wsmi:focus{background:var(--card-2)}
.oc-wsmi-del{color:var(--bad-ink)}
.oc-wssep{height:1px;margin:4px 6px;background:var(--line)}
.oc-wsask{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:var(--bad-bg);color:var(--bad-ink);display:flex;flex-direction:column;gap:8px}
.oc-wsask p{margin:0;font-weight:700}
.oc-wsask .oc-btns{display:flex;flex-wrap:wrap;gap:8px}
.oc-wsdel{background:var(--bad-ink);color:#fff;box-shadow:none}
.oc-wsdel:hover:not(:disabled){background:color-mix(in srgb,var(--bad-ink) 85%,#000)}
.oc-wsren{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 0}
.oc-wsren input{flex:1 1 12em;min-width:0;min-height:44px;padding:0 14px;border-radius:12px;border:2px solid var(--line);background:var(--card);color:var(--text);font:700 1rem var(--font)}
.oc-wsren input:focus-visible{outline:3px solid var(--focus);outline-offset:1px}
.oc-wsren .oc-primary{min-width:0}
.oc-boardmode .oc-ws,.oc-boardmode .oc-wsbar{display:none!important}
@media (min-width:561px){.oc-tbtn{display:none}.oc-teach .oc-strip .oc-modes,.oc-teach .oc-strip .oc-sup{display:none}}
@media (max-width:560px){.oc-tb{display:none}.oc-tbt{display:none}
  .oc-teach .oc-strip .oc-tbtn{min-height:44px;min-width:48px;padding:0 10px;flex:0 0 auto}
  .oc-tmenu{top:auto;bottom:0;inset-inline:0;width:auto;max-width:none;border-radius:22px 22px 0 0;padding:16px 14px calc(20px + env(safe-area-inset-bottom))}
  .oc-tgrab{display:block;width:44px;height:5px;border-radius:9px;background:var(--line);justify-self:center;margin-top:-6px}}
@media (max-width:560px){.oc-stat,.oc-acts{flex:1 1 100%;margin-inline-start:0}.oc-acts>.oc-btn{flex:1 0 auto}}
@media (max-width:480px){.oc-acts .oc-ll{display:none}.oc-acts .oc-ls{display:inline}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

// ---- teach.js
// Oomba Canvas 1.3.0: the teacher's controls inside an activity. Only when the page says this viewer is the activity's
// maker or school staff (BRB.canTeach, from the server's INIT.teach: never a student, never under "As a student").
// Nothing here talks to the server: the controls change this screen only.
//   Show answer   the worked answer of the problem on screen (its steps or its "work" lines); it is not counted
//   Board mode    big type for the board, Back / n of N / Next, no ✓ ✗, no keypad, and no score is sent
//   Help          the help mode for this screen (any of the four); it is not saved
//   New set       a fresh set from the generator (off, with a note, when the activity has none)
//   My worksheets (1.4.0) the teacher's saved worksheets (sets.js): only where the page offers the list
//                 (BRB.canListSets: school staff, the published activity, never a preview); saving and the list are
//                 the only controls that reach the server, through the page
// Two layouts of the same controls, switched by CSS (style.js): a bar under the top strip at 561 px and wider, and one
// "Teacher" button that opens a menu (a bottom sheet) on narrower screens.
// ui.js passes its element helper (h) and its words (T): the modules share one scope in the bundle, but stay separate
// ES modules for the tests, so nothing is imported from ui.js.

/**
 * o: { h, T, supports (the four help modes), gen (the activity has a generator), sets (1.4.0: offer My worksheets),
 *      on: { show, board, help, newSet, sets } }
 * -> { bar, button, menu, scrim, paint({ support, board, shown, done }), close() }
 */
function teachControls(o) {
  const { h, T, on } = o;
  const els = { help: [], menuHelp: [] };
  const helpGroup = (list, cls, labelled) => h('span', { class: cls, role: 'group', ...(labelled ? { 'aria-label': T('helpHere') } : {}) },
    cls === 'oc-tb-help' ? h('span', { class: 'oc-tb-hl', 'aria-hidden': 'true' }, '🪜 ', T('helpMode')) : null,
    ...o.supports.map(m => { const b = h('button', { type: 'button', 'data-mode': m, 'aria-pressed': 'false', onclick: () => on.help(m) }, T(m)); list.push(b); return b; }));

  // ---- A: the bar (561 px and wider)
  els.show = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-pressed': 'false', onclick: () => on.show() }, h('span', { 'aria-hidden': 'true' }, '👀'), ' ', T('showAnswer'));
  els.board = h('button', { type: 'button', class: 'oc-btn oc-sm oc-tb-board', 'aria-pressed': 'false', onclick: () => on.board(!o.state().board) });
  els.newSet = h('button', { type: 'button', class: 'oc-btn oc-sm', disabled: !o.gen, title: o.gen ? null : T('newSetNone'), onclick: () => on.newSet() }, h('span', { 'aria-hidden': 'true' }, '🎲'), ' ', T('newSetT'));
  // (an icon and a short label on the bar, the icon alone under 1180 px; its full name for screen readers and as a tooltip)
  els.sets = o.sets ? h('button', { type: 'button', class: 'oc-btn oc-sm oc-tb-ws', 'aria-label': T('wsTitle'), title: T('wsTitle'), 'aria-expanded': 'false', 'aria-controls': 'oc-ws', onclick: () => on.sets() }, h('span', { 'aria-hidden': 'true' }, '📄'), h('span', { class: 'oc-tb-wsl' }, ' ', T('wsShort'))) : null;
  const bar = h('div', { class: 'oc-tb', role: 'toolbar', 'aria-label': T('teacher') },
    // (1.4.0: "students don't see this bar" shows from 1440 px; narrower it is the label's tooltip, so the bar stays one line)
    h('span', { class: 'oc-tb-lab', title: T('teacherOnly') }, h('span', { 'aria-hidden': 'true' }, '🧑‍🏫'), ' ', T('teacher'), h('small', {}, ' · ', T('teacherOnly'))),
    els.show, els.board, helpGroup(els.help, 'oc-tb-help', true), els.newSet, els.sets);

  // ---- B: one Teacher button and its menu (narrower than 561 px)
  const button = h('button', { type: 'button', class: 'oc-btn oc-sm oc-tbtn', 'aria-expanded': 'false', 'aria-controls': 'oc-tmenu', 'aria-label': T('teacher'), onclick: () => open(!isOpen()) },
    h('span', { 'aria-hidden': 'true' }, '🧑‍🏫'), h('span', { class: 'oc-tbt' }, ' ', T('teacher')));
  const item = (emoji, title, desc, fn, extra = {}) => h('button', { type: 'button', class: 'oc-tmi', onclick: () => { fn(); open(false); }, ...extra },
    h('span', { class: 'oc-tme', 'aria-hidden': 'true' }, emoji), h('b', {}, title), h('span', {}, desc));
  els.mShow = item('👀', T('showAnswer'), T('showAnswerD'), () => on.show());
  els.mBoard = item('📽', T('boardMode'), T('boardModeD'), () => on.board(!o.state().board));
  els.mNew = item('🎲', T('newProblems'), o.gen ? T('newProblemsD') : T('newSetNone'), () => on.newSet(), { disabled: !o.gen });
  els.mSets = o.sets ? item('📄', T('wsTitle'), T('wsMenuD'), () => on.sets()) : null;
  const menu = h('div', { class: 'oc-tmenu', id: 'oc-tmenu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oc-tmenu-h', hidden: true },
    h('div', { class: 'oc-tgrab', 'aria-hidden': 'true' }),
    h('h2', { id: 'oc-tmenu-h', tabindex: '-1' }, h('span', { 'aria-hidden': 'true' }, '🧑‍🏫 '), T('teacher')),
    h('p', { class: 'oc-tnote' }, T('teacherNote')),
    els.mShow, els.mBoard,
    h('div', { class: 'oc-tmh' }, h('b', {}, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('helpHere')), helpGroup(els.menuHelp, 'oc-tm4', true)),
    els.mNew, els.mSets);
  const scrim = h('div', { class: 'oc-tscrim', hidden: true, onclick: () => open(false) });
  const isOpen = () => !menu.hidden;
  function open(want) {
    menu.hidden = !want; scrim.hidden = !want; button.setAttribute('aria-expanded', String(!!want));
    try { (want ? menu.querySelector('h2') : button).focus({ preventScroll: true }); } catch (e) { /* not in the page yet */ }
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) open(false); });

  function paint(s) {
    const pressed = (b, v) => b.setAttribute('aria-pressed', String(!!v));
    pressed(els.show, s.shown); els.show.disabled = !!s.done && !s.shown;
    els.mShow.disabled = els.show.disabled;
    pressed(els.board, s.board);
    els.board.textContent = ''; els.board.append(h('span', { 'aria-hidden': 'true' }, '📽'), ' ', T(s.board ? 'leaveBoard' : 'boardMode'));
    els.mBoard.querySelector('b').textContent = T(s.board ? 'leaveBoard' : 'boardMode');
    for (const b of [...els.help, ...els.menuHelp]) pressed(b, b.dataset.mode === s.support);
    bar.classList.toggle('oc-tb-on', !!s.board);
  }
  return { bar, button, menu, scrim, paint, close: () => open(false), setsButton: els.sets, menuButton: button };
}

// ---- sets.js
// Oomba Canvas 1.4.0: "My worksheets", a teacher's saved worksheets inside a classroom activity. Only where the page
// offers the list (BRB.canListSets: school staff and the platform admin, in the published activity, never a preview,
// never "As a student"); students never see it. Save as worksheet keeps the questions on screen (the problems only:
// nothing a student did) under a short class code, through the page (BRB.saveQuestionSet); the server cleans them for
// this activity. Each worksheet is one quiet row: its name, one line (how many questions, the date) with the class code
// as a small chip, and the whole row opens it on screen. At the end of the row only Print and a More menu (Answer key,
// Copy link, Duplicate, Rename, Delete). A worksheet's link opens exactly its questions for every student.
// ui.js passes its element helper (h) and its words (T), as teach.js does: nothing is imported from ui.js.

/**
 * o: { h, T, lang, B (the page's BRB, read when used), current () -> { items, title } (the questions on screen),
 *      onScreen () -> the worksheet on screen ({ id, code, title }) or null, open (set), paper () -> 'a4'|'letter',
 *      opener () -> the element focus goes back to }
 * -> { panel, show (on), isOpen () }
 */
function worksheets(o) {
  const { h, T } = o;
  const B = () => o.B() || {};
  const ST = { open: false, list: null, busy: false, msg: '', bad: false, fresh: '', renaming: '', asking: '', loading: false, failed: false };
  // the heading, its close button and the status line stay; only the body is drawn again (focus stays where it is)
  const head = h('h2', { id: 'oc-ws-h', tabindex: '-1' }, h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsTitle'));
  const status = h('p', { class: 'oc-pmsg oc-wsmsg', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'oc-wsbody' });
  const panel = h('section', { class: 'oc-card oc-ws', id: 'oc-ws', hidden: true, 'aria-labelledby': 'oc-ws-h' },
    h('div', { class: 'oc-ptop' }, head, h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => show(false) }, '✕')), body);
  const MENU = { close: null, owner: null };
  const nameOf = s => s.title || s.label || T('wsUntitled');
  const countOf = n => (n === 1 ? T('wsOne') : T('wsMany', { n }));
  const dateOf = ms => {
    try {
      const d = new Date(ms), same = d.getFullYear() === new Date().getFullYear();
      return new Intl.DateTimeFormat(o.lang, same ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
    } catch (e) { return ''; }
  };
  const say = (msg, bad = false) => { ST.msg = msg; ST.bad = bad; };
  const errText = e => T(e === 'full' ? 'wsFull' : e === 'title' ? 'wsBadName' : e === 'bad' ? 'wsCannot' : e === 'none' ? 'wsGone' : e === 'tap' ? 'printTap' : e === 'key' ? 'keyTeacher' : 'wsErr');

  function load() {
    ST.loading = true; ST.failed = false; paint();
    let p = null; try { p = B().mySets(); } catch (e) { p = null; }
    return Promise.resolve(p).then(r => {
      ST.loading = false;
      if (r && Array.isArray(r.sets)) ST.list = r.sets; else { ST.failed = true; if (!ST.list) ST.list = null; }
      paint();
    });
  }
  function show(on) {
    closeMenu(false);
    ST.open = !!on; panel.hidden = !ST.open;
    if (ST.open) { ST.renaming = ''; ST.asking = ''; say(''); paint(); load(); try { head.focus({ preventScroll: false }); } catch (e) { /* not in the page yet */ } } else { try { const b = o.opener(); if (b) b.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  // ---- actions (each through the page; the server checks whose set it is)
  function save() {
    const cur = o.current();
    if (ST.busy || !cur.items.length) return;
    ST.busy = true; say(T('wsSaving')); paint();
    let p = null; try { p = B().saveQuestionSet(cur.items, null, { title: String(cur.title || '').slice(0, 60) }); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      ST.busy = false;
      if (r && r.id) { ST.fresh = r.id; say(T('wsSaved', { code: codeOf(r.id) })); load(); } else { say(errText(r && r.error), true); paint(); }
    });
  }
  function print(s, key) {
    say(T('printBusy')); paint();
    let p = null; try { p = B().print({ k: 'canvas', set: s.id, n: Math.max(1, Math.min(30, s.items.length)), paper: o.paper(), key: !!key && B().canPrintKey === true }); } catch (e) { p = null; }
    Promise.resolve(p).then(r => { if (r && r.ok) say(T('printOk')); else say(errText(r && r.error), true); paint(); });
  }
  function linkOf(s) { const u = B().gameUrl; return u ? `${u}?chapter=${s.id}&lock=1` : ''; }
  function copyLink(s) {
    const url = linkOf(s);
    let p = null; try { p = url && B().copy ? B().copy(url) : null; } catch (e) { p = null; }
    Promise.resolve(p).then(ok => { say(ok ? T('wsCopied') : T('wsCopyNo', { link: url }), !ok); paint(); });
  }
  function duplicate(s) {
    let p = null; try { p = B().duplicateQuestionSet(s.id); } catch (e) { p = null; }
    Promise.resolve(p).then(r => { if (r && r.id) { ST.fresh = r.id; say(T('wsDupDone')); load(); } else { say(errText(r && r.error), true); paint(); } });
  }
  function rename(s, title) {
    let p = null; try { p = B().renameQuestionSet(s.id, title); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      if (r && r.ok) { ST.renaming = ''; say(T('wsRenamed')); load().then(() => focusRow(s.id)); } else { say(errText(r && r.error), true); paint(); focusRename(); }
    });
  }
  function remove(s) {
    let p = null; try { p = B().deleteQuestionSet(s.id); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      ST.asking = '';
      if (r && r.ok) { say(T('wsDeleted')); load().then(() => { try { head.focus(); } catch (e) { /* gone */ } }); } else { say(errText(r && r.error), true); paint(); }
    });
  }
  const codeOf = id => { const c = String(id).replace(/^s-/, '').toUpperCase(); return `${c.slice(0, 5)} ${c.slice(5)}`; };
  const rowOf = id => panel.querySelector(`[data-ws="${id}"]`);
  const focusRow = id => { const r = rowOf(id); const b = r && r.querySelector('.oc-wso'); if (b) b.focus({ preventScroll: false }); };
  const focusRename = () => { const i = panel.querySelector('.oc-wsren input'); if (i) { i.focus(); i.select(); } };

  // ---- the More menu: under its button; arrow keys, Home and End move, Escape, Tab, a click outside or a choice close
  // it, and focus goes back to the button (or on to the rename box or the delete question)
  function closeMenu(back) {
    if (!MENU.close) return;
    const f = MENU.close; MENU.close = null; f(back);
  }
  function openMenu(more, wrap, s) {
    if (MENU.close && MENU.owner === more) { closeMenu(true); return; }
    closeMenu(false);
    const canKey = B().canPrintKey === true && B().canPrint === true;
    const acts = [
      canKey ? ['key', '🔑', T('wsKey'), () => print(s, true)] : null,
      ['copy', '🔗', T('wsCopy'), () => copyLink(s)],
      ['dup', '⧉', T('wsDup'), () => duplicate(s)],
      ['rename', '✏️', T('wsRename'), () => { ST.renaming = s.id; ST.asking = ''; say(''); paint(); focusRename(); }, true],
      ['del', '🗑', T('wsDelete'), () => { ST.asking = s.id; ST.renaming = ''; say(''); paint(); const b = panel.querySelector('.oc-wsask .oc-wsdel'); if (b) b.focus(); }, true],
    ].filter(Boolean);
    const menu = h('div', { class: 'oc-wsmenu', role: 'menu', id: `oc-wsmenu-${s.id}`, 'aria-label': T('wsMoreFor', { title: nameOf(s) }) });
    const btns = acts.map(([k, emo, label, fn, moves]) => {
      const b = h('button', { type: 'button', role: 'menuitem', tabindex: '-1', class: `oc-wsmi${k === 'del' ? ' oc-wsmi-del' : ''}`, 'data-act': k, onclick: () => { closeMenu(!moves); fn(); } },
        h('span', { 'aria-hidden': 'true' }, emo), h('span', {}, label));
      if (k === 'del') menu.append(h('div', { class: 'oc-wssep', role: 'separator' }));
      menu.append(b); return b;
    });
    wrap.append(menu);
    const li = wrap.closest('.oc-wsr'); if (li) li.classList.add('oc-wsup');   // its menu above the rows under it
    more.setAttribute('aria-expanded', 'true');
    const outside = e => { if (!wrap.contains(e.target)) closeMenu(false); };
    menu.addEventListener('keydown', e => {
      const i = btns.indexOf(document.activeElement), n = btns.length;
      if (e.key === 'ArrowDown') btns[(i + 1) % n].focus();
      else if (e.key === 'ArrowUp') btns[(i - 1 + n) % n].focus();
      else if (e.key === 'Home') btns[0].focus();
      else if (e.key === 'End') btns[n - 1].focus();
      else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') { closeMenu(false); return; } else return;
      e.preventDefault();
    });
    MENU.owner = more;
    MENU.close = back => {
      document.removeEventListener('pointerdown', outside, true);
      menu.remove(); more.setAttribute('aria-expanded', 'false'); MENU.owner = null; if (li) li.classList.remove('oc-wsup');
      if (back) more.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    btns[0].focus();
    return btns;
  }

  // ---- drawing
  function paint() {
    closeMenu(false);
    body.textContent = '';
    status.textContent = ST.msg; status.classList.toggle('oc-wsbad', ST.bad);
    const ws = o.onScreen(), cur = o.current();
    const panel = body;
    // what Save does: the questions on screen; a worksheet already on screen says so instead
    panel.append(ws ? h('p', { class: 'oc-wsnow' }, h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsOnScreen', { title: ws.title || T('wsUntitled') }), ' ', h('span', { class: 'oc-wsc', dir: 'ltr' }, ws.code))
      : h('div', { class: 'oc-wssave' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: ST.busy || !cur.items.length, onclick: save }, h('span', { 'aria-hidden': 'true' }, '💾 '), T('wsSave')),
        h('span', { class: 'oc-psmall' }, T('wsSaveD', { n: cur.items.length }))));
    panel.append(status);
    if (ST.loading && !ST.list) { panel.append(h('p', { class: 'oc-psmall' }, T('wsLoading'))); return; }
    if (ST.failed && !ST.list) { panel.append(h('p', { class: 'oc-psmall' }, T('wsLoadFail'), ' '), h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: load }, T('wsRetry'))); return; }
    const list = ST.list || [];
    if (!list.length) { panel.append(h('p', { class: 'oc-psmall oc-wsempty' }, T('wsEmpty'))); return; }
    const ul = h('ul', { class: 'oc-wsl', 'aria-labelledby': 'oc-ws-h' });
    for (const s of list) ul.append(row(s));
    panel.append(ul);
  }
  function row(s) {
    const name = nameOf(s), li = h('li', { class: `oc-wsr${ST.fresh === s.id ? ' oc-wsnew' : ''}`, 'data-ws': s.id });
    if (ST.renaming === s.id) {
      const input = h('input', { type: 'text', maxlength: '60', value: s.title || '', 'aria-label': T('wsName'), dir: 'auto', autocomplete: 'off' });
      const done = () => { const v = input.value.replace(/\s+/g, ' ').trim(); if (!v || v === s.title) { ST.renaming = ''; paint(); focusRow(s.id); return; } rename(s, v); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ST.renaming = ''; say(''); paint(); focusRow(s.id); } });
      li.append(h('div', { class: 'oc-wsren' }, input,
        h('button', { type: 'button', class: 'oc-btn oc-sm oc-primary', onclick: done }, T('wsRenameSave')),
        h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { ST.renaming = ''; say(''); paint(); focusRow(s.id); } }, T('wsCancel'))));
      return li;
    }
    const open = h('button', { type: 'button', class: 'oc-wso', onclick: () => { o.open(s); show(false); } },
      h('b', { class: 'oc-wst', dir: 'auto' }, name),
      h('span', { class: 'oc-wsm' }, h('span', {}, `${countOf(s.n || s.items.length)}${s.updated ? ` · ${dateOf(s.updated)}` : ''}`), h('span', { class: 'oc-wsc', dir: 'ltr', 'aria-label': T('wsCodeSay', { code: s.code }) }, s.code)));
    const tools = h('span', { class: 'oc-wstools' });
    if (B().canPrint === true) tools.append(h('button', { type: 'button', class: 'oc-wsi', 'aria-label': T('wsPrintFor', { title: name }), title: T('print'), onclick: () => print(s, false) }, h('span', { 'aria-hidden': 'true' }, '🖨')));
    const wrap = h('span', { class: 'oc-wsmw' });
    const more = h('button', { type: 'button', class: 'oc-wsi', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `oc-wsmenu-${s.id}`, 'aria-label': T('wsMoreFor', { title: name }), title: T('wsMore'), onclick: () => openMenu(more, wrap, s) }, h('span', { 'aria-hidden': 'true' }, '⋯'));
    more.addEventListener('keydown', e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !MENU.close) { e.preventDefault(); const b = openMenu(more, wrap, s); if (e.key === 'ArrowUp' && b) b[b.length - 1].focus(); } });
    wrap.append(more); tools.append(wrap);
    li.append(h('div', { class: 'oc-wsrow' }, open, tools));
    if (ST.asking === s.id) {
      li.append(h('div', { class: 'oc-wsask', role: 'group', 'aria-label': T('wsDelete') }, h('p', {}, T('wsDelAsk', { title: name })),
        h('span', { class: 'oc-btns' }, h('button', { type: 'button', class: 'oc-btn oc-sm oc-wsdel', onclick: () => remove(s) }, T('wsDelete')),
          h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { ST.asking = ''; paint(); try { rowOf(s.id).querySelector('[aria-haspopup]').focus(); } catch (e) { /* gone */ } } }, T('wsKeep')))));
    }
    return li;
  }
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !MENU.close && !ST.renaming && !ST.asking) { e.preventDefault(); show(false); } else if (e.key === 'Escape' && ST.asking) { e.preventDefault(); ST.asking = ''; paint(); } });
  return { panel, show, isOpen: () => ST.open, paint: () => { if (ST.open) paint(); } };
}

// ---- ui.js
// Oomba Canvas: the activity on the page. A task card, a graph-paper workspace with one manipulative, a Steps panel,
// and a bottom band with the problem's question and Check / Hint / Clear. Each student works on their own copy, on
// their own device: their place in the set is kept in their own game save (BRB.storage 'oc-progress-v1'), and nothing
// leaves the device but the end result (BRB.gameOver once per set). Students only tap, drag and type digits (the
// kit's own keypad and digit keys): there is no text field anywhere.
// 1.3.0: the teacher's controls (teach.js) for the activity's maker and school staff (BRB.canTeach), and the worked
// answer's own lines on screen when it is shown.
// 1.4.0: worksheets (sets.js). A link with a teacher's saved worksheet (BRB.questionSet) plays exactly its questions,
// for everyone; school staff get "My worksheets" in the teacher's controls (BRB.canListSets) to save the questions on
// screen, open, print, share, copy, rename and delete them.
// 1.4.1: 1.4.0 with the phone layout (first made as 1.3.1, which never shipped). The top strip is three groups (the
// title; the status: help mode, ✓, ✗, to go; the actions: New sheet, Print, Teacher, Keypad), each one row that
// scrolls sideways when it cannot fit, never a lone button on a line of its own; short labels on narrow phones; 44 px
// tap targets; the end card's buttons stack full width on a narrow card and wrap whole otherwise (style.js).
// 1.5.0: 1.4.1 in the Crossword look (style.js only): the dotted mint board, the problem line in the dark Now bar, and
// Check a flat pill with an ink outline. Same data, same behavior as 1.4.1.

const VERSION = '1.5.0';
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

/** A worksheet's class code as a teacher reads it: s-c5exp1cm9h -> "C5EXP 1CM9H". */
const wsCode = id => { const c = String(id).replace(/^s-/, '').toUpperCase(); return `${c.slice(0, 5)} ${c.slice(5)}`; };
/** One stacked fraction (the dashboard's .dt-frac). */
const frac = (n, d) => h('span', { class: 'oc-frac', role: 'img', 'aria-label': `${n}/${d}` }, h('span', { class: 'oc-fn' }, n), h('span', { class: 'oc-fl', 'aria-hidden': 'true' }), h('span', { class: 'oc-fd' }, d));

function activity(input) {
  if (typeof document === 'undefined') return null;
  const A0 = input && typeof input === 'object' ? input : {};
  // 1.4.0: a teacher's worksheet that the link opened (BRB.questionSet: the questions they saved, which the server
  // cleaned for this activity): exactly those questions, in their order, for everyone who opens the link
  const qsIn = B().questionSet, qsMissing = !!(qsIn && qsIn.missing);
  const QS = qsIn && !qsIn.missing && typeof qsIn.id === 'string' && Array.isArray(qsIn.items) && qsIn.items.length ? qsIn : null;
  const A = QS ? { ...A0, problems: JSON.parse(JSON.stringify(QS.items)).slice(0, MAX_PROBLEMS), gen: null, config: { ...(A0.config && typeof A0.config === 'object' ? A0.config : {}), fresh: false } } : A0;
  const cfg = A.config && typeof A.config === 'object' ? A.config : {};
  const lang = (B().user && B().user.lang) || cfg.lang || 'en', W = wordsFor(lang), dir = (B().user && B().user.dir) || (/^(ar|he)\b/.test(lang) ? 'rtl' : 'ltr');
  // 1.1.0: config.supports, the help modes this activity offers (in SUPPORTS order). More than one: the support chip is a
  // small switcher, so a student (or the teacher on the board) moves between them; it starts on config.support when that
  // is one of them, else on the first. One, or none (a 1.0.0 activity): the chip, as before.
  const supports = Array.isArray(cfg.supports) ? SUPPORTS.filter(x => cfg.supports.includes(x)) : [];
  let support = SUPPORTS.includes(cfg.support) && (!supports.length || supports.includes(cfg.support)) ? cfg.support : supports[0] || 'guided';
  const modes = supports.length > 1 ? supports : null, board = cfg.board === true;
  // 1.3.0: the teacher's controls, only where the server says this viewer may have them (never a student)
  const teach = B().canTeach === true;
  const task = A.task && typeof A.task === 'object' ? A.task : {};
  const ownSteps = A.steps && typeof A.steps === 'object' ? A.steps : {}, ownHints = A.hints && typeof A.hints === 'object' ? A.hints : {};
  // 1.2.0: what it is for (config.purpose): practice on screen (always), a printable worksheet, a question generator.
  // Printing goes through the page (BRB.print: the frame cannot print); the answer key only where the page says the
  // viewer may print it (BRB.canPrintKey: the activity's maker, school staff; never a student).
  const purpose = Array.isArray(cfg.purpose) && cfg.purpose.some(x => PURPOSES.includes(x)) ? PURPOSES.filter(x => cfg.purpose.includes(x)) : ['screen'];
  const printable = (purpose.includes('worksheet') || purpose.includes('generator')) && B().canPrint === true && typeof B().print === 'function';
  const fresh = purpose.includes('generator') && !!(A.gen && TOOLS[A.gen.tool]);

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
  const arrow = c => h('span', { dir: 'ltr', 'aria-hidden': 'true' }, c);
  // a label with a shorter twin for narrow phones (1.4.1: style.js shows one of the two)
  const dual = (long, short) => [h('span', { class: 'oc-ll' }, long), h('span', { class: 'oc-ls', 'aria-hidden': 'true' }, short)];
  const strip = h('header', { class: 'oc-strip' },
    el.title = h('h1', { dir: 'auto' }, String(task.title || document.title || '').slice(0, 80)),
    el.stat = h('div', { class: 'oc-stat' },
      modes ? (el.modes = h('div', { class: 'oc-modes', role: 'group', 'aria-label': T('helpMode') }, ...modes.map(m => h('button', { type: 'button', class: 'oc-mode', 'data-mode': m, 'aria-pressed': String(m === support), onclick: () => setSupport(m) }, T(m)))))
        : (el.sup = h('span', { class: 'oc-chip oc-sup' }, T(support))),
      board ? h('span', { class: 'oc-chip' }, T('board')) : null,
      teach ? (el.boardChip = h('span', { class: 'oc-chip oc-bchip', hidden: true }, h('span', { 'aria-hidden': 'true' }, '📽 '), T('boardChip'))) : null,
      el.ok = h('span', { class: 'oc-chip oc-ok' }), el.no = h('span', { class: 'oc-chip oc-no' }), el.left = h('span', { class: 'oc-chip oc-togo' })),
    // (Back and Next follow the reading direction: the strip is a row in the page's direction, the arrows point outward;
    // each arrow is set left to right so the browser never mirrors it a second time)
    teach ? (el.nav = h('span', { class: 'oc-bnav', hidden: true }, h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => boardGo(-1) }, arrow(dir === 'rtl' ? '›' : '‹'), ' ', T('back')), el.navAt = h('b', { 'aria-live': 'polite' }), h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => boardGo(1) }, T('next'), ' ', arrow(dir === 'rtl' ? '‹' : '›')))) : null,
    el.acts = h('div', { class: 'oc-acts' },
      fresh ? h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('newSheet'), onclick: () => again(true) }, h('span', { 'aria-hidden': 'true' }, '🎲'), ' ', ...dual(T('newSheet'), T('newShort'))) : null,
      printable ? (el.printBtn = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('print'), 'aria-expanded': 'false', 'aria-controls': 'oc-print', onclick: () => printPanel(!PR.open) }, h('span', { 'aria-hidden': 'true' }, '🖨'), ' ', ...dual(T('print'), T('printGo')))) : null,
      el.keyBtn = h('button', { type: 'button', class: 'oc-btn oc-sm oc-keybtn', 'aria-pressed': 'false', 'aria-controls': 'oc-keys', onclick: () => keypad(!S.keys) }, h('span', { 'aria-hidden': 'true' }, '⌨'), ' ', T('keypad'))));
  // 1.3.0: the teacher's controls (teach.js): a bar under the strip, or one Teacher button and its menu on phones
  // (1.4.1: the button sits with the other actions, not on top of the title)
  // 1.4.0: My worksheets, only where the page offers the list (school staff in the published activity; never a student)
  const hasSets = teach && B().canListSets === true && typeof B().mySets === 'function' && typeof B().saveQuestionSet === 'function';
  const TC = teach ? teachControls({ h, T, supports: SUPPORTS, gen: !!(A.gen && TOOLS[A.gen.tool]), sets: hasSets, state: () => ({ board: S.boardOn }), on: { show: showAnswer, board: setBoard, help: m => setSupport(m, true), newSet: () => again(true), sets: () => setTimeout(() => wsPanel(!WS.isOpen()), 0) } }) : null;
  if (TC) el.acts.insertBefore(TC.button, el.keyBtn);
  const canSay = !!(task.say && B().speak);
  const card = h('section', { class: 'oc-task', 'aria-label': T('task') },
    h('div', { class: 'oc-taskt' }, el.n = h('span', { class: 'oc-n' }), el.task = h('p', { id: 'oc-taskline', dir: 'auto' })),
    canSay ? h('button', { type: 'button', class: 'oc-say', 'aria-label': T('readAloud'), onclick: () => call(() => B().speak(String(task.say).slice(0, 300), { lang: cfg.lang || lang })) }, '🔊') : null);
  el.work = h('section', { class: 'oc-card oc-work', 'aria-label': T('workspace') });
  el.stepsBox = h('aside', { class: 'oc-card oc-steps', 'aria-labelledby': 'oc-steps-h' },
    h('div', { class: 'oc-steps-top' }, el.stepsH = h('h2', { id: 'oc-steps-h' }, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('steps')),
      el.stepsToggle = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-expanded': support === 'own' ? 'false' : 'true', 'aria-controls': 'oc-steps-list', onclick: () => { S.stepsOpen = !S.stepsOpen; paintSteps(); } })),
    el.steps = h('ol', { id: 'oc-steps-list' }));
  el.hint = h('div', { class: 'oc-hint', role: 'note', hidden: true });
  el.fb = h('div', { class: 'oc-fb', role: 'status', 'aria-live': 'polite' });
  el.ask = h('p', { class: 'oc-ask', dir: 'auto' });
  el.check = h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => (S.phase === 'done' ? next() : doCheck()) });
  el.hintBtn = h('button', { type: 'button', class: 'oc-btn', onclick: showHint });
  el.clear = h('button', { type: 'button', class: 'oc-btn', onclick: clear }, '⌫ ', T('clear'));
  el.keys = h('div', { class: 'oc-keys', id: 'oc-keys', hidden: true, dir: 'ltr', role: 'group', 'aria-label': T('keypad') },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => h('button', { type: 'button', class: 'oc-key', onclick: () => typeDigit(+d) }, d)),
    el.dot = h('button', { type: 'button', class: 'oc-key', 'aria-label': T('point'), hidden: true, onclick: () => typeDigit('.') }, '.'),
    h('button', { type: 'button', class: 'oc-key', 'aria-label': T('del'), onclick: () => typeDigit(null) }, '⌫'));
  const band = h('footer', { class: 'oc-band' }, el.hint, el.fb, h('div', { class: 'oc-act' }, el.ask, h('div', { class: 'oc-btns' }, el.check, el.hintBtn, el.clear)), el.keys);
  el.end = h('section', { class: 'oc-end', hidden: true, 'aria-labelledby': 'oc-end-h' });
  el.main = h('div', { class: 'oc-main' }, el.work, el.stepsBox);
  el.print = h('section', { class: 'oc-card oc-print', id: 'oc-print', hidden: true, 'aria-labelledby': 'oc-print-h' });
  // 1.4.0: the worksheet on screen (teachers), or a link whose worksheet is gone (everyone)
  el.wsNote = h('p', { class: 'oc-wsbar', role: 'status', hidden: true });
  const WS = hasSets ? worksheets({ h, T, lang, B, current: () => ({ items: S.set.slice(0, 20), title: task.title || '' }), onScreen: () => S.ws, open: openWorksheet, paper: () => PR.paper,
    opener: () => (TC.setsButton && TC.setsButton.offsetParent ? TC.setsButton : TC.menuButton) }) : null;
  const shell = h('div', { class: `oc${board ? ' oc-board' : ''}${teach ? ' oc-teach' : ''}`, 'data-support': support }, strip, TC ? TC.bar : null, el.wsNote, el.print, WS ? WS.panel : null, card, el.main, band, el.end, TC ? TC.scrim : null, TC ? TC.menu : null);
  root.append(shell);

  // ---- the set: fresh per student (a seed of their own, never the same problem twice), and where they were
  const sig = sigOf(A);
  const saved = (() => { const v = call(() => B().storage && B().storage.get(SAVE_KEY)); return v && typeof v === 'object' && v.sig === sig ? v : null; })();
  const S = {
    seed: saved && Number.isInteger(saved.seed) ? saved.seed : (Math.floor(Math.random() * 2 ** 31) || 7), seen: saved && Array.isArray(saved.seen) ? saved.seen.slice(-200) : [],
    set: [], i: 0, right: 0, wrong: 0, st: null, tries: 0, phase: 'work', hintN: 0, stuck: false, keys: false, stepsOpen: support !== 'own', stepVal: [], stepDone: [], sel: null, watching: false, reported: false, idle: 0,
    // 1.3.0: shown (the problems whose answer the teacher showed: not counted), boardOn (board mode now), boardUsed (this
    // set was run on the board: no score), revealed (the worked answer is on screen)
    shown: saved && Array.isArray(saved.sh) ? saved.sh.filter(Number.isInteger) : [], boardOn: false, boardUsed: false, revealed: false, byTeacher: false,
    // 1.4.0: the worksheet on screen: { id, code, title, items? } (link: true when the link opened it; else a teacher
    // opened it from My worksheets, and its questions replace the set on this screen only)
    ws: QS ? { id: QS.id, code: wsCode(QS.id), title: '', link: true } : null,
  };
  function dealSet(resume) {
    S.set = S.ws && !S.ws.link ? deal({ ...A, problems: S.ws.items, gen: null, config: { ...cfg, fresh: false } }, { seed: S.seed }) : deal(A, { seed: S.seed, seen: S.seen });
    S.i = 0; S.right = 0; S.wrong = 0; S.reported = false; S.boardUsed = S.boardOn;
    if (resume && saved && !saved.done && Number.isInteger(saved.i) && saved.i < S.set.length) { S.i = saved.i; S.right = saved.right | 0; S.wrong = saved.wrong | 0; } else S.shown = [];
    for (const p of S.set) { const k = TOOLS[p.tool].key(p); if (!S.seen.includes(k)) S.seen.push(k); }
  }
  // (a worksheet a teacher opened here is not their place in the activity: nothing is kept for it)
  const save = (extra = {}) => !(S.ws && !S.ws.link) && call(() => B().storage && B().storage.set(SAVE_KEY, { sig, seed: S.seed, seen: S.seen.slice(-200), i: S.i, right: S.right, wrong: S.wrong, st: S.phase === 'work' ? S.st : null, ...(S.shown.length ? { sh: S.shown } : {}), ...extra }));

  // ---- one problem
  const P = () => S.set[S.i];
  const Tool = () => TOOLS[P().tool];
  function begin(resumeSt) {
    const p = P(), t = Tool();
    S.st = resumeSt && typeof resumeSt === 'object' ? resumeSt : t.start(p); S.tries = 0; S.phase = 'work'; S.hintN = 0; S.stuck = false; S.sel = null; S.idle = Date.now(); S.revealed = false; S.byTeacher = false;
    const steps = stepList(p); S.stepVal = steps.map(() => null); S.stepDone = steps.map(() => false);
    el.hint.hidden = true; el.fb.textContent = ''; el.fb.className = 'oc-fb';
    if (p.tool === 'figure.number') S.sel = 'fig';
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
  /** The switcher (1.1.0): another help mode for the problem on screen. It starts that problem again in the new mode
   *  (Watch shows the worked answer first; On my own closes the Steps panel); the set, the score and the place stay. */
  function setSupport(m, byTeacher = false) {
    // 1.3.0: the teacher's Help (byTeacher) may pick any of the four, for this screen only; students only the offered ones
    if (byTeacher ? !SUPPORTS.includes(m) : !modes || !modes.includes(m)) return;
    if (m === support) return;
    support = m; shell.dataset.support = m;
    if (el.modes) for (const b of el.modes.children) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    if (el.sup) el.sup.textContent = T(m);
    S.stepsOpen = m !== 'own';
    if (S.phase === 'work') begin(null); else paint();
  }

  function paint() {
    const p = P(), t = Tool(), total = S.set.length;
    el.ok.textContent = `✓ ${S.right}`; el.ok.setAttribute('aria-label', `${T('right')} ${S.right}`);
    el.no.textContent = `✗ ${S.wrong}`; el.no.setAttribute('aria-label', `${T('notYet')} ${S.wrong}`);
    el.left.textContent = T('toGo', { n: total - S.i - (S.phase === 'done' ? 1 : 0) });
    el.n.textContent = T('problemOf', { n: S.i + 1, total });
    const tk = t.task(p); el.task.textContent = ''; el.task.append(line(tk));
    const q = t.ask(p); el.ask.textContent = ''; el.ask.append(line(q));
    el.dot.hidden = p.tool !== 'figure.number';
    el.check.textContent = S.phase === 'done' ? `${T('next')} ›` : `✓ ${T('check')}`;
    el.check.disabled = S.watching;
    el.hintBtn.textContent = ''; el.hintBtn.append(S.stuck ? '🙋 ' : '💡 ', T(S.stuck ? 'stuck' : 'hint'));
    el.hintBtn.classList.toggle('oc-lit', S.stuck && S.phase === 'work'); el.hintBtn.disabled = S.phase !== 'work' || S.watching;
    el.clear.disabled = S.phase !== 'work' || S.watching;
    el.work.dataset.tool = p.tool;
    el.work.textContent = '';
    el.work.append(VIEWS[p.tool](p, S.st, { locked: S.phase !== 'work' || S.watching, set, rich, T, lang, guide: support !== 'own', select: sel => { S.sel = sel; if (sel && coarse()) keypad(true); paint(); }, sel: S.sel }));
    paintSteps();
    if (TC) {
      el.navAt.textContent = T('nOfN', { n: S.i + 1, total });
      TC.paint({ support, board: S.boardOn, shown: S.shown.includes(S.i), done: S.phase === 'done' });
    }
  }
  function paintSteps() {
    const p = P();
    // 1.3.0: a worked answer on screen (the teacher's Show answer, or the kit's after a second try) lists a figure
    // question's own "work" lines, the last one (the answer) marked
    const work = S.revealed && Array.isArray(p.work) && p.work.length ? p.work : null;
    el.stepsBox.classList.toggle('oc-worked', !!work);
    el.stepsH.textContent = '';
    el.stepsH.append(h('span', { 'aria-hidden': 'true' }, work ? '👀 ' : '🪜 '), T(work ? 'workedAnswer' : 'steps'));
    el.stepsToggle.hidden = !!work;
    if (work) {
      el.steps.hidden = false; el.stepsBox.classList.remove('oc-closed'); el.steps.textContent = '';
      work.forEach((w, i) => el.steps.append(h('li', { class: i === work.length - 1 ? 'oc-done oc-last' : 'oc-done' }, h('span', { class: 'oc-k', 'aria-hidden': 'true' }, String(i + 1)), h('div', {}, h('p', { dir: 'auto' }, w)))));
      return;
    }
    const steps = stepList(p), now = steps.findIndex((s, i) => s.ans !== undefined && !S.stepDone[i]);
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
    if (S.sel === 'seed' && PR.open) { if (d === '.') return; const cur = PR.retype && d !== null ? '' : String(PR.seed); PR.retype = false; const nx = d === null ? cur.slice(0, -1) : (cur === '0' ? '' : cur) + d; PR.seed = Math.min(999999, +nx.slice(0, 6) || 0); paintPrint(); return; }
    if (!S.sel || S.phase !== 'work' || S.watching) return;
    if (S.sel === 'fig' && P().tool === 'figure.number') {
      const cur = (S.st && typeof S.st.typed === 'string' ? S.st.typed : '');
      if (d === '.' && cur.includes('.')) return;
      const nx = d === null ? cur.slice(0, -1) : (cur + (d === '.' && !cur ? '0.' : d)).slice(0, 9);
      set({ typed: nx }); return;
    }
    if (d === '.') return;
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
      S.wrong++; S.phase = 'done'; S.lastOk = false; reveal(p);
      feedback('shown', rich('shown'));
    }
    save({ i: S.phase === 'done' ? S.i + 1 : S.i });
    paint();
    el.check.focus({ preventScroll: true });
  }
  /** The worked answer on screen: the manipulative solved, every step box filled, and a figure's own work lines. */
  function reveal(p) {
    S.st = Tool().solve(p) || S.st; S.revealed = true;
    stepList(p).forEach((s, i) => { if (s.ans !== undefined) S.stepVal[i] = s.ans; S.stepDone[i] = true; });
  }
  // ---- 1.3.0: the teacher's controls (teach.js). None of them reaches the server.
  /** Show answer: the worked answer of the problem on screen. Unanswered, it counts neither right nor wrong. */
  function showAnswer() {
    if (!TC) return;
    const p = P(); if (!p) return;
    if (S.phase === 'work') {
      S.watching = false; S.phase = 'done'; S.lastOk = false; S.byTeacher = true;
      if (!S.shown.includes(S.i)) S.shown.push(S.i);
      reveal(p);
      const f = document.createDocumentFragment(); f.append(h('span', { 'aria-hidden': 'true' }, '👀 '), T('shownByTeacher'));
      feedback('shown oc-tans', f);
      save({ i: S.i + 1 });
    } else S.revealed = true;
    paint();
  }
  /** Board mode: big type, Back / n of N / Next, no ✓ ✗ and no keypad; a set run on the board sends no score. */
  function setBoard(on) {
    if (!TC) return;
    S.boardOn = !!on; if (S.boardOn) S.boardUsed = true;
    document.documentElement.classList.toggle('oc-boardon', S.boardOn);
    shell.classList.toggle('oc-boardmode', S.boardOn);
    el.boardChip.hidden = !S.boardOn; el.nav.hidden = !S.boardOn;
    if (S.boardOn) keypad(false);
    TC.close(); paint();
  }
  /** Board mode's Back and Next: the teacher moves through the set (nothing is counted on the board). */
  function boardGo(d) {
    if (!S.boardOn || !el.end.hidden) return;
    const to = S.i + d;
    if (to < 0) return;
    if (to >= S.set.length) return finish();
    S.i = to; save(); begin();
  }
  function next() {
    if (S.i + 1 >= S.set.length) return finish();
    S.i++; save(); begin(); el.task.scrollIntoView && call(() => el.task.scrollIntoView({ block: 'nearest' }));
    el.check.focus({ preventScroll: true });
  }
  function finish() {
    const total = S.set.length;
    save({ i: total, done: true });
    // 1.3.0: a problem the teacher showed is not counted (won: every other one right), and the result says so (helped);
    // a set run in board mode sends nothing, like config.board
    const shown = S.shown.filter(i => i < total).length;
    if (!board && !S.boardUsed && !S.reported) { S.reported = true; call(() => B().gameOver && B().gameOver({ won: S.right === total - shown && total > shown, score: S.right, ...(shown ? { helped: true } : {}) })); }
    sfx('win'); call(() => { if (S.right && !reduced() && B().fx && B().fx.confetti) B().fx.confetti(); });
    el.main.hidden = true; card.hidden = true; band.hidden = true;
    el.end.hidden = false; el.end.textContent = '';
    el.end.append(h('h2', { id: 'oc-end-h' }, T('endH', { right: S.right, total })), h('p', {}, T(S.right === total ? 'endAll' : 'endSome')),
      h('div', { class: 'oc-btns oc-endbtns' },
        h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => again() }, A.gen ? `🎲 ${T('newSet')}` : `↻ ${T('again')}`),
        printable ? h('button', { type: 'button', class: 'oc-btn', onclick: () => printPanel(true) }, `🖨 ${T('print')}`) : null,
        B().back ? h('button', { type: 'button', class: 'oc-btn', onclick: () => call(() => B().back()) }, arrow(dir === 'rtl' ? '→' : '←'), ` ${T('back')}`) : null));   // (1.4.1: points back in Hebrew and Arabic too)
    el.left.textContent = T('toGo', { n: 0 });
    el.end.querySelector('button').focus({ preventScroll: true });
  }
  function again(newSheet) {
    if (A.gen) S.seed = (S.seed * 48271 + 11) % 2147483647 || 7;
    if (newSheet === true) S.seen = [];   // "New sheet" (1.2.0): a fresh set from the generator, on screen
    if (newSheet === true && S.ws && !S.ws.link) { S.ws = null; paintWs(); }   // (1.4.0) New set leaves a worksheet opened here
    dealSet(false); save();
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    begin();
  }
  // ---- printing (1.2.0): a sheet of N questions from a seed (its number, printed on the sheet, makes it again), on A4
  // or US Letter, with the answer key on a page of its own when the viewer may print it. The page and the server make
  // the printable page from the activity's own data (sheet.js); the frame only asks.
  const maxQ = A.gen && TOOLS[A.gen.tool] ? MAX_PROBLEMS : Math.max(1, deal(A, { count: MAX_PROBLEMS }).length);
  const PR = { open: false, n: Math.min(maxQ, Number.isInteger(cfg.count) ? cfg.count : 5), paper: /^en$|^en-US/.test(lang) ? 'letter' : 'a4', key: false, seed: 0, busy: false, msg: '' };
  function printPanel(on) {
    PR.open = !!on; el.print.hidden = !PR.open; if (el.printBtn) el.printBtn.setAttribute('aria-expanded', String(PR.open));
    if (PR.open) { if (!PR.seed) PR.seed = (S.seed % 999999) || 1; PR.msg = ''; paintPrint(); call(() => el.print.querySelector('h2').focus()); } else { if (S.sel === 'seed') S.sel = null; call(() => el.printBtn && el.printBtn.focus()); }
  }
  function paintPrint() {
    const canKey = B().canPrintKey === true, seedSel = S.sel === 'seed';
    const tog = (on, label, fn) => h('button', { type: 'button', class: 'oc-btn oc-sm oc-tog', 'aria-pressed': String(on), onclick: fn }, label);
    el.print.textContent = '';
    // 1.4.0: a worksheet on screen prints its own questions, with its class code on the sheet
    if (S.ws) {
      el.print.append(
        h('div', { class: 'oc-ptop' }, h('h2', { id: 'oc-print-h', tabindex: '-1' }, '🖨 ', T('printH')), h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => printPanel(false) }, '✕')),
        h('p', { class: 'oc-psmall' }, T('wsPrints', { code: S.ws.code, n: S.set.length })),
        h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pp' }, T('paper')),
          h('span', { class: 'oc-pseg', role: 'group', 'aria-labelledby': 'oc-pp' }, tog(PR.paper === 'a4', T('a4'), () => { PR.paper = 'a4'; paintPrint(); }), tog(PR.paper === 'letter', T('letter'), () => { PR.paper = 'letter'; paintPrint(); }))),
        canKey ? h('div', { class: 'oc-prow' }, tog(PR.key, `🔑 ${T('keyAdd')}`, () => { PR.key = !PR.key; paintPrint(); })) : null,
        h('div', { class: 'oc-prow' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: PR.busy, onclick: doPrint }, '🖨 ', T('printGo')), h('span', { class: 'oc-pmsg', role: 'status' }, PR.msg)));
      return;
    }
    el.print.append(
      h('div', { class: 'oc-ptop' }, h('h2', { id: 'oc-print-h', tabindex: '-1' }, '🖨 ', T('printH')), h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => printPanel(false) }, '✕')),
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pn' }, T('printCount')),
        h('span', { class: 'oc-pstep', role: 'group', 'aria-labelledby': 'oc-pn' },
          h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('fewer'), disabled: PR.n <= 1, onclick: () => { PR.n = Math.max(1, PR.n - 1); paintPrint(); } }, '−'),
          h('b', { class: 'oc-pnum', 'aria-live': 'polite' }, String(PR.n)),
          h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('more'), disabled: PR.n >= maxQ, onclick: () => { PR.n = Math.min(maxQ, PR.n + 1); paintPrint(); } }, '+'))),
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pp' }, T('paper')),
        h('span', { class: 'oc-pseg', role: 'group', 'aria-labelledby': 'oc-pp' }, tog(PR.paper === 'a4', T('a4'), () => { PR.paper = 'a4'; paintPrint(); }), tog(PR.paper === 'letter', T('letter'), () => { PR.paper = 'letter'; paintPrint(); }))),
      canKey ? h('div', { class: 'oc-prow' }, tog(PR.key, `🔑 ${T('keyAdd')}`, () => { PR.key = !PR.key; paintPrint(); })) : null,
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-ps' }, T('sheetNoH')),
        h('button', { type: 'button', class: `oc-box oc-seed${seedSel ? ' oc-sel' : ''}`, dir: 'ltr', 'aria-labelledby': 'oc-ps', 'aria-pressed': String(seedSel), onclick: () => { S.sel = seedSel ? null : 'seed'; PR.retype = !seedSel; if (!seedSel && coarse()) keypad(true); paintPrint(); } }, String(PR.seed || '')),
        A.gen ? h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { PR.seed = 1 + Math.floor(Math.random() * 999998); paintPrint(); } }, '🎲 ', T('newSheet')) : null),
      h('p', { class: 'oc-psmall' }, T('sheetType')),
      h('div', { class: 'oc-prow' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: PR.busy || !PR.seed, onclick: doPrint }, '🖨 ', T('printGo')), h('span', { class: 'oc-pmsg', role: 'status' }, PR.msg)));
  }
  function doPrint() {
    if (PR.busy || (!PR.seed && !S.ws)) return;
    PR.busy = true; PR.msg = T('printBusy'); paintPrint();
    const which = S.ws ? { set: S.ws.id, n: Math.max(1, Math.min(MAX_PROBLEMS, S.set.length)) } : { seed: PR.seed, n: PR.n };
    let r = null; try { r = B().print({ k: 'canvas', ...which, paper: PR.paper, key: PR.key && B().canPrintKey === true }); } catch (e) { r = null; }
    Promise.resolve(r).then(x => {
      PR.busy = false;
      PR.msg = x && x.ok ? T('printOk') : T(x && x.error === 'tap' ? 'printTap' : x && x.error === 'key' ? 'keyTeacher' : x && x.error === 'notAllowed' ? 'printNo' : 'printErr');
      paintPrint();
    });
  }
  // ---- 1.4.0: worksheets
  /** A worksheet from My worksheets on this screen: its questions in their order (a new set or New sheet leaves it). */
  function openWorksheet(set) {
    if (!set || !Array.isArray(set.items) || !set.items.length) return;
    S.ws = { id: set.id, code: set.code || wsCode(set.id), title: set.title || set.label || '', items: JSON.parse(JSON.stringify(set.items)) };
    if (PR.open) printPanel(false);
    dealSet(false);
    if (!S.set.length) { S.ws = null; dealSet(false); }
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    paintWs(); begin();
  }
  function wsPanel(on) {
    if (!WS) return;
    if (on && PR.open) printPanel(false);
    WS.show(on);
    if (TC.setsButton) TC.setsButton.setAttribute('aria-expanded', String(!!on));
  }
  /** The line under the teacher's controls: the worksheet on screen (teachers), or a link whose worksheet is gone. */
  function paintWs() {
    el.wsNote.textContent = '';
    if (S.ws && teach) el.wsNote.append(h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsOnScreen', { title: S.ws.title || T('wsUntitled') }), ' ', h('span', { class: 'oc-wsc', dir: 'ltr' }, S.ws.code));
    else if (qsMissing) el.wsNote.append(T('wsMissing'));
    el.wsNote.hidden = !el.wsNote.textContent;
    if (WS) WS.paint();
  }
  function keypad(on) { S.keys = !!on; el.keys.hidden = !S.keys; el.keyBtn.setAttribute('aria-pressed', String(S.keys)); }
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // ---- keys: digits and Backspace for the selected box; Enter checks
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) && S.sel) { e.preventDefault(); typeDigit(+e.key); }
    else if ((e.key === '.' || e.key === ',') && S.sel === 'fig') { e.preventDefault(); typeDigit('.'); }
    else if (e.key === 'Escape' && PR.open) { printPanel(false); }
    else if (e.key === 'Backspace' && S.sel) { e.preventDefault(); typeDigit(null); }
  });
  // "Stuck?" lights up after 45 s without a move, the same as the Big Divide
  setInterval(() => { if (S.phase === 'work' && !S.watching && !S.stuck && Date.now() - S.idle > IDLE_MS) { S.stuck = true; paint(); } }, 5000);

  dealSet(true);
  paintWs();
  if (!S.set.length) { el.work.append(h('p', {}, T('fbEmpty'))); return { selfTest: () => selfTest(A, WORDS.en) }; }
  if (saved && saved.done) { S.i = 0; }
  begin(saved && !saved.done && saved.i === S.i ? saved.st : null);
  if (support === 'own') S.stepsOpen = false, paintSteps();
  const api = {
    version: VERSION, selfTest: () => selfTest(A, WORDS.en),
    state: () => ({ screen: el.end.hidden ? 'work' : 'end', problem: S.i + 1, problems: S.set.length, right: S.right, wrong: S.wrong, tool: P() && P().tool, phase: S.phase, score: S.right, controls: 'none', support, supports: modes || [support], purpose, seed: S.seed, worksheet: S.ws ? S.ws.id : null }),
    /** The printable sheet for a seed (sheet.js), as data: what the page prints for this activity. */
    sheet: (seed, n) => sheet(A, { seed, n, lang }),
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
    const bar = h('div', { class: 'oc-bar oc-tall', role: 'group', 'aria-label': c.T('workspace'), 'data-oc-dense': '' }, ...Array.from({ length: p.d }, (_, i) => tapped(h('button', { type: 'button', class: `oc-part${on.has(i) ? ' oc-on oc-c1' : ''}`, style: `width:${pct(1 / p.d)}`, 'aria-pressed': String(on.has(i)), 'aria-label': `${i + 1}/${p.d}`, disabled: c.locked }), () => { const n = new Set(on); n.has(i) ? n.delete(i) : n.add(i); c.set({ on: [...n] }); })));
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
/** A figure question (1.2.0): the figure (Oomba Figures, when its pinned tag is on the page), then the answer: a box
 *  the kit's keypad and the digit keys type into (figure.number), or 2 to 4 answers to tap (figure.choice). */
function figPic(p, c) {
  if (!p.fig) return null;
  const OF = typeof globalThis !== 'undefined' ? globalThis.OombaFigures : null;
  if (!OF || typeof OF.draw !== 'function') { call(() => console.warn('[oomba] figure: add the pinned Oomba Figures tag (docs/figures-api.md)')); return h('p', { class: 'oc-figmiss' }, c.T('figMissing')); }
  let el = null; const { kind, hide, ...data } = p.fig;
  try { el = OF.draw(kind, { kind, ...data }, { lang: c.lang, title: p.q, hide: hide || false }); } catch (e) { el = null; }
  return h('div', { class: 'oc-fig' }, el || h('p', { class: 'oc-figmiss' }, c.T('figMissing')));
}
VIEWS['figure.number'] = (p, st, c) => {
  const on = c.sel === 'fig', typed = typeof st.typed === 'string' ? st.typed : '';
  return h('div', { class: 'oc-stack oc-figq' }, figPic(p, c),
    h('div', { class: 'oc-figans', dir: 'ltr' }, tapped(h('button', { type: 'button', class: `oc-box oc-figbox${on ? ' oc-sel' : ''}`, 'aria-pressed': String(on), 'aria-label': c.T('box'), disabled: c.locked }, typed), () => c.select(on ? null : 'fig')),
      p.unit ? h('span', { class: 'oc-unit', dir: 'auto' }, p.unit) : null));
};
VIEWS['figure.choice'] = (p, st, c) => h('div', { class: 'oc-stack oc-figq' }, figPic(p, c),
  h('div', { class: 'oc-choices', role: 'group', 'aria-label': c.T('figPickQ') }, ...p.choices.map((t, i) => tapped(h('button', { type: 'button', class: 'oc-btn oc-choice', 'aria-pressed': String(st.pick === i), disabled: c.locked, dir: 'auto' }, h('b', { 'aria-hidden': 'true' }, `${String.fromCharCode(65 + i)}`), ' ', t), () => c.set({ pick: i })))));
function lineView(p, st, c, from) {
  const lo = p.lo * p.sub, hi = p.hi * p.sub, n = hi - lo, R = v => { const r = Array.isArray(v) ? { n: v[0], d: v[1] } : { n: v, d: 1 }; return (r.n * p.sub) / r.d; };
  const ticks = [];
  for (let t = lo; t <= hi; t++) {
    const whole = t % p.sub === 0, on = st.tick === t, start = from !== null && R(from) === t;
    ticks.push(tapped(h('button', { type: 'button', class: `oc-tick${whole ? ' oc-whole' : ''}${on ? ' oc-on' : ''}${start ? ' oc-start' : ''}`, style: `left:${pct((t - lo) / n)}`, 'aria-pressed': String(on), disabled: c.locked,
      'aria-label': whole ? String(t / p.sub) : `${t - Math.floor(t / p.sub) * p.sub}/${p.sub} + ${Math.floor(t / p.sub)}` }, h('i', { 'aria-hidden': 'true' }), whole ? h('span', { class: 'oc-tlab' }, String(t / p.sub)) : null), () => c.set({ tick: t })));
  }
  // (1.4.1: each tick is as wide as its share of the line, at most 44 px, so a tap anywhere on the line lands on the
  // nearest tick and neighbours never overlap; data-oc-dense tells the Builder's layout check they are small by design)
  return h('div', { class: 'oc-stack', dir: 'ltr' }, h('div', { class: 'oc-line', style: `--oc-gap:${(100 / n).toFixed(3)}%`, 'data-oc-dense': '' }, h('div', { class: 'oc-axis', 'aria-hidden': 'true' }), ...ticks));
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
//   Oc.sheet(activity, { seed, n, lang })                         the printable worksheet as data (1.2.0)
//   Oc.tools, Oc.words, Oc.version
// In a page with no document (the server's check, server/services/canvaskit.js) only the pure parts are there.

const OombaCanvas = Object.freeze({
  version: VERSION,
  activity,
  selfTest: a => selfTest(a, WORDS.en),
  tools: Object.freeze(Object.keys(TOOLS)),
  logic: Object.freeze({ TOOLS, deal, seeded, cleanProblem, numText }),
  // 1.2.0: the printable worksheet as data (sheet.js), for the page's printer and the self-test
  sheet: (a, o) => sheet(a, o || {}),
  words: WORDS,
});
globalThis.OombaCanvas = OombaCanvas;
globalThis.Oc = OombaCanvas;

})();
