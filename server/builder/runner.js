// Builder builds run here, apart from any HTTP request: one Job per game, in this process.
// SINGLE INSTANCE: the jobs map and the live streams live in memory, and boot recovery treats every queued or running
// row as left behind by a dead process. Two app processes on one database would resume each other's builds (the
// unique live-row index stops a double run, not the confusion). Run exactly one instance; never overlap old and new
// processes on one disk (README "Deploy"). Several instances would need a shared queue, leases and sticky streams.
//
// A build: submit() -> builder_turns row (queued) -> Job -> agent.executeTurn (screen, charge + user entry, provider,
// final entry) -> done -> ended(). Every event leaves through job.emit: it fills the open segment (the reply so far),
// a small replay buffer (steps, cards, the open text) and every subscriber of the game's channel, tailored per viewer
// (version previews and turnsLeft are minted for each viewer). A page that subscribes mid-build gets hello (the build
// and its transcript entries), the replay, caughtup, then live events.
// A build ends exactly once (normal end, the time-cap backstop, a cancel, or the shutdown hand-off); after that
// job.emit is a no-op, tools refuse (the signal is aborted) and executeTurn's own end does nothing.
// Shutdown: drain() (no new builds, idle streams told to come back), then handOff() a few seconds before the grace ends:
// the reply so far and the Builder state are saved, the row is marked interrupted, and recover() carries it on at the
// next boot, once.
// Follow-ups: while a build runs, a new message from the builder who started it is screened like a first message, then
// stored as a transcript entry { followUp, status: 'waiting' } (the transcript is the queue). The provider takes waiting
// messages at its next round (between: 'reading'); they are 'read' once the model has answered that round (settle).
// Messages still waiting when the build ends start a follow-on build (one turn), or are dropped with a reason.
import { config } from '../config.js';
import * as games from '../services/games.js';
import { getUser } from '../auth.js';
import { register } from '../services/jobs.js';
import { log } from '../services/log.js';
import { audit, tx, today, uid } from '../db.js';
import { tEn, tFor } from '../i18n/index.js';
import * as turns from './turns.js';
import * as eta from './eta.js';
import { stepRecorder } from './steps.js';
import { previewUrl } from './tools.js';
import { restingUntil } from './anthropic.js';
import { turnsLeft, takeTurn, allowanceFor, limitMessage, counter } from './usage.js';
import { loadChat, appendChat, updateChat } from './chat.js';
import { getUpload, LIMITS as UPLOADS } from './uploads.js';
import { MAX_STEPS } from './claude.js';
import { executeTurn, endBuild, refundable, providerName, providerKind, hooks, MAX_INPUT } from './agent.js';
export { registerProvider } from './agent.js';

export const LIMITS = {
  backstopMs: 15e3,            // a build that ignores its abort is ended by the runner this long after it
  bufEntries: 400, bufBytes: 256 * 1024, segTextMax: 64 * 1024,   // the replay buffer
  subsPerGame: 8, subsPerUser: 12, slowBytes: 512 * 1024,           // live streams (live.js)
  handoffMs: 3000,             // the hand-off runs this long before the shutdown grace ends
  resumeWithinMs: 6 * 3600e3,  // older unfinished builds are not carried on at boot (the child has moved on)
  maxFollowUps: 3, maxRefused: 3, maxChain: 3,
  maxRoundsOnResume: 4,        // a resumed attempt gets at least this many model calls
  maxPerUser: 2,               // builds running at once per builder
};
const DEFAULT_LIMITS = { ...LIMITS };
/** draining: set by drain() at SIGTERM; new builds are refused (503 studio.api.restarting). */
export const life = { draining: false };

const jobs = new Map();       // gameId -> Job
const channels = new Map();   // gameId -> Set of subscribers
const CID = /^[A-Za-z0-9_-]{8,64}$/;
const CARDS = new Set(['ask', 'version', 'meta', 'notes', 'playtest']);
const NOT_COMPAT = new Set(['hello', 'caughtup', 'turn']);   // the streamed POST (old pages, runTurn) never gets these
const TEXT_SLACK = 8 * 1024;  // the open text is trimmed back to segTextMax once it is this far over (not every chunk)

export const isBusy = gameId => jobs.has(gameId) || !!turns.liveFor(gameId);
/** Builds running now (a shutdown waits for them, even when nobody is watching). */
export const busyCount = () => jobs.size;
export const jobFor = gameId => jobs.get(gameId) || null;

