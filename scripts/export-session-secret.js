// Copies the session secret into a local file that only you can read (mode 600), so a new host can use the same
// secret and nobody is signed out when the site moves. The secret is never printed or logged.
// Usage (on the old host, e.g. the Render shell):
//   node scripts/export-session-secret.js [outFile]      default: ./session-secret.txt (an existing file is not overwritten)
// Source: SESSION_SECRET when it is set, else the secret the app stored in the database (settings table).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const out = path.resolve(process.argv[2] || 'session-secret.txt');
let secret = process.env.SESSION_SECRET || '';
let source = 'the SESSION_SECRET variable';
if (!secret) {
  const dataDir = process.env.BRB_DATA_DIR || path.resolve('data');
  const file = process.env.BRB_DB && process.env.BRB_DB !== ':memory:' ? process.env.BRB_DB : path.join(dataDir, 'brb.db');
  let db;
  try { db = new Database(file, { readonly: true, fileMustExist: true }); } catch (e) { console.error(`Could not open the database ${file}: ${e.message}`); process.exit(1); }
  try { secret = (db.prepare("SELECT value FROM settings WHERE key='session_secret'").get() || {}).value || ''; } finally { db.close(); }
  source = `the database (${file})`;
}
if (!secret) { console.error('No session secret found: SESSION_SECRET is not set and the database has none (the app makes one on its first start).'); process.exit(1); }
try {
  fs.writeFileSync(out, secret + '\n', { mode: 0o600, flag: 'wx' });
  fs.chmodSync(out, 0o600);
} catch (e) {
  console.error(e.code === 'EEXIST' ? `${out} already exists: delete it or name another file.` : `Could not write ${out}: ${e.message}`);
  process.exit(1);
}
console.log(`Wrote the session secret from ${source} to ${out} (readable only by you).`);
console.log('Next: put its contents into the new host\'s secret store as SESSION_SECRET, then delete the file.');
