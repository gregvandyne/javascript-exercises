// CS Quest class Standards tab (docs/cs-quest.md "Standards tab"): cs.standards.* and school.classTabs.standards, merged
// into every locale file (cs.* is re-appended at the end; every other cs.* sub-block is kept; school.classTabs gets the
// one key in place). en-GB carries only its spelling differences. Safe to re-run. Precedent: i18n-add-cs-quest-pages.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN, EN_GB, TRANSLATIONS } from './data/cs-quest-standards/words.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, key, out); else out[key] = v; } return out; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v) : v; return a; };
const holes = s => [...String(s).matchAll(/\{(\w+)/g)].map(m => m[1]).filter(x => x !== 'plural').sort().join(',');

const en = flat(EN);
for (const [code, w] of Object.entries(TRANSLATIONS)) {
  const f = flat(w), missing = Object.keys(en).filter(k => !(k in f)), extra = Object.keys(f).filter(k => !(k in en));
  if (missing.length || extra.length) throw new Error(`${code}: missing ${missing.join(', ')} | extra ${extra.join(', ')}`);
  for (const k of Object.keys(en)) if (holes(en[k]).replace(/\b(one|other)\b,?/g, '') !== holes(f[k]).replace(/\b(one|other)\b,?/g, '')) throw new Error(`${code} ${k}: placeholders differ`);
}
for (const file of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = file.replace(/\.json$/, '');
  const w = code === 'en' ? EN : code === 'en-GB' ? EN_GB : TRANSLATIONS[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (w.tab) merge(j, { school: { classTabs: { standards: w.tab } } });
  const cs = j.cs || {}; delete j.cs;
  j.cs = merge(cs, { standards: w.standards });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', file);
}
