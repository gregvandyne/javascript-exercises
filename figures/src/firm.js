// Oomba Figures: the firm and production possibilities (1.4.0, the economics pack). Cost and revenue curves: one
// firm's MC, ATC, AVC and AFC from one cubic total cost (MC crosses AVC and ATC at their lowest points, exactly), as a
// perfectly competitive firm at a price (profit, break-even, loss, the shutdown point, shut down), a monopoly (MR = MC,
// the price off demand, regulated at P = MC or P = ATC) or a monopolistically competitive firm (short run, or long run
// with demand tangent to ATC and excess capacity); profit or loss, consumer surplus and deadweight loss shaded. The
// production possibilities curve: bowed out, straight or bowed in, points on, inside and outside it, a shift out or in
// (or a pivot), the opportunity cost of each step along it, and two countries' straight curves for comparative
// advantage, on one graph or side by side. The models are ported (ported/firm.js); the checks, the answers (OF.solve)
// and the drawing are Oomba's own.
import { node, palette, isNum, text, hides, r2, line, label, frame, fmt } from './svg.js';
import { figWords } from './words.js';
import { niceStep } from './graphs.js';
import { ecGraphOf, ecArea, EC_SHIFT_SHARE } from './ported/econcurves.js';
import { fmMC, fmAVC, fmAFC, fmATC, fmMinATC, fmMinAVC, fmCostsOf, fmPriceTaker, fmPriceMaker, fmDemandMeetsMC, fmDemandMeetsATC, fmLongRunDemand, fmPricesOf, fmPriceOn, fmMROn, FM_SHORT_RUN_GAP, FM_LONG_RUN_TOP, ppBendOf, ppCurve, ppOnCurve, ppReach, PP_BASE, PP_OUTER, PP_INSIDE, PP_OUTSIDE } from './ported/firm.js';
import { ecOdd, ecSize, ecBool, ecName, ecLabelsCheck, ecNameAt, ecPlot, ecCurve, ecEnd, ecGuide, ecMark, ecMarksX, ecDot, ecShiftArrows, ecRegion, ecBrace, ecHeading, ecText } from './econ.js';

const fiNearly = (a, b) => Math.abs(a - b) < 1e-6;

