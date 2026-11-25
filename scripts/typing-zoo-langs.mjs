// Typing Zoo's languages (docs/decisions.md "Typing Pets in other languages"): writes the language packs in
// seed-games/typing-zoo-langs/ into seed-games/typing-zoo.html, so the game stays one self-contained file.
//   seed-games/typing-zoo-langs/layouts.json   keyboard layouts by physical key position (normal and Shift characters,
//                                               dead keys), shared by every pack
//   seed-games/typing-zoo-langs/<lang>.json    { lang, layout, label?, strings, pets, words, sentences, marks, apos, paras }
// The game gets: the I18N block (each language's strings, read by server/services/tts-lines.js too), and between the
// PACKS markers LAYOUTS, PACKS (the typing content of each pack whose content isn't English's: zh-Hant types English)
// and PET_NAMES. Usage: node scripts/typing-zoo-langs.mjs [--check]   (--check: exit 1 when the game is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'seed-games', 'typing-zoo-langs');
const GAME = path.join(ROOT, 'seed-games', 'typing-zoo.html');
/** The order languages appear in (English first, then the site's order). */
export const ORDER = ['en', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

export function readPacks() {
  const layouts = JSON.parse(fs.readFileSync(path.join(DIR, 'layouts.json'), 'utf8'));
  const packs = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'layouts.json')
    .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .sort((a, b) => (ORDER.indexOf(a.lang) + 99) % 99 - (ORDER.indexOf(b.lang) + 99) % 99);
  return { layouts, packs };
}
const CONTENT = ['words', 'sentences', 'marks', 'apos', 'paras'];
const line = (k, v) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
export function render({ layouts, packs }) {
  const en = packs.find(p => p.lang === 'en');
  const sameAsEn = p => p.lang !== 'en' && CONTENT.every(k => JSON.stringify(p[k]) === JSON.stringify(en[k])) && p.layout === en.layout;
  const i18n = `var I18N = {\n${packs.map(p => line(p.lang, p.strings)).join(',\n')}\n};\n`;
  const content = packs.filter(p => !sameAsEn(p)).map(p => line(p.lang, { layout: p.layout, ...(p.label ? { label: p.label } : {}), ...Object.fromEntries(CONTENT.map(k => [k, p[k]])) }));
  const data = `const LAYOUTS = {\n${Object.entries(layouts).map(([k, v]) => line(k, v)).join(',\n')}\n};\n`
    + `const PACKS = {\n${content.join(',\n')}\n};\n`
    + `const PET_NAMES = {\n${packs.map(p => line(p.lang, p.pets)).join(',\n')}\n};\n`;
  return { i18n, data };
}
const between = (src, a, b, body) => {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < i) throw new Error(`markers ${a} / ${b} not found`);
  return src.slice(0, i + a.length) + '\n' + body + src.slice(j);
};
export function build(src, packsData = readPacks()) {
  const { i18n, data } = render(packsData);
  return between(between(src, '// ==== I18N START ====', '// ==== I18N END ====', i18n), '// ==== PACKS START ====', '// ==== PACKS END ====', data);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = fs.readFileSync(GAME, 'utf8'), out = build(src);
  if (process.argv.includes('--check')) { if (out !== src) { console.error('typing-zoo.html is out of date: run node scripts/typing-zoo-langs.mjs'); process.exit(1); } console.log('up to date'); }
  else { fs.writeFileSync(GAME, out); console.log(`wrote ${path.relative(ROOT, GAME)} (${readPacks().packs.map(p => p.lang).join(', ')})`); }
}
