// Oomba Figures: the circle. One circle with its center, points on it (or inside or outside it) placed by their
// direction from the center, and lines between them: radii, diameters, chords, secants (an end runs on through the
// circle), tangents at a point and tangents from a point outside; angles at the center, on the circle or where chords
// cross; arcs with their degrees or length; shaded sectors and segments. Everything is drawn from the points' true
// places, so every measure on the figure is true: an inscribed angle is half its arc because it is drawn that way, and
// a label that states a number must state the true one (an arc's degrees or length, a chord's length, an angle).
// OF.solve.circle gives the circumference, area, arc lengths, sector and segment areas and every listed measure. The
// geometry and layout are ported/circle.js.
import { node, isNum, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathText, mathProblem } from './mathtext.js';
import { gmCommon, gmClaim, gmAgrees, gmLabelProblem, gmCount, gmRound, gmName, gmMarkClaims, gmDraw } from './lines.js';
import { lnSub, lnLen, lnUnit, lnMul } from './ported/lines.js';
import { cirAt, cirDeg, cirOn, cirTouch, cirLine, cirRunsFrom, cirCross, layoutCircle } from './ported/circle.js';

const CIR_MAX_POINTS = 12;
const CIR_MAX_LINES = 16;
const CIR_KEYS = ['kind', 'hide', 'radius', 'unit', 'center', 'centerDot', 'points', 'lines', 'crossings', 'angles', 'arcs', 'sectors', 'segments', 'round', 'size', 'rightAngles'];
const CRC_RAD = Math.PI / 180;
const cirAround = v => ((v % 360) + 360) % 360;

