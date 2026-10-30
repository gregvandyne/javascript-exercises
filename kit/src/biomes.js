// Biomes (spec §6.3): parallax background bands (far -> near) baked once per view size into tileable canvases, a sky
// tint, and auto-tiled ground (16-case neighbour rule: rounded exposed corners, a lip on top, Ink on top edges only).
// Night is not a separate set: both backends light the same bands (Paper's baked night variant, Glaze's ambient).
import { PALETTE, INK, CREAM } from './tokens.js';
import { mixHex, adjustHex } from './color.js';
import { mulberry32 } from './rand.js';
import { EMIT, UNLIT } from './atlas.js';
import { rrectPath, ellipsePath } from './grammar.js';

const P = PALETTE, TAU = Math.PI * 2;
const m = mixHex;
// Per biome: sky tint (mixed into the day sky), 4 bands {fill, shade, profile, dressing}, ground {top, lip, soil, dots}.
// Bands follow aerial perspective: far = clean sky-blue mixed into the hue (never grey), near = the hue at full chroma.
// Dressing (the "auto-dressing" every game gets): 'kind:spacing' entries, comma-separated; spacing in design px between
// props on average, a trailing 'c' places them in clusters of 2-4 with air between groups (rhythm, not a fence).
const HAZE = '#7CC4F5', GRASS = m(P.mint[2], P.spark[2], 0.2);
export const BIOMES = {
  meadow: { sky: null, bands: [
    [m(HAZE, P.mint[1], 0.3), m('#5E9FD8', P.mint[2], 0.2), 'peaks', ''],
    [m(P.mint[1], HAZE, 0.3), m(P.mint[2], '#5AA9E6', 0.4), 'hills', 'tree:70c,pine:150'],
    [m(P.mint[2], P.spark[2], 0.1), m(P.mint[3], P.mint[2], 0.35), 'hills', 'tree:150c,bush:110,tuft:45'],
    [GRASS, m(P.mint[3], P.spark[3], 0.15), 'hills', 'tree:230c,rocks:420,bush:150,flower:34,tuft:26']],
  ground: [GRASS, P.mint[3], P.cocoa[2], P.cocoa[1]] },
  forest: { sky: ['#57B6EC', '#C9EEDB', 0.45], bands: [
    [m(HAZE, P.mint[2], 0.35), m('#5E9FD8', P.mint[3], 0.3), 'peaks', 'pine:30'],
    [m(P.mint[2], HAZE, 0.3), m(P.mint[3], '#4E95D0', 0.3), 'hills', 'pine:34'],
    [m(P.mint[3], P.mint[2], 0.45), m(P.mint[3], INK, 0.12), 'hills', 'pine:60c,tree:180c,bush:120'],
    [m(P.mint[3], P.spark[2], 0.12), m(P.mint[3], INK, 0.2), 'hills', 'pine:170c,mush:80,rocks:400,tuft:30']],
  ground: [m(P.mint[3], P.mint[2], 0.4), m(P.mint[3], INK, 0.15), P.cocoa[3], P.cocoa[2]] },
  beach: { sky: ['#3FAEF5', '#BDEBFF', 0.8], bands: [
    ['#38B6F0', m('#38B6F0', P.sky[3], 0.4), 'sea', ''],
    ['#5CCBF7', m('#38B6F0', P.sky[3], 0.25), 'sea', 'wave:40'],
    ['#FFE3A1', m('#FFE3A1', P.peach[2], 0.5), 'dunes', 'palm:110c,umbrella:150,shell:60'],
    [m('#FFE3A1', P.peach[1], 0.35), P.peach[2], 'dunes', 'palm:260c,shell:40,tuft:70']],
  ground: ['#FFE3A1', P.peach[1], P.peach[1], P.peach[2]] },
  snow: { sky: ['#6CBDF3', '#E3F3FD', 0.75], bands: [
    [m(HAZE, P.snow[2], 0.35), m('#5E9FD8', P.snow[3], 0.3), 'peaks', 'cap'],
    [P.snow[1], m(P.snow[3], HAZE, 0.4), 'hills', 'snowpine:50c'],
    [P.snow[0], m(P.snow[2], HAZE, 0.3), 'hills', 'snowpine:120c,rocks:300'],
    [P.snow[0], m(P.snow[2], HAZE, 0.45), 'hills', 'snowpine:220c,rocks:380,tuft:90']],
  ground: [P.snow[0], P.snow[2], P.stone[2], P.stone[1]] },
  desert: { sky: ['#F49A5C', '#FFE3A6', 0.85], bands: [
    [m(P.peach[1], P.coral[1], 0.35), m(P.peach[2], P.coral[1], 0.4), 'mesa', ''],
    [P.peach[1], P.peach[2], 'mesa', 'cactus:160c'],
    [m(P.peach[0], P.peach[1], 0.6), P.peach[1], 'dunes', 'cactus:150c,rocks:200'],
    [P.peach[0], m(P.peach[0], P.peach[1], 0.7), 'dunes', 'cactus:220c,rocks:180,tuft:60']],
  ground: [P.peach[1], P.peach[2], P.cocoa[1], P.peach[2]] },
  candy: { sky: ['#F28CC4', '#FFD9EC', 0.85], bands: [
    [m(P.grape[1], P.coral[1], 0.35), m(P.grape[2], P.coral[1], 0.4), 'hills', ''],
    [P.grape[1], m(P.grape[1], P.grape[2], 0.5), 'hills', 'lolly:70c'],
    [P.coral[1], P.coral[2], 'hills', 'lolly:120c,drops:60'],
    [m(P.mint[1], P.mint[2], 0.5), P.mint[2], 'hills', 'lolly:200c,drops:40']],
  ground: [P.coral[1], P.coral[2], P.cocoa[1], CREAM] },
};
export const BIOME_NAMES = Object.keys(BIOMES);
/** Art packs add biomes, band profiles ((o) -> yAt(x)) and decorations ((ctx, mx, x, y, s, R, fill, shade, k, D) where D
 *  has the Ink helpers). The dress pack adds big props (houses, fences, tents...), richer dressing per biome, foreground
 *  framing and ambient life: RECIPES[biome] = {bands: [4 dressing strings], fg, life}. */
