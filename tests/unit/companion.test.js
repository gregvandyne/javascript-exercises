// Oomba, the teaching companion (docs/decisions.md "Oomba teaching companion"; services/companion.js on the shared chat
// engine services/oomba-chat.js): who gets the bubble (the Teacher plan rule, paid plans on and off) and on which pages,
// the tool-use loop (its step cap, tools that only read, proposals that need the teacher's tap, scoped to their own
// class and layout, with Undo), what the AI may see (never a student's name, answers or work: names are taken out of
// messages, uploads and web searches), the picture check (no people, via the stand-in), a school's settings (bounds and
// what they change), retention and account deletion. The AI is a stand-in (companion.js hooks.create); no network.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const CO = await import('../../server/services/companion.js');
const CS = await import('../../server/services/companion-settings.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const AD = await import('../../server/services/account-delete.js');
const { companionPage } = await import('../../server/views/layout.js');
const { tFor } = await import('../../server/i18n/index.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
const SEED = await import('../../server/services/games.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; CO.hooks.screenImage = null; TOOLS.plansOn(false); server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body, raw = null, type = null, headers: extra = {} } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = type || 'application/octet-stream';
  const r = await fetch(base + p, { method: body !== undefined || raw ? 'POST' : 'GET', headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

// ---------------------------------------------------------------- the world
const boss = createUser({ username: 'CompBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Companion Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const staff = (name, role = 'teacher') => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role }).user.id);
const paid = staff('Pam Paid'), free = staff('Fred Free'), tester = staff('Tess Tester'), other = staff('Otto Other');
TOOLS.givePlan(paid.id); TOOLS.givePlan(other.id);
config.manipulativesUsers = [tester.username.toLowerCase()];
const cls = S.createClass(boss, oak.id, { name: '3B', teacherId: paid.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: '4X', teacherId: other.id }).class;
const pupil = name => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name }).user.id); S.addToClass(boss, cls.id, u.id); return u; };
const quinn = pupil('Quinn Marsh'), bea = pupil('Bea Tumble');
const kid = createUser({ username: 'CompKid', password: 'secret123' });
const t = tFor('en');
const layouts = D.ensureLayouts(paid, cls, t);
D.ensureLayouts(other, otherCls, t);
const quiet = layouts.find(l => /quiet/i.test(l.name)) || layouts[0];
// A text widget whose words name a student, and a picker with names: never seen by the AI.
D.updateLayout(paid, cls, quiet.id, { widgets: [...quiet.widgets, { id: 'note1', type: 'text', x: 0, y: 10, w: 4, h: 3, s: { title: 'For Quinn Marsh', body: 'Bea Tumble reads first', style: 'list' } }] });
// The games the search finds must be published official games.
for (const slug of ['fraction-factory', 'mistake-hunt']) {
  if (!SEED.getGameBySlug(slug)) { const g = SEED.createGame(boss.id, { title: slug === 'fraction-factory' ? 'Fraction Factory' : 'Mistake Hunt', source: 'seed', slug, category: 'learning', description: 'Cut cakes into equal parts. Wrong cuts are shown, never punished.' }); q.run("UPDATE games SET status='published' WHERE id=?", g.id); }
}
const NAMES = /Quinn|Marsh|Bea\b|Tumble/;

/** The stand-in AI: script(params, i) -> a response object ({ content, stop_reason }) or a plain text answer. */
function standIn(script) {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = await script(params, calls.length - 1);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
const toolUse = (name, input, id = `tu_${Math.random().toString(36).slice(2, 8)}`) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const say = (who, body) => as(who)('/api/companion/chat', { body });
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const reset = async who => { await C.allSettled(); CO.reset(who); };
const setSchool = (st = {}) => { const s = S.getSchool(oak.id); const all = JSON.parse(s.settings || '{}'); all.companion = { ...CS.DEFAULTS, ...st }; q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify(all), oak.id); };

// ---------------------------------------------------------------- tests
test('migration 0108 after 0107: the conversation\'s own switches and its attached files, gone with the chat', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.indexOf('0108_teacher_companion') > names.indexOf('0107_figures_chat'));
  assert.ok(q.all('PRAGMA table_info(oomba_chats)').some(c => c.name === 'opts'));
  assert.ok(q.all('PRAGMA foreign_key_list(oomba_files)').some(f => f.table === 'oomba_chats' && f.on_delete === 'CASCADE'));
  assert.equal(C.surfaceOf('companion').live, 'owner');
});

test('who: the Teacher plan rule with paid plans on (plan holders, testers, the admin), testers and the admin only with plans off, nobody else', async () => {
  TOOLS.plansOn(true);
  try {
    for (const u of [paid, tester, boss]) assert.equal(CO.companionFor(u), true, u.username);
    for (const u of [free, quinn, kid, null]) assert.equal(CO.companionFor(u), false, u ? u.username : 'none');
    assert.equal((await as(free)('/api/companion/chat')).status, 404, 'no upsell: the normal 404');
    assert.equal((await as(quinn)('/api/companion/chat')).status, 404);
    // The bubble: on the teacher's class page, not for staff without the plan, never for a student.
    assert.match((await as(paid)(`/class/${cls.id}`)).text, /data-oc="[^"]*class[^"]*"/);
    assert.match((await as(paid)(`/class/${cls.id}`)).text, /\/js\/companion\.js/);
    assert.doesNotMatch((await as(free)(`/class/${cls.id}`)).text, /companion\.js|data-oc=/);
    assert.doesNotMatch((await as(quinn)(`/class/${cls.id}`)).text, /companion\.js|data-oc=/);
    config.companion = false;
    try { assert.equal(CO.companionFor(boss), false, 'COMPANION=0 hides it from everyone'); } finally { config.companion = true; }
  } finally { TOOLS.plansOn(false); }
  assert.equal(CO.companionFor(paid), false, 'plans off: the plan alone is not enough');
  assert.equal(CO.companionFor(tester), true); assert.equal(CO.companionFor(boss), true);
});

test('which pages: teacher pages and the dashboard\'s teacher screen; never a game, a player, a print page, a student view or a page with its own Oomba chat', async () => {
  const req = (path, query = {}) => ({ path, query, user: tester });
  assert.deepEqual(companionPage(req(`/class/${cls.id}`)), { type: 'class', classId: cls.id });
  assert.deepEqual(companionPage(req(`/class/${cls.id}/dashboard`), { bare: true, companion: 'dash' }), { type: 'dashboard', classId: cls.id });
  assert.equal(companionPage(req(`/class/${cls.id}/dashboard`), { bare: true }), null, 'a bare page without the dashboard\'s opt-in');
  assert.deepEqual(companionPage(req('/library', { class: cls.id })), { type: 'library', classId: cls.id });
  for (const p of ['/play/fraction-factory', '/live/play/abc', '/live/host/abc', '/teach/rubrics/x/print', '/figures/worksheets/abc', `/class/${cls.id}/lessons/l1`, '/manipulatives', '/number-quest/sorting-game']) assert.equal(companionPage(req(p)), null, p);
  assert.equal(companionPage(req('/teach'), { scripts: ['/js/figures-sheet.js'] }), null, 'a page with its own Oomba chat');
  assert.equal(companionPage(req('/teach'), { companion: false }), null);
  assert.equal(companionPage({ path: '/teach', query: {}, user: quinn }), null, 'a student');
  // Real pages: the dashboard for its teacher (at the end of its layout bar), not a game.
  const dash = await as(tester)(`/class/${cls.id}/dashboard`);
  assert.equal(dash.status, 404, 'a tester who does not teach this class has no dashboard here');
  const mine = await as(boss)('/play/fraction-factory');
  assert.doesNotMatch(mine.text, /data-oc=/, 'no Oomba while a game plays');
  TOOLS.plansOn(true);
  try {
    const d = await as(paid)(`/class/${cls.id}/dashboard`);
    assert.equal(d.status, 200); assert.match(d.text, /data-oc="[^"]*dashboard/);
    assert.doesNotMatch((await as(quinn)(`/class/${cls.id}/dashboard`)).text, /data-oc=/, 'never on a student\'s screen');
  } finally { TOOLS.plansOn(false); }
});

