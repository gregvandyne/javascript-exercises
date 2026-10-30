// Characters (spec §6.1-6.2): procedural, parameterised, rigged. A validated char spec becomes a set of part sprites
// (body, head, face per mood, pupils, arms, legs, ears/antenna, tail, wings) baked through the "Oomba Ink" grammar,
// plus a rig that poses them every frame from procedural clips (sines, springs, volume-preserving squash; no frames).
// Box: 120 x 150 art units, feet at the bottom centre (2-2.3 heads tall). Every part shares the character's line
// width (lineH), so outlines match across parts at any size.
import { PALETTE, INK, CREAM, SKIN, SKIN_SHADE, HAIR } from './tokens.js';
import { sticker, detail, ringEye, sparkPath, ellipsePath, rrectPath, glowMask, lines } from './grammar.js';
import { UNLIT } from './atlas.js';
import { adjustHex, contrast, hexToOklab } from './color.js';
import { validate, SPECIES } from './validate.js';

const P = PALETTE, TAU = Math.PI * 2, PI = Math.PI;
export const CW = 120, CH = 150;
export const CLIPS = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'hurt', 'cheer', 'think', 'sad', 'sleep', 'talk', 'wave'];
/** The art style (Oomba.style): 'playful' (default) or 'bold' (the style-bold pack sets the proportions: legs, head,
 *  body x; no blush, narrowed eyes, 'determined' by default). WEAR_X: pack wear {hat(hx, top, rx) -> {p, draw}, body(ctx, k, box)}. */
export const STYLE = { name: 'playful' }, WEAR_X = {};
export const FACES = ['happy', 'sad', 'surprised', 'determined', 'thinking', 'sleepy', 'wink', 'cheer', 'hurt', 'sleep', 'talk'];
// Back to front. Both arms hang behind the torso (shared rim, no floating capsules); the rig moves the front arm in
// front only while it crosses the body (think, talk). Long hair has its own back part, behind the body.
const ORDER = ['wingL', 'wingR', 'hairB', 'pack', 'tail', 'ears', 'armB', 'legB', 'legF', 'armF', 'body', 'head', 'pupilL', 'pupilR', 'face'];
const ONE_SHOT = { land: 0.28, hurt: 0.5 };
/** Species added by art packs (Oomba.pack): name -> {geom, color, belly, browed, mouth ('w' | 'beak'), paw, legs(H),
 *  parts(H), headBack(H), headFront(ctx, k, H), beak(ctx, k, H, open), hats}. The drawers below call these hooks at fixed points. */
export const SPECIES_EXT = {};
export function addSpecies(name, def) { SPECIES_EXT[name] = def; if (!SPECIES.includes(name)) SPECIES.push(name); }

// ---- path helpers ----
export function capsule(x1, y1, x2, y2, r) {
  const p = new Path2D(), a = Math.atan2(y2 - y1, x2 - x1);
  p.arc(x1, y1, r, a + PI / 2, a - PI / 2 + TAU); p.arc(x2, y2, r, a - PI / 2, a + PI / 2); p.closePath(); return p;
}
const circ = (x, y, r) => ellipsePath(x, y, r, r);
/** The silhouette's Cream sticker rim, drawn once under a group of shapes (hair over a head, ears on a head). */
function rim(ctx, k, paths) {
  const L = lines(k), w = L.w + 2 * L.rim;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = w;
  for (const p of paths) ctx.stroke(p);
  if (k.mask) { const m = k.mask(); m.strokeStyle = UNLIT; m.lineWidth = w; m.lineJoin = 'round'; for (const p of paths) m.stroke(p); }
}
const flat = (ctx, k, p, fill, line = 1) => sticker(ctx, k, p, { fill, rim: false, line });
const shaded = (ctx, k, p, fill, shade, gloss, off = 6) => sticker(ctx, k, p, { fill, shade, shadeOff: off, gloss, rim: false });
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ---- colours ----
function ramp(hue) { const r = P[hue] || P.mint; return hue === 'snow' || hue === 'cream' ? [r[0], r[0], r[1], r[3]] : r; }
function hairHex(c) { if (HAIR[c]) return HAIR[c]; if (P[c]) return P[c][2]; return HAIR.cocoa; }
/** Hair that reads against the face: when hair and skin are too close (under 3:1), the hair moves away from the skin's
 *  lightness (at most 0.16 L, so the chosen colour stays recognisable); the Ink line does the rest. */
export function hairFor(hc, skin) {
  if (contrast(hc, skin) >= 3) return hc;
  const away = hexToOklab(hc)[0] < hexToOklab(skin)[0] ? -1 : 1;   // darker hair gets darker, lighter hair lighter
  let best = hc, bc = contrast(hc, skin);
  for (const dir of [away, -away]) for (let d = 0.02; d <= 0.161; d += 0.02) {
    const c = adjustHex(hc, dir * d, dir > 0 ? 0.95 : 1.05), k = contrast(c, skin);
    if (k >= 3 && dir === away) return c;
    if (k > bc + 0.05) { best = c; bc = k; }
  }
  return best;
}

// ---- geometry per species (art units; neck = head pivot) ----
function geom(sp) {
  const G = {
    kid: { head: [60, 50, 33, 31], neck: [60, 80], eyes: [[47, 54], [73, 54]], eyeD: 20, mouth: [60, 69], body: [76, 122, 44], hips: [[51, 116], [69, 116]], leg: [24, 7], sh: [[43, 89], [77, 89]], arm: [24, 6], armOut: 7, ring: 0.12 },
    fox: { head: [60, 54, 34, 28], neck: [60, 80], eyes: [[47, 53], [73, 53]], eyeD: 19, mouth: [60, 71], body: [76, 124, 42], hips: [[51, 118], [69, 118]], leg: [22, 7], sh: [[44, 91], [76, 91]], arm: [21, 6], armOut: 7, tail: [74, 118], ring: 0.17 },
    bunny: { head: [60, 62, 31, 28], neck: [60, 88], eyes: [[48, 61], [72, 61]], eyeD: 19, mouth: [60, 78], body: [84, 126, 40], hips: [[51, 120], [69, 120]], leg: [20, 7], sh: [[45, 97], [75, 97]], arm: [19, 6], armOut: 7, tail: [80, 120], ears: [60, 40], ring: 0.17 },
    frog: { head: [60, 72, 40, 25], neck: [60, 94], eyes: [[43, 50], [77, 50]], eyeD: 23, mouth: [60, 80], body: [90, 130, 52], hips: [[44, 124], [76, 124]], leg: [16, 8], sh: [[40, 103], [80, 103]], arm: [17, 6], armOut: 7, ring: 0.17 },
    bee: { head: [60, 94, 38, 38], neck: [60, 140], eyes: [[47, 88], [73, 88]], eyeD: 20, mouth: [60, 106], sh: [[24, 104], [96, 104]], arm: [11, 6], armOut: 5, wings: [[48, 60], [72, 60]], ears: [60, 60], one: true, ring: 0.17 },
    oomba: { head: [60, 98, 41, 48], neck: [60, 146], eyes: [[46, 92], [74, 92]], eyeD: 26, mouth: [60, 112], hips: [[46, 140], [74, 140]], leg: [5, 7], sh: [[22, 104], [98, 104]], arm: [13, 7], armOut: 5, ears: [60, 56], one: true, ring: 0.22 },
  };
  return G[sp] || (SPECIES_EXT[sp] && SPECIES_EXT[sp].geom) || G.oomba;
}

