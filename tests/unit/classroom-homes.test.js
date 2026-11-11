// The first tabs of school staff and students (docs/decisions.md "Play and Learn", part 2). The Classroom (/teach):
// hello with the teacher's own roster name, each class card with what needs attention (the next lesson due, or All
// caught up) and its buttons, New class, and nothing below the classes ("My classes, simpler": the school is on the Me
// page, courses, live games and brain breaks on Learn); one class opens that class directly. The Class
// tab (/classes): one section per class with To do (due date, x of y done, the next step, Start), games from the class,
// a picker with several classes, one live banner each, no classmates' names, no staff greeting and no prices.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const SC = await import('../../server/services/schools.js');
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
  // Nothing below the classes any more: courses, live games and brain breaks are on Learn; Quick game is gone from the cards.
  for (const gone of ['id="teach-courses"', 'id="teach-live"', 'id="brain-breaks"', 'id="teach-all-games"', 'href="/learn">📚 Open Learn', 'data-quick=', '⚡ Quick game', 'class="panel schoolcard"', 'id="teacher-plan"']) assert.ok(!r.text.includes(gone), `gone: ${gone}`);
  assert.ok(r.text.indexOf('</section>', r.text.indexOf('id="my-classes"')) > r.text.lastIndexOf('class="panel classcard'), 'the classes end the page');
  // The tools row: Lesson library, Turn a lesson into a game, Make a game.
  const tools = r.text.slice(r.text.indexOf('class="row teachtools"'), r.text.indexOf('</nav>', r.text.indexOf('class="row teachtools"')));
  assert.deepEqual([...tools.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/teach/lessons', '/teach/make', '/build']);
  // + New class: a tile in the class grid, after the classes.
  const grid = r.text.slice(r.text.indexOf('class="classgrid th-classes"'), r.text.indexOf('</section>', r.text.indexOf('class="classgrid th-classes"')));
  assert.ok(grid.indexOf('<b>Homes 5A</b>') < grid.indexOf('class="th-newclass"') && grid.includes('id="nc-n"'), 'New class');
  assert.doesNotMatch(r.text, PRICE);
  // The school admin's Classroom tab is the same page, without a "Manage <school>" box (My school is on the Me page).
  const h = await get('/teach', head); assert.equal(h.status, 200); assert.match(h.text, /Hello, Mrs Homeshead/); assert.doesNotMatch(h.text, /Manage Homes School|schoolcard/);
});

