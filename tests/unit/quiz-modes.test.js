// Quest Race and Question Battle are offered again (they were hidden for a while with hidden_reason 'retired'):
// the seed clears that flag on boot, so a database from that time gets them back.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { q } = await import('../../server/db.js');
const { seed } = await import('../../scripts/seed.js');
const games = await import('../../server/services/games.js');

test('the seed brings back quiz modes that were retired', () => {
  seed({ quiet: true });
  q.run("UPDATE games SET visibility='private', featured=0, hidden_reason='retired' WHERE slug IN ('quest-race', 'question-battle')");
  seed({ quiet: true });
  for (const slug of ['quest-race', 'question-battle']) {
    const g = games.getGameBySlug(slug);
    assert.equal(g.hidden_reason, ''); assert.equal(g.visibility, 'public'); assert.equal(games.canView(null, g), true, slug);
  }
});
