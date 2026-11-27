// Oomba's shared chat engine (docs/decisions.md "Figures: Oomba's chat and the shared chat engine"). One engine for every
// place a teacher talks to Oomba about what they have open: Figures worksheets now; the site-wide teacher companion next
// (the Manipulatives and Mistake Hunt chats can move onto it later). A place is a SURFACE (defineSurface): it says who may
// use it, what its context is (a worksheet), how a message is checked, what the AI is told and asked, and how an answer
// changes things and is undone. The engine does the rest, the same way for every surface:
//
// - A conversation per teacher, surface and context key (oomba_chats, migration 0107): the newest HISTORY turns as JSON.
// - Each message is a JOB (oomba_turns), in the Builder's and the manipulative drafts' pattern: the POST checks the words
//   (nothing is stored or sent when they fail), stores the message and returns at once; the answer is made in this process
//   apart from any request, so a refresh, a closed tab or a lost connection changes nothing; the page asks how it is going
//   and shows the same progress card again (the surface's steps, when each began, an estimate from the surface's own
//   timed turns). The one-live-turn rule is the surface's: one per teacher ('owner') or one per conversation ('chat'),
//   held by a partial unique index on live_key.
// - The answer is applied atomically: the surface's answer() does the slow part (the AI call, checking what it sent) and
//   returns an apply() that writes; the engine runs apply(), appends Oomba's turn and ends the job in one transaction, and
//   only while this attempt is still the job's current one. A failure is a calm turn (failed: 'resting' | 'timeout' |
//   'busy' | 'error' | 'restart' | a check's code) with Try again (the failed pair makes way for the same words again).
// - Undo: a change carries the surface's undo data on its turn (kept on the newest UNDO_KEPT changes only); undo() hands
//   it back to the surface, which puts back only what is still as Oomba left it. Only that call marks a change undone.
// - Checked work (services/verify-change.js): a surface's apply() reads back what it wrote and returns verify (the
//   turn's card shows what landed and what did not, with why) and, when the write landed other than the AI was told,
//   correction (the app's own words after Oomba's).
// - SINGLE INSTANCE, like the Builder: running jobs live in this process. At shutdown a running turn is marked interrupted
//   (handOff); at boot recover() runs a recent one again (once more) or ends it as failed ('restart').
// - Kept: the newest HISTORY turns per conversation; finished jobs JOBS_DAYS (for "finished while you were away"); a
//   conversation untouched KEEP_DAYS goes; everything goes with the account (forgetUser, and the users foreign keys) and
//   with its context (forgetKey: a deleted worksheet).
// - Privacy: the engine stores only the teacher's checked words, Oomba's replies and the surface's change summaries. What
//   goes to the AI is the surface's choice and the surface's responsibility (never student names or work).
import { q, db, uid, now } from '../db.js';
import { getUser } from '../auth.js';
import { log } from './log.js';
import { AI_CALL } from './ai-call.js';

export const ENGINE = Object.freeze({
  RESUME_WITHIN_MS: 10 * 60e3,   // an unfinished turn older than this is not run again at boot
  MAX_ATTEMPTS: 2,               // runs of one turn, restarts included
  JOBS_DAYS: 7,                  // finished jobs (the conversation keeps its turns)
  ETA_SAMPLE: 40, ETA_MIN: 10, ETA_WINDOW_DAYS: 30,
});
const LIVE_SQL = "('queued','running','interrupted')";
const DAY = 86400e3;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);

