// ======================================================================================================
// UI: buttons (touch, mouse and keys), wooden cards, HUD bars, the star bar, floating score text, particles,
// a banner, and the typewriter text box. All drawn on the canvas in virtual pixels.
// Buttons: call JC.ui.button(g, id, x, y, w, h, label, opts) while drawing; a tap on it, or A while it has the
// keyboard focus, calls the scene's onButton(id). Arrow keys move the focus between the buttons drawn last frame.
// ======================================================================================================
const UI = { hits: [], n: 0, prevN: 0, prev: [], focus: 0, focusScope: '', pressId: '', pressT: 0, showFocus: false };
JC.ui = UI;
for (let i = 0; i < 64; i++) { UI.hits.push({ id: '', x: 0, y: 0, w: 0, h: 0 }); UI.prev.push({ id: '', x: 0, y: 0, w: 0, h: 0 }); }
UI.beginFrame = function () { UI.n = 0; };
/** After drawing: the buttons of the finished frame are what taps and the focus use (UI.prev). */
UI.endFrame = function () {
  for (let i = 0; i < UI.n; i++) { const a = UI.prev[i], b = UI.hits[i]; a.id = b.id; a.x = b.x; a.y = b.y; a.w = b.w; a.h = b.h; }
  UI.prevN = UI.n;
  if (UI.focus >= UI.prevN) UI.focus = Math.max(0, UI.prevN - 1);
};
UI.hitAt = function (x, y) {
  for (let i = UI.prevN - 1; i >= 0; i--) { const h = UI.prev[i]; if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.id; }
  return '';
};
UI.focusedId = () => (UI.prevN ? UI.prev[Math.min(UI.focus, UI.prevN - 1)].id : '');
UI.setFocus = function (id) { for (let i = 0; i < UI.prevN; i++) if (UI.prev[i].id === id) { UI.focus = i; return; } UI.wantFocus = id; };
/** Move the keyboard focus to the nearest button in a direction. */
UI.moveFocus = function (dir) {
  if (!UI.prevN) return;
  UI.showFocus = true;
  const cur = UI.prev[Math.min(UI.focus, UI.prevN - 1)], cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
  let best = -1, bestD = 1e9;
  for (let i = 0; i < UI.prevN; i++) {
    if (i === UI.focus) continue;
    const h = UI.prev[i], dx = h.x + h.w / 2 - cx, dy = h.y + h.h / 2 - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 2) continue;
    const d = along + across * 2.5;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) { // wrap through the list order
    best = (dir === 'down' || dir === 'right') ? (UI.focus + 1) % UI.prevN : (UI.focus - 1 + UI.prevN) % UI.prevN;
  }
  UI.focus = best; AUDIO.sfx('blip');
};
/** Standard menu input: arrows move the focus, A presses it, a tap presses what is under it. Returns the id or ''. */
UI.menuInput = function (e) {
  if (e.type === 'press' && (e.key === 'left' || e.key === 'right' || e.key === 'up' || e.key === 'down')) { UI.moveFocus(e.key); return ''; }
  if (e.type === 'press' && e.key === 'a') { UI.showFocus = true; const id = UI.focusedId(); if (id) { UI.pressId = id; UI.pressT = 0.12; } return id; }
  if (e.type === 'down') { const id = UI.hitAt(e.x, e.y); if (id) { UI.pressId = id; UI.pressT = 0.2; } UI.showFocus = false; return ''; }
  if (e.type === 'tap') { const id = UI.hitAt(e.x, e.y); if (id) { UI.setFocus(id); UI.pressT = 0.1; } return id; }
  return '';
};
function addHit(id, x, y, w, h) {
  if (UI.n >= UI.hits.length) return;
  const r = UI.hits[UI.n++]; r.id = id; r.x = x; r.y = y; r.w = w; r.h = h;
  if (UI.wantFocus === id) { UI.focus = UI.n - 1; UI.wantFocus = ''; }
}
UI.addHit = addHit;
/* A chunky button. opts: { col (fill), tcol (text), icon (a function(g, cx, cy)), small, disabled, glow } */
UI.button = function (g, id, x, y, w, h, label, opts) {
  const o = opts || NOOPT;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (!o.disabled) addHit(id, x, y, w, h);
  const focused = UI.showFocus && UI.prevN && UI.prev[Math.min(UI.focus, UI.prevN - 1)].id === id && !o.disabled;
  const down = UI.pressT > 0 && UI.pressId === id;
  const fill = o.disabled ? '#7a7488' : o.col || PAL.r3, dy = down ? 1 : 0;
  if (focused || o.glow) { rect(g, x - 2, y - 2 + dy, w + 4, h + 4, focused ? PAL.r5 : shade(fill, 0.5)); }
  rect(g, x + 1, y + 2, w - 2, h - 1, PAL.ink);                    // drop shadow
  box(g, x, y + dy, w, h - 2, PAL.ink, PAL.ink);
  rect(g, x + 1, y + 1 + dy, w - 2, h - 4, shade(fill, -0.3));      // dark base
  rect(g, x + 1, y + 1 + dy, w - 2, h - 6, fill);                   // face
  rect(g, x + 2, y + 1 + dy, w - 4, 1, shade(fill, 0.45));          // shine
  const cy = y + dy + ((h - 4) >> 1), sc = o.scale || 1;
  let tx = x + w / 2, room = w - 8;
  const lw = label ? textW(label, sc) : 0;
  if (o.icon) {
    if (!label) o.icon(g, x + w / 2, cy);
    else if (lw + 22 <= w) { o.icon(g, x + 4 + 6, cy); tx = x + 14 + (w - 14) / 2; room = w - 22; }
  }
  if (!label) return;
  const opt = BTN_TEXT; opt.col = o.tcol || PAL.white; opt.scale = sc; opt.maxW = 0;
  if (lw <= room) { text(g, label, tx, cy - 6 * sc, opt); return; }
  if (h < 26 || wrap(label, w - 6, sc).length > 2) { if (o.icon && lw + 22 > w) { tx = x + w / 2; room = w - 6; } opt.maxW = room; text(g, label, tx, cy - 6 * sc, opt); return; }
  // too long for one line: two lines
  const lines = wrap(label, w - 6, sc);
  const n = Math.min(2, lines.length), top = cy - (n * 10) / 2 - 1;
  opt.maxW = w - 4;
  for (let i = 0; i < n; i++) text(g, lines[i], x + w / 2, top + i * 10, opt);
};
const BTN_TEXT = { align: 'center', col: '#fff', edge: '#1b1325', scale: 1 };
/* A round icon button (pause, map, sound): the tap area is at least VIEW.tap. */
UI.iconButton = function (g, id, cx, cy, icon, opts) {
  const o = opts || NOOPT, r = Math.max(9, (VIEW.tap / 2) | 0), x = Math.round(cx - r), y = Math.round(cy - r);
  addHit(id, x, y, r * 2, r * 2);
  const focused = UI.showFocus && UI.prevN && UI.prev[Math.min(UI.focus, UI.prevN - 1)].id === id;
  const down = UI.pressT > 0 && UI.pressId === id;
  const ir = Math.min(r - 1, 12);
  disc(g, cx, cy + 1, ir + 1, PAL.ink);
  if (focused) disc(g, cx, cy, ir + 2, PAL.r5);
  disc(g, cx, cy + (down ? 1 : 0), ir + 1, PAL.ink);
  disc(g, cx, cy + (down ? 1 : 0), ir, o.col || '#5b3a24');
  disc(g, cx, cy - 1 + (down ? 1 : 0), ir - 2, shade(o.col || '#5b3a24', 0.18));
  icon(g, cx, cy + (down ? 1 : 0));
};
/* Icons (centred on cx, cy). */
UI.icons = {
  pause(g, cx, cy) { rect(g, cx - 4, cy - 4, 3, 9, PAL.white); rect(g, cx + 1, cy - 4, 3, 9, PAL.white); },
  map(g, cx, cy) { rect(g, cx - 5, cy - 4, 10, 9, PAL.cream); rect(g, cx - 2, cy - 4, 1, 9, '#c9a66b'); rect(g, cx + 1, cy - 4, 1, 9, '#c9a66b'); rect(g, cx - 4, cy - 1, 3, 2, PAL.g3); rect(g, cx + 2, cy + 1, 2, 2, PAL.r2); },
  gear(g, cx, cy) { disc(g, cx, cy, 4, PAL.white); rect(g, cx - 1, cy - 6, 3, 12, PAL.white); rect(g, cx - 6, cy - 1, 12, 3, PAL.white); disc(g, cx, cy, 1, '#5b3a24'); },
  play(g, cx, cy) { for (let i = 0; i < 9; i++) rect(g, cx - 3 + (i > 4 ? 0 : 0), cy - 4 + i, Math.max(1, 5 - Math.abs(4 - i)) + 1, 1, PAL.white); },
  back(g, cx, cy) { for (let i = 0; i < 4; i++) rect(g, cx - 4 + i, cy - i, 1, i * 2 + 1, PAL.white); rect(g, cx - 1, cy - 1, 6, 3, PAL.white); },
  retry(g, cx, cy) { line(g, cx - 4, cy - 2, cx - 4, cy + 2, PAL.white); line(g, cx - 3, cy - 4, cx + 3, cy - 4, PAL.white); line(g, cx + 4, cy - 3, cx + 4, cy + 2, PAL.white); line(g, cx - 3, cy + 3, cx + 3, cy + 3, PAL.white); rect(g, cx - 6, cy - 1, 5, 1, PAL.white); rect(g, cx - 5, cy, 3, 1, PAL.white); },
  sound(g, cx, cy) { rect(g, cx - 5, cy - 2, 3, 5, PAL.white); for (let i = 0; i < 4; i++) rect(g, cx - 2 + i, cy - 2 - i, 1, 5 + i * 2, PAL.white); if (!AUDIO.muted) { rect(g, cx + 4, cy - 2, 1, 5, PAL.white); rect(g, cx + 6, cy - 4, 1, 9, PAL.white); } else { line(g, cx + 3, cy - 3, cx + 7, cy + 3, PAL.r2); line(g, cx + 7, cy - 3, cx + 3, cy + 3, PAL.r2); } },
  close(g, cx, cy) { line(g, cx - 3, cy - 3, cx + 3, cy + 3, PAL.white); line(g, cx + 3, cy - 3, cx - 3, cy + 3, PAL.white); line(g, cx - 2, cy - 3, cx + 4, cy + 3, PAL.white); line(g, cx + 4, cy - 3, cx - 2, cy + 3, PAL.white); },
};
/* A wooden card with paper inside and leaves on its corners. Returns the inner rect (reused object). */
const CARD_IN = { x: 0, y: 0, w: 0, h: 0 };
UI.card = function (g, x, y, w, h, paper) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(g, x + 2, y + 3, w, h, 'rgba(0,0,0,0.35)');
  box(g, x, y, w, h, '#7a4a26', PAL.ink);
  rect(g, x + 1, y + 1, w - 2, 1, '#b07a44'); rect(g, x + 1, y + h - 3, w - 2, 2, '#4f2e17');
  for (let i = x + 8; i < x + w - 8; i += 14) rect(g, i, y + 2, 1, 2, '#5e3820');
  box(g, x + 4, y + 4, w - 8, h - 8, paper || PAL.cream, '#4f2e17');
  rect(g, x + 5, y + 5, w - 10, 1, '#fffbe9');
  const L = SPRITES.leaf; if (L) { spr(g, L, x - 2, y - 2); spr(g, L, x + w - 4, y - 2, true); }
  CARD_IN.x = x + 7; CARD_IN.y = y + 7; CARD_IN.w = w - 14; CARD_IN.h = h - 14;
  return CARD_IN;
};
/* A HUD bar: outline, dark well, fill with a shine; ticks every `ticks` (optional). */
UI.bar = function (g, x, y, w, h, frac, col, ticks) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  box(g, x, y, w, h, '#2a2238', PAL.ink);
  const fw = Math.round((w - 2) * clamp(frac, 0, 1));
  if (fw > 0) { rect(g, x + 1, y + 1, fw, h - 2, col); rect(g, x + 1, y + 1, fw, 1, shade(col, 0.5)); rect(g, x + 1, y + h - 2, fw, 1, shade(col, -0.3)); }
  if (ticks) for (let i = 1; i < ticks; i++) rect(g, x + Math.round((w * i) / ticks), y + 1, 1, h - 2, 'rgba(27,19,37,0.5)');
  rect(g, x + 1, y, w - 2, 1, PAL.ink);
};
/* The star bar: a bar filling to `frac` with three stars at the thresholds (0-1). */
UI.starBar = function (g, x, y, w, frac, marks, stars) {
  UI.bar(g, x, y + 3, w, 7, frac, PAL.gold2);
  for (let i = 0; i < 3; i++) {
    const mx = x + Math.round(w * (marks ? marks[i] : (i + 1) / 3));
    spr(g, i < stars ? SPRITES.star_on : SPRITES.star_off, mx - 4, y);
  }
};
/* Floating score text (a pool: no new objects while playing). */
const FLOATS = []; for (let i = 0; i < 24; i++) FLOATS.push({ on: false, x: 0, y: 0, vy: 0, life: 0, str: '', col: '', scale: 1, w: 0 });
const FOPT = { align: 'center', col: '', scale: 1 }, BOPT = { align: 'center', col: '', scale: 1 };
UI.float = function (x, y, str, col, scale) {
  // a newer word on the same spot pushes the older ones up, so "Perfect!" and "Good!" never sit on top of each other
  for (let i = 0; i < FLOATS.length; i++) { const o = FLOATS[i]; if (o.on && Math.abs(o.x - x) < 50 && o.y > y - 12 && o.y < y + 12) o.y = y - 12; }
  let f = FLOATS[0]; for (let i = 0; i < FLOATS.length; i++) if (!FLOATS[i].on) { f = FLOATS[i]; break; }
  f.on = true; f.x = x; f.y = y; f.vy = -26; f.life = 1; f.str = str; f.col = col || PAL.white; f.scale = scale || 1;
  f.w = textW(str, f.scale) + 2;   // measured once, so the float can be kept inside the screen
};
/* Particles: confetti, sparks, splashes. */
const PARTS = []; for (let i = 0; i < 240; i++) PARTS.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '', s: 1, grav: 0 });
UI.particle = function (x, y, vx, vy, col, life, size, grav) {
  for (let i = 0; i < PARTS.length; i++) { const p = PARTS[i]; if (p.on) continue; p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.col = col; p.life = p.max = life || 1; p.s = size || 1; p.grav = grav === undefined ? 120 : grav; return p; }
  return null;
};
const CONFETTI = ['#ff9b2e', '#6ad34a', '#ff5a5a', '#3fb7ff', '#b06cff', '#ffd23f', '#ff6fb5', '#fff8e8'];
UI.confetti = function (x, y, n) {
  if (BRBX.reduced()) n = Math.min(n, 10);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 110; UI.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 60, CONFETTI[i % CONFETTI.length], 1.2 + Math.random() * 0.8, 2, 140); }
};
UI.burst = function (x, y, n, col, speed) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (speed || 50) * (0.4 + Math.random() * 0.8); UI.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, col, 0.35 + Math.random() * 0.3, 1 + (Math.random() < 0.4 ? 1 : 0), 40); }
};
UI.clearFx = function () { for (const p of PARTS) p.on = false; for (const f of FLOATS) f.on = false; UI.bannerT = 0; };
/* A big banner across the middle ("GO!", "Feather won!"). */
UI.bannerStr = ''; UI.bannerT = 0; UI.bannerCol = PAL.r4; UI.bannerMax = 1; UI.bannerY = 0.38;
/** A banner: the words, their colour, how long, and how far down the screen (0-1, 0.38 by default). */
UI.banner = function (str, col, secs, y) { UI.bannerStr = str; UI.bannerCol = col || PAL.r4; UI.bannerT = UI.bannerMax = secs || 1.4; UI.bannerY = y || 0.38; };
UI.update = function (dt) {
  if (UI.pressT > 0) UI.pressT -= dt;
  for (let i = 0; i < FLOATS.length; i++) { const f = FLOATS[i]; if (!f.on) continue; f.y += f.vy * dt; f.vy *= 0.94; f.life -= dt * 0.9; if (f.life <= 0) f.on = false; }
  for (let i = 0; i < PARTS.length; i++) { const p = PARTS[i]; if (!p.on) continue; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.life -= dt; if (p.life <= 0) p.on = false; }
  if (UI.bannerT > 0) UI.bannerT -= dt;
};
UI.drawFx = function (g) {
  for (let i = 0; i < PARTS.length; i++) { const p = PARTS[i]; if (!p.on) continue; g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  for (let i = 0; i < FLOATS.length; i++) {
    const f = FLOATS[i]; if (!f.on) continue;
    // never past the screen's edges (4 px in)
    const hw = f.w / 2, x = hw * 2 > VIEW.W - 8 ? VIEW.W / 2 : clamp(f.x, 4 + hw, VIEW.W - 4 - hw);
    g.globalAlpha = clamp(f.life * 2, 0, 1); FOPT.col = f.col; FOPT.scale = f.scale; text(g, f.str, x, f.y, FOPT); g.globalAlpha = 1;
  }
  if (UI.bannerT > 0 && UI.bannerStr) {
    const k = 1 - UI.bannerT / UI.bannerMax, sc = VIEW.W < 260 ? 2 : 3;
    // it slides in from the right (still, with reduced motion)
    const pop = k < 0.15 && !BRBX.reduced() ? easeOutBack(k / 0.15) : 1, cy = Math.round(VIEW.H * UI.bannerY);
    g.globalAlpha = UI.bannerT < 0.25 ? UI.bannerT / 0.25 : 1;
    rect(g, 0, cy - 4, VIEW.W, 12 * sc + 6, 'rgba(27,19,37,0.55)');
    const w = textW(UI.bannerStr, sc);
    const s2 = w <= VIEW.W - 12 ? sc : textW(UI.bannerStr, sc - 0.5) <= VIEW.W - 12 ? sc - 0.5 : Math.max(1, sc - 1);
    BOPT.col = UI.bannerCol; BOPT.scale = s2;
    text(g, UI.bannerStr, VIEW.W / 2 + (1 - pop) * VIEW.W * 0.5, cy, BOPT);
    g.globalAlpha = 1;
  }
};
