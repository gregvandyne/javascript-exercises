// Classroom dashboards, stage 4: teaching tools part 2 (docs/decisions.md "Classroom dashboards, stage 4"): geoboard,
// pattern blocks, angle maker, 3D shapes and nets, transformations, balance scale, algebra tiles, coins and money, chance
// lab, letter tiles, graphic organizers and maps. Each works exactly like a stage 3 tool (public/js/dash-tools.js): the
// same shell (mode buttons, the model, a readout, a row of buttons ending with Options and Send to students), the same
// ctx (keep, send, copy...), plus "Make a question from it" and "Practice it" from the shell. The maths is in
// public/js/dash-math4.js (pure, tested). Everything is drawn with SVG or HTML from code: no libraries, no WebGL, no
// network but the app's own, no AI. Every drag has a keyboard way; changes are announced; text a person typed is
// rendered with textContent only.
import * as M from './dash-math.js';
import * as G from './dash-math4.js';
import { parts } from './dash-tools.js';
import { format } from './i18n-format.js';

const { shell, field, selectOf, numberIn, checkRow, roving, stacked, el, svg, btn, ltr, svgPoint, iso } = parts;
const minus = v => String(v).replace(/^-/, '−');
const projecting = () => document.body.classList.contains('dash-projector');
/** A button with an icon and words; on a narrow tool only the icon shows (the button keeps its name). */
function ibtn(icon, text, cls = 'btn btn-sm') {
  const b = btn('', cls, text); b.removeAttribute('title');
  const i = el('span', 'dt-ic', icon), l = el('span', 'dt-lbl', text);
  i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
  b.append(i, l); return b;
}
/** A select in a tool's own row (44px tall, named). */
function rowSelect(label, options, value, on) {
  const s = selectOf(options, value); s.classList.add('dt-select'); s.setAttribute('aria-label', label);
  s.addEventListener('change', () => on(s.value)); return s;
}
/** The text grows so it is at least 13px (more on the projector) on screen: --ts for a viewBox drawn into box. */
function tsFor(T, vbW, vbH, base = 20) { return T.ts(vbW, vbH, base, 13); }

// ================================================================ 1. geoboard
const BAND_DASH = ['', '14 8', '4 6', '18 6 4 6', '2 4', '10 4 2 4'];
function geoboard(body, s, ctx) {
  const T = shell(body, s, ctx, 'geoboard'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  const SP = 100, PAD = 60;
  let cur = { x: 0, y: 0 }, carry = null, drag = null, board;
  const band = () => st.bands[st.cur];
  const newB = ibtn('➕', W.newBand), undo = ibtn('↶', W.undo), close = ibtn('⭕', W.close), clear = ibtn('🧹', W.clear);
  T.top.append(newB, undo, close);
  T.foot.append(clear);
  const pegName = p => fill(W.peg, { x: p.x + 1, y: p.y + 1 });
  const areaOf = b => (b && b.closed && G.isSimple(b.pts) ? G.pick(b.pts) : null);
  const sayBand = () => { const b = band(), p = areaOf(b); if (p) ctx.say(fill(W.closed, { a: iso(G.mixed(p.a2, 2)) })); };
  newB.addEventListener('click', () => { if (st.bands.length >= 6) return; st.bands.push({ pts: [], closed: false }); st.cur = st.bands.length - 1; T.commit(fill(W.band, { n: st.cur + 1 })); });
  undo.addEventListener('click', () => { const b = band(); if (!b) return; if (b.closed) b.closed = false; else b.pts.pop(); if (!b.pts.length && st.bands.length > 1) { st.bands.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); } T.commit(W.undo); });
  close.addEventListener('click', () => { const b = band(); if (b && b.pts.length >= 3) { b.closed = true; T.commit(); sayBand(); } });
  clear.addEventListener('click', () => { st.bands = [{ pts: [], closed: false }]; st.cur = 0; carry = null; T.commit(W.clear); });
  /** A peg pressed: carry a corner, put it down, close the band, or stretch the band to it. */
  const press = p => {
    let b = band();
    if (carry) { const c = carry; carry = null; if (!b.pts.some((q, i) => i !== c.i && q.x === p.x && q.y === p.y)) b.pts[c.i] = { ...p }; T.commit(fill(W.added, { x: p.x + 1, y: p.y + 1 })); sayBand(); return; }
    if (!b) { st.bands.push({ pts: [], closed: false }); st.cur = st.bands.length - 1; b = band(); }
    const at = b.pts.findIndex(q => q.x === p.x && q.y === p.y);
    if (b.closed) {
      if (at >= 0) { carry = { i: at }; T.draw(); ctx.say(pegName(p)); return; }
      if (st.bands.length >= 6) return;
      st.bands.push({ pts: [{ ...p }], closed: false }); st.cur = st.bands.length - 1; T.commit(fill(W.added, { x: p.x + 1, y: p.y + 1 })); return;
    }
    if (at === 0 && b.pts.length >= 3) { b.closed = true; T.commit(); sayBand(); return; }
    if (at >= 0 || b.pts.length >= 16) return;
    b.pts.push({ ...p }); T.commit(fill(W.added, { x: p.x + 1, y: p.y + 1 }));
  };
  T.draw = () => {
    const n = st.pegs, size = (n - 1) * SP + 2 * PAD, b = band();
    newB.disabled = st.bands.length >= 6 || (b && !b.pts.length); undo.disabled = !b || (!b.pts.length && st.bands.length <= 1); close.disabled = !b || b.closed || b.pts.length < 3;
    clear.disabled = !st.bands.some(x => x.pts.length);
    cur = { x: Math.min(cur.x, n - 1), y: Math.min(cur.y, n - 1) };
    T.stage.textContent = '';
    const X = v => PAD + v * SP;
    board = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'dt-geo', role: 'application', tabindex: ctx.editing ? '-1' : '0', 'aria-label': `${W.cursor}. ${W.hint}`, 'aria-roledescription': W.cursor, style: `--ts:${tsFor(T, size, size).toFixed(3)}` });
    board.setAttribute('direction', 'ltr');
    board.appendChild(svg('rect', { x: 8, y: 8, width: size - 16, height: size - 16, rx: 28, class: 'dt-geobase' }));
    st.bands.forEach((bd, k) => {
      if (!bd.pts.length) return;
      const pts = bd.pts.map(p => `${X(p.x)},${X(p.y)}`).join(' ');
      const ok = bd.closed && G.isSimple(bd.pts);
      if (ok) board.appendChild(svg('polygon', { points: pts, class: `dt-geofill dt-b${k}` }));
      board.appendChild(svg(bd.closed ? 'polygon' : 'polyline', { points: pts, class: `dt-band dt-b${k}${k === st.cur ? ' is-cur' : ''}`, 'stroke-dasharray': BAND_DASH[k] || null }));
      // The band's number by its first peg, so bands are told apart by more than colour.
      const p0 = bd.pts[0];
      board.appendChild(svg('text', { x: X(p0.x) - 22, y: X(p0.y) - 18, class: `dt-geon dt-b${k}`, 'text-anchor': 'middle' }, String(k + 1)));
    });
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) board.appendChild(svg('circle', { cx: X(x), cy: X(y), r: 11, class: 'dt-peg' }));
    if (carry && b) { const q = b.pts[carry.i]; board.appendChild(svg('circle', { cx: X(q.x), cy: X(q.y), r: 22, class: 'dt-carry' })); }
    if (drag && drag.to) board.appendChild(svg('circle', { cx: X(drag.to.x), cy: X(drag.to.y), r: 22, class: 'dt-carry' }));
    if (!ctx.editing) board.appendChild(svg('circle', { cx: X(cur.x), cy: X(cur.y), r: 26, class: 'dt-geocur' }));
    const wrap = el('div', 'dt-geowrap'); wrap.appendChild(board); T.stage.appendChild(wrap);
    wire(X, n);
    // The readout: the current band's area and perimeter, exactly.
    T.read.textContent = '';
    const p = areaOf(b);
    if (p) {
      const L = G.bandLength(b.pts, true);
      const big = ltr('div', 'dt-big dt-geobig');
      big.append(el('span', 'dt-geok', `${W.area} `), el('b', null, G.mixed(p.a2, 2)), el('span', 'dt-geosep', ' · '), el('span', 'dt-geok', `${W.perimeter} `), el('b', null, G.lengthText(L) + (L.roots.length ? ` ≈ ${G.approxText(L, ctx.intl)}` : '')));
      T.read.appendChild(big);
      if (st.show) T.read.appendChild(ltr('div', 'dt-sub', fill(W.pickIs, { i: p.I, b: p.B, a: G.mixed(p.a2, 2) })));
      else T.read.appendChild(el('div', 'dt-sub', fill(W.squares, { a: iso(G.mixed(p.a2, 2)) })));
    } else if (b && b.closed) T.read.appendChild(el('div', 'dt-sub dt-note', W.crosses));
    else if (b && b.pts.length > 1) { const L = G.bandLength(b.pts, false); T.read.append(ltr('div', 'dt-big', G.lengthText(L)), el('div', 'dt-sub', W.open)); }
    else T.read.appendChild(el('div', 'dt-sub', W.hint));
  };
  function wire(X, n) {
    if (ctx.editing) return;
    const pegAt = e => { const q = svgPoint(board, e); return { x: Math.max(0, Math.min(n - 1, Math.round((q.x - PAD) / SP))), y: Math.max(0, Math.min(n - 1, Math.round((q.y - PAD) / SP))) }; };
    board.addEventListener('keydown', e => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (d) { e.preventDefault(); cur = { x: Math.max(0, Math.min(n - 1, cur.x + d[0])), y: Math.max(0, Math.min(n - 1, cur.y + d[1])) }; T.draw(); board.focus(); ctx.say(pegName(cur)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(cur); board.focus(); }
      else if (e.key === 'Escape' && carry) { carry = null; T.draw(); board.focus(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); undo.click(); board.focus(); }
    });
    // Press a corner of the band and drag it to another peg; a tap stretches the band.
    board.addEventListener('pointerdown', e => {
      const p = pegAt(e), b = band(); cur = p;
      const at = b ? b.pts.findIndex(q => q.x === p.x && q.y === p.y) : -1;
      drag = { from: p, at, id: e.pointerId, to: null };
      board.setPointerCapture(e.pointerId); e.preventDefault(); board.focus();
    });
    board.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId || drag.at < 0) return;
      const p = pegAt(e); if (p.x === drag.from.x && p.y === drag.from.y && !drag.to) return;
      if (!drag.to || drag.to.x !== p.x || drag.to.y !== p.y) { const d = drag; d.to = p; cur = p; T.draw(); drag = d; board.setPointerCapture(d.id); }
    });
    const up = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null;
      if (d.to && d.at >= 0 && (d.to.x !== d.from.x || d.to.y !== d.from.y)) { carry = { i: d.at }; press(d.to); }
      else press(d.from);
      board.focus();
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', () => { drag = null; T.draw(); });
  }
  return T.finish({
    options: box => {
      const pg = field(box, W.pegs, selectOf([5, 7, 9, 11].map(v => [v, `${v} × ${v}`]), st.pegs));
      pg.addEventListener('change', () => { st.pegs = +pg.value; for (const b of st.bands) { b.pts = b.pts.filter(p => p.x < st.pegs && p.y < st.pegs); if (b.pts.length < 3) b.closed = false; } T.commit(); });
      checkRow(box, W.show, st.show, v => { st.show = v; T.commit(); });
    },
  });
}

