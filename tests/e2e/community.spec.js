// Community: friends-only games, friends-only chat with filters, and the admin panel is hidden from everyone else.
import { test, expect } from '@playwright/test';
import { signup, uniq, templateGame, publishFromStudio, makeFriends } from './helpers.js';

async function newUser(browser, prefix) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const u = await signup(page, uniq(prefix));
  return { ctx, page, ...u };
}
const searchHas = async (page, title, slug) => {
  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  return page.locator(`#results a[href="/g/${slug}"]`).count();
};

test('a friends-only game is hidden from strangers and open to an accepted friend', async ({ browser }) => {
  const owner = await newUser(browser, 'Own'), stranger = await newUser(browser, 'Str'), friend = await newUser(browser, 'Fr');
  const title = uniq('Secret Club ');
  const g = await templateGame(owner.page, { title });
  await publishFromStudio(owner.page, 'friends');
  await expect(owner.page.locator('#st-live')).toContainText('Friends');

  // Stranger: 404 on the page, the play page and the API, and not in search.
  expect((await stranger.page.goto(`/g/${g.slug}`)).status()).toBe(404);
  expect((await stranger.page.goto(`/play/${g.slug}`)).status()).toBe(404);
  expect(await searchHas(stranger.page, title, g.slug)).toBe(0);

  // Friend (before accepting): still hidden. After adding by code and the owner accepting: visible and playable.
  expect((await friend.page.goto(`/g/${g.slug}`)).status()).toBe(404);
  await makeFriends(owner.page, friend.page);
  expect((await friend.page.goto(`/g/${g.slug}`)).status()).toBe(200);
  await expect(friend.page.locator('h1')).toHaveText(title);
  expect(await searchHas(friend.page, title, g.slug)).toBe(1);
  await friend.page.goto(`/play/${g.slug}`);
  await expect.poll(() => friend.page.frames().some(f => f.url().includes('/frame/'))).toBe(true);

  // The stranger still can't.
  expect((await stranger.page.goto(`/g/${g.slug}`)).status()).toBe(404);
  for (const u of [owner, stranger, friend]) await u.ctx.close();
});

test('friends chat: a message arrives by polling and a phone number is refused', async ({ browser }) => {
  const a = await newUser(browser, 'Ann'), b = await newUser(browser, 'Ben');
  await makeFriends(a.page, b.page);
  await a.page.goto(`/chat/${b.username}`);
  await b.page.goto(`/chat/${a.username}`);
  await expect(a.page.locator('#composer')).toBeVisible();

  const hello = `Want to play Shark Plank ${uniq('')}?`;
  await a.page.fill('#msg', hello); await a.page.press('#msg', 'Enter');
  await expect(a.page.locator('#msgs .msg.mine .bubble').last()).toHaveText(hello);
  // B's page was already open: the message arrives by polling, without a reload.
  await expect(b.page.locator('#msgs .msg.theirs .bubble').last()).toHaveText(hello, { timeout: 15000 });

  await a.page.fill('#msg', 'my number is 555 123 4567');
  await a.page.press('#msg', 'Enter');
  await expect(a.page.locator('#sendmsg')).toContainText('Phone numbers stay private');
  const r = await a.page.request.post(`/api/chat/${b.username}`, { data: { kind: 'text', body: 'call 0412 345 678' } });
  expect(r.status()).toBe(400);
  // Nothing with digits ever reached B.
  await b.page.waitForTimeout(4000);
  const theirs = await b.page.locator('#msgs .msg.theirs .bubble').allTextContents();
  expect(theirs).toEqual([hello]);
  const api = await (await b.page.request.get(`/api/chat/${a.username}`)).json();
  expect(api.messages.map(m => m.body)).toEqual([hello]);
  await a.ctx.close(); await b.ctx.close();
});

test('the admin panel is 404 for a signed-in non-admin', async ({ page }) => {
  await signup(page, uniq('Nope'));
  expect((await page.goto('/admin')).status()).toBe(404);
  expect((await page.goto('/admin/money')).status()).toBe(404);
  expect((await page.request.get('/api/admin/audit')).status()).toBe(404);
  expect((await page.request.post('/api/admin/money/rollup', { data: {} })).status()).toBe(404);
  const anon = await page.context().browser().newContext();
  expect((await anon.request.get('/api/admin/audit')).status()).toBe(404);
  await anon.close();
});
