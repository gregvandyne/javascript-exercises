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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'scripts/data/would-you-rather');
const OUT = path.join(ROOT, 'public/vendor/data/would-you-rather');
const GAME = path.join(ROOT, 'seed-games/would-you-rather.html');
export const TAGS = ['brave', 'think', 'make', 'animal', 'food', 'fast', 'kind', 'calm', 'fun', 'nature', 'tech', 'social'];
export const CATS = ['animals', 'food', 'powers', 'school', 'travel', 'silly', 'sports', 'space', 'future', 'family', 'deep'];

const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const en = read('en.json').items, ui = read('ui.json');
const fail = msg => { console.error(`wyr-bank: ${msg}`); process.exit(1); };
const ids = new Set();
for (const it of en) {
  if (ids.has(it.id)) fail(`duplicate id ${it.id}`); ids.add(it.id);
  if (!CATS.includes(it.cat)) fail(`${it.id}: unknown category ${it.cat}`);
  for (const o of [it.a, it.b]) {
    if (!o.text || o.text.length > 60) fail(`${it.id}: an option is empty or over 60 characters`);
    for (const t of o.tags) if (!TAGS.includes(t)) fail(`${it.id}: unknown tag ${t}`);
  }
}
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

const block = `/* wyr-data:begin */\nvar WYR_PACK_VER = ${JSON.stringify(ver)}, WYR_PACK_SRI = ${JSON.stringify(sri)};\nvar WYR_UI = ${JSON.stringify(ui)};\nvar WYR_EN = ${JSON.stringify(bank)};\n/* wyr-data:end */`;
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
