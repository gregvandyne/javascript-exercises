// Arithmetic Lab and the class Progress page, the owner's fifth audit (docs/decisions.md "Arithmetic Lab and class
// Progress: audit 5"), in Chromium:
//   - every way out of a set under way asks first ("Leave this set?", the game's own dialog): in the production frame
//     (tests/unit/_box-frame.js) the game answers the page's question (BRB.leaveGuard: brb:leave-ask, both players, never
//     in a preview or before the set starts); on the real play page, its Back link ("Back to Arithmetic Lab", the cause:
//     it left with no word), the full screen Back, the browser's Back and closing the tab; in Homeroom's layer, its bar,
//     Escape (on the layer and on the game's page) and Back. Keep going stays; Leave the set goes. Before a set starts
//     (and after it ends) nothing asks.
//   - 8.12: a class with nothing assigned, or no students, shows a faded, labelled sample row ("Sample student"), in its
//     own table (never the gradebook's, never counted, never in the CSV), light and dark, 390 and 1280 wide.
// Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, closeBrowser, skip as frameSkip } from './_box-frame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { importGame } = await import('../../scripts/import-game.js');
const gameSets = await import('../../server/services/game-sets.js');
const L = await import('../../server/services/lessons.js');

let pw = null; try { pw = await import('playwright'); } catch { pw = null; }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.ARITH_SHOTS || '';

const boss = createUser({ username: 'AudFiveBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Audit Five School' }).school;
const teacher = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
const kid = S.createSchoolAccount(boss, school.id, { rosterName: 'Kim Pupil' }).user;
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const LAB = importGame(path.join(ROOT, 'seed-games/arithmetic-lab.html'), path.join(ROOT, 'seed-games/arithmetic-lab.json'), official.id);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await closeBrowser(); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, viewport = { width: 1280, height: 800 }, o = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}), ...o });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { ctx, page, errors };
}

// ---- in the production frame: the game answers the page ----

/** Ask the game, as the play page does (brb:leave-ask), and collect what it says back. */
const askGame = (g, id) => g.page.evaluate((n) => { document.querySelector('iframe').contentWindow.postMessage({ brb: 1, type: 'brb:leave-ask', id: n }, '*'); }, id);
const answers = async (g, id) => (await g.msgs()).filter(m => (m.type === 'brb:leave-asking' || m.type === 'brb:leave-answer') && m.id === id).map(m => (m.type === 'brb:leave-asking' ? 'asking' : m.ok));
const guards = async g => (await g.msgs('brb:guard')).map(m => m.on);

test('the game asks "Leave this set?" when the page asks, once a set is under way, both players (BRB.leaveGuard)', { skip: frameSkip, timeout: 120e3 }, async () => {
  for (const set of [{ k: 'divide', p: [[84, 4], [96, 3]], l: 'guided' }, { k: 'divide', p: [[467, 5], [92, 4]], l: 'watch', m: 'ladder' }]) {
    const g = await openGame({ phone: false, set });
    // not started: no guard, and a question is answered yes at once
    await askGame(g, 1);
    await g.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:leave-answer'));
    assert.deepEqual(await answers(g, 1), [true]);
    assert.deepEqual(await guards(g), []);
    await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
    await g.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:guard'));
    assert.deepEqual(await guards(g), [true], `${set.m || 'standard'}: the guard is on once the set starts`);
    // Keep going: no
    await askGame(g, 2);
    const dlg = g.frame.locator('dialog.confirm[open]');
    await dlg.waitFor();
    assert.equal(await dlg.getByRole('heading').innerText(), 'Leave this set?');
    assert.match(await dlg.innerText(), /You’ve done 0 of 2 problems/);
    await dlg.getByRole('button', { name: 'Keep going' }).click();
    await g.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:leave-answer' && m.id === 2));
    assert.deepEqual(await answers(g, 2), ['asking', false]);
    // Escape in the dialog: no as well
    await askGame(g, 3);
    await dlg.waitFor();
    await g.page.keyboard.press('Escape');
    await g.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:leave-answer' && m.id === 3));
    assert.deepEqual(await answers(g, 3), ['asking', false]);
    // Leave the set: yes
    await askGame(g, 4);
    await dlg.waitFor();
    await dlg.getByRole('button', { name: 'Leave the set' }).click();
    await g.page.waitForFunction(() => window.__msgs.some(m => m.type === 'brb:leave-answer' && m.id === 4));
    assert.deepEqual(await answers(g, 4), ['asking', true]);
    assert.deepEqual(g.errors, []);
    await g.ctx.close();
  }
});

