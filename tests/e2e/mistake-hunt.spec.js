// Mistake Hunt end to end on the real server (docs/decisions.md "Mistake Hunt"):
//   - a teacher on a laptop pastes a passage, plants mistakes, marks one of their own on a word, pins one, adds a second
//     passage, saves (a class code, a link, a QR code, Assign), prints the worksheet with its answer key (print media and
//     a US Letter PDF: a sheet a passage, then a key a passage) and finds the set in My worksheets;
//   - a student on an iPhone 13 types the class code, taps words to fix them (one fix across two words), Checks ("You
//     found 2 of N. Keep going!"), takes a hint, fixes the rest, moves to the next passage and reaches the end card;
//     the passage stays left to right, the page never scrolls sideways.
// MH_SHOTS=<dir> saves screenshots (device scale 2) and the PDF there.
import { test, expect, devices } from '@playwright/test';
import path from 'node:path';
import { teacherSignup, signup, gameFrame } from './helpers.js';
import { pdfInfo } from '../../server/services/pdf-text.js';

const SHOTS = process.env.MH_SHOTS || '';
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts }); };
const TEXT1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly. Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground. These clues help them warn people to leave their homes in time.";
const TEXT2 = "Last summer, my family visited a volcano in Hawaii. We walked carefully along the trail, and we saw red, orange, and yellow rocks. My brother asked if the volcano was still active. The ranger said that it erupts every few years. I think it's the most amazing place I have ever seen.";
let code = '';

async function stubPrint(page) {
  await page.addInitScript(() => {
    window.__printed = 0; window.print = () => { window.__printed++; };
    window.addEventListener('afterprint', e => { if (window.__keepPrint) e.stopImmediatePropagation(); });
  });
}
const state = f => f.evaluate(() => window.__brbTest.mhState());
const noSideScroll = f => f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test.describe.configure({ mode: 'serial' });
test.use({ deviceScaleFactor: 2 });

test('a teacher builds a passage set, marks and pins mistakes, saves it, prints the worksheet and key, finds it in My worksheets', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await teacherSignup(page);
  await stubPrint(page);
  await page.goto('/play/mistake-hunt');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState && window.BRB.canPrint === true && window.BRB.canListSets === true);
  await f.click('#mh-make');
  await f.fill('#mh-title', 'Volcanoes: find the mistakes');
  await f.fill('#mh-ptitle', 'Inside a volcano');
  await f.fill('#mh-paste', TEXT1);
  await f.click('#mh-use');
  await expect(f.locator('#mh-mlist .mrow')).toHaveCount(6);
  await expect(f.locator('#mh-msg')).toHaveText('Planted 6 mistakes.');
  // the teacher's own mistake: tap a word, pick a kind that fits ("watch" has none, "small" has the dropped letter)
  const small = f.locator('#mh-btext .tok', { hasText: /^small$/ });
  if (await small.count()) {
    await small.first().click();
    await expect(f.locator('#mh-mark')).toBeVisible();
    await f.fill('#mh-own', 'smal'); await f.selectOption('#mh-ownkind', 'sp-double'); await f.click('#mh-ownadd');
    await expect(f.locator('#mh-mlist .mrow')).toHaveCount(7);
  }
  // pin the first one: it survives a re-roll
  const first = await f.locator('#mh-mlist .mrow').first().locator('.fixline').textContent();
  await f.locator('#mh-mlist .mrow').first().locator('.ibtn').click();
  await f.locator('.menu .mitem').first().click();
  await expect(f.locator('#mh-mlist .pinmark').first()).toBeVisible();
  await f.click('#mh-plant');
  await expect(f.locator('#mh-mlist .fixline', { hasText: first })).toHaveCount(1);
  await shot(page, 'builder-laptop', { fullPage: true });
  // the builder on an iPhone's width: nothing scrolls sideways
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(f)).toBe(true);
  await shot(page, 'builder-iphone', { fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  // a second passage
  await f.click('#mh-addpassage');
  await f.fill('#mh-ptitle', 'A trip to a volcano'); await f.fill('#mh-paste', TEXT2); await f.click('#mh-use');
  await expect(f.locator('#mh-mlist .mrow')).toHaveCount(6);
  // save: the class code, link, QR code and Assign
  await f.click('#mh-save');
  await expect(f.locator('#mh-share')).toBeVisible();
  code = (await f.locator('#mh-sharecode').textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{5} [A-Z0-9]{5}$/);
  await expect(f.locator('#mh-link')).toContainText('/play/mistake-hunt?chapter=s-');
  await expect(f.locator('canvas.qr')).toBeVisible(); await expect(f.locator('#mh-assign')).toBeVisible();
  // print the worksheet and the answer key: a sheet a passage, then a key a passage
  await f.click('#mh-print');
  await f.fill('#mh-note', 'Use a pencil. Read each passage out loud first.');
  await f.click('#mh-print-key');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const area = page.locator('#print-area');
  await expect(area.locator('.mhp-sheet')).toHaveCount(2); await expect(area.locator('.mhp-key')).toHaveCount(2);
  await expect(area).toContainText('Answer key · For teachers'); await expect(area).toContainText(`Class code: ${code}`);
  await expect(area.locator('.mhp-sheet').first()).toContainText('Use a pencil.');
  await page.evaluate(() => { window.__keepPrint = true; });
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 816, height: 1056 });
  await expect(page.locator('#print-area')).toBeVisible();
  await shot(page, 'print-sheet-and-key', { fullPage: true });
  await page.locator('.mhp-sheet').first().screenshot(SHOTS ? { path: path.join(SHOTS, 'print-sheet.png') } : {});
  await page.locator('.mhp-key').first().screenshot(SHOTS ? { path: path.join(SHOTS, 'print-key.png') } : {});
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, ...(SHOTS ? { path: path.join(SHOTS, 'print.pdf') } : {}) });
  expect(pdfInfo(pdf).pages).toBeGreaterThanOrEqual(4);
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { window.__keepPrint = false; document.body.classList.remove('printing'); });
  // My worksheets: the set, its code, Print and More
  await f.click('#mh-home'); await f.click('#mh-ws');
  await expect(f.locator('#mh-wslist .wsrow')).toHaveCount(1);
  await expect(f.locator('#mh-wslist')).toContainText('Volcanoes: find the mistakes');
  await expect(f.locator('#mh-wslist')).toContainText(/2 passages · \d+ mistakes/);
  await expect(f.locator('#mh-wslist .codechip')).toHaveText(code);
  await f.locator('#mh-wslist .ibtn').click();
  await expect(f.locator('.menu')).toContainText('Answer key');
  await shot(page, 'my-worksheets');
  await page.keyboard.press('Escape');
});

