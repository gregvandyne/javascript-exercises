// One-off: the words of the teacher quick wins (docs/decisions.md "Teacher quick wins", 10 Nov 2026) into every locale
// file, from scripts/quick-wins-strings/words.json ({ <locale>: { "dotted.key": "text" } }): quiz scores for teachers,
// "Students will see it from…", the /trial username hint, the password reset by email (auth.reset.*), "Next: assign a
// first game", "See the N games" on course cards, and the host's "Nobody has joined yet" question.
// The locale files are plain JSON.stringify(…, null, 2) output, so they are parsed, changed and written back.
// en-GB: no spelling differs from en, so it gets nothing. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../server/i18n/locales');
const W = JSON.parse(fs.readFileSync(path.join(HERE, 'quick-wins-strings/words.json'), 'utf8'));
const keys = Object.keys(W.en);

for (const [code, words] of Object.entries(W)) {
  const missing = keys.filter(k => typeof words[k] !== 'string' || !words[k]);
  const extra = Object.keys(words).filter(k => !keys.includes(k));
  if (missing.length || extra.length) throw new Error(`${code}: missing ${missing.join(', ') || '-'}; extra ${extra.join(', ') || '-'}`);
  const p = path.join(DIR, `${code}.json`);
  const text = fs.readFileSync(p, 'utf8');
  const d = JSON.parse(text);
  if (JSON.stringify(d, null, 2) + '\n' !== text) throw new Error(`${code}.json is not in the expected format`);
  for (const [k, v] of Object.entries(words)) {
    const parts = k.split('.'); let o = d;
    for (const part of parts.slice(0, -1)) { if (o[part] == null) o[part] = {}; if (typeof o[part] !== 'object') throw new Error(`${code}: ${k} runs into a string at ${part}`); o = o[part]; }
    o[parts.at(-1)] = v;
  }
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  console.log('✓', code);
}
