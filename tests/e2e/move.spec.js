// Oomba Breathe & Bend (Brain Breaks, /move) end to end, on the seeded test server (AI voices on the
// mock provider, a silent MP3 per line, so what is verified is the real path: the player asks
// /api/tts with ctx 'move', the server serves the registered line's audio, the page plays it).
// What this pins, segment by segment (Greg's acceptance rules, 2026-11-05):
//   - narration actually plays via the AI voice in EVERY segment, and the captions are the
//     transcript of the line being spoken at that moment (the queue speaks the one timeline
//     in order, so a caption can be a chapter's line just after the clock crosses into the
//     next chapter, while that line finishes across the join);
//   - background music is playing in EVERY segment, ducks under narration, and the two mutes are
//     independent (music off leaves narration; narration off, the music-only mode, leaves music
//     and captions);
//   - a finish counts only at the end of Starfish Rest: leaving early posts nothing, a guest's
//     finish stores nothing, a signed-in finish stores exactly once.
// English is switched on at /admin/voices for these tests and switched off again at the end, so the
// rest of the suite keeps its usual state. The clock is sped up with ?fast= so a five minute
// episode plays in about half a minute; poses, lines and order are unchanged.
import { test, expect } from '@playwright/test';
import { login, signup, ADMIN } from './helpers.js';

const EP_URL = '/move/mountain-morning?fast=12';
let adminPage = null;

async function setEnglish(browser, on) {
  if (!adminPage) {
    const ctx = await browser.newContext(); adminPage = await ctx.newPage();
    await login(adminPage, ADMIN.username, ADMIN.password);
  }
  const r = await adminPage.request.post('/api/admin/tts/settings', {
    data: { locales: { en: { on } } }, headers: { Origin: new URL(adminPage.url()).origin },
  });
  expect(r.status(), await r.text()).toBe(200);
}
test.beforeAll(async ({ browser }) => { await setEnglish(browser, true); });
test.afterAll(async ({ browser }) => { await setEnglish(browser, false); });

const state = page => page.evaluate(() => window.__moveTest.state());
const music = page => page.evaluate(() => window.__moveTest.music());
const narration = page => page.evaluate(() => window.__moveTest.narration);
const epData = page => page.evaluate(() => JSON.parse(document.getElementById('page-data').textContent).episode);

async function playToEnd(page, onSegment, onPoll) {
  const seen = new Map();
  let last = -1;
  await page.click('#mv-play');
  for (let i = 0; i < 240; i++) {
    const s = await state(page);
    if (onPoll) await onPoll(s);
    if (s.segIdx !== last && s.segIdx >= 0) { last = s.segIdx; seen.set(s.segIdx, { ...s }); if (onSegment) await onSegment(s); }
    if (await page.locator('#mv-endcard.on').count()) break;
    await page.waitForTimeout(250);
  }
  return seen;
}

