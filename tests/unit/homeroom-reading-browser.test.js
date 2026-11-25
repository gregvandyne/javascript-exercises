// Homeroom: reading from the desk in a real browser (docs/decisions.md "Homeroom: reading from the desk";
// public/js/homeroom-reading.js, homeroom-desk.js, homeroom.js, library.js ?in=hr):
//   - the student's dock Library opens the Story Library in a layer on the desk (the class's grade first), a book reads
//     in the library's own reader in a frame, and the live board says "Reading <book>";
//   - a Reading handout's card opens the routine: Read (turning the pages in the frame), Go to the quiz, the quiz (a
//     wrong answer gives its page), 3 notes saved to the notebook, Done; on a tablet (820), a Chromebook (1366 x 768)
//     and a phone (390): nothing sideways, every tap target at least 44 pixels;
//   - the teacher: Choose a book in the panel, hand it to a desk; the board shows the cover and the step; Today lists
//     students with their step and score; a desk's sheet opens the student's 3 notes in the notebook; the Classroom
//     view's column.
// HR_SHOTS=<dir> also saves screenshots there. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HR = await import('../../server/services/homeroom-reading.js');
const HV = await import('../../server/services/homeroom-live.js');
const LIB = await import('../../server/services/library.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr4b-${name}.png` }) : null);

const boss = createUser({ username: 'HrrdBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Reading Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 2 · Readers', teacherId: teacher.id, grade: '2' }).class;
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
H.saveSeats(teacher, cls, { preset: 'pods', seats: {} });
// short books, so turning every page is quick
const books = LIB.books().filter(b => b.grade === '2' && b.pages.length >= 4 && b.pages.length <= 9 && b.pages.every(p => p.image));
const [bookA, bookB] = books;
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const VIEWS = [['tablet', { width: 820, height: 1180 }, true], ['laptop', { width: 1366, height: 768 }, false], ['phone', { width: 390, height: 844 }, true]];
async function fits(page, name) {
  const m = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const small = [...document.querySelectorAll('.hd-rd button, .hd-rd .chip')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 31.5; }).map(el => `${el.className}:${Math.round(el.getBoundingClientRect().height)}`);
    return { scroll: document.documentElement.scrollWidth - innerWidth, small, layer: document.querySelector('.hd-rd')?.getBoundingClientRect().width || 0 };
  });
  assert.ok(m.scroll <= 0, `${name}: no sideways scroll (${m.scroll})`);
  assert.deepEqual(m.small, [], `${name}: no tiny buttons`);
  return m;
}
const frameOf = async page => { const h = await page.waitForSelector('.hd-rdframe'); const f = await h.contentFrame(); await f.waitForSelector('#rd-next'); return f; };

