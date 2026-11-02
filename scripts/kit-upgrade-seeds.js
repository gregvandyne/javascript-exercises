// Move the official games (seed-games/*.html) to the kit's patch release: every game on a version listed in
// server/services/kit.js KIT_PATCHES gets the patch version's core and pack tags (with their hashes). Games on other
// versions are listed and left alone. Saved member games need nothing: the frame upgrades them when served.
//   node scripts/kit-upgrade-seeds.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgradeKitPins, kitVersion } from '../server/services/kit.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../seed-games');
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.html')).sort()) {
  const file = path.join(DIR, f), html = fs.readFileSync(file, 'utf8'), v = kitVersion(html);
  if (!v) continue;
  const next = upgradeKitPins(html);
  if (next !== html) { fs.writeFileSync(file, next); console.log(`${f}: ${v} -> ${kitVersion(next)}`); } else console.log(`${f}: stays on ${v}`);
}