// ---------------------------------------------------------------- surfaces
const surfaces = new Map();
const DEFAULTS = { steps: ['check', 'ai', 'build', 'save'], live: 'owner', textMax: 1000, replyMax: 600, history: 30, historyToAi: 8, undoKept: 5, keepDays: 60, eta: { p50: 30e3, p75: 45e3 } };
/**
 * A surface: { id, steps?, live? 'owner'|'chat', textMax?, replyMax?, history?, historyToAi?, undoKept?, keepDays?, eta?,
 *   may(u) -> bool                                  who may use it at all (else 'notFound')
 *   context(u, key) -> object | null                the context the key names, only the teacher's own (else 'notFound')
 *   check(u, text, ctx) -> null | code              the words (word rules, names of the teacher's students)
 *   quote?(u, ctx, ref) -> { ref, n?, text } | null what a message quotes (built on the server from the context)
 *   answer({ user, ctx, key, text, quote, history, step, turnId }) -> Promise<{ reply, apply?() -> { change?, undo?, note? } } | { failed }>
 *   undo?(u, ctx, data) -> { ok, kept, skipped },
 *   clean?(u, text, ctx) -> text                     the words as kept and sent (the companion takes students' names out)
 *   meta?(u, ctx, body) -> object | null             what else a message carries, built on the server from the body
 *                                                    (the companion: the page it was sent from, an attached file)
 *   limits?(u) -> { history?, historyToAi? }         this teacher's own limits (the companion: their school's settings)
 *   prune?(t)                                        the surface's own cleanup instead of keepDays (per-school days) }
 * -> the surface
 */
export function defineSurface(def) {
  if (!def || !/^[a-z][a-z0-9-]{1,30}$/.test(def.id || '')) throw new Error('a surface needs an id');
  for (const f of ['may', 'context', 'check', 'answer']) if (typeof def[f] !== 'function') throw new Error(`surface ${def.id}: ${f}() is missing`);
  const s = { ...DEFAULTS, ...def };
  surfaces.set(s.id, s);
  return s;
}
export const surfaceOf = id => surfaces.get(id) || null;

// ---------------------------------------------------------------- reading
const jobsMap = new Map();   // turn job id -> promise (this process)
export const busy = () => jobsMap.size;
/** A job's promise while it runs here (tests wait on it), else a resolved one. */
export const settled = id => jobsMap.get(id) || Promise.resolve();
/** Every job running here (tests). */
export const allSettled = () => Promise.all([...jobsMap.values()]);
/** The longest a turn takes (ms): the AI's one budget and a margin for the other steps. */
export const longest = () => AI_CALL.timeoutMs + 30e3;

const chatRow = (u, sid, key) => q.get('SELECT * FROM oomba_chats WHERE owner_id=? AND surface=? AND ctx_key=?', u.id, sid, String(key)) || null;
const liveOf = chatId => q.get(`SELECT * FROM oomba_turns WHERE chat_id=? AND status IN ${LIVE_SQL}`, chatId) || null;
const job = id => q.get('SELECT * FROM oomba_turns WHERE id=?', String(id || '')) || null;

/** How long this surface's answers take: the newest timed ones (p50, p75 in ms) or the surface's first guess. */
export function eta(sid, t = now()) {
  const s = surfaceOf(sid);
  const rows = q.all(`SELECT ended_at - started_at ms FROM oomba_turns WHERE surface=? AND status='done' AND started_at IS NOT NULL AND ended_at>? AND attempt=1
    ORDER BY ended_at DESC LIMIT ${ENGINE.ETA_SAMPLE}`, sid, t - ENGINE.ETA_WINDOW_DAYS * DAY).map(r => r.ms).filter(x => x >= 0).sort((a, b) => a - b);
  if (rows.length < ENGINE.ETA_MIN) return { src: 'default', ...(s ? s.eta : DEFAULTS.eta), max: longest() };
  const at = p => rows[Math.min(rows.length - 1, Math.max(0, Math.ceil(p * rows.length) - 1))];
  return { src: 'data', p50: at(0.5), p75: at(0.75), max: longest() };
}

