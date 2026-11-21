// Oomba Figures: macroeconomics graphs (1.4.0, the economics pack). The AD-AS model: AD, SRAS (straight, or the three
// ranges) and LRAS at full employment, the economy at long-run equilibrium or with a recessionary or inflationary gap,
// shifts of each curve (by a size, or as far as it takes to close the gap) and the gap braced; numbered, the curves go
// through a schedule of price levels with the real GDP demanded and supplied at each. The Phillips curve: the short-run
// curve crossing the long-run curve at the natural rate and expected inflation, a movement along it (A to B) and back
// to the long run (C), or either curve shifting; numbered, from the natural rate, expected inflation and a second
// point. The business cycle: real GDP around a rising trend, its peaks and troughs worked out from the wave, the
// phases named in words or letters, recessions shaded. The models are ported (ported/macro.js, ported/econcurves.js);
// the checks, the answers (OF.solve) and the drawing are Oomba's own.
import { node, palette, isNum, text, hides, r2, line, label, frame, fmt, arrow } from './svg.js';
import { figWords } from './words.js';
import { niceStep } from './graphs.js';
import { ecIntersect, ecShifted, ecXAt, ecYAt, ecLineThrough, ecGraphOf, ecSmoothThrough, EC_SHIFT_SHARE } from './ported/econcurves.js';
import { AA_FAR, AA_SLOPE, AA_GAP, AA_FLAT, AA_CORNER, AA_SNAP, AA_MIN_GAP, aaThreeRange, pcInflationAt, pcModel, PC_BEND, PC_DRAW, bcWave, BC_STARTS } from './ported/macro.js';
import { ecOdd, ecSize, ecBool, ecName, ecLabelsCheck, ecNumbered, ecCurveNamed, ecNameAt, ecPlot, ecCurve, ecEnd, ecGuide, ecMark, ecMarksX, ecDot, ecShiftArrows, ecBrace, ecHeading, ecRangeCheck, ecHatch } from './econ.js';

const maNicer = hi => { const s = niceStep(hi > 0 ? hi : 1, 8); return { top: Math.ceil(hi / s - 1e-9) * s || s, step: s }; };
const maNearly = (a, b, span) => Math.abs(a - b) <= span * 1e-6;

