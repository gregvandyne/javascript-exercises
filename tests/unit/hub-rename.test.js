// Homeroom is now the Hub (docs/decisions.md "Homeroom is now the Hub"): the page lives at /class/:id/hub, every old
// /class/:id/homeroom address (and what is under it) moves there for good with its query kept, the API keeps its
// /api/homeroom/... addresses, the links the app makes point to /hub, and no English string a user sees says Homeroom.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET' } = {}) => {
  const r = await fetch(base + p, { method, headers: who ? { cookie: cookieFor(who.id) } : {}, redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location'), text: await r.text() };
};

const boss = createUser({ username: 'HubBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Hub Oak' }).school;
const rivera = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user.id);
const other = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Other', role: 'teacher' }).user.id);
TOOLS.givePlan(rivera.id); TOOLS.givePlan(other.id);
const cls = S.createClass(boss, oak.id, { name: '4B', teacherId: rivera.id }).class;
S.createClass(boss, oak.id, { name: '5C', teacherId: rivera.id }); // two classes: /teach lists them as cards
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ava Stone' }).user.id);
S.addToClass(boss, cls.id, kid.id);
Object.assign(config, { homeroom: true, homeroomUsers: [rivera.username.toLowerCase(), other.username.toLowerCase()] });
H.saveSeats(rivera, cls, { preset: 'pods', seats: {} });

test('GET /class/:id/homeroom moves for good to /class/:id/hub, its query kept; sub-paths map the same way', async () => {
  for (const [from, to] of [
    [`/class/${cls.id}/homeroom`, `/class/${cls.id}/hub`],
    [`/class/${cls.id}/homeroom?play=abc&x=1`, `/class/${cls.id}/hub?play=abc&x=1`],
    [`/class/${cls.id}/homeroom/`, `/class/${cls.id}/hub/`],
    [`/class/${cls.id}/homeroom/projector?k=2`, `/class/${cls.id}/hub/projector?k=2`],
    [`/class/${cls.id}/homeroom/signin`, `/class/${cls.id}/hub/signin`],
  ]) {
    const r = await as(rivera)(from);
    assert.equal(r.status, 301, from); assert.equal(r.location, to, from);
  }
  const head = await as(rivera)(`/class/${cls.id}/homeroom?a=1`, { method: 'HEAD' });
  assert.equal(head.status, 301); assert.equal(head.location, `/class/${cls.id}/hub?a=1`);
});

test('/class/:id/hub renders the Hub; the projector and sign-in pages too; the API keeps /api/homeroom', async () => {
  const r = await as(rivera)(`/class/${cls.id}/hub`);
  assert.equal(r.status, 200); assert.match(r.text, /id="hr-board"/);
  assert.match(r.text, /<title>4B · Hub/);
  assert.match(r.text, new RegExp(`<a href="/class/${cls.id}/hub" data-cv-go="homeroom" aria-current="page">Hub</a>`), 'the tab reads Hub and points to /hub');
  assert.equal((await as(rivera)(`/class/${cls.id}/hub/projector`)).status, 200);
  const si = await as(rivera)(`/class/${cls.id}/hub/signin`);
  assert.equal(si.status, 200); assert.match(si.text, new RegExp(`href="/class/${cls.id}/hub">.*Back to the Hub`));
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/state`)).status, 200, 'the API path is unchanged');
});

test('the gate holds at both addresses: another teacher, a student and nobody signed in get the 404, never a redirect', async () => {
  for (const who of [other, kid, null]) {
    for (const p of [`/class/${cls.id}/hub`, `/class/${cls.id}/homeroom`, `/class/${cls.id}/hub/projector`]) assert.equal((await as(who)(p)).status, 404, `${who?.username || 'nobody'} ${p}`);
  }
  config.homeroom = false;
  try { assert.equal((await as(rivera)(`/class/${cls.id}/homeroom`)).status, 404, 'flag off: no redirect either'); } finally { config.homeroom = true; }
});

test('links the app makes point to /hub: the class card, the class page tabs; the student desk still opens', async () => {
  const teach = await as(rivera)('/teach');
  assert.ok(teach.text.includes(`/class/${cls.id}/hub"`)); assert.ok(!teach.text.includes(`/class/${cls.id}/homeroom`));
  const classPage = await as(rivera)(`/class/${cls.id}`);
  assert.ok(classPage.text.includes(`href="/class/${cls.id}/hub"`)); assert.ok(!/\/class\/[^"]+\/homeroom/.test(classPage.text));
  assert.equal((await as(kid)(`/class/${cls.id}/desk`)).status, 200);
});

test('no English value a user sees says Homeroom (en.json; keys keep their names)', () => {
  const en = JSON.parse(fs.readFileSync(new URL('../../server/i18n/locales/en.json', import.meta.url), 'utf8'));
  const bad = [];
  (function walk(o, p) { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string') { if (/homeroom/i.test(v)) bad.push(`${p}${k}`); } else walk(v, `${p}${k}.`); } })(en, '');
  assert.deepEqual(bad, []);
  assert.equal(en.homeroom.tabs.homeroom, 'Hub'); assert.equal(en.js.homeroom.everyone, 'Everyone to the Hub');
  for (const l of fs.readdirSync(new URL('../../server/i18n/locales/', import.meta.url))) {
    const s = fs.readFileSync(new URL(`../../server/i18n/locales/${l}`, import.meta.url), 'utf8');
    const vals = []; (function walk(o) { for (const v of Object.values(o)) { if (typeof v === 'string') vals.push(v); else walk(v); } })(JSON.parse(s));
    assert.deepEqual(vals.filter(v => /homeroom/i.test(v)), [], l);
  }
});
