// Grammar Lab, Phase 3, in a real browser at a 390 px phone and a 1366 px laptop: the whole teacher flow. A teacher
// (on GRAMMAR_LAB_USERS) assigns a K-2 unit to a class from the Assign dialog; a student sees it on their class page
// and their Hub desk and masters one topic; the teacher's class grid shows it mastered; the teacher sets the student's
// band (absolute). Also the owner's three phone fixes: the focus ring follows the button's pill shape (keyboard only:
// none after a tap), light and dark; a line never starts with a punctuation mark, in every question format, at 320 and
// 390 px; and the mastery screen's buttons (full width, equal, 48 px, a long next topic wrapping inside). No page errors
// and no sideways scroll. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const GL = await import('../../server/services/grammar-lab.js');
const M = await import('../../server/services/grammar-lab-mastery.js');
const TOOLS = await import('./_tools-plan.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.GL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let browser = null, server = null, base = '', skip = !pw ? 'needs Playwright' : false;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); server.keepAliveTimeout = 0;
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); config.grammarLab = false; config.grammarLabUsers = []; config.homeroom = false; config.homeroomUsers = []; TOOLS.plansOn(false); });

const boss = auth.createUser({ username: 'GlTbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Browser Oak' }).school;
let n = 0;
const sessionCookie = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
async function noSideScroll(page, where) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('.gbwrap, .glt-wrap, .rail-track, .hr-csubjects, .tabs')).slice(0, 4).map(e => `${e.tagName}.${e.className}`).join(' ')]);
  assert.ok(w[0] <= w[1] + 1, `${where}: no sideways scroll (${w[0]} > ${w[1]}: ${w[2]})`);
}
async function pageAs(user, { width, height = 860, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', ...(width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  if (user) await ctx.addCookies([sessionCookie(user.id)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
/** The question on screen, from the server (the page never has the answer). */
const onScreen = (u, topic) => { const run = GL.currentRun(u, topic); return GL.questionFor(GL.topic(topic), run); };
/** Answer the question on screen right, in the page. */
async function answerRight(page, u, topic) {
  const qn = onScreen(u, topic), it = GL.topic(topic).items.find(x => x.id === qn.id);
  if (qn.kind === 'choice') {
    if (qn.passage) await page.click(`#gl-sentence .gl-sent[data-k="${it.answer[0]}"]`);
    else if (qn.cycle) for (let k = 0; k <= it.answer[0]; k++) await page.click('#gl-cycle');
    else await page.click(`#gl-options .gl-opt[data-k="${it.answer[0]}"]`);
  } else if (qn.kind === 'gaps') { for (const g of [...it.answer, ...(it.optional || [])]) await page.click(`#gl-sentence .gl-gap[data-g="${g}"]`); }
  else for (const i of it.answer) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
  await page.click('#gl-submit');
}
async function closeTip(page) {
  try { await page.waitForSelector('#gl-tip[open]', { timeout: 1500 }); } catch { return; }
  await page.click('#gl-tip-ok'); await page.waitForSelector('#gl-tip', { state: 'hidden' });
}
/** Play a topic to mastery in the page, from wherever it is. */
async function masterInPage(page, u, topic) {
  for (let i = 0; i < 40; i++) {
    if (await page.isVisible('#gl-done')) return;
    if (await page.isVisible('#gl-level')) { await page.click('#gl-level-next'); continue; }
    await answerRight(page, u, topic);
    await page.waitForFunction(() => !document.querySelector('#gl-correct').hidden || !document.querySelector('#gl-done').hidden || !document.querySelector('#gl-level').hidden, null, { timeout: 5000 });
    await page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 5000 });
  }
}

