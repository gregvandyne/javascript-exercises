// Classroom dashboards: number rods (docs/decisions.md "Bar models and number rods"). Rods 1 to 10 long in a palette
// (and a longer one, 11 to 20, from a stepper), each with its own colour, its number on it and its unit marks, so colour
// is never the only cue. Tap a rod to add it, or drag it onto the board (the pattern blocks' palette drag: a lifted copy,
// the board lit up, a dashed outline where it lands). On the board rods move, turn, copy and go; they snap to the unit
// grid and to each other's ends, so trains join up. An equation with a missing box ("5 + 4 = □ + 3") can be shown
// above the board, answered and checked; "Show trains" builds each side as a train so both lengths can be compared. A
// selected rod's train shows a ruler and its total. Undo and redo (this page), zoom, grid, unit lines, new rods lying
// or standing. The maths is public/js/dash-math5.js (pure, tested). One code path for mouse, touch and pen (pointer
// events, captured); the board and the palette have touch-action: none. Every drag has a keyboard way.
// Privacy: the state holds rods and numbers only (no free text), through ctx.keep and ctx.send like every tool; the
// number typed in the equation's box stays in this page. No network, no storage, text set as text only.
import * as R from './dash-math5.js';
import * as G from './dash-math4.js';
import { parts } from './dash-tools.js';
import { tip } from './dash-tip.js';
import { format } from './i18n-format.js';

const { shell, el, svg, btn, ltr, svgPoint } = parts;
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const clone = x => JSON.parse(JSON.stringify(x));
const U = 40;   // SVG units a rod unit
const ZOOMS = [1, 1.5, 2, 3];
/** This page's memory, per widget: undo and redo, the zoom, the number typed in the equation's box. */
const mem = new Map();
const memOf = id => { if (!mem.has(id)) mem.set(id, { undo: [], redo: [], zoom: null, ans: '' }); return mem.get(id); };
const projecting = () => document.body.classList.contains('dash-projector');
const phone = () => matchMedia('(max-width: 719px)').matches;
/** A rod's colour class: 1-10 each its own, 11-20 one colour with a mark at ten. */
const tone = n => (n <= 10 ? `dt-rod${n}` : 'dt-rodl');

function ibtn(icon, text, cls = 'btn btn-sm') {
  const b = tip(btn('', cls), text); b.setAttribute('aria-label', text);
  const i = el('span', 'dt-ic', icon), l = el('span', 'dt-lbl', text);
  i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
  b.append(i, l); return b;
}
/** A button showing only its icon: the dark tooltip names it (hover, keyboard focus, a long press). */
function icon(ic, text, cls = 'btn btn-sm dt-ricbtn') {
  const b = tip(btn('', cls), text); b.setAttribute('aria-label', text);
  const i = el('span', 'dt-ic', ic); i.setAttribute('aria-hidden', 'true'); b.appendChild(i); return b;
}
/** A little rod for the palette and the lifted copy: n units, its number on it. */
/** A palette button drawn as its rod: its colour, as long as its number (within limits), its unit marks and its number. */
function paint(b, n) {
  b.className = `btn btn-sm dt-rbtn dt-rodc${n <= 10 ? n : 'l'}`;
  b.style.setProperty('--n', n);
  b.textContent = '';
  b.appendChild(ltr('span', 'dt-rnum', String(n)));
}
function rodIcon(n, unitPx = 12, cls = 'dt-ricon', v = false) {
  const len = Math.max(1, n) * U, w = v ? U : len, h = v ? len : U;
  const s = svg('svg', { viewBox: `-2 -2 ${w + 4} ${h + 4}`, class: cls, width: (w + 4) * unitPx / U, height: (h + 4) * unitPx / U, 'aria-hidden': 'true' });
  s.appendChild(svg('rect', { x: 0, y: 0, width: w, height: h, rx: 6, class: `dt-rod ${tone(n)}` }));
  let marks = ''; for (let i = 1; i < n; i++) marks += v ? `M4 ${i * U}H${U - 4}` : `M${i * U} 4V${U - 4}`;
  if (marks) s.appendChild(svg('path', { d: marks, class: 'dt-runit' }));
  return s;
}

