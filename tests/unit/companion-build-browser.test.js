// The Builder in the Oomba chat in a real browser (docs/decisions.md "Builder in the chat (phase 2)"): a teacher asks
// for a game, taps the ask card's choices (one checked), sees the plan card, taps Build it, watches the Builder's real
// steps on the building card and gets the done card with the game's own sandboxed preview. Laptop (1280x800) and a
// 390 px phone, light and dark: no sideways scroll, nothing wider than the panel, no page errors, and in dark mode the
// preview keeps the game's own colours. The chat's AI is a stand-in (services/companion.js hooks.create); the Builder a
// held test provider (builder/agent.js registerProvider). COMPANION_SHOTS=<dir> saves pictures of the four cards.
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
const SHOTS = process.env.COMPANION_SHOTS || '';

const boss = createUser({ username: 'CbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Build Oak' }).school;
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
let tn = 0;
function teacherNow() {
  const t = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Ms Reyes ${++tn}`, role: 'teacher' }).user.id);
  TOOLS.givePlan(t.id);
  config.manipulativesUsers = [...(config.manipulativesUsers || []), t.username.toLowerCase()];
  const cls = S.createClass(boss, oak.id, { name: '4b math', grade: '4', teacherId: t.id }).class;
  for (const n of ['Ada Lin', 'Ben Cho']) { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); }
  return t;
}

// A small game with its own colours (a light board), so dark mode can be checked to keep them.
const GAME = `<!doctype html><title>Regrouping Race</title><style>
html,body{margin:0;height:100%;background:#FFF6D8;color:#2B2250;font-family:system-ui,sans-serif}
main{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px}
h1{margin:0;font-size:9vmin;color:#E2553C}.q{font-size:14vmin;font-weight:900}.row{display:flex;gap:3vmin}
button{font:inherit;font-size:6vmin;padding:2vmin 5vmin;border:0;border-radius:3vmin;background:#3C8DE2;color:#fff}
</style><main><h1>Regrouping Race</h1><div class="q">47 + 38 = ?</div><div class="row"><button>75</button><button>85</button><button>815</button></div></main>
<script>let s = 0; document.querySelectorAll('button').forEach(b => b.onclick = () => { s++; BRB.sfx.play('win'); if (s > 2) BRB.gameOver({ won: true, score: s }); });</script>`;
let held = null;
const deferred = () => { let resolve; const p = new Promise(r => { resolve = r; }); p.resolve = resolve; return p; };
agent.registerProvider('cbshots', {
  async run(ctx) {
    ctx.steps.start('think', { n: 1, c: 'start' });
    ctx.steps.start('write');
    if (held) { held.started.resolve(); await Promise.race([held.open, new Promise(r => ctx.signal.addEventListener('abort', r, { once: true }))]); }
    await ctx.tools.exec('write_game', { html: GAME, notes: 'First version' });
    await ctx.tools.autoPlaytest({ playthrough: true });
    return { model: 'cbshots', tokensIn: 0, tokensOut: 0 };
  },
});
const RAW = { shots: [], layout: ['phone-portrait', 'desktop', 'phone-landscape', 'tablet-portrait'].map(key => ({ key, label: key, width: 390, height: 844, problems: [] })), errors: [], events: [] };
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${++tuN}`, name, input }] });

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  CB.hooks.provider = 'cbshots'; autotest.hooks.raw = async () => RAW; PT.hooks.run = async () => ({ end: true, kind: 'free', ms: 900, score: 3 });
  CO.hooks.create = async params => {
    const last = params.messages.at(-1);
    const after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    return { model: params.model, usage: { input_tokens: 1, output_tokens: 1 }, ...(after ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sure!' }] } : uses('startBuild', { title: 'Regrouping Race', grade: '4', topic: 'regrouping' })) };
  };
});
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; autotest.hooks.raw = null; PT.hooks.run = null; if (held) held.open.resolve(); await J.idle(); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function pageFor(viewport, scheme, teacher) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  const c = cookieOf(teacher.id);
  await ctx.addCookies([{ name: c.split('=')[0], value: c.split('=').slice(1).join('='), url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (!SHOTS) return null; fs.mkdirSync(SHOTS, { recursive: true }); const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p, fullPage: false }); return p; };
/** The card scrolled into the chat's view (its top at the top of the log, so the whole card shows where it fits). */
const show = (page, sel, block = 'start') => page.evaluate(([s, b]) => { const el = [...document.querySelectorAll(s)].at(-1); if (el) el.scrollIntoView({ block: b }); }, [sel, block]);
const wide = page => page.evaluate(() => {
  const panel = document.querySelector('.oc-panel, .oc-sheet, #oc-panel') || document.body;
  const pr = panel.getBoundingClientRect();
  const over = [...document.querySelectorAll('.ocb-ask, .ocb-plan, .ocb-game, .ocb-opt, .ocb-pv, .oc-acts .btn')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > pr.right + 1 || r.left < pr.left - 1); }).map(el => el.className);
  return { sideways: document.documentElement.scrollWidth > window.innerWidth + 1, over };
});

