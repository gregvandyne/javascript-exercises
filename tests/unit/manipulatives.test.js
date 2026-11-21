// Virtual math manipulatives (services/manipulatives.js, routes/manipulatives.js): hidden behind the admin check, Oomba
// accounts and classes for every live session, who may see, push, export or end what, owned boards and share codes,
// text checks on sticky notes, the AI drafter's sanitizing (the AI is mocked), the PDF, cleanup, and the content fixes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-manip-');
import test from 'node:test';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const { TOOLS, pieceDefs, hexValue, freeSpot, HEX_SIXTHS, roomLayout, instructionNotes, stripHeight, STRIP } = await import('../../public/js/manip-data.js');
const { TASKS } = await import('../../public/js/manip-tasks.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString('latin1'); let json = null; try { json = JSON.parse(text); } catch { /* html or pdf */ }
  return { status: r.status, text, json, headers: r.headers, buf };
};

// The platform admin teaches a class of their own school (the "admin-teacher" who tests this on production).
const boss = createUser({ username: 'ManipBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Manip Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `4A-${k}` }).class;                 // boss teaches A
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Teacher', role: 'teacher' }).user.id);
  const B = S.createClass(boss, oak.id, { name: `4B-${k}`, teacherId: T.id }).class; // T teaches B
  const kid = (name, c) => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), b1 = kid('Bea Bloom', B);
  return { oak, A, B, T, a1, a2, b1 };
}
const board = (extra = {}) => ({ pieces: [{ id: 'p1', kind: 'unit', x: 10, y: 10, label: '1', value: 1, color: '#FFD23F', w: 30, h: 30 }], __ann: { notes: [{ id: 'n1', text: 'Count the units', x: 0.1, y: 0.1 }], strokes: [] }, ...extra });
const withFlags = async (flags, fn) => { const old = { m: config.manipulatives, u: config.manipulativesUsers }; Object.assign(config, flags); try { await fn(); } finally { config.manipulatives = old.m; config.manipulativesUsers = old.u; } };

test('migrations 0092 and 0093: there once, in order, their tables and columns exist, a session takes its work with it', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.indexOf('0093_manipulatives_room'), names.indexOf('0092_manipulatives') + 1);
  assert.equal(names.indexOf('0094_manipulatives_show_work'), names.indexOf('0093_manipulatives_room') + 1);
  assert.ok(q.all('PRAGMA table_info(manip_sessions)').some(c => c.name === 'room')); assert.ok(q.all('PRAGMA table_info(manip_work)').some(c => c.name === 'slot'));
  assert.equal(names.filter(n => n.startsWith('0092')).length, 1);
  assert.ok(names.indexOf('0092_manipulatives') > names.indexOf('0091_story_library'));
  assert.ok(names.slice(names.indexOf('0092_manipulatives') + 1).every(n => n > '0092_manipulatives'), 'numbered in order');
  for (const tb of ['manip_boards', 'manip_sessions', 'manip_work']) assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock', title: 'Cascade' }).session;
  assert.ok(M.join(w.a1, { code: s.code }).ok);
  q.run('DELETE FROM manip_sessions WHERE id=?', s.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_work WHERE session_id=?', s.id).n, 0, 'ON DELETE CASCADE');
});

test('hidden: signed out, students without a session, teachers, grown-ups get the normal 404; the admin gets a noindex page', async () => {
  const w = world();
  const grown = createUser({ username: 'ManipParent', password: 'secret123', accountType: 'grownup' });
  for (const who of [null, w.a1, w.T, grown]) {
    const page = await as(who)('/manipulatives');
    assert.equal(page.status, 404, `page for ${who ? who.username : 'signed out'}`);
    assert.doesNotMatch(page.text, /Math manipulatives|manip\.js|manipulatives\.css/, 'the normal 404 page, nothing of the tool');
    assert.equal((await as(who)('/api/manipulatives/state')).status, 404);
    assert.equal((await as(who)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'clock', state: {} } })).status, 404);
  }
  const ok = await as(boss)('/manipulatives');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('x-robots-tag'), /noindex/);
  assert.match(ok.text, /<meta name="robots" content="noindex/);
  assert.match(ok.text, /\/js\/manip\.js/);
  await withFlags({ manipulatives: false }, async () => assert.equal((await as(boss)('/manipulatives')).status, 404, 'MANIPULATIVES=0 hides it from the admin too'));
  await withFlags({ manipulativesUsers: [w.T.username.toLowerCase(), w.a1.username.toLowerCase()] }, async () => {
    assert.equal((await as(w.T)('/manipulatives')).status, 200, 'an allowlisted teacher');
    assert.equal((await as(w.a1)('/manipulatives')).status, 404, 'the allowlist is for staff only');
  });
});

test('no link to it anywhere: menus, the home page, the sitemap and robots.txt', async () => {
  for (const p of ['/', '/sitemap.xml', '/robots.txt', '/teachers']) assert.doesNotMatch((await as(boss)(p)).text, /manipulatives/i, p);
  for (const f of ['server/views/layout.js', 'server/seo.js', 'server/routes/seo.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /manipulatives/i, f);
});

test('live sessions belong to a teacher and one of their classes; only that class\'s students join, the code alone grants nothing', async () => {
  const w = world();
  assert.equal(M.createSession(boss, { classId: w.B.id, tool: 'clock' }).ok, false, 'not a class the admin teaches');
  const r = await as(boss)('/api/manipulatives/live', { method: 'POST', body: { classId: w.A.id, tool: 'base-ten-blocks', title: 'Place value' } });
  assert.equal(r.status, 200); const { id, code } = r.json.session;
  // A student of the class sees the session and joins with the code.
  assert.equal((await as(w.a1)('/manipulatives')).status, 200);
  assert.deepEqual((await as(w.a1)('/api/manipulatives/state')).json.sessions.map(s => s.id), [id]);
  assert.equal((await as(w.a1)('/api/manipulatives/live/join', { method: 'POST', body: { code: code.toLowerCase() } })).status, 200);
  // A student of another class who has the code: refused exactly like a wrong code.
  const out = await as(w.b1)('/api/manipulatives/live/join', { method: 'POST', body: { code } });
  assert.equal(out.status, 404, 'no page access at all');
  assert.equal((await as(w.b1)('/manipulatives')).status, 404);
  assert.equal(M.join(w.b1, { code }).code, 'notFound');
  assert.equal(M.join(w.b1, { code: 'ZZZZ2222' }).code, 'notFound', 'the same answer as a wrong code');
  // A new session for the class ends the one before it.
  const again = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session;
  assert.equal(M.getSession(id).status, 'ended'); assert.equal(M.getSession(again.id).status, 'active');
  assert.equal(M.join(w.a1, { code }).code, 'ended');
  assert.equal(M.join(w.b1, { id }).code, 'notFound', 'nor by id');
  assert.equal(M.studentView(w.b1, id), null);
  // Guests and grown-ups never join.
  const guest = createUser({ username: 'ManipGuest', isGuest: true });
  assert.equal(M.join(guest, { code }).code, 'notFound');
});

test('only the session\'s teacher (or the admin) opens the dashboard, pushes, exports or ends; a student or another teacher gets 404', async () => {
  const w = world();
  await withFlags({ manipulativesUsers: [w.T.username.toLowerCase()] }, async () => {
    const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks', title: 'Push test' }).session;
    const b = M.saveBoard(boss, { tool: 'base-ten-blocks', title: 'Mine', state: board() }).board;
    M.join(w.a1, { code: s.code });
    for (const who of [w.a1, w.T]) {
      const view = await as(who)(`/api/manipulatives/live/${s.id}`);
      if (who === w.a1) { assert.equal(view.status, 200); assert.equal(view.json.role, 'student'); assert.equal(view.json.session.students, undefined, 'no class list for a student'); }
      else assert.equal(view.status, 404, 'another teacher');
      assert.equal((await as(who)(`/api/manipulatives/live/${s.id}/push`, { method: 'POST', body: { boardId: b.id } })).status, 404);
      assert.equal((await as(who)(`/api/manipulatives/live/${s.id}/export.pdf`)).status, 404);
      assert.equal((await as(who)(`/api/manipulatives/live/${s.id}/end`, { method: 'POST', body: {} })).status, 404);
    }
    assert.equal(M.getSession(s.id).status, 'active');
    assert.equal(M.getSession(s.id).pushed_state, null);
    // The teacher: the dashboard, a push of their own board, the PDF, the end.
    const dash = await as(boss)(`/api/manipulatives/live/${s.id}`);
    assert.equal(dash.json.role, 'teacher'); assert.equal(dash.json.session.students.length, 1);
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/push`, { method: 'POST', body: { boardId: b.id } })).status, 200);
    const other = M.saveBoard(boss, { tool: 'clock', state: { c1: { h: 1, m: 0 } } }).board;
    assert.equal(M.push(boss, s.id, other.id).code, 'otherTool');
    const tBoard = M.saveBoard(w.T, { tool: 'base-ten-blocks', state: board() }).board;
    assert.equal(M.push(boss, s.id, tBoard.id).code, 'noBoard', 'only the host\'s own boards');
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/end`, { method: 'POST', body: {} })).status, 200);
    assert.equal(M.getSession(s.id).status, 'ended');
    assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/work`, { method: 'POST', body: { state: board() } })).status, 409, 'no work after the end');
    assert.equal(M.join(w.a2, { id: s.id }).code, 'ended');
  });
});

test('the shared room, when the teacher shows work: everyone sees every square, but typed text reaches only its writer and the teacher', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const ada = board({ __ann: { notes: [{ id: 'x', text: 'Ada secret plan 42', x: 0.5, y: 0.5 }], strokes: [] } });
  assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/area/${w.a1.id}`, { method: 'POST', body: { state: ada } })).status, 200);
  assert.equal(M.submitWork(w.a2, s.id, { bars: [{ name: 'Abe bar', segs: [{ label: 'Abe label', value: 2 }] }] }).ok, true, 'the old autosave address still saves their own square');
  assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/show`, { method: 'POST', body: { show: true } })).status, 200);
  // Abe (a classmate) sees Ada's square and pieces, by her display name, with no note text and no roster names at all.
  const abe = await as(w.a2)(`/api/manipulatives/live/${s.id}/room`);
  assert.equal(abe.status, 200); assert.equal(abe.json.room.role, 'student');
  const adaSq = abe.json.room.areas.find(x => x.key === w.a1.id);
  assert.equal(adaSq.name, w.a1.display_name); assert.match(adaSq.state, /"kind":"unit"/, 'pieces are shared');
  assert.doesNotMatch(abe.text, /secret plan|Ada Apple|Abe Acorn/, 'never the text, never roster names');
  assert.equal(JSON.parse(adaSq.state).__ann.notes[0].blank, true, 'the note\'s shape only');
  assert.equal(abe.json.room.code, undefined, 'the join code is the teacher\'s');
  // Ada (as a classmate of Abe) gets his bar labels blanked.
  const adaView = await as(w.a1)(`/api/manipulatives/live/${s.id}/room`);
  assert.doesNotMatch(adaView.text, /Abe bar|Abe label/); assert.match(adaView.text, /secret plan/, 'Ada sees her own note');
  // The teacher sees everything, by roster name.
  const t = (await as(boss)(`/api/manipulatives/live/${s.id}/room`)).json.room;
  assert.equal(t.role, 'teacher'); assert.equal(t.areas.find(x => x.key === w.a1.id).name, 'Ada Apple');
  assert.match(JSON.stringify(t), /secret plan/); assert.match(JSON.stringify(t), /Abe bar/);
  // Students can't save boards, make share codes or draft with AI.
  assert.equal((await as(w.a1)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'clock', state: {} } })).status, 404);
  assert.equal(M.saveBoard(w.a1, { tool: 'clock', state: {} }).ok, false);
  assert.equal((await as(w.a1)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'tell time' } })).status, 404);
});

test('the shared room: a student writes only inside their own square; the teacher writes anywhere; teacher notes are everyone\'s', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const slots = q.all('SELECT user_id, slot FROM manip_work WHERE session_id=? ORDER BY slot', s.id).map(r => r.slot);
  assert.deepEqual(slots, [0, 1], 'one square each, in the grid');
  // Into a classmate's square, or the teacher's area: the same 404 as a wrong address.
  for (const key of [w.a2.id, 't', 'nobody']) assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/area/${key}`, { method: 'POST', body: { state: board() } })).status, 404, key);
  assert.equal(M.saveArea(w.b1, s.id, w.b1.id, board()).code, 'notFound', 'not in the class');
  // A piece dragged out of the square is put back inside it (its size: services/manip-data roomLayout).
  M.saveArea(w.a1, s.id, w.a1.id, { pieces: [{ id: 'p', kind: 'rod', x: 5000, y: -300, w: 30, h: 150, label: '10', value: 10 }] });
  const p = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state).pieces[0];
  const sq = roomLayout('base-ten-blocks').sq;
  assert.deepEqual([p.x, p.y], [sq.w - 30, 0]);
  // The teacher writes in Ada's square and in their own area; their notes keep their text for everyone.
  assert.equal(M.saveArea(boss, s.id, w.a1.id, { pieces: [], __ann: { notes: [{ id: 'tn', text: 'Try fewer pieces', x: 0.1, y: 0.1 }], strokes: [] } }).ok, true);
  assert.equal(M.saveArea(boss, s.id, 't', { pieces: [], __ann: { notes: [{ id: 'big', text: 'Build 232', x: 0.1, y: 0.1, by: 's' }], strokes: [] } }).ok, true);
  M.showWork(boss, s.id, true);   // (classmates see squares only while the teacher shows work)
  const abe = M.roomFor(w.a2, s.id);
  assert.match(abe.areas.find(x => x.key === w.a1.id).state, /Try fewer pieces/, 'a teacher note in a square is read by all');
  assert.equal(JSON.parse(abe.teacher.state).__ann.notes[0].text, 'Build 232');
  // Ada can't change or remove the teacher's note, and can't make her own note look like the teacher's.
  M.saveArea(w.a1, s.id, w.a1.id, { pieces: [], __ann: { notes: [{ id: 'tn', text: 'changed', x: 0, y: 0, by: 't' }, { id: 'mine', text: 'my words', x: 0.5, y: 0.5, by: 't' }], strokes: [] } });
  const notes = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state).__ann.notes;
  assert.deepEqual(notes.map(n => [n.id, n.text, n.by]), [['tn', 'Try fewer pieces', 't'], ['mine', 'my words', undefined]]);
  assert.doesNotMatch(M.roomFor(w.a2, s.id).areas.find(x => x.key === w.a1.id).state, /my words/);
  // After the end: nobody writes.
  M.end(boss, s.id);
  assert.equal(M.saveArea(boss, s.id, 't', {}).code, 'ended');
});

