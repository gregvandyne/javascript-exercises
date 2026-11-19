/*! Oomba Figures 1.0.0 | (c) Oomba Academy | MIT | science, maths and graph figures as SVG: docs/figures-api.md */
(function () {
'use strict';
// ---- canvas/src/expr.js
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

// ---- figures/src/svg.js
// Oomba Figures: the drawing core. Every figure is built as a small tree of SVG nodes ({ tag, attrs, kids }) by a pure
// function, then turned into text (svgText: the server's printable worksheets, the unit tests) or into a real SVG
// element (toElement: in the browser). No DOM, no network, no clock in here.
const FIG_VERSION = '1.0.0';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The Oomba colours (the site's tokens, darkened where a thin line needs contrast on the cream paper). Print: black on
 *  white with greys, so a sheet prints on any printer. */
const COLOURS = Object.freeze({
  paper: '#FFFDF2', ink: '#141414', ink2: '#3B3A35', muted: '#5B584F', grid: '#E2DDCB', gridStrong: '#C9C2A9', soft: '#F4F1E6',
  green: '#1F9D63', greenInk: '#0F5A37', blue: '#2A78B0', red: '#B0372B', gold: '#9A6B00', purple: '#6E4BB0', liquid: '#5AA9D6', fill: '#E1F1E1', spark: '#FFD23F',
});
const PRINT_COLOURS = Object.freeze({
  paper: '#FFFFFF', ink: '#000000', ink2: '#000000', muted: '#333333', grid: '#CCCCCC', gridStrong: '#999999', soft: '#F2F2F2',
  green: '#000000', greenInk: '#000000', blue: '#000000', red: '#000000', gold: '#000000', purple: '#000000', liquid: '#BBBBBB', fill: '#EEEEEE', spark: '#DDDDDD',
});
const palette = o => (o && o.print ? PRINT_COLOURS : COLOURS);
/** The colour of the k-th thing in a figure (forces, vectors, branches): green, blue, red, gold, purple, then round again. */
const seriesColour = (o, k) => { const p = palette(o); return [p.green, p.blue, p.red, p.gold, p.purple][((k % 5) + 5) % 5]; };

/** One node. Attributes with null / undefined / false are left out. Kids: nodes, strings (text) or nested lists. */
const node = (tag, attrs = {}, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false && k !== '') });
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escText = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
const num = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

/** A node tree -> SVG text. */
function svgText(n) {
  if (typeof n === 'string') return escText(n);
  const a = Object.entries(n.attrs).filter(([, v]) => v !== null && v !== undefined && v !== false).map(([k, v]) => ` ${k}="${escText(num(v))}"`).join('');
  return n.kids.length ? `<${n.tag}${a}>${n.kids.map(svgText).join('')}</${n.tag}>` : `<${n.tag}${a}/>`;
}
/** A node tree -> a real SVG element (browser). */
function toElement(n, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) throw new Error('Oomba Figures: there is no document here; use OombaFigures.svg() for the SVG text');
  if (typeof n === 'string') return doc.createTextNode(n);
  const el = doc.createElementNS(SVG_NS, n.tag);
  for (const [k, v] of Object.entries(n.attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, num(v));
  for (const k of n.kids) el.appendChild(toElement(k, doc));
  return el;
}

// ---------------------------------------------------------------- numbers and words
/** A number for a label: at most dp decimals, no trailing zeros, the reader's digits and decimal mark (Latin digits for
 *  Arabic, as the site writes them). */
function fmt(x, dp = 2, lang = 'en') {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x);
  const k = 10 ** dp, r = Math.round(x * k) / k;
  try { return new Intl.NumberFormat(/^ar\b/.test(lang) ? 'ar-u-nu-latn' : lang || 'en', { maximumFractionDigits: dp, useGrouping: false }).format(r === 0 ? 0 : r); } catch (e) { return String(r); }
}
const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** A text label. Right-to-left words (Hebrew, Arabic) read right to left where they sit: the anchor is swapped so the
 *  label stays on the same side of its point. The figure itself never mirrors (forces, rays and axes are physics). */
function label(x, y, text, o = {}) {
  const s = String(text ?? ''); if (!s) return null;
  const rtl = RTL_CHARS.test(s);
  let anchor = o.anchor || 'start';
  if (rtl && anchor !== 'middle') anchor = anchor === 'start' ? 'end' : 'start';
  return node('text', {
    x, y, 'text-anchor': anchor, 'dominant-baseline': o.baseline || 'middle', 'font-size': o.size || 14, 'font-weight': o.weight || 700,
    fill: o.colour || o.color || '#141414', ...(rtl ? { direction: 'rtl', 'unicode-bidi': 'embed' } : {}), ...(o.italic ? { 'font-style': 'italic' } : {}), ...(o.cls ? { class: o.cls } : {}),
    ...(o.halo ? { stroke: o.halo, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {}),
  }, s);
}
/** A label with a subscript part ("F" + "N" -> F with a small N below): text and tspan nodes. */
function subLabel(x, y, main, sub, o = {}) {
  if (!sub) return label(x, y, `${main}${o.after || ''}`, o);
  const n = label(x, y, '', o) || node('text', { x, y, 'text-anchor': o.anchor || 'start', 'dominant-baseline': 'middle', 'font-size': o.size || 14, 'font-weight': o.weight || 700, fill: o.colour || '#141414' });
  n.kids = [String(main), node('tspan', { 'baseline-shift': 'sub', 'font-size': Math.round((o.size || 14) * 0.72) }, String(sub)), o.after ? String(o.after) : ''].filter(Boolean);
  return n;
}

// ---------------------------------------------------------------- shapes
/** An arrow from (x1, y1) to (x2, y2): a line and a filled head (the head ends exactly at the tip). */
function arrow(x1, y1, x2, y2, o = {}) {
  const w = o.width || 3, head = o.head || Math.max(10, w * 3.6), len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return null;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, hl = Math.min(head, len * 0.6), hw = hl * 0.55;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  const c = o.colour || o.color || '#141414';
  return node('g', { class: o.cls || null },
    node('line', { x1, y1, x2: bx + ux * 0.5, y2: by + uy * 0.5, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', ...(o.dash ? { 'stroke-dasharray': o.dash } : {}) }),
    node('polygon', { points: `${r2(x2)},${r2(y2)} ${r2(bx - uy * hw)},${r2(by + ux * hw)} ${r2(bx + uy * hw)},${r2(by - ux * hw)}`, fill: c }));
}
const r2 = v => Math.round(v * 100) / 100;
const line = (x1, y1, x2, y2, c, w = 2, extra = {}) => node('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', ...extra });
const path = (d, extra = {}) => node('path', { d, fill: 'none', ...extra });
const poly = (pts, extra = {}) => node('polyline', { points: pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' '), fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });

/**
 * The figure's own <svg>: a viewBox of w x h, its accessible name (role img, <title>), the paper background, and the
 * kids. The figure is always laid out left to right (dir ltr): physics and graphs never mirror; labels handle their own
 * direction (label()).
 */
function frame(w, h, kids, o = {}, name = '') {
  const p = palette(o), title = String(o.title || name || 'Figure').slice(0, 200);
  return node('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${r2(w)} ${r2(h)}`, width: r2(o.width || w), height: r2(((o.width || w) * h) / w), role: 'img', 'aria-label': title,
    class: `of-fig of-${o.kind || 'figure'}${o.print ? ' of-print' : ''}`, direction: 'ltr', 'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Hebrew", "Noto Sans Arabic", Arial, sans-serif',
    style: 'max-width:100%;height:auto', 'data-of': o.kind || null,
  }, node('title', {}, title), o.bare ? null : node('rect', { x: 0, y: 0, width: w, height: h, rx: o.print ? 0 : 12, fill: p.paper }), kids);
}
/** A light square grid over a box (graph paper). */
function gridLines(x0, y0, w, h, step, c, sw = 1) {
  const out = [];
  for (let x = x0; x <= x0 + w + 0.01; x += step) out.push(line(x, y0, x, y0 + h, c, sw));
  for (let y = y0; y <= y0 + h + 0.01; y += step) out.push(line(x0, y, x0 + w, y, c, sw));
  return node('g', { 'aria-hidden': 'true' }, out);
}
/** Degrees -> a unit vector on screen (0 = right, 90 = up: maths angles; screen y grows downwards). */
const unitOf = deg => ({ x: Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) });
/** 'up' | 'down' | 'left' | 'right' | degrees -> degrees, or null. */
function angleOf(dir) {
  if (typeof dir === 'number' && Number.isFinite(dir)) return ((dir % 360) + 360) % 360;
  return { right: 0, up: 90, left: 180, down: 270 }[dir] ?? null;
}
/** Is this a finite number in [lo, hi]? */
const isNum = (v, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** A short label from the data (trimmed, at most n characters), or ''. */
const text = (s, n = 40) => (typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** Is this figure asked to hide its answer (opts.hide true, or this name in its list)? */
const hides = (o, name) => !!o && (o.hide === true || (Array.isArray(o.hide) && o.hide.includes(name)) || o.hide === name);

// ---- figures/src/words.js
// Oomba Figures: the few words a figure writes by itself when the data gives none (axis names, "object" and "image"),
// in the site's languages. Physics and chemistry symbols (F, W, N, T, 2F, C, p, n, pH) are the same everywhere and are
// not translated. Data can always give its own labels, in the builder's language.
const FIG_WORDS = {
  en: { object: 'object', image: 'image', time: 'Time', distance: 'Distance', velocity: 'Velocity', displacement: 'Displacement', volumeAdded: 'Volume added', remaining: 'Amount left', halfLife: 'half-life', eqPoint: 'equivalence point', reading: 'Reading' },
  es: { object: 'objeto', image: 'imagen', time: 'Tiempo', distance: 'Distancia', velocity: 'Velocidad', displacement: 'Desplazamiento', volumeAdded: 'Volumen añadido', remaining: 'Cantidad restante', halfLife: 'semivida', eqPoint: 'punto de equivalencia', reading: 'Lectura' },
  fr: { object: 'objet', image: 'image', time: 'Temps', distance: 'Distance', velocity: 'Vitesse', displacement: 'Déplacement', volumeAdded: 'Volume versé', remaining: 'Quantité restante', halfLife: 'demi-vie', eqPoint: "point d'équivalence", reading: 'Lecture' },
  de: { object: 'Gegenstand', image: 'Bild', time: 'Zeit', distance: 'Strecke', velocity: 'Geschwindigkeit', displacement: 'Verschiebung', volumeAdded: 'Zugegebenes Volumen', remaining: 'Verbleibende Menge', halfLife: 'Halbwertszeit', eqPoint: 'Äquivalenzpunkt', reading: 'Ablesung' },
  it: { object: 'oggetto', image: 'immagine', time: 'Tempo', distance: 'Distanza', velocity: 'Velocità', displacement: 'Spostamento', volumeAdded: 'Volume aggiunto', remaining: 'Quantità rimasta', halfLife: 'tempo di dimezzamento', eqPoint: 'punto di equivalenza', reading: 'Lettura' },
  pt: { object: 'objeto', image: 'imagem', time: 'Tempo', distance: 'Distância', velocity: 'Velocidade', displacement: 'Deslocamento', volumeAdded: 'Volume adicionado', remaining: 'Quantidade restante', halfLife: 'meia-vida', eqPoint: 'ponto de equivalência', reading: 'Leitura' },
  nl: { object: 'voorwerp', image: 'beeld', time: 'Tijd', distance: 'Afstand', velocity: 'Snelheid', displacement: 'Verplaatsing', volumeAdded: 'Toegevoegd volume', remaining: 'Hoeveelheid over', halfLife: 'halveringstijd', eqPoint: 'equivalentiepunt', reading: 'Aflezing' },
  ru: { object: 'предмет', image: 'изображение', time: 'Время', distance: 'Путь', velocity: 'Скорость', displacement: 'Перемещение', volumeAdded: 'Добавленный объём', remaining: 'Осталось', halfLife: 'период полураспада', eqPoint: 'точка эквивалентности', reading: 'Показание' },
  ja: { object: '物体', image: '像', time: '時間', distance: '距離', velocity: '速度', displacement: '変位', volumeAdded: '加えた体積', remaining: '残っている量', halfLife: '半減期', eqPoint: '中和点', reading: '読み' },
  'zh-Hant': { object: '物體', image: '像', time: '時間', distance: '距離', velocity: '速度', displacement: '位移', volumeAdded: '加入的體積', remaining: '剩餘的量', halfLife: '半衰期', eqPoint: '當量點', reading: '讀數' },
  ar: { object: 'الجسم', image: 'الصورة', time: 'الزمن', distance: 'المسافة', velocity: 'السرعة', displacement: 'الإزاحة', volumeAdded: 'الحجم المضاف', remaining: 'الكمية المتبقية', halfLife: 'عمر النصف', eqPoint: 'نقطة التكافؤ', reading: 'القراءة' },
  he: { object: 'עצם', image: 'דמות', time: 'זמן', distance: 'מרחק', velocity: 'מהירות', displacement: 'העתק', volumeAdded: 'נפח שהוסף', remaining: 'כמות שנשארה', halfLife: 'זמן מחצית חיים', eqPoint: 'נקודת שקילות', reading: 'קריאה' },
};
/** The words for a site language: the language, its base ('en-GB' -> 'en'), then English, word by word. */
function figWords(lang) {
  const l = String(lang || 'en'), base = FIG_WORDS[l] || FIG_WORDS[l.split('-')[0]] || {};
  return k => (base[k] != null ? base[k] : FIG_WORDS.en[k] != null ? FIG_WORDS.en[k] : k);
}

// ---- figures/src/physics.js
// Oomba Figures: physics. Free-body diagrams, vectors, inclined planes, pulleys, ray diagrams and circuits. Every
// figure is drawn to scale from its numbers: an arrow's length is proportional to its force, an angle is the angle,
// a ray goes where the thin-lens (or mirror) equation sends it. check(d) lists what is wrong with the data in plain
// English (the Builder's model reads it); draw(d, o) assumes the data passed check.

/** The box around some points, plus a margin. */
function bounds(pts, m = 0) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
}
/** Move a list of nodes by (dx, dy). */
const shift = (dx, dy, kids) => node('g', { transform: `translate(${r2(dx)} ${r2(dy)})` }, kids);
/** A rough width for a label of this many characters (for laying out the frame). */
const textW = (s, size = 14) => String(s).length * size * 0.58;
const unitText = (v, u, lang, dp = 2) => `${fmt(v, dp, lang)}${u ? ` ${u}` : ''}`;

// ---------------------------------------------------------------- free-body diagram
/**
 * { body: 'box' | 'dot' (default 'box'), label?: text on the body, forces: [{ name, dir: 'up' | 'down' | 'left' |
 * 'right' | degrees (0 right, 90 up), size: newtons, label?: its own label, hide?: true }], unit?: 'N', net?: true (the
 * resultant, dashed) }. Each arrow starts on the object (its centre for a dot, the middle of the box's edge it leaves
 * through) and is size × scale long: the longest force is 120 px. hide (or opts.hide): that force's size is "?".
 */
const freeBody = {
  check(d) {
    const out = [], f = d && Array.isArray(d.forces) ? d.forces : null;
    if (!f || f.length < 1 || f.length > 8) out.push('"forces" must list 1 to 8 forces');
    else f.forEach((x, i) => {
      if (!x || typeof x !== 'object') return out.push(`force ${i + 1} must be { name, dir, size }`);
      if (angleOf(x.dir) === null) out.push(`force ${i + 1}: "dir" must be up, down, left, right or an angle in degrees`);
      if (!isNum(x.size, 0, 1e6)) out.push(`force ${i + 1}: "size" must be a number of newtons (0 or more)`);
      if (!text(x.name, 12) && !text(x.label, 30)) out.push(`force ${i + 1} needs a "name" (like W, N, F or T)`);
    });
    if (d && d.body !== undefined && !['box', 'dot'].includes(d.body)) out.push('"body" must be "box" or "dot"');
    return out;
  },
  draw(d, o) {
    const p = palette(o), forces = d.forces, unit = text(d.unit, 6) || 'N', lang = o.lang;
    const max = Math.max(...forces.map(f => f.size), 1e-9), scale = 120 / max, dot = d.body === 'dot', B = dot ? 0 : 34;
    const parts = [], pts = [[-B - 10, -B - 10], [B + 10, B + 10]];
    // where each arrow leaves the object: the box's edge along its direction
    const start = u => { if (dot) return { x: 0, y: 0 }; const k = B / Math.max(Math.abs(u.x), Math.abs(u.y)); return { x: u.x * k, y: u.y * k }; };
    const rows = forces.map((f, i) => {
      const u = unitOf(angleOf(f.dir)), s = start(u), L = f.size * scale, tip = { x: s.x + u.x * L, y: s.y + u.y * L };
      const hidden = f.hide === true || hides(o, 'forces') || hides(o, f.name);
      const words = text(f.label, 30) || (hidden ? `${text(f.name, 12)} = ? ${unit}` : `${text(f.name, 12)} = ${unitText(f.size, unit, lang)}`);
      const lx = tip.x + u.x * 14 + (Math.abs(u.x) < 0.3 ? 8 : 0), ly = tip.y + u.y * 14;
      const anchor = Math.abs(u.x) < 0.3 ? 'start' : u.x > 0 ? 'start' : 'end';
      pts.push([tip.x, tip.y], [lx + (anchor === 'end' ? -textW(words) : textW(words)), ly], [lx, ly - 10], [lx, ly + 10]);
      return { f, i, u, s, tip, words, lx, ly, anchor };
    });
    const body = dot ? node('circle', { cx: 0, cy: 0, r: 7, fill: p.ink })
      : node('g', {}, node('rect', { x: -B, y: -B, width: 2 * B, height: 2 * B, rx: 6, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }),
        text(d.label, 10) ? label(0, 0, text(d.label, 10), { anchor: 'middle', size: 13, colour: p.ink }) : null);
    parts.push(body);
    for (const r of rows) {
      if (r.f.size <= 0) continue;
      const c = seriesColour(o, r.i);
      parts.push(arrow(r.s.x, r.s.y, r.tip.x, r.tip.y, { colour: c, width: 3.5 }), label(r.lx, r.ly, r.words, { anchor: r.anchor, colour: c, size: 15, halo: p.paper }));
    }
    if (d.net) {
      const nx = forces.reduce((a, f) => a + unitOf(angleOf(f.dir)).x * f.size, 0), ny = forces.reduce((a, f) => a + unitOf(angleOf(f.dir)).y * f.size, 0);
      const mag = Math.hypot(nx, ny);
      if (mag > 1e-9) {
        // from the object's edge like the forces, set off to one side so it never hides one of them
        const u = { x: nx / mag, y: ny / mag }, s0 = start(u), off = { x: -u.y * 22, y: u.x * 22 };
        const from = { x: s0.x + off.x, y: s0.y + off.y }, tip = { x: from.x + nx * scale, y: from.y + ny * scale };
        pts.push([tip.x, tip.y], [from.x, from.y]);
        parts.push(arrow(from.x, from.y, tip.x, tip.y, { colour: p.ink, width: 2.5, dash: '7 5' }),
          label(tip.x + (tip.x >= 0 ? 10 : -10), tip.y + (Math.abs(u.x) > 0.5 ? 14 : 0), hides(o, 'net') ? `F = ? ${unit}` : `F = ${unitText(mag, unit, lang)}`, { anchor: tip.x >= 0 ? 'start' : 'end', colour: p.ink, size: 14, italic: true, halo: p.paper }));
      }
    }
    const b = bounds(pts, 18);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'freeBody' }, o.title || 'Free-body diagram');
  },
};

