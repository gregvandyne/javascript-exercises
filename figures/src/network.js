// Oomba Figures: compound circuits (the physics pack, 1.1.0), the circuit kind's layout "network". A loop of parts and
// groups (ported/circuittree.js: series groups and parallel groups, nested up to 3 deep, up to 8 parts), drawn with the
// same school symbols as the other circuits, laid out so no wires cross: a series run left to right, a parallel group's
// branches stacked between two rails with a dot at every joint, the cell or battery on the wire back. Its numbers are
// worked out from the resistances and the source's voltage (Ohm's law with resistances in series adding and in
// parallel adding as reciprocals): the equivalent resistance, and the current through and the voltage across every
// part, which the ammeters and voltmeters show.
import { node, label, line, fmt, isNum, text, hides, r2 } from './svg.js';
import { symbol } from './physics.js';
import { CT_MAX_PARTS, CT_MAX_DEPTH, ctType, ctItems, ctParts, ctDepth, ctNames } from './ported/circuittree.js';

const NET_PARTS = ['cell', 'battery', 'resistor', 'bulb', 'switch', 'ammeter', 'fuse'];
const NET_KEYS = ['kind', 'hide', 'layout', 'loop', 'names', 'values'];
const isSource = p => p.type === 'cell' || p.type === 'battery';
/** A part's resistance (ohms): a resistor's or bulb's own, 0 for a closed switch, an ammeter or a fuse, Infinity for an
 *  open switch; null when a resistor or bulb has none given. */
const partOhms = p => (p.type === 'resistor' || p.type === 'bulb' ? (isNum(p.ohms) ? p.ohms : null) : p.type === 'switch' && p.open ? Infinity : 0);
function ohmsOf(it) {
  const t = ctType(it);
  if (t === 'part') return isSource(it) ? 0 : partOhms(it);
  const rs = ctItems(it).map(ohmsOf);
  if (rs.some(r => r === null)) return null;
  if (t === 'series') return rs.reduce((a, b) => a + b, 0);
  if (rs.some(r => r === 0)) return 0;
  const g = rs.reduce((a, r) => a + (r === Infinity ? 0 : 1 / r), 0);
  return g === 0 ? Infinity : 1 / g;
}
export function networkCheck(d) {
  const out = [];
  for (const k of Object.keys(d)) if (!NET_KEYS.includes(k)) out.push(`"${k}" is not used by a network circuit (give the parts in "loop")`);
  if (!Array.isArray(d.loop) || !d.loop.length) return [...out, '"loop" must list the parts and groups round the circuit: { type: "battery", volts }, { type: "resistor", ohms }, { series: [...] }, { parallel: [...] }'];
  const walk = (it, where, depth) => {
    const t = ctType(it);
    if (!t) { out.push(`${where}: each item is a part { type, ... }, { series: [...] } or { parallel: [...] }`); return; }
    if (t === 'part') {
      if (!NET_PARTS.includes(it.type)) out.push(`${where}: "type" must be one of ${NET_PARTS.join(', ')} (a voltmeter goes on a part: "voltmeter": true)`);
      if (isSource(it) && depth) out.push(`${where}: the cell or battery goes in the loop itself, not inside a group`);
      if (isSource(it) && it.volts !== undefined && !isNum(it.volts, 0.01, 10000)) out.push(`${where}: "volts" must be above 0`);
      if ((it.type === 'resistor' || it.type === 'bulb') && it.ohms !== undefined && !isNum(it.ohms, 1e-3, 1e7)) out.push(`${where}: "ohms" must be above 0`);
      if (it.ohms !== undefined && !(it.type === 'resistor' || it.type === 'bulb')) out.push(`${where}: only a resistor or a bulb has "ohms"`);
      if (it.volts !== undefined && !isSource(it)) out.push(`${where}: only the cell or battery has "volts"`);
      if (it.open !== undefined && it.type !== 'switch') out.push(`${where}: only a switch is "open"`);
      if (it.voltmeter !== undefined && typeof it.voltmeter !== 'boolean') out.push(`${where}: "voltmeter" is true (a voltmeter across this part) or false`);
      if (it.name !== undefined && !text(it.name, 6)) out.push(`${where}: "name" must be short text`);
      return;
    }
    const kids = ctItems(it);
    if (t === 'parallel' && (kids.length < 2 || kids.length > 4)) out.push(`${where}: a parallel group has 2 to 4 branches`);
    if (t === 'series' && kids.length < 2) out.push(`${where}: a series group has 2 or more items (one part needs no group)`);
    kids.forEach((k, i) => { if (t === 'parallel' && ctType(k) === 'parallel') out.push(`${where} branch ${i + 1}: a parallel group straight inside a parallel group is one group: list its branches together`); walk(k, `${where} ${t === 'parallel' ? 'branch' : 'item'} ${i + 1}`, depth + 1); });
  };
  d.loop.forEach((it, i) => walk(it, `item ${i + 1}`, 0));
  if (out.length) return out;
  const parts = ctParts(d.loop), sources = d.loop.filter(it => ctType(it) === 'part' && isSource(it));
  if (sources.length !== 1) out.push('the loop needs exactly one cell or battery');
  if (parts.length > CT_MAX_PARTS) out.push(`at most ${CT_MAX_PARTS} parts (this one has ${parts.length})`);
  if (Math.max(...d.loop.map(ctDepth)) > CT_MAX_DEPTH) out.push(`groups nest at most ${CT_MAX_DEPTH} deep`);
  if (parts.length < 2) out.push('the loop needs something for the current to go through');
  if (out.length) return out;
  // a bare wire in parallel with anything shorts it out; a loop of bare wire shorts the cell
  const shorts = it => ctType(it) === 'parallel' && ctItems(it).some(k => ohmsOf(k) === 0) && ctItems(it).some(k => ohmsOf(k) !== 0);
  const anyShort = it => shorts(it) || (ctType(it) !== 'part' && ctItems(it).some(anyShort));
  if (d.loop.some(anyShort)) out.push('a branch with no resistor or bulb (only wire, ammeters or a closed switch) is in parallel with another: it would short it out');
  const R = ohmsOf({ series: d.loop });
  if (R === 0) out.push('the loop has no resistor or bulb: it is a short circuit');
  if (d.names !== undefined && typeof d.names !== 'boolean') out.push('"names" must be true or false');
  if (d.values !== undefined && typeof d.values !== 'boolean') out.push('"values" must be true or false');
  return out;
}
/** The numbers: the source's voltage, the equivalent resistance, the current from the source, and each part's name,
 *  resistance, current and voltage (null where a resistance or the voltage is not given). */
