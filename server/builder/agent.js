// One Builder build: screening -> turn limit (charge + the user's message saved + row running, in one transaction) ->
// provider agent loop (Claude or mock) -> final reply saved. It runs inside a runner Job (runner.js), apart from any
// HTTP request, so closing the page or signing out never stops it.
// Events (job.emit, see runner.js): text, ask, version, meta, notes, refused, step, stepinfo, playtest, error, done,
// plus turn (a build started) and restart (the server is restarting); step/stepinfo are the live build steps
// (steps.js), and 'done' carries their compact record when the build got past screening.
import * as games from '../services/games.js';
import { audit, tx, today } from '../db.js';
import { config } from '../config.js';
import { screenInput } from './screen.js';
import { takeTurn, turnsLeft } from './usage.js';
import { loadChat, appendChat } from './chat.js';
import { toolbox } from './tools.js';
import { takeForTurn } from './uploads.js';
import * as mock from './mock.js';
import * as claude from './claude.js';
import { resting } from './anthropic.js';
import { tEn } from '../i18n/index.js';
import * as turns from './turns.js';
import * as runner from './runner.js';
export { isBusy, busyCount } from './runner.js';

export const MAX_INPUT = 2000;
/** Which provider runs the Builder: Claude when a key is set, the mock otherwise (BRB_BUILDER_PROVIDER=mock forces the mock). */
export function providerName() {
  if (process.env.BRB_BUILDER_PROVIDER === 'mock' || !config.anthropicKey) return 'mock';
  if (resting()) return 'mock';   // the AI budget is spent for today or this month
  return 'claude';
}
/** What a provider is, for rows, records and the page: 'ai' or 'blocks' (never a model id). */
export function providerKind(name) { return name === 'claude' ? 'ai' : 'blocks'; }
const PROVIDERS = { mock, claude };
/** Tests: an extra provider (e.g. one that waits for the test before it goes on). */
export function registerProvider(name, impl) { PROVIDERS[name] = impl; }
/** Tests may replace the screening (e.g. to make it slow). */
export const hooks = { screen: (text, opts) => screenInput(text, opts) };

const STATUS = { ok: 'done', refused: 'done', limit: 'done', error: 'failed', timeout: 'failed', restart: 'failed', deleted: 'cancelled', banned: 'cancelled', disabled: 'cancelled', stopped: 'cancelled' };
export function statusOf(end) { return STATUS[end] || 'failed'; }
/** The refund rule: a build that ended badly for a server-side reason without saving a version gives its turn back
 *  (not for a ban, nor for an outside stop). */
export function refundable(status, end, versions) { return (status === 'failed' || status === 'cancelled') && end !== 'banned' && end !== 'stopped' && versions === 0; }
const uploadMeta = u => ({ id: u.id, name: u.name, kind: u.kind, mime: u.mime });

/**
 * Run one build inside its Job. opts: { user, game, text, pro, wanted (upload rows), t, prescreened?, resume?, uploads?,
 * continueOf? (the row of the build being carried on), provider?, maxRounds? }.
 * resume: { versions, original?, cont? } for an attempt carried on after a restart (no screening, no charge, no user
 * entry). t: the builder's language. Never throws for model errors (they are streamed as 'error').
 */