test('saved boards are owned: the list is your own, only the owner deletes, a share code opens a copy', async () => {
  const w = world();
  await withFlags({ manipulativesUsers: [w.T.username.toLowerCase()] }, async () => {
    const mine = (await as(boss)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'base-ten-blocks', title: 'Boss board', state: board() } })).json.board;
    const his = M.saveBoard(w.T, { tool: 'money', title: 'Tom board', state: { pieces: [] } }).board;
    assert.match(mine.code, /^[A-HJKMNP-Z2-9]{8}$/);
    const list = (await as(w.T)('/api/manipulatives/state')).json.boards;
    assert.ok(list.some(b => b.id === his.id)); assert.ok(!list.some(b => b.id === mine.id), 'never another owner\'s board');
    assert.equal((await as(w.T)(`/api/manipulatives/boards/${mine.id}`)).status, 404);
    assert.equal((await as(w.T)(`/api/manipulatives/boards/${mine.id}/delete`, { method: 'POST', body: {} })).status, 404);
    assert.ok(M.ownBoard(boss, mine.id), 'still there');
    // Tom opens Boss's code: a copy for his own board. The saved board does not change, and Tom does not own it.
    const open = await as(w.T)(`/api/manipulatives/code/${mine.code}`);
    assert.equal(open.status, 200); assert.equal(open.json.board.tool, 'base-ten-blocks'); assert.match(open.json.board.state, /Count the units/);
    assert.equal(open.json.board.id, undefined, 'no id to change it by');
    assert.equal(M.ownBoard(w.T, mine.id), null);
    assert.equal((await as(boss)(`/api/manipulatives/boards/${mine.id}/delete`, { method: 'POST', body: {} })).status, 200);
    assert.equal(M.ownBoard(boss, mine.id), null);
    assert.equal((await as(w.T)(`/api/manipulatives/code/${mine.code}`)).status, 400, 'a deleted board\'s code opens nothing');
  });
  // A student in a session may open a teacher's code (a copy into their own board).
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session; M.join(w.a1, { code: s.code });
  const c = M.saveBoard(boss, { tool: 'clock', state: { c1: { h: 3, m: 0 } } }).board;
  assert.equal((await as(w.a1)(`/api/manipulatives/code/${c.code}`)).status, 200);
});

test('sticky notes and labels go through the site\'s word rules; boards are rebuilt and capped', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'bar-models' }).session; M.join(w.a1, { code: s.code });
  const note = text => ({ __ann: { notes: [{ id: 'n', text, x: 0.2, y: 0.2 }], strokes: [] } });
  const bad = await as(w.a1)(`/api/manipulatives/live/${s.id}/work`, { method: 'POST', body: { state: note('you are a shit') } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'words');
  assert.equal(M.submitWork(w.a1, s.id, note('call me 555 123 4567')).code, 'personal');
  assert.equal(M.submitWork(w.a1, s.id, { bars: [{ name: 'ok', segs: [{ label: 'my insta @someone', value: 1 }] }] }).code, 'personal');
  assert.equal(M.saveBoard(boss, { tool: 'clock', state: note('www.example.com') }).code, 'personal', 'teachers too');
  assert.equal(M.saveBoard(boss, { tool: 'clock', state: { weird: 'porn' } }).code, 'words', 'any string on the board');
  assert.equal(M.textProblem('Build 246. What changes if you break a hundred?'), null, 'ordinary math text passes');
  assert.equal(M.cleanState('[1,2]').code, 'badState');
  assert.equal(M.cleanState('x'.repeat(M.STATE_MAX + 1)).code, 'badState');
  const many = M.cleanState({ __ann: { notes: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, text: 'hi', x: 5, y: -1 })), strokes: [{ c: 'red', pts: [{ x: 9, y: 9 }] }] } });
  const st = JSON.parse(many.state);
  assert.equal(st.__ann.notes.length, 12); assert.deepEqual([st.__ann.notes[0].x, st.__ann.notes[0].y], [1, 0]); assert.equal(st.__ann.strokes[0].c, '#FF6B4A');
});

