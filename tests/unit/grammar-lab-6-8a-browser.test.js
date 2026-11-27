// Grammar Lab in a real browser, Phase 2 (band 6-8, part 1): a student plays three 6-8 lessons to mastery at a 390 px
// phone and at a 1366 px laptop, one wrong answer in each, each a different format: Commas with Dates (punctuation
// chips, with "It's right as it is" for a date that needs no comma), Capitalizing Quotes (click-to-fix capitalization
// both ways: a word takes its capital, or loses one it should not have) and Correcting FANBOYS Errors (the error-fixing
// box, which turns into press-to-cycle after a wrong answer). Nothing is chosen when a question opens and Submit stays
// off until the student acts; the wrong answer brings the calm notice and the hint; the mastery screen offers the next
// topic, worked out now in this band. Then a dark phone pass shows the band's other formats (two chips, a phrase to
// highlight, pills with the named word in bold, a judge-the-sentence passage, a writing card) and a sound-alike room is
// handed in. No page errors and no sideways scroll. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
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
const newKid = () => auth.createUser({ username: `gl68b${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, '6-8', 1, 1, 0, NULL, 1)", u.id, id);
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
/** The question on screen, as the server last sent it (the test then reads the course data for its item; the page
 *  itself never has the answer). */
function watch(page) {
  const box = { q: null };
  page.on('response', async r => {
    if (!/\/api\/courses\/grammar-lab\/topic\/[^/]+\/(start|answer)$/.test(r.url())) return;
    try { const j = await r.json(); if (j && j.question) box.q = j.question; } catch { /* not json */ }
  });
  return box;
}
const itemOf = (topic, id) => GL.topic(topic).items.find(it => it.id === id);

/** Set a punctuation-chips sentence to these marks ([[gap, mark]]), from the marks it shows now. */
async function setMarks(page, it, target) {
  const want = new Map(target);
  for (let g = 0; g < it.words.length - 1; g++) {
    const now = (await page.getAttribute(`#gl-sentence .gl-mgap[data-m="${g}"]`, 'data-mark')) || '';
    const to = want.get(g) || '';
    if (now === to) continue;
    const mark = to || now;
    if (await page.isVisible('#gl-chips')) await page.click(`#gl-chips .gl-chip[data-c="${mark}"]`);
    await page.click(`#gl-sentence .gl-mgap[data-m="${g}"]`);
    if (to && now) continue;
  }
}
/** Answer the question on screen, right or (wrong) with a plain mistake. */
async function answer(page, box, topic, { wrong = false, retry = false } = {}) {
  const qn = box.q, it = itemOf(topic, qn.id);
  assert.ok(it, `the item ${qn.id}`);
  if (!retry) assert.ok(await page.isDisabled('#gl-submit'), 'Submit is off until the student acts');
  if (qn.kind === 'marks') {
    const needsNone = it.want.length === new Map(it.start).size && it.want.every(([g, m]) => new Map(it.start).get(g) === m);
    if (wrong) {
      // a comma in a gap that takes none
      const g = [...Array(it.words.length - 1).keys()].find(x => !it.want.some(([h]) => h === x) && !it.optional.some(([h]) => h === x) && !it.start.some(([h]) => h === x));
      await setMarks(page, it, [...it.start, [g, ',']]);
    } else if (needsNone) await page.click('#gl-asis');
    else await setMarks(page, it, it.want);
  } else if (qn.kind === 'fix') {
    if (qn.options) {
      const k = wrong ? it.options.findIndex((_, i) => i !== it.answer[0]) : it.answer[0];
      assert.equal((await page.textContent('#gl-cycle .gl-cycle-t')).trim(), 'Press to choose');
      for (let i = 0; i <= k; i++) await page.click('#gl-cycle');
    } else if (wrong) await page.fill('#gl-fix', `${it.text.replace(/\.$/, '')} today.`);
    else if (it.right === it.text) await page.click('#gl-asis');
    else await page.fill('#gl-fix', it.right);
  } else if (qn.kind === 'tap') {
    const places = wrong ? [[...Array(qn.words.length).keys()].find(i => !it.answer.includes(i) && !(it.optional || []).includes(i))] : it.answer;
    for (const i of places) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
  } else if (qn.kind === 'choice') {
    const k = wrong ? it.options.findIndex((_, i) => i !== it.answer[0]) : it.answer[0];
    if (qn.passage) await page.click(`#gl-sentence .gl-sent[data-k="${k}"]`);
    else if (qn.cycle) for (let i = 0; i <= k; i++) await page.click('#gl-cycle');
    else await page.click(`#gl-options .gl-opt[data-k="${k}"]`);
  }
  assert.ok(await page.isEnabled('#gl-submit'));
  await page.click('#gl-submit');
  return it;
}

