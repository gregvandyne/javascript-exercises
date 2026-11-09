// Every launch game loads inside the sandbox with the SDK and no page errors.
import { test, expect } from '@playwright/test';
import { gameFrame, adminPage } from './helpers.js';

const SEEDS = [['hero-of-sunvale', 'Hero of Sunvale'], ['shark-plank', 'Shark Plank'], ['ring-rumble', 'Ring Rumble'], ['footy-tycoon', 'Footy Tycoon'], ['connect-four', null], ['happy-putt', null], ['castle-clash', null], ['brick-drop', null], ['word-hunt', null], ['sum-racer', null], ['munch-maze', null], ['word-peek', null], ['swish-flick', null], ['loop-lab', null], ['beat-lanes', null], ['code-isle', 'Code Isle'], ['atlas-quest', 'Atlas Quest'], ['would-you-rather', null], ['gulp-city', 'Gulp City'], ['tug-of-math', 'Tug of Math'], ['remis-quiet-meadow', "Remi's Quiet Meadow"], ['doodle-hoot', 'Doodle Hoot'], ['word-trail', 'Word Trail'], ['jungle-cup', 'Jungle Cup']];

// CS Quest's games are played only inside their course (docs/decisions.md "Course games are played only as part of their
// course"): no page of their own and not on Home for players, who land on the course page; the platform admin still opens
// them directly, so each still loads in the sandbox with the SDK and no page errors.
const COURSE = [['packet-post', 'Packet Post'], ['inside-the-machine', 'Inside the Machine'], ['data-detective', 'Data Detective'], ['robo-route', 'Robo Route']];

for (const [slug, title] of COURSE) {
  test(`${slug} (a CS Quest game) loads in the sandbox for the admin and lives on the course page, not on Home`, async ({ page, browser }) => {
    const r = await page.goto(`/g/${slug}`);
    expect(r.status()).toBe(200);
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`/courses/cs-quest#${slug}`);
    await expect(page.locator('h1').first()).toHaveText('CS Quest');
    await page.goto('/');
    await expect(page.locator('#featured')).toBeVisible();
    await expect(page.locator('#featured').getByText(title, { exact: true })).toHaveCount(0);
    const admin = await adminPage(browser);
    const errors = [];
    admin.on('pageerror', e => errors.push(e.message));
    expect((await admin.goto(`/g/${slug}`)).status()).toBe(200);
    expect((await admin.locator('h1').first().textContent()).trim()).toBe(title);
    await admin.goto(`/play/${slug}`);
    expect(new URL(admin.url()).pathname).toBe(`/play/${slug}`);
    const f = await gameFrame(admin);
    expect(await f.evaluate(() => typeof window.BRB.sfx.play)).toBe('function');
    expect(await f.evaluate(() => document.title.length > 0)).toBe(true);
    await admin.waitForTimeout(800);
    expect(errors).toEqual([]);
    await admin.context().close();
  });
}

// Each launch game's shelf (docs/decisions.md "Play and Learn"): Play games are featured on Play ('/'), Learn games are in
// Learn's games (or its live class games). Remi's noise meter is a class tool: on neither row, found by search.
const LEARN = new Set(['shark-plank', 'castle-clash', 'word-hunt', 'sum-racer', 'word-peek', 'loop-lab', 'code-isle', 'atlas-quest', 'tug-of-math', 'doodle-hoot', 'word-trail']);
for (const [slug, title] of SEEDS) {
  test(`${slug} loads in the sandbox and shows up on its shelf (Play or Learn)`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const r = await page.goto(`/g/${slug}`);
    expect(r.status()).toBe(200);
    const heading = (await page.locator('h1').first().textContent()).trim();
    if (title) expect(heading).toBe(title);
    await page.goto(`/play/${slug}`);
    const f = await gameFrame(page);
    expect(await f.evaluate(() => typeof window.BRB.sfx.play)).toBe('function');
    expect(await f.evaluate(() => document.title.length > 0)).toBe(true);
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
    if (slug === 'remis-quiet-meadow') {
      await page.goto('/');
      await expect(page.locator('#featured').getByText(heading, { exact: true })).toHaveCount(0);
      await page.goto(`/search?q=${encodeURIComponent('Quiet Meadow')}`);
      await expect(page.locator('#results').getByText(heading, { exact: true })).toBeVisible();
    } else if (LEARN.has(slug)) {
      await page.goto('/learn');
      await expect(page.locator('#learn-games, #live-games').getByText(heading, { exact: true }).first()).toBeVisible();
      await page.goto('/');
      await expect(page.locator('#featured').getByText(heading, { exact: true })).toHaveCount(0);
    } else {
      await page.goto('/');
      await expect(page.locator('#featured').getByText(heading, { exact: true })).toBeVisible();
    }
  });
}

// Game voices (BRB.speak / BRB.voice): headless Chromium has no voices, so speech says nothing and nothing breaks.
test('BRB.speak exists and returns false gracefully without voices; the word games still play', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/word-peek');
  const f = await gameFrame(page);
  expect(await f.evaluate(() => [typeof BRB.speak, typeof BRB.voice, typeof BRB.stopSpeaking])).toEqual(['function', 'function', 'function']);
  await page.waitForTimeout(1700);   // the SDK stops waiting for a voice list after 1.5 s
  expect(await f.evaluate(() => [BRB.speak('Hello there!', { lang: 'en-US' }), BRB.speak(''), BRB.voice('en-US'), (BRB.stopSpeaking(), 'stopped')])).toEqual([false, false, null, 'stopped']);
  await page.goto('/play/shark-plank');
  const s = await gameFrame(page);
  await s.locator('body').click({ position: { x: 5, y: 5 } });   // the first tap unlocks speech (a silent line)
  await page.waitForTimeout(1700);
  expect(await s.evaluate(() => BRB.speak('A', { queue: true }))).toBe(false);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

// Old games call speechSynthesis.speak themselves: the SDK's wrapper (better voice, mild pitch back to 1) must never break them.
test('a raw speechSynthesis.speak call in a game does not throw, and feature detection still works', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/word-peek');
  const f = await gameFrame(page);
  const r = await f.evaluate(() => {
    const out = ['speechSynthesis' in window, speechSynthesis instanceof SpeechSynthesis, speechSynthesis.speak.__brbUpgrade === true];
    speechSynthesis.speak(new SpeechSynthesisUtterance('hi'));
    const u = new SpeechSynthesisUtterance('hello'); u.pitch = 1.1; u.rate = 0.75; speechSynthesis.speak(u);   // 0.75 and 1.5: exact as float32
    const w = new SpeechSynthesisUtterance('robot'); w.pitch = 1.5; speechSynthesis.speak(w);
    speechSynthesis.cancel();
    return [...out, u.pitch, u.rate, w.pitch];
  });
  expect(r).toEqual([true, true, true, 1, 0.75, 1.5]);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
