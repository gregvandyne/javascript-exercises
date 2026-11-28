// The Builder in the chat and Studio: audit 5 fixes, in a real browser (docs/decisions.md "Builder in the chat and
// Studio: audit 5 fixes"), with the arcade side off as on the live site:
//   - /build: a teacher's draft card has Play and Assign; Assign's page says it shares it with the class picked only,
//     and its Assign shares it with that class (never public) and assigns it;
//   - Studio, for a game made in the chat: no "Make it a live game" (a plain classroom game cannot be live, and an
//     offer that only refuses is never shown), and an Oomba Canvas game says "Game · on the board" and "Edit game".
// Laptop 1280x800 light and a 390 px phone dark.
process.env.ARCADE = '0';
await import('./_setup.js');
const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const fs = (await import('node:fs')).default;

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.liveClassroom = true;
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const PT = await import('../../server/services/playthrough.js');
const { templateHtml } = await import('../../server/builder/catalog.js');
const { q } = await import('../../server/db.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'A5Boss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Audit Five Oak' }).school;
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
let tn = 0;
function teacherNow() {
  const t = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Ms Vega ${++tn}`, role: 'teacher' }).user.id);
  TOOLS.givePlan(t.id);
  config.manipulativesUsers = [...(config.manipulativesUsers || []), t.username.toLowerCase()];
  q.run('UPDATE users SET builder_enabled=1 WHERE id=?', t.id);
  const cls = S.createClass(boss, oak.id, { name: '4b math', grade: '4', teacherId: t.id }).class;
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Lin' }).user.id); S.addToClass(boss, cls.id, u.id);
  return { t: getUser(t.id), cls };
}
const PLAIN = '<!doctype html><title>Farm Carry Stars</title><style>html,body{margin:0;background:#FFF6D8;font-family:system-ui}h1{padding:20px}</style><h1>Farm Carry Stars</h1><button>Carry</button><script>document.querySelector("button").onclick = () => BRB.gameOver({ won: true, score: 1 });</script>';
const gameOf = (u, html, title) => {
  const g = games.createGame(u.id, { title, icon: '🎮' });
  games.addVersion(g.id, html, { notes: 'Made it', createdBy: u.id, safetyStatus: 'pass' });
  return games.getGame(g.id);
};

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  PT.hooks.run = async () => ({ end: true, kind: 'free', ms: 900, score: 1 });
});
test.after(async () => { PT.hooks.run = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(viewport, scheme, user) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  const c = cookieOf(user.id);
  await ctx.addCookies([{ name: c.split('=')[0], value: c.split('=').slice(1).join('='), url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  return { ctx, page: p, errors };
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const [vp, scheme, label] of [[{ width: 1280, height: 800 }, 'light', 'laptop light'], [{ width: 390, height: 844 }, 'dark', 'phone dark']]) {
  test(`/build in Chromium, ${label}: a draft card has Play and Assign; Assign shares it with the class, then assigns it`, { skip, timeout: 120000 }, async () => {
    const { t, cls } = teacherNow();
    const g = gameOf(t, PLAIN, 'Farm Carry Stars');
    const { ctx, page: p, errors } = await open(vp, scheme, t);
    await p.goto(`${BASE}/build?view=all`);
    const card = p.locator(`li.shelf-game[data-id="${g.id}"]`);
    await card.waitFor();
    assert.equal(await card.locator(`a[href="/g/${g.slug}"]:has-text("Play")`).count(), 1, 'Play');
    const assign = card.locator(`a[href="/teach/assign?id=${g.id}"]`);
    assert.equal(await assign.count(), 1, 'Assign');
    assert.ok(await assign.isVisible());
    assert.ok(await noScroll(p), 'no sideways scroll');
    await assign.click();
    await p.waitForSelector('#ag-share');
    assert.match(await p.textContent('#ag-share'), /It isn't shared with a class yet\. Assign shares it only with the class you pick \(never with everyone\), then assigns it\./);
    assert.equal(games.getGame(g.id).status, 'draft', 'nothing shared before Assign');
    await p.click('#ag-go');
    await p.waitForURL(new RegExp(`/class/${cls.id}`), { timeout: 15000 });
    const after = games.getGame(g.id);
    assert.equal(after.visibility, 'class'); assert.equal(games.gameLiveInClass(g.id, cls.id), true);
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  });

  test(`Studio in Chromium, ${label}: no live offer for a game that cannot be live; a Canvas game says game`, { skip, timeout: 120000 }, async () => {
    const { t } = teacherNow();
    const plain = gameOf(t, PLAIN, 'Farm Carry Stars');
    const { ctx, page: p, errors } = await open(vp, scheme, t);
    await p.goto(`${BASE}/studio/${plain.id}`);
    await p.frameLocator('#st-frame').locator('h1', { hasText: 'Farm Carry Stars' }).waitFor({ timeout: 15000 });
    await p.waitForFunction(() => document.getElementById('st-safety').textContent.trim().length > 0, null, { timeout: 15000 }); await p.waitForTimeout(400);
    assert.equal(await p.locator('#st-livebtn').count(), 0, 'no "Make it a live game"');
    assert.doesNotMatch(await p.innerText('body'), /Live play is not available for classroom games yet/);
    assert.doesNotMatch(await p.textContent('.st-preview'), /Classroom activit|classroom game/i);
    // An Oomba Canvas game (On the board): "Game · on the board" and "Edit game", never "Classroom activity".
    const { html } = await templateHtml('canvas');
    const boardHtml = html.replace(/"config"\s*:\s*\{/, '"config": { "board": true,');
    const canvas = gameOf(t, boardHtml, 'Carry on the board');
    await p.goto(`${BASE}/studio/${canvas.id}`);
    await p.waitForSelector('#st-acts .st-cap[data-kind="activity"]', { state: 'attached', timeout: 15000 });
    const cap = (await p.textContent('#st-acts .st-cap[data-kind="activity"]')).trim();
    assert.match(cap, /^.{0,4}Game · (on the board|results go to Progress)$/);
    assert.match(await p.textContent('#st-acts .st-editact'), /Edit game/);
    assert.doesNotMatch(await p.textContent('#st-acts'), /Classroom activity|Edit lesson/);
    assert.equal(await p.locator('#st-livebtn').count(), 0, 'no live offer for a Canvas game either');
    assert.ok(await noScroll(p), 'no sideways scroll');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  });
}
