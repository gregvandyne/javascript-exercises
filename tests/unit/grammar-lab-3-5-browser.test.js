// Grammar Lab in a real browser, Phase 2 (band 3-5): a student plays three 3-5 lessons to mastery at a 390 px phone and
// at a 1366 px laptop, one wrong answer in each, each a different format: Avoiding Run-Ons (the error-fixing box: type
// the fix; after the wrong answer it turns into press-to-cycle through versions of the sentence), Selecting Evidence for
// Opinion Writing (judge the sentence in a short passage) and Correcting Shifts in Verb Tense (press-to-cycle on the
// verb, a review topic). Nothing is chosen when a question opens (a cycle opens on "Press to choose") and Submit stays
// off until the student acts; the wrong answer brings the calm notice and the hint; the mastery screen offers the next
// topic, worked out now in this band, and the topic's Mistake Hunt room where it has one. Then the run-on room is played
// and handed in, and a dark phone pass shows the band's other formats. No page errors and no sideways scroll.
// Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const GL = await import('../../server/services/grammar-lab.js');
const { proofCore } = await import('../../server/services/proof-core.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.GL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.resolve(import.meta.dirname, '../..');

if (!q.get("SELECT 1 FROM games WHERE slug='mistake-hunt'")) {
  const official = auth.getUserByName('OombaAcademy') || auth.createUser({ username: 'OombaAcademy', password: 'secret123' });
  const g = games.createGame(official.id, { title: 'Mistake Hunt', source: 'seed', slug: 'mistake-hunt' });
  const v = games.addVersion(g.id, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
}

let browser = null, server = null, base = '', skip = !pw ? 'needs Playwright' : false;
test.before(async () => {
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); server.keepAliveTimeout = 0;
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); config.grammarLab = false; config.grammarLabUsers = []; });

let n = 0;
const newKid = () => auth.createUser({ username: `gl35b${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '3-5', 1, 1, 0, NULL, 1)", u.id, id);
const sessionCookie = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
async function shot(page, tag, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png`, fullPage: false }); }
async function noSideScroll(page, where) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 4).map(e => `${e.tagName}.${e.className}`).join(' ')]);
  assert.ok(w[0] <= w[1] + 1, `${where}: no sideways scroll (${w[0]} > ${w[1]}: ${w[2]})`);
}
async function closeTip(page) {
  try { await page.waitForSelector('#gl-tip[open]', { timeout: 1500 }); } catch { return; }
  await page.click('#gl-tip-ok'); await page.waitForSelector('#gl-tip', { state: 'hidden' });
}
const waitFlashGone = page => page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 5000 });
const flat = s => String(s).replace(/\s+/g, ' ').trim();
/** The item on screen (the test reads the course data; the page never has the answer). */
async function itemOn(page, topic) {
  const t = GL.topic(topic);
  const seen = await page.evaluate(() => ({ fix: document.querySelector('#gl-fixbox').hidden ? null : document.querySelector('#gl-fix').value,
    prompt: document.querySelector('#gl-prompt').hidden ? null : document.querySelector('#gl-prompt').textContent,
    sentence: document.querySelector('#gl-sentence').textContent.replace(/\s+/g, ' ').trim() }));
  const it = t.items.find(x => (t.format === 'fix' ? x.text === flat(seen.fix) : t.format === 'passage' ? flat(x.options.join(' ')) === seen.sentence : x.prompt === seen.prompt));
  assert.ok(it, `the item on screen: ${JSON.stringify(seen)}`);
  return it;
}
/** Press the cycle control until it shows option k (it opens on "Press to choose"). */
async function cycleTo(page, it, k) {
  assert.equal((await page.textContent('#gl-cycle .gl-cycle-t')).trim(), 'Press to choose', 'the cycle opens on no option');
  for (let i = 0; i <= k; i++) await page.click('#gl-cycle');
  assert.equal(flat(await page.textContent('#gl-cycle .gl-cycle-t')), it.options[k]);
}
async function answer(page, topic, { wrong = false } = {}) {
  const t = GL.topic(topic), it = await itemOn(page, topic);
  assert.ok(await page.isDisabled('#gl-submit'), 'Submit is off until the student acts');
  // a wrong version the student types (never the sentence as it stands: that leaves Submit off)
  const k = wrong ? it.options.findIndex((o, i) => i !== it.answer[0] && o !== it.text) : it.answer[0];
  if (t.format === 'fix') {
    await page.fill('#gl-fix', wrong ? it.options[k] : it.right);
  } else if (t.format === 'passage') {
    assert.equal(await page.locator('#gl-sentence .gl-sent[aria-checked="true"]').count(), 0, 'nothing is chosen when a question opens');
    await page.click(`#gl-sentence .gl-sent[data-k="${k}"]`);
  } else await cycleTo(page, it, k);
  assert.ok(await page.isEnabled('#gl-submit'));
  await page.click('#gl-submit');
  return it;
}