const LESSONS = [
  { unit: 'commas-for-formatting', topic: 'commas-dates', key: 'dates', next: 'Commas with Items in a Series' },
  { unit: 'embedding-quotations', topic: 'capitalizing-quotes', key: 'capquotes', next: 'Is There a Pause Before the Quote?' },
  { unit: 'choosing-conjunctions', topic: 'fanboys-errors', key: 'fanboys', next: null },
];

async function playLesson(page, box, tag, L) {
  const unitUrl = `/courses/grammar-lab/6-8/${L.unit}`, topicUrl = `${unitUrl}/${L.topic}`;
  const T = `${tag}-${L.key}`;
  if (L.key === 'dates') {
    await page.goto(base + '/courses/grammar-lab');
    await page.locator('#gl-band-6-8').scrollIntoViewIfNeeded();
    await shot(page, tag, '00-course-6-8'); await noSideScroll(page, 'course');
    await page.click(`.gl-band-6-8 #gl-unit-${L.unit}`);
    await page.waitForURL(base + unitUrl);
  } else await page.goto(base + unitUrl);
  await shot(page, T, '01-unit');
  await noSideScroll(page, 'unit');
  await page.goto(base + topicUrl + '/card');
  assert.equal(await page.isVisible('#gl-listen'), false, 'a 6-8 card is not read aloud');
  await shot(page, T, '02-card');
  await noSideScroll(page, 'card');
  await page.goto(base + topicUrl);
  await page.waitForSelector('#gl-welcome:not([hidden])');
  await page.click('#gl-skip');
  await page.waitForSelector('#gl-quiz:not([hidden])');
  await closeTip(page);
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 12');
  await shot(page, T, '03-question');
  await noSideScroll(page, 'question');
  // One wrong answer: the calm notice, one more question, the hint (which never gives the answer).
  const it = await answer(page, box, L.topic, { wrong: true });
  await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 13');
  await page.click('#gl-hint-btn');
  await page.waitForSelector('#gl-hint:not([hidden])');
  assert.equal(await page.textContent('#gl-hint-text'), it.hint);
  await shot(page, T, '04-wrong-hint');
  await noSideScroll(page, 'hint');
  if (it.format === 'fix') {
    // the box turned into press-to-cycle through versions of the sentence
    assert.ok(await page.isHidden('#gl-fixbox'));
    assert.ok(await page.isHidden('#gl-asis'));
    assert.ok(await page.isDisabled('#gl-submit'));
  } else if (it.format === 'marks') {
    // put the stray comma back out, then fix it right
    await setMarks(page, it, it.start);
    assert.ok(await page.isDisabled('#gl-submit'), 'the sentence as written again: nothing to submit');
  } else if (it.format === 'capfix' || it.format === 'tap') {
    for (const b of await page.$$('#gl-sentence .gl-w[aria-pressed="true"]')) await b.click();
  }
  await answer(page, box, L.topic, { retry: true });
  await page.waitForSelector('#gl-correct:not([hidden])');
  await shot(page, T, '05-correct');
  await waitFlashGone(page);
  let levels = 0;
  for (let i = 0; i < 24; i++) {
    if (await page.isVisible('#gl-done')) break;
    if (await page.isVisible('#gl-level')) { levels++; await page.click('#gl-level-next'); continue; }
    if (i === 3) await shot(page, T, '06-question');
    await answer(page, box, L.topic);
    await page.waitForSelector('#gl-correct:not([hidden])');
    await waitFlashGone(page);
  }
  assert.equal(levels, 2);
  await page.waitForSelector('#gl-done:not([hidden])');
  assert.equal(await page.textContent('#gl-done-n'), 'You answered 13 questions.');
  // the next topic, worked out now in this band (never a mastered one)
  if (L.next) assert.equal(await page.getAttribute('#gl-done-next', 'aria-label'), `Next: ${L.next}`);
  assert.match(await page.getAttribute('#gl-done-next', 'href'), /^\/courses\/grammar-lab\/6-8\//);
  await page.waitForTimeout(2600);
  await shot(page, T, '07-mastered');
  await noSideScroll(page, 'mastery');
  await page.click('#gl-done-back');
  await page.waitForURL(base + unitUrl);
  assert.equal(await page.getAttribute(`#gl-topic-${L.topic}`, 'class'), 'gl-tile gl-mastered');
  await page.goto(base + topicUrl + '/review');
  assert.equal(await page.locator('.gl-review li').count(), 13);
  await shot(page, T, '08-review');
}

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  const tag = `${size.width}`;
  test(`a student plays three 6-8 lessons to mastery at ${size.width} px, one wrong answer in each`, { timeout: 280_000 }, async t => {
    if (skip) return t.skip(skip);
    const ctx = await browser.newContext({ viewport: size, colorScheme: 'light', reducedMotion: 'no-preference' });
    const kid = newKid();
    for (const id of ['fanboys-identify', 'subordinating-identify', 'conj-adverbs-identify', 'choosing-fanboys', 'correlative-conjunctions']) master(kid, id);
    await ctx.addCookies([sessionCookie(kid.id)]);
    const page = await ctx.newPage();
    const box = watch(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try { for (const L of LESSONS) await playLesson(page, box, tag, L); } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
    for (const L of LESSONS) assert.ok(GL.masteredSet(kid).has(L.topic));
  });
}

test('the other 6-8 formats on a phone, dark, and a sound-alike Mistake Hunt room', { timeout: 200_000 }, async t => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const kid = newKid();
  for (const id of ['conj-adverbs-identify', 'conj-adverbs-start', 'complete-or-incomplete', 'sentence-subject', 'pronoun-subjects', 'sentence-verb', 'direct-objects', 'prepositions',
    'fanboys-identify', 'subordinating-identify', 'adjective-describes', 'adjectives-before-after', 'adverb-describes', 'adverbs-time-place-manner', 'strong-claims']) master(kid, id);
  await ctx.addCookies([sessionCookie(kid.id)]);
  const page = await ctx.newPage();
  const box = watch(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${base}/courses/grammar-lab/6-8/claims-evidence-reasoning/claims-evidence-reasoning/card`);
    assert.equal(await page.locator('.gl-section').count(), 3, 'a writing card has three sections');
    assert.equal(await page.locator('.gl-section .gl-guide').count(), 3, 'each with its guiding question');
    await shot(page, '390-dark-cer', '02-card');
    await noSideScroll(page, 'writing card');
    for (const [unit, topic, key] of [['compound-and-complex', 'conj-adverbs-middle', 'semicolon'], ['parts-of-a-sentence-2', 'dependent-clauses', 'clause'],
      ['adjectives-vs-adverbs', 'adverb-or-adjective', 'pills'], ['claims-evidence-reasoning', 'claims-evidence-reasoning', 'passage'], ['active-and-passive-voice', 'active-voice-verbs', 'tap']]) {
      await page.goto(`${base}/courses/grammar-lab/6-8/${unit}/${topic}`);
      await page.click('#gl-skip');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await closeTip(page);
      assert.ok(await page.isDisabled('#gl-submit'));
      if (key === 'semicolon') assert.deepEqual(await page.locator('#gl-chips .gl-chip').allTextContents(), [',', ';'], 'the chip bank');
      if (key === 'pills') { assert.deepEqual(await page.locator('#gl-options .gl-opt').allTextContents(), ['Adjective', 'Adverb']); assert.equal(await page.locator('#gl-sentence .gl-focus').count(), 1, 'the named word in bold'); }
      await shot(page, `390-dark-${key}`, '03-question');
      await answer(page, box, topic);
      await page.waitForSelector('#gl-correct:not([hidden])');
      await waitFlashGone(page);
      await shot(page, `390-dark-${key}`, '04-next');
      await noSideScroll(page, key);
    }
    // a sound-alike room: Mistake Hunt plants only the topic's own words; handed in with every fix, it passes
    await page.goto(`${base}/courses/grammar-lab/6-8/confused-words-1`);
    await page.click('#gl-topic-its-and-its summary');
    await Promise.all([page.waitForURL(/\/play\/mistake-hunt\?glroom=/), page.click('#gl-topic-its-and-its a.gl-mi[href*="glroom"]')]);
    await page.waitForSelector('#gameframe');
    const f = await (await page.$('#gameframe')).contentFrame();
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState);
    await f.waitForSelector('#mh-handin');
    await page.waitForTimeout(500);
    await shot(page, '390-dark-room', '10-room');
    const P = proofCore(), p = GL.room('its-and-its').passages[0];
    for (const x of P.key(p.x, p.m)) await f.evaluate(([a, b, s]) => window.__brbTest.mhFix(a, b, s), [x.a, x.b, x.right]);
    await f.click('#mh-handin');
    await f.waitForSelector('#mh-handin-yes');
    await f.click('#mh-handin-yes');
    await f.waitForSelector('#mh-gscore');
    assert.match(await f.textContent('#mh'), /You found enough mistakes to pass this room!/);
    await shot(page, '390-dark-room', '11-handed-in');
    await page.goto(`${base}/courses/grammar-lab/6-8/confused-words-1`);
    assert.match(await page.textContent('#gl-topic-its-and-its'), /Proofread room done/);
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
  assert.ok(GL.roomPassedSet(kid).has('its-and-its'));
});
