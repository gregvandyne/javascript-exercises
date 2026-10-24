// Seed: admin account (ADMIN_USERNAME / ADMIN_PASSWORD), the official "Magic Cups" builder, and the three featured games.
// Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q } from '../server/db.js';
import { config } from '../server/config.js';
import { createUser, getUserByName, setPassword } from '../server/auth.js';
import { importGame } from './import-game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The launch games, imported in this order (the first featured one becomes the home-page hero).
export const SEED_GAMES = ['shark-plank', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'castle-clash', 'brick-drop', 'word-hunt', 'sum-racer', 'munch-maze', 'word-peek'];
export function seed({ quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  let admin = getUserByName(config.adminUsername);
  if (!admin) {
    const pw = config.adminPassword || crypto.randomBytes(9).toString('base64url');
    admin = createUser({ username: config.adminUsername, password: pw, displayName: 'Admin', role: 'admin', avatar: '🛡️', color: '#152036' });
    say(`Created admin "${config.adminUsername}"${config.adminPassword ? '' : ` with password: ${pw}  (set ADMIN_PASSWORD to choose one)`}`);
  } else {
    if (admin.role !== 'admin') q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
    if (config.adminPassword) setPassword(admin.id, config.adminPassword);
  }
  // The official account was called BRBGaming, then MagicCup, before the site became Magic Cups: rename it in place so its games keep their owner.
  if (!getUserByName('MagicCups')) {
    const legacy = getUserByName('MagicCup') || getUserByName('BRBGaming');
    if (legacy) q.run("UPDATE users SET username='MagicCups' WHERE id=?", legacy.id);
  }
  let official = getUserByName('MagicCups');
  if (!official) { official = createUser({ username: 'MagicCups', password: crypto.randomBytes(24).toString('hex'), displayName: 'Magic Cups', avatar: '🎮', color: '#2f6bff' }); say('Created the official Magic Cups builder account'); }
  q.run("UPDATE users SET display_name='Magic Cups', bio='Official games from the Magic Cups team.' WHERE id=?", official.id);
  const dir = path.join(ROOT, 'seed-games');
  for (const f of SEED_GAMES) {
    const g = importGame(path.join(dir, `${f}.html`), path.join(dir, `${f}.json`), official.id);
    say(`  ✓ ${g.title}  /g/${g.slug}`);
  }
  return { admin, official };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { seed(); console.log('Seed done.'); }
