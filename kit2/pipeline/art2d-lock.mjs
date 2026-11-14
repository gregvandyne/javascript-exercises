// Locks the 2D art (kit2/ART2D.json): the Oomba2D helper and every built pack version, by sha384.
//   node kit2/pipeline/art2d-lock.mjs
// Copies kit2/src2d/oomba2d.js to public/vendor/art2d/oomba2d/<its version>/ when that version is not there yet, then
// adds what is new to the lock. A locked file is never rewritten: if its bytes differ the script stops (ship a new
// version instead). tests/unit/art2d.test.js checks every locked file against this list.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/vendor/art2d'), LOCK = path.join(ROOT, 'kit2/ART2D.json');
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : { _: '', helper: {}, packs: {} };
lock._ = '2D art that has shipped (kit2/pipeline/art2d-lock.mjs). helper: the Oomba2D library by version. packs: every pack version with the hash of each of its files. Nothing listed here may ever change: a fix or new art ships as a new version.';

const src = fs.readFileSync(path.join(ROOT, 'kit2/src2d/oomba2d.js'));
const version = (/VERSION = '(\d+\.\d+\.\d+)'/.exec(src.toString()) || [])[1];
if (!version) throw new Error('kit2/src2d/oomba2d.js names no VERSION');
const helperFile = path.join(DIR, 'oomba2d', version, 'oomba2d.js');
if (!fs.existsSync(helperFile)) { fs.mkdirSync(path.dirname(helperFile), { recursive: true }); fs.writeFileSync(helperFile, src); console.log('helper', version, 'copied'); }
let bad = 0;
const pin = (table, key, value, what) => { if (table[key] && table[key] !== value) { console.error(`LOCKED FILE CHANGED: ${what}`); bad++; } else if (!table[key]) { table[key] = value; console.log('locked', what); } };
for (const v of fs.readdirSync(path.join(DIR, 'oomba2d')).sort()) pin(lock.helper, v, sri(fs.readFileSync(path.join(DIR, 'oomba2d', v, 'oomba2d.js'))), `oomba2d ${v}`);
for (const id of fs.readdirSync(DIR).sort()) {
  if (id === 'oomba2d') continue;
  for (const v of fs.readdirSync(path.join(DIR, id)).sort()) {
    const dir = path.join(DIR, id, v), key = `${id}/${v}`, files = {};
    const walk = d => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files[path.relative(dir, p).split(path.sep).join('/')] = sri(fs.readFileSync(p)); } };
    walk(dir);
    if (lock.packs[key]) { if (JSON.stringify(lock.packs[key]) !== JSON.stringify(files)) { console.error(`LOCKED PACK CHANGED: ${key}`); bad++; } }
    else { lock.packs[key] = files; console.log('locked', key, Object.keys(files).length, 'files'); }
  }
}
if (bad) process.exit(1);
fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
