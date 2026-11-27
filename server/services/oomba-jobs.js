// Oomba's background jobs (docs/decisions.md "Oomba runs several jobs at once"). One answer that asks for several slow
// things ("a fractions worksheet, a lesson plan on it and a number-line board") starts a JOB for each make instead of
// running them one after another inside the answer: the answer comes back at once, and each job's card in the turn
// fills in when its job is done. The chat stays usable meanwhile (a job is not a turn: it never blocks a new message).
//
// - A job is a row in oomba_jobs (migration 0147): its kind, its input (already checked by the tool), its state
//   (queued | running | done | failed), its result or error. Only kinds a surface defined run (defineKind); the
//   companion defines the three makes (a worksheet, a lesson plan, a board): each MAKES a new thing the teacher owns.
//   Nothing that changes a class (assign, hand out, an action card) is ever a job: those keep the teacher's tap.
// - Jobs are created in the engine's transaction with Oomba's turn (enqueue inside the answer's apply()), so a turn that
//   fails starts none; they start right after it commits.
// - The runner: at most perTeacher jobs of one teacher at once and global in all (config OOMBA_JOBS_PER_TEACHER,
//   OOMBA_JOBS_MAX); the rest wait, oldest first. A kind's run() does the slow part (the AI) and returns apply(), which
//   writes (the same functions the inline tool used) and reads its result back; the runner runs apply(), ends the job and
//   updates its card in one transaction, only while this attempt is still the job's current one.
// - Restarts (single instance, like the chat engine): at boot recover() puts a running job back in the queue once; one
//   that already ran twice ends failed ('restart'). Try again on a failed card queues the same job again, once.
// - Kept: finished jobs JOBS_DAYS (the card keeps the result); everything goes with the account and with the chat.
import { q, db, now } from '../db.js';
import { config } from '../config.js';
import { getUser } from '../auth.js';
import { log } from './log.js';

export const LIMITS = Object.freeze({
  MAX_ATTEMPTS: 2,    // runs of one job, restarts included
  RETRIES: 1,         // Try again on a failed card
  PER_ANSWER: 6,      // jobs one answer may start
  QUEUE_MAX: 12,      // a teacher's jobs waiting or running at once
  JOBS_DAYS: 7,
});
export const perTeacher = () => Math.max(1, Math.floor(config.oombaJobsPerTeacher || 3));
export const globalMax = () => Math.max(1, Math.floor(config.oombaJobsMax || 6));
const DAY = 86400e3;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const LIVE = "('queued','running')";

/** Test hooks: gate(job) is awaited before a job's work (tests hold jobs running with it). */
export const hooks = { gate: null };

// ---------------------------------------------------------------- kinds
const kinds = new Map();
/**
 * A kind: { run(owner, input, job) -> Promise<{ apply() -> { ok: true, result, card } | { ok: false, code } } | { failed: code }> }
 *   card: what the turn's job card shows once done (the companion: { made }). Only MAKES: a kind never changes a class.
 */
export function defineKind(id, def) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id || '') || !def || typeof def.run !== 'function') throw new Error('a job kind needs an id and run()');
  kinds.set(id, def);
}
export const kindIds = () => [...kinds.keys()];

const row = id => q.get('SELECT * FROM oomba_jobs WHERE id=?', String(id || '')) || null;
export const get = row;
export const liveCount = ownerId => q.get(`SELECT COUNT(*) n FROM oomba_jobs WHERE owner_id=? AND state IN ${LIVE}`, ownerId).n;

