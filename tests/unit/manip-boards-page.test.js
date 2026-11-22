// My boards on the manipulatives home and the All boards page (docs/decisions.md "Virtual math manipulatives: saving
// and AI drafts"): the home shows the newest 5 of each section and one "See all boards" link only when something is
// left out (public/js/manip-library.js homeLists); the page groups both sections by tool, the most recently used tool
// first (byTool); /manipulatives/boards is a host's page only (everyone else the site's 404), never indexed; the state
// gives every template with ?all=1 and the count always; the ⋯ menu's actions (the existing routes) work on any board,
// not only the ones the home shows. Nothing is deleted by the cap.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const { q } = await import('../../server/db.js');
const L = await import('../../public/js/manip-library.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* a page */ }
  return { status: r.status, json, text, headers: r.headers };
};
let n = 0;
const host = () => createUser({ username: `PageBoss${++n}`, password: 'secret123', role: 'admin' });
const TOOLS = ['clock', 'base-ten-blocks', 'fraction-circles', 'number-lines'];
/** 8 templates and 12 recent boards across four tools, older first (so the newest are the last made). */
function seed(u, { templates = 8, recent = 12 } = {}) {
  const t0 = Date.now() - 3600e3;
  for (let i = 0; i < templates; i++) {
    const id = M.saveBoard(u, { tool: TOOLS[i % 4], title: `Template ${i + 1}`, state: {} }).board.id;
    q.run('UPDATE manip_boards SET created_at=?, updated_at=?, opened_at=? WHERE id=?', t0 + i * 1000, t0 + i * 1000, t0 + i * 1000, id);
  }
  for (let i = 0; i < recent; i++) {
    const id = M.autosave(u, { tool: TOOLS[(i + 1) % 4], title: `Recent ${i + 1}`, state: {} }).board.id;
    q.run('UPDATE manip_boards SET created_at=?, updated_at=?, opened_at=? WHERE id=?', t0 + i * 1000, t0 + i * 1000, t0 + i * 1000, id);
  }
}

test('homeLists: the newest 5 of each; the link only when something is left out; the count is every board', () => {
  const rows = (k, m) => Array.from({ length: m }, (_, i) => ({ id: `${k}${i}`, tool: 'clock', at: m - i }));
  const a = L.homeLists(rows('t', 8), rows('r', 12));
  assert.equal(L.HOME_MAX, 5);
  assert.deepEqual(a.templates.map(r => r.id), ['t0', 't1', 't2', 't3', 't4'], 'newest first, as given');
  assert.deepEqual(a.recent.map(r => r.id), ['r0', 'r1', 'r2', 'r3', 'r4']);
  assert.equal(a.more, true); assert.equal(a.total, 20);
  const b = L.homeLists(rows('t', 5), rows('r', 5));
  assert.equal(b.more, false, 'nothing hidden: no link'); assert.equal(b.templates.length, 5); assert.equal(b.recent.length, 5);
  const c = L.homeLists(rows('t', 0), rows('r', 6));
  assert.equal(c.more, true); assert.equal(c.templates.length, 0);
  const d = L.homeLists(rows('t', 3), rows('r', 2), 140);
  assert.equal(d.more, true, 'templates beyond the home list count'); assert.equal(d.total, 142);
});

test('byTool: one group per tool, the most recently used tool first, rows inside in their order (rooms too)', () => {
  const g = L.byTool([
    { id: 'a', tool: 'clock', at: 50 }, { id: 'room', type: 'room', tool: 'money', at: 90 }, { id: 'b', tool: 'clock', at: 40 },
    { id: 'c', tool: 'geoboard', at: 10 }, { id: 'd', tool: 'money', at: 20 }, { id: 'e', tool: 'clock', at: 95 },
  ]);
  assert.deepEqual(g.map(x => x.tool), ['clock', 'money', 'geoboard']);
  assert.deepEqual(g[0].rows.map(r => r.id), ['a', 'b', 'e'], 'the order given (newest first from the page)');
  assert.deepEqual(g[1].rows.map(r => r.id), ['room', 'd'], 'a live room under its own tool');
  assert.equal(g[0].at, 95);
  assert.deepEqual(L.byTool([]), []);
});

