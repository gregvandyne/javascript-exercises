// The number line in a real browser (25 Nov 2026, the owner: "whenever I click it adds a blue dot... I have to press
// make a jump twice"): Points puts a dot where you tap and shows where it would go first; Jumps picks a start with the
// first tap and chains each next jump from where the last one landed, writing the number sentence; a tap on a dot or a
// jump selects it (never a new dot on top of it) and Delete takes it away; Undo, Start from a new number and Clear. MANIP_SHOTS=<dir> also
// saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'NumberLineBoss', password: 'secret123', role: 'admin' });
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

test('Points and Jumps: a tap does what the switch says, a dot or jump tapped is selected for Delete, the jumps write their sentence', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives#number-lines`);
  await page.waitForSelector('#mp-content svg.mp-nl');
  const obj = '#mp-content .mp-obj';
  const shot = async n => { if (SHOTS) await page.locator(obj).first().screenshot({ path: `${SHOTS}/${n}.png` }); };
  const tapAt = async v => { // the line runs from -10 to 10 by 1 on a fresh board
    const b = await page.locator(`${obj} svg.mp-nl`).boundingBox();
    const tall = b.height / b.width > 230 / 860, x = b.x + ((30 + ((v + 10) / 20) * 800) / 860) * b.width, y = b.y + (tall ? 160 / 240 : 110 / 190) * b.height;
    await page.mouse.move(x, y); await page.waitForTimeout(40); await page.mouse.click(x, y); await page.waitForTimeout(80);
  };
  const points = () => page.$$eval(`${obj} .mp-nl-pt`, els => els.map(e => e.getAttribute('aria-label').replace('Select the point ', '')));
  const jumps = () => page.locator(`${obj} .mp-nl-jump`).count();
  // Points (the default): the fresh board's dot at 3; a tap adds a dot; a tap on a dot takes it away.
  assert.match(await page.textContent(`${obj} .mp-nl-help`), /Tap the line to put a dot on it/);
  await tapAt(-2); await tapAt(5);
  assert.deepEqual(await points(), ['3', '-2', '5']);
  await tapAt(3);
  assert.deepEqual(await points(), ['3', '-2', '5'], 'tapping the dot at 3 selected it, no new dot');
  assert.equal(await page.locator(`${obj} .mp-nl-pt.on`).count(), 1);
  assert.match(await page.textContent(`${obj} [data-act="nldel"]`), /Delete the dot at 3/);
  await shot('nl-1-selected');
  await tapAt(3);
  assert.equal(await page.locator(`${obj} [data-act="nldel"]`).count(), 0, 'a second tap on it lets it go');
  await tapAt(3); await page.click(`${obj} [data-act="nldel"]`);
  assert.deepEqual(await points(), ['-2', '5'], 'Delete took the dot at 3 away');
  // The hover shows where a tap would go.
  const b = await page.locator(`${obj} svg.mp-nl`).boundingBox();
  await page.mouse.move(b.x + ((30 + (11 / 20) * 800) / 860) * b.width, b.y + (110 / 190) * b.height);
  assert.match(await page.locator(`${obj} .mp-nl-ghost`).innerHTML(), /add 1/);
  await shot('nl-1-points');
  // Undo puts back nothing extra: removes the last dot.
  await page.click(`${obj} [data-act="nlundo"]`);
  assert.deepEqual(await points(), ['-2']);
  // Jumps: the first tap picks the start, then each tap lands a jump from where the last one landed. No new dots.
  await page.click(`${obj} [data-act="nlmode"][data-m="jumps"]`);
  assert.match(await page.textContent(`${obj} .mp-nl-help`), /Tap the line where the jumps start/);
  await tapAt(-6); await tapAt(-2 + 4 - 2); await tapAt(1); await tapAt(-1);
  assert.equal(await jumps(), 3);
  assert.deepEqual(await points(), ['-2'], 'jumps never add dots');
  assert.equal((await page.textContent(`${obj} .mp-nl-sum`)).replace(/\s+/g, ' ').trim(), '−6 + 6 + 1 − 2 = −1');
  assert.match(await page.textContent(`${obj} .mp-nl-help`), /Jumping from\s*-1/);
  const bj = await page.locator(`${obj} svg.mp-nl`).boundingBox();
  await page.mouse.move(bj.x + ((30 + (14 / 20) * 800) / 860) * bj.width, bj.y + (160 / 240) * bj.height);
  assert.match(await page.locator(`${obj} .mp-nl-ghost`).innerHTML(), /stroke-dasharray/, 'the next jump previews as a dashed arc');
  await shot('nl-2-jumps');
  // A tap on a jump selects it; Delete takes it away. Undo jump takes the last one back and the next jump starts where it started.
  await page.locator(`${obj} .mp-nl-tag`).nth(0).click();
  assert.match(await page.textContent(`${obj} [data-act="nldel"]`), /Delete the \+6 jump/);
  await shot('nl-2b-jump-selected');
  await page.click(`${obj} [data-act="nldel"]`);
  assert.equal(await jumps(), 2);
  await page.click(`${obj} [data-act="nlundo"]`);
  assert.equal(await jumps(), 1);
  assert.match(await page.textContent(`${obj} .mp-nl-help`), /Jumping from\s*1/);
  // Start from a new number, then Clear jumps.
  await page.click(`${obj} [data-act="nlnew"]`);
  assert.match(await page.textContent(`${obj} .mp-nl-help`), /Tap the line where the jumps start/);
  await tapAt(4); await tapAt(7);
  assert.equal((await page.textContent(`${obj} .mp-nl-sum`)).replace(/\s+/g, ' ').trim(), '4 + 3 = 7');
  await page.click(`${obj} [data-act="nlclearj"]`);
  assert.equal(await jumps(), 0);
  assert.equal(await page.locator(`${obj} .mp-nl-sum`).count(), 0);
  // Dark mode reads.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.click(`${obj} [data-act="nlmode"][data-m="points"]`);
  await shot('nl-3-dark');
  assert.deepEqual(errors, []);
  await ctx.close();
});
