// Oomba Figures: the half-life and titration curves (the chemistry pack), drawn on the core's axes (graphs.js) from the
// numbers: N(t) = N0 (1/2)^(t / T), and a titration's pH from the charge balance solved exactly.
import { node, label, line, poly, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';

// ---------------------------------------------------------------- half-life
/**
 * { halfLife: T (> 0), start?: N0 (default 100), tmax?: (default 4 T, at most 8 T), unit?: 'days', yunit?: '%' |
 * 'counts/min' | ..., ylabel?, xlabel?, marks?: true (dashed lines at each half-life: N0/2 at T, N0/4 at 2T...) }.
 * N(t) = N0 × (1/2)^(t / T). hide: no dashed lines (the student reads the half-life off the curve).
 */
export const halfLife = {
  check(d) {
    if (d && d.isotopes !== undefined) return hlManyCheck(d);
    const out = [];
    if (!d || !isNum(d.halfLife, 1e-6, 1e9)) out.push('"halfLife" must be a number above 0');
    if (d && d.start !== undefined && !isNum(d.start, 1e-6, 1e12)) out.push('"start" must be a number above 0');
    if (d && d.tmax !== undefined && !(isNum(d.tmax, 0) && d.tmax > 0 && d.tmax <= 8 * d.halfLife)) out.push('"tmax" must be above 0 and at most 8 half-lives');
    return out;
  },
  at: (d, t) => (d.isotopes ? d.isotopes.map(i => (d.start ?? 100) * 0.5 ** (t / i.halfLife)) : (d.start ?? 100) * 0.5 ** (t / d.halfLife)),
  draw(d, o) {
    if (d.isotopes) return hlManyDraw(d, o);
    const P = palette(o), W = figWords(o.lang), T = d.halfLife, N0 = d.start ?? 100, tmax = d.tmax ?? 4 * T;
    const A = axes([0, tmax], [0, N0 * 1.1], o, { xstep: d.xstep || niceStep(tmax, 8), ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.unit, 10)), ylabel: text(d.ylabel, 40) || axisTitle(W('remaining'), text(d.yunit, 12)) });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 200; k++) { const t = (tmax * k) / 200; pts.push([A.X(t), A.Y(halfLife.at(d, t))]); }
    if (d.marks !== false && !hides(o, 'marks') && o.hide !== true) {
      for (let n = 1; n * T <= tmax + 1e-9 && n <= 4; n++) {
        const y = N0 / 2 ** n;
        kids.push(line(A.X(0), A.Y(y), A.X(n * T), A.Y(y), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(n * T), A.Y(y), A.X(n * T), A.Y(0), P.red, 1.6, { 'stroke-dasharray': '6 5' }));
      }
      kids.push(label(A.X(T) + 6, A.Y(N0 / 2) - 12, `${W('halfLife')} = ${fmt(T, 2, o.lang)}${d.unit ? ` ${text(d.unit, 10)}` : ''}`, { size: 13, colour: P.red, halo: P.paper }));
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'halfLife' }, o.title || 'Half-life curve');
  },
};

