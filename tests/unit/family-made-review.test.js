// Parent-made child accounts, the review fixes (docs/decisions.md "Parent-made child accounts"): a Switch sign-in can't
// answer the child's first-sign-in card or use up the new-password note; "made" means the link made with the account,
// so a child who left and linked again by code gets no made-only powers back; banned and school accounts are refused;
// the protections that stay when PARENT_MADE_CHILDREN goes off; "Pause all" spares a child who left or reported; a
// deleted child's reserved name is a plain 404 on /u/; the make form lists every field error at once; and the legal
// sentences that change while parent-made accounts are on.
import { config, auth, F, q, PW, KID_PW, call, as, cookieFor, sessionIdOf, kid, grownup, famOf, make, linkByCode, fresh } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../../server/services/moderation.js');

const NEW_PW = 'sunflower-42';
const sw = (g, token) => call(cookieFor(g.id), `/api/family/children/${token}/switch`, { method: 'POST', body: { childPassword: KID_PW, password: PW } });
/** A real sign-in on the sign-in page: its session cookie. */
async function signIn(username, password) {
  const r = await call(null, '/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return r.cookie;
}

test('make, Switch, OK: the card hides for that Switch sign-in only, and still shows when the child signs in themselves', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const s = await sw(g, token);
  assert.equal(s.status, 200, s.text);
  assert.equal(q.get('SELECT via FROM sessions WHERE id=?', sessionIdOf(s.cookie)).via, 'switch');
  assert.match((await call(s.cookie, '/')).text, /madecard/, 'the card shows in a Switch sign-in');
  assert.equal((await call(s.cookie, '/api/me/family/made-seen', { method: 'POST', body: {} })).status, 200);
  assert.equal(auth.getUser(child.id).made_note_seen_at, null, 'not answered for good from a Switch sign-in');
  assert.doesNotMatch((await call(s.cookie, '/')).text, /madecard/, 'hidden for the rest of that sign-in');
  // The child's own sign-in: the card is back, and OK there answers it for good.
  const own = await signIn(child.username, KID_PW);
  assert.equal(q.get('SELECT via FROM sessions WHERE id=?', sessionIdOf(own)).via, null);
  assert.match((await call(own, '/')).text, /madecard/);
  assert.equal((await call(own, '/api/me/family/made-seen', { method: 'POST', body: {} })).status, 200);
  assert.ok(auth.getUser(child.id).made_note_seen_at);
  assert.doesNotMatch((await call(own, '/')).text, /madecard/);
});

test('the card is short: title, one line, the full list folded under "What can they see?", OK and "This isn\'t my grown-up"', async () => {
  const g = grownup(); const { child } = await make(g);
  const card = (await as(child)('/')).text.match(/<section class="notice pagenote madecard"[\s\S]*?<\/section>/)[0];
  assert.match(card, /They can see some counts about your account, but never what you made, wrote or said\./);
  assert.match(card, /<details class="madecard-more"><summary class="small">What can they see\?<\/summary>[\s\S]*<ul class="small madesees">/);
  assert.equal((card.match(/<li/g) || []).length, F.GROWNUP_SEES.length, 'the whole list, folded');
  assert.doesNotMatch(card, /what you do today/, 'no "never today" promise');
});

test('reset, Switch, then the child\'s own sign-in: the new-password note is shown there, once', async () => {
  const g = grownup(); const { child, token } = await make(g);
  assert.equal((await as(g)(`/api/family/children/${token}/password`, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW, password: PW } })).status, 200);
  const s = await call(cookieFor(g.id), `/api/family/children/${token}/switch`, { method: 'POST', body: { childPassword: NEW_PW, password: PW } });
  assert.equal(s.status, 200, s.text);
  for (let i = 0; i < 2; i++) assert.doesNotMatch((await call(s.cookie, '/')).text, /gave your account a new password/, 'never in a Switch sign-in');
  assert.ok(auth.getUser(child.id).pw_reset_note_at, 'not used up');
  const own = await signIn(child.username, NEW_PW);
  assert.match((await call(own, '/')).text, /Your grown-up gave your account a new password\./);
  assert.doesNotMatch((await call(own, '/')).text, /gave your account a new password/, 'once');
});

