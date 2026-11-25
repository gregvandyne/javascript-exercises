// Oomba's chat on a Mistake Hunt passage set (docs/decisions.md "Mistake Hunt, Phase 3"). The teacher talks to Oomba in a
// panel beside the builder ("fewer comma mistakes", "make it about volcanoes", "make passage 2 easier", "add a passage",
// "only spelling") and Oomba changes the set. The pattern is the Manipulatives chat's (services/manip-chat.js):
//
// - Who: Teacher plan holders, testers and the platform admin (chatAccess: proof-ai.js aiAccess 'plan'). A teacher without
//   the plan sees a calm "part of the Teacher plan" note while paid plans are on ('plan'); students, kids, family
//   grown-ups and guests never (null). The AI never talks to students.
// - What the AI gets: the context built HERE from the teacher's own draft, cleaned first (cleanDraft): the set's title,
//   grade, chosen kinds of mistake and how many a passage, each passage's correct text and its planted mistakes (kind,
//   what students see, the right words). Never anything about students. A title or passage that fails the word rules or
//   names one of the teacher's students is left out (the AI is told to keep that passage as it is). The teacher's message
//   passes textProblem and namesIn before anything is stored or sent.
// - What it answers: plain JSON { reply, action: null | { op: 'replace', set: { title, grade, kinds, perPassage, max,
//   passages: [{ keep: n } | { title, text }] } } }. The AI writes clean text only and never chooses where a mistake goes:
//   the server takes each passage (a kept one from the teacher's own draft, a new one through proof-ai's cleanPassage:
//   tidied, the length limits, the site's text filter unchanged) and proof-core plants the mistakes, so the key is always
//   the passage's own correct text. A kept passage whose kinds and count did not change keeps its mistakes as they are.
// - A turn is a job in this process: the POST stores the message and returns at once; the page asks how it is going.
//   One turn at a time per set. A turn cut off by a restart ends as failed when the chat is next read. Every failure is
//   one warn line without the teacher's words and a calm answer with Try again.
// - Kept: the newest HISTORY_MAX turns per teacher and set (proof_chats, migration 0105); a changed set's passages only on
//   the newest STATES_KEPT turns. Deleted with the set (game-sets remove; pruned here when the set is gone), after
//   KEEP_DAYS untouched, and with the account (game-sets forgetUser; the users foreign key too).
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { callAi, logAiFail, fallbackReason, AI_CALL } from './ai-call.js';
import { log } from './log.js';
import { makeT } from '../i18n/index.js';
import { jsonIn, textProblem } from './manipulatives.js';
import { cleanText } from './textfilter.js';
import { proofCore, proofT } from './proof-core.js';
import * as gameSets from './game-sets.js';
import { planTools, namesIn, cleanPassage, hooks as aiHooks } from './proof-ai.js';

export const CHAT = {
  TEXT_MAX: 1000,        // a teacher's message
  REPLY_MAX: 600,        // Oomba's reply
  HISTORY_MAX: 20,       // turns kept per set
  HISTORY_TO_AI: 8,      // turns sent with a message
  STATES_KEPT: 3,        // newest changed sets whose passages are kept
  CONTEXT_MAX: 16000,    // characters of set context
  FRESH_MS: 30 * 60e3,   // a new set's chat is taken over by its first save within this
  KEEP_DAYS: 60,
};
const DAY = 86400e3;
const SLUG = 'mistake-hunt';
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Kinds of mistake by family, for "fewer comma mistakes" (a cap a passage): a kind, a group of the game's five, or one of
 *  these. */
export const FAMILIES = {
  commas: ['pc-series', 'pc-intro', 'pc-compound'],
  capitals: ['pc-start', 'pc-i', 'pc-proper', 'pc-stray'],
  apostrophes: ['pc-possessive', 'pc-contraction'],
  homophones: ['us-there', 'us-to', 'us-its', 'us-your', 'us-homophone'],
};
/** The kinds a cap's key covers ([] for an unknown key). */
export function kindsOf(key) {
  const P = proofCore(), k = String(key || '');
  if (P.BY[k]) return [k];
  if (FAMILIES[k]) return FAMILIES[k].slice();
  return P.TYPES.filter(t => t.g === k).map(t => t.k);
}

