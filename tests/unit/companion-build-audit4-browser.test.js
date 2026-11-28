// The Builder in the chat: audit 4 fixes, in a real browser (docs/decisions.md "Builder in the chat: audit 4 fixes"):
//   - a change built while the teacher is on another page (/teach): the "Your game is ready" notice appears once when
//     its card turns done; the done card has Versions, and an earlier version shows in the card's preview; Assign
//     brings the assign card, which says it shares the game with the class first;
//   - Studio's version picker: a switch that fails goes back to the version shown (and says so); one that works shows
//     that version big, and the safety line under the preview is that version's.
// Laptop 1280x800 light and a 390 px phone dark. The chat's AI is a stand-in, the Builder a test provider.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.BRB_MOCK_DELAY_MS = '0';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const CO = await import('../../server/services/companion.js');
const CB = await import('../../server/services/companion-build.js');
const J = await import('../../server/services/oomba-jobs.js');
const agent = await import('../../server/builder/agent.js');
const runner = await import('../../server/builder/runner.js');
const turns = await import('../../server/builder/turns.js');
const PT = await import('../../server/services/playthrough.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'A4Boss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Audit Oak' }).school;
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
let tn = 0;
function teacherNow() {
  const t = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Ms Vega ${++tn}`, role: 'teacher' }).user.id);
  TOOLS.givePlan(t.id);
  config.manipulativesUsers = [...(config.manipulativesUsers || []), t.username.toLowerCase()];
  const cls = S.createClass(boss, oak.id, { name: '4b math', grade: '4', teacherId: t.id }).class;
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Lin' }).user.id); S.addToClass(boss, cls.id, u.id);
  return t;
}
const page = (h1, bg) => `<!doctype html><title>Pizza</title><style>html,body{margin:0;height:100%;background:${bg};font-family:system-ui,sans-serif}h1{margin:0;padding:20px;color:#E2553C}</style><h1>${h1}</h1><button>3/4</button><script>document.querySelector('button').onclick = () => BRB.gameOver({ won: true, score: 1 });</script>`;
agent.registerProvider('a4shots', {
  async run(ctx) {
    ctx.steps.start('write');
    const n = (turns.newestVersion(ctx.game.id) || 0) + 1;
    await ctx.tools.exec('write_game', { html: page(`Pizza V${n}`, '#FFF6D8'), notes: `Version ${n} change` });
    return { model: 'a4shots', tokensIn: 0, tokensOut: 0 };
  },
});
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${++tuN}`, name, input }] });

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  CB.hooks.provider = 'a4shots'; PT.hooks.run = async () => ({ end: true, kind: 'free', ms: 900, score: 1 });
  CO.hooks.create = async params => {
    const last = params.messages.at(-1);
    const after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    return { model: params.model, usage: { input_tokens: 1, output_tokens: 1 }, ...(after ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sending that to the Builder.' }] } : uses('changeGame', { game: 'last' })) };
  };
});
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; PT.hooks.run = null; await J.idle(); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(viewport, scheme, user) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  const c = cookieOf(user.id);
  await ctx.addCookies([{ name: c.split('=')[0], value: c.split('=').slice(1).join('='), url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  return { ctx, page: p, errors };
}
/** A game of the teacher's with version 1, changed once in the chat (so it is a game made in the chat: version 2). */
async function chatGame(u) {
  const g = games.createGame(u.id, { title: 'Fraction Pizza', icon: '🍕' });
  games.addVersion(g.id, page('Pizza V1', '#FFF6D8'), { notes: 'First version', createdBy: u.id, safetyStatus: 'pass' });
  CO.ensureChat(u);
  const r = CB.studioSend(u, g.id, 'Make the slices bigger.', 'en');
  assert.ok(r.ok, JSON.stringify(r));
  await J.idle(); await runner.idle(g.id); await J.idle();
  turns.markSeen(g.id);   // seen: the next page has no notice of its own
  return games.getGame(g.id);
}

test('a change built while on another page: the ready notice once, the card\'s Versions, Assign shares first', { skip, timeout: 180000 }, async () => {
  for (const [vp, scheme] of [[{ width: 1280, height: 800 }, 'light'], [{ width: 390, height: 844 }, 'dark']]) {
    const teacher = teacherNow(), g = await chatGame(teacher);
    const { ctx, page: p, errors } = await open(vp, scheme, teacher);
    await p.goto(`${BASE}/teach`);
    assert.equal(await p.locator('.pagenote:has-text("is ready")').count(), 0, 'no notice when the page opens');
    await p.click('#oc-bubble');
    await p.waitForSelector('#oc-in', { state: 'visible' });
    await p.fill('#oc-in', 'In “Fraction Pizza”, add a star reward at the end of the game.');
    await p.keyboard.press('Enter');
    // The card turns done while the teacher is here: the layout's notice, once.
    await p.waitForSelector('.ocb-news', { timeout: 30000 });
    assert.match(await p.textContent('.ocb-news'), /“\u2068?Fraction Pizza\u2069?” is ready!/);
    assert.equal(await p.getAttribute('.ocb-news a', 'href'), `/studio/${g.id}`);
    await p.waitForTimeout(2500);
    assert.equal(await p.locator('.ocb-news').count(), 1, 'told once');
    // Versions on the done card: three, the newest shown; version 1 shows in the card's own preview.
    const sel = '.ocb-done:not(.ocb-compact) select[data-ocb-vers]';
    await p.waitForSelector(sel, { timeout: 15000 });
    const card = p.locator('.ocb-done').last();
    const vsel = card.locator('select[data-ocb-vers]');
    assert.match(await vsel.locator('option:checked').textContent(), /Version 3 of 3/);
    assert.equal(await vsel.locator('option').count(), 3);
    const v1 = await vsel.evaluate(s => [...s.options].find(o => /Version 1 of/.test(o.textContent)).value);
    await vsel.selectOption(v1);
    await p.waitForSelector(`.ocb-pvl[data-key="${g.id}:${v1}"] iframe`, { timeout: 15000 });
    await p.frameLocator(`.ocb-pvl[data-key="${g.id}:${v1}"] iframe`).locator('h1', { hasText: 'Pizza V1' }).waitFor({ timeout: 15000 });
    assert.match(await p.locator('.ocb-done').last().locator('.ocb-line').textContent(), /Showing version 1\. Version 3 is the newest/);
    // Assign: the assign card (the class is the teacher's only one), saying it shares it with the class first.
    await p.locator('.ocb-done').last().locator('[data-act="buildAssign"]').click();
    await p.waitForSelector('.oc-cls [data-act="assign"]', { timeout: 15000 });
    assert.match(await p.textContent('#oc'), /isn't shared with 4b math yet/);
    assert.equal(games.getGame(g.id).status, 'draft', 'nothing shared before Assign');
    await p.click('.oc-cls [data-act="assign"]');
    await p.waitForFunction(() => /Assigned|assigned/.test(document.getElementById('oc').textContent), null, { timeout: 15000 });
    assert.equal(games.getGame(g.id).visibility, 'class');
    assert.equal(games.gameLiveInClass(g.id, S.classesOf(teacher.id, 'teacher')[0].id), true);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'no sideways scroll');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  }
});

test('Studio\'s version picker: a failed switch goes back; a switch shows that version and its safety line', { skip, timeout: 120000 }, async () => {
  const teacher = teacherNow();
  const g = games.createGame(teacher.id, { title: 'Fraction Pizza', icon: '🍕' });
  for (let i = 1; i <= 3; i++) games.addVersion(g.id, page(`Pizza V${i}`, '#E6F4FF'), { notes: `v${i}`, createdBy: teacher.id, safetyStatus: 'pass' });
  const { ctx, page: p, errors } = await open({ width: 1280, height: 800 }, 'light', teacher);
  await p.goto(`${BASE}/studio/${g.id}`);
  await p.frameLocator('#st-frame').locator('h1', { hasText: 'Pizza V3' }).waitFor({ timeout: 15000 });
  await p.waitForFunction(() => /Safety check passed for version 3\./.test(document.getElementById('st-safety').textContent), null, { timeout: 5000 });
  const v2 = await p.evaluate(() => [...document.querySelectorAll('#st-vsel option')].find(o => /Version 2 of/.test(o.textContent)).value);
  // The server answers with an error (both tries): the picker goes back to version 3, the preview stays, it says so.
  let calls = 0;
  const match = url => url.pathname === `/api/companion/build/${g.id}` && url.searchParams.has('v');
  await p.route(match, r => { calls++; return r.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' }); });
  await p.selectOption('#st-vsel', v2);
  await p.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(x => /Couldn't show version 2/.test(x.textContent)), null, { timeout: 10000 });
  assert.equal(calls, 2, 'tried twice');
  assert.match(await p.textContent('#st-vsel option:checked'), /Version 3 of 3/, 'the picker is back on the version shown');
  await p.frameLocator('#st-frame').locator('h1', { hasText: 'Pizza V3' }).waitFor();
  assert.match(await p.textContent('#st-safety'), /version 3\./);
  // It works: version 2 big, the picker on it, the safety line and "Sees" for version 2.
  await p.unroute(match);
  await p.selectOption('#st-vsel', v2);
  await p.frameLocator('#st-frame').locator('h1', { hasText: 'Pizza V2' }).waitFor({ timeout: 15000 });
  assert.match(await p.textContent('#st-vsel option:checked'), /Version 2 of 3/);
  await p.waitForFunction(() => /Safety check passed for version 2\./.test(document.getElementById('st-safety').textContent), null, { timeout: 5000 });
  await p.waitForFunction(() => /Studio, version 2/.test(document.getElementById('oc-sees').textContent), null, { timeout: 5000 });
  // And back to the newest: its own line again.
  const v3 = await p.evaluate(() => [...document.querySelectorAll('#st-vsel option')].find(o => /Version 3 of/.test(o.textContent)).value);
  await p.selectOption('#st-vsel', v3);
  await p.frameLocator('#st-frame').locator('h1', { hasText: 'Pizza V3' }).waitFor({ timeout: 15000 });
  await p.waitForFunction(() => /Safety check passed for version 3\./.test(document.getElementById('st-safety').textContent), null, { timeout: 5000 });
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
});
