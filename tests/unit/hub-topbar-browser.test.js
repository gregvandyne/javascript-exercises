// The Hub's top bar stays on one row at desktop widths, in a real browser (public/css/class-views.css, public/js/class-views.js
// fit()): with today's day plan running (the plan pill), a live game going (the "Live: <Game> N joined of M" pill) and
// the Oomba chat open beside the page, at 1440 x 716, 1280 x 720 and 1024 x 768, the Hub / Classroom / Dashboard tabs
// share the class switcher's row, the bar is one row tall, nothing scrolls sideways, the live pill's End button and
// its count are whole, and the pills carry their full words in title and aria-label. Without the chat too, from 1024
// to 1920, and with the plan's yellow Time's up. Tablets (820) and phones (390) keep their own two-row bar.
// HUB_SHOTS=<dir> saves screenshots there. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.liveClassroom = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HP = await import('../../server/services/homeroom-plan.js');
const LG = await import('../../server/services/homeroom-livegame.js');
const LS = await import('../../server/services/classlive-sessions.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HUB_SHOTS || '';

const boss = createUser({ username: 'HtbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Top Bar Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Reyes', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9 Sunflowers', teacherId: teacher.id }).class;
S.createClass(boss, oak.id, { name: 'Room 10', teacherId: teacher.id });
const kids = ['Ada', 'Ben', 'Cleo', 'Dev'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
{
  const g = games.createGame(official.id, { title: 'Would You Rather Live' });
  const v = games.addVersion(g.id, fs.readFileSync('seed-games/would-you-rather-live.html', 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?`, v.id, 'would-you-rather-live', '🤔', g.id);
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

/** Today's plan, started (the plan pill: Now, the part, its clock, Next); a live game for the class, hosted by the
 *  teacher, with the class on their desks (the pill: "Live: Would You Rather Live 0 joined of 4 in the Hub"). */
function setUp() {
  const plan = HP.startingPlan(teacher, cls, { topic: 'Fractions and decimals on the number line' }).plan;
  assert.ok(HP.usePlan(teacher, cls, plan).ok, 'plan used');
  assert.ok(HP.runAction(teacher, cls, 'start').ok, 'plan started');
  const r = LS.createSession(teacher, { mode: 'wyr', audience: 'class', classId: cls.id });
  assert.ok(r.ok !== false, `live game: ${r.code}`);
}
// the class on their desks (the desk's poll says so; it counts for 25 s)
const onDesks = () => { for (const k of kids) LG.deskView(cls, k); };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  setUp();
});
test.after(async () => { for (const s of LS.openSessions()) LS.endSession(s.id); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function hub(viewport, { chat = true, up = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  onDesks();
  await page.goto(`${BASE}/class/${cls.id}/hub`);
  await page.waitForSelector(up ? '#hr-plan .hr-pp-run.up' : '#hr-plan .hr-pp-run');
  await page.waitForSelector('#hr-lgpill', { timeout: 15000 });
  await page.waitForFunction(() => /joined of 4/.test(document.getElementById('hr-lgpill').textContent), null, { timeout: 15000 });
  if (chat) {
    await page.click('#oc-bubble:visible, [data-hrplan="ask"]:visible');
    await page.waitForSelector('#oc:not([hidden])');
  }
  // the plan pill's clock ticks (the bar is fitted again on every change): let a few ticks go by
  await page.waitForTimeout(2200);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  return { ctx, page, errors };
}
const measure = page => page.evaluate(() => {
  const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
  const bar = document.getElementById('cv-bar');
  const lg = document.getElementById('hr-lgpill'), pp = document.querySelector('#hr-plan .hr-planpill');
  const whole = el => { if (!el) return false; const b = el.getBoundingClientRect(), a = bar.getBoundingClientRect(); return b.width > 0 && b.left >= a.left - 1 && b.right <= a.right + 1 && el.scrollWidth <= el.clientWidth + 1; };
  return {
    cls: bar.className, bar: r('#cv-bar'), sw: r('#hr-class'), tabs: r('#cv-bar .hr-tabs'), lg: r('#hr-lgpill'), plan: r('#hr-plan .hr-planpill'),
    sideways: document.documentElement.scrollWidth - innerWidth, barOver: bar.scrollWidth - bar.clientWidth,
    acts: (() => { const a = document.querySelector('.cv-acts-homeroom'); return a.scrollWidth - a.clientWidth; })(),
    endWhole: whole(lg && lg.querySelector('.hr-lgx')),
    // the count: "0 joined of 4 in the Hub", or "0/4" on a short bar; whole, never cut off by the name's ellipsis
    count: (() => { const el = lg && [...lg.querySelectorAll('.hr-lgn, .hr-lgnum')].find(x => x.getBoundingClientRect().width > 0); if (!el) return ''; const b = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 ? el.textContent : ''; })(),
    lgTitle: lg && lg.querySelector('.hr-lgopen').getAttribute('title'), lgLabel: lg && lg.querySelector('.hr-lgopen').getAttribute('aria-label'),
    ppTitle: pp && pp.getAttribute('title'), ppLabel: pp && pp.getAttribute('aria-label'),
    // the bar's buttons, left to right: none over another
    overlap: (() => { const l = [...bar.querySelectorAll('.cv-acts-homeroom button, .cv-acts-homeroom .hr-lgpill, #hr-class, .hr-tabs')].filter(x => !x.closest('.hr-lgpill') || x.matches('.hr-lgpill')).map(x => x.getBoundingClientRect()).filter(b => b.width).sort((a, b) => a.left - b.left);
      return l.some((b, i) => i && b.left < l[i - 1].right - 1); })(),
  };
});
const ONE_ROW = 76;   // the bar's one-row height (71 px, its min-height) and a few px to spare
function assertOneRow(m, label) {
  assert.ok(Math.abs(m.tabs.top - m.sw.top) <= 4 || Math.abs((m.tabs.top + m.tabs.bottom) / 2 - (m.sw.top + m.sw.bottom) / 2) <= 4, `${label}: the tabs share the switcher's row (tabs ${m.tabs.top}, switcher ${m.sw.top}; ${m.cls})`);
  assert.ok(m.bar.height <= ONE_ROW, `${label}: the bar is one row (${m.bar.height}px; ${m.cls})`);
  assert.ok(m.sideways <= 0, `${label}: nothing sideways (${m.sideways})`);
  assert.ok(m.barOver <= 1 && m.acts <= 1, `${label}: nothing overflows the bar (${m.barOver}, ${m.acts})`);
  assert.ok(m.lg && m.lg.top >= m.bar.top && m.lg.bottom <= m.bar.bottom, `${label}: the live pill is in the bar`);
  assert.ok(m.plan && m.plan.right <= m.bar.right + 1, `${label}: the plan pill is in the bar`);
  assert.ok(!m.overlap, `${label}: no button over another`);
}

for (const [w, h] of [[1440, 716], [1280, 720], [1024, 768]]) {
  test(`${w} x ${h}, the plan pill, the live pill and the chat open: one row, nothing sideways`, { timeout: 120000 }, async t => {
    if (skip) return t.skip(skip);
    const { ctx, page, errors } = await hub({ width: w, height: h });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/hub-topbar-${w}-chat.png` });
    const m = await measure(page);
    assertOneRow(m, `${w} chat`);
    assert.ok(m.endWhole, `${w}: End is whole`);
    assert.match(m.count, /^(0 joined of 4 in the Hub|0\/4)$/, `${w}: the count shows, whole`);
    assert.match(m.lgTitle || '', /Live: Would You Rather Live[\s\S]*0 joined of 4/, 'the full words in a title');
    assert.match(m.lgLabel || '', /Would You Rather Live[\s\S]*0 joined of 4/, 'and read out');
    assert.ok(m.ppTitle && m.ppLabel, 'the plan pill has a title and a label');
    // the plan pill ticks on: still one row a few seconds later
    await page.waitForTimeout(1500);
    assertOneRow(await measure(page), `${w} chat, later`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('Time\'s up (the plan pill in yellow, no clock), the chat open, 1280 and 1024: one row, no button over another', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  // the running part started 12 minutes ago (as if class had gone on): written where the server keeps it
  const r = q.get('SELECT day_plan FROM homeroom_rooms WHERE class_id=?', cls.id), p = JSON.parse(r.day_plan);
  const keep = r.day_plan, shift = 12 * 60e3 - (Date.now() - p.run.partAt);
  p.run.partAt -= shift; p.run.startedAt -= shift; p.usedAt -= shift;
  q.run('UPDATE homeroom_rooms SET day_plan=? WHERE class_id=?', JSON.stringify(p), cls.id);
  try {
    for (const [w, h] of [[1280, 720], [1024, 768]]) {
      const { ctx, page, errors } = await hub({ width: w, height: h }, { up: true });
      const m = await measure(page);
      assertOneRow(m, `${w} time's up`);
      assert.ok(m.endWhole, `${w}: End is whole`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { q.run('UPDATE homeroom_rooms SET day_plan=? WHERE class_id=?', keep, cls.id); }
});

test('without the chat, 1024 to 1920: one row', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [w, h] of [[1920, 1080], [1440, 716], [1280, 720], [1024, 768]]) {
    const { ctx, page, errors } = await hub({ width: w, height: h }, { chat: false });
    if (SHOTS && w === 1440) await page.screenshot({ path: `${SHOTS}/hub-topbar-${w}-nochat.png` });
    const m = await measure(page);
    assertOneRow(m, `${w}`);
    assert.ok(m.endWhole, `${w}: End is whole`);
    assert.match(m.count, /^(0 joined of 4 in the Hub|0\/4)$/, `${w}: the count shows, whole`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('a tablet (820) and a phone (390) keep their own bar: the tabs on a row of their own, nothing sideways', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [w, h] of [[820, 1180], [390, 844]]) {
    const { ctx, page, errors } = await hub({ width: w, height: h }, { chat: false });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/hub-topbar-${w}.png` });
    const m = await measure(page);
    assert.ok(m.tabs.top >= m.sw.bottom - 2, `${w}: the tabs under the switcher`);
    assert.ok(m.sideways <= 0, `${w}: nothing sideways`);
    assert.ok(m.endWhole || w < 820, `${w}: End is whole`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