// ---------------------------------------------------------------- cost and revenue curves
const CC_KEYS = ['kind', 'hide', 'market', 'atc', 'mcSlope', 'fixed', 'avc', 'afc', 'price', 'demand', 'regulation', 'run', 'outcome', 'shade', 'minimums', 'guides', 'axes', 'labels', 'xtitle', 'ytitle', 'heading'];
const CC_MARKETS = ['costs', 'perfect', 'monopoly', 'monopolistic'];
const CC_PRICES = ['profit', 'breakeven', 'loss', 'shutdownPoint', 'shutdown'];
const CC_LABELS = ['MC', 'ATC', 'AVC', 'AFC', 'D', 'MR', 'P', 'Q'];
const CC_BOX = { x0: 0, x1: 10, y0: 0, y1: 10 }, CC_DRAW = { x0: 0, x1: 9.4, y0: 0.4, y1: 9.6 }, CC_Q0 = 0.25;
function ccModel(d) {
  const market = d.market || 'costs', at = d.atc || { q: 6, cost: 4.5 }, c = fmCostsOf({ q: at.q, cost: at.cost, slope: d.mcSlope ?? 1.5, fixed: d.fixed ?? 0.6 }), k = c.costs;
  const lowATC = fmMinATC(k), lowAVC = fmMinAVC(k), out = { market, k, lowered: c.lowered, lowATC, lowAVC };
  if (market === 'perfect') {
    const price = typeof d.price === 'number' ? d.price : fmPricesOf(k)[d.price || 'profit'];
    Object.assign(out, { price, firm: fmPriceTaker(k, price) });
  }
  if (market === 'monopoly' || market === 'monopolistic') {
    let dem, tangent;
    if (market === 'monopolistic') {
      const lr = fmLongRunDemand(k, lowATC.v + FM_LONG_RUN_TOP * (CC_DRAW.y1 - 0.2 - lowATC.v));
      if ((d.run || 'short') === 'long') { dem = lr.d; tangent = lr.q; } else dem = { ...lr.d, top: lr.d.top + ((d.outcome || 'profit') === 'profit' ? FM_SHORT_RUN_GAP : -FM_SHORT_RUN_GAP) };
    } else { const dm = d.demand || { top: 9.4, end: 12 }; dem = { top: dm.top, slope: dm.top / dm.end }; }
    const firm = fmPriceMaker(k, dem), qSO = fmDemandMeetsMC(k, dem), qFR = market === 'monopoly' ? fmDemandMeetsATC(k, dem) : null, reg = market === 'monopoly' ? d.regulation || 'none' : 'none';
    let at2 = firm && !firm.shutdown ? { q: firm.q, p: firm.p } : null;
    if (reg === 'optimal' && qSO !== null) at2 = { q: qSO, p: fmPriceOn(dem, qSO) };
    if (reg === 'fair' && qFR !== null) at2 = { q: qFR, p: fmPriceOn(dem, qFR) };
    Object.assign(out, { demand: dem, tangent, firm, qSO, qFR, reg, at: at2 });
  }
  return out;
}
/** The shaded regions: profit or loss (a rectangle from the price axis to q, between the price and ATC at q), consumer surplus and deadweight loss. */
function ccRegions(d, m) {
  const out = {}, k = m.k, between = (top, bottom, a, b) => { const up = [], dn = []; for (let i = 0; i <= 64; i++) { const x = a + ((b - a) * i) / 64; up.push({ x, y: top(x) }); dn.push({ x, y: bottom(x) }); } return [...up, ...dn.reverse()]; };
  const rect = (q, y0, y1) => [{ x: 0, y: y0 }, { x: 0, y: y1 }, { x: q, y: y1 }, { x: q, y: y0 }];
  let q = null, p = null;
  if (m.market === 'perfect' && !m.firm.shutdown) { q = m.firm.q; p = m.price; }
  if ((m.market === 'monopoly' || m.market === 'monopolistic') && m.at) { q = m.at.q; p = m.at.p; }
  if (q !== null && !(m.market === 'monopolistic' && m.tangent !== undefined)) {
    const c = fmATC(k, q);
    if (Math.abs(p - c) > 0.02) out[p > c ? 'profit' : 'loss'] = rect(q, Math.min(p, c), Math.max(p, c));
  }
  if (m.demand && m.at) {
    out.cs = between(x => fmPriceOn(m.demand, x), () => m.at.p, 0, m.at.q);
    if (m.qSO !== null && Math.abs(m.qSO - m.at.q) > 0.02) {
      const over = m.at.q > m.qSO, a = Math.min(m.at.q, m.qSO), b = Math.max(m.at.q, m.qSO);
      out.dwl = between(over ? x => fmMC(k, x) : x => fmPriceOn(m.demand, x), over ? x => fmPriceOn(m.demand, x) : x => fmMC(k, x), a, b);
    }
  }
  return out;
}
/**
 * { market: "costs" | "perfect" | "monopoly" | "monopolistic", atc: { q, cost } (where ATC is lowest, on the hidden
 * 0-to-10 grid: q 3 to 8, cost 2 to 7), mcSlope (MC's slope there, 0.3 to 3), fixed (how much of the cost is fixed,
 * 0.2 to 0.9), avc, afc, price ("profit", "breakeven", "loss", "shutdownPoint", "shutdown", or a number: a perfectly
 * competitive firm's), demand: { top, end } (a monopoly's, where it meets each axis), regulation: "none" | "optimal" |
 * "fair" (a monopoly), run: "short" | "long", outcome: "profit" | "loss" (a monopolistic competitor in the short run),
 * shade: ["profit", "cs", "dwl"] ("profit" shades the profit or the loss), minimums (the lowest ATC and AVC marked),
 * guides, axes: "schematic" | "numbered", labels: { MC, ATC, AVC, AFC, D, MR, P, Q }, xtitle, ytitle, heading }.
 * hide: "values", "areas", "names" (the curves' names, as lines to write on), true.
 */
