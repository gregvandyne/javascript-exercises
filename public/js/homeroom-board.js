// Editing the teacher's area on Homeroom's board (public/js/homeroom.js; docs/decisions.md "Homeroom: one way to edit
// the board" and "Homeroom: board tools"). Every object (sticky note, text box, shape, pen line) works the same way:
//   - tap or click it to select it: hit-tested here in area pixels with a generous margin, so a thin pen line or a
//     shape's outline is as easy to catch as a note (and the inside of a closed shape counts too);
//   - Shift, Cmd or Ctrl and a click adds it to the selection (or takes it out); a drag across the empty area selects
//     everything it touches; Cmd/Ctrl+A selects everything;
//   - a selected object shows an outline with handles (corners and edges; a pen line's corners; a line's two ends; a
//     round handle above shapes and text boxes turns them) and a small toolbar next to it (public/js/homeroom-board-ui.js):
//     Edit, text size and style, Outline (color, weight, solid, dashed or dotted, arrowheads), Fill (color, opacity),
//     note color, Duplicate, More (copy, cut, paste, bring to front, send to back, lock, select all), Delete. It works on
//     one object or many;
//   - drag it (or the selection) to move it, pull a handle to resize it (Shift keeps its proportions);
//   - tap it again (or double-click / double-tap) to type in it: the words become editable in place, the caret where
//     you tapped (contenteditable, which WebKit edits only with user-select: text; homeroom.css);
//   - Cmd/Ctrl+C, X, V and D copy, cut, paste and duplicate; Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z or Ctrl+Y redoes;
//     Escape finishes typing or lets go, Delete or Backspace deletes, the arrow keys nudge.
// Every change goes through the page's own save path (ctx.queueSave) and its undo (ctx.remember).
import { t, esc, toast } from '/js/app.js';
import { textSizeButton } from '/js/board-ann.js';
import { TEXT_BOX } from '/js/manip-board.js';
import { NOTE_BOX, TEXT_NEW } from '/js/homeroom-seats.js';
import * as B from '/js/board-shapes.js';
import { selToolsHtml, popHtml, pickerHtml, tb } from '/js/homeroom-board-ui.js';

const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const th = (k, v) => t(`js.homeroom.${k}`, v), tm = (k, v) => t(`js.manip-room.${k}`, v);
const MAXCH = { note: 300, text: 200 };
/** How many of each the area holds (the server's limits: services/manipulatives.js LIMITS, board-shapes.js). */
export const MAX = { note: 12, text: 30, stroke: 80, shape: B.SHAPES_MAX };
const same = (a, b) => !!a && !!b && a.k === b.k && a.id === b.id;
const typed = s => !!s && (s.k === 'note' || s.k === 'text');
const clone = o => JSON.parse(JSON.stringify(o));
const newId = p => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const phone = () => window.matchMedia('(max-width: 819px)').matches;
const fieldIn = tg => !!(tg && tg.closest && (tg.closest('input, textarea, select, [contenteditable="true"], .sheet-bg, dialog') || tg.isContentEditable));
const CLIP_KEY = 'oomba-hr-clip', STYLE_KEY = 'oomba-hr-style';
const DEF_STYLE = { shape: { c: '#141414' }, line: { c: '#141414' }, pen: { c: '#141414' }, text: {}, note: {} };

// ---------------------------------------------------------------- geometry (area pixels)
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const k = l ? clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l, 0, 1) : 0;
  return Math.hypot(p.x - (a[0] + k * dx), p.y - (a[1] + k * dy));
}
const polyDist = (pts, p, closed) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); if (closed && pts.length > 2) d = Math.min(d, segDist(p, pts[pts.length - 1], pts[0])); return pts.length === 1 ? Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) : d; };
function inPoly(pts, p) {
  let on = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
}
const rot = (p, c, deg) => { const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs }; };
const mid = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const union = bs => { const v = bs.filter(Boolean); if (!v.length) return null; const x = Math.min(...v.map(b => b.x)), y = Math.min(...v.map(b => b.y)); return { x, y, w: Math.max(...v.map(b => b.x + b.w)) - x, h: Math.max(...v.map(b => b.y + b.h)) - y }; };
const meets = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
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
/** The same for a box turned by deg degrees around its middle: the handle moves in the box's own direction and the
 *  opposite side stays where it is on the screen. keep: Shift on a corner (the proportions stay). */
