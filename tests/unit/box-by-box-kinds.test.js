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
const M = await import(path.join(ROOT, 'tools/box-by-box/src/lib/methods.ts'));

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
      // a product with a carry: its tens first (they float up to the carry box), then its ones
      const lift = st.liftCarry?.ones === id ? String(L.boxOf(sheet, st.liftCarry.tens).digit) : '';
      await page.keyboard.type(lift + String(L.boxOf(sheet, id).digit), { delay: 30 });
      await page.waitForTimeout(20);
    }
  } else {
    for (const b of sheet.boxes) {
      const st = sheet.steps[L.stepOfBox(sheet, b.id)];
      if (st.liftCarry?.tens === b.id) continue;
      const el = page.locator(`input[data-box="${b.id}"]`);
      if (await el.evaluate((e) => e.readOnly)) { auto.add(b.id); continue; }
      await el.focus();
      await page.keyboard.type((st.liftCarry?.ones === b.id ? String(L.boxOf(sheet, st.liftCarry.tens).digit) : '') + String(b.digit), { delay: 20 });
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

// ---------------------------------------------------------------- remainders as fractions and decimals

for (const l of ['guided', 'onMyOwn']) {
  test(`in Chromium: remainders as fractions, three in a row, ${l}`, { skip, timeout: 90e3 }, async () => {
    await inARow({ k: 'divide', p: [[745, 6], [30, 4], [1234, 12]], r: 'fraction' }, l, 'fractions', async (page, sheet, w) => {
      assert.equal(await page.locator('input.digit.half').count(), sheet.fraction ? sheet.fraction.num.length + sheet.fraction.den.length : 0, `${w}: the fraction's half squares`);
    });
  });
  test(`in Chromium: remainders as decimals, three in a row, ${l}`, { skip, timeout: 90e3 }, async () => {
    await inARow({ k: 'divide', p: [[745, 6], [745, 4], [92, 8]], r: 'decimal' }, l, 'decimals', async (page, sheet, w) => {
      assert.equal(await page.locator('svg.arrow').count(), sheet.cells.filter((c) => c.kind === 'arrow').length, `${w}: every arrow, the lifted point's too`);
      if (sheet.note) assert.match(await page.locator('.feedback').innerText(), /Rounded to the nearest hundredth/, w);
    });
  });
}

test('in Chromium: a fraction simplified is right, on the phone keypad; a decimal point is typed with its own key', { skip, timeout: 60e3 }, async () => {
  const { page, ctx, errors } = await open({ k: 'divide', p: [[30, 4]], l: 'onMyOwn', r: 'fraction' }, true);
  const s = sheetOf({ k: 'divide', p: [[30, 4]], r: 'fraction' }, [30, 4]);
  for (const id of s.answerBoxes.filter((x) => x[0] === 'q')) { await page.locator(`input[data-box="${id}"]`).focus(); await page.keyboard.type(String(L.boxOf(s, id).digit)); }
  await page.locator(`input[data-box="${s.fraction.num[0]}"]`).focus(); await page.keyboard.type('1');
  await page.locator(`input[data-box="${s.fraction.den[0]}"]`).focus(); await page.keyboard.type('2');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  assert.match(await page.locator('.feedback').innerText(), /Correct! 30 ÷ 4 = 7 2\/4/);
  await ctx.close();
  const d = await open({ k: 'divide', p: [[745, 4]], l: 'guided', r: 'decimal' }, true);
  await d.page.getByRole('button', { name: 'Keypad' }).click();
  assert.equal(await d.page.getByRole('button', { name: 'Decimal point' }).count(), 1, 'the keypad has a point key');
  const ds = sheetOf({ k: 'divide', p: [[745, 4]], r: 'decimal' }, [745, 4]);
  // up to the point: by the keypad, as on a phone
  for (let guard = 0; guard < 60; guard++) {
    const id = await d.page.evaluate(() => document.activeElement?.dataset?.box ?? null);
    if (!id || L.boxOf(ds, id).digit === '.') break;
    await d.page.locator('.keypad').getByRole('button', { name: String(L.boxOf(ds, id).digit), exact: true }).click();
    await d.page.waitForTimeout(30);
    await d.page.waitForFunction(() => document.activeElement?.dataset?.box && document.activeElement.value === '');
  }
  assert.match(await d.page.locator('.prompt').innerText(), /Write a decimal point after 745, then a 0/);
  await d.page.getByRole('button', { name: 'Decimal point' }).click();
  assert.equal(await d.page.locator('input[data-box="np"]').inputValue(), '.');
  await ctx.close().catch(() => {});
  await d.ctx.close();
  assert.deepEqual([...errors, ...d.errors], []);
});

for (const [m, l] of [['ladder', 'guided'], ['area', 'onMyOwn'], ['area', 'guided'], ['ladder', 'onMyOwn']])
  test(`in Chromium: the ${m === 'ladder' ? 'ladder' : 'area model'} writes remainders as fractions, three in a row, ${l}`, { skip, timeout: 90e3 }, async () => {
    const p = [[945, 7], [30, 4], [87, 5]];
    const { page, ctx, errors } = await open({ k: 'divide', p, l, m, r: 'fraction' }, true);
    for (let i = 0; i < p.length; i++) {
      const v = {};
      for (let guard = 0; guard < 60; guard++) {
        const f = M.buildWork(m, 'divide', p[i], v, 'fraction').fields.find((x) => !v[x.id]);
        if (!f) break;
        if (l === 'guided') assert.equal(await page.locator('.prompt').innerText(), f.prompt, `${p[i]}: the question for ${f.id}`);
        const val = f.role === 'choice' ? String(f.countUp.choose.last ? Math.floor(f.countUp.choose.left / f.countUp.choose.divisor) : M.placeValueMultiple(f.countUp.choose.left, f.countUp.choose.divisor)) : f.expect;
        if (l !== 'guided') await page.locator(`input[data-field="${f.id}"]`).focus();
        await page.keyboard.type(val);
        if (f.role === 'choice' && val.length < f.len) await page.keyboard.press('Enter');
        await page.waitForTimeout(30);
        v[f.id] = val;
      }
      const w = M.buildWork(m, 'divide', p[i], v, 'fraction');
      await page.getByRole('button', { name: 'Check', exact: true }).click();
      assert.match(await page.locator('.feedback').innerText(), new RegExp(`Correct! ${p[i][0]} ÷ ${p[i][1]} = ${w.answer}`));
      await page.locator('.feedback .btn-primary').click();
    }
    await page.getByText('All done!').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: 3 }]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

// ---------------------------------------------------------------- decimals

const DECIMALS = [
  // the point lifted straight up (and a whole-number problem in a decimals activity: its answer a decimal, stopped at 2 places)
  { what: 'decimal division', item: { k: 'divide', p: [[12.6, 4], [0.84, 4], [13, 6]], dec: 1 } },
  { what: 'decimal divisors', item: { k: 'divide', p: [[4.5, 0.3], [4.5, 0.25], [6, 0.4]], dec: 1 } },
  { what: 'decimal multiplication', item: { k: 'multiply', p: [[2.4, 1.3], [0.6, 4], [3.25, 2.6]], dec: 1 } }
];
for (const { what, item } of DECIMALS)
  for (const l of ['guided', 'onMyOwn'])
    test(`in Chromium: ${what}, three in a row, ${l}`, { skip, timeout: 90e3 }, async () => {
      await inARow(item, l, what, async (page, sheet, w) => {
        if (item.k === 'multiply') assert.equal(await page.locator('.given.dot').count(), sheet.cells.filter((c) => c.dot && !c.after).length + 1, `${w}: a point in each number that has one, and one in the answer`);
        if (sheet.steps[0].kind === 'shift') assert.equal(await page.locator('svg.hop').count(), 2, `${w}: the hops`);
      });
    });

// ---------------------------------------------------------------- addition and subtraction

const COLUMNS = [
  { what: 'addition with carries', item: { k: 'add', p: [[475, 368], [95, 7 + 10], [9999, 9999]] } },
  { what: 'subtraction with regrouping', item: { k: 'subtract', p: [[400, 167], [532, 148], [4005, 2996]] } },
  { what: 'decimal addition', item: { k: 'add', p: [[3.5, 2.75], [0.5, 0.25], [35.6, 7.25]], dec: 1 } },
  { what: 'decimal subtraction', item: { k: 'subtract', p: [[5.2, 1.75], [10.05, 2.5], [40, 16.3]], dec: 1 } }
];
for (const { what, item } of COLUMNS)
  for (const l of ['guided', 'onMyOwn'])
    test(`in Chromium: ${what}, three in a row, ${l}`, { skip, timeout: 90e3 }, async () => {
      await inARow(item, l, what, async (page, sheet, w) => {
        if (item.k === 'subtract') {
          // every digit regrouped is crossed out, and the small 1s are in
          const crossedGiven = sheet.cells.filter((c) => c.kind === 'given' && c.crossBy).length;
          assert.equal(await page.locator('.given.crossed').count(), crossedGiven, `${w}: the crossed-out digits`);
        }
      });
    });

test('in Chromium: 400 − 167, Guided: each regrouping asked for in order, the 4 and the 0 crossed out', { skip, timeout: 60e3 }, async () => {
  const { page, ctx, errors } = await open({ k: 'subtract', p: [[400, 167]], l: 'guided' }, true);
  const asked = [];
  const sheet = sheetOf({ k: 'subtract', p: [[400, 167]] }, [400, 167]);
  for (let guard = 0; guard < 20; guard++) {
    const id = await (await page.waitForFunction(() => { const a = document.activeElement; return a?.dataset?.box && a.value === '' ? a.dataset.box : a?.textContent?.trim() === 'Check' ? 'done' : null; })).jsonValue();
    if (id === 'done') break;
    asked.push(await page.locator('.prompt').innerText());
    await page.keyboard.type(String(L.boxOf(sheet, id).digit));
  }
  assert.deepEqual(asked, [
    '0 is less than 7, and there’s nothing to regroup in the tens. Go to the hundreds: cross out the 4 and write 3 over it.',
    'The 1 hundred is 10 tens: write a small 1 in front of the 0 to make 10.',
    'Now take 1 of those 10 tens for the ones: cross out the 10 and write 9.',
    'The ones get 10 more: write a small 1 in front of the 0 to make 10.',
    'What is 10 − 7?',
    'What is 9 − 6?',
    'What is 3 − 1?'
  ]);
  assert.equal(await page.locator('.given.crossed').count(), 2, 'the 4 and the tens 0');
  assert.equal(await page.locator('input.digit.crossed').count(), 1, 'and the small 1 in front of that 0');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  assert.match(await page.locator('.feedback').innerText(), /Correct! 400 − 167 = 233/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- Watch and Count up, for each new kind and option

const EVERY = [
  { k: 'divide', p: [[30, 4], [745, 6]], r: 'fraction' },
  { k: 'divide', p: [[745, 6], [27, 6]], r: 'decimal' },
  { k: 'divide', p: [[12.6, 4], [4.5, 0.25]], dec: 1 },
  { k: 'multiply', p: [[2.4, 1.3], [0.6, 4]], dec: 1 },
  { k: 'add', p: [[475, 368], [3.5, 2.75]], dec: 1 },
  { k: 'subtract', p: [[400, 167], [5.2, 1.75]], dec: 1 }
];
for (const item of EVERY) {
  const name = `${item.k}${item.r ? ` (${item.r})` : ''}${item.dec ? ' (decimals)' : ''}`;
  test(`in Chromium: Watch works ${name} to the end`, { skip, timeout: 90e3 }, async () => {
    const { page, ctx, errors } = await open({ ...item, l: 'watch' }, true);
    for (let i = 0; i < 400 && !(await page.getByText('All done!').count()); i++) {
      await page.locator('.actions .btn-primary').click();
      await page.waitForTimeout(15);
    }
    assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: 0 }]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  test(`in Chromium: Count up works ${name}, each to Correct!`, { skip, timeout: 120e3 }, async () => {
    const it = { ...item, l: 'countUp' };
    const { page, ctx, errors } = await open(it, true);
    for (let n = 0; n < it.p.length; n++) {
      const sheet = sheetOf(it, it.p[n]);
      for (let guard = 0; guard < 300; guard++) {
        const id = await (await page.waitForFunction(() => {
          const a = document.activeElement;
          if (document.querySelector('.feedback')) return null;
          if (a?.textContent?.trim() === 'Check') return 'done';
          return a?.dataset?.box && (a.value === '' || a.classList.contains('counting')) ? a.dataset.box : null;
        }, null, { timeout: 8000 })).jsonValue();
        if (id === 'done') break;
        const st = sheet.steps[L.stepOfBox(sheet, id)];
        const counting = await page.locator('.stepper').count();
        if (counting) {
          const times = st.skipCount ? st.skipCount.times : Number(L.boxOf(sheet, id).digit);
          if (times === 0 && !st.skipCount) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown'); }
          // a count by skips starts with ▲ at its starting number, then ▲ once for each
          if (st.skipCount) await page.keyboard.press('ArrowUp');
          for (let i = 0; i < times; i++) await page.keyboard.press('ArrowUp');
          await page.keyboard.press('Enter');
        } else {
          const lift = st.liftCarry?.ones === id ? String(L.boxOf(sheet, st.liftCarry.tens).digit) : '';
          await page.keyboard.type(lift + String(L.boxOf(sheet, id).digit), { delay: 30 });
        }
        await page.waitForTimeout(40);
      }
      await check(page, sheet, `${name}, Count up, ${sheet.title}`);
      await page.locator('.feedback .btn-primary').click();
    }
    await page.getByText('All done!').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: it.p.length }]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

// ---------------------------------------------------------------- Count up meets a 0 (Greg, live site: 5.89 + 16.00)
// A step of 0 is counted like any other: ▲ puts the starting number in the box, then ▲ once for each to count (none
// here), then That's it. The box never sits empty waiting for That's it, and the words are a normal step's.
const ZEROS = [
  { what: '5.89 + 16.00, the tenths 8 + 0', item: { k: 'add', p: [[5.89, 16]], dec: 1 }, box: 'a1', start: '8' },
  { what: '45 + 30, the ones 5 + 0', item: { k: 'add', p: [[45, 30]] }, box: 'a0', start: '5' },
  { what: '47 − 27, the ones 7 − 7', item: { k: 'subtract', p: [[47, 27]] }, box: 'a0', start: '0' },
  { what: '302 × 3, the tens 3 × 0', item: { k: 'multiply', p: [[302, 3]] }, box: 'a1', start: '0' }
];
for (const z of ZEROS)
  test(`in Chromium, on a phone: Count up, ${z.what}: the start goes in the box with ▲, counted 0 times, then That’s it`, { skip, timeout: 90e3 }, async () => {
    const it = { ...z.item, l: 'countUp' };
    const { page, ctx, errors } = await open(it, true);
    const sheet = sheetOf(it, it.p[0]);
    const zeroStep = L.stepOfBox(sheet, z.box);
    for (let guard = 0; guard < 300; guard++) {
      const id = await (await page.waitForFunction(() => {
        const a = document.activeElement;
        if (document.querySelector('.feedback')) return null;
        if (a?.textContent?.trim() === 'Check') return 'done';
        return a?.dataset?.box && (a.value === '' || a.classList.contains('counting')) ? a.dataset.box : null;
      }, null, { timeout: 8000 })).jsonValue();
      if (id === 'done') break;
      const i = L.stepOfBox(sheet, id);
      const st = sheet.steps[i];
      if (await page.locator('.stepper').count()) {
        if (i === zeroStep) {
          assert.equal(st.skipCount.times, 0, `${z.what}: this step counts 0`);
          const asked = await page.locator('.prompt').innerText();
          assert.match(asked, /start at \d+ with ▲/, `${z.what}: the same words as any step (${asked})`);
          assert.doesNotMatch(asked, /nothing to count/, z.what);
          // That's it before the start: the page asks for the ▲, and nothing is written for the student
          await page.getByRole('button', { name: 'That’s it' }).click();
          assert.match(await page.locator('.prompt').innerText(), /Start with ▲/);
          assert.equal(await page.locator(`input[data-box="${z.box}"]`).inputValue(), '');
          // ▲: the starting number is in the box (not blank), then That's it writes it
          await page.getByRole('button', { name: 'One more' }).click();
          assert.equal((await page.locator('.live').innerText()).replace(/\s/g, ''), z.start, `${z.what}: the start shows in the box`);
          assert.match(await page.locator('.prompt').innerText(), /Press That’s it/);
          await page.getByRole('button', { name: 'That’s it' }).click();
          await page.waitForFunction((b) => document.querySelector(`input[data-box="${b}"]`)?.value !== '', z.box);
          assert.equal(await page.locator(`input[data-box="${z.box}"]`).inputValue(), String(L.boxOf(sheet, z.box).digit));
          continue;
        }
        const times = st.skipCount ? st.skipCount.times : Number(L.boxOf(sheet, id).digit);
        if (times === 0 && !st.skipCount) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown'); }
        if (st.skipCount) await page.keyboard.press('ArrowUp');
        for (let k = 0; k < times; k++) await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
      } else {
        const lift = st.liftCarry?.ones === id ? String(L.boxOf(sheet, st.liftCarry.tens).digit) : '';
        await page.keyboard.type(lift + String(L.boxOf(sheet, id).digit), { delay: 30 });
      }
      await page.waitForTimeout(40);
    }
    assert.ok(await page.locator(`input[data-box="${z.box}"]`).inputValue(), `${z.what}: the 0 step was reached and filled`);
    await check(page, sheet, `${z.what}, Count up`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