export function rods(body, s, ctx) {
  const T = shell(body, s, ctx, 'rods'), { W, st } = T;
  const M = memOf(ctx.id || 'rods');
  if (M.zoom == null) M.zoom = phone() ? 2 : 1;
  let sel = -1, drag = null, pal = null, board = null, wrap = null;
  const v0 = () => st.dir === 'v';
  const eq = () => ({ l: st.l, r: st.r });
  const nameOf = r => fill(r.v ? W.standing : W.lying, { n: r.n, x: r.x + 1, y: r.y + 1 });
  // ---- history (this page): every change can be undone
  const snap = () => JSON.stringify({ rods: st.rods, l: st.l, r: st.r, eq: st.eq, model: st.model });
  const change = (fn, msg) => {
    const before = snap(); fn();
    if (snap() !== before) { M.undo.push(before); if (M.undo.length > 60) M.undo.shift(); M.redo = []; }
    T.commit(msg);
  };
  const restore = (from, to, word) => { if (!from.length) return; to.push(snap()); Object.assign(st, JSON.parse(from.pop())); sel = Math.min(sel, st.rods.length - 1); T.commit(word); };

  // ---- top: the palette (rods 1-10 and a longer rod) and the equation
  const tray = el('div', 'dt-rtray'); tray.setAttribute('role', 'group'); tray.setAttribute('aria-label', W.palette);
  const palBtns = [];
  const palBtn = n => {
    const b = tip(btn('', 'btn btn-sm dt-rbtn'), fill(W.addRod, { n }));
    b.setAttribute('aria-label', fill(W.addRod, { n })); b.dataset.n = n;
    paint(b, n);
    b.addEventListener('click', () => { if (pal && pal.moved) return; add(Number(b.dataset.n)); });
    b.addEventListener('pointerdown', e => paletteDown(e, Number(b.dataset.n), b));
    palBtns.push(b); return b;
  };
  for (let n = 1; n <= 10; n++) tray.appendChild(palBtn(n));
  const longBox = el('div', 'dt-rlong'); longBox.setAttribute('role', 'group'); longBox.setAttribute('aria-label', W.longer);
  const longBtn = palBtn(st.long);
  const lm = tip(btn('−', 'btn btn-sm dt-pm'), `${W.longer}: −`), lp = tip(btn('+', 'btn btn-sm dt-pm'), `${W.longer}: +`);
  lm.setAttribute('aria-label', `${W.longer} −`); lp.setAttribute('aria-label', `${W.longer} +`);
  const setLong = n => { st.long = n; T.commit(fill(W.rodN, { n: st.long })); };
  lm.addEventListener('click', () => { if (st.long > R.ROD_LONG[0]) setLong(st.long - 1); });
  lp.addEventListener('click', () => { if (st.long < R.ROD_LONG[1]) setLong(st.long + 1); });
  // The longer rod's length typed too (11-20); the rod beside it adds one that long.
  const longIn = T.num({ label: W.longer, key: 'long', get: () => st.long, min: R.ROD_LONG[0], max: R.ROD_LONG[1], set: setLong, cls: 'dt-stepval dt-rlongn' });
  longBox.append(lm, longIn, lp, longBtn);
  tray.appendChild(longBox);
  tray.addEventListener('pointermove', e => palMove(e));
  tray.addEventListener('pointerup', e => palUp(e));
  tray.addEventListener('pointercancel', e => palUp(e));

  const eqRow = el('div', 'dt-req'); eqRow.setAttribute('role', 'group'); eqRow.setAttribute('aria-label', W.eq);
  const eqText = el('div', 'dt-reqt'); eqText.dir = 'ltr';
  const ansIn = el('input', 'input dt-rbox');
  Object.assign(ansIn, { type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 2 });
  ansIn.setAttribute('aria-label', W.box); ansIn.setAttribute('enterkeyhint', 'done');
  const mark = el('span', 'dt-bmark'); mark.setAttribute('aria-hidden', 'true');
  const fresh = icon('🎲', W.newEq), type = icon('✏️', W.typeEq), model = ibtn('🚆', W.model);
  const eqBtns = el('div', 'dt-reqb'); eqBtns.append(fresh, type, model);
  eqRow.append(eqText, eqBtns);
  const checkAns = say => {
    const v = ansIn.value === '' ? null : Number(ansIn.value), m = R.missingOf(eq());
    const ok = v === null ? null : v === m;
    mark.textContent = ok === true ? '✓' : ok === false ? '✗' : '';
    eqText.classList.toggle('is-right', ok === true); eqText.classList.toggle('is-wrong', ok === false);
    if (say && ok !== null) ctx.say(ok ? fill(W.right, { n: R.eqValid(eq()) ? st.l.reduce((a, b) => a + b, 0) + (st.l.includes(0) ? m : 0) : m }) : W.wrong);
  };
  ansIn.addEventListener('input', () => { const c = ansIn.value.replace(/[^\d]/g, '').slice(0, 2); if (c !== ansIn.value) ansIn.value = c; M.ans = c; checkAns(false); });
  ansIn.addEventListener('change', () => checkAns(true));
  ansIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkAns(true); } });
  /** Swap the equation: the old one's trains go, the new one's come when trains were shown. */
  const setEq = (next, msg) => change(() => {
    const was = R.modelEquation(eq(), v0()).rods, had = st.model;
    if (had) st.rods = st.rods.filter(r => !was.some(w => w.n === r.n && !!w.v === !!r.v && w.x === r.x && w.y === r.y));
    st.l = next.l; st.r = next.r; st.eq = true; M.ans = ''; sel = -1;
    if (had) placeModel();
  }, msg);
  fresh.addEventListener('click', () => { let n = R.newEquation(); for (let k = 0; k < 10 && R.eqText(n) === R.eqText(eq()); k++) n = R.newEquation(); setEq(n, `${W.newEq}: ${spoken(n)}`); });
  type.addEventListener('click', () => {
    const sh = ctx.sheet({ title: W.typeEq, content: '' });
    const f = el('form', 'stack dt-askform'); f.noValidate = true; sh.el.querySelector('.sheet-body').appendChild(f);
    const id = `dt-re${Math.random().toString(36).slice(2, 8)}`;
    const lab = el('label', null, W.typeLabel); lab.htmlFor = id;
    const inp = el('input', 'input'); Object.assign(inp, { id, maxLength: 30, value: R.eqText(eq(), '?'), autocomplete: 'off' }); inp.dir = 'ltr';
    const hint = el('p', 'small muted', W.typeHint);
    const err = el('p', 'err form-err'); err.setAttribute('role', 'alert');
    const row = el('div', 'row'), go = el('button', 'btn btn-primary', `✓ ${C().done || 'OK'}`); go.type = 'submit'; row.appendChild(go);
    f.append(lab, inp, hint, err, row);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const next = R.parseEquation(inp.value);
      if (!next) { err.textContent = W.typeBad; inp.focus(); return; }
      sh.close(); setEq(next, spoken(next));
    });
    inp.focus(); inp.select();
  });
  function placeModel() {
    const mdl = R.modelEquation(eq(), v0());
    const area = [...mdl.rods, mdl.gap].filter(Boolean);
    st.rods = st.rods.filter(r => !area.some(a => R.rodsOverlap(a, r)));
    for (const r of mdl.rods) if (st.rods.length < R.ROD_MAX) st.rods.push({ ...r, v: !!r.v });
    st.model = true;
  }
  model.addEventListener('click', () => change(() => { placeModel(); sel = -1; }, W.modelled));
  T.top.append(tray, eqRow);

  // ---- foot: orientation, view, zoom, undo/redo, the chosen rod, reset, the equation
  const dir = icon('↔️', W.dirH);
  dir.addEventListener('click', () => { st.dir = v0() ? 'h' : 'v'; T.commit(v0() ? W.dirV : W.dirH); });
  const grid = T.toggle('', null, () => st.grid, v => { st.grid = v; T.commit(`${W.grid}: ${v ? '✓' : '✗'}`); });
  const units = T.toggle('', null, () => st.units, v => { st.units = v; T.commit(`${W.units}: ${v ? '✓' : '✗'}`); });
  for (const [b, ic, text] of [[grid, '▦', W.grid], [units, '┆', W.units]]) {
    tip(b, text); b.setAttribute('aria-label', text); b.classList.add('dt-ricbtn');
    const i = el('span', 'dt-ic', ic); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
  }
  const zoomOut = icon('🔍−', W.zoomOut), zoomIn = icon('🔍+', W.zoomIn);
  const setZoom = z => { M.zoom = z; T.draw(); ctx.say(`${Math.round(z * 100)}%`); };
  zoomOut.addEventListener('click', () => { const i = ZOOMS.indexOf(M.zoom); if (i > 0) setZoom(ZOOMS[i - 1]); });
  zoomIn.addEventListener('click', () => { const i = ZOOMS.indexOf(M.zoom); if (i < ZOOMS.length - 1) setZoom(ZOOMS[i + 1]); });
  const undo = icon('↶', W.undo), redo = icon('↷', W.redo);
  undo.addEventListener('click', () => restore(M.undo, M.redo, W.undo));
  redo.addEventListener('click', () => restore(M.redo, M.undo, W.redo));
  const turn = icon('↻', W.turn), copy = icon('⧉', W.copy), del = icon('🗑️', W.del), reset = icon('🧹', W.reset);
  turn.addEventListener('click', () => turnSel());
  copy.addEventListener('click', () => copySel());
  del.addEventListener('click', () => delSel());
  reset.addEventListener('click', () => { change(() => { st.rods = []; st.model = false; sel = -1; }, W.resetDone); });
  const eqOn = T.toggle('', null, () => st.eq, v => change(() => { st.eq = v; }, v ? spoken(eq()) : W.eqOff));
  tip(eqOn, W.eq); eqOn.setAttribute('aria-label', W.eq); eqOn.classList.add('dt-ricbtn');
  { const i = el('span', 'dt-ic', '🟰'); i.setAttribute('aria-hidden', 'true'); eqOn.appendChild(i); }
  const sep = () => { const x = el('span', 'dt-rsep'); x.setAttribute('aria-hidden', 'true'); return x; };
  const selBox = el('div', 'dt-rsel'); selBox.setAttribute('role', 'group'); selBox.setAttribute('aria-label', W.chosen); selBox.append(turn, copy, del);
  const viewBox = el('div', 'dt-rview'); viewBox.append(dir, grid, units, zoomOut, zoomIn);
  const histBox = el('div', 'dt-rview'); histBox.append(undo, redo, reset, eqOn);
  T.foot.append(selBox, sep(), viewBox, sep(), histBox);

  const C = () => ctx.common || {};
  const spoken = e => R.eqText(e, W.blank);
  function add(n, at) {
    if (st.rods.length >= R.ROD_MAX) { ctx.say(W.full); return; }
    const r = at || R.freeSpot(st.rods, n, v0() && n <= R.ROD_H, st.eq && st.model ? 5 : 0);
    if (!r) { ctx.say(W.noRoom); return; }
    change(() => { st.rods.push({ n: r.n, x: r.x, y: r.y, v: !!r.v }); sel = st.rods.length - 1; }, fill(W.added, { what: nameOf(r) }));
    focusSel();
  }
  const focusSel = () => board?.querySelector(`[data-r="${sel}"]`)?.focus({ preventScroll: false });
  function turnSel() {
    const r = st.rods[sel]; if (!r) return;
    if (!r.v && r.n > R.ROD_H) { ctx.say(W.tooLong); return; }
    change(() => { const next = R.clampRod({ ...r, v: !r.v }); Object.assign(r, next); }, nameOf(r));
    focusSel();
  }
  function copySel() {
    const r = st.rods[sel]; if (!r) return;
    if (st.rods.length >= R.ROD_MAX) { ctx.say(W.full); return; }
    const spot = R.freeSpot(st.rods, r.n, r.v, r.v ? r.x + 1 : r.y + 1);
    if (!spot) { ctx.say(W.noRoom); return; }
    change(() => { st.rods.push({ ...spot, v: !!spot.v }); sel = st.rods.length - 1; }, fill(W.copied, { what: nameOf(spot) }));
    focusSel();
  }
  function delSel() {
    const r = st.rods[sel]; if (!r) return;
    change(() => { st.rods.splice(sel, 1); sel = Math.min(sel, st.rods.length - 1); }, fill(W.deleted, { n: r.n }));
    if (sel >= 0) focusSel(); else board?.focus();
  }
  const moveSel = (dx, dy) => {
    const r = st.rods[sel]; if (!r) return;
    const others = st.rods.filter((o, i) => i !== sel);
    const next = R.snapRod({ ...r, x: r.x + dx, y: r.y + dy }, others, R.ROD_W, R.ROD_H, 0);
    if (next.x === r.x && next.y === r.y) return;
    change(() => Object.assign(r, next), fill(W.moved, { x: next.x + 1, y: next.y + 1 }));
    focusSel();
  };

  // ---- the palette drag (as the pattern blocks': a tap adds; past a few px a lifted copy follows the pointer)
  const unitPx = () => { const m = board && board.getScreenCTM(); return m ? Math.hypot(m.a, m.b) * U : 20; };
  const landing = e => {
    if (!board) return null;
    const r = board.querySelector('.dt-rbg').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    const q = svgPoint(board, e), v = v0() && pal.n <= R.ROD_H;
    // The rod's middle is under the pointer.
    return R.snapRod({ n: pal.n, v, x: q.x / U - (v ? 0.5 : pal.n / 2), y: q.y / U - (v ? pal.n / 2 : 0.5) }, st.rods);
  };
  function paletteDown(e, n, b) {
    if (ctx.editing || e.button > 0 || pal) return;
    pal = { n, b, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  }
  function palMove(e) {
    const d = pal; if (!d || d.done || d.id !== e.pointerId) return;
    if (!d.moved && G.paletteDrag(d.x, d.y, e.clientX, e.clientY)) {
      if (st.rods.length >= R.ROD_MAX) { palStop(); ctx.say(W.full); return; }
      d.moved = true;
      const g = el('div', 'dt-pghost dt-rghost'); g.setAttribute('aria-hidden', 'true');
      const v = v0() && d.n <= R.ROD_H, px = unitPx(), ic = rodIcon(d.n, px, 'dt-rgicon', v);
      g.appendChild(ic);
      d.ox = v ? px / 2 : (d.n * px) / 2; d.oy = v ? (d.n * px) / 2 : px / 2; d.v = v;
      (document.fullscreenElement || document.body).appendChild(g);
      d.ghost = g; d.b.classList.add('is-dragsrc');
      d.esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); palStop(); } };
      document.addEventListener('keydown', d.esc, true);
    }
    if (d.moved && d.ghost) {
      e.preventDefault();
      d.ghost.style.transform = `translate(${e.clientX - d.ox}px, ${e.clientY - d.oy}px) rotate(-3deg) scale(1.05)`;
      const spot = landing(e);
      d.ghost.classList.toggle('is-out', !spot);
      board.classList.toggle('is-drop', !!spot);
      if (!d.shadow || !d.shadow.isConnected) { d.shadow = svg('rect', { class: 'dt-rshadow', rx: 6 }); board.appendChild(d.shadow); }
      d.shadow.style.display = spot ? '' : 'none';
      if (spot) { const bx = R.rodBox(spot); Object.entries({ x: bx.x0 * U, y: bx.y0 * U, width: (bx.x1 - bx.x0) * U, height: (bx.y1 - bx.y0) * U }).forEach(([k, v]) => d.shadow.setAttribute(k, v)); }
    }
  }
  function palStop() {
    const d = pal; if (!d) return;
    d.ghost?.remove(); d.shadow?.remove(); d.b.classList.remove('is-dragsrc');
    board?.classList.remove('is-drop');
    if (d.esc) document.removeEventListener('keydown', d.esc, true);
    d.done = true;
  }
  function palUp(e) {
    const d = pal; if (!d || d.id !== e.pointerId) return;
    setTimeout(() => { if (pal === d) pal = null; });
    if (d.done) return;
    const spot = d.moved && e.type === 'pointerup' ? landing(e) : null;
    palStop();
    if (d.moved && spot) add(d.n, spot);
  }

  // ---- the board
  const hit = q => {
    // The rod under the point, else the nearest within a little (a finger is wider than a 1-rod is thick).
    const x = q.x / U, y = q.y / U, reach = matchMedia('(pointer: coarse)').matches ? 0.6 : 0.25;
    let best = -1, bd = Infinity;
    for (let i = st.rods.length - 1; i >= 0; i--) {
      const b = R.rodBox(st.rods[i]);
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1), d = Math.hypot(dx, dy);
      if (d === 0) return i;
      if (d <= reach && d < bd) { bd = d; best = i; }
    }
    return best;
  };
  function down(e) {
    if (ctx.editing || e.button > 0 || drag) return;
    const q = svgPoint(board, e), i = hit(q);
    board.setPointerCapture?.(e.pointerId);
    if (i < 0) {
      // The empty board: let go of the chosen rod; when zoomed, drag to pan.
      if (sel >= 0) { sel = -1; T.draw(); }
      if (M.zoom > 1) drag = { pan: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
      return;
    }
    e.preventDefault();
    const r = st.rods[i];
    drag = { i, id: e.pointerId, ox: q.x / U - r.x, oy: q.y / U - r.y, x: r.x, y: r.y, sx: e.clientX, sy: e.clientY, moved: false };
    if (sel !== i) { sel = i; T.draw(); }
    board.focus({ preventScroll: true });
  }
  function move(e) {
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.pan) { wrap.scrollLeft = drag.l - (e.clientX - drag.sx); wrap.scrollTop = drag.t - (e.clientY - drag.sy); return; }
    if (!drag.moved && !G.paletteDrag(drag.sx, drag.sy, e.clientX, e.clientY, 4)) return;
    drag.moved = true;
    const q = svgPoint(board, e), r = st.rods[drag.i], b = R.rodBox(r);
    drag.x = Math.max(0, Math.min(R.ROD_W - (b.x1 - b.x0), q.x / U - drag.ox)); drag.y = Math.max(0, Math.min(R.ROD_H - (b.y1 - b.y0), q.y / U - drag.oy));
    const g = board.querySelector(`[data-r="${drag.i}"]`);
    if (g) g.setAttribute('transform', `translate(${(drag.x - r.x) * U} ${(drag.y - r.y) * U})`);
    g?.classList.add('is-drag');
    const land = R.snapRod({ ...r, x: drag.x, y: drag.y }, st.rods.filter((o, k) => k !== drag.i));
    let sh = board.querySelector('.dt-rshadow.is-move');
    if (!sh) { sh = svg('rect', { class: 'dt-rshadow is-move', rx: 6 }); board.insertBefore(sh, board.querySelector('.dt-rlayer')); }
    const lb = R.rodBox(land); Object.entries({ x: lb.x0 * U, y: lb.y0 * U, width: (lb.x1 - lb.x0) * U, height: (lb.y1 - lb.y0) * U }).forEach(([k, v]) => sh.setAttribute(k, v));
  }
  function up(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (d.pan) return;
    if (!d.moved || e.type === 'pointercancel') { T.draw(); focusSel(); if (!d.moved) ctx.say(trainSay(sel) || nameOf(st.rods[sel])); return; }
    const r = st.rods[d.i], next = R.snapRod({ ...r, x: d.x, y: d.y }, st.rods.filter((o, k) => k !== d.i));
    if (next.x === r.x && next.y === r.y) { T.draw(); focusSel(); return; }
    change(() => Object.assign(r, next), nameOf(next));
    focusSel();
  }
  const trainSay = i => {
    const t = i >= 0 ? R.trainOf(st.rods, i) : null;
    return t && t.rods.length > 1 ? fill(W.trainIs, { sum: t.rods.map(k => st.rods[k].n).join(' + '), n: t.len }) : '';
  };
  function keys(e) {
    if (ctx.editing) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) restore(M.redo, M.undo, W.redo); else restore(M.undo, M.redo, W.undo); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); restore(M.redo, M.undo, W.redo); return; }
    const t = e.target.closest?.('[data-r]');
    if (!t && e.target !== board) return;
    if (e.target === board && !st.rods.length) return;
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] }[e.key];
    if (sel < 0 && (d || e.key === 'Enter')) { e.preventDefault(); sel = 0; T.draw(); focusSel(); ctx.say(nameOf(st.rods[0])); return; }
    if (d) { e.preventDefault(); moveSel(...d); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); turnSel(); }
    else if (e.key === 'd' || e.key === 'D' || e.key === 'c' || e.key === 'C') { e.preventDefault(); copySel(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); }
    else if (e.key === 'Escape' && sel >= 0) { e.preventDefault(); e.stopPropagation(); sel = -1; T.draw(); board.focus(); }
    else if (e.key === ']' || e.key === '[') { e.preventDefault(); if (!st.rods.length) return; sel = (Math.max(0, sel) + (e.key === ']' ? 1 : st.rods.length - 1)) % st.rods.length; T.draw(); focusSel(); ctx.say(trainSay(sel) || nameOf(st.rods[sel])); }
    else if (e.key === 'Enter') { e.preventDefault(); ctx.say(trainSay(sel) || nameOf(st.rods[sel])); }
  }

  T.draw = () => {
    const E = eq(), valid = R.eqValid(E);
    if (!valid) { st.l = [...R.EQ_START.l]; st.r = [...R.EQ_START.r]; }
    // ---- the palette and the controls
    longBtn.dataset.n = st.long; paint(longBtn, st.long);
    tip(longBtn, fill(W.addRod, { n: st.long })); longBtn.setAttribute('aria-label', fill(W.addRod, { n: st.long }));
    lm.disabled = st.long <= R.ROD_LONG[0]; lp.disabled = st.long >= R.ROD_LONG[1]; longIn.sync();
    for (const b of palBtns) b.disabled = !!ctx.editing;
    grid.sync(); units.sync(); eqOn.sync();
    const dirText = v0() ? W.dirV : W.dirH;
    dir.querySelector('.dt-ic').textContent = v0() ? '↕️' : '↔️'; tip(dir, dirText); dir.setAttribute('aria-label', dirText);
    zoomOut.disabled = M.zoom <= ZOOMS[0]; zoomIn.disabled = M.zoom >= ZOOMS.at(-1);
    undo.disabled = !M.undo.length; redo.disabled = !M.redo.length;
    turn.disabled = copy.disabled = del.disabled = !st.rods[sel]; reset.disabled = !st.rods.length && !st.model;
    // ---- the equation
    eqRow.hidden = !st.eq;
    eqText.textContent = '';
    const sides = [st.l, st.r];
    sides.forEach((side, k) => {
      side.forEach((n, j) => {
        if (j) eqText.appendChild(el('span', 'dt-bop', '+'));
        if (n) eqText.appendChild(el('span', 'dt-reqn', String(n)));
        else { ansIn.value = M.ans || ''; eqText.appendChild(ansIn); }
      });
      if (!k) eqText.appendChild(el('span', 'dt-bop', '='));
    });
    eqText.appendChild(mark);
    eqText.setAttribute('aria-label', `${W.eq}: ${spoken(E)}`);
    ansIn.disabled = !!ctx.editing;
    checkAns(false);
    // ---- the board
    const VW = R.ROD_W * U, VH = R.ROD_H * U;
    const keepScroll = wrap ? [wrap.scrollLeft, wrap.scrollTop] : null;
    T.stage.textContent = '';
    wrap = el('div', `dt-rwrap${M.zoom > 1 ? ' is-zoomed' : ''}`);
    board = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'dt-rboard', role: 'group', 'aria-label': `${W.board}. ${W.boardKeys}`, tabindex: ctx.editing ? '-1' : '0' });
    board.setAttribute('direction', 'ltr');
    board.appendChild(svg('rect', { x: 0, y: 0, width: VW, height: VH, rx: 10, class: 'dt-rbg' }));
    if (st.grid) {
      let d = ''; for (let x = 1; x < R.ROD_W; x++) d += `M${x * U} 0V${VH}`; for (let y = 1; y < R.ROD_H; y++) d += `M0 ${y * U}H${VW}`;
      board.appendChild(svg('path', { d, class: 'dt-rgrid' }));
    }
    // How big a unit is on screen: rod numbers are never smaller than the tools' smallest text.
    T.stage.appendChild(wrap); wrap.appendChild(board);
    const fitPx = (() => { const w = T.stage.clientWidth, h = T.stage.clientHeight; if (!w) return 20; return phone() || !h ? w / R.ROD_W : Math.min(w / R.ROD_W, h / R.ROD_H); })();
    const px = fitPx * M.zoom;
    if (M.zoom > 1) { board.style.width = `${Math.round(R.ROD_W * px)}px`; board.style.height = `${Math.round(R.ROD_H * px)}px`; }
    const floor = (projecting() ? 13 : 12) + 1.5, fs = Math.max(U * 0.6, (floor * U) / Math.max(1, px));
    const mdl = st.eq && st.model ? R.modelEquation(E, v0()) : null;
    // The missing rod's place: dashed, with "?", until a rod of the right length lies in it.
    if (mdl && mdl.gap) {
      const gb = R.rodBox(mdl.gap), filled = st.rods.some(r => r.n === mdl.gap.n && !!r.v === !!mdl.gap.v && r.x === mdl.gap.x && r.y === mdl.gap.y);
      if (!filled) {
        board.appendChild(svg('rect', { x: gb.x0 * U + 3, y: gb.y0 * U + 3, width: (gb.x1 - gb.x0) * U - 6, height: (gb.y1 - gb.y0) * U - 6, rx: 6, class: 'dt-rgap' }));
        board.appendChild(svg('text', { x: ((gb.x0 + gb.x1) / 2) * U, y: ((gb.y0 + gb.y1) / 2) * U, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dt-rgapq', 'font-size': fs }, '?'));
      }
      // Which side is which: "=" between the two trains' starts.
      const mv = !!(mdl.gap || mdl.rods[0] || {}).v;
      const sideMark = (k, text) => { const x = mv ? (1 + 2 * k) * U + U / 2 : U / 2, y = mv ? U / 2 : (1 + 2 * k) * U + U / 2; return svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dt-rside', 'font-size': Math.min(fs, U * 0.8) }, text); };
      board.append(sideMark(0, 'A'), sideMark(1, 'B'));
    }
    const layer = svg('g', { class: 'dt-rlayer' }); board.appendChild(layer);
    const train = sel >= 0 && st.rods[sel] ? R.trainOf(st.rods, sel) : null;
    st.rods.forEach((r, i) => {
      const b = R.rodBox(r), w = (b.x1 - b.x0) * U, h = (b.y1 - b.y0) * U;
      const g = svg('g', { class: `dt-rg${i === sel ? ' is-sel' : ''}${train && train.rods.includes(i) ? ' in-train' : ''}`, 'data-r': i, role: 'button', tabindex: ctx.editing ? '-1' : (i === sel || (sel < 0 && i === 0) ? '0' : '-1'), 'aria-label': nameOf(r), 'aria-pressed': String(i === sel) });
      g.appendChild(svg('rect', { x: b.x0 * U + 1.5, y: b.y0 * U + 1.5, width: w - 3, height: h - 3, rx: 6, class: `dt-rod ${tone(r.n)}` }));
      if (st.units && r.n > 1) {
        let d = ''; for (let k = 1; k < r.n; k++) d += r.v ? `M${b.x0 * U + 6} ${(b.y0 + k) * U}H${b.x1 * U - 6}` : `M${(b.x0 + k) * U} ${b.y0 * U + 6}V${b.y1 * U - 6}`;
        g.appendChild(svg('path', { d, class: 'dt-runit' }));
      }
      if (r.n > 10) {
        // Ten units in: a stronger mark, so 13 reads as ten and three.
        g.appendChild(svg('path', { d: r.v ? `M${b.x0 * U + 2} ${(b.y0 + 10) * U}H${b.x1 * U - 2}` : `M${(b.x0 + 10) * U} ${b.y0 * U + 2}V${b.y1 * U - 2}`, class: 'dt-rten' }));
      }
      g.appendChild(svg('text', { x: ((b.x0 + b.x1) / 2) * U, y: ((b.y0 + b.y1) / 2) * U, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: `dt-rlab ${tone(r.n)}`, 'font-size': fs }, String(r.n)));
      layer.appendChild(g);
    });
    // The chosen rod's train: a ruler along it with its total.
    if (train) {
      const first = st.rods[train.rods[0]], len = train.len;
      const v = train.v, x0 = first.x * U, y0 = first.y * U;
      const below = v ? first.x + 1 < R.ROD_W : first.y + 1 < R.ROD_H;
      const off = 0.25 * U;
      let d = '', ticks = '';
      if (!v) { const y = below ? y0 + U + off : y0 - off; d = `M${x0} ${y}H${x0 + len * U}`; for (let k = 0; k <= len; k++) ticks += `M${x0 + k * U} ${y}v${below ? -off * 0.8 : off * 0.8}`; }
      else { const x = below ? x0 + U + off : x0 - off; d = `M${x} ${y0}V${y0 + len * U}`; for (let k = 0; k <= len; k++) ticks += `M${x} ${y0 + k * U}h${below ? -off * 0.8 : off * 0.8}`; }
      const ruler = svg('g', { class: 'dt-rruler', 'aria-hidden': 'true' });
      ruler.append(svg('path', { d: d + ticks, class: 'dt-rrul' }));
      const tx = v ? (below ? x0 + U + off * 2 : x0 - off * 2) : x0 + (len * U) / 2, ty = v ? y0 + (len * U) / 2 : (below ? y0 + U + off + fs * 0.75 : y0 - off - fs * 0.35);
      const label = svg('text', { x: tx, y: ty, 'text-anchor': v ? (below ? 'start' : 'end') : 'middle', 'dominant-baseline': v ? 'central' : 'auto', class: 'dt-rtotal', 'font-size': fs }, train.rods.length > 1 ? `= ${len}` : String(len));
      ruler.appendChild(label);
      board.appendChild(ruler);
    }
    board.addEventListener('pointerdown', down);
    board.addEventListener('pointermove', move);
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);
    board.addEventListener('keydown', keys);
    board.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const i = ZOOMS.indexOf(M.zoom); const j = Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1))); if (j !== i) setZoom(ZOOMS[j]); }, { passive: false });
    if (keepScroll && M.zoom > 1) [wrap.scrollLeft, wrap.scrollTop] = keepScroll;
    // ---- the readout
    T.read.textContent = '';
    if (train) {
      const big = ltr('div', 'dt-big dt-rread', train.rods.length > 1 ? `${train.rods.map(k => st.rods[k].n).join(' + ')} = ${train.len}` : fill(W.rodN, { n: train.len }));
      T.read.appendChild(big);
    } else if (!st.rods.length) T.read.appendChild(el('div', 'dt-sub', W.empty));
    else if (!mdl) T.read.appendChild(el('div', 'dt-sub', format(W.count, { n: st.rods.length }, ctx.intl)));
    if (mdl) {
      // The two sides' trains, as built: the same length when the box is right.
      const lenOf = side => side.reduce((a, n) => a + (n || 0), 0);
      const gapIn = mdl.gap && st.rods.some(r => r.n === mdl.gap.n && !!r.v === !!mdl.gap.v && r.x === mdl.gap.x && r.y === mdl.gap.y);
      const a = lenOf(st.l) + (st.l.includes(0) && gapIn ? mdl.gap.n : 0), b = lenOf(st.r) + (st.r.includes(0) && gapIn ? mdl.gap.n : 0);
      const p = el('div', `dt-sub dt-rcmp${a === b ? ' is-same' : ''}`, a === b ? fill(W.same, { n: a }) : fill(W.notSame, { a, b }));
      p.dir = 'auto'; T.read.appendChild(p);
    }
  };
  const fin = T.finish();
  // The board's own size changes when the equation row shows or hides: draw again so the numbers stay readable.
  return fin;
}