// ---------------------------------------------------------------- AD-AS
const AA_KEYS = ['kind', 'hide', 'as', 'lras', 'start', 'gap', 'shift', 'schedule', 'potential', 'smooth', 'x', 'y', 'brace', 'guides', 'star', 'from', 'labels', 'xtitle', 'ytitle', 'heading'];
const AA_LABELS = ['AD', 'AS', 'LRAS', 'E', 'PL', 'Y', 'Yf'];
const AA_SHIFTS = ['left', 'right', 'full'];
function aaModel(d) {
  const numbered = d.schedule !== undefined, sh = d.shift || {}, size = EC_SHIFT_SHARE[sh.size || 'medium'], three = !numbered && d.as === 'three', far = { x0: -AA_FAR, x1: AA_FAR, y0: -AA_FAR, y1: AA_FAR };
  let ad1, as1, yf1, rows = null;
  if (numbered) {
    rows = d.schedule.map(r => ({ pl: r[0], ad: r[1], as: r[2] })).sort((a, b) => a.pl - b.pl);
    const through = pts => [...(d.smooth === false ? pts : ecSmoothThrough(pts, 'y'))].sort((a, b) => a.x - b.x);
    ad1 = through(rows.map(r => ({ x: r.ad, y: r.pl }))); as1 = through(rows.map(r => ({ x: r.as, y: r.pl }))); yf1 = d.potential;
  } else {
    const g = AA_GAP[d.gap || 'medium'], start = d.start || 'full';
    if (three) {
      yf1 = 6; as1 = aaThreeRange(yf1);
      const e = start === 'recession' ? { x: yf1 - g, y: ecYAt(as1, yf1 - g) ?? AA_FLAT } : { x: yf1, y: AA_CORNER };
      ad1 = ecLineThrough(e, { x: e.x + 1, y: e.y - AA_SLOPE * 1.4 }, far);
    } else {
      yf1 = 5 + (start === 'recession' ? g : start === 'inflation' ? -g : 0);
      as1 = ecLineThrough({ x: 5, y: 5 }, { x: 6, y: 5 + AA_SLOPE }, far); ad1 = ecLineThrough({ x: 5, y: 5 }, { x: 6, y: 5 - AA_SLOPE }, far);
    }
  }
  const box = aaBox(d, rows, yf1), spanX = box.x1 - box.x0, spanY = box.y1 - box.y0, tol = spanX * 0.004, e1 = ecIntersect(ad1, as1);
  const sign = v => (v === 'left' ? -1 : v === 'right' ? 1 : 0), sized = v => v === 'left' || v === 'right';
  const by = (v, k) => (numbered ? (typeof v === 'number' ? v : 0) : sign(v) * size * spanX * (k || 1));
  let lrasDx = by(sh.lras);
  if (!numbered && !three && e1 && lrasDx && sh.ad === undefined && sh.sras === undefined) {
    const off = e1.x - (yf1 + lrasDx);
    if (Math.abs(off) < AA_MIN_GAP) lrasDx = Math.abs(off) < AA_SNAP ? e1.x - yf1 : e1.x - yf1 - Math.sign(off || lrasDx) * AA_MIN_GAP;
  }
  const yf2 = yf1 + lrasDx;
  let adDx = by(sh.ad), asDx = three ? lrasDx : by(sh.sras), asDy = three ? -sign(sh.sras) * size * spanY : 0;
  const adAfter = () => ecShifted(ad1, adDx, 0), asAfter = () => ecShifted(as1, asDx, asDy);
  const adTo = x => { const y = ecYAt(asAfter(), x), f = y === null ? null : ecXAt(ad1, y); return f === null ? null : x - f; };
  const asTo = x => {
    const y = ecYAt(adAfter(), x);
    if (y === null) return null;
    if (three) { const at = ecYAt(ecShifted(as1, asDx, 0), x); return at === null || AA_FLAT + y - at < 0.4 ? null : y - at; }
    const f = ecXAt(as1, y);
    return f === null ? null : x - f;
  };
  const notes = [];
  if (sh.ad === 'full') { const dx = adTo(yf2); if (dx === null) notes.push('AD cannot shift far enough to bring output to full employment on this graph'); else if (Math.abs(dx) <= tol) notes.push('output is already at full employment: AD has nothing to close'); else adDx = dx; }
  if (sh.sras === 'full' && sh.ad !== 'full') {
    const dd = asTo(yf2);
    if (dd === null) notes.push('SRAS cannot shift far enough to bring output to full employment on this graph'); else if (Math.abs(dd) <= (three ? spanY : spanX) * 0.004) notes.push('output is already at full employment: SRAS has nothing to close'); else if (three) asDy = dd; else asDx = dd;
  }
  const follows = three && sh.lras !== undefined && sh.ad === undefined && sh.sras === undefined;
  if (!numbered && e1 && (sized(sh.ad) || sized(sh.sras) || follows)) {
    const e = ecIntersect(adAfter(), asAfter()), off = e ? e.x - yf2 : 0;
    if (e && Math.abs(off) > tol && Math.abs(off) < AA_MIN_GAP) {
      const shock = three && sized(sh.sras) && !sized(sh.ad), x = Math.abs(off) < AA_SNAP && !shock ? yf2 : yf2 + (Math.sign(off) || (sh.sras === 'left' ? -1 : 1)) * AA_MIN_GAP;
      if (sized(sh.ad)) adDx = adTo(x) ?? adDx; else { const dd = asTo(x); if (dd !== null && three) asDy = dd; else if (dd !== null) asDx = dd; }
    }
  }
  const ad2 = adAfter(), as2 = asAfter(), adMoves = Math.abs(adDx) > tol, asMoves = Math.abs(asDx) > tol || Math.abs(asDy) > spanY * 0.004, lrasMoves = Math.abs(lrasDx) > tol;
  const shifted = adMoves || asMoves, e2 = shifted ? ecIntersect(ad2, as2) : e1;
  return { numbered, three, rows, box, ad1, as1, ad2, as2, yf1, yf2, adDx, asDx, asDy, lrasDx, adMoves, asMoves, lrasMoves, shifted, e1, e2, notes };
}
function aaBox(d, rows, yf) {
  if (!rows) return { x0: 0, x1: 10, y0: 0, y1: 10 };
  const xs = [...rows.flatMap(r => [r.ad, r.as]), yf], ys = rows.map(r => r.pl), pad = (lo, hi) => { const s = hi - lo || Math.abs(hi) || 1; return [lo - s * 0.06, hi + s * 0.06]; };
  const fit = (lo, hi) => { const [a, b] = pad(lo, hi), st = niceStep(b - Math.max(0, a), 8), f = Math.floor(Math.max(0, a) / st) * st; return [f, Math.ceil(b / st) * st]; };
  const [x0, x1] = d.x || fit(Math.min(...xs), Math.max(...xs)), [y0, y1] = d.y || fit(Math.min(...ys), Math.max(...ys));
  return { x0, x1, y0, y1 };
}
/**
 * { as: "straight" | "three", lras (true), start: "full" | "recession" | "inflation", gap: "small" | "medium" | "large",
 * shift: { ad, sras: "left" | "right" | "full" (as far as closes the gap), lras: "left" | "right", size }; numbered:
 * schedule [[price level, real GDP demanded, real GDP supplied], ...], potential, smooth (true), x, y, and shifts as
 * how far across (or "full"); brace (true), guides, star, from, labels: { AD, AS, LRAS, E, PL, Y, Yf }, xtitle, ytitle,
 * heading }. hide: "values", "after" (the shifted curves and where the economy ends up), "gap" (the gap's name),
 * "names", true.
 */
