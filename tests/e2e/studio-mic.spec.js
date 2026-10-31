// Speaking instead of typing in the Studio chat (public/js/studio.js "speaking instead of typing"; server/services/stt.js).
// The e2e server runs the test-only speech provider (playwright.config.js STT_PROVIDER=mock), so the mic is shown and
// live (words while the kid speaks: services/stt-live.js).
// Record then upload (no AudioWorklet in the browser): a fake MediaRecorder and microphone, and a mocked /transcribe, for
// every state the builder can see. Live: the same fake recorder with a real (oscillator) stream, and a scripted socket
// (page.routeWebSocket) for every live state. The real paths: Chromium's fake microphone (playing tests/support/audio),
// a real recording, the server's relay and test provider.
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signup, uniq } from './helpers.js';

/** A fake microphone and MediaRecorder (webm only, like Chrome). opts.deny: getUserMedia fails with NotAllowedError.
 *  opts.live: keep AudioWorklet (the live path) and hand out a real stream (an oscillator) so the page's audio graph
 *  runs; without it the browser looks like one with no AudioWorklet, so the page records and uploads as before. */
const fakeMic = (page, { deny = false, live = false, deadWorklet = false } = {}) => page.addInitScript(({ deny, live, deadWorklet }) => {
  window.__mic = { stopped: 0, started: 0 };
  if (!live) { delete window.AudioWorkletNode; }
  // deadWorklet: the audio graph is built but no frame ever reaches the page (an iPhone's suspended audio, say).
  if (deadWorklet) {
    const Real = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Real { constructor(...a) { super(...a); Object.defineProperty(this.port, 'onmessage', { set() {}, get() { return null; }, configurable: true }); } };
  }
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
    if (!live) return { getTracks: () => [{ stop() { window.__mic.stopped++; } }] };
    const ac = new AudioContext(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination();
    osc.connect(dest); osc.start();
    for (const tr of dest.stream.getTracks()) { const stop = tr.stop.bind(tr); tr.stop = () => { window.__mic.stopped++; stop(); }; }
    return dest.stream;
  };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  // How often the screen-reader announcement changed (it must be once, with the final words, never per partial).
  addEventListener('DOMContentLoaded', () => {
    const said = document.getElementById('st-mic-said'); window.__said = [];
    if (said) new MutationObserver(() => window.__said.push(said.textContent)).observe(said, { childList: true, characterData: true, subtree: true });
  });
}, { deny, live, deadWorklet });

/** A scripted live socket. script(ws, msg, state): answer the page's messages; state.frames counts audio frames.
 *  -> state { frames, sent: [page messages], opened, ws, say(obj): send to the page now } */
async function liveSocket(page, script = () => {}, { readyAfterMs = 0 } = {}) {
  const state = { frames: 0, framesBeforeReady: null, sent: [], opened: 0, ws: null, say: obj => state.ws.send(JSON.stringify(obj)) };
  await page.routeWebSocket('**/listen', ws => {
    state.opened++; state.ws = ws;
    ws.send(JSON.stringify({ type: 'open', liveId: 'live-1' }));
    const ready = () => { state.framesBeforeReady = state.frames; ws.send(JSON.stringify({ type: 'ready', rate: 16000, maxMs: 60000, liveId: 'live-1' })); };
    if (readyAfterMs) setTimeout(ready, readyAfterMs); else ready();
    ws.onMessage(m => {
      if (typeof m === 'string') state.sent.push(JSON.parse(m)); else state.frames++;
      script(ws, typeof m === 'string' ? JSON.parse(m) : null, state);
    });
  });
  return state;
}
/** The final words on stop (the test sends the words so far itself, with sock.say, once audio flows). */
const finalOnStop = final => (ws, msg) => {
  if (msg && msg.type === 'stop') setTimeout(() => { ws.send(JSON.stringify({ type: 'final', text: final })); ws.close({ code: 1000 }); }, 150);
};
const audioFlows = sock => expect.poll(() => sock.frames, { timeout: 10000 }).toBeGreaterThan(2);
const SHOTS = process.env.BRB_SNAPSHOTS && process.env.BRB_SNAPSHOTS !== '0';
const AUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../support/audio/clip.wav');

