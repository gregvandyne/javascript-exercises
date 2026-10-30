// Art pack "art-biomes" (public/vendor/oomba-kit/<version>/packs/art-biomes.js): five more worlds for
// Oomba.game({biome}) and Oomba.stage({biome}), so the kit has 11: jungle, reef (under the sea), city, moon and autumn;
// and two space props (planet, asteroid).
// Each is a sky tint, four parallax bands (a profile and a decoration, baked once per view size like the core's) and
// auto-tiled ground colours. Day and night come from the same lighting as the core biomes.
export const PACK = { name: 'art-biomes' };
export function define(K) {
  const P = K.P, m = K.mix, TAU = Math.PI * 2, I = K.ink;
  // space props: a ringed planet (also the moon biome's sky) and an asteroid
  K.prop('planet', 'space', { w: 120, h: 100, ax: 0.5, ay: 0.5, draw(ctx, k) {
    const body = I.ellipse(60, 50, 34, 34);
    const back = new Path2D(); back.ellipse(60, 54, 56, 13, -0.25, Math.PI, TAU);
    ctx.lineCap = 'round'; ctx.strokeStyle = K.INK; ctx.lineWidth = I.lines(k).w * 2.6; ctx.stroke(back); ctx.strokeStyle = P.peach[1]; ctx.lineWidth = I.lines(k).w * 1.2; ctx.stroke(back);
    I.sticker(ctx, k, body, { fill: P.grape[1], shade: P.grape[2], shadeOff: 6, gloss: [48, 36, 9, 5, -0.6] });
    for (const [x, y, r] of [[70, 40, 6], [50, 62, 4.5]]) I.sticker(ctx, k, I.ellipse(x, y, r, r * 0.8), { fill: P.grape[2], rim: false, line: 0.5 });
    const front = new Path2D(); front.ellipse(60, 54, 56, 13, -0.25, 0, Math.PI);
    ctx.strokeStyle = K.INK; ctx.lineWidth = I.lines(k).w * 2.6; ctx.stroke(front); ctx.strokeStyle = P.peach[1]; ctx.lineWidth = I.lines(k).w * 1.2; ctx.stroke(front);
  } });
  K.prop('asteroid', 'space', { w: 64, h: 56, ax: 0.5, ay: 0.5, draw(ctx, k) {
    const p = new Path2D(); p.moveTo(14, 18); p.quadraticCurveTo(26, 4, 42, 8); p.quadraticCurveTo(60, 14, 58, 32); p.quadraticCurveTo(56, 50, 36, 50); p.quadraticCurveTo(10, 52, 8, 34); p.quadraticCurveTo(6, 24, 14, 18); p.closePath();
    I.sticker(ctx, k, p, { fill: P.stone[1], shade: P.stone[2], shadeOff: 5, gloss: [24, 16, 7, 3, -0.5] });
    for (const [x, y, r] of [[40, 24, 6], [24, 36, 4.5], [44, 40, 3.5]]) I.sticker(ctx, k, I.ellipse(x, y, r, r * 0.75), { fill: P.stone[2], rim: false, line: 0.5 });
  } });
  // a stepped city skyline (tiles horizontally: buildings restart at 0)
  const skyline = ({ vh, amp, W, R }) => {
    const b = []; for (let x = 0; x < W;) { const w = 36 + R() * 64; b.push([x, x + w, vh * amp * (0.4 + R() * 1.5)]); x += w + (R() < 0.3 ? 8 + R() * 20 : 0); }
    return x => { const s = b.find(q => x >= q[0] && x < q[1]); return vh * amp * 2.3 - (s ? s[2] : 0); };
  };
  const decos = {
    canopy(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a round jungle / autumn tree
      const h = (20 + R() * 12) * s, r = (9 + R() * 5) * s, trunk = new Path2D(); trunk.rect(x - 3 * s, y - h + r, 6 * s, h - r + 4);
      D.blob(ctx, mx, trunk, P.cocoa[2], P.cocoa[3], k, 4 * s);
      const c = new Path2D(); c.arc(x - r * 0.6, y - h + r * 0.3, r * 0.75, 0, TAU); c.arc(x + r * 0.55, y - h + r * 0.2, r * 0.7, 0, TAU); c.arc(x, y - h - r * 0.25, r * 0.85, 0, TAU);
      D.blob(ctx, mx, c, m(fill, '#FFFFFF', 0.1), shade, k, r);
    },
    fern(ctx, mx, x, y, s, R, fill, shade, k, D) { for (const a of [-2.4, -1.9, -1.2, -0.7]) { const l = new Path2D(); l.moveTo(x, y + 2); l.quadraticCurveTo(x + Math.cos(a) * 14 * s, y + Math.sin(a) * 22 * s, x + Math.cos(a) * 26 * s, y + Math.sin(a) * 14 * s); ctx.strokeStyle = D.INK; ctx.lineWidth = 6 * s; ctx.lineCap = 'round'; ctx.stroke(l); ctx.strokeStyle = m(fill, P.mint[2], 0.5); ctx.lineWidth = 3.5 * s; ctx.stroke(l); } },
    coral(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const col = [P.coral[1], P.grape[1], P.peach[1]][(R() * 3) | 0], p = new Path2D();
      for (const [dx, h] of [[-8, 24], [0, 34], [9, 20]]) { p.moveTo(x + dx * s - 3.5 * s, y + 2); p.lineTo(x + dx * s - 3.5 * s, y - h * s); p.arc(x + dx * s, y - h * s, 3.5 * s, Math.PI, 0); p.lineTo(x + dx * s + 3.5 * s, y + 2); p.closePath(); }
      D.blob(ctx, mx, p, col, K.adjust(col, -0.12), k, 6 * s);
    },
    seaweed(ctx, mx, x, y, s, R) { const h = (30 + R() * 30) * s, l = new Path2D(); l.moveTo(x, y + 2); for (let i = 1; i <= 4; i++) l.quadraticCurveTo(x + (i % 2 ? 8 : -8) * s, y - h * (i - 0.5) / 4, x, y - h * i / 4); ctx.strokeStyle = K.INK; ctx.lineWidth = 7 * s; ctx.lineCap = 'round'; ctx.stroke(l); ctx.strokeStyle = P.mint[2]; ctx.lineWidth = 4 * s; ctx.stroke(l); },
    windows(ctx, mx, x, y, s, R, fill) { ctx.fillStyle = m(fill, '#FFFFFF', 0.45); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if (R() < 0.75) { ctx.beginPath(); ctx.rect(x - 9 * s + j * 12 * s, y + 10 * s + i * 13 * s, 7 * s, 8 * s); ctx.fill(); } },
    crater(ctx, mx, x, y, s, R, fill, shade, k, D) { const r = (8 + R() * 10) * s, p = new Path2D(); p.ellipse(x, y + 8 * s, r, r * 0.35, 0, 0, TAU); D.blob(ctx, mx, p, shade, K.adjust(shade, -0.08), k, r); },
    planet(ctx, mx, x, y, s, R, fill, shade, k, D) { if (R() < 0.75) return; const r = 16 * s, p = new Path2D(); p.arc(x, y - 6 * s, r, Math.PI, 0); p.closePath(); D.blob(ctx, mx, p, P.peach[1], P.peach[2], k, r); const ring = new Path2D(); ring.ellipse(x, y - 8 * s, r * 1.7, r * 0.45, -0.3, 0, TAU); D.ink(ctx, mx, ring, D.lwOf(r, k)); },
    leaves(ctx, mx, x, y, s, R, fill, shade, k, D) { for (let i = 0; i < 3; i++) { const c = [P.coral[2], P.peach[2], P.cocoa[1]][(R() * 3) | 0], p = new Path2D(); p.ellipse(x + (R() - 0.5) * 20 * s, y - 2, 5 * s, 2.8 * s, R() * 3, 0, TAU); D.blob(ctx, mx, p, c, K.adjust(c, -0.1), k, 4 * s); } },
  };
  K.biome('jungle', { sky: ['#45B4E0', '#C2EFD6', 0.6], bands: [
    [m(P.mint[2], P.sky[2], 0.5), m(P.mint[3], P.sky[2], 0.45), 'hills', 'canopy'],
    [m(P.mint[2], P.mint[3], 0.3), m(P.mint[3], K.INK, 0.1), 'hills', 'canopy'],
    [m(P.mint[3], P.mint[2], 0.5), m(P.mint[3], K.INK, 0.18), 'hills', 'canopy'],
    [m(P.mint[3], P.cocoa[2], 0.15), m(P.mint[3], K.INK, 0.25), 'hills', 'fern']],
  ground: [m(P.mint[3], P.mint[2], 0.3), m(P.mint[3], K.INK, 0.12), P.cocoa[3], P.cocoa[2]] }, { decos });
  // under the sea, day and night: deep water above, rising bubbles (no sun, no clouds), blue-green rocks with seaweed
  // and coral all the way to the front, sand only underfoot
  K.biome('reef', { sky: ['#1E6DB0', '#7CCDE8', 1], skyHold: true, clouds: false, sun: false, bubbles: true, bands: [
    [m(P.sky[2], P.sky[3], 0.5), m(P.sky[3], K.INK, 0.15), 'hills', 'seaweed'],
    [m(P.sky[2], P.mint[2], 0.35), m(P.sky[3], P.mint[3], 0.4), 'hills', 'coral'],
    [m(P.sky[2], P.mint[3], 0.45), m(P.sky[3], P.mint[3], 0.5), 'hills', 'seaweed'],
    [m(P.mint[3], P.sky[3], 0.4), m(P.mint[3], K.INK, 0.2), 'dunes', 'coral']],
  ground: [P.peach[0], P.peach[1], m(P.peach[1], P.cocoa[1], 0.4), P.peach[2]] }, { decos });
  K.biome('city', { sky: ['#52B0F2', '#FFE4C8', 0.6], bands: [
    [m(P.sky[1], P.stone[1], 0.5), m(P.sky[2], P.stone[2], 0.5), 'skyline', 'windows'],
    [m(P.sky[1], P.peach[1], 0.35), m(P.sky[2], P.peach[2], 0.35), 'skyline', 'windows'],
    [m(P.stone[1], P.peach[1], 0.3), m(P.stone[2], P.peach[2], 0.3), 'skyline', 'windows'],
    [m(P.mint[2], P.mint[1], 0.3), P.mint[3], 'hills', 'bush']],
  ground: [P.stone[1], P.stone[2], m(P.stone[2], P.cocoa[2], 0.4), P.stone[0]] }, { decos, profiles: { skyline } });
  // space, day and night: a deep sky full of stars and a ringed planet (no sun, no clouds), grey craters
  K.biome('moon', { sky: ['#12112E', '#3A2F6E', 1], skyHold: true, clouds: false, sun: 'planet', stars: 1, bands: [
    [m(P.grape[2], P.stone[2], 0.6), m(P.grape[3], P.stone[3], 0.5), 'peaks', 'planet'],
    [m(P.stone[1], P.grape[1], 0.3), m(P.stone[2], P.grape[2], 0.3), 'hills', 'crater'],
    [P.stone[1], P.stone[2], 'hills', 'crater'],
    [m(P.stone[0], P.stone[1], 0.5), P.stone[1], 'hills', 'crater']],
  ground: [P.stone[1], P.stone[2], m(P.stone[2], P.grape[3], 0.35), P.stone[0]] }, { decos });
  K.biome('autumn', { sky: ['#F59A5C', '#FFDDA8', 0.6], bands: [
    [m(P.peach[1], P.sky[1], 0.5), m(P.peach[2], P.sky[2], 0.4), 'hills', ''],
    [m(P.peach[2], P.coral[1], 0.4), m(P.peach[3], P.coral[2], 0.35), 'hills', 'canopy'],
    [m(P.mint[2], P.peach[2], 0.5), m(P.mint[3], P.peach[3], 0.5), 'hills', 'canopy'],
    [m(P.mint[2], P.peach[1], 0.45), m(P.mint[3], P.peach[2], 0.5), 'hills', 'leaves']],
  ground: [m(P.mint[2], P.peach[2], 0.5), m(P.mint[3], P.peach[3], 0.5), P.cocoa[2], P.cocoa[1]] }, { decos });
}
