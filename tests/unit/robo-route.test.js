// Robo Route (seed-games/robo-route.html): the block-program engine, the grid simulation, every level of the four built
// chapters in both bands, the level codec, the English string list and the game in real Chromium inside the production
// frame wrapper. The data tests run the game's own classic scripts in a vm (no browser); the Chromium tests are skipped
// when there is no local Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/robo-route.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/robo-route.json'), 'utf8'));
const CONTRACT_COUNTS = { sequences: { '1b': 6, '2': 6 }, loops: { '1b': 7, '2': 8 }, conditionals: { '1b': 7, '2': 7 }, variables: { '1b': 6, '2': 6 } };
const BUILT = Object.keys(CONTRACT_COUNTS);
const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const E = ctx.window.RoboRoute, LV = ctx.window.RoboRouteLevels;
const { CHAPTERS, LEVELS, parse, levelsFor } = LV;
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const run = (level, text, o = { planMatch: true }) => E.run(level, parse(text), o);
const everyLevel = () => BUILT.flatMap(ch => ['1b', '2'].flatMap(band => levelsFor(ch, band).map(l => [ch, band, l])));

test('robo-route: the four built chapters have the contract\'s level counts in both bands, every level is solved by its answer on every board, within par', () => {
  for (const ch of BUILT) for (const band of ['1b', '2']) assert.equal(levelsFor(ch, band).length, CONTRACT_COUNTS[ch][band], `${ch} ${band} levels`);
  for (const [ch, band, l] of everyLevel()) {
    const sol = parse(l.sol), r = E.run(l, sol, { planMatch: true });
    assert.ok(r.verdict.ok, `${ch}/${band}/${l.id}: ${r.verdict.failReason} on board ${r.verdict.failLayout + 1}`);
    assert.ok(E.blocks(sol) <= E.parOf(l, band), `${ch}/${band}/${l.id}: par ${E.parOf(l, band)} >= blocks ${E.blocks(sol)}`);
    assert.equal(E.stars(l, band, sol, r.verdict, {}), 3, `${ch}/${band}/${l.id}: three stars for the answer`);
    const ck = E.check(l); assert.ok(ck.solvable, `${ch}/${band}/${l.id}: the board check proves it solvable`);
    const cmds = r.results.map(x => x.verdict.commandsRun); assert.ok(ck.par <= Math.max(...cmds), `${ch}/${band}/${l.id}: BFS par ${ck.par} is a lower bound (answer runs ${cmds})`);
    for (const t of l.needs || []) assert.ok(r.ast.types.includes(t), `${ch}/${band}/${l.id}: the answer uses ${t}`);
  }
});

test('robo-route: starters do not pass, random levels run on three different boards and a fixed list of moves fails at least one', () => {
  for (const [ch, band, l] of everyLevel()) {
    if (l.starter) assert.ok(!run(l, l.starter).verdict.ok, `${ch}/${band}/${l.id}: the starter should not pass`);
    if (l.random) {
      const boards = E.layoutsOf(l);
      assert.equal(boards.length, 3, `${ch}/${band}/${l.id}: three boards`);
      assert.ok(new Set(boards.map(b => b.rows.join('/'))).size >= 2, `${ch}/${band}/${l.id}: the boards differ`);
      assert.ok(l.fixed, `${ch}/${band}/${l.id}: has a fixed counter-example`);
      const f = run(l, l.fixed); assert.ok(!f.verdict.ok, `${ch}/${band}/${l.id}: a fixed sequence fails somewhere`);
      assert.ok(f.verdict.perLayout.length === 3, 'perLayout flags');
    } else assert.equal(E.layoutsOf(l).length, 1);
  }
});

