// Play mode: guests, saves, accounts, search, ratings, likes, live counts, and the sandbox.
import { test, expect } from '@playwright/test';
import { gameFrame, signup, uniq, ownIp } from './helpers.js';

test('home shows the three featured seed games', async ({ page }) => {
  await page.goto('/');
  const featured = page.locator('#featured');
  for (const t of ['Shark Plank', 'Ring Rumble', 'Footy Tycoon']) await expect(featured.getByText(t, { exact: true })).toBeVisible();
});

test('guest plays Shark Plank in one tap and a save round-trips', async ({ page }) => {
  await page.goto('/g/shark-plank');
  await page.click('#playbtn');
  await expect(page).toHaveURL(/\/play\/shark-plank/);
  let f = await gameFrame(page);
  await expect(f.locator('h1')).toContainText('Shark');
  const save = page.waitForRequest(r => r.url().includes('/save') && r.method() === 'POST');
  await f.evaluate(() => localStorage.setItem('shark-plank-stars', '7'));
  await save;
  await page.waitForTimeout(300);
  await page.reload();
  f = await gameFrame(page);
  expect(await f.evaluate(() => localStorage.getItem('shark-plank-stars'))).toBe('7');
});

test('the game frame has no cookies, no network and no parent access', async ({ page }) => {
  await page.goto('/play/ring-rumble');
  const f = await gameFrame(page);
  const r = await f.evaluate(async () => {
    const out = {};
    try { out.cookie = document.cookie; } catch (e) { out.cookie = 'blocked'; }
    try { await fetch('/api/me'); out.fetch = 'allowed'; } catch (e) { out.fetch = 'blocked'; }
    try { out.parent = window.parent.document.title; } catch (e) { out.parent = 'blocked'; }
    out.origin = self.origin;
    return out;
  });
  expect(r.cookie).toBe('blocked');
  expect(r.fetch).toBe('blocked');
  expect(r.parent).toBe('blocked');
  expect(r.origin).toBe('null');
  expect(await page.locator('#gameframe').getAttribute('sandbox')).not.toContain('allow-same-origin');
});

test('a game pointing its own frame at another site: no request leaves, and the play page puts the game back', async ({ page }) => {
  let outside = 0, loads = 0;
  await page.context().route(/evil\.invalid/, r => { outside++; return r.fulfill({ status: 200, body: 'x' }); });
  page.on('response', r => { if (r.url().includes('/frame/') && r.status() === 200) loads++; });
  await page.goto('/play/ring-rumble');
  const f = await gameFrame(page);
  expect(loads).toBe(1);
  await f.evaluate(() => { location.href = 'http://evil.invalid/steal?d=1'; });
  // The page's CSP (frame-src 'self') refuses it before any request; the play page then swaps the error page back.
  await expect.poll(() => loads, { timeout: 10_000 }).toBe(2);
  await expect.poll(async () => { const g = page.frames().find(x => x.url().includes('/frame/')); return !!g && g.evaluate(() => typeof window.BRB === 'object').catch(() => false); }).toBe(true);
  expect(outside).toBe(0);
});

test('a game that keeps reloading itself is stopped with a message after two tries, not looped', async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await ownIp(page);
  // Every game document reloads itself soon after loading (an "auto-restart"), with no tap from the player. A reload
  // from inside the frame has no sign-in cookie, so the server refuses it, and the play page pins the game back.
  await ctx.addInitScript(() => { addEventListener('load', () => { if (window.BRB && self.origin === 'null') setTimeout(() => location.reload(), 300); }); });
  let loads = 0; page.on('response', r => { if (r.url().includes('/frame/') && r.status() === 200) loads++; });
  await page.goto('/play/ring-rumble');
  // Just wait: Playwright's own steps run scripts in the page as if the player had tapped, and pins right after a tap
  // don't count (a "Play again" button that reloads the game is fine), so polling here would keep it going.
  await page.waitForTimeout(12_000);
  const box = page.locator('.game-stopped');
  await expect(box).toBeVisible();
  await expect(box).toContainText('This game stopped working.');
  await expect(box.locator('button')).toHaveText('Start again');
  const n = loads; await page.waitForTimeout(3000);
  expect(loads, 'no more loads once stopped').toBe(n);
  await ctx.close();
});

