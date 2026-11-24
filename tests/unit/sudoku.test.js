// Sudoku (seed-games/sudoku.html): a logic puzzle in Crossword's look (its own page, no Oomba Kit), from a 4x4 with
// pictures to the classic 9x9.
// Checked here:
//   - the puzzle maker (the pure block between sudoku-core:begin and sudoku-core:end), for every level and many seeds:
//     the full board is valid, the puzzle agrees with it, has exactly one solution (a solver written here, not the
//     game's), its givens are in the level's range, the human-style grade fits the level, the same seed makes the same
//     puzzle, and a puzzle is made fast enough for a phone; the grader itself on known puzzles;
//   - the stars and points, the save format, clashes;
//   - the file: its own page outside the Oomba Kit (the dashboard widget look, light and dark, Google Fonts the only
//     outside address, BRB.sfx, BRB.storage, one BRB.gameOver), the scanner passes it, it reaches nothing else;
//   - its words: every key in all 13 languages with the same placeholders, no dashes, the spoken lines registered;
//   - its registration: seeded, on the Learn shelf as thinking for kindergarten to grade 8, a cover and a share picture;
//   - the game itself in real Chromium inside the production game frame: the home in the widget look (light and dark),
//     the picker, a 4x4 played by taps on the pad (a clash, notes, undo, a hint, the win, its stars card and its one
//     game-over message), the keyboard, pause, the save and the reload, a picture puzzle's labels, the board fitting a
//     360 px phone with no sideways scroll, How to play in Spanish, Japanese and Arabic, and Read it to me only with an
//     AI voice for every line.
// The play test needs a local Chromium; it is skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const lines = await import('../../server/services/tts-lines.js');
const { SHELF_INFO, LEARNING } = await import('../../server/learn.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/sudoku.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/sudoku.json'), 'utf8'));
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

