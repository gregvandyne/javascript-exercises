// The course engine's fix round (views/courses.js, services/courses.js, routes/courses.js): the picture crop
// contract (`view`, boxes and paths remapped from original-picture %), diagrams sized to their content, the
// `shapes` visual and the tiles' swapped pairs, the first-time deck (`slides_first_time`), the map's "Start
// here" group, staff "Preview", the locked-step note, subtitles that never break inside "· grades 3–8", and
// Tally's wrong-answer line (kid phrases in a few frames, Tally's plain line otherwise).
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
const V = await import('../../server/views/courses.js');
const { kidPhrase } = await import('../../server/routes/courses.js');

// CS Quest from a temp deck dir holding the real 1b-1.1 deck, its first slide given a crop.
const SEED_DECK = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/cs-quest/course/1b/1.1.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-decks-'));
for (const b of ['1b', '2']) fs.mkdirSync(path.join(tmp, b), { recursive: true });
function writeDeck(mutate) {
  const d = JSON.parse(JSON.stringify(SEED_DECK));
  mutate(d);
  fs.writeFileSync(path.join(tmp, '1b', '1.1.json'), JSON.stringify(d));
  C.reload();
}
writeDeck(() => {});
C.useDeckDir(tmp);
seed({ quiet: true });
const csq = C.getCourse('cs-quest'), cd = C.getCourse('cyber-defenders');
let server, base, n = 0;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0', cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const newUser = (extra = {}) => auth.createUser({ username: `eng${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid', ...extra });

test('crop: a valid view passes, boxes and paths are remapped from original-picture % into the frame', () => {
  writeDeck(d => { d.slides[0].view = [10, 20, 50, 60]; });
  const s = C.getStep(csq, '1b-1.1').slides[0];
  assert.deepEqual(s.view, [10, 20, 50, 60]);
  assert.deepEqual(C.deckProblems('1b').filter(p => p.includes('view')), C.viewMisses(s).map(m => `1b-1.1: slide 1 ${m}`));
  const f = V.frameOf(s);
  assert.equal(f.fh, 67.5, 'frame height per 100 of width: 56.25 * 60 / 50');
  assert.deepEqual(V.boxIn(f, [10, 20, 50, 60]), [0, 0, 100, 100], 'the view itself fills the frame');
  assert.deepEqual(V.boxIn(f, [35, 50, 10, 6]), [50, 50, 20, 10]);
  assert.deepEqual(V.boxIn(f, [0, 0, 20, 30]), [0, 0, 20, 16.67], 'clamped to the frame');
  // Malformed views are dropped (whole picture) and reported.
  for (const bad of [[0, 0, 10, 50], [60, 0, 50, 50], 'all', [1, 2, 3]]) {
    writeDeck(d => { d.slides[0].view = bad; });
    assert.equal(C.getStep(csq, '1b-1.1').slides[0].view, undefined, JSON.stringify(bad));
    assert.ok(C.deckProblems('1b').some(p => p.includes('slide 1 view was dropped')), JSON.stringify(bad));
  }
  writeDeck(() => {});
});

test('crop: a focus box outside the view is a deck problem', () => {
  assert.deepEqual(C.viewMisses({ view: [0, 0, 50, 50], focus: [{ cue: 'x', box: [10, 10, 20, 20] }] }), []);
  assert.equal(C.viewMisses({ view: [0, 0, 50, 50], focus: [{ cue: 'x', box: [40, 10, 20, 20] }] }).length, 1);
  assert.equal(C.viewMisses({ view: [0, 0, 50, 50], focus: [{ cue: 'x', box: [10, 10, 20, 20], path: [[10, 10], [80, 10]] }] }).length, 1);
});

