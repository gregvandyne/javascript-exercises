// Figures through Oomba, the site's one companion chat, in a real browser (docs/decisions.md "Oomba teaching companion:
// one chat everywhere"; public/js/companion.js with this page's workflow in public/js/figures-sheet.js). On a laptop:
// "Describe what you need" on the menu makes the worksheet and opens the builder with the companion's progress card; a
// refresh mid-draft shows the same progress again and the questions land; "make 3 and 7 harder and use inches" changes
// only those two (marked) and the units, with the answers worked out again; Undo; "Ask Oomba about this" quotes a
// question; an off-topic request (a book) answers with the general tools and leaves the worksheet alone; the budget
// resting says so and offers "Add a starter set instead". On an iPhone 13: the panel is a sheet that minimizes to the
// Oomba bubble, with a dot when Oomba answered meanwhile. No sideways scroll, no console errors. The AI is a stand-in
// (services/companion.js hooks.create) answering with the page's tool. FIGCHAT_SHOTS=<dir> also saves pictures.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const F = await import('../../server/services/figures.js');
const C = await import('../../server/services/oomba-chat.js');
const CO = await import('../../server/services/companion.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIGCHAT_SHOTS || '';

const boss = createUser({ username: 'FigChatBrowser', password: 'secret123', role: 'admin' });
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
async function open(path, ctxOpts = LAPTOP) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
const rect = (AB, BC, key, question) => ({ kind: 'rectangle', data: { AB, BC, unit: 'cm' }, question, answerType: 'number', answerKey: key });
const FIRST = [
  rect(6, 4, 'area', 'What is the area of the rectangle?'), rect(9, 5, 'perimeter', 'What is the perimeter of the rectangle?'),
  rect(7, 3, 'area', 'Find the area of the rectangle.'), { kind: 'triangle', data: { AB: 6, BC: 8, B: 90, unit: 'cm' }, question: 'Find the area of the right triangle.', answerType: 'number', answerKey: 'area' },
  { kind: 'compositeShape', data: { parts: [{ rect: [0, 0, 8, 3] }, { rect: [0, 3, 3, 4] }], sides: true, unit: 'cm' }, question: 'What is the area of the shape?', answerType: 'number', answerKey: 'area' },
  rect(5, 5, 'perimeter', 'A square garden has sides of 5. How much fence goes all the way around it?'), rect(8, 2, 'perimeter', 'What is the perimeter of the rectangle?'),
  rect(10, 7, 'area', 'A rug is 10 long and 7 wide. How much floor does it cover?'),
];
/** The stand-in AI: a first draft on an empty sheet, "harder" makes 3 and 7 two-rectangle shapes (and inches),
 *  "sandbox" rewrites the quoted question, "book" searches the library; each answer waits for release() while held. It
 *  calls the page's tool (editWorksheet) with the change, then says the reply. */
function ai() {
  const calls = []; let gate = null, release = () => {};
  const hold = () => { gate = new Promise(r => { release = r; }); };
  CO.hooks.create = async params => {
    calls.push(params);
    const lastMsg = params.messages.at(-1), afterTool = Array.isArray(lastMsg.content) && lastMsg.content.some(c => c.type === 'tool_result');
    if (!afterTool && gate) await gate;
    const words = [...params.messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string').content;
    let json;
    if (/book/.test(words)) json = { reply: 'Level M is usually late grade 2 to early grade 3, so these should fit.', tool: 'searchBooks', input: { words: 'animals', readingLevel: 'M' } };
    else if (/harder/.test(words)) json = { reply: 'Questions 3 and 7 are harder now, and every question uses inches.', units: 'in', edits: [
      { op: 'replace', n: 3, item: { kind: 'compositeShape', question: 'This shape is made of two rectangles. What is its area?', data: { parts: [{ rect: [0, 0, 12, 4] }, { rect: [0, 4, 5, 6] }], sides: true, unit: 'in' }, answerType: 'number', answerKey: 'area' } },
      { op: 'replace', n: 7, item: { kind: 'compositeShape', question: 'What is the perimeter of the shape?', data: { parts: [{ rect: [0, 0, 14, 5] }, { rect: [9, 5, 5, 6] }], sides: true, unit: 'in' }, answerType: 'number', answerKey: 'perimeter' } },
    ] };
    else if (/sandbox/.test(words)) json = { reply: 'Question 4 is about a sandbox now.', edits: [{ op: 'replace', n: 4, item: { kind: 'triangle', question: 'A sandbox is shaped like this right triangle. How much sand covers its floor?', data: { AB: 6, BC: 8, B: 90, unit: 'in' }, answerType: 'number', answerKey: 'area' } }] };
    else json = { reply: 'Here are 8 questions on area and perimeter of rectangles.', title: 'Area and perimeter of rectangles', edits: FIRST.map(item => ({ op: 'add', item })) };
    const base = { model: params.model, usage: { input_tokens: 5, output_tokens: 5 } };
    if (afterTool) return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: json.reply }] };
    if (json.tool) return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: json.tool, input: json.input }] };
    const { reply, ...input } = json;
    return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: 'editWorksheet', input }] };
  };
  return { calls, hold, release: () => { const r = release; gate = null; r(); } };
}
const answers = page => page.$$eval('.fg-ians b', bs => bs.map(b => b.textContent));