// The game's puzzle maker, run on its own (no DOM, no kit).
const C = (() => { const box = { window: {} }; vm.runInNewContext(/\/\* sudoku-core:begin \*\/([\s\S]*?)\/\* sudoku-core:end \*\//.exec(HTML)[1], box); return box.window.SudokuCore; })();
const I18N = (() => { const b = {}; vm.runInNewContext(HTML.slice(HTML.indexOf('// ==== I18N START ===='), HTML.indexOf('// ==== I18N END ====')) + '\nthis.I18N = I18N;', b); return b.I18N; })();
const arr = v => Array.from(v);
const LEVELS = JSON.parse(JSON.stringify(C.LEVELS));   // plain objects of this realm, so deepEqual can compare them

// What this test knows about sudoku, written out here and never taken from the game.
const BOX = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };   // rows and columns of a box
function units(n) {
  const [br, bc] = BOX[n], out = [];
  for (let r = 0; r < n; r++) out.push([...Array(n)].map((_, c) => r * n + c));
  for (let c = 0; c < n; c++) out.push([...Array(n)].map((_, r) => r * n + c));
  for (let r0 = 0; r0 < n; r0 += br) for (let c0 = 0; c0 < n; c0 += bc) { const u = []; for (let r = r0; r < r0 + br; r++) for (let c = c0; c < c0 + bc; c++) u.push(r * n + c); out.push(u); }
  return out;
}
const fullAndValid = (g, n) => g.length === n * n && g.every(d => d >= 1 && d <= n) && units(n).every(u => new Set(u.map(i => g[i])).size === n);
/** Counts solutions (up to `limit`) by plain backtracking in reading order: slow, simple and independent of the game. */
function solutions(grid, n, limit = 2) {
  const g = grid.slice(), U = units(n), of = g.map((_, i) => U.filter(u => u.includes(i)));
  let found = 0;
  (function rec(i) {
    if (found >= limit) return;
    while (i < g.length && g[i]) i++;
    if (i === g.length) { found++; return; }
    for (let d = 1; d <= n; d++) if (of[i].every(u => u.every(x => g[x] !== d))) { g[i] = d; rec(i + 1); g[i] = 0; if (found >= limit) return; }
  })(0);
  return found;
}

test('the levels: 4x4 Easy and Medium, 6x6 Easy and Medium, 9x9 Easy, Medium, Hard and Expert, each harder than the last', () => {
  assert.deepEqual(LEVELS.map(L => `${L.size}:${L.diff}`), ['4:easy', '4:medium', '6:easy', '6:medium', '9:easy', '9:medium', '9:hard', '9:expert']);
  for (const L of LEVELS) {
    assert.ok(L.givens[0] <= L.givens[1] && L.givens[1] < L.size * L.size, L.id);
    assert.ok(L.tier[0] <= L.tier[1], L.id);
    assert.ok(L.par > 0 && L.base > 0, L.id);
  }
  for (const size of [4, 6, 9]) {
    const ls = LEVELS.filter(L => L.size === size);
    for (let k = 1; k < ls.length; k++) {
      assert.ok(ls[k].givens[1] < ls[k - 1].givens[0], `${ls[k].id}: fewer givens than ${ls[k - 1].id}`);
      assert.ok(ls[k].tier[0] >= ls[k - 1].tier[0] && ls[k].base > ls[k - 1].base, `${ls[k].id}: at least as hard and worth more`);
    }
  }
  // 9x9 Medium and up need more than naked singles; Hard needs pairs or pointing; Expert triples, an X-wing or an XY-wing
  assert.deepEqual(['classic-medium', 'classic-hard', 'classic-expert'].map(id => C.level(id).tier[0]), [1, 2, 3]);
});

test('every level: valid boards, exactly one solution, givens in range, a fitting grade, the same puzzle from the same seed', () => {
  const SEEDS = { 4: 40, 6: 30, 9: 12 };
  for (const L of LEVELS) {
    const n = L.size;
    for (let k = 0; k < SEEDS[n]; k++) {
      const seed = 1000 + k * 7919, p = C.generate(L.id, seed), tag = `${L.id} seed ${seed}`;
      assert.equal(p.id, L.id); assert.equal(p.size, n); assert.equal(p.seed, seed);
      const puzzle = arr(p.puzzle), sol = arr(p.solution);
      assert.ok(fullAndValid(sol, n), `${tag}: the full board is valid`);
      assert.ok(puzzle.every((d, i) => d === 0 || d === sol[i]), `${tag}: every given is the answer's`);
      const givens = puzzle.filter(Boolean).length;
      assert.equal(p.givens, givens);
      assert.ok(givens >= L.givens[0] && givens <= L.givens[1], `${tag}: ${givens} givens in ${L.givens}`);
      assert.equal(solutions(puzzle, n), 1, `${tag}: exactly one solution`);
      const g = C.grade(puzzle, n);
      assert.ok(g.solved, `${tag}: solved by reasoning alone`);
      assert.deepEqual(arr(g.grid), sol, `${tag}: the reasoning reaches the answer`);
      assert.ok(g.tier >= L.tier[0] && g.tier <= L.tier[1], `${tag}: grade ${g.tier} in ${L.tier}`);
      assert.equal(p.tier, g.tier);
      if (k < 3) assert.deepEqual(arr(C.generate(L.id, seed).puzzle), puzzle, `${tag}: the same seed, the same puzzle`);
    }
    assert.notDeepEqual(arr(C.generate(L.id, 1).puzzle), arr(C.generate(L.id, 2).puzzle), `${L.id}: another seed, another puzzle`);
  }
  // 9x9 below Expert is dug in matching pairs, like a printed puzzle
  for (const id of ['classic-easy', 'classic-medium', 'classic-hard']) { const p = arr(C.generate(id, 77).puzzle); assert.ok(p.every((d, i) => !!d === !!p[80 - i]), id); }
});

test('a puzzle is made fast enough for a phone (each level well under the 1.5 s a phone may take)', () => {
  for (const L of LEVELS) {
    const times = [];
    for (let k = 0; k < (L.size === 9 ? 15 : 30); k++) { const t0 = performance.now(); C.generate(L.id, 31 + k * 104729); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1], worst = times[times.length - 1];
    // a laptop runs about four times faster than a slow phone
    assert.ok(median < 120, `${L.id}: median ${median.toFixed(1)} ms`);
    assert.ok(worst < 600, `${L.id}: worst ${worst.toFixed(1)} ms`);
  }
});

test('the solver and the grader on puzzles written out here', () => {
  // a well-known easy puzzle (naked and hidden singles only) and its answer
  const easy = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
  const easySol = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'.split('').map(Number);
  assert.equal(C.count(easy, 9, 2), 1); assert.deepEqual(arr(C.solve(easy, 9)), easySol);
  const g = C.grade(easy, 9); assert.ok(g.solved && g.tier <= 1); assert.deepEqual(arr(g.grid), easySol);
  // more than one solution: the counter stops at two, the grader cannot finish
  const loose = new Array(16).fill(0); loose[0] = 1;
  assert.equal(C.count(loose, 4, 2), 2); assert.equal(solutions(loose, 4), 2);
  assert.equal(C.grade(loose, 4).solved, false);
  // a clash: no solution
  const bad = easy.slice(); bad[2] = 5; assert.equal(C.count(bad, 9, 2), 0); assert.equal(C.solve(bad, 9), null);
  // a puzzle that needs more than singles (a pair or pointing): the grade says so
  const hard = C.generate('classic-hard', 5).puzzle; assert.equal(C.grade(arr(hard), 9).tier, 2);
  // clashes: every box that repeats a digit in a row, a column or a box
  const g4 = [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  assert.deepEqual(arr(C.conflicts(g4, 4)), [0, 3, 15]);
  assert.deepEqual(arr(C.conflicts(easySol, 9)), []); assert.ok(C.valid(easySol, 9)); assert.ok(!C.valid(easy, 9));
  // candidates: what a box could still take
  assert.equal(C.candidates(easy, 9, 2), (1 << 0) | (1 << 1) | (1 << 3));   // 1, 2 or 4
  // the save format: a grid as text and back
  assert.equal(C.encode(easy), easy.join('')); assert.deepEqual(arr(C.decode(C.encode(easySol), 81)), easySol);
  assert.deepEqual(arr(C.decode('12x', 4)), [1, 2, 0, 0], 'junk reads as empty');
});

test('stars and points: three for a clean solve in time, fewer for help, mistakes and time; never below one', () => {
  const L = C.level('classic-easy');
  assert.equal(C.stars(L.id, { hints: 0, mistakes: 0, time: 60 }), 3);
  assert.equal(C.stars(L.id, { hints: 1, mistakes: 0, time: 60 }), 2);
  assert.equal(C.stars(L.id, { hints: 2, mistakes: 2, time: 60 }), 1);
  assert.equal(C.stars(L.id, { hints: 0, mistakes: 0, time: L.par + 1 }), 2);
  assert.equal(C.stars(L.id, { hints: 9, mistakes: 9, time: 99999 }), 1);
  const fast = C.score(L.id, { time: 0 }), slow = C.score(L.id, { time: L.par }), helped = C.score(L.id, { time: L.par, hints: 3 });
  assert.equal(fast, Math.round(L.base * 1.5)); assert.equal(slow, L.base); assert.ok(helped < slow);
  assert.equal(C.score(L.id, { time: 1e6, hints: 99, mistakes: 99 }), Math.round(L.base * 0.2), 'a floor');
  assert.ok(C.score('classic-expert', { time: 0 }) > C.score('tiny-easy', { time: 0 }));
});

test('the file: its own page (no Oomba Kit), the widget look in light and dark, the scan passes, nothing from outside but the font', () => {
  const r = scanVersion(HTML);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.startsWith('<!doctype html>'));
  assert.ok(!HTML.includes('oomba-kit') && !/Oomba\.(game|ui|sfx|color)\b/.test(HTML), 'outside the Oomba Kit');
  assert.ok(!HTML.includes(kitTag()) && !HTML.includes(kitPackTag('dress')), 'no kit tags');
  assert.deepEqual([...new Set(HTML.match(/https?:\/\/[a-z0-9.-]+/gi))].sort(), ['https://fonts.googleapis.com']);
  assert.match(HTML, /family=Bricolage\+Grotesque/);
  // the classroom dashboard's tokens, light and dark, the dotted board and the dark "Now" bar
  assert.match(HTML, /:root\[data-theme="dark"\]/); assert.match(HTML, /prefers-reduced-motion/);
  assert.match(HTML, /radial-gradient\(var\(--dots\)/); assert.match(HTML, /\.sd-now \{[^}]*background: var\(--current\)/);
  assert.match(HTML, /B\.theme === 'light' \|\| B\.theme === 'dark'/);
  for (const k of ['B.gameOver({ won: true, score: points })', 'B.storage', 'B.sfx.play(', 'B.aiVoiceCheck(', "ai: 'only'"]) assert.ok(HTML.includes(k), k);
  const own = HTML.replace(/<link[^>]+>/g, '');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'eval(', 'new Function', 'localStorage', 'speechSynthesis', '<img', 'url(']) assert.ok(!own.includes(bad), bad);
  assert.doesNotMatch(own, /\u2014/, 'no em dashes');
  // the board reads left to right in every language; words follow the page
  assert.match(HTML, /board\.dir = 'ltr'/); assert.match(HTML, /\.sd-board \{[^}]*direction: ltr/);
  assert.match(HTML, /D\.sd\.dir = DIR/);
  // big targets
  assert.match(HTML, /\.sd-key \{[^}]*min-height: var\(--sd-kh, 52px\)/); assert.match(HTML, /\.sd-tool \{[^}]*min-height: 56px/);
});

test('the words: every key in all 13 languages, the same placeholders, plain digits, no dashes; the spoken lines are registered', () => {
  const keys = Object.keys(I18N.en);
  assert.ok(keys.length >= 50);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of LANGS) {
    assert.ok(I18N[l], l);
    assert.deepEqual(Object.keys(I18N[l]).sort(), [...keys].sort(), `${l}: the same keys`);
    for (const k of keys) {
      assert.ok(typeof I18N[l][k] === 'string' && I18N[l][k].trim(), `${l}.${k}`);
      assert.equal(ph(I18N[l][k]), ph(I18N.en[k]), `${l}.${k}: placeholders`);
      assert.doesNotMatch(I18N[l][k], /[\u2013\u2014]/, `${l}.${k}: no dashes`);
      assert.doesNotMatch(I18N[l][k], /[٠-٩۰-۹]/, `${l}.${k}: Western digits`);
    }
    for (const g of ['g_tiny', 'g_small', 'g_classic']) assert.match(I18N[l][g], /[469]×[469]/, `${l}.${g}: the size as written`);
  }
  assert.match(I18N.ar.title, /[؀-ۿ]/); assert.match(I18N.he.title, /[֐-׿]/); assert.match(I18N.ru.title, /[Ѐ-ӿ]/); assert.match(I18N.ja.title, /[぀-ヿ]/);
  // every key the game's code names is in the table
  const code = HTML.slice(HTML.indexOf('// ==== I18N END ===='));
  const used = new Set([...code.matchAll(/\bt\('([A-Za-z_0-9]+)'(?!\s*\+)/g)].map(m => m[1]));
  assert.ok(used.size >= 25);
  for (const k of used) if (!/_$/.test(k)) assert.ok(k in I18N.en, `t('${k}')`);
  // and every word in the table is used (by name, or by its level, size or picture)
  for (const k of keys) assert.ok(code.includes(`'${k}'`) || /^(g_(tiny|small|classic)(_p)?|d_(easy|medium|hard|expert)|pic[1-4])$/.test(k), `${k} is used`);
  for (const L of LEVELS) { assert.ok(I18N.en['g_' + L.group] && I18N.en['d_' + L.diff], L.id); }
  for (let d = 1; d <= 4; d++) assert.ok(I18N.en['pic' + d], 'pic' + d);
  // the AI voice: the title, the how-to cards and a few fixed lines, never the board's labels
  assert.ok(lines.TTS_GAMES.has('sudoku'));
  for (const k of ['title', 'tag', 'how1', 'how2', 'how3', 'solvedH', 'hinted']) assert.deepEqual(lines.allowedLine('sudoku', 'en', I18N.en[k]), { text: I18N.en[k], role: 'friendly' }, k);
  assert.ok(lines.allowedLine('sudoku', 'fr', I18N.fr.how1));
  for (const k of ['cell', 'cellEmpty', 'board', 'clock', 'winSay']) assert.equal(lines.allowedLine('sudoku', 'en', I18N.en[k]), null, k);
  assert.equal(lines.allowedLine('sudoku', 'en', 'Row 1, column 2, 3'), null);
});

test('registration: seeded, on the Learn shelf as thinking for K-8, described in every language, with a cover', () => {
  assert.ok(SEED_GAMES.includes('sudoku'));
  assert.equal(META.slug, 'sudoku'); assert.equal(META.title, 'Sudoku'); assert.equal(META.category, 'puzzle'); assert.equal(META.shelf, 'learn');
  assert.equal(META.players_max, 1); assert.equal(META.age_rating, 'everyone'); assert.equal(META.orientation, 'any'); assert.ok(META.icon && META.cover && META.notes.length > 800);
  assert.doesNotMatch(JSON.stringify(META), /\u2014/, 'no em dashes');
  assert.deepEqual(SHELF_INFO.sudoku, { subject: 'thinking', from: 0, to: 8 });
  assert.equal(LEARNING.sudoku.key, 'sudoku'); assert.equal(LEARNING.sudoku.level, 'Grades K-8');
  for (const l of LANGS.filter(x => !x.startsWith('en'))) {
    assert.ok(META.l10n[l] && META.l10n[l].description && META.l10n[l].tags, `l10n ${l}`);
    assert.equal(META.l10n[l].title, I18N[l].title, `${l}: the same title as in the game`);
    const loc = JSON.parse(fs.readFileSync(path.join(ROOT, `server/i18n/locales/${l}.json`), 'utf8'));
    assert.ok(loc.learn.games.sudoku, `${l}: learn.games.sudoku`);
  }
  for (const f of ['public/covers/sudoku.jpg', 'public/og/sudoku.jpg', 'scripts/covers/sudoku.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

// ---------------------------------------------------------------- the game in a browser
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
/** The game in the production frame, on a stand-in for the play page that keeps the SDK's messages (window.__msgs). */
async function open({ width = 390, height = 844, lang = 'en', save = {}, touch = true, theme = '', tts = { langs: [] }, reply = 'off' } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Sudoku' }, save, canSave: true, tts, ...(theme ? { theme } : {}) });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type === 'brb:tts' && d.check) return e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: ${JSON.stringify(reply)} === 'ok', check: true }, '*');
  if (d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();   // the look's font (Bricolage Grotesque)
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.pick && document.querySelector('.sd-lv'), null, { timeout: 60_000 });
  const state = () => frame.evaluate(() => window.__brbTest.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const until = (fn, arg, timeout = 20_000) => frame.waitForFunction(fn, arg, { timeout });
  return { ctx, p, frame, state, msgs, until, errors, outside };
}
const label = (frame, i) => frame.evaluate(i => document.querySelector(`.sd-cell[data-i="${i}"]`).getAttribute('aria-label'), i);

test('play: the picker, a 4x4 by taps (a clash, notes, undo, a hint), the win and one game-over message, then a new puzzle', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    // the home: straight to the picker, in the dashboard widget look (light here)
    assert.equal((await g.state()).screen, 'pick');
    const look = await g.frame.evaluate(() => { const c = document.querySelector('.sd-card.sd-widget'), cs = getComputedStyle(c), b = getComputedStyle(document.body);
      return { theme: document.documentElement.dataset.theme, card: cs.backgroundColor, edge: cs.boxShadow.includes('inset'), dots: b.backgroundImage.includes('radial-gradient'), font: b.fontFamily, chip: !!c.querySelector('.sd-wh .sd-wicon'), how: [...document.querySelectorAll('#sd-how li')].length }; });
    assert.deepEqual(look, { theme: 'light', card: 'rgb(255, 253, 242)', edge: true, dots: true, font: look.font, chip: true, how: 3 });
    assert.match(look.font, /^"?Bricolage Grotesque/);
    const levels = await g.frame.evaluate(() => [...document.querySelectorAll('.sd-lv')].map(b => b.dataset.level));
    assert.deepEqual(levels, LEVELS.map(L => L.id), 'every level on the picker');
    assert.equal(await g.frame.evaluate(() => document.querySelector('#sd-continue')), null, 'nothing to continue yet');
    await g.frame.click('#lv-tiny-easy');
    await g.until(() => window.__brbTest.state().screen === 'play');
    let s = await g.state();
    assert.equal(s.size, 4); assert.equal(solutions(s.puzzle.split('').map(Number), 4), 1);
    assert.equal(await g.frame.evaluate(() => document.querySelectorAll('.sd-cell').length), 16);
    assert.equal(await g.frame.evaluate(() => document.querySelector('.sd-board').getAttribute('dir')), 'ltr');
    const empty = [...s.values].map((c, i) => (c === '0' ? i : -1)).filter(i => i >= 0);
    // a clash: the same number as a given in the row shows a '!' and says so
    const i0 = empty[0], r0 = Math.floor(i0 / 4), given = [0, 1, 2, 3].map(c => r0 * 4 + c).find(x => s.puzzle[x] !== '0');
    await g.frame.click(`.sd-cell[data-i="${i0}"]`);
    await g.frame.click(`#sd-k${s.puzzle[given]}`);
    s = await g.state();
    assert.ok(s.conflicts.includes(i0) && s.conflicts.includes(given), 'both boxes clash');
    assert.equal(s.mistakes, 1);
    assert.match(await label(g.frame, i0), /^Row \d, column \d, \d, repeats in its row, column or box$/);
    assert.ok(await g.frame.evaluate(i => document.querySelector(`.sd-cell[data-i="${i}"]`).classList.contains('clash'), i0));
    // undo takes it back
    await g.frame.click('#sd-undo');
    s = await g.state(); assert.equal(s.values[i0], '0'); assert.deepEqual(s.conflicts, []);
    assert.match(await label(g.frame, i0), /^Row \d, column \d, empty$/);
    // notes: jotted, read out, and gone from the boxes that see a placed number
    await g.frame.click('#sd-notes');
    await g.frame.click('#sd-k1'); await g.frame.click('#sd-k2');
    s = await g.state(); assert.equal(s.notes[i0], 0b11); assert.equal(s.noting, true);
    assert.match(await label(g.frame, i0), /notes: 1 2$/);
    await g.frame.click('#sd-notes');
    // a given cannot change
    await g.frame.click(`.sd-cell[data-i="${given}"]`); await g.frame.click('#sd-k1');
    s = await g.state(); assert.equal(s.values[given], s.puzzle[given]);
    // a hint fills the chosen empty box with its answer
    await g.frame.click(`.sd-cell[data-i="${i0}"]`); await g.frame.click('#sd-hint');
    s = await g.state(); assert.equal(s.hints, 1); assert.equal(s.values[i0], s.solution[i0]);
    assert.match(await label(g.frame, i0), /filled by a hint$/);
    // the rest by taps, right answers
    for (const i of empty.slice(1)) { await g.frame.click(`.sd-cell[data-i="${i}"]`); await g.frame.click(`#sd-k${s.solution[i]}`); }
    s = await g.state(); assert.equal(s.screen, 'won'); assert.equal(s.values, s.solution);
    assert.deepEqual({ ...s.lastWin, time: 0, score: 0 }, { id: 'tiny-easy', stars: 2, score: 0, time: 0, hints: 1, mistakes: 1 });
    // the stars card: two stars, the time, hints, mistakes and points, Play again and Levels
    await g.until(() => window.__brbTest.state().done, null, 30_000);
    const card = await g.frame.evaluate(() => { const c = document.querySelector('#sd-solved'); return { h: c.querySelector('h2').textContent, on: c.querySelectorAll('.sd-stars span:not(.off)').length, say: c.querySelector('.sd-stars').getAttribute('aria-label'), stats: c.querySelector('.sd-stats').textContent, buttons: [...c.querySelectorAll('button')].map(b => b.id) }; });
    assert.deepEqual({ ...card, stats: '' }, { h: '🎉 Solved!', on: 2, say: '2 of 3 stars', stats: '', buttons: ['sd-again', 'sd-done-levels'] });
    assert.match(card.stats, new RegExp(`^Time \\d+:\\d\\d · Hints 1 · Mistakes 1 · ${s.lastWin.score} points$`));
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'one game-over message'); assert.equal(over[0].won, true); assert.equal(over[0].score, s.lastWin.score);
    assert.ok(s.best['tiny-easy'] && s.best['tiny-easy'].stars === 2); assert.ok(!s.saved.includes('tiny-easy'), 'a solved puzzle is no longer saved');
    // Play again: a new puzzle at the same level
    await g.frame.getByRole('button', { name: 'Play again' }).click();
    await g.until(() => window.__brbTest.state().screen === 'making' || window.__brbTest.state().screen === 'play');
    await g.until(() => window.__brbTest.state().screen === 'play');
    const s2 = await g.state(); assert.equal(s2.level, 'tiny-easy'); assert.notEqual(s2.puzzle, s.puzzle);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});

test('play: the keyboard, the save and the reload, a picture puzzle, Arabic, and a 360 px phone', { skip, timeout: 120_000 }, async () => {
  let g = await open({ width: 1024, height: 768, touch: false });
  let saved;
  try {
    await g.frame.evaluate(() => window.__brbTest.pick('classic-medium', { seed: 31337 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    let s = await g.state();
    assert.ok(s.givens >= 31 && s.givens <= 35);
    const e = [...s.values].map((c, i) => (c === '0' ? i : -1)).filter(i => i >= 0);
    await g.frame.evaluate(i => window.__brbTest.select(i), e[0]);
    await g.frame.focus(`.sd-cell[data-i="${e[0]}"]`);
    await g.p.keyboard.press(s.solution[e[0]]);
    s = await g.state(); assert.equal(s.values[e[0]], s.solution[e[0]]);
    const r = Math.floor(e[0] / 9), c = e[0] % 9;
    await g.p.keyboard.press(c < 8 ? 'ArrowRight' : 'ArrowLeft'); s = await g.state(); assert.equal(s.sel, r * 9 + (c < 8 ? c + 1 : c - 1));
    await g.p.keyboard.press(r < 8 ? 'ArrowDown' : 'ArrowUp'); s = await g.state(); assert.equal(Math.abs(s.sel - (r * 9 + (c < 8 ? c + 1 : c - 1))), 9);
    await g.frame.evaluate(i => window.__brbTest.select(i), e[1]);
    await g.p.keyboard.press('n'); await g.p.keyboard.press('4'); await g.p.keyboard.press('7'); await g.p.keyboard.press('n');
    s = await g.state(); assert.equal(s.notes[e[1]], (1 << 3) | (1 << 6)); assert.equal(s.noting, false);
    await g.p.keyboard.press('Control+z'); s = await g.state(); assert.equal(s.notes[e[1]], 1 << 3, 'undo takes the last note back');
    await g.frame.evaluate(i => window.__brbTest.select(i), e[2]);
    await g.p.keyboard.press(String(s.solution[e[2]] % 9 + 1)); await g.p.keyboard.press('Backspace');
    s = await g.state(); assert.equal(s.values[e[2]], '0', 'Backspace erases'); assert.equal(s.mistakes, 1, 'the wrong number was counted');
    await g.p.keyboard.press('h'); s = await g.state(); assert.equal(s.hints, 1);
    // the check: a wrong number gets a ✕ and says so
    await g.frame.evaluate(i => window.__brbTest.select(i), e[3]);
    const wrong = (+s.solution[e[3]] % 9) + 1;
    await g.frame.evaluate(() => window.__brbTest.checkMistakes(true));
    await g.p.keyboard.press(String(wrong));
    assert.match(await label(g.frame, e[3]), /not right$/);
    // the game clock: it runs in play and stops in the pause screen
    await g.p.waitForTimeout(2200);
    s = await g.state(); assert.ok(s.time >= 1, `the clock runs (${s.time})`);
    await g.p.keyboard.press('p'); await g.p.waitForTimeout(300);
    assert.ok(await g.frame.evaluate(() => window.__brbTest.state().paused && !!document.querySelector('#sd-paused') && document.querySelector('.sd-board').classList.contains('sd-paused')), 'the pause card, the board hidden');
    const t0 = (await g.state()).time; await g.p.waitForTimeout(1600);
    assert.equal((await g.state()).time, t0, 'paused, the clock stands still');
    const v0 = (await g.state()).values; await g.p.keyboard.press(String(wrong % 9 + 1)); assert.equal((await g.state()).values, v0, 'no moves while paused');
    await g.p.keyboard.press('Escape'); await g.p.waitForTimeout(400);
    assert.equal((await g.state()).paused, false);
    await g.p.waitForTimeout(1300); assert.ok((await g.state()).time > t0, 'the clock runs again');
    // the save: what is on the board is in BRB.storage
    await g.frame.click('#sd-levels');
    await g.until(() => window.__brbTest.state().screen === 'pick');
    saved = await g.frame.evaluate(() => JSON.stringify(BRB.storage.get('sudoku-v1')));
    const before = await g.state();
    assert.deepEqual(before.saved, ['classic-medium']);
    assert.ok(await g.frame.evaluate(() => document.querySelector('#lv-classic-medium .sd-dot') !== null), 'the level says it is in progress');
    await g.ctx.close();
    // the reload: Continue brings back the same board, notes, hints, mistakes and time
    g = await open({ save: { 'sudoku-v1': saved } });
    await g.until(() => window.__brbTest.state().screen === 'pick');
    await g.frame.click('#sd-continue');
    await g.until(() => window.__brbTest.state().screen === 'play');
    s = await g.state();
    const old = JSON.parse(saved).games['classic-medium'];
    assert.equal(s.level, 'classic-medium'); assert.equal(s.values, old.v); assert.deepEqual(s.notes, old.n);
    assert.equal(s.hints, old.h); assert.equal(s.mistakes, old.m); assert.ok(s.time >= old.t);
    assert.equal(s.puzzle, old.p);
    // a 390 px phone: the 9x9 board is square, fits, and nothing scrolls sideways
    const fit = await g.frame.evaluate(() => { const b = document.querySelector('.sd-board').getBoundingClientRect(), k = document.querySelector('.sd-tools').getBoundingClientRect(); return { w: b.width, h: b.height, left: b.left, right: b.right, bottom: k.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; });
    assert.ok(Math.abs(fit.w - fit.h) < 1 && fit.left >= 0 && fit.right <= fit.vw && fit.bottom <= fit.vh && fit.sw <= fit.vw, JSON.stringify(fit));
    assert.ok(fit.w >= 330, `a big board on a phone (${fit.w})`);
    const keys = await g.frame.evaluate(() => [...document.querySelectorAll('.sd-key, .sd-tool')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    assert.ok(Math.min(...keys) >= 44, `44 px targets (${Math.min(...keys)})`);
    assert.deepEqual(g.errors, []);
    await g.ctx.close();
    // a picture puzzle: pictures on the board and the pad, named for a screen reader
    g = await open({ width: 360, height: 640 });
    await g.frame.evaluate(() => { window.__brbTest.pictures(true); window.__brbTest.pick('tiny-medium', { seed: 5 }); });
    await g.until(() => window.__brbTest.state().screen === 'play');
    s = await g.state();
    const given = [...s.puzzle].findIndex(ch => ch !== '0');
    assert.ok(await g.frame.evaluate(i => !!document.querySelector(`.sd-cell[data-i="${i}"] svg`), given), 'a picture in the box');
    assert.match(await label(g.frame, given), new RegExp(`, (${['apple', 'banana', 'grapes', 'carrot'].join('|')}), part of the puzzle$`));
    assert.deepEqual(await g.frame.evaluate(() => [1, 2, 3, 4].map(d => document.querySelector('#sd-k' + d).getAttribute('aria-label'))), ['apple', 'banana', 'grapes', 'carrot']);
    const fit4 = await g.frame.evaluate(() => { const b = document.querySelector('.sd-board').getBoundingClientRect(), k = document.querySelector('.sd-tools').getBoundingClientRect(); return { w: b.width, h: b.height, right: b.right, bottom: k.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; });
    assert.ok(Math.abs(fit4.w - fit4.h) < 1 && fit4.right <= fit4.vw && fit4.bottom <= fit4.vh && fit4.sw <= fit4.vw, JSON.stringify(fit4));
    assert.deepEqual(g.errors, []);
    await g.ctx.close();
    // Arabic: the words mirror, the board does not, and the labels are Arabic
    g = await open({ lang: 'ar' });
    await g.frame.evaluate(() => window.__brbTest.pick('small-easy', { seed: 8 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    assert.deepEqual(await g.frame.evaluate(() => [document.querySelector('.sd').dir, getComputedStyle(document.querySelector('.sd-board')).direction, document.querySelector('#sd-undo span:last-child').textContent]), ['rtl', 'ltr', 'تراجع']);
    assert.match(await label(g.frame, 0), /^الصف 1، العمود 1، /);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close().catch(() => {}); }
});

test('the look: dark from the site theme, How to play in Spanish, Japanese and Arabic, Read it to me only with an AI voice', { skip, timeout: 120_000 }, async () => {
  // dark: the site's theme (BRB.theme), the dark tokens on the cards, the board and the bar
  let g = await open({ theme: 'dark', width: 1024, height: 768, touch: false });
  try {
    let look = await g.frame.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.querySelector('.sd-card')).backgroundColor, getComputedStyle(document.body).backgroundColor]);
    assert.deepEqual(look, ['dark', 'rgb(30, 30, 27)', 'rgb(20, 20, 20)']);
    await g.p.waitForTimeout(300);
    assert.equal(await g.frame.evaluate(() => document.querySelector('#sd-read').hidden), true, 'no AI voice: no Read it to me');
    await g.frame.evaluate(() => window.__brbTest.pick('small-easy', { seed: 8 }));
    await g.until(() => window.__brbTest.state().screen === 'play');
    look = await g.frame.evaluate(() => [getComputedStyle(document.querySelector('.sd-now')).backgroundColor, getComputedStyle(document.querySelector('.sd-cell.given:not(.peer):not(.same):not(.sel)')).backgroundColor]);
    assert.deepEqual(look, ['rgb(102, 199, 146)', 'rgb(30, 30, 27)']);
    // a move: the tap on a box and a number from the pad
    const s = await g.state(), i = [...s.values].indexOf('0');
    await g.frame.click(`.sd-cell[data-i="${i}"]`); await g.frame.click(`#sd-k${s.solution[i]}`);
    assert.equal((await g.state()).values[i], s.solution[i]);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
  // How to play in the player's language (the cards the kit used to show)
  for (const lang of ['es', 'ja', 'ar']) {
    g = await open({ lang });
    try {
      const how = await g.frame.evaluate(() => [document.querySelector('#sd-how-h').textContent, ...[...document.querySelectorAll('#sd-how li')].map(x => x.textContent)]);
      assert.deepEqual(how, ['💡 ' + I18N_OF(lang).howH, I18N_OF(lang).how1, I18N_OF(lang).how2, I18N_OF(lang).how3].map(x => x), lang);
      for (let k = 1; k <= 3; k++) assert.notEqual(how[k], I18N.en['how' + k], `${lang}: card ${k} is not the English`);
    } finally { await g.ctx.close(); }
  }
  // Read it to me: shown only when the platform says the AI voice reads every line; a tap reads them with the AI voice only
  g = await open({ tts: { langs: ['en'], tok: 'x' }, reply: 'ok' });
  try {
    await g.until(() => !document.querySelector('#sd-read').hidden);
    const asked = (await g.msgs('brb:tts')).filter(m => m.check).map(m => m.text);
    assert.deepEqual(asked, [I18N.en.title, I18N.en.how1, I18N.en.how2, I18N.en.how3]);
    for (const t of asked) assert.ok(lines.allowedLine('sudoku', 'en', t), `${t}: an AI-voice line`);
    await g.frame.click('#sd-read');
    await g.p.waitForTimeout(300);
    assert.ok((await g.msgs('brb:tts')).some(m => !m.check && m.text === I18N.en.title), 'read through the AI path');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
const I18N_OF = l => I18N[l];
