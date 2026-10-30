// Art pack "art-school" (public/vendor/oomba-kit/<version>/packs/art-school.js): learning props (number and letter
// tiles, fraction pies, clocks, dice, ten shapes, books...), food for counting and sharing, and classroom things
// (chalkboard, abacus, ruler, crayons, school bag, paint palette, letter blocks). Same "Oomba Ink" grammar as the core;
// no spark yellow except the light bulb's glow (an idea is a reward). Loaded with its own pinned tag after the kit's.
export const PACK = { name: 'art-school' };
export function define(K) {
  const P = K.P, INK = K.INK, CREAM = K.CREAM, TAU = Math.PI * 2, text = K.text;
  const { sticker, detail, ellipse: ellipsePath, rrect: rrectPath, lines, capsule } = K.ink;
  const circ = (x, y, r) => ellipsePath(x, y, r, r);
  const poly = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const rpoly = (pts, r) => { const p = new Path2D(), n = pts.length; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const s = mid(pts[n - 1], pts[0]); p.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; p.arcTo(a[0], a[1], b[0], b[1], r); } p.closePath(); return p; };
  const ngon = (cx, cy, R, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + i * TAU / n) * R, cy + Math.sin(rot + i * TAU / n) * R]);
  const S = (ctx, k, p, fill, shade, o = {}) => sticker(ctx, k, p, Object.assign({ fill, shade, shadeOff: o.off || 4 }, o));
  const F = (ctx, k, p, fill, line = 0.7) => sticker(ctx, k, p, { fill, rim: false, line });
  const hue = (v, d) => { const h = String(v || '').split(':')[1]; return P[h] && h !== 'spark' ? h : d; };
  const head = v => String(v || '').split(':')[0];
  const SHAPES = { circle: 'sky', square: 'mint', triangle: 'grape', rectangle: 'peach', pentagon: 'coral', hexagon: 'sky', diamond: 'grape', oval: 'mint', star: 'peach', heart: 'coral' };
  const VARIANTS = { tile: ['7', 'A', '3:grape', 'b:coral', '+:peach'], pie: ['1/2', '1/3', '3/4', '5/8'], clock: ['3:00', '9:30', '12:15'], dice: ['1', '2', '3', '4', '5', '6'], shape: Object.keys(SHAPES), book: ['', 'open'],
    chalkboard: ['2 + 3', 'ABC', '7 × 6'], crayon: ['coral', 'sky', 'mint', 'grape', 'peach'], letterblock: ['A', 'B', 'C', '1:coral'] };
  let group = 'learning';
  const def = (name, w, h, draw, ax = 0.5, ay = 0.5, o = {}) => K.prop(name, group, Object.assign({ w, h, ax, ay, draw }, o), VARIANTS[name]);
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

  // ---- food (counting and sharing) ----
  group = 'food';
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

  // ---- the classroom ----
  group = 'school';
  def('chalkboard', 120, 96, (ctx, k) => {
    for (const x of [24, 96]) S(ctx, k, rrectPath(x - 4, 60, 8, 34, 3), P.cocoa[2], P.cocoa[3], { off: 2 });
    const frame = rrectPath(4, 4, 112, 70, 10); S(ctx, k, frame, P.cocoa[2], P.cocoa[3], { off: 4, gloss: [20, 9, 10, 2, 0] });
    const board = rrectPath(12, 11, 96, 54, 6); F(ctx, k, board, K.mix(P.mint[3], INK, 0.45), 0.8);
    ctx.save(); ctx.clip(board); ctx.fillStyle = 'rgba(255,253,242,0.08)'; ctx.beginPath(); ctx.ellipse(36, 22, 26, 8, -0.2, 0, TAU); ctx.fill(); ctx.restore();
    text(ctx, k, String(k.v || '2 + 3'), 60, 39, 24, CREAM, 700);
    S(ctx, k, rrectPath(70, 70, 22, 6, 3), CREAM, P.cream[3], { off: 1, rim: false });
  }, 0.5, 1, { text: true });
  def('abacus', 96, 84, (ctx, k) => {
    const cols = [P.coral[2], P.sky[2], P.mint[2], P.grape[2]];
    for (let r = 0; r < 4; r++) { const y = 23 + r * 13, rod = poly([[15, y], [81, y]], false); detail(ctx, k, rod, 1.2);
      for (let i = 0; i < 5; i++) { const x = (r % 2 ? 26 : 20) + i * 10 + (i > 2 - (r % 2) ? 18 : 0); S(ctx, k, ellipsePath(x, y, 5.2, 5.6), cols[r], K.adjust(cols[r], -0.12), { off: 1.5, rim: false, line: 0.7 }); } }
    S(ctx, k, rrectPath(6, 6, 84, 9, 4), P.cocoa[2], P.cocoa[3], { off: 2 }); S(ctx, k, rrectPath(6, 69, 84, 9, 4), P.cocoa[2], P.cocoa[3], { off: 2 });
    S(ctx, k, rrectPath(6, 6, 9, 72, 4), P.cocoa[2], P.cocoa[3], { off: 2 }); S(ctx, k, rrectPath(81, 6, 9, 72, 4), P.cocoa[2], P.cocoa[3], { off: 2 });
  }, 0.5, 1);
  def('ruler', 120, 30, (ctx, k) => {
    S(ctx, k, rrectPath(4, 4, 112, 22, 4), P.peach[1], P.peach[2], { off: 3, gloss: [30, 9, 18, 2, 0] });
    for (let i = 0; i <= 20; i++) { const x = 10 + i * 5, t = poly([[x, 4], [x, i % 5 ? 10 : i % 10 ? 13 : 15]], false); detail(ctx, k, t, i % 5 ? 0.5 : 0.8); }
    for (const [i, n] of [[0, '0'], [10, '5'], [20, '10']]) text(ctx, k, n, 10 + i * 5, 20, 7, INK, 700);
  }, 0.5, 0.5, { text: true });
  def('crayon', 100, 28, (ctx, k) => {
    const c = P[hue(':' + (k.v || 'coral'), 'coral')];
    S(ctx, k, rrectPath(24, 4, 70, 20, 6), c[2], c[3], { off: 3, gloss: [44, 9, 16, 2, 0] });
    F(ctx, k, rrectPath(36, 4, 40, 20, 2), CREAM, 0.6); for (const x of [42, 70]) { const l = poly([[x, 6], [x, 22]], false); detail(ctx, k, l, 0.6); }
    const tip = poly([[24, 6], [6, 14], [24, 22]]); S(ctx, k, tip, c[1], c[2], { off: 2 });
  });
  def('schoolbag', 76, 88, (ctx, k) => {
    for (const s of [-1, 1]) { const st = capsule(38 + s * 18, 12, 38 + s * 22, 40, 3.4); S(ctx, k, st, P.sky[3], P.sky[3], { off: 1 }); }
    const bag = rrectPath(8, 14, 60, 70, 18); S(ctx, k, bag, P.sky[2], P.sky[3], { off: 5, gloss: [22, 26, 8, 4, -0.5] });
    const flap = new Path2D(); flap.moveTo(10, 34); flap.quadraticCurveTo(38, 8, 66, 34); flap.lineTo(66, 44); flap.quadraticCurveTo(38, 36, 10, 44); flap.closePath(); S(ctx, k, flap, P.sky[1], P.sky[2], { off: 2, rim: false });
    S(ctx, k, rrectPath(20, 52, 36, 24, 8), P.coral[1], P.coral[2], { off: 2, rim: false }); F(ctx, k, rrectPath(34, 40, 8, 8, 2), CREAM, 0.6);
    S(ctx, k, capsule(30, 6, 46, 6, 4), P.sky[3], P.sky[3], { off: 1 });
  }, 0.5, 1);
  def('paint', 90, 66, (ctx, k) => {
    const p = new Path2D(); p.moveTo(46, 4); p.bezierCurveTo(80, 4, 92, 30, 82, 46); p.bezierCurveTo(74, 58, 58, 50, 52, 58); p.bezierCurveTo(44, 66, 8, 64, 6, 36); p.bezierCurveTo(4, 14, 22, 4, 46, 4); p.closePath();
    S(ctx, k, p, P.cocoa[0], P.cocoa[1], { off: 4, gloss: [26, 14, 10, 3, -0.3] });
    F(ctx, k, circ(62, 38, 6), P.cocoa[1], 0.8);
    for (const [x, y, c] of [[24, 20, 'coral'], [44, 14, 'sky'], [64, 18, 'mint'], [22, 42, 'grape'], [40, 46, 'peach']]) S(ctx, k, ellipsePath(x, y, 7, 6, x * 0.05), P[c][2], P[c][3], { off: 1.5, rim: false, line: 0.7 });
  });
  def('letterblock', 64, 64, (ctx, k) => {
    const t = head(k.v) || 'A', c = hue(k.v, ['coral', 'sky', 'mint', 'grape', 'peach'][t.charCodeAt(0) % 5]), R = P[c];
    const side = poly([[48, 16], [60, 8], [60, 50], [48, 60]]), top = poly([[4, 16], [16, 6], [60, 8], [48, 16]]);
    S(ctx, k, side, R[3], R[3], { off: 0 }); S(ctx, k, top, R[1], R[2], { off: 0 });
    S(ctx, k, rrectPath(4, 16, 44, 44, 6), R[2], R[3], { off: 4 }); F(ctx, k, rrectPath(9, 21, 34, 34, 5), CREAM, 0.6);
    text(ctx, k, t, 26, 38, 26, R[3]);
  }, 0.5, 1, { text: true });
}
