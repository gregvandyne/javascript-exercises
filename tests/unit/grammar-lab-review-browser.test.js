// Grammar Lab: the owner's review fixes in a real browser at a 390 x 844 phone (2026-11-27). The intro's rule and
// counts; a one-word answer moves its pick, a phrase still toggles (with its near miss); a wrong answer clears the
// picks; a missed question comes back as "Try this one again"; "Fixed it!" after a wrong answer; the counter's "+1 for
// a miss"; the first-try line; a failed try re-syncs (a dropped request, a run finished on another device, a sign-in
// that ended); a loading state within 100 ms while the scripts are slow; nothing under the bottom nav on any screen;
// the hint opens above Submit and in view; a typical four-option question fits; a new question's line is never under
// the top bar, in every format; the proofread room follows the theme; the two adverb topics. Light and dark
// screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const GL = await import('../../server/services/grammar-lab.js');
const games = await import('../../server/services/games.js');

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

const W = 390, HGT = 844, TOP = 64, TABBAR = 66;
let n = 0;
const newKid = () => auth.createUser({ username: `glrv${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const sessionCookie = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
const master = (u, id) => q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, 'k-2', 1, 1, 0, NULL, 1)", u.id, id);
/** Every topic before this one in its unit mastered, so it is open. */
const openUp = (u, band, unit, topic) => { const p = GL.pathway(unit, band); for (const id of p.topics.slice(0, p.topics.indexOf(topic))) master(u, id); };
async function pageAs(user, { dark = false, width = W, height = HGT } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (user) await ctx.addCookies([sessionCookie(user.id)]);
  // the double-tap tip has been seen (it is not what these tests look at)
  await ctx.addInitScript(() => { try { localStorage.setItem('gl:tip-seen', '1'); } catch { /* storage off */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
async function shot(page, name, dark) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dark ? 'dark' : 'light'}-${name}.png`, fullPage: false }); }
const flashGone = page => page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 6000 });
/** The question on screen, from the server (the page never has the answer). */
const onScreen = (u, topic) => GL.questionFor(GL.topic(topic), GL.currentRun(u, topic));
const itemOf = (topic, id) => GL.topic(topic).items.find(x => x.id === id);
/** Answer the question on screen right, in the page, in any format. */
async function answerRight(page, u, topic, { submit = true } = {}) {
  const qn = onScreen(u, topic), it = itemOf(topic, qn.id);
  if (qn.kind === 'choice') {
    if (qn.passage) await page.click(`#gl-sentence .gl-sent[data-k="${it.answer[0]}"]`);
    else if (qn.cycle) for (let k = 0; k <= it.answer[0]; k++) await page.click('#gl-cycle');
    else await page.click(`#gl-options .gl-opt[data-k="${it.answer[0]}"]`);
  } else if (qn.kind === 'gaps') { for (const g of it.answer) await page.click(`#gl-sentence .gl-gap[data-g="${g}"]`); }
  else if (qn.kind === 'fix') await page.fill('#gl-fix', it.accept[0]);
  else if (qn.kind === 'marks') {
    // (with nothing to change, the optional comma goes in: right with or without it)
    const now = new Map(it.start), want = new Map(it.want);
    if ([...want].every(([g, m]) => now.get(g) === m) && [...now].every(([g, m]) => want.get(g) === m)) for (const [g, m] of it.optional || []) want.set(g, m);
    for (let g = 0; g < it.words.length - 1; g++) {
      const have = now.get(g), need = want.get(g);
      if (have === need) continue;
      const chip = need || have;
      if (await page.isVisible('#gl-chips')) await page.click(`#gl-chips .gl-chip[data-c="${chip}"]`);
      if (have && need) await page.click(`#gl-sentence .gl-mgap[data-m="${g}"]`);   // clears the old mark
      await page.click(`#gl-sentence .gl-mgap[data-m="${g}"]`);
    }
  } else for (const i of it.answer) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
  if (submit) await page.click('#gl-submit');
}
/** The fixed bottom nav's top edge (the viewport's bottom when there is none). */
const navTop = page => page.evaluate(() => { const t = document.querySelector('.tabbar'); return t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().top : innerHeight; });
/** Play the run through the API to its last question (one miss on the way). */
async function toLastQuestion(u, unit, band, topic) {
  GL.startRun(u, GL.topic(topic));
  const run = () => GL.currentRun(u, topic);
  let missed = false;
  for (let i = 0; i < 40; i++) {
    const r = run(), sm = GL.summaryOf(r);
    if (sm.level === sm.levels && sm.streak >= 1 && sm.counter >= sm.total && !sm.missed) return;
    const qn = GL.questionFor(GL.topic(topic), r), it = itemOf(topic, qn.id);
    if (!missed && sm.counter === 3) { GL.answerRun(u, GL.topic(topic), [qn.words.findIndex((_, k) => !it.answer.includes(k))]); missed = true; }
    GL.answerRun(u, GL.topic(topic), it.answer);
  }
}

