// Online backup of the SQLite database (safe while the server is running).
// Usage: node scripts/backup.js [destDir]   (default: <BRB_DATA_DIR>/backups, keeps the newest 14)
import fs from 'node:fs';
import path from 'node:path';
import { db, DB_PATH } from '../server/db.js';
import { config } from '../server/config.js';

const dest = path.resolve(process.argv[2] || path.join(config.dataDir, 'backups'));
fs.mkdirSync(dest, { recursive: true });
const file = path.join(dest, `brb-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(file);
const all = fs.readdirSync(dest).filter(f => /^brb-.*\.db$/.test(f)).sort();
for (const f of all.slice(0, Math.max(0, all.length - 14))) fs.unlinkSync(path.join(dest, f));
console.log(`Backed up ${DB_PATH} -> ${file}`);
