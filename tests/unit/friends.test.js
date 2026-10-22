// Friends: add by code, accept/decline/cancel, can't add self, unfriend removes both rows, no name search.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const friends = await import('../../server/services/friends.js');
const { createApp } = await import('../../server/app.js');

const mk = n => createUser({ username: n, password: 'secret123' });
const rows = (a, b) => q.all('SELECT user_id, friend_id, status FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?) ORDER BY user_id', a, b, b, a);
function cookieFor(userId) { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, userId); return c; }

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('add by code (case-insensitive, spaces ignored), then accept makes two accepted rows', () => {
  const a = mk('AmberFox'), b = mk('BlueOtter');
  const messy = ' ' + b.friend_code.slice(0, 3).toLowerCase() + ' ' + b.friend_code.slice(3) + ' ';
  const r = friends.addByCode(a, messy);
  assert.equal(r.ok, true); assert.equal(r.state, 'sent');
  assert.deepEqual(rows(a.id, b.id).map(x => x.status), ['pending']);
  assert.equal(friends.incoming(b.id).length, 1); assert.equal(friends.outgoing(a.id).length, 1);
  assert.equal(friends.accept(b, a.id), true);
  const rs = rows(a.id, b.id);
  assert.equal(rs.length, 2); assert.ok(rs.every(x => x.status === 'accepted'));
  assert.equal(friends.status(a.id, b.id), 'friends');
  assert.equal(friends.addByCode(a, b.friend_code).state, 'already');
});

test('if they already asked me, adding their code accepts', () => {
  const a = mk('CometA'), b = mk('CometB');
  friends.addByCode(a, b.friend_code);
  const r = friends.addByCode(b, a.friend_code);
  assert.equal(r.state, 'accepted');
  assert.equal(rows(a.id, b.id).filter(x => x.status === 'accepted').length, 2);
});

test('decline and cancel remove the pending row', () => {
  const a = mk('DeclA'), b = mk('DeclB'), c = mk('DeclC');
  friends.addByCode(a, b.friend_code);
  assert.equal(friends.decline(b, a.id), true);
  assert.equal(rows(a.id, b.id).length, 0);
  friends.addByCode(a, c.friend_code);
  assert.equal(friends.cancel(a, c.id), true);
  assert.equal(rows(a.id, c.id).length, 0);
  assert.equal(friends.accept(b, a.id), false, 'nothing to accept');
});

test("can't add yourself, bad codes, guests, banned", () => {
  const a = mk('SelfyOne');
  assert.equal(friends.addByCode(a, a.friend_code).ok, false);
  assert.match(friends.addByCode(a, a.friend_code).error, /your own code/);
  assert.equal(friends.addByCode(a, 'ABC').ok, false);
  assert.equal(friends.addByCode(a, '').ok, false);
  assert.equal(friends.addByCode(a, 'ZZZZZZ').ok, false);
  const g = createGuest();
  assert.equal(friends.addByCode(g, a.friend_code).ok, false, 'guests cannot add');
  assert.equal(friends.addByCode(a, g.friend_code).ok, false, 'cannot add a guest');
  const banned = mk('BannedBob'); q.run('UPDATE users SET banned=1 WHERE id=?', banned.id);
  assert.equal(friends.addByCode(a, banned.friend_code).ok, false);
});

test('unfriend removes both rows', () => {
  const a = mk('UnfA'), b = mk('UnfB');
  friends.addByCode(a, b.friend_code); friends.accept(b, a.id);
  assert.equal(rows(a.id, b.id).length, 2);
  assert.equal(friends.unfriend(b, a.id), true);
  assert.equal(rows(a.id, b.id).length, 0);
  assert.equal(friends.list(a.id).length, 0);
});

test('HTTP: add, accept, remove; guests are refused', async () => {
  const a = mk('HttpA'), b = mk('HttpB');
  const post = (u, path, body = {}) => fetch(base + path, { method: 'POST', headers: { cookie: cookieFor(u.id), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let r = await post(a, '/api/friends/add', { code: b.friend_code.toLowerCase() });
  assert.equal(r.status, 200); assert.equal((await r.json()).state, 'sent');
  r = await post(b, `/api/friends/${a.id}/accept`); assert.equal(r.status, 200);
  const list = await (await fetch(base + '/api/friends', { headers: { cookie: cookieFor(a.id) } })).json();
  assert.deepEqual(list.friends.map(f => f.username), ['HttpB']);
  r = await post(a, '/api/friends/add', { code: a.friend_code }); assert.equal(r.status, 400);
  r = await post(a, `/api/friends/${b.id}/remove`); assert.equal(r.status, 200);
  assert.equal(rows(a.id, b.id).length, 0);
  const g = createGuest();
  r = await post(g, '/api/friends/add', { code: a.friend_code }); assert.equal(r.status, 403);
  const page = await (await fetch(base + '/friends', { headers: { cookie: cookieFor(g.id) } })).text();
  assert.match(page, /Make a free account to add friends/);
  const mine = await (await fetch(base + '/friends', { headers: { cookie: cookieFor(a.id) } })).text();
  assert.ok(mine.includes(a.friend_code), 'friends page shows my code');
});

test('there is no way to search people by name', async () => {
  const a = mk('SearchMe');
  const ck = cookieFor(a.id);
  for (const p of ['/api/friends/search?q=Sea', '/api/users?q=Sea', '/api/users/search?q=Sea', '/api/people?q=Sea', '/api/friends/find?username=SearchMe']) {
    const r = await fetch(base + p, { headers: { cookie: ck } });
    assert.equal(r.status, 404, p);
  }
  const r = await fetch(base + '/api/friends/add', { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'HttpA' }) });
  assert.equal(r.status, 400, 'adding by name is not possible');
});
