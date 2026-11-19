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