/** Build (and register in the atlas) a character from a spec: -> { id, spec, G, parts:[names] }. Cached per atlas. */
export function defineChar(atlas, spec) {
  if (!spec || !spec.__ok) spec = charSpec(spec);
  const id = spec.id;
  if (atlas.has(id)) return atlas.charB.get(id);
  const G = geom(spec.species), D = drawers(spec, G), parts = ORDER.filter(n => D[n] || n.startsWith('pupil'));
  const def = (name, box, pivot, draw) => {
    const [x0, y0, x1, y1] = box;
    atlas.define(id + ':' + name, { w: x1 - x0, h: y1 - y0, ax: (pivot[0] - x0) / (x1 - x0), ay: (pivot[1] - y0) / (y1 - y0), lineH: CH,
      draw(ctx, k) { ctx.translate(-x0, -y0); const kk = Object.assign({}, k, { mask: () => { const m = k.mask(); m.translate(-x0, -y0); return m; } }); draw(ctx, kk); } });
  };
  for (const n of parts) if (n !== 'pupilL' && n !== 'pupilR') { const d = D[n]; def(n, d.box, d.pivot, d.draw); }
  const pr = pupilR(G);
  atlas.define(id + ':pupil', { w: pr * 2 + 4, h: pr * 2 + 4, ax: 0.5, ay: 0.5, lineH: CH, draw(ctx, k) { pupilDraw(ctx, k, pr + 2, pr + 2, pr); } });
  // The whole character at rest (portraits, hit boxes, the gallery): every part in order, pupils centred.
  const tf = (ctx, n) => {   // the bold proportions at rest (the rig does the same per slot)
    if (STYLE.name !== 'bold' || !STYLE.legs || !G.hips) return; const up = G.leg[0] * (STYLE.legs - 1), hy = G.hips[0][1], [nx, ny] = G.neck;
    if (n[0] === 'l') { ctx.translate(0, hy - up); ctx.scale(1, STYLE.legs); ctx.translate(0, -hy); return; }
    ctx.translate(0, -up);
    if (n === 'body' || n === 'pack') { ctx.translate(60, 0); ctx.scale(STYLE.body, 1); ctx.translate(-60, 0); }
    else if (!/^arm|^tail/.test(n)) { ctx.translate(nx, ny); ctx.scale(STYLE.head, STYLE.head); ctx.translate(-nx, -ny); }
  };
  const all = (ctx, k) => {
    for (const n of parts) {
      if (n === 'pupilL' || n === 'pupilR') { const E = G.eyes[n === 'pupilL' ? 0 : 1]; if (!closedEyes(k.v || spec.mood, n)) { ctx.save(); tf(ctx, n); pupilDraw(ctx, k, E[0], E[1] - 1, pr * (k.v === 'surprised' ? 0.7 : 1)); ctx.restore(); } continue; }
      ctx.save(); tf(ctx, n); const kk = n === 'face' ? Object.assign({}, k, { v: k.v || spec.mood }) : k; D[n].draw(ctx, kk); ctx.restore();
    }
  };
  atlas.define(id, { w: CW, h: CH, ax: 0.5, ay: 1, draw: all });
  // Portraits get room for hats, ears, antennae and the rim (the rig never draws this one: hit boxes use the plain box).
  atlas.define(id + ':portrait', { w: CW + 40, h: CH + 52, ax: 0.5, ay: (CH + 42) / (CH + 52), lineH: CH, draw(ctx, k) { ctx.translate(20, 42); all(ctx, Object.assign({}, k, { mask: () => { const m = k.mask(); m.translate(20, 42); return m; } })); } });
  const b = { id, spec, G, parts, pupil: id + ':pupil', pr };
  if (!atlas.charB) atlas.charB = new Map();
  atlas.charB.set(id, b);
  return b;
}
/** A validated, frozen char spec with its sprite id (the same spec always gives the same id). */
export function charSpec(o) {
  const s = Object.assign({}, validate('char', typeof o === 'string' ? { species: o } : o || {}).spec);
  if (s.species === 'kid') { s.hair = s.hair || { style: 'bob', color: 'cocoa' }; s.outfit = s.outfit || { top: 'tee', color: 'sky' }; }
  // The bee is honey amber (peach) with Ink stripes: Spark yellow is for rewards only, never a creature.
  const X = SPECIES_EXT[s.species];
  if (s.species !== 'kid' && !(o && o.colors && o.colors.base)) s.colors = Object.assign({}, s.colors, { base: { fox: 'peach', bunny: 'snow', frog: 'mint', bee: 'peach', oomba: 'mint' }[s.species] || (X && X.color) || s.colors.base });
  if (X && X.belly && !(o && o.colors && o.colors.belly)) s.colors = Object.assign({}, s.colors, { belly: X.belly });
  if (s.colors.base === 'spark') s.colors = Object.assign({}, s.colors, { base: 'peach' });
  if (STYLE.name === 'bold' && !(o && o.mood)) s.mood = 'determined';
  s.id = 'ch' + hash(JSON.stringify([s.species, s.body, s.colors, s.skin, s.hair, s.outfit, s.wear, STYLE.name]));
  s.__ok = 1;
  return Object.freeze(s);
}
/** Pupil radius: 55% of the eye's inner radius (bigger in the kids' thinner rings, so eyes stay friendly). */
const pupilR = G => G.eyeD * (0.5 - (G.ring || 0.22)) * 0.55;
function pupilDraw(ctx, k, x, y, r) {
  const p = circ(x, y, r); ctx.fillStyle = INK; ctx.fill(p);
  // the catch-light; on a phone-sized face (a pupil under ~3 px) it would turn the pupil into a ring, so it goes
  const small = r * (k.s || 1) < 3, h = small ? null : circ(x - r * 0.34, y - r * 0.38, Math.max(1.1, r * 0.38));
  if (h) { ctx.fillStyle = '#FFFFFF'; ctx.fill(h); }
  if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(p); if (h) { m.fillStyle = '#FF0000'; m.fill(h); } }
}
const CLOSED = { cheer: 2, hurt: 2, sleep: 2, blink: 2, wink: 1 };
function closedEyes(v, n) { const base = String(v || '').split('.')[0], c = String(v || '').endsWith('.b') ? 2 : CLOSED[base] || 0; return c === 2 || (c === 1 && n === 'pupilR'); }