// ---------------------------------------------------------------- the card in the turn's note
/** The job's card in its chat (the Oomba turn whose note.jobs holds it), merged with fields. Inside a transaction. */
function setCard(r, fields) {
  const chat = q.get('SELECT id, turns FROM oomba_chats WHERE id=?', r.chat_id); if (!chat) return false;
  const turns = parse(chat.turns, []);
  for (const t of turns) {
    const list = t.note && Array.isArray(t.note.jobs) ? t.note.jobs : null;
    const k = list ? list.findIndex(j => j.id === r.id) : -1;
    if (k < 0) continue;
    list[k] = { ...list[k], ...fields };
    q.run('UPDATE oomba_chats SET turns=? WHERE id=?', JSON.stringify(turns), chat.id);
    return true;
  }
  return false;
}
/** A card for a new job (what the turn's note.jobs gets). */
export const cardOf = (id, kind, title) => ({ id, kind, title: String(title || '').slice(0, 120), state: 'queued' });

// ---------------------------------------------------------------- starting
/**
 * Jobs of one answer, created in the caller's transaction (the engine's, with Oomba's turn): rows queued, and the
 * runner is woken once that transaction has committed. specs: [{ id, kind, input, title }] (id from cardOf).
 */
export function enqueue(ownerId, chatId, turnId, specs) {
  const t = now();
  for (const s of specs) {
    if (!kinds.has(s.kind)) throw new Error(`unknown job kind ${s.kind}`);
    q.run("INSERT INTO oomba_jobs(id, owner_id, chat_id, turn_id, kind, input, state, title, created_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
      s.id, ownerId, chatId, turnId || null, s.kind, JSON.stringify(s.input || {}), String(s.title || '').slice(0, 120), t);
  }
  setImmediate(pump);
}

// ---------------------------------------------------------------- the runner
const running = new Map();   // job id -> promise (this process)
export const busy = () => running.size;
/** Starts what may start now: oldest first, within the caps. */
export function pump() {
  if (running.size >= globalMax()) return;
  for (const r of q.all("SELECT id, owner_id FROM oomba_jobs WHERE state='queued' ORDER BY created_at, rowid LIMIT 200")) {
    if (running.size >= globalMax()) break;
    const mine = [...running.values()].filter(x => x.owner === r.owner_id).length;
    if (mine >= perTeacher()) continue;
    start(r.id);
  }
}
function end(id, attempt, fields, card) {
  return db.transaction(() => {
    const r = row(id); if (!r || r.state !== 'running' || r.attempt !== attempt) return false;
    q.run('UPDATE oomba_jobs SET state=?, result=?, error=?, ended_at=? WHERE id=?', fields.state, fields.result ? JSON.stringify(fields.result) : null, fields.error || null, now(), id);
    setCard(r, card);
    return true;
  })();
}
const failCard = code => ({ state: 'failed', error: String(code || 'error').slice(0, 40), at: now() });
function start(id) {
  const r0 = row(id); if (!r0 || r0.state !== 'queued' || running.has(id)) return;
  const attempt = r0.attempt + 1;
  const begun = db.transaction(() => {
    if (!q.run("UPDATE oomba_jobs SET state='running', attempt=?, started_at=? WHERE id=? AND state='queued'", attempt, now(), id).changes) return false;
    setCard(r0, { state: 'running' });
    return true;
  })();
  if (!begun) return;
  const entry = { owner: r0.owner_id, p: null };
  running.set(id, entry);
  entry.p = (async () => {
    const k = kinds.get(r0.kind), owner = getUser(r0.owner_id);
    if (!k || !owner) { end(id, attempt, { state: 'failed', error: 'error' }, failCard('error')); return; }
    if (hooks.gate) await hooks.gate(r0);
    const out = await k.run(owner, parse(r0.input, {}), r0);
    if (!out || out.failed) { end(id, attempt, { state: 'failed', error: (out && out.failed) || 'error' }, failCard((out && out.failed) || 'error')); return; }
    let res = null;
    try {
      res = db.transaction(() => {
        const r = row(id); if (!r || r.state !== 'running' || r.attempt !== attempt) return { gone: true };
        const a = out.apply ? out.apply() : null;
        if (!a || !a.ok) { q.run("UPDATE oomba_jobs SET state='failed', error=?, ended_at=? WHERE id=?", (a && a.code) || 'gone', now(), id); setCard(r, failCard((a && a.code) || 'gone')); return a || {}; }
        q.run("UPDATE oomba_jobs SET state='done', result=?, error=NULL, ended_at=? WHERE id=?", JSON.stringify(a.result || {}), now(), id);
        setCard(r, { state: 'done', ...(a.card || {}), at: now() });
        return a;
      })();
    } catch (e) {
      log('error', 'oomba job apply failed', { job: id, kind: r0.kind, error: e.message });
      end(id, attempt, { state: 'failed', error: 'error' }, failCard('error'));
      return;
    }
    if (res && !res.gone) log('info', 'oomba job ended', { job: id, kind: r0.kind, ok: !!res.ok, ms: now() - (row(id)?.started_at || now()) });
  })().catch(e => {
    log('error', 'oomba job failed', { job: id, error: e.message });
    try { end(id, attempt, { state: 'failed', error: 'error' }, failCard('error')); } catch { /* closed */ }
  }).finally(() => { if (running.get(id) === entry) running.delete(id); setImmediate(pump); });
}

