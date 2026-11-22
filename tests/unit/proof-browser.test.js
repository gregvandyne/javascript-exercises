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
import { ctx as live, publish, official, teacher, cls, mia, leo, cookieFor, q, RL, L, S } from './_live.js';
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
  // Assign to class: the game opens the Assign page; the teacher must choose "Hand in for a grade" or "Practice" first
  await Promise.all([t.page.waitForURL(/\/teach\/assign/), f.click('#mh-assign')]);
  await t.page.waitForSelector('#pf-choice');
  assert.equal(await t.page.isVisible('#pa-go'), false, 'no form before a choice');
  assert.equal(await t.page.isVisible('#ag-go'), false);
  assert.deepEqual(await t.page.$$eval('input[name="pf-mode"]', r => r.map(x => x.checked)), [false, false], 'nothing picked');
  if (process.env.MH_ASSIGN_SHOT) await t.page.screenshot({ path: process.env.MH_ASSIGN_SHOT, fullPage: true });
  await t.page.check('#pf-mode-practice');
  assert.ok(await t.page.isVisible('#ag-go')); assert.equal(await t.page.isVisible('#pa-go'), false, 'only the chosen form');
  await t.page.check('#pf-mode-grade');
  await t.page.waitForSelector('#pa-go');
  assert.equal(await t.page.isVisible('#ag-go'), false);
  assert.equal(await t.page.isChecked('#pa-hints'), false, 'Allow hints is off by default');
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

/** In the frame: is the element at the centre of this button the button itself (nothing laid over it)? */
const onTop = (f, sel) => f.evaluate(q => { const b = document.querySelector(q); b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && (e === b || b.contains(e)); }, sel);
/** A phone picture. Chromium's screenshot under device emulation with a device scale other than the device's own leaves
 *  the sandboxed (out-of-process) game frame's input mapping stale, so Playwright's next tap there lands on the wrong
 *  spot (a harness quirk: the page reports the button on top at its centre, and the same flow passes by touch with
 *  motion on at the iPhone's own scale). The picture run therefore presses buttons with a DOM click after a picture. */
const phoneShot = (page, name, full = false) => shot(page, name, full);
/** One student's whole hand-in on an iPhone 13, by touch, with motion on or reduced. -> how many were found */
async function studentFlow(user, { motion, pictures, fixFirst }) {
  const press = async (f, sel) => { if (pictures) await f.locator(sel).evaluate(b => b.click()); else await f.locator(sel).tap(); };
  const step = L.getStep(stepId), snap = PS.snapOf(step);
  const s = await open(user, `/class/${cls.id}/lessons/${clId}`, { ...devices['iPhone 13'], deviceScaleFactor: pictures && SHOTS ? 2 : 3, reducedMotion: motion ? 'no-preference' : 'reduce' });
  await Promise.all([s.page.waitForURL(/\/play\/mistake-hunt\?lesson=/), s.page.tap(`a[href^="/play/mistake-hunt?lesson=${clId}"]`)]);
  const f = await frameOf(s.page);
  await f.waitForSelector('#mh-handin');
  if (pictures) await phoneShot(s.page, 'student-play-iphone13');
  assert.equal(await f.evaluate(() => JSON.stringify(window.__brbTest.mhGraded()).includes('"key"')), false, 'no key in the frame');
  assert.equal(await f.evaluate(() => window.BRB.proofAi), null, 'no AI tools for a student');
  assert.equal(await f.locator('#mh-check').count(), 0, 'no Check in a graded step'); assert.equal(await f.locator('#mh-hint').count(), 0, 'no hints');
  const k = C.key(snap.passages[0].x, snap.passages[0].m);
  if (fixFirst) {
    // tap the first mistake's word, fix it in the sheet; the rest of passage 1 through the test hook
    await press(f, `#mh-ptext [data-a="${k[0].a}"]`);
    await f.waitForSelector('#mh-sheet');
    if (k[0].b - k[0].a > 1) await press(f, '#mh-fixnext');
    await f.fill('#mh-fixin', k[0].right);
    await press(f, '#mh-fixok');
    await f.waitForFunction(() => /Saved/.test(document.getElementById('mh-saved').textContent));
    for (const x of k.slice(1)) await f.evaluate(([a, b, r]) => window.__brbTest.mhFix(a, b, r), [x.a, x.b, x.right]);
  }
  await press(f, '#mh-handin');
  await f.waitForSelector('#mh-handin-ask');
  assert.match(await f.textContent('#mh-handin-ask'), /Hand in your fixes\?/);
  if (pictures) await phoneShot(s.page, 'student-handin-ask-iphone13');
  assert.ok(await onTop(f, '#mh-handin-yes'), 'nothing over Hand in');
  await press(f, '#mh-handin-yes');
  await f.waitForSelector('#mh-gscore');
  const total = snap.passages.reduce((n, p) => n + p.m.length, 0), found = fixFirst ? k.length : 0;
  assert.equal(await f.textContent('#mh-gscore'), `You found ${found} of ${total} mistakes (${Math.round(100 * found / total)}%).`);
  assert.match(await f.textContent('#mh'), /Your teacher will show the answers after the due date/);
  assert.ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  // the end card's buttons take a tap at once, while the confetti (motion on) is still falling
  assert.ok(await onTop(f, '#mh-gwork'), 'nothing over See my work');
  assert.equal(await f.evaluate(() => getComputedStyle(document.querySelector('.confetti') || document.body).pointerEvents), motion ? 'none' : 'auto');
  await press(f, '#mh-gwork');
  await f.waitForSelector('#mh-review-0');
  if (pictures) { await press(f, '#mh-review-back'); await f.waitForSelector('#mh-gscore'); await phoneShot(s.page, 'student-handin-iphone13'); await press(f, '#mh-gwork'); await f.waitForSelector('#mh-review-0 .tok.good'); await phoneShot(s.page, 'student-work-iphone13', true); }
  assert.deepEqual(s.errors, []);
  await s.c.close();
  return found;
}

