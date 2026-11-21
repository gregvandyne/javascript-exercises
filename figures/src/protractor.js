// Oomba Figures: reading an angle with a protractor. A half-circle protractor with its two scales (the inner one counts
// up from 0 on the right, the outer one from 0 on the left, every degree ticked and every 10 numbered) lies on an angle
// with its center on the vertex and its base line along one ray. The rays are drawn at their true directions, so the
// reading is true by construction: the ray along the base line sits on 0 of one scale and the other ray on the angle's
// measure on that same scale (and on 180 minus it on the other, the usual mix-up). An angle that does not start on 0
// ("start") is read as the difference of two readings. Oomba's own code (the source had no protractor).
import { node, label, line, frame, palette, isNum, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathProblem } from './mathtext.js';

const PR_KEYS = ['kind', 'hide', 'angle', 'base', 'start', 'names', 'reading'];
function prRead(d) {
  const out = [], odd = Object.keys(d).filter(k => !PR_KEYS.includes(k));
  if (odd.length) return { problems: [`protractor does not take "${odd[0]}" (it takes ${PR_KEYS.slice(2).join(', ')})`] };
  if (!Number.isInteger(d.angle) || d.angle < 1 || d.angle > 180) return { problems: ['"angle" must be a whole number of degrees from 1 to 180 (a protractor reads to the nearest degree)'] };
  const base = d.base === undefined ? 'right' : d.base;
  if (!['right', 'left'].includes(base)) out.push('"base" must be "right" (the first ray points right, read on the inner scale) or "left" (it points left, read on the outer scale)');
  const start = d.start === undefined ? 0 : d.start;
  if (!Number.isInteger(start) || start < 0 || start + d.angle > 180) out.push(`"start" (where the first ray crosses the scale, counting from the base line's 0) must be a whole number from 0 to ${180 - d.angle}`);
  if (d.reading !== undefined && typeof d.reading !== 'boolean') out.push('"reading" must be true or false (write the angle\'s measure by its arc)');
  if (d.names !== undefined) {
    if (!Array.isArray(d.names) || d.names.length !== 3) out.push('"names" must be three names: a point on the first ray, the vertex, a point on the second ray (like ["A", "B", "C"])');
    else d.names.forEach((n, i) => { const why = mathProblem(n, `name ${i + 1}`); if (why) out.push(why); });
  }
  if (out.length) return { problems: out };
  // directions on the page, in degrees counterclockwise from the right; the inner scale reads the direction itself
  const dirs = base === 'right' ? [start, start + d.angle] : [180 - start, 180 - start - d.angle];
  return { problems: [], angle: d.angle, base, start, dirs };
}
export const protractor = {
  check(d) { return prRead(d).problems; },
  /** The angle, its kind, where each ray crosses the inner and outer scales, and which scale reads the angle from 0. */
  solve(d) {
    const r = prRead(d); if (r.problems.length) return null;
    const kind = r.angle < 90 ? 'acute' : r.angle === 90 ? 'right' : r.angle < 180 ? 'obtuse' : 'straight';
    return { angle: r.angle, kind, rays: r.dirs.map(t => ({ inner: t, outer: 180 - t })), scale: r.base === 'right' ? 'inner' : 'outer', reading: r.angle };
  },
  draw(d, o) {
    const r = prRead(d), P = palette(o), lang = o.lang, W = figWords(lang), R = 190, cx = 40 + R + 50, cy = 40 + R + 60, kids = [];
    const at = (deg, rad) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy - rad * Math.sin((deg * Math.PI) / 180)];
    const innerC = o.print ? P.ink : P.blue, outerC = o.print ? P.ink : P.red;
    // the rays first: the protractor lies on top of them, see-through
    const rayC = o.print ? P.ink : P.greenInk;
    r.dirs.forEach(t => { const [x, y] = at(t, R + 54); kids.push(line(cx, cy, x, y, rayC, 3.2, { class: 'of-ray' })); });
    kids.push(node('path', { d: `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy} Z`, fill: o.print ? '#FFFFFF' : '#E9F3FA', 'fill-opacity': o.print ? 0.55 : 0.6, stroke: P.ink, 'stroke-width': 2, class: 'of-protractor' }));
    kids.push(node('path', { d: `M${cx - R + 70},${cy} A${R - 70},${R - 70} 0 0 1 ${cx + R - 70},${cy}`, fill: 'none', stroke: P.ink2, 'stroke-width': 1 }));
    // every degree ticked, every 5 longer, every 10 longest and numbered on both scales
    const ticks = [];
    for (let t = 0; t <= 180; t++) { const len = t % 10 === 0 ? 16 : t % 5 === 0 ? 11 : 6, [x1, y1] = at(t, R), [x2, y2] = at(t, R - len); ticks.push(`M${r2(x1)},${r2(y1)} L${r2(x2)},${r2(y2)}`); }
    kids.push(node('path', { d: ticks.join(' '), stroke: P.ink, 'stroke-width': 1.1, class: 'of-ticks' }));
    for (let t = 0; t <= 180; t += 10) {
      const end = t === 0 || t === 180, [ox, oy0] = at(t, R - 28), [ix0, iy0] = at(t, R - 50), oy = end ? oy0 - 11 : oy0, iy = end ? iy0 - 11 : iy0, ix = end ? ix0 + (t ? 12 : -12) : ix0;   // 0 and 180 sit upright just above the base line
      kids.push(node('text', { x: r2(ox), y: r2(oy), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 13, 'font-weight': 700, fill: outerC, transform: end ? null : `rotate(${r2(90 - t)} ${r2(ox)} ${r2(oy)})`, class: 'of-outer' }, String(180 - t)));
      kids.push(node('text', { x: r2(ix), y: r2(iy), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, 'font-weight': 600, fill: innerC, transform: end ? null : `rotate(${r2(90 - t)} ${r2(ix)} ${r2(iy)})`, class: 'of-inner' }, String(t)));
    }
    kids.push(line(cx - R, cy, cx + R, cy, P.ink, 2), line(cx, cy - 10, cx, cy, P.ink, 1.5), node('circle', { cx, cy, r: 3.5, fill: P.ink, class: 'of-vertex' }));
    // the angle's arc, and its measure when asked (the answer: hide "reading")
    const [a0, a1] = [Math.min(...r.dirs), Math.max(...r.dirs)], [sx, sy] = at(a0, 30), [ex, ey] = at(a1, 30);
    kids.push(node('path', { d: `M${r2(sx)},${r2(sy)} A30,30 0 0 0 ${r2(ex)},${r2(ey)}`, fill: 'none', stroke: rayC, 'stroke-width': 2.4, class: 'of-arc' }));
    if (d.reading && o.hide !== true && !hides(o, 'reading')) {
      const [lx, ly] = at((a0 + a1) / 2, 58), b = mathBox(r.angle, 17, { lang, suffix: '°' });
      kids.push(node('rect', { x: lx - b.w / 2 - 4, y: ly - b.asc, width: b.w + 8, height: b.asc + b.desc + 4, rx: 4, fill: P.paper, 'fill-opacity': 0.92 }), mathNode(b, lx - b.w / 2, ly + (b.asc - b.desc) / 2, { color: P.ink, cls: 'of-reading' }));
    }
    if (d.names) {
      const place = (t, rad, nm) => { const b = mathBox(nm, 20, { lang }); if (!b) return; const [x, y] = at(t, rad); kids.push(mathNode(b, x - b.w / 2, y + (b.asc - b.desc) / 2, { color: P.ink, cls: 'of-name', halo: P.paper })); };
      place(r.dirs[0], R + 70, d.names[0]); place(r.dirs[1], R + 70, d.names[2]);
      const b = mathBox(d.names[1], 20, { lang }); if (b) kids.push(mathNode(b, cx - b.w / 2, cy + 24, { color: P.ink, cls: 'of-name' }));
    }
    return frame(cx * 2, cy + 44, kids, { ...o, kind: 'protractor' }, o.title || W('protractor'));
  },
};
export const PROTRACTOR_KINDS = { protractor };
