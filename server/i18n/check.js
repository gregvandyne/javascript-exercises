// Consistency checks for the locale files (used by `npm run i18n:check` and tests/unit/i18n.test.js).
//  - every locale's keys must exist in en.json (no extra keys) and parse as valid messages
//  - placeholders: a translation may only use en's placeholders, and must keep the ones the reader sees
//    (plural-only selectors may be dropped by languages without plurals)
//  - every key the code uses with a literal t('...') exists in en.json; en keys nothing uses are listed as unused
//  - every note in notes.json belongs to a real key
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, placeholders, placeholderInfo } from '../../public/js/i18n-format.js';
import { flatten, CODES, DEFAULT_LOCALE } from './index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

export function loadLocale(code, dir = path.join(HERE, 'locales')) {
  const f = path.join(dir, `${code}.json`);
  return fs.existsSync(f) ? flatten(readJson(f)) : null;
}

/** Compare one locale against English. -> { code, missing, extra, placeholderErrors, parseErrors, translated, total } */
export function checkLocale(code, en, loc) {
  const out = { code, missing: [], extra: [], placeholderErrors: [], parseErrors: [], translated: 0, total: Object.keys(en).length };
  if (!loc) { out.missing = Object.keys(en); out.parseErrors.push(`${code}.json is missing`); return out; }
  for (const key of Object.keys(en)) if (!(key in loc) || loc[key] === '') out.missing.push(key); else out.translated++;
  for (const [key, msg] of Object.entries(loc)) {
    if (!(key in en)) { out.extra.push(key); continue; }
    if (msg === '') continue;
    let have;
    try { parse(msg); have = placeholders(msg); } catch (e) { out.parseErrors.push(`${key}: ${e.message}`); continue; }
    const { required, optional } = placeholderInfo(en[key]);
    const allowed = new Set([...required, ...optional]);
    const unknown = have.filter(p => !allowed.has(p));
    const lost = required.filter(p => !have.includes(p));
    if (unknown.length) out.placeholderErrors.push(`${key}: unknown placeholder ${unknown.map(p => `{${p}}`).join(', ')} (English has ${[...allowed].map(p => `{${p}}`).join(', ') || 'none'})`);
    if (lost.length) out.placeholderErrors.push(`${key}: missing placeholder ${lost.map(p => `{${p}}`).join(', ')}`);
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'templates', 'locales', 'blocklists'].includes(e.name)) walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
/** Keys used in code: literal first arguments of t(), tr(), E(), req.t(), tHtml(t, ...), plus rateLimit(..., 'key') and ternaries inside t(). */
export function codeKeys(root = ROOT) {
  const files = [...walk(path.join(root, 'server')), ...walk(path.join(root, 'public/js'))];
  const used = new Map(); const prefixes = new Set(); const mentioned = new Set(); const clientScope = [];
  const KEY = /^[a-z][\w-]*(\.[\w-]+)+$/;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    // A browser module only gets the strings under js.app and js.<its own name> (see server/views/layout.js).
    const client = rel.startsWith(path.join('public', 'js'));
    const own = client ? path.basename(f, '.js') : null;
    const add = k => {
      if (!KEY.test(k)) return;
      if (!used.has(k)) used.set(k, rel);
      if (client && !k.startsWith('js.app.') && !(own !== 'i18n' && k.startsWith(`js.${own}.`))) clientScope.push([k, rel]);
    };
    for (const m of src.matchAll(/\b(?:t|tr|E|req\.t|tReq\(req\))\(\s*([^)]{0,200})/g)) {
      // the first argument, including both branches of a simple ternary
      for (const s of m[1].matchAll(/'([a-z][\w.-]*)'/g)) add(s[1]);
    }
    for (const m of src.matchAll(/tHtml\(\s*\w+,\s*'([a-z][\w.-]*)'/g)) add(m[1]);
    for (const m of src.matchAll(/rateLimit\([^)]*?'([a-z][\w-]*\.[\w.-]+)'\)/g)) add(m[1]);
    for (const m of src.matchAll(/`([a-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g)) prefixes.add(m[1]);
    for (const m of src.matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'/g)) mentioned.add(m[1]); // keys passed around as values
  }
  return { used, prefixes, mentioned, clientScope };
}

/** Everything at once. -> { en, enErrors, locales: [checkLocale...], unknownInCode: [[key, file]], unused: [key], badNotes: [key], clientScope: [[key, file]] } */
export function checkAll({ dir = path.join(HERE, 'locales'), root = ROOT } = {}) {
  const en = loadLocale(DEFAULT_LOCALE, dir);
  const enErrors = [];
  for (const [k, v] of Object.entries(en)) { try { parse(v); } catch (e) { enErrors.push(`${k}: ${e.message}`); } }
  const locales = CODES.filter(c => c !== DEFAULT_LOCALE).map(c => checkLocale(c, en, loadLocale(c, dir)));
  const { used, prefixes, mentioned, clientScope } = codeKeys(root);
  const unknownInCode = [...used].filter(([k]) => !(k in en));
  const unused = Object.keys(en).filter(k => !used.has(k) && !mentioned.has(k) && ![...prefixes].some(p => k.startsWith(p)));
  const notesFile = path.join(HERE, 'notes.json');
  const notes = fs.existsSync(notesFile) ? readJson(notesFile) : {};
  const badNotes = Object.keys(notes).filter(k => !k.startsWith('_') && !(k in en));
  return { en, enErrors, locales, unknownInCode, unused, badNotes, clientScope };
}
