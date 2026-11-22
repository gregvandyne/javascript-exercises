// Manipulatives saving and AI drafts in a real browser (docs/decisions.md "Virtual math manipulatives: saving and AI
// drafts"): a draft keeps going through a refresh (its progress shows again in the drafter's box and the side button
// counts its time) and lands on the board; a draft that finished while the teacher was away shows one notice; a board
// saves itself and comes back after a refresh; Save as template asks for a name; My boards opens, renames and deletes;
// a room ended before recess, reopened from My boards, gives a student their same square back; and an AI that doesn't
// answer gives the starting board with a calm note, while a refused draft says exactly why. The AI is the
// existing stand-in (services/manipulatives.js hooks.create). MANIP_SHOTS=<dir> also saves pictures. Skipped when no
// Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const D = await import('../../server/services/manip-drafts.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'SavingBoss', password: 'secret123', role: 'admin' });
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

const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
async function open(who, hash, ctxOpts = LAPTOP) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const reply = { title: 'Half hours', steps: ['Read each clock.', 'Write the time under it.'], items: ['3:30', '7:30', '11:30'].map(time => ({ time, box: 'answer' })) };
/** The stand-in AI: it answers only when released. */
function gatedAi() {
  let release; const gate = new Promise(r => { release = r; });
  M.hooks.create = async params => { await gate; return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify(reply) }] }; };
  return release;
}
const clocks = page => page.locator('#mp-content .mp-obj').count();
const liveDraft = () => q.get("SELECT * FROM manip_drafts WHERE owner_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1", boss.id);