/** A surface's limits for one teacher (limits(u) over its own; a user or an id). */
function lim(s, who) {
  if (!s || typeof s.limits !== 'function') return s;
  const u = typeof who === 'string' ? getUser(who) : who;
  const l = u ? s.limits(u) || {} : {};
  return { ...s, ...(l.history ? { history: l.history } : {}), ...(l.historyToAi ? { historyToAi: l.historyToAi } : {}) };
}
/** The newest turns; undo data only on the newest undoKept changes. */
function trim(s, turns) {
  const out = turns.slice(-s.history);
  let kept = 0;
  for (let i = out.length - 1; i >= 0; i--) if (out[i].undo) { if (++kept > s.undoKept) { const { undo, ...rest } = out[i]; out[i] = rest; } }
  return out;
}
/** What the page gets: the turns (a change's undo data stays here: only whether it can be undone; a message's meta keys
 *  starting with "_" are the server's own, like the companion's placeholders' students), the turn running. */
const shownMeta = m => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('_')));
export function view(sid, row) {
  const s = surfaceOf(sid);
  if (!row) return { id: null, turns: [], pending: null };
  const turns = parse(row.turns, []).map(x => {
    const { undo, ...rest } = x;
    return { ...rest, ...(x.meta ? { meta: shownMeta(x.meta) } : {}), ...(x.change ? { change: { ...x.change, canUndo: !!undo && !x.change.undone } } : {}) };
  });
  const live = liveOf(row.id);
  const pending = live ? { id: live.id, me: live.me_id, step: live.step, steps: parse(live.steps, []), names: (s || DEFAULTS).steps, at: live.started_at || live.created_at, now: now(), eta: eta(sid) } : null;
  return { id: row.id, turns, pending };
}

/** The conversation the page shows. Seeing it also marks how its finished turns ended as seen (unless see: false, a
 *  page peeking in the background). -> { ok, chat } | fail */
export function current(u, sid, key, { see = true } = {}) {
  const s = surfaceOf(sid); if (!s || !u || !s.may(u)) return fail('notFound');
  const ctx = s.context(u, key); if (!ctx) return fail('notFound');
  const row = chatRow(u, sid, key);
  if (row && see) q.run("UPDATE oomba_turns SET seen_at=? WHERE chat_id=? AND status IN ('done','failed') AND seen_at IS NULL", now(), row.id);
  return ok({ chat: view(sid, row) });
}

/** Turns of this surface that ended while the teacher was away (not seen yet): newest first. -> [{ key, status, endedAt, error }] */
export function ready(u, sid, { limit = 3 } = {}) {
  if (!u) return [];
  return q.all(`SELECT c.ctx_key key, t.status, t.ended_at endedAt, t.error FROM oomba_turns t JOIN oomba_chats c ON c.id=t.chat_id
    WHERE t.owner_id=? AND t.surface=? AND t.status IN ('done','failed') AND t.seen_at IS NULL AND t.ended_at>? ORDER BY t.ended_at DESC LIMIT ?`,
  u.id, sid, now() - ENGINE.JOBS_DAYS * DAY, limit);
}
/** The teacher dismissed the "finished while you were away" notice of a context. */
export function dismiss(u, sid, key) {
  const row = u && chatRow(u, sid, key); if (!row) return fail('notFound');
  q.run("UPDATE oomba_turns SET seen_at=? WHERE chat_id=? AND status IN ('done','failed') AND seen_at IS NULL", now(), row.id);
  return ok();
}

// ---------------------------------------------------------------- sending
/** The checks before anything is stored or sent. -> { ok, s, ctx, text } | fail */
export function messageRequest(u, sid, key, text) {
  const s = surfaceOf(sid); if (!s || !u || !s.may(u)) return fail('notFound');
  const ctx = s.context(u, key); if (!ctx) return fail('notFound');
  let v = clip(text, s.textMax).replace(/\s+/g, ' ').trim();
  if (typeof s.clean === 'function') v = clip(s.clean(u, v, ctx), s.textMax).replace(/\s+/g, ' ').trim();
  if (!v) return fail('brief');   // one word sends ("Yes", "Assign it": the owner's live audit, 27 Nov 2026)
  const p = s.check(u, v, ctx); if (p) return fail(p);
  return ok({ s, ctx, text: v });
}