test('the AI drafter: hosts only, through the site\'s AI client with the configured model; no names in; the model says what, the code checks it and lays it out', async () => {
  const w = world();
  const calls = [];
  let reply = null;
  M.hooks.create = async params => { calls.push(params); return { model: params.model, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(reply) }] }; };
  try {
    // The owner's example: 8 clocks with different times (the model repeats one and sends a bad one).
    const times = ['3:00', '7:30', '9:15', '11:45', '3:00', '12:10', '6:05', '25:99'];
    reply = { title: 'What time is it? '.repeat(10), steps: ['Write the time under each clock.', 'damn shit', 'Visit www.example.com'], items: times.map(t => ({ time: t, box: 'answer', x: 0.5, y: 0.5 })) };
    const r = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'Create 8 different clocks with different times for my students to determine the time of each', task: 'not a real task' } });
    assert.equal(r.status, 200); assert.equal(r.json.ai, true);
    assert.equal(calls[0].model, config.builderModel, 'the model comes from config');
    const prompt = calls[0].messages[0].content;
    assert.doesNotMatch(prompt, /miro|muse/i); assert.doesNotMatch(prompt, /not a real task/, 'only library tasks are passed on'); assert.doesNotMatch(prompt, /Ada|Apple|Abe|Bea/);
    assert.match(prompt, /exactly as many items as the teacher asks for/); assert.doesNotMatch(prompt, /coordinates|fractions of the board/i, 'no places from the model');
    assert.doesNotMatch(JSON.stringify(calls[0].output_config.format.schema), /"x":\{"type":"number"\}|notes|strokes/, 'no coordinates, notes or pen marks in the schema');
    const d = r.json.draft, clocks = d.board.objects.filter(o => o.k === 'clock'), boxes = d.board.objects.filter(o => o.k === 'answer');
    assert.equal(d.n, 7, 'the invalid time is dropped'); assert.equal(clocks.length, 7); assert.equal(boxes.length, 7);
    assert.equal(new Set(clocks.map(o => `${o.st.h}:${o.st.m}`)).size, 7, 'every clock a different time (a repeat became a new time)');
    assert.deepEqual(d.steps, ['Write the time under each clock.'], 'steps that fail the word rules are dropped; no sticky notes');
    assert.equal(d.board.__ann.notes.length, 0); assert.equal(d.board.__ann.strokes.length, 0);
    assert.ok(d.title.length <= 80);
    // Answers: computed by the code, stored on the teacher's board only.
    assert.deepEqual(boxes.map(o => o.st.key).slice(0, 2), ['3:00', '7:30']);
    // A student's name in the brief never reaches the AI.
    const n = calls.length;
    const named = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'A clock lesson for Ada and her friends' } });
    assert.equal(named.status, 400); assert.equal(named.json.code, 'names'); assert.equal(calls.length, n);
    assert.equal((await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'shit' } })).json.code, 'words');
    // More than 12 asked for: 12, and the step says so.
    reply = { title: 'Lots', steps: ['Read each clock.'], items: Array.from({ length: 20 }, (_, i) => ({ time: `${(i % 12) + 1}:${String((i * 5) % 60).padStart(2, '0')}`, box: 'answer' })) };
    const big = (await M.draftLesson(boss, { tool: 'clock', brief: 'twenty clocks please' })).draft;
    assert.equal(big.n, 12); assert.equal(big.capped, true); assert.match(big.steps[0], /12 problems/);
    assert.equal((await as(w.a1)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'tell time' } })).status, 404);
  } finally { M.hooks.create = null; }
  // No key (or the budget is resting): the tool's usual board, the brief as its step, no AI call.
  const plain = await M.draftLesson(boss, { tool: 'money', brief: 'make 75 cents two ways' });
  assert.equal(plain.ai, false); assert.deepEqual(plain.draft.steps, ['make 75 cents two ways']); assert.equal(plain.draft.n, 0);
  assert.equal(M.sanitizeDraft(null, 'money').n, 0);
});
test('objects in the room: a student adds them only inside their own square (kept inside it, under its strip); at most 30 there, 40 on a board; unknown kinds dropped', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session;
  M.join(w.a1, { id: s.id });
  const clock = (x, y, sc = 1, extra = {}) => ({ id: `c${x}${y}`, k: 'clock', x, y, s: sc, st: { h: 3, m: 0, start: null, label: '' }, ...extra });
  const many = Array.from({ length: 33 }, (_, i) => clock(i * 10, 5000, 0.35));
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [...many, { id: 'x', k: 'dragon', x: 0, y: 0, s: 1, st: {} }, { id: 'y', k: 'clock', x: 0, y: 0, s: 1, st: 'nope' }] }).ok);
  const mine = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state).objects;
  assert.equal(mine.length, 30, 'at most 30 objects in a square'); assert.ok(mine.every(o => o.k === 'clock'));
  const sq = roomLayout('clock').sq;
  for (const o of mine) { assert.ok(o.x >= 0 && o.y >= 0 && o.x + 252 * o.s <= sq.w + 1 && o.y + 382 * o.s <= sq.h + 1, 'inside the square'); }
  // Never in a classmate's square, never in the teacher's area.
  assert.equal(M.saveArea(w.a1, s.id, 't', { v: 2, objects: [clock(0, 0)] }).ok, false);
  // A huge object is made to fit; a scale out of range is brought back.
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [clock(0, 0, 40)] }).ok);
  const big = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state).objects[0];
  assert.ok(big.s <= sq.h / 382 + 0.001);
  // The teacher's area takes up to 40; a saved board up to 40 too.
  assert.ok(M.saveArea(boss, s.id, 't', { v: 2, objects: Array.from({ length: 45 }, (_, i) => clock(i * 30, 0, 0.35)) }).ok);
  assert.equal(JSON.parse(q.get('SELECT room FROM manip_sessions WHERE id=?', s.id).room).objects.length, 40);
  const c = JSON.parse(M.cleanState({ v: 2, objects: Array.from({ length: 50 }, (_, i) => clock(i * 300, 100)) }, null, 'clock').state);
  assert.equal(c.objects.length, 40); assert.ok(c.objects.every(o => o.x + 252 * o.s <= 4000 && o.y >= 0));
  // Each object keeps its own state through a save and a share code.
  const saved = M.saveBoard(boss, { tool: 'clock', title: 'Three', state: { v: 2, objects: [clock(0, 0, 1), { ...clock(300, 0), st: { h: 7, m: 45, start: { h: 7, m: 0 }, label: '' } }, { ...clock(600, 0), st: { h: 11, m: 5, start: null, label: 'End' } }] } });
  const code = q.get('SELECT code FROM manip_boards WHERE id=?', saved.board.id).code;
  const back = JSON.parse(M.openCode(boss, code).board.state).objects.map(o => [o.st.h, o.st.m, o.st.label, !!o.st.start]);
  assert.deepEqual(back, [[3, 0, '', false], [7, 45, '', true], [11, 5, 'End', false]]);
  // An old saved board (the first release's format) still opens and is saved as it was until it is changed.
  const old = M.saveBoard(boss, { tool: 'clock', title: 'Old', state: { c1: { h: 9, m: 10 }, c2: { h: 10, m: 40 }, two: true, tracker: 0 } });
  assert.ok(old.ok); assert.match(M.ownBoard(boss, old.board.id).state, /"c1"/);
  assert.match(M.summarize(JSON.stringify({ v: 2, objects: [{ k: 'clock', st: { h: 7, m: 45, start: { h: 7, m: 0 } } }] })).join(' '), /Clock: 7:45 \(tracking from 7:00\)/);
});
test('a practice set placed in the room: one scale for places and sizes, nothing overlapping, everything inside its area, readable (8 clocks, 12 fraction equations, 6 number lines)', async () => {
  const { buildPractice } = await import('../../public/js/manip-practice.js');
  const B = await import('../../public/js/manip-board.js');
  const D = await import('../../public/js/manip-data.js');
  const sets = {
    clock: { items: ['3:00', '7:30', '9:15', '11:45', '12:10', '6:05', '1:55', '4:40'].map(time => ({ time, box: 'answer' })) },
    'fraction-tiles': { items: [['1/2', '1/3'], ['1/4', '1/3'], ['2/3', '1/4'], ['1/2', '1/5'], ['3/8', '1/4'], ['1/6', '1/2'], ['1/2', '1/4'], ['3/4', '1/8'], ['2/5', '1/2'], ['1/3', '1/6'], ['5/6', '1/12'], ['1/10', '1/2']].map(([a, b]) => ({ op: '+', a, b, box: 'answer' })) },
    'number-lines': { items: [[0, 10, 1, 7], [0, 20, 2, 14], [0, 1, 0.1, 0.3], [-5, 5, 1, -2], [0, 100, 10, 60], [0, 2, 0.25, 1.75]].map(([min, max, step, value]) => ({ min, max, step, value, box: 'answer' })) },
  };
  const check = (tool, board, space, where) => {
    const rects = (board.objects || []).map(o => ({ ...B.objRect(tool, o), k: o.k, s: o.s }));
    const texts = ((board.__ann || {}).texts || []).map(n => ({ x: n.x * space.w, y: n.y * space.h, w: 12, h: 18, k: 'text' }));
    for (const r of rects) assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= space.w + 0.5 && r.y + r.h <= space.h + 0.5, `${tool} ${where}: ${r.k} inside (${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}x${Math.round(r.h)} in ${space.w}x${space.h})`);
    const all = [...rects, ...texts];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      assert.ok(!(a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5), `${tool} ${where}: ${a.k} and ${b.k} overlap`);
    }
    const scales = new Set(rects.map(r => r.s)); assert.equal(scales.size, 1, `${tool} ${where}: one scale for everything`);
    assert.ok([...scales][0] >= B.KMIN - 1e-6, `${tool} ${where}: readable (scale ${[...scales][0]})`);
  };
  for (const [tool, reply] of Object.entries(sets)) {
    const w = world(), r = buildPractice(tool, reply);
    const saved = M.saveBoard(boss, { tool, title: 'Set', state: { ...r.board, __steps: [{ id: 's0', text: 'Solve each one.' }] } });
    const s = M.createSession(boss, { classId: w.A.id, tool, boardId: saved.board.id }).session;
    // The teacher's area: the board fitted (the area grows taller when it must).
    const room = JSON.parse(q.get('SELECT room FROM manip_sessions WHERE id=?', s.id).room), L = D.roomLayout(tool, D.layoutOf(room));
    check(tool, room, { w: L.teacher.w, h: L.teacher.h - D.TEACHER_STEP_H }, 'teacher area');
    // A push: every square grows tall enough; the student's page fits it into their square; the server keeps it as is.
    M.join(w.a1, { id: s.id }); assert.ok(M.push(boss, s.id, saved.board.id).ok);
    const room2 = JSON.parse(q.get('SELECT room FROM manip_sessions WHERE id=?', s.id).room), L2 = D.roomLayout(tool, D.layoutOf(room2));
    const pushed = JSON.parse(JSON.parse(q.get('SELECT pushed_state FROM manip_sessions WHERE id=?', s.id).pushed_state).state);
    const ws = { w: L2.sq.w, h: L2.sq.h - M.STRIP_RESERVE };
    const fitted = B.fitInto(tool, B.migrate(tool, pushed), B.WORLD, ws).board;
    assert.ok(M.saveArea(w.a1, s.id, w.a1.id, fitted).ok);
    const stored = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state);
    check(tool, stored, ws, 'student square');
    // Laid out for the room as the room is (a narrower square: fewer columns).
    assert.ok(L2.sq.h >= D.areaSize(tool).h);
  }
});
test('practice answers are the teacher\'s alone: never in a share code a student opens, a push, the teacher\'s area for students, or a classmate\'s square', async () => {
  const w = world();
  M.hooks.create = async params => ({ model: params.model, usage: {}, content: [{ type: 'text', text: JSON.stringify({ title: 'Fractions', steps: ['Solve each one.'],
    items: [{ op: '+', a: '1/2', b: '1/3' }, { op: '-', a: '3/4', b: '1/8' }, { op: 'x', a: '1/4', b: '3' }, { op: '/', a: '1/2', b: '3' }, { op: '=', a: '1/2', b: '8' }, { op: 'compare', a: '2/3', b: '3/4' }].map(x => ({ ...x, box: 'answer' })) }) }] });
  try {
    const d = (await M.draftLesson(boss, { tool: 'fraction-tiles', brief: 'Make 6 fraction addition problems with unlike denominators for grade 5' })).draft;
    const eqs = d.board.objects.filter(o => o.k === 'frac-eq');
    assert.equal(eqs.length, 6); assert.deepEqual(eqs.map(o => o.st.key), ['5/6', '5/8', '3/4', '1/6', '4/8', '<']);
    const saved = M.saveBoard(boss, { tool: 'fraction-tiles', title: 'F', state: { ...d.board, __steps: d.steps.map((text, i) => ({ id: `s${i}`, text })) } });
    assert.ok(saved.ok);
    // The owner reopens it with the answers; a student who opens the code does not get them.
    const code = q.get('SELECT code FROM manip_boards WHERE id=?', saved.board.id).code;
    assert.match((await as(boss)(`/api/manipulatives/code/${code}`)).text, /5\/6/);
    const sOpen = await as(w.a1)(`/api/manipulatives/code/${code}`);
    if (sOpen.status === 200) assert.doesNotMatch(sOpen.text, /"key"/);
    // A session from the board: the teacher's area has the answers for the teacher, not for students; a push neither.
    const s = M.createSession(boss, { classId: w.A.id, tool: 'fraction-tiles', boardId: saved.board.id }).session;
    M.join(w.a1, { id: s.id }); M.join(w.a2, { id: s.id });
    assert.match(JSON.stringify(M.roomFor(boss, s.id).teacher), /key/);
    assert.doesNotMatch(JSON.stringify(M.roomFor(w.a1, s.id)), /\\"key\\"|5\/6/);
    assert.ok(M.push(boss, s.id, saved.board.id).ok);
    assert.doesNotMatch(JSON.stringify(M.roomFor(w.a1, s.id)), /\\"key\\"|5\/6/, 'the push reaches students without answers');
    // A student can't plant answers, and a classmate never sees a typed answer (work shown).
    const eq = JSON.parse(JSON.stringify(eqs[0])); eq.st.ans = '5/6'; eq.st.key = 'cheat';
    assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [eq], pieces: [] }).ok);
    assert.doesNotMatch(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state, /cheat/);
    M.showWork(boss, s.id, true);
    const mate = M.roomFor(w.a2, s.id).areas.find(a => a.key === w.a1.id);
    assert.doesNotMatch(mate.state, /5\/6"|"ans":"5/); assert.match(M.roomFor(boss, s.id).areas.find(a => a.key === w.a1.id).state, /"ans":"5\/6"/, 'the teacher sees the answer');
  } finally { M.hooks.create = null; }
});
test('the PDF: the teacher\'s export of the students\' work, with the names the teacher already sees', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks', title: 'PDF test' }).session;
  M.join(w.a1, { code: s.code }); M.submitWork(w.a1, s.id, board());
  const r = await as(boss)(`/api/manipulatives/live/${s.id}/export.pdf`);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /attachment; filename="manipulatives-[a-z0-9]{8}\.pdf"/);
  assert.ok(r.text.startsWith('%PDF-1.4'));
  assert.match(r.text, /Ada Apple/); assert.match(r.text, /Count the units/); assert.doesNotMatch(r.text, /Abe Acorn/, 'only students who joined');
  const xref = +r.text.match(/startxref\n(\d+)/)[1];
  assert.equal(r.text.slice(xref, xref + 4), 'xref', 'the xref offset is right');
  assert.equal(M.pdfSafe('Zoë · 3×4 − 1 ✓ ā'), 'Zoë · 3×4 - 1 OK a');
});