// ---------------------------------------------------------------- vectors
/**
 * { vectors: [{ x, y, label?, from?: [x, y] }], chain?: true (tip to tail), resultant?: true | { label }, grid?: true,
 * unit?: text }. x and y are grid units (y up). The resultant goes from the first vector's start to the sum's tip; with
 * two vectors from one point (no chain) the parallelogram is drawn dashed.
 */
const vectors = {
  check(d) {
    const out = [], v = d && Array.isArray(d.vectors) ? d.vectors : null;
    if (!v || v.length < 1 || v.length > 6) out.push('"vectors" must list 1 to 6 vectors { x, y }');
    else v.forEach((x, i) => {
      if (!x || !isNum(x.x, -50, 50) || !isNum(x.y, -50, 50)) out.push(`vector ${i + 1} needs numbers "x" and "y" from -50 to 50 (grid units)`);
      else if (!x.x && !x.y) out.push(`vector ${i + 1} has no length`);
      if (x && x.from !== undefined && !(Array.isArray(x.from) && isNum(x.from[0], -50, 50) && isNum(x.from[1], -50, 50))) out.push(`vector ${i + 1}: "from" must be [x, y]`);
    });
    return out;
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, unit = text(d.unit, 6);
    const segs = []; let at = [0, 0];
    d.vectors.forEach((v, i) => {
      const from = d.chain ? at : Array.isArray(v.from) ? v.from : [0, 0];
      segs.push({ v, i, from, to: [from[0] + v.x, from[1] + v.y] }); at = [from[0] + v.x, from[1] + v.y];
    });
    const sum = d.vectors.reduce((a, v) => [a[0] + v.x, a[1] + v.y], [0, 0]);
    const origin = segs[0].from, rTip = d.chain ? at : [origin[0] + sum[0], origin[1] + sum[1]];
    const all = segs.flatMap(s => [s.from, s.to]).concat([rTip]);
    const gx0 = Math.floor(Math.min(...all.map(q => q[0]))) - 1, gx1 = Math.ceil(Math.max(...all.map(q => q[0]))) + 1;
    const gy0 = Math.floor(Math.min(...all.map(q => q[1]))) - 1, gy1 = Math.ceil(Math.max(...all.map(q => q[1]))) + 1;
    const S = Math.max(14, Math.min(48, 440 / Math.max(gx1 - gx0, gy1 - gy0))), X = x => (x - gx0) * S, Y = y => (gy1 - y) * S;
    const parts = [];
    if (d.grid !== false) parts.push(gridLines(0, 0, (gx1 - gx0) * S, (gy1 - gy0) * S, S, p.grid));
    if (!d.chain && segs.length === 2 && d.resultant) {
      const [a, b] = segs;
      parts.push(line(X(a.to[0]), Y(a.to[1]), X(rTip[0]), Y(rTip[1]), p.muted, 1.5, { 'stroke-dasharray': '5 5' }), line(X(b.to[0]), Y(b.to[1]), X(rTip[0]), Y(rTip[1]), p.muted, 1.5, { 'stroke-dasharray': '5 5' }));
    }
    for (const s of segs) {
      const c = seriesColour(o, s.i), mx = (X(s.from[0]) + X(s.to[0])) / 2, my = (Y(s.from[1]) + Y(s.to[1])) / 2;
      const len = Math.hypot(s.v.x, s.v.y), nx = -s.v.y / len, ny = -s.v.x / len;   // a normal on screen (y down)
      parts.push(arrow(X(s.from[0]), Y(s.from[1]), X(s.to[0]), Y(s.to[1]), { colour: c, width: 3.2 }),
        label(mx + nx * 14, my + ny * 14, text(s.v.label, 20) || String.fromCharCode(97 + s.i), { anchor: 'middle', colour: c, size: 15, italic: true, halo: p.paper }));
    }
    if (d.resultant) {
      const mag = Math.hypot(sum[0], sum[1]), hide = hides(o, 'resultant');
      const name = (d.resultant && typeof d.resultant === 'object' && text(d.resultant.label, 20)) || 'R';
      const mx = (X(origin[0]) + X(rTip[0])) / 2, my = (Y(origin[1]) + Y(rTip[1])) / 2;
      parts.push(arrow(X(origin[0]), Y(origin[1]), X(rTip[0]), Y(rTip[1]), { colour: p.ink, width: 3, dash: hide ? '2 7' : null }),
        label(mx + 10, my + 16, hide ? `${name} = ?` : `${name} = ${fmt(mag, 2, lang)}${unit ? ` ${unit}` : ''}`, { colour: p.ink, size: 14, halo: p.paper }));
    }
    const w = (gx1 - gx0) * S, h = (gy1 - gy0) * S;
    return frame(w + 16, h + 16, shift(8, 8, parts), { ...o, kind: 'vectors' }, o.title || 'Vector diagram');
  },
};

// ---------------------------------------------------------------- inclined plane
/**
 * { angle: degrees (5 to 70), mass?: kg (default 1), g?: 9.8, forces?: ['weight', 'normal', 'friction', 'applied'],
 * friction?: newtons (default: what holds it still, m g sin θ; or mu × N with "mu"), mu?, applied?: { size, dir:
 * 'up' | 'down' } (along the slope), components?: true (the weight's two parts, dashed), labels?: 'values' | 'names' }.
 * Weight m g points straight down; the normal force m g cos θ is at right angles to the slope; friction and the applied
 * force run along it. Every arrow is to scale (the longest is 130 px) and the slope's angle is the angle.
 */
const inclinedPlane = {
  check(d) {
    const out = [];
    if (!d || !isNum(d.angle, 5, 70)) out.push('"angle" must be a number of degrees from 5 to 70');
    if (d && d.mass !== undefined && !isNum(d.mass, 0.01, 1e5)) out.push('"mass" must be a number of kilograms');
    if (d && d.mu !== undefined && !isNum(d.mu, 0, 2)) out.push('"mu" must be from 0 to 2');
    if (d && d.friction !== undefined && !isNum(d.friction, 0, 1e6)) out.push('"friction" must be a number of newtons');
    if (d && d.forces !== undefined && (!Array.isArray(d.forces) || d.forces.some(f => !['weight', 'normal', 'friction', 'applied'].includes(f)))) out.push('"forces" may list weight, normal, friction, applied');
    if (d && d.applied !== undefined && !(d.applied && isNum(d.applied.size, 0, 1e6) && ['up', 'down'].includes(d.applied.dir))) out.push('"applied" must be { size, dir: "up" | "down" } (along the slope)');
    return out;
  },
  /** The forces' sizes (newtons): the same numbers the figure draws. */
  sizes(d) {
    const m = d.mass ?? 1, g = d.g ?? 9.8, th = (d.angle * Math.PI) / 180, W = m * g, N = W * Math.cos(th);
    const F = d.friction !== undefined ? d.friction : d.mu !== undefined ? d.mu * N : W * Math.sin(th);
    return { W, N, F, along: W * Math.sin(th), into: W * Math.cos(th), A: d.applied ? d.applied.size : 0 };
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, th = (d.angle * Math.PI) / 180, s = inclinedPlane.sizes(d);
    const show = new Set(Array.isArray(d.forces) ? d.forces : ['weight', 'normal', 'friction', ...(d.applied ? ['applied'] : [])]);
    const L = 360, H = L * Math.tan(th) > 230 ? 230 : L * Math.tan(th), base = H / Math.tan(th);
    // the slope from A (bottom left) up to C (top right); screen y grows downwards
    const A = [0, H], Bp = [base, H], C = [base, 0];
    const ux = Math.cos(th), uy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);   // up the slope; out of the slope
    const at = 0.55, bw = 64, bh = 40, foot = [A[0] + (C[0] - A[0]) * at, A[1] + (C[1] - A[1]) * at];
    const cen = [foot[0] + nx * bh / 2, foot[1] + ny * bh / 2];
    const max = Math.max(s.W, s.N, show.has('friction') ? s.F : 0, s.A, 1e-9), k = 130 / max;
    const named = d.labels === 'names' || hides(o, 'values');
    const lab = (sym, sub, v) => (named ? { main: sym, sub } : { main: sym, sub, after: ` = ${unitText(v, 'N', lang, 1)}` });
    const parts = [
      node('polygon', { points: [A, Bp, C].map(q => `${r2(q[0])},${r2(q[1])}`).join(' '), fill: p.soft, stroke: p.ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      // the angle at A, and its size
      path(`M ${r2(A[0] + 54)} ${r2(A[1])} A 54 54 0 0 0 ${r2(A[0] + 54 * Math.cos(th))} ${r2(A[1] - 54 * Math.sin(th))}`, { stroke: p.ink, 'stroke-width': 1.8 }),
      label(A[0] + 62 * Math.cos(th / 2) + 4, A[1] - 62 * Math.sin(th / 2), hides(o, 'angle') ? 'θ' : `${fmt(d.angle, 1, lang)}°`, { size: 14, colour: p.ink }),
      // the block, turned to sit on the slope
      node('g', { transform: `translate(${r2(cen[0])} ${r2(cen[1])}) rotate(${r2(-d.angle)})` },
        node('rect', { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: 5, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }),
        d.mass !== undefined ? label(0, 0, `${fmt(d.mass, 2, lang)} kg`, { anchor: 'middle', size: 12, colour: p.ink }) : null),
      // the right angle at B
      poly([[Bp[0] - 14, Bp[1]], [Bp[0] - 14, Bp[1] - 14], [Bp[0], Bp[1] - 14]], { stroke: p.ink, 'stroke-width': 1.5 }),
    ];
    const pts = [A, Bp, C];
    const put = (vx, vy, len, c, lb, o2 = {}) => {
      const x2 = cen[0] + vx * len, y2 = cen[1] + vy * len;
      pts.push([x2, y2]);
      parts.push(arrow(cen[0], cen[1], x2, y2, { colour: c, width: o2.dash ? 2.2 : 3.4, dash: o2.dash }));
      if (lb) {
        const lx = x2 + vx * 14 + (o2.dx || 0), ly = y2 + vy * 14 + (o2.dy || 0), anchor = vx > 0.2 ? 'start' : vx < -0.2 ? 'end' : 'middle';
        parts.push(subLabel(lx, ly, lb.main, lb.sub, { anchor, colour: c, size: 14, after: lb.after }));
        pts.push([lx + (anchor === 'start' ? 120 : anchor === 'end' ? -120 : 60), ly]);
      }
    };
    if (show.has('weight')) put(0, 1, s.W * k, seriesColour(o, 2), lab('W', '', s.W), { dx: 6 });
    if (show.has('normal')) put(nx, ny, s.N * k, seriesColour(o, 1), lab('N', '', s.N));
    if (show.has('friction') && s.F > 0) put(ux, uy, s.F * k, seriesColour(o, 3), lab('F', 'f', s.F), { dy: -12 });
    if (show.has('applied') && d.applied && s.A > 0) put(d.applied.dir === 'up' ? ux : -ux, d.applied.dir === 'up' ? uy : -uy, s.A * k, seriesColour(o, 0), lab('F', 'app', s.A), { dy: 14 });
    if (d.components) {
      put(-ux, -uy, s.along * k, p.muted, named ? { main: 'W', sub: '∥' } : { main: 'W sin θ', sub: '', after: ` = ${unitText(s.along, 'N', lang, 1)}` }, { dash: '6 4', dy: 16 });
      put(-nx, -ny, s.into * k, p.muted, named ? { main: 'W', sub: '⊥' } : { main: 'W cos θ', sub: '', after: ` = ${unitText(s.into, 'N', lang, 1)}` }, { dash: '6 4' });
    }
    const b = bounds(pts, 22);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'inclinedPlane' }, o.title || 'Inclined plane');
  },
};