export const adAs = {
  check(d) {
    const out = ecOdd(d, AA_KEYS, 'an AD-AS graph');
    if (out.length) return out;
    const numbered = d.schedule !== undefined;
    if (d.as !== undefined && !['straight', 'three'].includes(d.as)) out.push('"as" is "straight" or "three"');
    if (d.start !== undefined && !['full', 'recession', 'inflation'].includes(d.start)) out.push('"start" is "full", "recession" or "inflation"');
    out.push(...ecSize(d.gap, 'gap'), ...ecRangeCheck(d), ...ecBool(d, ['lras', 'smooth', 'brace', 'guides', 'star']), ...ecLabelsCheck(d, AA_LABELS));
    if (d.from !== undefined && d.from !== 0 && d.from !== 1) out.push('"from" is 1 or 0');
    if (numbered) {
      const s = d.schedule;
      if (!Array.isArray(s) || s.length < 2 || s.length > 20 || s.some(r => !Array.isArray(r) || r.length !== 3 || !r.every(v => isNum(v, 0, 1e12)))) out.push('"schedule" is 2 to 20 rows of [price level, real GDP demanded, real GDP supplied], all 0 or more');
      else {
        const rows = [...s].sort((a, b) => a[0] - b[0]);
        if (rows.some((r, k) => k && r[0] === rows[k - 1][0])) out.push('each row of the schedule has its own price level');
        if (rows.some((r, k) => k && r[1] > rows[k - 1][1])) out.push('aggregate demand falls (or stays) as the price level rises');
        if (rows.some((r, k) => k && r[2] < rows[k - 1][2])) out.push('aggregate supply rises (or stays) as the price level rises');
      }
      if (!isNum(d.potential, 0, 1e12)) out.push('"potential" (full-employment real GDP, where LRAS stands) is a number');
      for (const k of ['as', 'start', 'gap']) if (d[k] !== undefined) out.push(`"${k}" is for the schematic graph: a numbered one's curves are its schedule`);
    } else {
      if (d.potential !== undefined || d.smooth !== undefined || d.x !== undefined || d.y !== undefined) out.push('"potential", "smooth", "x" and "y" are for a numbered graph (with a schedule)');
      if (d.as === 'three' && d.start === 'inflation') out.push('three-range aggregate supply is upright at full employment: there is no inflationary gap');
    }
    if (d.shift !== undefined) {
      const s = d.shift;
      if (!s || typeof s !== 'object' || Object.keys(s).some(k => !['ad', 'sras', 'lras', 'size'].includes(k))) out.push('"shift" is { ad, sras, lras, size }');
      else {
        for (const k of ['ad', 'sras', 'lras']) {
          if (s[k] === undefined) continue;
          const ok = numbered ? (isNum(s[k], -1e12, 1e12) && s[k] !== 0) || (s[k] === 'full' && k !== 'lras') : (k === 'lras' ? ['left', 'right'] : AA_SHIFTS).includes(s[k]);
          if (!ok) out.push(numbered ? `"shift.${k}" is how far across (a number)${k === 'lras' ? '' : ' or "full"'}` : `"shift.${k}" is ${k === 'lras' ? '"left" or "right"' : '"left", "right" or "full"'}`);
        }
        out.push(...ecSize(s.size, 'shift.size'));
        if (numbered && s.size !== undefined) out.push('a numbered shift is how far across: leave out "shift.size"');
        if (s.ad === 'full' && s.sras === 'full') out.push('close the gap with AD or with SRAS, not both');
      }
    }
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    const m = aaModel(d), on = p => p && p.x >= m.box.x0 - 1e-9 && p.x <= m.box.x1 + 1e-9 && p.y >= m.box.y0 - 1e-9 && p.y <= m.box.y1 + 1e-9;
    if (!m.e1) return ['AD and aggregate supply do not cross: there is no equilibrium'];
    if (!on(m.e1)) out.push('AD and aggregate supply cross off the graph: widen "x" and "y"');
    if (m.shifted && !on(m.e2)) out.push('after the shift AD and aggregate supply do not cross on the graph: make it smaller');
    if (m.yf1 < m.box.x0 || m.yf1 > m.box.x1 || m.yf2 < m.box.x0 || m.yf2 > m.box.x1) out.push('LRAS (potential GDP) is off the graph');
    return [...out, ...m.notes];
  },
  /** Where the economy starts and ends up (real GDP, price level), potential GDP (before and after), and the output gap (real GDP minus potential: below 0 a recessionary gap). */
  solve(d) {
    if (adAs.check(d).length) return null;
    const m = aaModel(d), span = m.box.x1 - m.box.x0, kind = g => (maNearly(g, 0, span * 1000) || Math.abs(g) < span * 1e-4 ? 'none' : g < 0 ? 'recessionary' : 'inflationary');
    const out = { numbered: m.numbered, start: { gdp: m.e1.x, priceLevel: m.e1.y }, potential: m.yf1, gap: m.e1.x - m.yf1, gapType: kind(m.e1.x - m.yf1) };
    if (m.shifted || m.lrasMoves) Object.assign(out, { end: { gdp: m.e2.x, priceLevel: m.e2.y }, potentialAfter: m.yf2, gapAfter: m.e2.x - m.yf2, gapTypeAfter: kind(m.e2.x - m.yf2), priceLevelChange: m.e2.y - m.e1.y, gdpChange: m.e2.x - m.e1.x });
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), m = aaModel(d), L = d.labels || {}, from = d.from ?? 1, star = !!d.star, box = m.box;
    const hideV = hides(o, 'values'), hideAfter = hides(o, 'after'), hideGap = hides(o, 'gap'), hideNames = hides(o, 'names');
    const A = ecPlot(o, { box, numbered: m.numbered, xtitle: text(d.xtitle, 60) || W('realGdp'), ytitle: text(d.ytitle, 60) || W('priceLevel'), xstep: m.numbered ? niceStep(box.x1 - box.x0, 6) : undefined });
    const kids = [...A.kids], dBox = m.numbered ? box : { x0: 0, x1: 9.4, y0: 0.4, y1: 9.6 }, showAfter = !hideAfter;
    const nm = { ad: ecName(L.AD, 'AD'), as: ecName(L.AS, m.three ? 'AS' : 'SRAS'), lras: ecName(L.LRAS, 'LRAS'), e: ecName(L.E, 'E'), pl: ecName(L.PL, 'PL'), y: ecName(L.Y, 'Y'), yf: ecName(L.Yf, 'Y_f') };
    const nameOf = (c, n, colour, b = dBox) => { const e = ecEnd(A, c, b); return e ? ecNameAt(e.x, e.y, n, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, hideNames) : null; };
    // LRAS at full employment (and where it moves to)
    const lrasAt = [[m.yf1, m.lrasMoves ? 1 : 0]];
    if (m.lrasMoves && showAfter) lrasAt.push([m.yf2, 2]);
    if (d.lras !== false) for (const [x, k] of lrasAt) {
      const c = [{ x, y: box.y0 }, { x, y: m.numbered ? box.y1 : 9.6 }];
      kids.push(...ecCurve(A, c, { colour: P.ink, width: 2.6, cls: 'of-curve of-lras' }), nameOf(c, ecCurveNamed(nm.lras, k, from), P.ink, box));
    }
    kids.push(...ecCurve(A, m.ad1, { colour: P.blue, box: dBox, cls: 'of-curve of-ad' }), nameOf(m.ad1, ecCurveNamed(nm.ad, m.adMoves ? 1 : 0, from), P.blue));
    if (m.adMoves && showAfter) kids.push(...ecCurve(A, m.ad2, { colour: P.blue, box: dBox, cls: 'of-curve of-ad of-after' }), nameOf(m.ad2, ecCurveNamed(nm.ad, 2, from), P.blue));
    kids.push(...ecCurve(A, m.as1, { colour: P.red, box: dBox, cls: 'of-curve of-sras' }), nameOf(m.as1, ecCurveNamed(nm.as, m.asMoves ? 1 : 0, from), P.red));
    if (m.asMoves && showAfter) kids.push(...ecCurve(A, m.as2, { colour: P.red, box: dBox, cls: 'of-curve of-sras of-after' }), nameOf(m.as2, ecCurveNamed(nm.as, 2, from), P.red));
    if (showAfter) {
      if (m.adMoves) kids.push(...ecShiftArrows(A, m.ad1, m.adDx, 0, P.blue, [0.15, 0.85], dBox));
      if (m.asMoves) kids.push(...ecShiftArrows(A, m.as1, m.asDx, m.asDy, P.red, m.three ? [0.1] : [0.15, 0.85], dBox));
      if (m.lrasMoves && d.lras !== false) kids.push(...ecShiftArrows(A, [{ x: m.yf1, y: box.y0 + (box.y1 - box.y0) * 0.75 }, { x: m.yf1, y: box.y0 + (box.y1 - box.y0) * 0.95 }], m.lrasDx, 0, P.ink, [0.5]));
    }
    const eqs = [[m.e1, m.shifted ? 1 : 0, m.yf1]];
    if (m.shifted && showAfter) eqs.push([m.e2, 2, m.yf2]);
    const xm = [], ym = [], addMark = (list, v, name, span) => { const s = list.find(x => maNearly(x.v, v, span)); if (s) { if (name && s.name !== name) s.name = `${s.name} = ${name}`; } else list.push({ v, name }); };
    const dp = m.numbered ? 0 : 0, spanX = box.x1 - box.x0, spanY = box.y1 - box.y0;
    if (d.lras !== false) for (const [x, k] of lrasAt) addMark(xm, x, ecCurveNamed(nm.yf, k, from), spanX);
    for (const [e, k] of eqs) {
      kids.push(...ecDot(A, e, P, ecCurveNamed(nm.e, k, from), { cls: 'of-equilibrium' }));
      if (d.guides !== false) { kids.push(...ecGuide(A, e, P)); addMark(ym, e.y, ecNumbered(nm.pl, k, from, star), spanY); addMark(xm, e.x, ecNumbered(nm.y, k, from, star), spanX); }
    }
    // the output gap, braced just over the real GDP axis from output to full employment
    if (d.brace !== false && d.lras !== false) {
      const [e, , yf] = eqs[eqs.length - 1], gap = e.x - yf;
      if (Math.abs(gap) > spanX * 0.02) kids.push(...ecBrace(A.X(Math.min(e.x, yf)), A.X(Math.max(e.x, yf)), A.B - (m.numbered ? 56 : 6), 'above', P, gap < 0 ? W('recessionaryGap') : W('inflationaryGap'), hideGap));
    }
    kids.push(...ecMarksX(A, xm, o, P, { hidden: hideV, dp }));
    for (const y of ym) kids.push(ecMark(A, 'y', y.v, y.name, o, P, { hidden: hideV, dp }));
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'adAs' }, o.title || W('adAs'));
  },
};