/** Who may chat: 'yes' (the Teacher plan, a tester, the platform admin), 'plan' (a teacher without it while paid plans
 *  are on: the plan note) or null (nobody else; the normal answer). */
export const chatAccess = planTools;

/** This process's running turns: chat id -> promise. */
const jobs = new Map();
export const settled = id => jobs.get(id) || Promise.resolve();
export const longest = () => AI_CALL.timeoutMs + 15e3;

// ---------------------------------------------------------------- the set, as the page sends it
/**
 * The teacher's draft from the page, cleaned: { T, g, types, n, p: [{ t, x, m }] }. A passage whose text is not one a
 * set can keep (the game's tidying, the length limits, the text filter unchanged) is left out; mistakes that do not fit
 * their passage are dropped; a passage not planted yet has m []. Nothing else from the page is kept.
 */
export function cleanDraft(raw) {
  const P = proofCore(), d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ct = typeof d.T === 'string' ? cleanText(d.T.replace(/\s+/g, ' ').trim(), P.LIMITS.title) : { ok: false };
  const g = Number.isInteger(d.g) && d.g >= 0 && d.g <= 8 ? d.g : 4;
  const types = (Array.isArray(d.types) ? d.types : []).filter((k, i, a) => typeof k === 'string' && P.BY[k] && a.indexOf(k) === i);
  const n = int(d.n, 1, P.LIMITS.perPassage) || 6;
  const p = [];
  for (const it of (Array.isArray(d.p) ? d.p : []).slice(0, P.LIMITS.passages)) {
    if (!it || typeof it !== 'object' || typeof it.x !== 'string' || !it.x) continue;
    const x = it.x;
    if (x.length < P.LIMITS.minText || x.length > P.LIMITS.maxText || P.normText(x) !== x) continue;
    const cx = cleanText(x, P.LIMITS.maxText); if (!cx.ok || cx.value !== x) continue;
    const tt = typeof it.t === 'string' ? cleanText(it.t.replace(/\s+/g, ' ').trim(), P.LIMITS.title) : { ok: false };
    let m = (Array.isArray(it.m) ? it.m : []).filter(mm => mm && typeof mm === 'object' && Number.isInteger(mm.a) && Number.isInteger(mm.b) && typeof mm.w === 'string' && typeof mm.k === 'string')
      .map(mm => { const c = { a: mm.a, b: mm.b, w: mm.w, k: mm.k }; if (mm.p === 1 || mm.p === true) c.p = 1; if (typeof mm.y === 'string' && mm.y) c.y = mm.y.slice(0, P.LIMITS.why); if (c.y && mm.ai) c.ai = 1; return c; })
      .slice(0, P.LIMITS.perPassage);
    if (m.length && (P.problem(x, m) || m.some(mm => { const c = cleanText(mm.w, P.LIMITS.wrong); return !c.ok || c.value !== mm.w; }))) m = [];
    p.push({ t: tt.ok ? tt.value : '', x, m });
  }
  return { T: ct.ok ? ct.value : '', g, types, n, p };
}

/** What the AI sees of the set: the words only, a passage that names one of the teacher's students hidden. */
export function setContext(u, d) {
  const P = proofCore(), en = proofT('en');
  const fine = s => !!s && !textProblem(s) && !namesIn(u, s);
  return {
    title: fine(d.T) ? d.T : '',
    grade: d.g,
    kinds: d.types,
    perPassage: d.n,
    passages: d.p.map((p, i) => {
      if (!fine(p.x) || (p.t && !fine(p.t))) return { n: i + 1, hidden: true, mistakes: p.m.length };
      const key = p.m.length ? P.key(p.x, p.m) : [];
      return { n: i + 1, title: p.t, text: p.x, mistakes: key.map(k => ({ kind: k.k, name: en(`ty.${k.k}`), studentsSee: k.wrong, right: k.right })) };
    }),
  };
}

