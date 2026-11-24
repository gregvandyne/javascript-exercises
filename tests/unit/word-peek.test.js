// Word Peek (seed-games/word-peek.html): the daily five-letter word game with Pip the owl, in Crossword's look (its own
// page, no Oomba Kit; docs/decisions.md "Sudoku and Word Peek in Crossword's look").
// Checked here:
//   - the pure parts, run on their own (node:vm): the word lists, the marks (duplicate letters), hard mode, the daily
//     word (the same for a date, no repeats inside a cycle) and the points;
//   - the file: outside the Oomba Kit, Google Fonts the only outside address, light and dark, the scan passes, speech
//     only through BRB.speak, the save key;
//   - the game in real Chromium inside the production frame: the first visit's How to play, the home in the widget look
//     (light and dark), a practice round typed on the keyboard to a win, the result card, one game-over message and the
//     score, Play again, a rejected word, high contrast, hard mode, the save, reduced motion (no flips), Arabic (the page
//     mirrors, the grid and keys do not), and a 390 px phone with the board and the keyboard in view.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/word-peek.html'), 'utf8');
const block = (a, b) => HTML.slice(HTML.indexOf(a), HTML.indexOf(b) + b.length);

// The word lists and the game's rules on their own (no DOM): CONFIG, the words and the logic block.
const L = (() => {
  const box = {};
  vm.runInNewContext(block('const CONFIG = {', '\n};') + '\n' + block('/* WORDS-START', '/* LOGIC-END */') +
    '\nthis.out = { CONFIG, ANSWER_LIST, ALLOWED, GLOSSARY, isAllowed, isBlocked, scoreGuess, keyboardMarks, hardModeError, dailyAnswer, winPoints, nextDay };', box);
  return box.out;
})();

test('the rules on their own: lists, marks with repeated letters, hard mode, the daily word and the points', () => {
  for (const n of [4, 5, 6]) {
    assert.ok(L.ANSWER_LIST[n].length > 200, `${n}-letter answers`);
    assert.ok(L.ANSWER_LIST[n].every(w => w.length === n && L.GLOSSARY[w]), `${n}: every answer has a meaning`);
    assert.ok(L.ALLOWED[n].size > L.ANSWER_LIST[n].length);
  }
  assert.ok(L.isAllowed('crane') && L.isAllowed('CRANE') && !L.isAllowed('zzzzz'));
  assert.deepEqual([...L.scoreGuess('stare', 'crane')], ['miss', 'miss', 'hit', 'near', 'hit']);
  assert.deepEqual([...L.scoreGuess('eerie', 'crane')], ['miss', 'miss', 'near', 'miss', 'hit'], 'one E is in the right spot, the other two count once');
  assert.deepEqual([...L.scoreGuess('crane', 'crane')], ['hit', 'hit', 'hit', 'hit', 'hit']);
  const g = [{ word: 'stare', marks: L.scoreGuess('stare', 'crane') }];
  assert.equal(L.hardModeError('plant', g), 'Letter 5 must be E');
  assert.equal(L.hardModeError('crane', g), '');
  assert.equal(L.keyboardMarks(g).a, 'hit');
  const a = L.dailyAnswer('2026-11-24');
  assert.equal(a, L.dailyAnswer('2026-11-24'), 'the same word for the same day');
  assert.ok(L.ANSWER_LIST[5].includes(a));
  const days = []; let d = '2026-01-01'; for (let i = 0; i < 200; i++) { days.push(L.dailyAnswer(d)); d = L.nextDay(d); }
  assert.equal(new Set(days).size, days.length, 'no word twice in 200 days');
  assert.equal(L.winPoints(5, 2, false), 50); assert.equal(L.winPoints(5, 2, true), 75); assert.equal(L.winPoints(4, 6, false), 8);
});

