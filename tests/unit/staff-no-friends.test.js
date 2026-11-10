// Staff never have friends or friends' chat (docs/decisions.md "Staff have no friends; school chat is off by default").
// Staff = the platform admin, and anyone who is or was a teacher or school admin (services/schools.js noFriendsAccount).
// Every friends and chat route is tried as staff and as a child, in both directions; then the life of an account
// (becomes staff, leaves, is put back as a student), a teacher's separate parent account, migration 0068's clean-up of
// old rows, and the school chat default (off) with the notice for schools that were using chat.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q, migrate, now, uid } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const friends = await import('../../server/services/friends.js');
const chat = await import('../../server/services/chat.js');
const team = await import('../../server/services/team.js');
const games = await import('../../server/services/games.js');
const { navBadges } = await import('../../server/services/badges.js');
const { tEn } = await import('../../server/i18n/index.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
};
const fresh = u => getUser(u.id);
const friendRows = id => q.all('SELECT user_id, friend_id, status FROM friends WHERE user_id=? OR friend_id=?', id, id);
/** Rows written straight into the table: what an old database could hold, or a bug elsewhere could write. */
const forceFriends = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) q.run("INSERT OR REPLACE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", x.id, y.id, now()); };
const forceRequest = (from, to) => q.run("INSERT OR REPLACE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'pending',?)", from.id, to.id, now());
const forceMessage = (from, to, body = 'hello there') => { const id = uid(14); q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES (?,?,?,?,'text','ok',?)", id, from.id, to.id, body, now()); return id; };
/** Unread messages from friends (the Oomba team's welcome and notices are another kind, and stay unread). */
const friendUnread = id => q.get("SELECT COUNT(*) n FROM chat_messages WHERE to_id=? AND read_at IS NULL AND kind IN ('text','quick','game')", id).n;
const mk = n => createUser({ username: n, password: 'secret123' });
const STAFF_TEXT = tEn('friends.staff.text');
/** A string as the pages print it (the apostrophe is escaped). */
const inPage = (text, s) => text.includes(s) || text.includes(s.replace(/'/g, '&#39;'));

const boss = createUser({ username: 'PlatformBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Hill Primary' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
const rivera = S.createSchoolAccount(head, oak.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user;
// A teacher made the way /trial makes one (routes/teacher-plan.js): an ordinary account, its own school, its admin.
const critic = createUser({ username: 'MsCritic', password: 'a-long-password-1', displayName: 'Ms Critic' });
const criticSchool = S.createSchool(critic, { name: 'Critic Elementary' }).school;
S.addMember(critic, criticSchool.id, critic.id, 'admin', { rosterName: 'Ms Critic' });
const cls = S.createClass(rivera, oak.id, { name: '4B' }).class;
const student = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Ana Silva' }).user;
S.addToClass(rivera, cls.id, student.id);
const kid = mk('AmberFox'), kid2 = mk('BlueOtter');
const STAFF = { 'platform admin': boss, 'school admin (school account)': head, 'teacher (school account)': rivera, 'trial teacher (own account)': critic };
const CHILDREN = { 'child (own account)': kid, 'student (school account)': student };

test('who is staff: the platform admin, school admins and teachers; never a child, a student or the Oomba team account', () => {
  for (const [name, s] of Object.entries(STAFF)) assert.equal(S.noFriendsAccount(fresh(s)), true, name);
  for (const [name, c] of Object.entries(CHILDREN)) assert.equal(S.noFriendsAccount(fresh(c)), false, name);
  assert.equal(S.noFriendsAccount(team.teamUser()), false, 'the team account is not a person with friends, and its thread still works');
  assert.equal(S.noFriendsAccount(null), false);
});

test('staff have no friend code: none stored, none shown, and none given by the API or the pages', async () => {
  for (const [name, s] of Object.entries(STAFF)) {
    friends.closedToFriends(fresh(s));   // the platform admin is made by the seed, not by addMember: first sight clears it
    assert.equal(fresh(s).friend_code, null, `${name}: no code in the database`);
    assert.equal(friends.codeOf(fresh(s)), null, name);
    const api = await as(s)('/api/friends');
    assert.equal(api.status, 403, name); assert.equal(api.json.error, STAFF_TEXT); assert.equal(api.json.code, 'staff'); assert.equal('friends' in api.json, false);
    const page = await as(s)('/friends');
    assert.equal(page.status, 200); assert.ok(inPage(page.text, tEn('friends.staff.title')), name);
    for (const gone of ['id="mycode"', 'id="copycode"', 'name="code"', 'data-act=']) assert.equal(page.text.includes(gone), false, `${name}: /friends has no ${gone}`);
    const me = await as(s)('/me');
    assert.equal(me.status, 200);
    assert.equal(/href="\/friends"/.test(me.text), false, `${name}: no Friends link on Me or in the nav`);
    assert.equal(me.text.includes('id="chat-toggle"'), false, `${name}: no chat switch`);
  }
  for (const [name, c] of Object.entries(CHILDREN)) {
    assert.match(friends.codeOf(fresh(c)), /^[A-Z0-9]{6}$/, name);
    assert.equal((await as(c)('/api/friends')).json.code, fresh(c).friend_code, name);
    assert.ok((await as(c)('/friends')).text.includes('id="mycode"'), name);
    assert.ok(/href="\/friends"/.test((await as(c)('/me')).text), name);
  }
});

test('friend requests, staff to child: refused by the service and by POST /api/friends/add, and nothing is stored', async () => {
  for (const [sn, s] of Object.entries(STAFF)) for (const [cn, c] of Object.entries(CHILDREN)) {
    const r = friends.addByCode(fresh(s), fresh(c).friend_code);
    assert.equal(r.ok, false, `${sn} -> ${cn}`); assert.equal(r.error, STAFF_TEXT);
    const h = await as(s)('/api/friends/add', { method: 'POST', body: { code: fresh(c).friend_code } });
    assert.equal(h.status, 403, `${sn} -> ${cn}`); assert.equal(h.json.error, STAFF_TEXT);
    assert.deepEqual(friendRows(s.id), [], `${sn} -> ${cn}: no row`);
    assert.equal(friends.incoming(c.id).length, 0, `${cn} sees no request from ${sn}`);
    assert.equal(navBadges(fresh(c)).requests, 0);
  }
});

test('friend requests, child to staff: a staff code (even one still stored) is "not found", word for word like a code nobody has', async () => {
  const nobody = friends.addByCode(fresh(kid), 'ZZZZZ9');
  for (const [sn, s] of Object.entries(STAFF)) for (const [cn, c] of Object.entries(CHILDREN)) {
    q.run('UPDATE users SET friend_code=? WHERE id=?', `S${uid(8).replace(/[^A-Za-z0-9]/g, 'X').toUpperCase().slice(0, 5)}`, s.id);   // a code left over from before
    const code = fresh(s).friend_code;
    const r = friends.addByCode(fresh(c), code);
    assert.equal(r.ok, false, `${cn} -> ${sn}`); assert.equal(r.error, nobody.error, 'the same words as an unknown code');
    q.run('UPDATE users SET friend_code=? WHERE id=?', code, s.id);
    const h = await as(c)('/api/friends/add', { method: 'POST', body: { code } });
    assert.equal(h.status, 400); assert.equal(h.json.error, nobody.error);
    assert.deepEqual(friendRows(s.id), [], `${cn} -> ${sn}: no row`);
    assert.equal(fresh(s).friend_code, null, 'the leftover code was taken away when the staff account was next seen');
  }
});

test('accept, decline, cancel, remove: a request row that should not exist can never be accepted, from either side', async () => {
  for (const [sn, s] of Object.entries(STAFF)) for (const [cn, c] of Object.entries(CHILDREN)) {
    // staff -> child request sitting in the table: the child cannot accept it (service and route); it is dropped
    forceRequest(s, c);
    assert.equal(friends.accept(fresh(c), s.id), false, `${cn} accepting ${sn}`);
    assert.deepEqual(friendRows(s.id), [], 'the bad request is dropped, never accepted');
    forceRequest(s, c);
    assert.equal((await as(c)(`/api/friends/${s.id}/accept`, { method: 'POST', body: {} })).status, 404);
    assert.deepEqual(friendRows(s.id).filter(r => r.status === 'accepted'), []);
    // child -> staff request sitting in the table: the staff account cannot accept it; every friend route answers 403
    q.run('DELETE FROM friends WHERE user_id=? OR friend_id=?', s.id, s.id);
    forceRequest(c, s);
    assert.equal(friends.accept(fresh(s), c.id), false, `${sn} accepting ${cn}`);
    assert.deepEqual(friendRows(s.id), [], 'and the row is gone');
    forceRequest(c, s);
    for (const act of ['accept', 'decline', 'cancel', 'remove']) {
      const h = await as(s)(`/api/friends/${c.id}/${act}`, { method: 'POST', body: {} });
      assert.equal(h.status, 403, `${sn} ${act}`); assert.equal(h.json.error, STAFF_TEXT);
    }
    assert.deepEqual(friendRows(s.id), [], 'a staff account seen holding friend rows has them ended');
    assert.equal(friends.status(c.id, s.id), 'none'); assert.equal(friends.status(s.id, c.id), 'none');
  }
  // children still do all four with each other
  assert.equal(friends.addByCode(fresh(kid), fresh(kid2).friend_code).state, 'sent');
  assert.equal((await as(kid2)(`/api/friends/${kid.id}/decline`, { method: 'POST', body: {} })).status, 200);
  friends.addByCode(fresh(kid), fresh(kid2).friend_code);
  assert.equal((await as(kid)(`/api/friends/${kid2.id}/cancel`, { method: 'POST', body: {} })).status, 200);
  friends.addByCode(fresh(kid), fresh(kid2).friend_code);
  assert.equal((await as(kid2)(`/api/friends/${kid.id}/accept`, { method: 'POST', body: {} })).status, 200);
  assert.equal(friends.status(kid.id, kid2.id), 'friends');
});

test('chat: no staff account can chat with a child even when friend rows exist, on every chat route, both ways', async () => {
  q.run('UPDATE users SET chat_enabled=1');
  S.updateSchool(head, oak.id, { settings: { chat: 'classmates' } });
  assert.equal(chat.canChat(fresh(kid), fresh(kid2)).ok, true, 'two children who are friends chat as before');
  for (const [sn, s] of Object.entries(STAFF)) for (const [cn, c] of Object.entries(CHILDREN)) {
    const label = `${sn} / ${cn}`;
    // The worst case: accepted rows both ways and old messages, as an old database could hold. canChat is asked without
    // going through a friends call first, so nothing has cleaned the rows up.
    forceFriends(s, c); forceMessage(s, c, 'old from staff'); forceMessage(c, s, 'old from child');
    assert.equal(chat.canChat(fresh(s), fresh(c)).code, 'staff', label);
    assert.equal(chat.canChat(fresh(c), fresh(s)).code, 'missing', `${label}: to the child the staff account reads as not there`);
    for (const kind of ['text', 'quick']) {
      assert.equal(chat.send(fresh(s), fresh(c), { kind, body: kind === 'quick' ? 'hi' : 'hello' }).ok, false, `${label} send ${kind}`);
      assert.equal(chat.send(fresh(c), fresh(s), { kind, body: kind === 'quick' ? 'hi' : 'hello' }).ok, false, `${label} send ${kind} back`);
    }
    assert.deepEqual(chat.thread(fresh(s), fresh(c)), [], `${label}: old messages are not shown to staff`);
    assert.deepEqual(chat.thread(fresh(c), fresh(s)), [], `${label}: nor to the child`);
    assert.deepEqual(chat.inbox(fresh(s)), [], `${label}: staff inbox has no friends`);
    assert.equal(chat.inbox(fresh(c)).some(t => t.id === s.id), false, `${label}: nor does the child's inbox list the staff account`);
    // routes, staff side
    const sg = await as(s)(`/api/chat/${c.username}`);
    assert.equal(sg.status, 200); assert.equal(sg.json.can.ok, false); assert.equal(sg.json.can.code, 'staff'); assert.deepEqual(sg.json.messages, [], label);
    const sp = await as(s)(`/api/chat/${c.username}`, { method: 'POST', body: { kind: 'text', body: 'hello' } });
    assert.equal(sp.status, 400, label); assert.equal(sp.json.code, 'staff');
    for (const act of ['block', 'unblock']) assert.equal((await as(s)(`/api/chat/${c.username}/${act}`, { method: 'POST', body: {} })).status, 403, `${label} ${act}`);
    const sPage = await as(s)(`/chat/${c.username}`);
    assert.equal(sPage.status, 302, `${label}: no thread page`); assert.equal(sPage.location, '/chat');
    const sInbox = await as(s)('/api/chat');
    assert.equal(sInbox.json.threads.some(t => t.id === c.id), false, label);
    assert.equal((await as(s)('/chat')).text.includes(`data-thread="${c.username}"`), false, label);
    // routes, child side
    const cg = await as(c)(`/api/chat/${s.username}`);
    assert.equal(cg.json.can.ok, false); assert.equal(cg.json.can.code, 'missing'); assert.deepEqual(cg.json.messages, [], label);
    const cp = await as(c)(`/api/chat/${s.username}`, { method: 'POST', body: { kind: 'quick', body: 'hi' } });
    assert.equal(cp.status, 400, label); assert.equal(cp.json.code, 'missing');
    const cPage = await as(c)(`/chat/${s.username}`);
    assert.equal(cPage.status, 404, `${label}: the page is the 404 of a name nobody has`);
    assert.equal(cPage.text.includes('old from staff'), false, label); assert.equal(cPage.text.includes('id="composer"'), false, `${label}: no composer`);
    // the leftover rows go the next time the staff account is seen by a friends page or API
    friends.closedToFriends(fresh(s));
    assert.deepEqual(friendRows(s.id), [], label);
    assert.equal(chat.inbox(fresh(c)).some(t => t.id === s.id), false, label);
    assert.equal(friendUnread(c.id), 0, `${label}: no unread friend message left to light a badge`); assert.equal(friendUnread(s.id), 0);
  }
  assert.equal(q.get("SELECT COUNT(*) n FROM chat_messages WHERE body IN ('hello','hi') AND kind IN ('text','quick')").n, 0, 'nothing was stored');
});

test('the Oomba team thread is untouched: staff still get and answer messages from Oomba', async () => {
  const tu = team.teamUser();
  for (const [sn, s] of Object.entries(STAFF)) {
    q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES (?,?,?,?,'team','ok',?)", uid(14), tu.id, s.id, `A note for ${s.username}`, now());
    const g = await as(s)(`/api/chat/${OFFICIAL}`);
    assert.equal(g.status, 200, sn); assert.ok(g.json.messages.some(m => m.body.includes(`A note for ${s.username}`)), sn);
    const inbox = await as(s)('/chat');
    assert.ok(inbox.text.includes(`href="/chat/${OFFICIAL}"`), `${sn}: the team row is on /chat`);
    assert.equal(/href="\/friends"/.test(inbox.text), false, `${sn}: and no way to Friends`);
    assert.equal(team.canReply(fresh(s)).ok, true, sn);
  }
});

test('an account that becomes staff: its friendships, requests and code end at that moment (invite accepted, role changed, account made)', async () => {
  // 1. a staff invite accepted by someone's own account that already has a friend, a request out and a request in
  const joiner = mk('NewTeacher1'), f1 = mk('FriendOne'), f2 = mk('FriendTwo'), f3 = mk('FriendThree');
  friends.addByCode(joiner, f1.friend_code); friends.accept(f1, joiner.id);
  friends.addByCode(joiner, f2.friend_code); friends.addByCode(f3, joiner.friend_code);
  forceMessage(f1, joiner, 'see you later');
  const g = games.createGame(joiner.id, { title: 'Friends Only' });
  q.run("UPDATE games SET status='published', visibility='friends', published_version_id='v1' WHERE id=?", g.id);
  assert.equal(games.canView(f1, games.getGame(g.id)), true, 'a friend can open a friends-only game');
  assert.equal(friends.list(f1.id).length, 1); assert.equal(navBadges(joiner).requests, 1); assert.equal(friendUnread(joiner.id), 1);
  assert.ok(S.inviteStaff(head, oak.id, joiner.id, 'teacher', { rosterName: 'Mr New' }).ok);
  assert.equal(S.noFriendsAccount(fresh(joiner)), false, 'an invite alone changes nothing');
  assert.equal(friends.list(joiner.id).length, 1);
  assert.ok(S.answerInvite(fresh(joiner), oak.id, true).ok);
  assert.equal(S.noFriendsAccount(fresh(joiner)), true);
  assert.deepEqual(friendRows(joiner.id), [], 'friend, request out and request in are all ended');
  assert.equal(fresh(joiner).friend_code, null);
  assert.equal(friends.list(f1.id).length, 0); assert.equal(friends.outgoing(f3.id).length, 0); assert.equal(friends.incoming(f2.id).length, 0);
  assert.equal(navBadges(fresh(joiner)).requests, 0, 'no request badge is left lit');
  assert.equal(friendUnread(joiner.id), 0, "nor a friend's unread message (the team's welcome to a new teacher is the only unread one)");
  assert.equal(games.canView(fresh(f1), games.getGame(g.id)), false);
  assert.equal(friends.addByCode(f1, joiner.friend_code).ok, false, 'the old code (printed, remembered) finds nobody');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='friend.staff_closed' AND target=?", joiner.id), 'and it is in the audit log');
  // 2. a declined invite changes nothing
  const decliner = mk('NotATeacher'); friends.addByCode(decliner, f1.friend_code); friends.accept(f1, decliner.id);
  S.inviteStaff(head, oak.id, decliner.id, 'teacher'); S.answerInvite(fresh(decliner), oak.id, false);
  assert.equal(S.noFriendsAccount(fresh(decliner)), false); assert.equal(friends.list(decliner.id).length, 1); assert.match(fresh(decliner).friend_code, /^[A-Z0-9]{6}$/);
  // 3. a student whose role is changed to teacher
  const promoted = mk('PromotedOne'); S.addMember(head, oak.id, promoted.id, 'student');
  friends.addByCode(promoted, f2.friend_code); friends.accept(f2, promoted.id);
  assert.equal(friends.list(promoted.id).length, 1);
  assert.ok(S.updateMember(head, oak.id, promoted.id, { role: 'teacher' }).ok);
  assert.deepEqual(friendRows(promoted.id), []); assert.equal(fresh(promoted).friend_code, null);
  // 4. the platform admin adds someone as a school admin at once
  const appointed = mk('AppointedOne'); friends.addByCode(appointed, f3.friend_code); friends.accept(f3, appointed.id);
  S.addMember(boss, oak.id, appointed.id, 'admin');
  assert.deepEqual(friendRows(appointed.id), []); assert.equal(fresh(appointed).friend_code, null);
  // 5. an account made platform admin outside these calls (the seed does this) is closed the first time it is seen
  const seeded = mk('SeededAdmin'); friends.addByCode(seeded, f1.friend_code); friends.accept(f1, seeded.id);
  q.run("UPDATE users SET role='admin' WHERE id=?", seeded.id);
  assert.equal(chat.canChat(fresh(seeded), fresh(f1)).code, 'staff', 'chat is closed even before the rows are cleaned');
  assert.equal((await as(seeded)('/friends')).status, 200);
  assert.deepEqual(friendRows(seeded.id), []); assert.equal(fresh(seeded).friend_code, null);
});

test('an account that stops being staff: a teacher who leaves stays closed; one marked "added by mistake" gets a NEW code and no old friends', async () => {
  const f = mk('StillAKid');
  // leaves the school (removed by the school admin): still a known adult
  const left = mk('LeavingTeacher'); S.addMember(head, oak.id, left.id, 'teacher');
  assert.ok(S.removeMember(head, oak.id, left.id).ok);
  assert.equal(S.isSchoolStaff(fresh(left)), false, 'no longer staff of any school');
  assert.equal(S.noFriendsAccount(fresh(left)), true, 'but still closed to friends');
  assert.equal(friends.addByCode(fresh(left), f.friend_code).error, STAFF_TEXT);
  assert.equal((await as(left)('/api/friends')).status, 403);
  assert.equal(friends.codeOf(fresh(left)), null);
  for (const p of ['/me', '/', '/play']) assert.equal(/href="\/friends"/.test((await as(left)(p)).text), false, `${p}: no Friends tab or tile for a former teacher`);
  assert.ok(/href="\/friends"/.test((await as(f)('/')).text), 'a child keeps the Friends tab');
  // marked "added by mistake" by the school admin (a child added as staff): an ordinary account again
  const mistake = mk('KidByMistake'); const oldCode = mistake.friend_code;
  friends.addByCode(mistake, f.friend_code); friends.accept(f, mistake.id);
  S.addMember(head, oak.id, mistake.id, 'teacher');
  assert.deepEqual(friendRows(mistake.id), []);
  // never by a role change: neither the service nor the route turns staff into a student in place
  assert.equal(S.updateMember(head, oak.id, mistake.id, { role: 'student' }).code, 'badRole');
  assert.equal((await as(head)(`/api/schools/${oak.id}/members/${mistake.id}`, { method: 'POST', body: { role: 'student' } })).status, 400);
  assert.equal(S.noFriendsAccount(fresh(mistake)), true);
  assert.ok(S.notStaff(head, oak.id, mistake.id).ok);
  assert.equal(S.noFriendsAccount(fresh(mistake)), false);
  assert.deepEqual(friendRows(mistake.id), [], 'old friendships do not come back');
  const api = await as(mistake)('/api/friends');
  assert.equal(api.status, 200); assert.match(api.json.code, /^[A-Z0-9]{6}$/); assert.notEqual(api.json.code, oldCode, 'a fresh code, never the old one');
  assert.equal(fresh(mistake).friend_code, api.json.code);
  assert.deepEqual(api.json.friends, []);
});

test('a teacher who is also a parent: the separate grown-up account keeps its grown-up connections, and still never reaches a child', () => {
  const parent = createUser({ username: 'RiveraAtHome', password: 'a-long-password-1', accountType: 'grownup' });
  const other = createUser({ username: 'OtherParent', password: 'a-long-password-1', accountType: 'grownup' });
  assert.equal(S.noFriendsAccount(parent), false, 'a grown-up account is never a school member');
  assert.equal(S.addMember(head, oak.id, parent.id, 'teacher').ok, false, 'and can never be made staff');
  assert.match(friends.codeOf(parent), /^[A-Z0-9]{6}$/);
  assert.equal(friends.addByCode(parent, other.friend_code).state, 'sent'); assert.equal(friends.accept(other, parent.id), true);
  assert.equal(friends.list(parent.id).length, 1);
  assert.equal(friends.addByCode(parent, fresh(kid).friend_code).ok, false, 'grown-up to child: refused as before');
  assert.equal(friends.addByCode(fresh(kid), parent.friend_code).ok, false);
  assert.equal(friends.addByCode(fresh(rivera), other.friend_code).error, STAFF_TEXT, "the teacher's school account cannot connect with grown-ups either");
  assert.equal(friends.addByCode(other, 'ZZZZZ9').error, tEn('friends.api.codeNotFound'));
});

test('migration 0068: old friendships, requests and codes of staff are ended; children keep theirs; team messages stay unread', () => {
  const t1 = mk('OldTeacher'), t2 = mk('OldFormerTeacher'), c1 = mk('OldKidOne'), c2 = mk('OldKidTwo'), adm = mk('OldAdmin');
  // Written the way an old database holds them: staff rows and friend rows side by side.
  q.run("INSERT INTO school_members(school_id, user_id, role, roster_name, grade, status, joined_at) VALUES (?,?,'teacher','','','active',?)", oak.id, t1.id, now());
  q.run("INSERT INTO school_members(school_id, user_id, role, roster_name, grade, status, joined_at, left_at) VALUES (?,?,'admin','','','left',?,?)", oak.id, t2.id, now(), now());
  q.run("UPDATE users SET role='admin' WHERE id=?", adm.id);
  forceFriends(t1, c1); forceRequest(t1, c2); forceRequest(c2, t2); forceFriends(adm, c1); forceFriends(t1, t2); forceFriends(c1, c2);
  const m1 = forceMessage(t1, c1), m2 = forceMessage(c1, c2);
  const tm = uid(14); q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES (?,?,?,?,'team','ok',?)", tm, team.teamUser().id, t1.id, 'Welcome', now());
  q.run("DELETE FROM migrations WHERE name='0068_staff_no_friends_chat_off'"); migrate();
  for (const s of [t1, t2, adm]) { assert.deepEqual(friendRows(s.id), [], s.username); assert.equal(fresh(s).friend_code, null, s.username); }
  assert.deepEqual(friendRows(c1.id).map(r => r.status), ['accepted', 'accepted'], 'the two children are still friends');
  assert.equal(friends.status(c1.id, c2.id), 'friends');
  assert.match(fresh(c1).friend_code, /^[A-Z0-9]{6}$/);
  const readAt = id => q.get('SELECT read_at FROM chat_messages WHERE id=?', id).read_at;
  assert.ok(readAt(m1), 'a friends message with a staff account no longer lights a badge');
  assert.equal(readAt(m2), null, "children's messages are untouched");
  assert.equal(readAt(tm), null, 'a team message to a teacher stays unread');
  assert.ok(q.get('SELECT 1 FROM chat_messages WHERE id=?', m1), 'the message itself is kept (a report may need it)');
});

test('school chat is off by default: new schools, and the Settings tab says so; switching it on is a saved choice', async () => {
  assert.equal(S.DEFAULT_SETTINGS.chat, 'off');
  const sch = S.createSchool(boss, { name: 'Brand New School' }).school;
  assert.equal(S.settingsOf(sch).chat, 'off');
  const admin = S.createSchoolAccount(boss, sch.id, { rosterName: 'New Head', role: 'admin' }).user;
  const t = S.createSchoolAccount(admin, sch.id, { rosterName: 'New Teacher', role: 'teacher' }).user;
  const c = S.createClass(t, sch.id, { name: '3A' }).class;
  const a = S.createSchoolAccount(t, sch.id, { rosterName: 'A' }).user, b = S.createSchoolAccount(t, sch.id, { rosterName: 'B' }).user;
  S.addToClass(t, c.id, a.id); S.addToClass(t, c.id, b.id);
  assert.equal(friends.addByCode(a, b.friend_code).ok, true, 'classmates can still be friends'); friends.accept(b, a.id);
  q.run('UPDATE users SET chat_enabled=1 WHERE id IN (?,?)', a.id, b.id);
  assert.equal(chat.canChat(fresh(a), fresh(b)).code, 'school_off_me', 'but they cannot chat until the school switches it on');
  assert.equal(chat.send(fresh(a), fresh(b), { kind: 'quick', body: 'hi' }).ok, false);
  const page = await as(admin)(`/school/${sch.slug}?tab=settings`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<option value="off" selected[^>]*>/, 'No chat is the selected option');
  assert.ok(inPage(page.text, tEn('school.settings.chatHintOff')), 'with the hint that it is the default');
  assert.equal(page.text.includes('id="chat-notice"'), false, 'a new school gets no notice');
  // a save that does not mention chat (the time zone box) leaves it off
  assert.ok(S.updateSchool(admin, sch.id, { settings: { timeZone: 'Europe/London' } }).ok);
  assert.equal(S.settingsOf(S.getSchool(sch.id)).chat, 'off');
  assert.equal('chat' in JSON.parse(S.getSchool(sch.id).settings), false, 'and stores no chat value: only a real choice is ever stored');
  assert.equal(JSON.parse(S.getSchool(sch.id).settings).timeZone, 'Europe/London');
  assert.ok(S.updateSchool(admin, sch.id, { settings: { chat: 'classmates' } }).ok);
  assert.equal(JSON.parse(S.getSchool(sch.id).settings).chat, 'classmates');
  assert.ok(S.updateSchool(admin, sch.id, { settings: { timeZone: 'Europe/Paris' } }).ok);
  assert.equal(S.settingsOf(S.getSchool(sch.id)).chat, 'classmates', 'a later save about something else keeps the choice');
  assert.equal(chat.canChat(fresh(a), fresh(b)).ok, true, 'the school chose classmates chat');
  assert.equal(chat.canChat(fresh(t), fresh(a)).code, 'staff', 'which never includes its teachers');
});

test('migration 0068, schools: a stored "classmates" nobody chose becomes off (with a notice where chat was in use); a real choice is kept', async () => {
  const mkSchool = (name, settings) => { const s = S.createSchool(boss, { name }).school; q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify(settings), s.id); return s; };
  const save = (s, chatValue, at) => q.run("INSERT INTO audit_log(id, actor_id, action, target, details, created_at) VALUES (?,?,'school.update',?,?,?)", uid(), boss.id, s.id, JSON.stringify({ settings: { chat: chatValue, publishing: 'school' } }), at);
  const never = mkSchool('Never Saved', {});
  // Saved its time zone once: the old code wrote every default into the row, chat:'classmates' included.
  const silent = mkSchool('Saved Something Else', { teachersCreateClasses: true, allowOwnAccounts: true, chat: 'classmates', publishing: 'school', timeZone: 'Europe/Paris' });
  save(silent, 'classmates', 1000);
  const using = mkSchool('Chat In Use', { chat: 'classmates', publishing: 'public' });
  const off = mkSchool('Chose Off', { chat: 'off', publishing: 'school' }); save(off, 'off', 1000);
  const chose = mkSchool('Chose Classmates', { chat: 'classmates', publishing: 'school' }); save(chose, 'off', 1000); save(chose, 'classmates', 2000);
  const wentBack = mkSchool('Back To Off Then Row Edited', { chat: 'classmates' }); save(wentBack, 'off', 1000); save(wentBack, 'classmates', 2000); save(wentBack, 'off', 3000);
  const usingAdmin = S.createSchoolAccount(boss, using.id, { rosterName: 'Head', role: 'admin' }).user;
  const u1 = S.createSchoolAccount(usingAdmin, using.id, { rosterName: 'U1' }).user, u2 = S.createSchoolAccount(usingAdmin, using.id, { rosterName: 'U2' }).user;
  forceMessage(u1, u2, 'good game');
  q.run("DELETE FROM migrations WHERE name='0068_staff_no_friends_chat_off'"); migrate();
  const stored = s => JSON.parse(S.getSchool(s.id).settings);
  const st = s => S.settingsOf(S.getSchool(s.id));
  assert.equal(st(never).chat, 'off'); assert.equal(st(never).chatNotice, false);
  assert.equal(st(silent).chat, 'off', 'a default the old code wrote is not a choice'); assert.equal('chat' in stored(silent), false);
  assert.equal(st(silent).chatNotice, false, 'nobody was chatting there: no notice');
  assert.equal(stored(silent).timeZone, 'Europe/Paris', 'its other settings are untouched'); assert.equal(stored(using).publishing, 'public');
  assert.equal(st(using).chat, 'off', 'the safer reading, even where chat was in use'); assert.equal(st(using).chatNotice, true, 'and that school is told');
  assert.equal(st(off).chat, 'off'); assert.equal(st(off).chatNotice, false);
  assert.equal(st(chose).chat, 'classmates', 'saved No chat and later classmates: its own choice, kept');
  assert.equal(st(wentBack).chat, 'off', 'the last save in the log was No chat');
  // the notice on the Settings tab and (short) on the school's other tabs, until an admin switches chat on or dismisses it
  const before = await as(usingAdmin)(`/school/${using.slug}?tab=settings`);
  assert.ok(before.text.includes('id="chat-notice"'), 'the school that was chatting sees the notice');
  assert.ok(inPage(before.text, tEn('school.settings.chatNotice')));
  assert.equal((await as(boss)(`/school/${silent.slug}?tab=settings`)).text.includes('id="chat-notice"'), false);
  const main = await as(usingAdmin)(`/school/${using.slug}`);
  assert.ok(main.text.includes('id="chat-off-notice"'), "the school's main page says so too"); assert.ok(inPage(main.text, tEn('school.settings.chatNoticeShort')));
  assert.ok(main.text.includes(`href="/school/${using.slug}?tab=settings#set-chat"`));
  assert.equal((await as(boss)(`/school/${silent.slug}`)).text.includes('id="chat-off-notice"'), false);
  // Saving something else (the form always sends the Chat box, still on "No chat") does not clear the notice
  const tz = await as(usingAdmin)(`/api/schools/${using.id}/settings`, { method: 'POST', body: { chat: 'off', timeZone: 'Europe/Paris' } });
  assert.equal(tz.status, 200); assert.equal(st(using).timeZone, 'Europe/Paris'); assert.equal(st(using).chat, 'off');
  assert.equal(st(using).chatNotice, true, 'a save that leaves chat off keeps the notice');
  assert.ok((await as(usingAdmin)(`/school/${using.slug}?tab=settings`)).text.includes('id="chat-notice"'));
  // "Keep chat off" dismisses it and changes nothing else
  const using2 = mkSchool('Chat In Use Two', { chatNotice: true, publishing: 'public' });
  assert.ok((await as(boss)(`/school/${using2.slug}?tab=settings`)).text.includes('form="chat-notice-seen"'));
  assert.equal((await as(boss)(`/api/schools/${using2.id}/settings`, { method: 'POST', body: { chatNotice: 'seen' } })).status, 200);
  assert.equal(st(using2).chatNotice, false); assert.equal(st(using2).chat, 'off'); assert.equal(stored(using2).publishing, 'public');
  assert.equal('chat' in stored(using2), false, 'dismissing stores no chat choice');
  assert.equal((await as(boss)(`/school/${using2.slug}`)).text.includes('id="chat-off-notice"'), false);
  const saved = await as(usingAdmin)(`/api/schools/${using.id}/settings`, { method: 'POST', body: { chat: 'classmates' } });
  assert.equal(saved.status, 200, saved.text.slice(0, 200));
  assert.equal(st(using).chat, 'classmates'); assert.equal(st(using).chatNotice, false);
  assert.equal((await as(usingAdmin)(`/school/${using.slug}?tab=settings`)).text.includes('id="chat-notice"'), false, 'gone once they have switched chat on');
  assert.equal((await as(usingAdmin)(`/school/${using.slug}`)).text.includes('id="chat-off-notice"'), false);
});

test('a child who accepts a staff invite: warned before Accept, and the school admin can put it right in the product ("Added by mistake")', async () => {
  const child = mk('InvitedKid'), pal = mk('InvitedKidPal');
  friends.addByCode(child, pal.friend_code); friends.accept(pal, child.id);
  const oldCode = child.friend_code;
  assert.ok(S.inviteStaff(head, oak.id, child.id, 'teacher', { rosterName: 'Sam Real-Name' }).ok);
  // The prompt says what accepting costs, in the text and again as the Accept button's confirm question
  const warn = tEn('school.invite.warn');
  assert.match(warn, /no friends and no chat/); assert.match(warn, /friend code/);
  const prompt = await as(child)('/classes');
  assert.ok(prompt.text.includes('id="my-invites"')); assert.ok(inPage(prompt.text, warn));
  assert.match(prompt.text, new RegExp(`data-api="/api/staff-invites/${oak.id}/accept" data-confirm="[^"]+"`));
  // The child accepts all the same: friends and code go at once
  assert.equal((await as(child)(`/api/staff-invites/${oak.id}/accept`, { method: 'POST', body: {} })).status, 200);
  assert.equal(S.noFriendsAccount(fresh(child)), true); assert.deepEqual(friendRows(child.id), []); assert.equal((await as(child)('/api/friends')).status, 403);
  // Only this school's admin (or the platform admin) can undo it: not a teacher, not another school's admin, not the person
  const api = `/api/schools/${oak.id}/members/${child.id}/not-staff`;
  for (const [who, u] of Object.entries({ teacher: rivera, 'another school\'s admin': critic, 'the person': child, 'a child': pal })) {
    assert.equal((await as(u)(api, { method: 'POST', body: {} })).status, 404, who);
    assert.equal(S.noFriendsAccount(fresh(child)), true, who);
  }
  assert.equal((await as(head)(`/api/schools/${oak.id}/members/${head.id}/not-staff`, { method: 'POST', body: {} })).status, 400, 'never yourself');
  assert.equal((await as(head)(`/api/schools/${oak.id}/members/${rivera.id}/not-staff`, { method: 'POST', body: {} })).status, 400, 'never an account the school made as staff');
  assert.equal(S.noFriendsAccount(fresh(rivera)), true); assert.ok(S.membership(oak.id, rivera.id));
  assert.equal((await as(head)(`/api/schools/${oak.id}/members/${student.id}/not-staff`, { method: 'POST', body: {} })).status, 404, 'a student is not staff');
  // The People tab offers it on the person's row
  const people = await as(head)(`/school/${oak.slug}?tab=people`);
  assert.ok(people.text.includes(`data-api="${api}"`), 'the button is on the People tab');
  assert.equal(people.text.includes(`/members/${rivera.id}/not-staff`), false, 'not for school-made staff accounts');
  const done = await as(head)(api, { method: 'POST', body: {} });
  assert.equal(done.status, 200, done.text.slice(0, 200));
  assert.equal(S.noFriendsAccount(fresh(child)), false); assert.equal(S.membership(oak.id, child.id), null);
  assert.equal(q.get('SELECT 1 FROM school_members WHERE school_id=? AND user_id=?', oak.id, child.id), undefined, "the school's staff record of the child (real name included) is gone");
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='school.member_not_staff' AND target=?", oak.id));
  const mine = await as(child)('/api/friends');
  assert.equal(mine.status, 200); assert.match(mine.json.code, /^[A-Z0-9]{6}$/); assert.notEqual(mine.json.code, oldCode); assert.deepEqual(mine.json.friends, []);
  assert.equal(friends.addByCode(fresh(pal), mine.json.code).state, 'sent', 'and can make friends again');
  assert.equal(friends.accept(fresh(child), pal.id), true);
  assert.equal(chat.canChat(fresh(child), fresh(pal)).ok, true);

  // The admin had already REMOVED the child before knowing about the button: the child is listed under "Removed staff"
  const child2 = mk('InvitedKidTwo');
  S.inviteStaff(head, oak.id, child2.id, 'teacher'); assert.equal((await as(child2)(`/api/staff-invites/${oak.id}/accept`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await as(head)(`/api/schools/${oak.id}/members/${child2.id}/remove`, { method: 'POST', body: {} })).status, 200);
  assert.equal(S.noFriendsAccount(fresh(child2)), true, 'removing alone does not undo it');
  const after = await as(head)(`/school/${oak.slug}?tab=people`);
  assert.ok(after.text.includes('id="former-staff"')); assert.ok(after.text.includes(`data-api="/api/schools/${oak.id}/members/${child2.id}/not-staff"`));
  assert.equal(after.text.includes(`/members/${child.id}/not-staff`), false, 'the first child is no longer listed anywhere');
  assert.equal((await as(boss)(`/api/schools/${oak.id}/members/${child2.id}/not-staff`, { method: 'POST', body: {} })).status, 200, 'the platform admin can do it too');
  assert.equal(S.noFriendsAccount(fresh(child2)), false);
  assert.equal((await as(head)(`/school/${oak.slug}?tab=people`)).text.includes(`/members/${child2.id}/not-staff`), false);
  // Staff somewhere else as well: still a staff account
  const two = mk('TwoSchools'); S.addMember(boss, oak.id, two.id, 'teacher'); S.addMember(critic, criticSchool.id, two.id, 'teacher');
  const r = S.notStaff(head, oak.id, two.id); assert.ok(r.ok); assert.equal(r.stillStaff, true); assert.equal(S.noFriendsAccount(fresh(two)), true);
});

test('a former teacher never becomes a student by a join request or by being added again: only "Added by mistake" ends staff status', async () => {
  const ex = mk('ExTeacher'), child = mk('CuriousKid');
  S.addMember(head, oak.id, ex.id, 'teacher', { rosterName: 'Mr Ex' });
  assert.ok(S.removeMember(head, oak.id, ex.id).ok);
  assert.equal(S.addMember(rivera, oak.id, ex.id, 'student').code, 'wasStaff');
  q.run("INSERT INTO join_requests(id, class_id, user_id, status, created_at) VALUES (?,?,?,'pending',?)", 'jr-ex-teacher', cls.id, ex.id, now());
  const svc = S.approveRequest(rivera, 'jr-ex-teacher'); assert.equal(svc.ok, false); assert.equal(svc.code, 'wasStaff');
  const http = await as(rivera)('/api/join-requests/jr-ex-teacher/approve', { method: 'POST', body: { rosterName: 'Mr Ex' } });
  assert.equal(http.status, 400); assert.equal(http.json.error, tEn('school.errors.wasStaff'));
  assert.equal(q.get("SELECT status FROM join_requests WHERE id='jr-ex-teacher'").status, 'pending');
  assert.equal(q.get('SELECT role, status FROM school_members WHERE school_id=? AND user_id=?', oak.id, ex.id).role, 'teacher');
  assert.equal(S.noFriendsAccount(fresh(ex)), true); assert.equal(friends.codeOf(fresh(ex)), null);
  assert.equal(friends.addByCode(fresh(ex), child.friend_code).error, STAFF_TEXT);
  // back as staff is still allowed (re-hired)
  assert.ok(S.addMember(head, oak.id, ex.id, 'teacher').ok);
});

test('a staff account that still holds rows (made the platform admin straight in the database): children never see it, and the seed ends the rows', async () => {
  const promoted = mk('PromotedRaw'), a = mk('SeesNothingA'), b = mk('SeesNothingB'), c = mk('SeesNothingC');
  friends.addByCode(promoted, a.friend_code);                                        // pending: promoted -> a
  friends.addByCode(promoted, b.friend_code); friends.accept(b, promoted.id);         // friends with b
  friends.addByCode(c, promoted.friend_code);                                         // pending: c -> promoted
  q.run("UPDATE users SET role='admin' WHERE id=?", promoted.id);                     // no clean-up ran
  assert.equal(friendRows(promoted.id).length, 4, 'the rows are still there');
  assert.deepEqual(friends.incoming(a.id), []); assert.equal(friends.incomingCount(a.id), 0); assert.equal(navBadges(fresh(a)).requests, 0, 'no badge for a request nobody can see');
  assert.deepEqual(friends.list(b.id), []); assert.equal(friends.count(b.id), 0);
  assert.deepEqual(friends.outgoing(c.id), []);
  assert.equal(friendRows(promoted.id).length, 4, 'and reading the lists was not what hid them');
  const page = await as(a)('/friends'); assert.equal(page.status, 200); assert.equal(page.text.includes('PromotedRaw'), false);
  assert.deepEqual((await as(b)('/api/friends')).json.friends, []);
  // the seed promotes the configured admin username: its rows end there and then
  const { config } = await import('../../server/config.js');
  const { seedAdmin } = await import('../../scripts/seed.js');
  const named = createUser({ username: config.adminUsername, password: 'a-long-password-2' });
  q.run("UPDATE users SET role='player', friend_code='SEED01' WHERE id=?", named.id);
  forceFriends(named, a); forceRequest(named, c);
  seedAdmin();
  assert.equal(fresh(named).role, 'admin'); assert.deepEqual(friendRows(named.id), []); assert.equal(fresh(named).friend_code, null);
});

test('a staff account has no chat page for a child: /chat/<staff> is the same 404 as a name nobody has', async () => {
  for (const [sn, s] of Object.entries(STAFF)) {
    forceFriends(s, kid);
    const r = await as(kid)(`/chat/${s.username}`), none = await as(kid)('/chat/NoSuchPlayer99');
    assert.equal(r.status, 404, sn); assert.equal(none.status, 404);
    assert.equal(r.text.includes('class="threadhead"'), false, `${sn}: no thread header (it carried the display name and @username)`);
    assert.equal(r.text.includes(`href="/u/${s.username}"`), false, sn);
    const strip = (t, name) => t.split(name).join('~');   // the two 404 pages differ only by the address they echo
    assert.equal(strip(r.text, s.username).length, strip(none.text, 'NoSuchPlayer99').length, `${sn}: the same page as a name nobody has`);
    assert.equal(r.text.includes('id="msgs"'), false);
    q.run('DELETE FROM friends WHERE user_id=? OR friend_id=?', s.id, s.id);
  }
  assert.equal((await as(kid)(`/chat/${OFFICIAL}`)).status, 200, 'the Oomba team thread is still there');
});
