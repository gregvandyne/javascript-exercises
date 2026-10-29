// "Switch to <child>" and the way back (docs/decisions.md "Parent-made child accounts"; routes/family.js): made accounts
// only, the child's password (wrong tries count toward the child's own sign-in lock), the grown-up's session deleted and
// its cookie cleared, a fresh child session with the kid rules and no step-up, brb_ended cleared, the grown-up pages
// closed to the child's cookie, and the only way back a real grown-up sign-in that ends the child's session first.
import { auth, F, RL, q, PW, KID_PW, call, as, cookieFor, sessionIdOf, kid, grownup, famOf, make, linkByCode, audits } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { LOGIN } = await import('../../server/routes/auth.js');
const { SWITCH_TRIES } = await import('../../server/routes/family.js');

const sw = (cookie, token, b) => call(cookie, `/api/family/children/${token}/switch`, { method: 'POST', body: b });

test('made accounts only: a code-linked child, another family\'s child, an unknown token, a banned child: 404', async () => {
  const g = grownup();
  const coded = kid(); const codedTok = await linkByCode(g, coded);
  assert.equal((await sw(cookieFor(g.id), codedTok, { childPassword: KID_PW, password: PW })).status, 404, 'they agreed to a link, not to an adult signing in as them');
  const other = grownup(); const { token: otherTok } = await make(other);
  assert.equal((await sw(cookieFor(g.id), otherTok, { childPassword: KID_PW, password: PW })).status, 404);
  assert.equal((await sw(cookieFor(g.id), 'nope', { childPassword: KID_PW, password: PW })).status, 404);
  const { child, token } = await make(g);
  q.run('UPDATE users SET banned=1 WHERE id=?', child.id);
  assert.equal((await sw(cookieFor(g.id), token, { childPassword: KID_PW, password: PW })).status, 404);
  // The row of a code-linked child has no Switch, password or delete tools: exactly today's row with Remove.
  const page = await as(g)('/family');
  assert.match(page.text, new RegExp(`children/${codedTok}/remove`));
  assert.doesNotMatch(page.text, new RegExp(`children/${codedTok}/(switch|password|data)`));
});

test('the child\'s password is needed; wrong tries count toward the child\'s sign-in lock and the grown-up\'s switch limit', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const c = cookieFor(g.id);
  let r = await sw(c, token, { password: PW });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'childPassword');
  r = await sw(c, token, { childPassword: 'wrong-one', password: PW });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'childPassword');
  assert.match(r.json.error, new RegExp(`isn't ${child.username}'s password`));
  assert.equal(RL.count(RL.loginLockKey(child.username)), 1, 'counts toward the child\'s own sign-in lock');
  for (let i = 1; i < SWITCH_TRIES.fails; i++) await sw(c, token, { childPassword: 'wrong-again' });
  r = await sw(c, token, { childPassword: KID_PW });
  assert.equal(r.status, 429, 'locked: no more guesses than the sign-in page');
  // The child's own lock alone also stops it (and the sign-in page agrees).
  RL._reset();
  for (let i = 0; i < LOGIN.userFails; i++) RL.allow(RL.loginLockKey(child.username), LOGIN.userFails, LOGIN.window);
  assert.equal((await sw(cookieFor(g.id), token, { childPassword: KID_PW, password: PW })).status, 429);
  assert.equal(audits('family.switch', child.id).length, 0);
});

test('the grown-up\'s step-up is needed too', async () => {
  const g = grownup(); const { token } = await make(g);
  const r = await sw(cookieFor(g.id), token, { childPassword: KID_PW });
  assert.equal(r.status, 403); assert.equal(r.json.needPassword, true);
});

