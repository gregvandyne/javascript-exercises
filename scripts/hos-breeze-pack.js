// Hero of Sunvale's breeze models -> its data pack (docs/decisions.md "Game data packs"): the compact .json files written
// by tools/blender/storybook.py become public/vendor/data/hero-of-sunvale/<version>/breeze-models.js, a script that sets
// window.__hosBreeze. The game loads it with integrity (the frame has no network: no fetch, so no .glb at run time).
//   node scripts/hos-breeze-pack.js DIR       (DIR: storybook.py's --out)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/hos-breeze-pack.js DIR'); process.exit(1); }
const NAMES = ['hero', 'granny', 'cottage', 'tree', 'barrel', 'fence'];
const out = {};
for (const n of NAMES) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  if (n === 'hero') delete d.clips;   // the game poses the hero itself (every move it has); the clips stay in hero.glb
  out[n] = d;
}
const body = `/* Hero of Sunvale: the breeze style's storybook models (tools/blender/storybook.py, scripts/hos-breeze-pack.js). */\nwindow.__hosBreeze=${JSON.stringify(out)};\n`;
const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
const rel = `public/vendor/data/hero-of-sunvale/1.0.0-${hash}/breeze-models.js`;
fs.mkdirSync(path.join(ROOT, path.dirname(rel)), { recursive: true });
fs.writeFileSync(path.join(ROOT, rel), body);
const sri = 'sha384-' + crypto.createHash('sha384').update(body).digest('base64');
const br = zlib.brotliCompressSync(Buffer.from(body), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
console.log(JSON.stringify({ src: '/' + rel.replace(/^public\//, ''), integrity: sri, bytes: body.length, brotli: br }));