test('students on an iPhone 13 by touch: open the step from the lesson, fix, hand in, see the score (motion on and reduced); the teacher\'s progress page', { skip, timeout: 240_000 }, async () => {
  assert.ok(clId, 'the teacher test assigned it');
  // by touch at the iPhone's own scale: motion on (the end card's confetti falling), and reduced motion
  await studentFlow(mia, { motion: true, pictures: false, fixFirst: true });
  await studentFlow(leo, { motion: false, pictures: false, fixFirst: false });
  // the pictures (device scale 2), by a third student
  if (SHOTS) { const pia = S.createSchoolAccount(teacher, cls.school_id, { rosterName: 'Pia Pupil' }).user; S.addToClass(teacher, cls.id, pia.id); await studentFlow(pia, { motion: true, pictures: true, fixFirst: true }); }
  // the teacher's progress page: counts per kind of mistake, each student's result
  const t = await open(teacher, `/class/${cls.id}/progress/${clId}`, LAPTOP);
  await t.page.waitForSelector('.pf-results');
  assert.match(await t.page.textContent('.pf-results'), SHOTS ? /3 of 3 handed in/ : /2 of 2 handed in/);
  assert.ok(await t.page.locator('.pf-kinds li').count() >= 2);
  await t.page.locator('.pf-results').scrollIntoViewIfNeeded();
  if (SHOTS) await t.page.locator('.pf-results').screenshot({ path: path.join(SHOTS, 'teacher-progress-by-kind.png') });
  await shot(t.page, 'teacher-progress', true);
  assert.deepEqual(t.errors, []);
  await t.c.close();
  void q;
});

test('hints a teacher allowed: a student on an iPhone 13 taps Hint, sees the sentence, then the kind; the server counts them', { skip, timeout: 120_000 }, async () => {
  assert.ok(setId, 'the teacher test saved a set');
  const r = PS.assignSet(teacher, setId, cls.id, { dueAt: isoDay(Date.now() + 7 * 864e5), hints: true });
  assert.ok(r.ok);
  const s = await open(mia, `/play/mistake-hunt?lesson=${r.classLesson.id}&step=${r.step.id}`, { ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const f = await frameOf(s.page);
  await f.waitForSelector('#mh-hint');
  assert.equal(await f.locator('#mh-check').count(), 0, 'still no Check in a graded step');
  await f.locator('#mh-hint').tap();
  await f.waitForSelector('#mh-hintcard');
  assert.ok(await f.locator('#mh-ptext .hintline').count() >= 1, 'the sentence is highlighted');
  assert.doesNotMatch(await f.textContent('#mh-hintcard'), /kind of mistake/);
  await f.locator('#mh-hint').tap();
  await f.waitForFunction(() => /kind of mistake/.test(document.getElementById('mh-hintcard').textContent));
  const row = q.get('SELECT hints FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', r.classLesson.id, r.step.id, mia.id);
  assert.equal(row.hints, 2);
  assert.equal(await f.evaluate(() => JSON.stringify(window.__brbTest.mhGraded()).includes('"key"')), false, 'still no key in the frame');
  assert.deepEqual(s.errors, []);
  await s.c.close();
});

test('the practice game\'s end card (Phase 1) takes a tap at once with motion on, on an iPhone 13', { skip, timeout: 120_000 }, async () => {
  const s = await open(leo, '/play/mistake-hunt', { ...devices['iPhone 13'], reducedMotion: 'no-preference' });
  const f = await frameOf(s.page);
  await f.evaluate(() => window.__brbTest.mhSample());
  for (const x of await f.evaluate(() => window.__brbTest.mhKey())) await f.evaluate(([a, b, r]) => window.__brbTest.mhFix(a, b, r), [x.a, x.b, x.right]);
  await f.locator('#mh-check').tap();
  await f.locator('#mh-next').tap();
  await f.waitForSelector('#mh-endscore');
  assert.equal(await f.evaluate(() => getComputedStyle(document.querySelector('.confetti')).pointerEvents), 'none', 'the confetti is falling and takes no taps');
  assert.ok(await onTop(f, '#mh-again'), 'nothing over Play again');
  await f.locator('#mh-again').tap();
  await f.waitForSelector('#mh-ptext');
  assert.deepEqual(s.errors, []);
  await s.c.close();
});
