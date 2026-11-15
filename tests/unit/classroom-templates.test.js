// The classroom starters (server/builder/templates: quiet, categories, survey, bingo, flashcards, exitticket, spinner,
// scoreboard) in a real browser, with a stand-in BRB: each loads with no console errors and no sideways scroll at
// 1280 and 390 wide (and right to left), its test hook starts it, nothing goes to the network, the quiet game still works
// as a calm timer when the microphone is refused, missing or not offered, it reacts to the room when it is on, and the
// survey's private mode shows results only from the threshold (polls.js MIN_SHOWN) up. Skipped when no Chromium is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { CLASSROOM_TEMPLATE_KEYS } = await import('../../server/builder/catalog.js');
const { MIN_SHOWN } = await import('../../server/services/polls.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

let browser;
test.before(async () => { if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); });
test.after(async () => { if (browser) await browser.close(); });

/** A stand-in for the SDK: what the starters use. loud: what BRB.loudness.start() answers ('none': no BRB.loudness). */
const stub = ({ lang = 'en', dir = 'ltr', loud = 'denied' } = {}) => `window.__calls = [];
  window.BRB = { user: { lang: '${lang}', dir: '${dir}' }, preview: true,
    sfx: { muted: false, play() {}, mute() { this.muted = !this.muted; return this.muted; } }, speak(t) { __calls.push(['speak', t]); return true; }, stopSpeaking() {}, fx: { confetti() {} },
    gameOver(r) { __calls.push(['gameOver', r]); }, fullscreen() {}, storage: { get() {}, set() { __calls.push(['storage']); }, remove() {} },
    poll() { __calls.push(['poll']); return Promise.resolve(null); },
    ${loud === 'none' ? '' : `loudness: { available: async () => true, start: async () => { __calls.push(['loudStart']); return '${loud}'; }, on(fn) { window.__feed = fn; return () => {}; }, onState(fn) { window.__state = fn; return () => {}; }, stop() { __calls.push(['loudStop']); } },`}
  };`;
