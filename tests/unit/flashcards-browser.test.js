// Flashcards in real Chromium inside the production game frame (tests/unit/_flashcards-page.js): each way to study
// (Flip with the keyboard, Learn until mastered, Match against your own time, Test with its review), making a set (paste,
// AI from a topic, a lesson document, an emoji, saving, the class code and Assign), a student's set from a lesson step
// (card states go to the teacher), and a phone in dark mode with no sideways scrolling. FC_SHOTS=<dir> saves pictures.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, closeBrowser, learnAnswer, skip, SETID } from './_flashcards-page.js';

const SHOTS = process.env.FC_SHOTS || '';
test.after(closeBrowser);
const ITEMS = [{ t: 'Habitats', c: [['habitat', 'where an animal lives', '🏞️'], ['predator', 'an animal that hunts others', '🦁'], ['prey', 'an animal that is hunted', '🐇'], ['erosion', 'the wearing away of land', '🌊']], a: 't' }];

test('Flip: the card turns over (tap, Space), the arrows move, Shuffle, Star and Starred only', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    await g.on('home'); await g.shot(SHOTS, 'home');
    await g.frame.click('#fc-lib'); await g.on('library');
    await g.frame.click('[data-lib="solar-system"]'); await g.on('set');
    assert.equal((await g.state()).cards, 10);
    await g.frame.click('#fc-m-flip'); await g.on('flip');
    await g.frame.click('#fc-card');
    assert.equal((await g.state()).flip.turned, true); assert.ok(await g.frame.$('#fc-card.fc-turned'));
    await g.frame.press('#fc-card', ' '); assert.equal((await g.state()).flip.turned, false, 'Space flips back');
    await g.frame.press('#fc-card', 'ArrowRight'); assert.equal((await g.state()).flip.at, 1);
    await g.frame.press('#fc-card', 'ArrowLeft'); assert.equal((await g.state()).flip.at, 0);
    assert.match(await g.frame.textContent('#fc-count'), /1 of 10/);
    await g.frame.click('#fc-star'); await g.frame.click('#fc-next'); await g.frame.click('#fc-next'); await g.frame.click('#fc-star');
    assert.deepEqual((await g.state()).starred, [0, 2]);
    await g.frame.click('#fc-staronly');
    assert.deepEqual((await g.state()).flip.order, [0, 2]); assert.match(await g.frame.textContent('#fc-count'), /1 of 2/);
    await g.frame.click('#fc-staronly');
    await g.frame.click('#fc-shuffle'); assert.equal(await g.frame.getAttribute('#fc-shuffle', 'aria-pressed'), 'true');
    assert.equal((await g.state()).flip.order.length, 10);
    await g.frame.click('#fc-card'); await g.frame.waitForTimeout(600); await g.shot(SHOTS, 'flip');
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});