// ---- drawing --------------------------------------------------------------------------------------------------------
function drawers(spec, G) {
  const sp = spec.species, D = {};
  const R = ramp(spec.colors.base), fill = R[2], shade = R[3], light = R[1], tint = R[0];
  const belly = spec.colors.belly === 'cream' ? CREAM : ramp(spec.colors.belly)[1];
  const [hx, hy, hrx, hry] = G.head;
  const skin = SKIN[spec.skin], skinS = SKIN_SHADE[spec.skin];
  const headFill = sp === 'kid' ? skin : fill;
  const headShade = sp === 'kid' ? skinS : shade;
  const wear = new Set(spec.wear);
  const outfit = spec.outfit ? ramp(spec.outfit.color) : null;
  const accent = spec.colors.accent === 'spark' ? 'coral' : spec.colors.accent;
  const A = ramp(accent);
  const X = SPECIES_EXT[sp] || null;
  // what a pack species' hooks get: its colours, geometry and the Ink drawing grammar
  const XH = X ? { spec, G, fill, shade, light, tint, belly, A, P, INK, CREAM, rim, flat, shaded, sticker, detail, capsule, circ, ellipse: ellipsePath, rrect: rrectPath, adjust: adjustHex, lines, spark: sparkPath, glow: glowMask } : null;

  // Limbs: a capsule hanging from its pivot (tucked under the torso, which is drawn over the shoulder), with a
  // paw/hand; sleeves for kids. The upper end starts a little above the pivot so a raised arm still meets the body.
  const limb = (px, py, len, r, out, col, colS, end, sleeve, sleeveLen) => (ctx, k) => {
    const ex = px + out, ey = py + len;
    const arm = capsule(px, py - 3, ex, ey, r), hand = circ(ex, ey, r * 1.12);
    const sl = sleeve ? capsule(px, py - 3, px + out * sleeveLen, py + len * sleeveLen, r * 1.2) : null;
    rim(ctx, k, sl ? [arm, hand, sl] : [arm, hand]);
    shaded(ctx, k, arm, col, colS, null, 2.5);
    if (sl) shaded(ctx, k, sl, sleeve[2], sleeve[3], null, 2.5);
    shaded(ctx, k, hand, end || col, end ? adjustHex(end, -0.1) : colS, null, 2.5);
  };
  const legDraw = (hx0, hy0, len, r, col, colS, foot) => (ctx, k) => {
    const leg = capsule(hx0, hy0, hx0, hy0 + len, r), f = ellipsePath(hx0 + 2, hy0 + len + 2, r * 1.45, r * 0.95);
    rim(ctx, k, [leg, f]);
    shaded(ctx, k, leg, col, colS, null, 2.5); shaded(ctx, k, f, foot, adjustHex(foot, -0.12), null, 2);
  };
  const box = (x, y, rx, ry) => [x - rx - 10, y - ry - 10, x + rx + 10, y + ry + 10];

  // ---- arms and legs ----
  if (G.sh) {
    const [len, r] = G.arm;
    const kidSleeve = sp === 'kid' ? (spec.outfit.top === 'overalls' ? [0, 0, CREAM, P.cream[3]] : outfit) : null;
    const sleeveLen = sp === 'kid' ? (spec.outfit.top === 'hoodie' ? 0.85 : 0.45) : 0;
    const col = sp === 'kid' ? skin : fill, colS = sp === 'kid' ? skinS : shade;
    const paw = X && X.paw ? X.paw(XH) : sp === 'fox' ? P.cocoa[3] : sp === 'kid' ? skin : sp === 'bee' ? INK : null;
    [['armB', 0, -1], ['armF', 1, 1]].forEach(([n, i, s]) => {
      const [x, y] = G.sh[i];
      D[n] = { box: [x - 22, y - 16, x + 22, y + len + 14], pivot: [x, y], draw: limb(x, y, len, r, s * (G.armOut || 3), col, colS, paw, kidSleeve, sleeveLen) };
    });
  }
  if (G.hips) {
    const [len, r] = G.leg;
    let col = fill, colS = shade, foot = shade;
    if (sp === 'kid') {
      const t = spec.outfit.top; foot = P.cocoa[3];
      if (t === 'dress') { col = skin; colS = skinS; } else if (t === 'overalls') { col = outfit[2]; colS = outfit[3]; } else { const pants = spec.outfit.color === 'sky' ? ramp('cocoa') : ramp('sky'); col = pants[3]; colS = adjustHex(pants[3], -0.08); }
    } else if (sp === 'fox') { col = P.cocoa[3]; colS = adjustHex(P.cocoa[3], -0.08); foot = P.cocoa[3]; }
    else if (sp === 'oomba') { col = shade; foot = shade; }
    else if (sp === 'frog') { foot = light; }
    if (X && X.legs) [col, colS, foot] = X.legs(XH);
    [['legB', 0], ['legF', 1]].forEach(([n, i]) => {
      const [x, y] = G.hips[i];
      D[n] = { box: [x - 18, y - 12, x + 20, y + len + 14], pivot: [x, y],
        draw: sp === 'frog' ? (ctx, k) => {
          const s = i ? 1 : -1, th = ellipsePath(x + s * 6, y + 4, 12, 9, s * 0.4), f = ellipsePath(x + s * 8, y + 14, 10, 4.5);
          rim(ctx, k, [th, f]); shaded(ctx, k, th, fill, shade, null, 3);
          for (const dx of [-6, 0, 6]) flat(ctx, k, circ(x + s * 8 + dx, y + 16, 3.4), light, 0.7);
          shaded(ctx, k, f, light, fill, null, 2);
        } : legDraw(x, y, len, r, col, colS, foot) };
    });
  }

  // ---- body (torso) ----
  if (!G.one) {
    const [top, bot, w] = G.body, cx = 60, mid = (top + bot) / 2;
    const torso = () => {
      if (spec.body === 'ball') return ellipsePath(cx, mid, w / 2 + 3, (bot - top) / 2);
      if (spec.body === 'pear') { const p = new Path2D(); p.moveTo(cx, top); p.bezierCurveTo(cx + w * 0.38, top, cx + w * 0.62, bot - 6, cx + w * 0.5, bot - 2); p.quadraticCurveTo(cx, bot + 4, cx - w * 0.5, bot - 2); p.bezierCurveTo(cx - w * 0.62, bot - 6, cx - w * 0.38, top, cx, top); p.closePath(); return p; }
      return rrectPath(cx - w / 2, top, w, bot - top, w * 0.4);
    };
    D.body = { box: [cx - w / 2 - 22, top - 16, cx + w / 2 + 22, bot + 26], pivot: [cx, bot], draw(ctx, k) {
      const t = torso(), list = [t];
      let pack = null, skirt = null, hood = null;   // the backpack itself is its own part, behind the arms
      if (sp === 'kid' && spec.outfit.top === 'dress') { skirt = new Path2D(); skirt.moveTo(cx - w * 0.42, mid); skirt.lineTo(cx + w * 0.42, mid); skirt.quadraticCurveTo(cx + w * 0.7, bot + 6, cx + w * 0.62, bot + 12); skirt.quadraticCurveTo(cx, bot + 18, cx - w * 0.62, bot + 12); skirt.quadraticCurveTo(cx - w * 0.7, bot + 6, cx - w * 0.42, mid); skirt.closePath(); list.push(skirt); }
      if (sp === 'kid' && spec.outfit.top === 'hoodie') { hood = ellipsePath(cx, top + 3, w * 0.42, 9); list.unshift(hood); }
      rim(ctx, k, list);
      if (hood) flat(ctx, k, hood, outfit[3]);
      if (sp === 'kid') {
        const top0 = spec.outfit.top, shirt = top0 === 'overalls' ? CREAM : outfit[2], shirtS = top0 === 'overalls' ? P.cream[3] : outfit[3];
        shaded(ctx, k, t, shirt, shirtS, [cx - w * 0.22, top + 10, 6, 4, -0.6], 5);
        if (top0 === 'overalls') { const bib = rrectPath(cx - w * 0.3, mid - 6, w * 0.6, bot - mid + 6, 6); ctx.save(); ctx.clip(t); shaded(ctx, k, bib, outfit[2], outfit[3], null, 3); ctx.restore(); for (const s of [-1, 1]) { const st = new Path2D(); st.moveTo(cx + s * w * 0.26, mid - 4); st.lineTo(cx + s * w * 0.34, top + 2); detail(ctx, k, st, 2.2); flat(ctx, k, circ(cx + s * w * 0.18, mid, 2.4), CREAM, 0.6); } }
        if (top0 === 'hoodie') { const pk = rrectPath(cx - w * 0.28, mid + 4, w * 0.56, 12, 5); detail(ctx, k, pk, 1); for (const s of [-1, 1]) { const st = new Path2D(); st.moveTo(cx + s * 5, top + 4); st.lineTo(cx + s * 6, top + 16); detail(ctx, k, st, 1); } }
        if (skirt) shaded(ctx, k, skirt, outfit[2], outfit[3], null, 4);
        const neck = new Path2D(); neck.moveTo(cx - 7, top + 1); neck.quadraticCurveTo(cx, top + 8, cx + 7, top + 1); detail(ctx, k, neck, 1);
      } else {
        shaded(ctx, k, t, fill, shade, [cx - w * 0.22, top + 10, 6, 4, -0.6], 5);
        ctx.save(); ctx.clip(t); flat(ctx, k, ellipsePath(cx, mid + 6, w * 0.3, (bot - top) * 0.36), belly, 0.6); ctx.restore();
      }
      if (wear.has('backpack')) for (const s of [-1, 1]) { const st = capsule(cx + s * w * 0.3, top + 4, cx + s * w * 0.34, mid + 6, 2.6); flat(ctx, k, st, A[2], 0.7); }
      for (const n of wear) if (WEAR_X[n] && WEAR_X[n].body) WEAR_X[n].body(ctx, k, { cx, top, mid, bot, w, A });
      if (wear.has('scarf')) { const sc = rrectPath(cx - w * 0.46, top - 4, w * 0.92, 11, 5.5), tail = rrectPath(cx + w * 0.12, top + 2, 9, 20, 4); rim(ctx, k, [sc, tail]); shaded(ctx, k, tail, A[2], A[3], null, 2); shaded(ctx, k, sc, A[2], A[3], null, 2); }
    } };
  }

  // ---- the backpack: behind the arms and the torso (only its sides and top show), straps drawn on the torso ----
  if (!G.one && wear.has('backpack')) {
    const [top, bot, w] = G.body, cx = 60;
    D.pack = { box: [cx - w / 2 - 22, top - 6, cx + w / 2 + 22, bot + 10], pivot: [cx, bot], draw(ctx, k) {
      const pk = rrectPath(cx - w / 2 - 7, top + 6, w + 14, bot - top - 12, 12); rim(ctx, k, [pk]); shaded(ctx, k, pk, A[2], A[3], [cx - w / 2 - 2, top + 12, 3, 5, -0.3], 3);
    } };
  }

  // ---- tail, ears, wings ----
  if (sp === 'fox') D.tail = { box: [60, 60, 122, 130], pivot: G.tail, draw(ctx, k) {
    const t = new Path2D(); t.moveTo(72, 120); t.bezierCurveTo(100, 122, 116, 100, 108, 72); t.bezierCurveTo(98, 84, 82, 96, 72, 110); t.closePath();
    const tip = new Path2D(); tip.moveTo(108, 72); tip.bezierCurveTo(110, 84, 106, 92, 100, 96); tip.quadraticCurveTo(98, 84, 108, 72); tip.closePath();
    rim(ctx, k, [t]); shaded(ctx, k, t, fill, shade, null, 4); ctx.save(); ctx.clip(t); flat(ctx, k, tip, CREAM, 0.6); ctx.restore();
  } };
  if (sp === 'bunny') {
    D.tail = { box: [64, 104, 100, 136], pivot: G.tail, draw(ctx, k) { const p = circ(82, 118, 9); rim(ctx, k, [p]); shaded(ctx, k, p, CREAM, P.cream[3], null, 2); } };
    D.ears = { box: [24, -12, 96, 52], pivot: G.ears, draw(ctx, k) {
      const e1 = capsule(50, 44, 40, 6, 9.5), e2 = capsule(70, 44, 82, 8, 9.5);
      rim(ctx, k, [e1, e2]);
      for (const [e, a, b] of [[e1, [49, 38], [42, 12]], [e2, [71, 38], [80, 14]]]) { shaded(ctx, k, e, fill, shade, null, 3); flat(ctx, k, capsule(a[0], a[1], b[0], b[1], 4.2), P.coral[1], 0.6); }
    } };
  }
  if (sp === 'oomba') D.ears = { box: [44, 2, 90, 64], pivot: G.ears, draw(ctx, k) {
    const L = lines(k), stalk = new Path2D(); stalk.moveTo(60, 58); stalk.bezierCurveTo(60, 42, 68, 36, 70, 26);
    ctx.lineCap = 'round'; ctx.strokeStyle = CREAM; ctx.lineWidth = L.w * 1.2 + 2 * L.rim; ctx.stroke(stalk);
    detail(ctx, k, stalk, 2.2);
    const s = sparkPath(71, 19, 13, 0.2);
    sticker(ctx, k, s, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, emissive: true, unlit: true });
  } };
  if (sp === 'bee') {
    D.ears = { box: [30, 26, 90, 72], pivot: G.ears, draw(ctx, k) {
      for (const s of [-1, 1]) { const a = new Path2D(); a.moveTo(60 + s * 8, 64); a.quadraticCurveTo(60 + s * 12, 42, 60 + s * 20, 38); detail(ctx, k, a, 2); const b = circ(60 + s * 20, 38, 4.5); sticker(ctx, k, b, { fill: INK, rim: true, line: 0.6 }); }
    } };
    for (const [n, i, s] of [['wingL', 0, -1], ['wingR', 1, 1]]) {
      const [x, y] = G.wings[i];
      D[n] = { box: [x - 36, y - 40, x + 36, y + 14], pivot: [x, y], draw(ctx, k) {
        const w = ellipsePath(x + s * 14, y - 16, 18, 12, s * -0.6);
        sticker(ctx, k, w, { fill: P.sky[0], shade: P.sky[1], shadeOff: 3, gloss: [x + s * 10, y - 22, 5, 3, s * -0.6] });
        const v = new Path2D(); v.moveTo(x + s * 2, y - 4); v.quadraticCurveTo(x + s * 12, y - 14, x + s * 24, y - 22); detail(ctx, k, v, 0.7);
      } };
    }
  }

  if (X && X.parts) Object.assign(D, X.parts(XH));

  // ---- long hair: hangs behind the body (its own part, so it never covers the torso) ----
  if (sp === 'kid') {
    const H0 = hairShapes(spec.hair.style, G);
    if (H0.low.length) {
      const hc0 = hairFor(hairHex(spec.hair.color), skin);
      D.hairB = { box: [hx - hrx - 16, hy - hry - 10, hx + hrx + 16, hy + hry + 56], pivot: G.neck, draw(ctx, k) { rim(ctx, k, H0.low); for (const p of H0.low) shaded(ctx, k, p, adjustHex(hc0, -0.04), adjustHex(hc0, -0.12), null, 4); } };
    }
  }

  // ---- head ----
  D.head = { box: [hx - hrx - 30, hy - hry - (sp === 'kid' ? 52 : 28), hx + hrx + 30, sp === 'bee' ? 156 : hy + hry + (sp === 'kid' ? 34 : 14)], pivot: G.neck, draw(ctx, k) {
    const head = sp === 'oomba' ? oombaBean() : ellipsePath(hx, hy, hrx, hry);
    const sil = [head], back = [], front = [];
    const hc = sp === 'kid' ? hairFor(hairHex(spec.hair.color), skin) : null, hcS = hc ? adjustHex(hc, -0.08) : null, hcL = hc ? adjustHex(hc, 0.12, 0.9) : null;
    let H = null;
    if (sp === 'kid') { H = hairShapes(spec.hair.style, G); back.push(...H.back); front.push(...H.front); sil.push(...H.back, ...H.front); for (const s of [-1, 1]) sil.push(circ(hx + s * (hrx - 1), hy + 5, 6.5)); }
    let ears = null, bumps = null, sting = null;
    if (sp === 'fox') { ears = [-1, 1].map(s => { const p = new Path2D(); p.moveTo(hx + s * 30, hy - 4); p.quadraticCurveTo(hx + s * 34, hy - 36, hx + s * 26, hy - 42); p.quadraticCurveTo(hx + s * 14, hy - 34, hx + s * 8, hy - 22); p.closePath(); return p; }); sil.push(...ears); }
    if (sp === 'frog') { bumps = G.eyes.map(([x, y]) => circ(x, y + 2, 15)); sil.push(...bumps); }
    if (sp === 'bee') { sting = new Path2D(); sting.moveTo(52, 128); sting.quadraticCurveTo(60, 152, 60, 152); sting.quadraticCurveTo(60, 152, 68, 128); sting.closePath(); sil.unshift(sting); }
    const xb = X && X.headBack ? X.headBack(XH) : []; sil.push(...xb.map(b => b.p));
    const hat = sp === 'kid' || sp === 'fox' || sp === 'bunny' || (X && X.hats) ? wearHat(wear, hx, hy - hry, hrx) : [];
    sil.push(...hat.map(h => h.p));
    rim(ctx, k, sil);
    if (sting) flat(ctx, k, sting, P.cocoa[3]);
    for (const p of back) shaded(ctx, k, p, hc, hcS, null, 4);
    if (H && H.ties) for (const t of H.ties) flat(ctx, k, t, A[2], 0.7);   // hair ties: buns read as hair, never ears
    for (const b of xb) b.draw ? b.draw(ctx, k) : shaded(ctx, k, b.p, b.fill || fill, b.shade || shade, null, 3);
    if (ears) ears.forEach((p, i) => { shaded(ctx, k, p, fill, shade, null, 3); const s = i ? 1 : -1, inner = new Path2D(); inner.moveTo(hx + s * 26, hy - 10); inner.quadraticCurveTo(hx + s * 27, hy - 30, hx + s * 24, hy - 34); inner.quadraticCurveTo(hx + s * 16, hy - 28, hx + s * 13, hy - 20); inner.closePath(); flat(ctx, k, inner, P.cocoa[3], 0.5); });
    if (sp === 'kid') for (const s of [-1, 1]) shaded(ctx, k, circ(hx + s * (hrx - 1), hy + 5, 6.5), skin, skinS, null, 2);
    shaded(ctx, k, head, headFill, headShade, [hx - hrx * 0.42, hy - hry * 0.45, hrx * 0.2, hry * 0.13, -0.6], sp === 'oomba' ? 9 : 6);
    if (bumps) for (const b of bumps) shaded(ctx, k, b, fill, shade, null, 4);
    if (sp === 'oomba') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(60, 132, 25, 14), P.mint[0], 0.6); ctx.restore(); }
    if (sp === 'bee') { ctx.save(); ctx.clip(head); for (const y of [110, 126]) { const b = new Path2D(); b.moveTo(10, y); b.quadraticCurveTo(60, y + 10, 110, y); b.lineTo(110, y + 8); b.quadraticCurveTo(60, y + 18, 10, y + 8); b.closePath(); ctx.fillStyle = INK; ctx.fill(b); if (k.mask) { const m = k.mask(); m.fillStyle = UNLIT; m.fill(b); } } ctx.restore(); }
    if (sp === 'fox') { ctx.save(); ctx.clip(head); const m = new Path2D(); m.moveTo(hx - hrx, hy + 6); m.quadraticCurveTo(hx - 12, hy + 6, hx, hy + 14); m.quadraticCurveTo(hx + 12, hy + 6, hx + hrx, hy + 6); m.lineTo(hx + hrx, hy + hry); m.lineTo(hx - hrx, hy + hry); m.closePath(); flat(ctx, k, m, CREAM, 0.6); ctx.restore(); flat(ctx, k, ellipsePath(hx, hy + 9, 4.6, 3.4), INK, 0.6); }
    if (sp === 'bunny') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(hx, hy + 18, 16, 11), CREAM, 0.6); ctx.restore(); const n = new Path2D(); n.moveTo(hx - 4, hy + 11); n.quadraticCurveTo(hx, hy + 9, hx + 4, hy + 11); n.quadraticCurveTo(hx, hy + 17, hx - 4, hy + 11); n.closePath(); flat(ctx, k, n, P.coral[2], 0.6); }
    if (sp === 'frog') { ctx.save(); ctx.clip(head); flat(ctx, k, ellipsePath(hx, hy + 18, 24, 9), light, 0.6); ctx.restore(); }
    if (X && X.headFront) { XH.head = head; X.headFront(ctx, k, XH); }
    // cheeks, nose, eyes
    ctx.fillStyle = STYLE.name === 'bold' ? 'rgba(0,0,0,0)' : 'rgba(255,156,143,0.7)';
    const cy = G.mouth[1] - 3, cdx = (G.eyes[1][0] - G.eyes[0][0]) * 0.5 + G.eyeD * 0.45;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * cdx, cy, 5.5, 3.2, 0, 0, TAU); ctx.fill(); }
    if (sp === 'kid') { const n = new Path2D(); n.moveTo(hx - 2.5, G.mouth[1] - 7); n.quadraticCurveTo(hx, G.mouth[1] - 5, hx + 2.5, G.mouth[1] - 7); detail(ctx, k, n, 1); }
    for (const [x, y] of G.eyes) ringEye(ctx, k, x, y, G.eyeD, G.ring);
    for (const p of front) shaded(ctx, k, p, hc, hcS, [p === front[0] ? hx - 12 : hx, hy - hry + 4, 6, 2.5, -0.3], 3);
    if (H && H.strands) for (const st of H.strands) { ctx.strokeStyle = hcL; ctx.lineWidth = lines(k).inner * 1.3; ctx.lineCap = 'round'; ctx.stroke(st); }
    for (const h of hat) h.draw(ctx, k);
  } };

  // ---- face: brows, lids and mouth per mood (variants 'happy', 'sad', ..., '.b' = blinking) ----
  D.face = { box: [hx - hrx - 6, Math.min(G.eyes[0][1] - G.eyeD - 14, hy - hry), hx + hrx + 6, G.mouth[1] + 16], pivot: G.neck, draw(ctx, k) {
    const v = String(k.v || 'happy'), blink = v.endsWith('.b'), mood = v.split('.')[0];
    const [mx, my] = G.mouth, d = G.eyeD;
    const lidFill = (X && X.lid) || headFill;   // a species with a pale face around the eyes (the owl) closes them on it
    const lid = (x, y, shape) => {
      const c = circ(x, y, d / 2 + 0.6); ctx.fillStyle = lidFill; ctx.fill(c);
      const p = new Path2D();
      if (shape === 'up') { p.moveTo(x - d * 0.36, y + 2); p.quadraticCurveTo(x, y - d * 0.4, x + d * 0.36, y + 2); }
      else if (shape === 'x') { p.moveTo(x - d * 0.3, y - d * 0.25); p.lineTo(x + d * 0.12, y); p.lineTo(x - d * 0.3, y + d * 0.25); }
      else if (shape === 'xr') { p.moveTo(x + d * 0.3, y - d * 0.25); p.lineTo(x - d * 0.12, y); p.lineTo(x + d * 0.3, y + d * 0.25); }
      else { p.moveTo(x - d * 0.36, y); p.quadraticCurveTo(x, y + d * 0.3, x + d * 0.36, y); }
      detail(ctx, k, p, 1.7);
    };
    const half = (x, y, tilt = 0, cov = 0.95) => { ctx.save(); const c = circ(x, y, d / 2 + 0.6); ctx.clip(c); ctx.fillStyle = lidFill; ctx.fillRect(x - d, y - d, d * 2, d * cov + tilt); ctx.restore(); const p = new Path2D(); p.moveTo(x - d * 0.42, y - d * (1 - cov) + tilt * 0.5); p.lineTo(x + d * 0.42, y - d * (1 - cov) - tilt * 0.5); detail(ctx, k, p, 1.5); };
    const brow = (x, y, a, lift = 0) => { const p = new Path2D(); const by = y - d * 0.78 - lift; p.moveTo(x - d * 0.28, by + a * d * 0.18); p.quadraticCurveTo(x, by - d * 0.08, x + d * 0.28, by - a * d * 0.18); detail(ctx, k, p, STYLE.name === 'bold' ? 2.2 : 1.5); };
    const [L, Rr] = G.eyes;
    if (blink) { lid(L[0], L[1]); lid(Rr[0], Rr[1]); }
    else if (mood === 'cheer') { lid(L[0], L[1], 'up'); lid(Rr[0], Rr[1], 'up'); }
    else if (mood === 'hurt') { lid(L[0], L[1], 'x'); lid(Rr[0], Rr[1], 'xr'); }
    else if (mood === 'sleep') { lid(L[0], L[1]); lid(Rr[0], Rr[1]); }
    else if (mood === 'wink') lid(Rr[0], Rr[1], 'up');
    else if (mood === 'sleepy') { half(L[0], L[1]); half(Rr[0], Rr[1]); }
    else if (mood === 'sad') { half(L[0], L[1], -4); half(Rr[0], Rr[1], 4); }
    else if (STYLE.name === 'bold' && mood !== 'surprised') { half(L[0], L[1], -2, 0.74); half(Rr[0], Rr[1], 2, 0.74); }   // bold: a cool, narrowed look
    // brows (kids, foxes, bunnies; the mascot and the frog emote with lids and mouth)
    const browed = sp === 'kid' || sp === 'fox' || sp === 'bunny' || sp === 'bee' || !!(X && X.browed);
    if (browed) {
      if (mood === 'sad' || mood === 'hurt') { brow(L[0], L[1], -1); brow(Rr[0], Rr[1], 1); }
      else if (mood === 'determined') { brow(L[0], L[1], 1, -2); brow(Rr[0], Rr[1], -1, -2); }
      else if (mood === 'surprised') { brow(L[0], L[1], 0, 4); brow(Rr[0], Rr[1], 0, 4); }
      else if (mood === 'thinking') { brow(L[0], L[1], 0, 3); brow(Rr[0], Rr[1], 0.6, -1); }
    }
    // mouth
    const w = sp === 'frog' ? 15 : sp === 'oomba' ? 7 : 6.5;
    const m = new Path2D();
    if (X && X.mouth === 'beak') { if (X.beak) X.beak(ctx, k, XH, mood === 'cheer' || mood === 'talk' || mood === 'surprised' || mood === 'hurt'); }
    else if (mood === 'cheer' || mood === 'talk' || mood === 'surprised' || mood === 'hurt') {
      const o = new Path2D();
      if (mood === 'cheer') { o.moveTo(mx - w * 1.2, my - 2); o.quadraticCurveTo(mx, my - 3, mx + w * 1.2, my - 2); o.quadraticCurveTo(mx + w, my + 11, mx, my + 11); o.quadraticCurveTo(mx - w, my + 11, mx - w * 1.2, my - 2); }
      else if (mood === 'hurt') { o.moveTo(mx - w, my + 3); o.quadraticCurveTo(mx, my - 4, mx + w, my + 3); o.quadraticCurveTo(mx, my + 1, mx - w, my + 3); }
      else o.ellipse(mx, my + 2, mood === 'talk' ? w * 0.8 : w * 0.55, mood === 'talk' ? 4.6 : 5.5, 0, 0, TAU);
      o.closePath(); ctx.fillStyle = P.cocoa[3]; ctx.fill(o);
      ctx.save(); ctx.clip(o); ctx.fillStyle = P.coral[1]; ctx.beginPath(); ctx.ellipse(mx, my + 10, w * 0.7, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
      detail(ctx, k, o, 1.2);
    } else {
      if (mood === 'sad') { m.moveTo(mx - w, my + 4); m.quadraticCurveTo(mx, my - 3, mx + w, my + 4); }
      else if (mood === 'determined') { m.moveTo(mx - w, my + 1); m.quadraticCurveTo(mx, my + 4, mx + w, my); }
      else if (mood === 'thinking') { m.moveTo(mx - w * 0.6, my + 2); m.quadraticCurveTo(mx, my, mx + w * 0.9, my + 3); }
      else if (mood === 'sleepy' || mood === 'sleep') { m.moveTo(mx - w * 0.5, my + 2); m.quadraticCurveTo(mx, my + 4, mx + w * 0.5, my + 2); }
      else if (sp === 'fox' || (X && X.mouth === 'w')) { m.moveTo(mx - w, my - 1); m.quadraticCurveTo(mx - w / 2, my + 5, mx, my); m.quadraticCurveTo(mx + w / 2, my + 5, mx + w, my - 1); }
      else { m.moveTo(mx - w, my); m.quadraticCurveTo(mx, my + w * 0.95, mx + w, my); }
      detail(ctx, k, m, 1.4);
      if (sp === 'bunny' && mood !== 'sad') { const t = rrectPath(mx - 3.5, my + 2.5, 7, 6, 1.5); sticker(ctx, k, t, { fill: CREAM, rim: false, line: 0.5 }); }
    }
    if (wear.has('glasses')) for (const [x, y] of G.eyes) { const g = circ(x, y, d * 0.62); ctx.strokeStyle = INK; ctx.lineWidth = lines(k).inner * 1.8; ctx.stroke(g); const b = new Path2D(); b.moveTo(L[0] + d * 0.62, L[1]); b.lineTo(Rr[0] - d * 0.62, Rr[1]); detail(ctx, k, b, 1.5); }
  } };
  return D;
}
function oombaBean() {
  const p = new Path2D();
  p.moveTo(60, 52); p.bezierCurveTo(95, 52, 102, 84, 101, 108); p.bezierCurveTo(100, 134, 84, 146, 60, 146); p.bezierCurveTo(36, 146, 20, 134, 19, 108); p.bezierCurveTo(18, 84, 25, 52, 60, 52); p.closePath();
  return p;
}
/** Hair as back (behind the head), front (over it) and low (hanging behind the body: long hair) shapes, plus hair
 *  ties and lighter strands. */