// ================================================================ 2. pattern blocks
const BW = 15, BH = 10 * Math.sqrt(3) / 2, BU = 60;
function pattern(body, s, ctx) {
  const T = shell(body, s, ctx, 'pattern'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let sel = -1, drag = null, board;
  const tray = el('div', 'dt-ptray'); tray.setAttribute('role', 'group'); tray.setAttribute('aria-label', W.board);
  for (const k of G.BLOCK_KINDS) {
    const b = btn('', 'btn btn-sm dt-pbtn', `➕ ${W[k]}`); b.removeAttribute('title');
    const ic = svg('svg', { viewBox: '-1.2 -2 3.4 2.4', class: 'dt-pic', 'aria-hidden': 'true' });
    ic.appendChild(svg('polygon', { points: G.BLOCK_SHAPES[k].map(([x, y]) => `${x},${y}`).join(' '), class: `dt-blk4 dt-k-${k}` }));
    b.appendChild(ic);
    b.addEventListener('click', () => add(k));
    tray.appendChild(b);
  }
  T.top.appendChild(tray);
  const turn = ibtn('↻', W.turn), rm = ibtn('🗑️', W.remove), clear = ibtn('🧹', W.clear);
  T.foot.append(turn, rm, clear);
  const nameOf = b => fill(W.block, { name: W[b.k], deg: b.r * 30 });
  const add = k => {
    if (st.blocks.length >= 40) return;
    // The first free spot from the top left, so a new block never lands on another.
    const taken = st.blocks.map(b => `${b.x},${b.y}`);
    let spot = { x: 3, y: 3 };
    outer: for (let y = 3; y <= 9; y += 3) for (let x = 3; x <= 25; x += 4) { const xx = (x + y) % 2 ? x + 1 : x; if (!taken.includes(`${xx},${y}`)) { spot = { x: xx, y }; break outer; } }
    st.blocks.push({ k, x: spot.x, y: spot.y, r: 0 }); sel = st.blocks.length - 1;
    T.commit(nameOf(st.blocks[sel])); focusSel();
  };
  const focusSel = () => T.stage.querySelector(`[data-b="${sel}"]`)?.focus();
  turn.addEventListener('click', () => { const b = st.blocks[sel]; if (!b) return; b.r = (b.r + (b.k === 'sq' || b.k === 'thin' ? 1 : 2)) % 12; T.commit(nameOf(b)); focusSel(); });
  rm.addEventListener('click', () => { if (!st.blocks[sel]) return; const b = st.blocks.splice(sel, 1)[0]; sel = Math.min(sel, st.blocks.length - 1); T.commit(`${W.remove}: ${W[b.k]}`); });
  clear.addEventListener('click', () => { st.blocks = []; sel = -1; T.commit(W.clear); });
  const move = (b, dx, dy) => { const x = b.x + dx, y = b.y + dy; if (x < 0 || x > 30 || y < 0 || y > 10) return; b.x = x; b.y = y; T.commit(); focusSel(); ctx.say(fill(W.moved, { x: b.x, y: b.y })); };
  T.draw = () => {
    turn.disabled = rm.disabled = !st.blocks[sel]; clear.disabled = !st.blocks.length;
    T.stage.textContent = '';
    board = svg('svg', { viewBox: `0 0 ${BW * BU} ${BH * BU}`, class: 'dt-pboard', 'aria-label': W.board, role: 'group' });
    board.setAttribute('direction', 'ltr');
    board.appendChild(svg('rect', { x: -30, y: -30, width: BW * BU + 60, height: BH * BU + 60, rx: 24, class: 'dt-pbg' }));
    let dots = '';
    for (let y = 0; y <= 10; y++) for (let x = y % 2; x <= 30; x += 2) dots += `M${(x / 2) * BU} ${y * (Math.sqrt(3) / 2) * BU}h0.01`;
    board.appendChild(svg('path', { d: dots, class: 'dt-pdots' }));
    st.blocks.forEach((b, i) => {
      const g = svg('g', { class: `dt-pblock${i === sel ? ' is-sel' : ''}`, 'data-b': i, tabindex: ctx.editing ? '-1' : (i === sel || (sel < 0 && i === 0) ? '0' : '-1'), role: 'button', 'aria-label': nameOf(b), 'aria-pressed': String(i === sel) });
      const pts = (drag && drag.i === i ? G.blockPoints({ ...b, x: 0, y: 0 }).map(([x, y]) => [x + drag.px, y + drag.py]) : G.blockPoints(b));
      g.appendChild(svg('polygon', { points: pts.map(([x, y]) => `${x * BU},${y * BU}`).join(' '), class: `dt-blk4 dt-k-${b.k}` }));
      board.appendChild(g);
    });
    T.stage.appendChild(board);
    wire();
    const h = G.hexFraction(st.blocks);
    T.read.textContent = '';
    if (!st.blocks.length) { T.read.appendChild(el('div', 'dt-sub', W.empty)); return; }
    const big = ltr('div', 'dt-big');
    if (h.sixths) { const f = M.simplify(h.sixths, 6); const whole = Math.floor(f.n / f.d), rest = f.n % f.d; if (whole) big.append(String(whole)); if (rest) big.appendChild(stacked(rest, f.d)); }
    else big.textContent = '0';
    T.read.append(el('div', 'dt-sub dt-pof', W.of), big);
    const list = G.BLOCK_KINDS.filter(k => h.count[k]).map(k => `${W[k]} × ${h.count[k]}`).join(' · ');
    T.read.appendChild(el('div', 'dt-sub', list));
    if (h.count.sq || h.count.thin) T.read.appendChild(el('div', 'dt-sub dt-note', fill(W.notHex, { n: h.count.sq + h.count.thin })));
  };
  function wire() {
    if (ctx.editing) return;
    const blocks = [...board.querySelectorAll('[data-b]')];
    blocks.forEach(g => {
      const i = +g.dataset.b;
      g.addEventListener('focus', () => { if (sel !== i) { sel = i; for (const o of blocks) { o.classList.toggle('is-sel', o === g); o.setAttribute('aria-pressed', String(o === g)); o.tabIndex = o === g ? 0 : -1; } turn.disabled = rm.disabled = false; } });
      g.addEventListener('keydown', e => {
        const b = st.blocks[i];
        const d = { ArrowRight: [2, 0], ArrowLeft: [-2, 0], ArrowDown: [1, 1], ArrowUp: [-1, -1] }[e.key];
        if (d) { e.preventDefault(); move(b, d[0], d[1]); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); turn.click(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); rm.click(); T.stage.querySelector('[data-b]')?.focus(); }
        else if (e.key === 'Tab' && !e.shiftKey && i < blocks.length - 1) { e.preventDefault(); blocks[i + 1].focus(); }
        else if (e.key === 'Tab' && e.shiftKey && i > 0) { e.preventDefault(); blocks[i - 1].focus(); }
      });
      g.addEventListener('pointerdown', e => {
        const b = st.blocks[i], q = svgPoint(board, e);
        sel = i; drag = { i, id: e.pointerId, ox: q.x / BU - b.x / 2, oy: q.y / BU - b.y * Math.sqrt(3) / 2, px: b.x / 2, py: b.y * Math.sqrt(3) / 2, moved: false };
        board.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); T.draw(); T.stage.querySelector(`[data-b="${i}"]`)?.focus();
      });
    });
    board.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const q = svgPoint(board, e); drag.px = Math.max(0, Math.min(BW, q.x / BU - drag.ox)); drag.py = Math.max(0, Math.min(BH, q.y / BU - drag.oy)); drag.moved = true;
      const poly = board.querySelector(`[data-b="${drag.i}"] polygon`), b = st.blocks[drag.i];
      if (poly) poly.setAttribute('points', G.blockPoints({ ...b, x: 0, y: 0 }).map(([x, y]) => `${(x + drag.px) * BU},${(y + drag.py) * BU}`).join(' '));
    });
    const up = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null;
      if (d.moved) { const sn = G.snapBlock(d.px, d.py), b = st.blocks[d.i]; b.x = Math.max(0, Math.min(30, sn.x)); b.y = Math.max(0, Math.min(10, sn.y)); if ((b.x + b.y) % 2) b.x += b.x < 30 ? 1 : -1; T.commit(nameOf(b)); }
      else T.draw();
      focusSel();
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', () => { drag = null; T.draw(); });
  }
  return T.finish();
}

// ================================================================ 3. angle maker
function angle(body, s, ctx) {
  const T = shell(body, s, ctx, 'angle'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let face, drag = null;
  const setA = (a, say = true) => { a = Math.max(0, Math.min(360, Math.round(a))); if (a === st.a) return; st.a = a; T.commit(); if (say) ctx.say(`${st.a}°, ${W[G.angleKind(st.a)]}`); };
  const step = T.stepper(W.ray, () => `${st.a}°`, () => setA(st.a - st.step), () => setA(st.a + st.step), `${W.ray} −${st.step}°`, `${W.ray} +${st.step}°`);
  T.top.appendChild(step);
  const presets = el('div', 'dt-seg'); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', W.ray);
  for (const a of [45, 90, 135, 180, 270]) { const b = btn(`${a}°`, 'btn btn-sm'); b.dir = 'ltr'; b.addEventListener('click', () => setA(a)); presets.appendChild(b); }
  T.top.appendChild(presets);
  const proto = T.toggle(`📐 ${W.proto}`, null, () => st.proto, v => { st.proto = v; T.commit(); });
  const arc = T.toggle(`◜ ${W.arc}`, null, () => st.arc, v => { st.arc = v; T.commit(); });
  T.foot.append(proto, arc);
  T.draw = () => {
    step.sync(); proto.sync(); arc.sync();
    const R = 170, a = st.a, rad = (a * Math.PI) / 180, full = a > 180;
    T.stage.textContent = '';
    const vb = full ? [-215, -215, 430, 430] : [-215, -215, 430, 250];
    face = svg('svg', { viewBox: vb.join(' '), class: 'dt-angle', role: 'slider', tabindex: ctx.editing ? '-1' : '0', 'aria-label': W.ray, 'aria-valuemin': 0, 'aria-valuemax': 360, 'aria-valuenow': a, 'aria-valuetext': `${a}°, ${W[G.angleKind(a)]}`, style: `--ts:${tsFor(T, vb[2], vb[3], 15).toFixed(3)}` });
    face.setAttribute('direction', 'ltr');
    if (st.proto) {
      // A protractor of our own: half a circle (a full one for reflex angles), a tick every 5°, numbers every 30°.
      face.appendChild(svg('path', { d: full ? `M${R} 0 A${R} ${R} 0 1 0 ${-R} 0 A${R} ${R} 0 1 0 ${R} 0 Z` : `M${R} 0 A${R} ${R} 0 0 0 ${-R} 0 Z`, class: 'dt-proto' }));
      let ticks = '';
      for (let d = 0; d <= (full ? 355 : 180); d += 5) { const r0 = d % 30 === 0 ? R - 22 : d % 10 === 0 ? R - 14 : R - 9, t = (d * Math.PI) / 180; ticks += `M${R * Math.cos(t)} ${-R * Math.sin(t)}L${r0 * Math.cos(t)} ${-r0 * Math.sin(t)}`; }
      face.appendChild(svg('path', { d: ticks, class: 'dt-ptick' }));
      for (let d = 0; d <= (full ? 330 : 180); d += 30) { const t = (d * Math.PI) / 180, r = R - 42, flat = d === 0 || d === 180; face.appendChild(svg('text', { x: r * Math.cos(t), y: -r * Math.sin(t) + (flat ? -14 : 7), 'text-anchor': 'middle', class: 'dt-pnum' }, d)); }
    }
    if (st.arc && a > 0 && a < 360) {
      const r = 58, large = a > 180 ? 1 : 0;
      if (a === 90) face.appendChild(svg('path', { d: 'M34 0V-34H0', class: 'dt-aright' }));
      else face.appendChild(svg('path', { d: `M${r} 0A${r} ${r} 0 ${large} 0 ${r * Math.cos(rad)} ${-r * Math.sin(rad)}`, class: 'dt-aarc' }));
      const mid = rad / 2, lr = a < 40 ? 96 : 84;
      face.appendChild(svg('text', { x: lr * Math.cos(mid), y: -lr * Math.sin(mid) + 8, 'text-anchor': 'middle', class: 'dt-alab' }, `${a}°`));
    } else if (st.arc && a === 360) face.appendChild(svg('circle', { r: 58, class: 'dt-aarc' }));
    face.appendChild(svg('line', { x1: 0, y1: 0, x2: 200, y2: 0, class: 'dt-ray' }));
    face.appendChild(svg('line', { x1: 0, y1: 0, x2: 200 * Math.cos(rad), y2: -200 * Math.sin(rad), class: 'dt-ray dt-ray2' }));
    face.appendChild(svg('circle', { r: 7, class: 'dt-avx' }));
    face.appendChild(svg('circle', { cx: 200 * Math.cos(rad), cy: -200 * Math.sin(rad), r: 16, class: 'dt-ahandle', 'data-h': 1 }));
    const box = el('div', 'dt-anglewrap'); box.appendChild(face); T.stage.appendChild(box);
    T.read.textContent = '';
    const k = G.angleKind(a);
    const big = el('div', 'dt-big'); big.append(ltr('span', null, `${a}°`), el('span', `dt-akind dt-ak-${k}`, W[k]));
    T.read.appendChild(big);
    if (!ctx.editing) wire();
  };
  function wire() {
    face.addEventListener('keydown', e => {
      const d = { ArrowRight: -1, ArrowDown: -1, ArrowLeft: 1, ArrowUp: 1, PageUp: 15, PageDown: -15 }[e.key];
      if (d) { e.preventDefault(); setA(st.a + d * (e.key.startsWith('Page') ? 1 : e.shiftKey ? 15 : st.step === 15 ? 15 : st.step)); face.focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setA(e.key === 'Home' ? 0 : 360); face.focus(); }
    });
    face.addEventListener('pointerdown', e => { drag = { id: e.pointerId }; face.setPointerCapture(e.pointerId); e.preventDefault(); move(e); });
    const move = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const q = svgPoint(face, e), a = G.angleAt(q.x, -q.y, st.step, st.a);
      if (a !== st.a) { st.a = a; const id = drag.id; T.draw(); drag = { id }; face.setPointerCapture(id); face.focus(); }
    };
    face.addEventListener('pointermove', move);
    const end = e => { if (!drag || drag.id !== e.pointerId) return; drag = null; T.commit(); ctx.say(`${st.a}°, ${W[G.angleKind(st.a)]}`); face.focus(); };
    face.addEventListener('pointerup', end); face.addEventListener('pointercancel', end);
  }
  return T.finish({
    options: box => {
      const sp = field(box, W.step, selectOf([[1, '1°'], [5, '5°'], [15, '15°']], st.step));
      sp.addEventListener('change', () => { st.step = +sp.value; T.commit(); });
    },
  });
}

