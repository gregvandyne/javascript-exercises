// Manipulatives saving and AI drafts (docs/decisions.md "Virtual math manipulatives: saving and AI drafts"): the AI
// draft as a server job (services/manip-drafts.js: queued, running, done, failed, interrupted, boot recovery, one at a
// time per teacher, names refused before anything is stored), autosave into recent boards, templates that only ever
// give copies, rename, duplicate and delete, the 30 newest and 60 days of recent boards, and a room reopened after
// recess with the same code and squares. The AI is the existing stand-in (services/manipulatives.js hooks.create).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-manip-save-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const D = await import('../../server/services/manip-drafts.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { M.hooks.create = null; server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null; try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json };
};
let n = 0;
/** A host (the platform admin) with a class of three students. */
function world() {
  const k = ++n;
  const boss = createUser({ username: `SaveBoss${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `Save Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `5A-${k}` }).class;
  const kid = name => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { boss, oak, A, kids: [kid('Ada Apple'), kid('Abe Acorn'), kid('Cleo Cedar')] };
}
const reply = (over = {}) => ({ title: 'Half hours', steps: ['Read each clock.', 'Write the time.'], items: [{ time: '3:30', box: 'answer' }, { time: '7:30', box: 'answer' }], ...over });
/** The stand-in AI: answers when release() is called (or at once with auto). */
function standIn({ auto = true, fail = false } = {}) {
  const calls = []; let release = null;
  const gate = auto ? Promise.resolve() : new Promise(r => { release = r; });
  M.hooks.create = async params => {
    calls.push(params); await gate;
    if (fail) throw new Error('overloaded');
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify(reply()) }] };
  };
  return { calls, release: () => release && release() };
}
const tick = () => new Promise(r => setTimeout(r, 20));

test('migration 0098: after 0094, its tables and columns; boards saved before it are templates', () => {
  const names = MIGRATIONS.map(m => m[0]);
  const i = names.indexOf('0098_manipulatives_saving');
  assert.ok(i > names.indexOf('0094_manipulatives_show_work'));
  assert.equal(names.filter(x => x.startsWith('0098')).length, 1);
  assert.ok(q.all('PRAGMA table_info(manip_boards)').some(c => c.name === 'kind'));
  assert.ok(q.all('PRAGMA table_info(manip_sessions)').some(c => c.name === 'opened_at'));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='manip_drafts_one_live'"));
  const { boss } = world();
  assert.equal(M.ownBoard(boss, M.saveBoard(boss, { tool: 'clock', title: 'Old kind', state: {} }).board.id).kind, 'template');
});

test('a draft job: queued, running through its steps, done as a recent board ("New"), seen once; one at a time per teacher', async () => {
  const { boss } = world();
  const ai = standIn({ auto: false });
  try {
    const r = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'Two clocks at half past', grade: '2' } });
    assert.equal(r.status, 200);
    const id = r.json.job.id;
    assert.ok(['queued', 'running'].includes(r.json.job.status)); assert.equal(r.json.job.brief, 'Two clocks at half past');
    assert.ok(r.json.eta.p75 > 0 && r.json.eta.src === 'default', 'first guesses until there are timed drafts');
    await tick();
    let row = D.get(id);
    assert.equal(row.status, 'running'); assert.equal(row.step, 1, 'the AI step'); assert.equal(row.attempt, 1);
    assert.equal(JSON.parse(row.steps).length, 2);
    // A refresh: the page asks again and gets the same job, still running.
    const again = await as(boss)('/api/manipulatives/draft');
    assert.equal(again.json.job.id, id); assert.equal(again.json.job.status, 'running');
    // One at a time: asking again gives back the one that runs; nothing new starts, the AI is not called twice.
    const second = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'money', brief: 'Make 75 cents' } });
    assert.equal(second.json.already, true); assert.equal(second.json.job.id, id);
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_drafts WHERE owner_id=?', boss.id).n, 1);
    assert.throws(() => q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, created_at) VALUES ('x', ?, 'clock', '{}', 'queued', 0)", boss.id), /UNIQUE/);
    ai.release(); await D.settled(id);
    row = D.get(id);
    assert.equal(row.status, 'done'); assert.equal(row.step, 3); assert.equal(JSON.parse(row.steps).length, 4);
    assert.equal(ai.calls.length, 1);
    const prompt = ai.calls[0].messages[0].content;
    assert.doesNotMatch(prompt, /Ada|Abe|Cleo|Apple|Acorn/, 'no student names');
    const b = M.ownBoard(boss, row.board_id);
    assert.equal(b.kind, 'recent'); assert.equal(b.opened_at, 0, 'not opened yet: "New"'); assert.equal(b.title, 'Half hours');
    assert.deepEqual(JSON.parse(b.state).__steps.map(s => s.text), ['Read each clock.', 'Write the time.']);
    assert.deepEqual(JSON.parse(row.result), { title: 'Half hours', n: 2, steps: 2, capped: false, ai: true });
    // Ended and not seen: the page gets it once (the notice), then it is seen.
    const cur = (await as(boss)('/api/manipulatives/draft')).json.job;
    assert.equal(cur.status, 'done'); assert.equal(cur.seen, false); assert.equal(cur.boardId, row.board_id);
    assert.equal((await as(boss)(`/api/manipulatives/draft/${id}/seen`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await as(boss)('/api/manipulatives/draft')).json.job, null);
    // The state the page starts from carries the draft and the estimate.
    const st = (await as(boss)('/api/manipulatives/state')).json;
    assert.ok('draft' in st && st.eta); assert.ok(st.recent.some(x => x.id === row.board_id));
    // Opening it: a recent board, theirs to go on with (no longer "New").
    const open = (await as(boss)(`/api/manipulatives/boards/${row.board_id}`)).json.board;
    assert.equal(open.fresh, false); assert.ok(M.ownBoard(boss, row.board_id).opened_at > 0);
    // Someone else's draft: not theirs to see.
    const other = world().boss;
    assert.equal((await as(other)(`/api/manipulatives/draft/${id}/seen`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await as(other)('/api/manipulatives/draft')).json.job, null);
  } finally { M.hooks.create = null; }
});

