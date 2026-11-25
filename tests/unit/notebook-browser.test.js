// Homeroom: the notebook in a real browser (public/js/notebook.js; docs/decisions.md "Homeroom: the notebook") on a
// phone (390), a tablet (820) and a Chromebook (1366 x 768): the green corner button on a normal page (above the
// phone's tab bar, nothing sideways), the notebook opened from it (the teacher-reads line, tabs, a new tab, typing,
// bold, a checklist, a highlighter, saved by itself and kept after a reload), search across every note, the desk's
// Notebook button and a handout's Notes (its page in the class's tab), and the teacher's read-only view from a desk's
// menu in Homeroom. HR_SHOTS=<dir> also saves screenshots there. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const NB = await import('../../server/services/notebook.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/nb-${name}.png` }) : null);

const boss = createUser({ username: 'NbbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Notebook Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [me, ben] = kids;
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const g = games.createGame(official.id, { title: 'Fraction Pizza' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p>', { createdBy: official.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug='fraction-pizza-nbb' WHERE id=?", v.id, g.id);
const handout = HO.handOut(teacher, cls, { gameId: g.id, to: { kind: 'all' }, instructions: 'Slice the pizza into equal parts.', order: 'any', grade: 'completion' });
// Ben's notebook, for his teacher's read-only view
{
  const b = NB.mine(ben);
  NB.savePage(ben, b.tabs[0].pages[0].id, '<p>Things I want to <mark class="hl-y">remember</mark>:</p><ul class="nb-check"><li class="done">Bring my library book</li><li>Practice <b>times tables</b></li></ul>');
  const f = NB.tabs(ben, { action: 'add', name: 'Fractions' });
  NB.savePage(ben, f.tabs.find(t => t.id === f.tab).pages[0].id, '<p>A <b>fraction</b> is a part of a whole.</p><p>The <mark class="hl-g">denominator</mark> is how many equal parts.</p>');
  const rl = NB.tabs(ben, { action: 'add', name: 'Reading log' });
  NB.savePage(ben, rl.tabs.find(t => t.id === rl.tab).pages[0].id, '<p>Charlotte\'s Web, chapter 3. Wilbur is lonely.</p>');
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const VIEWS = [['phone', { width: 390, height: 844 }, true], ['tablet', { width: 820, height: 1180 }, true], ['laptop', { width: 1366, height: 768 }, false]];
/** Layout checks for the open notebook: inside the screen, nothing sideways, big targets. */
const panelOk = page => page.evaluate(() => {
  const nb = document.getElementById('nb').getBoundingClientRect();
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const small = [...document.querySelectorAll('#nb button, #nb input')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(el => `${el.className}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  return { inside: nb.left >= -1 && nb.right <= innerWidth + 1 && nb.top >= -1 && nb.bottom <= innerHeight + 1, scroll: document.documentElement.scrollWidth - innerWidth, small, w: nb.width, h: nb.height };
});
async function selectWord(page, word) {
  await page.evaluate(w => {
    const ed = document.querySelector('#nb .nb-ed[contenteditable]'); ed.focus();
    const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { const i = n.nodeValue.indexOf(w); if (i < 0) continue; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; }
  }, word);
}

test('the corner button on a normal page, then the notebook: tabs, typing, bold, a checklist, a highlighter, search', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(me, `/class/${cls.id}`, vp, touch);
    await page.waitForSelector('#nb-btn');
    const b = await page.evaluate(() => {
      const r = document.getElementById('nb-btn').getBoundingClientRect(), bar = document.querySelector('.tabbar'), br = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
      return { w: r.width, h: r.height, right: innerWidth - r.right, bottom: innerHeight - r.bottom, aboveBar: !br || r.bottom <= br.top, scroll: document.documentElement.scrollWidth - innerWidth, bg: getComputedStyle(document.getElementById('nb-btn')).backgroundColor };
    });
    assert.equal(b.w, 64); assert.ok(b.right >= 12 && b.right <= 20, `${name}: bottom right (${b.right})`); assert.ok(b.aboveBar, `${name}: above the tab bar`);
    assert.ok(b.scroll <= 0, `${name}: nothing sideways`);
    assert.equal(b.bg, 'rgb(102, 199, 146)', 'green (Mint)');
    await shot(page, `corner-${name}`);

    await page.click('#nb-btn');
    await page.waitForSelector('#nb .nb-ed[contenteditable]');
    assert.equal(await page.locator('#nb-btn').isVisible(), false, 'the button steps aside while it is open');
    assert.equal(await page.locator('#nb .nb-lead', { hasText: 'Your teacher can read your notebook.' }).count(), 1);
    assert.deepEqual(await page.locator('#nb .nb-tab:not(.nb-add)').allInnerTexts(), name === 'phone' ? ['My notes', 'Room 9'] : ['My notes', 'Room 9', 'Fractions']);
    if (name === 'phone') {
      // a new tab, named by them
      await page.click('#nb [data-nb="addtab"]');
      await page.fill('dialog input', 'Fractions'); await page.click('dialog [data-ob="ok"]');
      await page.waitForSelector('#nb .nb-tab[aria-selected="true"]:has-text("Fractions")');
      await page.locator('#nb .nb-ed[contenteditable]').click();
      await page.keyboard.type('Halves are two equal parts. Quarters are four equal parts.');
      await selectWord(page, 'equal');
      await page.click('#nb [data-hl="hl-y"]');
      await selectWord(page, 'Quarters');
      await page.click('#nb [data-nbf="bold"]');
      await page.evaluate(() => { const ed = document.querySelector('#nb .nb-ed[contenteditable]'); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
      await page.keyboard.press('Enter');
      await page.click('#nb [data-nbf="check"]');
      await page.keyboard.type('Ask about thirds');
      await page.keyboard.press('Enter'); await page.keyboard.type('Finish the pizza game');
      await page.waitForSelector('#nb-status[data-k="saved"]', { timeout: 5000 });
      await page.waitForTimeout(900);
      const tab = q.get("SELECT id FROM notebook_tabs WHERE user_id=? AND name='Fractions'", me.id);
      const body = q.get('SELECT body FROM notebook_pages WHERE tab_id=?', tab.id).body;
      assert.match(body, /<mark class="hl-y">equal<\/mark>/, body);
      assert.match(body, /<b>Quarters<\/b>/, body);
      assert.match(body, /<ul class="nb-check"><li>Ask about thirds<\/li><li>Finish the pizza game<\/li><\/ul>/, body);
      // a tap on a checklist's box ticks it
      const li = page.locator('#nb ul.nb-check li').first(), lb = await li.boundingBox();
      await page.mouse.click(lb.x + 10, lb.y + lb.height / 2);
      await page.waitForTimeout(1300);
      assert.match(q.get('SELECT body FROM notebook_pages WHERE tab_id=?', tab.id).body, /<li class="done">Ask about thirds<\/li>/);
    } else {
      await page.click('#nb .nb-tab:has-text("Fractions")');
    }
    await page.waitForTimeout(150);
    const m = await panelOk(page);
    assert.ok(m.inside, `${name}: the notebook fits (${JSON.stringify(m)})`); assert.ok(m.scroll <= 0, `${name}: nothing sideways`);
    assert.deepEqual(m.small, [], `${name}: big targets`);
    assert.ok(m.w >= Math.min(vp.width, 380) - 2 && m.h > 400, `${name}: room to write (${m.w} x ${m.h})`);
    await page.evaluate(() => { getSelection().removeAllRanges(); document.activeElement.blur(); });
    await shot(page, `open-${name}`);
    // search across every note
    await page.fill('#nb-q', 'four equal');
    await page.waitForSelector('#nb .nb-res');
    assert.equal(await page.locator('#nb .nb-res').count(), 1);
    assert.equal(await page.locator('#nb .nb-res .nb-hit').innerText(), 'four equal');
    await shot(page, `search-${name}`);
    await page.fill('#nb-q', 'zebra'); assert.equal(await page.locator('#nb .nb-none', { hasText: 'No notes have' }).count(), 1);
    await page.fill('#nb-q', 'halves');
    await page.click('#nb .nb-res');
    assert.equal(await page.locator('#nb .nb-tab[aria-selected="true"]').innerText(), 'Fractions');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#nb').isVisible(), false); assert.equal(await page.locator('#nb-btn').isVisible(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // kept after a reload (a new session)
  const { ctx, page } = await open(me, `/class/${cls.id}`, { width: 1366, height: 768 });
  await page.click('#nb-btn'); await page.click('#nb .nb-tab:has-text("Fractions")');
  assert.equal(await page.locator('#nb mark.hl-y', { hasText: 'equal' }).count(), 1);
  await ctx.close();
});

test('the desk: Notebook in the dock, Notes on a handout opens its page in the class\'s tab', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of [VIEWS[0], VIEWS[2]]) {
    const { ctx, page, errors } = await open(me, `/class/${cls.id}/desk`, vp, touch);
    await page.waitForSelector('.hd-desk [data-hdnote]');
    assert.equal(await page.locator('#nb-btn').isVisible(), false, 'the dock has it on the desk');
    const dock = await page.evaluate(() => { const d = document.querySelector('.hd-dock').getBoundingClientRect(), b = document.querySelector('.hd-nbbtn').getBoundingClientRect(); return { fits: d.right <= innerWidth + 1, h: b.height, w: b.width, last: b.right >= d.right - 20 }; });
    assert.ok(dock.fits && dock.h >= 48 && dock.w >= 44 && dock.last, `${name}: ${JSON.stringify(dock)}`);
    await shot(page, `desk-${name}`);
    await page.click('.hd-desk [data-hdnote]');
    await page.waitForSelector('#nb .nb-ptitle:has-text("Fraction Pizza")');
    assert.equal(await page.locator('#nb .nb-tab[aria-selected="true"]').innerText(), 'Room 9');
    if (name === 'phone') {
      await page.keyboard.type('Each slice is one eighth.');
      await page.waitForTimeout(1400);
      const p = q.get('SELECT * FROM notebook_pages WHERE user_id=? AND class_lesson_id=?', me.id, handout.classLesson.id);
      assert.equal(p.title, 'Fraction Pizza'); assert.match(p.body, /one eighth/);
    }
    await shot(page, `desk-handout-${name}`);
    await page.keyboard.press('Escape');
    await page.click('.hd-nbbtn');
    await page.waitForSelector('#nb:not([hidden])');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the teacher reads a student\'s notebook from the desk\'s menu: the same tabs and search, read only', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, vp, touch);
    await page.waitForSelector(`[data-hrdmenu="${ben.id}"]`, { state: 'attached' });
    await page.$eval(`[data-hrdmenu="${ben.id}"]`, el => el.click());
    await page.click('.sheet [data-dm="notebook"]');
    await page.waitForSelector('#nb .nb-roed');
    assert.equal(await page.locator('#nb .nb-title').innerText(), 'Ben\'s notebook');
    assert.equal(await page.locator('#nb [contenteditable]').count(), 0, 'read only');
    assert.equal(await page.locator('#nb .nb-tools, #nb [data-nb="addtab"], #nb [data-nb="rename"]').count(), 0);
    assert.deepEqual(await page.locator('#nb .nb-tab').allInnerTexts(), ['My notes', 'Room 9', 'Fractions', 'Reading log']);
    assert.equal(await page.locator('#nb mark.hl-y', { hasText: 'remember' }).count(), 1);
    await page.click('#nb .nb-tab:has-text("Fractions")');
    await page.waitForTimeout(100);
    const m = await panelOk(page);
    assert.ok(m.inside && m.scroll <= 0, `${name}: ${JSON.stringify(m)}`); assert.deepEqual(m.small, []);
    await shot(page, `teacher-${name}`);
    await page.fill('#nb-q', 'wilbur');
    assert.equal(await page.locator('#nb .nb-res', { hasText: 'Reading log' }).count(), 1);
    if (name === 'laptop') await shot(page, 'teacher-search-laptop');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
