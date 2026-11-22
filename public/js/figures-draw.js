// Figures, "Draw it": a geoboard-like dot grid to draw a shape on (the editor, public/js/figures-editor.js, turns the
// drawing into the kind's real data with public/js/figures-draw-geom.js). Dots on whole-number points, y up; a tap places
// the next corner, a corner drags (snapping from dot to dot), with the mouse, a pen or a finger (pointer events, and the
// grid takes the touch itself, so drawing never scrolls or zooms the page). The keyboard does everything too: the arrow
// keys move a cursor, Enter places a corner or picks one up, the arrow keys then nudge it, Delete removes it, Escape
// puts it down. What changes is said in a polite live region. The grid never mirrors in right-to-left languages.
import { esc } from '/js/app.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CELL = 40, PAD = 30;
const COL = { paper: '#FFFDF2', dot: '#8A8573', axis: '#5B584F', num: '#5B584F', fill: 'rgba(102,199,146,.35)', line: '#1F9D63', bad: '#BE3329', ink: '#141414', mint: '#66C792', leaf: '#1F9D63' };

/**
 * makeBoard(host, { D, onChange }) -> { set({ pts, n, o, names, max, bad }), focus(), el }.
 * D(key, vars) is the editor's "js.figures-editor.draw.*" words. onChange(pts, { final, how }) is called with a new copy
 * of the corners on every change (final: the end of a drag, a tap or a key; how: 'add' | 'move' | 'remove' | 'clear').
 */
