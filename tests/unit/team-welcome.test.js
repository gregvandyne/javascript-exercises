// The Oomba team's automatic welcomes for grown-ups and teachers (docs/decisions.md "Automatic welcome from the Oomba
// team"): parents at their first sign-in, teachers and school staff when they become staff (or at a first sign-in as
// staff, or when a grown-up's "Set up my school" request is done), each once per person and audience, only for new
// accounts; a teacher signing up on a teacher's way never gets the kids' text; the admin's three on/off + text panels.
// The kids' welcome itself is in admin-review.test.js.
import { auth, db, q, PW, KID_PW, call, as, kid, grownup, fresh } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const team = await import('../../server/services/team.js');
const S = await import('../../server/services/schools.js');

const admin = auth.createUser({ username: `WelBoss${fresh()}`, password: PW, role: 'admin' });
const RES = { setHeader() {}, getHeader() { return undefined; }, append() {} };
const signIn = (u, opts) => auth.startSession(RES, u.id, 'test', opts);
/** The team's messages to this person (all kinds, sent or unsent), oldest first. */
const msgs = id => q.all('SELECT m.* FROM chat_messages m JOIN users u ON u.id=m.from_id WHERE m.to_id=? AND u.username=? ORDER BY m.created_at, m.rowid', id, auth.OFFICIAL);
const welcomes = id => msgs(id).filter(m => m.kind === 'team' && !m.sent_by && m.status === 'ok');
const KID = /Here are a few fun things to try/, PARENT = /A few things your family can try/, TEACHER = /Here's what your class can do/;
const newSchool = () => S.createSchool(admin, { name: `Welcome School ${fresh()}` }).school;
const grownupSignup = async (cookie = null, extra = {}) => {
  const name = `Wel${fresh()}`;
  const r = await call(cookie, '/api/grown-ups/signup', { method: 'POST', body: { username: name, password: PW, confirm: PW, adult: '1', ...extra } });
  assert.equal(r.status, 200, r.text);
  return { user: auth.getUserByName(name), cookie: r.cookie };
};
const teacherCookie = setCookies => (setCookies.map(c => c.split(';')[0]).find(c => c.startsWith(`${auth.TEACHER_WAY}=`) && c !== `${auth.TEACHER_WAY}=`) || null);
const clean = () => { for (const k of Object.values(team.WELCOME_KEYS)) q.run('DELETE FROM settings WHERE key=?', k); };
test.beforeEach(clean);

test('parents: a new grown-up gets the parents\' welcome at their first sign-in, once, with their first name; they read it at /chat/OombaAcademy and see the badge on /family', async () => {
  const { user: g, cookie } = await grownupSignup();
  let w = welcomes(g.id);
  assert.equal(w.length, 1);
  assert.match(w[0].body, new RegExp(`^Hi ${g.display_name.split(' ')[0]}! 👋\\n\\nWelcome to Oomba Academy!`));
  assert.match(w[0].body, PARENT); assert.doesNotMatch(w[0].body, KID); assert.doesNotMatch(w[0].body, TEACHER);
  assert.match(w[0].body, /Family page/); assert.match(w[0].body, /\n• Play: /);
  const a = q.get("SELECT * FROM audit_log WHERE action='team.welcome' AND target=?", g.id);
  assert.equal(JSON.parse(a.details).audience, 'grownup');
  // Signing in again: no second one.
  signIn(g); signIn(g);
  assert.equal(welcomes(g.id).length, 1);
  // The badge on /family, the thread at /chat/OombaAcademy (not /chat), and a reply goes to the team.
  assert.match((await call(cookie, '/family')).text, /1 new message from the Oomba team/);
  assert.equal((await call(cookie, '/chat')).status, 404);
  const th = await call(cookie, `/chat/${auth.OFFICIAL}`);
  assert.equal(th.status, 200); assert.match(th.text, /A few things your family can try/);
  assert.equal(team.canReply(g).ok, true);
  assert.equal((await call(cookie, `/api/chat/${auth.OFFICIAL}`, { method: 'POST', body: { kind: 'text', body: 'Thanks Greg!' } })).status, 200);
  // The admin's thread shows it as the automatic welcome, with Unsend.
  const page = (await as(admin)(`/admin/messages/${g.username}`)).text;
  assert.match(page, /automatic welcome/); assert.match(page, /Unsend/);
  assert.equal(team.unsendDirect(admin, w[0].id).ok, true);
  assert.equal(welcomes(g.id).length, 0);
});