// 1.2.0: up to three isotopes on one graph, { isotopes: [{ halfLife: 5, name: "A" }, { halfLife: 12, name: "B" }],
// start?, tmax? (at most 8 of the longest half-life), unit?, yunit?, marks? (each one's first half-life, dashed) }: each
// curve N0 × (1/2)^(t / T), in its own color and dash, named at its end. OF.solve.halfLife(data, t) gives each one's N.
function hlManyCheck(d) {
  const out = [], I = d.isotopes;
  if (d.halfLife !== undefined) return ['give "halfLife" (one isotope) or "isotopes" (up to three), not both'];
  if (!Array.isArray(I) || I.length < 1 || I.length > 3 || I.some(i => !i || !isNum(i.halfLife, 1e-6, 1e9))) return ['"isotopes" lists 1 to 3 { halfLife, name }'];
  if (I.some(i => i.name !== undefined && !text(i.name, 16))) out.push('each isotope\'s "name" must be short');
  if (new Set(I.map(i => i.halfLife)).size !== I.length) out.push('two isotopes have the same half-life: their curves would be one curve');
  const top = Math.max(...I.map(i => i.halfLife));
  if (d.start !== undefined && !isNum(d.start, 1e-6, 1e12)) out.push('"start" must be a number above 0');
  if (d.tmax !== undefined && !(isNum(d.tmax, 0) && d.tmax > 0 && d.tmax <= 8 * top)) out.push('"tmax" must be above 0 and at most 8 of the longest half-life');
  return out;
}
function hlManyDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), I = d.isotopes, N0 = d.start ?? 100, top = Math.max(...I.map(i => i.halfLife)), tmax = d.tmax ?? 4 * top;
  const A = axes([0, tmax], [0, N0 * 1.1], o, { xstep: d.xstep || niceStep(tmax, 8), ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.unit, 10)), ylabel: text(d.ylabel, 40) || axisTitle(W('remaining'), text(d.yunit, 12)) });
  const kids = [...A.kids], dashes = [null, '9 5', '3 4'], marks = d.marks !== false && !hides(o, 'marks') && o.hide !== true;
  I.forEach((iso, k) => {
    const c = seriesColour(o, k), pts = [], T = iso.halfLife;
    for (let j = 0; j <= 200; j++) { const t = (tmax * j) / 200; pts.push([A.X(t), A.Y(N0 * 0.5 ** (t / T))]); }
    if (marks && T <= tmax) kids.push(line(A.X(0), A.Y(N0 / 2), A.X(T), A.Y(N0 / 2), c, 1.4, { 'stroke-dasharray': '6 5' }), line(A.X(T), A.Y(N0 / 2), A.X(T), A.Y(0), c, 1.4, { 'stroke-dasharray': '6 5' }));
    kids.push(poly(pts, { stroke: c, 'stroke-width': 3.2, 'stroke-dasharray': dashes[k], class: 'of-isotope' }));
    const end = N0 * 0.5 ** (tmax / T);
    kids.push(label(r2(A.X(tmax) - 4), r2(A.Y(end) - 10 - 14 * k), text(iso.name, 16) || 'ABC'[k], { anchor: 'end', size: 13, colour: c, halo: P.paper, cls: 'of-name' }));
  });
  return frame(A.w, A.h, kids, { ...o, kind: 'halfLife' }, o.title || 'Half-life curves');
}

// ---------------------------------------------------------------- titration
/**
 * { acid: 'strong' | 'weak', base: 'strong' | 'weak', flask?: 'acid' (the base is added from the burette; default) |
 * 'base', ca?: mol/dm³ (0.1), cb?: (0.1), v0?: cm³ in the flask (25), vmax?: cm³ added (2 × the equivalence volume),
 * pKa?: 4.76 (a weak acid), pKb?: 4.75 (a weak base), marks?: true (the equivalence point; a weak acid's or base's half
 * way point, where pH = pKa) }. The pH at each volume comes from the charge balance solved exactly ([H+] by bisection,
 * Kw = 1e-14), so the start, the buffer region, the jump and the equivalence pH (7, above 7 or below 7) are where the
 * chemistry puts them. hide: no marks.
 */