// ---------------------------------------------------------------------------------------------------- jobs
/** The AI money pool a charged row's message is paid from (builder_turns.charged_to): 'free', else 'paid'. */
export const poolOf = chargedTo => (chargedTo && chargedTo !== 'free' ? 'paid' : 'free');
function newJob(row, { attempt = row.attempt } = {}) {
  const t0 = Date.now();
  const request = row.request || {};
  const job = {
    id: row.id, gameId: row.game_id, userId: row.user_id, cid: request.cid || null, attempt, chain: row.chain || 0, t0,
    createdAt: row.created_at, request, pro: !!row.pro, locale: row.locale || 'en', base: row.base_version ?? null,
    ac: new AbortController(), timers: {}, phase: 'screening',
    buf: [], bytes: 0, textChars: 0, stepAt: new Map(),   // replay buffer
    seg: { text: '', events: [] }, lead: [],              // the open reply; lead = events the final entry starts with
    open: false, hold: null,                               // text is streaming; the follow-up the open reply goes before
    waiting: [], reading: [], fu: { accepted: 0, refused: 0 }, read: 0, waiters: [],   // follow-ups (see the header)
    accepting: Promise.resolve(), inflight: 0,             // follow-ups are accepted one at a time, in arrival order
    est: null, firstV: 0, versions: 0, state: null, usage: null, ctx: null, provider: providerKind(providerName(poolOf(row.charged_to))), pool: poolOf(row.charged_to),
    handedOff: false, ended: false, next: null,
  };
  job.screened = new Promise(r => { job.resolveScreened = r; });
  job.done = new Promise(r => { job.resolveDone = r; });
  job.emit = (name, data) => {
    if (job.ended || job.handedOff) return;
    capture(job, name, data); publish(job.gameId, name, data, job);
    if (name === 'version' && job.versions === 1) { const tl = eta.tail(job.est, job.firstV); if (tl) job.emit('eta', tl); }   // "Saved! Finishing up…"
  };
  job.steps = stepRecorder((n, d) => job.emit(n, d), t0);
  // Not unref'd: every way a build ends clears its timers, and a build must not be dropped because nothing else runs.
  job.timers.cap = setTimeout(() => cancel(job, 'timeout'), Math.max(1, config.builderTurnMaxMs));
  return job;
}
function start(job, opts) {
  setImmediate(() => {
    executeTurn(job, opts).catch(e => {
      log('error', 'builder turn failed', { turn: job.id, error: e.message });
      if (job.ended || job.handedOff) return;
      try { endBuild(job, { usage: { ...(job.usage || {}), error: e.message } }); } catch (e2) {
        log('error', 'builder turn could not end cleanly', { turn: job.id, error: e2.message });
        try { turns.finish(job.id, { status: 'failed', end: 'error', durationMs: Date.now() - job.t0 }); } catch { /* the database is gone */ }
        ended(job, { ok: false, error: 'error', turnsLeft: 0 });
      }
    });
  });
}
const clearTimers = job => { for (const k of Object.keys(job.timers)) clearTimeout(job.timers[k]); job.timers = {}; };
const fail = (t, status, key, code, vars) => ({ status, body: { error: t(key, vars), code }, code });
const wake = job => { const w = job.waiters.splice(0); for (const f of w) f(); };

/**
 * Start a build (or answer why not). opts: { user, game, text, pro, uploadIds, cid, continueOf, t, provider?, compat? }.
 * -> { status, body, code?, job? }: 202 with the job when a build started. compat: the streamed POST of old pages and
 * runTurn, which answers builder.errors.busy while the game is building. Steps 3-6 never await, so two requests at
 * once can never start two builds: the second one sees the first job.
 */
export async function submit({ user, game, text = '', pro = false, uploadIds = [], cid = null, continueOf = null, t = tEn, provider = null, compat = false }) {
  const err = (status, key, code, vars) => fail(t, status, key, code, vars);
  // 1. Checks, in the order the Builder always had.
  if (!user.builder_enabled) return err(403, 'builder.errors.disabled', 'disabled');
  text = String(text || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_INPUT);
  const wanted = (Array.isArray(uploadIds) ? uploadIds : []).slice(0, UPLOADS.perMessage).map(getUpload).filter(u => u && u.game_id === game.id && !u.used_at);
  if (!text && !wanted.length) return err(400, 'builder.errors.empty', 'empty');
  cid = typeof cid === 'string' && CID.test(cid) ? cid : null;
  // 2. Shutting down: the text goes back in the box.
  if (life.draining) return err(503, 'studio.api.restarting', 'restarting');
  // 3. One build per game. A retried first message (its reply was lost) gets that build, not a copy of itself; any other
  //    message while it runs is a follow-up (the streamed POST of old pages still answers "busy").
  const cur = jobs.get(game.id);
  if (cur) {
    if (cid && cid === cur.cid && !compat) return { status: 202, body: { ok: true, turn: { id: cur.id, status: cur.phase === 'screening' ? 'queued' : 'running' } }, job: cur, retried: true };
    if (compat) return err(409, 'builder.errors.busy', 'busy');
    return followUp(cur, { user, game, text, cid, wanted, pro, t, provider });
  }
  // A follow-up sent again after its build ended (its answer was lost): it was stored then, so it gets that answer.
  const had = cid && !compat && sent(game.id, cid, user.id); if (had) return had;
  return begin({ user, game, text, pro, wanted, cid, continueOf, t, provider, compat });
}
/** submit steps 3b-8: a new build for an idle game. prescreened: a follow-up's screening, when its build ended meanwhile. */
function begin({ user, game, text, pro, wanted, cid, continueOf, t, provider, compat, prescreened = null }) {
  const err = (status, key, code, vars) => fail(t, status, key, code, vars);
  // 3b. Builds no longer need an open tab: at most 2 at once per builder.
  let mine = 0; for (const j of jobs.values()) if (j.userId === user.id) mine++;
  if (mine >= LIMITS.maxPerUser) return err(429, 'builder.errors.tooMany', 'tooMany');
  // The site's AI budget is spent for today (or this month): no build at all (the simple building blocks would ask
  // questions it can't follow up on). Nothing is stored or charged; the page says when the AI is back, in local time.
  const allowance = allowanceFor(user);
  const until = provider ? null : restingUntil(allowance.pool);
  if (until) return { status: 503, body: { error: t('builder.errors.resting'), code: 'resting', resting: { until } }, code: 'resting' };
  // No turns left today: said before anything is stored, so the page puts the message back in the box (the charge
  // itself is still checked when screening passes). The streamed POST keeps its old order: screening first.
  if (!compat && allowance.left <= 0) return err(429, allowance.familyId ? 'builder.errors.limitToday' : 'builder.errors.limit', 'limit', { count: allowance.daily });
  // 4. "Carry on building": only the game's last build, only when it offers it, only once.
  let orig = null;
  if (continueOf) {
    orig = turns.lastEnded(game.id);
    if (!orig || orig.id !== String(continueOf) || !orig.can_continue || !orig.request.text) return err(409, 'studio.api.cantContinue', 'cantContinue');
  }
  // 5. The row (queued, not charged yet).
  let row;
  try {
    row = turns.create({ gameId: game.id, userId: user.id, request: { text, uploadIds: wanted.map(u => u.id), cid, ...(orig ? { continueOf: orig.id } : {}) }, locale: t.locale || 'en', pro });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return err(409, 'studio.api.builderWorking', 'builderWorking');
    throw e;
  }
  if (orig) turns.setContinue(orig.id, 0);
  // 6-7. The job; executeTurn starts on the next turn of the event loop, after the caller attached its subscriber.
  const job = newJob(row);
  job.provider = providerKind(provider || providerName(allowance.pool)); job.providerArg = provider;
  jobs.set(game.id, job);
  job.emit('turn', {});
  start(job, { user, game, text, pro, wanted, t, provider, continueOf: orig, prescreened });
  return { status: 202, body: { ok: true, turn: { id: job.id, status: 'queued' } }, job };
}