// ================================================================ 4. 3D shapes and nets (SVG: our own projection, no WebGL)
const FACE_TINTS = 6;
function solids(body, s, ctx) {
  const T = shell(body, s, ctx, 'solids'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let anim = 0, view;
  const shape = rowSelect(W.shape, G.SOLID_KINDS.map(k => [k, W[k]]), st.shape, v => { st.shape = v; T.commit(W[v]); });
  const mark = rowSelect(W.mark, [['none', W.none], ['faces', W.faces], ['edges', W.edges], ['vertices', W.vertices]], st.mark, v => { st.mark = v; T.commit(); });
  T.top.append(shape, mark);
  const foldB = ibtn('📦', W.fold), turnB = ibtn('↻', W.turn);
  T.foot.append(foldB, turnB);
  const reduced = () => (ctx.reduced ? ctx.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const goFold = target => {
    cancelAnimationFrame(anim);
    if (reduced()) { st.fold = target; T.commit(fill(W.folded, { n: st.fold })); return; }
    const from = st.fold, t0 = performance.now();
    const stepF = now => { const k = Math.min(1, (now - t0) / 900); st.fold = Math.round(from + (target - from) * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)); T.draw(); if (k < 1) anim = requestAnimationFrame(stepF); else T.commit(fill(W.folded, { n: st.fold })); };
    anim = requestAnimationFrame(stepF);
  };
  foldB.addEventListener('click', () => goFold(st.fold >= 50 ? 0 : 100));
  turnB.addEventListener('click', () => { st.yaw = (st.yaw + 30) % 360; T.commit(); });
  /** Corners on screen: turn by yaw about the up axis, then tilt from above (the flat net) to the side (the solid). */
  const project = (p, yaw, pitch) => {
    const c = Math.cos(yaw), s2 = Math.sin(yaw), x = p[0] * c - p[1] * s2, y = p[0] * s2 + p[1] * c, z = p[2];
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return { x, y: -(y * sp + z * cp), d: -y * cp + z * sp };
  };
  const pitchAt = t => ((90 - 62 * t) * Math.PI) / 180;
  T.draw = () => {
    shape.value = st.shape; mark.value = st.mark;
    const l = foldB.querySelector('.dt-lbl'), i = foldB.querySelector('.dt-ic');
    const folding = st.fold < 50; l.textContent = folding ? W.fold : W.unfold; i.textContent = folding ? '📦' : '📄'; foldB.setAttribute('aria-label', folding ? W.fold : W.unfold);
    const t = st.fold / 100, yaw = (st.yaw * Math.PI) / 180, model = G.solidModel(st.shape), info = G.SOLIDS[st.shape];
    // One scale for the whole fold (the picture doesn't zoom while it folds).
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const tt of [0, 0.25, 0.5, 0.75, 1]) for (const f of G.foldPose(st.shape, tt)) for (const p of f) { const q = project(p, yaw, pitchAt(tt)); bx0 = Math.min(bx0, q.x); bx1 = Math.max(bx1, q.x); by0 = Math.min(by0, q.y); by1 = Math.max(by1, q.y); }
    const VW = 400, VH = 300, k = Math.min((VW - 40) / (bx1 - bx0), (VH - 40) / (by1 - by0)), ox = VW / 2 - ((bx0 + bx1) / 2) * k, oy = VH / 2 - ((by0 + by1) / 2) * k;
    const pose = G.foldPose(st.shape, t), pitch = pitchAt(t);
    const faces = pose.map((pts, fi) => {
      const pr = pts.map(p => project(p, yaw, pitch));
      const n = (() => { const a = pts[0], b = pts[1], c = pts[2]; const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const L = Math.hypot(...nn) || 1; return nn.map(x => x / L); })();
      const light = Math.abs(n[2] * 0.7 + n[0] * 0.4 + n[1] * 0.3);
      return { fi, pr, depth: pr.reduce((a, q) => a + q.d, 0) / pr.length, light, f: model.faces[fi] };
    }).sort((a, b) => a.depth - b.depth);
    T.stage.textContent = '';
    const ts = tsFor(T, VW, VH);
    view = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'dt-solid', role: 'slider', tabindex: ctx.editing ? '-1' : '0', 'aria-label': W.view, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': st.fold, 'aria-valuetext': fill(W.folded, { n: st.fold }), style: `--ts:${ts.toFixed(3)}` });
    view.setAttribute('direction', 'ltr');
    const P = q => `${(ox + q.x * k).toFixed(1)},${(oy + q.y * k).toFixed(1)}`;
    const nVerts = model.faces[0].v.length;
    let flatNo = 0;
    const flatIndex = new Map(model.faces.map((f, i) => [i, f.curved ? 0 : ++flatNo]));
    for (const F of faces) {
      const f = F.f, g = svg('g', {});
      const tint = f.curved ? 0 : (F.fi % FACE_TINTS);
      g.appendChild(svg('polygon', { points: F.pr.map(P).join(' '), class: `dt-sface dt-st${tint}${f.curved ? ' is-curved' : ''}`, style: `--l:${(0.72 + 0.28 * F.light).toFixed(2)}` }));
      // Curved surfaces are many thin strips: draw only their real edges (the rims and the cut).
      let edges = '';
      const vs = f.v, m = vs.length;
      for (let e = 0; e < m; e++) {
        const a = F.pr[e], b = F.pr[(e + 1) % m];
        if (f.curved) {
          const gi = F.fi, last = gi === model.faces.length - (st.shape === 'cylinder' ? 2 : 1), first = gi === 1;
          const rim = st.shape === 'cylinder' ? e === 0 || e === 2 : e === 0;
          const cut = st.shape === 'cylinder' ? (first && e === 3) || (last && e === 1) : (first && e === 2) || (last && e === 1);
          if (!rim && !cut) continue;
        }
        edges += `M${P(a)}L${P(b)}`;
      }
      if (edges) g.appendChild(svg('path', { d: edges, class: `dt-sedge${st.mark === 'edges' ? ' is-marked' : ''}` }));
      if (st.mark === 'faces' && (!f.curved || F.fi === 1)) {
        const c = F.pr.reduce((acc, q) => ({ x: acc.x + q.x / F.pr.length, y: acc.y + q.y / F.pr.length }), { x: 0, y: 0 });
        g.appendChild(svg('text', { x: ox + c.x * k, y: oy + c.y * k + 7, 'text-anchor': 'middle', class: 'dt-sfnum' }, f.curved ? String(info.flat + 1) : String(flatIndex.get(F.fi))));
      }
      view.appendChild(g);
    }
    if (st.mark === 'vertices' && t > 0.98 && !info.curved) for (const v of model.v) { const q = project(v, yaw, pitch); view.appendChild(svg('circle', { cx: ox + q.x * k, cy: oy + q.y * k, r: 8, class: 'dt-svx' })); }
    if (st.mark === 'vertices' && t > 0.98 && st.shape === 'cone') { const q = project(model.v[nVerts], yaw, pitch); view.appendChild(svg('circle', { cx: ox + q.x * k, cy: oy + q.y * k, r: 8, class: 'dt-svx' })); }
    const box = el('div', 'dt-solidwrap'); box.appendChild(view); T.stage.appendChild(box);
    T.read.textContent = '';
    const big = el('div', 'dt-big dt-scount');
    for (const [key, v] of [['faces', info.f], ['edges', info.e], ['vertices', info.vx]]) { const c = el('span', `dt-schip${st.mark === key ? ' is-on' : ''}`); c.append(el('span', 'dt-schipl', W[key]), ltr('b', null, String(v))); big.appendChild(c); }
    T.read.appendChild(big);
    T.read.appendChild(el('div', 'dt-sub', info.curved ? fill(W.flatCurved, { f: info.flat, c: info.curved }) : fill(W.euler, { f: info.f, v: info.vx, e: info.e })));
    if (!ctx.editing) wire();
  };
  let drag = null;
  function wire() {
    view.addEventListener('keydown', e => {
      const d = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10 }[e.key];
      if (d) { e.preventDefault(); cancelAnimationFrame(anim); st.fold = Math.max(0, Math.min(100, st.fold + d)); T.commit(fill(W.folded, { n: st.fold })); view.focus(); }
      else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); st.yaw = (st.yaw + (e.key === 'PageUp' ? 15 : 345)) % 360; T.commit(); view.focus(); }
    });
    // Drag sideways to turn it round.
    view.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, yaw: st.yaw }; view.setPointerCapture(e.pointerId); e.preventDefault(); view.focus(); });
    view.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const y = ((drag.yaw + Math.round((e.clientX - drag.x) / 2)) % 360 + 360) % 360; if (y !== st.yaw) { st.yaw = y; const d = drag; T.draw(); drag = d; view.setPointerCapture(d.id); view.focus(); } });
    const end = e => { if (!drag || drag.id !== e.pointerId) return; drag = null; T.commit(); view.focus(); };
    view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  }
  const fin = T.finish();
  return { destroy() { cancelAnimationFrame(anim); fin.destroy(); } };
}