export function networkSolve(d) {
  const names = ctNames(d.loop), src = d.loop.find(it => ctType(it) === 'part' && isSource(it)), V = isNum(src.volts) ? src.volts : null;
  const R = ohmsOf({ series: d.loop }), I = V === null || R === null ? null : R === Infinity ? 0 : V / R, parts = [];
  const flow = (it, i, v) => {
    const t = ctType(it);
    if (t === 'part') { if (isSource(it)) return; const r = partOhms(it); parts.push({ name: names.get(it), type: it.type, ohms: r, current: i, voltage: r === Infinity ? v : i === null || r === null ? null : i * r }); return; }
    if (t === 'series') { const rs = ctItems(it).map(ohmsOf); for (const [k, kid] of ctItems(it).entries()) flow(kid, i, i === null || rs[k] === null ? null : rs[k] === Infinity ? (i === 0 ? null : null) : i * rs[k]); return; }
    const rq = ohmsOf(it), vv = i === null || rq === null ? null : rq === Infinity ? null : i * rq;
    for (const kid of ctItems(it)) { const rk = ohmsOf(kid); flow(kid, vv === null || rk === null ? null : rk === Infinity ? 0 : vv / rk, vv); }
  };
  for (const it of d.loop) flow(it, I, null);
  // an open switch in the loop: no current anywhere, and the whole voltage across the gap
  if (R === Infinity && V !== null) for (const p of parts) if (p.ohms === Infinity) p.voltage = V; else if (p.voltage === null) p.voltage = 0;
  return { volts: V, resistance: R, current: I, parts };
}