// ------------------------------------------------------------------------------------------------- the quiz itself
test('the intro, single pick, a phrase\'s toggle, picks cleared after a miss, "Try this one again", "Fixed it!", "+1 for a miss" and the first-try line', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid(), T = 'identifying-adjectives', U = 'adjectives-and-adverbs';
    const { ctx, page, errors } = await pageAs(kid, { dark });
    await page.goto(`${base}/courses/grammar-lab/k-2/${U}/${T}`);
    await page.waitForSelector('#gl-welcome:not([hidden])');
    assert.equal(await page.textContent('#gl-rule'), 'Each level has 4 questions. Finish it with two right in a row. Only first-try answers count toward the streak.');
    assert.equal(await page.textContent('#gl-count'), '12 questions, plus one for each miss.');
    await page.waitForTimeout(2400);
    await shot(page, '01-intro-rule-and-counts', dark);
    await page.click('#gl-go'); await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    // one word to find: a second tap moves the pick
    let qn = onScreen(kid, T), it = itemOf(T, qn.id);
    const other = qn.words.findIndex((_, i) => !it.answer.includes(i)), other2 = qn.words.findIndex((_, i) => i !== other && !it.answer.includes(i));
    await page.click(`#gl-sentence .gl-w[data-i="${other}"]`);
    await page.click(`#gl-sentence .gl-w[data-i="${other2}"]`);
    assert.deepEqual(await page.$$eval('#gl-sentence .gl-w[aria-pressed="true"]', els => els.map(e => +e.dataset.i)), [other2], 'the pick moved');
    await page.click(`#gl-sentence .gl-w[data-i="${other2}"]`);
    assert.equal(await page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), 0, 'a second tap on the same word clears it');
    await page.click(`#gl-sentence .gl-w[data-i="${other}"]`);
    await shot(page, '02-single-pick', dark);
    // a wrong answer: the picks clear, the hint control stays, the count says what the miss added
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
    assert.equal(await page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), 0, 'nothing picked after a wrong answer');
    assert.ok(await page.isDisabled('#gl-submit')); assert.ok(await page.isVisible('#gl-hint-btn'));
    assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 13');
    assert.equal(await page.textContent('#gl-added'), '+1 for a miss');
    assert.equal(await page.locator('#gl-bar .gl-seg-added').count(), 1);
    await shot(page, '03-cleared-after-miss', dark);
    // fixed: "Fixed it!" and why it does not count toward the streak
    await answerRight(page, kid, T);
    await page.waitForSelector('#gl-correct:not([hidden])');
    assert.equal(await page.textContent('#gl-correct-t'), 'Fixed it!');
    assert.equal(await page.textContent('#gl-correct-note'), 'First tries count toward your streak.');
    await shot(page, '04-fixed-it', dark);
    await flashGone(page);
    // two more: the missed one comes back, labeled
    for (let i = 0; i < 2; i++) { await answerRight(page, kid, T); await page.waitForSelector('#gl-correct:not([hidden])'); assert.equal(await page.textContent('#gl-correct-t'), 'Correct!'); await flashGone(page); }
    assert.equal(onScreen(kid, T).id, qn.id, 'the missed question is back');
    assert.ok(await page.isVisible('#gl-again')); assert.equal(await page.textContent('#gl-again'), 'Try this one again');
    await shot(page, '05-try-this-one-again', dark);
    // a phrase answer keeps the toggle and the "too many words" near miss
    const kid2 = newKid(); openUp(kid2, '6-8', 'articles', 'identifying-articles');
    const P2 = await pageAs(kid2, { dark });
    GL.startRun(kid2, GL.topic('identifying-articles'));
    for (let i = 0; i < 12 && onScreen(kid2, 'identifying-articles').need < 2; i++) GL.answerRun(kid2, GL.topic('identifying-articles'), itemOf('identifying-articles', onScreen(kid2, 'identifying-articles').id).answer);
    const ph = onScreen(kid2, 'identifying-articles'), pit = itemOf('identifying-articles', ph.id);
    assert.ok(ph.need >= 2, 'a question with more than one word to tap');
    await P2.page.goto(`${base}/courses/grammar-lab/6-8/articles/identifying-articles`);
    await P2.page.waitForSelector('#gl-quiz:not([hidden])');
    const extra = ph.words.findIndex((_, i) => !pit.answer.includes(i) && !(pit.optional || []).includes(i));
    for (const i of [...pit.answer, extra]) await P2.page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
    assert.equal(await P2.page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), pit.answer.length + 1, 'every tapped word stays picked');
    await P2.page.click('#gl-submit');
    await P2.page.waitForSelector('#gl-notice.gl-notice-near:not([hidden])');
    assert.match(await P2.page.textContent('#gl-notice'), /too many words/);
    assert.equal(await P2.page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), pit.answer.length + 1, 'a near miss keeps the picks');
    await shot(P2.page, '06-phrase-toggle-near-miss', dark);
    assert.deepEqual(P2.errors, []);
    await P2.ctx.close();
    // the mastery screen: the counts said the same way, and the first-try line
    await toLastQuestion(kid, U, 'k-2', T);
    await page.goto(`${base}/courses/grammar-lab/k-2/${U}/${T}`);
    await page.waitForSelector('#gl-quiz:not([hidden])');
    await answerRight(page, kid, T);
    await page.waitForSelector('#gl-done:not([hidden])', { timeout: 8000 });
    const sm = GL.summaryOf(GL.currentRun(kid, T));
    assert.equal(await page.textContent('#gl-done-acc'), `${sm.firstTry} of ${sm.answered} right on the first try`);
    assert.match(await page.textContent('#gl-done-n'), new RegExp(`^You answered ${sm.counter} questions\\. That is 12 questions, plus ${sm.added} for (a miss|misses)\\.$`));
    assert.equal(await page.textContent('#gl-done-also'), 'Also counts in: Kinds of Words');
    await page.waitForTimeout(2600);
    await shot(page, '07-mastery-first-try', dark);
    // nothing under the bottom nav: the buttons scroll clear of it
    for (const sel of ['#gl-done-back', '#gl-done-next']) {
      await page.$eval(sel, el => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
      const r = await page.$eval(sel, el => el.getBoundingClientRect().bottom);
      assert.ok(r <= await navTop(page) + 0.5, `${sel} clear of the bottom nav (${r} > ${await navTop(page)})`);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const last = await page.$eval('#gl-done-next', el => el.getBoundingClientRect().bottom);
    assert.ok(last <= await navTop(page) - 8, 'scrolled to the end, the last button sits above the nav');
    await shot(page, '08-mastery-above-nav', dark);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

// ------------------------------------------------------------------------------------------------- progress and locks
test('partial progress on the course and unit pages, locks in order, "Also counts in"', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid();
    master(kid, 'identifying-common-nouns');
    GL.startRun(kid, GL.topic('identifying-action-verbs'));
    for (let i = 0; i < 5; i++) { const qn = onScreen(kid, 'identifying-action-verbs'); GL.answerRun(kid, GL.topic('identifying-action-verbs'), itemOf('identifying-action-verbs', qn.id).answer); }
    const { ctx, page, errors } = await pageAs(kid, { dark });
    await page.goto(`${base}/courses/grammar-lab/k-2/kinds-of-words`);
    assert.equal(await page.textContent('#gl-topic-identifying-action-verbs .gl-tile-state'), 'Level 2 of 3');
    assert.equal(await page.textContent('#gl-topic-identifying-action-verbs .gl-tile-also'), 'Also counts in: Verbs and Time');
    assert.equal(await page.textContent('#gl-unitprog'), '1 of 3 mastered\u00a0· 1 in progress');
    assert.match(await page.textContent('#gl-topic-identifying-adjectives .gl-tile-state'), /Master the one before first/);
    await shot(page, '09-unit-progress-locks', dark);
    await page.goto(`${base}/courses/grammar-lab?band=k-2`);
    assert.equal(await page.textContent('#gl-bandprog-k-2'), '1 mastered\u00a0· 1 in progress');
    assert.match(await page.textContent('#gl-unit-kinds-of-words'), /1 in progress/);
    await shot(page, '10-course-progress', dark);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

// ------------------------------------------------------------------------------------------------- a failed try
test('a failed try re-syncs: a dropped request keeps the picks; a run finished on another device shows mastery; a sign-in that ended says so', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid(), T = 'identifying-adjectives', U = 'adjectives-and-adverbs';
    const { ctx, page, errors } = await pageAs(kid, { dark });
    GL.startRun(kid, GL.topic(T));
    await page.goto(`${base}/courses/grammar-lab/k-2/${U}/${T}`);
    await page.waitForSelector('#gl-quiz:not([hidden])');
    // the request fails once (a dropped connection, a server error): nothing lost, Submit again works
    let fail = true;
    await page.route('**/answer', route => { if (fail) { fail = false; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }); } return route.continue(); });
    const qn = onScreen(kid, T);
    await answerRight(page, kid, T);
    await page.waitForSelector('#gl-notice.gl-notice-near:not([hidden])');
    assert.match(await page.textContent('#gl-notice'), /did not go through/);
    assert.equal(await page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), 1, 'the pick stays');
    assert.ok(await page.isEnabled('#gl-submit'));
    assert.equal(GL.currentRun(kid, T).presented, 1, 'nothing was counted');
    await shot(page, '11-resync-not-sent', dark);
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-correct:not([hidden])'); await flashGone(page);
    assert.notEqual(onScreen(kid, T).id, qn.id);
    await page.unroute('**/answer');
    // the last question of a run finished on another device (the owner's Q13 of 13): the mastery screen, not an error
    await toLastQuestion(kid, U, 'k-2', T);
    await page.goto(`${base}/courses/grammar-lab/k-2/${U}/${T}`);
    await page.waitForSelector('#gl-quiz:not([hidden])');
    const lastQ = onScreen(kid, T);
    GL.answerRun(kid, GL.topic(T), itemOf(T, lastQ.id).answer);   // the other device
    assert.ok(GL.masteredSet(kid).has(T));
    await page.click(`#gl-sentence .gl-w[data-i="${itemOf(T, lastQ.id).answer[0]}"]`);
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-done:not([hidden])');
    assert.match(await page.textContent('#gl-done-n'), /^You already finished this topic\. You answered/);
    assert.equal(await page.locator('.toast.bad').count(), 0, 'no "Something went wrong"');
    await page.waitForTimeout(2600);
    await shot(page, '12-resync-finished-elsewhere', dark);
    // a sign-in that ended: a notice with the way back in; reloading never starts over as a guest
    await page.goto(`${base}/courses/grammar-lab/k-2/${U}/identifying-adverbs`);
    await page.click('#gl-go'); await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    q.run('UPDATE sessions SET expires_at=1 WHERE user_id=?', kid.id);
    await answerRight(page, kid, 'identifying-adverbs');
    await page.waitForSelector('#gl-notice a[href^="/login?next="]');
    assert.match(await page.textContent('#gl-notice'), /You were signed out\. Your progress is saved\. Sign in again/);
    await shot(page, '13-resync-signed-out', dark);
    await page.reload();
    assert.match(page.url(), /\/login\?next=%2Fcourses%2Fgrammar-lab%2Fk-2%2Fadjectives-and-adverbs%2Fidentifying-adverbs&signedout=1$/);
    assert.equal(GL.currentRun(kid, 'identifying-adverbs').presented, 1, 'the run waits on the account');
    assert.deepEqual(errors.filter(e => !/401|Unauthorized/.test(e)), []);
    await ctx.close();
  }
});

