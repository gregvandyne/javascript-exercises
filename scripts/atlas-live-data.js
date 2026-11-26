// Atlas Quest Live: copies the map, the flags and the country list it needs from Atlas Quest (window.AtlasData in
// seed-games/atlas-quest.html) into seed-games/atlas-quest-live.html, between /* atlas-live:begin */ and
// /* atlas-live:end */, with the language packs' version and checksums. The countries keep Atlas Quest's order: the
// server (server/live/atlas.js codes()) and the game both use it for the answers. Run after changing Atlas Quest's data:
//   node scripts/atlas-live-data.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AQ = path.join(ROOT, 'seed-games/atlas-quest.html');
const GAME = path.join(ROOT, 'seed-games/atlas-quest-live.html');
const src = fs.readFileSync(AQ, 'utf8');
const line = src.split('\n').find(l => l.startsWith('window.AtlasData = '));
if (!line) throw new Error('no window.AtlasData in atlas-quest.html');
const D = JSON.parse(line.slice('window.AtlasData = '.length).replace(/;\s*$/, ''));
const ver = (/const PACK_VER = '([^']+)'/.exec(src) || [])[1];
const sri = JSON.parse((/PACK_SRI = (\{[^}]*\})/.exec(src) || [])[1] || '{}');
if (!ver) throw new Error('no PACK_VER in atlas-quest.html');
// [cc, English name, label lat, label lng, region, area (thousand km2), easy 0/1, neighbours]
const easy = new Set(String(D.EASY || '').split(','));
const C = D.C.map(c => [c[0], c[1], c[13], c[14], c[9], c[10], easy.has(c[0]) ? 1 : 0, c[11] || '']);
// the maps of US states and of Canada (window.AtlasPlaces, scripts/atlas-places-build.mjs): [code, English name, label
// y, label x, map, in an inset (Alaska, Hawaii)], their shapes (flat map units) and their frames, each map's places in
// Atlas Quest's order (the server's placeCodes(map) and the game share it)
const pl = src.split('\n').find(l => l.startsWith('window.AtlasPlaces = '));
const PL = pl ? JSON.parse(pl.slice('window.AtlasPlaces = '.length).replace(/;\s*$/, '')) : { P: [], MAP: {}, MAPS: {} };
const P = PL.P.map(r => [r[0], r[1], r[6], r[5], r[0].slice(0, 2).toLowerCase(), r[13] ? 1 : 0]);
const MAPS = Object.fromEntries(Object.entries(PL.MAPS).map(([m, x]) => [m, { frame: x.frame, insets: x.insets, unit: x.unit, small: x.small }]));
const data = { C, MAP: D.MAP, FLAG: D.FLAG, P, PMAP: PL.MAP, MAPS };
const block = `/* atlas-live:begin */\nvar AL_PACK_VER = ${JSON.stringify(ver)}, AL_PACK_SRI = ${JSON.stringify(sri)};\nvar AL = ${JSON.stringify(data)};\n/* atlas-live:end */`;
const html = fs.readFileSync(GAME, 'utf8');
const re = /\/\* atlas-live:begin \*\/[\s\S]*?\/\* atlas-live:end \*\//;
if (!re.test(html)) throw new Error('no atlas-live markers in atlas-quest-live.html');
fs.writeFileSync(GAME, html.replace(re, () => block));
console.log(`atlas-quest-live: ${C.length} countries, ${Object.keys(D.MAP).length} shapes, ${Object.keys(D.FLAG).length} flags, ${P.length} states and provinces, packs ${ver}`);