test('a guest hears narration and music in every segment, captions match, and the finish stores nothing', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const completes = [];
  page.on('response', async r => { if (r.url().includes('/api/move/complete')) { try { completes.push(await r.json()); } catch { /* ignore */ } } });
  await page.goto(EP_URL);
  const ep = await epData(page);
  const perSegMusic = {};
  // Caption evidence: on every poll, one atomic read of the caption together with the
  // narration log, so the pairing the assertions below check is never a race between reads.
  const captionSamples = [];
  const seen = await playToEnd(page, async s => {
    const m = await music(page);
    perSegMusic[s.segIdx] = m.perSegment[ep.segments[s.segIdx].id] ? m.perSegment[ep.segments[s.segIdx].id].notes : 0;
  }, async () => {
    captionSamples.push(await page.evaluate(() => ({
      caption: window.__moveTest.state().caption,
      log: window.__moveTest.narration.map(e => `${e.seg}:${e.line}`),
    })));
  });
  expect(seen.size, 'every segment was entered').toBe(ep.segments.length);
  const log = await narration(page);
  for (let i = 0; i < ep.segments.length; i++) {
    const seg = ep.segments[i];
    expect(log.some(e => e.seg === i && e.via === 'ai'), `segment ${seg.id} had a narration line played via the AI voice`).toBe(true);
  }
  // Captions are the transcript of the line being spoken, and the one timeline queue speaks
  // in order: a line starts only once the previous line has finished, so at this sped-up
  // clock the queue can still be speaking a chapter's line just after the clock has crossed
  // into the next chapter, and the caption rightly stays with the voice (Greg's seamless
  // rule: a line in progress continues across a join). An earlier version of this test
  // asserted that the caption at the first sight of a chapter was that chapter's own line;
  // that contradicts the seamless rule and failed exactly when the queue, not the caption,
  // was behind the clock. What the player actually guarantees, asserted here from the
  // atomic samples: every caption shown is a real timeline line; at any moment it is the
  // line the queue most recently started or the very next one (the caption lands when a
  // line's fetch begins, its log entry when playback starts, so it can sit one entry ahead
  // of the log, never behind it and never further ahead); captions move only forward
  // through the timeline; and every chapter's own lines are captioned while they are the
  // ones being spoken.
  const textPos = new Map(ep.timeline.map((e, i) => [e.text, i]));
  const keyPos = new Map(ep.timeline.map((e, i) => [`${e.seg}:${e.line}`, i]));
  let trailMax = -1;
  const captionedSegs = new Set();
  for (const c of captionSamples) {
    if (!c.caption) continue;
    const p = textPos.get(c.caption);
    expect(p, `caption shown was a real narration line: ${c.caption}`).not.toBeUndefined();
    expect(p, 'captions only move forward through the timeline').toBeGreaterThanOrEqual(trailMax);
    trailMax = Math.max(trailMax, p);
    captionedSegs.add(ep.timeline[p].seg);
    const lastLogged = c.log.length ? keyPos.get(c.log[c.log.length - 1]) : -1;
    expect(p === lastLogged || p === lastLogged + 1, `caption (timeline line ${p}) matched the line being spoken (last started line ${lastLogged})`).toBe(true);
  }
  for (let i = 0; i < ep.segments.length; i++) {
    expect(captionedSegs.has(i), `segment ${ep.segments[i].id} had its own line captioned while it was spoken`).toBe(true);
  }
  const m = await music(page);
  for (const seg of ep.segments) expect(m.perSegment[seg.id].notes, `music played during ${seg.id}`).toBeGreaterThan(0);
  expect(m.ctxState).toBe('running');
  // Seamless (Greg, 2026-11-05): one timeline. The bed started exactly once for the whole
  // episode, and the narration log is the single timeline queue in order: every AI line at its
  // global position, none repeated, none restarted at a chapter join.
  const tl = await page.evaluate(() => window.__moveTest.timeline());
  expect(tl.musicStarts, 'the music bed started once, never restarted at a join').toBe(1);
  expect(m.starts).toBe(1);
  const pos = new Map(ep.timeline.map((e, i) => [`${e.seg}:${e.line}`, i]));
  const played = log.filter(e => e.via === 'ai').map(e => pos.get(`${e.seg}:${e.line}`));
  expect(new Set(played).size, 'no narration line was played twice').toBe(played.length);
  expect(played, 'narration followed the one timeline in order').toEqual([...played].sort((a, b) => a - b));
  // The end card line is the last entry of the same queue: it follows the final Rest line in
  // the one performance, so it can land after the end card itself appears. At this sped-up
  // clock a cold server also hits the voice service's per-minute generation cap (20 new lines
  // a minute; the episode has 23), and the player holds the line and retries until the cap's
  // window clears rather than skipping it, so allow for that full retry arc.
  await expect.poll(async () => (await narration(page)).some(e => e.seg === ep.segments.length && e.via === 'ai'), { timeout: 110_000 }).toBe(true);
  expect(completes).toHaveLength(1);
  expect(completes[0]).toMatchObject({ ok: true, stored: false });
  await expect(page.locator('#mv-done-status')).toContainText('Guests play free');
});

test('one timeline across the joins: the music starts once and the narration queue never resets', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(EP_URL);
  await page.click('#mv-play');
  const samples = [];
  let last = -1;
  for (let i = 0; i < 200; i++) {
    const s = await state(page);
    if (s.segIdx !== last && s.segIdx >= 0) { last = s.segIdx; samples.push(await page.evaluate(() => window.__moveTest.timeline())); }
    if (s.segIdx >= 4) break;
    await page.waitForTimeout(200);
  }
  expect(samples.length, 'sampled at least four chapter joins').toBeGreaterThanOrEqual(4);
  for (const t of samples) expect(t.musicStarts, 'music never restarts at a join').toBe(1);
  const idx = samples.map(t => t.narrationIndex);
  expect(idx, 'the narration queue only moves forward across joins').toEqual([...idx].sort((a, b) => a - b));
  expect(samples[samples.length - 1].crossfadeMs).toBe(450);
  expect(samples[samples.length - 1].narrationEntries).toBe(23);
});