export const costCurves = {
  check(d) {
    const out = ecOdd(d, CC_KEYS, 'a cost and revenue graph');
    if (out.length) return out;
    const market = d.market || 'costs';
    if (!CC_MARKETS.includes(market)) return [`"market" is one of ${CC_MARKETS.join(', ')}`];
    if (d.atc !== undefined && !(d.atc && typeof d.atc === 'object' && Object.keys(d.atc).every(k => ['q', 'cost'].includes(k)) && isNum(d.atc.q, 3, 8) && isNum(d.atc.cost, 2, 7))) out.push('"atc" is { q (3 to 8), cost (2 to 7) }: where ATC is lowest');
    if (d.mcSlope !== undefined && !isNum(d.mcSlope, 0.3, 3)) out.push('"mcSlope" is 0.3 to 3');
    if (d.fixed !== undefined && !isNum(d.fixed, 0.2, 0.9)) out.push('"fixed" is 0.2 to 0.9');
    out.push(...ecBool(d, ['avc', 'afc', 'minimums', 'guides']), ...ecLabelsCheck(d, CC_LABELS));
    if (d.price !== undefined && (market !== 'perfect' || !(CC_PRICES.includes(d.price) || isNum(d.price, 0.3, 9.5)))) out.push(`"price" is for a perfectly competitive firm: ${CC_PRICES.join(', ')} or a number (0.3 to 9.5)`);
    if (d.demand !== undefined && (market !== 'monopoly' || !(d.demand && typeof d.demand === 'object' && Object.keys(d.demand).every(k => ['top', 'end'].includes(k)) && isNum(d.demand.top, 4, 9.6) && isNum(d.demand.end, 4, 25)))) out.push('"demand" is a monopoly\'s { top (4 to 9.6), end (4 to 25) }');
    if (d.regulation !== undefined && (market !== 'monopoly' || !['none', 'optimal', 'fair'].includes(d.regulation))) out.push('"regulation" ("none", "optimal", "fair") is for a monopoly');
    if (d.run !== undefined && (market !== 'monopolistic' || !['short', 'long'].includes(d.run))) out.push('"run" ("short", "long") is for monopolistic competition');
    if (d.outcome !== undefined && (market !== 'monopolistic' || (d.run || 'short') !== 'short' || !['profit', 'loss'].includes(d.outcome))) out.push('"outcome" ("profit", "loss") is for monopolistic competition in the short run');
    if (d.shade !== undefined && (!Array.isArray(d.shade) || d.shade.some(s => !['profit', 'cs', 'dwl'].includes(s)))) out.push('"shade" is a list of profit, cs, dwl');
    if (d.axes !== undefined && !['schematic', 'numbered'].includes(d.axes)) out.push('"axes" is "schematic" or "numbered"');
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    const m = ccModel(d), shade = d.shade || [];
    if (m.lowered) out.push('MC would dip below the quantity axis: lower "mcSlope", raise the lowest cost or lower "fixed"');
    if (m.market === 'perfect' && !m.firm.shutdown && m.firm.q > CC_DRAW.x1) out.push('at this price the firm makes more than the graph shows: lower the price or make MC steeper');
    if (m.market === 'perfect' && m.price > CC_DRAW.y1) out.push('the price is above the graph');
    if (m.demand) {
      if (!m.firm) out.push('demand is too low for MR ever to reach MC: the firm would make nothing');
      else if (m.firm.q > CC_DRAW.x1 || m.firm.p > CC_DRAW.y1) out.push('where MR = MC is off the graph: lower demand or raise costs');
      if (m.reg === 'optimal' && m.qSO === null) out.push('demand never meets MC: there is no socially optimal price');
      if (m.reg === 'fair' && m.qFR === null) out.push('demand is below ATC everywhere: no price lets this monopoly break even');
      if (!m.at && m.firm && m.firm.shutdown) out.push('at MR = MC the price is below AVC: this firm would shut down');
    }
    if (shade.includes('cs') && !m.demand) out.push('consumer surplus is shaded under a monopoly\'s or a monopolistic competitor\'s demand');
    if (shade.includes('dwl') && !(m.demand && m.qSO !== null)) out.push('a deadweight loss needs a demand curve that meets MC');
    if (shade.includes('profit') && m.market === 'costs') out.push('profit or loss needs a market (a price or a demand)');
    return out;
  },
  /** The costs (TC = F + aq - bq^2 + cq^3), the lowest ATC (break-even) and AVC (shutdown), and the firm's choice: quantity, price, ATC there, profit (below 0 a loss); with demand, the socially optimal and fair-return points, consumer surplus and deadweight loss; long run, the excess capacity. */
  solve(d) {
    if (costCurves.check(d).length) return null;
    const m = ccModel(d), k = m.k, R = ccRegions(d, m), area = p => (p ? ecArea(p) : 0);
    const out = { market: m.market, costs: { ...k }, breakEven: { q: m.lowATC.q, price: m.lowATC.v }, shutdown: { q: m.lowAVC.q, price: m.lowAVC.v }, fixedCost: k.F };
    if (m.market === 'perfect') Object.assign(out, { price: m.price, q: m.firm.q, atc: m.firm.shutdown ? null : m.firm.atc, profit: m.firm.profit, shutsDown: m.firm.shutdown });
    if (m.demand) {
      const a = m.at;
      if (a) Object.assign(out, { q: a.q, price: a.p, atc: fmATC(k, a.q), profit: (a.p - fmATC(k, a.q)) * a.q, cs: area(R.cs), dwl: area(R.dwl) });
      if (m.firm) out.mrEqualsMC = { q: m.firm.q, price: m.firm.p };
      if (m.qSO !== null) out.socialOptimum = { q: m.qSO, price: fmPriceOn(m.demand, m.qSO) };
      if (m.qFR !== null) out.fairReturn = { q: m.qFR, price: fmPriceOn(m.demand, m.qFR) };
      if (m.tangent !== undefined) out.excessCapacity = m.lowATC.q - m.tangent;
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), m = ccModel(d), k = m.k, L = d.labels || {}, numbered = d.axes === 'numbered', shade = d.shade || [];
    const hideV = hides(o, 'values'), hideAreas = hides(o, 'areas'), hideNames = hides(o, 'names');
    const A = ecPlot(o, { box: CC_BOX, numbered, xstep: 1, ystep: 1, xtitle: text(d.xtitle, 60) || W('quantity'), ytitle: text(d.ytitle, 60) || W('costs'), right: m.market === 'perfect' ? 120 : 70 });
    const kids = [...A.kids], R = ccRegions(d, m);
    if (!hideAreas) for (const s of shade) {
      if (s === 'profit') { if (R.profit) kids.push(...ecRegion(A, R.profit, 'profit', o, W('profit'))); if (R.loss) kids.push(...ecRegion(A, R.loss, 'loss', o, W('loss'))); }
      if (s === 'cs' && R.cs && !R.loss) kids.push(...ecRegion(A, R.cs, 'cs', o, 'CS'));
      if (s === 'dwl' && R.dwl) kids.push(...ecRegion(A, R.dwl.map(p => ({ x: p.x, y: Math.min(CC_DRAW.y1, Math.max(0, p.y)) })), 'dwl', o, 'DWL'));
    }
    const fnCurve = (f, from = CC_Q0, to = CC_DRAW.x1) => ecGraphOf(f, from, to, 320);
    const nameOf = (c, n, colour) => { const e = ecEnd(A, c, CC_DRAW); return e ? ecNameAt(e.x, e.y, n, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, hideNames) : null; };
    const draw = (f, name, colour, dash, cls, from) => { const c = fnCurve(f, from); kids.push(...ecCurve(A, c, { colour, dash, box: CC_DRAW, cls: `of-curve ${cls}` }), nameOf(c, name, colour)); };
    const showAVC = d.avc ?? (m.market === 'costs' || m.market === 'perfect');
    if (d.afc) draw(q => fmAFC(k, q), ecName(L.AFC, 'AFC'), P.gold, '2 6', 'of-afc', 0.6);
    if (showAVC) draw(q => fmAVC(k, q), ecName(L.AVC, 'AVC'), P.green, '9 6', 'of-avc');
    draw(q => fmATC(k, q), ecName(L.ATC, 'ATC'), P.blue, null, 'of-atc');
    draw(q => fmMC(k, q), ecName(L.MC, 'MC'), P.red, null, 'of-mc');
    const pn = ecName(L.P, 'P'), qn = ecName(L.Q, m.market === 'monopoly' ? 'Q_M' : 'q'), xm = [], ym = [];
    const addMark = (list, v, name) => { const s = list.find(x => Math.abs(x.v - v) < 1e-6); if (s) { if (name && s.name !== name) s.name = `${s.name} = ${name}`; } else list.push({ v, name }); };
    if (d.minimums !== false && m.market !== 'monopoly') {
      kids.push(...ecDot(A, { x: m.lowATC.q, y: m.lowATC.v }, P, null, { r: 4, open: true, cls: 'of-min' }));
      if (showAVC) kids.push(...ecDot(A, { x: m.lowAVC.q, y: m.lowAVC.v }, P, null, { r: 4, open: true, cls: 'of-min' }));
    }
    if (m.market === 'perfect') {
      const pc = [{ x: 0, y: m.price }, { x: CC_DRAW.x1, y: m.price }];
      kids.push(...ecCurve(A, pc, { colour: P.purple, box: CC_BOX, cls: 'of-curve of-price' }), nameOf(pc, ecName(L.D, 'D = MR = AR = P'), P.purple));
      addMark(ym, m.price, pn);
      if (!m.firm.shutdown) {
        const at = { x: m.firm.q, y: m.price };
        kids.push(...ecDot(A, at, P, null, { cls: 'of-equilibrium' }));
        if (d.guides !== false) { kids.push(...ecGuide(A, at, P, { y: false })); addMark(xm, m.firm.q, qn); }
        if (Math.abs(fmATC(k, m.firm.q) - m.price) > 0.02 && d.guides !== false) { const c = { x: m.firm.q, y: fmATC(k, m.firm.q) }; kids.push(...ecDot(A, c, P, null, { r: 3.5 }), ...ecGuide(A, c, P, { x: false })); addMark(ym, c.y, 'ATC'); }
      }
    }
    if (m.demand) {
      const dn = ecName(L.D, 'D = AR'), mr = ecName(L.MR, 'MR');
      kids.push(...ecCurve(A, fnCurve(q => fmPriceOn(m.demand, q), 0), { colour: P.purple, box: CC_DRAW, cls: 'of-curve of-demand' }), nameOf(fnCurve(q => fmPriceOn(m.demand, q), 0), dn, P.purple));
      kids.push(...ecCurve(A, fnCurve(q => fmMROn(m.demand, q), 0), { colour: P.purple, dash: '10 6', box: CC_DRAW, cls: 'of-curve of-mr' }), nameOf(fnCurve(q => fmMROn(m.demand, q), 0), mr, P.purple));
      if (m.at) {
        const at = { x: m.at.q, y: m.at.p }, c = fmATC(k, m.at.q);
        if (m.firm && m.reg === 'none' && m.tangent === undefined) kids.push(...ecDot(A, { x: m.firm.q, y: fmMC(k, m.firm.q) }, P, 'MR = MC', { r: 3.5, dx: 8, dy: 14, cls: 'of-mrmc' }));
        kids.push(...ecDot(A, at, P, null, { cls: 'of-equilibrium' }));
        if (d.guides !== false) {
          kids.push(...ecGuide(A, at, P), ...ecGuide(A, { x: m.at.q, y: Math.min(at.y, fmMC(k, m.at.q)) }, P, { y: false }));
          addMark(ym, at.y, m.market === 'monopoly' ? ecName(L.P, m.reg === 'optimal' ? 'P_{SO}' : m.reg === 'fair' ? 'P_{FR}' : 'P_M') : pn);
          addMark(xm, at.x, m.market === 'monopoly' ? ecName(L.Q, m.reg === 'optimal' ? 'Q_{SO}' : m.reg === 'fair' ? 'Q_{FR}' : 'Q_M') : qn);
          if (Math.abs(c - at.y) > 0.02) { kids.push(...ecDot(A, { x: at.x, y: c }, P, null, { r: 3.5 }), ...ecGuide(A, { x: at.x, y: c }, P, { x: false })); addMark(ym, c, 'ATC'); }
        }
      }
      if (m.tangent !== undefined) {
        const lo = m.lowATC.q;
        if (lo - m.tangent > 0.3) kids.push(...ecBrace(A.X(m.tangent), A.X(lo), A.B - 6, 'above', P, W('excessCapacity'), false), ...ecGuide(A, { x: lo, y: m.lowATC.v }, P, { y: false }));
      }
    }
    kids.push(...ecMarksX(A, xm, o, P, { hidden: hideV, dp: 2 }));
    for (const y of ym) kids.push(ecMark(A, 'y', y.v, y.name, o, P, { hidden: hideV, dp: 2 }));
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'costCurves' }, o.title || W('costCurves'));
  },
};

