// One-off: the teacher Standards pages' words (server/routes/standards.js, docs/decisions.md "Standards beyond computer science"), from
// scripts/standards-strings/<code>.json into each locale file as a top-level "standards" block. The block is written as text
// just before the file's closing brace (an existing "standards" block is replaced), so the rest of every hand-formatted
// locale file stays byte for byte as it was. en-GB only gets the lines whose spelling differs. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../server/i18n/locales');
const SRC = path.join(HERE, 'standards-strings');

/** The text of a top-level block (2-space indent, as the locale files are written). */
const block = obj => '  "standards": ' + JSON.stringify(obj, null, 2).replace(/\n/g, '\n  ');

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = f.replace(/\.json$/, '');
  const src = path.join(SRC, `${code}.json`);
  if (!fs.existsSync(src)) { console.log('·', f, '(no words yet)'); continue; }
  const words = JSON.parse(fs.readFileSync(src, 'utf8'));
  const p = path.join(DIR, f);
  let text = fs.readFileSync(p, 'utf8');
  // Take out an earlier "standards" block: from its key to the matching closing brace.
  const at = text.indexOf('\n  "standards": {');
  if (at >= 0) {
    let i = text.indexOf('{', at), depth = 0, inStr = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break;
    }
    let end = i + 1; if (text[end] === ',') end++;
    let start = at; if (text[start - 1] === ',') start--;
    text = text.slice(0, start) + text.slice(end);
  }
  const close = text.lastIndexOf('}');
  const before = text.slice(0, close).replace(/\s+$/, '');
  text = `${before},\n${block(words)}\n}\n`;
  JSON.parse(text);   // still valid JSON
  fs.writeFileSync(p, text);
  console.log('✓', f);
}
