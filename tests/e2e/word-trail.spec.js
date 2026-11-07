// Word Trail through the real play page and sandboxed frame: a whole first lesson by tapping (the new words, then each
// exercise answered on screen), the wrong-answer flow (the right answer shown and read, a heart gone, the exercise
// back at the end), XP, the streak and the trail saved in the player's cloud save (they are there after a reload), the
// score sent with BRB.gameOver; and AI voices: with English switched on, the words, sentences and instructions are asked
// from our server (ctx 'game', Bramble's friendly role) and played, and a made-up line is refused.
import { test, expect } from '@playwright/test';
import { gameFrame, signup, login, ADMIN } from './helpers.js';

test.describe.configure({ mode: 'serial' });
// Reduced motion (the game turns its bobbing, pops and shakes off), so taps land on still targets.
test.use({ reducedMotion: 'reduce' });
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const state = f => T(f, 'state');

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/word-trail');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && document.querySelector('[data-start]'), null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
  return { f, errors };
}
async function tapContinue(f) { await f.locator('#lFb.on [data-act="continue"]').click(); }

test('a first lesson by tapping: new words, every exercise, a wrong answer that comes back; XP and the streak are saved', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  const { f, errors } = await open(page);
  await f.locator('[data-start]').click();
  await expect(f.locator('#map')).toBeVisible();
  // the first stone is open, the second locked
  await expect(f.locator('[data-node="u0l0"].cur')).toBeVisible();
  await f.locator('[data-node="u0l1"]').click();
  await expect(f.locator('.sheet')).toContainText('Not yet!');
  await f.locator('.sheet .btn').click();
  await f.locator('[data-node="u0l0"]').click();
  await expect(f.locator('.sheet .wchip')).toHaveText(['a', 'and', 'away', 'big', 'blue']);
  await f.locator('.sheet [data-go="u0l0"]').click();

  // the new words: the word, its sentence (the word marked), Next
  for (const w of ['a', 'and', 'away', 'big', 'blue']) {
    await expect(f.locator('#lStage .bigword')).toHaveText(w);
    await expect(f.locator('#lStage .sentence .hl')).toHaveText(new RegExp(`^${w}$`, 'i'));
    await f.locator('#lFoot [data-act="next"]').click();
  }
  // the first exercise, answered wrong: the right answer is shown and read, a heart goes, it comes back at the end
  let s = await state(f);
  const first = s.lesson.item, total = s.lesson.total;
  expect(['hear', 'say']).toContain(first.type);
  await T(f, 'answer', true);
  await expect(f.locator('#lFb.on.oops')).toBeVisible();
  await expect(f.locator('#lFb .ans .word')).toHaveText(first.word === 'i' ? 'I' : first.word);
  await expect(f.locator('#lFb')).toContainText("We'll try it again later.");
  s = await state(f);
  expect(s.hearts).toBe(4);
  expect(s.lesson.total).toBe(total + 1);
  expect(s.spoken.slice(-2)[1]).toBe(`w.${first.word}`);
  await tapContinue(f);

  // the rest, each answered right by tapping the real cards, tiles and play buttons
  const types = new Set([first.type]);
  for (let i = 0; i < 30; i++) {
    s = await state(f);
    if (s.screen !== 'lesson') break;
    const it = s.lesson.item; types.add(it.type);
    if (it.type === 'hear' || it.type === 'fill') await f.locator(`#lStage .card[data-word="${it.word}"]`).click();
    else if (it.type === 'say') { await f.locator(`#lStage .opt[data-word="${it.word}"]`).click(); await f.locator('#lFoot [data-act="check"]').click(); }
    else if (it.type === 'build') {
      const word = await f.evaluate(w => window.WTCore.WORDS[w].text, it.word);
      for (const l of word.split('')) await f.locator(`#lStage .tile[data-letter="${l}"]:not(.used)`).first().click();
    } else if (it.type === 'match') {
      const words = await f.evaluate(() => [...document.querySelectorAll('#lStage .pairs .say')].map(b => b.dataset.word));
      for (const w of words) { await f.locator(`#lStage .pairs .say[data-word="${w}"]`).click(); await f.locator(`#lStage .pairs .card[data-word="${w}"]`).click(); }
    } else if (it.type === 'speed') {
      const n = await f.locator(`#lStage .card[data-word="${it.word}"]`).count();
      for (let k = 0; k < n; k++) await f.locator(`#lStage .card[data-word="${it.word}"]:not(.ok)`).first().click();
    }
    await expect(f.locator('#lFb.on')).toBeVisible();
    if (it.retry) expect(it.word).toBe(first.word);
    await tapContinue(f);
  }
  expect([...types].sort()).toEqual(['build', 'fill', 'hear', 'match', 'say', 'speed']);
  await expect(f.locator('#done h1')).toHaveText('Lesson complete!');
  s = await state(f);
  expect(s.lastDone).toMatchObject({ kind: 'lesson', mistakes: 1, streakUp: true });
  expect(s.xp).toBe(s.lastDone.xp);
  expect(s.xp).toBeGreaterThan(10);
  expect(s.streak).toBe(1);
  expect(s.missed).toEqual([first.word]);
  expect(await f.evaluate(() => window.__go)).toEqual([{ won: true, score: s.xp }]);
  await f.locator('#doneFoot [data-act="done"]').click();
  await expect(f.locator('[data-node="u0l1"].cur')).toBeVisible();
  await expect(f.locator('[data-node="u0l0"] .stars svg')).toHaveCount(3);

  // saved in the cloud: after a reload the trail, XP, streak, hearts and the missed word are still there
  await page.waitForTimeout(1500);   // BRB.storage writes are debounced
  const xp = s.xp;
  const again = await open(page);
  s = await state(again.f);
  expect(s).toMatchObject({ xp, streak: 1, hearts: 4, played: 1, current: 'u0l1', done: ['u0l0'] });
  expect(s.missed).toEqual([first.word]);
  // the missed word is in the next lesson
  await T(again.f, 'lesson', 'u0l1');
  const plan = await T(again.f, 'plan');
  expect(plan.items.some(i => i.word === first.word)).toBe(true);
  expect(errors).toEqual([]);
  expect(again.errors).toEqual([]);
});

