// Staff invites by email (services/staff-email-invites.js, routes/staff-invites.js): who may invite whom, the email,
// the stored hash (never the token), the /join-staff page signed out and in, accepting with the invited address only,
// expired / used / cancelled links, Resend and Cancel, the link shown when email is off, the school and account deletes,
// and the strings in every language.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const SE = await import('../../server/services/staff-email-invites.js');
const SD = await import('../../server/services/school-delete.js');
const AD = await import('../../server/services/account-delete.js');
const E = await import('../../server/services/email.js');
const { tFor, CODES } = await import('../../server/i18n/index.js');
const { loadLocale } = await import('../../server/i18n/check.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const sent = [];
E._hooks({ fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { status: 200, json: async () => ({ id: `em_${sent.length}` }) }; }, wait: () => Promise.resolve() });
const mailOn = () => Object.assign(config, { resendApiKey: 're_test_key', emailEnabled: true, publicUrl: 'https://oomba.example' });
mailOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
test.beforeEach(() => { resetLimits(); sent.length = 0; mailOn(); });

const cookieOf = u => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; };
async function call(path, { u = null, method = 'GET', body, cookie } = {}) {
  const headers = {}; if (u) headers.cookie = cookieOf(u); if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* a page */ }
  return { status: r.status, text, json, location: r.headers.get('location'), setCookie: r.headers.get('set-cookie') };
}
const post = (path, body, u, extra = {}) => call(path, { u, method: 'POST', body, ...extra });
const tokenOf = mail => (mail.text.match(/\/join-staff\/([A-Za-z0-9_-]{43})/) || [])[1];
const rowFor = email => q.get('SELECT * FROM staff_email_invites WHERE email=? ORDER BY created_at DESC', email);

