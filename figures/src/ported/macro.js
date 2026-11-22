// Oomba Figures: the macroeconomics behind the AD-AS, Phillips curve and business cycle graphs (1.4.0, the economics
// pack). AD-AS on the hidden 0-to-10 grid: straight AD and SRAS through (5, 5), full employment there or a gap to its
// right (recessionary) or left (inflationary), and the three-range (Keynesian) aggregate supply curve, flat, bending up
// and vertical at full employment. The Phillips curve: a short-run curve pe + k(1/(u - c) - 1/(un - c)), convex and
// sloping down, crossing the vertical long-run curve at the natural rate un and expected inflation pe, moved along
// (A to B), shifted by a supply shock or by expectations, or moved back to the long-run curve as expectations catch up
// (C). The business cycle: real GDP swinging around a rising trend, each swing half a cosine, irregular swings varied
// from a seed (mulberry32) and bent so the wave turns smoothly where a short swing meets a long one; the peaks and
// troughs and the phases between them worked out from the wave as drawn, trend and all. Pure numbers in, pure numbers
// out: figures/src/macro.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle, the settings read from plain data; the label and arrow placement, the
// fitted ranges, the summaries and the address format are left out (Oomba checks the data and draws its own figure).

// ---------------------------------------------------------------- AD-AS
export const AA_FAR = 100;
/** How steep the schematic AD and SRAS lines are; how far a starting gap puts output from full employment. */
export const AA_SLOPE = 0.8;
export const AA_GAP = { small: 1, medium: 1.5, large: 2 };
/** The three-range curve's flat price level, and the price level where it turns vertical. */
export const AA_FLAT = 3;
export const AA_CORNER = 6.6;
/** A shift that leaves output closer to full employment than SNAP is put on it; a little farther off, MIN_GAP off. */
export const AA_SNAP = 0.4;
export const AA_MIN_GAP = 1;
/** The three-range aggregate supply curve: flat (Keynesian), bending up (intermediate), vertical at yf (classical). */
export function aaThreeRange(yf) {
  const x0 = yf - 3.4, n = 2.8, out = [{ x: -AA_FAR, y: AA_FLAT }], N = 120;
  for (let k = 0; k <= N; k++) {
    const t = ((Math.PI / 2) * k) / N;
    out.push({ x: x0 + (yf - x0) * Math.pow(Math.sin(t), 2 / n), y: AA_CORNER - (AA_CORNER - AA_FLAT) * Math.pow(Math.cos(t), 2 / n) });
  }
  out.push({ x: yf, y: AA_FAR });
  return out;
}