// ---------------------------------------------------------------------------------------------------- follow-ups
/** A message sent while the game builds. Accepted one at a time per build, in the order they arrived, so the transcript
 *  keeps that order and the caps are checked when each is stored. -> { status, body }. */
function followUp(job, o) {
  job.inflight++;
  const p = job.accepting.then(() => accept(job, o)).catch(e => {
    log('error', 'builder follow-up failed', { turn: job.id, error: e.message });
    return fail(o.t, 500, 'studio.api.wentWrong', 'error');
  }).finally(() => { job.inflight--; });
  job.accepting = p.then(() => {}, () => {});
  return p;
}
async function accept(job, o) {
  const early = check(job, o); if (early) return early;
  // A message sent while the first one is still being screened waits for it, so it lands after it in the chat.
  await job.screened;
  const s = o.screened || await hooks.screen(o.text, { t: o.t });
  // The build may have ended, been handed off or carried on into a new build during the two awaits.
  if (life.draining) return fail(o.t, 503, 'studio.api.restarting', 'restarting');
  const cur = jobs.get(o.game.id);
  if (!cur) return begin({ ...o, continueOf: null, compat: false, prescreened: s });   // it ended: this message is the next build
  // A newer build (carried on, or started by another message, maybe still screening): join it like any follow-up, after
  // its screening. If it ends before that, this message is the next build (above), screened only once.
  if (cur !== job) return followUp(cur, { ...o, screened: s });
  return check(cur, o) || store(cur, o.user, o.text, o.cid, s);
}
/** Who may add to this build, and how many more. -> an answer, or null to go on. */
function check(job, { user, cid, wanted, t }) {
  if (job.userId !== user.id) return fail(t, 409, 'builder.followUps.notYours', 'notYours');   // an admin can't spend a child's turns
  if (wanted.length) return fail(t, 409, 'builder.followUps.noUploads', 'uploads');
  const had = cid && sent(job.gameId, cid, job.userId, job); if (had) return had;            // a retry: no second screening
  if (job.fu.accepted >= LIMITS.maxFollowUps) return fail(t, 429, 'builder.followUps.cap', 'cap', { max: LIMITS.maxFollowUps });
  if (job.fu.refused >= LIMITS.maxRefused) return fail(t, 429, 'builder.followUps.refusedCap', 'refusedCap');
  return null;
}
const leftFor = job => Math.max(0, LIMITS.maxFollowUps - job.fu.accepted);
/** The follow-up already stored with this cid (its answer was lost), as it was answered then. job: the running build. */
function sent(gameId, cid, userId, job = null) {
  const msgs = loadChat(gameId).messages;
  const k = msgs.findIndex(m => m.followUp && m.cid === cid); if (k < 0) return null;
  const m = msgs[k];
  if (m.refused) return { status: 200, body: { refused: { message: (msgs[k + 1] && msgs[k + 1].refused && msgs[k + 1].text) || '', suggestion: '' } } };
  return { status: 200, body: { followUp: { id: m.id, cid, status: m.status }, left: job ? leftFor(job) : 0, turnsLeft: turnsLeft(userId) } };
}
/** Store a screened follow-up (synchronous, so its place in the transcript is exact). s: the screening result. */
function store(job, user, text, cid, s) {
  const at = Date.now();
  if (s && !s.ok) {
    // Refused: the kind reply (no idea chips: a chip tapped mid-build would be another follow-up). Never queued, never
    // sent to the model, no turn used.
    audit(user.id, 'builder.refused', job.gameId, { category: s.category, by: s.by, followUp: true, text: text.slice(0, 300) });
    job.fu.refused++;
    const id = uid(12); below(job, id);
    appendChat(job.gameId, job.userId, [
      { role: 'user', id, cid, text, at, followUp: true, refused: true, turn: job.id },
      { role: 'assistant', text: `${s.message} ${s.suggestion}`, at, refused: true, events: [], turn: job.id },
    ]);
    job.emit('inbox', { status: 'refused', cid, text, message: s.message, suggestion: s.suggestion });
    return { status: 200, body: { refused: { category: s.category, message: s.message, suggestion: s.suggestion } } };
  }
  job.fu.accepted++;
  const entry = { role: 'user', id: uid(12), cid, text, at, followUp: true, status: 'waiting', turn: job.id };
  below(job, entry.id);
  appendChat(job.gameId, job.userId, [entry]);
  job.waiting.push({ ...entry });
  job.emit('inbox', { status: 'waiting', entry, left: leftFor(job) });
  wake(job);
  return { status: 200, body: { followUp: { id: entry.id, cid, status: 'waiting' }, left: leftFor(job), turnsLeft: turnsLeft(user.id) } };
}
/** A follow-up (entry id) goes after the reply so far. In the middle of a sentence it waits below it instead, and the
 *  reply is written in front of it once the sentence ends (capture), so a sentence is never cut in two. */
function below(job, id) {
  if (!job.open) flush(job);
  else if (!job.hold) job.hold = id;
}
/** The reply so far goes into the transcript as a part (so a follow-up sits after what the builder saw when they sent
 *  it), and its text and cards leave the replay buffer (steps and estimates stay). */