test('a draft that fails: failed with its reason, the words kept for Try again; names and bad words never stored or sent', async () => {
  const { boss, kids } = world();
  const ai = standIn({ fail: true });
  try {
    const r = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'Six clocks to the quarter hour', grade: '3' } });
    await D.settled(r.json.job.id);
    const job = (await as(boss)('/api/manipulatives/draft')).json.job;
    assert.equal(job.status, 'failed'); assert.equal(job.error, 'aiFailed'); assert.equal(job.brief, 'Six clocks to the quarter hour'); assert.equal(job.grade, '3');
    assert.equal(q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND kind='recent'", boss.id).n, 0);
    // A failed draft doesn't block the next one.
    const before = q.get('SELECT COUNT(*) n FROM manip_drafts').n, calls = ai.calls.length;
    const named = await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: `Clocks for ${kids[0].roster_name || 'Ada Apple'}` } });
    assert.equal(named.status, 400); assert.equal(named.json.code, 'names');
    assert.equal((await as(boss)('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'shit' } })).json.code, 'words');
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_drafts').n, before, 'nothing stored'); assert.equal(ai.calls.length, calls, 'nothing sent');
    // Students never draft.
    assert.equal((await as(kids[0])('/api/manipulatives/draft', { method: 'POST', body: { tool: 'clock', brief: 'tell time' } })).status, 404);
    assert.equal((await as(kids[0])('/api/manipulatives/draft')).status, 404);
  } finally { M.hooks.create = null; }
  // A student's name added to the class after the draft was asked for: the check before the AI stops it.
  const late = world();
  const id = D.start(late.boss, { tool: 'clock', brief: 'Clocks for Zed later' }).job.id;
  await D.settled(id);
  assert.equal(D.get(id).status, 'done', 'no AI key: the tool\'s usual board');
  q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, created_at) VALUES ('zed1', ?, 'clock', ?, 'interrupted', ?)", late.boss.id, JSON.stringify({ brief: 'Clocks for Zed Zebra' }), Date.now());
  const z = S.createSchoolAccount(late.boss, late.oak.id, { rosterName: 'Zed Zebra' }).user; S.addToClass(late.boss, late.A.id, z.id);
  D.recover(); await D.settled('zed1');
  assert.equal(D.get('zed1').status, 'failed'); assert.equal(D.get('zed1').error, 'names');
});

