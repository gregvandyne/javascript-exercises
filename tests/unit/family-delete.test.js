// "What we keep" and Delete for a parent-made child (docs/decisions.md "Parent-made child accounts" B8;
// services/account-delete.js): counts only as of yesterday, behind the step-up; Delete needs the step-up and the typed
// name, empties or tombstones every table, removes the files, keeps Builder totals without text, reserves the old name
// for 90 days, is refused while the child is in a class, and still counts toward the family's yearly limit.
import { config, auth, F, q, uid, PW, KID_PW, DATA, call, as, cookieFor, kid, grownup, famOf, make, audits, fresh } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const S = await import('../../server/services/schools.js');
const photos = await import('../../server/services/photos.js');
const shots = await import('../../server/services/shots.js');
const { uploadDir } = await import('../../server/builder/uploads.js');
const { deleteAccount, RESERVE_DAYS } = await import('../../server/services/account-delete.js');

const DAY = 86400e3;
const yesterday = Date.now() - DAY;
/** A game of `owner` with a version, as made yesterday. */
function game(owner, { visibility = 'private', status = 'draft', at = yesterday } = {}) {
  const id = uid(), vid = uid();
  q.run('INSERT INTO games(id, slug, owner_id, title, status, visibility, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, `del-${id.toLowerCase()}`, owner.id, 'A game', status, visibility, at, at);
  q.run('INSERT INTO game_versions(id, game_id, number, html, created_at) VALUES (?,?,?,?,?)', vid, id, 1, '<p>hi</p>', at);
  q.run('UPDATE games SET current_version_id=?, published_version_id=? WHERE id=?', vid, status === 'published' ? vid : null, id);
  return { id, vid };
}
/** Everything a child's account can have, so the delete has something to remove everywhere. */
function fill(child) {
  const friend = kid(), stranger = kid();
  const mine = game(child, { visibility: 'public', status: 'published' }), mine2 = game(child);
  const theirs = game(friend, { visibility: 'public', status: 'published' });
  q.run('INSERT INTO builder_chats(id, game_id, user_id, messages, created_at, updated_at) VALUES (?,?,?,?,?,?)', uid(), mine.id, child.id, '[{"role":"user","content":"my secret idea"}]', yesterday, yesterday);
  fs.mkdirSync(uploadDir(mine.id), { recursive: true }); fs.writeFileSync(path.join(uploadDir(mine.id), 'u1'), 'picture');
  q.run('INSERT INTO builder_uploads(id, game_id, user_id, kind, mime, name, size, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(), mine.id, child.id, 'image', 'image/png', 'pic.png', 7, 'x', yesterday);
  fs.mkdirSync(shots.DIR, { recursive: true }); fs.writeFileSync(shots.fileFor(mine.vid), 'jpg');
  for (const g of [mine, theirs]) {
    q.run('INSERT INTO saves(game_id, user_id, data, updated_at) VALUES (?,?,?,?)', g.id, child.id, '{"level":3}', yesterday);
    q.run('INSERT INTO scores(id, game_id, user_id, score, created_at) VALUES (?,?,?,?,?)', uid(), g.id, child.id, 42, yesterday);
    q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', uid(), g.id, child.id, yesterday);
  }
  q.run('INSERT INTO ratings(game_id, user_id, stars, created_at) VALUES (?,?,?,?)', theirs.id, child.id, 5, yesterday);
  q.run('INSERT INTO likes(game_id, user_id, created_at) VALUES (?,?,?)', theirs.id, child.id, yesterday);
  q.run('UPDATE games SET likes=1, rating_sum=5, rating_count=1 WHERE id=?', theirs.id);
  q.run('INSERT INTO ratings(game_id, user_id, stars, created_at) VALUES (?,?,?,?)', mine.id, friend.id, 4, yesterday);
  q.run("INSERT INTO reports(id, game_id, user_id, reason, created_at) VALUES (?,?,?,'mean',?)", uid(), mine.id, stranger.id, yesterday);
  q.run("INSERT INTO reports(id, game_id, user_id, reason, details, created_at) VALUES (?,?,?,'mean','text',?)", uid(), theirs.id, child.id, yesterday);
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?),(?,?,'accepted',?)", child.id, friend.id, yesterday, friend.id, child.id, yesterday);
  q.run("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", stranger.id, child.id, yesterday);
  const m1 = uid(), m2 = uid(), m3 = uid();
  q.run('INSERT INTO chat_messages(id, from_id, to_id, body, created_at) VALUES (?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?)',
    m1, child.id, friend.id, 'hi from child', yesterday, m2, friend.id, child.id, 'hi back', yesterday, m3, child.id, friend.id, 'a reported message', yesterday);
  q.run("INSERT INTO chat_reports(id, message_id, reporter_id, reason, created_at) VALUES (?,?,?,'mean',?)", uid(), m3, friend.id, yesterday);
  q.run("INSERT INTO chat_reports(id, message_id, reporter_id, reason, created_at) VALUES (?,?,?,'mean',?)", uid(), m2, child.id, yesterday);
  q.run('INSERT INTO chat_blocks(user_id, blocked_id, created_at) VALUES (?,?,?),(?,?,?)', child.id, stranger.id, yesterday, stranger.id, child.id, yesterday);
  q.run('INSERT INTO chat_usage(user_id, day, sent) VALUES (?,?,?)', child.id, '2026-01-01', 3);
  q.run("INSERT INTO builder_turns(id, game_id, user_id, status, request, charged_to, charged_day, weight, created_at) VALUES (?,?,?,'done',?,?,?,?,?)",
    uid(), mine.id, child.id, '{"text":"make a dragon game"}', `family:${child.made_by_family}`, '2026-01-01', 1, yesterday);
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,?)', child.id, '2026-01-01', 1);
  fs.mkdirSync(photos.DIR, { recursive: true }); fs.writeFileSync(photos.fileFor(child.id), 'jpg');
  q.run('UPDATE users SET photo_at=?, bio=? WHERE id=?', yesterday, 'my bio', child.id);
  q.run("INSERT INTO google_identities(sub, user_id, created_at) VALUES (?,?,?)", `sub-${uid()}`, child.id, yesterday);
  q.run("INSERT INTO join_requests(id, class_id, user_id, created_at) VALUES (?,?,?,?)", uid(), 'c-none', child.id, yesterday);
  q.run('INSERT INTO sessions(id, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)', uid(32), child.id, yesterday, Date.now() + DAY, 'Mozilla/5.0 TestBrowser');
  return { friend, stranger, mine, mine2, theirs, m1, m2, m3 };
}

