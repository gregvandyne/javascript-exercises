// Lily Hop (seed-games/lily-hop.html): Number Quest Launchpad Unit 2's game, a Kit 2 (Oomba3D) pond of lily pads
// for kindergarten and grade 1. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between lily-hop:begin and lily-hop:end): six a chapter, the numbers in the ranges
//     the unit teaches, every answer re-derived from the round's own numbers, three number pads with the answer
//     among them, the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), and the sums it
//     shows with a "?" in them are never sent to be spoken;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, a wrong answer
//     gets a hint and does not advance the round, every instruction is sent to be spoken, and a correct play of all
//     six rounds posts the game-over message (the course step's completion signal) exactly once, not before;
//     then the picture menu with no parameters and a tap on a pad in the pond itself, the keyboard, a 360 px phone
//     and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. LH_SHOTS=<dir> saves screenshots there.
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
const { SHELF_INFO } = await import('../../server/learn.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/lily-hop.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/lily-hop.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 2), STEPS = UNIT.steps;
const CHAPTERS = ['join', 'apart', 'twenty'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const LH = (() => {
  const box = {}; vm.runInNewContext(/\/\* lily-hop:begin \*\/([\s\S]*?)\/\* lily-hop:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.LilyHop;   // plain objects of this realm, so deepEqual can compare them
  return { CHAPTERS: plain(G.CHAPTERS), ROUNDS: G.ROUNDS, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('lily-hop').strings.en;
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
  assert.match(HTML, /start\(\{ theme: 'sky-islands', version: '1\.0\.1', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Sky Islands, and the sea is the library's own
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/sky-islands')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.1');
  assert.match(HTML, /W\.water\(\{/);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|game over!)\b/i, 'no timer, no lives, no losing');
});

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the first lap always the same', () => {
  assert.deepEqual([...LH.CHAPTERS], CHAPTERS); assert.equal(LH.ROUNDS, 6);
  assert.equal(LH.round('join', 0, 0), null); assert.equal(LH.round('join', 7, 0), null); assert.equal(LH.round('shapes', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(LH.round(ch, n, 0), LH.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  const JOIN = [[2, 4], [4, 6], [6, 8], [8, 10]], TEN = [[7, 9], [4, 6], [1, 3]];
  const seen = { join: new Set(), left: new Set(), ten: new Set(), sums: new Set(), diffs: new Set(), wholes: new Set() };
  /** Three different numbers, smallest first, the answer among them, all near it and inside [lo, hi]. */
  const pads = (r, lo, hi, at) => {
    assert.equal(r.choices.length, 3, at); assert.deepEqual([...r.choices].sort((a, b) => a - b), r.choices, `${at}: smallest first`); assert.equal(new Set(r.choices).size, 3, `${at}: three different numbers`);
    assert.ok(r.choices.includes(r.answer), `${at}: the answer is offered`);
    for (const v of r.choices) assert.ok(Number.isInteger(v) && v >= lo && v <= hi && Math.abs(v - r.answer) <= 2, `${at}: ${v} is a number near ${r.answer}, ${lo} to ${hi}`);
  };
  for (let lap = 0; lap < 200; lap++) {
    for (let n = 1; n <= 6; n++) {
      // join: two groups put together (rounds 1-4), then some hop away (5-6), all within 10
      const j = LH.round('join', n, lap), at = `join ${n} lap ${lap}`;
      assert.equal(j.kind, n <= 4 ? 'join' : 'away', at);
      if (j.kind === 'join') {
        assert.ok(j.a >= 1 && j.b >= 1, `${at}: two groups, each with a frog`); assert.equal(j.answer, j.a + j.b, `${at}: ${j.a} and ${j.b}`);
        assert.ok(j.answer >= JOIN[n - 1][0] && j.answer <= JOIN[n - 1][1], `${at}: ${j.answer} in ${JOIN[n - 1]}`); seen.join.add(j.answer); pads(j, 1, 10, at);
      } else {
        assert.ok(j.a <= 10 && j.b >= 1 && j.b < j.a, `${at}: ${j.b} of ${j.a} hop away, some stay`); assert.equal(j.answer, j.a - j.b, `${at}: ${j.a} take away ${j.b}`);
        assert.ok(n === 5 ? j.a >= 4 && j.a <= 6 : j.a >= 7 && j.a <= 10, `${at}: starts from ${j.a}`); seen.left.add(j.answer); pads(j, 0, 10, at);
      }
      // apart: one number in two parts (rounds 1-3), then the partner that makes ten (4-6)
      const p = LH.round('apart', n, lap), ap = `apart ${n} lap ${lap}`;
      assert.equal(p.kind, n <= 3 ? 'split' : 'ten', ap);
      assert.equal(p.a + p.b, p.whole, `${ap}: ${p.whole} is ${p.a} and ${p.b}`); assert.equal(p.answer, p.b); assert.ok(p.a >= 1 && p.b >= 1, `${ap}: two real parts`);
      if (p.kind === 'split') { assert.ok(n < 3 ? p.whole >= 4 && p.whole <= 6 : p.whole >= 7 && p.whole <= 9, `${ap}: splits ${p.whole}`); seen.wholes.add(p.whole); pads(p, 1, p.whole, ap); }
      else { assert.equal(p.whole, 10); assert.ok(p.a >= TEN[n - 4][0] && p.a <= TEN[n - 4][1], `${ap}: ${p.a} in ${TEN[n - 4]}`); seen.ten.add(p.a); pads(p, 1, 9, ap); }
      // twenty: hops on a number line, forward and back, within 20
      const t = LH.round('twenty', n, lap), tw = `twenty ${n} lap ${lap}`;
      assert.equal(t.kind, 'hop'); assert.equal(t.op, n === 4 || n === 5 ? 'sub' : 'add', tw);
      assert.equal(t.answer, t.op === 'add' ? t.a + t.b : t.a - t.b, `${tw}: ${t.a} ${t.op} ${t.b}`);
      assert.ok(t.a >= 0 && t.a <= 20 && t.b >= 2 && t.answer >= 0 && t.answer <= 20, `${tw}: within 20`);
      assert.equal(t.cross, (t.a < 10 && t.answer > 10) || (t.a > 10 && t.answer < 10), `${tw}: whether the hops pass ten`);
      assert.equal(t.cross, n !== 1 && n !== 4, `${tw}: rounds 2, 3, 5 and 6 pass ten; 1 and 4 do not`);
      if (n === 1) assert.equal(t.a, 10, `${tw}: the first round starts on ten`);
      if (n === 4) assert.ok(t.a > 10 && t.answer >= 10, `${tw}: stays in the teens`);
      assert.ok(Math.abs(t.b) <= 8, `${tw}: at most 8 hops, so the pads fit a phone`);
      (t.op === 'add' ? seen.sums : seen.diffs).add(t.answer); pads(t, 0, 20, tw);
    }
    // rounds 1 and 2 of apart split the SAME number two different ways (K.OA.A.3: in more than one way)
    const s1 = LH.round('apart', 1, lap), s2 = LH.round('apart', 2, lap);
    assert.equal(s1.whole, s2.whole, `apart lap ${lap}: rounds 1 and 2 split the same number`);
    assert.notDeepEqual([s1.a, s1.b].sort(), [s2.a, s2.b].sort(), `apart lap ${lap}: ${s1.whole} is split two different ways`);
    // round 3 of twenty is round 2 turned round: the same two numbers, the same answer (1.OA.B.3)
    const a2 = LH.round('twenty', 2, lap), a3 = LH.round('twenty', 3, lap);
    assert.deepEqual([a3.a, a3.b, a3.answer, a3.turn], [a2.b, a2.a, a2.answer, true], `twenty lap ${lap}: round 3 turns round 2 round`);
    assert.notEqual(a2.a, a2.b, `twenty lap ${lap}: the two numbers differ, so turning them shows`);
    for (const n of [1, 2, 4, 5, 6]) assert.equal(LH.round('twenty', n, lap).turn, undefined);
  }
  assert.deepEqual([...seen.join].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10], 'putting together reaches every total from 2 to 10');
  assert.deepEqual([Math.min(...seen.left), Math.max(...seen.left)], [2, 8], 'taking away leaves from 2 to 8');
  assert.deepEqual([...seen.wholes].sort((a, b) => a - b), [4, 5, 6, 7, 8, 9], 'every number from 4 to 9 is split');
  assert.deepEqual([...seen.ten].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'every number from 1 to 9 meets its partner to ten');
  assert.ok(Math.min(...seen.sums) >= 11 && Math.max(...seen.sums) <= 20 && Math.min(...seen.diffs) >= 4 && Math.max(...seen.diffs) <= 17, 'adding lands in the teens; taking away lands on both sides of ten');
  assert.deepEqual(LH.params({ chapter: 'twenty', lock: 1 }), { chapter: 'twenty', lock: true });
  assert.deepEqual(LH.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(LH.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and answer line is a registered spoken line, short enough for a five-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('lily-hop'));
  const ok = text => lines.allowedLine('lily-hop', 'en', text);
  const NUMS = { a: 8, b: 5, c: 13, n: 5, m: 6 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.ok(spoken.length >= 25);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // the sums on screen (a "?" may stand in them) and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(say('join.sum', { a: 3, b: 2, c: 5 }), '3 and 2 make 5.'); assert.equal(say('split.sum', { n: 5, a: 2, b: 3 }), '5 is 2 and 3.');
  assert.equal(say('ten.sum', { a: 7, b: 3 }), '7 and 3 make 10.'); assert.equal(say('add.ask', { a: 8, b: 5 }), 'Start on 8. Hop on 5.');
  assert.equal(say('add.ten', { a: 8, b: 2 }), '8 and 2 make 10.'); assert.equal(say('add.more', { b: 3, c: 13 }), '3 more makes 13.');
  assert.equal(say('add.turn', { a: 5, b: 8 }), '5 and 8 is the same as 8 and 5.'); assert.equal(say('sub.sum', { a: 13, b: 5, c: 8 }), '13 take away 5 is 8.');
  assert.equal(say('show.add', { a: 8, b: 5, c: '?' }), '8 + 5 = ?'); assert.equal(say('show.sub', { a: 13, b: 5, c: 8 }), '13 − 5 = 8');
  assert.equal(ok('Hop to seven and call me.'), null, 'only the game’s own lines');
  // The instructions (what the child is asked to do): at most two sentences, 8 words in all.
  const asks = ['hero.pick', 'menu.pick', 'join.ask', 'away.ask', 'split.ask', 'ten.ask', 'add.ask', 'sub.ask'];
  for (const k of asks) {
    assert.ok(T[k], k);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`);
    assert.ok(T[k].split(/\s+/).length <= 8, `${k} is short: ${T[k]}`);
  }
  // No spoken line is long: 10 words at most.
  for (const k of spoken) assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak|right|sum)\('([a-z][a-zA-Z.]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const k of ['join', 'away', 'split', 'ten']) for (const part of ['ask', 'hint', 'sum']) assert.ok(T[`${k}.${part}`], `${k}.${part}`);
  for (const op of ['add', 'sub']) for (const part of ['ask', 'hint', 'hint.ten', 'ten', 'more', 'sum']) assert.ok(T[`${op}.${part}`], `${op}.${part}`);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('lily-hop'));
  assert.equal(META.slug, 'lily-hop'); assert.equal(META.title, 'Lily Hop'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1);
  assert.deepEqual(SHELF_INFO['lily-hop'], SHELF_INFO['garden-count'], 'on the Learn shelf as math for kindergarten to grade 1, like Garden Count');
  for (const f of ['public/covers/lily-hop.jpg', 'public/og/lily-hop.jpg', 'scripts/covers/lily-hop.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'lily-hop'), { slug: 'lily-hop', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('lily-hop'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.LILY_CHAPTERS, { join: ['K.OA.A.1', 'K.OA.A.2'], apart: ['K.OA.A.3', 'K.OA.A.4'], twenty: ['1.OA.C.6', '1.OA.B.3'] });
  assert.deepEqual(TAGS.gameCodes('lily-hop', 'ccss-math'), Object.values(TAGS.LILY_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('lily-hop'));
  assert.equal(UNIT.title, 'The Joining Pond'); assert.equal(UNIT.stamp, 'Joining Seed'); assert.equal(UNIT.tool, 'lily-hop');
  assert.deepEqual(STEPS.map(s => s.n), ['2.1', '2.2', '2.3']);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'lily-hop'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(LH.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names: its primary codes,
    // then the ones it also touches
    for (const grade of ['K', '1', '']) assert.deepEqual(TAGS.stepGameCodes('lily-hop', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('lily-hop', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('lily-hop', 'ccss-math', '1', ''), ['1.OA.C.6', '1.OA.B.3'], 'an unlocked grade 1 step claims only the grade 1 chapter');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.LH_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Lily Hop' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__lh.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 30_000 });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
/** The sum the game shows for a round, with "?" for the answer while it is asked. */
const shown = (s, found) => {
  const q = found ? s.answer : '?';
  return { join: `${s.a} and ${s.b} make ${q}`, away: `${s.a} take away ${s.b} is ${q}`, split: `${s.whole} is ${s.a} and ${q}`, ten: `${s.a} and ${q} make 10`, hop: `${s.a} ${s.op === 'add' ? '+' : '−'} ${s.b} = ${q}` }[s.kind];
};

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong pad does not advance, six right rounds post game over once`, { skip, timeout: 300_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .lh-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five Garden Count offers)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__lh.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-join, #menu').length), 0);
    await frame.evaluate(() => window.__lh.fast());   // short pauses between rounds; the taps are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const { chapter: ch, n, ...want } = LH.round(chapter, round, 0);
      assert.deepEqual([ch, n], [chapter, round]);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.ok(asked && asked.length <= 40, `round ${round}: a short instruction on screen (${asked})`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), shown(s, false), `round ${round}: the sum on screen, with ? for the answer`);
      assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .lh-btn')].map(b => [b.id, b.textContent])), s.choices.map(v => [`lh-n${v}`, String(v)]), `round ${round}: one big button for each number pad`);
      for (const v of s.choices) assert.ok(s.pads.includes(v), `round ${round}: pad ${v} is in the pond`);
      if (round === 1 || round === 4) await g.shot(`${chapter}-${round}`);
      // a wrong pad: a hint and a wobble, the same round, nothing reported
      await frame.click('#lh-n' + s.choices.find(v => v !== s.answer));
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen], [round, 'play', 'play'], `round ${round}: a wrong pad does not advance`);
      const hintKey = s.kind === 'hop' ? `${s.op}.hint${s.cross ? '.ten' : ''}` : `${s.kind}.hint`;
      assert.equal(await text(frame, '#hint'), say(hintKey, { a: s.a }), `round ${round}: a wrong pad gets the round’s hint`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.lh-btn.no').length), 1, `round ${round}: and a wobble on the button`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      // the right pad
      await frame.click('#lh-n' + s.answer);
      await until(r => { const t = window.__lh.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      // what is true is said: the whole sum, and over ten the two steps by way of ten; the turned-round round says so
      if (s.kind === 'join') assert.ok(said.includes(`${s.a} and ${s.b} make ${s.answer}.`));
      if (s.kind === 'away') assert.ok(said.includes(`${s.a} take away ${s.b} is ${s.answer}.`));
      if (s.kind === 'split') assert.ok(said.includes(`${s.whole} is ${s.a} and ${s.b}.`));
      if (s.kind === 'split' && round === 2) assert.ok(said.includes(`There is more than one way to make ${s.whole}.`), 'the second split of the same number says there is more than one way');
      if (s.kind === 'ten') assert.ok(said.includes(`${s.a} and ${s.b} make 10.`));
      if (s.kind === 'hop' && s.op === 'add') assert.ok(said.includes(`${s.a} and ${s.b} make ${s.answer}.`), `round ${round}: the sum is said`);
      if (s.kind === 'hop' && s.op === 'sub') assert.ok(said.includes(`${s.a} take away ${s.b} is ${s.answer}.`), `round ${round}: the difference is said`);
      if (s.kind === 'hop' && s.cross && s.op === 'add') { assert.ok(said.includes(`${s.a} and ${10 - s.a} make 10.`), `round ${round}: making ten is said`); assert.ok(said.includes(`${s.answer - 10} more makes ${s.answer}.`), `round ${round}: and the hops after ten`); }
      if (s.kind === 'hop' && s.cross && s.op === 'sub') { assert.ok(said.includes(`${s.a} take away ${s.a - 10} is 10.`), `round ${round}: back to ten is said`); assert.ok(said.includes(`Take away ${10 - s.answer} more. That is ${s.answer}.`), `round ${round}: and the hops after ten`); }
      if (s.turn) assert.ok(said.includes(`${s.a} and ${s.b} is the same as ${s.b} and ${s.a}.`), 'turning the two numbers round is said');
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .lh-btn')].map(b => b.id)), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('lily-hop', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__lh.state().screen === 'play');
    assert.equal((await state()).round, 1);
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; a tap on a pad in the pond is the answer; the helper really hops', { skip, timeout: 300_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__lh.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .lh-menu .lh-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-join', 'Hop Together'], ['ch-apart', 'Number Partners'], ['ch-twenty', 'Hop to 20']]);
  await g.shot('menu');
  await frame.click('#ch-twenty');
  await until(() => window.__lh.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.at], ['twenty', false, 'hop', 'home']);
  assert.ok(s.pads.length >= 12 && s.pads.includes(10) && s.pads.includes(s.a) && s.pads.includes(s.answer), 'a wide screen shows a long run of the number line, ten on it');
  // The pond itself: a tap on a wrong pad of the number line hints, a tap on the right pad is the answer.
  const tap = async v => { const [x, y] = await frame.evaluate(n => window.__lh.spot(n), v); await g.p.mouse.click(x, y); };
  await tap(s.answer + 1);
  assert.deepEqual([(await state()).phase, (await state()).round], ['play', 1]);
  assert.equal(await text(frame, '#hint'), say('add.hint', { a: s.a }));
  // the helper is drawn where the round starts, then hops pad by pad to the answer (its feet leave the pad on the way)
  const heroX = () => frame.evaluate(() => window.__lh.heroAt());
  const start = await heroX();
  await tap(s.answer);
  assert.equal((await state()).phase, 'right');
  let high = 0; for (let i = 0; i < 40 && (await state()).round === 1; i++) { const h = await heroX(); high = Math.max(high, h[1]); await g.p.waitForTimeout(50); }
  assert.ok(high > 0.4, `the helper hops (it rose ${high.toFixed(2)} above its pad)`);
  await until(() => window.__lh.state().round === 2);
  assert.equal(start[1], 0, 'it stood on its pad before the tap');
  assert.equal((await g.msgs('brb:gameover')).length, 0);
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, a 360 px phone and reduced motion: every answer is a big button a key can press', { skip, timeout: 300_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the number buttons.
  const k = await open({ params: 'chapter=apart&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__lh.state().screen === 'play');
  const s = await k.state();
  assert.equal(s.kind, 'split');
  await k.frame.evaluate(() => window.__lh.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus('#lh-n' + wrong); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), T['split.hint'], 'Enter on a wrong number: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus('#lh-n' + s.choices[0]);
  for (let i = 0; i < s.choices.indexOf(s.answer); i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'lh-n' + s.answer, 'Tab walks the number buttons in order');
  await k.p.keyboard.press(' ');
  assert.equal(await text(k.frame, '#sum'), `${s.whole} is ${s.a} and ${s.b}`, 'Space on the right number: the sum is filled in');
  await k.until(() => window.__lh.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^lh-n\d+$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // A 360 px phone with reduced motion: everything fits, the buttons are big, a wrong tap still shows.
  for (const chapter of CHAPTERS) {
    const m = await open({ params: `chapter=${chapter}&lock=1`, width: 360, height: 640, reducedMotion: 'reduce', touch: true });
    await m.frame.tap('#hero-rogue');
    await m.until(() => window.__lh.state().screen === 'play');
    const st = await m.state();
    assert.equal(st.tall, true, 'the tall layout');
    const fit = await m.frame.evaluate(() => {
      const r = e => e.getBoundingClientRect(), all = [...document.querySelectorAll('#bar .lh-btn, #say, #ask, #sum, #dots')].map(r);
      const bs = [...document.querySelectorAll('#bar .lh-btn')].map(r);
      const st = window.__lh.state(), spots = st.pads.map(v => window.__lh.spot(v)), top = r(document.getElementById('line')).bottom, bottom = r(document.getElementById('bar')).top;
      return { inside: all.every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5), small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length,
        overlap: bs.some((a, i) => bs.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)), scroll: document.documentElement.scrollWidth > innerWidth,
        gear: (() => { const a = r(document.getElementById('ask')), q = r(document.querySelector('.o3-gear')); return a.right > q.left && a.bottom > q.top && a.top < q.bottom; })(),
        // every pad of the round is drawn on the screen, between the words and the buttons
        pads: spots.every(([x, y]) => x > 8 && x < innerWidth - 8 && y > top && y < bottom) };
    });
    assert.deepEqual(fit, { inside: true, small: 0, n: 3, overlap: false, scroll: false, gear: false, pads: true }, `${chapter} at 360 px: on screen, big, apart, clear of the gear button, every pad in view`);
    await m.frame.evaluate(() => window.__lh.fast());
    await m.frame.tap('#lh-n' + st.choices.find(v => v !== st.answer));
    assert.equal(await m.frame.evaluate(() => { const b = document.querySelector('.lh-btn.no'); return b ? getComputedStyle(b).outlineStyle : null; }), 'dashed', `${chapter}: with reduced motion a wrong tap shows as a dashed outline`);
    assert.equal((await m.state()).round, 1);
    await m.frame.tap('#lh-n' + st.answer);
    await m.until(() => window.__lh.state().round === 2);
    await m.shot(`${chapter}-360`);
    assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
    await m.ctx.close();
  }
});
