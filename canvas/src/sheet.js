// Oomba Canvas 1.2.0: the printable worksheet, as data. sheet(activity, { seed, n, lang }) deals the same set the kit
// deals for that seed (deal(), N questions) and writes each question, its picture, its answer and its worked answer in
// the reader's language as plain pieces: strings and { frac: [n, d] } (a stacked fraction). Pure: the server's printer
// (server/services/canvas-print.js) runs it from the kit's own frozen file and turns the pieces into the printable page,
// and the self-test checks that a sheet of N questions has N answers. No HTML here, so nothing in the data can become
// markup: the printer escapes every string.
import { TOOLS, deal, MAX_PROBLEMS, numText, ratOf } from './logic.js';
import { WORDS, wordsFor } from './words.js';

/** A line ({ k, v } in the words table, or { text }) -> pieces. */
export function pieces(x, W) {
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
export function answerOf(p, W) {
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
export function workOf(p, W) {
  if (Array.isArray(p.work)) return p.work.map(t => [t]);
  return TOOLS[p.tool].steps(p).filter(s => s.k !== 'pressCheck').map(s => [...pieces(s, W), ...(s.ans !== undefined ? [` ${s.ans}`] : [])]);
}
/** What the printed question draws besides its words: the figure's data, or a plain picture of the manipulative. */
export function pictureOf(p) {
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
export function sheet(activity, { seed = 1, n = null, lang = 'en' } = {}) {
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
