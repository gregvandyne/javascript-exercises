// Mistake Hunt's planter and checker on the server (docs/decisions.md "Mistake Hunt"). The one source is the pure block
// between proof-core:begin and proof-core:end in seed-games/mistake-hunt.html, the same code the game runs; it is read
// from that file once and run here in its own context (no DOM, no globals), so a saved set, a printed worksheet and its
// answer key are checked by exactly the rules that planted the mistakes. The game's word tables (its I18N block: the
// mistake types' names and why lines, the print's words, in 13 languages) come from the same file for the printout.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PAGE = path.join(ROOT, 'seed-games/mistake-hunt.html');

let src = null;
const page = () => (src ??= fs.readFileSync(PAGE, 'utf8'));
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); if (i < 0 || j < i) throw new Error(`mistake-hunt: ${a} not found`); return s.slice(i + a.length, j); };

let core = null;
/** The planter and checker (window.ProofCore in the game). */
export function proofCore() {
  if (core) return core;
  const box = { window: {} };
  vm.runInNewContext(between(page(), '/* proof-core:begin */', '/* proof-core:end */'), box, { timeout: 2000, filename: 'proof-core.js' });
  core = box.window.ProofCore;
  return core;
}

let words = null;
/** The game's word tables: { en: { key: text }, es: {...}, ... }. */
export function proofWords() {
  if (words) return words;
  const box = Object.create(null);
  vm.runInNewContext(`${between(page(), '// ==== I18N START ====', '// ==== I18N END ====')}\n;this.I18N = I18N;`, box, { timeout: 2000 });
  words = JSON.parse(JSON.stringify(box.I18N));
  return words;
}
/** A word from the game's tables in a language (as the game looks it up: the language, its base, then English). */
export function proofT(lang) {
  const W = proofWords(), chain = [W[lang], W[String(lang || '').split('-')[0]], W.en].filter(Boolean);
  return (k, v) => {
    let s = k; for (const t of chain) if (t[k] != null) { s = t[k]; break; }
    return v && typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? String(v[x]) : m)) : s;
  };
}
