// The Studio's "Behind the scenes" steps card: real steps in order (mock Builder), the AI path drawn from a scripted
// live stream (the plan is text, never HTML), the live card fed step by step, the summary after a reload, the tips
// toggle, "Did you know?" facts on a long step, a dropped connection, refusals, RTL and 360 px phones.
// The page sends with POST /chat (answered at once) and follows the build on GET /live; scriptLive() plays both.
import { test, expect } from '@playwright/test';
import { signup, uniq } from './helpers.js';

const idle = page => expect(page.locator('#st-send')).toBeEnabled({ timeout: 20000 });
const settled = async page => { await expect(page.locator('.st-busy')).toHaveCount(0, { timeout: 20000 }); await idle(page); };
async function newGame(page, lang) {
  await signup(page, uniq('Stp'));
  await page.goto(`/build${lang ? `?lang=${lang}` : ''}`);
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  return page.url().split('/studio/')[1];
}
/** Tap the Builder's chips until it has built a game (the mock asks a question or two first). */
async function buildWithChips(page) {
  for (let i = 0; i < 6 && !(await page.locator('#st-log .ev.version').count()); i++) {
    await page.locator('#st-log .qchips:not(.used) .chip').first().click();
    await settled(page);
  }
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
}
const sse = events => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const SSE = { 'Content-Type': 'text/event-stream; charset=utf-8' };
/**
 * Script a build: POST /chat answers 202 { turn: T1 }; the first /live after it gets hello { turn: T1 } (with the page's
 * own message and cid), caughtup and events; other /live connects get hello { turn: null } (failAfter: they fail
 * instead, a dropped connection). reply: the build's saved final entry, added to the Studio state the page reads after
 * 'done' (as the server would have saved it). provider: what the state says runs the Builder. Reloads the page.
 */
async function scriptLive(page, gameId, { events = [], reply = null, failAfter = false, provider = null } = {}) {
  const sent = { cid: null, text: '' }; let served = false;
  await page.route('**/api/studio/*/chat', async route => {
    const b = JSON.parse(route.request().postData() || '{}'); sent.cid = b.cid; sent.text = b.text;
    await route.fulfill({ status: 202, json: { ok: true, turn: { id: 'T1', status: 'queued' } } });
  });
  const user = () => ({ role: 'user', text: sent.text, at: Date.now(), uploads: [], turn: 'T1' });
  await page.route('**/api/studio/*/live', async route => {
    if (sent.cid && !served) {
      served = true;
      const turn = { id: 'T1', attempt: 1, chain: 0, carried: 0, provider: 'ai', mine: true, cid: sent.cid, elapsed: 0, entries: [user()], waiting: 0, left: 0 };
      return route.fulfill({ status: 200, headers: SSE, body: sse([['hello', { now: Date.now(), turn }], ['caughtup', {}], ...events]) });
    }
    if (sent.cid && failAfter) return route.abort('connectionreset');
    return route.fulfill({ status: 200, headers: SSE, body: sse([['hello', { now: Date.now(), turn: null }], ['caughtup', {}]]) });
  });
  await page.route(u => u.pathname === `/api/studio/${gameId}`, async route => {
    const res = await route.fetch(); const json = await res.json();
    if (sent.cid && reply) json.chat = [...json.chat, user(), { role: 'assistant', at: Date.now(), turn: 'T1', ...reply }];
    if (provider) json.provider = provider;
    await route.fulfill({ response: res, json });
  });
  await page.reload();   // the page's live stream now goes through these routes
  return sent;
}
const unscript = async (page, gameId) => { await page.unroute('**/api/studio/*/chat'); await page.unroute('**/api/studio/*/live'); await page.unroute(u => u.pathname === `/api/studio/${gameId}`); };
/** The record 'done' carries, built from the same steps (times are made up). */
function record(steps, extra = {}) {
  const s = []; let at = 0;
  for (const [e, d] of steps) {
    if (e === 'step') { const { i, key, ...f } = d; void i; s.push(Object.keys(f).length ? [key, at, { ...f }] : [key, at]); at += 1500; }
    else if (e === 'stepinfo') { const { i, ...f } = d; Object.assign(s[i - 1][2] || (s[i - 1][2] = {}), f); }
  }
  return { v: 1, p: 'ai', ms: at + 500, r: s.filter(r => r[0] === 'think').length, end: 'ok', s, ...extra };
}
/** Replace the live stream with one the test pushes events into (window.__sse.push / .end: the newest stream), and
 *  answer the chat POST with 202 (window.__cid: the message's id). */
