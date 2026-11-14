// One-off: the words of the step-by-step game setup (/build/new, server/routes/build-setup.js) into every locale file,
// from scripts/build-setup-strings/<locale>.json ({ "dotted.key": "text" }): a key goes under "buildSetup." (the page,
// written by the server), and one that starts with "client." under "js.buildsetup." (shown by public/js/buildsetup.js). en.json there is the source: every other language must have exactly its keys, except en-GB,
// which only holds the strings whose British wording differs. Also the translator notes (server/i18n/notes.json).
// The locale files are plain JSON.stringify(…, null, 2) output, so they are parsed, changed and written back.
// Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../server/i18n/locales');
const SRC = path.join(HERE, 'build-setup-strings');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const en = read(path.join(SRC, 'en.json')), keys = Object.keys(en);

for (const file of fs.readdirSync(SRC).filter(f => f.endsWith('.json') && f !== 'notes.json').sort()) {
  const code = file.replace(/\.json$/, ''), words = read(path.join(SRC, file));
  const missing = code === 'en-GB' ? [] : keys.filter(k => typeof words[k] !== 'string' || !words[k]);
  const extra = Object.keys(words).filter(k => !keys.includes(k));
  if (missing.length || extra.length) throw new Error(`${code}: missing ${missing.join(', ') || '-'}; extra ${extra.join(', ') || '-'}`);
  const p = path.join(DIR, `${code}.json`), text = fs.readFileSync(p, 'utf8'), d = JSON.parse(text);
  if (JSON.stringify(d, null, 2) + '\n' !== text) throw new Error(`${code}.json is not in the expected format`);
  delete d.buildSetup; if (d.js) delete d.js.buildsetup;   // re-run: the blocks are written again from the source
  for (const [k, v] of Object.entries(words)) {
    const parts = k.startsWith('client.') ? ['js', 'buildsetup', ...k.split('.').slice(1)] : ['buildSetup', ...k.split('.')]; let o = d;
    for (const part of parts.slice(0, -1)) { if (o[part] == null) o[part] = {}; if (typeof o[part] !== 'object') throw new Error(`${code}: ${k} runs into a string at ${part}`); o = o[part]; }
    o[parts.at(-1)] = v;
  }
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  console.log('✓', code, Object.keys(words).length);
}

// Translator notes: added (or replaced) under their full keys; the file keeps its order otherwise.
const notesFile = path.join(HERE, '../server/i18n/notes.json'), notes = read(notesFile);
for (const [k, v] of Object.entries(read(path.join(SRC, 'notes.json')))) notes[k.startsWith('client.') ? `js.buildsetup.${k.slice(7)}` : `buildSetup.${k}`] = v;
fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2) + '\n');
console.log('✓ notes');
