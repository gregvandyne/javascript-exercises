// Oomba Figures: physics. Free-body diagrams, vectors, inclined planes, pulleys, ray diagrams and circuits. Every
// figure is drawn to scale from its numbers: an arrow's length is proportional to its force, an angle is the angle,
// a ray goes where the thin-lens (or mirror) equation sends it. check(d) lists what is wrong with the data in plain
// English (the Builder's model reads it); draw(d, o) assumes the data passed check.
import { node, label, subLabel, arrow, line, path, poly, frame, palette, seriesColour, fmt, angleOf, unitOf, isNum, text, hides, gridLines, r2 } from './svg.js';
import { figWords } from './words.js';
import { networkCheck, networkSolve, networkDraw } from './network.js';

/** The box around some points, plus a margin. */
function bounds(pts, m = 0) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
}
/** Move a list of nodes by (dx, dy). */
const shift = (dx, dy, kids) => node('g', { transform: `translate(${r2(dx)} ${r2(dy)})` }, kids);
/** A rough width for a label of this many characters (for laying out the frame). */
const textW = (s, size = 14) => String(s).length * size * 0.58;
const unitText = (v, u, lang, dp = 2) => `${fmt(v, dp, lang)}${u ? ` ${u}` : ''}`;

// ---------------------------------------------------------------- free-body diagram
/**
 * { body: 'box' | 'dot' (default 'box'), label?: text on the body, forces: [{ name, dir: 'up' | 'down' | 'left' |
 * 'right' | degrees (0 right, 90 up), size: newtons, label?: its own label, hide?: true }], unit?: 'N', net?: true (the
 * resultant, dashed) }. Each arrow starts on the object (its centre for a dot, the middle of the box's edge it leaves
 * through) and is size × scale long: the longest force is 120 px. hide (or opts.hide): that force's size is "?".
 */
export const freeBody = {
  check(d) {
    const out = [], f = d && Array.isArray(d.forces) ? d.forces : null;
    if (!f || f.length < 1 || f.length > 8) out.push('"forces" must list 1 to 8 forces');
    else f.forEach((x, i) => {
      if (!x || typeof x !== 'object') return out.push(`force ${i + 1} must be { name, dir, size }`);
      if (angleOf(x.dir) === null) out.push(`force ${i + 1}: "dir" must be up, down, left, right or an angle in degrees`);
      if (!isNum(x.size, 0, 1e6)) out.push(`force ${i + 1}: "size" must be a number of newtons (0 or more)`);
      if (!text(x.name, 12) && !text(x.label, 30)) out.push(`force ${i + 1} needs a "name" (like W, N, F or T)`);
    });
    if (d && d.body !== undefined && !['box', 'dot'].includes(d.body)) out.push('"body" must be "box" or "dot"');
    return out;
  },
  draw(d, o) {
    const p = palette(o), forces = d.forces, unit = text(d.unit, 6) || 'N', lang = o.lang;
    const max = Math.max(...forces.map(f => f.size), 1e-9), scale = 120 / max, dot = d.body === 'dot', B = dot ? 0 : 34;
    const parts = [], pts = [[-B - 10, -B - 10], [B + 10, B + 10]];
    // where each arrow leaves the object: the box's edge along its direction
    const start = u => { if (dot) return { x: 0, y: 0 }; const k = B / Math.max(Math.abs(u.x), Math.abs(u.y)); return { x: u.x * k, y: u.y * k }; };
    const rows = forces.map((f, i) => {
      const u = unitOf(angleOf(f.dir)), s = start(u), L = f.size * scale, tip = { x: s.x + u.x * L, y: s.y + u.y * L };
      const hidden = f.hide === true || hides(o, 'forces') || hides(o, f.name);
      const words = text(f.label, 30) || (hidden ? `${text(f.name, 12)} = ? ${unit}` : `${text(f.name, 12)} = ${unitText(f.size, unit, lang)}`);
      const lx = tip.x + u.x * 14 + (Math.abs(u.x) < 0.3 ? 8 : 0), ly = tip.y + u.y * 14;
      const anchor = Math.abs(u.x) < 0.3 ? 'start' : u.x > 0 ? 'start' : 'end';
      pts.push([tip.x, tip.y], [lx + (anchor === 'end' ? -textW(words) : textW(words)), ly], [lx, ly - 10], [lx, ly + 10]);
      return { f, i, u, s, tip, words, lx, ly, anchor };
    });
    const body = dot ? node('circle', { cx: 0, cy: 0, r: 7, fill: p.ink })
      : node('g', {}, node('rect', { x: -B, y: -B, width: 2 * B, height: 2 * B, rx: 6, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }),
        text(d.label, 10) ? label(0, 0, text(d.label, 10), { anchor: 'middle', size: 13, colour: p.ink }) : null);
    parts.push(body);
    for (const r of rows) {
      if (r.f.size <= 0) continue;
      const c = seriesColour(o, r.i);
      parts.push(arrow(r.s.x, r.s.y, r.tip.x, r.tip.y, { colour: c, width: 3.5 }), label(r.lx, r.ly, r.words, { anchor: r.anchor, colour: c, size: 15, halo: p.paper }));
    }
    if (d.net) {
      const nx = forces.reduce((a, f) => a + unitOf(angleOf(f.dir)).x * f.size, 0), ny = forces.reduce((a, f) => a + unitOf(angleOf(f.dir)).y * f.size, 0);
      const mag = Math.hypot(nx, ny);
      if (mag > 1e-9) {
        // from the object's edge like the forces, set off to one side so it never hides one of them
        const u = { x: nx / mag, y: ny / mag }, s0 = start(u), off = { x: -u.y * 22, y: u.x * 22 };
        const from = { x: s0.x + off.x, y: s0.y + off.y }, tip = { x: from.x + nx * scale, y: from.y + ny * scale };
        pts.push([tip.x, tip.y], [from.x, from.y]);
        parts.push(arrow(from.x, from.y, tip.x, tip.y, { colour: p.ink, width: 2.5, dash: '7 5' }),
          label(tip.x + (tip.x >= 0 ? 10 : -10), tip.y + (Math.abs(u.x) > 0.5 ? 14 : 0), hides(o, 'net') ? `F = ? ${unit}` : `F = ${unitText(mag, unit, lang)}`, { anchor: tip.x >= 0 ? 'start' : 'end', colour: p.ink, size: 14, italic: true, halo: p.paper }));
      }
    }
    const b = bounds(pts, 18);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'freeBody' }, o.title || 'Free-body diagram');
  },
};

// ---------------------------------------------------------------- vectors
/**
 * { vectors: [{ x, y, label?, from?: [x, y] }], chain?: true (tip to tail), resultant?: true | { label }, grid?: true,
 * unit?: text }. x and y are grid units (y up). The resultant goes from the first vector's start to the sum's tip; with
 * two vectors from one point (no chain) the parallelogram is drawn dashed.
 */
