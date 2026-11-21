// Oomba Figures: market graphs (1.4.0, the economics pack). Supply and demand: schematic curves of five shapes (normal,
// steep, flat, upright, level) or numbered ones (a price intercept and a slope, an upright quantity, or a schedule of
// prices with the quantities demanded and supplied at each), a shift of either or both, a price ceiling or floor and
// the shortage or surplus it makes, a per-unit tax or subsidy and who pays it, and consumer and producer surplus,
// deadweight loss and tax revenue shaded. The money markets: the money market (an upright money supply), loanable
// funds, and the market for reserves with ample or limited reserves, each with its shifts. Every equilibrium, quantity
// and area is worked out from the curves (ported/econcurves.js, ported/markets.js): OF.solve gives them all; the
// checks, the answers and the drawing are Oomba's own (econ.js).
import { palette, isNum, text, hides, r2, line, label, frame, fmt } from './svg.js';
import { figWords } from './words.js';
import { niceStep } from './graphs.js';
import { ecIntersect, ecShifted, ecXAt, ecYAt, ecArea, ecDrawn, ecSmoothThrough, EC_SHIFT_SHARE } from './ported/econcurves.js';
import { MK_FAR, MK_SHAPES, mkSchematic, mkToAxes, MM_STRAIGHT, MM_RESERVES, mmReservesDemand, MM_SPAN, MM_RESERVES_TOP, MM_UPRIGHT, mmStraight } from './ported/markets.js';
import { ecOdd, ecSize, ecBool, ecName, ecLabelsCheck, ecNumbered, ecCurveNamed, ecNameAt, ecPlot, ecCurve, ecEnd, ecGuide, ecMark, ecMarksX, ecDot, ecShiftArrows, ecRegion, ecBrace, ecHeading, ecRangeCheck } from './econ.js';

/** The points of a curve from x0 to x1: its ends read off it, and every corner between (so an area is exact). */
export function ecSpan(c, x0, x1) {
  const ya = ecYAt(c, x0) ?? (c.length && x0 < c[0].x ? c[0].y : null), yb = ecYAt(c, x1) ?? (c.length && x1 < c[0].x ? c[0].y : null), out = [];
  if (ya !== null) out.push({ x: x0, y: ya });
  for (const p of c) if (p.x > x0 + 1e-12 && p.x < x1 - 1e-12) out.push(p);
  if (yb !== null) out.push({ x: x1, y: yb });
  return out;
}
/** The region between a curve and a price, from the price axis to q (consumer or producer surplus). */
const mkToPrice = (c, price, q, x0 = 0) => (q > x0 ? [{ x: x0, y: price }, ...ecSpan(c, x0, q), { x: q, y: price }] : []);
const mkNicer = hi => { const s = niceStep(hi > 0 ? hi : 1, 8); return { top: Math.ceil(hi / s - 1e-9) * s || s, step: s }; };
const MK_SIDES = ['increase', 'decrease'];