test('shutdown and boot: a running draft is handed off (interrupted), run again at boot if recent, else ended as failed', async () => {
  const { boss } = world();
  const ai = standIn({ auto: false });
  try {
    const id = D.start(boss, { tool: 'clock', brief: 'Three clocks please' }).job.id;
    await tick();
    assert.equal(D.get(id).status, 'running');
    assert.equal(D.handOff(), 1);
    assert.equal(D.get(id).status, 'interrupted');
    assert.equal((await as(boss)('/api/manipulatives/draft')).json.job.status, 'running', 'the page shows it as still going');
    // The old process stops: its promise ends without writing (the row is no longer running in its attempt).
    ai.release(); await D.settled(id); D._reset();
    assert.equal(D.get(id).status, 'interrupted');
    // The next boot runs it again (attempt 2) and it lands.
    standIn();
    assert.deepEqual(D.recover(), { resumed: 1, stopped: 0 });
    await D.settled(id);
    assert.equal(D.get(id).status, 'done'); assert.equal(D.get(id).attempt, 2);
    // Too old, or tried too often: failed ('restart'), and the page offers Try again.
    const old = world().boss;
    q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, attempt, created_at) VALUES ('old1', ?, 'clock', ?, 'running', 1, ?)", old.id, JSON.stringify({ brief: 'Old one' }), Date.now() - D.DRAFTS.RESUME_WITHIN_MS - 1000);
    const tired = world().boss;
    q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, attempt, created_at) VALUES ('tired1', ?, 'clock', ?, 'interrupted', 2, ?)", tired.id, JSON.stringify({ brief: 'Tired one' }), Date.now());
    assert.deepEqual(D.recover(), { resumed: 0, stopped: 2 });
    assert.equal(D.get('old1').status, 'failed'); assert.equal(D.get('old1').error, 'restart'); assert.equal(D.get('tired1').status, 'failed');
    // Finished rows go after KEEP_DAYS; the board stays.
    q.run('UPDATE manip_drafts SET ended_at=? WHERE id=?', Date.now() - (D.DRAFTS.KEEP_DAYS + 1) * 86400e3, id);
    const boardId = D.get(id).board_id;
    D.prune();
    assert.equal(D.get(id), null); assert.ok(M.ownBoard(boss, boardId));
  } finally { M.hooks.create = null; }
});

test('the estimate: first guesses ("About") until ten timed drafts, then their own times ("Usually")', () => {
  const { boss } = world();
  q.run("DELETE FROM manip_drafts WHERE status='done'");
  assert.equal(D.eta().src, 'default');
  const t = Date.now();
  for (let i = 0; i < 10; i++) q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, attempt, created_at, started_at, ended_at) VALUES (?, ?, 'clock', '{}', 'done', 1, ?, ?, ?)", `e${i}`, boss.id, t, t - (i + 1) * 10e3, t);
  const e = D.eta();
  assert.equal(e.src, 'data'); assert.equal(e.p50, 50e3); assert.equal(e.p75, 80e3);
});

test('autosave: a host\'s board saves into one recent board; never into a template; students and other hosts can\'t', async () => {
  const { boss, kids } = world();
  const st = n => ({ v: 2, objects: [{ id: 'c', k: 'clock', x: 100, y: 100, s: 1, st: { h: n, m: 0 } }] });
  const first = await as(boss)('/api/manipulatives/boards/autosave', { method: 'POST', body: { tool: 'clock', title: 'Clock', state: st(3) } });
  assert.equal(first.status, 200);
  const id = first.json.board.id;
  const again = await as(boss)('/api/manipulatives/boards/autosave', { method: 'POST', body: { id, tool: 'clock', state: st(4) } });
  assert.equal(again.json.board.id, id);
  assert.equal(JSON.parse(M.ownBoard(boss, id).state).objects[0].st.h, 4);
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND kind='recent'", boss.id).n, 1);
  assert.equal((await as(boss)('/api/manipulatives/boards/autosave', { method: 'POST', body: { id, tool: 'money', state: {} } })).json.code, 'otherTool');
  assert.equal((await as(boss)('/api/manipulatives/boards/autosave', { method: 'POST', body: { id, tool: 'clock', state: { weird: 'porn' } } })).json.code, 'words');
  // A template is never written by autosave: its id is not a recent board.
  const tpl = M.saveBoard(boss, { tool: 'clock', title: 'Start', state: st(9) }).board;
  assert.equal((await as(boss)('/api/manipulatives/boards/autosave', { method: 'POST', body: { id: tpl.id, tool: 'clock', state: st(1) } })).status, 404);
  assert.equal(JSON.parse(M.ownBoard(boss, tpl.id).state).objects[0].st.h, 9);
  // Not theirs: another host's board, a student.
  const other = world().boss;
  assert.equal((await as(other)('/api/manipulatives/boards/autosave', { method: 'POST', body: { id, tool: 'clock', state: st(5) } })).status, 404);
  assert.equal((await as(kids[0])('/api/manipulatives/boards/autosave', { method: 'POST', body: { tool: 'clock', state: st(5) } })).status, 404);
  assert.equal(JSON.parse(M.ownBoard(boss, id).state).objects[0].st.h, 4);
});