export const titration = {
  check(d) {
    if (d && d.points !== undefined) return tiPointsCheck(d);
    const out = [];
    if (!d || !['strong', 'weak'].includes(d.acid) || !['strong', 'weak'].includes(d.base)) out.push('"acid" and "base" must each be "strong" or "weak"');
    else if (d.acid === 'weak' && d.base === 'weak') out.push('a weak acid with a weak base has no sharp end point: use a strong one for one of them');
    for (const k of ['ca', 'cb']) if (d && d[k] !== undefined && !isNum(d[k], 0.001, 5)) out.push(`"${k}" must be a concentration from 0.001 to 5`);
    if (d && d.v0 !== undefined && !isNum(d.v0, 1, 500)) out.push('"v0" must be a volume from 1 to 500');
    if (d && d.pKa !== undefined && !isNum(d.pKa, 1, 13)) out.push('"pKa" must be from 1 to 13');
    if (d && d.pKb !== undefined && !isNum(d.pKb, 1, 13)) out.push('"pKb" must be from 1 to 13');
    if (d && d.flask !== undefined && !['acid', 'base'].includes(d.flask)) out.push('"flask" must be "acid" or "base"');
    return out;
  },
  /** The equivalence volume (cm³ added from the burette). */
  veq: d => (d.flask === 'base' ? ((d.cb ?? 0.1) * (d.v0 ?? 25)) / (d.ca ?? 0.1) : ((d.ca ?? 0.1) * (d.v0 ?? 25)) / (d.cb ?? 0.1)),
  /** The pH after v cm³ from the burette. */
  pH(d, v) {
    const v0 = d.v0 ?? 25, ca = d.ca ?? 0.1, cb = d.cb ?? 0.1, Kw = 1e-14;
    const acidIn = d.flask !== 'base', Vt = v0 + v;
    const CA = acidIn ? (ca * v0) / Vt : (ca * v) / Vt, CB = acidIn ? (cb * v) / Vt : (cb * v0) / Vt;
    const Ka = d.acid === 'strong' ? 1e8 : 10 ** -(d.pKa ?? 4.76), Kb = d.base === 'strong' ? 1e8 : 10 ** -(d.pKb ?? 4.75);
    // charge balance: [H+] + [BH+] = [OH-] + [A-]; [A-] = CA Ka/(Ka + h), [BH+] = CB Kb h /(Kb h + Kw) (= CB for a strong base)
    const f = h => h + (CB * Kb * h) / (Kb * h + Kw) - Kw / h - (CA * Ka) / (Ka + h);
    let lo = -15, hi = 1;   // log10 [H+]; f grows with h
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(10 ** m) > 0) hi = m; else lo = m; }
    return -(lo + hi) / 2;
  },
  draw(d, o) {
    if (d.points) return tiPointsDraw(d, o);
    const P = palette(o), W = figWords(o.lang), ve = titration.veq(d), vmax = d.vmax ?? Math.min(100, 2 * ve);
    const A = axes([0, vmax], [0, 14], o, { ystep: 2, xstep: d.xstep, xlabel: text(d.xlabel, 50) || axisTitle(W('volumeAdded'), 'cm³'), ylabel: text(d.ylabel, 30) || 'pH' });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 400; k++) { const v = (vmax * k) / 400; pts.push([A.X(v), A.Y(Math.max(0, Math.min(14, titration.pH(d, v))))]); }
    if (d.marks !== false && o.hide !== true && !hides(o, 'marks')) {
      const pe = titration.pH(d, ve);
      kids.push(line(A.X(ve), A.Y(0), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(0), A.Y(pe), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }),
        node('circle', { cx: A.X(ve), cy: A.Y(pe), r: 5, fill: P.red }), label(A.X(ve) + 9, A.Y(pe) + (pe > 7 ? 16 : -14), `${W('eqPoint')}: pH ${fmt(pe, 1, o.lang)}`, { size: 13, colour: P.red, halo: P.paper }));
      // the half-way point (pH = pKa) means something only when the weak acid or weak base is the one in the flask
      if ((d.flask !== 'base' && d.acid === 'weak') || (d.flask === 'base' && d.base === 'weak')) {
        const ph = titration.pH(d, ve / 2);
        kids.push(node('circle', { cx: A.X(ve / 2), cy: A.Y(ph), r: 4.5, fill: P.blue }), label(A.X(ve / 2) - 8, A.Y(ph) - 14, `pH ${fmt(ph, 2, o.lang)} = ${d.acid === 'weak' ? 'pKa' : '14 − pKb'}`, { anchor: 'end', size: 12, colour: P.blue, halo: P.paper }));
      }
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'titration' }, o.title || 'Titration curve');
  },
};
// 1.2.0: a curve from measured pH values, { points: [[0, 2.9], [5, 4.1], ...] (cm³ added, pH; 3 to 60, the volumes
// rising from 0 or more), vmax?, xlabel?, ylabel? }: the points as measured, joined in order; nothing worked out.
function tiPointsCheck(d) {
  const P = d.points, extra = ['acid', 'base', 'flask', 'ca', 'cb', 'v0', 'pKa', 'pKb', 'marks'].filter(k => d[k] !== undefined);
  if (extra.length) return [`measured "points" draw as they are: leave out "${extra[0]}"`];
  if (!Array.isArray(P) || P.length < 3 || P.length > 60 || P.some(p => !Array.isArray(p) || p.length !== 2 || !isNum(p[0], 0, 500) || !isNum(p[1], 0, 14))) return ['"points" lists 3 to 60 [volume added (cm³), pH (0 to 14)]'];
  if (P.some((p, i) => i && p[0] <= P[i - 1][0])) return ['the volumes in "points" must rise, one after another'];
  if (d.vmax !== undefined && !(isNum(d.vmax, 0) && d.vmax >= P[P.length - 1][0])) return ['"vmax" must reach the last point'];
  return [];
}
function tiPointsDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), vmax = d.vmax ?? P_ceil(d.points[d.points.length - 1][0]);
  const A = axes([0, vmax], [0, 14], o, { ystep: 2, xstep: d.xstep, xlabel: text(d.xlabel, 50) || axisTitle(W('volumeAdded'), 'cm³'), ylabel: text(d.ylabel, 30) || 'pH' });
  const pts = d.points.map(([v, ph]) => [A.X(v), A.Y(ph)]);
  return frame(A.w, A.h, [...A.kids, poly(pts, { stroke: P.green, 'stroke-width': 3 }), ...pts.map(([x, y]) => node('circle', { cx: r2(x), cy: r2(y), r: 3.5, fill: P.ink, class: 'of-point' }))], { ...o, kind: 'titration' }, o.title || 'Titration curve');
}
const P_ceil = v => { const s = niceStep(v, 8); return Math.ceil(v / s - 1e-9) * s || s; };
export const CURVES = { halfLife, titration };
