// Typing Pets became Typing Zoo (docs/decisions.md "Typing Zoo"): the old addresses answer 301 to the new ones keeping
// the rest of the path and the query string (services/slug-aliases.js, as for Arithmetic Lab), and a database from before the rename keeps
// everything: migration 0127 gives the same game row the new slug, so a student's save (key 'typing-pets-v1', kept),
// a class assignment and its lesson step, step progress and the teacher's typing panel all still point at that game;
// seeding again makes no second game.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, migrate } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const TY = await import('../../server/services/typing.js');
const { renamedPath } = await import('../../server/services/slug-aliases.js');
const renamedUrl = u => { const i = u.indexOf('?'), p = renamedPath(i < 0 ? u : u.slice(0, i)); return p && p + (i < 0 ? '' : u.slice(i)); };

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (path, who) => { const r = await fetch(base + path, { redirect: 'manual', headers: who ? { cookie: cookieFor(who.id) } : {} }); return { status: r.status, location: r.headers.get('location'), text: await r.text() }; };

test('the old addresses map to the new ones, keeping the path and the query string', () => {
  const cases = {
    '/g/typing-pets': '/g/typing-zoo',
    '/play/typing-pets': '/play/typing-zoo',
    '/play/typing-pets?chapter=l05&lock=1': '/play/typing-zoo?chapter=l05&lock=1',
    '/play/typing-pets/extra?x=1': '/play/typing-zoo/extra?x=1',
    '/fr/g/typing-pets': '/fr/g/typing-zoo',
    '/zh-hant/g/typing-pets?ref=a': '/zh-hant/g/typing-zoo?ref=a',
    '/covers/typing-pets.jpg?v=3': '/covers/typing-zoo.jpg?v=3',
    '/og/typing-pets.jpg': '/og/typing-zoo.jpg',
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(renamedUrl(from), to, from);
  for (const other of ['/g/typing-petsy', '/g/typing-zoo', '/play/typing-pets-v1', '/g/word-hunt?x=typing-pets'])
    assert.equal(renamedUrl(other), null, other);
});

test('the server answers 301 for the old addresses (GET only) and the new ones work', async () => {
  for (const [from, to] of [['/g/typing-pets', '/g/typing-zoo'], ['/play/typing-pets?chapter=l05&lock=1', '/play/typing-zoo?chapter=l05&lock=1'], ['/covers/typing-pets.jpg', '/covers/typing-zoo.jpg'], ['/og/typing-pets.jpg', '/og/typing-zoo.jpg']]) {
    const r = await get(from);
    assert.equal(r.status, 301, from); assert.equal(r.location, to, from);
  }
  const fr = await get('/fr/g/typing-pets');
  assert.equal(fr.status, 301); assert.equal(fr.location, '/fr/g/typing-zoo');
  assert.equal((await get('/g/typing-zoo')).status, 200);
  assert.equal((await get('/covers/typing-zoo.jpg')).status, 200);
  const post = await fetch(base + '/g/typing-pets', { method: 'POST', redirect: 'manual', headers: { origin: base } });
  assert.equal(post.status, 308, 'a POST keeps its body (308)');
  assert.equal(G.getGameBySlug('typing-pets').id, G.getGameBySlug('typing-zoo').id, 'a lookup by the old slug finds the game');
});

test('a database from before the rename: the same game row, its save, assignment and progress all carry over', async () => {
  const game = G.getGameBySlug('typing-zoo');
  // Back to how it was before the rename: the row under the old slug, the migration not yet run.
  q.run("UPDATE games SET slug='typing-pets', title='Typing Pets' WHERE id=?", game.id);
  q.run("DELETE FROM migrations WHERE name='0127_typing_zoo_slug'");
  assert.ok(!q.get("SELECT 1 FROM games WHERE slug='typing-zoo'"));
  const boss = createUser({ username: 'ZooBoss', password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Zoo Primary' }).school;
  const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Zoo', role: 'admin' }).user;
  const teacher = S.createSchoolAccount(head, school.id, { rosterName: 'Mr Keeper', role: 'teacher' }).user;
  const klass = S.createClass(teacher, school.id, { name: 'Zoo 2B' }).class;
  const kid = S.createSchoolAccount(head, school.id, { rosterName: 'Kit Typer' }).user;
  assert.ok(S.addToClass(teacher, klass.id, kid.id).ok);
  // Typed before the rename: a save with a pet that is now another animal (fox is the giraffe now), and an assigned lesson.
  G.putSave(game.id, kid.id, { [TY.SAVE_KEY]: JSON.stringify({ v: 1, done: { l01: { s: 3, w: 15, a: 96, n: 1, t: Date.now() } }, pets: { fox: { s: 1, n: 1, t: 5 } }, keys: {}, secs: 300, last: Date.now() }) });
  const r = await fetch(`${base}/api/teach/assign-game`, { method: 'POST', headers: { cookie: cookieFor(teacher.id), 'content-type': 'application/json', origin: base }, body: JSON.stringify({ gameId: game.id, classId: klass.id, opts: 'chapter=l02&lock=1' }) });
  assert.equal(r.status, 200, await r.text());
  const step = q.get('SELECT s.* FROM lesson_steps s JOIN class_lessons c ON c.lesson_id=s.lesson_id WHERE s.game_id=? AND c.class_id=?', game.id, klass.id);
  const cl = q.get('SELECT id FROM class_lessons WHERE lesson_id=? AND class_id=?', step.lesson_id, klass.id);
  assert.equal((await fetch(`${base}/api/progress/${cl.id}/${step.id}/game`, { method: 'POST', headers: { cookie: cookieFor(kid.id), 'content-type': 'application/json', origin: base }, body: JSON.stringify({ event: 'score', score: 15, label: 'L2 96% 3* 15 wpm' }) })).status, 200);

  migrate();   // the deploy: 0127 runs once
  const now = G.getGameBySlug('typing-zoo');
  assert.equal(now.id, game.id, 'the same game row, now under the new slug');
  assert.ok(!q.get("SELECT 1 FROM games WHERE slug='typing-pets'"), 'nothing left under the old slug');
  seed({ quiet: true });   // the deploy seeds again: the game is found by its new slug, never made twice
  assert.equal(q.get("SELECT COUNT(*) n FROM games WHERE slug IN ('typing-pets', 'typing-zoo')").n, 1);
  assert.equal(G.getGameBySlug('typing-zoo').title, 'Typing Zoo', 'the seed brings the new title');
  migrate();   // and the migration never runs twice
  assert.equal(G.getGameBySlug('typing-zoo').id, game.id);

  // The save, under the same key: the teacher's panel still shows it; the step and its progress still point at the game.
  const saved = JSON.parse(G.getSave(game.id, kid.id)[TY.SAVE_KEY]);
  assert.deepEqual(Object.keys(saved.pets), ['fox'], 'the save itself is untouched (the game shows the fox as the giraffe)');
  const page = await get(`/class/${klass.id}/progress`, teacher);
  assert.equal(page.status, 200);
  assert.match(page.text, /id="typing"[\s\S]*Kit Typer[\s\S]*1\/40/);
  assert.equal(q.get('SELECT game_id FROM lesson_steps WHERE id=?', step.id).game_id, game.id);
  assert.equal(q.get('SELECT status FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', cl.id, step.id, kid.id).status, 'done');
  // The assigned lesson opens at the new address (and the old link answers 301 there).
  const play = await get('/play/typing-zoo?chapter=l02&lock=1', kid);
  assert.equal(play.status, 200);
  const old = await get('/play/typing-pets?chapter=l02&lock=1', kid);
  assert.equal(old.status, 301); assert.equal(old.location, '/play/typing-zoo?chapter=l02&lock=1');
});
