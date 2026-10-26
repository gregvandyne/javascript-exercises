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
  entries: [{ role: 'user', text: FOX, at: Date.now(), uploads: [], turn: 'T1' }], waiting: 0, left: 3, ...extra });
const STEPS = [['step', { i: 1, key: 'screen', at: 0 }], ['step', { i: 2, key: 'blocks', at: 300 }], ['text', { text: 'Ooh, a fox! ' }]];
/** Route GET /live: serve(n, req) -> { events } | { abort: true } | { status, json } | { hang: true } (an open stream
 *  that says nothing more) for the nth connect (from 1). */
async function routeLive(page, serve) {
  const seen = { n: 0 };
  await page.route('**/api/studio/*/live', async route => {
    const r = await serve(++seen.n, route.request());
    if (r.hang) return new Promise(() => {});
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
  await expect(page.locator('#st-send')).toBeEnabled();   // a message now is a follow-up of the running build
  await expect(page.locator('#st-input')).toHaveAttribute('placeholder', /Add to your idea/);
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

// ---- Follow-ups: messages sent while the Builder works. Each stage is served on every (re)connect until the test moves
// on (a replay is the same every time), so the page's state can be checked at each step.
const DRAGON = 'make it a dragon';
const fuEntry = (status, extra = {}) => ({ role: 'user', id: 'F1', cid: 'cid-fu-00001', text: DRAGON, at: Date.now(), followUp: true, status, turn: 'T1', ...extra });
const AI_STEPS = [['step', { i: 1, key: 'screen', at: 0 }], ['step', { i: 2, key: 'think', n: 1, c: 'start', a: 1, at: 300 }], ['step', { i: 3, key: 'write', at: 2000 }], ['stepinfo', { i: 3, plan: 'A fox who hops', l: 40 }]];
const REC = { v: 1, p: 'ai', ms: 9000, r: 2, fu: 1, end: 'ok', s: [['screen', 0], ['think', 300, { n: 1, c: 'start' }], ['write', 2000, { plan: 'A fox who hops' }], ['think', 5000, { n: 2, c: 'msg', m: 1 }], ['edit', 6000, { plan: 'Swapped the fox for a dragon' }]] };

test('LV-5 a follow-up while the AI writes: the strip (also with tips off), then reading, read, and the summary counts it', async ({ page }) => {
  const id = await newGame(page);
  await page.addInitScript(() => { try { localStorage.setItem('brb-tips', '0'); } catch { /* ignore */ } });
  let stage = 1;
  const user = turnOf().entries[0], part = { role: 'assistant', text: 'Building your fox! ', events: [], part: true, turn: 'T1' };
  await routeLive(page, () => {
    const t = extra => hello(turnOf({ provider: 'ai', ...extra }));
    if (stage === 1) return { events: [...t({}), ...AI_STEPS, ['text', { text: 'Building your fox! ' }], ['inbox', { status: 'waiting', entry: fuEntry('waiting'), left: 2 }]] };
    if (stage === 2) return { events: [...t({ entries: [user, part, fuEntry('waiting')] }), ...AI_STEPS, ['inbox', { status: 'reading', ids: ['F1'], n: 2 }], ['step', { i: 4, key: 'think', n: 2, c: 'msg', m: 1, at: 5000 }]] };
    const later = [...AI_STEPS, ['step', { i: 4, key: 'think', n: 2, c: 'msg', m: 1, at: 5000 }], ['inbox', { status: 'read', ids: ['F1'] }], ['step', { i: 5, key: 'edit', at: 6000 }], ['stepinfo', { i: 5, plan: 'Swapped the fox for a dragon' }]];
    if (stage === 3) return { events: [...t({ entries: [user, part, fuEntry('reading', { round: 2, readTurn: 'T1' })] }), ...later] };
    return { events: [...t({ entries: [user, part, fuEntry('read', { by: 'ai', readTurn: 'T1' })] }), ...later, ['done', { turnsLeft: 58, steps: REC }]] };
  });
  await routeState(page, id, json => (stage === 4
    ? { ...json, chat: [...json.chat, user, part, fuEntry('read', { by: 'ai', readTurn: 'T1' }), { role: 'assistant', text: 'Ooh, a dragon! I swapped the fox.', events: [['steps', REC]], turn: 'T1' }], turn: null, busy: false }
    : json));
  await page.reload();
  const strip = live(page).locator('.stp-inbox');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Got your message. The AI will read it after this step.');
  await expect(strip).toContainText('It’s writing code right now, so it finishes that first.');
  await expect(strip).toContainText('Extra messages don’t use a turn. If the Builder has already finished, your message starts a new build and uses 1 turn.');
  const fu = page.locator('#st-log .msg.fu');
  await expect(fu).toHaveCount(1);
  await expect(fu.locator('.fu-text')).toHaveText(DRAGON);
  await expect(fu.locator('.fu-st')).toContainText('Waiting for the AI to read it');
  stage = 2;
  await expect(fu.locator('.fu-st')).toContainText('The AI is reading it now', { timeout: 10_000 });
  await expect(live(page).locator('li.stp-cur')).toContainText('Round 2: reading your new message');
  await expect(strip).toBeHidden();
  stage = 3;
  await expect(fu.locator('.fu-st')).toContainText('The AI read this', { timeout: 10_000 });
  await expect(live(page).locator('.stp-plan')).toContainText('Swapped the fox for a dragon');
  await expect(page.locator('#st-log .msg.fu')).toHaveCount(1);
  stage = 4;
  await expect(page.locator('.stp-sum').last()).toContainText('· read 1 new message', { timeout: 10_000 });
  await expect(page.locator('#st-log .msg.fu .fu-st')).toContainText('The AI read this');
});

test('LV-6 too late for the build: "This starts the next build", then the next build reads it in round 1 (one turn)', async ({ page }) => {
  const id = await newGame(page);
  let stage = 1, t2 = false;
  const user = turnOf().entries[0];
  const T2 = { id: 'T2', attempt: 1, chain: 1, carried: 1, provider: 'ai', mine: true, cid: null, elapsed: 400, entries: [], waiting: 0, left: 3 };
  const REC1 = { v: 1, p: 'ai', ms: 9000, r: 1, end: 'ok', s: [['screen', 0], ['think', 300, { n: 1, c: 'start' }], ['write', 2000]] };
  await routeLive(page, () => {
    if (t2) return { events: [...hello(T2), ['inbox', { status: 'reading', ids: ['F1'], n: 1 }], ['step', { i: 1, key: 'think', n: 1, c: 'msg', m: 1, at: 0 }]] };
    if (stage === 1) return { events: [...hello(turnOf({ provider: 'ai' })), ...AI_STEPS, ['inbox', { status: 'waiting', entry: fuEntry('waiting'), left: 2 }], ['inbox', { status: 'carried', ids: ['F1'] }]] };
    return { events: [...hello(turnOf({ provider: 'ai', entries: [user, fuEntry('carried')] })), ...AI_STEPS, ['done', { turnsLeft: 57, steps: REC1 }]] };
  });
  await routeState(page, id, json => {
    if (stage !== 2) return json;
    t2 = true;
    return { ...json, chat: [...json.chat, user, fuEntry('carried'), { role: 'assistant', text: 'Here is your fox!', events: [['steps', REC1]], turn: 'T1' }], turn: T2, busy: true, turnsLeft: 57 };
  });
  await page.reload();
  await expect(page.locator('#st-log .msg.fu .fu-st')).toContainText('This starts the next build');
  stage = 2;
  await expect(page.locator('#st-log .ev.carried')).toContainText('Your message started a new build (1 turn)', { timeout: 10_000 });
  await expect(live(page).locator('li.stp-cur')).toContainText('Round 1: reading your new message');
  await expect(page.locator('#st-log .msg.fu .fu-st')).toContainText('The AI is reading it now');
  await expect(page.locator('#st-turns')).toContainText('57');
});

test('LV-7 dropped: the bubble says why, and "Put it back in the box" fills the box without sending', async ({ page }) => {
  await newGame(page);
  let posts = 0;
  await page.route('**/api/studio/*/chat', route => { posts++; return route.abort(); });
  await routeLive(page, () => ({ events: [...hello(turnOf()), ...STEPS, ['inbox', { status: 'waiting', entry: fuEntry('waiting'), left: 2 }], ['inbox', { status: 'dropped', ids: ['F1'], why: 'limit' }]] }));
  await page.reload();
  const st = page.locator('#st-log .msg.fu .fu-st');
  await expect(st).toContainText('Not read: no turns left today');
  await st.getByRole('button', { name: 'Put it back in the box' }).click();
  await expect(page.locator('#st-input')).toHaveValue(DRAGON);
  await expect(page.locator('#st-input')).toBeFocused();
  await page.waitForTimeout(300);
  expect(posts).toBe(0);
});

test.describe('LV-12 sends that become follow-ups', () => {
  test('(a) a second send before the build showed up is a follow-up: one card, one message bubble, one follow-up bubble', async ({ page }) => {
    await newGame(page);
    const cids = []; let second = null;
    const gotSecond = new Promise(r => { second = r; });
    await page.route('**/api/studio/*/chat', async route => {
      const cid = JSON.parse(route.request().postData()).cid; cids.push(cid);
      if (cids.length === 1) { await gotSecond; return route.fulfill({ status: 202, json: { ok: true, turn: { id: 'T1', status: 'queued' } } }); }
      second();
      return route.fulfill({ status: 200, json: { followUp: { id: 'F1', cid, status: 'waiting' }, left: 2, turnsLeft: 59 } });
    });
    await routeLive(page, () => (cids.length < 2 ? { events: hello(null) }
      : { events: [...hello(turnOf({ cid: cids[0], entries: [turnOf().entries[0], fuEntry('waiting', { cid: cids[1] })] })), ...STEPS] }));
    await page.reload();
    await page.fill('#st-input', FOX); await page.press('#st-input', 'Enter');
    await page.waitForTimeout(50);
    await page.fill('#st-input', DRAGON); await page.press('#st-input', 'Enter');
    await expect(live(page).locator('li.stp-cur')).toHaveAttribute('data-step', 'blocks');
    await expect(page.locator('.stp[data-state="live"]')).toHaveCount(1);
    await expect(page.locator('#st-log .msg.me:not(.fu)')).toHaveText(FOX);
    await expect(page.locator('#st-log .msg.fu')).toHaveCount(1);
    await expect(page.locator('#st-log .msg.fu .fu-text')).toHaveText(DRAGON);
    await expect(page.locator('#st-log .msg.fu .fu-st')).toContainText('Waiting for the Builder to read it');
    await expect(page.locator('.st-busy')).toHaveCount(1);
  });

  test('(b) a tab that thought nothing was building: its message becomes a follow-up, its stray card and pill go, and the running build is drawn', async ({ page }) => {
    const id = await newGame(page);
    let cid = null;
    await page.route('**/api/studio/*/chat', async route => {
      cid = JSON.parse(route.request().postData()).cid;
      await route.fulfill({ status: 200, json: { followUp: { id: 'F1', cid, status: 'waiting' }, left: 2, turnsLeft: 59 } });
    });
    const running = () => turnOf({ entries: [turnOf().entries[0], fuEntry('waiting', { cid })] });
    await routeLive(page, () => ({ events: cid ? [...hello(running()), ...STEPS] : hello(null) }));
    await routeState(page, id, json => (cid ? { ...json, turn: running(), busy: true } : json));
    await page.reload();
    await page.fill('#st-input', DRAGON); await page.press('#st-input', 'Enter');
    await expect(page.locator('#st-log .msg.fu .fu-text')).toHaveText(DRAGON);
    await expect(page.locator('#st-log .msg.fu .fu-st')).toContainText('Waiting for the Builder to read it');
    await expect(page.locator('#st-log .msg.me:not(.fu)')).toHaveText(FOX);
    await expect(live(page).locator('li.stp-cur')).toHaveAttribute('data-step', 'blocks');
    await expect(page.locator('.stp[data-state="live"]')).toHaveCount(1);
    await expect(page.locator('.st-busy')).toHaveCount(1);
    await expect(live(page).locator('li[data-step="sending"]')).toHaveCount(0);
    // The follow-up comes after the message that started the build.
    const order = await page.locator('#st-log .msg.me').evaluateAll(els => els.map(e => (e.classList.contains('fu') ? 'fu' : 'me')));
    expect(order).toEqual(['me', 'fu']);
  });
});

test('the message box placeholder stays on one line on phones and computers, idle and while the Builder works', async ({ page }) => {
  await newGame(page);
  let building = false;
  await routeLive(page, () => ({ events: building ? [...hello(turnOf({ provider: 'ai' })), ...STEPS] : hello(null) }));
  const oneLine = async label => {
    const m = await page.locator('#st-input').evaluate(el => ({ h: el.offsetHeight, sh: el.scrollHeight, ch: el.clientHeight, ph: el.placeholder, lh: parseFloat(getComputedStyle(el).lineHeight) }));
    expect(m.h, `${label}: "${m.ph}" is one line`).toBeLessThanOrEqual(52);
    expect(m.sh, `${label}: nothing scrolls`).toBeLessThanOrEqual(m.ch + 1);
    return m.ph;
  };
  for (const w of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    building = false; await page.reload();
    await oneLine(`${w}px idle`);
    building = true; await page.reload();
    await expect(page.locator('.st-busy')).toBeVisible();
    const ph = await oneLine(`${w}px building`);
    expect(['Add to your idea. The AI reads it after its current step', 'Add to your idea…']).toContain(ph);
  }
});

// ---- Time estimates: the top of the live card. The stream is served once and then stays open with nothing more to
// say (later connects never answer), so time is the only thing that changes; the page's clock is driven by the test.
const ETA_START = { v: 1, phase: 'start', el: 400, p: 'blocks', src: 'data', n: 23, show: 'range', lo: 1, hi: 2, overAt: 138000, bigAt: 240000, showAt: 8000 };
/** Load the Studio with a running build: hello (elapsed), the events, then silence. -> the read-out recorder. */
async function etaBuild(page, events, { elapsed = 2000, lang = null, id = null } = {}) {
  await routeLive(page, n => (n === 1 ? { events: [...hello(turnOf({ elapsed })), ...events] } : { hang: true }));
  await page.clock.install();
  await (id ? page.goto(`/studio/${id}${lang ? `?lang=${lang}` : ''}`) : page.reload());
  await expect(live(page)).toBeVisible();
  await page.evaluate(() => {
    window.__said = [];
    new MutationObserver(() => window.__said.push(document.getElementById('st-steps-live').textContent))
      .observe(document.getElementById('st-steps-live'), { childList: true, characterData: true, subtree: true });
  });
}
const said = page => page.evaluate(() => window.__said);
const saidTimes = async (page, text) => (await said(page)).filter(s => s.includes(text)).length;
/** The page's own words for a range of minutes, in its language. */
const range = (page, lo, hi) => page.evaluate(([a, b]) => new Intl.NumberFormat(JSON.parse(document.getElementById('i18n').textContent).intl, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).formatRange(a, b), [lo, hi]);
const LEAVE = 'You can close this page or your computer, or sign out';

test.describe('LV-2 the estimate: when it shows, what it says, and that it is read out once per state', () => {
  test('from timed builds: "Usually 1–2 minutes" at showAt with the leave line, then so far, longer and big', async ({ page }) => {
    await newGame(page);
    await etaBuild(page, [...STEPS.slice(0, 1), ['eta', ETA_START], ...STEPS.slice(1)]);
    const top = live(page).locator('.stp-eta'), line = top.locator('.stp-eta-line');
    await expect(top).toBeHidden();
    await page.clock.fastForward(6500);
    const want = `Usually ${await range(page, 1, 2)}`;
    await expect(line).toHaveText(`⏱ ${want}`);
    await expect(top.locator('.stp-leave')).toContainText(LEAVE);
    await expect(top.locator('.stp-eta-learn')).toContainText('The building blocks follow fixed rules');
    await expect.poll(() => saidTimes(page, want)).toBe(1);
    expect((await said(page)).find(s => s.includes(want))).toContain(LEAVE);   // read out together
    await page.clock.fastForward(52_000);
    await expect(line).toContainText('· 1 minute so far');
    await page.clock.fastForward(79_000);   // 139 s
    await expect(top).toHaveAttribute('data-state', 'longer');
    await expect(line).toHaveText(/^⏳ Taking a bit longer than usual · 2 minutes so far$/);
    await page.clock.fastForward(102_000);  // 241 s
    await expect(top).toHaveAttribute('data-state', 'big');
    await expect(line).toContainText('This one is a big job, and it’s still going');
    await page.clock.fastForward(2000);
    for (const x of [want, 'Taking a bit longer than usual', 'This one is a big job']) expect(await saidTimes(page, x), x).toBe(1);
    expect(await saidTimes(page, 'so far'), 'minutes are never read out').toBe(0);
    expect(await saidTimes(page, LEAVE), 'the leave line once').toBe(1);
  });

  test('a real building step shows it at once, before showAt', async ({ page }) => {
    await newGame(page);
    await etaBuild(page, [['step', { i: 1, key: 'screen', at: 0 }], ['eta', ETA_START], ['step', { i: 2, key: 'think', n: 1, c: 'start', at: 300 }], ['step', { i: 3, key: 'write', at: 1200 }]]);
    await expect(live(page).locator('.stp-eta-line')).toHaveText(`⏱ Usually ${await range(page, 1, 2)}`);
  });

  test('the first version says what is left: "Saved! Finishing up…"', async ({ page }) => {
    await newGame(page);
    await etaBuild(page, [['step', { i: 1, key: 'screen', at: 0 }], ['eta', ETA_START], ['step', { i: 2, key: 'check', st: 'pass', v: 1, at: 1500 }],
      ['eta', { v: 1, phase: 'tail', el: 1500, show: 'about', n: 1, overAt: 138000, bigAt: 240000 }]]);
    await expect(live(page).locator('.stp-eta-line')).toHaveText('⏱ Saved! Finishing up usually takes about 1 minute more');
  });

  test('a quick kind of build shows no number: only the leave line, then plainly "longer than usual" if it hangs', async ({ page }) => {
    await newGame(page);
    await etaBuild(page, [STEPS[0], ['eta', { ...ETA_START, show: 'none', lo: undefined, hi: undefined, overAt: 35000, bigAt: 95000 }], ...STEPS.slice(1)]);
    const top = live(page).locator('.stp-eta');
    await page.clock.fastForward(6500);
    await expect(top.locator('.stp-leave')).toBeVisible();
    await expect(top.locator('.stp-eta-line')).toBeHidden();
    await page.clock.fastForward(20_000);
    await expect(top.locator('.stp-eta-line')).toBeHidden();
    await page.clock.fastForward(7000);   // 35.5 s
    await expect(top.locator('.stp-eta-line')).toHaveText('⏳ Taking a bit longer than usual');
  });

  test('a first guess (not enough timed builds yet) says "About", never "Usually"', async ({ page }) => {
    await newGame(page);
    await etaBuild(page, [STEPS[0], ['eta', { ...ETA_START, src: 'default', n: 0 }], ...STEPS.slice(1)]);
    await page.clock.fastForward(6500);
    await expect(live(page).locator('.stp-eta-line')).toHaveText(`⏱ About ${await range(page, 1, 2)}`);
    await expect(live(page)).not.toContainText('Usually');
  });

  test('with tips off the learning line goes, the estimate and the leave line stay', async ({ page }) => {
    await newGame(page);
    await page.addInitScript(() => { try { localStorage.setItem('brb-tips', '0'); } catch { /* ignore */ } });
    await etaBuild(page, [STEPS[0], ['eta', ETA_START], ...STEPS.slice(1)]);
    await page.clock.fastForward(6500);
    await expect(live(page).locator('.stp-eta-line')).toBeVisible();
    await expect(live(page).locator('.stp-leave')).toBeVisible();
    await expect(live(page).locator('.stp-eta-learn')).toBeHidden();
  });
});

test('LV-3 coming back 5 minutes into a build: straight away "a big job" (never "Usually"), read out once after the replay', async ({ page }) => {
  await newGame(page);
  await etaBuild(page, [STEPS[0], ['eta', ETA_START], ...STEPS.slice(1)], { elapsed: 300_000 });
  const line = live(page).locator('.stp-eta-line');
  await expect(line).toContainText('This one is a big job, and it’s still going');
  await expect(line).toContainText('5 minutes so far');
  await expect(live(page).locator('.stp-eta')).toHaveAttribute('data-state', 'big');
  await page.clock.fastForward(3000);
  expect(await saidTimes(page, 'This one is a big job')).toBe(1);
  expect(await saidTimes(page, 'Usually')).toBe(0);
});

test('LV-4 the estimate in Arabic, Japanese and Russian at 360 px: the browser\'s own minutes, right to left in Arabic, nothing spills', async ({ page }) => {
  const id = await newGame(page);
  await page.setViewportSize({ width: 360, height: 740 });
  for (const lang of ['ar', 'ja', 'ru']) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await etaBuild(page, [STEPS[0], ['eta', ETA_START], ['step', { i: 2, key: 'write', at: 300 }]], { lang, id });
    const line = live(page).locator('.stp-eta-line');
    await expect(line).toBeVisible();
    expect(await line.textContent()).toContain(await range(page, 1, 2));
    expect(await live(page).evaluate(e => getComputedStyle(e).direction)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await live(page).locator('.stp-eta').boundingBox(), card = await live(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(card.x - 1); expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
  }
});
