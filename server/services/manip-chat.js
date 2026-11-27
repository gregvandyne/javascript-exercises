// The Manipulatives page workflow of Oomba, the teaching companion (docs/decisions.md "Virtual math manipulatives: Oomba
// chat" and "Oomba teaching companion: one chat everywhere"). Since the owner's "one chat everywhere" decision the board
// has no chat of its own: the companion (services/companion.js) knows it is on a host's board and has this page's tool,
// changeBoard. What stays here is the workflow itself, unchanged:
//
// - Who: hosts only (services/manipulatives.js canHost, the Teacher plan gate). Students never see it.
// - What the AI gets: the page context built HERE from the teacher's own board (cleanState first, boardContext): the
//   tool, the title, the steps and the items in the practice-set form (what each one shows, its settings, whether it
//   has an answer box), whether it is a new or a saved board, whether the teacher runs a live room on this tool, the
//   grade they chose. Never sticky notes, pen marks, typed board text, typed answers, names of students or their work.
// - A change is always a whole board draft that goes through sanitizeDraft (public/js/manip-practice.js buildPractice)
//   exactly like Draft with AI, then cleanState (readAnswer / buildChange): every board Oomba makes is checked and laid
//   out by the code. The page puts it on the board as one change (the board's own Undo, and Undo under the reply).
// - The old per-board conversations (manip_chats, migration 0103) are no longer written; they are pruned here after
// KEEP_DAYS and go with their board (deleteBoard) and with the account (the users foreign key).
import { q, now } from '../db.js';
import * as M from './manipulatives.js';
import { toolOf, stepsOf } from '../../public/js/manip-data.js';
import { fcCircles } from '../../public/js/manip-board.js';
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
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);


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
    // Each circle's pieces by size (a circle of 1/2, 1/4, 1/4: "1/2", "2/4"); a board saved before circles held pieces
    // (placed: one piece a circle) counted by size across the set, as it was read then.
    case 'fraction-circles': {
      const fs = !Array.isArray(st.circles) && Array.isArray(st.placed) ? counts(st.placed.map(p => num(p && p.d))).map(c => `${c.count}/${c.kind}`)
        : fcCircles(st).flatMap(c => counts(c.ps.map(p => p.d)).map(x => `${x.count}/${x.kind}`));
      return fs.length ? { fractions: fs.slice(0, 12) } : {};
    }
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

// ---------------------------------------------------------------- the page workflow
const say = s => JSON.stringify(s);
/** The page context the companion stores with a message sent from a board: the board as the AI may see it, checked
 *  here. body: { tool, boardId?, title?, grade?, state }. -> { tool, grade, title, saved, live, board } | null */
export function pageBoard(u, body = {}) {
  if (!M.canHost(u)) return null;
  const tl = toolOf(body.tool); if (!tl) return null;
  const c = body.state && typeof body.state === 'object' ? M.cleanState(body.state, null, tl.slug) : { ok: false };
  const st = c.ok ? parse(c.state, {}) : {};
  const fine = s => !!s && !M.textProblem(s) && !M.namesIn(u, s);
  const board = boardContext(tl.slug, st);
  board.steps = board.steps.filter(fine);
  while (say(board).length > CHAT.CONTEXT_MAX && board.items.length) board.items.pop();   // kept small: it is stored with the message
  if (say(board).length > CHAT.CONTEXT_MAX && board.free) delete board.free;
  const title = clip(body.title, 80).replace(/\s+/g, ' ').trim();
  const b = body.boardId ? M.ownBoard(u, String(body.boardId)) : null;
  return {
    tool: tl.slug, grade: /^(K|[1-8])$/.test(String(body.grade || '')) ? String(body.grade) : '', title: fine(title) ? title : '',
    saved: !!(b && b.kind === 'recent' && b.tool === tl.slug), live: M.hostSessions(u).some(s => s.status === 'active' && s.tool === tl.slug),
    board,
  };
}
/** The page workflow's rules for the companion's system prompt (only on a board). */
export function workflowRules(ctx) {
  const tl = toolOf(ctx.tool);
  const where = ctx.saved ? 'a board saved in their My boards' : 'a new board, not saved yet';
  return [
    `# This page: a ${tl.name} board in the Math Manipulatives`,
    `The teacher has a board open: the ${tl.name} tool (grades ${tl.grades}), ${where}${ctx.live ? '; the teacher is also running a live class room with this tool' : ''}.${ctx.grade ? ` The teacher teaches grade ${ctx.grade}.` : ''} To change it, call changeBoard. You decide WHAT is on the board; the app decides where things go and checks every setting.`,
    `On this tool one item is: ${PRACTICE_TABLE[tl.slug]}.`,
    `Settings for an item on this tool: ${PRACTICE_HELP[tl.slug]}`,
    'box: "answer" when students write an answer under the item, "build" when they build or set it themselves, "none" for something to look at or talk about.',
    `items: at most ${PRACTICE_MAX}, every item different. steps: 1 to ${STEPS_MAX} short steps for the students, in order, one idea each, under 100 characters. title: under 60 characters. label: optional, at most 4 words; usually leave it out.`,
    'Board text is for children: US English, plain and friendly. No names of people, no links, no brands or product names.',
    'To clear the board (take everything off), call changeBoard with clear: true and nothing else; never send the current board back for that.',
    'changeBoard takes the WHOLE new board: keep the title, steps and every item the teacher did not ask to change exactly as they are now, and change only what they asked for. Use only the settings listed for this tool; numbers as numbers, lists as arrays. Its result is the board read back as the page will show it: after it, say in one to three short sentences what is on the board now, only from that result, and say plainly what was left out and why.',
    'The board now (items in the same form as a draft; answerKey is the answer the app expects; "free" lists what was put on the board by hand, not as items):',
    `<board>\n${say({ title: ctx.title || null, ...ctx.board }).slice(0, CHAT.CONTEXT_MAX)}\n</board>`,
  ].join('\n');
}
/** changeBoard's input made into the board the page puts on: { change } | { note: 'notBuilt' }. */
export function buildChange(draft, slug) {
  try {
    const r = readAnswer({ reply: 'ok', action: { op: 'replace', draft } }, slug);
    return r.change ? { change: r.change } : { note: r.note || 'notBuilt' };
  } catch { return { note: 'notBuilt' }; }
}

export { PRACTICE_MAX };
/** A built board read back as the page will show it (services/verify-change.js): the title, the steps and each item in
 *  the same form the AI sees the board in, so the tool's result says what will actually be on it. */
export function readBack(slug, change) {
  const st = parse(change.state, {});
  const board = boardContext(slug, st);
  while (say(board).length > CHAT.CONTEXT_MAX && board.items.length) board.items.pop();
  return { title: change.title, ...board };
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
  return { reply, change: { title: d.title, n: d.n, steps: (d.steps || []).length, capped: !!d.capped, state: c.state, asked: d.asked || 0, dropped: Math.max(0, (d.asked || 0) - d.n) } };
}

// ---------------------------------------------------------------- cleanup
/** Chats of boards that are gone (deleted, trimmed or expired recent boards) and chats untouched for KEEP_DAYS. */
export function prune(ownerId = null, t = now()) {
  if (ownerId) q.run("DELETE FROM manip_chats WHERE owner_id=? AND board_key NOT LIKE 'new:%' AND board_key NOT IN (SELECT id FROM manip_boards WHERE owner_id=?)", ownerId, ownerId);
  q.run('DELETE FROM manip_chats WHERE updated_at<?', t - CHAT.KEEP_DAYS * DAY);
}

