// Oomba Figures: three chemistry graphs (1.6.0, the chemistry pack), each drawn on the core's axes from a model, never
// from typed points. bondEnergy: potential energy against internuclear distance for up to three bonds, each a Morse
// curve with its minimum exactly at the bond length and the bond energy (ported/morse.js). equilibrium: concentration
// against time for a reversible reaction settling to equilibrium and then answering each stress, solved from K
// (ported/equilibrium.js), so its lines move in the ratio of the coefficients and every level stretch gives the K it
// should. rateLaw: [A], ln[A] and 1/[A] against time for a zero, first or second order reaction, side by side or one at
// a time, with data points scattered from a seed, half-life guide lines and a data table (ported/kinetics.js). The
// checks, the answers (OF.solve), the label placement and the drawing are Oomba's own. Lines are told apart by dash as
// well as color, so print reads in black and white.
import { node, label, line, poly, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { chemWords } from './chemwords.js';
import { axes } from './graphs.js';
import { beWallAt, beSamples, BE_UNITS, BE_UNIT_TEXT, beFromPm } from './ported/morse.js';
import { EQ_REACTIONS, eqSigned, eqRun, eqKFactor } from './ported/equilibrium.js';
import { klNiceRange, klFormula, KL_CONC_UNITS, KL_TIME_UNITS, KL_STRAIGHT, klEnd, klConc, klPlotted, klTimeAtShare, klHalfLives, KL_INVERSE, klKUnit, klSig, klDataTimes, klDataPoints } from './ported/kinetics.js';

const CG_DASHES = [null, '9 5', '3 4'];
const okRange = r => Array.isArray(r) && r.length === 2 && r.every(v => isNum(v, -1e7, 1e7)) && r[1] > r[0];
/** Labels spread apart (at least gap) in order, kept near where they were wanted. */
function spreadYs(ys, gap) {
  const idx = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]), out = idx.map(p => p[0]);
  for (let pass = 0; pass < 30; pass++) for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) { const m = (out[i] + out[i - 1]) / 2; out[i - 1] = m - gap / 2; out[i] = m + gap / 2; }
  const res = []; idx.forEach((p, k) => { res[p[1]] = out[k]; });
  return res;
}
const LETTERS = 'ABC';
/** Axes with no numbers and no grid (a sketch): the same frame as the core's axes. */
function plainAxes(xr, yr, o, w, h, xlabel, ylabel) {
  const P = palette(o), L = 64, T = 22, X = x => L + ((x - xr[0]) / (xr[1] - xr[0])) * w, Y = y => T + h - ((y - yr[0]) / (yr[1] - yr[0])) * h;
  const kids = [line(L, T + h, L + w + 8, T + h, P.ink, 2), line(L, T + h, L, T - 8, P.ink, 2),
    node('polygon', { points: `${r2(L + w + 14)},${r2(T + h)} ${r2(L + w + 4)},${r2(T + h - 5)} ${r2(L + w + 4)},${r2(T + h + 5)}`, fill: P.ink }),
    node('polygon', { points: `${r2(L)},${r2(T - 14)} ${r2(L - 5)},${r2(T - 4)} ${r2(L + 5)},${r2(T - 4)}`, fill: P.ink }),
    label(L + w / 2, T + h + 40, xlabel, { anchor: 'middle', size: 13, colour: P.ink }),
    node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, ylabel, { anchor: 'middle', size: 13, colour: P.ink }))];
  return { X, Y, kids, w: L + w + 26, h: T + h + 56 };
}

// ---------------------------------------------------------------- bond energy curve
const BE_KEYS = ['kind', 'hide', 'bonds', 'unit', 'axes', 'guides', 'dots', 'regions', 'names', 'x', 'y', 'heading'];
const beUnit = d => d.unit || 'pm';
/** The axis ranges: as given, or fitted to the curves (distance from 0 to about 3 bond lengths, energy from just under
 *  the deepest well to a little over 0). */
function beRanges(d) {
  const u = beUnit(d), maxL = Math.max(...d.bonds.map(b => beFromPm(b.length, u))), maxD = Math.max(...d.bonds.map(b => b.energy));
  const x = d.x ? [d.x[0], d.x[1], null] : klNiceRange(0, maxL * 3, true), yr = klNiceRange(-maxD * 1.08, maxD * 0.25);
  return { x: [x[0], x[1]], xs: d.x ? null : x[2], y: d.y || [yr[0], yr[1]], ys: d.y ? null : yr[2] };
}
/**
 * { bonds: [{ name: "Bond X", length: 150 (pm, 10 to 1000), energy: 300 (kJ/mol, 1 to 2000) }] (1 to 3), unit: "pm" |
 * "angstrom" | "nm" (the distance axis), axes: "numbered" | "shape" (no numbers, no grid), guides: false (dashed lines
 * from each minimum to the axes, with its bond length and energy), dots: false, regions: false (repulsion and attraction
 * either side of one curve's minimum), names: true (false: Bond A, B, C), x, y (ranges; fitted by default), heading }.
 * hide: "values" (the guide lines' values), "names" (the bonds as Bond A, B, C), true (both).
 */