// ================================================================ 5. transformations
const TR_MIN = -8, TR_MAX = 8;
function transform(body, s, ctx) {
  const T = shell(body, s, ctx, 'transform'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let plane, drag = null;
  const ops = T.seg(W.move, [['translate', W.translate, null, '➡️'], ['reflect', W.reflect, null, '🪞'], ['rotate', W.rotate, null, '🔄']], () => st.op, v => { st.op = v; T.commit(`${W[v]}: ${G.ruleText(tr())}`); });
  T.top.appendChild(ops);
  const tr = () => ({ op: st.op, dx: st.dx, dy: st.dy, axis: st.axis, turn: st.turn });
  const dx = T.stepper('x', () => minus(st.dx), () => { if (st.dx > -8) { st.dx--; T.commit(G.ruleText(tr())); } }, () => { if (st.dx < 8) { st.dx++; T.commit(G.ruleText(tr())); } }, 'x −1', 'x +1');
  const dy = T.stepper('y', () => minus(st.dy), () => { if (st.dy > -8) { st.dy--; T.commit(G.ruleText(tr())); } }, () => { if (st.dy < 8) { st.dy++; T.commit(G.ruleText(tr())); } }, 'y −1', 'y +1');
  const axis = rowSelect(W.axis, [['y', W.axisY], ['x', W.axisX], ['yx', W.axisYX], ['ynx', W.axisYNX]], st.axis, v => { st.axis = v; T.commit(G.ruleText(tr())); });
  const turn = rowSelect(W.turn, [90, 180, 270].map(n => [n, fill(W.deg, { n })]), st.turn, v => { st.turn = +v; T.commit(G.ruleText(tr())); });
  T.foot.append(dx, dy, axis, turn);
  const LABELS = 'ABCDEFG';
  T.draw = () => {
    ops.sync(); dx.sync(); dy.sync(); axis.value = st.axis; turn.value = String(st.turn);
    dx.hidden = dy.hidden = st.op !== 'translate'; axis.hidden = st.op !== 'reflect'; turn.hidden = st.op !== 'rotate';
    const n = TR_MAX - TR_MIN, P = 34, S = 560, u = (S - 2 * P) / n;
    const X = v => P + (v - TR_MIN) * u, Y = v => S - P - (v - TR_MIN) * u;
    const pts = G.SHAPES[st.shape].map(([x, y]) => [x + st.ox, y + st.oy]), img = pts.map(p => G.transformPoint(p, tr()));
    const lastBox = T.stage.querySelector('.dt-trplane')?.getBoundingClientRect();
    T.stage.textContent = '';
    const wrap = el('div', 'dt-cwrap dt-trwrap');
    const floorPx = projecting() ? 16 : 13, kNow = lastBox && lastBox.width ? Math.min(lastBox.width, lastBox.height || lastBox.width) / S : T.scale(st.table && !matchMedia('(max-width: 719px)').matches ? S * 1.7 : S, S);
    const ts = kNow > 0 ? Math.max(1, floorPx / (18 * kNow)) : 1;
    plane = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'dt-plane dt-trplane', style: `--ts:${ts.toFixed(3)}`, role: 'application', tabindex: ctx.editing ? '-1' : '0', 'aria-label': `${W.move}. ${W.hint}`, 'aria-roledescription': W.move });
    plane.setAttribute('direction', 'ltr');
    plane.appendChild(svg('rect', { x: P, y: P, width: S - 2 * P, height: S - 2 * P, class: 'dt-paper' }));
    let grid = ''; for (let v = TR_MIN; v <= TR_MAX; v++) grid += `M${X(v)} ${P}V${S - P}M${P} ${Y(v)}H${S - P}`;
    plane.appendChild(svg('path', { d: grid, class: 'dt-grid' }));
    plane.appendChild(svg('path', { d: `M${P} ${Y(0)}H${S - P}M${X(0)} ${S - P}V${P}`, class: 'dt-axis' }));
    const step = 20 * ts * 2.2 > u * 2 ? 4 : 2;
    for (let v = TR_MIN; v <= TR_MAX; v += step) if (v) { plane.appendChild(svg('text', { x: X(v), y: Y(0) + 22, class: 'dt-cl', 'text-anchor': 'middle' }, minus(v))); plane.appendChild(svg('text', { x: X(0) - 8, y: Y(v) + 6, class: 'dt-cl', 'text-anchor': 'end' }, minus(v))); }
    if (st.op === 'reflect') {
      const L = { x: [TR_MIN, 0, TR_MAX, 0], y: [0, TR_MIN, 0, TR_MAX], yx: [TR_MIN, TR_MIN, TR_MAX, TR_MAX], ynx: [TR_MIN, TR_MAX, TR_MAX, TR_MIN] }[st.axis];
      plane.appendChild(svg('line', { x1: X(L[0]), y1: Y(L[1]), x2: X(L[2]), y2: Y(L[3]), class: 'dt-mirror' }));
    }
    if (st.op === 'rotate') plane.appendChild(svg('circle', { cx: X(0), cy: Y(0), r: 9, class: 'dt-centre' }));
    const path = ps => ps.map(([x, y]) => `${X(Math.max(TR_MIN - 1, Math.min(TR_MAX + 1, x)))},${Y(Math.max(TR_MIN - 1, Math.min(TR_MAX + 1, y)))}`).join(' ');
    const clip = svg('clipPath', { id: `trc-${ctx.id}` }); clip.appendChild(svg('rect', { x: P, y: P, width: S - 2 * P, height: S - 2 * P })); plane.appendChild(clip);
    if (st.ghost) plane.appendChild(svg('polygon', { points: path(pts), class: 'dt-trghost' }));
    if (st.op === 'translate' && (st.dx || st.dy)) plane.appendChild(svg('line', { x1: X(pts[0][0]), y1: Y(pts[0][1]), x2: X(img[0][0]), y2: Y(img[0][1]), class: 'dt-trvec', 'clip-path': `url(#trc-${ctx.id})` }));
    plane.appendChild(svg('polygon', { points: path(img), class: 'dt-trimg', 'clip-path': `url(#trc-${ctx.id})` }));
    const inGrid = ([x, y]) => x >= TR_MIN && x <= TR_MAX && y >= TR_MIN && y <= TR_MAX;
    pts.forEach((p, i) => {
      if (st.ghost) plane.appendChild(svg('text', { x: X(p[0]) - 12, y: Y(p[1]) - 8, class: 'dt-trl dt-trl0', 'text-anchor': 'end' }, LABELS[i]));
      if (inGrid(img[i])) { plane.appendChild(svg('circle', { cx: X(img[i][0]), cy: Y(img[i][1]), r: 6, class: 'dt-trpt' })); plane.appendChild(svg('text', { x: X(img[i][0]) + 10, y: Y(img[i][1]) - 8, class: 'dt-trl' }, `${LABELS[i]}′`)); }
    });
    wrap.appendChild(plane);
    if (st.table) {
      // Beside the grid: a row per point. Under it (a narrow tool): a column per point, so the grid keeps its room.
      const tb = el('table', 'dt-table dt-trtable dt-trtall'); tb.dir = 'ltr';
      const head = el('tr'); head.append(el('th', null, W.original), el('th', null, W.image)); tb.appendChild(head);
      pts.forEach((p, i) => { const r = el('tr'); r.append(el('td', null, `${LABELS[i]} ${G.pointText(p)}`), el('td', null, `${LABELS[i]}′ ${G.pointText(img[i])}`)); tb.appendChild(r); });
      const wide = el('table', 'dt-table dt-trtable dt-trwide'); wide.dir = 'ltr';
      const r0 = el('tr'), r1 = el('tr'), r2 = el('tr');
      r0.appendChild(el('th')); r1.appendChild(el('th', null, W.original)); r2.appendChild(el('th', null, W.image));
      pts.forEach((p, i) => { r0.appendChild(el('th', null, LABELS[i])); r1.appendChild(el('td', null, G.pointText(p))); r2.appendChild(el('td', null, G.pointText(img[i]))); });
      wide.append(r0, r1, r2);
      wrap.append(tb, wide);
    }
    T.stage.appendChild(wrap);
    T.read.textContent = '';
    T.read.appendChild(ltr('div', 'dt-big dt-trrule', G.ruleText(tr())));
    if (!img.every(inGrid)) T.read.appendChild(el('div', 'dt-sub dt-note', W.offGrid));
    else if (!st.table) T.read.appendChild(el('div', 'dt-sub', W.hint));
    if (!ctx.editing) wire(u, X, Y);
  };
  function wire(u) {
    plane.addEventListener('keydown', e => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      if (st.op !== 'translate') { st.op = 'translate'; }
      st.dx = Math.max(-8, Math.min(8, st.dx + d[0])); st.dy = Math.max(-8, Math.min(8, st.dy + d[1]));
      T.commit(G.ruleText(tr())); plane.focus();
    });
    // Drag the image to slide it (a translation).
    plane.addEventListener('pointerdown', e => { const q = svgPoint(plane, e); drag = { id: e.pointerId, x: q.x, y: q.y, dx: st.dx, dy: st.dy }; plane.setPointerCapture(e.pointerId); e.preventDefault(); plane.focus(); });
    plane.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const q = svgPoint(plane, e), ndx = Math.max(-8, Math.min(8, drag.dx + Math.round((q.x - drag.x) / u))), ndy = Math.max(-8, Math.min(8, drag.dy - Math.round((q.y - drag.y) / u)));
      if ((ndx !== st.dx || ndy !== st.dy) && (Math.abs(q.x - drag.x) > 4 || Math.abs(q.y - drag.y) > 4)) { st.op = 'translate'; st.dx = ndx; st.dy = ndy; const d = drag; T.draw(); drag = d; plane.setPointerCapture(d.id); plane.focus(); }
    });
    const end = e => { if (!drag || drag.id !== e.pointerId) return; const moved = drag.dx !== st.dx || drag.dy !== st.dy; drag = null; if (moved) T.commit(G.ruleText(tr())); plane.focus(); };
    plane.addEventListener('pointerup', end); plane.addEventListener('pointercancel', end);
  }
  return T.finish({
    options: box => {
      const sh = field(box, W.shape, selectOf(['tri', 'flag', 'ell', 'arrow'].map(k => [k, W[k]]), st.shape));
      sh.addEventListener('change', () => { st.shape = sh.value; const span = { tri: [4, 3], flag: [3, 5], ell: [4, 4], arrow: [5, 5] }[st.shape]; st.ox = Math.min(st.ox, 8 - span[0]); st.oy = Math.min(st.oy, 8 - span[1]); T.commit(W[st.shape]); });
      checkRow(box, W.ghost, st.ghost, v => { st.ghost = v; T.commit(); });
      checkRow(box, W.table, st.table, v => { st.table = v; T.commit(); });
    },
  });
}


