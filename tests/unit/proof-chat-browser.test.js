// Mistake Hunt, Phase 3 in a real browser, on the real game page and play page (the model faked through
// services/proof-ai.js hooks.create): a Teacher plan holder on a laptop opens Oomba's chat beside the builder (docked on
// the end side, the builder narrows), asks for a new passage, gets it as one change with its mistakes planted, undoes it
// and puts it back; on an iPhone 13 the chat is a sheet that minimizes to the Oomba bubble at the bottom corner; a teacher
// without the plan sees the plan note; the progress page's "Oomba's read" card asks Oomba and shows the read.
// MH3_SHOTS=<dir> saves pictures (device scale 2). Skipped when no Chromium is installed.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ctx as live, publish, official, teacher, teacher2, cls, mia, leo, cookieFor, call, RL, L } from './_live.js';
import * as A from '../../server/services/proof-ai.js';
import * as PC from '../../server/services/proof-chat.js';
import { proofCore } from '../../server/services/proof-core.js';
import * as TOOLS from './_tools-plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MH3_SHOTS || '';
const P = proofCore();
const MH = publish(official, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
PC._resetGame();
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const X2 = 'Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground, and they measure the gases. These clues help them warn people to leave their homes in time.';
const answer = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 5, output_tokens: 5 } });
let calls = [];
A.hooks.create = async p => {
  calls.push(p);
  if (p.system && p.system.includes('<set>')) {
    return answer({ reply: 'I added a passage about the scientists who watch volcanoes, with six mistakes planted.', action: { op: 'replace', set: { title: 'Volcanoes: find the mistakes', grade: 4, kinds: P.preset(4), perPassage: 6, passages: [{ keep: 1 }, { title: 'Volcano scientists', text: X2 }] } } });
  }
  return answer({ read: 'The class found most capital letters and end marks. Commas after an opening part were missed most often.', tips: ['Try a short set with only commas after an opening part.', 'Read a passage aloud together and pause at each opening part.'] });
};
TOOLS.plansOn(); TOOLS.givePlan(teacher.id);

let browser;
test.before(async () => { if (skip) return; browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { if (browser) await browser.close(); A.hooks.create = null; TOOLS.plansOn(false); });
test.beforeEach(() => RL._reset());
async function open(who, url, opts) {
  const c = await browser.newContext(opts);
  const [name, value] = cookieFor(who.id).split('='); await c.addCookies([{ name, value, url: live.base }]);
  const page = await c.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(live.base + url);
  return { c, page, errors };
}
const frameOf = async page => { await page.waitForSelector('#gameframe'); const h = await page.$('#gameframe'); const f = await h.contentFrame(); await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState); return f; };
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full }); };
const LAPTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 };
/** A builder with one planted passage (the teacher's own text). */
async function builder(f) {
  await f.click('#mh-make');
  await f.fill('#mh-title', 'Volcanoes: find the mistakes');
  await f.fill('#mh-paste', X1);
  await f.click('#mh-use');
  await f.waitForSelector('#mh-mlist .mrow');
}