export const bondEnergy = {
  check(d) {
    const odd = Object.keys(d).filter(k => !BE_KEYS.includes(k));
    if (odd.length) return [`a bond energy curve does not take "${odd[0]}"`];
    if (!Array.isArray(d.bonds) || d.bonds.length < 1 || d.bonds.length > 3) return ['"bonds" lists 1 to 3 { name, length (pm), energy (kJ/mol) }'];
    for (const [i, b] of d.bonds.entries()) {
      if (!b || !isNum(b.length, 10, 1000) || !isNum(b.energy, 1, 2000)) return [`bond ${i + 1}: "length" is 10 to 1000 pm and "energy" 1 to 2000 kJ/mol`];
      if (Object.keys(b).some(k => !['name', 'length', 'energy'].includes(k))) return [`bond ${i + 1} takes "name", "length" and "energy" only`];
      if (b.name !== undefined && !text(b.name, 24)) return [`bond ${i + 1}: "name" is short text`];
    }
    const keys = d.bonds.map(b => `${b.length}/${b.energy}`);
    if (new Set(keys).size !== keys.length) return ['two bonds have the same length and energy: their curves would be one curve'];
    const out = [];
    if (d.unit !== undefined && !BE_UNITS.includes(d.unit)) out.push(`"unit" must be ${BE_UNITS.map(u => `"${u}"`).join(', ')}`);
    if (d.axes !== undefined && !['numbered', 'shape'].includes(d.axes)) out.push('"axes" must be "numbered" or "shape"');
    for (const k of ['guides', 'dots', 'regions', 'names']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.regions && d.bonds.length > 1) out.push('"regions" marks repulsion and attraction on one curve: draw one bond');
    for (const k of ['x', 'y']) if (d[k] !== undefined && !okRange(d[k])) out.push(`"${k}" is a range [from, to]`);
    if (out.length) return out;
    const R = beRanges(d), u = beUnit(d);
    for (const b of d.bonds) {
      const L = beFromPm(b.length, u);
      if (L <= R.x[0] || L >= R.x[1]) return [`a bond length of ${fmt(L, 3)} ${BE_UNIT_TEXT[u]} is off the distance axis`];
      if (-b.energy <= R.y[0] || R.y[1] <= 0) return [`a bond energy of ${b.energy} kJ/mol is off the energy axis (it must run from below −${b.energy} to above 0)`];
    }
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    return out;
  },
  /** length and energy (the first bond's, in the unit drawn and kJ/mol), minimum (its lowest energy, -energy), zero (where
   *  its curve crosses 0 on the wall), bonds.<A|B|C> ({ length, energy }), strongest and weakest (the letter), shortest
   *  and longest (the letter). */
  solve(d) {
    if (bondEnergy.check(d).length) return null;
    const u = beUnit(d), bonds = {}, by = (f, s) => LETTERS[d.bonds.map(f).indexOf(s(...d.bonds.map(f)))];
    d.bonds.forEach((b, i) => { bonds[LETTERS[i]] = { length: beFromPm(b.length, u), energy: b.energy }; });
    const b0 = d.bonds[0], z = beWallAt(0, b0.length, b0.energy);
    return { length: beFromPm(b0.length, u), energy: b0.energy, minimum: -b0.energy, zero: beFromPm(Math.round(z * 1000) / 1000, u), bonds,
      strongest: by(b => b.energy, Math.max), weakest: by(b => b.energy, Math.min), shortest: by(b => b.length, Math.min), longest: by(b => b.length, Math.max) };
  },
  draw(d, o) {
    const P = palette(o), W = chemWords(o.lang), lang = o.lang, u = beUnit(d), R = beRanges(d), numbered = d.axes !== 'shape';
    const blankV = o.hide === true || hides(o, 'values'), letters = d.names === false || o.hide === true || hides(o, 'names');
    const xt = numbered ? `${W('distance2')} (${BE_UNIT_TEXT[u]})` : W('distance2'), yt = numbered ? `${W('potentialEnergy')} (kJ/mol)` : W('potentialEnergy');
    const every = (r, s) => (s && (r[1] - r[0]) / s > 10 ? 2 * s : s || undefined);
    const A = numbered ? axes(R.x, R.y, o, { w: 440, h: 300, xstep: every(R.x, R.xs), ystep: every(R.y, R.ys), xlabel: xt, ylabel: yt }) : plainAxes(R.x, R.y, o, 440, 300, xt, yt);
    const kids = [...A.kids];
    if (numbered && R.y[0] < 0 && R.y[1] > 0) kids.push(line(r2(A.X(R.x[0])), r2(A.Y(0)), r2(A.X(R.x[1])), r2(A.Y(0)), P.ink, 1.4, { class: 'of-zero' }));
    else if (!numbered) kids.push(line(r2(A.X(R.x[0])), r2(A.Y(0)), r2(A.X(R.x[1])), r2(A.Y(0)), P.ink, 1.4, { 'stroke-dasharray': '6 4', class: 'of-zero' }), label(r2(A.X(R.x[0]) - 8), r2(A.Y(0)), '0', { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
    const ends = [];
    d.bonds.forEach((b, i) => {
      const c = seriesColour(o, i), top = Math.min(R.y[1], b.energy * 3), from = beFromPm(beWallAt(top, b.length, b.energy), u), L = beFromPm(b.length, u);
      const pts = beSamples(L, b.energy, Math.max(from, R.x[0]), R.x[1], 300).filter(p => p.y <= R.y[1] + 1e-9 && p.y >= R.y[0] - 1e-9).map(p => [A.X(p.x), A.Y(p.y)]);
      kids.push(poly(pts, { stroke: o.print ? P.ink : c, 'stroke-width': 3, class: 'of-curve', ...(CG_DASHES[i] ? { 'stroke-dasharray': CG_DASHES[i] } : {}) }));
      if (d.guides) {
        kids.push(line(r2(A.X(R.x[0])), r2(A.Y(-b.energy)), r2(A.X(L)), r2(A.Y(-b.energy)), P.muted, 1.4, { 'stroke-dasharray': '5 4', class: 'of-guide' }), line(r2(A.X(L)), r2(A.Y(-b.energy)), r2(A.X(L)), r2(A.Y(R.y[0])), P.muted, 1.4, { 'stroke-dasharray': '5 4', class: 'of-guide' }));
        if (!numbered || blankV) {
          kids.push(label(r2(A.X(R.x[0]) + 6), r2(A.Y(-b.energy) - 10), blankV ? '______' : `−${fmt(b.energy, 1, lang)}`, { size: 12, colour: P.ink, halo: P.paper, cls: blankV ? 'of-blank' : 'of-value' }),
            label(r2(A.X(L) + 4), r2(A.Y(R.y[0]) - 10), blankV ? '______' : fmt(L, 3, lang), { size: 12, colour: P.ink, halo: P.paper, cls: blankV ? 'of-blank' : 'of-value' }));
        }
      }
      if (d.dots) kids.push(node('circle', { cx: r2(A.X(L)), cy: r2(A.Y(-b.energy)), r: 4.5, fill: o.print ? P.ink : c }));
      const name = letters ? `${W('bond')} ${LETTERS[i]}` : text(b.name, 24) || `${W('bond')} ${i + 1}`;
      ends.push({ name, c, i, x: A.X(L) });
    });
    // each curve's name, at the right of its well, spread apart
    const ys = spreadYs(ends.map(e => A.Y(-d.bonds[e.i].energy) - 14), 18);
    ends.forEach((e, k) => kids.push(label(r2(e.x + 18), r2(ys[k]), e.name, { size: 13, colour: o.print ? P.ink : e.c, halo: P.paper, cls: 'of-bond-name' })));
    if (d.regions && d.bonds.length === 1) {
      const b = d.bonds[0], L = beFromPm(b.length, u), wall = beFromPm(beWallAt(-b.energy * 0.3, b.length, b.energy), u);
      kids.push(label(r2(A.X(wall) - 10), r2(A.Y(-b.energy * 0.3)), W('repulsion'), { anchor: 'end', size: 13, colour: P.ink, halo: P.paper, cls: 'of-region' }),
        label(r2(A.X(Math.min(R.x[1], L * 1.9))), r2(A.Y(-b.energy * 0.55)), W('attraction'), { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-region' }));
    }
    if (d.heading) kids.push(label(A.w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(A.w, A.h, kids, { ...o, kind: 'bondEnergy' }, o.title || W('bondEnergy'));
  },
};

// ---------------------------------------------------------------- equilibrium graph
const EQ_KEYS = ['kind', 'hide', 'reaction', 'start', 'k', 'heat', 'established', 'stresses', 'formulas', 'until', 'y', 'timeUnit', 'heading'];
const EQ_STRESS = ['add', 'remove', 'volume', 'raise', 'lower'];
/** A stress's kind may be its place in EQ_STRESS (0 is add), as a generator deals it. */
const eqNorm = d => (Array.isArray(d.stresses) ? { ...d, stresses: d.stresses.map(s => (s && typeof s.kind === 'number' ? { ...s, kind: EQ_STRESS[s.kind] } : s)) } : d);
const eqRx = d => EQ_REACTIONS[d.reaction || 'ammonia'];
const eqHeat = d => ((d.reaction || 'ammonia') === 'abc' ? d.heat || 'exothermic' : eqRx(d).heat);
const eqStarts = d => d.start || eqRx(d).start;
const eqK = d => (d.k !== undefined ? d.k : eqRx(d).k);
const eqEst = d => d.established ?? 4;
/** The stresses as the model takes them, in order of time. */
function eqModel(d) {
  const heat = eqHeat(d);
  return (d.stresses || []).map(s => {
    const amount = s.amount ?? (s.kind === 'add' ? 0.5 : s.kind === 'remove' ? 0.3 : s.kind === 'volume' ? 0.5 : 2);
    if (s.kind === 'add' || s.kind === 'remove') return { kind: s.kind, at: s.at, species: s.species - 1, amount };
    if (s.kind === 'volume') return { kind: 'volume', at: s.at, factor: amount };
    const f = amount < 1 ? 1 / amount : amount;
    return { kind: 'temperature', at: s.at, kFactor: eqKFactor(heat, s.kind, f), speed: s.kind === 'raise' ? f : 1 / f };
  }).sort((a, b) => a.at - b.at);
}
const eqSpec = d => ({ coefs: eqRx(d).species.map(eqSigned), start: eqStarts(d), k: eqK(d), established: eqEst(d), stresses: eqModel(d) });
/** The time the graph runs to: as given, or until the last shift has settled and stayed level a while. */
function eqUntil(d) {
  if (d.until !== undefined) return d.until;
  const spec = eqSpec(d), last = Math.max(0, ...spec.stresses.map(s => s.at)), { stretches } = eqRun(spec, last + 40 * spec.established), fin = stretches[stretches.length - 1];
  const tail = fin.settledAt === null ? 4 * spec.established : fin.settledAt - fin.from;
  return klNiceRange(0, fin.from + Math.max(2 * tail, spec.established), true)[1];
}
const eqWords = (W, rx, s) => {
  if (s.kind === 'add' || s.kind === 'remove') return `${klFormula(rx.species[s.species - 1][0])} ${W(s.kind === 'add' ? 'added' : 'removed')}`;
  if (s.kind === 'raise' || s.kind === 'lower') return W(s.kind === 'raise' ? 'tempRaised' : 'tempLowered');
  const f = s.amount ?? 0.5;
  if (rx.phase === 'aqueous') return W(f >= 1 ? 'waterAdded' : 'waterEvaporated');
  return W(f === 0.5 ? 'volumeHalved' : f === 2 ? 'volumeDoubled' : f < 1 ? 'volumeDecreased' : 'volumeIncreased');
};
/**
 * { reaction: "ammonia" | "hi" | "n2o4" | "so3" | "pcl5" | "fescn" | "abc" (A + B ⇌ C, made up; heat: "exothermic" |
 * "endothermic"), start: [each species' starting concentration, mol/L, in the equation's order] and k (Kc): example values
 * by default, established: 4 (when equilibrium is first reached, within 1%), stresses: [{ kind: "add" | "remove" (species:
 * its place in the equation from 1, amount in mol/L) | "volume" (amount: the volume's factor, 0.1 to 10) | "raise" |
 * "lower" (amount: how many times K changes, 2 by default; which way is the reaction's heat's to say), at: the time }] (up
 * to 3; a generator may give a kind by its place in that list, 0 to 4; species is read only to add or remove),
 * formulas: true (each line's formula beside it), until, y (the axes' ends; fitted by default), timeUnit: "min",
 * heading }. hide: "stresses" (what each stress was, for the student to say), "formulas" (which line is which), true.
 */
export const equilibrium = {
  check(d0) {
    const odd = Object.keys(d0).filter(k => !EQ_KEYS.includes(k));
    if (odd.length) return [`an equilibrium graph does not take "${odd[0]}"`];
    const d = eqNorm(d0);
    if (d.reaction !== undefined && !EQ_REACTIONS[d.reaction]) return [`"reaction" is one of ${Object.keys(EQ_REACTIONS).join(', ')}`];
    const rx = eqRx(d), n = rx.species.length;
    if (d.start !== undefined && !(Array.isArray(d.start) && d.start.length === n && d.start.every(v => isNum(v, 0, 1000)))) return [`"start" lists ${n} starting concentrations (mol/L), one per species`];
    if (d.k !== undefined && !isNum(d.k, 1e-6, 1e6)) return ['"k" (Kc) is 0.000001 to 1,000,000'];
    if (d.heat !== undefined && ((d.reaction || 'ammonia') !== 'abc' || !['exothermic', 'endothermic'].includes(d.heat))) return ['"heat" is the made-up reaction\'s (reaction "abc"): "exothermic" or "endothermic"; a real one has its own'];
    if (d.established !== undefined && !isNum(d.established, 0.001, 1e5)) return ['"established" is the time equilibrium is first reached, above 0'];
    const st = eqStarts(d), coefs = rx.species.map(eqSigned);
    if (!coefs.some((v, i) => v < 0 && st[i] > 0) && !coefs.some((v, i) => v > 0 && st[i] > 0)) return ['every concentration is 0: nothing can react'];
    if (!(coefs.every((v, i) => v > 0 || st[i] > 0) || coefs.every((v, i) => v < 0 || st[i] > 0))) return ['a reactant and a product are both at 0, so neither reaction can start: give one of them a starting concentration'];
    if (d.stresses !== undefined) {
      if (!Array.isArray(d.stresses) || d.stresses.length > 3) return ['"stresses" lists up to 3 { kind, at, species, amount }'];
      for (const [i, s] of d.stresses.entries()) {
        if (!s || !EQ_STRESS.includes(s.kind)) return [`stress ${i + 1}: "kind" is ${EQ_STRESS.map(x => `"${x}"`).join(', ')}`];
        if (Object.keys(s).some(k => !['kind', 'at', 'species', 'amount', 'text'].includes(k))) return [`stress ${i + 1} takes kind, at, species, amount and text`];
        if (!isNum(s.at, 0.001, 1e6)) return [`stress ${i + 1}: "at" is its time, above 0`];
        if ((s.kind === 'add' || s.kind === 'remove') && !(Number.isInteger(s.species) && s.species >= 1 && s.species <= n)) return [`stress ${i + 1}: "species" is its place in the equation, 1 to ${n}`];
        if (s.amount !== undefined && !isNum(s.amount, 0.001, 1000)) return [`stress ${i + 1}: "amount" is above 0`];
        if (s.kind === 'volume' && s.amount !== undefined && !isNum(s.amount, 0.1, 10)) return [`stress ${i + 1}: a volume changes to 0.1 to 10 times what it was`];
        if (s.kind === 'volume' && s.amount === 1) return [`stress ${i + 1}: a volume change of 1 changes nothing`];
        if (s.text !== undefined && typeof s.text !== 'string') return [`stress ${i + 1}: "text" is its own words`];
      }
      const times = d.stresses.map(s => s.at);
      if (new Set(times).size !== times.length) return ['two stresses at the same time'];
    }
    const out = [];
    if (d.until !== undefined && !isNum(d.until, 0.001, 1e6)) out.push('"until" is the time axis\'s end, above 0');
    if (d.until !== undefined && (d.stresses || []).some(s => s.at >= d.until)) out.push('a stress is at or after the end of the time axis');
    if (d.y !== undefined && !isNum(d.y, 0.001, 1e5)) out.push('"y" is the concentration axis\'s top');
    if (d.timeUnit !== undefined && !KL_TIME_UNITS.includes(d.timeUnit)) out.push(`"timeUnit" is ${KL_TIME_UNITS.join(', ')}`);
    if (d.formulas !== undefined && typeof d.formulas !== 'boolean') out.push('"formulas" must be true or false');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    if (out.length) return out;
    const run = eqRun(eqSpec(d), eqUntil(d)), top = Math.max(...run.stretches.flatMap(s => [...s.start, ...s.end]));
    if (d.y !== undefined && top > d.y) return [`a line goes up to ${fmt(top, 3)} mol/L, above the axis's top (${d.y})`];
    if (run.stretches.some(s => s.short > 1e-9)) return ['a stress removes more of a species than is there'];
    return [];
  },
  /** k (Kc at the start), equilibrium.<species> (the first equilibrium's concentrations, mol/L, by formula as typed:
   *  equilibrium.NH3), shift (the first stress's: "forward" | "reverse" | "none"), shifts.<n>, stress (the first stress's
   *  kind, with the side for add and remove: addReactant, addProduct, removeReactant, removeProduct, volumeDown,
   *  volumeUp, raise, lower), kAfter (Kc at the end), heat ("exothermic" | "endothermic"), until (the time axis's end). */
  solve(d0) {
    if (equilibrium.check(d0).length) return null;
    const d = eqNorm(d0), rx = eqRx(d), until = eqUntil(d), run = eqRun(eqSpec(d), until), first = run.stretches[0], eq = {}, shifts = {};
    rx.species.forEach((s, i) => { eq[s[0]] = Math.round(first.equilibrium[i] * 1e6) / 1e6; });
    const ordered = [...(d.stresses || [])].sort((a, b) => a.at - b.at);
    ordered.forEach((s, i) => { shifts[i + 1] = run.stretches[i + 1] ? run.stretches[i + 1].shift : 'none'; });
    const kindOf = s => (!s ? null : s.kind === 'add' || s.kind === 'remove' ? `${s.kind}${rx.species[s.species - 1][2] === 'r' ? 'Reactant' : 'Product'}` : s.kind === 'volume' ? ((s.amount ?? 0.5) < 1 ? 'volumeDown' : 'volumeUp') : s.kind);
    return { k: eqK(d), equilibrium: eq, shift: shifts[1] || null, shifts, stress: kindOf(ordered[0]), kAfter: run.stretches[run.stretches.length - 1].k, heat: eqHeat(d), until };
  },
  draw(d0, o) {
    const d = eqNorm(d0), P = palette(o), W = chemWords(o.lang), rx = eqRx(d), until = eqUntil(d), run = eqRun(eqSpec(d), until);
    const top = d.y || klNiceRange(0, Math.max(1e-6, ...run.stretches.flatMap(s => [...s.start, ...s.end])) * 1.04, true)[1];
    const tu = d.timeUnit || 'min', hideS = o.hide === true || hides(o, 'stresses'), hideF = o.hide === true || hides(o, 'formulas') || d.formulas === false;
    const A = axes([0, until], [0, top], o, { w: 440, h: 300, xstep: klNiceRange(0, until, true)[2] * (until / klNiceRange(0, until, true)[2] > 10 ? 2 : 1), ystep: klNiceRange(0, top, true)[2] * (top / klNiceRange(0, top, true)[2] > 10 ? 2 : 1), xlabel: `${W('time')} (${tu})`, ylabel: `${W('concentration')} (mol/L)` });
    const kids = [...A.kids], ordered = [...(d.stresses || [])].sort((a, b) => a.at - b.at);
    // the stresses: a dashed line up at each, with what it was over it
    ordered.forEach((s, i) => {
      kids.push(line(r2(A.X(s.at)), r2(A.Y(0)), r2(A.X(s.at)), r2(A.Y(top)), P.muted, 1.2, { 'stroke-dasharray': '4 4', class: 'of-stress' }));
      const words = hideS ? '?' : text(s.text, 40) || eqWords(W, rx, s);
      kids.push(label(r2(A.X(s.at)), r2(A.Y(top) + 10 + (i % 2) * 15), words, { anchor: 'middle', size: 11, colour: P.ink, halo: P.paper, cls: hideS ? 'of-blank' : 'of-stress-name' }));
    });
    // each species' line, solid, dashed or dotted, its formula beside its end
    const ends = [];
    rx.species.forEach((sp, j) => {
      const c = seriesColour(o, j === 0 ? 1 : j === 1 ? 2 : 0);
      for (const st of run.stretches) {
        const pts = st.samples.map(p => [r2(A.X(p.t)), r2(A.Y(p.c[j]))]);
        kids.push(poly(pts, { stroke: o.print ? P.ink : c, 'stroke-width': 2.8, class: 'of-line', ...(CG_DASHES[j] ? { 'stroke-dasharray': CG_DASHES[j] } : {}) }));
      }
      const last = run.stretches[run.stretches.length - 1];
      ends.push({ y: A.Y(last.end[j]), t: klFormula(sp[0]), c });
    });
    if (!hideF) {
      const ys = spreadYs(ends.map(e => e.y - 10), 17);
      ends.forEach((e, j) => kids.push(label(r2(A.X(until) - 4), r2(ys[j]), e.t, { anchor: 'end', size: 13, colour: o.print ? P.ink : e.c, halo: P.paper, cls: 'of-formula' })));
    }
    if (d.heading) kids.push(label(A.w / 2, 10, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    const eqText = `${rx.species.filter(s => s[2] === 'r').map(s => `${s[1] > 1 ? s[1] : ''}${klFormula(s[0])}`).join(' + ')} ⇌ ${rx.species.filter(s => s[2] === 'p').map(s => `${s[1] > 1 ? s[1] : ''}${klFormula(s[0])}`).join(' + ')}`;
    return frame(A.w, A.h, kids, { ...o, kind: 'equilibrium' }, o.title || `${W('equilibriumGraph')}: ${eqText}`);
  },
};

// ---------------------------------------------------------------- rate law graphs
const RL_KEYS = ['kind', 'hide', 'order', 'a0', 'k', 'graphs', 'curve', 'points', 'count', 'noise', 'seed', 'table', 'guides', 'species', 'concUnit', 'timeUnit', 'numbers', 'heading'];
const rlOrder = d => d.order ?? 1;
const rlPlots = d => (!d.graphs || d.graphs === 'all' ? ['conc', 'ln', 'inv'] : [d.graphs]);
/** The time axis: from 0 to when [A] has fallen to a tenth, in tidy steps. */
const rlTime = d => klNiceRange(0, klTimeAtShare(rlOrder(d), d.a0, d.k, 0.1), true);
function rlData(d) {
  const order = rlOrder(d), [, end] = rlTime(d), until = order === 0 ? Math.min(end, klTimeAtShare(order, d.a0, d.k, 0.1)) : end;
  return klDataPoints(order, d.a0, d.k, klDataTimes(until, d.count ?? 8), d.noise ?? 0, d.seed ?? 1);
}
/** One graph's y range: [A] from 0, ln[A] from the lowest to the highest, 1/[A] from 0. */
function rlYRange(d, plot, until) {
  const order = rlOrder(d), lowA = Math.max(klConc(order, d.a0, d.k, until), d.a0 * 0.1);
  if (plot === 'conc') return klNiceRange(0, d.a0 * 1.05, true);
  if (plot === 'inv') return klNiceRange(0, (1 / lowA) * 1.05, true);
  return klNiceRange(Math.log(lowA) - 0.05 * Math.abs(Math.log(d.a0 / lowA)), Math.max(Math.log(d.a0), Math.log(lowA)));
}
/**
 * { order: 0 | 1 | 2 (A -> products, rate = k[A]^order), a0: 1 ([A]0, 0.001 to 100), k: 0.02 (in the order's unit),
 * graphs: "all" | "conc" | "ln" | "inv" ([A], ln[A] or 1/[A] against time), curve: true, points: false (data points),
 * count: 8 (5 to 10), noise: 0 (0, 1, 2 or 5 % scatter), seed: 1, table: "none" | "conc" | "all" (the data under the
 * graphs), guides: 0 (dashed lines at the first 1 to 3 half-lives, on the [A] graph), species: "A" (its formula: N2O5),
 * concUnit: "M" | "mol/L" | "mol dm⁻³", timeUnit: "s" | "min" | "h", numbers: true (false: sketches), heading }.
 * hide: "values" (the half-life guides' times), "data" (the table's [A] column left blank after the first), true.
 */
export const rateLaw = {
  check(d) {
    const odd = Object.keys(d).filter(k => !RL_KEYS.includes(k));
    if (odd.length) return [`a rate law graph does not take "${odd[0]}"`];
    if (d.order !== undefined && ![0, 1, 2].includes(d.order)) return ['"order" is 0, 1 or 2'];
    if (!isNum(d.a0, 0.001, 100)) return ['"a0" ([A]₀) is 0.001 to 100'];
    if (!isNum(d.k, 1e-6, 1e6)) return ['"k" is 0.000001 to 1,000,000, in the order\'s unit'];
    const out = [];
    if (d.graphs !== undefined && !['all', 'conc', 'ln', 'inv'].includes(d.graphs)) out.push('"graphs" must be "all", "conc", "ln" or "inv"');
    for (const k of ['curve', 'points', 'numbers']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.count !== undefined && !(Number.isInteger(d.count) && d.count >= 5 && d.count <= 10)) out.push('"count" is 5 to 10 data points');
    if (d.noise !== undefined && ![0, 1, 2, 5].includes(d.noise)) out.push('"noise" is 0, 1, 2 or 5 (% scatter)');
    if (d.seed !== undefined && !(Number.isInteger(d.seed) && d.seed >= 1 && d.seed <= 999999)) out.push('"seed" is a whole number, 1 to 999999');
    if (d.table !== undefined && !['none', 'conc', 'all'].includes(d.table)) out.push('"table" must be "none", "conc" or "all"');
    if (d.guides !== undefined && !(Number.isInteger(d.guides) && d.guides >= 0 && d.guides <= 3)) out.push('"guides" is 0 to 3 half-lives');
    if (d.species !== undefined && !/^[A-Za-z0-9()+\-]{1,12}$/.test(String(d.species))) out.push('"species" is a short formula (N2O5, Fe3+)');
    if (d.concUnit !== undefined && !KL_CONC_UNITS.includes(d.concUnit)) out.push(`"concUnit" is ${KL_CONC_UNITS.join(', ')}`);
    if (d.timeUnit !== undefined && !KL_TIME_UNITS.includes(d.timeUnit)) out.push(`"timeUnit" is ${KL_TIME_UNITS.join(', ')}`);
    if (d.curve === false && !d.points && (d.table || 'none') === 'none') out.push('with no curve, no points and no table there is nothing to draw');
    if (d.guides && !rlPlots(d).includes('conc')) out.push('the half-life guides go on the [A] graph: draw it');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    if (out.length) return out;
    const [, end, step] = rlTime(d), long = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => fmt(Math.min(end, i * step), 6).length));
    if (long > 6) return [`the time axis's numbers would be long (up to ${fmt(end, 6)}): choose ${end >= 1 ? 'a longer time unit or a larger k' : 'a shorter time unit or a smaller k'}`];
    return [];
  },
  /** order, k, kUnit, halfLife (the first), halfLives (each of the first three: halfLives.1 ...), straight ("conc" | "ln" |
   *  "inv": the graph that is a straight line), slope (of the straight graph: -k, -k or k), intercept, until (the time
   *  axis's end), at.<i> ([A] at each data point, as given), rate0 (the starting rate, k[A]0^order). */
  solve(d) {
    if (rateLaw.check(d).length) return null;
    const order = rlOrder(d), hl = klHalfLives(order, d.a0, d.k, 3), data = rlData(d), at = {};
    data.forEach((p, i) => { at[i + 1] = p.conc; });
    return { order, k: d.k, kUnit: klKUnit(order, d.concUnit || 'M', d.timeUnit || 's'), halfLife: hl[0], halfLives: { 1: hl[0], 2: hl[1], 3: hl[2] }, straight: KL_STRAIGHT[order],
      slope: order === 2 ? d.k : -d.k, intercept: order === 0 ? d.a0 : order === 1 ? Math.log(d.a0) : 1 / d.a0, until: rlTime(d)[1], at, rate0: d.k * d.a0 ** order };
  },
  draw(d, o) {
    const P = palette(o), W = chemWords(o.lang), lang = o.lang, order = rlOrder(d), plots = rlPlots(d), [, until, tstep] = rlTime(d), sp = klFormula(d.species || 'A'), cu = d.concUnit || 'M', tu = d.timeUnit || 's';
    const many = plots.length > 1, pw = many ? 200 : 420, ph = many ? 200 : 280, numbers = d.numbers !== false, data = d.points || (d.table && d.table !== 'none') ? rlData(d) : [];
    const titles = { conc: `[${sp}] (${cu})`, ln: `ln[${sp}]`, inv: `1/[${sp}] (${KL_INVERSE[cu]})` };
    const kids = [], T = d.heading ? 26 : 0;
    let x = 0, H = 0;
    for (const plot of plots) {
      const [y0, y1, ys] = rlYRange(d, plot, until), A = !numbers ? plainAxes([0, until], [y0, y1], o, pw, ph, `${W('time')} (${tu})`, titles[plot]) : axes([0, until], [y0, y1], o, { w: pw, h: ph, xstep: tstep * (until / tstep > 6 && many ? 2 : 1), ystep: ys * ((y1 - y0) / ys > 8 ? 2 : 1), xlabel: `${W('time')} (${tu})`, ylabel: titles[plot] });
      const g = [...A.kids];
      const c = o.print ? P.ink : P.blue, end = Math.min(until, klEnd(order, d.a0, d.k));
      if (d.curve !== false) {
        const pts = [];
        for (let i = 0; i <= 200; i++) { const t = (end * i) / 200, v = klPlotted(plot, klConc(order, d.a0, d.k, t)); if (v !== null && v >= y0 - 1e-9 && v <= y1 + 1e-9) pts.push([r2(A.X(t)), r2(A.Y(v))]); }
        g.push(poly(pts, { stroke: c, 'stroke-width': 2.8, class: `of-curve of-${plot}` }));
      }
      if (d.points) for (const p of data) { const v = p[plot]; if (v !== null && v >= y0 && v <= y1) g.push(node('circle', { cx: r2(A.X(p.t)), cy: r2(A.Y(v)), r: 3.6, fill: o.print ? '#FFFFFF' : P.paper, stroke: P.ink, 'stroke-width': 1.8, class: 'of-point' })); }
      if (d.guides && plot === 'conc') klHalfLives(order, d.a0, d.k, d.guides).forEach((t, i) => {
        const a = d.a0 * 0.5 ** (i + 1);
        g.push(line(r2(A.X(0)), r2(A.Y(a)), r2(A.X(t)), r2(A.Y(a)), P.red, 1.3, { 'stroke-dasharray': '5 4', class: 'of-guide' }), line(r2(A.X(t)), r2(A.Y(a)), r2(A.X(t)), r2(A.Y(y0)), P.red, 1.3, { 'stroke-dasharray': '5 4', class: 'of-guide' }));
        const blank = o.hide === true || hides(o, 'values');
        g.push(label(r2(A.X(t) + 4), r2(A.Y(y0) - 10 - i * 14), blank ? '____' : `${fmt(klSig(t), 3, lang)} ${tu}`, { size: 11, colour: P.red, halo: P.paper, cls: blank ? 'of-blank' : 'of-value' }));
      });
      kids.push(node('g', { transform: `translate(${x} ${T})`, class: `of-panel of-${plot}` }, g));
      x += A.w + (many ? 6 : 0); H = Math.max(H, A.h);
    }
    // the data table: time across, then [A] (and ln[A], 1/[A])
    if (d.table && d.table !== 'none' && data.length) {
      const rows = [[`${W('time')} (${tu})`, ...data.map(p => fmt(p.t, 4, lang))], [titles.conc, ...data.map((p, i) => (i && (o.hide === true || hides(o, 'data')) ? '' : fmt(p.conc, 4, lang)))]];
      if (d.table === 'all') rows.push([titles.ln, ...data.map(p => (p.ln === null ? '' : fmt(p.ln, 3, lang)))], [titles.inv, ...data.map(p => (p.inv === null ? '' : fmt(p.inv, 4, lang)))]);
      const head = 120, cw = Math.max(52, Math.min(70, (Math.max(x, 520) - head - 20) / data.length)), y0 = T + H + 8;
      rows.forEach((r, i) => {
        const y = y0 + i * 24;
        kids.push(node('rect', { x: 10, y, width: head + cw * data.length, height: 24, fill: i ? 'none' : P.soft, stroke: P.ink, 'stroke-width': 1 }));
        kids.push(label(16, y + 12, r[0], { size: 12, colour: P.ink }));
        r.slice(1).forEach((c, j) => { kids.push(line(head + 10 + cw * j, y, head + 10 + cw * j, y + 24, P.ink, 1), label(r2(head + 10 + cw * j + cw / 2), y + 12, c, { anchor: 'middle', size: 12, weight: 600, colour: P.ink, cls: 'of-cell' })); });
      });
      H += rows.length * 24 + 16; x = Math.max(x, head + 20 + cw * data.length);
    }
    if (d.heading) kids.push(label(x / 2, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(x, H + T, kids, { ...o, kind: 'rateLaw' }, o.title || W('rateLaw'));
  },
};

export const CHEM_GRAPH_KINDS = { bondEnergy, equilibrium, rateLaw };