test('a message: names taken out before it is kept or sent; the loop answers with game cards from searchGames; the AI never sees a student\'s name', async () => {
  TOOLS.plansOn(true);
  try {
    const calls = standIn((p, i) => (i === 0 ? toolUse('getPageContext', {}) : i === 1 ? toolUse('searchGames', { topic: 'fractions', grade: '3', minutes: 10 })
      : 'Here are three that fit about 10 minutes. Fraction Factory is the closest match.\n[[game:fraction-factory]]'));
    const r = await say(paid, { text: 'Give Quinn Marsh and bea tumble a game for 3rd grade fractions, 10 minutes', page: { type: 'class', classId: cls.id } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const me = r.json.chat.turns.at(-1);
    assert.equal(me.text, 'Give [student] and [student] a game for 3rd grade fractions, 10 minutes');
    assert.deepEqual(me.meta.page, { type: 'class', classId: cls.id });
    await C.allSettled();
    const chat = await chatOf(paid);
    const last = chat.turns.at(-1);
    assert.equal(last.role, 'oomba'); assert.match(last.text, /Fraction Factory is the closest match/);
    assert.doesNotMatch(last.text, /\[\[/, 'markers become cards');
    assert.equal(last.note.cards[0].kind, 'game'); assert.equal(last.note.cards[0].id, 'fraction-factory');
    assert.match(last.note.cards[0].play, /^\/play\/fraction-factory$/);
    assert.deepEqual(last.note.steps.map(s => s.k), ['page', 'games']);
    assert.equal(calls.length, 3);
    for (const c of calls) assert.doesNotMatch(JSON.stringify(c), NAMES, 'no student name reaches the AI');
    const page = JSON.parse(calls[1].messages.at(-1).content[0].content);
    assert.equal(page.class.students, 2); assert.equal(page.class.id, cls.id);
    assert.ok(!calls[0].model.includes('undefined') && calls[0].model === (config.companionModel || config.builderModel), 'the model from config');
  } finally { TOOLS.plansOn(false); await reset(paid); }
});

test('the loop stops at the school\'s step cap: the last call asks for an answer without tools', async () => {
  setSchool({ steps: 3 });
  const calls = standIn((p, i) => (p.tool_choice && p.tool_choice.type === 'none' ? 'I looked a few times; here is what I have.' : toolUse('searchGames', { topic: 'fractions' })));
  try {
    const r = await say(tester, { text: 'Find me lots of games', page: { type: 'teach' } });
    assert.equal(r.status, 200);
    await C.allSettled();
    assert.equal(calls.length, 4, '3 tool steps, then the answer');
    assert.equal(calls.at(-1).tool_choice.type, 'none');
    assert.equal((await chatOf(tester)).turns.at(-1).note.steps.length, 3);
  } finally { setSchool({}); await reset(tester); }
});

test('the dashboard: a proposal changes nothing until Apply; it changes the existing timer instead of adding a second; Undo puts it back; scoped to the teacher\'s own class and layout', async () => {
  TOOLS.plansOn(true);
  try {
    const before = D.getLayout(quiet.id);
    const timer = before.widgets.find(w => w.type === 'timer');
    assert.ok(timer, 'the Quiet work layout has a timer');
    const calls = standIn((p, i) => (i === 0 ? toolUse('getPageContext', {}) : i === 1 ? toolUse('proposeDashboardChange', { changes: [{ op: 'add', type: 'timer', settings: { minutes: 5 } }, { op: 'add', type: 'jobs' }] })
      : 'Quiet work already has a timer, so I will change it rather than add a second one.'));
    const r = await say(paid, { text: 'Add a 5 minute timer and class jobs', page: { type: 'dashboard', classId: cls.id, layoutId: quiet.id } });
    assert.equal(r.status, 200);
    await C.allSettled();
    const ctx = JSON.parse(calls[1].messages.at(-1).content[0].content);
    assert.ok(ctx.dashboard.widgets.some(w => w.type === 'text'), 'the text widget is listed');
    assert.doesNotMatch(JSON.stringify(ctx), NAMES, 'but never its words');
    assert.ok(ctx.widgetLibrary.some(w => w.type === 'jobs'));
    let chat = await chatOf(paid);
    const turn = chat.turns.at(-1);
    assert.equal(turn.note.proposal.state, 'open');
    assert.deepEqual(turn.note.proposal.ops.map(o => [o.op, o.type]), [['set', 'timer'], ['add', 'jobs']]);
    assert.deepEqual(D.getLayout(quiet.id).widgets, before.widgets, 'nothing changed before the tap');
    // Another teacher cannot apply it (it is not their chat), and Apply works once.
    assert.equal((await as(other)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'apply' } })).status, 404);
    const ap = await as(paid)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'apply' } });
    assert.equal(ap.status, 200, JSON.stringify(ap.json));
    const after = D.getLayout(quiet.id);
    assert.equal(after.widgets.find(w => w.id === timer.id).s.minutes, 5);
    assert.equal(after.widgets.filter(w => w.type === 'timer').length, 1, 'no second timer');
    assert.equal(after.widgets.filter(w => w.type === 'jobs').length, 1);
    assert.equal((await as(paid)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'apply' } })).status, 404, 'once');
    chat = ap.json.chat;
    const done = chat.turns.at(-1);
    assert.equal(done.change.kind, 'dash'); assert.equal(done.change.canUndo, true);
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.dash.apply' AND target=?", quiet.id));
    const un = await as(paid)('/api/companion/chat/undo', { body: { turnId: done.id } });
    assert.equal(un.status, 200);
    const back = D.getLayout(quiet.id);
    assert.equal(back.widgets.find(w => w.id === timer.id).s.minutes, timer.s.minutes);
    assert.equal(back.widgets.filter(w => w.type === 'jobs').length, 0);
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.dash.undo' AND target=?", quiet.id));
    // Scope: a page naming another teacher's class or layout is dropped on the server.
    const otherLayout = D.layoutsOf(otherCls.id, other.id)[0];
    assert.deepEqual(CO.pageOf(paid, { type: 'dashboard', classId: otherCls.id, layoutId: otherLayout.id }), { type: 'other' });
    assert.deepEqual(CO.pageOf(paid, { type: 'dashboard', classId: cls.id, layoutId: otherLayout.id }), { type: 'dashboard', classId: cls.id });
    assert.equal(CO.applyProposal(paid, { classId: otherCls.id, layoutId: otherLayout.id, ops: [{ op: 'add', type: 'jobs', settings: {} }], lines: [] }).code, 'notFound');
    const r2 = CO.runTool('proposeDashboardChange', { changes: [{ op: 'add', type: 'jobs' }] }, { user: paid, page: { type: 'other' }, lang: 'en', names: [], files: [], seen: new Map(), out: {} });
    assert.ok(r2.result.error, 'no dashboard: no proposal');
    // Not now: the card says so and nothing changes.
    standIn((p, i) => (i === 0 ? toolUse('proposeDashboardChange', { changes: [{ op: 'remove', widgetId: timer.id }] }) : 'Take the timer off?'));
    await say(paid, { text: 'remove the timer', page: { type: 'dashboard', classId: cls.id, layoutId: quiet.id } }); await C.allSettled();
    const t2 = (await chatOf(paid)).turns.at(-1);
    const no = await as(paid)('/api/companion/chat/act', { body: { turnId: t2.id, act: 'decline' } });
    assert.equal(no.json.chat.turns.find(x => x.id === t2.id).note.proposal.state, 'declined');
    assert.ok(D.getLayout(quiet.id).widgets.some(w => w.id === timer.id));
  } finally { TOOLS.plansOn(false); await reset(paid); }
});