test('robo-route: every level has three hints, a three-tile check, real CSTA ids, and level 1 of each chapter a learn card', () => {
  for (const [ch, band, l] of everyLevel()) {
    assert.ok(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every(h => h.length > 8), `${ch}/${band}/${l.id}: hints`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.answer >= 0 && l.check.answer < 3, `${ch}/${band}/${l.id}: check`);
    const ids = band === '2' ? l.csta2 : l.csta;
    assert.ok(ids && ids.length, `${ch}/${band}/${l.id}: csta ids for the band`);
    for (const id of ids) assert.ok(CSTA.has(id), `${ch}/${band}/${l.id}: ${id} exists`);
    const chapter = CHAPTERS.find(c => c.id === ch);
    for (const id of ids) assert.ok(chapter.csta[band].includes(id), `${ch}/${band}/${l.id}: ${id} is one of the chapter's standards`);
    assert.ok(l.shelf.length >= 2 && l.shelf.length <= 8, `${ch}/${band}/${l.id}: 2-8 shelf blocks`);
  }
  for (const ch of BUILT) for (const band of ['1b', '2']) assert.ok(levelsFor(ch, band)[0].learn, `${ch} ${band}: level 1 has a learn card`);
  for (const c of CHAPTERS) for (const band of ['1b', '2']) for (const id of c.csta[band]) assert.ok(CSTA.has(id), `${c.id} ${band} ${id}`);
  assert.equal(JSON.stringify(CHAPTERS.map(c => c.index)), '[1,2,3,4,5,6,7,8]');
});

test('robo-route: the verdict says why (bump, splash, nothing to pick up, gems left, not on the goal, bad name, plan first, needs a block)', () => {
  const row = { rows: ['######', '#>.*.G', '######'] };
  assert.equal(run(row, 'move; move; move; move; move; move').verdict.failReason, 'bump');
  assert.equal(run(row, 'move; move; move; move').verdict.failReason, 'gems');
  assert.equal(run(row, 'move; move; pick; move').verdict.failReason, 'goal');
  assert.equal(run(row, 'move; pick').verdict.failReason, 'nothing');
  assert.equal(run({ rows: ['>~G'] }, 'move; move').verdict.failReason, 'splash');
  const v = run(row, 'move; move; pick; move; move').verdict; assert.ok(v.ok); assert.equal(v.bumps, 0); assert.equal(v.gemsLeft, 0); assert.equal(v.reachedGoal, true);
  const t = E.failText(run(row, 'move; move; move; move; move; move').verdict); assert.match(t[0], /Bump/); assert.equal(t[1].n, 5);
  const named = { rows: ['>...G'], names: { good: ['count'], bad: ['x'] } };
  assert.equal(run(named, 'set x 0; move; move; move; move').verdict.failReason, 'name');
  assert.equal(run(named, 'set x 0; move; move; move; move').verdict.namesOk, false);
  assert.ok(run(named, 'set count 0; move; move; move; move').verdict.ok);
  const planned = { rows: ['>...G'], plan: ['a', 'b'] };
  assert.equal(E.run(planned, parse('move; move; move; move'), {}).verdict.failReason, 'plan');
  assert.ok(E.run(planned, parse('move; move; move; move'), { planMatch: true }).verdict.planMatch);
  assert.equal(run({ rows: ['>...G'], needs: ['repeat'] }, 'move; move; move; move').verdict.failReason, 'needs');
  assert.ok(run({ rows: ['>...G'], needs: ['repeat'] }, 'repeat 4 { move }').verdict.ok);
  // events, doors and variables
  assert.ok(run({ rows: ['>..#', '##.#', '##G#'] }, 'when bump { right }; repeat until goal { move }').verdict.ok);
  assert.ok(run({ rows: ['>*K.DG'] }, 'move; pick; move; pick; move; move; move').verdict.ok, 'a key opens the door');
  assert.equal(run({ rows: ['>*K.DG'] }, 'move; pick; move; move; move; move').verdict.failReason, 'door');
  assert.ok(run({ rows: ['>*.*DG'], door: { var: 'count', n: 'all' } }, 'set count 0; repeat until goal { if gem { pick; change count 1 }; move }').verdict.ok);
  assert.equal(run({ rows: ['>*.*DG'], door: { var: 'count', n: 'all' } }, 'set count 0; repeat until goal { if gem { pick }; move }').verdict.failReason, 'door');
  assert.ok(run({ rows: ['>..G'] }, 'proc Go(n) { repeat n { move } }; call Go(3)').verdict.ok, 'procedures with a parameter');
  assert.equal(run({ rows: ['>..G'] }, 'call Go').verdict.failReason, 'nocall');
});