test('an AI draft keeps going through a refresh: its progress shows again, then it lands on the board (Undo keeps the old one)', { skip }, async () => {
  const release = gatedAi();
  try {
    const { ctx, page, errors } = await open(boss, '#clock');
    await page.waitForSelector('#mp-board');
    const before = await clocks(page);
    await page.click('[data-tool="draft"]');
    await page.fill('#mp-brief', 'Three clocks at half past for grade 2');
    await page.click('#mp-dgo');
    await page.waitForSelector('.mp-dprog');
    assert.match(await page.textContent('[data-tool="draft"]'), /Drafting/);
    // The refresh: the draft is still going on the server, and the page shows it again.
    await page.reload();
    await page.waitForSelector('.mp-dprog');
    assert.match(await page.textContent('.mp-dprog'), /Three clocks at half past/);
    assert.match(await page.textContent('.mp-dstep.cur'), /AI is choosing/);
    assert.match(await page.textContent('#mp-deta'), /less than a minute/i);
    assert.match(await page.textContent('.mp-dleave'), /close this page or refresh/);
    await page.waitForTimeout(1200);
    assert.match(await page.textContent('#mp-dtime'), /^0:0[1-9]|^0:[1-5]\d/, 'the side button counts the time');
    await shot(page, 'draft-progress-after-refresh');
    release();
    await page.waitForFunction(() => !document.querySelector('.mp-dprog') && /Half hours/.test(document.getElementById('mp-status')?.textContent || ''), null, { timeout: 15000 });
    const job = liveDraft();
    assert.equal(job.status, 'done'); assert.ok(job.seen_at, 'seen: it went onto the board');
    assert.equal(await page.evaluate(() => location.hash), `#board/${job.board_id}`, 'the drafted board is the one that goes on saving');
    assert.ok(await clocks(page) > before);
    assert.equal(await page.locator('[data-tool="undo"]').isDisabled(), false, 'Undo brings back what was there');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { M.hooks.create = null; }
});

test('a draft that finished while the teacher was away: one notice; "Put it on my board"; not shown again', { skip }, async () => {
  const release = gatedAi();
  try {
    const a = await open(boss, '#clock');
    await a.page.waitForSelector('#mp-board');
    await a.page.click('[data-tool="draft"]');
    await a.page.fill('#mp-brief', 'Three clocks for after lunch');
    await a.page.click('#mp-dgo');
    await a.page.waitForSelector('.mp-dprog');
    await a.ctx.close();   // the teacher leaves
    release();
    const job = liveDraft(); await D.settled(job.id);
    assert.equal(D.get(job.id).status, 'done');
    const b = await open(boss, '');
    await b.page.waitForSelector('.mp-dnote');
    assert.match(await b.page.textContent('.mp-dnote'), /finished while you were away/);
    assert.match(await b.page.textContent('.mp-boards'), /Half hours/);
    assert.equal(await b.page.locator('.mp-boards .mp-tag.hot').count(), 1, '"New" in Recent boards');
    await shot(b.page, 'draft-finished-away-home');
    await b.page.click('[data-dnote="use"]');
    await b.page.waitForFunction(id => location.hash === `#board/${id}` && document.querySelectorAll('#mp-content .mp-obj').length > 0, D.get(job.id).board_id);
    await b.page.reload(); await b.page.waitForSelector('#mp-board'); await b.page.waitForTimeout(400);
    assert.equal(await b.page.locator('.mp-dnote').count(), 0, 'once');
    assert.deepEqual([...a.errors, ...b.errors], []);
    await b.ctx.close();
  } finally { M.hooks.create = null; }
});

test('a board saves itself ("Saved") and comes back after a refresh; Save as template asks for a name; My boards renames and deletes', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#clock');
  await page.waitForSelector('#mp-board');
  const n0 = await clocks(page);
  await page.click('[data-pal]');   // Add a clock
  await page.waitForFunction(() => /Saved/.test(document.getElementById('mp-saved')?.textContent || ''), null, { timeout: 8000 });
  const hash = await page.evaluate(() => location.hash);
  assert.match(hash, /^#board\//);
  const n1 = await clocks(page); assert.equal(n1, n0 + 1);
  await page.reload(); await page.waitForSelector('#mp-board'); await page.waitForTimeout(300);
  assert.equal(await clocks(page), n1, 'the same board after a refresh');
  // Save as template: the one save button asks for a name.
  await page.click('#mp-save');
  await page.fill('#mp-tplname', 'Clock warm-up');
  await shot(page, 'save-as-template');
  await page.click('#mp-tpl [type="submit"]');
  await page.waitForFunction(() => /Saved as template/.test(document.getElementById('mp-status')?.textContent || ''));
  const tpl = q.get("SELECT * FROM manip_boards WHERE owner_id=? AND kind='template' AND title='Clock warm-up'", boss.id);
  assert.ok(tpl);
  // My boards: the template, opened, gives a fresh copy (the address is the tool's, not the template's).
  await page.goto(`${BASE}/manipulatives#`);
  await page.waitForSelector('.mp-brow');
  assert.match(await page.textContent('.mp-boards'), /Templates[\s\S]*Clock warm-up[\s\S]*Recent boards/);
  await page.click(`.mp-brow:has-text("Clock warm-up") .mp-blink`);
  await page.waitForSelector('#mp-board');
  assert.equal(await page.evaluate(() => location.hash), '#clock');
  // Rename and delete from the ⋯ menu.
  await page.goto(`${BASE}/manipulatives#`); await page.waitForSelector('.mp-brow');
  const row = page.locator('.mp-brow:has-text("Clock warm-up")');
  await row.locator('.mp-more').click();
  assert.deepEqual(await row.locator('[role="menuitem"]').allTextContents(), ['Rename', 'Duplicate', 'Delete'], 'no classes: no "Start a live room with it"');
  await shot(page, 'my-boards-menu');
  await row.locator('[data-act="rename"]').click();
  await page.fill('#mp-rn', 'Clock warm-up 2'); await page.press('#mp-rn', 'Enter');
  await page.waitForSelector('.mp-brow:has-text("Clock warm-up 2")');
  page.once('dialog', d => d.accept());
  await page.locator('.mp-brow:has-text("Clock warm-up 2") .mp-more').click();
  await page.locator('.mp-brow:has-text("Clock warm-up 2") [data-act="delete"]').click();
  await page.waitForFunction(() => !/Clock warm-up 2/.test(document.querySelector('.mp-boards').textContent));
  assert.equal(M.ownBoard(boss, tpl.id), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('after recess: the room ended, the teacher reopens it from My boards, and a student gets their same square back', { skip }, async () => {
  const oak = S.createSchool(boss, { name: 'Recess Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: 'Recess 3A' }).class;
  const kids = ['Ivy Elm', 'Jo Fir'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, A.id, u.id); return u; });
  const s = M.createSession(boss, { classId: A.id, tool: 'base-ten-blocks', title: 'Making 10' }).session;
  for (const k of kids) assert.ok(M.join(k, { id: s.id }).ok);
  const slot = q.get('SELECT slot FROM manip_work WHERE session_id=? AND user_id=?', s.id, kids[1].id).slot;
  assert.ok(M.saveArea(kids[1], s.id, kids[1].id, { v: 2, pieces: [{ id: 'p1', kind: 'rod', x: 20, y: 20, label: '10', value: 10, color: '#4ECDC4', w: 24, h: 120 }] }).ok);
  M.end(boss, s.id);
  const t = await open(boss, '');
  await t.page.waitForSelector('.mp-brow');
  const row = t.page.locator('.mp-brow:has-text("Making 10")');
  assert.match(await row.textContent(), /ended/);
  await row.locator('.mp-more').click();
  await shot(t.page, 'my-boards-reopen');
  await row.locator('[data-act="reopen"]').click();
  await t.page.waitForFunction(id => location.hash === `#live/${id}`, s.id);
  await t.page.waitForSelector('.rm-live');
  assert.equal(M.getSession(s.id).status, 'active');
  // The student comes back (by the same code, as on the board) to their own square, their rod still in it.
  const k = await open(kids[1], `#join/${s.id}`);
  await k.page.waitForSelector('.rm-area.mine.editable');
  assert.equal(await k.page.locator('.rm-area.mine .mp-piece').count(), 1);
  assert.equal(q.get('SELECT slot FROM manip_work WHERE session_id=? AND user_id=?', s.id, kids[1].id).slot, slot, 'the same square');
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_work WHERE session_id=?', s.id).n, 2, 'no new square');
  assert.deepEqual([...t.errors, ...k.errors], []);
  await t.ctx.close(); await k.ctx.close();
  M.end(boss, s.id);
});

test('the AI does not answer: the starting board opens with a calm note (Try again keeps the words); a refused draft says why', { skip }, async () => {
  M.hooks.create = async () => { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; };
  try {
    const { ctx, page, errors } = await open(boss, '#clock');
    await page.waitForSelector('#mp-board');
    await page.click('[data-tool="draft"]');
    await page.fill('#mp-brief', 'Four clocks to the quarter hour');
    await page.click('#mp-dgo');
    await page.waitForSelector('.mp-dfall', { timeout: 15000 });
    assert.match(await page.textContent('.mp-dfall'), /didn’t answer in time, so here’s a starting board\. You can try Draft with AI again\./);
    const job = liveDraft();
    assert.equal(job.status, 'done'); assert.equal(JSON.parse(job.result).reason, 'timeout');
    assert.equal(await page.evaluate(() => location.hash), `#board/${job.board_id}`, 'the starting board is open');
    assert.match(await page.textContent('#mp-steps'), /Four clocks to the quarter hour/, 'the brief is its step');
    assert.doesNotMatch(await page.textContent('#mp-draft'), /Something went wrong|couldn’t be finished/);
    await shot(page, 'draft-fallback-timeout');
    await page.click('[data-dfall="retry"]');
    await page.waitForSelector('#mp-brief');
    assert.equal(await page.inputValue('#mp-brief'), 'Four clocks to the quarter hour', 'the words are kept');
    assert.equal(await page.textContent('#mp-dmsg'), '', 'no error under it');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { M.hooks.create = null; }
  // A draft refused at the check before the AI (a student of the class named in it): the notice says exactly why.
  const oak = S.createSchool(boss, { name: 'Names Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: 'Names 2B' }).class;
  q.run("INSERT INTO manip_drafts(id, owner_id, tool, request, status, created_at) VALUES ('namez1', ?, 'clock', ?, 'interrupted', ?)", boss.id, JSON.stringify({ brief: 'Clocks for Quilla Zent' }), Date.now());
  S.addToClass(boss, A.id, S.createSchoolAccount(boss, oak.id, { rosterName: 'Quilla Zent' }).user.id);
  D.recover(); await D.settled('namez1');
  assert.equal(D.get('namez1').error, 'names');
  const b = await open(boss, '');
  await b.page.waitForSelector('.mp-dnote');
  const text = await b.page.textContent('.mp-dnote');
  assert.match(text, /Leave students’ names out of the description/); assert.doesNotMatch(text, /Something went wrong/);
  await shot(b.page, 'draft-failed-names');
  assert.deepEqual(b.errors, []);
  await b.ctx.close();
});
