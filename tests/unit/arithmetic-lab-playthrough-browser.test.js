// Arithmetic Lab, the owner's live playthrough (docs/decisions.md "Arithmetic Lab: the owner's playthrough, 28 Nov 2026"),
// in the production frame on a phone (tests/unit/_box-frame.js):
//   - long division: after a subtraction the page asks for the bring-down (a Bring down button, and Enter), the digit
//     slides down, and the focus moves to the answer's next digit on top, which the question names;
//   - the ladder and the area model: a number of groups that can't take another digit goes on by itself; Tab follows the
//     work and never lands on the quotient before the ladder ends; the remainder is written in by the page (never typed
//     twice);
//   - multiplication: every product is typed whole in its column's box, the last one too (its tens move left by itself);
//   - accessible names: no "NaN", no bare "Box"; a decimal point is a valid value in its box;
//   - partial products keep a 0 digit's line (610 × 9 starts with 9 × 0 = 0, and says so);
//   - steps fixed on the way are counted: the end screen says so, and the score's label (fixes:N) reaches the teacher;
//   - leaving a set half done asks first, in the page's own dialog (never confirm());
//   - Give up? Show the answer, after a Check that didn't pass, in division as in multiplication;
//   - decimals: multiplication's start screen uses a decimal example;
//   - teachers: the editor's way back is a labeled "Your activities"; Save on an activity students may have asks first
//     (save for everyone, or as a copy); opened from an Assign button, the game goes straight to making one and Save and
//     assign;
//   - nothing overflows a 390 or a 320 wide phone, light or dark.
// Skipped with no Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openGame, closeBrowser, skip } from './_box-frame.js';

test.after(closeBrowser);

const start = (g) => g.frame.getByRole('button', { name: 'Start', exact: true }).click();
async function type(g, keys) {
  for (const k of keys) {
    if (k === '\n') await g.page.keyboard.press('Enter');
    else if (k === '\t') await g.page.keyboard.press('Tab');
    else await g.page.keyboard.type(k);
    await g.page.waitForTimeout(120);
  }
}
const focused = (g) => g.frame.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label') ?? '', box: document.activeElement?.dataset?.box ?? '', field: document.activeElement?.dataset?.field ?? '', text: document.activeElement?.textContent?.trim() ?? '' }));
const prompt = (g) => g.frame.locator('.prompt').innerText();