test('Ring Rumble fullscreen button routes through the SDK', async ({ page }) => {
  await page.goto('/play/ring-rumble');
  const f = await gameFrame(page);
  const msg = page.evaluate(() => new Promise(res => addEventListener('message', e => { if (e.data && e.data.type === 'brb:fullscreen') res(e.data.on); })));
  await f.evaluate(() => document.getElementById('fsBtn').click());
  expect(await msg).toBe(true);
});

test('Footy Tycoon trophy wallet persists between visits', async ({ page }) => {
  await page.goto('/play/footy-tycoon');
  let f = await gameFrame(page);
  const save = page.waitForRequest(r => r.url().includes('/save') && r.method() === 'POST');
  await f.evaluate(() => localStorage.setItem('footy-wallet-v1', JSON.stringify({ trophies: 42, owned: [] })));
  await save; await page.waitForTimeout(300);
  await page.goto('/'); await page.goto('/play/footy-tycoon');
  f = await gameFrame(page);
  expect(JSON.parse(await f.evaluate(() => localStorage.getItem('footy-wallet-v1'))).trophies).toBe(42);
});

test('guest upgrade to an account keeps saves', async ({ page }) => {
  await page.goto('/play/shark-plank');
  const f = await gameFrame(page);
  const save = page.waitForRequest(r => r.url().includes('/save') && r.method() === 'POST');
  await f.evaluate(() => localStorage.setItem('shark-plank-stars', '12'));
  await save; await page.waitForTimeout(300);
  await page.goto('/signup');
  await expect(page.getByText('Everything you saved comes with you')).toBeVisible();
  const name = uniq('Up');
  await page.fill('#username', name); await page.fill('#password', 'secret123');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/signup')), page.click('button[type=submit]')]);
  await page.goto('/me'); await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.goto('/play/shark-plank');
  const f2 = await gameFrame(page);
  expect(await f2.evaluate(() => localStorage.getItem('shark-plank-stars'))).toBe('12');
});

test('search by title and by builder name', async ({ page }) => {
  await page.goto('/search');
  await page.fill('#q', 'rumble');
  await expect(page.locator('#results').getByText('Ring Rumble')).toBeVisible();
  await expect(page.locator('#results').getByText('Shark Plank')).toHaveCount(0);
  await page.fill('#q', 'Oomba Academy');
  await expect(page.locator('#results .person').first()).toContainText('Oomba Academy');
  await expect(page.locator('#results').getByText('Footy Tycoon')).toBeVisible();
});

test('rate and favorite a game; it shows in My favorites', async ({ page }) => {
  await signup(page);
  await page.goto('/g/shark-plank');
  await page.click('#rate [data-stars="4"]');
  await expect(page.locator('#ratemsg')).toContainText('4 stars');
  await page.reload();
  await expect(page.locator('#rate [data-stars="4"]')).toHaveAttribute('aria-checked', 'true');
  const before = +(await page.locator('#likecount').textContent());
  await page.click('#likebtn');
  await expect(page.locator('#likecount')).toHaveText(String(before + 1));
  await expect(page.locator('#likebtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#likebtn')).toContainText('Favorite');
  await page.goto('/favorites');
  await expect(page.locator('a.gcard[href="/g/shark-plank"]')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('#favorites-h')).toContainText('My favorites');
});

test('live player count rises when a second browser opens a game', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  const count = async () => (await (await pa.request.get('/api/live?ids=' + await gid(pa))).json()).counts;
  const gid = async p => (await p.request.get('/g/footy-tycoon')).text().then(h => h.match(/data-live="([^"]+)"/)[1]);
  const id = await gid(pa);
  const before = (await count())[id] || 0;
  await pa.goto('/play/footy-tycoon'); await gameFrame(pa);
  await expect.poll(async () => (await count())[id]).toBe(before + 1);
  await pb.goto('/play/footy-tycoon'); await gameFrame(pb);
  await expect.poll(async () => (await count())[id]).toBe(before + 2);
  await pb.goto('/');
  await expect.poll(async () => (await count())[id]).toBe(before + 1);
  await a.close(); await b.close();
});
