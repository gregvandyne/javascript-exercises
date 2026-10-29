import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Words the server refuses in names: the lists in server/i18n/blocklists (ROT13) and in server/services/textfilter.js.
// Random consonants spell one of their abbreviations about once in a hundred names, which made sign-ups fail at random.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rot13 = s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
const LISTS = path.join(ROOT, 'server/i18n/blocklists');
const REFUSED = fs.readdirSync(LISTS).filter(f => f.endsWith('.txt'))
  .flatMap(f => fs.readFileSync(path.join(LISTS, f), 'utf8').split('\n')).map(l => l.trim())
  .filter(l => l && !l.startsWith('#') && !l.startsWith('!')).map(l => rot13(l.replace(/^=/, '').trim()).toLowerCase())
  .filter(w => /^[a-z]{2,}$/.test(w))
  .concat(...[...fs.readFileSync(path.join(ROOT, 'server/services/textfilter.js'), 'utf8').matchAll(/^(?:export )?const (?:BLOCK|NAME_ONLY) = \[([^\]]*)\]/gm)].map(m => m[1].match(/[a-z]+/g)));
// Consonants only: names with long digit runs are refused (they look like phone numbers), and no vowels means no rude words by chance.
export function uniq(p = 'U') {
  for (;;) {
    const n = p + Array.from({ length: 6 }, () => 'bcdfghjkmnpqrstvwxz'[Math.floor(Math.random() * 19)]).join('');
    if (!REFUSED.some(w => n.toLowerCase().includes(w))) return n;
  }
}
export async function gameFrame(page) {
  await expect.poll(() => page.frames().some(f => f.url().includes('/frame/')), { timeout: 15000 }).toBe(true);
  const f = page.frames().find(f => f.url().includes('/frame/'));
  await f.waitForFunction(() => typeof window.BRB === 'object');
  return f;
}
// Each test "household" gets its own client IP (the server trusts one proxy hop, like production behind Render's proxy),
// so per-IP limits such as 10 signups per hour behave as they would for real, separate families.
const randomIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
export async function ownIp(page) { await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() }); }
export async function signup(page, username = uniq('Kid'), password = 'secret123') {
  await ownIp(page);
  await page.goto('/signup');
  // "Start free" first asks "Who's this for?" (in the languages that have it): a kid's account is "My child".
  const mine = page.locator('.whofor a.door-kid');
  if (await mine.count()) await Promise.all([page.waitForURL(/\/signup\?for=kid/), mine.click()]);
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/signup')), page.click('button[type=submit]')]);
  return { username, password };
}
export async function login(page, username, password) {
  await ownIp(page);
  await page.goto('/login');
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}
export const ADMIN = { username: 'admin', password: 'admin-pass-123' };

/** A fresh browser context signed in as the admin. */
export async function adminPage(browser) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  return page;
}

/** Studio state for a game, as the signed-in owner sees it. */
export const studioState = async (page, id) => (await page.request.get(`/api/studio/${id}`)).json();

/** Start a game from a "Start from" template, give it a unique name, and return { id, slug, title }. */
export async function templateGame(page, { title = uniq('Game '), template = 'catch' } = {}) {
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click(`.tplcard[data-template="${template}"]`)]);
  const id = page.url().split('/studio/')[1];
  await expect(page.locator('#st-frame')).toHaveAttribute('src', /\/frame\//);
  await page.fill('#st-title', title); await page.press('#st-title', 'Enter');
  await expect.poll(async () => (await studioState(page, id)).game.title).toBe(title);
  const st = await studioState(page, id);
  return { id, slug: st.game.slug, title };
}

/** Publish from the Studio with the share sheet. Must be on the game's Studio page. */
export async function publishFromStudio(page, visibility) {
  await page.click('#st-publish');
  const sheet = page.locator('.sheet').filter({ has: page.locator('#vis-go') });
  await sheet.locator(`[data-vis="${visibility}"]`).click();
  await sheet.locator('#vis-go').click();
  await expect(page.locator('#vis-go')).toHaveCount(0);
}

/** Admin approves the pending version of a game from the /admin review queue. */
export async function adminApprove(admin, gameId) {
  await admin.goto('/admin?tab=queue');
  const btn = admin.locator(`[data-act="approve"][data-id="${gameId}"]`);
  await expect(btn).toBeVisible();
  await Promise.all([admin.waitForResponse(r => r.url().includes(`/api/admin/games/${gameId}/approve`) && r.ok()), btn.click()]);
}

/** Make two signed-in users friends with friend codes, through the Friends page. */
export async function makeFriends(a, b) {
  await a.goto('/friends');
  const code = (await a.locator('#mycode').textContent()).trim();
  await b.goto('/friends');
  await b.fill('#code', code);
  await Promise.all([b.waitForResponse(r => r.url().endsWith('/api/friends/add') && r.ok()), b.click('#addform [type=submit]')]);
  await a.goto('/friends');
  await Promise.all([a.waitForResponse(r => /\/api\/friends\/[^/]+\/accept$/.test(r.url()) && r.ok()), a.locator('[data-act="accept"]').first().click()]);
}