export const vectors = {
  check(d) {
    const out = [], v = d && Array.isArray(d.vectors) ? d.vectors : null;
    if (!v || v.length < 1 || v.length > 6) out.push('"vectors" must list 1 to 6 vectors { x, y }');
    else v.forEach((x, i) => {
      if (!x || !isNum(x.x, -50, 50) || !isNum(x.y, -50, 50)) out.push(`vector ${i + 1} needs numbers "x" and "y" from -50 to 50 (grid units)`);
      else if (!x.x && !x.y) out.push(`vector ${i + 1} has no length`);
      if (x && x.from !== undefined && !(Array.isArray(x.from) && isNum(x.from[0], -50, 50) && isNum(x.from[1], -50, 50))) out.push(`vector ${i + 1}: "from" must be [x, y]`);
    });
    return out;
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, unit = text(d.unit, 6);
    const segs = []; let at = [0, 0];
    d.vectors.forEach((v, i) => {
      const from = d.chain ? at : Array.isArray(v.from) ? v.from : [0, 0];
      segs.push({ v, i, from, to: [from[0] + v.x, from[1] + v.y] }); at = [from[0] + v.x, from[1] + v.y];
    });
    const sum = d.vectors.reduce((a, v) => [a[0] + v.x, a[1] + v.y], [0, 0]);
    const origin = segs[0].from, rTip = d.chain ? at : [origin[0] + sum[0], origin[1] + sum[1]];
    const all = segs.flatMap(s => [s.from, s.to]).concat([rTip]);
    const gx0 = Math.floor(Math.min(...all.map(q => q[0]))) - 1, gx1 = Math.ceil(Math.max(...all.map(q => q[0]))) + 1;
    const gy0 = Math.floor(Math.min(...all.map(q => q[1]))) - 1, gy1 = Math.ceil(Math.max(...all.map(q => q[1]))) + 1;
    const S = Math.max(14, Math.min(48, 440 / Math.max(gx1 - gx0, gy1 - gy0))), X = x => (x - gx0) * S, Y = y => (gy1 - y) * S;
    const parts = [];
    if (d.grid !== false) parts.push(gridLines(0, 0, (gx1 - gx0) * S, (gy1 - gy0) * S, S, p.grid));
    if (!d.chain && segs.length === 2 && d.resultant) {
      const [a, b] = segs;
      parts.push(line(X(a.to[0]), Y(a.to[1]), X(rTip[0]), Y(rTip[1]), p.muted, 1.5, { 'stroke-dasharray': '5 5' }), line(X(b.to[0]), Y(b.to[1]), X(rTip[0]), Y(rTip[1]), p.muted, 1.5, { 'stroke-dasharray': '5 5' }));
    }
    for (const s of segs) {
      const c = seriesColour(o, s.i), mx = (X(s.from[0]) + X(s.to[0])) / 2, my = (Y(s.from[1]) + Y(s.to[1])) / 2;
      const len = Math.hypot(s.v.x, s.v.y), nx = -s.v.y / len, ny = -s.v.x / len;   // a normal on screen (y down)
      parts.push(arrow(X(s.from[0]), Y(s.from[1]), X(s.to[0]), Y(s.to[1]), { colour: c, width: 3.2 }),
        label(mx + nx * 14, my + ny * 14, text(s.v.label, 20) || String.fromCharCode(97 + s.i), { anchor: 'middle', colour: c, size: 15, italic: true, halo: p.paper }));
    }
    if (d.resultant) {
      const mag = Math.hypot(sum[0], sum[1]), hide = hides(o, 'resultant');
      const name = (d.resultant && typeof d.resultant === 'object' && text(d.resultant.label, 20)) || 'R';
      const mx = (X(origin[0]) + X(rTip[0])) / 2, my = (Y(origin[1]) + Y(rTip[1])) / 2;
      parts.push(arrow(X(origin[0]), Y(origin[1]), X(rTip[0]), Y(rTip[1]), { colour: p.ink, width: 3, dash: hide ? '2 7' : null }),
        label(mx + 10, my + 16, hide ? `${name} = ?` : `${name} = ${fmt(mag, 2, lang)}${unit ? ` ${unit}` : ''}`, { colour: p.ink, size: 14, halo: p.paper }));
    }
    const w = (gx1 - gx0) * S, h = (gy1 - gy0) * S;
    return frame(w + 16, h + 16, shift(8, 8, parts), { ...o, kind: 'vectors' }, o.title || 'Vector diagram');
  },
};

// ---------------------------------------------------------------- inclined plane
/**
 * { angle: degrees (5 to 70), mass?: kg (default 1), g?: 9.8, forces?: ['weight', 'normal', 'friction', 'applied'],
 * friction?: newtons (default: what holds it still, m g sin θ; or mu × N with "mu"), mu?, applied?: { size, dir:
 * 'up' | 'down' } (along the slope), components?: true (the weight's two parts, dashed), labels?: 'values' | 'names' }.
 * Weight m g points straight down; the normal force m g cos θ is at right angles to the slope; friction and the applied
 * force run along it. Every arrow is to scale (the longest is 130 px) and the slope's angle is the angle.
 */
