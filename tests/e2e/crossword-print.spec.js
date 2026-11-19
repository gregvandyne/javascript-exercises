// Crossword's Print on the real play page (docs/decisions.md "Crossword: print a puzzle"): the game asks with BRB.print,
// the play page has the server make the printable page, puts it in its print area and prints (window.print is stubbed
// here, so no dialog opens). Checked in print media and as a PDF (Letter and A4):
//   - a teacher's unsaved draft from the preview: Print offers "Puzzle" and "Puzzle + answer key"; the key is a page of
//     its own with the letters; the puzzle has the grid numbers, Across and Down, the word bank, Name and Date;
//   - the teacher's own instructions (the box under Print): printed above the grid with their line breaks, never on the
//     answer key, kept with the crossword (the game's save) and still there when it is opened again;
//   - saved: the class code is in the footer;
//   - a student on the shared link: Print on the play screen gives the blank puzzle (none of their typed letters), no
//     key choice, and the server refuses them the key if asked directly;
//   - a Hebrew viewer: the lists right to left, the English grid left to right.
// CW_SHOTS=<dir> saves screenshots and PDFs there.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { teacherSignup, signup, gameFrame } from './helpers.js';
import { pdfInfo } from '../../server/services/pdf-text.js';

const SHOTS = process.env.CW_SHOTS || '';
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts }); };
const WORDS = 'habitat - where an animal lives\npredator: an animal that hunts others\nprey - an animal that is hunted\nerosion - the wearing away of land\nmigrate - to move with the seasons\ncamouflage - colors that help an animal hide';
let setId = '';

/** window.print on the play page only counts (the game frame can't print at all). page.pdf() fires afterprint, which
 *  would clear the print area (as closing the print dialog does), so the area is kept here for the PDFs. */
async function stubPrint(page) {
  await page.addInitScript(() => {
    window.__printed = 0; window.print = () => { window.__printed++; };
    window.addEventListener('afterprint', e => { if (window.__keepPrint) e.stopImmediatePropagation(); });
  });
}
/** The print view as the printer sees it: print media, the page's width at 96 dpi; a PDF in Letter and A4. -> pages */
async function printView(page, name) {
  await page.evaluate(() => { window.__keepPrint = true; });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#stage')).toBeHidden();
  await expect(page.locator('#print-area')).toBeVisible();
  const vp = page.viewportSize();
  await page.setViewportSize({ width: 816, height: 1056 });
  await shot(page, name, { fullPage: true });
  const pages = {};
  for (const format of ['Letter', 'A4']) {
    const pdf = await page.pdf({ format, printBackground: true, ...(SHOTS && format === 'Letter' ? { path: path.join(SHOTS, `${name}.pdf`) } : {}) });
    pages[format] = pdfInfo(pdf).pages;
  }
  await page.setViewportSize(vp); await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.__keepPrint = false; });
  return pages;
}

test.describe.configure({ mode: 'serial' });

