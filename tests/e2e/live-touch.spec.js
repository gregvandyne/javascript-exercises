// Touch screens in live games: one tap is one press. On a phone (touch, isMobile, a high pixel ratio) the browser's
// follow-up click after a tap can land on another button inside the game frame; it must never count as a second press.
// Tug of Math Live: a multi-digit answer typed by tapping is exactly the digits tapped ("Right! Pull!").
// Would You Rather Live: tapping the second card votes for the second card.
import { test, expect } from '@playwright/test';
import { login, ownIp } from './helpers.js';

const frameOf = page => page.frames().find(x => /\/live\/frame\//.test(x.url()));
async function liveFrame(page, key) {
  let f = null;
  await expect.poll(async () => {
    f = frameOf(page);
    if (!f) return false;
    try { return await f.evaluate(k => !!(window.__brbTest && window.__brbTest.state && window.__brbTest.state()[k]), key); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
function solve(e) { const OP = { add: '+', sub: '-', mul: '*', div: '/', lp: '(', rp: ')' }; return Function(`return ${e.map(x => (typeof x === 'number' ? `(${x})` : OP[x])).join('')}`)(); }

async function hostRoom(browser, mode, setup = async () => {}) {
  const host = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await login(host, 'DemoTeacher', 'demo-pass-123');
  await host.goto('/live');
  await host.locator('label.lv-pick', { has: host.locator(`input[value="mode:${mode}"]`) }).click();
  await setup(host);
  await host.locator('input[name="audience"][value="open"]').check();
  await host.locator('#lv-new button[type=submit]').click();
  // an earlier test's room still open: end it and open this one
  const replace = host.locator('#lv-open-replace');
  await Promise.race([host.waitForURL(/\/live\/host\//), replace.waitFor()]);
  if (await replace.isVisible()) { await replace.click(); await host.waitForURL(/\/live\/host\//); }
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  return { host, code };
}
/** End the teacher's open live game (the next test, here or in another spec, starts clean). */
async function endOpen(t) {
  const mine = await (await t.request.get('/api/live/mine')).json();
  if (!mine.sid) return;
  await t.goto(mine.host);
  t.once('dialog', d => d.accept());
  await t.locator('#lv-controls [data-lv-act="end"]:not([hidden])').click();
  await expect.poll(async () => (await (await t.request.get('/api/live/mine')).json()).sid || null).toBe(null);
}
async function phone(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await ownIp(p);
  await p.goto(`/join#${code}`);
  await expect(p.locator('#jc')).toHaveValue(code);
  await p.locator('#lv-join button[type=submit]').tap();
  await p.locator('#lv-go').tap();
  await p.waitForURL(/\/live\/play\//);
  return p;
}

test('Tug of Math Live: multi-digit answers tapped on a phone keypad are right', async ({ browser }) => {
  test.setTimeout(150_000);
  const { host, code } = await hostRoom(browser, 'tug', async h => { await h.selectOption('#lv-tug-grade', '4'); });
  const ps = [await phone(browser, code), await phone(browser, code)];
  const f = await liveFrame(ps[0], 'tugLive'); await liveFrame(ps[1], 'tugLive');
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  let multi = 0;
  for (let k = 0; k < 6 && multi < 2; k++) {
    let q;
    await expect.poll(async () => { const s = await state(f); q = s.question; return !!(q && !q.locked && s.phase === 'playing' && q.i === k); }, { timeout: 20_000 }).toBe(true);
    const v = solve(q.e);
    if (String(v).length > 1) multi++;
    for (const d of String(v)) await f.locator(`.keys .key[data-k="${d}"]`).tap();
    await f.locator('.keys .key[data-k="ok"]').tap();
    await expect(f.locator('.play .say')).toHaveText('Right! Pull!');
  }
  expect(multi).toBeGreaterThan(0);
  await endOpen(host);
  await host.close();
});

test('Would You Rather Live: tapping the second card on a phone votes for it', async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, code } = await hostRoom(browser, 'wyr');
  const p = await phone(browser, code);
  // (before the start the phone shows the platform lobby; the game's own frame loads when the host starts)
  await expect.poll(() => !!frameOf(p), { timeout: 30_000 }).toBe(true);
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  let f = null;
  await expect.poll(async () => {
    f = frameOf(p); if (!f) return false;
    try { return await f.evaluate(() => { const s = window.__brbTest && window.__brbTest.state && window.__brbTest.state(); return !!(s && s.question && s.phase === 'playing'); }); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  await expect(f.locator('#cb')).toBeEnabled();
  await f.locator('#cb').tap();
  await expect.poll(async () => (await state(f)).question.picked).toBe(1);
  await expect(f.locator('#cb')).toHaveClass(/mine/);
  await expect(f.locator('#ca')).not.toHaveClass(/mine/);
  await endOpen(host);
  await host.close();
});
