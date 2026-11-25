// Editing the teacher's area on Homeroom's board (public/js/homeroom.js; docs/decisions.md "Homeroom: one way to edit
// the board"). Every object (sticky note, text box, shape, pen line) works the same way:
//   - tap or click it to select it: hit-tested here in area pixels with a generous margin, so a thin pen line or a
//     shape's outline is as easy to catch as a note (and the inside of a rectangle or circle counts too);
//   - a selected object shows an outline with handles (corners and edges; a pen line's corners; a line's two ends) and a
//     small toolbar next to it: Edit (notes, text), A- A+ (text), the colors (shapes, pen lines), Delete;
//   - drag it to move it, pull a handle to resize it (notes and text boxes in width and height, their words wrap);
//   - tap it again (or double-click / double-tap) to type in it: the words become editable in place, the caret where
//     you tapped (contenteditable, which WebKit edits only with user-select: text; homeroom.css);
//   - Escape finishes typing, Delete or Backspace deletes the selected object, a tap on the empty board lets go.
// Every change goes through the page's own save path (ctx.queueSave) and its undo (ctx.remember).
import { t, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine, textSizeButton } from '/js/board-ann.js';
import { textFont, TEXT_BOX } from '/js/manip-board.js';
import { NOTE_BOX, TEXT_NEW } from '/js/homeroom-seats.js';

const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const th = (k, v) => t(`js.homeroom.${k}`, v), tm = (k, v) => t(`js.manip-room.${k}`, v), ta = k => t(`js.board-ann.${k}`);
const MAX = { note: 300, text: 200 };
const same = (a, b) => !!a && !!b && a.k === b.k && (a.k === 'stroke' ? a.i === b.i : a.id === b.id);
const typed = s => !!s && (s.k === 'note' || s.k === 'text');

// ---------------------------------------------------------------- geometry (area pixels)
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const k = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}
/** How far p is from a shape's outline, and whether it is inside it (rectangles and circles). */
function shapeHit(s, p, W, H) {
  const a = { x: s.x * W, y: s.y * H }, b = { x: s.x2 * W, y: s.y2 * H };
  if (s.k === 'line') return { d: segDist(p, a, b), inside: false };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  if (s.k === 'circle') {
    const rx = Math.max(1, w / 2), ry = Math.max(1, h / 2), dx = p.x - (x + rx), dy = p.y - (y + ry), k = Math.hypot(dx / rx, dy / ry);
    return { d: k ? Math.abs(1 - 1 / k) * Math.hypot(dx, dy) : Math.min(rx, ry), inside: k <= 1 };
  }
  const inside = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  const d = inside ? Math.min(p.x - x, x + w - p.x, p.y - y, y + h - p.y) : Math.hypot(Math.max(x - p.x, 0, p.x - x - w), Math.max(y - p.y, 0, p.y - y - h));
  return { d, inside };
}
const strokeDist = (s, p, W, H) => {
  const pts = (s.pts || []).map(q => ({ x: q.x * W, y: q.y * H })); let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
  return pts.length === 1 ? Math.hypot(p.x - pts[0].x, p.y - pts[0].y) : d;
};
/** A box (from b0) with one handle pulled by (dx, dy): n, s, e, w and the corners; never smaller than min, never out of
 *  the area. */
export function pullBox(b0, h, dx, dy, min, area) {
  let { x, y, w, h: hh } = b0;
  if (h.includes('e')) w = clamp(b0.w + dx, min.w, area.w - b0.x);
  if (h.includes('s')) hh = clamp(b0.h + dy, min.h, area.h - b0.y);
  if (h.includes('w')) { const nx = clamp(b0.x + dx, 0, b0.x + b0.w - min.w); w = b0.w + b0.x - nx; x = nx; }
  if (h.includes('n')) { const ny = clamp(b0.y + dy, 0, b0.y + b0.h - min.h); hh = b0.h + b0.y - ny; y = ny; }
  return { x, y, w: Math.min(w, min.wMax || Infinity), h: Math.min(hh, min.hMax || Infinity) };
}

/** Put the caret where (cx, cy) is inside el (its end when that is not on its words). WebKit and Blink have
 *  caretRangeFromPoint, Firefox (and newer others) caretPositionFromPoint. */
