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
//   (time cap, game deleted, ban, Builder off, a restart hand-off), and hands over the builder's new messages (sent
//   while the AI works). They go, as the builder's own words, into the user turn about to be sent: after its
//   tool_result blocks, never inside one, so messages already sent never change. ctx.settle() after the answer is
//   complete marks them read; ctx.pending() keeps the loop going for messages that arrive while it would end.
//   ctx.maxRounds is smaller for a resumed attempt, which also gets a note saying what was already done (ctx.resume).
// - Web search (search.js), when on for the build: the server tool sits in every round's tools, unchanged. A search
//   shows as a "search" row (never its query or sites). A query is checked as soon as it is complete (a bad one stops
//   the round, which is asked again with a note); what a round's searches found is checked once the round is done,
//   and the chat text written after a search waits for that check. Links never reach the chat. A paused turn
//   (pause_turn) goes on with no new user message; after a round that left a search running beside our own tools,
//   the next user turn holds only the tool results, so new messages and platform notes wait one round.
//   A search's results can arrive in a later response than its query (a mixed turn, a paused turn): the result block
//   itself marks the round as searched. Once a build has searched, every later round's chat text waits for the checks
//   (the results stay in the conversation). While what a search found is unsuitable (or couldn't be checked) and the
//   model hasn't read the note yet, its tool calls are answered "not run": nothing made from those results is saved.
import { config } from '../config.js';
import { anthropic } from './anthropic.js';
import * as aiBudget from '../services/ai-budget.js';
import { SYSTEM_PROMPT, TOOLS, THREE_D_RULES, sourceBlock, languageBlock, wants3d } from './prompt.js';
import { tEn } from '../i18n/index.js';
import { summariseEvents } from './chat.js';
import { modelBlocks, transcriptNote } from './uploads.js';
import { NO_STEPS, inputScanner, cleanNote } from './steps.js';
import * as search from './search.js';
import { getUser } from '../auth.js';
import { cleanText } from '../services/textfilter.js';

export const MAX_STEPS = 14;  // model calls per build (build, details, playtest, fixes, retest, notes, question)
const MAX_SCAN_FIXES = 2;     // extra rounds allowed to fix a failed safety scan
const HISTORY_MESSAGES = 40;  // earlier transcript entries sent to the model
const FALLBACKS = process.env.BUILDER_FALLBACKS !== '0';
const COUNT_EVERY_MS = 400;   // live lines/changes counter: at most one update this often (the plan is sent at once)
const AUTHORING = { write_game: 'write', edit_game: 'edit' };
const MAX_PAUSES = 3;         // pause_turn continuations in one build
// Tool calls in a round whose search results were unsuitable (or couldn't be checked) are not run.
const NOT_RUN = 'Not run: what the web search found was not suitable for a children\'s game. Don\'t use anything from it; carry on without it.';
// Chat text held back after a search that failed its check: the model is asked to say it again (once a build).
const HELD_NOTE = '[Note from the platform: your last message could not be shown to the builder (it had a link, a site name, personal details or something not suitable). Say it again in your own simple words, with no links or site names, and never ask for personal details.]';
/** A write/edit note as the Studio may show it (the plan on a build step row): no links, nothing the text filter refuses. */
export const shownNote = (s, max = 120) => { const v = cleanNote(search.stripLinks(s), max); return v && cleanText(v, max).ok ? v : null; };

/**
 * The assistant content as it may be sent back. After a model fallback in the middle of the answer (a 'fallback'
 * block), thinking, tool_use and unanswered server_tool_use blocks before the last fallback block are dropped; a
 * server_tool_use cut off by max_tokens is dropped too (its input is incomplete). Everything else is kept as it came.
 */