// ---------------------------------------------------------------- pulleys
/**
 * { type: 'atwood' (two masses over one pulley) | 'table' (one on a table, one hanging over the edge) | 'single' (one
 * mass held by a rope over a pulley, pulled down with F), masses: [kg, kg] (single: [kg]), g?: 9.8, mu?: (table),
 * show?: ['tension', 'weight', 'normal', 'friction', 'acceleration'] }. Rope tension and acceleration are worked out
 * (frictionless, light rope and pulley): Atwood T = 2 m1 m2 g / (m1 + m2), a = (m2 − m1) g / (m1 + m2); table
 * a = (m2 − mu m1) g / (m1 + m2) (0 if that is not positive), T = m2 (g − a). Arrows are to scale.
 */
const pulley = {
  check(d) {
    const out = [], t = d && d.type;
    if (!['atwood', 'table', 'single'].includes(t)) out.push('"type" must be "atwood", "table" or "single"');
    const m = d && Array.isArray(d.masses) ? d.masses : null, need = t === 'single' ? 1 : 2;
    if (!m || m.length !== need || m.some(x => !isNum(x, 0.01, 1e4))) out.push(`"masses" must list ${need} mass${need > 1 ? 'es' : ''} in kilograms`);
    if (d && d.mu !== undefined && !isNum(d.mu, 0, 2)) out.push('"mu" must be from 0 to 2');
    return out;
  },
  /** The numbers the figure shows: { a (m/s², the direction the heavier side moves), T (N), W: [N] }. */
  solve(d) {
    const g = d.g ?? 9.8, m = d.masses;
    if (d.type === 'single') return { a: 0, T: m[0] * g, W: [m[0] * g] };
    if (d.type === 'atwood') { const [m1, m2] = m; return { a: ((m2 - m1) * g) / (m1 + m2), T: (2 * m1 * m2 * g) / (m1 + m2), W: [m1 * g, m2 * g] }; }
    const [m1, m2] = m, mu = d.mu ?? 0, a = Math.max(0, ((m2 - mu * m1) * g) / (m1 + m2));
    return { a, T: m2 * (g - a), W: [m1 * g, m2 * g], N: m1 * g, f: a > 0 ? mu * m1 * g : m2 * g };
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, s = pulley.solve(d), show = new Set(Array.isArray(d.show) ? d.show : ['tension', 'weight']);
    const hideT = hides(o, 'tension'), hideA = hides(o, 'acceleration');
    const max = Math.max(...s.W, s.T, s.N || 0, 1e-9), k = 110 / max, parts = [], pts = [];
    const block = (x, y, w, h, m) => node('g', {}, node('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 5, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }), label(x, y, `${fmt(m, 2, lang)} kg`, { anchor: 'middle', size: 13, colour: p.ink }));
    // side: -1 puts a vertical arrow's label on its left (the left-hand mass), 1 on its right
    const force = (x, y, vx, vy, v, c, main, sub, hide, side = 1) => {
      const x2 = x + vx * v * k, y2 = y + vy * v * k; pts.push([x2, y2]);
      parts.push(arrow(x, y, x2, y2, { colour: c, width: 3.2 }));
      // a sideways arrow: its label just past the tip; an up or down one: beside its middle, on the given side
      const left = vx ? vx < 0 : side < 0, lx = vx ? x2 + vx * 10 : x + side * 12, ly = vx ? y2 - 16 : (y + y2) / 2;
      parts.push(subLabel(lx, ly, main, sub, { anchor: left ? 'end' : 'start', colour: c, size: 14, after: hide ? ' = ?' : ` = ${unitText(v, 'N', lang, 1)}`, halo: p.paper }));
      pts.push([lx + (left ? -120 : 120), ly]);
    };

    const R = 30;
    if (d.type === 'table') {
      // the table top from x 0 to 300 at y 200; the pulley at its right corner
      // the rope leaves the block level with its middle and runs flat to the top of the pulley (so the tension is
      // horizontal); the pulley is clamped to the table's corner
      const ty = 200, b1 = [130, ty - 26], px = 334, py = b1[1] + R;
      parts.push(node('rect', { x: 0, y: ty, width: 300, height: 18, fill: p.soft, stroke: p.ink, 'stroke-width': 2 }), line(20, ty + 18, 20, ty + 120, p.ink, 2.5), line(280, ty + 18, 280, ty + 120, p.ink, 2.5),
        line(300, ty + 9, px, py, p.ink2, 3), node('circle', { cx: px, cy: py, r: R, fill: p.paper, stroke: p.ink, 'stroke-width': 2.5 }), node('circle', { cx: px, cy: py, r: 4, fill: p.ink }));
      const b2 = [px + R, py + 150];
      parts.push(line(b1[0] + 40, b1[1], px, py - R, p.ink2, 2.5), line(px + R, py, b2[0], b2[1] - 26, p.ink2, 2.5), block(b1[0], b1[1], 80, 52, d.masses[0]), block(b2[0], b2[1], 64, 52, d.masses[1]));
      if (show.has('tension')) { force(b1[0] + 40, b1[1], 1, 0, s.T, seriesColour(o, 1), 'T', '', hideT); force(b2[0], b2[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT); }
      if (show.has('weight')) { force(b1[0], b1[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '1', false); force(b2[0], b2[1] + 26, 0, 1, s.W[1], seriesColour(o, 2), 'W', '2', false); }
      if (show.has('normal')) force(b1[0] - 20, b1[1] - 26, 0, -1, s.N, seriesColour(o, 0), 'N', '', false);
      if (show.has('friction') && d.mu) force(b1[0] - 40, b1[1] + 10, -1, 0, s.f, seriesColour(o, 3), 'F', 'f', false);
      if (show.has('acceleration')) parts.push(label(10, 20, hideA ? 'a = ? m/s²' : `a = ${unitText(s.a, 'm/s²', lang, 2)}`, { colour: p.ink, size: 14 }));
      pts.push([0, 0], [380, ty + 130], [b2[0] + 40, b2[1] + 140]);
    } else {
      // a ceiling, the pulley under it, the rope(s) down
      const cx = 200, cy = 60;
      parts.push(node('rect', { x: cx - 90, y: 0, width: 180, height: 12, fill: p.soft, stroke: p.ink, 'stroke-width': 2 }), line(cx, 12, cx, cy, p.ink, 2.5),
        node('circle', { cx, cy, r: R, fill: p.paper, stroke: p.ink, 'stroke-width': 2.5 }), node('circle', { cx, cy, r: 4, fill: p.ink }));
      const left = [cx - R, cy + 190], right = [cx + R, cy + 190];
      if (d.type === 'atwood') {
        const dy = s.a > 0 ? 30 : s.a < 0 ? -30 : 0;   // the heavier side hangs a little lower (just a picture of which way)
        const L = [left[0], left[1] - dy], Rr = [right[0], right[1] + dy];
        parts.push(line(cx - R, cy, L[0], L[1] - 26, p.ink2, 2.5), line(cx + R, cy, Rr[0], Rr[1] - 26, p.ink2, 2.5), block(L[0], L[1], 56, 52, d.masses[0]), block(Rr[0], Rr[1], 56, 52, d.masses[1]));
        if (show.has('tension')) { force(L[0] - 12, L[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT, -1); force(Rr[0] + 12, Rr[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT, 1); }
        if (show.has('weight')) { force(L[0], L[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '1', false, -1); force(Rr[0], Rr[1] + 26, 0, 1, s.W[1], seriesColour(o, 2), 'W', '2', false, 1); }
        if (show.has('acceleration') && Math.abs(s.a) > 1e-9) parts.push(label(cx + 100, 30, hideA ? 'a = ? m/s²' : `a = ${unitText(Math.abs(s.a), 'm/s²', lang, 2)}`, { anchor: 'middle', colour: p.ink, size: 14 }));
        pts.push([cx - 160, 0], [cx + 160, cy + 320]);
      } else {
        parts.push(line(cx - R, cy, left[0], left[1] - 26, p.ink2, 2.5), line(cx + R, cy, right[0], right[1] - 60, p.ink2, 2.5), block(left[0], left[1], 56, 52, d.masses[0]));
        if (show.has('tension')) force(left[0] - 8, left[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT);
        if (show.has('weight')) force(left[0], left[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '', false);
        force(right[0], right[1] - 60, 0, 1, s.T, seriesColour(o, 0), 'F', '', hideT);
        pts.push([cx - 160, 0], [cx + 160, cy + 320]);
      }
    }
    const b = bounds(pts, 18);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'pulley' }, o.title || 'Pulley');
  },
};

// ---------------------------------------------------------------- ray diagrams
const RAY_TYPES = ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror'];
/**
 * { type: 'convex-lens' (converging) | 'concave-lens' (diverging) | 'concave-mirror' | 'convex-mirror', f: focal length
 * (> 0, cm), u: object distance (> 0), h?: object height (default f / 2), rays?: [1, 2, 3] (which principal rays),
 * unit?: 'cm', labels?: { object, image } }. Thin lens or mirror at x = 0, the object on the left. The image comes from
 * 1/f = 1/u + 1/v (real is positive; a diverging lens and a convex mirror have f < 0), magnification −v/u, and every
 * principal ray is drawn through it: 1 parallel to the axis then through (or from) F; 2 through the centre (a lens) or
 * to the pole (a mirror); 3 through (or towards) F then parallel. A virtual image is dashed, with the rays' dashed
 * back-extensions meeting at it. opts.hide: no rays and no image (the student draws them); 'image': rays, no image.
 */
const rays = {
  check(d) {
    const out = [];
    if (!d || !RAY_TYPES.includes(d.type)) out.push(`"type" must be one of ${RAY_TYPES.join(', ')}`);
    if (!d || !isNum(d.f, 0.1, 1000)) out.push('"f" must be the focal length, a number above 0');
    if (!d || !isNum(d.u, 0.1, 5000)) out.push('"u" must be the object distance, a number above 0');
    if (d && d.h !== undefined && !isNum(d.h, 0.01, 1000)) out.push('"h" must be the object height, a number above 0');
    if (!out.length) {
      const s = rays.solve(d);
      if (!s) out.push('the object is at the focal point: the rays come out parallel and there is no image to draw (use another "u")');
      else if (Math.abs(s.v) > 6 * Math.max(d.u, d.f)) out.push(`the image is ${fmt(Math.abs(s.v), 1)} away: too far to draw; move the object further from F`);
      else if (Math.abs(s.hi) > 6 * (d.h ?? d.f / 2)) out.push('the image is too tall to draw; move the object further from F');
    }
    if (d && d.rays !== undefined && (!Array.isArray(d.rays) || !d.rays.length || d.rays.some(r => ![1, 2, 3].includes(r)))) out.push('"rays" lists 1, 2 and/or 3');
    return out;
  },
  /** -> { v (image distance, real positive), m (magnification), hi (image height), real, x (the image's x: right of
   *  the lens is +, in front of a mirror is −) } or null (object at F). */
  solve(d) {
    const sign = d.type === 'convex-lens' || d.type === 'concave-mirror' ? 1 : -1, f = sign * d.f, u = d.u, h = d.h ?? d.f / 2;
    if (Math.abs(u - f) < 1e-9) return null;
    const v = (u * f) / (u - f), m = -v / u, mirror = /mirror/.test(d.type);
    return { f, v, m, hi: m * h, h, real: v > 0, mirror, x: mirror ? -v : v };
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = figWords(lang), s = rays.solve(d), unit = text(d.unit, 6) || 'cm';
    const mirror = s.mirror, out = mirror ? -1 : 1, u = d.u, h = s.h, f = Math.abs(s.f);
    const noRays = hides(o, 'rays') || o.hide === true, noImage = noRays || hides(o, 'image');
    // the world box: both F (and 2F for a lens; C for a mirror), the object and the image, with room for the rays
    const xs = [-u, -2 * f, mirror ? (s.f < 0 ? 2 * f : 0) : 2 * f, s.x], ys = [h, -h, s.hi, -Math.abs(s.hi) * 0.2];
    const x0 = Math.min(...xs) * 1.18 - f * 0.25, x1 = Math.max(...xs, mirror ? f * 0.4 : f * 0.5) * 1.18 + f * 0.25;
    const ymax = Math.max(...ys.map(Math.abs)) * 1.35;
    // heights are drawn on their own scale (as textbooks do): stretching one axis keeps every ray straight and every
    // crossing (F, the image) exactly where it is, so the construction stays true
    const Sx = 560 / (x1 - x0), Sy = 120 / ymax, M = 26, X = x => (x - x0) * Sx, Y = y => M + (ymax - y) * Sy, Wd = (x1 - x0) * Sx, Ht = 2 * ymax * Sy + 2 * M;
    const parts = [line(0, Y(0), Wd, Y(0), P.muted, 1.5)];
    // the lens or mirror (a thin one: a line with the usual end marks; a mirror has its back hatched)
    const top = Y(ymax * 0.92), bot = Y(-ymax * 0.92), lx = X(0);
    if (!mirror) {
      const inward = d.type === 'concave-lens';
      parts.push(line(lx, top, lx, bot, P.blue, 3.5),
        poly(inward ? [[lx - 8, top - 9], [lx, top], [lx + 8, top - 9]] : [[lx - 8, top + 9], [lx, top], [lx + 8, top + 9]], { stroke: P.blue, 'stroke-width': 3 }),
        poly(inward ? [[lx - 8, bot + 9], [lx, bot], [lx + 8, bot + 9]] : [[lx - 8, bot - 9], [lx, bot], [lx + 8, bot - 9]], { stroke: P.blue, 'stroke-width': 3 }));
    } else {
      const bend = d.type === 'concave-mirror' ? -10 : 10;   // the ends bend towards the object (concave) or away
      parts.push(path(`M ${r2(lx + bend)} ${r2(top)} Q ${r2(lx - bend)} ${r2((top + bot) / 2)} ${r2(lx + bend)} ${r2(bot)}`, { stroke: P.blue, 'stroke-width': 3.5 }));
      for (let y = top + 6; y < bot - 4; y += 12) parts.push(line(lx + 4, y, lx + 13, y - 8, P.blue, 1.4));
    }
    // F and 2F (a lens) or F and C (a mirror)
    const mark = (x, t) => [line(X(x), Y(0) - 6, X(x), Y(0) + 6, P.ink, 2), label(X(x), Y(0) + 18, t, { anchor: 'middle', size: 13, colour: P.ink })];
    if (!mirror) parts.push(mark(-f, 'F'), mark(f, 'F'), mark(-2 * f, '2F'), mark(2 * f, '2F'));
    else { const side = s.f > 0 ? -1 : 1; parts.push(mark(side * f, 'F'), mark(side * 2 * f, 'C')); }
    // the object: an upright arrow at x = −u
    parts.push(arrow(X(-u), Y(0), X(-u), Y(h), { colour: P.green, width: 3.5 }), label(X(-u), Y(h) - 14, (d.labels && text(d.labels.object, 20)) || W('object'), { anchor: 'middle', size: 13, colour: P.green }));
    if (!noRays) {
      const I = { x: s.x, y: s.hi }, hits = { 1: h, 2: 0, 3: s.hi }, edge = out > 0 ? x1 : x0;
      for (const r of (Array.isArray(d.rays) ? d.rays : [1, 2, 3])) {
        const hy = hits[r], c = seriesColour(o, r + 1), lw = 2.2;
        parts.push(arrowOn(X(-u), Y(h), X(0), Y(hy), c, lw));
        // where it goes after the lens or mirror: ray 3 parallel to the axis; rays 1 and 2 along the line to the image
        // (real) or away from it (virtual: dashed back to it)
        let dx, dy;
        if (r === 3) { dx = out; dy = 0; } else { const tx = s.real ? I.x : 2 * 0 - I.x, ty = s.real ? I.y : 2 * hy - I.y; dx = tx - 0; dy = ty - hy; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
        const t = (edge - 0) / dx, ex = edge, ey = hy + dy * t;
        const clip = clipY(0, hy, ex, ey, -ymax, ymax);
        parts.push(line(X(0), Y(hy), X(clip[0]), Y(clip[1]), c, lw));
        if (!s.real) parts.push(line(X(0), Y(hy), X(I.x), Y(I.y), c, 1.6, { 'stroke-dasharray': '6 5' }));
        // the construction lines through F that the student would draw: ray 3 comes from F (a converging lens with
        // the object inside F) or aims at F (a diverging lens, a convex mirror)
        if (r === 3 && Math.sign(s.f) * (u - f) < 0 && s.f > 0) parts.push(line(X(-f * (mirror ? 1 : 1)), Y(0), X(-u), Y(h), c, 1.4, { 'stroke-dasharray': '3 5' }));
        if (r === 3 && s.f < 0) parts.push(line(X(0), Y(hy), X(mirror ? f : f), Y(0), c, 1.4, { 'stroke-dasharray': '3 5' }));
        if (r === 1 && s.f < 0) parts.push(line(X(0), Y(hy), X(mirror ? f : -f), Y(0), c, 1.4, { 'stroke-dasharray': '3 5' }));
      }
    }
    if (!noImage) {
      parts.push(arrow(X(s.x), Y(0), X(s.x), Y(s.hi), { colour: P.red, width: 3.2, dash: s.real ? null : '6 4' }),
        label(X(s.x), Y(s.hi) + (s.hi >= 0 ? -14 : 16), (d.labels && text(d.labels.image, 20)) || W('image'), { anchor: 'middle', size: 13, colour: P.red }));
    }
    if (d.scale !== false) parts.push(label(6, Ht - 10, `F = ${unitText(f, unit, lang, 1)}`, { size: 11, weight: 600, colour: P.muted }));
    return frame(Wd, Ht, parts, { ...o, kind: 'rays' }, o.title || 'Ray diagram');
  },
};
/** A line with a small arrowhead half way (a ray's direction). */
function arrowOn(x1, y1, x2, y2, c, w) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  return node('g', {}, line(x1, y1, x2, y2, c, w), node('polygon', { points: `${r2(mx + ux * 7)},${r2(my + uy * 7)} ${r2(mx - ux * 5 - uy * 5)},${r2(my - uy * 5 + ux * 5)} ${r2(mx - ux * 5 + uy * 5)},${r2(my - uy * 5 - ux * 5)}`, fill: c }));
}
/** Cut the segment (x0, y0) -> (x1, y1) where it leaves lo <= y <= hi. */
function clipY(x0, y0, x1, y1, lo, hi) {
  if (y1 >= lo && y1 <= hi) return [x1, y1];
  const yy = y1 > hi ? hi : lo, t = (yy - y0) / (y1 - y0 || 1e-9);
  return [x0 + (x1 - x0) * t, yy];
}

// ---------------------------------------------------------------- circuits
const PARTS = ['cell', 'battery', 'bulb', 'resistor', 'switch', 'ammeter', 'voltmeter', 'variable-resistor', 'diode', 'led', 'fuse'];
/**
 * { layout: 'series' | 'parallel', parts: [{ type, label?, value?, open? }] (series: the whole loop; parallel: the
 * main line), branches?: [[parts], [parts], ...] (parallel: 2 or 3 branches between the two rails), meters?: [{ type:
 * 'voltmeter', across: index of a part in "parts" (or [branch, index]), value? }] }. The standard school symbols: a
 * cell (long line +, short line −), a battery (two cells), a bulb (circle with a cross), a resistor (a box), a switch
 * (open or closed), an ammeter (A) and a voltmeter (V) in circles, a variable resistor, a diode, an LED and a fuse.
 * value is printed next to the part ("6 V", "2 Ω", "0.5 A"); opts.hide makes every meter's reading "?".
 */
const circuit = {
  check(d) {
    const out = [], okPart = (x, where) => {
      if (!x || !PARTS.includes(x.type)) out.push(`${where}: "type" must be one of ${PARTS.join(', ')}`);
      else if (x.type === 'voltmeter' && x.across === undefined && where.startsWith('part')) out.push(`${where}: put a voltmeter in "meters" with "across" (it goes across a part, not in the loop)`);
      if (x && x.value !== undefined && !text(x.value, 14)) out.push(`${where}: "value" must be short text like "6 V"`);
    };
    if (!d || !['series', 'parallel'].includes(d.layout)) out.push('"layout" must be "series" or "parallel"');
    const parts = d && Array.isArray(d.parts) ? d.parts : [];
    parts.forEach((x, i) => okPart(x, `part ${i + 1}`));
    if (parts.length > 6) out.push('at most 6 parts in the main loop');
    const br = d && Array.isArray(d.branches) ? d.branches : [];
    if (d && d.layout === 'parallel' && (br.length < 2 || br.length > 3 || br.some(b => !Array.isArray(b) || !b.length || b.length > 3))) out.push('a parallel circuit needs 2 or 3 "branches", each a list of 1 to 3 parts');
    br.forEach((b, i) => (Array.isArray(b) ? b : []).forEach((x, j) => okPart(x, `branch ${i + 1} part ${j + 1}`)));
    const all = [...parts, ...br.flat()];
    if (!all.some(x => x && (x.type === 'cell' || x.type === 'battery'))) out.push('the circuit needs a cell or a battery');
    for (const [i, m] of (Array.isArray(d && d.meters) ? d.meters : []).entries()) {
      const at = Array.isArray(m && m.across) ? (br[m.across[0]] || [])[m.across[1]] : parts[m && m.across];
      if (!m || m.type !== 'voltmeter' || !at || at.type === 'voltmeter') out.push(`meter ${i + 1} must be { type: "voltmeter", across: the index of a part (or [branch, index]) }`);
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), parts = [], CW = 64;
    const hideM = o.hide === true || hides(o, 'meters');
    const valueOf = x => (x.type === 'ammeter' || x.type === 'voltmeter') && hideM ? `? ${x.type === 'ammeter' ? 'A' : 'V'}` : text(x.value, 14);
    // one part, drawn along +x from (0, 0) to (CW, 0), then placed (rotated) on the loop
    const sym = (x, ang) => symbol(x, P, CW, ang);
    const place = (x, ax, ay, ang, side = -1) => {
      const g = node('g', { transform: `translate(${r2(ax)} ${r2(ay)}) rotate(${ang})` }, sym(x, ang));
      const v = valueOf(x), lb = text(x.label, 16);
      const words = [lb, v].filter(Boolean).join('  ');
      if (!words) return g;
      const horiz = ang === 0 || ang === 180;
      return node('g', {}, g, horiz ? label(ax + (ang === 180 ? -CW / 2 : CW / 2), ay + side * 30, words, { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper })
        : label(ax + side * -30, ay + (ang === 90 ? CW / 2 : -CW / 2), words, { anchor: side < 0 ? 'start' : 'end', size: 13, colour: P.ink, halo: P.paper }));
    };
    const wire = (x1, y1, x2, y2) => line(x1, y1, x2, y2, P.ink, 2.5);
    const dotAt = (x, y) => node('circle', { cx: x, cy: y, r: 4.5, fill: P.ink });
    const main = Array.isArray(d.parts) ? d.parts : [];
    const cells = main.filter(x => x.type === 'cell' || x.type === 'battery'), rest = main.filter(x => !(x.type === 'cell' || x.type === 'battery'));
    let W, H;
    const meterAt = []; // [{ x1, y1, x2, y2, horiz, meter }]
    if (d.layout === 'series') {
      // the cells on the left side, the other parts spread over the top, the right side and the bottom
      const top = rest.slice(0, 3), right = rest.slice(3, 4), bottom = rest.slice(4);
      W = Math.max(3, top.length) * (CW + 56) + 40; H = 220;
      // room above the top wire for a voltmeter's loop
      const y0 = (Array.isArray(d.meters) && d.meters.length) ? 120 : 40, y1 = y0 + H - 60, x0 = 40, x1 = x0 + W - 40;
      const row = (list, y, ang) => { const gap = (x1 - x0 - list.length * CW) / (list.length + 1); let x = x0 + gap; const segs = []; for (const it of list) { segs.push([x, x + CW, it]); x += CW + gap; } return segs; };
      const topS = row(top, y0, 0), botS = row(bottom, y1, 0);
      let x = x0; for (const [a, b, it] of topS) { parts.push(wire(x, y0, a, y0), place(it, a, y0, 0, 1)); meterAt.push({ part: main.indexOf(it), x1: a, x2: b, y: y0, horiz: true }); x = b; } parts.push(wire(x, y0, x1, y0));
      x = x0; for (const [a, b, it] of botS) { parts.push(wire(x, y1, a, y1), place(it, a, y1, 0, 1)); x = b; } parts.push(wire(x, y1, x1, y1));
      // right side
      if (right.length) { const my = (y0 + y1) / 2 - CW / 2; parts.push(wire(x1, y0, x1, my), place(right[0], x1, my, 90, 1), wire(x1, my + CW, x1, y1)); } else parts.push(wire(x1, y0, x1, y1));
      // left side: the cells
      const cy = (y0 + y1) / 2 - (cells.length * CW) / 2; let yy = y0;
      cells.forEach((c, i) => { const a = cy + i * CW; parts.push(wire(x0, yy, x0, a), place(c, x0, a + CW, -90, -1)); yy = a + CW; });
      parts.push(wire(x0, yy, x0, y1));
      W = x1 + 60; H = y1 + 60;
    } else {
      const br = d.branches, n = br.length, gapX = CW + 120;
      const x0 = 40, top = 50, bh = Math.max(...br.map(b => b.length)) * (CW + 30) + 50, bot = top + bh;
      const xs = br.map((_, i) => x0 + 150 + i * gapX), xEnd = xs[xs.length - 1];
      // the main line: the cells on the left side, the other main parts on the top wire before the first branch
      const cy = (top + bot) / 2 - (cells.length * CW) / 2; let yy = top;
      cells.forEach((c, i) => { const a = cy + i * CW; parts.push(wire(x0, yy, x0, a), place(c, x0, a + CW, -90, -1)); yy = a + CW; });
      parts.push(wire(x0, yy, x0, bot));
      let x = x0;
      if (rest.length) { const a = x0 + 30; parts.push(wire(x0, top, a, top), place(rest[0], a, top, 0, -1)); x = a + CW; }
      parts.push(wire(x, top, xEnd, top), wire(x0, bot, xEnd, bot), wire(xEnd, top, xEnd, top));
      // each branch: a vertical wire from the top rail to the bottom rail with its parts, a dot at each joint
      br.forEach((b, i) => {
        const bx = xs[i], gap = (bot - top - b.length * CW) / (b.length + 1); let y = top;
        for (const [j, it] of b.entries()) { const a = top + gap + j * (CW + gap); parts.push(wire(bx, y, bx, a), place(it, bx, a, 90, 1)); meterAt.push({ part: [i, j], x: bx, y1: a, y2: a + CW, horiz: false }); y = a + CW; }
        parts.push(wire(bx, y, bx, bot));
        if (i < n - 1) parts.push(dotAt(bx, top), dotAt(bx, bot));   // the last branch is the loop's corner
      });
      parts.push(wire(xs[n - 1], top, xs[n - 1], top));
      W = xEnd + 130; H = bot + 50;
    }
    // voltmeters: a loop over (or beside) the part they measure
    for (const m of Array.isArray(d.meters) ? d.meters : []) {
      const key = JSON.stringify(m.across), at = meterAt.find(q => JSON.stringify(q.part) === key);
      if (!at) continue;
      const vm = { type: 'voltmeter', value: m.value, label: m.label };
      if (at.horiz) {
        const yv = at.y - 70, mid = (at.x1 + at.x2) / 2 - CW / 2;
        parts.push(dotAt(at.x1 - 10, at.y), dotAt(at.x2 + 10, at.y), wire(at.x1 - 10, at.y, at.x1 - 10, yv), wire(at.x2 + 10, at.y, at.x2 + 10, yv), wire(at.x1 - 10, yv, mid, yv), wire(mid + CW, yv, at.x2 + 10, yv), place(vm, mid, yv, 0, -1));
      } else {
        const xv = at.x + 70, mid = (at.y1 + at.y2) / 2 - CW / 2;
        parts.push(dotAt(at.x, at.y1 - 8), dotAt(at.x, at.y2 + 8), wire(at.x, at.y1 - 8, xv, at.y1 - 8), wire(at.x, at.y2 + 8, xv, at.y2 + 8), wire(xv, at.y1 - 8, xv, mid), wire(xv, mid + CW, xv, at.y2 + 8), place(vm, xv, mid, 90, -1));
        W = Math.max(W, xv + 80);
      }
    }
    return frame(W, H + 10, shift(0, 20, parts), { ...o, kind: 'circuit' }, o.title || 'Circuit diagram');
  },
};
/** One symbol along +x from (0, 0) to (w, 0). */
function symbol(x, P, w, ang = 0) {
  const c = P.ink, L = (x1, x2) => line(x1, 0, x2, 0, c, 2.5), m = w / 2;
  const meter = t => node('g', {}, L(0, m - 15), L(m + 15, w), node('circle', { cx: m, cy: 0, r: 15, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), node('text', { x: m, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 16, 'font-weight': 800, fill: c, transform: ang ? `rotate(${-ang} ${m} 0)` : null }, t));
  switch (x.type) {
    case 'cell': return node('g', {}, L(0, m - 4), L(m + 4, w), line(m - 4, -16, m - 4, 16, c, 2.5), line(m + 4, -8, m + 4, 8, c, 5), node('text', { x: m - 12, y: -18, 'font-size': 12, 'font-weight': 700, fill: c, 'text-anchor': 'middle' }, '+'));
    case 'battery': return node('g', {}, L(0, m - 12), L(m + 12, w), line(m - 12, -16, m - 12, 16, c, 2.5), line(m - 5, -8, m - 5, 8, c, 5), line(m + 5, -16, m + 5, 16, c, 2.5), line(m + 12, -8, m + 12, 8, c, 5), line(m - 1, 0, m + 1, 0, c, 1.5, { 'stroke-dasharray': '1 2' }), node('text', { x: m - 20, y: -18, 'font-size': 12, 'font-weight': 700, fill: c, 'text-anchor': 'middle' }, '+'));
    case 'bulb': return node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m, cy: 0, r: 14, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), line(m - 10, -10, m + 10, 10, c, 2.2), line(m - 10, 10, m + 10, -10, c, 2.2));
    case 'resistor': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -8, width: 36, height: 16, fill: P.paper, stroke: c, 'stroke-width': 2.5 }));
    case 'variable-resistor': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -8, width: 36, height: 16, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), arrowLine(m - 20, 14, m + 20, -16, c));
    case 'fuse': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -7, width: 36, height: 14, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), line(m - 18, 0, m + 18, 0, c, 2));
    case 'diode': case 'led': return node('g', {}, L(0, m - 10), L(m + 10, w), node('polygon', { points: `${m - 10},-11 ${m - 10},11 ${m + 10},0`, fill: P.paper, stroke: c, 'stroke-width': 2.2 }), line(m + 10, -11, m + 10, 11, c, 2.5),
      x.type === 'led' ? [arrowLine(m - 2, -14, m + 8, -26, c), arrowLine(m + 6, -12, m + 16, -24, c)] : null);
    case 'switch': return x.open === false
      ? node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m - 14, cy: 0, r: 3.5, fill: c }), node('circle', { cx: m + 14, cy: 0, r: 3.5, fill: c }), line(m - 14, 0, m + 14, 0, c, 2.5))
      : node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m - 14, cy: 0, r: 3.5, fill: c }), node('circle', { cx: m + 14, cy: 0, r: 3.5, fill: c }), line(m - 14, 0, m + 12, -16, c, 2.5));
    case 'ammeter': return meter('A');
    case 'voltmeter': return meter('V');
    default: return L(0, w);
  }
}
function arrowLine(x1, y1, x2, y2, c) { return arrow(x1, y1, x2, y2, { colour: c, width: 1.6, head: 7 }); }