const LESSONS = [
  { unit: 'fixing-sentences', topic: 'avoiding-run-ons', key: 'runon', room: true },
  { unit: 'evidence-for-an-opinion', topic: 'evidence-for-opinions', key: 'evidence', room: false },
  { unit: 'more-verbs-and-time', topic: 'tense-shifts', key: 'shift', room: true },
];

async function playLesson(page, tag, L) {
  const unitUrl = `/courses/grammar-lab/3-5/${L.unit}`, topicUrl = `${unitUrl}/${L.topic}`;
  const T = `${tag}-${L.key}`, tp = GL.topic(L.topic);
  await page.goto(base + '/courses/grammar-lab');
  if (L.key === 'runon') {
    await page.locator('#gl-band-3-5').scrollIntoViewIfNeeded();
    await shot(page, tag, '00-course-3-5'); await noSideScroll(page, 'course');
  }
  await page.click(`.gl-band-3-5 #gl-unit-${L.unit}`);
  await page.waitForURL(base + unitUrl);
  await shot(page, T, '01-unit');
  await noSideScroll(page, 'unit');
  await page.goto(base + topicUrl + '/card');
  // 3-5 cards are read aloud (owner, 2026-11-27); the voices are off in this test, so no button shows.
  assert.equal(await page.isVisible('#gl-listen'), false, 'no listen button while the voices are off');
  await shot(page, T, '02-card');
  await noSideScroll(page, 'card');
  await page.goto(base + topicUrl);
  await page.waitForSelector('#gl-welcome:not([hidden])');
  await page.click('#gl-skip');
  await page.waitForSelector('#gl-quiz:not([hidden])');
  await closeTip(page);
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 12');
  if (tp.format === 'fix') {
    // Submit stays off while the sentence is unchanged.
    await page.fill('#gl-fix', (await page.inputValue('#gl-fix')) + ' ');
    assert.ok(await page.isDisabled('#gl-submit'), 'spaces alone change nothing');
  }
  await shot(page, T, '03-question');
  await noSideScroll(page, 'question');
  // One wrong answer: the calm notice, one more question, the hint (which never gives the answer).
  const it = await answer(page, L.topic, { wrong: true });
  await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 13');
  await page.click('#gl-hint-btn');
  await page.waitForSelector('#gl-hint:not([hidden])');
  assert.equal(await page.textContent('#gl-hint-text'), it.hint);
  await shot(page, T, '04-wrong-hint');
  await noSideScroll(page, 'hint');
  // Fix it.
  if (tp.format === 'fix') {
    // The box turned into press-to-cycle through versions of the sentence.
    assert.ok(await page.isHidden('#gl-fixbox'));
    assert.match(await page.textContent('#gl-notice'), /press the sentence/);
    assert.ok(await page.isDisabled('#gl-submit'));
    await cycleTo(page, it, it.answer[0]);
  } else if (tp.format === 'passage') await page.click(`#gl-sentence .gl-sent[data-k="${it.answer[0]}"]`);
  else { const k = it.answer[0]; const shownNow = flat(await page.textContent('#gl-cycle .gl-cycle-t')); let at = it.options.indexOf(shownNow); while (at !== k) { await page.click('#gl-cycle'); at = (at + 1) % it.options.length; } }
  await shot(page, T, '05-fixing');
  await page.click('#gl-submit');
  await page.waitForSelector('#gl-correct:not([hidden])');
  await shot(page, T, '06-correct');
  await waitFlashGone(page);
  let levels = 0;
  for (let i = 0; i < 20; i++) {
    if (await page.isVisible('#gl-done')) break;
    if (await page.isVisible('#gl-level')) { levels++; await page.click('#gl-level-next'); continue; }
    await answer(page, L.topic);
    await page.waitForSelector('#gl-correct:not([hidden])');
    await waitFlashGone(page);
  }
  assert.equal(levels, 2);
  await page.waitForSelector('#gl-done:not([hidden])');
  assert.equal(await page.textContent('#gl-done-n'), 'You answered 13 questions. That is 12 questions, plus 1 for a miss.');
  // The next topic, worked out now in this band (never a mastered one), and the room where there is one.
  assert.equal(await page.getAttribute('#gl-done-next', 'aria-label'), 'Next: Identifying Adjectives');
  assert.match(await page.getAttribute('#gl-done-next', 'href'), /^\/courses\/grammar-lab\/3-5\//);
  assert.equal(await page.isVisible('#gl-done-room'), L.room);
  await page.waitForTimeout(2600);
  await shot(page, T, '07-mastered');
  await noSideScroll(page, 'mastery');
  await page.click('#gl-done-back');
  await page.waitForURL(base + unitUrl);
  assert.equal(await page.getAttribute(`#gl-topic-${L.topic}`, 'class'), 'gl-tile gl-mastered');
  await shot(page, T, '08-unit-after');
  await page.goto(base + topicUrl + '/review');
  assert.equal(await page.locator('.gl-review li').count(), 13);
  await shot(page, T, '09-review');
}

async function playRoom(page, tag, L) {
  const T = `${tag}-${L.key}`;
  await page.goto(`${base}/courses/grammar-lab/3-5/${L.unit}`);
  await page.click(`#gl-topic-${L.topic} summary`);
  await Promise.all([page.waitForURL(/\/play\/mistake-hunt\?glroom=/), page.click(`#gl-topic-${L.topic} a.gl-mi[href*="glroom"]`)]);
  await page.waitForSelector('#gameframe');
  const f = await (await page.$('#gameframe')).contentFrame();
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState);
  await f.waitForSelector('#mh-handin');
  await page.waitForTimeout(500);
  await shot(page, T, '10-room');
  const P = proofCore(), p = GL.room(L.topic).passages[0];
  const k = P.key(p.x, p.m);
  for (const x of k) await f.evaluate(([a, b, s]) => window.__brbTest.mhFix(a, b, s), [x.a, x.b, x.right]);
  await f.click('#mh-handin');
  await f.waitForSelector('#mh-handin-yes');
  await f.click('#mh-handin-yes');
  await f.waitForSelector('#mh-gscore');
  assert.match(await f.textContent('#mh'), /You found enough mistakes to pass this room!/);
  await shot(page, T, '11-room-handed-in');
  await noSideScroll(page, 'room');
  await page.goto(`${base}/courses/grammar-lab/3-5/${L.unit}`);
  assert.match(await page.textContent(`#gl-topic-${L.topic}`), /Proofread room done/);
  await shot(page, T, '12-unit-room-done');
}

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  const tag = `${size.width}`;
  test(`a student plays three 3-5 lessons to mastery at ${size.width} px, one wrong answer in each, and a Mistake Hunt room`, { timeout: 240_000 }, async t => {
    if (skip) return t.skip(skip);
    const ctx = await browser.newContext({ viewport: size, colorScheme: 'light', reducedMotion: 'no-preference' });
    const kid = newKid();
    for (const id of ['identifying-action-verbs', 'recognizing-fragments', 'progressive-verbs']) master(kid, id);
    await ctx.addCookies([sessionCookie(kid.id)]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      for (const L of LESSONS) await playLesson(page, tag, L);
      await playRoom(page, tag, LESSONS[0]);
    } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
    for (const L of LESSONS) assert.ok(GL.masteredSet(kid).has(L.topic));
    assert.ok(GL.roomPassedSet(kid).has('avoiding-run-ons'));
  });
}

