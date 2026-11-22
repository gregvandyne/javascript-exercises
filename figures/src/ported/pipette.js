// Oomba Figures: an adjustable micropipette (the common air-displacement kind): the sizes a lab has, what each one's
// volume display means, and which volumes each can be set to. The display is digit wheels read top to bottom: three, or
// four on the P1000. Which places they stand for depends on the model, and the red wheels mark where the decimal point
// goes: a P2 counts 1, 0.1 and 0.01 microliters (the bottom two red: 1-2-5 is 1.25), a P10 or P20 counts 10, 1 and 0.1
// (the bottom one red: 1-2-5 is 12.5), a P100 or P200 counts 100, 10 and 1 (none red: 1-2-5 is 125), and a P1000 counts
// 1000, 100, 10 and 1 (0-7-5-0 is 750). Each is used from a tenth of its largest volume up to it, as lab manuals teach
// (a P20 from 2 to 20). Pure numbers in, pure numbers out: figures/src/pipette.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; reading a typed volume, the random volumes, carrying a volume between
// models, the shaft and tip shapes and the label layout are left out (Oomba checks the data and draws its own pipette).

const PP_R = true, PP_B = false;
/** The models: the largest volume (microliters), what each wheel counts top to bottom, which wheels are red. */
export const PP_MODELS = {
  P2: { max: 2, places: [1, 0.1, 0.01], red: [PP_B, PP_R, PP_R] }, P10: { max: 10, places: [10, 1, 0.1], red: [PP_B, PP_B, PP_R] },
  P20: { max: 20, places: [10, 1, 0.1], red: [PP_B, PP_B, PP_R] }, P100: { max: 100, places: [100, 10, 1], red: [PP_B, PP_B, PP_B] },
  P200: { max: 200, places: [100, 10, 1], red: [PP_B, PP_B, PP_B] }, P1000: { max: 1000, places: [1000, 100, 10, 1], red: [PP_B, PP_B, PP_B, PP_B] },
};
/** The smallest step a volume can take on it: one on the bottom wheel. */
export const ppStep = p => p.places[p.places.length - 1];
export const ppMin = p => p.max / 10;
export const ppDecimals = p => Math.max(0, Math.round(-Math.log10(ppStep(p))));
/** Where the decimal point's line goes: after this many wheels from the top; null with no red wheel. */
export function ppDecimalAfter(p) { for (let i = 0; i < p.red.length - 1; i++) if (p.red[i] !== p.red[i + 1]) return i + 1; return null; }
const ppSteps = (p, v) => Math.round(v / ppStep(p) + 1e-9 * Math.sign(v));
/** The digits the wheels show for a volume, top to bottom. */
export function ppDigits(p, v) { const n = ppSteps(p, v), count = p.places.length; return p.places.map((_, i) => Math.floor(n / 10 ** (count - 1 - i)) % 10); }
export function ppRound(n, decimals) { const f = 10 ** decimals; return Math.round(n * f + 1e-9) / f; }
/** Can it be set to this volume: within its range, on a whole step? */
export const ppCanSet = (p, v) => v >= ppMin(p) - 1e-9 && v <= p.max + 1e-9 && Math.abs(ppSteps(p, v) * ppStep(p) - v) < 1e-9;
/** The nearest volume it can be set to. */
export function ppTidy(p, v) { const t = ppRound(Math.round(v / ppStep(p) + 1e-9) * ppStep(p), ppDecimals(p)); return Math.min(p.max, Math.max(ppMin(p), t)); }