test('a teacher prints an unsaved draft with its answer key, then the saved puzzle with its class code', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  await teacherSignup(page);
  await stubPrint(page);
  await page.goto('/play/crossword');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.cwState && window.BRB.canPrint === true);
  await f.click('#cw-make');
  await f.fill('#cw-title', 'Habitats');
  await f.fill('#cw-paste', WORDS);
  await f.click('#cw-addgo'); await f.click('#cw-makego');
  await f.waitForFunction(() => window.__brbTest.cwState().screen === 'preview');
  const s = await f.evaluate(() => window.__brbTest.cwState());
  // Print: the choice (puzzle, or puzzle and answer key)
  await expect(f.locator('#cw-print')).toBeVisible();
  await expect(f.locator('#cw-printask')).toBeHidden();
  await f.locator('#cw-print').scrollIntoViewIfNeeded();
  await shot(page, '1-teacher-print-button');
  // the teacher's own instructions: a box under Print, kept with the crossword
  const NOTE = 'Use a pencil.\nCheck your spelling before you hand it in.';
  await expect(f.locator('label[for="cw-mine-note"]')).toHaveText('Your instructions (optional)');
  await expect(f.locator('#cw-mine-note')).toHaveAttribute('maxlength', '300');
  await expect(f.locator('#cw-mine-note')).toHaveAttribute('placeholder', 'For example: Use a pencil. Check your spelling.');
  await expect(f.locator('#cw-mine-hint')).toHaveText('Printed at the top of the puzzle, above the grid.');
  await f.fill('#cw-mine-note', NOTE);
  await f.click('#cw-print');
  await expect(f.locator('#cw-printask')).toBeVisible();
  await expect(f.locator('#cw-print-puzzle')).toBeFocused();
  await f.locator('#cw-printask').scrollIntoViewIfNeeded();
  await shot(page, '2-teacher-print-choice');
  await f.click('#cw-print-key');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const area = page.locator('#print-area');
  await expect(area.locator('.cwp-puzzle h1')).toHaveText('Habitats');
  await expect(area.locator('.cwp-key h1')).toHaveText('Habitats: Answer key');
  await expect(area.locator('.cwp-list h2')).toHaveText(['Across', 'Down']);
  await expect(area.locator('.cwp-bank li')).toHaveCount(0);   // no word bank: the option is off
  await expect(area.locator('.cwp-lines')).toContainText('Name:');
  await expect(area.locator('.cwp-lines')).toContainText('Date:');
  // the grid's numbers and squares are the game's own; the key has every letter, the puzzle none
  const nums = [...new Set(s.answers.map(a => a.num))].map(String);
  await expect(area.locator('.cwp-puzzle .cwp-n')).toHaveText(nums);
  expect(await area.locator('.cwp-puzzle .cwp-l').count()).toBe(0);
  expect(await area.locator('.cwp-key .cwp-l').count()).toBe(s.cells);
  expect(await area.locator('.cwp-puzzle rect').count()).toBe(s.cells);
  for (const a of s.answers) await expect(area.locator(`.cwp-list:has(h2:text("${a.dir === 'a' ? 'Across' : 'Down'}")) li:has(b:text-is("${a.num}"))`)).toHaveCount(1);
  await expect(area.locator('.cwp-foot').first()).toHaveText('Made with Oomba Academy');
  // the note: on the puzzle, above the grid, with its line break; never on the key
  await expect(area.locator('.cwp-puzzle .cwp-mine')).toHaveText(NOTE, { useInnerText: true });
  expect(await area.locator('.cwp-puzzle .cwp-mine + .cwp-gridbox').count()).toBe(1);
  await expect(area.locator('.cwp-key .cwp-mine')).toHaveCount(0);
  // in print: only the print area; the key starts its own page (Letter and A4: the puzzle, then the key)
  const pages = await printView(page, '3-print-puzzle-and-key');
  expect(pages).toEqual({ Letter: 2, A4: 2 });
  // Save, then the puzzle only: the class code in the footer, no key
  await f.click('#cw-edit'); await f.check('#cw-bank'); await f.click('#cw-makego');
  await f.waitForFunction(() => window.__brbTest.cwState().screen === 'preview');
  await expect(f.locator('#cw-mine-note')).toHaveValue(NOTE);   // kept with the crossword
  await f.click('#cw-save');
  await f.waitForSelector('#cw-classcode');
  setId = await f.evaluate(() => window.__brbTest.cwState().set || '');
  if (!setId) setId = 's-' + (await f.textContent('#cw-classcode')).replace(/\s/g, '').toLowerCase();
  const code = await f.textContent('#cw-classcode');
  await f.click('#cw-print'); await f.click('#cw-print-puzzle');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(2);
  await expect(area.locator('.cwp-key')).toHaveCount(0);
  await expect(area.locator('.cwp-foot')).toContainText(`Class code: ${code}`);
  await expect(area.locator('.cwp-bank h2')).toHaveText('Word bank');
  await expect(area.locator('.cwp-bank li')).toHaveCount(6);
  await expect(area.locator('.cwp-mine')).toHaveText(NOTE, { useInnerText: true });
  expect(await printView(page, '4-print-puzzle-only')).toEqual({ Letter: 1, A4: 1 });
  // a phone: the box fits, no sideways scroll
  await page.setViewportSize({ width: 390, height: 844 });
  await f.locator('#cw-mine-note').scrollIntoViewIfNeeded();
  const fit = await f.evaluate(() => { const b = document.getElementById('cw-mine-note').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
  expect(fit.l).toBeGreaterThanOrEqual(0); expect(fit.r).toBeLessThanOrEqual(fit.w); expect(fit.sw).toBeLessThanOrEqual(fit.w);
  await shot(page, '4b-phone-note-box');
  await page.setViewportSize({ width: 1180, height: 900 });
});

