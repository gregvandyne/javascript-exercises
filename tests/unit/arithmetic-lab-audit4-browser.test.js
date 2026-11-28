// Arithmetic Lab, the owner's fourth audit (docs/decisions.md "Arithmetic Lab: audit 4 fixes"), in the production frame
// (tests/unit/_box-frame.js), on a desktop:
//   - 8.13: a saved activity worked by another method than the standard one (the ladder, an area model) opens again
//     from Your activities (its card, Enter, Space, More then Open), and its preview's See the score and Back to the
//     editor work (the editor threw for every such method: a tab named t hid the words' t);
//   - a new activity is kept only once something about it changes (opening the editor and leaving makes no blank card),
//     and the New activity menu opened by an Assign button opens once, never again by itself after a reload;
//   - a fresh editor opened from an Assign button has a plain Save beside Save and assign, and saving it again asks
//     first (students may have it);
//   - 8.3: a problem's field takes any number within the activity's limits (610 in a top range of 10 to 99), the range
//     grows to take it in and says so, and a full field says why it takes no more digits;
//   - 8.6: leaving a started set always asks first, typed in or not;
//   - 8.4: Guided counts a wrong digit as the problem's wrong try (Wrong, and the score), the feedback as friendly;
//   - Job 4: each settled problem reports its progress (BRB.setProgress), the last one before See the score.
// Skipped with no Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, closeBrowser, skip } from './_box-frame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));
test.after(closeBrowser);

const KEY = 'box-by-box-activities-v1';
const teacher = (o = {}) => openGame({ phone: false, canAssign: true, ...o });
const saved = (g) => g.frame.evaluate((k) => window.BRB.storage.get(k), KEY);
async function make(g, kind, { method, title } = {}) {
  await g.frame.getByRole('button', { name: 'New activity' }).click();
  await g.frame.getByRole('menuitem', { name: new RegExp(kind) }).click();
  if (method) await g.frame.locator('.method-list [role=radio]').filter({ hasText: method }).click();
  if (title) await g.frame.getByRole('textbox', { name: /title/i }).fill(title);
}
const inEditor = (g, title) => g.frame.getByRole('textbox', { name: /title/i }).inputValue().then((v) => assert.equal(v, title));
const toList = async (g) => { await g.frame.locator('.back-list').click(); await g.frame.getByRole('heading', { name: 'Your activities' }).waitFor(); };

test('8.13: activities worked by the ladder or an area model open again from Your activities, every way', { skip, timeout: 120e3 }, async () => {
  const g = await teacher();
  await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await make(g, 'Long division', { method: 'Ladder', title: 'Ladder 467' });
  await toList(g);
  await make(g, 'Multiplication', { method: 'Area model', title: 'Area 46' });
  await toList(g);
  await make(g, 'Multiplication', { method: 'Partial products', title: 'Partial 610' });
  await toList(g);
  const card = (t) => g.frame.locator('.card').filter({ hasText: t });
  for (const t of ['Ladder 467', 'Area 46', 'Partial 610']) {
    await card(t).locator('.open').click();
    await inEditor(g, t);
    await toList(g);
    await card(t).locator('.open').focus();
    await g.page.keyboard.press('Enter');
    await inEditor(g, t);
    await toList(g);
    await card(t).locator('.open').focus();
    await g.page.keyboard.press(' ');
    await inEditor(g, t);
    await toList(g);
    await card(t).getByRole('button', { name: /^More/ }).click();
    await g.frame.getByRole('menuitem', { name: 'Open' }).click();
    await inEditor(g, t);
    await toList(g);
  }
  // after a reload (the game opened again with the same save): the same
  const again = await teacher({ saveData: { [KEY]: JSON.stringify(await saved(g)) } });
  await again.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await again.frame.locator('.card').filter({ hasText: 'Ladder 467' }).locator('.open').click();
  await inEditor(again, 'Ladder 467');
  assert.deepEqual(g.errors, []);
  assert.deepEqual(again.errors, []);
  await g.ctx.close();
  await again.ctx.close();
});

