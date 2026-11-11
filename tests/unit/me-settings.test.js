// The Settings page (/me/settings; docs/decisions.md "Settings page"): Language, Appearance, Password and Sign out moved
// off the Me page, in that order, after the Teacher plan for staff (its states are in teacher-plan.test.js); a section
// nav; a Settings tile on the Me page; signed in only; grown-ups go to their own settings page; the old /me#… anchors and
// the links that pointed at them now lead here. Everything else stays on the Me page.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (path, u) => { const r = await fetch(base + path, { redirect: 'manual', headers: u ? { cookie: cookieFor(u.id) } : {} }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const nav = text => (text.match(/<nav class="setnav"[\s\S]*?<\/nav>/) || [''])[0];
const hrefs = text => [...nav(text).matchAll(/href="#([^"]+)"/g)].map(m => m[1]);

const boss = auth.createUser({ username: 'SetBoss', password: 'boss-password-12', role: 'admin' });
const school = S.createSchool(boss, { name: 'Settings School' }).school;
const teacher = auth.createUser({ username: 'SetTeach', password: 'teach-password-12' });
S.addMember(boss, school.id, teacher.id, 'teacher', { rosterName: 'Ms Set' });
const kid = auth.createUser({ username: 'SetKid', password: 'rainbow-77' });

test('the Me page has a Settings tile and no settings forms; name, look, chat, the weekly summary and Google stay', async () => {
  for (const u of [teacher, kid]) {
    const me = await get('/me', u); assert.equal(me.status, 200);
    assert.match(me.text, /<a class="panel metile" href="\/me\/settings"><span class="metile-e" aria-hidden="true">⚙️<\/span><span>Settings<\/span><\/a>/);
    for (const id of ['language', 'appearance', 'password', 'signout', 'teacher-plan']) assert.doesNotMatch(me.text, new RegExp(`id="${id}"`), `${u.username}: #${id} moved`);
    assert.match(me.text, /class="panel lookpanel"/, 'Pick your look stays');
  }
  const t = (await get('/me', teacher)).text;
  assert.match(t, /id="your-name"/); assert.match(t, /id="digest"/, 'the weekly summary stays on the Me page');
  assert.match((await get('/me', kid)).text, /id="chat-toggle"/, 'a kid\'s chat switch stays');
});

test('/me/settings: the sections in order with their nav; a kid has no plan section; signed out goes to sign in', async () => {
  const k = await get('/me/settings', kid); assert.equal(k.status, 200);
  assert.deepEqual(hrefs(k.text), ['language-sec', 'appearance-sec', 'password-sec', 'signout-sec']);
  const at = id => k.text.indexOf(`id="${id}"`);
  assert.ok(at('language') < at('appearance') && at('appearance') < at('password') && at('password') < at('signout'));
  assert.match(k.text, /<h1>⚙️ Settings<\/h1>/);
  assert.match(k.text, /<a class="backlink" href="\/me">/);
  // Same forms and APIs as before.
  assert.match(k.text, /id="lang-select" name="lang"/); assert.match(k.text, /<form action="\/me\/settings#appearance" method="get" id="themeform">/);
  assert.match(k.text, /data-api="\/api\/me\/password"/); assert.match(k.text, /data-api="\/api\/auth\/logout"/);
  // Billing off (unit default): a teacher has the same four, no plan section.
  const t = await get('/me/settings', teacher);
  assert.deepEqual(hrefs(t.text), ['language-sec', 'appearance-sec', 'password-sec', 'signout-sec']);
  // A guest: no password section.
  const g = auth.createGuest();
  assert.deepEqual(hrefs((await get('/me/settings', g)).text), ['language-sec', 'appearance-sec', 'signout-sec']);
  const out = await get('/me/settings'); assert.equal(out.status, 302); assert.match(out.location, /^\/login/);
});

test('grown-ups go to their own settings page; old links lead to /me/settings', async () => {
  const g = auth.createUser({ username: 'SetGrown', password: 'a-long-password-1', accountType: 'grownup' });
  const r = await get('/me/settings', g); assert.equal(r.status, 302); assert.equal(r.location, '/family/account');
  // The footer's language link and the short-password notice point here.
  assert.match((await get('/play', kid)).text, /href="\/me\/settings#language"/);
  // /forgot for someone signed in: their password section.
  assert.equal((await get('/forgot', kid)).location, '/me/settings#password');
  // Old /me#language, #appearance, #password, #signout and #teacher-plan links (the hash never reaches the server) are
  // forwarded by app.js on any page that hasn't got that section.
  const js = fs.readFileSync(new URL('../../public/js/app.js', import.meta.url), 'utf8');
  assert.match(js, /const MOVED = \['teacher-plan', 'language', 'appearance', 'password', 'signout'\];/);
  assert.match(js, /location\.replace\(`\/me\/settings\$\{location\.hash\}`\)/);
});