test('teachers: becoming a teacher or school admin sends the teachers\' welcome once (People tab, staff login card, role change); old accounts get nothing', async () => {
  const s = newSchool();
  // An existing account added as a teacher on the People tab (the real API, as the platform admin).
  const t1 = kid(`Teach${fresh()}`); q.run('UPDATE users SET last_login_at=1 WHERE id=?', t1.id);   // signed in before, long ago
  const r = await as(admin)(`/api/schools/${s.id}/staff`, { method: 'POST', body: { account: 'existing', username: t1.username, rosterName: 'Ms Owl', role: 'teacher' } });
  assert.equal(r.status, 200, r.text);
  let w = welcomes(t1.id);
  assert.equal(w.length, 1); assert.match(w[0].body, TEACHER);
  assert.match(w[0].body, /Greg@oomba\.ai/); assert.match(w[0].body, /demo or a training session/);
  assert.equal(JSON.parse(q.get("SELECT details FROM audit_log WHERE action='team.welcome' AND target=?", t1.id).details).audience, 'teacher');
  // Made school admin as well: still one.
  S.updateMember(admin, s.id, t1.id, { role: 'admin' }); S.addMember(admin, s.id, t1.id, 'admin');
  assert.equal(welcomes(t1.id).length, 1);
  // A staff login card (a school account made as school admin): welcomed before it ever signs in; its first sign-in adds nothing.
  const made = S.createSchoolAccount(admin, s.id, { rosterName: 'Mr Fox', role: 'admin' });
  assert.equal(welcomes(made.user.id).length, 1); assert.match(welcomes(made.user.id)[0].body, TEACHER);
  signIn(made.user);
  assert.equal(welcomes(made.user.id).length, 1);
  // A student account made a teacher (role change).
  const st = S.createSchoolAccount(admin, s.id, { rosterName: 'Sam Student', role: 'student' });
  assert.equal(welcomes(st.user.id).length, 0);
  S.updateMember(admin, s.id, st.user.id, { role: 'teacher' });
  assert.equal(welcomes(st.user.id).length, 1); assert.match(welcomes(st.user.id)[0].body, TEACHER);
  // Teachers read it in their chat inbox.
  const inbox = await as(t1)('/api/chat');
  assert.ok(inbox.json.threads.some(x => x.team && x.unread >= 1));
  assert.match((await as(t1)(`/chat/${auth.OFFICIAL}`)).text, /what your class can do/);
  // An account made 40 days ago becoming a teacher: nothing. A platform admin: nothing.
  const old = kid(`OldTeach${fresh()}`); q.run('UPDATE users SET created_at=? WHERE id=?', Date.now() - 40 * 86400e3, old.id);
  S.addMember(admin, s.id, old.id, 'teacher');
  assert.equal(welcomes(old.id).length, 0);
  S.addMember(admin, s.id, admin.id, 'admin');
  assert.equal(welcomes(admin.id).length, 0);
});

test('teachers: a first sign-in that is already staff gets the teachers\' welcome (when it was off as they joined), never the kids\'', () => {
  const s = newSchool();
  team.saveWelcome(admin, { audience: 'teacher', on: false, text: team.DEFAULT_WELCOME_TEACHER });
  const t = kid(`Staffy${fresh()}`); S.addMember(admin, s.id, t.id, 'teacher');
  assert.equal(welcomes(t.id).length, 0);
  team.saveWelcome(admin, { audience: 'teacher', on: true, text: 'Hello {name}, teacher!' });
  signIn(t);
  const w = welcomes(t.id);
  assert.equal(w.length, 1); assert.equal(w[0].body, `Hello ${t.display_name.split(' ')[0]}, teacher!`);
});

test('a grown-up who later has a school set up gets both welcomes: the parents\' at sign-up, the teachers\' when their "Set up my school" request is done', async () => {
  const { user: g, cookie } = await grownupSignup();
  assert.equal(welcomes(g.id).length, 1);
  const sent = await call(cookie, '/api/teachers/school-request', { method: 'POST', body: { school: 'Hill Primary', role: 'teacher', email: 'me@hill.sch.uk', students: 120, country: 'UK' } });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(welcomes(g.id).length, 1, 'not on sending the request');
  const rq = q.get('SELECT id FROM school_requests WHERE user_id=?', g.id);
  assert.equal((await as(admin)('/api/admin/schools', { method: 'POST', body: { name: 'Hill Primary', request: rq.id } })).status, 200);
  const w = welcomes(g.id);
  assert.equal(w.length, 2);
  assert.match(w[0].body, PARENT); assert.match(w[1].body, TEACHER);
  // Their badge counts both.
  assert.match((await call(cookie, '/family')).text, /2 new messages from the Oomba team/);
});

