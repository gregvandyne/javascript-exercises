// ======================================================================================================
// STORY PANELS: soft, painted-looking pictures (gradients, washes of colour, brush dabs and a paper grain, all drawn
// in code) that tell the raft arrival at the start of each launch and the climb to the Canopy Stage at the end.
// They contrast with the crisp pixel island on purpose. A story line is a text-box line with a `panel`:
//   JC.say([{ who: 'story', key: 'story.1', panel: 'river' }, ...])
// While such a line is open the panel fills the screen above the text box, with a Skip button (or Esc / B) that
// jumps past every panel line in a row. Each picture is painted once per screen size into its own canvas.
// ======================================================================================================
const STORY = { cache: {}, gen: -1, cur: '', prev: '', fade: 1, t: 0, frame: { x: 0, y: 0, w: 0, h: 0 } };
JC.story = STORY;
STORY.line = () => (TB.open && TB.lines && TB.lines[TB.i] && TB.lines[TB.i].panel) || '';
STORY.showing = () => !!STORY.line();
/** Skip every story-panel line in a row (the lines after them, like a cousin's hello, still show). */
STORY.skip = function () {
  let n = 0;
  while (STORY.showing() && n++ < 40) TB.nextLine();
  STORY.cur = ''; STORY.prev = '';
};
STORY.update = function (dt) {
  STORY.t += dt;
  const id = STORY.line();
  if (id && id !== STORY.cur) { STORY.prev = STORY.cur; STORY.cur = id; STORY.fade = 0; }
  if (STORY.fade < 1) STORY.fade = Math.min(1, STORY.fade + dt * 2.5);
  if (!id) { STORY.cur = ''; STORY.prev = ''; }
};
/** Input while a panel shows: Skip (button, Esc / B) or the text box. True when used. */
STORY.input = function (e) {
  if (!STORY.showing()) return false;
  if ((e.type === 'press' && (e.key === 'b' || e.key === 'pause')) || (e.type === 'tap' && UI.hitAt(e.x, e.y) === 'skip')) { AUDIO.sfx('back'); STORY.skip(); return true; }
  if (e.type === 'down' && UI.hitAt(e.x, e.y) === 'skip') return true;
  TB.input(e);
  return true;
};