const PHYSICS = { freeBody, vectors, inclinedPlane, pulley, rays, circuit };
const CIRCUIT_PARTS = PARTS;

// ---- figures/src/graphs.js
// Oomba Figures: graphs. A coordinate grid (points, segments and y = f(x) from a formula), motion graphs (distance,
// displacement or velocity against time, with the area under a velocity-time graph), a half-life curve and a titration
// curve. Every point is placed by its numbers on evenly spaced axes, so a graph can be read off: a gradient is a
// gradient and an area is an area.

/** Nice tick steps: 1, 2, 2.5 or 5 times a power of ten, about n ticks over the range. */
function niceStep(range, n = 8) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const okRange = r => Array.isArray(r) && r.length === 2 && isNum(r[0], -1e6, 1e6) && isNum(r[1], -1e6, 1e6) && r[1] > r[0];

/**
 * Axes on graph paper: x from xr[0] to xr[1], y from yr[0] to yr[1]. -> { X, Y (world to screen), kids, w, h }.
 * o2: { w, h (the plot's size), xstep, ystep, xlabel, ylabel, lang, origin: draw the axes through 0 (a coordinate grid)
 * rather than along the bottom and left (a science graph) }.
 */
function axes(xr, yr, o, o2 = {}) {
  const P = palette(o), lang = o.lang, w = o2.w || 420, h = o2.h || 280, L = o2.origin ? 30 : 64, T = 22, B = o2.origin ? 30 : 56, R = 26;
  const xs = o2.xstep || niceStep(xr[1] - xr[0]), ys = o2.ystep || niceStep(yr[1] - yr[0], 6);
  const X = x => L + ((x - xr[0]) / (xr[1] - xr[0])) * w, Y = y => T + h - ((y - yr[0]) / (yr[1] - yr[0])) * h;
  const kids = [];
  // the grid: fine lines at every tick, and five small squares between (graph paper) when there is room
  const fine = [];
  const minor = n => (w / ((xr[1] - xr[0]) / xs) >= 40 ? n : 1);
  const mx = minor(5), my = minor(5);
  for (let k = 0, x = xr[0]; x <= xr[1] + xs * 1e-6; k++, x = xr[0] + k * (xs / mx)) fine.push(line(X(x), T, X(x), T + h, k % mx ? P.grid : P.gridStrong, k % mx ? 0.6 : 1));
  for (let k = 0, y = yr[0]; y <= yr[1] + ys * 1e-6; k++, y = yr[0] + k * (ys / my)) fine.push(line(L, Y(y), L + w, Y(y), k % my ? P.grid : P.gridStrong, k % my ? 0.6 : 1));
  kids.push(node('g', { 'aria-hidden': 'true' }, fine));
  const ax = o2.origin && xr[0] <= 0 && xr[1] >= 0 ? X(0) : L, ay = o2.origin && yr[0] <= 0 && yr[1] >= 0 ? Y(0) : T + h;
  kids.push(line(L, ay, L + w + 8, ay, P.ink, 2), line(ax, T + h, ax, T - 8, P.ink, 2),
    node('polygon', { points: `${r2(L + w + 14)},${r2(ay)} ${r2(L + w + 4)},${r2(ay - 5)} ${r2(L + w + 4)},${r2(ay + 5)}`, fill: P.ink }),
    node('polygon', { points: `${r2(ax)},${r2(T - 14)} ${r2(ax - 5)},${r2(T - 4)} ${r2(ax + 5)},${r2(T - 4)}`, fill: P.ink }));
  // the numbers on the axes
  const dp = s => (Number.isInteger(s) ? 0 : String(s).split('.')[1].length);
  for (let k = 0, x = xr[0]; x <= xr[1] + xs * 1e-6; k++, x = xr[0] + k * xs) {
    const v = Math.round(x / xs) * xs; if (o2.origin && Math.abs(v) < 1e-9) continue;
    kids.push(line(X(v), ay - 4, X(v), ay + 4, P.ink, 1.5), label(X(v), ay + 15, fmt(v, dp(xs), lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
  }
  for (let k = 0, y = yr[0]; y <= yr[1] + ys * 1e-6; k++, y = yr[0] + k * ys) {
    const v = Math.round(y / ys) * ys; if (o2.origin && Math.abs(v) < 1e-9) continue;
    kids.push(line(ax - 4, Y(v), ax + 4, Y(v), P.ink, 1.5), label(ax - 8, Y(v), fmt(v, dp(ys), lang), { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  }
  if (o2.origin) kids.push(label(ax - 7, ay + 14, '0', { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  if (o2.xlabel) kids.push(label(L + w / 2, T + h + 40, o2.xlabel, { anchor: 'middle', size: 13, colour: P.ink }));
  if (o2.ylabel) kids.push(node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, o2.ylabel, { anchor: 'middle', size: 13, colour: P.ink })));
  if (o2.origin) kids.push(label(L + w + 10, ay - 12, o2.xname || 'x', { anchor: 'end', size: 13, italic: true, colour: P.ink }), label(ax + 10, T - 6, o2.yname || 'y', { size: 13, italic: true, colour: P.ink }));
  return { X, Y, kids, w: L + w + R, h: T + h + B };
}
const axisTitle = (name, unit) => (unit ? `${name} (${unit})` : name);

// ---------------------------------------------------------------- the coordinate grid
/**
 * { x: [lo, hi], y: [lo, hi], step?: tick step, points?: [{ x, y, label? }], segments?: [{ from: [x, y], to: [x, y] }],
 * fns?: [{ expr: '2*x + 1', label?, from?, to? }] (a formula in x: the same small safe language as the generators),
 * shapes?: [{ points: [[x, y], ...], label? }] (a closed polygon) }. hide: no points' labels, no lines (a blank grid).
 */
const grid = {
  check(d) {
    const out = [];
    if (!d || !okRange(d.x) || !okRange(d.y)) out.push('"x" and "y" must be ranges [lo, hi] with lo below hi');
    else if ((d.x[1] - d.x[0]) / (d.step || niceStep(d.x[1] - d.x[0])) > 60) out.push('too many grid lines: use a bigger "step"');
    if (d && d.step !== undefined && !isNum(d.step, 1e-6)) out.push('"step" must be a number above 0');
    for (const [i, f] of (Array.isArray(d && d.fns) ? d.fns : []).entries()) {
      const why = f && typeof f.expr === 'string' ? exprProblem(f.expr) : 'it needs "expr"';
      if (why) out.push(`fns ${i + 1}: ${why}`);
      else { try { evalExpr(f.expr, { x: (d.x[0] + d.x[1]) / 2 }); } catch (e) { if (!/finite/.test(e.message)) out.push(`fns ${i + 1}: ${e.message}`); } }
    }
    for (const [i, q] of (Array.isArray(d && d.points) ? d.points : []).entries()) if (!q || !isNum(q.x) || !isNum(q.y)) out.push(`point ${i + 1} needs numbers x and y`);
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, step = d.step || null;
    const span = Math.max(d.x[1] - d.x[0], d.y[1] - d.y[0]), S = 400 / span;   // the same scale both ways: a square is a square
    const A = axes(d.x, d.y, o, { w: (d.x[1] - d.x[0]) * S, h: (d.y[1] - d.y[0]) * S, xstep: step, ystep: step, origin: true, xname: text(d.xname, 6), yname: text(d.yname, 6) });
    const kids = [...A.kids], blank = o.hide === true;
    const inX = x => x >= d.x[0] - 1e-9 && x <= d.x[1] + 1e-9, inY = y => y >= d.y[0] - 1e-9 && y <= d.y[1] + 1e-9;
    if (!blank) {
      (d.shapes || []).forEach((s, i) => { if (Array.isArray(s.points) && s.points.length >= 3) kids.push(node('polygon', { points: s.points.map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.6, stroke: seriesColour(o, i), 'stroke-width': 2.5 })); });
      (d.fns || []).forEach((f, i) => {
        const a = isNum(f.from) ? f.from : d.x[0], b = isNum(f.to) ? f.to : d.x[1], runs = [[]];
        for (let k = 0; k <= 240; k++) {
          const x = a + ((b - a) * k) / 240; let y;
          try { y = evalExpr(f.expr, { x }); } catch (e) { y = NaN; }
          if (Number.isFinite(y) && inY(y)) runs[runs.length - 1].push([A.X(x), A.Y(y)]); else if (runs[runs.length - 1].length) runs.push([]);
        }
        for (const r of runs) if (r.length > 1) kids.push(poly(r, { stroke: seriesColour(o, i), 'stroke-width': 3 }));
        // its name in a small key at the top left (two lines can leave the grid side by side)
        if (text(f.label, 24)) { const ky = 34 + i * 20, kx = A.X(d.x[0]) + 10; kids.push(node('rect', { x: kx - 4, y: ky - 9, width: 14 + text(f.label, 24).length * 8, height: 18, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), line(kx, ky, kx + 14, ky, seriesColour(o, i), 3.5), label(kx + 20, ky, text(f.label, 24), { size: 13, italic: true, colour: seriesColour(o, i) })); }
      });
      (d.segments || []).forEach((s, i) => { if (Array.isArray(s.from) && Array.isArray(s.to)) kids.push(line(A.X(s.from[0]), A.Y(s.from[1]), A.X(s.to[0]), A.Y(s.to[1]), seriesColour(o, i + 2), 3)); });
    }
    for (const q of d.points || []) {
      if (!inX(q.x) || !inY(q.y)) continue;
      kids.push(node('circle', { cx: A.X(q.x), cy: A.Y(q.y), r: 5, fill: P.red, stroke: P.paper, 'stroke-width': 1.5 }));
      if (!blank && !hides(o, 'labels')) {
        const t = text(q.label, 16), coords = q.coords ? `(${fmt(q.x, 2, lang)}, ${fmt(q.y, 2, lang)})` : '';
        const words = [t, coords].filter(Boolean).join(' ');
        if (words) kids.push(label(A.X(q.x) + 8, A.Y(q.y) - 12, words, { size: 13, colour: P.ink, halo: P.paper }));
      }
    }
    return frame(A.w, A.h, kids, { ...o, kind: 'grid' }, o.title || 'Coordinate grid');
  },
};

// ---------------------------------------------------------------- motion graphs
const MOTION = { 'distance-time': 'distance', 'displacement-time': 'displacement', 'velocity-time': 'velocity' };
/**
 * { type: 'distance-time' | 'displacement-time' | 'velocity-time', points: [[t, y], ...] (joined by straight lines; t
 * goes up), tmax?, ymin?, ymax?, xstep?, ystep?, tunit?: 's', yunit?: 'm' | 'm/s', xlabel?, ylabel?, shade?: true (the
 * area under a velocity-time graph: the distance), marks?: [index, ...] (letters A, B, C at those points) }. hide: the
 * axes and grid only, for plotting (or 'line': the same; 'area': no shading).
 */
const motionGraph = {
  check(d) {
    const out = [];
    if (!d || !MOTION[d.type]) out.push(`"type" must be one of ${Object.keys(MOTION).join(', ')}`);
    const pts = d && Array.isArray(d.points) ? d.points : null;
    if (!pts || pts.length < 2 || pts.length > 20 || pts.some(q => !Array.isArray(q) || !isNum(q[0], 0, 1e6) || !isNum(q[1], -1e6, 1e6))) out.push('"points" must list 2 to 20 points [t, value] with t 0 or more');
    else if (pts.some((q, i) => i && q[0] <= pts[i - 1][0])) out.push('the times in "points" must go up');
    else if (d.type === 'distance-time' && pts.some((q, i) => q[1] < 0 || (i && q[1] < pts[i - 1][1] - 1e-9))) out.push('a distance-time graph never goes down (and never below 0): use displacement-time for coming back');
    return out;
  },
  /** The area under the line from t = a to t = b (a velocity-time graph: the distance travelled, by the trapezium rule,
   *  exact for straight pieces). */
  area(d, a = d.points[0][0], b = d.points[d.points.length - 1][0]) {
    let s = 0;
    for (let i = 1; i < d.points.length; i++) {
      const [t0, v0] = d.points[i - 1], [t1, v1] = d.points[i], lo = Math.max(a, t0), hi = Math.min(b, t1);
      if (hi <= lo) continue;
      const at = t => v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      s += ((at(lo) + at(hi)) / 2) * (hi - lo);
    }
    return s;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), pts = d.points;
    const tmax = isNum(d.tmax) ? d.tmax : pts[pts.length - 1][0], vals = pts.map(q => q[1]);
    const ymax = isNum(d.ymax) ? d.ymax : Math.max(...vals) * 1.15 || 1, ymin = isNum(d.ymin) ? d.ymin : Math.min(0, ...vals) * 1.15;
    const A = axes([0, tmax], [ymin, ymax], o, { xstep: d.xstep, ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.tunit, 8) || 's'),
      ylabel: text(d.ylabel, 40) || axisTitle(W(MOTION[d.type]), text(d.yunit, 8) || (d.type === 'velocity-time' ? 'm/s' : 'm')), origin: ymin < 0 });
    const kids = [...A.kids], blank = o.hide === true || hides(o, 'line');
    if (!blank) {
      if (d.shade && d.type === 'velocity-time' && !hides(o, 'area')) kids.push(node('polygon', { points: [[pts[0][0], 0], ...pts, [pts[pts.length - 1][0], 0]].map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.85, stroke: 'none' }));
      kids.push(poly(pts.map(q => [A.X(q[0]), A.Y(q[1])]), { stroke: P.green, 'stroke-width': 3.5 }));
      (Array.isArray(d.marks) ? d.marks : []).forEach((i, k) => { const q = pts[i]; if (q) kids.push(node('circle', { cx: A.X(q[0]), cy: A.Y(q[1]), r: 4.5, fill: P.ink }), label(A.X(q[0]) + 6, A.Y(q[1]) - 13, String.fromCharCode(65 + k), { size: 14, colour: P.ink, halo: P.paper })); });
    }
    return frame(A.w, A.h, kids, { ...o, kind: 'motionGraph' }, o.title || 'Motion graph');
  },
};

// ---------------------------------------------------------------- half-life
/**
 * { halfLife: T (> 0), start?: N0 (default 100), tmax?: (default 4 T, at most 8 T), unit?: 'days', yunit?: '%' |
 * 'counts/min' | ..., ylabel?, xlabel?, marks?: true (dashed lines at each half-life: N0/2 at T, N0/4 at 2T...) }.
 * N(t) = N0 × (1/2)^(t / T). hide: no dashed lines (the student reads the half-life off the curve).
 */
const halfLife = {
  check(d) {
    const out = [];
    if (!d || !isNum(d.halfLife, 1e-6, 1e9)) out.push('"halfLife" must be a number above 0');
    if (d && d.start !== undefined && !isNum(d.start, 1e-6, 1e12)) out.push('"start" must be a number above 0');
    if (d && d.tmax !== undefined && !(isNum(d.tmax, 0) && d.tmax > 0 && d.tmax <= 8 * d.halfLife)) out.push('"tmax" must be above 0 and at most 8 half-lives');
    return out;
  },
  at: (d, t) => (d.start ?? 100) * 0.5 ** (t / d.halfLife),
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), T = d.halfLife, N0 = d.start ?? 100, tmax = d.tmax ?? 4 * T;
    const A = axes([0, tmax], [0, N0 * 1.1], o, { xstep: d.xstep || niceStep(tmax, 8), ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.unit, 10)), ylabel: text(d.ylabel, 40) || axisTitle(W('remaining'), text(d.yunit, 12)) });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 200; k++) { const t = (tmax * k) / 200; pts.push([A.X(t), A.Y(halfLife.at(d, t))]); }
    if (d.marks !== false && !hides(o, 'marks') && o.hide !== true) {
      for (let n = 1; n * T <= tmax + 1e-9 && n <= 4; n++) {
        const y = N0 / 2 ** n;
        kids.push(line(A.X(0), A.Y(y), A.X(n * T), A.Y(y), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(n * T), A.Y(y), A.X(n * T), A.Y(0), P.red, 1.6, { 'stroke-dasharray': '6 5' }));
      }
      kids.push(label(A.X(T) + 6, A.Y(N0 / 2) - 12, `${W('halfLife')} = ${fmt(T, 2, o.lang)}${d.unit ? ` ${text(d.unit, 10)}` : ''}`, { size: 13, colour: P.red, halo: P.paper }));
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'halfLife' }, o.title || 'Half-life curve');
  },
};

