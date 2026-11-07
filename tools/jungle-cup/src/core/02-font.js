// ======================================================================================================
// TEXT: a chunky 5x7 pixel font (Latin letters, accents built from marks) and the "Clear" option (a plain, very
// readable font for kids who need it). Words in scripts the pixel font has no letters for (Japanese, Chinese,
// Arabic, Hebrew, Russian) are drawn with the clear font automatically. Rendered text is cached as small canvases at
// device resolution, so drawing a label every frame is one drawImage.
// ======================================================================================================
/* Glyph rows: 5 bits, the leftmost pixel is 16. Rows 0-6 sit on the line, rows 7-8 are descenders. */
const GLYPHS = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 19, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [28, 8, 8, 8, 8, 8, 28], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 22, 25, 17, 17, 30], c: [0, 0, 14, 16, 16, 17, 14], d: [1, 1, 13, 19, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14], f: [6, 8, 28, 8, 8, 8, 8], g: [0, 0, 15, 17, 17, 15, 1, 14], h: [16, 16, 22, 25, 17, 17, 17],
  i: [8, 0, 24, 8, 8, 8, 28], j: [2, 0, 6, 2, 2, 2, 2, 18, 12], k: [16, 16, 18, 20, 24, 20, 18], l: [24, 8, 8, 8, 8, 8, 28],
  m: [0, 0, 26, 21, 21, 21, 21], n: [0, 0, 22, 25, 17, 17, 17], o: [0, 0, 14, 17, 17, 17, 14], p: [0, 0, 30, 17, 17, 30, 16, 16],
  q: [0, 0, 15, 17, 17, 15, 1, 1], r: [0, 0, 22, 25, 16, 16, 16], s: [0, 0, 15, 16, 14, 1, 30], t: [8, 8, 28, 8, 8, 9, 6],
  u: [0, 0, 17, 17, 17, 19, 13], v: [0, 0, 17, 17, 17, 10, 4], w: [0, 0, 17, 17, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 17, 15, 1, 14], z: [0, 0, 31, 2, 4, 8, 31], 305: [0, 0, 24, 8, 8, 8, 28], 223: [12, 18, 18, 22, 17, 17, 22],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  46: [0, 0, 0, 0, 0, 0, 16], 44: [0, 0, 0, 0, 0, 0, 8, 16], 33: [16, 16, 16, 16, 16, 0, 16], 63: [14, 17, 1, 2, 4, 0, 4],
  58: [0, 0, 16, 0, 0, 16, 0], 59: [0, 0, 8, 0, 0, 8, 16], 45: [0, 0, 0, 28, 0, 0, 0], 43: [0, 4, 4, 31, 4, 4, 0],
  47: [1, 1, 2, 4, 8, 16, 16], 39: [16, 16, 0, 0, 0, 0, 0], 34: [20, 20, 0, 0, 0, 0, 0], 40: [8, 16, 16, 16, 16, 16, 8],
  41: [16, 8, 8, 8, 8, 8, 16], 37: [25, 26, 2, 4, 8, 11, 19], 38: [12, 18, 20, 8, 21, 18, 13], 42: [0, 4, 21, 14, 21, 4, 0],
  61: [0, 0, 31, 0, 31, 0, 0], 60: [2, 4, 8, 16, 8, 4, 2], 62: [16, 8, 4, 2, 4, 8, 16], 35: [10, 31, 10, 10, 31, 10, 0],
  95: [0, 0, 0, 0, 0, 0, 31], 91: [24, 16, 16, 16, 16, 16, 24], 93: [24, 8, 8, 8, 8, 8, 24], 124: [16, 16, 16, 16, 16, 16, 16],
  161: [16, 0, 16, 16, 16, 16, 16], 191: [4, 0, 4, 8, 16, 17, 14], 215: [0, 17, 10, 4, 10, 17, 0], 176: [8, 20, 8, 0, 0, 0, 0],
  9829: [0, 10, 31, 31, 14, 4, 0], 9733: [4, 4, 31, 14, 14, 27, 0], 8594: [0, 4, 2, 31, 2, 4, 0], 8592: [0, 4, 8, 31, 8, 4, 0],
  8593: [4, 14, 21, 4, 4, 4, 0], 8595: [4, 4, 4, 21, 14, 4, 0], 183: [0, 0, 0, 16, 0, 0, 0],
};
// Keys over 31 are character codes (so the table holds no quoted text).
for (const k of Object.keys(GLYPHS)) if (+k > 31) { GLYPHS[String.fromCharCode(+k)] = GLYPHS[k]; delete GLYPHS[k]; }
const ALIAS = { '’': "'", '‘': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"', '–': '-', '—': '-', '…': '...', ' ': ' ', ' ': ' ' };
// Marks above (rows from the top of a lowercase letter's x-height) and below.
const MARKS = { '\u0301': [1, 2], '\u0300': [2, 1], '\u0302': [2, 5], '\u0308': [0, 5], '\u0303': [5, 10], '\u030a': [2, 5, 2], '\u030c': [5, 2], '\u0327': 'cedilla', '\u0328': 'ogonek' };
const GW = {}; // glyph widths
for (const k in GLYPHS) { let m = 0; for (const r of GLYPHS[k]) { for (let b = 0; b < 5; b++) if (r & (16 >> b)) m = Math.max(m, b + 1); } GW[k] = Math.max(1, m); }
const LINE_H = 12;          // one line of text, in virtual pixels (2 above for marks, 7, 2 descender, 1 gap)
const SPACE_W = 3;
const CLEAR_FONT = 'Verdana, "Trebuchet MS", "Segoe UI", system-ui, "Noto Sans", sans-serif';
const TEXT = { clear: false };          // the Settings choice (Pixel / Clear)
JC.text = TEXT;

/** The pixel-font letters of a string (null when a character has no pixel letter). Cached. */
const SPLIT = new Map();
function pixelUnits(str) {
  let u = SPLIT.get(str); if (u !== undefined) return u;
  u = [];
  const s = String(str).normalize('NFD');
  for (const ch0 of s) {
    const ch = ALIAS[ch0] !== undefined ? ALIAS[ch0] : ch0;
    if (ch.length > 1) { for (const c of ch) u.push({ c, marks: null }); continue; }
    if (ch === ' ' || ch === '\n') { u.push({ c: ch, marks: null }); continue; }
    if (MARKS[ch]) { const last = u[u.length - 1]; if (!last || last.c === ' ') { u = null; break; } (last.marks || (last.marks = [])).push(ch); if (last.c === 'i') last.c = 'ı'; continue; }
    if (!GLYPHS[ch]) { u = null; break; }
    u.push({ c: ch, marks: null });
  }
  if (SPLIT.size > 4000) SPLIT.clear();
  SPLIT.set(str, u);
  return u;
}
function usesPixel(str) { return !TEXT.clear && pixelUnits(str) !== null; }
function clearFont(scale) { return `bold ${Math.round(9 * scale * VIEW.S)}px ${CLEAR_FONT}`; }
let MEASURE = null;
/** Width of a one-line string in virtual pixels. */
function textW(str, scale) {
  scale = scale || 1; str = String(str);
  if (usesPixel(str)) { const u = pixelUnits(str); let w = 0; for (let i = 0; i < u.length; i++) w += (u[i].c === ' ' ? SPACE_W : GW[u[i].c] + 1); return Math.max(0, w - 1) * scale; }
  if (!MEASURE) MEASURE = canvas(4, 4).getContext('2d');
  MEASURE.font = clearFont(scale);
  return Math.ceil(MEASURE.measureText(str).width / VIEW.S) + 1;
}
function drawGlyph(x, ch, ox, oy, k) {
  const rows = GLYPHS[ch]; if (!rows) return;
  for (let j = 0; j < rows.length; j++) { const r = rows[j]; if (!r) continue; for (let b = 0; b < 5; b++) if (r & (16 >> b)) x.fillRect((ox + b) * k, (oy + j) * k, k, k); }
}
function drawMarks(x, unit, ox, oy, k) {
  const w = GW[unit.c], up = /[A-Z]/.test(unit.c) || /[bdfhklt]/.test(unit.c) ? -2 : 0;
  let stack = 0;
  for (const m of unit.marks) {
    const d = MARKS[m];
    if (d === 'cedilla' || d === 'ogonek') { x.fillRect((ox + ((w / 2) | 0)) * k, (oy + 7) * k, k, k); x.fillRect((ox + ((w / 2) | 0) - (d === 'cedilla' ? 1 : -1)) * k, (oy + 8) * k, k, k); continue; }
    const mw = d.reduce((m2, r) => Math.max(m2, 32 - Math.clz32(r)), 1);
    const left = ox + Math.round((w - mw) / 2);
    for (let j = 0; j < d.length; j++) for (let b = 0; b < 5; b++) if (d[j] & (1 << (mw - 1 - b)) && b < mw) x.fillRect((left + b) * k, (oy + up + j - stack) * k, k, k);
    stack += d.length;
  }
}
/* Text bitmaps: key -> { c, w, h } at device resolution. */
const TEXTCACHE = new Map();
function textBitmap(str, col, edge, scale) {
  const key = (TEXT.clear ? 'C' : 'P') + scale + col + (edge || '') + '|' + str;
  let b = TEXTCACHE.get(key); if (b) return b;
  const S = VIEW.S, pad = edge ? 1 : 0;
  if (usesPixel(str)) {
    const u = pixelUnits(str), w = textW(str, 1), k = S * scale;
    const c = canvas((w + pad * 2) * k, (LINE_H + pad * 2) * k), x = c.getContext('2d');
    const paint = (dx, dy, fill) => {
      x.fillStyle = fill; let ox = pad + dx;
      for (let i = 0; i < u.length; i++) { const un = u[i]; if (un.c === ' ') { ox += SPACE_W; continue; } drawGlyph(x, un.c, ox, 2 + pad + dy, k); if (un.marks) drawMarks(x, un, ox, 2 + pad + dy, k); ox += GW[un.c] + 1; }
    };
    if (edge) { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) paint(dx, dy, edge); }
    paint(0, 0, col);
    b = { c, w: (w + pad * 2) * scale, h: (LINE_H + pad * 2) * scale };
  } else {
    const w = textW(str, scale), h = LINE_H * scale;
    const c = canvas((w + 2 + pad * 2) * S, (h + pad * 2) * S), x = c.getContext('2d');
    x.font = clearFont(scale); x.textBaseline = 'middle'; x.direction = RTL ? 'rtl' : 'ltr'; x.textAlign = RTL ? 'right' : 'left';
    const tx = RTL ? (w + 1 + pad) * S : (1 + pad) * S, ty = (pad + h / 2 + 0.5) * S;
    if (edge) { x.lineJoin = 'round'; x.lineWidth = Math.max(2, S * 1.6 * scale); x.strokeStyle = edge; x.strokeText(str, tx, ty); }
    x.fillStyle = col; x.fillText(str, tx, ty);
    b = { c, w: w + 2 + pad * 2, h: h + pad * 2 };
  }
  if (TEXTCACHE.size > 600) TEXTCACHE.clear();
  TEXTCACHE.set(key, b);
  return b;
}
/** Draw one line of text. opts: { col, edge (outline colour), align: 'left'|'center'|'right', scale, maxW }. y is the top of
 *  the line box. With maxW, a line that is too wide (a long word in another language) is narrowed to fit. Returns the width. */