export function echoable(content, stopReason = null) {
  const list = Array.isArray(content) ? content : [];
  const paired = new Set(list.filter(b => b.type === 'web_search_tool_result').map(b => b.tool_use_id));
  const fb = list.map(b => b.type).lastIndexOf('fallback');
  return list.filter((b, i) => {
    if (b.type === 'server_tool_use' && !paired.has(b.id) && (i < fb || stopReason === 'max_tokens')) return false;
    return !(i < fb && ['thinking', 'redacted_thinking', 'tool_use'].includes(b.type));
  });
}
/** A server tool call with no result yet (it runs at the start of the next request). */
export const openServerTool = content => {
  const paired = new Set((content || []).filter(b => b.type === 'web_search_tool_result').map(b => b.tool_use_id));
  return (content || []).some(b => b.type === 'server_tool_use' && !paired.has(b.id));
};

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
  const client = anthropic(ctx.pool || 'free'); if (!client) throw new Error('No API key');
  const t = ctx.t || tEn;
  const model = ctx.pro ? config.builderProModel : config.builderModel;
  const userContent = [...modelBlocks(ctx.uploads || []), ...(ctx.text ? [{ type: 'text', text: ctx.text }] : []),
    ...(ctx.resume ? [{ type: 'text', text: resumeNote(ctx.resume) }] : [])];
  const messages = mergeRoles([...historyToMessages(ctx.history || []), { role: 'user', content: userContent }]);
  let tokensIn = 0, tokensOut = 0, fixes = 0;
  const steps = ctx.steps || NO_STEPS;
  const max = ctx.maxRounds || MAX_STEPS;
  // Why the next round starts (its step label) and whether its write/edit is a fix of real problems.
  let prev = { c: 'start', fixing: false };
  let cutOff = false;   // a round already ran out of room before using a tool
  // Web search: decided once for the whole build (the tool list never changes partway through one).
  let tools = search.toolsFor(TOOLS), searchOn = tools !== TOOLS;
  const found = { count: 0, blocked: 0, capNoted: false, heldNoted: false };
  const queryById = new Map();  // server tool id -> its query, for results that arrive in a later response
  let searchedBuild = false;    // a search ran in this build: later rounds' chat text is held and checked too
  let skip = null;              // chat text a stopped round already showed: dropped if the retry says it again
  // The builder's (and the game owner's) own names: a query with them is stopped and never logged.
  const owner = ctx.game && ctx.user && ctx.game.owner_id && ctx.game.owner_id !== ctx.user.id ? getUser(ctx.game.owner_id) : null;
  const names = searchOn ? search.namesOf(ctx.user, owner) : [];
  const notes = [];            // platform notes waiting for a user turn that may carry text
  let continuing = false;      // after pause_turn: the assistant turn goes on, with no new user message
  let onlyResults = false;     // the user turn about to be sent may hold only tool_result blocks
  let pauses = 0, retried = false;

  for (let step = 0; step < max; step++) {
    if (ctx.signal && ctx.signal.aborted) break;
    // The AI budget can run out in the middle of a turn: finish what we have instead of starting another call.
    if (step && !aiBudget.ok(ctx.pool || 'free')) { ctx.emit('text', { text: '\n\n' + t('builder.budgetStop') }); break; }
    // The runner's checkpoint: stopped, deleted, banned or switched off -> no more model calls. Otherwise it hands over
    // the builder's new messages (after the budget check above, so none is handed over and then not sent). A round
    // that may not carry them (a paused turn going on, or only tool results allowed) keeps them waiting.
    const hold = continuing || onlyResults;
    const b = ctx.between ? await ctx.between(step + 1, hold ? { hold: true } : undefined) : null;
    if (b && b.stop) break;
    const fresh = (b && b.add) || [];
    const last = messages[messages.length - 1];   // the user turn not sent yet (a block list), or the paused answer
    if (!continuing) {
      if (fresh.length) last.content.push(...fresh.map(e => ({ type: 'text', text: e.text })));
      if (!onlyResults && notes.length) last.content.push(...notes.splice(0).map(text => ({ type: 'text', text })));
      if (!step && !last.content.some(x => x.type === 'text')) last.content.push({ type: 'text', text: 'Here is something for inspiration.' });
      if (!last.content.length) break;              // never send an empty user turn
    }
    const c = !step ? (fresh.length && !ctx.text ? 'msg' : 'start') : fresh.length ? 'msg' : prev.c;
    const cur = ctx.tools.current();
    // Every round re-sends the system prompt, the current game and the chat so far: the model keeps no memory.
    steps.start('think', { n: step + 1, c, ...(c === 'msg' ? { m: fresh.length } : {}), ...(!step && cur ? { g: 1 } : {}) });
    // The short language block goes last, after the cache points, so the cached prefix is the same for every language.
    // The fixed 3D rules sit between the system prompt and the game, only for 3D requests and 3D games.
    const system = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      // Fixed, and only while web search is on: it is cached with the block after it.
      ...(searchOn ? [{ type: 'text', text: search.SEARCH_RULES }] : []),
      ...(wants3d(ctx.state || {}, ctx.text, cur) ? [{ type: 'text', text: THREE_D_RULES, cache_control: { type: 'ephemeral' } }] : []),
      { type: 'text', text: sourceBlock(cur, ctx.tools.game()), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: languageBlock(ctx.locale || 'en') },
    ];
    // After a round that ran out of room before using a tool, the next one thinks less (see cutOff below).
    const params = { model, max_tokens: config.builderMaxTokens, system, tools, messages, output_config: { effort: cutOff ? 'low' : ctx.pro ? 'high' : 'medium' } };
    const opts = { signal: ctx.signal || undefined };
    const stream = FALLBACKS
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, opts)
      : client.messages.stream(params, opts);
    const authorRow = new Map();   // tool_use id -> its write/edit/fix row, so results mark the right row later
    let building = null, thought = false;
    let answering = false;
    let streamed = 0;   // characters of text, thinking and tool input received, for the cost of a cut-off round
    // Web search in this round: queries by server tool id, what came back, the log rows, and the chat text held back
    // after a search started (null: none held, the text streams as it comes). Links never reach the chat.
    const round = { queries: new Map(), titles: [], domains: [], logIds: [], searched: false, blocked: null };
    let held = searchOn && searchedBuild ? '' : null;
    const lf = searchOn ? search.linkFilter() : null;
    let said = '', pend = '';
    const say = s => {
      if (!s) return; said += s;
      if (skip) {   // the same opening again after a stopped search: already on screen
        pend += s; if (skip.startsWith(pend)) return;
        s = pend.startsWith(skip) ? pend.slice(skip.length) : pend; skip = null; pend = '';
        if (!s) return;
      }
      ctx.emit('text', { text: s });
    };
    const startHolding = () => { round.searched = true; searchedBuild = true; if (held === null) { say(lf && lf.flush()); held = ''; } };
    let msg;
    try {
      for await (const ev of stream) {
        if (round.blocked) continue;   // a stopped search: nothing more from this round is used
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
          } else if (cb.type === 'server_tool_use' && cb.name === 'web_search') {
            // "Looking something up": never the query or a site. The chat text after it waits for the check.
            steps.start('search'); startHolding();
          } else if (cb.type === 'web_search_tool_result') {
            // Possibly the result of a search asked for in an earlier response: it is held and checked all the same.
            startHolding();
            const query = round.queries.get(cb.tool_use_id) || queryById.get(cb.tool_use_id) || '';
            if (query && !round.queries.has(cb.tool_use_id)) round.queries.set(cb.tool_use_id, query);
            const items = Array.isArray(cb.content) ? cb.content : [];
            const domains = items.map(r => search.domainOf(r && r.url)).filter(Boolean);
            round.titles.push(...items.map(r => cleanNote(r && r.title, 200)).filter(Boolean)); round.domains.push(...domains);
            const bad = domains.some(search.isBlocked);
            const err = !Array.isArray(cb.content) && cb.content && cb.content.error_code;
            round.logIds.push(search.logSearch({ turnId: ctx.turn || null, gameId: ctx.game ? ctx.game.id : null, query,
              domains, results: items.length, flagged: bad, reason: bad ? 'blocked_site' : err ? String(err) : null, names }));
          }
        } else if (ev.type === 'content_block_delta') {
          streamed += (ev.delta.text || ev.delta.thinking || ev.delta.partial_json || '').length;
          if (ev.delta.type === 'text_delta') { if (held !== null) held += ev.delta.text; else say(lf ? lf.push(ev.delta.text) : ev.delta.text); }
          else if (ev.delta.type === 'input_json_delta' && building) liveInput(steps, building, ev.delta.partial_json);
        } else if (ev.type === 'content_block_stop') {
          if (building && building.n !== building.sent) steps.info({ [building.via === 'write' ? 'l' : 'e']: building.n }, building.i);
          building = null;
          // A web search query is complete: check it at once. A bad one stops the round (its results are never used).
          const blk = searchOn && stream.currentMessage && stream.currentMessage.content[ev.index];
          if (blk && blk.type === 'server_tool_use' && blk.name === 'web_search') {
            const query = String((blk.input && blk.input.query) || '').slice(0, 500);
            round.queries.set(blk.id, query); queryById.set(blk.id, query);
            const cat = search.screenQuery(query, names);
            if (cat) {
              round.blocked = cat;
              search.logSearch({ turnId: ctx.turn || null, gameId: ctx.game ? ctx.game.id : null, query, flagged: true, reason: cat, names });
              stream.abort();
            }
          }
        }
      }
      msg = await stream.finalMessage();
      if (round.blocked) throw new Error('web search stopped');   // the answer was complete before the stop took hold
    } catch (e) {
      // The round was cut off (time cap, stop, delete, ban, hand-off, a broken stream): it was still paid for.
      payCutOff(stream, model, streamed, ctx);
      const stopped = ctx.signal && ctx.signal.aborted;
      // A search we stopped: nothing from this round is kept (its held text is dropped). The round is asked again
      // with a note, unless this keeps happening.
      if (round.blocked && !stopped) {
        // Rows this round started never finished; what it already showed is not shown twice by the retry.
        for (const row of authorRow.values()) if (row.i) steps.info({ ok: false }, row.i);
        skip = (skip || '') + said || null;
        if (++found.blocked > search.MAX_BLOCKED) { ctx.emit('text', { text: '\n\n' + t('builder.searchStopped') }); break; }
        const tail = messages[messages.length - 1];
        if (!continuing && !onlyResults && tail.role === 'user') tail.content.push({ type: 'text', text: search.NOTES.blocked });
        else notes.push(search.NOTES.blocked);
        continue;
      }
      // The API refused the web search tool itself on the first request: no search for this process, and the round
      // is asked again without it (nothing was answered yet, so the tool list may still change).
      if (searchOn && !step && !retried && !stopped && search.isToolRefusal(e)) {
        search.disable(e.message); retried = true; tools = TOOLS; searchOn = false; step--; continue;
      }
      throw e;
    }
    if (ctx.settle) ctx.settle();   // the model answered this request
    const u = msg.usage || {};
    const usd = aiBudget.recordUsage(msg.model || model, u, undefined, ctx.pool || 'free');
    if (ctx.cost) ctx.cost(usd);   // the build's own cost (builder_turns.usd, /admin/stats cost per message)
    tokensIn += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    tokensOut += u.output_tokens || 0;
    // Web search: count what ran (max_uses is per request; the cap is per build), check what it found, then show
    // the text held back (without links) or drop it. 'unchecked' (the check couldn't run) counts as unsuitable.
    let unsafe = null, dropped = false;
    if (searchOn) {
      found.count += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
      if (round.searched) {
        const quotes = msg.content.filter(x => x.type === 'text').flatMap(x => (x.citations || []).map(c => cleanNote(c && c.cited_text, 150))).filter(Boolean);
        unsafe = await search.screenFound({ queries: [...round.queries.values()], titles: round.titles, domains: round.domains, quotes });
        if (unsafe) { search.flag(round.logIds, unsafe); if (!notes.includes(search.NOTES.unsafe)) notes.push(search.NOTES.unsafe); }
      }
      if (held === null) say(lf.flush());
      else {
        const out = search.stripLinks(held);
        if (!unsafe && search.textOk(out)) say(out); else if (out.trim()) dropped = true;
      }
      if (found.count >= search.SEARCHES_PER_BUILD && !found.capNoted) { found.capNoted = true; notes.push(search.NOTES.cap); }
    }
    skip = null;
    if (msg.stop_reason === 'refusal') { ctx.emit('text', { text: (step ? '\n\n' : '') + t('builder.kindRefusal') }); break; }
    const content = echoable(msg.content, msg.stop_reason);
    messages.push({ role: 'assistant', content });
    continuing = false; onlyResults = false;
    // It ignored the cap note: this round's own tool calls still run, then the build ends (with a word, not silently).
    const pastCap = searchOn && found.count > search.SEARCHES_PER_BUILD + search.SEARCH_BACKSTOP;
    const endKindly = () => ctx.emit('text', { text: '\n\n' + t('builder.searchStopped') });
    // The server paused a long search turn: send the answer so far back as it is, with no new user message.
    if (msg.stop_reason === 'pause_turn') {
      if (pastCap || ++pauses > MAX_PAUSES) { endKindly(); break; }
      continuing = true; continue;
    }
    // Unsuitable results not yet explained to the model (this round's, or a paused round's waiting note).
    const tainted = !!unsafe || notes.includes(search.NOTES.unsafe);
    const uses = content.filter(b => b.type === 'tool_use');
    // A message from the builder is waiting and there are rounds left: the loop goes on, so the AI reads it now.
    const more = () => (ctx.pending ? ctx.pending() : 0) > 0 && step + 1 < max;
    if (!uses.length) {
      if (pastCap) { endKindly(); break; }
      // Its chat text was held back and dropped: once, ask it to say it again (never a silent, empty reply).
      if (dropped && step + 1 < max) {
        if (!found.heldNoted) {
          found.heldNoted = true; if (!unsafe) notes.push(HELD_NOTE);
          messages.push({ role: 'user', content: [] }); prev = { c: 'next', fixing: prev.fixing }; continue;
        }
        if (!more()) { endKindly(); break; }
      }
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
      if (more()) { messages.push({ role: 'user', content: [] }); prev = { c: 'msg', fixing: false }; continue; }
      break;
    }
    const results = []; let stop = false; let failedScan = false;
    let playtested = false, probs = 0, shownErr = false;
    for (const tu of uses) {
      const input = tu.input && typeof tu.input === 'object' ? tu.input : {};
      // Eager input streaming means inputs are not validated by the API: a truncated call (max_tokens) is reported back.
      const truncated = msg.stop_reason === 'max_tokens' && tu === uses[uses.length - 1];
      const r = tainted ? { ok: false, forModel: NOT_RUN }
        : truncated ? { ok: false, forModel: 'Your last tool call was cut off because it was too long. Make it shorter (use edit_game for small changes).' } : await ctx.tools.exec(tu.name, input);
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
        else if (r.version) { const plan = shownNote(input.notes); if (plan && plan !== row.plan) steps.info({ plan }, row.i); }
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.forModel, ...(r.ok ? {} : { is_error: true }) });
    }
    prev = { c: playtested ? 'look' : failedScan ? 'scan' : shownErr ? 'retry' : 'next', fixing: failedScan || probs > 0 };
    if (pastCap) { if (!results.some(x => !x.is_error)) endKindly(); break; }
    if (stop && !more()) break;   // ask_user waits for the answer, unless it may be here already
    if (failedScan && ++fixes > MAX_SCAN_FIXES) { ctx.emit('text', { text: '\n\n' + t('builder.scanStillFailing') }); break; }
    messages.push({ role: 'user', content: results });
    // A search still running beside our tools: the next user turn may hold only the tool results.
    onlyResults = openServerTool(content);
  }
  return { model, tokensIn, tokensOut, ...(found.count ? { searches: found.count } : {}) };
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
  if (r.plan && !b.plan) { b.plan = r.plan; const plan = shownNote(r.plan); if (plan) patch.plan = plan; }
  b.n = b.via === 'write' ? r.lines : r.edits;
  const now = Date.now();
  if (b.n !== b.sent && (patch.plan || now - b.at >= COUNT_EVERY_MS)) { patch[b.via === 'write' ? 'l' : 'e'] = b.n; b.sent = b.n; b.at = now; }
  if (Object.keys(patch).length) steps.info(patch, b.i);
}
