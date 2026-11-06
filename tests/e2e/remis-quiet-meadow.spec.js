// Remi's Quiet Meadow through the real sandboxed frame and the real play page: the demo (no microphone in the default
// browser): the setup card, the no-mic card, Remi asleep while the quiet clock ticks, too loud wakes him (the yawn and
// the grumble), quiet puts him back to sleep, a clap only makes him stir, Space pauses, the goal ends on the results
// card. The real path in its own browser with Chromium's fake microphone: the PAGE listens (html[data-mic="on"] and its
// Listening pill), the number reaches the game, pause and the pill's Stop switch it off. Only Remi gets it: in Tug of
// Math the frame is refused the microphone and a forged start message is answered "off". And the layout check
// (tests/e2e/frame-fit.js) on phones, tablets, a laptop and a 1920 × 1080 projector, in Hebrew and in dark mode.
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const state = f => T(f, 'state');
const poll = (f, key, o = {}) => expect.poll(async () => (await state(f))[key], { timeout: 15000, ...o });

async function open(page, url = '/play/remis-quiet-meadow') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ownIp(page);
  await page.goto(url);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.closeSetup && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
  return { f, errors };
}
async function toSetup(f) {
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('.rqs-card')).toBeVisible();
}

test('demo: no mic here, so the no-mic card; then Remi sleeps, wakes when it is too loud, sleeps again, a clap only stirs him, Space pauses, the goal ends it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { f, errors } = await open(page);
  await toSetup(f);
  await expect(f.locator('.rqs .privacy')).toContainText('Nothing is recorded or saved');
  await f.locator('.rqs [role=radio][data-v="whisper"]').click();
  await f.locator('.rqs [role=radio][data-v="120"]').click();
  await f.locator('#rqStart').click();
  // the default test browser has no microphone (or refuses it): the card says why and offers the demo
  await expect(f.locator('.rqn')).toBeVisible({ timeout: 15000 });
  expect(['nodevice', 'denied', 'unavailable', 'busy']).toContain((await state(f)).mic);
  await expect(page.locator('html')).toHaveAttribute('data-mic', 'off');
  await f.locator('.rqn #rqDemo').click();
  await expect(f.locator('.rq-demo')).toBeVisible();
  let s = await state(f);
  expect([s.screen, s.demo, s.preset, s.goal, s.line]).toEqual(['play', true, 'whisper', 120, 40]);
  // quiet: the clock ticks
  await T(f, 'level', 10);
  await poll(f, 'quiet').toBeGreaterThan(1.5);
  expect((await state(f)).state).toBe('asleep');
  // too loud for 2 s: he wakes (yawn, grumble), the bubble says so, he is grumpy; the clock stops
  await T(f, 'level', 95);
  await poll(f, 'wakes').toBe(1);
  await poll(f, 'state').toBe('grumpy');
  expect(await T(f, 'sounds')).toEqual(expect.arrayContaining(['yawn', 'grumble']));
  await expect(f.locator('.rq-bubble')).toBeVisible();
  const q = (await state(f)).quiet;
  // quiet again: after about 4 s he lies down and sleeps
  await T(f, 'level', 10);
  await poll(f, 'state', { timeout: 12000 }).toBe('asleep');
  expect((await state(f)).quiet).toBeLessThan(q + 2);
  // a clap: a stir at most
  await T(f, 'level', null);
  await f.locator('.rq-demo .rq-db').first().click();
  await page.waitForTimeout(2500);
  s = await state(f); expect(s.wakes).toBe(1); expect(['asleep', 'stirring']).toContain(s.state);
  // Space pauses (the kit's pause screen) and Resume goes on
  await page.keyboard.press('Space');
  await poll(f, 'paused').toBe(true);
  await f.locator('.ok-pause .ok-btn').first().click();
  await poll(f, 'paused').toBe(false);
  // the goal: Remi stands up happy, the results card, BRB.gameOver with no score
  await T(f, 'setGoal', Math.ceil((await state(f)).quiet + 1));
  await poll(f, 'screen').toBe('end');
  await expect(f.locator('.ok-win .rq-stats')).toContainText('Wake-ups: 1', { timeout: 10000 });
  expect(await f.evaluate(() => window.__go)).toEqual([{ won: true, score: null }]);
  expect((await state(f)).stars).toBe(3);
  expect(await T(f, 'state').then(x => x.saved)).toEqual({ preset: 'whisper', fine: 0, goal: 120, base: 30 });
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- the real microphone, through the play page
// Its own browser with Chromium's fake microphone, playing a generated WAV: 4 s of quiet hiss, 3 s of a loud tone, then quiet.
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(x => x && fs.existsSync(x));
function wav(file) {
  const rate = 16000, parts = [[4, 0.0006, 0], [3, 0.0, 0.25], [12, 0.0006, 0]], n = parts.reduce((a, p) => a + p[0] * rate, 0);
  const b = Buffer.alloc(44 + n * 2); let o = 44, i = 0;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (const [sec, hiss, tone] of parts) for (let k = 0; k < sec * rate; k++, i++) {
    const v = (Math.random() * 2 - 1) * hiss + Math.sin(2 * Math.PI * 440 * i / rate) * tone;
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o); o += 2;
  }
  fs.writeFileSync(file, b);
}
const AUDIO = path.join(os.tmpdir(), `remi-fake-mic-${process.pid}.wav`);
async function micBrowser() {
  wav(AUDIO);
  return chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${AUDIO}`, '--autoplay-policy=user-gesture-required'] });
}

test('the real path: the page listens after the Start tap, the number reaches Remi, pause and the pill\'s Stop switch it off', async ({ baseURL }) => {
  const browser = await micBrowser();
  try {
    const ctx = await browser.newContext({ baseURL, permissions: ['microphone'], viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const { f, errors } = await open(page);
    await toSetup(f);
    await f.locator('#rqStart').click();
    await expect(page.locator('html')).toHaveAttribute('data-mic', 'on', { timeout: 15000 });
    await expect(page.locator('.micpill')).toContainText('Listening');
    await poll(f, 'mic').toBe('on');
    await poll(f, 'level').toBeGreaterThan(5);   // numbers arrive from the page
    // the loud tone wakes him (the file loops, so within its 19 s)
    await poll(f, 'wakes', { timeout: 30000 }).toBeGreaterThanOrEqual(1);
    // pause: the page stops listening; resume: it listens again
    await page.keyboard.press('Escape').catch(() => {});
    await T(f, 'pause');
    await expect(page.locator('html')).toHaveAttribute('data-mic', 'off');
    await expect(page.locator('.micpill')).toHaveCount(0);
    await f.locator('.ok-pause .ok-btn').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-mic', 'on', { timeout: 10000 });
    // the pill's Stop: off at once, and the game pauses itself
    await page.locator('.micpill-stop').click();
    await expect(page.locator('html')).toHaveAttribute('data-mic', 'off');
    await poll(f, 'paused').toBe(true);
    expect(errors).toEqual([]);
    await page.goto('/');   // leaving: nothing breaks
  } finally { await browser.close(); }
});

test('only Remi: in Tug of Math the frame cannot open the mic, a forged start is answered off, and the page itself is refused', async ({ baseURL }) => {
  const browser = await micBrowser();
  try {
    const ctx = await browser.newContext({ baseURL, permissions: ['microphone'] });
    const page = await ctx.newPage();
    await ownIp(page);
    await page.goto('/play/tug-of-math');
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.BRB && document.readyState === 'complete', null, { timeout: 30000 });
    const inFrame = await f.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return 'got it'; } catch (e) { return e.name; } });
    expect(inFrame).not.toBe('got it');
    const answer = await f.evaluate(() => new Promise(res => {
      addEventListener('message', e => { if (e.data && e.data.type === 'brb:loudState') res(e.data.state); });
      parent.postMessage({ brb: 1, type: 'brb:loud', op: 'start' }, '*');
      setTimeout(() => res('none'), 3000);
    }));
    expect(answer).toBe('off');
    expect(await f.evaluate(() => BRB.loudness.available())).toBe(false);
    await expect(page.locator('html')).not.toHaveAttribute('data-mic', 'on');
    const onPage = await page.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return 'got it'; } catch (e) { return e.name; } });
    expect(onPage).not.toBe('got it');
  } finally { await browser.close(); }
});

const SIZES = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1280, 800], [1920, 1080]];
for (const [lang, dark] of [['en', false], ['he', true]]) {
  test(`layout (${lang}${dark ? ', dark' : ''}): the setup card, Remi asleep and too loud, and the results fit every screen`, async ({ page, context, baseURL }) => {
    if (dark) await context.addCookies([{ name: 'theme', value: 'dark', url: baseURL }]);
    await page.setViewportSize({ width: 1280, height: 800 });
    const { f, errors } = await open(page, '/play/remis-quiet-meadow' + (lang === 'en' ? '' : `?lang=${lang}`));
    await toSetup(f);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      expect(await frameProblems(f), `setup ${width}×${height}`).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
    }
    await f.locator('#rqDemo').click();
    await poll(f, 'screen').toBe('play');
    await T(f, 'skipAnimations');
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await T(f, 'level', 10); await page.waitForTimeout(300);
      expect(await frameProblems(f), `asleep ${width}×${height}`).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
    }
    await T(f, 'level', 95); await poll(f, 'state').toBe('grumpy');
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(300);
      expect(await frameProblems(f), `too loud ${width}×${height}`).toEqual([]);
    }
    await T(f, 'level', 5); await poll(f, 'state', { timeout: 12000 }).toBe('asleep');
    await T(f, 'setGoal', Math.ceil((await state(f)).quiet + 1));
    await expect(f.locator('.ok-win .rq-stats')).toBeVisible({ timeout: 10000 });
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      expect(await frameProblems(f), `results ${width}×${height}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}
