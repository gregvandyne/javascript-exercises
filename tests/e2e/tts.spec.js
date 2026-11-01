// AI voices end to end (docs/tts-design.md; server/routes/tts.js, public/js/tts.js, the SDK's tts-client block), with the
// test-only provider (TTS_PROVIDER=mock: a short silent MP3, no network, no key). The test server has TTS_ENABLED=1, but
// every language starts switched off, so the site behaves exactly as before until the admin turns one on:
//   1. off by default: no AI voice anywhere, the game's speech is the device's own (none in headless Chromium)
//   2. the admin's /admin/voices: 13 languages x 13 voices, a sample plays; kids and visitors get a 404
//   3. on: a game's line goes to our server, the MP3 plays in the game frame and onend comes once; when the server fails
//      the device's voice takes over (onend still once); "This device's voice" in the Voices sheet stops the requests
//   4. Hero of Sunvale: Granny Fern's line is asked for in her own voice role, and the talk still moves on when blocked
//   5. Oomba Live: the player's Read and the projector's Read question ask for the open question by number; the next
//      question is refused
//   6. /parents and /privacy say the voices are made by AI (English and Hebrew)
// Every language is switched off again at the end, so the specs after this one keep the device's voice.
import { test, expect } from '@playwright/test';
import { login, signup, gameFrame, ownIp, ADMIN } from './helpers.js';

test.describe.configure({ mode: 'serial' });
const LOCALES = ['en', 'en-GB', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const ITEMS = [
  { q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 30 },
  { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 30 },
];

let admin = null;
async function adminCtx(browser) {
  if (admin) return admin;
  const ctx = await browser.newContext(); admin = await ctx.newPage();
  await login(admin, ADMIN.username, ADMIN.password);
  return admin;
}
/** Switch AI voices on or off for some languages (the admin's settings API, as the Save button sends it). */
async function setLocales(browser, on) {
  const a = await adminCtx(browser);
  const locales = Object.fromEntries(LOCALES.map(l => [l, { on: on.includes(l) }]));
  const r = await a.request.post('/api/admin/tts/settings', { data: { locales }, headers: { Origin: new URL(a.url()).origin } });
  expect(r.status(), await r.text()).toBe(200);
}
/** Count the frame's audio: which sources play() was called with, and how many reached 'ended'. */
const watchAudio = f => f.evaluate(() => {
  window.__plays = []; window.__ended = 0;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = String(this.src || '');
    if (src.startsWith('blob:')) { window.__plays.push('blob'); this.addEventListener('ended', () => { window.__ended++; }, { once: true }); }
    return play.call(this);
  };
});
/** BRB.speak in the frame; -> what speak returned. The frame records how many times onend came. */
const speak = (f, text, opts = {}) => f.evaluate(([text, opts]) => { window.__onend = window.__onend || 0; return BRB.speak(text, { lang: 'en', ...opts, onend: () => { window.__onend++; } }); }, [text, opts]);

test.afterAll(async ({ browser }) => { await setLocales(browser, []); if (admin) await admin.context().close(); });

test('off by default: no Voices button, no AI voice in the frame, no requests; the device voice is used', async ({ page }) => {
  const asked = []; page.on('request', r => { if (r.url().includes('/api/tts')) asked.push(r.url()); });
  await signup(page);
  await page.goto('/play/word-peek');
  const f = await gameFrame(page);
  expect(JSON.parse(await page.locator('#page-data').textContent()).tts).toBeUndefined();
  await expect(page.locator('#p-voices')).toHaveCount(0);
  expect(await f.evaluate(() => [typeof BRB.prefetchSpeech, BRB.aiVoice('en'), BRB.prefetchSpeech(['Hello'])])).toEqual(['function', false, false]);
  await page.waitForTimeout(1700);   // the SDK stops waiting for a voice list after 1.5 s: no voices in headless Chromium
  expect(await speak(f, 'Hello there!')).toBe(false);
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
});