test('"What we keep": the step-up first, then counts only (as of the end of yesterday), never content', async () => {
  const g = grownup(); const { child, token } = await make(g);
  fill(auth.getUser(child.id));
  // Something from today is not counted (no live activity).
  game(child, { at: Date.now() });
  const c = cookieFor(g.id);
  const gate = await call(c, `/family/children/${token}/data`);
  assert.equal(gate.status, 200);
  assert.match(gate.text, /data-api="\/api\/family\/reauth"/);
  assert.doesNotMatch(gate.text, /Games made/);
  assert.equal((await call(c, '/api/family/reauth', { method: 'POST', body: { password: 'wrong-password-1' } })).status, 403);
  assert.equal((await call(c, '/api/family/reauth', { method: 'POST', body: { password: PW } })).status, 200);
  const page = await call(c, `/family/children/${token}/data`);
  assert.match(page.text, /Games made: 2 \(1 public\)/);
  assert.match(page.text, /Games with Builder chats: 1/);
  assert.match(page.text, /Pictures and files uploaded: 1/);
  assert.match(page.text, /Game saves: 2/);
  assert.match(page.text, /Scores: 2/);
  assert.match(page.text, /Friends: 1/);
  assert.match(page.text, /Friend chat messages sent: 2/);
  assert.match(page.text, /Profile photo: yes/);
  assert.match(page.text, /Signed in on 1 browser:/, "one browser, not \"1 browsers\"");
  assert.match(page.text, /TestBrowser/);
  assert.match(page.text, /What we never keep for/);
  for (const secret of ['my secret idea', 'hi from child', 'make a dragon game', 'my bio', 'level']) assert.ok(!page.text.includes(secret), secret);
  assert.match(page.text, /id="delete"/);
  // A code-linked child has no such page.
  assert.equal((await call(c, `/family/children/${F.requestToken(famOf(g).id, kid().id)}/data`)).status, 404);
});