/**
 * A teacher's message: checked, stored, answered in the background. body: { text, quote?, retry? (the id of a failed
 * message whose words go again) }. -> { ok, chat } | fail ('chatBusy' this conversation is answering; 'otherBusy' with
 * key: another of theirs is, under a one-per-teacher rule)
 */
export function send(u, sid, key, body = {}) {
  const r = messageRequest(u, sid, key, body.text); if (!r.ok) return r;
  const { s, ctx } = r;
  prune();
  let row = chatRow(u, sid, key);
  if (!row) {
    try { q.run('INSERT INTO oomba_chats(id, owner_id, surface, ctx_key, turns, updated_at) VALUES (?,?,?,?,?,?)', uid(14), u.id, sid, String(key), '[]', now()); } catch { /* made meanwhile */ }
    row = chatRow(u, sid, key);
  }
  if (liveOf(row.id)) return fail('chatBusy');
  const liveKey = s.live === 'chat' ? `chat:${row.id}` : `${sid}:${u.id}`;
  const other = q.get(`SELECT c.ctx_key key FROM oomba_turns t JOIN oomba_chats c ON c.id=t.chat_id WHERE t.live_key=? AND t.status IN ${LIVE_SQL}`, liveKey);
  if (other) return fail('otherBusy', { key: other.key });
  const quote = body.quote && typeof s.quote === 'function' ? s.quote(u, ctx, body.quote) : null;
  const meta = typeof s.meta === 'function' ? s.meta(u, ctx, body) : null;
  if (meta && meta.code) return fail(meta.code);
  const retry = typeof body.retry === 'string' ? body.retry : '';
  const me = { id: uid(10), role: 'me', text: r.text, at: now(), ...(quote ? { quote } : {}), ...(meta ? { meta } : {}) };
  const jobId = uid(16);
  try {
    db.transaction(() => {
      const fresh = q.get('SELECT turns FROM oomba_chats WHERE id=?', row.id);
      const turns = parse(fresh.turns, []).filter(x => !retry || (x.id !== retry && x.for !== retry));
      turns.push(me);
      q.run('UPDATE oomba_chats SET turns=?, updated_at=? WHERE id=?', JSON.stringify(trim(lim(s, u), turns)), now(), row.id);
      q.run("INSERT INTO oomba_turns(id, chat_id, owner_id, surface, live_key, me_id, status, created_at) VALUES (?,?,?,?,?,?,'queued',?)", jobId, row.id, u.id, sid, liveKey, me.id, now());
      // A new message takes over from any earlier ending they haven't seen here.
      q.run("UPDATE oomba_turns SET seen_at=? WHERE chat_id=? AND status IN ('done','failed') AND seen_at IS NULL", now(), row.id);
    })();
  } catch {   // the unique index: another request of theirs got there first
    const again = liveOf(row.id); if (again) return fail('chatBusy');
    const o = q.get(`SELECT c.ctx_key key FROM oomba_turns t JOIN oomba_chats c ON c.id=t.chat_id WHERE t.live_key=? AND t.status IN ${LIVE_SQL}`, liveKey);
    return o ? fail('otherBusy', { key: o.key }) : fail('error');
  }
  run(jobId);
  return ok({ chat: view(sid, q.get('SELECT * FROM oomba_chats WHERE id=?', row.id)), turnId: jobId });
}

/** A turn the surface adds without the AI (Figures: "Add a starter set instead"): { reply, apply() } run like an
 *  answer, in one transaction. mark: { id, fields } changes an existing turn (the failed answer that offered it). me:
 *  { text, meta? } the teacher's own message before it (already checked by the surface: the companion's words added to a
 *  book being set up, which never go to the AI). */
