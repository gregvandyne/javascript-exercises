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
export function evalExpr(src, vars = {}) {
  let tree = exprCache.get(src);
  if (!tree) { tree = exprParse(src); if (exprCache.size > 200) exprCache.clear(); exprCache.set(src, tree); }
  const v = exprRun(tree, vars || {});
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('the formula does not give a finite number (a division by zero?)');
  return v;
}
/** Does this text parse as a formula? -> '' or why not. */
export function exprProblem(src) { try { exprParse(src); return ''; } catch (e) { return String(e.message); } }
