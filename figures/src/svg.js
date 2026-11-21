// Oomba Figures: the drawing core. Every figure is built as a small tree of SVG nodes ({ tag, attrs, kids }) by a pure
// function, then turned into text (svgText: the server's printable worksheets, the unit tests) or into a real SVG
// element (toElement: in the browser). No DOM, no network, no clock in here.
export const FIG_VERSION = '1.1.0';
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The Oomba colours (the site's tokens, darkened where a thin line needs contrast on the cream paper). Print: black on
 *  white with greys, so a sheet prints on any printer. */
export const COLOURS = Object.freeze({
  paper: '#FFFDF2', ink: '#141414', ink2: '#3B3A35', muted: '#5B584F', grid: '#E2DDCB', gridStrong: '#C9C2A9', soft: '#F4F1E6',
  green: '#1F9D63', greenInk: '#0F5A37', blue: '#2A78B0', red: '#B0372B', gold: '#9A6B00', purple: '#6E4BB0', liquid: '#5AA9D6', fill: '#E1F1E1', spark: '#FFD23F',
});
export const PRINT_COLOURS = Object.freeze({
  paper: '#FFFFFF', ink: '#000000', ink2: '#000000', muted: '#333333', grid: '#CCCCCC', gridStrong: '#999999', soft: '#F2F2F2',
  green: '#000000', greenInk: '#000000', blue: '#000000', red: '#000000', gold: '#000000', purple: '#000000', liquid: '#BBBBBB', fill: '#EEEEEE', spark: '#DDDDDD',
});
export const palette = o => (o && o.print ? PRINT_COLOURS : COLOURS);
/** The colour of the k-th thing in a figure (forces, vectors, branches): green, blue, red, gold, purple, then round again. */
export const seriesColour = (o, k) => { const p = palette(o); return [p.green, p.blue, p.red, p.gold, p.purple][((k % 5) + 5) % 5]; };

/** One node. Attributes with null / undefined / false are left out. Kids: nodes, strings (text) or nested lists. */
export const node = (tag, attrs = {}, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false && k !== '') });
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escText = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
const num = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

/** A node tree -> SVG text. */
export function svgText(n) {
  if (typeof n === 'string') return escText(n);
  const a = Object.entries(n.attrs).filter(([, v]) => v !== null && v !== undefined && v !== false).map(([k, v]) => ` ${k}="${escText(num(v))}"`).join('');
  return n.kids.length ? `<${n.tag}${a}>${n.kids.map(svgText).join('')}</${n.tag}>` : `<${n.tag}${a}/>`;
}
/** A node tree -> a real SVG element (browser). */
export function toElement(n, doc = typeof document !== 'undefined' ? document : null) {
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
export function fmt(x, dp = 2, lang = 'en') {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x);
  const k = 10 ** dp, r = Math.round(x * k) / k;
  try { return new Intl.NumberFormat(/^ar\b/.test(lang) ? 'ar-u-nu-latn' : lang || 'en', { maximumFractionDigits: dp, useGrouping: false }).format(r === 0 ? 0 : r); } catch (e) { return String(r); }
}
const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** A text label. Right-to-left words (Hebrew, Arabic) read right to left where they sit: the anchor is swapped so the
 *  label stays on the same side of its point. The figure itself never mirrors (forces, rays and axes are physics). */
export function label(x, y, text, o = {}) {
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
export function subLabel(x, y, main, sub, o = {}) {
  if (!sub) return label(x, y, `${main}${o.after || ''}`, o);
  const n = label(x, y, '', o) || node('text', { x, y, 'text-anchor': o.anchor || 'start', 'dominant-baseline': 'middle', 'font-size': o.size || 14, 'font-weight': o.weight || 700, fill: o.colour || '#141414' });
  n.kids = [String(main), node('tspan', { 'baseline-shift': 'sub', 'font-size': Math.round((o.size || 14) * 0.72) }, String(sub)), o.after ? String(o.after) : ''].filter(Boolean);
  return n;
}

// ---------------------------------------------------------------- shapes
/** An arrow from (x1, y1) to (x2, y2): a line and a filled head (the head ends exactly at the tip). */
export function arrow(x1, y1, x2, y2, o = {}) {
  const w = o.width || 3, head = o.head || Math.max(10, w * 3.6), len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return null;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, hl = Math.min(head, len * 0.6), hw = hl * 0.55;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  const c = o.colour || o.color || '#141414';
  return node('g', { class: o.cls || null },
    node('line', { x1, y1, x2: bx + ux * 0.5, y2: by + uy * 0.5, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', ...(o.dash ? { 'stroke-dasharray': o.dash } : {}) }),
    node('polygon', { points: `${r2(x2)},${r2(y2)} ${r2(bx - uy * hw)},${r2(by + ux * hw)} ${r2(bx + uy * hw)},${r2(by - ux * hw)}`, fill: c }));
}
export const r2 = v => Math.round(v * 100) / 100;
export const line = (x1, y1, x2, y2, c, w = 2, extra = {}) => node('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', ...extra });
export const path = (d, extra = {}) => node('path', { d, fill: 'none', ...extra });
export const poly = (pts, extra = {}) => node('polyline', { points: pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' '), fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });

/**
 * The figure's own <svg>: a viewBox of w x h, its accessible name (role img, <title>), the paper background, and the
 * kids. The figure is always laid out left to right (dir ltr): physics and graphs never mirror; labels handle their own
 * direction (label()).
 */
export function frame(w, h, kids, o = {}, name = '') {
  const p = palette(o), title = String(o.title || name || 'Figure').slice(0, 200);
  return node('svg', {
    xmlns: SVG_NS, viewBox: `0 0 ${r2(w)} ${r2(h)}`, width: r2(o.width || w), height: r2(((o.width || w) * h) / w), role: 'img', 'aria-label': title,
    class: `of-fig of-${o.kind || 'figure'}${o.print ? ' of-print' : ''}`, direction: 'ltr', 'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Hebrew", "Noto Sans Arabic", Arial, sans-serif',
    style: 'max-width:100%;height:auto', 'data-of': o.kind || null,
  }, node('title', {}, title), o.bare ? null : node('rect', { x: 0, y: 0, width: w, height: h, rx: o.print ? 0 : 12, fill: p.paper }), kids);
}
/** A light square grid over a box (graph paper). */
export function gridLines(x0, y0, w, h, step, c, sw = 1) {
  const out = [];
  for (let x = x0; x <= x0 + w + 0.01; x += step) out.push(line(x, y0, x, y0 + h, c, sw));
  for (let y = y0; y <= y0 + h + 0.01; y += step) out.push(line(x0, y, x0 + w, y, c, sw));
  return node('g', { 'aria-hidden': 'true' }, out);
}
/** Degrees -> a unit vector on screen (0 = right, 90 = up: maths angles; screen y grows downwards). */
export const unitOf = deg => ({ x: Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) });
/** 'up' | 'down' | 'left' | 'right' | degrees -> degrees, or null. */
export function angleOf(dir) {
  if (typeof dir === 'number' && Number.isFinite(dir)) return ((dir % 360) + 360) % 360;
  return { right: 0, up: 90, left: 180, down: 270 }[dir] ?? null;
}
/** Is this a finite number in [lo, hi]? */
export const isNum = (v, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** A short label from the data (trimmed, at most n characters), or ''. */
export const text = (s, n = 40) => (typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** Is this figure asked to hide its answer (opts.hide true, or this name in its list)? */
export const hides = (o, name) => !!o && (o.hide === true || (Array.isArray(o.hide) && o.hide.includes(name)) || o.hide === name);
