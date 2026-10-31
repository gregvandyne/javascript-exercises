// Art pack "dress" (public/vendor/oomba-kit/<version>/packs/dress.js): the auto-dressing that makes a game with no
// decoration code look lush. Every Builder template loads it. It adds:
// - per-biome dressing recipes for the parallax bands (houses, fences, lamp posts, tents, umbrellas, flags, cones,
//   tyre stacks, rock piles, grass tufts) on top of the core's trees, bushes and flowers;
// - foreground framing in the bottom corners (big fern leaves, palm fronds, agave, snowy or candy mounds);
// - ambient life: bird flocks, gulls, butterflies, drifting leaves, snow, fish under the sea (the stage flies them on
//   the clock; their count follows the quality tier and reduced motion turns them off);
// - the vehicles (car bus rocket boat plane) and the shell, cactus, snowman and log, which moved here from the core.
// Same "Oomba Ink" grammar as the core: Ink outline, Cream rim, flat cel shade.
export const PACK = { name: 'dress' };
// The themes (Oomba.game({ theme })): plain data, read by the pack below and by the server (the Builder's rules, the
// style lint). A theme bundles a biome (some come from other packs: `packs`; without them it shows `alt`), the time of
// day, an accent hue, a music mood and a prop set; the biome's dressing recipe brings its ambient life and framing.
const TH = (biome, accent, music, props, o) => Object.assign({ biome, accent, music, props: props.split(' '), tod: 0, packs: [], alt: biome }, o);
const AB = ['art-biomes'], AB2 = ['art-biomes-2'];
export const THEMES = {
  meadow: TH('meadow', 'mint', 'bright', 'tree flower bush mushroom rock log'),
  beach: TH('beach', 'sky', 'sunny', 'sandcastle starfish shell boat'),
  jungle: TH('jungle', 'mint', 'adventure', 'totem tree bush flower log', { packs: AB, alt: 'forest', tod: 0.1 }),
  snow: TH('snow', 'sky', 'calm', 'igloo snowman snowflake rock'),
  desert: TH('desert', 'peach', 'adventure', 'pyramid pot cactus rock', { tod: 0.36 }),
  reef: TH('reef', 'sky', 'dreamy', 'clam pearl anchor starfish shell', { packs: AB, alt: 'beach' }),
  space: TH('space', 'grape', 'cosmic', 'ufo satellite rocket planet asteroid', { packs: AB2, alt: 'snow' }),
  candy: TH('candy', 'coral', 'bouncy', 'sweet donut candycane cupcake gift'),
  haunted: TH('spooky', 'grape', 'spooky', 'pumpkin ghost cauldron sweet lantern', { packs: AB2, alt: 'forest', tod: 0.7 }),
  castle: TH('castle', 'coral', 'heroic', 'tower banner shield torch chest flag', { packs: AB2, alt: 'meadow', tod: 0.22 }),
  cyber: TH('cyber', 'sky', 'electro', 'drone sign block lantern', { packs: ['style-bold'], alt: 'meadow', tod: 1, style: 'bold' }),
  stadium: TH('stadium', 'sky', 'pumped', 'ball goalpost trophy medal flag', { packs: AB2, alt: 'meadow' }),
  forest: TH('forest', 'mint', 'calm', 'tree mushroom log rock'),
  autumn: TH('autumn', 'peach', 'calm', 'tree leaf mushroom log', { packs: AB, alt: 'forest', tod: 0.3 }),
  city: TH('city', 'sky', 'bright', 'car bus sign lantern', { packs: AB, alt: 'meadow', tod: 0.2 }),
};
export const ALIAS = { ocean: 'reef', oceanreef: 'reef', underwater: 'reef', sea: 'reef', spooky: 'haunted', halloween: 'haunted', ghosts: 'haunted', candyland: 'candy', sweets: 'candy',
  sports: 'stadium', sport: 'stadium', football: 'stadium', soccer: 'stadium', cybercity: 'cyber', neon: 'cyber', winter: 'snow', moon: 'space', outerspace: 'space',
  knights: 'castle', kingdom: 'castle', rainforest: 'jungle', island: 'beach', seaside: 'beach', sand: 'desert', woods: 'forest', fall: 'autumn', town: 'city' };