test('delete: the step-up and the typed name are both needed', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const del = b => as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: b });
  assert.equal((await del({ confirmName: child.username })).status, 403);
  let r = await del({ confirmName: 'someone-else', password: PW });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'confirmName');
  assert.ok(auth.getUser(child.id).password_hash, 'nothing happened');
  r = await del({ confirmName: child.username.toUpperCase(), password: PW });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/family'); assert.match(r.json.toast, /account was deleted/);
});

test('delete empties or tombstones every table, removes the files, keeps Builder totals without text', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const c0 = auth.getUser(child.id); const oldName = c0.username;
  const x = fill(c0);
  const ack = q.get('SELECT * FROM family_notice_acks WHERE child_id=?', child.id);
  const r = await as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: { confirmName: oldName, password: PW } });
  assert.equal(r.status, 200, r.text);
  const u = auth.getUser(child.id);
  assert.equal(u.username, `deleted_${child.id}`); assert.equal(u.display_name, 'deleted'); assert.equal(u.password_hash, null);
  assert.equal(u.friend_code, null); assert.equal(u.bio, ''); assert.equal(u.banned, 1); assert.equal(u.photo_at, 0);
  assert.equal(u.made_by, g.id); assert.equal(u.made_by_family, famOf(g).id); assert.ok(u.made_at, 'provenance kept');
  const none = (sql, ...p) => assert.equal(q.get(sql, ...p).n, 0, sql);
  none('SELECT COUNT(*) n FROM sessions WHERE user_id=?', child.id);
  none("SELECT COUNT(*) n FROM family_children WHERE child_id=? AND unlinked_at IS NULL", child.id);
  none('SELECT COUNT(*) n FROM family_link_codes WHERE child_id=?', child.id);
  none('SELECT COUNT(*) n FROM friends WHERE user_id=? OR friend_id=?', child.id, child.id);
  none('SELECT COUNT(*) n FROM chat_blocks WHERE user_id=? OR blocked_id=?', child.id, child.id);
  none('SELECT COUNT(*) n FROM chat_usage WHERE user_id=?', child.id);
  none('SELECT COUNT(*) n FROM chat_messages WHERE id IN (?,?)', x.m1, x.m2);
  none('SELECT COUNT(*) n FROM chat_reports WHERE reporter_id=?', child.id);
  // A message someone else reported stays for that report, with its words gone.
  assert.equal(q.get('SELECT body FROM chat_messages WHERE id=?', x.m3).body, '');
  assert.equal(q.get('SELECT COUNT(*) n FROM chat_reports WHERE message_id=?', x.m3).n, 1);
  for (const tbl of ['games', 'game_versions', 'builder_chats', 'builder_uploads', 'saves', 'scores', 'plays', 'ratings', 'likes', 'game_classes', 'reports']) {
    const col = tbl === 'games' ? 'id' : 'game_id';
    none(`SELECT COUNT(*) n FROM ${tbl} WHERE ${col} IN (?,?)`, x.mine.id, x.mine2.id);
  }
  for (const tbl of ['saves', 'scores', 'ratings', 'likes', 'builder_uploads', 'google_identities', 'join_requests']) none(`SELECT COUNT(*) n FROM ${tbl} WHERE user_id=?`, child.id);
  assert.deepEqual({ ...q.get('SELECT likes, rating_sum, rating_count FROM games WHERE id=?', x.theirs.id) }, { likes: 0, rating_sum: 0, rating_count: 0 }, 'the other game\'s totals');
  none('SELECT COUNT(*) n FROM plays WHERE user_id=?', child.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM plays WHERE game_id=? AND user_id IS NULL', x.theirs.id).n, 1, 'a play on someone else\'s game stays, without the child');
  assert.equal(q.get('SELECT COUNT(*) n FROM reports WHERE game_id=? AND user_id IS NULL', x.theirs.id).n, 1, 'their report on another game stays, without the child');
  // Builder totals stay, without the words.
  const turn = q.get('SELECT * FROM builder_turns WHERE user_id=?', child.id);
  assert.equal(turn.request, '{}'); assert.equal(turn.weight, 1); assert.equal(turn.charged_to, `family:${famOf(g).id}`); assert.equal(turn.charged_day, '2026-01-01');
  assert.equal(q.get('SELECT turns FROM builder_usage WHERE user_id=?', child.id).turns, 1);
  // Files.
  assert.equal(fs.existsSync(uploadDir(x.mine.id)), false);
  assert.equal(fs.existsSync(shots.fileFor(x.mine.vid)), false);
  assert.equal(fs.existsSync(photos.fileFor(child.id)), false);
  assert.ok(DATA && photos.fileFor(child.id).startsWith(DATA));
  // The notice record stays with the tombstone; one audit with ids only.
  assert.ok(q.get('SELECT 1 FROM family_notice_acks WHERE id=?', ack.id));
  const a = audits('user.delete', child.id).at(-1);
  assert.deepEqual(JSON.parse(a.details), { by: g.id, kind: 'grownup', parentMade: true });
  assert.ok(!a.details.includes(oldName));
  // The row is gone from /family; the old name can't sign in.
  assert.doesNotMatch((await as(g)('/family')).text, new RegExp(oldName));
  assert.equal((await call(null, '/api/auth/login', { method: 'POST', body: { username: oldName, password: KID_PW } })).status, 400);
});

