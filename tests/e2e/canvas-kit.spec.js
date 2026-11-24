// Oomba Canvas in a browser: the activity starter's fraction bars, built with taps and checked, reach the end card and
// report once with BRB.gameOver({ won, score }); a wrong Check lights "Stuck?" and a second one shows the worked answer.
// The kit loads from the site's /vendor folder with its pinned tag (SRI), as a game's frame loads it.
import { test, expect } from '@playwright/test';
import { canvasTag } from '../../server/services/canvaskit.js';

const page$ = (base, activity, v) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canvas</title>
<script>window.__over=[];window.BRB={user:{lang:'en',dir:'ltr'},theme:'light',storage:{_:{},get(k){return this._[k]},set(k,v){this._[k]=JSON.parse(JSON.stringify(v))}},gameOver(o){window.__over.push(o)},sfx:{play(){}}};</script>
${canvasTag(v).replace('src="/', `src="${base}/`)}</head><body><div id="oc-app"></div><script type="application/json" id="oc-activity">${JSON.stringify(activity)}</script>
<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script></body></html>`;

test('fraction bars: build each answer, Check, and gameOver fires once with the score', async ({ page, baseURL }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/health');
  await page.setContent(page$(baseURL, { config: { support: 'guided' }, task: { title: 'Equivalent fractions', say: 'Make each fraction.' },
    problems: [{ tool: 'fractions.equiv', from: [3, 4], to: 8 }, { tool: 'fractions.equiv', from: [1, 2], to: 6 }] }), { waitUntil: 'load' });
  await expect(page.locator('.oc-task')).toContainText('Problem 1 of 2');
  // 3/4 from eighths: a wrong Check first (4 pieces), then the right bar (6 pieces)
  for (let i = 0; i < 4; i++) await page.click('.oc-tray .oc-tile[aria-label="1/8"]');
  await page.click('.oc-primary');
  await expect(page.locator('.oc-fb.oc-try')).toContainText('Not enough yet.');
  await expect(page.locator('.oc-btns .oc-btn').nth(1)).toHaveText(/Stuck\?/);
  for (let i = 0; i < 2; i++) await page.click('.oc-tray .oc-tile[aria-label="1/8"]');
  await page.click('.oc-primary');
  await expect(page.locator('.oc-fb.oc-good')).toContainText('Right!');
  await expect(page.locator('.oc-ok')).toHaveText('✓ 1');
  await page.click('.oc-primary');   // Next
  // 1/2 from sixths: drag three sixths onto the bar
  const bar = page.locator('.oc-barwrap');
  for (let i = 0; i < 3; i++) await page.locator('.oc-tray .oc-tile[aria-label="1/6"]').dragTo(bar);
  await expect(page.locator('.oc-count')).toHaveText('3 placed');
  expect(await page.evaluate(() => window.__over)).toEqual([]);
  await page.click('.oc-primary');
  await expect(page.locator('.oc-fb.oc-good')).toBeVisible();
  await page.click('.oc-primary');   // Next: the end of the set
  await expect(page.locator('.oc-end h2')).toHaveText('2 of 2 right');
  expect(await page.evaluate(() => window.__over)).toEqual([{ won: true, score: 2 }]);
  // their place is in their own save; a new set does not report again until it ends
  expect(await page.evaluate(() => window.BRB.storage.get('oc-progress-v1').done)).toBe(true);
  expect(await page.evaluate(() => window.Oc.selfTest({ problems: [{ tool: 'fractions.equiv', from: [5, 6], to: 4 }] }).ok)).toBe(false);
  expect(errors).toEqual([]);
});

test('two wrong Checks show the worked answer and count as not yet; no text field anywhere', async ({ page, baseURL }) => {
  await page.goto('/health');
  await page.setContent(page$(baseURL, { config: { support: 'own' }, task: { title: 'Line' }, problems: [{ tool: 'numberline.point', at: [3, 4], lo: 0, hi: 1, sub: 4 }] }), { waitUntil: 'load' });
  await page.click('.oc-tick[aria-label="1"]'); await page.click('.oc-primary');
  await page.click('.oc-primary');
  await expect(page.locator('.oc-fb.oc-shown')).toBeVisible();
  await expect(page.locator('.oc-no')).toHaveText('✗ 1');
  await expect(page.locator('.oc-tick.oc-on')).toHaveCount(1);
  await expect(page.locator('input, textarea, [contenteditable]')).toHaveCount(0);
  await page.click('.oc-primary');
  expect(await page.evaluate(() => window.__over)).toEqual([{ won: false, score: 0 }]);
});

// Oomba Canvas 1.4.1 on a phone (390 px), as the owner saw it: a fraction activity with a generator, a printable
// worksheet and the teacher's controls. The top strip is one row of status chips and one row of actions (no button
// alone on a line), and the end card's three buttons stack full width, primary first: nothing overlaps or is cut off.
test('1.4.1 at 390 px: the toolbar rows and the end card never overlap or clip', async ({ page, baseURL }) => {
  const { layoutProblems } = await import('../../server/services/layout-check.js');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/health');
  const html = page$(baseURL, { config: { support: 'own', supports: ['count', 'guided', 'own'], count: 3, fresh: true, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: 'Common Denominator Builder' },
    problems: [], gen: { tool: 'fractions.equiv', dens: [2, 3, 4], mult: [2, 3] } }, '1.4.1')
    .replace("theme:'light',", "theme:'light',canTeach:true,canPrint:true,back(){},print(){return {ok:true}},");
  await page.setContent(html, { waitUntil: 'load' });
  expect(await page.evaluate(() => Oc.version)).toBe('1.4.1');
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.oc-stat > :not([hidden]), .oc-acts > :not([hidden])')].map(e => { const r = e.getBoundingClientRect(); return [e.parentElement.className, Math.round(r.top + r.height / 2)]; }));
  // each group is one row: its items share one middle line
  for (const g of ['oc-stat', 'oc-acts']) expect(new Set((await rows()).filter(([c]) => c === g).map(([, t]) => t)).size).toBe(1);
  expect(await page.evaluate(() => [...document.querySelectorAll('.oc-acts > button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()))).toEqual(['New sheet', 'Print worksheet', 'Teacher', '⌨ Keypad']);
  expect(await page.evaluate(() => [...document.querySelectorAll('.oc-strip button')].filter(b => b.getClientRects().length).every(b => b.getBoundingClientRect().height >= 44))).toBe(true);
  expect(await page.evaluate(layoutProblems, { minTap: 40 })).toEqual([]);
  // the end card
  for (let i = 0; i < 12 && !(await page.locator('.oc-end').isVisible()); i++) await page.click('.oc-band .oc-primary');
  const btns = page.locator('.oc-end .oc-btn');
  await expect(btns).toHaveText(['🎲 Try new ones', '🖨 Print worksheet', '← Back']);
  const boxes = await btns.evaluateAll(els => els.map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), top: r.top, bottom: r.bottom, fits: b.scrollWidth <= b.clientWidth }; }));
  expect(new Set(boxes.map(b => `${b.x}/${b.w}`)).size).toBe(1);   // stacked, full width
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
  expect(boxes.every(b => b.fits)).toBe(true);
  expect(await page.evaluate(layoutProblems, { minTap: 40 })).toEqual([]);
});