function cirRead(d) {
  const out = [];
  const odd = Object.keys(d).filter(k => !CIR_KEYS.includes(k));
  if (odd.length) return { problems: [`circle does not take "${odd[0]}" (it takes ${CIR_KEYS.slice(2).join(', ')})`] };
  const c = gmCommon(d, out, { bools: ['centerDot'] });
  if (d.radius !== undefined && !isNum(d.radius, 1e-6, 1e6)) out.push('"radius" must be a number above 0 (the circle is always drawn the same size; the radius sets every length)');
  const R = d.radius === undefined ? null : d.radius;
  // places: the center, the points, the touch points of tangents from a point, named crossings
  const places = new Map();
  const centerName = d.center === undefined ? 'O' : d.center;
  if (centerName !== false && mathProblem(centerName, 'the center\'s name')) out.push(mathProblem(centerName, 'the center\'s name'));
  const cKey = centerName === false ? 'O' : String(mathText(centerName));
  places.set(cKey, { id: 'o', at: [0, 0], name: centerName === false ? '' : centerName, dot: d.centerDot !== false, kind: 'center' });
  if (!Array.isArray(d.points) || d.points.length > CIR_MAX_POINTS) out.push(`"points" must list up to ${CIR_MAX_POINTS} points, like [{ "name": "A", "at": 40 }] (at: degrees from the center, 0 to the right, counterclockwise)`);
  for (const [i, p] of (Array.isArray(d.points) ? d.points : []).entries()) {
    const at = `point ${i + 1}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) { out.push(`${at} must be { "name", "at", "dist" }`); continue; }
    const o2 = Object.keys(p).filter(k => !['name', 'at', 'dist', 'dot'].includes(k));
    if (o2.length) { out.push(`${at} does not take "${o2[0]}" (it takes name, at, dist, dot)`); continue; }
    if (p.name === undefined || mathProblem(p.name, `the name of ${at}`)) { out.push(mathProblem(p.name, `the name of ${at}`) || `${at} needs a "name"`); continue; }
    if (!isNum(p.at, -360, 360)) { out.push(`${at}: "at" must be its direction from the center in degrees`); continue; }
    if (p.dist !== undefined && !isNum(p.dist, 0.1, 5)) { out.push(`${at}: "dist" (its distance from the center, in radii; 1 is on the circle) must be from 0.1 to 5`); continue; }
    const key = String(mathText(p.name));
    if (places.has(key)) { out.push(`two places are called ${key}`); continue; }
    places.set(key, { id: `p${i}`, at: lnMul(cirAt(p.at), p.dist === undefined ? 1 : p.dist), name: p.name, dot: p.dot !== false, kind: 'point' });
  }
  if (out.length) return { problems: out };
  const placeOf = nm => places.get(String(mathText(nm)));
  // lines
  if (d.lines !== undefined && (!Array.isArray(d.lines) || d.lines.length > CIR_MAX_LINES)) return { problems: [`"lines" must list up to ${CIR_MAX_LINES} lines, like [{ "from": "O", "to": "A" }, { "tangent": "A" }, { "tangentFrom": "P", "side": "left", "touch": "T" }]`] };
  const lines = [];
  for (const [i, l] of (d.lines || []).entries()) {
    const at = `line ${i + 1}`;
    if (!l || typeof l !== 'object' || Array.isArray(l)) { out.push(`${at} must be { "from", "to" }, { "tangent" } or { "tangentFrom", "side", "touch" }`); continue; }
    const o2 = Object.keys(l).filter(k => !['from', 'to', 'extend', 'tangent', 'tangentFrom', 'side', 'touch', 'label', 'ticks', 'style', 'arrows'].includes(k));
    if (o2.length) { out.push(`${at} does not take "${o2[0]}"`); continue; }
    if (l.ticks !== undefined && !gmCount(l.ticks)) out.push(`${at}: "ticks" must be 0 to 3`);
    if (l.style !== undefined && !['solid', 'dashed', 'dotted'].includes(l.style)) out.push(`${at}: "style" must be solid, dashed or dotted`);
    if (l.arrows !== undefined && typeof l.arrows !== 'boolean') out.push(`${at}: "arrows" must be true or false (arrowheads where it runs on)`);
    const why = gmLabelProblem(l.label, `the label of ${at}`); if (why) out.push(why);
    let spec, name;
    if (l.tangent !== undefined) {
      const p = placeOf(l.tangent);
      if (!p || !cirOn(p.at)) { out.push(`${at}: a tangent touches the circle at a point on it: "tangent" must name a point on the circle`); continue; }
      spec = { kind: 'tangent', at: p.at }; name = `the tangent at ${mathText(p.name)}`;
    } else if (l.tangentFrom !== undefined) {
      const p = placeOf(l.tangentFrom);
      if (!p || lnLen(p.at) <= 1 + 1e-9) { out.push(`${at}: a tangent from a point needs a point outside the circle ("dist" more than 1)`); continue; }
      if (!['left', 'right'].includes(l.side)) { out.push(`${at}: "side" must be "left" or "right" (looking from the point toward the center)`); continue; }
      const T = cirTouch(p.at, l.side);
      if (l.touch !== undefined) {
        if (mathProblem(l.touch, `the name of the touch point of ${at}`)) { out.push(mathProblem(l.touch, `the name of the touch point of ${at}`)); continue; }
        const key = String(mathText(l.touch));
        if (places.has(key)) { out.push(`two places are called ${key}`); continue; }
        places.set(key, { id: `t${i}`, at: T, name: l.touch, dot: true, kind: 'touch' });
      }
      spec = { kind: 'from', P: p.at, T, runB: l.extend === 'to' || l.extend === 'both' }; name = `the tangent from ${mathText(p.name)}`;
    } else {
      const a = placeOf(l.from), b = placeOf(l.to);
      if (!a || !b || a === b) { out.push(`${at}: "from" and "to" must name two different places (the center, a point, a touch point)`); continue; }
      if (l.extend !== undefined && !['from', 'to', 'both'].includes(l.extend)) { out.push(`${at}: "extend" must be "from", "to" or "both" (that end runs on, through the circle)`); continue; }
      spec = { kind: 'join', a: a.at, b: b.at, runA: l.extend === 'from' || l.extend === 'both', runB: l.extend === 'to' || l.extend === 'both', center: a.kind === 'center' ? 'a' : b.kind === 'center' ? 'b' : null };
      name = `${mathText(a.name) || 'O'}${mathText(b.name) || 'O'}`;
    }
    const g = cirLine(spec);
    lines.push({ i, g, name, label: l.label, ticks: l.ticks || 0, style: l.style, arrows: l.arrows === true, runA: spec.runA, runB: spec.runB || spec.kind === 'tangent', kind: spec.kind });
  }
  if (out.length) return { problems: out };
  // named crossings
  for (const [k, x] of (Array.isArray(d.crossings) ? d.crossings : []).entries()) {
    const at = `crossing ${k + 1}`;
    const ls = x && Array.isArray(x.lines) && x.lines.length === 2 ? x.lines.map(j => lines.find(l => l.i === j)) : null;
    if (!ls || ls.some(l => !l) || x.name === undefined || mathProblem(x.name, `the name of ${at}`)) { out.push(`${at} must be { "name", "lines": [two lines, by their place in "lines"] }`); continue; }
    const p = cirCross(ls[0].g, ls[1].g);
    if (!p) { out.push(`${at}: those two lines do not cross where they are drawn`); continue; }
    const key = String(mathText(x.name));
    if (places.has(key)) { out.push(`two places are called ${key}`); continue; }
    places.set(key, { id: `x${k}`, at: p, name: x.name, dot: true, kind: 'crossing' });
  }
  if (d.crossings !== undefined && !Array.isArray(d.crossings)) out.push('"crossings" must be a list, like [{ "name": "E", "lines": [0, 1] }]');
  if (out.length) return { problems: out };
  // angles: at a place, between the rays toward two others, along drawn lines
  const angles = [];
  for (const [k, a] of (Array.isArray(d.angles) ? d.angles : []).entries()) {
    const at = `angle ${k + 1}`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) { out.push(`${at} must be { "at", "from", "to", "label" }`); continue; }
    const o2 = Object.keys(a).filter(x => !['at', 'from', 'to', 'label', 'arcs', 'reflex'].includes(x));
    if (o2.length) { out.push(`${at} does not take "${o2[0]}" (it takes at, from, to, label, arcs, reflex)`); continue; }
    const V = placeOf(a.at), F = placeOf(a.from), T = placeOf(a.to);
    if (!V || !F || !T || V === F || V === T || F === T) { out.push(`${at}: "at", "from" and "to" must name three different places (the angle at "at" between the rays toward the other two)`); continue; }
    const u1 = lnUnit(lnSub(F.at, V.at)), u2 = lnUnit(lnSub(T.at, V.at)), nm = `∠${mathText(F.name) || 'O'}${mathText(V.name) || 'O'}${mathText(T.name) || 'O'}`;
    const drawn = u => lines.some(l => cirRunsFrom(l.g, V.at, u));
    if (!drawn(u1) || !drawn(u2)) { out.push(`${nm}: both its rays must be drawn lines from ${mathText(V.name) || 'O'} (add the lines)`); continue; }
    let ccw = cirAround(cirDeg(u2) - cirDeg(u1)), from = u1, to = u2;
    if (a.reflex === true ? ccw < 180 : ccw > 180) { ccw = 360 - ccw; [from, to] = [u2, u1]; }
    if (ccw < 1e-6 || Math.abs(ccw - 180) < 1e-6) { out.push(`${nm} is a straight angle: its rays run along one line`); continue; }
    if (a.arcs !== undefined && !gmCount(a.arcs)) out.push(`${at}: "arcs" must be 0 to 3`);
    const why = gmLabelProblem(a.label, `the label of ${nm}`); if (why) out.push(why);
    angles.push({ k, at: V.at, u1: from, u2: to, measure: ccw, name: nm, label: a.label === undefined ? true : a.label, arcs: a.arcs });
  }
  if (d.angles !== undefined && !Array.isArray(d.angles)) out.push('"angles" must be a list, like [{ "at": "C", "from": "A", "to": "B", "label": "x" }]');
  // arcs, sectors, segments: counterclockwise from one place on the circle to another
  const onCircle = (nm, at) => { const p = placeOf(nm); if (!p || !cirOn(p.at)) { out.push(`${at}: "${typeof nm === 'string' ? nm : JSON.stringify(nm)}" must name a place on the circle`); return null; } return p; };
  const span = (x, at) => {
    const F = onCircle(x.from, at), T = onCircle(x.to, at);
    if (!F || !T || F === T) { if (F && T) out.push(`${at}: "from" and "to" must be two different places on the circle`); return null; }
    const start = cirDeg(F.at);
    return { start, sweep: cirAround(cirDeg(T.at) - start), name: `${mathText(F.name)}${mathText(T.name)}` };
  };
  const arcs = [];
  for (const [k, a] of (Array.isArray(d.arcs) ? d.arcs : []).entries()) {
    const at = `arc ${k + 1}`;
    if (!a || typeof a !== 'object') { out.push(`${at} must be { "from", "to", "label" }`); continue; }
    const o2 = Object.keys(a).filter(x => !['from', 'to', 'label', 'length', 'ticks', 'bold'].includes(x));
    if (o2.length) { out.push(`${at} does not take "${o2[0]}" (it takes from, to, label, length, ticks, bold)`); continue; }
    const s = span(a, at); if (!s) continue;
    if (a.ticks !== undefined && !gmCount(a.ticks)) out.push(`${at}: "ticks" must be 0 to 3`);
    if (a.length !== undefined && typeof a.length !== 'boolean') out.push(`${at}: "length" must be true (write its length) or false (its degrees)`);
    if (a.length === true && R === null) out.push(`${at}: an arc's length needs the circle's "radius"`);
    const why = gmLabelProblem(a.label, `the label of ${at}`); if (why) out.push(why);
    arcs.push({ k, ...s, label: a.label === undefined ? true : a.label, byLength: a.length === true, ticks: a.ticks || 0, bold: a.bold === true, name: `arc ${s.name}` });
  }
  const shades = [];
  for (const kind of ['sectors', 'segments']) {
    if (d[kind] !== undefined && !Array.isArray(d[kind])) out.push(`"${kind}" must be a list, like [{ "from": "A", "to": "B" }]`);
    for (const [k, x] of (Array.isArray(d[kind]) ? d[kind] : []).entries()) { const s = x && span(x, `${kind.slice(0, -1)} ${k + 1}`); if (s) shades.push({ kind: kind.slice(0, -1), ...s }); }
  }
  if (out.length) return { problems: out };
  // the truth: every stated number is the true measure
  const problems = [];
  const lenOf = l => (l.kind === 'tangent' ? null : R === null ? null : l.g.length * R);
  for (const l of lines) {
    if (l.label === true && lenOf(l) === null) problems.push(`${l.name}: "label": true writes its length, which needs ${l.kind === 'tangent' ? 'two ends (a tangent at a point runs on both ways)' : 'the circle\'s "radius"'}`);
    const cl = l.label === true || l.label === false || l.label === undefined ? null : gmClaim(l.label, c.unit);
    if (cl !== null) { const v = lenOf(l); if (v === null) problems.push(`${l.name} is labeled ${mathText(l.label)}, a number: give the circle's "radius" so its true length can be checked`); else if (!gmAgrees(cl, v, false)) problems.push(`${l.name} is labeled ${mathText(l.label)} but it is ${r2(v)}: a label that states a number must state the true length`); }
  }
  for (const a of angles) { const cl = a.label === true || a.label === false ? null : gmClaim(a.label, ''); if (cl !== null && !gmAgrees(cl, a.measure, true)) problems.push(`${a.name} is labeled ${mathText(a.label)} but it is ${r2(a.measure)}°: a label that states a number must state the true one`); }
  for (const a of arcs) {
    const cl = a.label === true || a.label === false ? null : gmClaim(a.label, a.byLength ? c.unit : '');
    const v = a.byLength ? (a.sweep * CRC_RAD * R) : a.sweep;
    if (cl !== null && !gmAgrees(cl, v, !a.byLength)) problems.push(`${a.name} is labeled ${mathText(a.label)} but it is ${r2(v)}${a.byLength ? '' : '°'}: a label that states a number must state the true ${a.byLength ? 'length' : 'measure'}`);
  }
  problems.push(...gmMarkClaims(angles.map(a => ({ ...a, count: a.arcs })), a => a.measure, a => a.name, 'arcs claim equal angles', true));
  problems.push(...gmMarkClaims(lines.map(l => ({ ...l, count: l.ticks })), l => l.g.length, l => l.name, 'ticks claim equal lengths', false));
  problems.push(...gmMarkClaims(arcs.map(a => ({ ...a, count: a.ticks })), a => a.sweep, a => a.name, 'ticks claim equal arcs', true));
  if (problems.length) return { problems };
  return { problems: [], c, R, places: [...places.values()], lines, angles, arcs, shades };
}