// ---------------------------------------------------------------- the Phillips curve
const PC_KEYS = ['kind', 'hide', 'nru', 'expected', 'u2', 'pi2', 'expected2', 'uShock', 'nru2', 'curvature', 'movement', 'along', 'side', 'cause', 'size', 'longRun', 'withSrpc', 'srpc', 'lrpc', 'guides', 'arrows', 'x', 'y', 'from', 'labels', 'xtitle', 'ytitle', 'heading'];
const PC_LABELS = ['SRPC', 'LRPC', 'un', 'A', 'B', 'C'];
const pcSettings = d => ({ numbered: d.nru !== undefined, curvature: d.curvature || 'normal', movement: d.movement || 'none', along: d.along || 'up', side: d.side || (d.movement === 'lrpc' ? 'left' : 'right'), cause: d.cause || 'shock',
  share: EC_SHIFT_SHARE[d.size || 'medium'] * 10, longRun: !!d.longRun, withSrpc: d.withSrpc !== false, nru: d.nru, expected: d.expected, u2: d.u2, pi2: d.pi2, expected2: d.expected2, uShock: d.uShock, nru2: d.nru2 });
function pcBox(d, m) {
  if (!m.numbered) return { x0: 0, x1: 10, y0: 0, y1: 10 };
  const pts = [m.A, m.B, m.C].filter(Boolean), X = maNicer(Math.max(10, 1.6 * Math.max(m.un, m.un2 || 0, ...pts.map(p => p.x))));
  const lo = Math.min(0, ...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y), m.pe), yStep = niceStep(hi - lo + 4, 8);
  const y0 = lo < 0 ? Math.floor((lo - 1) / yStep) * yStep : 0, y1 = Math.ceil((hi + (hi - y0) * 0.45 + 1) / yStep) * yStep;
  return { x0: d.x ? d.x[0] : 0, x1: d.x ? d.x[1] : X.top, y0: d.y ? d.y[0] : y0, y1: d.y ? d.y[1] : y1 };
}
/**
 * Schematic: { curvature: "gentle" | "normal" | "strong", movement: "none" | "along" | "srpc" | "lrpc", along: "up" |
 * "down", side: "right" | "left", cause: "shock" | "expectations", size, longRun, withSrpc }; numbered (in %): { nru,
 * expected, u2 and pi2 (a second point on the short-run curve, where a movement along it goes), expected2 (after the
 * short-run curve shifts), uShock (unemployment after a supply shock), nru2 (after the long-run curve shifts), x, y }.
 * Both: srpc, lrpc (true), guides, arrows (true), from, labels: { SRPC, LRPC, un, A, B, C }, xtitle, ytitle, heading.
 * hide: "values" (the rates at the axes), "after" (B, C and the shifted curve), "names", true.
 */