test('admin voice page: every language and voice, a sample plays; kids and visitors get a 404', async ({ browser, page }) => {
  const a = await adminCtx(browser);
  await a.goto('/admin/voices');
  await expect(a.locator('h1')).toContainText('AI voices');
  const rows = a.locator('table.tv-grid tbody tr[data-locale]');
  await expect(rows).toHaveCount(13);
  expect(await rows.evaluateAll(r => r.map(x => x.dataset.locale)).then(x => x.sort())).toEqual([...LOCALES].sort());
  const voices = await a.locator('table.tv-grid thead th').allTextContents();
  for (const v of ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']) expect(voices).toContain(v);
  await expect(a.locator('[data-play]')).toHaveCount(13 * 13);
  // Hebrew's sample sentence is right to left
  await expect(a.locator('tr[data-locale="he"] .tv-sample')).toHaveAttribute('dir', 'rtl');
  // ▶ French with nova: the sample is made (mock), its MP3 is served to the page and the browser plays it
  await a.evaluate(() => { window.__played = []; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__played.push(this.src); return p.call(this); }; });
  const [res] = await Promise.all([a.waitForResponse(r => r.url().endsWith('/api/admin/tts/sample')), a.locator('[data-play][data-locale="fr"][data-voice="nova"]').click()]);
  expect(res.status()).toBe(200);
  const { u } = await res.json();
  expect(u).toMatch(/^\/tts\/[0-9a-f]{64}\.mp3$/);
  await expect.poll(() => a.evaluate(() => window.__played)).toEqual([expect.stringContaining(u)]);
  const mp3 = await a.evaluate(async u => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return [r.status, r.headers.get('content-type'), b.length > 100, b[0] === 0xff || (b[0] === 0x49 && b[1] === 0x44)]; }, u);
  expect(mp3).toEqual([200, 'audio/mpeg', true, true]);
  // the narrator choice is saved (and put back)
  await a.locator('select[name="narrator-en"]').selectOption('sage');
  await a.locator('#tv-form button[type=submit]').click();
  await a.waitForLoadState('load'); await a.waitForTimeout(900);
  await a.goto('/admin/voices');
  await expect(a.locator('select[name="narrator-en"]')).toHaveValue('sage');
  await a.locator('select[name="narrator-en"]').selectOption('coral');
  await a.locator('#tv-form button[type=submit]').click(); await a.waitForTimeout(900);

  // a kid: 404 for the page and every admin API; a visitor too
  await signup(page);
  expect((await page.request.get('/admin/voices')).status()).toBe(404);
  const origin = new URL(page.url()).origin;
  for (const [p, data] of [['/api/admin/tts/sample', { locale: 'en', voice: 'nova' }], ['/api/admin/tts/settings', { locales: { en: { on: true } } }], ['/api/admin/tts/warm', {}]]) {
    expect((await page.request.post(p, { data, headers: { Origin: origin } })).status(), p).toBe(404);
  }
  const anon = await browser.newContext(); const v = await anon.newPage();
  expect((await v.request.get('/admin/voices')).status()).toBe(404);
  expect((await v.request.post('/api/admin/tts/sample', { data: { locale: 'en', voice: 'nova' }, headers: { Origin: origin } })).status()).toBe(404);
  await anon.close();
});