function hairShapes(style, G) {
  const [hx, hy, rx, ry] = G.head, top = hy - ry, back = [], front = [], low = [], ties = [], strands = [];
  const cap = (drop = 12, ext = 2) => { const p = new Path2D(); p.ellipse(hx, hy, rx + ext, ry + ext, 0, PI + 0.32, TAU - 0.32); p.quadraticCurveTo(hx + rx * 0.5, top + drop + 4, hx, top + drop); p.quadraticCurveTo(hx - rx * 0.6, top + drop + 6, hx - (rx + ext) * Math.cos(0.32), hy - (ry + ext) * Math.sin(0.32)); p.closePath(); return p; };
  const strand = (x0, y0, cx, cy, x1, y1) => { const p = new Path2D(); p.moveTo(x0, y0); p.quadraticCurveTo(cx, cy, x1, y1); strands.push(p); };
  if (style === 'puffs') {
    // two puffs at the sides of the head, tied off with hair ties and textured with curls: pigtail puffs, never ears
    for (const sd of [-1, 1]) {
      const bx = hx + sd * (rx + 9), by = hy - 7;
      back.push(circ(bx, by, 12.5)); ties.push(ellipsePath(hx + sd * (rx - 1), by + 1, 3.4, 6, sd * -0.25));
      for (const [dx, dy, a0] of [[-3, -3, 0.2], [3, 3, 2.2]]) { const c = new Path2D(); c.arc(bx + sd * dx, by + dy, 4.4, a0, a0 + PI * 1.1); strands.push(c); }
    }
    front.push(cap(14));
  }
  else if (style === 'bob') { back.push(rrectPath(hx - rx - 5, top - 4, (rx + 5) * 2, ry * 2 + 2, rx * 0.9)); const f = new Path2D(); f.ellipse(hx, hy, rx + 3, ry + 3, 0, PI + 0.05, TAU - 0.05); f.lineTo(hx + rx * 0.7, hy - 8); f.quadraticCurveTo(hx + rx * 0.3, top + 18, hx, hy - 10); f.quadraticCurveTo(hx - rx * 0.3, top + 18, hx - rx * 0.7, hy - 8); f.closePath(); front.push(f); strand(hx - 8, top + 3, hx - rx * 0.6, top + 6, hx - rx * 0.85, hy - 8); }
  else if (style === 'curls') { for (let i = 0; i <= 8; i++) { const a = PI + 0.05 + (i / 8) * (PI - 0.1); back.push(circ(hx + Math.cos(a) * (rx + 1), hy + Math.sin(a) * (ry + 1) + 4, 10)); } front.push(cap(16, 4)); }
  else if (style === 'spiky') { const p = new Path2D(); p.moveTo(hx - rx - 1, hy - 4); const n = 5; for (let i = 0; i <= n; i++) { const a = PI + 0.2 + (i / n) * (PI - 0.4), x = hx + Math.cos(a) * (rx + 12), y = hy + Math.sin(a) * (ry + 12); const b = PI + 0.2 + ((i + 0.5) / n) * (PI - 0.4); p.quadraticCurveTo(x, y, hx + Math.cos(b) * rx * 0.92, hy + Math.sin(b) * ry * 0.92); } p.quadraticCurveTo(hx, top + 18, hx - rx - 1, hy - 4); p.closePath(); front.push(p); }
  else if (style === 'braids') { for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) back.push(ellipsePath(hx + sd * (rx + 2), hy + 8 + i * 11, 6.5, 7)); for (const sd of [-1, 1]) ties.push(ellipsePath(hx + sd * (rx + 2), hy + 39, 4.5, 2.6)); front.push(cap(12)); }
  else if (style === 'buzz') front.push(cap(8, 1));
  else if (style === 'long') {
    // parted in the middle, curtains framing the face, the length hanging behind the shoulders (its own back part)
    back.push(ellipsePath(hx, hy - 2, rx + 6, ry + 5));
    low.push(rrectPath(hx - rx - 6, hy - 4, (rx + 6) * 2, ry + 44, 16));
    const f = new Path2D(); f.moveTo(hx, top + 3);
    f.quadraticCurveTo(hx - rx * 0.55, top + 7, hx - rx * 0.9, hy + 2); f.lineTo(hx - rx - 4, hy + 16);
    f.ellipse(hx, hy, rx + 4, ry + 4, 0, PI * 0.93, PI * 2.07);
    f.lineTo(hx + rx + 4, hy + 16); f.lineTo(hx + rx * 0.9, hy + 2); f.quadraticCurveTo(hx + rx * 0.55, top + 7, hx, top + 3); f.closePath();
    front.push(f);
    strand(hx - 4, top + 4, hx - rx * 0.6, top + 9, hx - rx * 0.86, hy + 4); strand(hx + 4, top + 4, hx + rx * 0.6, top + 9, hx + rx * 0.86, hy + 4);
  }
  else if (style === 'cap') front.push(cap(6, 1));
  return { back, front, low, ties, strands };
}
/** Head wear (crown, wizard hat, headphones, the 'cap' hair style is a hair shape). -> [{p, draw}] */
function wearHat(wear, hx, top, rx) {
  const out = [];
  for (const n of wear) if (WEAR_X[n] && WEAR_X[n].hat) out.push(WEAR_X[n].hat(hx, top, rx));
  if (wear.has('headphones')) {
    const band = new Path2D(); band.ellipse(hx, top + 26, rx + 5, rx - 2, 0, PI + 0.25, TAU - 0.25);
    const cups = [-1, 1].map(s => rrectPath(hx + s * (rx + 2) - 7, top + 26, 14, 22, 7));
    out.push({ p: cups[0], draw: (ctx, k) => { ctx.strokeStyle = INK; ctx.lineWidth = lines(k).w * 1.6; ctx.lineCap = 'round'; ctx.stroke(band); ctx.strokeStyle = P.coral[2]; ctx.lineWidth = lines(k).w * 0.7; ctx.stroke(band); for (const c of cups) sticker(ctx, k, c, { fill: P.coral[2], shade: P.coral[3], shadeOff: 2, rim: false }); } }, { p: cups[1], draw: () => {} });
  }
  if (wear.has('crown')) {
    const p = new Path2D(); p.moveTo(hx - 16, top + 6); p.lineTo(hx - 18, top - 12); p.lineTo(hx - 8, top - 3); p.lineTo(hx, top - 16); p.lineTo(hx + 8, top - 3); p.lineTo(hx + 18, top - 12); p.lineTo(hx + 16, top + 6); p.closePath();
    out.push({ p, draw: (ctx, k) => { sticker(ctx, k, p, { fill: P.spark[2], shade: P.spark[3], shadeOff: 3, rim: false, unlit: true }); sticker(ctx, k, circ(hx, top - 1, 3), { fill: P.grape[2], rim: false, line: 0.6 }); } });
  }
  if (wear.has('wizard-hat')) {
    const p = new Path2D(); p.moveTo(hx - rx - 6, top + 10); p.quadraticCurveTo(hx, top + 2, hx + rx + 6, top + 10); p.quadraticCurveTo(hx + 12, top - 2, hx + 8, top - 30); p.quadraticCurveTo(hx + 4, top - 40, hx + 16, top - 44); p.quadraticCurveTo(hx - 4, top - 44, hx - 12, top - 6); p.quadraticCurveTo(hx - 18, top + 2, hx - rx - 6, top + 10); p.closePath();
    out.push({ p, draw: (ctx, k) => { sticker(ctx, k, p, { fill: P.grape[2], shade: P.grape[3], shadeOff: 4, rim: false }); for (const [x, y, r] of [[hx - 4, top - 14, 3.5], [hx + 6, top - 2, 2.6]]) { const s = sparkPath(x, y, r * 1.6, 0.2); ctx.fillStyle = P.snow[0]; ctx.fill(s); glowMask(k, s); } } });
  }
  return out;
}

