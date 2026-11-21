// Oomba Figures: math labels. A small typesetter that writes a label as plain SVG (runs of text, fraction bars, root
// signs), so a shape's labels read as math on screen, in print and in an exported file, with nothing measured at draw
// time and no math library. A label is data, never typed math to parse (docs/figures-api.md "Math labels"):
//   a number           written in the reader's numbers (decimal mark, Latin digits) with a true minus sign
//   a string           letters italic (Latin and Greek, not π), digits and signs upright; - is a true minus, ' a prime
//                      (A' -> A′); + − × ÷ ± = < > ≤ ≥ ≠ get their spaces; the string is otherwise written as it is
//   a list of pieces   written one after another: ["x", { sup: 2 }], [3, { sqrt: 5 }]
//   { frac: [top, bottom] }  a stacked fraction (slash: true writes top/bottom on the line)
//   { sqrt: x, times?: k }   k√x          { pi: k }  kπ          { sup: x }, { sub: x }  raised or lowered, after
//   { text: "words" }        upright words (no italics)           each part is itself a label
// Widths are the serif font's own glyph widths in em (measured in Chromium on Liberation Serif, the metric twin of
// Times New Roman), so a label's box is known before it is drawn and labels can be placed clear of lines.
import { node, fmt, r2 } from './svg.js';

export const MATH_FONT = '"Times New Roman", Times, "Liberation Serif", serif';
const MT_ASC = 0.68;     // how tall digits and capitals stand, in em
const MT_DESC = 0.22;    // how far below the baseline a label reaches
const MT_AXIS = 0.25;    // the math axis (fraction bars, the middle of a minus sign), above the baseline
const MT_REL = '=<>≤≥≠';
const MT_BIN = '+−×÷±·';
const MT_MAX_PIECES = 24;
const MT_MAX_TEXT = 30;
const mtTable = groups => { const t = {}; for (const [w, cs] of groups) for (const c of cs) t[c] = w; return t; };
const MT_UPRIGHT = mtTable([[0.5, '0123456789bdghknopquvxyπ'], [0.25, '., '], [0.4, '°'], [0.22, '′'], [0.42, '″'], [0.18, "'"],
  [0.33, '()[]fr!I·'], [0.56, '+−=<>×FPS'], [0.55, '≤≥≠÷±'], [0.83, '%'], [0.44, '?acezγ'], [0.28, ':/ijlt'], [0.39, 'sJ'],
  [0.78, 'm'], [0.72, 'wADGHKNOQUVXY'], [0.67, 'BCR'], [0.61, 'ELTZ'], [0.89, 'M'], [0.94, 'W'], [0.48, 'θλ'], [0.52, 'α'],
  [0.51, 'β'], [0.47, 'δ'], [0.54, 'μσ'], [0.58, 'φ'], [0.66, 'ω']]);
const MT_ITALIC = mtTable([[0.5, 'abdghnopquSβμ'], [0.44, 'cekvxyJ'], [0.28, 'fijlt'], [0.72, 'mDGHOQU'], [0.39, 'rszγ'],
  [0.67, 'wCKN'], [0.61, 'ABEFPRVX'], [0.33, 'I'], [0.56, 'LTYZ'], [0.83, 'MW'], [0.49, 'θσ'], [0.52, 'α'], [0.46, 'δ'],
  [0.43, 'λ'], [0.55, 'φ'], [0.71, 'ω']]);
const mtWide = c => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(c);
const mtWidth = (c, italic) => (italic ? MT_ITALIC[c] : MT_UPRIGHT[c]) ?? (mtWide(c) ? 1 : 0.55);
/** Is this character a variable's letter (italic in math)? Latin and Greek letters, not π. */
const mtIsLetter = c => /^[A-Za-zα-ωΑ-Ω]$/.test(c) && c !== 'π';

const mtEmpty = () => ({ w: 0, asc: 0, desc: 0, items: [] });
function mtShift(it, dx, dy) {
  if (it.t === 'text') return { ...it, x: it.x + dx, y: it.y + dy };
  if (it.t === 'line') return { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy };
  return { ...it, pts: it.pts.map(([x, y]) => [x + dx, y + dy]) };
}
/** Put part (laid out from its own origin) at the end of box, gap after it, raised by rise. */
function mtAppend(box, part, rise = 0, gap = 0) {
  const x = box.w + gap;
  for (const it of part.items) box.items.push(mtShift(it, x, -rise));
  box.w = x + part.w;
  box.asc = Math.max(box.asc, part.asc + rise);
  box.desc = Math.max(box.desc, part.desc - rise);
}
/** A run of text in one style. */
function mtRun(chars, size, italic) {
  const w = [...chars].reduce((t, c) => t + mtWidth(c, italic), 0) * size;
  return { w, asc: MT_ASC * size, desc: MT_DESC * size, items: [{ t: 'text', x: 0, y: 0, s: chars, size, italic }] };
}
const mtNum = (v, lang) => fmt(v, 6, lang).replace(/[-‐‑]/g, '−');