test('on a laptop: describe on the menu, the progress card, a refresh mid-draft, a refine turn, Undo, a quote', { skip }, async () => {
  const stand = ai();
  try {
    const { ctx, page, errors } = await open('/figures');
    await page.fill('#fgd-in', 'Area and perimeter of rectangles for grade 4, 8 questions, a couple of word problems');
    await page.selectOption('#fgd-grade', '4');
    await noSideScroll(page);
    await shot(page, 'home-describe');
    stand.hold();
    await Promise.all([page.waitForURL(/\/figures\/worksheets\/[A-Za-z0-9]+/), page.click('#fgd-go')]);
    const id = /worksheets\/([A-Za-z0-9]+)/.exec(page.url())[1];
    // The chat is open beside the builder with the progress card: four steps, an estimate, "you can close this page".
    await page.waitForSelector('#oc:not([hidden]) .oc-steps li.cur');
    assert.equal(await page.locator('.oc-steps li').count(), 4);
    assert.match(await page.textContent('.oc-steps li.cur'), /Oomba is thinking/);
    assert.match(await page.textContent('.oc-eta'), /about 15 seconds · \d:\d\d so far/);
    assert.match(await page.textContent('#oc-sees'), /Untitled|Area|worksheet/i, 'Sees: this worksheet');
    assert.match(await page.textContent('.oc-prog'), /You can close this/);
    assert.match(await page.textContent('.fg-empty'), /Oomba is drafting your questions/);
    await shot(page, 'builder-drafting');
    // A refresh mid-draft: the same progress again, and the questions land when Oomba answers.
    await page.reload();
    await page.waitForSelector('#oc:not([hidden]) .oc-steps li.cur');
    stand.release();
    await page.waitForSelector('.fg-item:nth-child(8)');
    await page.waitForSelector('.oc-change');
    assert.match(await page.textContent('.oc-change'), /Added 8 questions[\s\S]*Title: Area and perimeter of rectangles/);
    assert.equal(await page.inputValue('#fg-title'), 'Area and perimeter of rectangles');
    assert.equal(await page.locator('.fg-marked').count(), 0, 'a first draft marks nothing');
    assert.deepEqual(await answers(page), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '20 cm', '70 cm²']);
    await shot(page, 'draft-done');
    // With the chat open on a laptop, one half at a time: the print preview is the other.
    assert.ok(await page.isHidden('.fg-preview'));
    await page.click('[data-half="preview"]');
    assert.ok(await page.isVisible('.fg-preview')); assert.ok(await page.isHidden('.fg-sh-main'));
    await page.click('[data-half="sheet"]');
    // A refine turn: only 3 and 7 change (marked), every figure in inches, answers worked out again.
    await page.fill('#oc-in', 'make 3 and 7 harder and use inches');
    await page.press('#oc-in', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('.fg-marked').length === 2);
    assert.deepEqual(await page.$$eval('.fg-marked .fg-n', ns => ns.map(n => n.textContent)), ['3', '7']);
    await page.waitForFunction(() => document.querySelector('.fg-item:nth-child(8) .fg-ians b').textContent.includes('in'));
    assert.deepEqual(await answers(page), ['24 in²', '28 in', '78 in²', '24 in²', '36 in²', '20 in', '50 in', '70 in²']);
    const card = page.locator('.oc-change').last();
    assert.match(await card.textContent(), /Changed questions 3, 7[\s\S]*Units: inches on 6 questions[\s\S]*Every answer worked out from its figure/);
    await page.locator('.fg-item:nth-child(3)').scrollIntoViewIfNeeded();
    await shot(page, 'refine-turn');
    // Undo: back to centimeters and the first draft's 3 and 7.
    await Promise.all([page.waitForResponse(r => /\/chat\/undo$/.test(r.url()) && r.status() === 200), card.locator('[data-c="undo"]').click()]);
    await page.waitForFunction(() => document.querySelector('.fg-item:nth-child(1) .fg-ians b').textContent === '24 cm²');
    assert.deepEqual(await answers(page), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '20 cm', '70 cm²']);
    assert.match(await page.locator('.oc-change').last().textContent(), /Change undone/);
    assert.equal(await page.locator('.fg-marked').count(), 0);
    // "Ask Oomba about this": the question is quoted above the message box and sent with it.
    await page.click('.fg-item:nth-child(4) .fg-mm-btn');
    await page.click('.fg-item:nth-child(4) [data-mi="ask"]');
    assert.match(await page.textContent('#oc-quote'), /Question 4: Find the area of the right triangle\./);
    assert.ok(await page.isVisible('.fg-item:nth-child(4) .fg-badge.q'));
    await page.fill('#oc-in', 'turn this into a word problem about a sandbox');
    await shot(page, 'quote-question');
    await page.click('#oc-send');
    assert.ok(await page.isHidden('#oc-quote'));
    await page.waitForFunction(() => /sandbox/.test(document.querySelector('.fg-item:nth-child(4) [data-q]').value));
    assert.ok(stand.calls.some(c => c.messages.some(m => m.role === 'user' && typeof m.content === 'string' && /About question 4: "Find the area of the right triangle\."/.test(m.content))));
    assert.match(await page.locator('.oc-msg.me').last().textContent(), /Question 4: Find the area/);
    // Off topic on the worksheet page: a book for a level M reader comes back as book cards; the worksheet stays as it is.
    const before = await answers(page);
    await page.fill('#oc-in', 'find me a book for a level M reader about animals');
    await page.click('#oc-send');
    await page.waitForSelector('.oc-card.book');
    assert.deepEqual(await answers(page), before, 'the worksheet is not touched');
    await shot(page, 'off-topic-book');
    await noSideScroll(page);
    assert.deepEqual(errors, []);
    await ctx.close();
    assert.ok(F.ownWorksheet(boss, id));
  } finally { CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});