async function studio(page) {
  await signup(page, uniq('Mic'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  await expect(page.locator('#st-send')).toBeEnabled({ timeout: 20000 });
}
const log = page => page.locator('#st-log');

test('record, stop with the keyboard, and the words land in the box for checking: never sent by themselves', async ({ page }) => {
  await fakeMic(page);
  let sockets = 0; await page.routeWebSocket('**/listen', () => { sockets++; });
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
  expect(sockets, 'no AudioWorklet: the old record-then-upload path, no live socket').toBe(0);
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
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(f => f && fs.existsSync(f));
const FAKE_MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${AUDIO}`, '--autoplay-policy=no-user-gesture-required'];
test('a real recording goes to the server and comes back as words in the box (a browser without AudioWorklet)', async ({ baseURL }) => {
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: FAKE_MIC });
  try {
    const ctx = await browser.newContext({ baseURL, permissions: ['microphone'], locale: 'en-US' });
    await ctx.addInitScript(() => { delete window.AudioWorkletNode; });
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

// ---------------------------------------------------------------- live: words while the kid speaks
test('live: the audio starts at once, before the server is ready (its first words are never lost)', async ({ page }) => {
  await fakeMic(page, { live: true });
  const sock = await liveSocket(page, finalOnStop('make the dragon fly faster'), { readyAfterMs: 1200 });
  await studio(page);
  await page.click('#st-mic');
  await expect.poll(() => sock.framesBeforeReady, { timeout: 10000 }).not.toBeNull();
  expect(sock.framesBeforeReady, 'frames were sent while the service was still getting ready').toBeGreaterThan(2);
  await expect(page.locator('#st-mic-status')).toContainText('Listening…');
  await page.click('#st-mic');
  await expect(page.locator('#st-input')).toHaveValue('make the dragon fly faster');
});

test('live: the audio graph sends nothing (suspended audio): the recording goes on and the clip is uploaded once, with the live id', async ({ page }) => {
  await fakeMic(page, { live: true, deadWorklet: true });
  const sock = await liveSocket(page);
  const ups = [];
  await page.route('**/api/studio/*/transcribe', r => { ups.push(r.request().headers()['x-live-id']); return r.fulfill({ json: { text: 'make the dragon fly faster' } }); });
  await studio(page);
  const status = page.locator('#st-mic-status');
  await page.click('#st-mic');
  await expect(status).toContainText('Listening…');
  await expect(status).toContainText(/^Recording 0:0\d of 1:00/, { timeout: 8000 });   // not live any more, still recording
  await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#st-mic');
  await expect(page.locator('#st-input')).toHaveValue('make the dragon fly faster');
  await expect(status).toHaveText('Check the words, then press Send.');
  expect(ups).toEqual(['live-1']);
  expect(sock.frames).toBe(0);
});

test('live: words appear in the box while speaking, after what was typed; read-only and marked not final; then they settle on stop and are announced once', async ({ page }) => {
  await fakeMic(page, { live: true });
  const sock = await liveSocket(page, finalOnStop('make the dragon fly faster'));
  let uploads = 0; await page.route('**/api/studio/*/transcribe', r => { uploads++; return r.fulfill({ json: { text: 'x' } }); });
  await studio(page);
  const mic = page.locator('#st-mic'), box = page.locator('#st-input'), status = page.locator('#st-mic-status');
  await page.fill('#st-input', 'Hi!');
  await mic.focus(); await page.keyboard.press('Enter');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await audioFlows(sock);
  // Before stop: the words so far, after "Hi!", in the not-final style, read-only, caret at the end, focus on the mic.
  sock.say({ type: 'text', text: 'make the' });
  await expect(box).toHaveValue('Hi! make the');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect(box).toHaveClass(/st-interim/);
  expect(await box.evaluate(el => [el.readOnly, el.selectionStart === el.value.length])).toEqual([true, true]);
  await expect(mic).toBeFocused();
  await expect(status).toContainText(/Listening… 0:0\d of 1:00/);
  sock.say({ type: 'text', text: 'make the dragon fly' });
  await expect(box).toHaveValue('Hi! make the dragon fly');
  await page.keyboard.press('Enter');   // typing Enter in the mic button stops it; the box can't send meanwhile
  await expect(box).toHaveValue('Hi! make the dragon fly faster');
  await expect(box).not.toHaveClass(/st-interim/);
  expect(await box.evaluate(el => el.readOnly)).toBe(false);
  await expect(box).toBeFocused();
  await expect(status).toHaveText('Check the words, then press Send.');
  await expect(page.locator('#st-mic-said')).toHaveText('You said: make the dragon fly faster');
  expect(await page.evaluate(() => window.__said.filter(Boolean))).toEqual(['You said: make the dragon fly faster']);
  expect(sock.sent.map(m => m.type)).toEqual(['stop']);
  expect(await page.evaluate(() => window.__mic.stopped)).toBeGreaterThan(0);
  expect(uploads, 'the clip is not uploaded when the live words came').toBe(0);
  await page.waitForTimeout(300);
  await expect(log(page)).not.toContainText('make the dragon fly faster');
});

test('live: Esc cancels, puts back what was typed, tells the server, and says nothing was kept', async ({ page }) => {
  await fakeMic(page, { live: true });
  const sock = await liveSocket(page, finalOnStop('jump higher now'));
  let uploads = 0; await page.route('**/api/studio/*/transcribe', r => { uploads++; return r.fulfill({ json: { text: 'x' } }); });
  await studio(page);
  await page.fill('#st-input', 'Hi!');
  await page.click('#st-mic');
  await audioFlows(sock);
  sock.say({ type: 'text', text: 'jump higher' });
  await expect(page.locator('#st-input')).toHaveValue('Hi! jump higher');
  await page.keyboard.press('Escape');
  await expect(page.locator('#st-mic-status')).toHaveText('Recording stopped. Nothing was kept.');
  await expect(page.locator('#st-input')).toHaveValue('Hi!');
  await expect(page.locator('#st-input')).not.toHaveClass(/st-interim/);
  await expect(page.locator('#st-mic')).toBeFocused();
  await expect.poll(() => sock.sent.map(m => m.type)).toEqual(['cancel']);
  expect(uploads).toBe(0);
});

test('live: the socket breaks before the final words: the clip in memory is uploaded once, with the live id, and its words land', async ({ page }) => {
  await fakeMic(page, { live: true });
  const sock = await liveSocket(page, (ws, msg) => { if (msg && msg.type === 'stop') ws.close({ code: 1011 }); });
  const ups = [];
  await page.route('**/api/studio/*/transcribe', r => { ups.push(r.request().headers()['x-live-id']); return r.fulfill({ json: { text: 'make the dragon fly faster' } }); });
  await studio(page);
  await page.click('#st-mic');
  await audioFlows(sock);
  sock.say({ type: 'text', text: 'make the' });
  await expect(page.locator('#st-input')).toHaveValue('make the');
  await page.click('#st-mic');
  await expect(page.locator('#st-input')).toHaveValue('make the dragon fly faster');
  await expect(page.locator('#st-mic-status')).toHaveText('Check the words, then press Send.');
  expect(ups).toEqual(['live-1']);
  await expect(page.locator('#st-input')).not.toHaveClass(/st-interim/);
});

test('live: the service fails mid-way (fallback) and the recording goes on, uploaded at the end; a refusal (the day\'s cap) is shown and nothing is uploaded', async ({ page }) => {
  await fakeMic(page, { live: true });
  const sock = await liveSocket(page);
  const ups = [];
  await page.route('**/api/studio/*/transcribe', r => { ups.push(r.request().headers()['x-live-id']); return r.fulfill({ json: { text: 'a robot that jumps' } }); });
  await studio(page);
  const status = page.locator('#st-mic-status');
  await page.click('#st-mic');
  await expect(status).toContainText('Listening…', { timeout: 10000 });
  await audioFlows(sock);
  sock.say({ type: 'error', code: 'provider', fallback: true, liveId: 'live-1', error: 'x' }); sock.ws.close({ code: 4502 });
  await expect(status).toContainText(/^Recording 0:0\d of 1:00/);   // still recording, not live any more
  await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#st-mic');
  await expect(status).toHaveText('Check the words, then press Send.');
  await expect(page.locator('#st-input')).toHaveValue('a robot that jumps');
  expect(ups).toEqual(['live-1']);
  // A refusal before any audio: the server's message, nothing uploaded, the box as it was.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.routeWebSocket('**/listen', ws => { ws.send(JSON.stringify({ type: 'error', code: 'daily', fallback: false, error: "That's all the recordings for today. You can still type your message." })); ws.close({ code: 4429 }); });
  await page.route('**/api/studio/*/transcribe', r => { ups.push('again'); return r.fulfill({ json: { text: 'x' } }); });
  await page.fill('#st-input', 'my words');
  await page.click('#st-mic');
  await expect(status).toHaveText("That's all the recordings for today. You can still type your message.");
  await expect(status).toHaveClass(/bad/);
  await expect(page.locator('#st-mic')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#st-input')).toHaveValue('my words');
  await page.waitForTimeout(300);
  expect(ups).toEqual(['live-1']);
});

test('live, for real: Chromium\'s fake microphone through the AudioWorklet, the server\'s relay and test provider: words in the box BEFORE stop, settled after (phone, light and dark)', async ({ baseURL }) => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: FAKE_MIC });
  try {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ baseURL, permissions: ['microphone'], locale: 'en-US', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
      const page = await ctx.newPage();
      const frames = [];
      page.on('websocket', ws => { if (ws.url().includes('/listen')) ws.on('framesent', f => { if (typeof f.payload !== 'string') frames.push(f.payload.length); }); });
      let uploads = 0; page.on('request', r => { if (r.url().includes('/transcribe')) uploads++; });
      await studio(page);
      const mic = page.locator('#st-mic'), box = page.locator('#st-input');
      await page.fill('#st-input', 'Please');
      await mic.click();
      await expect(mic).toHaveAttribute('aria-pressed', 'true');
      // While recording: the words grow in the box (the server holds back the newest word until the next one starts).
      await expect(box).toHaveValue(/^Please make the/, { timeout: 15000 });
      await expect(mic).toHaveAttribute('aria-pressed', 'true');
      await expect(box).toHaveClass(/st-interim/);
      await expect(page.locator('#st-mic-status')).toContainText('Listening…');
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.every(n => n % 2 === 0 && n <= 64 * 1024)).toBe(true);
      if (SHOTS) await page.screenshot({ path: test.info().outputPath(`stt-live-mid-${scheme}.png`) });
      await mic.click();
      await expect(box).toHaveValue('Please make the dragon fly faster', { timeout: 15000 });
      await expect(box).not.toHaveClass(/st-interim/);
      await expect(page.locator('#st-mic-status')).toHaveText('Check the words, then press Send.');
      await expect(page.locator('#st-mic-said')).toHaveText('You said: make the dragon fly faster');
      expect(uploads).toBe(0);
      if (SHOTS) await page.screenshot({ path: test.info().outputPath(`stt-live-done-${scheme}.png`) });
      await ctx.close();
    }
  } finally { await browser.close(); }
});