test('the class page tells the class\'s students about a running session, and nobody else', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock', title: 'Clock time' }).session;
  const mine = await as(w.a1)(`/class/${w.A.id}`);
  assert.match(mine.text, new RegExp(`/manipulatives#join/${s.id}`));
  assert.doesNotMatch((await as(w.b1)(`/class/${w.B.id}`)).text, /manipulatives/);
  M.end(boss, s.id);
  assert.doesNotMatch((await as(w.a1)(`/class/${w.A.id}`)).text, /manipulatives#join/);
});

test('cleanup: account deletion, leaving a class, deleting a class; sessions end on their own', () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  S.removeFromClass(boss, w.A.id, w.a2.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_work WHERE user_id=?', w.a2.id).n, 0, 'leaving the class takes their work');
  assert.equal(M.studentView(w.a2, s.id), null);
  // A teacher's account deleted by the admin: their boards and sessions go.
  const t2 = createUser({ username: 'ManipTeach2', password: 'secret123-long-pass' }); S.addMember(boss, w.oak.id, t2.id, 'teacher');
  const C = S.createClass(boss, w.oak.id, { name: 'Empty', teacherId: t2.id }).class;
  config.manipulativesUsers = [t2.username.toLowerCase()];
  try {
    M.saveBoard(t2, { tool: 'money', state: { pieces: [] } });
    const s2 = M.createSession(t2, { classId: C.id, tool: 'money' }).session;
    assert.ok(s2);
    deleteAccount(t2.id, boss, { by: 'admin', parentMade: false, leaveSchools: true });
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?', t2.id).n, 0);
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_sessions WHERE host_id=?', t2.id).n, 0);
  } finally { config.manipulativesUsers = []; }
  M.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_work WHERE user_id=?', w.a1.id).n, 0);
  // A class deleted: its sessions go.
  const E = S.createClass(boss, w.oak.id, { name: 'Gone soon' }).class;
  M.createSession(boss, { classId: E.id, tool: 'clock' });
  assert.equal(S.deleteClass(boss, E.id).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_sessions WHERE class_id=?', E.id).n, 0);
  // Sessions end by themselves after SESSION_HOURS, and go KEEP_DAYS after that.
  q.run('UPDATE manip_sessions SET created_at=? WHERE id=?', Date.now() - (M.SESSION_HOURS + 1) * 3600e3, s.id);
  M.prune();
  assert.equal(M.getSession(s.id).status, 'ended');
  q.run('UPDATE manip_sessions SET ended_at=? WHERE id=?', Date.now() - (M.KEEP_DAYS + 1) * 86400e3, s.id);
  M.prune();
  assert.equal(M.getSession(s.id), null);
});

test('content: 18 tools, 300 tasks with their codes, Number rods, US spelling, grades K-8, no other products, no em dashes', () => {
  assert.equal(TOOLS.length, 18);
  const all = Object.values(TASKS).flat();
  assert.equal(all.length, 300);
  assert.deepEqual(Object.keys(TASKS).sort(), TOOLS.map(x => x.slug).sort());
  assert.ok(all.every(x => x.title && x.prompt && x.notes && /^(K|[1-8]|HS)[.A-Z-]/.test(x.ccss) && /^(K|[1-8])$/.test(x.grade)), 'grades K-8, a code on every task');
  assert.equal(all.filter(x => x.ccss.startsWith('HS')).length, 6, 'the high-school codes are kept');
  assert.ok(TOOLS.every(x => /^(K|\d)-\d$/.test(x.grades) && +x.grades.split('-')[1] <= 8));
  const files = ['public/js/manip.js', 'public/js/manip-room.js', 'server/services/manip-socket.js', 'server/services/manip-live.js', 'public/js/manip-data.js', 'public/js/manip-tasks.js', 'public/css/manipulatives.css', 'server/services/manipulatives.js', 'server/routes/manipulatives.js'];
  const text = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.doesNotMatch(text, /cuisenaire|miro\b|polypad|mathigon|didax|hand2mind/i);
  assert.doesNotMatch(text, /—/, 'no em dashes');
  assert.doesNotMatch(text, /\b(colour|labell|centre|customis|subitis|modell|grey\b|neighbour|favourite|organis|recognis)/i, 'US spelling');
  assert.doesNotMatch(text, /K-12|K-9/, 'grades K-8');
  assert.doesNotMatch(files.filter(f => !f.includes('tasks') && !/manip-(socket|live)/.test(f)).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n'), /\bprice|\/month|per month|subscribe|upgrade/i, 'no prices on these pages (money word problems in the tasks are math)');
  assert.ok(TOOLS.find(x => x.slug === 'number-rods' && x.name === 'Number rods'));
});

test('pattern blocks: the hexagon value in sixths, squares and thin rhombuses left out', () => {
  const b = (...kinds) => kinds.map(kind => ({ kind }));
  assert.deepEqual(hexValue(b('hex', 'trap', 'tri', 'sq')), { text: '1 2/3', sixths: 10, left: 1 });
  assert.equal(hexValue(b('trap')).text, '1/2'); assert.equal(hexValue(b('para', 'para', 'para')).text, '1');
  assert.equal(hexValue(b('tri', 'tri')).text, '1/3'); assert.equal(hexValue([]).text, '0');
  assert.deepEqual(hexValue(b('rhom', 'sq')), { text: '0', sixths: 0, left: 2 });
  const defs = pieceDefs('pattern-blocks');
  for (const d of defs) assert.equal(d.value, (HEX_SIXTHS[d.kind] || 0) / 6, `${d.kind}: its value is its share of the hexagon`);
});

test('new pieces land in the next free spot: never on a piece or a note; a full board steps on from the last piece', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) {
    const at = freeSpot(obs, 96, 84, 800, 430);
    assert.ok(!obs.some(o => at.x < o.x + o.w && at.x + 96 > o.x && at.y < o.y + o.h && at.y + 84 > o.y), `piece ${i} overlaps nothing`);
    assert.ok(at.x >= 0 && at.x + 96 <= 800 && at.y >= 0 && at.y + 84 <= 430);
    obs.push({ ...at, w: 96, h: 84 });
  }
  const note = { x: 12, y: 12, w: 176, h: 118 };
  const first = freeSpot([note], 40, 40, 800, 430);
  assert.ok(first.x >= note.x + note.w, 'not under a sticky note');
  const full = [{ x: 0, y: 0, w: 800, h: 430 }];
  assert.deepEqual(freeSpot(full, 40, 40, 800, 430), { x: 24, y: 24 }, 'full: a small offset');
  // The board's size travels with it for the teacher's view, cleaned.
  assert.deepEqual(JSON.parse(M.cleanState({ __ann: { notes: [], strokes: [], size: { w: 390.6, h: 'x' } } }).state).__ann.size, { w: 391, h: 430 });
});

