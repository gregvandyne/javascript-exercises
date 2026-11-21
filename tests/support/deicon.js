// Pages draw their icons as <img class="fx"> from the one icon map (public/js/icons.js). Tests written against the
// emoji the page used to print read the page through this: each icon becomes the emoji it stands for again, so a test
// still checks which icon sits where, byte for byte. (A few emoji share a picture; the usual one is given back.)
import { FLUENT, TOOL_ICONS } from '../../public/js/icons.js';
const PREFER = { 'house-with-garden': '👪', person: '👤', 'check-mark': '✓', pencil: '✏️', multiply: '✖️', 'check-box-with-check': '☑️' };
const back = {};
for (const [e, [name]] of Object.entries(FLUENT)) if (!(name in back)) back[name] = PREFER[name] || e;
export const ICON_IMG = /<img class="fx [^"]*" src="\/icons\/(fluent\/(?:3d|flat)|tools)\/([a-z0-9-]+?)(?:-64\.webp|\.svg)"[^>]*>/g;
export const deicon = s => String(s).replace(ICON_IMG, (m, dir, name) => dir === 'tools' ? (TOOL_ICONS.includes(name) ? `[${name}]` : m) : (back[name] || m));