export async function executeTurn(job, { user, game, text = '', pro = false, wanted = [], t = tEn, prescreened = null, resume = null, uploads = [], continueOf = null, provider = null, maxRounds = null }) {
  const locale = t.locale || 'en';
  const emit = job.emit, steps = job.steps;
  job.ctx = { user, t, pro: !!pro, name: null };
  // Chosen after screening (the classifier can spend the last of the AI budget), and recorded on the row as it runs.
  let name = provider || providerName();
  if (!resume) {
    // 1. Screening, before any model sees the message.
    let s = prescreened;
    if (text && !s) { steps.start('screen'); s = await hooks.screen(text, { t }); }
    if (job.handedOff || job.ended) return;              // handed off while screening: the row stays queued
    if (job.ac.signal.aborted) return endUncharged(job, String(job.ac.signal.reason));
    if (s && !s.ok) {
      audit(user.id, 'builder.refused', game.id, { category: s.category, by: s.by, text: text.slice(0, 300) });
      emit('refused', { message: s.message, suggestion: s.suggestion, chips: s.chips, category: s.category });
      appendChat(game.id, user.id, [
        { role: 'user', text, at: Date.now(), refused: true, turn: job.id },
        { role: 'assistant', text: `${s.message} ${s.suggestion}`, at: Date.now(), refused: true, events: s.chips.length ? [['ask', { question: t('builder.refusals.tryThese'), options: s.chips }]] : [], turn: job.id },
      ]);
      return endUncharged(job, 'refused', { refused: s.category });
    }
    // 2. The daily turn limit. Charge, save the message and mark the build running in one transaction: from here the
    //    message is durable (a restart carries the build on).
    name = provider || providerName(); const day = today();
    const taken = tx(() => {
      if (!takeTurn(user.id, day)) return null;
      const ups = takeForTurn(game.id, wanted.map(u => u.id));
      appendChat(game.id, user.id, [{ role: 'user', text, at: Date.now(), uploads: ups.map(uploadMeta), turn: job.id }]);
      job.base = turns.newestVersion(game.id);
      turns.markRunning(job.id, { chargedDay: day, provider: providerKind(name), attempt: 1, baseVersion: job.base });
      return ups;
    });
    if (!taken) {
      emit('error', { message: t('builder.errors.limit', { count: config.builderDailyTurns }), code: 'limit' });
      return endUncharged(job, 'limit');
    }
    uploads = taken; job.attempt = 1; job.phase = 'running'; job.resolveScreened(true);
  }

  // 3. The agent loop. History is every transcript entry that is not this build's own (runner.historyFor).
  job.ctx.name = name; job.provider = providerKind(name);
  const chat = loadChat(game.id);
  const history = runner.historyFor(job, chat.messages);
  const state = { ...chat.state, scanFails: 0 }; job.state = state;
  const tb = toolbox({ user, gameId: game.id, emit, state, locale, steps, signal: job.ac.signal });
  // A Continue carries on an earlier build that stopped: the provider gets what it saved and its message.
  const carry = resume || (continueOf ? { versions: turns.versionsSince(game.id, continueOf.base_version), original: continueOf.request.text, cont: true } : null);
  let usage = { tokensIn: 0, tokensOut: 0, model: name };
  job.usage = usage;
  try {
    usage = { ...usage, ...(await PROVIDERS[name].run({
      user, game, text, pro: !!pro, history, uploads, state, tools: tb, emit, steps, signal: job.ac.signal, locale, t,
      between: (round, o) => runner.between(job, round, o), settle: () => runner.settle(job), pending: () => job.waiting.length,
      resume: carry, maxRounds,
    })) };
  } catch (e) {
    // An abort (time cap, delete, ban, hand-off) is not the Builder getting muddled.
    if (!job.ac.signal.aborted) emit('error', { message: t('builder.errors.muddled') });
    usage.error = e.message || String(e);
  }
  job.usage = usage;
  if (job.handedOff || job.ended) return;                // handed off, or already ended by the backstop
  endBuild(job, { usage });
}

/** A build that ended before it was charged (refused, no turns left, stopped while screening): no transcript reply. */
function endUncharged(job, end, extra = {}) {
  if (job.ended || job.handedOff) return;
  turns.finish(job.id, { status: statusOf(end), end, durationMs: Date.now() - job.t0 });
  const left = turnsLeft(job.userId);
  job.emit('done', { turnsLeft: left });
  runner.ended(job, { ok: false, ...(extra.refused ? { refused: extra.refused } : { error: end }), turnsLeft: left });
}

/**
 * The single end of a charged build (executeTurn, or the runner's backstop when a provider ignores its stop):
 * the final reply (with the steps record and the Builder state), the row, the refund rule, 'done', then runner.ended.
 * A second call, or a call after the hand-off, does nothing.
 */
