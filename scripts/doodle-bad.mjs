// Doodle Hoot: the game's own rude-word check for the trays it makes on its own (Guess Pip's doodles, pass and play; in
// Oomba Live the server makes every tray and checks it with services/textfilter.js). The game can't read the site's
// lists, so it carries a hash of every entry (BLOCK and every server/i18n/blocklists/*.txt, folded as the lists are):
// no rude word is written in the game file. This script writes that list between the doodle-bad markers in
// seed-games/doodle-hoot.html; tests/unit/doodle-core.test.js fails when the lists and the game drift apart.
//   node scripts/doodle-bad.mjs          (writes)      node scripts/doodle-bad.mjs --check   (exit 1 when out of date)
import fs from 'node:fs';
import path from 'node:path';
import { BLOCK, BLOCKLIST_DIR, parseBlocklist, foldForList } from '../server/services/textfilter.js';
import { GAME_FILE } from '../server/live/doodle-core.js';

/** FNV-1a over UTF-16 code units, base 36: the same as hash() in the game. */
export const hash = str => { let x = 0x811c9dc5; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); };
/** Every entry, folded, spaces taken out (a tray has none), 2 to 24 characters. */
export function entries() {
  const out = new Set(BLOCK.map(w => foldForList(w)));
  for (const f of fs.readdirSync(BLOCKLIST_DIR).filter(x => x.endsWith('.txt')).sort()) {
    for (const e of parseBlocklist(fs.readFileSync(path.join(BLOCKLIST_DIR, f), 'utf8')).words) out.add(e.w);
  }
  return [...out].map(w => w.replace(/\s+/g, '')).filter(w => w.length >= 2 && w.length <= 24);
}
export const hashes = () => [...new Set(entries().map(hash))].sort();
export const block = () => `/* doodle-bad:begin */\n  /* (written by scripts/doodle-bad.mjs) */\n  var BAD = '${hashes().join(' ')}';\n  /* doodle-bad:end */`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const html = fs.readFileSync(GAME_FILE, 'utf8');
  const re = /\/\* doodle-bad:begin \*\/[\s\S]*?\/\* doodle-bad:end \*\//;
  if (!re.test(html)) { console.error('doodle-bad markers missing'); process.exit(2); }
  const next = html.replace(re, block());
  if (process.argv.includes('--check')) { if (next !== html) { console.error('doodle-hoot.html: the rude-word hashes are out of date (node scripts/doodle-bad.mjs)'); process.exit(1); } console.log('ok'); }
  else { fs.writeFileSync(GAME_FILE, next); console.log(`${hashes().length} hashes`); }
}
