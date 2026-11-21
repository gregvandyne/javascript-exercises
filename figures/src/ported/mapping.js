// Oomba Figures: how a mapping diagram is laid out. The inputs down the left and the outputs down the right, each side's
// items spread evenly (a shorter list more widely, to a point, so it fills its side like the longer one), both sides in
// an oval (or a box, or nothing) big enough for the wider side's items (an oval narrows toward its top and bottom, so it
// is as wide as each item needs at that item's height), the side titles above them, and an arrow from each input to
// each output it maps to, stopping short of both items. Pure numbers in, pure numbers out: figures/src/mapping.js reads
// the data, checks it and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the items arrive already laid out as math boxes by Oomba's own
// typesetter (mathtext.js) from structured labels, not typed or pasted text split into a list; the arrows arrive as
// pairs of item positions; a title's width comes from the caller; the write-on blank lines for titles are left out (a
// figure leaves a title out instead); the label-size setting is left out (a scale factor instead).

const MP_PAD = 16;
const MP_GAP = 150;        // between the two sides, for the arrows
const MP_ARROW_GAP = 7;    // from an item to the end of its arrow
const MP_MIN_ROWS = 2;     // the least room a side has, so one item does not sit in a circle
const MP_ROUND = 12;       // a box's corner radius

/**
 * spec: { sides: [[box, ...], [box, ...]] (each item's math box, inputs then outputs), arrows: [[from, to]] (positions),
 * shape: 'oval' | 'box' | 'none', titles: [width or 0, width or 0] (the side titles' widths), titleSize, heading (its
 * width or 0), headingSize, size (the items' font size) } -> { width, height, sides: [{ cx, cy, rx, ry, round }], items:
 * [[{ x, y, box, mid }]], arrows: [{ x1, y1, x2, y2 }], titleY, headingY, centers }
 */
export function layoutMapping(spec) {
  const FS = spec.size, ROW = FS * 1.9, sides = spec.sides;
  const rows = Math.max(sides[0].length, sides[1].length, MP_MIN_ROWS);
  const offsets = sides.map(boxes => {
    const step = boxes.length ? Math.min((rows * ROW) / boxes.length, ROW * 1.6) : 0;
    return boxes.map((_, i) => (i - (boxes.length - 1) / 2) * step);
  });
  const widest = Math.max(0, ...sides.flat().map(b => b.w));
  let half;
  if (spec.shape === 'oval') {
    const h = (rows * ROW) / 2 + ROW * 0.7;
    const fit = sides.flatMap((boxes, k) => boxes.map((b, i) => (b.w / 2 + FS * 0.7) / Math.sqrt(1 - (offsets[k][i] / h) ** 2)));
    half = { w: Math.max(ROW * 1.3, ...fit), h };
  } else if (spec.shape === 'box') half = { w: Math.max(ROW * 1.1, widest / 2 + FS), h: (rows * ROW) / 2 + ROW * 0.4 };
  else half = { w: Math.max(ROW * 0.5, widest / 2), h: (rows * ROW) / 2 };
  // across: each side as wide as its shape or its title, whichever is wider, and the titles never run into each other
  const tw = spec.titles, reach = tw.map(w => Math.max(half.w, w / 2));
  const between = Math.max(2 * half.w + MP_GAP, (tw[0] + tw[1]) / 2 + 24);
  const diagramW = reach[0] + between + reach[1], width = Math.max(diagramW, spec.heading || 0) + 2 * MP_PAD;
  const left = MP_PAD + (width - 2 * MP_PAD - diagramW) / 2 + reach[0], centers = [left, left + between];
  // down: the heading, the side titles, then the two sides
  let y = MP_PAD;
  const headingY = y + spec.headingSize;
  if (spec.heading) y += spec.headingSize * 1.3 + 12;
  const titleY = y + spec.titleSize;
  if (tw[0] || tw[1]) y += spec.titleSize * 1.3 + 10;
  const cy = y + half.h, height = cy + half.h + MP_PAD;
  const items = sides.map((boxes, k) => boxes.map((box, i) => ({ x: centers[k] - box.w / 2, y: cy + offsets[k][i] + (box.asc - box.desc) / 2, box, mid: cy + offsets[k][i] })));
  return {
    width, height, centers, titleY, headingY,
    sides: centers.map(cx => ({ cx, cy, rx: half.w, ry: half.h, round: MP_ROUND })),
    items,
    arrows: spec.arrows.map(([from, to]) => { const a = items[0][from], b = items[1][to]; return { x1: a.x + a.box.w + MP_ARROW_GAP, y1: a.mid, x2: b.x - MP_ARROW_GAP, y2: b.mid, from, to }; }),
  };
}
