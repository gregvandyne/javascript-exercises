// Oomba Figures: what a paper chromatogram is made of and where its lanes go. Inks are spotted on a pencil origin line;
// each separates into colored spots carried some distance up the paper by the solvent, never past the solvent front. A
// spot's Rf is how far it traveled over how far the solvent traveled. The ink colors are saturated enough to tell apart
// on a printout, and an ink before it separates is its dyes mixed as paints mix (each channel multiplied). The lanes
// are laid out across the paper so no two sample names touch, with one column per moved spot for its measurement arrow.
// Pure numbers in, pure numbers out: figures/src/chromatography.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the lane layout takes the names' widths from the caller (Oomba's own
// estimate of a label's width) instead of measuring them, and returns the lanes only (the beaker, rod, part labels and
// captions are placed by Oomba's drawing); the page address format, the typed-front helper, the next sample's letter
// and the answer key's words are left out.

export const CG_COLORS = ['black', 'blue', 'red', 'yellow', 'green', 'purple', 'orange', 'pink', 'brown'];
/** Each ink color's fill. */
export const CG_HEX = { black: '#2b2b2b', blue: '#2f6fd6', red: '#e0393e', yellow: '#f2c224', green: '#2fa84f', purple: '#8a4fc4', orange: '#f08a24', pink: '#ec6fae', brown: '#8b5a2b' };
export const CG_MAX_SAMPLES = 6;
export const CG_MAX_SPOTS = 5;
export const CG_MIN_FRONT = 4;
export const CG_MAX_FRONT = 15;
/** A distance rounded to the 0.1 cm a student reads with a ruler. */
export const cgRound = cm => Math.round(cm * 10) / 10;
/** A spot's Rf: how far it traveled over how far the solvent traveled. */
export const cgRf = (distance, front) => (front > 0 ? distance / front : 0);
/** The color of an ink before it separates: its dyes mixed as paints mix. */
export function cgMixed(colors) {
  if (!colors.length) return CG_HEX.black;
  const rgb = [1, 1, 1];
  for (const c of new Set(colors)) { const hex = CG_HEX[c]; for (let i = 0; i < 3; i++) rgb[i] *= parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; }
  return '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}
/** A darker edge for a spot, so it keeps its outline in grayscale. */
export const cgEdge = hex => '#' + [0, 1, 2].map(i => Math.round(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) * 0.62).toString(16).padStart(2, '0')).join('');

/** Pixels per centimeter of paper, and the paper's other measures. */
export const CG_PX = 26;
export const CG_ORIGIN_CM = 1.5;  // the origin line above the paper's bottom edge
export const CG_TOP_CM = 1.2;     // paper left above the solvent front
export const CG_WATER_CM = 0.6;   // how far the paper dips into the solvent: always below the origin line
const CG_LANE = 52, CG_SPOT_X = 20, CG_COLUMN = 45, CG_FRONT_MARGIN = 64, CG_MARGIN = 18, CG_NAME_GAP = 8, CG_NAME_EDGE = 8;

/** Spread words wanted at ys so no two are closer than gap, keeping their order, centered on what they name. */
export function cgSpread(ys, gap) {
  const out = [...ys];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  const pushed = out.length ? out[out.length - 1] - ys[ys.length - 1] : 0;
  if (pushed > 0) {
    const lift = pushed / 2;
    for (let i = 0; i < out.length; i++) out[i] -= lift;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  return out;
}

/**
 * The paper and its lanes: samples [{ name, spots: [{ color, distance }] }], front (cm), measure (arrows), widthOf(name)
 * a name's width. -> { paperW, paperH, originY, frontY, lanes: [{ name, x, spots: [{ color, distance, y, arrowX }] }] },
 * y from the paper's top. With measurements, each spot that moved has a column of its own right of the spots, nearest
 * first; a lane moves along if its name would run into the one before it or off the paper.
 */
export function cgLayout(samples, front, measure, widthOf) {
  const paperH = (CG_ORIGIN_CM + front + CG_TOP_CM) * CG_PX, originY = paperH - CG_ORIGIN_CM * CG_PX, frontY = originY - front * CG_PX;
  let x = measure ? CG_FRONT_MARGIN : CG_MARGIN, lastName;
  const lanes = samples.map(sample => {
    const moved = [...sample.spots.keys()].filter(j => sample.spots[j].distance > 0).sort((a, b) => sample.spots[a].distance - sample.spots[b].distance);
    const half = widthOf(sample.name) / 2, offset = measure ? CG_SPOT_X : Math.max(CG_LANE, 2 * half + CG_NAME_GAP) / 2;
    const need = lastName ? lastName.x + lastName.half + CG_NAME_GAP + half : CG_NAME_EDGE + half;
    x += Math.max(0, need - (x + offset));
    const width = measure ? Math.max(CG_LANE, CG_SPOT_X + 14 + moved.length * CG_COLUMN) : 2 * offset, spotX = x + offset;
    lastName = { x: spotX, half };
    const lane = { name: sample.name, x: spotX, spots: sample.spots.map((p, j) => ({ color: p.color, distance: p.distance, y: originY - p.distance * CG_PX, arrowX: measure && moved.includes(j) ? spotX + 20 + moved.indexOf(j) * CG_COLUMN : null })) };
    x += width;
    return lane;
  });
  const paperW = Math.max(x + CG_MARGIN, lastName ? lastName.x + lastName.half + CG_NAME_EDGE : 0, 96);
  return { paperW, paperH, originY, frontY, lanes };
}
