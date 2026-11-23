// Oomba Figures: a pressure-temperature phase diagram of one substance (1.6.0, the chemistry pack). Water, carbon
// dioxide, nitrogen, oxygen, argon, methane or ammonia, not to scale (as textbooks draw them: the real pressures span
// far more than any plain axis), with their triple and critical points' values at the axes; or a teacher's own
// substance from its six values, not to scale or to scale on a numbered grid. The science (the substances' values, the
// curves through the triple and critical points, where a pressure meets the boundaries, the phase at a place) is ported
// (ported/phase.js); the checks, the answers (OF.solve: the values, the phase at each lettered mark, the change along an
// arrow) and the drawing are Oomba's own. A mark names a region (or a point) rather than a temperature and pressure on a
// diagram not to scale, so it is always drawn where the phase is.
import { node, label, line, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { chemWords } from './chemwords.js';
import { axes } from './graphs.js';
import { PD_SUBSTANCES, PD_SCHEMATIC, PD_MAX_K, pdFromKelvin, pdFromPascal, pdAtmIn, pdRun, pdVaporization, pdSublimation, pdFusion, pdMeltingAt, pdBendThrough, pdSublimationBend, pdCrossings, pdPhaseAt, pdSig3 } from './ported/phase.js';
import { klNiceRange } from './ported/kinetics.js';

const PD_KEYS = ['kind', 'hide', 'substance', 'name', 'tripleT', 'tripleP', 'critT', 'critP', 'nmp', 'nbp', 'tUnit', 'pUnit', 'axes', 'x', 'y', 'regions', 'points', 'values', 'isobar', 'supercritical', 'marks', 'path', 'heading'];
const PD_OWN = ['tripleT', 'tripleP', 'critT', 'critP', 'nmp', 'nbp'];
const PD_PLACES = ['solid', 'liquid', 'gas', 'supercritical', 'triple', 'critical'];
const PD_CHANGES = { 'solid>liquid': 'melting', 'liquid>solid': 'freezing', 'liquid>gas': 'vaporization', 'gas>liquid': 'condensation', 'solid>gas': 'sublimation', 'gas>solid': 'deposition' };
/** Numbers a generator deals: a substance, a mark's place or a path's phases by its place in these lists. */
const PD_IDS = Object.keys(PD_SUBSTANCES), PD_PHASES = ['solid', 'liquid', 'gas'];
function pdNorm(d) {
  const o = { ...d };
  if (typeof d.substance === 'number') o.substance = PD_IDS[d.substance];
  if (Array.isArray(d.marks)) o.marks = d.marks.map(m => (m && typeof m.at === 'number' ? { ...m, at: PD_PLACES[m.at] } : m));
  if (d.path && typeof d.path === 'object') o.path = { ...d.path, ...(typeof d.path.from === 'number' ? { from: PD_PHASES[d.path.from] } : {}), ...(typeof d.path.to === 'number' ? { to: PD_PHASES[d.path.to] } : {}) };
  return o;
}
const pdNum = v => String(Number(v.toPrecision(6))).replace('-', '−');
const pdFixed = (v, p) => { const t = v.toFixed(p); return (Number(t) === 0 ? t.replace('-', '') : t).replace('-', '−'); };
const pdT = d => d.tUnit || 'C', pdP = d => d.pUnit || 'atm', pdTU = d => (pdT(d) === 'K' ? 'K' : '°C');
/** The values in the units chosen, and each as written. */
function pdValues(d) {
  const tu = pdTU(d), pu = pdP(d), atm = pdAtmIn(pu), atmText = pu === 'atm' ? '1 atm' : '101.3 kPa', sub = d.substance ? PD_SUBSTANCES[d.substance] : null;
  if (!sub) {
    const t = v => `${pdNum(v)} ${tu}`, p = v => `${pdNum(v)} ${pu}`;
    return { tripleT: d.tripleT, tripleP: d.tripleP, critT: d.critT, critP: d.critP, nmp: d.nmp, nbp: d.nbp, sublimes: null, atm, lean: d.nmp < d.tripleT ? 'left' : 'right',
      text: { tripleT: t(d.tripleT), tripleP: p(d.tripleP), critT: t(d.critT), critP: p(d.critP), nmp: d.nmp === d.tripleT ? '' : t(d.nmp), nbp: t(d.nbp), sublimes: '', atm: atmText } };
  }
  const T = k => pdFromKelvin(k, pdT(d)), P = pa => pdFromPascal(pa, pu);
  const close = sub.nmp !== undefined && pdFixed(T(sub.nmp), 1) === pdFixed(T(sub.triple.T), 1) && pdFixed(T(sub.nmp), 2) !== pdFixed(T(sub.triple.T), 2);
  const t = (k, places = 1) => (k === undefined ? '' : `${pdFixed(T(k), places)} ${tu}`), p = pa => `${pdSig3(P(pa))} ${pu}`;
  return { tripleT: T(sub.triple.T), tripleP: P(sub.triple.P), critT: T(sub.critical.T), critP: P(sub.critical.P), nmp: sub.nmp === undefined ? null : T(sub.nmp), nbp: sub.nbp === undefined ? null : T(sub.nbp),
    sublimes: sub.sublimes === undefined ? null : T(sub.sublimes), atm, lean: sub.fusion,
    text: { tripleT: t(sub.triple.T, close ? 2 : 1), tripleP: p(sub.triple.P), critT: t(sub.critical.T), critP: p(sub.critical.P), nmp: t(sub.nmp, close ? 2 : 1), nbp: t(sub.nbp), sublimes: t(sub.sublimes), atm: atmText } };
}
const pdGrid = d => !d.substance && d.axes === 'numbered';
/** The numbered grid's ranges: as given, or fitted to the diagram. */
function pdRanges(d, v) {
  const xr = d.x || (() => { const lo = Math.min(v.tripleT, v.nmp), hi = v.critT, pad = (hi - lo) * 0.25, r = klNiceRange(lo - pad, hi + pad); return [r[0], r[1]]; })();
  const yr = d.y || (() => { const r = klNiceRange(0, v.critP * 1.2, true); return [r[0], r[1]]; })();
  return { xr, yr };
}
/** The diagram's shape (in blocks not to scale, or in its units on a grid) and the height of its 1 atm line. */
function pdShape(d, v) {
  if (!pdGrid(d)) {
    const S = d.supercritical ? PD_SCHEMATIC.wide : PD_SCHEMATIC, high = v.tripleP > v.atm, triple = { x: PD_SCHEMATIC.triple.x, y: high ? PD_SCHEMATIC.atm : PD_SCHEMATIC.triple.y };
    const part = { triple, critical: PD_SCHEMATIC.critical, corner: { x: 0, y: 0 }, top: S.height, fusionTopX: triple.x + (v.lean === 'left' ? -PD_SCHEMATIC.lean : PD_SCHEMATIC.lean), kVap: PD_SCHEMATIC.bend };
    return { shape: { ...part, kSub: pdSublimationBend(part) }, atm: high ? PD_SCHEMATIC.triple.y : PD_SCHEMATIC.atm, box: { x0: 0, x1: S.width, y0: 0, y1: S.height } };
  }
  const { xr, yr } = pdRanges(d, v), triple = { x: v.tripleT, y: v.tripleP }, critical = { x: v.critT, y: v.critP }, f = (v.atm - v.tripleP) / (v.critP - v.tripleP), top = Math.max(yr[1], v.tripleP);
  const part = { triple, critical, corner: { x: xr[0], y: yr[0] }, top, fusionTopX: v.tripleT + ((v.nmp - v.tripleT) * (top - v.tripleP)) / (v.atm - v.tripleP), kVap: pdBendThrough((v.nbp - v.tripleT) / (v.critT - v.tripleT), f) ?? PD_SCHEMATIC.bend };
  return { shape: { ...part, kSub: pdSublimationBend(part) }, atm: v.atm, box: { x0: xr[0], x1: xr[1], y0: yr[0], y1: yr[1] } };
}
/** A place well inside a region (or a point), for a mark or an arrow's end. */
function pdPlace(sh, box, at, d, avoid = []) {
  const s = sh, tx = s.triple.x, ty = s.triple.y, cx = s.critical.x, cy = s.critical.y, W = box.x1 - box.x0, H = box.y1 - box.y0;
  if (at === 'triple') return { x: tx, y: ty };
  if (at === 'critical') return { x: cx, y: cy };
  const cands = [];
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) cands.push({ x: box.x0 + (W * i) / 24, y: box.y0 + (H * j) / 24 });
  const want = at === 'supercritical' && !d.supercritical ? 'gas' : at;
  // the place farthest from every boundary (sampled), inside the region and clear of the axes
  const guide = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(k => [{ x: box.x0 + (cx - box.x0) * k / 10, y: cy }, { x: cx, y: box.y0 + (cy - box.y0) * k / 10 }, { x: box.x0 + (tx - box.x0) * k / 10, y: ty }, { x: tx, y: box.y0 + (ty - box.y0) * k / 10 }]);
  const lines = [...pdVaporization(s, 40), ...pdSublimation(s, 30), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => { const y = ty + ((s.top - ty) * k) / 10; return { x: pdMeltingAt(s, y), y }; }), ...guide, { x: tx, y: ty }, { x: cx, y: cy }, { x: cx - W * 0.08, y: cy + H * 0.04 }, { x: tx + W * 0.08, y: ty - H * 0.05 }, ...avoid];
  let best = null, bestD = -1;
  for (const p of cands) {
    if (pdPhaseAt(s, p.x, p.y) !== want) continue;
    if (at === 'gas' && p.x > cx && p.y > cy * 0.8 && d.supercritical) continue;
    const dist = Math.min(...lines.map(q => Math.hypot((q.x - p.x) / W, (q.y - p.y) / H)), (p.x - box.x0) / W * 0.8, (p.y - box.y0) / H * 0.8, (box.x1 - p.x) / W * 0.8, (box.y1 - p.y) / H * 0.8);
    if (dist > bestD) { bestD = dist; best = p; }
  }
  return best;
}