test('safe tool results: widget settings without words, books by level, lessons; a hand-off brief with names taken out', () => {
  assert.deepEqual(CO.safeSettings('text', { title: 'For Quinn', body: 'x', style: 'list' }), { style: 'list' });
  assert.deepEqual(CO.safeSettings('picker', { mode: 'names', source: 'items', items: 'Quinn\nBea', norepeat: true }), { mode: 'names', source: 'items', norepeat: true });
  assert.deepEqual(CO.levelGrades('M'), ['2', '3']); assert.deepEqual(CO.levelGrades('a'), ['k']); assert.equal(CO.levelGrades('7'), null);
  const b = CO.searchBooks({ words: 'animals', readingLevel: 'M' });
  assert.deepEqual(b.mapped.grades, ['2', '3']); assert.match(b.mapped.note, /not by guided reading level/);
  const ctx = { user: paid, page: { type: 'class', classId: cls.id }, lang: 'en', names: [], files: [], seen: new Map(), out: {} };
  const h = CO.runTool('startBuild', { tool: 'builder', brief: 'A number line game for Quinn Marsh where students place halves and thirds.', grade: '3', practice: 'Fractions on a number line' }, ctx);
  assert.ok(h.result.handoffId);
  assert.equal(ctx.out.handoff.brief, 'A number line game for [student] where students place halves and thirds.');
  assert.equal(ctx.out.handoff.grade, '3');
  assert.ok(CO.runTool('startBuild', { tool: 'builder', brief: 'short' }, ctx).result.error);
});

