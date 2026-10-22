import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const pub = await import('../../server/services/publish.js');
const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';

const owner = auth.createUser({ username: 'PubOwner', password: 'secret1' });
const admin = auth.createUser({ username: 'PubAdmin', password: 'secret1', role: 'admin' });
const stranger = auth.createUser({ username: 'Stranger1', password: 'secret1' });

test('cannot publish without a version or with a failing scan', async () => {
  const g = games.createGame(owner.id, { title: 'Empty' });
  assert.equal((await pub.publish(owner, g.id, 'friends')).ok, false);
  games.addVersion(g.id, '<title>x</title><script>fetch("/x")</script>');
  const r = await pub.publish(owner, g.id, 'friends');
  assert.equal(r.ok, false); assert.equal(r.state, 'blocked');
});
test('friends publishes immediately; public waits for review without a model', async () => {
  const g = games.createGame(owner.id, { title: 'Pub Flow' });
  const v1 = games.addVersion(g.id, GOOD);
  let r = await pub.publish(owner, g.id, 'friends');
  assert.equal(r.state, 'live'); assert.equal(r.game.visibility, 'friends'); assert.equal(r.game.published_version_id, v1.id);
  assert.equal(games.canView(stranger, r.game), false);
  r = await pub.publish(owner, g.id, 'public');
  assert.equal(r.state, 'in_review'); assert.equal(r.game.pending_version_id, v1.id);
  assert.equal(r.game.status, 'published', 'still live for friends while waiting');
  const a = pub.approve(admin, g.id, 'Looks great');
  assert.equal(a.visibility, 'public'); assert.equal(a.published_version_id, v1.id); assert.equal(a.pending_version_id, null);
  assert.equal(games.canView(stranger, a), true);
});
test('builders can update a live public game; old version stays live until approved', async () => {
  const g = games.createGame(owner.id, { title: 'Update Me' });
  const v1 = games.addVersion(g.id, GOOD);
  await pub.publish(owner, g.id, 'public'); pub.approve(admin, g.id);
  const v2 = games.addVersion(g.id, GOOD.replace('win', 'coin'));
  const r = await pub.publish(owner, g.id, 'public');
  assert.equal(r.state, 'in_review');
  let cur = games.getGame(g.id);
  assert.equal(cur.published_version_id, v1.id, 'players keep v1'); assert.equal(cur.pending_version_id, v2.id);
  assert.equal(games.canView(stranger, cur), true);
  pub.reject(admin, g.id, 'Please make the text bigger');
  cur = games.getGame(g.id);
  assert.equal(cur.status, 'published'); assert.equal(cur.published_version_id, v1.id); assert.equal(cur.review_note, 'Please make the text bigger');
  await pub.publish(owner, g.id, 'public'); pub.approve(admin, g.id);
  assert.equal(games.getGame(g.id).published_version_id, v2.id, 'update is live');
});
test('updating a friends game goes live immediately; approved versions are not re-reviewed', async () => {
  const g = games.createGame(owner.id, { title: 'Friends Update' });
  games.addVersion(g.id, GOOD); await pub.publish(owner, g.id, 'friends');
  const v2 = games.addVersion(g.id, GOOD.replace('win', 'jump'));
  const r = await pub.publish(owner, g.id, 'friends');
  assert.equal(r.state, 'live'); assert.equal(r.game.published_version_id, v2.id);
  await pub.publish(owner, g.id, 'public'); pub.approve(admin, g.id);
  const back = await pub.setVisibility(owner, g.id, 'friends'); assert.equal(back.game.visibility, 'friends');
  const again = await pub.setVisibility(owner, g.id, 'public'); assert.equal(again.state, 'live', 'already-approved version skips review');
});
test('first-time public rejection marks the game rejected with the note', async () => {
  const g = games.createGame(owner.id, { title: 'Reject Me' });
  games.addVersion(g.id, GOOD); await pub.publish(owner, g.id, 'public');
  assert.equal(games.getGame(g.id).status, 'in_review');
  const r = pub.reject(admin, g.id, 'Too scary');
  assert.equal(r.status, 'rejected'); assert.equal(r.review_note, 'Too scary');
  assert.equal(games.canView(stranger, r), false);
});