test('Learn: multiple choice first, then typed; a miss comes back; the mastery bar; mastered after two right typed answers; one game over at the end', { skip, timeout: 180_000 }, async () => {
  const g = await open({ set: { id: SETID, items: ITEMS, mine: false } });
  try {
    await g.on('set'); await g.frame.click('#fc-m-learn'); await g.on('learn');
    let s = await g.state();
    assert.equal(s.learn.kind, 'mc'); assert.equal(await g.frame.locator('#fc-choices .fc-choice').count(), 4);
    const missed = s.learn.i;
    await g.frame.click('#fc-choices .fc-choice[data-right="false"]');
    await g.until(() => !!document.getElementById('fc-continue'));
    assert.match(await g.frame.textContent('#fc-fb'), /Not quite/);
    s = await g.state(); assert.equal(s.levels[missed], 0); assert.equal(s.misses[missed], 1);
    assert.ok(s.learn.queue.includes(missed), 'the missed card comes back this round');
    await g.shot(SHOTS, 'learn-missed');
    await g.frame.click('#fc-continue');
    for (let k = 0; k < 60 && (await g.state()).screen !== 'learndone'; k++) {
      s = await g.state();
      if (s.screen === 'learnround') { await g.frame.click('#fc-nextround'); await g.on('learn'); continue; }
      if (s.learn.kind === 'type' && k === 8) { await g.shot(SHOTS, 'learn-typed'); }
      await learnAnswer(g, true);
    }
    s = await g.state();
    assert.equal(s.screen, 'learndone'); assert.deepEqual(s.levels, [3, 3, 3, 3]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1); assert.equal(over[0].won, true);
    assert.equal((await g.msgs('brb:flash')).length > 0, true, 'card states sent (the page decides whether they go anywhere)');
    await g.shot(SHOTS, 'learn-done');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Match: pairs vanish, a wrong pair adds a second, the time is the player\'s own best (no score to any board)', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    await g.on('home'); await g.frame.evaluate(() => window.__brbTest.fcLib('baby-animals'));
    await g.frame.click('#fc-m-match'); await g.on('match'); await g.frame.click('#fc-matchgo'); await g.on('matchplay');
    const tiles = await g.frame.evaluate(() => [...document.querySelectorAll('.fc-tile')].map(b => [b.dataset.i, b.dataset.side]));
    assert.equal(tiles.length, 12);
    const wrongB = tiles.findIndex(x => x[0] !== tiles[0][0]);
    await g.frame.click('.fc-tile >> nth=0'); await g.frame.click(`.fc-tile >> nth=${wrongB}`);
    assert.equal(await g.frame.locator('.fc-tile.fc-gone').count(), 0);
    await g.shot(SHOTS, 'match');
    const byI = {}; tiles.forEach((x, k) => { (byI[x[0]] ||= []).push(k); });
    for (const ks of Object.values(byI)) { for (const k of ks) await g.frame.click(`.fc-tile >> nth=${k}`); }
    await g.on('matchdone');
    const s = await g.state(); assert.ok(s.best >= 1000, 'the wrong pair added a second');
    assert.match(await g.frame.textContent('[data-screen="matchdone"]'), /Includes 1 seconds|first time/i);
    assert.deepEqual((await g.msgs('brb:gameover')).map(m => m.score), [null]); assert.deepEqual(await g.msgs('brb:score'), []);
    await g.shot(SHOTS, 'match-done');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('Test: multiple choice, true or false and written; marked at the end with a review of what was missed', { skip, timeout: 120_000 }, async () => {
  const g = await open();
  try {
    await g.on('home'); await g.frame.evaluate(() => window.__brbTest.fcLib('plant-parts'));
    await g.frame.click('#fc-m-test'); await g.on('testsetup'); await g.shot(SHOTS, 'test-setup');
    await g.frame.selectOption('#fc-tn', '7'); await g.frame.click('#fc-teststart'); await g.on('test');
    const qs = (await g.state()).test;
    assert.equal(qs.length, 7); assert.deepEqual([...new Set(qs.map(q => q.kind))].sort(), ['mc', 'tf', 'written']);
    for (const [k, q] of qs.entries()) {
      const right = k !== 0;
      if (q.kind === 'mc') await g.frame.evaluate(([k, i, right]) => { const all = [...document.querySelectorAll(`input[name="fc-q${k}"]`)]; (right ? all.find(r => r.value === String(i)) : all.find(r => r.value !== String(i))).click(); }, [k, q.i, right]);
      else if (q.kind === 'tf') await g.frame.click(`#fc-q${k}-${q.truth === right ? 0 : 1}`);
      else await g.frame.fill(`#fc-q${k}`, right ? q.answer : 'nope');
    }
    await g.shot(SHOTS, 'test');
    await g.frame.click('#fc-submit'); await g.on('testdone');
    assert.equal(await g.frame.textContent('#fc-score'), '86%');
    assert.match(await g.frame.textContent('#fc-review'), /Right answer:/);
    assert.deepEqual((await g.msgs('brb:gameover')).map(m => m.score), [86]);
    const s = await g.state(); assert.equal(s.levels[qs[0].i], 0); assert.equal(s.misses[qs[0].i], 1);
    await g.shot(SHOTS, 'test-done');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('make a set: paste a list, draft with AI, a lesson document, an emoji, the checks, save, the class code, link, QR and Assign', { skip, timeout: 180_000 }, async () => {
  const g = await open();
  try {
    await g.on('home'); await g.frame.click('#fc-make'); await g.on('build');
    await g.frame.fill('#fc-title', 'Ecosystems');
    await g.frame.fill('#fc-paste', 'Term,Definition\nhabitat\twhere an animal lives\npredator - an animal that hunts\n"prey","hunted, by a predator"\nhabitat - again');
    await g.frame.click('#fc-addthese');
    assert.equal((await g.state()).draft, 3); assert.match(await g.frame.textContent('#fc-pastemsg'), /Cards added: 3/);
    await g.frame.fill('#fc-level', 'Grade 4'); await g.frame.fill('#fc-topic', 'Parts of a plant'); await g.frame.selectOption('#fc-count', '5');
    await g.frame.click('#fc-draft'); await g.until(() => window.__brbTest.fcState().draft === 7);
    const ask = (await g.msgs('brb:cards'))[0];
    assert.deepEqual([ask.topic, ask.level, ask.count], ['Parts of a plant', 'Grade 4', 5]);
    assert.match(await g.frame.textContent('[data-screen="build"]'), /drafted by AI/);
    await g.frame.setInputFiles('#fc-doc', { name: 'lesson.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
    await g.until(() => window.__brbTest.fcState().draft === 8);
    assert.match(await g.frame.textContent('#fc-aimsg'), /no definition yet/);
    // the card from the document with no definition: the check stops it, then it is filled in
    await g.frame.click('#fc-save'); assert.match(await g.frame.textContent('#fc-buildmsg'), /needs a term and a definition/);
    const n = await g.frame.locator('.fc-erow').count();
    await g.frame.fill(`.fc-erow >> nth=${n - 1} >> .fc-def`, 'the wearing away of land');
    await g.frame.click('.fc-erow >> nth=0 >> .fc-emobtn'); await g.frame.click('.fc-picks button >> nth=2');
    await g.shot(SHOTS, 'make');
    await g.frame.click('#fc-save'); await g.until(() => !!document.getElementById('fc-classcode'));
    const items = (await g.msgs('brb:set-save'))[0].items;
    assert.equal(items[0].t, 'Ecosystems'); assert.equal(items[0].c.length, 8); assert.equal(items[0].c[0][2], '🐱'); assert.equal(items[0].a, 't');
    assert.equal(await g.frame.textContent('#fc-classcode'), 'ABCDE FGHJK'); assert.ok(await g.frame.$('#fc-qr'));
    assert.equal(await g.frame.inputValue('#fc-link'), `http://game.invalid/play/flashcards?chapter=${SETID}&lock=1`);
    await g.frame.click('#fc-assign');
    assert.equal((await g.msgs('brb:assign'))[0].opts, `chapter=${SETID}&lock=1`, 'Assign opens the Assign page with the set');
    await g.shot(SHOTS, 'make-saved');
    assert.equal((await g.state()).mine, 1, 'the draft is in Your sets');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('a student opens a set from a lesson step: the note that the teacher sees mastery, card states sent; print; no builder', { skip, timeout: 120_000 }, async () => {
  const g = await open({ set: { id: SETID, items: ITEMS, mine: false }, make: false, clues: false, canAssign: false, lesson: true });
  try {
    await g.on('set');
    assert.match(await g.frame.textContent('[data-screen="set"]'), /Your teacher sees which cards you've mastered/);
    assert.equal(await g.frame.$('#fc-edit'), null); assert.equal(await g.frame.$('#fc-share'), null);
    await g.frame.click('#fc-print'); assert.equal((await g.msgs('brb:print'))[0].doc.as, 'cards');
    await g.frame.click('#fc-m-learn'); await g.on('learn');
    await learnAnswer(g, false); await learnAnswer(g, true);
    await g.until(() => true); await g.frame.waitForTimeout(1700);
    const sent = await g.msgs('brb:flash');
    assert.ok(sent.length >= 1); assert.equal(sent.at(-1).cards.length, 4);
    assert.ok(sent.at(-1).cards.some(c => c[0] === 0 && c[1] === 1), 'a missed card with its count');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('a phone in dark mode: every screen fits without sideways scrolling', { skip, timeout: 180_000 }, async () => {
  const g = await open({ width: 390, height: 844, theme: 'dark' });
  try {
    await g.on('home'); assert.equal(await g.frame.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.ok(await g.noSideScroll(), 'home');
    await g.frame.click('#fc-lib'); await g.on('library'); assert.ok(await g.noSideScroll(), 'library');
    await g.frame.click('[data-lib="states-west"]'); await g.on('set'); assert.ok(await g.noSideScroll(), 'set');
    for (const [b, scr] of [['#fc-m-flip', 'flip'], ['#fc-m-learn', 'learn'], ['#fc-m-match', 'match'], ['#fc-m-test', 'testsetup']]) {
      await g.frame.click('#fc-back').catch(() => {}); if ((await g.state()).screen !== 'set') await g.frame.evaluate(() => window.__brbTest.fcLib('states-west'));
      await g.frame.click(b); await g.on(scr); assert.ok(await g.noSideScroll(), scr);
    }
    await g.frame.click('#fc-matchgo').catch(() => {});
    await g.frame.evaluate(() => window.__brbTest.fcLib('states-west')); await g.frame.click('#fc-m-match'); await g.frame.click('#fc-matchgo'); await g.on('matchplay'); assert.ok(await g.noSideScroll(), 'match board');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
