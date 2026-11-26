// Flashcards shared with a class (docs/decisions.md "Flashcards: students share with their class"), in real Chromium
// against the app, at 390 px for the students and 1366 for the teacher: a student turns on "Share with my class" on
// their own set; a classmate finds it under "Shared by my class", studies it (Flip) and copies it into their own sets;
// the teacher finds it under "Shared by students" and hides it from the class; the classmate no longer sees it.
// FC_SHARE_SHOTS=<dir> saves the switch (390), the classmate's list (390) and the teacher's list (1366).
import { reset, publish, official, teacher, mia, leo, cls, q, ctx, cookieFor } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exe, skip } from './_flashcards-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = await import('../../server/services/game-sets.js');
const SHOTS = process.env.FC_SHARE_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
const GAME = publish(official, HTML, { source: 'seed', slug: 'flashcards', title: 'Flashcards' });
q.run("UPDATE games SET shelf='learn' WHERE id=?", GAME.id);
const ITEMS = [{ t: 'Volcano words', c: [['magma', 'melted rock under the ground', '🌋'], ['lava', 'melted rock on the surface', '🔥'], ['crater', 'the bowl at the top of a volcano', '🕳️'], ['ash', 'tiny bits of rock in the air', '🌫️']], a: 't' }];
const PHONE = { width: 390, height: 844 }, LAPTOP = { width: 1366, height: 768 };
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open(user, url, viewport) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const c = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 700 });
  const [k, v] = cookieFor(user.id).split('='); await c.addCookies([{ name: k, value: v, url: ctx.base }]);
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await c.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(ctx.base + url);
  const t0 = Date.now(); let f;
  while (!(f = p.frames().find(x => /\/frame\//.test(x.url())))) { if (Date.now() - t0 > 60_000) throw new Error('no game frame'); await p.waitForTimeout(200); }
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.fcState, null, { timeout: 60_000 });
  const state = () => f.evaluate(() => window.__brbTest.fcState());
  const on = want => f.waitForFunction(w => window.__brbTest.fcState().screen === w, want, { timeout: 20_000 });
  const noSideScroll = () => f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const shot = async name => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
  return { c, p, f, state, on, errors, noSideScroll, shot };
}

test('a student shares a set; a classmate studies and copies it; the teacher sees it under "Shared by students" and hides it', { skip, timeout: 240_000 }, async () => {
  reset();
  for (const u of [mia, leo]) q.run('DELETE FROM game_sets WHERE owner_id=?', u.id);
  q.run('DELETE FROM flash_shares');
  const id = G.save(GAME.id, mia.id, ITEMS, null, 'flashcards', { max: G.FLASH.ownSets }).id;

  // 1. Mia (390): her own set, "Share with my class" off by default, then on
  const A = await open(mia, `/play/flashcards?chapter=${id}&lock=1`, PHONE);
  try {
    await A.on('set');
    const sw = A.f.locator('#fc-shareme .fc-switch');
    await A.f.waitForSelector('#fc-shareme .fc-switch:not([disabled])');
    assert.equal(await sw.getAttribute('aria-checked'), 'false', 'off by default');
    assert.match(await A.f.textContent('#fc-shareme'), new RegExp(`Your teacher and classmates in ${cls.name}`));
    await sw.click();
    await A.f.waitForSelector('#fc-shareme .fc-switch[aria-checked="true"]:not([disabled])');
    assert.match(await A.f.textContent('#fc-sharemsg'), /Shared with/);
    assert.equal(q.get('SELECT COUNT(*) n FROM flash_shares WHERE set_id=? AND class_id=?', id, cls.id).n, 1);
    assert.equal(await A.noSideScroll(), true, 'no sideways scrolling at 390');
    await A.f.evaluate(() => document.getElementById('fc-shareme').scrollIntoView({ block: 'center' })); await A.shot('share-switch-390');
    assert.deepEqual(A.errors, []);
  } finally { await A.c.close(); }

  // 2. Leo (390): "Shared by my class" on the home screen, study it, copy it into his own sets
  const B = await open(leo, '/play/flashcards', PHONE);
  try {
    await B.on('home');
    const row = B.f.locator(`#fc-sharedlist li[data-shared="${id}"]`);
    await row.waitFor({ timeout: 20_000 });
    const text = await row.textContent();
    assert.match(text, /Volcano words/); assert.match(text, new RegExp(`From ${mia.display_name}`)); assert.doesNotMatch(text, /Mia Pupil/, 'never the roster name');
    assert.equal(await B.noSideScroll(), true);
    await B.f.evaluate(() => document.getElementById('fc-shared').scrollIntoView({ block: 'center' })); await B.shot('shared-by-my-class-390');
    await B.f.click(`[data-open="${id}"]`);
    await B.on('set');
    assert.equal((await B.state()).shared, true); assert.equal((await B.state()).cards, 4);
    assert.match(await B.f.textContent('#fc'), new RegExp(`Shared by ${mia.display_name}`));
    assert.equal(await B.f.locator('#fc-shareme').count(), 0, 'no switch on a classmate\'s set');
    assert.equal(await B.f.locator('#fc-share').count(), 0, 'no class code or link');
    // study: Flip
    await B.f.click('#fc-m-flip'); await B.on('flip');
    await B.f.click('#fc-flipbtn');
    assert.equal((await B.state()).flip.turned, true);
    await B.f.click('#fc-back'); await B.on('set');
    // copy it into his own sets
    await B.f.click('#fc-edit'); await B.on('build');
    await B.f.click('#fc-save');
    await B.f.waitForFunction(() => /Saved/.test(document.getElementById('fc-savemsg').textContent), null, { timeout: 20_000 });
    const copy = q.get("SELECT id, items FROM game_sets WHERE owner_id=? AND game_id=?", leo.id, GAME.id);
    assert.ok(copy, 'a set of his own'); assert.equal(JSON.parse(copy.items)[0].t, 'Volcano words'); assert.notEqual(copy.id, id);
    assert.deepEqual(B.errors, []);
  } finally { await B.c.close(); }

  // 3. The teacher (1366): "Shared by students", with the roster name; hide it from the class
  const T = await open(teacher, '/play/flashcards', LAPTOP);
  try {
    await T.on('home');
    const row = T.f.locator(`#fc-sharedlist li[data-shared="${id}"]`);
    await row.waitFor({ timeout: 20_000 });
    assert.match(await T.f.textContent('#fc-shared-h'), /Shared by students/);
    assert.match(await row.textContent(), /Mia Pupil/);
    await T.f.evaluate(() => document.getElementById('fc-shared').scrollIntoView({ block: 'center' })); await T.shot('shared-by-students-1366');
    await T.f.click(`[data-hide="${id}"]`);
    await T.f.waitForSelector(`#fc-sharedlist li[data-shared="${id}"] .fc-sharetag.fc-off`);
    assert.ok(q.get('SELECT hidden_at FROM flash_shares WHERE set_id=? AND class_id=?', id, cls.id).hidden_at, 'hidden from the class');
    assert.equal(G.get(GAME.id, id).ownerId, mia.id, 'still Mia\'s');
    assert.deepEqual(T.errors, []);
  } finally { await T.c.close(); }

  // 4. Leo again: gone from "Shared by my class"
  const B2 = await open(leo, '/play/flashcards', PHONE);
  try {
    await B2.on('home');
    await B2.f.waitForFunction(() => /Nothing shared yet/.test(document.getElementById('fc-shared').textContent), null, { timeout: 20_000 });
    assert.equal(await B2.f.locator(`#fc-sharedlist li[data-shared="${id}"]`).count(), 0);
  } finally { await B2.c.close(); }

  // 5. Mia: the switch says her teacher took it off the list (no blame), and the set is still hers
  const A2 = await open(mia, `/play/flashcards?chapter=${id}&lock=1`, PHONE);
  try {
    await A2.on('set');
    await A2.f.waitForSelector('#fc-shareme .fc-sharehidden');
    assert.match(await A2.f.textContent('#fc-shareme'), /took this set off the list/);
    assert.equal(await A2.f.locator('#fc-shareme .fc-switch').count(), 0);
  } finally { await A2.c.close(); }
});