test('uploads: a lesson plan\'s text with names taken out (the file is not kept), read by readUpload; a picture of a person is refused and never kept', async () => {
  TOOLS.plansOn(true);
  try {
    const plan = Buffer.from('Lesson: fractions on a number line (3.NF.A.2).\nQuinn Marsh and Bea Tumble will place 1/2 and 1/3.\nCall 555-123-4567 with questions.');
    const up = await as(paid)('/api/companion/file?name=Quinn%20Marsh%20plan.txt', { raw: plan });
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.file.name, '[student] plan.txt');
    assert.ok(up.json.removed >= 3);
    const row = q.get('SELECT * FROM oomba_files WHERE id=?', up.json.file.id);
    assert.doesNotMatch(row.text, NAMES); assert.doesNotMatch(row.text, /555/); assert.equal(row.bytes, null, 'no file bytes kept');
    const calls = standIn((p, i) => (i === 0 ? toolUse('readUpload', { fileId: up.json.file.id }) : i === 1 ? toolUse('startBuild', { tool: 'builder', title: 'Fraction line', grade: '3', brief: 'Place halves and thirds on a number line, guided then on my own.', practice: 'Fractions on a number line' })
      : 'Your plan places halves and thirds on a number line. Here is what I would hand the Builder.'));
    const r = await say(paid, { text: 'Make a game from this', file: up.json.file.id, page: { type: 'class', classId: cls.id } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.chat.turns.at(-1).meta.file.name, '[student] plan.txt');
    await C.allSettled();
    for (const c of calls) assert.doesNotMatch(JSON.stringify(c), NAMES);
    const last = (await chatOf(paid)).turns.at(-1);
    assert.equal(last.note.handoff.tool, 'builder');
    assert.equal(last.note.handoff.href, `/build/new?for=class&class=${cls.id}`);
    assert.deepEqual(last.note.steps.map(s => s.k), ['read', 'brief']);
    const h = await as(paid)('/api/companion/chat/act', { body: { turnId: last.id, act: 'handoff' } });
    assert.equal(h.json.handoff.brief, 'Place halves and thirds on a number line, guided then on my own.');
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.handoff'"));
    // A picture: a JPEG, checked by the stand-in. A person: refused, nothing kept.
    const tiny = tinyJpeg();
    const n0 = q.get("SELECT COUNT(*) n FROM oomba_files WHERE kind='image'").n;
    CO.hooks.screenImage = async () => 'person';
    const no = await as(paid)('/api/companion/image?name=class.jpg', { raw: tiny, type: 'image/jpeg' });
    assert.equal(no.status, 422); assert.equal(no.json.code, 'imgPerson'); assert.match(no.json.error, /shows a person/);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_files WHERE kind='image'").n, n0);
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.image.refused'"));
    CO.hooks.screenImage = async () => 'allow';
    const ok = await as(paid)('/api/companion/image?name=worksheet.jpg', { raw: tiny, type: 'image/jpeg' });
    assert.equal(ok.status, 200, ok.text);
    const img = q.get('SELECT * FROM oomba_files WHERE id=?', ok.json.file.id);
    assert.ok(img.bytes && img.bytes.length > 0);
    assert.ok(!Buffer.from(img.bytes).includes(Buffer.from('Exif')), 'metadata removed');
    const png = await as(paid)('/api/companion/image?name=x.png', { raw: Buffer.from('\x89PNG\r\n\x1a\n0000'), type: 'image/png' });
    assert.equal(png.status, 400);
    // The picture goes to the AI with the message, then its bytes go.
    const c2 = standIn(() => 'That is a worksheet about fractions.');
    await say(paid, { text: 'What is on this worksheet?', file: ok.json.file.id, page: { type: 'class', classId: cls.id } }); await C.allSettled();
    assert.equal(c2[0].messages.at(-1).content[0].type, 'image');
    assert.equal(q.get('SELECT bytes FROM oomba_files WHERE id=?', ok.json.file.id).bytes, null, 'gone after the answer');
  } finally { CO.hooks.screenImage = null; TOOLS.plansOn(false); await reset(paid); }
});