// ---------------------------------------------------------------- the Phillips curve
/** The short-run curve's inflation rate at unemployment u. */
export const pcInflationAt = (p, u) => p.pe + p.k * (1 / (u - p.c) - 1 / (p.un - p.c));
/** The same short-run curve moved dx across and dy up. */
export const pcMovedBy = (p, dx, dy) => ({ un: p.un + dx, pe: p.pe + dy, c: p.c + dx, k: p.k });
/** The short-run curve moved as far up as right (or down as left), till it is at inflation y at unemployment u. */
export function pcMovedThrough(p, u, y) {
  let lo = -50, hi = u - p.c - 1e-9;
  for (let i = 0; i < 80; i++) { const t = (lo + hi) / 2; if (pcInflationAt(p, u - t) + t < y) lo = t; else hi = t; }
  return pcMovedBy(p, lo, lo);
}
/** How far left of the natural rate the short-run curve rises without end: schematic, in grid units; numbered, times the natural rate. */
export const PC_BEND = { gentle: 1.6, normal: 1, strong: 0.6 };
const PC_SCHEMATIC_PE = { up: 3.5, down: 5 };
/** Where a schematic graph's short-run curves are drawn, and how far in its points and natural rates stay. */
export const PC_DRAW = { x0: 0.7, x1: 9.4, y0: 0.4, y1: 9.2 };
const PC_ROOM = { x0: 1.4, x1: 8.4 };
const PC_SCALES = [1, 0.85, 0.7, 0.55, 0.4, 0.25];
const pcNear = (a, b) => Math.abs(a - b) < 1e-9;
/** Where a short-run curve comes down through height y, or null if it is always under it. */
export function pcTopOf(c, y) { const r = (y - c.pe) / c.k + 1 / (c.un - c.c); return r > 0 ? c.c + 1 / r : null; }
/** A schematic movement, scale times its size: B and C, the short-run curve shifted and the natural rate moved. */
function pcSchematicMove(s, srpc1, A, scale, share) {
  let B = null, C = null, srpc2 = null, un2 = null;
  if (s.movement === 'along') {
    const u = A.x + (s.along === 'up' ? -1 : 1) * (0.7 * share + 0.5) * scale;
    B = { x: u, y: pcInflationAt(srpc1, u) };
    if (s.longRun) { srpc2 = pcMovedThrough(srpc1, A.x, B.y); C = { x: A.x, y: B.y }; }
  } else if (s.movement === 'srpc') {
    const t = (s.side === 'right' ? 1 : -1) * (0.5 * share + 0.3) * scale;
    srpc2 = pcMovedBy(srpc1, t, t);
    B = s.cause === 'expectations' ? { x: A.x, y: pcInflationAt(srpc2, A.x) } : { x: A.x + t, y: A.y + t };
  } else if (s.movement === 'lrpc') {
    un2 = A.x + (s.side === 'right' ? 1 : -1) * share * scale;
    if (s.withSrpc) { srpc2 = pcMovedBy(srpc1, un2 - A.x, 0); B = { x: un2, y: A.y }; }
  }
  return { B, C, srpc2, un2 };
}
function pcFits(m, A, srpc1) {
  const { x0, x1, y0, y1 } = PC_DRAW;
  const xs = [m.B && m.B.x, m.C && m.C.x, m.un2 === null ? undefined : m.un2].filter(x => x !== undefined && x !== null);
  if (xs.some(x => x < PC_ROOM.x0 - 1e-9 || x > PC_ROOM.x1 + 1e-9)) return false;
  const lrpcs = [A.x, ...(m.un2 !== null ? [m.un2] : [])];
  const tops = [srpc1, m.srpc2].map(c => (c ? pcTopOf(c, y1) : null)).filter(x => x !== null);
  if (tops.some(t => lrpcs.some(u => Math.abs(t - u) < 0.5))) return false;
  const c = m.srpc2;
  if (!c) return true;
  return (c.c >= x0 || pcInflationAt(c, x0) >= Math.min(y1, A.y + 0.5 * (y1 - A.y))) && pcInflationAt(c, x1) >= y0 + 0.1;
}
/**
 * Where the economy is and goes: the curves and the points A, B and C. s: { numbered, curvature, movement ('none',
 * 'along', 'srpc', 'lrpc'), along ('up', 'down'), side ('right', 'left'), cause ('shock', 'expectations'), share (a
 * schematic size as a share of the axis), longRun, withSrpc; numbered: nru, expected, u2, pi2, expected2, uShock, nru2 }.
 */
export function pcModel(s) {
  const notes = [], un = s.numbered ? s.nru : 5;
  const down = (s.movement === 'along' && s.along === 'down') || (s.movement === 'srpc' && s.side === 'left');
  const pe = s.numbered ? s.expected : PC_SCHEMATIC_PE[down ? 'down' : 'up'], A = { x: un, y: pe };
  if (!s.numbered) {
    const d = PC_BEND[s.curvature] * 5, srpc1 = { un, pe, c: un - d, k: d * d };
    let move = pcSchematicMove(s, srpc1, A, PC_SCALES[0], s.share);
    for (const scale of PC_SCALES.slice(1)) { if (pcFits(move, A, srpc1)) break; move = pcSchematicMove(s, srpc1, A, scale, s.share); }
    return { un, pe, srpc1, srpc2: move.srpc2, un2: move.un2, A, B: move.B, C: move.C, notes };
  }
  let c = un - PC_BEND[s.curvature] * un;
  if (s.u2 < un) c = Math.min(c, s.u2 - 0.25 * (un - s.u2));
  const k = (s.pi2 - pe) / (1 / (s.u2 - c) - 1 / (un - c));
  if (pcNear(s.u2, un) || !(k > 0) || !Number.isFinite(k)) notes.push('the short-run curve slopes down: its second point needs lower unemployment and higher inflation than A, or higher unemployment and lower inflation');
  const srpc1 = { un, pe, c, k: k > 0 && Number.isFinite(k) ? k : 1 };
  let B = null, C = null, srpc2 = null, un2 = null;
  if (s.movement === 'along') {
    B = { x: s.u2, y: pcInflationAt(srpc1, s.u2) };
    if (s.longRun) { srpc2 = { ...srpc1, pe: B.y }; C = { x: un, y: B.y }; }
  } else if (s.movement === 'srpc') {
    const pe2 = s.expected2;
    if (pcNear(pe2, pe)) notes.push('"expected2" must differ from "expected" for the short-run curve to shift');
    srpc2 = { ...srpc1, pe: pe2 };
    if (s.cause === 'expectations') B = { x: un, y: pe2 };
    else {
      B = { x: s.uShock, y: pcInflationAt(srpc2, s.uShock) };
      if (pe2 > pe && s.uShock <= un) notes.push('stagflation (a higher short-run curve) needs "uShock" above the natural rate');
      if (pe2 < pe && s.uShock >= un) notes.push('a positive supply shock (a lower short-run curve) needs "uShock" below the natural rate');
    }
  } else if (s.movement === 'lrpc') {
    un2 = s.nru2;
    if (pcNear(un2, un)) notes.push('"nru2" must differ from "nru" for the long-run curve to shift');
    if (s.withSrpc) { srpc2 = pcMovedBy(srpc1, un2 - un, 0); B = { x: un2, y: pe }; }
  }
  return { un, pe, srpc1, srpc2, un2, A, B, C, notes };
}