function flush(job) {
  const text = job.seg.text.trim();
  if (text || job.seg.events.length) {
    appendChat(job.gameId, job.userId, [{ role: 'assistant', text, at: Date.now(), events: [...job.lead, ...job.seg.events], part: true, turn: job.id }], { before: job.hold });
    job.lead = [];
  }
  job.seg = { text: '', events: [] }; job.hold = null;
  job.buf = job.buf.filter(e => e[0] === 'step' || e[0] === 'eta');
  job.bytes = job.buf.reduce((n, e) => n + e[2], 0); job.textChars = 0;
}
/** Change follow-up entries in the transcript (an undefined value removes that field). */
function mark(gameId, ids, patch) {
  updateChat(gameId, ms => {
    for (const m of ms) {
      if (!m.followUp || !ids.has(m.id)) continue;
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete m[k]; else m[k] = v; }
    }
  });
}
/** Tests: store a follow-up as if its screening had just passed (s), so a test picks the checkpoint it reaches. */
export function _acceptScreened(gameId, user, text, cid = null, s = { ok: true }) {
  const job = jobs.get(gameId); if (!job) return null;
  return check(job, { user, cid, wanted: [], t: tEn }) || store(job, user, String(text).trim().slice(0, MAX_INPUT), cid, s);
}

/**
 * The one hook into a provider's loop (ctx.between), at the top of every round (the building blocks: at the start and
 * after each pass): stop when the build was aborted, the game deleted, the builder banned or their Builder turned off;
 * otherwise hand over the follow-ups waiting now (they become 'reading'). waitMs (the building blocks in tests and
 * demos only): wait up to this long for a follow-up when none is waiting. -> { stop: reason | null, add: [entries] }.
 */
export async function between(job, round, { waitMs = 0 } = {}) {
  if (job.ac.signal.aborted) return { stop: String(job.ac.signal.reason), add: [] };
  const g = games.getGame(job.gameId);
  if (!g || g.status === 'deleted') { cancel(job, 'deleted'); return { stop: 'deleted', add: [] }; }
  const u = getUser(job.userId);
  if (!u || u.banned) { cancel(job, 'banned'); return { stop: 'banned', add: [] }; }
  if (!u.builder_enabled) { cancel(job, 'disabled'); return { stop: 'disabled', add: [] }; }
  if (!job.waiting.length && waitMs > 0) {
    await new Promise(r => { const tm = setTimeout(r, waitMs); job.waiters.push(() => { clearTimeout(tm); r(); }); });
    if (job.ac.signal.aborted) return { stop: String(job.ac.signal.reason), add: [] };
  }
  if (job.ended || job.handedOff) return { stop: 'stopped', add: [] };
  const add = job.waiting.splice(0);
  if (add.length) {
    job.reading.push(...add);
    mark(job.gameId, new Set(add.map(e => e.id)), { status: 'reading', round, readTurn: job.id });
    job.emit('inbox', { status: 'reading', ids: add.map(e => e.id), n: round });
    // A change takes a little longer. Round 1's messages were there when the estimate was made (a follow-on or resumed
    // build's own messages), so they don't move it.
    const m = round > 1 && eta.onFollowUp(job.est, Date.now() - job.t0); if (m) job.emit('eta', m);
  }
  return { stop: null, add };
}
/** ctx.settle(): the model answered the round that carried what between() handed over, so it really read them. A round
 *  that fails never settles: its messages go back to waiting at the end (dropped, or read again after a restart). */
export function settle(job) {
  if (!job.reading.length || job.ended || job.handedOff) return;
  const done = job.reading.splice(0);
  mark(job.gameId, new Set(done.map(e => e.id)), { status: 'read', by: job.provider });
  job.read += done.length;
  job.emit('inbox', { status: 'read', ids: done.map(e => e.id) });
}

/** What a build sees as history, on a first run, a follow-on build and a resume alike: every entry that is not its own. */
export const historyFor = (job, messages) => (messages || []).filter(m => m.turn !== job.id && m.readTurn !== job.id);

/** The build ended (agent.endBuild, after 'done'; job.end says how). Synchronous from 'done' to the carry-over
 *  decision, so no follow-up slips in between. result: what runTurn resolves to. */
export function ended(job, result) {
  if (job.ended) return;
  job.phase = 'ending'; job.ended = true;
  clearTimers(job);
  if (jobs.get(job.gameId) === job) jobs.delete(job.gameId);
  job.resolveScreened(false); wake(job);
  // Handed to the model but never answered: not read. They wait again, in order, with the others.
  if (job.reading.length) job.waiting.unshift(...job.reading.splice(0));
  if (job.waiting.length) {
    try { carryOver(job); } catch (e) { log('error', 'builder follow-ups could not be carried over', { turn: job.id, error: e.message }); }
  }
  job.resolveDone(result);
}
/** Follow-ups still waiting at the end: a build that finished well starts the next build with them (one turn, at most
 *  maxChain in a row, only while the builder may still build); otherwise they are dropped, with why. */