const pushableLive = () => {
  const real = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    const u = String(url);
    if (/\/api\/studio\/[^/]+\/chat$/.test(u) && (opts.method || 'GET') === 'POST') {
      const b = JSON.parse(opts.body); window.__cid = b.cid; window.__text = b.text;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, turn: { id: 'T1', status: 'queued' } }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    }
    if (!/\/api\/studio\/[^/]+\/live$/.test(u)) return real(url, opts);
    let ctl; const enc = new TextEncoder();
    const body = new ReadableStream({ start(c) { ctl = c; } });
    window.__sse = { push: (e, d) => ctl.enqueue(enc.encode(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)), end: () => ctl.close() };
    if (opts.signal) opts.signal.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
    return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  };
};
const noOverflow = async page => {
  const m = await page.evaluate(() => { const l = document.getElementById('st-log'); return { doc: document.documentElement.scrollWidth, win: innerWidth, sw: l.scrollWidth, cw: l.clientWidth }; });
  expect(m.doc).toBeLessThanOrEqual(m.win);
  expect(m.sw).toBeLessThanOrEqual(m.cw);
};

test('the steps card replaces the dots, shows the real steps in order, and folds into a summary that survives a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await newGame(page);
  // Record any typing dots, and every text the preview pill shows (each step changes it).
  await page.evaluate(() => {
    window.__typing = 0; window.__pill = [];
    new MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof Element && (n.matches('.typing') || n.querySelector('.typing'))) window.__typing++;
    }).observe(document.getElementById('st-log'), { childList: true, subtree: true });
    new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 3) window.__pill.push(n.data); })
      .observe(document.getElementById('st-stage'), { childList: true, subtree: true });
  });
  await buildWithChips(page);
  expect(await page.evaluate(() => window.__typing)).toBe(0);
  const pill = await page.evaluate(() => window.__pill);
  for (const x of ['Checking your message is safe', 'Using the simple building blocks', 'Asked you a question']) expect(pill.some(p => p.includes(x))).toBe(true);
  // Each reply ends with its folded summary (a quick turn never flashes the live card first); the live card is gone.
  await expect(page.locator('.stp[data-state="live"]')).toHaveCount(0);
  const turns = await page.locator('.stp-sum').count();
  expect(turns).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.stp-sum').last()).toContainText('How the building blocks did this · 6 steps');
  await expect(page.locator('#st-steps-live')).toContainText('How the building blocks did this');
  // The steps each turn stored, in order: question turns, then the build turn (the practice builder: never a round,
  // a playtest or a plan).
  const stored = [];
  for (const sum of await page.locator('.stp-sum').all()) {
    await sum.click();
    stored.push(await sum.locator('..').locator('.stp-body li.stp-row').evaluateAll(els => els.map(e => e.dataset.step)));
    await sum.click();
  }
  for (const t of stored.slice(0, -1)) expect(t).toEqual(['screen', 'blocks', 'ask']);
  expect(stored.at(-1)).toEqual(['screen', 'blocks', 'name', 'check', 'notes', 'ask']);

  // After a reload the same summaries come back from the saved transcript, and open with the keyboard.
  await page.reload();
  await expect(page.locator('.stp-sum')).toHaveCount(turns);
  const sum = page.locator('.stp-sum').last();
  await sum.focus(); await page.keyboard.press('Enter');
  await expect(sum).toHaveAttribute('aria-expanded', 'true');
  const body = page.locator('.stp-body').last();
  expect(await body.locator('li.stp-row').evaluateAll(els => els.map(e => e.dataset.step))).toEqual(['screen', 'blocks', 'name', 'check', 'notes', 'ask']);
  await expect(body.locator('li.stp-row[data-step="check"]')).toContainText('Safety program: all clear · saved as version 1');
  await expect(body.locator('.stp-loop')).toContainText('fixed rules');
  await expect(body.locator('.stp-foot')).toHaveCount(1);   // no tokens line: the building blocks use no AI
  // A finished row opens with Enter to show its learning line.
  const row = body.locator('li.stp-row[data-step="blocks"]');
  await expect(row.locator('.stp-learn')).toHaveCount(0);
  await row.locator('button.stp-line').focus(); await page.keyboard.press('Enter');
  await expect(row.locator('button.stp-line')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.stp-learn')).toContainText('aren’t AI');
});

