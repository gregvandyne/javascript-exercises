// Oomba Figures: electric and magnetic field lines (1.7.0, the physics pack). One charge, two opposite or two like
// charges, any few charges of the teacher's own, parallel plates, a bar magnet or a straight wire seen end-on, with
// the field lines traced through the real field (ported/fields.js) and their arrows. Named points (P, Q) are marked,
// and OF.solve gives the field's direction and relative strength at each, which point's field is stronger, and
// whether two charges attract or repel. hide: true (no lines: "draw the field"), "arrows" (lines without their
// arrowheads: "add the direction"), "signs" (the charges' signs, the poles' letters and the current's mark left off:
// "read the signs from the field").
import { node, label, line, path, frame, palette, isNum, text, hides, r2 } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf } from './mech.js';
import { FL_W, FL_H, FL_CHARGE_R, FL_WIRE_R, FL_DENSITY, flBuild, flChargesOf, flChargeField, flMagnetField, flPlates } from './ported/fields.js';

const FL_KEYS = ['kind', 'hide', 'setup', 'sign', 'current', 'charges', 'lines', 'fieldLines', 'arrows', 'points', 'heading'];
const FL_SETUPS = ['charge', 'opposite', 'like', 'plates', 'magnet', 'wire', 'charges'];
const setupOf = d => (d.charges ? 'charges' : d.setup || 'opposite');
const signOf = d => (d.sign === '-' || d.sign === -1 ? -1 : 1);
/** A direction on the page (degrees counterclockwise from the right) as a compass word, within a degree, or ''. */
function word(deg) {
  const a = ((deg % 360) + 360) % 360;
  for (const [w, c] of [['right', 0], ['up', 90], ['left', 180], ['down', 270], ['right', 360]]) if (Math.abs(a - c) < 1) return w;
  return '';
}

