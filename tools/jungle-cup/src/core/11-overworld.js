// ======================================================================================================
// OVERWORLD: Cappy walks Delta Isle tile by tile (a short step animation), talks to people, picks things up, and
// steps into an arch to play its sport. Touch: the D-pad (bottom left) and A (bottom right); keys: arrows / WASD and
// Space; the map button opens the map (fast travel, settings, controls).
// ======================================================================================================
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const P = { x: 36, y: 62, px: 0, py: 0, fx: 0, fy: 0, dir: 'up', moving: false, t: 0, step: 0.15, walk: 0, bump: 0, hop: 0 };
JC.player = P;
const CAM = { x: 0, y: 0 };
const OW = { name: 'world', time: 0, water: 0, prompt: null, promptT: 0, celebrate: null, steps: 0, padPtr: -1, padDir: '', aPtr: -1, wantArch: '' };
JC.overworld = OW;
JC.refreshCappy = function () { const c = SAVE.data.cos; buildCappy('cappy', BANDANAS[c.bandana] || BANDANAS.green); };
function placePlayer(x, y, d) { P.x = x; P.y = y; P.px = x * TS; P.py = y * TS; P.dir = d || P.dir; P.moving = false; P.t = 0; }
JC.placePlayer = placePlayer;
OW.enter = function (opts) {
  JC.audioWant = 'island';
  if (opts && opts.at) placePlayer(opts.at[0], opts.at[1], opts.at[2]);
  OW.celebrate = opts && opts.celebrate ? { id: opts.celebrate, t: 0 } : null;
  if (OW.celebrate) { AUDIO.sfx('fanfare'); UI.confetti(VIEW.W / 2, VIEW.H / 3, 60); UI.banner(t('feather.won'), SPORT_COLOURS[OW.celebrate.id], 2.4); }
  OW.camSnap = true;
  if (opts && opts.intro) JC.say([{ who: 'story', key: 'story.1' }, { who: 'story', key: 'story.2' }, { who: 'coco', key: 'd.coco.hi' }, { who: 'pip', key: 'd.pip.hi0' }]);
};
function npcAt(x, y) { for (const n of WORLD.npcs) if (n.x === x && n.y === y) return n; return null; }
function itemAt(x, y) { for (const it of WORLD.items) if (it.x === x && it.y === y && JC.questVisible(it)) return it; return null; }
function signAt(x, y) { for (const s of WORLD.signs) if (s.x === x && s.y === y) return s; return null; }
function archHere() { for (const id in ARCHES) { const a = ARCHES[id]; if (a.x === P.x && a.y === P.y) return id; } return ''; }
function tryStep(dir) {
  P.dir = dir;
  const nx = P.x + DIRS[dir][0], ny = P.y + DIRS[dir][1];
  const it = itemAt(nx, ny); if (it) { pickItem(it); }
  if (WORLD.isSolid(nx, ny)) { if (P.bump <= 0) { AUDIO.sfx('bonk'); P.bump = 0.35; } return false; }
  P.moving = true; P.t = 0; P.fx = P.x; P.fy = P.y; P.x = nx; P.y = ny; P.walk++;
  OW.steps++;
  if ((P.walk & 1) === 0) AUDIO.sfx('step');
  SAVE.data.pos.x = nx; SAVE.data.pos.y = ny; SAVE.data.pos.d = dir; SAVE.soon();
  return true;
}
JC.tryStep = tryStep;
/** Act on what Cappy faces: talk, read, ride the lift, or play the sport whose arch he stands in. */
function act() {
  if (TB.open) { TB.advance(); return; }
  const arch = archHere(); if (arch) { JC.playSport(arch); return; }
  const fx = P.x + DIRS[P.dir][0], fy = P.y + DIRS[P.dir][1];
  const n = npcAt(fx, fy);
  if (n) {
    // face each other
    n.face = P.dir === 'up' ? 'down' : P.dir === 'down' ? 'up' : P.dir === 'left' ? 'right' : 'left';
    const lines = talkLines(n);
    if (lines.length) JC.say(lines, () => { SAVE.write(); if (n.id === 'coco') SAVE.data.flags.metCoco = 1; });
    return;
  }
  const s = signAt(fx, fy); if (s) { JC.say([{ who: 'sign', key: s.key }]); return; }
  if (fx === WORLD.lift.x && fy === WORLD.lift.y) {
    const f = SAVE.featherCount();
    if (f >= 7) JC.say([{ who: 'lift', key: 'lift.open' }], () => JC.go('finale'));
    else JC.say([{ who: 'lift', key: 'lift.locked', vars: { n: f } }]);
    return;
  }
  const it = itemAt(fx, fy); if (it) pickItem(it);
}
JC.act = act;
/* ---------- touch controls (virtual pixels) ---------- */
const PAD = { cx: 0, cy: 0, r: 0, ax: 0, ay: 0, ar: 0 };
function layoutPad() {
  PAD.r = Math.max(26, Math.round(VIEW.tap * 1.25)); PAD.ar = Math.max(17, Math.round(VIEW.tap * 0.75));
  PAD.cx = PAD.r + 10; PAD.cy = VIEW.H - PAD.r - 10;
  PAD.ax = VIEW.W - PAD.ar - 14; PAD.ay = VIEW.H - PAD.ar - 16;
}
function padDirAt(x, y) {
  const dx = x - PAD.cx, dy = y - PAD.cy;
  if (dx * dx + dy * dy < 16) return '';
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
function setPadDir(d) {
  if (OW.padDir === d) return;
  if (OW.padDir) INPUT.touchKey(OW.padDir, false);
  OW.padDir = d; if (d) INPUT.touchKey(d, true);
}
OW.onInput = function (e) {
  if (TB.input(e)) { if (e.type === 'down') UI.menuInput(e); return; }
  if (e.type === 'press' && e.key === 'a') { act(); return; }
  if (e.type === 'press' && (e.key === 'b' || e.key === 'pause')) { JC.go('map'); return; }
  const touch = INPUT.showTouch();
  if (e.type === 'down') {
    const hit = UI.hitAt(e.x, e.y);
    if (hit) { UI.menuInput(e); OW.btnDown = hit; return; }
    if (touch && Math.hypot(e.x - PAD.cx, e.y - PAD.cy) < PAD.r * 1.5) { OW.padPtr = e.id; setPadDir(padDirAt(e.x, e.y)); return; }
    if (touch && Math.hypot(e.x - PAD.ax, e.y - PAD.ay) < PAD.ar * 1.5) { OW.aPtr = e.id; act(); return; }
  } else if (e.type === 'move') {
    if (e.id === OW.padPtr) setPadDir(padDirAt(e.x, e.y));
  } else if (e.type === 'up') {
    if (e.id === OW.padPtr) { OW.padPtr = -1; setPadDir(''); }
    if (e.id === OW.aPtr) OW.aPtr = -1;
  } else if (e.type === 'tap') {
    const hit = UI.hitAt(e.x, e.y);
    if (hit === 'map') { AUDIO.sfx('select'); JC.go('map'); }
    else if (hit === 'prompt') act();
  }
};
OW.leave = function () { OW.padPtr = -1; setPadDir(''); INPUT.releaseTouch(); };
OW.update = function (dt) {
  OW.time += dt; OW.water += dt;
  if (P.bump > 0) P.bump -= dt;
  TB.update(dt);
  for (const n of WORLD.npcs) n.t += dt;
  if (P.moving) {
    P.t += dt / P.step;
    if (P.t >= 1) { P.moving = false; P.t = 0; }
  }
  if (!P.moving && !TB.open && !JC.fading()) {
    const dx = INPUT.dirX(), dy = INPUT.dirY();
    if (dx || dy) tryStep(dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  const k = P.moving ? easeOut(P.t) : 1;
  P.px = Math.round(lerp(P.moving ? P.fx * TS : P.x * TS, P.x * TS, k));
  P.py = Math.round(lerp(P.moving ? P.fy * TS : P.y * TS, P.y * TS, k));
  P.hop = P.moving ? Math.round(Math.sin(P.t * Math.PI) * 2) : 0;
  // the camera follows (integer pixels)
  const tx = clamp(P.px + 8 - VIEW.W / 2, 0, MW * TS - VIEW.W), ty = clamp(P.py + 8 - VIEW.H / 2 - 10, 0, MH * TS - VIEW.H);
  if (OW.camSnap) { CAM.x = tx; CAM.y = ty; OW.camSnap = false; }
  CAM.x += (tx - CAM.x) * Math.min(1, dt * 10); CAM.y += (ty - CAM.y) * Math.min(1, dt * 10);
  if (Math.abs(tx - CAM.x) < 0.5) CAM.x = tx; if (Math.abs(ty - CAM.y) < 0.5) CAM.y = ty;
  // the arch prompt
  const arch = archHere();
  OW.prompt = arch && !P.moving ? arch : '';
  if (OW.celebrate) { OW.celebrate.t += dt; if (OW.celebrate.t > 4) OW.celebrate = null; }
};
/* ---------- drawing ---------- */
const DRAWLIST = []; for (let i = 0; i < 64; i++) DRAWLIST.push({ y: 0, kind: 0, ref: null, x: 0 });
let DRAWN = 0;
function queue(kind, ref, x, y) { if (DRAWN >= DRAWLIST.length) return; const d = DRAWLIST[DRAWN++]; d.kind = kind; d.ref = ref; d.x = x; d.y = y; }
function sortQueue() { // insertion sort (tiny list, no allocation)
  for (let i = 1; i < DRAWN; i++) { const a = DRAWLIST[i]; let j = i - 1; while (j >= 0 && DRAWLIST[j].y > a.y) { DRAWLIST[j + 1] = DRAWLIST[j]; j--; } DRAWLIST[j + 1] = a; }
}
function drawCappy(g, x, y, dir, walk, hop) {
  const flip = dir === 'left', d = dir === 'left' ? 'right' : dir;
  const s = SPRITES[`cappy_${d}${walk ? '_w' : ''}`];
  shadow(g, x + 8, y + 15, 6);
  spr(g, s, x, y - hop, flip);
  const c = SAVE.data.cos;
  if (c.hat) { const h = SPRITES['hat_' + c.hat]; if (h) spr(g, h, x + 1 + (d === 'right' ? (flip ? -2 : 2) : 0), y - 2 - hop, flip); }
}
JC.drawCappy = drawCappy;
function drawNpc(g, n, x, y) {
  const s = SPRITES[n.spr]; if (!s) return;
  const bob = ((n.t * 2) | 0) % 2;
  const flip = n.face === 'left';
  if (n.fly) {
    const hy = Math.round(Math.sin(n.t * 3) * 3);
    shadow(g, x + 8, y + 15, 4);
    spr(g, ((n.t * 12) | 0) % 2 ? SPRITES.zuzu2 : s, x + 3, y - 2 + hy, flip);
    return;
  }
  if (n.many) {
    for (let i = 0; i < n.many; i++) {
      const ox = n.spr === 'ant' ? (i - 1) * 6 : i * 9 - 4, oy = n.spr === 'ant' ? (i % 2) * 4 + 4 : 2;
      const ss = n.spr === 'ant' && ((n.t * 4 + i) | 0) % 2 ? SPRITES.ant2 : s;
      shadow(g, x + ox + (ss.w >> 1) + 3, y + 15, 3); spr(g, ss, x + ox + 3, y + oy + 16 - ss.h - (bob && i === 1 ? 1 : 0), i === 1);
    }
    return;
  }
  shadow(g, x + 8, y + 15, 6);
  spr(g, s, x + ((16 - s.w) >> 1), y + 16 - s.h - (n.bob || n.sport ? bob : 0), flip);
  if (n.sport && SAVE.data.feathers[n.sport]) { const f = featherSprite(SPORT_COLOURS[n.sport]); spr(g, f, x + 12, y - 4); }
}
function drawRaft(g, x, y) {
  const bob = Math.round(Math.sin(OW.time * 2) * 1);
  y += bob;
  rect(g, x - 2, y + 5, 36, 10, OUT);
  for (let i = 0; i < 6; i++) { rect(g, x - 1 + i * 6, y + 6, 5, 8, i % 2 ? '#a8703e' : '#c48a4c'); rect(g, x - 1 + i * 6, y + 6, 5, 1, '#e0b070'); }
  rect(g, x + 2, y + 8, 28, 1, '#5e3820'); rect(g, x + 2, y + 12, 28, 1, '#5e3820');
  rect(g, x + 14, y - 16, 2, 22, '#5e3820');
  const fl = SAVE.data.cos.flag;
  const fc = fl === 'leaf' ? '#45c34e' : '#fff8e8';
  rect(g, x + 16, y - 16, 10, 7, OUT); rect(g, x + 16, y - 15, 9, 5, fc);
  if (fl === 'leaf') { rect(g, x + 19, y - 14, 3, 3, '#ffd23f'); } else rect(g, x + 18, y - 13, 5, 1, '#e04848');
}
function drawLift(g, x, y) {
  const open = SAVE.featherCount() >= 7;
  // the vines up the trunk
  for (const dx of [2, 13]) for (let i = 0; i < 40; i++) rect(g, x + dx + Math.round(Math.sin((i + OW.time * (open ? 6 : 0)) / 4)), y - 40 + i, 1, 1, i % 5 ? '#2a7a30' : '#8ee070');
  rect(g, x - 1, y + 4, 18, 9, OUT); rect(g, x, y + 5, 16, 6, '#b07a44'); rect(g, x, y + 5, 16, 1, '#e0b070'); rect(g, x, y + 10, 16, 1, '#5e3820');
  if (!open) {
    // a knot of vines with an empty feather badge
    rect(g, x + 1, y + 2, 14, 2, '#2a7a30'); rect(g, x + 6, y, 4, 6, '#3d9a2e');
    text(g, label('lift.n', SAVE.featherCount()), x + 8, y - 12, { align: 'center', col: PAL.white, edge: PAL.ink });
  } else if (((OW.time * 3) | 0) % 2) spr(g, SPRITES.sparkle, x + 5, y - 6);
}
function drawTotemSockets(g, ox, oy) {
  const sk = totemSockets();
  for (let i = 0; i < 7; i++) {
    const id = JC.sportOrder[i], s = sk[i], x = s.x - ox, y = s.y - oy;
    const lit = SAVE.data.feathers[id], fresh = OW.celebrate && OW.celebrate.id === id;
    if (fresh && OW.celebrate.t < 1.5) {
      // the new feather flies into its socket
      const k = easeOut(clamp(OW.celebrate.t / 1.5, 0, 1));
      const fx = lerp(VIEW.W / 2, x, k), fy = lerp(VIEW.H / 2, y - 8, k);
      spr(g, featherSprite(SPORT_COLOURS[id]), fx - 3, fy - 5);
      if (((OW.celebrate.t * 20) | 0) % 3 === 0) UI.particle(fx + ox - CAM.x, fy, (Math.random() - 0.5) * 30, -10, SPORT_COLOURS[id], 0.5, 1, 20);
      disc(g, x, y, 3, OUT); disc(g, x, y, 2, '#3b2416');
      continue;
    }
    disc(g, x, y, 3, OUT);
    if (lit) {
      if (fresh) { const r = 4 + Math.round(Math.sin(OW.celebrate.t * 8) * 1.5); g.globalAlpha = 0.5; disc(g, x, y - 4, r + 3, SPORT_COLOURS[id]); g.globalAlpha = 1; }
      disc(g, x, y, 2, SPORT_COLOURS[id]); spr(g, featherSprite(SPORT_COLOURS[id]), x - 3, y - 10);
    } else disc(g, x, y, 2, '#3b2416');
  }
}
OW.draw = function (g) {
  const cx = Math.round(CAM.x), cy = Math.round(CAM.y);
  const frame = ((OW.water * 2) | 0) % 2;
  g.fillStyle = '#1f62a0'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  const sw = Math.min(VIEW.W, MW * TS - cx), sh = Math.min(VIEW.H, MH * TS - cy);
  g.drawImage(WORLD.ground[frame], cx, cy, sw, sh, 0, 0, sw, sh);
  // live things: raft, lift, quest items, NPCs, Cappy (sorted by y)
  DRAWN = 0;
  const vx0 = cx - 32, vy0 = cy - 32, vx1 = cx + VIEW.W + 32, vy1 = cy + VIEW.H + 48;
  for (const n of WORLD.npcs) { const x = n.x * TS, y = n.y * TS; if (x > vx0 && x < vx1 && y > vy0 && y < vy1) queue(1, n, x, y); }
  for (const it of WORLD.items) { if (!JC.questVisible(it)) continue; const x = it.x * TS, y = it.y * TS; if (x > vx0 && x < vx1 && y > vy0 && y < vy1) queue(2, it, x, y); }
  queue(0, null, P.px, P.py);
  sortQueue();
  drawRaft(g, 38 * TS + 6 - cx, 65 * TS + 2 - cy);
  drawLift(g, WORLD.lift.x * TS - cx, WORLD.lift.y * TS - cy);
  for (let i = 0; i < DRAWN; i++) {
    const d = DRAWLIST[i], x = d.x - cx, y = d.y - cy;
    if (d.kind === 0) drawCappy(g, x, y, P.dir, P.moving && P.t < 0.6, P.hop);
    else if (d.kind === 1) drawNpc(g, d.ref, x, y);
    else { const s = SPRITES[d.ref.spr], b = Math.round(Math.sin(OW.time * 4) * 1); shadow(g, x + 8, y + 14, 4); spr(g, s, x + ((16 - s.w) >> 1), y + 6 - (s.h >> 1) + b); if (((OW.time * 3) | 0) % 3 === 0) spr(g, SPRITES.sparkle, x + 10, y); }
  }
  g.drawImage(WORLD.over, cx, cy, sw, sh, 0, 0, sw, sh);
  drawTotemSockets(g, cx, cy);
  // the "talk" hint above someone Cappy faces
  if (!TB.open && !P.moving) {
    const fx = P.x + DIRS[P.dir][0], fy = P.y + DIRS[P.dir][1];
    if (npcAt(fx, fy) || signAt(fx, fy) || (fx === WORLD.lift.x && fy === WORLD.lift.y)) {
      const bx = fx * TS + 8 - cx, by = fy * TS - 14 - cy + (((OW.time * 2) | 0) % 2);
      box(g, bx - 6, by - 6, 13, 11, PAL.white, PAL.ink); rect(g, bx - 1, by + 4, 3, 2, PAL.white); rect(g, bx - 1, by + 6, 1, 1, PAL.ink);
      rect(g, bx - 3, by - 1, 2, 2, PAL.ink); rect(g, bx, by - 1, 2, 2, PAL.ink); rect(g, bx + 3, by - 1, 2, 2, PAL.ink);
    }
  }
  UI.drawFx(g);
  OW.drawHud(g);
  TB.draw(g);
};
OW.drawHud = function (g) {
  layoutPad();
  // the seven Feathers, top left
  const n = 7, sw = 11, x0 = 6, y0 = 6;
  box(g, x0 - 2, y0 - 2, n * sw + 4, 18, 'rgba(27,19,37,0.72)', PAL.ink);
  for (let i = 0; i < n; i++) {
    const id = JC.sportOrder[i], on = SAVE.data.feathers[id];
    if (on) spr(g, featherSprite(SPORT_COLOURS[id]), x0 + i * sw + 2, y0 + 1);
    else spr(g, featherSprite('#4a4060'), x0 + i * sw + 2, y0 + 1);
  }
  // map button, top right
  UI.iconButton(g, 'map', VIEW.W - Math.max(14, VIEW.tap / 2 + 4), Math.max(14, VIEW.tap / 2 + 4), UI.icons.map, { col: '#3d8a3a' });
  // the arch prompt
  if (OW.prompt && !TB.open) {
    const sp = OW.prompt, name = t('sport.' + sp);
    const msg = INPUT.showTouch() ? t('arch.tap', { sport: name }) : t('arch.key', { sport: name });
    const w = Math.min(VIEW.W - 20, textW(msg) + 30), h = Math.max(22, VIEW.tap), x = Math.round((VIEW.W - w) / 2), y = Math.round(VIEW.H * 0.2);
    UI.button(g, 'prompt', x, y, w, h, msg, { col: SPORT_COLOURS[sp], tcol: PAL.white, icon: UI.icons.play, glow: ((OW.time * 2) | 0) % 2 === 0 });
  }
  // touch controls
  if (INPUT.showTouch() && !TB.open) {
    g.globalAlpha = 0.85;
    disc(g, PAD.cx, PAD.cy + 2, PAD.r, 'rgba(0,0,0,0.25)');
    disc(g, PAD.cx, PAD.cy, PAD.r, PAL.ink); disc(g, PAD.cx, PAD.cy, PAD.r - 2, '#3b3150');
    const arm = Math.round(PAD.r * 0.42), len = PAD.r - 4;
    for (const d of ['up', 'down', 'left', 'right']) {
      const on = OW.padDir === d, [dx, dy] = DIRS[d];
      const bx = PAD.cx + dx * (len - arm) - arm / 2 * (dx ? 1 : 1), by = PAD.cy + dy * (len - arm) - arm / 2;
      rect(g, Math.round(PAD.cx + (dx ? (dx > 0 ? 0 : -len) : -arm / 2)), Math.round(PAD.cy + (dy ? (dy > 0 ? 0 : -len) : -arm / 2)), dx ? len : arm, dy ? len : arm, on ? '#ffd24a' : '#6e6488');
      void bx; void by;
    }
    disc(g, PAD.cx, PAD.cy, Math.round(arm * 0.6), '#4a4060');
    for (const d of ['up', 'down', 'left', 'right']) { // arrows
      const [dx, dy] = DIRS[d], ax = PAD.cx + dx * (len - 6), ay = PAD.cy + dy * (len - 6);
      for (let i = 0; i < 4; i++) { if (dx) rect(g, ax - dx * i, ay - i, 1, i * 2 + 1, PAL.white); else rect(g, ax - i, ay - dy * i, i * 2 + 1, 1, PAL.white); }
    }
    const aOn = OW.aPtr >= 0 || INPUT.held.a;
    disc(g, PAD.ax, PAD.ay + 2, PAD.ar, 'rgba(0,0,0,0.3)');
    disc(g, PAD.ax, PAD.ay + (aOn ? 1 : 0), PAD.ar, PAL.ink); disc(g, PAD.ax, PAD.ay + (aOn ? 1 : 0), PAD.ar - 2, aOn ? '#ffb030' : '#ff8b3d');
    disc(g, PAD.ax - 3, PAD.ay - 3 + (aOn ? 1 : 0), Math.max(3, PAD.ar - 9), '#ffb060');
    text(g, 'A', PAD.ax, PAD.ay - 6 + (aOn ? 1 : 0), { align: 'center', col: PAL.white, scale: 1 });
    g.globalAlpha = 1;
  }
};
JC.cam = CAM;
