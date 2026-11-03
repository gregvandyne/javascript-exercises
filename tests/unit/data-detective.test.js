// Data Detective (seed-games/data-detective.html): the cases and the pure case engine read from the game file, and the
// game itself in real Chromium inside the production frame wrapper (kit served from disk). Every case is solved by its
// own tap script with three stars, has exactly one supported claim, its learn card / hints / Case-closed check, CSTA ids
// that exist, and every English word is in the language-pack master list. The Chromium part plays level 1 of two chapters
// through __brbTest, checks the progress label grammar, the quest-code keypad and lock semantics, and renders at phone
// and desktop sizes in English and Arabic with no console errors. Needs a local Chromium; those tests skip without one.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/data-detective.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/data-detective.json'), 'utf8'));
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
const { scanVersion } = await import('../../server/services/scanner.js');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');

const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const LV = ctx.window.DataDetectiveLevels, E = ctx.window.DataDetectiveEngine;
const { CHAPTERS, LEVELS } = LV;
const BUILT = ['sort', 'chart', 'claims', 'cleanup'];   // stage 1; models, fair and my-data land next

test('data-detective: kit 1.1.2 byte-exact tags, the scanner passes, the metadata is right', () => {
  assert.ok(HTML.startsWith('<title>Data Detective</title>'));
  assert.ok(HTML.includes(kitTag()), 'the exact kit tag');
  for (const p of ['art-props', 'dress', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `the exact ${p} pack tag`);
  assert.equal(scanVersion(HTML).status, 'pass');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.doesNotMatch(HTML, /<input[^>]*type=["']?(text|search|email|number|tel|url)/i, 'no text inputs anywhere');
  assert.doesNotMatch(HTML, /<textarea|contenteditable/i, 'nothing to type into');
  assert.doesNotMatch(HTML.slice(HTML.indexOf('<script type="module">')), /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bDate\.now\b|\brequestAnimationFrame\b/, 'the kit clocks only');
  assert.match(HTML, /PACK_VER = '/); assert.match(HTML, /PACK_SRI = \{/); assert.match(HTML, /CsqPacks/);
  assert.equal(META.slug, 'data-detective'); assert.equal(META.category, 'learning'); assert.equal(META.featured, true);
  assert.equal(META.orientation, 'any'); assert.equal(META.age_rating, 'everyone'); assert.equal(META.players_max, 2); assert.equal(META.cover, 'ocean');
  assert.ok(META.description.length <= 600);
});

test('data-detective: the 11 non-English descriptions in the JSON l10n', { skip: !Object.keys(META.l10n || {}).length && 'l10n lands with the translation stage' }, () => {
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(META.l10n[l] && META.l10n[l].description, `description in ${l}`);
});

test('data-detective: the chapter table matches the contract (ids, indices, counts, bands, CSTA ids)', () => {
  assert.equal(JSON.stringify(CHAPTERS.map(c => [c.index, c.id, c.levels])), JSON.stringify([[1, 'sort', 6], [2, 'chart', 5], [3, 'claims', 6], [4, 'cleanup', 6], [5, 'models', 5], [6, 'fair', 4], [7, 'my-data', 3]]));
  for (const c of CHAPTERS) for (const id of [...c.csta, ...(c.csta2 || [])]) assert.ok(CSTA.has(id), `${c.id}: ${id} is a CSTA 2017 id`);
  for (const ch of BUILT) assert.equal(LV.levelsOf(ch).length, CHAPTERS.find(c => c.id === ch).levels, `${ch}: every case exists`);
  for (const l of LEVELS) {
    assert.ok(CHAPTERS.some(c => c.id === l.ch), `${l.id}: chapter`);
    assert.ok(l.bands.length && l.bands.every(b => b === '1b' || b === '2'), `${l.id}: bands`);
    for (const id of [...l.csta, ...(l.csta2 || [])]) assert.ok(CSTA.has(id), `${l.id}: ${id}`);
    assert.ok(l.csta.every(id => CHAPTERS.find(c => c.id === l.ch).csta.includes(id) || (CHAPTERS.find(c => c.id === l.ch).csta2 || []).includes(id)), `${l.id}: tagged with its chapter's standard`);
  }
  assert.equal(new Set(LEVELS.map(l => l.id)).size, LEVELS.length, 'unique ids');
  for (const ch of BUILT) assert.deepEqual(LV.levelsOf(ch).map(l => l.n), LV.levelsOf(ch).map((l, i) => i + 1), `${ch}: numbered 1..n`);
});

test('data-detective: every case is solved by its tap script with three stars, the claim waits for the evidence, exactly one claim is supported', () => {
  for (const l of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const st = E.newCase(l, seed);
      if (l.evidence) assert.equal(E.evidence(l, st), false, `${l.id}: the case starts without its evidence view (something to do)`);
      for (const a of l.sol) {
        if (a[0] === 'claim') assert.equal(E.evidence(l, st), true, `${l.id}: the evidence view is on screen before the claim`);
        const r = E.act(l, st, a);
        assert.ok(r && (r === true || r.ok), `${l.id}: ${JSON.stringify(a)} works (${JSON.stringify(r)})`);
      }
      assert.equal(st.solved, true, `${l.id}: solved`);
      assert.equal(E.proofDone(l, st), true, `${l.id}: the evidence was shown`);
      assert.equal(E.stars(l, st), 3, `${l.id}: three stars for the clean solution`);
      if (l.par != null) assert.ok(st.edits <= l.par, `${l.id}: par ${l.par} >= edits(sol) ${st.edits}`);
    }
    // a claim before the evidence is refused and never counted as a run
    const early = E.newCase(l, 1);
    if (l.evidence) { const r = E.act(l, early, ['claim', l.answer || 0]); assert.deepEqual([r.ok, r.why, early.runs], [false, 'show-me', 0], `${l.id}: Show me first`); }
    // exactly one supported claim; a wrong one is counted and explained
    const ready = E.newCase(l, 1);
    for (const a of l.sol) { if (a[0] === 'claim') break; E.act(l, ready, a); }
    const tiles = E.claimTiles(l);
    assert.ok(tiles.length >= 1 && tiles.length <= 4, `${l.id}: 1-4 claim tiles`);
    if (l.predict) {
      assert.equal(E.claimOk(l, ready, 0), true, `${l.id}: the prediction in range is accepted`);
      E.act(l, ready, ['slider', l.predict.max]); assert.equal(E.claimOk(l, ready, 0), false, `${l.id}: a wild prediction is not`);
    } else {
      assert.equal(tiles.filter((t, i) => E.claimOk(l, ready, i)).length, 1, `${l.id}: one supported claim`);
      const wrong = tiles.findIndex((t, i) => !E.claimOk(l, ready, i));
      const r = E.act(l, ready, ['claim', wrong]);
      assert.deepEqual([r.ok, r.why, ready.wrong, ready.runs], [false, 'wrong', 1, 1], `${l.id}: a wrong claim is a failed run`);
      assert.ok(l.shows && l.shows.length > 10, `${l.id}: Dot says what the data shows`);
      const ok = E.act(l, ready, ['claim', l.answer]);
      assert.equal(ok.ok, true);
      for (const k of E.proofKeys(l)) E.act(l, ready, ['show', k]);
      assert.equal(E.stars(l, ready), 2, `${l.id}: a wrong claim costs the second star`);
    }
  }
});

test('data-detective: learn card on level 1 of every chapter, three hint tiers, a Case-closed check with 3 tiles, proof keys that exist', () => {
  for (const ch of BUILT) assert.ok(LV.levelsOf(ch)[0].learn && LV.levelsOf(ch)[0].learn.title && LV.levelsOf(ch)[0].learn.text, `${ch}: learn card`);
  for (const l of LEVELS) {
    assert.equal(l.hints.length, 3, `${l.id}: three hints`);
    assert.ok(l.hints.every(h => h.length >= 8), `${l.id}: hint text`);
    assert.ok(l.title && l.story, `${l.id}: title and story`);
    assert.ok(l.q || l.claim, `${l.id}: a question or a claim`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.tiles[l.check.answer], `${l.id}: Case-closed check`);
    const st = E.newCase(l, 1);
    const keys = new Set([...(l.rows || []).map((r, i) => 'r' + (i + 1)), ...E.series(l, Object.assign(st, { view: 'bar' })).map(([c]) => 'c:' + c)]);
    if (l.rows) for (const c of l.cols) for (const [cat] of E.groupCounts(l, st, c.id)) keys.add('c:' + cat);
    for (const k of E.proofKeys(l)) assert.ok(keys.has(k), `${l.id}: proof ${k} is a row or bar of the case`);
    if (l.rows) assert.ok(l.rows.length <= (l.bands.includes('2') && !l.bands.includes('1b') ? 12 : 10) && l.cols.length <= 4, `${l.id}: table size`);
    if (l.random) { const a = E.newCase(l, 1).order.join(), b = E.newCase(l, 2).order.join(); assert.notEqual(a, b, `${l.id}: random layout per seed`); assert.equal(E.newCase(l, 1).order.join(), a, `${l.id}: deterministic per seed`); }
    // tier 3 does the move for the player (and costs the third star), skip gives no stars
    const h = E.newCase(l, 1); E.act(l, h, ['hint', 3]);
    assert.equal(h.hint3, true); if (l.move) assert.ok(E.evidence(l, h) || l.move[0] === 'fix' || l.move[0] === 'merge' || l.move[0] === 'remove' || l.move[0] === 'set' || l.move[0] === 'slider', `${l.id}: the tier-3 move helps`);
    const s = E.newCase(l, 1); E.act(l, s, ['skip']); assert.equal(E.stars(l, s), 0); assert.equal(s.solved, true);
  }
});

test('data-detective: every English word is in the pack master list, within budget, no duplicates, US spelling', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/data-detective/en.json'), 'utf8')).strings;
  assert.ok(Array.isArray(en) && en.length <= 1450, `budget: ${en.length}`);
  assert.equal(new Set(en).size, en.length, 'no duplicates');
  const mod = HTML.slice(HTML.indexOf('<script type="module">'));
  const lits = [...mod.matchAll(/\btr\(\s*'((?:\\.|[^'\\])*)'/g)].map(m => m[1].replace(/\\'/g, "'").replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
  const want = new Set([...lits, ...LV.allStrings()].filter(s => /\p{L}/u.test(s)));
  const have = new Set(en);
  for (const s of want) assert.ok(have.has(s), `en.json is missing: ${s}`);
  for (const s of en) assert.ok(want.has(s), `en.json has a string the game no longer uses: ${s}`);
  assert.ok(lits.length <= 450, `chrome strings: ${lits.length}`);
  const UK = /\b(colour|favourite|grey|labelled|organise|practise|neighbour|recognise|maths|centre|programme|catalogue)\b/i;
  for (const s of en) assert.doesNotMatch(s, UK, `US spelling: ${s}`);
  for (const s of en) { assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, `safe text: ${s}`); }
});

