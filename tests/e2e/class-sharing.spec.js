// "Share with my classes" end to end. A teacher has two classes, 5B and Art Club; Ana is in both, Ben only in 5B and
// Cleo only in Art Club. Ana shares her game with 5B only (picking from "Which classes?"); Ben finds it on the class
// page, sees who it is shared with and plays it; Cleo, signed-out visitors and search never see it. The teacher takes
// it off 5B (audit-logged), and Ana's Studio says so. Last, the share sheet and the Games tab on a 360px phone, in dark
// mode and right to left.
import { test, expect } from '@playwright/test';
import { uniq, login, adminPage, templateGame, studioState } from './helpers.js';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const base = () => test.info().project.use.baseURL;
/** The login cards on a /cards page: [{ name, username, password }]. */
async function cards(page) {
  await expect(page.locator('.logincard').first()).toBeVisible();
  const out = [];
  for (const c of await page.locator('.logincard').all()) {
    out.push({ name: (await c.locator('.lc-name').textContent()).trim(), username: (await c.locator('dd b').nth(0).textContent()).trim(), password: (await c.locator('dd b').nth(1).textContent()).trim() });
  }
  return out;
}
async function newClass(teacher, name) {
  await teacher.goto('/teach');
  const drop = teacher.locator('details.libdrop');
  if (!(await drop.evaluate(d => d.open))) await drop.locator('summary').click();   // open only while there are no classes yet
  await teacher.fill('#nc-n', name);
  await Promise.all([teacher.waitForURL(/\/class\/[^/?]+\?tab=students/), teacher.click('form[data-api="/api/classes"] button[type=submit]')]);
  return new URL(teacher.url()).pathname;   // /class/<id>
}
async function addStudents(teacher, names) {
  await teacher.fill('#as-n', names.join('\n'));
  await Promise.all([teacher.waitForURL(/\/cards\//), teacher.click('form[data-api$="/students"]:has(#as-n) button[type=submit]')]);
  return cards(teacher);
}
const shareSheet = page => page.locator('.sheet').filter({ has: page.locator('#vis-go') });

let teacher, ana, ben, cleo, admin, game, cls5B, clsArt, anaState, teacherState;

test.beforeAll(async ({ browser }) => {
  admin = await adminPage(browser);
  await admin.goto('/admin/schools');
  await admin.fill('#sn', `School ${uniq('S')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.selectOption('#st-r', 'teacher');
  await admin.fill('#st-n', 'Maria Rivera');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const [tCard] = await cards(admin);

  teacher = await (await browser.newContext()).newPage();
  await login(teacher, tCard.username, tCard.password);
  cls5B = await newClass(teacher, '5B');
  const [anaCard, benCard] = await addStudents(teacher, ['Ana Silva', 'Ben Okafor']);
  clsArt = await newClass(teacher, 'Art Club');
  const [cleoCard] = await addStudents(teacher, ['Cleo Diaz']);
  // Ana joins Art Club too, from "already at the school"
  await teacher.goto(`${clsArt}?tab=students`);
  await teacher.locator('details.panel summary:has-text("Already at")').click();
  await teacher.locator('fieldset.picklist label:has-text("Ana Silva") input').check();
  await Promise.all([teacher.waitForLoadState('load'), teacher.locator('form:has(fieldset.picklist) button[type=submit]').click()]);
  await expect(teacher.locator('main')).toContainText('Ana Silva');
  teacherState = await teacher.context().storageState();

  const signedIn = async card => { const p = await (await browser.newContext()).newPage(); await login(p, card.username, card.password); return p; };
  ana = await signedIn(anaCard); ben = await signedIn(benCard); cleo = await signedIn(cleoCard);
  anaState = await ana.context().storageState();
});
test.afterAll(async () => { for (const p of [teacher, ana, ben, cleo, admin]) if (p) await p.context().close(); });

test('a student in two classes picks which classes can play her game', async () => {
  game = await templateGame(ana);
  await ana.click('#st-publish');
  const sheet = shareSheet(ana);
  const opt = sheet.locator('[data-vis="class"]');
  await expect(opt).toContainText('My classes');
  await expect(sheet.locator('#cp')).toBeHidden();                       // only shown once "My classes" is picked
  await opt.click();
  await expect(opt).toHaveAttribute('aria-pressed', 'true');
  await expect(opt).toHaveAttribute('aria-expanded', 'true');
  const pick = sheet.locator('fieldset.classpick');
  await expect(pick.locator('legend')).toHaveText('Which classes?');
  await expect(pick.locator('label')).toHaveText([/All my classes/, /^5B$/, /^Art Club$/]);
  await expect(pick).toContainText("Classes you join later aren't added by themselves.");
  await expect(pick.locator('input:checked')).toHaveCount(0);           // nothing ticked the first time
  // nothing ticked: Publish says so, next to the list, and moves to the first box
  await sheet.locator('#vis-go').click();
  await expect(pick.locator('[role="alert"]')).toHaveText('Pick at least one class.');
  await expect(pick.locator('#cp-all')).toBeFocused();
  // "All my classes" ticks both; unticking one leaves it half-ticked
  await pick.locator('#cp-all').check();
  await expect(pick.locator('input[data-class]:checked')).toHaveCount(2);
  await expect(pick.locator('[role="alert"]')).toBeEmpty();
  await pick.locator('label:has-text("Art Club") input').uncheck();
  expect(await pick.locator('#cp-all').evaluate(el => [el.checked, el.indeterminate])).toEqual([false, true]);
  await sheet.locator('#vis-go').click();
  await expect(ana.locator('#vis-go')).toHaveCount(0);
  await expect(ana.locator('#toasts')).toContainText('Live for 5B!');
  await expect(ana.locator('#st-live')).toContainText('Live: version 1 · 🎒 My class');
  await expect(ana.locator('#st-live .st-shared')).toHaveText('🎒 Shared with: 5B');
  const st = await studioState(ana, game.id);
  expect(st.live.visibility).toBe('class');
  expect(st.classShare.live.map(c => c.name)).toEqual(['5B']);
  // opening it again: the list as saved, and closing without a change sends nothing
  await ana.click('#st-share');
  await expect(sheet.locator('label:has-text("5B") input')).toBeChecked();
  await expect(sheet.locator('label:has-text("Art Club") input')).not.toBeChecked();
  await sheet.locator('.close').click();
});

test('a student in one class: "My class" says which, with nothing to tick', async () => {
  const mine = await templateGame(cleo);
  await cleo.click('#st-publish');
  const sheet = shareSheet(cleo);
  const opt = sheet.locator('[data-vis="class"]');
  await expect(opt).toContainText('🎒 My class');
  await expect(opt).toContainText('Only the kids and teachers in Art Club can find and play it.');
  await expect(opt).not.toHaveAttribute('aria-expanded', /.*/);
  await opt.click();
  await expect(sheet.locator('fieldset.classpick')).toHaveCount(0);
  await sheet.locator('#vis-go').click();
  await expect(cleo.locator('#toasts')).toContainText('Live for Art Club!');
  await expect(cleo.locator('#st-live .st-shared')).toHaveText('🎒 Shared with: Art Club');
  expect((await studioState(cleo, mine.id)).classShare.live.map(c => c.name)).toEqual(['Art Club']);
});

test('a classmate finds it on the class page and plays it; nobody else can see it', async ({ browser }) => {
  // Ben (5B): "Games from our class", and the game page says who it is shared with
  await ben.goto(cls5B);
  const section = ben.locator('section:has(h2:has-text("Games from our class"))');
  const card = section.locator(`a.gcard[href="/g/${game.slug}"]`);
  await expect(card).toBeVisible();
  // inside the class's own section every game is a class game, so the "Class only" tag is left off there
  await expect(card.locator('.vis-pill')).toHaveCount(0);
  await expect(card).not.toHaveAttribute('aria-label', /Class only/);
  await card.click();
  await expect(ben.locator('.sharedwith')).toContainText('Shared with:');
  await expect(ben.locator('.sharedwith li')).toHaveText(['5B']);
  await ben.locator('#sharebtn').click();
  await expect(ben.locator('.sheet .notice')).toContainText('🎒 Only the classes this game is shared with can open this link.');
  await ben.locator('.sheet .close').click();
  const play = await ben.goto(`/play/${game.slug}`);
  expect(play.status()).toBe(200);
  await expect.poll(() => ben.frames().some(f => f.url().includes('/frame/')), { timeout: 15000 }).toBe(true);

  // Cleo (Art Club only): not on her class page, not at its address, not in search or on Home
  await cleo.goto(clsArt);
  await expect(cleo.locator('section:has(h2:has-text("Games from our class")) a.gcard')).toHaveCount(1);   // her own game only
  await expect(cleo.locator(`a[href="/g/${game.slug}"]`)).toHaveCount(0);
  expect((await cleo.goto(`/g/${game.slug}`)).status()).toBe(404);
  await expect(cleo.locator('main')).toContainText("isn't shared with you");
  await cleo.goto(`/search?q=${encodeURIComponent(game.title)}`);
  await expect(cleo.locator(`a[href="/g/${game.slug}"]`)).toHaveCount(0);
  await cleo.goto('/');
  await expect(cleo.locator(`a[href="/g/${game.slug}"]`)).toHaveCount(0);

  // signed out
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto(`/g/${game.slug}`)).status()).toBe(404);
  expect((await anon.goto(`/play/${game.slug}`)).status()).toBe(404);
  await anon.goto(`/search?q=${encodeURIComponent(game.title)}`);
  await expect(anon.locator(`a[href="/g/${game.slug}"]`)).toHaveCount(0);
  await anon.context().close();
});

test('the teacher takes the game off the class; it is gone for the class and the builder is told', async () => {
  await teacher.goto(`${cls5B}?tab=games`);
  await expect(teacher.locator('.classtabs a[aria-current="page"]')).toContainText('Games');
  const row = teacher.locator('.cg-row', { hasText: game.title });
  await expect(row).toContainText('Ana Silva');                         // staff see the real name
  teacher.once('dialog', d => d.accept());
  await Promise.all([teacher.waitForLoadState('load'), row.locator('button:has-text("Take off this class")').click()]);
  await expect(teacher.locator('#toasts')).toContainText('Taken off 5B.');
  await expect(teacher.locator('section .cg-row', { hasText: game.title })).toHaveCount(0);
  await expect(teacher.locator('details.cg-off summary')).toHaveText('1 game taken off');

  await ben.goto(cls5B);
  await expect(ben.locator(`a.gcard[href="/g/${game.slug}"]`)).toHaveCount(0);
  expect((await ben.goto(`/g/${game.slug}`)).status()).toBe(404);

  // Ana: nobody can play it now, and 5B can't be picked again
  await ana.goto(`/studio/${game.id}`);
  await expect(ana.locator('#st-live')).toContainText('only you can play it');
  await ana.click('#st-share');
  const sheet = shareSheet(ana);
  await expect(sheet.locator('fieldset.classpick')).toBeVisible();
  const off = sheet.locator('label:has-text("5B")');
  await expect(off.locator('input')).toBeDisabled();
  await expect(off).toContainText('Your teacher took it off this class.');
  await sheet.locator('.close').click();

  await admin.goto('/admin?tab=audit');
  await expect(admin.locator('tr', { hasText: 'class.game_remove' }).first()).toContainText(game.title);

  // allow again: the class can be picked again, but only the builder decides to share it there
  await teacher.locator('details.cg-off summary').click();
  await Promise.all([teacher.waitForLoadState('load'), teacher.locator('details.cg-off button:has-text("Allow again")').click()]);
  await expect(teacher.locator('#toasts')).toContainText('can share it with 5B again');
  await ben.goto(cls5B);
  await expect(ben.locator(`a.gcard[href="/g/${game.slug}"]`)).toHaveCount(0);
  await ana.reload(); await ana.click('#st-share');
  const again = shareSheet(ana);
  await expect(again.locator('label:has-text("5B") input')).toBeEnabled();
  // Ana chooses to share it with 5B again: now the class sees it
  await again.locator('label:has-text("5B") input').check();
  await again.locator('#vis-go').click();
  await expect(ana.locator('#st-live .st-shared')).toContainText('5B');
  await ben.goto(cls5B);
  await expect(ben.locator(`a.gcard[href="/g/${game.slug}"]`)).toBeVisible();
});

test('share sheet and Games tab fit a 360px phone, in dark mode and right to left', async ({ browser }) => {
  for (const [lang, scheme] of [['en', 'light'], ['en', 'dark'], ['he', 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, storageState: anaState });
    await ctx.addCookies([{ name: 'lang', value: lang, url: base() }]);
    const p = await ctx.newPage();
    await p.goto(`/studio/${game.id}`);
    await p.click('#st-share');
    const pick = p.locator('fieldset.classpick');
    await expect(pick).toBeVisible();
    const wide = await p.evaluate(() => [document.documentElement.scrollWidth - innerWidth, (s => s.scrollWidth - s.clientWidth)(document.querySelector('.sheet'))]);
    expect(wide, `${lang}/${scheme}`).toEqual([0, 0]);
    if (lang === 'he') {
      // the rail sits on the right, and each box comes before its name in reading order (to its right)
      expect(await pick.evaluate(el => [getComputedStyle(el).direction, getComputedStyle(el).borderRightWidth])).toEqual(['rtl', '3px']);
      const row = pick.locator('label:has-text("Art Club")');
      const [box, text] = await Promise.all([row.locator('input').boundingBox(), row.locator('span').first().boundingBox()]);
      expect(box.x).toBeGreaterThan(text.x);
    }
    await ctx.close();

    const tctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, storageState: teacherState });
    await tctx.addCookies([{ name: 'lang', value: lang, url: base() }]);
    const tp = await tctx.newPage();
    await tp.goto(`${cls5B}?tab=games`);
    await expect(tp.locator('.cg-row')).toHaveCount(1);
    expect(await tp.evaluate(() => document.documentElement.scrollWidth - innerWidth), `games tab ${lang}/${scheme}`).toBeLessThanOrEqual(0);
    await tctx.close();
  }
});