async function open(key, { width = 1280, height = 720, ...o } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [], requests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!/^(data|about|blob):/.test(r.url())) requests.push(r.url()); });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${stub(o)}</script></head><body>${loadTemplate(key)}</body></html>`);
  await page.waitForTimeout(150);
  return { page, errors, requests };
}
const state = page => page.evaluate(() => window.__brbTest.state());

for (const key of CLASSROOM_TEMPLATE_KEYS) {
  test(`${key}: loads and starts at 1280 and 390 wide (and right to left) with no console errors and no sideways scroll`, { skip }, async () => {
    for (const [width, height, lang, dir] of [[1280, 720, 'en', 'ltr'], [390, 844, 'en', 'ltr'], [390, 844, 'ar', 'rtl']]) {
      const { page, errors, requests } = await open(key, { width, height, lang, dir });
      assert.ok(await page.evaluate(() => typeof window.__brbTest.state === 'function' && typeof window.__brbTest.start === 'function'));
      const before = JSON.stringify(await state(page));
      await page.evaluate(() => window.__brbTest.start()); await page.waitForTimeout(250);
      // categories, flashcards and the scoreboard open straight into play (start() is a reset there)
      if (!['categories', 'flashcards', 'scoreboard'].includes(key)) assert.notEqual(JSON.stringify(await state(page)), before, `${key}: start() starts it`);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, title: document.title,
        small: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 44).map(b => b.textContent) }));
      assert.ok(m.sw <= m.cw, `${key} ${width} ${lang}: no sideways scroll (${m.sw} > ${m.cw})`);
      assert.deepEqual(m.small, [], `${key} ${width}: every button at least 44 px tall`);
      assert.ok(m.title.length > 2);
      assert.deepEqual(errors, [], `${key} ${width} ${lang}`); assert.deepEqual(requests, [], `${key}: nothing goes to the network`);
      assert.deepEqual(await page.evaluate(() => __calls.filter(c => c[0] === 'storage' || c[0] === 'poll')), [], `${key}: never saves or polls`);
      await page.close();
    }
  });
}

test('quiet game: the microphone refused, missing or not offered, it is a calm quiet timer that still counts and rewards', { skip }, async () => {
  for (const loud of ['denied', 'nodevice', 'busy', 'none']) {
    const { page, errors } = await open('quiet', { loud });
    assert.equal(await page.isVisible('#privacy'), true);
    assert.equal(await page.textContent('#privacy'), 'The game only listens for how loud it is. Nothing is recorded or saved.');
    await page.click('#listen'); await page.waitForTimeout(1300);
    const s = await state(page);
    assert.equal(s.screen, 'play'); assert.equal(s.mode, 'timer', loud);
    assert.ok(s.quietSeconds >= 1, `${loud}: the clock runs (${s.quietSeconds})`);
    assert.match(await page.textContent('#modeChip'), loud === 'none' ? /can’t listen/ : loud === 'denied' ? /blocked/ : loud === 'nodevice' ? /No microphone/ : /busy/);
    assert.equal(await page.isVisible('#meter'), false); assert.equal(await page.isVisible('#tooLoud'), true);
    // the teacher's Too loud holds the sky; then stars come with quiet time and the goal ends it happily
    await page.click('#tooLoud'); const held = (await state(page)).quietSeconds; await page.waitForTimeout(1100);
    assert.equal((await state(page)).loud, true); assert.equal((await state(page)).quietSeconds, held, 'the clock waits while it is too loud');
    assert.equal(await page.isVisible('#shh'), true);
    await page.evaluate(() => window.__brbTest.advance(400));
    const end = await state(page);
    assert.equal(end.screen, 'done'); assert.ok(end.stars >= 29, `${end.stars} stars`);
    assert.deepEqual(await page.evaluate(() => __calls.filter(c => c[0] === 'gameOver')), [['gameOver', { won: true, score: null }]]);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('quiet game: with the microphone on, it calibrates to the room and waits while the room is loud', { skip }, async () => {
  const { page, errors } = await open('quiet', { loud: 'on' });
  await page.click('#listen');
  await page.evaluate(() => { window.__db = -60; window.__t = setInterval(() => window.__feed(window.__db), 50); });
  await page.waitForTimeout(3600);
  let s = await state(page); assert.equal(s.mode, 'mic'); assert.equal(s.loud, false); assert.ok(s.quietSeconds >= 2, `quiet counted (${s.quietSeconds})`);
  assert.equal(await page.isVisible('#meter'), true); assert.match(await page.textContent('#modeChip'), /Listening \(only how loud\)/);
  await page.evaluate(() => { window.__db = -20; }); await page.waitForTimeout(1500);
  s = await state(page); assert.equal(s.loud, true, 'a loud room'); const at = s.quietSeconds;
  await page.waitForTimeout(800); assert.equal((await state(page)).quietSeconds, at, 'the clock waits');
  await page.evaluate(() => { window.__db = -62; }); await page.waitForTimeout(3500);
  assert.equal((await state(page)).loud, false, 'calm again');
  // the page stops listening (the teacher pressed Stop): it carries on as a quiet timer
  await page.evaluate(() => { clearInterval(window.__t); window.__state('stopped'); }); await page.waitForTimeout(1200);
  s = await state(page); assert.equal(s.mode, 'timer'); assert.match(await page.textContent('#modeChip'), /quiet timer/);
  await page.click('#end');
  assert.deepEqual(await page.evaluate(() => __calls.map(c => c[0]).filter(c => c.startsWith('loud'))), ['loudStart'], 'started once, from the tap');
  assert.deepEqual(errors, []);
  await page.close();
});

test(`class survey: "Pass the device" shows results only from ${MIN_SHOWN} answers; only counts, never which choice was whose`, { skip }, async () => {
  const { page, errors } = await open('survey', { width: 390, height: 844 });
  await page.click('#private');
  const answer = async k => { await page.click('#readyBtn'); await page.locator('.pick').nth(k).click(); assert.equal(await page.isVisible('#thanks'), true); assert.doesNotMatch(await page.textContent('#thanks'), /Easy|Just right|Tricky/, 'the choice is never shown back'); };
  for (const k of [0, 1, 1, 2]) await answer(k);
  await page.evaluate(() => document.getElementById('readyShow').click());
  assert.equal(await page.isVisible('#tooFew'), true); assert.equal(await page.locator('#bars .barrow').count(), 0, `under ${MIN_SHOWN}: no results`);
  assert.match(await page.textContent('#tooFew'), new RegExp(`once ${MIN_SHOWN} people have answered`));
  await page.click('#resBack'); await answer(1);
  await page.evaluate(() => document.getElementById('readyShow').click());
  assert.equal(await page.isVisible('#tooFew'), false); assert.equal(await page.locator('#bars .barrow').count(), 4);
  assert.deepEqual((await state(page)).counts[0], [1, 3, 1, 0], 'counts only');
  assert.deepEqual(await page.locator('#bars .val').allTextContents(), ['1 · 20%', '3 · 60%', '1 · 20%', '0 · 0%']);
  assert.deepEqual(errors, []); await page.close();
  // "Count hands": the hands are up in the room for all to see, so the counts show at once; keys 1-4 and Shift take away
  const h = await open('survey');
  await h.page.click('#hands'); await h.page.keyboard.press('1'); await h.page.keyboard.press('2'); await h.page.keyboard.press('2'); await h.page.keyboard.press('Shift+Digit2');
  assert.deepEqual((await state(h.page)).counts[0], [1, 1, 0, 0]);
  await h.page.keyboard.press('PageDown');
  assert.equal(await h.page.locator('#bars .barrow').count(), 4);
  assert.deepEqual(h.errors, []); await h.page.close();
});

test('category board, spinner, scoreboard, bingo, flashcards and exit ticket: their keys and clicker keys work', { skip }, async () => {
  let { page, errors } = await open('categories');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  let s = await state(page); assert.equal(s.screen, 'clue'); assert.deepEqual(s.open, [1, 1]);
  await page.keyboard.press('PageDown'); assert.equal((await state(page)).shown, true);
  await page.keyboard.press('2'); s = await state(page); assert.deepEqual(s.scores, [0, 200, 0]); assert.equal(s.turn, 2); assert.equal(s.screen, 'board');
  assert.doesNotMatch(await page.content(), /jeopardy|\$\d/i);
  assert.deepEqual(errors, []); await page.close();

  ({ page, errors } = await open('scoreboard'));
  for (const k of ['1', '1', '3', 'Shift+Digit1', 'u']) await page.keyboard.press(k);
  assert.deepEqual((await state(page)).scores, [2, 0, 1, 0], 'two for team 1, one for team 3, and Undo took back the Shift+1');
  await page.keyboard.press('r'); assert.equal((await state(page)).asking, true); await page.click('#yes');
  assert.deepEqual((await state(page)).scores, [0, 0, 0, 0]); assert.deepEqual(errors, []); await page.close();

  ({ page, errors } = await open('spinner'));
  await page.keyboard.press('Space'); await page.waitForTimeout(4400);
  s = await state(page); assert.match(s.result, /^Team [1-4]$/); assert.equal(s.left, 3, 'a pick leaves the wheel');
  assert.deepEqual(errors, []); await page.close();

  ({ page, errors } = await open('bingo'));
  await page.click('#caller'); for (let i = 0; i < 3; i++) await page.keyboard.press('PageDown');
  assert.equal((await state(page)).called, 3); await page.keyboard.press('PageUp'); assert.equal((await state(page)).called, 2);
  await page.click('#newCard').catch(() => {}); await page.evaluate(() => document.getElementById('newCard').click());
  const cells = page.locator('.cell'); assert.equal(await cells.count(), 25); assert.equal(await page.locator('.cell.free').count(), 1);
  for (const i of [10, 11, 13, 14]) await cells.nth(i).click();
  assert.equal((await state(page)).bingo, true, 'a line with the free middle');
  assert.deepEqual(errors, []); await page.close();

  ({ page, errors } = await open('flashcards'));
  await page.keyboard.press('ArrowUp'); assert.equal((await state(page)).over, true); await page.keyboard.press('g');
  s = await state(page); assert.equal(s.got, 1); assert.equal(s.over, false);
  await page.evaluate(() => document.getElementById('read').click());
  const spoken = await page.evaluate(() => __calls.filter(c => c[0] === 'speak').map(c => c[1]));
  assert.equal(spoken.length, 1); assert.ok(loadTemplate('flashcards').includes(`'${spoken[0]}'`), 'read aloud: a fixed line of the game, exactly as written');
  assert.deepEqual(errors, []); await page.close();

  ({ page, errors } = await open('exitticket'));
  await page.click('#go'); await page.keyboard.press('1'); await page.keyboard.press('PageDown'); await page.keyboard.press('2'); await page.keyboard.press('Enter');
  await page.keyboard.press('3'); await page.keyboard.press('Enter');
  s = await state(page); assert.equal(s.screen, 'done'); assert.equal(s.right, 2); assert.equal(s.marked, 2);
  assert.equal(await page.textContent('#doneP'), 'You got 2 of 2 right.');
  assert.deepEqual(await page.evaluate(() => __calls.filter(c => c[0] === 'gameOver')), [['gameOver', { won: true, score: null }]], 'no score submitted');
  assert.deepEqual(errors, []); await page.close();
});