export function endBuild(job, { usage = job.usage || {} } = {}) {
  if (job.ended || job.handedOff) return;
  const reason = job.ac.signal.aborted ? String(job.ac.signal.reason) : null;
  if (job.phase === 'screening') return endUncharged(job, STATUS[reason] ? reason : usage.error ? 'error' : 'stopped');
  const { t = tEn, pro = false, name = null } = job.ctx || {};
  const end = reason ? (STATUS[reason] ? reason : 'stopped') : usage.error ? 'error' : 'ok';
  const versions = turns.versionsSince(job.gameId, job.base).length;
  if (end === 'timeout') job.emit('text', { text: `${job.seg.text.trim() ? '\n\n' : ''}${t(versions ? 'builder.turnTimeout' : 'builder.turnTimeoutNothing')}` });
  if (end === 'disabled') job.emit('error', { message: t('builder.errors.disabled') });
  const state = job.state; if (state) delete state.scanFails;
  // The steps record (keys, numbers and the AI's short plan; no text) goes last, so a reload shows the same summary.
  const rec = job.steps.record({ p: providerKind(name), ti: usage.tokensIn || 0, to: usage.tokensOut || 0, end });
  const events = [...job.lead, ...job.seg.events, ...(rec ? [['steps', rec]] : [])];
  appendChat(job.gameId, job.userId, [{ role: 'assistant', text: job.seg.text.trim(), at: Date.now(), events, model: usage.model || name, pro: !!pro, turn: job.id, ...(job.attempt > 1 ? { resumed: true } : {}) }],
    { ...(state ? { state } : {}), tokensIn: usage.tokensIn || 0, tokensOut: usage.tokensOut || 0 });
  const status = statusOf(end);
  turns.finish(job.id, { status, end, versions, modelCalls: rec ? rec.r : 0, tokensIn: usage.tokensIn || 0, tokensOut: usage.tokensOut || 0, durationMs: Date.now() - job.t0, canContinue: end === 'timeout' && !!job.request.text });
  const refunded = refundable(status, end, versions) && turns.refund(job.id);
  const left = turnsLeft(job.userId);
  job.emit('done', { turnsLeft: left, ...(rec ? { steps: rec } : {}), ...(refunded ? { refunded: true } : {}), end });
  runner.ended(job, { ok: end === 'ok', ...(end === 'ok' ? {} : { error: end === 'error' ? usage.error : end }), turnsLeft: left });
}

/**
 * Run one build and wait for it: the streamed POST of pages loaded before builds ran on their own, and unit tests.
 * opts: { user, gameId, text, pro, uploadIds, emit, signal, provider, t, cid?, continueOf? }. emit gets every event of
 * the build (no hello/caughtup/turn) until the game is idle. A game that is already building answers
 * builder.errors.busy, exactly as before. Resolves to { ok, refused?, error?, turnsLeft }.
 */
export async function runTurn({ user, gameId, text = '', pro = false, uploadIds = [], emit = () => {}, signal = null, provider = null, t = tEn, cid = null, continueOf = null }) {
  const game = games.getGame(gameId);
  if (!game) { emit('error', { message: t('game.api.notFound') }); return { ok: false, error: 'not_found' }; }
  const r = await runner.submit({ user, game, text, pro, uploadIds, cid, continueOf, t, provider, compat: true });
  if (!r.job) {
    if (r.body && r.body.error) emit('error', { message: r.body.error });
    const left = turnsLeft(user.id); emit('done', { turnsLeft: left });
    return { ok: false, error: r.code, turnsLeft: left };
  }
  if (signal) {
    if (signal.aborted) runner.cancel(r.job, 'stopped');
    else signal.addEventListener('abort', () => runner.cancel(r.job, 'stopped'), { once: true });
  }
  runner.attachFn(gameId, emit, { userId: user.id, locale: t.locale || 'en' });
  return runner.idle(r.job);
}
