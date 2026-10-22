import { expect } from '@playwright/test';
export const uniq = (p = 'U') => p + Math.random().toString(36).slice(2, 8);
export async function gameFrame(page) {
  await expect.poll(() => page.frames().some(f => f.url().includes('/frame/')), { timeout: 15000 }).toBe(true);
  const f = page.frames().find(f => f.url().includes('/frame/'));
  await f.waitForFunction(() => typeof window.BRB === 'object');
  return f;
}
export async function signup(page, username = uniq('Kid'), password = 'secret123') {
  await page.goto('/signup');
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/signup')), page.click('button[type=submit]')]);
  return { username, password };
}
export async function login(page, username, password) {
  await page.goto('/login');
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}
export const ADMIN = { username: 'admin', password: 'admin-pass-123' };
