// Claude provider: the server-side agent loop for the Builder.
// - Fixed system prompt (prompt.js), cached; the current game source goes in a SEPARATE cached system block.
// - The configured Builder model (config.builderModel), or the Pro model for "Pro quality" (config.builderProModel).
// - Streams text to the Studio; tool calls run through tools.js (every write/edit = a new scanned version).
// - Live build steps (steps.js): one "think" row per model call (Round N, with why it started), a write/edit/fix row
//   while that tool's input streams (the AI's own notes as the plan, plus a lines or changes counter).
//   The request itself is never changed for this: thinking is only noticed when a thinking block really streams.
// - History from earlier turns is rebuilt from the stored transcript (text + one-line action summaries),
//   so game source and upload bytes are never resent from history. Neighbours with the same role are merged.
// - The runner's hook ctx.between(round) runs at the top of every round: it stops the loop when the build was stopped
//   (time cap, game deleted, ban, Builder off, a restart hand-off). ctx.maxRounds is smaller for a resumed attempt,
//   which also gets a note saying what was already done (ctx.resume).
import { config } from '../config.js';
import { anthropic } from './anthropic.js';
import * as aiBudget from '../services/ai-budget.js';
import { SYSTEM_PROMPT, TOOLS, THREE_D_RULES, sourceBlock, languageBlock, wants3d } from './prompt.js';
import { tEn } from '../i18n/index.js';
import { summariseEvents } from './chat.js';
import { modelBlocks, transcriptNote } from './uploads.js';
import { NO_STEPS, inputScanner, cleanNote } from './steps.js';

export const MAX_STEPS = 14;  // model calls per build (build, details, playtest, fixes, retest, notes, question)
const MAX_SCAN_FIXES = 2;     // extra rounds allowed to fix a failed safety scan
const HISTORY_MESSAGES = 40;  // earlier transcript entries sent to the model
const FALLBACKS = process.env.BUILDER_FALLBACKS !== '0';
const COUNT_EVERY_MS = 400;   // live lines/changes counter: at most one update this often (the plan is sent at once)
const AUTHORING = { write_game: 'write', edit_game: 'edit' };

/** Join neighbours with the same role (the API wants user and assistant in turns): text + text with a blank line,
 *  anything else as one block list. The last message stays a block list when it was one. */
export function mergeRoles(msgs) {
  const out = [];
  const blocks = c => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
  for (const m of msgs) {
    const prev = out[out.length - 1];
    if (!prev || prev.role !== m.role) { out.push({ role: m.role, content: Array.isArray(m.content) ? [...m.content] : m.content }); continue; }
    prev.content = typeof prev.content === 'string' && typeof m.content === 'string' ? `${prev.content}\n\n${m.content}` : [...blocks(prev.content), ...blocks(m.content)];
  }
  return out;
}
/** Transcript -> Messages API history (plain text only). Refused messages and follow-ups the model never answered
 *  never reach the model; neighbours with the same role are merged (an errored build leaves two user messages). */
export function historyToMessages(history) {
  const out = [];
  for (const m of history.filter(x => !x.refused && !(x.followUp && x.status !== 'read'))) {
    if (m.role === 'user') {
      const notes = (m.uploads || []).map(transcriptNote).join(' ');
      const text = [notes, m.text].filter(Boolean).join('\n') || '(sent a picture)';
      out.push({ role: 'user', content: text });
    } else {
      const text = [m.text, summariseEvents(m.events)].filter(Boolean).join('\n');
      if (text) out.push({ role: 'assistant', content: text });
    }
  }
  const merged = mergeRoles(out).slice(-HISTORY_MESSAGES);
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}

/** Model-facing note for an attempt carried on after a restart, or a Continue (no locale key: the model reads it). */
export function resumeNote(resume) {
  const done = (resume.versions || []).map(v => `Built version ${v.number}: ${v.notes} (safety check: ${v.safety_status})`).join('; ') || 'nothing saved yet';
  const why = resume.cont && resume.original
    ? `The builder pressed Continue after the build stopped early, so carry on with their earlier message: «${resume.original}».`
    : 'the server restarted while you were working on this message, so your work was cut off.';
  return `[Note from the platform: ${why} Already done in this turn: ${done}. The current game below is the newest saved version. `
    + 'Carry on from it and finish the builder\'s request. Don\'t start over and don\'t redo finished work. '
    + 'Start with one short, friendly sentence saying you\'re carrying on.]';
}

// Sent when a round used all its output on planning: the next round should write, not plan again.
const CUT_OFF_NUDGE = 'You ran out of room before calling a tool, so nothing was built yet. Keep your planning very short now and call write_game (or edit_game for a change to the current game) right away. If the request is big, build the most important part first; the player can ask for the rest next.';