export const inclinedPlane = {
  check(d) {
    const out = [];
    if (!d || !isNum(d.angle, 5, 70)) out.push('"angle" must be a number of degrees from 5 to 70');
    if (d && d.mass !== undefined && !isNum(d.mass, 0.01, 1e5)) out.push('"mass" must be a number of kilograms');
    if (d && d.mu !== undefined && !isNum(d.mu, 0, 2)) out.push('"mu" must be from 0 to 2');
    if (d && d.friction !== undefined && !isNum(d.friction, 0, 1e6)) out.push('"friction" must be a number of newtons');
    if (d && d.forces !== undefined && (!Array.isArray(d.forces) || d.forces.some(f => !['weight', 'normal', 'friction', 'applied'].includes(f)))) out.push('"forces" may list weight, normal, friction, applied');
    if (d && d.applied !== undefined && !(d.applied && isNum(d.applied.size, 0, 1e6) && ['up', 'down'].includes(d.applied.dir))) out.push('"applied" must be { size, dir: "up" | "down" } (along the slope)');
    return out;
  },
  /** The forces' sizes (newtons): the same numbers the figure draws. */
  sizes(d) {
    const m = d.mass ?? 1, g = d.g ?? 9.8, th = (d.angle * Math.PI) / 180, W = m * g, N = W * Math.cos(th);
    const F = d.friction !== undefined ? d.friction : d.mu !== undefined ? d.mu * N : W * Math.sin(th);
    return { W, N, F, along: W * Math.sin(th), into: W * Math.cos(th), A: d.applied ? d.applied.size : 0 };
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, th = (d.angle * Math.PI) / 180, s = inclinedPlane.sizes(d);
    const show = new Set(Array.isArray(d.forces) ? d.forces : ['weight', 'normal', 'friction', ...(d.applied ? ['applied'] : [])]);
    const L = 360, H = L * Math.tan(th) > 230 ? 230 : L * Math.tan(th), base = H / Math.tan(th);
    // the slope from A (bottom left) up to C (top right); screen y grows downwards
    const A = [0, H], Bp = [base, H], C = [base, 0];
    const ux = Math.cos(th), uy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);   // up the slope; out of the slope
    const at = 0.55, bw = 64, bh = 40, foot = [A[0] + (C[0] - A[0]) * at, A[1] + (C[1] - A[1]) * at];
    const cen = [foot[0] + nx * bh / 2, foot[1] + ny * bh / 2];
    const max = Math.max(s.W, s.N, show.has('friction') ? s.F : 0, s.A, 1e-9), k = 130 / max;
    const named = d.labels === 'names' || hides(o, 'values');
    const lab = (sym, sub, v) => (named ? { main: sym, sub } : { main: sym, sub, after: ` = ${unitText(v, 'N', lang, 1)}` });
    const parts = [
      node('polygon', { points: [A, Bp, C].map(q => `${r2(q[0])},${r2(q[1])}`).join(' '), fill: p.soft, stroke: p.ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      // the angle at A, and its size
      path(`M ${r2(A[0] + 54)} ${r2(A[1])} A 54 54 0 0 0 ${r2(A[0] + 54 * Math.cos(th))} ${r2(A[1] - 54 * Math.sin(th))}`, { stroke: p.ink, 'stroke-width': 1.8 }),
      label(A[0] + 62 * Math.cos(th / 2) + 4, A[1] - 62 * Math.sin(th / 2), hides(o, 'angle') ? 'θ' : `${fmt(d.angle, 1, lang)}°`, { size: 14, colour: p.ink }),
      // the block, turned to sit on the slope
      node('g', { transform: `translate(${r2(cen[0])} ${r2(cen[1])}) rotate(${r2(-d.angle)})` },
        node('rect', { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: 5, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }),
        d.mass !== undefined ? label(0, 0, `${fmt(d.mass, 2, lang)} kg`, { anchor: 'middle', size: 12, colour: p.ink }) : null),
      // the right angle at B
      poly([[Bp[0] - 14, Bp[1]], [Bp[0] - 14, Bp[1] - 14], [Bp[0], Bp[1] - 14]], { stroke: p.ink, 'stroke-width': 1.5 }),
    ];
    const pts = [A, Bp, C];
    const put = (vx, vy, len, c, lb, o2 = {}) => {
      const x2 = cen[0] + vx * len, y2 = cen[1] + vy * len;
      pts.push([x2, y2]);
      parts.push(arrow(cen[0], cen[1], x2, y2, { colour: c, width: o2.dash ? 2.2 : 3.4, dash: o2.dash }));
      if (lb) {
        const lx = x2 + vx * 14 + (o2.dx || 0), ly = y2 + vy * 14 + (o2.dy || 0), anchor = vx > 0.2 ? 'start' : vx < -0.2 ? 'end' : 'middle';
        parts.push(subLabel(lx, ly, lb.main, lb.sub, { anchor, colour: c, size: 14, after: lb.after }));
        pts.push([lx + (anchor === 'start' ? 120 : anchor === 'end' ? -120 : 60), ly]);
      }
    };
    if (show.has('weight')) put(0, 1, s.W * k, seriesColour(o, 2), lab('W', '', s.W), { dx: 6 });
    if (show.has('normal')) put(nx, ny, s.N * k, seriesColour(o, 1), lab('N', '', s.N));
    if (show.has('friction') && s.F > 0) put(ux, uy, s.F * k, seriesColour(o, 3), lab('F', 'f', s.F), { dy: -12 });
    if (show.has('applied') && d.applied && s.A > 0) put(d.applied.dir === 'up' ? ux : -ux, d.applied.dir === 'up' ? uy : -uy, s.A * k, seriesColour(o, 0), lab('F', 'app', s.A), { dy: 14 });
    if (d.components) {
      put(-ux, -uy, s.along * k, p.muted, named ? { main: 'W', sub: '∥' } : { main: 'W sin θ', sub: '', after: ` = ${unitText(s.along, 'N', lang, 1)}` }, { dash: '6 4', dy: 16 });
      put(-nx, -ny, s.into * k, p.muted, named ? { main: 'W', sub: '⊥' } : { main: 'W cos θ', sub: '', after: ` = ${unitText(s.into, 'N', lang, 1)}` }, { dash: '6 4' });
    }
    const b = bounds(pts, 22);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'inclinedPlane' }, o.title || 'Inclined plane');
  },
};

// ---------------------------------------------------------------- pulleys
/**
 * { type: 'atwood' (two masses over one pulley) | 'table' (one on a table, one hanging over the edge) | 'single' (one
 * mass held by a rope over a pulley, pulled down with F), masses: [kg, kg] (single: [kg]), g?: 9.8, mu?: (table),
 * show?: ['tension', 'weight', 'normal', 'friction', 'acceleration'] }. Rope tension and acceleration are worked out
 * (frictionless, light rope and pulley): Atwood T = 2 m1 m2 g / (m1 + m2), a = (m2 − m1) g / (m1 + m2); table
 * a = (m2 − mu m1) g / (m1 + m2) (0 if that is not positive), T = m2 (g − a). Arrows are to scale.
 */