export function define(K) {
  const P = K.P, m = K.mix, TAU = Math.PI * 2, I = K.ink, INK = K.INK, CREAM = K.CREAM, RC = {};
  const S = (ctx, k, p, fill, shade, o = {}) => I.sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: o.off || 4 }, o));
  const F = (ctx, k, p, fill, line = 0.7) => I.sticker(ctx, k, p, { fill, rim: false, line });
  const circ = (x, y, r) => I.ellipse(x, y, r, r), rrectPath = I.rrect, detail = I.detail;
  const poly = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const rpoly = (pts, r) => { const p = new Path2D(), n = pts.length; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const s = mid(pts[n - 1], pts[0]); p.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; p.arcTo(a[0], a[1], b[0], b[1], r); } p.closePath(); return p; };
  const V = (name, w, h, draw, ax = 0.5, ay = 0.5) => K.prop(name, 'vehicles', { w, h, ax, ay, draw }, name === 'rocket' ? ['', 'go'] : null);
  const glowMask = I.glow;
  const N = (name, w, h, draw, ax = 0.5, ay = 0.5) => K.prop(name, 'nature', { w, h, ax, ay, draw });
  N('shell', 56, 50, (ctx, k) => {
    const s = new Path2D(); s.moveTo(28, 46); s.lineTo(8, 34); s.quadraticCurveTo(4, 8, 28, 4); s.quadraticCurveTo(52, 8, 48, 34); s.closePath();
    S(ctx, k, s, P.peach[1], P.peach[2], { off: 3 });
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { const l = poly([[28, 44], [28 + Math.sin(a) * 30, 44 - Math.cos(a) * 34]], false); detail(ctx, k, l, 0.7); }
    S(ctx, k, rrectPath(20, 42, 16, 7, 3), P.peach[2], P.peach[3], { off: 1, rim: false });
  }, 0.5, 1);
  N('cactus', 70, 110, (ctx, k) => {
    const armL = I.capsule(18, 66, 18, 40, 8), armR = I.capsule(52, 54, 52, 32, 7);
    const jl = I.capsule(18, 66, 30, 66, 8), jr = I.capsule(52, 54, 40, 54, 7);
    for (const p of [armL, jl, armR, jr]) S(ctx, k, p, P.mint[2], P.mint[3], { off: 2 });
    const body = I.capsule(35, 104, 35, 18, 13); S(ctx, k, body, P.mint[2], P.mint[3], { off: 4, gloss: [30, 30, 3, 9, 0] });
    for (const x of [30, 40]) { const l = poly([[x, 26], [x, 98]], false); detail(ctx, k, l, 0.6); }
    S(ctx, k, circ(35, 16, 5), P.coral[1], P.coral[2], { off: 1, rim: false });
  }, 0.5, 1);
  N('snowman', 80, 120, (ctx, k) => {
    for (const [y, r] of [[92, 26], [52, 20]]) S(ctx, k, circ(40, y, r), P.snow[0], P.snow[2], { off: 4 });
    const h = circ(40, 24, 15); S(ctx, k, h, P.snow[0], P.snow[2], { off: 3, gloss: [34, 18, 4, 3, -0.6] });
    const hat = rrectPath(28, 0, 24, 14, 3), brim = rrectPath(22, 11, 36, 5, 2.5); S(ctx, k, hat, P.ink[0], P.ink[0], { off: 0 }); S(ctx, k, brim, P.ink[0], P.ink[0], { off: 0, rim: false });
    ctx.fillStyle = INK; for (const x of [35, 45]) { ctx.beginPath(); ctx.arc(x, 22, 2.2, 0, TAU); ctx.fill(); }
    const n = poly([[39, 27], [52, 29], [39, 31]]); F(ctx, k, n, P.peach[2], 0.5);
    for (const y of [46, 58]) F(ctx, k, circ(40, y, 2.6), INK, 0.3);
    const sc = rrectPath(24, 36, 32, 7, 3.5); S(ctx, k, sc, P.coral[2], P.coral[3], { off: 1, rim: false });
  }, 0.5, 1);
  N('log', 96, 44, (ctx, k) => {
    const b = rrectPath(10, 6, 80, 34, 17); S(ctx, k, b, P.cocoa[2], P.cocoa[3], { off: 4, gloss: [34, 12, 12, 2.5, 0] });
    const end = I.ellipse(18, 23, 11, 16); S(ctx, k, end, P.cocoa[1], P.cocoa[2], { off: 2, rim: false });
    const ring = I.ellipse(18, 23, 5, 8); detail(ctx, k, ring, 0.7);
  }, 0.5, 1);
  const wheel = (ctx, k, x, y, r) => { S(ctx, k, circ(x, y, r), INK, INK, { off: 0 }); F(ctx, k, circ(x, y, r * 0.45), P.stone[1], 0.5); };
  V('car', 124, 76, (ctx, k) => {
    const body = new Path2D(); body.moveTo(6, 56); body.lineTo(6, 40); body.quadraticCurveTo(8, 32, 22, 30); body.lineTo(34, 12); body.quadraticCurveTo(38, 6, 46, 6); body.lineTo(82, 6); body.quadraticCurveTo(90, 6, 94, 12); body.lineTo(106, 30); body.quadraticCurveTo(118, 32, 118, 44); body.lineTo(118, 56); body.closePath();
    S(ctx, k, body, P.sky[2], P.sky[3], { off: 5, gloss: [30, 36, 10, 3, 0] });
    for (const [x0, x1] of [[38, 62], [66, 92]]) { const w = poly([[x0, 14], [x1, 14], [x1 + (x1 > 80 ? 8 : 0), 30], [x0 - (x0 < 50 ? 8 : 0), 30]]); F(ctx, k, w, P.sky[0], 0.6); }
    F(ctx, k, rrectPath(110, 38, 8, 6, 2), P.spark[1], 0.5); F(ctx, k, rrectPath(6, 40, 6, 6, 2), P.coral[2], 0.5);
    wheel(ctx, k, 32, 60, 12); wheel(ctx, k, 92, 60, 12);
  }, 0.5, 1);
  V('bus', 164, 96, (ctx, k) => {
    const body = rrectPath(6, 6, 152, 70, 16); S(ctx, k, body, P.mint[2], P.mint[3], { off: 6, gloss: [30, 14, 14, 3, 0] });
    for (let i = 0; i < 5; i++) F(ctx, k, rrectPath(16 + i * 26, 16, 20, 22, 5), P.sky[0], 0.6);
    F(ctx, k, rrectPath(138, 16, 14, 40, 5), P.sky[0], 0.6);
    F(ctx, k, rrectPath(6, 48, 152, 8, 2), CREAM, 0.6);
    F(ctx, k, rrectPath(150, 62, 8, 7, 2), P.spark[1], 0.5);
    wheel(ctx, k, 40, 80, 13); wheel(ctx, k, 124, 80, 13);
  }, 0.5, 1);
  V('rocket', 76, 136, (ctx, k) => {
    if (k.v === 'go') { const fl = new Path2D(); fl.moveTo(26, 104); fl.quadraticCurveTo(38, 150, 50, 104); fl.closePath(); S(ctx, k, fl, P.spark[1], P.peach[2], { off: 4, emissive: true, unlit: true }); const fl2 = new Path2D(); fl2.moveTo(32, 104); fl2.quadraticCurveTo(38, 126, 44, 104); fl2.closePath(); F(ctx, k, fl2, CREAM, 0.4); glowMask(k, fl2); }
    for (const s of [-1, 1]) { const fin = rpoly([[38 + s * 14, 76], [38 + s * 30, 106], [38 + s * 12, 100]], 3); S(ctx, k, fin, P.coral[2], P.coral[3], { off: 2 }); }
    const b = new Path2D(); b.moveTo(38, 4); b.bezierCurveTo(60, 20, 62, 70, 54, 104); b.lineTo(22, 104); b.bezierCurveTo(14, 70, 16, 20, 38, 4); b.closePath();
    S(ctx, k, b, CREAM, P.cream[3], { off: 6, gloss: [28, 40, 4, 14, 0.1] });
    const nose = new Path2D(); nose.moveTo(38, 4); nose.bezierCurveTo(48, 11, 53, 20, 55, 28); nose.quadraticCurveTo(38, 22, 21, 28); nose.bezierCurveTo(23, 20, 28, 11, 38, 4); nose.closePath(); S(ctx, k, nose, P.coral[2], P.coral[3], { off: 2, rim: false });
    S(ctx, k, circ(38, 50, 11), P.sky[2], P.sky[3], { off: 2, rim: false }); F(ctx, k, circ(38, 50, 6.5), P.sky[0], 0.5);
  }, 0.5, 0.77);
  V('boat', 124, 96, (ctx, k) => {
    const mast = rrectPath(58, 6, 6, 70, 3); S(ctx, k, mast, P.cocoa[2], P.cocoa[3], { off: 1 });
    const sail = new Path2D(); sail.moveTo(66, 10); sail.quadraticCurveTo(100, 40, 104, 70); sail.lineTo(66, 70); sail.closePath(); S(ctx, k, sail, CREAM, P.cream[3], { off: 4 });
    const s2 = new Path2D(); s2.moveTo(56, 22); s2.quadraticCurveTo(32, 46, 26, 70); s2.lineTo(56, 70); s2.closePath(); S(ctx, k, s2, P.sky[1], P.sky[2], { off: 3 });
    const hull = new Path2D(); hull.moveTo(6, 72); hull.lineTo(118, 72); hull.quadraticCurveTo(108, 94, 90, 94); hull.lineTo(30, 94); hull.quadraticCurveTo(14, 94, 6, 72); hull.closePath();
    S(ctx, k, hull, P.coral[2], P.coral[3], { off: 4, gloss: [30, 78, 12, 2.5, 0] });
    F(ctx, k, rrectPath(16, 78, 92, 5, 2.5), CREAM, 0.5);
  }, 0.5, 1);
  V('plane', 136, 70, (ctx, k) => {
    const tail = rpoly([[14, 34], [6, 8], [26, 10], [40, 34]], 4); S(ctx, k, tail, P.coral[2], P.coral[3], { off: 2 });
    const body = new Path2D(); body.moveTo(10, 40); body.quadraticCurveTo(10, 28, 30, 28); body.lineTo(108, 28); body.quadraticCurveTo(132, 30, 132, 42); body.quadraticCurveTo(128, 52, 108, 52); body.lineTo(26, 52); body.quadraticCurveTo(10, 52, 10, 40); body.closePath();
    S(ctx, k, body, CREAM, P.cream[3], { off: 4, gloss: [60, 32, 22, 2.5, 0] });
    for (let i = 0; i < 4; i++) F(ctx, k, circ(54 + i * 14, 38, 3.8), P.sky[1], 0.5);
    F(ctx, k, rrectPath(110, 32, 14, 9, 4), P.sky[1], 0.5);
    const wing = rpoly([[58, 44], [86, 44], [64, 68], [50, 68]], 4); S(ctx, k, wing, P.sky[2], P.sky[3], { off: 2 });
  });

  // Foreground framing (drawn by the stage over the play plane in the bottom corners, darkened toward the biome's
  // shade): big fern leaves, palm fronds, agave spikes or snowy / candy mounds. Variant = the biome.
  K.art('fg', { w: 220, h: 200, ax: 0, ay: 1, draw(ctx, k) {
    const B = K.biomes[k.v] || K.biomes.meadow, kind = (K.recipes[k.v] || RC[k.v] || {}).fg || 'fern', near = B.bands[3], R = K.rand(kind.length * 7 + 3);
    const dark = m(near[1], INK, 0.25), mid = m(near[0], near[1], 0.6), lw = Math.max(2.5, 0.05 * k.px * 0.3) / k.s;
    const stroke = p => { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(p); };
    if (kind === 'snowbush' || kind === 'lollyfg' || kind === 'rocksfg') {
      for (const [x, y, r, i] of [[40, 190, 70, 0], [120, 205, 52, 1], [8, 120, 46, 2]]) {
        const p = new Path2D(); p.arc(x, y, r, 0, TAU); const col = kind === 'snowbush' ? (i === 2 ? m(P.mint[3], INK, 0.2) : P.snow[1]) : kind === 'rocksfg' ? m(P.stone[1], near[0], 0.3) : [P.coral[1], P.grape[1], P.mint[1]][i];
        ctx.fillStyle = m(col, INK, 0.12); ctx.fill(p); ctx.save(); ctx.clip(p); ctx.translate(-r * 0.15, -r * 0.2); ctx.fillStyle = col; ctx.fill(p); ctx.restore(); stroke(p);
      }
      if (kind === 'lollyfg') { const st = new Path2D(); st.rect(150, 60, 9, 140); ctx.fillStyle = CREAM; ctx.fill(st); stroke(st); const c = new Path2D(); c.arc(154, 54, 34, 0, TAU); ctx.fillStyle = P.coral[2]; ctx.fill(c); ctx.strokeStyle = CREAM; ctx.lineWidth = 6; ctx.beginPath(); for (let a = 0; a < 12; a += 0.25) ctx.lineTo(154 + Math.cos(a) * a * 2.6, 54 + Math.sin(a) * a * 2.6); ctx.stroke(); stroke(c); }
      return;
    }
    const n = kind === 'agave' ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const a = -1.45 + i / (n - 1) * 1.35 + (R() - 0.5) * 0.12, len = (kind === 'frond' ? 210 : 175) * (0.7 + R() * 0.35), w = kind === 'agave' ? 15 : 30;
      const ex = Math.cos(a) * len, ey = 200 + Math.sin(a) * len, cx = Math.cos(a - 0.35) * len * 0.55, cy = 200 + Math.sin(a - 0.35) * len * 0.55, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const p = new Path2D(); p.moveTo(-6, 206); p.quadraticCurveTo(cx - nx, cy - ny, ex, ey); p.quadraticCurveTo(cx + nx, cy + ny, 6, 206); p.closePath();
      const col = i % 2 ? dark : mid; ctx.fillStyle = col; ctx.fill(p);
      if (kind !== 'agave') { ctx.save(); ctx.clip(p); ctx.strokeStyle = m(col, INK, 0.3); ctx.lineWidth = lw * 0.7; for (let j = 1; j < 8; j++) { const q = j / 8, bx = cx * q * 1.2 * (1 - q) + ex * q * q, by = 200 + (cy - 200) * 2 * q * (1 - q) + (ey - 200) * q * q; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + nx * 1.4, by + ny * 1.4); ctx.moveTo(bx, by); ctx.lineTo(bx - nx * 1.4, by - ny * 1.4); ctx.stroke(); } ctx.restore(); }
      stroke(p);
    }
  } });
  // Ambient life (the stage flies them across the scene): a bird / gull (a flapping "m"), a butterfly, a fish, a leaf.
  K.art('critter', { w: 40, h: 30, ax: 0.5, ay: 0.5, draw(ctx, k) {
    const v = k.v || 'bird', lw = Math.max(1.6, 0.06 * k.px) / k.s, p = new Path2D();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (v === 'parrot') { p.moveTo(3, 12); p.quadraticCurveTo(11, 3, 20, 15); p.quadraticCurveTo(29, 3, 37, 12); ctx.strokeStyle = INK; ctx.lineWidth = lw * 3.4; ctx.stroke(p); ctx.strokeStyle = P.coral[2]; ctx.lineWidth = lw * 1.6; ctx.stroke(p); const b = I.ellipse(20, 16, 4, 5); ctx.fillStyle = P.sky[2]; ctx.fill(b); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(b); return; }
    if (v === 'bird' || v === 'gull') { p.moveTo(3, 12); p.quadraticCurveTo(11, 3, 20, 15); p.quadraticCurveTo(29, 3, 37, 12); ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.2; ctx.stroke(p); if (v === 'gull') { ctx.strokeStyle = CREAM; ctx.lineWidth = lw * 0.9; ctx.stroke(p); } return; }
    // theme critters ('bat:bird' flies a bat on the bird's path): bats, little sheet ghosts, comets, saucers, confetti
    const fill = (q, c) => { ctx.fillStyle = c; ctx.fill(q); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(q); }, eyes = (y, d = 3.4) => { ctx.fillStyle = INK; for (const x of [20 - d, 20 + d]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); } };
    if (v === 'bat') { p.moveTo(20, 11); p.quadraticCurveTo(11, 2, 2, 9); p.quadraticCurveTo(6, 12, 5, 17); p.quadraticCurveTo(9, 13, 12, 18); p.quadraticCurveTo(15, 13, 20, 19); p.quadraticCurveTo(25, 13, 28, 18); p.quadraticCurveTo(31, 13, 35, 17); p.quadraticCurveTo(34, 12, 38, 9); p.quadraticCurveTo(29, 2, 20, 11); fill(p, P.grape[3]); fill(I.ellipse(20, 14, 5, 6), P.grape[2]); return eyes(13, 2); }
    if (/^ghost/.test(v)) { p.moveTo(9, 27); p.lineTo(9, 13); p.arc(20, 13, 11, Math.PI, 0); p.lineTo(31, 27); for (let i = 0; i < 3; i++) p.quadraticCurveTo(31 - (i + 0.5) * 22 / 3, 22, 31 - (i + 1) * 22 / 3, 27); fill(p, CREAM); eyes(14); if (v === 'ghost1') { ctx.beginPath(); ctx.arc(20, 19, 2, 0, TAU); ctx.fill(); } return; }
    if (v === 'comet') { p.moveTo(26, 9); p.quadraticCurveTo(10, 11, 1, 15); p.quadraticCurveTo(10, 19, 26, 21); fill(p, P.sky[1]); return fill(I.ellipse(28, 15, 7, 7), CREAM); }
    if (/^ufo/.test(v)) { fill(I.ellipse(20, 11, 7, 7), P.sky[0]); fill(I.ellipse(20, 17, 17, 6), v === 'ufo1' ? P.mint[2] : P.grape[2]); ctx.fillStyle = CREAM; for (const x of [11, 20, 29]) { ctx.beginPath(); ctx.arc(x, 17, 1.6, 0, TAU); ctx.fill(); } return; }
    if (/^conf/.test(v)) return fill(K.ink.rrect(12, 9, 16, 11, 2), [P.coral[2], P.sky[2], P.mint[2]][+v.slice(-1) % 3]);
    let col = P.coral[1];
    if (v === 'fly' || v === 'fly2') { col = v === 'fly' ? P.spark[2] : P.grape[1]; p.ellipse(13, 12, 10, 8, -0.5, 0, TAU); p.ellipse(27, 12, 10, 8, 0.5, 0, TAU); p.ellipse(15, 22, 6, 5, 0.4, 0, TAU); p.ellipse(25, 22, 6, 5, -0.4, 0, TAU); }
    else if (v === 'fish') { col = P.spark[2]; p.ellipse(18, 15, 12, 8, 0, 0, TAU); p.moveTo(28, 15); p.lineTo(38, 7); p.lineTo(38, 23); p.closePath(); }
    else { col = [P.peach[2], P.coral[2], P.spark[2]][(+v.slice(-1) || 0) % 3]; p.ellipse(20, 15, 14, 6, 0.5, 0, TAU); }
    ctx.fillStyle = col; ctx.fill(p); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(p);
    if (v === 'fly' || v === 'fly2') { ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(20, 26); ctx.lineWidth = lw * 1.8; ctx.stroke(); }
    if (v === 'fish') { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(11, 13, 1.8, 0, TAU); ctx.fill(); }
  } });

  // ---- band dressing: (ctx, mx, x, y, s, R, fill, shade, k, D) -> drawn standing on the band's surface at (x, y) ----
  const decos = {
    tuft(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const h = (9 + R() * 8) * s, p = new Path2D(), nb = 3 + ((R() * 3) | 0);
      for (let i = 0; i < nb; i++) { const a = (i / (nb - 1) - 0.5) * 1.3, bx = x + (i - nb / 2) * 2.2 * s; p.moveTo(bx - 2 * s, y + 2); p.quadraticCurveTo(bx + Math.sin(a) * h * 0.4, y - h * 0.5, bx + Math.sin(a) * h * 0.9, y - h * (0.8 + R() * 0.3)); p.quadraticCurveTo(bx + Math.sin(a) * h * 0.3, y - h * 0.4, bx + 2 * s, y + 2); }
      ctx.fillStyle = m(shade, fill, 0.35); ctx.fill(p); D.ink(ctx, mx, p, D.lwOf(3 * s, k));
    },
    rocks(ctx, mx, x, y, s, R, fill, shade, k, D) {
      for (const [dx, dy, r] of [[-0.55, 0, 0.75], [0.5, 0.05, 0.6], [0, -0.55, 0.62]].slice(0, 2 + ((R() * 2) | 0))) {
        const rr = (13 + R() * 6) * s * r, p = new Path2D(); p.ellipse(x + dx * 18 * s, y - rr * 0.7 + dy * 18 * s, rr * 1.15, rr * 0.85, (R() - 0.5) * 0.4, 0, TAU);
        D.blob(ctx, mx, p, m(P.stone[1], fill, 0.15), P.stone[2], k, rr);
      }
    },
    umbrella(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const h = 46 * s, r = 26 * s, col = [P.coral[2], P.sky[2], P.spark[2], P.grape[2]][(R() * 4) | 0], pole = new Path2D(); pole.rect(x - 1.6 * s, y - h, 3.2 * s, h + 2);
      D.blob(ctx, mx, pole, CREAM, P.stone[1], k, 3 * s);
      const c = new Path2D(); c.moveTo(x - r, y - h + 8 * s); c.quadraticCurveTo(x, y - h - r * 0.9, x + r, y - h + 8 * s); c.closePath(); D.blob(ctx, mx, c, col, K.adjust(col, -0.12), k, r);
      ctx.save(); ctx.clip(c); ctx.fillStyle = CREAM; for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(x, y - h - r); ctx.lineTo(x + i * r * 0.35, y - h + 10 * s); ctx.lineTo(x + i * r * 0.65, y - h + 10 * s); ctx.closePath(); ctx.fill(); } ctx.restore(); D.ink(ctx, mx, c, D.lwOf(r, k));
    },
    house(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a cottage: walls, a roof in a warm hue, a door and lit windows
      const w = (34 + R() * 14) * s, h = w * (0.7 + R() * 0.25), roof = [P.coral[2], P.sky[2], P.grape[2], P.peach[2]][(R() * 4) | 0];
      const wall = new Path2D(); wall.rect(x - w / 2, y - h, w, h + 2); D.blob(ctx, mx, wall, R() < 0.5 ? CREAM : P.peach[0], P.peach[1], k, w * 0.3);
      const rf = new Path2D(); rf.moveTo(x - w * 0.62, y - h + 2); rf.lineTo(x, y - h - w * 0.55); rf.lineTo(x + w * 0.62, y - h + 2); rf.closePath(); D.blob(ctx, mx, rf, roof, K.adjust(roof, -0.12), k, w * 0.4);
      const dr = new Path2D(); dr.rect(x - w * 0.1, y - h * 0.45, w * 0.2, h * 0.45 + 2); D.blob(ctx, mx, dr, P.cocoa[2], P.cocoa[3], k, 3 * s);
      for (const sx of [-1, 1]) { const wn = new Path2D(); wn.rect(x + sx * w * 0.3 - w * 0.09, y - h * 0.72, w * 0.18, w * 0.18); ctx.fillStyle = P.spark[1]; ctx.fill(wn); D.ink(ctx, mx, wn, D.lwOf(4 * s, k)); mx.fillStyle = 'rgba(255,255,255,.6)'; mx.fill(wn); }
      if (R() < 0.5) { const ch = new Path2D(); ch.rect(x + w * 0.22, y - h - w * 0.5, w * 0.12, w * 0.3); D.blob(ctx, mx, ch, P.stone[1], P.stone[2], k, 3 * s); }
    },
    fence(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const n = 4 + ((R() * 3) | 0), g = 12 * s, h = 18 * s, p = new Path2D();
      for (let i = 0; i < n; i++) { const px = x + (i - n / 2) * g; p.moveTo(px - 2.6 * s, y + 2); p.lineTo(px - 2.6 * s, y - h); p.lineTo(px, y - h - 4 * s); p.lineTo(px + 2.6 * s, y - h); p.lineTo(px + 2.6 * s, y + 2); p.closePath(); }
      p.rect(x - n / 2 * g - 2 * s, y - h * 0.75, (n - 1) * g + 4 * s, 3.5 * s);
      D.blob(ctx, mx, p, CREAM, P.cocoa[0], k, 4 * s);
    },
    lamp(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const h = 52 * s, p = new Path2D(); p.rect(x - 2 * s, y - h, 4 * s, h + 2); D.blob(ctx, mx, p, P.stone[2], P.stone[3], k, 3 * s);
      const g = new Path2D(); g.arc(x, y - h - 4 * s, 7 * s, 0, TAU); ctx.fillStyle = P.spark[1]; ctx.fill(g); D.ink(ctx, mx, g, D.lwOf(6 * s, k)); mx.fillStyle = 'rgba(255,255,255,.8)'; mx.fill(g);
    },
    tent(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const w = 40 * s, h = 34 * s, col = [P.coral[2], P.spark[2], P.sky[2]][(R() * 3) | 0], p = new Path2D(); p.moveTo(x - w / 2, y + 2); p.lineTo(x, y - h); p.lineTo(x + w / 2, y + 2); p.closePath();
      D.blob(ctx, mx, p, col, K.adjust(col, -0.14), k, w * 0.3); const d = new Path2D(); d.moveTo(x - w * 0.12, y + 2); d.lineTo(x, y - h * 0.5); d.lineTo(x + w * 0.12, y + 2); d.closePath(); ctx.fillStyle = INK; ctx.fill(d);
    },
    flags(ctx, mx, x, y, s, R, fill, shade, k, D) {   // two poles with a string of pennants
      const w = 70 * s, h = 46 * s, p = new Path2D(); for (const sx of [-1, 1]) p.rect(x + sx * w / 2 - 1.5 * s, y - h, 3 * s, h + 2); D.blob(ctx, mx, p, P.cocoa[2], P.cocoa[3], k, 3 * s);
      const st = new Path2D(); st.moveTo(x - w / 2, y - h); st.quadraticCurveTo(x, y - h + 16 * s, x + w / 2, y - h); D.ink(ctx, mx, st, D.lwOf(2 * s, k));
      for (let i = 1; i < 7; i++) { const t = i / 7, fx = x - w / 2 + w * t, fy = y - h + 16 * s * 2 * t * (1 - t), col = [P.coral[2], P.spark[2], P.sky[2], P.mint[2], P.grape[2]][i % 5], f = new Path2D(); f.moveTo(fx - 4 * s, fy); f.lineTo(fx + 4 * s, fy); f.lineTo(fx, fy + 10 * s); f.closePath(); ctx.fillStyle = col; ctx.fill(f); D.ink(ctx, mx, f, D.lwOf(2 * s, k) * 0.7); }
    },
    cone(ctx, mx, x, y, s, R, fill, shade, k, D) { const p = new Path2D(); p.moveTo(x - 7 * s, y + 2); p.lineTo(x - 2 * s, y - 18 * s); p.lineTo(x + 2 * s, y - 18 * s); p.lineTo(x + 7 * s, y + 2); p.closePath(); D.blob(ctx, mx, p, P.peach[2], P.coral[3], k, 6 * s); ctx.fillStyle = CREAM; ctx.fillRect(x - 4.4 * s, y - 9 * s, 8.8 * s, 3 * s); },
    tyres(ctx, mx, x, y, s, R, fill, shade, k, D) { for (let i = 0; i < 3; i++) { const p = new Path2D(); p.ellipse(x, y - 5 * s - i * 9 * s, 12 * s, 5 * s, 0, 0, TAU); D.blob(ctx, mx, p, i % 2 ? P.coral[2] : '#3A3933', INK, k, 8 * s); } },
    hut(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a striped beach hut on stilts
      const w = 30 * s, h = 34 * s, col = [P.sky[2], P.coral[2], P.mint[2]][(R() * 3) | 0], b = new Path2D(); b.rect(x - w / 2, y - h, w, h);
      ctx.save(); D.blob(ctx, mx, b, CREAM, P.cream[3], k, w * 0.3); ctx.clip(b); ctx.fillStyle = col; for (let i = 0; i < 4; i++) ctx.fillRect(x - w / 2 + i * w / 4, y - h, w / 8, h); ctx.restore(); D.ink(ctx, mx, b, D.lwOf(w * 0.3, k));
      const r = new Path2D(); r.moveTo(x - w * 0.62, y - h + 1); r.lineTo(x, y - h - w * 0.45); r.lineTo(x + w * 0.62, y - h + 1); r.closePath(); D.blob(ctx, mx, r, col, K.adjust(col, -0.14), k, w * 0.3);
    },
    crowd(ctx, mx, x, y, s, R, fill, shade, k, D) {   // round heads and shoulders behind a low barrier (racing, arenas)
      for (let i = 0; i < 6; i++) { const cx = x + (i - 2.5) * 13 * s, cy = y - 18 * s - (i % 2) * 4 * s, col = [P.coral[2], P.sky[2], P.spark[2], P.grape[2], P.mint[2]][((R() * 5) | 0)]; const b = new Path2D(); b.ellipse(cx, cy + 9 * s, 7 * s, 7 * s, 0, Math.PI, 0); b.closePath(); D.blob(ctx, mx, b, col, K.adjust(col, -0.12), k, 6 * s); const h = new Path2D(); h.arc(cx, cy - 1 * s, 5 * s, 0, TAU); D.blob(ctx, mx, h, ['#FCE1CB', '#E8B48A', '#B97E4E', '#6E4529'][(R() * 4) | 0], '#96603A', k, 4 * s); }
      const bar = new Path2D(); bar.rect(x - 42 * s, y - 10 * s, 84 * s, 12 * s); D.blob(ctx, mx, bar, CREAM, P.stone[1], k, 6 * s); ctx.fillStyle = P.coral[2]; for (let i = 0; i < 6; i++) ctx.fillRect(x - 40 * s + i * 14 * s, y - 9 * s, 7 * s, 10 * s);
    },
  };
  const BI = (life, fg, bands) => ({ life, fg, bands });
  const R0 = {
    meadow: BI('bird,butterfly', 'fern', ['', 'tree:70c,pine:150,house:600', 'tree:150c,house:520,fence:380,bush:110,tuft:45', 'tree:230c,rocks:420,lamp:700,bush:150,flower:34,tuft:26']),
    forest: BI('bird,leaf', 'fern', ['pine:30', 'pine:34', 'pine:60c,tree:180c,tent:700,bush:120', 'pine:170c,mush:80,rocks:400,tuft:30']),
    beach: BI('gull', 'frond', ['', 'wave:40', 'palm:110c,hut:420,umbrella:120,flags:600,shell:60', 'palm:240c,umbrella:200,shell:40,tuft:70']),
    snow: BI('snow', 'snowbush', ['cap', 'snowpine:50c', 'snowpine:120c,house:600,rocks:300', 'snowpine:220c,rocks:380,lamp:700,tuft:90']),
    desert: BI('bird', 'agave', ['', 'cactus:160c', 'cactus:150c,tent:600,rocks:200', 'cactus:220c,rocks:180,tuft:60']),
    candy: BI('butterfly', 'lollyfg', ['', 'lolly:70c', 'lolly:120c,flags:500,drops:60', 'lolly:200c,drops:40']),
    jungle: BI('parrot:bird,butterfly', 'frond', ['canopy', 'tree:70c,canopy', 'palm:90c,tree:130c,bush:90,fern:60', 'palm:170c,tree:200c,fern:38,rocks:420,tuft:30']),
    reef: BI('fish', 'rocksfg', null), moon: BI('', 'rocksfg', [null, null, 'crater', 'crater,rocks:300']),
    city: BI('bird', 'fern', [null, null, null, 'tree:220c,lamp:260,bush:120,fence:500']),
    autumn: BI('leaf,bird', 'fern', ['', 'canopy', 'tree:140c,house:600,bush:110', 'tree:220c,fence:450,leaves:60,tuft:40']),
  };
  Object.assign(RC, R0); K.dress({ decos, recipes: R0 });
  // Layout checks while a game runs (each a one-time [oomba] warning that the Builder's playtest passes on): two
  // characters on top of each other for over a second, and a big prop behind the title's Play button.
  K.kit.layoutCheck = (g, dt) => {
    const w = g.world, S = g.stage, kit = g.kit; if (!w || !S.fit || !S.view.vw) return;
    g.lc = (g.lc || 0) + dt; if (g.lc < 0.5) return; g.lc = 0;
    const said = g.lcSaid || (g.lcSaid = {}), box = e => { const p = S.camera.toScreen({ x: e.x, y: e.y - e.size * 0.5 }), k = S.fit.k * S.camera.zoom, h = e.size * k, x = S.fit.offX + p.x * S.fit.k, y = S.fit.offY + p.y * S.fit.k; return { l: x - h * 0.32, r: x + h * 0.32, t: y - h * 0.5, b: y + h * 0.5 }; };
    if (g.state === 'play' && !said.overlap) {
      const cast = w.ents.filter(e => e.cast && !e.dead && !e.taken);
      let hit = null; for (let i = 0; i < cast.length && !hit; i++) for (let j = i + 1; j < cast.length; j++) { const a = cast[i], b = cast[j]; if (Math.abs(a.x - b.x) < (a.size + b.size) * 0.22 && Math.abs(a.y - b.y) < (a.size + b.size) * 0.25) { hit = [a, b]; break; } }
      g.lcOver = hit ? (g.lcOver || 0) + 1 : 0;
      if (g.lcOver >= 3) { said.overlap = true; kit.warn(`two characters stand on top of each other (${hit[0].kindName || 'one'} and ${hit[1].kindName || 'another'}) for over a second: give each its own spot or lane, at least one character width apart (racers: put them in rows, or one ahead of the other)`); }
    }
    if (g.state === 'title' && !said.title && g.titlePan > 1) {
      const play = kit.doc.querySelector('.ok-title-screen .ok-big'); if (!play) return;
      const r = play.getBoundingClientRect(), pad = 18;
      const bad = w.ents.find(e => e.opts && !e.dead && e !== w.hero && e.size >= w.cell * 0.9 && (b => b.r > r.left - pad && b.l < r.right + pad && b.b > r.top - pad && b.t < r.bottom + pad)(box(e)));
      if (bad) { said.title = true; kit.warn(`on the title screen "${bad.kindName || bad.kind}" sits right behind the Play button: keep big props (planets, signs, platforms) out of the middle of the screen, or place them low or at the sides`); }
    }
  };
  // The cast never starts cut off by the level's edge, and two characters never start on top of each other: each is
  // moved just enough (the hero stays put). Runs after the level is built and again after setup().
  K.kit.spaceCast = w => {
    const L = w.level, cast = w.ents.filter(e => e.cast && !e.dead);
    for (const e of cast) { if (e === w.hero) continue; const m = e.size * 0.55; e.x = Math.max(m, Math.min(L.w - m, e.x)); }
    for (let i = 0; i < cast.length; i++) for (let j = 0; j < cast.length; j++) {
      const a = cast[i], b = cast[j]; if (a === b || b === w.hero || Math.abs(a.y - b.y) > (a.size + b.size) * 0.3) continue;
      const need = (a.size + b.size) * 0.42, dx = b.x - a.x; if (Math.abs(dx) >= need) continue;
      let nx = a.x + (dx >= 0 ? need : -need); if (nx < b.size * 0.55 || nx > L.w - b.size * 0.55) nx = a.x + (dx >= 0 ? -need : need);
      b.x = nx; if (b.groundY != null) { const gy = w._surface(b.x, b.y - 2); if (gy != null) b.groundY = gy; }
    }
  };
  // ---- results: confetti behind the win card (the core calls kit.celebrate(modalRoot) when it is defined) ----
  const kit = K.kit, doc = kit.doc, st = doc.createElement('style');
  st.textContent = `.ok-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.ok-confetti i{position:absolute;top:-24px;width:10px;height:16px;border-radius:3px;border:1.5px solid ${INK};animation:ok-fall var(--d) var(--l) cubic-bezier(.3,.6,.6,1) both}
@keyframes ok-fall{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}100%{transform:translate(var(--x),calc(100vh + 40px)) rotate(var(--r));opacity:0}}
.ok-rm .ok-confetti{display:none}`;
  (doc.head || doc.documentElement).appendChild(st);
  kit.celebrate = (root, n = 36) => {
    const box = doc.createElement('div'); box.className = 'ok-confetti'; box.setAttribute('aria-hidden', 'true');
    const cols = [P.spark[2], P.coral[2], P.sky[2], P.mint[2], P.grape[1]];
    for (let i = 0; i < n; i++) {
      const b = doc.createElement('i'), r = ((i * 2654435761) >>> 0) / 4294967296, q = ((i * 40503 + 7) % 97) / 97;
      b.style.cssText = `left:${(i / n * 100 + r * 6).toFixed(1)}%;background:${cols[i % 5]};--d:${(2.2 + q * 1.8).toFixed(2)}s;--l:${(r * 0.9).toFixed(2)}s;--x:${((q - 0.5) * 120) | 0}px;--r:${(360 + r * 540) | 0}deg${i % 3 ? '' : ';width:8px;height:8px;border-radius:50%'}`;
      box.appendChild(b);
    }
    root.insertBefore(box, root.firstChild);
    return box;
  };

  // ---- themes: Oomba.game({ theme: 'beach' }) picks a whole look at once (the core calls kit.useTheme(spec)) ----
  // A theme bundles a biome, the time of day, an accent hue, the ambient life and framing (the biome's recipe), a prop
  // set (look.props: the props that fit, for levels and spawns) and a music mood (look.music; look.bed is the kit's
  // nearest bed for Oomba.music). Some biomes come from other packs (look.packs); without them the theme shows `alt`.
  const HUES = ['mint', 'coral', 'sky', 'grape', 'peach', 'cocoa', 'stone', 'snow'], TITLE = { mint: 'mint', sky: 'sky', grape: 'sky', coral: 'coral' };
  const hue = (h, what) => {
    if (h == null) return null; h = String(h).toLowerCase();
    if (h === 'spark') { kit.warn(`theme ${what} 'spark': spark yellow is kept for rewards, so the theme uses 'peach'`); return 'peach'; }
    if (HUES.includes(h)) return h; kit.warn(`theme ${what} '${h}' is not a colour name (${HUES.join(' ')})`); return null;
  };
  // recolouring keeps each colour's luminance (WCAG), so every contrast in the scene stays what the theme was drawn with
  const lum = h => { const n = parseInt(h.slice(1), 16), f = c => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); };
  const recolour = (c, h) => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
    const goal = lum(c), b = m(c, P[h][2], 0.7); let out = c;
    for (const cs of [1, 0.7, 0.45, 0.25, 0]) {   // very light or dark colours lose some chroma to stay in gamut
      let lo = -0.7, hi = 0.7;
      for (let i = 0; i < 18; i++) { const d = (lo + hi) / 2; if (lum(K.adjust(b, d, cs)) < goal) lo = d; else hi = d; }
      out = K.adjust(b, (lo + hi) / 2, cs); if (Math.abs(lum(out) - goal) <= goal * 0.015 + 0.002) break;
    }
    return out;
  };
  kit.recolour = recolour;
  kit.theme.names = Object.keys(THEMES);
  kit.useTheme = sp => {
    const o = typeof sp.look === 'object' ? sp.look : { name: sp.look }, raw = String(o.name || '').toLowerCase().replace(/[^a-z]/g, '');
    let name = ALIAS[raw] || raw;
    if (!THEMES[name]) { const near = kit.theme.names.find(n => n.slice(0, 3) === name.slice(0, 3)) || 'meadow'; kit.warn(`unknown theme "${o.name}": using '${near}' (themes: ${kit.theme.names.join(' ')})`); name = near; }
    const th = THEMES[name], miss = th.packs.filter(p => !kit.packs[p]);
    if (miss.length) kit.warn(`theme '${name}' needs the ${miss.join(' and ')} pack: add its pinned tag right after the kit tag (until then it shows ${th.alt})`);
    let biome = K.biomes[th.biome] && !miss.length ? th.biome : th.alt;
    const acc = hue(o.accent, 'accent') || th.accent, pal = o.palette || {}, hills = hue(pal.hills, 'hills'), ground = hue(pal.ground, 'ground'), sky = hue(pal.sky, 'sky');
    if (hills || ground || sky) {   // a recoloured copy of the biome (same art, same recipe)
      const id = [biome, hills, ground, sky].join('~');
      if (!K.biomes[id]) {
        const B = K.biomes[biome], st = B.sky || ['#4FB4F7', '#BFE8FF', 0.5];
        K.biome(id, Object.assign({}, B, {
          sky: sky ? [recolour(st[0], sky), recolour(st[1], sky), Math.max(0.6, st[2])] : B.sky,
          bands: B.bands.map(b => (hills ? [recolour(b[0], hills), recolour(b[1], hills), b[2], b[3]] : b)),
          ground: B.ground.map((c, i) => (ground && i < 2 ? recolour(c, ground) : c)),
        }));
        K.dress({ recipes: { [id]: K.recipes[biome] } });
      }
      biome = id;
    }
    kit.theme.look = { name, biome, accent: acc, tod: th.tod, music: th.music, bed: /calm|dreamy|cosmic|spooky/.test(th.music) ? 'calm' : 'meadow', style: th.style || null, packs: ['dress'].concat(th.packs),
      get props() { const d = kit.stage && kit.stage.atlas.defs; return d ? th.props.filter(n => d.get(n)) : th.props.slice(); } };
    if (sp.biome == null) sp.biome = biome;
    if (!sp.style && th.style) sp.style = th.style;
    if (!sp.titleHue && TITLE[acc]) sp.titleHue = TITLE[acc];
  };
  // the theme's time of day (a dark site theme is still night); dawn after a night goes back to it, not to noon
  const att = kit.attachStage;
  kit.attachStage = s => { att(s); const L = kit.theme.look; if (L && L.tod) { if (!kit.theme.dark && s.tod < L.tod) s.tod = L.tod; s.toNight = (on, ms) => s.setTimeOfDay(on ? 1 : L.tod, ms); } };
}