function carryOver(job) {
  const list = job.waiting.splice(0); const ids = new Set(list.map(e => e.id));
  const end = job.end || 'error';
  const g = games.getGame(job.gameId), u = getUser(job.userId);
  // A refused first message doesn't stop the follow-ups that passed: they are the next build (spec decision 21).
  let why = end !== 'ok' && end !== 'refused' ? (end === 'error' ? 'error' : 'stopped')
    : job.chain >= LIMITS.maxChain ? 'chain'
    : !g || g.status === 'deleted' || !u || u.banned || !u.builder_enabled ? 'stopped' : null;
  let row = null;
  if (!why) {
    const day = today();
    row = tx(() => {
      const charge = takeTurn(job.userId, day, { pro: !!job.pro });
      return charge ? turns.create({ gameId: job.gameId, userId: job.userId, status: 'running', request: { followUpIds: [...ids] }, locale: job.locale, pro: job.pro,
        chain: job.chain + 1, attempt: 1, chargedDay: day, provider: job.provider, baseVersion: turns.newestVersion(job.gameId), startedAt: Date.now(),
        chargedTo: charge.source, weight: charge.weight }) : null;
    });
    if (!row) why = 'limit';
  }
  const clear = { round: undefined, readTurn: undefined, by: undefined };
  if (why) {
    mark(job.gameId, ids, { ...clear, status: 'dropped', why });
    publish(job.gameId, 'inbox', { status: 'dropped', ids: [...ids], why }, null);
    if (why === 'limit') publish(job.gameId, 'error', { message: limitMessage(job.userId, tFor(job.locale)), code: 'limit' }, null);
    return;
  }
  mark(job.gameId, ids, { ...clear, status: 'carried' });
  publish(job.gameId, 'inbox', { status: 'carried', ids: [...ids] }, null);
  // The next build: no screening (each message was screened when it arrived), no second charge; round 1 reads them.
  const next = newJob(row);
  next.phase = 'running'; next.resolveScreened(true);
  next.provider = job.provider; next.providerArg = job.providerArg;
  next.carried = list.length; next.lead = [['carried', { n: list.length }]];
  next.waiting = list.map(e => ({ ...e, status: 'carried' }));
  job.next = next; jobs.set(job.gameId, next);
  next.emit('turn', {});
  start(next, { user: u, game: g, pro: job.pro, t: tFor(job.locale), provider: job.providerArg, carried: true });
}
/** Resolves with the result of the build (and of the builds it carries on into) once the game is idle. */
export function idle(target) {
  const job = typeof target === 'string' ? jobs.get(target) : target;
  if (!job) return Promise.resolve(null);
  return job.done.then(r => (job.next ? idle(job.next) : r));
}

// ---------------------------------------------------------------------------------------------------- cancel
/** Stop a build (job or game id). reason: timeout | deleted | banned | disabled | stopped. Providers stop at their next
 *  await; if one doesn't within LIMITS.backstopMs, the runner ends the build itself. 'deleted' also tells every
 *  viewer (gone) and closes their streams. -> true when a running build was told to stop. */
export function cancel(target, reason = 'stopped') {
  const job = typeof target === 'string' ? jobs.get(target) : target;
  const gameId = typeof target === 'string' ? target : job && job.gameId;
  let hit = false;
  if (job && !job.ended && !job.handedOff) {
    if (!job.ac.signal.aborted) job.ac.abort(reason);
    wake(job);
    if (!job.timers.backstop) job.timers.backstop = setTimeout(() => backstop(job), LIMITS.backstopMs);
    hit = true;
  }
  if (reason === 'deleted' && gameId) { publish(gameId, 'gone', {}, job); closeAll(gameId, { live: true }); }
  return hit;
}
function backstop(job) {
  if (job.ended || job.handedOff) return;
  log('warn', 'builder turn ignored its stop: ended by the runner', { turn: job.id, reason: String(job.ac.signal.reason) });
  try { endBuild(job, { usage: job.usage || {} }); } catch (e) {
    log('error', 'builder turn could not end cleanly', { turn: job.id, error: e.message });
    ended(job, { ok: false, error: String(job.ac.signal.reason), turnsLeft: 0 });
  }
}

// ---------------------------------------------------------------------------------------------------- events
/** Does this event end the streaming text? Not the card's updates (stepinfo, eta), nor a follow-up arriving. */
const endsText = (name, d) => name !== 'text' && name !== 'stepinfo' && name !== 'eta' && !(name === 'inbox' && (d.status === 'waiting' || d.status === 'refused'));
function capture(job, name, data) {
  // The reply is saved in parts split where the page splits it (studio.js onEvent), so a reload shows what was seen:
  // text after a card starts a new part, and the sentence a follow-up interrupted ends first (below).
  if (name === 'text') { if (job.seg.events.length) flush(job); job.open = true; }
  else if (endsText(name, data)) { if (job.hold) flush(job); job.open = false; }
  if (name === 'text') job.seg.text += data.text || '';
  else if (name === 'error') job.seg.events.push(['error', { message: data.message }]);   // kept, so a redraw still says it
  else if (CARDS.has(name)) {
    job.seg.events.push([name, name === 'version' ? { ...data, preview: undefined } : data]);
    if (name === 'version') { job.versions++; if (!job.firstV) job.firstV = Math.max(1, Date.now() - job.t0); }
  }
  if (name === 'step') { const e = ['step', { ...data }]; job.stepAt.set(data.i, e); bufPush(job, e); }
  else if (name === 'stepinfo') {
    const e = job.stepAt.get(data.i);
    if (e) { const { i, ...f } = data; void i; Object.assign(e[1], f); const n = sizeOf(e); job.bytes += n - e[2]; e[2] = n; }
  } else if (name === 'text') bufText(job, data.text || '');
  else if (name === 'eta' || name === 'refused' || name === 'error') bufPush(job, [name, data]);
  else if (CARDS.has(name)) { const d = { ...data }; delete d.preview; bufPush(job, [name, d]); }
  trim(job);
}
const sizeOf = e => e[0].length + Buffer.byteLength(JSON.stringify(e[1]));
function bufPush(job, e) { e[2] = sizeOf(e); job.buf.push(e); job.bytes += e[2]; }
function bufText(job, s) {
  if (!s) return;
  const last = job.buf[job.buf.length - 1]; const n = Buffer.byteLength(s);
  if (last && last[0] === 'text') { last[1] = { text: last[1].text + s }; last[2] += n; } else job.buf.push(['text', { text: s }, n + 20]);
  job.bytes += n; job.textChars += s.length;
}
/** Bounded memory: the open text keeps its tail (with "…" in front); then the oldest text, then the oldest cards go.
 *  Step and eta entries are never dropped (the recorder caps steps at 80). */
