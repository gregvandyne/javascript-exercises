// Classroom dashboards, the Fractions tool's Steps panel (docs/decisions.md "Classroom dashboards: steps never vanish;
// Back a step and Clear the steps"). The owner saw step 1 lose its words once step 2 showed (the panel's tight mode made
// earlier steps their numbers only), and asked for a way to take back a Next step pressed by mistake. Checked in the real
// page in Chromium (skipped where none is installed), in a small widget so the tight mode is on.
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashsteps-`);

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

let env = null;
test.after(async () => { if (env) { await env.browser.close(); env.server.close(); } });

test('Steps: every shown step keeps its words; Back a step and Clear the steps take them back and are saved', { skip, timeout: 120e3 }, async () => {
  const { config } = await import('../../server/config.js');
  config.anthropicKey = '';
  const { createUser, startSession, getUser } = await import('../../server/auth.js');
  const S = await import('../../server/services/schools.js');
  const D = await import('../../server/services/dash.js');
  const { createApp } = await import('../../server/app.js');
  const { tFor } = await import('../../server/i18n/index.js');
  const boss = createUser({ username: 'StepBoss', password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Steps School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
  const C = S.createClass(T, school.id, { name: 'Class 5A' }).class;
  D.ensureLayouts(T, C, tFor('en'));
  const first = D.layoutsOf(C.id, T.id)[0];
  // Small on purpose: little room for the picture turns on the panel's tight mode.
  D.updateLayout(T, C, first.id, { name: 'Steps', widgets: [{ id: 'wfrac', type: 'fractions', x: 0, y: 0, w: 6, h: 5,
    s: { state: { tab: 'ops', mode: 'add', a: { n: 3, d: 2 }, b: { n: 4, d: 2 } } } }] });
  D.useLayout(T, C, first.id);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = ''; startSession({ append: (k, v) => { cookie = v.split(';')[0]; } }, T.id);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  env = { browser, server };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const [cn, cv] = cookie.split('=');
  await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/class/${C.id}/dashboard`);
  await page.waitForSelector('[data-id="wfrac"]');
  const w = '[data-id="wfrac"]';
  const steps = () => page.locator(`${w} .dt-stepsl li`).evaluateAll(ls => ls.map(l => l.textContent.replace(/^\d+/, '').trim()));
  const saved = async want => { for (let i = 0; i < 40; i++) { const s = D.getLayout(first.id).widgets[0].s.state; if ((s.step ?? 0) === want) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

  await page.locator(`${w} [data-k="steps"]`).click();   // the Steps panel starts closed
  await page.locator(`${w} [data-k="step"]`).click();
  await page.locator(`${w} [data-k="step"]`).click();
  let shown = await steps();
  assert.equal(shown.length, 2);
  for (const s of shown) assert.ok(s.length > 3, `every step keeps its words: ${JSON.stringify(shown)}`);
  assert.match(shown[0], /Same bottom number/);
  assert.ok(await saved(2));
  if (process.env.SHOT_DIR) await page.locator(w).screenshot({ path: `${process.env.SHOT_DIR}/dash-steps-two.png` });

  // Back a step: only step 1 is left, with its words, and Next step is still there.
  await page.locator(`${w} [data-k="stepback"]`).click();
  shown = await steps();
  assert.equal(shown.length, 1); assert.match(shown[0], /Same bottom number/);
  assert.equal(await page.locator(`${w} [data-k="step"]`).count(), 1);
  assert.ok(await saved(1));

  // Clear the steps: none shown, and no Back or Clear until a step shows again.
  await page.locator(`${w} [data-k="step"]`).click();
  await page.locator(`${w} [data-k="stepclear"]`).click();
  assert.deepEqual(await steps(), []);
  assert.equal(await page.locator(`${w} [data-k="stepback"]`).count(), 0);
  assert.equal(await page.locator(`${w} [data-k="stepclear"]`).count(), 0);
  assert.ok(await saved(0));
  assert.deepEqual(errors, []);
});