test('the logo intro opens the episode: card before the timeline, music under it, no narration over it', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(EP_URL);
  await expect(page.locator('#mv-introcard')).toBeHidden();
  await page.click('#mv-play');
  // Catch the pre-roll while it holds (3.5 episode seconds, ~0.3s at this sped-up clock):
  // the card is up, the master clock has not started (no segment, elapsed 0), the music bed
  // has started exactly once underneath the card, and no narration line has played or shown.
  await page.waitForFunction(() => window.__moveTest && window.__moveTest.state().preroll === true, null, { polling: 'raf', timeout: 5_000 });
  const during = await state(page);
  expect(during.phase).toBe('preroll');
  expect(during.segIdx, 'the master timeline has not started under the card').toBe(-1);
  expect(during.elapsed).toBe(0);
  expect(during.caption).toBe('');
  await expect(page.locator('#mv-introcard')).toBeVisible();
  expect((await music(page)).starts, 'the music bed started once, underneath the card').toBe(1);
  expect(await narration(page), 'no narration line plays over the card').toHaveLength(0);
  // The card hands over to the intro shot: segment 0 begins, the card goes, the bed's single
  // start still stands, and the first line is still the timeline's first line.
  await expect.poll(async () => (await state(page)).segIdx, { timeout: 10_000 }).toBe(0);
  await expect(page.locator('#mv-introcard')).toBeHidden();
  expect((await music(page)).starts).toBe(1);
  const tl = await page.evaluate(() => window.__moveTest.timeline());
  expect(tl.prerollDone).toBe(true);
  expect(tl.prerollSeconds).toBe(3.5);
  expect(tl.narrationEntries).toBe(23);
});

test('music and narration mute independently; music-only keeps music and captions', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(EP_URL);
  await page.click('#mv-play');
  await expect.poll(async () => (await state(page)).segIdx, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  const m0 = await music(page);
  expect(m0.gain).toBeGreaterThan(0);
  // Music off: the gain goes to zero, narration keeps playing.
  const logBefore = (await narration(page)).filter(e => e.via === 'ai').length;
  await page.click('#mv-music-btn');
  await expect.poll(async () => (await music(page)).gain, { timeout: 5_000 }).toBeLessThan(0.005);
  await expect.poll(async () => (await narration(page)).filter(e => e.via === 'ai').length, { timeout: 30_000 }).toBeGreaterThan(logBefore);
  await page.click('#mv-music-btn');
  await expect.poll(async () => (await music(page)).gain, { timeout: 5_000 }).toBeGreaterThan(0.01);
  // Narration off (music-only): no new AI lines, music keeps scheduling, captions keep showing lines.
  const logAtMute = (await narration(page)).filter(e => e.via === 'ai').length;
  const notesAtMute = (await music(page)).notes;
  await page.click('#mv-narr-btn');
  await page.waitForTimeout(4000);
  expect((await narration(page)).filter(e => e.via === 'ai').length).toBe(logAtMute);
  expect((await music(page)).notes).toBeGreaterThan(notesAtMute);
  const s = await state(page);
  expect(s.caption.length).toBeGreaterThan(0);
});

test('leaving early counts nothing; a signed-in finish stores exactly once', async ({ page }) => {
  test.setTimeout(240_000);
  const completes = [];
  page.on('response', async r => { if (r.url().includes('/api/move/complete')) { try { completes.push(await r.json()); } catch { /* ignore */ } } });
  // Leave early: play two segments, navigate away, nothing is posted.
  await page.goto(EP_URL);
  await page.click('#mv-play');
  await expect.poll(async () => (await state(page)).segIdx, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await page.goto('/');
  await page.waitForTimeout(600);
  expect(completes).toHaveLength(0);
  // Signed in: a full play stores once; playing again reports the same record.
  await signup(page);
  await page.goto(EP_URL);
  await playToEnd(page);
  expect(completes).toHaveLength(1);
  expect(completes[0]).toMatchObject({ ok: true, stored: true, already: false });
  await page.click('#mv-again');
  for (let i = 0; i < 240 && completes.length < 2; i++) await page.waitForTimeout(250);
  expect(completes).toHaveLength(2);
  expect(completes[1]).toMatchObject({ ok: true, stored: true, already: true });
});
