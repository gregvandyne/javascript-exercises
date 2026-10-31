// Who may host, which games each audience may run, who may join and how names show (services/classlive-access.js).
import { reset, LS, q, S, games, config, teacher, teacher2, cls, cls2, mia, leo, zed, kid, mum, boss, questRace, publish, liveHtml, official } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const A = await import('../../server/services/classlive-access.js');

test.beforeEach(() => reset());

test('hosts: staff, grown-ups and the platform admin; never kids, students or guests', () => {
  assert.equal(A.canHost(teacher), true); assert.equal(A.canHost(mum), true); assert.equal(A.canHost(boss), true);
  assert.equal(A.canHost(kid), false); assert.equal(A.canHost(mia), false); assert.equal(A.canHost(null), false);
  assert.equal(A.canHost({ ...teacher, is_guest: 1 }), false);
});

test('audience x game: open rooms run official and public games only; class rooms games that reach the class', () => {
  const pub = publish(kid, liveHtml(), { visibility: 'public', title: 'Pub' });
  const priv = publish(teacher, liveHtml(), { visibility: 'private', title: 'Priv' });
  const fam = publish(mum, liveHtml(), { visibility: 'family', title: 'Fam' });
  const friends = publish(kid, liveHtml(), { visibility: 'friends', title: 'Fr' });
  const forClass = publish(teacher, liveHtml(), { visibility: 'class', title: 'Cl' });
  q.run('INSERT INTO game_classes(game_id, class_id, added_at) VALUES (?,?,?)', forClass.id, cls.id, Date.now());
  const school = publish(teacher2, liveHtml(), { visibility: 'school', title: 'Sch' });
  assert.equal(A.hostable(teacher, questRace, 'open').ok, true, 'official');
  assert.equal(A.isOfficial(questRace), true); assert.equal(A.isOfficial(pub), false);
  assert.equal(A.hostable(teacher, pub, 'open').ok, true, 'public, reviewed');
  for (const g of [priv, fam, friends, forClass, school]) assert.equal(A.hostable(teacher, g, 'open').ok, false, `${g.title} in an open room`);
  assert.equal(A.hostable(teacher, forClass, 'class', { classId: cls.id }).ok, true);
  assert.equal(A.hostable(teacher2, forClass, 'class', { classId: cls2.id }).ok, false, 'not shared with that class');
  assert.equal(A.hostable(teacher, school, 'class', { classId: cls.id }).ok, true, 'a school game in a class of that school');
  assert.equal(A.hostable(teacher, priv, 'class', { classId: cls.id }).code, 'notShared', "the host's own private game is not for students");
  q.run("UPDATE games SET hidden_reason='reports' WHERE id=?", pub.id);
  assert.equal(A.hostable(teacher, games.getGame(pub.id), 'open').code, 'notPublished', 'a hidden game');
  const draft = games.createGame(teacher.id, { title: 'Draft' });
  assert.equal(A.hostable(teacher, games.getGame(draft.id), 'class', { classId: cls.id }).code, 'notPublished');
});

test('every seat must see the game: guests only public ones; a game hidden later stops reaching players', () => {
  const pub = publish(kid, liveHtml(), { visibility: 'public', title: 'Pub2' });
  const s = { gameId: pub.id, official: false };
  assert.equal(A.seatCanView(s, null), true);
  q.run("UPDATE games SET visibility='friends' WHERE id=?", pub.id);
  assert.equal(A.seatCanView(s, null), false);
  assert.equal(A.seatCanView({ gameId: questRace.id, official: true }, null), true);
});

test('joining: class rooms need a signed-in active student of that class; open rooms take anyone; family rooms members', () => {
  const sClass = { audience: 'class', classId: cls.id, host: { userId: teacher.id } };
  assert.deepEqual(A.joinCheck(sClass, null), { ok: false, code: 'signIn' });
  assert.deepEqual(A.joinCheck(sClass, kid), { ok: false, code: 'notMember' });
  assert.deepEqual(A.joinCheck(sClass, zed), { ok: false, code: 'notMember' });
  assert.deepEqual(A.joinCheck(sClass, teacher), { ok: false, code: 'notMember' }, 'a teacher is not a student');
  assert.deepEqual(A.joinCheck(sClass, mia), { ok: true, kind: 'student' });
  assert.deepEqual(A.joinCheck(sClass, { ...mia, is_guest: 1 }), { ok: false, code: 'signIn' });
  const sOpen = { audience: 'open' };
  assert.deepEqual(A.joinCheck(sOpen, null), { ok: true, kind: 'guest' });
  assert.deepEqual(A.joinCheck(sOpen, kid), { ok: true, kind: 'account' });
  const sFam = { audience: 'family', host: { userId: mum.id } };
  assert.equal(A.joinCheck(sFam, null).code, 'signIn');
  assert.equal(A.joinCheck(sFam, kid).code, 'notMember');
  q.run("INSERT INTO families(id, owner_id, created_at) VALUES ('fam1', ?, ?)", mum.id, Date.now());
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES ('fam1', ?, 'linked', ?, 1)", kid.id, Date.now());
  assert.deepEqual(A.joinCheck(sFam, kid), { ok: true, kind: 'member' });
});

test('names: account names only in a class room hosted by a teacher of that class; nicknames everywhere else', () => {
  assert.equal(A.nameMode(teacher, 'class', cls.id), 'accounts');
  assert.equal(A.nameMode(teacher2, 'class', cls.id), 'nicknames');
  assert.equal(A.nameMode(teacher, 'open', null), 'nicknames');
  assert.equal(A.nameMode(mum, 'family', null), 'nicknames');
});

test('player caps: LIVE_MAX_PLAYERS, and 30 for a grown-up\'s open room', () => {
  assert.equal(A.maxPlayersFor(teacher, 'open', null), config.liveMaxPlayers);
  assert.equal(A.maxPlayersFor(teacher, 'open', 12), 12);
  assert.equal(A.maxPlayersFor(teacher, 'open', 500), config.liveMaxPlayers);
  assert.equal(A.maxPlayersFor(mum, 'open', 60), 30);
  assert.equal(A.maxPlayersFor(mum, 'family', 60), Math.min(60, config.liveMaxPlayers));
  void official; void leo; void S; void LS;
});
