// CS Quest teacher pages (docs/cs-quest.md "Teacher pages"): the site words under cs.* (the program page, the plan page,
// the print view and printables, the projector questions, the coverage map, the editor banner), js.cs.* (public/js/cs.js),
// learn.hubs.cs.* + learn.games.* (the /learn/computer-science page) and teachers.cs.* (the public program page,
// English-first under the uncounted teachers.* prefix), merged into every locale file at the end (the cs block is
// re-appended last; the platform slice's cs.step / cs.review sub-blocks are kept). Safe to re-run. Precedent:
// scripts/i18n-add-cs-quest.mjs. Every language must carry every chrome key (the script checks); the long public copy
// is English in en.json only and shows marked lang="en" until a language has it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN, PUBLIC_EN } from './data/cs-quest-pages/en.mjs';
import { TRANSLATIONS } from './data/cs-quest-pages/translations.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, key, out); else out[key] = v; } return out; };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v) : v; return a; };

const enKeys = Object.keys(flat(EN)).sort();
for (const [code, w] of Object.entries(TRANSLATIONS)) {
  const keys = Object.keys(flat(w)).sort();
  const missing = enKeys.filter(k => !keys.includes(k)), extra = keys.filter(k => !enKeys.includes(k));
  if (missing.length || extra.length) throw new Error(`${code}: missing ${missing.join(', ')} | extra ${extra.join(', ')}`);
}
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const code = f.replace(/\.json$/, '');
  const w = code === 'en' || code === 'en-GB' ? EN : TRANSLATIONS[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  // js.cs, learn.hubs.cs, learn.games.*, teachers.cs: merged in place (by key).
  merge(j, { js: { cs: w.js.cs } });
  merge(j, { learn: { hubs: { cs: w.learn.hubs.cs }, games: w.learn.games } });
  if (code === 'en') merge(j, PUBLIC_EN);
  // cs.* goes at the end of the file; other owners' cs.* sub-blocks are kept.
  const cs = j.cs || {}; delete j.cs;
  j.cs = merge(cs, w.cs);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
