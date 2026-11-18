// Classroom dashboards, stage 4: "Make a question from it" (docs/decisions.md "Classroom dashboards, stage 4"). Turns what
// a teaching tool shows now into a multiple-choice quick check (stage 2's kind 'choice': a question and 2-6 answers).
// Pure: no DOM, no network. The teacher sees the question in a sheet, can change any word, and sends it as a quick check;
// the right answer is shown to the teacher only (quick checks never mark answers right or wrong on a student's screen).
// Every answer is built from the tool's state with the tested maths (dash-math.js, dash-math4.js); a tool whose state
// has nothing with one right answer (a graphic organizer, an empty board) makes no question, and its button is hidden.
import * as M from './dash-math.js';
import * as M4 from './dash-math4.js';
import * as M5 from './dash-math5.js';

const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** The answers, the right one among them, in an order that depends on the state (so it isn't always A). */
function choice(q, right, wrong, seed) {
  const opts = [String(right)];
  for (const w of wrong) { const s = String(w); if (s && !opts.includes(s) && opts.length < 4) opts.push(s); }
  if (opts.length < 2 || !q) return null;
  const rnd = M4.seeded(hash(seed));
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { q, options: opts.map(o => [...o].slice(0, 60).join('')), answer: opts.indexOf(String(right)) };
}
const near = (n, ds, ok = x => x >= 0) => ds.map(d => n + d).filter(ok);
const sliceText = (s, n) => [...String(s)].slice(0, n).join('');

/** The fraction tool's Add, Subtract, Multiply and Divide: "What is 1/2 + 1/3?" with the answer in lowest terms (a mixed number
 *  past one whole) and wrong answers from the usual slips: adding tops and bottoms, keeping one bottom number, counting
 *  one piece too many or too few, the sign turned round, crossing over. A wrong answer is never worth the same as the
 *  right one (2/4 is not offered beside 1/2). */
function fractionOp(st, Q, seed) {
  const r = M.operate(st.mode, st.a || M.OP_START.a, st.b || M.OP_START.b);
  const key = { add: 'fractionsAdd', sub: 'fractionsSub', mul: 'fractionsMul', div: 'fractionsDiv' }[r.op];
  const { a, b } = r, f = (n, d) => (d > 0 ? { n, d } : null);
  const slips = {
    add: [f(a.n + b.n, a.d + b.d), f(a.n + b.n, Math.max(a.d, b.d)), f(r.raw.n + 1, r.L), f(r.raw.n - 1, r.L), f(a.n * b.n, a.d * b.d)],
    sub: [f(a.n - b.n, a.d - b.d), f(-r.raw.n, r.L), f(a.n - b.n, Math.max(a.d, b.d)), f(r.raw.n + 1, r.L), f(r.raw.n - 1, r.L)],
    mul: [f(a.n + b.n, a.d + b.d), f(a.n * b.n, Math.max(a.d, b.d)), f(a.n * b.d, a.d * b.n), f(r.raw.n + 1, r.raw.d), f(r.raw.n - 1, r.raw.d)],
    // Divide: forgetting to turn the second over (multiplying instead), turning the first over, dividing the tops only
    // over the first bottom, one piece too many. (Dividing straight across, (a.n ÷ b.n)/(a.d ÷ b.d), is always right.)
    div: [f(a.n * b.n, a.d * b.d), f(a.d * b.n, a.n * b.d), f(a.n, b.n * a.d), f(r.raw.n + r.raw.d, r.raw.d), f(r.raw.n + 1, r.raw.d)],
  }[r.op];
  const seen = [r.simple], wrong = [];
  for (const x of slips) { if (!x || x.n < 0 && r.op !== 'sub' || seen.some(y => M.compare(x, y) === 0)) continue; seen.push(x); wrong.push(M.mixedText(x)); }
  return choice(fill(Q[key], { a: `${a.n}/${a.d}`, b: `${b.n}/${b.d}` }), r.mixed, wrong, seed);
}

/** A bar model's question: its number sentence with "?" for the unknown, and wrong answers from the usual slips
 *  (adding instead of multiplying or subtracting, one off). */
function barQuestion(b, m) {
  const sum = a => a.reduce((x, y) => x + y, 0), ans = m.answer;
  if (m.kind === 'mul') {
    const t = b.g * b.e;
    if (m.unk === 0) return { s: `${b.g} × ${b.e} = ?`, wrong: [b.g + b.e, t + b.e, t - b.e, t + 1] };
    if (m.unk === 1) return { s: `? × ${b.e} = ${t}`, wrong: [t - b.e, t + b.e, ans + 1, ans - 1, b.e] };
    return { s: `${t} ÷ ${b.g} = ?`, wrong: [t - b.g, t + b.g, ans + 1, ans - 1, b.g] };
  }
  if (m.kind === 'part') {
    const whole = sum(b.p);
    if (m.unk === 0) return { s: `${b.p.join(' + ')} = ?`, wrong: [whole + 1, whole - 1, whole + 10, whole - 10] };
    const known = b.p.map((v, i) => (i === m.unk - 1 ? '?' : v)).join(' + ');
    return { s: `${known} = ${whole}`, wrong: [whole + (whole - ans), ans + 1, ans - 1, whole] };
  }
  const big = Math.max(b.ca, b.cb), small = Math.min(b.ca, b.cb), diff = big - small;
  if (m.unk === 0) return { s: `${big} − ${small} = ?`, wrong: [big + small, diff + 1, diff - 1, big] };
  const mine = m.unk === 1 ? b.ca : b.cb, theirs = m.unk === 1 ? b.cb : b.ca;
  return mine >= theirs ? { s: `${theirs} + ${diff} = ?`, wrong: [theirs - diff, ans + 1, ans - 1, diff] } : { s: `${theirs} − ${diff} = ?`, wrong: [theirs + diff, ans + 1, ans - 1, diff] };
}

/**
 * A question from a tool's state. type: the tool's id; st: its state; W: the tool's words; A: the question words
 * (dash.ask.*); intl: the reader's language. -> { q, options: [text], answer: index } or null.
 */
export function questionFor(type, st, W = {}, A = {}, intl = 'en') {
  // The answer hidden or shown (qh) never changes the question or the order of its answers.
  const seed = `${type}:${JSON.stringify({ ...st, qh: undefined })}`;
  const Q = A.q || {};
  const nf = n => new Intl.NumberFormat(intl).format(n);
  switch (type) {
    case 'fractions': {
      if (M.OPS[st.mode]) return fractionOp(st, Q, seed);
      const b = (st.bars || []).find(x => x.n > 0 && x.d > 1); if (!b) return null;
      return choice(Q.fractions, `${b.n}/${b.d}`, [`${b.d - b.n}/${b.d}`, `${b.d}/${b.n}`, `${b.n}/${b.d + 1}`, `${b.n + 1}/${b.d}`].filter(f => !/^0\//.test(f)), seed);
    }
    case 'numline': {
      const lab = t => M.tickLabel(t, st.sub, st.mode);
      if ((st.jumps || []).length) {
        const end = st.jumps[st.jumps.length - 1].b;
        return choice(Q.numline, lab(end), near(end, [1, -1, st.sub, -st.sub, 2], () => true).map(lab), seed);
      }
      if ((st.points || []).length) { const p = st.points[0]; return choice(Q.numlinePt, lab(p), near(p, [1, -1, st.sub, 2], () => true).map(lab), seed); }
      return null;
    }
    case 'coord': {
      if (!st.line) return null;
      const i = st.mi, m = M.SLOPES[i]; if (!m) return null;
      const others = [i + 1, i - 1, i + 2, M.SLOPES.length - 1 - i].filter(k => k >= 0 && k < M.SLOPES.length && k !== i).map(k => M.fracText(M.SLOPES[k]));
      if (m.n) others.unshift(M.fracText({ n: m.d, d: m.n }));
      return choice(Q.coord, M.fracText(m), others, seed);
    }
    case 'graph': {
      const rows = (st.rows || []).map((r, i) => ({ l: r.l || String.fromCharCode(65 + i), v: r.v }));
      if (rows.length < 2) return null;
      const max = Math.max(...rows.map(r => r.v)), top = rows.filter(r => r.v === max);
      if (top.length !== 1 || !max) return null;
      return choice(Q.graph, top[0].l, rows.filter(r => r !== top[0]).sort((a, b) => b.v - a.v).map(r => r.l), seed);
    }
    case 'base10': {
      const v = M.blocksValue(st); if (!v) return null;
      return choice(Q.base10, nf(v), near(v, [10, -10, 100, -100, 1, -1]).map(nf).concat(st.h ? [nf(st.h + st.t + st.o)] : []), seed);
    }
    case 'placeval': {
      const v = st.v; if (!v) return null;
      return choice(Q.placeval, M.pvFormat(v, intl), [M.pvTimes10(v), M.pvDiv10(v), M.pvAdd(v, 3, 1), M.pvAdd(v, 2, -1)].filter(x => x !== null && x !== v).map(x => M.pvFormat(x, intl)), seed);
    }
    case 'tenframe': {
      const n = (st.cells || []).filter(Boolean).length; if (!n) return null;
      return choice(Q.tenframe, nf(n), near(n, [1, -1, 2, -2]).map(nf), seed);
    }
    case 'hundreds': {
      if (st.skip > 1) {
        const list = M.skipCount(st.skip, st.start, st.start && st.upto === 120 ? 120 : 100); if (list.length < 4) return null;
        const a = list[2], next = list[3];
        return choice(fill(Q.hundreds, { n: st.skip, a }), nf(next), [next + 1, next - 1, a + 1, next + st.skip, a + 10].map(nf), seed);
      }
      const n = (st.shade || []).length; if (!n) return null;
      return choice(Q.hundredsShade, nf(n), near(n, [1, -1, 10, -10, 2]).filter(x => x > 0).map(nf), seed);
    }
    case 'area': case 'times': {
      const a = type === 'area' ? st.a : st.r, b = type === 'area' ? st.b : st.c;
      if (!a || !b) return null;
      const p = a * b;
      return choice(fill(Q.times, { a, b }), nf(p), [p + a, p - b, (a + 1) * b, a + b, p + 10].filter(x => x > 0).map(nf), seed);
    }
    case 'tclock': {
      const f = new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit', hour12: !st.h24, timeZone: 'UTC' });
      const tt = m => f.format(new Date(Date.UTC(2020, 0, 1, 0, M.wrapMin(m))));
      const p = M.clockParts(st.t);
      // A swapped reading (the hands read the wrong way round) where it makes a real time.
      const swapped = p.m % 5 === 0 && p.m ? ((p.m / 5) % 12 || 12) * 60 + (p.h % 12) * 5 + (p.pm ? 720 : 0) : null;
      return choice(Q.tclock, tt(st.t), [swapped, st.t + 60, st.t - 60, st.t + 5, st.t + 30].filter(x => x !== null).map(tt), seed);
    }
    case 'fdp': {
      if (!st.n) return null;
      const dec = (n, d) => M.decimalString(n, d);
      return choice(fill(Q.fdp, { f: `${st.n}/${st.d}` }), dec(st.n, st.d), [st.d <= 100 ? dec(st.n, st.d * 10) : '', dec(st.n + 1, st.d), st.n < st.d ? dec(st.n, st.d + 1) : '', dec(st.n * 10, st.d)].filter(Boolean), seed);
    }
    case 'geoboard': {
      // The selected band if it is a closed shape, else the first one that is. Wrong answers are the usual slips: the
      // perimeter instead of the area, counting the pegs instead of the squares, one square too many or too few.
      const board = st.board || 'square', n = board === 'circle' ? st.ring || 12 : st.pegs || 7, bands = st.bands || [];
      if (board === 'circle') return null;
      const ok = x => x && x.closed && M4.simpleOn(board, n, x.pts || []);
      const b = ok(bands[st.cur]) ? bands[st.cur] : bands.find(ok); if (!b) return null;
      const A = M4.shapeArea(board, n, b.pts), per = M4.lengthText(M4.bandLengthOn(board, n, b.pts, true));
      if (A.kind === 'tri') return choice(Q.geoboardTri || Q.geoboard, String(A.t), [String(A.I + A.B), per, String(A.t + 2), String(Math.max(1, A.t - 2)), String(A.B)], seed);
      const area = M4.mixed(A.a2, 2);
      return choice(Q.geoboard, area, [per, String(A.I + A.B), M4.mixed(A.a2 + 2, 2), M4.mixed(Math.max(1, A.a2 - 2), 2), M4.mixed(A.a2 + 1, 2)], seed);
    }
    case 'pattern': {
      const h = M4.hexFraction(st.blocks || []); if (!h.sixths) return null;
      return choice(Q.pattern, M4.mixed(h.sixths, 6), [M4.mixed(h.sixths + 1, 6), M4.mixed(Math.max(1, h.sixths - 1), 6), String((st.blocks || []).length), M4.mixed(h.sixths, 3)], seed);
    }
    case 'angle': {
      const k = M4.angleKind(st.a);
      const names = ['acute', 'right', 'obtuse', 'straight', 'reflex'];
      return choice(Q.angle, W[k] || k, names.filter(x => x !== k).map(x => W[x] || x), seed);
    }
    case 'solids': {
      const s = M4.SOLIDS[st.shape]; if (!s) return null;
      const [key, n] = s.curved ? ['solidsF', s.f] : ['solidsE', s.e];
      return choice(Q[key], nf(n), near(n, [1, -1, 2, -2, 4]).map(nf), seed);
    }
    case 'transform': {
      const pts = (M4.SHAPES[st.shape] || []).map(([x, y]) => [x + st.ox, y + st.oy]); if (!pts.length) return null;
      const A0 = pts[0], t = { op: st.op, dx: st.dx, dy: st.dy, axis: st.axis, turn: st.turn };
      const wrong = [{ op: 'translate', dx: st.dy, dy: st.dx }, { op: 'reflect', axis: st.axis === 'x' ? 'y' : 'x' }, { op: 'rotate', turn: st.turn === 90 ? 270 : 90 }, { op: 'translate', dx: -st.dx, dy: -st.dy }, { op: 'reflect', axis: 'yx' }];
      return choice(fill(Q.transform, { p: M4.pointText(A0) }), M4.pointText(M4.transformPoint(A0, t)), wrong.map(w => M4.pointText(M4.transformPoint(A0, w))), seed);
    }
    case 'balance': {
      // Negative tiles (−x, −1) weigh against their twins (docs/decisions.md "the balance scale by drag and drop").
      const L = { x: st.lx, u: st.lu, nx: st.lnx || 0, nu: st.lnu || 0 }, R = { x: st.rx, u: st.ru, nx: st.rnx || 0, nu: st.rnu || 0 };
      if (M4.tip(L, R, st.x) || L.x - L.nx === R.x - R.nx) return null;
      return choice(Q.balance, nf(st.x), near(st.x, [1, -1, 2]).filter(x => x > 0).concat([Math.abs(L.u - L.nu - R.u + R.nu)]).map(nf), seed);
    }
    case 'algebra': {
      const tiles = st.tiles || []; if (!tiles.length) return null;
      const s = M4.simplifyTiles(tiles), c = M4.tileCounts(tiles);
      const right = M4.polyText(s);
      if (right === M4.rawText(tiles)) return null;
      const wrong = [{ a: c.x2.p + c.x2.n, b: c.x.p + c.x.n, c: c['1'].p + c['1'].n }, { ...s, b: -s.b }, { ...s, c: -s.c }, { a: s.b, b: s.a, c: s.c }, { ...s, a: s.a + 1 }].map(M4.polyText);
      return choice(Q.algebra, right, wrong, seed);
    }
    case 'coins': {
      const cur = st.cur === 'auto' ? M4.currencyFor(intl) : st.cur, ds = M4.denoms(cur), money = v => M4.moneyText(cur, v, intl);
      if (st.mode === 'change') {
        if (st.paid < st.cost || st.paid === st.cost) return null;
        const ch = st.paid - st.cost;
        return choice(Q.coinsChange, money(ch), [st.cost, ch + 10, Math.max(1, ch - 10), ch + 1].map(money), seed);
      }
      const total = M4.moneyTotal(cur, st.counts || []); if (!total) return null;
      const used = ds.filter((d, i) => (st.counts || [])[i]).map(d => d.v);
      return choice(Q.coins, money(total), [total + (used[0] || 1), total - (used[0] || 1), total + 10, (st.counts || []).reduce((a, b) => a + b, 0)].filter(x => x > 0).map(money), seed);
    }
    case 'chance': {
      const outs = M4.outcomes(st.kind, st.dice, st.parts);
      const o = st.kind === 'dice' && st.dice === 2 ? outs[5] : outs[0];
      const label = st.kind === 'coin' ? W.heads : o.o;
      const f = M.simplify(o.p.n, o.p.d), ft = `${f.n}/${f.d}`;
      const pool = ['1/2', '1/3', '1/4', '1/6', '1/12', '1/36', '5/36', `1/${outs.length}`, `${f.d}/${f.n}`].filter(x => x !== ft && x !== '1/1');
      return choice(fill(Q.chance, { o: label }), ft, pool, seed);
    }
    case 'letters': {
      const word = M4.FAMILIES[st.fam] ? (st.word || []).map(i => M4.ALPHABET[i]).join('') + st.fam : (st.word || []).map(i => M4.ALPHABET[i]).join('');
      if (!word) return null;
      const n = M4.letterCounts(word).vowels;
      return choice(fill(Q.letters, { w: sliceText(st.caps ? word.toUpperCase() : word, 14) }), nf(n), near(n, [1, -1, 2, 3]).map(nf), seed);
    }
    case 'map': {
      const pins = st.pins || []; if (!pins.length) return null;
      if (st.kind === 'grid') { const p = pins[0], r = M4.gridRef(p.x, p.y); return choice(Q.mapGrid, r, [M4.gridRef(p.x + 100, p.y), M4.gridRef(p.x, p.y + 100), M4.gridRef(p.x - 100, p.y), M4.gridRef(p.y * 2, p.x / 2)], seed); }
      for (const p of pins) {
        const c = M4.continentAt(p.x, p.y); if (!c) continue;
        return choice(Q.map, W[c] || c, M4.CONTINENT_IDS.filter(x => x !== c && x !== 'antarctica').map(x => W[x] || x), `${seed}:${c}`);
      }
      return null;
    }
    // Bar models and number rods (docs/decisions.md "Bar models and number rods").
    case 'bars': {
      const b = M5.clampBars(st), m = M5.barModel(b), r = barQuestion(b, m);
      return choice(fill(Q.bars, { s: r.s }), m.answer, r.wrong.filter(x => x >= 0 && x !== m.answer), seed);
    }
    case 'rods': {
      const e = { l: st.l || [], r: st.r || [] };
      if (!st.eq || !M5.eqValid(e)) return null;
      const ans = M5.missingOf(e), sum = a => a.reduce((x, y) => x + y, 0), other = e.l.includes(0) ? e.r : e.l;
      return choice(fill(Q.rods, { e: M5.eqText(e) }), ans, [sum(other), ans + 1, ans - 1, sum([...e.l, ...e.r]), ans + 2].filter(x => x > 0 && x !== ans), seed);
    }
    default: return null;
  }
}
