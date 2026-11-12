// Garden Count (seed-games/garden-count.html): Number Quest Launchpad Unit 1's game, a Kit 2 (Oomba3D) counting
// garden for kindergarten. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between garden-count:begin and garden-count:end): six a chapter, the numbers in the
//     ranges the unit teaches, every answer re-derived from the round's own numbers, the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), numbers included;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, a wrong answer
//     gets a hint and does not advance the round, every instruction is sent to be spoken, and a correct play of all
//     six rounds posts the game-over message (the course step's completion signal) exactly once, not before;
//     then the picture menu with no parameters, the keyboard, a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. GC_SHOTS=<dir> saves screenshots there.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = await import('../../server/services/vendor.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const PP = await import('../../server/services/play-params.js');
const TAGS = await import('../../server/standards/official-tags.js');
const lines = await import('../../server/services/tts-lines.js');
const catalog = await import('../../server/services/course-catalog.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/garden-count.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/garden-count.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const STEPS = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 1).steps;
const CHAPTERS = ['count', 'compare', 'teens'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const GC = (() => {
  const box = {}; vm.runInNewContext(/\/\* garden-count:begin \*\/([\s\S]*?)\/\* garden-count:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.GardenCount;   // plain objects of this realm, so deepEqual can compare them
  return { CHAPTERS: plain(G.CHAPTERS), ROUNDS: G.ROUNDS, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('garden-count').strings.en;
const say = (key, v) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage/, 'no outside address, no network call, no device speech, no local store');
  assert.match(HTML, /start\(\{ theme: 'medieval-village', version: '1\.0\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
});

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the first lap always the same', () => {
  assert.deepEqual([...GC.CHAPTERS], CHAPTERS); assert.equal(GC.ROUNDS, 6);
  assert.equal(GC.round('count', 0, 0), null); assert.equal(GC.round('count', 7, 0), null); assert.equal(GC.round('shapes', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(GC.round(ch, n, 0), GC.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  const COUNT = [[3, 5], [4, 7], [6, 10], [8, 12], [11, 15], [16, 20]];
  const seen = { count: new Set(), same: new Set(), teens: new Set() };
  for (let lap = 0; lap < 200; lap++) {
    for (let n = 1; n <= 6; n++) {
      const c = GC.round('count', n, lap), at = `count ${n} lap ${lap}`;
      assert.ok(c.target >= COUNT[n - 1][0] && c.target <= COUNT[n - 1][1], `${at}: ${c.target} in ${COUNT[n - 1]}`);
      assert.ok(c.total > c.target && c.total <= 24, `${at}: more apples grow (${c.total}) than are asked for (${c.target}), 24 at most`);
      assert.equal(c.answer, c.target); seen.count.add(c.target);

      const m = GC.round('compare', n, lap), am = `compare ${n} lap ${lap}`;
      assert.ok(m.a >= 1 && m.a <= 10 && m.b >= 1 && m.b <= 10, `${am}: ${m.a} and ${m.b} are 1 to 10`);
      assert.equal(m.form, n <= 3 ? 'things' : 'numbers'); assert.equal(m.same, n === 3 || n === 6, `${am}: the same is offered in rounds 3 and 6`);
      assert.equal(m.ask, n === 2 || n === 5 ? 'fewer' : 'more');
      const truth = m.a === m.b ? 'same' : (m.ask === 'more' ? m.a > m.b : m.a < m.b) ? 'a' : 'b';
      assert.equal(m.answer, truth, `${am}: ${m.ask} of ${m.a} and ${m.b}`);
      if (!m.same) assert.notEqual(m.a, m.b, `${am}: with no "same" button the two differ`);
      if (n === 1) assert.ok(Math.abs(m.a - m.b) >= 2, `${am}: the first round's difference is plain to see`);
      if (n === 3) assert.equal(m.answer, 'same', `${am}: the first time the button shows, it is the answer`);
      if (m.same) seen.same.add(m.answer);

      const t = GC.round('teens', n, lap), tn = `teens ${n} lap ${lap}`;
      assert.ok(t.target >= 11 && t.target <= 19, `${tn}: ${t.target} is a teen number`); seen.teens.add(t.target);
      assert.equal(t.kind, n <= 3 ? 'make' : 'howmany');
      if (t.kind === 'howmany') {
        assert.equal(t.choices.length, 3); assert.equal(new Set(t.choices).size, 3, `${tn}: three different numbers`);
        assert.ok(t.choices.includes(t.target), `${tn}: the answer is offered`);
        for (const v of t.choices) assert.ok(v >= 11 && v <= 19 && Math.abs(v - t.target) <= 2, `${tn}: ${v} is a nearby teen number`);
      }
    }
  }
  assert.ok(seen.count.has(3) && seen.count.has(20), 'counting runs from 3 up to 20');
  assert.deepEqual([...seen.same].sort(), ['a', 'b', 'same'], 'round 6 is sometimes the same and sometimes not');
  assert.deepEqual([...seen.teens].sort((a, b) => a - b), [11, 12, 13, 14, 15, 16, 17, 18, 19], 'every teen number comes up');
  assert.deepEqual(GC.params({ chapter: 'teens', lock: 1 }), { chapter: 'teens', lock: true });
  assert.deepEqual(GC.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(GC.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and number is a registered spoken line, short enough for a five-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('garden-count'));
  const ok = text => lines.allowedLine('garden-count', 'en', text);
  for (let n = 0; n <= 20; n++) assert.deepEqual(ok(T[`n.${n}`]), { text: T[`n.${n}`], role: 'friendly' }, `the number word for ${n}`);
  assert.deepEqual([T['n.7'], T['n.11'], T['n.14'], T['n.20']], ['Seven', 'Eleven', 'Fourteen', 'Twenty']);
  for (const [key, v] of [['count.ask', { n: 17 }], ['count.few', { n: 7 }], ['count.now', { n: 7 }], ['count.right', { n: 20 }], ['teens.make', { n: 14 }], ['teens.sum', { a: 10, b: 4, c: 14 }],
    ['teens.few', { n: 12 }], ['teens.now', { n: 12 }], ['compare.right.more', { a: 8, b: 5 }], ['compare.right.fewer', { a: 3, b: 5 }], ['compare.right.less', { a: 3, b: 5 }], ['compare.right.same', { a: 6, b: 6 }]]) {
    assert.ok(ok(say(key, v)), `${key}: "${say(key, v)}" may be spoken`);
  }
  assert.equal(say('teens.sum', { a: 10, b: 4, c: 14 }), '10 and 4 make 14.');
  assert.equal(ok('Pick seven apples and call me.'), null, 'only the game’s own lines');
  // The instructions (what the child is asked to do): one sentence, at most 8 words.
  const asks = ['hero.pick', 'menu.pick', 'count.ask', 'compare.more', 'compare.fewer', 'compare.same', 'compare.num.more', 'compare.num.less', 'compare.num.same', 'teens.make', 'teens.howmany'];
  for (const k of asks) {
    assert.ok(T[k], k);
    assert.equal(T[k].split(/(?<=[.!?])\s+/).length, 1, `${k} is one sentence: ${T[k]}`);
    assert.ok(T[k].split(/\s+/).length <= 8, `${k} is short: ${T[k]}`);
  }
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|ask|hint|speak|right)\('([a-z][a-zA-Z.]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('garden-count'));
  assert.equal(META.slug, 'garden-count'); assert.equal(META.title, 'Garden Count'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'garden-count'), { slug: 'garden-count', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('garden-count'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.GARDEN_CHAPTERS, { count: ['K.CC.A.1', 'K.CC.B.4', 'K.CC.B.5'], compare: ['K.CC.C.6', 'K.CC.C.7'], teens: ['K.NBT.A.1'] });
  assert.deepEqual(TAGS.gameCodes('garden-count', 'ccss-math'), Object.values(TAGS.GARDEN_CHAPTERS).flat());
  assert.deepEqual(STEPS.map(s => s.n), ['1.1', '1.2', '1.3']);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'garden-count'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(GC.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes: its primary codes, then the ones it also touches
    assert.deepEqual(TAGS.stepGameCodes('garden-count', 'ccss-math', 'K', g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('garden-count', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.GC_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Garden Count' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
  const state = () => frame.evaluate(() => window.__gc.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 30_000 });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);

/** One wrong answer for the round on screen (the tap a child might make), then the right play, through the buttons. */
async function wrongThenRight(g, s) {
  const { frame } = g;
  if (s.kind === 'count') {
    await frame.click('#gc-done');                                   // Done with nothing picked
    return async () => { for (let i = 0; i < s.target; i++) await frame.click('#gc-pick'); await frame.click('#gc-done'); };
  }
  if (s.kind === 'compare') {
    await frame.click(s.answer === 'a' ? '#gc-b' : '#gc-a');         // the other bed
    return () => frame.click('#gc-' + s.answer);
  }
  if (s.kind === 'make') {
    await frame.click('#gc-fill'); await frame.click('#gc-done');     // ten alone is not a teen number
    return async () => { for (let i = 10; i < s.target; i++) await frame.click('#gc-one'); await frame.click('#gc-done'); };
  }
  await frame.click('#gc-n' + s.choices.find(v => v !== s.target));   // a nearby number
  return () => frame.click('#gc-n' + s.target);
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong tap does not advance, six right rounds post game over once`, { skip, timeout: 240_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .gc-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__gc.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-count, #menu').length), 0);
    await frame.evaluate(() => window.__gc.fast());   // short pauses between rounds; the taps are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const { chapter: ch, n, ...want } = GC.round(chapter, round, 0);
      assert.deepEqual([ch, n], [chapter, round]);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.ok(asked && asked.length <= 40, `round ${round}: a short instruction on screen (${asked})`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      if (round === 1 || round === 4) await g.shot(`${chapter}-${round}`);
      const play = await wrongThenRight(g, s);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen], [round, 'play', 'play'], `round ${round}: a wrong tap does not advance`);
      assert.ok(await text(frame, '#hint'), `round ${round}: a wrong tap gets a hint`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.gc-btn.no').length), 1, `round ${round}: and a wobble on the button`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await play();
      await until(r => { const t = window.__gc.state(); return t.round > r || t.screen === 'end'; }, round);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .gc-btn')].map(b => b.id)), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('garden-count', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__gc.state().screen === 'play');
    assert.equal((await state()).round, 1);
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; too many apples are handed back, counting down', { skip, timeout: 240_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__gc.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .gc-menu .gc-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-count', 'Pick and Count'], ['ch-compare', 'More or Fewer'], ['ch-teens', 'Ten and More']]);
  await g.shot('menu');
  await frame.click('#ch-count');
  await until(() => window.__gc.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind], ['count', false, 'count']);
  // Tap two too many, then Done: the round stays, the extra apples come back one at a time, and Done then works.
  for (let i = 0; i < s.target + 2; i++) await frame.click('#gc-pick');
  assert.equal(await text(frame, '#num'), String(s.target + 2), 'the big counter shows each apple counted');
  assert.deepEqual((await g.spoken()).slice(-2), [T[`n.${s.target + 1}`], T[`n.${s.target + 2}`]], 'and each number is said');
  await frame.evaluate(() => window.__gc.fast());
  await frame.click('#gc-done');
  assert.equal((await state()).phase, 'busy');
  await until(t => { const x = window.__gc.state(); return x.phase === 'play' && x.count === t; }, s.target);
  assert.equal((await state()).round, 1, 'still the same round');
  assert.equal(await text(frame, '#hint'), say('count.now', { n: s.target }));
  assert.equal(await text(frame, '#num'), String(s.target));
  await frame.click('#gc-done');
  await until(() => window.__gc.state().round === 2);
  assert.equal((await g.msgs('brb:gameover')).length, 0);
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, a 360 px phone and reduced motion: every action is a big button a key can press', { skip, timeout: 240_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Enter and Space on the big buttons.
  const k = await open({ params: 'chapter=teens&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__gc.state().screen === 'play');
  const s = await k.state();
  assert.equal(s.kind, 'make');
  await k.frame.focus('#gc-fill'); await k.p.keyboard.press('Enter');
  assert.equal((await k.state()).count, 10, 'Enter on Fill the ten');
  await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'gc-one');
  for (let i = 10; i < s.target; i++) await k.p.keyboard.press(i % 2 ? 'Enter' : ' ');
  assert.equal((await k.state()).count, s.target, 'Enter and Space on One more');
  assert.equal(await text(k.frame, '#sum'), `10 and ${s.target - 10} make ${s.target}`, 'always shown: ten and some ones make the number');
  await k.frame.evaluate(() => window.__gc.fast());
  await k.frame.focus('#gc-done'); await k.p.keyboard.press(' ');
  await k.until(() => window.__gc.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'gc-fill', 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // A 360 px phone with reduced motion: everything fits, the buttons are big, a wrong tap still shows.
  for (const chapter of CHAPTERS) {
    const m = await open({ params: `chapter=${chapter}&lock=1`, width: 360, height: 640, reducedMotion: 'reduce', touch: true });
    await m.frame.tap('#hero-rogue');
    await m.until(() => window.__gc.state().screen === 'play');
    assert.equal((await m.state()).tall, true, 'the tall layout');
    const fit = await m.frame.evaluate(() => {
      const r = e => e.getBoundingClientRect(), all = [...document.querySelectorAll('#bar .gc-btn, #say, #ask, #dots')].map(r);
      const bs = [...document.querySelectorAll('#bar .gc-btn')].map(r);
      return { inside: all.every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5), small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length,
        overlap: bs.some((a, i) => bs.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)), scroll: document.documentElement.scrollWidth > innerWidth,
        gear: (() => { const a = r(document.getElementById('ask')), q = r(document.querySelector('.o3-gear')); return a.right > q.left && a.bottom > q.top && a.top < q.bottom; })() };
    });
    assert.deepEqual(fit, { inside: true, small: 0, n: fit.n, overlap: false, scroll: false, gear: false }, `${chapter} at 360 px: on screen, big, apart, clear of the gear button`);
    await m.frame.evaluate(() => window.__gc.fast());
    const st = await m.state();
    await (await wrongThenRight(m, st))();
    await m.until(() => window.__gc.state().round === 2);
    await m.shot(`${chapter}-360`);
    assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
    await m.ctx.close();
  }
});