test('a laptop: Oomba\'s chat docked beside the builder; a new passage as one change; Undo Oomba\'s change and Put it back', { skip, timeout: 180_000 }, async () => {
  const t = await open(teacher, '/play/mistake-hunt', LAPTOP);
  const f = await frameOf(t.page);
  await f.waitForFunction(() => window.BRB.proofAi && window.BRB.proofAi.chat === 'yes');
  await builder(f);
  const before = await f.evaluate(() => window.__brbTest.mhState().draft.passages);
  assert.equal(before.length, 1);
  await f.click('#mh-oomba');
  await f.waitForSelector('#mhc:not([hidden])');
  assert.equal(await f.getAttribute('#mh-oomba', 'aria-expanded'), 'true');
  // docked on the end side, full height; the builder narrows beside it (nothing covered)
  const box = await f.evaluate(() => { const r = document.getElementById('mhc').getBoundingClientRect(), m = document.getElementById('mh').getBoundingClientRect(); return { left: r.left, right: r.right, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, mright: m.right }; });
  assert.ok(Math.abs(box.right - box.vw) < 2 && box.w >= 330 && box.w <= 381, JSON.stringify(box));
  assert.ok(box.mright <= box.left, 'the builder ends before the panel');
  assert.ok(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  assert.match(await f.textContent('#mhc-sub'), /1 passage, Grade 4/);
  assert.ok(await f.locator('.mhc-chips .chip').count() >= 3, 'ideas to start');
  assert.equal(await f.evaluate(() => document.activeElement && document.activeElement.id), 'mhc-in', 'focus in the composer');
  // ask: the answer is a job; the change goes into the builder as one change
  await f.fill('#mhc-in', 'Add a passage about the scientists who study volcanoes');
  await f.click('#mhc-send');
  await f.waitForSelector('#mhc [data-c="undo"]', { timeout: 30_000 });
  const after = await f.evaluate(() => window.__brbTest.mhState().draft);
  assert.equal(after.passages.length, 2);
  assert.equal(after.passages[0].x, X1); assert.equal(after.passages[0].m, before[0].m, 'the kept passage keeps its mistakes');
  assert.equal(after.passages[1].x, X2); assert.ok(after.passages[1].m >= 3, 'mistakes planted by the server');
  assert.equal(after.cur, 0);
  assert.match(await f.textContent('#mhc-log'), /Oomba changed the set/);
  assert.match(await f.textContent('#mhc-log'), /2 passages/);
  assert.match(await f.textContent('#mh-msg'), /Oomba's change is in your set/);
  assert.equal(calls.filter(c => c.system).length, 1);
  // the new passage carries "Written with AI. Read it before you save."
  await f.click('#mh-tab-1');
  await f.waitForSelector('#mh-ailabel');
  await f.click('#mh-tab-0');
  await shot(t.page, 'builder-chat-laptop');
  // Undo Oomba's change, then Put it back
  await f.click('#mhc [data-c="undo"]');
  assert.equal((await f.evaluate(() => window.__brbTest.mhState().draft.passages)).length, 1);
  assert.match(await f.textContent('#mhc-log'), /Oomba's change was undone/);
  assert.equal(await f.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-c')), 'redo');
  await f.click('#mhc [data-c="redo"]');
  assert.equal((await f.evaluate(() => window.__brbTest.mhState().draft.passages)).length, 2);
  // Escape minimizes; the panel's place goes back to the builder
  await f.focus('#mhc-in'); await t.page.keyboard.press('Escape');
  assert.equal(await f.evaluate(() => window.__brbTest.mhChat().mode), 'min');
  assert.ok(await f.evaluate(() => document.getElementById('mh').getBoundingClientRect().right > innerWidth - 200));
  // leaving the builder hides the chat
  await f.click('#mh-home');
  assert.equal(await f.isHidden('#mhc-bubble'), true);
  assert.deepEqual(t.errors, []);
  await t.c.close();
});

test('an iPhone 13: a sheet with Minimize; the Oomba bubble at the bottom corner, reopened; a teacher without the plan sees the note', { skip, timeout: 180_000 }, async () => {
  const s = await open(teacher, '/play/mistake-hunt', { ...devices['iPhone 13'], deviceScaleFactor: SHOTS ? 2 : 3 });
  const f = await frameOf(s.page);
  await builder(f);
  await f.locator('#mh-oomba').evaluate(b => b.click());
  await f.waitForSelector('#mhc:not([hidden])');
  const sheet = await f.evaluate(() => { const r = document.getElementById('mhc').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight }; });
  assert.ok(Math.abs(sheet.bottom - sheet.vh) < 2 && sheet.left <= 1 && Math.abs(sheet.right - sheet.vw) < 2 && sheet.top > 40, JSON.stringify(sheet));
  await shot(s.page, 'chat-sheet-iphone13');
  await f.locator('#mhc-min').evaluate(b => b.click());
  await f.waitForSelector('#mhc-bubble:not([hidden])');
  const bub = await f.evaluate(() => { const b = document.getElementById('mhc-bubble'), r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { right: r.right, bottom: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight, top: !!e && (e === b || b.contains(e)), focused: document.activeElement === b, label: b.getAttribute('aria-label') }; });
  assert.ok(bub.w >= 56 && bub.vw - bub.right >= 8 && bub.vw - bub.right <= 24 && bub.vh - bub.bottom >= 8 && bub.vh - bub.bottom <= 60, JSON.stringify(bub));
  assert.ok(bub.top, 'nothing over the bubble'); assert.ok(bub.focused, 'focus on the bubble'); assert.equal(bub.label, "Open Oomba's chat");
  assert.ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot(s.page, 'chat-bubble-iphone13');
  await f.locator('#mhc-bubble').evaluate(b => b.click());
  await f.waitForSelector('#mhc:not([hidden])');
  assert.deepEqual(s.errors, []);
  await s.c.close();
  // a teacher without the plan: the calm note and the trial, no composer
  const o = await open(teacher2, '/play/mistake-hunt', LAPTOP);
  const g = await frameOf(o.page);
  await g.waitForFunction(() => window.BRB.proofAi && window.BRB.proofAi.chat === 'plan');
  await g.click('#mh-make');
  await g.click('#mh-oomba');
  await g.waitForSelector('#mhc-plan');
  assert.match(await g.textContent('#mhc-plan'), /part of the Teacher plan/);
  assert.equal(await g.locator('#mhc-trial').count(), 1); assert.equal(await g.locator('#mhc-in').count(), 0);
  assert.deepEqual(o.errors, []);
  await o.c.close();
  // a student: no Oomba button
  const m = await open(mia, '/play/mistake-hunt', LAPTOP);
  const h = await frameOf(m.page);
  assert.equal(await h.evaluate(() => window.BRB.proofAi), null);
  await m.c.close();
});

test('the progress page: "Oomba\'s read" from the numbers, Ask Oomba, then Oomba\'s read', { skip, timeout: 120_000 }, async () => {
  const items = [{ t: 'Inside a volcano', x: X1, g: 4, m: P.plant(X1, { types: P.preset(4), n: 6, seed: 3 }), o: { h: true, s: true, n: 'total' } }, { t: 'Volcano scientists', x: X2, g: 4, m: P.plant(X2, { types: P.preset(4), n: 5, seed: 4 }) }];
  const s = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items: JSON.parse(JSON.stringify(items)), title: 'Volcanoes: find the mistakes' }, user: teacher });
  assert.equal(s.status, 200, s.text);
  const r = await call('/api/teach/assign-proofread', { method: 'POST', body: { setId: s.json.id, classId: cls.id }, user: teacher });
  const clId = /progress\/([^/?#]+)/.exec(r.json.redirect)[1], step = L.steps(L.getClassLesson(clId).lesson_id)[0];
  const api = `/api/progress/${clId}/${step.id}/proofread`;
  const fx = (it, upto) => P.key(it.x, it.m).slice(0, upto).map(k => ({ a: k.a, b: k.b, s: k.right }));
  await call(api, { method: 'POST', body: { edits: [fx(items[0], 4), fx(items[1], 2)], handIn: true }, user: mia });
  await call(api, { method: 'POST', body: { edits: [fx(items[0], 2), []], handIn: true }, user: leo });
  const t = await open(teacher, `/class/${cls.id}/progress/${clId}`, LAPTOP);
  await t.page.waitForSelector('.pf-insight');
  assert.match(await t.page.textContent('.pf-insight'), /2 of 2 handed in/);
  assert.match(await t.page.textContent('.pf-insight'), /Missed most/);
  if (SHOTS) { await t.page.locator('.pf-insight').scrollIntoViewIfNeeded(); await t.page.locator('.pf-insight').screenshot({ path: path.join(SHOTS, 'insight-card-fallback.png') }); }
  const before = calls.length;
  await Promise.all([t.page.waitForEvent('load'), t.page.click(`#pi-ask-${step.id}`)]);
  await t.page.waitForSelector('.pf-insight.is-ai');
  assert.equal(calls.length, before + 1);
  assert.ok(!JSON.stringify(calls.at(-1)).includes('Mia') && !JSON.stringify(calls.at(-1)).includes('Leo'), 'no names to the AI');
  assert.match(await t.page.textContent('.pf-insight'), /Commas after an opening part were missed most often/);
  assert.equal(await t.page.locator('.pf-insight .pf-tips li').count(), 2);
  assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await t.page.locator('.pf-insight').scrollIntoViewIfNeeded();
  await t.page.evaluate(() => document.querySelectorAll('.toast, #toast, [role=status].toast').forEach(x => x.remove()));
  if (SHOTS) await t.page.locator('.pf-results').screenshot({ path: path.join(SHOTS, 'insight-card-laptop.png') });
  assert.deepEqual(t.errors, []);
  await t.c.close();
});
