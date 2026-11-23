// Oomba Figures: the roller coaster (1.7.0, the physics pack). A track through 2 to 8 points of the teacher's heights,
// from left to right, a smooth curve that never overshoots them (ported/track.js), with an optional loop standing on
// one point, a cart (or a ball or a block) at a point, its velocity, rough stretches, the ground, each point's letter
// and a mark from the ground up to it. Heights and the loop share one scale. OF.solve works the speeds out from the
// conservation of energy (frictionless, the cart moving right from where it is, at its starting speed): the speed at
// each point it reaches, where it is fastest and slowest, its energies with a mass, and for a loop the least starting
// height that carries it round (h = base + 2.5R from rest) and its speed at the top. A rough stretch ends the sums
// there (friction takes energy the figure cannot know). hide: "heights" (every height mark is "?"), "radius", true
// (both).
import { node, label, line, path, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, lbl, motion, dimension } from './mech.js';
import { rcSlopes, rcCurveAt, rcPath, rcLengthRuns } from './ported/track.js';

const RC_KEYS = ['kind', 'hide', 'points', 'unit', 'loop', 'object', 'objectAt', 'speed', 'mass', 'g', 'ground', 'rough', 'velocity', 'values', 'heading'];
const rcG = d => (d.g === undefined ? 9.8 : d.g);
const nameOf = (p, i) => lbl(p.name, String.fromCharCode(65 + i), 3);