test('crop: the step page draws the region at the frame\'s aspect, the remapped tour and the whole-picture viewer', async () => {
  writeDeck(d => { d.slides[0].view = [0, 20, 50, 80]; d.slides[0].focus = [{ cue: 'Bolt starts here.', box: [10, 40, 10, 20], path: [[10, 40], [30, 60]] }]; });
  const kid = newUser(); C.setBand(kid, csq, '1b');
  const page = await get('/courses/cs-quest/1b-1.1', kid);
  assert.equal(page.status, 200);
  assert.match(page.text, /<figure class="smedia gf crop" style="--ar:1.11;--fhr:0.9" data-gf>/, 'frame aspect = 50*1280 : 80*720');
  assert.match(page.text, /<img class="simg simg--crop" [^>]*style="width:200%;height:125%;left:0%;top:-25%"/, 'the picture scaled and shifted so the view fills the frame');
  assert.match(page.text, /class="gf-box" style="--bx:20;--by:25;left:20%;top:25%;width:20%;height:25%"/, 'the box in frame %');
  assert.ok(page.text.includes('<svg class="gf-path" viewBox="0 0 100 90" preserveAspectRatio="none"><polyline points="20,22.5 60,45"'), 'the path in the frame\'s own SVG space');
  assert.ok(page.text.includes('vector-effect="non-scaling-stroke"'));
  assert.match(page.text, /<a class="szoom" href="\/img\/csq\/[^"]+\.webp" data-zoom aria-label="See the whole picture">/, 'the whole picture, a plain link without the script');
  assert.match(page.text, /<dialog class="szoom-dlg" id="szoom"/, 'the viewer dialog');
  assert.match(page.text, /<div class="gf-strip" aria-hidden="true"><p class="gf-sc" data-i="0">/, 'the caption strip (used when no chip spot is clear)');
  writeDeck(() => {});
  const plain = await get('/courses/cs-quest/1b-1.1', kid);
  assert.doesNotMatch(plain.text, /szoom/, 'no crop, no viewer');
});

test('diagrams: the frame is the drawing\'s content band; boxes stay in the drawing\'s 100 x 56.25 coordinates', () => {
  const v = { type: 'bars', label: 'x', rows: [{ label: 'One whole, two parts', parts: [{ w: 0.6, label: 'a', tone: 0 }, { w: 0.4, label: '', unknown: true }] }] };
  const [y0, y1] = V.visualFit(v, []);
  assert.ok(y0 > 5 && y1 < 40 && y1 - y0 >= 22.7, `one bar row: a short band, not the whole 56.25 (${y0}-${y1})`);
  const f = V.frameOf({ visual: v, focus: [{ cue: 'c', box: [6, 45, 88, 20] }] });
  assert.equal(f.y0, V.visualFit(v, [{ box: [6, 45, 88, 20] }])[0]);
  // A box at the drawing's y 25.3 (45%) sits at (25.3 - y0) / fh of the frame.
  const b = V.boxIn(f, [6, 45, 88, 20]);
  assert.ok(Math.abs(b[1] - (45 * 0.5625 - f.y0) / f.fh * 100) < 0.02);
  assert.ok(Math.abs(b[3] - 20 * 0.5625 / f.fh * 100) < 0.02);
});

test('diagrams: shapes are drawn shapes with their names, tiles mark several swapped tiles and share one text size', () => {
  writeDeck(d => {
    d.slides[1].visual = { type: 'shapes', label: 'Four quadrilaterals', items: [{ shape: 'square', name: 'square', corners: true }, { shape: 'rhombus', name: 'rhombus' }, { shape: 'trapezoid', name: 'trapezoid' }, { shape: 'parallelogram', name: 'parallelogram' }] };
    d.slides[2].visual = { type: 'tiles', label: 'Two tiles swapped', values: ['12 seeds', '9:05', '3', '4'], bad: [0, 1] };
    d.slides[3].visual = { type: 'shapes', label: 'bad', items: [{ shape: 'blob', name: 'blob' }, { shape: 'square', name: 'square' }] };
    delete d.slides[1].img; delete d.slides[2].img; delete d.slides[3].img;
    for (const i of [1, 2, 3]) delete d.slides[i].focus;
  });
  const sl = C.getStep(csq, '1b-1.1').slides;
  assert.equal(sl[1].visual.items.length, 4);
  assert.deepEqual(sl[2].visual.bad, [0, 1]);
  assert.equal(sl[3].visual, undefined, 'an unknown shape drops the visual');
  assert.ok(C.VISUAL_TYPES.includes('shapes'));
  const html = String(V.stepPage({ course: csq, s: C.stateOf(null, csq, '1b-1.1'), total: 19, next: null, seed: 'x', result: null, signedIn: false }));
  const shapes = html.slice(html.indexOf('id="slide-2"'), html.indexOf('id="slide-3"'));
  assert.equal((shapes.match(/<polygon /g) || []).length, 4, 'four drawn outlines');
  assert.ok(/<path d="M[^"]+" fill="none" stroke="#141414" stroke-width="0.5"\/>/.test(shapes), 'right-angle marks in the square');
  const tiles = html.slice(html.indexOf('id="slide-3"'), html.indexOf('id="slide-4"'));
  assert.equal((tiles.match(/swapped!/g) || []).length, 2, 'both swapped tiles are marked');
  const sizes = [...tiles.matchAll(/<text [^>]*font-size="([\d.]+)"[^>]*>(12 seeds|9:05|3|4)</g)].map(m => m[1]);
  assert.equal(sizes.length, 4); assert.equal(new Set(sizes).size, 1, `one text size for the strip: ${sizes}`);
  writeDeck(() => {});
});

