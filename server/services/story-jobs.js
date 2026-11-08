// Story Builder jobs (docs/story-builder.md): the stories table is the queue. The web app adds a row (queued); the
// story worker (scripts/story-worker.js, its own process, one job at a time) claims the oldest one and walks it
// through the stages, saying where it is (progress 0..1) and that it is still alive (heartbeat). Every move between
// states goes through transition(), which only allows the moves in MOVES and only from the state the row is really in
// (UPDATE ... WHERE status=?), so two workers or a stale worker can't both move one job.
//
// Who sees a story: its owner always; the platform admin; anyone with the link once it is shared. A grown-up's or a
// teacher's story is shared when they say so. A kid's story asks first (share 'pending'): a grown-up linked to the
// kid's account (family) or a teacher of one of the kid's classes (or their school's admin) says yes, and only then can
// anyone else see it. They can see the pending story to decide. Nothing is listed publicly in this first version.
import fs from 'node:fs';
import path from 'node:path';
import { q, tx, now, uid, today, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup, getUser } from '../auth.js';
import * as F from './family.js';
import { isStaff, isPlatformAdmin, canManageStudent } from './schools.js';
import { optionsOf, choiceFields } from './story-options.js';

export const STATES = ['queued', 'writing', 'voicing', 'rendering', 'assembling', 'done', 'failed'];
export const ACTIVE = ['writing', 'voicing', 'rendering', 'assembling'];
/** The allowed moves. A running stage may also go back to 'queued' (its worker stopped; it runs again). */
export const MOVES = {
  queued: ['writing', 'failed'],
  writing: ['voicing', 'failed', 'queued'],
  voicing: ['rendering', 'failed', 'queued'],
  rendering: ['assembling', 'failed', 'queued'],
  assembling: ['done', 'failed', 'queued'],
  failed: ['queued'],
  done: [],
};
export const canMove = (from, to) => !!(MOVES[from] && MOVES[from].includes(to));
/** Tries before a job that keeps stopping is failed for good. */
export const MAX_ATTEMPTS = 3;
/** A running job whose worker hasn't said anything for this long is put back in the queue. */
export const STALE_MS = 10 * 60e3;
/** Failure codes the page explains (stories.error.<code>); anything else shows as 'other'. */
export const ERRORS = ['aiOff', 'refused', 'unsafe', 'invalid', 'aiFailed', 'voice', 'render', 'assemble', 'stalled', 'other'];

export const storyDir = id => path.join(config.dataDir, 'stories', String(id).replace(/[^A-Za-z0-9_-]/g, ''));
export const get = id => (id ? q.get('SELECT * FROM stories WHERE id=?', String(id)) || null : null);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const scriptOf = s => (s && s.script ? parse(s.script, null) : null);
export const metaOf = s => (s ? parse(s.meta || '{}', {}) : {});

// ---------------------------------------------------------------- limits
/** Grown-ups, school staff and the admin: may share straight away, and get more stories a day. */
export const adultOwner = u => !!u && !u.is_guest && (isGrownup(u) || isStaff(u) || isPlatformAdmin(u));
export const dailyLimit = u => (adultOwner(u) ? config.storyDailyLimit * 2 : config.storyDailyLimit);
/** Quick changes (words, voice, music, look: no Claude writing) a day. */
export const remakeLimit = u => (adultOwner(u) ? config.storyRemakeLimit * 2 : config.storyRemakeLimit);
const dayStart = (t = now()) => Date.parse(today(t) + 'T00:00:00Z');
/** New stories today, plus rewrites (a rewrite pays Claude like a new story, so it counts like one). */
export const usedToday = u => q.get('SELECT COUNT(*) n FROM stories WHERE owner_id=? AND created_at>=?', u.id, dayStart()).n
  + q.get("SELECT COUNT(*) n FROM story_edits WHERE owner_id=? AND kind='rewrite' AND created_at>=?", u.id, dayStart()).n;