test('the old name is reserved for 90 days (sign-up and made accounts), then freed by the retention job', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const oldName = child.username;
  assert.equal((await as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: { confirmName: oldName, password: PW } })).status, 200);
  const until = q.get('SELECT until FROM reserved_names WHERE name=?', oldName).until;
  assert.ok(Math.abs(until - (Date.now() + RESERVE_DAYS * DAY)) < 60e3);
  assert.equal(auth.isRetiredName(oldName.toLowerCase()), true);
  const r = await call(null, '/api/auth/signup', { method: 'POST', body: { username: oldName, password: 'other-pass-9' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'username');
  const g2 = grownup();
  assert.equal((await as(g2)('/api/family/children/new', { method: 'POST', body: { username: oldName, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW } })).json.field, 'username');
  F.retention(Date.now() + (RESERVE_DAYS + 1) * DAY);
  assert.equal(auth.isRetiredName(oldName), false);
});

test('refused while the child is in a school or class (school records belong to the school)', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const boss = auth.createUser({ username: `DelBoss${fresh()}`, password: 'boss-password-1', role: 'admin' });
  const s = S.createSchool(boss, { name: `Del School ${fresh()}` }).school;
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',?)", s.id, child.id, Date.now());
  const r = await as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: { confirmName: child.username, password: PW } });
  assert.equal(r.status, 409); assert.match(r.json.error, /is in a class\. School records belong to the school/);
  assert.ok(auth.getUser(child.id).password_hash);
  const c = cookieFor(g.id); await call(c, '/api/family/reauth', { method: 'POST', body: { password: PW } });
  const page = await call(c, `/family/children/${token}/data`);
  assert.match(page.text, /is in a class/); assert.doesNotMatch(page.text, /\/delete"/);
  q.run("UPDATE school_members SET status='left' WHERE user_id=?", child.id);
  assert.equal(deleteAccount(child.id, g).ok, true);
});

test('after a delete: the admin still sees who made it, and the yearly limit still counts it (make, delete, make again frees nothing)', async () => {
  const g = grownup(), fam = famOf(g);
  for (let i = 0; i < config.familyMaxChildren; i++) {
    const { child, token } = await make(g);
    q.run('UPDATE users SET made_at=? WHERE id=?', Date.now() - 3 * DAY, child.id);   // past the 2-a-day limit
    assert.equal((await as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: { confirmName: child.username, password: PW } })).status, 200);
  }
  assert.equal(F.childrenOf(fam.id).length, 0, 'no children left');
  const r = await as(g)('/api/family/children/new', { method: 'POST', body: { username: `Again${fresh()}`, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW } });
  assert.equal(r.status, 409); assert.match(r.json.error, /in the last 12 months/);
  const links = F.adminLinks(g.id);
  assert.equal(links.made.length, config.familyMaxChildren);
  assert.ok(links.made.every(m => m.status === 'deleted'));
  const one = links.made[0];
  assert.equal(F.adminLinks(one.id).madeBy.made_by, g.id);
});