test('the AI path: rounds, thinking, the plan as plain text, playtest, fix, tokens and the agent loop', async ({ page }) => {
  const id = await newGame(page);
  const steps = [
    ['step', { i: 1, key: 'screen' }],
    ['step', { i: 2, key: 'think', n: 1, c: 'start' }], ['stepinfo', { i: 2, th: 1 }],
    ['step', { i: 3, key: 'write' }], ['stepinfo', { i: 3, plan: '<img src=x onerror=alert(1)> Fox', l: 4 }], ['stepinfo', { i: 3, l: 120 }],
    ['step', { i: 4, key: 'check', st: 'pass', v: 1 }],
    ['step', { i: 5, key: 'think', n: 2, c: 'next' }],
    ['step', { i: 6, key: 'playtest', v: 1 }], ['stepinfo', { i: 6, pics: 2, probs: 1 }],
    ['step', { i: 7, key: 'think', n: 3, c: 'look' }],
    ['step', { i: 8, key: 'fix', via: 'edit' }], ['stepinfo', { i: 8, e: 2, plan: 'Made the buttons bigger' }],
    ['step', { i: 9, key: 'check', st: 'pass', v: 2 }],
    ['step', { i: 10, key: 'think', n: 4, c: 'next' }],
    ['step', { i: 11, key: 'name', title: 'Fox Hop', icon: '🦊' }],
    ['step', { i: 12, key: 'think', n: 5, c: 'next' }],
    ['step', { i: 13, key: 'notes' }],
    ['step', { i: 14, key: 'ask' }],
  ];
  const rec = record(steps, { ti: 48210, to: 6320 });
  await scriptLive(page, id, { events: [...steps, ['text', { text: 'Here you go!' }], ['done', { turnsLeft: 59, steps: rec }]], reply: { text: 'Here you go!', events: [['steps', rec]] } });
  page.on('dialog', d => { throw new Error(`unexpected dialog ${d.message()}`); });
  await page.fill('#st-input', 'A fox game'); await page.press('#st-input', 'Enter');
  await settled(page);
  const sum = page.locator('.stp-sum').last();
  await expect(sum).toContainText('How the AI did this · 14 steps');
  await sum.click();
  const card = page.locator('.stp[data-state="done"]').last();
  for (const s of ['Round 1: read your message', 'Wrote the game code', '120 lines', 'Round 3: looked at the pictures', '2 pictures · 1 problem found',
    'Made changes to fix the problems', '2 changes', 'Safety program: all clear · saved as version 2',
    'The AI read 48,210 tokens and wrote 6,320.', 'The AI worked in 5 rounds.']) await expect(card).toContainText(s);
  // The game title keeps its own direction (bidi isolates) inside the sentence.
  await expect(card.locator('li.stp-row[data-step="name"]')).toHaveText(/Named it “\u2068Fox Hop\u2069” 🦊/);
  // Round 1 really thought first (a visible word, not a tooltip); the plan is the AI's own text, shown as text.
  await expect(card.locator('li.stp-row[data-step="think"]').first().locator('.stp-th')).toHaveText('🤔 thought first');
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card.locator('li.stp-row[data-step="write"] .stp-plan')).toContainText('<img src=x onerror=alert(1)> Fox');
  await expect(card.locator('li.stp-row[data-step="fix"] .stp-plan')).toContainText('Made the buttons bigger');
  // Screen readers get the summary once, from the polite region outside the chat log.
  await expect(page.locator('#st-steps-live')).toContainText('How the AI did this · 14 steps');
  await expect(page.locator('.stp').first()).toHaveAttribute('aria-live', 'off');
});