test('ask, plan, building and done cards on a laptop and a phone, light and dark', { skip, timeout: 240000 }, async () => {
  for (const [vp, tag] of [[{ width: 1280, height: 800 }, '1280x800'], [{ width: 390, height: 844 }, '390x844']]) {
    for (const scheme of ['light', 'dark']) {
      const teacher = teacherNow();
      const { ctx, page, errors } = await pageFor(vp, scheme, teacher);
      await page.goto(`${BASE}/teach`);
      await page.click('#oc-bubble');
      await page.waitForSelector('#oc-in', { state: 'visible' });
      // 1. ask: what the message did not say, the picked option checked
      await page.fill('#oc-in', 'Make a grade 4 game about regrouping');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.ocb-ask .ocb-opt', { timeout: 15000 });
      assert.equal(await page.locator('.ocb-ask fieldset').count(), 2, 'where and how much help');
      await page.click('.ocb-opt[data-v="use:devices"]');
      await page.waitForSelector('.ocb-opt.on[data-v="use:devices"][aria-checked="true"]');
      await show(page, '.ocb-ask');
      let w = await wide(page); assert.equal(w.sideways, false, `${tag} ${scheme}: no sideways scroll`); assert.deepEqual(w.over, [], 'nothing wider than the panel');
      await shot(page, `ask-${tag}-${scheme}`);
      await page.click('.ocb-opt[data-v="help:hints"]');
      // 2. plan
      await page.click('.ocb-ask [data-act="buildPlan"]');
      await page.waitForSelector('.ocb-plan:not(.done) textarea.ocb-told');
      assert.match(await page.textContent('.ocb-plan:not(.done) .oc-hsub'), /Game plan · Grade 4 · On their devices · Hints when stuck/);
      assert.match(await page.textContent('.ocb-plan:not(.done) .ocb-uses'), /Uses 1 of today's builds \(\d+ left\)/);
      await show(page, '.ocb-plan:not(.done)');
      w = await wide(page); assert.equal(w.sideways, false); assert.deepEqual(w.over, []);
      await shot(page, `plan-${tag}-${scheme}`);
      if (vp.width < 500) { await show(page, '.ocb-plan:not(.done)', 'end'); await shot(page, `plan-${tag}-${scheme}-end`); }
      // 3. building: the Builder's real steps (held while it writes)
      held = { open: deferred(), started: deferred() };
      await page.click('.ocb-plan:not(.done) [data-act="buildGo"]');
      await held.started;
      await page.waitForSelector('.ocb-game .ocb-s.now', { timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.ocb-game .ocb-s')].map(x => x.className).join(' ').includes('done'), null, { timeout: 15000 });
      const rows = await page.$$eval('.ocb-game .ocb-s', els => els.map(e => e.className.replace('ocb-s ', '')));
      assert.deepEqual(rows, ['done', 'done', 'now', 'todo', 'todo']);
      await show(page, '.ocb-game');
      w = await wide(page); assert.equal(w.sideways, false); assert.deepEqual(w.over, []);
      await shot(page, `building-${tag}-${scheme}`);
      // 4. done: Oomba's words from the real checks, the game's own preview
      held.open.resolve(); held = null;
      await page.waitForSelector('.ocb-done .ocb-pv iframe', { timeout: 30000 });
      const frame = page.frameLocator('.ocb-done .ocb-pv iframe');
      await frame.locator('h1').waitFor({ timeout: 15000 });
      assert.equal(await frame.locator('body').evaluate(b => getComputedStyle(b).backgroundColor), 'rgb(255, 246, 216)', 'the game keeps its own colours');
      const box = await page.locator('.ocb-done .ocb-pv').boundingBox();
      assert.ok(Math.abs(box.width / box.height - 1.6) < 0.03, '16:10');
      assert.match(await page.textContent('.ocb-done .ocb-say'), /^I played it on a phone, a tablet, and a laptop and every round worked, and the safety scan passed\. Students only see it when you assign it or host it live\.$/);
      assert.match(await page.textContent('.ocb-done .ocb-line'), /Version 1 · playtested on 3 screen sizes · safety scan passed/);
      await show(page, '.ocb-done');
      await page.waitForTimeout(400);
      w = await wide(page); assert.equal(w.sideways, false); assert.deepEqual(w.over, []);
      await shot(page, `done-${tag}-${scheme}`);
      if (vp.width < 500) { await show(page, '.ocb-done', 'end'); await shot(page, `done-${tag}-${scheme}-end`); }
      assert.deepEqual(errors, [], 'no page errors');
      await ctx.close();
    }
  }
});
