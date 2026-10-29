// The child's voice on a parent-made account (docs/decisions.md "Parent-made child accounts" B5, B7): the first-sign-in
// card (fixed words, until OK), Me › For grown-ups with what the grown-up sees, Unlink and Report forcing a new password
// (other sign-ins and the link end, the report is marked parent_made), a code-linked child unchanged, the one-time note
// after the grown-up's password reset, and one list (F.GROWNUP_SEES) behind the card and the grown-up's page.
import { config, auth, F, q, PW, KID_PW, call, as, cookieFor, sessionIdOf, kid, grownup, famOf, make, linkByCode, audits } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const i18n = await import('../../server/i18n/index.js');

const NEW_PW = 'sunflower-42';

test('the first-sign-in card: on every page until OK, fixed words only (no adult-typed text), and only while madeOn', async () => {
  const g = grownup('GrownupTyped');
  const { child } = await make(g);
  for (const p of ['/', '/me', '/build', '/friends']) {
    const r = await as(child)(p);
    assert.match(r.text, /<section class="notice pagenote madecard"/, p);
    assert.match(r.text, /A grown-up made this account for you\./);
    assert.match(r.text, /href="\/me#grownups-report">🚩 This isn&#39;t my grown-up|href="\/me#grownups-report">🚩 This isn't my grown-up/);
    assert.doesNotMatch(r.text, /GrownupTyped/i, `${p}: never the adult's name`);
  }
  config.parentMadeChildren = false;
  assert.doesNotMatch((await as(child)('/')).text, /madecard/);
  assert.equal((await as(child)('/api/me/family/made-seen', { method: 'POST', body: {} })).status, 404);
  config.parentMadeChildren = true;
  // A self-signed-up kid never sees it, and can't answer it.
  const self = kid();
  assert.doesNotMatch((await as(self)('/')).text, /madecard/);
  assert.equal((await as(self)('/api/me/family/made-seen', { method: 'POST', body: {} })).status, 404);
  // OK: gone for good.
  assert.equal((await as(child)('/api/me/family/made-seen', { method: 'POST', body: {} })).status, 200);
  assert.ok(auth.getUser(child.id).made_note_seen_at);
  assert.doesNotMatch((await as(child)('/')).text, /madecard/);
});

test('Me › For grown-ups on a made account: what the grown-up sees, Unlink and Report each asking for a new password', async () => {
  const g = grownup(); const { child } = await make(g);
  const me = await as(child)('/me');
  assert.match(me.text, /<b>Your grown-up<\/b> made this account and is linked to it\./);
  assert.match(me.text, /<details class="famleave" id="grownups-report" data-hash-open>/);
  assert.match(me.text, /<details class="famleave" id="grownups-unlink" data-hash-open>/);
  assert.match(me.text, /Your grown-up knows your old password, so pick a new one\./);
  assert.equal((me.text.match(/name="newPassword"/g) || []).length, 2);
  // No new password: refused, nothing changes.
  const r = await as(child)('/api/me/family/report', { method: 'POST', body: {} });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'newPassword');
  assert.ok(F.linkOf(child.id));
  assert.equal((await as(child)('/api/me/family/report', { method: 'POST', body: { newPassword: KID_PW, newConfirm: KID_PW } })).json.field, 'newPassword', 'not the old one');
  assert.equal((await as(child)('/api/me/family/report', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: 'other-one-9' } })).json.field, 'newConfirm');
  assert.equal((await as(child)('/api/me/family/report', { method: 'POST', body: { newPassword: 'abc', newConfirm: 'abc' } })).json.field, 'newPassword');
});

test('Report on a made account: new password, every other sign-in ends, this device stays signed in, the link ends, the report is parent_made', async () => {
  const g = grownup(); const { child } = await make(g);
  const other = cookieFor(child.id), here = cookieFor(child.id);
  const r = await call(here, '/api/me/family/report', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } });
  assert.equal(r.status, 200, r.text);
  const fresh = auth.getUser(child.id);
  assert.ok(auth.verifyPassword(fresh, NEW_PW)); assert.ok(!auth.verifyPassword(fresh, KID_PW), 'the grown-up\'s password no longer works');
  assert.equal(F.linkOf(child.id), null);
  const rep = q.get('SELECT * FROM link_reports WHERE child_id=? ORDER BY created_at DESC', child.id);
  assert.equal(rep.parent_made, 1); assert.equal(rep.family_id, famOf(g).id);
  assert.ok(audits('family.link.report', famOf(g).id).length);
  assert.deepEqual(JSON.parse(audits('user.password_change', child.id).at(-1).details), { reason: 'family' });
  assert.equal(JSON.parse(audits('family.unlink', famOf(g).id).at(-1).details).by, 'child');
  // Every old sign-in ended (this one too); the reply carries a fresh one for this device.
  assert.equal((await call(other, '/me')).status, 302);
  assert.equal((await call(here, '/me')).status, 302);
  assert.ok(r.cookie); assert.equal((await call(r.cookie, '/me')).status, 200);
  // The grown-up's tools are gone with the link.
  const tok = F.requestToken(famOf(g).id, child.id);
  assert.equal((await as(g)(`/api/family/children/${tok}/switch`, { method: 'POST', body: { childPassword: NEW_PW, password: PW } })).status, 404);
  // With the link gone, the card is gone too.
  assert.doesNotMatch((await call(r.cookie, '/')).text, /madecard/);
  // The family can't make another account while the report is open.
  assert.equal((await as(g)('/api/family/children/new', { method: 'POST', body: { username: 'Brandnewbie', newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW } })).status, 409);
});