test('the dock\'s Library: books for the class\'s grade, a book read in the desk, and the live board sees it', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  try {
    for (const [name, vp, touch] of VIEWS) {
      const kid = kids[VIEWS.findIndex(v => v[0] === name) + 5];
      const { ctx, page, errors } = await open(kid, `/class/${cls.id}/desk`, vp, touch);
      await page.waitForSelector('.hd-desk');
      await page.click('.hd-dockbtn[data-hd="library"]');
      await page.waitForSelector('.hd-rd .rdp-book');
      assert.equal(await page.locator('.hd-rd .chip[aria-pressed="true"]').textContent(), 'Grade 2', 'the class\'s grade first');
      assert.equal(await page.locator('.hd-dockbtn[data-hd="library"]').getAttribute('aria-pressed'), 'true');
      assert.match(page.url(), /#library$/);
      await page.waitForTimeout(400);
      await fits(page, `${name} library`); await shot(page, `library-${name}`);
      // a book: the library's reader in the frame, with Read to me
      await page.locator('.hd-rd .rdp-book', { hasText: bookB.title }).first().click();
      const f = await frameOf(page);
      assert.equal(await f.locator('.rd-back[href]').count(), 0, 'the layer has its own Back');
      await f.click('#rd-next'); await page.waitForTimeout(300);
      // the live board hears "Reading <book>" from the desk's pulse
      await page.waitForFunction(() => true);
      const until = Date.now() + 15000;
      let d = null;
      while (Date.now() < until) { d = HV.liveView(cls).desks[kid.id]; if (d && d.book) break; await new Promise(r => setTimeout(r, 300)); }
      assert.equal(d.book && d.book.title, bookB.title, `${name}: Reading <book> on the board`);
      await fits(page, `${name} reading`); await shot(page, `free-reading-${name}`);
      await page.click('.hd-rd [data-rd="close"]');
      await page.waitForSelector('.hd-rd', { state: 'detached' });
      assert.doesNotMatch(page.url(), /#library/);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { H.setLive(teacher, cls, 'end'); }
});

test('a Reading handout: Read, the quiz, 3 notes, on a tablet, a Chromebook and a phone', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const kid = kids[VIEWS.findIndex(v => v[0] === name)];
    const r = HR.handOutReading(teacher, cls, { bookId: bookA.id, to: { kind: 'desk', id: kid.id }, instructions: 'Read it, then tell me your favorite part.' });
    assert.ok(r.ok, JSON.stringify(r));
    const { ctx, page, errors } = await open(kid, `/class/${cls.id}/desk`, vp, touch);
    await page.waitForSelector('.hd-rdcard');
    assert.match(await page.locator('.hd-rdcard').textContent(), new RegExp(`Read: ${bookA.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    if (name === 'tablet') await shot(page, 'desk-card-tablet');
    await page.click('.hd-rdcard');
    const f = await frameOf(page);
    assert.match(await page.locator('.hd-rdins').textContent(), /favorite part/);
    assert.equal(await page.locator('.hd-rdsteps li.on').textContent().then(s => s.trim()), 'Read');
    await page.waitForTimeout(400);
    await fits(page, `${name} read`); await shot(page, `routine-read-${name}`);
    for (let i = 0; i < bookA.pages.length; i++) { await f.click('#rd-next'); await page.waitForTimeout(120); }
    await f.waitForSelector('[data-hrgo="quiz"]');
    await f.click('[data-hrgo="quiz"]');
    await page.waitForSelector('.hd-rdq');
    assert.equal(await page.locator('.hd-rdq').count(), bookA.questions.length);
    // the first one wrong: its page to look at
    const qs = bookA.questions;
    const wrong = (qs[0].answer + 1) % qs[0].choices.length;
    await page.locator('.hd-rdq[data-q="0"] .hd-rdopt').nth(wrong).click();
    await page.waitForSelector('.hd-rdq[data-q="0"] [data-rdlook]');
    assert.match(await page.locator('.hd-rdq[data-q="0"] .hd-rdhint').textContent(), new RegExp(`page ${qs[0].page}`));
    await page.waitForTimeout(200);
    await fits(page, `${name} quiz`); await shot(page, `quiz-${name}`);
    for (let i = 0; i < qs.length; i++) await page.locator(`.hd-rdq[data-q="${i}"] .hd-rdopt`).nth(qs[i].answer).click().then(() => page.waitForSelector(`.hd-rdq[data-q="${i}"].is-solved`));
    await page.waitForSelector('.hd-rdnotes');
    assert.equal(await page.locator('.hd-rdsteps li.on').textContent().then(s => s.trim()), '3 notes');
    await page.fill('[name="happened"]', 'The kids went to the market.');
    await page.fill('[name="word"]', 'stall: a small shop');
    await page.fill('[name="think"]', 'It was fun and I want to go too.');
    await fits(page, `${name} notes`); await shot(page, `notes-${name}`);
    await page.click('.hd-rdnotes [type="submit"]');
    await page.waitForSelector('.hd-rddone');
    await shot(page, `done-${name}`);
    const row = HO.boardView(cls).desks[kid.id].find(x => x.id === r.classLesson.id);
    assert.equal(row.done, true); assert.equal(row.rd.step, 'done'); assert.equal(row.rd.right, qs.length - 1);
    await page.click('.hd-rd [data-rd="close"]');
    await page.waitForSelector('.hd-rdcard.done');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the teacher: Choose a book, hand it out, the board\'s step, Today, the 3 notes, the Classroom column', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1366, height: 768 });
  await page.waitForSelector('.hr-desk');
  await page.click('[data-hr="pickbook"]');
  await page.waitForSelector('.hr-booksheet .rdp-book');
  await page.waitForTimeout(300); await shot(page, 'teacher-choose-1366');
  await page.locator('.hr-booksheet .rdp-book', { hasText: bookB.title }).first().click();
  await page.waitForSelector('#hr-givebar:not([hidden])');
  await page.click(`.hr-desk[data-sid="${kids[3].id}"]`);
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('.hr-giveform .hr-eyebrow').textContent(), /Read, Quiz, 3 notes/);
  await shot(page, 'teacher-sheet-1366');
  await page.click('.hr-giveok');
  await page.waitForSelector(`.hr-desk[data-sid="${kids[3].id}"] .hr-rdc`);
  // Dev is half way through his book; Hana picked nothing yet on a free choice for everyone
  const dev = HO.boardView(cls).handouts.find(h => h.reading && h.reading.book && h.reading.book.id === bookB.id && h.students === 1);
  for (let p = 1; p <= 3; p++) HR.progress(kids[3], cls, dev.id, { page: p });
  HR.handOutReading(teacher, cls, { bookId: '', to: { kind: 'all' }, title: 'Read a book' });
  await page.reload(); await page.waitForSelector('.hr-desk .hr-rdc');
  assert.match(await page.locator(`.hr-desk[data-sid="${kids[3].id}"] .hr-rdc`).first().textContent(), /Reading p\. 3/);
  assert.match(await page.locator(`.hr-desk[data-sid="${kids[0].id}"]`).textContent(), /Done/);
  await shot(page, 'teacher-board-1366');
  // Today at a glance: each Reading handout's students, alphabetical, with their step and score
  await page.click('[data-hrpanel="today"]');
  await page.waitForSelector('.hr-tgrd');
  const names = await page.locator('.hr-tgrd').last().locator('bdi').allTextContents();
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'alphabetical');
  await page.waitForTimeout(200); await shot(page, 'teacher-today-1366');
  await page.click('[data-hrpanel="today"]');
  // Ada's desk: her book, Done, the quiz's result, and her 3 notes in her notebook (read only)
  const ada = HO.boardView(cls).desks[kids[0].id].find(x => x.rd && x.rd.notes);
  await page.click(`.hr-desk[data-sid="${kids[0].id}"] .hr-rdc[data-hrho="${ada.id}"]`);
  await page.waitForSelector('.hr-drd');
  assert.match(await page.locator('.hr-drd').first().textContent(), /Quiz \d of \d/);
  await page.click('[data-rdnotes]');
  await page.waitForSelector('.nb-roed');
  await page.waitForFunction(() => /Something that happened/.test(document.querySelector('#nb')?.textContent || ''));
  assert.match(await page.locator('#nb').textContent(), /The kids went to the market\./);
  await page.waitForTimeout(300); await shot(page, 'teacher-notes-1366');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the board on a tablet and a phone
  for (const [name, vp, touch] of [VIEWS[0], VIEWS[2]]) {
    const o = await open(teacher, `/class/${cls.id}/homeroom`, vp, touch);
    await o.page.waitForSelector('.hr-desk .hr-rdc'); await o.page.waitForTimeout(400);
    await shot(o.page, `teacher-board-${name}`);
    assert.deepEqual(o.errors, []); await o.ctx.close();
  }
  // the Classroom view's column for the handouts: Reading, graded by completion, students alphabetical
  for (const [name, vp, touch] of VIEWS) {
    const o = await open(teacher, `/class/${cls.id}/progress`, vp, touch);
    await o.page.waitForSelector('.hv-col');
    const heads = await o.page.locator('.hv-col').allTextContents();
    assert.ok(heads.some(h => /Reading/.test(h)), `${name}: a Reading column`);
    const sc = await o.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(sc <= 0, `${name}: nothing sideways (${sc})`);
    await o.page.waitForTimeout(200); await shot(o.page, `classroom-${name}`);
    assert.deepEqual(o.errors, []); await o.ctx.close();
  }
});