export const phillipsCurve = {
  check(d) {
    const out = ecOdd(d, PC_KEYS, 'a Phillips curve graph');
    if (out.length) return out;
    const numbered = d.nru !== undefined, mv = d.movement || 'none';
    if (d.curvature !== undefined && !Object.keys(PC_BEND).includes(d.curvature)) out.push('"curvature" is "gentle", "normal" or "strong"');
    if (!['none', 'along', 'srpc', 'lrpc'].includes(mv)) return ['"movement" is "none", "along", "srpc" or "lrpc"'];
    if (d.along !== undefined && (mv !== 'along' || !['up', 'down'].includes(d.along))) out.push('"along" ("up" or "down") is for a movement along the short-run curve');
    if (d.side !== undefined && (!['srpc', 'lrpc'].includes(mv) || !['right', 'left'].includes(d.side))) out.push('"side" ("right" or "left") is for a shift of either curve');
    if (d.cause !== undefined && (mv !== 'srpc' || !['shock', 'expectations'].includes(d.cause))) out.push('"cause" ("shock" or "expectations") is for a shift of the short-run curve');
    if (d.longRun !== undefined && mv !== 'along') out.push('"longRun" (back to the long-run curve) follows a movement along the short-run curve');
    out.push(...ecSize(d.size, 'size'), ...ecBool(d, ['longRun', 'withSrpc', 'srpc', 'lrpc', 'guides', 'arrows']), ...ecLabelsCheck(d, PC_LABELS), ...ecRangeCheck(d));
    if (d.from !== undefined && d.from !== 0 && d.from !== 1) out.push('"from" is 1 or 0');
    if (numbered) {
      if (!isNum(d.nru, 0.1, 50)) out.push('"nru", the natural rate of unemployment, is 0.1 to 50 (%)');
      if (!isNum(d.expected, -50, 100)) out.push('"expected", expected inflation, is a number (%)');
      if (!isNum(d.u2, 0.01, 60) || !isNum(d.pi2, -50, 100)) out.push('"u2" and "pi2" are a second point on the short-run curve (%)');
      if (mv === 'srpc' && !isNum(d.expected2, -50, 100)) out.push('"expected2" is expected inflation after the short-run curve shifts');
      if (mv === 'srpc' && (d.cause || 'shock') === 'shock' && !isNum(d.uShock, 0.01, 60)) out.push('"uShock" is unemployment at B after the supply shock');
      if (mv === 'lrpc' && !isNum(d.nru2, 0.1, 50)) out.push('"nru2" is the natural rate after the long-run curve shifts');
      if (d.size !== undefined || d.side !== undefined) out.push('"size" and "side" are for a schematic graph: a numbered one moves to its numbers');
    } else {
      for (const k of ['expected', 'u2', 'pi2', 'expected2', 'uShock', 'nru2', 'x', 'y']) if (d[k] !== undefined) out.push(`"${k}" is for a numbered graph (give "nru")`);
    }
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    const m = pcModel(pcSettings(d));
    if (m.notes.length) return m.notes;
    if (numbered) {
      const box = pcBox(d, m), on = p => !p || (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1);
      if (![m.A, m.B, m.C].every(on)) out.push('a point is off the graph: widen "x" and "y"');
      if (m.srpc1.c >= Math.min(m.un, d.u2) - 1e-9) out.push('the short-run curve cannot reach that second point');
    }
    return out;
  },
  /** The natural rate and expected inflation, the points A, B and C (unemployment, inflation), the natural rate after the long-run curve shifts, and the short-run curve's expected inflation after it shifts. */
  solve(d) {
    if (phillipsCurve.check(d).length) return null;
    const m = pcModel(pcSettings(d)), pt = p => (p ? { u: p.x, inflation: p.y } : null);
    const out = { numbered: d.nru !== undefined, nru: m.un, expected: m.pe, A: pt(m.A) };
    if (m.B) out.B = pt(m.B);
    if (m.C) out.C = pt(m.C);
    if (m.un2 !== null) out.nruAfter = m.un2;
    if (m.srpc2) out.expectedAfter = m.srpc2.pe;
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), numbered = d.nru !== undefined, m = pcModel(pcSettings(d)), box = pcBox(d, m), L = d.labels || {}, from = d.from ?? 1;
    const hideV = hides(o, 'values'), hideAfter = hides(o, 'after'), hideNames = hides(o, 'names');
    const pct = v => `${fmt(v, 1, o.lang)}%`;
    const A = ecPlot(o, { box, numbered, xtitle: text(d.xtitle, 60) || W('unemploymentRate'), ytitle: text(d.ytitle, 60) || W('inflationRate'), xfmt: numbered ? pct : undefined, yfmt: numbered ? pct : undefined, xstep: numbered ? niceStep(box.x1 - box.x0, 6) : undefined });
    const kids = [...A.kids], dBox = numbered ? box : PC_DRAW, showAfter = !hideAfter;
    if (numbered && box.y0 < 0) kids.push(line(A.L, A.Y(0), A.R, A.Y(0), P.ink, 1.4));
    const curveOf = c => ecGraphOf(u => (u > c.c + 1e-6 ? pcInflationAt(c, u) : NaN), Math.max(dBox.x0, c.c + 0.02 * (box.x1 - box.x0)), dBox.x1, 240);
    const nameOf = (c, n, colour, b = dBox) => { const e = ecEnd(A, c, b); return e ? ecNameAt(e.x, e.y, n, { anchor: e.anchor, size: 14, colour, halo: P.paper, palette: P, cls: 'of-curve-name' }, hideNames) : null; };
    const sn = ecName(L.SRPC, 'SRPC'), ln = ecName(L.LRPC, 'LRPC'), un = ecName(L.un, 'u_n');
    const srpcShifts = !!m.srpc2 && !(m.C === null && false), lrpcShifts = m.un2 !== null;
    if (d.lrpc !== false) {
      const top = numbered ? box.y1 : 9.6, lr = [[m.un, lrpcShifts ? 1 : 0]];
      if (lrpcShifts && showAfter) lr.push([m.un2, 2]);
      for (const [x, k] of lr) { const c = [{ x, y: box.y0 }, { x, y: top }]; kids.push(...ecCurve(A, c, { colour: P.ink, width: 2.6, cls: 'of-curve of-lrpc' }), nameOf(c, ecCurveNamed(ln, k, from), P.ink, box)); }
    }
    if (d.srpc !== false) {
      kids.push(...ecCurve(A, curveOf(m.srpc1), { colour: P.blue, box: dBox, cls: 'of-curve of-srpc' }), nameOf(curveOf(m.srpc1), ecCurveNamed(sn, srpcShifts ? 1 : 0, from), P.blue));
      if (srpcShifts && showAfter) kids.push(...ecCurve(A, curveOf(m.srpc2), { colour: P.blue, box: dBox, cls: 'of-curve of-srpc of-after' }), nameOf(curveOf(m.srpc2), ecCurveNamed(sn, 2, from), P.blue));
    }
    const pts = [['A', m.A]];
    if (showAfter) { if (m.B) pts.push(['B', m.B]); if (m.C) pts.push(['C', m.C]); }
    const xm = [], ym = [], spanX = box.x1 - box.x0, spanY = box.y1 - box.y0;
    const addMark = (list, v, name, span) => { const s = list.find(x => maNearly(x.v, v, span)); if (s) { if (name && s.name !== name && !s.name.includes(name)) s.name = `${s.name} = ${name}`; } else list.push({ v, name }); };
    if (d.lrpc !== false) { addMark(xm, m.un, ecCurveNamed(un, lrpcShifts ? 1 : 0, from), spanX); if (lrpcShifts && showAfter) addMark(xm, m.un2, ecCurveNamed(un, 2, from), spanX); }
    pts.forEach(([k, p], i) => {
      if (showAfter && d.arrows !== false && i > 0) { const q = pts[i - 1][1], a = [A.X(q.x), A.Y(q.y)], b = [A.X(p.x), A.Y(p.y)], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len > 24) kids.push(arrow(r2(a[0] + (b[0] - a[0]) * 8 / len), r2(a[1] + (b[1] - a[1]) * 8 / len), r2(b[0] - (b[0] - a[0]) * 8 / len), r2(b[1] - (b[1] - a[1]) * 8 / len), { colour: P.ink2, width: 1.8, head: 9, dash: '6 4', cls: 'of-path' })); }
      kids.push(...ecDot(A, p, P, ecName(L[k], k), { cls: 'of-point', dx: 9, dy: -12 }));
      if (d.guides !== false) {
        kids.push(...ecGuide(A, p, P, { fromX: A.L }));
        if (numbered) { addMark(ym, p.y, null, spanY); addMark(xm, p.x, null, spanX); }
      }
    });
    if (numbered) for (const y of ym) kids.push(ecMark(A, 'y', y.v, y.name ? `${y.name}` : '', o, P, { hidden: hideV, dp: 1 }));
    if (numbered) kids.push(...ecMarksX(A, xm.map(x => ({ ...x, name: x.name || '' })), o, P, { hidden: hideV, dp: 1 }));
    else kids.push(...ecMarksX(A, xm, o, P, { hidden: hideV }));
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'phillipsCurve' }, o.title || W('phillipsCurve'));
  },
};

