// Doodle Hoot Live end to end (docs/live-protocol.md "Doodle Hoot Live"): the demo teacher picks Doodle Hoot on /live
// (word language, level, rounds, drawing time, how players guess), two guests join from their own browsers (a phone
// upright and a phone on its side), the drawer picks a word card and draws with the mouse; the other player and the
// projector see the strokes as they come, an undo on every screen; the guesser types while the drawing goes on: a word
// of the game's list (the drawer and the projector see it), something else (they see only "something else"), then the
// word; the turn ends as soon as everyone has it, and the reveal shows the word on all three screens. Turn 2: the other
// player draws, the first reloads mid-turn and gets the drawing replayed, says it out loud, and the drawer taps
// "Someone said it!" and who. The end: each player's results card, the projector's podium, then the results page. A
// second test, with letter tiles: the host's Clear drawing, a player hiding a drawing, a late joiner who sees the
// drawing so far, the host's own "Someone said it!", and Remove on the drawer. LIVE_SHOTS=<dir> saves screenshots.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { login, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const SHOTS = process.env.LIVE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `doodle-live-${name}.png`) }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const frameOf = page => page.frames().find(x => /\/live\/frame\//.test(x.url()));
async function liveFrame(page) {
  let f = null;
  await expect.poll(async () => {
    f = frameOf(page);
    if (!f) return false;
    try { return !!(await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().doodleLive)); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
async function until(f, fn, timeout = 20_000) {
  let s = null;
  await expect.poll(async () => { try { s = await state(f); return !!fn(s); } catch { return false; } }, { timeout }).toBe(true);
  return s;
}
async function player(browser, code, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await ownIp(page);
  await page.goto(`/join#${code}`);
  await expect(page.locator('#jc')).toHaveValue(code);
  await page.click('#lv-join button[type=submit]');
  await expect(page.locator('#lv-card-step')).toBeVisible();
  await page.click('#lv-go');
  await page.waitForURL(/\/live\/play\//);
  return page;
}
/** A stroke with the mouse through these board points (0-1000 × 0-750). */
async function stroke(page, f, pts) {
  const box = await f.locator('.dh-board canvas').boundingBox();
  const at = i => [box.x + (pts[i] / 1000) * box.width, box.y + (pts[i + 1] / 750) * box.height];
  await page.mouse.move(...at(0)); await page.mouse.down();
  for (let i = 2; i < pts.length; i += 2) await page.mouse.move(...at(i), { steps: 6 });
  await page.mouse.up();
}
/** Tap the tray tiles that spell the word (slot order; hint slots are already filled). */
async function spellByTaps(f, word) {
  const s = await state(f);
  const g = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(word.replace(/\s+/g, ''))].map(x => x.segment);
  const used = new Set(s.hintSlots.map(i => s.slots[i]));
  for (const [j, ch] of g.entries()) {
    if (s.hintSlots.includes(j)) continue;
    const i = s.tray.findIndex((t, k) => t === ch && !used.has(k));
    used.add(i);
    await f.locator(`.dh-tray .dh-tile[data-i="${i}"]`).tap();
  }
}
async function openRoom(host, { rounds = '1', secs = '60', tiles = false } = {}) {
  await login(host, TEACHER.username, TEACHER.password);
  await host.goto('/live');
  await host.locator('label.lv-pick', { has: host.locator('input[value="mode:doodle"]') }).click();
  await expect(host.locator('#lv-doodle-opts')).toBeVisible();
  await expect(host.locator('#lv-sets')).toBeHidden();
  await expect(host.locator('#lv-teams-landing')).toBeHidden();
  await host.selectOption('#lv-doodle-lang', 'en'); await host.selectOption('#lv-doodle-level', '1');
  await expect(host.locator('#lv-doodle-sample')).toContainText('·');
  await host.selectOption('#lv-doodle-rounds', rounds); await host.selectOption('#lv-doodle-secs', secs);
  await expect(host.locator('#lv-doodle-guess')).toHaveValue('0');   // typing unless the host picks tiles
  await host.selectOption('#lv-doodle-guess', tiles ? '1' : '0');
  await host.locator('input[name="audience"][value="open"]').check();
  await host.locator('#lv-new button[type=submit]').click();
  await host.waitForURL(/\/live\/host\//);
  return (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
}

test('a family room: two players in different places draw and spell, a reload mid-turn, the podium and the results', async ({ browser }) => {
  test.setTimeout(240_000);
  const hctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hctx.newPage();
  const errors = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));
  const code = await openRoom(host);
  // the join box: the link to share (the code in the address's #) and Play too; Start waits for two players
  await expect(host.locator('#lv-copy-link')).toHaveAttribute('data-url', new RegExp(`/join#${code}$`));
  await expect(host.locator('#lv-play-too')).toHaveAttribute('href', new RegExp(`/join#${code}$`));
  await expect(host.locator('#lv-controls [data-lv-act="next"]')).toHaveCount(0);
  await expect(host.locator('#lv-teamsbox')).toHaveCount(0);
  await expect(host.locator('#lv-controls [data-lv-act="start"]')).toBeDisabled();
  const a = await player(browser, code, { width: 390, height: 844 });
  const b = await player(browser, code, { width: 844, height: 390 });
  for (const [i, p] of [a, b].entries()) p.on('pageerror', e => errors.push(`player ${i}: ${e.message}`));
  await expect(host.locator('#lv-controls [data-lv-act="start"]')).toBeEnabled();
  const hf = await liveFrame(host), fa = await liveFrame(a), fb = await liveFrame(b);
  await expect(hf.locator('.dh-people li')).toHaveCount(2);
  await shot(host, 'lobby-host'); await shot(a, 'lobby-phone');
  // start: A (first in) draws first and gets three word cards; nobody else sees a word
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  const pick = await until(fa, s => s.ph === 'pick' && s.choices);
  expect(pick.choices).toHaveLength(3);
  expect((await state(fb)).choices).toBeNull(); expect((await state(hf)).word).toBeNull();
  await expect(fb.locator('.dh-screen h2')).toContainText('is choosing a word');
  await shot(a, 'pick-phone');
  await fa.locator('.dh-card[data-i="0"]').tap();
  const word = (await until(fa, s => s.ph === 'draw' && s.canDraw && s.word)).word;
  expect(word).toBe(pick.choices[0]);
  await expect(fa.locator('.dh-theword')).toContainText(word.toUpperCase());
  // three strokes with the mouse: the other player and the projector see the same points
  await stroke(a, fa, [200, 200, 400, 250, 600, 200, 800, 260]);
  await stroke(a, fa, [300, 500, 500, 600, 700, 500]);
  await stroke(a, fa, [500, 300, 520, 320]);
  const drawn = await until(fa, s => s.strokes === 3 && s.queue === 0);
  await until(fb, s => s.strokes === 3 && s.points === drawn.points);
  await until(hf, s => s.strokes === 3 && s.points === drawn.points);
  expect((await state(hf)).word).toBeNull();
  // B types: no tiles, the word's shape as blanks, the guess box (open from the first stroke)
  const sb0 = await state(fb);
  expect(sb0.typing).toBe(true); expect(sb0.tray).toEqual([]); expect(sb0.typerOn).toBe(true);
  expect(sb0.blanks.reduce((x, y) => x + y, 0)).toBe(word.replace(/\s+/g, '').length);
  await expect(fb.locator('.dh-type input')).toBeVisible();
  // the layout: a phone drawing, a phone on its side spelling, the projector
  expect(await frameProblems(fa)).toEqual([]); expect(await pageScrollsSideways(a)).toBe(false);
  expect(await frameProblems(fb)).toEqual([]); expect(await pageScrollsSideways(b)).toBe(false);
  expect(await frameProblems(hf)).toEqual([]); expect(await pageScrollsSideways(host)).toBe(false);
  await shot(a, 'draw-phone'); await shot(b, 'guess-phone-landscape'); await shot(host, 'draw-host');
  // undo on A: one stroke fewer everywhere
  await fa.locator('.dh-tools [aria-label="Undo"]').tap();
  await until(fb, s => s.strokes === 2); await until(hf, s => s.strokes === 2);
  // B guesses while A draws: another word of the list (A and the projector see it), then something else (they see
  // only that), then the word. B never sees the list; nothing B typed reaches anyone as text.
  const other = pick.choices[1];
  await fb.locator('.dh-type input').fill(other);
  await fb.locator('.dh-type input').press('Enter');
  await expect(fb.locator('.dh-type .dh-say')).toContainText(/Not quite|So close/);
  await until(fa, s => s.feedText.some(x => x.includes(other.toUpperCase())));
  await until(hf, s => s.feedText.some(x => x.includes(other.toUpperCase())));
  await expect(fa.locator('.dh-feed li').first()).toContainText('guessed');
  await shot(a, 'draw-phone-feed'); await shot(host, 'draw-host-feed');
  await b.waitForTimeout(1100);
  await fb.locator('.dh-type input').fill('hello there my friend');
  await fb.locator('.dh-type .dh-go').tap();
  await until(fa, s => s.feedText.some(x => /guessed something else/.test(x)));
  for (const f of [fa, hf]) expect(JSON.stringify(await state(f))).not.toContain('hello there');
  expect((await state(fb)).feedText).toEqual([]);
  // no letters at all, then a double tap: never stuck (the server answers every guess; the box works again)
  await b.waitForTimeout(1150);
  await fb.locator('.dh-type input').fill('???');
  await fb.locator('.dh-type input').press('Enter');
  await expect(fb.locator('.dh-type .dh-say')).toContainText('Type a word with letters');
  await b.waitForTimeout(1150);
  await fb.locator('.dh-type input').fill(word.toUpperCase());
  await fb.locator('.dh-type input').press('Enter');
  await until(fb, s => s.solved);
  await expect(fb.locator('.dh-type .dh-say')).toContainText('You got it!');
  await shot(b, 'correct-phone-landscape');
  // everyone has it: the reveal on every screen
  for (const f of [fa, fb, hf]) { const s = await until(f, x => x.ph === 'reveal'); expect(s.rv.w).toBe(word); }
  await expect(hf.locator('.dh-veil')).toContainText(word.toUpperCase());
  await shot(host, 'reveal-host');
  // turn 2: B draws, A guesses; A reloads mid-turn and gets the drawing so far
  await until(fb, s => s.ph === 'pick' && s.choices, 30_000);
  await fb.locator('.dh-card[data-i="1"]').tap();
  const word2 = (await until(fb, s => s.ph === 'draw' && s.canDraw && s.word)).word;
  await stroke(b, fb, [100, 100, 300, 300, 500, 100]);
  await stroke(b, fb, [600, 400, 900, 600]);
  const d2 = await until(fb, s => s.strokes === 2 && s.queue === 0);
  await until(fa, s => s.strokes === 2);
  await a.reload();
  const fa2 = await liveFrame(a);
  await until(fa2, s => s.ph === 'draw' && s.strokes === 2 && s.points === d2.points && s.typerOn);
  // A says it out loud: B taps "Someone said it!", then A
  await expect(fb.locator('#dhSaid')).toBeVisible();
  await fb.locator('#dhSaid').tap();
  await expect(fb.locator('.dh-sheet h2')).toContainText('Who guessed it?');
  await expect(fb.locator('.dh-sheet .dh-who-btns button')).toHaveCount(1);
  expect(await frameProblems(fb)).toEqual([]);
  await shot(b, 'said-sheet-landscape');
  await fb.locator('.dh-sheet .dh-who-btns button').first().tap();
  await until(fa2, s => s.solved && s.word === word2);
  await expect(fa2.locator('.dh-type .dh-say')).toContainText('You got it!');
  // the end: each player's results card, the projector's podium, then the results page
  await until(hf, s => s.ph === 'done', 30_000);
  await expect(hf.locator('.dh-podium .nm')).toHaveCount(2);
  await until(fb, s => s.results); await until(fa2, s => s.results);
  await expect(fb.locator('.ok-win h2')).toContainText(/place!|Well played!/);
  await shot(host, 'podium-host'); await shot(a, 'results-phone');
  await host.waitForURL(/\/live\/results\//, { timeout: 30_000 });
  await expect(host.locator('main')).toContainText(/\d+/);
  await shot(host, 'results');
  expect(errors).toEqual([]);
  for (const p of [a, b]) await p.context().close();
  await hctx.close();
});

test('the host: Clear drawing, a player hides a drawing, a late joiner sees it so far, Remove on the drawer', async ({ browser }) => {
  test.setTimeout(180_000);
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hctx.newPage();
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { rounds: '2', secs: '100', tiles: true });
  const a = await player(browser, code, { width: 390, height: 844 });
  const b = await player(browser, code, { width: 390, height: 844 });
  const hf = await liveFrame(host), fa = await liveFrame(a), fb = await liveFrame(b);
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  await until(fa, s => s.ph === 'pick' && s.choices);
  await fa.locator('.dh-card[data-i="2"]').tap();
  await until(fa, s => s.canDraw);
  await stroke(a, fa, [100, 600, 900, 100]);
  await until(fb, s => s.strokes === 1); await until(hf, s => s.strokes === 1);
  // Clear drawing (asks first): every screen, the drawer's too
  await host.locator('#lv-controls [data-lv-act="clear"]:not([hidden])').click();
  for (const f of [fa, fb, hf]) await until(f, s => s.strokes === 0);
  // B hides the drawing on their own screen; the host sees how many hid it
  await stroke(a, fa, [200, 200, 800, 600]);
  await until(fb, s => s.strokes === 1);
  await fb.locator('#dhHide').tap();
  await until(fb, s => s.hidden);
  await expect(fb.locator('.dh-board')).toHaveClass(/is-hidden/);
  await expect(host.locator('#lv-hid')).toContainText('1');
  // a late joiner (the host lets late joiners in): the drawing so far, and a tray
  // open rooms lock at the start: "Late join" in the settings lets a late joiner in
  await host.locator('#lv-controls [data-lv-act="settings"]').click();
  await host.locator('#lv-settings-more, #lv-settings .lv-settings-more > summary').first().click();
  await host.check('#lv-hs-late');
  await host.locator('#lv-settings button[value="save"]').click();
  await expect(host.locator('#lv-joinbox')).not.toHaveClass(/is-locked/);
  const c = await player(browser, code, { width: 390, height: 844 });
  const fc = await liveFrame(c);
  await until(fc, s => s.ph === 'draw' && s.strokes === 1 && s.tray.length > 0 && !s.typing);
  // letter tiles: B spells it with taps
  await spellByTaps(fb, (await state(fa)).word);
  await until(fb, s => s.solved);
  // the host's page can say who said it too (the only one left: C)
  await expect(hf.locator('#dhSaid')).toBeVisible();
  await hf.locator('#dhSaid').click();
  await expect(hf.locator('.dh-sheet .dh-who-btns button')).toHaveCount(1);
  await hf.locator('.dh-sheet .dh-who-btns button').first().click();
  await until(fc, s => s.solved);
  await until(hf, s => s.feedText.length >= 2 && s.feedText.some(x => /said it out loud/.test(x)));
  // Remove the drawer: the turn ends and the drawing goes from every screen
  const seatA = (await state(fa)).me;
  await host.locator(`#lv-roster [data-seat="${seatA}"] [data-lv-kick]`).click();
  for (const f of [fb, fc, hf]) await until(f, s => s.strokes === 0 && (s.ph === 'reveal' || s.ph === 'pick'));
  for (const p of [a, b, c]) await p.context().close();
  await hctx.close();
});