test('the room\'s socket: only the session\'s teacher and joined students connect; cursors relay and are never stored', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const LIVE = await import('../../server/services/manip-live.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const wsBase = base.replace('http', 'ws');
  const open = (who, { sid = s.id, origin = base } = {}) => new Promise(resolve => {
    const ws = new WebSocket(`${wsBase}/api/manipulatives/ws?s=${sid}`, { headers: { ...(who ? { cookie: cookieFor(who.id) } : {}), ...(origin ? { origin } : {}) } });
    const got = [];
    ws.on('message', d => got.push(JSON.parse(String(d))));
    ws.on('open', () => { opened.push(ws); resolve({ ws, got, ok: true }); });
    ws.on('unexpected-response', (req, res) => resolve({ ok: false, status: res.statusCode }));
    ws.on('error', () => resolve({ ok: false, status: 0 }));
  });
  const dbBefore = JSON.stringify(q.all('SELECT * FROM manip_work WHERE session_id=?', s.id)) + JSON.stringify(q.get('SELECT * FROM manip_sessions WHERE id=?', s.id));
  let auditBefore = 0; const opened = [];
  try {
    // Refused: signed out, a student of another class, a non-host teacher, a student who never joined, a foreign Origin.
    assert.equal((await open(null)).status, 404);
    assert.equal((await open(w.b1)).status, 404, 'outside the class');
    assert.equal((await open(w.T)).status, 404, 'a teacher who is not the host (and not allowed)');
    const a3 = getUser(S.createSchoolAccount(boss, w.oak.id, { rosterName: 'Al Ash' }).user.id); S.addToClass(boss, w.A.id, a3.id);
    assert.equal((await open(a3)).status, 404, 'in the class but not joined');
    assert.equal((await open(w.a1, { origin: 'https://evil.example' })).status, 403);
    await withFlags({ manipulatives: false }, async () => assert.equal((await open(boss)).status, 404, 'the hidden gate'));
    // Allowed: the teacher and the joined students. A cursor reaches the others within a tick or two.
    auditBefore = q.get('SELECT COUNT(*) n FROM audit_log').n;
    const T = await open(boss), A = await open(w.a1), B = await open(w.a2);
    assert.ok(T.ok && A.ok && B.ok);
    A.ws.send(JSON.stringify({ t: 'c', x: 120, y: 340 }));
    T.ws.send(JSON.stringify({ t: 'c', x: 900, y: 40, touch: true }));
    await new Promise(r => setTimeout(r, 350));
    const last = B.got.filter(m => m.t === 'cur').pop();
    assert.ok(last, 'a cursor batch arrived');
    assert.deepEqual(last.list.map(c => c.k).sort(), [w.a1.id, 't'].sort());
    assert.deepEqual(last.list.find(c => c.k === w.a1.id), { k: w.a1.id, x: 120, y: 340, touch: false });
    // Bring everyone to me: one message to everyone.
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/bring`, { method: 'POST', body: { view: { x: 10, y: 20, w: 900, h: 500 } } })).status, 200);
    assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/bring`, { method: 'POST', body: { view: {} } })).status, 404, 'students can\'t');
    await new Promise(r => setTimeout(r, 50));
    assert.deepEqual(A.got.find(m => m.t === 'bring'), { t: 'bring', seq: 1, view: { x: 10, y: 20, w: 900, h: 500 } });
    // Nothing of the cursors is in the database, the audit log or the room's saved state.
    const dbAfter = JSON.stringify(q.all('SELECT * FROM manip_work WHERE session_id=?', s.id)) + JSON.stringify(q.get('SELECT * FROM manip_sessions WHERE id=?', s.id));
    assert.equal(dbAfter, dbBefore);
    const newAudit = q.all('SELECT action, details FROM audit_log ORDER BY rowid DESC LIMIT ?', q.get('SELECT COUNT(*) n FROM audit_log').n - auditBefore);
    assert.deepEqual(newAudit.filter(r => /manip|cursor|bring/.test(r.action) || /"x"|120|340/.test(r.details)), [], JSON.stringify(newAudit));
    for (const { name } of q.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'manip%'")) assert.doesNotMatch(JSON.stringify(q.all(`SELECT * FROM ${name}`)), /"x":120,"y":340|"x":900,"y":40/);
    // A closed socket's cursor goes at once; the end tells everyone and forgets the room.
    A.ws.close(); await new Promise(r => setTimeout(r, 100));
    assert.ok(!LIVE.cursorsOf(s.id).some(c => c.k === w.a1.id));
    M.end(boss, s.id); await new Promise(r => setTimeout(r, 100));
    assert.ok(B.got.some(m => m.t === 'end')); assert.equal(LIVE._rooms.has(s.id), false);
    assert.equal((await open(w.a2)).status, 404, 'no socket to an ended session');
    T.ws.close(); B.ws.close();
  } finally { for (const ws of opened) ws.terminate(); server.off('upgrade', listener); }
});

test('cursors without a socket, and idle cursors, stay in memory only and expire', async () => {
  const LIVE = await import('../../server/services/manip-live.js');
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'money' }).session; M.join(w.a1, { code: s.code });
  assert.equal((await as(w.b1)(`/api/manipulatives/live/${s.id}/cursor`, { method: 'POST', body: { x: 1, y: 2 } })).status, 404);
  assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/cursor`, { method: 'POST', body: { x: 1, y: 2 } })).status, 200);
  assert.deepEqual((await as(boss)(`/api/manipulatives/live/${s.id}/room`)).json.room.cursors, [{ k: w.a1.id, x: 1, y: 2, touch: false }]);
  LIVE._rooms.get(s.id).cursors.get(w.a1.id).at -= LIVE.IDLE_MS + 1;
  assert.deepEqual(LIVE.cursorsOf(s.id), [], 'gone after 10 s idle');
});

test('the Instructions strip: the teacher\'s area notes reach every square for every viewer, live; students can\'t change it; work starts under it', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const sq = roomLayout('base-ten-blocks').sq;
  const teacherNotes = texts => ({ pieces: [], __ann: { notes: texts.map((text, i) => ({ id: `t${i}`, text, x: 0.1, y: i / 10 })), strokes: [] } });
  assert.equal(stripHeight(instructionNotes([]), sq), 0, 'no notes, no strip');
  assert.equal(M.saveArea(boss, s.id, 't', teacherNotes(['Build 232 two ways.'])).ok, true);
  for (const who of [boss, w.a1, w.a2]) {
    const room = M.roomFor(who, s.id);
    assert.deepEqual(instructionNotes(JSON.parse(room.teacher.state).__ann.notes), ['Build 232 two ways.'], who.username);
  }
  const one = stripHeight(['Build 232 two ways.'], sq);
  assert.ok(one > 0 && one < sq.h / 3);
  // The teacher edits: everyone reads the new text; a long set is capped at a third of the square (More shows the rest).
  const long = Array.from({ length: 6 }, (_, i) => `Step ${i + 1}: ${'build it again and explain what stays the same '.repeat(2)}`);
  M.saveArea(boss, s.id, 't', teacherNotes(long));
  assert.equal(instructionNotes(JSON.parse(M.roomFor(w.a2, s.id).teacher.state).__ann.notes).length, 6);
  const capped = stripHeight(long, sq);
  assert.ok(capped <= sq.h / 3 && capped > sq.h / 3 - STRIP.line, 'about a third of the square');
  assert.equal((capped - STRIP.head - STRIP.pad) % STRIP.line, 0, 'whole lines only, never a line cut in half');
  // Students can't change it.
  assert.equal(M.saveArea(w.a1, s.id, 't', teacherNotes(['mine now'])).code, 'notFound');
  assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/area/t`, { method: 'POST', body: { state: teacherNotes(['x']) } })).status, 404);
  // A student's work space is the square under the strip: a piece dragged down is kept inside it.
  M.saveArea(w.a1, s.id, w.a1.id, { pieces: [{ id: 'p', kind: 'rod', x: 0, y: 9999, w: 30, h: 150, label: '10', value: 10 }] });
  const p = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state).pieces[0];
  assert.equal(p.y, sq.h - capped - 150, 'the bottom of the work space under the strip');
  // Teacher notes inside a student's own square stay in that square only; a student's own notes stay private.
  M.saveArea(boss, s.id, w.a1.id, { pieces: [], __ann: { notes: [{ id: 'only', text: 'Just for Ada', x: 0.2, y: 0.2 }], strokes: [] } });
  assert.doesNotMatch(M.roomFor(w.a2, s.id).teacher.state, /Just for Ada/);
});

