// The Big Divide is now Arithmetic Lab (docs/decisions.md "The Big Divide is now Arithmetic Lab"): migration 0121 moves
// the official row from the slug box-by-box to arithmetic-lab (same id, so its sets and plays stay), the seed import then
// updates that row instead of adding a second game, and every old address redirects to the new one with its query
// string and the rest of its path (services/slug-aliases.js, in server/app.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, publish, official, teacher, games, q, db } from './_live.js';
import { renamedPath, canonicalSlug } from '../../server/services/slug-aliases.js';
import { importGame } from '../../scripts/import-game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('renamedPath: the old slug as a whole segment or a file name, anywhere in the path; nothing else', () => {
  assert.equal(renamedPath('/g/box-by-box'), '/g/arithmetic-lab');
  assert.equal(renamedPath('/play/box-by-box'), '/play/arithmetic-lab');
  assert.equal(renamedPath('/es/g/box-by-box'), '/es/g/arithmetic-lab');
  assert.equal(renamedPath('/covers/box-by-box.jpg'), '/covers/arithmetic-lab.jpg');
  assert.equal(renamedPath('/api/standards/games/box-by-box'), '/api/standards/games/arithmetic-lab');
  assert.equal(renamedPath('/g/box-by-box-2'), null);
  assert.equal(renamedPath('/g/my-box-by-box'), null);
  assert.equal(renamedPath('/g/arithmetic-lab'), null);
  assert.equal(canonicalSlug('box-by-box'), 'arithmetic-lab');
  assert.equal(canonicalSlug('crossword'), 'crossword');
});

test('old addresses: 301 to the same path with the new slug, query string kept; 308 for a POST; never off the site', async () => {
  const loc = async (p, method = 'GET') => { const r = await call(p, { method, ...(method === 'POST' ? { body: {} } : {}) }); return [r.status, r.headers.get('location')]; };
  assert.deepEqual(await loc('/g/box-by-box'), [301, '/g/arithmetic-lab']);
  assert.deepEqual(await loc('/play/box-by-box?chapter=s-abcdefghij&lock=1'), [301, '/play/arithmetic-lab?chapter=s-abcdefghij&lock=1']);
  assert.deepEqual(await loc('/fr/g/box-by-box?ref=qr'), [301, '/fr/g/arithmetic-lab?ref=qr']);
  assert.deepEqual(await loc('/covers/box-by-box.jpg?v=abc'), [301, '/covers/arithmetic-lab.jpg?v=abc']);
  assert.deepEqual(await loc('/og/box-by-box.jpg'), [301, '/og/arithmetic-lab.jpg']);
  assert.deepEqual(await loc('/api/games/box-by-box/print', 'POST'), [308, '/api/games/arithmetic-lab/print']);
  const [, away] = await loc('//evil.example/box-by-box');
  assert.ok(!/^\/\/|^\/\\|^https?:/.test(away), `stays on the site: ${away}`);
  assert.notEqual((await call('/g/box-by-box-2')).status, 301, 'a different slug is left alone');
});

test('migration 0121: the old official row takes the new slug (same id, sets kept), a squatter moves aside, the seed updates that row', async () => {
  // A database from before the rename: the official game under box-by-box with a teacher's saved set.
  const old = publish(official, '<!doctype html><title>t</title><p>bb</p>', { source: 'seed', slug: 'arithmetic-lab', title: 'The Big Divide' });
  q.run("UPDATE games SET slug='box-by-box' WHERE id=?", old.id);
  q.run('INSERT INTO game_sets(id, game_id, owner_id, items, created_at, updated_at) VALUES (?,?,?,?,?,?)', 's-renametest', old.id, teacher.id, '[{"k":"divide","p":[[84,4]],"l":"guided"}]', Date.now(), Date.now());
  // Someone's own game that happens to be called Arithmetic Lab already holds the new slug.
  const mine = publish(teacher, '<!doctype html><title>t</title><p>mine</p>', { title: 'Arithmetic Lab' });
  assert.equal(mine.slug, 'arithmetic-lab');

  const entry = db.MIGRATIONS.find(m => m[0] === '0121_arithmetic_lab_slug');
  assert.ok(entry && typeof entry[2] === 'function', 'listed with its backfill');
  db.db.transaction(() => { db.db.exec(entry[1]); entry[2](db.db); })();

  assert.equal(games.getGame(old.id).slug, 'arithmetic-lab');
  assert.equal(games.getGame(mine.id).slug, 'arithmetic-lab-2');
  assert.equal(q.get("SELECT COUNT(*) n FROM games WHERE slug='box-by-box'").n, 0);
  assert.equal(q.get("SELECT game_id FROM game_sets WHERE id='s-renametest'").game_id, old.id, 'the set still belongs to the game');
  assert.equal(games.getGameBySlug('box-by-box').id, old.id, 'the old slug still finds it');
  entry[2](db.db);   // again: nothing to do
  assert.equal(games.getGame(old.id).slug, 'arithmetic-lab');

  const g = importGame(path.join(ROOT, 'seed-games/arithmetic-lab.html'), path.join(ROOT, 'seed-games/arithmetic-lab.json'), official.id);
  assert.equal(g.id, old.id, 'the seed updates the same row');
  assert.equal(g.title, 'Arithmetic Lab');
  assert.equal(q.get("SELECT COUNT(*) n FROM games WHERE source='seed' AND (slug IN ('box-by-box', 'arithmetic-lab') OR title IN ('Arithmetic Lab', 'The Big Divide'))").n, 1, 'no second game');

  // The old links land on it.
  const r = await call('/g/box-by-box');
  assert.equal(r.status, 301);
  const page = await call(r.headers.get('location'));
  assert.equal(page.status, 200);
  assert.match(page.text, /Arithmetic Lab/);
  // And no new game can take the old slug.
  assert.notEqual(games.uniqueSlug('Box by box'), 'box-by-box');
  assert.notEqual(games.createGame(teacher.id, { title: 'x', slug: 'box-by-box' }).slug, 'box-by-box');
});
