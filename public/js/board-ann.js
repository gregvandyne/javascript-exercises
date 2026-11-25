// What a board carries over its tools, shared by the Manipulatives (public/js/manip.js: a board on your own, and through
// it the live room, public/js/manip-room.js) and Homeroom's teacher's area (public/js/homeroom.js): pen marks and text
// typed straight on the board. Moved here unchanged from public/js/manip.js so both draw and move them the same way.
import { t, esc } from '/js/app.js';
import { TEXT_SIZES, textFont, stepTextSize, textResize, snapBox, SNAP_PX } from '/js/manip-board.js';

const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;

/** Pen marks in plane pixels. A mark is drawn once it has two different points: a single point (the moment the pen
 *  touches down) drew, in some browsers, a "dot" as wide as the whole board in the pen's color (a zero-length line
 *  with round caps under a stretched 0..1 viewBox), which is the flash seen on pointerdown. */
export const inkLine = (s, W, H) => { const pts = (s.pts || []).map(p => `${Math.round(+p.x * W * 10) / 10},${Math.round(+p.y * H * 10) / 10}`); return new Set(pts).size < 2 ? '' : `<polyline fill="none" stroke="${esc(s.c)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}"/>`; };
/**
 * A board text (solo and room). Its font size (S, M, L, XL) and, once its corner was dragged, its box (w x h in pixels of
 * its space: the words wrap inside it, and it grows taller when they need more room). While it is being written: a small
 * bar above it (a grip to drag it, A− and A+ for the size, × to delete it), the field, and a corner to resize it.
 * o: { editing, ro, del (the delete button's attribute), id (the field's id), label, ph, delLabel }
 */
export function textBoxHtml(x, o) {
  const sized = Number.isFinite(+x.w) && Number.isFinite(+x.h), id = esc(x.id), f = textFont(x);
  const style = `left:${(+x.x || 0) * 100}%;top:${(+x.y || 0) * 100}%;font-size:${f}px${sized ? `;width:${+x.w}px;min-height:${+x.h}px` : ''}`;
  const cls = `mp-text${sized ? ' sized' : ''}`;
  if (o.editing) {
    const fs = x.fs in TEXT_SIZES ? x.fs : 'M';
    return `<div class="${cls} editing" data-text="${id}" style="${style}">
      <div class="mp-textbar"><span class="mp-textgrip" data-tgrip="${id}" role="img" aria-label="${esc(t('js.board-ann.move'))}" title="${esc(t('js.board-ann.move'))}">⠿</span>${btn('mp-tsz', `data-tsz="-1" data-id="${id}" aria-label="${esc(t('js.board-ann.smaller'))}" title="${esc(t('js.board-ann.smaller'))}"${fs === 'S' ? ' disabled' : ''}`, 'A−')}${btn('mp-tsz big', `data-tsz="1" data-id="${id}" aria-label="${esc(t('js.board-ann.bigger'))}" title="${esc(t('js.board-ann.bigger'))}"${fs === 'XL' ? ' disabled' : ''}`, 'A+')}${btn('mp-textx', `${o.del}="${id}" aria-label="${esc(o.delLabel)}"`, '×')}</div>
      <label class="sr-only" for="${esc(o.id)}">${esc(o.label)}</label><textarea id="${esc(o.id)}" class="mp-textin" rows="1" maxlength="200" placeholder="${esc(o.ph)}" autocomplete="off" enterkeyhint="done">${esc(x.text)}</textarea>
      <span class="mp-textrz" data-trz="${id}" role="img" aria-label="${esc(t('js.board-ann.resize'))}" title="${esc(t('js.board-ann.resize'))}"></span></div>`;
  }
  return `<div class="${cls}${o.ro ? ' ro' : ''}" data-text="${id}" style="${style}">${esc(x.text)}</div>`;
}
/** A text's font one size bigger or smaller (dir 1 or -1). -> false when it is already the biggest or smallest. */
export function textSizeButton(x, dir) {
  const fs = stepTextSize(x.fs, dir); if (fs === (x.fs || 'M')) return false;
  if (fs === 'M') delete x.fs; else x.fs = fs;
  return true;
}
/** A text's box grown to show all its words while they are typed (sized boxes only; never past TEXT_BOX or the space). */
export function growText(x, ta, space) {
  if (!ta || !Number.isFinite(+x.w) || !Number.isFinite(+x.h) || ta.scrollHeight <= ta.clientHeight + 1) return;
  const h = Math.min(800, Math.round(space.h * (1 - (+x.y || 0))), ta.scrollHeight + 4); if (h <= +x.h) return;
  x.h = h; const el = ta.closest('.mp-text'); if (el) el.style.minHeight = `${h}px`;
}
/**
 * A press on a text's grip (move it: the whole box, snapped to things nearby when let go) or its corner (resize it: its
 * words wrap inside). Solo and room. ctx: { x (the text), el (its element), space (its space's size), zoom(),
 * others() (rectangles of everything else in that space), start() (before the first change: undo), done(changed) }.
 * -> true when it was one of them
 */
export function textBoxPointer(e, ctx) {
  const grip = e.target.closest('[data-tgrip]'), rz = !grip && e.target.closest('[data-trz]'); if (!grip && !rz) return false;
  e.preventDefault(); e.stopPropagation();
  const { x, el, space } = ctx, h = grip || rz, z = ctx.zoom();
  const d = { sx: e.clientX, sy: e.clientY, x0: +x.x || 0, y0: +x.y || 0, w0: Number.isFinite(+x.w) ? +x.w : el.offsetWidth, h0: Number.isFinite(+x.h) ? +x.h : el.offsetHeight, moved: false };
  try { h.setPointerCapture(e.pointerId); } catch { /* gone */ }
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const dx = (ev.clientX - d.sx) / z, dy = (ev.clientY - d.sy) / z;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!d.moved) { ctx.start(); d.moved = true; el.classList.add('dragging'); }
    if (grip) {
      x.x = clamp(d.x0 + dx / space.w, 0, Math.max(0, 1 - el.offsetWidth / space.w)); x.y = clamp(d.y0 + dy / space.h, 0, Math.max(0, 1 - el.offsetHeight / space.h));
      el.style.left = `${x.x * 100}%`; el.style.top = `${x.y * 100}%`;
    } else {
      const r = textResize(d.w0, d.h0, dx, dy, (+x.x || 0) * space.w, (+x.y || 0) * space.h, space);
      x.w = r.w; x.h = r.h; el.classList.add('sized'); el.style.width = `${r.w}px`; el.style.minHeight = `${r.h}px`;
    }
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    el.classList.remove('dragging');
    if (grip && d.moved) snapText(x, el, space, ctx.others(), SNAP_PX / z);
    ctx.done(d.moved);
  };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  return true;
}
/** A dropped text: magnetic, like a dropped piece (manip-board.js snapBox): lined up with or just beside things nearby. */
export function snapText(x, el, space, others, t) {
  const b = { x: (+x.x || 0) * space.w, y: (+x.y || 0) * space.h, w: el.offsetWidth, h: el.offsetHeight };
  const s = snapBox(b, others, t); if (!s.dx && !s.dy) return;
  x.x = clamp((b.x + s.dx) / space.w, 0, Math.max(0, 1 - b.w / space.w)); x.y = clamp((b.y + s.dy) / space.h, 0, Math.max(0, 1 - b.h / space.h));
  el.style.left = `${x.x * 100}%`; el.style.top = `${x.y * 100}%`;
}