/**
 * { substance: "water" (or "co2", "nitrogen", "oxygen", "argon", "methane", "ammonia"), or a teacher's own: name,
 * tripleT, tripleP, critT, critP, nmp, nbp (in the units chosen); tUnit: "C" | "K", pUnit: "atm" | "kPa", axes: "shape"
 * (not to scale) | "numbered" (to scale on a grid, for one's own substance; x, y: its ranges), regions: "names" |
 * "letters" | "blank" | "none", points: "names" | "letters" | "none" (the triple and critical points), values: true (their
 * values at the axes, not to scale), isobar: false (the dashed 1 atm line with the normal melting and boiling points),
 * supercritical: false, marks: [{ name: "A", at: "solid" | "liquid" | "gas" | "supercritical" | "triple" | "critical" }]
 * (a lettered dot), path: { from: "solid", to: "liquid" } (an arrow at constant pressure across one boundary), heading }.
 * A generator may give the substance, a mark's place and a path's phases by their place in these lists (0 is water,
 * solid). hide: "regions" (their names as lines to write on), "values" (the values at the axes as lines), true (both).
 */
export const phaseDiagram = {
  check(d0) {
    const odd = Object.keys(d0).filter(k => !PD_KEYS.includes(k));
    if (odd.length) return [`a phase diagram does not take "${odd[0]}"`];
    const d = pdNorm(d0);
    if (d.tUnit !== undefined && !['C', 'K'].includes(d.tUnit)) return ['"tUnit" must be "C" or "K"'];
    if (d.pUnit !== undefined && !['atm', 'kPa'].includes(d.pUnit)) return ['"pUnit" must be "atm" or "kPa"'];
    if (d.substance !== undefined) {
      if (!PD_SUBSTANCES[d.substance]) return [`"substance" is one of ${Object.keys(PD_SUBSTANCES).join(', ')} (or leave it out and give your own six values)`];
      const own = PD_OWN.filter(k => d[k] !== undefined);
      if (own.length || d.name !== undefined) return [`give "substance" or your own values (${PD_OWN.join(', ')}), not both`];
      if (d.axes === 'numbered') return ['a real substance\'s pressures span far too much for a numbered grid: its diagram is not to scale (or give your own values)'];
    } else {
      const miss = PD_OWN.filter(k => !isNum(d[k], -1e7, 1e7));
      if (miss.length) return [`give "substance", or your own substance's six values: ${miss.join(', ')} missing`];
      const v = pdValues(d), tu = pdTU(d), at = v.text.atm;
      if (pdT(d) === 'K' && Math.min(d.tripleT, d.critT, d.nmp, d.nbp) <= 0) return ['a temperature in kelvin is above 0'];
      if (pdT(d) === 'C' && Math.min(d.tripleT, d.critT, d.nmp, d.nbp) <= -273.15) return ['a temperature in °C is above −273.15'];
      if (d.tripleP <= 0) return ['the triple point\'s pressure is above 0'];
      if (d.tripleP >= v.atm) return [`your own substance must be a liquid somewhere along the ${at} line: make its triple point's pressure less than ${at}`];
      if (d.critT <= d.tripleT) return [`the critical point is hotter than the triple point: make "critT" higher than ${v.text.tripleT}`];
      if (d.critP <= d.tripleP) return [`the critical point is at a higher pressure than the triple point: make "critP" more than ${v.text.tripleP}`];
      if (d.critP <= v.atm) return [`the vaporization curve must cross the ${at} line: make "critP" more than ${at}`];
      const f = (v.atm - d.tripleP) / (d.critP - d.tripleP), span = d.critT - d.tripleT, straight = d.tripleT + span * f, elbow = d.tripleT + span * pdRun(f, PD_MAX_K), t = x => `${pdNum(Math.round(x * 100) / 100)} ${tu}`;
      if (d.nbp <= straight) return [`the vaporization curve bends upward, as vapor pressure does, so it reaches ${at} later than a straight line would: make "nbp" higher than ${t(straight)}`];
      if (d.nbp > elbow) return [`a boiling point this close to the critical point would make the curve an elbow: make "nbp" ${t(elbow)} or lower`];
      if (d.nmp >= straight) return [`the fusion line would cross the vaporization curve: make "nmp" lower than ${t(straight)}`];
      if (d.name !== undefined && !text(d.name, 40)) return ['"name" is a short name'];
      if (d.axes !== undefined && !['shape', 'numbered'].includes(d.axes)) return ['"axes" must be "shape" or "numbered"'];
      for (const k of ['x', 'y']) if (d[k] !== undefined && !(Array.isArray(d[k]) && d[k].length === 2 && d[k].every(n => isNum(n, -1e7, 1e7)) && d[k][1] > d[k][0])) return [`"${k}" is the grid's range [from, to]`];
      if (d.axes === 'numbered') {
        const { xr, yr } = pdRanges(d, v);
        if (d.tripleT <= xr[0] || d.critT >= xr[1] || d.nmp <= xr[0]) return ['the triple point, the critical point and the melting point must be inside the temperature axis'];
        if (d.tripleP <= yr[0] || d.critP >= yr[1]) return ['the triple and critical points must be inside the pressure axis'];
        const { shape: s } = pdShape(d, v);
        if (s.fusionTopX < xr[0] || s.fusionTopX > xr[1]) return ['the fusion line leaves the side of the grid before it reaches the top: move the melting point closer to the triple point\'s temperature, or widen "x"'];
      } else if (d.x !== undefined || d.y !== undefined) return ['"x" and "y" are a numbered grid\'s ranges (axes: "numbered")'];
    }
    const out = [];
    for (const [k, list] of [['regions', ['names', 'letters', 'blank', 'none']], ['points', ['names', 'letters', 'none']]]) if (d[k] !== undefined && !list.includes(d[k])) out.push(`"${k}" must be ${list.map(x => `"${x}"`).join(', ')}`);
    for (const k of ['values', 'isobar', 'supercritical']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.marks !== undefined) {
      if (!Array.isArray(d.marks) || d.marks.length > 6) out.push('"marks" lists up to 6 { name, at }');
      else for (const [i, m] of d.marks.entries()) {
        if (!m || !/^[A-Z]$/.test(m.name) || !PD_PLACES.includes(m.at) || Object.keys(m).some(k => !['name', 'at'].includes(k))) { out.push(`mark ${i + 1} is { name: one capital letter, at: ${PD_PLACES.join(' | ')} }`); break; }
        if (m.at === 'supercritical' && !d.supercritical) { out.push(`mark ${i + 1}: the supercritical region is marked only with "supercritical": true`); break; }
      }
      if (Array.isArray(d.marks) && new Set(d.marks.map(m => m && m.at)).size !== d.marks.length) out.push('two marks are in the same place');
      if (Array.isArray(d.marks) && new Set(d.marks.map(m => m && m.name)).size !== d.marks.length) out.push('two marks have the same letter');
      if (d.regions === 'letters' || d.points === 'letters') out.push('lettered marks and lettered regions or points would share letters: name the regions and points, or leave them out');
    }
    if (d.path !== undefined) {
      const p = d.path;
      if (!p || typeof p !== 'object' || !PD_CHANGES[`${p.from}>${p.to}`] || Object.keys(p).some(k => !['from', 'to'].includes(k))) out.push('"path" is { from, to }: two of "solid", "liquid", "gas" that share a boundary');
    }
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    return out;
  },
  /** tripleT, tripleP, critT, critP, nmp, nbp, sublimes (null where there is none), atm (1 atm in the unit), lean
   *  ("left" | "right"), denserSolid (1 when the solid is denser than the liquid), marks.<letter> (the phase or point
   *  there), mark (the first mark's), change (along the path: melting, freezing, vaporization, condensation,
   *  sublimation, deposition), sublimesAt1atm (1 or 0). */
  solve(d0) {
    if (phaseDiagram.check(d0).length) return null;
    const d = pdNorm(d0), v = pdValues(d), marks = {};
    for (const m of d.marks || []) marks[m.name] = m.at;
    const r = x => (x === null ? null : Number(x.toPrecision(10)));
    return { tripleT: r(v.tripleT), tripleP: r(v.tripleP), critT: r(v.critT), critP: r(v.critP), nmp: r(v.nmp), nbp: r(v.nbp), sublimes: r(v.sublimes), atm: r(v.atm), lean: v.lean, denserSolid: v.lean === 'right' ? 1 : 0,
      sublimesAt1atm: v.tripleP > v.atm ? 1 : 0, marks, mark: d.marks && d.marks.length ? d.marks[0].at : null, change: d.path ? PD_CHANGES[`${d.path.from}>${d.path.to}`] : null };
  },
  draw(d0, o) {
    const d = pdNorm(d0), P = palette(o), W = chemWords(o.lang), lang = o.lang, v = pdValues(d), { shape: s, atm, box } = pdShape(d, v), grid = pdGrid(d);
    const blankR = o.hide === true || hides(o, 'regions'), blankV = o.hide === true || hides(o, 'values'), showV = d.values !== false && !grid;
    const xt = `${W('temperature')} (${pdTU(d)})`, yt = `${W('pressure')} (${pdP(d)})`, curve = o.print ? '#000000' : P.blue;
    let X, Y, kids = [], Wd, Hd;
    const T0 = d.heading ? 30 : 0;
    if (grid) {
      const A = axes([box.x0, box.x1], [box.y0, box.y1], o, { w: 440, h: 320, xlabel: xt, ylabel: yt });
      X = A.X; Y = A.Y; kids.push(...A.kids); Wd = A.w; Hd = A.h;
    } else {
      const k = 34, L = 108, T = 34, w = (box.x1 - box.x0) * k, h = (box.y1 - box.y0) * k;
      X = x => L + (x - box.x0) * k; Y = y => T + h - (y - box.y0) * k;
      kids.push(line(L, T + h, L + w + 10, T + h, P.ink, 2.4), node('polygon', { points: `${L + w + 20},${T + h} ${L + w + 8},${T + h - 6} ${L + w + 8},${T + h + 6}`, fill: P.ink }),
        line(L, T + h, L, T - 10, P.ink, 2.4), node('polygon', { points: `${L},${T - 20} ${L - 6},${T - 8} ${L + 6},${T - 8}`, fill: P.ink }),
        label(L + w / 2, T + h + 56, xt, { anchor: 'middle', size: 15, colour: P.ink, cls: 'of-axis-title' }),
        node('g', { transform: `translate(20 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, yt, { anchor: 'middle', size: 15, colour: P.ink, cls: 'of-axis-title' })));
      Wd = L + w + 34; Hd = T + h + 72;
    }
    const pt = p => `${r2(X(p.x))},${r2(Y(p.y))}`, dash = { 'stroke-dasharray': '6 5' };
    // the dashed lines from the two points to the axes, and their values (not to scale)
    const marksAt = [];
    for (const key of ['triple', 'critical']) {
      const p = s[key];
      if (showV || d.points !== 'none') {
        if (showV) kids.push(line(r2(X(box.x0)), r2(Y(p.y)), r2(X(p.x)), r2(Y(p.y)), P.ink, 1.4, { ...dash, class: 'of-guide' }), line(r2(X(p.x)), r2(Y(p.y)), r2(X(p.x)), r2(Y(box.y0)), P.ink, 1.4, { ...dash, class: 'of-guide' }));
      }
      if (showV) {
        const tv = key === 'triple' ? v.text.tripleT : v.text.critT, pv = key === 'triple' ? v.text.tripleP : v.text.critP;
        marksAt.push({ x: X(p.x), t: tv }); kids.push(label(r2(X(box.x0) - 8), r2(Y(p.y)), blankV ? '______' : pv, { anchor: 'end', size: 13, colour: P.ink, cls: blankV ? 'of-blank' : 'of-value' }));
      }
    }
    // the 1 atm line and where it crosses the boundaries
    if (d.isobar) {
      kids.push(line(r2(X(box.x0)), r2(Y(atm)), r2(X(box.x1)), r2(Y(atm)), P.muted, 1.4, { 'stroke-dasharray': '3 4', class: 'of-isobar' }));
      if (!grid) kids.push(label(r2(X(box.x0) - 8), r2(Y(atm)), v.text.atm, { anchor: 'end', size: 13, colour: P.ink, cls: 'of-value' }));
      for (const c of pdCrossings(s, atm)) {
        kids.push(node('circle', { cx: r2(X(c.x)), cy: r2(Y(c.y)), r: 4, fill: P.ink }));
        if (!grid && showV) {
          kids.push(line(r2(X(c.x)), r2(Y(c.y)), r2(X(c.x)), r2(Y(box.y0)), P.muted, 1.2, { 'stroke-dasharray': '3 4' }));
          const tv = c.boundary === 'fusion' ? v.text.nmp : c.boundary === 'vaporization' ? v.text.nbp : v.text.sublimes;
          if (tv) marksAt.push({ x: X(c.x), t: tv });
        }
      }
    }
    // values under the temperature axis: each under its line, on a second row where two would touch
    marksAt.sort((a, b) => a.x - b.x);
    let lastEnd = -1e9, row = 0;
    for (const m of marksAt) {
      const w = m.t.length * 7.2, start = m.x - w / 2;
      row = start < lastEnd + 6 ? (row + 1) % 2 : 0;
      kids.push(label(r2(m.x), r2(Y(box.y0) + 18 + row * 17), blankV ? '______' : m.t, { anchor: 'middle', size: 13, colour: P.ink, cls: blankV ? 'of-blank' : 'of-value' }));
      lastEnd = m.x + w / 2;
    }
    // the three boundaries
    const vap = pdVaporization(s), sub = pdSublimation(s), fus = pdFusion(s);
    kids.push(node('g', { class: 'of-boundaries' }, node('polyline', { points: vap.map(pt).join(' '), fill: 'none', stroke: curve, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      node('polyline', { points: sub.map(pt).join(' '), fill: 'none', stroke: curve, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      node('polyline', { points: fus.map(pt).join(' '), fill: 'none', stroke: curve, 'stroke-width': 3 })));
    if (d.supercritical) kids.push(line(r2(X(s.critical.x)), r2(Y(s.critical.y)), r2(X(s.critical.x)), r2(Y(box.y1)), P.muted, 1.2, { 'stroke-dasharray': '2 4' }), line(r2(X(s.critical.x)), r2(Y(s.critical.y)), r2(X(box.x1)), r2(Y(s.critical.y)), P.muted, 1.2, { 'stroke-dasharray': '2 4' }));
    // the regions' names, letters or lines to write on
    const regions = ['solid', 'liquid', 'gas', ...(d.supercritical ? ['supercritical'] : [])], letters = 'ABCDEFGH';
    const mode = d.regions || 'names', markAt = (d.marks || []).map(m => pdPlace(s, box, m.at, d)).filter(Boolean);
    // the points' names take room too: their boxes, as places in the diagram's units for the regions' names to keep clear of
    const ux = px => box.x0 + ((px - X(box.x0)) / (X(box.x1) - X(box.x0))) * (box.x1 - box.x0), uy = py => box.y0 + ((py - Y(box.y0)) / (Y(box.y1) - Y(box.y0))) * (box.y1 - box.y0);
    const nameBoxes = (d.points || 'names') === 'none' ? [] : [[s.triple, 10, 120, 20], [s.critical, -120, -8, -16]].flatMap(([p, a, b, dy]) => [0, 0.25, 0.5, 0.75, 1].map(f => ({ x: ux(X(p.x) + a + (b - a) * f), y: uy(Y(p.y) + dy) })));
    if (mode !== 'none') regions.forEach((r, i) => {
      const p = pdPlace(s, box, r, d, [...nameBoxes, ...markAt.flatMap(q => [q, { x: q.x, y: q.y + (box.y1 - box.y0) * 0.06 }, { x: q.x, y: q.y - (box.y1 - box.y0) * 0.06 }])]); if (!p) return;
      const words = mode === 'letters' ? letters[i] : blankR || mode === 'blank' ? '________' : W(r === 'supercritical' ? 'supercriticalFluid' : r);
      kids.push(label(r2(X(p.x)), r2(Y(p.y)), words, { anchor: 'middle', size: 15, colour: P.ink, halo: P.paper, cls: mode === 'blank' || blankR ? 'of-blank' : 'of-region' }));
    });
    // the triple and critical points
    const pmode = d.points || 'names';
    [['triple', 'triplePoint'], ['critical', 'criticalPoint']].forEach(([key, word], i) => {
      const p = s[key];
      kids.push(node('circle', { cx: r2(X(p.x)), cy: r2(Y(p.y)), r: 4.5, fill: P.ink, class: 'of-point' }));
      if (pmode === 'none') return;
      const t = pmode === 'letters' ? letters[regions.length + i] : W(word), right = key === 'triple';
      kids.push(label(r2(X(p.x) + (right ? 10 : -8)), r2(Y(p.y) + (right ? 20 : -16)), t, { anchor: right ? 'start' : 'end', size: 14, colour: P.ink, halo: P.paper, cls: 'of-point-name' }));
    });
    // the lettered marks and the arrow along a path
    for (const m of d.marks || []) {
      const p = pdPlace(s, box, m.at, d); if (!p) continue;
      const near = m.at === 'triple' || m.at === 'critical', dx = near ? -14 : 0, dy = near ? 4 : -2;
      if (!near) kids.push(node('circle', { cx: r2(X(p.x)), cy: r2(Y(p.y) + 12), r: 4, fill: P.red, class: 'of-mark' }));
      kids.push(label(r2(X(p.x) + dx), r2(Y(p.y) + dy - (near ? 0 : 4)), m.name, { anchor: 'middle', size: 15, colour: P.red, halo: P.paper, cls: 'of-mark-name' }));
    }
    if (d.path) {
      const want = `${d.path.from}>${d.path.to}`, y = /gas/.test(want) && /solid/.test(want) ? (s.corner.y + s.triple.y) / 2 + (s.triple.y - s.corner.y) * 0.15 : /gas/.test(want) ? s.triple.y + (s.critical.y - s.triple.y) * 0.35 : s.triple.y + (Math.min(s.critical.y, s.top) - s.triple.y) * 0.6;
      const c = pdCrossings(s, y).find(q => q.boundary === (/gas/.test(want) && /solid/.test(want) ? 'sublimation' : /gas/.test(want) ? 'vaporization' : 'fusion'));
      if (c) {
        const span = (box.x1 - box.x0) * 0.1, left = d.path.from === 'solid' || (d.path.from === 'liquid' && d.path.to === 'gas'), a = c.x + (left ? -span : span), b = c.x + (left ? span : -span);
        kids.push(node('g', { class: 'of-path' }, arrow(r2(X(a)), r2(Y(y)), r2(X(b)), r2(Y(y)), { colour: P.red, width: 2.6, head: 11 })));
      }
    }
    if (!grid) kids.push(label(r2(Wd - 30), r2(Hd - 14), W('notToScale'), { anchor: 'end', size: 11, weight: 600, colour: P.muted, cls: 'of-nts' }));
    const name = d.substance ? W(`pd_${d.substance}`) : text(d.name, 40) || W('substanceX');
    const all = T0 ? [label(Wd / 2, 16, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }), node('g', { transform: `translate(0 ${T0})` }, kids)] : kids;
    return frame(Wd, Hd + T0, all, { ...o, kind: 'phaseDiagram' }, o.title || `${W('phaseDiagram')}: ${name}`);
  },
};
