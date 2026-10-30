// Grown-up accounts and family links (paid plans, chunk 3), end to end. Families are on only while billing is, so this
// spec runs its own server with billing on against the fake Stripe (tests/support/fake-stripe.js): the server on
// E2E_PORT + 3 (default 4313), the fake Stripe on E2E_PORT + 2. No payments yet.
//   - a child gets a code on /me, a grown-up signs up from /parents (its Family accounts section; /grown-ups is a 301 to
//     /parents#families) and types it, the child says yes;
//   - a child reports a request, the admin sees it in the link reports queue;
//   - grown-ups are fenced in (a "the Builder is for kids" page on /build, 404 on friends and chat); kids never see a link to the grown-up pages;
//   - the new pages at 360 px and 1280 px, light and dark, and right to left (he): nothing touches, no sideways scroll;
//   - navigation weeks 3–4: the grown-up's Family · Games · Plans · Account bar (phone and desktop, fits), /family vs
//     /family/account, and the old /family#password, #language and #signout links landing on the Account page.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, uniq, ownIp, ADMIN, templateGame, studioState } from './helpers.js';
import { findTouching } from './touching.js';
import { topbarFit } from './topbar-fit.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 3, STRIPE_PORT = E2E + 2;
const FAM = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.FAMILY_SHOTS || '';   // a folder to keep screenshots of the new pages in (for a visual review)
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
  BUILDER_DAILY_TURNS: '1',   // the Builder's daily-limit card (one message, then the card)
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: FAM });
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-fam-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e', '--webhook', `${FAM}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${FAM}/health`);
});
test.afterAll(async () => {
  await stop(app); await stop(stripe);
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

/** A fresh browser context (its own cookies and address). */
async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: FAM, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', 'a-long-password-1'); await page.fill('#confirm', 'a-long-password-1');
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
  return name;
}
async function getCode(page) {
  await page.goto('/me');
  const panel = page.locator('#grownups');
  await expect(panel).toContainText('A grown-up can link to your account.');
  await panel.locator('[data-family-code]').click();
  await expect(page.locator('#famcode')).toBeVisible();
  const code = (await page.locator('#famcode-value').textContent()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  return code;
}
async function enterCode(page, code) {
  await page.goto('/family/link');
  await page.fill('#code', code);
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
}

test('a child gets a code, a grown-up signs up from /parents and links, the child says yes', async ({ browser }) => {
  const kidPage = await person(browser);
  const kid = await signup(kidPage, uniq('Kid'));
  const code = await getCode(kidPage);
  await expect(kidPage.locator('#grownups')).toContainText('/family/link');
  await expect(kidPage.locator('#grownups a')).toHaveCount(0);   // the address is text, not a link

  const mum = await person(browser);
  // The old address lands on the one parent page's Family accounts section.
  await mum.goto('/grown-ups');
  await expect(mum).toHaveURL(/\/parents#families$/);
  await expect(mum.locator('#families')).toBeInViewport();
  await expect(mum.locator('#families')).toContainText('How linking works');
  // Plans: what a plan adds and where the prices are; no price on the parent page itself.
  await expect(mum.locator('#plans')).toContainText('US families');
  await expect(mum.locator('#plans a[href="/plans"]')).toHaveText('See plans and prices');
  await expect(mum.locator('main')).not.toContainText('$');
  // The grown-ups' questions fold open.
  const consent = mum.locator('#families details.lp-q', { hasText: 'parental consent' });
  await expect(consent.locator('p')).toBeHidden();
  await consent.locator('summary').click();
  await expect(consent.locator('p')).toBeVisible();
  await Promise.all([mum.waitForURL(/\/grown-ups\/signup$/), mum.locator('#families a[href="/grown-ups/signup"]').click()]);
  // The 12-character rule and the parent-or-guardian box.
  await mum.fill('#username', uniq('Mum')); await mum.fill('#password', 'too-short-1'); await mum.fill('#confirm', 'too-short-1'); await mum.check('#adult');
  await mum.click('button[type=submit]');
  await expect(mum.locator('#password-err')).toContainText('12');
  const mumName = await grownupSignup(mum);
  await mum.goto('/family');
  await expect(mum.locator('h1')).toContainText('Your family');
  await expect(mum.locator('.topnav')).toContainText('Family');
  await expect(mum.locator('.topnav a[href="/build"]')).toHaveCount(0);
  await enterCode(mum, code);
  await expect(mum.locator('.famkid.pending')).toContainText('Waiting for your child to say yes');
  await expect(mum.locator('main')).not.toContainText(kid.username);

  await kidPage.goto('/');
  await expect(kidPage.locator('.tabbar .tab[href="/me"] .badge, .me-btn .badge').first()).toBeAttached();
  await kidPage.goto('/me');
  await expect(kidPage.locator('#grownups')).toContainText('Your grown-up wants to link to your account');
  await expect(kidPage.locator('#grownups')).not.toContainText(mumName);
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('Linked to your grown-up');

  await mum.goto('/family');
  await expect(mum.locator('.famkid')).toContainText(kid.username);
  await expect(mum.locator('.famkid')).toContainText('Family extra messages yesterday: 0');
  // Fenced in: the Builder, friends and chat are not there for a grown-up; /me is the family page.
  for (const p of ['/friends', '/chat', `/u/${kid.username}`]) expect((await mum.goto(p)).status(), p).toBe(404);
  // /build is not a dead end for a grown-up: a short page saying the Builder is for kids' accounts, with no Builder.
  expect((await mum.goto('/build')).status()).toBe(200);
  await expect(mum.locator('#st-compose, form[data-api*="/api/studio"]')).toHaveCount(0);
  await mum.goto('/me'); await expect(mum).toHaveURL(/\/family$/);
  // The child unlinks.
  kidPage.once('dialog', d => d.accept());
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Unlink' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('A grown-up can link to your account.');
});

test('a child reports a request; the admin sees it in the link reports queue', async ({ browser }) => {
  const kidPage = await person(browser);
  const kid = await signup(kidPage, uniq('Kid'));
  const code = await getCode(kidPage);
  const stranger = await person(browser);
  const strangerName = await grownupSignup(stranger, uniq('Strngr'));
  await enterCode(stranger, code);
  await kidPage.goto('/me');
  kidPage.once('dialog', d => d.accept());
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Report' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('A grown-up can link to your account.');
  await stranger.goto('/family');
  await expect(stranger.locator('main')).toContainText('No children linked yet.');

  const admin = await person(browser);
  await admin.goto('/login'); await admin.fill('#username', ADMIN.username); await admin.fill('#password', ADMIN.password);
  await Promise.all([admin.waitForURL(u => !u.pathname.startsWith('/login')), admin.click('button[type=submit]')]);
  await admin.goto('/admin?tab=links');
  const card = admin.locator('article', { hasText: strangerName });
  await expect(card).toContainText(kid.username);
  await card.locator('[data-act="resolvelink"]').click();
  await expect(admin.locator('main')).toContainText('No link reports', { timeout: 10_000 });
});

test('the Builder\'s daily-limit card: stays after a reload, things to do, Me › For grown-ups, no price; Send and ideas greyed out', async ({ browser }) => {
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  const game = await templateGame(kidPage);
  const r = await kidPage.request.post(`/api/studio/${game.id}/chat`, { data: { text: 'make it blue', detach: true } });
  expect(r.status()).toBe(202);
  await expect.poll(async () => (await studioState(kidPage, game.id)).busy, { timeout: 30_000 }).toBe(false);
  // A second game, untouched: its idea chips are there, and greyed out.
  const other = await templateGame(kidPage);
  for (const id of [other.id, game.id]) {
    for (let i = 0; i < 2; i++) {   // and again after a reload
      if (i) await kidPage.reload(); else await kidPage.goto(`/studio/${id}`);
      const card = kidPage.locator('#st-limit');
      await expect(card).toBeVisible();
      await expect(card).toContainText('You have used all your Builder messages for today');
      await expect(card.locator('a[href="/"]')).toBeVisible();
      await expect(card.locator('a[href="/search?sort=new"]')).toBeVisible();
      await expect(card.locator('a[href="/me#grownups"]')).toHaveText('Me › For grown-ups');
      const text = await card.innerText();
      expect(text).not.toMatch(/\$|plan|price|upgrade|\d/i);   // no price, plan name or countdown
      expect(await card.innerHTML()).not.toMatch(/\/plans|\/grown-ups|\/family/);
      await expect(kidPage.locator('#st-send')).toBeDisabled();
      await expect(kidPage.locator('#st-send')).toHaveAttribute('aria-describedby', 'st-limit-why');
      for (const chip of await kidPage.locator('#st-log [data-chip]').all()) { await expect(chip).toBeDisabled(); await expect(chip).toHaveAttribute('aria-describedby', 'st-limit-why'); }
    }
  }
  // A game not published yet can be published from the card.
  await kidPage.goto(`/studio/${other.id}`);
  await expect(kidPage.locator('#st-log [data-chip]').first()).toBeDisabled();
  await expect(kidPage.locator('#st-limit [data-act="limit-publish"]')).toBeVisible();
  // Typing and pressing Enter sends nothing.
  await kidPage.fill('#st-input', 'one more please');
  await kidPage.press('#st-input', 'Enter');
  await expect(kidPage.locator('#st-log .msg.me')).toHaveCount(0);
  // Phone width, dark and right to left: nothing touches, no sideways scroll.
  for (const v of [{ width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark', lang: 'he' }]) {
    await kidPage.setViewportSize({ width: v.width, height: v.height });
    await kidPage.emulateMedia({ colorScheme: v.scheme });
    await kidPage.goto(`/studio/${other.id}${v.lang ? `?lang=${v.lang}` : ''}`);
    await expect(kidPage.locator('#st-limit')).toBeVisible();
    const touching = (await findTouching(kidPage)).filter(t => /st-limit/.test(`${t.a} ${t.b}`));
    expect(touching, JSON.stringify(touching)).toEqual([]);
    expect(await kidPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // The card stays inside the chat panel (it takes the typing row's place), and the chat log keeps a usable height.
    const geo = await kidPage.evaluate(() => {
      const box = s => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return r && r.height ? r : null; };
      return { chat: box('.st-chat').bottom, compose: box('#st-compose').bottom, send: box('#st-send')?.bottom ?? 0, log: box('#st-log').height };
    });
    expect(geo.compose, JSON.stringify(geo)).toBeLessThanOrEqual(geo.chat + 1);
    expect(geo.send, JSON.stringify(geo)).toBeLessThanOrEqual(geo.chat + 1);
    expect(geo.log, JSON.stringify(geo)).toBeGreaterThanOrEqual(120);
    if (v.lang === 'he' && /Builder messages/.test(await kidPage.locator('#st-limit').innerText())) {
      // Not translated yet: the card is marked as English, so it reads left to right inside the Hebrew page.
      await expect(kidPage.locator('#st-limit')).toHaveAttribute('lang', 'en');
      await expect(kidPage.locator('#st-limit')).toHaveAttribute('dir', 'ltr');
    }
  }
  await kidPage.goto('/?lang=en');
  // Me › For grown-ups: the code card comes first, above the tiles, and lasts 24 hours.
  await kidPage.goto(`/studio/${other.id}`);
  await Promise.all([kidPage.waitForURL(/\/me#grownups$/), kidPage.locator('#st-limit a[href="/me#grownups"]').click()]);
  const top = async sel => (await kidPage.locator(sel).boundingBox()).y;
  expect(await top('#grownups')).toBeLessThan(await top('.metiles'));
  await kidPage.locator('[data-family-code]').click();
  await expect(kidPage.locator('#famcode')).toContainText('It works once, for 24 hours.');
});

test('kid pages show nothing about grown-up accounts, plans or prices', async ({ browser }) => {
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  for (const p of ['/', '/me', '/build', '/search', '/friends', '/parents?x=1']) {
    await kidPage.goto(p);
    const html = await kidPage.content();
    if (p.startsWith('/parents')) continue;   // a grown-up page (the footer link to it is allowed)
    expect(html, p).not.toMatch(/href="\/(grown-ups|family)/);
    expect(html, p).not.toMatch(/\$\d|family plan/i);
  }
});

// Each new page at a phone and a desktop width, light and dark, and right to left.
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
  { width: 360, height: 780, scheme: 'dark', lang: 'ar' },
];
test('the new pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he, ar)', async ({ browser }) => {
  // Set up one of each state: a grown-up with a linked child and a waiting request, and a child being asked.
  const mum = await person(browser);
  await grownupSignup(mum, uniq('Mum'));
  const a = await person(browser); await signup(a, uniq('Kid')); const ca = await getCode(a);
  await enterCode(mum, ca);
  await a.goto('/me'); await Promise.all([a.waitForLoadState('load'), a.locator('#grownups button', { hasText: 'Yes' }).click()]);
  const b = await person(browser); await signup(b, uniq('Kid')); const cb = await getCode(b);
  await enterCode(mum, cb);
  const mumState = await mum.context().storageState(), askedState = await b.context().storageState(), linkedState = await a.context().storageState();
  const sets = [
    [null, ['/grown-ups/signup', '/grown-ups/login', '/parents', '/parents#families']],
    [mumState, ['/family', '/family/link', '/family/account']],
    [askedState, ['/me#grownups']],
    [linkedState, ['/me#grownups']],
  ];
  const problems = [];
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const v of VIEWS) {
    for (const [state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: FAM, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, ...(state ? { storageState: state } : {}) });
      const page = await ctx.newPage();
      for (const p of paths) {
        const url = v.lang ? `${p.split('#')[0]}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p;
        await page.goto(url);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        // The parent page's folds: checked open (the closed ones are only their heading rows).
        if (p === '/parents') await page.evaluate(() => { for (const d of document.querySelectorAll('details.lp-fold, details.lp-q')) d.open = true; });
        for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
        if (SHOTS) {
          if (p.includes('#')) await page.locator(`#${p.split('#')[1]}`).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(SHOTS, `${p.replace(/[^a-z]+/gi, '_')}${state === askedState ? '_asked' : state === linkedState ? '_linked' : ''}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`), fullPage: !p.includes('#') });
        }
      }
      await ctx.close();
    }
  }
  expect([...new Set(problems)]).toEqual([]);
});

test('the grown-up\'s menus: Family · Games · Plans · Account; settings on /family/account; old /family# links land there', async ({ browser }) => {
  const mum = await person(browser, { viewport: { width: 360, height: 760 } });
  await grownupSignup(mum, uniq('Mum'));
  await mum.goto('/family');
  const tabs = () => mum.locator('.tabbar .tab').evaluateAll(l => l.map(a => [a.getAttribute('href'), a.querySelector('.tab-t').textContent]));
  expect(await tabs()).toEqual([['/family', 'Family'], ['/', 'Games'], ['/plans', 'Plans'], ['/family/account', 'Account']]);
  await expect(mum.locator('.tabbar .tab[href="/family"]')).toHaveAttribute('aria-current', 'page');
  // /family is about the children and the plan; the settings are one tap away.
  await expect(mum.locator('#famcheck')).toBeVisible();
  await expect(mum.locator('#password, #language, #signout')).toHaveCount(0);
  await Promise.all([mum.waitForURL(/\/family\/account$/), mum.locator('.tabbar .tab[href="/family/account"]').click()]);
  await expect(mum.locator('h1')).toContainText('Your account');
  for (const id of ['#language', '#password', '#signout']) await expect(mum.locator(id)).toBeVisible();
  await expect(mum.locator('.tabbar .tab[href="/family/account"]')).toHaveAttribute('aria-current', 'page');
  // The game home is the Games tab.
  await mum.goto('/');
  await expect(mum.locator('.tabbar .tab[href="/"]')).toHaveAttribute('aria-current', 'page');
  // Old links and bookmarks: /family#password, #language and #signout go on to the same panel on the Account page.
  for (const h of ['password', 'language', 'signout']) {
    await mum.goto(`/family#${h}`);
    await mum.waitForURL(new RegExp(`/family/account#${h}$`));
    await expect(mum.locator(`#${h}`)).toBeVisible();
  }
  // Desktop: Family · Games · Plans, and the avatar button opens the Account page; it all fits (en, de, ru).
  for (const lang of ['en', 'de', 'ru']) for (const width of [821, 1000, 1101, 1280, 1920]) {
    await mum.setViewportSize({ width, height: 760 });
    await mum.goto(`/family?lang=${lang}`); await mum.evaluate(() => document.fonts.ready);
    expect(await mum.locator('.topnav .navlink').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/family', '/', '/plans']);
    await expect(mum.locator('.topbar .me-btn')).toHaveAttribute('href', '/family/account');
    const r = await mum.evaluate(topbarFit);
    expect(r.tight || r.off || r.wide > 0 || r.cut || r.missing.length, `${lang} @${width}: ${JSON.stringify(r)}`).toBeFalsy();
  }
  await mum.goto('/?lang=en');
});

test('a grown-up meets no dead ends: every same-site link and form on their pages answers (no 404)', async ({ browser }) => {
  const mum = await person(browser);
  await grownupSignup(mum, uniq('Mum'));
  await mum.goto('/');
  const game = await mum.locator('a[href^="/g/"]').first().getAttribute('href');
  const seeds = ['/', '/search', '/search?q=a', '/family', '/family/link', '/family/account', '/parents', '/safety', game, game.replace('/g/', '/play/')];
  const hrefs = new Set(), apis = new Set();
  for (const p of seeds) {
    await mum.goto(p);
    for (const h of await mum.locator('a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')))) hrefs.add(h.split('#')[0] || '/');
    for (const a of await mum.locator('[data-api]').evaluateAll(es => es.map(e => e.getAttribute('data-api')))) apis.add(a);
  }
  const dead = [];
  for (const h of [...hrefs].slice(0, 120)) { const r = await mum.request.get(h); if (r.status() === 404) dead.push(`GET ${h}`); }
  // Forms: sent empty (a 400 is fine, a 404 is a dead end). Signing out is left for last.
  for (const a of apis) {
    if (/\/api\/auth\/logout/.test(a)) continue;
    const r = await mum.request.post(a, { data: {} }); if (r.status() === 404) dead.push(`POST ${a}`);
  }
  // The game page's own buttons: Like and Rate are not shown to a grown-up.
  await mum.goto(game);
  await expect(mum.locator('#likebtn, #rate')).toHaveCount(0);
  await expect(mum.locator('a[href^="/u/"]')).toHaveCount(0);
  expect(dead).toEqual([]);
});

test('the code panel: a safety line next to the code; a new code hides "Lost it? Get a new one"', async ({ browser }) => {
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  await getCode(kidPage);
  await expect(kidPage.locator('#famcode')).toContainText('Only give this code to your parent or guardian, face to face.');
  await kidPage.reload();
  await expect(kidPage.locator('#famcode-open')).toBeVisible();
  await kidPage.locator('[data-family-code]').click();
  await expect(kidPage.locator('#famcode')).toBeVisible();
  await expect(kidPage.locator('#famcode-open')).toBeHidden();
  await expect(kidPage.locator('[data-family-code]')).toHaveCount(0);
});

test('the /family checklist: how to link, ticks when the child says yes, "Free is fine" folds it to All set; kids never see it', async ({ browser }) => {
  const mum = await person(browser);
  await grownupSignup(mum, uniq('Mum'));
  await mum.goto('/family');
  const check = mum.locator('#famcheck');
  await expect(check.locator('h2')).toHaveText('Getting started');
  const steps = check.locator('.famcheck-step');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveClass(/done/);
  await expect(steps.nth(1)).not.toHaveClass(/done/);
  await expect(steps.nth(1)).toContainText('For grown-ups');
  // A test key and not a billing tester: plans aren't on sale to Mum, so step 3 promises nothing and has no plans link.
  await expect(steps.nth(2)).toContainText('Plans aren’t on sale yet. Free works in the meantime.');
  await expect(steps.nth(2).locator('a[href="/plans"]')).toHaveCount(0);
  await expect(check).not.toContainText('$');
  // Step 2's link opens the code form; the child says yes.
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  const code = await getCode(kidPage);
  await expect(kidPage.locator('#famcheck')).toHaveCount(0);
  await Promise.all([mum.waitForURL(/\/family\/link$/), steps.nth(1).locator('a[href="/family/link"]').click()]);
  await mum.fill('#code', code);
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('button[type=submit]')]);
  await expect(steps.nth(1)).toContainText('Waiting for your child to say yes');
  await kidPage.goto('/me'); await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kidPage.locator('#famcheck')).toHaveCount(0);
  await mum.reload();
  await expect(steps.nth(1)).toHaveClass(/done/);
  // "Free is fine": folded to one line, kept after a reload, still opens.
  await Promise.all([mum.waitForLoadState('load'), steps.nth(2).locator('button', { hasText: 'Free is fine, hide this' }).click()]);
  await expect(mum.locator('details#famcheck > summary')).toHaveText(/All set/);
  await mum.reload();
  const folded = mum.locator('details#famcheck');
  await expect(folded).not.toHaveAttribute('open', '');
  await expect(folded.locator('.famcheck-step').first()).toBeHidden();
  await folded.locator('summary').click();
  await expect(folded.locator('.famcheck-step').nth(2)).toContainText('Plans aren’t on sale yet');
  await expect(folded.locator('.famcheck-step').nth(2)).not.toContainText('any time');
  // Folded and opened, at 360 and 1280, light and dark, and right to left: nothing touches, no sideways scroll.
  const state = await mum.context().storageState();
  const problems = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ baseURL: FAM, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    const page = await ctx.newPage();
    await page.goto(v.lang ? `/family?lang=${v.lang}` : '/family');
    for (const open of [false, true]) {
      await page.evaluate(o => { document.querySelector('details#famcheck').open = o; }, open);
      for (const t of await findTouching(page)) problems.push(`/family ${open ? 'open' : 'folded'} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`/family @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `family_check_${open ? 'open' : 'folded'}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`) });
    }
    await ctx.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});