export const PROFILES = {}, DECOS = {}, RECIPES = {};
export function addBiome(name, def, o = {}) { BIOMES[name] = def; if (!BIOME_NAMES.includes(name)) BIOME_NAMES.push(name); Object.assign(PROFILES, o.profiles); Object.assign(DECOS, o.decos); }
const LEGACY = { pines: 34, snowpine: 34, wave: 60, cap: 1e9 };

/** Bake a biome's parallax bands into canvases that tile horizontally -> [{canvas, mask, par, top, h, w}].
 *  dress: 'auto' (default: the full recipe) | 'off' (sparse: no big props) | a number (density x). */
export function biomeBands(doc, { biome = 'meadow', vw, vh, pxk, seed = 1, count = 3, dress = 'auto' }) {
  const B = BIOMES[biome] || BIOMES.meadow, out = [], rec = (RECIPES[biome] || {}).bands;
  // [parallax, top (fraction of the view height), height]: hill tops climb to 34% so the sky is at most ~40% of a frame
  const geo = [[0.12, 0.34, 0.16], [0.28, 0.46, 0.12], [0.5, 0.58, 0.09], [0.8, 0.72, 0.05]];
  const n = Math.max(2, Math.min(4, count)), pick = n === 4 ? [0, 1, 2, 3] : n === 3 ? [0, 2, 3] : [1, 3];
  const W = Math.ceil(vw * 1.5), dens = dress === 'off' ? 0.35 : typeof dress === 'number' ? Math.max(0.2, Math.min(2, dress)) : 1;
  const sK = Math.max(1, Math.min(2.4, vh / vw * 1.25));   // tall (portrait) views: props grow with the view, not the width
  for (const bi of pick) {
    const [par, topF, amp] = geo[bi], [fill, shade, profile, deco0] = B.bands[bi], deco = rec && rec[bi] != null ? rec[bi] : deco0;
    const R = mulberry32(seed * 977 + Math.round(par * 1000) + biome.length * 31);
    const pad = Math.round(vh * 0.2), top = topF * vh - pad, H = Math.ceil(vh - top + vh * 0.12);   // pad: headroom for tall props
    const k = Math.min(pxk, 4096 / W);
    const c = doc.createElement('canvas'); c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
    const mk = doc.createElement('canvas'); mk.width = c.width; mk.height = c.height;
    const ctx = c.getContext('2d'), mx = mk.getContext('2d');
    ctx.scale(k, k); mx.scale(k, k); ctx.translate(0, pad); mx.translate(0, pad);
    const f = [2 + bi, 3 + bi * 1.5, 5 + bi * 2].map(Math.round), ph = f.map(() => R() * TAU), amps = f.map((x, i) => (R() * 0.5 + 0.5) / (i + 1));
    const base = x => { let y = 0; f.forEach((q, i) => { y += Math.sin((x / W) * TAU * q + ph[i]) * amps[i]; }); return y; };
    let raw;
    if (profile === 'sea') raw = x => Math.sin((x / W) * TAU * 24 + ph[0]) * 1.4;
    else if (profile === 'mesa') { raw = x => { const q = Math.max(-0.2, Math.min(0.45, base(x))); return (q > 0.2 ? -0.8 : q); }; }
    else if (profile === 'peaks') raw = x => { let y = 0; f.forEach((q, i) => { y += Math.abs(Math.sin((x / W) * TAU * q * 0.8 + ph[i])) * amps[i]; }); return -y; };
    else if (PROFILES[profile]) raw = PROFILES[profile]({ vh, amp, W, base, R, f, ph, amps });
    else if (profile === 'dunes') raw = x => Math.sin((x / W) * TAU * f[0] + ph[0]);
    else raw = base;
    // normalise every profile to its band: the highest point at the band's top, the lowest `amp` of the view below it
    let lo = Infinity, hi = -Infinity; for (let x = 0; x <= W; x += 6) { const y = raw(x); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const flat = profile === 'sea' || hi - lo < 1e-6, yAt = flat ? x => 4 + raw(x) : x => 3 + (raw(x) - lo) / (hi - lo) * amp * vh;
    const STEP = 6, path = new Path2D(); path.moveTo(0, H);
    for (let x = 0; x <= W; x += STEP) path.lineTo(x, yAt(x)); path.lineTo(W, H); path.closePath();
    ctx.fillStyle = fill; ctx.fill(path);
    ctx.save(); ctx.clip(path); ctx.translate(0, vh * 0.06); ctx.fillStyle = shade; ctx.globalAlpha = 0.55; ctx.fill(path); ctx.restore();
    if (profile === 'sea') { ctx.save(); ctx.clip(path); ctx.strokeStyle = 'rgba(255,253,242,0.5)'; ctx.lineWidth = 2; for (let y = 18; y < H; y += 22) { ctx.beginPath(); for (let x = 0; x <= W; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2); ctx.stroke(); } ctx.restore(); }
    if (profile === 'peaks') { ctx.save(); ctx.clip(path); ctx.fillStyle = P.snow[0]; ctx.beginPath(); for (let x = 0; x <= W; x += STEP) ctx.lineTo(x, Math.min(yAt(x) + vh * 0.035, amp * vh * 0.4)); ctx.lineTo(W, -pad); ctx.lineTo(0, -pad); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const lip = new Path2D(); for (let x = 0; x <= W; x += STEP) { const y = yAt(x); x === 0 ? lip.moveTo(x, y) : lip.lineTo(x, y); }
    const lw = Math.max(2, Math.min(6, 0.055 * 60 * k)) / k * (0.6 + par * 0.5);
    ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(lip);
    mx.strokeStyle = UNLIT; mx.lineWidth = lw; mx.lineJoin = 'round'; mx.stroke(lip);
    // dressing: big props first (behind), seeded per prop so the copy across the tile seam draws identically
    const sc0 = (0.55 + par * 0.6) * sK;
    for (const ent of String(deco || '').split(',').filter(Boolean)) {
      const [kind, sp0] = ent.split(':'), cl = /c$/.test(sp0 || ''), legacy = !sp0;
      if (!legacy && dress === 'off' && cl) continue;
      const sp = (legacy ? LEGACY[kind] || 100 : parseFloat(sp0)) * Math.sqrt(sK) / dens;
      let x = R() * sp;
      while (x < W) {
        const group = cl ? 2 + ((R() * 3) | 0) : 1;
        for (let g = 0; g < group && x < W; g++) {
          const ps = (R() * 1e9) | 0, flip = R() < 0.5, ss = sc0 * (0.72 + R() * 0.6);
          for (const dx of [0, -W, W]) {
            const xx = x + dx; if (xx < -200 || xx > W + 200) continue;
            if (flip) { ctx.save(); mx.save(); ctx.translate(2 * xx, 0); ctx.scale(-1, 1); mx.translate(2 * xx, 0); mx.scale(-1, 1); }
            decorate(ctx, mx, kind, xx, yAt(((x % W) + W) % W) + 2, ss, mulberry32(ps), fill, shade, k);
            if (flip) { ctx.restore(); mx.restore(); }
          }
          x += cl ? sp * 0.28 * (0.6 + R() * 0.8) : sp * (0.5 + R());
        }
        if (cl) x += sp * group * 0.75 * (0.6 + R() * 0.8);
      }
    }
    out.push({ canvas: c, mask: mk, par, top, h: H, w: W });
  }
  return out;
}
const lwOf = (r, k) => Math.max(1.5, 0.055 * 2 * r * k) / k;
function ink(ctx, mx, p, lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(p); mx.strokeStyle = UNLIT; mx.lineWidth = lw; mx.stroke(p); }
function blob(ctx, mx, p, fill, shade, k, r) { ctx.fillStyle = shade; ctx.fill(p); ctx.save(); ctx.clip(p); ctx.translate(-r * 0.12, -r * 0.2); ctx.fillStyle = fill; ctx.fill(p); ctx.restore(); ink(ctx, mx, p, lwOf(r, k)); }
const DECO_KIT = { ink, blob, lwOf, flowerAt, P, INK, CREAM, mix: mixHex, adjust: adjustHex };
function decorate(ctx, mx, kind, x, y, s, R, fill, shade, k) {
  if (DECOS[kind]) return DECOS[kind](ctx, mx, x, y, s, R, fill, shade, k, DECO_KIT);
  if (kind === 'bush') { const r = (14 + R() * 12) * s * 1.4; const p = new Path2D(); p.arc(x - r * 0.7, y + 4, r * 0.65, Math.PI, 0); p.arc(x, y + 4 - r * 0.25, r * 0.8, Math.PI, 0); p.arc(x + r * 0.75, y + 4, r * 0.6, Math.PI, 0); p.closePath(); blob(ctx, mx, p, mixHex(fill, '#FFFFFF', 0.08), shade, k, r); }
  else if (kind === 'flower') flowerAt(ctx, mx, x, y, s, R() < 0.5 ? P.coral[1] : P.grape[1], k);
  else if (kind === 'pine' || kind === 'pines' || kind === 'snowpine') {
    // two shapes (a slim spire, a stacked three-tier fir), heights vary +-40%
    const h = (54 + R() * 46) * s, w = h * (0.3 + R() * 0.1), tiers = R() < 0.5, sn = kind === 'snowpine';
    const col = sn ? m(P.mint[3], P.sky[2], 0.3) : m(fill, P.mint[3], 0.55), p = new Path2D();
    const tr = new Path2D(); tr.rect(x - w * 0.12, y - h * 0.12, w * 0.24, h * 0.14); blob(ctx, mx, tr, P.cocoa[2], P.cocoa[3], k, w * 0.2);
    if (tiers) for (let i = 0; i < 3; i++) { const ty = y - h * 0.1 - i * h * 0.27, tw = w * (1 - i * 0.24); p.moveTo(x, ty - h * 0.42); p.lineTo(x + tw, ty); p.lineTo(x - tw, ty); p.closePath(); }
    else { p.moveTo(x, y - h); p.lineTo(x + w, y - h * 0.08); p.lineTo(x - w, y - h * 0.08); p.closePath(); }
    blob(ctx, mx, p, col, m(shade, INK, 0.15), k, w);
    if (sn) { const c = new Path2D(); c.moveTo(x, y - h); c.lineTo(x + w * 0.42, y - h * 0.6); c.lineTo(x - w * 0.42, y - h * 0.6); c.closePath(); ctx.fillStyle = P.snow[0]; ctx.fill(c); ink(ctx, mx, c, lwOf(w, k) * 0.6); }
  } else if (kind === 'tree') {
    // a round leafy tree: trunk, three canopy blobs with a sunlit cap, a few fruit/blossom dots
    const h = (78 + R() * 52) * s, r = h * (0.26 + R() * 0.06), tr = new Path2D(), cy = y - h + r;
    tr.moveTo(x - r * 0.16, y + 2); tr.lineTo(x - r * 0.1, cy); tr.lineTo(x + r * 0.1, cy); tr.lineTo(x + r * 0.2, y + 2); tr.closePath();
    blob(ctx, mx, tr, P.cocoa[2], P.cocoa[3], k, r * 0.3);
    const c = new Path2D(); c.arc(x - r * 0.62, cy + r * 0.25, r * 0.7, 0, TAU); c.arc(x + r * 0.62, cy + r * 0.2, r * 0.68, 0, TAU); c.arc(x, cy - r * 0.3, r * 0.9, 0, TAU);
    const leaf = m(fill, P.mint[3], 0.25 + R() * 0.3);
    ctx.fillStyle = m(shade, INK, 0.1); ctx.fill(c); ctx.save(); ctx.clip(c); ctx.translate(-r * 0.18, -r * 0.24); ctx.fillStyle = leaf; ctx.fill(c); ctx.translate(-r * 0.12, -r * 0.2); ctx.fillStyle = m(leaf, P.spark[1], 0.2); ctx.globalAlpha = 0.6; ctx.fill(c); ctx.restore();
    ctx.save(); ctx.clip(c); ctx.fillStyle = m(shade, INK, 0.1); ctx.fillRect(x - r * 2, cy + r * 0.35, r * 4, r * 2); ctx.restore();
    ink(ctx, mx, c, lwOf(r, k));
    if (R() < 0.5) { ctx.fillStyle = R() < 0.5 ? P.coral[2] : CREAM; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (R() - 0.5) * r * 1.8, cy + (R() - 0.6) * r, r * 0.07, 0, TAU); ctx.fill(); } }
  } else if (kind === 'palm') {
    const h = 70 * s; ctx.strokeStyle = INK; ctx.lineWidth = 7 * s; ctx.lineCap = 'round'; const tr = new Path2D(); tr.moveTo(x, y + 2); tr.quadraticCurveTo(x + 6 * s, y - h * 0.5, x + 14 * s, y - h); ctx.stroke(tr); ctx.strokeStyle = P.cocoa[1]; ctx.lineWidth = 4 * s; ctx.stroke(tr);
    for (const a of [-2.8, -2.2, -1.2, -0.4, 0.1]) { const l = new Path2D(); const tx = x + 14 * s, ty = y - h; l.moveTo(tx, ty); l.quadraticCurveTo(tx + Math.cos(a) * 22 * s, ty + Math.sin(a) * 22 * s - 8 * s, tx + Math.cos(a) * 34 * s, ty + Math.sin(a) * 30 * s + 10 * s); ctx.strokeStyle = INK; ctx.lineWidth = 8 * s; ctx.stroke(l); ctx.strokeStyle = P.mint[2]; ctx.lineWidth = 5 * s; ctx.stroke(l); }
  } else if (kind === 'shell' || kind === 'rock' || kind === 'drops' || kind === 'mush') {
    const r = (6 + R() * 6) * s * 1.4, col = kind === 'shell' ? P.peach[1] : kind === 'rock' ? P.stone[1] : kind === 'mush' ? P.grape[2] : [P.coral[1], P.sky[1], P.grape[1], P.spark[0]][(R() * 4) | 0];
    const p = new Path2D(); if (kind === 'mush') { p.moveTo(x - r, y); p.quadraticCurveTo(x, y - r * 1.6, x + r, y); p.closePath(); } else p.ellipse(x, y - r * 0.4, r, r * 0.7, 0, 0, TAU);
    if (kind === 'mush') { ctx.fillStyle = CREAM; ctx.fillRect(x - r * 0.3, y - 1, r * 0.6, r * 0.7); }
    blob(ctx, mx, p, col, adjustHex(col, -0.12), k, r);
  } else if (kind === 'cactus') {
    const h = (30 + R() * 26) * s, w = 8 * s, p = new Path2D(); p.moveTo(x - w, y + 2); p.lineTo(x - w, y - h + w); p.arc(x, y - h + w, w, Math.PI, 0); p.lineTo(x + w, y + 2); p.closePath();
    const a = new Path2D(); a.moveTo(x + w, y - h * 0.4); a.lineTo(x + w * 2.4, y - h * 0.4); a.lineTo(x + w * 2.4, y - h * 0.75);
    ctx.strokeStyle = INK; ctx.lineWidth = w * 1.5 + lwOf(w, k) * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(a); ctx.strokeStyle = P.mint[2]; ctx.lineWidth = w * 1.5; ctx.stroke(a);
    blob(ctx, mx, p, P.mint[2], P.mint[3], k, w * 2);
  } else if (kind === 'lolly') {
    const h = (40 + R() * 30) * s, r = 12 * s; ctx.strokeStyle = INK; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - h); ctx.stroke(); ctx.strokeStyle = CREAM; ctx.lineWidth = 2.5 * s; ctx.stroke();
    const p = new Path2D(); p.arc(x, y - h, r, 0, TAU); const col = [P.coral[1], P.sky[1], P.mint[1], P.grape[1]][(R() * 4) | 0]; blob(ctx, mx, p, col, adjustHex(col, -0.1), k, r);
    ctx.strokeStyle = CREAM; ctx.lineWidth = 2 * s; ctx.beginPath(); for (let a = 0; a < 9; a += 0.3) ctx.lineTo(x + Math.cos(a) * a * r / 9, y - h + Math.sin(a) * a * r / 9); ctx.stroke();
  } else if (kind === 'wave') { /* sparkles on the sea */ ctx.fillStyle = 'rgba(255,253,242,0.8)'; ctx.beginPath(); ctx.ellipse(x, y + 10 + R() * 30, 6 * s, 1.6 * s, 0, 0, TAU); ctx.fill(); }
  else if (kind === 'cap') { /* snow caps are painted with the peaks */ }
}
function flowerAt(ctx, mx, x, y, s, petal, k) {
  const lw = Math.max(1.5, 2 / k);
  ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 14 * s); ctx.stroke();
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4.5 * s, y - 16 * s + Math.sin(a) * 4.5 * s, 3.6 * s, 0, TAU); ctx.fillStyle = petal; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x, y - 16 * s, 2.6 * s, 0, TAU); ctx.fillStyle = P.spark[1]; ctx.fill();
  mx.fillStyle = EMIT; mx.globalAlpha = 0.35; mx.beginPath(); mx.arc(x, y - 16 * s, 2.6 * s, 0, TAU); mx.fill(); mx.globalAlpha = 1;
}