export function makeBoard(host, { D, onChange }) {
  const st = { pts: [], n: 10, o: [0, 0], names: [], max: 3, bad: false, sel: -1, cur: null, drag: -1, moved: false, keys: false };
  host.innerHTML = `<div class="fg-board" dir="ltr"><svg class="fg-board-svg" tabindex="0" role="application" focusable="true"></svg></div><p class="sr-only" role="status" aria-live="polite"></p>`;
  const svg = host.querySelector('svg'), say = host.querySelector('[role="status"]');
  const X = x => PAD + (x - st.o[0]) * CELL, Y = y => PAD + (st.o[1] + st.n - y) * CELL;
  const inside = p => p[0] >= st.o[0] && p[0] <= st.o[0] + st.n && p[1] >= st.o[1] && p[1] <= st.o[1] + st.n;
  const clamp = p => [Math.max(st.o[0], Math.min(st.o[0] + st.n, p[0])), Math.max(st.o[1], Math.min(st.o[1] + st.n, p[1]))];
  const at = p => st.pts.findIndex(q => q[0] === p[0] && q[1] === p[1]);
  const name = i => st.names[i] || String.fromCharCode(65 + i);
  const emit = (final, how) => onChange(st.pts.map(p => [p[0], p[1]]), { final, how });
  const announce = s => { say.textContent = ''; setTimeout(() => { say.textContent = s; }, 30); };

  function draw() {
    const n = st.n, W = PAD * 2 + n * CELL, every = n <= 12 ? 1 : 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    svg.setAttribute('aria-label', D('board', { n }));
    let s = `<rect x="0" y="0" width="${W}" height="${W}" rx="20" fill="${COL.paper}"/>`;
    // the axes where 0 is on the grid, then the numbers along the bottom and the left
    if (st.o[0] < 0 && st.o[0] + n > 0) s += `<line x1="${X(0)}" y1="${Y(st.o[1])}" x2="${X(0)}" y2="${Y(st.o[1] + n)}" stroke="${COL.axis}" stroke-width="2"/>`;
    if (st.o[1] < 0 && st.o[1] + n > 0) s += `<line x1="${X(st.o[0])}" y1="${Y(0)}" x2="${X(st.o[0] + n)}" y2="${Y(0)}" stroke="${COL.axis}" stroke-width="2"/>`;
    for (let i = 0; i <= n; i += every) {
      s += `<text x="${X(st.o[0] + i)}" y="${W - 8}" font-size="13" text-anchor="middle" fill="${COL.num}" font-family="system-ui,sans-serif">${st.o[0] + i}</text>`;
      s += `<text x="12" y="${Y(st.o[1] + i) + 4}" font-size="13" text-anchor="middle" fill="${COL.num}" font-family="system-ui,sans-serif">${st.o[1] + i}</text>`;
    }
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) s += `<circle cx="${X(st.o[0] + i)}" cy="${Y(st.o[1] + j)}" r="3.2" fill="${COL.dot}"/>`;
    const P = st.pts.map(p => `${X(p[0])},${Y(p[1])}`).join(' ');
    const line = st.bad ? COL.bad : COL.line, dash = st.bad ? ' stroke-dasharray="10 7"' : '';
    if (st.pts.length >= 3) s += `<polygon points="${P}" fill="${st.bad ? 'rgba(190,51,41,.08)' : COL.fill}" stroke="${line}" stroke-width="4" stroke-linejoin="round"${dash}/>`;
    else if (st.pts.length === 2) s += `<polyline points="${P}" fill="none" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`;
    if (st.cur && st.keys && st.sel < 0) s += `<rect x="${X(st.cur[0]) - 14}" y="${Y(st.cur[1]) - 14}" width="28" height="28" rx="8" fill="none" stroke="${COL.ink}" stroke-width="3" stroke-dasharray="5 4"/>`;
    // the corners, each named outside the shape (away from its middle)
    const cx = st.pts.reduce((a, p) => a + p[0], 0) / (st.pts.length || 1), cy = st.pts.reduce((a, p) => a + p[1], 0) / (st.pts.length || 1);
    st.pts.forEach((p, i) => {
      let dx = p[0] - cx, dy = p[1] - cy; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      if (st.pts.length < 2) { dx = -0.7; dy = 0.7; }
      const lx = X(p[0]) + dx * 26, ly = Y(p[1]) - dy * 26 + 7;
      s += `<g class="fg-corner${i === st.sel ? ' on' : ''}" data-i="${i}">${i === st.sel ? `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="17" fill="none" stroke="${COL.ink}" stroke-width="3"/>` : ''}
        <circle cx="${X(p[0])}" cy="${Y(p[1])}" r="11" fill="${COL.leaf}" stroke="${COL.paper}" stroke-width="3"/>
        <text x="${lx}" y="${ly}" font-size="20" font-weight="800" text-anchor="middle" fill="${COL.ink}" stroke="${COL.paper}" stroke-width="5" paint-order="stroke" font-family="system-ui,sans-serif">${esc(name(i))}</text></g>`;
    });
    svg.innerHTML = s;
    svg.setAttribute('aria-describedby', host.dataset.describedby || '');
  }

  function lattice(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return null;
    const q = pt.matrixTransform(m.inverse());
    return clamp([Math.round((q.x - PAD) / CELL) + st.o[0], Math.round(st.o[1] + st.n - (q.y - PAD) / CELL)]);
  }
  svg.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const p = lattice(e); if (!p) return;
    e.preventDefault(); st.keys = false;
    try { svg.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    let i = at(p);
    st.moved = false;
    if (i < 0 && st.pts.length < st.max) { st.pts.push(p); i = st.pts.length - 1; st.moved = true; announce(D('placed', { name: name(i), x: p[0], y: p[1] })); emit(false, 'add'); }
    st.sel = i; st.drag = i; st.cur = p;
    draw();
    svg.focus({ preventScroll: true });
  });
  svg.addEventListener('pointermove', e => {
    if (st.drag < 0) return;
    const p = lattice(e); if (!p) return;
    const q = st.pts[st.drag];
    if (q[0] === p[0] && q[1] === p[1]) return;
    st.pts[st.drag] = p; st.cur = p; st.moved = true;
    emit(false, 'move'); draw();
  });
  const up = () => {
    if (st.drag < 0) return;
    const i = st.drag; st.drag = -1;
    if (st.moved) { const p = st.pts[i]; announce(D('moved', { name: name(i), x: p[0], y: p[1] })); emit(true, 'move'); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('lostpointercapture', up);
  svg.addEventListener('focus', () => { if (!st.cur) st.cur = st.pts[st.pts.length - 1] || [st.o[0] + Math.floor(st.n / 2), st.o[1] + Math.floor(st.n / 2)]; });
  svg.addEventListener('blur', () => { if (st.keys) { st.keys = false; draw(); } });
  svg.addEventListener('keydown', e => {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!st.cur) st.cur = [st.o[0] + Math.floor(st.n / 2), st.o[1] + Math.floor(st.n / 2)];
    st.keys = true;
    if (dirs[e.key]) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      if (st.sel >= 0) {
        const q = st.pts[st.sel], p = clamp([q[0] + dx, q[1] + dy]);
        if (p[0] !== q[0] || p[1] !== q[1]) { st.pts[st.sel] = p; st.cur = p; announce(D('moved', { name: name(st.sel), x: p[0], y: p[1] })); emit(true, 'move'); }
      } else { st.cur = clamp([st.cur[0] + dx, st.cur[1] + dy]); const i = at(st.cur); announce(i >= 0 ? D('corner', { name: name(i), x: st.cur[0], y: st.cur[1] }) : `(${st.cur[0]}, ${st.cur[1]})`); }
      draw(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (st.sel >= 0) { const p = st.pts[st.sel]; announce(D('corner', { name: name(st.sel), x: p[0], y: p[1] })); st.sel = -1; }
      else {
        const i = at(st.cur);
        if (i >= 0) { st.sel = i; announce(D('picked', { name: name(i) })); }
        else if (st.pts.length < st.max) { st.pts.push(st.cur.slice()); announce(D('placed', { name: name(st.pts.length - 1), x: st.cur[0], y: st.cur[1] })); emit(true, 'add'); }
      }
      draw(); return;
    }
    if (e.key === 'Escape' && st.sel >= 0) { e.preventDefault(); st.sel = -1; draw(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const i = st.sel >= 0 ? st.sel : st.pts.length - 1; if (i < 0) return;
      const nm = name(i); st.pts.splice(i, 1); st.sel = -1; announce(D('removed', { name: nm })); emit(true, 'remove'); draw();
    }
  });

  return {
    el: svg,
    set(o) {
      for (const k of ['n', 'o', 'names', 'max', 'bad']) if (o[k] !== undefined) st[k] = o[k];
      if (o.pts) st.pts = o.pts.map(p => [p[0], p[1]]);
      st.pts = st.pts.filter(inside);
      if (st.sel >= st.pts.length) st.sel = -1;
      if (st.cur && !inside(st.cur)) st.cur = null;
      draw();
    },
    focus(o) { svg.focus(o); },
    clearSelection() { st.sel = -1; draw(); },
  };
}
