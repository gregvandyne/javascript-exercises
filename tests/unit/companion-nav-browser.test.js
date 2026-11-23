// Oomba companion in a real browser: the greeting, navigate-then-do and choice cards (docs/decisions.md "Oomba
// companion: navigate-then-do and choice cards"). On a laptop and an iPhone 13: the empty panel greets the teacher by
// their own name and shows no example prompts; from the School page "add a 5 minute timer and class jobs to my
// dashboard" (one class) shows a Go there card; Go there opens the dashboard, the panel opens by itself there and the
// dashboard's confirm card appears without retyping; Apply, then Undo. With two classes a choice card comes first; Not
// now leaves nothing pending. No console errors, no sideways scroll. The AI is a stand-in (services/companion.js
// hooks.create). COMPANION_NAV_SHOTS=<dir> also saves pictures (light and dark).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.COMPANION_NAV_SHOTS || '';

const boss = createUser({ username: 'NavBrowserBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
function teacher(name, classes) {
  const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: name, role: 'admin' }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const cs = classes.map((c, i) => S.createClass(boss, school.id, { name: c, grade: String(3 + i), teacherId: u.id }).class);
  for (const c of cs) for (const n of ['Bouncy Owl', 'Jolly Dolphin', 'Ada Park']) { const k = S.createSchoolAccount(boss, school.id, { rosterName: `${n} K${c.id}` }).user; S.addToClass(boss, c.id, k.id); }
  return { u, cs };
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const ASK = 'add a 5 minute timer and class jobs to my dashboard';

/** The stand-in AI: on the School page it offers the dashboard; on the dashboard it proposes the change. */
function ai() {
  const calls = [];
  CO.hooks.create = async p => {
    calls.push(p);
    const afterTool = Array.isArray(p.messages.at(-1).content) && p.messages.at(-1).content.some(c => c.type === 'tool_result');
    const base = { model: p.model, usage: { input_tokens: 5, output_tokens: 5 } };
    const tool = (name, input) => ({ ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name, input }] });
    const text = s => ({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
    if (/"dashboard" page/.test(p.system)) return afterTool ? text('Here is the change for your dashboard:') : tool('proposeDashboardChange', { changes: [{ op: 'add', type: 'timer', settings: { minutes: 5 } }, { op: 'add', type: 'jobs' }] });
    return afterTool ? text('I can do that on your dashboard.') : tool('proposeNavigation', { pageType: 'dashboard' });
  };
  return calls;
}

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { CO.hooks.create = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => RL._reset());

const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
async function open(who, p, ctxOpts, dark) {
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: dark ? 'dark' : 'light' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }, { name: 'theme', value: dark ? 'dark' : 'light', url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');

// Pictures want both themes at both sizes; a plain run checks a laptop (light) and an iPhone 13 (dark).
const RUNS = [['laptop', LAPTOP, false], ['iPhone 13 (dark)', null, true], ...(SHOTS ? [['laptop (dark)', LAPTOP, true], ['iPhone 13', null, false]] : [])];
for (const [label, opts, dark] of RUNS) {
  const tag = `${label.startsWith('laptop') ? '1440' : '390'}${dark ? 'd' : ''}`;
  test(`${label}: a greeting with no example prompts; "add a timer and class jobs to my dashboard" from the School page: Go there, the request continues there, Apply, Undo`, { skip }, async () => {
    const one = teacher(`Greg ${tag}`, [`3B ${tag}`]);
    ai();
    const { ctx, page, errors } = await open(one.u, `/school/${school.slug}`, opts || PHONE(), dark);
    try {
      await page.click('#oc-bubble');
      await page.locator('.oc-greet').waitFor();
      assert.match(await page.textContent('.oc-greet b'), /Greg/, 'the teacher\'s own name');
      assert.equal(await page.locator('#oc .oc-chips').count(), 0, 'no example prompts');
      assert.doesNotMatch(await page.textContent('#oc-log'), /Find a game|Hi! I'm Oomba/);
      await noSideScroll(page);
      await shot(page, `greet-${tag}`);
      await page.fill('#oc-in', ASK);
      await page.click('#oc-send');
      const card = page.locator('.oc-nav:not(.done)');
      await card.waitFor({ timeout: 15000 });
      assert.match(await card.textContent(), new RegExp(`open the 3B ${tag} dashboard and do this there`));
      await noSideScroll(page);
      await shot(page, `go-there-${tag}`);
      await Promise.all([page.waitForURL(new RegExp(`/class/${one.cs[0].id}/dashboard`)), card.locator('[data-act="go"]').click()]);
      // There: the panel opens by itself and the same request continues; the confirm card appears without retyping.
      const apply = page.locator('.oc-prop button', { hasText: 'Apply' });
      await apply.waitFor({ timeout: 20000 });
      assert.ok(await page.locator('#oc:not([hidden])').isVisible());
      assert.match(await page.locator('.oc-msg.me').last().textContent(), /add a 5 minute timer and class jobs/);
      await shot(page, `resumed-${tag}`);
      const lid = D.currentLayout(one.u, one.cs[0]).id;
      const sum = () => JSON.stringify(D.getLayout(lid).widgets.map(w => [w.type, w.s && w.s.minutes]));
      const before = sum();
      const jobs0 = D.getLayout(lid).widgets.filter(w => w.type === 'jobs').length;
      await apply.click();
      await page.waitForLoadState('load');
      await page.locator('.oc-change button', { hasText: 'Undo' }).waitFor({ timeout: 15000 });
      const after = D.getLayout(lid).widgets;
      assert.ok(after.some(w => w.type === 'timer' && w.s.minutes === 5), 'a 5 minute timer');
      assert.equal(after.filter(w => w.type === 'jobs').length, Math.max(1, jobs0), 'class jobs');
      assert.notEqual(sum(), before, 'the dashboard changed');
      await page.locator('.oc-change button', { hasText: 'Undo' }).click();
      await page.waitForLoadState('load'); await page.waitForTimeout(800);
      assert.equal(sum(), before, 'Undo put it back');
      assert.deepEqual(errors.filter(e => !/fullscreen|Permissions check failed/i.test(e)), []);
    } finally { await C.allSettled(); CO.reset(one.u); await ctx.close(); }
  });

  test(`${label}: with two classes a choice card comes first; the tap makes the Go there card; Not now leaves nothing pending`, { skip }, async () => {
    const two = teacher(`Gina ${tag}`, [`4A ${tag}`, `5C ${tag}`]);
    ai();
    const { ctx, page, errors } = await open(two.u, `/school/${school.slug}`, opts || PHONE(), dark);
    try {
      await page.click('#oc-bubble');
      await page.fill('#oc-in', ASK);
      await page.click('#oc-send');
      const ask = page.locator('.oc-ask:not(.done)');
      await ask.waitFor({ timeout: 15000 });
      assert.match(await ask.textContent(), /Which class's dashboard\?/);
      assert.equal(await ask.locator('[data-act="askPick"]').count(), 2);
      assert.equal(await ask.locator('[data-act="askOther"]').count(), 1, 'Something else');
      await noSideScroll(page);
      await shot(page, `choice-${tag}`);
      await ask.locator('[data-act="askPick"]', { hasText: `5C ${tag}` }).click();
      const card = page.locator('.oc-nav:not(.done)');
      await card.waitFor({ timeout: 15000 });
      assert.match(await card.textContent(), new RegExp(`5C ${tag}`));
      await card.locator('[data-act="notNow"]').click();
      await page.locator('.oc-nav.done').waitFor();
      const r = await page.evaluate(async () => (await fetch('/api/companion/chat?peek=1')).json());
      assert.equal(r.pending, false, 'nothing pending');
      assert.match(page.url(), /\/school\//, 'still here');
      assert.deepEqual(errors, []);
    } finally { await C.allSettled(); CO.reset(two.u); await ctx.close(); }
  });
}