// ---------------------------------------------------------------- the conversation row
const setKey = (u, setId) => {
  const s = setId ? gameSets.get(gameId(), setId) : null;
  return s && s.ownerId === u.id ? s.id : 'new';
};
let gid = null;
const gameId = () => (gid ??= (q.get("SELECT id FROM games WHERE slug=? AND source='seed'", SLUG) || {}).id || '');
export const _resetGame = () => { gid = null; };
const getRow = (ownerId, key) => q.get('SELECT * FROM proof_chats WHERE owner_id=? AND set_key=?', ownerId, key) || null;
/** The chat of a set: a saved set's own, or the newest new-set chat (within FRESH_MS), which the saved set then takes
 *  over. create: make one when there is none. */
function chatFor(u, setId, { create = false } = {}) {
  prune(u.id);
  const key = setKey(u, setId);
  let row = getRow(u.id, key);
  if (!row) {
    const fresh = q.get("SELECT * FROM proof_chats WHERE owner_id=? AND set_key='new' AND updated_at>?", u.id, now() - CHAT.FRESH_MS);
    if (fresh && key !== 'new') { q.run('UPDATE proof_chats SET set_key=? WHERE id=?', key, fresh.id); row = getRow(u.id, key); }
    else if (fresh) row = fresh;
    else q.run("DELETE FROM proof_chats WHERE owner_id=? AND set_key='new'", u.id);
  }
  if (!row && create) {
    const id = uid(14);
    q.run("INSERT INTO proof_chats(id, owner_id, set_key, grade, turns, updated_at) VALUES (?,?,?,'','[]',?)", id, u.id, key, now());
    row = getRow(u.id, key);
  }
  return row ? settle(row) : null;
}
function settle(row) {
  if (row.pending_id && !jobs.has(row.id)) {
    const turns = parse(row.turns, []);
    turns.push({ id: uid(10), role: 'oomba', text: '', failed: 'restart', for: row.pending_id, at: now() });
    q.run('UPDATE proof_chats SET turns=?, pending_id=NULL, pending_at=NULL WHERE id=? AND pending_id=?', JSON.stringify(trim(turns)), row.id, row.pending_id);
    return q.get('SELECT * FROM proof_chats WHERE id=?', row.id);
  }
  return row;
}
function trim(turns) {
  const out = turns.slice(-CHAT.HISTORY_MAX);
  let kept = 0;
  for (let i = out.length - 1; i >= 0; i--) if (out[i].change && out[i].change.set) { if (++kept > CHAT.STATES_KEPT) out[i] = { ...out[i], change: { ...out[i].change, set: null } }; }
  return out;
}
/** What the page gets: the turns (a change's set only while it was not put in the builder), whether a turn runs. */
export function view(row) {
  if (!row) return { id: null, turns: [], pending: null };
  const turns = parse(row.turns, []).map(x => {
    const c = x.change;
    return { id: x.id, role: x.role, text: x.text || '', at: x.at, ...(x.failed ? { failed: x.failed, for: x.for || null } : {}), ...(x.note ? { note: x.note } : {}), ...(x.verify ? { verify: x.verify } : {}),
      ...(c ? { change: { passages: c.passages, mistakes: c.mistakes, written: c.written, dropped: c.dropped || 0, applied: !!x.applied, set: !x.applied && c.set ? c.set : null } } : {}) };
  });
  return { id: row.id, turns, pending: row.pending_id ? { id: row.pending_id, at: row.pending_at, now: now(), max: longest() } : null };
}

/** The page asks for the conversation of the set it shows. */
export function current(u, { setId = null } = {}) {
  const a = chatAccess(u);
  if (a !== 'yes') return fail(a === 'plan' ? 'teacherPlan' : 'notAllowed');
  return ok({ chat: view(chatFor(u, setId)) });
}

