// Props, pickups and learning items (spec §6.3), all drawn in code with the "Oomba Ink" grammar. Variants come in the
// entity's `variant` (k.v): tile 'A' or '7:grape', pie '3/4', clock '3:15', dice '5', shape 'triangle:sky', sign text,
// chest/gate/book 'open', tree 'pine' | 'palm' | 'snow', flower 'b'. Spark yellow (#FFD23F) only on rewards.
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
export function text(ctx, k, s, x, y, size, color = INK, weight = 800) {
  ctx.font = `${weight} ${size}px ${fontStack('en')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width, max = size * 1.6; if (w > max) { ctx.save(); ctx.translate(x, y); ctx.scale(max / w, 1); x = 0; y = 0; }
  ctx.fillStyle = color; ctx.fillText(s, x, y + size * 0.04);
  if (w > max) ctx.restore();
}

export const PROP_GROUPS = {
  treasure: ['spark', 'coin', 'gem', 'heart', 'key', 'chest', 'medal', 'trophy', 'gift'],
  world: ['crate', 'platform', 'spring', 'flag', 'gate', 'sign', 'lantern', 'door', 'ladder', 'block'],
  nature: ['tree', 'bush', 'flower', 'rock', 'mushroom', 'cloud', 'leaf', 'grass'],
  hazards: ['spikes', 'thorn', 'spikeball'],
};
export const REWARD_PROPS = ['spark', 'coin', 'key', 'chest', 'medal', 'trophy', 'lantern', 'bulb'];
export const PROP_VARIANTS = { chest: ['', 'open'], gate: ['', 'open'], tree: ['', 'pine', 'palm', 'snow'], flower: ['', 'b'], sign: ['', 'Go!', '→'] };

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
  // a one-way ledge, one tile per level cell (variant 'l' | 'm' | 'r' | '' alone): a constant-thickness slab of soil
  // with a grass top; the middle tiles run past their edges so a long ledge reads as one solid plank
  def('ledge', 64, 30, (ctx, k) => {
    const v = String(k.v || ''), L = v === 'l' || v === '', R = v === 'r' || v === '';
    const x0 = L ? 3 : -40, x1 = R ? 61 : 104;
    const body = rrectPath(x0, 6, x1 - x0, 21, 9); S(ctx, k, body, P.cocoa[2], P.cocoa[3], { off: 3, rim: L || R });
    const grass = rrectPath(x0 - 1, 2, x1 - x0 + 2, 11, 6); S(ctx, k, grass, P.mint[2], P.mint[3], { off: 2, rim: false });
    for (const x of [16, 46]) F(ctx, k, circ(x, 20, 2.2), P.cocoa[1], 0.5);
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