// ---------------------------------------------------------------- the business cycle
const BC_KEYS = ['kind', 'hide', 'cycles', 'start', 'amplitude', 'trend', 'irregularity', 'seed', 'style', 'phases', 'every', 'dots', 'shade', 'trendLine', 'names', 'xtitle', 'ytitle', 'heading'];
const BC_PHASES = ['expansion', 'contraction', 'recession', 'recovery'];
const bcOf = d => ({ cycles: d.cycles ?? 1.5, start: d.start || 'rising', amplitude: d.amplitude ?? 1.5, trend: d.trend ?? 0.3, irregularity: d.irregularity ?? 0, seed: d.seed ?? 1 });
const bcWaveOf = d => bcWave(bcOf(d), { x0: 0.6, x1: 9.6, lo: 1.6, hi: 8.4 });
/** The labels along the wave, left to right: the turns (peak, trough) and the phases named on their rises and falls. */
function bcItems(d, w) {
  const items = [], phases = d.phases || ['expansion', 'contraction'];
  for (const t of w.turns) items.push({ x: t.x, y: t.y, what: t.kind, turn: true });
  const named = new Set();
  for (const ph of w.phases) {
    const mid = (ph.x0 + ph.x1) / 2;
    if (ph.rising) {
      if (phases.includes('expansion') && (d.every || !named.has('expansion'))) { items.push({ x: mid, y: w.y(mid), what: 'expansion', rising: true }); named.add('expansion'); }
      if (phases.includes('recovery') && ph.fromTurn && (d.every || !named.has('recovery'))) { const x = ph.x0 + (ph.x1 - ph.x0) * 0.4; items.push({ x, y: w.y(x), what: 'recovery', rising: true, below: true }); named.add('recovery'); }
    } else {
      if (phases.includes('contraction') && (d.every || !named.has('contraction'))) { items.push({ x: mid, y: w.y(mid), what: 'contraction', rising: false }); named.add('contraction'); }
      if (phases.includes('recession') && ph.whole && (d.every || !named.has('recession'))) { const x = ph.x0 + (ph.x1 - ph.x0) * 0.6; items.push({ x, y: w.y(x), what: 'recession', rising: false, below: true }); named.add('recession'); }
    }
  }
  return items.sort((a, b) => a.x - b.x);
}
const BC_WORDS = { peak: 'cyclePeak', trough: 'cycleTrough', expansion: 'expansion', contraction: 'contraction', recession: 'recession', recovery: 'recovery', trend: 'trendLine' };
/**
 * { cycles (1 to 4, by halves), start: "trough" | "rising" | "peak" | "falling", amplitude (0.5 to 2.5), trend (0 to
 * 0.6, up for each across), irregularity (0 to 1), seed, style: "words" | "letters" (A, B, C along the wave for a
 * quiz), phases (which to name: "expansion", "contraction", "recession", "recovery"), every (name each, not once),
 * dots (at the turns), shade (recessions, peak to trough), trendLine (true), names: { peak, trough, ... } (your own
 * words), xtitle, ytitle, heading }. Shape only (no numbers). hide: "labels" (each label a line to write on), true.
 */
