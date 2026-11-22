// Oomba Figures: ecology graphs (1.3.0, the biology pack). Population growth: J- and S-shaped curves (exponential and
// logistic growth), overshoot around K and boom and crash, as the population size, the growth rate or the per capita
// growth rate over time (or against N), each point worked out from N0, r and K (ported/growth.js), with the carrying
// capacity, the inflection point (N = K/2, the fastest growth rK/4) and the lag, exponential and stationary phases where
// asked, and a census of seeded counts. Predator and prey: the Lotka-Volterra cycles (ported/lotka.js) from the
// populations' averages, their start and the cycle's length, the predators' peaks following the prey's, on one axis or
// two. The checks, the answers (OF.solve) and the drawing are Oomba's own, on the core's axes; in print the curves are
// told apart by solid and dashed lines and their names, never by color alone.
import { node, label, line, poly, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';
import { PG_MODELS, pgCurves, pgHasK, pgHasLogistic, pgSolve, pgRateAtN, pgPerCapitaAtN, pgInflection, pgPhases, pgCensus } from './ported/growth.js';
import { lvBalance, lvExtremes, lvSimulate, lvAtBalance, lvTurns, lvPeriod, lvLag, lvRatesFor, LV_PAIRS } from './ported/lotka.js';

const ecoOdd = (d, keys, what) => { const k = Object.keys(d).find(x => !keys.includes(x)); return k ? [`${what} does not take "${k}"`] : []; };
/** A polyline cut where it leaves the plot (a curve that runs off the top stops at the edge, never squashed). */
function clipped(pts, top, bottom, attrs) {
  const runs = [[]];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], inside = y >= top - 0.5 && y <= bottom + 0.5, cur = runs[runs.length - 1];
    if (inside) {
      if (!cur.length && i > 0) { const [px, py] = pts[i - 1], ey = py < top ? top : bottom; cur.push([px + ((x - px) * (ey - py)) / (y - py || 1), ey]); }
      cur.push([x, y]);
    } else if (cur.length) {
      const [px, py] = pts[i - 1], ey = y < top ? top : bottom; cur.push([px + ((x - px) * (ey - py)) / (y - py || 1), ey]); runs.push([]);
    }
  }
  return runs.filter(r => r.length > 1).map(r => poly(r, attrs));
}
const nice = (hi, n = 6) => { const s = niceStep(hi > 0 ? hi : 1, n); return { top: Math.ceil(hi / s - 1e-9) * s || s, step: s }; };

// ---------------------------------------------------------------- population growth
const PG_KEYS = ['kind', 'hide', 'model', 'n0', 'r', 'k', 'lag', 'span', 'unit', 'graph', 'against', 'census', 'kLine', 'inflection', 'phases', 'names', 'heading', 'xtitle', 'ytitle'];
const pgOf = d => ({ model: d.model || 'logistic', n0: d.n0, r: d.r, k: d.k, lag: d.lag ?? 2.5, span: d.span ?? 20, graph: d.graph || 'size', against: d.against || 'time' });
/**
 * { model: "logistic" | "exponential" | "both" | "overshoot" | "crash", n0, r (per capita, per unit of time), k (the
 * carrying capacity; a crash's peak), lag (overshoot, 2.5), span (20), unit ("years"), graph: "size" | "rate" |
 * "perCapita", against: "time" | "size" (a rate against N; logistic, exponential or both), census: { every, noise (%),
 * seed }, kLine (true), inflection, phases, names, heading, xtitle, ytitle }. hide: "k" (the K line's number), "curve"
 * (axes, K and the census only), true (both).
 */