test('8.13: a ladder activity\'s preview: See the score, then Back to the editor, both work', { skip, timeout: 120e3 }, async () => {
  const g = await teacher();
  await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await make(g, 'Long division', { method: 'Ladder', title: 'Ladder preview' });
  const how = g.frame.locator('.count input');
  await how.fill('1');
  await how.press('Enter');
  await g.frame.getByRole('radio', { name: 'On my own', exact: true }).click();
  await g.frame.getByRole('button', { name: /Try it/ }).click();
  await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
  // every field a 1: Check, then Give up, then See the score
  for (const el of await g.frame.locator('input[data-field]:not([disabled]):not([readonly])').all()) await el.fill('1').catch(() => {});
  await g.frame.getByRole('button', { name: 'Check', exact: true }).click();
  await g.frame.getByRole('button', { name: /Give up/ }).click();
  await g.frame.getByRole('button', { name: 'See the score' }).click();
  await g.frame.getByRole('heading', { name: 'All done!' }).waitFor({ timeout: 5000 });
  await g.frame.getByRole('button', { name: /Back to the editor/ }).click();
  await inEditor(g, 'Ladder preview');
  assert.deepEqual(await g.msgs('brb:progress'), [], 'a preview reports nothing');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('a new activity is kept once it changes; the Assign button\'s New activity menu opens once, never by itself again', { skip, timeout: 120e3 }, async () => {
  const g = await teacher({ params: { mode: 'assign' } });
  assert.ok(await g.frame.getByRole('menuitem').first().isVisible(), 'opened from Assign: the menu is open the first time');
  await g.frame.getByRole('menuitem', { name: /Long division/ }).click();
  await g.frame.getByRole('textbox', { name: /title/i }).waitFor();
  assert.deepEqual((await saved(g)) ?? [], [], 'opening the editor saves nothing');
  await toList(g);
  assert.equal(await g.frame.locator('.card').count(), 0, 'no blank Long division card');
  assert.equal(await g.frame.getByRole('menuitem').count(), 0, 'and the menu stays closed back on the list');
  // a change keeps it
  await make(g, 'Long division');
  await g.frame.getByRole('radio', { name: 'Watch', exact: true }).click();
  assert.equal((await saved(g)).length, 1, 'the mode changed: saved');
  await toList(g);
  assert.equal(await g.frame.locator('.card').count(), 1);
  // opened again (a reload, or Back from the Assign page): the menu stays closed
  await g.page.waitForTimeout(300);
  const save = await g.frame.evaluate(() => Object.fromEntries(['box-by-box-activities-v1', 'box-by-box-assign-menu-v1'].map((k) => [k, JSON.stringify(window.BRB.storage.get(k))])));
  assert.equal(save['box-by-box-assign-menu-v1'], 'true');
  const again = await teacher({ params: { mode: 'assign' }, saveData: save });
  await again.frame.getByRole('heading', { name: 'Your activities' }).waitFor();
  await again.page.waitForTimeout(300);
  assert.equal(await again.frame.getByRole('menuitem').count(), 0, 'not open by itself after a reload');
  assert.equal(await again.frame.locator('.assign-first').count(), 1, 'the line still says what to do');
  assert.equal(await again.frame.locator('.card').count(), 1);
  assert.deepEqual([...g.errors, ...again.errors], []);
  await g.ctx.close();
  await again.ctx.close();
});

test('a fresh editor from an Assign button has Save beside Save and assign; saving an activity students may have asks first', { skip, timeout: 120e3 }, async () => {
  const g = await teacher({ params: { mode: 'assign' } });
  await g.frame.getByRole('menuitem', { name: /Long division/ }).click();
  const bar = g.frame.locator('.save-bar');
  assert.deepEqual((await bar.locator('button').allInnerTexts()).map((x) => x.trim()), ['Save and assign', 'Save']);
  await bar.getByRole('button', { name: 'Save', exact: true }).click();
  await bar.getByText('Saved', { exact: true }).waitFor();
  assert.equal((await g.msgs('brb:set-save')).length, 1, 'saved on Oomba');
  assert.equal((await g.msgs('brb:assign')).length, 0, 'and not assigned');
  assert.equal((await saved(g)).length, 1, 'in Your activities');
  // changed after it was saved: Save changes asks first
  await g.frame.getByRole('radio', { name: 'Watch', exact: true }).click();
  await bar.getByRole('button', { name: 'Save changes' }).click();
  const dlg = g.frame.locator('dialog.confirm[open]');
  await dlg.waitFor();
  assert.equal(await dlg.getByRole('heading').innerText(), 'Students may already have this activity');
  assert.deepEqual(await dlg.locator('button').allInnerTexts(), ['Cancel', 'Save for everyone', 'Save as a copy']);
  await dlg.getByRole('button', { name: 'Save for everyone' }).click();
  await bar.getByText('Saved', { exact: true }).waitFor();
  const saves = await g.msgs('brb:set-save');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].set, 's-saved00001', 'under the same link');
  assert.equal((await g.msgs('brb:assign')).length, 0);
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('8.3: a problem takes any number within the limits; the range grows to take it in, and a full field says why', { skip, timeout: 90e3 }, async () => {
  const g = await teacher();
  await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await make(g, 'Multiplication');
  const top = g.frame.getByRole('textbox', { name: 'Problem 1: top number' });
  const bottom = g.frame.getByRole('textbox', { name: 'Problem 1: bottom number' });
  const range = (name) => g.frame.getByRole('group', { name, exact: true }).locator('input').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(await range('Top number'), ['10', '99']);
  await top.click();
  await g.page.keyboard.type('610');
  assert.equal(await top.inputValue(), '610', 'never cut to 61');
  assert.equal(await g.frame.locator('.field-note').innerText(), 'Top number now goes from 10 to 999, so your problem fits. New problems use this range too.');
  await bottom.click();
  await g.page.keyboard.type('9');
  assert.equal(await bottom.inputValue(), '9');
  assert.equal(await g.frame.locator('.tile.faulty').count(), 0, '610 × 9 is a problem');
  assert.deepEqual(await range('Top number'), ['10', '999'], 'the top range takes in three digits');
  assert.deepEqual(await range('Bottom number'), ['2', '99'], 'the bottom one from 2');
  assert.equal(await g.frame.locator('.field-note').innerText(), 'Bottom number now goes from 2 to 99, so your problem fits. New problems use this range too.');
  const a = (await saved(g))[0];
  assert.deepEqual([a.problems[0], a.plan.tops, a.plan.bottoms], [[610, 9], [10, 999], [2, 99]]);
  // the activity's own limit: 4 digits on top
  await top.click();
  await g.page.keyboard.press('End');
  await g.page.keyboard.type('0');
  assert.equal(await top.inputValue(), '6100');
  await top.click();
  await g.page.keyboard.press('End');
  await g.page.keyboard.type('5');
  assert.equal(await top.inputValue(), '6100');
  assert.equal(await g.frame.locator('.field-note').innerText(), 'Top number can have at most 4 digits (up to 9999).');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('8.6: leaving a started set always asks first, before anything is typed too', { skip, timeout: 90e3 }, async () => {
  const g = await openGame({ phone: false });
  await g.frame.getByRole('button', { name: /I’m a student/ }).click();
  for (let i = 0; i < 3; i++) {
    await g.frame.getByRole('button', { name: 'Start practicing ▸' }).click();
    await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
    await g.frame.getByRole('button', { name: '← Practice' }).click();
    const dlg = g.frame.locator('dialog.confirm[open]');
    await dlg.waitFor({ timeout: 5000 });
    assert.match(await dlg.innerText(), /You’ve done 0 of 5 problems/, `time ${i + 1}`);
    await dlg.getByRole('button', { name: 'Leave the set' }).click();
    await g.frame.getByRole('heading', { name: 'Practice on your own' }).waitFor();
  }
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

/** Type the problem's right digits, box by box, as Guided asks for them (Bring down when it asks), until it is checked. */
async function solve(g, sheet, { wrongFirst = false } = {}) {
  const right = L.correctValues(sheet);
  let wrong = wrongFirst;
  for (let n = 0; n < 60; n++) {
    if (await g.frame.locator('.feedback').count()) return;
    if (await g.frame.locator('button.bring').count()) { await g.page.keyboard.press('Enter'); await g.page.waitForTimeout(250); continue; }
    const box = await g.frame.evaluate(() => document.activeElement?.dataset?.box ?? '');
    if (!box) { await g.page.waitForTimeout(150); if (await g.frame.getByRole('button', { name: 'Check', exact: true }).isEnabled().catch(() => false)) await g.frame.getByRole('button', { name: 'Check', exact: true }).click(); continue; }
    const d = right[box];
    if (wrong) { wrong = false; await g.page.keyboard.type(String((Number(d) + 1) % 10)); await g.frame.locator('input.wrong').first().waitFor(); }
    await g.page.keyboard.type(d);
    await g.page.waitForTimeout(150);
  }
  assert.fail('the problem was never checked');
}

test('8.4 and Job 4: Guided counts a wrong digit as the problem\'s wrong try; each problem reports its progress, the last before See the score', { skip, timeout: 120e3 }, async () => {
  const item = { k: 'divide', p: [[84, 4], [96, 3]], l: 'guided' };
  const act = L.parseItem(item);
  const g = await openGame({ phone: false, set: item });
  await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
  await solve(g, L.sheetFor(act, [84, 4]), { wrongFirst: true });
  assert.match(await g.frame.locator('.feedback').innerText(), /Correct!/, 'the feedback as friendly as ever');
  assert.equal((await g.frame.locator('.chip.bad').innerText()).trim(), '1', 'the wrong digit is the wrong try');
  assert.equal((await g.frame.locator('.chip.good').innerText()).trim(), '0');
  await g.page.waitForFunction(() => window.__msgs.some((m) => m.type === 'brb:progress'));
  assert.deepEqual((await g.msgs('brb:progress')).map(({ done, total, score, label }) => ({ done, total, score, label })), [{ done: 1, total: 2, score: 0, label: 'fixes:1' }]);
  await g.frame.locator('.feedback .btn-primary').click();
  await solve(g, L.sheetFor(act, [96, 3]));
  assert.equal((await g.frame.locator('.chip.good').innerText()).trim(), '1');
  await g.page.waitForFunction(() => window.__msgs.filter((m) => m.type === 'brb:progress').length === 2);
  // the last problem is in before See the score is pressed: a student who leaves now still finishes the step
  assert.deepEqual((await g.msgs('brb:progress'))[1].done, 2);
  assert.deepEqual((await g.msgs('brb:progress')).map((m) => [m.done, m.total, m.score]), [[1, 2, 0], [2, 2, 1]]);
  assert.equal((await g.msgs('brb:gameover')).length, 0, 'no end yet');
  await g.frame.getByRole('button', { name: 'See the score' }).click();
  assert.match(await g.frame.locator('.final').innerText(), /You got 1 right and 1 wrong\./);
  await g.page.waitForFunction(() => window.__msgs.some((m) => m.type === 'brb:score'));
  assert.deepEqual((await g.msgs('brb:score')).map((m) => [m.score, m.label]), [[1, 'fixes:1']]);
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('Job 4: the ladder in Watch reports each problem as it is shown to the end, the last before Done', { skip, timeout: 120e3 }, async () => {
  const g = await openGame({ phone: false, set: { k: 'divide', p: [[467, 5], [92, 4]], l: 'watch', m: 'ladder' } });
  await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
  for (let n = 0; n < 200 && (await g.msgs('brb:progress')).length < 2; n++) {
    const next = g.frame.locator('.actions .btn-primary').first();
    if (/Done/.test(await next.innerText().catch(() => ''))) break;
    await next.click().catch(() => {});
    await g.page.waitForTimeout(40);
  }
  await g.page.waitForFunction(() => window.__msgs.filter((m) => m.type === 'brb:progress').length === 2, null, { timeout: 10e3 });
  assert.deepEqual((await g.msgs('brb:progress')).map((m) => [m.done, m.total]), [[1, 2], [2, 2]]);
  assert.equal((await g.msgs('brb:gameover')).length, 0, 'Done not pressed yet');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});