/* ---------- the painter: brush helpers on a canvas whose logical width is 320 ---------- */
function painter(c, LW, LH, seed) {
  const g = c.getContext('2d'), k = c.width / LW, r = rng(seed);
  g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = true;
  const P2 = {
    g, r, LW, LH,
    sky(stops) { const gr = g.createLinearGradient(0, 0, 0, LH); for (const s of stops) gr.addColorStop(s[0], s[1]); g.fillStyle = gr; g.fillRect(0, 0, LW, LH); },
    blob(x, y, rx, ry, col, a, rot) { g.globalAlpha = a === undefined ? 1 : a; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; },
    /** Many soft dabs of one colour around (x, y): a wash of paint. */
    wash(x, y, rx, ry, col, n, a) { for (let i = 0; i < n; i++) P2.blob(x + (r() - 0.5) * rx * 1.4, y + (r() - 0.5) * ry * 1.4, Math.min(rx, ry * 3) * (0.25 + r() * 0.45), ry * (0.25 + r() * 0.45), col, a === undefined ? 0.35 : a, (r() - 0.5) * 0.5); },
    glow(x, y, rad, col, a) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = a === undefined ? 1 : a; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.globalAlpha = 1;
    },
    /** Horizontal brush streaks (water, mist). */
    streaks(x0, y0, w, h, col, n, a) { for (let i = 0; i < n; i++) { const y = y0 + r() * h, len = 8 + r() * w * 0.25; P2.blob(x0 + r() * w, y, len, 0.6 + r() * 1.2, col, a === undefined ? 0.4 : a); } },
    poly(pts, col, a) { g.globalAlpha = a === undefined ? 1 : a; g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); g.globalAlpha = 1; },
    stroke(pts, col, wd, a) { g.globalAlpha = a === undefined ? 1 : a; g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); g.globalAlpha = 1; },
    curve(x0, y0, cx, cy, x1, y1, col, wd, a) { g.globalAlpha = a === undefined ? 1 : a; g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); g.globalAlpha = 1; },
    /** A leaf: a pointed oval with a vein. */
    leaf(x, y, len, rot, col, a) {
      g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a === undefined ? 1 : a; g.fillStyle = col;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0); g.fill();
      g.globalAlpha *= 0.5; g.strokeStyle = shade(col, 0.35); g.lineWidth = Math.max(0.4, len * 0.04); g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    },
    /** The finishing pass: a soft blur of the whole picture, a paper grain and a warm vignette. */
    finish(warm) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 0.22; for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) g.drawImage(c, dx, dy);
      g.restore(); g.setTransform(k, 0, 0, k, 0, 0);
      for (let i = 0; i < LW * LH / 30; i++) P2.blob(r() * LW, r() * LH, 0.4 + r() * 0.9, 0.4 + r() * 0.9, r() < 0.5 ? '#ffffff' : '#3a2410', 0.05);
      const gr = g.createRadialGradient(LW / 2, LH * 0.55, Math.min(LW, LH) * 0.35, LW / 2, LH * 0.5, Math.max(LW, LH) * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, warm || 'rgba(60,24,40,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
    },
  };
  return P2;
}
/* ---------- painted characters ---------- */
function pCapy(p, x, y, s, o) {
  o = o || {};
  const fur = o.fur || '#a86a3c', dark = shade(fur, -0.35), light = shade(fur, 0.3), dir = o.left ? -1 : 1, band = o.bandana || BANDANAS[SAVE.data.cos.bandana] || '#45c34e';
  p.blob(x, y + 12 * s, 16 * s, 3 * s, '#000', 0.18);
  if (!o.noPack) { p.blob(x - 8 * s * dir, y - 3 * s, 6 * s, 7 * s, '#c0703a'); p.blob(x - 8 * s * dir, y - 5 * s, 4 * s, 3 * s, '#e09a5a', 0.7); }
  p.blob(x, y, 15 * s, 10 * s, fur);
  p.blob(x + 1 * s * dir, y + 3 * s, 11 * s, 6 * s, light, 0.45);
  for (const lx of [-9, -3, 4, 9]) p.blob(x + lx * s, y + 9 * s, 2.4 * s, 3.4 * s, dark);
  p.blob(x + 11 * s * dir, y - 6 * s, 9 * s, 7.5 * s, fur);
  p.blob(x + 16 * s * dir, y - 4 * s, 5.5 * s, 4.8 * s, light, 0.9);
  p.blob(x + 19 * s * dir, y - 5.5 * s, 1.6 * s, 1.2 * s, '#2a1810');
  p.blob(x + 7 * s * dir, y - 12 * s, 2.6 * s, 2.2 * s, dark);
  p.blob(x + 12 * s * dir, y - 9 * s, 1.5 * s, 1.5 * s, '#1a0e08'); p.blob(x + 12.5 * s * dir, y - 9.6 * s, 0.5 * s, 0.5 * s, '#ffffff');
  p.blob(x + 13 * s * dir, y - 2.5 * s, 2.4 * s, 1.2 * s, '#f08a8a', 0.4);
  // the bandana round his neck, its knot and tails
  p.stroke([x + 4 * s * dir, y - 11 * s, x + 6 * s * dir, y - 1 * s], band, 3.2 * s);
  p.blob(x + 3 * s * dir, y - 6 * s, 2.2 * s, 2 * s, shade(band, -0.2));
  p.stroke([x + 3 * s * dir, y - 6 * s, x - 2 * s * dir, y - 9 * s - (o.wave ? 3 * s : 0)], band, 1.8 * s);
  p.stroke([x + 3 * s * dir, y - 6 * s, x - 3 * s * dir, y - 4 * s], band, 1.6 * s);
  // the hats in the pixel hats' colours: golden straw with a red band, the white explorer hat with a blue band
  if (o.hat === 'straw') { p.blob(x + 10 * s * dir, y - 13 * s, 9 * s, 2.2 * s, '#d8b450'); p.blob(x + 10 * s * dir, y - 15 * s, 5 * s, 3 * s, '#f0d070'); p.blob(x + 10 * s * dir, y - 13.6 * s, 5 * s, 0.9 * s, '#e04848'); }
  if (o.hat === 'explorer') { p.blob(x + 10 * s * dir, y - 13 * s, 9 * s, 2 * s, '#e8dcc0'); p.blob(x + 10 * s * dir, y - 15.5 * s, 5.5 * s, 3.5 * s, '#fff8e8'); p.blob(x + 10 * s * dir, y - 13.8 * s, 5.5 * s, 0.9 * s, '#3a7bd5'); }
  if (o.arm) { p.stroke([x + 9 * s * dir, y + 1 * s, x + 14 * s * dir, y - 10 * s], fur, 3 * s); p.blob(x + 14 * s * dir, y - 11 * s, 2 * s, 2 * s, dark); }
}
function pRaft(p, x, y, w, flagCol) {
  p.blob(x, y + 6, w * 0.6, 3, '#000', 0.2);
  for (let i = 0; i < 5; i++) { const yy = y - 4 + i * 2.6; p.blob(x, yy, w * 0.5, 2, i % 2 ? '#8a5a30' : '#a8703e'); p.blob(x - w * 0.1, yy - 0.6, w * 0.35, 0.6, '#d4a068', 0.6); }
  p.stroke([x - w * 0.4, y - 4, x - w * 0.4, y + 6], '#5e3820', 1.2); p.stroke([x + w * 0.4, y - 4, x + w * 0.4, y + 6], '#5e3820', 1.2);
  p.stroke([x + w * 0.3, y - 2, x + w * 0.3, y - 34], '#5e3820', 1.6);
  p.poly([x + w * 0.3, y - 34, x + w * 0.3 + 16, y - 30, x + w * 0.3, y - 25], flagCol);
}
const CHAMP_LOOK = {
  jada: { col: '#f0a040', spot: '#6a3a10' }, sloane: { col: '#9a8a70', mask: '#4a3a2a' }, tico: { col: '#2a2430', beak: '#ff9b2e' },
  otters: { col: '#7a4a2a' }, rana: { col: '#9d5cf0', spot: '#ffd23f' }, mico: { col: '#5a3418', tail: true }, kiki: { col: '#d49a3a', tail: true },
  pecca: { col: '#6e5c54' },
};
function pCritter(p, id, x, y, s) {
  const L = CHAMP_LOOK[id], c = L.col, d = shade(c, -0.35), l = shade(c, 0.3);
  p.blob(x, y + 12 * s, 11 * s, 2.5 * s, '#000', 0.2);
  if (id === 'otters') { for (const ox of [-6, 6]) { p.blob(x + ox * s, y + 2 * s, 5 * s, 10 * s, c); p.blob(x + ox * s, y - 9 * s, 5 * s, 4.5 * s, c); p.blob(x + ox * s, y - 7 * s, 3 * s, 2 * s, l); p.blob(x + ox * s - 1.5 * s, y - 10 * s, 0.8 * s, 0.8 * s, '#111'); p.blob(x + ox * s + 1.5 * s, y - 10 * s, 0.8 * s, 0.8 * s, '#111'); } return; }
  if (id === 'rana') { p.blob(x, y + 4 * s, 10 * s, 7 * s, c); p.blob(x, y - 3 * s, 8 * s, 5 * s, c); for (const ox of [-4, 4]) { p.blob(x + ox * s, y - 7 * s, 2.6 * s, 2.6 * s, c); p.blob(x + ox * s, y - 7 * s, 1.4 * s, 1.4 * s, '#111'); } for (let i = 0; i < 5; i++) p.blob(x + (p.r() - 0.5) * 14 * s, y + (p.r() - 0.2) * 8 * s, 1.3 * s, 1.1 * s, L.spot); p.blob(x - 9 * s, y + 9 * s, 4 * s, 1.6 * s, d); p.blob(x + 9 * s, y + 9 * s, 4 * s, 1.6 * s, d); return; }
  if (id === 'pecca') {
    // a round bristly peccary: pale collar, pink snout, teal captain's headband
    p.blob(x, y + 3 * s, 10 * s, 9 * s, c); p.blob(x, y - 7 * s, 8 * s, 6.5 * s, c);
    for (let i = 0; i < 5; i++) p.blob(x - 4 * s + i * 2 * s, y - 14 * s, 1.2 * s, 2.6 * s, d, 0.95);
    p.blob(x, y - 1 * s, 9.5 * s, 1.8 * s, '#efe4d0', 0.95);
    p.blob(x, y - 11 * s, 7.5 * s, 1.5 * s, '#1fc8a8', 0.95);
    p.blob(x, y - 4 * s, 4 * s, 2.6 * s, '#d49a8c'); p.blob(x - 1.4 * s, y - 4 * s, 0.7 * s, 0.7 * s, '#5a2a2a'); p.blob(x + 1.4 * s, y - 4 * s, 0.7 * s, 0.7 * s, '#5a2a2a');
    p.blob(x - 3 * s, y - 8 * s, 1 * s, 1 * s, '#111'); p.blob(x + 3 * s, y - 8 * s, 1 * s, 1 * s, '#111');
    p.blob(x - 7 * s, y - 12 * s, 2 * s, 2 * s, d); p.blob(x + 7 * s, y - 12 * s, 2 * s, 2 * s, d);
    return;
  }
  if (id === 'tico') { p.blob(x, y + 2 * s, 7 * s, 10 * s, c); p.blob(x, y + 4 * s, 4 * s, 5 * s, '#fff2c0', 0.9); p.blob(x, y - 9 * s, 6 * s, 5.5 * s, c); p.poly([x + 3 * s, y - 11 * s, x + 17 * s, y - 8 * s, x + 3 * s, y - 5 * s], L.beak); p.blob(x + 1 * s, y - 10 * s, 1 * s, 1 * s, '#fff'); return; }
  if (L.tail) p.curve(x - 6 * s, y + 6 * s, x - 18 * s, y + 4 * s, x - 14 * s, y - 8 * s, d, 2.4 * s);
  p.blob(x, y + 2 * s, 8 * s, 10 * s, c);
  p.blob(x, y + 4 * s, 5 * s, 6 * s, l, 0.6);
  p.blob(x, y - 9 * s, 7 * s, 6.5 * s, c);
  p.blob(x - 6 * s, y - 14 * s, 2.4 * s, 2.4 * s, d); p.blob(x + 6 * s, y - 14 * s, 2.4 * s, 2.4 * s, d);
  if (L.mask) { p.blob(x - 3 * s, y - 9 * s, 2.6 * s, 1.6 * s, L.mask, 0.9, -0.3); p.blob(x + 3 * s, y - 9 * s, 2.6 * s, 1.6 * s, L.mask, 0.9, 0.3); }
  if (L.spot) for (let i = 0; i < 9; i++) p.blob(x + (p.r() - 0.5) * 13 * s, y + (p.r() - 0.4) * 16 * s, 1.1 * s, 1 * s, L.spot, 0.8);
  p.blob(x - 2.6 * s, y - 9.5 * s, 1 * s, 1 * s, '#111'); p.blob(x + 2.6 * s, y - 9.5 * s, 1 * s, 1 * s, '#111');
  p.blob(x, y - 6 * s, 2.4 * s, 1.6 * s, l, 0.9);
}
function pParrot(p, x, y, s) {
  p.blob(x, y, 5 * s, 7 * s, '#4fc04a'); p.blob(x, y - 7 * s, 4.5 * s, 4.5 * s, '#ffb030');
  p.poly([x + 3 * s, y - 8 * s, x + 8 * s, y - 6 * s, x + 3 * s, y - 4 * s], '#3a2a20');
  p.blob(x + 1 * s, y - 8 * s, 0.9 * s, 0.9 * s, '#111');
  p.poly([x - 3 * s, y - 2 * s, x - 16 * s, y - 10 * s, x - 6 * s, y + 3 * s], '#3fb7ff'); p.poly([x - 1 * s, y - 1 * s, x - 13 * s, y - 14 * s, x - 3 * s, y + 1 * s], '#ff5a5a', 0.9);
  p.poly([x - 2 * s, y + 6 * s, x - 5 * s, y + 16 * s, x + 2 * s, y + 7 * s], '#2f8a3f');
}
function pKapok(p, x, base, h, col) {
  const trunk = col || '#7a5a3a';
  p.poly([x - 7, base - h, x + 7, base - h, x + 11, base, x - 11, base], trunk);
  p.poly([x - 11, base, x - 26, base, x - 8, base - 22], shade(trunk, -0.1)); p.poly([x + 11, base, x + 26, base, x + 8, base - 22], shade(trunk, -0.1));
  p.stroke([x - 2, base - h * 0.2, x - 1, base - h * 0.9], shade(trunk, 0.25), 1.2, 0.6);
  for (let i = 0; i < 26; i++) { const a = p.r() * Math.PI, rr = h * (0.3 + p.r() * 0.45); p.blob(x + Math.cos(a) * rr * 1.3 - 0, base - h - Math.sin(a) * rr * 0.45, 18 + p.r() * 16, 9 + p.r() * 8, ['#2f6a3a', '#3f8a44', '#5aa84e', '#24563a'][i % 4], 0.85); }
}
function pCup(p, x, y, s) {
  p.glow(x, y - 8 * s, 46 * s, 'rgba(255,230,140,0.9)', 0.9);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; p.stroke([x, y - 10 * s, x + Math.cos(a) * 60 * s, y - 10 * s + Math.sin(a) * 60 * s], '#fff3b0', 2.2 * s, 0.18); }
  p.blob(x, y + 18 * s, 14 * s, 3 * s, '#8a5a12');
  p.poly([x - 5 * s, y + 4 * s, x + 5 * s, y + 4 * s, x + 7 * s, y + 17 * s, x - 7 * s, y + 17 * s], '#d39a22');
  p.blob(x, y - 6 * s, 16 * s, 12 * s, '#e0a628'); p.blob(x - 4 * s, y - 10 * s, 7 * s, 6 * s, '#fff0a0', 0.55);
  p.blob(x, y - 16 * s, 16 * s, 3.4 * s, '#8a5a12'); p.blob(x, y - 16.5 * s, 14.5 * s, 2.4 * s, '#b8801c');
  for (let i = 0; i < 7; i++) p.leaf(x - 14 * s + i * 4.6 * s, y - 1 * s + (i % 2) * 3 * s, 9 * s, -1.2 + i * 0.4, i % 2 ? '#ffd24a' : '#f0b830', 0.95);
  p.curve(x - 15 * s, y - 12 * s, x - 26 * s, y - 6 * s, x - 13 * s, y + 2 * s, '#c8901e', 3 * s); p.curve(x + 15 * s, y - 12 * s, x + 26 * s, y - 6 * s, x + 13 * s, y + 2 * s, '#c8901e', 3 * s);
  for (let i = 0; i < NSPORTS; i++) p.blob(x - 14 * s + i * 4 * s, y - 20 * s - (i % 2) * 2 * s, 1.4 * s, 2.6 * s, SPORT_COLOURS[JC.sportOrder[i]], 0.95, (i - (NSPORTS - 1) / 2) * 0.15);
}
/* ---------- the panels (logical width 320, height LH between 180 and 320; ground near the bottom) ---------- */
const PANELS = {
  river(p) {
    const { LW, LH } = p, hz = LH * 0.5;
    p.sky([[0, '#f6c8a8'], [0.35, '#f7a8a0'], [0.6, '#c89ac8'], [1, '#7a8ac0']]);
    p.glow(LW * 0.7, hz - 20, 70, 'rgba(255,240,200,0.95)'); p.blob(LW * 0.7, hz - 18, 14, 14, '#fff6d8', 0.95);
    for (let i = 0; i < 4; i++) p.wash(LW * (0.15 + i * 0.25), LH * (0.15 + (i % 2) * 0.08), 40, 8, '#ffffff', 5, 0.18);
    p.wash(LW * 0.15, hz - 4, 80, 26, '#7a6a9a', 14, 0.35); p.wash(LW * 0.9, hz - 6, 70, 22, '#7a6a9a', 12, 0.35);
    p.wash(LW * 0.05, hz + 2, 60, 30, '#4a5a7a', 12, 0.5); p.wash(LW * 0.98, hz, 60, 26, '#4a5a7a', 12, 0.5);
    const w = p.g.createLinearGradient(0, hz, 0, LH); w.addColorStop(0, '#d8a8b8'); w.addColorStop(0.4, '#8aa0c8'); w.addColorStop(1, '#3a5a8a');
    p.g.fillStyle = w; p.g.fillRect(0, hz, LW, LH - hz);
    p.streaks(LW * 0.55, hz + 2, LW * 0.3, LH * 0.25, '#fff0d0', 40, 0.45);
    p.streaks(0, hz + 6, LW, LH * 0.5, '#d8e8ff', 50, 0.2);
    p.wash(LW * 0.5, hz + 4, LW * 0.5, 6, '#ffffff', 10, 0.12);
    for (const [bx, by] of [[0.25, 0.2], [0.29, 0.24], [0.33, 0.19]]) p.curve(LW * bx - 4, LH * by, LW * bx, LH * by - 3, LW * bx + 4, LH * by, '#4a3a5a', 0.9);
    for (let i = 0; i < 9; i++) p.leaf(-4 + p.r() * 30, LH - p.r() * LH * 0.45, 30 + p.r() * 20, -0.6 + p.r() * 0.9, ['#2a4a3a', '#3a6a44', '#24403a'][i % 3], 0.95);
    for (let i = 0; i < 9; i++) p.leaf(LW + 4 - p.r() * 30, LH - p.r() * LH * 0.45, -(30 + p.r() * 20), 0.6 - p.r() * 0.9, ['#2a4a3a', '#3a6a44', '#24403a'][i % 3], 0.95);
    const rx = LW * 0.46, ry = LH * 0.78;
    p.streaks(rx - 50, ry + 6, 100, 6, '#ffffff', 12, 0.35);
    pRaft(p, rx, ry, 90, SAVE.data.cos.flag === 'leaf' ? '#45c34e' : '#fff8e8');
    pCapy(p, rx - 6, ry - 18, 1.5, { hat: SAVE.data.cos.hat });
    p.finish();
  },
  isle(p) {
    const { LW, LH } = p, hz = LH * 0.56;
    p.sky([[0, '#8ad0f0'], [0.5, '#c8ecf0'], [0.75, '#fff0c8'], [1, '#f0d8a0']]);
    for (let i = 0; i < 5; i++) p.wash(LW * (0.1 + i * 0.2), LH * (0.12 + (i % 2) * 0.1), 36, 10, '#ffffff', 6, 0.35);
    p.wash(LW * 0.5, hz - 6, LW * 0.42, 22, '#5a9a5a', 26, 0.45);
    p.wash(LW * 0.5, hz - 2, LW * 0.5, 12, '#3f7a44', 22, 0.5);
    pKapok(p, LW * 0.56, hz - 6, LH * 0.34, '#8a6a48');
    for (let i = 0; i < NSPORTS; i++) { const ax = LW * (0.17 + i * 0.095), ay = hz - 4 + (i % 2) * 3; p.curve(ax - 4, ay, ax, ay - 8, ax + 4, ay, '#8a5a30', 1.4); p.blob(ax, ay - 7, 2.2, 1.6, SPORT_COLOURS[JC.sportOrder[i]], 0.95); }
    for (let i = 0; i < 6; i++) { const hx = LW * (0.38 + i * 0.05); p.poly([hx - 6, hz - 4, hx, hz - 12, hx + 6, hz - 4], '#c9a050', 0.9); }
    const w = p.g.createLinearGradient(0, hz, 0, LH); w.addColorStop(0, '#7ac8d0'); w.addColorStop(1, '#2a7aa0');
    p.g.fillStyle = w; p.g.fillRect(0, hz + 2, LW, LH - hz);
    p.wash(LW * 0.5, hz + 3, LW * 0.5, 4, '#f0e0a0', 18, 0.6);
    p.streaks(0, hz + 8, LW, LH - hz, '#e0fbff', 60, 0.3);
    const rx = LW * 0.8, ry = LH * 0.84;
    pRaft(p, rx, ry, 70, SAVE.data.cos.flag === 'leaf' ? '#45c34e' : '#fff8e8');
    pCapy(p, rx - 3, ry - 16, 1.25, { left: true, hat: SAVE.data.cos.hat, arm: true });
    for (let i = 0; i < 6; i++) p.leaf(-6, LH * (0.3 + i * 0.1), 36 + p.r() * 14, -0.4 + p.r() * 0.6, ['#2f6a3a', '#3f8a44'][i % 2], 0.95);
    p.finish('rgba(40,60,60,0.35)');
  },
  dock(p) {
    const { LW, LH } = p, hz = LH * 0.42;
    p.sky([[0, '#a8e0f8'], [0.6, '#e8f6e8'], [1, '#c8e8b0']]);
    p.wash(LW * 0.5, hz - 8, LW * 0.6, 30, '#3f8a44', 30, 0.5);
    for (let i = 0; i < 4; i++) p.leaf(LW * (0.1 + i * 0.28), hz - 30 - p.r() * 10, 40, -1.4 + p.r() * 0.6, '#2f6a3a', 0.8);
    const w = p.g.createLinearGradient(0, hz, 0, LH); w.addColorStop(0, '#6ac0d0'); w.addColorStop(1, '#2a6a98');
    p.g.fillStyle = w; p.g.fillRect(0, hz, LW, LH - hz);
    p.streaks(0, hz + 4, LW, LH - hz, '#e0fbff', 50, 0.3);
    // the dock: planks to the right, posts in the water
    const dy = LH * 0.7;
    p.poly([LW * 0.45, dy - 10, LW + 10, dy - 10, LW + 10, dy + 6, LW * 0.45, dy + 6], '#a8703e');
    for (let i = 0; i < 12; i++) p.stroke([LW * 0.45 + i * 16, dy - 10, LW * 0.45 + i * 16, dy + 6], '#7a4a24', 1);
    p.blob(LW * 0.72, dy - 10, LW * 0.28, 1.2, '#e0b070', 0.7);
    for (let i = 0; i < 5; i++) { const px = LW * 0.48 + i * 36; p.poly([px - 3, dy + 4, px + 3, dy + 4, px + 3, LH, px - 3, LH], '#6a4020'); }
    pCapy(p, LW * 0.6, dy - 26, 1.3, { left: true, bandana: '#ffd23f', noPack: true, fur: '#c08048', arm: true, wave: true });
    pCapy(p, LW * 0.85, dy - 25, 1.2, { left: true, bandana: '#3fb7ff', noPack: true, fur: '#9a6438', arm: true });
    pParrot(p, LW * 0.73, LH * 0.24, 1.6);
    const rx = LW * 0.26, ry = LH * 0.74;
    p.streaks(rx - 40, ry + 6, 80, 6, '#ffffff', 14, 0.45);
    pRaft(p, rx, ry, 84, SAVE.data.cos.flag === 'leaf' ? '#45c34e' : '#fff8e8');
    pCapy(p, rx - 2, ry - 18, 1.45, { hat: SAVE.data.cos.hat, arm: true });
    p.finish('rgba(30,50,40,0.35)');
  },
  lift(p) {
    const { LW, LH } = p;
    p.sky([[0, '#ffe6a0'], [0.4, '#a8d88a'], [1, '#2a5a3a']]);
    for (let i = 0; i < 6; i++) p.stroke([LW * (0.3 + i * 0.08), 0, LW * (0.2 + i * 0.1), LH], '#fff8c0', 10, 0.12);
    p.poly([LW * 0.38, 0, LW * 0.62, 0, LW * 0.66, LH, LW * 0.34, LH], '#7a5a3a');
    p.stroke([LW * 0.45, 0, LW * 0.44, LH], '#9a7a52', 3, 0.5); p.stroke([LW * 0.56, 0, LW * 0.58, LH], '#5e4028', 3, 0.5);
    for (let i = 0; i < 30; i++) p.leaf(p.r() * LW, p.r() * LH, 18 + p.r() * 22, p.r() * 6.3, ['#2f6a3a', '#3f8a44', '#5aa84e', '#7ac860'][i % 4], 0.85);
    for (const vx of [0.3, 0.7]) p.curve(LW * vx, 0, LW * vx + 6, LH * 0.5, LW * vx, LH, '#2a7a30', 2.4);
    const py = LH * 0.62;
    p.poly([LW * 0.22, py, LW * 0.78, py, LW * 0.74, py + 8, LW * 0.26, py + 8], '#a8703e');
    for (let i = 0; i < 6; i++) p.stroke([LW * (0.26 + i * 0.1), py, LW * (0.26 + i * 0.1), py + 8], '#7a4a24', 1);
    p.stroke([LW * 0.3, py, LW * 0.3, 0], '#2a7a30', 1.8); p.stroke([LW * 0.7, py, LW * 0.7, 0], '#2a7a30', 1.8);
    pCapy(p, LW * 0.5, py - 17, 1.7, { hat: SAVE.data.cos.hat, arm: true });
    for (let i = 0; i < 8; i++) p.blob(LW * (0.2 + p.r() * 0.6), py + 14 + p.r() * 30, 1.6, 1.6, '#fff8c0', 0.7);
    p.finish('rgba(20,40,20,0.4)');
  },
  stage(p) {
    const { LW, LH } = p, sy = LH * 0.72;
    p.sky([[0, '#5a3a8a'], [0.35, '#c2488e'], [0.65, '#ff9a6a'], [1, '#ffd27a']]);
    p.glow(LW * 0.5, sy - 10, 90, 'rgba(255,230,160,0.9)');
    for (let i = 0; i < 18; i++) p.blob(-10 + i * 20, sy - 4 - p.r() * 10, 18, 12, ['#2a4a3a', '#24563a', '#2f6a3a'][i % 3], 0.9);
    // garlands of flowers across the top
    p.curve(0, LH * 0.12, LW * 0.5, LH * 0.3, LW, LH * 0.12, '#2a7a30', 1.6);
    for (let i = 0; i < 15; i++) { const tt = i / 14, gx = LW * tt, gy = LH * 0.12 + Math.sin(tt * Math.PI) * LH * 0.09; p.blob(gx, gy, 3, 3, CONFETTI[i % 7], 0.95); }
    p.poly([0, sy, LW, sy, LW, LH, 0, LH], '#8a5a30');
    for (let i = 0; i < 16; i++) p.stroke([i * 22, sy, i * 22 - 8, LH], '#6a4020', 1, 0.6);
    p.blob(LW / 2, sy, LW / 2, 1.4, '#e0b070', 0.7);
    for (let i = 0; i < NSPORTS; i++) {
      const cx = LW * (0.065 + i * 0.124), cy = sy - 12 - (i % 2) * 3, s = 1.1;
      pCritter(p, ARCHES[JC.sportOrder[i]].champ, cx, cy, s);
      p.leaf(cx + 7 * s, cy - 18 * s, 12, -1.2, SPORT_COLOURS[JC.sportOrder[i]], 0.95);
    }
    pCapy(p, LW * 0.5, sy + (LH - sy) * 0.45, 1.6, { hat: SAVE.data.cos.hat, arm: true, wave: true });
    for (let i = 0; i < 40; i++) p.blob(p.r() * LW, p.r() * sy, 1.2, 2, CONFETTI[i % 8], 0.8, p.r() * 3);
    p.finish('rgba(50,20,50,0.4)');
  },
  cup(p) {
    const { LW, LH } = p;
    p.sky([[0, '#3a2a6e'], [0.5, '#8a3c94'], [1, '#ef8a6a']]);
    for (let i = 0; i < 30; i++) p.blob(p.r() * LW, p.r() * LH * 0.6, 0.8, 0.8, '#fff3a8', 0.8);
    const base = LH * 0.82;
    for (let i = 0; i < 12; i++) p.leaf(LW * 0.5, base, 40 + p.r() * 20, Math.PI + 0.3 + i * 0.22 + p.r() * 0.1, ['#2f6a3a', '#3f8a44', '#5aa84e'][i % 3], 0.95);
    p.blob(LW * 0.5, base, 40, 7, '#2a5a2a');
    pCup(p, LW * 0.5, base - 36, Math.min(1.8, LH / 120));
    p.finish('rgba(30,10,40,0.5)');
  },
};
function paintPanel(id, w, h) {
  const S = VIEW.S, c = canvas(w * S, h * S);
  const LW = 320, LH = Math.round(320 * h / w);
  try { PANELS[id](painter(c, LW, LH, 7 + id.length * 31)); } catch (e) { console.error(e); }
  return c;
}
/** Where the picture goes: the space above the text box (and below the Skip button), keeping 16:10 to 1:1. */
function storyFrame() {
  const f = STORY.frame, top = 6, bottom = VIEW.H - 64 - 8 - 16, availW = Math.min(VIEW.W - 12, 560), availH = Math.max(60, bottom - top);
  let w = availW, h = Math.round(w * 0.62);
  if (h > availH) { h = availH; w = Math.min(availW, Math.round(h / 0.62)); }
  if (VIEW.portrait) h = Math.min(availH, Math.round(w * 1.25));
  f.w = w; f.h = h; f.x = Math.round((VIEW.W - w) / 2); f.y = Math.round(top + (availH - h) / 2);
  return f;
}
/** A painted panel at the frame's size (painted once, then kept until the view changes). */
function panelFor(pid, f) { if (!STORY.cache[pid]) STORY.cache[pid] = paintPanel(pid, f.w, f.h); return STORY.cache[pid]; }
STORY.draw = function (g) {
  const id = STORY.line(); if (!id) return;
  if (STORY.gen !== VIEW.gen) { STORY.cache = {}; STORY.gen = VIEW.gen; }
  const f = storyFrame();
  g.fillStyle = '#1a1226'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  for (let i = 0; i < 24; i++) rect(g, (i * 97 + 13) % VIEW.W, (i * 61 + 7) % VIEW.H, 1, 1, '#3a2a50');
  // a soft cream mat round the picture
  rect(g, f.x - 4, f.y - 4, f.w + 8, f.h + 8, '#120c1c'); rect(g, f.x - 3, f.y - 3, f.w + 6, f.h + 6, '#f4e4bc'); rect(g, f.x - 1, f.y - 1, f.w + 2, f.h + 2, '#c8b088');
  if (STORY.prev && STORY.fade < 1) g.drawImage(panelFor(STORY.prev, f), f.x, f.y, f.w, f.h);
  g.globalAlpha = STORY.prev ? easeOut(STORY.fade) : 1;
  g.drawImage(panelFor(id, f), f.x, f.y, f.w, f.h);
  g.globalAlpha = 1;
  // Skip, top right
  const bh = Math.max(20, VIEW.tap), lbl = t('btn.skip'), bw = Math.max(bh * 1.6, textW(lbl) + 28);
  UI.button(g, 'skip', VIEW.W - bw - 4, 4, bw, bh, lbl, { col: '#5a4a7a', icon: UI.icons.play });
};
JC.storyLines = function (which) {
  if (which === 'finale') return [{ who: 'story', key: 'end.1', panel: 'lift' }, { who: 'story', key: 'end.2', panel: 'stage' }, { who: 'elder', key: 'end.3', panel: 'cup' }];
  return [{ who: 'story', key: 'story.1', panel: 'river' }, { who: 'story', key: 'story.2', panel: 'isle' }, { who: 'story', key: 'story.3', panel: 'dock' }];
};
/** Give Cappy a bandana he does not have yet (the Cup's gold one, the berry one for a first three-star round). */
JC.grantBandana = function (id, wear, quiet) {
  const c = SAVE.data.cos;
  if (!BANDANAS[id] || c.own.includes(id)) return false;
  c.own.push(id); if (wear) { c.bandana = id; JC.refreshCappy(); }
  if (!quiet) { UI.banner(t('quest.reward.bandana'), BANDANAS[id], 2.2); AUDIO.sfx('pickup'); }
  return true;
};
