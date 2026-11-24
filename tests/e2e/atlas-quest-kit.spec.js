// Atlas Quest in Crossword's look, on the real play page in Chromium (docs/decisions.md "Atlas Quest in Crossword's
// look"): the globe on its board card beside the widgets, a mode played to its results; a teacher makes a quiz (a
// region's countries, a question of their own), moves an arrow on the map, saves it (class code), prints it with its
// answer key (the map's arrows and lines in the print area) and finds it in My worksheets; a student opens the link,
// plays it with Check and finishes with one BRB.gameOver. window.print is stubbed, so no dialog opens.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { teacherSignup, signup, gameFrame } from './helpers.js';

const EXE = '/opt/pw-browsers/chromium';
if (fs.existsSync(EXE)) test.use({ launchOptions: { executablePath: EXE } });
let link = '';

async function stubPrint(page) {
  await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; window.addEventListener('afterprint', e => e.stopImmediatePropagation()); });
}

test.describe.configure({ mode: 'serial' });

test('a teacher: the globe and modes in the widget look, then a quiz made, arrows moved, saved, printed and listed', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await teacherSignup(page);
  await stubPrint(page);
  await page.goto('/play/atlas-quest');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.make && window.BRB.canPrint === true);
  await f.evaluate(() => window.__brbTest.closeDialog());   // Captain Skye's welcome
  // the look: widgets on the dotted board, the globe on its own board card
  await expect(f.locator('#stage.cw-widget #board canvas#view')).toBeVisible();
  await expect(f.locator('#side .cw-widget .cw-wt').first()).toHaveText('Where to, pilot?');
  // the globe sits straight on the page's dotted board: no card behind it
  expect(await f.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('radial-gradient');
  expect(await f.evaluate(() => getComputedStyle(document.getElementById('stage')).boxShadow)).toBe('none');
  // the home names its groups: Region, Level, Pick a game
  await expect(f.locator('#side .aq-lbl')).toHaveText(['Region', 'Level', 'Pick a game']);
  for (const m of ['tour', 'find', 'flags', 'caps', 'culture', 'daily', 'speed']) await expect(f.locator(`[data-mode="${m}"]`)).toBeVisible();
  // a mode played through: Flag match, every answer right, the results card
  await f.click('[data-mode="flags"]');
  await expect(f.locator('#qHead')).toContainText('Flag match');
  for (let i = 0; i < 10; i++) { await f.evaluate(() => window.__brbTest.answer(true)); await f.evaluate(() => window.__brbTest.next()); }
  await expect(f.locator('#side[data-screen="results"] .cw-wt')).toHaveText('10 of 10 right!');
  await f.click('#aq-home');
  // make a quiz: Europe's map labels, then a question of the teacher's own
  await f.click('#aq-make');
  await expect(f.locator('#page[data-screen="build"]')).toBeVisible();
  await f.fill('#aq-title', 'Western Europe');
  await f.uncheck('#aq-k-cap');
  await f.click('#aq-find'); await f.fill('#aq-find', 'Luxem');
  await f.click('#aq-found button');
  for (const name of ['France', 'Germany', 'Monaco']) { await f.fill('#aq-find', name); await f.click('#aq-found button >> nth=0'); }
  await f.fill('#aq-ownq', 'Which river flows through Paris?'); await f.fill('#aq-owna', 'The Seine');
  await f.click('#aq-ownadd');
  await expect(f.locator('.aq-qrow')).toHaveCount(5);
  await f.click('#aq-makego');
  // the preview: the map as it prints, Luxembourg and Monaco on arrows to answer lines; drag one
  await expect(f.locator('#aq-mapwrap svg [data-co="LU"]')).toBeVisible();
  await expect(f.locator('#aq-mapwrap svg [data-co="MC"]')).toBeVisible();
  const before = await f.evaluate(() => window.__brbTest.arrows().LU);
  await f.locator('#aq-mapwrap [data-co="LU"] .atm-hit').scrollIntoViewIfNeeded();
  const hit = await f.locator('#aq-mapwrap [data-co="LU"] .atm-hit').boundingBox();   // page coordinates
  const x = hit.x + hit.width / 2, y = hit.y + hit.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 60, y - 40, { steps: 6 }); await page.mouse.up();
  const after = await f.evaluate(() => window.__brbTest.arrows().LU);
  expect(after[1]).toBeGreaterThan(before[1]);   // up its column (it stays on its side)
  // leaders never cross, and the lines stand beside the map
  const leaders = await f.evaluate(() => window.__brbTest.leaders());
  const cross = (a, b) => { const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return d(a.p, a.a, b.p) * d(a.p, a.a, b.a) < 0 && d(b.p, b.a, a.p) * d(b.p, b.a, a.a) < 0; };
  for (let i = 0; i < leaders.length; i++) for (let j = i + 1; j < leaders.length; j++) expect(cross(leaders[i], leaders[j]), `${leaders[i].cc} x ${leaders[j].cc}`).toBe(false);
  // take Monaco's arrow away, then put it back
  await f.click('#aq-arrowchips [data-cc="MC"]');
  expect(await f.evaluate(() => !!window.__brbTest.arrows().MC)).toBe(false);
  await f.click('#aq-arrowchips [data-cc="MC"]');
  expect(await f.evaluate(() => !!window.__brbTest.arrows().MC)).toBe(true);
  // save: the class code and the link
  await f.click('#aq-save');
  await expect(f.locator('#aq-classcode')).toHaveText(/^[A-Z0-9]{5} [A-Z0-9]{5}$/);
  link = await f.inputValue('#aq-link');
  expect(link).toMatch(/\/play\/atlas-quest\?chapter=s-[a-z0-9]{10}&lock=1$/);
  // print with the answer key: the server's page lands in the print area, arrows and all
  await f.fill('#aq-mine-note', 'Use a pencil.');
  await f.click('#aq-print'); await f.click('#aq-print-key');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const area = page.locator('#print-area');
  await expect(area.locator('h1').first()).toHaveText('Western Europe');
  await expect(area.locator('.atp-map svg [data-co="LU"]').first()).toBeAttached();
  await expect(area.locator('.cwp-mine')).toHaveText('Use a pencil.');
  await expect(area.locator('.atp-key h1')).toHaveText('Western Europe: Answer key');
  await expect(area.locator('.atp-keylist')).toContainText('The Seine');
  // My worksheets: it is there, with its class code
  await f.click('#aq-edit'); await f.click('#aq-b-home');
  await f.click('#aq-ws');
  await expect(f.locator('.cw-sheet .cw-wstitle')).toHaveText(['Western Europe']);
  expect(errors).toEqual([]);
});

test('a student opens the link, plays the quiz with Check, and the step is done once', async ({ page }) => {
  test.setTimeout(120_000);
  expect(link).toBeTruthy();
  await signup(page);
  await page.goto(new URL(link).pathname + new URL(link).search);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().kind === 'set');
  await f.evaluate(() => { window.__over = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__over.push(o); return g(o); }; });
  await expect(f.locator('#qHead')).toContainText('Western Europe');
  for (let i = 0; i < 4; i++) { await f.evaluate(() => window.__brbTest.answer(true)); await f.evaluate(() => window.__brbTest.next()); }
  // the teacher's own question: typed, then Check
  await f.fill('#aq-own', 'seine'); await f.click('#aq-check');
  await expect(f.locator('#qFeed')).toHaveClass(/good/);
  // a right answer moves on by itself (as in every mode); the last one finishes the quiz
  await expect(f.locator('#side[data-screen="results"] .cw-wt')).toHaveText('5 of 5 right!');
  expect(await f.evaluate(() => window.__over)).toEqual([{ won: true, score: 5 }]);
  // no maker tools for a student: no My worksheets
  await f.click('#aq-home');
  await expect(f.locator('#aq-ws')).toHaveCount(0);
});
