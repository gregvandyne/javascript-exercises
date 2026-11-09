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
  assert.equal((await get('/courses/cs-quest/1b-1.2', kid)).location, '/courses/cs-quest?locked=1b-1.2#step-1b-1.2');
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
  assert.deepEqual(r.json, { right: false, answer: right(id), text: C.item(id).choices[right(id)], why: C.item(id).why || '' }, 'a miss names the right answer and explains it (the check-feedback fix)');
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

  // The module cannot be finished before it is entered: the completion call is refused (the check is passed,
  // but the game was never opened from this step).
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/complete', kid, {})).status, 409);

  // Opening the game module from the step only starts it: the step is not complete and the next step stays shut.
  const play = await get('/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1', kid);
  assert.equal(play.status, 200);
  assert.match(play.text, /href="\/courses\/cs-quest\/1b-1\.1#play"/, 'back goes to the step');
  assert.match(play.text, /"cstep":\{"course":"cs-quest","step":"1b-1\.1"\}/, 'the play page carries the course step, so a win can be reported for it');
  const row = q.get('SELECT * FROM course_progress WHERE user_id=? AND step=?', kid.id, '1b-1.1');
  assert.ok(row.played_at > 0 && row.check_score === 2);
  assert.equal(row.completed_at, null);
  const started = C.stateOf(kid, course, '1b-1.1');
  assert.ok(started.played && !started.won && !started.complete, 'entered is not finished');
  assert.equal(C.stateOf(kid, course, '1b-1.2').open, false);
  let map = await get('/courses/cs-quest', kid);
  assert.doesNotMatch(map.text, /class="cmap-step is-done" id="step-1b-1\.1"/);
  assert.match(map.text, /0 of 19 steps done/);

  // The game reports the module finished (the play page posts the win): now the step completes and the next opens.
  assert.deepEqual((await post('/api/courses/cs-quest/1b-1.1/complete', kid, {})).json, { ok: true, complete: true });
  assert.ok(q.get('SELECT completed_at FROM course_progress WHERE user_id=? AND step=?', kid.id, '1b-1.1').completed_at > 0);
  assert.ok(C.stateOf(kid, course, '1b-1.1').complete);
  assert.equal(C.stateOf(kid, course, '1b-1.2').open, true);
  assert.equal((await get('/courses/cs-quest/1b-1.2', kid)).status, 200);
  // Reporting the same win again is harmless.
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/complete', kid, {})).status, 200);
  // The wrong game for the step, or a step whose check is not passed, still goes to the map.
  assert.equal((await get('/play/data-detective?course=cs-quest&cstep=1b-1.1', kid)).location, '/courses/cs-quest');
  assert.equal((await get('/play/robo-route?course=cs-quest&cstep=1b-1.2&chapter=loops', kid)).location, '/courses/cs-quest');

  map = await get('/courses/cs-quest', kid);
  assert.match(map.text, /class="cmap-step is-done" id="step-1b-1\.1"/);
  assert.match(map.text, /class="cmap-step is-next" id="step-1b-1\.2"/);
  assert.match(map.text, /1 of 19 steps done/);
  const home = await get('/', kid);
  assert.match(home.text, /href="\/courses\/cs-quest\/1b-1\.2" id="course-cs-quest-go">▶ Keep going/);
});