test('the first-time deck: a Pro kid who finished no Explorer step reads slides_first_time', () => {
  const step = { band: '2', slides: [{ title: 'Welcome back' }], slidesFirstTime: [{ title: 'Welcome' }] };
  const fresh = newUser();
  assert.equal(C.slidesFor(fresh, cd, step)[0].title, 'Welcome');
  assert.equal(C.slidesFor(null, cd, step)[0].title, 'Welcome');
  assert.equal(C.slidesFor(fresh, cd, { band: '2', slides: [{ title: 'Only' }] })[0].title, 'Only');
  const vet = newUser();
  const first = C.steps(cd, '1b')[0];
  C.markRead(vet, cd, first); C.recordCheck(vet, cd, first, { score: 3, passed: true });
  if (first.game) { C.markPlayed(vet, cd, first); C.markCompleted(vet, cd, first); }
  assert.equal(C.slidesFor(vet, cd, step)[0].title, 'Welcome back', 'a kid who walked Explorer gets the year-later deck');
});

test('the map: a "Start here" group, one icon style, Preview for staff, and the locked-step note', async () => {
  const kid = newUser(); C.setBand(kid, csq, '1b');
  const r = await get('/courses/cs-quest/1b-1.2', kid);
  assert.equal(r.location, '/courses/cs-quest?locked=1b-1.2#step-1b-1.2');
  const map = await get(r.location.replace(/#.*/, ''), kid);
  assert.match(map.text, /id="cmap-locked"[^>]*>.*Finish step 1 first:/s, 'the note names the step to finish');
  assert.doesNotMatch((await get('/courses/cs-quest', kid)).text, /id="cmap-locked"/, 'no note without the redirect');
  assert.match(map.text, /<span class="cmap-k cmap-k2"><span class="cmap-kl">🎮 Game module<\/span><span class="cmap-gm" lang="en" dir="ltr">Sequences<\/span><\/span>/, 'label and chapter on two lines, no dangling dot');
  assert.doesNotMatch(map.text, /class="coverart/, 'unit headers are emoji tiles, never a game cover');
  const admin = newUser({ role: 'admin' }); C.setBand(admin, csq, '1b');
  const am = await get('/courses/cs-quest', admin);
  assert.match(am.text, /cstate-preview/, 'staff see Preview');
  assert.doesNotMatch(am.text.slice(am.text.indexOf('id="step-1b-1.2"')), /cstate-next/, 'not Next on every lesson');
});

test('subtitles keep "· grades 3–8" together; the en strings say "Math"', () => {
  assert.equal(String(V.subLine('Computer science in four games · grades 3–8')), '<span class="sub-a">Computer science in four games</span> <span class="sub-b"><span class="sub-dot">· </span>grades 3–8</span>');
  assert.equal(String(V.subLine('No dot here')), 'No dot here');
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));
  assert.equal(en.courses.nq.sub, 'Math through the Numberworks · grades 3–5');
});

test('Tally\'s wrong-answer line: kid phrases in a frame, anything else gets her plain line', () => {
  for (const ok of ['added the sides instead of multiplying', 'forgot to carry the ten', 'grabbed a near fact: 6 x 9', 'cut the rope into 3 pieces, not 4', 'never traded 60 minutes for an hour'])
    assert.equal(kidPhrase(ok), ok, ok);
  for (const no of ['correct', 'place-from-other-course', 'off_by_one', 'units?', 'a place from another course', 'Confuses tens', ''])
    assert.equal(kidPhrase(no), '', no);
});
