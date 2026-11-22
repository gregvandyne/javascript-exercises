// Oomba on the Manipulatives board: an interactive chat that knows the board a teacher has open and can change it
// (docs/decisions.md "Virtual math manipulatives: Oomba chat"). It replaces the one-shot "Draft with AI" form: the first
// message on an empty board is the brief, every later one adjusts the board ("make it 6 clocks", "use quarter hours").
//
// - Who: hosts only (services/manipulatives.js canHost, the Teacher plan gate). Students never see it.
// - What the AI gets: the page context built HERE from the teacher's own board (cleanState first): the tool, the title,
//   the steps and the items in the practice-set form (what each one shows, its settings, whether it has an answer box),
//   whether it is a new or a saved board, whether the teacher runs a live room on this tool, the grade they chose.
//   Never sticky notes, pen marks, typed board text, typed answers, names of students or their work. The teacher's
//   message passes the word rules and the name check (manipulatives.js textProblem, namesIn) before anything is stored
//   or sent; a message that fails is refused and not stored.
// - What it answers: plain JSON (no strict json_schema: the constrained grammar hung in production, 22 Nov 2026)
//   { reply, action: null | { op: 'replace', draft: { title, steps, items } } }. A change is always a whole board
//   draft that goes through sanitizeDraft (public/js/manip-practice.js buildPractice) exactly like Draft with AI, then
//   cleanState: every board the chat makes is checked and laid out by the code. Anything else is a reply only.
// - A turn is a job in this process (like services/manip-drafts.js): the POST stores the teacher's message and returns
//   at once; the page asks how it is going, so a refresh or a closed tab changes nothing. One turn at a time per board.
//   A turn whose process went away (a restart) ends as failed when it is next read; the teacher's words stay in the
//   conversation with Try again. One AI call per turn within its one budget (services/ai-call.js); every failure is a
//   calm reply ("Oomba couldn't answer this time; your board is unchanged") and one warn line without the words.
// - Kept: the last HISTORY_MAX turns per board (manip_chats, migration 0103). A changed board's state stays only on the
//   newest STATES_KEPT turns (for "Put it on my board" when the answer came while the page was closed). A chat goes
//   with its board (deleteBoard, recent boards trimmed or expired: pruned here), after KEEP_DAYS untouched, and with the
//   account (forgetUser; the users foreign key too).
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { callAi, logAiFail, fallbackReason, AI_CALL } from './ai-call.js';
import { log } from './log.js';
import * as M from './manipulatives.js';
import { toolOf, stepsOf } from '../../public/js/manip-data.js';
import { PRACTICE_TABLE, PRACTICE_HELP, PRACTICE_MAX, STEPS_MAX } from '../../public/js/manip-practice.js';

export const CHAT = {
  TEXT_MAX: 1000,        // a teacher's message (the draft brief's limit)
  REPLY_MAX: 600,        // Oomba's reply
  HISTORY_MAX: 20,       // turns kept per board
  HISTORY_TO_AI: 8,      // turns sent with a message
  STATES_KEPT: 3,        // newest changed boards whose state is kept
  CONTEXT_MAX: 8000,     // characters of board context
  FRESH_MS: 30 * 60e3,   // a new board's chat (no saved board yet) is picked up again within this
  KEEP_DAYS: 60,
};
const DAY = 86400e3;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);

/** This process's running turns: chat id -> promise. */
const jobs = new Map();
/** A chat's running turn here (tests wait on it), else a resolved promise. */
export const settled = id => jobs.get(id) || Promise.resolve();
/** The longest a turn takes (ms): the AI's one budget and a margin. */
export const longest = () => AI_CALL.timeoutMs + 15e3;

