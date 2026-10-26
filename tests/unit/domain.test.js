// The domain move (server/domain.js, routes/handoff.js): with PUBLIC_URL set and its self-check passed, page loads on an
// old name go to the same page on PUBLIC_URL, and signed-in people stay signed in (the same session) through a one-time,
// browser-bound hand-off. Unset, nothing changes.
import http from 'node:http';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
delete process.env.TRUST_PROXY;
import test from 'node:test';
import assert from 'node:assert/strict';

const { config, parseRedirectHosts, hostOnly } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const D = await import('../../server/domain.js');
const { legacyHosts, wwwTwin, publicHost } = await import('../../server/site.js');
const { createUser, startSession, endSessions } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');

const OLD = 'magic-cup.onrender.com', NEW = 'oomba.ai';
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

/** Raw HTTP so the test can set Host (fetch can't). */
function request(port, { method = 'GET', path: p = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', d => { text += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    r.on('error', reject); r.end();
  });
}
let server, port;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); port = server.address().port; });
test.after(() => server.close());
const keep = { publicUrl: config.publicUrl, renderHost: config.renderHost, redirectHosts: config.redirectHosts, env: config.env };
/** The switch is on: PUBLIC_URL=https://oomba.ai, Render's name magic-cup.onrender.com, the self-check passed. */
function on() { config.publicUrl = `https://${NEW}`; config.renderHost = OLD; config.redirectHosts = []; D.state.ready = true; }
function off() { Object.assign(config, keep); D.state.ready = false; D._tokens.clear(); RL._reset(); }
test.beforeEach(off); test.afterEach(off);

