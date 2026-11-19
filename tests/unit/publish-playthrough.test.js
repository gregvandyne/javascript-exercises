// Publishing needs "Played all the way through" (services/publish.js, services/playthrough.js): a version the Builder's
// playthrough did not finish is refused with a short, plain reason and the "Ask the Builder to fix it" message; a pass
// is kept on the version (and on a copy of the same code), so publishing again does not play it again; a version with
// no result yet (made before this) is played when it is published; only an admin may publish anyway, and that is
// audited. Then the Studio in a real browser: the "Played all the way through" line, the refusal sheet, and its button
// sending that finding as a chat message (skipped without Chromium). PLAYTHROUGH_SHOTS=dir saves pictures at 390 and
// 1280 wide.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-publish-playthrough-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { publish, setVisibility } = await import('../../server/services/publish.js');
const pt = await import('../../server/services/playthrough.js');
const { q } = await import('../../server/db.js');
const { tFor } = await import('../../server/i18n/index.js');

// A fake browser: a game whose code says BROKEN gets stuck on level 2, anything else reaches its end.
let runs = 0;
pt.hooks.run = async html => {
  runs++;
  if (html.includes('BROKEN')) return { kind: 'kit', end: false, errors: [], why: { code: 'stuck', text: 'it got stuck on level 2: the results card never came', level: 2 }, levels: [{}, {}], ms: 31000, playMs: 30000 };
  return { kind: 'kit', end: true, errors: [], levels: [{}, {}, {}], score: 120, gameOver: true, ms: 24000 };
};

const GAME = '<title>Hop</title><canvas></canvas><script>BRB.gameOver({ won: true, score: 1 })</script>';
const BLOCKED = 'The Builder couldn’t finish your game: it got stuck on level 2. Ask the Builder to fix it, then publish again.';
const ASK = 'When you played my game all the way through, it got stuck on level 2. Please fix it so it can be played to the end.';
let k = 0;
const user = (o = {}) => auth.createUser({ username: `Pt${o.role === 'admin' ? 'Admin' : 'Kid'}${k++}`, password: 'secret12', ...o });
const version = (g, html, o = {}) => games.addVersion(g.id, html, { createdBy: g.owner_id, safetyStatus: 'pass', ...o });

test('migration 0091 adds the playthrough result to every version', () => {
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0091_version_playthrough'"));
  const cols = q.all('PRAGMA table_info(game_versions)').map(c => c.name);
  assert.ok(cols.includes('playthrough_status') && cols.includes('playthrough_report'));
});

test('publishing is refused without a pass, with the plain reason and the fix-it message; allowed once a version passes', async () => {
  const kid = user(), g = games.createGame(kid.id, { title: 'Hop' });
  const bad = version(g, GAME + '<!-- BROKEN -->');
  const before = runs;
  const r = await publish(kid, g.id, 'friends');
  assert.equal(r.ok, false); assert.equal(r.state, 'unplayed'); assert.equal(r.code, 'playthrough');
  assert.equal(r.message, BLOCKED);
  assert.equal(r.ask, ASK);
  assert.equal(r.canOverride, false);
  assert.equal(runs, before + 1, 'played once, right then');
  assert.equal(games.getGame(g.id).status, 'draft', 'nothing went live');
  const row = games.getVersion(bad.id);
  assert.equal(row.playthrough_status, 'fail');
  assert.equal(JSON.parse(row.playthrough_report).level, 2);
  // a stored failure is played again (it may have been a slow moment), and refused again
  assert.equal((await publish(kid, g.id, 'private')).state, 'unplayed'); assert.equal(runs, before + 2);

  // the Builder fixes it: a new version that reaches the end goes live, and its pass is kept
  const good = version(g, GAME);
  const ok = await publish(kid, g.id, 'friends');
  assert.equal(ok.ok, true, ok.message); assert.equal(ok.state, 'live');
  assert.equal(games.getVersion(good.id).playthrough_status, 'pass');
  const n = runs;
  // a new audience for the same live version, and Update to the same code: no second playthrough
  assert.equal((await setVisibility(kid, g.id, 'private')).ok, true);
  assert.equal(runs, n, 'the stored pass is used');
  version(g, GAME);   // the same code again (Save version, Restore): its twin's pass counts
  assert.equal((await publish(kid, g.id, 'friends')).ok, true);
  assert.equal(runs, n, 'a copy of a passing version needs no playthrough');
  // in another language the refusal is in that language
  const g2 = games.createGame(kid.id, { title: 'Hop 2' }); version(g2, GAME + 'BROKEN');
  const he = await publish(kid, g2.id, 'friends', { t: tFor('he') });
  assert.match(he.message, /^הבנאי לא הצליח לסיים את המשחק שלכם: המשחק נתקע בשלב 2\./);
});