// ---- the rig: procedural clips -> part slots ------------------------------------------------------------------------
// Pose channels: body y, head y, head rot, arm raise back/front, legs (x, y, rot) back/front, tail, ears, wings, squash y.
const NCH = 14, BY = 0, HY = 1, HR = 2, AB = 3, AF = 4, LBX = 5, LBY = 6, LBR = 7, LFX = 8, LFY = 9, LFR = 10, TR = 11, ER = 12, SY = 13;
export function clipPose(clip, t, T, o, speed = 1) {
  o.fill(0); o[SY] = 1;
  const br = Math.sin(T * TAU * 0.4);
  const idle = () => { o[SY] = 1 + 0.02 * br; o[HY] = 0.6 * br; o[AB] = 0.12 + 0.04 * Math.sin(T * 2.5); o[AF] = 0.12 + 0.04 * Math.sin(T * 2.5 + 1); o[TR] = 0.15 * Math.sin(T * 2); };
  switch (clip) {
    case 'walk': case 'run': {
      const run = clip === 'run', f = (run ? 3.3 : 2.1) * Math.max(0.6, Math.min(1.6, speed)), ph = t * f * TAU, s = Math.sin(ph), c = Math.cos(ph), a = run ? 1.6 : 1;
      o[BY] = -Math.abs(c) * 3 * a; o[LBX] = s * 5 * a; o[LFX] = -s * 5 * a; o[LBY] = -Math.max(0, c) * 4 * a; o[LFY] = -Math.max(0, -c) * 4 * a;
      o[LBR] = -s * 0.25 * a; o[LFR] = s * 0.25 * a; o[AB] = 0.15 - s * 0.55 * a; o[AF] = 0.15 + s * 0.55 * a; o[HR] = 0.03 * s + (run ? 0.08 : 0); o[TR] = 0.3 * s; o[SY] = 1 + 0.03 * Math.abs(c) * a;
      break;
    }
    case 'jump': o[SY] = 1.12; o[AB] = o[AF] = 2.5; o[LBY] = o[LFY] = -5; o[LBR] = 0.3; o[LFR] = -0.3; o[HY] = -2; o[ER] = -0.3; break;
    case 'fall': o[SY] = 1.04; o[AB] = 2 + 0.3 * Math.sin(t * 14); o[AF] = 2 + 0.3 * Math.sin(t * 14 + 1); o[LBY] = o[LFY] = -2; o[LBX] = -3; o[LFX] = 3; o[ER] = 0.5; break;
    case 'land': { const q = 1 - Math.min(1, t / ONE_SHOT.land); o[SY] = 1 - 0.2 * q * q; o[AB] = o[AF] = 0.7 * q; o[BY] = 3 * q; break; }
    case 'hurt': o[HR] = -0.15; o[AB] = o[AF] = 1.2; o[SY] = 0.94; o[BY] = Math.sin(t * 50) * 1.5; break;
    case 'cheer': { const hop = Math.abs(Math.sin(t * PI * 2.4)); o[BY] = -hop * 14; o[SY] = 1 + (hop - 0.5) * 0.12; o[AB] = 2.6 + 0.35 * Math.sin(t * 12); o[AF] = 2.6 + 0.35 * Math.sin(t * 12 + PI); o[LBY] = o[LFY] = -hop * 3; o[TR] = 0.4 * Math.sin(t * 14); break; }
    case 'think': idle(); o[HR] = 0.12; o[AF] = -2.3; o[AB] = 0.1; break;
    case 'sad': o[HY] = 3; o[HR] = 0.08; o[AB] = o[AF] = -0.04; o[SY] = 0.97 + 0.01 * Math.sin(T * 1.5); o[TR] = -0.3; o[ER] = 0.35; break;
    case 'sleep': o[HY] = 2; o[HR] = 0.18; o[SY] = 1 + 0.04 * Math.sin(T * 1.6); o[AB] = o[AF] = 0.05; o[ER] = 0.4; break;
    case 'talk': idle(); o[HR] = 0.04 * Math.sin(T * 5); o[AF] = 0.5 + 0.3 * Math.sin(T * 3); break;
    case 'wave': idle(); o[AF] = 2.5 + 0.45 * Math.sin(t * 10); o[HR] = -0.06; break;
    default: idle();
  }
  return o;
}
/** Which face variant a clip and mood show. */
export function faceFor(clip, mood, T, seed) {
  if (clip === 'cheer') return 'cheer'; if (clip === 'hurt') return 'hurt'; if (clip === 'sleep') return 'sleep';
  if (clip === 'sad') return 'sad'; if (clip === 'think') return 'thinking';
  if (clip === 'talk') return ((Math.floor(T / 0.11) * 2654435761 + seed) >>> 0) % 3 ? 'talk' : mood === 'talk' ? 'happy' : mood;
  if (clip === 'fall' || clip === 'jump') return mood === 'happy' ? 'surprised' : mood;
  return mood;
}
const slot = (o, name, x, y, w, h, r = 0, v = '') => { o.name = name; o.x = x; o.y = y; o.w = w; o.h = h; o.r = r; o.v = v; };
/** The character rig: writes part slots (back to front) for entity e at stage time t; returns the count. */
export function charRig(e, t, out) {
  const b = e.charB; if (!b) return 0;
  const A = e.stage.atlas, G = b.G;
  if (e._pose == null) { e._pose = new Float32Array(NCH); e._prev = new Float32Array(NCH); e._clipIn = e.clip; e._clipAt = t; e._from = 'idle'; e._lt = t; e._er = 0; e._erv = 0; }
  if (e.clip !== e._clipIn) { e._from = e._clipIn; e._clipIn = e.clip; e._clipAt = t; }
  const dt = Math.max(0, Math.min(0.05, t - e._lt)); e._lt = t;
  let clip = e.clip; const ct = t - e._clipAt, spd = Math.abs(e.vx || 0);
  if (ONE_SHOT[clip] && ct > ONE_SHOT[clip]) { e.state('idle'); clip = 'idle'; }
  if (clip === 'idle' && e.autoClip !== false && spd > 20) clip = spd > 220 ? 'run' : 'walk';
  const pose = clipPose(clip, ct, t, e._pose, spd / 120);
  const bl = Math.min(1, ct / 0.12);
  if (bl < 1) { const pp = clipPose(e._from, t - e._clipAt + 1, t, e._prev); for (let i = 0; i < NCH; i++) pose[i] = pp[i] + (pose[i] - pp[i]) * bl; }
  // secondary motion: ears/antenna/tail follow on a spring (k 120, zeta 0.5)
  const target = Math.max(-0.45, Math.min(0.45, -(e.vx || 0) / 500)) + pose[ER];
  const acc = 120 * (target - e._er) - 2 * 0.5 * Math.sqrt(120) * e._erv; e._erv += acc * dt; e._er += e._erv * dt;
  e.csy = pose[SY]; e.csx = 1 / Math.sqrt(pose[SY]);
  e.breathe = 0;
  // blink
  if (t >= e.blinkAt + 0.12) e.blinkAt = t + 2 + e.rng() * 4;
  const blinking = e.blinkAt <= t && t < e.blinkAt + 0.12;
  let face = faceFor(clip, e.moodName || b.spec.mood, t, e.id);
  if (blinking && !CLOSED[face] && face !== 'sleepy') face += '.b';
  const nx = G.neck[0] - 60, ny = G.neck[1] - 150, hr = pose[HR], cr = Math.cos(hr), sr = Math.sin(hr), hdy = pose[BY] + pose[HY];
  const rot = (px, py) => { const dx = px - G.neck[0], dy = py - G.neck[1]; return [nx + dx * cr - dy * sr, ny + dx * sr + dy * cr + hdy]; };
  let n = 0;
  // The front arm hangs behind the torso; while it crosses the body (a hand at the chin, a point) it goes in front.
  const armFront = pose[AF] < -0.6 || pose[AF] > 1.9;
  const parts = armFront && b.parts.includes('armF') ? b.parts.filter(p => p !== 'armF').concat('armF') : b.parts;
  for (const name of parts) {
    const id = b.id + ':' + name, d = A.defs.get(id), o = out[n];
    if (name === 'pupilL' || name === 'pupilR') {
      if (closedEyes(face, name)) continue;
      const E = G.eyes[name === 'pupilL' ? 0 : 1], pd = A.defs.get(b.pupil), s = face === 'surprised' ? 0.7 : 1;
      // gaze travels at most ~third of the ring's radius: eyes look, they never go googly or cross-eyed
      const max = Math.max(0, Math.min(G.eyeD * 0.13, G.eyeD * (0.48 - (G.ring || 0.22)) - b.pr * s)), lx = e.lookX, ly = (face === 'thinking' ? -0.8 : e.lookY);
      const ll = Math.hypot(lx, ly) || 1, kx = Math.min(1, ll) * max / ll;
      const [px, py] = rot(E[0] + lx * kx, E[1] + ly * kx);
      slot(o, b.pupil, px, py, pd.w * s, pd.h * s); n++; continue;
    }
    if (!d) continue;
    const pvx = d.ax * d.w, pvy = d.ay * d.h; // pivot is the part's anchor; recover its char-space position from the box
    let x, y, r = 0, v = '';
    const P0 = pivotOf(G, name);
    switch (name) {
      case 'body': case 'pack': x = 0; y = P0[1] - 150 + pose[BY]; break;
      case 'head': case 'hairB': x = nx; y = ny + hdy; r = hr; break;
      case 'face': x = nx; y = ny + hdy; r = hr; v = face; break;
      case 'ears': [x, y] = rot(P0[0], P0[1]); r = hr + e._er; break;
      case 'armB': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = pose[AB]; break;
      case 'armF': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = -pose[AF]; break;
      case 'legB': x = P0[0] - 60 + pose[LBX]; y = P0[1] - 150 + pose[LBY]; r = pose[LBR]; break;
      case 'legF': x = P0[0] - 60 + pose[LFX]; y = P0[1] - 150 + pose[LFY]; r = pose[LFR]; break;
      case 'tail': x = P0[0] - 60; y = P0[1] - 150 + pose[BY]; r = pose[TR] - e._er * 0.6; break;
      case 'wingL': case 'wingR': { [x, y] = rot(P0[0], P0[1]); const fl = 0.35 + 0.35 * Math.sin(t * (e.stage.reduced ? 8 : 38) + (name === 'wingL' ? 0 : 0.4)); r = name === 'wingL' ? -fl : fl; break; }
      default: x = pvx; y = pvy;
    }
    slot(o, id, x, y, d.w, d.h, r, v); n++;
  }
  if (STYLE.name === 'bold' && STYLE.legs && G.hips) {   // bold proportions: longer legs (all above them rises), a smaller head about the neck
    const up = G.leg[0] * (STYLE.legs - 1), hk = STYLE.head, cy = ny + hdy - up;
    for (let i = 0; i < n; i++) {
      const o = out[i], part = o.name.slice(o.name.lastIndexOf(':') + 1);
      if (part === 'legB' || part === 'legF') { o.h *= STYLE.legs; continue; }
      o.y -= up;
      if (part === 'body' || part === 'pack') o.w *= STYLE.body;
      else if (!/^arm|^tail/.test(part)) { o.x = nx + (o.x - nx) * hk; o.y = cy + (o.y - cy) * hk; o.w *= hk; o.h *= hk; }
    }
  }
  return n;
}
function pivotOf(G, name) {
  switch (name) {
    case 'body': case 'pack': return [60, G.body ? G.body[1] : 150];
    case 'ears': return G.ears; case 'tail': return G.tail;
    case 'armB': return G.sh[0]; case 'armF': return G.sh[1];
    case 'legB': return G.hips[0]; case 'legF': return G.hips[1];
    case 'wingL': return G.wings[0]; case 'wingR': return G.wings[1];
    default: return G.neck;
  }
}
charRig.own = true;