export const remakesToday = u => q.get("SELECT COUNT(*) n FROM story_edits WHERE owner_id=? AND kind='remake' AND created_at>=?", u.id, dayStart()).n;
/** Waiting site-wide: new stories and changes. */
export const queueLength = () => q.get("SELECT COUNT(*) n FROM stories WHERE status='queued'").n + q.get("SELECT COUNT(*) n FROM stories WHERE remake_status='queued'").n;

/** The choice columns a story row has (story-options.js); validated by the caller (choiceFields / extraFields). */
const OPTION_COLS = ['style', 'tone', 'voice', 'music', 'look', 'characters', 'lesson'];

/**
 * A new story job. opts: { idea, ageBand, seconds, locale, style, tone, voice, music, look, characters, lesson } (already
 * checked by story-options choiceFields / extraFields). -> { ok: true, story } | { ok: false, code: 'guest' | 'limit' |
 * 'busy' } (the AI checks are the route's).
 */
export function create(u, { idea, ageBand = 'all', seconds = 60, locale = 'en', ...opts }) {
  if (!u || u.is_guest) return { ok: false, code: 'guest' };
  if (usedToday(u) >= dailyLimit(u)) return { ok: false, code: 'limit' };
  if (queueLength() >= config.storyQueueMax) return { ok: false, code: 'busy' };
  const id = uid(10), t = now();
  const o = Object.fromEntries(Object.entries({ ...optionsOf({}), characters: '', lesson: '', ...opts }).filter(([k]) => OPTION_COLS.includes(k)));
  q.run(`INSERT INTO stories(id, owner_id, idea, age_band, seconds, locale, status, created_at, updated_at, ${OPTION_COLS.join(', ')})
    VALUES (?,?,?,?,?,?,?,?,?,${OPTION_COLS.map(() => '?').join(',')})`,
  id, u.id, String(idea), ageBand, seconds, locale, 'queued', t, t, ...OPTION_COLS.map(k => String(o[k] ?? '')));
  return { ok: true, story: get(id) };
}

// ---------------------------------------------------------------- the state machine
/** Move a story from one state to another. -> true if it moved (false: not allowed, or not in `from` any more). */
export function transition(id, from, to, fields = {}) {
  if (!canMove(from, to)) return false;
  const sets = ['status=?', 'updated_at=?'], vals = [to, now()];
  for (const [k, v] of Object.entries(fields)) {
    if (!/^(progress|error|title|script|meta|worker|heartbeat_at|started_at|finished_at|attempts)$/.test(k)) throw new Error(`stories: ${k} can't be set here`);
    sets.push(`${k}=?`); vals.push(v);
  }
  return q.run(`UPDATE stories SET ${sets.join(', ')} WHERE id=? AND status=?`, ...vals, id, from).changes === 1;
}

/**
 * The worker takes the oldest waiting job: a queued story (it becomes 'writing', with this worker's name), or a change
 * to a finished story (its remake_status becomes 'working'; the story stays 'done' and keeps playing). Oldest first,
 * by when each was asked for. -> the story row or null (a change: remake_status 'working').
 */
export function claimNext(worker) {
  return tx(() => {
    const s = q.get("SELECT id, created_at at FROM stories WHERE status='queued' ORDER BY created_at, id LIMIT 1");
    const r = q.get("SELECT id, remake_at at FROM stories WHERE status='done' AND remake_status='queued' ORDER BY remake_at, id LIMIT 1");
    const t = now();
    if (r && (!s || r.at < s.at)) {
      const rm = remakeOf(get(r.id)) || {};
      rm.tries = (rm.tries || 0) + 1;
      const moved = q.run("UPDATE stories SET remake_status='working', remake=?, remake_progress=0, worker=?, heartbeat_at=?, updated_at=? WHERE id=? AND status='done' AND remake_status='queued'",
        JSON.stringify(rm), worker, t, t, r.id).changes;
      return moved ? get(r.id) : null;
    }
    if (!s) return null;
    if (!transition(s.id, 'queued', 'writing', { worker, heartbeat_at: t, started_at: t, progress: 0, error: '' })) return null;
    q.run('UPDATE stories SET attempts=attempts+1 WHERE id=?', s.id);
    return get(s.id);
  });
}
/** Progress (0..1, never backwards) and a heartbeat from the worker running it. */
export function progress(id, worker, p) {
  q.run('UPDATE stories SET progress=MAX(progress, ?), heartbeat_at=?, updated_at=? WHERE id=? AND worker=?', Math.max(0, Math.min(1, +p || 0)), now(), now(), id, worker);
}
export function fail(id, from, code) {
  return transition(id, from, 'failed', { error: ERRORS.includes(code) ? code : 'other', finished_at: now(), worker: '' });
}
/**
 * Put back jobs whose worker went quiet (crashed, restarted, the machine moved). On a worker's start-up with
 * { all: true } every running job is put back (there is one worker). After MAX_ATTEMPTS tries a job fails 'stalled'.
 * Changes being made are put back the same way (or fail 'stalled'; the finished video is never touched).
 * -> { requeued, failed }
 */
