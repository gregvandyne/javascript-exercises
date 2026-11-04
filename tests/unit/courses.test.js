// Courses (server/services/courses.js, server/routes/courses.js, server/views/courses.js; docs/decisions.md "Course
// flow"): the home card, the band picker, the course map and its locks, a step's slides -> quick check (graded on the
// server) -> game module, the /play gate for course games, and the deletion hook. Slide decks come from the two
// fixtures in tests/fixtures/course (steps without a deck get one made from their lesson file).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const C = await import('../../server/services/courses.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');

C.useDeckDir('tests/fixtures/course');
seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u, extra = {}) => { const r = await fetch(base + path, { headers: { ...H, ...extra, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location'), cookie: r.headers.get('set-cookie') }; };
const post = async (path, u, body, { form = false } = {}) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
const ORDER = ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'];
let n = 0;
const newKid = () => auth.createUser({ username: `kid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const course = C.getCourse('cs-quest');
/** The bank's right / wrong choice for an item (the test may read the bank; the page never gets it). */
const right = id => C.item(id).answer;
const wrong = id => (C.item(id).answer + 1) % 4;
const allRight = step => Object.fromEntries(step.check.map(id => [id, right(id)]));

test('19 steps per band, in lesson order, decks from the fixtures, the rest from the lesson files', () => {
  for (const band of C.BANDS) {
    const s = C.steps(course, band);
    assert.equal(s.length, 19, band);
    assert.deepEqual(s.map(x => x.n), ['1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3']);
    assert.equal(s.find(x => x.n === '6.1').game, null); assert.equal(s.find(x => x.n === '6.3').game, null);
    for (const x of s) { assert.equal(x.check.length, 3, x.key); for (const id of x.check) assert.ok(C.item(id), id); }
  }
  const s1 = C.getStep(course, '1b-1.2');
  assert.equal(s1.deck, true); assert.equal(s1.title, 'Again and again'); assert.deepEqual(C.deckProblems('1b'), []);
  assert.deepEqual(s1.game, { slug: 'robo-route', chapter: 'loops', chapterTitle: 'Loops', params: 'chapter=loops&band=1b&lock=1', title: 'Robo Route' });
  assert.equal(C.getStep(course, '1b-1.3').deck, false, 'no deck yet: made from the lesson');
  assert.equal(C.getStep(course, '1b-9.9'), null); assert.equal(C.getStep(course, 'x'), null);
  assert.equal(C.getStep(course, '2-6.2').game.slug, 'inside-the-machine');
});

test('the home card: games link to the course map units, Start goes to the band picker, then to the next step', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  const card = r.text.slice(r.text.indexOf('class="course-card"'), r.text.indexOf('</article>', r.text.indexOf('class="course-card"')));
  const at = ORDER.map(s => card.indexOf(`href="/courses/cs-quest#${s}"`));
  assert.ok(at.every(i => i > 0), 'all four games link to their unit on the map');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in course order');
  assert.doesNotMatch(card, /href="\/play\//, 'nothing goes straight into a game');
  assert.match(card, /id="course-cs-quest-go" href="\/courses\/cs-quest"|href="\/courses\/cs-quest" id="course-cs-quest-go"/);
  assert.ok(r.text.indexOf('id="courses-h"') > r.text.indexOf('id="featured'), 'after the featured row');

  const kid = newKid(); C.setBand(kid, course, '1b');
  const home = await get('/', kid);
  assert.match(home.text, /href="\/courses\/cs-quest\/1b-1\.1" id="course-cs-quest-go">▶ Start the course/);
  assert.match(home.text, /0 of 19 steps done/);
});

test('the course page: band picker first, then the map with steps in order, states and unit headers', async () => {
  assert.equal((await get('/courses')).location, '/courses/cs-quest');
  assert.equal((await get('/courses/nope')).status, 404);
  const anon = await get('/courses/cs-quest');
  assert.equal(anon.status, 200);
  assert.match(anon.text, /<form method="post" action="\/courses\/cs-quest\/band"/);
  assert.match(anon.text, /name="band" value="1b"/); assert.match(anon.text, /name="band" value="2"/);
  assert.match(anon.text, /Explorer/); assert.match(anon.text, /Grades 6–8/);
  assert.match(anon.text, /href="\/teachers\/cs-quest"/);

  // Picking a band without a session makes a guest (like one tap on Play) and keeps the band.
  const pick = await fetch(`${base}/courses/cs-quest/band`, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' }, body: 'band=1b' });
  assert.equal(pick.status, 303); assert.equal(pick.headers.get('location'), '/courses/cs-quest');
  const cookie = pick.headers.get('set-cookie').split(';')[0];
  const map = await (await fetch(`${base}/courses/cs-quest`, { headers: { ...H, cookie } })).text();
  assert.doesNotMatch(map, /action="\/courses\/cs-quest\/band" class="bandpick-cards"/, 'no picker once picked');
  const ids = [...map.matchAll(/id="step-(1b-\d\.\d)"/g)].map(m => m[1]);
  assert.equal(ids.length, 19); assert.equal(ids[0], '1b-1.1'); assert.equal(ids[18], '1b-6.3');
  for (const g of ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine', 'tech-choices']) assert.match(map, new RegExp(`<section class="cmap-group" id="${g}"`));
  assert.match(map, /class="cmap-step is-next" id="step-1b-1\.1"/);
  assert.match(map, /class="cmap-step is-locked" id="step-1b-1\.2"/);
  assert.match(map, /href="\/courses\/cs-quest\/1b-1\.1"/);
  assert.doesNotMatch(map, /href="\/courses\/cs-quest\/1b-1\.2"/, 'a locked step has no link');
  assert.match(map, /Units 1–2/); assert.match(map, /Tech choices/); assert.match(map, /href="\/build"/);
  assert.match(map, /0 of 19 steps done/);
  assert.match(map, /name="band" value="2" id="band-switch">Switch to Pro/);
  const guest = q.get("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.is_guest=1 ORDER BY s.created_at DESC LIMIT 1");
  assert.equal(C.getBand(guest, course), '1b');
  // Switching keeps the progress of both bands apart.
  await post('/courses/cs-quest/band', guest, { band: '2' }, { form: true });
  assert.equal(C.getBand(guest, course), '2');
  assert.equal((await post('/courses/cs-quest/band', guest, { band: '9' }, { form: true })).status, 303);
  assert.equal(C.getBand(guest, course), '2', 'a bad band changes nothing');
});

test('read -> check (graded on the server) -> game module -> the next step opens', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  const s1 = C.getStep(course, '1b-1.1'), s2 = C.getStep(course, '1b-1.2');
  // Locked steps go to the map; unknown ones are 404.
  assert.equal((await get('/courses/cs-quest/1b-1.2', kid)).location, '/courses/cs-quest#step-1b-1.2');
  assert.equal((await get('/courses/cs-quest/1b-7.1', kid)).status, 404);
  assert.equal((await post('/api/courses/cs-quest/1b-1.2/read', kid, {})).status, 403, 'no API on a locked step');

  const page = await get('/courses/cs-quest/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.equal((page.text.match(/<section class="slide /g) || []).length, 6, 'one section per slide');
  assert.match(page.text, /<div class="deck" id="deck" lang="en" dir="ltr"/);
  assert.match(page.text, /<li class="chipblock">move<\/li>/, 'the example as chips');
  assert.match(page.text, /<dt>algorithm<\/dt><dd>a list of steps in order<\/dd>/);
  assert.match(page.text, /src="\/js\/course\.js/);
  // The questions are there, the answers are not.
  for (const id of s1.check) { assert.match(page.text, new RegExp(`data-q="${id}"`)); }
  assert.doesNotMatch(page.text, /"answer"|data-answer|is-right/);
  assert.equal((page.text.match(/type="radio"/g) || []).length, 12);
  assert.doesNotMatch(page.text, /id="cl-play"/, 'no Play before the check');

  // The game can't be opened yet.
  assert.equal((await get(`/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1`, kid)).location, '/courses/cs-quest');

  assert.deepEqual((await post('/api/courses/cs-quest/1b-1.1/read', kid, {})).json, { ok: true });
  // One answer at a time: right or not, and only then the right answer.
  const id = s1.check[0];
  let r = await post('/api/courses/cs-quest/1b-1.1/answer', kid, { item: id, choice: wrong(id) });
  assert.deepEqual(r.json, { right: false, answer: right(id), text: C.item(id).choices[right(id)] });
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/answer', kid, { item: id, choice: right(id) })).json.right, true);
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/answer', kid, { item: s2.check[0], choice: 0 })).status, 400, 'only this check\'s items');

  // 1 of 3: not passed. The client's own idea of right/wrong is never trusted: the server grades the choices.
  r = await post('/api/courses/cs-quest/1b-1.1/check', kid, { answers: { [s1.check[0]]: right(s1.check[0]), [s1.check[1]]: wrong(s1.check[1]), [s1.check[2]]: wrong(s1.check[2]) }, score: 3, passed: true });
  assert.equal(r.json.score, 1); assert.equal(r.json.passed, false); assert.equal(r.json.play, null);
  assert.equal(C.stateOf(kid, course, '1b-1.1').checked, false);
  // 2 of 3 passes (unlimited retries).
  r = await post('/api/courses/cs-quest/1b-1.1/check', kid, { answers: { ...allRight(s1), [s1.check[2]]: wrong(s1.check[2]) } });
  assert.equal(r.json.score, 2); assert.equal(r.json.passed, true);
  assert.equal(r.json.play, '/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1');
  assert.match(r.json.html, /id="cl-play"/);
  const st = C.stateOf(kid, course, '1b-1.1');
  assert.ok(st.read && st.checked && !st.played && !st.complete, 'not complete before the game module');
  assert.equal(C.stateOf(kid, course, '1b-1.2').open, false);

  const after = await get('/courses/cs-quest/1b-1.1', kid);
  assert.match(after.text, /href="\/play\/robo-route\?course=cs-quest&amp;cstep=1b-1\.1&amp;chapter=sequences&amp;band=1b&amp;lock=1"/);
  assert.match(after.text, /Play: Robo Route · Sequences/);

  // Opening the game module from the step completes it, and the next step opens.
  const play = await get('/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1', kid);
  assert.equal(play.status, 200);
  assert.match(play.text, /href="\/courses\/cs-quest\/1b-1\.1#play"/, 'back goes to the step');
  const row = q.get('SELECT * FROM course_progress WHERE user_id=? AND step=?', kid.id, '1b-1.1');
  assert.ok(row.played_at > 0 && row.check_score === 2);
  assert.ok(C.stateOf(kid, course, '1b-1.1').complete);
  assert.equal(C.stateOf(kid, course, '1b-1.2').open, true);
  assert.equal((await get('/courses/cs-quest/1b-1.2', kid)).status, 200);
  // The wrong game for the step, or a step whose check is not passed, still goes to the map.
  assert.equal((await get('/play/data-detective?course=cs-quest&cstep=1b-1.1', kid)).location, '/courses/cs-quest');
  assert.equal((await get('/play/robo-route?course=cs-quest&cstep=1b-1.2&chapter=loops', kid)).location, '/courses/cs-quest');

  const map = await get('/courses/cs-quest', kid);
  assert.match(map.text, /class="cmap-step is-done" id="step-1b-1\.1"/);
  assert.match(map.text, /class="cmap-step is-next" id="step-1b-1\.2"/);
  assert.match(map.text, /1 of 19 steps done/);
  const home = await get('/', kid);
  assert.match(home.text, /href="\/courses\/cs-quest\/1b-1\.2" id="course-cs-quest-go">▶ Keep going/);
});

test('the check also works as a plain form (no page script)', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  const s1 = C.getStep(course, '1b-1.1');
  let r = await post('/courses/cs-quest/1b-1.1/check', kid, Object.fromEntries(s1.check.map(id => [id, String(wrong(id))])), { form: true });
  assert.equal(r.status, 303); assert.match(r.location, /\?r=0&w=.*#check$/);
  const back = await get(r.location.replace(/#.*/, ''), kid);
  assert.match(back.text, /0 of 3 right/);
  assert.match(back.text, new RegExp(C.item(s1.check[0]).choices[right(s1.check[0])].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '&quot;')), 'the right answer is shown after a wrong one');
  r = await post('/courses/cs-quest/1b-1.1/check', kid, Object.fromEntries(s1.check.map(id => [id, String(right(id))])), { form: true });
  assert.match(r.location, /\?r=3#play$/);
  assert.ok(C.stateOf(kid, course, '1b-1.1').checked && C.stateOf(kid, course, '1b-1.1').read, 'reaching the check counts as reading');
});

test('a step without a game is complete after its check; locks follow the order', () => {
  const kid = newKid();
  const list = C.steps(course, '2');
  // Everything before 6.1 done by hand.
  for (const s of list.slice(0, 16)) q.run('INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at) VALUES (?,?,?,?,?,?,3,?)', kid.id, 'cs-quest', s.key, '2', now(), now(), now());
  let st = C.states(kid, course, '2');
  assert.equal(st[16].step.n, '6.1'); assert.ok(st[16].open); assert.ok(!st[17].open);
  C.recordCheck(kid, course, list[16], C.grade(list[16], allRight(list[16])));
  st = C.states(kid, course, '2');
  assert.ok(st[16].complete, 'no game: done after the check'); assert.ok(st[17].open);
  assert.equal(C.playHref(course, list[16]), null);
  assert.equal(C.overview(kid, course, '2').done, 17);
  assert.equal(C.overview(kid, course, '2').next.step.n, '6.2');
  // The 1b band is untouched.
  assert.equal(C.overview(kid, course, '1b').done, 0);
});

test('the /play gate: (a) course step, (b) class lesson (tests/unit/cs-quest-platform), (c) teachers with ?chapter=, (d) admin; everything else goes to the course map', async () => {
  const kid = newKid();
  for (const p of ['/play/packet-post', '/play/packet-post?course=cs-quest', '/play/robo-route?chapter=loops&band=1b', '/play/robo-route?lesson=x&step=y', '/play/robo-route?course=cs-quest&cstep=1b-1.1', '/play/robo-route?match=nope'])
    assert.equal((await get(p, kid)).location, '/courses/cs-quest', p);
  assert.equal((await get('/play/packet-post')).location, '/courses/cs-quest', 'signed out');
  assert.equal((await get('/g/robo-route')).location, '/courses/cs-quest#robo-route');
  // (c) a teacher (school staff) with lesson parameters, as on their lesson pages
  const teacher = newKid();
  const sid = `s${Date.now()}`;
  q.run('INSERT INTO schools(id, name, slug, created_at) VALUES (?,?,?,?)', sid, 'Test School', sid, now());
  q.run('INSERT INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', sid, teacher.id, 'teacher', now());
  assert.equal((await get('/play/robo-route?chapter=loops&band=1b&lock=1', teacher)).status, 200);
  assert.equal((await get('/play/robo-route', teacher)).location, '/courses/cs-quest', 'not without lesson parameters');
  // ... and staff may preview any step
  assert.equal((await get('/courses/cs-quest/2-5.3', teacher)).status, 200);
  // (d) the admin
  const admin = q.get("SELECT * FROM users WHERE role='admin' LIMIT 1");
  assert.equal((await get('/play/inside-the-machine', admin)).status, 200);
  // Other games are not affected.
  const other = G.listVisible(null, { limit: 1 })[0];
  assert.equal((await get(`/play/${other.slug}`, kid)).status, 200);
});

test('course games stay out of the open lists', async () => {
  const anyone = q.get('SELECT * FROM users WHERE is_guest=0 LIMIT 1');
  for (const list of [G.listVisible(null, { limit: 200 }), G.listVisible(null, { featured: true, limit: 200 }), G.search(null, { text: 'Robo' }), G.search(anyone, { text: 'Packet' })])
    for (const s of ORDER) assert.ok(!list.some(g => g.slug === s), `${s} is not in an open list`);
});

test('seeded choice order: the same for a player and try, never leaks the answer, differs between players', () => {
  const s1 = C.getStep(course, '1b-1.1');
  const a = C.questions(s1, 'u1:0'), b = C.questions(s1, 'u1:0');
  assert.deepEqual(a, b);
  for (const qq of a) { assert.deepEqual(qq.choices.map(c => c.i).sort(), [0, 1, 2, 3]); assert.equal('answer' in qq, false); }
  const orders = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(C.questions(s1, `u${i}:0`).map(x => x.choices.map(c => c.i)))));
  assert.ok(orders.size > 1);
});

test('account deletion removes course progress and the band', () => {
  const kid = newKid();
  C.setBand(kid, course, '1b');
  C.markRead(kid, course, C.getStep(course, '1b-1.1'));
  assert.ok(q.get('SELECT 1 FROM course_progress WHERE user_id=?', kid.id));
  assert.equal(deleteAccount(kid.id, null, { by: 'admin', parentMade: false }).ok, true);
  assert.equal(q.get('SELECT 1 FROM course_progress WHERE user_id=?', kid.id), undefined);
  assert.equal(q.get('SELECT 1 FROM course_bands WHERE user_id=?', kid.id), undefined);
});
