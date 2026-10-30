// Core art: the sprites the engine itself needs (particles, sky bodies, rewards, lanterns) and
// the portrait mascot. Characters (chars.js), props (props.js) and biomes (biomes.js) build on the same grammar.
import { PALETTE, INK, CREAM } from './tokens.js';
import { sticker, detail, ringEye, sparkPath, ellipsePath, rrectPath, glowMask, lines } from './grammar.js';
import { EMIT, UNLIT } from './atlas.js';

const P = PALETTE;
const TAU = Math.PI * 2;

export function defineCoreArt(atlas) {
  const def = (name, w, h, draw, ax = 0.5, ay = 0.5) => atlas.define(name, { w, h, ax, ay, draw });
  // Tintable white shapes for particles.
  def('dot', 20, 20, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(10, 10, 9, 0, TAU); ctx.fill(); });
  def('puff', 40, 40, ctx => {
    ctx.fillStyle = '#FFFFFF';
    for (const [x, y, r] of [[20, 22, 13], [11, 24, 8], [29, 24, 8], [16, 15, 8], [25, 15, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  });
  def('chip', 20, 20, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(15, 3); ctx.lineTo(17, 15); ctx.lineTo(7, 17); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  def('confetti', 20, 12, ctx => { ctx.fillStyle = '#FFFFFF'; ctx.fill(rrectPath(1, 1, 18, 10, 3)); });
  def('twinkle', 40, 40, (ctx, k) => { const p = sparkPath(20, 20, 19, 0.12); ctx.fillStyle = '#FFFFFF'; ctx.fill(p); glowMask(k, p); });
  // Glow: the one place (with sky and water) where gradients are allowed. Baked once; drawn additive.
  def('glow', 64, 64, (ctx, k) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const m = k.mask(); m.fillStyle = EMIT; m.fillRect(0, 0, 64, 64);
  });
  // Contact shadow: an ellipse 70% x 18% of the sprite width, Ink, drawn at 18% (night 30%) alpha.
  def('shadow', 100, 26, ctx => { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(50, 13, 49, 12, 0, 0, TAU); ctx.fill(); });
  // Rewards and world bits.
  def('spark', 60, 60, (ctx, k) => {
    const p = sparkPath(30, 30, 24, 0.2);
    sticker(ctx, k, p, { fill: P.spark[2], shade: P.spark[3], shadeOff: 5, gloss: [24, 22, 4, 7, -0.7], unlit: true });
    const core = sparkPath(30, 30, 9, 0.2); ctx.fillStyle = P.spark[0]; ctx.fill(core); glowMask(k, core);
  });
  def('heart', 60, 56, (ctx, k) => {
    const p = new Path2D(); p.moveTo(30, 50); p.bezierCurveTo(6, 36, 4, 20, 12, 12); p.bezierCurveTo(20, 4, 28, 8, 30, 16); p.bezierCurveTo(32, 8, 40, 4, 48, 12); p.bezierCurveTo(56, 20, 54, 36, 30, 50); p.closePath();
    sticker(ctx, k, p, { fill: P.coral[2], shade: P.coral[3], shadeOff: 5, gloss: [18, 18, 5, 4, -0.6] });
  });
  def('bubble', 16, 16, (ctx, k) => { const p = ellipsePath(8, 8, 6.5, 6.5); ctx.fillStyle = 'rgba(255,253,242,0.28)'; ctx.fill(p); ctx.strokeStyle = 'rgba(255,253,242,0.9)'; ctx.lineWidth = 1.4; ctx.stroke(p); ctx.fillStyle = '#FFFDF2'; ctx.beginPath(); ctx.ellipse(5.6, 5.4, 1.8, 1.2, -0.6, 0, Math.PI * 2); ctx.fill(); });
  def('star', 16, 16, (ctx, k) => { const p = sparkPath(8, 8, 7, 0.16); ctx.fillStyle = '#FFF7D6'; ctx.fill(p); glowMask(k, p); });
  def('sun', 100, 100, (ctx, k) => {
    const g = ctx.createRadialGradient(50, 50, 18, 50, 50, 50);
    g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(1, 'rgba(255,226,122,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 100, 100);
    const d = ellipsePath(50, 50, 22, 22); ctx.fillStyle = '#FFF3C4'; ctx.fill(d); glowMask(k, d);
  });
  def('moon', 80, 80, (ctx, k) => {
    // a glowing moon: a bright halo that falls off softly (it reads as light, not a sticker, on any night sky)
    const g = ctx.createRadialGradient(40, 40, 15, 40, 40, 40);
    g.addColorStop(0, 'rgba(255,250,225,0.8)'); g.addColorStop(0.35, 'rgba(235,245,255,0.32)'); g.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 80, 80);
    const m = new Path2D(); m.arc(40, 40, 17, 0, TAU);
    ctx.fillStyle = CREAM; ctx.fill(m);
    ctx.save(); ctx.clip(m); ctx.fillStyle = '#E6E0C8'; ctx.beginPath(); ctx.arc(47, 35, 4, 0, TAU); ctx.arc(34, 47, 3, 0, TAU); ctx.fill(); ctx.restore();
    glowMask(k, m);
  });
  def('cloud', 160, 70, (ctx, k) => {
    const p = new Path2D();
    p.moveTo(30, 58); p.arc(30, 44, 14, Math.PI / 2, Math.PI * 1.5); p.arc(58, 32, 22, Math.PI, Math.PI * 1.75); p.arc(96, 28, 24, Math.PI * 1.2, Math.PI * 1.95);
    p.arc(130, 42, 16, Math.PI * 1.5, Math.PI / 2); p.closePath();
    // white with a clean sky-blue shade (never grey): the stage tints each cloud a little by the sky behind it
    sticker(ctx, k, p, { fill: '#FFFFFF', shade: '#DCEEFD', shadeOff: 6, rim: false, line: 0.7, gloss: null });
  });
  def('lantern', 40, 120, (ctx, k) => {
    const post = rrectPath(17, 40, 6, 78, 3); sticker(ctx, k, post, { fill: P.cocoa[2], shade: P.cocoa[3], shadeOff: 3, rim: true });
    const arm = new Path2D(); arm.moveTo(20, 42); arm.quadraticCurveTo(20, 18, 32, 18); detail(ctx, k, arm, 1.4);
    // warm glass with a brighter core (never pure white: the glow is the halo's job, so it never blows out)
    const glass = rrectPath(8, 18, 24, 26, 8); sticker(ctx, k, glass, { fill: '#FFE7A3', shade: P.spark[2], shadeOff: 3, gloss: [14, 25, 3, 5, -0.3] }); glowMask(k, glass);
    const core = ellipsePath(20, 32, 5.5, 7); ctx.fillStyle = '#FFF4D2'; ctx.fill(core);
    const cap = new Path2D(); cap.moveTo(5, 19); cap.quadraticCurveTo(20, 4, 35, 19); cap.closePath(); sticker(ctx, k, cap, { fill: P.cocoa[3], rim: false });
  }, 0.5, 1);
  // Water (level '~'): flat sky blues (gradients are allowed for water), ripples, and on the surface a wavy cream line.
  def('water', 64, 64, (ctx, k) => {
    const top = k.v === 'top', y0 = top ? 16 : -2, g = ctx.createLinearGradient(0, y0, 0, 66); g.addColorStop(0, top ? P.sky[1] : P.sky[2]); g.addColorStop(1, P.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(-1, y0, 66, 68 - y0);
    ctx.strokeStyle = 'rgba(255,253,242,0.55)'; ctx.lineCap = 'round'; ctx.lineWidth = lines(k).inner;
    for (const [x, y, w] of top ? [[10, 30, 16], [38, 44, 12], [20, 56, 10]] : [[14, 18, 10], [40, 40, 14]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
    if (top) { const p = new Path2D(); p.moveTo(-2, 16); for (let x = 0; x <= 66; x += 4) p.lineTo(x, 16 + Math.sin(x / 64 * Math.PI * 4) * 2.2); ctx.strokeStyle = 'rgba(255,253,242,0.9)'; ctx.lineWidth = lines(k).w * 1.6; ctx.stroke(p); ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 0.7; ctx.stroke(p); }
  });
  // Checkpoint (level 'K'): a post with a pennant, cream until reached ('on': mint with a spark).
  def('checkpoint', 50, 96, (ctx, k) => {
    const on = k.v === 'on';
    sticker(ctx, k, rrectPath(8, 82, 34, 12, 5), { fill: P.stone[1], shade: P.stone[2], shadeOff: 2 });
    sticker(ctx, k, rrectPath(12, 14, 6, 72, 3), { fill: P.cocoa[2], shade: P.cocoa[3], shadeOff: 2 });
    const f = new Path2D(); f.moveTo(18, 16); f.quadraticCurveTo(34, 18, 46, 28); f.quadraticCurveTo(34, 36, 18, 42); f.closePath();
    sticker(ctx, k, f, { fill: on ? P.mint[2] : CREAM, shade: on ? P.mint[3] : P.stone[1], shadeOff: 3 });
    const s = sparkPath(15, 10, on ? 9 : 6, 0.2); sticker(ctx, k, s, { fill: on ? P.spark[2] : P.stone[1], rim: false, line: 0.6, unlit: on }); if (on) glowMask(k, s);
  }, 0.5, 1);
  // The placeholder stage.add() shows for a name it does not know (with a warning naming the nearest real one).
  def('missing', 60, 60, (ctx, k) => {
    sticker(ctx, k, rrectPath(6, 6, 48, 48, 12), { fill: P.stone[0], shade: P.stone[1], shadeOff: 4 });
    const q = new Path2D(); q.moveTo(22, 24); q.bezierCurveTo(22, 12, 40, 12, 39, 24); q.bezierCurveTo(38, 31, 30, 30, 30, 38); detail(ctx, k, q, 2.4);
    const d = ellipsePath(30, 46, 2.6, 2.6); ctx.fillStyle = INK; ctx.fill(d);
  });
  def('flower', 30, 40, (ctx, k) => {
    const stem = new Path2D(); stem.moveTo(15, 39); stem.quadraticCurveTo(13, 26, 15, 16); detail(ctx, k, stem, 1.2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; const p = ellipsePath(15 + Math.cos(a) * 6, 13 + Math.sin(a) * 6, 5, 5); sticker(ctx, k, p, { fill: k.v === 'b' ? P.grape[1] : P.coral[1], rim: false, line: 0.6 }); }
    const c = ellipsePath(15, 13, 4, 4); sticker(ctx, k, c, { fill: P.spark[2], rim: false, line: 0.6 });
  }, 0.5, 1);
  defineOomba(atlas);
}

// ---- The Oomba mascot (spec §6.2): a mint bean, the logo's ring eyes looking up at an emissive spark antenna. -----
// Box 100 x 124 art units, anchored at the feet. Pupils and lids are separate sprites so eyes can look and blink.
export const OOMBA = { w: 100, h: 124, eyes: [[37, 70], [63, 70]], eyeD: 26, pupilD: 8 };
function oombaBody() {
  const p = new Path2D();
  p.moveTo(50, 42); p.bezierCurveTo(79, 42, 90, 66, 89, 88); p.bezierCurveTo(88, 108, 72, 117, 50, 117); p.bezierCurveTo(28, 117, 12, 108, 11, 88); p.bezierCurveTo(10, 66, 21, 42, 50, 42); p.closePath();
  return p;
}
function defineOomba(atlas) {
  atlas.define('oomba', { w: OOMBA.w, h: OOMBA.h, ax: 0.5, ay: 1, draw(ctx, k) {
    const L = lines(k);
    for (const x of [35, 65]) sticker(ctx, k, ellipsePath(x, 117, 10, 6), { fill: P.mint[3], rim: true });
    const stalk = new Path2D(); stalk.moveTo(50, 44); stalk.bezierCurveTo(50, 30, 56, 26, 58, 18);
    ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 1.2 + 2 * L.rim; ctx.stroke(stalk);
    const body = oombaBody();
    sticker(ctx, k, body, { fill: P.mint[2], shade: P.mint[3], shadeOff: 9, gloss: [30, 56, 9, 6, -0.6] });
    ctx.save(); ctx.clip(body); ctx.fillStyle = P.mint[0]; ctx.beginPath(); ctx.ellipse(50, 102, 21, 13, 0, 0, TAU); ctx.fill(); ctx.restore();
    detail(ctx, k, stalk, 2);
    const spark = sparkPath(58, 15, 12, 0.2);
    sticker(ctx, k, spark, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, emissive: true, unlit: true });
    for (const [x, y] of OOMBA.eyes) ringEye(ctx, k, x, y, OOMBA.eyeD);
    ctx.fillStyle = 'rgba(255,156,143,0.75)'; for (const x of [25, 75]) { ctx.beginPath(); ctx.ellipse(x, 87, 6, 3.5, 0, 0, TAU); ctx.fill(); }
    const mouth = new Path2D(); mouth.moveTo(44, 86); mouth.quadraticCurveTo(50, 92, 56, 86); detail(ctx, k, mouth, 1.3);
  } });
  // Pupil: solid ink, 55% of the eye's inner diameter, with a highlight dot at the top-start (emissive at night).
  atlas.define('pupil', { w: 12, h: 12, ax: 0.5, ay: 0.5, draw(ctx, k) {
    const p = ellipsePath(6, 6, OOMBA.pupilD / 2, OOMBA.pupilD / 2); ctx.fillStyle = INK; ctx.fill(p);
    const h = ellipsePath(4.6, 4.4, 1.3, 1.3); ctx.fillStyle = '#FFFFFF'; ctx.fill(h);
    const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); m.fillStyle = EMIT; m.fill(h);
  } });
  // Lids (blink / sleepy): body-coloured caps with the closed-eye curve.
  atlas.define('oomba-lids', { w: OOMBA.w, h: OOMBA.h, ax: 0.5, ay: 1, draw(ctx, k) {
    const L = lines(k);
    for (const [x, y] of OOMBA.eyes) {
      const c = ellipsePath(x, y, OOMBA.eyeD / 2 + L.w * 0.3, OOMBA.eyeD / 2 + L.w * 0.3); ctx.fillStyle = P.mint[2]; ctx.fill(c);
      const lid = new Path2D(); lid.moveTo(x - 9, y); lid.quadraticCurveTo(x, y + 7, x + 9, y); detail(ctx, k, lid, 1.6);
    }
  } });
}
