// Oomba in Studio in a real browser (docs/decisions.md "Builder in the chat (phase 3): Oomba in Studio"): a teacher on
// /studio/:id sees the Oomba chat docked where "Chat with the Builder" was ("Oomba · <title>", "Sees: Studio, version
// N"), a change typed there builds version 2 and the big preview loads it exactly once, with the compact done card
// ("Showing big on the left"); on a phone the chat is the usual bubble and sheet. A student's Studio is unchanged.
// The chat's AI is a stand-in (services/companion.js hooks.create), the Builder a test provider.
// STUDIO_SHOTS=<dir> saves pictures (1280x800 and 390x844, light and dark).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
const autotest = await import('../../server/builder/autotest.js');
const PT = await import('../../server/services/playthrough.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.STUDIO_SHOTS || '';

const boss = createUser({ username: 'CsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Studio Oak' }).school;
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
let tn = 0;
function teacherNow() {
  const t = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Ms Reyes ${++tn}`, role: 'teacher' }).user.id);
  TOOLS.givePlan(t.id);
  config.manipulativesUsers = [...(config.manipulativesUsers || []), t.username.toLowerCase()];
  return t;
}
const page = (h1, bg) => `<!doctype html><title>Fraction Pizza</title><style>html,body{margin:0;height:100%;background:${bg};color:#2B2250;font-family:system-ui,sans-serif}main{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px}h1{margin:0;font-size:9vmin;color:#E2553C}button{font:inherit;font-size:6vmin;padding:2vmin 5vmin;border:0;border-radius:3vmin;background:#3C8DE2;color:#fff}</style><main><h1>${h1}</h1><div>1/2 + 1/4 = ?</div><button>3/4</button></main><script>document.querySelector('button').onclick = () => BRB.gameOver({ won: true, score: 1 });</script>`;
const V1 = page('Fraction Pizza', '#FFF6D8'), V2 = page('Bigger Pizza', '#E6F4FF');
let sent = [];
agent.registerProvider('csshots', {
  async run(ctx) {
    sent.push(ctx.text);
    ctx.steps.start('write');
    await ctx.tools.exec('write_game', { html: V2, notes: 'Made the slices bigger. Added sixths' });
    await ctx.tools.autoPlaytest({ playthrough: true });
    return { model: 'csshots', tokensIn: 0, tokensOut: 0 };
  },
});
const RAW = { shots: [], layout: ['phone-portrait', 'desktop', 'tablet-portrait'].map(key => ({ key, label: key, width: 390, height: 844, problems: [] })), errors: [], events: [] };
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${++tuN}`, name, input }] });
function gameOf(u) {
  const g = games.createGame(u.id, { title: 'Fraction Pizza', icon: '🍕' });
  games.addVersion(g.id, V1, { notes: 'First version', createdBy: u.id, safetyStatus: 'pass' });
  return games.getGame(g.id);
}

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  CB.hooks.provider = 'csshots'; autotest.hooks.raw = async () => RAW; PT.hooks.run = async () => ({ end: true, kind: 'free', ms: 900, score: 1 });
  CO.hooks.create = async params => {
    const last = params.messages.at(-1);
    const after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    return { model: params.model, usage: { input_tokens: 1, output_tokens: 1 }, ...(after ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sending that to the Builder.' }] } : uses('changeGame', { game: 'last' })) };
  };
});
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; autotest.hooks.raw = null; PT.hooks.run = null; await J.idle(); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(viewport, scheme, user) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  const c = cookieOf(user.id);
  await ctx.addCookies([{ name: c.split('=')[0], value: c.split('=').slice(1).join('='), url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  return { ctx, page: p, errors };
}
const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };
const visible = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }, sel);

test('a teacher\'s Studio: the docked chat instead of the Builder column; a change by message loads the big preview once', { skip, timeout: 240000 }, async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 800 }, '1280x800'], [{ width: 390, height: 844 }, '390x844']]) {
    for (const scheme of ['light', 'dark']) {
      const teacher = teacherNow(), g = gameOf(teacher);
      const { ctx, page: p, errors } = await open(vp, scheme, teacher);
      await p.goto(`${BASE}/studio/${g.id}`);
      await p.frameLocator('#st-frame').locator('h1').waitFor({ timeout: 15000 });
      // Count the big preview's loads from here on.
      await p.evaluate(() => { window.__loads = 0; document.getElementById('st-frame').addEventListener('load', () => { window.__loads++; }); });
      assert.equal(await visible(p, '.st-chat'), false, 'no "Chat with the Builder" column');
      assert.equal(await visible(p, '#st-input'), false);
      for (const id of ['#st-publish', '#st-save', '#st-history', '#st-settings', '#st-share', '#st-frame']) assert.equal(await visible(p, id), true, id);
      if (vp.width > 960) {
        await p.waitForSelector('#st-dock #oc:not([hidden])', { timeout: 15000 });
        assert.equal(await visible(p, '#oc-bubble'), false, 'docked: no bubble');
        const [a, b] = await p.evaluate(() => [document.querySelector('.st-preview').getBoundingClientRect().left, document.getElementById('oc').getBoundingClientRect().left]);
        assert.ok(a < b, 'the big preview on the left, the chat beside it');
      } else {
        assert.equal(await visible(p, '#st-dock'), false, 'a phone: no column');
        await p.click('#oc-bubble');
        await p.waitForSelector('#oc:not([hidden])');
      }
      assert.equal((await p.textContent('#oc-title')).trim(), 'Oomba · Fraction Pizza');
      assert.equal((await p.textContent('#oc-sees')).trim(), 'Studio, version 1');
      assert.match(await p.textContent('#st-vsel'), /Version 1 of 1/);
      sent = [];
      await p.fill('#oc-in', 'Make the slices bigger and add sixths.');
      await p.keyboard.press('Enter');
      await p.waitForSelector('.ocb-compact .ocb-big', { timeout: 30000 });
      await p.frameLocator('#st-frame').locator('h1', { hasText: 'Bigger Pizza' }).waitFor({ timeout: 15000 });
      await p.waitForTimeout(1500);   // nothing loads it again (the stream's version event, the done card, the resync)
      assert.equal(await p.evaluate(() => window.__loads), 1, `${tag} ${scheme}: the big preview loaded version 2 once`);
      assert.deepEqual(sent, ['Make the slices bigger and add sixths.'], 'verbatim to this game\'s Builder');
      assert.match(await p.textContent('.ocb-compact .ocb-big'), vp.width > 960 ? /Showing big on the left/ : /Showing big in the preview above/);
      assert.equal(await p.locator('.ocb-compact .ocb-pv').count(), 0, 'no preview in the card');
      assert.equal(await p.locator('.ocb-compact [data-act="buildAssign"]').count(), 1);
      assert.equal(await p.locator('.ocb-compact a[href^="/live?game="]').count(), 1);
      assert.equal(await p.locator('.ocb-compact [data-act="buildChange"]').count(), 1);
      await p.waitForFunction(() => /Studio, version 2/.test(document.getElementById('oc-sees').textContent), null, { timeout: 10000 });
      await p.waitForFunction(() => /Version 2 of 2/.test((document.querySelector('#st-vsel option:checked') || {}).textContent || ''), null, { timeout: 10000 });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'no sideways scroll');
      await p.evaluate(() => { const el = [...document.querySelectorAll('.ocb-compact')].at(-1); if (el) el.scrollIntoView({ block: 'end' }); });
      await p.waitForTimeout(300);
      await shot(p, `studio-${tag}-${scheme}`);
      // The version picker: version 1 back in the big preview (the newest stays the one the Builder changes).
      if (vp.width > 960) {
        const v1 = await p.evaluate(() => [...document.querySelectorAll('#st-vsel option')].find(o => /Version 1 of/.test(o.textContent)).value);
        await p.selectOption('#st-vsel', v1);
        await p.frameLocator('#st-frame').locator('h1', { hasText: 'Fraction Pizza' }).waitFor({ timeout: 15000 });
        await p.waitForFunction(() => /Studio, version 1/.test(document.getElementById('oc-sees').textContent), null, { timeout: 10000 });
        assert.equal(await p.locator('.ocb-compact .ocb-big').count(), 0);
        assert.equal(await p.locator('.ocb-compact [data-act="buildShow"]').count(), 1, 'Show it big on version 2\'s card');
      }
      assert.deepEqual(errors, [], 'no page errors');
      await ctx.close();
    }
  }
});

test('a student\'s Studio is unchanged: the Builder column, no Oomba', { skip, timeout: 60000 }, async () => {
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Lin' }).user.id);
  const g = gameOf(kid);
  const { ctx, page: p, errors } = await open({ width: 1280, height: 800 }, 'light', kid);
  await p.goto(`${BASE}/studio/${g.id}`);
  await p.waitForSelector('#st-input');
  assert.equal(await visible(p, '.st-chat'), true, 'Chat with the Builder');
  assert.equal(await visible(p, '#st-input'), true);
  assert.equal(await p.locator('#st-dock, #oc-root, #oc-bubble').count(), 0, 'no Oomba');
  assert.match(await p.textContent('#st-live'), /Editing: version 1/);
  assert.equal(await p.locator('#st-vsel').count(), 0);
  const [a, b] = await p.evaluate(() => [document.querySelector('.st-chat').getBoundingClientRect().left, document.querySelector('.st-preview').getBoundingClientRect().left]);
  assert.ok(a < b, 'the chat on the left, as before');
  assert.deepEqual(errors, []);
  await ctx.close();
});
