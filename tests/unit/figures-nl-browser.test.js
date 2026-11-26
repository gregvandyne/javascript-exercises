// Figures: a friendlier number line, in a real browser (public/js/figures-editor.js, public/js/figures-nl.js;
// docs/decisions.md "Figures: a friendlier number line"). On an iPhone-sized screen (390 by 844) and a laptop: no sideways
// scroll, boxes 16px or larger (so iOS never zooms the page wider than the screen), the generated code hidden until asked
// for, negatives typed with a minus or the ± key (the iOS number pad has none), fractions typed as 3/4, an interval or a
// point outside the range widens it with a note (never the red cannot-draw panel) and "Keep 2 to 5" goes back, a reversed
// range or a zero step said next to its box while the last good figure stays, intervals and points added and edited in
// rows (open, closed, running off the line), and the tab bar out of the way while a box has the keyboard. FIG_SHOTS=<dir>
// saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigNumberLine', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const PHONE = () => ({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
const LAPTOP = () => ({ viewport: { width: 1366, height: 900 } });
async function open(path, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector('#fg-figure svg');
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no sideways scroll ${what}`);
const code = page => page.textContent('#fg-code');
const data = async page => { const c = await code(page); return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); };
const panel = page => page.isVisible('#fg-cant');

for (const [label, opts] of [['phone', PHONE], ['laptop', LAPTOP]]) {
  test(`the number line on a ${label}: code hidden, negatives, the range widens instead of a red panel, reversed and zero said inline`, { skip }, async () => {
    const { ctx, page, errors } = await open('/figures/numberLine', opts());
    await noSideScroll(page, 'on load');
    // the generated code is there for builders, behind "Advanced: show code"
    assert.equal(await page.isVisible('#fg-code'), false, 'the code is hidden by default');
    assert.equal(await page.$eval('#fg-codebox', d => d.open), false);
    // every box is text the phone can put a minus in; 16px or larger so iOS never zooms
    for (const k of ['from', 'to', 'step']) {
      assert.equal(await page.getAttribute(`#fg-f-${k}`, 'type'), 'text', k);
      assert.notEqual(await page.getAttribute(`#fg-f-${k}`, 'inputmode'), 'numeric');
    }
    if (label === 'phone') {
      const sizes = await page.$$eval('.fg-editor .input', els => els.filter(e => e.offsetParent).map(e => parseFloat(getComputedStyle(e).fontSize)));
      assert.ok(sizes.length > 4 && sizes.every(s => s >= 16), `boxes at 16px or more: ${sizes}`);
    }
    await shot(page, `nl-${label}-start`);

    // the owner's report: "from" 2 with the example's interval from -3: the range widens, gently
    await page.fill('#fg-f-from', '2');
    await page.waitForTimeout(1100);
    assert.equal(await panel(page), false, 'no cannot-draw panel');
    assert.match(await page.textContent('#fg-nlnote'), /Range widened to -3 to 5/);
    let d = await data(page); assert.equal(d.from, -3); assert.equal(d.to, 5);
    assert.equal(await page.isDisabled('[data-act="svg"]'), false, 'the figure can still be downloaded');
    assert.doesNotMatch(await page.innerHTML('#fg-figure'), /cannot be drawn/);
    await shot(page, `nl-${label}-widened`);
    // "Keep 2 to 5" keeps the teacher's range and leaves out the interval that did not fit
    await page.click('[data-act="nlkeep"]');
    d = await data(page); assert.equal(d.from, 2); assert.equal(d.intervals, undefined);
    assert.equal(await page.inputValue('#fg-f-from'), '2');
    assert.equal(await panel(page), false);
    await page.click('[data-act="undo"]');
    await page.waitForFunction(() => document.getElementById('fg-code').textContent.includes('"intervals"'));

    // negatives: typed with a minus, or with the ± key on a touch screen (the iOS number pad has no minus)
    await page.fill('#fg-f-from', '-8');
    await page.locator('#fg-question').focus();
    assert.equal((await data(page)).from, -8);
    if (label === 'phone') {
      assert.equal(await page.isVisible('[data-pm="fg-f-to"]'), true, 'the ± key shows on a touch screen');
      await page.fill('#fg-f-to', '2');
      await page.tap('[data-pm="fg-f-to"]');
      assert.equal(await page.inputValue('#fg-f-to'), '-2');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fg-f-to', 'the box keeps the keyboard');
      assert.equal((await data(page)).to, 4, 'from -8 to -2 cannot hold the interval up to 4: widened to 4');
      await page.tap('[data-pm="fg-f-to"]');
      assert.equal(await page.inputValue('#fg-f-to'), '2');
    } else assert.equal(await page.isVisible('[data-pm="fg-f-to"]'), false, 'no ± key with a mouse');
    // half-typed numbers wait quietly; words that are not numbers are said under their box only
    await page.fill('#fg-f-to', '-');
    assert.equal(await panel(page), false); assert.equal(await page.textContent('#fg-f-to-m'), '');
    await page.fill('#fg-f-to', 'abc');
    assert.match(await page.textContent('#fg-f-to-m'), /Type a number/);
    assert.equal(await panel(page), false);
    await page.locator('#fg-question').focus();
    assert.notEqual(await page.inputValue('#fg-f-to'), 'abc', 'leaving the box puts the figure\'s number back');
    assert.equal(await page.textContent('#fg-f-to-m'), '');

    // a reversed range and a zero step are said next to their box; the last good figure stays (faded)
    await page.fill('#fg-f-to', '-20');
    await page.waitForTimeout(1100);
    assert.match(await page.textContent('#fg-f-to-m'), /Make "to" bigger than "from"/);
    assert.equal(await panel(page), false); assert.equal(await page.isVisible('#fg-stale'), true);
    assert.doesNotMatch(await page.innerHTML('#fg-figure'), /cannot be drawn/);
    assert.equal(await page.isDisabled('[data-act="svg"]'), true, 'nothing wrong is exported');
    await page.fill('#fg-f-to', '5'); await page.fill('#fg-f-step', '0');
    assert.match(await page.textContent('#fg-f-step-m'), /more than 0/);
    await page.fill('#fg-f-step', '0.3');
    assert.match(await page.textContent('#fg-f-step-m'), /end on a tick/);
    await page.fill('#fg-f-step', '1/2');
    assert.deepEqual((await data(page)).step, [1, 2]); assert.equal(await page.textContent('#fg-f-step-m'), '');
    assert.equal(await page.isVisible('#fg-stale'), false);
    await noSideScroll(page, 'after editing');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('the number line on a phone: intervals and points in rows, ends open, closed or running off; the tab bar steps aside', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/numberLine', PHONE());
  // the example's interval: -3 open, 4 closed
  assert.equal(await page.inputValue('#fg-iv0-from'), '-3');
  assert.equal(await page.inputValue('[data-nl-end][data-i="0"][data-k="from"]'), 'open');
  assert.equal(await page.inputValue('[data-nl-end][data-i="0"][data-k="to"]'), 'closed');
  // the right end runs off the line: an arrow, no circle there
  await page.selectOption('[data-nl-end][data-i="0"][data-k="to"]', 'ray');
  let d = await data(page); assert.deepEqual(d.intervals, [{ from: -3, fromClosed: false }]);
  assert.equal(await page.$$eval('#fg-figure .of-ray', r => r.length), 1);
  assert.equal(await page.isDisabled('#fg-iv0-to'), true);
  await page.selectOption('[data-nl-end][data-i="0"][data-k="to"]', 'closed');
  d = await data(page); assert.ok(d.intervals[0].to > -3, 'the end comes back after the other end');
  // a point typed past the end widens the line; a fraction lands on its tick
  await page.click('[data-act="nladd"][data-list="points"]');
  await page.fill('#fg-pt0-at', '7');
  d = await data(page); assert.equal(d.to, 7); assert.deepEqual(d.points, [{ at: 7, label: 'A' }]);
  assert.match(await page.textContent('#fg-nlnote'), /Range widened to -5 to 7/);
  await page.fill('#fg-pt0-at', '-3/2');
  assert.deepEqual((await data(page)).points[0].at, [-3, 2]);
  await page.selectOption('[data-nl-mark][data-i="0"]', 'cross');
  assert.equal(await page.$$eval('#fg-figure .of-cross', r => r.length), 1);
  // an interval the wrong way round is said in its row, not in a red panel
  await page.click('[data-act="nladd"][data-list="intervals"]');
  await page.fill('#fg-iv1-from', '4'); await page.fill('#fg-iv1-to', '1');
  await page.waitForTimeout(1100);
  assert.match(await page.textContent('[data-row="interval 2"] [data-rowmsg]'), /right end has to be bigger/);
  assert.equal(await panel(page), false);
  await page.click('[data-act="nldel"][data-list="intervals"][data-i="1"]');
  assert.equal((await data(page)).intervals.length, 1);
  // the tab bar is never over a box with the keyboard up
  await page.focus('#fg-f-from');
  await page.waitForFunction(() => document.body.classList.contains('fg-kb'));
  assert.equal(await page.$eval('.tabbar', el => getComputedStyle(el).display), 'none');
  const over = await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.tabbar').getBoundingClientRect(); return b.height > 0 && a.bottom > b.top && a.top < b.bottom; });
  assert.equal(over, false);
  await shot(page, 'nl-phone-rows-typing');
  await page.locator('#fg-f-from').blur();
  await page.waitForFunction(() => !document.body.classList.contains('fg-kb'));
  assert.notEqual(await page.$eval('.tabbar', el => getComputedStyle(el).display), 'none', 'back when the box is left');
  // the code, when asked for
  await page.click('#fg-codebox summary');
  assert.equal(await page.isVisible('#fg-code'), true);
  assert.match(await code(page), /^OF\.svg\('numberLine', \{/);
  await noSideScroll(page, 'with rows and code open');
  await shot(page, 'nl-phone-rows');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('other kinds share the editor: no code on show, a ± key where a measure can be below 0, a minus typed straight in', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/reading', PHONE());   // a thermometer: its reading and scale can be below 0
  assert.equal(await page.isVisible('#fg-code'), false);
  const boxes = await page.$$eval('#fg-fields input[data-ty="number"]', els => els.map(e => [e.dataset.f, e.type, !!document.querySelector(`[data-pm="${e.id}"]`)]));
  assert.ok(boxes.length && boxes.every(b => b[1] === 'text'), JSON.stringify(boxes));
  assert.ok(boxes.some(b => b[0] === 'value' && b[2]), 'the reading has the ± key');
  await page.fill('#fg-f-min', '-30'); await page.fill('#fg-f-value', '-12');
  assert.match(await code(page), /"value":-12/); assert.match(await code(page), /"min":-30/);
  await noSideScroll(page, 'on the thermometer');
  assert.deepEqual(errors, []);
  await ctx.close();
});
