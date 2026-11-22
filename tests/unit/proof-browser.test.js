// Mistake Hunt, Phase 2 in a real browser, on the real game page and play page (the model faked through
// services/proof-ai.js hooks.create): a teacher on a laptop turns on Power with AI and gets passages with "Written with
// AI. Read it before you save." and their mistakes planted; Check my passage shows Oomba's flags and changes nothing
// until one is accepted; Save drafts the why lines into the mistake list for the teacher to edit, and the next Save
// stores them; Assign to class with "Hand in for a grade". A student on an iPhone 13 opens the step from the lesson,
// taps words to fix them, hands in (asked first) and sees their score; the teacher's progress page counts each kind of
// mistake. MH2_SHOTS=<dir> saves pictures (device scale 2). Skipped when no Chromium is installed.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ctx as live, publish, official, teacher, cls, mia, leo, cookieFor, q, RL, L } from './_live.js';
import * as A from '../../server/services/proof-ai.js';
import * as G from '../../server/services/game-sets.js';
import * as PS from '../../server/services/proof-steps.js';
import { proofCore } from '../../server/services/proof-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MH2_SHOTS || '';
const C = proofCore();
const MH = publish(official, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
void MH;
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const X2 = 'Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground, and they measure the gases. These clues help them warn people to leave their homes in time.';
const MINE = 'Last weekend we went to the libary. There was alot of books about space, and we read until it was dark outside.';
const answer = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 5, output_tokens: 5 } });
A.hooks.create = async p => {
  const s = p.messages[0].content;
  if (s.includes('<topic>')) return answer({ passages: [{ title: 'Inside a volcano', text: X1 }, { title: 'Volcano scientists', text: X2 }] });
  if (s.includes('<passage>')) return answer({ flags: [{ text: 'libary.', fix: 'library.', why: 'Library has an r after the b.' }, { text: 'alot', fix: 'a lot', why: '"A lot" is two words.' }] });
  const n = (s.match(/Students see:/g) || []).length;
  return answer({ lines: Array.from({ length: n }, (_, i) => `Oomba's reason number ${i + 1}, in kid words.`) });
};