/** The checks before a message is stored or sent. -> { ok, text } | fail */
export function messageRequest(u, { text } = {}) {
  const a = chatAccess(u);
  if (a !== 'yes') return fail(a === 'plan' ? 'teacherPlan' : 'notAllowed');
  const v = clip(text, CHAT.TEXT_MAX).replace(/\s+/g, ' ').trim();
  if (v.length < 2) return fail('brief');
  const p = textProblem(v); if (p) return fail(p);
  if (namesIn(u, v)) return fail('names');
  return ok({ text: v });
}

/**
 * A teacher sends a message about the set open in the builder. body: { setId?, text, set (the draft), retry? }.
 * -> { ok, chat } | fail ('chatBusy' while a turn of this set runs)
 */
export function send(u, body = {}) {
  const r = messageRequest(u, body); if (!r.ok) return r;
  const row = chatFor(u, body.setId, { create: true });
  if (row.pending_id) return fail('chatBusy');
  const draft = cleanDraft(body.set);
  const retry = typeof body.retry === 'string' ? body.retry : '';
  const turns = parse(row.turns, []).filter(x => !retry || (x.id !== retry && x.for !== retry));
  const me = { id: uid(10), role: 'me', text: r.text, at: now() };
  turns.push(me);
  const res = q.run('UPDATE proof_chats SET turns=?, grade=?, pending_id=?, pending_at=?, updated_at=? WHERE id=? AND pending_id IS NULL',
    JSON.stringify(trim(turns)), String(draft.g), me.id, now(), now(), row.id);
  if (!res.changes) return fail('chatBusy');
  run(u, row.id, me.id, { draft, saved: row.set_key !== 'new', context: setContext(u, draft), lang: typeof body.lang === 'string' ? body.lang : 'en' });
  return ok({ chat: view(q.get('SELECT * FROM proof_chats WHERE id=?', row.id)) });
}

/** The page put a change in the builder (or chose not to): it is not offered again. */
export function applied(u, { setId = null, turnId } = {}) {
  if (chatAccess(u) !== 'yes') return fail('notAllowed');
  const row = chatFor(u, setId); if (!row) return fail('notFound');
  const turns = parse(row.turns, []), t = turns.find(x => x.id === String(turnId || '') && x.change);
  if (!t) return fail('notFound');
  t.applied = true;
  q.run('UPDATE proof_chats SET turns=? WHERE id=?', JSON.stringify(turns), row.id);
  return ok();
}

