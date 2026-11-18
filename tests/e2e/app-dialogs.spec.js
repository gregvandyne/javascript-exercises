// The site's own question box (public/js/app.js ask: a <dialog> in the site's look) in place of the browser's grey
// confirm(), and the live host's cleaned-up side panel with a typed message to everyone (docs/decisions.md "The site's
// own dialog; the live host's message box"), in a real browser:
//   1. the host presses Start with nobody in the room: the site's box asks (light, dark, a phone), Cancel and Escape
//      start nothing, "Start anyway" starts;
//   2. a delete elsewhere (a game folder) asks in the same box with a red Delete; Cancel keeps it, Delete deletes; in
//      Hebrew the box reads right to left;
//   3. the side panel: no quick messages; the teacher types a message, Enter or Send to everyone sends it, a player
//      sees it, the panel says Sent; an empty one can't be sent, a rude one is refused; every button one height and one
//      line at 1280, 1440 and a tablet, light and dark.
// Screenshots go to DIALOG_SHOTS when it is set.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, ownIp, answerDialog } from './helpers.js';

const SHOTS = process.env.DIALOG_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const ITEMS = [{ q: 'What is 2 + 2?', choices: ['4', '5', '3', '6'], answer: 0, secs: 20 }, { q: 'What is 3 + 3?', choices: ['6', '5', '7', '9'], answer: 0, secs: 20 }];
test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function signedIn(browser, who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage(); await login(page, who.username, who.password); return page;
}
async function openRoom(page, body = {}) {
  const origin = new URL(page.url()).origin;
  const r = await page.request.post('/api/live/sessions', { data: { audience: 'open', replace: true, pick: 'mode:battle', items: ITEMS, ...body }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await page.goto((await r.json()).redirect);
  return (await page.locator('#lv-code').textContent()).replace(/\s/g, '');
}
async function player(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); await ownIp(page);
  await page.goto(`/join#${code}`);
  await page.click('#lv-join button[type=submit]');
  await expect(page.locator('#lv-card-step')).toBeVisible();
  await page.click('#lv-go');
  await page.waitForURL(/\/live\/play\//);
  return page;
}
async function endRoom(host) {
  await host.locator('#lv-controls [data-lv-act="end"]:not([hidden])').click();
  await answerDialog(host);
  await host.waitForURL(/\/live\/results\//);
}
/** The open box looks like the site: the card, 20px corners, Bricolage, pill buttons, the main one Mint (or Danger). */
async function looksRight(page, { danger = false } = {}) {
  const d = page.locator('dialog.ob-dialog[open]');
  await page.waitForTimeout(250);   // after the box's short rise
  const css = await d.evaluate((el, danger) => {
    const cs = getComputedStyle(el), root = getComputedStyle(document.documentElement);
    const ok = el.querySelector('[data-ob="ok"]'), cancel = el.querySelector('[data-ob="cancel"]');
    const okCs = getComputedStyle(ok);
    const want = root.getPropertyValue(danger ? '--danger' : '--accent').trim();
    const probe = document.createElement('i'); probe.style.color = want; document.body.append(probe); const wantRgb = getComputedStyle(probe).color; probe.remove();
    return { radius: cs.borderTopLeftRadius, font: cs.fontFamily, bg: cs.backgroundColor, card: (() => { const p = document.createElement('i'); p.style.color = root.getPropertyValue('--card').trim(); document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(),
      okBg: okCs.backgroundColor, wantRgb, okRadius: parseFloat(okCs.borderTopLeftRadius), okH: ok.getBoundingClientRect().height, cancelH: cancel ? cancel.getBoundingClientRect().height : 0,
      modal: el.matches(':modal'), focusIn: el.contains(document.activeElement), shadow: cs.boxShadow };
  }, danger);
  expect(css.modal, 'opened with showModal()').toBe(true);
  expect(css.radius).toBe('20px');
  expect(css.font).toMatch(/Bricolage Grotesque/);
  expect(css.bg).toBe(css.card);
  expect(css.shadow).not.toBe('none');
  expect(css.okBg).toBe(css.wantRgb);
  expect(css.okRadius).toBeGreaterThan(100);   // a pill (999px)
  expect(css.okH).toBeGreaterThanOrEqual(44); expect(css.cancelH).toBeGreaterThanOrEqual(44);
  expect(css.focusIn, 'focus is in the box').toBe(true);
}

test('1. Start with nobody in the room asks in the site\'s own box: Cancel and Escape start nothing, "Start anyway" starts', async ({ browser }) => {
  const host = await signedIn(browser, TEACHER);
  let native = 0; host.on('dialog', d => { native++; d.dismiss(); });
  await openRoom(host);
  const start = host.locator('#lv-controls [data-lv-act="start"]');
  await expect(start).toBeVisible();
  // Cancel: nothing starts, and the focus goes back to Start
  await start.click();
  const d = host.locator('dialog.ob-dialog[open]');
  await expect(d).toBeVisible();
  await expect(d.locator('.ob-dialog-text')).toHaveText('Nobody has joined yet. Start anyway?');
  await expect(d.locator('[data-ob="ok"]')).toHaveText('Start anyway');
  await expect(d.locator('[data-ob="cancel"]')).toHaveText('Cancel');
  await expect(d.locator('[data-ob="ok"]')).toBeFocused();
  await looksRight(host);
  await host.waitForTimeout(250);   // the box's short rise
  await shot(host, 'live-start-empty-light');
  await answerDialog(host, 'cancel');
  await expect(start).toBeFocused();
  await expect(start).toBeVisible();
  await expect(host.locator('body')).toHaveAttribute('data-phase', /^(lobby)?$/);
  // Escape: the same as Cancel (and the page's own S, P... keys don't fire behind it)
  await start.click();
  await expect(d).toBeVisible();
  await host.keyboard.press('Escape');
  await expect(host.locator('dialog.ob-dialog')).toHaveCount(0);
  await expect(start).toBeVisible();
  // dark
  await host.emulateMedia({ colorScheme: 'dark' });
  await start.click();
  await expect(d).toBeVisible();
  await looksRight(host);
  await host.waitForTimeout(250);
  await shot(host, 'live-start-empty-dark');
  await answerDialog(host, 'cancel');
  await host.emulateMedia({ colorScheme: 'light' });
  // a phone: the buttons stack, full width, nothing runs off the screen
  await host.setViewportSize({ width: 390, height: 844 });
  await start.click();
  await expect(d).toBeVisible(); await host.waitForTimeout(250);
  const box = await d.boundingBox(), ok = await d.locator('[data-ob="ok"]').boundingBox(), cancel = await d.locator('[data-ob="cancel"]').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(15); expect(box.x + box.width).toBeLessThanOrEqual(390 - 15);
  expect(ok.y).toBeLessThan(cancel.y);   // the main button on top
  expect(Math.round(ok.width)).toBe(Math.round(cancel.width));
  await host.waitForTimeout(250);
  await shot(host, 'live-start-empty-phone');
  await answerDialog(host, 'cancel');
  await host.setViewportSize({ width: 1280, height: 800 });
  await expect(host.locator('body')).toHaveAttribute('data-phase', /^(lobby)?$/);
  // OK: the game starts
  await start.click();
  await answerDialog(host, 'ok', { text: 'Nobody has joined yet' });
  await expect(start).toBeHidden();
  await expect(host.locator('body')).not.toHaveAttribute('data-phase', 'lobby');
  expect(native, 'the browser\'s own box never showed').toBe(0);
  await endRoom(host);
  await host.context().close();
});

test('2. deleting a game folder asks in the same box with a red Delete; Cancel keeps it; in Hebrew it reads right to left', async ({ browser }) => {
  const t = await signedIn(browser, TEACHER);
  const origin = new URL(t.url()).origin;
  const mk = async name => { const r = await t.request.post('/api/game-folders', { data: { name }, headers: { Origin: origin } }); expect(r.status(), await r.text()).toBe(200); return (await r.json()).redirect; };
  await t.goto(await mk('Fractions week'));
  const del = t.locator('form[data-api$="/delete"] button');
  await del.click();
  const d = t.locator('dialog.ob-dialog[open]');
  await expect(d).toBeVisible();
  await expect(d.locator('.ob-dialog-text')).toContainText('Fractions week');
  await expect(d.locator('[data-ob="ok"]')).toHaveText('Delete folder');   // the form's own button's words, without its 🗑️
  await expect(d.locator('[data-ob="ok"]')).toHaveClass(/btn-danger-solid/);
  await expect(d.locator('[data-ob="cancel"]')).toBeFocused();   // a delete: the safe answer has the focus
  await looksRight(t, { danger: true });
  await t.waitForTimeout(250);
  await shot(t, 'folder-delete-light');
  await answerDialog(t, 'cancel');
  await expect(del).toBeEnabled();
  expect(t.url()).toContain('/build/folders/');
  // a tap on the backdrop is Cancel too
  await del.click(); await expect(d).toBeVisible();
  await t.mouse.click(8, 8);
  await expect(t.locator('dialog.ob-dialog')).toHaveCount(0);
  expect(t.url()).toContain('/build/folders/');
  await t.emulateMedia({ colorScheme: 'dark' });
  await del.click(); await expect(d).toBeVisible();
  await looksRight(t, { danger: true });
  await t.waitForTimeout(250);
  await shot(t, 'folder-delete-dark');
  await Promise.all([t.waitForURL(/\/build(\?|$)/), answerDialog(t, 'ok')]);
  await t.context().close();
  // Hebrew on a phone: right to left, Cancel and Delete in Hebrew
  const he = await signedIn(browser, TEACHER, { locale: 'he', viewport: { width: 360, height: 740 } });
  const url = await (async () => { const r = await he.request.post('/api/game-folders', { data: { name: 'שבוע שברים' }, headers: { Origin: origin } }); return (await r.json()).redirect; })();
  await he.goto(`${url}${url.includes('?') ? '&' : '?'}lang=he`);
  await he.locator('form[data-api$="/delete"] button').click();
  const dh = he.locator('dialog.ob-dialog[open]');
  await expect(dh).toBeVisible();
  expect(await dh.evaluate(el => getComputedStyle(el).direction)).toBe('rtl');
  await expect(dh.locator('[data-ob="cancel"]')).toHaveText('ביטול');
  await he.waitForTimeout(250);
  await shot(he, 'folder-delete-he-phone');
  await Promise.all([he.waitForURL(/\/build(\?|$)/), answerDialog(he, 'ok')]);
  await he.goto('/build?lang=en');   // ?lang= is remembered for the account: back to English for the other specs
  await he.context().close();
});

/** Every control button in the side panel: one height, its words on one line, nothing cut off. */
async function tidy(host, label) {
  const r = await host.locator('#lv-controls').evaluate(el => [...el.querySelectorAll('.lv-ctl-main .btn, .lv-ctl-grid .btn, .lv-msg-send')].filter(b => b.offsetParent).map(b => {
    const rc = b.getBoundingClientRect();
    return { t: b.textContent.trim(), h: Math.round(rc.height), cut: b.scrollWidth > b.clientWidth + 1 };
  }));
  expect(r.length, label).toBeGreaterThan(5);
  const hs = new Set(r.filter(x => x.t !== '').map(x => x.h));
  expect([...hs], `${label}: one height ${JSON.stringify(r)}`).toHaveLength(1);
  for (const b of r) { expect(b.cut, `${label}: "${b.t}" is cut off`).toBe(false); expect(b.h, `${label}: "${b.t}"`).toBeGreaterThanOrEqual(44); expect(b.h, `${label}: "${b.t}" wraps`).toBeLessThan(60); }
  expect(await host.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label} scrolls sideways`).toBeLessThanOrEqual(0);
}

test('3. the side panel: no quick messages; a typed message to everyone reaches a player; tidy at 1280, 1440 and a tablet', async ({ browser }) => {
  const host = await signedIn(browser, TEACHER);
  const code = await openRoom(host);
  // the quick messages are gone: no menu, no ▶ triangle, no preset buttons
  await expect(host.locator('#lv-say, details.lv-say, [data-lv-say]')).toHaveCount(0);
  await expect(host.locator('#lv-controls summary')).toHaveCount(0);
  for (const old of ['2 minutes left!', 'Great teamwork!', 'Remember to be kind']) await expect(host.locator('#lv-controls')).not.toContainText(old);
  // the order: join box, the main row (Start in Mint, End game in Danger), the grid, the message box
  await expect(host.locator('.lv-ctl-main [data-lv-act="start"]')).toHaveClass(/btn-primary/);
  await expect(host.locator('.lv-ctl-main [data-lv-act="end"]')).toHaveClass(/btn-danger/);
  for (const a of ['lock', 'eyes', 'settings', 'sound', 'dash']) await expect(host.locator(`.lv-ctl-grid [data-lv-act="${a}"]`)).toBeVisible();
  const label = host.locator('label[for="lv-msg-in"]');
  await expect(label).toHaveText('Message to everyone');
  await expect(host.locator('#lv-msg-in')).toHaveAttribute('maxlength', '120');
  const send = host.locator('#lv-msg .lv-msg-send');
  await expect(send).toHaveText('Send to everyone');
  await expect(send).toBeDisabled();   // empty: nothing to send
  await host.fill('#lv-msg-in', '   ');
  await expect(send).toBeDisabled();
  for (const [w, h] of [[1280, 800], [1440, 900], [820, 1180]]) {
    await host.setViewportSize({ width: w, height: h });
    await tidy(host, `${w} light`);
    await host.locator('#lv-controls').screenshot({ path: SHOTS ? path.join(SHOTS, `console-${w}-light.png`) : undefined });
  }
  await host.emulateMedia({ colorScheme: 'dark' });
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await host.setViewportSize({ width: w, height: h });
    await tidy(host, `${w} dark`);
    await host.locator('#lv-controls').screenshot({ path: SHOTS ? path.join(SHOTS, `console-${w}-dark.png`) : undefined });
  }
  await host.emulateMedia({ colorScheme: 'light' });
  await host.setViewportSize({ width: 1280, height: 800 });
  await shot(host, 'console-page-1280-lobby');
  // a player joins; the host types a message and presses Enter
  const p = await player(browser, code);
  await expect(host.locator('#lv-roster li')).toHaveCount(1);
  await host.fill('#lv-msg-in', 'Pencils down, eyes on the board!');
  await expect(send).toBeEnabled();
  await host.press('#lv-msg-in', 'Enter');
  await expect(p.locator('#lv-say-banner')).toBeVisible();
  await expect(p.locator('#lv-say-banner')).toHaveText('Pencils down, eyes on the board!');
  await expect(host.locator('#lv-msg-note')).toHaveText('Sent to everyone.');
  await expect(host.locator('#lv-msg-in')).toHaveValue('');
  await shot(p, 'console-message-on-phone');
  await shot(host, 'console-message-sent-1280');
  // a rude one is refused, to the host only; the player sees nothing new
  await host.waitForTimeout(3100);   // one message every 3 s
  await host.fill('#lv-msg-in', 'you are a bitch');
  await send.click();
  await expect(host.locator('#lv-msg-note')).toHaveText("That message can't be sent. Try other words.");
  await expect(p.locator('#lv-say-banner')).not.toContainText('bitch');
  // the button works too, once playing (the main row now holds Pause, Next, Skip and End game, still tidy)
  await host.locator('.lv-ctl-main [data-lv-act="start"]').click();
  await expect(host.locator('.lv-ctl-main [data-lv-act="pause"]')).toBeVisible();
  await host.fill('#lv-msg-in', 'Last question coming up');
  await send.click();
  await expect(p.locator('#lv-say-banner')).toHaveText('Last question coming up');
  await tidy(host, '1280 playing');
  await host.locator('#lv-controls').screenshot({ path: SHOTS ? path.join(SHOTS, 'console-1280-playing.png') : undefined });
  // the Teacher view's Messages tab: the same box, no presets
  const sid = new URL(host.url()).pathname.split('/').pop();
  const dash = await host.context().newPage();
  await dash.setViewportSize({ width: 390, height: 844 });
  await dash.goto(`/live/host/${sid}/dash`);
  if (await dash.locator('#lv-dash-notice').isVisible()) await dash.click('#lv-dash-notice-ok');
  await dash.click('#lv-tab-messages-btn');
  await expect(dash.locator('#lv-tab-messages [data-lv-say]')).toHaveCount(0);
  await expect(dash.locator('label[for="lv-dash-msg-in"]')).toHaveText('Message to everyone');
  await host.waitForTimeout(3100);
  await dash.fill('#lv-dash-msg-in', 'Two minutes left');
  await dash.locator('#lv-dash-msg .lv-msg-send').click();
  await expect(p.locator('#lv-say-banner')).toHaveText('Two minutes left');
  await expect(dash.locator('#lv-dash-msg-note')).toHaveText('Sent to everyone.');
  await shot(dash, 'teacher-view-messages-phone');
  await dash.close();
  await endRoom(host);
  await p.context().close(); await host.context().close();
});
