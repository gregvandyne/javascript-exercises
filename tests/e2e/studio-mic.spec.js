// Speaking instead of typing in the Studio chat (public/js/studio.js "speaking instead of typing"; server/services/stt.js).
// The e2e server runs the test-only speech provider (playwright.config.js STT_PROVIDER=mock), so the mic is shown.
// 1-4: a fake MediaRecorder and microphone, and a mocked /transcribe, for every state the builder can see.
// 5: the real path: Chromium's fake microphone, a real recording, the server's test provider.
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import { signup, uniq } from './helpers.js';

/** A fake microphone and MediaRecorder (webm only, like Chrome). opts.deny: getUserMedia fails with NotAllowedError. */
const fakeMic = (page, { deny = false } = {}) => page.addInitScript(deny => {
  window.__mic = { stopped: 0, started: 0 };
  class FakeRecorder {
    constructor(stream, opts) { this.state = 'inactive'; this.mimeType = (opts && opts.mimeType) || 'audio/webm'; }
    static isTypeSupported(t) { return /^audio\/webm/.test(t); }
    start() { this.state = 'recording'; window.__mic.started++; }
    stop() {
      this.state = 'inactive';
      setTimeout(() => {
        const head = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
        if (this.ondataavailable) this.ondataavailable({ data: new Blob([head, new Uint8Array(3000)], { type: 'audio/webm' }) });
        if (this.onstop) this.onstop();
      }, 20);
    }
  }
  window.MediaRecorder = FakeRecorder;
  const getUserMedia = async () => {
    if (deny) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    return { getTracks: () => [{ stop() { window.__mic.stopped++; } }] };
  };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
}, deny);

async function studio(page) {
  await signup(page, uniq('Mic'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  await expect(page.locator('#st-send')).toBeEnabled({ timeout: 20000 });
}
const log = page => page.locator('#st-log');

test('record, stop with the keyboard, and the words land in the box for checking: never sent by themselves', async ({ page }) => {
  await fakeMic(page);
  const sent = [];
  await page.route('**/api/studio/*/transcribe', async route => {
    const r = route.request(); sent.push({ type: r.headers()['content-type'], ms: +r.headers()['x-clip-ms'], size: (r.postDataBuffer() || Buffer.alloc(0)).length });
    await route.fulfill({ json: { text: 'make the dragon fly faster' } });
  });
  await studio(page);
  const mic = page.locator('#st-mic'), status = page.locator('#st-mic-status');
  await expect(mic).toBeVisible();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  await expect(mic).toHaveAttribute('aria-label', 'Speak instead of typing');
  const box = await mic.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  await page.fill('#st-input', 'Hi!');
  // Keyboard only: focus the button, Enter to start, Space to stop.
  await mic.focus(); await page.keyboard.press('Enter');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect(mic).toHaveAttribute('aria-label', 'Stop recording');
  await expect(status).toContainText(/Recording 0:0\d of 1:00/);
  await expect(status).toHaveClass(/rec/);
  await page.waitForTimeout(700);
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Check the words, then press Send.');
  await expect(page.locator('#st-input')).toHaveValue('Hi! make the dragon fly faster');
  await expect(page.locator('#st-input')).toBeFocused();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__mic.stopped)).toBeGreaterThan(0);
  expect(sent).toHaveLength(1);
  expect(sent[0].type).toBe('audio/webm'); expect(sent[0].ms).toBeGreaterThanOrEqual(600); expect(sent[0].size).toBeGreaterThan(3000);
  // Nothing was sent to the Builder: no message bubble with the words.
  await page.waitForTimeout(300);
  await expect(log(page)).not.toContainText('make the dragon fly faster');
});

test('Esc cancels a recording: nothing is uploaded and the status says nothing was kept', async ({ page }) => {
  await fakeMic(page);
  let calls = 0;
  await page.route('**/api/studio/*/transcribe', route => { calls++; return route.fulfill({ json: { text: 'x' } }); });
  await studio(page);
  await page.click('#st-mic');
  await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#st-mic-status')).toHaveText('Recording stopped. Nothing was sent or kept.');
  await expect(page.locator('#st-mic')).toBeFocused();
  expect(calls).toBe(0);
  await expect(page.locator('#st-input')).toHaveValue('');
});

test('errors: the server\'s kind message (too many), and nothing heard', async ({ page }) => {
  await fakeMic(page);
  let reply = { status: 429, json: { error: "That's a lot of recordings! Wait a minute, then try again.", code: 'fast' } };
  await page.route('**/api/studio/*/transcribe', route => route.fulfill(reply));
  await studio(page);
  const status = page.locator('#st-mic-status');
  await page.click('#st-mic'); await page.waitForTimeout(600); await page.click('#st-mic');
  await expect(status).toHaveText("That's a lot of recordings! Wait a minute, then try again.");
  await expect(status).toHaveClass(/bad/);
  reply = { status: 200, json: { text: '', reason: 'nothing' } };
  await page.click('#st-mic'); await page.waitForTimeout(600); await page.click('#st-mic');
  await expect(status).toHaveText("I didn't hear any words. Try again, a bit closer to the mic.");
  await expect(page.locator('#st-input')).toHaveValue('');
});

test('a blocked microphone says how to allow it', async ({ page }) => {
  await fakeMic(page, { deny: true });
  await studio(page);
  await page.click('#st-mic');
  await expect(page.locator('#st-mic-status')).toContainText('The microphone is blocked');
  await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'false');
});

test('reduced motion: the recording state shows without a pulse (a red ring, a dot and words)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fakeMic(page);
  await studio(page);
  await page.click('#st-mic');
  const mic = page.locator('#st-mic');
  await expect(mic).toHaveClass(/rec/);
  expect(await mic.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.keyboard.press('Escape');
});

// The real path: Chromium's fake microphone makes a real WebM clip; the server checks it and its test provider answers.
// Its own browser, launched with the fake-device flags (launch options can't change inside one file's worker).
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
test('a real recording goes to the server and comes back as words in the box', async ({ baseURL }) => {
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const ctx = await browser.newContext({ baseURL, permissions: ['microphone'], locale: 'en-US' });
    const page = await ctx.newPage();
    await studio(page);
    const done = page.waitForResponse(r => r.url().includes('/transcribe'));
    await page.click('#st-mic');
    await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1500);
    await page.click('#st-mic');
    const res = await done;
    expect(res.status()).toBe(200);
    await expect(page.locator('#st-input')).toHaveValue('make the dragon fly faster');
    await expect(page.locator('#st-mic-status')).toHaveText('Check the words, then press Send.');
  } finally { await browser.close(); }
});