export function addTurn(u, sid, key, { text = '', apply = null, mark = null, me = null } = {}) {
  const s = surfaceOf(sid); if (!s || !u || !s.may(u)) return fail('notFound');
  const ctx = s.context(u, key); if (!ctx) return fail('notFound');
  const row = chatRow(u, sid, key); if (!row) return fail('notFound');
  if (liveOf(row.id)) return fail('chatBusy');
  let out = fail('error');
  const ROLLBACK = new Error('rollback');
  try {
    db.transaction(() => {
      const turns = parse(q.get('SELECT turns FROM oomba_chats WHERE id=?', row.id).turns, []);
      if (mark) { const m = turns.find(x => x.id === mark.id); if (!m) { out = fail('notFound'); return; } Object.assign(m, mark.fields); }
      const a = (apply ? apply() : {}) || {};
      if (a.code) { out = fail(a.code); throw ROLLBACK; }
      if (me) turns.push({ id: uid(10), role: 'me', text: clip(me.text, s.textMax), at: now(), ...(me.meta ? { meta: me.meta } : {}) });
      turns.push({ id: uid(10), role: 'oomba', text: withCorrection(text, a.correction, s.replyMax), at: now(), ...(a.change ? { change: a.change } : {}), ...(a.undo ? { undo: a.undo } : {}), ...(a.note ? { note: a.note } : {}), ...(a.verify ? { verify: a.verify } : {}) });
      q.run('UPDATE oomba_chats SET turns=?, updated_at=? WHERE id=?', JSON.stringify(trim(lim(s, u), turns)), now(), row.id);
      out = ok();
    })();
  } catch (e) { if (e !== ROLLBACK) throw e; }
  return out.ok ? ok({ chat: view(sid, q.get('SELECT * FROM oomba_chats WHERE id=?', row.id)) }) : out;
}

/** Undo the change a turn made: the surface puts back only what is still as Oomba left it. -> { ok, chat, kept, skipped } */
export function undo(u, sid, key, turnId) {
  const s = surfaceOf(sid); if (!s || !u || !s.may(u) || typeof s.undo !== 'function') return fail('notFound');
  const ctx = s.context(u, key); if (!ctx) return fail('notFound');
  const row = chatRow(u, sid, key); if (!row) return fail('notFound');
  let out = fail('notFound');
  db.transaction(() => {
    const turns = parse(q.get('SELECT turns FROM oomba_chats WHERE id=?', row.id).turns, []);
    const t = turns.find(x => x.id === String(turnId || '') && x.change && x.undo && !x.change.undone);
    if (!t) return;
    const r = s.undo(u, ctx, t.undo); if (!r || !r.ok) { out = fail((r && r.code) || 'notFound'); return; }
    // Only the teacher's own Undo (this call) marks a change undone: the card says "Change undone." for nothing else.
    t.change = { ...t.change, undone: true, by: 'teacher', kept: r.skipped || 0 };
    delete t.undo;
    q.run('UPDATE oomba_chats SET turns=?, updated_at=? WHERE id=?', JSON.stringify(turns), now(), row.id);
    out = ok({ kept: r.skipped || 0 });
  })();
  return out.ok ? ok({ ...out, chat: view(sid, q.get('SELECT * FROM oomba_chats WHERE id=?', row.id)) }) : out;
}

// ---------------------------------------------------------------- one turn: the job
function setStep(id, attempt, step, t0) {
  const r = job(id); if (!r || r.status !== 'running' || r.attempt !== attempt) return false;
  const steps = parse(r.steps, []).slice(0, step); steps[step] = Math.max(0, now() - t0);
  q.run("UPDATE oomba_turns SET step=?, steps=? WHERE id=? AND status='running' AND attempt=?", step, JSON.stringify(steps), id, attempt);
  return true;
}
/** Oomba's words with the app's own correction after them (services/verify-change.js: what was written for real
 *  differed from what the AI was told), the correction never cut. */
