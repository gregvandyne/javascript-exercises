// The Manipulatives board through Oomba, the site's one companion chat, in a real browser (docs/decisions.md "Oomba
// teaching companion: one chat everywhere"; public/js/companion.js with this page's workflow in public/js/manip-chat.js):
// on a laptop "Draft with AI" opens the panel docked on the right ("Sees:" this board) and the board narrows beside it;
// a change Oomba makes lands on the board and Undo under the answer (and the board's own Undo) bring the old board back;
// an unrelated request leaves the board alone; a refresh mid-answer loses nothing; a failed answer is calm and Try again
// keeps the words. On an iPhone 13 the panel is a sheet above the tab bar that minimizes to the round Oomba bubble at
// the bottom right (a dot when Oomba answered meanwhile) and opens again; Escape minimizes. The AI is a stand-in
// (services/companion.js hooks.create) answering with the board's tool. MANIP_SHOTS=<dir> also saves pictures.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const M = await import('../../server/services/manipulatives.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');

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
test.after(async () => { CO.hooks.create = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

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
/** The stand-in AI: each answer waits for release() unless auto; a draft is sent with changeBoard first, then the reply. */
function ai(answers) {
  const calls = []; let gate = null, release = () => {}, k = 0;
  const arm = () => { gate = new Promise(r => { release = r; }); };
  arm();
  CO.hooks.create = async params => {
    calls.push(params);
    const lastMsg = params.messages.at(-1), afterTool = Array.isArray(lastMsg.content) && lastMsg.content.some(c => c.type === 'tool_result');
    const a = answers[Math.min(afterTool ? k - 1 : k++, answers.length - 1)];
    if (!afterTool && a.wait) { await gate; arm(); }
    if (a.fail) { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; }
    const base = { model: params.model, usage: { input_tokens: 5, output_tokens: 5 } };
    const act = a.json.action;
    if (!afterTool && act && act.draft) return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: 'changeBoard', input: act.draft }] };
    if (!afterTool && a.json.tool) return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: a.json.tool, input: a.json.input || {} }] };
    return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: a.json.reply }] };
  };
  return { calls, release: () => release() };
}
const rect = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
async function send(page, text) {
  await page.fill('#oc-in', text);
  await page.click('#oc-send');
}

test('laptop: Draft with AI opens Oomba docked on the right; a change lands on the board; Undo brings the old board back', { skip }, async () => {
  const A = ai([{ json: { reply: 'Here are four clocks at half past, with two steps.', action: { op: 'replace', draft: board } } }, { json: { reply: 'Yes: half past is a good start for grade 2.', action: null } }, { json: { reply: 'Here are two.', tool: 'searchBooks', input: { words: 'animals', readingLevel: 'M' } } }]);
  try {
    const { ctx, page, errors } = await open('#clock');
    const before = await clocks(page);
    const boardW = (await rect(page, '#mp-board')).w;
    await page.click('#mp-toolsrow [data-tool="draft"]');
    await page.waitForSelector('#oc:not([hidden])');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'oc-in', 'focus in the composer');
    const p = await rect(page, '#oc'), b = await rect(page, '#mp-board');
    assert.equal(Math.round(p.right), 1440, 'docked on the right'); assert.ok(p.w >= 320 && p.w <= 440);
    assert.ok(b.right <= p.x + 1, 'the board is beside the panel, not under it'); assert.ok(b.w < boardW, 'the board narrowed');
    assert.match(await page.textContent('#oc'), /Tell me the lesson you’d like on this Clock board/);
    await send(page, 'Four clocks at half past for grade 2');
    await page.waitForSelector('.oc-change [data-act="mundo"]', { timeout: 15000 });
    assert.ok(await clocks(page) > before, 'the new board is on the screen');
    assert.match(await page.textContent('.oc-change'), /Board updated: Half hours/);
    assert.match(await page.textContent('.oc-change'), /4 problems, 2 steps/);
    // The context the AI got: the board on the screen (a new Clock board), never this page's other words.
    assert.match(A.calls[0].system, /Clock tool/); assert.match(A.calls[0].system, /a new board, not saved yet/);
    assert.match(await page.textContent('#oc-sees'), /Clock/, 'Sees: this board');
    // A question with no change: just a reply.
    await send(page, 'Is that right for grade 2?');
    await page.waitForFunction(() => /good start for grade 2/.test(document.getElementById('oc-log').textContent), null, { timeout: 15000 });
    assert.match(A.calls.at(-1).system, /"time":"3:30"/, 'the next turn sees the changed board');
    await shot(page, 'laptop-docked-after-change');
    // Undo Oomba's change: the board as it was; Put it back: Oomba's board again.
    const drafted = await clocks(page);
    await page.click('.oc-change [data-act="mundo"]');
    assert.equal(await clocks(page), before);
    assert.match(await page.textContent('.oc-change'), /Change undone/);
    await page.click('.oc-change [data-act="mredo"]');
    assert.equal(await clocks(page), drafted);
    // The board's own Undo too.
    await page.click('#mp-toolsrow [data-tool="undo"]');
    assert.equal(await clocks(page), before);
    // Unrelated: a book for a level M reader comes back as book cards; the board is not touched.
    const n0 = await clocks(page);
    await send(page, 'find me a book for a level M reader about animals');
    await page.waitForSelector('.oc-card.book', { timeout: 15000 });
    assert.equal(await clocks(page), n0, 'the board is not touched');
    // Escape in the chat minimizes it: the board gets its width back, focus goes to the bubble.
    await page.focus('#oc-in');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#oc-bubble:not([hidden])');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'oc-bubble');
    assert.ok((await rect(page, '#mp-board')).w > b.w, 'the board widened again');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});

