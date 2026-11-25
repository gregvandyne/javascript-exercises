// A simpler teacher home (docs/decisions.md "A simpler teacher home"): /teach has one button at the top (Lesson Folder,
// /build), and each class card opens the class in its views: Homeroom (only for a teacher who passes the Homeroom gate:
// the flag, HOMEROOM_USERS and the Teacher plan), Classroom and Dashboard. The /build heading says "Build lessons" for
// school staff; kids still build games. What left /teach is still reachable: the summary page, the Live tab, /build.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const TOOLS = await import('./_tools-plan.js');
const { deicon } = await import('../support/deicon.js');
TOOLS.plansOn();

const boss = auth.createUser({ username: 'SimpleBoss', password: 'boss-password-1', role: 'admin' });
const school = S.createSchool(boss, { name: 'Admin University' }).school;
const greg = auth.getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Greg Room', role: 'teacher' }).user.id);
const pat = auth.getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Pat Plain', role: 'teacher' }).user.id);
const listed = auth.getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Lee Listed', role: 'teacher' }).user.id);
TOOLS.givePlan(greg.id);
const classes = Object.fromEntries([greg, pat, listed].map(u => [u.id, [S.createClass(boss, school.id, { name: '4B Math', teacherId: u.id }).class, S.createClass(boss, school.id, { name: '5C Art', teacherId: u.id }).class]]));
// Greg passes the gate (list + plan); Lee is on the list without the Teacher plan; Pat is on neither.
Object.assign(config, { homeroom: true, homeroomUsers: [greg.username.toLowerCase(), listed.username.toLowerCase()] });
const kid = auth.createUser({ username: 'SimpleKid', password: 'rainbow-77' });

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { accept: 'text/html', cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: deicon(await r.text()) }; };
const cardViews = (text, c) => {
  const at = text.indexOf(`<b>${c.name}</b>`), card = text.slice(at, text.indexOf('</nav>', at));
  return [...card.matchAll(/<a class="btn btn-sm cc-view" href="([^"]+)" data-view="([^"]+)">/g)].map(m => `${m[2]} ${m[1]}`);
};

test('the top of /teach: one Lesson Folder button to /build, nothing else', async () => {
  for (const u of [greg, pat]) {
    const r = await get('/teach', u); assert.equal(r.status, 200);
    const top = r.text.slice(r.text.indexOf('class="pagehead th-head"'), r.text.indexOf('id="my-classes"'));
    assert.deepEqual([...top.matchAll(/<a class="btn[^"]*" href="([^"]+)"[^>]*>/g)].map(m => m[1]), ['/build']);
    assert.match(top, /<a class="btn btn-primary" href="\/build" id="teach-folder">📁 Lesson Folder<\/a>/);
    for (const gone of ["This week's summary", 'Host a live game', 'Assign a game', 'Open class', 'Make a game', 'Turn a lesson into a game', 'My games and folders']) assert.ok(!r.text.includes(gone), `gone: ${gone}`);
  }
});

test('class cards: Homeroom, Classroom and Dashboard for a teacher who passes the Homeroom gate; Classroom and Dashboard for everyone else', async () => {
  const r = await get('/teach', greg);
  for (const c of classes[greg.id]) {
    assert.deepEqual(cardViews(r.text, c), [`homeroom /class/${c.id}/homeroom`, `classroom /class/${c.id}`, `dashboard /class/${c.id}/dashboard`]);
  }
  assert.match(r.text, /class="cc-acts cc-views cc-views-3"/);
  assert.match(r.text, /<span class="cc-school small muted">Admin University<\/span><a class="cc-name cc-link" href="[^"]+"><b>4B Math<\/b><\/a>/, 'the school and the class name stay');
  assert.match(r.text, /0 students/); assert.match(r.text, /✅ All caught up/);
  // on the list without the Teacher plan, and on neither: no Homeroom button
  for (const u of [listed, pat]) {
    const t = (await get('/teach', u)).text;
    for (const c of classes[u.id]) assert.deepEqual(cardViews(t, c), [`classroom /class/${c.id}`, `dashboard /class/${c.id}/dashboard`], u.username);
    assert.ok(!t.includes('/homeroom"'), 'no Homeroom link at all'); assert.match(t, /class="cc-acts cc-views cc-views-2"/);
  }
  // the flag off: nobody gets Homeroom
  config.homeroom = false;
  try { assert.ok(!(await get('/teach', greg)).text.includes('data-view="homeroom"')); } finally { config.homeroom = true; }
  // each button opens what it says
  const [c] = classes[greg.id];
  for (const path of [`/class/${c.id}/homeroom`, `/class/${c.id}`, `/class/${c.id}/dashboard`]) assert.equal((await get(path, greg)).status, 200, path);
  assert.equal((await get(`/class/${classes[pat.id][0].id}/homeroom`, pat)).status, 404, 'no Homeroom without the gate');
});

test('what left /teach is still reachable: the summary, the Live tab, /build; /build says "Build lessons" to staff and "Build a game" to a kid', async () => {
  assert.equal((await get('/teach/summary', pat)).status, 200);
  assert.match((await get('/me', pat)).text, /href="\/teach\/summary"/, "This week's summary is on the Me page");
  if (config.liveClassroom) assert.match((await get('/teach', pat)).text, /href="\/live"/, 'Host a live game: the Live tab');
  const b = await get('/build', pat); assert.equal(b.status, 200);
  assert.match(b.text, /<h1>🛠️ Build lessons<\/h1>/);
  const k = await get('/build', kid); assert.equal(k.status, 200);
  assert.match(k.text, /<h1>🛠️ Build a game<\/h1>/); assert.ok(!k.text.includes('Build lessons'));
});