/* ---------- real Chromium, inside the production frame wrapper ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
const TYPES = { js: 'text/javascript', woff2: 'font/woff2', css: 'text/css', json: 'application/json' };
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 844, height: 390 }, lang = 'en', params = null } = {}) {
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
  const init = { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Data Detective' }, save: {}, canSave: false, preview: true };
  if (params) init.params = params;
  const doc = frameDocument(HTML, init);
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], kit = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/(oomba-kit\/[\w./-]+)$/.exec(u);
    if (m) {
      const f = path.join(ROOT, 'public/vendor', m[1]);
      if (!fs.existsSync(f)) return route.abort();
      kit.push(m[1]);
      return route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && typeof window.__brbTest.start === 'function' && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60_000 });
  return { ctx, page, frame, errors, kit };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);
const settle = (frame, ms = 150) => frame.waitForTimeout(ms);
/** Answer the Case-closed check with the right tile, then pick a confidence face. */
async function closeCard(frame, levelId) {
  const l = LEVELS.find(x => x.id === levelId);
  await frame.waitForSelector('.ok-ask .ok-tile', { timeout: 10_000 });
  await frame.evaluate(txt => { const t = [...document.querySelectorAll('.ok-ask .ok-tile')].find(b => b.textContent.includes(txt)); t.click(); }, l.check.tiles[l.check.answer]);
  await frame.waitForSelector('.dd-modal .faces button', { timeout: 10_000 });
  await frame.evaluate(() => document.querySelectorAll('.dd-modal .faces button')[2].click());
}
async function fit(frame, where) {
  const { frameProblems } = await import('../e2e/frame-fit.js');
  const p = await frameProblems(frame);
  assert.deepEqual(p, [], `${where}: layout problems`);
}