test('the file: its own page (no Oomba Kit), light and dark, only Google Fonts from outside, the scan passes', () => {
  assert.ok(HTML.startsWith('<!doctype html>'));
  assert.ok(!HTML.includes('oomba-kit') && !/\bOomba\./.test(HTML), 'outside the Oomba Kit');
  const r = scanVersion(HTML);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.deepEqual([...new Set(HTML.match(/https?:\/\/[a-z0-9.-]+/gi))].sort(), ['https://fonts.googleapis.com']);
  assert.match(HTML, /:root\[data-theme="dark"\]/); assert.match(HTML, /prefers-reduced-motion/); assert.match(HTML, /radial-gradient\(var\(--dots\)/);
  assert.match(HTML, /\.wp-now \{[^}]*background: var\(--current\)/, 'Pip talks in the dark Now bar');
  assert.match(HTML, /\.hc \{[^}]*--hit: var\(--hcHit\)/, 'high contrast swaps the colours');
  for (const k of ["const SAVE_KEY = 'word-peek-v1'", "BRB.score.submit(save.points, 'word points')", 'BRB.gameOver({ won: S.won, score: save.points })', 'BRB.sfx.play(', 'B.theme === \'light\'']) assert.ok(HTML.includes(k), k);
  for (const bad of ['speechSynthesis', 'fetch(', 'XMLHttpRequest', 'localStorage', '<img', 'eval(']) assert.ok(!HTML.includes(bad), bad);
  assert.doesNotMatch(HTML, /\u2014/, 'no em dashes');
});

// ---------------------------------------------------------------- the game in a browser
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ width = 1280, height = 900, lang = 'en', save = {}, theme = '', reduced = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 700, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang, dir: ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Word Peek' }, save, canSave: true, tts: { langs: [] }, ...(theme ? { theme } : {}) });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();   // the look's font (Bricolage Grotesque)
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 60_000 });
  const state = () => frame.evaluate(() => window.__brbTest.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const until = (fn, arg, timeout = 20_000) => frame.waitForFunction(fn, arg, { timeout });
  return { ctx, p, frame, state, msgs, until, errors, outside };
}
const SEEN = JSON.stringify({ seenHelp: true });

test('play: How to play on the first visit, the home in the widget look, a round typed to a win, the result card, Play again', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    // the first visit: How to play opens; Escape closes it
    await g.until(() => !document.querySelector('#helpScreen').hidden);
    assert.equal((await g.state()).panel, 'help');
    await g.p.keyboard.press('Escape');
    await g.until(() => document.querySelector('#helpScreen').hidden);
    // the home: a widget card on the dotted board, Pip in the chip, the five modes, light
    const look = await g.frame.evaluate(() => { const c = document.querySelector('#homeScreen'), cs = getComputedStyle(c), b = getComputedStyle(document.body);
      return { theme: document.documentElement.dataset.theme, card: cs.backgroundColor, edge: cs.boxShadow.includes('inset'), dots: b.backgroundImage.includes('radial-gradient'), font: b.fontFamily.split(',')[0].replace(/"/g, ''),
        pip: !!c.querySelector('.wp-wicon svg.wp-owl'), modes: [...c.querySelectorAll('[data-mode]')].map(b => b.dataset.mode), daily: getComputedStyle(c.querySelector('#modeDaily')).backgroundColor }; });
    assert.deepEqual(look, { theme: 'light', card: 'rgb(255, 253, 242)', edge: true, dots: true, font: 'Bricolage Grotesque', pip: true, modes: ['daily', 'practice', 'little', 'big', 'friend'], daily: 'rgb(20, 20, 20)' });
    // a practice round, typed on the keyboard
    await g.frame.evaluate(() => window.__brbTest.start({ mode: 'practice', answer: 'crane' }));
    assert.ok(await g.frame.evaluate(() => !document.querySelector('#app').hidden && document.querySelector('#homeScreen').hidden && document.querySelectorAll('#grid .tile').length === 30));
    assert.equal(await g.frame.evaluate(() => getComputedStyle(document.querySelector('.wp-now')).backgroundColor), 'rgb(20, 20, 20)', 'the dark bar');
    // a word that is not in the list is turned away, and Pip says so in the bar
    await g.p.keyboard.type('zzzzz'); await g.p.keyboard.press('Enter');
    assert.equal(await g.frame.evaluate(() => document.querySelector('#bubble').textContent), 'Not in my word list');
    assert.equal((await g.state()).guesses.length, 0);
    for (let i = 0; i < 5; i++) await g.p.keyboard.press('Backspace');
    for (const w of ['stare', 'crane']) {
      await g.p.keyboard.type(w); await g.p.keyboard.press('Enter');
      await g.until(() => !window.__brbTest.state().busy, null, 8000);
    }
    const s = await g.state();
    assert.deepEqual([s.over, s.won, s.guesses.map(x => x.word), s.lastPoints, s.keyboard.c, s.points], [true, true, ['stare', 'crane'], 50, 'hit', 50]);
    // the marks have shapes as well as colours: a tick on the right spot, a dot on the wrong spot
    const marks = await g.frame.evaluate(() => [...document.querySelectorAll('#grid .row:first-child .tile')].map(t => [t.className.replace('tile ', ''), getComputedStyle(t.querySelector('.mk')).display, t.getAttribute('aria-label')]));
    assert.deepEqual(marks.map(m => m[0]), ['miss', 'miss', 'hit', 'near', 'hit']);
    assert.deepEqual(marks.map(m => m[1]), ['none', 'none', 'grid', 'grid', 'grid']);
    assert.equal(marks[2][2], 'A right spot');
    // the result card
    await g.until(() => !document.querySelector('#resScreen').hidden, null, 8000);
    const res = await g.frame.evaluate(() => ({ title: document.querySelector('#resTitle').textContent, word: [...document.querySelectorAll('#resWord .tile')].map(t => t.textContent).join(''), def: !!document.querySelector('#resDef').textContent, pts: document.querySelector('#resPts').textContent, owl: !!document.querySelector('#resOwl svg.cheer'), buttons: [...document.querySelectorAll('#resBtns button')].map(b => b.id) }));
    assert.deepEqual(res, { title: '🎉 Amazing!', word: 'CRANE', def: true, pts: '+50 points · ⭐ 50 word points', owl: true, buttons: ['resMain', 'resHome'] });
    const over = await g.msgs('brb:gameover'), score = await g.msgs('brb:score');
    assert.equal(over.length, 1, 'one game-over message'); assert.deepEqual([over[0].won, over[0].score], [true, 50]);
    assert.ok(score.some(m => m.score === 50 && m.label === 'word points'));
    // the save: the same key and shape (settings, points, stats per mode, recent words)
    const saved = await g.frame.evaluate(() => BRB.storage.get('word-peek-v1'));
    assert.deepEqual([saved.v, saved.points, saved.stats.practice.wins, saved.stats.practice.dist[1], saved.recent.practice, saved.round, saved.seenHelp], [1, 50, 1, 1, ['crane'], null, true]);
    // Play again: a new practice round
    await g.frame.click('#resMain');
    const s2 = await g.state();
    assert.deepEqual([s2.screen, s2.mode, s2.over, s2.guesses.length, s2.panel], ['play', 'practice', false, 0, null]);
    assert.notEqual(s2.answer, 'crane');
    // home again
    await g.frame.click('#homeBtn');
    assert.equal((await g.state()).screen, 'home');
    assert.match(await g.frame.evaluate(() => document.querySelector('#homePoints').textContent), /50 word points/);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});

