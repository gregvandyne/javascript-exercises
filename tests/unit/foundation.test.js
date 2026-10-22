import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { cleanName, cleanText, hasProfanity, personalInfo } = await import('../../server/services/textfilter.js');
const presence = await import('../../server/services/presence.js');

test('schema has every table from the brief plus chat', () => {
  const names = q.all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  for (const t of ['users', 'sessions', 'games', 'game_versions', 'friends', 'plays', 'saves', 'scores', 'ratings', 'likes', 'reports', 'builder_chats', 'builder_usage', 'ad_impressions', 'earnings', 'payouts', 'audit_log', 'settings', 'chat_messages', 'chat_blocks', 'chat_reports'])
    assert.ok(names.includes(t), t);
});

test('username filter', () => {
  assert.equal(cleanName('RocketPanda').ok, true);
  assert.equal(cleanName('ab').ok, false);
  assert.equal(cleanName('has space').ok, false);
  assert.equal(cleanName('sh1tlord').ok, false);
  assert.equal(cleanName('FuCkYou').ok, false);
  assert.equal(cleanName('kid5551234').ok, false, 'phone-like numbers');
  assert.equal(cleanName('EmmaJohnson').ok, false, 'looks like a real full name');
  assert.equal(cleanName('Classy_Cat').ok, true, 'innocent word containing a blocked fragment');
  assert.equal(cleanName('Grasshopper7').ok, true);
});
test('text filter catches tricks and personal info', () => {
  assert.equal(hasProfanity('you are a b1tch'), true);
  assert.equal(hasProfanity('s h i t'), true);
  assert.equal(hasProfanity('I passed my class test'), false);
  assert.equal(hasProfanity('the peacock had a cocktail'), false);
  assert.equal(personalInfo('call me 555-123-4567'), 'phone');
  assert.equal(personalInfo('mail bob@example.com'), 'email');
  assert.equal(personalInfo('go to www.example.com'), 'link');
  assert.equal(personalInfo('I live at 12 Oak Street'), 'address');
  assert.equal(personalInfo('add me on snap'), 'contact');
  assert.equal(personalInfo('I scored 1500 points on level 12'), null);
  assert.equal(cleanText('A fun game about sharks').ok, true);
});

test('guest upgrade keeps the same user id (saves carry over)', () => {
  const g = auth.createGuest();
  assert.equal(g.is_guest, 1);
  const owner = auth.createUser({ username: 'Owner1', password: 'secret1' });
  const game = games.createGame(owner.id, { title: 'Save Test' });
  games.putSave(game.id, g.id, { k: 'v' });
  const up = auth.upgradeGuest(g.id, { username: 'NowReal', password: 'secret12' });
  assert.equal(up.id, g.id); assert.equal(up.is_guest, 0);
  assert.deepEqual(games.getSave(game.id, up.id), { k: 'v' });
  assert.ok(auth.verifyPassword(up, 'secret12'));
});

test('signed tokens expire and resist tampering', () => {
  const t = auth.signToken({ v: 'abc' }, 60);
  assert.equal(auth.readToken(t).v, 'abc');
  assert.equal(auth.readToken(t.slice(0, -2) + 'xx'), null);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 'evil', exp: Date.now() + 1e6 })).toString('base64url') + '.' + sig;
  assert.equal(auth.readToken(forged), null);
  assert.equal(auth.readToken(auth.signToken({ v: 1 }, -1)), null);
});

test('rating maths: rolling sum and count, change any time', () => {
  const o = auth.createUser({ username: 'RateOwner', password: 'secret1' });
  const g = games.createGame(o.id, { title: 'Rate Me' });
  const a = auth.createUser({ username: 'RaterA', password: 'secret1' }), b = auth.createUser({ username: 'RaterB', password: 'secret1' });
  games.rate(g.id, a.id, 5); let r = games.rate(g.id, b.id, 3);
  assert.equal(r.sum, 8); assert.equal(r.count, 2); assert.equal(r.average, 4);
  r = games.rate(g.id, a.id, 1); // change
  assert.equal(r.sum, 4); assert.equal(r.count, 2); assert.equal(r.average, 2);
  r = games.rate(g.id, a.id, 99); assert.equal(r.stars, 5, 'clamped');
});

