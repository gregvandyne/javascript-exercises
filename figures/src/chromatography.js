// Oomba Figures: a paper chromatogram (1.6.0, the chemistry pack). Inks spotted on a pencil origin line, each separated
// into colored spots the solvent has carried up the paper to the dashed solvent front; the paper alone, or hung from a
// glass rod in a beaker of solvent that stays below the origin line; after the solvent has run, or before and after side
// by side; with each moved spot's distance from the origin line and the solvent front's marked in cm. The ink colors,
// the Rf sum and the lane layout are ported (ported/chromatography.js); the checks, the answers (OF.solve: every
// spot's Rf, and which inks a mixture contains) and the drawing are Oomba's own. In print a spot keeps its color with a
// darker edge, so a grayscale copy still shows each spot, and dyes are matched by how far they traveled.
import { node, label, line, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { chemWords } from './chemwords.js';
import { CG_COLORS, CG_HEX, CG_MAX_SAMPLES, CG_MAX_SPOTS, CG_MIN_FRONT, CG_MAX_FRONT, CG_PX, CG_WATER_CM, cgRound, cgRf, cgMixed, cgEdge, cgSpread, cgLayout } from './ported/chromatography.js';

const CG_KEYS = ['kind', 'hide', 'samples', 'front', 'show', 'setup', 'measure', 'labels', 'solvent', 'heading'];
const cgW = (s, size = 13) => String(s).length * size * 0.6;
/** A distance as a student writes it from a ruler: always to 0.1 cm (6.0 cm). */
const cgCm = (v, lang) => { const s = fmt(v, 1, lang), mark = fmt(1.5, 1, lang).replace(/\d/g, ''); return s.includes(mark) ? s : `${s}${mark}0`; };
const cgFront = d => cgRound(d.front ?? 8);
/** The samples as drawn: each name ("Sample 2" when it has none) and its spots, no farther than the front. */
const cgSamples = (d, W) => d.samples.map((s, i) => ({ name: text(s.name, 12) || `${W('sample')} ${i + 1}`, spots: s.spots.map(p => ({ color: p.color, distance: cgRound(p.distance) })) }));

/**
 * { samples: [{ name: "A", spots: [{ color: "blue", distance: 5.6 }, ...] }, ...] (1 to 6 inks of 1 to 5 dyes; colors
 * black, blue, red, yellow, green, purple, orange, pink, brown; distances in cm from the origin line, 0 for a dye that
 * does not dissolve, never past the front), front: 8 (cm above the origin line, 4 to 15), show: "after" | "both",
 * setup: true (the beaker of solvent and glass rod), measure: false (arrows with each distance in cm), labels: false
 * (the parts named), solvent: "Water", heading }. hide: "values" (the measured distances left for the student), true.
 */
export const chromatography = {
  check(d) {
    const odd = Object.keys(d).filter(k => !CG_KEYS.includes(k));
    if (odd.length) return [`a chromatogram does not take "${odd[0]}"`];
    if (d.front !== undefined && !isNum(d.front, CG_MIN_FRONT, CG_MAX_FRONT)) return [`"front" is how far the solvent front is above the origin line: ${CG_MIN_FRONT} to ${CG_MAX_FRONT} cm`];
    if (!Array.isArray(d.samples) || d.samples.length < 1 || d.samples.length > CG_MAX_SAMPLES) return [`"samples" lists 1 to ${CG_MAX_SAMPLES} inks { name, spots }`];
    const front = cgFront(d), out = [];
    for (const [i, s] of d.samples.entries()) {
      if (!s || typeof s !== 'object' || !Array.isArray(s.spots) || s.spots.length < 1 || s.spots.length > CG_MAX_SPOTS) return [`ink ${i + 1}: "spots" lists 1 to ${CG_MAX_SPOTS} dyes { color, distance }`];
      if (Object.keys(s).some(k => !['name', 'spots'].includes(k))) return [`ink ${i + 1} takes "name" and "spots" only`];
      if (s.name !== undefined && (typeof s.name !== 'string' || s.name.length > 12)) return [`ink ${i + 1}: "name" is up to 12 characters`];
      for (const [j, p] of s.spots.entries()) {
        if (!p || !CG_COLORS.includes(p.color)) return [`ink ${i + 1}, dye ${j + 1}: "color" is one of ${CG_COLORS.join(', ')}`];
        if (!isNum(p.distance, 0, CG_MAX_FRONT)) return [`ink ${i + 1}, dye ${j + 1}: "distance" is in cm from the origin line, 0 or more`];
        if (cgRound(p.distance) > front) return [`ink ${i + 1}, dye ${j + 1} is ${fmt(p.distance, 1)} cm up, past the solvent front at ${fmt(front, 1)} cm: no dye travels farther than the solvent carrying it`];
      }
      const cols = s.spots.map(p => p.color);
      if (new Set(cols).size !== cols.length) return [`ink ${i + 1} has two ${cols.find((c, k) => cols.indexOf(c) !== k)} dyes: give each dye its own color`];
      const ds = s.spots.map(p => cgRound(p.distance)).sort((a, b) => a - b);
      if (ds.some((v, k) => k && v - ds[k - 1] < 0.6)) return [`ink ${i + 1}: two dyes are less than 0.6 cm apart, so their spots would run into each other`];
    }
    const names = d.samples.map(s => text(s.name, 12)).filter(Boolean);
    if (new Set(names).size !== names.length) out.push('two inks have the same name');
    if (d.show !== undefined && !['after', 'both'].includes(d.show)) out.push('"show" must be "after" or "both"');
    for (const k of ['setup', 'measure', 'labels']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.solvent !== undefined && !text(d.solvent, 24)) out.push('"solvent" is a short name, up to 24 characters');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    return out;
  },
  /** front; each ink's spots as rf.<ink>.<color> and distance.<ink>.<color>; contains.<ink>: 1 when every dye of that
   *  ink is in the first ink (the same color, as far up), else 0; absent: the other inks the first one does not
   *  contain, by name, joined with ", "; spots (how many in all). */
  solve(d) {
    if (chromatography.check(d).length) return null;
    const front = cgFront(d), S = cgSamples(d, chemWords('en')), rf = {}, distance = {}, contains = {};
    for (const s of S) { rf[s.name] = {}; distance[s.name] = {}; for (const p of s.spots) { rf[s.name][p.color] = Number(cgRf(p.distance, front).toPrecision(12)); distance[s.name][p.color] = p.distance; } }
    const first = S[0], has = p => first.spots.some(q => q.color === p.color && Math.abs(q.distance - p.distance) < 0.05);
    for (const s of S.slice(1)) contains[s.name] = s.spots.every(has) ? 1 : 0;
    return { front, rf, distance, contains, absent: S.slice(1).filter(s => !contains[s.name]).map(s => s.name).join(', '), spots: S.reduce((n, s) => n + s.spots.length, 0) };
  },
  draw(d, o) {
    const P = palette(o), W = chemWords(o.lang), lang = o.lang, front = cgFront(d), S = cgSamples(d, W), measure = d.measure === true, setup = d.setup !== false;
    const blank = o.hide === true || hides(o, 'values'), both = d.show === 'both';
    const L = cgLayout(S, front, measure, n => cgW(n, 13)), kids = [];
    const ROD = 5, OVER = 16, GAP = 24, FLOOR = 12, WALL = 2, PANEL = 56, T = d.heading ? 34 : 14;
    const panelW = setup ? L.paperW + 2 * (GAP + WALL + OVER) : L.paperW;
    const stages = both ? ['before', 'after'] : ['after'];
    const panels = stages.map((stage, i) => {
      const left = 14 + i * (panelW + PANEL);
      if (!setup) return { stage, px: left, py: T, left, right: left + L.paperW };
      const rodY = T + ROD + 1, px = left + OVER + WALL + GAP;
      return { stage, px, py: rodY, rodY, beaker: { l: px - GAP, r: px + L.paperW + GAP, rim: rodY + ROD, bottom: rodY + L.paperH + FLOOR }, waterY: rodY + L.paperH - CG_WATER_CM * CG_PX, left, right: left + panelW };
    });
    const paper = '#FBF8EF', solventFill = o.print ? '#E6E6E6' : '#D9EAF7';
    for (const p of panels) {
      const g = [];
      // the paper, its origin line in pencil and (after) the solvent front, dashed
      g.push(node('rect', { x: p.px, y: p.py, width: r2(L.paperW), height: r2(L.paperH), fill: p.stage === 'after' ? (o.print ? '#F4F4F4' : '#EEF3F8') : paper, stroke: P.ink, 'stroke-width': 1.6, class: 'of-paper' }));
      if (p.beaker) {
        const b = p.beaker;
        g.push(node('rect', { x: b.l, y: r2(p.waterY), width: b.r - b.l, height: r2(b.bottom - p.waterY), fill: solventFill, opacity: 0.75 }));
        g.push(line(b.l, r2(p.waterY), b.r, r2(p.waterY), o.print ? '#555555' : '#7AA7CF', 1.5, { class: 'of-solvent' }));
      }
      g.push(line(p.px + 10, r2(p.py + L.originY), r2(p.px + L.paperW - 10), r2(p.py + L.originY), '#6B6B6B', 1.6, { class: 'of-origin' }));
      if (p.stage === 'after') g.push(line(p.px + 2, r2(p.py + L.frontY), r2(p.px + L.paperW - 2), r2(p.py + L.frontY), P.ink, 1.8, { 'stroke-dasharray': '8 6', class: 'of-front' }));
      // the spots: after, each dye where it traveled; before, each ink one spot of its dyes mixed, on the origin line
      for (const lane of L.lanes) {
        const spots = p.stage === 'after' ? lane.spots.map(s => ({ hex: CG_HEX[s.color], y: s.y, color: s.color })) : [{ hex: cgMixed(lane.spots.map(s => s.color)), y: L.originY, color: 'mix' }];
        for (const s of spots) g.push(node('ellipse', { cx: r2(p.px + lane.x), cy: r2(p.py + s.y), rx: 12, ry: 9, fill: s.hex, stroke: cgEdge(s.hex), 'stroke-width': 1.8, class: `of-spot of-${s.color}` }));
        g.push(label(r2(p.px + lane.x), r2(p.py + L.originY + 16), lane.name, { anchor: 'middle', size: 13, weight: 600, colour: P.ink2, cls: 'of-name' }));
        if (measure && p.stage === 'after') for (const s of lane.spots) {
          if (s.arrowX === null) continue;
          const x = p.px + s.arrowX, y0 = p.py + L.originY, y1 = p.py + s.y;
          g.push(line(r2(x - 5), r2(y1), r2(p.px + lane.x + 13), r2(y1), P.muted, 1, { 'stroke-dasharray': '2 3' }));
          g.push(node('g', { class: 'of-measure' }, arrow(r2(x), r2(y0), r2(x), r2(y1), { colour: P.ink, width: 1.6, head: 7 })));
          g.push(label(r2(x + 4), r2((y0 + y1) / 2), blank ? '____' : `${cgCm(s.distance, lang)} cm`, { size: 11, weight: 700, colour: P.ink, halo: o.print ? '#F4F4F4' : '#EEF3F8', cls: blank ? 'of-blank' : 'of-value' }));
        }
      }
      if (measure && p.stage === 'after') {
        const x = p.px + 18, y0 = p.py + L.originY, y1 = p.py + L.frontY;
        g.push(node('g', { class: 'of-measure' }, arrow(r2(x), r2(y0), r2(x), r2(y1), { colour: P.ink, width: 1.6, head: 7 })));
        g.push(node('g', { transform: `translate(${r2(x + 13)} ${r2((y0 + y1) / 2)}) rotate(-90)` }, label(0, 0, blank ? '______' : `${cgCm(front, lang)} cm`, { anchor: 'middle', size: 11, weight: 700, colour: P.ink, halo: o.print ? '#F4F4F4' : '#EEF3F8', cls: blank ? 'of-blank' : 'of-value' })));
      }
      if (p.beaker) {
        const b = p.beaker;
        g.push(node('path', { d: `M ${b.l - 6} ${b.rim + 6} L ${b.l} ${b.rim + 12} L ${b.l} ${b.bottom} L ${b.r} ${b.bottom} L ${b.r} ${b.rim + 12} L ${b.r + 6} ${b.rim + 6}`, fill: 'none', stroke: P.ink, 'stroke-width': 2.6, 'stroke-linejoin': 'round', class: 'of-beaker' }));
        g.push(node('rect', { x: b.l - WALL - OVER, y: p.rodY - ROD, width: b.r - b.l + 2 * (WALL + OVER), height: 2 * ROD, rx: ROD, fill: o.print ? '#FFFFFF' : '#EEF2F4', stroke: P.ink, 'stroke-width': 2, class: 'of-rod' }));
        g.push(node('rect', { x: r2(p.px + L.paperW / 2 - 8), y: p.rodY - ROD - 3, width: 16, height: 2 * ROD + 8, rx: 3, fill: o.print ? '#BBBBBB' : '#9BA3AB', stroke: P.ink, 'stroke-width': 1.6 }));
      }
      if (both) g.push(label(r2((p.left + p.right) / 2), r2((p.beaker ? p.beaker.bottom + WALL : p.py + L.paperH) + 22), W(p.stage === 'before' ? 'before' : 'after'), { anchor: 'middle', size: 14, colour: P.ink, cls: 'of-caption' }));
      kids.push(node('g', { class: `of-panel of-${p.stage}` }, g));
    }
    // the parts named, to the right of the last panel
    const last = panels[panels.length - 1], edge = last.px + L.paperW;
    let right = last.right, bottom = (last.beaker ? last.beaker.bottom + WALL : last.py + L.paperH) + (both ? 34 : 10);
    if (d.labels) {
      const want = [];
      if (last.beaker) want.push({ t: W('glassRod'), x: last.beaker.r + WALL + OVER / 2, y: last.rodY });
      want.push({ t: W('chromPaper'), x: edge - 6, y: last.py + (L.frontY - 14) / 2 + 6 });
      want.push({ t: W('solventFront'), x: edge - 4, y: last.py + L.frontY });
      want.push({ t: W('originLine'), x: edge - 4, y: last.py + L.originY });
      if (last.beaker) {
        want.push({ t: `${text(d.solvent, 24) || W('pd_water')} (${W('solvent')})`, x: last.beaker.r - 8, y: (last.waterY + last.beaker.bottom) / 2 });
        want.push({ t: W('beaker'), x: last.beaker.r + WALL / 2, y: last.beaker.rim + (last.waterY - last.beaker.rim) * 0.82 });
      }
      want.sort((a, b) => a.y - b.y);
      const ys = cgSpread(want.map(w => w.y), 19), lx = last.right + 28;
      want.forEach((w, i) => {
        kids.push(line(r2(w.x), r2(w.y), r2(lx - 4), r2(ys[i]), P.muted, 1, { class: 'of-leader' }), node('circle', { cx: r2(w.x), cy: r2(w.y), r: 2, fill: P.muted }));
        kids.push(label(r2(lx), r2(ys[i]), w.t, { size: 13, weight: 600, colour: P.ink, cls: 'of-part' }));
        right = Math.max(right, lx + cgW(w.t, 13) + 4); bottom = Math.max(bottom, ys[i] + 12);
      });
    }
    if (d.heading) kids.push(label(r2((14 + right) / 2), 18, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(right + 14, bottom + 8, kids, { ...o, kind: 'chromatography' }, o.title || W('chromatogram'));
  },
};