// ---- ground tiles ---------------------------------------------------------------------------------------------------
/** Neighbour masks for a grid of strings ('#' or any non-space, non-'.' char = solid): bit 1 up, 2 right, 4 down, 8 left.
 *  depth = solid tiles above this one (0 = the surface), for the soil's strata. */
export function autotile(rows, solid = c => c !== ' ' && c !== '.' && c != null) {
  const g = rows.map(r => [...r]), H = g.length, out = [];
  const at = (x, y) => y >= 0 && y < H && x >= 0 && x < g[y].length && solid(g[y][x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < g[y].length; x++) if (at(x, y)) {
    let depth = 0; while (at(x, y - depth - 1)) depth++;
    out.push({ x, y, depth, mask: (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0) });
  }
  return out;
}
/** The variant string of a ground tile: mask (0-15) . depth (0-3) . look (0-2, a seeded variety so tiling never shows). */
export const groundVariant = (t, x = t.x, y = t.y) => t.mask + '.' + Math.min(3, t.depth || 0) + '.' + (((x * 7 + y * 13) % 3 + 3) % 3);
/** Ground tile sprites 'ground:<biome>' (variant = groundVariant(): the neighbour mask, depth and look). Soil in strata
 *  that darken with depth, 2-3 kinds of pebble scattered by a seed (fewer deeper down), a root band under the grass,
 *  and Ink on every exposed edge that faces the open (tops and the sides of steps), so outlines close at corners. */
export function defineGround(atlas) {
  for (const name of BIOME_NAMES) defineGroundFor(atlas, name);
  atlas.define('panel', { w: 100, h: 60, ax: 0.5, ay: 0.5, draw(ctx, k) { const p = rrectPath(4, 4, 92, 52, 14); ctx.fillStyle = CREAM; ctx.fill(p); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.055 * k.px) / k.s; ctx.stroke(p); } });
}
export function defineGroundFor(atlas, name) {
  {
    const [top, lip, soil, dots] = BIOMES[name].ground;
    const deep = mixHex(soil, INK, 0.38), strata = [0, 1, 2, 3, 4, 5, 6, 7].map(i => mixHex(soil, deep, Math.min(1, i / 7) * 0.85));
    atlas.define('ground:' + name, { w: 64, h: 64, ax: 0.5, ay: 0.5, draw(ctx, k) {
      const [ms, ds, ls] = String(k.v || '0').split('.'), mask = (+ms || 0) & 15, depth = Math.max(0, Math.min(3, +ds || 0)), look = (+ls || 0) % 3;
      const up = mask & 1, rt = mask & 2, dn = mask & 4, lf = mask & 8;
      const r = 16, o = 1.5, x0 = lf ? -o : 0, x1 = rt ? 64 + o : 64, y0 = up ? -o : 2, y1 = dn ? 64 + o : 62;
      const tl = !up && !lf ? r : 0, tr = !up && !rt ? r : 0, br = !dn && !rt ? r : 0, bl = !dn && !lf ? r : 0;
      const p = new Path2D(); p.moveTo(x0 + tl, y0); p.lineTo(x1 - tr, y0); tr ? p.arcTo(x1, y0, x1, y0 + tr, tr) : p.lineTo(x1, y0); p.lineTo(x1, y1 - br); br ? p.arcTo(x1, y1, x1 - br, y1, br) : p.lineTo(x1, y1); p.lineTo(x0 + bl, y1); bl ? p.arcTo(x0, y1, x0, y1 - bl, bl) : p.lineTo(x0, y1); p.lineTo(x0, y0 + tl); tl ? p.arcTo(x0, y0, x0 + tl, y0, tl) : p.lineTo(x0, y0); p.closePath();
      ctx.save(); ctx.clip(p);
      // strata: two flat bands per tile, a step darker every half tile down (no gradients), with a wavy seam
      const s0 = strata[Math.min(7, depth * 2)], s1 = strata[Math.min(7, depth * 2 + 1)];
      ctx.fillStyle = s0; ctx.fillRect(-2, -2, 68, 68);
      const R = mulberry32(depth * 97 + look * 31 + mask * 7 + 3);
      const seam = new Path2D(), sy = 30 + R() * 6; seam.moveTo(-2, sy); for (let x = 0; x <= 66; x += 11) seam.quadraticCurveTo(x + 5.5, sy + (R() - 0.5) * 7, x + 11, sy + (R() - 0.5) * 3); seam.lineTo(66, 66); seam.lineTo(-2, 66); seam.closePath();
      ctx.fillStyle = s1; ctx.fill(seam);
      // pebbles: three shapes, seeded, fewer with depth; each with a light top and a dark underside
      const n = [4, 3, 2, 1][depth] + (look === 1 ? 1 : 0), pebble = mixHex(dots, strata[Math.min(7, depth * 2 + 1)], 0.25 + depth * 0.12), pebbleS = mixHex(pebble, INK, 0.25);
      for (let i = 0; i < n; i++) {
        const px = 7 + R() * 50, py = (up ? 8 : 26) + R() * (up ? 50 : 32), kind = (look + i) % 3, sc = 0.8 + R() * 0.5;
        const pb = kind === 0 ? ellipsePath(px, py, 3.6 * sc, 2.6 * sc, R() - 0.5) : kind === 1 ? ellipsePath(px, py, 5.2 * sc, 2 * sc, (R() - 0.5) * 0.6) : null;
        if (pb) { ctx.fillStyle = pebbleS; ctx.save(); ctx.translate(0.6, 1); ctx.fill(pb); ctx.restore(); ctx.fillStyle = pebble; ctx.fill(pb); }
        else { ctx.fillStyle = pebble; for (const [dx, dy, rr] of [[0, 0, 2.4], [3.6, 1.2, 1.7], [1.2, 3.2, 1.4]]) { ctx.beginPath(); ctx.arc(px + dx * sc, py + dy * sc, rr * sc, 0, TAU); ctx.fill(); } }
      }
      if (!up) {
        // roots under the grass, then the grass lip with its fringe
        ctx.strokeStyle = mixHex(soil, INK, 0.3); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const rx = 8 + i * 22 + R() * 8; ctx.beginPath(); ctx.moveTo(rx, 18); ctx.quadraticCurveTo(rx + (R() - 0.5) * 10, 25, rx + (R() - 0.5) * 8, 30 + R() * 5); ctx.stroke(); }
        const g = new Path2D(); g.moveTo(-2, 0); g.lineTo(66, 0); g.lineTo(66, 16); for (let x = 64; x >= 0; x -= 8) g.quadraticCurveTo(x - 4, 24 + (look - 1) * 1.5, x - 8, 16); g.closePath(); ctx.fillStyle = lip; ctx.fill(g); ctx.save(); ctx.translate(-1.5, -3); ctx.fillStyle = top; ctx.fill(g); ctx.restore();
      }
      ctx.restore();
      // Ink on every open edge: the top (with its rounded corners) and any exposed side, so steps close their outline
      const lw = Math.max(2, Math.min(6, 0.055 * k.px)) / k.s;
      const e = new Path2D(); let any = false;
      if (!up) { e.moveTo(x0, tl ? y0 + tl : y0); if (tl) e.arcTo(x0, y0, x0 + tl, y0, tl); else e.lineTo(x0, y0); e.lineTo(x1 - tr, y0); if (tr) e.arcTo(x1, y0, x1, y0 + tr, tr); any = true; }
      if (!lf) { e.moveTo(x0, up ? y0 : y0 + tl); e.lineTo(x0, dn ? y1 : y1 - bl); any = true; }
      if (!rt) { e.moveTo(x1, up ? y0 : y0 + tr); e.lineTo(x1, dn ? y1 : y1 - br); any = true; }
      if (any) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(e); if (k.mask) { const mm = k.mask(); mm.strokeStyle = UNLIT; mm.lineWidth = lw; mm.lineCap = 'round'; mm.stroke(e); } }
    } });
  }
}