export function pullTurned(b0, h, dx, dy, min, area, deg = 0, keep = false) {
  const a = -deg * Math.PI / 180, ldx = dx * Math.cos(a) - dy * Math.sin(a), ldy = dx * Math.sin(a) + dy * Math.cos(a);
  const OFF = 5e6, big = deg ? { w: OFF * 2, h: OFF * 2 } : area, o = deg ? OFF : 0;
  let b1 = pullBox({ ...b0, x: b0.x + o, y: b0.y + o }, h, ldx, ldy, min, big); b1 = { ...b1, x: b1.x - o, y: b1.y - o };
  if (keep && h.length === 2 && b0.w > 0 && b0.h > 0) {
    const k = Math.max(b1.w / b0.w, b1.h / b0.h), w = Math.max(min.w, b0.w * k), hh = Math.max(min.h, b0.h * k);
    b1 = { x: h.includes('w') ? b0.x + b0.w - w : b0.x, y: h.includes('n') ? b0.y + b0.h - hh : b0.y, w, h: hh };
  }
  if (deg) {
    // turned: keep the far side still on screen (the box turns around its new middle)
    const c0 = mid(b0), c1 = mid(b1), d = { x: c0.x - c1.x, y: c0.y - c1.y }, r = rot({ x: d.x, y: d.y }, { x: 0, y: 0 }, deg);
    b1.x += d.x - r.x; b1.y += d.y - r.y;
  }
  return b1;
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

/** Anything pasted, made safe and given fresh ids (the server cleans it again). -> { k, o } or null */
function cleanItem(x) {
  if (!x || typeof x !== 'object' || !x.o || typeof x.o !== 'object') return null;
  const o = x.o, f = v => clamp(Number.isFinite(+v) ? +v : 0, 0, 1), sized = Number.isFinite(+o.w) && Number.isFinite(+o.h);
  if (x.k === 'shape') { const s = B.cleanShape(o); return s ? { k: 'shape', o: s } : null; }
  if (x.k === 'stroke') {
    const pts = (Array.isArray(o.pts) ? o.pts : []).slice(0, 600).filter(p => p && typeof p === 'object').map(p => ({ x: f(p.x), y: f(p.y) }));
    return pts.length > 1 ? { k: 'stroke', o: { id: '', c: B.PALETTE.includes(o.c) ? o.c : '#141414', pts, ...B.strokeStyle(o) } } : null;
  }
  if (x.k === 'note') return { k: 'note', o: { id: '', text: String(o.text ?? '').slice(0, MAXCH.note), x: f(o.x), y: f(o.y), w: sized ? clamp(Math.round(+o.w), NOTE_BOX.wMin, NOTE_BOX.wMax) : NOTE_BOX.w, h: sized ? clamp(Math.round(+o.h), NOTE_BOX.hMin, NOTE_BOX.hMax) : NOTE_BOX.h, by: 't', ...B.noteStyle(o) } };
  if (x.k === 'text') {
    const text = String(o.text ?? '').slice(0, MAXCH.text); if (!text.trim()) return null;
    return { k: 'text', o: { id: '', text, x: f(o.x), y: f(o.y), w: sized ? clamp(Math.round(+o.w), TEXT_BOX.wMin, TEXT_BOX.wMax) : TEXT_NEW.w, h: sized ? clamp(Math.round(+o.h), TEXT_BOX.hMin, TEXT_BOX.hMax) : TEXT_NEW.h, by: 't', ...(['S', 'L', 'XL'].includes(o.fs) ? { fs: o.fs } : {}), ...B.textStyle(o) } };
  }
  return null;
}

/**
 * The editor. ctx: { H (the page's state: ann, shapes, sels, edit, hist, style, pop, shapePick), AREA, board, stage (where
 * popovers go), worldEl, zoom(), areaPt(cx, cy) (a screen point in area pixels), remember(), forget(), snapshot(),
 * queueSave(), renderArea(), renderPanel(), undo(), redo() }
 */
export function areaEditor(ctx) {
  const { H, AREA } = ctx, W = AREA.w, HH = AREA.h;
  let g = null;   // the press being dragged: { kind: 'drag' | 'resize' | 'rotate' | 'marquee' | 'none', ... }
  let drawing = null, pending = null, pasteTimer = null, toolsHtml = '', popHtmlNow = '', popAnchor = null;
  const hover = { p: null, moved: false };
  H.sels = H.sels || []; H.redo = H.redo || []; H.pop = null; H.shapePick = H.shapePick || 'rect';
  H.style = loadStyle();
  const body = () => ctx.worldEl.querySelector('.hr-area .hr-areain');
  const LIST = { note: () => H.ann.notes, text: () => H.ann.texts, shape: () => H.shapes, stroke: () => H.ann.strokes };

  function loadStyle() {
    let s = null; try { s = JSON.parse(localStorage.getItem(STYLE_KEY) || 'null'); } catch { s = null; }
    const out = clone(DEF_STYLE);
    if (s && typeof s === 'object') {
      for (const k of ['shape', 'line']) if (s[k]) { const c = B.cleanShape({ ...s[k], k: k === 'line' ? 'line' : 'rect' }); if (c) { const { id, k: _k, x, y, x2, y2, z, r, lk, ...st } = c; out[k] = st; } }
      if (s.pen) out.pen = { c: B.PALETTE.includes(s.pen.c) ? s.pen.c : '#141414', ...B.strokeStyle(s.pen) };
      if (s.text) { const { r, lk, ...st } = B.textStyle(s.text); out.text = { ...st, ...(['S', 'L', 'XL'].includes(s.text.fs) ? { fs: s.text.fs } : {}) }; }
      if (s.note) out.note = B.noteStyle(s.note);
    }
    return out;
  }
  const saveStyle = () => { try { localStorage.setItem(STYLE_KEY, JSON.stringify(H.style)); } catch { /* private window: this page only */ } };

  /** Every pen line gets an id and every drawing an explicit layer (an older board has neither). */
  function normalize() {
    for (const s of H.ann.strokes) if (!s.id) s.id = newId('p');
    B.drawings(H.shapes, H.ann.strokes).forEach((d, i) => { if (!Number.isFinite(+d.o.z) || d.o.z === null) d.o.z = i; });
  }
  const zs = () => B.drawings(H.shapes, H.ann.strokes).map(d => d.z);
  const topZ = () => { const v = zs(); return v.length ? Math.max(...v) : 0; };
  const botZ = () => { const v = zs(); return v.length ? Math.min(...v) : 0; };

  function find(s) { return s ? LIST[s.k]().find(o => o.id === s.id) || null : null; }
  const one = () => (H.sels.length === 1 ? H.sels[0] : null);
  const elOf = s => s && typed(s) ? body()?.querySelector(`[data-${s.k}="${CSS.escape(s.id)}"]`) : null;
  const textEl = s => { const el = elOf(s); return el && (s.k === 'note' ? el.querySelector('.hr-objtext') : el); };
  const turnable = (s, o = find(s)) => !!o && ((s.k === 'shape' && !B.isLine(o.k)) || s.k === 'text');
  const turnOf = (s, o = find(s)) => (turnable(s, o) ? +o.r || 0 : 0);
  /** The object's box in area pixels (unturned). */
  function box(s) {
    const o = find(s); if (!o) return null;
    if (typed(s)) { const el = elOf(s); return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: o.x * W, y: o.y * HH, w: +o.w || TEXT_NEW.w, h: +o.h || TEXT_NEW.h }; }
    if (s.k === 'shape') return B.boxOf(o, W, HH);
    const xs = o.pts.map(p => p.x * W), ys = o.pts.map(p => p.y * HH), x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  /** Its box on the screen's axes (a turned object's corners). */
  function aabb(s) {
    const b = box(s); if (!b) return null; const deg = turnOf(s); if (!deg) return b;
    const c = mid(b), cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => rot({ x, y }, c, deg));
    return union(cs.map(p => ({ x: p.x, y: p.y, w: 0, h: 0 })));
  }
  const selBox = () => union(H.sels.map(aabb));
  const order = refs => { const ds = B.drawings(H.shapes, H.ann.strokes), rank = r => (typed(r) ? (r.k === 'text' ? 1e7 : 2e7) + LIST[r.k]().findIndex(o => o.id === r.id) : ds.findIndex(d => d.o.id === r.id)); return [...refs].sort((a, b) => rank(a) - rank(b)); };

  // ---------------------------------------------------------------- drawing
  const drawAttrs = d => (d.kind === 'shape' ? `class="hr-shape" data-shape="${esc(d.o.id)}"` : `data-stroke="${esc(d.o.id)}"`);
  const drawSvg = () => B.drawingsSvg(H.shapes, H.ann.strokes, W, HH, drawAttrs);
  /** Everything in the area (inside its .hr-areain). */
  function html() {
    normalize();
    return `<svg class="hr-shapes hr-draw" viewBox="0 0 ${W} ${HH}" aria-hidden="true">${drawSvg()}</svg>
      <div class="mp-texts">${H.ann.texts.map(x => B.textHtml(x, { label: tm('textLabel'), ph: tm('textPh') })).join('')}</div>
      <div class="mp-notes">${H.ann.notes.map((n, i) => B.noteHtml(n, { label: tm('noteN', { n: i + 1 }), ph: tm('noteTap') })).join('')}</div><div class="hr-sel" aria-hidden="true"></div>`;
  }
  const redrawSvg = () => { const svg = body()?.querySelector('.hr-draw'); if (svg) svg.innerHTML = drawSvg(); };
  /** A note's or text box's element after its fields changed (place, size, style), without redrawing the area. */
  function restyle(s) {
    const el = elOf(s), o = find(s); if (!el || !o) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = s.k === 'note' ? B.noteHtml(o) : B.textHtml(o);
    const n = fresh.firstElementChild; el.setAttribute('style', n.getAttribute('style'));
    el.className = `${n.className}${el.classList.contains('on') ? ' on' : ''}${el.classList.contains('hr-typing') ? ' hr-typing' : ''}`;
  }

  // ---------------------------------------------------------------- the selection: outline, handles, toolbar
  function handles(s) {
    const o = find(s), b = box(s), deg = turnOf(s, o), c = mid(b);
    if (s.k === 'shape' && B.isLine(o.k)) return [['a', o.x * W, o.y * HH], ['b', o.x2 * W, o.y2 * HH]];
    const pad = typed(s) ? 0 : 8, xs = { w: b.x - pad, m: c.x, e: b.x + b.w + pad }, ys = { n: b.y - pad, m: c.y, s: b.y + b.h + pad };
    const all = s.k === 'stroke' ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const out = all.map(h => { const p = rot({ x: xs[h.includes('w') ? 'w' : h.includes('e') ? 'e' : 'm'], y: ys[h.includes('n') ? 'n' : h.includes('s') ? 's' : 'm'] }, c, deg); return [h, p.x, p.y]; });
    if (turnable(s, o)) {
      // above it, or under it when above would be outside the area (the area clips what is outside it)
      const off = 30 / Math.max(0.2, ctx.zoom()), ok = q => q.x >= 6 && q.y >= 6 && q.x <= W - 6 && q.y <= HH - 6;
      const top = rot({ x: c.x, y: b.y - pad - off }, c, deg), under = rot({ x: c.x, y: b.y + b.h + pad + off }, c, deg);
      const p = ok(top) || !ok(under) ? top : under; out.push(['rot', p.x, p.y]);
    }
    return out;
  }
  function renderSel() {
    const b = body(); if (!b) return;
    H.sels = H.sels.filter(s => find(s));
    for (const x of b.querySelectorAll('.hr-obj.on')) x.classList.remove('on');
    let el = b.querySelector('.hr-sel'); if (!el) { el = document.createElement('div'); el.className = 'hr-sel'; el.setAttribute('aria-hidden', 'true'); b.append(el); }
    const marq = g && g.kind === 'marquee' && g.moved ? `<div class="hr-marq" style="left:${g.r.x}px;top:${g.r.y}px;width:${g.r.w}px;height:${g.r.h}px"></div>` : '';
    for (const s of H.sels) elOf(s)?.classList.add('on');
    if (H.sels.length > 1) {
      const u = selBox();
      el.innerHTML = `${H.sels.map(s => { const a = aabb(s); return a ? `<div class="hr-selbox thin" style="left:${a.x - 3}px;top:${a.y - 3}px;width:${a.w + 6}px;height:${a.h + 6}px"></div>` : ''; }).join('')}
        <div class="hr-selbox group" style="left:${u.x - 10}px;top:${u.y - 10}px;width:${u.w + 20}px;height:${u.h + 20}px"></div>${marq}`;
    } else if (H.sels.length === 1) {
      const s = H.sels[0], o = find(s), bx = box(s), deg = turnOf(s, o), pad = typed(s) ? 0 : 8, line = s.k === 'shape' && B.isLine(o.k);
      el.innerHTML = `${line ? '' : `<div class="hr-selbox${H.edit ? ' editing' : ''}${o.lk ? ' locked' : ''}" style="left:${bx.x - pad}px;top:${bx.y - pad}px;width:${bx.w + pad * 2}px;height:${bx.h + pad * 2}px${deg ? `;transform:rotate(${deg}deg)` : ''}"></div>`}
        ${H.edit || o.lk ? '' : handles(s).map(([h, x, y]) => `<span class="hr-h hr-h-${h}" data-hrh="${h}" style="left:${x}px;top:${y}px"></span>`).join('')}${marq}`;
    } else el.innerHTML = marq;
    renderTools();
  }
  function toolsEl() {
    let el = document.getElementById('hr-seltools');
    if (!el) { el = document.createElement('div'); el.id = 'hr-seltools'; el.className = 'hr-seltools'; el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', th('sel.tools')); ctx.board.append(el); }
    return el;
  }
  /** What the selection is made of, and its style where every object agrees (null where they differ). */
  function values(refs = H.sels) {
    const objs = refs.map(s => ({ s, o: find(s) })).filter(x => x.o), agree = list => (list.length && list.every(v => v === list[0]) ? list[0] : null);
    const draws = objs.filter(x => x.s.k === 'shape' || x.s.k === 'stroke'), closed = objs.filter(x => x.s.k === 'shape' && !B.isLine(x.o.k)), lines = objs.filter(x => x.s.k === 'shape' && B.isLine(x.o.k));
    const texts = objs.filter(x => x.s.k === 'text'), notes = objs.filter(x => x.s.k === 'note');
    return {
      n: objs.length, typed: objs.length === 1 && typed(objs[0].s), editing: H.edit, draws: draws.length, closed: closed.length, lines: lines.length, texts: texts.length, notes: notes.length,
      locked: objs.length > 0 && objs.every(x => x.o.lk), allLocked: objs.length > 0 && objs.every(x => x.o.lk),
      c: agree(draws.map(x => x.o.c || '#141414')), w: agree(draws.map(x => x.o.w || 'M')), d: agree(draws.map(x => x.o.d || 'solid')), a: agree(lines.map(x => x.o.a || 'none')),
      f: agree(closed.map(x => x.o.f || 'none')), fo: agree(closed.filter(x => x.o.f).map(x => x.o.fo || 100)), noneOk: closed.length > 0 && closed.every(x => x.o.f) && !lines.length && draws.length === closed.length,
      fs: agree(texts.map(x => x.o.fs || 'M')), tc: agree(texts.map(x => x.o.tc || null)), b: texts.length > 0 && texts.every(x => x.o.b), al: agree(texts.map(x => x.o.al || 'l')),
      nc: agree(notes.map(x => x.o.nc || 'yellow')), pop: H.pop && H.pop.for === 'sel' ? H.pop.kind : null,
    };
  }
  function renderTools() {
    const el = toolsEl();
    if (!H.sels.length) { el.hidden = true; el.innerHTML = ''; toolsHtml = ''; if (H.pop && H.pop.for === 'sel') closePop(); return; }
    const h = selToolsHtml(values());
    if (h !== toolsHtml) { el.innerHTML = h; toolsHtml = h; }
    el.hidden = false;
    place();
    if (H.pop && H.pop.for === 'sel') renderPop();
  }
  /** The toolbar above the selection (under it when there is no room), always inside the board. */
  function place() {
    const el = document.getElementById('hr-seltools');
    if (el && !el.hidden) {
      const b = body(), parts = b ? [...b.querySelectorAll('.hr-selbox, .hr-h'), ...H.sels.map(elOf).filter(Boolean)].map(x => x.getBoundingClientRect()) : [];
      if (parts.length) {
        const r = { left: Math.min(...parts.map(x => x.left)), right: Math.max(...parts.map(x => x.right)), top: Math.min(...parts.map(x => x.top)), bottom: Math.max(...parts.map(x => x.bottom)) };
        const bb = ctx.board.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, gap = 12;
        let top = r.top - bb.top - h - gap; if (top < 8) top = r.bottom - bb.top + gap;
        if (top + h > bb.height - 8) top = clamp(r.top - bb.top + 8, 8, bb.height - h - 8);
        const left = clamp((r.left + r.right) / 2 - bb.left - w / 2, 8, bb.width - w - 8);
        el.style.left = `${left}px`; el.style.top = `${top}px`;
      }
    }
    placePop();
  }

  // ---------------------------------------------------------------- popovers (style, More, the Shapes picker)
  function popAnchorEl() {
    if (!H.pop) return null;
    if (H.pop.kind === 'shapes') return document.querySelector('#hr-tools [data-hrmode="shape"]');
    return document.querySelector(`${H.pop.for === 'sel' ? '#hr-seltools' : '#hr-tools'} [data-hrpop="${H.pop.kind}"]`);
  }
  function toolValues() {
    const pen = H.pop.for === 'pen', line = !pen && B.isLine((B.PICKS.find(p => p.id === H.shapePick) || {}).k), st = pen ? H.style.pen : line ? H.style.line : H.style.shape;
    return { pen, c: st.c || '#141414', w: st.w || 'M', d: st.d || 'solid', a: null, lines: 0, closed: pen || line ? 0 : 1, f: st.f || 'none', fo: st.f ? st.fo || 100 : null, noneOk: !!st.f };
  }
  function renderPop() {
    let el = document.getElementById('hr-pop');
    if (!H.pop) { el?.remove(); popHtmlNow = ''; popAnchor = null; return; }
    const anchor = popAnchorEl(); if (!anchor) { closePop(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'hr-pop'; el.className = 'hr-pop panel'; el.setAttribute('role', 'dialog'); (ctx.stage || ctx.board).append(el); }
    const inner = H.pop.kind === 'shapes' ? pickerHtml(H.shapePick) : popHtml(H.pop.kind, H.pop.for === 'sel' ? values() : toolValues());
    const h = `${inner}<div class="hr-popdone">${`<button type="button" class="btn btn-sm" data-hrpop="close">${esc(tm('done'))}</button>`}</div>`;
    if (h !== popHtmlNow) { el.innerHTML = h; popHtmlNow = h; }
    el.setAttribute('aria-label', H.pop.kind === 'shapes' ? tb('shapes') : tb(`pops.${H.pop.kind}`));
    popAnchor = anchor; placePop();
  }
  /** Placed by its button (fixed, inside the screen); a sheet along the bottom on a phone. */
  function placePop() {
    const el = document.getElementById('hr-pop'); if (!el || !H.pop) return;
    const anchor = popAnchor && popAnchor.isConnected ? popAnchor : popAnchorEl(); if (!anchor) return;
    el.classList.toggle('hr-popsheet', phone());
    if (phone()) { el.style.left = el.style.top = ''; return; }
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight, a = anchor.getBoundingClientRect(), m = 8, gap = 8;
    el.style.maxHeight = ''; const w = Math.min(el.offsetWidth, vw - m * 2), h = el.offsetHeight;
    const side = anchor.closest('#hr-tools');   // from the left panel: to its right
    let left, top;
    if (side) { const pr = (anchor.closest('.hr-panel') || anchor).getBoundingClientRect(); left = pr.right + gap; top = a.top - 8; if (top + h > vh - m) top = vh - m - h; if (left + w > vw - m) left = Math.max(m, a.left - w - gap); }
    else { left = (a.left + a.right) / 2 - w / 2; top = a.bottom + gap; if (top + h > vh - m && a.top - gap - h > m) top = a.top - gap - h; }
    left = clamp(left, m, vw - m - w); top = clamp(top, m, Math.max(m, vh - m - h));
    if (top + h > vh - m) el.style.maxHeight = `${vh - m - top}px`;
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }
  function openPop(kind, forWhat) {
    if (H.pop && H.pop.kind === kind && H.pop.for === forWhat) { closePop(); return; }
    H.pop = { kind, for: forWhat }; popHtmlNow = ''; renderPop();
    if (forWhat === 'sel') { toolsHtml = ''; renderTools(); } else ctx.renderPanel();
    document.querySelector('#hr-pop button:not([disabled])')?.focus({ preventScroll: true });
  }
  function closePop() {
    if (!H.pop) return;
    const was = H.pop; H.pop = null; renderPop();
    // only the button's state changes: redrawing the toolbar here (a press elsewhere closes it) would lose that click
    for (const b of document.querySelectorAll('#hr-seltools [data-hrpop].open, #hr-tools [data-hrpop].open, #hr-tools [data-hrmode="shape"][aria-expanded="true"]')) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
    if (was.for === 'sel' && H.sels.length) toolsHtml = selToolsHtml(values());
  }

  // ---------------------------------------------------------------- select, edit, delete
  function select(list) { if (!(list.length === 1 && H.sels.length === 1 && same(list[0], H.sels[0]))) finishEdit(); H.sels = list; renderSel(); }
  function clear() { finishEdit(); if (H.sels.length) { H.sels = []; renderSel(); } }
  function selectAll() { finishEdit(); H.sels = [...H.ann.notes.map(o => ({ k: 'note', id: o.id })), ...H.ann.texts.map(o => ({ k: 'text', id: o.id })), ...H.shapes.map(o => ({ k: 'shape', id: o.id })), ...H.ann.strokes.map(o => ({ k: 'stroke', id: o.id }))]; renderSel(); }
  const free = () => H.sels.filter(s => { const o = find(s); return o && !o.lk; });
  function del() {
    const list = free(); if (!list.length) return;
    H.edit = false; ctx.remember();
    const gone = new Set(list.map(s => `${s.k}:${s.id}`));
    H.ann.notes = H.ann.notes.filter(n => !gone.has(`note:${n.id}`)); H.ann.texts = H.ann.texts.filter(n => !gone.has(`text:${n.id}`));
    H.shapes = H.shapes.filter(n => !gone.has(`shape:${n.id}`)); H.ann.strokes = H.ann.strokes.filter(n => !gone.has(`stroke:${n.id}`));
    H.sels = H.sels.filter(s => !gone.has(`${s.k}:${s.id}`)); ctx.renderArea(); ctx.queueSave();
  }
  /** Type in the selected note or text, in place; the caret at (cx, cy) when given, else at the end of its words. */
  function startEdit(cx = null, cy = null, { fresh = false } = {}) {
    const s = one(); if (!typed(s) || H.edit || find(s)?.lk) return;
    const el = textEl(s); if (!el) return;
    if (!fresh) ctx.remember();
    H.edit = true; elOf(s).classList.add('hr-typing');
    el.contentEditable = 'true'; el.spellcheck = true; el.setAttribute('role', 'textbox'); el.setAttribute('aria-multiline', 'true');
    renderSel();   // the handles go first, so the caret is found under the press, not on a handle
    el.focus({ preventScroll: true }); caretAt(el, cx, cy);
    el.addEventListener('input', onInput); el.addEventListener('keydown', onKey); el.addEventListener('paste', onTypePaste); el.addEventListener('focusout', onBlur);
  }
  function onInput(e) {
    const s = one(), o = find(s), el = e.currentTarget; if (!o || !typed(s)) return;
    let v = readText(el); if (v.length > MAXCH[s.k]) { v = v.slice(0, MAXCH[s.k]); el.textContent = v; caretAt(el); }
    o.text = v; ctx.queueSave(); renderSel();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(); ctx.board.focus({ preventScroll: true }); }
    else e.stopPropagation();   // typing never reaches the page's shortcuts (Delete, arrows, copy and paste)
  }
  function onTypePaste(e) {
    e.stopPropagation();
    const v = e.clipboardData && e.clipboardData.getData('text/plain'); if (v == null) return;
    e.preventDefault(); document.execCommand('insertText', false, v);
  }
  function onBlur() { setTimeout(() => { if (H.edit && !textEl(one())?.contains(document.activeElement)) finishEdit(); }, 0); }
  function finishEdit() {
    if (!H.edit) return;
    H.edit = false;
    const s = one(), o = find(s), el = textEl(s);
    if (o && el) o.text = readText(el).slice(0, MAXCH[s.k]);
    if (s && s.k === 'text' && o && !String(o.text || '').trim()) { H.ann.texts = H.ann.texts.filter(n => n !== o); H.sels = []; }
    if (H.hist.length && H.hist[H.hist.length - 1] === ctx.snapshot()) ctx.forget(); else ctx.queueSave();
    window.getSelection()?.removeAllRanges();
    ctx.renderArea();
  }
  /** A new note or text box at a point (area fractions), selected and ready to type in, in the last style used. */
  function add(kind, at) {
    ctx.remember();
    const b = kind === 'note' ? NOTE_BOX : TEXT_NEW;
    const o = { id: newId(kind === 'note' ? 'n' : 'x'), text: '', x: clamp(at.x, 0, 1 - b.w / W), y: clamp(at.y - (kind === 'text' ? 14 / HH : 0), 0, 1 - b.h / HH), w: b.w, h: b.h, by: 't', ...clone(H.style[kind] || {}) };
    LIST[kind]().push(o);
    finishEdit(); H.sels = [{ k: kind, id: o.id }]; ctx.renderArea(); startEdit(null, null, { fresh: true });
  }

  // ---------------------------------------------------------------- drawing new shapes and pen lines
  const pickNow = () => B.PICKS.find(p => p.id === H.shapePick) || B.PICKS[0];
  function shapeStart(at) {
    if (H.shapes.length >= MAX.shape) { toast(th('tooMany'), { bad: true }); return null; }
    ctx.remember();
    const p = pickNow(), line = B.isLine(p.k);
    drawing = { id: newId('s'), k: p.k, x: at.x, y: at.y, x2: at.x, y2: at.y, ...clone(line ? H.style.line : H.style.shape), ...(line && p.a ? { a: p.a } : {}), z: topZ() + 1 };
    if (!drawing.c) drawing.c = '#141414';
    H.shapes.push(drawing); redrawSvg();
    return drawing;
  }
  /** The shape being drawn follows the pointer; Shift keeps a box square (a line at 45 degree steps). */
  function shapeMove(at, shift) {
    const s = drawing; if (!s) return;
    let dx = (at.x - s.x) * W, dy = (at.y - s.y) * HH;
    if (shift) {
      if (B.isLine(s.k)) { const l = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); dx = Math.cos(a) * l; dy = Math.sin(a) * l; }
      else {
        // as big as the pointer asks, but never past the area's edge (so it stays square there too)
        const sx = Math.sign(dx || 1), sy = Math.sign(dy || 1), room = Math.min(sx > 0 ? W - s.x * W : s.x * W, sy > 0 ? HH - s.y * HH : s.y * HH);
        const m = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), room); dx = sx * m; dy = sy * m;
      }
    }
    s.x2 = clamp(s.x + dx / W, 0, 1); s.y2 = clamp(s.y + dy / HH, 0, 1); redrawSvg();
  }
  /** Let go: a tap puts a middle-sized one there. -> the new shape's ref */
  function shapeEnd() {
    const s = drawing; drawing = null; if (!s) return null;
    if (Math.abs(s.x2 - s.x) * W < 12 && Math.abs(s.y2 - s.y) * HH < 12) {
      const wide = ['rect', 'rrect', 'speech', 'arrow', 'darrow', 'para', 'trap', 'chevron', 'cloud'].includes(s.k), w = B.isLine(s.k) || wide ? 160 : 120, h = B.isLine(s.k) ? 0 : wide ? 100 : 120;
      s.x = clamp(s.x, 0, 1 - w / W); s.y = clamp(s.y, 0, 1 - h / HH); s.x2 = s.x + w / W; s.y2 = s.y + h / HH;
    }
    ctx.queueSave();
    return { k: 'shape', id: s.id };
  }
  function penStart(at) {
    if (H.ann.strokes.length >= MAX.stroke) { toast(th('tooMany'), { bad: true }); return false; }
    ctx.remember(); H.ann.strokes.push({ id: newId('p'), ...clone(H.style.pen), pts: [at], z: topZ() + 1 }); return true;
  }
  function penMove(p) { const s = H.ann.strokes[H.ann.strokes.length - 1]; if (s && p && s.pts.length < 600) { s.pts.push(p); redrawSvg(); } }
  function penEnd() { const n = H.ann.strokes.length; H.ann.strokes = H.ann.strokes.filter(s => s.pts.length > 1); if (H.ann.strokes.length < n) ctx.forget(); ctx.renderArea(); ctx.queueSave(); }

  // ---------------------------------------------------------------- styles
  /** One style field on one object. -> whether it changed */
  function setOn(s, o, f, v) {
    const before = JSON.stringify(o), line = s.k === 'shape' && B.isLine(o.k), closed = s.k === 'shape' && !line, draw = s.k === 'shape' || s.k === 'stroke';
    const put = (k, val, def) => { if (val === def || val == null) delete o[k]; else o[k] = val; };
    if (f === 'c' && draw && B.PALETTE.includes(v)) o.c = v;
    else if (f === 'c' && closed && v === 'none' && o.f) o.c = 'none';
    else if (f === 'f' && closed) { if (v === 'none') { delete o.f; delete o.fo; if (o.c === 'none') o.c = '#141414'; } else if (B.PALETTE.includes(v)) o.f = v; }
    else if (f === 'fo' && closed && o.f && B.OPACITIES.includes(+v)) put('fo', +v, 100);
    else if (f === 'w' && draw && B.WEIGHTS.includes(v)) put('w', v, 'M');
    else if (f === 'd' && draw && B.DASHES.includes(v)) put('d', v, 'solid');
    else if (f === 'a' && line && B.ARROWS.includes(v)) put('a', v, 'none');
    else if (f === 'tc' && s.k === 'text' && B.PALETTE.includes(v)) o.tc = v;
    else if (f === 'b' && s.k === 'text') put('b', v === '1' ? 1 : null, null);
    else if (f === 'al' && s.k === 'text' && B.ALIGNS.includes(v)) put('al', v, 'l');
    else if (f === 'nc' && s.k === 'note' && v in B.NOTE_COLORS) put('nc', v, 'yellow');
    return JSON.stringify(o) !== before;
  }
  /** The next object of that kind gets the style just picked. */
  function rememberStyle(s, o, f) {
    const key = s.k === 'stroke' ? 'pen' : s.k === 'shape' ? (B.isLine(o.k) ? 'line' : 'shape') : s.k;
    const st = H.style[key] || (H.style[key] = {}), map = { pen: ['c', 'w', 'd'], line: ['c', 'w', 'd'], shape: ['c', 'f', 'fo', 'w', 'd'], text: ['tc', 'b', 'al', 'fs'], note: ['nc'] }[key];
    const fields = f === 'f' ? ['f', 'fo', 'c'] : [f];
    for (const k of fields) if (map.includes(k)) { if (o[k] === undefined) delete st[k]; else st[k] = o[k]; }
    saveStyle();
  }
  function setStyle(f, v) {
    if (H.pop && H.pop.for !== 'sel') {
      // the pen's or the shape tool's next one
      const pen = H.pop.for === 'pen', line = !pen && B.isLine(pickNow().k), key = pen ? 'pen' : line ? 'line' : 'shape', st = H.style[key];
      const probe = { k: pen ? 'stroke' : 'shape' }, o = { ...st, k: pen ? undefined : (line ? 'line' : 'rect') };
      if (setOn(probe, o, f, v)) { delete o.k; H.style[key] = o; saveStyle(); }
      renderPop(); ctx.renderPanel(); return;
    }
    const list = free(); if (!list.length) return;
    const before = ctx.snapshot(); let changed = false, last = null;
    for (const s of list) { const o = find(s); if (o && setOn(s, o, f, v)) { changed = true; last = { s, o }; rememberStyle(s, o, f); } }
    if (!changed) return;
    H.hist.push(before); if (H.hist.length > 80) H.hist.shift(); H.redo = [];
    if (list.some(s => !typed(s))) redrawSvg();
    for (const s of list) if (typed(s)) restyle(s);
    ctx.queueSave(); renderSel();
    void last;
  }
  function textSize(dir) {
    finishEdit();
    const list = free().filter(s => s.k === 'text'); if (!list.length) return;
    const before = ctx.snapshot(); let changed = false;
    for (const s of list) { const o = find(s); if (o && textSizeButton(o, dir)) { changed = true; H.style.text.fs = o.fs; if (!o.fs) delete H.style.text.fs; } }
    if (!changed) return;
    saveStyle(); H.hist.push(before); H.redo = []; ctx.renderArea(); ctx.queueSave();
  }

  // ---------------------------------------------------------------- copy, cut, paste, duplicate, arrange, lock
  let memClip = null;
  const readClip = () => { try { const v = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); if (v && Array.isArray(v.items)) return v; } catch { /* blocked */ } return memClip; };
  const writeClip = c => { memClip = c; try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* this page only */ } };
  /** The selection on this browser's board clipboard (any Homeroom class can paste it). -> the clip */
  function copySel() {
    const items = order(H.sels).map(s => ({ k: s.k, o: clone(find(s)) })).filter(x => x.o);
    if (!items.length) return null;
    for (const x of items) delete x.o.lk;
    const c = { v: 1, t: Date.now(), items, text: items.filter(x => typed(x)).map(x => x.o.text).filter(Boolean).join('\n\n'), n: 0, sys: false };
    hover.moved = false;   // a paste right after lands next to it; once the pointer moves, at the pointer
    writeClip(c); return c;
  }
  /** Put items on the board, selected: offset (16 px, more each time the same clip is pasted again) or at a point. */
  function pasteItems(raw, { at = null, offset = 16 } = {}) {
    const items = (Array.isArray(raw) ? raw : []).map(cleanItem).filter(Boolean);
    if (!items.length) { toast(tb('nothingToPaste')); return false; }
    for (const k of Object.keys(MAX)) if (LIST[k]().length + items.filter(x => x.k === k).length > MAX[k]) { toast(th('tooMany'), { bad: true }); return false; }
    finishEdit(); ctx.remember();
    const bx = x => (x.k === 'shape' ? B.boxOf(x.o, W, HH) : x.k === 'stroke' ? union(x.o.pts.map(p => ({ x: p.x * W, y: p.y * HH, w: 0, h: 0 }))) : { x: x.o.x * W, y: x.o.y * HH, w: +x.o.w, h: +x.o.h });
    const u = union(items.map(bx));
    let dx = at ? at.x - u.x : offset, dy = at ? at.y - u.y : offset;
    dx = clamp(dx, -u.x, W - u.x - u.w); dy = clamp(dy, -u.y, HH - u.y - u.h);
    let z = topZ();
    const refs = [];
    for (const x of items) {
      const o = x.o; o.id = newId({ note: 'n', text: 'x', shape: 's', stroke: 'p' }[x.k]);
      if (x.k === 'shape') { o.x = clamp(o.x + dx / W, 0, 1); o.x2 = clamp(o.x2 + dx / W, 0, 1); o.y = clamp(o.y + dy / HH, 0, 1); o.y2 = clamp(o.y2 + dy / HH, 0, 1); o.z = ++z; }
      else if (x.k === 'stroke') { o.pts = o.pts.map(p => ({ x: clamp(p.x + dx / W, 0, 1), y: clamp(p.y + dy / HH, 0, 1) })); o.z = ++z; }
      else { o.x = clamp(o.x + dx / W, 0, 1); o.y = clamp(o.y + dy / HH, 0, 1); }
      LIST[x.k]().push(o); refs.push({ k: x.k, id: o.id });
    }
    H.sels = refs; ctx.renderArea(); ctx.queueSave();
    return true;
  }
  /** Paste this browser's board clipboard (Cmd/Ctrl+V lands at the pointer when it moved since; else offset). */
  function pasteClip({ pointer = false } = {}) {
    const c = readClip(); if (!c || !c.items.length) { toast(tb('nothingToPaste')); return; }
    const at = pointer && hover.moved && hover.p ? hover.p : null;
    if (at) { hover.moved = false; c.n = 0; } else c.n = (c.n || 0) + 1;
    writeClip(c);
    pasteItems(clone(c.items), { at, offset: 16 * c.n });
  }
  /** Words from somewhere else: a new text box, at the pointer or near the top left. */
  function pasteText(text) {
    const v = String(text).replace(/\r/g, '').slice(0, MAXCH.text); if (!v.trim()) return;
    const w = clamp(Math.round(Math.min(...[600, 40 + Math.max(...v.split('\n').map(l => l.length)) * 10])), 160, 600), lines = v.split('\n').length;
    const at = hover.moved && hover.p ? hover.p : { x: 40, y: 40 }; hover.moved = false;
    pasteItems([{ k: 'text', o: { text: v, x: at.x / W, y: at.y / HH, w, h: Math.min(380, 28 * lines + 12), ...clone(H.style.text) } }], { offset: 0 });
  }
  function duplicate() {
    const items = order(H.sels).map(s => ({ k: s.k, o: clone(find(s)) })).filter(x => x.o); if (!items.length) return;
    for (const x of items) delete x.o.lk;
    pasteItems(items, { offset: 16 });
  }
  async function copyButton(cut = false) {
    const c = copySel(); if (!c) return;
    if (cut) del();
    toast(tb(cut ? 'cutDone' : 'copied'));
    // the words on the system clipboard too, where the browser allows it (a tap is a user gesture)
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        const htmlStr = clipHtml(c), data = { 'text/html': new Blob([htmlStr], { type: 'text/html' }), ...(c.text ? { 'text/plain': new Blob([c.text], { type: 'text/plain' }) } : {}) };
        await navigator.clipboard.write([new window.ClipboardItem(data)]);
      } else if (c.text && navigator.clipboard) await navigator.clipboard.writeText(c.text);
      else return;
      c.sys = true; writeClip(c);
    } catch { /* not allowed here: this browser's board clipboard still has it */ }
  }
  async function pasteButton() {
    const c = readClip(); if (c && c.items.length) { pasteClip(); return; }
    try { const v = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; if (v && v.trim()) { pasteText(v); return; } } catch { /* not allowed */ }
    toast(tb('nothingToPaste'));
  }
  const clipHtml = c => `<meta charset="utf-8"><div data-oomba-board="${encodeURIComponent(JSON.stringify({ v: 1, t: c.t, items: c.items }))}">${esc(c.text).replace(/\n/g, '<br>')}</div>`;
  /** Safari copies and pastes only where something is selected or typed: for Cmd/Ctrl+C, X and V the focus goes to a
   *  hidden field for a moment, so the browser sends its copy, cut or paste event (handled below), then back. */
  function trap() {
    let el = document.getElementById('hr-cliptrap');
    if (!el) { el = document.createElement('textarea'); el.id = 'hr-cliptrap'; el.className = 'hr-cliptrap'; el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1; document.body.append(el); }
    el.value = ' '; el.focus({ preventScroll: true }); el.select();
    setTimeout(() => { if (document.activeElement === el) ctx.board.focus({ preventScroll: true }); }, 0);
  }
  const trapped = tg => !!(tg && tg.id === 'hr-cliptrap');
  /** The browser's copy and cut (Cmd/Ctrl+C, X, the Edit menu): the system clipboard gets the words and the objects. */
  function onCopy(e, cut = false) {
    if ((fieldIn(e.target) && !trapped(e.target)) || H.edit) return;
    const fromKey = pending && Date.now() - pending.t < 1500; const c = fromKey ? pending : (H.sels.length ? copySel() : null);
    pending = null;
    if (!c || !e.clipboardData) return;
    c.sys = true; writeClip(c);
    if (c.text) e.clipboardData.setData('text/plain', c.text);
    e.clipboardData.setData('text/html', clipHtml(c));
    e.preventDefault();
    if (cut && !fromKey) del();
  }
  /** The browser's paste: our objects (from any Homeroom class in this browser), or words from elsewhere as a text box. */
  function onPaste(e) {
    if ((fieldIn(e.target) && !trapped(e.target)) || H.edit) return;
    if (pasteTimer) { clearTimeout(pasteTimer); pasteTimer = null; }
    const dt = e.clipboardData; e.preventDefault();
    if (!dt) { pasteClip({ pointer: true }); return; }
    const htmlStr = dt.getData('text/html') || '', text = (dt.getData('text/plain') || '').replace(/\r/g, ''), m = /data-oomba-board="([^"]+)"/.exec(htmlStr), c = readClip();
    if (m) {
      try {
        const o = JSON.parse(decodeURIComponent(m[1]));
        if (c && c.t === o.t) { pasteClip({ pointer: true }); return; }
        pasteItems(o.items, { at: hover.moved && hover.p ? hover.p : null }); hover.moved = false; return;
      } catch { /* not ours after all */ }
    }
    // the system clipboard has the newest words unless they are this clip's own (or there are none)
    const ours = c && c.items.length && (text === c.text || !text.trim());
    if (ours) pasteClip({ pointer: true }); else if (text.trim()) pasteText(text); else toast(tb('nothingToPaste'));
  }
  /** Bring to front / send to back (drawings share one layer; notes and text boxes each keep their own). */
  function arrange(front) {
    const list = order(free()); if (!list.length) return;
    ctx.remember();
    let z = front ? topZ() : botZ();
    const ds = list.filter(s => !typed(s)); (front ? ds : [...ds].reverse()).forEach(s => { find(s).z = front ? ++z : --z; });
    for (const k of ['note', 'text']) {
      const ids = new Set(list.filter(s => s.k === k).map(s => s.id)); if (!ids.size) continue;
      const arr = LIST[k](), picked = arr.filter(o => ids.has(o.id)), rest = arr.filter(o => !ids.has(o.id));
      arr.splice(0, arr.length, ...(front ? [...rest, ...picked] : [...picked, ...rest]));
    }
    ctx.renderArea(); ctx.queueSave();
  }
  function toggleLock() {
    const list = H.sels.map(find).filter(Boolean); if (!list.length) return;
    ctx.remember(); const lock = !list.every(o => o.lk);
    for (const o of list) { if (lock) o.lk = 1; else delete o.lk; }
    finishEdit(); ctx.renderArea(); ctx.queueSave();
  }
  function nudge(dx, dy) {
    const list = free(); if (!list.length) return;
    const u = union(list.map(aabb)); if (!u) return;
    const mx = clamp(dx, -u.x, W - u.x - u.w), my = clamp(dy, -u.y, HH - u.y - u.h); if (!mx && !my) return;
    ctx.remember(); for (const s of list) moveBy(s, find(s), clone(find(s)), box(s), mx, my);
    redrawSvg(); renderSel(); ctx.queueSave();
  }

  // ---------------------------------------------------------------- pressing, dragging, resizing, turning
  function distTo(d, p) {
    if (d.kind === 'stroke') return polyDist(d.o.pts.map(q => [q.x * W, q.y * HH]), p, false);
    if (B.isLine(d.o.k)) return polyDist(B.linePts(d.o, W, HH).pts, p, false);
    const b = B.boxOf(d.o, W, HH), q = d.o.r ? rot(p, mid(b), -d.o.r) : p;
    return polyDist(B.outlinePts(d.o, W, HH), q, true);
  }
  function insideOf(o, p) { const b = B.boxOf(o, W, HH), q = o.r ? rot(p, mid(b), -o.r) : p; return inPoly(B.outlinePts(o, W, HH), q); }
  /** What is under a press (area pixels p), or null: notes and text by their element, then (within tol) pen lines and
   *  outlines, topmost first, then the inside of a closed shape. A press inside the selection (its box) is on it. */
  function hit(p, tol, target, adding) {
    const n = target.closest('.hr-area [data-note]'); if (n) return { k: 'note', id: n.dataset.note };
    const x = target.closest('.hr-area [data-text]'); if (x) return { k: 'text', id: x.dataset.text };
    if (!adding && H.sels.length) {
      const u = H.sels.length > 1 ? selBox() : null;
      if (u && p.x >= u.x - tol && p.x <= u.x + u.w + tol && p.y >= u.y - tol && p.y <= u.y + u.h + tol) return { group: true };
      const s = one();
      if (s && !typed(s)) { const b = box(s), q = turnOf(s) ? rot(p, mid(b), -turnOf(s)) : p; if (b && q.x >= b.x - tol && q.x <= b.x + b.w + tol && q.y >= b.y - tol && q.y <= b.y + b.h + tol) return s; }
    }
    const ds = B.drawings(H.shapes, H.ann.strokes).reverse(), ref = d => ({ k: d.kind, id: d.o.id });
    for (const d of ds) if (distTo(d, p) <= tol) return ref(d);
    for (const d of ds) if (d.kind === 'shape' && !B.isLine(d.o.k) && insideOf(d.o, p)) return ref(d);
    return null;
  }
  /** Hover: where a paste lands (the pointer, once it moved). */
  function hoverAt(e) {
    const p = ctx.areaPt(e.clientX, e.clientY);
    const inA = p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= HH;
    if (inA && (!hover.p || Math.hypot(p.x - hover.p.x, p.y - hover.p.y) > 4)) { hover.p = p; hover.moved = true; } else if (!inA) { hover.p = null; hover.moved = false; }
  }
  /** A press on the board in Select. -> true when it was on an object, a handle or the empty area. */
  function down(e) {
    if (H.edit && textEl(one())?.contains(e.target)) return true;   // placing the caret while typing
    const p = ctx.areaPt(e.clientX, e.clientY), z = ctx.zoom(), tol = Math.max(6, 14 / z), adding = e.shiftKey || e.metaKey || e.ctrlKey;
    const hEl = e.target.closest('[data-hrh]'), s1 = one();
    if (hEl && s1 && find(s1) && !find(s1).lk) {
      ctx.remember(); closePop();
      g = { kind: hEl.dataset.hrh === 'rot' ? 'rotate' : 'resize', h: hEl.dataset.hrh, id: e.pointerId, sx: e.clientX, sy: e.clientY, b0: box(s1), o: clone(find(s1)), s: s1, moved: false };
    } else {
      if (p.x < -tol || p.y < -tol || p.x > W + tol || p.y > HH + tol) return false;
      const s = hit(p, tol, e.target, adding);
      closePop();
      if (!s) { g = { kind: 'marquee', id: e.pointerId, sx: e.clientX, sy: e.clientY, p0: p, base: adding ? [...H.sels] : [], adding, moved: false }; }
      else if (adding) {
        finishEdit(); const on = H.sels.some(r => same(r, s));
        H.sels = on ? H.sels.filter(r => !same(r, s)) : [...H.sels, s]; renderSel();
        g = { kind: 'none', id: e.pointerId };
      } else {
        const was = !s.group && H.sels.length === 1 && same(s, H.sels[0]);
        if (!s.group && !H.sels.some(r => same(r, s))) select([s]);
        g = { kind: 'drag', s, was, id: e.pointerId, sx: e.clientX, sy: e.clientY, items: free().map(r => ({ r, o: clone(find(r)), b: box(r) })), u: union(free().map(aabb)), moved: false };
      }
    }
    try { ctx.board.setPointerCapture(e.pointerId); } catch { /* gone */ }
    e.preventDefault(); return true;
  }
  function moveBy(s, o, o0, b0, mx, my) {
    if (typed(s)) { o.x = (b0.x + mx) / W; o.y = (b0.y + my) / HH; const el = elOf(s); if (el) { el.style.left = `${o.x * 100}%`; el.style.top = `${o.y * 100}%`; } }
    else if (s.k === 'shape') Object.assign(o, { x: o0.x + mx / W, x2: o0.x2 + mx / W, y: o0.y + my / HH, y2: o0.y2 + my / HH });
    else o.pts = o0.pts.map(q => ({ x: q.x + mx / W, y: q.y + my / HH }));
  }
  function move(e) {
    if (!g || e.pointerId !== g.id) return false;
    if (H.pointers && H.pointers.size > 1) { const was = g; g = null; if (was.kind === 'marquee') renderSel(); return false; }   // a pinch takes over
    if (g.kind === 'none') return true;
    const z = ctx.zoom(), dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return true;
    if (!g.moved && g.kind === 'drag') { finishEdit(); ctx.remember(); }
    g.moved = true;
    if (g.kind === 'marquee') {
      const p = ctx.areaPt(e.clientX, e.clientY), r = { x: Math.min(p.x, g.p0.x), y: Math.min(p.y, g.p0.y), w: Math.abs(p.x - g.p0.x), h: Math.abs(p.y - g.p0.y) };
      g.r = r;
      const all = [...H.ann.notes.map(o => ({ k: 'note', id: o.id })), ...H.ann.texts.map(o => ({ k: 'text', id: o.id })), ...H.shapes.map(o => ({ k: 'shape', id: o.id })), ...H.ann.strokes.map(o => ({ k: 'stroke', id: o.id }))];
      const got = all.filter(s => { const a = aabb(s); return a && meets(a, r); });
      H.sels = [...g.base, ...got.filter(s => !g.base.some(b => same(b, s)))];
      renderSel(); return true;
    }
    if (g.kind === 'drag') {
      const u = g.u; if (!u) return true;
      const mx = clamp(dx, -u.x, W - u.x - u.w), my = clamp(dy, -u.y, HH - u.y - u.h);
      for (const it of g.items) { const o = find(it.r); if (o) moveBy(it.r, o, it.o, it.b, mx, my); }
      if (g.items.some(it => !typed(it.r))) redrawSvg();
    } else if (g.kind === 'rotate') {
      const o = find(g.s), b = g.b0, c = mid(b), p = ctx.areaPt(e.clientX, e.clientY);
      let deg = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : (Math.abs(((deg % 90) + 90) % 90) < 4 || Math.abs(((deg % 90) + 90) % 90) > 86 ? Math.round(deg / 90) * 90 : Math.round(deg));
      deg = ((deg + 540) % 360) - 180; if (deg === -180) deg = 180;
      if (deg) o.r = deg; else delete o.r;
      if (g.s.k === 'text') restyle(g.s); else redrawSvg();
    } else resizeTo(g.s, find(g.s), g, dx, dy, e.shiftKey);
    renderSel(); return true;
  }
  function resizeTo(s, o, g, dx, dy, keep) {
    const b0 = g.b0; if (!o) return;
    if (s.k === 'shape' && B.isLine(o.k)) {
      const fix = g.h === 'a' ? { x: g.o.x2 * W, y: g.o.y2 * HH } : { x: g.o.x * W, y: g.o.y * HH };
      let q = { x: (g.h === 'a' ? g.o.x : g.o.x2) * W + dx, y: (g.h === 'a' ? g.o.y : g.o.y2) * HH + dy };
      if (keep) { const l = Math.hypot(q.x - fix.x, q.y - fix.y), a = Math.round(Math.atan2(q.y - fix.y, q.x - fix.x) / (Math.PI / 4)) * (Math.PI / 4); q = { x: fix.x + Math.cos(a) * l, y: fix.y + Math.sin(a) * l }; }
      q = { x: clamp(q.x / W, 0, 1), y: clamp(q.y / HH, 0, 1) };
      if (g.h === 'a') { o.x = q.x; o.y = q.y; } else { o.x2 = q.x; o.y2 = q.y; }
      redrawSvg(); return;
    }
    const min = s.k === 'note' ? { w: NOTE_BOX.wMin, h: NOTE_BOX.hMin, wMax: NOTE_BOX.wMax, hMax: NOTE_BOX.hMax } : s.k === 'text' ? { w: TEXT_BOX.wMin, h: TEXT_BOX.hMin, wMax: TEXT_BOX.wMax, hMax: TEXT_BOX.hMax } : { w: 8, h: 8 };
    // a text box or note can be made shorter than its words only down to what they need (its height is a minimum)
    const deg = turnOf(s, g.o);
    let b1 = pullTurned(b0, g.h, dx, dy, min, AREA, deg, keep);
    if (deg) { b1.x = clamp(b1.x, 0, W - b1.w); b1.y = clamp(b1.y, 0, HH - b1.h); }
    if (typed(s)) {
      o.x = b1.x / W; o.y = b1.y / HH; o.w = Math.round(b1.w); o.h = Math.round(b1.h);
      const el = elOf(s); if (el) Object.assign(el.style, { left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.w}px`, minHeight: `${o.h}px` });
    } else if (s.k === 'shape') {
      // a shape keeps which way it was drawn (its corners' order)
      const fx = g.o.x2 < g.o.x, fy = g.o.y2 < g.o.y, X = [b1.x / W, (b1.x + b1.w) / W], Y = [b1.y / HH, (b1.y + b1.h) / HH];
      Object.assign(o, { x: fx ? X[1] : X[0], x2: fx ? X[0] : X[1], y: fy ? Y[1] : Y[0], y2: fy ? Y[0] : Y[1] }); redrawSvg();
    } else {
      const kx = b0.w > 1 ? b1.w / b0.w : 1, ky = b0.h > 1 ? b1.h / b0.h : 1;
      o.pts = g.o.pts.map(q => ({ x: clamp((b1.x + (q.x * W - b0.x) * kx) / W, 0, 1), y: clamp((b1.y + (q.y * HH - b0.y) * ky) / HH, 0, 1) })); redrawSvg();
    }
  }
  function up(e) {
    if (!g || e.pointerId !== g.id) return false;
    const d = g; g = null;
    if (d.kind === 'none') return true;
    if (d.kind === 'marquee') { if (!d.moved && !d.adding) { clear(); } renderSel(); return true; }
    if (d.moved) { ctx.queueSave(); renderSel(); return true; }
    if (d.kind === 'resize' || d.kind === 'rotate') { ctx.forget(); if (typed(one())) startEdit(e.clientX, e.clientY); return true; }   // a tap on a handle is a tap on it
    if (d.kind === 'drag' && !d.s.group && H.sels.length > 1) { select([d.s]); return true; }
    if (d.was && typed(d.s)) startEdit(e.clientX, e.clientY);   // a second tap (or the second click of a double-click) types
    return true;
  }
  /** The toolbars' and popovers' buttons. -> true when it was one of them */
  function click(e) {
    const shp = e.target.closest('[data-hrshape]');
    if (shp) { H.shapePick = shp.dataset.hrshape; closePop(); ctx.setMode('shape'); return true; }
    const pop = e.target.closest('[data-hrpop]');
    if (pop) {
      if (pop.dataset.hrpop === 'close') { closePop(); return true; }
      const forWhat = pop.closest('#hr-seltools') ? 'sel' : H.mode === 'pen' ? 'pen' : 'shape';
      openPop(pop.dataset.hrpop, forWhat); return true;
    }
    const set = e.target.closest('[data-hrset]');
    if (set) { const v = set.dataset.hrset, i = v.indexOf(':'); setStyle(v.slice(0, i), v.slice(i + 1)); return true; }
    const b = e.target.closest('[data-hrsel]'); if (!b) return false;
    const k = b.dataset.hrsel;
    if (!['copy', 'paste', 'all'].includes(k) && H.pop && H.pop.kind === 'more') closePop();
    if (k === 'edit') startEdit();
    else if (k === 'done') finishEdit();
    else if (k === 'delete') del();
    else if (k === 'dup') duplicate();
    else if (k === 'copy') { copyButton(false); closePop(); }
    else if (k === 'cut') copyButton(true);
    else if (k === 'paste') { closePop(); pasteButton(); }
    else if (k === 'front' || k === 'back') arrange(k === 'front');
    else if (k === 'lock') toggleLock();
    else if (k === 'all') { closePop(); selectAll(); }
    else if (k === 'smaller' || k === 'bigger') textSize(k === 'bigger' ? 1 : -1);
    return true;
  }
  /** The keyboard (not while typing in it or in any field). */
  function key(e) {
    if (H.edit || fieldIn(e.target)) return;
    if (e.key === 'Escape' && H.pop) { closePop(); e.preventDefault(); return; }
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = (e.key || '').toLowerCase();
    if (mod) {
      if (k === 'z') { if (e.shiftKey) ctx.redo(); else ctx.undo(); e.preventDefault(); }
      else if (k === 'y' && e.ctrlKey) { ctx.redo(); e.preventDefault(); }
      else if (k === 'c' && H.sels.length) { pending = copySel(); trap(); }   // the copy event fills the system clipboard
      else if (k === 'x' && H.sels.length && free().length) { pending = copySel(); trap(); setTimeout(del, 0); }
      // the paste event brings what is on the system clipboard; without one, this browser's board clipboard
      else if (k === 'v') { clearTimeout(pasteTimer); trap(); pasteTimer = setTimeout(() => { pasteTimer = null; pasteClip({ pointer: true }); }, 150); }
      else if (k === 'd' && H.sels.length) { duplicate(); e.preventDefault(); }
      else if (k === 'a' && !H.seatsOpen) { selectAll(); e.preventDefault(); }
      return;
    }
    if (!H.sels.length) return;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Delete' || e.key === 'Backspace') { del(); e.preventDefault(); }
    else if (e.key === 'Escape') clear();
    else if (e.key === 'Enter' && typed(one())) { startEdit(); e.preventDefault(); }
    else if (dir && !e.target.closest('.hr-desk')) { const st = e.shiftKey ? 10 : 1; nudge(dir[0] * st, dir[1] * st); e.preventDefault(); }
  }
  /** After a new drawing (the shape just drawn, the pen line): selected. */
  const selectNew = s => { H.sels = [s]; renderSel(); };
  // a press outside a popover closes it
  document.addEventListener('pointerdown', e => { if (H.pop && !e.target.closest('#hr-pop, [data-hrpop], [data-hrmode="shape"]')) closePop(); }, true);

  return { html, renderSel, place, down, move, up, click, key, clear, finishEdit, add, selectNew, find, redrawSvg, normalize, hoverAt, onCopy, onPaste, closePop, openPop,
    shapeStart, shapeMove, shapeEnd, penStart, penMove, penEnd, values, pasteButton };
}
