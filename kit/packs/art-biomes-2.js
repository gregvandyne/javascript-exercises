// Art pack "art-biomes-2" (public/vendor/oomba-kit/<version>/packs/art-biomes-2.js, kit 1.1.0): four worlds the themes
// need that no other pack has: castle (a hill castle with towers and pennants, tourney tents), stadium (stands full of a
// cheering crowd, floodlights, a striped pitch), space (an alien planet: moon-base domes, dishes, glowing crystals, a
// ringed world in the sky) and spooky (a friendly haunted hill at dusk: a crooked manor with warm windows, bare trees,
// smiling pumpkins). Each comes with its dressing recipe (ambient life and foreground framing for the dress pack).
// The accent of the running theme (Oomba.theme.look.accent) colours the castle roofs, pennants and stadium boards.
export const PACK = { name: 'art-biomes-2' };
export function define(K) {
  const P = K.P, m = K.mix, TAU = Math.PI * 2, I = K.ink, INK = K.INK, CREAM = K.CREAM, kit = K.kit;
  const acc = () => { const L = kit.theme.look; return P[(L && L.accent) || 'coral'][2]; };
  const glowFill = (ctx, mx, p, c, a = 0.8) => { ctx.fillStyle = c; ctx.fill(p); mx.fillStyle = `rgba(255,255,255,${a})`; mx.fill(p); };
  const poly = (pts, x, y, s) => { const p = new Path2D(); pts.forEach(([a, b], i) => (i ? p.lineTo(x + a * s, y + b * s) : p.moveTo(x + a * s, y + b * s))); p.closePath(); return p; };
  const pennant = (ctx, mx, x, y, h, s, c, D, k) => {   // a pole standing at (x, y) with a flag at its top
    const pole = new Path2D(); pole.moveTo(x, y); pole.lineTo(x, y - h); D.ink(ctx, mx, pole, D.lwOf(2 * s, k) * 1.4);
    D.blob(ctx, mx, poly([[0, 0], [16, 4], [0, 9]], x, y - h, s), c, K.adjust(c, -0.12), k, 5 * s);
  };
  // a ringed world that hangs in the space sky (the biome's sun)
  K.art('ringworld', { w: 120, h: 100, ax: 0.5, ay: 0.5, draw(ctx, k) {
    const ring = (a, b) => { const r = new Path2D(); r.ellipse(60, 54, 56, 13, -0.3, a, b); ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w * 2.6; ctx.stroke(r); ctx.strokeStyle = P.sky[1]; ctx.lineWidth = I.lines(k).w * 1.2; ctx.stroke(r); };
    ring(Math.PI, TAU);
    I.sticker(ctx, k, I.ellipse(60, 50, 33, 33), { fill: P.peach[1], shade: P.coral[2], shadeOff: 7, gloss: [48, 36, 9, 5, -0.6] });
    for (const [x, y, w] of [[50, 42, 14], [70, 60, 10]]) I.sticker(ctx, k, I.rrect(x - w, y - 2.5, 2 * w, 5, 2.5), { fill: P.coral[1], rim: false, line: 0.5 });
    ring(0, Math.PI);
  } });
  const D = {
    keep(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a castle: a crenellated wall with a gate, a tall keep, two towers
      s *= 1.7;   // a landmark: bigger than the band's other dressing
      const st = P.stone[0], sh = P.stone[1], roof = acc(), w = 70 * s, h = 40 * s, c = 7 * s, q = 2 * w / 9;
      const tower = (cx, r, th) => {
        const b = new Path2D(); b.rect(cx - r, y - th, 2 * r, th + 2); D.blob(ctx, mx, b, st, sh, k, r);
        const rf = poly([[-1.3, 1], [0, -2.2], [1.3, 1]], cx, y - th, r); D.blob(ctx, mx, rf, roof, K.adjust(roof, -0.12), k, r);
        pennant(ctx, mx, cx, y - th - r * 2.2, 14 * s, s, CREAM, D, k);
        const win = new Path2D(); win.rect(cx - r * 0.25, y - th * 0.72, r * 0.5, r * 0.75); glowFill(ctx, mx, win, P.spark[1]); D.ink(ctx, mx, win, D.lwOf(3 * s, k));
      };
      tower(x, 17 * s, h + 52 * s);
      const wall = new Path2D(); wall.moveTo(x - w, y + 2);
      for (let j = 0; j < 9; j++) { const t = j % 2 ? h : h + c; wall.lineTo(x - w + j * q, y - t); wall.lineTo(x - w + (j + 1) * q, y - t); }
      wall.lineTo(x + w, y + 2); wall.closePath(); D.blob(ctx, mx, wall, st, sh, k, w * 0.3);
      ctx.strokeStyle = m(sh, st, 0.4); ctx.lineWidth = 1.4 * s;   // a few bricks
      for (let i = 0; i < 6; i++) { const bx = x - w * 0.8 + R() * w * 1.6, by = y - h * (0.2 + R() * 0.6); ctx.strokeRect(bx, by, 9 * s, 5 * s); }
      const gate = new Path2D(); gate.moveTo(x - 11 * s, y + 2); gate.lineTo(x - 11 * s, y - 16 * s); gate.arc(x, y - 16 * s, 11 * s, Math.PI, 0); gate.lineTo(x + 11 * s, y + 2); gate.closePath();
      D.blob(ctx, mx, gate, P.cocoa[2], P.cocoa[3], k, 8 * s);
      for (const dx of [-5, 0, 5]) { const l = new Path2D(); l.moveTo(x + dx * s, y); l.lineTo(x + dx * s, y - 24 * s); D.ink(ctx, mx, l, D.lwOf(2 * s, k)); }
      tower(x - w, 15 * s, h + 30 * s); tower(x + w, 15 * s, h + 30 * s);
    },
    pavilion(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a striped tourney tent
      const w = 26 * s, h = 30 * s, c = acc(), body = new Path2D(); body.moveTo(x - w, y + 2); body.lineTo(x - w * 0.8, y - h); body.lineTo(x + w * 0.8, y - h); body.lineTo(x + w, y + 2); body.closePath();
      D.blob(ctx, mx, body, CREAM, P.cream[3], k, w * 0.3);
      ctx.save(); ctx.clip(body); ctx.fillStyle = c; for (let i = -2; i < 3; i += 2) ctx.fillRect(x + i * w * 0.25 - w * 0.125, y - h, w * 0.25, h + 4); ctx.restore(); D.ink(ctx, mx, body, D.lwOf(w * 0.3, k));
      D.blob(ctx, mx, poly([[-1.15, 0], [0, -0.75], [1.15, 0]], x, y - h, w), c, K.adjust(c, -0.12), k, w * 0.4);
      pennant(ctx, mx, x, y - h - w * 0.75, 12 * s, s, P.sky[2], D, k);
    },
    banner(ctx, mx, x, y, s, R, fill, shade, k, D) { pennant(ctx, mx, x, y + 2, (34 + R() * 14) * s, s * 1.3, R() < 0.6 ? acc() : P.sky[2], D, k); },
    // ---- stadium ----
    seats(ctx, mx, x, y, s, R) {   // rows of a cheering crowd (heads in team colours), an aisle now and then
      const cols = [P.coral[2], P.sky[2], CREAM, P.grape[1], P.mint[2], acc()], r = 3.3 * s;
      ctx.fillStyle = 'rgba(20,20,20,.16)'; for (let row = 0; row < 16; row++) ctx.fillRect(x - 26 * s, y + 13.5 * s + row * 9 * s, 52 * s, 1.6 * s);
      for (let row = 0; row < 16; row++) for (let i = 0; i < 6; i++) {
        ctx.fillStyle = cols[(R() * cols.length) | 0]; ctx.beginPath(); ctx.arc(x + (i - 2.5) * 8.6 * s + (row % 2) * 4 * s, y + 10 * s + row * 9 * s, r, 0, TAU); ctx.fill();
      }
    },
    roof(ctx, mx, x, y, s, R, fill, shade, k, D) { const p = new Path2D(); p.rect(x - 34 * s, y - 12 * s, 68 * s, 13 * s); ctx.fillStyle = '#3A4560'; ctx.fill(p); ctx.fillStyle = 'rgba(255,253,242,.25)'; ctx.fillRect(x - 34 * s, y - 12 * s, 68 * s, 3 * s); },
    flood(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a floodlight mast: lamps that glow at night
      const h = 90 * s, pole = new Path2D(); pole.rect(x - 2.4 * s, y - h, 4.8 * s, h + 10 * s); D.blob(ctx, mx, pole, P.stone[1], P.stone[2], k, 3 * s);
      const head = I.rrect(x - 16 * s, y - h - 16 * s, 32 * s, 18 * s, 3 * s); D.blob(ctx, mx, head, '#3A4560', INK, k, 6 * s);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const l = I.ellipse(x - 9.5 * s + i * 9.5 * s, y - h - 11.5 * s + j * 8 * s, 3.2 * s, 3 * s); glowFill(ctx, mx, l, P.snow[0], 0.95); }
    },
    stripe(ctx, mx, x, y, s, R, fill) { ctx.fillStyle = m(fill, '#FFFFFF', 0.12); ctx.fillRect(x, y + 6, 34 * s, 400); },
    board(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a plain pitch-side board in the team colour (never words or logos)
      const b = I.rrect(x - 30 * s, y - 13 * s, 60 * s, 13 * s, 2 * s), c = R() < 0.5 ? acc() : P.sky[2]; D.blob(ctx, mx, b, c, K.adjust(c, -0.12), k, 5 * s);
      ctx.fillStyle = CREAM; for (let i = 0; i < 3; i++) ctx.fillRect(x - 22 * s + i * 16 * s, y - 8.5 * s, 10 * s, 4 * s);
    },
    goalnet(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const w = 34 * s, h = 26 * s, net = new Path2D(); ctx.strokeStyle = 'rgba(255,253,242,.7)'; ctx.lineWidth = 1.2 * s;
      for (let i = 1; i < 6; i++) { net.moveTo(x - w + i * w / 3, y); net.lineTo(x - w + i * w / 3 - 4 * s, y - h); } for (let j = 1; j < 4; j++) { net.moveTo(x - w, y - j * h / 4); net.lineTo(x + w, y - j * h / 4); } ctx.stroke(net);
      const f = new Path2D(); f.moveTo(x - w, y + 2); f.lineTo(x - w, y - h); f.lineTo(x + w, y - h); f.lineTo(x + w, y + 2);
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 6 * s; ctx.stroke(f); ctx.strokeStyle = CREAM; ctx.lineWidth = 3.2 * s; ctx.stroke(f);
    },
    // ---- space ----
    dome(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a moon-base dome with lit windows and an aerial
      s *= 1.4;   // a landmark: bigger than the band's other dressing
      const r = (24 + R() * 10) * s, d = new Path2D(); d.arc(x, y + 2, r, Math.PI, 0); d.closePath();
      D.blob(ctx, mx, d, P.sky[0], P.sky[1], k, r);
      for (let i = 0; i < 3; i++) { const wn = I.rrect(x - r * 0.55 + i * r * 0.4, y - r * 0.45, r * 0.24, r * 0.2, 2 * s); glowFill(ctx, mx, wn, P.spark[1]); D.ink(ctx, mx, wn, D.lwOf(2 * s, k)); }
      const base = I.rrect(x - r * 1.08, y - 4 * s, r * 2.16, 8 * s, 3 * s); D.blob(ctx, mx, base, P.stone[1], P.stone[2], k, 4 * s);
      const a = new Path2D(); a.moveTo(x, y - r); a.lineTo(x, y - r - 14 * s); D.ink(ctx, mx, a, D.lwOf(2 * s, k)); glowFill(ctx, mx, I.ellipse(x, y - r - 15 * s, 3 * s, 3 * s), P.coral[1], 0.9);
    },
    dish(ctx, mx, x, y, s, R, fill, shade, k, D) {
      const pole = new Path2D(); pole.rect(x - 2 * s, y - 26 * s, 4 * s, 28 * s); D.blob(ctx, mx, pole, P.stone[1], P.stone[2], k, 3 * s);
      const d = new Path2D(); d.ellipse(x, y - 34 * s, 17 * s, 9 * s, -0.5, 0, Math.PI); d.closePath(); D.blob(ctx, mx, d, CREAM, P.snow[2], k, 10 * s);
    },
    crystal(ctx, mx, x, y, s, R, fill, shade, k, D) {   // glowing crystal shards
      const c = [P.grape[1], P.sky[1], P.mint[1], P.coral[1]][(R() * 4) | 0];
      for (const [dx, h, a] of [[-7, 22, -0.25], [0, 34, 0], [8, 18, 0.3]]) {
        const p = new Path2D(), hx = x + dx * s, hh = h * s * (0.8 + R() * 0.4); p.moveTo(hx - 5 * s, y + 2); p.lineTo(hx - 5 * s + Math.sin(a) * hh * 0.6, y - hh * 0.75); p.lineTo(hx + Math.sin(a) * hh, y - hh); p.lineTo(hx + 5 * s + Math.sin(a) * hh * 0.6, y - hh * 0.75); p.lineTo(hx + 5 * s, y + 2); p.closePath();
        D.blob(ctx, mx, p, c, K.adjust(c, -0.14), k, 5 * s); mx.fillStyle = 'rgba(255,255,255,.35)'; mx.fill(p);
      }
    },
    // ---- spooky (friendly) ----
    manor(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a crooked old house with warm windows
      s *= 1.8;   // a landmark: bigger than the band's other dressing
      const w = 30 * s, h = 46 * s;
      const body = new Path2D(); body.moveTo(x - w, y + 2); body.lineTo(x - w * 0.94, y - h); body.lineTo(x + w * 1.04, y - h * 1.06); body.lineTo(x + w, y + 2); body.closePath();
      D.blob(ctx, mx, body, '#6B5AA6', '#4E3F86', k, w * 0.3);
      D.blob(ctx, mx, poly([[-1.25, 0], [-0.1, -0.95], [1.3, 0.06]], x, y - h, w), '#3A2C6E', INK, k, w * 0.4);
      const t = new Path2D(); t.rect(x + w * 0.45, y - h - 30 * s, 16 * s, 34 * s); D.blob(ctx, mx, t, '#6B5AA6', '#4E3F86', k, 6 * s);
      D.blob(ctx, mx, poly([[-0.7, 0], [0.1, -1.3], [0.7, 0]], x + w * 0.45 + 8 * s, y - h - 30 * s, 16 * s), '#3A2C6E', INK, k, 6 * s);
      for (const [dx, dy] of [[-0.55, 0.62], [0.15, 0.62], [-0.2, 0.25], [0.55 + 0.25, 1.3]]) { const wn = I.rrect(x + dx * w, y - h * dy - 6 * s, 9 * s, 11 * s, 4 * s); glowFill(ctx, mx, wn, P.spark[1]); D.ink(ctx, mx, wn, D.lwOf(2 * s, k)); }
      const dr = new Path2D(); dr.rect(x - 6 * s, y - 16 * s, 12 * s, 18 * s); D.blob(ctx, mx, dr, P.cocoa[2], P.cocoa[3], k, 4 * s);
    },
    deadtree(ctx, mx, x, y, s, R) {   // a bare twisty tree (strokes: Ink, then bark)
      const h = (46 + R() * 30) * s, p = new Path2D(); p.moveTo(x, y + 2); p.quadraticCurveTo(x - 6 * s, y - h * 0.5, x + 3 * s, y - h);
      for (const [f, dx, dy] of [[0.55, -18, -14], [0.7, 16, -12], [0.85, -10, -10], [0.45, 14, -6]]) { const by = y - h * f, bx = x + (f - 0.5) * 6 * s; p.moveTo(bx, by); p.quadraticCurveTo(bx + dx * 0.4 * s, by + dy * s, bx + dx * s, by + dy * 1.3 * s); }
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 7 * s; ctx.stroke(p); ctx.strokeStyle = '#5B4A6E'; ctx.lineWidth = 4 * s; ctx.stroke(p);
    },
    pumpkin(ctx, mx, x, y, s, R, fill, shade, k, D) {   // a pumpkin; some smile with a warm glow inside
      const r = (9 + R() * 5) * s, p = new Path2D(); p.ellipse(x - r * 0.45, y - r * 0.8, r * 0.7, r * 0.8, 0, 0, TAU); p.ellipse(x + r * 0.45, y - r * 0.8, r * 0.7, r * 0.8, 0, 0, TAU); p.ellipse(x, y - r * 0.82, r * 0.72, r * 0.86, 0, 0, TAU);
      D.blob(ctx, mx, p, P.peach[2], P.peach[3], k, r);
      const st = new Path2D(); st.rect(x - 1.6 * s, y - r * 1.95, 3.2 * s, r * 0.4); D.blob(ctx, mx, st, P.mint[2], P.mint[3], k, 2 * s);
      if (R() < 0.6) {
        for (const sx of [-1, 1]) glowFill(ctx, mx, poly([[-2.6, 2], [0, -2.4], [2.6, 2]], x + sx * r * 0.35, y - r * 1.02, s), P.spark[1]);
        const mo = new Path2D(); mo.moveTo(x - r * 0.45, y - r * 0.6); mo.quadraticCurveTo(x, y - r * 0.05, x + r * 0.45, y - r * 0.6); mo.closePath(); glowFill(ctx, mx, mo, P.spark[1]);
      }
    },
  };
  const flat = () => () => 0;
  const HAZE = '#7CC4F5', GRASS = m(P.mint[2], P.spark[2], 0.2);
  K.biome('castle', { sky: ['#5DB2F0', '#FFE3B0', 0.55], bands: [
    [m(HAZE, P.grape[1], 0.3), m('#5E9FD8', P.grape[2], 0.3), 'peaks', ''],
    [m(P.mint[1], HAZE, 0.35), m(P.mint[2], '#5AA9E6', 0.4), 'hills', 'tree:110c,banner:300'],
    [m(P.mint[2], P.spark[2], 0.1), m(P.mint[3], P.mint[2], 0.35), 'hills', 'keep:640,tree:190c,pavilion:420'],
    [GRASS, m(P.mint[3], P.spark[3], 0.15), 'hills', 'bush:150,flower:40,tuft:30,banner:260,pavilion:700,rocks:500']],
  ground: [P.stone[0], P.stone[1], m(P.stone[2], P.cocoa[2], 0.5), P.stone[1]] }, { decos: D });
  K.biome('stadium', { sky: ['#3FA9F5', '#D2EEFF', 0.6], bands: [
    ['#C9D2E4', '#A3AEC6', 'flat', 'flood:480,roof:40,seats:34'],
    ['#B6C1D8', '#8E9AB3', 'flat', 'seats:34'],
    [m(P.mint[2], P.mint[1], 0.25), P.mint[3], 'flat', 'board:70,crowd:400'],
    [m(P.mint[2], P.spark[2], 0.12), P.mint[3], 'flat', 'stripe:68,goalnet:900']],
  ground: [m(P.mint[2], P.spark[2], 0.12), CREAM, m(P.mint[3], P.cocoa[3], 0.5), P.mint[3]] }, { decos: D, profiles: { flat } });
  K.biome('space', { sky: ['#1A1446', '#4A2C8C', 1], skyHold: true, clouds: false, sun: 'ringworld', stars: 1, bands: [
    [m(P.grape[2], P.sky[3], 0.4), m(P.grape[3], P.sky[3], 0.4), 'hills', 'crystal:200c'],
    [m(P.grape[1], P.sky[2], 0.35), m(P.grape[2], P.sky[3], 0.35), 'hills', 'dome:260,dish:330'],
    [m(P.mint[2], P.sky[2], 0.5), m(P.mint[3], P.sky[3], 0.5), 'hills', 'dome:300,dish:420,crystal:130c'],
    [m(P.mint[1], P.sky[1], 0.5), m(P.mint[2], P.sky[2], 0.5), 'hills', 'crystal:140c,rocks:320']],
  ground: [m(P.mint[1], P.sky[1], 0.4), m(P.mint[2], P.sky[2], 0.5), m(P.grape[3], INK, 0.2), P.grape[1]] }, { decos: D });
  K.biome('spooky', { sky: ['#3B2C86', '#E58BB0', 1], skyHold: true, clouds: false, sun: 'moon', bands: [
    ['#5B4AA0', '#46388A', 'hills', 'deadtree:160c'],
    ['#6655A8', '#4E3F8E', 'hills', 'manor:700,deadtree:120c'],
    ['#4F7A63', '#3C5F4D', 'hills', 'manor:620,deadtree:170c,fence:340,pumpkin:130'],
    ['#5E8C6E', '#466D55', 'hills', 'pumpkin:80c,tuft:30,mush:150']],
  ground: ['#6A9A78', '#4B735A', '#4A3A5E', P.grape[1]] }, { decos: D });
  K.dress({ recipes: { castle: { life: 'bird,butterfly', fg: 'fern' }, stadium: { life: 'bird,conf:leaf' }, space: { life: 'comet:bird,ufo:butterfly', fg: 'rocksfg' }, spooky: { life: 'bat:bird,ghost:butterfly', fg: 'fern' } } });
}