test('out of hearts: no new lesson, practice instead (it earns a heart back)', async ({ page }) => {
  await signup(page);
  const { f } = await open(page);
  await T(f, 'setSave', { hearts: 0, heartsAt: Date.now(), played: 1, done: { u0l0: 2 }, words: { a: { b: 1, d: 1, n: 1, r: 1, w: 0 }, and: { b: 0, d: 1, n: 1, r: 0, w: 1 }, big: { b: 1, d: 2, n: 1, r: 1, w: 0 } }, missed: ['and'] });
  await T(f, 'start');
  await f.locator('[data-node="u0l1"]').click();
  await f.locator('.sheet [data-go="u0l1"]').click();
  await expect(f.locator('.sheet h2')).toHaveText('Out of hearts');
  await f.locator('.sheet .btn.go').click();
  let s = await state(f);
  expect(s.lesson.kind).toBe('practice');
  expect(s.lesson.item.word).toBe('and');
  await T(f, 'finish');
  s = await state(f);
  expect(s.screen).toBe('done');
  expect(s.hearts).toBe(1);
  expect(s.lastDone).toMatchObject({ kind: 'practice', heart: true });
});

// ---------------------------------------------------------------- AI voices
const LOCALES = ['en', 'en-GB', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
async function setLocales(browser, on) {
  const ctx = await browser.newContext(); const a = await ctx.newPage();
  await login(a, ADMIN.username, ADMIN.password);
  const r = await a.request.post('/api/admin/tts/settings', { data: { locales: Object.fromEntries(LOCALES.map(l => [l, { on: on.includes(l) }])) }, headers: { Origin: new URL(a.url()).origin } });
  expect(r.status(), await r.text()).toBe(200);
  await ctx.close();
}
test.afterAll(async ({ browser }) => { await setLocales(browser, []); });

test('AI voices: the words, sentences and instructions go to our server in Bramble\'s voice and play; a made-up line is refused', async ({ browser, page }) => {
  test.setTimeout(90_000);
  await setLocales(browser, ['en']);
  const asked = [];
  page.on('request', r => { if (r.url().endsWith('/api/tts')) asked.push(r.postDataJSON()); });
  const answered = [];
  page.on('response', r => { if (r.url().endsWith('/api/tts')) answered.push(r.status()); });
  await signup(page);
  const { f } = await open(page);
  const pd = JSON.parse(await page.locator('#page-data').textContent());
  expect(pd.tts.langs).toContain('en');
  expect(await f.evaluate(() => BRB.aiVoice('en'))).toBe(true);
  await f.evaluate(() => { window.__plays = 0; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (String(this.src).startsWith('blob:')) window.__plays++; return p.call(this); }; });
  await f.locator('[data-start]').click();
  await T(f, 'lesson', 'u0l0');
  // the intro reads the instruction, the word and its sentence
  await expect.poll(() => asked.map(x => x.text), { timeout: 20000 }).toEqual(expect.arrayContaining(['A new word! Listen and look.', 'a', 'I see a big dog.']));
  for (const x of asked.filter(x => !x.pre)) expect(x).toMatchObject({ ctx: 'game', lang: 'en', role: 'friendly' });
  await expect.poll(() => f.evaluate(() => window.__plays), { timeout: 20000 }).toBeGreaterThan(0);
  // the 🔊 button reads the word again
  await f.locator('#lStage .introrow .say').click();
  // an exercise: its instruction and a blank sentence are lines of their own
  await T(f, 'intro');
  const it = (await state(f)).lesson.item;
  await expect.poll(() => asked.map(x => x.text), { timeout: 20000 }).toContain(it.type === 'hear' ? 'Listen. Tap the word you hear.' : 'Tap each sound. Which one says this word?');
  expect(answered.every(s => s === 200)).toBe(true);
  // text that is not one of the game's lines is refused by the server (the device's voice would read it)
  const [ref] = await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/tts') && /a big red dog ran/.test(r.request().postData() || '')),
    f.evaluate(() => BRB.speak('a big red dog ran', { lang: 'en', voice: 'friendly' }))]);
  expect(ref.status()).toBe(422);
});
