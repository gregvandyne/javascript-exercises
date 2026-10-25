// Theme choice (Same as my device / Light / Dark): precedence, ?theme= links (saved only for same-origin requests),
// POST /api/me/theme, the account's saved choice, sign-up carry-over, and the two-block rule for dark colours in the CSS.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { pickTheme, normalizeTheme } = await import('../../server/theme.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('pickTheme: ?theme= → cookie → saved account choice → same as the device', () => {
  const all = { query: 'dark', cookie: 'light', user: { theme: 'dark' } };
  assert.deepEqual(pickTheme(all), { theme: 'dark', source: 'query' });
  assert.deepEqual(pickTheme({ ...all, query: null }), { theme: 'light', source: 'cookie' });
  assert.deepEqual(pickTheme({ ...all, query: 'pink', cookie: null }), { theme: 'dark', source: 'user' }, 'a bad ?theme= is ignored');
  assert.deepEqual(pickTheme({ cookie: 'system', user: { theme: 'dark' } }), { theme: 'system', source: 'cookie' }, '"Same as my device" on this device beats the account');
  assert.deepEqual(pickTheme({ cookie: 'nope', user: { theme: '' } }), { theme: 'system', source: 'default' }, "'' in the database = system");
  assert.deepEqual(pickTheme(), { theme: 'system', source: 'default' });
  assert.equal(normalizeTheme(' Dark '), 'dark'); assert.equal(normalizeTheme('auto'), null); assert.equal(normalizeTheme(['dark']), null);
});

