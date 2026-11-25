// The manipulatives' hold-to-edit wheel (docs/decisions.md "Virtual math manipulatives: hold to edit"; approved
// mockup "no disc"). Shared by the solo board (public/js/manip.js) and the live room (public/js/manip-room.js).
// A tap selects a piece; holding it about 450 ms (a ring fills from 120 ms) opens a ring of 48 px dark icon buttons
// around the finger. Right-click, a long mouse press, Shift+F10, the ContextMenu key and Enter open the same wheel.
// The wheel is a fixed overlay on <body>, never inside the piece, so it never turns or mirrors with it. Near a screen
// edge it moves inward up to 36 px, else it opens as a half wheel away from the edge. It closes on a tap outside (that
// tap is used up), Esc, scrolling, resizing or zooming; the caller closes it after an action that is done.
// No imports: the layout is also unit-tested in Node (tests/unit/manip-board.test.js).
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const HOLD_MS = 450, RING_MS = 120, SLOP = 10;
const B = 48, M = 8;
const ICONS = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  fill: '<path d="M19 11 11 3 2.5 11.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11z"/><path d="M5 2l5 5"/><path d="M2.5 13H18"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.5"/><path d="M20 3.5v5h-5"/>',
  lock: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  unlock: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/>',
  delete: '<path d="M3.5 6h17"/><path d="M9 6V4h6v2"/><path d="M18.5 6l-.9 13.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5.5 6"/><path d="M10 10.5v6M14 10.5v6"/>',
  flip: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>',
  break: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v6M11 9v6M15 9v6"/>',
};
export const icon = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k] || ''}</svg>`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Where n buttons go around a point (fx, fy) on a w x h screen: a ring (radius 60 for up to 4, 64 for 5, 70 for more)
 * moved inward by up to 36 px near an edge; else a half wheel opening away from the edge; one button: above the point
 * (below it near the top). top: the screen's first free row (under the site's sticky header), so no button is ever
 * under it. -> { mode: 'ring' | 'arc' | 'single', pts: [{ x, y }] } (button centers)
 */
export function wheelLayout(fx, fy, n, w, h, top = 0) {
  if (top > 0) { const L = wheelLayout(fx, fy - top, n, w, Math.max(B + 2 * M, h - top)); return { mode: L.mode, pts: L.pts.map(p => ({ x: p.x, y: p.y + top })) }; }
  if (n === 1) { let y = fy - 70; if (y - B / 2 < M) y = fy + 70; return { mode: 'single', pts: [{ x: clamp(fx, M + B / 2, w - M - B / 2), y: clamp(y, M + B / 2, h - M - B / 2) }] }; }
  const R = n <= 4 ? 60 : n <= 5 ? 64 : 70, ext = R + B / 2;
  const sx = Math.max(0, M + ext - fx) - Math.max(0, fx + ext - (w - M)), sy = Math.max(0, M + ext - fy) - Math.max(0, fy + ext - (h - M));
  if (Math.hypot(sx, sy) <= 36) {
    const cx = fx + sx, cy = fy + sy;
    return { mode: 'ring', pts: Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; }) };
  }
  // A half wheel, opening toward the free side.
  const dir = Math.atan2(Math.sign(sy), Math.sign(sx)), R2 = n > 5 ? 96 : 86, step = Math.PI / (n - 1);
  const cx = clamp(fx, M + 4, w - M - 4), cy = clamp(fy, M + 4, h - M - 4);
  let pts = Array.from({ length: n }, (_, i) => { const a = dir - Math.PI / 2 + i * step; return { x: cx + R2 * Math.cos(a), y: cy + R2 * Math.sin(a) }; });
  const minX = Math.min(...pts.map(p => p.x)) - B / 2, maxX = Math.max(...pts.map(p => p.x)) + B / 2, minY = Math.min(...pts.map(p => p.y)) - B / 2, maxY = Math.max(...pts.map(p => p.y)) + B / 2;
  const ox = Math.max(0, M - minX) - Math.max(0, maxX - (w - M)), oy = Math.max(0, M - minY) - Math.max(0, maxY - (h - M));
  pts = pts.map(p => ({ x: p.x + ox, y: p.y + oy }));
  return { mode: 'arc', pts };
}

// ---------------------------------------------------------------- the press ring and haptics
let ring = null;
function ringEl() {
  if (!ring || !ring.isConnected) {
    ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'mp-press'); ring.setAttribute('viewBox', '0 0 64 64'); ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<circle cx="32" cy="32" r="28"/>';
    document.body.appendChild(ring);
  }
  return ring;
}
const hideRing = () => { if (ring) ring.classList.remove('on'); };
export function haptic() { try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* no haptics */ } }
/** A hold at (x, y): the ring shows after RING_MS, onHold runs after HOLD_MS (with a short vibration). -> { cancel() } */
export function startHold(x, y, onHold) {
  let done = false;
  const t1 = setTimeout(() => { if (done) return; const r = ringEl(); r.style.left = `${x}px`; r.style.top = `${y}px`; r.classList.remove('on'); void r.getBoundingClientRect(); r.classList.add('on'); }, RING_MS);
  const t2 = setTimeout(() => { if (done) return; done = true; hideRing(); haptic(); onHold(); }, HOLD_MS);
  return { cancel() { done = true; clearTimeout(t1); clearTimeout(t2); hideRing(); } };
}
/** A small shake: a locked piece or object that was pulled. */
export function shake(el) { if (!el) return; el.classList.remove('mp-shake'); void el.offsetWidth; el.classList.add('mp-shake'); setTimeout(() => el.classList.remove('mp-shake'), 350); }

// ---------------------------------------------------------------- the wheel
let W = null;   // { el, tip, keyboard, focusBack, onClose, at }
let swallow = 0;
export const wheelOpen = () => !!W;
/**
 * Open the wheel at screen point (x, y). items: [{ k, label, bad }] in ring order (the first at the top, clockwise).
 * onPick(k) runs on a button; focusBack() is the element focus returns to (keyboard); onClose() after it closes.
 */
export function openWheel({ x, y, items, label, keyboard = false, onPick, onClose, focusBack }) {
  closeWheel({ focus: false });
  const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
  // Never over the site's sticky header (a piece near the board's top), and always inside the window.
  const bar = document.querySelector('.topbar'), br = bar && bar.getBoundingClientRect();
  const top = br && br.height && br.bottom > 0 && getComputedStyle(bar).position !== 'static' ? Math.min(vh / 2, Math.round(br.bottom)) : 0;
  const L = wheelLayout(x, y, items.length, vw, vh, top);
  const el = document.createElement('div');
  el.className = 'mp-wheel'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', label || ''); el.dataset.mode = L.mode;
  el.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" class="mp-wbtn${it.bad ? ' bad' : ''}" data-wk="${esc(it.k)}" aria-label="${esc(it.label)}" data-name="${esc(it.label)}" style="left:${Math.round(L.pts[i].x)}px;top:${Math.round(L.pts[i].y)}px;animation-delay:${i * 18}ms">${icon(it.k === 'unlock' ? 'unlock' : it.k)}</button>`).join('');
  const tip = document.createElement('div'); tip.className = 'mp-wtip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  document.body.append(el, tip);
  W = { el, tip, keyboard, focusBack, onClose, at: Date.now() };
  const show = b => { tip.textContent = b.dataset.name; tip.hidden = false; const r = b.getBoundingClientRect(), tw = tip.offsetWidth; tip.style.left = `${clamp(r.left + r.width / 2, tw / 2 + 6, vw - tw / 2 - 6)}px`; let ty = r.top - 6; if (ty - 30 < top + 4) ty = r.bottom + 34; tip.style.top = `${ty}px`; };
  el.addEventListener('pointerover', e => { const b = e.target.closest('.mp-wbtn'); if (b) show(b); });
  el.addEventListener('pointerout', e => { if (e.target.closest('.mp-wbtn')) tip.hidden = true; });
  el.addEventListener('focusin', e => { const b = e.target.closest('.mp-wbtn'); if (b) show(b); });
  el.addEventListener('click', e => { const b = e.target.closest('.mp-wbtn'); if (b && W && W.el === el) onPick(b.dataset.wk); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('keydown', e => {
    const btns = [...el.querySelectorAll('.mp-wbtn')], i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeWheel(); return; }
    const next = ['ArrowRight', 'ArrowDown'].includes(e.key) || (e.key === 'Tab' && !e.shiftKey), prev = ['ArrowLeft', 'ArrowUp'].includes(e.key) || (e.key === 'Tab' && e.shiftKey);
    if (next || prev) { e.preventDefault(); btns[((i < 0 ? 0 : i) + (next ? 1 : -1) + btns.length) % btns.length].focus({ preventScroll: true }); }
  });
  if (keyboard) el.querySelector('.mp-wbtn')?.focus({ preventScroll: true });
  return el;
}
/** Close the wheel (focus: back to the piece when it was opened from the keyboard). */
export function closeWheel({ focus = true } = {}) {
  if (!W) return;
  const w = W; W = null;
  w.el.remove(); w.tip.remove();
  if (focus && w.keyboard && w.focusBack) { const f = w.focusBack(); if (f) f.focus({ preventScroll: true }); }
  if (w.onClose) w.onClose();
}
// A press outside the open wheel only closes it: the press, and the click after it, are used up (it never drags,
// selects or taps anything by accident).
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    swallow = 0;
    if (!W || e.target.closest('.mp-wheel')) return;
    e.preventDefault(); e.stopPropagation(); closeWheel({ focus: false });
    swallow = Date.now();
  }, true);
  const eat = e => { if (swallow && Date.now() - swallow < 900) { e.stopPropagation(); if (e.type === 'click') { e.preventDefault(); swallow = 0; } } };
  document.addEventListener('pointerup', eat, true); document.addEventListener('click', eat, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && W) { e.preventDefault(); closeWheel(); } });
  window.addEventListener('resize', () => closeWheel({ focus: false }));
  window.addEventListener('scroll', () => { if (W && !W.keyboard && Date.now() - W.at > 250) closeWheel({ focus: false }); }, { passive: true, capture: true });
  window.addEventListener('wheel', () => { if (W) closeWheel({ focus: false }); }, { passive: true, capture: true });
}

// ---------------------------------------------------------------- the undo message after Delete
let undoEl = null, undoTimer = 0;
/** "<label> deleted" with an Undo button, for 5 seconds. */
export function undoToast(msg, undoLabel, onUndo) {
  if (!undoEl || !undoEl.isConnected) { undoEl = document.createElement('div'); undoEl.className = 'mp-undo'; undoEl.setAttribute('role', 'status'); document.body.appendChild(undoEl); }
  undoEl.innerHTML = `<span>${esc(msg)}</span><button type="button" class="mp-undobtn">${esc(undoLabel)}</button>`;
  undoEl.hidden = false;
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 5000);
  undoEl.querySelector('button').onclick = () => { hideUndo(); onUndo(); };
}
export function hideUndo() { if (undoEl) undoEl.hidden = true; clearTimeout(undoTimer); }
