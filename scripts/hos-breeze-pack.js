// Hero of Sunvale's breeze models -> its two data packs (docs/decisions.md "Game data packs"): the compact .json files
// written by tools/blender/storybook.py become public/vendor/data/hero-of-sunvale/<version>/breeze-<pack>.js, scripts
// that add their assets to window.__hosBreeze. The game loads each with integrity (the frame has no network: no fetch,
// so no .glb at run time):
//   start  the hero, Granny, the villagers, the cottage, tree, barrel, fence and the Blobble: loaded before play
//   world  everything else (the other foes, the bosses, buildings, props): loaded in the background once play starts;
//          until an asset arrives the game's procedural version stands in
// Caps: start under 500 KB raw; both under 2 MB raw and 800 KB brotli (the script refuses to write past them).
//   node scripts/hos-breeze-pack.js DIR       (DIR: storybook.py's --out)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/hos-breeze-pack.js DIR'); process.exit(1); }
export const START = ['hero', 'granny', 'villager', 'cottage', 'tree', 'barrel', 'fence'];
const START_MESHES = { foes: /^blobble_/ };   // the parts of a shared asset that go in start (the rest go in world)
export const CAPS = { start: 500e3, total: 2e6, brotli: 800e3 };
const packs = { start: {}, world: {} };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const n = f.replace(/\.json$/, ''), d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (n === 'hero') delete d.clips;   // the game poses the hero itself (every move it has); the clips stay in hero.glb
  if (START.includes(n)) { packs.start[n] = d; continue; }
  const re = START_MESHES[n];
  if (re) {
    const pick = keep => Object.fromEntries(Object.entries(d.meshes).filter(([k]) => re.test(k) === keep));
    packs.start[n] = { ...d, meshes: pick(true) }; packs.world[n] = { ...d, meshes: pick(false) };
  } else packs.world[n] = d;
}
const out = {}; let raw = 0, br = 0;
for (const [name, assets] of Object.entries(packs)) {
  const body = `/* Hero of Sunvale: the breeze style's storybook models, ${name} pack (tools/blender/storybook.py, scripts/hos-breeze-pack.js). */\n`
    + `(function (a) { var o = window.__hosBreeze = window.__hosBreeze || {}; for (var k in a) { if (o[k]) { for (var m in a[k].meshes) o[k].meshes[m] = a[k].meshes[m]; } else o[k] = a[k]; } window.__hosBreezeLoaded = (window.__hosBreezeLoaded || []).concat(['${name}']); })(${JSON.stringify(assets)});\n`;
  const b = zlib.brotliCompressSync(Buffer.from(body), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  out[name] = { body, bytes: body.length, brotli: b, sri: 'sha384-' + crypto.createHash('sha384').update(body).digest('base64') };
  raw += body.length; br += b;
}
const over = [out.start.bytes > CAPS.start && `start ${out.start.bytes} B > ${CAPS.start}`, raw > CAPS.total && `total ${raw} B > ${CAPS.total}`, br > CAPS.brotli && `brotli ${br} B > ${CAPS.brotli}`].filter(Boolean);
if (over.length) { console.error('over the cap: ' + over.join(', ')); process.exit(2); }
const hash = crypto.createHash('sha256').update(out.start.body + out.world.body).digest('hex').slice(0, 8);
const rel = `public/vendor/data/hero-of-sunvale/1.0.0-${hash}`;
fs.mkdirSync(path.join(ROOT, rel), { recursive: true });
const res = {};
for (const [name, o] of Object.entries(out)) {
  fs.writeFileSync(path.join(ROOT, rel, `breeze-${name}.js`), o.body);
  res[name] = { src: `/${rel.replace(/^public\//, '')}/breeze-${name}.js`, integrity: o.sri, bytes: o.bytes, brotli: o.brotli };
}
console.log(JSON.stringify({ ...res, total: raw, totalBrotli: br }));
