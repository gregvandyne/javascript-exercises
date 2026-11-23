// Oomba Figures: a galvanic (electrochemical) cell (1.6.0, the chemistry pack). Two beakers, each a metal strip in a
// 1 M solution of its own ion, joined by a salt bridge, with wires from the strips to a digital voltmeter, a dial
// voltmeter or a coil of wire. The voltmeter's + terminal is wired to the cathode, so it reads E°cell. Which metal is the
// anode, E°cell, the half-reactions and the overall reaction are worked out from the standard reduction potentials
// (ported/cells.js), never typed, though a teacher may type their own E°cell for the meter. The checks, the answers
// (OF.solve) and the drawing are Oomba's own. Print is black and white: the strips and solutions are grays, the + sign
// and the electron arrows black.
import { node, label, line, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { chemWords } from './chemwords.js';
import { GC_METALS, GC_INFO, gcCell, gcReactions } from './ported/cells.js';

const GC_KEYS = ['kind', 'hide', 'left', 'right', 'meter', 'voltage', 'labels', 'electrodes', 'flow', 'potentials', 'heading'];
/** A metal by symbol, or by atomic number (12 is Mg), as a generator deals it. */
const GC_Z = { 12: 'Mg', 13: 'Al', 30: 'Zn', 26: 'Fe', 28: 'Ni', 82: 'Pb', 29: 'Cu', 47: 'Ag' };
const gcNorm = d => ({ ...d, left: typeof d.left === 'number' ? GC_Z[d.left] : d.left, right: typeof d.right === 'number' ? GC_Z[d.right] : d.right });
const GC_W = 560, GC_MID = 280, GC_WIRE = 60, GC_BK = { top: 170, bottom: 360, width: 160, liquid: 205 }, GC_STRIP = { top: 110, bottom: 320, width: 22 };
const GC_SIDES = { left: { x: 40, strip: 100, leg: 170 }, right: { x: 360, strip: 460, leg: 390 } };
/** E°cell on the meter: the table's, or the teacher's own (0 to 9.99 V, to 0.01 V). */
const gcVoltage = d => (d.voltage !== undefined ? Math.round(d.voltage * 100) / 100 : gcCell(d.left, d.right).voltage);

/**
 * { left: "Zn", right: "Cu" (two different metals: Mg, Al, Zn, Fe, Ni, Pb, Cu, Ag), meter: "digital" | "dial" | "coil",
 * voltage?: the teacher's own E°cell for the meter (0 to 9.99 V; by default the table's), labels: true (the metals, their
 * solutions and the salt bridge named), electrodes: false (anode and cathode named under the beakers, with their signs),
 * flow: false (electron arrows along the wire, anode to cathode), potentials: false (each ion's E° under its solution;
 * "cathode" or "anode": that one only), heading }. A metal can be given by its atomic number (30 is Zn). hide: "reading" (the meter left blank),
 * "electrodes" (no signs, no anode or cathode, no electron arrows: for the student to work out), true (both).
 */
export const galvanicCell = {
  check(d0) {
    const odd = Object.keys(d0).filter(k => !GC_KEYS.includes(k));
    if (odd.length) return [`a galvanic cell does not take "${odd[0]}"`];
    const d = gcNorm(d0);
    for (const k of ['left', 'right']) if (!GC_METALS.includes(d[k])) return [`"${k}" is the ${k} electrode's metal: ${GC_METALS.join(', ')}`];
    if (d.left === d.right) return ['two strips of the same metal make no cell: give two different metals'];
    const out = [];
    if (d.meter !== undefined && !['digital', 'dial', 'coil'].includes(d.meter)) out.push('"meter" must be "digital", "dial" or "coil"');
    if (d.voltage !== undefined && !isNum(d.voltage, 0, 9.99)) out.push('"voltage" is the meter\'s E°cell, 0 to 9.99 V');
    if (d.voltage !== undefined && d.meter === 'coil') out.push('a coil of wire has no reading: leave out "voltage" or use a voltmeter');
    if (d.voltage !== undefined && d.meter === 'dial' && d.voltage > 4) out.push('the dial reads up to 4 V: use the digital voltmeter for more');
    for (const k of ['labels', 'electrodes', 'flow']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.potentials !== undefined && ![true, false, 'cathode', 'anode'].includes(d.potentials)) out.push('"potentials" must be true, false, "cathode" or "anode"');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    return out;
  },
  /** voltage (E°cell, V: the meter's), anode and cathode (the metals), anodeSide ("left" | "right"), flow (the way
   *  electrons go along the wire: "right" | "left"), anodePotential and cathodePotential (E°, V), electrons (moved in the
   *  overall reaction), oxidation, reduction and overall (the reactions as text), table (E°cell from the table). */
  solve(d0) {
    if (galvanicCell.check(d0).length) return null;
    const d = gcNorm(d0), cell = gcCell(d.left, d.right), r = gcReactions(d.left, d.right), anode = d[cell.anode], cathode = d[cell.cathode];
    return { voltage: gcVoltage(d), table: cell.voltage, anode, cathode, anodeSide: cell.anode, flow: cell.anode === 'left' ? 'right' : 'left',
      anodePotential: GC_INFO[anode].potential, cathodePotential: GC_INFO[cathode].potential, electrons: r.electrons, oxidation: r.oxidation, reduction: r.reduction, overall: r.overall };
  },
  draw(d0, o) {
    const d = gcNorm(d0), P = palette(o), W = chemWords(o.lang), lang = o.lang, cell = gcCell(d.left, d.right), meter = d.meter || 'digital', v = gcVoltage(d);
    const noRead = o.hide === true || hides(o, 'reading'), noSides = o.hide === true || hides(o, 'electrodes'), labels = d.labels !== false;
    const T = d.heading ? 30 : 0, kids = [], ink = P.ink, red = o.print ? '#000000' : '#C62828', blue = o.print ? '#000000' : '#1F5FBF';
    const box = meter === 'digital' ? { x: GC_MID - 70, y: 24, w: 140, h: 72 } : meter === 'dial' ? { x: GC_MID - 75, y: 12, w: 150, h: 98 } : { x: GC_MID - 40, y: GC_WIRE, w: 80, h: 0 };
    // the solutions, the salt bridge, the beakers
    for (const side of ['left', 'right']) {
      const b = GC_SIDES[side], info = GC_INFO[d[side]];
      kids.push(node('rect', { x: b.x, y: GC_BK.liquid, width: GC_BK.width, height: GC_BK.bottom - GC_BK.liquid, fill: o.print ? '#EEEEEE' : info.solution, class: 'of-solution' }),
        line(b.x, GC_BK.liquid, b.x + GC_BK.width, GC_BK.liquid, o.print ? '#666666' : '#7AA7CF', 1.5));
    }
    const L = GC_SIDES.left.leg, R = GC_SIDES.right.leg, bridge = `M ${L} 290 V 165 Q ${L} 145 ${L + 20} 145 H ${R - 20} Q ${R} 145 ${R} 165 V 290`;
    kids.push(node('g', { class: 'of-bridge' }, node('path', { d: bridge, fill: 'none', stroke: o.print ? '#333333' : '#444444', 'stroke-width': 22 }), node('path', { d: bridge, fill: 'none', stroke: o.print ? '#FFFFFF' : '#FBF8EF', 'stroke-width': 17 }),
      line(L - 11, 290, L + 11, 290, '#444444', 2.5), line(R - 11, 290, R + 11, 290, '#444444', 2.5)));
    for (const side of ['left', 'right']) {
      const b = GC_SIDES[side];
      kids.push(node('path', { d: `M ${b.x - 6} ${GC_BK.top} L ${b.x} ${GC_BK.top + 6} V ${GC_BK.bottom} H ${b.x + GC_BK.width} V ${GC_BK.top + 6} L ${b.x + GC_BK.width + 6} ${GC_BK.top}`, fill: 'none', stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round', class: 'of-beaker' }));
    }
    // the strips and the wires up to the meter
    for (const side of ['left', 'right']) {
      const b = GC_SIDES[side], end = side === 'left' ? box.x : box.x + box.w;
      kids.push(node('rect', { x: b.strip - GC_STRIP.width / 2, y: GC_STRIP.top, width: GC_STRIP.width, height: GC_STRIP.bottom - GC_STRIP.top, fill: o.print ? (side === 'left' ? '#BBBBBB' : '#888888') : GC_INFO[d[side]].color, stroke: ink, 'stroke-width': 1.5, class: `of-electrode of-${side}` }),
        node('polyline', { points: `${b.strip},${GC_STRIP.top} ${b.strip},${GC_WIRE} ${end},${GC_WIRE}`, fill: 'none', stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
        node('circle', { cx: b.strip, cy: GC_STRIP.top, r: 3.5, fill: ink }));
    }
    // the meter
    if (meter === 'coil') {
      const loops = 5, r = 11, turns = loops + 0.5, pitch = (80 - 2 * r) / turns, x0 = GC_MID - 40, steps = Math.round(turns * 48), pts = [];
      for (let i = 0; i <= steps; i++) { const t = (i / steps) * turns * 2 * Math.PI; pts.push(`${r2(x0 + r - r * Math.cos(t) + (pitch * t) / (2 * Math.PI))},${r2(GC_WIRE - 1.4 * r * Math.sin(t))}`); }
      kids.push(node('polyline', { points: pts.join(' '), fill: 'none', stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round', class: 'of-coil' }));
    } else {
      kids.push(node('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 8, fill: o.print ? '#FFFFFF' : '#F3F4F6', stroke: ink, 'stroke-width': 2, class: 'of-meter' }));
      if (meter === 'digital') {
        kids.push(node('rect', { x: GC_MID - 46, y: 32, width: 92, height: 42, rx: 3, fill: o.print ? '#FFFFFF' : '#DFE8D6', stroke: ink, 'stroke-width': 1.2 }),
          label(GC_MID, 54, noRead ? '_.__' : v.toFixed(2), { anchor: 'middle', size: 26, weight: 700, colour: o.print ? '#000000' : '#1D2A1D', cls: noRead ? 'of-blank' : 'of-reading' }),
          label(GC_MID, 88, 'V', { anchor: 'middle', size: 13, colour: ink }));
      } else {
        const C = { x: GC_MID, y: 96, r: 62, max: 4 }, ang = x => ((150 - (x / C.max) * 120) * Math.PI) / 180, on = (x, r) => ({ x: C.x + r * Math.cos(ang(x)), y: C.y - r * Math.sin(ang(x)) });
        const a = on(0, C.r), b = on(C.max, C.r);
        kids.push(node('path', { d: `M ${r2(a.x)} ${r2(a.y)} A ${C.r} ${C.r} 0 0 1 ${r2(b.x)} ${r2(b.y)}`, fill: 'none', stroke: ink, 'stroke-width': 1.5 }));
        for (let i = 0; i <= C.max * 5; i++) {
          const x = i / 5, major = i % 5 === 0, p = on(x, C.r), q = on(x, C.r - (major ? 10 : 5));
          kids.push(line(r2(p.x), r2(p.y), r2(q.x), r2(q.y), ink, major ? 1.6 : 1));
          if (major) { const n = on(x, C.r - 21); kids.push(label(r2(n.x), r2(n.y), fmt(x, 0, lang), { anchor: 'middle', size: 13, weight: 600, colour: ink })); }
        }
        kids.push(label(box.x + 14, box.y + 18, 'V', { anchor: 'middle', size: 14, colour: ink }));
        if (!noRead) { const n = on(Math.max(0, Math.min(v, C.max)), C.r - 4); kids.push(line(C.x, C.y, r2(n.x), r2(n.y), red, 2, { class: 'of-needle' })); }
        kids.push(node('circle', { cx: C.x, cy: C.y, r: 4, fill: ink }));
      }
      for (const side of ['left', 'right']) {
        const x = side === 'left' ? box.x : box.x + box.w;
        kids.push(node('circle', { cx: x, cy: GC_WIRE, r: 5, fill: '#FFFFFF', stroke: ink, 'stroke-width': 2 }));
        if (!noSides) kids.push(label(side === 'left' ? box.x + 12 : box.x + box.w - 12, box.y + box.h - 10, side === cell.cathode ? '+' : '−', { anchor: 'middle', size: 17, colour: side === cell.cathode ? red : ink, cls: 'of-sign' }));
      }
    }
    // the electrons' way along the wire, anode to cathode
    if (d.flow && !noSides) {
      const toRight = cell.anode === 'left';
      for (const side of ['left', 'right']) {
        const [a, b] = side === 'left' ? [GC_SIDES.left.strip + 25, box.x - 15] : [box.x + box.w + 15, GC_SIDES.right.strip - 25], [from, to] = toRight ? [a, b] : [b, a];
        kids.push(node('g', { class: 'of-flow' }, arrow(from, 42, to, 42, { colour: blue, width: 2, head: 10 }), label((from + to) / 2, 30, 'e⁻', { anchor: 'middle', size: 15, colour: blue })));
      }
    }
    if (labels) {
      for (const side of ['left', 'right']) {
        const b = GC_SIDES[side];
        kids.push(label(side === 'left' ? b.strip - GC_STRIP.width / 2 - 8 : b.strip + GC_STRIP.width / 2 + 8, 150, d[side], { anchor: side === 'left' ? 'end' : 'start', size: 18, colour: ink, cls: 'of-metal' }),
          label(b.x + GC_BK.width / 2, d.potentials ? 324 : 342, `${GC_INFO[d[side]].ion}(aq)`, { anchor: 'middle', size: 16, weight: 600, colour: ink, cls: 'of-ion' }));
      }
      kids.push(label(GC_MID, 178, W('saltBridge'), { anchor: 'middle', size: 15, weight: 600, colour: ink, cls: 'of-bridge-name' }));
    }
    // each ion's standard reduction potential, under its solution
    if (d.potentials) for (const side of ['left', 'right']) {
      if ((d.potentials === 'cathode' && side !== cell.cathode) || (d.potentials === 'anode' && side !== cell.anode)) continue;
      const b = GC_SIDES[side], e = GC_INFO[d[side]].potential, t = `E° = ${e < 0 ? '−' : '+'}${fmt(Math.abs(e), 2, lang)}${Math.abs(e * 10) % 1 === 0 && Math.abs(e) % 1 !== 0 ? '0' : ''} V`;
      kids.push(label(b.x + GC_BK.width / 2, 346, t, { anchor: 'middle', size: 14, weight: 600, colour: ink, cls: 'of-potential' }));
    }
    if (d.electrodes && !noSides) for (const side of ['left', 'right']) {
      const b = GC_SIDES[side];
      kids.push(label(b.x + GC_BK.width / 2, 384, side === cell.anode ? `${W('anode')} (−)` : `${W('cathode')} (+)`, { anchor: 'middle', size: 17, colour: ink, cls: 'of-pole' }));
    }
    const H = d.electrodes && !noSides ? 398 : 372;
    const all = T ? [label(GC_MID, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: ink }), node('g', { transform: `translate(0 ${T})` }, kids)] : kids;
    return frame(GC_W, H + T, all, { ...o, kind: 'galvanicCell' }, o.title || `${W('galvanicCell')}: ${d.left} | ${d.right}`);
  },
};
