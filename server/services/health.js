// GET /health for load balancers, Docker and uptime monitors. 200 only when:
//   - the database answers a query that reads its file, and the file is still the one opened at start
//     (deleted or replaced under a running app, every write would go to a file that is gone);
//   - the data folder has free space and takes a new small file (written, then deleted: overwriting one fixed file
//     reuses its own block, so a full disk would go unnoticed);
//   - the server is not shutting down (so traffic moves away first).
// Otherwise 503. The file-system part runs one at a time, at most every CACHE_MS, within a time limit, so a flood of
// probes can't turn into a flood of writes and a hung network disk can't tie up every file-system thread.
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, DB_PATH } from '../db.js';
import { config } from '../config.js';
import { log } from './log.js';

/** Set by server/shutdown.js once SIGTERM arrives. */
export const lifecycle = { draining: false };

const LIMIT_MS = 2000, CACHE_MS = 2000;
/** Less free space than this counts as a full disk: 100 MB, or 2 % on a disk smaller than 5 GB. */
export const minFreeBytes = totalBytes => Math.min(100 * 1048576, totalBytes * 0.02);
/** File-system calls (tests replace them). */
export const _io = { statfs: p => fs.statfs(p), stat: p => fs.stat(p), writeFile: (p, d) => fs.writeFile(p, d), unlink: p => fs.unlink(p) };
/** The database file and its inode at start (null for the in-memory test database). */
export const _dbFile = { path: DB_PATH, ino: DB_PATH === ':memory:' ? null : (() => { try { return statSync(DB_PATH).ino; } catch { return null; } })() };

let running = null, cached = null, lastBad = '';
const within = (p, ms) => { let t; return Promise.race([p, new Promise(r => { t = setTimeout(r, ms, 'timeout'); })]).finally(() => clearTimeout(t)); };
const settle = p => p.then(() => '', e => e.message || String(e));

async function diskCheck(dir) {
  const st = await _io.statfs(dir);
  const free = st.bavail * st.bsize, total = st.blocks * st.bsize;
  if (free < minFreeBytes(total)) throw new Error(`disk full: ${(free / 1048576).toFixed(1)} MB free in ${dir}`);
  const f = path.join(dir, `.health-check-${crypto.randomBytes(6).toString('hex')}`);
  try { await _io.writeFile(f, String(Date.now())); } catch (e) { throw new Error(`${dir} takes no writes: ${e.code || e.message}`); }
  finally { await _io.unlink(f).catch(() => {}); }
}
async function dbFileCheck() {
  if (_dbFile.ino == null) return;
  let st;
  try { st = await _io.stat(_dbFile.path); } catch (e) { throw new Error(e.code === 'ENOENT' ? `the database file ${_dbFile.path} was deleted while the app runs: restart it` : e.message); }
  if (st.ino !== _dbFile.ino) throw new Error(`the database file ${_dbFile.path} was replaced while the app runs: restart it`);
}
// One run at a time; every probe that arrives meanwhile shares it.
function fileChecks(dir) {
  if (!running) {
    running = Promise.all([settle(dbFileCheck()), settle(diskCheck(dir))])
      .then(([dbFile, disk]) => (cached = { at: Date.now(), dir, dbFile, disk }))
      .finally(() => { running = null; });
  }
  return running;
}

/** -> { ok, db, disk, draining } where db/disk are 'ok' | 'error' | 'timeout'. */
export async function check({ limitMs = LIMIT_MS, cacheMs = CACHE_MS } = {}) {
  let db = 'ok', disk = 'ok', error = '';
  try { q.get('SELECT count(*) AS n FROM sqlite_master'); } catch (e) { db = 'error'; error = e.message; }
  const dir = config.dataDir;
  const r = cached && cached.dir === dir && Date.now() - cached.at < cacheMs ? cached : await within(fileChecks(dir), limitMs);
  if (r === 'timeout') { disk = 'timeout'; error ||= `no answer from ${dir} within ${limitMs} ms`; }
  else {
    if (r.dbFile) { db = 'error'; error ||= r.dbFile; }
    if (r.disk) { disk = 'error'; error ||= r.disk; }
  }
  const ok = db === 'ok' && disk === 'ok' && !lifecycle.draining;
  // Log changes only, not every probe.
  const bad = db === 'ok' && disk === 'ok' ? '' : `${db}/${disk}`;
  if (bad !== lastBad) { log(bad ? 'warn' : 'info', bad ? 'health check failing' : 'health check ok again', { db, disk, error }); lastBad = bad; }
  return { ok, db, disk, draining: lifecycle.draining };
}

/** Express handler. */
export async function handler(req, res) {
  const r = await check();
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.status(r.ok ? 200 : 503).json({ ...r, uptime: Math.round(process.uptime()) });
}
