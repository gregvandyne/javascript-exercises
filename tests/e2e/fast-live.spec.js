// A first live game in under 3 minutes (docs/decisions.md; server/routes/quick-live.js). A teacher who has never used
// Oomba goes from the first page to three guests answering a question; the steps are counted and bounded
// (tests/support/fast-live-flow.js; scripts/fast-live-timing.js prints the same numbers for a running server). Then the
// rest of the path: the guests' results say what is kept and lead to "Make a class to keep scores" (paste names, login
// cards), the class card's one tap opens a class room, and a signed-in student of that class joins from the "Your
// teacher started a live game" banner with no code. At 360, 390 and 1280 px, light and dark, Hebrew and Arabic: no
// sideways scroll, nothing touches (touching.js), 44 px tap targets on phones.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { login, uniq, ownIp } from './helpers.js';
import { firstLiveGame } from '../support/fast-live-flow.js';

/** The most steps a new teacher may need from the first page to a started game, and each student to an answer. */
const MAX_TEACHER_STEPS = 8, MAX_STUDENT_STEPS = 4;
/** The whole path by machine (no typing delay): far under three minutes, so a person has the rest for typing. */
const MAX_MACHINE_MS = 60_000;
const VIEWS = [
  { width: 360, height: 740, scheme: 'light' }, { width: 360, height: 740, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
];
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const smallTargets = (page, scope) => page.evaluate(scope => [...document.querySelectorAll(`${scope} .btn, ${scope} .chip, ${scope} a.lp-btn, ${scope} button, ${scope} .ql-opt, ${scope} .ql-alt a, ${scope} .cc-quick-change, ${scope} .ql-recent a`)]
  .filter(e => e.checkVisibility()).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`), scope);
async function layoutProblems(browser, state, paths, { lang = null, scope = 'main' } = {}) {
  const out = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, ...(state ? { storageState: state } : {}) });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of paths) {
      const r = await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      if (!r || r.status() !== 200) { out.push(`${at}: status ${r && r.status()}`); continue; }
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) out.push(`${at}: sideways scroll ${over}px`);
      for (const x of await findTouching(page)) out.push(`${at}: ${x.a} | ${x.b} (${x.dir} ${x.gap}px)`);
      if (v.width < 600) for (const s of await smallTargets(page, scope)) out.push(`${at}: small target ${s}`);
    }
    await ctx.close();
  }
  return out;
}

let made = null;   // { state, resultsUrl, username }

test('a new teacher: first page -> three-field sign-up -> Quick game -> three guests answer; steps counted and bounded', async ({ browser, baseURL }) => {
  const probe = await (await browser.newContext()).newPage();
  await probe.goto('/');
  const landing = await probe.locator('#lp-host-now').count() > 0;   // LANDING_AT_ROOT=1: the landing is the first page
  await probe.context().close();
  const username = uniq('Quick');
  const t0 = Date.now();
  const r = await firstLiveGame(browser, baseURL, { start: landing ? '/' : '/teachers', username });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'fast-live', description: `${r.teacher.length} teacher steps, ${r.student.length} student steps, ${ms} ms by machine (${JSON.stringify(r.marks)})` });
  console.log(`fast-live: teacher ${r.teacher.length} steps [${r.teacher.join(' | ')}]; each student ${r.student.length} steps [${r.student.join(' | ')}]; marks ${JSON.stringify(r.marks)}`);
  expect(r.teacher.length, r.teacher.join('\n')).toBeLessThanOrEqual(MAX_TEACHER_STEPS);
  expect(r.student.length, r.student.join('\n')).toBeLessThanOrEqual(MAX_STUDENT_STEPS);
  expect(r.teacher.filter(s => s.startsWith('type:')).length, 'boxes the teacher types in').toBe(3);
  expect(ms).toBeLessThan(MAX_MACHINE_MS);

  const host = r.host;
  // The room: an open room on the big screen, the code and the QR, and every player under a made-up name.
  await expect(host.locator('#lv-code')).toHaveText(/\d{3}\s?\d{4}/);
  const nicks = [];
  for (const p of r.players) {
    expect((await p.context().cookies()).length, 'a guest has no cookie').toBe(0);
    nicks.push(await p.evaluate(() => document.body.innerText));
  }
  // The typed teacher name is on no player's screen (players see the game, never the host's account).
  for (const text of nicks) expect(text).not.toContain(username);
  // All three answered: the host's dashboard count, then the end and the results.
  host.on('dialog', d => d.accept());
  await host.locator('[data-lv-act="end"]:not([hidden])').click();
  await host.waitForURL(/\/live\/results\//);
  const note = host.locator('#lv-guest-note');
  await expect(note).toContainText('This was a guest game.');
  await expect(note).toContainText('nothing went into a gradebook');
  await expect(host.locator('#lv-review .lv-review-item').first()).toBeVisible();
  await expect(host.locator('#lv-review')).toContainText(/of 3 right/);
  await expect(host.locator('#lv-keep-scores')).toHaveAttribute('href', '/teach/keep-scores');
  made = { state: await r.ctx.storageState(), resultsUrl: new URL(host.url()).pathname, username };
  for (const p of r.players) await p.context().close();
  await r.ctx.close();
});

test('after the game: "Make a class to keep scores" -> paste names -> login cards; the class card\'s one tap; a student joins from the banner with no code', async ({ browser }) => {
  test.skip(!made, 'needs the teacher from the first test');
  const ctx = await browser.newContext({ storageState: made.state, viewport: { width: 390, height: 844 } });
  const t = await ctx.newPage(); await ownIp(t);
  // The results stay with the host (the saved question review; no player names in it).
  await t.goto(made.resultsUrl);
  await expect(t.locator('#lv-review')).toBeVisible();
  await Promise.all([t.waitForURL(/\/teach\/keep-scores/), t.locator('#lv-keep-scores').click()]);
  await t.fill('#ks-name', 'Room 12'); await t.fill('#ks-grade', '4');
  await t.fill('#ks-names', 'Ava\nBen\nChidi');
  await Promise.all([t.waitForURL(/\/cards\//), t.click('#ql-keep button[type=submit]')]);
  await expect(t.locator('.logincard')).toHaveCount(3);
  const student = { username: (await t.locator('.logincard dd b').nth(0).textContent()).trim(), password: (await t.locator('.logincard dd b').nth(1).textContent()).trim() };

  // The Classroom home: the class card says what one tap opens (the class's grade picks the level, the last game the mode).
  await t.goto('/teach');
  const quick = t.locator('form.cc-quick');
  await expect(quick).toHaveCount(1);
  await expect(quick.locator('.cc-quick-what')).toContainText('Question Battle');
  await expect(quick.locator('.cc-quick-what')).toContainText('Ages 10–11');
  const classId = await quick.locator('input[name="classId"]').inputValue();

  // The student signs in first and waits on their class page: no banner yet.
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const s = await sctx.newPage();
  await login(s, student.username, student.password);
  await s.goto(`/class/${classId}`);
  await expect(s.locator('#class-live')).toBeHidden();

  // One tap.
  await Promise.all([t.waitForURL(/\/live\/host\//), quick.locator('button[type=submit]').click()]);
  await expect(t.locator('#lv-code')).toBeVisible();
  // The banner appears for the student (a fresh look at the page; class-live.js also polls), and "Join now" needs no code typed.
  await s.goto(`/class/${classId}`);
  await expect(s.locator('#class-live')).toBeVisible();
  await expect(s.locator('#class-live')).toContainText('Your teacher started a live game');
  await Promise.all([s.waitForURL(/\/join/), s.locator('#class-live-join').click()]);
  await expect(s.locator('#jc')).toHaveValue(/^\d{7}$/);
  await s.click('#lv-join button[type=submit]');
  await s.locator('#lv-as-me').click();
  await s.waitForURL(/\/live\/play\//);
  // The host's room now has one player; while it is open the card offers the way back, not a second room.
  await expect(t.locator('#lv-count')).toContainText(/1 of/);
  const home = await ctx.newPage();
  await home.goto('/teach');
  await expect(home.locator('form.cc-quick')).toHaveCount(0);
  await expect(home.locator('a.cc-live.btn-hot')).toBeVisible();
  // "Change" (once the room is ended) opens the chooser for the class with the pick preselected.
  t.on('dialog', d => d.accept());
  await t.locator('[data-lv-act="end"]:not([hidden])').click();
  await expect.poll(() => new URL(t.url()).pathname, { timeout: 15_000 }).toMatch(/\/live\/results\/|\/live$|\/class\//);
  await home.goto(`/live/quick?class=${classId}`);
  await expect(home.locator('input[name="mode"][value="battle"]')).toBeChecked();
  await expect(home.locator('input[name="level"][value="a10"]')).toBeChecked();
  await expect(home.locator('#ql-for')).toContainText('Room 12');
  await sctx.close(); await ctx.close();
});

test('who gets in: a child\'s account is never offered hosting; signed-out visitors land on the sign-up', async ({ browser }) => {
  const ctx = await browser.newContext(); const kid = await ctx.newPage();
  await login(kid, 'DemoStudent', 'demo-pass-123');
  const r = await kid.goto('/teachers/host');
  expect(r.status()).toBe(200);
  await expect(kid.locator('#ql-signup')).toHaveCount(0);
  await expect(kid.locator('main')).toContainText('Teachers host live games');
  await kid.goto('/live/quick');
  await expect.poll(() => new URL(kid.url()).pathname).toBe('/join');
  expect((await kid.request.post('/api/live/quick', { data: { mode: 'battle' }, headers: { Origin: new URL(kid.url()).origin } })).status()).toBe(404);
  expect((await kid.request.get('/teach/keep-scores')).status()).toBe(404);
  await ctx.close();
  const out = await (await browser.newContext()).newPage();
  await out.goto('/live/quick');
  await expect.poll(() => new URL(out.url()).pathname).toBe('/teachers/host');
  await expect(out.locator('#ql-signup')).toBeVisible();
  // nothing is sold on the way in
  await expect(out.locator('main')).not.toContainText(/\$\s?\d|119|free trial/i);
  await out.context().close();
});

test('layout: the sign-up, the chooser, keep-scores, the class card and the guest results on phones and desktop, light and dark, Hebrew, Arabic, German and Spanish', async ({ browser }) => {
  test.skip(!made, 'needs the teacher from the first test');
  expect(await layoutProblems(browser, null, ['/teachers/host', '/teachers', '/teachers/live'])).toEqual([]);
  expect(await layoutProblems(browser, null, ['/teachers/host'], { lang: 'he' })).toEqual([]);
  expect(await layoutProblems(browser, made.state, ['/live/quick', '/teach/keep-scores', '/teach'])).toEqual([]);
  // The results page: the new guest note and everything round it. The question review's answer bars are a joined list
  // 4 px apart by design (public/css/live.css .lv-bars, older than this work), so they are left out here.
  expect((await layoutProblems(browser, made.state, [made.resultsUrl])).filter(x => !x.includes('div.lv-bars > div.lv-bar'))).toEqual([]);
  expect(await layoutProblems(browser, made.state, ['/live/quick', '/teach', '/teach/keep-scores'], { lang: 'ar' })).toEqual([]);
  // Long-word languages (German and Spanish have the longest buttons of the 13): every page of the path again,
  // the guest results with "Make a class to keep scores" among them.
  for (const lang of ['de', 'es']) {
    expect(await layoutProblems(browser, null, ['/teachers/host'], { lang }), lang).toEqual([]);
    expect((await layoutProblems(browser, made.state, ['/live/quick', '/teach', '/teach/keep-scores', made.resultsUrl], { lang })).filter(x => !x.includes('div.lv-bars > div.lv-bar')), lang).toEqual([]);
  }
  // The results page's buttons stay inside a 360 px phone in all 13 languages.
  const wide = [];
  const rctx = await browser.newContext({ storageState: made.state, viewport: { width: 360, height: 740 } }); const rp = await rctx.newPage();
  for (const lang of ['en', 'en-GB', 'de', 'fr', 'es', 'nl', 'ru', 'pt', 'it', 'he', 'ar', 'ja', 'zh-Hant']) {
    await rctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    await rp.goto(made.resultsUrl);
    await expect(rp.locator('#lv-keep-scores')).toBeVisible();
    const over = await rp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) wide.push(`${lang}: ${over}px`);
  }
  await rctx.close();
  expect(wide, 'sideways scroll on the guest results at 360 px').toEqual([]);
  // RTL: the page really is right-to-left
  const ctx = await browser.newContext({ storageState: made.state }); await ctx.addCookies([{ name: 'lang', value: 'he', url: test.info().project.use.baseURL }]);
  const p = await ctx.newPage(); await p.goto('/live/quick');
  await expect(p.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(p.locator('#ql-go')).toContainText('פתיחת החדר');
  await ctx.close();
});

test('the landing at "/" (LANDING_AT_ROOT=1): the second button, the join door, and no price', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
  await page.goto('/');
  test.skip(await page.locator('#lp-host-now').count() === 0, 'the landing is not at "/" in this run');
  await expect(page.locator('#lp-host-now')).toBeVisible();
  await expect(page.locator('#lp-host-now')).toHaveAttribute('href', '/teachers/host');
  const box = await page.locator('#lp-host-now').boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('#lp-join')).toHaveAttribute('href', '/join');
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/\$\s?\d|\b119\b/);
  // Every language: the new buttons are in the page's own words, and the page does not scroll sideways on a 360 px phone.
  const wide = [];
  for (const lang of ['de', 'fr', 'es', 'nl', 'ru', 'pt', 'it', 'he', 'ar', 'ja', 'zh-Hant', 'en-GB']) {
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator('#lp-host-now')).not.toHaveAttribute('lang', 'en');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) wide.push(`${lang}: ${over}px ` + await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width < innerWidth * 2).slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 40)).join(' | ')));
  }
  expect(wide, 'sideways scroll on "/" at 360 px').toEqual([]);
  await page.context().close();
});