const withCorrection = (reply, fix, max) => (fix ? `${clip(reply, Math.max(0, max - fix.length - 2)).trim()}\n\n${fix}`.trim() : clip(reply, max));
/** Ends a job with Oomba's turn, in one transaction with apply(); an apply() that throws is rolled back and the turn
 *  ends as failed. apply() may also return verify (the check after writing, shown on the turn's card) and correction
 *  (said after Oomba's words when the write landed other than the AI was told). -> true if this attempt was still the
 *  job's current one. */
function finish(id, attempt, s, { reply = '', apply = null, failed = null }) {
  const end = (why, a) => {
    const r = job(id); if (!r || r.status !== 'running' || r.attempt !== attempt) return false;
    const chat = q.get('SELECT * FROM oomba_chats WHERE id=?', r.chat_id); if (!chat) return false;
    const turns = parse(chat.turns, []);
    if (why) turns.push({ id: uid(10), role: 'oomba', text: '', failed: why, for: r.me_id, at: now() });
    else turns.push({ id: uid(10), role: 'oomba', text: withCorrection(reply, a.correction, s.replyMax), at: now(), ...(a.change ? { change: a.change } : {}), ...(a.undo ? { undo: a.undo } : {}), ...(a.note ? { note: a.note } : {}), ...(a.verify ? { verify: a.verify } : {}) });
    q.run('UPDATE oomba_chats SET turns=?, updated_at=? WHERE id=?', JSON.stringify(trim(lim(s, chat.owner_id), turns)), now(), chat.id);
    const steps = parse(r.steps, []), last = s.steps.length - 1;
    if (steps[last] === undefined || steps[last] === null) steps[last] = Math.max(0, now() - (r.started_at || now()));
    q.run('UPDATE oomba_turns SET status=?, error=?, step=?, steps=?, ended_at=? WHERE id=?', why ? 'failed' : 'done', why, last, JSON.stringify(steps), now(), id);
    return true;
  };
  if (!failed) {
    try { return db.transaction(() => { const r = job(id); if (!r || r.status !== 'running' || r.attempt !== attempt) return false; return end(null, (apply ? apply() : {}) || {}); })(); }
    catch (e) { log('error', 'oomba chat apply failed', { surface: s.id, turn: id, error: e.message }); failed = 'error'; }
  }
  return db.transaction(() => end(failed, {}))();
}

/** Runs a turn here (once per id at a time). -> its promise (never rejects). */
export function run(id) {
  if (jobsMap.has(id)) return jobsMap.get(id);
  const p = (async () => {
    const r0 = job(id);
    if (!r0 || !['queued', 'interrupted', 'running'].includes(r0.status)) return;
    const s = surfaceOf(r0.surface);
    const attempt = r0.attempt + 1, t0 = now();
    const begun = q.run(`UPDATE oomba_turns SET status='running', attempt=?, step=0, steps='[0]', started_at=? WHERE id=? AND status IN ${LIVE_SQL}`, attempt, t0, id).changes;
    if (!begun) return;
    if (!s) { finish(id, attempt, { ...DEFAULTS, id: r0.surface }, { failed: 'error' }); return; }
    const chat = q.get('SELECT * FROM oomba_chats WHERE id=?', r0.chat_id);
    const owner = getUser(r0.owner_id);
    const ctx = owner && chat && s.may(owner) ? s.context(owner, chat.ctx_key) : null;
    if (!ctx) { finish(id, attempt, s, { failed: 'notFound' }); return; }
    const turns = parse(chat.turns, []), me = turns.find(x => x.id === r0.me_id);
    if (!me) { finish(id, attempt, s, { failed: 'error' }); return; }
    // 1. check: the words again (a student may have joined a class since).
    const p0 = s.check(owner, me.text, ctx);
    if (p0) { finish(id, attempt, s, { failed: p0 }); return; }
    // 2. the AI, and the surface's own steps after it (step(n) moves the progress card).
    if (!setStep(id, attempt, 1, t0)) return;
    const history = turns.slice(0, turns.indexOf(me)).filter(x => !x.failed).slice(-lim(s, owner).historyToAi);
    const a = await s.answer({ user: owner, ctx, key: chat.ctx_key, text: me.text, quote: me.quote || null, meta: me.meta || null, meId: me.id, history, turnId: id, step: n => setStep(id, attempt, Math.min(n, s.steps.length - 1), t0) });
    if (!a || a.failed) { finish(id, attempt, s, { failed: (a && a.failed) || 'error' }); return; }
    setStep(id, attempt, s.steps.length - 1, t0);
    // The context may have gone meanwhile (a deleted worksheet): nothing to apply to.
    const still = s.context(owner, chat.ctx_key);
    finish(id, attempt, s, still ? { reply: a.reply, apply: a.apply } : { failed: 'notFound' });
  })().catch(e => {
    log('error', 'oomba chat turn failed', { turn: id, error: e.message });
    try {
      const r = job(id), s = r && surfaceOf(r.surface);
      if (r && r.status === 'running') finish(id, r.attempt, s || { ...DEFAULTS, id: r.surface }, { failed: 'error' });
    } catch { /* closed */ }
  }).finally(() => { jobsMap.delete(id); });
  jobsMap.set(id, p);
  return p;
}

