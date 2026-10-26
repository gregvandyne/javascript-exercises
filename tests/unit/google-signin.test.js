// Sign in with Google, stage 1: the protocol (PKCE, state, nonce, ID token checks against a fake Google) and signing
// in an account whose Google account is already connected. Off (no client id and secret) = today's site exactly.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeGoogle } = await import('../support/fake-google.js');
const fake = await startFakeGoogle();
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const oidc = await import('../../server/oidc.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { RL._reset(); config.googleClientId = 'test-client.apps.googleusercontent.com'; config.googleClientSecret = 'fake-test-secret'; });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
function connectedUser(email = `kid${++n}@dwes.test`, extra = {}) {
  const u = createUser({ username: `Gkid${n}${Date.now() % 1000}`.slice(0, 16), password: 'blue-otter-42' });
  const sub = '9100000' + n;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', sub, u.id, email, 'dwes.test', Date.now());
  if (extra.managedSchool) q.run('UPDATE users SET managed_school=? WHERE id=?', extra.managedSchool, u.id);
  return { u, sub, email };
}
/** The whole round trip: our start → fake Google (auto mode) → our callback. -> the callback's response. */
async function signIn({ email = 'ana@dwes.test', hd, sub, name, verified, error, cookie = '', next, tamperState } = {}) {
  const s = await get(`/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`, cookie);
  assert.equal(s.status, 302);
  const flow = cookieOf(s, 'brb_gflow'); const to = new URL(s.headers.get('location'));
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', email);
  if (hd !== undefined) to.searchParams.set('fake_hd', hd);
  if (sub) to.searchParams.set('fake_sub', sub);
  if (name) to.searchParams.set('fake_name', name);
  if (verified === false) to.searchParams.set('fake_verified', '0');
  if (error) to.searchParams.set('fake_error', error);
  const a = await fetch(to, { redirect: 'manual' });
  const cb = new URL(a.headers.get('location'));
  if (tamperState) cb.searchParams.set('state', 'x' + cb.searchParams.get('state').slice(1));
  const res = await get(cb.pathname + cb.search, [cookie, flow].filter(Boolean).join('; '));
  res.flow = flow; res.callback = cb.pathname + cb.search;
  return res;
}
const loc = r => r.headers.get('location');

test('off: no client id and secret means every Google route is unknown and the sign-in page is unchanged', async () => {
  config.googleClientId = '';
  assert.equal((await get('/auth/google/start')).status, 404);
  assert.equal((await get('/auth/google/callback?code=a&state=b')).status, 404);
  const page = await (await get('/login?gerr=unknown')).text();
  assert.doesNotMatch(page, /gbtn|Sign in with Google|We don't know this Google account/);
  config.googleClientId = 'test-client.apps.googleusercontent.com';
  config.googleClientSecret = '';
  assert.equal((await get('/auth/google/start')).status, 404);
});

test('off in production until PUBLIC_URL is set', async () => {
  const keep = { env: config.env, publicUrl: config.publicUrl };
  try {
    config.env = 'production'; config.publicUrl = '';
    assert.equal(oidc.googleEnabled(), false);
    config.publicUrl = 'https://oomba.ai';
    assert.equal(oidc.googleEnabled(), true);
  } finally { Object.assign(config, keep); }
});

test('the sign-in page shows the button, and start asks Google for the minimum with PKCE, state and nonce', async () => {
  const page = await (await get('/login?next=/classes')).text();
  assert.match(page, /class="gbtn" href="\/auth\/google\/start\?next=%2Fclasses"/);
  assert.match(page, /For school Google accounts/);
  const s = await get('/auth/google/start');
  assert.equal(s.headers.get('cache-control'), 'no-store');
  const u = new URL(loc(s));
  assert.equal(u.origin + u.pathname, fake.url + '/o/oauth2/v2/auth');
  const p = Object.fromEntries(u.searchParams);
  assert.equal(p.scope, 'openid email profile');
  assert.equal(p.response_type, 'code');
  assert.equal(p.code_challenge_method, 'S256');
  assert.equal(p.prompt, 'select_account');
  assert.equal(p.redirect_uri, `${base}/auth/google/callback`);
  assert.ok(p.state.length >= 43 && p.nonce.length >= 43 && p.code_challenge.length === 43);
  assert.equal(p.access_type, undefined); assert.equal(p.hd, undefined); assert.equal(p.login_hint, undefined);
  const c = s.headers.getSetCookie().find(x => x.startsWith('brb_gflow='));
  assert.match(c, /Path=\/auth\/google; HttpOnly; SameSite=Lax; Max-Age=600/);
});

test('a connected account signs in and lands on its home (or the page it asked for)', async () => {
  const { u, sub, email } = connectedUser();
  const r = await signIn({ email, sub, next: '/search' });
  assert.equal(r.status, 303); assert.equal(loc(r), '/search');
  const session = cookieOf(r, 'brb_session'); assert.ok(session.length > 20);
  assert.match(r.headers.getSetCookie().find(x => x.startsWith('brb_gflow=')), /Max-Age=0/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  const me = await (await get('/api/me', session)).json().catch(() => null);
  if (me) assert.equal(me.user?.id ?? me.id, u.id);
  const row = q.get('SELECT * FROM google_identities WHERE sub=?', sub);
  assert.ok(row.last_used_at > 0);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.google_signin' AND actor_id=?", u.id));
  // The same callback again (a replay) is refused.
  const again = await get(r.callback, r.flow);
  assert.match(loc(again), /gerr=expired/);
});

test('unknown Google accounts are turned away kindly, and nothing is created', async () => {
  const users = q.get('SELECT COUNT(*) n FROM users').n;
  const r = await signIn({ email: 'stranger@dwes.test', sub: '777000111' });
  assert.equal(loc(r), '/login?gerr=unknown');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users);
  assert.equal(q.get("SELECT COUNT(*) n FROM google_identities WHERE sub='777000111'").n, 0);
  const page = await (await get(loc(r))).text();
  assert.match(page, /role="alert">We don&#39;t know this Google account yet|role="alert">We don't know this Google account yet/);
});

test('cancel, school block and setup errors become fixed messages; nothing from the URL is shown', async () => {
  assert.match(loc(await signIn({ error: 'access_denied' })), /gerr=denied$/);
  assert.match(loc(await signIn({ error: 'admin_policy_enforced' })), /gerr=schoolBlocked$/);
  assert.match(loc(await signIn({ error: 'redirect_uri_mismatch' })), /gerr=notSetUp$/);
  assert.match(loc(await signIn({ error: '<script>' })), /gerr=googleDown$/);
  const page = await (await get('/login?gerr=%3Cscript%3E')).text();
  assert.doesNotMatch(page, /role="alert"/);
});

test('a callback without its flow cookie, or with a changed state, is refused', async () => {
  const { sub, email } = connectedUser();
  const r = await signIn({ email, sub, tamperState: true });
  assert.match(loc(r), /gerr=expired/); assert.equal(cookieOf(r, 'brb_session'), '');
  const noCookie = await get('/auth/google/callback?code=abc&state=def');
  assert.equal(loc(noCookie), '/login?gerr=expired');
});

test('an unverified email is refused with its own message', async () => {
  const { sub, email } = connectedUser();
  assert.match(loc(await signIn({ email, sub, verified: false })), /gerr=unverified/);
});

for (const tamper of ['badSig', 'wrongAud', 'wrongIss', 'expired', 'iatFuture', 'iatOld', 'wrongNonce', 'noKid', 'unknownKid', 'algNone', 'algHS256', 'noEmail', 'noIdToken', 'status500', 'huge', 'azpOther']) {
  test(`a bad answer from Google never signs anyone in: ${tamper}`, async () => {
    const { sub, email } = connectedUser();
    fake.next({ tamper });
    const r = await signIn({ email, sub });
    assert.match(loc(r), /gerr=googleDown/, tamper);
    assert.equal(cookieOf(r, 'brb_session'), '');
  });
}

test("Google's keys are cached, and a new key is picked up", async () => {
  oidc._resetJwks();
  const before = fake.stats.jwks;
  for (let i = 0; i < 3; i++) { const { sub, email } = connectedUser(); assert.equal(loc(await signIn({ email, sub })), '/'); }
  assert.equal(fake.stats.jwks - before, 1);
  fake.rotateKey();
  // A token signed with a key we haven't seen refetches the keys, but at most once a minute (forged key ids can't make
  // us hammer Google).
  const a = connectedUser();
  assert.match(loc(await signIn({ email: a.email, sub: a.sub })), /gerr=googleDown/);
  assert.equal(fake.stats.jwks - before, 1);
  oidc._ageJwks(61e3);
  const b = connectedUser();
  assert.equal(loc(await signIn({ email: b.email, sub: b.sub })), '/');
  assert.equal(fake.stats.jwks - before, 2);
});

test("a school account follows its school's Google domains", async () => {
  const sid = 'sch-g1';
  q.run("INSERT INTO schools(id, name, slug, settings, created_at) VALUES (?, 'G School', 'g-school', ?, ?)", sid, JSON.stringify({ googleDomains: [] }), Date.now());
  const { sub, email } = connectedUser(undefined, { managedSchool: sid });
  assert.match(loc(await signIn({ email, sub, hd: 'dwes.test' })), /gerr=schoolOff/);
  q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify({ googleDomains: ['dwes.test'] }), sid);
  assert.equal(loc(await signIn({ email, sub, hd: 'dwes.test' })), '/classes');
  assert.match(loc(await signIn({ email, sub, hd: '' })), /gerr=wrongDomain/);
});

test('a paused account cannot sign in with Google', async () => {
  const { u, sub, email } = connectedUser();
  q.run('UPDATE users SET banned=1 WHERE id=?', u.id);
  assert.match(loc(await signIn({ email, sub })), /gerr=paused/);
});

test('signing in as someone else on a shared device ignores the last person\'s page', async () => {
  const a = connectedUser(); const b = connectedUser();
  // a's sign-in ended on this device (the brb_ended note), then b signs in with a next= from a's page.
  const endedCookie = cookieFor(a.u.id);
  q.run('UPDATE sessions SET expires_at=1 WHERE user_id=?', a.u.id);
  const r = await signIn({ email: b.email, sub: b.sub, next: '/lessons/secret', cookie: endedCookie });
  assert.equal(loc(r), '/');
});