// ---------------------------------------------------------------- the board, as the AI may see it
const DROP = new Set(['label', 'ans', 'text', 'notes', 'name', 'cell', 'q', 'id', 'color', 'fresh', 'simplest', 'hide', 'locked', 'lockBy']);
const num = v => (Number.isFinite(+v) ? +v : null);
const counts = list => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return [...m].map(([kind, count]) => ({ kind, count })); };
/** One object's settings in the practice-set words (PRACTICE_HELP), or its plain settings for kinds without them. */
function objSettings(o) {
  const st = o.st || {};
  switch (o.k) {
    case 'clock': return { time: `${((Math.round(num(st.h) || 12) + 11) % 12) + 1}:${String(Math.round(num(st.m) || 0)).padStart(2, '0')}` };
    case 'number-lines': return { min: num(st.min), max: num(st.max), step: num(st.step), ...(Array.isArray(st.points) && st.points.length ? { value: num(st.points[0]) } : {}) };
    case 'hundred-board': return Array.isArray(st.picked) && st.picked.length ? { value: (num(st.start) || 1) + (num(st.picked[0]) || 0) } : {};
    case 'rekenreks': return { value: (Array.isArray(st.counts) ? st.counts : []).reduce((s, x) => s + (num(x) || 0), 0) };
    case 'fraction-circles': return Array.isArray(st.placed) && st.placed.length ? { fractions: counts(st.placed.map(p => num(p && p.d))).map(c => `${c.count}/${c.kind}`) } : {};
    case 'frac-eq': return { op: clip(st.op, 8), a: clip(st.a, 12), b: clip(st.b, 12) };
    case 'xy-coordinate-board': return Array.isArray(st.pts) && st.pts.length ? { points: st.pts.slice(0, 8).map(p => ({ x: num(p && p.x), y: num(p && p.y) })) } : {};
    case 'geoboard': { const b = Array.isArray(st.bands) && st.bands[0]; return b && Array.isArray(b.pts) ? { pegs: b.pts.slice(0, 8).map(p => ({ x: num(p && p.x), y: num(p && p.y) })) } : {}; }
    case 'bar-models': {
      const parts = Array.isArray(st.bars) && st.bars[1] && Array.isArray(st.bars[1].segs) ? st.bars[1].segs : [];
      const whole = Array.isArray(st.bars) && st.bars[0] && Array.isArray(st.bars[0].segs) ? st.bars[0].segs[0] : null;
      const u = parts.findIndex(s => s && s.hide);
      return { parts: parts.slice(0, 4).map(s => num(s && s.value)), unknown: u >= 0 ? u : whole && whole.hide ? parts.length : null };
    }
    case 'answer': return { key: clip(st.key, 40) };
    default: {
      // Other kinds (a ten-frame, a place-value chart, a mat): their numbers and switches only, never their words.
      const out = {};
      for (const [k, v] of Object.entries(st)) if (!DROP.has(k) && (typeof v === 'number' || typeof v === 'boolean')) out[k] = v;
      return out;
    }
  }
}
/** Pieces in the practice-set words for the tool (value, fractions, numbers, pieces...). */
function pieceSettings(slug, ps) {
  if (!ps.length) return {};
  const kinds = ps.map(p => String(p.kind || '')), value = ps.reduce((s, p) => s + (num(p.value) || 0), 0);
  switch (slug) {
    case 'base-ten-blocks': case 'place-value-disks': case 'money': return { value: Math.round(value * 100) / 100 };
    case 'two-color-counters': return { value: kinds.filter(k => k === 'pos').length, negative: kinds.filter(k => k === 'neg').length };
    case 'linking-cubes': return { value: ps.length };
    case 'color-tiles': return { rows: new Set(ps.map(p => Math.round(num(p.y) || 0))).size, cols: new Set(ps.map(p => Math.round(num(p.x) || 0))).size, tiles: ps.length };
    case 'number-rods': return { numbers: kinds.map(k => num(k.replace(/^r/, ''))).filter(x => x !== null).slice(0, 8) };
    case 'fraction-tiles': return { fractions: counts(kinds.map(k => k.replace(/^f/, ''))).map(c => `${c.count}/${c.kind}`) };
    default: return { pieces: counts(kinds).slice(0, 12) };
  }
}
/**
 * The open board in the practice-set form, from its cleaned state: { title, steps, items, free? }. Items are the
 * board's cells (a drafted board's grid); a board made by hand is one "free" description of what is on it. Only kinds,
 * numbers and answer keys: never sticky notes, pen marks, typed text, typed answers or labels.
 */