function trim(job) {
  if (job.textChars > LIMITS.segTextMax + TEXT_SLACK) cutText(job, job.textChars - LIMITS.segTextMax);
  while ((job.buf.length > LIMITS.bufEntries || job.bytes > LIMITS.bufBytes) && dropOldest(job)) { /* keep dropping */ }
}
function cutText(job, n) {
  for (let k = 0; k < job.buf.length && n > 0;) {
    const e = job.buf[k];
    if (e[0] !== 'text') { k++; continue; }
    const s = e[1].text;
    if (s.length <= n + 1) { job.buf.splice(k, 1); job.bytes -= e[2]; job.textChars -= s.length; n -= s.length; continue; }
    let rest = s.slice(n + 1); if (/^[\udc00-\udfff]/.test(rest)) rest = rest.slice(1);   // never half a surrogate pair
    const kept = `…${rest}`; const size = Buffer.byteLength(kept) + 20;
    job.bytes += size - e[2]; job.textChars += kept.length - s.length; e[1] = { text: kept }; e[2] = size;
    n = 0;
  }
}
function dropOldest(job) {
  let k = job.buf.findIndex(e => e[0] === 'text');
  if (k < 0) k = job.buf.findIndex(e => e[0] !== 'step' && e[0] !== 'eta');
  if (k < 0) return false;
  const [e] = job.buf.splice(k, 1); job.bytes -= e[2]; if (e[0] === 'text') job.textChars -= e[1].text.length;
  return true;
}

/** One event for one viewer: version previews and turnsLeft are theirs (frame tokens are bound to the viewer). */
function tailor(name, data, sub, job) {
  if (name === 'version') {
    const v = games.getVersion(data.id); const g = v && games.getGame(v.game_id);
    return { ...data, preview: v && g ? previewUrl(v, g, sub.userId, sub.locale) : undefined };
  }
  if (name === 'done') return { ...data, ...counter(sub.userId) };
  if (name === 'turn') return publicTurn(job, sub);
  if (name === 'inbox' && data.left !== undefined && !(job && sub.userId === job.userId)) return { ...data, left: 0 };
  if (name === 'step' && sub.compat) { const { at, ...rest } = data; void at; return rest; }
  return { ...data };
}
function publish(gameId, name, data, job = jobs.get(gameId)) {
  const subs = channels.get(gameId); if (!subs || !subs.size) return;
  for (const sub of [...subs]) {
    if (sub.compat && NOT_COMPAT.has(name)) continue;
    if (name === 'turn' && !job) continue;
    try { sub.send(name, tailor(name, data, sub, job)); } catch (e) { log('warn', 'builder subscriber failed', { error: e.message }); detach(sub); }
  }
}
/** Close a game's subscribers (live streams; with live: false also the streamed POSTs of runTurn). */
function closeAll(gameId, { live = false } = {}) {
  const subs = channels.get(gameId); if (!subs) return;
  for (const sub of [...subs]) {
    if (live && sub.compat) continue;
    detach(sub);
    try { sub.close && sub.close(); } catch { /* already closed */ }
  }
}

/**
 * Subscribe to a game's builds. sub: { userId, locale, compat, send(name, data), close() }. A live subscriber gets, in
 * one synchronous run (so nothing is missed or sent twice): hello {now, turn}, the replay of the running build,
 * caughtup; then live events. It stays in the channel with or without a build, so the next build reaches it too.
 */
export function attach(gameId, sub) {
  const job = jobs.get(gameId);
  if (!sub.compat) {
    sub.send('hello', { now: Date.now(), turn: job ? publicTurn(job, sub) : null });
    if (job) for (const [n, d] of job.buf) if (!(job.hold && n === 'text')) sub.send(n, tailor(n, d, sub, job));   // held: in hello
    sub.send('caughtup', {});
  }
  let set = channels.get(gameId); if (!set) channels.set(gameId, (set = new Set()));
  set.add(sub); sub.gameId = gameId;
  return sub;
}
export function detach(sub) {
  const set = channels.get(sub.gameId); if (!set) return;
  set.delete(sub); if (!set.size) channels.delete(sub.gameId);
}
/** runTurn's compat subscriber: a function that gets the build's events (no hello/caughtup/turn) until the game is idle. */
export function attachFn(gameId, fn, { userId, locale = 'en' } = {}) {
  const job = jobs.get(gameId);
  const sub = { userId, locale, compat: true, send: (n, d) => fn(n, d), close: () => {} };
  if (!job) return sub;
  attach(gameId, sub);
  idle(job).then(() => detach(sub));
  return sub;
}

/** The running build as one viewer sees it (hello, turn, the Studio state). viewer: a subscriber or a user. */
export function publicTurn(target, viewer = null) {
  const job = typeof target === 'string' ? jobs.get(target) : target;
  if (!job) return null;
  const vid = viewer && (viewer.userId || viewer.id);
  const mine = !!vid && vid === job.userId;
  let entries = loadChat(job.gameId).messages.filter(m => m.turn === job.id);
  if (job.phase === 'screening' && !entries.some(m => m.role === 'user')) {
    const uploads = (job.request.uploadIds || []).map(getUpload).filter(Boolean).map(u => ({ id: u.id, name: u.name, kind: u.kind, mime: u.mime }));
    entries = [{ role: 'user', text: job.request.text || '', at: job.createdAt, uploads, turn: job.id }, ...entries];
  }
  if (job.hold) {
    // The sentence a follow-up came in the middle of is still streaming: it goes above that message (open: the page
    // streams on into it), and attach() leaves its text out of the replay.
    const k = entries.findIndex(m => m.id === job.hold);
    const text = job.buf.filter(e => e[0] === 'text').map(e => e[1].text).join('');
    entries.splice(k < 0 ? entries.length : k, 0, { role: 'assistant', text, at: Date.now(), events: [], part: true, open: true, turn: job.id });
  }
  return {
    id: job.id, attempt: job.attempt, chain: job.chain, carried: job.carried || 0, provider: job.provider, mine, cid: job.cid,
    elapsed: Date.now() - job.t0, entries, waiting: job.waiting.length, left: mine ? Math.max(0, LIMITS.maxFollowUps - job.fu.accepted) : 0,
  };
}
/** The game's last finished build: { id, end, refunded, cid, cont, putBack? }. putBack (the owner only): the text of a
 *  message that was never screened because the server kept stopping, until their next build starts. */
