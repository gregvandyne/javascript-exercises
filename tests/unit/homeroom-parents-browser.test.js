// Homeroom step 4d, the parents' view in a real browser (routes/homeroom-parents.js; docs/decisions.md "Homeroom: the
// parents' view") on a phone (390), a tablet (820) and a laptop (1366 x 768): the linked grown-up's page (handouts with
// the teacher's words, a comment and a sticker, the grade as chosen, missed while away, the books and the quiz, the class
// notes with a K-2 drawing; nothing sideways, the class chips and jump links big enough to tap), the /family row's link
// to it, the student's notebook saying a grown-up sees the class tabs, and the teacher's ⋯ menu switch turning it off.
// HR_SHOTS=<dir> also saves screenshots there. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HR = await import('../../server/services/homeroom-reading.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const NB = await import('../../server/services/notebook.js');
const P = await import('../../server/services/progress.js');
const L = await import('../../server/services/lessons.js');
const LIB = await import('../../server/services/library.js');
const F = await import('../../server/services/family.js');
const PV = await import('../../server/services/homeroom-parents.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name, full = false) => (SHOTS ? page.screenshot({ path: `${SHOTS}/pv-${name}.png`, fullPage: full }) : null);

const boss = createUser({ username: 'PvbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Parents Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: teacher.id, grade: '4' }).class;
const art = S.createClass(boss, oak.id, { name: 'Art and Stories', teacherId: teacher.id, grade: '4' }).class;
const mia = createUser({ username: 'MiaPvb', password: 'kidpass123', displayName: 'Mia' });
S.addMember(boss, oak.id, mia.id, 'student', { rosterName: 'Mia Lane' });
for (const c of [cls, art]) S.addToClass(boss, c.id, mia.id);
for (const n of ['Ben Hill', 'Cleo Park']) { const u = S.createSchoolAccount(boss, oak.id, { rosterName: n }).user; S.addToClass(boss, cls.id, u.id); }
const mom = createUser({ username: 'PvbMom', password: 'grownpass12345', accountType: 'grownup' });
{ const c = F.createCode(getUser(mia.id)); F.redeem(mom, c.code); F.answer(getUser(mia.id), 'yes'); }
const token = F.requestToken(F.familyOfOwner(mom.id).id, mia.id);

const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?", v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-pvb', '🍕'), bees = made('Counting Bees', 'counting-bees-pvb', '🐝'), words = made('Word Hunt', 'word-hunt-pvb', '🔤');
const doneAll = (u, clId) => { for (const s of L.steps(L.getClassLesson(clId).lesson_id)) P.markDone(u, clId, s.id); };
const due = new Date(now() + 4 * 86400e3).toISOString().slice(0, 10);
const kid = () => getUser(mia.id);
{
  const h1 = HO.handOut(teacher, cls, { gameId: pizza.id, to: { kind: 'all' }, instructions: 'Make three pizzas cut in halves, then in quarters.', dueAt: due });
  doneAll(kid(), h1.classLesson.id);
  HO.setFeedback(teacher, cls, h1.classLesson.id, mia.id, { comment: 'Lovely halves! You checked every slice.', sticker: 'rocket' });
  const book = LIB.books().find(b => b.pages.length >= 4 && b.questions && b.questions.length >= 3);
  const rd = HR.handOutReading(teacher, cls, { bookId: book.id, to: { kind: 'all' }, order: 'any', grade: 'score', instructions: 'Read it twice if you like.' });
  const t = now();
  q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, quiz_src, marks, solved, quiz_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rd.classLesson.id, cls.id, mia.id, book.id, book.pages.length, book.pages.length, t, 'library', '101', '111', t, t, t);
  HR.saveNotes(kid(), cls, rd.classLesson.id, { happened: 'The fox found its way home.', word: 'burrow', think: 'I liked the ending.' }, { happened: 'Something that happened', word: 'A new word', think: 'What I think' });
  const w = HO.handOut(teacher, cls, { gameId: words.id, to: { kind: 'all' }, instructions: 'Find five words with a long a.', grade: 'completion' });
  q.run('UPDATE homeroom_handouts SET created_at=created_at-3*86400000 WHERE class_lesson_id=?', w.classLesson.id);   // given before she was away
  AT.mark(teacher, cls, mia.id, 'absent');
  HO.handOut(teacher, cls, { gameId: bees.id, to: { kind: 'all' }, instructions: 'Count the bees to 20.', grade: 'none' });
  const b = NB.mine(kid()), tab = b.tabs.find(x => x.kind === 'class' && x.classId === cls.id);
  NB.savePage(kid(), tab.pages[0].id, '<p>Fractions are <mark class="hl-g">equal parts</mark> of a whole.</p><ul class="nb-check"><li class="done">Halves</li><li>Thirds</li></ul>',
    [{ c: '#1E88E5', pts: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.3 }] }, { c: '#FF6B4A', pts: [{ x: 0.3, y: 0.7 }, { x: 0.5, y: 0.8 }, { x: 0.7, y: 0.7 }] }]);
  NB.savePage(kid(), b.tabs.find(x => x.kind === 'own').pages[0].id, '<p>My own secret page</p>');
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

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
const VIEWS = [['390', { width: 390, height: 844 }, true], ['820', { width: 820, height: 1180 }, true], ['1366', { width: 1366, height: 768 }, false]];

test('the parents\' view on a phone, a tablet and a laptop; the /family row links to it', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(mom, `/family/class/${token}?class=${cls.id}`, vp, touch);
    await page.waitForSelector('.pv-card');
    const m = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const small = [...document.querySelectorAll('.pv-chip, .pv-jump a')].filter(vis).filter(el => el.getBoundingClientRect().height < 43.5).map(el => el.textContent.trim());
      const stickers = [...document.querySelectorAll('.pv-sticker')].map(i => i.complete && i.naturalWidth > 0);
      const outside = [...document.querySelectorAll('.pv-card, .pv-page, .pv-book')].filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length;
      return { scroll: document.documentElement.scrollWidth - innerWidth, small, stickers, outside, cards: document.querySelectorAll('.pv-card').length, chips: document.querySelectorAll('.pv-chip').length,
        missed: document.querySelectorAll('#pv-catch .pv-card').length, pics: document.querySelectorAll('.pv-pic polyline').length, text: document.querySelector('.pv').innerText };
    });
    assert.ok(m.scroll <= 0, `${name}: nothing sideways (${m.scroll})`);
    assert.deepEqual(m.small, [], `${name}: chips and jump links at least 44px`);
    assert.equal(m.outside, 0, `${name}: every card inside the screen`);
    assert.deepEqual(m.stickers, [true], `${name}: the sticker loads`);
    assert.equal(m.cards, 4); assert.equal(m.chips, 2); assert.equal(m.missed, 1); assert.equal(m.pics, 2, 'the drawing');
    for (const want of ['Lovely halves!', 'Make three pizzas', 'Missed while away', 'Quiz: 2 of 3 right on the first try', '67% right', 'equal parts', 'The fox found its way home.']) assert.ok(m.text.includes(want), `${name}: ${want}`);
    for (const never of ['My own secret page', 'Ben Hill', 'Cleo Park', 'Absent']) assert.ok(!m.text.includes(never), `${name}: never ${never}`);
    await shot(page, `view-${name}`);
    await shot(page, `view-${name}-full`, true);
    // the reading and the class notes, scrolled to
    await page.click('.pv-jump a[href="#pv-reading"]'); await page.waitForTimeout(150);
    await shot(page, `reading-${name}`);
    await page.click('.pv-jump a[href="#pv-notes"]'); await page.waitForTimeout(150);
    await shot(page, `notes-${name}`);
    // the other class: its own chip
    await page.click('.pv-chip:not(.on)');
    await page.waitForSelector('.pv-chip.on:has-text("Art and Stories")');
    assert.match(await page.textContent('.pv'), /No handouts yet/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  const { ctx, page } = await open(mom, '/family', { width: 390, height: 844 }, true);
  const a = page.locator(`a[href="/family/class/${token}"]`);
  assert.equal(await a.count(), 1);
  await a.scrollIntoViewIfNeeded(); await shot(page, 'family-390');
  await a.click(); await page.waitForSelector('.pv-card');
  await ctx.close();
});