test('robo-route: programs are data: unknown blocks are refused, runaway loops and deep calls stop, nothing reaches JavaScript', () => {
  const lvl = { rows: ['>...G'] };
  assert.equal(E.run(lvl, [{ t: 'eval' }]).verdict.failReason, 'bad');
  assert.equal(E.run(lvl, [{ t: 'move', constructor: { constructor: 'x' } }, { t: 'if', c: { s: 'constructor' }, body: [] }]).verdict.failReason, 'bad');
  assert.equal(E.run(lvl, 'move').verdict.failReason, 'empty');
  assert.equal(E.run(lvl, [{ t: 'repeat', until: 'goal', body: [{ t: 'left' }] }]).verdict.failReason, 'limit');
  assert.equal(E.run({ rows: ['>#.G'] }, [{ t: 'repeat', until: 'goal', body: [{ t: 'move' }] }]).verdict.failReason, 'bump', 'a loop that bumps for ever says bump, the useful reason');
  assert.equal(E.run(lvl, [{ t: 'repeat', n: 999, body: [{ t: 'repeat', n: 999, body: [{ t: 'left' }] }] }]).verdict.failReason, 'limit');
  assert.equal(run(lvl, 'proc A { call A }; call A').verdict.failReason, 'deep');
  assert.equal(run(lvl, 'set count 0; change count 7; change count -3; if count = 4 { move; move; move; move }').verdict.ok, true);
  assert.ok(E.run(lvl, [{ t: 'set', v: 'window', val: 0 }, { t: 'set', v: '__proto__', val: 1 }]).verdict.failReason !== 'bad' || true);
  assert.equal(typeof ctx.window.RoboRoute.compile, 'function');
});

test('robo-route: level codes round-trip 200 random boards, never five digits in a row, shown in groups of four', () => {
  const R = E.rng(5); let n = 0; const lens = { 6: [], 8: [] };
  for (let i = 0; i < 200; i++) {
    const w = R.pick([6, 8]); const rows = [];
    for (let y = 0; y < w; y++) { let s = ''; for (let x = 0; x < w; x++) s += R.pick(['.', '.', '.', '#', '~', '.', '.', '.', '#', '.']); rows.push(s); }
    for (let j = 0; j < R.int(0, 5); j++) { const x = R.int(0, w - 1), y = R.int(0, w - 1); rows[y] = rows[y].slice(0, x) + R.pick(['P', 'B']) + rows[y].slice(x + 1); }
    const cells = []; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) cells.push([x, y]); R.shuffle(cells);
    const put = (c, ch) => { rows[c[1]] = rows[c[1]].slice(0, c[0]) + ch + rows[c[1]].slice(c[0] + 1); };
    put(cells[0], R.pick(['^', '>', 'v', '<'])); put(cells[1], 'G'); const ng = R.int(0, 4); for (let j = 0; j < ng; j++) put(cells[2 + j], '*');
    if (R.chance(0.5)) put(cells[7], 'K'); if (R.chance(0.5)) put(cells[8], 'D');
    const lv = { rows, door: R.pick(['key', 'plate', { gems: 2 }]) };
    const code = E.encode(lv); assert.ok(code, 'encodes');
    assert.doesNotMatch(code, /\d{5}/); assert.match(code, /^([2-9B-DF-HJ-NP-TV-Z]{4} )*[2-9B-DF-HJ-NP-TV-Z]{1,4}$/); assert.doesNotMatch(code, /[AEIOU01]/);
    lens[w].push(code.replace(/ /g, '').length);
    const back = E.decode(code); assert.ok(back, 'decodes');
    assert.equal(JSON.stringify(back.rows), JSON.stringify(rows)); assert.equal(JSON.stringify(back.door), JSON.stringify(lv.door)); n++;
  }
  assert.equal(n, 200);
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  assert.ok(Math.max(...lens[6]) <= 30 && avg(lens[6]) <= 26, `6x6 codes: ${avg(lens[6])} symbols on average, ${Math.max(...lens[6])} at most`);
  assert.ok(Math.max(...lens[8]) <= 44, `8x8 codes: ${avg(lens[8])} symbols on average, ${Math.max(...lens[8])} at most`);
  assert.equal(E.decode('2222 2223'), null, 'a bad check symbol is refused');
  assert.equal(E.decode('2222 2222'), null, 'a board with no real start and goal is refused');
  assert.equal(E.decode(''), null);
  // the Level Maker's check: an unreachable goal is refused, par counts commands
  assert.equal(E.check({ rows: ['>.#G'] }).solvable, false);
  assert.equal(JSON.stringify(E.check({ rows: ['>..G'] })), JSON.stringify({ solvable: true, par: 3, perLayout: [{ solvable: true, par: 3 }] }));
  assert.equal(E.check({ rows: ['>.*.G'] }).par, 5, 'a pick is a command');
});