// ---------------------------------------------------------------- titration
/**
 * { acid: 'strong' | 'weak', base: 'strong' | 'weak', flask?: 'acid' (the base is added from the burette; default) |
 * 'base', ca?: mol/dm³ (0.1), cb?: (0.1), v0?: cm³ in the flask (25), vmax?: cm³ added (2 × the equivalence volume),
 * pKa?: 4.76 (a weak acid), pKb?: 4.75 (a weak base), marks?: true (the equivalence point; a weak acid's or base's half
 * way point, where pH = pKa) }. The pH at each volume comes from the charge balance solved exactly ([H+] by bisection,
 * Kw = 1e-14), so the start, the buffer region, the jump and the equivalence pH (7, above 7 or below 7) are where the
 * chemistry puts them. hide: no marks.
 */
const titration = {
  check(d) {
    const out = [];
    if (!d || !['strong', 'weak'].includes(d.acid) || !['strong', 'weak'].includes(d.base)) out.push('"acid" and "base" must each be "strong" or "weak"');
    else if (d.acid === 'weak' && d.base === 'weak') out.push('a weak acid with a weak base has no sharp end point: use a strong one for one of them');
    for (const k of ['ca', 'cb']) if (d && d[k] !== undefined && !isNum(d[k], 0.001, 5)) out.push(`"${k}" must be a concentration from 0.001 to 5`);
    if (d && d.v0 !== undefined && !isNum(d.v0, 1, 500)) out.push('"v0" must be a volume from 1 to 500');
    if (d && d.pKa !== undefined && !isNum(d.pKa, 1, 13)) out.push('"pKa" must be from 1 to 13');
    if (d && d.pKb !== undefined && !isNum(d.pKb, 1, 13)) out.push('"pKb" must be from 1 to 13');
    if (d && d.flask !== undefined && !['acid', 'base'].includes(d.flask)) out.push('"flask" must be "acid" or "base"');
    return out;
  },
  /** The equivalence volume (cm³ added from the burette). */
  veq: d => (d.flask === 'base' ? ((d.cb ?? 0.1) * (d.v0 ?? 25)) / (d.ca ?? 0.1) : ((d.ca ?? 0.1) * (d.v0 ?? 25)) / (d.cb ?? 0.1)),
  /** The pH after v cm³ from the burette. */
  pH(d, v) {
    const v0 = d.v0 ?? 25, ca = d.ca ?? 0.1, cb = d.cb ?? 0.1, Kw = 1e-14;
    const acidIn = d.flask !== 'base', Vt = v0 + v;
    const CA = acidIn ? (ca * v0) / Vt : (ca * v) / Vt, CB = acidIn ? (cb * v) / Vt : (cb * v0) / Vt;
    const Ka = d.acid === 'strong' ? 1e8 : 10 ** -(d.pKa ?? 4.76), Kb = d.base === 'strong' ? 1e8 : 10 ** -(d.pKb ?? 4.75);
    // charge balance: [H+] + [BH+] = [OH-] + [A-]; [A-] = CA Ka/(Ka + h), [BH+] = CB Kb h /(Kb h + Kw) (= CB for a strong base)
    const f = h => h + (CB * Kb * h) / (Kb * h + Kw) - Kw / h - (CA * Ka) / (Ka + h);
    let lo = -15, hi = 1;   // log10 [H+]; f grows with h
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(10 ** m) > 0) hi = m; else lo = m; }
    return -(lo + hi) / 2;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), ve = titration.veq(d), vmax = d.vmax ?? Math.min(100, 2 * ve);
    const A = axes([0, vmax], [0, 14], o, { ystep: 2, xstep: d.xstep, xlabel: text(d.xlabel, 50) || axisTitle(W('volumeAdded'), 'cm³'), ylabel: text(d.ylabel, 30) || 'pH' });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 400; k++) { const v = (vmax * k) / 400; pts.push([A.X(v), A.Y(Math.max(0, Math.min(14, titration.pH(d, v))))]); }
    if (d.marks !== false && o.hide !== true && !hides(o, 'marks')) {
      const pe = titration.pH(d, ve);
      kids.push(line(A.X(ve), A.Y(0), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(0), A.Y(pe), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }),
        node('circle', { cx: A.X(ve), cy: A.Y(pe), r: 5, fill: P.red }), label(A.X(ve) + 9, A.Y(pe) + (pe > 7 ? 16 : -14), `${W('eqPoint')}: pH ${fmt(pe, 1, o.lang)}`, { size: 13, colour: P.red, halo: P.paper }));
      // the half-way point (pH = pKa) means something only when the weak acid or weak base is the one in the flask
      if ((d.flask !== 'base' && d.acid === 'weak') || (d.flask === 'base' && d.base === 'weak')) {
        const ph = titration.pH(d, ve / 2);
        kids.push(node('circle', { cx: A.X(ve / 2), cy: A.Y(ph), r: 4.5, fill: P.blue }), label(A.X(ve / 2) - 8, A.Y(ph) - 14, `pH ${fmt(ph, 2, o.lang)} = ${d.acid === 'weak' ? 'pKa' : '14 − pKb'}`, { anchor: 'end', size: 12, colour: P.blue, halo: P.paper }));
      }
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'titration' }, o.title || 'Titration curve');
  },
};

