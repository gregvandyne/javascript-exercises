// The brand: the name, and the logo board's artwork (geometry copied from it). The two o's are Oomba's eyes, looking up
// at a spark of an idea. Nothing here touches the database, so scripts/icons.js can use it without starting the app.
import { Raw } from './html.js';

/** The product's name. A brand: never translated, always in Latin letters. */
export const BRAND = 'Oomba Academy';
export const SHORT_NAME = 'Oomba';
const INK = '#141414', CREAM = '#FFFDF2', MINT = '#66C792', SPARK = '#FFD23F';

const WORD = '<g fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="100" r="36"/><circle cx="172" cy="100" r="36"/><path d="M248 136 V95 A30 30 0 0 1 308 95 V136 M308 95 A30 30 0 0 1 368 95 V136"/><path d="M408 14 V136"/><circle cx="444" cy="100" r="36"/><circle cx="556" cy="100" r="36"/><path d="M592 64 V136"/></g><g fill="currentColor"><circle cx="67" cy="94" r="12"/><circle cx="179" cy="94" r="12"/></g>';
const WORD_SPARK = 'd="M300 -14 Q304 8 326 12 Q304 16 300 38 Q296 16 274 12 Q296 8 300 -14Z" stroke-width="5" stroke-linejoin="round"';
const EYES = '<circle cx="66" cy="132" r="36"/><circle cx="178" cy="132" r="36"/>';
const PUPILS = '<circle cx="73" cy="126" r="12"/><circle cx="185" cy="126" r="12"/>';
const ICON_SPARK = 'd="M196 22 Q199 41 218 44 Q199 47 196 66 Q193 47 174 44 Q193 41 196 22Z"';

/** The "oomba" wordmark for pages. Letters and pupils are currentColor, so it follows the theme; the spark is Spark yellow
 *  with an Ink outline in light and none in dark (.spark in app.css). Decorative: the link around it carries the name. */
export const wordmark = (cls = 'wordmark') => new Raw(`<svg class="${cls}" viewBox="0 -24 616 184" aria-hidden="true" focusable="false">${WORD}<path class="spark" ${WORD_SPARK}/></svg>`);
/** The mint app icon for pages (colours from the --brand-* tokens, the same in both themes). Decorative. */
export const appMark = (cls = 'appmark') => new Raw(`<svg class="${cls}" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><rect class="am-bg" x="0" y="0" width="240" height="240" rx="56"/><g class="am-eyes" stroke-width="28">${EYES}</g><g class="am-pupils">${PUPILS}</g><path class="am-spark" ${ICON_SPARK} stroke-width="5" stroke-linejoin="round"/></svg>`);

/** Oomba's face alone (eyes and spark, shrunk into the circle) for a round picture: the official account's avatar. */
export const faceMark = (cls = 'appmark') => new Raw(`<svg class="${cls}" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><g transform="translate(120 120) scale(.8) translate(-122 -101)"><g class="am-eyes" stroke-width="28">${EYES}</g><g class="am-pupils">${PUPILS}</g><path class="am-spark" ${ICON_SPARK} stroke-width="5" stroke-linejoin="round"/></g></svg>`);

/** Stand-alone icon files (public/icons, made by scripts/icons.js).
 *  kind: 'favicon' (Spark square, Ink eyes), 'mint' (Mint square, Ink eyes, spark), 'dark' (Ink square, Cream eyes, spark).
 *  square: no rounded corners (the system masks them: apple-touch-icon, maskable). maskable: art shrunk into the safe circle. */
export function iconSvg(kind = 'mint', { square = false, maskable = false, size = null } = {}) {
  const dim = size ? ` width="${size}" height="${size}"` : '';
  const bg = (fill) => `<rect x="0" y="0" width="240" height="240"${square || maskable ? '' : ' rx="56"'} fill="${fill}"/>`;
  if (kind === 'favicon') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"${dim}>${bg(SPARK)}<g fill="none" stroke="${INK}" stroke-width="30"><circle cx="66" cy="120" r="36"/><circle cx="178" cy="120" r="36"/></g><g fill="${INK}"><circle cx="73" cy="114" r="13"/><circle cx="185" cy="114" r="13"/></g></svg>`;
  }
  const [face, eye, edge] = kind === 'dark' ? [INK, CREAM, null] : [MINT, INK, INK];
  const spark = `<path ${ICON_SPARK} fill="${SPARK}"${edge ? ` stroke="${edge}" stroke-width="5" stroke-linejoin="round"` : ''}/>`;
  // The art's farthest point is about 114 units from (122, 101); the maskable safe zone is a circle of radius 96.
  const art = `<g fill="none" stroke="${eye}" stroke-width="28">${EYES}</g><g fill="${eye}">${PUPILS}</g>${spark}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"${dim}>${bg(face)}${maskable ? `<g transform="translate(120 120) scale(.8) translate(-122 -101)">${art}</g>` : art}</svg>`;
}
