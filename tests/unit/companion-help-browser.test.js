// Oomba companion in a real browser: how-to answers with links, Create class and Copy (docs/decisions.md "Oomba
// companion: how-to answers with links, Create class and Copy"). On a laptop and an iPhone 13:
//   - a teacher with no classes asks "Can you make me a test classroom so I can check out your dashboard?": a Create
//     card; Create makes the class; Open its dashboard opens it (same tab); Undo there deletes the empty class;
//   - where only admins may make classes, the same ask gives numbered steps whose links open real pages (200);
//   - "How do I add students?" gives numbered steps with links; a link opens its page in the same tab and the
//     conversation is still there; Copy puts the clean text on the clipboard and says "Copied".
// No console errors, no sideways scroll. The AI is a stand-in (services/companion.js hooks.create).
// COMPANION_HELP_SHOTS=<dir> also saves pictures (light and dark).
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
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.COMPANION_HELP_SHOTS || '';

const boss = createUser({ username: 'HelpBrowserBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
const elm = S.createSchool(boss, { name: 'Maple Street School' }).school;
S.updateSchool(boss, elm.id, { settings: { teachersCreateClasses: false } });
function teacher(name, { school = oak, role = 'admin', classes = [] } = {}) {
  const u = getUser(S.createSchoolAccount(boss, school.id, { rosterName: name, role }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const cs = classes.map((c, i) => S.createClass(boss, school.id, { name: c, grade: String(3 + i), teacherId: u.id }).class);
  return { u, cs };
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const MAKE = 'Can you make me a test classroom so I can check out your dashboard?';
const HOW = 'How do I add students?';

/** The stand-in AI: a class ask calls createClass (its steps when that isn't allowed); a how-to calls howTo. */
function ai() {
  CO.hooks.create = async p => {
    const last = p.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const said = [...p.messages].reverse().find(m => m.role === 'user' && (typeof m.content === 'string' || m.content.some(c => c.type === 'text')));
    const words = JSON.stringify(said ? said.content : '');
    const base = { model: p.model, usage: { input_tokens: 5, output_tokens: 5 } };
    const tool = (name, input) => ({ ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${Math.random().toString(36).slice(2, 8)}`, name, input }] });
    const text = s => ({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
    if (afterTool) {
      const r = JSON.parse(last.content.find(c => c.type === 'tool_result').content);
      if (r.steps) return text(`${r.error ? 'I can\'t make classes at your school, but here is how to get one:' : 'Here is how:'}\n${r.steps.join('\n')}`);
      return text('I can make a test class for you right now. Tap Create, then open its dashboard.');
    }
    return /test classroom/.test(words) ? tool('createClass', {}) : tool('howTo', { task: 'add-students' });
  };
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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }, { name: 'theme', value: dark ? 'dark' : 'light', url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
async function say(page, words) {
  if (!(await page.locator('#oc:not([hidden])').isVisible())) await page.click('#oc-bubble');
  await page.fill('#oc-in', words);
  await page.click('#oc-send');
}

const RUNS = [['laptop', LAPTOP, false], ['iPhone 13 (dark)', null, true], ...(SHOTS ? [['laptop (dark)', LAPTOP, true], ['iPhone 13', null, false]] : [])];
for (const [label, opts, dark] of RUNS) {
  const tag = `${label.startsWith('laptop') ? '1440' : '390'}${dark ? 'd' : ''}`;
  test(`${label}: "make me a test classroom": Create, the class is made, Open its dashboard, Undo deletes it`, { skip }, async () => {
    const { u } = teacher(`Greg New${tag}`);
    ai();
    const { ctx, page, errors } = await open(u, '/teach?all=1', opts || PHONE(), dark);
    try {
      await say(page, MAKE);
      const card = page.locator('.oc-cls:not(.done)');
      await card.waitFor({ timeout: 15000 });
      assert.match(await card.textContent(), /Create the class “Test class”\?/);
      assert.equal(S.classesOf(u.id, 'teacher').length, 0, 'nothing before the tap');
      await noSideScroll(page);
      await shot(page, `create-${tag}`);
      await card.locator('[data-act="create"]').click();
      const openDash = page.locator('.oc-change button.oc-open[data-act="go"]');
      await openDash.waitFor({ timeout: 15000 });
      const made = S.classesOf(u.id, 'teacher');
      assert.equal(made.length, 1); assert.equal(made[0].name, 'Test class');
      assert.match(await page.locator('.oc-change').last().textContent(), /Made the class Test class/);
      await shot(page, `created-${tag}`);
      await Promise.all([page.waitForURL(new RegExp(`/class/${made[0].id}/dashboard`)), openDash.click()]);
      await page.locator('#oc:not([hidden])').waitFor({ timeout: 10000 });
      const undo = page.locator('.oc-change button', { hasText: 'Undo' }).last();
      await undo.waitFor();
      await Promise.all([page.waitForURL(/\/teach\?all=1/), undo.click()]);
      assert.equal(S.getClass(made[0].id), null, 'Undo deleted the empty class');
      await noSideScroll(page);
      assert.deepEqual(errors.filter(e => !/fullscreen|Permissions check failed/i.test(e)), []);
    } finally { await C.allSettled(); CO.reset(u); await ctx.close(); }
  });

  test(`${label}: "How do I add students?": numbered steps with links that open in the same tab; Copy puts the clean text on the clipboard`, { skip }, async () => {
    const { u, cs } = teacher(`Gina How${tag}`, { classes: [`4A ${tag}`] });
    ai();
    const { ctx, page, errors } = await open(u, '/read', opts || PHONE(), dark);
    try {
      await say(page, HOW);
      const ol = page.locator('.oc-msg.bot .oc-ol').last();
      await ol.waitFor({ timeout: 15000 });
      assert.ok(await ol.locator('li').count() >= 3, 'numbered steps');
      const href = await ol.locator('a').first().getAttribute('href');
      assert.equal(href, `/class/${cs[0].id}?tab=students`);
      assert.equal(await ol.locator('a').first().getAttribute('target'), null, 'same tab');
      assert.match(await ol.textContent(), /Create accounts and login cards/);
      assert.equal(await page.locator('.oc-msg.me .oc-copy').count(), 0, 'no Copy on the teacher\'s own words');
      const copy = page.locator('.oc-msg.bot .oc-copy').last();
      assert.equal(await copy.getAttribute('aria-label'), 'Copy');
      await copy.click();
      await page.locator('.oc-copied', { hasText: 'Copied' }).last().waitFor();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(clip, new RegExp(`^Here is how:\\n1\\. Open your class's Students tab \\(${BASE.replace(/[.]/g, '\\.')}/class/${cs[0].id}\\?tab=students\\)\\.\\n2\\. `));
      assert.doesNotMatch(clip, /\*\*|Copy|Copied|\[|\]/);
      await noSideScroll(page);
      await shot(page, `howto-${tag}`);
      // The link: same tab, a real page, the conversation still there.
      await Promise.all([page.waitForURL(new RegExp(`/class/${cs[0].id}\\?tab=students`)), ol.locator('a').first().click()]);
      assert.equal((await page.evaluate(() => document.title)).includes('404'), false);
      if (!(await page.locator('#oc:not([hidden])').isVisible())) await page.click('#oc-bubble');
      await page.locator('.oc-msg.bot .oc-ol').last().waitFor();
      assert.deepEqual(errors, []);
    } finally { await C.allSettled(); CO.reset(u); await ctx.close(); }
  });

  test(`${label}: where only admins make classes, the same ask gives numbered steps whose links open (200)`, { skip }, async () => {
    const { u } = teacher(`Pat Plain${tag}`, { school: elm, role: 'teacher' });
    ai();
    const { ctx, page, errors } = await open(u, '/teach?all=1', opts || PHONE(), dark);
    try {
      await say(page, MAKE);
      const ol = page.locator('.oc-msg.bot .oc-ol').last();
      await ol.waitFor({ timeout: 15000 });
      assert.equal(await page.locator('.oc-cls').count(), 0, 'no Create card');
      assert.match(await ol.textContent(), /school admin/);
      const hrefs = await ol.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      assert.ok(hrefs.length >= 1);
      for (const h of hrefs) assert.equal(await page.evaluate(async x => (await fetch(x)).status, h), 200, h);
      await shot(page, `denied-${tag}`);
      assert.deepEqual(errors, []);
    } finally { await C.allSettled(); CO.reset(u); await ctx.close(); }
  });
}
