// One-off: the teaching loop's words (views/teacher-loop.js, docs/decisions.md "The teaching loop") into every locale
// file as teach.loop. The tool names the app already shows (Lesson library, Draft with AI, Needs attention first, Download
// (CSV), Host a live game) are copied from each language's own strings, so the loop names a tool exactly as its button
// does. The locale files are plain JSON.stringify(…, null, 2) output, so they are parsed, changed and written back.
// en-GB: no spelling differs from en, so it gets nothing. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'teach-loop-strings/words.json'), 'utf8'));
const REUSE = { library: 'lessons.library.title', draftAi: 'lessons.ai.button', attention: 'progress.lesson.attention', csv: 'progress.gradebook.csv', live: 'school.teach.hostLive' };
const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? x : x[p]), o);

for (const [code, words] of Object.entries(W)) {
  const p = path.join(DIR, `${code}.json`);
  const text = fs.readFileSync(p, 'utf8');
  const d = JSON.parse(text);
  if (JSON.stringify(d, null, 2) + '\n' !== text) throw new Error(`${code}.json is not in the expected format`);
  const loop = structuredClone(words);
  for (const [k, from] of Object.entries(REUSE)) {
    const v = get(d, from);
    if (typeof v !== 'string') throw new Error(`${code}: ${from} is missing`);
    loop.tools[k] = v;
  }
  d.teach = d.teach || {};
  d.teach.loop = loop;
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  console.log('✓', code);
}