// ---------------------------------------------------------------- the business cycle
export const BC_STARTS = ['trough', 'rising', 'peak', 'falling'];
const BC_START_AT = { trough: 0, rising: 0.5, peak: 1, falling: 1.5 };
const BC_HEIGHT_VARIES = 0.4, BC_LENGTH_VARIES = 0.45;
/** A repeatable stream of random numbers from 0 to 1 (mulberry32). */
export function bcRandom(seed) {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * The wave from x0 to x1 across the graph, raised and squeezed so it and the trend fit between lo and hi up the graph,
 * with its turning points ({ x, y, kind: 'peak' | 'trough' }) and phases ({ x0, x1, rising, fromTurn, toTurn, whole }).
 * w: { cycles (in halves), start, amplitude, trend (up per across), irregularity (0 to 1), seed }.
 */
export function bcWave(w, { x0, x1, lo, hi }) {
  const next = bcRandom(w.seed), heights = [], lengths = [];
  for (let k = 0; k <= Math.ceil(BC_START_AT[w.start] + 2 * w.cycles) + 1; k++) {
    heights.push((k % 2 ? 1 : -1) * w.amplitude * (1 + w.irregularity * BC_HEIGHT_VARIES * (2 * next() - 1)));
    lengths.push(1 + w.irregularity * BC_LENGTH_VARIES * (2 * next() - 1));
  }
  heights.unshift(w.amplitude); lengths.unshift(lengths[0]);
  const from = BC_START_AT[w.start] + 1, to = from + 2 * w.cycles, count = heights.length - 1, starts = [0];
  for (let k = 0; k < count; k++) starts.push(starts[k] + lengths[k]);
  const sharp = k => Math.abs(heights[k + 1] - heights[k]) / lengths[k] ** 2;
  const bendAt = (k, toward) => (toward < 0 || toward >= count ? 1 : Math.min(3, Math.max(1 / 3, Math.sqrt(sharp(toward) / sharp(k)))));
  const bends = Array.from({ length: count }, (_, k) => ({ start: bendAt(k, k - 1), end: bendAt(k, k + 1) }));
  const HALF = Math.PI ** 2 / 2;
  const shape = (k, f) => { const a = HALF * (bends[k].start - 1), b = -HALF * (bends[k].end - 1); return (1 - Math.cos(Math.PI * f)) / 2 + a * (f ** 2 / 2 - (3 * f ** 3) / 2 + (3 * f ** 4) / 2 - f ** 5 / 2) + b * (f ** 3 / 2 - f ** 4 + f ** 5 / 2); };
  const shapeSlope = (k, f) => { const a = HALF * (bends[k].start - 1), b = -HALF * (bends[k].end - 1); return (Math.PI / 2) * Math.sin(Math.PI * f) + a * f * (1 - f) ** 2 * (1 - 2.5 * f) + b * f ** 2 * (1 - f) * (1.5 - 2.5 * f); };
  const timeAt = h => { const k = Math.min(count - 1, Math.floor(h)); return starts[k] + (h - k) * lengths[k]; };
  const turnNear = (k, g) => {
    const peak = heights[k] > 0, j = peak ? k : k - 1;
    const steep = f => (Math.abs(heights[j + 1] - heights[j]) * shapeSlope(j, peak ? f : 1 - f)) / lengths[j] - g;
    const STEPS = 200;
    let f = 1;
    for (let i = 1; i <= STEPS; i++) {
      if (steep(i / STEPS) < 0) continue;
      let a = (i - 1) / STEPS, b = i / STEPS;
      for (let n = 0; n < 50; n++) { const m = (a + b) / 2; if (steep(m) < 0) a = m; else b = m; }
      f = (a + b) / 2;
      break;
    }
    if (f === 1) return null;
    return peak ? starts[k] + f * lengths[k] : starts[k] - f * lengths[k - 1];
  };
  let t0 = timeAt(from), t1 = timeAt(to);
  const turnsAt = { start: false, end: false };
  for (let i = 0; i < 40 && (Number.isInteger(from) || Number.isInteger(to)); i++) {
    const g = (w.trend * (x1 - x0)) / (t1 - t0), a = Number.isInteger(from) ? turnNear(from, g) : null, b = Number.isInteger(to) ? turnNear(to, g) : null;
    turnsAt.start = a !== null; turnsAt.end = b !== null;
    const moved = Math.abs((a ?? timeAt(from)) - t0) + Math.abs((b ?? timeAt(to)) - t1);
    t0 = a ?? timeAt(from); t1 = b ?? timeAt(to);
    if (moved < 1e-12) break;
  }
  const perX = (t1 - t0) / (x1 - x0);
  const swing = x => {
    const t = t0 + (x - x0) * perX;
    let k = 0;
    while (k < count - 1 && starts[k + 1] <= t) k++;
    const f = (t - starts[k]) / lengths[k], a = heights[k], b = heights[k + 1];
    return { at: a + (b - a) * shape(k, f), slope: ((b - a) * shapeSlope(k, f) * perX) / lengths[k] };
  };
  const rawTrend = x => w.trend * (x - x0), raw = x => rawTrend(x) + swing(x).at, rawSlope = x => w.trend + swing(x).slope;
  const N = 600, xs = Array.from({ length: N + 1 }, (_, k) => x0 + ((x1 - x0) * k) / N), ys = [...xs.map(raw), rawTrend(x0), rawTrend(x1)];
  const min = Math.min(...ys), max = Math.max(...ys), scale = Math.min(1, (hi - lo) / Math.max(1e-9, max - min)), base = (lo + hi) / 2 - ((min + max) / 2) * scale;
  const y = x => base + raw(x) * scale, trend = x => base + rawTrend(x) * scale;
  const turns = [];
  for (let k = 1; k <= N; k++) {
    let a = xs[k - 1], b = xs[k];
    const sa = rawSlope(a), sb = rawSlope(b);
    if (!(sa > 0 && sb <= 0) && !(sa < 0 && sb >= 0)) continue;
    for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (Math.sign(rawSlope(m)) === Math.sign(sa)) a = m; else b = m; }
    const x = (a + b) / 2;
    if (x - x0 < (x1 - x0) * 1e-3 || x1 - x < (x1 - x0) * 1e-3) continue;
    turns.push({ x, y: y(x), kind: sa > 0 ? 'peak' : 'trough' });
  }
  if (turnsAt.start) turns.unshift({ x: x0, y: y(x0), kind: heights[from] > 0 ? 'peak' : 'trough' });
  if (turnsAt.end) turns.push({ x: x1, y: y(x1), kind: heights[to] > 0 ? 'peak' : 'trough' });
  const turning = new Set(turns.map(t => t.x)), edges = [...new Set([x0, ...turning, x1])], phases = [];
  for (let k = 1; k < edges.length; k++) {
    const a = edges[k - 1], b = edges[k];
    if (b - a < 1e-6) continue;
    phases.push({ x0: a, x1: b, rising: rawSlope((a + b) / 2) > 0, fromTurn: turning.has(a), toTurn: turning.has(b), whole: turning.has(a) && turning.has(b) });
  }
  return { y, trend, turns, phases, falls: xs.some(x => rawSlope(x) < 0), x0, x1 };
}