test('the budget resting: the chat says so plainly and offers a starter set; the builder still works by hand', { skip }, async () => {
  const stand = ai();
  const daily = config.aiDailyBudgetUsd;
  try {
    config.aiDailyBudgetUsd = 0;
    const { ctx, page, errors } = await open('/figures/worksheets/new?ai=1');
    await page.waitForSelector('#oc:not([hidden])');
    await page.fill('#oc-in', 'Volume of rectangular prisms, grade 5');
    await page.click('#oc-send');
    await page.waitForSelector('.oc-msg.calm');
    assert.match(await page.textContent('.oc-msg.calm'), /Oomba is resting right now, so nothing was changed/);
    assert.equal(stand.calls.length, 0);
    assert.equal(await page.locator('.fg-item').count(), 0, 'no silent starter set');
    await shot(page, 'ai-resting');
    await Promise.all([page.waitForResponse(r => /\/chat\/act$/.test(r.url()) && r.status() === 200), page.click('[data-act="starter"]')]);
    await page.waitForSelector('.fg-item');
    assert.match(await page.textContent('#oc-log'), /a starter set from the figure generators, made without the AI/);
    assert.equal(await page.locator('[data-act="starter"]').count(), 0, 'offered once');
    // By hand.
    await page.click('#oc [data-c="close"]');
    const n0 = await page.locator('.fg-item').count();
    await page.click('[data-pick="math"]'); await page.selectOption('#fg-addkind', 'circle');
    await Promise.all([page.waitForResponse(r => /\/items$/.test(r.url())), page.click('[data-act="add"]')]);
    await page.waitForFunction(n => document.querySelectorAll('.fg-item').length === n + 1, n0);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { config.aiDailyBudgetUsd = daily; CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});

test('on an iPhone 13: the chat is a sheet that minimizes to the Oomba bubble, with a dot for a new answer', { skip }, async () => {
  const stand = ai();
  try {
    const id = F.createWorksheet(boss, { title: 'Phone sheet', grade: '4', items: FIRST.map(x => ({ ...x })) }).id;
    const { ctx, page, errors } = await open(`/figures/worksheets/${id}`, { ...devices['iPhone 13'], deviceScaleFactor: 2, colorScheme: 'dark' });
    await page.waitForSelector('.fg-item');
    assert.ok(await page.isHidden('#oc'), 'closed until asked on a phone');
    await page.tap('#fg-oomba');
    await page.waitForSelector('#oc:not([hidden])');
    const box = await page.locator('#oc').boundingBox(), vp = page.viewportSize();
    assert.ok(box.width >= vp.width - 1, 'full width'); assert.ok(box.y > 60, 'a sheet below the top bar');
    const tab = await page.locator('.tabbar').boundingBox();
    if (tab) assert.ok(box.y + box.height <= tab.y + 1, 'above the tab bar');
    await noSideScroll(page);
    stand.hold();
    await page.fill('#oc-in', 'make 3 and 7 harder and use inches');
    await page.tap('#oc-send');
    await page.waitForSelector('.oc-steps li.cur');
    await shot(page, 'phone-sheet-drafting');
    // Minimized while Oomba works; the answer lands; the bubble gets its dot; it opens again.
    await page.tap('#oc [data-c="min"]');
    assert.ok(await page.isVisible('#oc-bubble'));
    stand.release();
    await page.waitForSelector('#oc-bubble .oc-dot:not([hidden])');
    assert.match(await page.getAttribute('#oc-bubble', 'aria-label'), /new answer/);
    await page.waitForFunction(() => document.querySelectorAll('.fg-marked').length === 2);
    await shot(page, 'phone-minimized');
    await page.tap('#oc-bubble');
    await page.waitForSelector('#oc:not([hidden]) .oc-change');
    await shot(page, 'phone-sheet');
    await page.keyboard.press('Escape');
    assert.ok(await page.isVisible('#oc-bubble'), 'Escape minimizes');
    await noSideScroll(page);
    assert.deepEqual(errors, []);
    await ctx.close();
    await C.allSettled();
  } finally { CO.hooks.create = null; await C.allSettled(); CO.reset(boss); }
});
