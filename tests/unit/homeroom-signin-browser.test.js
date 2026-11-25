// Homeroom step 1c in a real browser: the whole shared-device flow at tablet size. The teacher opens Students sign in
// (QR code and code) from the ⋯ menu and on the projector; on a tablet a student types the code, taps their name, taps
// their three pictures (grade 1: picture passwords), lands on their desk with "Not you? Switch", switches back to the
// names with the code kept, and the next student types their password; End class sends the tablet back to the sign-in
// page. Also the teacher's Sign-in panel and the printed cards, no sideways scroll at tablet and phone widths, and big tap
// targets. HR_SHOTS=<dir> also saves screenshots there (hr1c-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const SI = await import('../../server/services/homeroom-signin.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr1c-${name}.png`, ...opts }) : null);

const boss = createUser({ username: 'HrsbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Sign-in Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 1 · Bees', grade: '1', teacherId: teacher.id }).class;
const NAMES = [['Ada Lovell', 'Ada'], ['Ben Ortiz', 'Ben'], ['Cleo Ruiz', 'Cleo'], ['Dev Shah', 'Dev'], ['Eli Ng', 'Eli'], ['Fay Wu', 'Fay'], ['Gus Park', 'Gus'], ['Hana Ito', 'Hana'], ['Ivo Kerr', 'Ivo'], ['Jade Moss', 'Jade'], ['Kai Bell', 'Kai'], ['Lia Fox', 'Lia']];
const PW = {};
const kids = NAMES.map(([roster, display]) => {
  const r = S.createSchoolAccount(boss, oak.id, { rosterName: roster }); S.addToClass(boss, cls.id, r.user.id);
  q.run('UPDATE users SET display_name=? WHERE id=?', display, r.user.id); PW[r.user.id] = r.password; return getUser(r.user.id);
});
const ada = kids[0], ben = kids[1];
// Ada keeps the class's picture passwords (grade 1); Ben types his password.
const adaPics = SI.setMode(teacher, cls, ada.id, 'picture').pics;
SI.setMode(teacher, cls, ben.id, 'password');
for (const k of kids.slice(2, 6)) SI.setMode(teacher, cls, k.id, 'picture');
H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Good morning! Sign in and find your desk.', x: 0.04, y: 0.12, by: 't' }], texts: [], strokes: [] }, shapes: [] });
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
  if (who) { const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]); }
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const TABLET = { width: 820, height: 1180 }, TABLET_WIDE = { width: 1180, height: 820 }, PHONE = { width: 390, height: 844 };
const noSideways = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${what}: no sideways scroll`);
const smallTargets = (page, sel, min) => page.evaluate(([s, m]) => [...document.querySelectorAll(s)].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.height < m || r.width < m); }).map(el => `${el.className}:${Math.round(el.getBoundingClientRect().height)}`), [sel, min]);

test('the teacher: Students sign in from the ⋯ menu, the Sign-in panel, the cards, the projector', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1366, height: 768 });
  await T.page.waitForSelector('.hr-desk');
  await T.page.click('[data-hr="menu"]'); await T.page.click('[data-hr="signin"]');
  await T.page.waitForSelector('.sheet .hs-closed');
  await T.page.click('.sheet [data-hssign="open"]');
  await T.page.waitForSelector('.sheet .hs-qr svg');
  const code = SI.signinOf(cls.id).code;
  assert.equal((await T.page.textContent('.sheet .hs-code')).replace(/\s/g, ''), code);
  await shot(T.page, 'teacher-sheet');
  await T.page.keyboard.press('Escape');
  // The Sign-in panel: the box, every student, Password / Picture password.
  await T.page.goto(`${BASE}/class/${cls.id}/homeroom/signin`);
  await T.page.waitForSelector('#hs-code .hs-qr svg');
  assert.equal(await T.page.locator('.hs-row').count(), kids.length);
  assert.equal(await T.page.locator('#hs-early').count(), 1, 'grade 1: picture passwords to start');
  await shot(T.page, 'teacher-panel', { fullPage: true });
  for (const vp of [TABLET, PHONE]) { await T.page.setViewportSize(vp); await T.page.waitForTimeout(150); await noSideways(T.page, `panel ${vp.width}`); }
  await shot(T.page, 'teacher-panel-phone', { fullPage: true });
  await T.page.setViewportSize({ width: 1366, height: 768 });
  // One student's new picture password -> its card.
  await T.page.locator(`.hs-row[data-sid="${kids[2].id}"] form[data-api$="/picture"] button`).click();
  await T.page.click('dialog.ob-dialog [data-ob="ok"]');
  await T.page.waitForURL(/\/signin\/cards\//);
  assert.equal(await T.page.locator('.hs-card').count(), 1);
  // The whole class's cards, printed.
  await T.page.goto(`${BASE}/class/${cls.id}/homeroom/signin`);
  await T.page.locator('form[data-api$="/signin/cards"] button').click();
  await T.page.click('dialog.ob-dialog [data-ob="ok"]');
  await T.page.waitForURL(/\/signin\/cards\//);
  assert.equal(await T.page.locator('.hs-card').count(), kids.length);
  assert.ok(await T.page.locator('.hs-card', { hasText: 'Ben Ortiz' }).locator('.hs-carduses').count(), 'Ben: uses his password');
  await T.page.emulateMedia({ media: 'print' });
  await shot(T.page, 'cards-print', { fullPage: true });
  await T.page.emulateMedia({ media: 'screen' });
  // The cards made new pictures: give Ada a known one again for the student test.
  Object.assign(adaPics, SI.newPicture(teacher, cls, ada.id).pics);
  // The projector: the code and QR beside the teacher's area.
  const P = await open(teacher, `/class/${cls.id}/homeroom/projector`, { width: 1280, height: 720 });
  await P.page.waitForSelector('#hr-projsign:not([hidden]) svg');
  assert.equal((await P.page.textContent('#hr-projcode')).replace(/\s/g, ''), code);
  await P.page.waitForTimeout(300);
  await shot(P.page, 'projector');
  assert.deepEqual([...T.errors, ...P.errors], []);
  await P.ctx.close(); await T.ctx.close();
});

test('a shared tablet: code, name, pictures, the desk, Not you? Switch, the next student\'s password, End class', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  if (!SI.signinOf(cls.id).open) SI.openSignin(teacher, cls);
  const code = SI.signinOf(cls.id).code;
  const D = await open(null, '/hr', TABLET, true);
  await D.page.waitForSelector('#hs-codein');
  await noSideways(D.page, 'code');
  await shot(D.page, 'code-entry');
  // A wrong code first.
  await D.page.fill('#hs-codein', 'ZZZ ZZZ'); await D.page.click('#hs-codeform button[type="submit"]');
  await D.page.waitForSelector('#hs-codeerr:has-text("doesn\'t work")');
  await D.page.fill('#hs-codein', `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`); await D.page.click('#hs-codeform button[type="submit"]');
  await D.page.waitForSelector('.hs-name');
  assert.equal(await D.page.locator('.hs-name').count(), kids.length);
  assert.equal(await D.page.locator('.hs-name', { hasText: 'Ada Lovell' }).count(), 0, 'display names only');
  assert.deepEqual(await smallTargets(D.page, '.hs-name, .hs-back', 56), [], 'big name buttons');
  await noSideways(D.page, 'names');
  assert.match(D.page.url(), new RegExp(`#${code}$`), 'the code is kept in the address');
  await shot(D.page, 'name-grid');
  // Ada: her three pictures (one wrong try first).
  await D.page.click('.hs-name:has-text("Ada")');
  await D.page.waitForSelector('.hs-pic');
  assert.equal(await D.page.locator('.hs-pic').count(), 9);
  assert.deepEqual(await smallTargets(D.page, '.hs-pic', 88), [], 'big pictures');
  const wrong = adaPics.slice().reverse();
  for (const k of (wrong.join() === adaPics.join() ? ['bear', 'bear', 'bear'] : wrong)) await D.page.click(`.hs-pic[data-pic="${k}"]`);
  await D.page.waitForSelector('#hs-picerr:has-text("aren\'t your pictures")');
  await D.page.click(`.hs-pic[data-pic="${adaPics[0]}"]`);
  await shot(D.page, 'picture-password');
  await noSideways(D.page, 'pictures');
  for (const k of adaPics.slice(1)) await D.page.click(`.hs-pic[data-pic="${k}"]`);
  await D.page.waitForURL(new RegExp(`/class/${cls.id}/desk$`));
  await D.page.waitForSelector('.hd-desk');
  assert.equal(await D.page.locator('.hd-deskh', { hasText: 'Ada' }).count(), 1);
  assert.equal(await D.page.locator('[data-hd="switch"]').count(), 1, 'Not you? Switch');
  await noSideways(D.page, 'desk tablet');
  await shot(D.page, 'desk-tablet');
  await D.page.setViewportSize(TABLET_WIDE); await D.page.waitForTimeout(200); await noSideways(D.page, 'desk tablet wide');
  await shot(D.page, 'desk-tablet-wide');
  await D.page.setViewportSize(PHONE); await D.page.waitForTimeout(200); await noSideways(D.page, 'desk phone');
  assert.ok(await D.page.locator('[data-hd="switch"]').isVisible(), 'Switch on a phone too');
  await shot(D.page, 'desk-phone');
  await D.page.setViewportSize(TABLET);
  // Not you? Switch: back to the names, the code kept.
  await D.page.click('[data-hd="switch"]');
  await D.page.waitForSelector('.hs-name');
  assert.match(D.page.url(), new RegExp(`/hr#${code}$`));
  // Ben: his password.
  await D.page.click('.hs-name:has-text("Ben")');
  await D.page.waitForSelector('#hs-pw');
  await D.page.fill('#hs-pw', 'not-my-password');
  await D.page.click('#hs-pwform button[type="submit"]');
  await D.page.waitForSelector('#hs-pwerr:has-text("not the right password")');
  await D.page.fill('#hs-pw', PW[ben.id]);
  await shot(D.page, 'typed-password');
  await noSideways(D.page, 'password');
  await D.page.click('#hs-pwform button[type="submit"]');
  await D.page.waitForURL(new RegExp(`/class/${cls.id}/desk$`));
  await D.page.waitForSelector('.hd-desk');
  assert.equal(await D.page.locator('.hd-deskh', { hasText: 'Ben' }).count(), 1);
  // End class: the tablet goes back to the sign-in page.
  H.setLive(teacher, cls, 'start'); H.setLive(teacher, cls, 'end');
  await D.page.waitForURL(/\/hr\?ended=1/, { timeout: 12000 });
  await D.page.waitForSelector('.hs-ended');
  await D.page.waitForSelector('#hs-codein');
  // Phone: the code step and the names fit.
  SI.openSignin(teacher, cls);
  await D.page.setViewportSize(PHONE);
  await D.page.goto(`${BASE}/hr#${SI.signinOf(cls.id).code}`);
  await D.page.waitForSelector('.hs-name'); await noSideways(D.page, 'names phone');
  await shot(D.page, 'name-grid-phone');
  await D.page.click('.hs-name:has-text("Cleo")'); await D.page.waitForSelector('.hs-pic'); await noSideways(D.page, 'pictures phone');
  await shot(D.page, 'picture-password-phone');
  assert.deepEqual(D.errors, []);
  await D.ctx.close();
});