test('raised hands: the teacher\'s to see; a student raises only their own; the teacher lowers any or all; classmates can\'t; rate limited; memory only', async () => {
  const LIVE = await import('../../server/services/manip-live.js');
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'money' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const before = JSON.stringify(q.all('SELECT * FROM manip_work WHERE session_id=?', s.id)) + JSON.stringify(q.get('SELECT * FROM manip_sessions WHERE id=?', s.id));
  const hand = (who, body) => as(who)(`/api/manipulatives/live/${s.id}/hand`, { method: 'POST', body });
  assert.equal((await hand(w.a1, { up: true })).status, 200);
  assert.equal((await hand(w.a2, { up: true })).status, 200);
  assert.deepEqual(LIVE.handsOf(s.id).map(h => h.k), [w.a1.id, w.a2.id], 'in the order raised');
  assert.deepEqual(M.roomFor(w.a2, s.id).hands.map(h => h.k), [w.a2.id], 'a student knows only their own hand');
  assert.deepEqual(M.roomFor(boss, s.id).hands.map(h => h.k), [w.a1.id, w.a2.id], 'the teacher sees every hand');
  assert.equal((await hand(w.a2, { up: false, key: w.a1.id })).status, 404, 'a classmate can\'t lower another\'s hand');
  assert.equal((await hand(w.b1, { up: true })).status, 404, 'outside the class');
  assert.equal((await hand(boss, { up: true })).status, 404, 'the teacher has no hand to raise');
  assert.equal((await hand(boss, { up: false, key: w.a1.id })).status, 200);
  assert.deepEqual(LIVE.handsOf(s.id).map(h => h.k), [w.a2.id]);
  assert.equal((await hand(boss, { up: false, key: 'all' })).status, 200);
  assert.deepEqual(LIVE.handsOf(s.id), []);
  // A hand can't be waved up and down all lesson: a few changes a minute.
  let last; for (let i = 0; i < M.HAND_LIMIT + 2; i++) last = await hand(w.a2, { up: i % 2 === 0 });
  assert.equal(last.status, 429);
  // Cleared when the student's last socket closes, and when the session ends; never stored.
  LIVE.connected(s.id, w.a1.id, 1); M.handFor(s.id, w.a1.id, true);
  assert.ok(LIVE.handsOf(s.id).some(h => h.k === w.a1.id));
  LIVE.connected(s.id, w.a1.id, -1);
  assert.ok(!LIVE.handsOf(s.id).some(h => h.k === w.a1.id), 'gone when they leave');
  LIVE.setHand(s.id, w.a2.id, true);
  const after = JSON.stringify(q.all('SELECT * FROM manip_work WHERE session_id=?', s.id)) + JSON.stringify(q.get('SELECT * FROM manip_sessions WHERE id=?', s.id));
  assert.equal(after, before, 'nothing written to the database');
  M.end(boss, s.id);
  assert.deepEqual(LIVE.handsOf(s.id), [], 'gone when the session ends');
});

test('hidden work: by default a student gets nothing of a classmate\'s square but its frame, name and hand; the teacher gets everything', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const raw = [];
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/manipulatives/ws?s=${s.id}`, { headers: { cookie: cookieFor(w.a2.id), origin: base } });
  ws.on('message', d => raw.push(String(d)));
  await new Promise(r => ws.on('open', r));
  try {
    const ada = { decimal: false, pieces: [{ id: 'p1', kind: 'rod', x: 10, y: 10, w: 30, h: 150, label: '10', value: 10 }], __ann: { notes: [{ id: 'n', text: 'Ada answer 32', x: 0.5, y: 0.5 }], strokes: [{ c: '#141414', pts: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }] }] } };
    assert.equal(M.saveArea(w.a1, s.id, w.a1.id, ada).ok, true);
    await new Promise(r => setTimeout(r, 150));
    // The HTTP read (also the socket-less fallback): Ada's square is a frame, a name and nothing else.
    const r1 = await as(w.a2)(`/api/manipulatives/live/${s.id}/room`);
    assert.equal(r1.json.room.showWork, false, 'hidden by default');
    const sq = r1.json.room.areas.find(a => a.key === w.a1.id);
    assert.deepEqual({ state: sq.state, hidden: sq.hidden, updatedAt: sq.updatedAt, name: sq.name }, { state: '{}', hidden: true, updatedAt: 0, name: w.a1.display_name });
    assert.doesNotMatch(r1.text, /kind\W{0,6}rod|Ada answer|pts|#141414|blank/, 'no pieces, marks, notes or note shapes');
    // The socket never carries work at all, hidden or not.
    assert.ok(raw.length && raw.every(m => !/pieces|kind\W{0,6}rod|Ada answer|pts/.test(m)), raw.join('\n'));
    // The teacher gets everything.
    const tr = await as(boss)(`/api/manipulatives/live/${s.id}/room`);
    assert.match(tr.text, /kind\W{0,6}rod/); assert.match(tr.text, /Ada answer 32/);
    // Only the teacher toggles.
    assert.equal((await as(w.a2)(`/api/manipulatives/live/${s.id}/show`, { method: 'POST', body: { show: true } })).status, 404);
    assert.equal(M.showWork(w.a1, s.id, true).code, 'notFound');
    // Shown: the pieces arrive (live: the socket says to read again); note text stays private.
    const n0 = raw.length;
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/show`, { method: 'POST', body: { show: true } })).status, 200);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(raw.slice(n0).some(m => JSON.parse(m).t === 'dirty'), 'students told at once');
    const r2 = await as(w.a2)(`/api/manipulatives/live/${s.id}/room`);
    assert.match(r2.text, /kind\W{0,6}rod/); assert.doesNotMatch(r2.text, /Ada answer/);
    // Hidden again: gone from the next read.
    M.showWork(boss, s.id, false);
    assert.doesNotMatch((await as(w.a2)(`/api/manipulatives/live/${s.id}/room`)).text, /kind\W{0,6}rod|pts/);
  } finally { ws.terminate(); server.off('upgrade', listener); }
});

test('the deck of steps: saved with the board, through share codes, push and sessions; only the teacher moves it unless students go at their own pace', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const deck = { pieces: [], __steps: [{ id: 'a', text: 'First: build 23' }, { id: 'b', text: 'Second: trade a ten' }, { id: 'c', text: 'Third secret: build 1,000' }] };
  // Saved with the board; a share code opens it with its steps.
  const b = M.saveBoard(boss, { tool: 'base-ten-blocks', title: 'Three steps', state: deck }).board;
  assert.deepEqual(JSON.parse(M.openCode(boss, b.code).board.state).__steps.map(x => x.text), deck.__steps.map(x => x.text));
  assert.equal(M.saveBoard(boss, { tool: 'clock', state: { __steps: [{ id: 'x', text: 'shit' }] } }).code, 'words', 'steps go through the word rules');
  // A session started from it: the deck is the teacher's.
  const s = M.createSession(boss, { classId: w.A.id, boardId: b.id }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const raw = [];
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/manipulatives/ws?s=${s.id}`, { headers: { cookie: cookieFor(w.a1.id), origin: base } });
  ws.on('message', d => raw.push(String(d)));
  await new Promise(r => ws.on('open', r));
  const room = who => as(who)(`/api/manipulatives/live/${s.id}/room`);
  const step = (who, body) => as(who)(`/api/manipulatives/live/${s.id}/step`, { method: 'POST', body });
  try {
    let tr = (await room(boss)).json.room;
    assert.equal(tr.deck.total, 3); assert.equal(tr.deck.list.length, 3);
    // A student: the current step only, never a later one (not even in the teacher's area state).
    let sr = await room(w.a1);
    assert.deepEqual(sr.json.room.deck, { total: 3, cur: 0, pace: false, list: [{ id: 'a', text: 'First: build 23' }] });
    assert.doesNotMatch(sr.text, /Second|Third secret/);
    // Students can't move it.
    assert.equal((await step(w.a1, { dir: 1 })).status, 404);
    assert.equal((await step(boss, { dir: 1 })).status, 200);
    sr = await room(w.a1);
    assert.equal(sr.json.room.deck.cur, 1); assert.match(sr.text, /Second/); assert.doesNotMatch(sr.text, /Third secret/);
    // Their own pace: the teacher only; then each student moves their own step, never past the last.
    assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/pace`, { method: 'POST', body: { on: true } })).status, 404);
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/pace`, { method: 'POST', body: { on: true } })).status, 200);
    for (let i = 0; i < 5; i++) await step(w.a1, { dir: 1 });
    assert.equal((await room(w.a1)).json.room.deck.cur, 2, 'stops at the last step');
    assert.equal((await room(w.a2)).json.room.deck.cur, 1, 'others stay where they are');
    assert.doesNotMatch((await room(w.a2)).text, /Third secret/);
    tr = (await room(boss)).json.room;
    assert.deepEqual([tr.deck.mine[w.a1.id], tr.deck.mine[w.a2.id]], [2, 1], 'the teacher sees each student\'s step');
    // Off: everyone snaps back to the teacher's step.
    await as(boss)(`/api/manipulatives/live/${s.id}/pace`, { method: 'POST', body: { on: false } });
    assert.equal((await room(w.a1)).json.room.deck.cur, 1);
    assert.equal((await step(w.a1, { dir: 1 })).status, 404);
    // The socket only ever says "a step changed": never a step's text.
    await new Promise(r => setTimeout(r, 100));
    assert.ok(raw.some(m => JSON.parse(m).t === 'step'));
    assert.ok(raw.every(m => !/First|Second|Third/.test(m)), raw.join('\n'));
    // Push carries a board's steps into the deck (from its first step); students get the board without them.
    const b2 = M.saveBoard(boss, { tool: 'base-ten-blocks', state: { pieces: [], __steps: [{ id: 'p', text: 'Pushed one' }, { id: 'q', text: 'Pushed two' }] } }).board;
    assert.equal(M.push(boss, s.id, b2.id).ok, true);
    sr = (await room(w.a1)).json.room;
    assert.deepEqual([sr.deck.total, sr.deck.cur, sr.deck.list.map(x => x.text)], [2, 0, ['Pushed one']]);
    assert.doesNotMatch(sr.pushed, /Pushed two|__steps/);
  } finally { ws.terminate(); server.off('upgrade', listener); }
});

test('raised hands never reach classmates\' sockets: a student\'s socket carries their own hand only', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'money' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  const open = who => new Promise(r => { const ws = new WebSocket(`${base.replace('http', 'ws')}/api/manipulatives/ws?s=${s.id}`, { headers: { cookie: cookieFor(who.id), origin: base } }); const got = []; ws.on('message', d => got.push(String(d))); ws.on('open', () => r({ ws, got })); });
  const T = await open(boss), B = await open(w.a2);
  try {
    assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/hand`, { method: 'POST', body: { up: true } })).status, 200);
    B.ws.send(JSON.stringify({ t: 'h', up: true }));
    await new Promise(r => setTimeout(r, 200));
    const hb = B.got.map(m => JSON.parse(m)).filter(m => m.t === 'hands' || m.t === 'hi');
    assert.ok(hb.length && B.got.every(m => !m.includes(w.a1.id)), B.got.join('\n'));
    assert.deepEqual(hb.at(-1).list.map(h => h.k), [w.a2.id], 'their own hand only');
    const ht = T.got.map(m => JSON.parse(m)).filter(m => m.t === 'hands').at(-1);
    assert.deepEqual(ht.list.map(h => h.k), [w.a1.id, w.a2.id], 'the teacher gets every hand');
    assert.doesNotMatch((await as(w.a2)(`/api/manipulatives/live/${s.id}/room`)).text, new RegExp(w.a1.id + '"?,"at'), 'nor the plain room request');
  } finally { T.ws.terminate(); B.ws.terminate(); server.off('upgrade', listener); }
});