// ---------------------------------------------------------------- supply and demand
const SD_KEYS = ['kind', 'hide', 'demand', 'supply', 'schedule', 'x', 'y', 'shift', 'control', 'tax', 'shade', 'guides', 'star', 'from', 'labels', 'xtitle', 'ytitle', 'heading'];
const SD_LABELS = ['D', 'S', 'E', 'P', 'Q', 'Pb', 'Ps', 'Qt', 'Qd', 'Qs', 'CS', 'PS', 'DWL'];
const SD_SHADES = ['cs', 'ps', 'dwl', 'revenue'];
const mkIsShape = v => typeof v === 'string';
const mkNumbered = d => d.schedule !== undefined || (d.demand !== undefined && !mkIsShape(d.demand)) || (d.supply !== undefined && !mkIsShape(d.supply));
function mkLineOf(c, kind) {
  if (mkIsShape(c)) return mkSchematic(kind, c);
  if (c.q !== undefined) return [{ x: c.q, y: -1e7 }, { x: c.q, y: 1e7 }];
  // a numbered supply curve that meets the quantity axis starts there (no negative prices)
  if (kind === 'supply' && c.at < 0 && c.slope > 0) return [{ x: -c.at / c.slope, y: 0 }, { x: 1e7, y: c.at + c.slope * 1e7 }];
  return [{ x: -1e7, y: c.at - c.slope * 1e7 }, { x: 1e7, y: c.at + c.slope * 1e7 }];
}
/** Everything a supply and demand graph shows, worked out from its curves (null parts are not on it). */
function sdModel(d) {
  const numbered = mkNumbered(d), sh = d.shift || {}, size = EC_SHIFT_SHARE[sh.size || 'medium'];
  let d1, s1;
  const rows = numbered && d.schedule ? d.schedule.map(r => ({ p: r[0], qd: r[1], qs: r[2] })).sort((a, b) => a.p - b.p) : null;
  const shade = d.shade || [];
  let dx1, sx1;
  if (rows) {
    d1 = rows.map(r => ({ x: r.qd, y: r.p })).sort((a, b) => a.x - b.x || b.y - a.y);
    s1 = rows.map(r => ({ x: r.qs, y: r.p })).sort((a, b) => a.x - b.x || a.y - b.y);
    // the areas are worked out on the curves run on to the axes; they are drawn so only when something is shaded
    dx1 = mkToAxes(d1, 'demand'); sx1 = mkToAxes(s1, 'supply');
    if (shade.length) { d1 = dx1; s1 = sx1; }
  } else { d1 = mkLineOf(d.demand || 'normal', 'demand'); s1 = mkLineOf(d.supply || 'normal', 'supply'); dx1 = d1; sx1 = s1; }
  const flat = c => (mkIsShape(c) ? c === 'horizontal' : !!c && c.slope === 0), upright = c => (mkIsShape(c) ? c === 'vertical' : !!c && c.q !== undefined);
  const dFlat = !rows && flat(d.demand || 'normal'), sFlat = !rows && flat(d.supply || 'normal'), dUp = !rows && upright(d.demand || 'normal'), sUp = !rows && upright(d.supply || 'normal');
  const e1 = ecIntersect(d1, s1);
  const move = (kind, flatOne) => {
    const v = sh[kind];
    if (v === undefined) return { dx: 0, dy: 0 };
    if (numbered) return { dx: v, dy: 0 };
    const up = v === 'increase' ? 1 : -1;
    return flatOne ? { dx: 0, dy: (kind === 'demand' ? up : -up) * size * 10 } : { dx: up * size * 10, dy: 0 };
  };
  const dm = move('demand', dFlat), sm = move('supply', sFlat), d2 = ecShifted(d1, dm.dx, dm.dy), s2 = ecShifted(s1, sm.dx, sm.dy);
  const shifted = !!(dm.dx || dm.dy || sm.dx || sm.dy), e2 = shifted ? ecIntersect(d2, s2) : e1;
  return { numbered, rows, d1, s1, d2, s2, dm, sm, e1, e2, shifted, dFlat, sFlat, dUp, sUp, shade, dx2: ecShifted(dx1, dm.dx, dm.dy), sx2: ecShifted(sx1, sm.dx, sm.dy) };
}
/** The axes a supply and demand graph runs over: as given, or fitted past what it shows. */
function sdBox(d, m) {
  if (!m.numbered) return { x0: 0, x1: 10, y0: 0, y1: 10 };
  const qs = [m.e1, m.e2].filter(Boolean).map(e => e.x), ps = [m.e1, m.e2].filter(Boolean).map(e => e.y);
  if (m.rows) for (const r of m.rows) { qs.push(r.qd, r.qs); ps.push(r.p); }
  if (d.control) ps.push(d.control.at);
  if (d.tax && m.e2) ps.push(m.e2.y + d.tax.amount);
  const top = m.d1[0] && m.d1[0].x <= 0 ? ecYAt(m.d1, 0) : null;
  if (top !== null && top !== undefined && Number.isFinite(top) && top < 3 * Math.max(...ps)) ps.push(top);
  const X = d.x ? { x0: d.x[0], x1: d.x[1] } : { x0: 0, x1: mkNicer(Math.max(...qs, 1e-9) * (m.rows ? 1.1 : 1.5)).top };
  const Y = d.y ? { y0: d.y[0], y1: d.y[1] } : { y0: 0, y1: mkNicer(Math.max(...ps, 1e-9) * 1.15).top };
  return { ...X, ...Y };
}
/** The market as it ends up: a control's quantities, a tax's prices, what is traded, and the areas. */
function sdOutcome(d, m, box) {
  const dF = m.d2, sF = m.s2, eF = m.e2, spanY = box.y1 - box.y0, out = { control: null, tax: null };
  let buyers = eF ? eF.y : null, sellers = buyers, traded = eF ? eF.x : null;
  if (d.control && eF) {
    let p = m.numbered ? d.control.at : box.y0 + d.control.at * spanY;
    if (!m.numbered) {
      const at = (c, x, fl) => (fl ? null : ecYAt(c, x));
      const lim = (d.control.type === 'ceiling' ? [at(dF, 9.4, m.dFlat), at(sF, 0, m.sFlat), 0.4] : [at(sF, 9.4, m.sFlat), at(dF, 0, m.dFlat), 9.6]).filter(v => v !== null);
      p = d.control.type === 'ceiling' ? Math.max(p, ...lim) : Math.min(p, ...lim);
    }
    const binding = d.control.type === 'ceiling' ? p < eF.y - spanY * 1e-6 : p > eF.y + spanY * 1e-6;
    const qd = binding ? ecXAt(dF, p) : null, qs = binding ? ecXAt(sF, p) : null;
    out.control = { type: d.control.type, price: p, binding, qd, qs };
    if (binding && qd !== null && qs !== null) { buyers = sellers = p; traded = Math.min(qd, qs); out.control[qd > qs ? 'shortage' : 'surplus'] = Math.abs(qd - qs); }
  }
  if (d.tax && eF) {
    const t = (d.tax.type === 'tax' ? 1 : -1) * (m.numbered ? d.tax.amount : d.tax.amount * spanY), sT = ecShifted(sF, 0, t), eT = ecIntersect(dF, sT);
    out.tax = { type: d.tax.type, perUnit: Math.abs(t), curve: sT, at: eT };
    if (eT) { buyers = eT.y; sellers = eT.y - t; traded = eT.x; Object.assign(out.tax, { buyers, sellers, quantity: traded }); }
  }
  Object.assign(out, { buyers, sellers, traded });
  if (eF && traded !== null) {
    const x0 = Math.min(box.x0, 0) === 0 ? 0 : box.x0, dA = m.dx2, sA = m.sx2;
    // a schedule's demand that cannot be run on to the price axis has no consumer surplus to work out
    if (m.rows && dA[0].x > x0 + 1e-9) out.noCS = true;
    out.cs = m.dFlat || m.dUp || out.noCS ? null : mkToPrice(dA, buyers, traded, x0);
    out.ps = m.sFlat ? null : m.sUp ? [{ x: x0, y: 0 }, { x: x0, y: sellers }, { x: traded, y: sellers }, { x: traded, y: 0 }] : mkToPrice(sA, sellers, traded, x0);
    if (Math.abs(traded - eF.x) > (box.x1 - box.x0) * 1e-6) {
      const [a, b] = traded < eF.x ? [traded, eF.x] : [eF.x, traded], top = ecSpan(dA, a, b), bottom = ecSpan(sA, a, b);
      out.dwl = top.length > 1 && bottom.length > 1 ? [...top, ...bottom.reverse()] : null;
    } else out.dwl = null;
    out.revenue = out.tax && out.tax.at ? [{ x: x0, y: Math.min(buyers, sellers) }, { x: x0, y: Math.max(buyers, sellers) }, { x: traded, y: Math.max(buyers, sellers) }, { x: traded, y: Math.min(buyers, sellers) }] : null;
  }
  return out;
}
/**
 * { demand, supply: "normal" | "steep" | "flat" | "vertical" | "horizontal" (schematic), or numbered { at, slope } (the
 * price where it meets the price axis and its slope) or { q } (upright); or schedule: [[price, qd, qs], ...]; x, y
 * (numbered axes); shift: { demand, supply: "increase" | "decrease" (schematic) or how far across (numbered), size };
 * control: { type: "ceiling" | "floor", at (the price; schematic, a share of the price axis) }; tax: { type: "tax" |
 * "subsidy", amount (per unit; schematic, a share of the price axis) }; shade: ["cs", "ps", "dwl", "revenue"]; guides,
 * star (P* rather than P_e), from (1 or 0), labels: { D, S, E, P, Q, Pb, Ps, Qt, Qd, Qs, CS, PS, DWL }, xtitle, ytitle,
 * heading }. hide: "values" (the prices and quantities at the axes), "after" (the shift's curves and equilibrium),
 * "areas" (the shaded regions), "names" (the curves' names, as lines to write on), true (all of these).
 */
