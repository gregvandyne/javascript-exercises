// "Share with my classes" (visibility 'class'): THE rule (canView and visibleWhere agree across a matrix of viewers and
// games, and again after every change that can stop sharing), every listing and per-game endpoint, publish validation,
// moderation (an approval keeps the audience the builder asked for), lifecycle cleanup, class pages and the teacher's
// "Take off this class", "Shared with", lessons and hand-in, the migration backfill and audit labels.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, createGuest, startSession, getUser } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const pub = await import('../../server/services/publish.js');
const chat = await import('../../server/services/chat.js');
const presence = await import('../../server/services/presence.js');
const mod = await import('../../server/services/moderation.js');
const shots = await import('../../server/services/shots.js');
const { studioState } = await import('../../server/routes/studio.js');
const { createApp } = await import('../../server/app.js');

let server, base;
// keepAliveTimeout 0: the worlds below make many bcrypt passwords, which can hold the event loop longer than the default
// 5s, and the server's idle timer would then close a kept-alive socket just as the next fetch reuses it (ECONNRESET).
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {}; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';
const boss = createUser({ username: 'ClsBoss', password: 'secret123', role: 'admin' });
const ids = rows => rows.map(r => r.id);
const fresh = g => games.getGame(g.id);
const isLive = g => g.status === 'published' && !!g.published_version_id && !g.hidden_reason;