test('a switch: the grown-up\'s session row is gone and its cookie replaced; a fresh child session (kid rules, no step-up); brb_ended cleared; audited', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const gc = cookieFor(g.id), gsid = sessionIdOf(gc);
  const r = await sw(`${gc}; brb_ended=x`, token, { childPassword: KID_PW, password: PW });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/');
  assert.equal(q.get('SELECT 1 FROM sessions WHERE id=?', gsid), undefined, 'deleted, not parked');
  assert.ok(r.setCookies.some(c => /^brb_session=;/.test(c)), 'the grown-up cookie is cleared');
  assert.ok(r.setCookies.some(c => /^brb_ended=;/.test(c)), 'brb_ended is cleared');
  assert.ok(r.cookie, 'a new session cookie');
  const s = q.get('SELECT * FROM sessions WHERE id=?', sessionIdOf(r.cookie));
  assert.equal(s.user_id, child.id); assert.notEqual(s.id, gsid);
  assert.equal(s.reauth_at, null);
  assert.equal(s.expires_at - s.created_at, auth.SESSION_RULES.standard.max);
  assert.equal(r.setCookies.filter(c => /^brb_session=[^;]/.test(c)).length, 1, 'only one session cookie: no grown-up session is kept');
  assert.deepEqual(JSON.parse(audits('family.switch', child.id).at(-1).details), { from: g.id, to: child.id });
  // The old grown-up cookie does nothing now.
  const old = await call(gc, '/family');
  assert.equal(old.status, 302); assert.match(old.location, /^\/grown-ups\/login/);
  // The child's side: the normal kid shell (Home · Search · Build · Friends · Plans · Me), no switch-back anywhere.
  const home = await call(r.cookie, '/');
  assert.equal(home.status, 200);
  const tabs = [...home.text.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0].matchAll(/<a class="tab" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['/', '/search', '/build', '/friends', '/plans', '/me']);
  assert.doesNotMatch(home.text, /switch back|back to (your )?grown-up|href="\/family|href="\/grown-ups/i);
});

test('with only the child\'s cookie, /family, /family/*, /api/family/* and /api/billing/* are 404', async () => {
  const g = grownup(); const { token } = await make(g);
  const r = await sw(cookieFor(g.id), token, { childPassword: KID_PW, password: PW });
  const c = r.cookie;
  for (const p of ['/family', '/family/account', '/family/link', '/family/children/new', `/family/children/${token}/data`]) assert.equal((await call(c, p)).status, 404, p);
  for (const p of ['/api/family/link', '/api/family/children/new', `/api/family/children/${token}/switch`, `/api/family/children/${token}/delete`, `/api/family/children/${token}/password`, '/api/family/reauth', '/api/billing/portal', '/api/billing/family/checkout']) {
    assert.equal((await call(c, p, { method: 'POST', body: { password: PW, childPassword: KID_PW } })).status, 404, p);
  }
  assert.equal((await call(c, '/api/billing/status')).status, 404);
});

test('the way back is a real grown-up sign-in: it ends the child\'s session first and lands on /family', async () => {
  const g = grownup(); const { child, token } = await make(g);
  const r = await sw(cookieFor(g.id), token, { childPassword: KID_PW, password: PW });
  const childSid = sessionIdOf(r.cookie);
  const back = await call(r.cookie, '/api/auth/login', { method: 'POST', body: { username: g.username, password: PW } });
  assert.equal(back.status, 200, back.text);
  assert.equal(back.json.redirect, '/family');
  assert.equal(q.get('SELECT 1 FROM sessions WHERE id=?', childSid), undefined, 'the child\'s session ended before the grown-up\'s started');
  const s = q.get('SELECT * FROM sessions WHERE id=?', sessionIdOf(back.cookie));
  assert.equal(s.user_id, g.id); assert.equal(s.reauth_at, null, 'the step-up starts again on the grown-up\'s own fresh session');
  // The grown-up sign-in page asks a signed-in child to sign out first (no shortcut back).
  const page = await call(cookieFor(child.id), '/grown-ups/login');
  assert.match(page.text, /data-api="\/api\/auth\/logout"/);
});