test('a student on an iPhone 13 opens the set by its class code, fixes words, checks, takes a hint and reaches the end card', async ({ browser }) => {
  test.setTimeout(180_000);
  expect(code).not.toBe('');
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  try {
    await signup(page);
    await page.goto('/play/mistake-hunt');
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState);
    await f.fill('#mh-code', code.toLowerCase().replace(' ', ''));
    await f.click('#mh-codego');
    await f.waitForFunction(() => window.__brbTest.mhState().screen === 'play');
    expect(await f.locator('#mh-ptext').getAttribute('dir')).toBe('ltr');
    expect(await noSideScroll(f)).toBe(true);
    let key = await f.evaluate(() => window.__brbTest.mhKey());
    const total1 = key.length;
    await expect(f.locator('#mh-tell')).toHaveText(`Find ${total1} mistakes`);
    /** Tap the word, add the next word when the fix spans two, type the fix, Fix. */
    const fix = async k => {
      await f.locator(`#mh-ptext [data-a="${k.a}"]`).tap();
      await expect(f.locator('#mh-sheet')).toBeVisible();
      if (k.b - k.a > 1) await f.locator('#mh-fixnext').tap();
      await f.fill('#mh-fixin', k.right);
      await f.locator('#mh-fixok').tap();
      await expect(f.locator('#mh-sheet')).toHaveCount(0);
    };
    await fix(key[0]);
    await f.locator(`#mh-ptext [data-a="${key[1].a}"]`).tap();
    await shot(page, 'student-iphone');
    await f.locator('#mh-fixback').tap();
    await fix(key[1]);
    await f.locator('#mh-check').tap();
    await expect(f.locator('#mh-result')).toContainText(`You found 2 of ${total1}. Keep going!`);
    await f.locator('#mh-hint').tap();
    await expect(f.locator('#mh-hintcard')).toContainText('A hint for the yellow sentence');
    await expect(f.locator('#mh-ptext .hintline').first()).toBeVisible();
    await shot(page, 'student-after-check-iphone', { fullPage: true });
    for (const k of key.slice(2)) await fix(k);
    await f.locator('#mh-check').tap();
    await expect(f.locator('#mh-result')).toContainText(`You found all ${total1}!`);
    await f.locator('#mh-next').tap();
    await f.waitForFunction(() => window.__brbTest.mhState().run.i === 1);
    key = await f.evaluate(() => window.__brbTest.mhKey());
    for (const k of key) await fix(k);
    await f.locator('#mh-check').tap();
    await f.locator('#mh-next').tap();
    await f.waitForFunction(() => window.__brbTest.mhState().screen === 'end');
    await expect(f.locator('#mh-endscore')).toHaveText(`You found ${total1 + key.length} of ${total1 + key.length} mistakes.`);
    expect((await state(f)).run.over).toBe(true);
    expect(await noSideScroll(f)).toBe(true);
    await shot(page, 'student-end-iphone');
  } finally { await ctx.close(); }
});
