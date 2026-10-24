// Schools: who can do what, school accounts, class codes and join requests (with matching to a school account),
// moves between classes, and the school rules on the game site (friends, chat, sharing, photos).
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession, getUser, verifyPassword } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const friends = await import('../../server/services/friends.js');
const chat = await import('../../server/services/chat.js');
const photos = await import('../../server/services/photos.js');
const { publish } = await import('../../server/services/publish.js');
const { parseNames } = await import('../../server/routes/schools.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'PlatformBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Hill Primary' }).school;
const elm = S.createSchool(boss, { name: 'Elm Street School' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
const rivera = S.createSchoolAccount(head, oak.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user;
const chen = S.createSchoolAccount(head, oak.id, { rosterName: 'Mr Chen', role: 'teacher' }).user;
const elmTeacher = S.createSchoolAccount(boss, elm.id, { rosterName: 'Elm Teacher', role: 'teacher' }).user;

test('school accounts: kid-safe usernames, word passwords, real names only on the roster', () => {
  const r = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Ana Silva', grade: '4' });
  assert.ok(r.ok); assert.match(r.username, /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/); assert.match(r.password, /^[a-z]+-[a-z]+-\d{2}$/);
  assert.equal(r.user.display_name, r.username, 'the real name never becomes the public name');
  assert.equal(r.user.managed_school, oak.id);
  assert.ok(verifyPassword(getUser(r.user.id), r.password));
  assert.equal(S.membership(oak.id, r.user.id).roster_name, 'Ana Silva');
  assert.deepEqual(parseNames('Ana Silva\nBen, Chloe;  Dan  \n\n'), ['Ana Silva', 'Ben', 'Chloe', 'Dan']);
});

test('permissions: platform admin, school admin, teachers (own classes only), students, other schools', () => {
  const c = S.createClass(rivera, oak.id, { name: '4B Maths', grade: '4' }).class;
  assert.ok(S.teaches(rivera, c.id), 'the creator teaches the class');
  assert.ok(S.canManageClass(rivera, c)); assert.ok(S.canManageClass(head, c)); assert.ok(S.canManageClass(boss, c));
  assert.equal(S.canManageClass(chen, c), false, 'another teacher of the same school cannot run it');
  assert.equal(S.canManageClass(elmTeacher, c), false);
  assert.ok(S.canManageSchool(head, oak.id)); assert.equal(S.canManageSchool(rivera, oak.id), false); assert.equal(S.canManageSchool(head, elm.id), false);
  assert.ok(S.canCreateClass(rivera, oak.id));
  S.updateSchool(head, oak.id, { settings: { teachersCreateClasses: false } });
  assert.equal(S.canCreateClass(rivera, oak.id), false); assert.ok(S.canCreateClass(head, oak.id));
  S.updateSchool(head, oak.id, { settings: { teachersCreateClasses: true } });
  const st = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Kid One' }).user;
  S.addToClass(rivera, c.id, st.id);
  assert.ok(S.canViewClass(st, c)); assert.equal(S.canManageClass(st, c), false);
  assert.ok(S.canManageStudent(rivera, oak.id, st.id)); assert.equal(S.canManageStudent(chen, oak.id, st.id), false);
  // a removed teacher loses the class even if a class_members row lingers
  S.removeMember(head, oak.id, chen.id); assert.equal(S.roleIn(chen, oak.id), null);
  assert.equal(S.addMember(head, oak.id, elmTeacher.id, 'teacher').code, 'otherSchoolAccount', 'school accounts stay in their school');
  assert.equal(getUser(chen.id).banned, 1, 'a school account removed from its school is switched off');
});

test('moving classes keeps history; deleting only empty classes; archive hides from students', () => {
  const a = S.createClass(rivera, oak.id, { name: 'Year 4 Science' }).class, bcls = S.createClass(rivera, oak.id, { name: 'Year 5 Science' }).class;
  const kid = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Mover' }).user;
  S.addToClass(rivera, a.id, kid.id);
  assert.ok(S.moveStudent(rivera, a.id, bcls.id, kid.id).ok);
  assert.equal(S.classMember(a.id, kid.id), null); assert.ok(S.classMember(bcls.id, kid.id));
  assert.equal(q.get('SELECT status FROM class_members WHERE class_id=? AND user_id=?', a.id, kid.id).status, 'left', 'old class keeps the record');
  assert.equal(S.moveStudent(rivera, bcls.id, S.createClass(elmTeacher, elm.id, { name: 'Elm' }).class.id, kid.id).code, 'otherSchool');
  assert.equal(S.deleteClass(rivera, a.id).code, 'classHasStudents');
  const empty = S.createClass(rivera, oak.id, { name: 'Empty' }).class; assert.ok(S.deleteClass(rivera, empty.id).ok);
  S.archiveClass(rivera, bcls.id); assert.equal(S.canViewClass(kid, S.getClass(bcls.id)), false); assert.ok(S.canManageClass(rivera, S.getClass(bcls.id)));
});

test('own accounts join with a code: teacher approves, real name stays private; matching merges the school account', () => {
  const c = S.createClass(rivera, oak.id, { name: '4C Reading' }).class;
  const kid = createUser({ username: 'RocketKid', password: 'secret123' });
  assert.equal(S.requestJoin(createGuest(), c.join_code).code, 'noAccount');
  assert.equal(S.requestJoin(kid, 'NOPE00').code, 'badCode');
  assert.equal(S.requestJoin(kid, c.join_code.toLowerCase().split('').join(' ')).state, 'pending', 'codes forgive case and spaces');
  assert.equal(S.requestJoin(kid, c.join_code).state, 'pending', 'asking twice is harmless');
  assert.equal(S.classMember(c.id, kid.id), null, 'nobody walks in without approval');
  const placeholder = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Rocket Real' });
  S.addToClass(rivera, c.id, placeholder.user.id);
  const req = S.pendingRequests(c.id)[0];
  assert.ok(S.approveRequest(rivera, req.id, { sameAs: placeholder.user.id }).ok);
  assert.ok(S.classMember(c.id, kid.id)); assert.equal(S.membership(oak.id, kid.id).roster_name, 'Rocket Real');
  assert.equal(getUser(kid.id).display_name, 'RocketKid', 'public name unchanged');
  assert.equal(getUser(kid.id).managed_school, '', 'still their own account');
  assert.equal(getUser(placeholder.user.id).banned, 1); assert.equal(S.classMember(c.id, placeholder.user.id), null);
  // now a school member: other classes of the school are joined straight away
  const c2 = S.createClass(rivera, oak.id, { name: '4C Art' }).class;
  assert.equal(S.requestJoin(kid, c2.join_code).state, 'joined');
  // schools can require school accounts only
  S.updateSchool(boss, elm.id, { settings: { allowOwnAccounts: false } });
  const e = S.createClass(elmTeacher, elm.id, { name: 'Elm 1' }).class;
  assert.equal(S.requestJoin(createUser({ username: 'OtherKid', password: 'secret123' }), e.join_code).code, 'ownAccountsOff');
  // a school account cannot join another school's class
  assert.equal(S.requestJoin(placeholder.user.id && S.createSchoolAccount(rivera, oak.id, { rosterName: 'X' }).user, e.join_code).code, 'otherSchoolAccount');
});

test('game-site rules: school accounts befriend classmates only, chat can be off, sharing stays in school, classmates see photos', async () => {
  const c = S.createClass(rivera, oak.id, { name: 'Rules class' }).class;
  const a = S.createSchoolAccount(rivera, oak.id, { rosterName: 'A' }).user, b2 = S.createSchoolAccount(rivera, oak.id, { rosterName: 'B' }).user;
  const outsider = createUser({ username: 'Outsider', password: 'secret123' });
  S.addToClass(rivera, c.id, a.id); S.addToClass(rivera, c.id, b2.id);
  assert.equal(friends.addByCode(a, outsider.friend_code).ok, false);
  assert.equal(friends.addByCode(outsider, a.friend_code).ok, false, 'both directions');
  assert.ok(friends.addByCode(a, b2.friend_code).ok); friends.accept(b2, a.id);
  q.run('UPDATE users SET chat_enabled=1 WHERE id IN (?,?)', a.id, b2.id);
  assert.ok(chat.canChat(a, b2).ok);
  S.updateSchool(head, oak.id, { settings: { chat: 'off' } });
  assert.equal(chat.canChat(a, b2).code, 'school_off_me');
  S.updateSchool(head, oak.id, { settings: { chat: 'classmates' } });
  // sharing
  assert.deepEqual(S.sharingOptions(a), ['private', 'friends', 'school']);
  assert.deepEqual(S.sharingOptions(outsider), ['private', 'friends', 'public']);
  const g = games.createGame(a.id, { title: 'Class Game' });
  games.addVersion(g.id, '<title>x</title><p>hi</p><script>1</script>', { createdBy: a.id, safetyStatus: 'pass' });
  assert.equal((await publish(a, g.id, 'public')).ok, false, 'no public games for school accounts by default');
  assert.ok((await publish(a, g.id, 'school')).ok);
  const live = games.getGame(g.id);
  assert.ok(games.canView(rivera, live), 'schoolmates can play'); assert.equal(games.canView(outsider, live), false); assert.equal(games.canView(null, live), false);
  assert.ok(games.listVisible(b2, { limit: 200 }).some(x => x.id === g.id)); assert.ok(!games.listVisible(outsider, { limit: 200 }).some(x => x.id === g.id));
  S.updateSchool(head, oak.id, { settings: { publishing: 'public' } });
  assert.ok(S.sharingOptions(a).includes('public'));
  // photos
  q.run('UPDATE users SET photo_at=1 WHERE id=?', a.id);
  assert.ok(photos.canSeePhoto(b2, getUser(a.id))); assert.ok(photos.canSeePhoto(rivera, getUser(a.id))); assert.equal(photos.canSeePhoto(outsider, getUser(a.id)), false);
});

test('pages: school console for admins, teacher pages for teachers, student class page, join over HTTP, 404 for others', async () => {
  const c = S.createClass(rivera, oak.id, { name: 'Web Class', grade: '4' }).class;
  const kid = createUser({ username: 'WebKid', password: 'secret123' });
  let r = await as(head)(`/school/${oak.slug}`); assert.equal(r.status, 200); assert.match(r.text, /Web Class/);
  for (const tab of ['people', 'settings']) assert.equal((await as(head)(`/school/${oak.slug}?tab=${tab}`)).status, 200);
  assert.equal((await as(rivera)(`/school/${oak.slug}`)).status, 404, 'teachers are not school admins');
  assert.equal((await as(kid)(`/school/${oak.slug}`)).status, 404);
  assert.equal((await as(boss)('/admin/schools')).status, 200); assert.equal((await as(head)('/admin/schools')).status, 404);
  r = await as(rivera)('/teach'); assert.equal(r.status, 200); assert.match(r.text, /Web Class/);
  assert.equal((await as(kid)('/teach')).status, 404);
  r = await as(rivera)(`/class/${c.id}`); assert.match(r.text, /classtabs/); assert.match(r.text, /Lessons/);
  r = await as(rivera)(`/class/${c.id}?tab=students`); assert.match(r.text, new RegExp(c.join_code)); assert.match(r.text, /New school accounts/);
  r = await as(rivera)(`/class/${c.id}?tab=settings`); assert.match(r.text, /Class details/); assert.match(r.text, /Archive this class/);
  assert.equal((await as(kid)(`/class/${c.id}`)).status, 404, 'not in the class yet');
  // add students by name -> login cards (shown once, only to the teacher who made them)
  r = await as(rivera)(`/api/classes/${c.id}/students`, { method: 'POST', body: { names: 'Lia Park\nOmar Diaz', grade: '4' } });
  assert.equal(r.status, 200); assert.match(r.json.redirect, /^\/cards\//);
  const cards = await as(rivera)(r.json.redirect); assert.match(cards.text, /Lia Park/); assert.match(cards.text, /[a-z]+-[a-z]+-\d{2}/);
  assert.equal((await as(head)(r.json.redirect)).status, 404, 'cards are for their creator only');
  // a student joins with their own account; the teacher approves with a real name
  r = await as(kid)('/api/classes/join', { method: 'POST', body: { code: c.join_code } }); assert.equal(r.json && r.json.state, 'pending', r.text);
  r = await as(kid)('/classes'); assert.match(r.text, /Waiting for your teacher/);
  const reqId = S.pendingRequests(c.id)[0].id;
  assert.equal((await as(elmTeacher)(`/api/join-requests/${reqId}/approve`, { method: 'POST', body: { rosterName: 'Web Kid' } })).status, 404);
  r = await as(rivera)(`/api/join-requests/${reqId}/approve`, { method: 'POST', body: { rosterName: 'Wendy Kidd' } }); assert.equal(r.status, 200);
  r = await as(kid)(`/class/${c.id}`); assert.equal(r.status, 200); assert.match(r.text, /No lessons yet/);
  assert.doesNotMatch(r.text, /Wendy Kidd|Lia Park|Omar Diaz/, 'students never see real names');
  assert.match((await as(rivera)(`/class/${c.id}?tab=students`)).text, /Wendy Kidd/);
  // nav: school people get a Classes tab
  assert.match((await as(kid)('/')).text, /href="\/classes"/); assert.match((await as(rivera)('/')).text, /href="\/teach"/);
  assert.doesNotMatch((await as(createUser({ username: 'NoSchoolKid', password: 'secret123' }))('/')).text, /href="\/classes"[^>]*class="tab"|class="tab" href="\/classes"/);
});

test('school page and class flows: who teaches a new class, adding staff, duplicate names, ticked students, class cards, leaving, deleting', async () => {
  const kim = S.createSchoolAccount(head, oak.id, { rosterName: 'Ms Kim', role: 'teacher' }).user;
  // A class made on the school page names its teacher (the admin doesn't become its teacher); "none" leaves it without one.
  let r = await as(head)('/api/classes', { method: 'POST', body: { schoolId: oak.id, name: 'Set Up Class', teacherId: '' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'teacherId');
  r = await as(head)('/api/classes', { method: 'POST', body: { schoolId: oak.id, name: 'Set Up Class', teacherId: elmTeacher.id } });
  assert.equal(r.status, 400, 'only staff of this school'); assert.equal(r.json.field, 'teacherId');
  r = await as(head)('/api/classes', { method: 'POST', body: { schoolId: oak.id, name: 'Set Up Class', teacherId: kim.id } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.redirect, `/school/${oak.slug}`); assert.match(r.json.toast, /Set Up Class/);
  const setup = S.classesOfSchool(oak.id).find(c => c.name === 'Set Up Class');
  assert.deepEqual(S.roster(setup.id).map(p => p.id), [kim.id]);
  r = await as(head)('/api/classes', { method: 'POST', body: { schoolId: oak.id, name: 'Nobody Yet', teacherId: 'none' } });
  assert.equal(r.status, 200); assert.equal(S.roster(S.classesOfSchool(oak.id).find(c => c.name === 'Nobody Yet').id).length, 0);
  assert.match((await as(head)(`/school/${oak.slug}`)).text, /No teacher/);
  assert.equal((await as(rivera)('/api/classes', { method: 'POST', body: { schoolId: oak.id, name: 'X', teacherId: kim.id } })).status, 404, 'only school admins pick a teacher');

  // Adding staff with an existing account: a toast, and a plain error when they're already staff.
  const own = createUser({ username: 'MsOwnAccount', password: 'secret123' });
  r = await as(head)(`/api/schools/${oak.id}/staff`, { method: 'POST', body: { account: 'existing', rosterName: 'Ms Own', role: 'teacher', username: '' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'username');
  r = await as(head)(`/api/schools/${oak.id}/staff`, { method: 'POST', body: { account: 'existing', rosterName: 'Ms Own', role: 'teacher', username: 'MsOwnAccount' } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /Ms Own added as Teacher/); assert.equal(S.membership(oak.id, own.id).role, 'teacher');
  r = await as(head)(`/api/schools/${oak.id}/staff`, { method: 'POST', body: { account: 'existing', rosterName: 'Ms Own', role: 'admin', username: 'MsOwnAccount' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /already staff here \(Teacher\)/); assert.equal(S.membership(oak.id, own.id).role, 'teacher', 'unchanged');
  r = await as(head)(`/api/schools/${oak.id}/staff`, { method: 'POST', body: { rosterName: 'Mr New', role: 'teacher', username: 'MsOwnAccount' } });
  assert.match(r.json.redirect, /^\/cards\//, 'without account=existing a school account is made (the username field is ignored)');
  assert.match((await as(head)(r.json.redirect)).text, /Back to People/);

  // Typing a name that is already a student at the school: one 400 naming every match, and nothing is created.
  const c = S.createClass(rivera, oak.id, { name: 'Flow Class', grade: '5' }).class;
  const before = S.members(oak.id, 'student').length;
  r = await as(rivera)(`/api/classes/${c.id}/students`, { method: 'POST', body: { names: 'Brand New\nana silva', grade: '5' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'names'); assert.match(r.json.error, /Ana Silva \(@/);
  assert.equal(S.members(oak.id, 'student').length, before, 'all or nothing');
  // Ticking students already at the school adds them all (repeated field names arrive as an array).
  const a = S.createSchoolAccount(head, oak.id, { rosterName: 'Tick One' }).user, bb = S.createSchoolAccount(head, oak.id, { rosterName: 'Tick Two' }).user;
  const page = (await as(rivera)(`/class/${c.id}?tab=students`)).text;
  assert.match(page, /Students already at Oak Hill Primary/); assert.match(page, /Not in a class/);
  r = await as(rivera)(`/api/classes/${c.id}/students`, { method: 'POST', body: { existing: [a.id, bb.id] } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /2 students added/);
  assert.ok(S.classMember(c.id, a.id) && S.classMember(c.id, bb.id));
  assert.equal((await as(rivera)(`/api/classes/${c.id}/students`, { method: 'POST', body: { existing: [elmTeacher.id] } })).status, 400, 'only students of this school');
  // People-tab students can go straight into a class; their cards go back to People.
  r = await as(head)(`/api/schools/${oak.id}/students`, { method: 'POST', body: { names: 'Placed Kid', classId: c.id } });
  assert.equal(r.status, 200); const placed = S.members(oak.id, 'student').find(p => p.roster_name === 'Placed Kid');
  assert.ok(S.classMember(c.id, placed.id)); const pc = (await as(head)(r.json.redirect)).text;
  assert.match(pc, /Back to People/); assert.match(pc, /Oak Hill Primary · Flow Class/);

  // New login cards for the whole class: only school accounts, old passwords stop working; own accounts are listed as skipped.
  const kid = createUser({ username: 'FlowOwnKid', password: 'secret123' });
  S.addMember(head, oak.id, kid.id, 'student', { rosterName: 'Own Kid' }); S.addToClass(head, c.id, kid.id, 'student');
  const oldHash = getUser(a.id).password_hash;
  r = await as(rivera)(`/api/classes/${c.id}/cards`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); const cards = (await as(rivera)(r.json.redirect)).text;
  assert.equal((cards.match(/class="logincard"/g) || []).length, 3); assert.match(cards, /Own Kid/); assert.match(cards, /Back to Flow Class/);
  assert.notEqual(getUser(a.id).password_hash, oldHash); assert.ok(verifyPassword(getUser(kid.id), 'secret123'), 'own accounts keep their password');
  assert.equal((await as(elmTeacher)(`/api/classes/${c.id}/cards`, { method: 'POST', body: {} })).status, 404);

  // Moving asks for a class; leaving a class you co-teach goes back to My classes.
  const sid = S.roster(c.id).find(p => p.role === 'student').id;
  assert.equal((await as(rivera)(`/api/classes/${c.id}/students/${sid}/move`, { method: 'POST', body: { to: '' } })).status, 400);
  r = await as(rivera)(`/api/classes/${c.id}/students/${sid}/move`, { method: 'POST', body: { to: setup.id } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /moved to Set Up Class/);
  S.addToClass(head, c.id, kim.id, 'teacher');
  r = await as(rivera)(`/api/classes/${c.id}/students/${rivera.id}/remove`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.equal(r.json.redirect, '/teach'); assert.ok(!S.teaches(rivera, c.id));
  assert.equal((await as(kim)(`/api/classes/${c.id}/students/${kim.id}/remove`, { method: 'POST', body: {} })).status, 400, 'the last teacher stays');

  // Deleting: only a class that never had students; afterwards back to the school page (school admin) or My classes.
  const empty = S.createClass(rivera, oak.id, { name: 'Oops Class' }).class;
  assert.match((await as(rivera)(`/class/${empty.id}?tab=settings`)).text, /Delete class|data-api="\/api\/classes\/[^/]+\/delete"/);
  assert.doesNotMatch((await as(kim)(`/class/${c.id}?tab=settings`)).text, /\/delete"/, 'no delete for a class that had students');
  r = await as(rivera)(`/api/classes/${empty.id}/delete`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.equal(r.json.redirect, '/teach'); assert.equal(S.getClass(empty.id), null);
  const empty2 = S.createClass(head, oak.id, { name: 'Oops Two', teacherId: 'none' }).class;
  assert.equal((await as(head)(`/api/classes/${empty2.id}/delete`, { method: 'POST', body: { from: 'school' } })).json.redirect, `/school/${oak.slug}`);

  // Archived classes stay reachable from My classes, with a banner and Restore on the class.
  S.archiveClass(head, setup.id, true);
  assert.match((await as(kim)('/teach')).text, /1 archived class/);
  assert.match((await as(kim)(`/class/${setup.id}`)).text, /This class is archived/);

  // The platform admin works from Schools; staff without student classes go to My classes.
  assert.equal((await as(boss)('/teach')).status, 302);
  assert.equal((await as(rivera)('/classes')).status, 302);
  assert.equal((await as(boss)('/api/classes/join', { method: 'POST', body: { code: c.join_code } })).status, 400);
  // A school admin who doesn't teach a class gets back to the school page from it.
  assert.match((await as(head)(`/class/${c.id}`)).text, new RegExp(`href="/school/${oak.slug}"`));
});
