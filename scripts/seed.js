// Seed: admin account (ADMIN_USERNAME / ADMIN_PASSWORD), the official "Magic Cup" builder, and the three featured games.
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
export const SEED_GAMES = ['shark-plank', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'castle-clash'];
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
  // The official account was called BRBGaming before the site became Magic Cup: rename it in place so its games keep their owner.
  const legacy = getUserByName('BRBGaming');
  if (legacy && !getUserByName('MagicCup')) q.run("UPDATE users SET username='MagicCup' WHERE id=?", legacy.id);
  let official = getUserByName('MagicCup');
  if (!official) { official = createUser({ username: 'MagicCup', password: crypto.randomBytes(24).toString('hex'), displayName: 'Magic Cup', avatar: '🎮', color: '#2f6bff' }); say('Created the official Magic Cup builder account'); }
  q.run("UPDATE users SET display_name='Magic Cup', bio='Official games from the Magic Cup team.' WHERE id=?", official.id);
  const dir = path.join(ROOT, 'seed-games');
  for (const f of SEED_GAMES) {
    const g = importGame(path.join(dir, `${f}.html`), path.join(dir, `${f}.json`), official.id);
    say(`  ✓ ${g.title}  /g/${g.slug}`);
  }
  return { admin, official };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { seed(); console.log('Seed done.'); }
