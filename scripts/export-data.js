// Packs everything the site keeps on disk into one .tgz, for moving to a new host: a consistent copy of the database
// (taken while the site runs; turn on MAINTENANCE_MODE=1 first so nothing changes after it) plus cover pictures,
// profile photos and Builder uploads. The file is readable only by you (mode 600).
// Usage: node scripts/export-data.js [out.tgz]     default: <BRB_DATA_DIR>/move/oomba-data-<time>.tgz
// On the new host, unpack it into the EMPTY data folder: tar -xzf oomba-data-<time>.tgz -C /srv/oomba/data
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { db } from '../server/db.js';
import { config } from '../server/config.js';

// What this script creates (the folder, the copy, the archive) is private from the first byte, not chmodded later.
// (Set after the imports, so the live database's own files are opened as usual.)
process.umask(0o077);

const DATA = path.resolve(config.dataDir);
const FOLDERS = ['shots', 'avatars', 'uploads'].filter(d => fs.existsSync(path.join(DATA, d)));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(process.argv[2] || path.join(DATA, 'move', `oomba-data-${stamp}.tgz`));
fs.mkdirSync(path.dirname(out), { recursive: true });
const stage = fs.mkdtempSync(path.join(path.dirname(out), '.stage-'));
try {
  await db.backup(path.join(stage, 'brb.db'));
  // tar's second -C is relative to the first one, so both are absolute.
  execFileSync('tar', ['-czf', out, '-C', stage, 'brb.db', ...(FOLDERS.length ? ['-C', DATA, ...FOLDERS] : [])], { stdio: 'inherit' });
  fs.chmodSync(out, 0o600);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
// Hashed as a stream: the archive can be bigger than the memory a small server has.
const sha = await new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(out).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });
console.log(`Packed the database${FOLDERS.length ? ` and ${FOLDERS.join(', ')}` : ''} into ${out}`);
console.log(`Size: ${(fs.statSync(out).size / 1048576).toFixed(1)} MB   sha256: ${sha}`);
console.log('Check the sha256 on the new host (sha256sum <file>) after copying it.');