function caretAt(el, cx, cy) {
  let r = null;
  try {
    if (cx != null && document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(cx, cy); if (p && el.contains(p.offsetNode)) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
    else if (cx != null && document.caretRangeFromPoint) { const q = document.caretRangeFromPoint(cx, cy); if (q && el.contains(q.startContainer)) r = q; }
  } catch { r = null; }
  if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
  r.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
const readText = el => String(el.innerText || '').replace(/\r/g, '').replace(/\n$/, '');

/**
 * The editor. ctx: { H (the page's state: ann, shapes, sel, edit, hist), AREA, board, worldEl, zoom(), areaPt(cx, cy)
 * (a screen point in area pixels), remember(), snapshot(), queueSave(), renderArea(), penColors }
 */
export function areaEditor(ctx) {
  const { H, AREA } = ctx;
  let g = null;   // the press being dragged: { kind: 'drag' | 'resize', ... }
  const body = () => ctx.worldEl.querySelector('.hr-area .hr-areain');

  function find(s = H.sel) {
    if (!s) return null;
    if (s.k === 'note') return H.ann.notes.find(n => n.id === s.id) || null;
    if (s.k === 'text') return H.ann.texts.find(n => n.id === s.id) || null;
    if (s.k === 'shape') return H.shapes.find(n => n.id === s.id) || null;
    return H.ann.strokes[s.i] || null;
  }
  const elOf = s => s && typed(s) ? body()?.querySelector(`[data-${s.k}="${CSS.escape(s.id)}"]`) : null;
  const textEl = s => { const el = elOf(s); return el && (s.k === 'note' ? el.querySelector('.hr-objtext') : el); };
  /** The object's box in area pixels. */
  function box(s = H.sel) {
    const o = find(s); if (!o) return null;
    if (typed(s)) { const el = elOf(s); return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null; }
    const xs = s.k === 'shape' ? [o.x, o.x2] : o.pts.map(p => p.x), ys = s.k === 'shape' ? [o.y, o.y2] : o.pts.map(p => p.y);
    const x = Math.min(...xs) * AREA.w, y = Math.min(...ys) * AREA.h;
    return { x, y, w: Math.max(...xs) * AREA.w - x, h: Math.max(...ys) * AREA.h - y };
  }

  // ---------------------------------------------------------------- drawing
  function noteHtml(n, i) {
    const sized = Number.isFinite(+n.w) && Number.isFinite(+n.h);
    const style = `left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%;width:${sized ? +n.w : NOTE_BOX.w}px;min-height:${sized ? +n.h : NOTE_BOX.h}px`;
    return `<div class="mp-sticky hr-obj" data-note="${esc(n.id)}" role="group" aria-label="${esc(tm('noteN', { n: i + 1 }))}" style="${style}"><p class="hr-objtext" dir="auto" data-ph="${esc(tm('noteTap'))}">${esc(n.text)}</p></div>`;
  }
  function textHtml(x) {
    const w = Number.isFinite(+x.w) ? +x.w : TEXT_NEW.w, h = Number.isFinite(+x.h) ? +x.h : TEXT_NEW.h;
    return `<div class="mp-text sized hr-obj hr-objtext" data-text="${esc(x.id)}" dir="auto" data-ph="${esc(tm('textPh'))}" aria-label="${esc(tm('textLabel'))}" style="left:${(+x.x || 0) * 100}%;top:${(+x.y || 0) * 100}%;font-size:${textFont(x)}px;width:${w}px;min-height:${h}px">${esc(x.text)}</div>`;
  }
  function shapeSvg(s) {
    const x1 = s.x * AREA.w, y1 = s.y * AREA.h, x2 = s.x2 * AREA.w, y2 = s.y2 * AREA.h;
    const attrs = `class="hr-shape" data-shape="${esc(s.id)}" stroke="${esc(s.c)}" stroke-width="5" fill="none" stroke-linecap="round"`;
    if (s.k === 'line') return `<line ${attrs} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    if (s.k === 'circle') return `<ellipse ${attrs} cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
    return `<rect ${attrs} x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
  }
  const inkSvg = () => H.ann.strokes.map(s => inkLine(s, AREA.w, AREA.h)).join('');
  const shapesSvg = () => H.shapes.map(shapeSvg).join('');
  /** Everything in the area (inside its .hr-areain). */
  function html() {
    return `<svg class="mp-ink" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${inkSvg()}</svg>
      <svg class="hr-shapes" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${shapesSvg()}</svg>
      <div class="mp-texts">${H.ann.texts.map(textHtml).join('')}</div>
      <div class="mp-notes">${H.ann.notes.map(noteHtml).join('')}</div><div class="hr-sel" aria-hidden="true"></div>`;
  }
  const redrawSvg = k => { const svg = body()?.querySelector(k === 'shape' ? '.hr-shapes' : '.mp-ink'); if (svg) svg.innerHTML = k === 'shape' ? shapesSvg() : inkSvg(); };

  // ---------------------------------------------------------------- the selection: outline, handles, toolbar
  function handles(s) {
    const o = find(s), b = box(s);
    if (s.k === 'shape' && o.k === 'line') return [['a', o.x * AREA.w, o.y * AREA.h], ['b', o.x2 * AREA.w, o.y2 * AREA.h]];
    const xs = { w: b.x, m: b.x + b.w / 2, e: b.x + b.w }, ys = { n: b.y, m: b.y + b.h / 2, s: b.y + b.h };
    const all = s.k === 'stroke' ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    return all.map(h => [h, xs[h.includes('w') ? 'w' : h.includes('e') ? 'e' : 'm'], ys[h.includes('n') ? 'n' : h.includes('s') ? 's' : 'm']]);
  }
  function renderSel() {
    const b = body(); if (!b) return;
    for (const x of b.querySelectorAll('.hr-obj.on')) x.classList.remove('on');
    let el = b.querySelector('.hr-sel'); if (!el) { el = document.createElement('div'); el.className = 'hr-sel'; el.setAttribute('aria-hidden', 'true'); b.append(el); }
    const bx = H.sel && box(H.sel);
    if (!bx) { if (H.sel && !find(H.sel)) H.sel = null; el.innerHTML = ''; renderTools(); return; }
    elOf(H.sel)?.classList.add('on');
    const pad = typed(H.sel) ? 0 : 8, line = H.sel.k === 'shape' && find().k === 'line';
    el.innerHTML = `${line ? '' : `<div class="hr-selbox${H.edit ? ' editing' : ''}" style="left:${bx.x - pad}px;top:${bx.y - pad}px;width:${bx.w + pad * 2}px;height:${bx.h + pad * 2}px"></div>`}
      ${H.edit ? '' : handles(H.sel).map(([h, x, y]) => `<span class="hr-h hr-h-${h}" data-hrh="${h}" style="left:${x + (line ? 0 : h.includes('w') ? -pad : h.includes('e') ? pad : 0)}px;top:${y + (line ? 0 : h.includes('n') ? -pad : h.includes('s') ? pad : 0)}px"></span>`).join('')}`;
    renderTools();
  }
  function toolsEl() {
    let el = document.getElementById('hr-seltools');
    if (!el) { el = document.createElement('div'); el.id = 'hr-seltools'; el.className = 'hr-seltools'; el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', th('sel.tools')); ctx.board.append(el); }
    return el;
  }
  function renderTools() {
    const el = toolsEl(), s = H.sel, o = find(s);
    if (!o) { el.hidden = true; el.innerHTML = ''; return; }
    const parts = [];
    if (typed(s)) parts.push(H.edit ? btn('hr-stb', 'data-hrsel="done"', `${iconHtml('✓', { size: 16 })} ${esc(tm('done'))}`) : btn('hr-stb', 'data-hrsel="edit"', `${iconHtml('✎', { size: 16 })} ${esc(tm('edit'))}`));
    if (s.k === 'text') {
      const fs = o.fs || 'M';
      parts.push(btn('hr-stb', `data-hrsel="smaller" aria-label="${esc(ta('smaller'))}"${fs === 'S' ? ' disabled' : ''}`, 'A−'), btn('hr-stb big', `data-hrsel="bigger" aria-label="${esc(ta('bigger'))}"${fs === 'XL' ? ' disabled' : ''}`, 'A+'));
    }
    if (s.k === 'shape' || s.k === 'stroke') parts.push(`<span class="hr-stcolors">${ctx.penColors.map(c => btn(`hr-stc${o.c === c ? ' on' : ''}`, `data-hrselc="${c}" style="background:${c}" aria-pressed="${o.c === c}" aria-label="${esc(tm('penColor', { color: c }))}"`, '')).join('')}</span>`);
    parts.push(btn('hr-stb bad', `data-hrsel="delete" aria-label="${esc(th('sel.delete'))}"`, `${iconHtml('🗑️', { size: 16 })} ${esc(tm('delete'))}`));
    el.innerHTML = parts.join(''); el.hidden = false;
    place();
  }
  /** The toolbar above the selected object (under it when there is no room), always inside the board. */
  function place() {
    const el = document.getElementById('hr-seltools'); if (!el || el.hidden) return;
    const sb = body()?.querySelector('.hr-selbox, .hr-h'), o = H.sel && (typed(H.sel) ? elOf(H.sel) : null);
    const ref = o || sb; if (!ref) return;
    let r = ref.getBoundingClientRect();
    if (!o) { const hs = [...body().querySelectorAll('.hr-selbox, .hr-h')].map(x => x.getBoundingClientRect()); r = { left: Math.min(...hs.map(x => x.left)), right: Math.max(...hs.map(x => x.right)), top: Math.min(...hs.map(x => x.top)), bottom: Math.max(...hs.map(x => x.bottom)) }; }
    const bb = ctx.board.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, gap = 12;
    let top = r.top - bb.top - h - gap; if (top < 8) top = r.bottom - bb.top + gap;
    if (top + h > bb.height - 8) top = clamp(r.top - bb.top + 8, 8, bb.height - h - 8);
    const left = clamp((r.left + r.right) / 2 - bb.left - w / 2, 8, bb.width - w - 8);
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }

  // ---------------------------------------------------------------- select, edit, delete
  function select(s) { if (!same(s, H.sel)) finishEdit(); H.sel = s; renderSel(); }
  function clear() { finishEdit(); if (H.sel) { H.sel = null; renderSel(); } }
  function del() {
    const s = H.sel; if (!find(s)) return;
    H.edit = false; ctx.remember();
    if (s.k === 'note') H.ann.notes = H.ann.notes.filter(n => n.id !== s.id);
    else if (s.k === 'text') H.ann.texts = H.ann.texts.filter(n => n.id !== s.id);
    else if (s.k === 'shape') H.shapes = H.shapes.filter(n => n.id !== s.id);
    else H.ann.strokes = H.ann.strokes.filter((_, i) => i !== s.i);
    H.sel = null; ctx.renderArea(); ctx.queueSave();
  }
  /** Type in the selected note or text, in place; the caret at (cx, cy) when given, else at the end of its words. */
  function startEdit(cx = null, cy = null, { fresh = false } = {}) {
    const s = H.sel; if (!typed(s) || H.edit) return;
    const el = textEl(s); if (!el) return;
    if (!fresh) ctx.remember();
    H.edit = true; elOf(s).classList.add('hr-typing');
    el.contentEditable = 'true'; el.spellcheck = true; el.setAttribute('role', 'textbox'); el.setAttribute('aria-multiline', 'true');
    renderSel();   // the handles go first, so the caret is found under the press, not on a handle
    el.focus({ preventScroll: true }); caretAt(el, cx, cy);
    el.addEventListener('input', onInput); el.addEventListener('keydown', onKey); el.addEventListener('paste', onPaste); el.addEventListener('focusout', onBlur);
  }
  function onInput(e) {
    const s = H.sel, o = find(s), el = e.currentTarget; if (!o || !typed(s)) return;
    let v = readText(el); if (v.length > MAX[s.k]) { v = v.slice(0, MAX[s.k]); el.textContent = v; caretAt(el); }
    o.text = v; ctx.queueSave(); renderSel();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(); ctx.board.focus({ preventScroll: true }); }
    else e.stopPropagation();   // typing never reaches the page's shortcuts (Delete, arrows)
  }
  function onPaste(e) {
    const v = e.clipboardData && e.clipboardData.getData('text/plain'); if (v == null) return;
    e.preventDefault(); document.execCommand('insertText', false, v);
  }
  function onBlur() { setTimeout(() => { if (H.edit && !textEl(H.sel)?.contains(document.activeElement)) finishEdit(); }, 0); }
  function finishEdit() {
    if (!H.edit) return;
    H.edit = false;
    const s = H.sel, o = find(s), el = textEl(s);
    if (o && el) o.text = readText(el).slice(0, MAX[s.k]);
    if (s && s.k === 'text' && o && !String(o.text || '').trim()) { H.ann.texts = H.ann.texts.filter(n => n !== o); H.sel = null; }
    if (H.hist.length && H.hist[H.hist.length - 1] === ctx.snapshot()) H.hist.pop(); else ctx.queueSave();
    window.getSelection()?.removeAllRanges();
    ctx.renderArea();
  }
  /** A new note or text box at a point (area fractions), selected and ready to type in. */
  function add(kind, at) {
    ctx.remember();
    const id = `${kind === 'note' ? 'n' : 'x'}-${Math.random().toString(36).slice(2, 10)}`;
    const b = kind === 'note' ? NOTE_BOX : TEXT_NEW;
    const o = { id, text: '', x: clamp(at.x, 0, 1 - b.w / AREA.w), y: clamp(at.y - (kind === 'text' ? 14 / AREA.h : 0), 0, 1 - b.h / AREA.h), w: b.w, h: b.h, by: 't' };
    (kind === 'note' ? H.ann.notes : H.ann.texts).push(o);
    finishEdit(); H.sel = { k: kind, id }; ctx.renderArea(); startEdit(null, null, { fresh: true });
  }

  // ---------------------------------------------------------------- pressing, dragging, resizing
  /** What is under a press (area pixels p), or null: notes and text by their element, then (within tol) pen lines and
   *  outlines, topmost first, then the inside of a rectangle or circle. The selected object's own box counts too. */
  function hit(p, tol, target) {
    const n = target.closest('.hr-area [data-note]'); if (n) return { k: 'note', id: n.dataset.note };
    const x = target.closest('.hr-area [data-text]'); if (x) return { k: 'text', id: x.dataset.text };
    if (H.sel && !typed(H.sel)) { const b = box(); if (b && p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return H.sel; }
    for (let i = H.ann.strokes.length - 1; i >= 0; i--) if (strokeDist(H.ann.strokes[i], p, AREA.w, AREA.h) <= tol) return { k: 'stroke', i };
    const hits = H.shapes.map(s => ({ s, ...shapeHit(s, p, AREA.w, AREA.h) }));
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].d <= tol) return { k: 'shape', id: hits[i].s.id };
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].inside) return { k: 'shape', id: hits[i].s.id };
    return null;
  }
  /** A press on the board in Select. -> true when it was on an object or a handle. */
  function down(e) {
    if (H.edit && textEl(H.sel)?.contains(e.target)) return true;   // placing the caret while typing
    const p = ctx.areaPt(e.clientX, e.clientY), z = ctx.zoom(), tol = Math.max(6, 14 / z);
    const hEl = e.target.closest('[data-hrh]');
    if (hEl && find()) {
      ctx.remember(); g = { kind: 'resize', h: hEl.dataset.hrh, id: e.pointerId, sx: e.clientX, sy: e.clientY, b0: box(), o: JSON.parse(JSON.stringify(find())), moved: false };
    } else {
      if (p.x < -tol || p.y < -tol || p.x > AREA.w + tol || p.y > AREA.h + tol) return false;
      const s = hit(p, tol, e.target); if (!s) return false;
      const was = same(s, H.sel); select(s);
      g = { kind: 'drag', s, was, id: e.pointerId, sx: e.clientX, sy: e.clientY, b0: box(s), o: JSON.parse(JSON.stringify(find(s))), moved: false };
    }
    try { ctx.board.setPointerCapture(e.pointerId); } catch { /* gone */ }
    e.preventDefault(); return true;
  }
  function move(e) {
    if (!g || e.pointerId !== g.id) return false;
    if (H.pointers && H.pointers.size > 1) { g = null; return false; }   // a pinch takes over
    const z = ctx.zoom(), dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return true;
    if (!g.moved && g.kind === 'drag') { finishEdit(); ctx.remember(); }
    g.moved = true;
    const s = g.kind === 'drag' ? g.s : H.sel, o = find(s), b0 = g.b0; if (!o || !b0) return true;
    if (g.kind === 'drag') {
      const mx = clamp(dx, -b0.x, AREA.w - b0.x - b0.w), my = clamp(dy, -b0.y, AREA.h - b0.y - b0.h);
      if (typed(s)) { o.x = (b0.x + mx) / AREA.w; o.y = (b0.y + my) / AREA.h; const el = elOf(s); if (el) { el.style.left = `${o.x * 100}%`; el.style.top = `${o.y * 100}%`; } }
      else if (s.k === 'shape') { Object.assign(o, { x: g.o.x + mx / AREA.w, x2: g.o.x2 + mx / AREA.w, y: g.o.y + my / AREA.h, y2: g.o.y2 + my / AREA.h }); redrawSvg('shape'); }
      else { o.pts = g.o.pts.map(q => ({ x: q.x + mx / AREA.w, y: q.y + my / AREA.h })); redrawSvg('ink'); }
    } else resizeTo(s, o, g, dx, dy);
    renderSel(); return true;
  }
  function resizeTo(s, o, g, dx, dy) {
    const b0 = g.b0;
    if (s.k === 'shape' && o.k === 'line') {
      const q = { x: clamp((g.h === 'a' ? g.o.x : g.o.x2) + dx / AREA.w, 0, 1), y: clamp((g.h === 'a' ? g.o.y : g.o.y2) + dy / AREA.h, 0, 1) };
      if (g.h === 'a') { o.x = q.x; o.y = q.y; } else { o.x2 = q.x; o.y2 = q.y; }
      redrawSvg('shape'); return;
    }
    const min = s.k === 'note' ? { w: NOTE_BOX.wMin, h: NOTE_BOX.hMin, wMax: NOTE_BOX.wMax, hMax: NOTE_BOX.hMax } : s.k === 'text' ? { w: TEXT_BOX.wMin, h: TEXT_BOX.hMin, wMax: TEXT_BOX.wMax, hMax: TEXT_BOX.hMax } : { w: 8, h: 8 };
    // a text box or note can be made shorter than its words only down to what they need (its height is a minimum)
    const b1 = pullBox(b0, g.h, dx, dy, min, AREA);
    if (typed(s)) {
      o.x = b1.x / AREA.w; o.y = b1.y / AREA.h; o.w = Math.round(b1.w); o.h = Math.round(b1.h);
      const el = elOf(s); if (el) Object.assign(el.style, { left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.w}px`, minHeight: `${o.h}px` });
    } else if (s.k === 'shape') {
      Object.assign(o, { x: b1.x / AREA.w, y: b1.y / AREA.h, x2: (b1.x + b1.w) / AREA.w, y2: (b1.y + b1.h) / AREA.h }); redrawSvg('shape');
    } else {
      const kx = b0.w > 1 ? b1.w / b0.w : 1, ky = b0.h > 1 ? b1.h / b0.h : 1;
      o.pts = g.o.pts.map(q => ({ x: clamp((b1.x + (q.x * AREA.w - b0.x) * kx) / AREA.w, 0, 1), y: clamp((b1.y + (q.y * AREA.h - b0.y) * ky) / AREA.h, 0, 1) })); redrawSvg('ink');
    }
  }
  function up(e) {
    if (!g || e.pointerId !== g.id) return false;
    const d = g; g = null;
    if (d.moved) { ctx.queueSave(); renderSel(); return true; }
    if (d.kind === 'resize') { H.hist.pop(); if (typed(H.sel)) startEdit(e.clientX, e.clientY); return true; }   // a tap on a handle is a tap on it
    if (d.was && typed(d.s)) startEdit(e.clientX, e.clientY);   // a second tap (or the second click of a double-click) types
    return true;
  }
  /** The toolbar's buttons. -> true when it was one of them */
  function click(e) {
    const c = e.target.closest('[data-hrselc]');
    if (c) { const o = find(); if (o && o.c !== c.dataset.hrselc) { ctx.remember(); o.c = c.dataset.hrselc; redrawSvg(H.sel.k === 'shape' ? 'shape' : 'ink'); ctx.queueSave(); renderSel(); } return true; }
    const b = e.target.closest('[data-hrsel]'); if (!b) return false;
    const k = b.dataset.hrsel;
    if (k === 'edit') startEdit();
    else if (k === 'done') { finishEdit(); }
    else if (k === 'delete') del();
    else if (k === 'smaller' || k === 'bigger') {
      finishEdit(); const o = find(); if (!o) return true;
      const before = ctx.snapshot(); if (textSizeButton(o, k === 'bigger' ? 1 : -1)) { H.hist.push(before); ctx.renderArea(); ctx.queueSave(); }
    }
    return true;
  }
  /** Delete / Backspace, Escape and Enter for the selected object (not while typing in it or in any field). */
  function key(e) {
    if (!H.sel || H.edit) return;
    const tg = e.target; if (tg && tg.closest && (tg.closest('input, textarea, select, [contenteditable="true"], .sheet-bg, dialog') || tg.isContentEditable)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { del(); e.preventDefault(); }
    else if (e.key === 'Escape') clear();
    else if (e.key === 'Enter' && typed(H.sel)) { startEdit(); e.preventDefault(); }
  }
  /** After a new drawing (the shape just drawn, the pen line): selected. */
  const selectNew = s => { H.sel = s; renderSel(); };

  return { html, renderSel, place, down, move, up, click, key, clear, finishEdit, add, selectNew, find, redrawSvg, shapeSvg };
}