test('an error marks the step it stopped on and the summary says it stopped early', async ({ page }) => {
  const id = await newGame(page);
  const steps = [['step', { i: 1, key: 'screen' }], ['step', { i: 2, key: 'think', n: 1, c: 'start' }]];
  const rec = record(steps, { end: 'error' });
  await scriptLive(page, id, { events: [...steps, ['error', { message: 'The Builder got muddled.' }], ['done', { turnsLeft: 59, steps: rec }]],
    reply: { text: '', events: [['error', { message: 'The Builder got muddled.' }], ['steps', rec]] } });
  await page.fill('#st-input', 'A fox game'); await page.press('#st-input', 'Enter');
  await settled(page);
  await expect(page.locator('#st-log .msg.err')).toContainText('muddled');
  const sum = page.locator('.stp-sum').last();
  await expect(sum).toContainText('2 steps');
  await expect(sum).toContainText('stopped early');
  await sum.click();
  const last = page.locator('.stp-body li.stp-row').last();
  await expect(last).toHaveAttribute('data-state', 'warn');
  await expect(last).toContainText('Stopped here');
  // It did not finish, so it keeps its present wording.
  await expect(last).toContainText('Round 1: reading your message');
  await expect(last).not.toContainText('Round 1: read your message');
});

test('the live card, fed step by step: thinking is a chip, "Just now" lines, a late failure marks its own row, nothing after done', async ({ page }) => {
  await page.addInitScript(pushableLive);
  const id = await newGame(page);
  await page.waitForFunction(() => window.__sse);
  const push = (e, d) => page.evaluate(([e, d]) => window.__sse.push(e, d), [e, d]);
  await push('hello', { now: Date.now(), turn: null }); await push('caughtup', {});
  await page.fill('#st-input', 'A fox game'); await page.press('#st-input', 'Enter');
  await page.waitForFunction(() => window.__cid);
  const live = page.locator('.stp[data-state="live"]');
  const cur = live.locator('li.stp-cur');
  // The build starts: this tab's own card (with its "Sending" row) is kept and the server's steps follow in it.
  const cid = await page.evaluate(() => window.__cid);
  await push('turn', { id: 'T1', attempt: 1, chain: 0, carried: 0, provider: 'ai', mine: true, cid, elapsed: 0, entries: [{ role: 'user', text: 'A fox game', at: Date.now(), uploads: [], turn: 'T1' }], waiting: 0, left: 0 });
  await expect(page.locator('#st-log .msg.me')).toHaveCount(1);
  await push('step', { i: 1, key: 'screen', at: 0 });
  await push('step', { i: 2, key: 'think', n: 1, c: 'start' });
  await expect(cur.locator('.stp-label')).toHaveText('Round 1: reading your message');
  // Once the AI starts answering, round 1 is planning, not reading; thinking is a word next to it.
  await push('stepinfo', { i: 2, a: 1, th: 1 });
  await expect(cur).toHaveAttribute('data-step', 'think');
  await expect(cur.locator('.stp-label')).toHaveText('Round 1: planning how to build it');
  await expect(cur.locator('.stp-th')).toHaveText('🤔 thinking');
  await expect(cur.locator('.stp-tip')).toContainText('A round is each time the app asks the AI');
  await push('text', { text: 'Great idea! ' });
  await expect(cur.locator('.stp-th')).toHaveText('🤔 thought first');
  await push('step', { i: 3, key: 'write' }); await push('stepinfo', { i: 3, plan: 'A fox and a dragon', l: 40 });
  await expect(cur.locator('.stp-plan')).toHaveText('Plan: A fox and a dragon');
  await expect(page.locator('.st-busy')).toContainText('Writing the game code · 40 lines');
  await push('step', { i: 4, key: 'name', title: 'Fox Hop', icon: '🦊' });
  await push('step', { i: 5, key: 'check', st: 'flag', v: 1, k: 2 });
  await push('stepinfo', { i: 3, ok: false });          // late: marks row 3, not the newest
  await push('step', { i: 6, key: 'think', n: 2, c: 'next' });
  await expect(live.locator('li.stp-row[data-step="write"]')).toHaveAttribute('data-state', 'warn');
  await expect(live.locator('li.stp-row[data-step="write"]')).toContainText('That version didn’t work out');
  await expect(live.locator('li.stp-row')).toHaveCount(6);
  // The instant safety check was over in a flash: its learning line shows under the next round.
  await expect(cur.locator('.stp-tip')).toContainText('Just now: A safety program, not an AI, checks every new version');
  await expect(live.locator('li.stp-row[data-step="check"]')).toContainText('Safety program: 2 things to look at · saved as version 1');
  const s = [['screen', 0], ['think', 300, { n: 1, c: 'start', th: 1 }], ['write', 900, { plan: 'A fox and a dragon', l: 40, ok: false }], ['name', 1500, { title: 'Fox Hop', icon: '🦊' }], ['check', 1501, { st: 'flag', v: 1, k: 2 }], ['think', 1502, { n: 2, c: 'next' }]];
  const rec = { v: 1, p: 'ai', ms: 2500, r: 2, end: 'ok', s };
  // After 'done' the page reads the state again and redraws the chat from the saved transcript.
  await page.route(u => u.pathname === `/api/studio/${id}`, async route => {
    const res = await route.fetch(); const json = await res.json();
    json.chat = [...json.chat, { role: 'user', text: 'A fox game', turn: 'T1' }, { role: 'assistant', text: 'Great idea! ', events: [['steps', rec]], turn: 'T1' }];
    await route.fulfill({ response: res, json });
  });
  await push('done', { turnsLeft: 59, steps: rec });
  // After done: ignored (the page may already have closed this stream to open a fresh one).
  await page.evaluate(() => { try { window.__sse.push('step', { i: 7, key: 'ask' }); window.__sse.end(); } catch { /* closed */ } });
  await settled(page);
  await expect(live).toHaveCount(0);
  await expect(page.locator('.stp-sum')).toContainText('How the AI did this · 6 steps');
});