// ================================================================ 6. balance scale
function balance(body, s, ctx) {
  const T = shell(body, s, ctx, 'balance'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  const where = T.seg(W.where, [['both', W.both], ['left', W.left], ['right', W.right]], () => st.where, v => { st.where = v; T.commit(W[v]); });
  T.top.appendChild(where);
  const L = () => ({ x: st.lx, u: st.lu }), R = () => ({ x: st.rx, u: st.ru });
  const eq = () => `${G.sideText(L())} ${G.tip(L(), R(), st.x) ? '≠' : '='} ${G.sideText(R())}`;
  const opB = (op, label, aria) => { const b = btn(label, 'btn btn-sm dt-balop', aria); b.dir = 'ltr'; b.addEventListener('click', () => doOp(op)); return b; };
  const addx = opB('addx', '+ x', W.addx), subx = opB('subx', '− x', W.subx), add1 = opB('add1', '+ 1', W.add1), sub1 = opB('sub1', '− 1', W.sub1), div = opB('div', '÷', W.div);
  const undo = ibtn('↶', W.undo), fresh = ibtn('🎲', W.new);
  T.foot.append(addx, subx, add1, sub1, div, undo, fresh);
  const g = () => [st.lx, st.lu, st.rx, st.ru].reduce((a, b) => M.gcd(a, b), 0);
  const doOp = op => {
    const n = g(), r = G.balanceOp(L(), R(), op, st.where, n);
    if (!r) { ctx.say(W.cant); return; }
    st.hist = [...st.hist, { lx: st.lx, lu: st.lu, rx: st.rx, ru: st.ru, op, n: op === 'div' ? n : 0, w: st.where }].slice(-12);
    Object.assign(st, { lx: r.L.x, lu: r.L.u, rx: r.R.x, ru: r.R.u });
    T.commit(`${W[op].replace('{n}', n)}: ${eq()}`);
    const v = G.solvedValue(L(), R()); if (v !== null && !G.tip(L(), R(), st.x)) ctx.say(fill(W.solved, { x: v }));
  };
  undo.addEventListener('click', () => { const h = st.hist.pop(); if (!h) return; Object.assign(st, { lx: h.lx, lu: h.lu, rx: h.rx, ru: h.ru }); T.commit(`${W.undo}: ${eq()}`); });
  fresh.addEventListener('click', () => { const x = 1 + Math.floor(Math.random() * 6), e = G.makeEquation(x); Object.assign(st, { x, lx: e.L.x, lu: e.L.u, rx: e.R.x, ru: e.R.u, hist: [], where: 'both', show: false }); T.commit(`${W.new}: ${eq()}`); });
  T.draw = () => {
    where.sync();
    const l = L(), r = R(), tilt = G.tip(l, r, st.x), n = g();
    for (const [b, op] of [[addx, 'addx'], [subx, 'subx'], [add1, 'add1'], [sub1, 'sub1']]) b.disabled = !G.balanceOp(l, r, op, st.where);
    div.disabled = st.where !== 'both' || n < 2; div.textContent = n >= 2 ? `÷ ${n}` : '÷'; div.setAttribute('aria-label', fill(W.div, { n: n >= 2 ? n : 2 })); div.title = div.getAttribute('aria-label');
    undo.disabled = !st.hist.length;
    T.stage.textContent = '';
    const VW = 640, VH = 330, ang = tilt * 9, cx = VW / 2, cy = 120, arm = 230;
    const ts = tsFor(T, VW, VH, 22);
    const sv = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'dt-bal', role: 'img', 'aria-label': `${W.scale}: ${eq()}`, style: `--ts:${ts.toFixed(3)}` });
    sv.setAttribute('direction', 'ltr');
    sv.appendChild(svg('path', { d: `M${cx} ${cy}L${cx - 50} ${VH - 14}H${cx + 50}Z`, class: 'dt-balstand' }));
    const beam = svg('g', { transform: `rotate(${ang} ${cx} ${cy})` });
    beam.appendChild(svg('rect', { x: cx - arm - 10, y: cy - 7, width: 2 * arm + 20, height: 14, rx: 7, class: 'dt-balbeam' }));
    sv.appendChild(beam);
    sv.appendChild(svg('circle', { cx, cy, r: 10, class: 'dt-balpin' }));
    // Each pan hangs straight down from its end of the beam.
    const rad = (ang * Math.PI) / 180;
    [[l, -1], [r, 1]].forEach(([side, k]) => {
      const ex = cx + k * arm * Math.cos(rad), ey = cy + k * arm * Math.sin(rad), py = ey + 150, pw = 200;
      sv.appendChild(svg('path', { d: `M${ex} ${ey}L${ex - pw / 2 + 10} ${py}M${ex} ${ey}L${ex + pw / 2 - 10} ${py}`, class: 'dt-balstring' }));
      sv.appendChild(svg('path', { d: `M${ex - pw / 2} ${py}h${pw}l-14 14h${-pw + 28}z`, class: 'dt-balpan' }));
      // x-boxes in rows of 4 (bottom up), then unit weights in rows of 10.
      let y = py;
      const xs = side.x, rowsX = Math.ceil(xs / 4);
      for (let i = 0; i < xs; i++) {
        const row = Math.floor(i / 4), col = i % 4, inRow = Math.min(4, xs - row * 4), bw = Math.min(46, 38 * ts);
        const bx = ex - (inRow * (bw + 4)) / 2 + col * (bw + 4), by = py - (row + 1) * (bw + 4);
        sv.appendChild(svg('rect', { x: bx, y: by, width: bw, height: bw, rx: 6, class: 'dt-xbox' }));
        sv.appendChild(svg('text', { x: bx + bw / 2, y: by + bw * 0.68, 'text-anchor': 'middle', class: 'dt-xboxt', 'font-size': (bw * 0.58).toFixed(1) }, st.show ? String(st.x) : 'x'));
      }
      y = py - rowsX * (Math.min(46, 38 * ts) + 4);
      for (let i = 0; i < side.u; i++) {
        const row = Math.floor(i / 10), col = i % 10, inRow = Math.min(10, side.u - row * 10), d = 17;
        sv.appendChild(svg('circle', { cx: ex - (inRow * d) / 2 + col * d + d / 2, cy: y - row * d - d / 2 - 1, r: d / 2 - 1, class: 'dt-unit1' }));
      }
      const lab = svg('text', { x: ex, y: py + 46, 'text-anchor': 'middle', class: 'dt-balside' }, G.sideText(side));
      sv.appendChild(lab);
    });
    T.stage.appendChild(sv);
    T.read.textContent = '';
    T.read.appendChild(ltr('div', 'dt-big dt-baleq', eq()));
    const v = G.solvedValue(l, r);
    const sub = el('div', 'dt-sub');
    if (v !== null && !tilt) { sub.textContent = fill(W.solved, { x: v }); sub.classList.add('dt-good'); }
    else sub.textContent = tilt ? (tilt < 0 ? W.tipsL : W.tipsR) : W.level;
    T.read.appendChild(sub);
  };
  return T.finish({
    options: box => {
      checkRow(box, W.show, st.show, v => { st.show = v; T.commit(); });
      const sec = field(box, W.secret, numberIn(st.x, 1, 9)); sec.addEventListener('change', () => { st.x = Math.max(1, Math.min(9, Math.round(+sec.value) || 1)); sec.value = st.x; T.commit(); });
      const st0 = field(box, W.start, selectOf([['', '—'], ...[1, 2, 3, 4, 5, 6].map(x => [x, `x = ${x}`])], ''));
      st0.addEventListener('change', () => { if (!st0.value) return; const x = +st0.value, e = G.makeEquation(x); Object.assign(st, { x, lx: e.L.x, lu: e.L.u, rx: e.R.x, ru: e.R.u, hist: [], where: 'both' }); T.commit(eq()); });
      if (st.hist.length) {
        box.appendChild(el('h3', 'dash-h3', W.steps));
        const ol = el('ol', 'dt-steps'); ol.dir = 'ltr';
        for (const h of st.hist) ol.appendChild(el('li', null, `${G.sideText({ x: h.lx, u: h.lu })} = ${G.sideText({ x: h.rx, u: h.ru })}  →  ${W[h.op === 'new' ? 'new' : h.op].replace('{n}', h.n)}${h.w !== 'both' ? ` (${W[h.w]})` : ''}`));
        ol.appendChild(el('li', null, eq())); box.appendChild(ol);
      }
    },
  });
}

// ================================================================ 7. algebra tiles
function algebra(body, s, ctx) {
  const T = shell(body, s, ctx, 'algebra'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let sel = -1;
  const names = { x2: 'x²', x: 'x', 1: '1' };
  const tileName = t => `${t.neg ? '−' : '+'}${names[t.k]}`;
  const adds = el('div', 'dt-seg dt-algadd'); adds.setAttribute('role', 'group'); adds.setAttribute('aria-label', W.tile);
  for (const k of G.TILE_KINDS) for (const neg of [false, true]) {
    const b = btn(`${neg ? '−' : '+'}${names[k]}`, `btn btn-sm dt-algb${neg ? ' is-neg' : ''}`, fill(W.added, { t: `${neg ? W.neg : W.pos} ${W[k === '1' ? 'one' : k]}` })); b.dir = 'ltr';
    b.addEventListener('click', () => { if (st.tiles.length >= 36) { ctx.say(W.full); return; } st.tiles.push({ k, neg }); sel = st.tiles.length - 1; T.commit(fill(W.added, { t: tileName({ k, neg }) })); });
    adds.appendChild(b);
  }
  T.top.appendChild(adds);
  const flip = ibtn('⇅', W.flip), zero = ibtn('±', W.zero), clear = ibtn('🧹', W.clear);
  T.foot.append(flip, zero, clear);
  const remove = i => { const t = st.tiles.splice(i, 1)[0]; sel = Math.min(i, st.tiles.length - 1); T.commit(fill(W.removed, { t: tileName(t) })); T.stage.querySelectorAll('.dt-tile')[sel]?.focus(); };
  flip.addEventListener('click', () => { const t = st.tiles[sel]; if (!t) return; t.neg = !t.neg; T.commit(tileName(t)); T.stage.querySelectorAll('.dt-tile')[sel]?.focus(); });
  zero.addEventListener('click', () => { const n = G.zeroPairs(st.tiles).size / 2; if (!n) return; st.tiles = G.removeZeroPairs(st.tiles); sel = -1; T.commit(`${fill(W.pairs, { n })}: ${G.polyText(G.simplifyTiles(st.tiles))}`); });
  clear.addEventListener('click', () => { st.tiles = []; sel = -1; T.commit(W.clear); });
  T.draw = () => {
    const z = G.zeroPairs(st.tiles), had = body.contains(document.activeElement) && document.activeElement.classList.contains('dt-tile');
    flip.disabled = !st.tiles[sel]; zero.disabled = !z.size; clear.disabled = !st.tiles.length;
    for (const b of adds.children) b.disabled = st.tiles.length >= 36;
    T.stage.textContent = '';
    const mat = el('div', 'dt-algmat'); mat.dir = 'ltr'; mat.setAttribute('role', 'group'); mat.setAttribute('aria-label', W.mat);
    const cells = [];
    // The tiles in rows by kind (x², x, 1): positives first, then negatives; tiles in a zero pair show it.
    for (const k of G.TILE_KINDS) {
      const row = el('div', `dt-algrow dt-alg-${k === '1' ? 'one' : k}`);
      const idx = st.tiles.map((t, i) => ({ t, i })).filter(x => x.t.k === k).sort((a, b) => Number(a.t.neg) - Number(b.t.neg) || a.i - b.i);
      for (const { t, i } of idx) {
        const b = btn('', `dt-tile dt-t-${k === '1' ? 'one' : k}${t.neg ? ' is-neg' : ''}${z.has(i) ? ' is-zero' : ''}${i === sel ? ' is-sel' : ''}`, `${tileName(t)}${z.has(i) ? `, ${W.zero}` : ''}`);
        b.removeAttribute('title'); b.setAttribute('aria-pressed', String(i === sel));
        b.appendChild(el('span', 'dt-tilet', `${t.neg ? '−' : ''}${names[k]}`));
        if (ctx.editing) b.disabled = true;
        b.addEventListener('click', () => { sel = i; T.draw(); T.stage.querySelector(`[data-i="${i}"]`)?.focus(); });
        b.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); } else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); sel = i; flip.click(); } });
        b.dataset.i = i; row.appendChild(b); cells.push(b);
      }
      mat.appendChild(row);
    }
    if (!st.tiles.length) mat.appendChild(el('p', 'dw-empty', W.empty));
    T.stage.appendChild(mat);
    if (cells.length && !ctx.editing) { cells.forEach(c => { c.tabIndex = -1; }); (cells.find(c => +c.dataset.i === sel) || cells[0]).tabIndex = 0; roving(mat, cells, 99); }
    if (had) T.stage.querySelector(`[data-i="${sel}"]`)?.focus();
    T.read.textContent = '';
    const raw = G.rawText(st.tiles), simple = G.polyText(G.simplifyTiles(st.tiles));
    const big = ltr('div', 'dt-big dt-algexp');
    if (raw !== simple) big.append(el('span', 'dt-algraw', raw), el('span', 'dt-eqsign', ' = '), el('b', null, simple)); else big.append(el('b', null, simple));
    T.read.appendChild(big);
    T.read.appendChild(el('div', 'dt-sub', z.size ? fill(W.pairs, { n: z.size / 2 }) : W.hint));
  };
  return T.finish();
}