export function recover({ all = false, t = now() } = {}) {
  let requeued = 0, failed = 0;
  for (const s of q.all(`SELECT * FROM stories WHERE status IN (${ACTIVE.map(() => '?').join(',')})`, ...ACTIVE)) {
    if (!all && s.heartbeat_at && t - s.heartbeat_at < STALE_MS) continue;
    if (s.attempts >= MAX_ATTEMPTS) { if (fail(s.id, s.status, 'stalled')) failed++; }
    else if (transition(s.id, s.status, 'queued', { worker: '', progress: 0 })) requeued++;
  }
  for (const s of q.all("SELECT * FROM stories WHERE remake_status='working'")) {
    if (!all && s.heartbeat_at && t - s.heartbeat_at < STALE_MS) continue;
    if (((remakeOf(s) || {}).tries || 0) >= MAX_ATTEMPTS) { if (failRemake(s.id, 'stalled')) failed++; }
    else if (q.run("UPDATE stories SET remake_status='queued', remake_progress=0, worker='' WHERE id=? AND remake_status='working'", s.id).changes) requeued++;
  }
  return { requeued, failed };
}
/** The owner tries a failed story again (counts as a new story for the daily limit only when the AI wrote nothing). */
export function retry(u, s) {
  if (!s || s.owner_id !== u.id || s.status !== 'failed') return false;
  return transition(s.id, 'failed', 'queued', { error: '', progress: 0, attempts: 0 });
}
export function remove(u, s) {
  if (!s || (s.owner_id !== u.id && !isPlatformAdmin(u))) return false;
  if (ACTIVE.includes(s.status) || s.remake_status === 'working') return false;   // the worker is on it: wait until it is done or failed
  q.run('DELETE FROM stories WHERE id=?', s.id);
  try { fs.rmSync(storyDir(s.id), { recursive: true, force: true }); } catch { /* already gone */ }
  return true;
}

// ---------------------------------------------------------------- changing a finished story (docs/story-builder.md)
// A change never touches the finished video until the new one is ready: the story stays 'done' (it keeps playing, and
// keeps its sharing) while remake_status walks '' -> queued -> working -> '' (the new version swapped in) or 'failed'
// (the old video stays; the owner may try again or keep the old one). Kinds:
//   remake   new words (the owner's own edit, checked when asked), a new voice, new music or a new look: no Claude
//            writing; no new pictures except for a new look (every scene drawn again); STORY_REMAKE_LIMIT a day
//            (grown-ups and staff twice that)
//   rewrite  Claude writes it again from the current script and a short note (and maybe a new style or tone): counts
//            like a new story against STORY_DAILY_LIMIT; only scenes whose pictures changed are rendered again.
// When a kid's shared (or waiting) story changes, it asks for a yes again: the grown-up approved the old words.
export const remakeOf = s => (s && s.remake ? parse(s.remake, null) : null);
export const remaking = s => !!s && (s.remake_status === 'queued' || s.remake_status === 'working');
/** Failure codes for a change (stories.error.<code>; 'nothing': it would change nothing). */
export const REMAKE_CODES = ['notYours', 'notDone', 'busyEdit', 'limit', 'remakeLimit', 'busy'];

/**
 * The owner asks for a change. change: { kind: 'remake' | 'rewrite', script? (a remake's new words, already checked),
 * note? (a rewrite's request, already screened), options: { style, tone, voice, music, look } (already checked) }.
 * -> { ok: true } | { ok: false, code: one of REMAKE_CODES }
 */
