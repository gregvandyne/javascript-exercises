// Oomba Figures: a wave's axes and its parts. The wave starts on its rest line at 0 and rises, y = A sin(2πx / λ): its
// crests at λ/4, 5λ/4... and its troughs half way between. An axis from 0 counted by a nice step that makes the
// wavelength (or period) a whole number of blocks, so the crests land on gridlines; a displacement axis that makes the
// amplitude a whole number of blocks; and a longitudinal wave's lines, evenly spaced and then moved so they bunch at
// the crests' places (compressions) and spread at the troughs' (rarefactions), the way a sound wave lines up with its
// pressure graph. Pure numbers in, pure numbers out: figures/src/waves.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the axes fit in blocks only (Oomba's own axes draw them), the typed
// ranges, the chart title, the label sizes and the mark placement around labels are left out.

const WV_NICE = [1, 2, 2.5, 5];
const wvWhole = v => Math.abs(v - Math.round(v)) < 1e-9;
function wvSteps(v) {
  const out = [], e0 = Math.floor(Math.log10(v));
  for (let e = e0 - 2; e <= e0 + 2; e++) for (const m of WV_NICE) out.push({ step: Number((m * 10 ** e).toPrecision(12)), m });
  return out;
}
/** An axis from 0 to `end` by a nice step making about 16 blocks, `repeat` a whole number of blocks: { step, blocks }. */
export function wvFitX(end, repeat) {
  let best = { step: 1, blocks: Math.ceil(end), score: Infinity };
  for (const { step, m } of wvSteps(end / 16)) {
    const exact = end / step, blocks = Math.ceil(exact - 1e-9);
    if (blocks < 6 || blocks > 32 || repeat / step < 2) continue;
    const score = 0.3 * Math.abs(blocks - 16) + (wvWhole(repeat / step) ? 0 : 10) + (wvWhole(repeat / step / 4) ? 0 : 1) + (wvWhole(exact) ? 0 : 3) + (m === 2.5 ? 1 : 0);
    if (score < best.score) best = { step, blocks, score };
  }
  return { step: best.step, blocks: best.blocks };
}
/** A displacement axis centered on 0, by a nice step making the amplitude about 3 or 4 whole blocks, with `room`
 *  blocks to spare beyond the crests and troughs: { step, half } (the axis runs from −half to half blocks). */
export function wvFitY(amplitude, room = 1) {
  let best = { step: amplitude / 3, score: Infinity };
  for (const { step, m } of wvSteps(amplitude / 3.5)) {
    const a = amplitude / step;
    if (a < 1.5 || a > 6) continue;
    const score = 0.5 * Math.abs(a - 3.5) + (wvWhole(a) ? 0 : 4) + (m === 2.5 ? 1 : 0);
    if (score < best.score) best = { step, score };
  }
  return { step: best.step, half: Math.ceil(amplitude / best.step + room - 1e-9) };
}
/** The x of every crest and trough from 0 to `end`. */
export function wvPeaks(repeat, end) {
  const at = off => { const out = []; for (let x = off * repeat; x <= end + 1e-9; x += repeat) out.push(x); return out; };
  return { crests: at(0.25), troughs: at(0.75) };
}
/** How bunched a compression is: its lines are this much closer than average. */
export const WV_BUNCHING = 0.65;
/** A longitudinal wave's lines along x: `perRepeat` a wavelength, bunched at the crests' places. */
export function wvLineXs(repeat, end, perRepeat) {
  const gap = repeat / perRepeat, out = [];
  for (let i = -perRepeat; i * gap <= end + repeat + 1e-9; i++) {
    const u = i * gap, x = u - ((WV_BUNCHING * repeat) / (2 * Math.PI)) * Math.sin((2 * Math.PI * (u - repeat / 4)) / repeat);
    if (x >= -1e-9 && x <= end + 1e-9) out.push(x);
  }
  return out;
}
