// Grammar Lab's phone checks for one band (tests/unit/grammar-lab-phone-*-browser.test.js): at 320 x 568 and 390 x 844,
// each screen in light and then dark, a signed-in student sees the course page, a unit, a teaching card, a topic's
// welcome, the card step and the card's sheet over a question, questions in at least three formats, a wrong answer and its hint, a level-done overlay, the mastery screen
// and the topic's proofread room. Every screen passes the layout checks (tests/unit/_grammar-lab-play.js
// layoutProblems): nothing sideways, nothing cut off, nothing stuck under the top bar or the bottom nav, no line that
// starts with a punctuation mark, and, in German or Arabic, every piece of course text marked lang="en".
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
const GL = H.GL;

/** What each band plays (a topic with a proofread room) and peeks at (the first question of other topics, so the
 *  screens cover at least three question formats). pre: topics mastered first, to open the ones to play. */
export const PLAN = {
  'k-2': { play: ['commas', 'commas-in-a-series'], peek: [['capital-letters', 'capitalizing-names-and-dates'], ['sound-alike-words', 'your-and-youre'], ['adjectives-and-adverbs', 'identifying-adjectives']] },
  '3-5': { play: ['fixing-sentences', 'avoiding-run-ons'], pre: ['identifying-action-verbs', 'recognizing-fragments'], peek: [['fixing-sentences', 'recognizing-fragments'], ['evidence-basics', 'evidence-that-supports'], ['quotes-and-dialogue', 'quotation-marks-in-dialogue']] },
  '6-8': { play: ['punctuating-subordinators', 'subordinating-start'], pre: ['subordinating-identify'], peek: [['punctuating-subordinators', 'subordinating-identify'], ['introductions', 'thesis-fact-opinion'], ['vague-pronouns', 'fixing-vague-pronouns'], ['embedding-quotations', 'capitalizing-quotes']] },
  '9-12': { play: ['lists', 'commas-series-6-8'], peek: [['thesis-statements', 'thesis-fact-opinion'], ['embedding-quotations', 'capitalizing-quotes'], ['appositive-phrases', 'appositive-refers'], ['vague-pronouns', 'fixing-vague-pronouns']] },
};
export const SIZES = [{ width: 320, height: 568 }, { width: 390, height: 844 }];
/** Every unit and topic name: course text, English on every page. */
export const COURSE_TEXT = (() => { const out = new Set(); for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) { out.add(p.title); for (const id of p.topics) out.add(GL.topic(id).title); } return [...out]; })();
const kindOf = q => q.kind + (q.capfix ? '-capfix' : q.passage ? '-passage' : q.cycle ? '-cycle' : q.whole ? '-whole' : '');

/**
 * One band at one size, in one language: -> { problems: [[screen, [problem]]], kinds, errors }.
 * themes: each screen is checked (and photographed) in each, the first one being the theme the page loads in.
 */
