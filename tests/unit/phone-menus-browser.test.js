// Menus on a phone (iPhone 13-ish, 390 x 664, Chromium with the iPhone descriptor), on a class's Classroom view with
// Homeroom on (the shared class bar, the tab bar and the Oomba bubble all on screen):
//  - an assigned item's ⋯ menu (Opens on, Due on, Assign to, Save, Scores, Student view, Play, ..., Remove from class)
//    is a bottom sheet inside the visible screen, above the tab bar and the bubble, scrolling inside itself, with a
//    close button; its last action can be scrolled to, tapped and confirmed, and the item is gone (owner's report: "On
//    mobile, I am not able to scroll down and click delete here");
//  - the profile menu behind the avatar is whole above the class page's sticky shared bar on all three views (owner's
//    report: "the profile dropdown is getting cut off on mobile"): its first and last items are on screen and tappable.
//  - on a laptop the ⋯ menus are still small panels under their button.
// PHONE_MENUS_SHOTS=<dir> also saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright-core'); } catch { /* not installed */ }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let skip = !pw || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.PHONE_MENUS_SHOTS || '';

seed({ quiet: true });
const boss = auth.createUser({ username: 'PmBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Menu Oak' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = auth.getUser(S.createSchoolAccount(head, school.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user.id);
TOOLS.givePlan(ana.id);
Object.assign(config, { homeroom: true, homeroomUsers: [ana.username.toLowerCase()] });
const cls = S.createClass(ana, school.id, { name: '4B Math' }).class;
const kid = S.createSchoolAccount(ana, school.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
const slugs = q.all("SELECT slug FROM games WHERE source='seed' AND status='published' AND visibility='public' AND course_only=0 ORDER BY slug").map(r => r.slug)
  .filter(s => !/-live$|algebra-builder/.test(s));
const picked = slugs.slice(0, 3).map(s => games.getGameBySlug(s));
for (const g of picked) assert.ok(F.assignGame(ana, cls.id, g.id).ok);

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  try { browser = await pw.chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
const cookieOf = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function open(url, { phone = true } = {}) {
  const opts = phone ? { ...pw.devices['iPhone 13'], viewport: { width: 390, height: 664 } } : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(ana.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${url}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
/** Is this element on screen and the top thing at its middle (so a tap lands on it, not on a bar over it)? */
const tappable = (page, sel) => page.evaluate(s => {
  const el = typeof s === 'string' ? document.querySelector(s) : null; if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return `off screen ${JSON.stringify(r)}`;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit && (hit === el || el.contains(hit)) ? true : `covered by ${hit ? `${hit.tagName}.${hit.className}` : 'nothing'}`;
}, sel);

test('phone: an assigned item\'s ⋯ menu is a sheet on screen; scroll to Remove from class, tap, confirm, the item is gone', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}`);
  assert.ok(await page.isVisible('#cv-bar'), 'the shared class bar is there');
  assert.ok(await page.isVisible('.tabbar'), 'the tab bar is there');
  await page.waitForSelector('.oc-bubble', { state: 'visible' });
  const rows = () => page.locator('.lib .lib-row').count();
  assert.equal(await rows(), 3);
  const title = (await page.textContent('.lib .lib-row:first-child .lib-name')).trim();
  await shot(page, 'phone-classroom');

  const panelSel = '.lib-row:first-child .lib-menu[open] > .shelf-menu-panel';
  await page.tap('.lib .lib-row:first-child .lib-more');
  await page.waitForSelector(panelSel, { state: 'visible' });
  const box = await page.evaluate(s => {
    const p = document.querySelector(s), r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const tab = document.querySelector('.tabbar').getBoundingClientRect();
    const corners = [[r.left + 24, r.top + 24], [r.right - 24, r.top + 24], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6], [r.left + r.width / 2, r.bottom - 30], [r.right - 30, r.bottom - 30]];
    return {
      r: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, vh: innerHeight, vw: innerWidth, oy: cs.overflowY, pos: cs.position,
      scrolls: p.scrollHeight > p.clientHeight, onTop: corners.every(([x, y]) => p.contains(document.elementFromPoint(x, y))),
      tabTop: tab.top, bubble: getComputedStyle(document.querySelector('.oc-bubble')).display,
    };
  }, panelSel);
  assert.equal(box.pos, 'fixed');
  assert.ok(box.r.top >= 0 && box.r.left >= 0 && box.r.right <= box.vw && box.r.bottom <= box.vh, `the sheet is inside the screen: ${JSON.stringify(box)}`);
  assert.equal(box.oy, 'auto', 'it scrolls inside itself');
  assert.ok(box.scrolls, 'this menu is taller than the screen, so it scrolls');
  assert.ok(box.onTop, 'nothing (the tab bar, the bubble, the class bar) is over any part of it');
  assert.equal(box.bubble, 'none', 'the Oomba bubble steps away while it is open');
  for (const label of ['Opens on (optional)', 'Due on (optional)', 'Assign to', 'Scores', 'Student view', 'Play']) {
    assert.ok((await page.textContent(panelSel)).includes(label), label);
  }
  assert.equal(await tappable(page, `${panelSel} > .sheet-x > button`), true, 'its close button is on screen');
  await shot(page, 'phone-assign-menu');

  // Its last action is under the fold: a swipe inside the sheet brings it up (the page under it does not move).
  const del = `${panelSel} form[data-api$="/delete"] .btn-danger`;
  assert.notEqual(await tappable(page, del), true, 'Remove from class starts below the fold');
  const y0 = await page.evaluate(() => window.scrollY);
  const pb = await page.locator(panelSel).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height - 40);
  for (let i = 0; i < 12 && (await tappable(page, del)) !== true; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(80); }
  assert.equal(await tappable(page, del), true, 'Remove from class can be scrolled to and is not covered');
  assert.equal(await page.evaluate(() => window.scrollY), y0, 'the page under the sheet did not scroll');
  await shot(page, 'phone-assign-menu-end');

  await page.tap(del);
  await page.waitForSelector('dialog.ob-dialog[open]');
  assert.match(await page.textContent('dialog.ob-dialog'), new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await Promise.all([page.waitForNavigation(), page.tap('dialog.ob-dialog [data-ob="ok"]')]);
  await page.waitForSelector('.lib .lib-row');
  assert.equal(await rows(), 2, 'the item is gone');
  assert.ok(!(await page.textContent('.lib .lib-list')).includes(title));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the sheet closes with its close button, a tap on the dimmed page and Escape', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}`);
  const menu = '.lib .lib-row:first-child .lib-menu';
  const isOpen = () => page.evaluate(s => document.querySelector(s).open, menu);
  await page.tap(`${menu} .lib-more`); assert.ok(await isOpen());
  await page.tap(`${menu} .sheet-x button`); assert.equal(await isOpen(), false, 'close button');
  await page.tap(`${menu} .lib-more`); assert.ok(await isOpen());
  await page.touchscreen.tap(195, 20); await page.waitForTimeout(100);
  assert.equal(await isOpen(), false, 'a tap on the dimmed page above the sheet');
  assert.ok(await page.isVisible('.oc-bubble'), 'the bubble is back');
  await page.tap(`${menu} .lib-more`); assert.ok(await isOpen());
  await page.keyboard.press('Escape'); assert.equal(await isOpen(), false, 'Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the profile menu is whole above the class page\'s shared bar on all three views; first and last items tappable', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}`);
  for (const [k, url] of [['classroom', `/class/${cls.id}`], ['homeroom', `/class/${cls.id}/homeroom`], ['dashboard', `/class/${cls.id}/dashboard`]]) {
    await page.goto(`${BASE}${url}`);
    assert.ok(await page.isVisible('#cv-bar'), `${k}: the shared bar`);
    await page.tap('.acctpick > summary');
    await page.waitForSelector('.acct-menu', { state: 'visible' });
    const ids = await page.evaluate(() => { const a = [...document.querySelectorAll('.acct-menu a')]; a[0].id ||= 'pm-first'; a[a.length - 1].id ||= 'pm-last'; return [a[0].id, a[a.length - 1].id]; });
    assert.equal(await tappable(page, `#${ids[0]}`), true, `${k}: the first item`);
    const last = await tappable(page, `#${ids[1]}`);
    if (last !== true) await page.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'nearest' }), ids[1]);
    assert.equal(await tappable(page, `#${ids[1]}`), true, `${k}: the last item`);
    const fits = await page.evaluate(() => { const r = document.querySelector('.acct-menu').getBoundingClientRect(), tb = document.querySelector('.tabbar').getBoundingClientRect(); return r.top >= 0 && r.bottom <= tb.top; });
    assert.ok(fits, `${k}: the menu ends above the tab bar`);
    await shot(page, `phone-profile-${k}`);
    if (k === 'classroom') {
      const href = await page.getAttribute(`#${ids[0]}`, 'href');
      await Promise.all([page.waitForNavigation(), page.tap(`#${ids[0]}`)]);
      assert.equal(new URL(page.url()).pathname, new URL(href, BASE).pathname, 'a tap on the first item opens it');
    }
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('laptop: the ⋯ menus stay small panels under their button', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}`, { phone: false });
  const sum = '.shelf-class .cl-row:first-child .inline-menu > summary, .shelf-class .shelf-menu > summary';
  const s = page.locator(sum).first();
  await s.click();
  const r = await page.evaluate(() => {
    const d = document.querySelector('.shelf-class details.inline-menu[open], .shelf-class details.shelf-menu[open]');
    const p = [...d.children].find(c => c.matches('.menu, .shelf-menu-panel')), cs = getComputedStyle(p);
    return { pos: cs.position, w: p.getBoundingClientRect().width, x: getComputedStyle(d.querySelector('.sheet-x') || document.body).display, dim: getComputedStyle(d.querySelector('summary'), '::before').content };
  });
  assert.equal(r.pos, 'absolute');
  assert.ok(r.w <= 360, `a small panel: ${r.w}`);
  assert.notEqual(r.x, 'flex', 'no close row on a laptop');
  assert.ok(r.dim === 'none' || r.dim === 'normal', 'no dimmed page');
  assert.deepEqual(errors, []);
  await ctx.close();
});
