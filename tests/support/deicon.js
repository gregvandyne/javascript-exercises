// Pages draw their icons as <svg class="fx fx-oo"> (Oomba, below 40 px) or <img class="fx"> (Fluent) from the one icon map
// (public/js/icons.js). Tests written against the
// emoji the page used to print read the page through this: each icon becomes the emoji it stands for again, so a test
// still checks which icon sits where, byte for byte. (A few emoji share a picture; the usual one is given back.)
import { FLUENT, TOOL_ICONS } from '../../public/js/icons.js';
const PREFER = { 'house-with-garden': '👪', person: '👤', 'check-mark': '✓', pencil: '✏️', multiply: '✖️', 'check-box-with-check': '☑️' };
const back = {};
for (const [e, [name]] of Object.entries(FLUENT)) if (!(name in back)) back[name] = PREFER[name] || e;
export const ICON_IMG = /<img class="fx [^"]*" src="\/icons\/(fluent\/(?:3d|flat)|tools)\/([a-z0-9-]+?)(?:-64\.webp|\.svg)"[^>]*>/g;
/** An Oomba icon: <svg class="fx fx-oo" data-fx="<the Fluent picture it stands for>" ...><use .../></svg> (a browser's
 *  innerHTML writes the <use> out as <use ...></use>). */
export const ICON_SVG = /<svg class="fx fx-oo[^"]*" data-fx="([a-z0-9-]+)"[^>]*><use [^>]*?(?:\/>|><\/use>)<\/svg>/g;
export const deicon = s => String(s).replace(ICON_IMG, (m, dir, name) => dir === 'tools' ? (TOOL_ICONS.includes(name) ? `[${name}]` : m) : (back[name] || m))
  .replace(ICON_SVG, (m, name) => back[name] || m);
