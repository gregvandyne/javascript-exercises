// The Builder in the Oomba chat, phase 2 (docs/decisions.md "Builder in the chat (phase 2)"): a teacher builds a game
// entirely in the companion chat. ONE Builder engine (builder/runner.js, agent.js: screen.js, the scanner, the playtest
// and the publish rules all run exactly as for a Studio message), two doors: teachers build here, kids keep the Studio.
//
//   1. ASK. "Make a grade 4 game about regrouping": Oomba's startBuild (the AI decides it is a build) makes an ask card
//      with only the questions the message did not answer (what to make, where they play, how much help). Nothing is
//      built. A lesson plan goes to the existing lesson maker (the 'lesson' job of services/companion.js, makeLesson's
//      own draft and save).
//   2. PLAN. The plan card: what students do (from the choices, never invented), the teacher's own words in an editable
//      box (sent to the Builder as they are), Build it (one tap: it spends one of today's builds) and Change.
//   3. BUILDING. Build it makes the game the way POST /api/studio/new does (an empty game), and a background job of kind
//      'game' (services/oomba-jobs.js) sends the first Builder message with the plan (POST /api/studio/:id/chat's
//      runner.submit). The card follows the Builder's own live steps (runner.jobFor: the steps /api/studio/:id/live
//      replays), read by the page from GET /api/companion/build/:gameId. The chat is never blocked.
//   4. DONE. When the build ends the job reads the version back: the safety scan (game_versions.safety_status), the
//      playthrough the publish rules need (services/playthrough.js ensure: run now when the build did not) and the
//      sizes the automatic playtest checked ('playtest' event). Oomba's words on the card say only what was really
//      checked. The preview is the Builder's own sandboxed frame, its address minted per viewer.
//   5. CHANGE BY MESSAGE. A message about a game made in this chat (changeGame) goes to that game's Builder VERBATIM:
//      no AI rewrite, no tap (Studio does not ask either), screened by the Builder like any message. A new version;
//      the old one stays in Versions.
// Students' names never reach any AI: the chat's own scrubber already put placeholders in the teacher's words, and the
// runner scrubs a plan's words again (runner.submit, builder/lesson.js). Only teachers have the companion; kids and
// everyone else are untouched (the Studio and /build/new stay as they are).
import { q, db, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import * as games from './games.js';
import * as J from './oomba-jobs.js';
import * as C from './oomba-chat.js';
import { companionFor } from './companion-settings.js';
import { tFor } from '../i18n/index.js';
import * as runner from '../builder/runner.js';
import * as turns from '../builder/turns.js';
import { loadChat } from '../builder/chat.js';
import { turnsLeft } from '../builder/usage.js';
import { previewUrl } from '../builder/tools.js';
import { usesPlan } from '../builder/plan.js';
import { studentNames, scrub } from '../builder/lesson.js';
import { SANDBOX } from './frame.js';
import * as PT from './playthrough.js';
import * as S from './schools.js';
import * as CM from './companion-make.js';
import { log } from './log.js';

const SURFACE = 'companion', KEY = 'main';
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clip = (s, n) => C.clip(s, n);
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
/** Test hooks: provider forces the Builder's provider (a test's held build), like runner.submit's own. */
export const hooks = { provider: null };

/** May this teacher build in the chat? The companion (Teacher plan staff), their Builder on, and COMPANION_BUILD on. */
export const on = u => !!u && config.companionBuild !== false && !!u.builder_enabled && !u.banned && companionFor(u);
const chatRow = u => q.get('SELECT * FROM oomba_chats WHERE owner_id=? AND surface=? AND ctx_key=?', u.id, SURFACE, KEY) || null;

// ---------------------------------------------------------------- the choices
export const QUESTIONS = Object.freeze(['kind', 'use', 'help']);
export const OPTIONS = Object.freeze({ kind: ['game', 'lesson'], use: ['devices', 'board'], help: ['show', 'hints', 'own'] });
export const ICONS = Object.freeze({ game: '🎮', lesson: '📋', devices: '💻', board: '🖥️', show: '👀', hints: '💡', own: '🎯' });
/** "How much help?" -> the Builder's SUPPORTS levels (builder/plan.js): a worked example first (Watch), a hint after a
 *  wrong try (Guided), no hints (On my own). */
export const HELP = Object.freeze({ show: ['watch'], hints: ['guided'], own: ['own'] });
/** What the teacher's words already answered (English words; the AI's own fields fill in other languages). */
export function answered(text) {
  const w = ` ${String(text || '').toLowerCase()} `;
  const out = {};
  if (/\blesson plans?\b/.test(w)) out.kind = 'lesson';
  else if (/\b(game|games|activity|quiz|practice)\b/.test(w)) out.kind = 'game';
  if (/\b(on (the|a|our|my) (board|whiteboard|smartboard|smart board|screen|projector)|whole class|all together|together on|projector)\b/.test(w)) out.use = 'board';
  else if (/\b(devices?|ipads?|tablets?|chromebooks?|laptops?|computers?|own pace|each student|every student)\b/.test(w)) out.use = 'devices';
  const w2 = w.replace(/on their own (devices?|ipads?|tablets?|chromebooks?|laptops?|computers?)/g, ' ');
  if (/\b(no hints?|without hints?|on their own|independent(ly)?|quick check)\b/.test(w2)) out.help = 'own';
  else if (/\b(hints?|tips?|when (they are |they're )?stuck)\b/.test(w2)) out.help = 'hints';
  else if (/\b(worked examples?|show (them|me|it) (first|how)|model (it|how)|example first)\b/.test(w2)) out.help = 'show';
  return out;
}
const GRADE = /\b(?:grade|gr\.?)\s*(k|\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)[ -]grade\b|\b(kindergarten)\b/i;
export function gradeIn(text) {
  const m = GRADE.exec(String(text || '')); if (!m) return '';
  const g = (m[1] || m[2] || (m[3] ? 'K' : '')).toUpperCase();
  return g === 'K' || (Number(g) >= 1 && Number(g) <= 12) ? g : '';
}
const gradeOf = g => { const s = String(g ?? '').trim().toUpperCase().replace(/^GRADE\s*/, ''); return s === 'K' || s === '0' ? 'K' : /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12 ? String(+s) : ''; };
const TOPIC = /\b(?:about|on|for practicing|to practice|practicing|practising|that practices|covering)\s+([^.!?\n]{2,80})/i;
/** The topic in the teacher's words ("regrouping", "adding fractions"), or ''. */
export function topicIn(text) {
  const m = TOPIC.exec(String(text || '')); if (!m) return '';
  return m[1].replace(/[,;:].*$/, '').replace(/\s+(?:with|using|on (?:their|the|a|our|my|its)|for (?:the|a|our|my|grade|gr\.?|\[student)|in (?:grade|class)|so|that|where|and (?:hints?|no hints?|a worked)|without)\b.*$/i, '').trim().slice(0, 80);
}

// ---------------------------------------------------------------- the ask and plan cards
const fromAi = (v, list) => (typeof v === 'string' && list.includes(v) ? v : null);
/**
 * startBuild, when the teacher may build in the chat: an ask card (only what is missing) or, with nothing missing, the
 * plan card at once. Nothing is built. i: the tool's input (title, grade, topic, what, where, help).
 * -> a runTool result; sets ctx.out.build (the card) and ctx.out.buildReply (the app's own words).
 */
export function startTool(i, ctx) {
  const u = ctx.user, t = tFor(ctx.lang), names = ctx.names || studentNames(u);
  // A worksheet and a board are made in the chat by their own tools (companion-make.js), never by the Builder.
  if (i.tool === 'figures') return { result: { error: 'Make the worksheet yourself with makeWorksheet (figuresKinds first): it is made now, checked and opened from the card.' }, step: { k: 'briefNo' } };
  if (i.tool === 'manipulatives') return { result: { error: 'Make the board yourself with makeBoard: it is made now, checked and opened from the card.' }, step: { k: 'briefNo' } };
  const words = clip(String(ctx.text || ''), 2000).trim();
  if (words.length < 6) return { result: { error: 'Ask the teacher in one short question what the game should practice. Nothing was built.' }, step: { k: 'briefNo' } };
  const said = answered(words);
  const kind = said.kind || (i.what === 'lessonPlan' ? 'lesson' : i.what === 'game' ? 'game' : null);
  if (kind === 'lesson' && said.kind === 'lesson') return { result: { error: 'The teacher asked for a lesson plan: make it with makeLesson. Nothing was built.' }, step: { k: 'briefNo' } };
  const pick = {
    kind,
    use: said.use || fromAi(i.where, OPTIONS.use),
    help: said.help || fromAi(i.help, OPTIONS.help),
  };
  const topic = clip(scrub(String(i.topic || topicIn(words) || ''), names).text, 80).trim();
  const card = {
    id: uid(10), state: 'ask', lang: ctx.lang || 'en',
    title: clip(scrub(String(i.title || ''), names).text, 80).trim(),
    grade: gradeOf(i.grade) || gradeIn(words), topic, words,
    pick, asked: QUESTIONS.filter(k => !pick[k] && !(k === 'use' && pick.kind === 'lesson')),
  };
  if (!card.asked.length) {
    if (pick.kind === 'lesson') return { result: { error: 'The teacher asked for a lesson plan: make it with makeLesson. Nothing was built.' }, step: { k: 'briefNo' } };
    Object.assign(card, planOf(u, card));
    ctx.out.build = card;
    ctx.out.buildReply = t('js.companion-build.reply.plan');
    return { result: { planShown: true, built: false, note: 'Nothing is built yet: the plan card is shown and the teacher taps Build it. The app says so in its own words.' }, step: { k: 'brief', q: 'builder' } };
  }
  ctx.out.build = card;
  ctx.out.buildReply = t('js.companion-build.reply.ask');
  return { result: { askedFirst: true, built: false, questions: card.asked, note: 'Nothing is built yet: the card asks the teacher a few quick taps first, then shows the plan. The app says so in its own words.' }, step: { k: 'brief', q: 'builder' } };
}
/** The plan card's own fields: a title, what students do (from the choices only) and the builds left today. */
function planOf(u, card) {
  const t = tFor(card.lang), p = card.pick;
  const does = [
    t(`js.companion-build.does.${p.use}`),
    ...(card.topic ? [t('js.companion-build.does.topic', { topic: card.topic })] : []),
    t(`js.companion-build.does.${p.help}`),
    t(p.use === 'board' ? 'js.companion-build.does.boardRun' : 'js.companion-build.does.feedback'),
    t('js.companion-build.does.fresh'),
  ].slice(0, 5);
  return { state: 'plan', title: card.title || (card.topic ? clip(card.topic.charAt(0).toUpperCase() + card.topic.slice(1), 80) : t('studio.newGameTitle')), does, left: turnsLeft(u.id) };
}
/** The Builder's plan for a card (builder/plan.js's classroom activity, as /build/new makes it): the topic, the grade,
 *  the help, how students use it, and the teacher's words as the first message (told, sent as they are). */
export function builderPlan(card, told) {
  const use = usesPlan(['screen']);
  return {
    kind: 'activity', topic: card.topic ? { text: card.topic } : null, grade: card.grade || '',
    help: HELP[card.pick.help] || ['guided'], purpose: use.purpose, played: card.pick.use === 'board' ? 'board' : use.played, told,
  };
}

// ---------------------------------------------------------------- taps
/** A turn's card in this chat (the teacher's own). */
function turnOf(u, turnId) {
  const row = chatRow(u); if (!row) return null;
  const turn = parse(row.turns, []).find(x => x.id === String(turnId || '') && x.role === 'oomba' && x.note);
  return turn ? { row, turn } : null;
}
function markNote(u, row, turnId, note) {
  db.transaction(() => {
    const list = parse(q.get('SELECT turns FROM oomba_chats WHERE id=?', row.id).turns, []);
    const x = list.find(y => y.id === turnId); if (x) x.note = note;
    q.run('UPDATE oomba_chats SET turns=? WHERE id=?', JSON.stringify(list), row.id);
  })();
  return C.current(u, SURFACE, KEY);
}
const busyChat = row => !!q.get("SELECT 1 FROM oomba_turns WHERE chat_id=? AND status IN ('queued','running','interrupted')", row.id);
/**
 * A tap on a build card. act: buildPlan (value: JSON { kind, use, help }: Show me the plan), buildGo (value: the words
 * for the Builder: Build it), buildRedo (Change on the plan card: the choices again). -> the conversation | fail.
 */
export function act(u, turnId, a, value = '') {
  if (!companionFor(u)) return { ok: false, code: 'notFound' };
  const got = turnOf(u, turnId); if (!got) return { ok: false, code: 'notFound' };
  const { row, turn } = got, card = turn.note.build;
  if (!card) return { ok: false, code: 'notFound' };
  if (busyChat(row)) return { ok: false, code: 'chatBusy' };
  const t = tFor(card.lang || 'en');
  if (a === 'buildPlan') {
    if (card.state !== 'ask') return { ok: false, code: 'notFound' };
    const v = parse(String(value || ''), {}) || {};
    const pick = { ...card.pick };
    const kindNow = card.asked.includes('kind') ? v.kind : card.pick.kind;
    for (const k of card.asked) {
      if (k !== 'kind' && kindNow === 'lesson') continue;   // a lesson plan needs only that answer
      if (!OPTIONS[k].includes(v[k])) return { ok: false, code: 'needPick' };
      pick[k] = v[k];
    }
    const mark = { id: turn.id, fields: { note: { ...turn.note, build: { ...card, state: 'answered', pick } } } };
    if (pick.kind === 'lesson') return lessonTurn(u, row, card, mark, t);
    if (!on(u)) return { ok: false, code: 'buildOff' };
    const next = { ...card, id: uid(10), pick, asked: [], ...planOf(u, { ...card, pick }) };
    return C.addTurn(u, SURFACE, KEY, { mark, text: t('js.companion-build.reply.plan'), apply: () => ({ note: { build: next } }) });
  }
  if (a === 'buildRedo') {
    if (card.state !== 'plan') return { ok: false, code: 'notFound' };
    const again = { ...card, id: uid(10), state: 'ask', asked: [...QUESTIONS] };
    return C.addTurn(u, SURFACE, KEY, { mark: { id: turn.id, fields: { note: { ...turn.note, build: { ...card, state: 'redone' } } } }, text: t('js.companion-build.reply.ask'), apply: () => ({ note: { build: again } }) });
  }
  if (a === 'buildGo') return buildGo(u, row, turn, card, String(value || ''), t);
  return { ok: false, code: 'notFound' };
}
/** A lesson plan picked on the ask card: the companion's own lesson job (makeLesson's draft and save). */
function lessonTurn(u, row, card, mark, t) {
  const schools = S.schoolsOf(u.id).filter(x => x.role === 'admin' || x.role === 'teacher');
  if (!schools.length) return C.addTurn(u, SURFACE, KEY, { mark, text: t('js.companion-build.reply.noSchool'), apply: () => ({}) });
  const topic = (card.topic && CM.topicInWords(card.topic, card.words) ? card.topic : clip(card.words, 120)).trim();
  const args = { topic, grade: card.grade || '', subject: '', minutes: 40 };
  const job = { ...J.cardOf(uid(14), 'lesson', topic), input: { schoolId: schools[0].id, args, lang: card.lang || 'en' } };
  return C.addTurn(u, SURFACE, KEY, {
    mark, text: t('js.companion-build.reply.lesson'),
    apply: () => { J.enqueue(u.id, row.id, null, [job]); audit(u.id, 'companion.build.lesson', '', {}); return { note: { jobs: [{ ...J.cardOf(job.id, 'lesson', topic) }] } }; },
  });
}
/** Build it: one tap, one build. The game is made as POST /api/studio/new makes it; the first Builder message (the
 *  plan, with the teacher's words as they are) runs in a 'game' job, so the chat stays free. */
function buildGo(u, row, turn, card, told, t) {
  if (card.state !== 'plan') return { ok: false, code: 'notFound' };
  if (!on(u)) return { ok: false, code: 'buildOff' };
  if (turnsLeft(u.id) <= 0) return { ok: false, code: 'noBuilds' };
  if (J.liveCount(u.id) >= J.LIMITS.QUEUE_MAX) return { ok: false, code: 'cap' };
  const names = studentNames(u);
  const words = clip(scrub(String(told || card.words).replace(/\r\n/g, '\n'), names).text, 2000).trim() || card.words;
  let out = { ok: false, code: 'error' };
  try {
    db.transaction(() => {
    const g = games.createGame(u.id, { title: card.title || t('studio.newGameTitle'), icon: '🎮', cover: games.COVERS[Math.floor(Math.random() * games.COVERS.length)] });
    audit(u.id, 'game.create', g.id, { from: 'companion' });
    const id = uid(14);
    const spec = { ...J.cardOf(id, 'game', g.title), input: { gameId: g.id, text: words, plan: builderPlan(card, words), lang: card.lang || 'en', mode: 'new', base: 0, cid: uid(16) } };
    const shown = { ...J.cardOf(id, 'game', g.title), gameId: g.id, mode: 'new', base: 0 };
    out = C.addTurn(u, SURFACE, KEY, {
      mark: { id: turn.id, fields: { note: { ...turn.note, build: { ...card, state: 'built', gameId: g.id, told: words } } } }, text: t('js.companion-build.reply.building'),
      apply: () => { J.enqueue(u.id, row.id, null, [spec]); return { note: { jobs: [shown] } }; },
    });
    if (!out.ok) throw Object.assign(new Error('rollback'), { rollback: true });
    })();
  } catch (e) { if (!e.rollback) throw e; }
  return out;
}

// ---------------------------------------------------------------- change by message
/** The games made in this chat, newest first: [{ gameId, title }] (still the teacher's, not deleted). */
export function chatGames(u, row = chatRow(u)) {
  const seen = new Set(), out = [];
  for (const x of [...parse(row && row.turns, [])].reverse()) {
    for (const j of (x.note && x.note.jobs) || []) {
      if (j.kind !== 'game' || !j.gameId || seen.has(j.gameId)) continue;
      seen.add(j.gameId);
      const g = games.getGame(j.gameId);
      if (g && g.owner_id === u.id && g.status !== 'deleted') out.push({ gameId: g.id, title: g.title, version: turns.newestVersion(g.id) || 0 });
    }
  }
  return out.slice(0, 8);
}
/** changeGame: the teacher's message, exactly as they wrote it (after the chat's own scrubber), to that game's
 *  Builder. No tap, no rewrite; the Builder screens it like any message. A job follows it (the card above). */
export function changeTool(i, ctx) {
  const u = ctx.user, t = tFor(ctx.lang);
  if (!on(u)) return { result: { error: 'Building in the chat is off for this account. Nothing was sent.' }, step: { k: 'briefNo' } };
  const list = chatGames(u);
  if (!list.length) return { result: { error: 'No game was made in this chat yet: offer to make one with startBuild. Nothing was sent.' }, step: { k: 'briefNo' } };
  const want = fold(i.game);
  const g = (want && want !== 'last' && (list.find(x => fold(x.title) === want) || list.find(x => fold(x.title).includes(want) || want.includes(fold(x.title))))) || list[0];
  const words = clip(String(ctx.text || ''), 2000).trim();
  if (!words) return { result: { error: 'Nothing to send.' }, step: { k: 'briefNo' } };
  const jobs = (ctx.out.jobs ||= []);
  if (jobs.some(j => j.kind === 'game' && j.gameId === g.gameId)) return { result: { error: 'This message already went to that game.' }, step: { k: 'briefNo' } };
  if (jobs.length >= J.LIMITS.PER_ANSWER || J.liveCount(u.id) + jobs.length >= J.LIMITS.QUEUE_MAX) return { result: { error: 'The teacher already has many things being made: ask them to send this again once some cards are done. Nothing was sent.' }, step: { k: 'briefNo' } };
  const card = J.cardOf(uid(14), 'game', g.title);
  const cur = games.getGame(g.gameId);
  jobs.push({ ...card, gameId: g.gameId, mode: 'change', base: g.version, baseId: cur.current_version_id || null, input: { gameId: g.gameId, text: words, lang: ctx.lang || 'en', mode: 'change', base: g.version, cid: uid(16) } });
  ctx.out.buildReply = t('js.companion-build.reply.change', { n: g.version + 1, prev: g.version || 1 });
  return { result: { sent: true, game: g.title, note: 'The teacher\'s words went to that game\'s Builder exactly as written. A new version is being built; the card shows it. Say it in one short sentence, never that it is done.' }, step: { k: 'job', q: clip(g.title, 40) } };
}

// ---------------------------------------------------------------- the 'game' job
const DEVICE = k => (/^phone/.test(k) ? 'phone' : /^tablet/.test(k) ? 'tablet' : k === 'desktop' ? 'laptop' : null);
/** The devices the automatic playtest of this version checked (its 'playtest' event in the Builder's transcript). */
function checkedOn(gameId, number) {
  let ev = null;
  for (const m of loadChat(gameId).messages) for (const e of (m && m.events) || []) if (Array.isArray(e) && e[0] === 'playtest' && e[1] && e[1].auto && e[1].version === number) ev = e[1];
  if (!ev) return { views: [], probs: null };
  const views = [...new Set((ev.views || []).map(DEVICE).filter(Boolean))];
  return { views: ['phone', 'tablet', 'laptop'].filter(d => views.includes(d)), probs: typeof ev.problems === 'number' ? ev.problems : null };
}
const notesOf = v => String((v && v.notes) || '').split(/(?<=[.!?])\s+|;\s*|\n+/).map(s => s.replace(/[.\s]+$/, '').trim()).filter(s => s.length > 2 && s !== 'New version').slice(0, 4);
/** Oomba's words on the done card, from what was really checked. */
export function sayOf(c, lang = 'en') {
  const t = tFor(lang);
  if (c.why === 'refused') return t('js.companion-build.say.refused', { why: c.message || '' }).trim();
  if (c.why === 'nothing') return t('js.companion-build.say.nothing');
  if (c.scan !== 'pass') return t('js.companion-build.say.scanFail');
  if (c.played === 'fail') return t('js.companion-build.say.playFail', { why: c.reason || t('js.companion-build.say.noEnd') });
  if (c.played === 'skipped') return t('js.companion-build.say.noPlay');
  const list = c.views.map(d => t(`js.companion-build.dev.${d}`));
  let joined = list.join(', ');
  try { joined = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(list); } catch { /* the plain list */ }
  return `${list.length ? t('js.companion-build.say.devices', { devices: joined }) : t('js.companion-build.say.played')} ${t('js.companion-build.say.students')}`;
}
/** What the job knows once the build is over: the version it made and every check, read back. */
export async function resultFor(user, input, base) {
  const g = games.getGame(input.gameId);
  if (!g || g.status === 'deleted') return { failed: 'gone' };
  const v = g.current_version_id ? games.getVersion(g.current_version_id) : null;
  if (!v || v.number <= base) {
    const last = turns.lastEnded(g.id);
    if (last && last.end_reason === 'refused') {
      const said = [...loadChat(g.id).messages].reverse().find(m => m.role === 'assistant' && m.refused);
      return { card: { ok: false, why: 'refused', message: clip((said && said.text) || '', 400) } };
    }
    if (last && last.end_reason === 'limit') return { failed: 'limit' };
    return { card: { ok: false, why: 'nothing' } };
  }
  let played = PT.resultOf(v).status;
  let report = PT.resultOf(v).report || null;
  if (!played) {
    const e = await PT.ensure(v, g, { lang: input.lang || 'en' });
    played = e.skipped ? 'skipped' : e.ok ? 'pass' : e.code === 'busy' ? 'skipped' : 'fail';
    report = e;
  }
  const scan = v.safety_status === 'pass' ? 'pass' : v.safety_status || 'pass';
  const { views, probs } = checkedOn(g.id, v.number);
  const reason = played === 'fail' && report ? PT.reasonText(report, tFor(input.lang || 'en')) : '';
  const ok = scan === 'pass' && played === 'pass';
  return { card: { ok, versionId: v.id, number: v.number, title: g.title, scan, played, views, probs, reason: clip(reason, 160), changed: input.mode === 'change' ? notesOf(v) : [] } };
}
J.defineKind('game', {
  async run(user, input, row) {
    if (!on(user)) return { failed: 'notAllowed' };
    const g = games.getGame(input.gameId);
    if (!g || g.owner_id !== user.id || g.status === 'deleted') return { failed: 'gone' };
    const lang = input.lang || 'en', t = tFor(lang);
    // Carried on after a restart (oomba-jobs recover): the message was sent then, and the Builder carries its own build on
    // (runner.recover), so it is never sent twice: only its end is waited for.
    if (row && row.attempt > 0) {
      await runner.idle(g.id);
      const again = await resultFor(user, input, Number(input.base) || 0);
      return again.failed ? again : { apply: () => done(again.card, lang) };
    }
    const base = turns.newestVersion(g.id) || 0;
    let r;
    try {
      r = await runner.submit({ user, game: g, text: input.text, plan: input.mode === 'new' ? input.plan : null, t, cid: input.cid, ...(hooks.provider ? { provider: hooks.provider } : {}) });
    } catch (e) { log('error', 'companion build could not start', { game: g.id, error: e.message }); return { failed: 'error' }; }
    if (!r.job && !(r.body && (r.body.followUp || r.body.refused))) return { failed: ['limit', 'resting', 'tooMany', 'disabled', 'restarting'].includes(r.code) ? r.code : 'error' };
    if (r.body && r.body.refused) {
      const card = { ok: false, why: 'refused', message: clip(`${r.body.refused.message || ''} ${r.body.refused.suggestion || ''}`.trim(), 400) };
      return { apply: () => done(card, lang) };
    }
    await runner.idle(g.id);
    const out = await resultFor(user, input, base);
    if (out.failed) return out;
    log('info', 'companion build ended', { game: g.id, mode: input.mode, ok: !!out.card.ok });
    return { apply: () => done(out.card, lang) };
  },
});
function done(card, lang) {
  const game = { ...card, say: sayOf(card, lang) };
  return { ok: true, result: { gameId: card.versionId || null, ok: !!card.ok }, card: { game } };
}

// ---------------------------------------------------------------- the card's live view
const NOW_KEYS = { plan: ['think', 'ask', 'search', 'name', 'resume', 'read'], write: ['write', 'edit', 'fix', 'template', 'blocks', 'notes'], play: ['autotest', 'playtest'] };
/**
 * The card's five rows from the Builder's live steps (runner.jobFor: the replay buffer the Studio's /live sends):
 * safe (screening), plan, write, play (the automatic playtest), scan (the safety program on the saved version).
 * steps: [{ key, facts }] in order; phase: the build's phase; ended: the build is over. -> [{ k, state }]
 */
export const ROWS = Object.freeze(['safe', 'plan', 'write', 'play', 'scan']);
export function rowsOf(steps, { phase = 'screening', ended = false } = {}) {
  const keys = steps.map(s => s.key), has = list => keys.some(k => list.includes(k));
  const checked = keys.includes('check');
  const playRows = steps.filter(s => NOW_KEYS.play.includes(s.key));
  const playDone = playRows.length > 0 && playRows.every(s => s.facts && (typeof s.facts.probs === 'number' || s.facts.ok === false));
  const st = {};
  st.safe = ended || phase !== 'screening' || keys.some(k => k !== 'screen') ? 'done' : 'now';
  st.plan = ended || has(NOW_KEYS.write) || checked || playRows.length ? 'done' : st.safe === 'done' ? 'now' : 'todo';
  st.write = ended || (checked && playRows.length) ? 'done' : st.plan === 'done' ? 'now' : 'todo';
  st.play = ended || playDone ? 'done' : st.write === 'done' ? 'now' : 'todo';
  st.scan = ended || (playDone && checked) ? 'done' : st.play === 'done' ? 'now' : 'todo';
  return ROWS.map(k => ({ k, state: st[k] }));
}
/** The steps of a game's running build, as /live replays them (step rows with their facts so far). */
function liveSteps(gameId) {
  const job = runner.jobFor(gameId); if (!job) return null;
  const rows = new Map();
  for (const [name, d] of job.buf) {
    if (name === 'step') rows.set(d.i, { key: d.key, facts: { ...d } });
    else if (name === 'stepinfo' && rows.has(d.i)) Object.assign(rows.get(d.i).facts, d);
  }
  return { steps: [...rows.values()], phase: job.phase };
}
/** GET /api/companion/build/:gameId: the live rows, the preview (this viewer's own frame address) and builds left. */
export function view(u, gameId, { versionId = '', lang = 'en' } = {}) {
  if (!companionFor(u)) return { ok: false, code: 'notFound' };
  const g = games.getGame(String(gameId || ''));
  if (!g || g.owner_id !== u.id || g.status === 'deleted') return { ok: false, code: 'notFound' };
  const ls = liveSteps(g.id);
  const v = versionId ? games.getVersion(String(versionId)) : g.current_version_id ? games.getVersion(g.current_version_id) : null;
  const ver = v && v.game_id === g.id ? v : null;
  return {
    ok: true, busy: runner.isBusy(g.id), title: g.title,
    rows: ls ? rowsOf(ls.steps, { phase: ls.phase }) : null,
    preview: ver ? { url: previewUrl(ver, g, u.id, lang), number: ver.number, sandbox: SANDBOX } : null,
    left: turnsLeft(u.id),
  };
}

// ---------------------------------------------------------------- the AI's tools and rules
export const TOOL_NAMES = Object.freeze(['changeGame']);
const str = d => ({ type: 'string', description: d });
export const START_TOOL = Object.freeze({
  name: 'startBuild',
  description: 'Build a game or classroom activity right here in the chat (the Builder builds it, checked for safety, playtested and safety scanned). Call it when the teacher asks to make, build or create a game or activity. Nothing is built yet: the card asks the teacher a few quick taps and shows a plan; only their Build it tap builds. Pass only what the teacher said; leave a field out when they did not say it. Never for a worksheet (makeWorksheet), a board (makeBoard) or a lesson plan (makeLesson).',
  input_schema: { type: 'object', properties: { title: str('A short title, no names.'), grade: str('K or 1 to 12, only when said.'), topic: str('What students practice, in the teacher\'s words.'), what: { type: 'string', enum: ['game', 'lessonPlan'], description: 'Only when the teacher said it.' }, where: { type: 'string', enum: ['devices', 'board'], description: 'Only when the teacher said it: each student on a device, or the whole class on the board.' }, help: { type: 'string', enum: ['show', 'hints', 'own'], description: 'Only when the teacher said it: a worked example first, hints when stuck, or no hints.' } } },
});
export const CHANGE_TOOL = Object.freeze({
  name: 'changeGame',
  description: 'Send the teacher\'s message, exactly as they wrote it, to the Builder of a game made in this chat, to change it ("make it harder", "add a timer to the regrouping game"). Call it when the message is about such a game (the newest one, or the one named). No tap is needed and you never rewrite their words. Not for a new game (startBuild).',
  input_schema: { type: 'object', required: ['game'], properties: { game: str('The game\'s title as listed under "Games made in this chat", or "last" for the newest.') } },
});
/** The tools for this teacher: the chat's startBuild and changeGame instead of the hand-off. */
export const toolsFor = (u, list) => (on(u) ? [...list.map(x => (x.name === 'startBuild' ? START_TOOL : x)), CHANGE_TOOL] : list);
/** Lines for Oomba's system prompt (after the companion's own): the build rule and the games made in this chat. */
export function systemExtra(u) {
  if (!on(u)) return '';
  const list = chatGames(u);
  return [
    '',
    'Building in the chat (this overrides the hand-off rule above): a game or classroom activity is built right here. For a new one call startBuild: the card asks a few quick taps, then shows a plan, and nothing is built until the teacher taps Build it. Never say "Open the Builder". Call a teacher\'s playable thing a game here, a lesson with steps a lesson plan, and a printable one a worksheet.',
    list.length ? `Games made in this chat (newest first): ${list.map(x => `"${x.title}" (id ${x.gameId}, version ${x.version})`).join('; ')}. A message that asks to change one of them goes to changeGame; to assign one, call assign with kind "game" and its id.` : '',
  ].filter(x => x !== null).join('\n');
}