// ------------------------------------------------------------------------------------------------- loading, layout
test('a loading state within 100 ms while the scripts are slow; then the lesson', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid();
    const { ctx, page, errors } = await pageAs(kid, { dark });
    await ctx.addInitScript(() => { const tick = () => { const el = document.getElementById('gl-loading'); if (el && el.offsetHeight > 0) window.__glLoadingAt = performance.now(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.route(/\/js\/grammar-lab\.js/, async route => { await new Promise(r => setTimeout(r, 1500)); return route.continue(); });
    // a second visit, as a student has: the page's styles are cached (versioned URLs), its scripts are slow
    await page.goto(`${base}/courses/grammar-lab/k-2/capital-letters/capitalizing-names-and-dates`);
    const t0 = Date.now();
    await page.goto(`${base}/courses/grammar-lab/k-2/capital-letters/capitalizing-names-and-dates`, { waitUntil: 'commit' });
    await page.waitForSelector('#gl-loading', { state: 'visible', timeout: 2000 });
    const at = Date.now() - t0;
    // (measured in the page: the first frame with the loading state laid out, after the page's HTML arrived)
    const shownAfter = await page.evaluate(() => new Promise(ok => { const nav = performance.getEntriesByType('navigation')[0]; ok(window.__glLoadingAt ? window.__glLoadingAt - nav.responseEnd : null); }));
    assert.ok(shownAfter !== null && shownAfter < 100, `the loading state is on screen within 100 ms of the page arriving (${shownAfter} ms)`);
    assert.ok(at < 1000, `the loading state shows long before the scripts (${at} ms)`);
    assert.equal(await page.textContent('#gl-loading-t'), 'Getting your lesson ready');
    assert.ok(await page.isHidden('#gl-welcome'));
    await shot(page, '14-loading', dark);
    await page.waitForSelector('#gl-welcome:not([hidden])', { timeout: 6000 });
    assert.ok(await page.isHidden('#gl-loading'));
    // the page fetches its scripts side by side (no waterfall behind the page's own script)
    assert.equal(await page.locator('link[rel="modulepreload"][href="/js/app.js"]').count(), 1);
    assert.equal(await page.locator('link[rel="modulepreload"][href="/js/grammar-lab-art.js"]').count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the hint opens above Submit and in view; a four-option question fits 390 x 844; every screen ends above the bottom nav', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid();
    const { ctx, page, errors } = await pageAs(kid, { dark });
    // the hint, after a miss
    GL.startRun(kid, GL.topic('identifying-adjectives'));
    await page.goto(`${base}/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives`);
    await page.waitForSelector('#gl-quiz:not([hidden])');
    let qn = onScreen(kid, 'identifying-adjectives');
    await page.click(`#gl-sentence .gl-w[data-i="${qn.words.findIndex((_, i) => !itemOf('identifying-adjectives', qn.id).answer.includes(i))}"]`);
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-hint-btn:not([hidden])');
    await page.click('#gl-hint-btn');
    await page.waitForSelector('#gl-hint:not([hidden])');
    await page.waitForTimeout(700);
    const h = await page.$eval('#gl-hint', el => el.getBoundingClientRect().toJSON()), s = await page.$eval('#gl-submit', el => el.getBoundingClientRect().toJSON());
    assert.ok(h.top < s.top, 'the hint is above Submit');
    assert.ok(h.top >= TOP - 1 && h.top < HGT - TABBAR, `the hint is in view (${h.top})`);
    await shot(page, '15-hint-above-submit', dark);
    // a typical four-option question (6-8 comparatives: pills; and a 3-5 one with whole sentences), with the page at its top
    for (const [band, unit, topic] of [['6-8', 'adjectives-6-8', 'comparative-adjectives'], ['3-5', 'building-sentences', 'compound-sentences']]) {
      openUp(kid, band, unit, topic);
      GL.startRun(kid, GL.topic(topic));
      for (let i = 0; i < 12 && (onScreen(kid, topic).options || []).length < 4; i++) GL.answerRun(kid, GL.topic(topic), itemOf(topic, onScreen(kid, topic).id).answer);
      assert.equal(onScreen(kid, topic).options.length, 4, `${topic}: a four-option question`);
      await page.goto(`${base}/courses/grammar-lab/${band}/${unit}/${topic}`);
      await page.waitForSelector('#gl-quiz:not([hidden])');
      const four = await page.$$eval('#gl-options .gl-opt', els => els.map(e => e.getBoundingClientRect().bottom));
      const sub = await page.$eval('#gl-submit', el => el.getBoundingClientRect().bottom);
      assert.equal(four.length, 4);
      assert.ok(Math.max(...four) <= HGT - TABBAR && sub <= HGT - TABBAR, `${topic}: option 4 (${Math.max(...four)}) and Submit (${sub}) above the nav at ${HGT - TABBAR}`);
      await shot(page, `16-four-options-${topic}`, dark);
    }
    // every Grammar Lab screen: scrolled to the end, the last thing on it sits above the nav and the safe area
    const kid2 = newKid(); master(kid2, 'identifying-adjectives');
    await ctx.addCookies([sessionCookie(kid2.id)]);
    for (const url of ['/courses/grammar-lab', '/courses/grammar-lab/k-2/kinds-of-words', '/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adverbs',
      '/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives/card', '/courses/grammar-lab/k-2/adjectives-and-adverbs/identifying-adjectives/review']) {
      await page.goto(base + url);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.gl a, .gl button, .gl summary')].filter(e => e.offsetParent && !e.closest('[hidden], dialog, .gl-menu-list, .gl-overlay, .gl-flash')).map(e => e.getBoundingClientRect().bottom)));
      assert.ok(bottom <= await navTop(page), `${url}: the last control (${bottom}) is above the nav (${await navTop(page)})`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

// One topic per question format: after a right answer with the page scrolled down to Submit, the next question's line
// is in view, below the sticky top bar.
const FORMATS = [
  ['tap', 'k-2/adjectives-and-adverbs', 'identifying-adjectives'], ['capfix', 'k-2/capital-letters', 'capitalizing-names-and-dates'],
  ['gaps', 'k-2/commas', 'commas-in-a-series'], ['choice', 'k-2/sound-alike-words', 'your-and-youre'], ['cycle', '3-5/more-verbs-and-time', 'progressive-verbs'],
  ['marks', '6-8/commas-for-clarity', 'commas-introductory'], ['passage', '3-5/evidence-that-informs', 'evidence-for-informing'], ['fix', '3-5/quotes-and-dialogue', 'quotation-marks-in-dialogue'],
];
test('a new question\'s line is never under the sticky top bar, in every format', async t => {
  if (skip) return t.skip(skip);
  const kid = newKid();
  const { ctx, page, errors } = await pageAs(kid, { height: 640 });
  for (const [fmt, unit, topic] of FORMATS) {
    const [band, uid] = unit.split('/');
    openUp(kid, band, uid, topic);
    GL.startRun(kid, GL.topic(topic));
    await page.goto(`${base}/courses/grammar-lab/${band}/${uid}/${topic}`);
    await page.waitForSelector('#gl-quiz:not([hidden])');
    await answerRight(page, kid, topic, { submit: false });
    assert.ok(await page.isEnabled('#gl-submit'), `${fmt}: answered, Submit is on`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-correct:not([hidden])'); await flashGone(page);
    await page.waitForTimeout(700);
    const ask = await page.$eval('#gl-ask', el => el.getBoundingClientRect().toJSON());
    assert.ok(ask.top >= TOP - 1, `${fmt}: the question's line (${ask.top}) is below the top bar (${TOP})`);
    assert.ok(ask.bottom <= 640, `${fmt}: and in view`);
    if (fmt === 'tap') await shot(page, '17-stem-below-top-bar', false);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ------------------------------------------------------------------------------------------------- theme
test('the proofread room follows the theme: its bar and frame in light and in dark (no flip to the games\' black frame)', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    const kid = newKid();
    const { ctx, page } = await pageAs(kid, { dark });
    await page.goto(`${base}/play/mistake-hunt?glroom=capitalizing-names-and-dates&unit=capital-letters`);
    await page.waitForSelector('.playbar');
    const c = await page.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.playbar')).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
      metas: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => `${m.content}|${m.media}`) }));
    assert.equal(c.bar, dark ? 'rgb(20, 20, 20)' : 'rgb(255, 253, 242)', 'the bar is the site\'s bar for the scheme');
    assert.equal(c.body, dark ? 'rgb(20, 20, 20)' : 'rgb(244, 241, 230)');
    assert.deepEqual(c.metas, ['#FFFDF2|(prefers-color-scheme: light)', '#141414|(prefers-color-scheme: dark)'], 'the browser bar follows the device too');
    await page.waitForTimeout(2500);
    await shot(page, '18-room-theme', dark);
    // a game that is not a Grammar Lab room keeps the games' Ink frame
    await page.goto(`${base}/play/mistake-hunt`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.playbar')).backgroundColor), 'rgb(20, 20, 20)');
    await ctx.close();
  }
});

// ------------------------------------------------------------------------------------------------- adverbs
test('the adverb topics: K-2 Identifying Adverbs and 3-5 Adverbs That Tell How, When, and Where, each the second topic of its band\'s unit', async t => {
  if (skip) return t.skip(skip);
  for (const dark of [false, true]) {
    for (const [band, topic, title] of [['k-2', 'identifying-adverbs', 'Identifying Adverbs'], ['3-5', 'adverbs-how-when-where', 'Adverbs That Tell How, When, and Where']]) {
      const kid = newKid();
      const { ctx, page, errors } = await pageAs(kid, { dark });
      await page.goto(`${base}/courses/grammar-lab/${band}/adjectives-and-adverbs`);
      assert.deepEqual(await page.$$eval('.gl-tile-name', els => els.map(e => e.textContent)), ['Identifying Adjectives', title]);
      assert.match(await page.textContent(`#gl-topic-${topic} .gl-tile-state`), /Master the one before first/);
      master(kid, 'identifying-adjectives');
      await page.reload();
      assert.equal(await page.textContent(`#gl-topic-${topic} .gl-tile-state`), 'Start');
      await shot(page, `19-${band}-adverbs-unit`, dark);
      await page.goto(`${base}/courses/grammar-lab/${band}/adjectives-and-adverbs/${topic}/card`);
      assert.match(await page.textContent('.gl-ex-text'), band === 'k-2' ? /quickly\s*adverb/ : /softly\s*adverb/);
      await shot(page, `20-${band}-adverbs-card`, dark);
      await page.goto(`${base}/courses/grammar-lab/${band}/adjectives-and-adverbs/${topic}`);
      await page.click('#gl-go'); await page.click('#gl-card-go');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      assert.equal(await page.textContent('#gl-ask'), 'Tap the adverb.');
      await answerRight(page, kid, topic, { submit: false });
      await shot(page, `21-${band}-adverbs-question`, dark);
      await page.click('#gl-submit');
      await page.waitForSelector('#gl-correct:not([hidden])'); await flashGone(page);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});
