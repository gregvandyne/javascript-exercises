// School and teacher pages on phones (public/css/schools.css, the "tidy-up" section): the two bugs it fixed and the
// layouts it set up. ⋯ menus on a phone open inside the screen (they used to open past its left edge on a class's
// Lessons tab, and cut "Move" off on the Students roster); student names in gradebooks wrap between words, never inside
// one; one lesson's progress fits a laptop with Last active in view. At 360 and 390 px (light and dark) no page scrolls
// sideways, nothing touches, no table hides columns, and every control is a 44 px tap target.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN, login, signup, uniq } from './helpers.js';

const DEMO = 'demo-pass-123', SLUG = 'magic-cups-demo-school';
const PHONES = [{ width: 360, height: 640, scheme: 'light' }, { width: 360, height: 640, scheme: 'dark' }, { width: 390, height: 844, scheme: 'light' }, { width: 390, height: 844, scheme: 'dark' }];
const NAMES = ['Camila Hernández-Valenzuela', 'Kiri Venkataraman', 'Ben Johansson', 'Olivia Papadopoulou', 'Noah Schwarzenegger', 'Aisha Rahman', 'Mateo García', 'Freya Lindqvist', 'Priya Ramachandran', 'Lucía Fernández'];

test.describe.configure({ timeout: 300_000 });

let teacher, head, cls, lessonProgress;
test.beforeAll(async ({ browser }) => {
  // The demo teacher's own class with long names, two units and a lesson (the demo class stays as other specs expect it).
  const tctx = await browser.newContext(); const t = await tctx.newPage();
  await login(t, 'DemoTeacher', DEMO);
  const school = (await (await t.request.get('/teach')).text()).match(/name="schoolId" value="([^"]+)"/)[1];
  const made = await t.request.post('/api/classes', { data: { schoolId: school, name: uniq('Tidy '), grade: '4' } });
  cls = (await made.json()).redirect.match(/\/class\/([^?]+)/)[1];
  const suffix = uniq('').toLowerCase();
  expect((await t.request.post(`/api/classes/${cls}/students`, { data: { names: NAMES.map(n => `${n} ${suffix}`).join('\n'), grade: '4' } })).ok()).toBe(true);
  for (const u of ['Fractions', 'Words']) expect((await t.request.post(`/api/classes/${cls}/units`, { data: { name: u } })).ok()).toBe(true);
  const lib = await (await t.request.get(`/class/${cls}`)).text();
  const lessonId = lib.match(/<select class="input" id="al-l" name="lessonId">(?:<optgroup[^>]*>)?<option value="([^"]+)"/)[1];
  expect((await t.request.post(`/api/classes/${cls}/lessons`, { data: { lessonId } })).ok()).toBe(true);
  lessonProgress = (await (await t.request.get(`/class/${cls}`)).text()).match(/href="(\/class\/[^/"]+\/progress\/[^"#]+)"/)[1];
  teacher = await tctx.storageState(); await tctx.close();
  // A school admin of the demo school: an own account the platform admin appoints.
  const hctx = await browser.newContext(); const h = await hctx.newPage();
  const { username } = await signup(h, uniq('Head'), 'head-pass-123');
  const actx = await browser.newContext(); const a = await actx.newPage();
  await login(a, ADMIN.username, ADMIN.password);
  const sid = (await (await a.request.get(`/school/${SLUG}?tab=people`)).text()).match(/\/api\/schools\/([A-Za-z0-9]+)\/staff/)[1];
  expect((await a.request.post(`/api/schools/${sid}/staff`, { data: { account: 'existing', username, rosterName: 'Ms Head', role: 'admin' } })).ok()).toBe(true);
  await actx.close();
  head = await hctx.storageState(); await hctx.close();
});