export const populationGrowth = {
  check(d) {
    const out = ecoOdd(d, PG_KEYS, 'a population growth graph');
    if (out.length) return out;
    const g = pgOf(d);
    if (!PG_MODELS.includes(g.model)) return [`"model" must be one of ${PG_MODELS.join(', ')}`];
    if (!isNum(d.n0, 1e-6, 1e9) || d.n0 <= 0) out.push('"n0", the starting population, must be above 0 (at most 10⁹)');
    if (!isNum(d.r, 1e-6, 10) || d.r <= 0) out.push('"r", the growth rate, must be above 0 (at most 10 per unit of time)');
    if (!isNum(g.span, 1e-6, 10000) || g.span <= 0) out.push('"span", how long the graph runs, must be above 0');
    if (g.model !== 'exponential' && !isNum(d.k, 1e-6, 1e10)) out.push(g.model === 'crash' ? '"k" is the peak the population booms to: a number above 0' : '"k", the carrying capacity, must be a number above 0');
    if (g.model === 'overshoot' && !isNum(g.lag, 0.05, 1000)) out.push('"lag" must be 0.05 to 1000 units of time');
    if (g.model !== 'overshoot' && d.lag !== undefined) out.push('"lag" is for the overshoot model only');
    if (g.model === 'exponential' && d.k !== undefined) out.push('exponential growth has no carrying capacity: leave out "k" (or use "both")');
    if (!['size', 'rate', 'perCapita'].includes(g.graph)) out.push('"graph" must be "size", "rate" or "perCapita"');
    if (!['time', 'size'].includes(g.against)) out.push('"against" must be "time" or "size"');
    if (d.unit !== undefined && !text(d.unit, 16)) out.push('"unit" must be a short word, like "years"');
    for (const b of ['kLine', 'inflection', 'phases', 'names']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
    if (out.length) return out;
    if (g.model === 'crash' && d.k <= d.n0) out.push('a crash\'s peak "k" must be bigger than the starting population');
    if (g.against === 'size' && (g.graph === 'size' || !['logistic', 'exponential', 'both'].includes(g.model))) out.push('"against": "size" draws a growth rate against N, for the logistic, exponential or both models');
    if (pgCurves(g.model).includes('exponential') && g.n0 * Math.exp(g.r * g.span) > 1e12 && g.model !== 'both') out.push('the exponential curve passes 10¹² before the end: shorten "span" or lower "r"');
    if ((d.inflection || d.phases) && !(pgHasLogistic(g.model) && pgInflection(g))) out.push('an inflection point (and the phases) needs a logistic curve that starts below K/2');
    if (d.phases && g.graph !== 'size') out.push('the phases are marked on the population size graph');
    if (d.census !== undefined) {
      const c = d.census;
      if (!c || typeof c !== 'object' || !isNum(c.every, 1e-6) || c.every <= 0) out.push('"census" is { every (above 0), noise (% , 0 to 50), seed }');
      else {
        if (g.span / c.every > 200) out.push('a census of more than 200 counts: count less often');
        if (c.noise !== undefined && !isNum(c.noise, 0, 50)) out.push('"census.noise" is a percent from 0 to 50');
        if (c.seed !== undefined && !(Number.isInteger(c.seed) && c.seed >= 0)) out.push('"census.seed" must be a whole number');
        if (g.graph !== 'size' || g.against !== 'time') out.push('a census is counted on the population size graph over time');
      }
    }
    return out;
  },
  /** The numbers behind it: k, the doubling time (ln 2 / r), N at the end, the inflection point and fastest growth (rK/4),
   *  the phases, a crash's peak, and the census counts. */
  solve(d) {
    if (populationGrowth.check(d).length) return null;
    const g = pgOf(d), G = { n0: d.n0, r: d.r, k: d.k, lag: g.lag }, curves = pgCurves(g.model), sol = pgSolve(curves[0], G, g.span), p = pgInflection(G);
    const out = { model: g.model, n0: d.n0, r: d.r, final: sol.n(g.span), doubling: Math.LN2 / d.r };
    if (pgHasK(g.model)) out.k = d.k;
    if (pgHasLogistic(g.model)) { out.maxRate = (d.r * d.k) / 4; if (p) { out.inflection = { t: p.t, n: p.n, rate: p.rate }; const ph = pgPhases(G); out.phases = { lagEnd: ph.lagEnd, stationary: ph.stationary }; } }
    if (curves.includes('exponential')) out.exponentialFinal = d.n0 * Math.exp(d.r * g.span);
    if (g.model === 'crash' || g.model === 'overshoot') { let top = 0, at = 0; for (let i = 0; i <= 800; i++) { const t = (g.span * i) / 800, n = sol.n(t); if (n > top) { top = n; at = t; } } out.peak = top; out.peakAt = at; }
    if (d.census) out.census = pgCensus(sol, d.census.every, g.span, d.census.noise || 0, d.census.seed || 1);
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), g = pgOf(d), G = { n0: d.n0, r: d.r, k: d.k, lag: g.lag }, curves = pgCurves(g.model), sols = curves.map(c => pgSolve(c, G, g.span));
    const fitted = g.model === 'both' ? sols.slice(0, 1) : sols, view = g.graph, vOf = (s, t) => (view === 'size' ? s.n(t) : view === 'rate' ? s.rate(t) : s.perCapita(t));
    let lo = 0, hi = 0;
    for (const s of fitted) for (let i = 0; i <= 400; i++) { const v = vOf(s, (g.span * i) / 400); if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    const sizeHi = Math.max(hi, pgHasK(g.model) ? d.k : 0);
    let xr = [0, g.span], xs = niceStep(g.span, 8);
    if (g.against === 'size') { const nx = nice(Math.max(...fitted.map(s => s.n(g.span)), pgHasK(g.model) ? d.k : 0) * (g.model === 'both' ? 1 : 1.08), 8); xr = [0, nx.top]; xs = nx.step; }
    if (g.against === 'size') hi = view === 'perCapita' ? d.r : g.model === 'exponential' ? d.r * xr[1] : (d.r * d.k) / 4;
    const head = g.model === 'both' ? 1.3 : view === 'size' ? (pgHasK(g.model) ? 1.1 : 1.08) : 1.25, Y = nice((view === 'size' ? sizeHi : hi) * head, 6);
    const yLo = lo < 0 ? -nice(-lo * 1.1, 3).top : 0, ys = lo < 0 ? niceStep(Y.top - yLo, 6) : Y.step;
    const ytitle = text(d.ytitle, 50) || (view === 'size' ? W('popSize') : view === 'rate' ? W('growthRate') : W('perCapita'));
    const xtitle = text(d.xtitle, 50) || (g.against === 'size' ? W('popSize') : axisTitle(W('time'), text(d.unit, 16)));
    const A = axes(xr, [yLo, Y.top], o, { w: 440, h: 270, xstep: xs, ystep: ys, xlabel: xtitle, ...(Y.top >= 10000 ? { ytitle } : { ylabel: ytitle }) });
    const kids = [...A.kids], top = A.Y(Y.top), bottom = A.Y(yLo), hideAll = o.hide === true, noCurve = hideAll || hides(o, 'curve');
    if (lo < 0) kids.push(line(A.X(xr[0]), A.Y(0), A.X(xr[1]), A.Y(0), P.ink, 1.4));
    // the carrying capacity, a dashed line across at K (population size), with its value unless it is the answer
    if (view === 'size' && pgHasK(g.model) && d.kLine !== false) {
      kids.push(line(A.X(xr[0]), A.Y(d.k), A.X(xr[1]), A.Y(d.k), P.red, 1.8, { 'stroke-dasharray': '8 6', class: 'of-k' }));
      kids.push(label(A.X(xr[1]) - 4, A.Y(d.k) - 10, hideAll || hides(o, 'k') ? `${W('carryingCapacity')} (K)` : `K = ${fmt(d.k, 2, o.lang)}`, { anchor: 'end', size: 12, colour: P.red, halo: P.paper, cls: 'of-k-label' }));
    }
    const dashes = [null, '9 6'], colours = [P.green, P.blue];
    if (!noCurve) curves.forEach((c, i) => {
      const s = sols[i], pts = [];
      for (let k = 0; k <= 300; k++) {
        if (g.against === 'size') { const n = (xr[1] * k) / 300; if (c === 'logistic' && n > d.k * 1.0001) break; pts.push([A.X(n), A.Y(view === 'rate' ? pgRateAtN(c, G, n) : pgPerCapitaAtN(c, G, n))]); }
        else { const t = (g.span * k) / 300; pts.push([A.X(t), A.Y(vOf(s, t))]); }
      }
      kids.push(...clipped(pts, top, bottom, { stroke: colours[i], 'stroke-width': 3.2, 'stroke-dasharray': dashes[i], class: `of-curve of-${c}` }));
      if (curves.length > 1 || d.names) {
        const last = [...pts].reverse().find(p => p[1] >= top - 0.5 && p[1] <= bottom + 0.5) || pts[pts.length - 1];
        kids.push(label(r2(Math.min(last[0], A.X(xr[1])) - 4), r2(Math.max(top + 10, i === 0 && pgHasK(g.model) ? last[1] + 16 : last[1] - 12)), W(c), { anchor: 'end', size: 12, colour: colours[i], halo: P.paper, cls: 'of-name' }));
      }
    });
    if (d.census && !noCurve) for (const c of pgCensus(sols[0], d.census.every, g.span, d.census.noise || 0, d.census.seed || 1)) {
      const y = A.Y(c.n); if (y < top - 1) continue;
      kids.push(node('circle', { cx: r2(A.X(c.t)), cy: r2(y), r: 4, fill: P.paper, stroke: P.ink, 'stroke-width': 1.8, class: 'of-census' }));
    }
    const p = pgInflection(G);
    if (d.inflection && p && !noCurve) {
      const x = g.against === 'size' ? A.X(p.n) : A.X(p.t), y = view === 'size' ? A.Y(p.n) : view === 'rate' ? A.Y(p.rate) : A.Y(d.r / 2);
      kids.push(node('circle', { cx: r2(x), cy: r2(y), r: 5.5, fill: P.red, class: 'of-inflection' }));
      kids.push(label(r2(x + 9), r2(y + 14), view === 'size' ? `${W('inflectionPoint')} (N = K/2)` : `${W('fastestGrowth')} (N = K/2)`, { size: 12, colour: P.red, halo: P.paper }));
    }
    if (d.phases && p) {
      const ph = pgPhases(G), marks = [ph.lagEnd, ph.stationary].filter(t => t !== null && t < g.span);
      for (const t of marks) kids.push(line(A.X(t), top, A.X(t), bottom, P.muted, 1.4, { 'stroke-dasharray': '4 5', class: 'of-phase' }));
      const edges = [0, ...marks, g.span], names = ph.lagEnd !== null ? ['lagPhase', 'expPhase', 'statPhase'] : ['expPhase', 'statPhase'];
      for (let i = 0; i < edges.length - 1 && i < names.length; i++) kids.push(label(r2((A.X(edges[i]) + A.X(edges[i + 1])) / 2), top + 12 + 14 * (i % 2), W(names[i]), { anchor: 'middle', size: 11, colour: P.ink2, halo: P.paper, cls: 'of-phase-name' }));
    }
    if (d.heading) kids.push(label(A.w / 2, 11, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(A.w, A.h, kids, { ...o, kind: 'populationGrowth' }, o.title || W('populationGrowth'));
  },
};

// ---------------------------------------------------------------- predator and prey
const LV_KEYS = ['kind', 'hide', 'pair', 'prey', 'predators', 'period', 'span', 'unit', 'scale', 'names', 'peaks', 'heading', 'xtitle', 'ytitle'];
/** The model's numbers from the data: a pair's, overridden by anything given. */
function lvOf(d) {
  const p = (d.pair && LV_PAIRS[d.pair]) || {}, prey = d.prey || {}, pred = d.predators || {};
  return {
    balance: { prey: prey.average ?? p.preyAverage, predators: pred.average ?? p.predatorAverage }, start: { prey: prey.start ?? p.preyStart, predators: pred.start ?? p.predatorStart },
    period: d.period ?? p.period, span: d.span ?? p.span ?? (d.period ?? p.period) * 4, unit: d.unit ?? p.unit ?? 'years', scale: d.scale || p.scale || 'shared',
  };
}
/**
 * { pair: "hare-lynx" | "rabbit-wolf" | "rabbit-fox" | "moose-wolf" | "mouse-owl" | "aphid-ladybug" (classroom numbers),
 * or prey: { average, start }, predators: { average, start }, period (one cycle), span (4 cycles), unit ("years"), scale:
 * "shared" | "two" (prey on the left axis, predators on the right), names: ["Hares", "Lynx"], peaks (mark the first peak
 * of each), heading, xtitle, ytitle }. The averages are the balance point the cycles go around. hide: "predators" (the
 * predator curve left out, to sketch), true (both curves).
 */
export const predatorPrey = {
  check(d) {
    const out = ecoOdd(d, LV_KEYS, 'a predator-prey graph');
    if (out.length) return out;
    if (d.pair !== undefined && !Object.prototype.hasOwnProperty.call(LV_PAIRS, d.pair)) return [`"pair" must be one of ${Object.keys(LV_PAIRS).join(', ')}`];
    for (const who of ['prey', 'predators']) if (d[who] !== undefined && (!d[who] || typeof d[who] !== 'object' || Object.keys(d[who]).some(k => !['average', 'start'].includes(k)))) return [`"${who}" is { average, start }`];
    const m = lvOf(d);
    for (const who of ['prey', 'predators']) {
      if (!isNum(m.balance[who], 1e-3, 1e7)) out.push(`the ${who}' average (the balance point) must be a number above 0`);
      if (!isNum(m.start[who], 1e-3, 1e7)) out.push(`the ${who}' start must be a number above 0`);
    }
    if (!isNum(m.period, 1e-3, 1e5)) out.push('"period", how long one cycle takes, must be above 0');
    if (out.length) return out;
    if (!isNum(m.span, m.period / 2, m.period * 12)) out.push('"span" must be half a cycle to 12 cycles long');
    if (!['shared', 'two'].includes(m.scale)) out.push('"scale" must be "shared" or "two"');
    if (d.names !== undefined && (!Array.isArray(d.names) || d.names.length !== 2 || d.names.some(n => !text(n, 20)))) out.push('"names" is [the prey\'s name, the predators\' name]');
    if (d.peaks !== undefined && typeof d.peaks !== 'boolean') out.push('"peaks" must be true or false');
    if (Math.abs(m.start.prey / m.balance.prey - 1) < 1e-6 && Math.abs(m.start.predators / m.balance.predators - 1) < 1e-6) out.push('starting at the balance point, nothing cycles: start away from the averages');
    return out;
  },
  /** The cycle: its period, how long the predators' peak lags the prey's, each population's high, low and average. */
  solve(d) {
    if (predatorPrey.check(d).length) return null;
    const m = lvOf(d), r = lvRatesFor(m.balance, m.start, m.period), e = lvExtremes(r, m.start), period = lvPeriod(r, m.start);
    const turns = lvTurns(r, lvSimulate(r, m.start, m.span));
    return { period, lag: lvLag(r, m.start, period), prey: { average: m.balance.prey, high: e.prey.high, low: e.prey.low }, predators: { average: m.balance.predators, high: e.predators.high, low: e.predators.low },
      preyPeak: turns.preyPeaks[0] ? turns.preyPeaks[0].t : null, predatorPeak: turns.predatorPeaks[0] ? turns.predatorPeaks[0].t : null, rates: r };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), m = lvOf(d), r = lvRatesFor(m.balance, m.start, m.period), run = lvSimulate(r, m.start, m.span), two = m.scale === 'two';
    const names = d.names ? d.names.map(n => text(n, 20)) : [W('prey'), W('predators')];
    const pmax = Math.max(...run.prey), qmax = Math.max(...run.predators), L = nice(two ? pmax * 1.32 : Math.max(pmax, qmax) * 1.32, 6), R = two ? nice(qmax * 1.32, 6) : L;
    const ytitle = text(d.ytitle, 50) || (two ? axisTitle(W('population'), names[0]) : W('population'));
    const A = axes([0, m.span], [0, L.top], o, { w: 440, h: 260, xstep: niceStep(m.span, 8), ystep: L.step, xlabel: text(d.xtitle, 50) || axisTitle(W('time'), text(m.unit, 16)), ylabel: ytitle });
    const kids = [...A.kids], YR = v => A.Y((v / R.top) * L.top);
    let w = A.w;
    if (two) {
      // the predators' own axis on the right, its ticks at its own nice steps
      const x = A.X(m.span);
      kids.push(line(x, A.Y(0), x, A.Y(L.top) - 8, P.ink, 2));
      for (let v = R.step; v <= R.top + 1e-9; v += R.step) kids.push(line(x - 4, YR(v), x + 4, YR(v), P.ink, 1.5), label(x + 8, YR(v), fmt(v, String(R.step).includes('.') ? 2 : 0, o.lang), { size: 12, weight: 600, colour: P.ink2 }));
      w += 46;
      kids.push(node('g', { transform: `translate(${r2(w - 12)} ${r2(A.Y(L.top / 2))}) rotate(90)` }, label(0, 0, axisTitle(W('population'), names[1]), { anchor: 'middle', size: 13, colour: P.ink })));
    }
    const hideAll = o.hide === true, series = [[run.prey, A.Y, P.green, null], [run.predators, two ? YR : A.Y, P.blue, '9 6']];
    series.forEach(([vals, y, c, dash], i) => {
      if (hideAll || (i === 1 && hides(o, 'predators'))) return;
      const pts = []; const stepN = Math.max(1, Math.floor(vals.length / 600));
      for (let k = 0; k < vals.length; k += stepN) pts.push([A.X(run.t[k]), y(vals[k])]);
      pts.push([A.X(run.t[vals.length - 1]), y(vals[vals.length - 1])]);
      kids.push(poly(pts, { stroke: c, 'stroke-width': 3.2, 'stroke-dasharray': dash, class: `of-curve of-${i ? 'predators' : 'prey'}` }));
    });
    if (d.peaks && !hideAll) {
      const t = lvTurns(r, run);
      [[t.preyPeaks[0], A.Y, P.green], [hides(o, 'predators') ? null : t.predatorPeaks[0], two ? YR : A.Y, P.blue]].forEach(([pk, y, c]) => {
        if (!pk) return;
        kids.push(line(A.X(pk.t), y(pk.value), A.X(pk.t), A.Y(0), c, 1.4, { 'stroke-dasharray': '4 4', class: 'of-peak' }), node('circle', { cx: r2(A.X(pk.t)), cy: r2(y(pk.value)), r: 4.5, fill: c }));
      });
    }
    // the key: a short line of each curve's style and its name, so print tells them apart without color
    const kx = A.X(0) + 12, ky = A.Y(L.top) + 12;
    names.forEach((n, i) => {
      if (i === 1 && hides(o, 'predators')) return;
      kids.push(line(kx, ky + 18 * i, kx + 26, ky + 18 * i, i ? P.blue : P.green, 3.2, { 'stroke-dasharray': i ? '9 6' : null }), label(kx + 32, ky + 18 * i, n, { size: 12, colour: P.ink, halo: P.paper, cls: 'of-name' }));
    });
    if (d.heading) kids.push(label(w / 2, 11, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(w, A.h, kids, { ...o, kind: 'predatorPrey' }, o.title || W('predatorPrey'));
  },
};
export const ECOLOGY_KINDS = { populationGrowth, predatorPrey };
