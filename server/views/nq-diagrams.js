// More drawn math diagrams for the course slides (Number Quest's CPA pictorial step), in the same 100 x 56.25 space
// and on the same Cream ground as the diagrams in views/courses.js visualSvg, which hands these types to this file:
//   grid    a coordinate grid: two numbered axes from a labelled origin (0, 0), gridlines, and a point reached by
//           its walk, first number right, second number up (6.3);
//   squares one or more rectangles tiled with unit squares, each with its side counts, its name under it, and,
//           where `fence` is set, its perimeter drawn as a fence (6.2);
//   lines   pairs of lines side by side: parallel (with matching arrow marks), perpendicular (with the square
//           corner marked), or just crossing (6.3);
//   chart   a bar chart with a numbered scale and gridlines, each bar named under it and counted on top (7.1);
//   table   a small table, a timetable, with one row picked out (5.2).
// Each layout is fixed per type, so authored focus boxes land on the part they name, and diagramExtent says where
// the drawing sits top to bottom, the band the slide frame shows (the visualExtent contract in courses.js).
// Every text size is 3.4 units or more: about 12 px on a 390 px phone.
const INK = '#141414', LEAF = '#1F9D63', GROUND = '#FFFDF2', LINE = '#C9C2A6';
const TONES = ['#66C792', '#FFD23F', '#8FC1F5', '#F2A65A'];
const r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A text line; `halo` paints a ground-coloured outline under the letters where they sit on lines. */
const tx = (x, y, str, size, anchor = 'middle', weight = 700, fill = INK, halo = false) =>
  `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}"${halo ? ` stroke="${GROUND}" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(str)}</text>`;
const tTop = (y, size) => y - 0.84 * size, tBot = (y, size) => y + 0.28 * size;
/** A caption's size: the standard 3.8, smaller only for a long one (the labelFs rule in courses.js). */
const capFs = s => Math.min(3.8, 168 / String(s).length);
/** An arrowhead at (x, y) pointing along (dx, dy). */
const head = (x, y, dx, dy, fill = INK, k = 2.2) => {
  const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  return `<path d="M${r2(x)} ${r2(y)} L${r2(x - ux * k - uy * k * 0.55)} ${r2(y - uy * k + ux * k * 0.55)} L${r2(x - ux * k + uy * k * 0.55)} ${r2(y - uy * k - ux * k * 0.55)} Z" fill="${fill}"/>`;
};

import { DIAGRAM_TYPES as TYPES } from '../services/diagrams.js';
export const DIAGRAM_TYPES = new Set(TYPES);

// ---------------------------------------------------------------------------------------------- grid
/** The grid's geometry: origin (x0, y0) and the unit u, so the drawing and its extent agree. */
const gridGeo = v => { const u = Math.min(8, 40 / v.cols, 36 / v.rows); return { u, x0: 50 - (v.cols * u) / 2, y0: 48 }; };
function gridSvg(v) {
  const { u, x0, y0 } = gridGeo(v), X = i => x0 + i * u, Y = j => y0 - j * u;
  let s = '';
  for (let i = 1; i <= v.cols; i++) s += `<line x1="${r2(X(i))}" y1="${y0}" x2="${r2(X(i))}" y2="${r2(Y(v.rows))}" stroke="${LINE}" stroke-width="0.4"/>`;
  for (let j = 1; j <= v.rows; j++) s += `<line x1="${x0}" y1="${r2(Y(j))}" x2="${r2(X(v.cols))}" y2="${r2(Y(j))}" stroke="${LINE}" stroke-width="0.4"/>`;
  // the two axes, each with its arrow and its direction word
  const xe = X(v.cols) + 4, ye = Y(v.rows) - 4;
  s += `<line x1="${x0}" y1="${y0}" x2="${r2(xe)}" y2="${y0}" stroke="${INK}" stroke-width="0.8"/>` + head(xe + 0.6, y0, 1, 0);
  s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${r2(ye)}" stroke="${INK}" stroke-width="0.8"/>` + head(x0, ye - 0.6, 0, -1);
  s += tx(xe + 2.4, y0 + 1.2, v.xName || 'right', 3.4, 'start', 700, LEAF) + tx(x0, ye - 3.6, v.yName || 'up', 3.4, 'middle', 700, LEAF);
  for (let i = 1; i <= v.cols; i++) s += `<line x1="${r2(X(i))}" y1="${y0 - 0.9}" x2="${r2(X(i))}" y2="${y0 + 0.9}" stroke="${INK}" stroke-width="0.6"/>` + tx(X(i), y0 + 5, i, 3.6);
  for (let j = 1; j <= v.rows; j++) s += `<line x1="${x0 - 0.9}" y1="${r2(Y(j))}" x2="${x0 + 0.9}" y2="${r2(Y(j))}" stroke="${INK}" stroke-width="0.6"/>` + tx(x0 - 2.2, Y(j) + 1.3, j, 3.6, 'end');
  // the origin: a dot and its address
  s += `<circle cx="${x0}" cy="${y0}" r="1.1" fill="${INK}"/>` + tx(x0 - 2.2, y0 + 5, '(0, 0)', 3.6, 'end', 800);
  const p = v.point;
  if (p) {
    const px = X(p.x), py = Y(p.y);
    if (v.walk) {
      // the walk: right along the bottom first, then up, each leg named
      s += `<path d="M${x0} ${y0} H${r2(px)} V${r2(py + 2.6)}" fill="none" stroke="${LEAF}" stroke-width="1.2" stroke-linejoin="round"/>` + head(px, py + 2, 0, -1, LEAF, 2);
      s += tx((x0 + px) / 2, y0 - 1.8, `${p.x} right`, 3.6, 'middle', 800, LEAF, true);
      s += tx(px + 1.8, (y0 + py) / 2 + 1.3, `${p.y} up`, 3.6, 'start', 800, LEAF, true);
    }
    s += `<circle cx="${r2(px)}" cy="${r2(py)}" r="1.9" fill="#FFD23F" stroke="${INK}" stroke-width="0.6"/>`;
    s += tx(px + 2.4, py - 2.2, p.label || `(${p.x}, ${p.y})`, 4.2, 'start', 800, INK, true);
  }
  return s;
}
const gridExtent = v => { const { u, y0 } = gridGeo(v); return [tTop(y0 - v.rows * u - 4 - 3.6, 3.4), tBot(y0 + 5, 3.6)]; };