// ---------------------------------------------------------------- the teacher's Try again
/** Try again on a failed card: the same job queued again, once. -> true | false */
export function retry(ownerId, jobId) {
  return db.transaction(() => {
    const r = row(jobId);
    if (!r || r.owner_id !== ownerId || r.state !== 'failed' || r.retried >= LIMITS.RETRIES) return false;
    if (!kinds.has(r.kind)) return false;
    q.run("UPDATE oomba_jobs SET state='queued', retried=retried+1, attempt=0, error=NULL, result=NULL, started_at=NULL, ended_at=NULL, created_at=? WHERE id=?", now(), r.id);
    setCard(r, { state: 'queued', error: null, retried: true });
    setImmediate(pump);
    return true;
  })();
}

// ---------------------------------------------------------------- restarts, waiting, cleanup
/** Boot, before any request: a running job goes back to the queue once; one that already ran MAX_ATTEMPTS times ends
 *  failed ('restart'). Then the queue starts. -> { requeued, stopped } */
export function recover() {
  const out = { requeued: 0, stopped: 0 };
  db.transaction(() => {
    for (const r of q.all("SELECT * FROM oomba_jobs WHERE state='running'")) {
      if (running.has(r.id)) continue;
      if (r.attempt < LIMITS.MAX_ATTEMPTS && kinds.has(r.kind)) { q.run("UPDATE oomba_jobs SET state='queued' WHERE id=?", r.id); setCard(r, { state: 'queued' }); out.requeued++; }
      else { q.run("UPDATE oomba_jobs SET state='failed', error='restart', ended_at=? WHERE id=?", now(), r.id); setCard(r, failCard('restart')); out.stopped++; }
    }
  })();
  if (out.requeued + out.stopped) log('info', 'recovered oomba jobs', out);
  setImmediate(pump);
  return out;
}
/** Every job running here, and any it starts, until none is left (tests). */
export async function idle() {
  for (let i = 0; i < 1000; i++) {
    pump();
    if (!running.size) { await new Promise(r => setImmediate(r)); pump(); if (!running.size) return; }
    await Promise.all([...running.values()].map(x => x.p));
  }
}
/** The promises of the jobs running now (tests). */
export const runningNow = () => [...running.keys()];
/** Finished jobs after JOBS_DAYS (the card keeps what was made). */
export function prune(t = now()) { q.run(`DELETE FROM oomba_jobs WHERE state NOT IN ${LIVE} AND ended_at<?`, t - LIMITS.JOBS_DAYS * DAY); }
export function forgetUser(userId) { q.run('DELETE FROM oomba_jobs WHERE owner_id=?', userId); }
/** Tests: forget the in-memory jobs. */
export function _reset() { running.clear(); }