export const rollerCoaster = {
  check(d) {
    const out = keysCheck(d, RC_KEYS, 'a roller coaster');
    if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > 8) return [...out, '"points" lists 2 to 8 points along the track, left to right: { height } (and a "name", A, B... by default)'];
    d.points.forEach((p, i) => {
      if (!p || typeof p !== 'object') { out.push(`point ${i + 1} must be { height }`); return; }
      for (const k of Object.keys(p)) if (!['height', 'name', 'mark'].includes(k)) out.push(`point ${i + 1}: "${k}" is not used`);
      if (!isNum(p.height, 0, 1000)) out.push(`point ${i + 1}: "height" must be its height above the ground, 0 to 1000`);
      if (p.mark !== undefined && typeof p.mark !== 'boolean' && !lbl(p.mark, '')) out.push(`point ${i + 1}: "mark" must be true, false or its own short words`);
    });
    const names = d.points.map((p, i) => (p && typeof p === 'object' ? nameOf(p, i) : ''));
    if (new Set(names).size !== names.length) out.push('each point needs its own name');
    const n = d.points.length;
    out.push(...oneOf(d, 'unit', ['m', 'ft']), ...oneOf(d, 'object', ['cart', 'ball', 'block', 'none']), ...boolCheck(d, ['ground', 'velocity', 'values']));
    if (d.loop !== undefined) {
      if (!d.loop || typeof d.loop !== 'object' || !Number.isInteger(d.loop.at) || d.loop.at < 1 || d.loop.at > n || !isNum(d.loop.radius, 0.1, 500) || Object.keys(d.loop).some(k => !['at', 'radius'].includes(k))) out.push(`"loop" must be { at: the point it stands on (1 to ${n}), radius }`);
    }
    if (d.objectAt !== undefined && !(Number.isInteger(d.objectAt) && d.objectAt >= 1 && d.objectAt <= n)) out.push(`"objectAt" must be the point the object is at, 1 to ${n}`);
    if (d.speed !== undefined && !isNum(d.speed, 0, 1000)) out.push('"speed" must be its speed where it starts, 0 or more');
    if (d.mass !== undefined && !isNum(d.mass, 0.001, 1e6)) out.push('"mass" must be its mass in kg');
    if (d.g !== undefined && !isNum(d.g, 0.1, 100)) out.push('"g" must be g in m/s²');
    if (d.rough !== undefined && (!Array.isArray(d.rough) || d.rough.some(r => !Number.isInteger(r) || r < 1 || r >= n) || new Set(d.rough).size !== d.rough.length)) out.push(`"rough" lists where rough stretches start (point 1 to ${n - 1}; each runs to the next point)`);
    if (!out.length && d.points.every(p => p.height === 0) && !d.loop) out.push('every point is at 0: give the hills their heights');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** Heights, and from the conservation of energy (frictionless, moving right from its point at its speed): the speed at
   *  each point it reaches (by name), the fastest and slowest of them, the energies with a mass, and for a loop the least
   *  starting height from rest, its speed at the top and whether it gets round. */
  solve(d) {
    if (rollerCoaster.check(d).length) return null;
    const g = rcG(d), n = d.points.length, names = d.points.map(nameOf), s = (d.objectAt || 1) - 1, v0 = d.speed || 0, rough = d.rough || [];
    const E = (v0 * v0) / 2 + g * d.points[s].height, heights = {}, speeds = {}, out = { g, start: names[s], heights, speeds };
    d.points.forEach((p, i) => { heights[names[i]] = p.height; });
    for (let i = s; i < n; i++) {
      if (i > s && rough.includes(i)) break;
      const k = E - g * d.points[i].height;
      if (k < -1e-9) break;
      speeds[names[i]] = Math.sqrt(Math.max(0, 2 * k));
      if (d.loop && d.loop.at === i + 1) {
        const R = d.loop.radius, top = E - g * (d.points[i].height + 2 * R);
        out.loopMinHeight = d.points[i].height + 2.5 * R; out.loopTopHeight = d.points[i].height + 2 * R;
        out.loopTopSpeed = top >= 0 ? Math.sqrt(2 * top) : 0; out.makesLoop = 2 * top >= g * R - 1e-9 ? 'yes' : 'no';
        if (out.makesLoop === 'no') break;
      }
    }
    const reached = Object.keys(speeds);
    out.reaches = reached.length;
    if (reached.length) {
      const by = f => reached.reduce((a, b) => (f(speeds[b], speeds[a]) ? b : a));
      out.fastest = by((x, y) => x > y + 1e-9); out.slowest = by((x, y) => x < y - 1e-9);
      if (reached.filter(k => Math.abs(speeds[k] - speeds[out.fastest]) < 1e-9).length > 1) out.fastest = 'tie';
    }
    if (d.mass !== undefined) {
      const m = d.mass; out.mass = m; out.energy = m * E; out.kinetic = {}; out.potential = {};
      reached.forEach(k => { out.kinetic[k] = 0.5 * m * speeds[k] * speeds[k]; out.potential[k] = m * g * heights[k]; });
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = mechWords(lang), n = d.points.length, names = d.points.map(nameOf), unit = d.unit || 'm', vals = d.values !== false;
    const hideH = o.hide === true || hides(o, 'heights'), hideR = o.hide === true || hides(o, 'radius'), rough = d.rough || [];
    const top = 58 + (d.heading ? 30 : 0), Wd = 640, groundY = 360 + (d.heading ? 30 : 0), xa = 40, xb = 600;
    const units = d.points.map(p => p.height), L = d.loop ? d.loop.at - 1 : -1, R = d.loop ? d.loop.radius : 0;
    const tallest = Math.max(...units, L >= 0 ? units[L] + 2 * R : 0);
    let scale = (groundY - top) / tallest;
    const kind = d.object || 'cart', objAt = kind === 'none' ? -1 : (d.objectAt || 1) - 1, ow = kind === 'cart' ? 46 : kind === 'block' ? 40 : 26;
    const leadL = objAt === 0 ? ow / 2 + 6 : 0, leadR = objAt === n - 1 ? ow / 2 + 6 : 0;
    const wanted = R * scale, r = L < 0 ? 0 : Math.max(4, Math.min(wanted, (xb - xa - leadL - leadR - 44 * (n - 1)) / 2));
    if (r < wanted) { const room = groundY - top, fits = Math.min(room / Math.max(...units), units[L] > 0 ? (room - 2 * r) / units[L] : Infinity); if (Number.isFinite(fits)) scale = Math.max(scale, fits); }
    const gap = (xb - xa - leadL - leadR - 2 * r) / (n - 1);
    const at = d.points.map((p, i) => ({ x: xa + leadL + i * gap + (L >= 0 && i > L ? 2 * r : i === L ? r : 0), y: groundY - p.height * scale }));
    const xs = [], ys = [], knot = (x, y) => { xs.push(x); ys.push(y); };
    const platform = Math.min(ow / 2 + 6, gap * 0.6);
    if (leadL > 0) knot(xa, at[0].y);
    at.forEach((p, i) => {
      if (i === L) { knot(p.x - r, p.y); knot(p.x + r, p.y); return; }
      if (i === n - 1 && i === objAt) knot(p.x - platform, p.y);
      knot(p.x, p.y);
      if (i === 0 && i === objAt) knot(p.x + platform, p.y);
    });
    if (leadR > 0) knot(xb, at[n - 1].y);
    const ms = rcSlopes(xs, ys), knots = xs.map((x, k) => ({ x, y: ys[k], m: ms[k] })), g = [];
    if (d.heading) g.push(label(320, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    if (d.ground !== false) g.push(line(xa - 20, groundY, xb + 20, groundY, P.ink, 2, { class: 'of-ground' }));
    // rough stretches: hatched under the track, μk over the first
    const runs = rcLengthRuns(n, rough, () => false);
    runs.forEach((run, ri) => {
      const x1 = at[run.from].x + (run.from === L ? r : 0), x2 = at[run.to].x - (run.to === L ? r : 0);
      for (let x = x1 + 4; x < x2 - 2; x += 10) { const y = rcCurveAt(knots, x).y; g.push(line(x, y + 2, x - 6, y + 10, P.muted, 1.2)); }
      if (ri === 0) { const mx = (x1 + x2) / 2; g.push(label(mx, rcCurveAt(knots, mx).y + 26, 'μₖ', { anchor: 'middle', size: 15, italic: true, colour: P.ink, halo: P.paper })); }
    });
    g.push(path(rcPath(knots), { stroke: P.ink, 'stroke-width': 3, 'stroke-linejoin': 'round', class: 'of-track' }));
    if (L >= 0) {
      const c = { x: at[L].x, y: at[L].y - r };
      g.push(node('circle', { cx: c.x, cy: c.y, r, fill: 'none', stroke: P.ink, 'stroke-width': 3, class: 'of-loop' }), node('circle', { cx: c.x, cy: c.y, r: 2.5, fill: P.ink }),
        line(c.x, c.y, c.x + r * Math.cos(Math.PI / 4), c.y - r * Math.sin(Math.PI / 4), P.ink, 1.3));
      const rw = hideR ? 'R = ?' : vals ? `R = ${fmt(R, 2, lang)} ${unit}` : 'R';
      g.push(label(c.x + r * 0.35 + 6, c.y - r * 0.35 + 14, rw, { size: 14, italic: rw === 'R', colour: P.ink, halo: P.paper }));
    }
    // height marks from the ground, dots and letters
    d.points.forEach((p, i) => {
      const q = at[i], mark = p.mark === undefined ? true : p.mark;
      if (mark !== false && d.ground !== false && p.height > 0) {
        const words = hideH ? '?' : typeof mark === 'string' || typeof mark === 'number' ? lbl(mark, '') : vals ? `${fmt(p.height, 2, lang)} ${unit}` : '';
        const mx = i === L ? q.x + r + 10 : q.x;
        g.push(dimension(mx, groundY, mx, q.y + (i === L ? 0 : 5), '', P), label(mx + 6, groundY - Math.max(12, (groundY - q.y) / 2), words, { size: 14, colour: P.ink, halo: P.paper, italic: words.length <= 2 && /^[a-z]/i.test(words), cls: 'of-mark' }));
      }
      g.push(node('circle', { cx: q.x, cy: q.y, r: 4.5, fill: P.ink, class: 'of-point' }), label(q.x, q.y - (i === objAt ? 46 : 16), names[i], { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper, cls: 'of-name' }));
    });
    // the object on the track at its point, tilted with the slope, and its velocity
    if (objAt >= 0) {
      const q = at[objAt], sl = rcCurveAt(knots, q.x).slope, ang = (Math.atan(sl) * 180) / Math.PI, mWords = vals && d.mass !== undefined ? `${fmt(d.mass, 3, lang)} kg` : 'm';
      const parts = kind === 'cart' ? [node('rect', { x: -23, y: -26, width: 46, height: 18, rx: 4, fill: P.soft, stroke: P.ink, 'stroke-width': 2 }), node('circle', { cx: -13, cy: -5, r: 5, fill: P.paper, stroke: P.ink, 'stroke-width': 2 }), node('circle', { cx: 13, cy: -5, r: 5, fill: P.paper, stroke: P.ink, 'stroke-width': 2 }), label(0, -17, mWords, { anchor: 'middle', size: 12, italic: mWords === 'm', colour: P.ink })]
        : kind === 'block' ? [node('rect', { x: -20, y: -30, width: 40, height: 30, rx: 2, fill: P.soft, stroke: P.ink, 'stroke-width': 2 }), label(0, -15, mWords, { anchor: 'middle', size: 12, italic: mWords === 'm', colour: P.ink })]
          : [node('circle', { cx: 0, cy: -13, r: 13, fill: P.soft, stroke: P.ink, 'stroke-width': 2 }), label(0, -13, mWords.length > 3 ? '' : mWords, { anchor: 'middle', size: 12, italic: true, colour: P.ink })];
      g.push(node('g', { transform: `translate(${r2(q.x)} ${r2(q.y - 1.5)}) rotate(${r2(ang)})`, class: 'of-object' }, parts));
      if (d.velocity) {
        const u = { x: 1 / Math.hypot(1, sl), y: sl / Math.hypot(1, sl) }, b0 = { x: q.x + u.x * (ow / 2 + 4) + u.y * 14, y: q.y + u.y * (ow / 2 + 4) - u.x * 14 }, vw = vals && d.speed ? `v = ${fmt(d.speed, 2, lang)} m/s` : 'v';
        g.push(motion(b0.x, b0.y, b0.x + u.x * 56, b0.y + u.y * 56, P.blue), label(b0.x + u.x * 62 + 4, b0.y + u.y * 62 - 10, vw, { size: 14, italic: vw === 'v', colour: P.blue, halo: P.paper }));
      }
    }
    return frame(Wd, groundY + 30, g, { ...o, kind: 'rollerCoaster' }, o.title || W('rollerCoaster'));
  },
};
export const COASTER_KINDS = { rollerCoaster };