/** Controls under 44 px (links inside sentences are not controls; a class card's name link covers the whole card). */
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('main .btn, main select, main textarea, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main summary, main .chip, main a.chip-s')]
  .filter(e => e.checkVisibility() && !e.closest('.inline-menu:not([open]) .menu, [hidden]'))
  .map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || e.value || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`));
/** Cells of a table that a phone cannot see: outside the screen, or hidden by a scrolling wrapper. */
const hiddenCells = page => page.evaluate(() => [...document.querySelectorAll('main table.rtable td, main table.csq-std td')].filter(td => td.checkVisibility() && td.textContent.trim())
  .filter(td => { const r = td.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) return true;
    for (let a = td.parentElement; a; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') { const b = a.getBoundingClientRect(); return r.right > b.right + 1 || r.left < b.left - 1; } } return false; })
  .map(td => td.textContent.trim().slice(0, 30)));

/** The ⋯ menu's box and its controls stay inside the screen and inside any scrolling parent. */
async function menuInView(page, menuSel) {
  const d = page.locator(menuSel).first();
  await d.locator('summary').click();
  await expect(d.locator('.menu')).toBeVisible();
  return d.locator('.menu').evaluate(m => {
    const out = [];
    for (const e of [m, ...m.querySelectorAll('.btn, select, input:not([type=hidden])')]) {
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) out.push(`${e.className || e.tagName} off screen ${Math.round(r.left)}..${Math.round(r.right)}`);
      for (let a = e.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === 'visible') continue;
        const b = a.getBoundingClientRect();
        if (r.left < b.left - 1 || r.right > b.right + 1) out.push(`${e.className || e.tagName} cut off by ${a.className}`);
        break;
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('the page scrolls sideways');
    return out;
  });
}

test('⋯ menus open inside the screen on phones (class Lessons, Students roster, school Classes)', async ({ browser }) => {
  for (const width of [360, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 740 }, storageState: teacher }); const page = await ctx.newPage();
    await page.goto(`/class/${cls}`);
    expect(await menuInView(page, '.cl-row .inline-menu'), `lesson row @${width}`).toEqual([]);
    await page.goto(`/class/${cls}`);
    expect(await menuInView(page, '.unit-head .inline-menu'), `unit @${width}`).toEqual([]);
    await page.goto(`/class/${cls}?tab=students`);
    expect(await menuInView(page, 'table.roster .inline-menu'), `roster @${width}`).toEqual([]);
    // "Move" (to another class) is a whole button inside the open menu
    await expect(page.locator('table.roster .inline-menu[open] form[data-api$="/move"] button')).toBeInViewport({ ratio: 1 });
    await ctx.close();
    const hc = await browser.newContext({ viewport: { width, height: 740 }, storageState: head }); const hp = await hc.newPage();
    await hp.goto(`/school/${SLUG}?tab=classes`);
    expect(await menuInView(hp, 'table.classes .inline-menu'), `school classes @${width}`).toEqual([]);
    await hc.close();
  }
});

test('gradebook names wrap between words, never inside one; one lesson\'s progress fits a laptop', async ({ browser }) => {
  const brokenWords = page => page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('.gradebook .gb-name b')) {
      const text = b.textContent; const node = b.firstChild; if (!node || node.nodeType !== 3) continue;
      // every word (split at spaces; a hyphen may end a line) sits on one line
      let i = 0;
      for (const w of text.split(/(?<=[\s-])/)) {
        const word = w.trimEnd(); const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + word.length); i += w.length;
        const lines = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
        if (lines.size > 1) out.push(word);
      }
    }
    return [...new Set(out)];
  });
  for (const [width, height] of [[360, 640], [390, 844], [1366, 768]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, storageState: teacher }); const page = await ctx.newPage();
    await page.goto(`/class/${cls}/progress`);
    await expect(page.locator('.gradebook .gb-name b').first()).toBeVisible();
    expect(await brokenWords(page), `gradebook @${width}`).toEqual([]);
    await page.goto(lessonProgress);
    expect(await brokenWords(page), `lesson progress @${width}`).toEqual([]);
    if (width === 1366) {
      // the steps table does not scroll sideways, and its last column (Last active) is in view
      expect(await page.locator('table.gradebook.steps').evaluate(t => t.parentElement.scrollWidth - t.parentElement.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('table.gradebook.steps thead th').last()).toBeInViewport({ ratio: 1 });
    }
    await ctx.close();
  }
});

test('school and teacher pages on phones: no sideways scroll, nothing touches, no hidden columns, 44 px targets', async ({ browser }) => {
  const T = [`/teach`, `/class/${cls}`, `/class/${cls}/progress`, lessonProgress, `/class/${cls}/standards`, `/class/${cls}?tab=games`, `/class/${cls}?tab=students`, `/class/${cls}?tab=settings`, '/teach/lessons', `/live?class=${cls}`];
  const H = [`/school/${SLUG}?tab=classes`, `/school/${SLUG}?tab=people`, `/school/${SLUG}?tab=settings`, '/teach'];
  const problems = [];
  for (const v of PHONES) for (const [st, paths] of [[teacher, T], [head, H]]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: st }); const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}`;
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${at}: scrolls sideways by ${wide}px`);
      for (const t of await findTouching(page)) problems.push(`${at}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      for (const s of await smallTargets(page)) problems.push(`${at}: small target ${s}`);
      for (const c of await hiddenCells(page)) problems.push(`${at}: table cell out of sight "${c}"`);
    }
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('the key layouts: jump chips, cards with labels, the name filter, the folded course panels', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher }); const page = await ctx.newPage();
  // Students tab: jump chips to the roster, adding students and the class code (with the code itself)
  await page.goto(`/class/${cls}?tab=students`);
  const code = (await page.locator('.jc-code').textContent()).trim();
  await expect(page.locator('nav.ajump a[href="#class-code"]')).toContainText(code);
  await expect(page.locator('nav.ajump a[href="#roster"]')).toBeVisible();
  // roster rows are labelled cards: no table head, each card shows the grade with its label
  await expect(page.locator('table.roster thead')).toBeHidden();
  expect(await page.locator('table.roster tbody td[data-label]').first().evaluate(td => getComputedStyle(td, '::before').content)).toContain(await page.locator('table.roster tbody td[data-label]').first().getAttribute('data-label'));
  // the name filter hides the rows that don't match, and brings them back
  const rows = page.locator('table.roster tbody tr');
  const all = await rows.count();
  await page.fill('#nf-roster-list', 'venkataraman');
  await expect(rows.filter({ visible: true })).toHaveCount(1);
  await page.fill('#nf-roster-list', 'zzzz');
  await expect(page.locator('[data-filter-none]')).toBeVisible();
  await page.fill('#nf-roster-list', '');
  await expect(rows.filter({ visible: true })).toHaveCount(all);
  // Progress: course panels fold to "0 of N started" while nobody has started
  await page.goto(`/class/${cls}/progress`);
  const course = page.locator('details.coursepanel').first();
  await expect(course).not.toHaveAttribute('open', '');
  await expect(course.locator('summary')).toContainText(`0 of ${NAMES.length} started`);
  // Lessons tab: Assign is a fold at the top; the class has a lesson, so it starts closed
  await page.goto(`/class/${cls}`);
  await expect(page.locator('#lessons .assigndrop')).not.toHaveAttribute('open', '');
  // Lesson library and New unit share a row; Assign opens where its button is (the button stays under the finger)
  const top = sel => page.locator(sel).evaluate(e => Math.round(e.getBoundingClientRect().top));
  expect(await top('#lessons .cl-more > a.btn')).toBe(await top('#lessons .unitdrop > summary'));
  const before = await top('#lessons .assigndrop > summary');
  await page.click('#lessons .assigndrop > summary');
  await expect(page.locator('#lessons .assigndrop')).toHaveAttribute('open', '');
  expect(Math.abs(await top('#lessons .assigndrop > summary') - before)).toBeLessThan(24);
  await ctx.close();
  // School People: counts on the headings and jump chips; grades show as text with ✏️ that opens the same field
  const hc = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: head }); const hp = await hc.newPage();
  await hp.goto(`/school/${SLUG}?tab=people`);
  await expect(hp.locator('nav.ajump a[href="#students"] .badge')).toBeVisible();
  const g = hp.locator('#student-list details.gedit').first();
  await expect(g.locator('input[name=grade]')).toBeHidden();
  await g.locator('summary').click();
  await expect(g.locator('input[name=grade]')).toBeVisible();
  // School Classes: the at-a-glance strip
  await hp.goto(`/school/${SLUG}?tab=classes`);
  await expect(hp.locator('.statstrip li')).not.toHaveCount(0);
  await expect(hp.locator('.statstrip li', { hasText: '🍎' })).toHaveText(/🍎 \d+ staff/);
  // ⋯ sits beside the class name on every card, and opening it does not move it
  const menus = hp.locator('.rtable.classes tbody tr');
  for (let i = 0; i < await menus.count(); i++) {
    const [n, m] = await menus.nth(i).evaluate(tr => [tr.cells[0], tr.querySelector('.inline-menu > summary')].map(e => e.getBoundingClientRect().top));
    expect(Math.abs(n - m)).toBeLessThan(12);
  }
  const first = hp.locator('.rtable.classes .inline-menu > summary').first(); const y = (await first.boundingBox()).y;
  await first.click(); expect((await first.boundingBox()).y).toBe(y);
  await hc.close();
});
