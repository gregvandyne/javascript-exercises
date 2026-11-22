// Oomba Figures: how a number on an axis is written. A decimal, a stacked fraction, a multiple of π, or degrees; a number
// with no neat fraction falls back to a decimal.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module for Oomba Figures; the
// numbering is chosen from the figure's data (an explicit "numbering", or the form its values are given in), not from
// typed text; numbers are written in the reader's language (decimal mark and digits, through svg.js fmt) with a true
// minus sign; names changed so they share one scope with the rest of the bundle.
import { fmt } from '../svg.js';

/** How numbers are written: decimals, fractions, multiples of π, or degrees (90°). */
export const NUMBERINGS = ['decimal', 'fraction', 'pi', 'degree'];
const NUM_MAX_DEN = 100;

/** A number, free of float noise, in the reader's language, with a true minus sign. */
export function numFmt(v, lang = 'en') {
  const n = Number(v.toFixed(10));
  return fmt(Object.is(n, -0) ? 0 : n, 10, lang).replace(/-/g, '−');
}
/** v as p/q in lowest terms with a small q, or null. */
function numRatio(v) {
  for (let q = 1; q <= NUM_MAX_DEN; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p / q - v) < 1e-9) return { p, q };
  }
  return null;
}
/** A tick number ready to draw: { text } on one line, or a stacked fraction { sign, num, den } (sign '' or '−'). */
export function numberLabel(v, numbering, lang = 'en') {
  if (numbering === 'degree') return { text: `${numFmt(v, lang)}°` };
  if (numbering === 'fraction') {
    const r = numRatio(v);
    if (r && r.q !== 1) return { sign: r.p < 0 ? '−' : '', num: String(Math.abs(r.p)), den: String(r.q) };
  } else if (numbering === 'pi') {
    const r = numRatio(v / Math.PI);
    if (r) {
      if (r.p === 0) return { text: '0' };
      const sign = r.p < 0 ? '−' : '', num = `${Math.abs(r.p) === 1 ? '' : Math.abs(r.p)}π`;
      return r.q === 1 ? { text: sign + num } : { sign, num, den: String(r.q) };
    }
  }
  return { text: numFmt(v, lang) };
}
/**
 * A label for a number that may not fit the numbering, like an endpoint at 3π/2 on a line in decimals: the numbering's
 * own form if it is short, else π, then a fraction, then a decimal rounded to hundredths.
 */
export function niceLabel(v, numbering, lang = 'en') {
  if (numbering === 'degree') return { text: `${numFmt(Math.round(v * 100) / 100, lang)}°` };
  const short = l => !l.text || !/[.,]\d{4}/.test(l.text);
  for (const n of [numbering, 'pi', 'fraction']) {
    const l = numberLabel(v, n, lang);
    if (short(l) && (n === numbering || l.den || l.text.includes('π'))) return l;
  }
  return { text: numFmt(Math.round(v * 100) / 100, lang) };
}
/** The same label on one line, for titles and worked answers: "−3/2", "3π/4". */
export const numOneLine = l => (l.text !== undefined ? l.text : `${l.sign}${l.num}/${l.den}`);
/** niceLabel on one line. */
export const niceText = (v, numbering, lang) => numOneLine(niceLabel(v, numbering, lang));