test('templates: opening one always gives a fresh copy; share codes open templates only; rename, duplicate, delete are the owner\'s', async () => {
  const { boss } = world();
  const tpl = (await as(boss)('/api/manipulatives/boards', { method: 'POST', body: { tool: 'clock', title: 'Half past', state: { v: 2, objects: [] } } })).json.board;
  assert.ok(tpl.code); assert.equal(tpl.title, 'Half past');
  const open = (await as(boss)(`/api/manipulatives/boards/${tpl.id}`)).json.board;
  assert.equal(open.kind, 'template'); assert.equal(open.fresh, true, 'a copy: the page saves it as a new recent board');
  const copy = M.autosave(boss, { tool: 'clock', title: open.title, state: { v: 2, objects: [{ id: 'c', k: 'clock', x: 1, y: 1, s: 1, st: { h: 2, m: 0 } }] } }).board;
  assert.notEqual(copy.id, tpl.id);
  assert.equal(JSON.parse(M.ownBoard(boss, tpl.id).state).objects.length, 0, 'the template never changes');
  assert.equal(M.ownBoard(boss, copy.id).title, 'Half past');
  // Share codes: a template's opens; a recent board's doesn't.
  assert.equal(M.openCode(boss, tpl.code).ok, true);
  assert.equal(M.openCode(boss, M.ownBoard(boss, copy.id).code).code, 'noCode');
  // Rename (word rules), duplicate (same kind, a new code), delete.
  assert.equal((await as(boss)(`/api/manipulatives/boards/${tpl.id}/rename`, { method: 'POST', body: { title: '  Half   past two ' } })).json.board.title, 'Half past two');
  assert.equal((await as(boss)(`/api/manipulatives/boards/${tpl.id}/rename`, { method: 'POST', body: { title: 'shit' } })).json.code, 'words');
  assert.equal((await as(boss)(`/api/manipulatives/boards/${tpl.id}/rename`, { method: 'POST', body: { title: '' } })).json.code, 'noTitle');
  const dup = (await as(boss)(`/api/manipulatives/boards/${tpl.id}/duplicate`, { method: 'POST', body: {} })).json.board;
  assert.equal(dup.kind, 'template'); assert.equal(dup.title, 'Half past two (copy)'); assert.notEqual(dup.code, tpl.code);
  const other = world().boss;
  for (const act of ['rename', 'duplicate', 'delete']) assert.equal((await as(other)(`/api/manipulatives/boards/${tpl.id}/${act}`, { method: 'POST', body: { title: 'x' } })).status, 404);
  assert.equal((await as(other)(`/api/manipulatives/boards/${tpl.id}`)).status, 404);
  assert.equal((await as(boss)(`/api/manipulatives/boards/${dup.id}/delete`, { method: 'POST', body: {} })).status, 200);
  assert.equal(M.ownBoard(boss, dup.id), null);
  const lists = (await as(boss)('/api/manipulatives/state')).json;
  assert.ok(lists.boards.every(b => b.kind === 'template')); assert.ok(lists.recent.every(b => b.kind === 'recent'));
});

test('retention: the newest 30 recent boards per teacher, each for 60 days after last use; templates stay', () => {
  const { boss } = world();
  const tpl = M.saveBoard(boss, { tool: 'money', title: 'Keep me', state: {} }).board;
  q.run('UPDATE manip_boards SET created_at=0, updated_at=0, opened_at=0 WHERE id=?', tpl.id);
  const ids = [];
  for (let i = 0; i < 32; i++) { ids.push(M.autosave(boss, { tool: 'clock', state: {} }).board.id); q.run('UPDATE manip_boards SET created_at=?, updated_at=? WHERE id=?', Date.now() - (40 - i) * 1000, Date.now() - (40 - i) * 1000, ids[i]); }
  M.autosave(boss, { tool: 'clock', state: {} });
  const recent = M.listRecent(boss);
  assert.equal(recent.length, M.RECENT_MAX);
  assert.ok(!recent.some(b => b.id === ids[0] || b.id === ids[1] || b.id === ids[2]), 'the oldest go');
  const keep = recent[recent.length - 1].id;
  q.run('UPDATE manip_boards SET created_at=?, updated_at=?, opened_at=? WHERE id=?', 1, 1, Date.now() - (M.RECENT_DAYS + 1) * 86400e3, keep);
  M.prune();
  assert.equal(M.ownBoard(boss, keep), null, 'unused for 60 days: gone');
  assert.ok(M.ownBoard(boss, tpl.id), 'a template stays until it is deleted');
});