export const circle = {
  check(d) { return cirRead(d).problems; },
  /** The numbers: circumference and area (and the same as multiples of π), each arc's degrees and length, each sector's
   *  and segment's area, each listed angle, and each line's kind and length (with the radius). */
  solve(d) {
    const r = cirRead(d);
    if (r.problems.length) return null;
    const R = r.R, part = s => ({ degrees: s.sweep, length: R === null ? null : s.sweep * CRC_RAD * R });
    const area = s => (R === null ? null : s.kind === 'sector' ? (s.sweep / 360) * Math.PI * R * R : (R * R / 2) * (s.sweep * CRC_RAD - Math.sin(s.sweep * CRC_RAD)));
    return {
      radius: R, diameter: R === null ? null : 2 * R, circumference: R === null ? null : 2 * Math.PI * R, area: R === null ? null : Math.PI * R * R,
      circumferencePi: R === null ? null : 2 * R, areaPi: R === null ? null : R * R,
      arcs: r.arcs.map(part), sectors: r.shades.filter(s => s.kind === 'sector').map(s => ({ ...part(s), area: area(s) })), segments: r.shades.filter(s => s.kind === 'segment').map(s => ({ ...part(s), area: area(s) })),
      angles: r.angles.map(a => a.measure), lines: r.lines.map(l => ({ type: l.g.type, length: R === null || l.kind === 'tangent' && l.g.length === 0 ? null : l.g.length * R })),
    };
  },
  draw(d, o) {
    const r = cirRead(d), c = r.c, lang = o.lang, W = figWords(lang), P = o.print, FS = 20 * c.scale, unit = c.unit ? ` ${c.unit}` : '';
    const hidden = g => o.hide === true || hides(o, g);
    const lenBox = (l, v, suffix, group, isAngle) => {
      if (l === false || l === undefined || (group && hidden(group))) return null;
      if (l === true) return v === null ? null : mathBox(gmRound(v, c.round), FS, { lang, suffix });
      return mathBox(l, FS, { lang, suffix: typeof l === 'number' ? (isAngle ? '°' : unit) : undefined });
    };
    const lines = r.lines.map(l => ({ id: `l${l.i}`, g: l.g, style: l.style, ticks: l.ticks, capA: l.arrows && (l.runA || l.kind === 'tangent') ? 'arrow' : 'none', capB: l.arrows && l.runB ? 'arrow' : 'none',
      box: lenBox(l.label, l.kind === 'tangent' || r.R === null ? null : l.g.length * r.R, unit, 'lines') }));
    const places = r.places.map(p => ({ id: p.kind === 'center' ? 'o' : `pt${p.id}`, at: p.at, dot: p.dot, box: gmName(p.name, c.scale, lang) }));
    const arcs = r.arcs.map(a => ({ id: `arc${a.k}`, start: a.start, sweep: a.sweep, ticks: a.ticks, bold: a.bold,
      box: lenBox(a.label, a.byLength ? a.sweep * CRC_RAD * r.R : a.sweep, a.byLength ? unit : '°', 'arcs', !a.byLength) }));
    const angles = r.angles.map(a => {
      const square = c.rightAngles && Math.abs(a.measure - 90) < 1e-6, shown = lenBox(a.label === true && square ? false : a.label, a.measure, '°', null, true);
      return { id: `a${a.k}`, at: a.at, u1: a.u1, u2: a.u2, measure: a.measure, box: hidden('angles') ? null : shown, arcs: a.arcs ?? (shown ? 1 : 0), square };
    });
    // a radius to the point where a tangent touches: its right angle, marked on its own (once)
    const squares = [];
    if (c.rightAngles) for (const t of r.lines.filter(l => l.kind !== 'join')) {
      const end = g => [g.P[0] + g.d[0] * g.length, g.P[1] + g.d[1] * g.length];
      const T = end(t.g);
      const radius = r.lines.find(l => l.g.type === 'radius' && (lnLen(lnSub(end(l.g), T)) < 1e-6 || lnLen(lnSub(l.g.P, T)) < 1e-6));
      if (!radius || r.angles.some(a => lnLen(lnSub(a.at, T)) < 1e-6)) continue;
      const toO = lnUnit(lnMul(T, -1)), along = cirRunsFrom(t.g, T, t.g.d) ? t.g.d : lnMul(t.g.d, -1);
      const ccw = (cirDeg(along) - cirDeg(toO) + 360) % 360 < 180;
      squares.push(ccw ? { at: T, u1: toO, u2: along } : { at: T, u1: along, u2: toO });
    }
    const L = layoutCircle({ lines, places, arcs, angles, squares, shades: r.shades });
    const fill = P ? '#D9D9D9' : '#CFE8D2';
    const under = L.shades.map((s, i) => node('path', { d: s, fill, stroke: 'none', class: 'of-shade', 'data-part': `shade${i}` }));
    return gmDraw(L, o, 'circle', o.title || W('circle'), { under });
  },
};
export const CIRCLE_KINDS = { circle };