/** The smallest JPEG this test needs: SOI, an APP1 Exif segment, a frame header 8 x 8, EOI. */
function tinyJpeg() {
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0e]), Buffer.from('Exif\0\0'), Buffer.alloc(6)]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x08, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), exif, sof, Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9])]);
}

test('web search: on by default with the blocked sites, answered with numbered sources; a search that looks personal shows none and is logged redacted; off for the chat or the school', async () => {
  const searchTurn = (query, url = 'https://ell-teaching.example.org/vocab') => ({ stop_reason: 'end_turn', content: [
    { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query } },
    { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [{ type: 'web_search_result', url, title: 'Vocabulary before a read-aloud' }] },
    { type: 'text', text: 'Before reading, show 3 to 5 key words with a picture. See https://ell-teaching.example.org', citations: [{ type: 'web_search_result_location', url, title: 'Vocabulary before a read-aloud', cited_text: 'x' }] },
  ] });
  let calls = standIn(() => searchTurn('english learners read aloud strategies'));
  try {
    await say(tester, { text: 'What are good ways to support English learners during a read-aloud?', page: { type: 'teach' } }); await C.allSettled();
    const web = calls[0].tools.find(x => x.name === 'web_search');
    assert.ok(web && web.blocked_domains.includes('reddit.com') && !('user_location' in web), 'the Builder\'s blocked sites, no location');
    const last = (await chatOf(tester)).turns.at(-1);
    assert.match(last.text, /\[\^1\]$/); assert.doesNotMatch(last.text, /https?:|example\.org/, 'no links in the words');
    assert.deepEqual(last.note.sources, [{ url: 'https://ell-teaching.example.org/vocab', title: 'Vocabulary before a read-aloud', site: 'ell-teaching.example.org' }]);
    assert.equal(last.note.steps[0].k, 'web');
    assert.ok(q.get("SELECT 1 FROM builder_searches WHERE query='english learners read aloud strategies' AND flagged=0"));
    // A query that names someone at a school: no sources, logged as [redacted].
    calls = standIn(() => searchTurn('Tess Tester Companion Oak school'));
    await say(tester, { text: 'search something', page: { type: 'teach' } }); await C.allSettled();
    const l2 = (await chatOf(tester)).turns.at(-1);
    assert.equal(l2.note.sources, undefined); assert.equal(l2.note.steps[0].k, 'webNo');
    assert.ok(q.get("SELECT 1 FROM builder_searches WHERE query='[redacted]' AND flagged=1"));
    // Off for this chat: no web tool.
    assert.equal((await as(tester)('/api/companion/web', { body: { on: false } })).json.web, false);
    calls = standIn(() => 'Okay.');
    await say(tester, { text: 'hello there', page: { type: 'teach' } }); await C.allSettled();
    assert.ok(!calls[0].tools.some(x => x.name === 'web_search'));
    await as(tester)('/api/companion/web', { body: { on: true } });
    // Off for the school: no web tool, and the switch says so.
    setSchool({ web: false });
    calls = standIn(() => 'Okay.');
    await say(tester, { text: 'hello again', page: { type: 'teach' } }); await C.allSettled();
    assert.ok(!calls[0].tools.some(x => x.name === 'web_search'));
    assert.equal((await as(tester)('/api/companion/chat')).json.webAllowed, false);
  } finally { setSchool({}); await reset(tester); }
});