test('the tips toggle hides the learning lines and is remembered', async ({ page }) => {
  test.setTimeout(60_000);
  await newGame(page);
  await page.locator('#st-log .qchips:not(.used) .chip').first().click(); await settled(page);
  await page.locator('.stp-sum').last().click();
  const tips = page.locator('.stp-body .stp-tips').last();
  await expect(tips).toHaveText('💡 Tips: on');
  await page.locator('.stp-body li.stp-row button.stp-line').first().click();
  await expect(page.locator('.stp-body .stp-learn').first()).toBeVisible();
  await tips.click();
  await expect(tips).toHaveText('💡 Tips: off');
  await expect(page.locator('.stp-body .stp-loop')).toBeHidden();
  // A row someone tapped open still shows its line (Tips off only stops the automatic ones).
  await expect(page.locator('.stp-body .stp-learn').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('#st-log')).toHaveClass(/tips-off/);
  await page.locator('.stp-sum').last().click();
  await expect(page.locator('.stp-body .stp-tips').last()).toHaveText('💡 Tips: off');
  await page.locator('.stp-body .stp-tips').last().click();
  await expect(page.locator('#st-log')).not.toHaveClass(/tips-off/);
  await expect(page.locator('.stp-body .stp-loop')).toBeVisible();
});

test('a long AI step shows "Did you know?" facts; a dropped connection says the Builder keeps going', async ({ page }) => {
  test.setTimeout(60_000);
  const id = await newGame(page);
  await page.clock.install();
  await page.reload();
  // The stream stops after round 1 with no 'done', and reconnecting fails (a dropped connection).
  await scriptLive(page, id, { events: [['step', { i: 1, key: 'screen', at: 0 }], ['step', { i: 2, key: 'think', n: 1, c: 'start', at: 100 }], ['step', { i: 3, key: 'write', at: 200 }], ['stepinfo', { i: 3, plan: 'A fox who hops', l: 30 }]], failAfter: true, provider: 'claude' });
  await page.fill('#st-input', 'A fox game'); await page.press('#st-input', 'Enter');
  const live = page.locator('.stp[data-state="live"]');
  const cur = live.locator('li.stp-row.stp-cur');
  await expect(cur).toHaveAttribute('data-step', 'offline');
  await expect(cur).toContainText('Connection lost. The Builder keeps going on the server');
  await expect(page.locator('.st-busy')).toContainText('Connection lost');
  // Nobody here knows whether the write finished: it keeps its present wording, with no ✓. Tapping it shows the plan.
  const write = live.locator('li.stp-row[data-step="write"]');
  await expect(write).toHaveAttribute('data-state', 'paused');
  await expect(write).toContainText('Writing the game code');
  await expect(write).not.toContainText('✓');
  await write.locator('button.stp-line').click();
  await expect(write.locator('.stp-plan')).toContainText('A fox who hops');
  // One 💡 line under the running row: its own line first, then after a while a "Did you know?" fact.
  const tip = cur.locator('.stp-tip');
  await expect(tip).toContainText('called a server');
  await page.clock.fastForward(8500);
  await expect(tip).toContainText('Did you know?');
  const first = await tip.textContent();
  await page.clock.fastForward(11500);
  await expect.poll(() => tip.textContent()).not.toBe(first);
  await live.locator('.stp-tips').click();
  await expect(tip).toBeHidden();
  await live.locator('.stp-tips').click();
  // The connection comes back and nothing is running any more: the page redraws the chat and the card goes away.
  await unscript(page, id);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(live).toHaveCount(0);
  await expect(page.locator('.st-busy')).toHaveCount(0);
  await idle(page);
});