export function boardContext(slug, st) {
  const objects = Array.isArray(st.objects) ? st.objects : [], pieces = Array.isArray(st.pieces) ? st.pieces : [];
  const steps = stepsOf(st).map(s => clip(s.text, 140)).slice(0, M.LIMITS.steps);
  const cellOf = x => (Number.isInteger(x && x.cell) ? x.cell : Number.isInteger(x && x.st && x.st.cell) ? x.st.cell : null);
  const cells = [...new Set([...objects.map(cellOf), ...pieces.map(cellOf)].filter(c => c !== null))].sort((a, b) => a - b);
  const items = cells.slice(0, M.LIMITS.texts).map(c => {
    const os = objects.filter(o => cellOf(o) === c), ps = pieces.filter(p => cellOf(p) === c);
    const ans = os.find(o => o.k === 'answer'), main = os.filter(o => o.k !== 'answer');
    const empty = !ps.length && main.every(o => { const s = objSettings(o); return !Object.keys(s).length || (o.k === 'clock' && o.st && o.st.h === 12 && o.st.m === 0 && /^(Show|Set)/.test(String(o.st.label || ''))); });
    const box = ans || main.some(o => o.st && o.st.q) ? 'answer' : empty || main.some(o => o.k === 'pv-chart') ? 'build' : 'none';
    const item = { box, ...main.reduce((s, o) => ({ ...s, ...objSettings(o) }), {}), ...pieceSettings(slug, ps) };
    if (main.some(o => o.k === 'frac-eq')) Object.assign(item, objSettings(main.find(o => o.k === 'frac-eq')));
    if (ans && ans.st && ans.st.key) item.answerKey = clip(ans.st.key, 40);
    return item;
  });
  const free = objects.filter(o => cellOf(o) === null), loose = pieces.filter(p => cellOf(p) === null);
  const out = { steps, items };
  if (free.length || loose.length) {
    out.free = {
      objects: free.slice(0, 20).map(o => ({ kind: o.k, ...objSettings(o) })),
      pieces: counts(loose.map(p => String(p.kind || ''))).slice(0, 20),
      ...(loose.length ? { piecesTotal: Math.round(loose.reduce((s, p) => s + (num(p.value) || 0), 0) * 100) / 100 } : {}),
    };
  }
  return out;
}

// ---------------------------------------------------------------- the conversation row
const boardKey = (u, slug, boardId) => {
  const b = boardId ? M.ownBoard(u, boardId) : null;
  return b && b.kind === 'recent' && b.tool === slug ? b.id : `new:${slug}`;
};
const getRow = (ownerId, key) => q.get('SELECT * FROM manip_chats WHERE owner_id=? AND board_key=?', ownerId, key) || null;
/** The chat of this board: a saved board's own, or the newest new-board chat of the tool (within FRESH_MS), which the
 *  saved board then takes over (a new board gets its id at its first autosave). create: make one when there is none. */
