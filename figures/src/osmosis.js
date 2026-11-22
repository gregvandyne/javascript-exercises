// Oomba Figures: osmosis and tonicity (1.3.0, the biology pack). A red blood cell or a plant cell in a solution, a
// beaker split by a membrane, a U-tube, or a dialysis bag in a beaker. Tonicity is never given: it is worked out from
// the solutes that cannot cross (ported/osmosis.js), and so are the water's net movement, each crossing solute's
// movement and the result (crenated, swollen or burst; plasmolyzed, flaccid or turgid; a level rising; a bag swelling).
// The particles are to scale: each side holds as many dots per area as its concentration, the same scale everywhere,
// each solute its own shape (circle, square, triangle) so print needs no color. The result is drawn from the numbers: a
// level rises and a bag swells as far as the two sides differ. The checks, the answers (OF.solve) and the drawing are
// Oomba's own.
import { node, label, line, path, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { OS_SCENES, osIsCell, osTwoSided, osOsmotic, osTonicity, osOpposite, osWater, osSoluteFlow, osOutcome, osDifference } from './ported/osmosis.js';

const OS_KEYS = ['kind', 'hide', 'scene', 'solutes', 'unit', 'view', 'particles', 'arrows', 'labels', 'burst', 'seed', 'heading'];
const PW = 240, PH = 210;
/** A small seeded generator (an LCG): the same data scatters the same dots. */
const rng = seed => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const solutesOf = d => d.solutes || [{ name: '', inside: 1, outside: 2, cross: false }];
const amountText = (v, unit, lang) => (unit === '%' ? `${fmt(v, 3, lang)}%` : `${fmt(v, 3, lang)} ${unit}`);
/** The panel's regions for a scene in a state ("start" or the result), as inside tests and areas. */
function regions(scene, result, strength, outcome) {
  const cx = PW / 2, cy = 112;
  if (scene === 'blood') {
    const f = !result ? 1 : outcome === 'crenated' ? 0.72 : outcome === 'swollen' ? 1.18 : outcome === 'burst' ? 1.25 : 1, rx = 62 * f, ry = (outcome === 'swollen' && result ? 54 : 42) * f;
    return { cell: { cx, cy, rx, ry }, inA: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.8, inB: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1.25 && x > 10 && x < PW - 10 && y > 34 && y < PH - 10, areaA: Math.PI * rx * ry * 0.8, areaB: (PW - 20) * (PH - 44) - Math.PI * rx * ry * 1.25 };
  }
  if (scene === 'plant') {
    const s = !result ? 0.88 : outcome === 'plasmolyzed' ? 0.62 : outcome === 'turgid' ? 0.97 : 0.88, w = 150, h = 120, iw = w * s, ih = h * s;
    return { wall: { x: cx - w / 2, y: cy - h / 2, w, h }, cell: { x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih }, inA: (x, y) => Math.abs(x - cx) < iw / 2 - 6 && Math.abs(y - cy) < ih / 2 - 6, inB: (x, y) => (Math.abs(x - cx) > w / 2 + 6 || Math.abs(y - cy) > h / 2 + 6) && x > 10 && x < PW - 10 && y > 34 && y < PH - 10, areaA: (iw - 12) * (ih - 12), areaB: (PW - 20) * (PH - 44) - (w + 12) * (h + 12) };
  }
  if (scene === 'bag') {
    const f = !result ? 1 : outcome === 'swells' ? 1 + 0.35 * strength : outcome === 'shrinks' ? 1 - 0.35 * strength : 1, rx = 52 * f, ry = 44 * f, top = 64, by = cy + 18;
    return { bag: { cx, cy: by, rx, ry }, level: top, inA: (x, y) => ((x - cx) / rx) ** 2 + ((y - by) / ry) ** 2 < 0.78, inB: (x, y) => ((x - cx) / rx) ** 2 + ((y - by) / ry) ** 2 > 1.3 && x > 28 && x < PW - 28 && y > top + 6 && y < PH - 14, areaA: Math.PI * rx * ry * 0.78, areaB: (PW - 56) * (PH - top - 20) - Math.PI * rx * ry * 1.3 };
  }
  // two sides: a split beaker or a U-tube; the side that gains water rises (to scale with how far the sides differ)
  const rise = !result ? 0 : outcome === 'risesA' ? 1 : outcome === 'risesB' ? -1 : 0, dh = 34 * strength * rise, base = 80;
  return { levelA: base - dh, levelB: base + dh, inA: (x, y) => x > 30 && x < cx - 8 && y > base - dh + 6 && y < PH - 16, inB: (x, y) => x > cx + 8 && x < PW - 30 && y > base + dh + 6 && y < PH - 16, areaA: (cx - 38) * (PH - 22 - base + dh), areaB: (cx - 38) * (PH - 22 - base - dh) };
}
const MARKS = ['circle', 'square', 'triangle'];
function mark(shape, x, y, c) {
  if (shape === 'circle') return node('circle', { cx: r2(x), cy: r2(y), r: 3.6, fill: c });
  if (shape === 'square') return node('rect', { x: r2(x - 3.4), y: r2(y - 3.4), width: 6.8, height: 6.8, fill: c });
  return node('polygon', { points: `${r2(x)},${r2(y - 4.4)} ${r2(x + 4.2)},${r2(y + 3.2)} ${r2(x - 4.2)},${r2(y + 3.2)}`, fill: c });
}
/** Dots for a concentration in a region: area x concentration x one scale for the whole figure. */
function scatter(n, inside, rand) {
  const pts = [];
  for (let t = 0; pts.length < n && t < n * 80; t++) { const x = 8 + rand() * (PW - 16), y = 30 + rand() * (PH - 36); if (inside(x, y) && pts.every(p => Math.hypot(p[0] - x, p[1] - y) > 9)) pts.push([x, y]); }
  return pts;
}
function panel(d, o, W, P, S, state, at) {
  const result = state === 'result', scene = d.scene || 'blood', unit = d.unit || '%', sol = solutesOf(d), R = regions(scene, result, S.strength, S.outcome), kids = [], ink = P.ink, rand = rng((d.seed || 7) * 31 + (result ? 17 : 3));
  const water = P.liquid, soft = o.print ? '#FFFFFF' : '#E7F3FA';
  kids.push(node('rect', { x: 0, y: 0, width: PW, height: PH, fill: 'none' }));
  if (scene === 'blood' || scene === 'plant') kids.push(node('rect', { x: 8, y: 30, width: PW - 16, height: PH - 36, rx: 8, fill: soft, stroke: P.gridStrong, 'stroke-width': 1.2 }));
  if (scene === 'blood') {
    const c = R.cell, burst = result && S.outcome === 'burst';
    if (S.outcome === 'crenated' && result) { const pts = []; for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2, f = k % 2 ? 1.12 : 0.94; pts.push(`${r2(c.cx + c.rx * f * Math.cos(a))},${r2(c.cy + c.ry * f * Math.sin(a))}`); } kids.push(node('polygon', { points: pts.join(' '), fill: o.print ? '#EEEEEE' : '#F3C9C4', stroke: ink, 'stroke-width': 2, class: 'of-cell' })); }
    else kids.push(node('ellipse', { cx: c.cx, cy: c.cy, rx: r2(c.rx), ry: r2(c.ry), fill: o.print ? '#EEEEEE' : '#F3C9C4', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': burst ? '14 9' : null, class: 'of-cell' }));
    if (!result || S.outcome === 'normal') kids.push(node('ellipse', { cx: c.cx, cy: c.cy, rx: r2(c.rx * 0.45), ry: r2(c.ry * 0.4), fill: 'none', stroke: P.muted, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
  } else if (scene === 'plant') {
    kids.push(node('rect', { x: R.wall.x, y: R.wall.y, width: R.wall.w, height: R.wall.h, rx: 6, fill: o.print ? '#FFFFFF' : '#F4F8EC', stroke: ink, 'stroke-width': 4, class: 'of-wall' }));
    kids.push(node('rect', { x: r2(R.cell.x), y: r2(R.cell.y), width: r2(R.cell.w), height: r2(R.cell.h), rx: 14, fill: o.print ? '#EEEEEE' : '#D8EDC6', stroke: P.green, 'stroke-width': 2, class: 'of-cell' }));
  } else if (scene === 'bag') {
    kids.push(path(`M 24 40 L 28 ${PH - 10} L ${PW - 28} ${PH - 10} L ${PW - 24} 40`, { stroke: ink, 'stroke-width': 2.4 }));
    kids.push(node('rect', { x: 28, y: R.level, width: PW - 56, height: PH - 10 - R.level, fill: soft }), line(28, R.level, PW - 28, R.level, P.blue, 1.6));
    kids.push(line(PW / 2, 40, PW / 2, R.bag.cy - R.bag.ry, ink, 1.6), node('ellipse', { cx: R.bag.cx, cy: r2(R.bag.cy), rx: r2(R.bag.rx), ry: r2(R.bag.ry), fill: o.print ? '#F4F4F4' : '#F1E6CF', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '7 4', class: 'of-bag' }));
  } else {
    const cx = PW / 2;
    if (scene === 'utube') kids.push(path(`M 30 40 L 30 ${PH - 40} Q 30 ${PH - 10} 60 ${PH - 10} L ${PW - 60} ${PH - 10} Q ${PW - 30} ${PH - 10} ${PW - 30} ${PH - 40} L ${PW - 30} 40`, { stroke: ink, 'stroke-width': 2.4 }));
    else kids.push(path(`M 26 40 L 30 ${PH - 12} L ${PW - 30} ${PH - 12} L ${PW - 26} 40`, { stroke: ink, 'stroke-width': 2.4 }));
    kids.push(node('rect', { x: 31, y: r2(R.levelA), width: cx - 32, height: r2(PH - 13 - R.levelA), fill: soft }), node('rect', { x: cx + 1, y: r2(R.levelB), width: cx - 32, height: r2(PH - 13 - R.levelB), fill: soft }));
    kids.push(line(31, r2(R.levelA), cx, r2(R.levelA), P.blue, 1.6), line(cx, r2(R.levelB), PW - 31, r2(R.levelB), P.blue, 1.6), line(cx, 50, cx, PH - 12, ink, 2.2, { 'stroke-dasharray': '6 4', class: 'of-membrane' }));
    kids.push(label(cx - 52, 52, 'A', { anchor: 'middle', size: 14, weight: 800, colour: ink }), label(cx + 52, 52, 'B', { anchor: 'middle', size: 14, weight: 800, colour: ink }));
  }
  // the particles, to scale: dots per area = concentration on every side
  if (d.particles !== false) {
    const top = Math.max(...sol.flatMap(s => [s.inside, s.outside]), 1e-9), k = 0.0014 / top;
    sol.forEach((s, i) => {
      let cin = s.inside, cout = s.outside;
      if (result && s.cross) { const even = (cin * R.areaA + cout * R.areaB) / (R.areaA + R.areaB); cin = even; cout = even; }
      for (const [x, y] of scatter(Math.round(cin * k * R.areaA), R.inA, rand)) kids.push(mark(MARKS[i], x, y, [P.red, P.purple, P.gold][i]));
      for (const [x, y] of scatter(Math.round(cout * k * R.areaB), R.inB, rand)) kids.push(mark(MARKS[i], x, y, [P.red, P.purple, P.gold][i]));
    });
  }
  // the water's net movement (start), or what happened (result)
  const hideArrows = o.hide === true || hides(o, 'arrows'), two = osTwoSided(scene);
  if (!result && d.arrows !== false) {
    const ay = two ? 140 : 112, flow = S.water, cx = PW / 2, inX = two ? cx - 34 : scene === 'plant' ? cx - 38 : cx - 26, outX = two ? cx + 34 : scene === 'plant' ? PW - 14 : PW - 16;
    if (hideArrows) kids.push(node('rect', { x: inX - 6, y: ay - 16, width: outX - inX + 12, height: 32, rx: 6, fill: 'none', stroke: ink, 'stroke-width': 1.4, 'stroke-dasharray': '5 4', class: 'of-blank' }));
    else if (flow === 'none') kids.push(arrow(outX - 4, ay, inX + 4, ay, { colour: P.blue, width: 3 }), arrow(inX + 4, ay + 10, outX - 4, ay + 10, { colour: P.blue, width: 3 }));
    else kids.push(flow === 'in' ? arrow(outX, ay, inX, ay, { colour: P.blue, width: 4, cls: 'of-water' }) : arrow(inX, ay, outX, ay, { colour: P.blue, width: 4, cls: 'of-water' }));
    if (!hideArrows) kids.push(label((inX + outX) / 2, ay - 14, W('water'), { anchor: 'middle', size: 12, colour: P.blue, halo: P.paper }));
  }
  // the words under it: each side's tonicity, then (result) the outcome
  const hideT = o.hide === true || hides(o, 'tonicity'), say = t => W(t), y0 = PH + 18;
  const out = [];
  if (d.labels !== false) {
    if (two) out.push(`A: ${say(osOpposite(S.tonicity))}`, `B: ${say(S.tonicity)}`);
    else out.push(`${W('solution')}: ${say(S.tonicity)}`);
  }
  if (result) out.push(W(S.outcome));
  out.forEach((t, i) => {
    const blank = hideT && (i < out.length - (result ? 1 : 0) || o.hide === true);
    if (blank) { kids.push(label(12, y0 + 18 * i, t.split(':')[0] + (t.includes(':') ? ':' : ''), { size: 12, weight: 700, colour: ink }), line(t.includes(':') ? 90 : 12, y0 + 18 * i + 6, PW - 12, y0 + 18 * i + 6, ink, 1.1, { class: 'of-blank' })); }
    else kids.push(label(PW / 2, y0 + 18 * i, t, { anchor: 'middle', size: 13, weight: i === out.length - 1 && result ? 800 : 600, colour: ink, cls: 'of-words' }));
  });
  // the concentrations, inside and outside
  const conc = side => sol.map(s => `${amountText(s[side], unit, o.lang)}${text(s.name, 20) ? ` ${text(s.name, 20)}` : ''}`).join(', ');
  kids.push(label(PW / 2, 8, `${two ? 'A' : W('inside')}: ${conc('inside')}`, { anchor: 'middle', size: 10, weight: 600, colour: P.ink2, cls: 'of-conc' }), label(PW / 2, 20, `${two ? 'B' : W('outside')}: ${conc('outside')}`, { anchor: 'middle', size: 10, weight: 600, colour: P.ink2, cls: 'of-conc' }));
  return node('g', { transform: `translate(${at} 0)` }, kids);
}
/**
 * { scene: "blood" | "plant" | "beaker" | "utube" | "bag", solutes: 1 to 3 of { name, inside, outside (side A and B in a
 * beaker or U-tube), cross: true (it passes the membrane) }, unit: "%" | "M" | "mM", view: "start" | "result" | "both",
 * particles (true: dots to scale), arrows (true: the water's movement), labels (true: the tonicity), burst (a red blood
 * cell in a hypotonic solution bursts), seed, heading }. hide: "tonicity" (blank lines), "arrows" (a dashed box to draw
 * in), "result" (the result panel left empty, to draw), true.
 */
export const osmosis = {
  check(d) {
    const k = Object.keys(d).find(x => !OS_KEYS.includes(x)); if (k) return [`an osmosis figure does not take "${k}"`];
    const out = [], scene = d.scene || 'blood';
    if (!OS_SCENES.includes(scene)) return [`"scene" must be one of ${OS_SCENES.join(', ')}`];
    const S = solutesOf(d);
    if (!Array.isArray(S) || !S.length || S.length > 3) return ['"solutes" lists 1 to 3 solutes: { name, inside, outside, cross }'];
    S.forEach((s, i) => {
      const at = `solute ${i + 1}`;
      if (!s || typeof s !== 'object') { out.push(`${at} must be { name, inside, outside, cross }`); return; }
      const bad = Object.keys(s).find(x => !['name', 'inside', 'outside', 'cross'].includes(x)); if (bad) { out.push(`${at} does not take "${bad}"`); return; }
      if (!isNum(s.inside, 0, 1000) || !isNum(s.outside, 0, 1000)) out.push(`${at}: "inside" and "outside" are concentrations from 0 to 1000`);
      if (s.name !== undefined && !text(s.name, 20)) out.push(`${at}: "name" must be short`);
      if (s.cross !== undefined && typeof s.cross !== 'boolean') out.push(`${at}: "cross" must be true or false`);
    });
    if (!out.length && S.every(s => s.inside === 0 && s.outside === 0)) out.push('every concentration is 0: there is nothing on either side');
    if (d.unit !== undefined && !['%', 'M', 'mM'].includes(d.unit)) out.push('"unit" must be "%", "M" or "mM"');
    if (d.view !== undefined && !['start', 'result', 'both'].includes(d.view)) out.push('"view" must be "start", "result" or "both"');
    for (const b of ['particles', 'arrows', 'labels', 'burst']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
    if (d.burst && scene !== 'blood') out.push('"burst" is for a red blood cell (a plant cell\'s wall stops it)');
    if (d.seed !== undefined && !(Number.isInteger(d.seed) && d.seed >= 0)) out.push('"seed" must be a whole number');
    if (!out.length && d.particles !== false) {
      const top = Math.max(...S.flatMap(s => [s.inside, s.outside])), low = S.flatMap(s => [s.inside, s.outside]).filter(v => v > 0);
      if (low.some(v => v / top < 0.02)) out.push('a concentration under 2% of the highest would draw no dots: to scale, use "particles": false');
    }
    return out;
  },
  /** The tonicity of the outside (side B) against the inside (side A), the water's net movement (waterIndex: 0 in, 1 out,
   *  2 none), the result, the osmotic totals and how strongly they differ, and each solute's movement. */
  solve(d) {
    if (osmosis.check(d).length) return null;
    const S = solutesOf(d), inside = osOsmotic(S.map(s => ({ cross: false, ...s })), 'inside'), outside = osOsmotic(S.map(s => ({ cross: false, ...s })), 'outside'), t = osTonicity(inside, outside), water = osWater(t);
    return { tonicity: t, sideA: osOpposite(t), water, waterIndex: ['in', 'out', 'none'].indexOf(water), outcome: osOutcome(d.scene || 'blood', t, !!d.burst), inside, outside, difference: osDifference(inside, outside), solutes: S.map(s => ({ name: text(s.name, 20), flow: osSoluteFlow({ cross: false, ...s }) })) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), S = osmosis.solve(d), view = d.view || 'start', both = view === 'both', kids = [];
    const S2 = { ...S, strength: S.difference };
    kids.push(panel(d, o, W, P, S2, view === 'result' ? 'result' : 'start', 0));
    if (both) {
      kids.push(arrow(PW + 6, PH / 2 + 10, PW + 40, PH / 2 + 10, { colour: P.ink, width: 3 }));
      if (hides(o, 'result') || o.hide === true) kids.push(node('rect', { x: PW + 48, y: 30, width: PW - 16, height: PH - 36, rx: 8, fill: 'none', stroke: P.ink, 'stroke-width': 1.4, 'stroke-dasharray': '6 5', class: 'of-blank' }));
      else kids.push(panel(d, o, W, P, S2, 'result', PW + 46));
    }
    // the key: each solute's mark and name, and which cross the membrane
    const sol = solutesOf(d), ky = PH + 18 + 18 * ((d.labels !== false ? (osTwoSided(d.scene) ? 2 : 1) : 0) + (view !== 'start' ? 1 : 0)) + 6;
    if (d.particles !== false) sol.forEach((s, i) => {
      kids.push(mark(MARKS[i], 16, ky + 18 * i, [P.red, P.purple, P.gold][i]), label(28, ky + 18 * i, `${text(s.name, 20) || W('solute')}${s.cross ? ` (${W('crosses')})` : ` (${W('doesNotCross')})`}`, { size: 12, colour: P.ink, cls: 'of-key' }));
    });
    const w = both ? 2 * PW + 46 : PW, h = ky + (d.particles !== false ? 18 * sol.length : 0) + 4;
    if (d.heading) kids.unshift(label(w / 2, -12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(w, h + (d.heading ? 26 : 0), d.heading ? [node('g', { transform: 'translate(0 26)' }, kids)] : kids, { ...o, kind: 'osmosis' }, o.title || W('osmosis'));
  },
};
export const OSMOSIS_KINDS = { osmosis };
