// Cyber Defenders platform slice (server/services/courses.js, server/routes/courses.js, server/routes/games.js,
// server/services/course-catalog.js): a second, deck-native course on the CS Quest machinery. Its steps come from
// seed-lessons/cyber-defenders (units.json + decks + banks), its map groups are its units, and its game modules are
// games it does not own: Packet Post (owned by CS Quest, so the /play gate must accept the step's own course, not
// just the owner's) and Would You Rather (an open game: no gate, but a valid step context still starts the
// step, which then completes only when the game reports the win — the same gated /complete post as CS Quest).
// CS Quest's own behavior is spot-checked to be unchanged.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const C = await import('../../server/services/courses.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u, extra = {}) => { const r = await fetch(base + path, { headers: { ...H, ...extra, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, u, body, { form = false } = {}) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
let n = 0;
const newKid = () => auth.createUser({ username: `def${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const course = C.getCourse('cyber-defenders');
const csq = C.getCourse('cs-quest');
const right = id => C.item(id).answer;
const allRight = step => Object.fromEntries(step.check.map(id => [id, right(id)]));
const ORDER = ['0.1', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3', '6.4'];
/** Mark a step fully done by hand (as courses.test.js does for CS Quest). */
const doneByHand = (kid, step) => q.run('INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,3,?,?)', kid.id, 'cyber-defenders', step.key, step.band, now(), now(), now(), now());

test('20 steps per band from units.json, decks clean, games as catalogued', () => {
  for (const band of C.BANDS) {
    const s = C.steps(course, band);
    assert.equal(s.length, 20, band);
    assert.deepEqual(s.map(x => x.n), ORDER);
    assert.deepEqual(C.deckProblems(band, 'cyber-defenders'), [], band);
    for (const x of s) {
      assert.equal(x.deck, true, x.key);
      assert.equal(x.check.length, 3, x.key);
      for (const id of x.check) assert.ok(C.item(id), id);
      assert.ok(x.standards && x.standards.cyberorg.length >= 1, `${x.key} carries its standards`);
    }
  }
  assert.equal(C.getStep(course, '1b-0.1').game, null);
  assert.deepEqual(C.getStep(course, '1b-1.1').game, { slug: 'packet-post', chapter: 'packets', chapterTitle: 'Break It Up', params: 'chapter=packets&band=1b&lock=1', title: 'Packet Post' });
  assert.equal(C.getStep(course, '1b-3.1').game.slug, 'trick-inbox');
  assert.equal(C.getStep(course, '1b-3.1').game.chapter, 'private');
  assert.equal(C.getStep(course, '1b-3.1').game.title, 'Trick Inbox');
  assert.equal(C.getStep(course, '2-3.3').game.slug, 'trick-inbox');
  assert.equal(C.getStep(course, '2-3.3').game.chapter, 'pressure');
  assert.equal(C.getStep(course, '1b-3.2').game.params, 'chapter=which-pim&band=1b&lock=1', 'a practice lock of the escape room');
  assert.equal(C.getStep(course, '1b-9.9'), null);
  // CS Quest is untouched by Cyber: 21 steps in 1b (19 lessons + story intro/finale from extras) and 22 in
  // band 2 (the Pro-only 3.4 Fair Data practice step rides along), no problems, its own decks.
  assert.equal(C.steps(csq, '1b').length, 21);
  assert.equal(C.steps(csq, '2').length, 22);
  assert.deepEqual(C.deckProblems('1b'), []);
  assert.deepEqual(C.groupsFor(course).map(g => g.id), ['post-office', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6']);
  assert.deepEqual(C.groupsFor(csq).map(g => g.id), ['start', 'robo-route', 'data-detective', 'packet-post', 'inside-the-machine', 'tech-choices']);
});

test('the course page: band picker first, then the map with unit groups and 20 steps', async () => {
  const anon = await get('/courses/cyber-defenders');
  assert.equal(anon.status, 200);
  assert.match(anon.text, /Cyber Defenders/);
  assert.match(anon.text, /<form method="post" action="\/courses\/cyber-defenders\/band"/);
  assert.match(anon.text, /href="\/teachers"/);
  assert.match(anon.text, /href="\/teachers\/cyber-defenders"/, 'the course page links the Cyber Defenders teacher page');

  const kid = newKid(); C.setBand(kid, course, '1b');
  const map = await get('/courses/cyber-defenders', kid);
  assert.equal(map.status, 200);
  const ids = [...map.text.matchAll(/id="step-(1b-\d\.\d)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ORDER.map(n => `1b-${n}`));
  for (const g of ['post-office', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6']) assert.match(map.text, new RegExp(`<section class="cmap-group" id="${g}"`));
  assert.match(map.text, /Welcome to the Post Office/);
  assert.match(map.text, /Messages on the move/);
  assert.match(map.text, /Tricks and tricksters/);
  assert.match(map.text, /class="cmap-step is-next" id="step-1b-0\.1"/);
  assert.match(map.text, /class="cmap-step is-locked" id="step-1b-1\.1"/);
  assert.match(map.text, /0 of 20 steps done/);
});

test('the intro step has no game: read, check, done — and the next step opens', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  const s0 = C.getStep(course, '1b-0.1');
  const page = await get('/courses/cyber-defenders/1b-0.1', kid);
  assert.equal(page.status, 200);
  assert.equal((page.text.match(/<section class="slide /g) || []).length, s0.slides.length);
  for (const id of s0.check) assert.match(page.text, new RegExp(`data-q="${id}"`));
  assert.equal((await get('/courses/cyber-defenders/1b-1.1', kid)).location, '/courses/cyber-defenders?locked=1b-1.1#step-1b-1.1', 'the next step is locked');
  const r = await post('/api/courses/cyber-defenders/1b-0.1/check', kid, { answers: allRight(s0) });
  assert.equal(r.json.passed, true);
  assert.equal(r.json.play, null, 'no game module to open');
  const st = C.stateOf(kid, course, '1b-0.1');
  assert.ok(st.complete, 'a step without a game completes at its check');
  assert.equal(C.stateOf(kid, course, '1b-1.1').open, true);
});

test('a Packet Post mission opens from a Cyber Defenders step (the game owner is another course)', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  const s0 = C.getStep(course, '1b-0.1'), s1 = C.getStep(course, '1b-1.1');
  await post('/api/courses/cyber-defenders/1b-0.1/check', kid, { answers: allRight(s0) });
  const playUrl = '/play/packet-post?course=cyber-defenders&cstep=1b-1.1&chapter=packets&band=1b&lock=1';
  // Before the check: the gate sends the player back to the step's own course map, not the owner's.
  assert.equal((await get(playUrl, kid)).location, '/courses/cyber-defenders');
  const r = await post('/api/courses/cyber-defenders/1b-1.1/check', kid, { answers: allRight(s1) });
  assert.equal(r.json.play, playUrl);
  const play = await get(playUrl, kid);
  assert.equal(play.status, 200);
  assert.match(play.text, /href="\/courses\/cyber-defenders\/1b-1\.1#play"/, 'back goes to the Defender step');
  assert.match(play.text, /href="\/courses\/cyber-defenders"/, 'the course badge is the Defender course');
  const started = C.stateOf(kid, course, '1b-1.1');
  assert.ok(started.played && !started.won && !started.complete, 'opening the module only starts it — the step is not complete until the game is finished');
  // The win itself: the post the play page makes when the game reports its chapter won (brb:gameover).
  const won = await post('/api/courses/cyber-defenders/1b-1.1/complete', kid, {});
  assert.equal(won.status, 200);
  assert.ok(C.stateOf(kid, course, '1b-1.1').complete, 'the step completes when the game reports the chapter won');
  // The same step key under the wrong course is not playable from it.
  assert.equal((await get('/play/packet-post?course=cs-quest&cstep=1b-1.1&chapter=packets&band=1b&lock=1', kid)).location, '/courses/cs-quest');
  // And a bare course game still belongs to its owner.
  assert.equal((await get('/play/packet-post', kid)).location, '/courses/cs-quest');
  assert.equal((await get('/g/packet-post', kid)).location, '/courses/cs-quest#packet-post');
});

test('a Trick Inbox mission (the scored privacy set that replaced Would You Rather): the step context starts the step and its win completes it', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  for (const s of C.steps(course, '1b').slice(0, 7)) doneByHand(kid, s);
  const s31 = C.getStep(course, '1b-3.1');
  assert.equal(C.stateOf(kid, course, '1b-3.1').open, true);
  const r = await post('/api/courses/cyber-defenders/1b-3.1/check', kid, { answers: allRight(s31) });
  assert.equal(r.json.play, '/play/trick-inbox?course=cyber-defenders&cstep=1b-3.1&chapter=private&band=1b&lock=1', 'the module opens the game locked to its Private Facts set');
  const play = await get('/play/trick-inbox?course=cyber-defenders&cstep=1b-3.1&chapter=private&band=1b&lock=1', kid);
  assert.equal(play.status, 200);
  assert.match(play.text, /href="\/courses\/cyber-defenders\/1b-3\.1#play"/, 'back goes to the Defender step');
  const started = C.stateOf(kid, course, '1b-3.1');
  assert.ok(started.played && !started.complete, 'opening the mission only starts the step');
  const won = await post('/api/courses/cyber-defenders/1b-3.1/complete', kid, {});
  assert.equal(won.status, 200);
  assert.ok(C.stateOf(kid, course, '1b-3.1').complete, 'the step completes when the game reports the win');
  // No Cyber Defenders step opens Would You Rather's unscored dilemmas any more
  for (const band of ['1b', '2']) assert.ok(C.steps(course, band).every(x => !x.game || x.game.slug !== 'would-you-rather'), band);
});

test('shared games keep their place in the open lists; owned course games stay out', () => {
  const slugs = G.listVisible(null, { limit: 500 }).map(g => g.slug);
  assert.ok(slugs.includes('would-you-rather'), 'Would You Rather is still an open game');
  assert.ok(!slugs.includes('packet-post'), 'Packet Post is still course-only');
  assert.equal(C.courseOfSlug('would-you-rather'), null, 'no course owns the shared game');
  assert.equal(C.courseOfSlug('packet-post').slug, 'cs-quest', 'Packet Post is still owned by CS Quest');
});

test('the teacher page: the published v1.0 mapping, the teacher notes and the printed pack; CS Quest untouched', async () => {
  const page1 = await get('/teachers/cyber-defenders');
  assert.equal(page1.status, 200);
  assert.match(page1.text, /Cyber Defenders: online safety you can teach tomorrow/);
  // The published mapping, from units.json: a CYBER.ORG v1.0 code per band, a Common Sense topic, inherited CSTA.
  assert.match(page1.text, /3-5\.CS\.COMM/, 'an Explorer CYBER.ORG v1.0 code');
  assert.match(page1.text, /6-8\.SEC\.NET/, 'a Pro CYBER.ORG v1.0 code');
  assert.match(page1.text, /Privacy &amp; Security/, 'a Common Sense topic');
  assert.match(page1.text, /<td lang="en" dir="ltr">Privacy &amp; Security<\/td>/, 'the topic renders as a real table cell, escaped once');
  assert.doesNotMatch(page1.text, /&lt;(td|tr|table)/, 'the map markup is markup, not escaped text');
  assert.match(page1.text, /1B-NI-04/, 'an inherited CSTA code');
  assert.match(page1.text, /CYBER\.ORG K-12 Cybersecurity Learning Standards v1\.0/, 'the mapping names its version');
  assert.match(page1.text, /Private on paper first/, 'the unit 1 teacher note');
  assert.match(page1.text, /Printed materials/, 'the printed-materials section');
  const print = await get('/teachers/cyber-defenders?print=1');
  assert.equal(print.status, 200);
  assert.match(print.text, /3-5\.CS\.COMM/, 'the print view carries the map');
  assert.match(print.text, /Private on paper first/, 'the print view carries the notes');
  assert.equal((await get('/teachers/cs-quest')).status, 200, 'the CS Quest teacher page is unchanged');
});

test('guided focus renders on a Cyber Defenders unit 1 step page (shared renderer)', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  doneByHand(kid, C.getStep(course, '1b-0.1'));
  const page = await get('/courses/cyber-defenders/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /<figure class="smedia gf(?: crop)?" style="--ar:[\d.]+;--fhr:[\d.]+" data-gf>/, 'a guided-focus figure');
  assert.match(page.text, /<div class="gf-layer" aria-hidden="true">/, 'the overlay layer');
  assert.ok(page.text.includes('A photo waits at Pim&#39;s Post, ready to travel') || page.text.includes("A photo waits at Pim's Post, ready to travel"), 'the first cue is on the page');
  assert.match(page.text, /<button class="gf-replay" type="button" hidden>/, 'the replay button');
});

test('the home page shows both course cards', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="course-cs-quest-go"/);
  assert.match(r.text, /id="course-cyber-defenders-go"/);
  const card = r.text.slice(r.text.indexOf('id="course-cyber-defenders-h"'), r.text.indexOf('</article>', r.text.indexOf('id="course-cyber-defenders-h"')));
  const at = ['packet-post', 'would-you-rather'].map(s => card.indexOf(`href="/courses/cyber-defenders#${s}"`));
  assert.ok(at.every(i => i > 0), 'both games link to their unit on the Defender map');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in course order');
  assert.match(card, /Cyber Defenders/);
});
