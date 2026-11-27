// Oomba's class and roster actions (services/companion-actions/classes.js): newJoinCode, archiveClass, restoreClass,
// resetPassword, removeStudent, moveStudent, addCoTeacher, approveJoin, declineJoin. Each: the card first and nothing
// before the tap, the tap does it with the route's own service (read back), Undo where there is one, refusals that end
// "Nothing was changed.", and no student's name, password or join code reaching the AI or the stored chat.
// Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const S = await import('../../server/services/schools.js');
const { createUser, getUser, verifyPassword } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
H.boot();
const DASH = x => ({ type: 'dashboard', classId: x.A.id });
const TEACH = { type: 'teach' };
const noneOf = (text, words, what) => { for (const w of words) assert.ok(!text.includes(w), `${w} reached ${what}`); };

test('newJoinCode: a new code only on Do it (S.newCode); the code is on the change card only, never to the AI or kept', async () => {
  const x = H.world();
  const old = S.getClass(x.A.id).join_code;
  const c = await H.ask(x, 'newJoinCode', {});
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.card.title, /Room 12 Owls/); assert.equal(c.card.undoable, false);
  assert.equal(S.getClass(x.A.id).join_code, old, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  const code = S.getClass(x.A.id).join_code;
  assert.notEqual(code, old);
  assert.ok(done.change.lines[0].includes(code), 'the code on the teacher\'s change card');
  assert.equal(done.change.canUndo, false);
  noneOf(H.sentToAi(c.calls), [code], 'the AI');
  noneOf(H.storedTurns(x), [code], 'the stored chat');
  await H.refused(x, 'newJoinCode', { classRef: 'Room 20 Bears' }, /not one of the teacher's classes/, TEACH);
});

test('archiveClass and restoreClass: S.archiveClass on Do it; archive\'s Undo restores, restore\'s Undo archives again', async () => {
  const x = H.world();
  const c = await H.ask(x, 'archiveClass', { classRef: 'Room 14 Foxes' }, TEACH);
  assert.match(c.card.warn, /restore it later/); assert.match(c.card.title, /Room 14 Foxes/);
  assert.equal(S.getClass(x.B.id).archived_at, null, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.ok(S.getClass(x.B.id).archived_at);
  assert.match(done.change.lines[0], /Archived Room 14 Foxes/);
  await H.undo(x, done.id);
  assert.equal(S.getClass(x.B.id).archived_at, null, 'Undo restored it');
  // Nothing archived: nothing to restore.
  await H.refused(x, 'restoreClass', {}, /no archived class/, TEACH);
  // Restore: only an archived class of the teacher's (found by name, as the page's Restore).
  S.archiveClass(x.teacher, x.B.id, true);
  const r = await H.ask(x, 'restoreClass', { classRef: 'foxes' }, TEACH);
  assert.match(r.card.title, /Restore Room 14 Foxes/);
  assert.ok(S.getClass(x.B.id).archived_at, 'nothing before the tap');
  const back = await H.doIt(x, r.bot);
  assert.equal(S.getClass(x.B.id).archived_at, null);
  await H.undo(x, back.id);
  assert.ok(S.getClass(x.B.id).archived_at, 'Undo archived it again');
  await H.refused(x, 'restoreClass', { classRef: 'Room 12 Owls' }, /not one of the teacher's archived classes/, TEACH);
  S.archiveClass(x.admin, x.O.id, true);
  await H.refused(x, 'restoreClass', { classRef: 'Room 20 Bears' }, /not one of the teacher's archived classes/, TEACH);
  S.archiveClass(x.admin, x.O.id, false); S.archiveClass(x.teacher, x.B.id, false);
  await H.refused(x, 'archiveClass', { classRef: x.O.id }, /not one of the teacher's classes/, TEACH);
});

test('resetPassword: a new password only on Do it, only on the one-time login card; never to the AI or the chat', async () => {
  const x = H.world();
  const hash0 = q.get('SELECT password_hash h FROM users WHERE id=?', x.maya.id).h;
  const c = await H.ask(x, 'resetPassword', { student: '[student 1]' }, DASH(x), 'Maya Brook forgot her password, make her a new one');
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.card.title, /Maya Brook/, 'the name on the teacher\'s own card');
  assert.match(c.card.warn, /old password stops working/); assert.equal(c.card.undoable, false);
  assert.equal(q.get('SELECT password_hash h FROM users WHERE id=?', x.maya.id).h, hash0, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.notEqual(q.get('SELECT password_hash h FROM users WHERE id=?', x.maya.id).h, hash0);
  assert.match(done.change.lines[0], /new password for Maya Brook/);
  const link = done.change.links.find(l => l.href.startsWith('/cards/'));
  assert.ok(link && link.primary, 'a link to the one-time login card');
  const html = await (await H.get(link.href, x.tc)).text();
  const pw = /[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-\d{2}/.exec(html)[0];
  assert.ok(verifyPassword(getUser(x.maya.id), pw), 'the card has the new password');
  assert.notEqual((await H.get(link.href, H.cookieFor(x.other.id))).status, 200, 'another teacher cannot open it');
  noneOf(H.sentToAi(c.calls), [pw, 'Maya Brook', 'Maya'], 'the AI');
  noneOf(H.storedTurns(x), [pw, 'Maya Brook'], 'the stored chat');
  noneOf(JSON.stringify(await H.chatOf(x)), [pw], 'the chat page');
  await H.refused(x, 'resetPassword', { student: 'Maya' }, /not a student placeholder/);
  // A student with their own account: only they change its password (a new conversation: Opal is [student 1]).
  const y = H.world();
  const own = createUser({ username: H.uname('OwnKid'), password: 'kid-pass-12345', displayName: 'Opal Vance' });
  S.addMember(y.admin, y.s.id, own.id, 'student', { rosterName: 'Opal Vance' }); S.addToClass(y.admin, y.A.id, own.id, 'student');
  const o = await H.ask(y, 'resetPassword', { student: '[student 1]' }, DASH(y), 'Opal Vance needs a new password');
  assert.match(o.r.error, /own account.*Nothing was changed\.$/); assert.equal(o.card, undefined);
});

test('removeStudent: out of the class only on Do it (S.removeFromClass), account kept; Undo puts them back', async () => {
  const x = H.world();
  const c = await H.ask(x, 'removeStudent', { student: '[student 1]' }, DASH(x), 'Take Leo Stone out of my class');
  assert.match(c.card.title, /Leo Stone/); assert.match(c.card.warn, /account and work are kept/);
  assert.ok(S.classMember(x.A.id, x.leo.id), 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.equal(S.classMember(x.A.id, x.leo.id), null);
  assert.ok(S.membership(x.s.id, x.leo.id), 'still a student of the school');
  assert.match(done.change.lines[0], /Leo Stone/);
  await H.undo(x, done.id);
  assert.equal(S.classMember(x.A.id, x.leo.id).role, 'student');
  noneOf(H.sentToAi(c.calls), ['Leo Stone', 'Leo'], 'the AI');
  noneOf(H.storedTurns(x), ['Leo Stone'], 'the stored chat');
  await H.refused(x, 'removeStudent', { student: 'Leo Stone' }, /not a student placeholder/);
});

test('moveStudent: to another of the teacher\'s classes only on Do it (S.moveStudent); Undo moves them back', async () => {
  const x = H.world();
  const words = 'Move Maya Brook to the Foxes';
  const c = await H.ask(x, 'moveStudent', { student: '[student 1]', to: 'Room 14 Foxes' }, DASH(x), words);
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.card.title, /Maya Brook/); assert.match(c.card.title, /Room 12 Owls/); assert.match(c.card.title, /Room 14 Foxes/);
  assert.ok(S.classMember(x.A.id, x.maya.id)); assert.equal(S.classMember(x.B.id, x.maya.id), null, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.equal(S.classMember(x.A.id, x.maya.id), null);
  assert.equal(S.classMember(x.B.id, x.maya.id).role, 'student');
  assert.match(done.change.lines[0], /Moved Maya Brook to Room 14 Foxes/);
  await H.undo(x, done.id);
  assert.ok(S.classMember(x.A.id, x.maya.id)); assert.equal(S.classMember(x.B.id, x.maya.id), null);
  noneOf(H.sentToAi(c.calls), ['Maya Brook', 'Maya'], 'the AI');
  await H.refused(x, 'moveStudent', { student: '[student 1]' }, /Say which class to move the student to/, DASH(x));
  await H.refused(x, 'moveStudent', { student: '[student 1]', to: 'Room 20 Bears' }, /not another of the teacher's classes/, DASH(x));
});

test('addCoTeacher: a staff member of the school by name, only on Do it (S.addToClass as teacher); Undo takes them off', async () => {
  const x = H.world();
  const c = await H.ask(x, 'addCoTeacher', { staff: 'Ms Other' }, DASH(x), 'Add Ms Other as a teacher of my class');
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r));
  assert.match(c.card.title, /Ms Other/); assert.match(c.card.title, /Room 12 Owls/);
  assert.equal(S.teaches(x.other, x.A.id), false, 'nothing before the tap');
  const done = await H.doIt(x, c.bot);
  assert.equal(S.teaches(x.other, x.A.id), true);
  assert.match(done.change.lines[0], /Ms Other now teaches Room 12 Owls/);
  await H.undo(x, done.id);
  assert.equal(S.teaches(x.other, x.A.id), false);
  assert.ok(S.teaches(x.teacher, x.A.id), 'the teacher still teaches it');
  await H.refused(x, 'addCoTeacher', { staff: 'Nobody Known' }, /No teacher or school admin/);
  await H.refused(x, 'addCoTeacher', { staff: 'Mr Teach' }, /already teaches/);
  await H.refused(x, 'addCoTeacher', {}, /Say which staff member/);
  // A student is never a teacher (a student's name in the words is a placeholder).
  const s = await H.ask(x, 'addCoTeacher', { staff: '[student 1]' }, DASH(x), 'Make Maya Brook a teacher of the class');
  assert.match(s.r.error, /never a student.*Nothing was changed\.$/); assert.equal(s.card, undefined);
  noneOf(H.sentToAi(s.calls), ['Maya Brook'], 'the AI');
  assert.equal(S.classMember(x.A.id, x.maya.id).role, 'student');
});

test('approveJoin and declineJoin: requests by number, never by name; the card shows the name to the teacher', async () => {
  const x = H.world();
  await H.refused(x, 'approveJoin', {}, /No class of the teacher's has a request/);
  const kidA = createUser({ username: H.uname('JoinA'), password: 'kid-pass-12345', displayName: 'Quentin Zed' });
  const kidB = createUser({ username: H.uname('JoinB'), password: 'kid-pass-12345', displayName: 'Rosa Yule' });
  assert.equal(S.requestJoin(getUser(kidA.id), x.A.join_code).state, 'pending');
  assert.equal(S.requestJoin(getUser(kidB.id), x.A.join_code).state, 'pending');
  // Two waiting and none named: the AI gets numbers and days, never the names.
  let c = await H.ask(x, 'approveJoin', {});
  assert.match(c.r.error, /request 1 of 2.*request 2 of 2.*Nothing was changed\.$/);
  noneOf(H.sentToAi(c.calls), ['Quentin', 'Rosa', 'Zed', 'Yule'], 'the AI');
  await H.refused(x, 'approveJoin', { request: 5 }, /only 2 requests/);
  c = await H.ask(x, 'approveJoin', { request: 1 });
  assert.equal(c.r.waitingForTeacher, true, JSON.stringify(c.r)); assert.match(c.r.what, /request 1 of 2/);
  assert.match(c.card.title, /Quentin Zed/); assert.equal(c.card.input, 'one'); assert.equal(c.card.value, 'Quentin Zed');
  assert.equal(S.classMember(x.A.id, kidA.id), null, 'nothing before the tap');
  assert.equal(S.pendingRequests(x.A.id).length, 2);
  const done = await H.doIt(x, c.bot, 'Quentin Zed-Smith');
  assert.equal(S.classMember(x.A.id, kidA.id).role, 'student');
  assert.equal(S.membership(x.s.id, kidA.id).roster_name, 'Quentin Zed-Smith', 'the name typed on the card');
  assert.match(done.change.lines[0], /Quentin Zed-Smith joined Room 12 Owls/);
  noneOf(H.sentToAi(c.calls), ['Quentin', 'Rosa'], 'the AI');
  // The one left: no number needed.
  c = await H.ask(x, 'declineJoin', {});
  assert.match(c.card.title, /Rosa Yule/);
  assert.equal(S.pendingRequests(x.A.id).length, 1, 'nothing before the tap');
  const no = await H.doIt(x, c.bot);
  assert.equal(S.pendingRequests(x.A.id).length, 0);
  assert.equal(S.classMember(x.A.id, kidB.id), null);
  assert.match(no.change.lines[0], /Said no to the request for Room 12 Owls/);
  noneOf(H.sentToAi(c.calls), ['Rosa', 'Yule'], 'the AI');
  noneOf(H.storedTurns(x), ['Quentin', 'Rosa', 'Yule'], 'the stored chat');
  await H.refused(x, 'declineJoin', {}, /No class of the teacher's has a request/);
});

test('a card whose request was decided on the page meanwhile: Do it changes nothing and says it is not done', async () => {
  const x = H.world();
  const kid = createUser({ username: H.uname('JoinC'), password: 'kid-pass-12345', displayName: 'Tess Ward' });
  S.requestJoin(getUser(kid.id), x.A.join_code);
  const c = await H.ask(x, 'approveJoin', {});
  S.declineRequest(x.teacher, S.pendingRequests(x.A.id)[0] ? S.pendingRequests(x.A.id)[0].id : '');
  assert.equal((await H.act(x, c.bot.id, 'actionDo', 'Tess Ward')).status, 200);
  const card = (await H.chatOf(x)).turns.find(t => t.id === c.bot.id).note.action;
  assert.equal(card.state, 'failed');
  assert.equal(S.classMember(x.A.id, kid.id), null);
});