const CW = 64, PW = 96, GAP = 26, RAIL = 22;
function sizeOf(it, d) {
  const t = ctType(it);
  if (t === 'part') return { w: PW, up: (d.names !== false || d.values !== false ? 34 : 18) + (it.voltmeter ? 64 : 0), down: 14 };
  const s = ctItems(it).map(k => sizeOf(k, d));
  if (t === 'series') return { w: s.reduce((a, b) => a + b.w, 0), up: Math.max(...s.map(x => x.up)), down: Math.max(...s.map(x => x.down)) };
  let down = 0; s.forEach((x, i) => { if (i) down += s[i - 1].down + GAP + x.up; });
  return { w: Math.max(...s.map(x => x.w)) + 2 * RAIL, up: s[0].up, down: down + s[s.length - 1].down };
}
export function networkDraw(d, o, P, frameIt) {
  const names = ctNames(d.loop), sol = networkSolve(d), byName = new Map(sol.parts.map(p => [p.name, p])), hideM = o.hide === true || hides(o, 'meters');
  const wire = (x1, y1, x2, y2) => line(x1, y1, x2, y2, P.ink, 2.5), dot = (x, y) => node('circle', { cx: x, cy: y, r: 4.5, fill: P.ink });
  const kids = [];
  const words = p => {
    const n = d.names !== false ? names.get(p) : '', s = byName.get(names.get(p));
    const v = d.values === false ? '' : isSource(p) ? (isNum(p.volts) ? `${fmt(p.volts, 2, o.lang)} V` : '') : p.type === 'resistor' || p.type === 'bulb' ? (isNum(p.ohms) ? `${fmt(p.ohms, 2, o.lang)} Ω` : '')
      : p.type === 'ammeter' ? (hideM ? '? A' : s && s.current !== null ? `${fmt(s.current, 2, o.lang)} A` : '') : '';
    return [n, v].filter(Boolean).join('  ');
  };
  const drawPart = (p, x, y, w, below = false) => {
    const sx = x + (w - CW) / 2;
    kids.push(wire(x, y, sx, y), wire(sx + CW, y, x + w, y), node('g', { transform: `translate(${r2(sx)} ${r2(y)})` }, symbol(p, P, CW)));
    const t = words(p);
    if (t) kids.push(label(x + w / 2, below ? y + 34 : y - 26, t, { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-part-label' }));
    if (p.voltmeter) {
      const s = byName.get(names.get(p)), yv = y - 66, a = sx - 6, b = sx + CW + 6, m = (a + b) / 2 - CW / 2;
      kids.push(dot(a, y), dot(b, y), wire(a, y, a, yv), wire(b, y, b, yv), wire(a, yv, m, yv), wire(m + CW, yv, b, yv), node('g', { transform: `translate(${r2(m)} ${r2(yv)})` }, symbol({ type: 'voltmeter' }, P, CW)),
        label(m + CW / 2, yv - 26, hideM ? '? V' : s && s.voltage !== null ? `${fmt(s.voltage, 2, o.lang)} V` : 'V', { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-meter' }));
    }
  };
  const drawItem = (it, x, y, w) => {
    const t = ctType(it), sz = sizeOf(it, d);
    if (t === 'part') return drawPart(it, x, y, w);
    if (w > sz.w) { kids.push(wire(x + sz.w, y, x + w, y)); }
    if (t === 'series') { let xx = x; for (const k of ctItems(it)) { const s = sizeOf(k, d); drawItem(k, xx, y, s.w); xx += s.w; } return; }
    const s = ctItems(it).map(k => sizeOf(k, d)), x1 = x + RAIL, x2 = x + sz.w - RAIL; let yy = y;
    ctItems(it).forEach((k, i) => {
      if (i) yy += s[i - 1].down + GAP + s[i].up;
      kids.push(wire(x, yy, x1, yy), wire(x2, yy, x + sz.w, yy));
      drawItem(k, x1, yy, x2 - x1);
    });
    kids.push(wire(x, y, x, yy), wire(x + sz.w, y, x + sz.w, yy));
    for (const xx of [x, x + sz.w]) { kids.push(dot(xx, y)); if (yy > y) kids.push(dot(xx, yy)); }
  };
  const top = d.loop.filter(it => !(ctType(it) === 'part' && isSource(it))), src = d.loop.find(it => ctType(it) === 'part' && isSource(it));
  const sizes = top.map(it => sizeOf(it, d)), up = Math.max(...sizes.map(s => s.up)), down = Math.max(...sizes.map(s => s.down));
  const L = 40, y0 = 20 + up, inner = Math.max(sizes.reduce((a, s) => a + s.w, 0), PW + 40), x0 = L + 20, y1 = y0 + down + 50;
  let x = x0;
  top.forEach((it, i) => { drawItem(it, x, y0, sizes[i].w); x += sizes[i].w; });
  const xEnd = Math.max(x, x0 + inner);
  kids.push(wire(L, y0, x0, y0), wire(x, y0, xEnd + 20, y0), wire(L, y0, L, y1), wire(xEnd + 20, y0, xEnd + 20, y1));
  // the cell or battery on the wire back, its + (the long line) on the left: the current goes clockwise round the loop as drawn
  const mid = (L + xEnd + 20) / 2;
  kids.push(wire(L, y1, mid - PW / 2, y1), wire(mid + PW / 2, y1, xEnd + 20, y1));
  drawPart(src, mid - PW / 2, y1, PW, true);
  return frameIt(xEnd + 20 + L, y1 + 50, kids);
}