// ---------------------------------------------------------------------------------------------- squares
/** One unit for every rectangle (so equal fences look equal), the rectangles side by side with a gap. */
function squaresGeo(v) {
  const sh = v.shapes, gap = 10, cols = sh.reduce((a, q) => a + q.cols, 0), rows = Math.max(...sh.map(q => q.rows));
  const u = Math.min(7, (76 - gap * (sh.length - 1)) / cols, 28 / rows);
  const w = cols * u + gap * (sh.length - 1), top = v.label ? 15 : 11;
  let x = 50 - w / 2 + 3; // the side counts take a little room on the left
  return { u, top, boxes: sh.map(q => { const b = { x, y: top + (rows - q.rows) * u, w: q.cols * u, h: q.rows * u, q }; x += q.cols * u + gap; return b; }), bottom: top + rows * u };
}
function squaresSvg(v) {
  const g = squaresGeo(v);
  let s = v.label ? tx(50, 6.5, v.label, capFs(v.label)) : '';
  g.boxes.forEach((b, k) => {
    const { q } = b, tone = TONES[(q.tone ?? k) % TONES.length];
    for (let r = 0; r < q.rows; r++) for (let c = 0; c < q.cols; c++) {
      s += `<rect x="${r2(b.x + c * g.u)}" y="${r2(b.y + r * g.u)}" width="${r2(g.u)}" height="${r2(g.u)}" fill="${tone}" stroke="${INK}" stroke-width="0.4"/>`;
    }
    if (v.fence) s += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${LEAF}" stroke-width="1.3"/>`;
    s += tx(b.x + b.w / 2, b.y - 1.6, q.top || q.cols, 3.6) + tx(b.x - 1.6, b.y + b.h / 2 + 1.3, q.side || q.rows, 3.6, 'end');
    if (q.name) s += tx(b.x + b.w / 2, g.bottom + 5, q.name, 3.6, 'middle', 800, LEAF);
  });
  return s;
}
const squaresExtent = v => {
  const g = squaresGeo(v), firstTop = Math.min(...g.boxes.map(b => b.y));
  return [v.label ? tTop(6.5, capFs(v.label)) : tTop(firstTop - 1.6, 3.6), g.boxes.some(b => b.q.name) ? tBot(g.bottom + 5, 3.6) : g.bottom];
};