test('a refresh mid-answer loses nothing; a failed answer is calm and Try again keeps the words', { skip }, async () => {
  const A = ai([{ wait: true, json: { reply: 'Done: six clocks.', action: { op: 'replace', draft: { ...board, items: ['1:30', '2:30', '3:30', '4:30', '5:30', '6:30'].map(time => ({ time, box: 'answer' })) } } } }, { fail: true }, { json: { reply: 'Sure, here you go.', action: null } }]);
  try {
    const { ctx, page, errors } = await open('#clock');
    await page.click('#oc-bubble');
    await send(page, 'Six clocks at half past');
    await page.waitForSelector('.oc-wait');
    await page.reload(); await page.waitForSelector('#mp-board');
    await page.waitForSelector('#oc:not([hidden]) .oc-wait', { timeout: 10000 });
    assert.match(await page.textContent('#oc-log'), /Six clocks at half past/);
    A.release();
    await page.waitForSelector('.oc-change [data-act="mundo"]', { timeout: 15000 });
    assert.equal(await page.locator('#mp-content .mp-obj').count() >= 6, true);
    // The AI fails: the board unchanged, a calm line, the words kept.
    const n = await page.locator('#mp-content .mp-obj').count();
    await send(page, 'Now make them quarter hours');
    await page.waitForSelector('[data-c="retry"]', { timeout: 15000 });
    assert.match(await page.textContent('#oc-log'), /Oomba didn’t answer in time\. Nothing was changed\./);
    assert.equal(await page.locator('#mp-content .mp-obj').count(), n);
    await page.click('[data-c="retry"]');
    await page.waitForFunction(() => /Sure, here you go/.test(document.getElementById('oc-log').textContent), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-c="retry"]').count(), 0);
    assert.equal((await page.locator('.oc-msg.me').allTextContents()).filter(x => x === 'Now make them quarter hours').length, 1, 'sent again once, not twice');
    // Contact details never go anywhere: taken out before the message is kept or sent.
    await send(page, 'Call 555-123-4567 later');
    await page.waitForFunction(() => /Call \[phone\] later/.test(document.getElementById('oc-log').textContent), null, { timeout: 15000 });
    assert.ok(A.calls.every(c => !/555-123-4567/.test(JSON.stringify(c.messages))));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});

test('iPhone 13: a sheet above the tab bar; minimized to the Oomba bubble bottom right (a dot for a new answer); opens again', { skip }, async () => {
  const A = ai([{ wait: true, json: { reply: 'Here are four clocks at half past.', action: { op: 'replace', draft: board } } }]);
  try {
    const { ctx, page, errors } = await open('#clock', { ...devices['iPhone 13'] });
    const vw = page.viewportSize().width, vh = page.viewportSize().height;
    await page.click('#oc-bubble');
    await page.waitForSelector('#oc:not([hidden])');
    const tab = await rect(page, '.tabbar'), p = await rect(page, '#oc');
    assert.ok(Math.abs(p.bottom - tab.y) <= 1, 'the sheet sits on the tab bar'); assert.ok(p.w >= vw - 1, 'full width');
    await send(page, 'Four clocks at half past');
    await page.waitForSelector('.oc-wait');
    await shot(page, 'iphone13-open');
    await page.click('[data-c="min"]');
    await page.waitForSelector('#oc-bubble:not([hidden])');
    assert.equal(await page.locator('#oc').isHidden(), true);
    const bub = await rect(page, '#oc-bubble');
    assert.ok(bub.right <= vw - 8 && bub.right >= vw - 30, 'at the right'); assert.ok(bub.bottom <= tab.y - 8 && bub.bottom >= tab.y - 30, 'just above the tab bar');
    assert.ok(bub.w >= 44 && bub.h >= 44);
    assert.equal(await page.locator('#oc-bubble .oc-dot').isHidden(), true);
    A.release();
    await page.waitForSelector('#oc-bubble .oc-dot:not([hidden])', { timeout: 15000 });
    assert.match(await page.getAttribute('#oc-bubble', 'aria-label'), /new answer/);
    assert.ok(await page.locator('#mp-content .mp-obj').count() >= 4, 'the change landed while minimized');
    await shot(page, 'iphone13-minimized');
    assert.ok(vh > 0);
    await page.click('#oc-bubble');
    await page.waitForSelector('#oc:not([hidden])');
    assert.equal(await page.locator('#oc-bubble').isHidden(), true);
    assert.match(await page.textContent('#oc-log'), /Here are four clocks/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#oc-bubble:not([hidden])');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});