function text(g, str, x, y, opts) {
  str = String(str); if (!str) return 0;
  const o = opts || NOOPT, scale = o.scale || 1, b = textBitmap(str, o.col || PAL.white, o.edge === undefined ? PAL.ink : o.edge, scale);
  const pad = (o.edge === null || o.edge === false) ? 0 : scale, w = o.maxW > 0 && b.w > o.maxW ? o.maxW : b.w;
  let left = x - pad;
  if (o.align === 'center') left = x - w / 2; else if (o.align === 'right') left = x - w + pad;
  g.drawImage(b.c, Math.round(left), Math.round(y - pad), w, b.h);
  return w;
}
const NOOPT = {};
/** Split text into lines that fit maxW (spaces, or any character for scripts without spaces). Cached. */
const WRAPS = new Map();
function wrap(str, maxW, scale) {
  scale = scale || 1;
  const key = (TEXT.clear ? 'C' : 'P') + maxW + '|' + scale + '|' + str;
  let lines = WRAPS.get(key); if (lines) return lines;
  lines = [];
  for (const para of String(str).split('\n')) {
    const words = /\s/.test(para) ? para.split(/(\s+)/) : Array.from(para);
    let cur = '';
    for (const w of words) {
      const next = cur + w;
      if (!cur || textW(next.trim(), scale) <= maxW) { cur = next; continue; }
      if (cur.trim()) lines.push(cur.trim());
      cur = /^\s+$/.test(w) ? '' : w;
      while (textW(cur, scale) > maxW && cur.length > 1) { let n = cur.length - 1; while (n > 1 && textW(cur.slice(0, n), scale) > maxW) n--; lines.push(cur.slice(0, n)); cur = cur.slice(n); }
    }
    if (cur.trim() || !lines.length) lines.push(cur.trim());
  }
  if (WRAPS.size > 800) WRAPS.clear();
  WRAPS.set(key, lines);
  return lines;
}
/** Draw wrapped text; returns the height used. */
function textBlock(g, str, x, y, maxW, opts) {
  let o = opts || NOOPT;
  const lines = wrap(str, maxW, o.scale || 1), lh = (o.lineH || LINE_H) * (o.scale || 1);
  const center = o.align === 'center', rtl = RTL && !center;
  if (rtl && !o._rtl) { o = Object.assign({}, o, { align: 'right', _rtl: true }); }
  for (let i = 0; i < lines.length; i++) text(g, lines[i], center ? x + maxW / 2 : rtl ? x + maxW : x, y + i * lh, o);
  return lines.length * lh;
}
JC.font = { text, textW, wrap, textBlock, LINE_H, usesPixel };
