// ======================================================================================================
// INPUT: touch first, then keyboard and gamepad, all turned into the same small events for the current scene:
//   { type: 'press' | 'release', key: 'left'|'right'|'up'|'down'|'a'|'b'|'pause', device }   (keys, pad, on-screen pad)
//   { type: 'down' | 'move' | 'up', id, x, y, sx, sy (where it started), dx, dy, device: 'touch' }  (virtual pixels)
//   { type: 'tap', x, y }   a short touch or click that did not move, or any press that starts and ends on one button
//   { type: 'swipe', dir: 'left'|'right'|'up'|'down', x, y, dx, dy, speed }   a quick flick (>= 18 CSS px)
// Held state: JC.input.held.left ... .a .b (keys, gamepad and the touch joystick together), JC.input.dirX()/dirY().
// Analog: JC.input.axis = { x, y, mag } (-1..1, y down; mag 0..1) from the touch joystick, the gamepad's left stick
//   (dead zone 0.2) or the keys (diagonals normalised). Sports get it as ctx.axis. The joystick also holds
//   left/right/up/down (past 0.45 along that side), so 'press' / 'release' events and held keep working.
// Touch joystick (like Hero of Sunvale's): it floats to where the thumb lands in the left part of the screen, the knob
//   follows up to the base's edge (analog, dead zone 0.15), it follows its own touch so A works at the same time, and
//   it springs back on release. A faint one rests bottom left as a hint.
// Keys: arrows / WASD move, Space / Enter / Z = A (action), Esc / Backspace / X = B (back), P = pause.
// Gamepad: left stick or d-pad, button 0 = A, 1 = B, 9 (start) = pause.
// ======================================================================================================
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyZ: 'a', Escape: 'b', Backspace: 'b', KeyX: 'b', KeyP: 'pause' };
const INPUT = {
  held: { left: false, right: false, up: false, down: false, a: false, b: false, pause: false },
  keys: { left: false, right: false, up: false, down: false, a: false, b: false, pause: false },
  padHeld: { left: false, right: false, up: false, down: false, a: false, b: false, pause: false },
  touchHeld: { left: false, right: false, up: false, down: false, a: false, b: false, pause: false },
  device: 'touch', hasTouch: false, pointers: new Map(), listeners: [], gamepads: false, lastAny: 0,
};
JC.input = INPUT;
try { INPUT.hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0; } catch (e) { /* ignore */ }
INPUT.device = INPUT.hasTouch ? 'touch' : 'keys';
INPUT.dirX = () => (INPUT.held.right ? 1 : 0) - (INPUT.held.left ? 1 : 0);
INPUT.dirY = () => (INPUT.held.down ? 1 : 0) - (INPUT.held.up ? 1 : 0);
INPUT.showTouch = () => INPUT.device === 'touch';
function emit(e) {
  INPUT.lastAny = performance.now();
  AUDIO.unlock();
  if (JC.onInput) JC.onInput(e);
}
JC.emit = emit;
function refreshHeld() {
  const h = INPUT.held;
  for (const k in h) h[k] = INPUT.keys[k] || INPUT.padHeld[k] || INPUT.touchHeld[k];
}
/** On-screen buttons call this to hold or let go of a key (the D-pad, the A button). */
INPUT.touchKey = function (key, on) {
  if (INPUT.touchHeld[key] === on) return;
  INPUT.touchHeld[key] = on; refreshHeld();
  emit({ type: on ? 'press' : 'release', key, device: 'touch' });
};
INPUT.releaseTouch = function () { STICK.id = -1; STICK.x = 0; STICK.y = 0; STICK.mag = 0; for (const k in INPUT.touchHeld) if (INPUT.touchHeld[k]) INPUT.touchKey(k, false); };
window.addEventListener('keydown', ev => {
  const k = KEYMAP[ev.code] || (ev.key === ' ' ? 'a' : null);
  if (!k) return;
  ev.preventDefault();
  INPUT.device = 'keys';
  if (INPUT.keys[k] && ev.repeat) return;
  INPUT.keys[k] = true; refreshHeld();
  emit({ type: 'press', key: k, device: 'keys' });
});
window.addEventListener('keyup', ev => {
  const k = KEYMAP[ev.code] || (ev.key === ' ' ? 'a' : null);
  if (!k) return;
  ev.preventDefault();
  INPUT.keys[k] = false; refreshHeld();
  emit({ type: 'release', key: k, device: 'keys' });
});
window.addEventListener('blur', () => { for (const k in INPUT.keys) INPUT.keys[k] = false; INPUT.releaseTouch(); refreshHeld(); });
const PT = { x: 0, y: 0 };
function ptr(ev) { const r = CV.getBoundingClientRect(); return toVirtual(ev.clientX - r.left, ev.clientY - r.top, PT); }
CV.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  try { CV.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  try { CV.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  INPUT.device = ev.pointerType === 'mouse' ? 'keys' : 'touch';
  const p = ptr(ev);
  // the on-screen button under the finger (if any): a press that lifts off on the same button is a tap however long
  // it was held or however much the finger wobbled, so kids never need a second tap
  const btn = typeof UI !== 'undefined' && UI.hitAt ? UI.hitAt(p.x, p.y) : '';
  const rec = { id: ev.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: false, cssX: ev.clientX, cssY: ev.clientY, btn };
  INPUT.pointers.set(ev.pointerId, rec);
  emit({ type: 'down', id: rec.id, x: p.x, y: p.y, sx: p.x, sy: p.y, dx: 0, dy: 0, device: ev.pointerType === 'mouse' ? 'mouse' : 'touch' });
});
CV.addEventListener('pointermove', ev => {
  const rec = INPUT.pointers.get(ev.pointerId); if (!rec) return;
  const p = ptr(ev); rec.x = p.x; rec.y = p.y;
  if (Math.abs(ev.clientX - rec.cssX) + Math.abs(ev.clientY - rec.cssY) > 8) rec.moved = true;
  emit({ type: 'move', id: rec.id, x: p.x, y: p.y, sx: rec.sx, sy: rec.sy, dx: p.x - rec.sx, dy: p.y - rec.sy, device: 'touch' });
});
function pointerEnd(ev) {
  const rec = INPUT.pointers.get(ev.pointerId); if (!rec) return;
  INPUT.pointers.delete(ev.pointerId);
  const p = ptr(ev), dt = performance.now() - rec.t0, dxc = ev.clientX - rec.cssX, dyc = ev.clientY - rec.cssY, dist = Math.hypot(dxc, dyc);
  emit({ type: 'up', id: rec.id, x: p.x, y: p.y, sx: rec.sx, sy: rec.sy, dx: p.x - rec.sx, dy: p.y - rec.sy, device: 'touch', cancel: ev.type === 'pointercancel' });
  if (ev.type === 'pointercancel') return;
  if (rec.btn && UI.hitAt(p.x, p.y) === rec.btn) { emit({ type: 'tap', x: p.x, y: p.y }); return; }
  if (dist >= 18 && dt < 450) {
    const dir = Math.abs(dxc) > Math.abs(dyc) ? (dxc > 0 ? 'right' : 'left') : (dyc > 0 ? 'down' : 'up');
    emit({ type: 'swipe', dir, x: p.x, y: p.y, sx: rec.sx, sy: rec.sy, dx: p.x - rec.sx, dy: p.y - rec.sy, speed: dist / Math.max(16, dt) });
  } else if (dist < 12 && dt < 600) emit({ type: 'tap', x: p.x, y: p.y });
}
CV.addEventListener('pointerup', pointerEnd);
CV.addEventListener('pointercancel', pointerEnd);
CV.addEventListener('contextmenu', ev => ev.preventDefault());
window.addEventListener('gamepadconnected', () => { INPUT.gamepads = true; });
const PADKEYS = ['left', 'right', 'up', 'down', 'a', 'b', 'pause'];
const PADNOW = { left: false, right: false, up: false, down: false, a: false, b: false, pause: false };
/** Poll the first gamepad (only once one has connected). */
INPUT.poll = function () {
  if (!INPUT.gamepads || !navigator.getGamepads) return;
  let gp = null; const list = navigator.getGamepads();
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; }
  if (!gp) return;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = gp.buttons, on = i => !!(b[i] && b[i].pressed);
  // the left stick, analog (a dead zone, then rescaled so a light push still moves slowly)
  const m = Math.hypot(ax, ay);
  if (m > PAD_DEAD) { const k = Math.min(1, (m - PAD_DEAD) / (1 - PAD_DEAD)) / m; PADAXIS.x = ax * k; PADAXIS.y = ay * k; PADAXIS.mag = Math.min(1, (m - PAD_DEAD) / (1 - PAD_DEAD)); INPUT.device = 'pad'; }
  else { PADAXIS.x = 0; PADAXIS.y = 0; PADAXIS.mag = 0; }
  PADNOW.left = ax < -0.5 || on(14); PADNOW.right = ax > 0.5 || on(15); PADNOW.up = ay < -0.5 || on(12); PADNOW.down = ay > 0.5 || on(13);
  PADNOW.a = on(0); PADNOW.b = on(1); PADNOW.pause = on(9);
  for (let i = 0; i < PADKEYS.length; i++) {
    const k = PADKEYS[i];
    if (PADNOW[k] !== INPUT.padHeld[k]) { INPUT.padHeld[k] = PADNOW[k]; refreshHeld(); INPUT.device = 'pad'; emit({ type: PADNOW[k] ? 'press' : 'release', key: k, device: 'pad' }); }
  }
};