test('the state: every template with ?all=1 (the home keeps 100), the count always; nothing is deleted', async () => {
  const u = host(); seed(u, { templates: 104, recent: 12 });
  const home = await as(u)('/api/manipulatives/state');
  assert.equal(home.status, 200);
  assert.equal(home.json.boards.length, 100); assert.equal(home.json.templateCount, 104);
  assert.equal(home.json.recent.length, 12);
  assert.equal(home.json.boards[0].title, 'Template 104', 'newest first');
  const all = await as(u)('/api/manipulatives/state?all=1');
  assert.equal(all.json.boards.length, 104); assert.equal(all.json.boards.at(-1).title, 'Template 1');
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?", u.id).n, 116);
});

test('/manipulatives/boards: a host\'s page, never indexed; anyone else (signed out, a student, a plain user) gets the 404', async () => {
  const u = host(); seed(u);
  const r = await as(u)('/manipulatives/boards');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(r.text, /<meta name="robots" content="noindex/);
  assert.match(r.text, /"view":"boards"/); assert.match(r.text, /\/js\/manip\.js/);
  assert.match(r.text, /<title>All boards · Math manipulatives/);
  assert.equal((await as(null)('/manipulatives/boards')).status, 404);
  const plain = createUser({ username: `PagePlain${++n}`, password: 'secret123' });
  assert.equal((await as(plain)('/manipulatives/boards')).status, 404);
  // A student of a class with a room running can open /manipulatives, but not the teacher's All boards page.
  const oak = S.createSchool(u, { name: `Page Oak ${n}` }).school;
  S.addMember(u, oak.id, u.id, 'teacher', { rosterName: 'Ms Page' });
  const A = S.createClass(u, oak.id, { name: `4P-${n}` }).class;
  const kid = getUser(S.createSchoolAccount(u, oak.id, { rosterName: 'Pia Pine' }).user.id); S.addToClass(u, A.id, kid.id);
  const s = M.createSession(u, { classId: A.id, tool: 'clock', title: 'Times' }).session;
  assert.equal(M.roleOf(kid), 'student');
  assert.equal((await as(kid)('/manipulatives')).status, 200);
  const k = await as(kid)('/manipulatives/boards');
  assert.equal(k.status, 404); assert.doesNotMatch(k.text, /Template 1/);
  const ks = await as(kid)('/api/manipulatives/state?all=1');
  assert.equal(ks.json.role, 'student'); assert.equal(ks.json.boards, undefined, 'no teacher boards for a student');
  M.end(u, s.id);
});

test('the ⋯ menu\'s actions work on a board the home does not show (the oldest template, the oldest recent board)', async () => {
  const u = host(); seed(u);
  const st = (await as(u)('/api/manipulatives/state?all=1')).json;
  const oldTpl = st.boards.at(-1), oldRecent = st.recent.at(-1);
  assert.equal(oldTpl.title, 'Template 1'); assert.equal(oldRecent.title, 'Recent 1');
  assert.ok(!L.homeLists(st.boards, st.recent).templates.some(b => b.id === oldTpl.id), 'not on the home');
  assert.equal((await as(u)(`/api/manipulatives/boards/${oldTpl.id}/rename`, { method: 'POST', body: { title: 'Oldest clock' } })).status, 200);
  assert.equal((await as(u)(`/api/manipulatives/boards/${oldTpl.id}/duplicate`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await as(u)(`/api/manipulatives/boards/${oldRecent.id}/delete`, { method: 'POST', body: {} })).status, 200);
  const after = (await as(u)('/api/manipulatives/state?all=1')).json;
  assert.equal(after.templateCount, 9);
  assert.ok(after.boards.some(b => b.title === 'Oldest clock')); assert.ok(after.boards.some(b => b.title === 'Oldest clock (copy)'));
  assert.equal(after.recent.length, 11); assert.ok(!after.recent.some(b => b.id === oldRecent.id));
  // Someone else's board: the same 404 as before.
  const other = host();
  assert.equal((await as(other)(`/api/manipulatives/boards/${oldTpl.id}/rename`, { method: 'POST', body: { title: 'Mine now' } })).status, 404);
});