export async function run(ctx) {
  const client = anthropic(); if (!client) throw new Error('No API key');
  const t = ctx.t || tEn;
  const model = ctx.pro ? config.builderProModel : config.builderModel;
  const userContent = [...modelBlocks(ctx.uploads || []), { type: 'text', text: ctx.text || 'Here is something for inspiration.' },
    ...(ctx.resume ? [{ type: 'text', text: resumeNote(ctx.resume) }] : [])];
  const messages = mergeRoles([...historyToMessages(ctx.history || []), { role: 'user', content: userContent }]);
  let tokensIn = 0, tokensOut = 0, fixes = 0;
  const steps = ctx.steps || NO_STEPS;
  const max = ctx.maxRounds || MAX_STEPS;
  // Why the next round starts (its step label) and whether its write/edit is a fix of real problems.
  let prev = { c: 'start', fixing: false };
  let cutOff = false;   // a round already ran out of room before using a tool

  for (let step = 0; step < max; step++) {
    if (ctx.signal && ctx.signal.aborted) break;
    // The AI budget can run out in the middle of a turn: finish what we have instead of starting another call.
    if (step && !aiBudget.ok()) { ctx.emit('text', { text: '\n\n' + t('builder.budgetStop') }); break; }
    // The runner's checkpoint: stopped, deleted, banned or switched off -> no more model calls.
    const b = ctx.between ? await ctx.between(step + 1) : null;
    if (b && b.stop) break;
    const cur = ctx.tools.current();
    // Every round re-sends the system prompt, the current game and the chat so far: the model keeps no memory.
    steps.start('think', { n: step + 1, c: step ? prev.c : 'start', ...(!step && cur ? { g: 1 } : {}) });
    // The short language block goes last, after the cache points, so the cached prefix is the same for every language.
    // The fixed 3D rules sit between the system prompt and the game, only for 3D requests and 3D games.
    const system = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ...(wants3d(ctx.state || {}, ctx.text, cur) ? [{ type: 'text', text: THREE_D_RULES, cache_control: { type: 'ephemeral' } }] : []),
      { type: 'text', text: sourceBlock(cur, ctx.tools.game()), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: languageBlock(ctx.locale || 'en') },
    ];
    // After a round that ran out of room before using a tool, the next one thinks less (see cutOff below).
    const params = { model, max_tokens: config.builderMaxTokens, system, tools: TOOLS, messages, output_config: { effort: cutOff ? 'low' : ctx.pro ? 'high' : 'medium' } };
    const opts = { signal: ctx.signal || undefined };
    const stream = FALLBACKS
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, opts)
      : client.messages.stream(params, opts);
    const authorRow = new Map();   // tool_use id -> its write/edit/fix row, so results mark the right row later
    let building = null, thought = false;
    let answering = false;
    let streamed = 0;   // characters of text, thinking and tool input received, for the cost of a cut-off round
    let msg;
    try {
      for await (const ev of stream) {
        // The first event means the AI has read everything and is now working on its answer: the round is no longer
        // "reading", it is planning (a big new game can take a minute or two here before any code appears).
        if (!answering && steps.current() === 'think') { answering = true; steps.info({ a: 1 }); }
        if (ev.type === 'content_block_start' && ev.content_block) {
          const cb = ev.content_block; building = null;
          // A thinking block really streamed (its text is never read or shown): the round is "thinking it through".
          if ((cb.type === 'thinking' || cb.type === 'redacted_thinking') && !thought && steps.current() === 'think') { thought = true; steps.info({ th: 1 }); }
          else if (cb.type === 'tool_use' && AUTHORING[cb.name]) {
            const via = AUTHORING[cb.name];
            const key = prev.fixing ? 'fix' : via;
            building = { via, i: steps.start(key, key === 'fix' ? { via } : {}), scan: inputScanner(), plan: null, n: 0, sent: 0, at: 0 };
            if (cb.id) authorRow.set(cb.id, building);
          }
        } else if (ev.type === 'content_block_delta') {
          streamed += (ev.delta.text || ev.delta.thinking || ev.delta.partial_json || '').length;
          if (ev.delta.type === 'text_delta') ctx.emit('text', { text: ev.delta.text });
          else if (ev.delta.type === 'input_json_delta' && building) liveInput(steps, building, ev.delta.partial_json);
        } else if (ev.type === 'content_block_stop') {
          if (building && building.n !== building.sent) steps.info({ [building.via === 'write' ? 'l' : 'e']: building.n }, building.i);
          building = null;
        }
      }
      msg = await stream.finalMessage();
    } catch (e) {
      // The round was cut off (time cap, stop, delete, ban, hand-off, a broken stream): it was still paid for.
      payCutOff(stream, model, streamed, ctx);
      throw e;
    }
    if (ctx.settle) ctx.settle();   // the model answered this request
    const u = msg.usage || {};
    const usd = aiBudget.recordUsage(msg.model || model, u, undefined, ctx.pool || 'free');
    if (ctx.cost) ctx.cost(usd);   // the build's own cost (builder_turns.usd, /admin/stats cost per message)
    tokensIn += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    tokensOut += u.output_tokens || 0;
    if (msg.stop_reason === 'refusal') { ctx.emit('text', { text: (step ? '\n\n' : '') + t('builder.kindRefusal') }); break; }
    messages.push({ role: 'assistant', content: msg.content });
    const uses = msg.content.filter(b => b.type === 'tool_use');
    if (!uses.length) {
      // The AI used its whole output allowance (mostly thinking) before it used a tool, so nothing was made. Once, ask
      // it to plan briefly and start writing; a second time, say so and end with an error (the turn is given back
      // when nothing was saved, agent.js refundable). Never a silent, empty reply.
      if (msg.stop_reason === 'max_tokens') {
        if (!cutOff) {
          cutOff = true; prev = { c: 'next', fixing: prev.fixing };
          messages.push({ role: 'user', content: [{ type: 'text', text: CUT_OFF_NUDGE }] });
          continue;
        }
        ctx.emit('error', { message: t('builder.cutOffNothing') });
        return { model, tokensIn, tokensOut, error: 'cut_off' };
      }
      break;
    }
    const results = []; let stop = false; let failedScan = false;
    let playtested = false, probs = 0, shownErr = false;
    for (const tu of uses) {
      const input = tu.input && typeof tu.input === 'object' ? tu.input : {};
      // Eager input streaming means inputs are not validated by the API: a truncated call (max_tokens) is reported back.
      const truncated = msg.stop_reason === 'max_tokens' && tu === uses[uses.length - 1];
      const r = truncated ? { ok: false, forModel: 'Your last tool call was cut off because it was too long. Make it shorter (use edit_game for small changes).' } : await ctx.tools.exec(tu.name, input);
      if (r.stop) stop = true;
      if (r.report && r.report.status === 'fail') failedScan = true;
      if (r.event && r.event[0] === 'playtest') { playtested = true; probs += +r.event[1].problems || 0; }
      // Mark the row this tool call started (a set_game row may have started in between).
      const row = authorRow.get(tu.id);
      // "Working out what went wrong" only follows a failure the card shows (a write/edit row, a playtest row);
      // a tool that failed without a row of its own (e.g. set_game changed nothing) leads to a plain "what's next".
      if (!r.ok && ((row && row.i) || r.shown)) shownErr = true;
      if (row && row.i) {
        if (truncated) steps.info({ ok: false, why: 'cut' }, row.i);
        else if (!r.ok && !r.version) steps.info({ ok: false }, row.i);
        else if (r.version) { const plan = cleanNote(input.notes, 120); if (plan && plan !== row.plan) steps.info({ plan }, row.i); }
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.forModel, ...(r.ok ? {} : { is_error: true }) });
    }
    prev = { c: playtested ? 'look' : failedScan ? 'scan' : shownErr ? 'retry' : 'next', fixing: failedScan || probs > 0 };
    if (stop) break;
    if (failedScan && ++fixes > MAX_SCAN_FIXES) { ctx.emit('text', { text: '\n\n' + t('builder.scanStillFailing') }); break; }
    messages.push({ role: 'user', content: results });
  }
  return { model, tokensIn, tokensOut };
}