test('practice: the guard is on during the set, off back on the start screen; a preview never guards', { skip: frameSkip, timeout: 120e3 }, async () => {
  const g = await openGame({ phone: false });
  await g.frame.getByRole('button', { name: /I’m a student/ }).click();
  await g.frame.getByRole('button', { name: 'Start practicing ▸' }).click();
  await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
  await g.frame.getByRole('button', { name: '← Practice' }).click();
  await g.frame.locator('dialog.confirm[open]').getByRole('button', { name: 'Leave the set' }).click();
  await g.frame.getByRole('heading', { name: 'Practice on your own' }).waitFor();
  await g.page.waitForFunction(() => window.__msgs.filter(m => m.type === 'brb:guard').length === 2);
  assert.deepEqual(await guards(g), [true, false]);
  await g.ctx.close();
  // a teacher's Try it
  const t = await openGame({ phone: false, canAssign: true });
  await t.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await t.frame.getByRole('button', { name: 'New activity' }).click();
  await t.frame.getByRole('menuitem', { name: /Long division/ }).click();
  await t.frame.getByRole('radio', { name: 'On my own', exact: true }).click();
  await t.frame.getByRole('button', { name: /Try it/ }).click();
  await t.frame.getByRole('button', { name: 'Start', exact: true }).click();
  await t.page.waitForTimeout(400);
  assert.deepEqual(await guards(t), [], 'a preview never asks the page to wait');
  assert.deepEqual([...g.errors, ...t.errors], []);
  await t.ctx.close();
});

// ---- on the real play page ----

async function startSet(page) {
  const f = page.frameLocator('#gameframe');
  await f.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForFunction(() => window.oombaGuarded && window.oombaGuarded());
  return f;
}
const setUrl = () => { const id = gameSets.save(LAB.id, teacher.id, [{ k: 'divide', p: [[84, 4], [96, 3]], l: 'guided' }], null, 'arithmetic-lab', { title: 'Two problems' }).id; return `/play/arithmetic-lab?chapter=${id}`; };

