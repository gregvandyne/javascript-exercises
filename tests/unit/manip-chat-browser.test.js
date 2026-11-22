// Oomba on the Manipulatives board in a real browser (docs/decisions.md "Virtual math manipulatives: Oomba chat"): on a
// laptop "Draft with AI" opens the chat docked on the right and the board narrows beside it; a change Oomba makes lands
// on the board and "Undo Oomba's change" (and the board's own Undo) bring the old board back; a refresh mid-answer
// loses nothing; a failed answer is calm and Try again keeps the words. On an iPhone 13 the chat is a sheet above the tab
// bar that minimizes to the round Oomba bubble at the bottom right (a dot when Oomba answered meanwhile) and opens again;
// Escape minimizes. The AI is the existing stand-in (services/manipulatives.js hooks.create). MANIP_SHOTS=<dir> also
// saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const M = await import('../../server/services/manipulatives.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'OombaChatBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { M.hooks.create = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
async function open(hash, ctxOpts = LAPTOP) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  await page.waitForSelector('#mp-board');
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const clocks = page => page.locator('#mp-content .mp-obj').count();
const board = { title: 'Half hours', steps: ['Read each clock.', 'Write the time under it.'], items: ['3:30', '7:30', '11:30', '5:30'].map(time => ({ time, box: 'answer' })) };
/** The stand-in AI: each answer waits for release() unless auto. */
function ai(answers) {
  const calls = []; let gate = null, release = () => {};
  const arm = () => { gate = new Promise(r => { release = r; }); };
  arm();
  M.hooks.create = async params => {
    calls.push(params);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a.wait) { await gate; arm(); }
    if (a.fail) { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; }
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify(a.json) }] };
  };
  return { calls, release: () => release() };
}
const rect = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
async function send(page, text) {
  await page.fill('#mpc-in', text);
  await page.click('#mpc-send');
}

test('laptop: Draft with AI opens Oomba docked on the right; a change lands on the board; Undo brings the old board back', { skip }, async () => {
  const A = ai([{ json: { reply: 'Here are four clocks at half past, with two steps.', action: { op: 'replace', draft: board } } }, { json: { reply: 'Yes: half past is a good start for grade 2.', action: null } }]);
  try {
    const { ctx, page, errors } = await open('#clock');
    const before = await clocks(page);
    const boardW = (await rect(page, '#mp-board')).w;
    await page.click('#mp-toolsrow [data-tool="draft"]');
    await page.waitForSelector('#mpc:not([hidden])');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'mpc-in', 'focus in the composer');
    const p = await rect(page, '#mpc'), b = await rect(page, '#mp-board');
    assert.equal(Math.round(p.right), 1440, 'docked on the right'); assert.ok(p.w >= 320 && p.w <= 400);
    assert.ok(b.right <= p.x + 1, 'the board is beside the panel, not under it'); assert.ok(b.w < boardW, 'the board narrowed');
    assert.match(await page.textContent('#mpc'), /Tell me the lesson you’d like on this Clock board/);
    await send(page, 'Four clocks at half past for grade 2');
    await page.waitForSelector('.mpc-change [data-c="undo"]', { timeout: 15000 });
    assert.ok(await clocks(page) > before, 'the new board is on the screen');
    assert.match(await page.textContent('.mpc-change'), /Board updated: Half hours/);
    assert.match(await page.textContent('.mpc-change'), /4 problems, 2 steps/);
    // The context the AI got: the board on the screen (a new Clock board), never this page's other words.
    assert.match(A.calls[0].system, /Clock tool/); assert.match(A.calls[0].system, /a new board, not saved yet/);
    // A question with no change: just a reply.
    await send(page, 'Is that right for grade 2?');
    await page.waitForFunction(() => /good start for grade 2/.test(document.getElementById('mpc-log').textContent), null, { timeout: 15000 });
    assert.match(A.calls[1].system, /"time":"3:30"/, 'the next turn sees the changed board');
    await shot(page, 'laptop-docked-after-change');
    // Undo Oomba's change: the board as it was; Put it back: Oomba's board again.
    const drafted = await clocks(page);
    await page.click('.mpc-change [data-c="undo"]');
    assert.equal(await clocks(page), before);
    assert.match(await page.textContent('.mpc-change'), /Change undone/);
    await page.click('.mpc-change [data-c="redo"]');
    assert.equal(await clocks(page), drafted);
    // The board's own Undo too.
    await page.click('#mp-toolsrow [data-tool="undo"]');
    assert.equal(await clocks(page), before);
    // Escape in the chat minimizes it: the board gets its width back, focus goes to the bubble.
    await page.focus('#mpc-in');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mpc-bubble:not([hidden])');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'mpc-bubble');
    assert.ok((await rect(page, '#mp-board')).w > b.w, 'the board widened again');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { M.hooks.create = null; }
});

