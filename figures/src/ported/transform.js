// Oomba Figures: transformations on a coordinate grid, in the axes' own numbers: where a translation, a reflection, a
// rotation by quarter turns or a dilation sends a point, the images a composition makes (each made from the one before),
// how a line of reflection and a step are written, and a vertex name with primes (A, A′, A″). Pure numbers: the grid
// (figures/src/graphs.js) draws the pre-image and its images from these, so an image is always the true image.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a step is read from Oomba's structured data ({ translate }, { reflect },
// { rotate, about }, { dilate, about }) and a rotation is signed degrees (counterclockwise positive) rather than degrees
// and a direction; the grid-widening, lattice and pointer helpers of the original's editor are left out.

const tfClean = v => { const n = Number(v.toFixed(9)); return Object.is(n, -0) ? 0 : n; };
const tfPoint = (x, y) => [tfClean(x), tfClean(y)];

/** A reflection line: { kind: 'vertical', c } (x = c), { kind: 'horizontal', c } (y = c), or { kind: 'diagonal', slope: ±1, b } (y = ±x + b). */
function tfReflect(line, [x, y]) {
  if (line.kind === 'vertical') return tfPoint(2 * line.c - x, y);
  if (line.kind === 'horizontal') return tfPoint(x, 2 * line.c - y);
  return line.slope === 1 ? tfPoint(y - line.b, x + line.b) : tfPoint(line.b - y, line.b - x);
}
function tfRotate(deg, [cx, cy], [x, y]) {
  const quarters = ((Math.round(deg / 90) % 4) + 4) % 4;
  let dx = x - cx, dy = y - cy;
  for (let k = 0; k < quarters; k++) [dx, dy] = [-dy, dx];
  return tfPoint(cx + dx, cy + dy);
}
/** Where one step sends a point: { kind: 'translate', dx, dy } | { kind: 'reflect', line } | { kind: 'rotate', deg, about } | { kind: 'dilate', k, about }. */
export function tfApply(step, p) {
  if (step.kind === 'translate') return tfPoint(p[0] + step.dx, p[1] + step.dy);
  if (step.kind === 'reflect') return tfReflect(step.line, p);
  if (step.kind === 'rotate') return tfRotate(step.deg, step.about, p);
  return tfPoint(step.about[0] + step.k * (p[0] - step.about[0]), step.about[1] + step.k * (p[1] - step.about[1]));
}
/** The images a composition makes of the pre-image, one per step, each made from the one before. */
export function tfImages(pre, steps) {
  const out = [];
  let last = pre;
  for (const s of steps) { last = last.map(p => tfApply(s, p)); out.push(last); }
  return out;
}
/** A vertex name with n more primes: A -> A′ -> A″. */
export function tfPrimed(name, n) {
  const PR = ['', '′', '″', '‴'];
  const m = /^(.*?)((?:′|″|‴|')*)$/.exec(String(name));
  const had = [...m[2]].reduce((t, ch) => t + (ch === '″' ? 2 : ch === '‴' ? 3 : 1), 0), total = had + n;
  return m[1] + (PR[total] ?? '′'.repeat(total));
}
const tfNum = v => String(tfClean(v)).replace('-', '−');
/** A line of reflection the way a textbook writes it: "the x-axis", "x = −2", "y = −x + 2". */
export function tfLineName(line) {
  if (line.kind === 'vertical') return line.c === 0 ? 'the y-axis' : `x = ${tfNum(line.c)}`;
  if (line.kind === 'horizontal') return line.c === 0 ? 'the x-axis' : `y = ${tfNum(line.c)}`;
  const x = line.slope === 1 ? 'x' : '−x';
  return line.b === 0 ? `y = ${x}` : `y = ${x} ${line.b > 0 ? '+' : '−'} ${tfNum(Math.abs(line.b))}`;
}
/** A step in words: "Rotate 90° counterclockwise about the origin". */
export function tfDescribe(s) {
  const about = p => (p[0] === 0 && p[1] === 0 ? 'the origin' : `(${tfNum(p[0])}, ${tfNum(p[1])})`);
  if (s.kind === 'translate') return `Translate ⟨${tfNum(s.dx)}, ${tfNum(s.dy)}⟩`;
  if (s.kind === 'reflect') return `Reflect over ${tfLineName(s.line)}`;
  if (s.kind === 'rotate') return `Rotate ${Math.abs(s.deg)}°${Math.abs(s.deg) === 180 ? '' : s.deg > 0 ? ' counterclockwise' : ' clockwise'} about ${about(s.about)}`;
  return `Dilate by ${tfNum(s.k)} from ${about(s.about)}`;
}
