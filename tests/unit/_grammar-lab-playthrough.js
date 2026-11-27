// A whole Grammar Lab unit, end to end, as a signed-in student on a 390 px phone (grammar-lab-playthrough-*-browser
// tests): every topic in order from the unit page, one deliberate wrong answer in each (the calm notice, one more
// question, the hint that never gives the answer), mastery, and at every step what the student sees: the locks, the
// ring and the unit's counts, the next topic (worked out now, never a mastered one), "Also counts in", the room and its
// badge, the course page's counts, and the same topic mastered in every unit and band that uses it.
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
const GL = H.GL;

export const UNITS = {
  'k-2': 'commas',
  '3-5': 'fixing-sentences',
  '6-8': 'punctuating-subordinators',
  '9-12': 'embedding-quotations',
};
const ringOf = page => page.getAttribute('.gl-unithead .gl-ring', 'aria-label');
const tileClass = (page, id) => page.getAttribute(`#gl-topic-${id}`, 'class');

/** Play one band's unit. -> { findings } (notes on what was seen, for the report). */
export async function playUnit(env, band) {
  const base = env.base, p = GL.pathway(UNITS[band], band);
  const unitUrl = `${base}/courses/grammar-lab/${band}/${p.id}`;
  const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const kid = H.newKid('glplay');
  await ctx.addCookies([H.sessionCookie(kid.id, base)]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const box = H.watch(page);
  const notes = [];
  const shot = name => H.shot(page, `play-${band}-${name}`);
  try {
    // The course page before: nothing mastered in this band, the unit's ring empty.
    await page.goto(`${base}/courses/grammar-lab?band=${band}`);
    assert.equal(await page.getAttribute(`#gl-unit-${p.id} .gl-ring`, 'aria-label'), `0 of ${p.topics.length} topics mastered`);
    assert.equal(await page.textContent(`#gl-bandprog-${band}`), '0 mastered · 0 in progress');
    await page.click(`#gl-unit-${p.id}`);
    await page.waitForURL(unitUrl);
    // The locks: the first topic opens, the rest wait for the one before (their names stay visible, never links).
    assert.equal(await tileClass(page, p.topics[0]), 'gl-tile gl-new');
    for (const id of p.topics.slice(1)) {
      assert.equal(await tileClass(page, id), 'gl-tile gl-locked');
      assert.equal(await page.textContent(`#gl-topic-${id} .gl-tile-state`), 'Master the one before first');
      assert.equal(await page.$(`#gl-topic-${id} a.gl-tile-main`), null);
    }
    if (p.topics.length > 1) {
      // a locked topic's address sends the student back to the unit
      await page.goto(`${unitUrl}/${p.topics[1]}`);
      assert.equal(page.url(), `${unitUrl}#gl-topic-${p.topics[1]}`);
    }
    await shot('00-unit');
    for (let i = 0; i < p.topics.length; i++) {
      const id = p.topics[i], tp = GL.topic(id);
      await page.goto(unitUrl);
      await page.click(`#gl-topic-${id} a.gl-tile-main`);
      await page.waitForSelector('#gl-welcome:not([hidden])');
      box.q = null;
      await page.click('#gl-go');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await H.closeTip(page);
      const total = tp.levels.reduce((a, b) => a + b, 0);
      assert.equal(await page.textContent('#gl-counter'), `Question 1 of ${total}`);
      // the deliberate wrong answer: the notice, one more question, the hint (never the answer)
      const it = await H.answer(page, box, id, { wrong: true });
      await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
      assert.equal(await page.textContent('#gl-counter'), `Question 1 of ${total + 1}`);
      await page.click('#gl-hint-btn');
      await page.waitForSelector('#gl-hint:not([hidden])');
      assert.equal(await page.textContent('#gl-hint-text'), it.hint);
      if (i === 0) {
        await shot(`${i + 1}-wrong-hint`);
        // away to the unit and the course page mid-topic: "in progress" everywhere, then back to the same question
        await page.goto(unitUrl);
        assert.equal(await tileClass(page, id), 'gl-tile gl-started');
        assert.equal(await page.textContent(`#gl-topic-${id} .gl-tile-state`), `Level 1 of ${tp.levels.length}`);
        assert.equal(await page.textContent('#gl-unitprog'), `0 of ${p.topics.length} mastered\u00a0· 1 in progress`);
        await page.goto(`${base}/courses/grammar-lab?band=${band}`);
        assert.equal(await page.textContent(`#gl-bandprog-${band}`), '0 mastered\u00a0· 1 in progress');
        assert.match(await page.textContent(`#gl-unit-${p.id}`), /1 in progress/);
        await page.goto(`${unitUrl}/${id}`);
        await page.waitForSelector('#gl-quiz:not([hidden])');
        assert.equal(await page.textContent('#gl-counter'), `Question 1 of ${total + 1}`, 'the run picks up where it was');
        // (Phase 4 fix: the missed question keeps its hint when the student comes back to it)
        assert.ok(await page.isVisible('#gl-hint-btn'), 'the missed question still offers its hint');
        await page.click('#gl-hint-btn');
        assert.equal(await page.textContent('#gl-hint-text'), it.hint);
      }
      await H.clearPicks(page, box, id);
      await H.answer(page, box, id, { retry: true });
      await H.passFlash(page);
      const kinds = new Set([box.q.kind]);
      let levels = 0;
      for (let k = 0; k < 40; k++) {
        if (await page.isVisible('#gl-done')) break;
        if (await page.isVisible('#gl-level')) { levels++; await page.click('#gl-level-next'); continue; }
        kinds.add(box.q.kind + (box.q.passage ? '-passage' : ''));
        await H.answer(page, box, id);
        await H.passFlash(page);
      }
      assert.equal(levels, tp.levels.length - 1, `${id}: every level but the last ends in its overlay`);
      await page.waitForSelector('#gl-done:not([hidden])');
      // mastery: the heading, the counts, the units it also counts in, the next topic (now, never a mastered one)
      assert.equal(await page.textContent('#gl-done-h'), `You mastered ${tp.title}!`);
      assert.equal(await page.textContent('#gl-done-n'), `You answered ${total + 1} questions. That is ${total} questions, plus 1 for a miss.`);
      const also = GL.alsoIn(id, p).map(x => x.title);
      if (also.length) assert.equal(await page.textContent('#gl-done-also'), `Also counts in: ${also.join(', ')}`);
      else assert.ok(await page.isHidden('#gl-done-also'));
      assert.ok(GL.masteredSet(kid).has(id), `${id} is mastered`);
      const nextHref = await page.getAttribute('#gl-done-next', 'href');
      const want = GL.nextTopic(kid, p, id);
      if (want) {
        assert.ok(await page.isVisible('#gl-done-next'));
        const nextId = nextHref.split('/').pop();
        assert.equal(nextId, want.topic.id);
        assert.ok(!GL.masteredSet(kid).has(nextId), 'the next topic is never a mastered one');
        if (i + 1 < p.topics.length) assert.equal(nextId, p.topics[i + 1], 'the next topic is the next one in this unit');
        notes.push(`${id}: ${[...kinds].join(', ')}; next: ${want.topic.title}${want.unit.id !== p.id ? ` (${want.unit.title})` : ''}`);
      } else notes.push(`${id}: ${[...kinds].join(', ')}; no next topic`);
      assert.equal(await page.isVisible('#gl-done-room'), !!GL.room(id));
      await shot(`${i + 1}-mastered`);
      // back on the unit: the check, the ring and the counts, and the next topic open
      await page.click('#gl-done-back');
      await page.waitForURL(unitUrl);
      assert.equal(await tileClass(page, id), 'gl-tile gl-mastered');
      assert.equal(await page.textContent(`#gl-topic-${id} .gl-tile-n`), '✓');
      assert.equal(await ringOf(page), `${i + 1} of ${p.topics.length} topics mastered`);
      assert.equal(await page.textContent('#gl-unitprog'), `${i + 1} of ${p.topics.length} mastered · 0 in progress`);
      if (i + 1 < p.topics.length) assert.equal(await tileClass(page, p.topics[i + 1]), 'gl-tile gl-new', 'the next topic opens');
      if (also.length) assert.match(await page.textContent(`#gl-topic-${id} .gl-tile-also`), new RegExp(`Also counts in: ${also[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      // its proofread room: played and handed in, then its own badge on the tile; the ring does not change
      if (GL.room(id)) {
        await H.playRoom(page, base, p, id);
        await page.goto(unitUrl);
        assert.equal(await page.textContent(`#gl-topic-${id} .gl-badge-room`), 'Proofread room done');
        assert.equal(await ringOf(page), `${i + 1} of ${p.topics.length} topics mastered`);
        await shot(`${i + 1}-room-badge`);
      }
    }
    // The course page after: the unit's ring full, the band's counts (distinct topics), and every other unit that
    // uses these topics (in any band) shows them mastered too.
    await page.goto(`${base}/courses/grammar-lab?band=${band}`);
    assert.equal(await page.getAttribute(`#gl-unit-${p.id} .gl-ring`, 'aria-label'), `${p.topics.length} of ${p.topics.length} topics mastered`);
    const mastered = new Set(GL.pathwaysOf(band).flatMap(u => u.topics).filter(x => GL.masteredSet(kid).has(x)));
    assert.equal(await page.textContent(`#gl-bandprog-${band}`), `${mastered.size} mastered · 0 in progress`);
    await shot('09-course-after');
    for (const id of p.topics) for (const u of GL.unitsWith(id)) {
      if (u.id === p.id && u.band === band) continue;
      await page.goto(`${base}/courses/grammar-lab/${u.band}/${u.id}`);
      assert.equal(await tileClass(page, id), 'gl-tile gl-mastered', `${id} mastered in ${u.band} ${u.id} too`);
      notes.push(`${id} also mastered in ${u.band} ${u.title}`);
    }
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
  return { notes };
}
