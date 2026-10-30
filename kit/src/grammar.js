// The "Oomba Ink" illustration grammar (spec §2.2-2.4) as drawing helpers. Every character, prop and pickup goes
// through sticker(): Cream sticker rim, flat fill, one hard cel shade away from the top-start light, one gloss oval,
// round Ink outline at clamp(2, 0.055 h, 6) device px. Ink and rim are painted "unlit" in the mask; glowing parts
// are painted "emissive". Gradients only on sky, water and glow sprites. No blur, ever.
import { outline, rimWidth, INK, CREAM } from './tokens.js';
import { EMIT, UNLIT } from './atlas.js';

/** Line widths in art units for a sprite baked k.px device px tall at k.s px per unit. */
export function lines(k) {
  const w = outline(k.px) / k.s;
  return { w, inner: w * 0.6, rim: rimWidth(outline(k.px)) / k.s };
}
/** The 4-point curved spark (the logo's reward glyph): an astroid-like star centred at (x, y), radius r. */
export function sparkPath(x, y, r, pinch = 0.18) {
  const p = new Path2D(), q = r * pinch;
  p.moveTo(x, y - r);
  p.quadraticCurveTo(x + q, y - q, x + r, y);
  p.quadraticCurveTo(x + q, y + q, x, y + r);
  p.quadraticCurveTo(x - q, y + q, x - r, y);
  p.quadraticCurveTo(x - q, y - q, x, y - r);
  p.closePath();
  return p;
}
export function ellipsePath(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; }
export function rrectPath(x, y, w, h, r) {
  const p = new Path2D(); r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
  return p;
}
/**
 * sticker(ctx, k, path, {fill, shade, gloss:[x,y,rx,ry,rot]|null, rim=true, shadeOff, emissive=false, unlit=false, line})
 * unlit: the colour never changes with light (rewards: Spark stays #FFD23F at night).
 * Draws one shape the Oomba way. shadeOff: how far (art units) the lit copy is shifted toward the light.
 */
export function sticker(ctx, k, path, o = {}) {
  const L = lines(k), lw = o.line != null ? o.line * L.w : L.w;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.rim !== false) { ctx.strokeStyle = CREAM; ctx.lineWidth = lw + 2 * L.rim; ctx.stroke(path); }
  ctx.fillStyle = o.shade || o.fill; ctx.fill(path);
  if (o.shade) {
    ctx.save(); ctx.clip(path);
    const d = o.shadeOff != null ? o.shadeOff : 6;
    ctx.translate(-d * 0.55, -d); ctx.fillStyle = o.fill; ctx.fill(path);
    ctx.restore();
  }
  if (o.gloss) {
    const g = o.gloss; ctx.save(); ctx.clip(path); ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(g[0], g[1], g[2], g[3], g[4] || -0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (o.ink !== false) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(path); }
  if (k.mask) {
    const m = k.mask();
    if (o.emissive) { m.fillStyle = EMIT; m.fill(path); }
    if (o.unlit) { m.fillStyle = UNLIT; m.fill(path); }
    m.strokeStyle = UNLIT; m.lineWidth = (o.rim !== false ? lw + 2 * L.rim : lw); m.lineJoin = 'round'; m.stroke(path);
  }
}
/** An inner detail line (mouth, seam): Ink at 0.6 w, unlit. */
export function detail(ctx, k, path, width = 1) {
  const L = lines(k);
  ctx.strokeStyle = INK; ctx.lineWidth = L.inner * width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path);
  if (k.mask) { const m = k.mask(); m.strokeStyle = UNLIT; m.lineWidth = L.inner * width; m.lineCap = 'round'; m.stroke(path); }
}
/** The logo's ring eye: ring stroke 22% of the eye diameter on the mascot (ring = 0.22), thinner on animals and kids
 *  (so a kid's eyes never read as glasses), Cream inside and unlit (eye whites stay Cream at night). Pupils are
 *  separate sprites (they move). */
export function ringEye(ctx, k, x, y, d, ring = 0.22) {
  // Small sizes (a phone-sized character): the 2 px minimum line would fill the eye with Ink (a dark mask), so the
  // ring thins out there and the Cream stays open; the radius never goes negative.
  let sw = Math.max(d * ring, lines(k).inner * 1.4);
  const dev = d * (k.s || 1); if (dev < 14) sw = Math.min(sw, d * Math.max(0.12, ring * 0.7));
  sw = Math.min(sw, d * 0.4);
  const r = Math.max(0.5, d / 2 - sw / 2);
  const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = CREAM; ctx.fill(p);
  ctx.strokeStyle = INK; ctx.lineWidth = sw; ctx.stroke(p);
  if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); m.strokeStyle = UNLIT; m.lineWidth = sw; m.stroke(p); }
}
/** Paint the whole path emissive in the mask (lantern glass, spark cores, eye highlights). */
export function glowMask(k, path) { if (k.mask) { const m = k.mask(); m.fillStyle = EMIT; m.fill(path); } }
