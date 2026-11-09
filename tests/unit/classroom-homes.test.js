// The first tabs of school staff and students (docs/decisions.md "Play and Learn", part 2). The Classroom (/teach):
// hello with the teacher's own roster name, each class card with what needs attention (the next lesson due, or All
// caught up) and its buttons, courses, brain breaks, everything students can play, and every tool /teach had. The Class
// tab (/classes): one section per class with To do (due date, x of y done, the next step, Start), games from the class,
// a picker with several classes, one live banner each, no classmates' names, no staff greeting and no prices.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const SC = await import('../../server/services/schools.js');
const { BRAIN_BREAKS } = await import('../../server/learn.js');
const LS = await import('../../server/services/classlive-sessions.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, u, body) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: cookieFor(u.id) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const PRICE = /[$€£]\s?\d|\d\s?(?:€|USD|EUR|GBP)\b/;

const boss = auth.createUser({ username: 'HomesBoss', password: 'boss-password-1', role: 'admin' });
const school = SC.createSchool(boss, { name: 'Homes School' }).school;
const head = SC.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Homeshead', role: 'admin' }).user;
const teacher = SC.createSchoolAccount(head, school.id, { rosterName: 'Mr Rowan Teach', role: 'teacher' }).user;
const pupil = SC.createSchoolAccount(head, school.id, { rosterName: 'Pia Pupil' }).user;
const mate = SC.createSchoolAccount(head, school.id, { rosterName: 'Zed Classmatename' }).user;
const busy = SC.createClass(teacher, school.id, { name: 'Homes 4B' }).class;
const quiet = SC.createClass(teacher, school.id, { name: 'Homes 5A' }).class;
for (const u of [pupil, mate]) assert.ok(SC.addToClass(teacher, busy.id, u.id).ok);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('the Classroom: hello, class cards with what needs attention and their buttons, courses, brain breaks, the old tools', async () => {
  assert.equal((await post('/api/teach/assign-game', teacher, { game: 'word-hunt', classId: busy.id, dueAt: day(3) })).status, 200);
  assert.equal((await get('/', teacher)).location, '/teach');
  const r = await get('/teach', teacher); assert.equal(r.status, 200);
  assert.match(r.text, /<h1>👋 Hello, Mr Rowan Teach<\/h1>/);
  assert.match(r.text, /class="muted th-sum">2 classes</);
  const card = name => r.text.slice(r.text.indexOf(`<b>${name}</b>`), r.text.indexOf('</div>', r.text.indexOf('cc-acts', r.text.indexOf(`<b>${name}</b>`))));
  assert.match(card('Homes 4B'), /<span class="th-due-t">📚 <bdi>Word Hunt<\/bdi><\/span><span class="th-due-d">📅 Due /, 'the next lesson due: its title, the date on its own line');
  assert.doesNotMatch(card('Homes 4B'), /All caught up/);
  assert.match(card('Homes 5A'), /✅ All caught up/);
  assert.match(card('Homes 4B'), new RegExp(`href="/teach/lessons\\?school=${school.id}&amp;class=${busy.id}">📚 Assign a lesson`));
  assert.match(card('Homes 4B'), new RegExp(`href="/class/${busy.id}">Open class`));
  for (const [id, href] of [['cs-quest', '/teach/cs-quest'], ['cyber-defenders', '/teach/cyber-defenders'], ['number-quest', '/teachers/number-quest']]) assert.match(r.text, new RegExp(`href="${href}" id="teach-course-${id}"`));
  const breaks = r.text.slice(r.text.indexOf('id="brain-breaks"'), r.text.indexOf('</section>', r.text.indexOf('id="brain-breaks"')));
  assert.deepEqual([...breaks.matchAll(/href="\/play\/([^"]+)"/g)].map(m => m[1]), BRAIN_BREAKS);
  assert.match(r.text, /href="\/play" id="teach-all-games"/);
  // The tools row: Lesson library and Make a game; CS Quest and Cyber Defenders are under "Teach with a course".
  const tools = r.text.slice(r.text.indexOf('class="row teachtools"'), r.text.indexOf('</nav>', r.text.indexOf('class="row teachtools"')));
  assert.deepEqual([...tools.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/teach/lessons', '/build']);
  // + New class: a tile in the class grid, after the classes.
  const grid = r.text.slice(r.text.indexOf('class="classgrid th-classes"'), r.text.indexOf('</section>', r.text.indexOf('class="classgrid th-classes"')));
  assert.ok(grid.indexOf('<b>Homes 5A</b>') < grid.indexOf('class="th-newclass"') && grid.includes('id="nc-n"'), 'New class');
  assert.doesNotMatch(r.text, PRICE);
  // The school admin's Classroom tab is the same page (with their school's card).
  const h = await get('/teach', head); assert.equal(h.status, 200); assert.match(h.text, /Hello, Mrs Homeshead/); assert.match(h.text, /Manage Homes School/);
});

test('the Classroom while a class\'s live room is open: its host gets "Open live game", never a second Host button', async () => {
  const hostBtn = id => new RegExp(`href="/live\\?class=${id}">📡 Host a live game`);
  let r = await get('/teach', teacher);
  assert.match(r.text, hostBtn(busy.id)); assert.match(r.text, hostBtn(quiet.id));
  const items = [{ q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 30 }, { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 30 }];
  const made = await post('/api/live/sessions', teacher, { pick: 'mode:battle', items, audience: 'class', classId: busy.id, replace: true });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  r = await get('/teach', teacher);
  assert.match(r.text, new RegExp(`<a class="btn btn-sm btn-hot cc-live" href="/live/host/${made.json.sid}">📡 Open live game</a>`));
  assert.doesNotMatch(r.text, hostBtn(busy.id), 'no second room for the class');
  assert.match(r.text, hostBtn(quiet.id), 'the other class can still host');
  LS.endSession(made.json.sid, 'ended');
  assert.match((await get('/teach', teacher)).text, hostBtn(busy.id), 'ended: Host a live game again');
});

test('the School tab of a school\'s own admin has no back link (it is a first tab); the platform admin\'s has one to Schools', async () => {
  const h = await get(`/school/${school.slug}`, head); assert.equal(h.status, 200);
  assert.doesNotMatch(h.text, /class="backlink"/);
  const b = await get(`/school/${school.slug}`, boss); assert.equal(b.status, 200);
  assert.match(b.text, /<a class="backlink" href="\/admin\/schools">/);
});

test('the Class tab: To do with due date, progress, next step and Start; games; picker and one banner per class; no classmates', async () => {
  assert.equal((await get('/', pupil)).location, '/classes');
  let r = await get('/classes', pupil); assert.equal(r.status, 200);
  assert.match(r.text, /<h1 class="cc-name" id="ct-[^"]+-h">Homes 4B<\/h1>/);
  assert.match(r.text, /🍎 Mr Rowan Teach/, 'their teacher, as on the class page');
  const todo = r.text.slice(r.text.indexOf('class="ct-todo"'), r.text.indexOf('</li>', r.text.indexOf('class="ct-todo"')));
  assert.match(todo, /<b dir="auto">Word Hunt<\/b>/); assert.match(todo, /📅 Due /);
  assert.match(todo, /role="progressbar"[^>]*aria-valuemax="1" aria-valuenow="0"/);
  assert.match(todo, /0 of 1 done · <bdi>Next: Word Hunt<\/bdi>/);
  assert.match(todo, new RegExp(`href="/class/${busy.id}/lessons/[^"]+">▶ Start`));
  assert.match(r.text, /Games from our class/);
  assert.match(r.text, /id="class-live"/); assert.doesNotMatch(r.text, /ct-pick/);
  for (const bad of ['Zed Classmatename', 'Hello, ']) assert.ok(!r.text.includes(bad), bad);
  assert.doesNotMatch(r.text, PRICE);
  // A second class: a picker of both, a section each, the second banner's ids get -1.
  assert.ok(SC.addToClass(teacher, quiet.id, pupil.id).ok);
  r = await get('/classes', pupil);
  assert.match(r.text, /<h1>🏫 My classes<\/h1>/);
  assert.match(r.text, new RegExp(`class="chips ajump ct-pick"[\\s\\S]*href="#class-${busy.id}"[\\s\\S]*href="#class-${quiet.id}"`));
  assert.equal((r.text.match(/<section class="ct-class"/g) || []).length, 2);
  assert.match(r.text, /id="class-live-1" data-class="/); assert.match(r.text, /id="class-live-join-1"/);
  assert.match(r.text, /🎉 All done! Nothing to do right now\./, 'the quiet class has nothing to do');
});