export const fields = {
  check(d) {
    const out = keysCheck(d, FL_KEYS, 'a field figure');
    if (d.charges !== undefined) {
      if (d.setup !== undefined && d.setup !== 'charges') out.push('give "charges" or a "setup", not both');
      if (!Array.isArray(d.charges) || d.charges.length < 1 || d.charges.length > 4) out.push('"charges" lists 1 to 4 charges: { q: 1 or -1 (or up to ±3), x, y } from the middle of the figure, y up');
      else d.charges.forEach((c, i) => {
        if (!c || typeof c !== 'object' || !isNum(c.q, -3, 3) || c.q === 0) out.push(`charge ${i + 1}: "q" must be a charge from -3 to 3, not 0`);
        else if (!isNum(c.x, -260, 260) || !isNum(c.y, -160, 160)) out.push(`charge ${i + 1}: "x" must be -260 to 260 and "y" -160 to 160 (figure units from the middle, y up)`);
      });
      if (!out.length) for (let i = 0; i < d.charges.length; i++) for (let j = i + 1; j < d.charges.length; j++) if (Math.hypot(d.charges[i].x - d.charges[j].x, d.charges[i].y - d.charges[j].y) < 70) out.push(`charges ${i + 1} and ${j + 1} are too close to draw apart (at least 70 apart)`);
    } else out.push(...oneOf(d, 'setup', FL_SETUPS.filter(s => s !== 'charges')));
    out.push(...oneOf(d, 'sign', ['+', '-']), ...oneOf(d, 'current', ['out', 'in']), ...oneOf(d, 'lines', ['fewer', 'normal', 'more']), ...boolCheck(d, ['fieldLines', 'arrows']));
    if (d.points !== undefined) {
      if (!Array.isArray(d.points) || d.points.length > 4) out.push('"points" lists up to 4 points: { name: "P", x, y } from the middle of the figure, y up');
      else d.points.forEach((p, i) => {
        if (!p || typeof p !== 'object' || !text(p.name, 3) || !isNum(p.x, -300, 300) || !isNum(p.y, -190, 190)) out.push(`point ${i + 1} needs a short "name" and "x" -300 to 300, "y" -190 to 190 (from the middle, y up)`);
      });
      if (!out.length) {
        const names = d.points.map(p => text(p.name, 3));
        if (new Set(names).size !== names.length) out.push('each point needs its own name');
        const hit = fieldAt(d, null), setup = setupOf(d);
        d.points.forEach(p => { const v = hit(p.x, p.y); if (v === null) out.push(`point ${text(p.name, 3)} is on a ${setup === 'wire' ? 'wire' : setup === 'magnet' ? 'magnet' : 'charge'}: move it off`); });
      }
    }
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The field at each named point (its direction in degrees counterclockwise from the right, a compass word when it
   *  points straight along one, and its strength relative to one unit charge 100 figure units away), which of the first
   *  two points has the stronger field, and whether two charges attract or repel. */
  solve(d) {
    if (fields.check(d).length) return null;
    const setup = setupOf(d), at = fieldAt(d, null), points = {};
    for (const p of d.points || []) {
      const [ex, ey] = at(p.x, p.y), strength = Math.hypot(ex, ey), angle = strength ? ((Math.atan2(ey, ex) * 180) / Math.PI + 360) % 360 : 0;
      points[text(p.name, 3)] = { x: p.x, y: p.y, strength, angle: r2(angle), direction: strength ? word(angle) : 'none' };
    }
    const names = Object.keys(points);
    let stronger = '';
    if (names.length >= 2) { const a = points[names[0]].strength, b = points[names[1]].strength; stronger = Math.abs(a - b) <= 0.01 * Math.max(a, b) ? 'same' : a > b ? names[0] : names[1]; }
    const qs = setup === 'charges' ? d.charges.map(c => c.q) : setup === 'opposite' ? [1, -1] : setup === 'like' ? [signOf(d), signOf(d)] : setup === 'charge' ? [signOf(d)] : [];
    const first = Object.values(points)[0];
    return { setup, direction: first ? first.direction : '', field: ['magnet', 'wire'].includes(setup) ? 'magnetic' : 'electric', charges: qs.length, force: qs.length === 2 ? (qs[0] * qs[1] > 0 ? 'repel' : 'attract') : '',
      lines: flBuild(setup, FL_DENSITY[setup][d.lines || 'normal'], signOf(d), d.current || 'out', ownCharges(d)).lines.length, points, stronger };
  },
  draw(d, o) {
    const P = palette(o), setup = setupOf(d), top = d.heading ? 30 : 0, W = mechWords(o.lang);
    const fig = flBuild(setup, FL_DENSITY[setup][d.lines || 'normal'], signOf(d), d.current || 'out', ownCharges(d));
    const noLines = hides(o, true) || o.hide === true || d.fieldLines === false, noArrows = noLines || hides(o, 'arrows') || d.arrows === false, noSigns = hides(o, 'signs');
    const kids = [];
    if (d.heading) kids.push(label(FL_W / 2, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    const g = [], lc = P.ink2;
    if (!noLines) {
      for (const l of fig.lines) for (const run of inside(l.points)) g.push(path(`M ${run.map(p => `${r2(p.x)} ${r2(p.y)}`).join(' L ')}`, { stroke: lc, 'stroke-width': 1.6, 'stroke-linejoin': 'round', class: 'of-line' }));
      if (!noArrows) for (const l of fig.lines) for (const a of l.arrows) if (a.x > 6 && a.x < FL_W - 6 && a.y > 6 && a.y < FL_H - 6) g.push(head(a, lc));
    }
    // the plates, the magnet, the wire or the charges, over the lines
    const pos = P.red, neg = P.blue;
    if (fig.plates) {
      const p = fig.plates;
      for (const [y, s] of [[p.top - 8, 1], [p.bottom, -1]]) {
        g.push(node('rect', { x: p.left, y, width: p.right - p.left, height: 8, fill: noSigns ? P.soft : s > 0 ? pos : neg, stroke: P.ink, 'stroke-width': 1.6, class: 'of-plate' }));
        if (!noSigns) for (const x of p.signs) g.push(sign(x, s > 0 ? y - 14 : y + 22, s, 6, P.ink));
      }
    }
    if (fig.magnet) {
      const m = fig.magnet, half = m.length / 2;
      g.push(node('rect', { x: m.x, y: m.y, width: half, height: m.height, fill: noSigns ? P.soft : o.print ? P.paper : neg, stroke: P.ink, 'stroke-width': 2 }),
        node('rect', { x: m.x + half, y: m.y, width: half, height: m.height, fill: noSigns ? P.soft : o.print ? P.grid : pos, stroke: P.ink, 'stroke-width': 2 }));
      if (!noSigns) g.push(label(m.x + half / 2, m.y + m.height / 2, 'S', { anchor: 'middle', size: 22, colour: o.print ? P.ink : '#FFFFFF' }), label(m.x + 1.5 * half, m.y + m.height / 2, 'N', { anchor: 'middle', size: 22, colour: o.print ? P.ink : '#FFFFFF' }));
    }
    if (fig.wire) {
      const w = fig.wire;
      g.push(node('circle', { cx: w.x, cy: w.y, r: FL_WIRE_R, fill: P.paper, stroke: P.ink, 'stroke-width': 2.2, class: 'of-wire' }));
      if (!noSigns) g.push(w.current === 'out' ? node('circle', { cx: w.x, cy: w.y, r: 4.5, fill: P.ink }) : node('g', {}, line(w.x - 8, w.y - 8, w.x + 8, w.y + 8, P.ink, 2.4), line(w.x - 8, w.y + 8, w.x + 8, w.y - 8, P.ink, 2.4)));
    }
    for (const c of fig.charges) {
      const s = Math.sign(c.q), big = Math.abs(c.q) !== 1;
      g.push(node('circle', { cx: c.x, cy: c.y, r: FL_CHARGE_R, fill: P.paper, stroke: noSigns ? P.ink : s > 0 ? pos : neg, 'stroke-width': 2.4, class: 'of-charge' }));
      if (!noSigns) g.push(big ? label(c.x, c.y + 1, `${s > 0 ? '+' : '−'}${Math.abs(c.q)}`, { anchor: 'middle', size: 15, colour: s > 0 ? pos : neg }) : sign(c.x, c.y, s, 8, s > 0 ? pos : neg));
    }
    for (const p of d.points || []) {
      const x = FL_W / 2 + p.x, y = FL_H / 2 - p.y;
      g.push(node('circle', { cx: x, cy: y, r: 4.5, fill: P.ink, class: 'of-point' }), label(x + 8, y - 12, text(p.name, 3), { size: 16, italic: true, colour: P.ink, halo: P.paper }));
    }
    kids.push(node('g', { transform: top ? `translate(0 ${top})` : null }, g));
    return frame(FL_W, FL_H + top, kids, { ...o, kind: 'fields' }, o.title || W('fields'));
  },
};
const ownCharges = d => (d.charges ? d.charges.map(c => ({ x: c.x, y: c.y, q: c.q })) : null);
/** The field at (x, y) from the middle (y up) as [ex, ey] with y up, or null on a charge, wire or magnet. */
function fieldAt(d) {
  const setup = setupOf(d), cx = FL_W / 2, cy = FL_H / 2;
  if (setup === 'plates') { const p = flPlates(); return (x, y) => { const X = cx + x, Y = cy - y; return X > p.left && X < p.right && Y > p.top && Y < p.bottom ? [0, -1] : [0, 0]; }; }
  if (setup === 'wire') return (x, y) => { const r = Math.hypot(x, y); if (r <= FL_WIRE_R + 2) return null; const k = (d.current === 'in' ? -1 : 1) * (100 / r) / r; return [-y * k, x * k]; };
  if (setup === 'magnet') {
    const f = flMagnetField();
    return (x, y) => { const X = cx + x, Y = cy - y; if (X >= cx - 112 && X <= cx + 112 && Y >= cy - 27 && Y <= cy + 27) return null; const [bx, by] = f(X, Y); return [bx * 1e4, -by * 1e4]; };
  }
  const cs = flChargesOf(setup, signOf(d), ownCharges(d)), f = flChargeField(cs);
  return (x, y) => { const X = cx + x, Y = cy - y; if (cs.some(c => Math.hypot(X - c.x, Y - c.y) <= FL_CHARGE_R + 2)) return null; const [ex, ey] = f(X, Y); return [ex * 1e4, -ey * 1e4]; };
}
/** A traced line cut into the runs that lie inside the figure, each run's ends clipped to the figure's edge. */
function inside(pts) {
  const runs = []; let run = [];
  const lo = 1, hx = FL_W - 1, hy = FL_H - 1, ok = p => p.x >= lo && p.x <= hx && p.y >= lo && p.y <= hy;
  /** Where the segment from a (inside) to b (outside) leaves the figure. */
  const edge = (a, b) => { let t = 1; for (const [v0, v1, lim] of [[a.x, b.x, lo], [a.x, b.x, hx], [a.y, b.y, lo], [a.y, b.y, hy]]) if ((v1 - lim) * (v0 - lim) < 0) t = Math.min(t, (lim - v0) / (v1 - v0)); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; };
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    if (ok(p)) {
      if (!run.length && prev && !ok(prev)) run.push(edge(p, prev));
      if (i % 2 && i !== pts.length - 1 && run.length) return;
      run.push(p);
    } else {
      if (prev && ok(prev)) { if (run[run.length - 1] !== prev) run.push(prev); run.push(edge(prev, p)); }
      if (run.length > 1) runs.push(run);
      run = [];
    }
  });
  if (run.length > 1) runs.push(run);
  return runs;
}
/** An arrowhead at a point, pointing along `angle` (degrees, y down). */
function head(a, c) {
  const t = (a.angle * Math.PI) / 180, ux = Math.cos(t), uy = Math.sin(t), L = 10, w = 4.5, bx = a.x - ux * L / 2, by = a.y - uy * L / 2, tx = a.x + ux * L / 2, ty = a.y + uy * L / 2;
  return node('polygon', { points: `${r2(tx)},${r2(ty)} ${r2(bx - uy * w)},${r2(by + ux * w)} ${r2(bx + uy * w)},${r2(by - ux * w)}`, fill: c, class: 'of-arrowhead' });
}
/** A + or − drawn as lines (it reads the same in every font). */
const sign = (x, y, s, h, c) => node('g', { class: 'of-sign' }, line(x - h, y, x + h, y, c, 2.4), s > 0 ? line(x, y - h, x, y + h, c, 2.4) : null);
export const FIELD_KINDS = { fields };