// ---------------------------------------------------------------- production possibilities
const PP_KEYS = ['kind', 'hide', 'shape', 'bow', 'xMax', 'yMax', 'points', 'shift', 'steps', 'guides', 'countries', 'layout', 'goods', 'name', 'heading'];
const PP_PLACES = ['on', 'on2', 'inside', 'outside', 'at'];
const ppNumbered = d => d.xMax !== undefined;
function ppCurves(d) {
  const bend = ppBendOf(d.shape || 'out', d.bow ?? 2), sh = d.shift || null;
  if (ppNumbered(d)) return { bend, X1: d.xMax, Y1: d.yMax, X2: sh ? sh.xMax ?? d.xMax : d.xMax, Y2: sh ? sh.yMax ?? d.yMax : d.yMax };
  if (!sh) return { bend, X1: PP_BASE, Y1: PP_BASE, X2: PP_BASE, Y2: PP_BASE };
  const which = sh.which || 'both', dir = sh.dir || 'out', dd = EC_SHIFT_SHARE[sh.size || 'medium'] * 10, inner = Math.min(PP_BASE, PP_OUTER - dd);
  const ends = moves => (!moves ? (dir === 'out' ? [inner, inner] : [PP_BASE, PP_BASE]) : dir === 'out' ? [inner, inner + dd] : [PP_BASE, PP_BASE - dd]);
  const [X1, X2] = ends(which === 'both' || which === 'x'), [Y1, Y2] = ends(which === 'both' || which === 'y');
  return { bend, X1, Y1, X2, Y2 };
}
/** Where each point is, in the graph's units: on a curve a share of the way along it, or inside or outside every curve drawn. */
function ppPlaces(d, c) {
  const shifted = !fiNearly(c.X1, c.X2) || !fiNearly(c.Y1, c.Y2), curves = shifted ? [[c.X1, c.Y1], [c.X2, c.Y2]] : [[c.X1, c.Y1]];
  return (d.points || []).map(p => {
    const place = p.place || (p.x !== undefined ? 'at' : 'on');
    if (place === 'at') return { x: p.x, y: p.y };
    const q = place === 'on2' && shifted ? ppOnCurve(c.X2, c.Y2, c.bend, p.at ?? 0.5) : ppOnCurve(c.X1, c.Y1, c.bend, p.at ?? 0.5);
    if (place !== 'inside' && place !== 'outside') return q;
    const reaches = curves.map(([X, Y]) => ppReach(q, X, Y, c.bend)), f = place === 'inside' ? PP_INSIDE * Math.min(...reaches) : PP_OUTSIDE * Math.max(...reaches);
    return { x: q.x * f, y: q.y * f };
  });
}
/** The steps between points on the first curve, in order along it: what is gained of the x-axis good, given up of the other, and the cost of one more. */
function ppSteps(d, places) {
  const on = (d.points || []).map((p, i) => ({ p, at: places[i] })).filter(x => (x.p.place || 'on') === 'on').sort((a, b) => a.at.x - b.at.x), out = {};
  for (let i = 1; i < on.length; i++) { const gain = on[i].at.x - on[i - 1].at.x, giveUp = on[i - 1].at.y - on[i].at.y; out[`${on[i - 1].p.name || i}${on[i].p.name || i + 1}`] = { gain, giveUp, cost: gain > 0 ? giveUp / gain : null }; }
  return out;
}
const ppCountry = c => ({ name: c.name, x: c.x, y: c.y, costX: c.y / c.x, costY: c.x / c.y });
/**
 * One country: { shape: "out" | "straight" | "in", bow (1.2 to 4), xMax, yMax (numbered: where it meets each axis),
 * points: [{ name, at (a share of the way along, 0 to 1) or x, y, place: "on" | "on2" | "inside" | "outside" | "at",
 * caption }], shift: { which: "both" | "x" | "y", dir: "out" | "in", size } (numbered: { xMax, yMax }), steps (the
 * opportunity cost of each step between points on the curve), guides }. Two countries (comparative advantage):
 * { countries: [{ name, x, y }, { name, x, y }] (where each one's straight curve meets the axes), layout: "together" |
 * "side" }. Both: goods: [x-axis good, y-axis good], name (the curve's name, "PPC"), heading. hide: "captions",
 * "costs" (the steps' numbers), "after" (the shifted curve), "names" (the points' names), true.
 */