test('the Classroom while a class\'s live room is open: its host gets "Open live game" on every class card, never a second Host button', async () => {
  const hostBtn = id => new RegExp(`href="/live\\?class=${id}">📡 Host a live game`);
  let r = await get('/teach', teacher);
  assert.match(r.text, hostBtn(busy.id)); assert.match(r.text, hostBtn(quiet.id));
  const items = [{ q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 30 }, { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 30 }];
  const made = await post('/api/live/sessions', teacher, { pick: 'mode:battle', items, audience: 'class', classId: busy.id, replace: true });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  r = await get('/teach', teacher);
  assert.match(r.text, new RegExp(`<a class="btn btn-sm btn-hot cc-live" href="/live/host/${made.json.sid}">📡 Open live game</a>`));
  assert.doesNotMatch(r.text, hostBtn(busy.id), 'no second room for the class');
  // A host has one room at a time: the other class's card leads back to the open room and says so (no second Host button).
  assert.doesNotMatch(r.text, hostBtn(quiet.id), 'no Host button on the other class while a room is open');
  assert.match(r.text, new RegExp(`<a class="btn btn-sm cc-live cc-live-other" href="/live/host/${made.json.sid}">📡 Open live game</a>`));
  assert.match(r.text, new RegExp(`<p class="small muted cc-quick cc-elsewhere" data-room="${made.json.sid}">You already have a game open: [^<]+</p>`));
  assert.equal([...r.text.matchAll(/cc-elsewhere/g)].length, 1, 'only on the other class\'s card');
  LS.endSession(made.json.sid, 'ended');
  r = await get('/teach', teacher);
  assert.match(r.text, hostBtn(busy.id), 'ended: Host a live game again'); assert.match(r.text, hostBtn(quiet.id), 'and on the other class');
  assert.doesNotMatch(r.text, /cc-elsewhere|cc-live-other/);
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

// ---------------------------------------------------------------- one class: My classes opens it
test('no class yet: /teach shows the create-class prompt (no redirect)', async () => {
  const s2 = SC.createSchool(boss, { name: 'Empty Homes' }).school;
  const fresh = SC.createSchoolAccount(boss, s2.id, { rosterName: 'Ms Fresh', role: 'teacher' }).user;
  const r = await get('/teach', fresh); assert.equal(r.status, 200);
  assert.match(r.text, /id="my-classes"/); assert.match(r.text, /id="nc-n"/, 'the New class form');
  assert.match(r.text, /Make your first class/, 'the teaching loop\'s first step');
  // ?new=class (the loop's "Make your first class") and ?welcome=school stay on the page.
  assert.equal((await get('/teach?new=class', fresh)).status, 200);
});

test('one class: /teach opens it; ?all=1, New class, a welcome or an invite keep the list; the class page links back to All classes', async () => {
  const s3 = SC.createSchool(boss, { name: 'One Class School' }).school;
  const solo = auth.createUser({ username: 'HomesSolo', password: 'solo-password-12' });
  SC.addMember(boss, s3.id, solo.id, 'teacher', { rosterName: 'Mr Solo' });
  const only = SC.createClass(solo, s3.id, { name: 'Solo 3C' }).class;
  const r = await get('/teach', solo);
  assert.equal(r.status, 302); assert.equal(r.location, `/class/${only.id}`);
  // After sign-in, "/" sends a teacher to /teach, which opens the class.
  assert.equal((await get('/', solo)).location, '/teach');
  for (const q of ['?all=1', '?new=class', '?welcome=school']) {
    const l = await get(`/teach${q}`, solo); assert.equal(l.status, 200, q); assert.match(l.text, /<b>Solo 3C<\/b>/); assert.match(l.text, /id="nc-n"/);
  }
  // The class page: Classroom is the current tab, the back link is "All classes" (the list, never back to itself).
  const c = await get(`/class/${only.id}`, solo); assert.equal(c.status, 200);
  assert.match(c.text, /<a class="backlink" href="\/teach\?all=1"><span class="flip" aria-hidden="true">←<\/span> All classes<\/a>/);
  assert.match(c.text, /class="tab"[^>]*href="\/teach"[^>]*aria-current="page"|href="\/teach"[^>]*aria-current="page"/);
  // The teaching loop's card comes along on the class's Lessons tab while it shows, and the unit line is there.
  assert.match(c.text, /class="panel tl tl-compact" id="teach-loop"/);
  assert.doesNotMatch((await get(`/class/${only.id}?tab=students`, solo)).text, /tl-compact/, 'only on the Lessons tab');
  assert.match(c.text, /id="unit-why">🗂️ Units group the lessons in this class, in the order students see them\. Folders only sort your own lesson library\./);
  // An invite to answer: the list, where it is said.
  const other = SC.createSchool(boss, { name: 'Inviting School' }).school;
  assert.ok(SC.inviteStaff(boss, other.id, solo.id, 'teacher').ok);
  const i = await get('/teach', solo); assert.equal(i.status, 200); assert.match(i.text, /id="my-invites"/); assert.match(i.text, /Inviting School/);
  // Old Teacher plan links follow the card to the Me page.
  const p = await get('/teach?plan=welcome', solo); assert.equal(p.status, 302); assert.equal(p.location, '/me/settings?plan=welcome#teacher-plan');
});

test('two classes: /teach is the list of both', async () => {
  const r = await get('/teach', teacher); assert.equal(r.status, 200);
  assert.match(r.text, /<b>Homes 4B<\/b>/); assert.match(r.text, /<b>Homes 5A<\/b>/);
  const c = await get(`/class/${busy.id}`, teacher);
  assert.match(c.text, /<a class="backlink" href="\/teach"><span class="flip" aria-hidden="true">←<\/span> My classes<\/a>/);
});

test('the Me page: My school for a school\'s admin (to /school), not for a teacher who doesn\'t run one; My classes for both', async () => {
  const h = await get('/me', head); assert.equal(h.status, 200);
  assert.match(h.text, /<a class="panel metile" href="\/school"><span class="metile-e" aria-hidden="true">🏫<\/span><span>My school<\/span><span class="metile-sub">Homes School<\/span><\/a>/);
  assert.match(h.text, /href="\/teach"><span class="metile-e" aria-hidden="true">🍎<\/span><span>My classes<\/span>/);
  const t = await get('/me', teacher);
  assert.doesNotMatch(t.text, />My school</); assert.match(t.text, />My classes</);
  // A school admin's /school opens their school (where they manage it).
  assert.equal((await get('/school', head)).location, `/school/${school.slug}`);
});

test('what My classes no longer lists is still a tap away: Learn has the courses (Assign), live games (Host live) and brain breaks; Play is a tab', async () => {
  const l = await get('/learn', teacher); assert.equal(l.status, 200);
  for (const href of ['/teach/cs-quest', '/teach/cyber-defenders']) assert.ok(l.text.includes(`href="${href}"`), `Learn: ${href}`);
  assert.match(l.text, /href="\/live\?mode=[a-z-]+"/, 'Learn: Host live on the live class games');
  assert.match(l.text, /href="\/learn\/brain-break-games"/, 'Learn: the brain break games page');
  assert.match(l.text, /class="tab"[^>]*href="\/play"|href="\/play"[^>]*class="tab"/, 'Play is in the tab bar');
  const lib = await get('/teach/lessons', teacher);
  assert.ok(lib.text.includes('href="/teach/cyber-defenders"'), 'the lesson library\'s ready-made chips');
  assert.match(lib.text, /id="folder-why">📁 Folders sort your own lesson library, and their lessons can go to any class\. Units, on a class page, set the order students see\./);
});
