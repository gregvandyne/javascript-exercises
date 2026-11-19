// Builder part 2 in a browser: the Studio's Activity panel (reorder a problem with the keyboard, edit one, Undo, Save
// makes a new version labelled with the change, no Builder message) and Oomba Canvas 1.3.0's teacher controls (the bar at
// 561 px and wider, one Teacher button below; Show answer counts the problem neither right nor wrong and the result says
// helped; Board mode sends no score; a student never sees them).
import { test, expect } from '@playwright/test';
import { canvasTag } from '../../server/services/canvaskit.js';
import { teacherSignup, templateGame, studioState } from './helpers.js';

const page$ = (base, activity, canTeach) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canvas</title>
<script>window.__over=[];window.BRB={canTeach:${canTeach},user:{lang:'en',dir:'ltr'},theme:'light',storage:{_:{},get(k){return this._[k]},set(k,v){this._[k]=JSON.parse(JSON.stringify(v))}},gameOver(o){window.__over.push(o)},sfx:{play(){}}};</script>
${canvasTag().replace('src="/', `src="${base}/`)}</head><body><div id="oc-app"></div><script type="application/json" id="oc-activity">${JSON.stringify(activity)}</script>
<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script></body></html>`;
const LINES = { config: { support: 'guided', supports: ['guided', 'own'] }, task: { title: 'Lines' },
  problems: [{ tool: 'numberline.point', at: [3, 4], lo: 0, hi: 1, sub: 4 }, { tool: 'numberline.point', at: [1, 4], lo: 0, hi: 1, sub: 4 }] };

test('teacher controls: Show answer is not counted and the result is marked helped; board mode sends nothing', async ({ page, baseURL }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/health');
  await page.setContent(page$(baseURL, LINES, true), { waitUntil: 'load' });
  const bar = page.locator('.oc-tb');
  await expect(bar).toBeVisible(); await expect(page.locator('.oc-tbtn')).toBeHidden();
  await expect(page.locator('.oc-strip .oc-modes')).toBeHidden();   // the teacher's Help replaces the students' switcher
  await bar.getByRole('button', { name: /Show answer/ }).click();
  await expect(page.locator('.oc-fb.oc-tans')).toContainText('Answer shown by the teacher. This one is not counted.');
  await expect(page.locator('.oc-no')).toHaveText('✗ 0'); await expect(page.locator('.oc-ok')).toHaveText('✓ 0');
  await expect(page.locator('.oc-tick.oc-on')).toHaveCount(1);
  await page.click('.oc-primary');   // Next
  await page.click('.oc-tick[aria-label="1/4 + 0"]'); await page.click('.oc-primary'); await page.click('.oc-primary');
  expect(await page.evaluate(() => window.__over)).toEqual([{ won: true, score: 1, helped: true }]);
  // Help on this screen: any of the four, for this screen only
  await page.click('.oc-end .oc-primary');
  await bar.getByRole('button', { name: 'Watch' }).click();
  await expect(bar.getByRole('button', { name: 'Watch' })).toHaveAttribute('aria-pressed', 'true');
  // Board mode: big type, Back / n of N / Next, no ✓ ✗, and no score at the end
  await bar.getByRole('button', { name: /Board mode/ }).click();
  await expect(page.locator('.oc-bchip')).toContainText('Board mode · no scores sent');
  await expect(page.locator('.oc-ok')).toBeHidden();
  await expect(page.locator('.oc-bnav b')).toHaveText('1 of 2');
  await page.locator('.oc-bnav button').last().click(); await page.locator('.oc-bnav button').last().click();
  await expect(page.locator('.oc-end')).toBeVisible();
  expect(await page.evaluate(() => window.__over.length)).toBe(1);
  // New set: off, with its note, when there is no generator
  await expect(bar.getByRole('button', { name: /New set/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('teacher controls: one Teacher button and a sheet on a phone; nothing at all for a student', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/health');
  await page.setContent(page$(baseURL, LINES, true), { waitUntil: 'load' });
  await expect(page.locator('.oc-tb')).toBeHidden();
  await page.click('.oc-tbtn');
  const menu = page.getByRole('dialog', { name: 'Teacher' });
  await expect(menu).toBeVisible(); await expect(menu).toContainText('Only you see this. Students never do.');
  await menu.getByRole('button', { name: /Show answer/ }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('.oc-fb.oc-tans')).toBeVisible();
  await page.setContent(page$(baseURL, LINES, false), { waitUntil: 'load' });
  await expect(page.locator('.oc-task')).toBeVisible();
  await expect(page.locator('.oc-tb, .oc-tbtn, .oc-tmenu')).toHaveCount(0);
});

test('the Studio\'s Activity panel: move a problem with the keyboard, Undo, Save makes a labelled version with no Builder turn', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await teacherSignup(page);
  const g = await templateGame(page, { template: 'canvas' });
  const id = g.id || (await studioState(page, new URL(page.url()).pathname.split('/').pop())).game.id;
  const before = await studioState(page, id);
  expect(before.activity.data.problems.length).toBeGreaterThan(2);
  await page.click('#ap-tab-a');
  await expect(page.locator('#st-activity .ap-row')).toHaveCount(before.activity.data.problems.length);
  const second = await page.locator('.ap-row[data-i="1"] .ap-t b').textContent();
  await page.focus('.ap-row[data-i="1"] .ap-grip'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.ap-row[data-i="0"] .ap-t b')).toHaveText(second);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.ap-row[data-i="1"] .ap-t b')).toHaveText(second);
  await page.focus('.ap-row[data-i="1"] .ap-grip'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.ap-sum')).toContainText('Problem 2 moved up');
  // unsaved changes hold the Builder back
  await page.click('#ap-tab-b'); await page.fill('#st-input', 'Make it blue'); await page.click('#st-send');
  await expect(page.locator('.toast.bad')).toContainText('Save or undo');
  await page.click('#ap-tab-a');
  await page.getByRole('button', { name: /Save as version/ }).click();
  await expect(page.locator('.toast').last()).toContainText('Saved as version');
  const after = await studioState(page, id);
  expect(after.current.number).toBe(before.current.number + 1);
  expect(after.versions[0].notes).toBe('Activity panel: problem 2 moved up');
  expect(after.activity.data.problems[0]).toEqual(before.activity.data.problems[1]);
  expect(after.chat.filter(m => m.role === 'user')).toEqual([]);   // no Builder message
  // "As a student": the preview without the teacher controls
  await page.click('#st-student');
  await expect(page.locator('#st-student')).toHaveAttribute('aria-pressed', 'true');
  const fr = page.frameLocator('#st-frame');
  await expect(fr.locator('.oc-task')).toBeVisible();
  await expect(fr.locator('.oc-tbtn, .oc-tb')).toHaveCount(0);
  await page.click('#st-student');
  await expect(fr.locator('.oc-tbtn')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('on a phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the ⠿ handle drags a problem with a finger; a pattern is made from a fraction-bar problem', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await teacherSignup(page);
    const g = await templateGame(page, { template: 'canvas' });
    await page.click('[data-act="edit-activity"]');
    await expect(page.locator('#st-activity.is-sheet .ap-row')).not.toHaveCount(0);
    const second = await page.locator('.ap-row[data-i="1"] .ap-t b').textContent();
    // a finger on the second row's handle, moved up onto the first row, then lifted (real touch events, not a mouse)
    const from = await page.locator('.ap-row[data-i="1"] .ap-grip').boundingBox(), to = await page.locator('.ap-row[data-i="0"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
    const x0 = from.x + from.width / 2, y0 = from.y + from.height / 2, y1 = to.y + to.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0, y0 + ((y1 - y0) * k) / 6) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.ap-row[data-i="0"] .ap-t b')).toHaveText(second);
    await expect(page.locator('.ap-sum')).toContainText('Problem 2 moved up');
    // "New ones for each student" from the starter's own kind (fraction bars): three examples and the 30-problem check
    await page.locator('[data-ap="gen"]').click();
    await expect(page.locator('.ap-genbox .ap-chips .stchip')).toHaveCount(3);
    await expect(page.locator('.ap-genbox .ap-check.good')).toContainText('Checked 30 made-up problems');
    await page.getByRole('button', { name: /Save as version/ }).click();
    await expect(page.locator('.toast').last()).toContainText('Saved as version');
    const st = await studioState(page, g.id);
    expect(st.activity.data.gen.tool).toMatch(/^fractions\./);
    expect(st.activity.data.config.fresh).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('"Make problems like" works for every kind it can vary: each pattern passes the kit\'s 30-problem check', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await teacherSignup(page);
  await templateGame(page, { template: 'canvas' });
  await page.waitForFunction(() => !!window.OombaCanvas);
  const out = await page.evaluate(async () => {
    const { patternFor } = await import('/js/activity-panel/patterns.js');
    const K = window.OombaCanvas;
    const probs = [
      { tool: 'fractions.equiv', from: [3, 4], to: 8 }, { tool: 'fractions.shade', n: 3, d: 5 }, { tool: 'fractions.compare', a: [3, 4], b: [5, 8] },
      { tool: 'numberline.point', at: [3, 4], lo: 0, hi: 2, sub: 4 }, { tool: 'numberline.jump', from: 1, by: [1, 2], lo: 0, hi: 3, sub: 2 },
      { tool: 'digits.add', a: 478, b: 256 }, { tool: 'digits.sub', a: 503, b: 128 }, { tool: 'digits.mul', a: 47, b: 6 },
      { tool: 'tiles.sort', rule: 'evenodd', items: [2, 7, 10, 13] }, { tool: 'tiles.sort', rule: 'mult', n: 3, items: [9, 10, 12, 14] },
      { tool: 'tiles.sort', rule: 'half', items: [[1, 3], [3, 4], [2, 5], [5, 8]] }, { tool: 'tiles.sort', rule: 'less', n: 50, items: [12, 70, 49, 51] },
      { tool: 'tiles.order', items: [12, 5, 40], dir: 'up' }, { tool: 'tiles.order', items: [[3, 4], [1, 2], [2, 3]], dir: 'down' },
      { tool: 'figure.number', q: 'What temperature does the thermometer show?', fig: { kind: 'reading', type: 'thermometer', value: 23, min: 0, max: 40, step: 1, major: 10, hide: 'value' }, answer: 23, unit: '°C', work: ['The reading is 23 °C.'] },
      { tool: 'figure.number', q: 'What is the net force on the box?', fig: { kind: 'freeBody', body: 'box', forces: [{ name: 'F', dir: 'right', size: 10 }, { name: 'Ff', dir: 'left', size: 4 }] }, answer: 6, unit: 'N', work: ['10 N − 4 N', '= 6 N'] },
    ];
    return probs.map(p => { const x = patternFor(p); return x ? [p.tool, K.selfTest({ problems: [], gen: x.gen }).ok] : [p.tool, 'none']; });
  });
  for (const [tool, ok] of out) expect(ok, tool).toBe(true);
  // what cannot be varied from one problem: the Builder's own word groups, and a figure question with choices
  expect(await page.evaluate(async () => { const { patternFor } = await import('/js/activity-panel/patterns.js');
    return [patternFor({ tool: 'tiles.sort', bins: ['A', 'B'], items: [{ t: 'x', bin: 0 }, { t: 'y', bin: 1 }] }), patternFor({ tool: 'figure.choice', q: 'Real?', fig: { kind: 'rays' }, choices: ['real', 'virtual'], answer: 0, work: ['real'] })]; })).toEqual([null, null]);
});