test('a version made before the playthrough existed is played when it is published', async () => {
  const kid = user(), g = games.createGame(kid.id, { title: 'Old one' });
  const v = version(g, GAME + '<!-- old -->');
  assert.equal(games.getVersion(v.id).playthrough_status, '', 'no result yet');
  const before = runs;
  const r = await publish(kid, g.id, 'friends');
  assert.equal(r.ok, true); assert.equal(runs, before + 1);
  assert.equal(games.getVersion(v.id).playthrough_status, 'pass');
  const rep = pt.resultOf(games.getVersion(v.id)).report;
  assert.equal(rep.code, 'pass'); assert.equal(rep.score, 120);
});

test('only an admin may publish anyway (audited); a teacher or a kid asking to is still refused', async () => {
  const grown = user({ accountType: 'grownup' }), g = games.createGame(grown.id, { title: 'Grown' });
  version(g, GAME + 'BROKEN');
  const no = await publish(grown, g.id, 'private', { override: true });
  assert.equal(no.state, 'unplayed', 'override is for admins only');
  const admin = user({ role: 'admin' }), ga = games.createGame(admin.id, { title: 'Admin game' });
  const v = version(ga, GAME + 'BROKEN');
  const refused = await publish(admin, ga.id, 'private');
  assert.equal(refused.state, 'unplayed'); assert.equal(refused.canOverride, true, 'the page offers "Publish anyway" to an admin');
  const before = runs;
  const r = await publish(admin, ga.id, 'private', { override: true });
  assert.equal(r.ok, true); assert.equal(r.state, 'live');
  assert.equal(runs, before, 'not played again');
  const a = q.get("SELECT * FROM audit_log WHERE action='game.playthrough_override' AND target=?", ga.id);
  assert.ok(a, 'the override is audited');
  assert.equal(games.getVersion(v.id).playthrough_status, 'fail', 'the result stays what it was');
});

test('no browser free: refused with "try again in a minute", nothing stored; no browser on this server: not checked', async () => {
  const kid = user(), g = games.createGame(kid.id, { title: 'Busy' });
  const v = version(g, GAME + '<!-- busy -->');
  const run = pt.hooks.run;
  pt.hooks.run = async () => { throw Object.assign(new Error('screenshot worker busy'), { workerDown: true }); };
  try {
    const r = await publish(kid, g.id, 'friends');
    assert.equal(r.state, 'unplayed'); assert.equal(r.code, 'playBusy'); assert.equal(r.ask, '');
    assert.match(r.message, /couldn’t play your game all the way through just now\. Try again in a minute\./);
    assert.equal(games.getVersion(v.id).playthrough_status, '');
    pt.hooks.run = null;   // development and the unit tests: no browser here (BRB_SNAPSHOTS off)
    assert.equal(pt.available(), false);
    assert.equal((await publish(kid, g.id, 'friends')).ok, true);
  } finally { pt.hooks.run = run; }
});

// ---- the Studio, in a real browser ----------------------------------------------------------------------------------
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || !exe ? 'needs Chromium' : false;
const SHOTS = process.env.PLAYTHROUGH_SHOTS || '';

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function studio(owner, gameId, { width, height, locale = 'en-US', lang } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale });
  const page = await ctx.newPage();
  const r = await page.request.post(`${BASE}/api/auth/login`, { data: { username: owner.username, password: 'secret12' } });
  assert.equal(r.status(), 200, await r.text());
  if (lang) await page.request.post(`${BASE}/api/me/lang`, { data: { lang } }).catch(() => {});
  await page.goto(`${BASE}/studio/${gameId}${lang ? `?lang=${lang}` : ''}`);
  await page.waitForSelector('#st-safety');
  return { ctx, page };
}
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(700);   // the sheet's slide-in
  fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };

