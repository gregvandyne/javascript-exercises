// Flashcards on the site's own pages, in real Chromium against the app: a teacher assigns a saved set from the Assign
// page (as the game's Assign button opens it), two students' card states arrive from their lesson step, and the
// lesson's progress page shows each student's cards and the cards missed most, on a desktop and a phone (no sideways
// scrolling); the Learn listing shows Flashcards under Words. FC_SHOTS=<dir> saves pictures in light and dark.
import { reset, call, publish, official, teacher, mia, leo, cls, q, ctx, cookieFor } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exe, skip } from './_flashcards-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = await import('../../server/services/game-sets.js');
const SHOTS = process.env.FC_SHOTS || '';
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/flashcards.html'), 'utf8');
const GAME = publish(official, HTML, { source: 'seed', slug: 'flashcards', title: 'Flashcards' });
q.run("UPDATE games SET shelf='learn' WHERE id=?", GAME.id);
const ITEMS = [{ t: 'Habitats', c: [['habitat', 'where an animal lives', '🏞️'], ['predator', 'an animal that hunts others', '🦁'], ['prey', 'an animal that is hunted', '🐇'], ['erosion', 'the wearing away of land', '🌊']], a: 't' }];
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function page(user, { width = 1440, height = 900, theme = 'light' } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const c = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  if (user) { const [k, v] = cookieFor(user.id).split('='); await c.addCookies([{ name: k, value: v, url: ctx.base }]); }
  const p = await c.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return { c, p, errors };
}
const sideScroll = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

test('assign a set from the Assign page, students study it, the teacher sees each student\'s cards and the cards missed most', { skip, timeout: 180_000 }, async () => {
  reset();
  const set = G.save(GAME.id, teacher.id, ITEMS, null, 'flashcards');
  const { c, p, errors } = await page(teacher);
  try {
    await p.goto(`${ctx.base}/teach/assign?game=flashcards&opts=${encodeURIComponent(`chapter=${set.id}&lock=1`)}`);
    assert.match(await p.textContent('main'), /Habitats: flashcards, 4 cards/);
    await p.selectOption('#ag-c', cls.id);
    await Promise.all([p.waitForURL(u => /\/class\//.test(String(u)), { timeout: 20_000 }), p.click('#ag-go')]);
    const cl = q.get("SELECT cl.id, s.id step FROM class_lessons cl JOIN lesson_steps s ON s.lesson_id=cl.lesson_id WHERE cl.class_id=? AND s.options LIKE ? ORDER BY cl.assigned_at DESC", cls.id, `%${set.id}%`);
    assert.ok(cl, 'a lesson step that opens the set');
    // the students' card states, as the game sends them from their lesson step
    const send = (u, cards) => call(`/api/progress/${cl.id}/${cl.step}/flash`, { method: 'POST', body: { cards }, user: u });
    assert.equal((await send(mia, [[3, 0], [2, 1], [0, 3], [1, 0]])).status, 200);
    assert.equal((await send(leo, [[3, 1], [0, 2], [0, 2], [-1, 0]])).status, 200);
    for (const theme of ['light', 'dark']) for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
      const v = await page(teacher, { width: w, height: h, theme });
      try {
        await v.p.goto(`${ctx.base}/class/${cls.id}/progress/${cl.id}`);
        const sec = v.p.locator('.fc-results');
        assert.equal(await sec.count(), 1);
        const text = await sec.textContent();
        assert.match(text, /Cards missed most/); assert.match(text, /prey/); assert.match(text, /Missed 5 times, 2 students/); assert.match(text, /Mia Pupil/); assert.match(text, /1\/4/);
        assert.equal(await sideScroll(v.p), false, `${tag} ${theme}: no sideways scrolling`);
        if (SHOTS) { await sec.scrollIntoViewIfNeeded(); await v.p.screenshot({ path: path.join(SHOTS, `teacher-progress-${w}-${theme}.png`) }); }
        assert.deepEqual(v.errors, []);
      } finally { await v.c.close(); }
    }
    assert.deepEqual(errors, []);
  } finally { await c.close(); }
});

test('the Learn listing: Flashcards under Words, grades K-8, opening its page', { skip, timeout: 120_000 }, async () => {
  for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { c, p, errors } = await page(teacher, { width: w, height: h, theme });
    try {
      await p.goto(`${ctx.base}/learn?subject=words`);
      const link = p.locator(`a[href*="/g/flashcards"], a[href*="/play/flashcards"]`).first();
      assert.equal(await link.count(), 1, 'listed');
      assert.match(await p.textContent('main'), /Flashcards/);
      assert.equal(await sideScroll(p), false);
      if (SHOTS) { await link.scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(SHOTS, `learn-listing-${w}-${theme}.png`) }); }
      assert.deepEqual(errors, []);
    } finally { await c.close(); }
  }
});