/**
 * The cost of a round whose stream ended before the final message: its input and cache tokens came with the first
 * event; the output count only comes at the end, so it is estimated from what streamed (about 4 characters a token).
 * Nothing streamed at all: nothing is known, nothing is recorded. Never throws (the caller rethrows the real error).
 */
export function payCutOff(stream, model, chars, ctx) {
  try {
    // A message that arrived whole just before the stop has its real counts; else the one still streaming.
    const m = stream && (stream.currentMessage || (stream.receivedMessages || []).at(-1));
    if (!m || !m.usage) return 0;
    const u = { ...m.usage, output_tokens: Math.max(m.usage.output_tokens || 0, Math.ceil(chars / 4)) };
    const usd = aiBudget.recordUsage(m.model || model, u, undefined, ctx.pool || 'free');
    if (ctx.cost) ctx.cost(usd);
    return usd;
  } catch { return 0; }
}

/** Streamed write/edit input -> the row's plan (sent as soon as it is complete) and a throttled lines/changes count. */
function liveInput(steps, b, chunk) {
  let r; try { r = b.scan.push(chunk); } catch { return; }   // the scanner never throws, but the stream must never break
  const patch = {};
  if (r.plan && !b.plan) { b.plan = r.plan; patch.plan = r.plan; }
  b.n = b.via === 'write' ? r.lines : r.edits;
  const now = Date.now();
  if (b.n !== b.sent && (patch.plan || now - b.at >= COUNT_EVERY_MS)) { patch[b.via === 'write' ? 'l' : 'e'] = b.n; b.sent = b.n; b.at = now; }
  if (Object.keys(patch).length) steps.info(patch, b.i);
}