const GRAPHS = { grid, motionGraph, halfLife, titration };

// ---- figures/src/chem.js
// Oomba Figures: chemistry. Bohr models, orbital box diagrams, Lewis structures (drawn here, plain SVG) and skeletal
// structures from SMILES (drawn by SmilesDrawer, MIT, in the browser: index.js structure()). Electron counts come from
// the element table and the filling rules, never from the drawing, and check() refuses data that breaks them.

// Z -> [symbol, mass number of the commonest isotope, valence electrons (main groups; 0 where it is not used)]
const ELEMENTS = [null,
  ['H', 1, 1], ['He', 4, 2], ['Li', 7, 1], ['Be', 9, 2], ['B', 11, 3], ['C', 12, 4], ['N', 14, 5], ['O', 16, 6], ['F', 19, 7], ['Ne', 20, 8],
  ['Na', 23, 1], ['Mg', 24, 2], ['Al', 27, 3], ['Si', 28, 4], ['P', 31, 5], ['S', 32, 6], ['Cl', 35, 7], ['Ar', 40, 8], ['K', 39, 1], ['Ca', 40, 2],
  ['Sc', 45, 0], ['Ti', 48, 0], ['V', 51, 0], ['Cr', 52, 0], ['Mn', 55, 0], ['Fe', 56, 0], ['Co', 59, 0], ['Ni', 58, 0], ['Cu', 63, 0], ['Zn', 64, 0],
  ['Ga', 69, 3], ['Ge', 74, 4], ['As', 75, 5], ['Se', 80, 6], ['Br', 79, 7], ['Kr', 84, 8],
];
const MAX_Z = ELEMENTS.length - 1;
/** 'Na' | 11 -> 11, or 0. */
function zOf(el) {
  if (Number.isInteger(el) && el >= 1 && el <= MAX_Z) return el;
  const s = String(el || '').trim();
  const i = ELEMENTS.findIndex(e => e && e[0] === s);
  return i > 0 ? i : 0;
}
const elOf = d => zOf(d && (d.element ?? d.Z));
const chargeOf = d => (d && Number.isInteger(d.charge) ? d.charge : 0);
const supNum = n => (n === 0 ? '' : `${Math.abs(n) === 1 ? '' : Math.abs(n)}${n > 0 ? '+' : '−'}`);

// ---------------------------------------------------------------- Bohr model
/** The school model's shells: 2, then 8, 8, 2 (up to 20 electrons). */
function bohrShells(e) {
  const out = [];
  for (const cap of [2, 8, 8, 2]) { if (e <= 0) break; out.push(Math.min(cap, e)); e -= cap; }
  return e > 0 ? null : out;
}
/**
 * { element: 'Na' | Z (1 to 20; up to 36 with "shells"), charge?: an ion's charge (Na+ is 1, Cl− is −1), shells?:
 * [2, 8, 1] (only to override the school rule, e.g. for Z above 20), nucleus?: true (protons and neutrons: the
 * commonest isotope) }. The electrons on each shell are spaced out the usual way: one at a time at the top, bottom,
 * right and left, then in pairs. hide (or 'electrons'): the shells are drawn empty; 'nucleus': "? p, ? n".
 */
const bohr = {
  check(d) {
    const out = [], Z = elOf(d), q = chargeOf(d);
    if (!Z) out.push(`"element" must be a symbol from H to ${ELEMENTS[MAX_Z][0]} (or "Z", 1 to ${MAX_Z})`);
    if (d && d.charge !== undefined && !Number.isInteger(d.charge)) out.push('"charge" must be a whole number (Na+ is 1, O2− is −2)');
    if (!Z) return out;
    const e = Z - q;
    if (e < 0 || q < -3 || q > 3) out.push('the charge is too big for this element');
    else if (Array.isArray(d.shells)) {
      const s = d.shells;
      if (!s.length || s.length > 4 || s.some(x => !Number.isInteger(x) || x < 1)) out.push('"shells" must list 1 to 4 whole numbers, each at least 1');
      else if (s.reduce((a, b) => a + b, 0) !== e) out.push(`"shells" adds up to ${s.reduce((a, b) => a + b, 0)}, but ${ELEMENTS[Z][0]}${supNum(q)} has ${e} electrons`);
      else if (s.some((x, i) => x > 2 * (i + 1) ** 2)) out.push('a shell has more electrons than it can hold (2, 8, 18, 32)');
      else if (s[s.length - 1] > 8 && s.length > 1) out.push('the outer shell has more than 8 electrons');
    } else if (!bohrShells(e)) out.push(`${ELEMENTS[Z][0]}${supNum(q)} has ${e} electrons: the school model is for up to 20; give "shells" for more`);
    return out;
  },
  /** The electrons on each shell, as drawn. */
  shells: d => (Array.isArray(d.shells) ? d.shells.slice() : bohrShells(elOf(d) - chargeOf(d))),
  /** Where the k-th of n electrons sits on a shell (degrees, 0 = right, 90 = top). */
  slots(n, shell) {
    if (shell === 0) return n === 1 ? [90] : [90, 270];
    if (n > 8) return Array.from({ length: n }, (_, i) => 90 - (360 * i) / n);
    const base = [90, 270, 0, 180], out = [];
    for (let i = 0; i < n; i++) out.push(base[i % 4] + (n > 4 + (i % 4) ? (i < 4 ? 11 : -11) : 0));
    return out;
  },
  draw(d, o) {
    const P = palette(o), Z = elOf(d), q = chargeOf(d), shells = bohr.shells(d), [sym, A] = ELEMENTS[Z];
    const noE = o.hide === true || hides(o, 'electrons'), R0 = 34, gap = 30, Rmax = R0 + gap * shells.length, C = Rmax + 26;
    const kids = [];
    shells.forEach((n, i) => {
      const r = R0 + gap * (i + 1);
      kids.push(node('circle', { cx: C, cy: C, r, fill: 'none', stroke: P.gridStrong, 'stroke-width': 2 }));
      if (!noE) for (const a of bohr.slots(n, i)) {
        const t = (a * Math.PI) / 180;
        kids.push(node('circle', { cx: r2(C + r * Math.cos(t)), cy: r2(C - r * Math.sin(t)), r: 6.5, fill: P.blue, stroke: P.paper, 'stroke-width': 1.5, class: 'of-e' }));
      }
    });
    const hideN = hides(o, 'nucleus');
    kids.push(node('circle', { cx: C, cy: C, r: R0 - 4, fill: P.fill, stroke: P.green, 'stroke-width': 2.5 }),
      label(C, C - 8, hideN ? '? p' : `${Z} p`, { anchor: 'middle', size: 13, colour: P.greenInk }),
      label(C, C + 9, hideN ? '? n' : `${A - Z} n`, { anchor: 'middle', size: 13, colour: P.greenInk }));
    const name = `${sym}${q ? supNum(q) : ''}`;
    kids.push(label(C, 2 * C + 6, name, { anchor: 'middle', size: 20, weight: 800, colour: P.ink }));
    if (q) kids.push(line(10, 10, 4, 10, P.ink, 2.5), line(4, 10, 4, 2 * C - 10, P.ink, 2.5), line(4, 2 * C - 10, 10, 2 * C - 10, P.ink, 2.5),
      line(2 * C - 10, 10, 2 * C - 4, 10, P.ink, 2.5), line(2 * C - 4, 10, 2 * C - 4, 2 * C - 10, P.ink, 2.5), line(2 * C - 4, 2 * C - 10, 2 * C - 10, 2 * C - 10, P.ink, 2.5),
      label(2 * C + 2, 14, supNum(q), { size: 18, colour: P.ink }));
    return frame(2 * C + (q ? 30 : 0), 2 * C + 24, kids, { ...o, kind: 'bohr' }, o.title || `Bohr model of ${name}`);
  },
};

// ---------------------------------------------------------------- orbital box diagram
const SUBS = [['1s', 1], ['2s', 1], ['2p', 3], ['3s', 1], ['3p', 3], ['4s', 1], ['3d', 5], ['4p', 3]];
const CAP = k => 2 * k;
/** Electrons in each subshell, in filling order: { '1s': 2, ... }. Cr and Cu take one 4s electron into 3d (half full
 *  and full d). An ion loses its outermost electrons first (4p, then 4s, then 3d) and an anion gains them in order. */