test('text on the board (T): cleaned and checked, saved with the board; a student\'s text reaches only them and the teacher', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const withText = (texts, extra = {}) => ({ pieces: [], ...extra, __ann: { notes: [], strokes: [], texts } });
  // Cleaned: at most 30, 200 characters, places inside the board, empty ones dropped; the word rules apply.
  const c = JSON.parse(M.cleanState(withText([{ id: 'a', text: 'Tens', x: 4, y: -1 }, { id: 'b', text: '   ' }, ...Array.from({ length: 40 }, (_, i) => ({ id: `k${i}`, text: 'x'.repeat(300), x: 0.5, y: 0.5 }))])).state).__ann.texts;
  assert.equal(c.length, 30); assert.deepEqual([c[0].x, c[0].y], [1, 0]); assert.equal(c[1].text.length, 200);
  assert.equal(M.cleanState(withText([{ id: 'a', text: 'you shit', x: 0, y: 0 }])).code, 'words');
  assert.equal(M.cleanState(withText([{ id: 'a', text: 'text me 555 123 4567', x: 0, y: 0 }])).code, 'personal');
  // Saved with the board: share code and push carry it; the PDF summary lists it.
  const b = M.saveBoard(boss, { tool: 'base-ten-blocks', state: withText([{ id: 'l', text: 'Hundreds go here', x: 0.1, y: 0.1 }]) }).board;
  assert.match(M.openCode(boss, b.code).board.state, /Hundreds go here/);
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  assert.equal(M.push(boss, s.id, b.id).ok, true);
  assert.match(M.roomFor(w.a1, s.id).pushed, /Hundreds go here/);
  // A student's text: their own square only (another square is the same 404), and nobody else gets it, not even its place.
  assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/area/${w.a2.id}`, { method: 'POST', body: { state: withText([{ id: 'z', text: 'in your square', x: 0.5, y: 0.5 }]) } })).status, 404);
  assert.equal(M.saveArea(w.a1, s.id, w.a1.id, withText([{ id: 'm', text: 'Ada answer is 32', x: 0.3, y: 0.3 }])).ok, true);
  assert.match(M.roomFor(w.a1, s.id).areas.find(a => a.key === w.a1.id).state, /Ada answer is 32/);
  assert.match(M.roomFor(boss, s.id).areas.find(a => a.key === w.a1.id).state, /Ada answer is 32/);
  const raw = [];
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/manipulatives/ws?s=${s.id}`, { headers: { cookie: cookieFor(w.a2.id), origin: base } });
  ws.on('message', d => raw.push(String(d)));
  await new Promise(r => ws.on('open', r));
  try {
    for (const show of [false, true]) {
      M.showWork(boss, s.id, show);
      const r = await as(w.a2)(`/api/manipulatives/live/${s.id}/room`);
      assert.doesNotMatch(r.text, /Ada answer/, `work ${show ? 'shown' : 'hidden'}: no text`);
      const st = JSON.parse(r.json.room.areas.find(a => a.key === w.a1.id).state);
      assert.deepEqual((st.__ann || {}).texts || [], [], 'not even its place');
    }
    // The teacher's text, in a square or in their area: everyone reads it; it is not a step.
    M.saveArea(boss, s.id, w.a1.id, withText([{ id: 'm', text: 'Ada answer is 32', x: 0.3, y: 0.3 }, { id: 'tt', text: 'Nice regrouping', x: 0.6, y: 0.1 }]));
    M.saveArea(boss, s.id, 't', withText([{ id: 'big', text: 'Ones on the right', x: 0.1, y: 0.1 }]));
    const r2 = await as(w.a2)(`/api/manipulatives/live/${s.id}/room`);
    assert.match(r2.text, /Nice regrouping/); assert.match(r2.text, /Ones on the right/); assert.doesNotMatch(r2.text, /Ada answer/);
    assert.equal(r2.json.room.deck.total, 0, 'board text never becomes a step');
    // Ada can't change or remove the teacher's text in her square.
    M.saveArea(w.a1, s.id, w.a1.id, withText([{ id: 'tt', text: 'changed', x: 0, y: 0, by: 't' }]));
    assert.match(M.roomFor(w.a2, s.id).areas.find(a => a.key === w.a1.id).state, /Nice regrouping/);
    assert.ok(raw.every(m => !/Ada answer|Nice regrouping|Ones on the right/.test(m)), 'the socket never carries text');
    assert.match(M.summarize(JSON.stringify(withText([{ id: 'q', text: 'Label me', x: 0, y: 0 }]))).join('\n'), /Text: Label me/, 'the PDF summary lists it');
  } finally { ws.terminate(); server.off('upgrade', listener); }
});

