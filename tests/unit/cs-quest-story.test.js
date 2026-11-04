// Story layer (the story & intro pack): the slide `story` field's cleanSlide pass-through and drop rules,
// the course-only steps from extras.json (intro 0.1 first, finale 6.4 last, no lesson behind them), and the
// step pages' stage markup. Runs against a temp deck dir holding the real seed decks for 1b-1.5 (a beat
// deck), 0.1 and 6.4 plus the real extras.json, with the story mutated per case.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');

const SEED_DIR = path.join(ROOT, 'seed-lessons/cs-quest/course');
const SEED_BEAT = JSON.parse(fs.readFileSync(path.join(SEED_DIR, '1b/1.5.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'story-decks-'));
for (const band of ['1b', '2']) {
  fs.mkdirSync(path.join(tmp, band), { recursive: true });
  for (const n of ['0.1', '6.4']) fs.copyFileSync(path.join(SEED_DIR, band, `${n}.json`), path.join(tmp, band, `${n}.json`));
}
fs.copyFileSync(path.join(SEED_DIR, 'extras.json'), path.join(tmp, 'extras.json'));
const beatFile = path.join(tmp, '1b', '1.5.json');
function writeDeck(mutate) {
  const d = JSON.parse(JSON.stringify(SEED_BEAT));
  mutate(d);
  fs.writeFileSync(beatFile, JSON.stringify(d));
  C.reload();
}
writeDeck(() => {});
C.useDeckDir(tmp);
seed({ quiet: true });
const course = C.getCourse('cs-quest');
const beatSlide = () => C.getStep(course, '1b-1.5').slides.find(s => s.story);
const storyProblems = () => C.deckProblems('1b').filter(p => p.includes('story was dropped'));

test('a valid story passes cleaning untouched; the shipped course carries the pack\'s scenes and nothing else', () => {
  assert.deepEqual(beatSlide().story, SEED_BEAT.slides.find(s => s.story).story);
  assert.deepEqual(storyProblems(), []);
  C.useDeckDir('seed-lessons/cs-quest/course');
  for (const band of C.BANDS) {
    const s = C.steps(course, band);
    assert.equal(s.length, 21, `${band}: 19 lessons + intro + finale`);
    assert.equal(s[0].n, '0.1'); assert.equal(s.at(-1).n, '6.4');
    const intro = s[0], finale = s.at(-1);
    assert.equal(intro.deck, true); assert.equal(intro.game, null); assert.equal(intro.extra, true);
    assert.deepEqual(intro.slides.filter(x => x.story).map(x => x.story.scene), ['dim', 'drain', 'team', 'map']);
    assert.deepEqual(finale.slides.filter(x => x.story).map(x => x.story.scene), ['relight', 'celebrate', 'finale']);
    for (const id of intro.check) assert.ok(C.item(id), `${band}: intro item ${id} resolves`);
    // Scope: story slides live only in the intro, the finale and the five beat decks.
    let beats = 0;
    for (const step of s) for (const sl of step.slides) {
      if (!sl.story) continue;
      if (step.n === '0.1' || step.n === '6.4') continue;
      assert.ok(['1.5', '2.2', '3.3', '4.3', '5.3'].includes(step.n), `${step.key}: story outside the story steps is a beat`);
      assert.equal(sl.story.scene, 'handoff'); beats++;
    }
    assert.equal(beats, 5, `${band}: five beats`);
  }
  C.useDeckDir(tmp);
});

test('malformed story is dropped whole and reported once, the slide keeps its art', () => {
  const cases = {
    'unknown scene': st => { st.scene = 'party'; },
    'lit too high': st => { st.lit = 5; },
    'lit negative': st => { st.lit = -1; },
    'lit not a number': st => { st.lit = '1'; },
    'unknown character in chars': st => { st.chars = ['bolt', 'rex']; },
    'a character twice': st => { st.chars = ['bolt', 'bolt']; },
    'five characters': st => { st.chars = ['bolt', 'dot', 'pim', 'gizmo', 'bolt']; },
    'unknown fly character': st => { st.fly = 'rex'; },
    'unknown out character': st => { st.out = 'rex'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    writeDeck(d => mutate(d.slides.find(s => s.story).story));
    assert.equal(beatSlide(), undefined, `${name}: no slide keeps a story`);
    assert.equal(storyProblems().length, 1, `${name}: reported once: ${JSON.stringify(C.deckProblems('1b'))}`);
  }
  writeDeck(d => { d.slides.find(s => s.story).story = ['handoff']; });
  assert.equal(beatSlide(), undefined, 'a story array is dropped');
  assert.equal(storyProblems().length, 1, 'a story array is reported');
  writeDeck(() => {});
  assert.deepEqual(storyProblems(), [], 'the untouched seed deck is clean again');
});

test('the intro completes like any no-game step and opens 1.1; totals count 21 steps', () => {
  let n = 0;
  const kid = auth.createUser({ username: `storykid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
  C.setBand(kid, course, '1b');
  const intro = C.getStep(course, '1b-0.1');
  assert.equal(C.stateOf(kid, course, '1b-0.1').open, true, 'the intro is open first');
  assert.equal(C.stateOf(kid, course, '1b-1.1').open, false, '1.1 waits for the intro');
  const right = Object.fromEntries(intro.check.map(id => [id, C.item(id).answer]));
  C.recordCheck(kid, course, intro, C.grade(intro, right));
  assert.equal(C.stateOf(kid, course, '1b-0.1').complete, true, 'no game: the check completes the intro');
  assert.equal(C.stateOf(kid, course, '1b-1.1').open, true, '1.1 opens next');
  const ov = C.overview(kid, course, '1b');
  assert.equal(ov.total, 21); assert.equal(ov.done, 1); assert.equal(ov.next.step.n, '1.1');
});

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0', cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };

test('the intro page renders the stages: dim Spark, the team with its sprites and names, the map', async () => {
  let n = 0;
  const kid = auth.createUser({ username: `storypage${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
  C.setBand(kid, course, '1b');
  const page = await get('/courses/cs-quest/1b-0.1', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /<figure class="smedia story" data-story data-scene="dim" data-lit="0">/, 'the dim stage');
  assert.match(page.text, /data-scene="drain"/, 'the drain stage');
  assert.match(page.text, /data-scene="team"/, 'the team stage');
  assert.match(page.text, /data-scene="map"/, 'the map stage');
  assert.match(page.text, /class="spark-star"/, 'the reusable Spark motif');
  assert.equal((page.text.match(/class="story-piece /g) || []).length, 16, 'four pieces on each of the four Spark stages');
  for (const id of ['bolt', 'dot', 'pim', 'gizmo']) {
    assert.ok(page.text.includes(`<img src="/img/csq/chars/${id}.webp"`), `${id}'s own game sprite is on the team stage`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'img', 'csq', 'chars', `${id}.webp`)), `${id}.webp exists`);
  }
  assert.match(page.text, /<span class="story-name">Bolt<\/span>/, 'name chips on the team stage');
  assert.match(page.text, /aria-hidden="true"/, 'the stage is decoration; the words carry the story');
});

test('a beat page renders the handoff: the outgoing character, the flown piece, the progress row', async () => {
  C.useDeckDir('seed-lessons/cs-quest/course');
  const admin = q.get("SELECT * FROM users WHERE role='admin' LIMIT 1");
  const page = await get('/courses/cs-quest/1b-3.3', admin);
  assert.equal(page.status, 200);
  assert.match(page.text, /data-scene="handoff" data-lit="2"/, 'the 3.3 beat: two pieces lit after it');
  assert.match(page.text, /story-char--dot is-out/, 'Dot hands over');
  assert.match(page.text, /story-char--pim is-in/, 'Pim peeks in');
  assert.match(page.text, /story-gem story-gem--dot is-new/, "Dot's piece is the one that flies");
  assert.match(page.text, /story-gem story-gem--bolt is-lit/, "Bolt's piece already sits lit in the row");
  assert.match(page.text, /--fx:/, 'the flown piece carries its start offset');
  const finale = await get('/courses/cs-quest/1b-6.4', admin);
  assert.equal(finale.status, 200);
  assert.match(finale.text, /data-scene="relight" data-lit="4"/, 'the relight stage');
  assert.match(finale.text, /story-piece--gizmo is-lit is-fly/, 'the pieces fly in on the relight');
  C.useDeckDir(tmp);
});