test('a student prints the shared puzzle from the play screen: blank, no answer key; Hebrew reads right to left', async ({ browser }) => {
  test.setTimeout(150_000);
  expect(setId).toMatch(/^s-[a-z0-9]{10}$/);
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  await signup(page);
  await stubPrint(page);
  await page.goto(`/play/crossword?chapter=${setId}&lock=1`);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.cwState && window.__brbTest.cwState().screen === 'play');
  expect(await f.evaluate(() => window.BRB.canAssign)).toBe(false);
  // some letters typed: the printout stays blank
  const first = (await f.evaluate(() => window.__brbTest.cwState())).answers[0];
  await f.evaluate(([r, c, d, w]) => { window.__brbTest.cwSelect(r, c, d); window.__brbTest.cwType(w); }, [first.r, first.c, first.dir, first.letters]);
  expect((await f.evaluate(() => window.__brbTest.cwState())).filled).toBeGreaterThan(0);
  await expect(f.locator('#cw-printit')).toBeVisible();
  await expect(f.locator('#cw-print-key')).toHaveCount(0);
  await shot(page, '5-student-print-button');
  await f.click('#cw-printit');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const area = page.locator('#print-area');
  await expect(area.locator('.cwp-puzzle h1')).toHaveText('Habitats');
  await expect(area.locator('.cwp-l')).toHaveCount(0);
  await expect(area.locator('.cwp-key')).toHaveCount(0);
  await expect(area.locator('.cwp-bank li')).toHaveCount(6);
  await expect(area.locator('.cwp-mine')).toHaveCount(0);   // the teacher's note stays in their own save, not the set
  expect(await printView(page, '6-student-print')).toEqual({ Letter: 1, A4: 1 });
  // asked straight from the page (or a frame that lies): the server says no to the key
  const r = await page.evaluate(async () => {
    const d = JSON.parse(document.getElementById('page-data').textContent);
    const doc = { t: 'x', w: [['cat', 'a pet'], ['tea', 'a drink'], ['art', 'drawing']], g: { w: 3, h: 3, e: [[0, 'a', 0, 0], [2, 'd', 0, 1]] }, key: true };
    const res = await fetch(`/api/games/${d.gameId}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc }) });
    return { status: res.status, body: await res.json() };
  });
  expect(r.status).toBe(403); expect(r.body.code).toBe('key'); expect(r.body.html).toBeUndefined();
  // a print the game didn't get a tap for is refused
  // (Playwright's evaluate counts as a tap, so the game asks a little later, once that has worn off: about 5 s.)
  expect(await f.evaluate(() => new Promise(res => setTimeout(() => window.BRB.print({ t: 'x', w: [['cat', 'a pet'], ['tea', 'a drink'], ['art', 'drawing']], g: { w: 3, h: 3, e: [[0, 'a', 0, 0], [2, 'd', 0, 1]] } }).then(res), 6500)))).toEqual({ error: 'tap' });
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  // Hebrew: the page's words in Hebrew, the clue lists right to left, the English grid left to right
  await page.goto(`/play/crossword?chapter=${setId}&lock=1&lang=he`);
  const fh = await gameFrame(page);
  await fh.waitForFunction(() => window.__brbTest && window.__brbTest.cwState && window.__brbTest.cwState().screen === 'play');
  await fh.click('#cw-printit');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  await expect(area.locator('.cwp')).toHaveAttribute('dir', 'rtl');
  await expect(area.locator('.cwp-list h2')).toHaveText(['מאוזן', 'מאונך']);
  await expect(area.locator('.cwp-gridbox')).toHaveAttribute('dir', 'ltr');
  await expect(area.locator('.cwp-lines')).toContainText('שם:');
  await printView(page, '7-print-hebrew');
  await ctx.close();
});
