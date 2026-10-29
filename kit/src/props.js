// Props, pickups and learning items (spec §6.3), all drawn in code with the "Oomba Ink" grammar. Variants come in the
// entity's `variant` (k.v): tile 'A' or '7:grape', pie '3/4', clock '3:15', dice '5', shape 'triangle:sky', sign text,
// chest/gate/book 'open', rocket 'go', tree 'pine' | 'palm' | 'snow', flower 'b'. Spark yellow (#FFD23F) only on rewards.
import { PALETTE, INK, CREAM } from './tokens.js';
import { sticker, detail, sparkPath, ellipsePath, rrectPath, glowMask, lines } from './grammar.js';
import { capsule } from './chars.js';
import { fontStack } from './text.js';
import { adjustHex } from './color.js';

const P = PALETTE, TAU = Math.PI * 2;
const circ = (x, y, r) => ellipsePath(x, y, r, r);
const poly = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
/** A rounded polygon (corner radius r): soft triangles, pentagons, hexagons. */
const rpoly = (pts, r) => { const p = new Path2D(), n = pts.length; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const s = mid(pts[n - 1], pts[0]); p.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; p.arcTo(a[0], a[1], b[0], b[1], r); } p.closePath(); return p; };
const ngon = (cx, cy, R, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + i * TAU / n) * R, cy + Math.sin(rot + i * TAU / n) * R]);
const S = (ctx, k, p, fill, shade, o = {}) => sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: o.off || 4 }, o));
const F = (ctx, k, p, fill, line = 0.7) => sticker(ctx, k, p, { fill, rim: false, line });
const hue = (v, d) => { const h = String(v || '').split(':')[1]; return P[h] ? h : d; };
const head = v => String(v || '').split(':')[0];
function text(ctx, k, s, x, y, size, color = INK, weight = 800) {
  ctx.font = `${weight} ${size}px ${fontStack('en')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width, max = size * 1.6; if (w > max) { ctx.save(); ctx.translate(x, y); ctx.scale(max / w, 1); x = 0; y = 0; }
  ctx.fillStyle = color; ctx.fillText(s, x, y + size * 0.04);
  if (w > max) ctx.restore();
}

export const PROP_GROUPS = {
  treasure: ['spark', 'coin', 'gem', 'heart', 'key', 'chest', 'medal', 'trophy', 'gift'],
  world: ['crate', 'platform', 'spring', 'flag', 'gate', 'sign', 'lantern', 'door', 'ladder', 'block'],
  learning: ['tile', 'pie', 'clock', 'dice', 'shape', 'book', 'pencil', 'globe', 'bulb', 'magnifier'],
  food: ['apple', 'banana', 'carrot', 'cookie', 'melon', 'cheese', 'cupcake', 'grapes'],
  vehicles: ['car', 'bus', 'rocket', 'boat', 'plane'],
  nature: ['tree', 'bush', 'flower', 'rock', 'mushroom', 'cloud', 'leaf', 'shell', 'cactus', 'snowman', 'log', 'grass'],
  hazards: ['spikes', 'thorn', 'spikeball'],
};
export const REWARD_PROPS = ['spark', 'coin', 'key', 'chest', 'medal', 'trophy', 'lantern', 'bulb'];
export const SHAPES = { circle: 'sky', square: 'mint', triangle: 'grape', rectangle: 'peach', pentagon: 'coral', hexagon: 'sky', diamond: 'grape', oval: 'mint', star: 'peach', heart: 'coral' };
export const PROP_VARIANTS = { tile: ['7', 'A', '3:grape', 'b:coral', '+:peach'], pie: ['1/2', '1/3', '3/4', '5/8'], clock: ['3:00', '9:30', '12:15'], dice: ['1', '2', '3', '4', '5', '6'], shape: Object.keys(SHAPES), chest: ['', 'open'], gate: ['', 'open'], book: ['', 'open'], rocket: ['', 'go'], tree: ['', 'pine', 'palm', 'snow'], flower: ['', 'b'], sign: ['', 'Go!', '→'] };

export function defineProps(atlas) {
  const def = (name, w, h, draw, ax = 0.5, ay = 0.5, o = {}) => atlas.define(name, Object.assign({ w, h, ax, ay, draw }, o));
  // ---- treasure (rewards may use spark yellow) ----
  def('coin', 60, 60, (ctx, k) => {
    S(ctx, k, circ(30, 30, 24), P.spark[2], P.spark[3], { gloss: [21, 20, 6, 4, -0.7], unlit: true, off: 5 });
    const r = circ(30, 30, 16); detail(ctx, k, r, 1); const s = sparkPath(30, 30, 10, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
  });
  def('gem', 60, 60, (ctx, k) => {
    const g = rpoly([[16, 14], [44, 14], [54, 26], [30, 54], [6, 26]], 3); S(ctx, k, g, P.grape[1], P.grape[2], { gloss: [22, 20, 5, 3, -0.4] });
    const f = poly([[6, 26], [54, 26]], false); detail(ctx, k, f, 1); const f2 = poly([[22, 14], [30, 26], [38, 14]], false); detail(ctx, k, f2, 1); const f3 = poly([[30, 26], [30, 52]], false); detail(ctx, k, f3, 0.8);
  });
  def('key', 70, 40, (ctx, k) => {
    const ring = new Path2D(); ring.arc(18, 20, 13, 0, TAU); ring.moveTo(24, 20); ring.arc(18, 20, 6, 0, TAU, true);
    const shaft = rrectPath(26, 16, 38, 8, 3), t1 = rrectPath(50, 20, 6, 12, 2), t2 = rrectPath(59, 20, 5, 9, 2);
    for (const p of [t1, t2, shaft]) S(ctx, k, p, P.spark[2], P.spark[3], { off: 2, unlit: true });
    S(ctx, k, ring, P.spark[2], P.spark[3], { off: 3, gloss: [11, 12, 3, 2, -0.6], unlit: true });
  });
  def('chest', 84, 70, (ctx, k) => {
    const open = k.v === 'open';
    const box = rrectPath(8, 30, 68, 36, 6);
    if (open) { const inside = rrectPath(12, 22, 60, 16, 5); F(ctx, k, inside, P.cocoa[3]); const glow = sparkPath(42, 22, 16, 0.2); ctx.fillStyle = P.spark[1]; ctx.fill(glow); glowMask(k, glow); }
    const lid = new Path2D(); if (open) { lid.moveTo(10, 24); lid.lineTo(74, 24); lid.lineTo(70, 6); lid.quadraticCurveTo(42, -2, 14, 6); lid.closePath(); } else { lid.moveTo(8, 34); lid.lineTo(76, 34); lid.lineTo(76, 22); lid.quadraticCurveTo(42, 2, 8, 22); lid.closePath(); }
    S(ctx, k, box, P.cocoa[2], P.cocoa[3], { off: 5 }); S(ctx, k, lid, P.cocoa[1], P.cocoa[2], { gloss: [24, open ? 10 : 18, 8, 3, -0.2] });
    for (const x of [20, 64]) F(ctx, k, rrectPath(x - 4, 30, 8, 36, 2), P.stone[1], 0.6);
    if (!open) { const lock = rrectPath(36, 28, 12, 14, 3); S(ctx, k, lock, P.spark[2], P.spark[3], { off: 2, rim: false, unlit: true }); }
  }, 0.5, 1);
  def('medal', 60, 76, (ctx, k) => {
    const rib1 = poly([[18, 2], [30, 2], [36, 34], [26, 38]]), rib2 = poly([[42, 2], [30, 2], [24, 34], [34, 38]]);
    S(ctx, k, rib1, P.sky[2], P.sky[3], { off: 2 }); S(ctx, k, rib2, P.coral[2], P.coral[3], { off: 2 });
    S(ctx, k, circ(30, 50, 20), P.spark[2], P.spark[3], { gloss: [23, 42, 5, 3, -0.6], unlit: true });
    const s = sparkPath(30, 50, 10, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
  });
  def('trophy', 70, 80, (ctx, k) => {
    const handles = new Path2D(); handles.arc(14, 24, 9, Math.PI * 0.5, Math.PI * 1.6); handles.moveTo(56, 15); handles.arc(56, 24, 9, -Math.PI * 0.6, Math.PI * 0.5);
    ctx.strokeStyle = CREAM; ctx.lineWidth = lines(k).w * 3 + lines(k).rim * 2; ctx.lineCap = 'round'; ctx.stroke(handles);
    ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 3; ctx.stroke(handles); ctx.strokeStyle = P.spark[2]; ctx.lineWidth = lines(k).w * 1.4; ctx.stroke(handles);
    const cup = new Path2D(); cup.moveTo(12, 8); cup.lineTo(58, 8); cup.bezierCurveTo(58, 34, 48, 46, 35, 46); cup.bezierCurveTo(22, 46, 12, 34, 12, 8); cup.closePath();
    const stem = rrectPath(30, 44, 10, 14, 3), base = rrectPath(16, 58, 38, 14, 5);
    S(ctx, k, base, P.stone[2], P.stone[3]); S(ctx, k, stem, P.spark[3], P.spark[3], { rim: false }); S(ctx, k, cup, P.spark[2], P.spark[3], { gloss: [24, 18, 5, 8, -0.2], unlit: true });
    const s = sparkPath(35, 24, 9, 0.22); ctx.fillStyle = P.spark[0]; ctx.fill(s); glowMask(k, s);
  }, 0.5, 1);
  def('gift', 64, 64, (ctx, k) => {
    const box = rrectPath(8, 24, 48, 36, 5), lid = rrectPath(4, 16, 56, 14, 5);
    S(ctx, k, box, P.coral[2], P.coral[3]); S(ctx, k, lid, P.coral[1], P.coral[2], { gloss: [16, 20, 6, 2.5, 0] });
    F(ctx, k, rrectPath(27, 16, 10, 44, 2), P.mint[2], 0.6);
    for (const s of [-1, 1]) { const b = ellipsePath(32 + s * 10, 11, 10, 6, s * 0.5); S(ctx, k, b, P.mint[2], P.mint[3], { rim: false, off: 2 }); }
    F(ctx, k, circ(32, 14, 5), P.mint[3], 0.6);
  }, 0.5, 1);

  // ---- world ----
  def('crate', 64, 64, (ctx, k) => {
    const b = rrectPath(4, 4, 56, 56, 7); S(ctx, k, b, P.cocoa[1], P.cocoa[2], { off: 5, gloss: [16, 14, 6, 3, -0.3] });
    const inner = rrectPath(13, 13, 38, 38, 4); detail(ctx, k, inner, 1.2);
    const x = poly([[15, 15], [49, 49]], false); detail(ctx, k, x, 1.6);
  }, 0.5, 1);
  def('platform', 160, 44, (ctx, k) => {
    const body = new Path2D(); body.moveTo(8, 12); body.lineTo(152, 12); body.quadraticCurveTo(150, 34, 120, 38); body.quadraticCurveTo(80, 44, 40, 38); body.quadraticCurveTo(10, 34, 8, 12); body.closePath();
    S(ctx, k, body, P.cocoa[2], P.cocoa[3], { off: 5 });
    const grass = rrectPath(2, 4, 156, 16, 8); S(ctx, k, grass, P.mint[2], P.mint[3], { off: 3, gloss: [30, 9, 14, 2.5, 0] });
    for (const x of [36, 74, 118]) F(ctx, k, circ(x, 30, 2.6), P.cocoa[1], 0.5);
  }, 0.5, 0);
  def('spring', 60, 64, (ctx, k) => {
    const base = rrectPath(8, 52, 44, 10, 4); S(ctx, k, base, P.stone[2], P.stone[3], { off: 2 });
    const coil = new Path2D(); coil.moveTo(16, 50); for (let i = 0; i < 4; i++) { coil.lineTo(44, 44 - i * 9); coil.lineTo(16, 40 - i * 9); }
    ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 2.2; ctx.lineJoin = 'round'; ctx.stroke(coil); ctx.strokeStyle = P.stone[1]; ctx.lineWidth = lines(k).w; ctx.stroke(coil);
    const pad = rrectPath(6, 6, 48, 12, 6); S(ctx, k, pad, P.sky[2], P.sky[3], { off: 3, gloss: [18, 9, 8, 2, 0] });
  }, 0.5, 1);
  def('flag', 64, 124, (ctx, k) => {
    const pole = rrectPath(10, 6, 7, 116, 3.5); S(ctx, k, pole, P.stone[1], P.stone[2], { off: 2 });
    const f = new Path2D(); f.moveTo(17, 12); f.quadraticCurveTo(40, 4, 60, 16); f.quadraticCurveTo(48, 28, 60, 42); f.quadraticCurveTo(40, 32, 17, 44); f.closePath();
    S(ctx, k, f, P.mint[2], P.mint[3], { gloss: [30, 16, 8, 3, -0.2] });
    S(ctx, k, circ(13.5, 6, 5), P.cream[0], P.stone[1], { off: 2, rim: false });
  }, 0.2, 1);
  def('gate', 110, 116, (ctx, k) => {
    const open = k.v === 'open';
    const arch = new Path2D(); arch.moveTo(4, 114); arch.lineTo(4, 36); arch.quadraticCurveTo(55, -8, 106, 36); arch.lineTo(106, 114); arch.lineTo(88, 114); arch.lineTo(88, 42); arch.quadraticCurveTo(55, 10, 22, 42); arch.lineTo(22, 114); arch.closePath();
    if (!open) for (let i = 0; i < 4; i++) { const x = 32 + i * 15.3; const bar = rrectPath(x - 3.5, 26 + Math.abs(i - 1.5) * 4, 7, 88 - Math.abs(i - 1.5) * 4, 3.5); S(ctx, k, bar, P.sky[2], P.sky[3], { off: 2, rim: false }); }
    S(ctx, k, arch, P.stone[1], P.stone[2], { off: 5, gloss: [18, 34, 5, 8, 0.5] });
    const lock = circ(55, 26, 8); S(ctx, k, lock, open ? P.mint[2] : P.grape[2], open ? P.mint[3] : P.grape[3], { off: 2, emissive: true });
  }, 0.5, 1);
  def('sign', 76, 84, (ctx, k) => {
    const post = rrectPath(33, 36, 10, 46, 3); S(ctx, k, post, P.cocoa[2], P.cocoa[3], { off: 2 });
    const t = head(k.v), arrow = t === '→' || t === '←';
    const board = arrow ? poly([[4, 8], [58, 8], [72, 23], [58, 40], [4, 40]]) : rrectPath(4, 6, 68, 36, 8);
    S(ctx, k, board, P.cocoa[1], P.cocoa[2], { off: 3, gloss: [16, 12, 7, 2.5, 0] });
    if (t && !arrow) text(ctx, k, t, 38, 24, 18); else { const a = poly([[18, 24], [50, 24]], false); detail(ctx, k, a, 2.4); const h = poly([[42, 16], [52, 24], [42, 32]], false); detail(ctx, k, h, 2.4); }
  }, 0.5, 1, { text: true });
  def('door', 80, 120, (ctx, k) => {
    const d = new Path2D(); d.moveTo(8, 118); d.lineTo(8, 40); d.quadraticCurveTo(8, 4, 40, 4); d.quadraticCurveTo(72, 4, 72, 40); d.lineTo(72, 118); d.closePath();
    S(ctx, k, d, P.cocoa[2], P.cocoa[3], { off: 6, gloss: [22, 24, 6, 9, 0.3] });
    for (const x of [28, 52]) { const l = poly([[x, 22], [x, 112]], false); detail(ctx, k, l, 0.9); }
    S(ctx, k, circ(60, 70, 4.5), P.stone[1], P.stone[2], { off: 1.5, rim: false });
    const win = circ(40, 32, 9); S(ctx, k, win, P.spark[1], P.peach[1], { off: 2, rim: false, emissive: true });
  }, 0.5, 1);
  def('ladder', 50, 124, (ctx, k) => {
    for (let i = 0; i < 5; i++) { const r = rrectPath(8, 14 + i * 24, 34, 7, 3); S(ctx, k, r, P.cocoa[1], P.cocoa[2], { off: 2, rim: false }); }
    for (const x of [6, 38]) { const s = rrectPath(x, 2, 8, 120, 4); S(ctx, k, s, P.cocoa[2], P.cocoa[3], { off: 2 }); }
  }, 0.5, 1);
  def('block', 64, 64, (ctx, k) => {
    const c = hue(k.v, 'sky'), R = P[c];
    const b = rrectPath(4, 4, 56, 56, 13); S(ctx, k, b, R[2], R[3], { off: 6, gloss: [17, 15, 7, 4, -0.5] });
    const inner = rrectPath(14, 14, 36, 36, 9); detail(ctx, k, inner, 0.9);
  }, 0.5, 1);

  // ---- learning ----
  def('tile', 64, 64, (ctx, k) => {
    const t = head(k.v) || '7', c = hue(k.v, 'sky'), R = P[c];
    const b = rrectPath(4, 4, 56, 56, 13); S(ctx, k, b, R[2], R[3], { off: 6 });
    const face = rrectPath(10, 8, 44, 44, 10); F(ctx, k, face, CREAM, 0.6);
    text(ctx, k, t, 32, 31, 32, INK);
  }, 0.5, 0.5, { text: true });
  def('pie', 64, 64, (ctx, k) => {
    const m = /^(\d+)\/(\d+)$/.exec(String(k.v || '1/2')) || [0, 1, 2];
    const den = Math.max(1, Math.min(16, +m[2])), num = Math.max(0, Math.min(den, +m[1]));
    const disc = circ(32, 32, 26); S(ctx, k, disc, CREAM, P.cream[3], { off: 4 });
    for (let i = 0; i < num; i++) { const a0 = -Math.PI / 2 + i * TAU / den, a1 = a0 + TAU / den; const s = new Path2D(); s.moveTo(32, 32); s.arc(32, 32, 26, a0, a1); s.closePath(); ctx.save(); ctx.translate(-0.6, -1); ctx.fillStyle = P.peach[2]; ctx.fill(s); ctx.restore(); }
    for (let i = 0; i < den; i++) { const a = -Math.PI / 2 + i * TAU / den; const l = poly([[32, 32], [32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26]], false); detail(ctx, k, l, 1); }
    ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w; ctx.stroke(disc);
  });
  def('clock', 64, 64, (ctx, k) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(k.v || '3:00')) || [0, 3, 0];
    const hh = (+m[1]) % 12, mm = Math.min(59, +m[2]);
    S(ctx, k, circ(32, 32, 28), P.sky[2], P.sky[3], { off: 4 });
    F(ctx, k, circ(32, 32, 21), CREAM, 0.6);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r0 = i % 3 ? 18 : 15.5; const l = poly([[32 + Math.sin(a) * r0, 32 - Math.cos(a) * r0], [32 + Math.sin(a) * 19.5, 32 - Math.cos(a) * 19.5]], false); detail(ctx, k, l, i % 3 ? 0.7 : 1.3); }
    const ha = (hh + mm / 60) * TAU / 12, ma = mm * TAU / 60;
    const hand = (a, len, w) => { const l = poly([[32, 32], [32 + Math.sin(a) * len, 32 - Math.cos(a) * len]], false); detail(ctx, k, l, w); };
    hand(ha, 10, 2.4); hand(ma, 15, 1.6);
    F(ctx, k, circ(32, 32, 2.6), P.coral[2], 0.5);
  });
  def('dice', 60, 60, (ctx, k) => {
    const n = Math.max(1, Math.min(6, +k.v || 5));
    const b = rrectPath(5, 5, 50, 50, 12); S(ctx, k, b, CREAM, P.cream[3], { off: 5, gloss: [16, 15, 6, 3, -0.4] });
    const at = { 1: [[30, 30]], 2: [[19, 19], [41, 41]], 3: [[18, 18], [30, 30], [42, 42]], 4: [[19, 19], [41, 19], [19, 41], [41, 41]], 5: [[18, 18], [42, 18], [30, 30], [18, 42], [42, 42]], 6: [[19, 17], [41, 17], [19, 30], [41, 30], [19, 43], [41, 43]] }[n];
    ctx.fillStyle = INK; for (const [x, y] of at) { ctx.beginPath(); ctx.arc(x, y, 4.6, 0, TAU); ctx.fill(); }
  });
  def('shape', 64, 64, (ctx, k) => {
    const name = head(k.v) || 'circle', c = hue(k.v, SHAPES[name] || 'sky'), R = P[c];
    let p;
    switch (name) {
      case 'square': p = rrectPath(9, 9, 46, 46, 6); break;
      case 'rectangle': p = rrectPath(4, 16, 56, 32, 6); break;
      case 'triangle': p = rpoly([[32, 6], [59, 54], [5, 54]], 5); break;
      case 'pentagon': p = rpoly(ngon(32, 34, 27, 5), 5); break;
      case 'hexagon': p = rpoly(ngon(32, 32, 27, 6, 0), 5); break;
      case 'diamond': p = rpoly([[32, 4], [56, 32], [32, 60], [8, 32]], 5); break;
      case 'oval': p = ellipsePath(32, 32, 28, 19); break;
      case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 28; pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]); } p = rpoly(pts, 3); break; }
      case 'heart': { p = new Path2D(); p.moveTo(32, 56); p.bezierCurveTo(6, 40, 4, 22, 14, 13); p.bezierCurveTo(22, 6, 30, 10, 32, 18); p.bezierCurveTo(34, 10, 42, 6, 50, 13); p.bezierCurveTo(60, 22, 58, 40, 32, 56); p.closePath(); break; }
      default: p = circ(32, 32, 26);
    }
    S(ctx, k, p, R[2], R[3], { off: 5, gloss: [22, 20, 6, 4, -0.6] });
  });
  def('book', 72, 60, (ctx, k) => {
    if (k.v === 'open') {
      for (const s of [-1, 1]) { const pg = new Path2D(); pg.moveTo(36, 14); pg.quadraticCurveTo(36 + s * 16, 6, 36 + s * 33, 10); pg.lineTo(36 + s * 33, 50); pg.quadraticCurveTo(36 + s * 16, 46, 36, 54); pg.closePath(); S(ctx, k, pg, CREAM, P.cream[3], { off: 2 }); for (let i = 0; i < 3; i++) { const l = new Path2D(); l.moveTo(36 + s * 8, 22 + i * 9); l.quadraticCurveTo(36 + s * 16, 18 + i * 9, 36 + s * 27, 20 + i * 9); detail(ctx, k, l, 0.6); } }
      return;
    }
    const pages = rrectPath(12, 12, 54, 42, 4); S(ctx, k, pages, CREAM, P.cream[3], { off: 2 });
    for (let i = 0; i < 3; i++) { const l = poly([[50, 18 + i * 9], [64, 18 + i * 9]], false); detail(ctx, k, l, 0.5); }
    const cover = rrectPath(6, 6, 50, 46, 6); S(ctx, k, cover, P.sky[2], P.sky[3], { gloss: [18, 14, 7, 3, -0.3] });
    F(ctx, k, rrectPath(16, 18, 30, 10, 4), CREAM, 0.6);
    const mark = poly([[40, 50], [40, 60], [44, 56], [48, 60], [48, 50]]); S(ctx, k, mark, P.coral[2], P.coral[3], { rim: false, off: 1 });
  }, 0.5, 0.5);
  def('pencil', 100, 28, (ctx, k) => {
    const body = rrectPath(22, 5, 62, 18, 3); S(ctx, k, body, P.sky[2], P.sky[3], { off: 3, gloss: [40, 9, 14, 2, 0] });
    const tip = poly([[22, 5], [4, 14], [22, 23]]); S(ctx, k, tip, P.peach[1], P.peach[2], { off: 2 });
    const lead = poly([[10, 11], [4, 14], [10, 17]]); F(ctx, k, lead, INK, 0.5);
    S(ctx, k, rrectPath(82, 4, 8, 20, 2), P.stone[1], P.stone[2], { off: 1, rim: false }); S(ctx, k, rrectPath(88, 4, 9, 20, 4), P.coral[1], P.coral[2], { off: 1 });
  });
  def('globe', 64, 76, (ctx, k) => {
    const stand = new Path2D(); stand.arc(32, 32, 30, Math.PI * 0.15, Math.PI * 0.85); ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 2.2; ctx.lineCap = 'round'; ctx.stroke(stand); ctx.strokeStyle = P.stone[1]; ctx.lineWidth = lines(k).w; ctx.stroke(stand);
    S(ctx, k, rrectPath(16, 66, 32, 8, 4), P.cocoa[2], P.cocoa[3], { off: 2 }); S(ctx, k, rrectPath(29, 58, 6, 10, 2), P.cocoa[2], P.cocoa[3], { rim: false, off: 1 });
    const ball = circ(32, 32, 24); S(ctx, k, ball, P.sky[2], P.sky[3], { off: 5 });
    ctx.save(); ctx.clip(ball); for (const [x, y, rx, ry, r] of [[22, 22, 10, 7, 0.5], [40, 40, 9, 11, -0.3], [44, 18, 5, 4, 0]]) F(ctx, k, ellipsePath(x, y, rx, ry, r), P.mint[2], 0.6); ctx.restore();
    ctx.save(); ctx.clip(ball); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(22, 18, 6, 4, -0.6, 0, TAU); ctx.fill(); ctx.restore();
  }, 0.5, 1);
  def('bulb', 52, 76, (ctx, k) => {
    const g = new Path2D(); g.moveTo(16, 50); g.bezierCurveTo(4, 40, 2, 26, 8, 16); g.bezierCurveTo(14, 4, 38, 4, 44, 16); g.bezierCurveTo(50, 26, 48, 40, 36, 50); g.closePath();
    S(ctx, k, g, P.spark[1], P.peach[1], { off: 4, gloss: [16, 18, 5, 7, -0.4], emissive: true });
    const fil = new Path2D(); fil.moveTo(20, 48); fil.lineTo(20, 32); fil.quadraticCurveTo(26, 24, 32, 32); fil.lineTo(32, 48); detail(ctx, k, fil, 1);
    for (let i = 0; i < 3; i++) S(ctx, k, rrectPath(15, 50 + i * 7, 22, 7, 3), P.stone[1], P.stone[2], { off: 1.5, rim: i === 2 });
  }, 0.5, 1);
  def('magnifier', 70, 70, (ctx, k) => {
    const h = capsule(42, 42, 62, 62, 6); S(ctx, k, h, P.cocoa[2], P.cocoa[3], { off: 2 });
    const ring = new Path2D(); ring.arc(28, 28, 22, 0, TAU); ring.moveTo(45, 28); ring.arc(28, 28, 17, 0, TAU, true);
    const lens = circ(28, 28, 17); F(ctx, k, lens, P.sky[0], 0.01); ctx.save(); ctx.clip(lens); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(21, 20, 6, 3.5, -0.7, 0, TAU); ctx.fill(); ctx.restore();
    S(ctx, k, ring, P.grape[2], P.grape[3], { off: 2 });
  });

  // ---- food ----
  def('apple', 56, 60, (ctx, k) => {
    const a = new Path2D(); a.moveTo(28, 16); a.bezierCurveTo(40, 8, 54, 16, 52, 34); a.bezierCurveTo(50, 52, 38, 58, 28, 54); a.bezierCurveTo(18, 58, 6, 52, 4, 34); a.bezierCurveTo(2, 16, 16, 8, 28, 16); a.closePath();
    const stem = capsule(28, 16, 31, 5, 2.4), leaf = ellipsePath(39, 9, 8, 4, -0.4);
    S(ctx, k, stem, P.cocoa[3], P.cocoa[3], { off: 1 }); S(ctx, k, leaf, P.mint[2], P.mint[3], { off: 2 });
    S(ctx, k, a, P.coral[2], P.coral[3], { off: 5, gloss: [16, 24, 5, 7, 0.3] });
  });
  def('banana', 70, 50, (ctx, k) => {
    const b = new Path2D(); b.moveTo(8, 12); b.quadraticCurveTo(14, 44, 46, 44); b.quadraticCurveTo(62, 44, 66, 36); b.quadraticCurveTo(46, 36, 30, 26); b.quadraticCurveTo(18, 18, 16, 8); b.closePath();
    S(ctx, k, b, P.spark[1], P.peach[1], { off: 4 }); F(ctx, k, rrectPath(9, 4, 8, 9, 3), P.cocoa[3], 0.6);
  });
  def('carrot', 40, 76, (ctx, k) => {
    for (const [x, r] of [[16, -0.4], [20, 0], [24, 0.4]]) { const l = ellipsePath(x + r * 10, 10, 4, 10, r); S(ctx, k, l, P.mint[2], P.mint[3], { off: 2 }); }
    const c = new Path2D(); c.moveTo(8, 20); c.quadraticCurveTo(20, 14, 32, 20); c.quadraticCurveTo(28, 50, 20, 72); c.quadraticCurveTo(12, 50, 8, 20); c.closePath();
    S(ctx, k, c, P.peach[2], P.peach[3], { off: 4, gloss: [14, 28, 3, 6, 0.2] });
    for (const y of [32, 44, 54]) { const l = poly([[14 + (y - 32) * 0.12, y], [20, y + 1]], false); detail(ctx, k, l, 0.8); }
  });
  def('cookie', 56, 56, (ctx, k) => {
    const c = new Path2D(); for (let i = 0; i <= 24; i++) { const a = i * TAU / 24, r = 23 + (i % 3 === 0 ? -1.5 : 0.6); i ? c.lineTo(28 + Math.cos(a) * r, 28 + Math.sin(a) * r) : c.moveTo(28 + r, 28); } c.closePath();
    S(ctx, k, c, P.cocoa[1], P.cocoa[2], { off: 4, gloss: [19, 18, 5, 3, -0.6] });
    for (const [x, y] of [[20, 22], [34, 18], [36, 34], [22, 38], [28, 28]]) F(ctx, k, ellipsePath(x, y, 3.6, 3, x * 0.1), P.cocoa[3], 0.5);
  });
  def('melon', 70, 48, (ctx, k) => {
    const rind = new Path2D(); rind.moveTo(4, 8); rind.lineTo(66, 8); rind.arc(35, 8, 31, 0, Math.PI); rind.closePath();
    S(ctx, k, rind, P.mint[2], P.mint[3], { off: 3 });
    const flesh = new Path2D(); flesh.moveTo(9, 8); flesh.lineTo(61, 8); flesh.arc(35, 8, 26, 0, Math.PI); flesh.closePath(); F(ctx, k, flesh, P.coral[1], 0.6);
    ctx.fillStyle = INK; for (const [x, y] of [[22, 16], [35, 22], [48, 16], [29, 28], [41, 28]]) { ctx.beginPath(); ctx.ellipse(x, y, 1.8, 3, 0.3, 0, TAU); ctx.fill(); }
  });
  def('cheese', 64, 50, (ctx, k) => {
    const w = poly([[4, 46], [60, 46], [60, 22], [4, 30]]); S(ctx, k, w, P.spark[1], P.peach[1], { off: 3 });
    const top = poly([[4, 30], [60, 22], [42, 6]]); S(ctx, k, top, P.spark[0], P.spark[1], { off: 2 });
    for (const [x, y, r] of [[18, 38, 4], [40, 34, 5], [52, 40, 3]]) F(ctx, k, circ(x, y, r), P.peach[1], 0.6);
  });
  def('cupcake', 60, 72, (ctx, k) => {
    const cup = poly([[12, 38], [48, 38], [43, 68], [17, 68]]); S(ctx, k, cup, P.sky[2], P.sky[3], { off: 3 });
    for (const x of [22, 30, 38]) { const l = poly([[x, 40], [x - (x - 30) * 0.15, 66]], false); detail(ctx, k, l, 0.7); }
    const fr = new Path2D(); fr.moveTo(8, 40); fr.quadraticCurveTo(4, 26, 18, 24); fr.quadraticCurveTo(22, 10, 32, 14); fr.quadraticCurveTo(46, 12, 46, 24); fr.quadraticCurveTo(58, 28, 52, 40); fr.closePath();
    S(ctx, k, fr, CREAM, P.cream[3], { off: 3, gloss: [20, 22, 6, 3, -0.3] });
    S(ctx, k, circ(32, 10, 6), P.coral[2], P.coral[3], { off: 2 });
    for (const [x, y, c] of [[18, 32, P.mint[2]], [30, 26, P.grape[1]], [42, 32, P.sky[2]]]) F(ctx, k, rrectPath(x, y, 6, 2.6, 1.3), c, 0.4);
  }, 0.5, 1);
  def('grapes', 56, 70, (ctx, k) => {
    const stem = capsule(28, 4, 30, 14, 2.2); S(ctx, k, stem, P.cocoa[3], P.cocoa[3], { off: 1 });
    S(ctx, k, ellipsePath(38, 10, 8, 4, -0.3), P.mint[2], P.mint[3], { off: 2 });
    for (const [x, y] of [[18, 22], [30, 20], [42, 22], [24, 34], [36, 34], [30, 46], [18, 44], [42, 44], [30, 58]]) S(ctx, k, circ(x, y, 7.5), P.grape[2], P.grape[3], { off: 2, gloss: [x - 2.5, y - 3, 1.8, 1.2, 0] });
  }, 0.5, 0.5);

  // ---- vehicles ----
  const wheel = (ctx, k, x, y, r) => { S(ctx, k, circ(x, y, r), INK, INK, { off: 0 }); F(ctx, k, circ(x, y, r * 0.45), P.stone[1], 0.5); };
  def('car', 124, 76, (ctx, k) => {
    const body = new Path2D(); body.moveTo(6, 56); body.lineTo(6, 40); body.quadraticCurveTo(8, 32, 22, 30); body.lineTo(34, 12); body.quadraticCurveTo(38, 6, 46, 6); body.lineTo(82, 6); body.quadraticCurveTo(90, 6, 94, 12); body.lineTo(106, 30); body.quadraticCurveTo(118, 32, 118, 44); body.lineTo(118, 56); body.closePath();
    S(ctx, k, body, P.sky[2], P.sky[3], { off: 5, gloss: [30, 36, 10, 3, 0] });
    for (const [x0, x1] of [[38, 62], [66, 92]]) { const w = poly([[x0, 14], [x1, 14], [x1 + (x1 > 80 ? 8 : 0), 30], [x0 - (x0 < 50 ? 8 : 0), 30]]); F(ctx, k, w, P.sky[0], 0.6); }
    F(ctx, k, rrectPath(110, 38, 8, 6, 2), P.spark[1], 0.5); F(ctx, k, rrectPath(6, 40, 6, 6, 2), P.coral[2], 0.5);
    wheel(ctx, k, 32, 60, 12); wheel(ctx, k, 92, 60, 12);
  }, 0.5, 1);
  def('bus', 164, 96, (ctx, k) => {
    const body = rrectPath(6, 6, 152, 70, 16); S(ctx, k, body, P.mint[2], P.mint[3], { off: 6, gloss: [30, 14, 14, 3, 0] });
    for (let i = 0; i < 5; i++) F(ctx, k, rrectPath(16 + i * 26, 16, 20, 22, 5), P.sky[0], 0.6);
    F(ctx, k, rrectPath(138, 16, 14, 40, 5), P.sky[0], 0.6);
    F(ctx, k, rrectPath(6, 48, 152, 8, 2), CREAM, 0.6);
    F(ctx, k, rrectPath(150, 62, 8, 7, 2), P.spark[1], 0.5);
    wheel(ctx, k, 40, 80, 13); wheel(ctx, k, 124, 80, 13);
  }, 0.5, 1);
  def('rocket', 76, 136, (ctx, k) => {
    if (k.v === 'go') { const fl = new Path2D(); fl.moveTo(26, 104); fl.quadraticCurveTo(38, 150, 50, 104); fl.closePath(); S(ctx, k, fl, P.spark[1], P.peach[2], { off: 4, emissive: true, unlit: true }); const fl2 = new Path2D(); fl2.moveTo(32, 104); fl2.quadraticCurveTo(38, 126, 44, 104); fl2.closePath(); F(ctx, k, fl2, CREAM, 0.4); glowMask(k, fl2); }
    for (const s of [-1, 1]) { const fin = rpoly([[38 + s * 14, 76], [38 + s * 30, 106], [38 + s * 12, 100]], 3); S(ctx, k, fin, P.coral[2], P.coral[3], { off: 2 }); }
    const b = new Path2D(); b.moveTo(38, 4); b.bezierCurveTo(60, 20, 62, 70, 54, 104); b.lineTo(22, 104); b.bezierCurveTo(14, 70, 16, 20, 38, 4); b.closePath();
    S(ctx, k, b, CREAM, P.cream[3], { off: 6, gloss: [28, 40, 4, 14, 0.1] });
    const nose = new Path2D(); nose.moveTo(38, 4); nose.bezierCurveTo(48, 11, 53, 20, 55, 28); nose.quadraticCurveTo(38, 22, 21, 28); nose.bezierCurveTo(23, 20, 28, 11, 38, 4); nose.closePath(); S(ctx, k, nose, P.coral[2], P.coral[3], { off: 2, rim: false });
    S(ctx, k, circ(38, 50, 11), P.sky[2], P.sky[3], { off: 2, rim: false }); F(ctx, k, circ(38, 50, 6.5), P.sky[0], 0.5);
  }, 0.5, 0.77);
  def('boat', 124, 96, (ctx, k) => {
    const mast = rrectPath(58, 6, 6, 70, 3); S(ctx, k, mast, P.cocoa[2], P.cocoa[3], { off: 1 });
    const sail = new Path2D(); sail.moveTo(66, 10); sail.quadraticCurveTo(100, 40, 104, 70); sail.lineTo(66, 70); sail.closePath(); S(ctx, k, sail, CREAM, P.cream[3], { off: 4 });
    const s2 = new Path2D(); s2.moveTo(56, 22); s2.quadraticCurveTo(32, 46, 26, 70); s2.lineTo(56, 70); s2.closePath(); S(ctx, k, s2, P.sky[1], P.sky[2], { off: 3 });
    const hull = new Path2D(); hull.moveTo(6, 72); hull.lineTo(118, 72); hull.quadraticCurveTo(108, 94, 90, 94); hull.lineTo(30, 94); hull.quadraticCurveTo(14, 94, 6, 72); hull.closePath();
    S(ctx, k, hull, P.coral[2], P.coral[3], { off: 4, gloss: [30, 78, 12, 2.5, 0] });
    F(ctx, k, rrectPath(16, 78, 92, 5, 2.5), CREAM, 0.5);
  }, 0.5, 1);
  def('plane', 136, 70, (ctx, k) => {
    const tail = rpoly([[14, 34], [6, 8], [26, 10], [40, 34]], 4); S(ctx, k, tail, P.coral[2], P.coral[3], { off: 2 });
    const body = new Path2D(); body.moveTo(10, 40); body.quadraticCurveTo(10, 28, 30, 28); body.lineTo(108, 28); body.quadraticCurveTo(132, 30, 132, 42); body.quadraticCurveTo(128, 52, 108, 52); body.lineTo(26, 52); body.quadraticCurveTo(10, 52, 10, 40); body.closePath();
    S(ctx, k, body, CREAM, P.cream[3], { off: 4, gloss: [60, 32, 22, 2.5, 0] });
    for (let i = 0; i < 4; i++) F(ctx, k, circ(54 + i * 14, 38, 3.8), P.sky[1], 0.5);
    F(ctx, k, rrectPath(110, 32, 14, 9, 4), P.sky[1], 0.5);
    const wing = rpoly([[58, 44], [86, 44], [64, 68], [50, 68]], 4); S(ctx, k, wing, P.sky[2], P.sky[3], { off: 2 });
  });

  // ---- nature ----
  atlas.define('tree', { w: 130, h: 180, ax: 0.5, ay: 1, draw(ctx, k) {
    const v = k.v || '';
    if (v === 'palm') {
      const tr = new Path2D(); tr.moveTo(58, 178); tr.quadraticCurveTo(60, 110, 74, 50); tr.lineTo(84, 52); tr.quadraticCurveTo(72, 110, 74, 178); tr.closePath(); S(ctx, k, tr, P.cocoa[1], P.cocoa[2], { off: 3 });
      for (let i = 0; i < 6; i++) { const y = 70 + i * 18; const l = poly([[62, y], [76, y - 3]], false); detail(ctx, k, l, 0.7); }
      for (const [a, len] of [[-2.7, 56], [-2.2, 50], [-1.3, 46], [-0.5, 52], [-0.05, 56]]) { const lf = new Path2D(); const ex = 79 + Math.cos(a) * len, ey = 50 + Math.sin(a) * len + 18; lf.moveTo(79, 48); lf.quadraticCurveTo(79 + Math.cos(a) * len * 0.6, 50 + Math.sin(a) * len * 0.6 - 14, ex, ey); lf.quadraticCurveTo(79 + Math.cos(a) * len * 0.5, 50 + Math.sin(a) * len * 0.5, 79, 52); lf.closePath(); S(ctx, k, lf, P.mint[2], P.mint[3], { off: 3 }); }
      for (const [x, y] of [[72, 56], [84, 58]]) S(ctx, k, circ(x, y, 6), P.cocoa[2], P.cocoa[3], { off: 1.5, rim: false });
      return;
    }
    const trunk = new Path2D(); trunk.moveTo(54, 178); trunk.quadraticCurveTo(58, 130, 56, 100); trunk.lineTo(74, 100); trunk.quadraticCurveTo(72, 130, 76, 178); trunk.closePath();
    S(ctx, k, trunk, P.cocoa[2], P.cocoa[3], { off: 3 });
    if (v === 'pine' || v === 'snow') {
      const layers = [[110, 58], [80, 48], [52, 36]];
      layers.forEach(([y, w], i) => { const t = rpoly([[65, y - 50 + i * 2], [65 + w, y + 10], [65 - w, y + 10]], 9); S(ctx, k, t, i % 2 ? P.mint[2] : mixMint(i), P.mint[3], { off: 5, gloss: i === 2 ? [56, y - 24, 4, 7, 0.5] : null });
        if (v === 'snow') { const cap = new Path2D(); cap.moveTo(65, y - 50 + i * 2 + 1); cap.lineTo(65 + w * 0.42, y - 18); cap.quadraticCurveTo(65 + w * 0.2, y - 12, 65, y - 18); cap.quadraticCurveTo(65 - w * 0.2, y - 12, 65 - w * 0.42, y - 18); cap.closePath(); F(ctx, k, cap, P.snow[0], 0.6); } });
      return;
    }
    const blobs = [[38, 76, 30], [92, 74, 30], [65, 50, 40], [50, 92, 26], [82, 92, 26]], can = new Path2D();
    for (const [x, y, r] of blobs) { can.moveTo(x + r, y); can.arc(x, y, r, 0, TAU); }
    ctx.strokeStyle = CREAM; ctx.lineWidth = lines(k).w + lines(k).rim * 2; ctx.stroke(can);
    ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w; ctx.stroke(can);
    ctx.fillStyle = P.mint[3]; ctx.fill(can, 'nonzero');
    ctx.save(); ctx.clip(can); ctx.translate(-5, -8); ctx.fillStyle = P.mint[2]; ctx.fill(can); ctx.restore();
    ctx.save(); ctx.clip(can); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(52, 34, 12, 7, -0.6, 0, TAU); ctx.fill(); ctx.restore();
    if (k.mask) { const m = k.mask(); m.strokeStyle = '#00FF00'; m.lineWidth = lines(k).w + lines(k).rim * 2; m.stroke(can); m.globalCompositeOperation = 'destination-out'; m.fill(can); m.globalCompositeOperation = 'lighter'; }
    for (const [x, y] of [[44, 70], [84, 62], [66, 92]]) F(ctx, k, circ(x, y, 5), P.coral[2], 0.5);
  } });
  const mixMint = i => (i === 0 ? adjustHex(P.mint[2], -0.04) : P.mint[2]);
  def('bush', 100, 60, (ctx, k) => {
    const b = new Path2D(); b.moveTo(6, 58); b.arc(24, 40, 18, Math.PI * 0.8, Math.PI * 1.6); b.arc(52, 28, 24, Math.PI * 1.15, Math.PI * 1.85); b.arc(78, 40, 18, Math.PI * 1.4, Math.PI * 2.2); b.lineTo(94, 58); b.closePath();
    S(ctx, k, b, P.mint[2], P.mint[3], { off: 6, gloss: [38, 22, 9, 4, -0.4] });
  }, 0.5, 1);
  def('rock', 84, 54, (ctx, k) => {
    const r = new Path2D(); r.moveTo(6, 52); r.quadraticCurveTo(2, 30, 18, 20); r.quadraticCurveTo(30, 4, 52, 8); r.quadraticCurveTo(76, 12, 80, 34); r.quadraticCurveTo(82, 46, 78, 52); r.closePath();
    S(ctx, k, r, P.stone[1], P.stone[2], { off: 6, gloss: [30, 18, 9, 4, -0.3] });
    const c = new Path2D(); c.moveTo(56, 20); c.quadraticCurveTo(62, 26, 60, 34); detail(ctx, k, c, 0.8);
  }, 0.5, 1);
  def('mushroom', 64, 64, (ctx, k) => {
    const stem = rrectPath(22, 30, 20, 32, 8); S(ctx, k, stem, CREAM, P.cream[3], { off: 3 });
    const cap = new Path2D(); cap.moveTo(4, 36); cap.bezierCurveTo(4, 6, 60, 6, 60, 36); cap.quadraticCurveTo(32, 42, 4, 36); cap.closePath();
    S(ctx, k, cap, P.grape[2], P.grape[3], { off: 5 });
    for (const [x, y, r] of [[20, 22, 5], [38, 16, 4], [48, 28, 3.5], [30, 30, 3]]) F(ctx, k, circ(x, y, r), CREAM, 0.5);
  }, 0.5, 1);
  def('leaf', 50, 50, (ctx, k) => {
    const l = new Path2D(); l.moveTo(6, 44); l.bezierCurveTo(4, 18, 22, 4, 46, 4); l.bezierCurveTo(46, 30, 30, 46, 6, 44); l.closePath();
    S(ctx, k, l, P.mint[2], P.mint[3], { off: 4 }); const v = new Path2D(); v.moveTo(8, 42); v.quadraticCurveTo(24, 26, 42, 8); detail(ctx, k, v, 0.9);
  });
  def('shell', 56, 50, (ctx, k) => {
    const s = new Path2D(); s.moveTo(28, 46); s.lineTo(8, 34); s.quadraticCurveTo(4, 8, 28, 4); s.quadraticCurveTo(52, 8, 48, 34); s.closePath();
    S(ctx, k, s, P.peach[1], P.peach[2], { off: 3 });
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { const l = poly([[28, 44], [28 + Math.sin(a) * 30, 44 - Math.cos(a) * 34]], false); detail(ctx, k, l, 0.7); }
    S(ctx, k, rrectPath(20, 42, 16, 7, 3), P.peach[2], P.peach[3], { off: 1, rim: false });
  }, 0.5, 1);
  def('cactus', 70, 110, (ctx, k) => {
    const armL = capsule(18, 66, 18, 40, 8), armR = capsule(52, 54, 52, 32, 7);
    const jl = capsule(18, 66, 30, 66, 8), jr = capsule(52, 54, 40, 54, 7);
    for (const p of [armL, jl, armR, jr]) S(ctx, k, p, P.mint[2], P.mint[3], { off: 2 });
    const body = capsule(35, 104, 35, 18, 13); S(ctx, k, body, P.mint[2], P.mint[3], { off: 4, gloss: [30, 30, 3, 9, 0] });
    for (const x of [30, 40]) { const l = poly([[x, 26], [x, 98]], false); detail(ctx, k, l, 0.6); }
    S(ctx, k, circ(35, 16, 5), P.coral[1], P.coral[2], { off: 1, rim: false });
  }, 0.5, 1);
  def('snowman', 80, 120, (ctx, k) => {
    for (const [y, r] of [[92, 26], [52, 20]]) S(ctx, k, circ(40, y, r), P.snow[0], P.snow[2], { off: 4 });
    const h = circ(40, 24, 15); S(ctx, k, h, P.snow[0], P.snow[2], { off: 3, gloss: [34, 18, 4, 3, -0.6] });
    const hat = rrectPath(28, 0, 24, 14, 3), brim = rrectPath(22, 11, 36, 5, 2.5); S(ctx, k, hat, P.ink[0], P.ink[0], { off: 0 }); S(ctx, k, brim, P.ink[0], P.ink[0], { off: 0, rim: false });
    ctx.fillStyle = INK; for (const x of [35, 45]) { ctx.beginPath(); ctx.arc(x, 22, 2.2, 0, TAU); ctx.fill(); }
    const n = poly([[39, 27], [52, 29], [39, 31]]); F(ctx, k, n, P.peach[2], 0.5);
    for (const y of [46, 58]) F(ctx, k, circ(40, y, 2.6), INK, 0.3);
    const sc = rrectPath(24, 36, 32, 7, 3.5); S(ctx, k, sc, P.coral[2], P.coral[3], { off: 1, rim: false });
  }, 0.5, 1);
  def('log', 96, 44, (ctx, k) => {
    const b = rrectPath(10, 6, 80, 34, 17); S(ctx, k, b, P.cocoa[2], P.cocoa[3], { off: 4, gloss: [34, 12, 12, 2.5, 0] });
    const end = ellipsePath(18, 23, 11, 16); S(ctx, k, end, P.cocoa[1], P.cocoa[2], { off: 2, rim: false });
    const ring = ellipsePath(18, 23, 5, 8); detail(ctx, k, ring, 0.7);
  }, 0.5, 1);
  def('grass', 50, 30, (ctx, k) => {
    const g = new Path2D(); g.moveTo(6, 28); g.quadraticCurveTo(8, 12, 4, 4); g.quadraticCurveTo(14, 12, 18, 22); g.quadraticCurveTo(20, 8, 26, 2); g.quadraticCurveTo(28, 14, 30, 22); g.quadraticCurveTo(36, 10, 46, 8); g.quadraticCurveTo(40, 18, 44, 28); g.closePath();
    S(ctx, k, g, P.mint[2], P.mint[3], { off: 3 });
  }, 0.5, 1);

  // ---- hazards: coral AND spiky, always ----
  def('spikes', 84, 44, (ctx, k) => {
    for (let i = 0; i < 4; i++) { const x = 12 + i * 20; const t = rpoly([[x, 6], [x + 10, 34], [x - 10, 34]], 2.5); S(ctx, k, t, P.coral[2], P.coral[3], { off: 2, gloss: [x - 2, 18, 1.5, 4, 0.3] }); }
    S(ctx, k, rrectPath(2, 32, 80, 10, 4), P.stone[2], P.stone[3], { off: 2 });
  }, 0.5, 1);
  def('thorn', 80, 64, (ctx, k) => {
    const vine = new Path2D(); vine.moveTo(6, 52); vine.bezierCurveTo(24, 20, 50, 58, 74, 18);
    const L = lines(k), at = [[18, 37, -2.2], [32, 37, 1.3], [46, 42, -2.3], [58, 36, 1.0], [67, 26, -2.0]];
    const th = at.map(([x, y, a]) => rpoly([[x + Math.cos(a) * 15, y + Math.sin(a) * 15], [x + Math.cos(a + 1.5) * 5.5, y + Math.sin(a + 1.5) * 5.5], [x + Math.cos(a - 1.5) * 5.5, y + Math.sin(a - 1.5) * 5.5]], 1.5));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 3.6 + L.rim * 2; ctx.stroke(vine); for (const t of th) ctx.stroke(t);
    ctx.strokeStyle = INK; ctx.lineWidth = L.w * 3.6; ctx.stroke(vine); ctx.strokeStyle = P.cocoa[2]; ctx.lineWidth = L.w * 1.6; ctx.stroke(vine);
    for (const t of th) S(ctx, k, t, P.coral[2], P.coral[3], { off: 1, rim: false });
    if (k.mask) { const m = k.mask(); m.strokeStyle = '#00FF00'; m.lineWidth = L.w * 3.6 + L.rim * 2; m.lineCap = 'round'; m.stroke(vine); }
  }, 0.5, 1);
  def('spikeball', 70, 70, (ctx, k) => {
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; const t = rpoly([[35 + Math.cos(a) * 33, 35 + Math.sin(a) * 33], [35 + Math.cos(a + 0.42) * 20, 35 + Math.sin(a + 0.42) * 20], [35 + Math.cos(a - 0.42) * 20, 35 + Math.sin(a - 0.42) * 20]], 2); S(ctx, k, t, P.coral[3], P.coral[3], { off: 0 }); }
    S(ctx, k, circ(35, 35, 22), P.coral[2], P.coral[3], { off: 4, gloss: [27, 27, 5, 3.5, -0.6] });
    for (const s of [-1, 1]) { const b = poly([[35 + s * 12, 28], [35 + s * 4, 32]], false); detail(ctx, k, b, 1.6); }
  });
}
/** Every prop sprite name, with the gallery's sample variants. */
export const PROP_NAMES = [].concat(...Object.values(PROP_GROUPS));
