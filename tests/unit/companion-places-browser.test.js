// Ask Oomba in a real browser, after the owner's live audit of 27 Nov 2026 (docs/decisions.md "Oomba makes it, then
// reports what it checked"): the bubble in the live host room (/live/host/<id>), clear of the room's controls and the
// join code, and hidden in full screen; on the class Lessons tab; never on Studio (its own "Chat with the Builder").
// A two-word message ("Assign it") sends with the Send button (never greyed out, no "Write a few words" warning). A
// board Oomba made shows its card, and the card's Open button opens that exact board. Laptop and a 390 px phone,
// light and dark. The AI is a stand-in (services/companion.js hooks.create). COMPANION_SHOTS=<dir> saves pictures.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.liveClassroom = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const LS = await import('../../server/services/classlive-sessions.js');
const games = await import('../../server/services/games.js');
const M = await import('../../server/services/manipulatives.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.COMPANION_SHOTS || '';

const boss = createUser({ username: 'CplBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Places Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Reyes', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
config.manipulativesUsers = [teacher.username.toLowerCase()];
const cls = S.createClass(boss, oak.id, { name: '4b math', grade: '4', teacherId: teacher.id }).class;
for (const n of ['Ada', 'Ben']) { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); }
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
{
  const g = games.createGame(official.id, { title: 'Would You Rather Live' });
  const v = games.addVersion(g.id, fs.readFileSync('seed-games/would-you-rather-live.html', 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?`, v.id, 'would-you-rather-live', '🤔', g.id);
}
const own = games.createGame(teacher.id, { title: 'My Studio Game' });
games.addVersion(own.id, '<!doctype html><title>x</title><p>hi</p>', { createdBy: teacher.id, safetyStatus: 'pass' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };
let sid = '';

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const r = LS.createSession(teacher, { mode: 'wyr', audience: 'class', classId: cls.id });
  assert.ok(r.ok !== false, `live game: ${r.code}`);
  sid = r.session ? r.session.id : r.id || r.sid;
});
test.after(async () => { CO.hooks.create = null; for (const s of LS.openSessions()) LS.endSession(s.id); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function pageFor(viewport, scheme = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  await ctx.addCookies([{ name: cookieOf(teacher.id).split('=')[0], value: cookieOf(teacher.id).split('=').slice(1).join('='), url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };
const box = async (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, shown: !!(r.width && r.height) && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' }; }, sel);
const overlaps = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('the live host room has the bubble, clear of the controls and the join code; hidden in full screen', { skip }, async () => {
  for (const [vp, tag] of [[{ width: 1366, height: 768 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page, errors } = await pageFor(vp, scheme);
      await page.goto(`${BASE}/live/host/${sid}`);
      await page.waitForSelector('#oc-bubble', { state: 'visible', timeout: 15000 });
      const b = await box(page, '#oc-bubble');
      assert.ok(b.shown, 'the bubble shows');
      // Every control button and the join box: never under the bubble (scrolled to each in turn on a phone).
      const targets = await page.evaluate(() => [...document.querySelectorAll('#lv-controls button, #lv-joinbox, #lv-code, .lv-bar a')].map((el, i) => { el.setAttribute('data-ck', String(i)); return i; }));
      for (const i of targets) {
        await page.evaluate(k => { const el = document.querySelector(`[data-ck="${k}"]`); el.scrollIntoView({ block: 'center' }); }, i);
        const t = await box(page, `[data-ck="${i}"]`); const bb = await box(page, '#oc-bubble');
        if (!t || !t.shown) continue;
        assert.ok(!overlaps(bb, t), `${tag}: the bubble covers a control or the join code (${i})`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `live-host-${tag}-${scheme}`);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(sideways, false, 'no sideways scroll');
      if (tag === 'desktop' && scheme === 'light') {
        // Full screen (the room's projector view): the bubble hides.
        const full = await page.evaluate(async () => { try { await document.documentElement.requestFullscreen(); return true; } catch { return false; } });
        if (full) { await page.waitForFunction(() => document.body.classList.contains('oc-hide')); assert.equal((await box(page, '#oc-bubble')).shown, false, 'hidden in full screen'); await page.evaluate(() => document.exitFullscreen()); }
        else { await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange'))); }
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test('the class Lessons tab has the bubble; Studio has none (its own Chat with the Builder)', { skip }, async () => {
  const { ctx, page, errors } = await pageFor({ width: 1280, height: 800 });
  await page.goto(`${BASE}/class/${cls.id}?view=assigned`);
  await page.waitForSelector('#oc-bubble', { state: 'visible', timeout: 15000 });
  await shot(page, 'class-lessons-tab-desktop-light');
  const r = await page.goto(`${BASE}/studio/${own.id}`);
  if (r.status() === 200) {
    await page.waitForLoadState('load');
    assert.equal(await page.$('#oc-bubble'), null, 'no Oomba bubble on Studio');
    assert.equal(await page.$('#oc-root'), null);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('"Assign it" sends with the Send button (never greyed out, no false warning); a made board opens from its card', { skip }, async () => {
  for (const [vp, tag] of [[{ width: 1366, height: 860 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
    for (const scheme of ['light', 'dark']) {
      CO.reset(teacher);
      const { ctx, page, errors } = await pageFor(vp, scheme);
      await page.goto(`${BASE}/teach`);
      await page.click('#oc-bubble');
      await page.waitForSelector('#oc-in', { state: 'visible' });
      await page.fill('#oc-in', 'Assign it');
      assert.equal(await page.$eval('#oc-send', b => b.disabled), false, 'Send is never greyed out');
      await page.click('#oc-send');
      await page.waitForFunction(() => /Which lesson should I assign/.test(document.querySelector('#oc-log').textContent), null, { timeout: 15000 });
      assert.equal(await page.$eval('#oc-err', e => e.hidden || !e.textContent.trim()), true, 'no "Write a few words" warning');
      // A board Oomba makes: the card, then Open the board opens that exact board.
      CO.hooks.create = async p => {
        const last = p.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
        if (after) return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'I made a base-ten blocks board showing 245.' }] };
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_board', name: 'makeBoard', input: { tool: 'base-ten-blocks', title: 'Showing 245', steps: ['Count the hundreds, tens and ones.'], items: [{ value: 245, box: 'none' }] } }] };
      };
      await page.fill('#oc-in', 'Set up a base-ten blocks board showing 245');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-oc-made]', { timeout: 20000 });
      await shot(page, `made-board-card-${tag}-${scheme}`);
      const href = await page.$eval('[data-oc-made]', a => a.getAttribute('href'));
      const id = href.split('/').pop();
      assert.ok(M.ownBoard(teacher, id), 'the board is saved');
      assert.equal(href, `/manipulatives#board/${id}`);
      if (tag === 'desktop' && scheme === 'light') {
        await page.click('[data-oc-made]');
        await page.waitForURL(u => u.pathname === '/manipulatives' && u.hash === `#board/${id}`);
        await page.waitForFunction(() => /Showing 245/.test(document.body.textContent), null, { timeout: 15000 });
        await shot(page, 'made-board-opened-desktop-light');
      }
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(sideways, false);
      assert.deepEqual(errors, []);
      CO.hooks.create = null;
      await C.allSettled();
      await ctx.close();
    }
  }
});

test('a plotting worksheet: the limit asked first on a card, then the worksheet made and opened from its card', { skip }, async () => {
  const F = await import('../../server/services/figures.js');
  for (const [vp, tag] of [[{ width: 1366, height: 860 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
    for (const scheme of ['light', 'dark']) {
      CO.reset(teacher);
      const plot = at => ({ plot: { from: 0, to: 10, step: 1, at, label: 'P' }, question: `Plot point P at ${at} on the number line.` });
      CO.hooks.create = async p => {
        const last = p.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
        const words = JSON.stringify(p.messages);
        if (after) return { stop_reason: 'end_turn', content: [{ type: 'text', text: /Printable/.test(words) ? 'I made 5 plotting questions on 0 to 10 lines. Students draw each point; the answer key shows it.' : 'Figures cannot check a plotted point online. Pick one on the card.' }] };
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_ws', name: 'makeWorksheet', input: { title: 'Plot on a Number Line 0 to 10', grade: '4', items: [2, 5, 7, 9, 4].map(plot) } }] };
      };
      const { ctx, page, errors } = await pageFor(vp, scheme);
      await page.goto(`${BASE}/teach`);
      await page.click('#oc-bubble');
      await page.fill('#oc-in', 'Build a grade 4 worksheet with a number line from 0 to 10, 5 questions asking students to plot numbers.');
      await page.click('#oc-send');
      await page.waitForFunction(() => /can't check a point students plot online/.test(document.querySelector('#oc-log').textContent), null, { timeout: 20000 });
      await shot(page, `plot-ask-${tag}-${scheme}`);
      await page.click('text=Printable: students draw each point');
      await page.waitForSelector('[data-oc-made]', { timeout: 20000 });
      await shot(page, `plot-made-${tag}-${scheme}`);
      const href = await page.$eval('[data-oc-made]', a => a.getAttribute('href'));
      const id = href.split('/').pop();
      assert.equal(F.itemsOf(id).length, 5);
      if (tag === 'desktop' && scheme === 'light') {
        await page.click('[data-oc-made]');
        await page.waitForURL(u => u.pathname === `/figures/worksheets/${id}`);
        await page.waitForSelector('.fg-item', { timeout: 15000 });
        await shot(page, 'plot-worksheet-opened-desktop-light');
      }
      assert.deepEqual(errors, []);
      CO.hooks.create = null;
      await C.allSettled();
      await ctx.close();
    }
  }
});