// ---------------------------------------------------------------- restarts and cleanup
/** Shutdown: turns still running here are marked interrupted, for recover() at the next boot. -> how many. */
export function handOff() {
  let n = 0;
  for (const id of jobsMap.keys()) n += q.run("UPDATE oomba_turns SET status='interrupted' WHERE id=? AND status='running'", id).changes;
  return n;
}
/** Boot, before any request: a recent unfinished turn runs again (from the start: a turn is short); any other ends as
 *  failed ('restart'), and the chat offers Try again. */
export function recover(t = now()) {
  const out = { resumed: 0, stopped: 0 };
  for (const r of q.all(`SELECT * FROM oomba_turns WHERE status IN ${LIVE_SQL} ORDER BY created_at`)) {
    if (r.created_at > t - ENGINE.RESUME_WITHIN_MS && r.attempt < ENGINE.MAX_ATTEMPTS && surfaceOf(r.surface)) {
      q.run("UPDATE oomba_turns SET status='interrupted' WHERE id=?", r.id); run(r.id); out.resumed++;
    } else {
      q.run("UPDATE oomba_turns SET status='running' WHERE id=?", r.id);
      const s = surfaceOf(r.surface) || { ...DEFAULTS, id: r.surface };
      if (!finish(r.id, r.attempt, s, { failed: 'restart' })) q.run("UPDATE oomba_turns SET status='failed', error='restart', ended_at=? WHERE id=?", t, r.id);
      out.stopped++;
    }
  }
  if (out.resumed + out.stopped) log('info', 'recovered oomba chat turns', out);
  return out;
}
/** Finished jobs after JOBS_DAYS; conversations untouched for their surface's keepDays. */
export function prune(t = now()) {
  q.run(`DELETE FROM oomba_turns WHERE status NOT IN ${LIVE_SQL} AND ended_at<?`, t - ENGINE.JOBS_DAYS * DAY);
  for (const s of surfaces.values()) if (typeof s.prune === 'function') s.prune(t); else q.run(`DELETE FROM oomba_chats WHERE surface=? AND updated_at<? AND id NOT IN (SELECT chat_id FROM oomba_turns WHERE status IN ${LIVE_SQL})`, s.id, t - s.keepDays * DAY);
}
/** A context is gone (a deleted worksheet): its conversations and jobs go with it. */
export function forgetKey(sid, key) { q.run('DELETE FROM oomba_chats WHERE surface=? AND ctx_key=?', sid, String(key)); }
/** An account is deleted (services/account-delete.js through each surface's own forgetUser, and the foreign keys). */
export function forgetUser(userId) { q.run('DELETE FROM oomba_turns WHERE owner_id=?', userId); q.run('DELETE FROM oomba_chats WHERE owner_id=?', userId); }
/** Tests: forget the in-memory jobs. */
export function _reset() { jobsMap.clear(); }