test('school settings: a school admin saves them within bounds (out of bounds refused); Oomba off for the school hides it; limits apply', async () => {
  const head = staff('Hana Head', 'admin');
  const post = (who, body) => as(who)(`/api/schools/${oak.id}/companion`, { body });
  assert.equal((await post(tester, { steps: 4 })).status, 404, 'a teacher is not a school admin');
  for (const [k, v] of [['retentionDays', 6], ['retentionDays', 366], ['steps', 1], ['steps', 13], ['perHour', 4], ['perHour', 101], ['keep', 41], ['send', 1]]) {
    const r = await post(head, { [k]: v });
    assert.equal(r.status, 400, `${k}=${v}`); assert.equal(r.json.field, k);
  }
  assert.equal((await post(head, { keep: 6, send: 8 })).json.code, 'sendKeep');
  const ok = await post(head, { on: '1', web: '0', retentionDays: '30', keep: '10', send: '4', steps: '5', perHour: '2'.repeat(1) + '0' });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(CS.settingsFor(tester), { on: true, web: false, retentionDays: 30, keep: 10, send: 4, steps: 5, perHour: 20, school: true });
  assert.deepEqual(C.surfaceOf('companion').limits(tester), { history: 10, historyToAi: 4 });
  // The settings page shows the section to the admin.
  assert.match((await as(head)(`/school/${oak.slug}?tab=settings`)).text, /id="companion-settings"/);
  // Messages an hour.
  setSchool({ perHour: 5 });
  standIn(() => 'Sure.');
  try {
    for (let i = 0; i < 5; i++) { const r = await say(tester, { text: `hello ${i}`, page: { type: 'teach' } }); assert.equal(r.status, 200); await C.allSettled(); }
    const r = await say(tester, { text: 'one more', page: { type: 'teach' } });
    assert.equal(r.status, 429); assert.equal(r.json.code, 'slow');
  } finally { await reset(tester); }
  // Off for the school.
  setSchool({ on: false });
  try {
    assert.equal(CO.companionFor(tester), false);
    assert.equal((await as(tester)('/api/companion/chat')).status, 404);
    assert.doesNotMatch((await as(tester)('/teach')).text, /data-oc=/);
  } finally { setSchool({}); }
  // Without a school: the defaults.
  assert.equal(CS.settingsFor(createUser({ username: 'CompLoner', password: 'secret123' })).school, false);
});