test('play: dark, high contrast, hard mode, reduced motion, Arabic, and a 390 px phone', { skip, timeout: 120_000 }, async () => {
  let g = await open({ theme: 'dark', width: 390, height: 844, save: { 'word-peek-v1': SEEN }, reduced: true });
  try {
    assert.equal(await g.frame.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor].join()), 'dark,rgb(20, 20, 20)');
    assert.equal((await g.state()).panel, null, 'How to play only on the first visit');
    // high contrast and hard mode from the settings card
    await g.frame.click('#setBtn');
    await g.frame.click('#swContrast'); await g.frame.click('#swHard');
    assert.deepEqual(await g.frame.evaluate(() => [document.querySelector('#swContrast').getAttribute('aria-checked'), document.querySelector('#swHard').getAttribute('aria-checked'), document.querySelector('#game').classList.contains('hc')]), ['true', 'true', true]);
    await g.p.keyboard.press('Escape');
    await g.frame.evaluate(() => window.__brbTest.start({ mode: 'practice', answer: 'crane' }));
    assert.equal(await g.frame.evaluate(() => document.querySelector('#modeName').textContent), 'Practice · Hard');
    await g.frame.evaluate(() => { window.__brbTest.type('stare'); window.__brbTest.enter(); });
    assert.equal(await g.frame.evaluate(() => document.querySelectorAll('.tile.flip').length), 0, 'reduced motion: no flips');
    await g.until(() => !window.__brbTest.state().busy, null, 8000);
    // high contrast: the right spot is orange, not green
    assert.equal(await g.frame.evaluate(() => getComputedStyle(document.querySelector('#grid .tile.hit')).backgroundColor), 'rgb(255, 138, 61)');
    assert.equal(await g.frame.evaluate(() => window.__brbTest.guess('plant')), 'Letter 5 must be E', 'hard mode');
    // the phone: the board and the keyboard both in view, no sideways scroll, keys at least 44 px tall
    const fit = await g.frame.evaluate(() => { const k = document.querySelector('#kb').getBoundingClientRect(); return { bottom: k.bottom, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth, key: document.querySelector('.key[data-k="q"]').getBoundingClientRect().height, tile: document.querySelector('#grid .tile').getBoundingClientRect().width }; });
    assert.ok(fit.bottom <= fit.vh && fit.sw <= fit.vw && fit.key >= 44 && fit.tile >= 40, JSON.stringify(fit));
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
  // Arabic: the page mirrors, the grid and the keyboard stay left to right (it is an English word game)
  g = await open({ lang: 'ar', save: { 'word-peek-v1': SEEN } });
  try {
    await g.frame.evaluate(() => window.__brbTest.start({ mode: 'little', answer: 'frog' }));
    const r = await g.frame.evaluate(() => [document.documentElement.dir, getComputedStyle(document.querySelector('#grid')).direction, getComputedStyle(document.querySelector('#kb')).direction, document.querySelectorAll('#grid .row:first-child .tile').length]);
    assert.deepEqual(r, ['rtl', 'ltr', 'ltr', 4]);
    assert.match(await g.frame.evaluate(() => document.querySelector('#bubble').textContent), /[؀-ۿ]/);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