/** A tiny cookie jar for one host. */
class Jar {
  constructor(init = '') { this.c = new Map(); for (const p of init.split(';').map(s => s.trim()).filter(Boolean)) { const i = p.indexOf('='); this.c.set(p.slice(0, i), p.slice(i + 1)); } }
  take(res) { for (const sc of [].concat(res.headers['set-cookie'] || [])) { const [nv, ...attrs] = sc.split(';'); const i = nv.indexOf('='); const name = nv.slice(0, i).trim(), value = nv.slice(i + 1); if (attrs.some(a => /max-age=0\b/i.test(a.trim()))) this.c.delete(name); else this.c.set(name, value); } return this; }
  get header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  get(name) { return this.c.get(name); }
}
const page = (host, path, jar, extra = {}) => request(port, { path, headers: { host, cookie: jar ? jar.header : '', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none', ...extra } });
const pathOf = loc => { const u = new URL(loc); return u.pathname + u.search; };

/** Follow a whole hand-off from an old-host page load. -> { hops: [responses], oldJar, newJar } */
async function handoff(oldJar, newJar, path = '/me') {
  const hops = [];
  const r1 = await page(OLD, path, oldJar); hops.push(r1); oldJar.take(r1);
  if (r1.status !== 302 || !r1.headers.location.includes('/auth/handoff/start')) return { hops, oldJar, newJar };
  const r2 = await page(NEW, pathOf(r1.headers.location), newJar, { 'sec-fetch-site': 'cross-site' }); hops.push(r2); newJar.take(r2);
  if (r2.status !== 302) return { hops, oldJar, newJar };
  const r3 = await page(OLD, pathOf(r2.headers.location), oldJar, { 'sec-fetch-site': 'cross-site' }); hops.push(r3); oldJar.take(r3);
  if (!r3.headers.location || !r3.headers.location.includes('/auth/handoff?t=')) return { hops, oldJar, newJar };
  const r4 = await page(NEW, pathOf(r3.headers.location), newJar, { 'sec-fetch-site': 'cross-site' }); hops.push(r4); newJar.take(r4);
  return { hops, oldJar, newJar };
}

// ---------------------------------------------------------------------------------------------------- pure parts
test('legacyHosts: Render\'s name and the www twin, never PUBLIC_URL itself; empty when PUBLIC_URL is unset', () => {
  config.renderHost = OLD; assert.equal(legacyHosts().size, 0, 'unset PUBLIC_URL: nothing redirects');
  on(); assert.deepEqual([...legacyHosts()].sort(), [OLD, `www.${NEW}`].sort());
  config.publicUrl = `https://www.${NEW}`; assert.ok(legacyHosts().has(NEW)); assert.ok(!legacyHosts().has(`www.${NEW}`));
  config.publicUrl = 'http://localhost:5932'; assert.ok(!legacyHosts().has('localhost:5932')); assert.equal(wwwTwin('localhost:5932'), '');
  assert.equal(wwwTwin('10.0.0.5'), ''); assert.equal(publicHost(), 'localhost:5932');
  assert.equal(hostOnly('MAGIC-CUP.onrender.com:443.'.replace(/\.$/, '')), OLD); assert.equal(hostOnly('Old.Example.com.'), 'old.example.com');
});

test('REDIRECT_HOSTS: a list; junk, own host and no PUBLIC_URL are startup errors (the value is never echoed)', () => {
  assert.deepEqual(parseRedirectHosts('old.example.com, OLD.example.com:443 ,b.example.com:8080', 'https://oomba.ai').hosts, ['old.example.com', 'b.example.com:8080']);
  const junk = parseRedirectHosts('bad host!<script>', 'https://oomba.ai'); assert.ok(junk.error); assert.doesNotMatch(junk.error, /script/);
  assert.match(parseRedirectHosts('oomba.ai', 'https://oomba.ai').error, /itself/);
  assert.match(parseRedirectHosts('old.example.com', '').error, /PUBLIC_URL is not/);
  assert.deepEqual(parseRedirectHosts('', '').hosts, []);
});

test('isPageLoad: documents only (Fetch Metadata), else page paths; never POST, frames, files or APIs', () => {
  const r = (method, path, headers = {}) => ({ method, path, headers });
  assert.equal(D.isPageLoad(r('GET', '/g/x', { 'sec-fetch-dest': 'document' })), true);
  for (const d of ['iframe', 'empty', 'image', 'script']) assert.equal(D.isPageLoad(r('GET', '/g/x', { 'sec-fetch-dest': d })), false, d);
  assert.equal(D.isPageLoad(r('GET', '/frame/abc', { 'sec-fetch-mode': 'navigate' })), false);
  assert.equal(D.isPageLoad(r('GET', '/g/x')), true, 'a crawler or curl');
  for (const p of ['/api/x', '/frame/x', '/css/app.css', '/vendor/three/x.js', '/favicon.ico']) assert.equal(D.isPageLoad(r('GET', p)), false, p);
  assert.equal(D.isPageLoad(r('POST', '/login', { 'sec-fetch-dest': 'document' })), false);
  assert.equal(D.isPageLoad(r('HEAD', '/')), true);
});

test('cleanTo: always a local path (with its query); open redirects and junk become safe', () => {
  assert.equal(D.cleanTo('/g/x?y=1'), '/g/x?y=1');
  assert.equal(new URL(D.cleanTo('//evil.example/x'), 'https://oomba.ai').host, 'oomba.ai');
  assert.equal(D.cleanTo('http://evil/a'), '/a');
  assert.equal(D.cleanTo('/' + 'a'.repeat(3000)), '/');
  assert.equal(D.cleanTo(undefined), '/'); assert.equal(D.cleanTo(['/x']), '/');
});

test('token store: single use, expires, refuses when full', () => {
  const n = D.randomCode();
  const t = D.putToken({ nonce: n, sessionId: 's', userId: 'u', to: '/' }); assert.match(t, D.CODE_RE);
  assert.equal(D.takeToken(t).userId, 'u'); assert.equal(D.takeToken(t), null, 'spent');
  assert.equal(D.takeToken('nope'), null);
  const keepTtl = D.HANDOFF.ttlMs, keepMax = D.HANDOFF.max;
  try {
    D.HANDOFF.ttlMs = -1; const t2 = D.putToken({ nonce: n, to: '/' }); assert.equal(D.takeToken(t2), null, 'expired');
    D.HANDOFF.ttlMs = keepTtl; D.HANDOFF.max = 1; D._tokens.clear();
    assert.ok(D.putToken({ nonce: n, to: '/' })); assert.equal(D.putToken({ nonce: n, to: '/' }), null, 'full');
  } finally { D.HANDOFF.ttlMs = keepTtl; D.HANDOFF.max = keepMax; }
});

// ---------------------------------------------------------------------------------------------------- off by default
test('off by default: no PUBLIC_URL, or PUBLIC_URL before its self-check passed, serves the old name as today', async () => {
  config.renderHost = OLD;
  let r = await page(OLD, '/'); assert.equal(r.status, 200);
  config.publicUrl = `https://${NEW}`;   // set, but not ready
  r = await page(OLD, '/'); assert.equal(r.status, 200);
  r = await request(port, { path: '/auth/handoff/start?from=x&to=/', headers: { host: NEW } }); assert.equal(r.status, 404, 'hand-off routes answer only when switched on');
});

// ---------------------------------------------------------------------------------------------------- redirect classes
test('old name: signed-out page loads get a cached 301 to the same page; frames, files, APIs and /health are served', async () => {
  on();
  let r = await page(OLD, '/g/x?y=1'); assert.equal(r.status, 301); assert.equal(r.headers.location, `https://${NEW}/g/x?y=1`);
  assert.match(r.headers['cache-control'], /max-age=86400/); assert.match(r.headers.vary, /Cookie/);
  r = await request(port, { path: '/g/x', headers: { host: OLD } }); assert.equal(r.status, 301, 'a crawler');
  r = await request(port, { method: 'HEAD', path: '/', headers: { host: OLD } }); assert.equal(r.status, 301);
  for (const [path, headers] of [['/health', {}], ['/api/me', { 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' }], ['/frame/abc', { 'sec-fetch-dest': 'iframe' }], ['/css/app.css', { 'sec-fetch-dest': 'style' }]]) {
    r = await request(port, { path, headers: { host: OLD, ...headers } }); assert.ok(r.status < 300 || r.status >= 400, `${path} -> ${r.status}`);
  }
  r = await request(port, { method: 'POST', path: '/api/auth/login', headers: { host: OLD, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } });
  assert.ok(r.status !== 301 && r.status !== 302 && r.status !== 308, 'a POST is answered here, never redirected');
});

test('old name: a click or form inside an old open tab gets the self-refreshing "we moved" page, in its language, with no token', async () => {
  on();
  const r = await page(OLD, '/g/x?y=1', null, { 'sec-fetch-site': 'same-origin', 'accept-language': 'he' });
  assert.equal(r.status, 200); assert.match(r.headers['cache-control'], /no-store/);
  assert.match(r.text, /http-equiv="refresh" content="0;url=https:\/\/oomba\.ai\/g\/x\?y=1"/); assert.match(r.text, /dir="rtl"/);
  assert.doesNotMatch(r.text, /[?&]t=/);
});

test('other names: www twin 301s to the apex; the new name, internal names and IPs are served; MOVED_TO_URL still wins', async () => {
  on();
  let r = await page(`www.${NEW}`, '/a'); assert.equal(r.status, 301); assert.equal(r.headers.location, `https://${NEW}/a`);
  for (const h of [NEW, 'app.internal:3000', '10.0.0.5']) { r = await page(h, '/'); assert.equal(r.status, 200, h); }
});

test('HSTS in production on the redirects, and never when PUBLIC_URL is plain http', async () => {
  on(); config.env = 'production';
  let r = await page(OLD, '/'); assert.match(r.headers['strict-transport-security'] || '', /max-age=31536000/);
  config.publicUrl = 'http://localhost:5932'; config.redirectHosts = [OLD];
  r = await page(OLD, '/'); assert.equal(r.headers['strict-transport-security'], undefined);
});

// ---------------------------------------------------------------------------------------------------- the hand-off
test('signed in on the old name: four hops, then the SAME session on the new name, and the clean address', async () => {
  on();
  const u = createUser({ username: 'MoverKid', password: 'blue-otter-42' });
  const oldJar = new Jar(cookieFor(u.id)); const original = oldJar.get('brb_session');
  const { hops, newJar } = await handoff(oldJar, new Jar(), '/me?tab=games');
  const [r1, r2, r3, r4] = hops;
  assert.equal(r1.status, 302); assert.equal(r1.headers.location, `https://${NEW}/auth/handoff/start?from=${OLD}&to=%2Fme%3Ftab%3Dgames`);
  for (const r of hops) { assert.match(r.headers['cache-control'], /no-store/); assert.equal(r.headers['referrer-policy'], 'no-referrer'); }
  assert.equal(r2.status, 302); assert.match(r2.headers.location, new RegExp(`^https://${OLD.replace(/\./g, '\\.')}/auth/handoff/issue\\?n=[\\w-]{43}&to=`));
  const nonceCookie = [].concat(r2.headers['set-cookie']).find(c => c.startsWith('__Host-brb_hn_'));
  assert.ok(nonceCookie, 'the __Host- nonce cookie (https)'); assert.match(nonceCookie, /HttpOnly/); assert.match(nonceCookie, /SameSite=Lax/); assert.match(nonceCookie, /Secure/); assert.match(nonceCookie, /Max-Age=120/);
  assert.equal(r3.status, 302); assert.match(r3.headers.location, /^https:\/\/oomba\.ai\/auth\/handoff\?t=[\w-]{43}$/);
  assert.equal(r3.text, '', 'the token is only in the Location header');
  assert.equal(r4.status, 303); assert.equal(r4.headers.location, `https://${NEW}/me?tab=games`);
  assert.equal(newJar.get('brb_session'), original, 'the same session, now also on the new name');
  assert.ok(![...newJar.c.keys()].some(k => k.includes('brb_hn_')), 'the nonce cookie is cleared');
  const me = await page(NEW, '/me', newJar); assert.equal(me.status, 200); assert.match(me.text, /MoverKid/);
  // Shared row: signing out on the new name ends the old name's sign-in too.
  const out = await request(port, { method: 'POST', path: '/api/auth/logout', headers: { host: NEW, cookie: newJar.header, 'content-type': 'application/json', origin: `https://${NEW}`, 'sec-fetch-site': 'same-origin' } });
  assert.ok(out.status < 400, `logout ${out.status}`);
  const after = await request(port, { path: '/api/me', headers: { host: OLD, cookie: oldJar.header, 'sec-fetch-site': 'same-origin' } });
  assert.ok(after.status === 401 || !/MoverKid/.test(after.text), 'signed out on both names');
});

test('a token is spent once, only in the browser that started it, and only while the session lives', async () => {
  on();
  const u = createUser({ username: 'OnceKid', password: 'blue-otter-42' });
  // Replay: the same token again (right browser) is refused.
  let a = await handoff(new Jar(cookieFor(u.id)), new Jar());
  const t = new URL(a.hops[2].headers.location).search;
  let r = await page(NEW, `/auth/handoff${t}`, a.newJar); assert.equal(r.status, 303); assert.match(r.headers.location, /\/login\?moved=1$/);
  // Someone else's browser (the attacker's link, no nonce): refused, and the token is burned for the right browser too.
  const victimOld = new Jar(cookieFor(u.id)); const newJar = new Jar();
  const r1 = await page(OLD, '/me', victimOld); const r2 = await page(NEW, pathOf(r1.headers.location), newJar.take({ headers: {} }), { 'sec-fetch-site': 'cross-site' }); newJar.take(r2);
  const r3 = await page(OLD, pathOf(r2.headers.location), victimOld, { 'sec-fetch-site': 'cross-site' });
  r = await page(NEW, pathOf(r3.headers.location), new Jar(), { 'sec-fetch-site': 'cross-site' });
  assert.equal(r.status, 303); assert.match(r.headers.location, /\/login\?moved=1/); assert.equal([].concat(r.headers['set-cookie'] || []).some(c => c.startsWith('brb_session=')), false);
  r = await page(NEW, pathOf(r3.headers.location), newJar, { 'sec-fetch-site': 'cross-site' }); assert.match(r.headers.location, /\/login\?moved=1/, 'burned');
  // Signed out everywhere between issue and redeem: refused.
  const j = new Jar(cookieFor(u.id)); const nj = new Jar();
  const s1 = await page(OLD, '/me', j); const s2 = await page(NEW, pathOf(s1.headers.location), nj, { 'sec-fetch-site': 'cross-site' }); nj.take(s2);
  const s3 = await page(OLD, pathOf(s2.headers.location), j, { 'sec-fetch-site': 'cross-site' });
  endSessions(u.id);
  r = await page(NEW, pathOf(s3.headers.location), nj, { 'sec-fetch-site': 'cross-site' }); assert.match(r.headers.location, /\/login\?moved=1&next=%2Fme/);
  // Banned between them: refused.
  const j2 = new Jar(cookieFor(u.id)); const nj2 = new Jar();
  const b1 = await page(OLD, '/me', j2); const b2 = await page(NEW, pathOf(b1.headers.location), nj2, { 'sec-fetch-site': 'cross-site' }); nj2.take(b2);
  const b3 = await page(OLD, pathOf(b2.headers.location), j2, { 'sec-fetch-site': 'cross-site' });
  q.run('UPDATE users SET banned=1 WHERE id=?', u.id);
  r = await page(NEW, pathOf(b3.headers.location), nj2, { 'sec-fetch-site': 'cross-site' }); assert.match(r.headers.location, /\/login\?moved=1/);
  q.run('UPDATE users SET banned=0 WHERE id=?', u.id);
  // Expired.
  const keepTtl = D.HANDOFF.ttlMs; D.HANDOFF.ttlMs = -1;
  try { a = await handoff(new Jar(cookieFor(u.id)), new Jar()); assert.match(a.hops[3].headers.location, /\/login\?moved=1/); } finally { D.HANDOFF.ttlMs = keepTtl; }
});

test('the hand-off never lengthens a sign-in: the rules of the original session still apply on the new name', async () => {
  on();
  const u = createUser({ username: 'RuleKid', password: 'blue-otter-42' });
  const oldJar = new Jar(cookieFor(u.id));
  const sid = q.get('SELECT id, expires_at FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1', u.id);
  const { hops, newJar } = await handoff(oldJar, new Jar());
  const sc = [].concat(hops[3].headers['set-cookie']).find(c => c.startsWith('brb_session='));
  const maxAge = +/Max-Age=(\d+)/.exec(sc)[1]; const want = Math.floor((sid.expires_at - Date.now()) / 1000) + 86400;
  assert.ok(Math.abs(maxAge - want) <= 3, `cookie for what the session has left (${maxAge} vs ${want})`);
  assert.equal(q.get('SELECT COUNT(*) n FROM sessions WHERE user_id=?', u.id).n, 1, 'no new session row');
  q.run('UPDATE sessions SET expires_at=? WHERE id=?', Date.now() - 1000, sid.id);
  const me = await page(NEW, '/me', newJar); assert.doesNotMatch(me.text, /RuleKid/, 'expired on both names');
});

test('already signed in on the new name: kept, nothing carried; a guest there is replaced; preferences come along', async () => {
  on();
  const a = createUser({ username: 'HereKid', password: 'blue-otter-42' }), b = createUser({ username: 'ThereKid', password: 'blue-otter-42' });
  const newJar = new Jar(cookieFor(a.id));
  const r1 = await page(OLD, '/me', new Jar(cookieFor(b.id)));
  const r2 = await page(NEW, pathOf(r1.headers.location), newJar, { 'sec-fetch-site': 'cross-site' });
  assert.equal(r2.status, 303); assert.equal(r2.headers.location, `https://${NEW}/me`); assert.equal([].concat(r2.headers['set-cookie'] || []).length, 0);
  // Preferences only (signed out): lang + theme come along, but never over the new name's own.
  const { hops, newJar: nj } = await handoff(new Jar('lang=fr; theme=dark'), new Jar());
  assert.equal(hops[3].status, 303); assert.equal(nj.get('lang'), 'fr'); assert.equal(nj.get('theme'), 'dark'); assert.equal(nj.get('brb_session'), undefined);
  const { newJar: nj2 } = await handoff(new Jar('lang=fr'), new Jar('lang=de'));
  assert.equal(nj2.get('lang'), 'de', 'the new name keeps its own language');
});

test('open redirects and wrong names are refused; the per-address limit falls back to a plain redirect', async () => {
  on();
  let r = await page(NEW, '/auth/handoff/start?from=evil.example&to=/x'); assert.equal(new URL(r.headers.location).host, NEW);
  r = await page(NEW, `/auth/handoff/start?from=${OLD}&to=${encodeURIComponent('//evil.example/x')}`); assert.equal(r.status, 302);
  assert.equal(new URL(decodeURIComponent(new URL(r.headers.location).searchParams.get('to')), `https://${NEW}`).host, NEW);
  r = await page(NEW, '/auth/handoff/issue?n=' + D.randomCode()); assert.equal(r.status, 404, 'issue only on an old name');
  r = await page('app.internal:3000', '/auth/handoff?t=' + D.randomCode()); assert.equal(r.status, 404);
  const keep = D.HANDOFF.perIpHour; D.HANDOFF.perIpHour = 1;
  try {
    const u = createUser({ username: 'RateKid', password: 'blue-otter-42' });
    let res = await handoff(new Jar(cookieFor(u.id)), new Jar()); assert.match(res.hops[2].headers.location, /\/auth\/handoff\?t=/);
    res = await handoff(new Jar(cookieFor(u.id)), new Jar()); assert.doesNotMatch(res.hops[2].headers.location, /t=/, 'over the limit: a plain redirect');
  } finally { D.HANDOFF.perIpHour = keep; }
});

test('the self-check: 204 only for this process\'s id; a probe that reaches it turns redirects on', async () => {
  let r = await request(port, { path: D.HOST_CHECK_PATH + D.bootId, headers: { host: NEW } }); assert.equal(r.status, 404, 'PUBLIC_URL unset: not there');
  config.publicUrl = `http://127.0.0.1:${port}`; config.redirectHosts = [OLD];
  r = await request(port, { path: D.HOST_CHECK_PATH + D.bootId }); assert.equal(r.status, 204);
  r = await request(port, { path: D.HOST_CHECK_PATH + 'wrong' }); assert.equal(r.status, 404);
  D.state.ready = false; assert.equal(await D.checkHostOnce(), true); assert.equal(D.state.ready, true);
  // PUBLIC_URL that doesn't reach us (a closed port): stays off.
  D.state.ready = false; config.publicUrl = 'http://127.0.0.1:9'; assert.equal(await D.checkHostOnce(), false); assert.equal(D.state.ready, false);
});