export async function phoneRun(env, band, size, { lang = 'en', themes = ['light', 'dark'], room = true } = {}) {
  const P = PLAN[band], base = env.base;
  const ctx = await env.browser.newContext({ viewport: size, colorScheme: themes[0], reducedMotion: 'reduce' });
  const kid = H.newKid();
  for (const id of P.pre || []) H.master(kid, id, band);
  for (const [unit, id] of P.peek) for (const x of GL.pathway(unit, band).topics) { if (x === id) break; H.master(kid, x, band); }
  await ctx.addCookies([H.sessionCookie(kid.id, base), { name: 'lang', value: lang, url: base }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const box = H.watch(page);
  const problems = [], kinds = new Set();
  const where = `${band}-${size.width}`;
  // each screen in the theme the page is in now, then the other (one switch a screen; the site's colors fade, so the
  // picture waits for the fade to end)
  let now = themes[0];
  async function check(name, opts = {}, target = page) {
    for (const th of [now, ...themes.filter(x => x !== now)]) {
      if (th !== now) { await page.emulateMedia({ colorScheme: th }); now = th; await page.waitForTimeout(400); }
      const pr = await H.layoutProblems(target, { en: COURSE_TEXT, ...opts });
      if (pr.length) problems.push([`${where}-${th}-${lang} ${name}`, pr]);
      await H.shot(page, `${band}-${size.width}-${th}-${lang}-${name}`);
    }
  }
  try {
    const [unit, topic] = P.play;
    const p = GL.pathway(unit, band);
    await page.goto(`${base}/courses/grammar-lab?band=${band}`);
    await check('01-course');
    if (lang !== 'en') {
      // the folded bands too (their units' names are course text)
      for (const s of await page.$$('details.gl-bandfold')) await s.evaluate(d => { d.open = true; });
      await check('01-course-open');
    }
    await page.goto(`${base}/courses/grammar-lab/${band}/${unit}`);
    await check('02-unit');
    await page.click(`#gl-topic-${topic} summary`);
    await check('02-unit-menu', { bottom: false });
    await page.goto(`${base}/courses/grammar-lab/${band}/${unit}/${topic}/card`);
    await check('03-card');
    for (const [u2, t2] of P.peek) {
      box.q = null;
      await page.goto(`${base}/courses/grammar-lab/${band}/${u2}/${t2}`);
      await page.waitForSelector('#gl-welcome:not([hidden]), #gl-quiz:not([hidden])');
      if (await page.isVisible('#gl-welcome')) { await page.click('#gl-go'); await page.click('#gl-card-go'); }
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await H.closeTip(page);
      await H.syncBox(page, box);
      kinds.add(kindOf(box.q));
      await check(`04-question-${kindOf(box.q)}`, { keys: ['#gl-ask'] });
    }
    box.q = null;
    await page.goto(`${base}/courses/grammar-lab/${band}/${unit}/${topic}`);
    await page.waitForSelector('#gl-welcome:not([hidden])');
    await check('05-intro', { keys: ['#gl-skip', '#gl-welcome-h'] });
    await page.click('#gl-go');
    // the teaching card, a step of the lesson: its heading in view, and its Start reachable above the bottom nav
    await page.waitForSelector('#gl-cardstep:not([hidden])');
    await check('05-card-step', { keys: ['#gl-cardstep-h', '#gl-card-h'] });
    await page.locator('#gl-card-go').scrollIntoViewIfNeeded();
    await check('05-card-step-start', { keys: ['#gl-card-go'], bottom: false });
    await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    await H.closeTip(page);
    await H.syncBox(page, box);
    kinds.add(kindOf(box.q));
    await check(`06-question-${kindOf(box.q)}`, { keys: ['#gl-ask'] });
    // the card again, in its sheet over the question
    await page.click('#gl-card-btn');
    await page.waitForSelector('#gl-cardsheet[open]');
    await check('06-card-sheet', { keys: ['#gl-sheet-x', '#gl-card-h'], bottom: false });
    await page.click('#gl-sheet-x');
    await page.waitForSelector('#gl-cardsheet', { state: 'hidden' });
    await H.answer(page, box, topic, { wrong: true });
    await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
    await page.waitForTimeout(100);
    await check('07-wrong', { keys: ['#gl-notice', '#gl-hint-btn'] });
    await page.click('#gl-hint-btn');
    await page.waitForSelector('#gl-hint:not([hidden])');
    await page.waitForTimeout(100);
    await check('08-hint', { keys: ['#gl-hint-h'] });
    await H.clearPicks(page, box, topic);
    await H.answer(page, box, topic, { retry: true });
    await H.passFlash(page);
    let level = false;
    for (let i = 0; i < 30; i++) {
      if (await page.isVisible('#gl-done')) break;
      if (await page.isVisible('#gl-level')) {
        if (!level) { await check('09-level-done', { keys: ['#gl-level-h', '#gl-level-next'] }); level = true; }
        await page.click('#gl-level-next');
        await check('09-after-level', { keys: ['#gl-ask'] });
        continue;
      }
      await H.answer(page, box, topic);
      await H.passFlash(page);
      kinds.add(kindOf(box.q));
    }
    await page.waitForSelector('#gl-done:not([hidden])');
    await page.waitForTimeout(150);
    await check('10-mastery', { keys: ['#gl-done-h'] });
    if (room && GL.room(topic)) {
      await H.playRoom(page, base, p, topic, { name: '11', check: (pg, f, nm) => check(nm, { root: 'body', bottom: false }, f) });
      assert.ok(GL.roomPassedSet(kid).has(topic), 'the room passed, checked on the server');
      await page.goto(`${base}/courses/grammar-lab/${band}/${unit}`);
      await check('12-unit-after');
    }
  } finally { await ctx.close(); }
  return { problems, kinds: [...kinds], errors, kid };
}

/** The report a failing check prints: each screen and what is wrong on it. */
export const report = problems => problems.map(([s, pr]) => `${s}:\n    ${pr.join('\n    ')}`).join('\n');
export function assertClean(out, band) {
  assert.deepEqual(out.errors, [], 'no page errors');
  assert.equal(out.problems.length, 0, `${band}: layout problems\n${report(out.problems)}`);
}