const boss = auth.createUser({ username: 'InvBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Hill Primary' }).school;
const elm = S.createSchool(boss, { name: 'Elm Street School' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
const rivera = S.createSchoolAccount(head, oak.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user;
const chen = S.createSchoolAccount(head, oak.id, { rosterName: 'Mr Chen', role: 'teacher' }).user;
const student = S.createSchoolAccount(rivera, oak.id, { rosterName: 'Kid Oak' }).user;
const elmTeacher = S.createSchoolAccount(boss, elm.id, { rosterName: 'Elm Teacher', role: 'teacher' }).user;
const ownKid = auth.createUser({ username: 'InvOwnKid', password: 'secret123' });
// A teacher with their own account at Elm whose address we know: the one invited to Oak.
const pat = auth.createUser({ username: 'PatTeach', password: 'a-long-password-1' });
S.addMember(boss, elm.id, pat.id, 'teacher', { rosterName: 'Pat Lee' });
E.rememberAddress(pat.id, 'Pat.Lee@Example.org', 'checkout');

test('a school admin invites a teacher and a school admin by email; the email names the inviter and the school', async () => {
  const a = await post(`/api/schools/${oak.id}/email-invites`, { email: 'Pat.Lee@example.org', rosterName: 'Pat Lee', role: 'teacher', lang: 'en' }, head);
  assert.equal(a.status, 200, a.text); assert.match(a.json.toast, /pat\.lee@example\.org/);
  const b = await post(`/api/schools/${oak.id}/email-invites`, { email: 'deputy@example.org', rosterName: 'Dee Puty', role: 'admin', lang: 'fr' }, head);
  assert.equal(b.status, 200, b.text);
  assert.equal(sent.length, 2);
  const [m1, m2] = sent;
  assert.deepEqual(m1.to, ['pat.lee@example.org']);
  assert.match(m1.subject, /Mrs Head invited you to join Oak Hill Primary/);
  assert.match(m1.html, /https:\/\/oomba\.example\/join-staff\/[A-Za-z0-9_-]{43}/);
  assert.match(m1.text, /as Teacher/);
  assert.equal(m1.headers, undefined, 'transactional: no unsubscribe header');
  assert.doesNotMatch(m1.html + m1.text, /\$|€|£|price|trial/i, 'no prices');
  assert.match(m2.subject, /Oak Hill Primary/); assert.match(m2.text, /Admin de l’école/, 'in the chosen language');
  // Only the hash is stored.
  const tok = tokenOf(m1), row = rowFor('pat.lee@example.org');
  assert.equal(tok.length, 43, '256 random bits');
  assert.equal(row.token_hash, crypto.createHash('sha256').update(`staff-email-invite:v1:${tok}`).digest('hex'));
  assert.ok(!JSON.stringify(q.all('SELECT * FROM staff_email_invites')).includes(tok), 'the token itself is nowhere in the table');
  assert.equal(row.role, 'teacher'); assert.equal(row.invited_by, head.id);
  assert.ok(Math.abs(row.expires_at - row.sent_at - 14 * 864e5) < 1000, '14 days');
  // The audit log has ids, never the address.
  const logs = JSON.stringify(q.all("SELECT * FROM audit_log WHERE action LIKE 'school.staff_email_invite%'"));
  assert.match(logs, new RegExp(row.id)); assert.doesNotMatch(logs, /example\.org/);
  // An open invite to the same address is refused (Resend instead); a bad address too.
  assert.equal((await post(`/api/schools/${oak.id}/email-invites`, { email: 'PAT.LEE@example.org', rosterName: 'Pat', role: 'teacher' }, head)).json.field, 'email');
  assert.equal((await post(`/api/schools/${oak.id}/email-invites`, { email: 'not-an-address', rosterName: 'X', role: 'teacher' }, head)).status, 400);
  // The admin sees the list: address, name, role, who, when, expiry.
  const people = await call(`/school/${oak.slug}?tab=people`, { u: head });
  assert.match(people.text, /id="email-invites"/); assert.match(people.text, /pat\.lee@example\.org/); assert.match(people.text, /deputy@example\.org/);
  assert.match(people.text, /invited by Mrs Head/); assert.match(people.text, /expires /);
  // The platform admin uses the same panel from the school's page.
  const p2 = await call(`/school/${oak.slug}?tab=people`, { u: boss });
  assert.match(p2.text, /id="email-invite-form"/); assert.match(p2.text, /deputy@example\.org/);
});

test('a teacher invites teachers only, sees only their own invites; students and outsiders get 403/404', async () => {
  const r = await post(`/api/schools/${oak.id}/email-invites`, { email: 'friend@school.example', rosterName: 'Fran Friend', role: 'teacher' }, rivera);
  assert.equal(r.status, 200, r.text); assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Ms Rivera invited you/, 'the inviter by their real name as the school shows it');
  const adm = await post(`/api/schools/${oak.id}/email-invites`, { email: 'boss2@school.example', rosterName: 'Bo Boss', role: 'admin' }, rivera);
  assert.equal(adm.status, 403); assert.equal(rowFor('boss2@school.example'), undefined);
  for (const who of [student, elmTeacher, ownKid]) {
    const x = await post(`/api/schools/${oak.id}/email-invites`, { email: 'x@school.example', rosterName: 'X', role: 'teacher' }, who);
    assert.equal(x.status, 404, who.username);
  }
  assert.equal((await post(`/api/schools/${oak.id}/email-invites`, { email: 'x@school.example', rosterName: 'X' })).status, 401);
  // The teacher's page: the form (Teachers only) and their own invites, not the admin's.
  const pg = await call(`/school/${oak.slug}/invite`, { u: rivera });
  assert.equal(pg.status, 200); assert.match(pg.text, /id="ei-teachers-only"/); assert.doesNotMatch(pg.text, /id="ei-role"/);
  assert.match(pg.text, /friend@school\.example/); assert.doesNotMatch(pg.text, /pat\.lee@example\.org|deputy@example\.org/);
  const other = await call(`/school/${oak.slug}/invite`, { u: chen });
  assert.doesNotMatch(other.text, /friend@school\.example/, 'another teacher never sees it');
  assert.equal((await call(`/school/${oak.slug}/invite`, { u: student })).status, 404);
  assert.equal((await call(`/school/${oak.slug}/invite`, { u: elmTeacher })).status, 404);
  assert.equal((await call(`/school/${oak.slug}/invite`, { u: head })).status, 302, 'admins use the People tab');
  // The class page leads a teacher there from the school's name.
  const c = S.createClass(rivera, oak.id, { name: 'Invite Class' }).class;
  assert.match((await call(`/class/${c.id}`, { u: rivera })).text, new RegExp(`href="/school/${oak.slug}/invite"`));
  // Another teacher can't cancel or resend it; the inviter can.
  const row = rowFor('friend@school.example');
  assert.equal((await post(`/api/schools/${oak.id}/email-invites/${row.id}/cancel`, {}, chen)).status, 404);
  assert.equal((await post(`/api/schools/${oak.id}/email-invites/${row.id}/resend`, {}, chen)).status, 404);
  assert.equal((await post(`/api/schools/${oak.id}/email-invites/${row.id}/cancel`, {}, rivera)).status, 200);
  assert.equal(SE.getInvite(row.id).status, 'cancelled');
});

test('the link signed out: the school and role, Sign in and Create a teacher account that come back; the address masked', async () => {
  await post(`/api/schools/${oak.id}/email-invites`, { email: 'newbie@school.example', rosterName: 'Nia Newbie', role: 'teacher' }, head);
  const tok = tokenOf(sent[0]);
  const pg = await call(`/join-staff/${tok}`);
  assert.equal(pg.status, 200);
  assert.match(pg.text, /You&#39;ve been invited to join Oak Hill Primary as Teacher|You've been invited to join Oak Hill Primary as Teacher/);
  assert.match(pg.text, new RegExp(`href="/login\\?next=%2Fjoin-staff%2F${tok}"`));
  assert.match(pg.text, new RegExp(`href="/signup/teacher\\?next=%2Fjoin-staff%2F${tok}"`));
  assert.doesNotMatch(pg.text, /newbie@school\.example/, 'never the whole address on the page'); assert.match(pg.text, /n•••@school\.example/);
  // The teacher sign-up carries it and comes back to the link.
  const su = await call(`/signup/teacher?next=/join-staff/${tok}`);
  assert.match(su.text, new RegExp(`name="next" value="/join-staff/${tok}"`));
  const made = await post('/api/onboarding/teacher', { username: 'NiaNewbie', password: 'tall-green-ladder-77', confirm: 'tall-green-ladder-77', adult: '1', next: `/join-staff/${tok}` });
  assert.equal(made.status, 200, made.text); assert.equal(made.json.redirect, `/join-staff/${tok}`);
  const nia = auth.getUserByName('NiaNewbie'); const cookie = (String(made.setCookie || '').match(/brb_session=[^;]+/) || [])[0];
  assert.ok(cookie, 'signed in');
  // Signed in: Accept / Decline. A brand-new teacher account with no address may claim the invited one.
  const signed = await call(`/join-staff/${tok}`, { cookie });
  assert.match(signed.text, /id="join-accept"/); assert.match(signed.text, /id="join-decline"/); assert.match(signed.text, /id="join-claim"/);
  const ok = await post(`/api/join-staff/${tok}/accept`, {}, null, { cookie });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.redirect, '/teach');
  assert.equal(S.membership(oak.id, nia.id).role, 'teacher'); assert.equal(S.membership(oak.id, nia.id).roster_name, 'Nia Newbie');
  assert.equal(E.addressOf(nia.id).email, 'newbie@school.example');
  // Single use.
  assert.equal((await post(`/api/join-staff/${tok}/accept`, {}, null, { cookie })).status, 410);
  const used = await call(`/join-staff/${tok}`);
  assert.equal(used.status, 410); assert.match(used.text, /data-state="used"/);
});

test('accepting: the matching address joins (case does not matter); another address is refused; so are kids and students', async () => {
  const tok = (() => { const r = SE.createInvite(head, oak.id, { email: 'pat.lee@example.org', rosterName: 'Pat Lee', role: 'teacher' }); return r.ok ? r.token : null; })()
    || SE.renewInvite(head, oak.id, rowFor('pat.lee@example.org').id).token;
  // Someone else's account opening a forwarded link: refused politely, with Sign out.
  const other = auth.createUser({ username: 'OtherTeach', password: 'a-long-password-1' });
  S.addMember(boss, elm.id, other.id, 'teacher'); E.rememberAddress(other.id, 'other@example.org');
  const pg = await call(`/join-staff/${tok}`, { u: other });
  assert.match(pg.text, /data-code="emailMismatch"/); assert.match(pg.text, /id="join-signout"/); assert.doesNotMatch(pg.text, /id="join-accept"/);
  assert.match(pg.text, /value="\/login\?next=\/join-staff\//);
  assert.equal((await post(`/api/join-staff/${tok}/accept`, {}, other)).status, 403);
  assert.equal(S.membership(oak.id, other.id), null);
  // A kid's own account, and a student of the school.
  assert.match((await call(`/join-staff/${tok}`, { u: ownKid })).text, /data-code="childAccount"/);
  assert.equal((await post(`/api/join-staff/${tok}/accept`, {}, ownKid)).status, 400);
  assert.match((await call(`/join-staff/${tok}`, { u: student })).text, /data-code="studentHere"/);
  assert.match((await call(`/join-staff/${tok}`, { u: elmTeacher })).text, /data-code="otherSchoolAccount"/);
  // The invited address (stored as Pat.Lee@Example.org): joins with the invite's role and name.
  const r = await post(`/api/join-staff/${tok}/accept`, {}, pat);
  assert.equal(r.status, 200, r.text);
  assert.equal(S.membership(oak.id, pat.id).role, 'teacher'); assert.equal(S.membership(oak.id, pat.id).roster_name, 'Pat Lee');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='school.member_add' AND actor_id=? AND target=?", head.id, oak.id), 'added by the inviter, as answerInvite does');
  // A member already can't take another one.
  const again = SE.createInvite(head, oak.id, { email: 'pat.lee@example.org', rosterName: 'Pat', role: 'admin' });
  assert.equal(again.code, 'emailStaff');
});

test('expired and cancelled links say so; Resend makes a new link and the old one stops working', async () => {
  await post(`/api/schools/${oak.id}/email-invites`, { email: 'late@school.example', rosterName: 'Lee Late', role: 'teacher' }, head);
  const t1 = tokenOf(sent[0]), row = rowFor('late@school.example');
  q.run('UPDATE staff_email_invites SET expires_at=? WHERE id=?', Date.now() - 1000, row.id);
  const ex = await call(`/join-staff/${t1}`);
  assert.equal(ex.status, 410); assert.match(ex.text, /data-state="expired"/); assert.match(ex.text, /expired/);
  const lee = auth.createUser({ username: 'LeeLate', password: 'a-long-password-1' }); S.addMember(boss, elm.id, lee.id, 'teacher'); E.rememberAddress(lee.id, 'late@school.example');
  assert.equal((await post(`/api/join-staff/${t1}/accept`, {}, lee)).status, 410);
  assert.match((await call(`/school/${oak.slug}?tab=people`, { u: head })).text, /chip-s warn">expired/);
  // Resend: a new token, 14 more days, a new email; the old link is gone.
  const rs = await post(`/api/schools/${oak.id}/email-invites/${row.id}/resend`, {}, head);
  assert.equal(rs.status, 200, rs.text); assert.equal(sent.length, 2);
  const t2 = tokenOf(sent[1]);
  assert.notEqual(t2, t1); assert.notEqual(SE.getInvite(row.id).token_hash, row.token_hash);
  assert.ok(SE.getInvite(row.id).expires_at > Date.now() + 13 * 864e5);
  assert.equal((await call(`/join-staff/${t1}`)).status, 404);
  assert.equal((await call(`/join-staff/${t2}`)).status, 200);
  // Cancel: the link says so.
  assert.equal((await post(`/api/schools/${oak.id}/email-invites/${row.id}/cancel`, {}, head)).status, 200);
  const cx = await call(`/join-staff/${t2}`);
  assert.equal(cx.status, 410); assert.match(cx.text, /data-state="cancelled"/);
  assert.equal((await post(`/api/join-staff/${t2}/accept`, {}, lee)).status, 410);
  assert.equal((await call('/join-staff/not-a-token')).status, 404);
});

test('email off: the invite is still made, and the inviter gets a link to copy and is told the email was not sent', async () => {
  config.emailEnabled = false;
  const r = await post(`/api/schools/${oak.id}/email-invites`, { email: 'offline@school.example', rosterName: 'Off Line', role: 'teacher' }, head);
  assert.equal(r.status, 200, r.text); assert.equal(sent.length, 0);
  assert.ok(rowFor('offline@school.example'), 'made');
  assert.match(r.json.redirect, /invlink=/);
  const pg = await call(r.json.redirect.replace(/#.*$/, ''), { u: head });
  assert.match(pg.text, /id="invite-link"/); assert.match(pg.text, /no email was sent/);
  const link = (pg.text.match(/value="(https:\/\/oomba\.example\/join-staff\/[A-Za-z0-9_-]{43})"/) || [])[1];
  assert.ok(link, 'the link to copy');
  assert.equal((await call(link.replace('https://oomba.example', ''))).status, 200);
  // Shown to its inviter only.
  assert.doesNotMatch((await call(r.json.redirect.replace(/#.*$/, ''), { u: boss })).text, /id="invite-link"/);
});

test('limits: 100 open invites per school, and a rate limit per inviter', async () => {
  const s = S.createSchool(boss, { name: 'Busy School' }).school;
  const adm = S.createSchoolAccount(boss, s.id, { rosterName: 'Busy Head', role: 'admin' }).user;
  const t = Date.now();
  for (let i = 0; i < SE.MAX_OPEN; i++) q.run(`INSERT INTO staff_email_invites(id, school_id, email, role, token_hash, invited_by, created_at, sent_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    `busy${i}`, s.id, `p${i}@busy.example`, 'teacher', `h${i}`, adm.id, t, t, t + 864e5);
  const r = await post(`/api/schools/${s.id}/email-invites`, { email: 'one-more@busy.example', rosterName: 'One More', role: 'teacher' }, adm);
  assert.equal(r.status, 400); assert.match(r.json.error, /100/);
  resetLimits();
  let last = null;
  for (let i = 0; i <= SE.PER_INVITER_HOUR; i++) last = await post(`/api/schools/${s.id}/email-invites`, { email: 'bad', rosterName: 'X' }, adm);
  assert.equal(last.status, 429);
});

test('deleting the school removes its invites; deleting an account removes the invites it sent', async () => {
  const s = S.createSchool(boss, { name: 'Short Lived School' }).school;
  const adm = auth.createUser({ username: 'ShortHead', password: 'a-long-password-1' }); S.addMember(boss, s.id, adm.id, 'admin', { rosterName: 'Short Head' });
  assert.ok(SE.createInvite(adm, s.id, { email: 'a@short.example', rosterName: 'A', role: 'teacher' }).ok);
  assert.ok(SE.createInvite(adm, s.id, { email: 'b@short.example', rosterName: 'B', role: 'admin' }).ok);
  assert.ok(SD.BY_SCHOOL.includes('staff_email_invites'));
  assert.equal(SD.schoolDeletePlan(s.id).counts.invites, 2);
  assert.ok(SD.deleteSchool(boss, s.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM staff_email_invites WHERE school_id=?', s.id).n, 0);
  // An account's invites, sent and received.
  const t2 = auth.createUser({ username: 'SenderTeach', password: 'a-long-password-1' }); S.addMember(boss, oak.id, t2.id, 'teacher', { rosterName: 'Sam Sender' });
  E.rememberAddress(t2.id, 'sam@sender.example');
  assert.ok(SE.createInvite(t2, oak.id, { email: 'c@short.example', rosterName: 'C' }).ok);
  assert.ok(SE.createInvite(head, oak.id, { email: 'sam@sender.example', rosterName: 'Sam' }).code === 'emailStaff');
  q.run(`INSERT INTO staff_email_invites(id, school_id, email, role, token_hash, invited_by, created_at, sent_at, expires_at) VALUES ('toSam',?,?,?,?,?,?,?,?)`, elm.id, 'sam@sender.example', 'teacher', 'hsam', boss.id, Date.now(), Date.now(), Date.now() + 864e5);
  assert.ok(AD.deleteAccount(t2.id, boss, { by: 'admin', leaveSchools: true }).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM staff_email_invites WHERE invited_by=? OR email=?', t2.id, 'sam@sender.example').n, 0);
});

test('the strings are in all 13 languages, and the email renders in each with every placeholder filled', () => {
  const en = loadLocale('en');
  const keys = Object.keys(en).filter(k => /^school\.(emailInvite|joinStaff)\./.test(k)
    || /^school\.errors\.(badEmail|emailStaff|alreadyInvited|tooManyInvites|teachersOnly|childAccount|alreadyMember|staffAccountOnly|studentHere|emailMismatch)$/.test(k));
  assert.ok(keys.length > 50, `${keys.length} keys`);
  assert.equal(CODES.length, 13);
  for (const code of CODES) {
    const loc = loadLocale(code);
    // en-GB keeps only what is spelled differently; the rest falls back to American English.
    if (code !== 'en-GB') for (const k of keys) assert.ok(loc[k], `${code}: ${k}`);
    const m = SE.inviteEmail(tFor(code), { inviter: 'Ms Owl', school: 'Oak Hill', role: 'admin', url: 'https://oomba.example/join-staff/abc' });
    assert.match(m.subject, /Ms Owl/); assert.match(m.subject, /Oak Hill/);
    assert.ok(m.html.includes('https://oomba.example/join-staff/abc') && m.text.includes('https://oomba.example/join-staff/abc'), code);
    assert.doesNotMatch(m.subject + m.text, /\{\w+\}/, `${code}: placeholders filled`);
  }
  assert.match(SE.inviteEmail(tFor('ar'), { inviter: 'X', school: 'Y', role: 'teacher', url: 'https://x/y' }).html, /dir="rtl"/);
  assert.equal(loadLocale('en-GB')['school.joinStaff.cancelled'].includes('cancelled'), true);
});