export const supplyDemand = {
  check(d) {
    const out = ecOdd(d, SD_KEYS, 'a supply and demand graph');
    if (out.length) return out;
    const numbered = mkNumbered(d);
    for (const k of ['demand', 'supply']) {
      const c = d[k];
      if (c === undefined) continue;
      if (mkIsShape(c)) { if (!MK_SHAPES.includes(c)) out.push(`"${k}" must be one of ${MK_SHAPES.join(', ')}, or { at, slope }`); else if (numbered) out.push(`"${k}": a numbered graph's curves are { at, slope } or { q } (or a schedule), not a shape`); continue; }
      if (!c || typeof c !== 'object' || Array.isArray(c)) { out.push(`"${k}" is a shape or { at, slope }`); continue; }
      if (d.schedule !== undefined) { out.push(`give a schedule or "${k}", not both`); continue; }
      if (c.q !== undefined) { if (Object.keys(c).length !== 1 || !isNum(c.q, 0, 1e9) || c.q <= 0) out.push(`"${k}": { q } is an upright curve at a quantity above 0`); continue; }
      if (Object.keys(c).some(x => !['at', 'slope'].includes(x)) || !isNum(c.at, -1e9, 1e9) || !isNum(c.slope, -1e9, 1e9)) { out.push(`"${k}" is { at, slope }: the price where it meets the price axis, and how steep it is`); continue; }
      if (k === 'demand' && (c.slope > 0 || c.at <= 0)) out.push('demand slopes down (a slope of 0 or below) from a price above 0');
      if (k === 'supply' && c.slope < 0) out.push('supply slopes up (a slope of 0 or above)');
    }
    if (d.schedule !== undefined) {
      const s = d.schedule;
      if (!Array.isArray(s) || s.length < 2 || s.length > 20 || s.some(r => !Array.isArray(r) || r.length !== 3 || !r.every(v => isNum(v, -1e9, 1e9)) || r[1] < 0 || r[2] < 0)) out.push('"schedule" is 2 to 20 rows of [price, quantity demanded, quantity supplied], the quantities 0 or more');
      else {
        const rows = [...s].sort((a, b) => a[0] - b[0]);
        if (rows.some((r, k) => k && r[0] === rows[k - 1][0])) out.push('each row of the schedule has its own price');
        if (rows.some((r, k) => k && r[1] > rows[k - 1][1])) out.push('in the schedule, the quantity demanded falls (or stays) as the price rises');
        if (rows.some((r, k) => k && r[2] < rows[k - 1][2])) out.push('in the schedule, the quantity supplied rises (or stays) as the price rises');
      }
    }
    out.push(...ecRangeCheck(d), ...ecBool(d, ['guides', 'star']), ...ecLabelsCheck(d, SD_LABELS));
    if (d.from !== undefined && d.from !== 0 && d.from !== 1) out.push('"from" is 1 (D_1 to D_2) or 0 (D_0 to D_1)');
    if (d.shade !== undefined && (!Array.isArray(d.shade) || d.shade.some(x => !SD_SHADES.includes(x)))) out.push(`"shade" is a list of ${SD_SHADES.join(', ')}`);
    if (d.shift !== undefined) {
      const s = d.shift;
      if (!s || typeof s !== 'object' || Object.keys(s).some(k => !['demand', 'supply', 'size'].includes(k))) out.push('"shift" is { demand, supply, size }');
      else {
        for (const k of ['demand', 'supply']) if (s[k] !== undefined && !(numbered ? isNum(s[k], -1e9, 1e9) && s[k] !== 0 : MK_SIDES.includes(s[k]))) out.push(numbered ? `"shift.${k}" is how far it moves across (a number, + for an increase)` : `"shift.${k}" is "increase" or "decrease"`);
        out.push(...ecSize(s.size, 'shift.size'));
        if (numbered && s.size !== undefined) out.push('a numbered shift is how far across: leave out "shift.size"');
        if (numbered) for (const k of ['demand', 'supply']) if (s[k] !== undefined && d[k] && !mkIsShape(d[k]) && d[k].slope === 0) out.push(`a flat ${k} curve does not move across: give its new price instead`);
      }
    }
    if (d.control !== undefined) {
      const c = d.control;
      if (!c || typeof c !== 'object' || !['ceiling', 'floor'].includes(c.type) || Object.keys(c).some(k => !['type', 'at'].includes(k))) out.push('"control" is { type: "ceiling" | "floor", at }');
      else if (!(numbered ? isNum(c.at, -1e9, 1e9) : isNum(c.at, 0, 1))) out.push(numbered ? '"control.at" is the controlled price' : '"control.at" is a share of the price axis, 0 to 1');
    }
    if (d.tax !== undefined) {
      const t = d.tax;
      if (!t || typeof t !== 'object' || !['tax', 'subsidy'].includes(t.type) || Object.keys(t).some(k => !['type', 'amount'].includes(k))) out.push('"tax" is { type: "tax" | "subsidy", amount }');
      else if (!(numbered ? isNum(t.amount, 1e-9, 1e9) : isNum(t.amount, 0.04, 0.5))) out.push(numbered ? '"tax.amount" is the tax or subsidy per unit, above 0' : '"tax.amount" is a share of the price axis, 0.04 to 0.5');
      if (d.control !== undefined) out.push('a tax and a price control on one graph: draw one of them');
    }
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    const m = sdModel(d);
    if (!m.e1) return [mkIsShape(d.demand) && d.demand === d.supply && ['vertical', 'horizontal'].includes(d.demand) ? 'two upright (or two flat) curves never cross: there is no one equilibrium' : 'the curves do not cross: there is no equilibrium'];
    if (m.shifted && !m.e2) return ['after the shift the curves do not cross'];
    const box = sdBox(d, m), on = p => p.x >= box.x0 - 1e-9 && p.x <= box.x1 + 1e-9 && p.y >= box.y0 - 1e-9 && p.y <= box.y1 + 1e-9;
    if (!on(m.e1)) out.push('the curves cross off the graph: widen "x" and "y"');
    if (m.e1.x < 0 || m.e1.y < 0) out.push('the curves cross at a negative price or quantity');
    if (m.shifted && m.e2 && (!on(m.e2) || m.e2.x < 0 || m.e2.y < 0)) out.push('after the shift the curves cross off the graph (or below 0)');
    if (out.length) return out;
    const r = sdOutcome(d, m, box);
    if (r.control && r.control.binding && (r.control.qd === null || r.control.qs === null)) out.push('a curve does not reach the controlled price: move the control or widen the curves');
    if (r.control && m.numbered && (r.control.price <= box.y0 || r.control.price >= box.y1)) out.push('the controlled price is off the graph');
    if (r.tax && !r.tax.at) out.push(`with the ${d.tax.type} the curves do not cross`);
    if (r.tax && r.tax.at && (r.tax.sellers < 0 || !on(r.tax.at))) out.push(`with the ${d.tax.type} the market is off the graph: make it smaller`);
    if (m.shade.includes('cs') && (m.dUp || m.dFlat)) out.push('an upright or flat demand curve has no consumer surplus to shade');
    if (m.shade.includes('ps') && m.sFlat) out.push('a flat supply curve has no producer surplus to shade');
    if (m.shade.includes('revenue') && !d.tax) out.push('tax revenue (or a subsidy\'s cost) needs a "tax"');
    if (m.shade.includes('dwl') && !d.tax && !(d.control && r.control && r.control.binding)) out.push('a deadweight loss needs a tax, a subsidy or a control that binds');
    if (r.noCS && m.shade.includes('cs')) out.push('the schedule\'s demand cannot be run on to the price axis for the consumer surplus');
    return out;
  },
  /** The equilibrium (and after a shift), a control's quantities and shortage or surplus, a tax's prices and revenue, and the areas (consumer and producer surplus, deadweight loss, revenue), in the graph's units. */
  solve(d) {
    if (supplyDemand.check(d).length) return null;
    const m = sdModel(d), box = sdBox(d, m), r = sdOutcome(d, m, box), area = p => (p && p.length > 2 ? ecArea(p) : 0);
    const out = { numbered: m.numbered, equilibrium: { price: m.e1.y, quantity: m.e1.x } };
    if (m.shifted) Object.assign(out, { after: { price: m.e2.y, quantity: m.e2.x }, priceChange: m.e2.y - m.e1.y, quantityChange: m.e2.x - m.e1.x });
    if (r.control) { const { type, price, binding, qd, qs, shortage, surplus } = r.control; out.control = { type, price, binding, qd, qs, ...(shortage !== undefined ? { shortage } : {}), ...(surplus !== undefined ? { surplus } : {}) }; }
    if (r.tax) { const { type, perUnit, buyers, sellers, quantity } = r.tax; out.tax = { type, perUnit, buyers, sellers, quantity, buyersShare: Math.abs(buyers - m.e2.y), sellersShare: Math.abs(m.e2.y - sellers) }; }
    Object.assign(out, { price: r.buyers, quantity: r.traded, cs: r.cs ? area(r.cs) : null, ps: r.ps ? area(r.ps) : null, dwl: area(r.dwl), revenue: area(r.revenue) });
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), m = sdModel(d), box = sdBox(d, m), r = sdOutcome(d, m, box), L = d.labels || {}, from = d.from ?? 1, star = !!d.star;
    const hideV = hides(o, 'values'), hideAfter = hides(o, 'after'), hideAreas = hides(o, 'areas'), hideNames = hides(o, 'names');
    const A = ecPlot(o, { box, numbered: m.numbered, xtitle: text(d.xtitle, 60) || W('quantity'), ytitle: text(d.ytitle, 60) || W('price'), right: d.tax ? 90 : 70 });
    const kids = [...A.kids], dBox = m.numbered ? box : { x0: 0, x1: 9.4, y0: 0.4, y1: 9.6 }, upBox = c => (c ? { ...dBox, y0: box.y0 } : dBox);
    const dn = ecName(L.D, 'D'), sn = ecName(L.S, 'S'), en = ecName(L.E, 'E'), pn = ecName(L.P, 'P'), qn = ecName(L.Q, 'Q');
    const showAfter = m.shifted && !hideAfter, dMoves = !!(m.dm.dx || m.dm.dy), sMoves = !!(m.sm.dx || m.sm.dy);
    // the shaded regions first, under everything
    if (!hideAreas) {
      const nm = { cs: ecName(L.CS, 'CS'), ps: ecName(L.PS, 'PS'), dwl: ecName(L.DWL, 'DWL'), revenue: d.tax && d.tax.type === 'subsidy' ? W('subsidyCost') : W('taxRevenue') };
      for (const k of m.shade) if (r[k] && (m.shifted ? showAfter : true)) kids.push(...ecRegion(A, r[k].map(p => ({ x: p.x, y: Math.max(box.y0, Math.min(dBox.y1, p.y)) })), k, o, nm[k], false));
    }
    const curveName = (c, name, colour, upright, box2) => { const e = ecEnd(A, c, box2 || upBox(upright)); return e ? ecNameAt(e.x, e.y, name, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, hideNames) : null; };
    const dKids = [], drawPair = (c1, c2, moves, kind, name, colour, upright) => {
      const k1 = moves && showAfter ? 1 : moves ? 1 : 0;
      dKids.push(...ecCurve(A, c1, { colour, box: upBox(upright), cls: `of-curve of-${kind}` }), curveName(c1, ecCurveNamed(name, moves ? k1 : 0, from), colour, upright));
      if (moves && showAfter) dKids.push(...ecCurve(A, c2, { colour, box: upBox(upright), cls: `of-curve of-${kind} of-after` }), curveName(c2, ecCurveNamed(name, 2, from), colour, upright));
    };
    drawPair(m.d1, m.d2, dMoves, 'demand', dn, P.blue, m.dUp);
    drawPair(m.s1, m.s2, sMoves, 'supply', sn, P.red, m.sUp);
    if (r.tax && r.tax.at) dKids.push(...ecCurve(A, r.tax.curve, { colour: P.red, dash: '10 6', box: upBox(m.sUp), cls: 'of-curve of-taxed' }), curveName(r.tax.curve, d.tax.type === 'tax' ? 'S + tax' : 'S − subsidy', P.red, m.sUp));
    kids.push(...dKids);
    if (showAfter) {
      if (dMoves) kids.push(...ecShiftArrows(A, m.d1, m.dm.dx, m.dm.dy, P.blue, [0.22, 0.78], dBox));
      if (sMoves) kids.push(...ecShiftArrows(A, m.s1, m.sm.dx, m.sm.dy, P.red, [0.22, 0.78], dBox));
    }
    // a price control: its line, its quantities and the brace
    const marks = [], mark = (axis, v, name) => { const same = marks.find(x => x.axis === axis && Math.abs(x.v - v) < (axis === 'x' ? box.x1 - box.x0 : box.y1 - box.y0) * 1e-6); if (same) { if (name && same.name && same.name !== name) same.name = `${same.name} = ${name}`; } else marks.push({ axis, v, name }); };
    const dp = m.numbered ? 2 : 0;
    if (r.control) {
      const c = r.control, x1 = m.numbered ? box.x1 : Math.min(9.4, Math.max(5, ...[c.qd, c.qs].filter(v => v !== null)) + 0.6);
      kids.push(line(r2(A.X(box.x0)), r2(A.Y(c.price)), r2(A.X(x1)), r2(A.Y(c.price)), P.ink, 2.2, { class: 'of-control' }));
      const cn = c.type === 'ceiling' ? W('priceCeiling') : W('priceFloor'), co = { size: 12.5, colour: P.ink, halo: P.paper, palette: P, cls: 'of-control-name' };
      kids.push(m.numbered ? ecNameAt(A.R - 4, A.Y(c.price) - 10, cn, { ...co, anchor: 'end' }, false) : ecNameAt(A.X(x1) + 6, A.Y(c.price), cn, co, false));
      if (c.binding && c.qd !== null && c.qs !== null) {
        for (const [q, nmK, dflt] of [[c.qd, 'Qd', 'Q_d'], [c.qs, 'Qs', 'Q_s']]) {
          kids.push(...ecDot(A, { x: q, y: c.price }, P, null, { r: 4 }));
          if (d.guides !== false) { kids.push(...ecGuide(A, { x: q, y: c.price }, P, { y: false })); mark('x', q, ecName(L[nmK], dflt)); }
        }
        const [a, b] = c.qs < c.qd ? [c.qs, c.qd] : [c.qd, c.qs];
        kids.push(...ecBrace(A.X(a), A.X(b), A.Y(c.price), c.type === 'ceiling' ? 'below' : 'above', P, c.qd > c.qs ? W('shortage') : W('surplus'), false));
      }
    }
    // the equilibria: a dot, its name, and dashed guides to the values at the axes
    const eqs = [[m.e1, m.shifted ? 1 : 0]];
    if (showAfter) eqs.push([m.e2, 2]);
    const taxShown = r.tax && r.tax.at && (m.shade.includes('revenue') || m.shade.includes('dwl'));
    for (const [e, k] of eqs) {
      kids.push(...ecDot(A, e, P, ecCurveNamed(en, k, from), { cls: 'of-equilibrium' }));
      if (d.guides === false) continue;
      kids.push(...ecGuide(A, e, P, taxShown && k === (m.shifted ? 2 : 0) ? { y: false } : {}));
      mark('y', e.y, ecNumbered(pn, k, from, star)); mark('x', e.x, ecNumbered(qn, k, from, star));
    }
    if (r.tax && r.tax.at) {
      const t = r.tax;
      kids.push(...ecDot(A, { x: t.quantity, y: t.buyers }, P, null, { r: 4 }), ...ecDot(A, { x: t.quantity, y: t.sellers }, P, null, { r: 4 }));
      if (d.guides !== false) {
        kids.push(...ecGuide(A, { x: t.quantity, y: Math.max(t.buyers, t.sellers) }, P), ...ecGuide(A, { x: t.quantity, y: Math.min(t.buyers, t.sellers) }, P, { x: false }));
        mark('y', t.buyers, ecName(L.Pb, 'P_b')); mark('y', t.sellers, ecName(L.Ps, 'P_s')); mark('x', t.quantity, ecName(L.Qt, t.type === 'tax' ? 'Q_t' : 'Q_{sub}'));
      }
    }
    // the values at the axes (names on a schematic graph; names and numbers on a numbered one), spread so none overlap
    kids.push(...ecMarksX(A, marks.filter(x => x.axis === 'x'), o, P, { hidden: hideV, dp }));
    marks.filter(x => x.axis === 'y').forEach(x => kids.push(ecMark(A, 'y', x.v, x.name, o, P, { hidden: hideV, dp })));
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'supplyDemand' }, o.title || W('supplyDemand'));
  },
};

