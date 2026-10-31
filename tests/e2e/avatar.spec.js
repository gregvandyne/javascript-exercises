// Foundation step 3 in a real browser: a kid designs their own Oomba character on the Me page (on a phone, with the
// keyboard too), it is saved as a spec, and games draw it as the hero (Sum Racer's player 1, Star Island's 'me');
// guests play as the mascot. The Studio's theme chips put "Use the snow theme." into the message.
// KIT4_SHOTS=<dir> also saves the screens there.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { signup, gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const SHOTS = process.env.KIT4_SHOTS || '';
const shot = async (target, dir, name) => { if (!SHOTS) return; fs.mkdirSync(path.join(SHOTS, dir), { recursive: true }); await target.screenshot({ path: path.join(SHOTS, dir, name) }); };
const errorsOf = page => { const e = []; page.on('pageerror', x => e.push(x.message)); page.on('console', m => { if (m.type() === 'error') e.push(m.text()); }); return e; };

test('a kid designs their character on a phone; it is saved as a spec and Sum Racer drives as it', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = errorsOf(page);
  await signup(page);
  await page.goto('/me#character');
  const form = page.locator('#charform');
  await expect(form).toHaveAttribute('data-ready', '1', { timeout: 20000 });
  await expect(page.locator('#ch-status')).toContainText('Not saved yet');
  // taps on the chips and colour dots
  await page.locator('input[name=hair][value=braids] + span').tap();
  await page.locator('input[name=skin][value="6"] + .chsw-dot').tap();
  await page.locator('input[name=topColor][value=coral] + .chsw-dot').tap();
  await page.locator('input[name=wear][value=crown] + span').tap();
  // the keyboard works too: radio groups move with the arrow keys
  await page.locator('input[name=mood]:checked').focus(); await page.keyboard.press('ArrowRight');
  expect(await page.locator('input[name=mood]:checked').getAttribute('value')).toBe('surprised');
  // the preview stays in view while choosing (sticky on phones) and is drawn
  const box = await page.locator('#ch-prev').boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y).toBeLessThan(844);
  expect(await page.evaluate(() => document.getElementById('ch-canvas').width)).toBeGreaterThan(50);
  await shot(page, 'avatar', 'phone-editor.png');
  // Bold: its own head wear and jacket
  await page.locator('[data-chstyle=bold]').tap();
  await expect(page.locator('[data-group=boldHat]')).toBeVisible(); await expect(page.locator('[data-group=mood]')).toBeHidden();
  await page.locator('input[name=boldHat][value=hood] + span').tap();
  await shot(page, 'avatar', 'phone-editor-bold.png');
  await page.locator('#ch-save').tap();
  await expect(page.locator('.toast').first()).toBeVisible();
  const saved = await page.evaluate(async () => (await fetch('/me')).text());
  expect(saved).toContain('data-saved="1"');
  // nothing in the page but the editor changed: no kit styles leaked into the site's page
  expect(await page.evaluate(() => !!document.getElementById('ok-css') || !!document.querySelector('.ok-ui'))).toBe(false);
  // Sum Racer: player 1 is the kid's own character
  await page.goto('/play/sum-racer');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.BRB, null, { timeout: 20000 });
  const c = await f.evaluate(() => ({ c: BRB.user.character, a: Oomba.avatar(), frozen: Object.isFrozen(BRB.user.character.hair) }));
  expect(c.c).toMatchObject({ species: 'kid', skin: 6, mood: 'surprised', hair: { style: 'braids' }, outfit: { color: 'coral' }, wear: ['crown'], bold: { wear: ['hood', 'bomber'] } });
  expect(c.frozen).toBe(true);
  expect(c.a).toMatchObject({ species: 'kid', skin: 6, hair: { style: 'braids' } });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('guests see the mascot they play as and a sign-up link, and cannot save', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
  await page.goto('/play/sum-racer');   // guest play makes a guest account
  await gameFrame(page);
  await page.goto('/me#character');
  await expect(page.locator('#charform')).toHaveAttribute('data-ready', '1', { timeout: 20000 });
  await expect(page.locator('#charform a[href^="/signup"]')).toBeVisible();
  await expect(page.locator('input[name=skin]')).toHaveCount(0);
  const r = await page.evaluate(async () => (await fetch('/api/me/character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: { species: 'fox' } }) })).status);
  expect(r).toBe(403);
  await shot(page.locator('#character'), 'avatar', 'desktop-guest.png');
  await ctx.close();
});

test('the Studio\'s theme chips put the theme into the message (and take it out again)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  const errors = errorsOf(page);
  await signup(page);
  const g = await page.evaluate(async () => (await fetch('/api/studio/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'catch' }) })).json());
  await page.goto(g.url);
  const chips = page.locator('.st-theme');
  await expect(chips).toHaveCount(15);
  expect(await page.locator('.st-theme img').first().evaluate(i => i.complete && i.naturalWidth > 0 || i.loading === 'lazy')).toBe(true);
  await page.fill('#st-input', 'Make the hero faster');
  await page.locator('.st-theme[data-theme=snow]').click();
  await expect(page.locator('.st-theme[data-theme=snow]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#st-input')).toHaveValue('Make the hero faster\nUse the Snow theme.');
  await shot(page, 'picker', 'phone-snow.png');
  await page.locator('.st-theme[data-theme=castle]').click();
  await expect(page.locator('#st-input')).toHaveValue('Make the hero faster\nUse the Castle theme.');
  await expect(page.locator('.st-theme[aria-pressed=true]')).toHaveCount(1);
  await page.locator('.st-theme[data-theme=castle]').click();
  await expect(page.locator('#st-input')).toHaveValue('Make the hero faster');
  // sent as the kid's own words: the mock Builder makes the change and the chips reset
  await page.locator('.st-theme[data-theme=snow]').click();
  await page.locator('#st-send').click();
  await expect(page.locator('.st-theme[aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('#st-log')).toContainText('Use the Snow theme.');
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, 'picker', 'desktop-sent.png');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('in another language the chip says the theme in that language, with the kit\'s name for the Builder', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
  await signup(page);
  await page.goto('/me?lang=fr');
  const g = await page.evaluate(async () => (await fetch('/api/studio/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'catch' }) })).json());
  await page.goto(g.url);
  await expect(page.locator('.st-theme[data-theme=snow] span').first()).toHaveText('Neige');
  await page.locator('.st-theme[data-theme=snow]').click();
  await expect(page.locator('#st-input')).toHaveValue('Utilise le thème Neige (snow).');
  await ctx.close();
});

test('Star Island: "play as me" makes the hero the kid\'s own character as a 3D rig', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
  await signup(page);
  const ch = { species: 'kid', skin: 6, hair: { style: 'puffs', color: 'black' }, outfit: { top: 'overalls', color: 'coral' }, wear: ['crown'], bold: { wear: ['visor'] } };
  expect(await page.evaluate(async c => (await fetch('/api/me/character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: c }) })).status, ch)).toBe(200);
  const g = await page.evaluate(async () => (await fetch('/api/studio/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'island' }) })).json());
  await page.goto(g.url);
  await page.fill('#st-input', 'I want to play as me'); await page.click('#st-send');
  await expect.poll(async () => (await page.evaluate(async id => (await fetch('/api/studio/' + id)).json(), g.id)).versions.length, { timeout: 60000 }).toBeGreaterThanOrEqual(2);
  await page.reload();
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.start, null, { timeout: 30000 });
  await f.evaluate(() => window.__brbTest.start());
  await f.waitForFunction(() => window.__brbTest.state().frames > 5, null, { timeout: 30000 });
  const st = await f.evaluate(() => window.__brbTest.state());
  expect(st.hero).toBe('me'); expect(st.drawCalls).toBeLessThanOrEqual(100);
  await shot(page.locator('#st-device'), 'avatar', 'island-me.png');
  await ctx.close();
});