test('on: a game line is read by the server voice in the frame; a failing server falls back to the device; "This device\'s voice" stops it', async ({ browser, page }) => {
  await setLocales(browser, ['en']);
  const asked = []; page.on('request', r => { if (r.url().endsWith('/api/tts')) asked.push(r.postDataJSON()); });
  const { username } = await signup(page);
  await page.goto('/play/word-peek');
  const f = await gameFrame(page);
  const pd = JSON.parse(await page.locator('#page-data').textContent());
  expect(pd.tts.langs).toEqual(['en']);
  expect(typeof pd.tts.tok).toBe('string');
  expect(await f.evaluate(() => [BRB.aiVoice('en'), BRB.aiVoice('en-US'), BRB.aiVoice('fr'), BRB.aiVoice('zh-CN')])).toEqual([true, true, false, false]);
  await f.locator('body').click({ position: { x: 5, y: 5 } });   // a tap: the frame may play sound
  await watchAudio(f);
  // a line: true at once, asked from our server with the game's words and role, played from a blob:, onend once
  expect(await speak(f, 'Find the word cat!', { voice: 'bright', rate: 0.8 })).toBe(true);
  await expect.poll(() => f.evaluate(() => window.__onend), { timeout: 15000 }).toBe(1);
  expect(await f.evaluate(() => [window.__plays, window.__ended])).toEqual([['blob'], 1]);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ ctx: 'game', text: 'Find the word cat!', lang: 'en', role: 'bright', rate: 0.8 });
  expect(JSON.stringify(asked[0])).not.toContain(username);   // never the player's name
  // the same line again comes from the page's cache: no new request, played again
  expect(await speak(f, 'Find the word cat!', { voice: 'bright', rate: 0.8 })).toBe(true);
  await expect.poll(() => f.evaluate(() => window.__onend), { timeout: 15000 }).toBe(2);
  expect(asked).toHaveLength(1);
  // two lines queued: both play, in order, each onend once
  await f.evaluate(() => { window.__order = []; BRB.speak('One.', { lang: 'en', onend: () => window.__order.push(1) }); BRB.speak('Two.', { lang: 'en', queue: true, onend: () => window.__order.push(2) }); });
  await expect.poll(() => f.evaluate(() => window.__order), { timeout: 15000 }).toEqual([1, 2]);

  // the server fails: the device's voice takes over (none here), and onend still comes, once
  await page.route('**/api/tts', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"busy"}' }));
  const before = await f.evaluate(() => [window.__onend, window.__plays.length]);
  expect(await speak(f, 'A line the server cannot make.')).toBe(true);
  await expect.poll(() => f.evaluate(() => window.__onend), { timeout: 15000 }).toBe(before[0] + 1);
  expect(await f.evaluate(() => window.__plays.length)).toBe(before[1]);   // nothing played from the server
  // no answer at all: after 4 s the device's voice (onend once)
  await page.unroute('**/api/tts');
  await page.route('**/api/tts', () => { /* never answered */ });
  const t0 = Date.now();
  expect(await speak(f, 'A slow line.')).toBe(true);
  await expect.poll(() => f.evaluate(() => window.__onend), { timeout: 15000 }).toBe(before[0] + 2);
  expect(Date.now() - t0).toBeGreaterThan(3500);
  await page.unroute('**/api/tts');

  // the Voices sheet: what AI voices are, and "This device's voice" stops every request
  await page.locator('#p-voices').click();
  await expect(page.locator('#p-voices-note')).toContainText('voiced by a computer (AI voices from OpenAI)');
  await expect(page.locator('#p-voices-note')).toContainText('never your name');
  await page.locator('input[name="voices"][value="device"]').check();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('oomba:voices'))).toBe('device');
  await expect.poll(() => f.evaluate(() => BRB.aiVoice('en'))).toBe(false);
  const n = asked.length;
  await page.waitForTimeout(1700);
  expect(await speak(f, 'Device only now.')).toBe(false);   // the device's voice (none in headless Chromium)
  await page.waitForTimeout(500);
  expect(asked.length).toBe(n);
  await page.evaluate(() => localStorage.setItem('oomba:voices', 'ai'));
});

test('Hero of Sunvale: Granny Fern is read in her own voice role; the talk moves on when the voice is blocked', async ({ browser, page }) => {
  test.setTimeout(240_000);
  await setLocales(browser, ['en']);
  const asked = []; page.on('request', r => { if (r.url().endsWith('/api/tts')) asked.push(r.postDataJSON()); });
  await signup(page);
  await page.goto('/play/hero-of-sunvale');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest.state().ready, null, { timeout: 180_000 });
  expect(await f.evaluate(() => BRB.aiVoice('en'))).toBe(true);
  await f.locator('#newBtn').click();
  await f.locator('#makerGo').click();
  await f.locator('#introSkip').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  await f.evaluate(() => { const t = window.__brbTest; t.manual(true); t.teleport({ x: -14, z: 333 }); t.step(0.1); t.press('interact', 0.05); t.step(0.4); });
  await expect(f.locator('#dialog')).toBeVisible();
  await expect.poll(() => asked.filter(b => b.role === 'wise').length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(asked.every(b => b.ctx === 'game' && b.lang === 'en')).toBe(true);
  // blocked voice: the card still moves on and closes
  await page.route('**/api/tts', r => r.abort());
  await f.evaluate(() => { const t = window.__brbTest; while (t.state().dialog.open) t.next(); t.manual(false); });
  await expect(f.locator('#dialog')).toBeHidden();
  await page.unroute('**/api/tts');
});