for (const [width, height] of [[390, 844], [1280, 800]]) {
  test(`the Studio at ${width} wide: "Played all the way through" under the safety line; a refused Publish says why and asks the Builder to fix it`, { skip }, async () => {
    const kid = user(), g = games.createGame(kid.id, { title: 'Star Hop' });
    const good = version(g, GAME + `<!-- ${width} -->`);
    pt.record(good.id, { ok: true, code: 'pass', kind: 'kit', text: 'it reached the end' });
    let { ctx, page } = await studio(kid, g.id, { width, height });
    const line = page.locator('#st-safety .st-played');
    await line.waitFor();
    assert.equal((await line.textContent()).trim(), '✅ Played all the way through');
    assert.match(await page.locator('#st-safety').textContent(), /Safety check passed for version 1\./);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, 'no sideways scroll');
    await page.locator('#st-safety').scrollIntoViewIfNeeded();
    await shot(page, `played-line-${width}.png`);
    await ctx.close();

    // a new version that gets stuck: Publish is refused with the reason, and the button sends it to the Builder
    version(g, GAME + `BROKEN ${width}`);
    ({ ctx, page } = await studio(kid, g.id, { width, height }));
    assert.equal(await page.locator('#st-safety .st-played').count(), 0, 'not played yet: no line');
    const sent = [];
    await page.route('**/api/studio/*/chat', route => { sent.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'restarting', code: 'restarting' }) }); });
    await page.click('#st-publish');
    await page.click('#vis-go');
    const block = page.locator('.sheet .st-playblock');
    await block.waitFor();
    assert.equal((await block.textContent()).trim(), BLOCKED);
    assert.equal(await page.locator('.sheet [data-play="anyway"]').count(), 0, 'no "Publish anyway" for a kid');
    const m2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m2.sw <= m2.cw, 'no sideways scroll');
    await shot(page, `blocked-publish-${width}.png`);
    await page.click('.sheet [data-play="fix"]');
    await page.waitForFunction(() => !document.querySelector('.sheet .st-playblock'));
    for (let i = 0; i < 40 && !sent.length; i++) await page.waitForTimeout(100);
    assert.equal(sent.length, 1, 'one chat message');
    assert.equal(sent[0].text, ASK);
    await ctx.close();
  });
}

test('the Studio in Hebrew and Arabic: the line and the refusal read right to left', { skip }, async () => {
  for (const lang of ['he', 'ar']) {
    const kid = user(), g = games.createGame(kid.id, { title: 'Star Hop' });
    q.run('UPDATE users SET lang=? WHERE id=?', lang, kid.id);
    const good = version(g, GAME + `<!-- ${lang} -->`);
    pt.record(good.id, { ok: true, code: 'pass', kind: 'kit', text: 'it reached the end' });
    let { ctx, page } = await studio(kid, g.id, { width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    const line = (await page.locator('#st-safety .st-played').textContent()).trim();
    assert.equal(line, `✅ ${tFor(lang)('js.studio.play.pass')}`);
    await shot(page, `played-line-390-${lang}.png`);
    await ctx.close();
    version(g, GAME + `BROKEN ${lang}`);
    ({ ctx, page } = await studio(kid, g.id, { width: 390, height: 844 }));
    await page.click('#st-publish'); await page.click('#vis-go');
    const block = page.locator('.sheet .st-playblock'); await block.waitFor();
    assert.equal((await block.textContent()).trim(), pt.blockedWords({ code: 'stuck', level: 2 }, tFor(lang)).message);
    const box = await page.evaluate(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, dir: getComputedStyle(document.querySelector('.st-playblock')).direction }; });
    assert.equal(box.dir, 'rtl'); assert.ok(box.l >= 0 && box.r <= box.w);
    await shot(page, `blocked-publish-390-${lang}.png`);
    await ctx.close();
  }
});

test('an admin is offered "Publish anyway", which asks first, then publishes', { skip }, async () => {
  const admin = user({ role: 'admin' }), g = games.createGame(admin.id, { title: 'Admin hop' });
  version(g, GAME + 'BROKEN admin');
  const { ctx, page } = await studio(admin, g.id, { width: 1280, height: 800 });
  await page.click('#st-publish'); await page.click('#vis-go');
  await page.locator('.sheet [data-play="anyway"]').waitFor();
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); d.accept(); });
  await page.click('.sheet [data-play="anyway"]');
  for (let i = 0; i < 50 && games.getGame(g.id).status !== 'published'; i++) await page.waitForTimeout(100);
  assert.deepEqual(asked, ['Publish without a full playthrough? Players may get stuck.']);
  assert.equal(games.getGame(g.id).status, 'published');
  await ctx.close();
});
