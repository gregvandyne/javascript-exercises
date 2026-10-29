// Input as named actions: keyboard (by layout-independent `code`), pointer/touch, Gamepad API (standard mapping) and
// on-screen DOM touch controls. Edges (pressed/released) are latched per fixed update, so a tap shorter than a frame
// still counts. Gestures: tap, swipe, drag, flick, longpress (pointer, in design units).

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA', 'pad:left', 'touch:left'],
  right: ['ArrowRight', 'KeyD', 'pad:right', 'touch:right'],
  up: ['ArrowUp', 'KeyW', 'pad:up', 'touch:up'],
  down: ['ArrowDown', 'KeyS', 'pad:down', 'touch:down'],
  jump: ['Space', 'KeyZ', 'KeyW', 'ArrowUp', 'pad:A', 'touch:A'],
  action: ['KeyX', 'Enter', 'NumpadEnter', 'pad:X', 'touch:B'],
  pause: ['KeyP', 'Escape', 'pad:Start'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'pad:A'],
  back: ['Escape', 'Backspace', 'pad:B'],
};
// Standard-mapping gamepad buttons.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, Select: 8, Start: 9, up: 12, down: 13, left: 14, right: 15 };
const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DEAD = 0.22;

export class Input {
  constructor(opts = {}) {
    this.bindings = {}; this.map(DEFAULT_BINDINGS);
    this.raw = new Set();      // sources held right now ('KeyA', 'pad:A', 'touch:A')
    this.latch = new Set();    // sources that went down since the last update
    this.cur = new Set(); this.prev = new Set();   // actions down this update / last update
    this.stick = { x: 0, y: 0 };     // touch stick
    this.padAxis = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0, down: false, id: -1, sx: 0, sy: 0, t0: 0, moved: false, long: false, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0 };
    this.listeners = {}; this.enabled = true; this.usedPad = false; this.usedTouch = false;
    this.clock = opts.clock || (() => 0);
    this.toDesign = opts.toDesign || ((x, y) => ({ x, y }));
    this._axis = { x: 0, y: 0 };
  }
  /** map({jump:['Space','pad:A'], dash:['ShiftLeft']}) replaces those actions' bindings. */
  map(b) { for (const k in b) this.bindings[k] = [].concat(b[k]).map(String); }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return () => { const a = this.listeners[ev]; const i = a ? a.indexOf(fn) : -1; if (i >= 0) a.splice(i, 1); }; }
  emit(ev, e) { const a = this.listeners[ev]; if (a) for (const fn of a.slice()) { try { fn(e); } catch (err) { /* a handler bug never breaks input */ } } }
  srcDown(src) { if (!this.raw.has(src)) { this.raw.add(src); this.latch.add(src); } }
  srcUp(src) { this.raw.delete(src); }
  /** Call once per fixed update, before game code reads the state. */
  update(pads) {
    this.pollPads(pads);
    const t = this.prev; this.prev = this.cur; this.cur = t; this.cur.clear();
    if (this.enabled) {
      for (const action in this.bindings) {
        const srcs = this.bindings[action];
        for (let i = 0; i < srcs.length; i++) if (this.raw.has(srcs[i]) || this.latch.has(srcs[i])) { this.cur.add(action); break; }
      }
    }
    this.latch.clear();
    if (this.pointer.down && !this.pointer.long && !this.pointer.moved && this.clock() - this.pointer.t0 > 500) {
      this.pointer.long = true; this.emit('longpress', { x: this.pointer.x, y: this.pointer.y });
    }
  }
  down(a) { return this.cur.has(a); }
  pressed(a) { return this.cur.has(a) && !this.prev.has(a); }
  released(a) { return !this.cur.has(a) && this.prev.has(a); }
  /** axis('move') -> {x,y} in -1..1 (keys, d-pad, left stick, touch stick); length capped at 1. */
  axis() {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0) + this.padAxis.x + this.stick.x;
    let y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0) + this.padAxis.y + this.stick.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this._axis.x = x; this._axis.y = y; return this._axis;
  }
  pollPads(pads) {
    if (!pads) return;
    let ax = 0, ay = 0;
    for (let p = 0; p < pads.length; p++) {
      const g = pads[p]; if (!g || !g.connected) continue;
      for (const name in PAD) {
        const b = g.buttons && g.buttons[PAD[name]]; const on = !!(b && (b.pressed || b.value > 0.5));
        const src = 'pad:' + name;
        if (on) { this.srcDown(src); this.usedPad = true; } else if (this.raw.has(src)) this.srcUp(src);
      }
      const x = (g.axes && g.axes[0]) || 0, y = (g.axes && g.axes[1]) || 0;
      if (Math.hypot(x, y) > DEAD) { ax += x; ay += y; this.usedPad = true; }
    }
    this.padAxis.x = Math.max(-1, Math.min(1, ax)); this.padAxis.y = Math.max(-1, Math.min(1, ay));
  }
  /** Wire DOM events. el: the element pointer coordinates are relative to (the stage). Returns detach(). */
  attach(win, el) {
    const isField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const kd = e => {
      if (isField(e.target)) return;
      // Inside a DOM dialog (pause, quiz), buttons own Enter/Space: never also jump.
      if (e.target && e.target.closest && e.target.closest('.ok-modal') && (e.code === 'Space' || e.code === 'Enter')) return;
      if (SCROLL_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.srcDown(e.code);
    };
    const ku = e => this.srcUp(e.code);
    const blur = () => { this.raw.clear(); this.stick.x = this.stick.y = 0; this.emit('blur', {}); };
    const pt = e => { const r = el.getBoundingClientRect(); return this.toDesign(e.clientX - r.left, e.clientY - r.top); };
    const P = this.pointer;
    const pd = e => {
      if (e.target !== el && e.target && e.target.closest && e.target.closest('.ok-ui button, .ok-touch')) return;
      if (e.pointerType === 'touch') this.usedTouch = true;
      const p = pt(e); P.x = p.x; P.y = p.y; P.down = true; P.id = e.pointerId; P.sx = p.x; P.sy = p.y; P.t0 = this.clock(); P.moved = false; P.long = false;
      P.lastX = p.x; P.lastY = p.y; P.lastT = P.t0; P.vx = P.vy = 0;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      this.emit('down', { x: p.x, y: p.y });
    };
    const pm = e => {
      const p = pt(e); P.x = p.x; P.y = p.y;
      if (!P.down || e.pointerId !== P.id) { this.emit('move', { x: p.x, y: p.y }); return; }
      const t = this.clock(), dt = Math.max(1, t - P.lastT);
      P.vx = (p.x - P.lastX) / dt; P.vy = (p.y - P.lastY) / dt; P.lastX = p.x; P.lastY = p.y; P.lastT = t;
      if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 12) P.moved = true;
      if (P.moved) this.emit('drag', { x: p.x, y: p.y, dx: p.x - P.sx, dy: p.y - P.sy });
    };
    const pu = e => {
      if (!P.down || e.pointerId !== P.id) return;
      P.down = false; const p = pt(e); const dt = this.clock() - P.t0, dx = p.x - P.sx, dy = p.y - P.sy, d = Math.hypot(dx, dy);
      if (!P.moved && !P.long && dt < 300) this.emit('tap', { x: p.x, y: p.y });
      else if (d > 40 && dt < 400) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.emit('swipe', { dir, dx, dy }); this.srcDown('swipe:' + dir); this.srcUp('swipe:' + dir);
      }
      if (P.moved && Math.hypot(P.vx, P.vy) > 0.8) this.emit('flick', { vx: P.vx, vy: P.vy });
      this.emit('up', { x: p.x, y: p.y });
    };
    const ts = () => { this.usedTouch = true; this.emit('firsttouch', {}); };
    win.addEventListener('keydown', kd); win.addEventListener('keyup', ku); win.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pd); win.addEventListener('pointermove', pm); win.addEventListener('pointerup', pu); win.addEventListener('pointercancel', pu);
    win.addEventListener('touchstart', ts, { passive: true, once: true });
    el.style.touchAction = 'none';
    return () => {
      win.removeEventListener('keydown', kd); win.removeEventListener('keyup', ku); win.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pd); win.removeEventListener('pointermove', pm); win.removeEventListener('pointerup', pu); win.removeEventListener('pointercancel', pu);
      win.removeEventListener('touchstart', ts);
    };
  }
}

