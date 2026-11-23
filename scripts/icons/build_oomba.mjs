// Build the Oomba icons (ours): public/icons/oomba/<concept>.svg from scripts/icons/oomba-art.mjs, and the map the
// icon helper reads (public/js/icons-oomba.js: Fluent file name -> concept, and a version for the browser cache).
// Usage: node scripts/icons/build_oomba.mjs     docs/decisions.md "Icons: Oomba geometric for controls, Fluent 3D for big spots"
// Each file is one <symbol id="i"> (the pages draw it with <svg><use href="/icons/oomba/<concept>.svg#i">, so the ink
// follows the text color) and a <use> of it, so the file also shows on its own.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ART, CONCEPT } from './oomba-art.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'public', 'icons', 'oomba');
const round = s => s.replace(/(\d+\.\d\d)\d+/g, '$1').replace(/(\.\d)0\b/g, '$1');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.svg') && !ART[f.slice(0, -4)]) fs.rmSync(path.join(OUT, f));
const hash = crypto.createHash('sha256');
for (const [k, draw] of Object.entries(ART).sort()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><symbol id="i" viewBox="0 0 24 24">${round(draw())}</symbol><use href="#i"/></svg>\n`;
  fs.writeFileSync(path.join(OUT, `${k}.svg`), svg); hash.update(k).update(svg);
}
const missing = [...new Set(Object.values(CONCEPT))].filter(c => !ART[c]);
if (missing.length) throw new Error(`no drawing for ${missing.join(', ')}`);
const map = Object.fromEntries(Object.entries(CONCEPT).sort());
const js = `// Built by scripts/icons/build_oomba.mjs (do not edit): Fluent file name -> the Oomba icon drawn for it
// (public/icons/oomba/<concept>.svg), and a version for the browser cache. public/js/icons.js uses it.
export const OOMBA_V = '${hash.digest('hex').slice(0, 10)}';
export const OOMBA = ${JSON.stringify(map, null, 0).replace(/","/g, '", "')};
`;
fs.writeFileSync(path.join(ROOT, 'public', 'js', 'icons-oomba.js'), js);
// The Fluent Flat SVG of a name drawn here is never served any more (below 40 px the Oomba icon, at 40 px and up the 3D
// picture or the Oomba icon): drop it, so public/icons stays in its budget. (scripts/icons/build_fluent.py would write it
// again; run this after it.)
let dropped = 0;
for (const name of Object.keys(map)) { const f = path.join(ROOT, 'public', 'icons', 'fluent', 'flat', `${name}.svg`); if (fs.existsSync(f)) { fs.rmSync(f); dropped++; } }
if (dropped) console.log(`dropped ${dropped} Fluent Flat files now drawn as Oomba icons`);
console.log(`${Object.keys(ART).length} icons, ${Object.keys(map).length} Fluent names drawn`);
