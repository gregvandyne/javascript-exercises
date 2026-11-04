// CS Quest slide pictures: validate public/img/csq/manifest.json against the files on disk and the decks.
// Every manifest entry must be complete (game, chapter, band, state, concept, alt), its WebP must exist at
// public/img/<key>.webp and stay near the plan's weight budget (warn over 120 KB, fail over 200 KB); every
// slide img key in seed-lessons/cs-quest/course must resolve to a manifest entry and carry a valid alt in
// the deck itself; manifest entries no slide uses are reported as orphans (a warning, not a failure).
// Usage: node scripts/csq-manifest-check.js   (or npm run csq:check). Exit 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_KEY = /^csq\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MANIFEST = path.join(ROOT, 'public', 'img', 'csq', 'manifest.json');
const COURSE = path.join(ROOT, 'seed-lessons', 'cs-quest', 'course');
const WARN_BYTES = 120 * 1024, FAIL_BYTES = 200 * 1024;

const errors = [], warnings = [];
const fail = m => errors.push(m), warn = m => warnings.push(m);

let manifest;
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
catch (e) { console.error(`✗ manifest unreadable: ${e.message}`); process.exit(1); }
const entries = Array.isArray(manifest.images) ? manifest.images : null;
if (!entries) { console.error('✗ manifest.images must be an array'); process.exit(1); }

const byKey = new Map();
for (const [i, e] of entries.entries()) {
  const at = `manifest.images[${i}]`;
  if (!e || typeof e !== 'object') { fail(`${at}: not an object`); continue; }
  if (!IMG_KEY.test(e.key || '')) fail(`${at}: key ${JSON.stringify(e.key)} is not csq/<game>/<state>`);
  if (byKey.has(e.key)) fail(`${at}: duplicate key ${e.key}`);
  byKey.set(e.key, e);
  for (const f of ['game', 'chapter', 'band', 'state', 'concept']) if (typeof e[f] !== 'string' || !e[f]) fail(`${at} (${e.key}): missing ${f}`);
  if (typeof e.alt !== 'string' || !e.alt.trim()) fail(`${at} (${e.key}): alt is required`);
  else if (e.alt.trim().length > 160) fail(`${at} (${e.key}): alt is ${e.alt.trim().length} chars (max 160)`);
  const file = path.join(ROOT, 'public', 'img', `${e.key}.webp`);
  if (!fs.existsSync(file)) fail(`${at} (${e.key}): file missing: public/img/${e.key}.webp`);
  else {
    const kb = fs.statSync(file).size;
    if (kb > FAIL_BYTES) fail(`${at} (${e.key}): ${Math.round(kb / 1024)} KB WebP (hard limit 200 KB)`);
    else if (kb > WARN_BYTES) warn(`${e.key}: ${Math.round(kb / 1024)} KB WebP (plan budget 120 KB)`);
  }
}

// The decks: every img a slide names must be in the manifest, with the deck's own alt valid too.
const used = new Set();
for (const band of fs.readdirSync(COURSE).sort()) {
  const dir = path.join(COURSE, band);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
    const deck = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [i, s] of (deck.slides || []).entries()) {
      if (s.img == null) continue;
      const at = `course/${band}/${f} slide ${i + 1} (${s.title})`;
      used.add(s.img);
      if (!IMG_KEY.test(s.img)) fail(`${at}: img ${JSON.stringify(s.img)} is not a csq/<game>/<state> key`);
      else if (!byKey.has(s.img)) fail(`${at}: img ${s.img} has no manifest entry`);
      if (typeof s.alt !== 'string' || !s.alt.trim()) fail(`${at}: an img slide needs its alt in the deck`);
      else if (s.alt.trim().length > 160) fail(`${at}: alt is ${s.alt.trim().length} chars (max 160)`);
      else if (byKey.has(s.img) && byKey.get(s.img).alt !== s.alt) warn(`${at}: deck alt differs from the manifest alt for ${s.img}; keep them in sync`);
    }
  }
}
for (const key of byKey.keys()) if (!used.has(key)) warn(`${key}: in the manifest but no slide uses it yet`);

for (const w of warnings) console.log(`! ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(`csq manifest: ${entries.length} image(s), ${used.size} used by slides, ${warnings.length} warning(s), ${errors.length} error(s)`);
process.exit(errors.length ? 1 : 0);