// ---------------------------------------------------------------- the money markets
const MM_KEYS = ['kind', 'hide', 'graph', 'regime', 'shift', 'guides', 'star', 'from', 'labels', 'xtitle', 'ytitle', 'heading'];
const MM_GRAPHS = ['money', 'funds', 'reserves'];
const MM_NAMES = { money: { supply: 'MS', demand: 'MD', rate: 'i' }, funds: { supply: 'S_{LF}', demand: 'D_{LF}', rate: 'r' }, reserves: { supply: 'S_R', demand: 'D_R', rate: 'i_{FF}' } };
function mmModel(d) {
  const g = d.graph || 'money', R = MM_RESERVES[d.regime || 'ample'], reserves = g === 'reserves', upDown = reserves && (d.regime || 'ample') === 'ample', sh = d.shift || {};
  const size = EC_SHIFT_SHARE[sh.size || 'medium'], span = MM_SPAN[reserves ? d.regime || 'ample' : g], q1 = reserves ? R.supply : 5, upright = g !== 'funds';
  const by = k => (sh[k] === undefined ? 0 : (sh[k] === 'increase' || sh[k] === 1 ? 1 : -1) * size * span);
  const sdx = upright && sh.supply !== undefined ? Math.max(MM_UPRIGHT.min, Math.min(MM_UPRIGHT.max, q1 + by('supply'))) - q1 : by('supply');
  const ddx = upDown ? 0 : by('demand'), ddy = upDown ? Math.min(by('demand'), MM_RESERVES_TOP - R.high) : 0;
  const s1 = upright ? [{ x: q1, y: -MK_FAR }, { x: q1, y: MK_FAR }] : mmStraight(MM_STRAIGHT.funds.supply.slope), s2 = ecShifted(s1, sdx, 0);
  const dSlope = g === 'money' ? MM_STRAIGHT.money.demand.slope : MM_STRAIGHT.funds.demand.slope;
  const d1 = reserves ? mmReservesDemand(R, 0, 0) : mmStraight(dSlope), d2 = reserves ? mmReservesDemand(R, ddx, ddy) : mmStraight(dSlope, ddx);
  const shifted = !!(sdx || ddx || ddy), e1 = ecIntersect(s1, d1), e2 = shifted ? ecIntersect(s2, d2) : e1;
  return { g, R, reserves, upDown, upright, s1, s2, d1, d2, sdx, ddx, ddy, shifted, e1, e2 };
}
/**
 * { graph: "money" | "funds" | "reserves", regime: "ample" | "limited" (reserves), shift: { supply, demand: "increase"
 * | "decrease" (or 1, -1), size }, guides, star, from, labels: { supply, demand, rate, Q, E }, xtitle, ytitle, heading }. On the
 * hidden 0-to-10 grid (shape only, no numbers). hide: "values", "after", "names", true.
 */