test('Unlink on a made account also forces a new password; a code-linked child keeps the one-tap Unlink and Report', async () => {
  const g = grownup(); const { child } = await make(g);
  const r = await as(child)('/api/me/family/unlink', { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } });
  assert.equal(r.status, 200, r.text);
  assert.ok(auth.verifyPassword(auth.getUser(child.id), NEW_PW));
  assert.equal(F.linkOf(child.id), null);
  assert.equal(q.get('SELECT COUNT(*) n FROM link_reports WHERE child_id=?', child.id).n, 0);
  // The made_by record stays (the admin still sees it); the account is an ordinary kid account.
  assert.equal(auth.getUser(child.id).made_by, g.id);
  // Code-linked: one tap, no password, no session change.
  const g2 = grownup(); const coded = kid(); await linkByCode(g2, coded);
  const me = await as(coded)('/me');
  assert.doesNotMatch(me.text, /name="newPassword"/);
  assert.match(me.text, /data-api="\/api\/me\/family\/unlink"/);
  const c = cookieFor(coded.id);
  const rr = await call(c, '/api/me/family/report', { method: 'POST', body: {} });
  assert.equal(rr.status, 200);
  assert.equal(q.get('SELECT parent_made FROM link_reports WHERE child_id=?', coded.id).parent_made, 0);
  assert.ok(auth.verifyPassword(auth.getUser(coded.id), KID_PW), 'password unchanged');
  assert.equal((await call(c, '/me')).status, 200, 'still signed in');
  // A made account later linked by code to another grown-up: that grown-up never knew the password, so one tap.
  const g3 = grownup(); await linkByCode(g3, auth.getUser(child.id));
  assert.equal(F.madeLinkOf(auth.getUser(child.id)), null);
  assert.equal((await as(auth.getUser(child.id))('/api/me/family/unlink', { method: 'POST', body: {} })).status, 200);
});

test('the grown-up resets a made child\'s password: kid rules, step-up, sign-outs, the lock cleared, the child told once', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const path = `/api/family/children/${token}/password`;
  const childSession = cookieFor(child.id);
  assert.equal((await as(g)(path, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW } })).status, 403, 'step-up');
  assert.equal((await as(g)(path, { method: 'POST', body: { newPassword: 'abc', newConfirm: 'abc', password: PW } })).json.field, 'newPassword');
  assert.equal((await as(g)(path, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: 'x-other-1', password: PW } })).json.field, 'newConfirm');
  assert.match((await as(g)(path, { method: 'POST', body: { newPassword: PW, newConfirm: PW, password: PW } })).json.error, /different password from yours/);
  const { allow, count, loginLockKey } = await import('../../server/services/ratelimit.js');
  allow(loginLockKey(child.username), 10, 900e3);
  const r = await as(g)(path, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW, password: PW } });
  assert.equal(r.status, 200, r.text);
  assert.doesNotMatch(r.text, new RegExp(NEW_PW));
  assert.equal(count(loginLockKey(child.username)), 0, 'the child\'s sign-in lock is cleared');
  assert.ok(auth.verifyPassword(auth.getUser(child.id), NEW_PW));
  assert.equal((await call(childSession, '/me')).status, 302, 'signed out everywhere');
  assert.deepEqual(JSON.parse(audits('family.child.password_reset', child.id).at(-1).details), { child: child.id });
  for (const a of q.all('SELECT details FROM audit_log WHERE target=?', child.id)) assert.doesNotMatch(a.details, new RegExp(NEW_PW));
  // Told once, on the next page after signing in again.
  const first = await as(auth.getUser(child.id))('/');
  assert.match(first.text, /Your grown-up gave your account a new password\./);
  assert.doesNotMatch((await as(auth.getUser(child.id))('/')).text, /gave your account a new password/);
  // A code-linked child's password can't be reset this way.
  const coded = kid(); const ctok = await linkByCode(g, coded);
  assert.equal((await as(g)(`/api/family/children/${ctok}/password`, { method: 'POST', body: { newPassword: NEW_PW, newConfirm: NEW_PW, password: PW } })).status, 404);
});

test('one list: the card names every GROWNUP_SEES category, and "What we keep" counts each of them', async () => {
  const en = i18n.dictionary('en');
  assert.deepEqual(F.GROWNUP_SEES, ['extras', 'games', 'chats', 'uploads', 'saves', 'scores', 'friends', 'messages', 'photo', 'signins']);
  const g = grownup(); const { child, token } = await make(g);
  const card = (await as(child)('/')).text;
  for (const c of F.GROWNUP_SEES) assert.ok(card.includes(en[`me.family.made.sees.${c}`]), c);
  const kept = F.keptCounts(child.id);
  for (const c of F.GROWNUP_SEES) assert.ok(c in kept, c);
  const c = cookieFor(g.id);
  await call(c, '/api/family/reauth', { method: 'POST', body: { password: PW } });
  const page = await call(c, `/family/children/${token}/data`);
  assert.equal(page.status, 200);
  const rowKey = { photo: 'photoNo', signins: 'signinsNone' };
  for (const k of F.GROWNUP_SEES.filter(x => x !== 'extras')) assert.ok(page.text.includes(en[`family.kept.rows.${rowKey[k] || k}`].split('{')[0].replace(/'/g, '&#39;')) || page.text.includes(en[`family.kept.rows.${rowKey[k] || k}`].split('{')[0]), k);
  assert.match(page.text, /Extra Builder messages are on your family page\./, 'extras: on /family itself');
  assert.match((await call(c, '/family')).text, /Family extra messages yesterday/);
});