test('a refresh mid-answer loses nothing; a failed answer is calm and Try again keeps the words', { skip }, async () => {
  const A = ai([{ wait: true, json: { reply: 'Done: six clocks.', action: { op: 'replace', draft: { ...board, items: ['1:30', '2:30', '3:30', '4:30', '5:30', '6:30'].map(time => ({ time, box: 'answer' })) } } } }, { fail: true }, { json: { reply: 'Sure, here you go.', action: null } }]);
  try {
    const { ctx, page, errors } = await open('#clock');
    await page.click('#mpc-open');
    await send(page, 'Six clocks at half past');
    await page.waitForSelector('.mpc-wait');
    await page.reload(); await page.waitForSelector('#mp-board');
    await page.waitForSelector('#mpc:not([hidden]) .mpc-wait', { timeout: 10000 });
    assert.match(await page.textContent('#mpc-log'), /Six clocks at half past/);
    A.release();
    await page.waitForSelector('.mpc-change [data-c="undo"]', { timeout: 15000 });
    assert.equal(await page.locator('#mp-content .mp-obj').count() >= 6, true);
    // The AI fails: the board unchanged, a calm line, the words kept.
    const n = await page.locator('#mp-content .mp-obj').count();
    await send(page, 'Now make them quarter hours');
    await page.waitForSelector('[data-c="retry"]', { timeout: 15000 });
    assert.match(await page.textContent('#mpc-log'), /Oomba didn’t answer in time; your board is unchanged\./);
    assert.equal(await page.locator('#mp-content .mp-obj').count(), n);
    await page.click('[data-c="retry"]');
    await page.waitForFunction(() => /Sure, here you go/.test(document.getElementById('mpc-log').textContent), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-c="retry"]').count(), 0);
    assert.equal((await page.locator('.mpc-msg.me').allTextContents()).filter(x => x === 'Now make them quarter hours').length, 1, 'sent again once, not twice');
    // A message naming nothing allowed: refused before anything is stored, the words stay in the box.
    await send(page, 'Call 555-123-4567 later');
    await page.waitForSelector('#mpc-err:not([hidden])');
    assert.equal(await page.inputValue('#mpc-in'), 'Call 555-123-4567 later');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { M.hooks.create = null; }
});

test('iPhone 13: a sheet above the tab bar; minimized to the Oomba bubble bottom right (a dot for a new answer); opens again', { skip }, async () => {
  const A = ai([{ wait: true, json: { reply: 'Here are four clocks at half past.', action: { op: 'replace', draft: board } } }]);
  try {
    const { ctx, page, errors } = await open('#clock', { ...devices['iPhone 13'] });
    const vw = page.viewportSize().width, vh = page.viewportSize().height;
    await page.click('#mpc-open');
    await page.waitForSelector('#mpc:not([hidden])');
    const tab = await rect(page, '.tabbar'), p = await rect(page, '#mpc');
    assert.ok(Math.abs(p.bottom - tab.y) <= 1, 'the sheet sits on the tab bar'); assert.ok(p.w >= vw - 1, 'full width');
    await send(page, 'Four clocks at half past');
    await page.waitForSelector('.mpc-wait');
    await shot(page, 'iphone13-open');
    await page.click('[data-c="min"]');
    await page.waitForSelector('#mpc-bubble:not([hidden])');
    assert.equal(await page.locator('#mpc').isHidden(), true);
    const bub = await rect(page, '#mpc-bubble');
    assert.ok(bub.right <= vw - 8 && bub.right >= vw - 30, 'at the right'); assert.ok(bub.bottom <= tab.y - 8 && bub.bottom >= tab.y - 30, 'just above the tab bar');
    assert.ok(bub.w >= 44 && bub.h >= 44);
    assert.equal(await page.locator('#mpc-bubble .mpc-dot').isHidden(), true);
    A.release();
    await page.waitForSelector('#mpc-bubble .mpc-dot:not([hidden])', { timeout: 15000 });
    assert.match(await page.getAttribute('#mpc-bubble', 'aria-label'), /new answer/);
    assert.ok(await page.locator('#mp-content .mp-obj').count() >= 4, 'the change landed while minimized');
    await shot(page, 'iphone13-minimized');
    assert.ok(vh > 0);
    await page.click('#mpc-bubble');
    await page.waitForSelector('#mpc:not([hidden])');
    assert.equal(await page.locator('#mpc-bubble').isHidden(), true);
    assert.match(await page.textContent('#mpc-log'), /Here are four clocks/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mpc-bubble:not([hidden])');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { M.hooks.create = null; }
});