async function server() {
  const app = createApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (p, headers = {}) => fetch(base + p, { headers, redirect: 'manual' });
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });
  return { base, get, post, close: () => new Promise(r => srv.close(r)) };
}
/** <html ...> tag and color-scheme meta of a page. */
async function head(res) {
  const body = await res.text();
  return { html: body.match(/<html[^>]*>/)[0], scheme: (body.match(/<meta name="color-scheme" content="([^"]*)">/) || [])[1], body };
}
const sessionOf = res => res.headers.get('set-cookie').match(/brb_session=[^;]+/)[0];
async function signIn(s, name) {
  const u = auth.createUser({ username: name + Math.floor(Math.random() * 1e5), password: 'secret123' });
  return { u, cookie: sessionOf(await s.post('/api/auth/login', { username: u.username, password: 'secret123' })) };
}
// Consonants only: sign-up refuses long digit runs (they look like phone numbers).
const uniq = p => p + Array.from({ length: 6 }, () => 'bcdfghjkmnpqrstvwxz'[Math.floor(Math.random() * 19)]).join('');
const savedTheme = id => q.get('SELECT theme FROM users WHERE id=?', id).theme;

test('HTTP: data-theme and color-scheme only follow an explicit choice', async () => {
  const s = await server();
  try {
    let h = await head(await s.get('/'));
    assert.equal(h.html, '<html lang="en" dir="ltr">', 'same as the device: no data-theme');
    assert.equal(h.scheme, 'light dark');
    assert.match(h.body, /<details class="themepick" data-themepick>/);
    assert.match(h.body, /aria-label="Theme: Same as my device"/);
    assert.match(h.body, /href="\/\?theme=dark"[^>]*data-theme-choice="dark"/, 'the menu is plain links (works with no JavaScript)');
    h = await head(await s.get('/', { Cookie: 'theme=dark' }));
    assert.equal(h.html, '<html lang="en" dir="ltr" data-theme="dark">'); assert.equal(h.scheme, 'dark');
    assert.match(h.body, /aria-label="Theme: Dark"/);
    assert.match(h.body, /data-theme-choice="dark" data-label="Theme: Dark" aria-current="true"/);
    h = await head(await s.get('/safety', { Cookie: 'theme=light' }));
    assert.equal(h.html, '<html lang="en" dir="ltr" data-theme="light">'); assert.equal(h.scheme, 'light');
    h = await head(await s.get('/', { Cookie: 'theme=system' }));
    assert.equal(h.html, '<html lang="en" dir="ltr">'); assert.equal(h.scheme, 'light dark');
    h = await head(await s.get('/', { Cookie: 'theme=<script>' }));
    assert.equal(h.html, '<html lang="en" dir="ltr">', 'a junk cookie is ignored');
    // Pages without the top bar (the play page) and the error pages still follow the choice.
    h = await head(await s.get('/no/such/page', { Cookie: 'theme=dark' }));
    assert.match(h.html, /data-theme="dark"/);
  } finally { await s.close(); }
});

test('HTTP: ?theme= saves the choice for same-origin requests only, then redirects without it', async () => {
  const s = await server();
  try {
    const r = await s.get('/search?q=shark&theme=dark');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/search?q=shark', 'same page, other parameters kept');
    assert.match(r.headers.get('set-cookie'), /^theme=dark; Path=\/; Max-Age=31536000; SameSite=Lax$/);
    const same = await s.get('/?theme=light', { 'Sec-Fetch-Site': 'same-origin' });
    assert.match(same.headers.get('set-cookie'), /theme=light/);
    const typed = await s.get('/?theme=light', { 'Sec-Fetch-Site': 'none' });
    assert.match(typed.headers.get('set-cookie'), /theme=light/, 'typed into the address bar');

    const { u, cookie } = await signIn(s, 'ThemeLink');
    const cross = await s.get('/?theme=dark', { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(cross.status, 303); assert.equal(cross.headers.get('location'), '/');
    assert.equal(cross.headers.get('set-cookie'), null, 'a link from another site is not saved');
    assert.equal(savedTheme(u.id), '');
    const foreign = await s.get('/?theme=dark', { Cookie: cookie, Origin: 'https://evil.example' });
    assert.equal(foreign.headers.get('set-cookie'), null, 'no Sec-Fetch-Site but a foreign Origin: not saved');
    assert.equal(savedTheme(u.id), '');
    const mine = await s.get('/me?theme=dark', { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(mine.status, 303); assert.equal(mine.headers.get('location'), '/me');
    assert.equal(savedTheme(u.id), 'dark', 'saved on the account when signed in');
    // API calls are never redirected.
    assert.equal((await s.get('/api/me?theme=dark')).status, 200);
  } finally { await s.close(); }
});

test('POST /api/me/theme: cookie for everyone, the account too when signed in, 400 on a bad value', async () => {
  const s = await server();
  try {
    const out = await s.post('/api/me/theme', { theme: 'dark' });
    assert.equal(out.status, 200);
    assert.deepEqual(await out.json(), { ok: true, theme: 'dark' });
    assert.match(out.headers.get('set-cookie'), /^theme=dark; Path=\/; Max-Age=31536000; SameSite=Lax$/, 'signed out: only the cookie');
    for (const bad of [{ theme: 'pink' }, {}, { theme: ['dark'] }]) {
      const r = await s.post('/api/me/theme', bad);
      assert.equal(r.status, 400); assert.equal(r.headers.get('set-cookie'), null);
      assert.equal((await r.json()).error, 'Pick one of the themes.');
    }
    assert.equal((await s.post('/api/me/theme', { theme: 'dark' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, 'csrfCheck guards it');

    const { u, cookie } = await signIn(s, 'ThemeApi');
    const r = await s.post('/api/me/theme', { theme: 'light' }, { Cookie: cookie });
    assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /theme=light/);
    assert.equal(savedTheme(u.id), 'light');
    await s.post('/api/me/theme', { theme: 'system' }, { Cookie: cookie });
    assert.equal(savedTheme(u.id), '', "'Same as my device' is stored as ''");
  } finally { await s.close(); }
});

test('the account\'s choice applies on a new device, and the device\'s cookie beats it', async () => {
  const s = await server();
  try {
    const { u, cookie } = await signIn(s, 'ThemeAcct');
    q.run("UPDATE users SET theme='dark' WHERE id=?", u.id);
    assert.match((await head(await s.get('/', { Cookie: cookie }))).html, /data-theme="dark"/, 'no cookie on this device: the saved choice');
    assert.match((await head(await s.get('/', { Cookie: `${cookie}; theme=light` }))).html, /data-theme="light"/);
    assert.doesNotMatch((await head(await s.get('/', { Cookie: `${cookie}; theme=system` }))).html, /data-theme/);
    const me = await (await s.get('/me', { Cookie: cookie })).text();
    assert.match(me, /<form action="\/me#appearance" method="get" id="themeform">/, 'the Me page offers the choice as a plain form');
    assert.match(me, /<input type="radio" name="theme" value="dark" checked>/);
  } finally { await s.close(); }
});

test('a theme picked before signing up (or playing as a guest) comes along to the new account', async () => {
  const s = await server();
  try {
    const name = uniq('ThemeNew');
    const r = await s.post('/api/auth/signup', { username: name, password: 'secret123' }, { Cookie: 'theme=dark' });
    assert.equal(r.status, 200);
    assert.equal(auth.getUserByName(name).theme, 'dark');
    const plain = uniq('ThemeNo');
    await s.post('/api/auth/signup', { username: plain, password: 'secret123' });
    assert.equal(auth.getUserByName(plain).theme, '', 'no choice made: nothing saved');
    const g = await s.post('/api/auth/guest', {}, { Cookie: 'theme=light' });
    assert.equal(auth.getUser((await g.json()).user.id).theme, 'light');
  } finally { await s.close(); }
});

/** CSS without comments. */
const css = f => fs.readFileSync(path.join(ROOT, 'public/css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the block that starts right after `opener` (balanced braces). */
function blockAfter(src, opener) {
  const i = src.indexOf(opener); if (i < 0) return null;
  let depth = 1, j = i + opener.length;
  for (; j < src.length && depth; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; }
  return src.slice(i + opener.length, j - 1);
}
const props = body => Object.fromEntries([...body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));

test('CSS: the dark colours live in exactly two identical blocks in app.css, and nowhere else', () => {
  const app = css('app.css');
  const sys = blockAfter(app, '@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){');
  const picked = blockAfter(app, '@media screen{:root[data-theme="dark"]{');
  assert.ok(sys && picked, 'both dark blocks exist');
  assert.equal(sys.replace(/\s+/g, ' ').trim(), picked.replace(/\s+/g, ' ').trim(), 'the two dark blocks have the same body');
  const dark = props(sys);
  assert.equal(dark['color-scheme'], 'dark');
  const light = props(blockAfter(app, '\n:root{'));
  for (const k of Object.keys(dark)) assert.ok(k in light, `${k} has a light value in :root too`);
  for (const k of ['--bg', '--card', '--ink', '--on-accent', '--warn-bg', '--warn-ink', '--bad-ink', '--viz-1']) assert.ok(k in dark, `${k} is a dark token`);
  for (const f of fs.readdirSync(path.join(ROOT, 'public/css')).filter(f => f.endsWith('.css'))) {
    const n = (css(f).match(/prefers-color-scheme/g) || []).length;
    assert.equal(n, f === 'app.css' ? 1 : 0, `${f}: no other prefers-color-scheme rules (use a token instead)`);
    if (f !== 'app.css') assert.doesNotMatch(css(f), /\[data-theme/, `${f}: theme selectors only in the app.css token blocks`);
  }
  assert.equal((app.match(/\[data-theme/g) || []).length, 2, 'data-theme appears only in the two token blocks');
});