// ---------------------------------------------------------------------------------------------- lines
/** Panels of line pairs across 6-94: each drawn in the band y 9-37, its name under it at y 45. */
function linesSvg(v) {
  const n = v.items.length, cw = 88 / n;
  return v.items.map((it, i) => {
    const cx = 6 + cw * (i + 0.5), half = Math.min(15, cw / 2 - 4), tone = TONES[i % TONES.length];
    let s = `<rect x="${r2(6 + cw * i + 1.5)}" y="8" width="${r2(cw - 3)}" height="30" rx="1.8" fill="#FFFFFF" stroke="${INK}" stroke-width="0.5"/>`;
    const seg = (x1, y1, x2, y2, both = true) => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${INK}" stroke-width="1"/>` + head(x2, y2, x2 - x1, y2 - y1, INK, 1.8) + (both ? head(x1, y1, x1 - x2, y1 - y2, INK, 1.8) : '');
    if (it.kind === 'parallel') {
      // two rails, slightly tilted, the same distance apart all the way; matching arrow marks say "parallel"
      for (const dy of [-5.5, 5.5]) {
        const y1 = 23 + dy + 2.5, y2 = 23 + dy - 2.5;
        s += seg(cx - half, y1, cx + half, y2);
        const mx = cx, my = (y1 + y2) / 2;
        s += `<path d="M${r2(mx - 0.9)} ${r2(my - 1.3)} L${r2(mx + 0.9)} ${r2(my - 0.12)} L${r2(mx - 0.9)} ${r2(my + 1.06)}" fill="none" stroke="${LEAF}" stroke-width="0.7"/>`;
      }
    } else if (it.kind === 'perpendicular') {
      // a level line and an upright one meeting at a square corner, the corner marked
      s += seg(cx - half, 30, cx + half, 30) + seg(cx - half * 0.35, 31.5, cx - half * 0.35, 12.5);
      const k = cx - half * 0.35, m = 2.6;
      s += `<path d="M${r2(k)} ${30 - m} H${r2(k + m)} V30" fill="${tone}" fill-opacity="0.6" stroke="${LEAF}" stroke-width="0.7"/>`;
    } else {
      // two lines that cross, but not at a square corner
      s += seg(cx - half, 30, cx + half, 16) + seg(cx - half, 18, cx + half, 28);
    }
    return s + tx(cx, 45, it.name, Math.min(3.8, (cw - 4) / (String(it.name).length * 0.56)), 'middle', 800);
  }).join('');
}
const linesExtent = v => [8, tBot(45, 3.8)];