export const businessCycle = {
  check(d) {
    const out = ecOdd(d, BC_KEYS, 'a business cycle graph');
    if (out.length) return out;
    if (d.cycles !== undefined && !(isNum(d.cycles, 1, 4) && Number.isInteger(d.cycles * 2))) out.push('"cycles" is 1 to 4, in halves');
    if (d.start !== undefined && !BC_STARTS.includes(d.start)) out.push(`"start" is one of ${BC_STARTS.join(', ')}`);
    if (d.amplitude !== undefined && !isNum(d.amplitude, 0.5, 2.5)) out.push('"amplitude" is 0.5 to 2.5');
    if (d.trend !== undefined && !isNum(d.trend, 0, 0.6)) out.push('"trend" is 0 to 0.6');
    if (d.irregularity !== undefined && !isNum(d.irregularity, 0, 1)) out.push('"irregularity" is 0 to 1');
    if (d.seed !== undefined && !(Number.isInteger(d.seed) && d.seed >= 1 && d.seed <= 999999)) out.push('"seed" is a whole number from 1 to 999999');
    if (d.style !== undefined && !['words', 'letters'].includes(d.style)) out.push('"style" is "words" or "letters"');
    if (d.phases !== undefined && (!Array.isArray(d.phases) || d.phases.some(p => !BC_PHASES.includes(p)))) out.push(`"phases" is a list of ${BC_PHASES.join(', ')}`);
    out.push(...ecBool(d, ['every', 'dots', 'shade', 'trendLine']));
    if (d.names !== undefined) {
      if (!d.names || typeof d.names !== 'object' || Object.keys(d.names).some(k => !BC_WORDS[k]) || Object.values(d.names).some(v => !text(v, 30))) out.push(`"names" is { ${Object.keys(BC_WORDS).join(', ')} }: your own words`);
    }
    for (const k of ['xtitle', 'ytitle', 'heading']) if (d[k] !== undefined && !text(d[k], 60)) out.push(`"${k}" must be a short text`);
    if (out.length) return out;
    if (!bcWaveOf(d).falls) out.push('the trend rises faster than the cycle falls, so real GDP never falls: lower "trend" or raise "amplitude"');
    return out;
  },
  /** The peaks and troughs (how many, and where), the expansions and contractions, and what each letter names in a quiz. */
  solve(d) {
    if (businessCycle.check(d).length) return null;
    const w = bcWaveOf(d), items = bcItems(d, w), letters = {};
    items.forEach((it, k) => { letters['ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k % 26]] = it.what; });
    return { peaks: w.turns.filter(t => t.kind === 'peak').length, troughs: w.turns.filter(t => t.kind === 'trough').length, turns: w.turns.map(t => ({ x: t.x, y: t.y, kind: t.kind })),
      expansions: w.phases.filter(p => p.rising).length, contractions: w.phases.filter(p => !p.rising).length, recessions: w.phases.filter(p => !p.rising && p.whole).length, letters };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), w = bcWaveOf(d), hideL = hides(o, 'labels'), names = d.names || {}, word = k => text(names[k], 30) || W(BC_WORDS[k]);
    const A = ecPlot(o, { box: { x0: 0, x1: 10, y0: 0, y1: 10 }, xtitle: text(d.xtitle, 60) || W('time'), ytitle: text(d.ytitle, 60) || W('realGdp'), right: 40 });
    const kids = [...A.kids];
    // recessions shaded, each from a peak to the trough after it
    if (d.shade) for (const ph of w.phases) if (!ph.rising && ph.whole) {
      const pts = [[A.X(ph.x0), A.T], [A.X(ph.x1), A.T], [A.X(ph.x1), A.B], [A.X(ph.x0), A.B]];
      kids.push(node('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: o.print ? '#E6E6E6' : P.soft, class: 'of-recession' }), node('path', { d: ecHatch(pts, 45, 9), stroke: o.print ? '#999999' : P.gridStrong, 'stroke-width': 0.8, fill: 'none', class: 'of-hatch' }));
    }
    const curve = (f, n = 300) => Array.from({ length: n + 1 }, (_, k) => { const x = w.x0 + ((w.x1 - w.x0) * k) / n; return { x, y: f(x) }; });
    if (d.trendLine !== false) {
      const t = curve(w.trend, 2);
      kids.push(...ecCurve(A, t, { colour: P.ink2, width: 2, dash: '9 6', cls: 'of-curve of-trend' }));
      const e = ecEnd(A, t);
      if (e) kids.push(ecNameAt(e.x - 4, e.y + 18, word('trend'), { anchor: 'end', size: 12.5, colour: P.ink2, halo: P.paper, palette: P, cls: 'of-trend-name' }, hideL));
    }
    kids.push(...ecCurve(A, curve(w.y), { colour: P.blue, width: 3.2, cls: 'of-curve of-gdp' }));
    const items = bcItems(d, w), letters = d.style === 'letters';
    items.forEach((it, k) => {
      const x = A.X(it.x), y = A.Y(it.y), s = letters ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k % 26] : word(it.what), opt = { size: letters ? 15 : 13, colour: P.ink, halo: P.paper, palette: P, cls: `of-bc-label of-bc-${it.what}` };
      if (it.turn) {
        if (d.dots || letters) kids.push(node('circle', { cx: r2(x), cy: r2(y), r: 4.5, fill: P.ink, class: 'of-turn' }));
        kids.push(ecNameAt(x, it.what === 'peak' ? y - 14 : y + 20, s, { ...opt, anchor: 'middle' }, hideL));
      } else {
        // over the curve for an expansion or contraction; under it, either side of the trough, for a recession or recovery
        const dx = (it.rising ? -12 : 12) * (it.below ? -1 : 1), a = dx < 0 ? 'end' : 'start';
        kids.push(ecNameAt(x + dx, it.below ? y + 16 : y - 8, s, { ...opt, anchor: a }, hideL));
      }
    });
    kids.push(ecHeading(d, A.w, P));
    return frame(A.w, A.h, kids, { ...o, kind: 'businessCycle' }, o.title || W('businessCycle'));
  },
};
export const MACRO_KINDS = { adAs, phillipsCurve, businessCycle };
