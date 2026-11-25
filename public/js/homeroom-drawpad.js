// A small drawing pad with the desk pad's tools (public/js/homeroom-desk.js: the same five pen colors, Undo and Clear,
// strokes as fractions of a 900 x 600 page, a resting palm ignored once a pencil is used). K-2 mode uses it where young
// students draw instead of writing (docs/decisions.md "Homeroom: K-2 mode, absent and at home"): a notebook page's
// drawing (public/js/notebook.js) and the reading routine's "Draw what happened" (public/js/homeroom-reading.js).
// The server cleans every stroke again (services/homeroom.js cleanStrokes).
import { esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';

export const PAD_W = 900, PAD_H = 600;
export const PAD_COLORS = ['#141414', '#1E88E5', '#1F9D63', '#FF6B4A', '#8C6BD1'];
// (the words come from the page that uses it, in its own strings: words.pens, words.pen(n), words.undo, words.clear,
// words.label, words.picture)

/** The pad's markup: a toolbar (pens, Undo, Clear) and the paper. label: what the paper is for (screen readers). */
export function drawPadHtml({ label = '', id = 'dp', words = {} } = {}) {
  const tp = (k, v) => (typeof words[k] === 'function' ? words[k](v) : words[k] || '');
  return `<div class="dp" data-dp="${esc(id)}">
    <div class="dp-bar"><span class="hd-pens" role="radiogroup" aria-label="${esc(tp('pens'))}">${PAD_COLORS.map((c, i) => `<button type="button" class="hd-pen${i ? '' : ' on'}" role="radio" aria-checked="${!i}" data-dppen="${c}" aria-label="${esc(tp('pen', { n: i + 1 }))}"><i style="background:${c}"></i></button>`).join('')}</span>
      <span class="hd-grow"></span>
      <button type="button" class="hd-tool" data-dpdo="undo" aria-label="${esc(tp('undo'))}">${iconHtml('↩', { size: 18 })}<span>${esc(tp('undo'))}</span></button>
      <button type="button" class="hd-tool" data-dpdo="clear" aria-label="${esc(tp('clear'))}">${iconHtml('🧽', { size: 18 })}<span>${esc(tp('clear'))}</span></button></div>
    <div class="dp-box"><svg class="hd-svg dp-svg" viewBox="0 0 ${PAD_W} ${PAD_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label || tp('label'))}">
      <rect class="hd-paper" x="1" y="1" width="${PAD_W - 2}" height="${PAD_H - 2}" rx="14"/><g data-dpink></g><g data-dpcur></g></svg></div></div>`;
}
/** A drawing as a read-only picture ('' when it has no strokes). */
export function drawingHtml(strokes, label = '') {
  if (!Array.isArray(strokes) || !strokes.length) return '';
  return `<svg class="dp-pic" viewBox="0 0 ${PAD_W} ${PAD_H}" role="img" aria-label="${esc(label)}"><rect class="hd-paper" x="1" y="1" width="${PAD_W - 2}" height="${PAD_H - 2}" rx="14"/>${strokes.map(s => inkLine(s, PAD_W, PAD_H)).join('')}</svg>`;
}

/**
 * Wire a pad drawn by drawPadHtml inside el. opts: { strokes (to start from), max: { strokes, points, total },
 * onChange(strokes), full() (said when it is full) }. -> { strokes(), set(strokes), destroy() }
 */
export function drawPad(el, opts = {}) {
  const box = el.querySelector('.dp'), svg = box.querySelector('.dp-svg'), ink = box.querySelector('[data-dpink]'), curG = box.querySelector('[data-dpcur]');
  const max = { strokes: 80, points: 400, total: 8000, ...(opts.max || {}) };
  const P = { strokes: Array.isArray(opts.strokes) ? opts.strokes.map(s => ({ c: s.c, pts: s.pts })) : [], hist: [], pen: PAD_COLORS[0], cur: null, penSeen: false };
  const draw = () => { ink.innerHTML = P.strokes.map(s => inkLine(s, PAD_W, PAD_H)).join(''); tools(); };
  const tools = () => { const u = box.querySelector('[data-dpdo="undo"]'), c = box.querySelector('[data-dpdo="clear"]'); if (u) u.disabled = !P.hist.length; if (c) c.disabled = !P.strokes.length; };
  const changed = () => { draw(); if (opts.onChange) opts.onChange(P.strokes); };
  const total = () => P.strokes.reduce((n, s) => n + s.pts.length, 0);
  const at = e => {
    const m = svg.getScreenCTM(); if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.min(1, Math.max(0, p.x / PAD_W)), y: Math.min(1, Math.max(0, p.y / PAD_H)) };
  };
  const full = () => { if (opts.full) opts.full(); };
  function down(e) {
    if (P.cur) return;
    if (e.pointerType === 'pen') P.penSeen = true;
    if ((e.pointerType === 'touch' && P.penSeen) || e.button > 0) return;
    if (P.strokes.length >= max.strokes || total() >= max.total - 2) { full(); return; }
    const p = at(e); if (!p) return;
    e.preventDefault();
    P.cur = { id: e.pointerId, s: { c: P.pen, pts: [p] } };
    try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ }
  }
  function move(e) {
    const c = P.cur; if (!c || c.id !== e.pointerId) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      if (c.s.pts.length >= max.points) break;
      const p = at(ev), last = c.s.pts[c.s.pts.length - 1];
      if (p && (Math.abs(p.x - last.x) * PAD_W + Math.abs(p.y - last.y) * PAD_H) >= 1.5) c.s.pts.push(p);
    }
    curG.innerHTML = inkLine(c.s, PAD_W, PAD_H);
  }
  function up(e) {
    const c = P.cur; if (!c || c.id !== e.pointerId) return;
    P.cur = null; curG.innerHTML = '';
    if (c.s.pts.length < 2) return;
    if (total() + c.s.pts.length > max.total) { full(); return; }
    P.hist.push(JSON.stringify(P.strokes)); if (P.hist.length > 50) P.hist.shift();
    P.strokes.push(c.s); changed();
  }
  function click(e) {
    const pen = e.target.closest('[data-dppen]');
    if (pen) { P.pen = pen.dataset.dppen; for (const b of box.querySelectorAll('[data-dppen]')) { const on = b === pen; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
    const d = e.target.closest('[data-dpdo]'); if (!d) return;
    if (d.dataset.dpdo === 'undo') { const last = P.hist.pop(); if (last) { P.strokes = JSON.parse(last); changed(); } }
    else if (P.strokes.length) { P.hist.push(JSON.stringify(P.strokes)); P.strokes = []; changed(); }
  }
  svg.addEventListener('pointerdown', down); svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  box.addEventListener('click', click);
  draw();
  return { strokes: () => P.strokes, set(list) { P.strokes = Array.isArray(list) ? list : []; P.hist = []; draw(); } };
}
