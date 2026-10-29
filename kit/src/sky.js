// The time-of-day model shared by both backends: sky gradient stops (mixed in OKLab), sun/moon path, star and
// firefly amounts, ambient light and the colour grade. timeOfDay: 0 = noon, ~.45 = golden hour, ~.7 = dusk, 1 = night.
import { hexToOklab, oklabToHex } from './color.js';
import { PALETTE, NIGHT_SKY } from './tokens.js';

// [tod, top, bottom, ambient rgb]
export const SKY_KEYS = [
  [0.0, PALETTE.sky[1], '#E4F5EC', [1, 1, 1]],
  [0.22, '#86C4EE', '#FFF1D2', [1, 0.98, 0.93]],   // late afternoon: keeps the day-to-gold blend from greying out
  [0.42, '#F6B27F', '#FFE9A6', [1.0, 0.93, 0.82]],
  [0.68, '#7A55C9', '#FF9C8F', [0.66, 0.6, 0.78]],
  [1.0, NIGHT_SKY[0], NIGHT_SKY[1], [0.5, 0.57, 0.76]],
];
const LAB = SKY_KEYS.map(k => [k[0], hexToOklab(k[1]), hexToOklab(k[2]), k[3]]);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** sky(tod) -> { top:[L,a,b], bottom:[L,a,b], topHex, bottomHex, ambient:[r,g,b], sun:{x,y,a}, moon:{x,y,a}, stars, fireflies, night } */
export function sky(tod, out = {}) {
  tod = Math.max(0, Math.min(1, +tod || 0));
  let i = 0; while (i < LAB.length - 2 && tod > LAB[i + 1][0]) i++;
  const A = LAB[i], B = LAB[i + 1];
  const t = smooth(0, 1, (tod - A[0]) / (B[0] - A[0]));
  const top = out.top || (out.top = [0, 0, 0]), bottom = out.bottom || (out.bottom = [0, 0, 0]), amb = out.ambient || (out.ambient = [0, 0, 0]);
  for (let k = 0; k < 3; k++) { top[k] = lerp(A[1][k], B[1][k], t); bottom[k] = lerp(A[2][k], B[2][k], t); amb[k] = lerp(A[3][k], B[3][k], t); }
  // The sun sets along an arc to the right; the moon rises from the left after dusk. Positions in 0..1 of the view.
  const sun = out.sun || (out.sun = {}), moon = out.moon || (out.moon = {});
  sun.x = 0.72 + tod * 0.12; sun.y = 0.16 + smooth(0.1, 0.8, tod) * 0.72; sun.a = 1 - smooth(0.62, 0.8, tod);
  moon.x = 0.24; moon.y = 0.62 - smooth(0.6, 1, tod) * 0.46; moon.a = smooth(0.62, 0.95, tod);
  out.stars = smooth(0.7, 1, tod); out.fireflies = smooth(0.72, 1, tod); out.night = tod; out.lanterns = smooth(0.55, 0.85, tod);
  return out;
}
export const skyHex = lab => oklabToHex(lab[0], lab[1], lab[2]);
/** Gradient colour at height v (0 = top, 1 = bottom), as hex (Paper bakes rows with this; Glaze does the same in GLSL). */
export function skyAt(s, v) {
  const t = Math.pow(Math.max(0, Math.min(1, v)), 1.15);
  return oklabToHex(lerp(s.top[0], s.bottom[0], t), lerp(s.top[1], s.bottom[1], t), lerp(s.top[2], s.bottom[2], t));
}
