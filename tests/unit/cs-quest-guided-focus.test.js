// Guided focus (slide `focus` steps over a slide picture): the service's cleanSlide pass-through and drop
// rules, and the step page's overlay markup. Runs against a temp deck dir holding the real seed deck for
// 1b-1.1 (so lesson/game/check matching is the real one) with its focus mutated per case.
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
const auth = await import('../../server/auth.js');
const C = await import('../../server/services/courses.js');

const SEED_DECK = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/cs-quest/course/1b/1.1.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-decks-'));
fs.mkdirSync(path.join(tmp, '1b'), { recursive: true });
fs.mkdirSync(path.join(tmp, '2'), { recursive: true });
const deckFile = path.join(tmp, '1b', '1.1.json');
function writeDeck(mutate) {
  const d = JSON.parse(JSON.stringify(SEED_DECK));
  // The whole pictures (no `view` crops): this file pins the overlay markup in the picture's own %; the
  // crop's remap is pinned in course-engine.test.js. A picture split across two slides keeps its two crops
  // (they are what lets the deck carry its eighth slide).
  const split = (s, i, all) => [all[i - 1], all[i + 1]].some(o => o && o.img === s.img);
  d.slides.forEach((s, i, all) => { if (!split(s, i, all)) delete s.view; });
  mutate(d);
  fs.writeFileSync(deckFile, JSON.stringify(d));
  C.reload();
}
writeDeck(() => {});
C.useDeckDir(tmp);
seed({ quiet: true });
const course = C.getCourse('cs-quest');
const slide1 = () => C.getStep(course, '1b-1.1').slides[0];
const focusProblems = () => C.deckProblems('1b').filter(p => p.includes('focus was dropped'));

test('a valid focus passes cleaning untouched, and every Unit 1 seed slide keeps its steps', () => {
  assert.deepEqual(slide1().focus, SEED_DECK.slides[0].focus);
  assert.deepEqual(focusProblems(), []);
  // The shipped decks: all 56 pictured Unit 1 slides carry focus (the pilot gate for this feature).
  C.useDeckDir('seed-lessons/cs-quest/course');
  let pictured = 0, steps = 0;
  for (const band of C.BANDS) for (const s of C.steps(course, band).filter(x => x.n.startsWith('1.'))) {
    for (const sl of s.slides) if (sl.img) { pictured++; assert.ok(sl.focus, `${s.key} "${sl.title}" keeps its focus`); steps += sl.focus.length; }
  }
  assert.equal(pictured, 56);
  assert.ok(steps >= 56 && steps <= 4 * 56, `${steps} focus steps`);
  C.useDeckDir(tmp);
});

test('malformed focus is dropped whole and reported, the slide keeps its picture', () => {
  const cases = {
    'box outside the frame': f => { f[0].box = [95, 10, 10, 10]; },
    'box too thin': f => { f[0].box = [10, 10, 1, 10]; },
    'five steps': f => { f.push(f[0], f[0], f[0], f[0]); },
    'cue too long': f => { f[0].cue = 'x'.repeat(81); },
    'cue with stray spaces': f => { f[0].cue = ' Watch Bolt '; },
    'path of one point': f => { f[0].path = [[10, 10]]; },
    'path point outside the frame': f => { f[0].path = [[10, 10], [120, 10]]; },
    'no steps at all': f => { f.length = 0; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    writeDeck(d => mutate(d.slides[0].focus));
    assert.equal(slide1().focus, undefined, `${name}: focus dropped`);
    assert.ok(slide1().img, `${name}: the picture stays`);
    assert.equal(focusProblems().length, 1, `${name}: reported once: ${JSON.stringify(C.deckProblems('1b'))}`);
  }
  writeDeck(d => { delete d.slides[0].img; delete d.slides[0].alt; });
  assert.equal(slide1().focus, undefined, 'focus without a picture is dropped');
  assert.equal(focusProblems().length, 1, 'focus without a picture is reported');
  writeDeck(() => {});
  assert.deepEqual(focusProblems(), [], 'the untouched seed deck is clean again');
});

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0', cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
let n = 0;
const newKid = () => auth.createUser({ username: `gfkid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });

test('the step page renders the overlay: boxes in %, the dotted path, cues and the replay button', async () => {
  writeDeck(() => {});
  const kid = newKid(); C.setBand(kid, course, '1b');
  const page = await get('/courses/cs-quest/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /<figure class="smedia gf" style="--ar:1.78;--fhr:0.56" data-gf>\s*<div class="sframe">/, 'a guided-focus figure: a 16:9 frame (no crop)');
  assert.match(page.text, /<div class="gf-layer" aria-hidden="true">/, 'the overlay layer is decoration for AT');
  const f0 = SEED_DECK.slides[0].focus;
  assert.match(page.text, new RegExp(`class="gf-box" style="--bx:${f0[0].box[0]};--by:${f0[0].box[1]};left:${f0[0].box[0]}%;top:${f0[0].box[1]}%;width:${f0[0].box[2]}%;height:${f0[0].box[3]}%"`), 'step 1 box geometry in % (plus its --bx/--by badge-anchor vars)');
  assert.match(page.text, /<span class="gf-badge">1<\/span>/, 'numbered badge');
  // The first drawn path in the deck (Bolt's route to the flag): y is scaled into the 100x56.25 viewBox.
  const path = SEED_DECK.slides.flatMap(s => s.focus || []).find(f => f.path).path;
  const r2 = v => Math.round(v * 100) / 100;
  const points = path.map(p => `${r2(p[0])},${r2(p[1] * 0.5625)}`).join(' ');
  assert.ok(page.text.includes(`points="${points}"`), `the polyline points: ${points}`);
  f0.forEach((st, i) => {
    assert.ok(page.text.includes(`<div class="gf-cue"><span class="gf-cue-n">${i + 1}</span>${st.cue}</div>`), `cue chip with its step number: ${st.cue}`);
    assert.ok(page.text.includes(`<li>${st.cue}</li>`), `cue in the figure's list: ${st.cue}`);
  });
  assert.match(page.text, /<button class="gf-replay" type="button" hidden>/, 'replay button (the script unhides it)');
  assert.match(page.text, /<figcaption class="gf-cues"><ol>/, 'the cues as a real list');
});

test('a step whose target sits in the bottom third gets its cue at the top of the picture', async () => {
  writeDeck(d => { d.slides[0].focus = [{ cue: 'The watch pill sits at the very bottom.', box: [11, 94.5, 8.5, 5.3] }]; });
  const kid = newKid(); C.setBand(kid, course, '1b');
  const page = await get('/courses/cs-quest/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('<div class="gf-cue gf-cue--top"><span class="gf-cue-n">1</span>The watch pill sits at the very bottom.</div>'), 'top-placed cue chip with its step number');
  writeDeck(() => {});
});

test('a pictured slide without focus renders the plain figure, no overlay', async () => {
  writeDeck(d => { for (const s of d.slides) delete s.focus; });
  const kid = newKid(); C.setBand(kid, course, '1b');
  const page = await get('/courses/cs-quest/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /<figure class="smedia" style="--ar:1.78;--fhr:0.56">\s*<div class="sframe"><img class="simg"/);
  assert.doesNotMatch(page.text, /gf-layer|gf-replay/);
  writeDeck(() => {});
});
