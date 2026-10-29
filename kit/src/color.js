// Colour maths in sRGB, linear RGB, OKLab and OKLCH. Pure functions, no DOM.
// The palette ramps, the sky gradients, the LUT grade and the "hex -> nearest hue" rule all go through here.

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!/^[0-9a-f]{6}/i.test(h) || !isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hx = v => { const s = Math.round(Math.max(0, Math.min(255, v))).toString(16); return s.length < 2 ? '0' + s : s; };
export const rgbToHex = (r, g, b) => ('#' + hx(r) + hx(g) + hx(b)).toUpperCase();
export const toLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const fromLinear = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);

export function rgbToOklab(r, g, b) {
  r = toLinear(r); g = toLinear(g); b = toLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function oklabToRgb(L, a, b) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
export const hexToOklab = hex => rgbToOklab(...hexToRgb(hex));
export const oklabToHex = (L, a, b) => rgbToHex(...oklabToRgb(L, a, b));
export function hexToOklch(hex) { const [L, a, b] = hexToOklab(hex); return [L, Math.hypot(a, b), Math.atan2(b, a)]; }
export const oklchToHex = (L, C, h) => oklabToHex(L, C * Math.cos(h), C * Math.sin(h));

/** Mix two hex colours in OKLab (t = 0 -> a, 1 -> b). */
export function mixHex(a, b, t) {
  const A = hexToOklab(a), B = hexToOklab(b);
  return oklabToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** Lighten/darken by an OKLCH lightness delta, and scale chroma (night: +0.05 L on objects, -20% chroma on big areas). */
export function adjustHex(hex, dL = 0, chroma = 1) {
  const [L, C, h] = hexToOklch(hex);
  return oklchToHex(Math.max(0, Math.min(1, L + dL)), C * chroma, h);
}
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** WCAG relative luminance and contrast ratio. */
export function luminance(hex) { const [r, g, b] = hexToRgb(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** '#RRGGBB' + alpha -> 'rgba(...)' for canvas styles. */
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
/** 0..1 floats for shader uniforms. */
export function hexToVec(hex) { const [r, g, b] = hexToRgb(hex); return [r / 255, g / 255, b / 255]; }