test('an owner/admin arrival with a step context keeps it: the win can be reported and recorded', async () => {
  // Regression (live, 2026-11-05): the play route used to drop the course step for the game's owner and
  // the admin (!isOwner), so their wins — earned exactly like a student's, through the step's own Play
  // link after a passed check — could never be recorded: no played_at, no cstep in the page data, no
  // completion call, and no sign of the failure anywhere. courses.playable is the gate for everyone.
  const admin = auth.createUser({ username: `boss${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Boss', role: 'admin' });
  C.setBand(admin, course, '1b');
  const s1 = C.getStep(course, '1b-1.1');
  // Before the check is passed the gate refuses the context for the admin exactly as for a student:
  // the game opens as an owner preview, with nothing to complete against.
  const early = await get('/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1', admin);
  assert.equal(early.status, 200);
  assert.doesNotMatch(early.text, /"cstep"/, 'no step context before the check is passed');
  assert.equal(q.get('SELECT played_at FROM course_progress WHERE user_id=? AND step=?', admin.id, '1b-1.1'), undefined);
  // Pass the check (admins are not grownup accounts: the step APIs record for them), then take the
  // step's own Play link: the context is honoured, the module is marked started, the win records.
  await post('/api/courses/cs-quest/1b-1.1/read', admin, {});
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/check', admin, { answers: allRight(s1) })).json.passed, true);
  const play = await get('/play/robo-route?course=cs-quest&cstep=1b-1.1&chapter=sequences&band=1b&lock=1', admin);
  assert.equal(play.status, 200);
  assert.match(play.text, /"cstep":\{"course":"cs-quest","step":"1b-1\.1"\}/, 'the play page carries the course step for an admin too');
  assert.match(play.text, /"backHref":"\/courses\/cs-quest\/1b-1\.1#play"/, 'and the way back (the finish bar and BRB.back use it)');
  const row = q.get('SELECT * FROM course_progress WHERE user_id=? AND step=?', admin.id, '1b-1.1');
  assert.ok(row.played_at > 0 && row.completed_at === null, 'entered, not yet finished');
  assert.deepEqual((await post('/api/courses/cs-quest/1b-1.1/complete', admin, {})).json, { ok: true, complete: true });
  assert.ok(C.stateOf(admin, course, '1b-1.1').complete);
  // Free play carries no back context in its page data, so the finish bar and BRB.back stay out of it.
  const free = await get('/play/sum-racer', admin);
  assert.equal(free.status, 200);
  assert.doesNotMatch(free.text, /"backHref"/, 'no course back context in free play');
});

test('the completion endpoint: only an entered, check-passed game step can be finished', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  // The step is open, but its check is not passed and its game was never entered.
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/complete', kid, {})).status, 409);
  // A locked step is refused like the other step APIs.
  assert.equal((await post('/api/courses/cs-quest/1b-1.2/complete', kid, {})).status, 403);
  // Signed out is refused.
  assert.equal((await post('/api/courses/cs-quest/1b-1.1/complete', null, {})).status, 401);
  // Nothing was recorded.
  assert.equal(q.get('SELECT completed_at FROM course_progress WHERE user_id=? AND step=?', kid.id, '1b-1.1'), undefined);
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

test('a step without a game is complete after its check; locks follow the order', async () => {
  const kid = newKid();
  const list = C.steps(course, '2');
  // Everything before 6.1 done by hand (read, checked and — for the steps with a game — the module finished).
  for (const s of list.slice(0, 16)) q.run('INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,3,?,?)', kid.id, 'cs-quest', s.key, '2', now(), now(), now(), now());
  // A step without a game never completes through the game endpoint: it finishes at its check.
  assert.equal((await post('/api/courses/cs-quest/2-6.1/complete', kid, {})).status, 400);
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

test('the admin account: every step of every course open, and opening completes nothing', async () => {
  const admin = auth.createUser({ username: `boss${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', role: 'admin' });
  const kid = newKid();
  for (const slug of ['cs-quest', 'cyber-defenders', 'number-quest']) {
    const c = C.getCourse(slug);
    for (const band of C.bandsFor(c)) {
      const st = C.states(admin, c, band);
      assert.ok(st.length > 0, `${slug}/${band} has steps`);
      assert.ok(st.every(s => s.open), `${slug}/${band}: every step open for the admin`);
      assert.ok(st.every(s => !s.complete), `${slug}/${band}: nothing complete just by being open`);
    }
    // A student on the same data still sees the sequence locks.
    const st = C.states(kid, c, C.bandsFor(c)[0]);
    assert.ok(st[0].open, `${slug}: the first step is open to a student`);
    assert.ok(st.slice(1).some(s => !s.open), `${slug}: later steps stay locked for a student`);
  }
  // The look wrote nothing: the admin has no progress rows at all.
  assert.equal(q.get('SELECT COUNT(*) AS n FROM course_progress WHERE user_id=?', admin.id).n, 0);
  // Direct entry: the admin opens a late step's page; the student is sent back to the map.
  C.setBand(kid, course, '2');
  assert.equal((await get('/courses/cs-quest/2-5.3', admin)).status, 200);
  assert.equal((await get('/courses/cs-quest/2-5.3', kid)).location, '/courses/cs-quest?locked=2-5.3#step-2-5.3');
  // The step APIs answer the admin on that step and refuse the student.
  assert.equal((await post('/api/courses/cs-quest/2-5.3/read', kid, {})).status, 403);
  assert.equal((await post('/api/courses/cs-quest/2-5.3/read', admin, {})).status, 200);
  // The maps render the steps as available for the admin (real links), still locked for the student.
  C.setBand(admin, course, '2');
  assert.ok((await get('/courses/cs-quest', admin)).text.includes('href="/courses/cs-quest/2-5.3"'), 'admin map links the late step');
  assert.ok(!(await get('/courses/cs-quest', kid)).text.includes('href="/courses/cs-quest/2-5.3"'), 'student map does not link the locked step');
  const cyber = C.getCourse('cyber-defenders');
  C.setBand(admin, cyber, '2'); C.setBand(kid, cyber, '2');
  assert.ok((await get('/courses/cyber-defenders', admin)).text.includes('href="/courses/cyber-defenders/2-6.4"'), 'admin map links the Cyber finale');
  assert.ok(!(await get('/courses/cyber-defenders', kid)).text.includes('href="/courses/cyber-defenders/2-6.4"'), 'student map does not link the locked finale');
  assert.ok((await get('/courses/number-quest', admin)).text.includes('href="/courses/number-quest/explorer-4.3"'), 'admin path links a late Number Quest step');
  assert.ok(!(await get('/courses/number-quest', kid)).text.includes('href="/courses/number-quest/explorer-4.3"'), 'student path does not link the locked step');
});

test('the admin completes a step only by its own flow: check, play from the step, win', async () => {
  const admin = auth.createUser({ username: `boss${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', role: 'admin' });
  const kid = newKid(); C.setBand(kid, course, '1b');
  const step = C.getStep(course, '1b-1.2'); // Robo Route: Loops — the second step, locked for a new student
  // The student is refused at every gate of this step.
  assert.equal((await post('/api/courses/cs-quest/1b-1.2/check', kid, { answers: allRight(step) })).status, 403);
  assert.equal((await get(C.playHref(course, step), kid)).location, '/courses/cs-quest');
  assert.equal((await post('/api/courses/cs-quest/1b-1.2/complete', kid, {})).status, 403);
  // The admin opens the step: nothing is complete yet, and a bare completion call still fails.
  assert.equal((await get('/courses/cs-quest/1b-1.2', admin)).status, 200);
  assert.ok(!C.stateOf(admin, course, '1b-1.2').complete, 'opening completes nothing');
  assert.equal((await post('/api/courses/cs-quest/1b-1.2/complete', admin, {})).status, 409, 'no check, no play: no completion');
  // Pass the step's own check, then launch its game from the step: the module is marked started and
  // the play page carries the step context the win posts back against.
  const chk = await post('/api/courses/cs-quest/1b-1.2/check', admin, { answers: allRight(step) });
  assert.equal(chk.status, 200); assert.equal(chk.json.passed, true);
  assert.equal(C.playable(admin, course, '1b-1.2', 'robo-route'), step);
  const play = await get(C.playHref(course, step), admin);
  assert.equal(play.status, 200);
  assert.ok(play.text.includes('"cstep":{"course":"cs-quest","step":"1b-1.2"}'), 'the play page carries the step for the admin');
  assert.ok(C.stateOf(admin, course, '1b-1.2').played, 'opening the module from the step marks it started');
  assert.ok(!C.stateOf(admin, course, '1b-1.2').complete, 'started is not finished');
  // The win (what the play page posts when the game reports its chapter won) completes the step.
  const done = await post('/api/courses/cs-quest/1b-1.2/complete', admin, {});
  assert.equal(done.status, 200); assert.equal(done.json.complete, true);
  assert.ok(C.stateOf(admin, course, '1b-1.2').complete);
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

test('a grown-up reads a course page Home links to, with nothing to pick; a step goes back to it (no 404)', async () => {
  const mum = auth.createUser({ username: 'CourseMum', password: 'a-long-password-1', accountType: 'grownup' });
  const page = await get('/courses/cs-quest', mum);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /action="\/courses\/cs-quest\/band"/, 'no band to pick');
  const step = await get('/courses/cs-quest/1b-1.1', mum);
  assert.equal(step.status, 302); assert.equal(step.location, '/courses/cs-quest');
  assert.equal(q.get('SELECT COUNT(*) n FROM course_bands WHERE user_id=?', mum.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM course_progress WHERE user_id=?', mum.id).n, 0);
});
