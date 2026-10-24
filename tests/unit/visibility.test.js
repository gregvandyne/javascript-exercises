// canView is the single visibility rule: private, friends-only, public, status and report auto-hide.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const friends = await import('../../server/services/friends.js');
const { createApp } = await import('../../server/app.js');

const mk = (n, role) => createUser({ username: n, password: 'secret123', role });
function mkGame(owner, visibility, status = 'published') {
  const g = games.createGame(owner.id, { title: `${visibility} game ${Math.random().toString(36).slice(2, 6)}` });
  const v = games.addVersion(g.id, '<div>hi</div><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run('UPDATE games SET visibility=?, status=?, published_version_id=? WHERE id=?', visibility, status, status === 'published' ? v.id : null, g.id);
  return games.getGame(g.id);
}
function cookieFor(userId) { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, userId); return c; }
const owner = mk('OwnerOlly'), friend = mk('FriendFin'), stranger = mk('StrangerSam'), pending = mk('PendingPip'), admin = mk('AdminAda', 'admin');
friends.addByCode(owner, friend.friend_code); friends.accept(friend, owner.id);
friends.addByCode(pending, owner.friend_code); // pending only, never accepted

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('private: owner and admin only (not friends, not strangers, not visitors)', () => {
  const g = mkGame(owner, 'private');
  assert.equal(games.canView(owner, g), true);
  assert.equal(games.canView(admin, g), true);
  assert.equal(games.canView(friend, g), false);
  assert.equal(games.canView(stranger, g), false);
  assert.equal(games.canView(null, g), false);
});

test('friends-only: accepted friends yes; strangers, pending friends and visitors no', () => {
  const g = mkGame(owner, 'friends');
  assert.equal(games.canView(friend, g), true);
  assert.equal(games.canView(owner, g), true);
  assert.equal(games.canView(admin, g), true);
  assert.equal(games.canView(stranger, g), false);
  assert.equal(games.canView(pending, g), false);
  assert.equal(games.canView(null, g), false);
  assert.equal(games.canView(createGuest(), g), false);
  // listings agree with canView
  const ids = u => games.listVisible(u, { ownerId: owner.id, limit: 100 }).map(x => x.id);
  assert.ok(ids(friend).includes(g.id)); assert.ok(!ids(stranger).includes(g.id)); assert.ok(!ids(pending).includes(g.id));
  // unfriending removes access
  friends.unfriend(friend, owner.id);
  assert.equal(games.canView(friend, g), false);
  friends.addByCode(owner, friend.friend_code); friends.accept(friend, owner.id);
});

test('public: everyone, but only while published and not hidden', () => {
  const g = mkGame(owner, 'public');
  for (const u of [null, stranger, friend, createGuest()]) assert.equal(games.canView(u, g), true);
  for (const st of ['draft', 'in_review', 'rejected', 'suspended']) {
    q.run('UPDATE games SET status=? WHERE id=?', st, g.id);
    const gg = games.getGame(g.id);
    assert.equal(games.canView(stranger, gg), false, st);
    assert.equal(games.canView(owner, gg), true, `owner still sees ${st}`);
    assert.equal(games.canView(admin, gg), true, `admin still sees ${st}`);
  }
  q.run("UPDATE games SET status='published', hidden_reason='reports' WHERE id=?", g.id);
  assert.equal(games.canView(stranger, games.getGame(g.id)), false);
  assert.equal(games.canView(owner, games.getGame(g.id)), true);
});

test('three reports auto-hide a public game (HTTP), admin restore brings it back', async () => {
  const g = mkGame(owner, 'public');
  const reporters = [mk('RepOne'), mk('RepTwo'), mk('RepThree')];
  for (const [i, r] of reporters.entries()) {
    const res = await fetch(`${base}/api/games/${g.id}/report`, { method: 'POST', headers: { cookie: cookieFor(r.id), 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'scary' }) });
    assert.equal(res.status, 200);
    assert.equal(games.getGame(g.id).hidden_reason, i < 2 ? '' : 'reports');
  }
  assert.equal(games.canView(stranger, games.getGame(g.id)), false);
  assert.equal((await fetch(`${base}/g/${g.slug}`)).status, 404);
  const res = await fetch(`${base}/api/admin/games/${g.id}/restore`, { method: 'POST', headers: { cookie: cookieFor(admin.id), 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 200);
  assert.equal(games.canView(stranger, games.getGame(g.id)), true);
  assert.equal(q.get("SELECT COUNT(*) n FROM reports WHERE game_id=? AND status='open'", g.id).n, 0);
});

test('favorites: ❤️ games show on Home, Me and /favorites, newest first; games that go private or get deleted drop off', async () => {
  const kid = mk('FavFiona');
  const a = mkGame(owner, 'public'), b = mkGame(owner, 'public'), c = mkGame(owner, 'public');
  games.toggleLike(a.id, kid.id); q.run('UPDATE likes SET created_at=1 WHERE game_id=? AND user_id=?', a.id, kid.id);
  games.toggleLike(b.id, kid.id); games.toggleLike(c.id, kid.id);
  assert.deepEqual(games.favorites(kid, kid.id).map(g => g.id).sort(), [a.id, b.id, c.id].sort());
  assert.equal(games.favorites(kid, kid.id).at(-1).id, a.id, 'oldest favorite last');
  q.run("UPDATE games SET visibility='private' WHERE id=?", b.id);
  games.deleteGame(c.id);
  assert.deepEqual(games.favorites(kid, kid.id).map(g => g.id), [a.id]);
  const cookie = cookieFor(kid.id);
  const get = p => fetch(base + p, { headers: { cookie }, redirect: 'manual' });
  let r = await get('/favorites'); assert.equal(r.status, 200); let h = await r.text();
  assert.match(h, new RegExp(`href="/g/${a.slug}"`)); assert.doesNotMatch(h, new RegExp(`/g/${b.slug}"`));
  r = await get('/'); h = await r.text(); assert.match(h, /id="favorites-h"/); assert.match(h, /href="\/favorites"/);
  r = await get('/me'); h = await r.text(); assert.match(h, /href="\/favorites"/);
  // nobody's favorites without signing in; an empty list says how to add one
  r = await fetch(base + '/favorites', { redirect: 'manual' }); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^\/login/);
  const none = mk('FavNone'); r = await fetch(base + '/favorites', { headers: { cookie: cookieFor(none.id) } }); assert.match(await r.text(), /No favorites yet/);
  r = await fetch(base + '/', { headers: { cookie: cookieFor(none.id) } }); assert.doesNotMatch(await r.text(), /id="favorites-h"/);
});
