// Online matches (server/services/match.js, server/routes/match.js): who may play whom, codes, invites, the relay
// (numbers and booleans only, never text), names between strangers, the play page and the frame's BRB.match.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const friends = await import('../../server/services/friends.js');
const chat = await import('../../server/services/chat.js');
const F = await import('../../server/services/family.js');
const games = await import('../../server/services/games.js');
const M = await import('../../server/services/match.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { seed } = await import('../../scripts/seed.js');
const { createApp } = await import('../../server/app.js');

let n = 0;
const kid = () => auth.createUser({ username: `MtKid${++n}`, password: 'secret123' });
const grownup = () => { const u = auth.createUser({ username: `MtMum${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
const link = (g, c) => q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", F.familyOfOwner(g.id).id, c.id, Date.now(), Date.now());
const befriend = (a, b) => { friends.addByCode(a, b.friend_code); friends.accept(b, a.id); };
function cookieFor(userId) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, userId); return c; }

let server, base, cc;
before(async () => {
  seed({ quiet: true });
  cc = games.getGameBySlug('castle-clash');
  server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { M._reset(); server.close(); });
const call = (u, path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { cookie: cookieFor(u.id), 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });

test('codes: anyone of the same kind joins once; wrong, own and used codes fail', () => {
  const a = kid(), b = kid(), c = kid();
  const { match } = M.create(a, cc); const code = match.code;
  assert.match(match.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(M.joinByCode(b, 'zzzzzz').error, 'notFound');
  assert.equal(M.joinByCode(a, match.code).error, 'ownCode');
  assert.equal(M.joinByCode(b, 'AB').error, 'codeLength');
  const typed = ` ${M.showCode(match.code).toLowerCase()} `;
  assert.equal(M.joinByCode(b, typed).match.id, match.id);
  assert.equal(match.state, 'playing');
  assert.equal(M.joinByCode(c, code).error, 'notFound', 'a code works once');
});

test('kids and grown-ups never meet by code, except in their own family; blocking stops it too', () => {
  const g = grownup(), k = kid(), own = kid(); link(g, own);
  assert.equal(M.joinByCode(k, M.create(g, cc).match.code).error, 'notFound');
  assert.equal(M.joinByCode(g, M.create(k, cc).match.code).error, 'notFound');
  assert.ok(M.joinByCode(own, M.create(g, cc).match.code).match, 'a parent and their own child');
  const a = kid(), b = kid(); chat.block(b, a.id);
  assert.equal(M.joinByCode(b, M.create(a, cc).match.code).error, 'notFound');
});

test('invites go to friends and family only, and show in their inbox until answered', () => {
  const a = kid(), b = kid(), stranger = kid(), g = grownup(), sib = kid(); link(g, a); link(g, sib);
  befriend(a, b);
  const ids = M.people(a).map(p => p.id).sort();
  assert.deepEqual(ids, [b.id, g.id, sib.id].sort());
  assert.equal(M.create(a, cc, stranger.id).error, 'notFound');
  const { match } = M.create(a, cc, b.id);
  assert.equal(match.code, null);
  assert.deepEqual(M.inbox(b).map(i => i.id), [match.id]);
  assert.equal(M.inbox(stranger).length, 0);
  assert.equal(M.accept(stranger, match.id).error, 'gone');
  assert.equal(M.accept(b, match.id).match.id, match.id);
  assert.equal(M.inbox(b).length, 0);
  const second = M.create(a, cc, sib.id).match;
  assert.equal(M.decline(sib, second.id), true); assert.equal(second.state, 'ended');
});

test('a new match replaces the one still waiting', () => {
  const a = kid(); const one = M.create(a, cc).match; const two = M.create(a, cc).match;
  assert.equal(one.state, 'ended'); assert.equal(two.state, 'waiting');
  assert.equal(M.create(a, { id: 'x', slug: 'not-online' }).error, 'notOnline');
});

test('the relay carries numbers and booleans only, never text', () => {
  const a = kid(), b = kid(); const { match } = M.create(a, cc); M.joinByCode(b, match.code);
  assert.equal(M.send(a, match.id, 'mv', { g: 0, n: 0, f: 20, t: 52, p: 0 }).ok, true);
  for (const d of [{ g: 'hi' }, { m: ['a'] }, { long: 1 }, { a: -1 }, { a: 10000 }, { a: 1.5 }, { a: { b: 1 } }, 'text', null, [1], { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1 }])
    assert.equal(M.send(a, match.id, 'mv', d).error, 'bad', JSON.stringify(d));
  assert.equal(M.send(a, match.id, 'chat', { a: 1 }).error, 'bad');
  assert.equal(M.send(kid(), match.id, 'mv', { a: 1 }).error, 'gone', 'only its two players');
  assert.equal(M.send(b, match.id, 'act', { g: 0, a: 1, ok: true }).ok, true);
  const v = M.view(match, 1, 0);
  assert.deepEqual(v.ev.map(e => [e[1], e[2]]), [[0, 'mv'], [1, 'act']]);
});

test('strangers see a nickname and a made-up character; friends see names', () => {
  const a = kid(), b = kid(); const { match } = M.create(a, cc); M.joinByCode(b, match.code);
  const v = M.view(match, 0, 0, k => `nick:${k}`);
  assert.match(v.opp.name, /^nick:live\.nick\.\d+$/); assert.notEqual(v.opp.name, b.display_name);
  assert.equal(v.me.name, a.display_name);
  assert.ok(v.opp.character && v.opp.character.species);
  const c = kid(), d = kid(); befriend(c, d);
  const m2 = M.create(c, cc, d.id).match; M.accept(d, m2.id);
  assert.equal(M.view(m2, 0, 0).opp.name, d.display_name);
});

test('the long poll wakes when the other player moves, and leaving ends the match for both', async () => {
  const a = kid(), b = kid(); const { match } = M.create(a, cc); M.joinByCode(b, match.code);
  const got = new Promise(r => M.wait(a, match.id, 0, 'playing:0:1', r));
  M.send(b, match.id, 'mv', { g: 0, n: 0, f: 100, t: 68, p: 0 });
  const v = await got; assert.equal(v.ev.length, 1);
  assert.equal(M.leave(b, match.id), true);
  const v2 = await new Promise(r => M.wait(a, match.id, 1, 'playing:1:1', r));
  assert.equal(v2.state, 'ended'); assert.equal(v2.left, true);
  assert.equal(M.send(a, match.id, 'mv', { a: 1 }).error, 'notPlaying');
});

test('HTTP: make, join, relay; outsiders get the plain game; the frame gets BRB.match with the seat', async () => {
  const a = kid(), b = kid(), c = kid();
  let r = await call(a, '/api/match', { game: 'castle-clash' }); assert.equal(r.status, 200);
  const { id, redirect } = await r.json(); assert.equal(redirect, `/play/castle-clash?match=${id}`);
  const code = (await (await call(a, `/api/match/${id}/wait?after=0`)).json()).code;
  r = await call(b, '/api/match/join', { code }); assert.equal(r.status, 200);
  r = await call(b, `/api/match/${id}/send`, { k: 'mv', d: { g: 0, n: 0, f: 20, t: 52, p: 0 } }); assert.equal(r.status, 200);
  r = await call(b, `/api/match/${id}/send`, { k: 'mv', d: { g: 'hello' } }); assert.equal(r.status, 400);
  r = await call(c, `/api/match/${id}/wait?after=0`); assert.equal(r.status, 410);
  r = await call(c, `/play/castle-clash?match=${id}`); assert.equal(r.status, 302);
  r = await call(a, `/play/castle-clash?match=${id}`); assert.equal(r.status, 200);
  const page = await r.text();
  assert.match(page, /"match":\{"id":"[^"]+","seat":0\}/);
  const frameSrc = page.match(/data-src="(\/frame\/[^"]+)"/)[1];
  const frame = await (await call(a, frameSrc)).text();
  assert.match(frame, /"match":\{"v":1,"seat":0\}/);
  const plain = await (await call(a, '/play/castle-clash')).text();
  const plainFrame = await (await call(a, plain.match(/data-src="(\/frame\/[^"]+)"/)[1])).text();
  assert.doesNotMatch(plainFrame, /"match":\{"v":1/);
  assert.match(plain, /"online":true/, 'the play page lets the game open the Play online sheet');
  const atlas = await (await call(a, '/play/atlas-quest')).text();
  assert.match(atlas, /"online":false/);
  r = await call(a, '/api/match', { game: 'atlas-quest' }); assert.equal(r.status, 404, 'only games made for online play');
});

test('grown-ups may use the match APIs (to play their own children)', () => {
  for (const p of ['/api/match/people', '/api/match/inbox', '/api/match/abc/wait']) assert.equal(grownupMay('GET', p), true, p);
  for (const p of ['/api/match', '/api/match/join', '/api/match/abc/accept', '/api/match/abc/decline', '/api/match/abc/leave', '/api/match/abc/send']) assert.equal(grownupMay('POST', p), true, p);
});