test('made, the child leaves with a new password, then links again by code: Switch, password, What we keep and Delete are 404', async () => {
  const g = grownup(); const { child, token } = await make(g);
  assert.equal(q.get('SELECT made_link FROM family_children WHERE child_id=?', child.id).made_link, 1);
  const r = await as(child)('/api/me/family/unlink', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } });
  assert.equal(r.status, 200, r.text);
  const back = auth.getUser(child.id);
  const tok = await linkByCode(g, back);
  assert.equal(tok, token, 'the same family and child: the same row and token');
  assert.ok(F.linkOf(child.id), 'linked again');
  assert.equal(q.get('SELECT made_link FROM family_children WHERE child_id=?', child.id).made_link, 0);
  assert.equal(F.madeLinkOf(auth.getUser(child.id)), null);
  assert.equal(F.madeChild(auth.getUser(g.id), tok), null);
  const post = (p, body) => as(g)(`/api/family/children/${tok}/${p}`, { method: 'POST', body: { password: PW, ...body } });
  assert.equal((await post('switch', { childPassword: NEW_PW })).status, 404, 'they agreed to a link, not to an adult signing in as them');
  assert.equal((await post('password', { newPassword: 'another-pw-7', newConfirm: 'another-pw-7' })).status, 404);
  assert.equal((await post('delete', { confirmName: child.username })).status, 404);
  assert.equal((await as(g)(`/family/children/${tok}/data`)).status, 404);
  assert.ok(auth.verifyPassword(auth.getUser(child.id), NEW_PW), 'the child\'s password is untouched');
  // The /family row is an ordinary code-linked row (Remove), and the child's Unlink is one tap again.
  const page = await as(g)('/family');
  assert.match(page.text, new RegExp(`children/${tok}/remove`));
  assert.doesNotMatch(page.text, new RegExp(`children/${tok}/(switch|password|data)`));
  const me = await as(auth.getUser(child.id))('/me');
  assert.doesNotMatch(me.text, /name="newPassword"/);
  assert.equal((await as(auth.getUser(child.id))('/api/me/family/unlink', { method: 'POST', body: {} })).status, 200);
});

test('a banned or school-managed made child: Change password and Delete are refused (the account may be under review)', async () => {
  const g = grownup();
  for (const set of ["banned=1", "managed_school='sch-x'"]) {
    const { child, token } = await make(g);
    q.run(`UPDATE users SET ${set} WHERE id=?`, child.id);   // no unlink: the refusal itself is tested
    const post = (p, body) => as(g)(`/api/family/children/${token}/${p}`, { method: 'POST', body: { password: PW, ...body } });
    assert.equal((await post('password', { newPassword: NEW_PW, newConfirm: NEW_PW })).status, 404, set);
    assert.equal((await post('delete', { confirmName: child.username })).status, 404, set);
    assert.equal((await as(g)(`/family/children/${token}/data`)).status, 404, set);
    assert.ok(auth.getUser(child.id).password_hash, `${set}: nothing deleted`);
    q.run('UPDATE family_children SET unlinked_at=? WHERE child_id=?', Date.now(), child.id);
  }
});

test('PARENT_MADE_CHILDREN off after use: no Remove for a made child (row and API), Me still asks the child for a new password, the note still shows', async () => {
  const g = grownup(); const { child, token } = await make(g);
  assert.equal((await as(g)(`/api/family/children/${token}/password`, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW, password: PW } })).status, 200);
  config.parentMadeChildren = false;
  const page = await as(g)('/family');
  assert.match(page.text, new RegExp(`<bdi>${child.display_name}</bdi>`), 'the child is still listed');
  assert.doesNotMatch(page.text, new RegExp(`children/${token}/(remove|switch|password|data)`), 'no Remove, no tools');
  assert.equal((await as(g)(`/api/family/children/${token}/remove`, { method: 'POST', body: {} })).status, 404);
  assert.ok(F.linkOf(child.id), 'still linked: no orphan account whose password an adult knows');
  const c = auth.getUser(child.id);
  const own = await signIn(c.username, NEW_PW);
  const home = await call(own, '/');
  assert.match(home.text, /Your grown-up gave your account a new password\./, 'told even with the flag off');
  assert.doesNotMatch(home.text, /madecard/, 'the introduction card is off with the flag');
  const me = await call(own, '/me');
  assert.match(me.text, /made this account and is linked to it/);
  assert.equal((await call(own, '/api/me/family/unlink', { method: 'POST', body: {} })).json.field, 'newPassword', 'leaving still needs a new password');
  // A code-linked child keeps Remove.
  const coded = kid(); const ctok = await linkByCode(g, coded);
  assert.match((await as(g)('/family')).text, new RegExp(`children/${ctok}/remove`));
});

