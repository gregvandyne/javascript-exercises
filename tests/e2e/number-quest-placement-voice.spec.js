// Tally's Sorting Game reads each question with its own words, and only when Listen is tapped.
//
// The iPhone report (2026-11-07): after the first answer the voice kept reading question 1. The page
// asks /api/tts for "the item this run is serving now" by run id, and public/js/tts.js caches audio by
// the request body — which was { ctx: 'placement', runId } for every question of the run, so the second
// Listen was a cache hit on question 1's audio and never reached the server. The fix numbers each item
// in the body. These tests answer question 1 and prove question 2's Listen asks for, and plays, new
// audio (AI voice on), and that the device voice is handed question 2's words (AI voice off). They also
// hold the rules around it: nothing is read until Listen is tapped (not on load, not after an answer),
// Listen shows on every question, and a new question stops audio still playing.
import { test, expect } from '@playwright/test';
import { login, ownIp, ADMIN } from './helpers.js';

test.describe.configure({ mode: 'serial' });

async function setEnglish(browser, on) {
  const ctx = await browser.newContext(); const a = await ctx.newPage();
  await login(a, ADMIN.username, ADMIN.password);
  const r = await a.request.post('/api/admin/tts/settings', { data: { locales: { en: { on } } }, headers: { Origin: new URL(a.url()).origin } });
  expect(r.status(), await r.text()).toBe(200);
  await ctx.close();
}
test.afterAll(async ({ browser }) => { await setEnglish(browser, false); });

/** Record what the page plays and says: blob audio play() calls, pause() calls, and device-voice words. */
async function stubVoices(page) {
  await page.addInitScript(() => {
    window.__plays = []; window.__pauses = 0; window.__said = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const src = String(this.src || '');
      if (src.startsWith('blob:')) window.__plays.push(src);
      return play.call(this).catch(() => {});
    };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () { window.__pauses++; return pause.call(this); };
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = u => { const t = String(u.text || '').trim(); if (t) window.__said.push(t); };
      window.speechSynthesis.cancel = () => {};
    }
  });
}
const spoken = s => String(s).replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️⃣‍]/gu, ' ').replace(/\s+/g, ' ').trim();

async function startGame(page, grade = 'K') {
  await ownIp(page);
  await page.goto('/number-quest/sorting-game');
  await page.locator(`.nq-grade[data-grade="${grade}"]`).click();
  await page.locator('#nq-play').click();
  await expect(page.locator('#nq-game')).toBeVisible();
  await expect(page.locator('#nq-prompt')).not.toBeEmpty();
}
async function answerCurrent(page) {
  // Wait on the answer call itself: two questions can share their words (two counting items differ
  // only in their tiles), so a changed prompt is not a reliable signal the next item arrived.
  const done = page.waitForResponse(r => r.url().endsWith('/api/number-quest/placement/answer'));
  if (await page.locator('#nq-answer-row').isVisible()) { await page.fill('#nq-answer', '3'); await page.locator('#nq-answer-go').click(); }
  else await page.locator('.nq-choice').first().click();
  await done;
  await page.waitForTimeout(100);
}

test('AI voice: nothing plays until Listen; Listen on question 2 asks for and plays question 2', async ({ browser, page }) => {
  await setEnglish(browser, true);
  await stubVoices(page);
  const asked = []; const answers = [];
  page.on('request', r => { if (r.url().endsWith('/api/tts') && r.method() === 'POST') asked.push(r.postDataJSON()); });
  page.on('response', async r => { if (r.url().endsWith('/api/tts')) { try { answers.push((await r.json()).u); } catch { answers.push(null); } } });

  await startGame(page);
  expect(await page.locator('.nq').getAttribute('data-tts-langs')).toContain('en');
  await page.waitForTimeout(1200);
  expect(asked, 'no read on question load').toEqual([]);
  expect(await page.evaluate(() => window.__plays.length)).toBe(0);

  // Question 1: Listen reads it.
  await expect(page.locator('#nq-listen')).toBeVisible();
  await page.locator('#nq-listen').click();
  await expect.poll(() => answers.length).toBe(1);
  expect(answers[0]).toMatch(/^\/tts\/[0-9a-f]{64}\.mp3$/);
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBe(1);

  // Answer it: question 2 arrives silently, and whatever was playing is stopped.
  const pausesBefore = await page.evaluate(() => window.__pauses);
  await answerCurrent(page);
  expect(await page.evaluate(() => window.__pauses)).toBeGreaterThan(pausesBefore);
  await page.waitForTimeout(1200);
  expect(asked.length, 'no read after answering').toBe(1);
  expect(await page.evaluate(() => window.__plays.length)).toBe(1);

  // Question 2: Listen shows, asks the server afresh (not question 1's cached audio) and plays new audio.
  await expect(page.locator('#nq-listen')).toBeVisible();
  await page.locator('#nq-listen').click();
  await expect.poll(() => answers.length, { message: 'question 2 must reach the server, not replay a cached question 1' }).toBe(2);
  expect(answers[1]).toMatch(/^\/tts\/[0-9a-f]{64}\.mp3$/);
  expect(answers[1], 'question 2 audio is not question 1 audio').not.toBe(answers[0]);
  expect(asked[1].ctx).toBe('placement');
  expect(asked[1].runId).toBe(asked[0].runId);
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBe(2);
  const plays = await page.evaluate(() => window.__plays);
  expect(plays[1]).not.toBe(plays[0]);
  await setEnglish(browser, false);
});

test('device voice: Listen on question 2 speaks question 2\'s words, and only on a tap', async ({ page }) => {
  await stubVoices(page);
  await startGame(page);
  expect(await page.locator('.nq').getAttribute('data-tts-langs')).toBe('');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__said)).toEqual([]);

  const q1 = await page.locator('#nq-prompt').textContent();
  await page.locator('#nq-listen').click();
  await expect.poll(() => page.evaluate(() => window.__said)).toEqual([spoken(q1)]);

  await answerCurrent(page);
  const q2 = await page.locator('#nq-prompt').textContent();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__said), 'nothing read after answering').toEqual([spoken(q1)]);

  await expect(page.locator('#nq-listen')).toBeVisible();
  await page.locator('#nq-listen').click();
  await expect.poll(() => page.evaluate(() => window.__said)).toEqual([spoken(q1), spoken(q2)]);

  // And Listen stays on every question, whatever its type.
  for (let i = 0; i < 4; i++) {
    await answerCurrent(page);
    if (!(await page.locator('#nq-game').isVisible())) break;
    await expect(page.locator('#nq-listen')).toBeVisible();
  }
});