test('a room after recess: leaving keeps it live; an ended room reopens with the same code and every student\'s square', async () => {
  const { boss, A, kids } = world();
  const s = M.createSession(boss, { classId: A.id, tool: 'base-ten-blocks', title: 'Making 10' }).session;
  for (const k of kids) M.join(k, { id: s.id });
  const slots = Object.fromEntries(q.all('SELECT user_id, slot FROM manip_work WHERE session_id=?', s.id).map(r => [r.user_id, r.slot]));
  const work = { v: 2, pieces: [{ id: 'p1', kind: 'unit', x: 10, y: 10, label: '1', value: 1, color: '#FFD23F', w: 30, h: 30 }] };
  assert.equal(M.saveArea(kids[1], s.id, kids[1].id, work).ok, true);
  assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/end`, { method: 'POST', body: {} })).status, 200);
  assert.equal(M.saveArea(kids[1], s.id, kids[1].id, work).code, 'ended');
  // Students can't reopen, nor can another host; the teacher can.
  assert.equal((await as(kids[0])(`/api/manipulatives/live/${s.id}/reopen`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await as(world().boss)(`/api/manipulatives/live/${s.id}/reopen`, { method: 'POST', body: {} })).status, 404);
  // Another room for the class meanwhile: reopening ends it (one running room per class).
  const other = M.createSession(boss, { classId: A.id, tool: 'clock' }).session;
  const r = await as(boss)(`/api/manipulatives/live/${s.id}/reopen`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.equal(r.json.session.code, s.code, 'the same join code');
  assert.equal(M.getSession(s.id).status, 'active'); assert.equal(M.getSession(other.id).status, 'ended');
  assert.ok(M.getSession(s.id).opened_at >= M.getSession(s.id).created_at);
  // Students rejoin (by code, as after recess) and get their own squares back, their work in them.
  for (const k of kids) assert.equal(M.join(k, { code: s.code }).ok, true);
  assert.deepEqual(Object.fromEntries(q.all('SELECT user_id, slot FROM manip_work WHERE session_id=?', s.id).map(x => [x.user_id, x.slot])), slots);
  assert.equal(JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, kids[1].id).state).pieces.length, 1);
  assert.equal(M.saveArea(kids[1], s.id, kids[1].id, work).ok, true, 'they can work again');
  // Its 12 hours start again from the reopening.
  q.run('UPDATE manip_sessions SET created_at=? WHERE id=?', Date.now() - (M.SESSION_HOURS + 5) * 3600e3, s.id);
  M.prune();
  assert.equal(M.getSession(s.id).status, 'active');
  // Rename; delete only once ended (its work with it).
  assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/rename`, { method: 'POST', body: { title: 'After recess' } })).json.session.title, 'After recess');
  assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/delete`, { method: 'POST', body: {} })).json.code, 'notEnded');
  M.end(boss, s.id);
  assert.equal((await as(boss)(`/api/manipulatives/live/${s.id}/delete`, { method: 'POST', body: {} })).status, 200);
  assert.equal(M.getSession(s.id), null);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_work WHERE session_id=?', s.id).n, 0);
  // Ended rooms go KEEP_DAYS after they end, as before: no reopening after that.
  const s2 = M.createSession(boss, { classId: A.id, tool: 'clock' }).session;
  M.end(boss, s2.id);
  q.run('UPDATE manip_sessions SET ended_at=? WHERE id=?', Date.now() - (M.KEEP_DAYS + 1) * 86400e3, s2.id);
  M.prune();
  assert.equal((await as(boss)(`/api/manipulatives/live/${s2.id}/reopen`, { method: 'POST', body: {} })).status, 404);
});

test('account deletion takes the teacher\'s drafts with their boards', async () => {
  const { boss } = world();
  standIn();
  try { const id = D.start(boss, { tool: 'clock', brief: 'Clocks again' }).job.id; await D.settled(id); } finally { M.hooks.create = null; }
  assert.ok(q.get('SELECT COUNT(*) n FROM manip_drafts WHERE owner_id=?', boss.id).n > 0);
  M.forgetUser(boss.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_drafts WHERE owner_id=?', boss.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?', boss.id).n, 0);
});