test('the student\'s notebook says a grown-up sees the class tabs', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(kid(), `/class/${cls.id}`, vp, touch);
    await page.waitForSelector('#nb-btn'); await page.click('#nb-btn');
    await page.waitForSelector('#nb .nb-lead');
    const lead = await page.textContent('#nb .nb-lead');
    assert.match(lead, /Your teacher can read your notebook\. Your grown-up can see the notes in your class tabs\./);
    await shot(page, `notebook-${name}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the teacher turns the parents\' view off from the ⋯ menu', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/hub`, vp, touch);
    await page.waitForSelector('[data-hr="menu"]');
    await page.click('[data-hr="menu"]');
    await page.waitForSelector('[data-hr="parents"]');
    assert.match(await page.textContent('[data-hr="parents"]'), /Parents' view\s*On/);
    await shot(page, `menu-${name}`);
    await page.click('[data-hr="parents"]');
    await page.waitForSelector('.hr-parbox');
    assert.equal(await page.getAttribute('[data-parents="1"]', 'aria-checked'), 'true');
    await page.click('[data-parents="0"]');
    await page.waitForSelector('[data-parents="0"][aria-checked="true"]');
    assert.equal(PV.parentsOn(cls), false);
    await shot(page, `switch-${name}`);
    await page.click('[data-parents="1"]');
    await page.waitForSelector('[data-parents="1"][aria-checked="true"]');
    assert.equal(PV.parentsOn(cls), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
