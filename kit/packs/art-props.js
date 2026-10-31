// Art pack "art-props" (public/vendor/oomba-kit/<version>/packs/art-props.js, kit 1.1.0): the props of the themes'
// prop sets (Oomba.theme.look.props), so a castle game has towers and shields, a beach game sandcastles and starfish.
// - treasure (collectible in a level, like coins): sweet snowflake starfish pearl
// - seaside: sandcastle anchor clam · snowy: igloo · spooky: pumpkin ghost cauldron · castle: tower banner shield torch
// - sports: ball goalpost · sweets: donut candycane · space: ufo satellite · wild: totem pot pyramid · tech: drone
// Same "Oomba Ink" grammar as the core (Ink line, Cream rim, one hard shade); spark yellow only on treasure and flames.
export const PACK = { name: 'art-props' };
export function define(K) {
  const P = K.P, INK = K.INK, CREAM = K.CREAM, TAU = Math.PI * 2, I = K.ink;
  const S = (ctx, k, p, fill, shade, o = {}) => I.sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: o.off || 4 }, o));
  const F = (ctx, k, p, fill, line = 0.7) => I.sticker(ctx, k, p, { fill, rim: false, line });
  const C = (x, y, r) => I.ellipse(x, y, r, r), R = I.rrect;
  const poly = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const star = (cx, cy, r1, r2, n) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }));
  const line = (ctx, k, pts, w = 0.7) => I.detail(ctx, k, poly(pts, false), w);
  const dots = (ctx, pts, r, c) => { ctx.fillStyle = c; for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } };
  const face = (ctx, x, y, d = 7, smile = true) => { dots(ctx, [[x - d, y], [x + d, y]], 2.6, INK); if (smile) { ctx.beginPath(); ctx.arc(x, y + 4, 4, 0.2, Math.PI - 0.2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); } };
  let group = 'treasure';
  const def = (name, w, h, draw, ay = 0.5) => K.prop(name, group, { w, h, ax: 0.5, ay, draw });
  // ---- treasure ----
  def('sweet', 72, 48, (ctx, k) => {
    for (const s of [-1, 1]) S(ctx, k, poly([[36 + s * 14, 24], [36 + s * 32, 10], [36 + s * 30, 24], [36 + s * 32, 38]]), P.coral[1], P.coral[2], { off: 2 });
    S(ctx, k, C(36, 24, 15), P.coral[2], P.coral[3], { off: 4, gloss: [31, 17, 5, 3, -0.6] });
    ctx.save(); ctx.clip(C(36, 24, 15)); ctx.strokeStyle = CREAM; ctx.lineWidth = 3; for (const d of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(30 + d, 6); ctx.lineTo(42 + d, 42); ctx.stroke(); } ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w; ctx.stroke(C(36, 24, 15));
  });
  def('snowflake', 60, 60, (ctx, k) => {
    const p = new Path2D(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6, c = Math.cos(a), s = Math.sin(a); p.moveTo(30, 30); p.lineTo(30 + c * 24, 30 + s * 24); for (const t of [0.55, 0.8]) { const bx = 30 + c * 24 * t, by = 30 + s * 24 * t; for (const d of [-0.7, 0.7]) { p.moveTo(bx, by); p.lineTo(bx + Math.cos(a + d) * 7, by + Math.sin(a + d) * 7); } } }
    ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w * 2.4; ctx.stroke(p); ctx.strokeStyle = P.sky[1]; ctx.lineWidth = I.lines(k).w * 1.1; ctx.stroke(p);
    S(ctx, k, C(30, 30, 6), CREAM, P.sky[1], { off: 2 });
  });
  def('starfish', 64, 64, (ctx, k) => { S(ctx, k, star(32, 34, 28, 12, 5), P.coral[1], P.coral[2], { off: 5, gloss: [26, 24, 5, 3, -0.6] }); dots(ctx, [[32, 22], [44, 32], [22, 32], [27, 45], [38, 45]], 1.8, CREAM); });
  def('pearl', 48, 48, (ctx, k) => S(ctx, k, C(24, 24, 15), CREAM, P.grape[0], { off: 4, gloss: [19, 18, 5, 3, -0.6] }));
  // ---- seaside ----
  group = 'seaside';
  def('sandcastle', 100, 96, (ctx, k) => {
    const sand = P.peach[1], sh = P.peach[2];
    for (const [x, w, h] of [[22, 16, 52], [78, 16, 52]]) { S(ctx, k, R(x - w, 94 - h, 2 * w, h, 4), sand, sh, { off: 3 }); S(ctx, k, poly([[x - w, 94 - h], [x - w, 94 - h - 9], [x - w / 3, 94 - h - 9], [x - w / 3, 94 - h - 3], [x + w / 3, 94 - h - 3], [x + w / 3, 94 - h - 9], [x + w, 94 - h - 9], [x + w, 94 - h]]), sand, sh, { off: 2, rim: false }); }
    S(ctx, k, R(14, 52, 72, 42, 5), sand, sh, { off: 4 });
    S(ctx, k, poly([[34, 52], [50, 22], [66, 52]]), sand, sh, { off: 3 });
    line(ctx, k, [[50, 22], [50, 6]], 1); F(ctx, k, poly([[50, 6], [64, 10], [50, 15]]), P.coral[2], 0.6);
    const door = new Path2D(); door.moveTo(42, 94); door.lineTo(42, 78); door.arc(50, 78, 8, Math.PI, 0); door.lineTo(58, 94); door.closePath(); F(ctx, k, door, P.cocoa[2]);
  }, 1);
  def('anchor', 72, 84, (ctx, k) => {
    const p = new Path2D(); p.moveTo(36, 14); p.lineTo(36, 70); p.moveTo(14, 26); p.lineTo(58, 26); p.moveTo(8, 50); p.quadraticCurveTo(14, 76, 36, 76); p.quadraticCurveTo(58, 76, 64, 50);
    ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 13; ctx.stroke(p); ctx.strokeStyle = P.stone[1]; ctx.lineWidth = 7; ctx.stroke(p);
    S(ctx, k, C(36, 11, 8), P.stone[1], P.stone[2], { off: 2 }); F(ctx, k, C(36, 11, 3.5), P.sky[0], 0.5);
  });
  def('clam', 80, 64, (ctx, k) => {
    const top = new Path2D(); top.moveTo(8, 38); top.quadraticCurveTo(40, -6, 72, 38); top.closePath(); S(ctx, k, top, P.grape[1], P.grape[2], { off: 4 });
    for (const x of [24, 40, 56]) line(ctx, k, [[40, 38], [x, 14]], 0.6);
    S(ctx, k, C(40, 40, 9), CREAM, P.grape[0], { off: 2, gloss: [37, 36, 3, 2, -0.6] });
    const bot = new Path2D(); bot.moveTo(8, 42); bot.quadraticCurveTo(40, 72, 72, 42); bot.closePath(); S(ctx, k, bot, P.grape[1], P.grape[2], { off: 3 });
  }, 1);
  // ---- snowy ----
  group = 'snowy';
  def('igloo', 120, 80, (ctx, k) => {
    const d = new Path2D(); d.arc(60, 78, 54, Math.PI, 0); d.closePath(); S(ctx, k, d, P.snow[0], P.snow[2], { off: 6 });
    for (const y of [60, 42]) line(ctx, k, [[12 + (78 - y) * 0.4, y], [108 - (78 - y) * 0.4, y]], 0.6);
    for (const [x, y] of [[36, 60], [60, 60], [84, 60], [48, 42], [72, 42]]) line(ctx, k, [[x, y], [x, y + 18]], 0.6);
    const door = new Path2D(); door.moveTo(46, 78); door.lineTo(46, 62); door.arc(60, 62, 14, Math.PI, 0); door.lineTo(74, 78); door.closePath(); F(ctx, k, door, '#2F4A6A');
  }, 1);
  // ---- spooky (friendly) ----
  group = 'spooky';
  def('pumpkin', 72, 64, (ctx, k) => {
    const p = new Path2D(); p.ellipse(22, 38, 18, 22, 0, 0, TAU); p.ellipse(50, 38, 18, 22, 0, 0, TAU); p.ellipse(36, 37, 18, 24, 0, 0, TAU);
    S(ctx, k, p, P.peach[2], P.peach[3], { off: 5, gloss: [26, 26, 5, 3, -0.6] });
    S(ctx, k, R(32, 8, 8, 10, 3), P.mint[2], P.mint[3], { off: 2 });
    for (const x of [27, 45]) F(ctx, k, poly([[x - 5, 38], [x, 30], [x + 5, 38]]), P.spark[1], 0.5);
    const mo = new Path2D(); mo.moveTo(24, 46); mo.quadraticCurveTo(36, 58, 48, 46); mo.closePath(); F(ctx, k, mo, P.spark[1], 0.5);
  }, 1);
  def('ghost', 64, 76, (ctx, k) => {
    const p = new Path2D(); p.moveTo(10, 70); p.lineTo(10, 32); p.arc(32, 32, 22, Math.PI, 0); p.lineTo(54, 70); for (let i = 0; i < 4; i++) p.quadraticCurveTo(54 - (i + 0.5) * 11, 60, 54 - (i + 1) * 11, 70); p.closePath();
    S(ctx, k, p, CREAM, P.grape[0], { off: 5, gloss: [24, 20, 6, 3, -0.6] }); face(ctx, 32, 34);
    dots(ctx, [[20, 42], [44, 42]], 3.5, P.coral[0]);
  });
  def('cauldron', 84, 72, (ctx, k) => {
    for (const x of [22, 62]) S(ctx, k, R(x - 3, 56, 6, 14, 2), INK, INK, { off: 0, rim: false });
    S(ctx, k, I.ellipse(42, 40, 36, 24), '#3A3550', INK, { off: 4, gloss: [26, 34, 6, 3, -0.6] });
    S(ctx, k, I.ellipse(42, 20, 32, 8), '#3A3550', INK, { off: 0 });
    F(ctx, k, I.ellipse(42, 20, 26, 5), P.mint[1], 0.5);
    for (const [x, y, r] of [[34, 12, 5], [48, 8, 4], [42, 2, 3]]) S(ctx, k, C(x, y, r), P.mint[1], P.mint[2], { off: 1, rim: false, line: 0.5 });
  }, 1);
  // ---- castle ----
  group = 'castle';
  def('tower', 80, 150, (ctx, k) => {
    S(ctx, k, R(14, 46, 52, 102, 4), P.stone[0], P.stone[1], { off: 6 });
    S(ctx, k, poly([[8, 48], [40, 4], [72, 48]]), P.coral[2], P.coral[3], { off: 4 });
    const w = new Path2D(); w.moveTo(33, 92); w.lineTo(33, 76); w.arc(40, 76, 7, Math.PI, 0); w.lineTo(47, 92); w.closePath(); F(ctx, k, w, P.spark[1]);
    for (const [x, y] of [[22, 112], [48, 126], [30, 136], [52, 100]]) line(ctx, k, [[x, y], [x + 10, y]], 0.6);
    const d = new Path2D(); d.moveTo(31, 148); d.lineTo(31, 128); d.arc(40, 128, 9, Math.PI, 0); d.lineTo(49, 148); d.closePath(); F(ctx, k, d, P.cocoa[2]);
  }, 1);
  def('banner', 56, 120, (ctx, k) => {
    S(ctx, k, R(25, 6, 6, 112, 3), P.cocoa[2], P.cocoa[3], { off: 1 });
    S(ctx, k, R(10, 14, 36, 4, 2), P.cocoa[2], P.cocoa[3], { off: 0, rim: false });
    S(ctx, k, poly([[12, 18], [44, 18], [44, 68], [28, 58], [12, 68]]), P.coral[2], P.coral[3], { off: 3 });
    S(ctx, k, C(28, 36, 7), CREAM, P.cream[3], { off: 1, rim: false });
  }, 1);
  def('shield', 64, 72, (ctx, k) => {
    const p = new Path2D(); p.moveTo(8, 8); p.lineTo(56, 8); p.lineTo(56, 34); p.quadraticCurveTo(54, 58, 32, 68); p.quadraticCurveTo(10, 58, 8, 34); p.closePath();
    S(ctx, k, p, P.sky[2], P.sky[3], { off: 5 });
    ctx.save(); ctx.clip(p); ctx.fillStyle = CREAM; ctx.fillRect(27, 0, 10, 72); ctx.fillRect(0, 26, 64, 10); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w; ctx.stroke(p);
  });
  def('torch', 40, 110, (ctx, k) => {
    S(ctx, k, poly([[14, 40], [26, 40], [23, 106], [17, 106]]), P.cocoa[2], P.cocoa[3], { off: 1 });
    S(ctx, k, R(10, 34, 20, 10, 3), P.stone[1], P.stone[2], { off: 1 });
    const fl = new Path2D(); fl.moveTo(20, 4); fl.quadraticCurveTo(34, 20, 30, 30); fl.quadraticCurveTo(26, 38, 20, 36); fl.quadraticCurveTo(10, 36, 10, 26); fl.quadraticCurveTo(12, 16, 20, 4); fl.closePath();
    S(ctx, k, fl, P.peach[2], P.coral[2], { off: 3, emissive: true, unlit: true }); F(ctx, k, I.ellipse(20, 28, 5, 6), P.spark[1], 0.4);
    if (k.mask) I.glow(k, fl);
  }, 1);
  // ---- sports ----
  group = 'sports';
  def('ball', 56, 56, (ctx, k) => {
    S(ctx, k, C(28, 28, 24), CREAM, P.snow[2], { off: 4, gloss: [20, 18, 6, 3, -0.6] });
    ctx.save(); ctx.clip(C(28, 28, 24)); ctx.fillStyle = INK; ctx.fill(star(28, 29, 8, 8, 5));
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; ctx.beginPath(); ctx.arc(28 + Math.cos(a) * 25, 29 + Math.sin(a) * 25, 7, 0, TAU); ctx.fill(); } ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w; ctx.stroke(C(28, 28, 24));
  });
  def('goalpost', 140, 96, (ctx, k) => {
    ctx.strokeStyle = 'rgba(20,20,20,.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let x = 20; x < 124; x += 12) { ctx.moveTo(x, 12); ctx.lineTo(x + 6, 92); } for (let y = 24; y < 92; y += 12) { ctx.moveTo(12, y); ctx.lineTo(128, y); } ctx.stroke();
    for (const p of [R(7, 6, 10, 90, 5), R(123, 6, 10, 90, 5), R(7, 6, 126, 10, 5)]) S(ctx, k, p, CREAM, P.snow[2], { off: 2 });
  }, 1);
  // ---- sweets ----
  group = 'sweets';
  def('donut', 64, 56, (ctx, k) => {
    S(ctx, k, I.ellipse(32, 30, 28, 22), P.peach[1], P.peach[2], { off: 4 });
    const ic = new Path2D(); ic.moveTo(8, 26); for (let i = 0; i <= 8; i++) ic.quadraticCurveTo(8 + i * 6 + 3, i % 2 ? 40 : 34, 8 + (i + 1) * 6, 28 + (i % 3)); ic.quadraticCurveTo(32, 2, 8, 26); ic.closePath();
    ctx.save(); ctx.clip(I.ellipse(32, 30, 28, 22)); F(ctx, k, ic, P.coral[1], 0.6); ctx.restore();
    for (const [x, y, c] of [[20, 18, P.sky[2]], [40, 14, P.mint[2]], [48, 24, CREAM], [24, 30, P.grape[2]]]) F(ctx, k, R(x - 3, y - 1.5, 6, 3, 1.5), c, 0.4);
    S(ctx, k, I.ellipse(32, 26, 8, 5), P.cocoa[3], INK, { off: 0, rim: false, line: 0.7 });
  });
  def('candycane', 48, 100, (ctx, k) => {
    const p = new Path2D(); p.moveTo(38, 94); p.lineTo(38, 30); p.arc(22, 30, 16, 0, Math.PI, true); p.lineTo(6, 36); p.arc(10, 36, 4, Math.PI, 0, true); p.lineTo(14, 30); p.arc(22, 30, 8, Math.PI, 0); p.lineTo(30, 94); p.arc(34, 94, 4, Math.PI, 0, true); p.closePath();
    S(ctx, k, p, CREAM, P.cream[3], { off: 2 });
    ctx.save(); ctx.clip(p); ctx.fillStyle = P.coral[2]; for (let y = 0; y < 110; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(48, y - 14); ctx.lineTo(48, y - 7); ctx.lineTo(0, y + 7); ctx.fill(); } ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w; ctx.stroke(p);
  }, 1);
  // ---- space ----
  group = 'space';
  def('ufo', 100, 64, (ctx, k) => {
    S(ctx, k, I.ellipse(50, 26, 20, 18), P.sky[0], P.sky[1], { off: 3, gloss: [44, 18, 6, 3, -0.6] });
    S(ctx, k, I.ellipse(50, 40, 46, 13), P.grape[2], P.grape[3], { off: 4 });
    for (const x of [24, 50, 76]) F(ctx, k, C(x, 41, 4), P.mint[1], 0.5);
  });
  def('satellite', 120, 70, (ctx, k) => {
    for (const x of [6, 82]) { S(ctx, k, R(x, 22, 32, 26, 3), P.sky[2], P.sky[3], { off: 2 }); line(ctx, k, [[x + 16, 22], [x + 16, 48]], 0.6); }
    line(ctx, k, [[38, 35], [82, 35]], 1.2);
    S(ctx, k, R(46, 18, 28, 34, 6), CREAM, P.snow[2], { off: 3 });
    const d = new Path2D(); d.ellipse(60, 12, 14, 6, 0, 0, Math.PI); d.closePath(); S(ctx, k, d, P.stone[1], P.stone[2], { off: 1 });
  });
  // ---- wild (jungle, desert) ----
  group = 'wild';
  def('totem', 56, 130, (ctx, k) => {
    const cols = [[P.mint[2], P.mint[3]], [P.coral[2], P.coral[3]], [P.sky[2], P.sky[3]]];
    for (let i = 0; i < 3; i++) { const y = 8 + i * 40; S(ctx, k, R(10, y, 36, 40, 6), cols[i][0], cols[i][1], { off: 3 }); dots(ctx, [[21, y + 16], [35, y + 16]], 4, CREAM); dots(ctx, [[21, y + 16], [35, y + 16]], 2, INK); line(ctx, k, [[20, y + 29], [36, y + 29]], 0.8); }
    S(ctx, k, poly([[4, 18], [10, 12], [10, 28]]), P.peach[1], P.peach[2], { off: 1 }); S(ctx, k, poly([[52, 18], [46, 12], [46, 28]]), P.peach[1], P.peach[2], { off: 1 });
  }, 1);
  def('pot', 64, 72, (ctx, k) => {
    const p = new Path2D(); p.moveTo(22, 6); p.lineTo(42, 6); p.lineTo(40, 16); p.quadraticCurveTo(62, 26, 56, 50); p.quadraticCurveTo(50, 70, 32, 70); p.quadraticCurveTo(14, 70, 8, 50); p.quadraticCurveTo(2, 26, 24, 16); p.closePath();
    S(ctx, k, p, P.peach[2], P.peach[3], { off: 5, gloss: [20, 32, 4, 7, -0.3] });
    ctx.save(); ctx.clip(p); ctx.fillStyle = P.cocoa[2]; ctx.fillRect(0, 34, 64, 6); ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = I.lines(k).w; ctx.stroke(p);
  }, 1);
  def('pyramid', 140, 90, (ctx, k) => {
    S(ctx, k, poly([[6, 88], [70, 6], [134, 88]]), P.peach[1], P.peach[2], { off: 0 });
    F(ctx, k, poly([[70, 6], [134, 88], [92, 88]]), P.peach[2], 0.6);
    for (const y of [30, 50, 70]) line(ctx, k, [[70 - (y - 6) * 0.78, y], [70 + (y - 6) * 0.5, y]], 0.5);
    const d = new Path2D(); d.moveTo(60, 88); d.lineTo(60, 74); d.arc(68, 74, 8, Math.PI, 0); d.lineTo(76, 88); d.closePath(); F(ctx, k, d, P.cocoa[3]);
  }, 1);
  // ---- tech ----
  group = 'tech';
  def('drone', 100, 56, (ctx, k) => {
    for (const x of [16, 84]) { line(ctx, k, [[x, 22], [x, 14]], 1); S(ctx, k, I.ellipse(x, 12, 15, 3.5), P.stone[1], P.stone[2], { off: 0, rim: false }); }
    line(ctx, k, [[16, 26], [84, 26]], 1.4);
    S(ctx, k, R(32, 18, 36, 24, 9), P.stone[0], P.stone[1], { off: 3 });
    F(ctx, k, C(50, 30, 6), P.sky[1], 0.6); F(ctx, k, C(50, 30, 2.5), INK, 0.3);
    for (const x of [38, 62]) F(ctx, k, C(x, 46, 3), P.coral[2], 0.4);
  });
}
