// A member game the owner asked to take down because an official game replaces it (scripts/seed.js REPLACED):
// hidden once (never deleted), only the matching game, and audited.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { q, setting } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { seed, replaceMemberGames } = await import('../../scripts/seed.js');

test("Dinosaur's Would You Rather is hidden once; other games stay", () => {
  const { official } = seed({ quiet: true });
  const dino = auth.createUser({ username: 'Dinosaur7', password: 'secret123' });
  const other = auth.createUser({ username: 'OtherKid', password: 'secret123' });
  const mk = (owner, title) => { const g = games.createGame(owner.id, { title }); const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>game</p>'); q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id); return g; };
  const wyr = mk(dino, 'Would You Rather?!'), keep1 = mk(dino, 'Dino Jump'), keep2 = mk(other, 'Would You Rather');
  setting('replaced:dinosaur-wyr', '');
  replaceMemberGames(official.id);
  const after = id => games.getGame(id);
  assert.equal(after(wyr.id).hidden_reason, 'replaced'); assert.equal(after(wyr.id).visibility, 'private');
  assert.ok(games.getVersion(after(wyr.id).published_version_id), 'kept, not deleted');
  assert.equal(games.canView(null, after(wyr.id)), false);
  assert.equal(after(keep1.id).visibility, 'public'); assert.equal(after(keep2.id).visibility, 'public');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='game.replaced' AND target=?", wyr.id) || q.get("SELECT 1 FROM audit WHERE action='game.replaced' AND target=?", wyr.id));
  // once: a later Would You Rather by them is left alone
  const later = mk(dino, 'Would You Rather 2');
  replaceMemberGames(official.id);
  assert.equal(after(later.id).visibility, 'public');
});