function configOf(Z, q = 0) {
  const fill = e => { const out = {}; for (const [s, k] of SUBS) { if (e <= 0) break; out[s] = Math.min(CAP(k), e); e -= CAP(k); } return out; };
  const c = fill(q < 0 ? Z - q : Z);
  if (Z === 24 || Z === 29) { c['4s'] = 1; c['3d'] = Z === 24 ? 5 : 10; }
  if (q > 0) {
    let left = q;
    const order = Object.keys(c).sort((a, b) => +b[0] - +a[0] || 'spdf'.indexOf(b[1]) - 'spdf'.indexOf(a[1]));
    for (const s of order) { const take = Math.min(c[s], left); c[s] -= take; left -= take; if (!left) break; }
    for (const s of Object.keys(c)) if (!c[s]) delete c[s];
  }
  return c;
}
/** "1s² 2s² 2p⁴" (in filling order). */
function configText(c) {
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return SUBS.filter(([s]) => c[s]).map(([s]) => `${s}${String(c[s]).split('').map(x => SUP[x]).join('')}`).join(' ');
}
/** Hund's rule: one up arrow in each box first, then the down arrows. -> [[up, down], ...] per box. */
function boxesOf(n, k) { const out = Array.from({ length: k }, () => [false, false]); for (let i = 0; i < n; i++) { if (i < k) out[i][0] = true; else out[i - k][1] = true; } return out; }
/**
 * { element: 'O' | Z (1 to 36), charge?: an ion's charge, config?: true (write the configuration under the boxes) }.
 * hide (or 'arrows'): the boxes are empty and the configuration is blank, for the student to fill.
 */
const orbitals = {
  check(d) {
    const out = [], Z = elOf(d), q = chargeOf(d);
    if (!Z) out.push(`"element" must be a symbol from H to ${ELEMENTS[MAX_Z][0]} (or "Z", 1 to ${MAX_Z})`);
    if (d && d.charge !== undefined && !Number.isInteger(d.charge)) out.push('"charge" must be a whole number');
    if (Z && (Z - q < 0 || Z - q > MAX_Z || Math.abs(q) > 3)) out.push('that ion cannot be drawn here (too many or too few electrons)');
    return out;
  },
  draw(d, o) {
    const P = palette(o), Z = elOf(d), q = chargeOf(d), c = configOf(Z, q), blank = o.hide === true || hides(o, 'arrows');
    const last = Math.max(...SUBS.map(([s], i) => (c[s] ? i : -1)), 0), list = SUBS.slice(0, last + 1);
    const B = 34, kids = [];
    let x = 14;
    for (const [s, k] of list) {
      const boxes = boxesOf(c[s] || 0, k);
      kids.push(label(x + (k * B) / 2, 80, s, { anchor: 'middle', size: 15, colour: P.ink }));
      boxes.forEach((b, i) => {
        const bx = x + i * B;
        kids.push(node('rect', { x: bx, y: 22, width: B, height: B + 6, fill: P.paper, stroke: P.ink, 'stroke-width': 2 }));
        if (!blank) {
          if (b[0]) kids.push(arrowUD(bx + B / 2 - 6, 22, B + 6, true, P.blue));
          if (b[1]) kids.push(arrowUD(bx + B / 2 + 6, 22, B + 6, false, P.red));
        }
      });
      x += k * B + 16;
    }
    const W = Math.max(x, 220), name = `${ELEMENTS[Z][0]}${supNum(q)}`;
    kids.push(label(14, 108, blank ? `${name}: ____________` : `${name}: ${configText(c)}`, { size: 15, colour: P.ink }));
    return frame(W, 124, kids, { ...o, kind: 'orbitals' }, o.title || `Orbital diagram of ${name}`);
  },
};
function arrowUD(x, y, h, up, c) {
  const t = y + 7, b = y + h - 7;
  return node('g', {}, line(x, t, x, b, c, 2.5), up ? node('polygon', { points: `${x},${t - 2} ${x - 5},${t + 8} ${x + 5},${t + 8}`, fill: c }) : node('polygon', { points: `${x},${b + 2} ${x - 5},${b - 8} ${x + 5},${b - 8}`, fill: c }));
}

