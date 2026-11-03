// CS Quest fix round 1 words (scripts/data/cs-quest-fix1/words.mjs) merged into every locale file: cs.* is re-appended at
// the end with every other cs.* key kept; teachers.cs.cstaNote goes in place. en-GB carries only its spelling differences.
// Safe to re-run. Precedent: i18n-add-cs-quest-standards.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN, EN_GB, TRANSLATIONS } from './data/cs-quest-fix1/words.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, key, out); else out[key] = v; } return out; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v) : v; return a; };
const holes = s => [...new Set([...String(s).matchAll(/\{(\w+)/g)].map(m => m[1]).filter(x => !['plural', 'one', 'other'].includes(x)))].sort().join(',');

const en = flat(EN);
for (const [code, w] of Object.entries(TRANSLATIONS)) {
  const f = flat(w), missing = Object.keys(en).filter(k => !(k in f)), extra = Object.keys(f).filter(k => !(k in en));
  if (missing.length || extra.length) throw new Error(`${code}: missing ${missing.join(', ')} | extra ${extra.join(', ')}`);
  for (const k of Object.keys(en)) if (holes(en[k]) !== holes(f[k])) throw new Error(`${code} ${k}: placeholders differ`);
}
for (const file of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = file.replace(/\.json$/, '');
  const w = code === 'en' ? EN : code === 'en-GB' ? EN_GB : TRANSLATIONS[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (w.teachers) merge(j, { teachers: w.teachers });
  if (w.cs) { const cs = j.cs || {}; delete j.cs; j.cs = merge(cs, w.cs); }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', file);
}