test('long division: Bring down asks, slides the digit down, and the focus goes to the answer’s next digit on top', { skip, timeout: 90e3 }, async () => {
  const g = await openGame({ set: { k: 'divide', p: [[9216, 8]], l: 'guided' } });
  await start(g);
  await type(g, ['1', '8', '1']);
  assert.equal(await prompt(g), 'Now bring down the next digit, 2. Press Bring down (or Enter).');
  const btn = g.frame.getByRole('button', { name: 'Bring down' });
  assert.ok(await btn.isVisible(), 'a Bring down button, in place of Check');
  assert.equal((await focused(g)).text, 'Bring down', 'with the focus, so Enter brings it down');
  assert.equal(await g.frame.evaluate(() => document.querySelector('input[data-box="b1"]')?.value ?? ''), '', 'nothing has moved yet');
  await type(g, ['\n']);
  await g.frame.waitForFunction(() => document.querySelector('input[data-box="b1"]')?.value === '2');
  assert.equal((await focused(g)).box, 'q1', 'the focus is on the answer’s next digit');
  assert.equal(await prompt(g), 'The answer’s next digit goes on top. How many times does 8 go into 12?');
  // the next one by the button
  await type(g, ['1', '8', '4']);
  await btn.click();
  await g.frame.waitForFunction(() => document.querySelector('input[data-box="b2"]')?.value === '1');
  assert.equal((await focused(g)).box, 'q2');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('the ladder: a short number of groups goes on by itself, Tab follows the work, and the remainder is written in once', { skip, timeout: 90e3 }, async () => {
  const g = await openGame({ set: { k: 'divide', p: [[945, 7]], l: 'guided', m: 'ladder' } });
  await start(g);
  await type(g, ['20']);
  assert.equal((await focused(g)).label, 'Product, step 1', '20 groups of 7 can’t take a third digit: on to the product');
  assert.equal(await g.frame.locator('input[data-field="q0"]').inputValue(), '20');
  await type(g, ['140']);
  assert.equal((await focused(g)).label, 'What’s left, step 1');
  await type(g, ['\t']);
  assert.notEqual((await focused(g)).label, 'Quotient', 'Tab never jumps to the quotient before the ladder ends');
  assert.equal(await g.frame.locator('input[data-field="quotient"][aria-invalid="true"]').count(), 0, 'and nothing turns pink');
  await g.frame.locator('input[data-field="r0"]').focus();
  // 10 could still be 100: Enter says it's done (the question says so)
  await type(g, ['805', '1']);
  assert.match(await prompt(g), /Press Enter when that’s your number\./);
  await type(g, ['00', '700', '105', '10', '70', '35', '5', '35', '0']);
  const rem = g.frame.locator('input[data-field="remainder"]');
  assert.equal(await rem.inputValue(), '0', 'the remainder is what’s left on the last rung, written in');
  assert.equal(await rem.getAttribute('readonly'), '', 'and not typed again');
  assert.equal(await rem.getAttribute('tabindex'), '-1');
  assert.equal((await focused(g)).label, 'Quotient', 'the quotient is next');
  await type(g, ['135', '\n']);
  assert.match(await g.frame.locator('.feedback').innerText(), /Correct! 945 ÷ 7 = 135\b/);
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('the area model for division goes on by itself too, and its remainder is written in', { skip, timeout: 90e3 }, async () => {
  const g = await openGame({ set: { k: 'divide', p: [[97, 4]], l: 'guided', m: 'area' } });
  await start(g);
  await type(g, ['20']);
  assert.equal((await focused(g)).label, 'Product, step 1');
  await type(g, ['80', '17', '4', '16', '1']);
  assert.equal(await g.frame.locator('input[data-field="remainder"]').inputValue(), '1');
  assert.equal((await focused(g)).label, 'Quotient');
  await g.ctx.close();
});

test('multiplication: every product is typed whole in its column’s box, the last one too', { skip, timeout: 60e3 }, async () => {
  const g = await openGame({ set: { k: 'multiply', p: [[46, 3]], l: 'guided' } });
  await start(g);
  assert.equal((await focused(g)).box, 'a0', '3 × 6 starts in the ones box');
  await type(g, ['18']);
  await g.frame.waitForFunction(() => document.querySelector('input[data-box="ac1"]')?.value === '1', null, { timeout: 5000 }).catch(() => assert.fail('its tens go up as the carry'));
  assert.equal((await focused(g)).box, 'a1', '3 × 4 + 1 starts in the tens box, as 18 did in the ones box (not in the hundreds)');
  await type(g, ['13']);
  await g.frame.waitForFunction(() => document.querySelector('input[data-box="a2"]')?.value === '1', null, { timeout: 5000 }).catch(() => assert.fail('the tens move on'));
  assert.equal(await g.frame.locator('input[data-box="a1"]').inputValue(), '3');
  assert.equal(await g.frame.locator('input[data-box="a2"]').inputValue(), '1', 'its tens move on into the box on the left');
  await type(g, ['\n']);
  assert.match(await g.frame.locator('.feedback').innerText(), /Correct! 46 × 3 = 138/);
  await g.ctx.close();
});

test('accessible names: a part’s box and line by their product, never "NaN" or a bare "Box"; a decimal point is valid', { skip, timeout: 60e3 }, async () => {
  const labels = async (set) => {
    const g = await openGame({ set });
    await start(g);
    await g.page.waitForTimeout(200);
    const all = await g.frame.locator('input').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    await g.ctx.close();
    return all;
  };
  const pp = await labels({ k: 'multiply', p: [[46, 23]], l: 'onMyOwn', m: 'partial' });
  assert.deepEqual(pp, ['Line for 3 × 6', 'Line for 3 × 40', 'Line for 20 × 6', 'Line for 20 × 40', 'Total']);
  const area = await labels({ k: 'multiply', p: [[46, 23]], l: 'onMyOwn', m: 'area' });
  assert.deepEqual(area, ['Box for 40 × 20', 'Box for 6 × 20', 'Box for 40 × 3', 'Box for 6 × 3', 'Total']);
  const lad = await labels({ k: 'divide', p: [[945, 7]], l: 'onMyOwn', m: 'ladder' });
  for (const l of [...pp, ...area, ...lad]) {
    assert.doesNotMatch(l, /NaN/);
    assert.notEqual(l, 'Box');
  }
  // 9.72 ÷ 9: the decimal point typed in its box is a valid value (it was [invalid] to a screen reader)
  const g = await openGame({ set: { k: 'divide', p: [[9.72, 9]], l: 'onMyOwn', dec: 1 } });
  await start(g);
  const point = g.frame.locator('input.point').first();
  assert.equal(await point.count(), 1);
  assert.equal(await point.evaluate((el) => { el.value = '.'; return el.checkValidity(); }), true);
  await g.ctx.close();
  const d = await openGame({ set: { k: 'divide', p: [[7.5, 3]], l: 'onMyOwn', m: 'area', dec: 1 } });
  await start(d);
  assert.equal(await d.frame.locator('input[data-field="q0"]').evaluate((el) => { el.value = '0.5'; return el.checkValidity(); }), true);
  await d.ctx.close();
});

test('partial products: a 0 digit keeps its line (9 × 0 = 0), and the next question says why it’s written', { skip, timeout: 60e3 }, async () => {
  const g = await openGame({ set: { k: 'multiply', p: [[610, 9]], l: 'guided', m: 'partial' } });
  await start(g);
  assert.equal(await prompt(g), '9 × 0 is 0, so its line is written for you. What is 9 × 10?');
  assert.equal(await g.frame.locator('.pp .zero-label').innerText(), '9 × 0 = 0');
  assert.equal(await g.frame.locator('.pp .zero-line').innerText(), '0');
  await type(g, ['90', '5400', '5490']);
  await type(g, ['\n']);
  assert.match(await g.frame.locator('.feedback').innerText(), /Correct! 610 × 9 = 5490/);
  await g.ctx.close();
});

test('steps fixed on the way are counted: the end screen says so, and the score carries them to the teacher', { skip, timeout: 60e3 }, async () => {
  const g = await openGame({ set: { k: 'multiply', p: [[27, 2]], l: 'guided' } });
  await start(g);
  // 2 × 7 is 14, not 15: Guided marks it at once, and it is put right
  await type(g, ['15']);
  await g.frame.locator('input.wrong').first().waitFor();
  await type(g, ['14']);
  await g.frame.waitForFunction(() => document.activeElement?.dataset?.box === 'a1');
  await type(g, ['5', '\n']);
  assert.match(await g.frame.locator('.feedback').innerText(), /Correct!/);
  await g.frame.locator('.feedback .btn-primary').click();
  // (the wrong digit was this problem's wrong try: Guided counts it in Wrong, audit 4)
  assert.match(await g.frame.locator('.final').innerText(), /You got 0 right and 1 wrong\./);
  assert.equal(await g.frame.locator('.fixes').innerText(), 'You fixed 1 step along the way.');
  await g.page.waitForFunction(() => window.__msgs.some((m) => m.type === 'brb:score'));
  assert.deepEqual((await g.msgs('brb:score')).map((m) => [m.score, m.label]), [[0, 'fixes:1']], 'the label the progress page reads as "1 step fix"');
  assert.deepEqual((await g.msgs('brb:gameover')).map((m) => m.score), [0]);
  await g.ctx.close();
});

test('leaving a set half done asks first in the page’s own dialog; Keep going stays, Leave the set leaves', { skip, timeout: 90e3 }, async () => {
  const g = await openGame({});
  let native = 0;
  g.page.on('dialog', (d) => { native++; d.dismiss(); });
  await g.frame.getByRole('button', { name: /I’m a student/ }).click();
  await g.frame.getByRole('button', { name: 'Start practicing ▸' }).click();
  await start(g);
  await type(g, ['1']);
  await g.frame.getByRole('button', { name: '← Practice' }).click();
  const dlg = g.frame.locator('dialog.confirm[open]');
  await dlg.waitFor();
  assert.equal(await dlg.getByRole('heading').innerText(), 'Leave this set?');
  assert.match(await dlg.innerText(), /You’ve done 0 of 5 problems\. If you leave now, this set ends and isn’t kept\./);
  await dlg.getByRole('button', { name: 'Keep going' }).click();
  assert.equal(await g.frame.locator('dialog.confirm[open]').count(), 0);
  assert.ok(await g.frame.getByRole('button', { name: 'Check', exact: true }).isVisible(), 'still in the set');
  await g.frame.getByRole('button', { name: '← Practice' }).click();
  await g.frame.locator('dialog.confirm[open]').getByRole('button', { name: 'Leave the set' }).click();
  await g.frame.getByRole('heading', { name: 'Practice on your own' }).waitFor();
  assert.equal(native, 0, 'never confirm() or alert()');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

for (const set of [{ k: 'divide', p: [[945, 7]], l: 'onMyOwn', m: 'ladder' }, { k: 'divide', p: [[96, 4]], l: 'onMyOwn' }, { k: 'multiply', p: [[46, 3]], l: 'onMyOwn' }])
  test(`Give up? Show the answer, after a Check that didn’t pass: ${set.m ?? 'standard'} ${set.k}`, { skip, timeout: 60e3 }, async () => {
    const g = await openGame({ set });
    await start(g);
    const keys = set.m ? ['100', '700', '245', '35', '245', '0', '136'] : set.k === 'divide' ? ['2', '8', '1', '6', '5', '1', '6', '0'] : ['18', '14'];
    await type(g, keys);
    await g.frame.getByRole('button', { name: 'Check', exact: true }).click();
    assert.match(await g.frame.locator('.feedback').innerText(), /Not quite\./);
    await g.frame.getByRole('button', { name: 'Give up? Show the answer' }).click();
    const answer = set.m ? '135' : set.k === 'divide' ? '24' : '138';
    assert.match(await g.frame.locator('.feedback').innerText(), new RegExp(`The answer is ${answer}\\.`));
    await g.frame.locator('.feedback .btn-primary').click();
    assert.match(await g.frame.locator('.final').innerText(), /0 right and 1 wrong/, 'it counts as wrong');
    await g.ctx.close();
  });

test('decimals: multiplication’s start screen works a decimal example, not 46 = 40 + 6', { skip, timeout: 60e3 }, async () => {
  const area = await openGame({ set: { k: 'multiply', p: [[2.3, 1.4]], l: 'guided', m: 'area', dec: 1 } });
  const steps = await area.frame.locator('.steps').innerText();
  assert.match(steps, /2\.3 is 2 \+ 0\.3, and 1\.4 is 1 \+ 0\.4/);
  assert.doesNotMatch(steps, /46/);
  await area.ctx.close();
  const std = await openGame({ set: { k: 'multiply', p: [[2.3, 1.4]], l: 'guided', dec: 1 } });
  assert.match(await std.frame.locator('.steps').innerText(), /2\.3 × 1\.4 has 2, so 322 becomes 3\.22/);
  await std.ctx.close();
  const whole = await openGame({ set: { k: 'multiply', p: [[46, 23]], l: 'guided', m: 'area' } });
  assert.match(await whole.frame.locator('.steps').innerText(), /46 is 40 \+ 6/, 'whole numbers keep theirs');
  await whole.ctx.close();
});

// ---------------------------------------------------------------- teachers
const teacherGame = (o = {}) => openGame({ canAssign: true, mySets: true, ...o });
async function newActivity(g) {
  await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await g.frame.getByRole('button', { name: 'New activity' }).click();
  await g.frame.getByRole('menuitem').first().click();
}

test('the editor’s way back is a labeled "Your activities", and it stays in the game', { skip, timeout: 60e3 }, async () => {
  const g = await teacherGame();
  await newActivity(g);
  const back = g.frame.locator('.back-list');
  assert.equal((await back.innerText()).trim(), 'Your activities', 'the words show, not an arrow alone beside the title');
  const box = await back.boundingBox();
  assert.ok(box && box.width >= 80 && box.height >= 36, JSON.stringify(box));
  await back.click();
  await g.frame.getByRole('heading', { name: 'Your activities' }).waitFor();
  assert.equal(g.page.url(), 'http://game.invalid/', 'the page itself is where it was');
  await g.ctx.close();
});

test('Save on an activity students may have asks first: save for everyone, or save as a copy', { skip, timeout: 90e3 }, async () => {
  const g = await teacherGame();
  let native = 0;
  g.page.on('dialog', (d) => { native++; d.dismiss(); });
  await newActivity(g);
  await g.frame.getByRole('textbox', { name: /title/i }).fill('4b math - Long division test');
  const save = g.frame.locator('.save-bar .btn-primary');
  await save.click();
  await g.frame.locator('.save-bar').getByText('Saved', { exact: true }).waitFor();
  assert.equal((await g.msgs('brb:set-save')).length, 1, 'the first save asks nothing');
  // the mode changes after it was saved (and maybe assigned)
  await g.frame.getByRole('radio', { name: 'Watch' }).click();
  await save.click();
  const dlg = g.frame.locator('dialog.confirm[open]');
  await dlg.waitFor();
  assert.equal(await dlg.getByRole('heading').innerText(), 'Students may already have this activity');
  assert.match(await dlg.innerText(), /its class code, its link and any class it’s assigned to get these changes, the mode too/);
  assert.deepEqual(await dlg.locator('button').allInnerTexts(), ['Cancel', 'Save for everyone', 'Save as a copy']);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await g.msgs('brb:set-save')).length, 1, 'Cancel saves nothing');
  // as a copy: a new activity with its own link, and this one stays as students have it
  await save.click();
  await g.frame.locator('dialog.confirm[open]').getByRole('button', { name: 'Save as a copy' }).click();
  await g.frame.locator('.save-bar').getByText('Saved', { exact: true }).waitFor();
  const saves = await g.msgs('brb:set-save');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].set, null, 'the copy is a new set');
  assert.equal(saves[1].items[0].l, 'watch');
  assert.equal(await g.frame.getByRole('textbox', { name: /title/i }).inputValue(), '4b math - Long division test (copy)');
  await g.frame.locator('.back-list').click();
  const cards = await g.frame.locator('.card .meta').allInnerTexts();
  assert.equal(cards.length, 2);
  assert.ok(cards.some((c) => /Watch/.test(c)) && cards.some((c) => /Guided/.test(c)), `the copy has Watch, the original Guided again: ${cards}`);
  // for everyone: the same set, saved again
  await g.frame.locator('.card .open').filter({ hasText: '4b math - Long division test' }).filter({ hasNotText: '(copy)' }).click();
  await g.frame.getByRole('radio', { name: 'On my own' }).click();
  await save.click();
  await g.frame.locator('dialog.confirm[open]').getByRole('button', { name: 'Save for everyone' }).click();
  await g.frame.locator('.save-bar').getByText('Saved', { exact: true }).waitFor();
  const all = await g.msgs('brb:set-save');
  assert.equal(all.at(-1).set, saves[0].set ?? all.at(-1).set);
  assert.match(all.at(-1).set, /^s-saved\d{5}$/, 'saved under its own link again');
  assert.equal(all.at(-1).items[0].l, 'onMyOwn');
  assert.equal(native, 0, 'never confirm() or alert()');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('opened from an Assign button: Your activities says what to do, New activity is open, and Save and assign assigns', { skip, timeout: 90e3 }, async () => {
  const g = await teacherGame({ params: { mode: 'assign' } });
  assert.equal(await g.frame.locator('.assign-first').innerText(), 'Choose an activity to assign, or make a new one. Set it up, then press Save and assign.');
  assert.ok(await g.frame.getByRole('menuitem').first().isVisible(), 'the New activity menu is open');
  await g.frame.getByRole('menuitem').first().click();
  const save = g.frame.locator('.save-bar .btn-primary');
  assert.equal((await save.innerText()).trim(), 'Save and assign');
  await save.click();
  await g.page.waitForFunction(() => window.__msgs.some((m) => m.type === 'brb:assign'));
  const set = (await g.msgs('brb:set-save'))[0];
  assert.ok(set, 'saved first');
  const id = (await g.msgs('brb:assign'))[0].opts;
  assert.match(id, /^chapter=s-saved\d{5}&lock=1$/, 'then the Assign page for it');
  await g.ctx.close();
});

// ---------------------------------------------------------------- phones
const SCREENS = [
  { name: 'long division', set: { k: 'divide', p: [[9216, 8]], l: 'guided' }, keys: ['1', '8', '1'] },
  { name: 'multiplication', set: { k: 'multiply', p: [[4612, 937]], l: 'guided' }, keys: ['14'] },
  { name: 'ladder', set: { k: 'divide', p: [[945, 7]], l: 'guided', m: 'ladder' }, keys: ['100', '700', '245'] },
  { name: 'area division', set: { k: 'divide', p: [[9450, 7]], l: 'guided', m: 'area' }, keys: ['1000', '7000', '2450'] },
  { name: 'area multiplication', set: { k: 'multiply', p: [[4612, 937]], l: 'guided', m: 'area' }, keys: ['3600000'] },
  { name: 'partial products', set: { k: 'multiply', p: [[610, 97]], l: 'guided', m: 'partial' }, keys: [] },
  { name: 'feedback', set: { k: 'multiply', p: [[46, 23]], l: 'onMyOwn', m: 'area' }, keys: ['800', '120', '120', '19', '1059'], check: true },
  { name: 'teacher editor', teacher: true },
  { name: 'teacher home', home: true }
];
/** Anything that pokes out past the screen's edge (inside the paper that scrolls on purpose, or the graph paper, aside). */
const overflow = (g) => g.frame.evaluate(() => {
  const W = innerWidth, out = [];
  if (document.documentElement.scrollWidth > W + 1) out.push(`page ${document.documentElement.scrollWidth} > ${W}`);
  const scrolls = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(e).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('.graph, dialog:not([open])')) continue;
    if ((r.right > W + 1 || r.left < -1) && !scrolls(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return out.slice(0, 6);
});
for (const [width, height] of [[390, 844], [320, 568]])
  for (const s of SCREENS)
    test(`on a ${width} wide phone, light and dark: ${s.name} fits`, { skip, timeout: 90e3 }, async () => {
      for (const dark of [false, true]) {
        const g = s.teacher || s.home ? await teacherGame({ width, height, dark }) : await openGame({ set: s.set, width, height, dark });
        if (s.home) {
          // Your activities with My worksheets and New activity side by side: the menu opens on the screen; a card's
          // ⋯ then Open goes to its editor (the 19 Nov fix, kept)
          await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
          await g.frame.getByRole('button', { name: 'New activity' }).click();
          await g.page.waitForTimeout(200);
          assert.deepEqual(await overflow(g), [], `the New activity menu${dark ? ' dark' : ''}`);
          await g.frame.getByRole('menuitem').first().click();
          // (a new activity is kept once something about it changes: audit 4)
          await g.frame.getByRole('textbox', { name: /title/i }).fill('Long division test');
          await g.frame.locator('.back-list').click();
          await g.frame.getByRole('button', { name: /^More/ }).first().click();
          await g.frame.getByRole('menuitem', { name: 'Open' }).click();
          await g.frame.locator('.back-list').waitFor();
          await g.frame.locator('.back-list').click();
        } else if (s.teacher) {
          await newActivity(g);
          assert.deepEqual(await overflow(g), [], `${s.name}${dark ? ' dark' : ''}`);
          await g.frame.getByRole('button', { name: 'Share' }).click();
        } else {
          await start(g);
          await type(g, s.keys);
          if (s.check) await g.frame.getByRole('button', { name: 'Check', exact: true }).click();
        }
        await g.page.waitForTimeout(300);
        assert.deepEqual(await overflow(g), [], `${s.name}${dark ? ' dark' : ''}`);
        assert.deepEqual(g.errors, []);
        await g.ctx.close();
      }
    });
