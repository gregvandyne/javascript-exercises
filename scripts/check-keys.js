// Fails when a real-looking Stripe key or webhook secret is in the repository (docs/decisions.md "Paid plans", BP-11).
// Keys live only in the host's secret settings (Render dashboard), never in a file. Short dummies like rk_test_fake
// (used by tests) pass: a real key has 20+ characters after its prefix.
//   node scripts/check-keys.js            every tracked file
//   node scripts/check-keys.js --staged   what is about to be committed (scripts/hooks/pre-commit)
//   node scripts/check-keys.js a.js b.md  these files
// Turn the hook on once per clone: npm run hooks
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KEY_RE = /\b(?:[sr]k_(?:live|test)_|whsec_)[A-Za-z0-9]{20,}/g;
/** -> [{ line, kind }] for every key-looking string in text (the key itself is never returned or printed). */
export function findKeys(text) {
  const out = [];
  String(text).split('\n').forEach((l, i) => { for (const m of l.matchAll(KEY_RE)) out.push({ line: i + 1, kind: m[0].slice(0, m[0].startsWith('whsec_') ? 6 : 8) + '…' }); });
  return out;
}
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
/** -> [{ file, line, kind }] */
export function scan({ staged = false, files = null } = {}) {
  const names = files || (staged ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']) : git(['ls-files', '-z'])).split('\0').filter(Boolean);
  const hits = [];
  for (const f of names) {
    let text;
    try { text = staged ? git(['show', `:${f}`]) : fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;   // binary
    for (const h of findKeys(text)) hits.push({ file: f, ...h });
  }
  return hits;
}

// Run as a script? Real paths, not a hand-built file:// URL: a path with a space or non-ASCII letters is percent-encoded
// in import.meta.url, Windows paths differ and a symlinked path differs, and then the scan silently never ran.
const realOr = p => { try { return fs.realpathSync(p); } catch { return p; } };
export const isMain = (argv1 = process.argv[1]) => !!argv1 && realOr(fileURLToPath(import.meta.url)) === realOr(argv1);
if (isMain()) {
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  const files = args.filter(a => !a.startsWith('--'));
  const hits = scan({ staged, files: files.length ? files : null });
  for (const h of hits) console.error(`${h.file}:${h.line}: looks like a Stripe key (${h.kind}). Keys belong in the host's secret settings, never in a file.`);
  if (hits.length) { console.error('If a real key was ever committed or pushed, roll it now in the Stripe Dashboard (Developers → API keys).'); process.exit(1); }
}