// ---------------------------------------------------------------- one turn: the AI call
const say = s => JSON.stringify(s);
export function system(ctx) {
  const P = proofCore(), en = proofT('en');
  const kinds = P.TYPES.map(t => `${t.k}: ${en(`ty.${t.k}`)} (${t.g}, ${t.cc}, from grade ${t.gr === 0 ? 'K' : t.gr})`).join('\n');
  const set = say(ctx.context).slice(0, CHAT.CONTEXT_MAX);
  return [
    'You are Oomba, a friendly helper for teachers on Mistake Hunt, a proofreading game on Oomba Academy, a kid-safe learning website. A teacher is talking to you about the passage set open in their builder right now. You can answer questions about it and you can change it.',
    'How the set works: each passage is CORRECT text written for children. The app plants the mistakes in it by code (it chooses where, from the kinds of mistake the teacher picked and how many a passage). You never write mistakes and never choose where they go. You decide the passages\' words, the grade, which kinds of mistake, how many a passage, and caps.',
    `The kinds of mistake (id: name (group, Common Core code, from grade)):\n${kinds}`,
    `Groups: spell, usage, grammar, sent, punct. Families for caps: ${Object.keys(FAMILIES).join(', ')}.`,
    'Answer with one JSON object and nothing else.',
    'When nothing should change (a question, advice, a question back): {"reply": "...", "action": null}.',
    'To change the set: {"reply": "...", "action": {"op": "replace", "set": {"title": "...", "grade": 4, "kinds": ["sp-common", "pc-end"], "perPassage": 6, "max": {"commas": 1}, "passages": [{"keep": 1}, {"keep": 2, "count": 4}, {"title": "...", "text": "..."}]}}}.',
    'The set is the WHOLE new set, in order. Keep everything the teacher did not ask to change exactly as it is now. {"keep": n} keeps passage n\'s title and text exactly (add "title" to rename it, "count" for its own number of mistakes); always use keep for a passage you do not rewrite, and always for a hidden passage. A new or rewritten passage is {"title", "text"}. "max" (optional) caps a kind, group or family in each passage, e.g. {"commas": 1} for "fewer comma mistakes"; 0 means none. "kinds" are ids from the list. perPassage: 1 to 15. grade: 0 (kindergarten) to 8. At most 8 passages.',
    'A passage you write: 40 to 1500 characters (short is 60 to 100 words), perfectly correct US English (spelling, capitals, punctuation, commas, apostrophes, grammar), at the grade\'s reading level, true and kind, for children: no names of real living people, no links, no brands, nothing scary or unkind. Use ordinary sentences with commas, a few names of places and a contraction or possessive here and there, so there is room for many kinds of mistakes. Paragraphs separated by a blank line. "Easier" means shorter, simpler sentences and words, and often fewer mistakes or easier kinds.',
    'Never ask for, guess or repeat the names of students. Nothing here is about students.',
    'Your reply is for the teacher: one to three short, warm sentences in the language the teacher writes in. Say what you changed, or answer the question. If the request is unclear, ask one short question and change nothing.',
    'The set now (passages with their planted mistakes; a hidden passage is the teacher\'s and is not shown to you):',
    `<set>\n${set}\n</set>`,
  ].join('\n');
}
function messages(turns) {
  const out = [];
  for (const x of turns.slice(-CHAT.HISTORY_TO_AI)) {
    if (x.role === 'oomba' && x.failed) continue;
    const role = x.role === 'me' ? 'user' : 'assistant';
    const content = role === 'user' ? x.text : say({ reply: x.text, action: x.change ? 'the set was changed (it is the set shown now)' : null });
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Plant n mistakes of the kinds with caps ({ key: most a passage }); pinned mistakes (keep) stay. */
export function plantCapped(x, { types, n, seed, keep = [], max = {} }) {
  const P = proofCore();
  const caps = Object.entries(max).map(([k, v]) => ({ ks: kindsOf(k), v }));
  const blocked = new Set(caps.filter(c => c.v === 0).flatMap(c => c.ks));
  const allowed = types.filter(k => !blocked.has(k));
  if (!allowed.length && !keep.length) return [];
  let m = P.plant(x, { types: allowed, n, seed, keep });
  const over = () => {
    const full = new Set();
    for (const c of caps) {
      let seen = 0;
      m = m.filter(mm => { if (!c.ks.includes(mm.k) || mm.p) return true; seen++; return seen <= c.v; });
      if (seen >= c.v) c.ks.forEach(k => full.add(k));
    }
    return full;
  };
  const full = over();
  if (m.length < n && full.size) {
    m = P.plant(x, { types: allowed.filter(k => !full.has(k)), n, seed: seed + 7, keep: m });
    over();
  }
  return m;
}

/**
 * The model's answer, checked: a reply and, for a change, the whole new set with every passage's mistakes planted by
 * proof-core. old: the cleaned draft the message was sent with. -> { reply, change: null | { set, passages, mistakes,
 * written, dropped }, note? }
 */
export function readAnswer(raw, old, u, seed = 1) {
  const P = proofCore();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not an answer');
  let reply = clip(raw.reply, CHAT.REPLY_MAX).replace(/\s+/g, ' ').trim();
  if (reply && textProblem(reply)) reply = '';
  const a = raw.action;
  if (!a || typeof a !== 'object' || a.op !== 'replace' || !a.set || typeof a.set !== 'object' || Array.isArray(a.set)) {
    if (!reply) throw new SyntaxError('no reply');
    return { reply, change: null };
  }
  const s = a.set;
  const g = int(s.grade, 0, 8) ?? old.g;
  let types = (Array.isArray(s.kinds) ? s.kinds : []).filter((k, i, arr) => typeof k === 'string' && P.BY[k] && arr.indexOf(k) === i);
  if (!types.length) types = old.types.length ? old.types.slice() : P.preset(g);
  const n = int(s.perPassage, 1, P.LIMITS.perPassage) || old.n;
  const max = {};
  if (s.max && typeof s.max === 'object' && !Array.isArray(s.max)) for (const [k, v] of Object.entries(s.max).slice(0, 12)) if (kindsOf(k).length && int(v, 0, P.LIMITS.perPassage) !== null) max[k] = v;
  const sameRules = types.length === old.types.length && types.every(k => old.types.includes(k)) && n === old.n && !Object.keys(max).length;
  const fineTitle = t => { if (typeof t !== 'string') return null; const c = cleanText(t.replace(/\s+/g, ' ').trim(), P.LIMITS.title); return c.ok && !namesIn(u, c.value) ? c.value : null; };
  const out = []; let dropped = 0, written = 0, sd = Math.max(1, Math.floor(seed) % 999983);
  for (const e of (Array.isArray(s.passages) ? s.passages : []).slice(0, P.LIMITS.passages * 2)) {
    if (out.length >= P.LIMITS.passages || !e || typeof e !== 'object') continue;
    const k = int(e.keep, 1, old.p.length);
    const count = int(e.count, 1, P.LIMITS.perPassage);
    sd = (sd % 999983) + 1;
    if (k) {
      const base = old.p[k - 1];
      const t = fineTitle(e.title) ?? base.t;
      // a kept passage under the same rules keeps its mistakes (why lines and pins too); otherwise planted again
      const m = sameRules && !count && base.m.length ? base.m.map(mm => ({ ...mm }))
        : plantCapped(base.x, { types, n: count || n, seed: sd, keep: base.m.filter(mm => mm.p), max });
      out.push({ t, x: base.x, m: m.filter(okWrong) });
      continue;
    }
    const x = cleanPassage(e.text);
    if (!x || textProblem(x) || namesIn(u, x)) { dropped++; continue; }
    const m = plantCapped(x, { types, n: count || n, seed: sd, max }).filter(okWrong);
    if (!m.length || P.problem(x, m)) { dropped++; continue; }
    out.push({ t: fineTitle(e.title) ?? '', x, m, ai: 1 });
    written++;
  }
  if (!out.length) return { reply, change: null, note: 'notBuilt' };
  const title = fineTitle(s.title) ?? old.T;
  return { reply, change: { set: { T: title, g, types, n, p: out }, passages: out.length, mistakes: out.reduce((t, p) => t + p.m.length, 0), written, dropped } };
}
const okWrong = m => { const c = cleanText(m.w, 80); return c.ok && c.value === m.w; };

/** Checked work (services/verify-change.js; docs/decisions.md "Builders check their work"): the AI wrote its reply
 *  before the server built the set, so when nothing could be built, or passages were left out by the checks, the
 *  reply ends with the app's own words saying so, and the turn carries what landed (verify). */
function checked(answer, lang = 'en') {
  const tt = makeT(lang);
  const add = fix => `${clip(answer.reply, Math.max(0, CHAT.REPLY_MAX - fix.length - 1)).trim()} ${fix}`.trim();
  if (answer.note === 'notBuilt') return { ...answer, reply: add(tt('proof.chatCheck.notBuilt')), verify: { ok: false, landed: 0, notLanded: [{ code: 'notBuilt' }] } };
  const c = answer.change;
  if (c && c.dropped) return { ...answer, reply: add(tt('proof.chatCheck.dropped', { count: c.dropped })), verify: { ok: false, landed: c.passages, notLanded: [{ code: 'filtered', count: c.dropped }] } };
  return c ? { ...answer, verify: { ok: true, landed: c.passages, notLanded: [] } } : answer;
}
function run(u, chatId, turnId, ctx) {
  const p = (async () => {
    const t0 = Date.now();
    const row0 = q.get('SELECT * FROM proof_chats WHERE id=?', chatId);
    const turns0 = parse(row0 ? row0.turns : '[]', []);
    let answer = null, failed = null;
    const client = aiHooks.create ? { messages: { create: aiHooks.create } } : anthropic('free');
    if (!client) failed = 'resting';
    else {
      try {
        const res = await callAi(client, { model: config.builderModel, max_tokens: 6000, output_config: { effort: 'low' }, system: system(ctx), messages: messages(turns0) });
        if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
        const block = ((res && res.content) || []).find(c => c.type === 'text');
        answer = checked(readAnswer(jsonIn(block ? block.text : ''), ctx.draft, u, Date.now() % 99991), ctx.lang);
        log('info', 'mistake hunt chat ai answered', { chat: chatId, ms: Date.now() - t0, changed: !!answer.change });
      } catch (e) {
        failed = fallbackReason(logAiFail('mistake hunt chat ai failed', { chat: chatId, tool: SLUG }, e, t0));
      }
    }
    const row = q.get('SELECT * FROM proof_chats WHERE id=?', chatId);
    if (!row || row.pending_id !== turnId) return;   // the set (and its chat) went meanwhile
    const turns = parse(row.turns, []);
    turns.push(answer
      ? { id: uid(10), role: 'oomba', text: answer.reply, at: now(), ...(answer.change ? { change: answer.change } : {}), ...(answer.note ? { note: answer.note } : {}), ...(answer.verify ? { verify: answer.verify } : {}) }
      : { id: uid(10), role: 'oomba', text: '', failed, for: turnId, at: now() });
    q.run('UPDATE proof_chats SET turns=?, pending_id=NULL, pending_at=NULL, updated_at=? WHERE id=? AND pending_id=?', JSON.stringify(trim(turns)), now(), chatId, turnId);
    if (answer) audit(u.id, 'proof.chat', SLUG, { changed: !!answer.change });
  })().catch(e => {
    log('error', 'mistake hunt chat failed', { chat: chatId, error: e.message });
    try {
      const row = q.get('SELECT * FROM proof_chats WHERE id=?', chatId);
      if (row && row.pending_id === turnId) {
        const turns = parse(row.turns, []); turns.push({ id: uid(10), role: 'oomba', text: '', failed: 'error', for: turnId, at: now() });
        q.run('UPDATE proof_chats SET turns=?, pending_id=NULL, pending_at=NULL WHERE id=?', JSON.stringify(trim(turns)), chatId);
      }
    } catch { /* closed */ }
  }).finally(() => { jobs.delete(chatId); });
  jobs.set(chatId, p);
  return p;
}

// ---------------------------------------------------------------- cleanup
/** Chats of sets that are gone, and chats untouched for KEEP_DAYS. */
export function prune(ownerId = null, t = now()) {
  if (ownerId) q.run("DELETE FROM proof_chats WHERE owner_id=? AND set_key!='new' AND set_key NOT IN (SELECT id FROM game_sets WHERE owner_id=?)", ownerId, ownerId);
  q.run('DELETE FROM proof_chats WHERE updated_at<?', t - CHAT.KEEP_DAYS * DAY);
}
/** A set was deleted: its chat goes with it. */
export const forgetSet = (ownerId, setId) => q.run('DELETE FROM proof_chats WHERE owner_id=? AND set_key=?', ownerId, String(setId || ''));
export const forgetUser = userId => q.run('DELETE FROM proof_chats WHERE owner_id=?', userId);
export function _reset() { jobs.clear(); }