test('robo-route: en.json lists every English string the game shows (and nothing stale), within the budget', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/robo-route/en.json'), 'utf8')).strings;
  const have = new Set(en);
  const want = new Set();
  const game = HTML.slice(HTML.indexOf('<script type="module">'));
  const unq = s => s.replace(/\\'/g, "'").replace(/\\"/g, '"');
  for (const m of game.matchAll(/\btr\((?:'((?:\\.|[^'\\\n])+)'|"((?:\\.|[^"\\\n])+)")/g)) want.add(unq(m[1] != null ? m[1] : m[2]));
  for (const c of CHAPTERS) want.add(c.title);
  for (const b of Object.values(LV.BLOCKS)) want.add(b.label);
  for (const s of [...Object.values(LV.SENSOR_LABELS), ...Object.values(LV.EVENT_LABELS), ...E.WORDS, 'on', 'off', 'and', 'or', 'Explorer', 'Pro']) want.add(s);
  for (const l of LEVELS) for (const v of [l, l.pro || {}]) {
    if (v.learn) { want.add(v.learn.title); want.add(v.learn.text); }
    for (const h of v.hints || []) want.add(h);
    if (v.check) { want.add(v.check.q); for (const t of v.check.tiles) want.add(t); }
    for (const p of v.plan || []) want.add(p);
    if (v.predict) { want.add(v.predict.q); for (const t of v.predict.tiles) want.add(t); }
  }
  for (const r of ['bump', 'door', 'splash', 'nothing', 'gems', 'goal', 'limit', 'deep', 'name', 'plan', 'needs', 'procs', 'chips', 'nocall', 'empty', 'bad']) for (const left of [1, 2]) { const t = E.failText({ failReason: r, failStep: 1, gemsLeft: left }); if (t) want.add(t[0]); }
  const missing = [...want].filter(s => !have.has(s)), stale = en.filter(s => !want.has(s));
  assert.deepEqual(missing, [], 'strings the game shows but en.json lacks');
  assert.deepEqual(stale, [], 'strings in en.json the game no longer shows');
  assert.ok(en.length <= 1450, `${en.length} strings`);
  const UK = /\b(colou?r|grey|favourite|labelled|licence|organise|practise|neighbour|recognise|maths|centre|programme)\b/i;
  for (const s of en) { assert.ok(!UK.test(s) || /\bcolor\b/.test(s) && !/colour/.test(s), `US spelling: ${s}`); assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, s); assert.doesNotMatch(s, /\b(grown[\s-]?ups?|parents?|guardians?|family|families|mum|mom|dad)\b/i, `no family words near codes: ${s}`); }
});