test('the teacher sign-up way: "I\'m a teacher" or "Set up my school" marks this browser; a kid-type sign-up then waits for the kids\' welcome and gets the teachers\' one when made staff, never the kids\'', async () => {
  // "I'm a teacher" signed out: the cookie.
  const door = await call(null, '/signup/for/teacher');
  assert.equal(door.status, 302); assert.equal(door.location, '/teachers#start');
  const tc = teacherCookie(door.setCookies); assert.ok(tc, 'the teacher way is remembered');
  // "Set up my school" sent signed out: the same.
  const form = await call(null, '/api/teachers/school-request', { method: 'POST', body: { school: 'Lake School', role: 'leader', email: 'head@lake.org', students: 300, country: 'Ireland' } });
  assert.equal(form.status, 200, form.text); assert.ok(teacherCookie(form.setCookies));
  // "My child" doesn't.
  assert.equal(teacherCookie((await call(null, '/signup/for/kid')).setCookies), null);
  // The teacher then makes an account with the (kid) sign-up form on that browser: no kids' welcome, the cookie is used up.
  const name = `Teachy${fresh()}`;
  const su = await call(tc, '/api/auth/signup', { method: 'POST', body: { username: name, password: KID_PW } });
  assert.equal(su.status, 200, su.text);
  assert.ok(su.setCookies.some(c => c.startsWith(`${auth.TEACHER_WAY}=;`)), 'cleared');
  const t = auth.getUserByName(name);
  assert.equal(msgs(t.id).length, 0);
  assert.equal(q.get("SELECT state FROM team_welcomes WHERE user_id=? AND audience='kid'", t.id).state, 'wait');
  signIn(t);   // signing in again within the wait: still nothing
  assert.equal(msgs(t.id).length, 0);
  // Their school adds them as a teacher: the teachers' welcome only, and the kids' one never comes.
  const s = newSchool(); S.addMember(admin, s.id, t.id, 'teacher');
  let w = welcomes(t.id); assert.equal(w.length, 1); assert.match(w[0].body, TEACHER);
  q.run("UPDATE team_welcomes SET at=? WHERE user_id=? AND audience='kid'", Date.now() - 10 * 86400e3, t.id);
  signIn(t);
  assert.ok(msgs(t.id).every(m => !KID.test(m.body)));
  assert.equal(q.get("SELECT state FROM team_welcomes WHERE user_id=? AND audience='kid'", t.id).state, 'skipped');
  // Someone who came that way but turned out to be a kid: the kids' welcome at a sign-in after the wait.
  const name2 = `Maybe${fresh()}`;
  assert.equal((await call(tc, '/api/auth/signup', { method: 'POST', body: { username: name2, password: KID_PW } })).status, 200);
  const k = auth.getUserByName(name2);
  assert.equal(msgs(k.id).length, 0);
  q.run("UPDATE team_welcomes SET at=? WHERE user_id=? AND audience='kid'", Date.now() - (team.TEACHER_WAIT_DAYS + 1) * 86400e3, k.id);
  signIn(k);
  assert.equal(welcomes(k.id).length, 1); assert.match(welcomes(k.id)[0].body, KID);
});

test('a teacher whose account got the kids\' welcome before becoming staff: it is taken back (audited) and the teachers\' one goes', () => {
  const t = kid(`Late${fresh()}`); signIn(t);
  const kw = welcomes(t.id); assert.equal(kw.length, 1); assert.match(kw[0].body, KID);
  const s = newSchool(); S.addMember(admin, s.id, t.id, 'admin');
  const w = welcomes(t.id);
  assert.equal(w.length, 1); assert.match(w[0].body, TEACHER);
  assert.equal(q.get('SELECT status FROM chat_messages WHERE id=?', kw[0].id).status, 'unsent');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='team.welcome.withdraw' AND target=?", t.id));
  // A kid who wrote back keeps it (the conversation stays as it was).
  const t2 = kid(`Wrote${fresh()}`); signIn(t2);
  assert.equal(team.reply(auth.getUser(t2.id), { kind: 'text', body: 'Hi Greg' }).ok, true);
  S.addMember(admin, s.id, t2.id, 'teacher');
  const w2 = welcomes(t2.id); assert.equal(w2.length, 2); assert.match(w2[0].body, KID); assert.match(w2[1].body, TEACHER);
});