export const pulley = {
  check(d) {
    const out = [], t = d && d.type;
    if (!['atwood', 'table', 'single'].includes(t)) out.push('"type" must be "atwood", "table" or "single"');
    const m = d && Array.isArray(d.masses) ? d.masses : null, need = t === 'single' ? 1 : 2;
    if (!m || m.length !== need || m.some(x => !isNum(x, 0.01, 1e4))) out.push(`"masses" must list ${need} mass${need > 1 ? 'es' : ''} in kilograms`);
    if (d && d.mu !== undefined && !isNum(d.mu, 0, 2)) out.push('"mu" must be from 0 to 2');
    return out;
  },
  /** The numbers the figure shows: { a (m/s², the direction the heavier side moves), T (N), W: [N] }. */
  solve(d) {
    const g = d.g ?? 9.8, m = d.masses;
    if (d.type === 'single') return { a: 0, T: m[0] * g, W: [m[0] * g] };
    if (d.type === 'atwood') { const [m1, m2] = m; return { a: ((m2 - m1) * g) / (m1 + m2), T: (2 * m1 * m2 * g) / (m1 + m2), W: [m1 * g, m2 * g] }; }
    const [m1, m2] = m, mu = d.mu ?? 0, a = Math.max(0, ((m2 - mu * m1) * g) / (m1 + m2));
    return { a, T: m2 * (g - a), W: [m1 * g, m2 * g], N: m1 * g, f: a > 0 ? mu * m1 * g : m2 * g };
  },
  draw(d, o) {
    const p = palette(o), lang = o.lang, s = pulley.solve(d), show = new Set(Array.isArray(d.show) ? d.show : ['tension', 'weight']);
    const hideT = hides(o, 'tension'), hideA = hides(o, 'acceleration');
    const max = Math.max(...s.W, s.T, s.N || 0, 1e-9), k = 110 / max, parts = [], pts = [];
    const block = (x, y, w, h, m) => node('g', {}, node('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 5, fill: p.fill, stroke: p.ink, 'stroke-width': 2.5 }), label(x, y, `${fmt(m, 2, lang)} kg`, { anchor: 'middle', size: 13, colour: p.ink }));
    // side: -1 puts a vertical arrow's label on its left (the left-hand mass), 1 on its right
    const force = (x, y, vx, vy, v, c, main, sub, hide, side = 1) => {
      const x2 = x + vx * v * k, y2 = y + vy * v * k; pts.push([x2, y2]);
      parts.push(arrow(x, y, x2, y2, { colour: c, width: 3.2 }));
      // a sideways arrow: its label just past the tip; an up or down one: beside its middle, on the given side
      const left = vx ? vx < 0 : side < 0, lx = vx ? x2 + vx * 10 : x + side * 12, ly = vx ? y2 - 16 : (y + y2) / 2;
      parts.push(subLabel(lx, ly, main, sub, { anchor: left ? 'end' : 'start', colour: c, size: 14, after: hide ? ' = ?' : ` = ${unitText(v, 'N', lang, 1)}`, halo: p.paper }));
      pts.push([lx + (left ? -120 : 120), ly]);
    };

    const R = 30;
    if (d.type === 'table') {
      // the table top from x 0 to 300 at y 200; the pulley at its right corner
      // the rope leaves the block level with its middle and runs flat to the top of the pulley (so the tension is
      // horizontal); the pulley is clamped to the table's corner
      const ty = 200, b1 = [130, ty - 26], px = 334, py = b1[1] + R;
      parts.push(node('rect', { x: 0, y: ty, width: 300, height: 18, fill: p.soft, stroke: p.ink, 'stroke-width': 2 }), line(20, ty + 18, 20, ty + 120, p.ink, 2.5), line(280, ty + 18, 280, ty + 120, p.ink, 2.5),
        line(300, ty + 9, px, py, p.ink2, 3), node('circle', { cx: px, cy: py, r: R, fill: p.paper, stroke: p.ink, 'stroke-width': 2.5 }), node('circle', { cx: px, cy: py, r: 4, fill: p.ink }));
      const b2 = [px + R, py + 150];
      parts.push(line(b1[0] + 40, b1[1], px, py - R, p.ink2, 2.5), line(px + R, py, b2[0], b2[1] - 26, p.ink2, 2.5), block(b1[0], b1[1], 80, 52, d.masses[0]), block(b2[0], b2[1], 64, 52, d.masses[1]));
      if (show.has('tension')) { force(b1[0] + 40, b1[1], 1, 0, s.T, seriesColour(o, 1), 'T', '', hideT); force(b2[0], b2[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT); }
      if (show.has('weight')) { force(b1[0], b1[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '1', false); force(b2[0], b2[1] + 26, 0, 1, s.W[1], seriesColour(o, 2), 'W', '2', false); }
      if (show.has('normal')) force(b1[0] - 20, b1[1] - 26, 0, -1, s.N, seriesColour(o, 0), 'N', '', false);
      if (show.has('friction') && d.mu) force(b1[0] - 40, b1[1] + 10, -1, 0, s.f, seriesColour(o, 3), 'F', 'f', false);
      if (show.has('acceleration')) parts.push(label(10, 20, hideA ? 'a = ? m/s²' : `a = ${unitText(s.a, 'm/s²', lang, 2)}`, { colour: p.ink, size: 14 }));
      pts.push([0, 0], [380, ty + 130], [b2[0] + 40, b2[1] + 140]);
    } else {
      // a ceiling, the pulley under it, the rope(s) down
      const cx = 200, cy = 60;
      parts.push(node('rect', { x: cx - 90, y: 0, width: 180, height: 12, fill: p.soft, stroke: p.ink, 'stroke-width': 2 }), line(cx, 12, cx, cy, p.ink, 2.5),
        node('circle', { cx, cy, r: R, fill: p.paper, stroke: p.ink, 'stroke-width': 2.5 }), node('circle', { cx, cy, r: 4, fill: p.ink }));
      const left = [cx - R, cy + 190], right = [cx + R, cy + 190];
      if (d.type === 'atwood') {
        const dy = s.a > 0 ? 30 : s.a < 0 ? -30 : 0;   // the heavier side hangs a little lower (just a picture of which way)
        const L = [left[0], left[1] - dy], Rr = [right[0], right[1] + dy];
        parts.push(line(cx - R, cy, L[0], L[1] - 26, p.ink2, 2.5), line(cx + R, cy, Rr[0], Rr[1] - 26, p.ink2, 2.5), block(L[0], L[1], 56, 52, d.masses[0]), block(Rr[0], Rr[1], 56, 52, d.masses[1]));
        if (show.has('tension')) { force(L[0] - 12, L[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT, -1); force(Rr[0] + 12, Rr[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT, 1); }
        if (show.has('weight')) { force(L[0], L[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '1', false, -1); force(Rr[0], Rr[1] + 26, 0, 1, s.W[1], seriesColour(o, 2), 'W', '2', false, 1); }
        if (show.has('acceleration') && Math.abs(s.a) > 1e-9) parts.push(label(cx + 100, 30, hideA ? 'a = ? m/s²' : `a = ${unitText(Math.abs(s.a), 'm/s²', lang, 2)}`, { anchor: 'middle', colour: p.ink, size: 14 }));
        pts.push([cx - 160, 0], [cx + 160, cy + 320]);
      } else {
        parts.push(line(cx - R, cy, left[0], left[1] - 26, p.ink2, 2.5), line(cx + R, cy, right[0], right[1] - 60, p.ink2, 2.5), block(left[0], left[1], 56, 52, d.masses[0]));
        if (show.has('tension')) force(left[0] - 8, left[1] - 26, 0, -1, s.T, seriesColour(o, 1), 'T', '', hideT);
        if (show.has('weight')) force(left[0], left[1] + 26, 0, 1, s.W[0], seriesColour(o, 2), 'W', '', false);
        force(right[0], right[1] - 60, 0, 1, s.T, seriesColour(o, 0), 'F', '', hideT);
        pts.push([cx - 160, 0], [cx + 160, cy + 320]);
      }
    }
    const b = bounds(pts, 18);
    return frame(b.x1 - b.x0, b.y1 - b.y0, shift(-b.x0, -b.y0, parts), { ...o, kind: 'pulley' }, o.title || 'Pulley');
  },
};

// ---------------------------------------------------------------- ray diagrams
const RAY_TYPES = ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror', 'plane-mirror'];
/**
 * { type: 'convex-lens' (converging) | 'concave-lens' (diverging) | 'concave-mirror' | 'convex-mirror', f: focal length
 * (> 0, cm), u: object distance (> 0), h?: object height (default f / 2), rays?: [1, 2, 3] (which principal rays),
 * unit?: 'cm', labels?: { object, image } }. Thin lens or mirror at x = 0, the object on the left. The image comes from
 * 1/f = 1/u + 1/v (real is positive; a diverging lens and a convex mirror have f < 0), magnification −v/u, and every
 * principal ray is drawn through it: 1 parallel to the axis then through (or from) F; 2 through the centre (a lens) or
 * to the pole (a mirror); 3 through (or towards) F then parallel. A virtual image is dashed, with the rays' dashed
 * back-extensions meeting at it. opts.hide: no rays and no image (the student draws them); 'image': rays, no image.
 */
export const rays = {
  check(d) {
    if (d && d.type === 'plane-mirror') return planeCheck(d);
    const out = [];
    if (!d || !RAY_TYPES.includes(d.type)) out.push(`"type" must be one of ${RAY_TYPES.join(', ')}`);
    if (!d || !isNum(d.f, 0.1, 1000)) out.push('"f" must be the focal length, a number above 0');
    if (!d || !isNum(d.u, 0.1, 5000)) out.push('"u" must be the object distance, a number above 0');
    if (d && d.h !== undefined && !isNum(d.h, 0.01, 1000)) out.push('"h" must be the object height, a number above 0');
    if (!out.length) {
      const s = rays.solve(d);
      if (!s) out.push('the object is at the focal point: the rays come out parallel and there is no image to draw (use another "u")');
      else if (Math.abs(s.v) > 6 * Math.max(d.u, d.f)) out.push(`the image is ${fmt(Math.abs(s.v), 1)} away: too far to draw; move the object further from F`);
      else if (Math.abs(s.hi) > 6 * (d.h ?? d.f / 2)) out.push('the image is too tall to draw; move the object further from F');
    }
    if (d && d.rays !== undefined && (!Array.isArray(d.rays) || !d.rays.length || d.rays.some(r => ![1, 2, 3].includes(r)))) out.push('"rays" lists 1, 2 and/or 3');
    return out;
  },
  /** -> { v (image distance, real positive), m (magnification), hi (image height), real, x (the image's x: right of
   *  the lens is +, in front of a mirror is −) } or null (object at F). */
  solve(d) {
    if (d.type === 'plane-mirror') { const h = d.h ?? d.u / 2; return { f: Infinity, v: -d.u, m: 1, hi: h, h, real: false, mirror: true, plane: true, x: d.u }; }
    const sign = d.type === 'convex-lens' || d.type === 'concave-mirror' ? 1 : -1, f = sign * d.f, u = d.u, h = d.h ?? d.f / 2;
    if (Math.abs(u - f) < 1e-9) return null;
    const v = (u * f) / (u - f), m = -v / u, mirror = /mirror/.test(d.type);
    return { f, v, m, hi: m * h, h, real: v > 0, mirror, x: mirror ? -v : v };
  },
  draw(d, o) {
    if (d.type === 'plane-mirror') return planeDraw(d, o);
    const P = palette(o), lang = o.lang, W = figWords(lang), s = rays.solve(d), unit = text(d.unit, 6) || 'cm';
    const mirror = s.mirror, out = mirror ? -1 : 1, u = d.u, h = s.h, f = Math.abs(s.f);
    const noRays = hides(o, 'rays') || o.hide === true, noImage = noRays || hides(o, 'image');
    // the world box: both F (and 2F for a lens; C for a mirror), the object and the image, with room for the rays
    const xs = [-u, -2 * f, mirror ? (s.f < 0 ? 2 * f : 0) : 2 * f, s.x], ys = [h, -h, s.hi, -Math.abs(s.hi) * 0.2];
    const x0 = Math.min(...xs) * 1.18 - f * 0.25, x1 = Math.max(...xs, mirror ? f * 0.4 : f * 0.5) * 1.18 + f * 0.25;
    const ymax = Math.max(...ys.map(Math.abs)) * 1.35;
    // heights are drawn on their own scale (as textbooks do): stretching one axis keeps every ray straight and every
    // crossing (F, the image) exactly where it is, so the construction stays true
    const Sx = 560 / (x1 - x0), Sy = 120 / ymax, M = 26, X = x => (x - x0) * Sx, Y = y => M + (ymax - y) * Sy, Wd = (x1 - x0) * Sx, Ht = 2 * ymax * Sy + 2 * M;
    const parts = [line(0, Y(0), Wd, Y(0), P.muted, 1.5)];
    // the lens or mirror (a thin one: a line with the usual end marks; a mirror has its back hatched)
    const top = Y(ymax * 0.92), bot = Y(-ymax * 0.92), lx = X(0);
    if (!mirror) {
      const inward = d.type === 'concave-lens';
      parts.push(line(lx, top, lx, bot, P.blue, 3.5),
        poly(inward ? [[lx - 8, top - 9], [lx, top], [lx + 8, top - 9]] : [[lx - 8, top + 9], [lx, top], [lx + 8, top + 9]], { stroke: P.blue, 'stroke-width': 3 }),
        poly(inward ? [[lx - 8, bot + 9], [lx, bot], [lx + 8, bot + 9]] : [[lx - 8, bot - 9], [lx, bot], [lx + 8, bot - 9]], { stroke: P.blue, 'stroke-width': 3 }));
    } else {
      const bend = d.type === 'concave-mirror' ? -10 : 10;   // the ends bend towards the object (concave) or away
      parts.push(path(`M ${r2(lx + bend)} ${r2(top)} Q ${r2(lx - bend)} ${r2((top + bot) / 2)} ${r2(lx + bend)} ${r2(bot)}`, { stroke: P.blue, 'stroke-width': 3.5 }));
      for (let y = top + 6; y < bot - 4; y += 12) parts.push(line(lx + 4, y, lx + 13, y - 8, P.blue, 1.4));
    }
    // F and 2F (a lens) or F and C (a mirror)
    const mark = (x, t) => [line(X(x), Y(0) - 6, X(x), Y(0) + 6, P.ink, 2), label(X(x), Y(0) + 18, t, { anchor: 'middle', size: 13, colour: P.ink })];
    if (!mirror) parts.push(mark(-f, 'F'), mark(f, 'F'), mark(-2 * f, '2F'), mark(2 * f, '2F'));
    else { const side = s.f > 0 ? -1 : 1; parts.push(mark(side * f, 'F'), mark(side * 2 * f, 'C')); }
    // the object: an upright arrow at x = −u
    parts.push(arrow(X(-u), Y(0), X(-u), Y(h), { colour: P.green, width: 3.5 }), label(X(-u), Y(h) - 14, (d.labels && text(d.labels.object, 20)) || W('object'), { anchor: 'middle', size: 13, colour: P.green }));
    if (!noRays) {
      const I = { x: s.x, y: s.hi }, hits = { 1: h, 2: 0, 3: s.hi }, edge = out > 0 ? x1 : x0;
      for (const r of (Array.isArray(d.rays) ? d.rays : [1, 2, 3])) {
        const hy = hits[r], c = seriesColour(o, r + 1), lw = 2.2;
        parts.push(arrowOn(X(-u), Y(h), X(0), Y(hy), c, lw));
        // where it goes after the lens or mirror: ray 3 parallel to the axis; rays 1 and 2 along the line to the image
        // (real) or away from it (virtual: dashed back to it)
        let dx, dy;
        if (r === 3) { dx = out; dy = 0; } else { const tx = s.real ? I.x : 2 * 0 - I.x, ty = s.real ? I.y : 2 * hy - I.y; dx = tx - 0; dy = ty - hy; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
        const t = (edge - 0) / dx, ex = edge, ey = hy + dy * t;
        const clip = clipY(0, hy, ex, ey, -ymax, ymax);
        parts.push(line(X(0), Y(hy), X(clip[0]), Y(clip[1]), c, lw));
        if (!s.real) parts.push(line(X(0), Y(hy), X(I.x), Y(I.y), c, 1.6, { 'stroke-dasharray': '6 5' }));
        // the construction lines through F that the student would draw: ray 3 comes from F (a converging lens with
        // the object inside F) or aims at F (a diverging lens, a convex mirror)
        if (r === 3 && Math.sign(s.f) * (u - f) < 0 && s.f > 0) parts.push(line(X(-f * (mirror ? 1 : 1)), Y(0), X(-u), Y(h), c, 1.4, { 'stroke-dasharray': '3 5' }));
        if (r === 3 && s.f < 0) parts.push(line(X(0), Y(hy), X(mirror ? f : f), Y(0), c, 1.4, { 'stroke-dasharray': '3 5' }));
        if (r === 1 && s.f < 0) parts.push(line(X(0), Y(hy), X(mirror ? f : -f), Y(0), c, 1.4, { 'stroke-dasharray': '3 5' }));
      }
    }
    if (!noImage) {
      parts.push(arrow(X(s.x), Y(0), X(s.x), Y(s.hi), { colour: P.red, width: 3.2, dash: s.real ? null : '6 4' }),
        label(X(s.x), Y(s.hi) + (s.hi >= 0 ? -14 : 16), (d.labels && text(d.labels.image, 20)) || W('image'), { anchor: 'middle', size: 13, colour: P.red }));
    }
    if (d.scale !== false) parts.push(label(6, Ht - 10, `F = ${unitText(f, unit, lang, 1)}`, { size: 11, weight: 600, colour: P.muted }));
    return frame(Wd, Ht, parts, { ...o, kind: 'rays' }, o.title || 'Ray diagram');
  },
};
// ---------------------------------------------------------------- the plane mirror (1.1.0)
// { type: "plane-mirror", u: the object's distance in front of the mirror, h?: its height (u / 2), rays?: [1, 2] (ray 1
// to the mirror at half the object's height, ray 2 to the foot of the mirror), unit?, labels?, normals?: true }. The
// image is as far behind the mirror as the object is in front, upright, the same size and virtual. Drawn to one scale
// across and up, so each ray leaves the mirror at the angle it arrived at (the law of reflection, shown by the normals),
// and its dashed back-extension runs to the image. hide: true or "rays" (the object and mirror only), "image".
const PLANE_KEYS = ['kind', 'hide', 'type', 'u', 'h', 'rays', 'unit', 'labels', 'normals', 'scale'];
function planeCheck(d) {
  const out = [];
  for (const k of Object.keys(d)) if (!PLANE_KEYS.includes(k)) out.push(k === 'f' ? 'a plane mirror has no focal length: leave out "f"' : `"${k}" is not used by a plane mirror`);
  if (!isNum(d.u, 0.1, 5000)) out.push('"u" must be the object distance, a number above 0');
  if (d.h !== undefined && !isNum(d.h, 0.01, 1000)) out.push('"h" must be the object height, a number above 0');
  else if (isNum(d.u, 0.1) && d.h !== undefined && (d.h < 0.15 * d.u || d.h > 2 * d.u)) out.push('a plane mirror is drawn to one scale: give a height "h" from 0.15 to 2 times "u"');
  if (d.rays !== undefined && (!Array.isArray(d.rays) || !d.rays.length || d.rays.some(r => ![1, 2].includes(r)))) out.push('"rays" lists 1 and/or 2 for a plane mirror');
  if (d.normals !== undefined && typeof d.normals !== 'boolean') out.push('"normals" must be true or false');
  return out;
}
function planeDraw(d, o) {
  const P = palette(o), lang = o.lang, W = figWords(lang), s = rays.solve(d), u = d.u, h = s.h, unit = text(d.unit, 6) || 'cm';
  const noRays = hides(o, 'rays') || o.hide === true, noImage = noRays || hides(o, 'image');
  const k = Math.min(520 / (2.6 * u), 260 / (2.4 * h)), x0 = -1.3 * u, ytop = 1.4 * h, M = 30;
  const X = x => M + (x - x0) * k, Y = y => M + (ytop - y) * k, Wd = 2 * M + 2.6 * u * k, Ht = 2 * M + 2.4 * h * k;
  const parts = [line(X(x0), Y(0), X(1.3 * u), Y(0), P.muted, 1.5)];
  // the mirror: a line with its back hatched (behind it, the image side)
  const mt = Y(1.25 * h), mb = Y(-0.9 * h), lx = X(0);
  parts.push(line(lx, mt, lx, mb, P.blue, 3.5));
  for (let y = mt + 6; y < mb - 4; y += 12) parts.push(line(lx + 2, y, lx + 11, y - 8, P.blue, 1.4));
  parts.push(arrow(X(-u), Y(0), X(-u), Y(h), { colour: P.green, width: 3.5 }), label(X(-u), Y(h) - 14, (d.labels && text(d.labels.object, 20)) || W('object'), { anchor: 'middle', size: 13, colour: P.green }));
  if (!noRays) {
    const hits = { 1: h / 2, 2: 0 };
    for (const r of (Array.isArray(d.rays) ? d.rays : [1, 2])) {
      const hy = hits[r], c = seriesColour(o, r + 1), dx = u, dy = hy - h;
      parts.push(arrowOn(X(-u), Y(h), X(0), Y(hy), c, 2.2));
      // the law of reflection: back the way it came across, the same way up or down
      const t = x0 / -dx, ex = x0, ey = hy + dy * t, clip = clipY(0, hy, ex, ey, -1.1 * h, 1.35 * h);
      parts.push(arrowOn(X(0), Y(hy), X(clip[0]), Y(clip[1]), c, 2.2), line(X(0), Y(hy), X(u), Y(h), c, 1.6, { 'stroke-dasharray': '6 5', class: 'of-extension' }));
      if (d.normals !== false) parts.push(line(X(-0.32 * u), Y(hy), X(0.12 * u), Y(hy), P.muted, 1.2, { 'stroke-dasharray': '2 4', class: 'of-normal' }));
    }
  }
  if (!noImage) parts.push(arrow(X(u), Y(0), X(u), Y(h), { colour: P.red, width: 3.2, dash: '6 4' }), label(X(u), Y(h) - 14, (d.labels && text(d.labels.image, 20)) || W('image'), { anchor: 'middle', size: 13, colour: P.red }));
  if (d.scale !== false) parts.push(label(6, Ht - 10, `u = ${unitText(u, unit, lang, 1)}`, { size: 11, weight: 600, colour: P.muted }));
  return frame(Wd, Ht, parts, { ...o, kind: 'rays' }, o.title || 'Ray diagram');
}
/** A line with a small arrowhead half way (a ray's direction). */
function arrowOn(x1, y1, x2, y2, c, w) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  return node('g', {}, line(x1, y1, x2, y2, c, w), node('polygon', { points: `${r2(mx + ux * 7)},${r2(my + uy * 7)} ${r2(mx - ux * 5 - uy * 5)},${r2(my - uy * 5 + ux * 5)} ${r2(mx - ux * 5 + uy * 5)},${r2(my - uy * 5 - ux * 5)}`, fill: c }));
}
/** Cut the segment (x0, y0) -> (x1, y1) where it leaves lo <= y <= hi. */
function clipY(x0, y0, x1, y1, lo, hi) {
  if (y1 >= lo && y1 <= hi) return [x1, y1];
  const yy = y1 > hi ? hi : lo, t = (yy - y0) / (y1 - y0 || 1e-9);
  return [x0 + (x1 - x0) * t, yy];
}

// ---------------------------------------------------------------- circuits
const PARTS = ['cell', 'battery', 'bulb', 'resistor', 'switch', 'ammeter', 'voltmeter', 'variable-resistor', 'diode', 'led', 'fuse'];
/**
 * { layout: 'series' | 'parallel', parts: [{ type, label?, value?, open? }] (series: the whole loop; parallel: the
 * main line), branches?: [[parts], [parts], ...] (parallel: 2 or 3 branches between the two rails), meters?: [{ type:
 * 'voltmeter', across: index of a part in "parts" (or [branch, index]), value? }] }. The standard school symbols: a
 * cell (long line +, short line −), a battery (two cells), a bulb (circle with a cross), a resistor (a box), a switch
 * (open or closed), an ammeter (A) and a voltmeter (V) in circles, a variable resistor, a diode, an LED and a fuse.
 * value is printed next to the part ("6 V", "2 Ω", "0.5 A"); opts.hide makes every meter's reading "?".
 */
export const circuit = {
  check(d) {
    if (d && d.layout === 'network') return networkCheck(d);
    const out = [], okPart = (x, where) => {
      if (!x || !PARTS.includes(x.type)) out.push(`${where}: "type" must be one of ${PARTS.join(', ')}`);
      else if (x.type === 'voltmeter' && x.across === undefined && where.startsWith('part')) out.push(`${where}: put a voltmeter in "meters" with "across" (it goes across a part, not in the loop)`);
      if (x && x.value !== undefined && !text(x.value, 14)) out.push(`${where}: "value" must be short text like "6 V"`);
    };
    if (!d || !['series', 'parallel'].includes(d.layout)) out.push('"layout" must be "series", "parallel" or "network" (series and parallel groups nested in a loop)');
    const parts = d && Array.isArray(d.parts) ? d.parts : [];
    parts.forEach((x, i) => okPart(x, `part ${i + 1}`));
    if (parts.length > 6) out.push('at most 6 parts in the main loop');
    const br = d && Array.isArray(d.branches) ? d.branches : [];
    if (d && d.layout === 'parallel' && (br.length < 2 || br.length > 3 || br.some(b => !Array.isArray(b) || !b.length || b.length > 3))) out.push('a parallel circuit needs 2 or 3 "branches", each a list of 1 to 3 parts');
    br.forEach((b, i) => (Array.isArray(b) ? b : []).forEach((x, j) => okPart(x, `branch ${i + 1} part ${j + 1}`)));
    const all = [...parts, ...br.flat()];
    if (!all.some(x => x && (x.type === 'cell' || x.type === 'battery'))) out.push('the circuit needs a cell or a battery');
    for (const [i, m] of (Array.isArray(d && d.meters) ? d.meters : []).entries()) {
      const at = Array.isArray(m && m.across) ? (br[m.across[0]] || [])[m.across[1]] : parts[m && m.across];
      if (!m || m.type !== 'voltmeter' || !at || at.type === 'voltmeter') out.push(`meter ${i + 1} must be { type: "voltmeter", across: the index of a part (or [branch, index]) }`);
    }
    return out;
  },
  /** A network (1.1.0): the equivalent resistance, the current from the source, and each part's current and voltage
   *  (networkSolve). The flat layouts give no numbers (their values are the labels given): null. */
  solve(d) { return d && d.layout === 'network' && !networkCheck(d).length ? networkSolve(d) : null; },
  draw(d, o) {
    if (d.layout === 'network') return networkDraw(d, o, palette(o), (w, h, kids) => frame(w, h, kids, { ...o, kind: 'circuit' }, o.title || 'Circuit diagram'));
    const P = palette(o), parts = [], CW = 64;
    const hideM = o.hide === true || hides(o, 'meters');
    const valueOf = x => (x.type === 'ammeter' || x.type === 'voltmeter') && hideM ? `? ${x.type === 'ammeter' ? 'A' : 'V'}` : text(x.value, 14);
    // one part, drawn along +x from (0, 0) to (CW, 0), then placed (rotated) on the loop
    const sym = (x, ang) => symbol(x, P, CW, ang);
    const place = (x, ax, ay, ang, side = -1) => {
      const g = node('g', { transform: `translate(${r2(ax)} ${r2(ay)}) rotate(${ang})` }, sym(x, ang));
      const v = valueOf(x), lb = text(x.label, 16);
      const words = [lb, v].filter(Boolean).join('  ');
      if (!words) return g;
      const horiz = ang === 0 || ang === 180;
      return node('g', {}, g, horiz ? label(ax + (ang === 180 ? -CW / 2 : CW / 2), ay + side * 30, words, { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper })
        : label(ax + side * -30, ay + (ang === 90 ? CW / 2 : -CW / 2), words, { anchor: side < 0 ? 'start' : 'end', size: 13, colour: P.ink, halo: P.paper }));
    };
    const wire = (x1, y1, x2, y2) => line(x1, y1, x2, y2, P.ink, 2.5);
    const dotAt = (x, y) => node('circle', { cx: x, cy: y, r: 4.5, fill: P.ink });
    const main = Array.isArray(d.parts) ? d.parts : [];
    const cells = main.filter(x => x.type === 'cell' || x.type === 'battery'), rest = main.filter(x => !(x.type === 'cell' || x.type === 'battery'));
    let W, H;
    const meterAt = []; // [{ x1, y1, x2, y2, horiz, meter }]
    if (d.layout === 'series') {
      // the cells on the left side, the other parts spread over the top, the right side and the bottom
      const top = rest.slice(0, 3), right = rest.slice(3, 4), bottom = rest.slice(4);
      W = Math.max(3, top.length) * (CW + 56) + 40; H = 220;
      // room above the top wire for a voltmeter's loop
      const y0 = (Array.isArray(d.meters) && d.meters.length) ? 120 : 40, y1 = y0 + H - 60, x0 = 40, x1 = x0 + W - 40;
      const row = (list, y, ang) => { const gap = (x1 - x0 - list.length * CW) / (list.length + 1); let x = x0 + gap; const segs = []; for (const it of list) { segs.push([x, x + CW, it]); x += CW + gap; } return segs; };
      const topS = row(top, y0, 0), botS = row(bottom, y1, 0);
      let x = x0; for (const [a, b, it] of topS) { parts.push(wire(x, y0, a, y0), place(it, a, y0, 0, 1)); meterAt.push({ part: main.indexOf(it), x1: a, x2: b, y: y0, horiz: true }); x = b; } parts.push(wire(x, y0, x1, y0));
      x = x0; for (const [a, b, it] of botS) { parts.push(wire(x, y1, a, y1), place(it, a, y1, 0, 1)); x = b; } parts.push(wire(x, y1, x1, y1));
      // right side
      if (right.length) { const my = (y0 + y1) / 2 - CW / 2; parts.push(wire(x1, y0, x1, my), place(right[0], x1, my, 90, 1), wire(x1, my + CW, x1, y1)); } else parts.push(wire(x1, y0, x1, y1));
      // left side: the cells
      const cy = (y0 + y1) / 2 - (cells.length * CW) / 2; let yy = y0;
      cells.forEach((c, i) => { const a = cy + i * CW; parts.push(wire(x0, yy, x0, a), place(c, x0, a + CW, -90, -1)); yy = a + CW; });
      parts.push(wire(x0, yy, x0, y1));
      W = x1 + 60; H = y1 + 60;
    } else {
      const br = d.branches, n = br.length, gapX = CW + 120;
      const x0 = 40, top = 50, bh = Math.max(...br.map(b => b.length)) * (CW + 30) + 50, bot = top + bh;
      const xs = br.map((_, i) => x0 + 150 + i * gapX), xEnd = xs[xs.length - 1];
      // the main line: the cells on the left side, the other main parts on the top wire before the first branch
      const cy = (top + bot) / 2 - (cells.length * CW) / 2; let yy = top;
      cells.forEach((c, i) => { const a = cy + i * CW; parts.push(wire(x0, yy, x0, a), place(c, x0, a + CW, -90, -1)); yy = a + CW; });
      parts.push(wire(x0, yy, x0, bot));
      let x = x0;
      if (rest.length) { const a = x0 + 30; parts.push(wire(x0, top, a, top), place(rest[0], a, top, 0, -1)); x = a + CW; }
      parts.push(wire(x, top, xEnd, top), wire(x0, bot, xEnd, bot), wire(xEnd, top, xEnd, top));
      // each branch: a vertical wire from the top rail to the bottom rail with its parts, a dot at each joint
      br.forEach((b, i) => {
        const bx = xs[i], gap = (bot - top - b.length * CW) / (b.length + 1); let y = top;
        for (const [j, it] of b.entries()) { const a = top + gap + j * (CW + gap); parts.push(wire(bx, y, bx, a), place(it, bx, a, 90, 1)); meterAt.push({ part: [i, j], x: bx, y1: a, y2: a + CW, horiz: false }); y = a + CW; }
        parts.push(wire(bx, y, bx, bot));
        if (i < n - 1) parts.push(dotAt(bx, top), dotAt(bx, bot));   // the last branch is the loop's corner
      });
      parts.push(wire(xs[n - 1], top, xs[n - 1], top));
      W = xEnd + 130; H = bot + 50;
    }
    // voltmeters: a loop over (or beside) the part they measure
    for (const m of Array.isArray(d.meters) ? d.meters : []) {
      const key = JSON.stringify(m.across), at = meterAt.find(q => JSON.stringify(q.part) === key);
      if (!at) continue;
      const vm = { type: 'voltmeter', value: m.value, label: m.label };
      if (at.horiz) {
        const yv = at.y - 70, mid = (at.x1 + at.x2) / 2 - CW / 2;
        parts.push(dotAt(at.x1 - 10, at.y), dotAt(at.x2 + 10, at.y), wire(at.x1 - 10, at.y, at.x1 - 10, yv), wire(at.x2 + 10, at.y, at.x2 + 10, yv), wire(at.x1 - 10, yv, mid, yv), wire(mid + CW, yv, at.x2 + 10, yv), place(vm, mid, yv, 0, -1));
      } else {
        const xv = at.x + 70, mid = (at.y1 + at.y2) / 2 - CW / 2;
        parts.push(dotAt(at.x, at.y1 - 8), dotAt(at.x, at.y2 + 8), wire(at.x, at.y1 - 8, xv, at.y1 - 8), wire(at.x, at.y2 + 8, xv, at.y2 + 8), wire(xv, at.y1 - 8, xv, mid), wire(xv, mid + CW, xv, at.y2 + 8), place(vm, xv, mid, 90, -1));
        W = Math.max(W, xv + 80);
      }
    }
    return frame(W, H + 10, shift(0, 20, parts), { ...o, kind: 'circuit' }, o.title || 'Circuit diagram');
  },
};
/** One symbol along +x from (0, 0) to (w, 0). */
export function symbol(x, P, w, ang = 0) {
  const c = P.ink, L = (x1, x2) => line(x1, 0, x2, 0, c, 2.5), m = w / 2;
  const meter = t => node('g', {}, L(0, m - 15), L(m + 15, w), node('circle', { cx: m, cy: 0, r: 15, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), node('text', { x: m, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 16, 'font-weight': 800, fill: c, transform: ang ? `rotate(${-ang} ${m} 0)` : null }, t));
  switch (x.type) {
    case 'cell': return node('g', {}, L(0, m - 4), L(m + 4, w), line(m - 4, -16, m - 4, 16, c, 2.5), line(m + 4, -8, m + 4, 8, c, 5), node('text', { x: m - 12, y: -18, 'font-size': 12, 'font-weight': 700, fill: c, 'text-anchor': 'middle' }, '+'));
    case 'battery': return node('g', {}, L(0, m - 12), L(m + 12, w), line(m - 12, -16, m - 12, 16, c, 2.5), line(m - 5, -8, m - 5, 8, c, 5), line(m + 5, -16, m + 5, 16, c, 2.5), line(m + 12, -8, m + 12, 8, c, 5), line(m - 1, 0, m + 1, 0, c, 1.5, { 'stroke-dasharray': '1 2' }), node('text', { x: m - 20, y: -18, 'font-size': 12, 'font-weight': 700, fill: c, 'text-anchor': 'middle' }, '+'));
    case 'bulb': return node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m, cy: 0, r: 14, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), line(m - 10, -10, m + 10, 10, c, 2.2), line(m - 10, 10, m + 10, -10, c, 2.2));
    case 'resistor': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -8, width: 36, height: 16, fill: P.paper, stroke: c, 'stroke-width': 2.5 }));
    case 'variable-resistor': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -8, width: 36, height: 16, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), arrowLine(m - 20, 14, m + 20, -16, c));
    case 'fuse': return node('g', {}, L(0, m - 18), L(m + 18, w), node('rect', { x: m - 18, y: -7, width: 36, height: 14, fill: P.paper, stroke: c, 'stroke-width': 2.5 }), line(m - 18, 0, m + 18, 0, c, 2));
    case 'diode': case 'led': return node('g', {}, L(0, m - 10), L(m + 10, w), node('polygon', { points: `${m - 10},-11 ${m - 10},11 ${m + 10},0`, fill: P.paper, stroke: c, 'stroke-width': 2.2 }), line(m + 10, -11, m + 10, 11, c, 2.5),
      x.type === 'led' ? [arrowLine(m - 2, -14, m + 8, -26, c), arrowLine(m + 6, -12, m + 16, -24, c)] : null);
    case 'switch': return x.open === false
      ? node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m - 14, cy: 0, r: 3.5, fill: c }), node('circle', { cx: m + 14, cy: 0, r: 3.5, fill: c }), line(m - 14, 0, m + 14, 0, c, 2.5))
      : node('g', {}, L(0, m - 14), L(m + 14, w), node('circle', { cx: m - 14, cy: 0, r: 3.5, fill: c }), node('circle', { cx: m + 14, cy: 0, r: 3.5, fill: c }), line(m - 14, 0, m + 12, -16, c, 2.5));
    case 'ammeter': return meter('A');
    case 'voltmeter': return meter('V');
    default: return L(0, w);
  }
}
function arrowLine(x1, y1, x2, y2, c) { return arrow(x1, y1, x2, y2, { colour: c, width: 1.6, head: 7 }); }

export const PHYSICS = { freeBody, vectors, inclinedPlane, pulley, rays, circuit };
export const CIRCUIT_PARTS = PARTS;
export { RAY_TYPES };