export function requestRemake(u, s, change) {
  if (!u || u.is_guest || !s || s.owner_id !== u.id) return { ok: false, code: 'notYours' };
  if (s.status !== 'done') return { ok: false, code: 'notDone' };
  if (remaking(s)) return { ok: false, code: 'busyEdit' };
  const kind = change.kind === 'rewrite' ? 'rewrite' : 'remake';
  if (kind === 'rewrite' ? usedToday(u) >= dailyLimit(u) : remakesToday(u) >= remakeLimit(u)) return { ok: false, code: kind === 'rewrite' ? 'limit' : 'remakeLimit' };
  if (queueLength() >= config.storyQueueMax) return { ok: false, code: 'busy' };
  const t = now();
  const body = { kind, options: change.options || {}, ...(change.script ? { script: change.script } : {}), ...(change.note ? { note: change.note } : {}), tries: 0, at: t };
  return tx(() => {
    const moved = q.run("UPDATE stories SET remake=?, remake_status='queued', remake_progress=0, remake_error='', remake_at=?, updated_at=? WHERE id=? AND status='done' AND remake_status NOT IN ('queued', 'working')",
      JSON.stringify(body), t, t, s.id).changes;
    if (!moved) return { ok: false, code: 'busyEdit' };
    q.run('INSERT INTO story_edits(story_id, owner_id, kind, created_at) VALUES (?,?,?,?)', s.id, u.id, kind, t);
    audit(u.id, `story.${kind}`, s.id, { changes: Object.keys(change.options || {}).concat(change.script ? ['words'] : [], change.note ? ['note'] : []) });
    return { ok: true };
  });
}
/** A change's progress (0..1) and a heartbeat. */
export function remakeProgress(id, worker, p) {
  q.run("UPDATE stories SET remake_progress=MAX(remake_progress, ?), heartbeat_at=?, updated_at=? WHERE id=? AND worker=? AND remake_status='working'", Math.max(0, Math.min(1, +p || 0)), now(), now(), id, worker);
}
/** The worker stopped while making it (the site is shutting down): back in line. */
export const requeueRemake = id => q.run("UPDATE stories SET remake_status='queued', remake_progress=0, worker='' WHERE id=? AND remake_status='working'", id).changes === 1;
/** The change failed: the old video stays. */
export function failRemake(id, code) {
  return q.run("UPDATE stories SET remake_status='failed', remake_error=?, worker='', updated_at=? WHERE id=? AND remake_status IN ('queued', 'working')", ERRORS.includes(code) ? code : 'other', now(), id).changes === 1;
}
/** The owner tries a failed change again (no new count), or keeps the old version (the change is forgotten). */
export function retryRemake(u, s) {
  if (!s || !u || s.owner_id !== u.id || s.remake_status !== 'failed') return false;
  const rm = remakeOf(s) || {}; rm.tries = 0;
  return q.run("UPDATE stories SET remake_status='queued', remake=?, remake_error='', remake_progress=0, remake_at=?, updated_at=? WHERE id=? AND remake_status='failed'", JSON.stringify(rm), now(), now(), s.id).changes === 1;
}
export function dismissRemake(u, s) {
  if (!s || !u || s.owner_id !== u.id || s.remake_status !== 'failed') return false;
  return q.run("UPDATE stories SET remake_status='', remake='', remake_error='', remake_progress=0, updated_at=? WHERE id=? AND remake_status='failed'", now(), s.id).changes === 1;
}
/**
 * The new version is ready (its files are already in place): the row takes the new script, title, choices and
 * render numbers, the version goes up, and a kid's shared or waiting story asks for a yes again.
 * -> { ok, share } (false if it wasn't being made any more)
 */
