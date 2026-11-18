// Classroom dashboards: the dark tooltip that names a button (docs/decisions.md "Classroom dashboards: tooltips never
// cut off"). A button that carries data-tip names itself in a small dark label on hover (mouse or pen) and on keyboard
// focus; on a touch screen only on a long press, and it goes again when the finger lifts. There is one label for the whole
// page, in a layer of its own at the top of the page (position: fixed, in <body>, or in the element shown full screen),
// placed from the button's box and kept inside the screen: so a tool's edge, a rail or a box that scrolls can never cut
// it off. It is hidden on scroll, resize, Escape, a press and when the window loses focus. role="tooltip" and the
// button's aria-describedby point to it while it shows. A button with a data-tip has no native title (tip() takes it
// away), so a browser's own tooltip never shows as well.

const GAP = 6, MARGIN = 8, LONG_PRESS = 500, SLOP = 10;

/** Name a button with the dark tooltip (empty text: no tooltip). Takes away the native title, keeps aria-label. */
export function tip(el, text) {
  if (!el) return el;
  if (text) el.dataset.tip = text; else delete el.dataset.tip;
  el.removeAttribute('title');
  return el;
}

/** Where the tooltip goes (pure): above the button and centred on it; below when there is no room above; shifted
 *  sideways and up or down so its whole box stays at least `margin` px inside the screen.
 *  trigger: the button's box {left, top, right, bottom}; w, h: the tooltip's size; vw, vh: the screen.
 *  -> { left, top, side: 'top' | 'bottom' } */
export function placeTip(trigger, w, h, vw, vh, gap = GAP, margin = MARGIN) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const left = w > vw - 2 * margin ? margin : clamp((trigger.left + trigger.right) / 2 - w / 2, margin, vw - margin - w);
  const above = trigger.top - gap - h, below = trigger.bottom + gap;
  let side = 'top', top = above;
  if (above < margin) {
    // No room above: below when it fits there, else on the side with more room.
    if (below + h <= vh - margin || vh - trigger.bottom > trigger.top) { side = 'bottom'; top = below; }
  }
  top = h > vh - 2 * margin ? margin : clamp(top, margin, vh - margin - h);
  return { left, top, side };
}

/** True when a hover (not keyboard focus) should show no tooltip: the button's words already show in full, or its menu
 *  is open. */
export function hoverSkips(el) {
  if (el.getAttribute('aria-expanded') === 'true') return true;
  // Words shown in full (a label hidden by the stylesheet, as in a tool's row of icons, does not count).
  return [...el.querySelectorAll('.dt-lbl:not([hidden])')].some(l => l.getClientRects().length > 0);
}

let layer = null, cur = null, raf = 0, press = null, hideTimer = 0, installed = false;

function host(el) {
  const d = el.closest('dialog[open]');
  if (d) return d;
  // A button in a small menu (public/js/dash-tools.js: a popover, in the top layer): the tooltip goes in the menu.
  let p = null; try { p = el.closest(':popover-open'); } catch { p = null; }
  if (p) return p;
  const f = document.fullscreenElement;
  return f && f.contains(el) ? f : document.body;
}
function ensureLayer(el) {
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'dash-tip'; layer.className = 'dash-tip'; layer.setAttribute('role', 'tooltip'); layer.hidden = true;
  }
  const h = host(el);
  if (layer.parentNode !== h) h.appendChild(layer);
  return layer;
}
function place() {
  if (!cur || !layer || layer.hidden) return;
  // The button went (the tool was drawn again) or is hidden: the tooltip goes too.
  if (!cur.isConnected || !cur.getClientRects().length || !cur.dataset.tip) { hide(); return; }
  if (layer.textContent !== cur.dataset.tip) layer.textContent = cur.dataset.tip;
  const r = cur.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
  if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { hide(); return; }
  const p = placeTip(r, layer.offsetWidth, layer.offsetHeight, vw, vh);
  layer.style.left = `${Math.round(p.left)}px`; layer.style.top = `${Math.round(p.top)}px`; layer.dataset.side = p.side;
}
function loop() { place(); if (cur) raf = requestAnimationFrame(loop); }