let browser;
test.before(async () => { if (skip) return; browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { if (browser) await browser.close(); A.hooks.create = null; });
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
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
let setId = '', clId = '', stepId = '';

test('a teacher: Power with AI, Check my passage, why lines to review, then Assign to class for a grade', { skip, timeout: 240_000 }, async () => {
  const t = await open(teacher, '/play/mistake-hunt', LAPTOP);
  const f = await frameOf(t.page);
  await f.waitForFunction(() => window.BRB.proofAi && window.BRB.proofAi.access === 'free');
  await f.click('#mh-make');
  // Power with AI: off by default; on, the topic, length and how many passages
  assert.equal(await f.getAttribute('#mh-ai-on', 'aria-checked'), 'false');
  await f.click('#mh-ai-on');
  await f.fill('#mh-ai-topic', 'How volcanoes work');
  await f.selectOption('#mh-ai-n', '2');
  assert.equal((await f.textContent('#mh-ai-go')).trim(), 'Write 2 passages');
  await f.click('#mh-ai-go');
  await f.waitForSelector('#mh-ailabel');
  assert.equal(await f.textContent('#mh-ailabel'), 'Written with AI. Read it before you save.');
  assert.match(await f.textContent('#mh-ai-msg'), /2 passages written/);
  const st = await f.evaluate(() => window.__brbTest.mhState());
  assert.deepEqual(st.draft.passages.map(p => p.x), [X1, X2], 'the AI\'s passages, kept exactly');
  assert.ok(st.draft.passages.every(p => p.m === st.draft.n), 'each passage planted by the builder\'s own count');
  assert.equal(await f.inputValue('#mh-title'), 'How volcanoes work');
  assert.match(await f.textContent('#mh-ai-left'), /free AI requests left today/);
  await shot(t.page, 'builder-ai-passages', true);
  assert.ok(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // Check my passage, on a third passage of the teacher's own: flags shown, nothing changed until accepted
  await f.click('#mh-addpassage');
  await f.fill('#mh-paste', MINE);
  await f.click('#mh-scan');
  await f.waitForSelector('#mh-scanlist li:nth-child(2)');
  assert.equal(await f.inputValue('#mh-paste'), MINE, 'nothing is applied on its own');
  assert.match(await f.textContent('#mh-scanmsg'), /may be real mistakes/);
  await f.locator('#mh-scanlist').scrollIntoViewIfNeeded();
  await shot(t.page, 'check-my-passage', true);
  await f.click('#mh-flag-ok-0');
  assert.equal(await f.inputValue('#mh-paste'), MINE.replace('libary.', 'library.'), 'only the accepted one');
  await f.click('#mh-scanlist button:has-text("Ignore")');
  assert.equal(await f.inputValue('#mh-paste'), MINE.replace('libary.', 'library.'), 'the ignored one stays as it was');
  assert.match(await f.textContent('#mh-scanmsg'), /All checked/);
  await f.click('#mh-use');
  await f.waitForSelector('#mh-mlist .mrow');
  // Save: Oomba drafts the why lines into the mistake list; the teacher edits one; Save again stores them
  await f.click('#mh-tab-0');
  await f.click('#mh-save');
  await f.waitForSelector('#mh-whyreview');
  assert.equal(await f.locator('#mh-share').count(), 0, 'not saved yet');
  const first = f.locator('#mh-mlist .whyin').first();
  assert.match(await first.inputValue(), /Oomba's reason number 1/);
  assert.ok(await f.locator('#mh-mlist .aichip').count() >= 1);
  await first.fill('Earth is a name, so it starts with a capital letter.');
  await f.locator('#mh-whyreview').evaluate(e => e.scrollIntoView({ block: 'start' }));
  await shot(t.page, 'why-line-review', true);
  await f.click('#mh-save');
  await f.waitForSelector('#mh-share');
  const code = (await f.textContent('#mh-sharecode')).trim();
  setId = G.codeToId(code);
  const saved = G.get(MH.id, setId);
  assert.equal(saved.items.length, 3);
  assert.equal(saved.items[0].m.filter(m => m.y).length, saved.items[0].m.length, 'every mistake has its why line');
  assert.ok(saved.items[0].m.some(m => m.y === 'Earth is a name, so it starts with a capital letter.' && m.ai === 1), 'the teacher\'s edit is stored');
  assert.ok(saved.items[2].x.includes('library.') && saved.items[2].x.includes('alot'));
  assert.deepEqual(t.errors, []);
  // Assign to class: the game opens the Assign page, with "Hand in for a grade"
  await Promise.all([t.page.waitForURL(/\/teach\/assign/), f.click('#mh-assign')]);
  await t.page.waitForSelector('#pa-go');
  await t.page.fill('#pa-d', isoDay(Date.now() + 7 * 864e5));
  await t.page.check('#pa-show');
  await shot(t.page, 'assign-dialog', true);
  assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await Promise.all([t.page.waitForURL(/\/progress\//), t.page.click('#pa-go')]);
  clId = /progress\/([^/?#]+)/.exec(t.page.url())[1];
  stepId = L.steps(L.getClassLesson(clId).lesson_id)[0].id;
  assert.equal(L.getStep(stepId).show_answers, 1);
  await t.c.close();
});

test('a student on an iPhone 13: opens the step from the lesson, taps to fix, hands in, sees the score; the teacher\'s progress page', { skip, timeout: 240_000 }, async () => {
  assert.ok(clId, 'the teacher test assigned it');
  const step = L.getStep(stepId), snap = PS.snapOf(step);
  const s = await open(mia, `/class/${cls.id}/lessons/${clId}`, { ...devices['iPhone 13'], deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion: 'reduce' });
  await Promise.all([s.page.waitForURL(/\/play\/mistake-hunt\?lesson=/), s.page.click(`a[href^="/play/mistake-hunt?lesson=${clId}"]`)]);
  const f = await frameOf(s.page);
  await f.waitForSelector('#mh-handin');
  await shot(s.page, 'student-play-iphone13');
  assert.equal(await f.evaluate(() => JSON.stringify(window.__brbTest.mhGraded()).includes('"key"')), false, 'no key in the frame');
  assert.equal(await f.evaluate(() => window.BRB.proofAi), null, 'no AI tools for a student');
  assert.equal(await f.locator('#mh-check').count(), 0, 'no Check in a graded step'); assert.equal(await f.locator('#mh-hint').count(), 0, 'no hints');
  // tap the first mistake's word, fix it in the sheet
  const k = C.key(snap.passages[0].x, snap.passages[0].m);
  await f.click(`#mh-ptext [data-a="${k[0].a}"]`);
  await f.waitForSelector('#mh-sheet');
  if (k[0].b - k[0].a > 1) await f.click('#mh-fixnext');
  await f.fill('#mh-fixin', k[0].right);
  await f.click('#mh-fixok');
  await f.waitForFunction(() => /Saved/.test(document.getElementById('mh-saved').textContent));
  // the rest of passage 1 through the test hook, then hand in (asked first)
  for (const x of k.slice(1)) await f.evaluate(([a, b, r]) => window.__brbTest.mhFix(a, b, r), [x.a, x.b, x.right]);
  await f.click('#mh-handin');
  await f.waitForSelector('#mh-handin-ask');
  assert.match(await f.textContent('#mh-handin-ask'), /Hand in your fixes\?/);
  await shot(s.page, 'student-handin-ask-iphone13');
  await f.click('#mh-handin-yes');
  await f.waitForSelector('#mh-gscore');
  const total = snap.passages.reduce((n, p) => n + p.m.length, 0), found = k.length;
  assert.equal(await f.textContent('#mh-gscore'), `You found ${found} of ${total} mistakes (${Math.round(100 * found / total)}%).`);
  assert.match(await f.textContent('#mh'), /Your teacher will show the answers after the due date/);
  assert.ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  await shot(s.page, 'student-handin-iphone13');
  await f.click('#mh-gwork');
  await f.waitForSelector('#mh-review-0 .tok.good');
  await shot(s.page, 'student-work-iphone13', true);
  assert.deepEqual(s.errors, []);
  await s.c.close();
  // leo hands in nothing changed, for the counts
  await fetch(`${live.base}/api/progress/${clId}/${stepId}/proofread`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(leo.id) }, body: JSON.stringify({ edits: snap.passages.map(() => []), handIn: true }) });
  // the teacher's progress page: counts per kind of mistake, each student's result
  const t = await open(teacher, `/class/${cls.id}/progress/${clId}`, LAPTOP);
  await t.page.waitForSelector('.pf-results');
  assert.match(await t.page.textContent('.pf-results'), /2 of 2 handed in/);
  assert.ok(await t.page.locator('.pf-kinds li').count() >= 2);
  await t.page.locator('.pf-results').scrollIntoViewIfNeeded();
  if (SHOTS) await t.page.locator('.pf-results').screenshot({ path: path.join(SHOTS, 'teacher-progress-by-kind.png') });
  await shot(t.page, 'teacher-progress', true);
  assert.deepEqual(t.errors, []);
  await t.c.close();
  void q;
});