test('grown-ups on a teacher\'s way get the teachers\' welcome instead of the parents\' (the teacher door, or "Host a game" from /teachers/live)', async () => {
  const door = await call(null, '/signup/for/teacher');
  const { user: g1 } = await grownupSignup(teacherCookie(door.setCookies));
  assert.equal(welcomes(g1.id).length, 1); assert.match(welcomes(g1.id)[0].body, TEACHER);
  const { user: g2 } = await grownupSignup(null, { next: '/live' });
  assert.equal(welcomes(g2.id).length, 1); assert.match(welcomes(g2.id)[0].body, TEACHER);
  // An old grown-up's first sign-in: nothing.
  const old = grownup(); q.run('UPDATE users SET created_at=? WHERE id=?', Date.now() - 40 * 86400e3, old.id);
  signIn(old);
  assert.equal(msgs(old.id).length, 0);
});

test('admin: three panels, each with its own on/off and text (line breaks kept); the kids\' storage is unchanged; admin-only', async () => {
  const page = (await as(admin)('/admin?tab=messages')).text;
  for (const h of ['Welcome message for new kids', 'Welcome message for new parents', 'Welcome message for new teachers and school staff']) assert.ok(page.includes(h), h);
  for (const a of ['kid', 'grownup', 'teacher']) assert.match(page, new RegExp(`name="audience" value="${a}"`));
  assert.match(page, /Send it to new parents/); assert.match(page, /Send it to new teachers and school staff/);
  assert.ok(page.includes('Greg@oomba.ai'), 'the teachers\' default text is shown');
  // Save each one.
  const save = (body, u = admin) => as(u)('/api/admin/team/welcome', { method: 'POST', body });
  assert.equal((await save({ audience: 'grownup', on: '1', text: 'Hi {name}!\n\nParents line.' })).status, 200);
  assert.equal((await save({ audience: 'teacher', text: 'Teachers line.' })).status, 200);
  assert.equal((await save({ on: '1', text: 'Kids line.' })).status, 200);   // no audience: the kids' (as before)
  assert.deepEqual(JSON.parse(q.get("SELECT value FROM settings WHERE key='team.welcome'").value), { on: true, text: 'Kids line.' });
  assert.equal(team.welcomeSettings('grownup').text, 'Hi {name}!\n\nParents line.');
  assert.equal(team.welcomeSettings('teacher').on, false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.team.welcome' AND target='team.welcome.grownup'"));
  assert.equal((await save({ audience: 'nobody', on: '1', text: 'x' })).status, 400);
  // Off means off; the parents' text with {name} and its blank line.
  const { user: g } = await grownupSignup();
  assert.equal(welcomes(g.id)[0].body, `Hi ${g.display_name.split(' ')[0]}!\n\nParents line.`);
  const s = newSchool(); const t = kid(`Offy${fresh()}`); S.addMember(admin, s.id, t.id, 'teacher');
  assert.equal(welcomes(t.id).length, 0);
  // Not for anyone else.
  const someone = grownup();
  assert.equal((await save({ audience: 'teacher', on: '1', text: 'x' }, someone)).status, 404);
  assert.equal((await save({ audience: 'teacher', on: '1', text: 'x' }, kid())).status, 404);
  assert.equal(team.welcomeSettings('teacher').text, 'Teachers line.');
});

test('the backfill: kids welcomed before this change (audit team.welcome) are not welcomed again', () => {
  const k = kid(`Back${fresh()}`);
  q.run("INSERT INTO audit_log(id, actor_id, action, target, details, created_at) VALUES ('wb1', NULL, 'team.welcome', ?, ?, ?)", k.id, JSON.stringify({ message: 'm-old', child: true }), Date.now());
  const sql = db.MIGRATIONS.find(m => m[0] === '0057_team_welcomes')[1];
  db.db.exec(sql);
  assert.deepEqual({ ...q.get("SELECT state, message_id FROM team_welcomes WHERE user_id=? AND audience='kid'", k.id) }, { state: 'sent', message_id: 'm-old' });
  signIn(k);
  assert.equal(msgs(k.id).length, 0);
});