// ---------------------------------------------------------------- Lewis structures
// Ready ones (x and y in bond lengths, y up): every atom's electrons and the total were checked by check() in the tests.
const A = (el, x, y, lone = 0) => ({ el, x, y, lone });
const Bd = (a, b, order = 1) => ({ a, b, order });
const MOLECULES = {
  H2: { atoms: [A('H', 0, 0), A('H', 1, 0)], bonds: [Bd(0, 1)] },
  F2: { atoms: [A('F', 0, 0, 3), A('F', 1.2, 0, 3)], bonds: [Bd(0, 1)] },
  Cl2: { atoms: [A('Cl', 0, 0, 3), A('Cl', 1.3, 0, 3)], bonds: [Bd(0, 1)] },
  O2: { atoms: [A('O', 0, 0, 2), A('O', 1.2, 0, 2)], bonds: [Bd(0, 1, 2)] },
  N2: { atoms: [A('N', 0, 0, 1), A('N', 1.2, 0, 1)], bonds: [Bd(0, 1, 3)] },
  HCl: { atoms: [A('H', 0, 0), A('Cl', 1.2, 0, 3)], bonds: [Bd(0, 1)] },
  HF: { atoms: [A('H', 0, 0), A('F', 1.1, 0, 3)], bonds: [Bd(0, 1)] },
  H2O: { atoms: [A('O', 0, 0, 2), A('H', -0.85, -0.6), A('H', 0.85, -0.6)], bonds: [Bd(0, 1), Bd(0, 2)] },
  NH3: { atoms: [A('N', 0, 0, 1), A('H', -1, -0.35), A('H', 1, -0.35), A('H', 0, -1.05)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)] },
  CH4: { atoms: [A('C', 0, 0), A('H', 0, 1), A('H', 1, 0), A('H', 0, -1), A('H', -1, 0)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CCl4: { atoms: [A('C', 0, 0), A('Cl', 0, 1.3, 3), A('Cl', 1.3, 0, 3), A('Cl', 0, -1.3, 3), A('Cl', -1.3, 0, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CO2: { atoms: [A('O', -1.2, 0, 2), A('C', 0, 0), A('O', 1.2, 0, 2)], bonds: [Bd(0, 1, 2), Bd(1, 2, 2)] },
  HCN: { atoms: [A('H', -1.1, 0), A('C', 0, 0), A('N', 1.2, 0, 1)], bonds: [Bd(0, 1), Bd(1, 2, 3)] },
  C2H4: { atoms: [A('C', -0.6, 0), A('C', 0.6, 0), A('H', -1.3, 0.75), A('H', -1.3, -0.75), A('H', 1.3, 0.75), A('H', 1.3, -0.75)], bonds: [Bd(0, 1, 2), Bd(0, 2), Bd(0, 3), Bd(1, 4), Bd(1, 5)] },
  C2H2: { atoms: [A('H', -1.7, 0), A('C', -0.6, 0), A('C', 0.6, 0), A('H', 1.7, 0)], bonds: [Bd(0, 1), Bd(1, 2, 3), Bd(2, 3)] },
  NH4: { atoms: [A('N', 0, 0), A('H', 0, 1), A('H', 1, 0), A('H', 0, -1), A('H', -1, 0)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)], charge: 1 },
  OH: { atoms: [A('O', 0, 0, 3), A('H', 1.1, 0)], bonds: [Bd(0, 1)], charge: -1 },
};
const lewisOf = d => (d && typeof d.molecule === 'string' && MOLECULES[d.molecule.replace(/[+−-]$/, '')] ? MOLECULES[d.molecule.replace(/[+−-]$/, '')] : d);
/**
 * { molecule: 'H2O' (one of MOLECULES) } or your own { atoms: [{ el, x, y, lone: lone pairs }], bonds: [{ a, b, order:
 * 1 | 2 | 3 }], charge?: the ion's charge }. Bonds are lines (style 'dots': each shared pair as two dots); lone pairs
 * are pairs of dots on the free sides of the atom. check(): hydrogen has 2 electrons, every other atom 8, and the
 * electrons add up to the atoms' valence electrons minus the charge. hide: 'lone' (no lone pairs) or true (the atoms
 * only, for the student to finish).
 */
const lewis = {
  check(d0) {
    const out = [], d = lewisOf(d0);
    if (d0 && typeof d0.molecule === 'string' && d === d0) return [`unknown "molecule" (ready ones: ${Object.keys(MOLECULES).join(', ')}); or give "atoms" and "bonds"`];
    const atoms = d && Array.isArray(d.atoms) ? d.atoms : null, bonds = d && Array.isArray(d.bonds) ? d.bonds : [];
    if (!atoms || atoms.length < 1 || atoms.length > 12) return ['"atoms" must list 1 to 12 atoms { el, x, y, lone }'];
    atoms.forEach((a, i) => {
      const Z = zOf(a && a.el);
      if (!Z || !ELEMENTS[Z][2]) out.push(`atom ${i + 1}: "el" must be a main-group element symbol`);
      if (!a || !isNum(a.x, -10, 10) || !isNum(a.y, -10, 10)) out.push(`atom ${i + 1} needs "x" and "y" (bond lengths)`);
      if (a && a.lone !== undefined && !(Number.isInteger(a.lone) && a.lone >= 0 && a.lone <= 4)) out.push(`atom ${i + 1}: "lone" is its lone pairs, 0 to 4`);
    });
    bonds.forEach((b, i) => { if (!b || !atoms[b.a] || !atoms[b.b] || b.a === b.b || ![1, 2, 3].includes(b.order ?? 1)) out.push(`bond ${i + 1} must be { a, b, order: 1, 2 or 3 } between two different atoms`); });
    if (out.length) return out;
    const q = Number.isInteger(d.charge) ? d.charge : 0;
    let total = 0, drawn = 0;
    atoms.forEach((a, i) => {
      const Z = zOf(a.el), shared = bonds.filter(b => b.a === i || b.b === i).reduce((s, b) => s + (b.order ?? 1), 0), mine = 2 * shared + 2 * (a.lone || 0);
      total += ELEMENTS[Z][2]; drawn += 2 * (a.lone || 0);
      const want = Z <= 2 ? 2 : 8;
      if (mine !== want && !d.expanded) out.push(`atom ${i + 1} (${a.el}) has ${mine} electrons around it; it needs ${want}`);
    });
    drawn += 2 * bonds.reduce((s, b) => s + (b.order ?? 1), 0);
    if (drawn !== total - q) out.push(`the structure shows ${drawn} electrons, but the atoms bring ${total - q} (valence electrons${q ? ' minus the charge' : ''})`);
    return out;
  },
  draw(d0, o) {
    const P = palette(o), d = lewisOf(d0), q = Number.isInteger(d.charge) ? d.charge : Number.isInteger(d0.charge) ? d0.charge : 0;
    const S = 64, xs = d.atoms.map(a => a.x), ys = d.atoms.map(a => a.y);
    const x0 = Math.min(...xs), y1 = Math.max(...ys), M = 46;
    const X = x => M + (x - x0) * S, Y = y => M + (y1 - y) * S;
    const W = (Math.max(...xs) - x0) * S + 2 * M + (q ? 30 : 0), H = (y1 - Math.min(...ys)) * S + 2 * M;
    const kids = [], atomsOnly = o.hide === true, noLone = atomsOnly || hides(o, 'lone'), dots = d0.style === 'dots' || d.style === 'dots';
    for (const b of atomsOnly ? [] : d.bonds) {
      const A1 = d.atoms[b.a], A2 = d.atoms[b.b], ax = X(A1.x), ay = Y(A1.y), bx = X(A2.x), by = Y(A2.y), len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, px = -uy, py = ux;
      const k = b.order ?? 1, sh = 17;
      if (dots) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        for (let j = 0; j < k; j++) { const off = (j - (k - 1) / 2) * 9; for (const s of [-4, 4]) kids.push(node('circle', { cx: r2(mx + px * off + ux * s), cy: r2(my + py * off + uy * s), r: 3, fill: P.ink })); }
      } else for (let j = 0; j < k; j++) {
        const off = (j - (k - 1) / 2) * 7;
        kids.push(line(ax + ux * sh + px * off, ay + uy * sh + py * off, bx - ux * sh + px * off, by - uy * sh + py * off, P.ink, 2.6));
      }
    }
    d.atoms.forEach((a, i) => {
      const cx = X(a.x), cy = Y(a.y);
      kids.push(label(cx, cy + 1, a.el, { anchor: 'middle', size: 26, weight: 800, colour: P.ink }));
      if (noLone || !a.lone) return;
      // the bonds' directions from this atom; each lone pair goes to the free side furthest from them
      const used = d.bonds.filter(b => b.a === i || b.b === i).map(b => { const o2 = d.atoms[b.a === i ? b.b : b.a]; return Math.atan2(-(o2.y - a.y), o2.x - a.x); });
      // all the lone pairs together: the set of free sides that keeps every pair and bond furthest apart (ties: the
      // top, bottom and sides first)
      const cand = [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
      const gap = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
      let best = null, bestScore = -1;
      const pick = (from, chosen) => {
        if (chosen.length === a.lone) {
          const all = [...used, ...chosen]; let m = 9;
          for (let i2 = 0; i2 < all.length; i2++) for (let j = i2 + 1; j < all.length; j++) m = Math.min(m, gap(all[i2], all[j]));
          const score = m * 100 - chosen.reduce((t, c) => t + cand.indexOf(c), 0) * 0.01;
          if (score > bestScore + 1e-9) { bestScore = score; best = chosen; }
          return;
        }
        for (let i2 = from; i2 < cand.length; i2++) pick(i2 + 1, [...chosen, cand[i2]]);
      };
      pick(0, []);
      for (const dir of best || []) {
        const ux = Math.cos(dir), uy = Math.sin(dir), r = (a.el.length > 1 ? 25 : 22) + (Math.abs(ux) > 0.2 && Math.abs(uy) > 0.2 ? 4 : 0);
        for (const sgn of [-5, 5]) kids.push(node('circle', { cx: r2(cx + ux * r - uy * sgn), cy: r2(cy + uy * r + ux * sgn), r: 3, fill: P.blue, class: 'of-lone' }));
      }
    });
    if (q) kids.push(label(6, H / 2, '[', { size: 56, weight: 300, colour: P.ink }), label(W - 34, H / 2, ']', { size: 56, weight: 300, colour: P.ink }), label(W - 20, 18, supNum(q), { size: 18, colour: P.ink }));
    return frame(W, H, kids, { ...o, kind: 'lewis' }, o.title || 'Lewis structure');
  },
};

const CHEM = { bohr, orbitals, lewis };

// ---- figures/src/readings.js
// Oomba Figures: reading a scale. A thermometer, a measuring cylinder (read at the bottom of the meniscus) and a spring
// balance (newton meter). The scale is evenly spaced from min to max with a tick every "step" and a number every
// "major"; the liquid, the meniscus or the pointer sits exactly at the value. hide: the reading under the figure is a
// blank line (the student writes it).

const TYPES = ['thermometer', 'cylinder', 'spring'];
const UNITS = { thermometer: '°C', cylinder: 'mL', spring: 'N' };
const near = (x, s) => Math.abs(x / s - Math.round(x / s)) < 1e-6;
/**
 * { type: 'thermometer' | 'cylinder' | 'spring', value, min, max, step (one small tick), major? (a numbered tick;
 * default 5 or 10 steps), unit? (°C, mL, N) }. The value must be on the scale and on a tick or half way between two
 * (what a student can read).
 */
const reading = {
  check(d) {
    const out = [];
    if (!d || !TYPES.includes(d.type)) return [`"type" must be one of ${TYPES.join(', ')}`];
    if (!isNum(d.min) || !isNum(d.max) || d.max <= d.min) out.push('"min" and "max" must be numbers with min below max');
    if (!isNum(d.step, 1e-6)) out.push('"step" must be the size of one small tick, above 0');
    if (out.length) return out;
    const n = (d.max - d.min) / d.step;
    if (n > 120 || n < 2 || !near(d.max - d.min, d.step)) out.push('the scale must have 2 to 120 small ticks: (max − min) / step must be a whole number');
    if (d.major !== undefined && (!isNum(d.major, 1e-6) || !near(d.major, d.step) || !near(d.max - d.min, d.major))) out.push('"major" must be a whole number of steps that fits the scale');
    if (!isNum(d.value, d.min, d.max)) out.push(`"value" must be on the scale, from ${d.min} to ${d.max}`);
    else if (!near(d.value - d.min, d.step / 2)) out.push(`"value" ${d.value} is not on a tick or half way between two (a step is ${d.step}): a student cannot read it`);
    if (d.type === 'spring' && d.min < 0) out.push('a spring balance starts at 0 or more');
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, unit = text(d.unit, 6) || UNITS[d.type], steps = Math.round((d.max - d.min) / d.step);
    const major = d.major || d.step * (steps % 10 === 0 && steps >= 30 ? 10 : 5), dp = Math.max(dec(d.step), dec(major));
    const H = Math.max(240, Math.min(420, steps * 7)), top = 30, bot = top + H, Y = v => bot - ((v - d.min) / (d.max - d.min)) * H;
    const kids = [], isMajor = v => near(v - d.min, major);
    const ticks = (x, dir, nums = true) => {
      for (let k = 0; k <= steps; k++) {
        const v = d.min + k * d.step, big = isMajor(v), half = !big && steps >= 10 && near(v - d.min, major / 2);
        const len = big ? 18 : half ? 12 : 8;
        kids.push(line(x, Y(v), x + dir * len, Y(v), P.ink, big ? 1.8 : 1.1));
        if (big && nums) kids.push(label(x + dir * (len + 6), Y(v), fmt(v, dp, lang), { anchor: dir > 0 ? 'start' : 'end', size: 13, weight: 600, colour: P.ink2 }));
      }
    };
    let W;
    if (d.type === 'thermometer') {
      const cx = 70, tw = 18, bulbR = 20;
      kids.push(path(`M ${cx - tw / 2} ${top - 10} A ${tw / 2} ${tw / 2} 0 0 1 ${cx + tw / 2} ${top - 10} L ${cx + tw / 2} ${bot + 6} A ${bulbR} ${bulbR} 0 1 1 ${cx - tw / 2} ${bot + 6} Z`, { fill: P.paper, stroke: P.ink, 'stroke-width': 2.5 }),
        node('circle', { cx, cy: bot + 6 + bulbR * 0.86, r: bulbR - 5, fill: P.red }),
        node('rect', { x: cx - 4, y: r2(Y(d.value)), width: 8, height: r2(bot + 14 - Y(d.value)), fill: P.red, class: 'of-level' }));
      ticks(cx + tw / 2 + 4, 1); W = 190;
      kids.push(label(cx, bot + bulbR * 2 + 34, '', {}));
    } else if (d.type === 'cylinder') {
      const x0 = 60, cw = 70, lvl = Y(d.value), men = Math.min(8, H / steps);
      kids.push(node('rect', { x: x0, y: r2(lvl - men), width: cw, height: r2(bot - lvl + men), fill: P.liquid, 'fill-opacity': 0.55 }),
        // the meniscus: curved up at the walls, its bottom exactly on the value
        path(`M ${x0} ${r2(lvl - men)} Q ${x0 + cw / 2} ${r2(lvl + men)} ${x0 + cw} ${r2(lvl - men)}`, { stroke: P.blue, 'stroke-width': 2.2, fill: P.paper, class: 'of-level' }),
        path(`M ${x0 - 8} ${top - 8} L ${x0} ${top} L ${x0} ${bot + 4} L ${x0 + cw} ${bot + 4} L ${x0 + cw} ${top} L ${x0 + cw + 4} ${top - 8}`, { stroke: P.ink, 'stroke-width': 2.5 }),
        node('rect', { x: x0 - 22, y: bot + 4, width: cw + 44, height: 10, rx: 3, fill: P.soft, stroke: P.ink, 'stroke-width': 2 }));
      ticks(x0, 1, false); for (let k = 0; k <= steps; k++) { const v = d.min + k * d.step; if (isMajor(v)) kids.push(label(x0 + cw + 10, Y(v), fmt(v, dp, lang), { size: 13, weight: 600, colour: P.ink2 })); }
      W = 200;
    } else {
      const x0 = 50, bw = 100, py = Y(d.value);
      kids.push(node('rect', { x: x0, y: top - 14, width: bw, height: H + 28, rx: 10, fill: P.soft, stroke: P.ink, 'stroke-width': 2.5 }),
        line(x0 + bw / 2, 4, x0 + bw / 2, top - 14, P.ink, 2.5), node('circle', { cx: x0 + bw / 2, cy: 6, r: 5, fill: 'none', stroke: P.ink, 'stroke-width': 2 }),
        // the spring down to the pointer
        path(springPath(x0 + 20, top - 6, py - 4), { stroke: P.muted, 'stroke-width': 1.8 }),
        node('polygon', { points: `${x0 + 20},${r2(py - 5)} ${x0 + 20},${r2(py + 5)} ${x0 + 34},${r2(py)}`, fill: P.red, class: 'of-level' }), line(x0 + 10, py, x0 + 20, py, P.red, 3),
        line(x0 + 20, py, x0 + 20, bot + 26, P.ink, 2.5), path(`M ${x0 + 20} ${bot + 26} q 0 14 -10 14`, { stroke: P.ink, 'stroke-width': 2.5 }));
      ticks(x0 + 34, 1); W = 190;
    }
    const blank = o.hide === true || o.hide === 'value';
    const words = blank ? `______ ${unit}` : `${fmt(d.value, dp + (near(d.value - d.min, d.step) ? 0 : 1), lang)} ${unit}`;
    const Ht = bot + (d.type === 'thermometer' ? 80 : 54);
    kids.push(label(W / 2, Ht - 16, words, { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' }));
    return frame(W, Ht, kids, { ...o, kind: 'reading' }, o.title || `${d.type} reading`);
  },
};
function dec(x) { const s = String(Math.round(x * 1e6) / 1e6); return s.includes('.') ? s.split('.')[1].length : 0; }
function springPath(x, y0, y1) {
  const n = 10, h = (y1 - y0) / n; let s = `M ${x} ${r2(y0)}`;
  for (let i = 0; i < n; i++) s += ` l ${i % 2 ? -8 : 8} ${r2(h / 2)} l ${i % 2 ? 8 : -8} ${r2(h / 2)}`;
  return s;
}

const READINGS = { reading };

// ---- figures/src/index.js
// Oomba Figures: the global a page uses (docs/figures-api.md). window.OombaFigures (alias OF):
//   OF.draw(kind, data, opts) -> an <svg> element        OF.svg(kind, data, opts) -> the same figure as SVG text
//   OF.check(kind, data) -> [what is wrong] ([] = fine)   OF.kinds, OF.version, OF.colours
//   OF.freeBody(data, opts), OF.vectors, OF.inclinedPlane, OF.pulley, OF.rays, OF.circuit, OF.grid, OF.motionGraph,
//   OF.halfLife, OF.titration, OF.bohr, OF.orbitals, OF.lewis, OF.reading: each -> an <svg> element
//   OF.structure(smiles, opts) -> an <svg> element drawn by SmilesDrawer (its pinned tag must be on the page)
//   OF.board(element, opts) -> a JSXGraph board in the Oomba colours (JSXGraph's pinned tag must be on the page)
// opts: { hide (true, or a part's name: the answer left out), print (black on white), lang (numbers and default
// words), title (the accessible name), width }. With no document (the server's printable worksheets, the tests) only
// svg(), check() and the solvers are used.

const KINDS = { ...PHYSICS, ...GRAPHS, ...CHEM, ...READINGS };
const KIND_IDS = Object.keys(KINDS);
const cleanOpts = o => {
  const x = o && typeof o === 'object' ? o : {};
  return { hide: x.hide === true || typeof x.hide === 'string' || Array.isArray(x.hide) ? x.hide : false, print: x.print === true, lang: typeof x.lang === 'string' ? x.lang.slice(0, 16) : 'en',
    title: typeof x.title === 'string' ? x.title.slice(0, 200) : '', width: typeof x.width === 'number' && x.width > 40 && x.width < 4000 ? x.width : 0 };
};
/** What is wrong with this figure's data, in plain English ([] when it can be drawn). */
function checkFig(kind, data) {
  const K = KINDS[kind];
  if (!K) return [`unknown figure "${String(kind).slice(0, 30)}" (figures: ${KIND_IDS.join(', ')})`];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the figure\'s data must be an object'];
  try { return K.check(data); } catch (e) { return [`the data could not be read (${String(e.message).slice(0, 80)})`]; }
}
/** The figure's node tree; data that does not pass check() draws a small card that says so (never a wrong figure). */
function tree(kind, data, opts) {
  const o = cleanOpts(opts), bad = checkFig(kind, data);
  if (bad.length) { const P = palette(o); return frame(360, 90, [node('rect', { x: 2, y: 2, width: 356, height: 86, rx: 10, fill: 'none', stroke: P.red, 'stroke-width': 2, 'stroke-dasharray': '6 5' }), label(180, 45, '⚠ This figure cannot be drawn.', { anchor: 'middle', size: 15, colour: P.red })], { ...o, kind: 'error' }, 'Figure error'); }
  return KINDS[kind].draw(data, o);
}
const svg = (kind, data, opts) => svgText(tree(kind, data, opts));
function draw(kind, data, opts) {
  const el = toElement(tree(kind, data, opts));
  const bad = checkFig(kind, data);
  if (bad.length && typeof console !== 'undefined') console.warn(`[oomba-figures] ${kind}: ${bad.join('; ')}`);
  return el;
}

/** A skeletal structure from SMILES, drawn by SmilesDrawer into an <svg> (browser only). */
function structure(smiles, opts = {}) {
  const o = cleanOpts(opts), w = o.width || 320, h = Math.round(w * 0.7);
  const doc = typeof document !== 'undefined' ? document : null, SD = typeof globalThis !== 'undefined' ? globalThis.SmilesDrawer : null;
  if (!doc) throw new Error('Oomba Figures: structure() needs a page');
  const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${w} ${h}`); el.setAttribute('width', String(w)); el.setAttribute('height', String(h)); el.setAttribute('role', 'img');
  el.setAttribute('aria-label', o.title || `Structure ${String(smiles).slice(0, 60)}`); el.setAttribute('class', 'of-fig of-structure'); el.style.maxWidth = '100%'; el.style.height = 'auto';
  el.style.background = o.print ? '#fff' : COLOURS.paper; el.style.borderRadius = o.print ? '0' : '12px';
  if (!SD || !SD.SvgDrawer || typeof SD.parse !== 'function') { el.appendChild(toElement(label(w / 2, h / 2, '⚠ SmilesDrawer is not loaded', { anchor: 'middle', size: 14, colour: COLOURS.red }))); if (typeof console !== 'undefined') console.warn('[oomba-figures] structure: add the pinned SmilesDrawer tag before this one'); return el; }
  const s = String(smiles || '').slice(0, 200);
  try {
    const ink = o.print ? '#000000' : COLOURS.ink, el2 = o.print ? '#000000' : null;
    const oomba = { FOREGROUND: ink, BACKGROUND: o.print ? '#ffffff' : COLOURS.paper, C: ink, O: el2 || COLOURS.red, N: el2 || COLOURS.blue, F: el2 || COLOURS.green, CL: el2 || COLOURS.green, BR: el2 || '#9A4A12', I: el2 || COLOURS.purple, P: el2 || '#9A4A12', S: el2 || COLOURS.gold, B: el2 || COLOURS.gold, SI: el2 || COLOURS.gold, H: el2 || COLOURS.muted };
    const drawer = new SD.SvgDrawer({ width: w, height: h, padding: 12, compactDrawing: false, terminalCarbons: !!opts.carbons, explicitHydrogens: opts.hydrogens !== false, themes: { oomba } });
    SD.parse(s, t => { drawer.draw(t, el, 'oomba'); }, () => { el.appendChild(toElement(label(w / 2, h / 2, '⚠ That SMILES could not be read', { anchor: 'middle', size: 14, colour: COLOURS.red }))); });
  } catch (e) { if (typeof console !== 'undefined') console.warn(`[oomba-figures] structure: ${String(e.message).slice(0, 120)}`); }
  return el;
}
/** A JSXGraph board in the Oomba colours: OF.board(el, { x: [lo, hi], y: [lo, hi], grid, axis }) (browser only). */
function board(target, opts = {}) {
  const JXG = typeof globalThis !== 'undefined' ? globalThis.JXG : null;
  if (!JXG || !JXG.JSXGraph) throw new Error('Oomba Figures: add the pinned JSXGraph tag before using OF.board()');
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el && !el.id) el.id = `of-board-${Math.random().toString(36).slice(2, 8)}`;
  const x = Array.isArray(opts.x) ? opts.x : [-5, 5], y = Array.isArray(opts.y) ? opts.y : [-5, 5];
  if (el) { el.style.background = COLOURS.paper; el.style.borderRadius = '12px'; if (!el.style.aspectRatio && !el.style.height) el.style.aspectRatio = `${x[1] - x[0]} / ${y[1] - y[0]}`; }
  JXG.Options.text.cssDefaultStyle = 'font-family:system-ui,sans-serif;'; JXG.Options.text.highlightCssDefaultStyle = JXG.Options.text.cssDefaultStyle;
  Object.assign(JXG.Options.point, { strokeColor: COLOURS.red, fillColor: COLOURS.red, highlightStrokeColor: COLOURS.greenInk, highlightFillColor: COLOURS.green });
  Object.assign(JXG.Options.line, { strokeColor: COLOURS.green, highlightStrokeColor: COLOURS.greenInk, strokeWidth: 3 });
  Object.assign(JXG.Options.curve, { strokeColor: COLOURS.green, strokeWidth: 3 });
  return JXG.JSXGraph.initBoard(el.id, { boundingbox: [x[0], y[1], x[1], y[0]], axis: opts.axis !== false, grid: opts.grid !== false, keepAspectRatio: opts.keepAspectRatio !== false, showCopyright: false, showNavigation: false, pan: { enabled: false }, zoom: { enabled: false }, ...(opts.board || {}) });
}

const named = Object.fromEntries(KIND_IDS.map(k => [k, (data, opts) => draw(k, data, opts)]));
const OombaFigures = Object.freeze({
  version: FIG_VERSION, kinds: Object.freeze(KIND_IDS.slice()), colours: COLOURS,
  draw, svg, check: checkFig, structure, board, ...named,
  // the numbers behind the figures (for a generator's answers and the tests): the same functions the drawings use
  solve: Object.freeze({
    rays: d => KINDS.rays.solve(d), pulley: d => KINDS.pulley.solve(d), inclinedPlane: d => KINDS.inclinedPlane.sizes(d), titration: (d, v) => KINDS.titration.pH(d, v),
    halfLife: (d, t) => KINDS.halfLife.at(d, t), motionArea: (d, a, b) => KINDS.motionGraph.area(d, a, b), bohrShells, config: (el, q = 0) => configOf(typeof el === 'number' ? el : ELEMENTS.findIndex(e => e && e[0] === el), q), configText,
  }),
  data: Object.freeze({ elements: ELEMENTS, molecules: Object.keys(MOLECULES), circuitParts: CIRCUIT_PARTS, rayTypes: RAY_TYPES, words: FIG_WORDS }),
  expr: evalExpr,
});
globalThis.OombaFigures = OombaFigures;
globalThis.OF = OombaFigures;

})();