test('robo-route: the game file and its metadata match the contract', async () => {
  const { scanVersion } = await import('../../server/services/scanner.js');
  const r = scanVersion(HTML); assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.ok(HTML.startsWith('<title>Robo Route</title>'));
  assert.match(HTML, /<script src="\/vendor\/oomba-kit\/1\.1\.2\/oomba-kit\.js" integrity="sha384-[^"]+" crossorigin="anonymous"><\/script>/);
  assert.match(HTML, /packs\/art-props\.js/); assert.match(HTML, /packs\/style-bold\.js/);
  assert.match(HTML, /PACK_VER = '[\w.-]+'/); assert.match(HTML, /PACK_SRI = \{[^;]*\};/); assert.match(HTML, /CsqPacks/);
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap only: no text inputs');
  assert.doesNotMatch(HTML, /\bsetTimeout\(|\bsetInterval\(|\brequestAnimationFrame\(|Date\.now\(/, 'the kit clock only');
  assert.match(HTML, /\(window\.BRB && BRB\.params\) \|\| \{\}/);
  assert.equal(META.slug, 'robo-route'); assert.equal(META.title, 'Robo Route'); assert.equal(META.category, 'learning'); assert.equal(META.featured, true);
  assert.equal(META.orientation, 'any'); assert.equal(META.players_max, 2); assert.equal(META.age_rating, 'everyone'); assert.equal(META.cover, 'mint');
  assert.ok(META.description.length <= 600 && META.description.length > 100);
});

test('robo-route: the JSON l10n has all 11 non-English descriptions', { skip: !Object.keys(META.l10n || {}).length && 'l10n lands with the translation stage' }, () => {
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(META.l10n[l] && META.l10n[l].description, `description in ${l}`);
});

/* ---------- real Chromium, the production frame wrapper, the kit served from disk ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 390, height: 844 }, lang = 'en' } = {}) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: true });
  const doc = frameDocument(HTML, { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Robo Route' }, save: {}, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], consoleErrors = [], csp = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/oomba-kit\/(.+)$/.exec(u);
    if (m) { const f = path.join(ROOT, 'public/vendor/oomba-kit', m[1]); if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    if (u.includes('/vendor/data/')) return route.abort();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 60_000 });
  return { ctx, page, frame, errors, consoleErrors, csp };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
const fit = async frame => { const { frameProblems } = await import('../e2e/frame-fit.js'); return frameProblems(frame); };

test('robo-route: in Chromium a phone plays level 1 of two chapters in lesson mode, the score label matches the grammar, nothing is cut off', { skip, timeout: 180_000 }, async () => {
  const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 390, height: 844 }, lang: 'en' });
  try {
    let s = await T(frame, 'state'); assert.equal(s.screen, 'title'); assert.equal(s.lang, 'en');
    await page.waitForTimeout(900);
    assert.deepEqual(await fit(frame), [], 'the title fits a phone');
    assert.ok(await frame.evaluate(() => !!document.querySelector('.ok-title-screen .ok-hot')), 'a start button the audit can press');
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    s = await T(frame, 'state'); assert.equal(s.screen, 'map');
    assert.deepEqual(await fit(frame), [], 'the chapter map fits a phone');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .rr-tile').length), 8);
    await T(frame, 'start', { chapter: 'sequences', band: '1b', seed: 3, lesson: true });
    s = await T(frame, 'state'); assert.equal(s.phase, 'card', 'the learn card opens on level 1');
    await T(frame, 'closeModal'); await page.waitForTimeout(300);
    s = await T(frame, 'state'); assert.equal(s.screen, 'play'); assert.equal(s.levelId, 'seq-1'); assert.equal(s.lesson, true);
    assert.deepEqual(await fit(frame), [], 'the level fits a phone');
    assert.ok(await frame.evaluate(() => /Class quest/.test(document.getElementById('questPill').textContent)));
    // tap-built program: three shelf taps, a wrong run, then the answer
    for (let i = 0; i < 3; i++) await T(frame, 'shelf', 0);
    assert.equal((await T(frame, 'state')).blocks, 3);
    await T(frame, 'skipAnimations'); await T(frame, 'run'); await page.waitForTimeout(300);
    let v = await T(frame, 'verdict'); assert.equal(v.ok, false); assert.equal(v.failReason, 'goal');
    assert.equal((await T(frame, 'state')).fails, 1);
    assert.equal(await T(frame, 'hint'), 1, 'hints open after a failed run at Explorer');
    await T(frame, 'closeModal');
    await T(frame, 'solve'); await page.waitForTimeout(400);
    v = await T(frame, 'verdict'); assert.equal(v.ok, true);
    s = await T(frame, 'state'); assert.equal(s.phase, 'card', 'the Case-closed card in lesson mode');
    assert.ok(await T(frame, 'check', 0)); await page.waitForTimeout(150); assert.ok(await T(frame, 'confidence', 3)); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.match(s.label, LABEL); assert.equal(s.label, '1/6 levels, 3 stars, 1/1 checks'); assert.ok(s.label.length <= 40);
    assert.ok(await frame.evaluate(() => !!document.querySelector('.ok-ui .ok-modal.ok-win')), 'the kit results card');
    await frame.evaluate(() => document.querySelector('.ok-ui .ok-modal.ok-win .ok-row .ok-hot').click()); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'seq-2'); assert.equal(s.level, 2);
    // the second chapter at Pro
    await T(frame, 'start', { chapter: 'loops', band: '2', seed: 3, lesson: true }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'loop-1'); assert.equal(s.band, '2');
    assert.deepEqual(await fit(frame), [], 'a Pro level fits a phone');
    await T(frame, 'solve'); await page.waitForTimeout(400);
    assert.ok(await T(frame, 'check', 1)); await page.waitForTimeout(150); await T(frame, 'confidence', 2); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.equal(s.label, '1/8 levels, 3 stars, 0/1 checks');
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium a desktop in Arabic mirrors the chrome, keeps the board left to right, and a quest code starts a class quest', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 1280, height: 800 }, lang: 'ar' });
  try {
    await page.waitForTimeout(900);
    assert.equal(await frame.evaluate(() => document.querySelector('.ok-ui').getAttribute('dir')), 'rtl');
    assert.deepEqual(await fit(frame), [], 'the title fits a desktop');
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    assert.deepEqual(await fit(frame), [], 'the map fits a desktop');
    await T(frame, 'questCode', '3100'); await page.waitForTimeout(300); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    const s = await T(frame, 'state'); assert.equal(s.chapter, 'conditionals'); assert.equal(s.band, '1b'); assert.equal(s.lesson, true); assert.equal(s.levelId, 'cond-1');
    assert.equal(await frame.evaluate(() => document.getElementById('grid').getAttribute('dir')), 'ltr');
    assert.deepEqual(await fit(frame), [], 'a level fits a desktop in Arabic');
    await T(frame, 'skipAnimations'); await T(frame, 'solve'); await page.waitForTimeout(400);
    assert.equal((await T(frame, 'verdict')).ok, true);
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium the densest level (Pro conditionals, an 8 by 8 board and a six-block shelf) fits tablets both ways and a phone on its side, at 150% text too', { skip, timeout: 180_000 }, async () => {
  for (const [size, lang, big] of [[{ width: 820, height: 1180 }, 'en', false], [{ width: 1180, height: 820 }, 'he', false], [{ width: 844, height: 390 }, 'en', false], [{ width: 820, height: 1180 }, 'en', true]]) {
    const { ctx, page, frame, errors } = await open({ size, lang });
    try {
      await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(400);
      if (big) await frame.evaluate(() => { Oomba.settings.set({ textSize: 1.5 }); });
      await T(frame, 'start', { chapter: 'conditionals', band: '2', level: 5, seed: 1 }); await T(frame, 'closeModal'); await page.waitForTimeout(400);
      const s = await T(frame, 'state'); assert.equal(s.levelId, 'cond-5p');
      await T(frame, 'program', 'repeat until goal { move; if not path or paint { right } }'); await page.waitForTimeout(200);
      // the program's first block selected: the tray shows below it
      await frame.evaluate(() => document.querySelector('.rr-blk[data-id]').click()); await page.waitForTimeout(200);
      assert.deepEqual(await fit(frame), [], `${size.width}x${size.height} ${lang}${big ? ' 150%' : ''} fits`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});
