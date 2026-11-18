// The Big Divide in the built game (Chromium), for what came with remainders as fractions and decimals, decimal numbers,
// addition and subtraction, and the bring-down arrows (docs/decisions.md "The Big Divide: remainders, decimals,
// addition and subtraction"). Each run works problems in a row on a phone, Guided (every question read) and On my own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

const html = fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.html'), 'utf8');
let browser = null;
test.after(async () => { if (browser) await browser.close(); });
/** The built game opened with a teacher's activity (a question set), as the frame opens it: BRB stubbed, the kit served. */
async function open(item, phone = true) {
  browser ??= await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'game.test') return r.abort();
    if (u.pathname.startsWith('/vendor/')) return r.fulfill({ path: path.join(ROOT, 'public', u.pathname) });
    return r.fulfill({ contentType: 'text/html', body: html });
  });
  await page.addInitScript((it) => {
    const kept = {};
    window.__over = [];
    window.BRB = { questionSet: { id: 's-abcdefghjk', items: [it], mine: false }, storage: { get: (k) => kept[k] ?? null, set: (k, v) => (kept[k] = v) }, gameOver: (o) => window.__over.push(o), user: { isGuest: false } };
  }, item);
  await page.goto('http://game.test/play');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  return { page, ctx, errors };
}

/** The sheet the game works for a problem of this item (the same code, loaded in Node). */
const sheetOf = (item, p) => L.sheetFor(L.parseItem(item), p);

/** Work one problem as a student would: Guided, each box in the order the page asks for it (its question read first);
 *  On my own, every box from the start, each tapped and typed. The arrows are counted as they appear. */
async function work(page, sheet, guided, what) {
  const auto = new Set();
  if (guided) {
    for (let guard = 0; guard < 400; guard++) {
      // the next box to fill has the focus once the page is done (a bring-down slides first); at the end, Check has it
      const h = await page.waitForFunction(() => {
        const a = document.activeElement;
        if (a?.dataset?.box && a.value === '') return a.dataset.box;
        return a?.textContent?.trim() === 'Check' ? 'done' : null;
      }, null, { timeout: 5000 });
      const id = await h.jsonValue();
      if (id === 'done') break;
      const st = sheet.steps[L.stepOfBox(sheet, id)];
      assert.ok(st, `${what}: box ${id} is on a step`);
      const asked = await page.locator('.prompt').innerText();
      assert.ok(asked.length > 3, `${what}: a question for ${id}`);
      await page.keyboard.type(String(L.boxOf(sheet, id).digit));
      await page.waitForTimeout(20);
    }
  } else {
    for (const b of sheet.boxes) {
      const el = page.locator(`input[data-box="${b.id}"]`);
      if (await el.evaluate((e) => e.readOnly)) { auto.add(b.id); continue; }
      await el.focus();
      await page.keyboard.type(String(b.digit));
      await page.waitForTimeout(10);
    }
  }
}
async function check(page, sheet, what) {
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await page.locator('.feedback').waitFor();
  const fb = await page.locator('.feedback').innerText();
  assert.match(fb, /Correct!/, `${what}: ${fb}`);
  assert.ok(fb.includes(`${sheet.title} = ${L.showAnswer(sheet.answer)}`), `${what}: the answer shown (${fb})`);
  return fb;
}

/** Three problems (or as many as given) in a row, Guided and On my own, on a phone: each Correct!, the score, gameOver. */
async function inARow(item, l, what, each) {
  const it = { ...item, l };
  const { page, ctx, errors } = await open(it, true);
  for (let i = 0; i < it.p.length; i++) {
    const sheet = sheetOf(it, it.p[i]);
    const w = `${what}, ${l}, problem ${i + 1} (${sheet.title})`;
    await work(page, sheet, l === 'guided', w);
    await check(page, sheet, w);
    if (each) await each(page, sheet, w);
    await page.locator('.feedback .btn-primary').click();
  }
  await page.getByText('All done!').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: it.p.length }], `${what}: BRB.gameOver once, with the score`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: no sideways page scroll`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------------------------------------------------------------- the bring-down arrows

const arrows = (page) => page.locator('svg.arrow').count();
for (const l of ['guided', 'onMyOwn'])
  test(`in Chromium: long division keeps an arrow for each bring-down, ${l}`, { skip, timeout: 90e3 }, async () => {
    await inARow({ k: 'divide', p: [[9452, 7], [612, 6], [87, 3]] }, l, 'arrows', async (page, sheet, w) => {
      assert.equal(await arrows(page), sheet.steps.filter((s) => s.kind === 'bringDown').length, `${w}: the arrows stay`);
    });
  });

test('in Chromium: an arrow is drawn only when its bring-down is done', { skip, timeout: 60e3 }, async () => {
  const { page, ctx } = await open({ k: 'divide', p: [[9452, 7]], l: 'onMyOwn' }, true);
  assert.equal(await arrows(page), 0, 'none before anything is brought down');
  await page.locator('input[data-box="b1"]').focus();
  await page.keyboard.type('4');
  assert.equal(await arrows(page), 1, 'the first bring-down, its arrow');
  await ctx.close();
});
