// Mistake Hunt by touch, in a real browser on the real play page (an emulated phone: 390 x 844, touch, mobile; and a
// laptop at 1366): the fix box opens with the caret at the end (nothing selected), its x clears it and Enter fixes;
// a tap on a word's edge, or in the gap between two words, goes to that word or the nearest one, and a finger that
// moves (a scroll) opens nothing. K-2 tap-only: a grade 1 set assigned for a grade is fixed with no typing (a capital,
// a comma gap, a your / you're choice, an end mark) and the hand-in scores 4 of 4 on the server; a Grammar Lab K-2
// room (commas in a series) plays tap-only and passes. Skipped when no Chromium is installed.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ctx as live, publish, official, teacher, cls, mia, leo, cookieFor, call, q, config, RL } from './_live.js';
import * as PS from '../../server/services/proof-steps.js';
import * as G from '../../server/services/game-sets.js';
import * as GL from '../../server/services/grammar-lab.js';
import { proofCore } from '../../server/services/proof-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const P = proofCore();
const J = x => JSON.parse(JSON.stringify(x));   // proof-core runs in its own context: plain copies to compare
const MH = publish(official, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, reducedMotion: 'reduce' };
const LAPTOP = { viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' };

let browser;
test.before(async () => { if (skip) return; browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); });
test.after(async () => { if (browser) await browser.close(); config.grammarLab = false; config.grammarLabUsers = []; });
test.beforeEach(() => RL._reset());
async function open(who, url, opts) {
  const c = await browser.newContext(opts);
  const [name, value] = cookieFor(who.id).split('='); await c.addCookies([{ name, value, url: live.base }]);
  const page = await c.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.goto(live.base + url);
  return { c, page, errors };
}
const frameOf = async page => { await page.waitForSelector('#gameframe'); const f = await (await page.$('#gameframe')).contentFrame(); await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState); return f; };
const state = f => f.evaluate(() => window.__brbTest.mhState());
/** Where a point of the frame is on the page (the frame's own top left plus the point). */
const onPage = async (page, x, y) => { const b = await (await page.$('#gameframe')).boundingBox(); return [b.x + x, b.y + y]; };
const closeSheet = async f => { await f.evaluate(() => { const s = document.getElementById('mh-sheet'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await f.waitForSelector('#mh-sheet', { state: 'detached' }); };

test('the fix box on a phone and a laptop: caret at the end, the x clears it, Enter fixes', { skip, timeout: 120_000 }, async () => {
  for (const [name, opts] of [['phone', PHONE], ['laptop', LAPTOP]]) {
    const s = await open(leo, '/play/mistake-hunt', opts);
    const f = await frameOf(s.page);
    await f.evaluate(() => window.__brbTest.mhSample());
    const word = f.locator('#mh-ptext [data-a="4"]');
    const was = (await word.textContent()).trim();
    if (name === 'phone') await word.tap(); else await word.click();
    await f.waitForSelector('#mh-fixin');
    const box = await f.evaluate(() => { const i = document.getElementById('mh-fixin'); return { v: i.value, a: i.selectionStart, b: i.selectionEnd, focused: document.activeElement === i,
      im: i.getAttribute('inputmode'), ac: i.getAttribute('autocomplete'), cap: i.getAttribute('autocapitalize'), cor: i.getAttribute('autocorrect'), sp: i.spellcheck }; });
    assert.deepEqual(box, { v: was, a: was.length, b: was.length, focused: true, im: 'text', ac: 'off', cap: 'off', cor: 'off', sp: false }, `${name}: not selected, caret at the end`);
    // the word being fixed stays in sight above the box
    assert.ok(await f.evaluate(() => document.querySelector('#mh-ptext .tok.sel').getBoundingClientRect().bottom <= document.getElementById('mh-sheet').getBoundingClientRect().top), `${name}: the word above the box`);
    if (name === 'phone') await f.locator('#mh-fixclear').tap(); else await f.click('#mh-fixclear');
    assert.equal(await f.inputValue('#mh-fixin'), '');
    assert.equal(await f.evaluate(() => document.activeElement.id), 'mh-fixin', 'the field keeps the focus');
    assert.ok(await f.locator('#mh-fixclear').isHidden(), 'no x on an empty field');
    await f.locator('#mh-fixin').pressSequentially('zoomed');
    await f.locator('#mh-fixin').press('Enter');
    await f.waitForSelector('#mh-sheet', { state: 'detached' });
    const st = await state(f);
    assert.deepEqual(st.run.e, [{ a: 4, b: 5, s: 'zoomed' }], `${name}: Enter fixed it`);
    assert.deepEqual(s.errors, []);
    await s.c.close();
  }
});

test('taps on a phone: a word\'s edges and the gaps between words go to that word or the nearest; a scroll opens nothing', { skip, timeout: 120_000 }, async () => {
  const s = await open(leo, '/play/mistake-hunt', PHONE);
  const f = await frameOf(s.page);
  await f.evaluate(() => window.__brbTest.mhSample());
  // every word is a full line tall on a touch screen (lines about 44 px apart)
  const m = await f.evaluate(() => { const r = [...document.querySelectorAll('#mh-ptext .tok')].map(b => b.getBoundingClientRect()); return { h: Math.min(...r.map(x => x.height)), touch: getComputedStyle(document.getElementById('mh-ptext')).touchAction }; });
  assert.ok(m.h >= 43, `each word ${m.h} px tall`); assert.equal(m.touch, 'manipulation', 'no double-tap zoom, no 300 ms wait');
  const rects = () => f.evaluate(() => [...document.querySelectorAll('#mh-ptext .tok')].map(b => { const r = b.getBoundingClientRect(); return { a: +b.dataset.a, l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
  const tapAt = async (x, y) => { const [px, py] = await onPage(s.page, x, y); await s.page.touchscreen.tap(px, py); };
  const opened = async () => { await f.waitForSelector('#mh-sheet'); const st = await state(f); await closeSheet(f); return st.fix.a; };
  for (const j of [2, 9, 15, 23]) {
    await f.evaluate(k => document.querySelector(`#mh-ptext [data-a="${k}"]`).scrollIntoView({ block: 'center' }), j);
    const R = await rects(), w = R.find(x => x.a === j), cx = (w.l + w.r) / 2, cy = (w.t + w.b) / 2;
    for (const [x, y, where] of [[w.l + 1.5, cy, 'left edge'], [w.r - 1.5, cy, 'right edge'], [cx, w.t + 1.5, 'top edge'], [cx, w.b - 1.5, 'bottom edge']]) {
      await tapAt(x, y);
      assert.equal(await opened(), j, `word ${j}: ${where}`);
    }
    // the gap after it, a little nearer this word: this word; a little nearer the next one: the next one
    const nx = R.find(x => x.a === j + 1);
    if (nx && Math.abs(nx.t - w.t) < 2) {
      const mid = (w.r + nx.l) / 2;
      await tapAt(mid - 1, cy); assert.equal(await opened(), j, `gap after ${j}, near it`);
      await tapAt(mid + 1, cy); assert.equal(await opened(), j + 1, `gap after ${j}, near the next`);
    }
  }
  // a finger that moves 60 px (a scroll) opens nothing; the same touch held still does
  const R = await rects(), w = R.find(x => x.a === 15), [px, py] = await onPage(s.page, (w.l + w.r) / 2, (w.t + w.b) / 2);
  const cdp = await s.c.newCDPSession(s.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py - 10 * i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await f.waitForTimeout(400);
  assert.equal(await f.locator('#mh-sheet').count(), 0, 'a scroll gesture opens no fix box');
  assert.equal(await f.locator('#mh-ptext .press').count(), 0, 'and lights no word');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px + 3, y: py + 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await f.waitForSelector('#mh-sheet');
  assert.ok((await state(f)).fix, 'a tap that wobbles a few px still opens it');
  assert.deepEqual(s.errors, []);
  await s.c.close();
});

// A grade 1 passage with a capital, a comma, a your / you're and an end mark mistake.
const X = 'Mia and Sam went to the park on Monday. They saw ducks, geese, and frogs at the pond. Your kite is up in the sky, said Sam. Can we stay a little longer? The sun was warm and bright. Mia waved to her friend Leo.';
const M = [{ a: 8, b: 9, w: 'monday.', k: 'pc-proper' }, { a: 11, b: 12, w: 'ducks', k: 'pc-series' }, { a: 18, b: 19, w: "You're", k: 'us-your' }, { a: 32, b: 33, w: 'longer.', k: 'pc-end' }];

test('the tap-only helpers: choices from the word alone, shuffled by group; K-2 on by default, teachers may turn it off', () => {
  assert.equal(P.problem(X, M), '');
  assert.deepEqual(J(P.choicesFor("You're", 'us-your')).slice().sort(), ["You're", 'Your']);
  assert.deepEqual(J(P.choicesFor('your', 'us-your')).map(w => w.toLowerCase()), J(P.choicesFor("you're", 'us-your')).map(w => w.toLowerCase()), 'the same order whichever is shown');
  assert.deepEqual(J(P.choicesFor('their.', 'us-there')).slice().sort(), ['there.', "they're.", 'their.'].sort());
  assert.deepEqual(J(P.choicesFor('longer.', 'end')), ['longer.', 'longer?', 'longer!']);
  assert.deepEqual(J(P.choicesFor('monday.', 'pc-proper')), ['monday.', 'Monday.']);
  assert.deepEqual(J(P.choicesFor('lunch', 'us-your')), []);
  assert.deepEqual(J(P.tapOf([{ g: 1, m: M }])), { on: true, kinds: ['pc-proper', 'pc-series', 'us-your', 'pc-end'] });
  assert.equal(J(P.tapOf([{ g: 1, m: M }], false)).on, false, 'the teacher turned it off');
  assert.equal(J(P.tapOf([{ g: 4, m: M }])).on, false, 'grade 3 and up types');
  assert.equal(J(P.tapOf([{ g: 1, m: [...M, { a: 40, b: 41, w: 'freind', k: 'sp-common' }] }])).on, false, 'a kind that needs typing: typing');
  assert.ok(P.tapTypes(P.preset(2)).every(k => P.TAP[k]) && !P.tapTypes(P.preset(2)).includes('sp-common'));
  const set = G.cleanProofItems([{ t: 'At the park', x: X, g: 1, m: M, o: { h: true, s: true, n: 'total', tap: false } }]);
  assert.equal(set[0].o.tap, false, 'the set keeps the teacher\'s choice');
  assert.equal(PS.viewFor({ title: 't', items: JSON.stringify(PS.snapshotOf(set)) }, null, null).tap.on, false);
  assert.deepEqual(J(PS.viewFor({ title: 't', items: JSON.stringify(PS.snapshotOf([{ ...set[0], o: { h: true, s: true, n: 'total' } }])) }, null, null).tap), { on: true, kinds: ['pc-proper', 'pc-series', 'us-your', 'pc-end'] });
});

test('K-2 tap-only on a phone: a capital, a comma gap, your / you\'re and an end mark, no typing; the hand-in scores 4 of 4', { skip, timeout: 120_000 }, async () => {
  const r = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items: [{ t: 'At the park', x: X, g: 1, m: M, o: { h: true, s: true, n: 'total' } }], title: 'At the park' }, user: teacher });
  assert.equal(r.status, 200, r.text);
  const a = PS.assignSet(teacher, r.json.id, cls.id, {});
  assert.ok(a.ok);
  const s = await open(mia, `/play/mistake-hunt?lesson=${a.classLesson.id}&step=${a.step.id}`, PHONE);
  const f = await frameOf(s.page);
  await f.waitForSelector('#mh-handin');
  assert.equal(await f.evaluate(() => JSON.stringify(window.__brbTest.mhGraded()).includes('"key"')), false, 'no key in the frame');
  assert.equal((await state(f)).run.tap, true, 'tap-only');
  // a capital: Monday ends a sentence, so its word shows the end marks and its capital
  await f.locator('#mh-ptext [data-a="8"]').tap();
  await f.waitForSelector('#mh-end-0');
  assert.equal(await f.locator('#mh-fixin').count(), 0, 'nothing to type');
  await f.locator('#mh-case-0').tap();
  // a capital on a word mid-sentence changes at once (and back)
  await f.locator('#mh-ptext [data-a="2"]').tap();
  assert.deepEqual((await state(f)).run.e.find(e => e.a === 2), { a: 2, b: 3, s: 'sam' });
  assert.equal(await f.locator('#mh-sheet').count(), 0);
  await f.locator('#mh-ptext [data-a="2"]').tap();
  // a comma: the gap after "ducks"
  await f.locator('#mh-gap-11').tap();
  assert.equal(await f.getAttribute('#mh-gap-11', 'aria-pressed'), 'true');
  // your / you're: two big buttons
  await f.locator('#mh-ptext [data-a="18"]').tap();
  await f.waitForSelector('#mh-pick-1');
  assert.deepEqual((await f.$$eval('#mh-sheet .pick', b => b.map(x => x.textContent))).sort(), ["You're", 'Your']);
  await f.locator('#mh-sheet .pick[data-v="Your"]').tap();
  // an end mark: ? for a question
  await f.locator('#mh-ptext [data-a="32"]').tap();
  await f.waitForSelector('#mh-end-1');
  await f.locator('#mh-end-1').tap();
  await f.waitForFunction(() => /Saved/.test(document.getElementById('mh-saved').textContent));
  assert.deepEqual((await state(f)).run.e, [{ a: 8, b: 9, s: 'Monday.' }, { a: 11, b: 12, s: 'ducks,' }, { a: 18, b: 19, s: 'Your' }, { a: 32, b: 33, s: 'longer?' }]);
  await f.locator('#mh-handin').tap();
  await f.locator('#mh-handin-yes').tap();
  await f.waitForSelector('#mh-gscore');
  assert.equal(await f.textContent('#mh-gscore'), 'You found 4 of 4 mistakes (100%).');
  const row = q.get('SELECT score FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', a.classLesson.id, a.step.id, mia.id);
  assert.equal(row.score, 100, 'the server marked it');
  assert.ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  assert.deepEqual(s.errors, []);
  await s.c.close();
});

test('a Grammar Lab K-2 room plays tap-only on a phone: commas in a series by their gaps, handed in and passed', { skip, timeout: 120_000 }, async () => {
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  const id = 'commas-in-a-series', p = GL.pathway('commas', 'k-2');
  for (const tp of p.topics.slice(0, p.topics.indexOf(id))) q.run("INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, 'k-2', 1, 1, 100, NULL, 1)", leo.id, tp);
  const s = await open(leo, `/play/mistake-hunt?glroom=${id}&unit=commas`, PHONE);
  const f = await frameOf(s.page);
  await f.waitForSelector('#mh-handin');
  assert.equal((await state(f)).run.tap, true, 'a K-2 room is tap-only');
  const r = GL.room(id), k = P.key(r.passages[0].x, r.passages[0].m);
  for (const x of k) { await f.locator(`#mh-gap-${x.a}`).tap(); assert.equal(await f.getAttribute(`#mh-gap-${x.a}`, 'aria-pressed'), 'true'); }
  await f.waitForFunction(() => /Saved/.test(document.getElementById('mh-saved').textContent));
  await f.locator('#mh-handin').tap();
  await f.locator('#mh-handin-yes').tap();
  await f.waitForSelector('#mh-gscore');
  assert.match(await f.textContent('#mh-gscore'), new RegExp(`You found ${k.length} of ${k.length} mistakes`));
  assert.match(await f.textContent('#mh'), /You found enough mistakes to pass this room!/);
  assert.ok(GL.roomPassedSet(leo).has(id));
  assert.deepEqual(s.errors, []);
  await s.c.close();
});
