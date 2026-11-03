#!/usr/bin/env node
// CS Quest language packs: one scaffold for the four games (Robo Route, Data Detective, Packet Post, Inside the Machine).
//
//   node scripts/cs-quest-i18n.mjs <slug> check     every language file has exactly the English keys, same {slots}
//   node scripts/cs-quest-i18n.mjs <slug> build     write public/vendor/data/<slug>/<ver>/<lang>.js and print PACK_VER/PACK_SRI
//   node scripts/cs-quest-i18n.mjs <slug> stub      write a <lang>.json for every missing language with "" values (to fill in)
//
// Data lives in scripts/data/cs-quest/<slug>/: en.json is the master list `{ "strings": ["English text", ...] }` (the English
// text IS the key, the Oomba.strings way); every other language is `{ "strings": { "English text": "translation", ... } }`.
// A translation may be a plural object `{ "one": "...", "other": "..." }` like the kit's own packs.
// The built pack is `(window.CsqPacks = window.CsqPacks || {})["<slug>"]["<lang>"] = { strings }` loaded by the game with its SRI.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACK_LANGS = ['es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'he', 'ar'];
export const SLUGS = ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'];
export const dataDir = slug => path.join(ROOT, 'scripts/data/cs-quest', slug);
export const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

export function loadEnglish(slug) {
  const f = path.join(dataDir(slug), 'en.json');
  const en = readJson(f);
  if (!Array.isArray(en.strings)) throw new Error(`${f}: "strings" must be an array of English texts`);
  const seen = new Set();
  for (const s of en.strings) {
    if (typeof s !== 'string' || !s) throw new Error(`${f}: every entry must be a non-empty string`);
    if (seen.has(s)) throw new Error(`${f}: duplicate "${s}"`);
    seen.add(s);
  }
  return en.strings;
}

// Returns a list of problems (empty = good) for one language against the English master list.
export function checkLang(slug, lang, english = loadEnglish(slug)) {
  const f = path.join(dataDir(slug), `${lang}.json`);
  if (!fs.existsSync(f)) return [`${lang}: missing ${path.relative(ROOT, f)}`];
  const T = readJson(f).strings || {};
  const problems = [];
  const want = new Set(english);
  for (const k of english) {
    const v = T[k];
    const values = v && typeof v === 'object' ? Object.values(v) : [v];
    if (v == null || values.some(x => typeof x !== 'string' || !x.trim())) { problems.push(`${lang}: untranslated "${k}"`); continue; }
    for (const x of values) if (slots(x) !== slots(k)) problems.push(`${lang}: {slots} differ in "${k}" -> "${x}"`);
  }
  for (const k of Object.keys(T)) if (!want.has(k)) problems.push(`${lang}: extra key "${k}" (not in en.json)`);
  return problems;
}

export function checkAll(slug) {
  const english = loadEnglish(slug);
  return PACK_LANGS.flatMap(lang => checkLang(slug, lang, english));
}

export function buildPacks(slug, { write = true } = {}) {
  const english = loadEnglish(slug);
  const problems = checkAll(slug);
  if (problems.length) throw new Error(`${slug}: ${problems.length} problem(s); first: ${problems[0]}`);
  const bodies = {};
  for (const lang of PACK_LANGS) {
    const T = readJson(path.join(dataDir(slug), `${lang}.json`)).strings;
    const strings = Object.fromEntries(english.map(k => [k, T[k]]));
    bodies[lang] = `/* CS Quest: every word of this game in one language. */\n(window.CsqPacks = window.CsqPacks || {})[${JSON.stringify(slug)}] = Object.assign(window.CsqPacks[${JSON.stringify(slug)}] || {}, { ${JSON.stringify(lang)}: ${JSON.stringify({ strings })} });\n`;
  }
  const all = crypto.createHash('sha256').update(PACK_LANGS.map(l => bodies[l]).join('\n')).digest('hex').slice(0, 8);
  const ver = `1.0.0-${all}`;
  const sri = {};
  for (const lang of PACK_LANGS) sri[lang] = 'sha384-' + crypto.createHash('sha384').update(bodies[lang]).digest('base64');
  if (write) {
    const dir = path.join(ROOT, 'public/vendor/data', slug, ver);
    fs.mkdirSync(dir, { recursive: true });
    for (const lang of PACK_LANGS) fs.writeFileSync(path.join(dir, `${lang}.js`), bodies[lang]);
    // older versions of the same game's packs are no longer referenced once the HTML pins the new version
    for (const old of fs.readdirSync(path.join(ROOT, 'public/vendor/data', slug))) if (old !== ver) fs.rmSync(path.join(ROOT, 'public/vendor/data', slug, old), { recursive: true, force: true });
  }
  return { ver, sri, count: english.length };
}

export function stub(slug) {
  const english = loadEnglish(slug);
  const made = [];
  for (const lang of PACK_LANGS) {
    const f = path.join(dataDir(slug), `${lang}.json`);
    const cur = fs.existsSync(f) ? readJson(f).strings || {} : {};
    const strings = Object.fromEntries(english.map(k => [k, cur[k] ?? '']));
    fs.writeFileSync(f, JSON.stringify({ strings }, null, 1) + '\n');
    made.push(lang);
  }
  return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [slug, cmd = 'check'] = process.argv.slice(2);
  if (!SLUGS.includes(slug)) { console.error(`usage: cs-quest-i18n.mjs <${SLUGS.join('|')}> check|build|stub`); process.exit(2); }
  if (cmd === 'check') {
    const p = checkAll(slug);
    for (const line of p.slice(0, 40)) console.log(line);
    if (p.length > 40) console.log(`... ${p.length - 40} more`);
    console.log(p.length ? `${slug}: ${p.length} problem(s)` : `${slug}: ${loadEnglish(slug).length} strings, ${PACK_LANGS.length} languages complete`);
    process.exit(p.length ? 1 : 0);
  } else if (cmd === 'build') {
    const r = buildPacks(slug);
    console.log(`${slug}: ${r.count} strings -> public/vendor/data/${slug}/${r.ver}/`);
    console.log(`const PACK_VER = '${r.ver}', PACK_SRI = ${JSON.stringify(r.sri)};`);
  } else if (cmd === 'stub') {
    console.log(`${slug}: wrote ${stub(slug).join(', ')}`);
  } else { console.error(`unknown command ${cmd}`); process.exit(2); }
}