export const moneyMarket = {
  check(d) {
    const out = ecOdd(d, MM_KEYS, 'a money market graph');
    if (out.length) return out;
    if (d.graph !== undefined && !MM_GRAPHS.includes(d.graph)) return [`"graph" must be one of ${MM_GRAPHS.join(', ')}`];
    if (d.regime !== undefined && (d.graph !== 'reserves' || !['ample', 'limited'].includes(d.regime))) out.push('"regime" ("ample" or "limited") is for the market for reserves');
    if (d.shift !== undefined) {
      const s = d.shift;
      if (!s || typeof s !== 'object' || Object.keys(s).some(k => !['supply', 'demand', 'size'].includes(k))) out.push('"shift" is { supply, demand, size }');
      else { for (const k of ['supply', 'demand']) if (s[k] !== undefined && !MK_SIDES.includes(s[k]) && s[k] !== 1 && s[k] !== -1) out.push(`"shift.${k}" is "increase" or "decrease" (or 1 or -1, so a generator can deal one)`); out.push(...ecSize(s.size, 'shift.size')); }
    }
    out.push(...ecBool(d, ['guides', 'star']), ...ecLabelsCheck(d, ['supply', 'demand', 'rate', 'Q', 'E']));
    if (d.from !== undefined && d.from !== 0 && d.from !== 1) out.push('"from" is 1 or 0');
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    const m = mmModel(d);
    if (!m.e1 || (m.shifted && !m.e2)) out.push('the curves do not cross on the graph');
    return out;
  },
  /** The rate and quantity before and after a shift, and which way each moved (1 up, -1 down, 0 the same). */
  solve(d) {
    if (moneyMarket.check(d).length) return null;
    const m = mmModel(d), sign = v => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));
    const out = { graph: m.g, rate: m.e1.y, quantity: m.e1.x };
    // the moves also as 1 (up), 2 (the same) or 3 (down), so a question can ask for one (its keypad has no minus sign)
    if (m.shifted) { const r = sign(m.e2.y - m.e1.y), q = sign(m.e2.x - m.e1.x); Object.assign(out, { after: { rate: m.e2.y, quantity: m.e2.x }, rateChange: r, quantityChange: q, rateMove: 2 - r, quantityMove: 2 - q }); }
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), m = mmModel(d), L = d.labels || {}, N = MM_NAMES[m.g], from = d.from ?? 1, star = !!d.star;
    const hideV = hides(o, 'values'), hideAfter = hides(o, 'after'), hideNames = hides(o, 'names');
    const titles = { money: ['moneyQty', 'nominalRate'], funds: ['fundsQty', 'realRate'], reserves: ['reservesQty', 'policyRate'] }[m.g];
    const A = ecPlot(o, { box: { x0: 0, x1: 10, y0: 0, y1: 10 }, xtitle: text(d.xtitle, 60) || W(titles[0]), ytitle: text(d.ytitle, 60) || W(titles[1]) });
    const kids = [...A.kids], showAfter = m.shifted && !hideAfter, sMoves = !!m.sdx, dMoves = !!(m.ddx || m.ddy);
    const sn = ecName(L.supply, N.supply), dn = ecName(L.demand, N.demand), rn = ecName(L.rate, N.rate), qn = ecName(L.Q, 'Q'), en = ecName(L.E, 'E');
    const dBox = { x0: 0, x1: 9.4, y0: 0.3, y1: 9.6 }, sBox = m.upright ? { ...dBox, y0: 0, y1: 9 } : dBox;
    const nameOf = (c, nm, colour, box) => { const e = ecEnd(A, c, box); return e ? ecNameAt(e.x, e.y, nm, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, hideNames) : null; };
    kids.push(...ecCurve(A, m.d1, { colour: P.blue, box: dBox, cls: 'of-curve of-demand' }), nameOf(m.d1, ecCurveNamed(dn, dMoves ? 1 : 0, from), P.blue, dBox));
    if (dMoves && showAfter) kids.push(...ecCurve(A, m.d2, { colour: P.blue, box: dBox, cls: 'of-curve of-demand of-after' }), nameOf(m.d2, ecCurveNamed(dn, 2, from), P.blue, dBox));
    kids.push(...ecCurve(A, m.s1, { colour: P.red, box: sBox, cls: 'of-curve of-supply' }), nameOf(m.s1, ecCurveNamed(sn, sMoves ? 1 : 0, from), P.red, sBox));
    if (sMoves && showAfter) kids.push(...ecCurve(A, m.s2, { colour: P.red, box: sBox, cls: 'of-curve of-supply of-after' }), nameOf(m.s2, ecCurveNamed(sn, 2, from), P.red, sBox));
    if (showAfter) {
      if (sMoves) kids.push(...ecShiftArrows(A, m.s1, m.sdx, 0, P.red, [0.82], sBox));
      if (dMoves && m.upDown) kids.push(...ecShiftArrows(A, [{ x: 0.2, y: m.R.high }, { x: m.R.x0 - 0.2, y: m.R.high }], 0, m.ddy, P.blue, [0.5]), ...ecShiftArrows(A, [{ x: m.R.x1 + 0.5, y: m.R.low }, { x: 9, y: m.R.low }], 0, m.ddy, P.blue, [0.3, 0.75]));
      else if (dMoves) kids.push(...ecShiftArrows(A, m.d1, m.ddx, 0, P.blue, m.reserves ? [0.55] : [0.2, 0.8], dBox));
    }
    const eqs = [[m.e1, m.shifted ? 1 : 0]];
    if (showAfter) eqs.push([m.e2, 2]);
    const ys = [], xs = [];
    for (const [e, k] of eqs) {
      kids.push(...ecDot(A, e, P, ecCurveNamed(en, k, from), { cls: 'of-equilibrium' }));
      if (d.guides === false) continue;
      const sameY = ys.find(v => Math.abs(v.v - e.y) < 1e-6), sameX = xs.find(v => Math.abs(v.v - e.x) < 1e-6);
      kids.push(...ecGuide(A, e, P, { x: !m.upright && !sameX }));
      if (sameY) sameY.name = `${sameY.name} = ${ecNumbered(rn, k, from, star)}`; else ys.push({ v: e.y, name: ecNumbered(rn, k, from, star) });
      if (sameX) sameX.name = `${sameX.name} = ${ecNumbered(qn, k, from, star)}`; else xs.push({ v: e.x, name: ecNumbered(qn, k, from, star) });
    }
    for (const y of ys) kids.push(ecMark(A, 'y', y.v, y.name, o, P, { hidden: hideV }));
    kids.push(...ecMarksX(A, xs, o, P, { hidden: hideV }));
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'moneyMarket' }, o.title || W({ money: 'moneyMarket', funds: 'loanableFunds', reserves: 'reservesMarket' }[m.g]));
  },
};
export const MARKET_KINDS = { supplyDemand, moneyMarket };