export const productionPossibilities = {
  check(d) {
    const out = ecOdd(d, PP_KEYS, 'a production possibilities graph');
    if (out.length) return out;
    if (d.goods !== undefined && !(Array.isArray(d.goods) && d.goods.length === 2 && d.goods.every(g => text(g, 30)))) out.push('"goods" is [the x-axis good, the y-axis good]');
    if (d.name !== undefined && !text(d.name, 20)) out.push('"name" is a short text');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    if (d.countries !== undefined) {
      const c = d.countries;
      if (!Array.isArray(c) || c.length !== 2 || c.some(x => !x || typeof x !== 'object' || Object.keys(x).some(k => !['name', 'x', 'y'].includes(k)) || !text(x.name, 24) || !isNum(x.x, 1e-9, 1e9) || !isNum(x.y, 1e-9, 1e9))) out.push('"countries" is two of { name, x, y }: each country\'s name and where its curve meets each axis');
      else if (fiNearly(c[0].y / c[0].x, c[1].y / c[1].x)) out.push('the two countries have the same opportunity costs: neither has a comparative advantage');
      if (d.layout !== undefined && !['together', 'side'].includes(d.layout)) out.push('"layout" is "together" or "side"');
      for (const k of ['shape', 'bow', 'xMax', 'yMax', 'points', 'shift', 'steps', 'guides']) if (d[k] !== undefined) out.push(`"${k}" is for one country's curve, not for "countries"`);
      return out;
    }
    if (d.layout !== undefined) out.push('"layout" is for two "countries"');
    if (d.shape !== undefined && !['out', 'straight', 'in'].includes(d.shape)) out.push('"shape" is "out", "straight" or "in"');
    if (d.bow !== undefined && !isNum(d.bow, 1.2, 4)) out.push('"bow" is 1.2 to 4');
    const numbered = ppNumbered(d);
    if (numbered && (!isNum(d.xMax, 1e-9, 1e9) || !isNum(d.yMax, 1e-9, 1e9))) out.push('"xMax" and "yMax" (where the curve meets each axis) are numbers above 0');
    if (!numbered && d.yMax !== undefined) out.push('"yMax" goes with "xMax"');
    out.push(...ecBool(d, ['steps', 'guides']));
    if (d.shift !== undefined) {
      const s = d.shift;
      if (!s || typeof s !== 'object') out.push('"shift" is { which, dir, size } (numbered: { xMax, yMax })');
      else if (numbered) { if (Object.keys(s).some(k => !['xMax', 'yMax'].includes(k)) || (s.xMax === undefined && s.yMax === undefined) || [s.xMax, s.yMax].some(v => v !== undefined && !isNum(v, 1e-9, 1e9))) out.push('a numbered "shift" is { xMax, yMax }: where the new curve meets each axis'); }
      else {
        if (Object.keys(s).some(k => !['which', 'dir', 'size'].includes(k))) out.push('"shift" is { which, dir, size }');
        if (s.which !== undefined && !['both', 'x', 'y'].includes(s.which)) out.push('"shift.which" is "both", "x" or "y"');
        if (s.dir !== undefined && !['out', 'in'].includes(s.dir)) out.push('"shift.dir" is "out" or "in"');
        out.push(...ecSize(s.size, 'shift.size'));
      }
    }
    if (d.points !== undefined) {
      if (!Array.isArray(d.points) || d.points.length > 8) out.push('"points" is a list of up to 8 points');
      else d.points.forEach((p, i) => {
        if (!p || typeof p !== 'object' || Object.keys(p).some(k => !['name', 'at', 'x', 'y', 'place', 'caption'].includes(k))) { out.push(`point ${i + 1} is { name, at, place, caption } or { name, x, y }`); return; }
        const place = p.place || (p.x !== undefined ? 'at' : 'on');
        if (!PP_PLACES.includes(place)) out.push(`point ${i + 1}: "place" is one of ${PP_PLACES.join(', ')}`);
        if (place === 'at' ? !(isNum(p.x, 0, 1e9) && isNum(p.y, 0, 1e9)) : p.at !== undefined && !isNum(p.at, 0, 1)) out.push(place === 'at' ? `point ${i + 1}: "x" and "y" are its amounts of each good` : `point ${i + 1}: "at" is a share of the way along, 0 to 1`);
        if (place === 'at' && !numbered) out.push(`point ${i + 1}: a point at amounts needs a numbered curve ("xMax", "yMax")`);
        if (place === 'on2' && !d.shift) out.push(`point ${i + 1}: "on2" is on the new curve, after a "shift"`);
        if (p.name !== undefined && !text(p.name, 8)) out.push(`point ${i + 1}: "name" is a short text`);
        if (p.caption !== undefined && !text(p.caption, 24)) out.push(`point ${i + 1}: "caption" is a short text`);
      });
    }
    if (d.steps && (d.points || []).filter(p => (p.place || 'on') === 'on').length < 2) out.push('"steps" need two or more points on the curve');
    return out;
  },
  /** Each point's amounts and whether it is efficient (on the curve), inefficient (inside) or unattainable (outside); each step's gain, what is given up and the opportunity cost; two countries' opportunity costs and who has the comparative advantage in each good. */
  solve(d) {
    if (productionPossibilities.check(d).length) return null;
    if (d.countries) {
      const [a, b] = d.countries.map(ppCountry);
      return { countryA: a, countryB: b, advantageX: a.costX < b.costX ? a.name : b.name, advantageY: a.costY < b.costY ? a.name : b.name, absoluteX: a.x === b.x ? null : a.x > b.x ? a.name : b.name, absoluteY: a.y === b.y ? null : a.y > b.y ? a.name : b.name };
    }
    const c = ppCurves(d), places = ppPlaces(d, c), points = {};
    (d.points || []).forEach((p, i) => {
      const r = ppReach(places[i], c.X1, c.Y1, c.bend), status = Math.abs(r - 1) < 1e-6 ? 'efficient' : r > 1 ? 'inefficient' : 'unattainable';
      points[p.name || String(i + 1)] = { x: places[i].x, y: places[i].y, status };
    });
    return { xMax: c.X1, yMax: c.Y1, ...(d.shift ? { xMaxAfter: c.X2, yMaxAfter: c.Y2 } : {}), points, steps: ppSteps(d, places), constantCost: (d.shape || 'out') === 'straight' ? c.Y1 / c.X1 : null };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), goods = d.goods || [W('goodX'), W('goodY')];
    const hideCap = hides(o, 'captions'), hideCosts = hides(o, 'costs'), hideAfter = hides(o, 'after'), hideNames = hides(o, 'names'), name = text(d.name, 20) || 'PPC';
    const nameOf = (A, c, n, colour) => { const e = ecEnd(A, c, A.box, 'end'); return e ? ecNameAt(e.x, e.y, n, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, false) : null; };
    if (d.countries) {
      const [a, b] = d.countries, side = d.layout === 'side', mx = Math.max(a.x, b.x) / 8, my = Math.max(a.y, b.y) / 8;
      const plot = (list, dx) => {
        const A = ecPlot(o, { box: { x0: 0, x1: 10 * mx, y0: 0, y1: 10 * my }, xtitle: goods[0], ytitle: goods[1], w: side ? 240 : 340, h: side ? 240 : 280, right: 30 }), kids = [...A.kids], xs = [], ys = [];
        list.forEach(([c, colour, dash]) => {
          const pts = [{ x: 0, y: c.y }, { x: c.x, y: 0 }];
          kids.push(...ecCurve(A, pts, { colour, dash, cls: 'of-curve of-ppc' }));
          kids.push(ecNameAt(A.X(c.x * 0.45) + 8, A.Y(c.y * 0.55) - 6, text(c.name, 24), { size: 13, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, false));
          xs.push({ v: c.x, name: fmt(c.x, 2, o.lang) }); ys.push({ v: c.y, name: fmt(c.y, 2, o.lang) });
        });
        kids.push(...ecMarksX(A, xs, o, P, { hidden: hides(o, 'values') }));
        for (const y of ys) kids.push(ecMark(A, 'y', y.v, y.name, o, P, { hidden: hides(o, 'values') }));
        return { A, g: node('g', { transform: dx ? `translate(${r2(dx)} 0)` : null }, kids) };
      };
      if (!side) { const { A, g } = plot([[a, P.blue, null], [b, P.red, '10 6']]); return frame(A.w, A.h, [g, ecHeading(d, A.w, P)], { ...o, kind: 'productionPossibilities' }, o.title || W('ppc')); }
      const one = plot([[a, P.blue, null]]), two = plot([[b, P.red, null]], one.A.w + 10);
      return frame(one.A.w * 2 + 10, one.A.h, [one.g, two.g, ecHeading(d, one.A.w * 2 + 10, P)], { ...o, kind: 'productionPossibilities' }, o.title || W('ppc'));
    }
    const numbered = ppNumbered(d), c = ppCurves(d), places = ppPlaces(d, c), shifted = !fiNearly(c.X1, c.X2) || !fiNearly(c.Y1, c.Y2);
    const top = Math.max(c.X1, c.X2, ...places.map(p => p.x)), topY = Math.max(c.Y1, c.Y2, ...places.map(p => p.y));
    const nice = v => { const s = niceStep(v, 8); return Math.ceil(v / s - 1e-9) * s; };
    const box = numbered ? { x0: 0, x1: nice(top * 1.1), y0: 0, y1: nice(topY * 1.1) } : { x0: 0, x1: 10, y0: 0, y1: 10 };
    const A = ecPlot(o, { box, numbered, xtitle: goods[0], ytitle: goods[1] }), kids = [...A.kids];
    const c1 = ppCurve(c.X1, c.Y1, c.bend), c2 = ppCurve(c.X2, c.Y2, c.bend);
    kids.push(...ecCurve(A, c1, { colour: P.blue, cls: 'of-curve of-ppc' }), nameOf(A, c1, shifted && !hideAfter ? `${name}_1` : name, P.blue));
    if (shifted && !hideAfter) {
      kids.push(...ecCurve(A, c2, { colour: P.blue, dash: d.shift && (d.shift.dir === 'in') ? null : null, cls: 'of-curve of-ppc of-after' }), nameOf(A, c2, `${name}_2`, P.blue));
      const mid = ppCurve(c.X1, c.Y1, c.bend, 8);
      for (const k of [2, 4, 6]) { const p = mid[k], f = ppReach(p, c.X2, c.Y2, c.bend); if (Math.abs(f - 1) > 0.04) kids.push(...ecShiftArrows(A, [p, { x: p.x * 1.0001, y: p.y * 1.0001 }], p.x * (f - 1), p.y * (f - 1), P.blue, [0])); }
    }
    // the opportunity cost steps: across what is gained, down what is given up, each with its size
    if (d.steps) {
      const on = (d.points || []).map((p, i) => ({ p, at: places[i] })).filter(x => (x.p.place || 'on') === 'on').sort((a, b) => a.at.x - b.at.x);
      for (let i = 1; i < on.length; i++) {
        const a = on[i - 1].at, b = on[i].at, corner = { x: b.x, y: a.y }, dash = { 'stroke-dasharray': '4 4', class: 'of-step' };
        kids.push(line(r2(A.X(a.x)), r2(A.Y(a.y)), r2(A.X(corner.x)), r2(A.Y(corner.y)), P.ink2, 1.5, dash), line(r2(A.X(corner.x)), r2(A.Y(corner.y)), r2(A.X(b.x)), r2(A.Y(b.y)), P.ink2, 1.5, dash));
        if (numbered) {
          kids.push(ecNameAt((A.X(a.x) + A.X(b.x)) / 2, A.Y(a.y) + 12, `+${fmt(b.x - a.x, 2, o.lang)}`, { anchor: 'middle', size: 11.5, colour: P.ink2, halo: P.paper, palette: P, cls: 'of-step-gain' }, hideCosts));
          if (Math.abs(a.y - b.y) > 1e-9) kids.push(ecNameAt(A.X(b.x) + 5, (A.Y(a.y) + A.Y(b.y)) / 2, `−${fmt(a.y - b.y, 2, o.lang)}`, { size: 11.5, colour: P.ink2, halo: P.paper, palette: P, cls: 'of-step-loss' }, hideCosts));
        }
      }
    }
    const xm = [], ym = [];
    (d.points || []).forEach((p, i) => {
      const q = places[i], place = p.place || (p.x !== undefined ? 'at' : 'on');
      if (place === 'on2' && hideAfter) return;
      const out = q.x > c.X1 * 0.98 || q.y > c.Y1 * 0.98 ? 1 : 0;
      kids.push(...ecDot(A, q, P, text(p.name, 8) || null, { hidden: hideNames, dx: 8, dy: -10, open: place === 'outside' }));
      const cap = p.caption !== undefined ? text(p.caption, 24) : ({ on: W('efficient'), on2: W('efficient'), inside: W('inefficient'), outside: W('unattainable') }[place] || '');
      if (cap && d.points.some(x => x.caption !== undefined || (x.place && x.place !== 'on'))) kids.push(ecNameAt(A.X(q.x) + 8, A.Y(q.y) + 8 + out * 2, cap, { size: 11.5, colour: P.ink2, halo: P.paper, palette: P, cls: 'of-caption' }, hideCap));
      if (d.guides) { kids.push(...ecGuide(A, q, P)); if (numbered) { xm.push({ v: q.x, name: '' }); ym.push({ v: q.y, name: '' }); } }
    });
    if (numbered) {
      kids.push(...ecMarksX(A, xm, o, P, { hidden: hides(o, 'values') }));
      for (const y of ym) kids.push(ecMark(A, 'y', y.v, '', o, P, { hidden: hides(o, 'values') }));
    }
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'productionPossibilities' }, o.title || W('ppc'));
  },
};
export const FIRM_KINDS = { costCurves, productionPossibilities };