/** A fresh school with the cast (each test gets its own, so changes don't leak between tests). */
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Oak ${k}` }).school, elm = S.createSchool(boss, { name: `Elm ${k}` }).school;
  const t1 = S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user;
  const A = S.createClass(t1, oak.id, { name: '5A' }).class, B = S.createClass(t1, oak.id, { name: '5B' }).class;
  const Arch = S.createClass(t1, oak.id, { name: 'Old class' }).class;
  const kid = (name, ...classes) => { const u = S.createSchoolAccount(t1, oak.id, { rosterName: name }).user; for (const c of classes) S.addToClass(t1, c.id, u.id); return getUser(u.id); };
  const O = kid('Olly Owner', A, B, Arch), kidA = kid('Ada Apple', A), kidB = kid('Bea Bloom', B), kidNone = kid('Nell None');
  const kidLeft = kid('Lou Left', A); S.removeFromClass(t1, A.id, kidLeft.id);
  const SA = createUser({ username: `SAdm${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const EA = createUser({ username: `EAdm${k}`, password: 'secret123' }); S.addMember(boss, elm.id, EA.id, 'admin');
  const T2 = S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user;
  const F = createUser({ username: `Fren${k}`, password: 'secret123' });
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',1),(?,?,'accepted',1)", O.id, F.id, F.id, O.id);
  const stranger = createUser({ username: `Strng${k}`, password: 'secret123' }), guest = createGuest();
  S.archiveClass(t1, Arch.id, true);
  return { k, oak, elm, t1: getUser(t1.id), A, B, Arch, O, kidA, kidB, kidNone, kidLeft, SA, EA, T2: getUser(T2.id), F, stranger, guest, kid };
}
/** A game set straight into a state (status/visibility/links), for the rule tests. classes: [[class, removedByTeacher?]]. */
function mkGame(owner, vis, { status = 'published', classes = [], hidden = '', title } = {}) {
  const g = games.createGame(owner.id, { title: title || `${vis} ${status} ${Math.random().toString(36).slice(2, 7)}` });
  const v = games.addVersion(g.id, GOOD, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run('UPDATE games SET visibility=?, status=?, published_version_id=?, hidden_reason=? WHERE id=?', vis, status, ['published', 'deleted', 'suspended'].includes(status) ? v.id : null, hidden, g.id);
  for (const [c, removed] of classes) q.run('INSERT INTO game_classes(game_id, class_id, added_by, added_at, removed_by, removed_at) VALUES (?,?,?,?,?,?)', g.id, c.id, owner.id, Date.now(), removed ? owner.id : null, removed ? Date.now() : null);
  return fresh(g);
}
/** A game with one clean version, made by its owner (not published yet). */
function draft(owner, title = 'Draft', safetyStatus = 'pass') {
  const g = games.createGame(owner.id, { title });
  games.addVersion(g.id, GOOD, { createdBy: owner.id, safetyStatus });
  return fresh(g);
}
/** THE agreement contract: for every non-admin viewer, visibleWhere lists g exactly when canView(u, g) && g is live;
 *  platform admins can open everything (their listings follow the normal rule). */
function checkMatrix(users, list, label) {
  for (const u of users) {
    const v = games.visibleWhere(u);
    const listed = new Set(q.all(`SELECT g.id FROM games g JOIN users u ON u.id=g.owner_id WHERE ${v.sql}`, ...v.params).map(r => r.id));
    for (const g0 of list) {
      const g = fresh(g0);
      assert.equal(listed.has(g.id), games.canView(u, g) && isLive(g), `${label}: ${u ? u.username : 'signed out'} × "${g.title}"`);
    }
  }
  for (const g of list) assert.equal(games.canView(boss, fresh(g)), true, `${label}: platform admin opens "${g.title}"`);
}

test('THE rule: canView and visibleWhere agree for every viewer × game, before and after every change that stops sharing', () => {
  const w = world(); const { A, B, Arch, O, kidA, kidB, kidNone, kidLeft, SA, EA, t1, T2, F, stranger, guest } = w;
  const list = [
    mkGame(O, 'class', { classes: [[A]], title: 'only 5A' }), mkGame(O, 'class', { classes: [[A], [B]], title: '5A and 5B' }),
    mkGame(O, 'class', { classes: [[B, true]], title: '5B taken off' }), mkGame(O, 'class', { classes: [[Arch]], title: 'archived class' }),
    mkGame(O, 'class', { title: 'no classes' }),
    ...['draft', 'in_review', 'rejected', 'suspended', 'deleted'].map(status => mkGame(O, 'class', { status, classes: [[A]] })),
    mkGame(O, 'class', { classes: [[A]], hidden: 'reports', title: 'hidden by reports' }),
    mkGame(O, 'private'), mkGame(O, 'friends'), mkGame(O, 'school'), mkGame(O, 'public'),
  ];
  const users = [null, guest, O, kidA, kidB, kidNone, kidLeft, SA, EA, t1, T2, F, stranger];
  checkMatrix(users, list, 'start');
  const [onlyA, both, takenOff, archived] = list;
  const sees = g => users.filter(u => u && games.canView(u, fresh(g))).map(u => u.id).sort();
  // Who sees a game shared with 5A: the owner, 5A's students and teacher, and the school's admin. Nobody else.
  assert.deepEqual(sees(onlyA), [O.id, kidA.id, SA.id, t1.id].sort());
  assert.deepEqual(sees(both), [O.id, kidA.id, kidB.id, SA.id, t1.id].sort());
  assert.deepEqual(sees(takenOff), [O.id], 'a teacher took it off 5B');
  assert.deepEqual(sees(archived), [O.id], 'an archived class sees nothing');
  for (const g of list) assert.equal(games.canView(null, fresh(g)), fresh(g).visibility === 'public' && isLive(fresh(g)), 'signed out: public only');

  // A viewer leaves the class: access stops at once.
  S.removeFromClass(t1, A.id, kidA.id); checkMatrix(users, list, 'viewer left 5A');
  assert.equal(games.canView(kidA, fresh(onlyA)), false);
  S.addToClass(t1, A.id, kidA.id); assert.equal(games.canView(kidA, fresh(onlyA)), true);
  // A class is archived, then restored: sharing stops, then comes back (archiving keeps everything).
  S.archiveClass(t1, B.id, true); checkMatrix(users, list, '5B archived');
  assert.equal(games.canView(kidB, fresh(both)), false);
  S.archiveClass(t1, B.id, false); assert.equal(games.canView(kidB, fresh(both)), true);
  // The school is archived (no UI yet): nothing is shared.
  q.run('UPDATE schools SET archived_at=1 WHERE id=?', w.oak.id); checkMatrix(users, list, 'school archived');
  assert.deepEqual(sees(both), [O.id]);
  q.run('UPDATE schools SET archived_at=NULL WHERE id=?', w.oak.id);
  // A teacher takes a game off a class.
  assert.ok(S.removeClassGame(t1, A.id, both.id).ok); checkMatrix(users, list, '5A taken off');
  assert.equal(games.canView(kidA, fresh(both)), false); assert.equal(games.canView(kidB, fresh(both)), true);
  // A viewer is removed from the school (still marked as in the class only through history).
  S.removeMember(boss, w.oak.id, kidB.id); checkMatrix(users, list, 'viewer left the school');
  assert.equal(games.canView(kidB, fresh(both)), false);
  // The owner leaves a class: that class stops at once, the others go on, and coming back re-shares nothing.
  S.removeFromClass(t1, A.id, O.id); checkMatrix(users, list, 'owner left 5A');
  assert.equal(games.canView(kidA, fresh(onlyA)), false);
  S.addToClass(t1, A.id, O.id); checkMatrix(users, list, 'owner came back to 5A');
  assert.equal(games.canView(kidA, fresh(onlyA)), false, 'explicit lists: joining again shares nothing by itself');
  // The listing query only uses indexes (no full scan of game_classes or class_members).
  const v = games.visibleWhere(kidA);
  const plan = q.all(`EXPLAIN QUERY PLAN SELECT g.id FROM games g JOIN users u ON u.id=g.owner_id WHERE ${v.sql}`, ...v.params).map(r => r.detail).join('\n');
  assert.doesNotMatch(plan, /SCAN (gc|game_classes|m|class_members|sm|school_members|c|classrooms)\b/, plan);
});

test("THE rule for 'family' (a grown-up builder's game): canView and visibleWhere agree for every viewer, linked or not", () => {
  const k = ++worlds;
  const P = createUser({ username: `FamOwner${k}`, password: 'a-long-password-1', accountType: 'grownup' });
  const P2 = createUser({ username: `FamOther${k}`, password: 'a-long-password-1', accountType: 'grownup' });
  const fam = `fam${k}`, fam2 = `fam${k}b`, t = Date.now();
  q.run('INSERT INTO families(id, owner_id, created_at) VALUES (?,?,?), (?,?,?)', fam, P.id, t, fam2, P2.id, t);
  const child = createUser({ username: `FamKid${k}`, password: 'secret123' }), gone = createUser({ username: `FamGone${k}`, password: 'secret123' });
  const asked = createUser({ username: `FamAsked${k}`, password: 'secret123' }), theirs = createUser({ username: `FamTheirs${k}`, password: 'secret123' });
  const outsider = createUser({ username: `FamOut${k}`, password: 'secret123' }), guest = createGuest();
  const link = (f, c, status, unlinked = null) => q.run('INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at, unlinked_at) VALUES (?,?,?,?,?,?)', f, c.id, status, t, status === 'linked' ? t : null, unlinked);
  link(fam, child, 'linked'); link(fam, gone, 'linked', t); link(fam, asked, 'pending'); link(fam2, theirs, 'linked');
  const list = [mkGame(P, 'family', { title: 'family live' }), mkGame(P, 'family', { status: 'draft', title: 'family draft' }),
    mkGame(P, 'family', { hidden: 'reports', title: 'family hidden' }), mkGame(P2, 'family', { title: 'other family' }), mkGame(P, 'friends', { title: 'connections' })];
  const users = [null, guest, P, P2, child, gone, asked, theirs, outsider];
  checkMatrix(users, list, 'family');
  const sees = g => users.filter(u => u && games.canView(u, fresh(g))).map(u => u.id).sort();
  assert.deepEqual(sees(list[0]), [P.id, child.id].sort(), 'the owner and their linked child, nobody else');
  assert.deepEqual(sees(list[3]), [P2.id, theirs.id].sort());
  assert.deepEqual(sees(list[4]), [P.id], 'a grown-up\'s connections game never reaches their child');
  assert.equal(games.canView(boss, fresh(list[0])), true, 'the platform admin');
  // The child is unlinked: gone at once.
  q.run('UPDATE family_children SET unlinked_at=? WHERE family_id=? AND child_id=?', t, fam, child.id); checkMatrix(users, list, 'child unlinked');
  assert.equal(games.canView(child, fresh(list[0])), false);
});

test('every listing respects it: rails, categories, profiles, playing now, favorites, search, builders, similar, friends', async () => {
  const w = world(); const { A, O, kidA, kidB, F } = w;
  const cleo = w.kid('Cleo Class', A);   // a builder whose only game is a class game
  const g = mkGame(cleo, 'class', { classes: [[A]], title: 'Zebra Dash Xq' });
  q.run('UPDATE games SET plays=999999 WHERE id=?', g.id);   // top of the popular rails
  const pubGame = mkGame(O, 'public', { title: 'Open Zebra Xq' });
  const has = (rows, x = g) => ids(rows).includes(x.id);
  for (const [u, yes] of [[kidA, true], [kidB, false], [null, false], [F, false], [w.guest, false]]) {
    const who = u ? u.username : 'signed out';
    assert.equal(has(games.listVisible(u, { limit: 500 })), yes, `rails: ${who}`);
    assert.equal(has(games.listVisible(u, { category: g.category, limit: 500 })), yes, `category: ${who}`);
    assert.equal(has(games.listVisible(u, { ownerId: cleo.id })), yes, `profile: ${who}`);
    assert.equal(has(games.search(u, { text: 'Zebra Dash Xq' })), yes, `search: ${who}`);
    assert.equal(games.searchBuilders(u, cleo.username).length, yes ? 1 : 0, `builder search: ${who}`);
    assert.equal(has(games.similar(u, pubGame, 50)), yes, `similar: ${who}`);
  }
  presence.touch(g.id, 'sess-a', kidA.id);
  assert.ok(has(games.playingNow(kidA, 50))); assert.ok(!has(games.playingNow(kidB, 50))); assert.ok(!has(games.playingNow(null, 50)));
  assert.equal(has(games.fromFriends(F, 50)), false, 'friends rails never list a class game');
  // Favorites drop off when the viewer leaves the class (and others never see them on the profile).
  games.toggleLike(g.id, kidA.id);
  assert.ok(has(games.favorites(kidA, kidA.id))); assert.ok(!has(games.favorites(kidB, kidA.id))); assert.ok(!has(games.favorites(null, kidA.id)));
  // HTTP: home, search, the API, profiles.
  const slug = new RegExp(`/g/${g.slug}"`);
  assert.match((await as(kidA)('/')).text, slug, 'a classmate gets it on Home');
  assert.doesNotMatch((await as(kidB)('/')).text, slug); assert.doesNotMatch((await as(null)('/')).text, slug);
  assert.match((await as(kidA)('/search?q=Zebra%20Dash%20Xq')).text, slug);
  assert.doesNotMatch((await as(kidB)('/search?q=Zebra%20Dash%20Xq')).text, slug); assert.doesNotMatch((await as(null)('/search?q=Zebra%20Dash%20Xq')).text, slug);
  const api = async u => JSON.stringify((await as(u)('/api/search?q=Zebra%20Dash%20Xq')).json);
  assert.match(await api(kidA), new RegExp(g.id)); assert.doesNotMatch(await api(kidB), new RegExp(g.id)); assert.doesNotMatch(await api(null), new RegExp(g.id));
  assert.match((await as(kidA)(`/u/${cleo.username}`)).text, slug);
  assert.doesNotMatch((await as(kidB)(`/u/${cleo.username}`)).text, slug); assert.doesNotMatch((await as(null)(`/u/${cleo.username}`)).text, slug);
  assert.match((await as(kidA)('/')).text, /Class only/, 'cards say it is a class game');
  // Friends page and chat: a friend outside the class never gets it.
  const og = mkGame(O, 'class', { classes: [[A]], title: 'Olly Class Xq' });
  assert.doesNotMatch((await as(F)('/friends')).text, new RegExp(`/g/${og.slug}"`));
  assert.equal(chat.send(O, F, { kind: 'game', body: og.id }).code, 'game_hidden');
  assert.doesNotMatch((await as(O)(`/chat/${F.username}`)).text, new RegExp(og.id), 'not offered in the chat share list');
  S.removeFromClass(w.t1, A.id, kidA.id);
  assert.ok(!has(games.favorites(kidA, kidA.id)), 'left the class: gone from favorites too');
  presence._reset();
});

test('every per-game endpoint: 404 for outsiders, works for classmates; frame tokens and pictures follow the rule', async () => {
  const w = world(); const { A, O, kidA, kidB } = w;
  const g = mkGame(O, 'class', { classes: [[A]], title: 'Endpoint Game' });
  const a = as(kidA), b = as(kidB), anon = as(null);
  assert.equal((await b(`/g/${g.slug}`)).status, 404); assert.equal((await anon(`/g/${g.slug}`)).status, 404);
  assert.equal((await a(`/g/${g.slug}`)).status, 200);
  assert.equal((await b(`/play/${g.slug}`)).status, 404); assert.equal((await anon(`/play/${g.slug}`)).status, 404);
  const play = await a(`/play/${g.slug}`); assert.equal(play.status, 200);
  const tok = play.text.match(/\/frame\/([A-Za-z0-9_.-]+)/)[1];
  const frame = u => fetch(`${base}/frame/${tok}`, { headers: u ? { cookie: cookieFor(u.id) } : {} });
  assert.equal((await frame(kidA)).status, 200);
  assert.equal((await frame(kidB)).status, 403, "a classmate's frame link is useless to anyone else");
  // A picture of the live version: classmates only, never cached publicly.
  const v = g.published_version_id; fs.mkdirSync(shots.DIR, { recursive: true });
  q.run('UPDATE game_versions SET shot_at=1 WHERE id=?', v); fs.writeFileSync(shots.fileFor(v), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  try {
    assert.equal((await b(`/shots/${v}.jpg`)).status, 404); assert.equal((await anon(`/shots/${v}.jpg`)).status, 404);
    const r = await a(`/shots/${v}.jpg`); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /^private/);
  } finally { fs.rmSync(shots.fileFor(v), { force: true }); }
  // The game APIs.
  const calls = [['POST', 'rate', { stars: 4 }], ['POST', 'like', {}], ['POST', 'play', {}], ['POST', 'heartbeat', {}], ['POST', 'save', { data: { k: 'v' } }],
    ['GET', 'save'], ['POST', 'score', { score: 5 }], ['GET', 'leaderboard'], ['POST', 'report', { reason: 'other' }]];
  for (const [method, p, body] of calls) assert.equal((await b(`/api/games/${g.id}/${p}`, { method, body })).status, 404, `${method} ${p} (outsider)`);
  for (const [method, p, body] of calls) assert.equal((await a(`/api/games/${g.id}/${p}`, { method, body })).status, 200, `${method} ${p} (classmate)`);
  // Leaving the class: the next frame load (and everything else) is a 404.
  S.removeFromClass(w.t1, A.id, kidA.id);
  assert.equal((await frame(kidA)).status, 404);
  assert.equal((await a(`/g/${g.slug}`)).status, 404);
  presence._reset();
});

test('publishing: class needs at least one of my own live classes; school rules and who gets the option', async () => {
  const w = world(); const { A, B, Arch, O, t1, kidNone } = w;
  const C = S.createClass(t1, w.oak.id, { name: '5C' }).class;   // O isn't in it
  const elmClass = S.createClass(boss, w.elm.id, { name: 'Elm 1', teacherId: 'none' }).class;
  S.addToClass(t1, C.id, O.id); S.removeFromClass(t1, C.id, O.id);   // O left 5C
  const g = draft(O, 'Pick test');
  const code = async classIds => (await pub.publish(O, g.id, 'class', { classIds })).code;
  assert.equal(await code([]), 'pickClass');
  assert.equal(await code('nope'), 'pickClass');
  assert.equal(await code([A.id, 5]), 'pickClass');
  assert.equal(await code(Array.from({ length: 51 }, (_, i) => `x${i}`)), 'pickClass');
  for (const c of [elmClass, Arch, C]) assert.equal(await code([c.id]), 'classGone', c.name);
  assert.equal(await code(['no-such-class']), 'classGone', 'the same answer for a class that does not exist');
  const r = await pub.publish(O, g.id, 'class', { classIds: [A.id, A.id, ` ${A.id} `] });
  assert.equal(r.state, 'live'); assert.match(r.message, /Live for 5A/);
  assert.deepEqual(S.gameClassIds(g.id), [A.id], 'duplicates folded');
  assert.ok(S.removeClassGame(t1, A.id, g.id).ok);
  const blocked = await pub.publish(O, g.id, 'class', { classIds: [A.id, B.id] });
  assert.equal(blocked.code, 'classRemoved'); assert.match(blocked.message, /took this game off 5A/);
  // Who gets the option: anyone in a live class (student or teacher), under either school setting; not without a class.
  assert.ok(!S.sharingOptions(kidNone).includes('class'));
  assert.deepEqual(S.sharingOptions(O), ['private', 'friends', 'class', 'school'], 'school accounts keep games in the school by default');
  S.updateSchool(boss, w.oak.id, { settings: { publishing: 'public' } });
  assert.deepEqual(S.sharingOptions(getUser(O.id)), ['private', 'friends', 'class', 'school', 'public']);
  assert.ok(S.sharingOptions(t1).includes('class'), 'teachers can share with their classes');
  const own = createUser({ username: `OwnKid${w.k}`, password: 'secret123' });
  S.requestJoin(own, A.join_code); S.approveRequest(t1, S.pendingRequests(A.id).find(x => x.user_id === own.id).id, { rosterName: 'Own Kid' });
  assert.deepEqual(S.sharingOptions(getUser(own.id)), ['private', 'friends', 'class', 'school', 'public'], 'a student who joined with their own account');
  assert.equal((await pub.publish(kidNone, draft(kidNone).id, 'class', { classIds: [A.id] })).message, "You can only share with classes you're in right now.");
});

test('Studio APIs: publish and visibility take classIds; the state carries classShare and what a waiting review is for', async () => {
  const w = world(); const { A, B, t1 } = w;
  // A student with their own account, in 5A and 5B at Oak and in Elm Art at another school.
  const O = createUser({ username: `TwoSchools${w.k}`, password: 'secret123' });
  S.requestJoin(O, A.join_code); S.approveRequest(t1, S.pendingRequests(A.id).find(x => x.user_id === O.id).id, { rosterName: 'Two Schools' });
  assert.equal(S.requestJoin(O, B.join_code).state, 'joined', 'already at the school: straight in');
  const D = S.createClass(boss, w.elm.id, { name: 'Elm Art', teacherId: 'none' }).class;
  S.addMember(boss, w.elm.id, O.id, 'student'); S.addToClass(boss, D.id, O.id);
  const g = draft(O, 'Studio class game');
  const st = as(O);
  let r = await st(`/api/studio/${g.id}/publish`, { method: 'POST', body: { visibility: 'class' } });
  assert.equal(r.status, 400); assert.equal(r.json.error, 'Pick at least one of your classes.');
  r = await st(`/api/studio/${g.id}/publish`, { method: 'POST', body: { visibility: 'class', classIds: [A.id, B.id] } });
  assert.equal(r.status, 200); assert.match(r.json.message, /Live for your classes/);
  const cs = r.json.state.classShare;
  assert.deepEqual(cs.classes.map(c => [c.name, c.chosen, c.removed]).sort(), [['5A', true, false], ['5B', true, false], ['Elm Art', false, false]].sort());
  assert.equal(cs.multiSchool, true); assert.deepEqual(cs.live.map(c => c.name).sort(), ['5A', '5B']); assert.equal(cs.lost, 0);
  assert.ok(r.json.state.shareOptions.includes('class')); assert.equal(r.json.state.status.label, 'Live: 🎒 My classes');
  r = await st(`/api/studio/${g.id}/visibility`, { method: 'POST', body: { visibility: 'class', classIds: [B.id] } });
  assert.equal(r.status, 200); assert.deepEqual(S.gameClassIds(g.id), [B.id]); assert.equal(r.json.state.status.label, 'Live: 🎒 My class');
  r = await st(`/api/studio/${g.id}/visibility`, { method: 'POST', body: { visibility: 'class', classIds: 'B' } });
  assert.equal(r.status, 400);
  // Switching away keeps the list (it only counts while visibility is 'class'), so it is pre-ticked next time.
  r = await st(`/api/studio/${g.id}/visibility`, { method: 'POST', body: { visibility: 'friends' } });
  assert.equal(r.json.state.game.visibility, 'friends'); assert.deepEqual(S.gameClassIds(g.id), [B.id]); assert.deepEqual(r.json.state.classShare.live, []);
  assert.equal(games.canView(w.kidB, fresh(g)), false, 'the list does nothing while the game is friends-only');
  // Update keeps the class list.
  await st(`/api/studio/${g.id}/visibility`, { method: 'POST', body: { visibility: 'class', classIds: [A.id, B.id] } });
  games.addVersion(g.id, GOOD.replace('win', 'coin'), { createdBy: O.id, safetyStatus: 'pass' });
  r = await st(`/api/studio/${g.id}/update`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.deepEqual(S.gameClassIds(g.id).sort(), [A.id, B.id].sort());
  // Taken off by a teacher, and a class the owner left: shown as removed / counted as lost.
  S.removeClassGame(t1, A.id, g.id); S.removeFromClass(boss, D.id, O.id);
  const s2 = studioState(O, g.id);
  assert.deepEqual(s2.classShare.classes.find(c => c.id === A.id), { id: A.id, name: '5A', school: w.oak.name, chosen: false, removed: true });
  assert.deepEqual(s2.classShare.live.map(c => c.name), ['5B']);
  // pending.visibility says what a waiting review is for.
  const fl = draft(O, 'Flagged studio', 'flag');
  r = await st(`/api/studio/${fl.id}/publish`, { method: 'POST', body: { visibility: 'class', classIds: [B.id] } });
  assert.equal(r.status, 200); assert.equal(r.json.state.pending.visibility, 'class');
});

test("moderation: a flagged class or school version waits for a person, and approving keeps the audience (never public)", async () => {
  const w = world(); const { A, B, O, kidA, kidB } = w;
  const g = draft(O, 'Flagged class', 'flag');
  let r = await pub.publish(O, g.id, 'class', { classIds: [A.id] });
  assert.equal(r.state, 'in_review'); assert.equal(fresh(g).pending_visibility, 'class'); assert.deepEqual(S.gameClassIds(g.id), [A.id]);
  assert.equal(games.canView(kidA, fresh(g)), false, 'not live yet');
  const item = mod.reviewQueue().find(x => x.game.id === g.id);
  assert.equal(item.audience, 'class'); assert.deepEqual(item.classes, ['5A']);
  assert.match((await as(boss)('/admin?tab=queue')).text, /Waiting to share with: <b>🎒 5A<\/b>/);
  let a = pub.approve(boss, g.id, 'ok');
  assert.equal(a.visibility, 'class'); assert.equal(a.pending_visibility, '');
  assert.equal(games.canView(kidA, a), true); assert.equal(games.canView(null, a), false); assert.equal(games.canView(kidB, a), false);
  // That approval was for 5A only: sharing the same flagged version more widely needs a new look, and the wider list
  // doesn't reach anyone until a person approves it.
  r = await pub.setVisibility(getUser(O.id), g.id, 'class', undefined, [A.id, B.id]);
  assert.equal(r.state, 'in_review', 'adding a class needs a person'); assert.equal(games.canView(kidB, fresh(g)), false, 'not before approval');
  assert.equal(games.canView(kidA, fresh(g)), true, 'still live for 5A meanwhile'); assert.deepEqual(S.gameClassIds(g.id), [A.id]);
  assert.deepEqual(mod.reviewQueue().find(x => x.game.id === g.id).classes, ['5A', '5B'], 'the queue shows what is asked');
  a = pub.approve(boss, g.id, 'ok both');
  assert.equal(games.canView(kidB, a), true); assert.deepEqual(S.gameClassIds(g.id).sort(), [A.id, B.id].sort());
  r = await pub.setVisibility(getUser(O.id), g.id, 'school');
  assert.equal(r.state, 'in_review', 'a class approval never covers the whole school');
  r = await pub.setVisibility(getUser(O.id), g.id, 'class', undefined, [B.id]);
  assert.equal(r.state, 'live', 'narrowing inside the approved classes is instant');
  // Reject clears what the review was for.
  const g2 = draft(O, 'Flagged reject', 'flag');
  await pub.publish(O, g2.id, 'class', { classIds: [A.id] });
  assert.equal(pub.reject(boss, g2.id, 'no').pending_visibility, '');
  // The old leak: a flagged 'school' game from a school that keeps games inside the school went public on approval.
  const g3 = draft(O, 'Flagged school', 'flag');
  r = await pub.publish(O, g3.id, 'school');
  assert.equal(r.state, 'in_review'); assert.equal(fresh(g3).pending_visibility, 'school');
  a = pub.approve(boss, g3.id);
  assert.equal(a.visibility, 'school'); assert.equal(games.canView(null, a), false, 'still not public');
  // class -> public while unapproved: it stays live for the classes until approved, then goes public.
  const g4 = draft(O, 'Class then public');
  await pub.publish(O, g4.id, 'class', { classIds: [A.id] });
  S.updateSchool(boss, w.oak.id, { settings: { publishing: 'public' } });
  r = await pub.setVisibility(getUser(O.id), g4.id, 'public');
  assert.equal(r.state, 'in_review'); assert.equal(fresh(g4).visibility, 'class'); assert.equal(fresh(g4).pending_visibility, 'public');
  assert.equal(games.canView(kidA, fresh(g4)), true); assert.equal(games.canView(null, fresh(g4)), false);
  // If the school stops public sharing before the approval, the approval narrows to the school (never wider than allowed).
  S.updateSchool(boss, w.oak.id, { settings: { publishing: 'school' } });
  a = pub.approve(boss, g4.id);
  assert.equal(a.visibility, 'school'); assert.equal(games.canView(null, a), false);
  S.updateSchool(boss, w.oak.id, { settings: { publishing: 'public' } });
  const g5 = draft(O, 'Class then public 2');
  await pub.publish(getUser(O.id), g5.id, 'class', { classIds: [B.id] });
  await pub.setVisibility(getUser(O.id), g5.id, 'public');
  assert.equal(pub.approve(boss, g5.id).visibility, 'public');
  assert.equal(games.canView(null, fresh(g5)), true);
});

test("Studio Update never turns a waiting school request into a public one (own-account student in a school)", async () => {
  const w = world(); const { A } = w;
  const own = createUser({ username: `OwnUpd${w.k}`, password: 'secret123' });
  S.requestJoin(own, A.join_code); S.approveRequest(w.t1, S.pendingRequests(A.id).find(x => x.user_id === own.id).id, { rosterName: 'Own Updater' });
  const g = draft(own, 'Own school game');
  await pub.publish(own, g.id, 'friends');
  games.addVersion(g.id, GOOD.replace('win', 'jump'), { createdBy: own.id, safetyStatus: 'flag' });
  await pub.publish(own, g.id, 'school');
  assert.equal(fresh(g).pending_visibility, 'school'); assert.equal(fresh(g).visibility, 'friends');
  games.addVersion(g.id, GOOD.replace('win', 'hop'), { createdBy: own.id, safetyStatus: 'flag' });
  const r = await as(own)(`/api/studio/${g.id}/update`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.match(r.json.message, /more people can play/);
  assert.equal(fresh(g).pending_visibility, 'school', 'still a school request, not public');
  assert.equal(mod.reviewQueue().find(x => x.game.id === g.id).audience, 'school');
});

test('lifecycle: leaving, moving, removal from the school, archive, class and game deletion, merges', async () => {
  const w = world(); const { A, B, O, kidA, kidB, t1 } = w;
  const g = mkGame(O, 'class', { classes: [[A], [B]] });
  const links = () => q.all('SELECT class_id, removed_at FROM game_classes WHERE game_id=? ORDER BY class_id', g.id);
  // Moved from 5B to 5C: the 5B link goes; 5A stays.
  const C = S.createClass(t1, w.oak.id, { name: '5C' }).class;
  assert.ok(S.moveStudent(t1, B.id, C.id, O.id).ok);
  assert.deepEqual(links().map(l => l.class_id), [A.id]); assert.equal(games.canView(kidB, fresh(g)), false); assert.equal(games.canView(kidA, fresh(g)), true);
  // Removed from the school: every link to its classes goes (taken-off rows stay as the record).
  const g2 = mkGame(O, 'class', { classes: [[A], [C, true]] });
  S.removeMember(boss, w.oak.id, O.id);
  assert.deepEqual(links(), []); assert.deepEqual(q.all('SELECT class_id FROM game_classes WHERE game_id=?', g2.id).map(r => r.class_id), [C.id]);
  assert.equal(games.canView(kidA, fresh(g2)), false);
  // A class is deleted (only possible before it ever had students): its links go.
  const staff = S.createClass(t1, w.oak.id, { name: 'Staff room' }).class; S.addToClass(t1, staff.id, w.T2.id, 'teacher');
  const tg = mkGame(t1, 'class', { classes: [[staff]] });
  assert.equal(games.canView(w.T2, fresh(tg)), true, 'a teacher can share with a class they teach');
  assert.ok(S.deleteClass(t1, staff.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM game_classes WHERE class_id=?', staff.id).n, 0); assert.equal(games.canView(w.T2, fresh(tg)), false);
  // A game is deleted: links and any waiting request go.
  const w2 = world();
  const dg = draft(w2.O, 'Delete me', 'flag');
  await pub.publish(w2.O, dg.id, 'class', { classIds: [w2.A.id] });
  games.deleteGame(dg.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM game_classes WHERE game_id=?', dg.id).n, 0); assert.equal(fresh(dg).pending_visibility, '');
  // A school account merged into the student's own account: games and class places move together, sharing goes on.
  const max = w2.kid('Max Merge', w2.A);
  const mg = mkGame(max, 'class', { classes: [[w2.A]] });
  const own = createUser({ username: `MaxOwn${w2.k}`, password: 'secret123' });
  S.requestJoin(own, w2.A.join_code);
  assert.ok(S.approveRequest(w2.t1, S.pendingRequests(w2.A.id).find(x => x.user_id === own.id).id, { sameAs: max.id }).ok);
  assert.equal(fresh(mg).owner_id, own.id); assert.equal(games.canView(w2.kidA, fresh(mg)), true);
  // A link to a class the merged places say the student left goes (so it can't come back by itself later).
  const lou = w2.kid('Lou Merge', w2.A, w2.B); const lg = mkGame(lou, 'class', { classes: [[w2.A], [w2.B]] });
  S.removeFromClass(w2.t1, w2.B.id, lou.id);
  const own2 = createUser({ username: `LouOwn${w2.k}`, password: 'secret123' });
  S.requestJoin(own2, w2.B.join_code); const rq = S.pendingRequests(w2.B.id).find(x => x.user_id === own2.id);
  q.run("INSERT INTO class_members(class_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',1)", w2.B.id, own2.id);   // (in 5B already, oddly)
  q.run('INSERT INTO game_classes(game_id, class_id, added_by, added_at) VALUES (?,?,?,1)', lg.id, w2.B.id, lou.id);
  assert.ok(S.approveRequest(w2.t1, rq.id, { sameAs: lou.id }).ok);
  assert.deepEqual(S.gameClassIds(lg.id), [w2.A.id]);
});

test('class pages: "Games from our class" for students, the Games tab for teachers, take off and put back (audited)', async () => {
  const w = world(); const { A, B, O, kidA, kidB, t1 } = w;
  const g = mkGame(O, 'class', { classes: [[A]], title: 'Our Class Game' }), gB = mkGame(O, 'class', { classes: [[B]], title: 'Only Bee Game' });
  let r = await as(kidA)(`/class/${A.id}`);
  assert.equal(r.status, 200); assert.match(r.text, /Games from our class/); assert.match(r.text, new RegExp(`/g/${g.slug}"`)); assert.doesNotMatch(r.text, new RegExp(gB.slug));
  r = await as(w.kidNone)(`/class/${A.id}`); assert.equal(r.status, 404);
  const empty = await as(kidB)(`/class/${B.id}`); assert.match(empty.text, new RegExp(`/g/${gB.slug}"`));
  r = await as(t1)(`/class/${A.id}?tab=games`);
  assert.equal(r.status, 200); assert.match(r.text, /aria-current="page"><span aria-hidden="true">🎮<\/span> Games/);
  assert.match(r.text, /Olly Owner/, 'staff see the real name'); assert.match(r.text, new RegExp(`/api/classes/${A.id}/games/${g.id}/remove`));
  assert.match((await as(w.SA)(`/class/${A.id}?tab=games`)).text, /Our Class Game/, 'school admins see it too');
  // Not a manager, or not on this class: 404.
  assert.equal((await as(kidA)(`/api/classes/${A.id}/games/${g.id}/remove`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await as(t1)(`/api/classes/${A.id}/games/${gB.id}/remove`, { method: 'POST', body: {} })).status, 404);
  r = await as(t1)(`/api/classes/${A.id}/games/${g.id}/remove`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.equal(r.json.toast, 'Taken off 5A.');
  assert.equal(games.canView(kidA, fresh(g)), false); assert.doesNotMatch((await as(kidA)(`/class/${A.id}`)).text, new RegExp(g.slug));
  const row = q.get("SELECT * FROM audit_log WHERE action='class.game_remove' AND target=? ORDER BY created_at DESC", A.id);
  assert.equal(row.actor_id, t1.id); assert.deepEqual(JSON.parse(row.details), { game: g.id, owner: O.id });
  assert.equal((await pub.publish(O, g.id, 'class', { classIds: [A.id] })).code, 'classRemoved', "the owner can't put it back");
  r = await as(t1)(`/class/${A.id}?tab=games`); assert.match(r.text, /1 game taken off/); assert.match(r.text, /No games shared with this class yet/);
  r = await as(t1)(`/api/classes/${A.id}/games/${g.id}/restore`, { method: 'POST', body: {} });
  // "Allow again" only lifts the block: the class does not get the game back until its owner chooses it again.
  assert.equal(r.status, 200); assert.equal(games.canView(kidA, fresh(g)), false, 'no audience grows without the owner');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='class.game_restore' AND target=?", A.id));
  assert.equal((await pub.publish(O, g.id, 'class', { classIds: [A.id] })).ok, true, 'the owner may pick it again');
  assert.equal(games.canView(kidA, fresh(g)), true);
  assert.equal((await as(t1)(`/api/classes/${A.id}/games/${g.id}/restore`, { method: 'POST', body: {} })).status, 404, 'nothing to put back');
  // An archived class lists nothing.
  S.archiveClass(t1, A.id, true);
  assert.match((await as(t1)(`/class/${A.id}?tab=games`)).text, /No games shared with this class yet/);
  // The audit log shows names.
  const log = mod.auditLog(50).find(x => x.action === 'class.game_remove' && x.target === A.id);
  assert.match(log.targetLabel, /5A/); assert.match(log.detailsLabel, /game: Our Class Game · owner: @/);
});

test('"Shared with" on the game page: everyone sees their own classes and a count of the others; the owner sees all', async () => {
  const w = world(); const { A, B, O, kidA, kidB, SA } = w;
  const g = mkGame(O, 'class', { classes: [[A], [B]], title: 'Shared With Game' });
  assert.deepEqual(games.classNamesFor(fresh(g), kidB), { names: ['5B'], others: 1 });
  assert.deepEqual(games.classNamesFor(fresh(g), kidA), { names: ['5A'], others: 1 });
  assert.deepEqual(games.classNamesFor(fresh(g), O), { names: ['5A', '5B'], others: 0 });
  assert.deepEqual(games.classNamesFor(fresh(g), SA), { names: ['5A', '5B'], others: 0 }, 'the school admin');
  assert.deepEqual(games.classNamesFor(fresh(g), boss), { names: ['5A', '5B'], others: 0 });
  let r = await as(kidB)(`/g/${g.slug}`);
  assert.match(r.text, /Shared with:/); assert.match(r.text, /<li dir="auto">5B<\/li>/); assert.doesNotMatch(r.text, />5A</); assert.match(r.text, /and 1 other class/);
  r = await as(O)(`/g/${g.slug}`); assert.match(r.text, />5A</); assert.match(r.text, />5B</); assert.match(r.text, /🎒 My classes/);
  assert.equal(games.classNamesFor(mkGame(O, 'public'), O), null);
  assert.match(r.text, /Only the classes this game is shared with can open this link/);
});

test('lessons: class games play only in their classes, the picker and the AI catalog, hand-in shares with the class', async () => {
  const w = world(); const { A, B, O, t1, T2 } = w;
  const g = mkGame(O, 'class', { classes: [[A]], title: 'Zorblax Quest' });
  const lesson = L.createLesson(t1, w.oak.id, { title: 'Zorblax day' }).lesson;
  const step = L.addStep(t1, lesson.id, { kind: 'game', gameId: g.id }).step;
  const s = L.steps(lesson.id).find(x => x.id === step.id);
  assert.equal(L.playableBy(s, w.oak.id, A.id), true); assert.equal(L.playableBy(s, w.oak.id, B.id), false);
  assert.equal(L.playableBy(s, w.oak.id), false, 'no class, no play');
  const pick = L.gamesForPicker(t1, w.oak.id);
  assert.ok(ids(pick.classes).includes(g.id)); assert.ok(!ids(pick.school).includes(g.id)); assert.ok(!ids(pick.site).includes(g.id));
  assert.ok(!ids(L.gamesForPicker(T2, w.oak.id).classes).includes(g.id), "a teacher who doesn't teach 5A");
  // The AI lesson draft never gets class games (the template draft picks catalog games whose title matches the topic).
  let r = await as(t1)('/api/lessons/draft', { method: 'POST', body: { schoolId: w.oak.id, topic: 'Zorblax' } });
  assert.equal(r.status, 200);
  const drafted = r.json.redirect.split('/')[3].split('?')[0];
  assert.ok(!L.steps(drafted).some(x => x.game_id === g.id));
  // The lesson editor: a colleague who can't open the game sees neither its title nor a link.
  L.updateLesson(t1, lesson.id, { shared: true });
  r = await as(T2)(`/teach/lessons/${lesson.id}`);
  assert.equal(r.status, 200); assert.match(r.text, /A game you can&#39;t open|A game you can't open/); assert.doesNotMatch(r.text, /Zorblax Quest/);
  assert.match((await as(t1)(`/teach/lessons/${lesson.id}`)).text, /Only the classes it&#39;s shared with can play it|Only the classes it's shared with can play it/);
  // Hand-in shares with the lesson's class (not the whole school), and adds the class to a class game's list.
  const build = L.addStep(t1, lesson.id, { kind: 'build', body: 'make a game' }).step;
  const clB = L.assign(t1, B.id, lesson.id).classLesson, clA = L.assign(t1, A.id, lesson.id).classLesson;
  r = await as(O)(`/api/progress/${clB.id}/${build.id}/build`, { method: 'POST', body: {} });
  const gid = r.json.redirect.split('/')[2].split('?')[0];
  games.addVersion(gid, GOOD, { createdBy: O.id, safetyStatus: 'pass' });
  r = await as(O)(`/api/progress/${clB.id}/${build.id}/hand-in`, { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal(games.getGame(gid).visibility, 'class'); assert.deepEqual(S.gameClassIds(gid), [B.id]);
  assert.equal(games.canView(w.kidB, games.getGame(gid)), true); assert.equal(games.canView(w.kidNone, games.getGame(gid)), false, 'not the whole school');
  r = await as(O)(`/api/progress/${clA.id}/${build.id}/build`, { method: 'POST', body: {} });
  const gid2 = r.json.redirect.split('/')[2].split('?')[0];
  games.addVersion(gid2, GOOD, { createdBy: O.id, safetyStatus: 'pass' });
  await pub.publish(O, gid2, 'class', { classIds: [B.id] });
  r = await as(O)(`/api/progress/${clA.id}/${build.id}/hand-in`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.deepEqual(S.gameClassIds(gid2).sort(), [A.id, B.id].sort());
  // The gradebook's "Open game" link shows only when the teacher can open the game.
  r = await as(t1)(`/class/${A.id}/progress/${clA.id}`); assert.match(r.text, new RegExp(`/g/${games.getGame(gid2).slug}"`));
  r = await as(w.SA)(`/class/${B.id}/progress/${clB.id}`); assert.match(r.text, new RegExp(`/g/${games.getGame(gid).slug}"`));
  q.run("UPDATE games SET visibility='private' WHERE id=?", gid);
  r = await as(t1)(`/class/${B.id}/progress/${clB.id}`); assert.doesNotMatch(r.text, new RegExp(`/g/${games.getGame(gid).slug}"`));
});

test('migration 0018: pending reviews from before get what they could have asked for', () => {
  const d = new Database(':memory:');
  d.exec('CREATE TABLE migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const i = MIGRATIONS.findIndex(([n]) => n === '0018_class_sharing');
  assert.ok(i > 0);
  for (const [, sql] of MIGRATIONS.slice(0, i)) d.exec(sql);
  const user = (id, school = '') => d.prepare("INSERT INTO users(id, username, display_name, created_at, managed_school) VALUES (?,?,?,1,?)").run(id, id, id, school);
  const school = (id, settings) => d.prepare('INSERT INTO schools(id, name, slug, settings, created_at) VALUES (?,?,?,?,1)').run(id, id, id, settings);
  const game = (id, owner, pending) => d.prepare("INSERT INTO games(id, slug, owner_id, title, created_at, updated_at, pending_version_id) VALUES (?,?,?,'t',1,1,?)").run(id, id, owner, pending);
  school('s1', '{}'); school('s2', '{"publishing":"public"}'); school('s3', 'not json');
  const member = (sid, uid, status = 'active') => d.prepare("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student',?,1)").run(sid, uid, status);
  user('kid1', 's1'); user('kid2', 's2'); user('kid3', 's3'); user('me'); user('own'); user('gone');
  member('s1', 'kid1'); member('s2', 'kid2'); member('s3', 'kid3'); member('s2', 'own'); member('s1', 'gone', 'removed');
  game('g1', 'kid1', 'v'); game('g2', 'kid2', 'v'); game('g3', 'kid3', 'v'); game('g4', 'me', 'v'); game('g5', 'me', null);
  game('g6', 'own', 'v'); game('g7', 'gone', 'v');
  d.exec(MIGRATIONS[i][1]);
  const pv = id => d.prepare('SELECT pending_visibility p FROM games WHERE id=?').get(id).p;
  // Anyone in a school gets the narrow reading ('school'; they can ask for public again); only people in no school keep 'public'.
  assert.deepEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map(pv), ['school', 'school', 'school', 'public', '', 'school', 'public']);
  assert.ok(d.prepare("SELECT 1 FROM sqlite_master WHERE name='game_classes_class'").get());
  d.close();
});

test('audit log: class lists in details show as class names', async () => {
  const w = world(); const { A, B, O } = w;
  const g = draft(O, 'Audit Lists');
  await pub.publish(O, g.id, 'class', { classIds: [A.id, B.id] });
  const row = mod.auditLog(50).find(x => x.action === 'game.publish' && x.target === g.id);
  assert.match(row.detailsLabel, /visibility: class/); assert.match(row.detailsLabel, /classes: 5A, 5B/);
});

test('settings and copy: the school settings hint, the share texts and labels exist for every level', async () => {
  const w = world();
  assert.match((await as(w.SA)(`/school/${w.oak.slug}?tab=settings`)).text, /Students in a class can also share a game with just their classes\./);
  const { visLabel } = await import('../../server/views/components.js');
  const { tEn } = await import('../../server/i18n/index.js');
  assert.equal(visLabel('class', tEn, 1), '🎒 My class'); assert.equal(visLabel('class', tEn, 3), '🎒 My classes');
  assert.deepEqual(games.VISIBILITIES, ['private', 'family', 'friends', 'class', 'school', 'public']);
  assert.equal(visLabel('family', tEn), '🏠 My family'); assert.equal(visLabel('friends', tEn, 1, { grownup: true }), '🤝 My grown-up connections');
});
