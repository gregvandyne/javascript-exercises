// ======================================================================================================
// INPUT: touch first, then keyboard and gamepad, all turned into the same small events for the current scene:
//   { type: 'press' | 'release', key: 'left'|'right'|'up'|'down'|'a'|'b'|'pause', device }   (keys, pad, on-screen pad)
//   { type: 'down' | 'move' | 'up', id, x, y, sx, sy (where it started), dx, dy, device: 'touch' }  (virtual pixels)
//   { type: 'tap', x, y }   a short touch or click that did not move
//   { type: 'swipe', dir: 'left'|'right'|'up'|'down', x, y, dx, dy, speed }   a quick flick (>= 18 CSS px)
// Held state: JC.input.held.left ... .a .b (keys, gamepad and the on-screen D-pad together), JC.input.dirX()/dirY().
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
INPUT.releaseTouch = function () { for (const k in INPUT.touchHeld) if (INPUT.touchHeld[k]) INPUT.touchKey(k, false); };
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
  const rec = { id: ev.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: false, cssX: ev.clientX, cssY: ev.clientY };
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
  PADNOW.left = ax < -0.5 || on(14); PADNOW.right = ax > 0.5 || on(15); PADNOW.up = ay < -0.5 || on(12); PADNOW.down = ay > 0.5 || on(13);
  PADNOW.a = on(0); PADNOW.b = on(1); PADNOW.pause = on(9);
  for (let i = 0; i < PADKEYS.length; i++) {
    const k = PADKEYS[i];
    if (PADNOW[k] !== INPUT.padHeld[k]) { INPUT.padHeld[k] = PADNOW[k]; refreshHeld(); INPUT.device = 'pad'; emit({ type: PADNOW[k] ? 'press' : 'release', key: k, device: 'pad' }); }
  }
};