export function lastTurn(gameId, viewer = null) {
  const r = turns.lastEnded(gameId); if (!r) return null;
  const vid = viewer && (viewer.userId || viewer.id); const g = games.getGame(gameId);
  const out = { id: r.id, end: r.end_reason, refunded: !!r.refunded, cid: r.request.cid || null, cont: !!r.can_continue && !!r.request.text };
  if (r.started_at == null && r.status === 'failed' && r.end_reason === 'restart' && r.request.text && g && vid === g.owner_id
    && !jobs.has(gameId) && !turns.hasNewer(gameId, r)) out.putBack = r.request.text;
  return out;
}

// ---------------------------------------------------------------------------------------------------- shutdown
/** At SIGTERM: refuse new builds; streams of games with no running build are told to come back and closed (so the
 *  server can close); viewers of running builds stay, so a build that finishes inside the grace is seen live. */
export function drain() {
  life.draining = true;
  for (const gameId of [...channels.keys()]) if (!jobs.has(gameId)) { publish(gameId, 'restart', { retryMs: 5000, resume: false }, null); closeAll(gameId); }
}
/** A few seconds before the grace ends: save every running build for the next boot. Synchronous (better-sqlite3), so
 *  it is done before the database closes. -> the number of builds handed off. */
export function handOff() {
  const list = [...jobs.values()];
  for (const job of list) {
    job.handedOff = true; clearTimers(job);
    const resume = job.phase === 'screening' ? job.attempt < 1 : job.attempt < 2;
    try {
      // Still screening: the row stays queued and the next boot screens it again. Otherwise the reply so far (with the
      // Builder's state, so the resumed attempt remembers its questions and choices) goes into the transcript.
      if (job.phase !== 'screening') {
        const usage = job.usage || {}; const name = job.ctx && job.ctx.name;
        const rec = job.steps.record({ p: providerKind(name), ti: usage.tokensIn || 0, to: usage.tokensOut || 0, end: 'restart' });
        const text = job.seg.text.trim();
        const state = job.state ? { ...job.state } : undefined; if (state) delete state.scanFails;
        const entries = text || job.seg.events.length ? [{ role: 'assistant', text, at: Date.now(), events: [...job.lead, ...job.seg.events, ...(rec ? [['steps', rec]] : [])], turn: job.id, interrupted: true }] : [];
        if (entries.length || state) appendChat(job.gameId, job.userId, entries, { ...(state ? { state } : {}), before: job.hold });
        turns.interrupt(job.id, { durationMs: Date.now() - job.t0, modelCalls: rec ? rec.r : 0, versions: turns.versionsSince(job.gameId, job.base).length });
      }
    } catch (e) { log('error', 'builder hand-off failed', { turn: job.id, error: e.message }); }
    job.ac.abort('restart');
    if (jobs.get(job.gameId) === job) jobs.delete(job.gameId);
    job.resolveScreened(false); wake(job);
    publish(job.gameId, 'restart', { retryMs: 5000, resume }, job);
    closeAll(job.gameId);
    let left = 0; try { left = turnsLeft(job.userId); } catch { /* database closing */ }
    job.resolveDone({ ok: false, error: 'restart', turnsLeft: left });
  }
  return list.length;
}

// ---------------------------------------------------------------------------------------------------- boot recovery
/**
 * At boot, before listen: every unfinished row belongs to the process that stopped. A queued row (never charged) is
 * screened again, once; a running or interrupted row is carried on once, within 6 hours, on the same kind of Builder.
 * Otherwise it stops: the turn is given back when nothing was saved, and the chat offers "Carry on building".
 */