export function finishRemake(id, { script, options = {}, meta = {} }) {
  const s = get(id);
  if (!s || s.remake_status !== 'working') return { ok: false };
  const o = choiceFields(options, optionsOf(s));
  const owner = getUser(s.owner_id);
  const share = s.share !== 'private' && !adultOwner(owner) ? 'pending' : s.share;
  const moved = q.run(`UPDATE stories SET script=?, title=?, style=?, tone=?, voice=?, music=?, look=?, meta=?, version=version+1, remake='', remake_status='',
      remake_progress=0, remake_error='', worker='', share=?, approved_by=?, approved_at=?, updated_at=? WHERE id=? AND remake_status='working'`,
  JSON.stringify(script), script.title, o.style, o.tone, o.voice, o.music, o.look, JSON.stringify(meta), share,
  share === s.share ? s.approved_by : null, share === s.share ? s.approved_at : null, now(), id).changes === 1;
  if (moved && share !== s.share) audit(s.owner_id, 'story.reshare', id, { from: s.share, to: share });
  return { ok: moved, share };
}

// ---------------------------------------------------------------- lists
const LIST = 'SELECT id, owner_id, idea, title, status, progress, error, share, created_at, finished_at, seconds FROM stories';
export const listMine = u => q.all(`${LIST} WHERE owner_id=? ORDER BY created_at DESC LIMIT 100`, u.id);
/** Stories waiting for this person's yes (they are a linked grown-up or a teacher of the owner). */
export function pendingFor(u) {
  if (!u || u.is_guest) return [];
  return q.all(`${LIST} WHERE share='pending' AND status='done' ORDER BY created_at DESC LIMIT 200`).filter(s => isApprover(u, s));
}

// ---------------------------------------------------------------- sharing
/** May u say yes to this kid's story? The admin; a grown-up linked to the owner; a teacher or school admin of theirs. */
export function isApprover(u, s) {
  if (!u || u.is_guest || !s || u.id === s.owner_id) return false;
  if (isPlatformAdmin(u)) return true;
  const link = F.linkOf(s.owner_id);
  if (link && isGrownup(u)) { const fam = F.familyById(link.family_id); if (fam && fam.owner_id === u.id) return true; }
  if (q.get(`SELECT 1 FROM class_members t JOIN class_members k ON k.class_id=t.class_id JOIN classrooms c ON c.id=t.class_id
      WHERE t.user_id=? AND t.role='teacher' AND t.status='active' AND k.user_id=? AND k.status='active' AND c.archived_at IS NULL`, u.id, s.owner_id)) return true;
  const owner = q.get('SELECT managed_school FROM users WHERE id=?', s.owner_id);
  return !!(owner && owner.managed_school && canManageStudent(u, owner.managed_school, s.owner_id));
}
/** May u watch it? */
export function canView(u, s) {
  if (!s) return false;
  if (u && (u.id === s.owner_id || isPlatformAdmin(u))) return true;
  if (s.status !== 'done') return false;
  if (s.share === 'shared') return true;
  return s.share === 'pending' && isApprover(u, s);
}
/** The owner shares: an adult's story is shared at once; a kid's asks for a yes. -> 'shared' | 'pending' | null */
export function share(u, s) {
  if (!s || s.owner_id !== u.id || s.status !== 'done' || s.share === 'shared') return null;
  const to = adultOwner(u) ? 'shared' : 'pending';
  q.run('UPDATE stories SET share=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?', to, to === 'shared' ? u.id : null, to === 'shared' ? now() : null, now(), s.id);
  audit(u.id, 'story.share', s.id, { to });
  return to;
}
export function unshare(u, s) {
  if (!s || (s.owner_id !== u.id && !isPlatformAdmin(u)) || s.share === 'private') return false;
  q.run("UPDATE stories SET share='private', approved_by=NULL, approved_at=NULL, updated_at=? WHERE id=?", now(), s.id);
  audit(u.id, 'story.unshare', s.id);
  return true;
}
/** A linked grown-up or teacher answers a kid's request. yes -> shared; no -> private again. */
export function decide(u, s, yes) {
  if (!s || s.share !== 'pending' || !isApprover(u, s)) return false;
  q.run('UPDATE stories SET share=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?', yes ? 'shared' : 'private', yes ? u.id : null, yes ? now() : null, now(), s.id);
  audit(u.id, yes ? 'story.approve' : 'story.decline', s.id, { owner: s.owner_id });
  return true;
}