// ================================================================ 8. coins and money (our own simple designs, never real coin pictures)
const METAL = v => (v < 5 ? 'cu' : v < 100 ? 'ag' : 'au');
function coinSvg(cur, d, size = 64) {
  const face = G.faceText(cur, d.v);
  if (d.note) {
    const sv = svg('svg', { viewBox: '0 0 120 64', class: `dt-note dt-note${d.v >= 2000 ? 3 : d.v >= 1000 ? 2 : 1}`, width: size * 1.6, height: size * 0.86, 'aria-hidden': 'true' });
    sv.append(svg('rect', { x: 2, y: 2, width: 116, height: 60, rx: 8, class: 'dt-notebg' }), svg('rect', { x: 9, y: 9, width: 102, height: 46, rx: 5, class: 'dt-noteframe' }),
      svg('path', { d: 'M26 22l3.5 7 7.5 1-5.5 5 1.4 7.5-6.9-3.7-6.9 3.7 1.4-7.5-5.5-5 7.5-1z', class: 'dt-notestar' }), svg('text', { x: 78, y: 41, 'text-anchor': 'middle', class: 'dt-notet' }, face));
    return sv;
  }
  const r = 30 - (cur === 'gen' ? 0 : Math.max(0, 5 - String(d.v).length * 2));
  const sv = svg('svg', { viewBox: '0 0 64 64', class: `dt-coin dt-${METAL(d.v)}`, width: size, height: size, 'aria-hidden': 'true' });
  sv.append(svg('circle', { cx: 32, cy: 32, r, class: 'dt-coinrim' }), svg('circle', { cx: 32, cy: 32, r: r - 5, class: 'dt-coinface' }),
    svg('text', { x: 32, y: 32 + (face.length > 3 ? 5 : 7), 'text-anchor': 'middle', class: `dt-coint${face.length > 3 ? ' is-long' : ''}` }, face));
  return sv;
}
function coins(body, s, ctx) {
  const T = shell(body, s, ctx, 'coins'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  if (st.cur === 'auto') st.cur = G.currencyFor(ctx.intl);
  const fix = () => { const n = G.denoms(st.cur).length; st.counts = Array.from({ length: n }, (_, i) => st.counts[i] || 0); };
  fix();
  const money = v => G.moneyText(st.cur, v, ctx.intl);
  const mode = T.seg(W.mode, [['count', W.count, null, '🧮'], ['change', W.change, null, '🔁']], () => st.mode, v => { st.mode = v; T.commit(W[v]); });
  T.top.appendChild(mode);
  const unit = () => (st.cur === 'gen' ? 1 : 1);
  const cost = T.stepper(W.cost, () => money(st.cost), () => { if (st.cost > 0) { st.cost -= unit(); T.commit(money(st.cost)); } }, () => { if (st.cost < st.paid) { st.cost += unit(); T.commit(money(st.cost)); } }, `${W.cost} −`, `${W.cost} +`);
  const paidSteps = () => [...new Set(G.denoms(st.cur).map(d => d.v).filter(v => v >= 10).concat([st.paid]))].sort((a, b) => a - b);
  const paid = T.stepper(W.paid, () => money(st.paid), () => { const p = paidSteps().filter(v => v < st.paid && v >= st.cost).pop(); if (p !== undefined) { st.paid = p; T.commit(money(st.paid)); } }, () => { const p = paidSteps().find(v => v > st.paid); if (p !== undefined) { st.paid = p; T.commit(money(st.paid)); } }, `${W.paid} −`, `${W.paid} +`);
  T.top.append(cost, paid);
  const clear = ibtn('🧹', W.clear);
  T.foot.append(clear);
  clear.addEventListener('click', () => { st.counts = st.counts.map(() => 0); T.commit(W.clear); });
  T.draw = () => {
    mode.sync(); cost.sync(); paid.sync();
    const ds = G.denoms(st.cur), change = st.mode === 'change';
    cost.hidden = paid.hidden = !change; clear.hidden = change; clear.disabled = !st.counts.some(Boolean);
    T.stage.textContent = '';
    const wrap = el('div', `dt-money${change ? ' is-change' : ''}`);
    if (!change) {
      const tray = el('div', 'dt-mtray'); tray.setAttribute('role', 'group'); tray.setAttribute('aria-label', W.tray);
      ds.forEach((d, i) => {
        const b = btn('', 'dt-mbtn', fill(W.added, { m: money(d.v) })); b.removeAttribute('title'); b.appendChild(coinSvg(st.cur, d, 44));
        if (ctx.editing) b.disabled = true;
        b.disabled = b.disabled || st.counts[i] >= 20;
        b.addEventListener('click', () => { if (st.counts[i] >= 20) return; st.counts[i]++; T.commit(`${fill(W.added, { m: money(d.v) })}. ${W.total}: ${money(G.moneyTotal(st.cur, st.counts))}`); tray.children[i]?.focus(); });
        tray.appendChild(b);
      });
      const mat = el('div', 'dt-mmat dw-scroll'); mat.setAttribute('role', 'group'); mat.setAttribute('aria-label', W.mat);
      ds.forEach((d, i) => {
        if (!st.counts[i]) return;
        const g = btn('', 'dt-mstack', `${fill(W.removed, { m: money(d.v) })} (${st.counts[i]})`); g.removeAttribute('title');
        const pile = el('span', 'dt-mpile'); pile.style.setProperty('--n', Math.min(st.counts[i], 6));
        for (let k = 0; k < Math.min(st.counts[i], 6); k++) pile.appendChild(coinSvg(st.cur, d, 44));
        g.append(pile, ltr('b', 'dt-mn', `× ${st.counts[i]}`));
        if (ctx.editing) g.disabled = true;
        g.addEventListener('click', () => { st.counts[i]--; T.commit(`${fill(W.removed, { m: money(d.v) })}. ${W.total}: ${money(G.moneyTotal(st.cur, st.counts))}`); });
        mat.appendChild(g);
      });
      if (!st.counts.some(Boolean)) mat.appendChild(el('p', 'dw-empty', W.empty));
      wrap.append(tray, mat);
    } else {
      const f = G.fewest(st.cur, Math.max(0, st.paid - st.cost)), mat = el('div', 'dt-mmat dt-mchange');
      ds.forEach((d, i) => { if (!f[i]) return; const g = el('div', 'dt-mstack is-static'); const pile = el('span', 'dt-mpile'); pile.style.setProperty('--n', Math.min(f[i], 6)); for (let k = 0; k < Math.min(f[i], 6); k++) pile.appendChild(coinSvg(st.cur, d, 44)); g.append(pile, ltr('b', 'dt-mn', `× ${f[i]}`)); mat.appendChild(g); });
      const steps = G.countUp(st.cur, st.cost, st.paid);
      const chain = ltr('p', 'dt-mchain');
      if (steps && steps.length) chain.textContent = [money(st.cost), ...steps.map(x => money(x.to))].join(' → ');
      wrap.append(mat, chain);
    }
    T.stage.appendChild(wrap);
    T.read.textContent = '';
    if (!change) {
      const total = G.moneyTotal(st.cur, st.counts);
      const big = el('div', 'dt-big'); big.append(el('span', 'dt-mlab', `${W.total} `), ltr('b', null, money(total)));
      T.read.appendChild(big);
      if (total) T.read.appendChild(el('div', 'dt-sub', fill(W.fewest, { n: G.fewest(st.cur, total).reduce((a, b) => a + b, 0) })));
    } else if (st.paid < st.cost) T.read.appendChild(el('div', 'dt-sub dt-note', W.notEnough));
    else {
      const big = el('div', 'dt-big'); big.append(el('span', 'dt-mlab', `${W.changeIs} `), ltr('b', null, money(st.paid - st.cost)));
      T.read.append(big, el('div', 'dt-sub', W.countUp));
    }
  };
  return T.finish({
    options: box => {
      const c = field(box, W.cur, selectOf(G.CURRENCY_IDS.map(k => [k, W[k]]), st.cur));
      c.addEventListener('change', () => { st.cur = c.value; fix(); st.counts = st.counts.map(() => 0); T.commit(W[st.cur]); });
      const co = field(box, W.cost, numberIn(st.cost, 0, 10000)), pa = field(box, W.paid, numberIn(st.paid, 0, 10000));
      const set = () => { st.cost = Math.max(0, Math.min(10000, Math.round(+co.value) || 0)); st.paid = Math.max(0, Math.min(10000, Math.round(+pa.value) || 0)); T.commit(); };
      co.addEventListener('change', set); pa.addEventListener('change', set);
      box.appendChild(el('p', 'small muted', W.units));
    },
  });
}


// ================================================================ 9. chance lab
function chance(body, s, ctx) {
  const T = shell(body, s, ctx, 'chance'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let anim = 0, last = null;
  const kind = T.seg(W.kind, [['coin', W.coin, null, '🪙'], ['dice', W.dice, null, '🎲'], ['spinner', W.spinner, null, '🎡']], () => st.kind, v => { cancelAnimationFrame(anim); st.kind = v; st.counts = G.outcomes(v, st.dice, st.parts).map(() => 0); last = null; T.commit(W[v]); });
  T.top.appendChild(kind);
  const runs = rowSelect(W.runs, [], st.runs, v => { st.runs = +v; T.commit(); });
  const run = ibtn('▶️', W.run), reset = ibtn('🧹', W.reset);
  T.foot.append(runs, run, reset);
  const fillRuns = () => { runs.textContent = ''; for (const n of [...new Set([1, 10, 100, 1000, st.runs])].sort((a, b) => a - b)) { const o = el('option', null, fill(W.trials, { n })); o.value = String(n); if (n === st.runs) o.selected = true; runs.appendChild(o); } };
  const labelOf = o => (st.kind === 'coin' ? (o.o === 'H' ? W.heads : W.tails) : o.o);
  const reduced = () => (ctx.reduced ? ctx.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  run.addEventListener('click', () => {
    cancelAnimationFrame(anim);
    const n = st.runs;
    const done = () => { T.commit(); const total = st.counts.reduce((a, b) => a + b, 0); ctx.say(`${fill(W.got, { n: total })}`); };
    // Many trials fill the chart a batch at a time (at once with reduced motion).
    if (reduced() || n <= 10) { st.counts = G.runTrials(st.kind, st.dice, st.parts, n, st.counts); last = G.trial(st.kind, st.dice, st.parts); done(); return; }
    let left = n; const batch = Math.max(1, Math.ceil(n / 30));
    const step = () => { const k = Math.min(batch, left); st.counts = G.runTrials(st.kind, st.dice, st.parts, k, st.counts); left -= k; last = G.trial(st.kind, st.dice, st.parts); T.draw(); if (left > 0) anim = requestAnimationFrame(step); else done(); };
    anim = requestAnimationFrame(step);
  });
  reset.addEventListener('click', () => { cancelAnimationFrame(anim); st.counts = st.counts.map(() => 0); last = null; T.commit(W.reset); });
  T.draw = () => {
    kind.sync(); fillRuns();
    const outs = G.outcomes(st.kind, st.dice, st.parts), total = st.counts.reduce((a, b) => a + b, 0);
    reset.disabled = !total;
    T.stage.textContent = '';
    const wrap = el('div', 'dt-chwrap');
    // The thing itself, showing the last result.
    const obj = svg('svg', { viewBox: '-60 -60 120 120', class: 'dt-chobj', 'aria-hidden': 'true' });
    if (st.kind === 'coin') { obj.append(svg('circle', { r: 50, class: 'dt-coinrim dt-ag' }), svg('circle', { r: 43, class: 'dt-coinface' }), svg('text', { y: 14, 'text-anchor': 'middle', class: 'dt-chface' }, last === null ? '?' : last === 0 ? W.heads.slice(0, 1) : W.tails.slice(0, 1))); }
    else if (st.kind === 'dice') {
      const faces = st.dice === 2 ? (last === null ? [0, 0] : (() => { const s2 = last + 2; const a = Math.max(1, s2 - 6) + ((last * 7) % Math.max(1, Math.min(6, s2 - 1) - Math.max(1, s2 - 6) + 1)); return [a, s2 - a]; })()) : [last === null ? 0 : last + 1];
      faces.forEach((f, i) => { const dx = faces.length === 2 ? (i ? 28 : -28) : 0, sz = faces.length === 2 ? 50 : 84; const g = svg('g', { transform: `translate(${dx} 0)` }); g.appendChild(svg('rect', { x: -sz / 2, y: -sz / 2, width: sz, height: sz, rx: sz / 6, class: 'dt-die' })); const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[f] || []; for (const [px, py] of pips) g.appendChild(svg('circle', { cx: px * sz * 0.27, cy: py * sz * 0.27, r: sz * 0.08, class: 'dt-pip' })); if (!f) g.appendChild(svg('text', { y: sz * 0.16, 'text-anchor': 'middle', class: 'dt-chface' }, '?')); obj.appendChild(g); });
    } else {
      const n = st.parts;
      for (let i = 0; i < n; i++) { const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2; obj.appendChild(svg('path', { d: `M0 0L${50 * Math.cos(a0)} ${50 * Math.sin(a0)}A50 50 0 ${n === 1 ? 1 : 0} 1 ${50 * Math.cos(a1)} ${50 * Math.sin(a1)}Z`, class: `dt-spin dt-sp${i % 4}` })); obj.appendChild(svg('text', { x: 33 * Math.cos(am), y: 33 * Math.sin(am) + 6, 'text-anchor': 'middle', class: 'dt-spint' }, i + 1)); }
      const at = last === null ? -Math.PI / 2 : ((last + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
      obj.append(svg('line', { x1: 0, y1: 0, x2: 44 * Math.cos(at), y2: 44 * Math.sin(at), class: 'dt-spinarrow' }), svg('circle', { r: 6, class: 'dt-pip' }));
    }
    wrap.appendChild(obj);
    // The live bar chart: each outcome's count, and a dashed mark where we expect it.
    const n = outs.length, CW = 520, CH = 300, L = 54, B = 44, Tp = 14, cw = (CW - L - 10) / n;
    const exp = outs.map(o => (total * o.p.n) / o.p.d), sc = M.niceScale(Math.max(1, ...st.counts, ...exp));
    const ts = tsFor(T, CW * 1.35, CH, 20);
    const ch = svg('svg', { viewBox: `0 0 ${CW} ${CH}`, class: 'dt-chart', role: 'img', 'aria-label': `${W.chart}: ${outs.map((o, i) => `${labelOf(o)} ${st.counts[i]}`).join(', ')}`, style: `--ts:${ts.toFixed(3)}` });
    ch.setAttribute('direction', 'ltr');
    const Y = v => CH - B - (v / sc.top) * (CH - B - Tp);
    for (let v = 0; v <= sc.top; v += sc.step) { ch.appendChild(svg('line', { x1: L, x2: CW - 6, y1: Y(v), y2: Y(v), class: 'dt-gridl' })); ch.appendChild(svg('text', { x: L - 8, y: Y(v) + 6, 'text-anchor': 'end', class: 'dt-gl' }, new Intl.NumberFormat(ctx.intl).format(v))); }
    const every = Math.ceil((n * 20 * ts * 1.4) / (CW - L));
    outs.forEach((o, i) => {
      const x = L + i * cw + cw * 0.15, w = cw * 0.7;
      ch.appendChild(svg('rect', { x, y: Y(st.counts[i]), width: w, height: Math.max(0, Y(0) - Y(st.counts[i])), class: `dt-gbar dt-c${i % 3}` }));
      if (total) ch.appendChild(svg('line', { x1: x - 4, x2: x + w + 4, y1: Y(exp[i]), y2: Y(exp[i]), class: 'dt-expect' }));
      if (i % every === 0) ch.appendChild(svg('text', { x: x + w / 2, y: CH - B + 26, 'text-anchor': 'middle', class: 'dt-gl' }, st.kind === 'coin' ? labelOf(o) : o.o));
    });
    ch.appendChild(svg('line', { x1: L, x2: CW - 6, y1: Y(0), y2: Y(0), class: 'dt-axis' }));
    wrap.appendChild(ch);
    T.stage.appendChild(wrap);
    T.read.textContent = '';
    const pick = st.kind === 'dice' && st.dice === 2 ? 5 : 0, o = outs[pick];
    const pct = (a, b) => (b ? `${new Intl.NumberFormat(ctx.intl, { maximumFractionDigits: 1 }).format((100 * a) / b)}%` : '–');
    T.read.appendChild(ltr('div', 'dt-big', fill(W.got, { n: total })));
    const f = M.simplify(o.p.n, o.p.d);
    T.read.appendChild(el('div', 'dt-sub', fill(W.expected, { o: iso(labelOf(o)), n: iso(st.counts[pick]), p: iso(pct(st.counts[pick], total)), e: iso(`${f.n}/${f.d}`), q: iso(pct(f.n, f.d)) })));
  };
  const fin = T.finish({
    options: box => {
      const di = field(box, W.dice, selectOf([[1, W.one], [2, W.two]], st.dice));
      di.addEventListener('change', () => { st.dice = +di.value; if (st.kind === 'dice') st.counts = G.outcomes('dice', st.dice).map(() => 0); T.commit(); });
      const pa = field(box, W.parts, selectOf([2, 3, 4, 5, 6, 8].map(n => [n, String(n)]), st.parts));
      pa.addEventListener('change', () => { st.parts = +pa.value; if (st.kind === 'spinner') st.counts = G.outcomes('spinner', 1, st.parts).map(() => 0); T.commit(); });
      const rn = field(box, W.runs, numberIn(st.runs, 1, 1000));
      rn.addEventListener('change', () => { st.runs = Math.max(1, Math.min(1000, Math.round(+rn.value) || 1)); rn.value = st.runs; T.commit(); });
    },
  });
  return { destroy() { cancelAnimationFrame(anim); fin.destroy(); } };
}

// ================================================================ 10. letter tiles and word families (no typing: tiles only)
function letters(body, s, ctx) {
  const T = shell(body, s, ctx, 'letters'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let drag = null;
  const fam = rowSelect(W.fam, [['', W.none], ...G.FAMILY_IDS.map(f => [f, `-${f}`])], st.fam, v => { st.fam = v; if (v) st.word = st.word.slice(0, 2); T.commit(v ? `-${v}` : W.none); });
  const caps = T.toggle('Aa', W.caps, () => st.caps, v => { st.caps = v; T.commit(); });
  T.top.append(fam, caps);
  const back = ibtn('⌫', W.back), clear = ibtn('🧹', W.clear);
  T.foot.append(back, clear);
  const letter = i => (st.caps ? G.ALPHABET[i].toUpperCase() : G.ALPHABET[i]);
  const max = () => (st.fam ? 2 : 12);
  const word = () => st.word.map(i => G.ALPHABET[i]).join('') + (st.fam || '');
  const tileName = i => `${letter(i)}, ${G.isVowel(G.ALPHABET[i]) ? W.vowel : W.consonant}`;
  const addAt = (i, at = st.word.length) => { if (st.word.length >= max()) return false; st.word.splice(at, 0, i); T.commit(`${fill(W.added, { l: letter(i) })}: ${word()}`); return true; };
  back.addEventListener('click', () => { if (!st.word.length) return; const i = st.word.pop(); T.commit(fill(W.removed, { l: letter(i) })); });
  clear.addEventListener('click', () => { st.word = []; T.commit(W.clear); });
  T.draw = () => {
    fam.value = st.fam; caps.sync();
    back.disabled = clear.disabled = !st.word.length;
    T.stage.textContent = '';
    const wrap = el('div', 'dt-lwrap'); wrap.dir = 'ltr';
    // The word being built: tiles that can be moved (arrow keys with Shift, or drag), the family's ending fixed.
    const row = el('div', 'dt-lword'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.word);
    const cells = st.word.map((i, k) => {
      const b = btn('', `dt-ltile${G.isVowel(G.ALPHABET[i]) ? ' is-vowel' : ''}`, `${tileName(i)} (${k + 1})`); b.removeAttribute('title');
      b.appendChild(el('span', 'dt-lch', letter(i)));
      b.dataset.k = k; if (ctx.editing) b.disabled = true;
      b.addEventListener('keydown', e => {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) { e.preventDefault(); const to = k + (e.key === 'ArrowLeft' ? -1 : 1); if (to < 0 || to >= st.word.length) return; [st.word[k], st.word[to]] = [st.word[to], st.word[k]]; T.commit(`${fill(W.moved, { l: letter(i), n: to + 1 })}: ${word()}`); row.querySelector(`[data-k="${to}"]`)?.focus(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.word.splice(k, 1); T.commit(fill(W.removed, { l: letter(i) })); (row.querySelector(`[data-k="${Math.max(0, k - 1)}"]`) || bank.querySelector('button'))?.focus(); }
      });
      b.addEventListener('pointerdown', e => { if (ctx.editing) return; drag = { from: 'word', k, i, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; b.setPointerCapture(e.pointerId); });
      row.appendChild(b); return b;
    });
    for (let k = st.word.length; k < (st.fam ? 1 : 0); k++) row.appendChild(el('span', 'dt-lslot', W.onset));
    if (st.fam) for (const ch of st.fam) { const t = el('span', `dt-ltile is-fixed${G.isVowel(ch) ? ' is-vowel' : ''}`); t.appendChild(el('span', 'dt-lch', st.caps ? ch.toUpperCase() : ch)); t.setAttribute('aria-hidden', 'true'); row.appendChild(t); }
    if (!st.word.length && !st.fam) row.appendChild(el('p', 'dw-empty', W.hint));
    if (cells.length && !ctx.editing) roving(row, cells, 99);
    wrap.appendChild(row);
    // The bank: every letter once, vowels marked by colour and a dot (never colour alone).
    const bank = el('div', 'dt-lbank'); bank.setAttribute('role', 'group'); bank.setAttribute('aria-label', W.bank);
    const bcells = G.ALPHABET.map((ch, i) => {
      const b = btn('', `dt-ltile dt-lb${G.isVowel(ch) ? ' is-vowel' : ''}`, fill(W.added, { l: tileName(i) })); b.removeAttribute('title');
      b.appendChild(el('span', 'dt-lch', letter(i)));
      if (ctx.editing) b.disabled = true;
      b.addEventListener('click', () => { if (drag && drag.moved) return; if (st.fam && st.word.length >= 2) st.word = []; addAt(i); T.stage.querySelectorAll('.dt-lb')[i]?.focus(); });
      b.addEventListener('pointerdown', e => { if (ctx.editing) return; drag = { from: 'bank', i, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; });
      bank.appendChild(b); return b;
    });
    if (!ctx.editing) roving(bank, bcells, 13);
    wrap.appendChild(bank);
    T.stage.appendChild(wrap);
    wireDrag(row);
    T.read.textContent = '';
    const w = word(), c = G.letterCounts(w);
    if (!w) return;
    const sub = [fill(W.counts, { n: c.letters, v: c.vowels, c: c.consonants })];
    if (st.fam && st.word.length) sub.push(G.isFamilyWord(st.fam, w) ? `✔ ${W.real}` : W.made);
    T.read.appendChild(el('div', 'dt-sub', sub.join(' · ')));
  };
  /** Drop a tile on the word: from the bank it goes in where it lands; a word tile moves there (or leaves when dropped
   *  outside the word). */
  function wireDrag(row) {
    const at = x => { const ts = [...row.querySelectorAll('[data-k]')]; let k = ts.findIndex(t => { const r = t.getBoundingClientRect(); return x < r.left + r.width / 2; }); return k < 0 ? ts.length : k; };
    const move = e => { if (!drag || drag.id !== e.pointerId) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { drag.moved = true; row.classList.add('is-drop'); } };
    const up = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; row.classList.remove('is-drop');
      setTimeout(() => { drag = null; });
      if (!d.moved) return;
      const r = row.getBoundingClientRect(), inside = e.clientY >= r.top - 20 && e.clientY <= r.bottom + 20;
      if (d.from === 'bank' && inside) { if (st.fam && st.word.length >= 2) st.word = []; addAt(d.i, Math.min(at(e.clientX), st.word.length)); }
      else if (d.from === 'word') { const [x] = st.word.splice(d.k, 1); if (inside) { st.word.splice(Math.min(at(e.clientX), st.word.length), 0, x); T.commit(word()); } else T.commit(fill(W.removed, { l: letter(x) })); }
    };
    body.onpointermove = move; body.onpointerup = up;
  }
  return T.finish();
}

// ================================================================ 11. graphic organizers (the teacher's own words; a student's copy is theirs)
const ORG_HEADS = { venn: ['a', 'both', 'b'], tchart: ['left', 'right'], kwl: ['know', 'want', 'learned'], story: ['characters', 'setting', 'problem', 'events', 'solution'], main: ['idea', 'detail', 'detail', 'detail'] };
function organizer(body, s, ctx) {
  const T = shell(body, s, ctx, 'organizer'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  const count = () => ({ venn: 3, tchart: 2, kwl: 3, story: 5, main: 4 }[st.kind] || st.n);
  const fit = () => { st.boxes = Array.from({ length: count() }, (_, i) => st.boxes[i] || { h: '', t: '' }); };
  fit();
  const kind = rowSelect(W.kind, ['venn', 'tchart', 'kwl', 'story', 'main', 'seq'].map(k => [k, W[k]]), st.kind, v => { st.kind = v; fit(); T.commit(W[v]); });
  T.top.appendChild(kind);
  const canEdit = !ctx.editing && (ctx.teacher || ctx.own || ctx.copy);
  const edit = ibtn('✏️', W.edit);
  if (canEdit) T.foot.appendChild(edit);
  const headOf = i => st.boxes[i].h || (st.kind === 'seq' ? fill(W.step, { n: i + 1 }) : st.kind === 'main' && i ? `${W.detail} ${i}` : W[ORG_HEADS[st.kind][i]]);
  const editSheet = (focus = 0) => {
    const sh = ctx.sheet({ title: fill(ctx.common.optionsFor, { name: W[st.kind] }), content: '' });
    const f = el('form', 'stack dt-orgform'); sh.el.querySelector('.sheet-body').appendChild(f);
    f.appendChild(el('p', 'small muted', W.note));
    const title = field(f, W.title, Object.assign(el('input', 'input'), { maxLength: 60, value: st.title })); title.dir = 'auto';
    const ins = st.boxes.map((b, i) => {
      const fs = el('fieldset', 'dt-orgset'); fs.appendChild(el('legend', null, headOf(i)));
      const h = field(fs, W.heading, Object.assign(el('input', 'input'), { maxLength: 40, value: b.h, placeholder: headOf(i) })); h.dir = 'auto';
      const t = field(fs, W.text, Object.assign(el('textarea', 'input'), { maxLength: 400, rows: 3, value: b.t })); t.dir = 'auto';
      f.appendChild(fs); return { h, t };
    });
    const row = el('div', 'row'), ok = el('button', 'btn btn-primary', W.save); ok.type = 'submit'; row.appendChild(ok); f.appendChild(row);
    f.addEventListener('submit', e => { e.preventDefault(); st.title = title.value.trim().slice(0, 60); ins.forEach((x, i) => { st.boxes[i] = { h: x.h.value.trim().slice(0, 40), t: x.t.value.replace(/\r/g, '').slice(0, 400) }; }); sh.close(); T.commit(W.save); });
    (ins[focus] ? ins[focus].t : title).focus();
  };
  edit.addEventListener('click', () => editSheet());
  T.draw = () => {
    kind.value = st.kind;
    T.stage.textContent = '';
    const wrap = el('div', `dt-org dt-org-${st.kind}`);
    if (st.title) { const h = el('div', 'dt-orgtitle', st.title); h.dir = 'auto'; wrap.appendChild(h); }
    const grid = el('div', 'dt-orggrid'); grid.style.setProperty('--n', st.boxes.length);
    if (st.kind === 'venn') { const bg = svg('svg', { viewBox: '0 0 300 160', class: 'dt-vennbg', 'aria-hidden': 'true', preserveAspectRatio: 'none' }); bg.append(svg('ellipse', { cx: 108, cy: 80, rx: 104, ry: 76, class: 'dt-venn dt-venn0' }), svg('ellipse', { cx: 192, cy: 80, rx: 104, ry: 76, class: 'dt-venn dt-venn1' })); grid.appendChild(bg); }
    st.boxes.forEach((b, i) => {
      const box = el(canEdit ? 'button' : 'div', `dt-orgbox dt-ob${i}`);
      if (canEdit) { box.type = 'button'; box.setAttribute('aria-label', `${headOf(i)}: ${W.edit}`); box.addEventListener('click', () => editSheet(i)); }
      const h = el('div', 'dt-orgh', headOf(i)); h.dir = 'auto';
      const lines = String(b.t || '').split('\n').map(x => x.trim()).filter(Boolean);
      const list = el('ul', 'dt-orgl dw-scroll'); list.dir = 'auto';
      for (const line of lines) { const li = el('li', null, line); li.dir = 'auto'; list.appendChild(li); }
      if (!lines.length) list.appendChild(el('li', 'dt-orgempty', '…'));
      box.append(h, list);
      grid.appendChild(box);
      if (st.kind === 'seq' && i < st.boxes.length - 1) { const a = el('span', 'dt-orgarrow', '→'); a.setAttribute('aria-hidden', 'true'); grid.appendChild(a); }
    });
    wrap.appendChild(grid);
    T.stage.appendChild(wrap);
    T.read.textContent = '';
    if (!st.boxes.some(b => b.t.trim()) && canEdit) T.read.appendChild(el('div', 'dt-sub', W.editHint));
  };
  return T.finish({
    options: box => {
      if (st.kind !== 'seq') { box.appendChild(el('p', 'small muted', W.note)); return; }
      const n = field(box, W.boxes, selectOf([3, 4, 5, 6].map(x => [x, String(x)]), st.n));
      n.addEventListener('change', () => { st.n = +n.value; fit(); T.commit(); });
    },
  });
}

// ================================================================ 12. maps (our own simple outlines; no map tiles or services)
const MW = 1000, MH = 500;
function map(body, s, ctx) {
  const T = shell(body, s, ctx, 'map'), { W, st } = T;
  const fill = (msg, vars) => format(msg, vars, ctx.intl);
  let cur = { x: 500, y: 250 }, svgEl, drag = null;
  const kind = T.seg(W.world, [['world', W.world, null, '🌍'], ['grid', W.grid, null, '🧭']], () => st.kind, v => { st.kind = v; T.commit(W[v]); });
  T.top.appendChild(kind);
  const pin = ibtn('📍', W.pin), clear = ibtn('🧹', W.clear);
  T.foot.append(pin, clear);
  const where = p => (st.kind === 'grid' ? fill(W.square, { s: G.gridRef(p.x, p.y) }) : (c => (c ? W[c] : W.sea))(G.continentAt(p.x, p.y)));
  const drop = p => { if (st.pins.length >= 12) return; st.pins.push({ x: Math.round(p.x), y: Math.round(p.y), l: '' }); T.commit(fill(W.placed, { n: st.pins.length, w: where(p) })); };
  pin.addEventListener('click', () => { drop(cur); svgEl?.focus(); });
  clear.addEventListener('click', () => { st.pins = []; T.commit(W.clear); });
  T.draw = () => {
    kind.sync(); pin.disabled = st.pins.length >= 12; clear.disabled = !st.pins.length;
    T.stage.textContent = '';
    const k = T.scale(MW, MH), ts = k > 0 ? Math.max(1, (projecting() ? 13.5 : 12.5) / (16 * k)) : 1;
    svgEl = svg('svg', { viewBox: `0 0 ${MW} ${MH}`, class: `dt-map dt-map-${st.kind}`, role: 'application', tabindex: ctx.editing ? '-1' : '0', 'aria-label': `${W[st.kind]}. ${W.hint}`, 'aria-roledescription': W.cursor, style: `--ts:${ts.toFixed(3)}` });
    svgEl.setAttribute('direction', 'ltr');
    svgEl.appendChild(svg('rect', { x: 0, y: 0, width: MW, height: MH, rx: 18, class: st.kind === 'world' ? 'dt-sea' : 'dt-gpaper' }));
    if (st.kind === 'world') {
      for (const id of G.CONTINENT_IDS) for (const p of G.CONTINENTS[id]) svgEl.appendChild(svg('polygon', { points: p.map(q => q.join(',')).join(' '), class: `dt-land dt-land-${id}` }));
      if (st.names) {
        // A name never sits under a pin, a pin's label or another name: it moves below or above them, and on a map too
        // small for every name the oceans' names give way first (the continents' are placed first). Pins always show.
        const boxes = st.pins.flatMap(p => [[p.x - 20 * ts, p.y - 54 * ts, p.x + 20 * ts, p.y + 2], ...(p.l ? [[p.x + 22 * ts, p.y - 48 * ts, p.x + (26 + [...p.l].length * 10) * ts, p.y - 20 * ts]] : [])]);
        const hit = b => b[0] < 4 || b[2] > MW - 4 || b[1] < 2 || b[3] > MH - 2 || boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
        for (const [id, [x, y0]] of Object.entries(G.PLACE_LABELS)) {
          const w = [...W[id]].length * 9.5 * ts, h = 18 * ts;
          const y = [0, 30, -30, 56, -56].map(d => y0 + d * ts).find(yy => !hit([x - w / 2, yy - h, x + w / 2, yy + 5 * ts]));
          if (y === undefined) continue;
          boxes.push([x - w / 2, y - h, x + w / 2, y + 5 * ts]);
          svgEl.appendChild(svg('text', { x, y, 'text-anchor': 'middle', class: G.OCEAN_IDS.includes(id) ? 'dt-ocean' : 'dt-cont' }, W[id]));
        }
      }
    } else {
      let g = ''; for (let x = 100; x < MW; x += 100) g += `M${x} 0V${MH}`; for (let y = 100; y < MH; y += 100) g += `M0 ${y}H${MW}`;
      svgEl.appendChild(svg('path', { d: g, class: 'dt-gridl' }));
      for (let c = 0; c < G.GRID_COLS; c++) svgEl.appendChild(svg('text', { x: c * 100 + 50, y: 34, 'text-anchor': 'middle', class: 'dt-gref' }, String.fromCharCode(65 + c)));
      for (let r = 0; r < G.GRID_ROWS; r++) svgEl.appendChild(svg('text', { x: 22, y: r * 100 + 58, 'text-anchor': 'middle', class: 'dt-gref' }, r + 1));
      // A compass rose of our own (N, E, S, W in the reader's language).
      const rose = svg('g', { transform: 'translate(880 390)', class: 'dt-rose' });
      rose.append(svg('circle', { r: 58, class: 'dt-rosebg' }), svg('path', { d: 'M0 -48L10 -10L48 0L10 10L0 48L-10 10L-48 0L-10 -10Z', class: 'dt-rosestar' }), svg('path', { d: 'M0 -48L10 -10L0 0L-10 -10Z', class: 'dt-rosen' }));
      for (const [k, x, y] of [['n', 0, -60], ['e', 74, 7], ['s', 0, 80], ['w', -74, 7]]) rose.appendChild(svg('text', { x, y, 'text-anchor': 'middle', class: 'dt-rosel' }, W[k]));
      svgEl.appendChild(rose);
    }
    st.pins.forEach((p, i) => {
      const g = svg('g', { transform: `translate(${p.x} ${p.y}) scale(${ts.toFixed(3)})`, class: 'dt-mpin', 'data-pin': i });
      g.append(svg('path', { d: 'M0 0C-6 -14 -18 -22 -18 -34A18 18 0 1 1 18 -34C18 -22 6 -14 0 0Z', class: 'dt-pinbody' }), svg('text', { y: -28, 'text-anchor': 'middle', class: 'dt-pinn' }, i + 1));
      if (p.l) { const t = svg('text', { x: 24, y: -28, class: 'dt-pinl' }, p.l); t.setAttribute('direction', 'auto'); g.appendChild(t); }
      svgEl.appendChild(g);
    });
    if (!ctx.editing) svgEl.appendChild(svg('path', { d: `M${cur.x - 18} ${cur.y}h36M${cur.x} ${cur.y - 18}v36`, class: 'dt-cross' }));
    const box = el('div', 'dt-mapwrap'); box.appendChild(svgEl); T.stage.appendChild(box);
    T.read.textContent = '';
    const lastPin = st.pins[st.pins.length - 1];
    T.read.appendChild(el('div', 'dt-sub', lastPin ? fill(W.placed, { n: st.pins.length, w: where(lastPin) }) : W.hint));
    if (!ctx.editing) wire();
  };
  function wire() {
    svgEl.addEventListener('keydown', e => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      const stepK = st.kind === 'grid' ? 100 : e.shiftKey ? 50 : 20;
      if (d) { e.preventDefault(); cur = { x: Math.max(0, Math.min(MW, cur.x + d[0] * stepK)), y: Math.max(0, Math.min(MH, cur.y + d[1] * stepK)) }; if (st.kind === 'grid') cur = { x: Math.floor(cur.x / 100) * 100 + 50, y: Math.floor(Math.min(MH - 1, cur.y) / 100) * 100 + 50 }; T.draw(); svgEl.focus(); ctx.say(where(cur)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(cur); svgEl.focus(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (st.pins.length) { st.pins.pop(); T.commit(W.removed); svgEl.focus(); } }
    });
    // Tap to put a pin down; drag a pin to move it.
    svgEl.addEventListener('pointerdown', e => {
      const q = svgPoint(svgEl, e), hit = e.target.closest('[data-pin]');
      drag = { id: e.pointerId, pin: hit ? +hit.dataset.pin : -1, moved: false };
      cur = { x: Math.max(0, Math.min(MW, q.x)), y: Math.max(0, Math.min(MH, q.y)) };
      svgEl.setPointerCapture(e.pointerId); e.preventDefault(); svgEl.focus();
    });
    svgEl.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId || drag.pin < 0) return;
      const q = svgPoint(svgEl, e), p = st.pins[drag.pin]; p.x = Math.round(Math.max(0, Math.min(MW, q.x))); p.y = Math.round(Math.max(30, Math.min(MH, q.y))); drag.moved = true;
      const g = svgEl.querySelector(`[data-pin="${drag.pin}"]`); if (g) g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${(+getComputedStyle(svgEl).getPropertyValue('--ts') || 1).toFixed(3)})`);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null;
      if (d.pin >= 0) { if (d.moved) T.commit(fill(W.placed, { n: d.pin + 1, w: where(st.pins[d.pin]) })); else T.draw(); }
      else drop(cur);
      svgEl.focus();
    };
    svgEl.addEventListener('pointerup', end); svgEl.addEventListener('pointercancel', () => { drag = null; T.draw(); });
  }
  return T.finish({
    options: box => {
      checkRow(box, W.names, st.names, v => { st.names = v; T.commit(); });
      if (!st.pins.length) { box.appendChild(el('p', 'small muted', W.none)); return; }
      box.appendChild(el('h3', 'dash-h3', W.pins));
      st.pins.forEach((p, i) => {
        const row = el('div', 'dt-pinrow');
        const inp = field(row, `${W.label} ${i + 1} (${where(p)})`, Object.assign(el('input', 'input'), { maxLength: 24, value: p.l })); inp.dir = 'auto';
        inp.addEventListener('change', () => { p.l = inp.value.trim().slice(0, 24); T.commit(); });
        const rm = btn(`🗑️ ${W.remove}`); rm.addEventListener('click', () => { st.pins.splice(i, 1); row.remove(); T.commit(W.removed); });
        row.appendChild(rm); box.appendChild(row);
      });
    },
  });
}

/** id -> renderer (merged into public/js/dash-widgets.js RENDER). */
export const TOOLS4 = { geoboard, pattern, angle, solids, transform, balance, algebra, coins, chance, letters, organizer, map };