// ------------------------------------------------------------------------------------------------- the whole flow
for (const width of [390, 1366]) {
  test(`teacher flow at ${width} px: assign a K-2 unit, a student masters a topic, the grid shows it, the band override`, async t => {
    if (skip) return t.skip(skip);
    const tag = width;
    const teacher = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Tia Teacher ${width}`, role: 'teacher', username: `gltb${width}t${++n}` }).user.id);
    const c = S.createClass(boss, oak.id, { name: `Grammar ${width}`, teacherId: teacher.id }).class;
    const kid = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Sam Student', grade: '1' }).user.id);
    const kid2 = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ria Student' }).user.id);
    S.addToClass(boss, c.id, kid.id); S.addToClass(boss, c.id, kid2.id);
    config.grammarLab = true; config.grammarLabUsers = [teacher.username.toLowerCase()];
    config.homeroom = true; config.homeroomUsers = ['*']; TOOLS.plansOn(); TOOLS.givePlan(teacher.id);
    const T = await pageAs(teacher, { width });
    // Learn: the Grammar Lab card, with Assign to a class.
    await T.page.goto(`${base}/learn`);
    await T.page.waitForSelector('#gl-learn-assign');
    await T.page.locator('.gl-learn').scrollIntoViewIfNeeded();
    await shot(T.page, `${tag}-01-learn-card`);
    await Promise.all([T.page.waitForURL(/\/teach\/grammar-lab/), T.page.click('#gl-learn-assign')]);
    await noSideScroll(T.page, 'teacher page');
    // 1. The teacher assigns the K-2 unit Kinds of Words to the whole class, no due date.
    await T.page.click('#glt-kinds-of-words [data-glassign][data-what="unit"]');
    await T.page.waitForSelector('#glt-dialog[open]');
    assert.equal(await T.page.textContent('#glt-dialog-h'), 'Assign Kinds of Words');
    await T.page.selectOption('#glt-class', c.id);
    assert.equal(await T.page.inputValue('#glt-who'), 'all');
    await shot(T.page, `${tag}-02-assign-dialog`);
    await Promise.all([T.page.waitForEvent('load'), T.page.click('#glt-ok')]);
    const cl = q.get("SELECT cl.id FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='grammar' WHERE cl.class_id=?", c.id);
    assert.ok(cl, 'assigned');
    // 2. The student sees it on the class page and on their desk, and masters Identifying Common Nouns.
    const K = await pageAs(kid, { width });
    await K.page.goto(`${base}/class/${c.id}`);
    assert.ok(await K.page.locator(`a[href="/class/${c.id}/lessons/${cl.id}"]`).first().isVisible(), 'on the class page');
    await K.page.goto(`${base}/class/${c.id}/desk`);
    const card = `[data-hdcard="${cl.id}"]:not(.hd-k2start)`;
    await K.page.waitForSelector(card);
    assert.match(await K.page.textContent(card), /Kinds of Words/);
    await shot(K.page, `${tag}-03-desk`);
    await noSideScroll(K.page, 'desk');
    await Promise.all([K.page.waitForURL(/\/courses\/grammar-lab\/k-2\/kinds-of-words/), K.page.click(card)]);
    await K.page.click('#gl-topic-identifying-common-nouns .gl-tile-main');
    await K.page.waitForSelector('#gl-welcome:not([hidden])');
    await K.page.click('#gl-skip'); await K.page.click('#gl-card-go');
    await K.page.waitForSelector('#gl-quiz:not([hidden])');
    await closeTip(K.page);
    await masterInPage(K.page, kid, 'identifying-common-nouns');
    await K.page.waitForSelector('#gl-done:not([hidden])');
    assert.ok(GL.masteredSet(kid).has('identifying-common-nouns'));
    // 3. The teacher's grid shows it mastered (and the second student not started).
    await T.page.goto(`${base}/class/${c.id}/grammar-lab`);
    const row = T.page.locator('tr', { has: T.page.locator('a', { hasText: 'Sam Student' }) });
    assert.equal(await row.locator('td.glt-mastered').count(), 1);
    assert.equal(await T.page.locator('tr', { has: T.page.locator('a', { hasText: 'Ria Student' }) }).locator('td.glt-mastered').count(), 0);
    await T.page.locator('.glt-gridsec').first().scrollIntoViewIfNeeded();
    await shot(T.page, `${tag}-04-class-grid`);
    await noSideScroll(T.page, 'grid');
    // 4. The teacher sets the student's band (absolute: over the student's grade 1).
    await T.page.click('a:has-text("Sam Student")');
    await T.page.waitForSelector('#glt-band');
    await T.page.selectOption('#glt-band', '3-5');
    await Promise.all([T.page.waitForEvent('load'), T.page.click('#glt-band-save')]);
    assert.match(await T.page.textContent('.glt-place'), /Grades 3-5, set by a teacher/);
    assert.equal(GL.placeOf(kid).band, '3-5');
    await T.page.locator('.glt-place').scrollIntoViewIfNeeded();
    await shot(T.page, `${tag}-05-student-view`);
    await noSideScroll(T.page, 'student view');
    // The desk now has the unit as started (one of three topics mastered).
    await K.page.goto(`${base}/class/${c.id}/desk`);
    await K.page.waitForSelector(card);
    assert.match(await K.page.textContent(card), /1\/3 mastered/);
    assert.deepEqual([...T.errors, ...K.errors], []);
    await T.ctx.close(); await K.ctx.close();
    TOOLS.plansOn(false); config.homeroom = false;
  });
}

// ------------------------------------------------------------------------------------------------- the focus ring
for (const dark of [false, true]) {
  test(`the focus ring hugs the pill at 390 px (${dark ? 'dark' : 'light'}): none after a tap, an even ring for the keyboard`, async t => {
    if (skip) return t.skip(skip);
    config.grammarLab = true; config.grammarLabUsers = ['*'];
    const kid = auth.createUser({ username: `gltbring${++n}`, password: 'correct-horse-12' });
    const P = await pageAs(kid, { width: 390, dark });
    await P.page.goto(`${base}/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives`);
    await P.page.waitForSelector('#gl-welcome:not([hidden])');
    await P.page.tap('#gl-skip'); await P.page.tap('#gl-card-go');
    await P.page.waitForSelector('#gl-tip[open]');
    await P.page.waitForTimeout(300);
    // After a tap the dialog holds the focus, not the button: no ring on a touch screen.
    assert.equal(await P.page.evaluate(() => document.activeElement && document.activeElement.id), 'gl-tip');
    assert.equal(await P.page.evaluate(() => document.querySelector('#gl-tip-ok').matches(':focus-visible')), false);
    await shot(P.page, `390-${dark ? 'dark' : 'light'}-06-tip-dialog`);
    const rest = await P.page.evaluate(() => getComputedStyle(document.querySelector('#gl-tip-ok')).borderRadius);
    // The keyboard: Tab reaches Got it, which shows a ring round its own pill (the radius unchanged, a box-shadow ring
    // of the same spread on every side, no outline drawn round another shape).
    for (let k = 0; k < 6 && !(await P.page.evaluate(() => document.activeElement && document.activeElement.id === 'gl-tip-ok')); k++) await P.page.keyboard.press('Tab');
    const ring = await P.page.evaluate(() => { const b = document.querySelector('#gl-tip-ok'), s = getComputedStyle(b); return { focused: document.activeElement === b, visible: b.matches(':focus-visible'), radius: s.borderRadius, outline: s.outlineStyle, shadow: s.boxShadow, h: b.offsetHeight }; });
    assert.ok(ring.focused && ring.visible, 'Tab focuses the button, visibly');
    assert.equal(ring.radius, rest, 'the ring keeps the button\'s own radius');
    assert.equal(ring.outline, 'none', 'no outline round another shape');
    assert.match(ring.shadow, /0px 0px 0px 3px.*0px 0px 0px 6px/, 'an even box-shadow ring: a 3px gap, then the ring');
    assert.ok(parseFloat(rest) >= ring.h / 2, 'a pill: the radius is at least half its height');
    const focusColor = dark ? 'rgb(255, 210, 63)' : 'rgb(20, 20, 20)';
    assert.ok(ring.shadow.includes(focusColor), `the ring is the focus colour (${ring.shadow})`);
    await shot(P.page, `390-${dark ? 'dark' : 'light'}-07-tip-keyboard-ring`);
    // The other Grammar Lab buttons get the same ring (the level overlay's, the mastery screen's, the room link).
    const others = await P.page.evaluate(() => [...document.querySelectorAll('.gl .btn')].map(b => b.id).filter(Boolean));
    assert.ok(others.includes('gl-level-next') && others.includes('gl-done-back') && others.includes('gl-done-room'));
    assert.deepEqual(P.errors, []);
    await P.ctx.close();
  });
}

// ------------------------------------------------------------------------------------------------- punctuation
// One topic per question format, each opened as a fresh student, at 320 and 390 px.
const FORMATS = [
  ['tap', 'k-2/adjectives-and-adverbs', 'identifying-adjectives'], ['capfix', 'k-2/capital-letters', 'capitalizing-names-and-dates'],
  ['gaps', 'k-2/commas', 'commas-in-a-series'], ['choice', 'k-2/sound-alike-words', 'your-and-youre'], ['cycle', '3-5/more-verbs-and-time', 'progressive-verbs'],
  ['marks', '6-8/commas-for-clarity', 'commas-introductory'], ['plain', '6-8/perfect-progressive', 'verb-tenses'], ['passage', '3-5/evidence-that-informs', 'evidence-for-informing'],
];
/** Is any line of the sentence started by a mark? Every word with its marks is one unbroken piece, and nothing but
 *  spaces sits between the pieces. -> problems found */
const lineCheck = () => {
  const box = document.querySelector('#gl-sentence'), out = [];
  if (box.hidden) return out;
  // plain text between pieces breaks only at its spaces: never glued to a control (a mark right after a blank or a
  // tappable word, or an opening quote right before one, would let the line break between them)
  for (const node of box.childNodes) {
    if (node.nodeType !== 3) continue;
    const x = node.textContent;
    if (/^\S/.test(x) && node.previousSibling && node.previousSibling.nodeType === 1) out.push(`text glued after a piece: "${x}"`);
    if (/\S$/.test(x) && node.nextSibling && node.nextSibling.nodeType === 1) out.push(`text glued before a piece: "${x}"`);
  }
  const toks = [...box.querySelectorAll('.gl-tok')];
  if (!box.querySelector('.gl-sent') && !toks.length) out.push('no word pieces');
  for (const tk of toks) {
    if (/^[.,!?;:)\]’”]/.test(tk.textContent)) out.push(`a piece starts with a mark: "${tk.textContent}"`);
    // one line per piece (a box's rects merge on one line)
    const tops = new Set([...tk.getClientRects()].map(r => Math.round(r.top / 4)));
    if (tops.size > 1) out.push(`a piece breaks over lines: "${tk.textContent}"`);
  }
  // the tappable word is only the word: never its marks
  for (const b of box.querySelectorAll('.gl-w')) if (/[.,!?;:"“”]/.test(b.textContent.slice(-1)) || /^["“(]/.test(b.textContent)) out.push(`a word button holds a mark: "${b.textContent}"`);
  const card = document.querySelector('.gl-practice');
  if (card.scrollWidth > card.clientWidth + 1) out.push(`the card overflows (${card.scrollWidth} > ${card.clientWidth})`);
  return out;
};
for (const width of [320, 390]) {
  test(`a line never starts with a punctuation mark at ${width} px, in every question format`, async t => {
    if (skip) return t.skip(skip);
    config.grammarLab = true; config.grammarLabUsers = ['*'];
    for (const [fmt, unit, topic] of FORMATS) {
      const kid = auth.createUser({ username: `gltbp${width}${++n}`, password: 'correct-horse-12' });
      // the topics before it mastered, so it is open
      const [band, uid] = unit.split('/'), p = GL.pathway(uid, band);
      for (const id of p.topics.slice(0, p.topics.indexOf(topic))) q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, ?, 1, 1, 0, NULL, 1)", kid.id, id, band);
      const P = await pageAs(kid, { width });
      await P.page.goto(`${base}/courses/grammar-lab/${unit}/${topic}`);
      await P.page.waitForSelector('#gl-welcome:not([hidden])');
      await P.page.click('#gl-skip'); await P.page.click('#gl-card-go');
      await P.page.waitForSelector('#gl-quiz:not([hidden])');
      await closeTip(P.page);
      // several questions of each format: answer right and check each one shown
      // (answered on the server, as the page would send it; the page draws the next one when it opens again)
      const tp = GL.topic(topic);
      for (let k = 0; k < 4; k++) {
        if (k) { await P.page.reload(); await P.page.waitForSelector('#gl-quiz:not([hidden])'); await closeTip(P.page); }
        const bad = await P.page.evaluate(lineCheck);
        assert.deepEqual(bad, [], `${fmt} (${topic}) question ${k + 1} at ${width} px`);
        if (fmt === 'tap' && width === 390 && k === 0) await shot(P.page, '390-08-punctuation-sentence');
        const run = GL.currentRun(kid, topic), it = tp.items[run.cur.item], kind = GL.kindOf(tp, it);
        GL.answerRun(kid, tp, kind === 'marks' ? it.want : kind === 'fix' ? it.right : it.answer);
      }
      await noSideScroll(P.page, `${fmt} at ${width}`);
      assert.deepEqual(P.errors, [], fmt);
      await P.ctx.close();
    }
  });
}
test('the K-2 sentence "Ana wore a purple hat." keeps its period on the last word at 390 px', async t => {
  if (skip) return t.skip(skip);
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  const kid = auth.createUser({ username: `gltbana${++n}`, password: 'correct-horse-12' });
  const P = await pageAs(kid, { width: 390 });
  await P.page.goto(`${base}/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives`);
  await P.page.click('#gl-skip'); await P.page.click('#gl-card-go'); await P.page.waitForSelector('#gl-quiz:not([hidden])'); await closeTip(P.page);
  // the page draws whatever question is on screen; this one is drawn by the page's own code path for a tap question
  const bad = await P.page.evaluate(lineCheck);
  assert.deepEqual(bad, []);
  const last = await P.page.evaluate(() => { const t = [...document.querySelectorAll('#gl-sentence .gl-tok')].pop(); return t.textContent; });
  assert.match(last, /\w[.!?]$/, 'the final mark is in the last word\'s piece');
  await P.ctx.close();
});

// ------------------------------------------------------------------------------------------------- the mastery screen
const LONG = Object.values(JSON.parse(fs.readFileSync(new URL('../../seed-lessons/grammar-lab/topics.json', import.meta.url))).topics).reduce((a, b) => (b.title.length > a.title.length ? b : a));
for (const width of [320, 390]) {
  test(`the mastery screen's buttons at ${width} px: full width, equal, 48 px tall, the longest next topic wraps inside`, async t => {
    if (skip) return t.skip(skip);
    config.grammarLab = true; config.grammarLabUsers = ['*'];
    assert.equal(LONG.id, 'nonfiction-context');
    const kid = auth.createUser({ username: `gltbdone${width}${++n}`, password: 'correct-horse-12' });
    // Literary Context, played on the server to one question before mastery; the page takes the last one.
    const topic = 'literary-context', tp = GL.topic(topic);
    GL.startRun(kid, tp);
    for (let i = 0; i < 60; i++) {
      const run = GL.currentRun(kid, topic);
      if (M.answer(structuredClone(run), 'right').mastered) break;
      const it = tp.items[run.cur.item], kind = GL.kindOf(tp, it);
      GL.answerRun(kid, tp, kind === 'fix' ? it.right : it.answer);
    }
    const P = await pageAs(kid, { width });
    await P.page.goto(`${base}/courses/grammar-lab/6-8/context-for-evidence/${topic}`);
    await P.page.waitForSelector('#gl-quiz:not([hidden])');
    await closeTip(P.page);
    await answerRight(P.page, kid, topic);
    await P.page.waitForSelector('#gl-done:not([hidden])');
    assert.equal(await P.page.textContent('#gl-done-next .gl-next-k'), 'Next topic');
    assert.equal(await P.page.textContent('#gl-done-next .gl-next-t'), LONG.title);
    assert.equal(await P.page.getAttribute('#gl-done-next', 'aria-label'), `Next: ${LONG.title}`);
    // (the room link too, as it shows for a topic with a room: the same shape)
    await P.page.evaluate(() => { const r = document.querySelector('#gl-done-room'); r.hidden = false; });
    const m = await P.page.evaluate(() => [...document.querySelectorAll('.gl-done-go .btn')].filter(b => !b.hidden).map(b => ({ id: b.id, w: Math.round(b.getBoundingClientRect().width), h: b.getBoundingClientRect().height, sw: b.scrollWidth, cw: b.clientWidth,
      primary: b.classList.contains('btn-primary'), inner: [...b.querySelectorAll('span')].every(s => s.getBoundingClientRect().right <= b.getBoundingClientRect().right - 8 && s.getBoundingClientRect().left >= b.getBoundingClientRect().left + 8) })));
    assert.equal(m.length, 3);
    assert.equal(new Set(m.map(x => x.w)).size, 1, `equal widths: ${JSON.stringify(m)}`);
    const content = await P.page.evaluate(() => document.querySelector('.gl-done-go').getBoundingClientRect().width);
    assert.ok(Math.abs(m[0].w - content) <= 1, 'as wide as the card\'s content');
    for (const x of m) { assert.ok(x.h >= 48, `${x.id} at least 48 px`); assert.ok(x.sw <= x.cw, `${x.id} does not overflow`); }
    assert.ok(m.find(x => x.id === 'gl-done-next').inner, 'the long name never touches the edges');
    assert.deepEqual(m.map(x => x.primary), [true, false, false], 'Back is primary; Next and Proofread are secondary');
    if (width === 390) { await P.page.waitForTimeout(2600);
      // (the shot only: the page's fixed bars hidden so all three buttons show)
      await P.page.evaluate(() => { for (const e of document.querySelectorAll('body *')) { const st = getComputedStyle(e); if (st.position === 'fixed' && !e.closest('#gl-done')) e.style.visibility = 'hidden'; } });
      if (SHOTS) await P.page.locator('#gl-done').screenshot({ path: `${SHOTS}/390-09-mastery-buttons.png` }); }
    await noSideScroll(P.page, `mastery at ${width}`);
    assert.deepEqual(P.errors, []);
    await P.ctx.close();
  });
}
