#!/usr/bin/env node
// Would You Rather: builds the game's data from scripts/data/would-you-rather/.
//   en.json   the English dilemmas (the source: id, cat, a/b {text, tags}); built into the game itself, so it always works
//   ui.json   the game's own words in every site language (built into the game)
//   <lang>.json (optional, a translator's copy of en.json with only the texts translated): a language pack at
//             public/vendor/data/would-you-rather/<version>/<lang>.js, loaded by the game with its sha384 (the pattern
//             Atlas Quest uses: docs/decisions.md "Game data packs"). A language without one plays the English questions.
// Writes everything between the `/* wyr-data:begin */` and `/* wyr-data:end */` markers in seed-games/would-you-rather.html.
//
//   node scripts/wyr-bank.js          (then node scripts/seed.js to load the game)
// Importing this module does nothing (TAGS and CATS are exported for the tests); the build runs only when the script is
// the program that was started.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'scripts/data/would-you-rather');
const OUT = path.join(ROOT, 'public/vendor/data/would-you-rather');
const GAME = path.join(ROOT, 'seed-games/would-you-rather.html');
export const TAGS = ['brave', 'think', 'make', 'animal', 'food', 'fast', 'kind', 'calm', 'fun', 'nature', 'tech', 'social'];
// tech and online: the CS Quest topics (lessons 6.1 and 6.3; prompts and CSTA ids in seed-lessons/cs-quest/wyr-tech.json).
// The live mode's TOPICS (server/live/wyr.js) is the same list; tests/unit/live-wyr-atlas.test.js checks they agree.
export const CATS = ['animals', 'food', 'powers', 'school', 'travel', 'silly', 'sports', 'space', 'future', 'family', 'deep', 'tech', 'online', 'numbers'];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();

export function build() {
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const en = read('en.json').items, ui = read('ui.json');
const fail = msg => { console.error(`wyr-bank: ${msg}`); process.exit(1); };
const ids = new Set();
for (const it of en) {
  if (ids.has(it.id)) fail(`duplicate id ${it.id}`); ids.add(it.id);
  if (!CATS.includes(it.cat)) fail(`${it.id}: unknown category ${it.cat}`);
  if (!it.id.startsWith(`${it.cat}-`)) fail(`${it.id}: the id does not start with its category`);
  for (const o of [it.a, it.b]) {
    if (!o.text || o.text.length > 60) fail(`${it.id}: an option is empty or over 60 characters`);
    // No runs of two or more digits (a single one, as in "3D", is fine): nothing here may read as a number, a year or
    // a code when it is shown on a class screen.
    if (/\d{2,}/.test(o.text)) fail(`${it.id}: an option has a run of digits`);
    for (const t of o.tags) if (!TAGS.includes(t)) fail(`${it.id}: unknown tag ${t}`);
  }
}
for (const lang of Object.keys(ui)) for (const c of CATS) if (lang !== 'en-GB' && !ui[lang][`cat.${c}`]) fail(`ui.json ${lang} has no name for the topic ${c}`);
// The English bank in the game: [id, cat, aText, aTags, bText, bTags] (tags as one string).
const bank = en.map(it => [it.id, it.cat, it.a.text, it.a.tags.join(' '), it.b.text, it.b.tags.join(' ')]);

// Translated banks: [id, aText, bText]; categories and tags always come from English (by id).
const packs = {};
for (const f of fs.readdirSync(SRC).filter(f => /^[a-z]{2}(-[A-Za-z]{2,4})?\.json$/.test(f) && f !== 'en.json' && f !== 'ui.json')) {
  const lang = f.slice(0, -5), items = read(f).items || [];
  const rows = items.filter(it => ids.has(it.id) && it.a && it.b && it.a.text && it.b.text).map(it => [it.id, it.a.text, it.b.text]);
  if (rows.length < en.length * 0.9) { console.warn(`wyr-bank: ${lang} has ${rows.length} of ${en.length} items: skipped until it is complete`); continue; }
  packs[lang] = `/* Would You Rather questions (${lang}): built by scripts/wyr-bank.js from scripts/data/would-you-rather/${f}. Do not edit. */\n`
    + `window.WyrPacks = window.WyrPacks || {}; window.WyrPacks[${JSON.stringify(lang)}] = ${JSON.stringify(rows)};\n`;
}
const sri = {}; let ver = '';
if (Object.keys(packs).length) {
  const hash = crypto.createHash('sha256').update(Object.keys(packs).sort().map(k => k + packs[k]).join('\n')).digest('hex').slice(0, 8);
  // letters only: a run of digits could read like a phone number to the content scanner
  ver = `v1-${hash.replace(/[0-9]/g, d => 'ghijklmnop'[+d])}`;
  fs.mkdirSync(path.join(OUT, ver), { recursive: true });
  for (const [lang, body] of Object.entries(packs)) {
    fs.writeFileSync(path.join(OUT, ver, `${lang}.js`), body);
    sri[lang] = 'sha384-' + crypto.createHash('sha384').update(body).digest('base64');
  }
}
if (fs.existsSync(OUT)) for (const d of fs.readdirSync(OUT)) if (d !== ver) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

// The I18N markers sit inside the generated block so a rebuild keeps them: server/services/tts-lines.js reads the
// game's spoken lines (AI voices) from the marked block only.
const block = `/* wyr-data:begin */\nvar WYR_PACK_VER = ${JSON.stringify(ver)}, WYR_PACK_SRI = ${JSON.stringify(sri)};\n// ==== I18N START ====\nvar WYR_UI = ${JSON.stringify(ui)};\nvar I18N = WYR_UI;\n// ==== I18N END ====\nvar WYR_EN = ${JSON.stringify(bank)};\n/* wyr-data:end */`;
const html = fs.readFileSync(GAME, 'utf8');
if (!/\/\* wyr-data:begin \*\/[\s\S]*?\/\* wyr-data:end \*\//.test(html)) fail('no wyr-data markers in the game');
fs.writeFileSync(GAME, html.replace(/\/\* wyr-data:begin \*\/[\s\S]*?\/\* wyr-data:end \*\//, () => block));
// Would You Rather Live (seed-games/would-you-rather-live.html) loads the same packs for its practice round.
const LIVE = path.join(ROOT, 'seed-games/would-you-rather-live.html');
if (fs.existsSync(LIVE)) {
  const live = fs.readFileSync(LIVE, 'utf8'), re = /\/\* wyr-live:begin \*\/[\s\S]*?\/\* wyr-live:end \*\//;
  if (!re.test(live)) fail('no wyr-live markers in would-you-rather-live.html');
  fs.writeFileSync(LIVE, live.replace(re, () => `/* wyr-live:begin */\n  var WYR_PACK_VER = ${JSON.stringify(ver)}, WYR_PACK_SRI = ${JSON.stringify(sri)};\n  /* wyr-live:end */`));
}
const per = {}; for (const it of en) per[it.cat] = (per[it.cat] || 0) + 1;
console.log(`would-you-rather: ${en.length} dilemmas (${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', ')}), UI in ${Object.keys(ui).length} languages, ${Object.keys(packs).length} translated packs${ver ? ` (${ver})` : ''}`);
}