test('retention: a chat left longer than the school keeps it goes, with its files; pictures go after a day; New chat and account deletion take everything', async () => {
  standIn(() => 'Sure.');
  await say(tester, { text: 'remember this', page: { type: 'teach' } }); await C.allSettled();
  const row = () => q.get("SELECT * FROM oomba_chats WHERE owner_id=? AND surface='companion'", tester.id);
  const f = CO.addDoc(tester, { name: 'plan.txt', kind: 'txt', pages: 1, words: 3, cut: false, text: 'fractions on a line' });
  const img = CO.addImage(tester, { name: 'p.jpg', bytes: Buffer.from('abc'), width: 1, height: 1 });
  q.run('UPDATE oomba_files SET created_at=? WHERE id=?', now() - 2 * 86400e3, img.id);
  setSchool({ retentionDays: 7 });
  try {
    q.run('UPDATE oomba_chats SET updated_at=? WHERE id=?', now() - 6 * 86400e3, row().id);
    CO.prune();
    assert.ok(row(), 'six days: kept');
    assert.equal(q.get('SELECT bytes FROM oomba_files WHERE id=?', img.id).bytes, null, 'the picture went after a day');
    q.run('UPDATE oomba_chats SET updated_at=? WHERE id=?', now() - 8 * 86400e3, row().id);
    C.prune();
    assert.equal(row(), undefined, 'eight days: gone');
    assert.equal(q.get('SELECT 1 FROM oomba_files WHERE id=?', f.id), undefined, 'with its files');
  } finally { setSchool({}); }
  // New chat.
  await say(tester, { text: 'again', page: { type: 'teach' } }); await C.allSettled();
  const g = CO.addDoc(tester, { name: 'b.txt', kind: 'txt', pages: 1, words: 1, cut: false, text: 'x' });
  assert.equal((await as(tester)('/api/companion/chat/new', { body: {} })).status, 200);
  assert.equal(row(), undefined); assert.equal(q.get('SELECT 1 FROM oomba_files WHERE id=?', g.id), undefined);
  // Account deletion.
  const leaver = staff('Lee Leaver'); config.manipulativesUsers = [tester.username.toLowerCase(), leaver.username.toLowerCase()];
  await say(leaver, { text: 'hello', page: { type: 'teach' } }); await C.allSettled();
  CO.addDoc(leaver, { name: 'c.txt', kind: 'txt', pages: 1, words: 1, cut: false, text: 'y' });
  assert.ok(q.get("SELECT 1 FROM oomba_chats WHERE owner_id=? AND surface='companion'", leaver.id));
  const del = AD.adminDeleteAccount(boss, leaver.id);
  assert.equal(del.ok, true, JSON.stringify(del));
  assert.equal(q.get('SELECT 1 FROM oomba_chats WHERE owner_id=?', leaver.id), undefined);
  assert.equal(q.get('SELECT 1 FROM oomba_files WHERE owner_id=?', leaver.id), undefined);
});

test('the budget resting: a calm failure, nothing changed', async () => {
  CO.hooks.create = null;   // no key (and no stand-in): no client, as when the AI budget is resting
  try {
    await say(tester, { text: 'find me a game', page: { type: 'teach' } }); await C.allSettled();
    assert.equal((await chatOf(tester)).turns.at(-1).failed, 'resting');
  } finally { await reset(tester); }
});