function chatFor(u, slug, boardId, { create = false } = {}) {
  prune(u.id);
  const key = boardKey(u, slug, boardId);
  let row = getRow(u.id, key);
  if (!row) {
    const fresh = q.get("SELECT * FROM manip_chats WHERE owner_id=? AND board_key=? AND updated_at>?", u.id, `new:${slug}`, now() - CHAT.FRESH_MS);
    if (fresh && key !== fresh.board_key) { q.run('UPDATE manip_chats SET board_key=? WHERE id=?', key, fresh.id); row = getRow(u.id, key); }
    else if (fresh) row = fresh;
    else q.run('DELETE FROM manip_chats WHERE owner_id=? AND board_key=?', u.id, `new:${slug}`);   // an old one: a new board starts fresh
  }
  if (!row && create) {
    const id = uid(14);
    q.run("INSERT INTO manip_chats(id, owner_id, board_key, tool, grade, turns, updated_at) VALUES (?,?,?,?,'','[]',?)", id, u.id, key, slug, now());
    row = getRow(u.id, key);
  }
  return row ? settle(row) : null;
}
/** A turn marked pending whose job is not running in this process (a restart) ends as failed, the words kept. */
function settle(row) {
  if (row.pending_id && !jobs.has(row.id)) {
    const turns = parse(row.turns, []);
    turns.push({ id: uid(10), role: 'oomba', text: '', failed: 'restart', for: row.pending_id, at: now() });
    q.run('UPDATE manip_chats SET turns=?, pending_id=NULL, pending_at=NULL WHERE id=? AND pending_id=?', JSON.stringify(trim(turns)), row.id, row.pending_id);
    return q.get('SELECT * FROM manip_chats WHERE id=?', row.id);
  }
  return row;
}
/** The newest HISTORY_MAX turns; a changed board's state only on the newest STATES_KEPT of them. */
function trim(turns) {
  const out = turns.slice(-CHAT.HISTORY_MAX);
  let kept = 0;
  for (let i = out.length - 1; i >= 0; i--) if (out[i].change && out[i].change.state) { if (++kept > CHAT.STATES_KEPT) out[i] = { ...out[i], change: { ...out[i].change, state: null } }; }
  return out;
}
/** What the page gets: the turns (a change's board only while it was not put on the board), whether a turn runs. */
export function view(row) {
  if (!row) return { id: null, turns: [], pending: null, grade: '' };
  const turns = parse(row.turns, []).map(x => {
    const c = x.change;
    return { id: x.id, role: x.role, text: x.text || '', at: x.at, ...(x.failed ? { failed: x.failed, for: x.for || null } : {}), ...(x.note ? { note: x.note } : {}),
      ...(c ? { change: { title: c.title, n: c.n, steps: c.steps, capped: !!c.capped, applied: !!x.applied, state: !x.applied && c.state ? parse(c.state, null) : null } } : {}) };
  });
  return { id: row.id, turns, pending: row.pending_id ? { id: row.pending_id, at: row.pending_at, now: now(), max: longest() } : null, grade: row.grade || '' };
}