/** A string: letters italic, the rest upright, operators spaced. st.prev ('op' | 'item' | null) carries across pieces. */
function mtString(s, size, st, upright) {
  const box = mtEmpty();
  let run = null;
  const flush = () => { if (run) { mtAppend(box, mtRun(run.chars, size, run.italic)); run = null; } };
  const add = (c, italic) => { if (run && run.italic !== italic) flush(); run = run || { chars: '', italic }; run.chars += c; };
  const chars = [...String(s).replace(/-/g, '−').replace(/''/g, '″').replace(/'/g, '′')];
  chars.forEach((c, i) => {
    if (c === ' ') {
      const next = chars.slice(i + 1).find(x => x !== ' ');
      if (!next || st.prev !== 'item' || MT_REL.includes(next) || MT_BIN.includes(next) || (run && run.chars.endsWith(' '))) return;
      add(' ', false);
      return;
    }
    const rel = !upright && MT_REL.includes(c), bin = !upright && MT_BIN.includes(c) && st.prev === 'item';
    if (rel || bin) {
      if (run) run.chars = run.chars.replace(/ +$/, '');
      flush();
      const g = (rel ? 0.28 : 0.2) * size;
      mtAppend(box, mtRun(c, size, false), 0, g);
      box.w += g;
      st.prev = 'op';
      return;
    }
    add(c, !upright && mtIsLetter(c));
    st.prev = MT_BIN.includes(c) || c === '(' ? 'op' : 'item';
  });
  flush();
  return box;
}
/** A stacked fraction: top over bottom, smaller, a bar on the math axis. */
function mtFrac(top, bottom, size, o) {
  const small = Math.max(size * 0.78, 10), num = mtLabel(top, small, o), den = mtLabel(bottom, small, o);
  const pad = 0.1 * size, w = Math.max(num.w, den.w) + 2 * pad, gap = 0.12 * size, bar = -MT_AXIS * size;
  const numBase = bar - gap - num.desc, denBase = bar + gap + den.asc;
  const box = { w, asc: -(numBase - num.asc), desc: denBase + den.desc, items: [] };
  for (const it of num.items) box.items.push(mtShift(it, (w - num.w) / 2, numBase));
  for (const it of den.items) box.items.push(mtShift(it, (w - den.w) / 2, denBase));
  box.items.push({ t: 'line', x1: 0, y1: bar, x2: w, y2: bar, width: Math.max(1, 0.06 * size) });
  return box;
}
/** A root sign over a part: a short rise, the long stroke down, up to the top and along over the part. */
function mtRoot(inner, size) {
  const top = -(Math.max(inner.asc, MT_ASC * size) + 0.1 * size), bottom = Math.max(inner.desc, 0.06 * size);
  const x0 = 0.03 * size, hook = 0.48 * size, start = x0 + hook + 0.07 * size, end = start + inner.w + 0.06 * size;
  const box = { w: end + 0.03 * size, asc: -top + 0.05 * size, desc: bottom, items: [] };
  box.items.push({ t: 'path', pts: [[x0, -0.3 * size], [x0 + 0.11 * size, -0.35 * size], [x0 + 0.27 * size, bottom], [x0 + hook, top], [end, top]], width: Math.max(1, 0.055 * size) });
  for (const it of inner.items) box.items.push(mtShift(it, start, 0));
  return box;
}
const mtIsObj = p => p && typeof p === 'object' && !Array.isArray(p);
/** One piece, laid out from its own origin. */
function mtPiece(p, size, st, o) {
  if (typeof p === 'number') { st.prev = 'item'; return mtRun(mtNum(p, o.lang), size, false); }
  if (typeof p === 'string') return mtString(p, size, st, false);
  if (Array.isArray(p)) { st.prev = 'item'; return mtLabel(p, size, o); }
  const box = mtEmpty();
  if ('frac' in p) {
    const [a, b] = p.frac;
    if (p.slash) { mtAppend(box, mtLabel(a, size, o)); mtAppend(box, mtRun('/', size, false), 0, 0.03 * size); mtAppend(box, mtLabel(b, size, o), 0, 0.03 * size); }
    else { mtAppend(box, mtFrac(a, b, size, o), 0, 0.05 * size); box.w += 0.05 * size; }
  } else if ('sqrt' in p) {
    if (p.times !== undefined) mtAppend(box, mtLabel(p.times, size, o));
    mtAppend(box, mtRoot(mtLabel(p.sqrt, size, o), size), 0, box.w ? 0.03 * size : 0);
  } else if ('pi' in p) {
    if (p.pi === -1) mtAppend(box, mtRun('−', size, false));
    else if (p.pi !== 1) mtAppend(box, mtLabel(p.pi, size, o));
    mtAppend(box, mtRun('π', size, false));
  } else if ('text' in p) mtAppend(box, mtString(p.text, size, { prev: null }, true));
  st.prev = 'item';
  return box;
}
/** A whole label (any form) as a box. */
function mtLabel(label, size, o) {
  const list = Array.isArray(label) ? label : [label], box = mtEmpty(), st = { prev: null };
  for (const p of list) {
    if (mtIsObj(p) && ('sup' in p || 'sub' in p)) {
      const small = Math.max(size * 0.7, 9), part = mtLabel('sup' in p ? p.sup : p.sub, small, o);
      mtAppend(box, part, 'sup' in p ? 0.4 * size : -0.2 * size, 0.04 * size);
      st.prev = 'item';
      continue;
    }
    mtAppend(box, mtPiece(p, size, st, o), 0, box.w && !(typeof p === 'string') ? 0.02 * size : 0);
  }
  box.asc = Math.max(box.asc, MT_ASC * size);
  box.desc = Math.max(box.desc, MT_DESC * size);
  return box;
}

/**
 * A label laid out at a font size -> { w, asc, desc, items } (x from its left end, y down from its baseline), or null
 * when there is nothing to write. o: { lang (the reader's numbers), suffix (upright text after it: "°", " cm") }.
 */
export function mathBox(label, size, o = {}) {
  const empty = label === null || label === undefined || label === '' || (Array.isArray(label) && !label.length);
  if (empty && !o.suffix) return null;
  const box = empty ? mtEmpty() : mtLabel(label, size, o);
  if (o.suffix) mtAppend(box, mtRun(o.suffix.replace(/^ /, ''), size, false), 0, o.suffix.startsWith(' ') ? 0.25 * size : 0.02 * size);
  return box;
}
/** A laid-out label as SVG nodes, its left end at x on the baseline y. o: { color, halo (the paper, behind text) }. */
export function mathNode(box, x, y, o = {}) {
  const c = o.color || '#141414';
  return node('g', { class: o.cls || 'of-math' }, box.items.map(it => {
    if (it.t === 'text') {
      return node('text', { x: r2(x + it.x), y: r2(y + it.y), 'font-size': r2(it.size), 'font-family': MATH_FONT, 'font-style': it.italic ? 'italic' : null, fill: c,
        ...(o.halo ? { stroke: o.halo, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {}) }, it.s);
    }
    if (it.t === 'line') return node('line', { x1: r2(x + it.x1), y1: r2(y + it.y1), x2: r2(x + it.x2), y2: r2(y + it.y2), stroke: c, 'stroke-width': r2(it.width) });
    return node('polyline', { points: it.pts.map(([px, py]) => `${r2(x + px)},${r2(y + py)}`).join(' '), fill: 'none', stroke: c, 'stroke-width': r2(it.width), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  }));
}
/** A label as plain text, for a screen reader or a message: "3√5", "5/2", "x + 3", "A′". */
export function mathText(label, lang = 'en') {
  const one = p => {
    if (typeof p === 'number') return mtNum(p, lang);
    if (typeof p === 'string') return p.replace(/-/g, '−').replace(/''/g, '″').replace(/'/g, '′');
    if (Array.isArray(p)) return p.map(one).join('');
    if (!mtIsObj(p)) return '';
    if ('frac' in p) return `${one(p.frac[0])}/${one(p.frac[1])}`;
    if ('sqrt' in p) return `${p.times !== undefined ? one(p.times) : ''}√${Array.isArray(p.sqrt) || mtIsObj(p.sqrt) ? `(${one(p.sqrt)})` : one(p.sqrt)}`;
    if ('pi' in p) return `${p.pi === 1 ? '' : p.pi === -1 ? '−' : one(p.pi)}π`;
    if ('sup' in p) return `^${one(p.sup)}`;
    if ('sub' in p) return `_${one(p.sub)}`;
    if ('text' in p) return String(p.text);
    return '';
  };
  return one(label);
}
const MT_KEYS = { frac: ['frac', 'slash'], sqrt: ['sqrt', 'times'], pi: ['pi'], sup: ['sup'], sub: ['sub'], text: ['text'] };
/** What is wrong with a label, in plain English (null when it can be written). */
export function mathProblem(label, at = 'the label') {
  let count = 0;
  const bad = (p, depth) => {
    if (++count > MT_MAX_PIECES) return `${at} is too long (${MT_MAX_PIECES} pieces at most)`;
    if (depth > 4) return `${at} is nested too deeply`;
    if (typeof p === 'number') return Number.isFinite(p) && Math.abs(p) < 1e9 ? null : `${at}: numbers must be finite`;
    if (typeof p === 'string') return p.length > MT_MAX_TEXT ? `${at}: a string of ${MT_MAX_TEXT} characters at most` : /[\u0000-\u001f<>]/.test(p) ? `${at}: no control characters, < or >` : null;
    if (Array.isArray(p)) {
      if (p.length === 2 && p.every(x => typeof x === 'number')) return `${at}: a list of pieces is written one after another, so [${p.join(', ')}] would read ${p.join('')}; write a fraction as { "frac": [${p.join(', ')}] }`;
      for (const x of p) { const why = bad(x, depth + 1); if (why) return why; }
      return null;
    }
    if (!mtIsObj(p)) return `${at} must be a number, a string, a list of pieces, or { frac }, { sqrt }, { pi }, { sup }, { sub }, { text }`;
    const key = Object.keys(MT_KEYS).find(k => k in p);
    if (!key) return `${at}: a piece is { frac: [top, bottom] }, { sqrt: x, times: k }, { pi: k }, { sup: x }, { sub: x } or { text: "words" }`;
    const extra = Object.keys(p).filter(k => !MT_KEYS[key].includes(k));
    if (extra.length) return `${at}: { ${key} } does not take "${extra[0]}"`;
    if (key === 'frac') return Array.isArray(p.frac) && p.frac.length === 2 ? bad(p.frac[0], depth + 1) || bad(p.frac[1], depth + 1) : `${at}: "frac" is [top, bottom]`;
    if (key === 'text') return typeof p.text === 'string' ? bad(p.text, depth + 1) : `${at}: "text" is a string`;
    if (key === 'sqrt') return bad(p.sqrt, depth + 1) || (p.times !== undefined ? bad(p.times, depth + 1) : null);
    return bad(p[key], depth + 1);
  };
  return bad(label, 0);
}
/**
 * The number a label states, or null when it states none (it has a letter, or is not a value): 12, "12", 2.5,
 * { frac: [5, 2] }, { sqrt: 5, times: 3 }, [3, { sqrt: 5 }], { pi: 2 }. A figure drawn to scale must agree with it.
 */
export function mathValue(label) {
  const v = p => {
    if (typeof p === 'number') return Number.isFinite(p) ? p : null;
    if (typeof p === 'string') return /^\s*[-−]?\d+(\.\d+)?\s*$/.test(p) ? Number(p.replace('−', '-')) : null;
    if (Array.isArray(p)) {
      if (p.length === 1) return v(p[0]);
      if (p.length === 2 && mtIsObj(p[1]) && (('sqrt' in p[1] && p[1].times === undefined) || ('pi' in p[1] && p[1].pi === 1))) { const a = v(p[0]), b = v(p[1]); return a === null || b === null ? null : a * b; }
      return null;
    }
    if (!mtIsObj(p)) return null;
    if ('frac' in p) { const a = Array.isArray(p.frac) ? v(p.frac[0]) : null, b = Array.isArray(p.frac) ? v(p.frac[1]) : null; return a === null || b === null || b === 0 ? null : a / b; }
    if ('sqrt' in p) { const a = v(p.sqrt), k = p.times === undefined ? 1 : v(p.times); return a === null || k === null || a < 0 ? null : k * Math.sqrt(a); }
    if ('pi' in p) { const k = v(p.pi); return k === null ? null : k * Math.PI; }
    return null;
  };
  return v(label);
}