test('the other 3-5 formats on a phone, dark: whole-sentence joins, sentence or fragment, showing vs. telling, the dialogue fix, a writing card', { timeout: 120_000 }, async t => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const kid = newKid();
  for (const id of ['identifying-action-verbs', 'compound-sentences']) master(kid, id);
  await ctx.addCookies([sessionCookie(kid.id)]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${base}/courses/grammar-lab/3-5/showing-not-telling/showing-with-actions/card`);
    await shot(page, '390-dark-show', '02-card');
    await noSideScroll(page, 'writing card');
    for (const [unit, topic, key] of [['building-sentences', 'complex-sentences', 'complex'], ['fixing-sentences', 'recognizing-fragments', 'fragment'],
      ['showing-not-telling', 'showing-with-actions', 'show'], ['quotes-and-dialogue', 'quotation-marks-in-dialogue', 'dialogue'], ['more-verbs-and-time', 'progressive-verbs', 'progressive']]) {
      await page.goto(`${base}/courses/grammar-lab/3-5/${unit}/${topic}`);
      await page.click('#gl-skip');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await closeTip(page);
      assert.ok(await page.isDisabled('#gl-submit'));
      if (key === 'complex') assert.ok(await page.isVisible('#gl-prompt'), 'the two thoughts above the choices');
      if (key === 'fragment') assert.deepEqual(await page.locator('#gl-options .gl-opt').allTextContents(), ['Complete sentence', 'Fragment']);
      if (key === 'show') assert.equal(await page.locator('#gl-options .gl-opt[aria-checked="true"]').count(), 0, 'never opens on the telling sentence');
      if (key === 'dialogue') assert.ok(await page.isVisible('#gl-fix'));
      await shot(page, `390-dark-${key}`, '03-question');
      if (key === 'dialogue') await page.fill('#gl-fix', 'Something else.');
      else if (key === 'progressive') await page.click('#gl-cycle');
      else await page.click('#gl-options .gl-opt >> nth=0');
      assert.ok(await page.isEnabled('#gl-submit'));
      await shot(page, `390-dark-${key}`, '04-picked');
      await noSideScroll(page, key);
    }
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});