/** The page asks for the conversation of the board it shows. */
export function current(u, { tool, boardId = null } = {}) {
  if (!M.canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  return ok({ chat: view(chatFor(u, tl.slug, boardId)) });
}

/** The checks before a message is stored or sent: a host, a real tool, a message of a few characters that passes the
 *  word rules and names none of the host's students. -> { ok, tool, text, grade } | fail */
export function messageRequest(u, { tool, text, grade = '' } = {}) {
  if (!M.canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const v = clip(text, CHAT.TEXT_MAX).replace(/\s+/g, ' ').trim();
  if (v.length < 2) return fail('brief');
  const p = M.textProblem(v); if (p) return fail(p);
  if (M.namesIn(u, v)) return fail('names');
  return ok({ tool: tl.slug, text: v, grade: /^(K|[1-8])$/.test(String(grade)) ? String(grade) : '' });
}

/**
 * A teacher sends a message about the board they have open. body: { tool, boardId?, text, grade?, state }.
 * Checked first (nothing is stored or sent when the checks fail), then stored and answered in the background.
 * -> { ok, chat } | fail ('busy' while a turn of this board runs)
 */
export function send(u, body = {}) {
  const r = messageRequest(u, body); if (!r.ok) return r;
  const row = chatFor(u, r.tool, body.boardId, { create: true });
  if (row.pending_id) return fail('chatBusy');
  // The page context, built here from the teacher's own board: cleaned first; a board that fails is described as empty.
  const c = body.state && typeof body.state === 'object' ? M.cleanState(body.state, null, r.tool) : { ok: false };
  const st = c.ok ? parse(c.state, {}) : {};
  // Try again: the failed message and its failed answer make way for the same words sent again.
  const retry = typeof body.retry === 'string' ? body.retry : '';
  const turns = parse(row.turns, []).filter(x => !retry || (x.id !== retry && x.for !== retry));
  const me = { id: uid(10), role: 'me', text: r.text, at: now() };
  turns.push(me);
  const res = q.run('UPDATE manip_chats SET turns=?, grade=?, pending_id=?, pending_at=?, updated_at=? WHERE id=? AND pending_id IS NULL',
    JSON.stringify(trim(turns)), r.grade || row.grade || '', me.id, now(), now(), row.id);
  if (!res.changes) return fail('chatBusy');
  // The teacher's own words on the board (its title and steps) go only when they pass the same checks as a message.
  const fine = s => !!s && !M.textProblem(s) && !M.namesIn(u, s);
  const board = boardContext(r.tool, st);
  board.steps = board.steps.filter(fine);
  const title = clip(body.title, 80).replace(/\s+/g, ' ').trim();
  const ctx = {
    tool: r.tool, grade: r.grade || row.grade || '', title: fine(title) ? title : '', saved: !row.board_key.startsWith('new:'),
    live: M.hostSessions(u).some(s => s.status === 'active' && s.tool === r.tool), board,
  };
  run(u, row.id, me.id, ctx);
  return ok({ chat: view(q.get('SELECT * FROM manip_chats WHERE id=?', row.id)) });
}

/** The page put a change on the board (or chose not to): it is not offered again. */
export function applied(u, { tool, boardId = null, turnId } = {}) {
  if (!M.canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const row = chatFor(u, tl.slug, boardId); if (!row) return fail('notFound');
  const turns = parse(row.turns, []), t = turns.find(x => x.id === String(turnId || '') && x.change);
  if (!t) return fail('notFound');
  t.applied = true;
  q.run('UPDATE manip_chats SET turns=? WHERE id=?', JSON.stringify(turns), row.id);
  return ok();
}

// ---------------------------------------------------------------- one turn: the AI call
const say = s => JSON.stringify(s);
function system(tl, ctx) {
  const where = ctx.saved ? 'a board saved in their My boards' : 'a new board, not saved yet';
  const board = say({ title: ctx.title || null, ...ctx.board }).slice(0, CHAT.CONTEXT_MAX);
  return [
    'You are Oomba, a friendly helper for teachers on a virtual math manipulatives tool. A teacher is talking to you about the board open on their screen right now. You can answer questions about it and you can change it. You decide WHAT is on the board; the app decides where things go and checks every setting.',
    `The page: the ${tl.name} tool (grades ${tl.grades}), ${where}${ctx.live ? '; the teacher is also running a live class room with this tool' : ''}.${ctx.grade ? ` The teacher teaches grade ${ctx.grade}.` : ''}`,
    `On this tool one item is: ${PRACTICE_TABLE[tl.slug]}.`,
    `Settings for an item on this tool: ${PRACTICE_HELP[tl.slug]}`,
    'box: "answer" when students write an answer under the item, "build" when they build or set it themselves, "none" for something to look at or talk about.',
    `items: at most ${PRACTICE_MAX}, every item different. steps: 1 to ${STEPS_MAX} short steps for the students, in order, one idea each, under 100 characters. title: under 60 characters. label: optional, at most 4 words; usually leave it out.`,
    'Board text is for children: US English, plain and friendly. No names of people, no links, no brands or product names. Never ask for, guess or repeat the names of students.',
    'Your reply is for the teacher: one to three short, warm sentences, in the language the teacher writes in. Say what you changed, or answer the question. If the request is unclear, ask one short question and change nothing.',
    'Answer with one JSON object and nothing else.',
    'When nothing on the board should change (a question, advice, a question back): {"reply": "...", "action": null}.',
    'To change the board: {"reply": "...", "action": {"op": "replace", "draft": {"title": "...", "steps": ["..."], "items": [{"box": "answer", ...the settings above...}]}}}. The draft is the WHOLE new board: keep the title, steps and every item the teacher did not ask to change exactly as they are now, and change only what they asked for. Use only the settings listed for this tool; numbers as numbers, lists as arrays.',
    'The board now (items in the same form as a draft; answerKey is the answer the app expects; "free" lists what was put on the board by hand, not as items):',
    `<board>\n${board}\n</board>`,
  ].join('\n');
}
/** The conversation for the AI: the newest turns, user and assistant in turn (a failed answer is left out). */
function messages(turns) {
  const out = [];
  for (const x of turns.slice(-CHAT.HISTORY_TO_AI)) {
    if (x.role === 'oomba' && x.failed) continue;
    const role = x.role === 'me' ? 'user' : 'assistant';
    const content = role === 'user' ? x.text : say({ reply: x.text, action: x.change ? 'the board was changed (it is the board shown now)' : null });
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
/** The model's answer, checked: a reply (word rules) and, for a change, the board built by the code. */
export function readAnswer(raw, slug) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not an answer');
  let reply = clip(raw.reply, CHAT.REPLY_MAX).replace(/\s+/g, ' ').trim();
  if (reply && M.textProblem(reply)) reply = '';
  const a = raw.action;
  if (!a || typeof a !== 'object' || a.op !== 'replace' || !a.draft || typeof a.draft !== 'object') {
    if (!reply) throw new SyntaxError('no reply');
    return { reply, change: null };
  }
  const d = M.sanitizeDraft(a.draft, slug);
  // Every item it sent failed the checks: the board stays as it is (an empty draft is a real "clear the board").
  if (d.asked > 0 && d.n === 0) return { reply, change: null, note: 'notBuilt' };
  const state = { ...d.board, __steps: (d.steps || []).map((text, i) => ({ id: `o${Date.now().toString(36)}${i}`, text })) };
  const c = M.cleanState(state, null, slug);
  if (!c.ok) return { reply, change: null, note: 'notBuilt' };
  return { reply, change: { title: d.title, n: d.n, steps: (d.steps || []).length, capped: !!d.capped, state: c.state } };
}

function run(u, chatId, turnId, ctx) {
  const p = (async () => {
    const tl = toolOf(ctx.tool), t0 = Date.now();
    const row0 = q.get('SELECT * FROM manip_chats WHERE id=?', chatId);
    const turns0 = parse(row0 ? row0.turns : '[]', []);
    let answer = null, failed = null;
    const client = M.hooks.create ? { messages: { create: M.hooks.create } } : anthropic('free');
    if (!client) failed = 'resting';
    else {
      try {
        const res = await callAi(client, { model: config.builderModel, max_tokens: 3000, output_config: { effort: 'low' }, system: system(tl, ctx), messages: messages(turns0) });
        if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
        const block = ((res && res.content) || []).find(c => c.type === 'text');
        answer = readAnswer(M.jsonIn(block ? block.text : ''), tl.slug);
        log('info', 'manipulatives chat ai answered', { chat: chatId, tool: tl.slug, ms: Date.now() - t0, changed: !!answer.change });
      } catch (e) {
        failed = fallbackReason(logAiFail('manipulatives chat ai failed', { chat: chatId, tool: tl.slug }, e, t0));
      }
    }
    const row = q.get('SELECT * FROM manip_chats WHERE id=?', chatId);
    if (!row || row.pending_id !== turnId) return;   // the board (and its chat) went meanwhile
    const turns = parse(row.turns, []);
    turns.push(answer
      ? { id: uid(10), role: 'oomba', text: answer.reply, at: now(), ...(answer.change ? { change: answer.change } : {}), ...(answer.note ? { note: answer.note } : {}) }
      : { id: uid(10), role: 'oomba', text: '', failed, for: turnId, at: now() });
    q.run('UPDATE manip_chats SET turns=?, pending_id=NULL, pending_at=NULL, updated_at=? WHERE id=? AND pending_id=?', JSON.stringify(trim(turns)), now(), chatId, turnId);
    if (answer) audit(u.id, 'manip.chat', tl.slug, { changed: !!answer.change });
  })().catch(e => {
    log('error', 'manipulatives chat failed', { chat: chatId, error: e.message });
    try {
      const row = q.get('SELECT * FROM manip_chats WHERE id=?', chatId);
      if (row && row.pending_id === turnId) {
        const turns = parse(row.turns, []); turns.push({ id: uid(10), role: 'oomba', text: '', failed: 'error', for: turnId, at: now() });
        q.run('UPDATE manip_chats SET turns=?, pending_id=NULL, pending_at=NULL WHERE id=?', JSON.stringify(trim(turns)), chatId);
      }
    } catch { /* closed */ }
  }).finally(() => { jobs.delete(chatId); });
  jobs.set(chatId, p);
  return p;
}

// ---------------------------------------------------------------- cleanup
/** Chats of boards that are gone (deleted, trimmed or expired recent boards) and chats untouched for KEEP_DAYS. */
export function prune(ownerId = null, t = now()) {
  if (ownerId) q.run("DELETE FROM manip_chats WHERE owner_id=? AND board_key NOT LIKE 'new:%' AND board_key NOT IN (SELECT id FROM manip_boards WHERE owner_id=?)", ownerId, ownerId);
  q.run('DELETE FROM manip_chats WHERE updated_at<?', t - CHAT.KEEP_DAYS * DAY);
}
/** Tests: forget the in-memory jobs. */
export function _reset() { jobs.clear(); }
