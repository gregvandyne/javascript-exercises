// The Studio's live stream, scripted: GET /live is played by the test (page.route), so each case is exact. No time
// limit on a long build, a server restart (and failed reconnects that stay calm), signed out, a deleted game, and sends
// whose answer never came (they are decided only once the page can reach the server again).
import { test, expect } from '@playwright/test';
import { signup, uniq } from './helpers.js';

const SSE = { 'Content-Type': 'text/event-stream; charset=utf-8' };
const sse = events => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const FOX = 'Make a catch game about a fox. Just build it.';
async function newGame(page) {
  await signup(page, uniq('Liv'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  return page.url().split('/studio/')[1];
}
const turnOf = (extra = {}) => ({ id: 'T1', attempt: 1, chain: 0, carried: 0, provider: 'blocks', mine: true, cid: 'cid-live-0001', elapsed: 2000,
  entries: [{ role: 'user', text: FOX, at: Date.now(), uploads: [], turn: 'T1' }], waiting: 0, left: 0, ...extra });
const STEPS = [['step', { i: 1, key: 'screen', at: 0 }], ['step', { i: 2, key: 'blocks', at: 300 }], ['text', { text: 'Ooh, a fox! ' }]];
/** Route GET /live: serve(n, req) -> { events } | { abort: true } | { status, json } for the nth connect (from 1). */
async function routeLive(page, serve) {
  const seen = { n: 0 };
  await page.route('**/api/studio/*/live', async route => {
    const r = await serve(++seen.n, route.request());
    if (r.abort) return route.abort('connectionrefused');
    if (r.status) return route.fulfill({ status: r.status, json: r.json || {} });
    return route.fulfill({ status: 200, headers: SSE, body: sse(r.events) });
  });
  return seen;
}
/** Route the Studio state: fn(json) changes what the page reads. */
const routeState = (page, id, fn) => page.route(u => u.pathname === `/api/studio/${id}`, async route => {
  if (route.request().method() !== 'GET') return route.continue();
  const res = await route.fetch(); const json = await res.json();
  await route.fulfill({ response: res, json: (await fn(json)) || json });
});
const hello = turn => [['hello', { now: Date.now(), turn }], ['caughtup', {}]];
const live = page => page.locator('.stp[data-state="live"]');

test('LV-1 no time limit: a build that runs for 15 minutes still shows live, and its result arrives when it ends', async ({ page }) => {
  test.setTimeout(60_000);
  const id = await newGame(page);
  let finished = false;
  await routeLive(page, () => (finished
    ? { events: [...hello(turnOf({ elapsed: 16 * 60e3 })), ...STEPS, ['done', { turnsLeft: 59, steps: { v: 1, p: 'blocks', ms: 960000, r: 0, end: 'ok', s: [['screen', 0], ['blocks', 300]] } }]] }
    : { events: [...hello(turnOf({ elapsed: 60e3 })), ...STEPS] }));   // every reconnect replays the running build in full
  await routeState(page, id, json => (finished
    ? { ...json, chat: [...json.chat, turnOf().entries[0], { role: 'assistant', text: 'Here is your fox game!', events: [['steps', { v: 1, p: 'blocks', ms: 960000, r: 0, end: 'ok', s: [['screen', 0], ['blocks', 300]] }]], turn: 'T1' }], turn: null, busy: false }
    : json));
  await page.clock.install();
  await page.reload();
  await expect(live(page).locator('li.stp-cur')).toHaveAttribute('data-step', 'blocks');
  await expect(page.locator('#st-log .msg.me')).toHaveText(FOX);
  await expect(page.locator('.st-busy')).toBeVisible();
  await page.clock.fastForward(15 * 60e3);
  // Still the live build: no "connection dropped", no message that it took too long; Send waits for it.
  await expect(live(page)).toBeVisible();
  await expect(live(page).locator('.stp-leave')).toBeVisible();
  await expect(page.locator('.st-busy')).toBeVisible();
  await expect(page.locator('#st-log .err')).toHaveCount(0);
  await expect(page.locator('#st-send')).toBeDisabled();
  finished = true;
  await page.clock.fastForward(20_000);
  await expect(page.locator('#st-log .msg.bot').last()).toHaveText('Here is your fox game!');
  await expect(live(page)).toHaveCount(0);
  await expect(page.locator('.st-busy')).toHaveCount(0);
  await expect(page.locator('#st-send')).toBeEnabled();
});

test('LV-8 a server restart: the restart row stays calm through failed reconnects, then the build carries on from version 1', async ({ page }) => {
  const id = await newGame(page);
  let phase = 'running';
  const seen = await routeLive(page, () => {
    if (phase === 'running') { phase = 'down'; return { events: [...hello(turnOf()), ...STEPS, ['restart', { retryMs: 1000, resume: true }]] }; }
    if (phase === 'down') return { abort: true };
    return { events: [...hello(turnOf({ attempt: 2, elapsed: 500, entries: [turnOf().entries[0], { role: 'assistant', text: 'Ooh, a fox! ', events: [['steps', { v: 1, p: 'blocks', ms: 2500, r: 0, end: 'restart', s: [['screen', 0], ['blocks', 300]] }]], turn: 'T1', interrupted: true }] })),
      ['step', { i: 1, key: 'resume', v: 1, at: 0 }], ['step', { i: 2, key: 'blocks', at: 10 }]] };
  });
  void id;
  await page.reload();
  const cur = live(page).locator('li.stp-cur');
  await expect(cur).toHaveAttribute('data-step', 'restart');
  await expect(cur).toContainText('Our server is restarting. Your build is saved and should carry on by itself');
  await expect(page.locator('.st-busy')).toContainText('Our server is restarting');
  // Reconnects fail while the server is down: still the restart row, never "connection lost".
  await expect.poll(() => seen.n, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await expect(cur).toHaveAttribute('data-step', 'restart');
  await expect(live(page).locator('li[data-step="offline"]')).toHaveCount(0);
  await expect(page.locator('#st-log .err')).toHaveCount(0);
  phase = 'back';
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(live(page).locator('li[data-step="resume"]')).toContainText('Carried on from version 1 after the server restarted');
  // What was said before the restart is drawn from the transcript, with its summary.
  await expect(page.locator('.stp-sum')).toContainText('stopped by a server restart');
  await expect(page.locator('#st-log .msg.me')).toHaveCount(1);
});

test('LV-9 signed out: the stream says so once, the chat says the build keeps going, and the page stops reconnecting', async ({ page }) => {
  const id = await newGame(page); void id;
  const seen = await routeLive(page, n => (n === 1 ? { events: [...hello(turnOf()), ...STEPS] } : { status: 401, json: { error: 'You were signed out.', signedOut: true } }));
  await page.reload();
  await expect(page.locator('#st-log .msg.err')).toContainText('You were signed out. The Builder keeps working on your game: sign in again to see it.');
  await expect(page.locator('#st-log .msg.err button')).toHaveText('Sign in again');
  await expect(live(page)).toHaveCount(0);
  await expect(page.locator('.st-busy')).toHaveCount(0);
  const n = seen.n;
  await page.waitForTimeout(4000);
  expect(seen.n).toBe(n);
});

test('LV-10 a deleted game: the chat says the Builder stopped and the message box is off', async ({ page }) => {
  await newGame(page);
  await routeLive(page, () => ({ status: 404, json: { error: 'not found' } }));
  await page.reload();
  await expect(page.locator('#st-log .msg.err')).toHaveText('This game was deleted, so the Builder stopped.');
  await expect(page.locator('#st-input')).toBeDisabled();
  await expect(page.locator('#st-send')).toBeDisabled();
});

test.describe('LV-11 no stuck sends', () => {
  test('(a) a build that was refused before the stream opened: the page redraws from the state, with no card left', async ({ page }) => {
    const id = await newGame(page);
    let cid = null;
    await page.route('**/api/studio/*/chat', async route => { cid = JSON.parse(route.request().postData()).cid; await route.fulfill({ status: 202, json: { ok: true, turn: { id: 'T9', status: 'queued' } } }); });
    await routeLive(page, () => ({ events: hello(null) }));
    await routeState(page, id, json => (cid ? { ...json, chat: [...json.chat, { role: 'user', text: 'make a pokemon game', refused: true, turn: 'T9' }, { role: 'assistant', text: 'Let’s make our own characters instead!', refused: true, events: [], turn: 'T9' }], lastTurn: { id: 'T9', end: 'refused', refunded: false, cid, cont: false } } : json));
    await page.reload();
    await page.fill('#st-input', 'make a pokemon game'); await page.press('#st-input', 'Enter');
    await expect(page.locator('#st-log .msg.bot.refused')).toHaveText('Let’s make our own characters instead!');
    await expect(page.locator('.stp')).toHaveCount(0);
    await expect(page.locator('.st-busy')).toHaveCount(0);
    await expect(page.locator('#st-send')).toBeEnabled();
  });

  for (const got of [true, false]) {
    test(`(${got ? 'b' : 'c'}) the send and the state check both fail: nothing is decided until the server answers again, then ${got ? 'the build shows' : '"connection dropped" and the text is back'}`, async ({ page }) => {
      const id = await newGame(page);
      let cid = null, back = false;
      await page.route('**/api/studio/*/chat', async route => { cid = JSON.parse(route.request().postData()).cid; await route.abort('connectionreset'); });
      await routeLive(page, () => {
        if (!cid) return { events: hello(null) };
        if (!back) return { abort: true };
        return { events: got ? [...hello(turnOf({ cid, entries: [{ role: 'user', text: FOX, at: Date.now(), uploads: [], turn: 'T1' }] })), ...STEPS] : hello(null) };
      });
      await page.route(u => u.pathname === `/api/studio/${id}`, async route => (cid && !back ? route.abort('connectionrefused') : route.fallback()));
      await page.reload();
      await page.fill('#st-input', FOX); await page.press('#st-input', 'Enter');
      // Undecided: the message stays, the card says it's checking, and there is no error yet.
      await expect(live(page).locator('li.stp-cur')).toHaveAttribute('data-step', 'offline');
      await expect(live(page).locator('li.stp-cur')).toContainText('Checking if the Builder got your message');
      await page.waitForTimeout(1500);
      await expect(page.locator('#st-log .err')).toHaveCount(0);
      await expect(page.locator('#st-log .msg.me')).toHaveText(FOX);
      await expect(page.locator('#st-input')).toHaveValue('');
      back = true;
      await page.evaluate(() => dispatchEvent(new Event('online')));
      if (got) {
        await expect(live(page).locator('li.stp-cur')).toHaveAttribute('data-step', 'blocks');
        await expect(page.locator('#st-log .msg.me')).toHaveCount(1);
        await expect(page.locator('#st-log .err')).toHaveCount(0);
      } else {
        await expect(page.locator('#st-log .msg.err')).toHaveText('Oops, the connection dropped. Please try again.');
        await expect(page.locator('#st-input')).toHaveValue(FOX);
        await expect(page.locator('#st-log .msg.me')).toHaveCount(0);
        await expect(page.locator('.st-busy')).toHaveCount(0);
        await expect(page.locator('#st-send')).toBeEnabled();
      }
    });
  }
});
