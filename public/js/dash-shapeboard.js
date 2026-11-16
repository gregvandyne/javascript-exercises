// Classroom dashboards: the shape board, the geoboard rebuilt (docs/decisions.md "Shape board"). Widget type id
// `geoboard`, so layouts, pushes, "Practice it" and ready-made layouts keep working. Bands in seven colours round pegs on
// a square grid, triangle dots or a circle; preset shapes; a ruler; area and perimeter (exact on the grids), each inside
// angle and the corners' letters and sides' lengths; text labels and a pen; zoom, pan and pinch; full screen; undo and
// redo; a challenge title. The maths is in public/js/dash-math4.js (pure, tested).
//
// Devices: pointer events for mouse, touch and pen (touch-action: none on the board only, so dragging never scrolls the
// page; two fingers pinch and pan the board, never the page); pegs snap from a generous radius; 44px controls. A wide
// widget has a rail on the side and a bar below; a narrow one (a phone, a small widget) and the projector have one
// compact bar whose groups open in small menus, so the board keeps the room. Keyboard: arrows move a peg cursor, a
// selected band or a corner peg by peg, Enter places or picks, Delete removes, Escape lets go, Ctrl/Cmd+Z undoes.
// Privacy: the state goes only through ctx.keep (the teacher's layout; a student's copy stays in their browser) and the
// teacher's Send to students. On a student's own screen labels and drawings are left out of what is kept (and the
// server drops them too). No network, storage or AI here; text a person typed is set with textContent only.
import * as G from './dash-math4.js';
import { parts } from './dash-tools.js';
import { format } from './i18n-format.js';

const { shell, el, svg, btn, ltr, svgPoint, iso, clone } = parts;
const projecting = () => document.body.classList.contains('dash-projector');
const VB = 1000, PAD = 80, H3 = Math.sqrt(3) / 2;
/** Each band colour has its own dash, so colour is never the only way to tell bands apart. */
const DASH = ['', '16 9', '4 7', '20 7 4 7', '2 6', '12 5 3 5', '26 8'];
const PEN_COLOURS = 5, MAX_INK = 30, MAX_INK_PTS = 120, MAX_NOTES = 12, HISTORY = 60;
/** Little pictures for the Shapes menu (our own, in a 0-24 box). */
const SHAPE_ICON = {
  tri: '3,20 21,20 12,4', right: '4,4 4,20 20,20', sq: '5,5 19,5 19,19 5,19', rect: '2,7 22,7 22,17 2,17', para: '7,6 22,6 17,18 2,18',
  trap: '8,6 16,6 22,18 2,18', pent: '12,3 21,10 17,21 7,21 3,10', hex: '7,3 17,3 22,12 17,21 7,21 2,12', oct: '8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8',
};
const BOARD_ICON = { square: '▦', iso: '◬', circle: '◯' };

/** A toolbar button: an icon and its words (the words hide on a compact bar; the button keeps its name and tooltip). */
function tbtn(icon, text, cls = '') {
  const b = btn('', `btn btn-sm gb-btn ${cls}`.trim(), text); b.dataset.tip = text;
  const i = el('span', 'gb-ic', icon), l = el('span', 'gb-lbl', text);
  i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
  b.append(i, l); return b;
}