export function recover() {
  const out = { resumed: 0, rerun: 0, stopped: 0, cancelled: 0 };
  for (const row of turns.live()) {
    try {
      if (jobs.has(row.game_id)) continue;
      if (row.status === 'queued') {
        if (row.attempt >= 1) { giveUpQueued(row); out.stopped++; continue; }   // a second boot found it queued
        turns.bump(row.id);                                                    // counted before it runs
        if (runQueued({ ...row, attempt: row.attempt + 1 })) out.rerun++; else out.cancelled++;
        continue;
      }
      const g = games.getGame(row.game_id), u = getUser(row.user_id);
      const why = !g || g.status === 'deleted' ? 'deleted' : !u || u.banned ? 'banned' : !u.builder_enabled ? 'disabled'
        : row.attempt >= 2 ? 'restart'                                          // carried on once already
        : Date.now() - row.created_at > LIMITS.resumeWithinMs ? 'restart'
        : row.provider === 'ai' && providerName(poolOf(row.charged_to)) !== 'claude' ? 'ai'          // the AI is resting or its key is gone
        : null;
      if (why) { stopRow(row, why); out[why === 'restart' || why === 'ai' ? 'stopped' : 'cancelled']++; } else { resume(row, g, u); out.resumed++; }
    } catch (e) {
      log('error', 'builder recover failed', { turn: row.id, error: e.message });
      // Never leave a row unfinished with no job: the game would look busy for ever.
      if (!jobs.has(row.game_id)) try { turns.finish(row.id, { status: 'failed', end: 'error' }); } catch { /* the database is gone */ }
    }
  }
  if (out.resumed + out.rerun + out.stopped + out.cancelled) log('info', 'recovered Builder turns', out);
  return out;
}
function runQueued(row) {
  const g = games.getGame(row.game_id), u = getUser(row.user_id);
  const why = !g || g.status === 'deleted' ? 'deleted' : !u || u.banned ? 'banned' : !u.builder_enabled ? 'disabled' : null;
  if (why) { turns.finish(row.id, { status: 'cancelled', end: why }); dropUnread(row); return false; }   // never charged: nothing to give back
  const job = newJob(row);
  // Follow-ups stored while it was screening wait again (read in round 1, or carried on if it is refused now).
  job.waiting = followUpsOf(row).map(m => ({ ...m, status: 'waiting' }));
  job.fu.accepted = job.waiting.length;
  jobs.set(row.game_id, job);
  job.emit('turn', {});
  const wanted = (row.request.uploadIds || []).map(getUpload).filter(x => x && x.game_id === row.game_id && !x.used_at);
  const orig = row.request.continueOf ? turns.get(row.request.continueOf) : null;
  start(job, { user: u, game: g, text: row.request.text || '', pro: !!row.pro, wanted, t: tFor(row.locale), continueOf: orig });
  return true;
}
function giveUpQueued(row) {
  // Never screened, so never written as a user entry: the owner gets "Put it back in the box" (lastTurn.putBack).
  turns.finish(row.id, { status: 'failed', end: 'restart' });
  appendChat(row.game_id, row.user_id, [{ role: 'assistant', text: '', at: Date.now(), events: [['stopped', { why: 'restart' }]], turn: row.id }]);
  dropUnread(row);
}
function stopRow(row, why) {
  const versions = turns.versionsSince(row.game_id, row.base_version).length;
  const cancelled = why === 'deleted' || why === 'banned' || why === 'disabled';
  const status = cancelled ? 'cancelled' : 'failed', end = cancelled ? why : 'restart';
  turns.finish(row.id, { status, end, versions, durationMs: row.duration_ms || 0, canContinue: !cancelled && !!row.request.text });
  if (!cancelled) appendChat(row.game_id, row.user_id, [{ role: 'assistant', text: '', at: Date.now(), events: [['stopped', { why }]], turn: row.id }]);
  if (refundable(status, end, versions)) turns.refund(row.id);
  dropUnread(row);
}
/** A build that won't run again: its follow-ups not read yet are dropped (stopped), never left waiting. */
function dropUnread(row) {
  const unread = followUpsOf(row).filter(m => m.status !== 'read');
  if (unread.length) mark(row.game_id, new Set(unread.map(m => m.id)), { status: 'dropped', why: 'stopped', round: undefined, readTurn: undefined, by: undefined });
}
/** The follow-ups a build carries (a follow-on build's carried messages first), then every follow-up sent during it or
 *  handed to it that is read, being read or waiting, in transcript order, without duplicates. */
function followUpsOf(row) {
  const msgs = loadChat(row.game_id).messages.filter(m => m.followUp && !m.refused && m.id);
  const out = [], seen = new Set();
  const add = m => { if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); } };
  for (const id of row.request.followUpIds || []) add(msgs.find(m => m.id === id && m.status !== 'dropped'));
  for (const m of msgs) if ((m.readTurn === row.id || m.turn === row.id) && ['read', 'reading', 'waiting'].includes(m.status)) add(m);
  return out;
}
function resume(row, g, u) {
  const name = providerName(poolOf(row.charged_to));
  turns.resumeRow(row.id, providerKind(name));                              // the attempt is counted first
  const job = newJob(row, { attempt: row.attempt + 1 });
  job.provider = providerKind(name); job.phase = 'running'; job.resolveScreened(true);
  jobs.set(row.game_id, job);
  job.emit('turn', {});
  const cur = turns.newestVersion(row.game_id);
  job.steps.start('resume', cur ? { v: cur } : {});
  job.lead = [['resumed', cur ? { v: cur } : {}]];
  // Its follow-ups are read again in round 1 (the model's answer to them was cut off with the rest); the ones it
  // accepted still count against its cap.
  job.waiting = followUpsOf(row).map(m => ({ ...m }));
  job.fu.accepted = loadChat(row.game_id).messages.filter(m => m.followUp && !m.refused && m.turn === row.id).length;
  job.carried = row.chain ? (row.request.followUpIds || []).length : 0;
  const orig = row.request.continueOf ? turns.get(row.request.continueOf) : null;
  start(job, {
    user: u, game: g, text: row.request.text || '', pro: !!row.pro, t: tFor(row.locale),
    uploads: (row.request.uploadIds || []).map(getUpload).filter(x => x && x.game_id === row.game_id),
    resume: { versions: turns.versionsSince(row.game_id, row.base_version), ...(orig && orig.request.text ? { original: orig.request.text, cont: true } : {}) },
    maxRounds: Math.max(LIMITS.maxRoundsOnResume, MAX_STEPS - (row.model_calls || 0)),
  });
}

// ---------------------------------------------------------------------------------------------------- setup
let started = false;
/** Registers the retention job (call before services/jobs.startJobs). */
export function startRunner() {
  if (started) return; started = true;
  register('builder-turns-retention', 6 * 3600e3, () => turns.forget());
}
/** Tests: forget every job, stream and setting. */
export function _reset() {
  for (const job of jobs.values()) { clearTimers(job); job.handedOff = true; if (!job.ac.signal.aborted) job.ac.abort('stopped'); job.resolveScreened(false); job.resolveDone(null); }
  jobs.clear(); channels.clear(); life.draining = false;
  Object.assign(LIMITS, DEFAULT_LIMITS);
}