test('a refused message keeps the kind refusal and leaves no steps card', async ({ page }) => {
  await newGame(page);
  await page.fill('#st-input', 'make a pokemon game'); await page.press('#st-input', 'Enter');
  await settled(page);
  await expect(page.locator('#st-log .msg.bot.refused')).toBeVisible();
  await expect(page.locator('#st-log .qchips:not(.used)')).toHaveCount(1);
  await expect(page.locator('.stp')).toHaveCount(0);
  await expect(page.locator('#st-log .err')).toHaveCount(0);
});

for (const lang of ['ar', 'he']) {
  test(`RTL (${lang}) at 360 px: the card reads right to left and nothing spills sideways`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await newGame(page, lang);
    await buildWithChips(page);
    const sum = page.locator('.stp-sum').last();
    await sum.click();
    await noOverflow(page);
    const card = page.locator('.stp[data-state="done"]').last();
    expect(await card.evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
    const row = card.locator('li.stp-row').first();
    const ico = await row.locator('.stp-ico').boundingBox(), label = await row.locator('.stp-label').boundingBox();
    expect(ico.x).toBeGreaterThan(label.x);
    expect((await sum.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await card.locator('.stp-tips').boundingBox()).height).toBeGreaterThanOrEqual(44);
    // Translated, not English.
    await expect(card).not.toContainText('Safety program');
  });
}

test('360 px phone: no sideways scroll while live or folded; reduced motion stills the spinner', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const id = await newGame(page);
  await scriptLive(page, id, { events: [['step', { i: 1, key: 'screen' }], ['step', { i: 2, key: 'think', n: 1, c: 'start' }], ['stepinfo', { i: 2, th: 1 }],
    ['step', { i: 3, key: 'write' }], ['stepinfo', { i: 3, plan: 'A very long plan '.repeat(8).trim(), l: 3000 }]], failAfter: true });
  await page.fill('#st-input', 'A fox game'); await page.press('#st-input', 'Enter');
  const live = page.locator('.stp[data-state="live"]');
  await expect(live.locator('li.stp-cur')).toHaveAttribute('data-step', 'offline');
  await live.locator('.stp-more').click();
  await expect(live.locator('.stp-more')).toHaveAttribute('aria-expanded', 'true');
  await noOverflow(page);
  expect(await live.locator('.stp-spin').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  for (const b of await live.locator('button.stp-line, .stp-more, .stp-tips').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(40);
  await unscript(page, id);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(live).toHaveCount(0, { timeout: 15000 });
  await idle(page);
  await buildWithChips(page);
  await page.locator('.stp-sum').last().click();
  await noOverflow(page);
});