/** Show the tooltip for el (a [data-tip] button). */
export function showTip(el) {
  if (!el || !el.dataset || !el.dataset.tip) return;
  if (cur && cur !== el) hide();
  clearTimeout(hideTimer);
  el.removeAttribute('title');
  const t = ensureLayer(el);
  cur = el;
  t.textContent = el.dataset.tip;
  t.dir = getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
  t.classList.toggle('is-big', !!document.body && document.body.classList.contains('dash-projector'));
  t.hidden = false;
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!ids.includes(t.id)) el.setAttribute('aria-describedby', [...ids, t.id].join(' '));
  place();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
/** Hide the tooltip (if it shows). */
export function hideTip() { hide(); }
function hide() {
  clearTimeout(hideTimer); cancelAnimationFrame(raf);
  if (cur) {
    const ids = (cur.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== 'dash-tip');
    if (ids.length) cur.setAttribute('aria-describedby', ids.join(' ')); else cur.removeAttribute('aria-describedby');
  }
  cur = null;
  if (layer) layer.hidden = true;
}

const triggerOf = t => (t && t.closest ? t.closest('[data-tip]') : null);
const focusVisible = el => { try { return el.matches(':focus-visible'); } catch { return true; } };

/** Listen once for the whole page (safe to call again). */
export function installTips(doc = typeof document === 'undefined' ? null : document) {
  if (!doc || installed) return;
  installed = true;
  const win = doc.defaultView || window;
  doc.addEventListener('pointerover', e => {
    // Not while a button is held (a drag from the pattern block palette keeps the pointer over its button).
    if (e.pointerType === 'touch' || e.buttons) return;
    const el = triggerOf(e.target);
    if (!el || el === cur) return;
    // Over something else: a tooltip shown by keyboard focus stays only on its own button.
    if (!el.dataset.tip || hoverSkips(el)) { if (cur && !cur.contains(e.target) && cur !== doc.activeElement) hide(); return; }
    showTip(el);
  }, true);
  doc.addEventListener('pointerout', e => {
    if (!cur || e.pointerType === 'touch') return;
    const to = e.relatedTarget;
    if (triggerOf(e.target) === cur && !(to && cur.contains(to)) && !(doc.activeElement === cur && focusVisible(cur))) hide();
  }, true);
  doc.addEventListener('focusin', e => {
    const el = triggerOf(e.target);
    if (el && el === e.target && el.dataset.tip && focusVisible(el)) showTip(el);
    else if (cur && cur !== e.target) hide();
  }, true);
  doc.addEventListener('focusout', e => { if (cur && e.target === cur) hide(); }, true);
  doc.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); }, true);
  // A press hides it; on a touch screen a long press shows it until the finger lifts (never sticks).
  doc.addEventListener('pointerdown', e => {
    if (cur && e.pointerType !== 'touch') hide();
    if (e.pointerType !== 'touch') return;
    if (cur) hide();
    const el = triggerOf(e.target);
    if (!el || !el.dataset.tip) return;
    clearTimeout(press && press.t);
    press = { el, id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(() => { if (press && press.el === el) showTip(el); }, LONG_PRESS) };
  }, true);
  doc.addEventListener('pointermove', e => {
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) { clearTimeout(press.t); press = null; if (cur) hide(); }
  }, true);
  const lift = e => {
    if (!press || press.id !== e.pointerId) return;
    clearTimeout(press.t); press = null;
    if (cur) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 900); }
  };
  doc.addEventListener('pointerup', lift, true);
  doc.addEventListener('pointercancel', e => { if (press && press.id === e.pointerId) { clearTimeout(press.t); press = null; } hide(); }, true);
  // A scroll hides a tooltip shown by hover; one shown by keyboard focus follows its button (focus scrolls it into view).
  doc.addEventListener('scroll', () => { if (cur && cur !== doc.activeElement) hide(); else place(); }, true);
  doc.addEventListener('fullscreenchange', () => hide());
  win.addEventListener('resize', () => { if (cur) hide(); });
  win.addEventListener('blur', () => hide());
}

if (typeof document !== 'undefined') installTips();