test('data-detective: plays level 1 of two chapters in the frame; the label grammar; the keypad; lock; Arabic; no errors', { skip, timeout: 240_000 }, async () => {
  const { ctx, frame, errors, kit } = await open({ size: { width: 390, height: 844 } });
  try {
    assert.ok(kit.some(k => k.endsWith('/oomba-kit.js')) && kit.some(k => k.includes('/packs/dress.js')), 'the pinned kit and packs loaded from the frame');
    await fit(frame, 'title 390x844');
    await T(frame, 'skipAnimations');
    // Sort & Group, level 1, lesson mode: the Case-closed card after the case, the label carries the checks part
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, lesson: true });
    let s = await T(frame, 'state');
    assert.deepEqual([s.screen, s.chapter, s.level, s.band, s.lesson, s.evidence, s.solved], ['play', 'sort', 1, '1b', true, false, false]);
    await fit(frame, 'sort-1 390x844');
    // the claim button refuses before the evidence view, then the sort header unlocks it
    const refused = await T(frame, 'claim', 0);
    assert.equal(refused, null, 'no claim before the evidence');
    assert.match((await T(frame, 'state')).say, /Show me first/);
    await frame.click('.hdr[aria-label*="When"]');
    s = await T(frame, 'state');
    assert.deepEqual([s.evidence, s.sortBy && s.sortBy.col, s.edits], [true, 'when', 1]);
    assert.match(s.say, /Pin your claim/);
    await T(frame, 'claim', 1);   // Jo: a wrong claim: Dot says what the data shows, the tile is marked
    s = await T(frame, 'state');
    assert.deepEqual([s.wrong, s.runs, s.picked], [1, 1, null]);
    assert.match(s.say, /Gus at 3:10/);
    await T(frame, 'claim', 0);
    assert.equal((await T(frame, 'state')).picked, 0);
    await frame.click('tr[data-row="r8"]');   // Show me: the evidence row
    s = await T(frame, 'state');
    assert.equal(s.solved, true);
    await closeCard(frame, 'sort-1');
    await frame.waitForFunction(() => window.__brbTest.state().level === 2, null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.length, 1);
    assert.equal(s.scoreCalls[0].label, '1/6 cases, 2 stars, 1/1 checks');
    assert.match(s.label, LABEL); assert.ok(s.label.length <= 40 && /^[\x20-\x7e]+$/.test(s.label));
    assert.equal(s.scoreCalls[0].score, 2);
    // level 2 is a fresh case, the hint tiers: a question, a glow, then the move (and the third star)
    assert.deepEqual([s.level, s.evidence, s.hint], [2, false, 0]);
    await T(frame, 'hint'); await T(frame, 'hint');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.hdr.lit').length), 1, 'tier 2 glows the column');
    await T(frame, 'hint');
    s = await T(frame, 'state');
    assert.deepEqual([s.hint, s.evidence, s.sortBy && s.sortBy.col], [3, true, 'blocks']);
    assert.equal(await T(frame, 'solve'), true);
    await closeCard(frame, 'sort-2');
    await frame.waitForFunction(() => window.__brbTest.state().level === 3, null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls[1].label, '2/6 cases, 4 stars, 2/2 checks');
    assert.ok(s.scoreCalls[1].score >= s.scoreCalls[0].score, 'monotonic score');
    // Skip after two failed runs: grey, 0 stars, the next case opens
    await T(frame, 'claim', 1);   // before evidence: refused, not a run
    await T(frame, 'act', ['group', 'pet']);
    await T(frame, 'claim', 1); await T(frame, 'claim', 2);
    assert.equal(await frame.evaluate(() => !!document.getElementById('skipBtn')), true, 'Skip appears after two failed claims');
    await frame.click('#skipBtn');
    await frame.waitForFunction(() => window.__brbTest.state().level === 4, null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls[2].label, '3/6 cases, 4 stars, 2/2 checks');
    // Chart It, free play, a build-the-bars case: steppers, the empty claim card, the proof bar
    await T(frame, 'start', { chapter: 'chart', band: '1b', level: 2, seed: 3 });
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.lesson, s.evidence], ['chart', 2, false, false]);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.step .ibtn').length), 8, 'a - and + stepper per bar');
    await fit(frame, 'chart-2 390x844');
    for (let i = 0; i < 5; i++) await frame.click('.step:nth-child(1) .ibtn:last-child');
    assert.equal((await T(frame, 'state')).bars.Dog, 5);
    for (const [c, n] of [['Cat', 3], ['Fish', 2], ['Bird', 4]]) await T(frame, 'act', ['bar', c, n]);
    s = await T(frame, 'state');
    assert.deepEqual([s.evidence, s.edits], [true, 14], 'the bars match the table within par');
    await T(frame, 'claim', 0);
    await T(frame, 'tap', 'c:Dog');   // Show me: the tallest bar
    await frame.waitForFunction(() => window.__brbTest.state().level === 3, null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '1/5 cases, 3 stars');
    assert.match(s.label, LABEL);
    // the quest-code keypad: C B M L; a bad code is refused; params would win over codes
    assert.equal(await T(frame, 'code', '9 9 0 0'), false);
    assert.equal(await T(frame, 'code', '4 2 0 0'), true);
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.band, s.mode, s.lesson, s.lock, s.level], ['cleanup', '2', 'play', true, false, 1]);
    await T(frame, 'keypad');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.dd-modal .keys button').length), 12);
    assert.equal(await frame.evaluate(() => document.querySelector('.dd-modal .code').textContent), '_ _ _ _');
    await fit(frame, 'keypad 390x844');
    await T(frame, 'closeDialog');
    // lock=1 through params: band locked, no band toggle on the map, Back goes to the title
    assert.equal(await T(frame, 'params', { chapter: 'claims', band: '1b', lock: 1 }), true);
    s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.band, s.lock, s.lesson], ['claims', '1b', true, true]);
    assert.equal(await frame.evaluate(() => document.getElementById('questPill').hidden), false, 'Class quest pill');
    assert.match(await frame.evaluate(() => document.getElementById('questPill').textContent), /Class quest: Clues & Claims · Explorer/);
    await frame.click('#backBtn');
    await frame.waitForSelector('.ok-title-screen .ok-hot', { timeout: 10_000 });
    assert.equal(await frame.evaluate(() => document.getElementById('game').hidden), true, 'Back under lock leaves for the title, not the map');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: desktop size, the chapter map and band toggle, a Pro cleanup case, projector mode', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 1280, height: 800 } });
  try {
    await fit(frame, 'title 1280x800');
    await T(frame, 'skipAnimations');
    await T(frame, 'map');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile').length), 7, 'seven chapter tiles');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#bandSeg button').length), 2, 'Explorer / Pro');
    await fit(frame, 'map 1280x800');
    await frame.click('#bandSeg button:nth-child(2)');
    assert.equal((await T(frame, 'state')).band, '2');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .tile .stars.silver').length), 3, 'Explorer chapters show silver stars for a Pro player');
    await T(frame, 'start', { chapter: 'cleanup', band: '2', level: 1, seed: 5 });
    await fit(frame, 'cleanup-1 1280x800');
    await frame.click('tr[data-row="r3"]');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.rowpanel .btn').length), 6, 'Fix to x3, Merge, Remove, Keep');
    await frame.click('.rowpanel .btn:nth-child(2)');   // Fix to Dog
    let s = await T(frame, 'state');
    assert.deepEqual([s.edits, s.evidence], [1, false]);
    assert.equal(await T(frame, 'solve'), true);   // the script fixes r3 again: one edit over par costs the second star
    await frame.waitForFunction(() => window.__brbTest.state().level === 2, null, { timeout: 10_000 });
    s = await T(frame, 'state');
    assert.equal(s.scoreCalls.at(-1).label, '1/6 cases, 2 stars');
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, mode: 'projector' });
    s = await T(frame, 'state');
    assert.deepEqual([s.mode, s.chapter], ['projector', 'sort']);
    assert.equal(await frame.evaluate(() => document.getElementById('game').classList.contains('proj')), true);
    await fit(frame, 'projector 1280x800');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: Arabic reads right to left with numbers left to right, and the same play works', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors } = await open({ lang: 'ar', size: { width: 390, height: 844 } });
  try {
    assert.match(await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').textContent), /العب/);
    await T(frame, 'skipAnimations');
    await T(frame, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1 });
    const r = await frame.evaluate(() => ({ dir: document.getElementById('game').dir, lang: document.documentElement.lang, num: document.querySelector('td.num').dir, prog: document.getElementById('prog').dir }));
    assert.deepEqual(r, { dir: 'rtl', lang: 'en', num: 'ltr', prog: 'ltr' });   // no Arabic pack yet: English words, mirrored chrome
    await fit(frame, 'sort-1 ar 390x844');
    assert.equal(await T(frame, 'solve'), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('data-detective: the cover hook stages a half-solved case with the claim card open', { skip, timeout: 120_000 }, async () => {
  const { ctx, frame, errors } = await open({ size: { width: 360, height: 480 } });
  try {
    await T(frame, 'cover');
    const s = await T(frame, 'state');
    assert.deepEqual([s.chapter, s.level, s.view, s.claimsOpen, s.screen], ['sort', 3, 'group', true, 'play']);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.claimtile').length), 3);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
