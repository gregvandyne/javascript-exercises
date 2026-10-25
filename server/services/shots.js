// Cover pictures for Studio games: a real screenshot of each version, taken in the background by snapshot.js.
// - Every new Builder version is queued; a sweeper also picks up published versions that have no picture yet
//   (including games made before this existed) and retries failures a couple of times.
// - Pictures live in <dataDir>/shots/<versionId>.jpg; game_versions.shot_at says when one was taken (0 = none).
// - Cards show the PUBLISHED version's picture to players (never an unreviewed update); My games shows the draft's.
// - Launch (seed) games keep their hand-made covers in public/covers.
import fs from 'node:fs';
import path from 'node:path';
import { q, now } from '../db.js';
import { config } from '../config.js';
import * as snapshot from './snapshot.js';
import { log } from './log.js';

export const DIR = path.join(config.dataDir, 'shots');
const MAX_TRIES = 3;
const SWEEP_MS = 120_000;
const queue = new Set();
const cache = new Map();   // versionId -> shot_at (0 = none)
let working = false, sweeper = null, firstSweep = null;

export const fileFor = versionId => path.join(DIR, `${String(versionId).replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);

/** When this version's picture was taken (0 = none). Cached; cheap enough for every card. */
export function shotAt(versionId) {
  if (!versionId) return 0;
  if (cache.has(versionId)) return cache.get(versionId);
  const r = q.get('SELECT shot_at FROM game_versions WHERE id=?', versionId);
  const v = r ? r.shot_at || 0 : 0;
  if (cache.size > 5000) cache.clear();
  cache.set(versionId, v);
  return v;
}
/** The picture URL for a version, or null. */
export const urlFor = versionId => { const at = shotAt(versionId); return at ? `/shots/${versionId}.jpg?v=${at.toString(36)}` : null; };

/** Ask for a picture of this version (no-op when screenshots are off or it already has one). */
export function queueShot(versionId) {
  if (!snapshot.enabled() || !versionId || shotAt(versionId)) return;
  queue.add(versionId);
  setImmediate(work);
}

async function work() {
  if (working) return;
  working = true;
  try {
    while (queue.size) {
      const id = queue.values().next().value; queue.delete(id);
      try { await takeShot(id); } catch (e) { log('warn', 'cover picture failed', { version: id, error: String(e.message || e).split('\n')[0] }); }
    }
  } finally { working = false; }
}

/** Photograph one version now. Returns true when a picture was saved. */
export async function takeShot(versionId) {
  const v = q.get('SELECT v.id, v.html, v.safety_status, v.shot_at, v.shot_tries, g.id AS game_id, g.title, g.orientation, g.source, g.status FROM game_versions v JOIN games g ON g.id=v.game_id WHERE v.id=?', versionId);
  if (!v || v.shot_at || v.shot_tries >= MAX_TRIES || v.source === 'seed' || v.status === 'deleted' || v.safety_status === 'fail') return false;
  try {
    const r = await snapshot.runGame(v.html, { size: 'cover', orientation: v.orientation === 'landscape' ? 'landscape' : 'portrait', title: v.title });
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(fileFor(v.id), snapshot.pickCover(r));
    const at = now();
    q.run('UPDATE game_versions SET shot_at=? WHERE id=?', at, v.id);
    cache.set(v.id, at);
    return true;
  } catch (e) {
    q.run('UPDATE game_versions SET shot_tries=shot_tries+1 WHERE id=?', v.id);
    log('warn', 'cover picture failed', { version: v.id, error: String(e.message || e).split('\n')[0] });
    return false;
  }
}

/** Queue pictures that are missing: live versions first, then drafts changed in the last day. */
export function sweep(limit = 6) {
  if (!snapshot.enabled()) return 0;
  const rows = q.all(`SELECT v.id FROM games g JOIN game_versions v ON v.id=g.published_version_id
      WHERE g.source!='seed' AND g.status!='deleted' AND v.shot_at=0 AND v.shot_tries<? AND v.safety_status!='fail' LIMIT ?`, MAX_TRIES, limit)
    .concat(q.all(`SELECT v.id FROM games g JOIN game_versions v ON v.id=g.current_version_id
      WHERE g.source!='seed' AND g.status!='deleted' AND v.shot_at=0 AND v.shot_tries<? AND v.safety_status!='fail' AND g.updated_at>? LIMIT ?`, MAX_TRIES, now() - 86400e3, limit));
  for (const r of rows) queueShot(r.id);
  return rows.length;
}

/** Start the background sweeper (server start only). */
export function startSweeper() {
  if (!snapshot.enabled() || sweeper) return;
  firstSweep = setTimeout(sweep, 20_000); firstSweep.unref();
  sweeper = setInterval(sweep, SWEEP_MS); sweeper.unref();
}
/** Stop queueing new pictures (shutdown). */
export function stopSweeper() { clearTimeout(firstSweep); clearInterval(sweeper); sweeper = null; queue.clear(); }