test('"Check my answers": only when the teacher allows it; answers in, right / not yet out, never the answers (HTTP and socket); 5 a minute; results to the teacher only', async () => {
  const { WebSocket } = await import('ws');
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  const SOCK = await import('../../server/services/manip-socket.js');
  const { buildPractice } = await import('../../public/js/manip-practice.js');
  const listener = attachUpgrades(server, [SOCK.route]);
  const w = world();
  const times = ['3:00', '7:30', '9:15', '11:45', '12:10', '6:05', '1:55', '4:40'];
  const r = buildPractice('clock', { title: 'Clocks', steps: ['Write the time under each clock.'], items: times.map(time => ({ time, box: 'answer' })) });
  const saved = M.saveBoard(boss, { tool: 'clock', title: 'Clocks', state: r.board });
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session;
  M.join(w.a1, { id: s.id }); M.join(w.a2, { id: s.id });
  assert.ok(M.push(boss, s.id, saved.board.id).ok);
  const boxes = r.board.objects.filter(o => o.k === 'answer');
  // Ada: 6 right in other forms, one wrong, one blank.
  const typed = ['3 o\'clock', 'half past 7', '9.15', 'quarter to 12', '12:10', '6:05', '2:00', ''];
  const answers = Object.fromEntries(boxes.map((o, i) => [o.id, typed[i]]));
  const check = (who, body = { answers }) => as(who)(`/api/manipulatives/live/${s.id}/check`, { method: 'POST', body });
  const open = who => new Promise(res => { const ws = new WebSocket(`${base.replace('http', 'ws')}/api/manipulatives/ws?s=${s.id}`, { headers: { cookie: cookieFor(who.id), origin: base } }); const got = []; ws.on('message', d => got.push(String(d))); ws.on('open', () => res({ ws, got })); });
  const A = await open(w.a1), B = await open(w.a2), T = await open(boss);
  try {
    assert.equal((await check(w.a1)).status, 404, 'off by default (the teacher\'s switch)');
    const room = JSON.parse(q.get('SELECT room FROM manip_sessions WHERE id=?', s.id).room);
    assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/area/t`, { method: 'POST', body: { state: { ...room, checks: true } } })).status, 200);
    assert.equal(JSON.parse(q.get('SELECT room FROM manip_sessions WHERE id=?', s.id).room).checks, true);
    const res = await check(w.a1);
    assert.equal(res.status, 200);
    assert.equal(res.json.right, 6); assert.equal(res.json.total, 8);
    assert.deepEqual(Object.values(res.json.results), [true, true, true, true, true, true, false, false]);
    assert.deepEqual(Object.keys(res.json).sort(), ['ok', 'results', 'right', 'total'], 'right / not yet only');
    // The right answers never reach a student: not the reply, not the room, not a socket (theirs or a classmate's).
    for (const t of ['1:55', '4:40', '9:15', '11:45', '"key"']) assert.ok(!res.text.includes(t), `reply: ${t}`);
    await new Promise(x => setTimeout(x, 200));
    for (const who of [w.a1, w.a2]) { const txt = (await as(who)(`/api/manipulatives/live/${s.id}/room`)).text; assert.doesNotMatch(txt, /\\"key\\"|"checks"/, 'no answers, no results'); assert.ok(!txt.includes('4:40')); }
    for (const sock of [A, B]) for (const m of sock.got) { assert.ok(!/key|4:40|1:55|"right"|"checks"/.test(m), m); }
    // The teacher: each student's last result, on the room and nowhere else.
    const tr = (await as(boss)(`/api/manipulatives/live/${s.id}/room`)).json.room;
    assert.deepEqual(tr.checks[w.a1.id] && [tr.checks[w.a1.id].right, tr.checks[w.a1.id].total], [6, 8]);
    assert.ok(T.got.some(m => /"dirty"/.test(m)), 'the teacher is told to read the room again');
    // 5 checks a minute: not a guessing machine.
    for (let i = 0; i < 4; i++) assert.equal((await check(w.a1)).status, 200);
    const slow = await check(w.a1); assert.equal(slow.status, 429); assert.equal(slow.json.code, 'checkSlow');
    // Only students check; the teacher (or a stranger) gets the normal 404. Results are memory only.
    assert.equal((await check(boss)).status, 404); assert.equal((await check(w.b1)).status, 404);
    assert.doesNotMatch(JSON.stringify(q.all('SELECT * FROM manip_work WHERE session_id=?', s.id)), /"right"|checks/);
  } finally { A.ws.terminate(); B.ws.terminate(); T.ws.terminate(); server.off('upgrade', listener); }
});

test('locks: an object\'s lock is stored like its other state; in the room the teacher\'s lock in a square is the teacher\'s, the student\'s own is theirs', async () => {
  // Saved boards and share codes keep a locked object and a locked piece; a lock is true or nothing.
  const st = { v: 2, objects: [{ id: 'F', k: 'ten-frame', x: 10, y: 10, s: 1, st: { n: 10 }, locked: true }, { id: 'G', k: 'five-frame', x: 400, y: 10, s: 1, st: { n: 5 }, locked: 'yes', lockBy: 't' }],
    pieces: [{ id: 'p', kind: 'pos', x: 20, y: 60, w: 48, h: 48, locked: true, lockBy: 'x' }, { id: 'q', kind: 'neg', x: 90, y: 60, w: 48, h: 48, locked: false, lockBy: 't' }] };
  const c = JSON.parse(M.cleanState(st, null, 'two-color-counters').state);
  assert.deepEqual(c.objects.map(o => [o.id, o.locked, o.lockBy]), [['F', true, undefined], ['G', undefined, undefined]]);
  assert.deepEqual(c.pieces.map(p => [p.id, p.locked, p.lockBy]), [['p', true, undefined], ['q', undefined, undefined]]);
  const saved = await as(boss)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'two-color-counters', state: st } });
  assert.equal(saved.status, 200);
  const opened = JSON.parse((await as(boss)(`/api/manipulatives/code/${saved.json.board.code}`)).json.board.state);
  assert.equal(opened.objects[0].locked, true, 'through a share code');
  // The live room.
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'two-color-counters' }).session;
  M.join(w.a1, { code: s.code });
  const area = () => JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state);
  const frameAt = (x, extra = {}) => ({ id: 'TF', k: 'ten-frame', x, y: 10, s: 1, st: { n: 10 }, ...extra });
  const ctr = (id, x, extra = {}) => ({ id, kind: 'pos', x, y: 200, w: 48, h: 48, label: '+1', value: 1, ...extra });
  // The teacher locks a frame and a counter in Ada's square (the page sends no author: the server decides).
  assert.ok(M.saveArea(boss, s.id, w.a1.id, { v: 2, objects: [frameAt(10, { locked: true })], pieces: [ctr('tc', 10, { locked: true }), ctr('mine', 100)] }).ok);
  assert.deepEqual([area().objects[0].lockBy, area().pieces[0].lockBy], ['t', 't']);
  // Ada tries to unlock, move, flip and delete them, and to forge a teacher's lock on her own counter: none of it sticks,
  // but the frame's own state is hers (counters still go in a locked frame).
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [frameAt(200, { st: { n: 10, mark: 1 } })], pieces: [ctr('mine', 100, { locked: true, lockBy: 't' })] }).ok);
  const a = area();
  assert.deepEqual([a.objects[0].x, a.objects[0].locked, a.objects[0].lockBy, a.objects[0].st.mark], [10, true, 't', 1]);
  const tc = a.pieces.find(p => p.id === 'tc'); assert.deepEqual([tc.x, tc.locked, tc.lockBy, tc.kind], [10, true, 't', 'pos'], 'the teacher\'s counter is back as it was');
  const mine = a.pieces.find(p => p.id === 'mine'); assert.deepEqual([mine.locked, mine.lockBy], [true, undefined], 'her own lock, no author');
  // Her own lock she may undo; the teacher may unlock anything.
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: area().objects, pieces: area().pieces.map(p => (p.id === 'mine' ? { ...p, locked: false } : p)) }).ok);
  assert.equal(area().pieces.find(p => p.id === 'mine').locked, undefined);
  assert.ok(M.saveArea(boss, s.id, w.a1.id, { v: 2, objects: [frameAt(10)], pieces: area().pieces.map(p => ({ ...p, locked: false })) }).ok);
  assert.ok(area().pieces.every(p => !p.locked && !p.lockBy) && !area().objects[0].locked);
  // A student's own lock stays hers when the teacher saves her square (the teacher's save keeps it unauthored).
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [frameAt(10, { locked: true })], pieces: [] }).ok);
  assert.ok(M.saveArea(boss, s.id, w.a1.id, { v: 2, objects: area().objects, pieces: [] }).ok);
  assert.deepEqual([area().objects[0].locked, area().objects[0].lockBy], [true, undefined]);
  // Classmates (while work is shown) see the lock: it travels with the square's state.
  M.showWork(boss, s.id, true);
  assert.match(M.roomFor(w.a1, s.id).areas.find(x => x.key === w.a1.id).state, /"locked":true/);
  M.end(boss, s.id);
});

test('answer boxes, text boxes and grids are stored within their limits; a resized box or bigger text reaches the room, a student\'s text never a classmate', async () => {
  const w = world();
  const clean = (tool, state) => JSON.parse(M.cleanState({ v: 2, ...state }, null, tool).state);
  // An answer box: its typed answer (one line, at most 100 characters) and its own size, bounded; no scale games.
  const long = 'I added 23 and 19 to get 42, then I checked it by counting back. '.repeat(3);
  const a = clean('clock', { objects: [{ id: 'A', k: 'answer', x: 10, y: 10, s: 1, st: { ans: `${long}\nmore`, size: 'M', w: 99999, h: -5 } }] }).objects[0];
  assert.equal(a.st.ans.length, 100); assert.doesNotMatch(a.st.ans, /\n/);
  assert.deepEqual([a.st.w, a.st.h], [900, 58]);
  assert.equal('w' in clean('clock', { objects: [{ id: 'A', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '', w: 'wide' } }] }).objects[0].st, false, 'nonsense: dropped');
  // Board text: its size (S, M, L, XL) and box, bounded; anything else dropped.
  const tx = clean('clock', { __ann: { notes: [], strokes: [], texts: [{ id: 't1', text: 'Big', x: 0.1, y: 0.1, fs: 'XL', w: 5000, h: 3 }, { id: 't2', text: 'Small', x: 0.2, y: 0.2, fs: '<script>', w: 300 }] } }).__ann.texts;
  assert.deepEqual([tx[0].fs, tx[0].w, tx[0].h], ['XL', 1200, 24]);
  assert.deepEqual([tx[1].fs, tx[1].w, tx[1].h], [undefined, undefined, undefined]);
  // A grid: its switches true or false, at most 60 points, whole numbers on the grid, colors only.
  const g = clean('xy-coordinate-board', { objects: [{ id: 'G', k: 'xy-coordinate-board', x: 10, y: 10, s: 1, st: { four: 1, arrows: 'yes', table: 0, connect: true, color: 'red',
    pts: [...Array.from({ length: 70 }, (_, i) => ({ x: (i % 21) - 10, y: 2, color: '#1E88E5' })), { x: 99.6, y: -40, color: 'javascript:' }] } }] }).objects[0].st;
  assert.equal(g.pts.length, 60); assert.deepEqual([g.four, g.arrows, g.table, g.color], [true, true, false, '#E53935']);
  const odd = clean('xy-coordinate-board', { objects: [{ id: 'G', k: 'xy-coordinate-board', x: 10, y: 10, s: 1, st: { pts: [{ x: 99.6, y: -40.2, color: 'javascript:' }] } }] }).objects[0].st.pts[0];
  assert.deepEqual(odd, { x: 12, y: -10, color: '#E53935' });
  // The live room: a student's resized answer box and big text are saved; a classmate sees the box, never the text.
  const s = M.createSession(boss, { classId: w.A.id, tool: 'clock' }).session;
  M.join(w.a1, { id: s.id }); M.join(w.a2, { id: s.id });
  assert.ok(M.saveArea(w.a1, s.id, w.a1.id, { v: 2, objects: [{ id: 'A', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '42', size: 'M', w: 400, h: 120 } }], __ann: { notes: [], strokes: [], texts: [{ id: 'x1', text: 'My plan', x: 0.3, y: 0.5, fs: 'L', w: 260, h: 80 }] } }).ok);
  const mine = JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, w.a1.id).state);
  assert.deepEqual([mine.objects[0].st.w, mine.objects[0].st.h], [400, 120]);
  assert.deepEqual([mine.__ann.texts[0].fs, mine.__ann.texts[0].w, mine.__ann.texts[0].h], ['L', 260, 80]);
  const seen = JSON.parse(M.forClassmates(JSON.stringify(mine)));
  assert.equal(seen.__ann.texts.length, 0, 'a classmate never gets a student\'s text');
  assert.equal(seen.objects[0].st.w, 400, 'the box keeps its size');
  M.end(boss, s.id);
});
