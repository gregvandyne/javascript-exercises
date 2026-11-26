// Manipulatives: starting a live room from the Manipulatives page for a class whose Homeroom tool is on the students'
// desks asks first (the site's own question box, never the browser's confirm()): Cancel leaves the desks as they were,
// Start room ends that room and takes its card off the desks (their work is kept). With no Homeroom tool on the desks,
// the room starts with no question. The route: POST /api/manipulatives/live answers 409 homeroomTool unless { replace:
// true }. Screenshot of the question with WARN_SHOT=<file>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { createApp } = await import('../../server/app.js');
const { attachUpgrades } = await import('../../server/services/upgrade.js');
const classlive = await import('../../server/services/classlive-socket.js');
const manipSocket = await import('../../server/services/manip-socket.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HT = await import('../../server/services/homeroom-tools.js');
const M = await import('../../server/services/manipulatives.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HrwBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Warn Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Wren', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada' }).user.id); S.addToClass(boss, cls.id, kid.id);
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
const cards = () => HT.deskCards(cls, kid);
const active = () => M.hostSessions(teacher).filter(s => s.status === 'active');

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  attachUpgrades(server, [classlive.route, manipSocket.route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function openHome() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = [], native = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => { native.push(d.type()); d.dismiss(); });
  await page.goto(`${BASE}/manipulatives`);
  await page.waitForSelector('#mp-host');
  return { ctx, page, errors, native };
}
async function startFor(page, tool) {
  await page.selectOption('#mp-host select[name="classId"]', cls.id);
  await page.selectOption('#mp-host select[name="tool"]', tool);
  await page.click('#mp-host button[type="submit"]');
}

test('starting a room for a class with a Homeroom tool on the desks asks first; Cancel keeps it, Start room replaces it', { skip }, async () => {
  const given = HT.handOutTool(teacher, cls, { tool: 'rekenreks', to: { kind: 'all' } });
  assert.ok(given.ok, JSON.stringify(given));
  assert.equal(cards().length, 1); assert.ok(cards()[0].ready);
  const hrSession = given.session.id;

  const T = await openHome();
  try {
    // Cancel: the site's own box, with the tool's name; nothing changes on the desks or in the room.
    await startFor(T.page, 'money');
    const dlg = T.page.locator('dialog.ob-dialog');
    await dlg.waitFor();
    const text = await dlg.locator('.ob-dialog-text').textContent();
    assert.match(text, /Rekenrek/i); assert.match(text, /Hub desks/); assert.match(text, /Their work is kept/);
    assert.equal((await dlg.locator('[data-ob="ok"]').textContent()).trim(), 'Start room');
    assert.equal((await dlg.locator('[data-ob="cancel"]').textContent()).trim(), 'Cancel');
    if (process.env.WARN_SHOT) { await T.page.waitForTimeout(600); await T.page.screenshot({ path: process.env.WARN_SHOT }); }
    await dlg.locator('[data-ob="cancel"]').click();
    await dlg.waitFor({ state: 'detached' });
    assert.equal(cards().length, 1, 'Cancel: the card stays on the desk'); assert.ok(cards()[0].ready);
    assert.deepEqual(active().map(s => s.id), [hrSession], 'Cancel: the Homeroom room still runs, no new room');
    assert.ok(!(await T.page.evaluate(() => location.hash)).startsWith('#live/'));

    // Start room: the new room runs, the Homeroom tool comes off the desks.
    await startFor(T.page, 'money');
    await dlg.waitFor();
    await dlg.locator('[data-ob="ok"]').click();
    await T.page.waitForFunction(() => location.hash.startsWith('#live/'));
    const now = active();
    assert.equal(now.length, 1); assert.notEqual(now[0].id, hrSession); assert.equal(now[0].tool, 'money');
    assert.equal(cards().length, 0, 'confirmed: the Homeroom tool is off the desks');
    assert.deepEqual(T.native, [], 'never the browser\'s own dialogs');
    assert.deepEqual(T.errors, []);
  } finally { await T.ctx.close(); }
});

test('no Homeroom tool on the desks: the room starts with no question', { skip }, async () => {
  assert.equal(cards().length, 0);
  const before = active().map(s => s.id);
  const T = await openHome();
  try {
    await startFor(T.page, 'clock');
    await T.page.waitForFunction(() => location.hash.startsWith('#live/'));
    assert.equal(await T.page.locator('dialog.ob-dialog').count(), 0);
    const now = active();
    assert.equal(now.length, 1); assert.ok(!before.includes(now[0].id)); assert.equal(now[0].tool, 'clock');
    assert.deepEqual(T.native, []); assert.deepEqual(T.errors, []);
  } finally { await T.ctx.close(); }
});

test('the route: 409 homeroomTool with the tool\'s name unless { replace: true }', { skip }, async () => {
  const given = HT.handOutTool(teacher, cls, { tool: 'rekenreks', to: { kind: 'all' } });
  assert.ok(given.ok, JSON.stringify(given));
  const post = b => fetch(`${BASE}/api/manipulatives/live`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieOf(teacher.id) }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, json: await r.json() }));
  const no = await post({ classId: cls.id, tool: 'money' });
  assert.equal(no.status, 409); assert.equal(no.json.code, 'homeroomTool'); assert.match(no.json.tool, /Rekenrek/i);
  assert.equal(cards().length, 1);
  const yes = await post({ classId: cls.id, tool: 'money', replace: true });
  assert.equal(yes.status, 200, JSON.stringify(yes.json)); assert.ok(yes.json.session.id);
  assert.equal(cards().length, 0);
});