/** DOM touch controls ('stick+jump' | 'stick' | 'dpad' | 'buttons' | 'none'): a floating stick at the bottom start and a
 *  72 px jump button at the bottom end, inside the safe areas. They are DOM so the playtest inspect() sees them. */
export function touchControls(doc, root, input, layout, opts = {}) {
  const old = root.querySelector('.ok-touch'); if (old) old.remove();
  if (!layout || layout === 'none') return null;
  const wrap = doc.createElement('div');
  wrap.className = 'ok-touch' + (opts.leftHanded ? ' ok-left' : '');
  wrap.setAttribute('aria-hidden', 'true');
  const hasStick = layout === 'stick+jump' || layout === 'stick';
  if (hasStick) {
    const pad = doc.createElement('div'); pad.className = 'ok-stick'; const knob = doc.createElement('div'); knob.className = 'ok-knob'; pad.appendChild(knob); wrap.appendChild(pad);
    let id = -1, cx = 0, cy = 0;
    const R = 48;
    const set = (x, y) => { const l = Math.hypot(x, y), k = l > R ? R / l : 1; x *= k; y *= k; knob.style.transform = `translate(${x}px,${y}px)`; input.stick.x = x / R; input.stick.y = y / R; };
    pad.addEventListener('pointerdown', e => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { pad.setPointerCapture(id); } catch (err) { /* ignore */ } set(e.clientX - cx, e.clientY - cy); pad.classList.add('on'); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const end = e => { if (e.pointerId !== id) return; id = -1; set(0, 0); pad.classList.remove('on'); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  }
  const btn = (cls, src, label) => {
    const b = doc.createElement('div'); b.className = 'ok-tbtn ' + cls; b.dataset.src = src; if (label) b.innerHTML = label;
    b.addEventListener('pointerdown', e => { input.srcDown(src); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault(); });
    const up = () => { input.srcUp(src); b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    wrap.appendChild(b); return b;
  };
  if (layout === 'dpad') ['up', 'left', 'right', 'down'].forEach(d => btn('ok-d ok-d-' + d, 'touch:' + d, opts.icons && opts.icons['arrow-' + d]));
  if (layout === 'stick+jump' || layout === 'buttons' || layout === 'dpad') btn('ok-jump', 'touch:A', opts.icons && opts.icons.jump);
  if (layout === 'buttons') btn('ok-act', 'touch:B', opts.icons && opts.icons.tap);
  root.appendChild(wrap);
  return wrap;
}