test('"Pause all" pauses only the accounts still the grown-up\'s: not a child who left, reported, or is linked to another family', async () => {
  const admin = auth.createUser({ username: `RevAdmin${fresh()}`, password: 'admin-password-1', role: 'admin' });
  const g = grownup();
  const { child: stays } = await make(g);
  const { child: left } = await make(g);
  assert.equal((await as(left)('/api/me/family/unlink', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } })).status, 200);
  // A third, made in an earlier day (the daily limit), reports the grown-up; a fourth leaves and is linked by another family.
  q.run('UPDATE users SET made_at=made_at-? WHERE made_by=?', 2 * 86400e3, g.id);
  const { child: reporter } = await make(g);
  assert.equal((await as(reporter)('/api/me/family/report', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } })).status, 200);
  q.run("UPDATE link_reports SET status='resolved' WHERE child_id=?", reporter.id);   // the family may make again
  const { child: moved } = await make(g);
  assert.equal((await as(moved)('/api/me/family/unlink', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } })).status, 200);
  await linkByCode(grownup(), auth.getUser(moved.id));
  assert.equal(mod.banUser(admin, g.id, 'test').ok, true);
  assert.deepEqual(F.pausableMade(g.id), [stays.id]);
  const look = await as(admin)(`/admin?tab=users&username=${encodeURIComponent(g.username)}`);
  assert.match(look.text, /· left · not paused with this grown-up/);
  assert.match(look.text, /· reported · not paused with this grown-up/);
  const r = await as(admin)(`/api/admin/users/${g.id}/pause-made`, { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.paused, 1);
  assert.equal(auth.getUser(stays.id).banned, 1);
  for (const c of [left, reporter, moved]) assert.equal(auth.getUser(c.id).banned, 0, c.username);
  assert.ok(F.linkOf(moved.id), 'the other family\'s link is untouched');
});

test('a deleted child\'s reserved name: /u/<name> is the normal 404, not a redirect; the official old names still redirect', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const name = child.username;
  assert.equal((await as(g)(`/api/family/children/${token}/delete`, { method: 'POST', body: { confirmName: name, password: PW } })).status, 200);
  assert.ok(auth.isRetiredName(name), 'nobody can sign up with it');
  const r = await call(null, `/u/${name}`);
  assert.equal(r.status, 404);
  assert.equal(r.location, null);
  const old = await call(null, '/u/MagicCups');
  assert.equal(old.status, 301); assert.equal(old.location, '/u/OombaAcademy');
});

test('the make form with a stale step-up: every field error at once, with the grown-up\'s password', async () => {
  const g = grownup();
  const r = await as(g)('/api/family/children/new', { method: 'POST', body: { username: '', newPassword: 'ab', newConfirm: '' } });
  assert.equal(r.status, 400, r.text);
  assert.equal(r.json.field, 'username');
  assert.deepEqual(Object.keys(r.json.errors), ['username', 'newPassword', 'ack', 'guardian', 'password']);
  assert.equal(r.json.needPassword, true);
  // Only the step-up left: the usual 403.
  const name = `Sprout${fresh()}`;
  const s = await as(g)('/api/family/children/new', { method: 'POST', body: { username: name, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1' } });
  assert.equal(s.status, 403); assert.equal(s.json.needPassword, true);
  assert.equal(auth.getUserByName(name), null);
});

test('legal text while parent-made accounts are on: the family-page delete replaces "no button yet" (/privacy, /parents, terms §8)', async () => {
  const has = (txt, re) => assert.match(txt, re);
  let p = (await call(null, '/privacy')).text;
  has(p, /except that a grown-up who made their child&#39;s account can delete it|except that a grown-up who made their child's account can delete it/);
  assert.doesNotMatch(p, /There is no button yet to delete an account or download its data\. To ask for either/);
  has(p, /everything the child made, wrote and uploaded goes straight away/);
  assert.doesNotMatch(p, /never what the child does today/);
  has((await call(null, '/terms')).text, /A grown-up who made their child(&#39;|')s account can delete it from their family page\. Otherwise there is no delete button yet/);
  has((await call(null, '/parents')).text, /except that a grown-up who made their child(&#39;|')s account can delete it/);
  config.parentMadeChildren = false;
  p = (await call(null, '/privacy')).text;
  has(p, /There is no button yet to delete an account or download its data\. To ask for either/);
  assert.doesNotMatch(p, /who made their child(&#39;|')s account can delete it/);
  has((await call(null, '/terms')).text, /There is no delete button yet: to delete an account/);
});
