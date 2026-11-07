// ======================================================================================================
// GRAPHICS: one canvas, integer pixel scaling, the palette, pixel-map sprites, and drawing helpers.
// Coordinates everywhere are VIRTUAL pixels: the view is VIEW.W x VIEW.H virtual pixels and each one is VIEW.S x VIEW.S
// device pixels (an integer, so every pixel is crisp). The short side of the view is about 180-300 virtual pixels.
// ======================================================================================================
const CV = document.getElementById('jc');
const G = CV.getContext('2d', { alpha: false });
const VIEW = { S: 2, W: 320, H: 240, dpr: 1, cssW: 320, cssH: 240, tap: 24, portrait: false, gen: 0 };
JC.view = VIEW; JC.canvas = CV; JC.g = G;

function resize() {
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const cssW = Math.max(200, window.innerWidth || 320), cssH = Math.max(200, window.innerHeight || 240);
  const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
  const short = Math.min(bw, bh);
  // the short side ends up about 240 virtual pixels (never under 1x)
  const S = Math.max(1, Math.round(short / 240));
  if (CV.width !== bw) CV.width = bw;
  if (CV.height !== bh) CV.height = bh;
  VIEW.S = S; VIEW.dpr = dpr; VIEW.cssW = cssW; VIEW.cssH = cssH;
  VIEW.W = Math.ceil(bw / S); VIEW.H = Math.ceil(bh / S);
  VIEW.portrait = VIEW.H > VIEW.W;
  // a touch target of 46 CSS pixels, in virtual pixels
  VIEW.tap = Math.ceil(46 * dpr / S);
  VIEW.gen++;
  G.imageSmoothingEnabled = false;
  TEXTCACHE.clear();
}
/** Virtual pixels from a CSS-pixel position on the canvas. */
function toVirtual(cssX, cssY, out) {
  out.x = cssX * VIEW.dpr / VIEW.S; out.y = cssY * VIEW.dpr / VIEW.S; return out;
}
JC.toVirtual = toVirtual;

/* ---------- palette ---------- */
const PAL = {
  ink: '#1b1325', ink2: '#2c2140', white: '#fff8e8', cream: '#f4e4bc', grey: '#9a94a8', grey2: '#5c5670',
  g0: '#123524', g1: '#1f5a34', g2: '#2f7d3c', g3: '#4fa83f', g4: '#7cc84a', g5: '#b6e35d',
  b0: '#2b1a12', b1: '#4a2c1a', b2: '#6e4325', b3: '#9a6234', b4: '#c48a4c', b5: '#e8bd7c',
  w0: '#0e2a4f', w1: '#16477c', w2: '#2373ad', w3: '#3fa3d6', w4: '#7fd4ee', w5: '#c8f6ff',
  s0: '#c79a5a', s1: '#e3c27d', s2: '#f3dea0',
  r0: '#6e1b25', r1: '#b4302f', r2: '#e8553d', r3: '#ff8b3d', r4: '#ffc544', r5: '#fff08a',
  p0: '#3c1f5c', p1: '#6b3fa0', p2: '#a06ce0', p3: '#ff6fb5', p4: '#ffb3d6',
  sky0: '#ff7a59', sky1: '#ffa95e', sky2: '#ffd27a', sky3: '#7a4fb8', sky4: '#c25d9a',
  gold0: '#8a5a12', gold1: '#d39a22', gold2: '#ffd24a', gold3: '#fff3a8',
  hud: '#1b1325', hudEdge: '#fff8e8',
};
JC.pal = PAL;
// Each sport's champion colour (its Feather, its arch flowers, its bars).
const SPORT_COLOURS = { paddle: '#ff9b2e', vine: '#6ad34a', seed: '#ff5a5a', rapids: '#3fb7ff', frog: '#b06cff', kick: '#ffd23f', leaf: '#ff6fb5' };
JC.sportColours = SPORT_COLOURS;

/* ---------- colour helpers ---------- */
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(r, gg, b) { return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(gg | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1); }
/** Lighter (k > 0) or darker (k < 0) version of a colour. */
function shade(h, k) { const c = hexRgb(h); return k >= 0 ? rgbHex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k) : rgbHex(c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)); }
JC.shade = shade;

/* ---------- offscreen canvases ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return c; }
JC.canvas2 = canvas;

/* ---------- pixel-map sprites ----------
   A sprite is rows of characters; each character is a palette key ('.' or ' ' is see-through):
     JC.sprite('name', ['..oo..', '.obbo.'], { o: PAL.ink, b: '#a86a3a' })  -> { c: canvas, w, h, f: mirrored canvas }
   Pixel maps are drawn once into small canvases and drawn scaled with smoothing off. */
const SPRITES = {};
function makeSprite(rows, pal) {
  const h = rows.length, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = canvas(w, h), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
    const k = rows[j][i]; if (k === '.' || k === ' ') continue;
    const col = pal[k]; if (!col) continue;
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  const f = canvas(w, h), fx = f.getContext('2d'); fx.translate(w, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
  return { c, f, w, h };
}
function sprite(name, rows, pal) { if (rows) SPRITES[name] = makeSprite(rows, pal); return SPRITES[name]; }
/** Draw a sprite with its top-left at (x, y); flip mirrors it left-right. */
function spr(g, s, x, y, flip) { if (s) g.drawImage(flip ? s.f : s.c, Math.round(x), Math.round(y)); }
/** Draw a sprite scaled by an integer k (portraits, the title). */
function sprK(g, s, x, y, k, flip) { if (s) g.drawImage(flip ? s.f : s.c, Math.round(x), Math.round(y), s.w * k, s.h * k); }
JC.sprite = sprite; JC.spr = spr; JC.sprK = sprK; JC.sprites = SPRITES;

/* ---------- primitives (virtual pixels, crisp) ---------- */
function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
/** A filled pixel disc (no anti-aliasing). */
function disc(g, cx, cy, r, col) {
  g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) { const dx = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8)); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
/** A filled pixel ellipse. */
function oval(g, cx, cy, rx, ry, col) {
  g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) { const k = 1 - (dy * dy) / ((ry + 0.4) * (ry + 0.4)); if (k <= 0) continue; const dx = Math.floor(rx * Math.sqrt(k) + 0.3); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
/** A 1-pixel line (Bresenham). */
function line(g, x0, y0, x1, y1, col) {
  g.fillStyle = col; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (let n = 0; n < 2000; n++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
/** A chunky rounded box: fill, a 1px ink outline and a light top edge (the HUD's look). */
function box(g, x, y, w, h, fill, edge, light) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = edge || PAL.ink;
  g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = fill; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (light) { g.fillStyle = light; g.fillRect(x + 2, y + 1, w - 4, 1); }
}
/** A soft oval shadow under a character. */
function shadow(g, cx, cy, rx) { g.globalAlpha = 0.28; oval(g, cx, cy, rx, Math.max(1, (rx / 3) | 0), '#000'); g.globalAlpha = 1; }
JC.draw = { rect, disc, oval, line, box, shadow };
