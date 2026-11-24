// Atlas Quest's language packs (public/vendor/data/atlas-quest/<version>/<lang>.js, docs/decisions.md "Game data packs"):
// a published version folder never changes, so corrections go in a new one. This builds the version named in a fixes
// file (scripts/data/atlas-quest/pack-<version>.json) from its base version: the base packs as they are, with the
// fixes' strings (name.XX, cap.XX, fam.XX, fact.XX, capnote.XX, capalt.XX, language names...) set and the fixes'
// culture questions patched ({ "CC.i": { q?, w?: [3 wrong answers], why? } }, each per language). The bytes are written
// exactly as 1.0.0's were (a comment line, then one JSON line), the folder is <version>-<8 hex of the sha256 of the
// packs in the game's PACK_SRI order, joined by newlines> (how 1.0.0-b244a5ca was named), and the game's PACK_VER and
// PACK_SRI are rewritten. Then run node scripts/atlas-live-data.js so Atlas Quest Live pins the same packs.
//   node scripts/atlas-pack-build.mjs [scripts/data/atlas-quest/pack-1.0.1.json]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'seed-games/atlas-quest.html');
const DIR = path.join(ROOT, 'public/vendor/data/atlas-quest');
const fixFile = path.resolve(process.argv[2] || path.join(ROOT, 'scripts/data/atlas-quest/pack-1.0.1.json'));
const FIX = JSON.parse(fs.readFileSync(fixFile, 'utf8'));
const html = fs.readFileSync(GAME, 'utf8');
const order = Object.keys(JSON.parse((/PACK_SRI = (\{[^}]*\})/.exec(html) || [])[1] || '{}'));
if (!order.length) throw new Error('no PACK_SRI in atlas-quest.html');
const HEAD = '/* Atlas Quest: every word of the game in one language (the screens, the 195 countries and their culture questions). */';
const FIELD = { q: 0, why: 5 };

const bodies = {};
for (const lang of order) {
  const src = fs.readFileSync(path.join(DIR, FIX.base, `${lang}.js`), 'utf8');
  const box = { window: {} };
  vm.runInNewContext(src, box);
  const pack = box.window.AtlasPacks[lang];
  // the base must rebuild to its own bytes, so the new folder is written the way the old one was
  const again = `${HEAD}\n(window.AtlasPacks = window.AtlasPacks || {})[${JSON.stringify(lang)}] = ${JSON.stringify(pack)};\n`;
  if (again !== src) throw new Error(`${lang}: the base pack does not rebuild byte for byte`);
  for (const [key, per] of Object.entries(FIX.strings || {})) {
    if (typeof per[lang] !== 'string' || !per[lang].trim()) throw new Error(`${lang}: no ${key}`);
    pack.strings[key] = per[lang];
  }
  for (const [id, patch] of Object.entries(FIX.trivia || {})) {
    const [cc, i] = id.split('.'), row = pack.trivia[cc] && pack.trivia[cc][+i];
    if (!row || row.length !== 6) throw new Error(`${lang}: no culture question ${id}`);
    for (const [f, per] of Object.entries(patch)) {
      const v = per[lang];
      if (f === 'w') { if (!Array.isArray(v) || v.length !== 3) throw new Error(`${lang}: ${id} wrong answers`); row.splice(2, 3, ...v); }
      else if (f in FIELD) { if (typeof v !== 'string' || !v.trim()) throw new Error(`${lang}: ${id} ${f}`); row[FIELD[f]] = v; }
      else throw new Error(`${id}: unknown field ${f}`);
    }
  }
  bodies[lang] = `${HEAD}\n(window.AtlasPacks = window.AtlasPacks || {})[${JSON.stringify(lang)}] = ${JSON.stringify(pack)};\n`;
}
const ver = `${FIX.version}-${crypto.createHash('sha256').update(order.map(l => bodies[l]).join('\n')).digest('hex').slice(0, 8)}`;
const out = path.join(DIR, ver);
if (fs.existsSync(out) && order.some(l => fs.readFileSync(path.join(out, `${l}.js`), 'utf8') !== bodies[l])) throw new Error(`${ver} exists with other bytes`);
fs.mkdirSync(out, { recursive: true });
const sri = {};
for (const lang of order) {
  fs.writeFileSync(path.join(out, `${lang}.js`), bodies[lang]);
  sri[lang] = 'sha384-' + crypto.createHash('sha384').update(bodies[lang]).digest('base64');
}
const re = /const PACK_VER = '[^']+', PACK_SRI = \{[^}]*\};/;
if (!re.test(html)) throw new Error('no PACK_VER line in atlas-quest.html');
fs.writeFileSync(GAME, html.replace(re, () => `const PACK_VER = '${ver}', PACK_SRI = ${JSON.stringify(sri)};`));
console.log(`atlas-quest packs ${ver} (from ${FIX.base}): ${Object.keys(FIX.strings || {}).length} strings, ${Object.keys(FIX.trivia || {}).length} culture questions, ${order.length} languages`);