/* ---------- the analog axis (ctx.axis) ---------- */
const AXIS = { x: 0, y: 0, mag: 0 };
const PADAXIS = { x: 0, y: 0, mag: 0 };
const PAD_DEAD = 0.2, STICK_DEAD = 0.15, STICK_HOLD = 0.45;
INPUT.axis = AXIS;
/** Work out the axis for this step: the touch stick, else the gamepad stick, else the keys (and the pad's d-pad). */
INPUT.updateAxis = function () {
  if (STICK.id >= 0 && STICK.mag > 0) { AXIS.x = STICK.x; AXIS.y = STICK.y; AXIS.mag = STICK.mag; return AXIS; }
  if (PADAXIS.mag > 0) { AXIS.x = PADAXIS.x; AXIS.y = PADAXIS.y; AXIS.mag = PADAXIS.mag; return AXIS; }
  const h = INPUT.held;
  let x = (h.right ? 1 : 0) - (h.left ? 1 : 0), y = (h.down ? 1 : 0) - (h.up ? 1 : 0);
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  AXIS.x = x; AXIS.y = y; AXIS.mag = x || y ? 1 : 0;
  return AXIS;
};
/* ---------- the touch joystick ---------- */
const STICK = { id: -1, bx: 0, by: 0, kx: 0, ky: 0, x: 0, y: 0, mag: 0, R: 30, baseR: 38, knobR: 17, restX: 0, restY: 0, gen: -1, zoneTop: 0, zoneRight: 0 };
INPUT.stick = STICK;
/** Sizes from CSS pixels, as in Hero of Sunvale (base 132, knob 60, the knob travels 52), a touch smaller for a pixel screen. */
STICK.layout = function () {
  if (STICK.gen === VIEW.gen) return;
  STICK.gen = VIEW.gen;
  const k = VIEW.dpr / VIEW.S; // virtual pixels per CSS pixel
  STICK.R = Math.max(18, Math.round(50 * k)); STICK.baseR = Math.max(24, Math.round(62 * k)); STICK.knobR = Math.max(11, Math.round(27 * k));
  STICK.restX = STICK.baseR + Math.round(16 * k); STICK.restY = VIEW.H - STICK.baseR - Math.round(18 * k);
  // where a thumb can start the stick: the left part of the screen, below the top bar of buttons
  STICK.zoneRight = VIEW.W * (VIEW.portrait ? 0.55 : 0.45); STICK.zoneTop = Math.max(VIEW.tap + 10, VIEW.H * 0.3);
};
STICK.inZone = function (x, y) { STICK.layout(); return x < STICK.zoneRight && y > STICK.zoneTop; };
/** A touch went down: take it if the stick is free and it is in the zone (or forced). Returns true if taken. */
STICK.down = function (e, force) {
  if (STICK.id >= 0 || (!force && !STICK.inZone(e.x, e.y))) return false;
  STICK.layout();
  STICK.id = e.id;
  // the base appears under the thumb, kept fully on screen
  STICK.bx = clamp(e.x, STICK.baseR + 2, VIEW.W - STICK.baseR - 2); STICK.by = clamp(e.y, STICK.baseR + 2, VIEW.H - STICK.baseR - 2);
  STICK.kx = STICK.bx; STICK.ky = STICK.by; STICK.x = 0; STICK.y = 0; STICK.mag = 0;
  return true;
};
STICK.move = function (e) {
  if (e.id !== STICK.id) return false;
  let dx = (e.x - STICK.bx) / STICK.R, dy = (e.y - STICK.by) / STICK.R; const d = Math.hypot(dx, dy);
  if (d > 1) { dx /= d; dy /= d; }
  const m = Math.min(1, d);
  STICK.kx = STICK.bx + dx * STICK.R; STICK.ky = STICK.by + dy * STICK.R;
  if (m > STICK_DEAD) { STICK.mag = (m - STICK_DEAD) / (1 - STICK_DEAD); STICK.x = dx / Math.max(1e-6, m) * STICK.mag; STICK.y = dy / Math.max(1e-6, m) * STICK.mag; }
  else { STICK.mag = 0; STICK.x = 0; STICK.y = 0; }
  STICK.holdKeys();
  return true;
};
STICK.up = function (e) { if (e.id !== STICK.id) return false; STICK.release(); return true; };
STICK.release = function () {
  STICK.id = -1; STICK.x = 0; STICK.y = 0; STICK.mag = 0; STICK.holdKeys();
};
/** The stick also holds the four directions (past 0.45 that way), for sports that listen to press / release. */
STICK.holdKeys = function () {
  const on = STICK.mag > 0;
  const want = (k, v) => { if (INPUT.touchHeld[k] !== v) INPUT.touchKey(k, v); };
  want('left', on && STICK.x < -STICK_HOLD); want('right', on && STICK.x > STICK_HOLD);
  want('up', on && STICK.y < -STICK_HOLD); want('down', on && STICK.y > STICK_HOLD);
};
/** Route a pointer event to the stick (down in its zone, its own move / up). Returns true if the stick used it. */
STICK.input = function (e) {
  if (e.type === 'down') return STICK.down(e);
  if (e.type === 'move') return STICK.move(e);
  if (e.type === 'up') return STICK.up(e);
  return false;
};
/** Draw the stick: where the thumb is, or a faint resting hint bottom left. Chunky pixel rings, a knob with a shine. */
STICK.draw = function (g, hint) {
  STICK.layout();
  const live = STICK.id >= 0;
  if (!live && !hint) return;
  const bx = Math.round(live ? STICK.bx : STICK.restX), by = Math.round(live ? STICK.by : STICK.restY);
  const kx = Math.round(live ? STICK.kx : bx), ky = Math.round(live ? STICK.ky : by);
  const R = STICK.baseR, r = STICK.knobR;
  g.globalAlpha = live ? 0.9 : 0.5;
  disc(g, bx, by + 2, R, 'rgba(0,0,0,0.28)');
  disc(g, bx, by, R, PAL.ink); disc(g, bx, by, R - 2, 'rgba(59,49,80,0.82)'); disc(g, bx, by, R - 5, 'rgba(78,66,104,0.7)');
  // four little notches so it reads as a stick, not a button
  const n = R - 4;
  rect(g, bx - 1, by - n, 3, 3, '#8a80a8'); rect(g, bx - 1, by + n - 3, 3, 3, '#8a80a8'); rect(g, bx - n, by - 1, 3, 3, '#8a80a8'); rect(g, bx + n - 3, by - 1, 3, 3, '#8a80a8');
  if (live && STICK.mag > 0) { g.globalAlpha = 0.35 * STICK.mag; disc(g, Math.round((bx + kx) / 2), Math.round((by + ky) / 2), Math.round(r * 0.7), '#7ee07a'); g.globalAlpha = 0.9; }
  disc(g, kx, ky + 2, r, 'rgba(0,0,0,0.35)');
  disc(g, kx, ky, r, PAL.ink); disc(g, kx, ky, r - 2, live ? '#45c34e' : '#3d9a2e');
  disc(g, kx, ky + 1, Math.max(3, r - 6), live ? '#3aa843' : '#348a2a');
  disc(g, kx - Math.round(r * 0.3), ky - Math.round(r * 0.3), Math.max(2, Math.round(r * 0.32)), '#a8f0a0');
  g.globalAlpha = 1;
};