test('the play page: "Back to Arithmetic Lab" mid-set asks first (the audit\'s path); Keep going stays, Leave the set goes', { skip, timeout: 120e3 }, async () => {
  const { ctx, page, errors } = await open(kid);
  const url = setUrl();
  // before the set starts: Back goes at once
  await page.goto(BASE + url);
  await page.frameLocator('#gameframe').getByRole('button', { name: 'Start', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Back to Arithmetic Lab' }).click();
  await page.waitForURL(`${BASE}/g/arithmetic-lab`);
  // under way: it asks
  await page.goto(BASE + url);
  const f = await startSet(page);
  await page.getByRole('link', { name: 'Back to Arithmetic Lab' }).click();
  const dlg = f.locator('dialog.confirm[open]');
  await dlg.waitFor();
  assert.equal(await dlg.getByRole('heading').innerText(), 'Leave this set?');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/leave-back-link.png` });
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(400);
  assert.equal(page.url(), BASE + url, 'Keep going: still in the set');
  assert.ok(await f.getByRole('button', { name: 'Check', exact: true }).count() || await f.locator('[data-box]').count(), 'the problem is still there');
  await page.getByRole('link', { name: 'Back to Arithmetic Lab' }).click();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.waitForURL(`${BASE}/g/arithmetic-lab`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the play page: the full screen Back asks too', { skip, timeout: 120e3 }, async () => {
  const { ctx, page, errors } = await open(kid, { width: 390, height: 844 });
  const url = setUrl();
  await page.goto(BASE + url);
  const f = await startSet(page);
  await page.evaluate(() => document.getElementById('stage').classList.add('css-full'));   // full screen, as the page's fallback draws it
  await page.locator('.fsback').click();
  const dlg = f.locator('dialog.confirm[open]');
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(300);
  assert.equal(page.url(), BASE + url);
  await page.locator('.fsback').click();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.waitForURL(`${BASE}/g/arithmetic-lab`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the play page: the browser\'s Back asks; Keep going stays, Leave the set goes back for real; done, it goes at once', { skip, timeout: 120e3 }, async () => {
  const { ctx, page, errors } = await open(kid);
  const url = setUrl();
  await page.goto(`${BASE}/g/arithmetic-lab`);
  await page.goto(BASE + url);
  const f = await startSet(page);
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  const dlg = f.locator('dialog.confirm[open]');
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(400);
  assert.equal(page.url(), BASE + url, 'still on the play page');
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.waitForURL(`${BASE}/g/arithmetic-lab`);
  // after the guard goes (the set left from inside the game): one Back leaves, nothing asks, no extra entry
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/g/arithmetic-lab`);
  await p3.goto(BASE + '/play/arithmetic-lab');
  const f3 = p3.frameLocator('#gameframe');
  await f3.getByRole('button', { name: /I’m a student/ }).click();
  await f3.getByRole('button', { name: 'Start practicing ▸' }).click();
  await f3.getByRole('button', { name: 'Start', exact: true }).click();
  await p3.waitForFunction(() => window.oombaGuarded());
  await f3.getByRole('button', { name: '← Practice' }).click();
  await f3.locator('dialog.confirm[open]').getByRole('button', { name: 'Leave the set' }).click();
  await p3.waitForFunction(() => !window.oombaGuarded());
  await p3.waitForTimeout(300);
  await p3.goBack();
  await p3.waitForURL(`${BASE}/g/arithmetic-lab`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the play page: closing the tab mid-set gets the browser\'s own question', { skip, timeout: 60e3 }, async () => {
  const { ctx, page } = await open(kid);
  await page.goto(BASE + setUrl());
  await startSet(page);
  const asked = new Promise(r => page.once('dialog', async d => { r(d.type()); await d.dismiss(); }));
  await page.close({ runBeforeUnload: true });
  assert.equal(await asked, 'beforeunload');
  await ctx.close();
});

test('Homeroom\'s layer: its bar, Escape (on the layer and on the game\'s page) and Back ask first', { skip, timeout: 150e3 }, async () => {
  const { ctx, page, errors } = await open(kid);
  const url = setUrl();
  // a page of this site with Homeroom's game layer on it (public/js/homeroom-player.js), as the desk uses it
  await page.route(`${BASE}/hr-layer-test`, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset=utf-8><body><main id="host"></main><p id="closed">0</p>
<script type="module">import { gamePlayer } from '/js/homeroom-player.js';
const p = gamePlayer({ host: document.getElementById('host'), path: '/hr-layer-test', back: 'Back to my desk', find: () => ({ href: ${JSON.stringify(url)}, title: 'Arithmetic Lab', icon: '🧮' }), onClose: () => { const c = document.getElementById('closed'); c.textContent = String(+c.textContent + 1); } });
window.openIt = () => p.open('lab');</script>` }));
  await page.goto(`${BASE}/hr-layer-test`);
  const layerOpen = async () => {
    await page.evaluate(() => window.openIt());
    const fr = page.frameLocator('.hr-playframe').frameLocator('#gameframe');
    await fr.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForFunction(() => { const w = document.querySelector('.hr-playframe')?.contentWindow; return !!(w && w.oombaGuarded && w.oombaGuarded()); });
    return fr.locator('dialog.confirm[open]');
  };
  const closed = async () => +(await page.locator('#closed').innerText());
  // the bar's Back to my desk
  let dlg = await layerOpen();
  await page.getByRole('button', { name: 'Back to my desk' }).click();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.hr-player').count(), 1, 'Keep going: the layer stays');
  await page.getByRole('button', { name: 'Back to my desk' }).click();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.locator('.hr-player').waitFor({ state: 'detached' });
  assert.equal(await closed(), 1);
  // Escape on the layer (the bar has the focus)
  dlg = await layerOpen();
  await page.locator('.hr-playback').focus();
  await page.keyboard.press('Escape');
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.hr-player').count(), 1);
  await page.locator('.hr-playback').focus();
  await page.keyboard.press('Escape');
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.locator('.hr-player').waitFor({ state: 'detached' });
  // Escape on the game's page in the layer (around the game: its own keys stay the game's), which asks the layer to close
  dlg = await layerOpen();
  const inner = page.frames().find(fr => fr.url().includes('in=hr'));
  await inner.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.locator('.hr-player').waitFor({ state: 'detached' });
  // the browser's Back
  dlg = await layerOpen();
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.hr-player').count(), 1, 'Back, then Keep going: the layer stays');
  assert.match(page.url(), /#play=lab$/);
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Leave the set' }).click();
  await page.locator('.hr-player').waitFor({ state: 'detached' });
  assert.doesNotMatch(page.url(), /#play=/);
  assert.equal(await closed(), 4);
  // the page's own close (the teacher brings everyone back) never asks: not tested here, it calls close() directly
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- 8.12: the class Progress page's sample row ----

test('8.12: class Progress with nothing assigned, or no students, shows a faded, labelled sample row, never counted or exported', { skip, timeout: 180e3 }, async () => {
  const empty = S.createClass(boss, school.id, { name: 'Empty 5a', teacherId: teacher.id }).class;
  const noKids = S.createClass(boss, school.id, { name: 'Quiet 5b', teacherId: teacher.id }).class;
  const lesson = L.createLesson(teacher, school.id, { title: 'Regrouping' }).lesson;
  L.addStep(teacher, lesson.id, { kind: 'game', gameId: LAB.id, body: 'Play it' });
  L.addStep(teacher, lesson.id, { kind: 'question', body: 'Why?' });
  L.assign(teacher, noKids.id, lesson.id, {});
  for (const [cls, cols, title] of [[empty, ['Sample lesson plan', 'Sample game'], 'No lessons assigned yet'], [noKids, ['Regrouping'], 'No students yet']]) {
    for (const scheme of ['light', 'dark']) {
      for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
        const { ctx, page, errors } = await open(teacher, viewport, { colorScheme: scheme });
        await page.goto(`${BASE}/class/${cls.id}/progress`);
        assert.match(await page.locator('main').innerText(), new RegExp(title), `${cls.name}: the empty state`);
        const row = page.locator('tr.gb-sample');
        assert.equal(await row.count(), 1, `${cls.name} ${scheme} ${viewport.width}: one sample row`);
        assert.equal((await row.locator('th').innerText()).trim(), 'Sample student');
        assert.ok(Number(await row.evaluate(el => getComputedStyle(el).opacity)) < 0.8, 'faded');
        assert.equal((await page.locator('.gb-sample-cap').innerText()).trim(), 'A sample: this is what you’ll see');
        const heads = await page.locator('.gb-sample-tbl thead th').allInnerTexts();
        assert.deepEqual(heads.map(h => h.trim()), ['Name', ...cols, 'Work done', 'Score']);
        assert.match(await row.innerText(), cls === empty ? /3\/5[\s\S]*✅[\s\S]*80%[\s\S]*90%/ : /1\/2[\s\S]*80%[\s\S]*90%/, 'steps done, a read to do, work done and a score');
        assert.equal(await page.locator('#gb-lessons').count(), 0, 'not the gradebook');
        assert.equal(await page.locator('a[href$="progress.csv"]').count(), 0, 'nothing to download');
        assert.equal(await row.locator('a').count(), 0, 'nothing in it is a link');
        assert.match(await page.locator('.gb-empty-what').innerText(), /each student gets a row here/);
        // nothing wider than the phone
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/sample-${cls.name.split(' ')[1]}-${scheme}-${viewport.width}.png`, fullPage: true });
        assert.deepEqual(errors, []);
        await ctx.close();
      }
    }
  }
  // the CSV has no sample in it
  const r = await fetch(`${BASE}/class/${noKids.id}/progress.csv`, { headers: { cookie: cookieOf(teacher.id) } });
  const csv = await r.text();
  assert.doesNotMatch(csv, /Sample student/);
});