test('Oomba Live: Read on a player\'s device and on the projector asks for the open question by number; not the next one', async ({ browser }) => {
  test.setTimeout(180_000);
  await setLocales(browser, ['en']);
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const host = await hctx.newPage();
  await login(host, TEACHER.username, TEACHER.password);
  const origin = new URL(host.url()).origin;
  const r = await host.request.post('/api/live/sessions', { data: { audience: 'open', replace: true, pick: 'mode:battle', items: ITEMS }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await host.goto((await r.json()).redirect);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  const D = JSON.parse(await host.locator('#lv-host-data').textContent());
  expect(D.tts.langs).toContain('en');
  // a player (a guest with a generated name)
  const pctx = await browser.newContext({ viewport: { width: 420, height: 800 } }); const p = await pctx.newPage();
  await ownIp(p);
  await p.goto(`/join#${code}`);
  await p.click('#lv-join button[type=submit]');
  await p.click('#lv-go');
  await p.waitForURL(/\/live\/play\//);
  const asked = []; p.on('request', q => { if (q.url().endsWith('/api/tts')) asked.push(q.postDataJSON()); });
  const hostAsked = []; host.on('request', q => { if (q.url().endsWith('/api/tts')) hostAsked.push(q.postDataJSON()); });
  await expect.poll(() => host.locator('#lv-roster li').count(), { timeout: 30_000 }).toBe(1);
  await host.locator('[data-lv-act="start"]:not([hidden])').click();
  await expect(p.locator('#lv-read')).toBeVisible({ timeout: 30_000 });
  await expect(p.locator('#lv-read-ai')).toContainText('AI voice');
  const [res] = await Promise.all([p.waitForResponse(x => x.url().endsWith('/api/tts')), p.locator('#lv-read').click()]);
  expect(res.status()).toBe(200);
  expect(asked[0]).toMatchObject({ ctx: 'live', i: 0 });
  expect(asked[0].text).toBeUndefined();   // by number: the server reads the teacher's question
  // the next question is not open yet: refused
  const next = await p.evaluate(async b => { const x = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, i: 1 }) }); return [x.status, (await x.json()).code]; }, asked[0]);
  expect(next).toEqual([404, 'notNow']);
  // the projector's Read question (its Sound is on)
  await expect(host.locator('#lv-host-read')).toBeVisible();
  const [hr] = await Promise.all([host.waitForResponse(x => x.url().endsWith('/api/tts')), host.locator('#lv-host-read').click()]);
  expect(hr.status()).toBe(200);
  expect(hostAsked[0]).toMatchObject({ ctx: 'live', i: 0, sid: D.sid });
  // the teacher's Voices setting (AI or each device's own voice), with what AI voices are
  expect(await host.locator('#lv-hs-voices option').evaluateAll(o => o.map(x => x.value))).toEqual(['ai', 'device']);
  await expect(host.locator('#lv-settings')).toContainText('made by a computer (OpenAI)');
  await pctx.close(); await hctx.close();
});

test('the parents and privacy pages say the voices are made by AI (English and Hebrew)', async ({ page }) => {
  await page.goto('/parents');
  await expect(page.locator('body')).toContainText('computer-made voice from OpenAI');
  await page.goto('/privacy');
  await expect(page.locator('body')).toContainText('AI voices:');
  await page.context().addCookies([{ name: 'lang', value: 'he', url: new URL(page.url()).origin }]);
  await page.goto('/parents');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toContainText('קולות בינה מלאכותית');
  await page.goto('/privacy');
  await expect(page.locator('body')).toContainText('קולות בינה מלאכותית');
});