// ---------------------------------------------------------------------------------------------- chart
const chartGeo = v => { const n = v.bars.length, x0 = 20, x1 = 92, bw = Math.min(14, (x1 - x0) / n * 0.6); return { x0, x1, y0: 44, top: v.label ? 15 : 9, bw, slot: (x1 - x0) / n }; };
function chartSvg(v) {
  const g = chartGeo(v), Y = val => g.y0 - (val / v.max) * (g.y0 - g.top);
  let s = v.label ? tx(50, 6.5, v.label, capFs(v.label)) : '';
  for (let t = 0; t <= v.max; t += v.step) {
    s += `<line x1="${g.x0}" y1="${r2(Y(t))}" x2="${g.x1}" y2="${r2(Y(t))}" stroke="${t ? LINE : INK}" stroke-width="${t ? 0.4 : 0.8}"/>` + tx(g.x0 - 2, Y(t) + 1.2, t, 3.4, 'end', 700);
  }
  s += `<line x1="${g.x0}" y1="${g.y0}" x2="${g.x0}" y2="${r2(g.top - 2)}" stroke="${INK}" stroke-width="0.8"/>`;
  v.bars.forEach((b, i) => {
    const cx = g.x0 + g.slot * (i + 0.5), y = Y(b.value);
    s += `<rect x="${r2(cx - g.bw / 2)}" y="${r2(y)}" width="${r2(g.bw)}" height="${r2(g.y0 - y)}" fill="${TONES[(b.tone ?? i) % TONES.length]}" stroke="${INK}" stroke-width="0.6"/>`;
    s += tx(cx, y - 1.5, b.value, 3.8, 'middle', 800, INK, true) + tx(cx, g.y0 + 5, b.label, 3.6, 'middle', 700);
  });
  if (v.unit) s += tx(4, (g.top + g.y0) / 2, v.unit, 3.4, 'middle', 700, LEAF).replace('<text ', `<text transform="rotate(-90 4 ${r2((g.top + g.y0) / 2)})" `);
  return s;
}
const chartExtent = v => { const g = chartGeo(v); return [v.label ? tTop(6.5, capFs(v.label)) : g.top - 4, tBot(g.y0 + 5, 3.6)]; };

// ---------------------------------------------------------------------------------------------- table
const tableGeo = v => { const rh = 7.6, top = v.label ? 12 : 8; return { rh, top, cw: 88 / v.head.length, bottom: top + rh * (v.rows.length + 1) }; };
function tableSvg(v) {
  const g = tableGeo(v);
  let s = v.label ? tx(50, 6.5, v.label, capFs(v.label)) : '';
  const rowsAll = [v.head, ...v.rows];
  rowsAll.forEach((row, r) => {
    const y = g.top + r * g.rh, pick = r - 1 === v.mark;
    s += `<rect x="6" y="${r2(y)}" width="88" height="${g.rh}" fill="${r === 0 ? '#E8F5EC' : pick ? '#FFF1B8' : '#FFFFFF'}" stroke="${INK}" stroke-width="0.5"/>`;
    row.forEach((cell, c) => {
      const x = 6 + c * g.cw;
      if (c) s += `<line x1="${r2(x)}" y1="${r2(y)}" x2="${r2(x)}" y2="${r2(y + g.rh)}" stroke="${INK}" stroke-width="0.4"/>`;
      s += tx(x + g.cw / 2, y + g.rh / 2 + 1.35, cell, 3.8, 'middle', r === 0 ? 800 : 700, r === 0 ? LEAF : INK);
    });
  });
  if (v.mark != null) s += `<rect x="6" y="${r2(g.top + (v.mark + 1) * g.rh)}" width="88" height="${g.rh}" fill="none" stroke="${LEAF}" stroke-width="1.1"/>`;
  return s;
}
const tableExtent = v => { const g = tableGeo(v); return [v.label ? tTop(6.5, capFs(v.label)) : g.top, g.bottom]; };

const SVG = { grid: gridSvg, squares: squaresSvg, lines: linesSvg, chart: chartSvg, table: tableSvg };
const EXTENT = { grid: gridExtent, squares: squaresExtent, lines: linesExtent, chart: chartExtent, table: tableExtent };
/** The SVG body of one of these diagrams (a string of SVG elements in the 100 x 56.25 space). */
export const diagramSvg = v => SVG[v.type](v);
/** Where it sits top to bottom: [a, b] in the 100 x 56.25 space. */
export const diagramExtent = v => EXTENT[v.type](v).map(r2);