export function geoboard(body, s, ctx) {
  const T = shell(body, s, ctx, 'geoboard'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  const teacherText = !!ctx.teacher && !ctx.copy;   // the challenge title is the teacher's
  const ownScreen = !ctx.teacher && !ctx.copy;       // a student's own widget: labels and drawings are never kept
  body.classList.add('gb-tool');
  T.read.removeAttribute('aria-live');               // changes are said once through ctx.say, not on every redraw
  // ---------------------------------------------------------------- state (old geoboards: every new key takes its start)
  const norm = () => {
    if (!G.BOARDS.includes(st.board)) st.board = 'square';
    if (!G.RING_SIZES.includes(st.ring)) st.ring = 12;
    if (!G.GRID_SIZES.includes(st.pegs)) st.pegs = 7;
    for (const [k, v] of Object.entries({ fills: true, lines: false, angles: false, labels: false, show: true })) if (typeof st[k] !== 'boolean') st[k] = v;
    if (typeof st.title !== 'string') st.title = '';
    st.bands = Array.isArray(st.bands) ? st.bands : [];
    st.bands.forEach((b, i) => { if (!(b.c >= 0 && b.c < G.BAND_COLOURS)) b.c = i % G.BAND_COLOURS; b.pts = b.pts || []; b.closed = !!b.closed; });
    st.notes = Array.isArray(st.notes) ? st.notes : [];
    st.ink = Array.isArray(st.ink) ? st.ink : [];
    if (!Number.isInteger(st.cur) || st.cur >= st.bands.length) st.cur = st.bands.length ? Math.min(Math.max(-1, st.cur | 0), st.bands.length - 1) : -1;
  };
  norm();
  const ui = { mode: 'band', pen: 0, colour: st.bands.length % G.BAND_COLOURS, fresh: false, ruler: null, view: { z: 1, cx: VB / 2, cy: VB / 2 }, cursor: { x: 0, y: 0 }, corner: -1, wide: null, side: null, said: '' };
  const undoStack = [], redoStack = [];
  /** Redraw through the shell (which also shows or hides Make a question). */
  const draw = () => T.draw();
  const n = () => G.boardSize(st);
  /** The colour for a new band: the one picked, else the first one no band has yet (from the last one used). */
  const nextColour = () => { const used = new Set(st.bands.map(b => b.c)); for (let i = 0; i < G.BAND_COLOURS; i++) { const k = (ui.colour + i) % G.BAND_COLOURS; if (!used.has(k)) return k; } return ui.colour; };
  const band = () => (st.cur >= 0 ? st.bands[st.cur] : null);
  const simple = b => !!b && b.closed && G.simpleOn(st.board, n(), b.pts);

  // ---------------------------------------------------------------- keeping, undo and saying
  const keep = () => {
    if (ctx.editing || !ctx.keep) return;
    const out = clone(st);
    if (ownScreen) { out.notes = []; out.ink = []; }
    ctx.keep(out);
  };
  /** What the selected band measures, in words (said after a change, only when it changed). */
  const metricsText = () => {
    const b = band(); if (!simple(b)) return '';
    const A = G.shapeArea(st.board, n(), b.pts), L = G.bandLengthOn(st.board, n(), b.pts, true);
    return fill(W.sayBand, { n: st.cur + 1, a: iso(areaText(A)), p: iso(G.lengthLabel(L, ctx.intl)) });
  };
  const say = msg => { const m = metricsText(), parts2 = [msg]; if (m && m !== ui.said) parts2.push(m); ui.said = m; const t = parts2.filter(Boolean).map(x => String(x).replace(/[.。]\s*$/, '')).join('. '); if (t) ctx.say(t); };
  function change(fn, msg) {
    const before = JSON.stringify(st);
    fn();
    if (JSON.stringify(st) === before) { draw(); if (msg) say(msg); return false; }
    undoStack.push(before); if (undoStack.length > HISTORY) undoStack.shift(); redoStack.length = 0;
    draw(); keep(); say(msg); return true;
  }
  /** A drag changed the state as it went: record the state before it once it is let go. */
  function settle(before, msg) {
    if (JSON.stringify(st) === before) { draw(); return; }
    undoStack.push(before); if (undoStack.length > HISTORY) undoStack.shift(); redoStack.length = 0;
    draw(); keep(); say(msg);
  }
  const restore = json => { const v = JSON.parse(json); for (const k of Object.keys(st)) delete st[k]; Object.assign(st, v); norm(); ui.corner = -1; };
  const undo = () => { if (!undoStack.length) return; redoStack.push(JSON.stringify(st)); restore(undoStack.pop()); draw(); keep(); say(W.undo); };
  const redo = () => { if (!redoStack.length) return; undoStack.push(JSON.stringify(st)); restore(redoStack.pop()); draw(); keep(); say(W.redo); };

  // ---------------------------------------------------------------- geometry on the screen
  let f = null;   // the board's frame in viewBox units
  const frame = () => {
    const N = n();
    if (st.board === 'circle') { const R = (VB - 2 * PAD) / 2; return { N, S: R, ox: VB / 2, oy: VB / 2, sp: Math.min(2 * R * Math.sin(Math.PI / N), R) }; }
    const w = st.board === 'iso' ? N - 0.5 : N - 1, h = (N - 1) * (st.board === 'iso' ? H3 : 1);
    const S = Math.min((VB - 2 * PAD) / w, (VB - 2 * PAD) / h);
    return { N, S, ox: (VB - w * S) / 2, oy: (VB - h * S) / 2, sp: S };
  };
  const at = p => { const q = G.pegXY(st.board, f.N, p); return { x: f.ox + q.x * f.S, y: f.oy + q.y * f.S }; };
  const units = v => ({ x: (v.x - f.ox) / f.S, y: (v.y - f.oy) / f.S });
  let pxPerUnit = 0.5;   // screen pixels per viewBox unit (set when drawn)
  // The board's own box can change size while the tool's area doesn't (the chrome or the readout beside it changed):
  // drawn again then, so its words stay readable.
  let boxSize = { w: 0, h: 0 }, boxRaf = 0;
  const boxRo = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (Math.abs(boardBox.clientWidth - boxSize.w) > 2 || Math.abs(boardBox.clientHeight - boxSize.h) > 2) { cancelAnimationFrame(boxRaf); boxRaf = requestAnimationFrame(() => { if (!drag) draw(); }); }
  }) : null;
  /** The peg under a point (viewBox units): the nearest one within a generous radius (half a step, at least 26px). */
  const pegNear = (v, loose = false) => {
    const r = G.nearestPeg(st.board, f.N, units(v)); if (!r) return null;
    const lim = Math.max(0.55 * f.sp, 26 / (pxPerUnit * ui.view.z)) / f.S;
    return loose || r.d <= lim ? r.p : null;
  };
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const areaText = A => (A.kind === 'sq' ? fill(W.areaSq, { a: G.mixed(A.a2, 2) }) : A.kind === 'tri' ? fill(W.areaTri, { a: String(A.t) })
    : fill(W.areaCircle, { a: new Intl.NumberFormat(ctx.intl, { maximumFractionDigits: 2, useGrouping: false }).format(A.a) }));

  // ---------------------------------------------------------------- the parts of the tool
  const root = el('div', 'gb');
  const head = el('div', 'gb-head');
  const main = el('div', 'gb-main');
  const rail = el('div', 'gb-rail');
  const palette = el('div', 'gb-palette');
  const boardBox = el('div', 'gb-boardbox');
  const bar = el('div', 'gb-bar');
  const pop = el('div', 'gb-pop'); pop.hidden = true; pop.setAttribute('role', 'dialog');
  const chip = el('div', 'gb-chip'); chip.hidden = true;
  const fit = tbtn('⤢', W.zoomFit, 'gb-fit'); fit.hidden = true;
  rail.setAttribute('role', 'toolbar'); rail.setAttribute('aria-orientation', 'vertical'); rail.setAttribute('aria-label', W.tools);
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', ctx.type.name);
  palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', W.bands);
  main.append(rail, palette, boardBox);
  root.append(head, main, bar, pop);
  T.stage.textContent = ''; T.stage.appendChild(root);
  if (boxRo) boxRo.observe(boardBox);
  let board = null;

  // The challenge title: the teacher types it (with ideas to start from); everyone else reads it.
  // A text area of one line that grows with its text (a long title wraps rather than scrolling out of sight).
  const titleIn = el('textarea', 'gb-title input');
  Object.assign(titleIn, { rows: 1, maxLength: 80, placeholder: W.titlePh }); titleIn.dir = 'auto';
  const fitTitle = () => { titleIn.style.height = 'auto'; titleIn.style.height = `${titleIn.scrollHeight + 2}px`; };
  titleIn.setAttribute('aria-label', W.title);
  const titleOut = el('h3', 'gb-title gb-titlet'); titleOut.dir = 'auto';
  let titleTimer = 0;
  titleIn.addEventListener('input', () => { fitTitle(); clearTimeout(titleTimer); titleTimer = setTimeout(() => { const v = titleIn.value.trim(); if (v !== st.title) change(() => { st.title = v; }); }, 500); });
  titleIn.addEventListener('change', () => { clearTimeout(titleTimer); const v = titleIn.value.trim(); if (v !== st.title) change(() => { st.title = v; }); });
  titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
  const ideas = tbtn('💡', W.ideas, 'gb-ideas'); ideas.setAttribute('aria-haspopup', 'dialog'); ideas.setAttribute('aria-expanded', 'false');
  ideas.addEventListener('click', () => openMenu(ideas, 'ideas'));

  // ---------------------------------------------------------------- actions
  const setColour = k => {
    ui.colour = k;
    const b = band();
    if (b && b.c !== k) change(() => { b.c = k; }, fill(W.bandOf, { c: W[`c${k}`] }));
    else { ui.fresh = !b || b.closed; ui.mode = 'band'; draw(); ctx.say(`${fill(W.bandOf, { c: W[`c${k}`] })}. ${W.empty}`); }
  };
  const newBand = () => { if (st.bands.length >= G.MAX_BANDS) { ctx.say(W.noRoom); return; } ui.fresh = true; ui.mode = 'band'; st.cur = -1; ui.corner = -1; draw(); keep(); ctx.say(W.empty); };
  const delBand = () => { if (st.cur < 0) return; change(() => { st.bands.splice(st.cur, 1); st.cur = -1; ui.corner = -1; }, W.deleted); };
  const addShape = kind => {
    const pts = G.presetShape(kind, st.board, n()); if (!pts) return;
    if (st.bands.length >= G.MAX_BANDS) { ctx.say(W.noRoom); return; }
    // A second copy of the same shape moves over a little, so both show.
    let place = pts;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      const m = G.moveBand(st.board, n(), pts, dx, dy);
      if (m && !st.bands.some(b => b.pts.length === m.length && b.pts.every((p, i) => same(p, m[i])))) { place = m; break; }
    }
    const c = nextColour(); ui.colour = c;
    change(() => { st.bands.push({ pts: place, closed: true, c }); st.cur = st.bands.length - 1; }, fill(W.shapeAdded, { s: W[kind] }));
    closeMenu();
  };
  const setBoard = (kind, size) => change(() => {
    const was = st.board;
    st.board = kind;
    if (kind === 'circle') { if (size) st.ring = size; } else if (size) st.pegs = size;
    // Bands keep their pegs where they still fit; changing the kind of board starts the bands afresh.
    if (was !== kind) { st.bands = []; st.cur = -1; }
    else for (const b of st.bands) { b.pts = b.pts.filter(p => G.onBoard(st.board, n(), p)); if (b.pts.length < 3) b.closed = false; }
    st.bands = st.bands.filter(b => b.pts.length); if (st.cur >= st.bands.length) st.cur = -1;
    ui.ruler = null; ui.cursor = { x: 0, y: 0 }; ui.corner = -1;
  }, `${W[kind]}, ${kind === 'circle' ? fill(W.ringPegs, { n: size || st.ring }) : `${size || st.pegs} × ${size || st.pegs}`}`);
  const reset = () => change(() => { st.bands = []; st.cur = -1; st.notes = []; st.ink = []; ui.ruler = null; ui.corner = -1; }, W.resetDone);
  const toggle = key => change(() => { st[key] = !st[key]; }, `${W[key]}: ${st[key] ? '✓' : '✗'}`);
  const zoomBy = (k, cx, cy) => {
    const v = ui.view, z = Math.max(1, Math.min(4, v.z * k));
    if (cx != null) { v.cx = cx + (v.cx - cx) * (v.z / z); v.cy = cy + (v.cy - cy) * (v.z / z); }
    v.z = z; clampView(); applyView();
  };
  const clampView = () => { const v = ui.view, h = VB / 2 / v.z; v.cx = Math.max(h, Math.min(VB - h, v.cx)); v.cy = Math.max(h, Math.min(VB - h, v.cy)); if (v.z === 1) { v.cx = VB / 2; v.cy = VB / 2; } };
  const applyView = () => {
    if (!board) return;
    const v = ui.view, h = VB / 2 / v.z;
    board.setAttribute('viewBox', `${(v.cx - h).toFixed(2)} ${(v.cy - h).toFixed(2)} ${(2 * h).toFixed(2)} ${(2 * h).toFixed(2)}`);
    fit.hidden = v.z <= 1.001; boardBox.classList.toggle('is-zoomed', v.z > 1.001);
    syncButtons();
  };
  const setMode = m => { ui.mode = ui.mode === m && m !== 'band' ? 'band' : m; closeMenu(); draw(); const t = { pen: W.modePen, text: W.modeText, erase: W.modeErase }[ui.mode]; if (t) ctx.say(t); };
  const toggleRuler = () => {
    if (ui.ruler) ui.ruler = null;
    else if (st.board === 'circle') ui.ruler = { a: { x: n(), y: 0 }, b: { x: 0, y: 0 } };
    else { const N = n(), y = N - 2; ui.ruler = { a: { x: 1, y }, b: { x: Math.min(N - 1, 4), y } }; }
    closeMenu(); draw();
    if (ui.ruler) ctx.say(rulerText());
  };
  const rulerText = () => { const r = ui.ruler; return r ? fill(W.rulerIs, { l: iso(G.lengthLabel(G.sideLength(st.board, n(), r.a, r.b), ctx.intl)) }) : ''; };
  // Full screen: the widget itself (the Fullscreen API), or, where there is none, the widget filling the window.
  const card = () => body.closest('.dash-w, .dash-wcopy') || body;
  const isFull = () => document.fullscreenElement === card() || card().classList.contains('gb-max');
  const fullscreen = () => {
    const c = card();
    if (document.fullscreenElement === c) { document.exitFullscreen?.().catch(() => {}); return; }
    if (c.classList.contains('gb-max')) { c.classList.remove('gb-max'); document.documentElement.classList.remove('gb-maxed'); syncButtons(); return; }
    const fall = () => { c.classList.add('gb-max'); document.documentElement.classList.add('gb-maxed'); syncButtons(); requestAnimationFrame(draw); };
    if (c.requestFullscreen && document.fullscreenEnabled !== false) c.requestFullscreen().catch(fall); else fall();
  };
  const onFull = () => { syncButtons(); requestAnimationFrame(draw); };
  document.addEventListener('fullscreenchange', onFull);
  // Erasing and clearing the drawings and labels.
  const clearNotes = () => change(() => { st.notes = []; st.ink = []; }, W.clearNotes);

  // ---------------------------------------------------------------- the buttons
  const B = {};
  const mk = (id, icon, text, fn, cls) => { const b = tbtn(icon, text, cls); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); B[id] = b; return b; };
  const swatch = k => {
    const b = btn('', `btn btn-sm gb-sw gb-c${k}`, fill(W.bandOf, { c: W[`c${k}`] }));
    const ring = svg('svg', { viewBox: '0 0 40 24', class: 'gb-swring', 'aria-hidden': 'true' });
    ring.appendChild(svg('ellipse', { cx: 20, cy: 12, rx: 15, ry: 7, class: `gb-swband gb-c${k}`, 'stroke-dasharray': DASH[k] ? DASH[k].split(' ').map(x => x / 3).join(' ') : null }));
    b.appendChild(ring); b.addEventListener('click', e => { e.stopPropagation(); setColour(k); closeMenu(); });
    return b;
  };
  /** A menu trigger: opens one of the small menus (aria-haspopup, aria-expanded). */
  const trig = (id, icon, text) => { const b = mk(id, icon, text, x => openMenu(x, id), 'gb-trig'); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); return b; };
  const tog = (id, icon, text, key) => { const b = mk(id, icon, text, () => toggle(key), 'gb-tog'); b.dataset.key = key; return b; };

  function buildChrome() {
    const wide = ui.wide;
    root.classList.toggle('is-wide', wide); root.classList.toggle('is-compact', !wide);
    rail.textContent = ''; palette.textContent = ''; bar.textContent = ''; head.textContent = '';
    for (const k of Object.keys(B)) delete B[k];
    // The title row.
    if (teacherText && !ctx.editing && !projecting()) { titleIn.value = st.title; head.append(titleIn, ideas); }
    else head.appendChild(titleOut);
    if (ctx.editing) return;
    if (wide) {
      rail.append(trig('shapes', '🔷', W.shapes), trig('tools', '📏', W.tools), trig('annotate', '✏️', W.annotate), el('span', 'gb-grow'),
        mk('reset', '🔄', W.reset, reset), trig('board', BOARD_ICON[st.board], W[st.board]));
      for (let k = 0; k < G.BAND_COLOURS; k++) palette.appendChild(swatch(k));
      palette.append(mk('newBand', '＋', W.newBand, newBand, 'gb-sq'), mk('del', '🗑️', W.del, delBand, 'gb-sq'));
      bar.append(trig('settings', '⚙️', W.settings), mk('full', '⛶', W.full, fullscreen), mk('zoomIn', '＋', W.zoomIn, () => zoomBy(1.5)), mk('zoomOut', '－', W.zoomOut, () => zoomBy(1 / 1.5)),
        mk('undo', '↶', W.undo, undo), mk('redo', '↷', W.redo, redo), el('span', 'gb-grow'),
        trig('grid', '▦', W.grid), tog('fills', '◧', W.fills, 'fills'), tog('lines', '#', W.lines, 'lines'), tog('angles', '∠', W.angles, 'angles'), tog('labels', '🏷️', W.labels, 'labels'));
    } else {
      const bandsBtn = trig('bands', '', W.bands); bandsBtn.querySelector('.gb-ic').classList.add('gb-dot', `gb-c${ui.colour}`);
      bar.append(bandsBtn, trig('shapes', '🔷', W.shapes), trig('tools', '📏', W.tools), trig('annotate', '✏️', W.annotate), trig('view', '👁️', W.view),
        mk('undo', '↶', W.undo, undo), trig('more', '⋯', W.more));
    }
    syncButtons();
  }
  function syncButtons() {
    const b = band(), had = document.activeElement;
    for (const [id, x] of Object.entries(B)) {
      if (x.dataset.key) x.setAttribute('aria-pressed', String(!!st[x.dataset.key]));
      if (id === 'undo') x.disabled = !undoStack.length;
      if (id === 'redo') x.disabled = !redoStack.length;
      if (id === 'del') x.disabled = !b;
      if (id === 'newBand') x.disabled = st.bands.length >= G.MAX_BANDS;
      if (id === 'zoomIn') x.disabled = ui.view.z >= 4;
      if (id === 'zoomOut') x.disabled = ui.view.z <= 1;
      if (id === 'reset') x.disabled = !st.bands.length && !st.notes.length && !st.ink.length;
      if (id === 'full') { const on = isFull(); x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-label', on ? W.fullExit : W.full); x.dataset.tip = on ? W.fullExit : W.full; x.querySelector('.gb-lbl').textContent = on ? W.fullExit : W.full; }
      if (id === 'tools') x.setAttribute('aria-pressed', String(!!ui.ruler));
      if (id === 'annotate') x.setAttribute('aria-pressed', String(ui.mode !== 'band'));
      if (id === 'bands') { const d = x.querySelector('.gb-dot'); d.className = `gb-ic gb-dot gb-c${b ? b.c : ui.colour}`; }
    }
    for (const sw of palette.querySelectorAll('.gb-sw')) { const k = +sw.className.match(/gb-c(\d)/)[1]; sw.setAttribute('aria-pressed', String((b ? b.c : ui.colour) === k)); }
    // A button that has just been used up (Undo with nothing left, Reset on an empty board) hands the focus to the board.
    if (had && had.disabled && root.contains(had) && board) board.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- the small menus
  let menuFor = null;
  function closeMenu(back = false) {
    if (pop.hidden) return;
    pop.hidden = true; pop.textContent = '';
    const t = menuFor; menuFor = null;
    if (t) { t.setAttribute('aria-expanded', 'false'); if (back && t.isConnected) t.focus(); }
    document.removeEventListener('pointerdown', outside, true);
  }
  const outside = e => { if (!pop.contains(e.target) && !(menuFor && menuFor.contains(e.target))) closeMenu(); };
  const section = (title, head = true) => { if (head) pop.appendChild(el('h4', 'gb-poph', title)); const g = el('div', 'gb-popg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', title); pop.appendChild(g); return g; };
  const item = (g, icon, text, fn, pressed) => { const b = tbtn(icon, text, 'gb-item'); if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed)); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); g.appendChild(b); return b; };
  function fillMenu(id) {
    pop.textContent = '';
    const N = n();
    if (id === 'bands') {
      const g = section(W.bands); g.classList.add('gb-popsw');
      for (let k = 0; k < G.BAND_COLOURS; k++) g.appendChild(swatch(k));
      const h = section(W.bands, false);
      item(h, '＋', W.newBand, () => { closeMenu(); newBand(); }).disabled = st.bands.length >= G.MAX_BANDS;
      item(h, '🗑️', W.del, () => { closeMenu(); delBand(); }).disabled = !band();
      for (const sw of g.querySelectorAll('.gb-sw')) { const k = +sw.className.match(/gb-c(\d)/)[1]; sw.setAttribute('aria-pressed', String((band() ? band().c : ui.colour) === k)); }
    } else if (id === 'shapes') {
      const g = section(W.shapes); g.classList.add('gb-popshapes');
      for (const k of G.SHAPE_KINDS) {
        if (!G.presetShape(k, st.board, N)) continue;
        const b = btn('', 'btn btn-sm gb-item gb-shape', W[k]); b.dataset.tip = W[k];
        const pic = svg('svg', { viewBox: '0 0 24 24', class: 'gb-shapeic', 'aria-hidden': 'true' }); pic.appendChild(svg('polygon', { points: SHAPE_ICON[k] }));
        const l = el('span', 'gb-lbl', W[k]); l.setAttribute('aria-hidden', 'true');
        b.append(pic, l); b.addEventListener('click', e => { e.stopPropagation(); addShape(k); }); g.appendChild(b);
      }
    } else if (id === 'tools') {
      const g = section(W.tools);
      item(g, '👆', W.select, () => setMode('band'), ui.mode === 'band');
      item(g, '📏', W.ruler, toggleRuler, !!ui.ruler);
      if (st.board === 'square') item(g, '🔢', W.show, () => { closeMenu(); toggle('show'); }, st.show);
    } else if (id === 'annotate') {
      const g = section(W.annotate);
      item(g, '🔤', W.text, () => setMode('text'), ui.mode === 'text');
      item(g, '🖊️', W.pen, () => setMode('pen'), ui.mode === 'pen');
      item(g, '🧽', W.eraser, () => setMode('erase'), ui.mode === 'erase');
      const c = section(W.ink); c.classList.add('gb-popsw');
      for (let k = 0; k < PEN_COLOURS; k++) {
        const b = btn('', `btn btn-sm gb-pensw gb-pen${k}`, W[`pen${k}`]); b.setAttribute('aria-pressed', String(ui.pen === k)); b.dataset.tip = W[`pen${k}`];
        b.addEventListener('click', e => { e.stopPropagation(); ui.pen = k; ui.mode = 'pen'; closeMenu(); draw(); ctx.say(`${W.pen}: ${W[`pen${k}`]}`); }); c.appendChild(b);
      }
      const h = section(W.clearNotes, false);
      item(h, '🧹', W.clearNotes, () => { closeMenu(); clearNotes(); }).disabled = !st.notes.length && !st.ink.length;
      if (ownScreen || ctx.copy) pop.appendChild(el('p', 'gb-popnote', W.local));
    } else if (id === 'board' || id === 'settings' || id === 'grid' || id === 'view') {
      if (id === 'view') {
        const g = section(W.view);
        for (const [k, icon] of [['fills', '◧'], ['lines', '#'], ['angles', '∠'], ['labels', '🏷️']]) item(g, icon, W[k], () => { toggle(k); fillMenu(id); focusFirst(); }, st[k]);
      }
      if (id !== 'grid') {
        const g = section(W.board);
        for (const k of G.BOARDS) item(g, BOARD_ICON[k], W[k], () => { if (st.board !== k) setBoard(k); fillMenu(id); focusFirst(); }, st.board === k);
      }
      const g = section(W.grid); g.classList.add('gb-popsizes');
      const sizes = st.board === 'circle' ? G.RING_SIZES : G.GRID_SIZES;
      for (const v of sizes) {
        const text = st.board === 'circle' ? fill(W.ringPegs, { n: v }) : `${v} × ${v}`;
        const b = item(g, '', text, () => { setBoard(st.board, v); fillMenu(id); focusFirst(); }, N === v); b.querySelector('.gb-ic').remove(); b.classList.add('gb-size');
      }
    } else if (id === 'more') {
      const g = section(W.more);
      item(g, '＋', W.zoomIn, () => zoomBy(1.5)).disabled = ui.view.z >= 4;
      item(g, '－', W.zoomOut, () => zoomBy(1 / 1.5)).disabled = ui.view.z <= 1;
      item(g, '↷', W.redo, () => { redo(); fillMenu(id); focusFirst(); }).disabled = !redoStack.length;
      item(g, '⛶', isFull() ? W.fullExit : W.full, () => { closeMenu(); fullscreen(); });
      item(g, '🗑️', W.del, () => { closeMenu(); delBand(); }).disabled = !band();
      item(g, '🔄', W.reset, () => { closeMenu(); reset(); }).disabled = !st.bands.length && !st.notes.length && !st.ink.length;
    } else if (id === 'ideas') {
      const g = section(W.ideas); g.classList.add('gb-popideas');
      for (let i = 1; i <= 5; i++) {
        const t = W[`idea${i}`]; if (!t) continue;
        const b = btn('', 'btn btn-sm gb-item gb-idea'); const l = el('span', null, t); l.dir = 'auto'; b.appendChild(l);
        b.addEventListener('click', e => { e.stopPropagation(); titleIn.value = t; closeMenu(); change(() => { st.title = t; }, t); });
        g.appendChild(b);
      }
    }
  }
  const focusFirst = () => pop.querySelector('button:not(:disabled)')?.focus();
  function openMenu(trigger, id) {
    if (menuFor === trigger) { closeMenu(true); return; }
    closeMenu();
    menuFor = trigger; trigger.setAttribute('aria-expanded', 'true');
    pop.setAttribute('aria-label', trigger.getAttribute('aria-label') || '');
    pop.dataset.menu = id; pop.hidden = false;
    fillMenu(id);
    placeMenu(trigger);
    focusFirst();
    document.addEventListener('pointerdown', outside, true);
  }
  /** Next to its button (beside the rail, above the bar), always inside the tool. */
  function placeMenu(trigger) {
    const rr = root.getBoundingClientRect(), tr = trigger.getBoundingClientRect();
    // Above a button in the bar, the menu has the room above it (it scrolls if it needs more); never over its button.
    const inBar = !!trigger.closest('.gb-bar'), room = inBar ? tr.top - rr.top - 16 : rr.height - 16;
    pop.style.left = '0px'; pop.style.top = '0px'; pop.style.maxHeight = `${Math.max(120, room)}px`;
    const pr = pop.getBoundingClientRect();
    let x, y;
    if (trigger.closest('.gb-rail')) {
      // Beside the rail and the colours (on the inline end side: the left on a right-to-left page).
      const pb = palette.offsetParent ? palette.getBoundingClientRect() : tr;
      x = getComputedStyle(root).direction === 'rtl' ? Math.min(pb.left, tr.left) - rr.left - pr.width - 8 : Math.max(pb.right, tr.right) - rr.left + 8; y = tr.top - rr.top;
    }
    else if (trigger.closest('.gb-head')) { x = tr.right - rr.left - pr.width; y = tr.bottom - rr.top + 6; }
    else { x = tr.left - rr.left + tr.width / 2 - pr.width / 2; y = tr.top - rr.top - pr.height - 8; }
    x = Math.max(8, Math.min(rr.width - pr.width - 8, x)); y = Math.max(8, Math.min(rr.height - pr.height - 8, y));
    pop.style.left = `${Math.round(x)}px`; pop.style.top = `${Math.round(y)}px`;
  }
  pop.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    // Arrow keys move between a menu's buttons as well as Tab.
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (d && e.target.matches('button')) { const all = [...pop.querySelectorAll('button:not(:disabled)')], i = all.indexOf(e.target); if (i >= 0) { e.preventDefault(); all[(i + d + all.length) % all.length].focus(); } }
  });

  // ---------------------------------------------------------------- labels (text the teacher, or a student on their copy, types)
  let editing = null;
  function editNote(i, isNew) {
    closeMenu();
    const note = st.notes[i]; if (!note) return;
    editing = { i, before: isNew ? null : JSON.stringify(st), isNew };
    pop.textContent = ''; pop.hidden = false; pop.dataset.menu = 'note'; pop.setAttribute('aria-label', W.labelText);
    const f2 = el('form', 'gb-noteform'); f2.noValidate = true;
    const lab = el('label', 'gb-poph', W.labelText), inp = el('input', 'input gb-noteinput'); const id = `gb-n${Math.random().toString(36).slice(2, 8)}`;
    lab.htmlFor = id; inp.id = id; Object.assign(inp, { type: 'text', maxLength: 40, value: note.t }); inp.dir = 'auto';
    const row = el('div', 'gb-popg');
    const done = btn(W.done, 'btn btn-sm btn-primary gb-item'); done.type = 'submit';
    const del = tbtn('🗑️', W.labelDel, 'gb-item');
    row.append(done, del); f2.append(lab, inp, row); pop.appendChild(f2);
    const finish = keepIt => {
      const e2 = editing; editing = null; pop.hidden = true; pop.textContent = '';
      if (e2.isNew) ui.mode = 'band';   // one label at a time: back to making bands
      const t = [...inp.value.replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, '').trim()].slice(0, 40).join('');
      if (!keepIt || !t) { change(() => { st.notes.splice(e2.i, 1); }, W.labelDel); }
      else if (t !== st.notes[e2.i].t || e2.isNew) change(() => { st.notes[e2.i].t = t; }, `${W.labelText}: ${t}`);
      else draw();
      board?.focus({ preventScroll: true });
    };
    f2.addEventListener('submit', e => { e.preventDefault(); finish(true); });
    del.addEventListener('click', () => finish(false));
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (editing && editing.isNew) finish(false); else { editing = null; pop.hidden = true; pop.textContent = ''; board?.focus({ preventScroll: true }); } } });
    const rr = root.getBoundingClientRect(), br = boardBox.getBoundingClientRect();
    pop.style.maxWidth = `${Math.max(160, rr.width - 16)}px`; pop.style.maxHeight = `${Math.max(120, rr.height - 16)}px`;
    const pr = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(Math.max(8, Math.min(rr.width - pr.width - 8, br.left - rr.left + br.width / 2 - pr.width / 2)))}px`;
    pop.style.top = `${Math.round(Math.max(8, br.top - rr.top + 8))}px`;
    inp.focus(); inp.select();
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    // The chrome: a rail and a bar on a wide widget, one compact bar on a narrow one, a phone or the projector.
    const sw = T.stage.clientWidth, sh = T.stage.clientHeight, phone = matchMedia('(max-width: 719px)').matches;
    const wide = !projecting() && !phone && sw >= 620 && sh >= 400;
    if (wide !== ui.wide) { ui.wide = wide; closeMenu(); buildChrome(); }
    // Where a square board leaves room at its side (a wide tool, the projector), the measures are read out beside it;
    // otherwise under it.
    const side = !phone && !ctx.editing && sw >= 560 && sw - sh >= (wide ? 140 : 220);
    if (side !== ui.side) {
      ui.side = side; root.classList.toggle('has-side', side);
      if (side) { main.appendChild(T.read); T.read.classList.add('gb-sideread'); } else { T.stage.after(T.read); T.read.classList.remove('gb-sideread'); }
    }
    titleOut.textContent = st.title; titleOut.hidden = !st.title;
    head.hidden = !st.title && !(teacherText && !ctx.editing && !projecting());
    if (teacherText && document.activeElement !== titleIn && titleIn.value !== st.title) titleIn.value = st.title;
    if (teacherText && titleIn.isConnected) fitTitle();
    f = frame();
    // The readout first: beside the board it takes room from it, so the board is measured after it.
    readout();
    const N = f.N, bands = st.bands, sel = band();
    cursorFix();
    // Screen pixels per viewBox unit with the whole board in view (the board box is square-ish; a phone uses its width).
    const bw = boardBox.clientWidth, bh = boardBox.clientHeight; boxSize = { w: bw, h: bh };
    pxPerUnit = (phone || !bh ? bw : Math.min(bw, bh)) / VB || 0.5;
    const z = ui.view.z, floor = projecting() ? 16 : 13;
    // Text keeps its size on the screen when the board is zoomed (the pegs and bands grow; the words don't).
    const fs = base => Math.max(base / z, floor / (pxPerUnit * z));
    const big = projecting() ? 1.5 : 1;
    const peg = Math.max(Math.min(13, f.sp * 0.13) * big, 3.2 / (pxPerUnit * z));
    const lw = Math.max(9 * big, 3 / (pxPerUnit * z));
    board = svg('svg', { viewBox: `0 0 ${VB} ${VB}`, class: `gb-svg gb-m-${ui.mode}`, role: 'application', tabindex: ctx.editing ? '-1' : '0',
      'aria-label': `${W.cursor}. ${W.hint}`, 'aria-roledescription': W.cursor, direction: 'ltr' });
    board.appendChild(svg('rect', { x: 6, y: 6, width: VB - 12, height: VB - 12, rx: 30, class: 'gb-base' }));
    // Grid lines through the pegs.
    if (st.lines) {
      const g = svg('g', { class: 'gb-lines' });
      if (st.board === 'square') for (let i = 0; i < N; i++) { const a = at({ x: i, y: 0 }), b = at({ x: i, y: N - 1 }), c = at({ x: 0, y: i }), d = at({ x: N - 1, y: i }); g.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }), svg('line', { x1: c.x, y1: c.y, x2: d.x, y2: d.y })); }
      else if (st.board === 'iso') {
        // The rows, and the lines down-right and down-left through neighbouring pegs.
        for (let y = 0; y < N; y++) { const a = at({ x: 0, y }), b = at({ x: N - 1, y }); g.appendChild(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y })); }
        for (const dir of [1, -1]) for (let start = -N; start < 2 * N; start++) {
          const run = []; for (let r = 0; r < N; r++) { const L = { x: dir === 1 ? start : start - r, y: r }; const p = G.fromLattice('iso', L); if (G.onBoard('iso', N, p)) run.push(p); }
          if (run.length > 1) { const a = at(run[0]), b = at(run.at(-1)); g.appendChild(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y })); }
        }
      } else {
        const c = at({ x: N, y: 0 });
        g.appendChild(svg('circle', { cx: c.x, cy: c.y, r: f.S, fill: 'none' }));
        for (let i = 0; i < N; i++) { const p = at({ x: i, y: 0 }); g.appendChild(svg('line', { x1: c.x, y1: c.y, x2: p.x, y2: p.y })); }
      }
      board.appendChild(g);
    } else if (st.board === 'circle') { const c = at({ x: N, y: 0 }); board.appendChild(svg('circle', { cx: c.x, cy: c.y, r: f.S, class: 'gb-ring' })); }
    // Bands: the fills first, then the bands (the selected one on top).
    if (st.fills) bands.forEach(b => { if (simple(b)) board.appendChild(svg('polygon', { points: b.pts.map(p => { const q = at(p); return `${q.x},${q.y}`; }).join(' '), class: `gb-fill gb-c${b.c}` })); });
    const order = bands.map((b, k) => k).filter(k => k !== st.cur).concat(sel ? [st.cur] : []);
    for (const k of order) {
      const b = bands[k]; if (!b.pts.length) continue;
      const pts = b.pts.map(p => { const q = at(p); return `${q.x},${q.y}`; }).join(' ');
      const crossing = b.closed && !simple(b);
      board.appendChild(svg(b.closed ? 'polygon' : 'polyline', { points: pts, class: `gb-band gb-c${b.c}${k === st.cur ? ' is-sel' : ''}${crossing ? ' is-bad' : ''}`, 'stroke-dasharray': DASH[b.c] || null, 'stroke-width': (k === st.cur ? lw * 1.3 : lw).toFixed(1) }));
      if (b.pts.length === 1) { const q = at(b.pts[0]); board.appendChild(svg('circle', { cx: q.x, cy: q.y, r: lw * 1.2, class: `gb-start gb-c${b.c}` })); }
    }
    // Pegs.
    const pg = svg('g', { class: 'gb-pegs' });
    for (const p of G.pegList(st.board, N)) { const q = at(p); pg.appendChild(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: peg.toFixed(1) })); }
    board.appendChild(pg);
    // The selected band's corners: handles to drag (the first one ringed while the band is open, to close it).
    if (sel) sel.pts.forEach((p, i) => {
      const q = at(p);
      board.appendChild(svg('circle', { cx: q.x, cy: q.y, r: Math.max(peg * 1.9, 9 / (pxPerUnit * z)), class: `gb-handle gb-c${sel.c}${i === ui.corner ? ' is-active' : ''}${!sel.closed && i === 0 && sel.pts.length >= 3 ? ' is-first' : ''}` }));
    });
    // Letters, side lengths and angles: the selected band's, or every band's when none is selected.
    const marked = sel ? [st.cur] : bands.map((b, k) => k);
    if (st.labels || st.angles) {
      const tg = svg('g', { class: 'gb-marks' });
      let letter = 0;
      bands.forEach((b, k) => {
        const P = b.pts.map(at), m = P.length; if (!m) return;
        const cx = P.reduce((a, q) => a + q.x, 0) / m, cy = P.reduce((a, q) => a + q.y, 0) / m;
        const ok = simple(b), angs = ok ? G.interiorAngles(st.board, N, b.pts) : null;
        // A corner's outward direction: away from the inside angle (or away from the middle, for an open band).
        const outward = i => {
          const v = P[i], a = P[(i + m - 1) % m], c = P[(i + 1) % m];
          if (m < 3) { const dx = v.x - cx, dy = v.y - cy, l = Math.hypot(dx, dy) || 1; return { x: dx / l || 0, y: dy / l || -1 }; }
          const u1 = { x: a.x - v.x, y: a.y - v.y }, u2 = { x: c.x - v.x, y: c.y - v.y }, l1 = Math.hypot(u1.x, u1.y) || 1, l2 = Math.hypot(u2.x, u2.y) || 1;
          let bx = u1.x / l1 + u2.x / l2, by = u1.y / l1 + u2.y / l2, bl = Math.hypot(bx, by);
          if (bl < 1e-6) { bx = -u1.y / l1; by = u1.x / l1; bl = 1; }
          bx /= bl; by /= bl;
          // The bisector points inside for a corner under 180°, outside for a reflex one.
          const inside = ok && angs ? angs[i] < 180 : (bx * (cx - v.x) + by * (cy - v.y)) > 0;
          return inside ? { x: -bx, y: -by } : { x: bx, y: by };
        };
        if (st.labels) P.forEach((v, i) => {
          const o = outward(i), d = fs(26) * 1.05;
          tg.appendChild(svg('text', { x: v.x + o.x * d, y: v.y + o.y * d, class: `gb-letter gb-t${b.c}`, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `font-size:${fs(26).toFixed(1)}px` }, G.vertexLetter(letter + i)));
        });
        if (marked.includes(k)) {
          if (st.labels) {
            const sides = b.closed ? m : m - 1;
            for (let i = 0; i < sides; i++) {
              const a = P[i], c = P[(i + 1) % m], L = G.sideLength(st.board, N, b.pts[i], b.pts[(i + 1) % m]);
              const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2, len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
              let nx = -(c.y - a.y) / len, ny = (c.x - a.x) / len; if (nx * (cx - mx) + ny * (cy - my) > 0) { nx = -nx; ny = -ny; }
              const d = fs(20) * 0.95;
              tg.appendChild(svg('text', { x: mx + nx * d, y: my + ny * d, class: 'gb-side', 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `font-size:${fs(20).toFixed(1)}px` }, L.inexact ? `≈${G.approxText(L, ctx.intl)}` : G.lengthText(L)));
            }
          }
          if (st.angles && angs) P.forEach((v, i) => {
            const o = outward(i), r = Math.min(f.sp * 0.32, 46);
            const a = P[(i + m - 1) % m], c = P[(i + 1) % m];
            const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(c.y - v.y, c.x - v.x);
            // The arc inside the shape, from one side to the other.
            let sweep = a2 - a1; while (sweep <= -Math.PI) sweep += 2 * Math.PI; while (sweep > Math.PI) sweep -= 2 * Math.PI;
            let start = a1, span = sweep;
            const want = angs[i] * Math.PI / 180;
            if (Math.abs(Math.abs(span) - want) > 0.01) span = span > 0 ? span - 2 * Math.PI : span + 2 * Math.PI;
            const x1 = v.x + r * Math.cos(start), y1 = v.y + r * Math.sin(start), x2 = v.x + r * Math.cos(start + span), y2 = v.y + r * Math.sin(start + span);
            if (Math.abs(angs[i] - 90) < 0.01) {
              const s1 = { x: Math.cos(a1) * r * 0.7, y: Math.sin(a1) * r * 0.7 }, s2 = { x: Math.cos(a2) * r * 0.7, y: Math.sin(a2) * r * 0.7 };
              tg.appendChild(svg('path', { d: `M${v.x + s1.x},${v.y + s1.y} L${v.x + s1.x + s2.x},${v.y + s1.y + s2.y} L${v.x + s2.x},${v.y + s2.y}`, class: 'gb-arc' }));
            } else tg.appendChild(svg('path', { d: `M${x1},${y1} A${r},${r} 0 ${Math.abs(span) > Math.PI ? 1 : 0} ${span > 0 ? 1 : 0} ${x2},${y2}`, class: 'gb-arc' }));
            const d = r + fs(19) * 1.6;
            tg.appendChild(svg('text', { x: v.x - o.x * d, y: v.y - o.y * d, class: 'gb-angle', 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `font-size:${fs(19).toFixed(1)}px` }, G.angleText(angs[i], ctx.intl)));
          });
        }
        letter += m;
      });
      board.appendChild(tg);
    }
    // Pen strokes and text labels.
    const ink = svg('g', { class: 'gb-inks' });
    for (const k of st.ink) ink.appendChild(svg('path', { d: strokePath(k.p), class: `gb-ink gb-pen${k.c}`, 'stroke-width': Math.max(6, 2.5 / (pxPerUnit * z)).toFixed(1) }));
    board.appendChild(ink);
    st.notes.forEach((note, i) => {
      const g = svg('g', { class: 'gb-note', tabindex: ctx.editing ? '-1' : '0', role: 'button', 'aria-label': fill(W.labelIs, { t: note.t }), 'data-note': i });
      g.appendChild(svg('text', { x: note.x, y: note.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `font-size:${fs(30).toFixed(1)}px` }, note.t));
      board.appendChild(g);
    });
    // The ruler: a strip from peg to peg with a tick at every step and its length.
    if (ui.ruler) {
      const r = ui.ruler, a = at(r.a), b = at(r.b), len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const g = svg('g', { class: 'gb-ruler', transform: `translate(${a.x} ${a.y}) rotate(${ang})` });
      const wdt = Math.max(46, 18 / (pxPerUnit * z));
      g.appendChild(svg('rect', { x: -wdt * 0.4, y: -wdt / 2, width: len + wdt * 0.8, height: wdt, rx: 10, class: 'gb-rulerbody', 'data-rh': 'body' }));
      const step = st.board === 'circle' ? f.S : f.sp;
      for (let t = 0; t <= len + 0.5; t += step / 2) g.appendChild(svg('line', { x1: t, y1: -wdt / 2, x2: t, y2: -wdt / 2 + (Math.round(t / step * 2) % 2 ? wdt * 0.22 : wdt * 0.4), class: 'gb-tick' }));
      board.appendChild(g);
      for (const [end, q] of [['a', a], ['b', b]]) board.appendChild(svg('circle', { cx: q.x, cy: q.y, r: Math.max(20, 14 / (pxPerUnit * z)), class: 'gb-rhandle', 'data-rh': end }));
      const L = G.sideLength(st.board, N, r.a, r.b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const flip = Math.abs(ang) > 90 ? 180 : 0;
      board.appendChild(svg('text', { x: mx, y: my, class: 'gb-rulert', 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${ang + flip} ${mx} ${my})`, style: `font-size:${fs(24).toFixed(1)}px` }, G.lengthLabel(L, ctx.intl)));
    }
    // The keyboard's peg cursor (shown only while the board has the keyboard focus).
    const cq = at(ui.cursor);
    board.appendChild(svg('circle', { cx: cq.x, cy: cq.y, r: Math.max(peg * 2.4, 12 / (pxPerUnit * z)), class: 'gb-cursor' }));
    if (drag && drag.kind === 'corner' && drag.to) { const q = at(drag.to); board.appendChild(svg('circle', { cx: q.x, cy: q.y, r: peg * 2.6, class: 'gb-drop' })); }
    const hadFocus = boardBox.contains(document.activeElement) && document.activeElement.tagName.toLowerCase() === 'svg';
    boardBox.textContent = '';
    boardBox.append(board, chip, fit);
    applyView();
    if (hadFocus) board.focus({ preventScroll: true });
    wire();
    // The mode chip: what a tap does now, and the way back to making bands.
    chip.textContent = '';
    if (ui.mode !== 'band' && !ctx.editing) {
      chip.hidden = false;
      const t = el('span', 'gb-chipt', { pen: W.modePen, text: W.modeText, erase: W.modeErase }[ui.mode]); t.dir = 'auto';
      const back = btn(W.done, 'btn btn-sm gb-chipx'); back.addEventListener('click', e => { e.stopPropagation(); setMode('band'); board.focus({ preventScroll: true }); });
      chip.append(t, back);
    } else chip.hidden = true;
    syncButtons();
  }
  const strokePath = p => { let d = ''; for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]},${p[i + 1]}`; return p.length === 2 ? `${d}l0.1,0` : d; };
  function cursorFix() { if (!G.onBoard(st.board, n(), ui.cursor)) ui.cursor = st.board === 'circle' ? { x: 0, y: 0 } : { x: Math.min(ui.cursor.x, n() - 1), y: Math.min(ui.cursor.y, n() - 1) }; }

  /** Under the board: the selected band's area and perimeter (exact on the grids), or what to do next. */
  function readout() {
    T.read.textContent = '';
    const b = band(), N = n();
    if (simple(b)) {
      const A = G.shapeArea(st.board, N, b.pts), L = G.bandLengthOn(st.board, N, b.pts, true);
      const big = ltr('div', 'dt-big dt-geobig');
      const dot = el('span', `gb-rdot gb-c${b.c}`); dot.setAttribute('aria-hidden', 'true');
      const pair = (k, v) => { const x = el('span', 'gb-pair'); x.append(el('span', 'dt-geok', `${k} `), el('b', null, v)); return x; };
      big.append(dot, pair(W.area, areaText(A)), el('span', 'dt-geosep', ' · '), pair(W.perimeter, G.lengthLabel(L, ctx.intl)));
      T.read.appendChild(big);
      if (st.show && A.kind === 'sq') T.read.appendChild(ltr('div', 'dt-sub', fill(W.pickIs, { i: A.I, b: A.B, a: G.mixed(A.a2, 2) })));
      else if (st.show && A.kind === 'tri') T.read.appendChild(ltr('div', 'dt-sub', fill(W.pickTri, { i: A.I, b: A.B, a: A.t })));
      else if (A.kind === 'approx') T.read.appendChild(el('div', 'dt-sub', W.radiusOne));
    } else if (b && b.closed) T.read.appendChild(el('div', 'dt-sub dt-note', W.crosses));
    else if (b && b.pts.length > 1) { const L = G.bandLengthOn(st.board, N, b.pts, false); const big = ltr('div', 'dt-big dt-geobig'); big.append(el('span', 'dt-geok', `${W.length} `), el('b', null, G.lengthLabel(L, ctx.intl))); T.read.append(big, el('div', 'dt-sub', W.open)); }
    else if (!ctx.editing) T.read.appendChild(el('div', 'dt-sub', b || !st.bands.length || ui.fresh ? W.empty : W.pickOne));
  }

  // ---------------------------------------------------------------- pointers: mouse, touch and pen
  let drag = null;
  const pointers = new Map();
  const vpt = e => svgPoint(board, e);
  const cornerAt = p => {
    if (!p) return null;
    const sel = band();
    if (sel) { const i = sel.pts.findIndex(q => same(q, p)); if (i >= 0) return { b: st.cur, i }; }
    for (let k = st.bands.length - 1; k >= 0; k--) { if (k === st.cur) continue; const i = st.bands[k].pts.findIndex(q => same(q, p)); if (i >= 0) return { b: k, i }; }
    return null;
  };
  const bandAt = v => {
    const u = units(v), sel = band();
    if (sel && sel.closed && G.insideBand(st.board, n(), sel.pts, u)) return st.cur;
    for (let k = st.bands.length - 1; k >= 0; k--) { const b = st.bands[k]; if (b.closed && b.pts.length >= 3 && G.insideBand(st.board, n(), b.pts, u)) return k; }
    return -1;
  };
  const select = (k, corner = -1) => { st.cur = k; ui.corner = corner; ui.fresh = false; draw(); keep(); say(k >= 0 ? fill(W.selected, { n: k + 1 }) : ''); };
  /** A tap (or Enter) on a peg p (or on nothing: p null) at v, making bands. */
  function tap(p, v) {
    const sel = band();
    if (sel && !sel.closed && !ui.fresh) {
      if (!p) return;
      const i = sel.pts.findIndex(q => same(q, p));
      if (i === 0 && sel.pts.length >= 3) { const ok = G.simpleOn(st.board, n(), sel.pts); ui.said = ''; change(() => { sel.closed = true; }, ok ? fill(W.closed, { a: iso(areaText(G.shapeArea(st.board, n(), sel.pts))) }) : W.crosses); return; }
      if (i >= 0) { ui.corner = i; draw(); ctx.say(fill(W.corner, { l: G.vertexLetter(i) })); return; }
      if (sel.pts.length >= G.MAX_PTS) return;
      change(() => { sel.pts.push({ ...p }); }, fill(W.added, { x: p.x + 1, y: p.y + 1 }));
      return;
    }
    if (!ui.fresh) {
      const c = cornerAt(p);
      if (c) { select(c.b, c.i); return; }
      const k = v ? bandAt(v) : -1;
      if (k >= 0) { if (k !== st.cur) select(k); return; }
    }
    if (!p) { if (st.cur >= 0) select(-1); return; }
    if (st.bands.length >= G.MAX_BANDS) { ctx.say(W.noRoom); return; }
    const colour = ui.fresh ? ui.colour : nextColour();
    ui.fresh = false; ui.corner = -1;
    change(() => { st.bands.push({ pts: [{ ...p }], closed: false, c: colour }); st.cur = st.bands.length - 1; }, fill(W.added, { x: p.x + 1, y: p.y + 1 }));
    ui.colour = colour;
  }
  function wire() {
    if (ctx.editing) return;
    board.addEventListener('pointerdown', down);
    board.addEventListener('pointermove', move);
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', cancel);
    board.addEventListener('lostpointercapture', e => { if (pointers.has(e.pointerId) && !board.isConnected) pointers.delete(e.pointerId); });
    board.addEventListener('keydown', keys);
    board.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const v = vpt(e); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, v.x, v.y); }, { passive: false });
    board.addEventListener('dblclick', e => { const g = e.target.closest('.gb-note'); if (g) editNote(+g.dataset.note, false); });
    for (const g of board.querySelectorAll('.gb-note')) g.addEventListener('keydown', e => {
      const i = +g.dataset.note, note = st.notes[i]; if (!note) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); editNote(i, false); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); change(() => { st.notes.splice(i, 1); }, W.labelDel); board.focus({ preventScroll: true }); }
      else { const d = { ArrowRight: [20, 0], ArrowLeft: [-20, 0], ArrowDown: [0, 20], ArrowUp: [0, -20] }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); change(() => { note.x = Math.max(0, Math.min(VB, note.x + d[0])); note.y = Math.max(0, Math.min(VB, note.y + d[1])); }); board.querySelector(`[data-note="${i}"]`)?.focus(); } }
    });
  }
  // Pointers are kept on the board element for the whole gesture; a redraw replaces the element, so the gesture state
  // lives here and the new board takes the capture over.
  function capture(e) { try { board.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ } }
  function down(e) {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    if (!pop.hidden && pop.dataset.menu === 'note') return;
    closeMenu();
    // A first finger (or a mouse or pen) starts afresh: no pointer left over from a gesture the board missed the end of.
    if (e.isPrimary) pointers.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e);
    e.preventDefault();
    board.focus({ preventScroll: true });
    if (pointers.size === 2) {
      // Two fingers: pinch to zoom and move the board; whatever one finger had started is put back.
      if (drag && drag.before) { restore(drag.before); draw(); }
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, z0: ui.view.z, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: { ...ui.view } };
      return;
    }
    if (pointers.size > 2) return;
    const v = vpt(e), start = { x: e.clientX, y: e.clientY };
    const base = { id: e.pointerId, v, start, moved: false };
    const noteEl = e.target.closest && e.target.closest('.gb-note');
    const rh = e.target.closest && e.target.closest('[data-rh]');
    if (rh && ui.ruler && ui.mode === 'band') { drag = { ...base, kind: 'ruler', end: rh.dataset.rh, grab: pegNear(v, true), r0: clone(ui.ruler) }; return; }
    if (noteEl && ui.mode !== 'pen' && ui.mode !== 'erase') { const i = +noteEl.dataset.note; drag = { ...base, kind: 'note', i, before: JSON.stringify(st), dx: st.notes[i].x - v.x, dy: st.notes[i].y - v.y }; return; }
    if (ui.mode === 'pen') { if (st.ink.length >= MAX_INK) { ctx.say(W.inkFull); drag = null; return; } drag = { ...base, kind: 'pen', pts: [[Math.round(v.x), Math.round(v.y)]], path: null }; return; }
    if (ui.mode === 'erase') { drag = { ...base, kind: 'erase', before: JSON.stringify(st) }; rub(v); return; }
    if (ui.mode === 'text') { drag = { ...base, kind: 'text' }; return; }
    const p = pegNear(v), sel = band();
    const drawing = sel && !sel.closed && !ui.fresh;
    const c = !ui.fresh ? cornerAt(p) : null;
    if (c && (!drawing || c.b === st.cur)) { drag = { ...base, kind: 'corner', b: c.b, i: c.i, p, to: null, before: JSON.stringify(st) }; return; }
    const k = !drawing && !ui.fresh ? bandAt(v) : -1;
    if (k >= 0) { drag = { ...base, kind: 'band', b: k, grab: pegNear(v, true), orig: clone(st.bands[k].pts), before: JSON.stringify(st) }; return; }
    drag = { ...base, kind: ui.view.z > 1.001 ? 'pan' : 'tap', p, view0: { ...ui.view } };
  }
  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], d = Math.hypot(b.x - a.x, b.y - a.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v0 = drag.view0, z = Math.max(1, Math.min(4, drag.z0 * d / drag.d0)), k = 1 / (pxPerUnit * z);
      ui.view = { z, cx: v0.cx - (m.x - drag.m0.x) * k, cy: v0.cy - (m.y - drag.m0.y) * k };
      // Zoom about the fingers' middle: the point under it stays put.
      const r = board.getBoundingClientRect(), off = { x: (drag.m0.x - (r.left + r.width / 2)), y: (drag.m0.y - (r.top + r.height / 2)) };
      ui.view.cx += off.x * (1 / (pxPerUnit * v0.z) - k); ui.view.cy += off.y * (1 / (pxPerUnit * v0.z) - k);
      clampView(); applyView(); return;
    }
    if (drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 6) return;
    drag.moved = true;
    const v = vpt(e);
    if (drag.kind === 'corner') {
      const p = pegNear(v), b = st.bands[drag.b];
      if (!p || !b || same(p, b.pts[drag.i]) || b.pts.some((q, i) => i !== drag.i && same(q, p))) return;
      if (st.cur !== drag.b) { st.cur = drag.b; }
      ui.corner = drag.i; b.pts[drag.i] = { ...p }; drag.to = p; draw(); capture(e);
    } else if (drag.kind === 'band') {
      const q = pegNear(v, true), g = drag.grab; if (!q || !g) return;
      let dx, dy;
      if (st.board === 'circle') { if (g.x >= n() || q.x >= n()) return; dx = q.x - g.x; dy = 0; }
      else { const a = G.toLattice(st.board, g), c = G.toLattice(st.board, q); dx = c.x - a.x; dy = c.y - a.y; }
      const m = G.moveBand(st.board, n(), drag.orig, dx, dy); if (!m) return;
      const b = st.bands[drag.b];
      if (b.pts.every((p, i) => same(p, m[i]))) return;
      st.cur = drag.b; b.pts = m; draw(); capture(e);
    } else if (drag.kind === 'pan') {
      const k = 1 / (pxPerUnit * ui.view.z);
      ui.view.cx = drag.view0.cx - (e.clientX - drag.start.x) * k; ui.view.cy = drag.view0.cy - (e.clientY - drag.start.y) * k; clampView(); applyView();
    } else if (drag.kind === 'pen') {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const q = svgPoint(board, ev), last = drag.pts.at(-1); if (Math.hypot(q.x - last[0], q.y - last[1]) >= 3) drag.pts.push([Math.max(0, Math.min(VB, Math.round(q.x))), Math.max(0, Math.min(VB, Math.round(q.y)))]); }
      if (!drag.path) { drag.path = svg('path', { class: `gb-ink gb-pen${ui.pen}`, 'stroke-width': Math.max(6, 2.5 / (pxPerUnit * ui.view.z)).toFixed(1) }); board.querySelector('.gb-inks')?.appendChild(drag.path); }
      drag.path.setAttribute('d', strokePath(drag.pts.flat()));
    } else if (drag.kind === 'erase') rub(v);
    else if (drag.kind === 'note') {
      const note = st.notes[drag.i]; if (!note) return;
      note.x = Math.round(Math.max(0, Math.min(VB, v.x + drag.dx))); note.y = Math.round(Math.max(0, Math.min(VB, v.y + drag.dy)));
      const t = board.querySelector(`[data-note="${drag.i}"] text`); if (t) { t.setAttribute('x', note.x); t.setAttribute('y', note.y); }
    } else if (drag.kind === 'ruler') {
      const q = pegNear(v, true); if (!q) return;
      const r = ui.ruler;
      if (drag.end === 'a' || drag.end === 'b') { const other = drag.end === 'a' ? r.b : r.a; if (!same(q, other) && !same(q, r[drag.end])) { r[drag.end] = q; draw(); capture(e); } }
      else if (drag.grab) {
        let dx, dy;
        if (st.board === 'circle') { if (drag.grab.x >= n() || q.x >= n()) return; dx = q.x - drag.grab.x; dy = 0; }
        else { const a = G.toLattice(st.board, drag.grab), c = G.toLattice(st.board, q); dx = c.x - a.x; dy = c.y - a.y; }
        const m = G.moveBand(st.board, n(), [drag.r0.a, drag.r0.b], dx, dy);
        if (m && !(same(m[0], r.a) && same(m[1], r.b))) { r.a = m[0]; r.b = m[1]; draw(); capture(e); }
      }
    }
  }
  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'pinch') { if (!pointers.size) { drag = null; draw(); } return; }
    if (drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (d.kind === 'corner') {
      if (d.moved) settle(d.before, fill(W.cornerMoved, { l: G.vertexLetter(d.i) }));
      else tap(d.p, d.v);
    } else if (d.kind === 'band') {
      if (d.moved) settle(d.before, W.moved); else tap(pegNear(d.v), d.v);
    } else if (d.kind === 'tap' || (d.kind === 'pan' && !d.moved)) tap(d.p, d.v);
    else if (d.kind === 'pan') draw();
    else if (d.kind === 'pen') {
      let pts = G.simplifyStroke(d.pts, 2.5);
      if (pts.length > MAX_INK_PTS) { const step = pts.length / MAX_INK_PTS; pts = Array.from({ length: MAX_INK_PTS }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]); pts[MAX_INK_PTS - 1] = d.pts.at(-1); }
      change(() => { st.ink.push({ c: ui.pen, p: pts.flat() }); });
    } else if (d.kind === 'erase') settle(d.before, W.eraser);
    else if (d.kind === 'text') {
      if (d.moved) return;
      if (st.notes.length >= MAX_NOTES) { ctx.say(W.noRoom); return; }
      st.notes.push({ x: Math.round(Math.max(0, Math.min(VB, d.v.x))), y: Math.round(Math.max(0, Math.min(VB, d.v.y))), t: '' });
      draw(); editNote(st.notes.length - 1, true);
    } else if (d.kind === 'note') {
      if (d.moved) settle(d.before, W.labelText); else editNote(d.i, false);
    } else if (d.kind === 'ruler') { draw(); if (d.moved) ctx.say(rulerText()); }
  }
  function cancel(e) {
    pointers.delete(e.pointerId);
    if (drag && drag.before && drag.kind !== 'pinch') restore(drag.before);
    drag = null; draw();
  }
  /** The eraser takes away any pen stroke that passes near the point. */
  function rub(v) {
    const r = Math.max(16, 14 / (pxPerUnit * ui.view.z));
    const near = k => { const p = k.p; for (let i = 0; i < p.length; i += 2) { const ax = p[i], ay = p[i + 1], bx = p[i + 2] ?? ax, by = p[i + 3] ?? ay, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((v.x - ax) * dx + (v.y - ay) * dy) / l2)) : 0; if (Math.hypot(ax + t * dx - v.x, ay + t * dy - v.y) <= r) return true; } return false; };
    const left = st.ink.filter(k => !near(k));
    if (left.length !== st.ink.length) { st.ink = left; draw(); }
  }

  // ---------------------------------------------------------------- the keyboard
  function keys(e) {
    if (e.target !== board) return;
    const N = n(), sel = band();
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (dir) {
      e.preventDefault();
      const step = p => (st.board === 'circle' ? (p.x >= N ? p : { x: (p.x + (dir[0] || dir[1]) + N) % N, y: 0 }) : { x: p.x + dir[0], y: p.y + dir[1] });
      if (sel && sel.closed && ui.corner >= 0) {
        const q = step(sel.pts[ui.corner]);
        if (G.onBoard(st.board, N, q) && !sel.pts.some(p => same(p, q))) { ui.cursor = q; change(() => { sel.pts[ui.corner] = q; }, `${fill(W.cornerMoved, { l: G.vertexLetter(ui.corner) })}, ${fill(W.peg, { x: q.x + 1, y: q.y + 1 })}`); }
      } else if (sel && sel.closed) {
        // A whole band moves a step (triangle dots: along the row, or down a row to the right or up to the left).
        const m = st.board === 'circle' ? G.moveBand('circle', N, sel.pts, dir[0] || dir[1], 0) : G.moveBand(st.board, N, sel.pts, dir[0], dir[1]);
        if (m) change(() => { sel.pts = m; }, W.moved);
      } else {
        const q = step(ui.cursor);
        if (G.onBoard(st.board, N, q)) { ui.cursor = q; draw(); ctx.say(fill(W.peg, { x: q.x + 1, y: q.y + 1 })); }
      }
      board.focus({ preventScroll: true });
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (ui.mode === 'text') { st.notes.push({ ...pick(at(ui.cursor)), t: '' }); draw(); editNote(st.notes.length - 1, true); return; } tap(ui.cursor, at(ui.cursor)); board.focus({ preventScroll: true }); }
    else if (e.key === 'Escape') {
      if (ui.mode !== 'band') { e.preventDefault(); setMode('band'); }
      else if (ui.corner >= 0) { e.preventDefault(); ui.corner = -1; draw(); }
      else if (st.cur >= 0 || ui.fresh) { e.preventDefault(); ui.fresh = false; select(-1); }
      board.focus({ preventScroll: true });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (sel && !sel.closed && e.key === 'Backspace') change(() => { sel.pts.pop(); if (!sel.pts.length) { st.bands.splice(st.cur, 1); st.cur = -1; } }, W.undo);
      else if (sel && ui.corner >= 0 && sel.pts.length > 3) { const i = ui.corner; ui.corner = -1; change(() => { sel.pts.splice(i, 1); }, W.deleted); }
      else delBand();
      board.focus({ preventScroll: true });
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault(); if (!st.bands.length) return;
      const k = st.cur < 0 ? (e.key === ']' ? 0 : st.bands.length - 1) : (st.cur + (e.key === ']' ? 1 : -1) + st.bands.length) % st.bands.length;
      select(k); board.focus({ preventScroll: true });
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.5); }
  }
  const pick = v => ({ x: Math.round(v.x), y: Math.round(v.y) });
  // Undo and redo from anywhere in the tool (not while typing in a field).
  const onKeys = e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  };
  root.addEventListener('keydown', onKeys);
  const onEsc = e => { if (e.key === 'Escape' && card().classList.contains('gb-max') && pop.hidden) { e.preventDefault(); fullscreen(); } };
  document.addEventListener('keydown', onEsc);
  fit.addEventListener('click', e => { e.stopPropagation(); ui.view = { z: 1, cx: VB / 2, cy: VB / 2 }; applyView(); board.focus({ preventScroll: true }); });

  /** The ⓘ panel, kept short: what the controls do (three lines) and one "Try:" line; no list of the shared extras
   *  (Make a question, Send to students and Practice it say what they do on their own buttons). */
  function tidyHelp() {
    const card = body.closest('.dash-w') || body.parentElement, info = card && card.querySelector('.dt-info[aria-controls]');
    const panel = info && card.querySelector(`#${CSS.escape(info.getAttribute('aria-controls'))}`); if (!panel) return;
    const C = ctx.common || {};
    [...panel.querySelectorAll('.dt-helph')].forEach((h, i) => {
      const list = h.nextElementSibling && h.nextElementSibling.matches('.dt-helpl') ? h.nextElementSibling : null;
      if (i === 0) return;
      if (h.textContent === C.helpIdeas && list) { const p = el('p', 'dt-helptry', list.textContent); p.dir = 'auto'; h.replaceWith(p); list.remove(); return; }
      h.remove(); if (list) list.remove();
    });
  }

  // ---------------------------------------------------------------- the shell
  T.draw = render;
  const r = T.finish();
  tidyHelp();
  return {
    destroy() {
      r.destroy(); clearTimeout(titleTimer); closeMenu(); if (boxRo) boxRo.disconnect(); cancelAnimationFrame(boxRaf);
      document.removeEventListener('fullscreenchange', onFull); document.removeEventListener('keydown', onEsc);
      const c = card(); if (c.classList.contains('gb-max')) { c.classList.remove('gb-max'); document.documentElement.classList.remove('gb-maxed'); }
    },
  };
}
