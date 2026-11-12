// Adds new Kit 2 files to kit2/SHIPPED.json: every file under public/vendor/kit2/ and every theme version's theme.json
// (which itself holds the sha384 of each of the theme's files). It only ADDS entries: a shipped file is never re-hashed,
// so a changed file shows up as a failing tests/unit/kit2-hosting.test.js, never as a quietly updated lock.
// node kit2/pipeline/lock.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK = path.join(ROOT, 'kit2/SHIPPED.json');
const sri = (f) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};
lock._ = 'Kit 2 files that have shipped. They never change bytes: saved games pin them (import map integrity, theme versions). Add new versions with node kit2/pipeline/lock.mjs in the change that ships them; tests/unit/kit2-hosting.test.js checks this list against public/vendor.';
lock.engines ||= {}; lock.themes ||= {};
let added = 0;
for (const f of walk(path.join(ROOT, 'public/vendor/kit2')).sort()) {
  const rel = path.relative(path.join(ROOT, 'public/vendor/kit2'), f).split(path.sep).join('/');
  if (!lock.engines[rel]) { lock.engines[rel] = sri(f); added++; }
}
const themes = path.join(ROOT, 'public/vendor/themes');
for (const t of fs.readdirSync(themes).sort()) for (const v of fs.readdirSync(path.join(themes, t)).sort()) {
  const key = `${t}/${v}`;
  if (!lock.themes[key]) { lock.themes[key] = sri(path.join(themes, t, v, 'theme.json')); added++; }
}
fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
console.log(`kit2/SHIPPED.json: ${added} added, ${Object.keys(lock.engines).length} engine files, ${Object.keys(lock.themes).length} theme versions`);
