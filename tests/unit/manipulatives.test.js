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
const { TOOLS, pieceDefs, hexValue, freeSpot, HEX_SIXTHS } = await import('../../public/js/manip-data.js');
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

test('migration 0092: there once, after 0091, its tables exist, a session takes its work with it', () => {
  const names = MIGRATIONS.map(m => m[0]);
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

test('students never see another student\'s work, and their work reaches only their teacher', async () => {
  const w = world();
  const s = M.createSession(boss, { classId: w.A.id, tool: 'base-ten-blocks' }).session;
  M.join(w.a1, { code: s.code }); M.join(w.a2, { code: s.code });
  assert.equal((await as(w.a1)(`/api/manipulatives/live/${s.id}/work`, { method: 'POST', body: { state: board({ __ann: { notes: [{ id: 'x', text: 'Ada secret plan 42', x: 0, y: 0 }], strokes: [] } }) } })).status, 200);
  const a2 = await as(w.a2)(`/api/manipulatives/live/${s.id}`);
  assert.doesNotMatch(a2.text, /secret plan|Ada|Apple/, 'nothing of Ada\'s reaches Abe');
  const a1 = await as(w.a1)(`/api/manipulatives/live/${s.id}`);
  assert.match(a1.json.session.mine, /secret plan/, 'Ada sees her own');
  const dash = await as(boss)(`/api/manipulatives/live/${s.id}`);
  const ada = dash.json.session.students.find(x => x.id === w.a1.id);
  assert.equal(ada.name, 'Ada Apple', 'the teacher sees the roster name the class page shows');
  assert.match(ada.state, /secret plan/);
  // Students can't save boards or make share codes.
  assert.equal((await as(w.a1)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'clock', state: {} } })).status, 404);
  assert.equal(M.saveBoard(w.a1, { tool: 'clock', state: {} }).ok, false);
  assert.equal((await as(w.a1)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'tell time' } })).status, 404);
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

test('the AI drafter: hosts only, through the site\'s AI client with the configured model; no names in, everything sanitized out', async () => {
  const w = world();
  const calls = [];
  M.hooks.create = async params => {
    calls.push(params);
    return { model: params.model, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({
      board_title: 'Build 346 '.repeat(20),
      pieces: [...Array.from({ length: 40 }, (_, i) => ({ kind: i % 2 ? 'rod' : 'flat', x: i / 10, y: -3 })), { kind: 'dragon', x: 0.5, y: 0.5 }],
      notes: [{ text: 'What stays the same?', x: 2, y: 0.5 }, { text: 'damn shit', x: 0.1, y: 0.1 }, { text: 'Visit www.example.com', x: 0, y: 0 }, { text: '   ', x: 0, y: 0 },
        ...Array.from({ length: 8 }, (_, i) => ({ text: `Question ${i}`, x: 0.1, y: 0.1 }))],
      strokes: [{ color: '#123456', points: [{ x: -1, y: 0.5 }, { x: 0.5, y: 4 }] }, { color: '#1e88e5', points: [{ x: 0.1, y: 0.1 }] }, ...Array.from({ length: 6 }, () => ({ color: '#141414', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }))],
    }) }] };
  };
  try {
    const r = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'base-ten-blocks', brief: 'Grade 2: build 346 and break a hundred', grade: '2', task: 'not a real task' } });
    assert.equal(r.status, 200); const d = r.json.draft;
    assert.equal(r.json.ai, true);
    assert.equal(calls[0].model, config.builderModel, 'the model comes from config');
    const prompt = calls[0].messages[0].content;
    assert.doesNotMatch(prompt, /miro/i); assert.doesNotMatch(prompt, /not a real task/, 'only library tasks are passed on');
    assert.match(prompt, /kind "rod"/); assert.doesNotMatch(prompt, /Ada|Apple|Abe|Bea/);
    assert.ok(d.board_title.length <= 120);
    assert.equal(d.pieces.length, 30); assert.ok(d.pieces.every(p => ['rod', 'flat'].includes(p.kind) && p.x >= 0 && p.x <= 1 && p.y === 0));
    assert.deepEqual(d.notes.map(n => n.text).slice(0, 2), ['What stays the same?', 'Question 0']);
    assert.equal(d.notes.length, 6); assert.equal(d.notes[0].x, 1);
    assert.equal(d.strokes.length, 3, 'at most 4 strokes, a one-point stroke dropped'); assert.equal(d.strokes[0].color, '#FF6B4A'); assert.deepEqual(d.strokes[0].points[0], { x: 0, y: 0.5 });
    // A student's name in the brief never reaches the AI.
    const n = calls.length;
    const named = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'A clock lesson for Ada and her friends' } });
    assert.equal(named.status, 400); assert.equal(named.json.code, 'names'); assert.equal(calls.length, n);
    assert.equal((await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'shit' } })).json.code, 'words');
    // A tool with no pieces: no pieces come back, whatever the model says.
    assert.equal((await M.draftLesson(boss, { tool: 'clock', brief: 'read the time to five minutes' })).draft.pieces.length, 0);
    assert.equal((await as(w.a1)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'tell time' } })).status, 404);
  } finally { M.hooks.create = null; }
  // No key (or the budget is resting): a plain starting board, no AI call.
  const plain = await M.draftLesson(boss, { tool: 'money', brief: 'make 75 cents two ways' });
  assert.equal(plain.ai, false); assert.equal(plain.draft.notes[0].text, 'make 75 cents two ways');
  assert.deepEqual(M.sanitizeDraft(null, pieceDefs('money')), { board_title: 'AI lesson draft', pieces: [], notes: [], strokes: [] });
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
  const files = ['public/js/manip.js', 'public/js/manip-data.js', 'public/js/manip-tasks.js', 'public/css/manipulatives.css', 'server/services/manipulatives.js', 'server/routes/manipulatives.js'];
  const text = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.doesNotMatch(text, /cuisenaire|miro\b|polypad|mathigon|didax|hand2mind/i);
  assert.doesNotMatch(text, /—/, 'no em dashes');
  assert.doesNotMatch(text, /\b(colour|labell|centre|customis|subitis|modell|grey\b|neighbour|favourite|organis|recognis)/i, 'US spelling');
  assert.doesNotMatch(text, /K-12|K-9/, 'grades K-8');
  assert.doesNotMatch(files.filter(f => !f.includes('tasks')).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n'), /\bprice|\/month|per month|subscribe|upgrade/i, 'no prices on these pages (money word problems in the tasks are math)');
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