test('likes toggle and count', () => {
  const o = auth.createUser({ username: 'LikeOwner', password: 'secret1' });
  const g = games.createGame(o.id, { title: 'Like Me' });
  assert.deepEqual(games.toggleLike(g.id, o.id), { liked: true, likes: 1 });
  assert.deepEqual(games.toggleLike(g.id, o.id), { liked: false, likes: 0 });
});

test('scores keep only the best per player', () => {
  const o = auth.createUser({ username: 'ScoreOwner', password: 'secret1' });
  const g = games.createGame(o.id, { title: 'Score Me' });
  assert.equal(games.submitScore(g.id, o.id, 50).improved, true);
  assert.equal(games.submitScore(g.id, o.id, 20).improved, false);
  assert.equal(games.submitScore(g.id, o.id, 70).best, 70);
  assert.equal(games.leaderboard(g.id).length, 1);
});

test('saves must be string maps under the size limit', () => {
  const o = auth.createUser({ username: 'SaveOwner', password: 'secret1' });
  const g = games.createGame(o.id, { title: 'Save Me' });
  assert.throws(() => games.putSave(g.id, o.id, { a: 1 }));
  assert.throws(() => games.putSave(g.id, o.id, ['x']));
  assert.throws(() => games.putSave(g.id, o.id, { big: 'x'.repeat(600_000) }));
  games.putSave(g.id, o.id, { a: '1' }); assert.deepEqual(games.getSave(g.id, o.id), { a: '1' });
});

test('versions: restore copies forward, never rewrites history', () => {
  const o = auth.createUser({ username: 'VerOwner', password: 'secret1' });
  const g = games.createGame(o.id, { title: 'Versions' });
  const v1 = games.addVersion(g.id, '<title>A</title><div>1</div>');
  games.addVersion(g.id, '<title>A</title><div>2</div>');
  const v3 = games.restoreVersion(g.id, v1.id, o.id);
  assert.equal(v3.number, 3); assert.equal(v3.html, v1.html);
  assert.equal(games.listVersions(g.id).length, 3);
  assert.equal(games.getGame(g.id).current_version_id, v3.id);
});

test('presence counts, expires and maps users to games', () => {
  presence._reset();
  presence.touch('g1', 's1', 'u1'); presence.touch('g1', 's2', 'u2'); presence.touch('g2', 's3', 'u3');
  assert.equal(presence.count('g1'), 2);
  assert.deepEqual(presence.top(5)[0], ['g1', 2]);
  assert.deepEqual(presence.playingByUser(['u1', 'u3', 'u9']), { u1: 'g1', u3: 'g2' });
  presence.leave('g1', 's1'); assert.equal(presence.count('g1'), 1);
  assert.equal(presence.totalOnline(), 2);
});

test('search finds by title and by builder name', () => {
  const o = auth.createUser({ username: 'ZebraMaker', password: 'secret1', displayName: 'Zebra Maker' });
  const g = games.createGame(o.id, { title: 'Moon Hopper', tags: 'space,jump' });
  const v = games.addVersion(g.id, '<title>x</title><div>x</div>');
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  assert.ok(games.search(null, { text: 'moon' }).some(x => x.id === g.id));
  assert.ok(games.search(null, { text: 'zebra' }).some(x => x.id === g.id), 'by builder username');
  assert.ok(games.search(null, { text: 'space' }).some(x => x.id === g.id), 'by tag');
  assert.equal(games.searchBuilders(null, 'zebra')[0].username, 'ZebraMaker');
});
