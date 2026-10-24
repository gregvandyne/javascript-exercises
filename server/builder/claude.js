// Claude provider: the server-side agent loop for the Builder.
// - Fixed system prompt (prompt.js), cached; the current game source goes in a SEPARATE cached system block.
// - claude-sonnet-5-5 by default, claude-opus-5-5 for "Pro quality" (config.builderModel / builderProModel).
// - Streams text to the Studio; tool calls run through tools.js (every write/edit = a new scanned version).
// - History from earlier turns is rebuilt from the stored transcript (text + one-line action summaries),
//   so game source and upload bytes are never resent from history.
import { config } from '../config.js';
import { anthropic } from './anthropic.js';
import { SYSTEM_PROMPT, TOOLS, sourceBlock, languageBlock } from './prompt.js';
import { tEn } from '../i18n/index.js';
import { summariseEvents } from './chat.js';
import { modelBlocks, transcriptNote } from './uploads.js';

const MAX_STEPS = 8;          // model calls per turn
const MAX_SCAN_FIXES = 2;     // extra rounds allowed to fix a failed safety scan
const HISTORY_MESSAGES = 40;  // earlier transcript entries sent to the model
const FALLBACKS = process.env.BUILDER_FALLBACKS !== '0';

/** Transcript -> Messages API history (plain text only). Refused messages never reach the model. */
export function historyToMessages(history) {
  const out = [];
  for (const m of history.filter(x => !x.refused).slice(-HISTORY_MESSAGES)) {
    if (m.role === 'user') {
      const notes = (m.uploads || []).map(transcriptNote).join(' ');
      const text = [notes, m.text].filter(Boolean).join('\n') || '(sent a picture)';
      out.push({ role: 'user', content: text });
    } else {
      const text = [m.text, summariseEvents(m.events)].filter(Boolean).join('\n');
      if (text) out.push({ role: 'assistant', content: text });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function run(ctx) {
  const client = anthropic(); if (!client) throw new Error('No API key');
  const t = ctx.t || tEn;
  const model = ctx.pro ? config.builderProModel : config.builderModel;
  const userContent = [...modelBlocks(ctx.uploads || []), { type: 'text', text: ctx.text || 'Here is something for inspiration.' }];
  const messages = [...historyToMessages(ctx.history), { role: 'user', content: userContent }];
  let tokensIn = 0, tokensOut = 0, fixes = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const cur = ctx.tools.current();
    // The short language block goes last, after both cache points, so the cached prefix is the same for every language.
    const system = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: sourceBlock(cur, ctx.tools.game()), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: languageBlock(ctx.locale || 'en') },
    ];
    const params = { model, max_tokens: config.builderMaxTokens, system, tools: TOOLS, messages, output_config: { effort: ctx.pro ? 'high' : 'medium' } };
    const opts = { signal: ctx.signal || undefined };
    const stream = FALLBACKS
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, opts)
      : client.messages.stream(params, opts);
    let building = null, bytes = 0, lastProgress = 0;
    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'tool_use') {
        building = ev.content_block.name; bytes = 0;
        if (building === 'write_game' || building === 'edit_game') ctx.emit('progress', { stage: building === 'write_game' ? 'building' : 'editing', bytes: 0 });
      } else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') ctx.emit('text', { text: ev.delta.text });
        else if (ev.delta.type === 'input_json_delta' && (building === 'write_game' || building === 'edit_game')) {
          bytes += ev.delta.partial_json.length;
          if (bytes - lastProgress > 4000) { lastProgress = bytes; ctx.emit('progress', { stage: building === 'write_game' ? 'building' : 'editing', bytes }); }
        }
      } else if (ev.type === 'content_block_stop') building = null;
    }
    const msg = await stream.finalMessage();
    const u = msg.usage || {};
    tokensIn += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    tokensOut += u.output_tokens || 0;
    if (msg.stop_reason === 'refusal') { ctx.emit('text', { text: (step ? '\n\n' : '') + t('builder.kindRefusal') }); break; }
    messages.push({ role: 'assistant', content: msg.content });
    const uses = msg.content.filter(b => b.type === 'tool_use');
    if (!uses.length) break;
    const results = []; let stop = false; let failedScan = false;
    for (const tu of uses) {
      const input = tu.input && typeof tu.input === 'object' ? tu.input : {};
      // Eager input streaming means inputs are not validated by the API: a truncated call (max_tokens) is reported back.
      const truncated = msg.stop_reason === 'max_tokens' && tu === uses[uses.length - 1];
      const r = truncated ? { ok: false, forModel: 'Your last tool call was cut off because it was too long. Make it shorter (use edit_game for small changes).' } : ctx.tools.exec(tu.name, input);
      if (r.stop) stop = true;
      if (r.report && r.report.status === 'fail') failedScan = true;
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.forModel, ...(r.ok ? {} : { is_error: true }) });
    }
    if (stop) break;
    if (failedScan && ++fixes > MAX_SCAN_FIXES) { ctx.emit('text', { text: '\n\n' + t('builder.scanStillFailing') }); break; }
    messages.push({ role: 'user', content: results });
  }
  return { model, tokensIn, tokensOut };
}
