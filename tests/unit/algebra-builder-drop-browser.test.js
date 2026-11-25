// Algebra Builder, in a real browser (docs/decisions.md "Algebra Builder: cancel by dropping on the opposite, and x
// tiles turn to fit the T"). Owner: "if you drop a negative x or 1 or x squared over the top of a positive one, it should
// negate it and cause both to disappear. You should be able to do this with multiple blocks at a time. Also, if you
// place an x on the descending side of the T, it should automatically flip."
// The game runs from seed-games/algebra-builder.html with a stand-in BRB, in Multiply with no tiles (level 2), and
// tiles are dragged with the mouse from the tray. Skipped when no Chromium is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchOptions, chromiumPath } from '../../scripts/chromium.js';

let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || !chromiumPath() ? 'needs Chromium' : false;
const game = fs.readFileSync('seed-games/algebra-builder.html', 'utf8');
let browser;
test.before(async () => { if (!skip) browser = await chromium.launch(launchOptions()); });
test.after(async () => { if (browser) await browser.close(); });

async function open(w = 1280, h = 900) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.errs = errs;
  const params = { mode: 'multiply', chapter: 'oxp1coxp2c', level: 2, lock: 1 };   // (x + 1)(x + 2), no tiles to start
  await p.route('http://t.local/*', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><script>const __st={};window.BRB={user:{lang:'en'},params:Object.freeze(${JSON.stringify(params)}),storage:{get:k=>__st[k]??null,set:(k,v)=>{__st[k]=v}},sfx:{play(){},mute(){},muted:false},fx:{confetti(){}},speak:()=>true,score:{submit(){}},gameOver(){}};</script>${game}` }));
  await p.goto('http://t.local/g');
  await p.locator('.tray-tile').first().waitFor();
  return p;
}
const drag = async (p, from, to) => {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 }); await p.mouse.move(to.x, to.y, { steps: 8 });
  await p.mouse.up(); await p.waitForTimeout(300);
};
const board = p => p.evaluate(() => [...document.querySelectorAll('[aria-label$=" tile"]')]
  .filter(e => !e.classList.contains('tray-tile') && !e.closest('.tray-tile') && !/^Turn/.test(e.getAttribute('aria-label')))
  .map(e => { const r = e.getBoundingClientRect(); return { l: e.getAttribute('aria-label'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }));
const tray = async (p, kind) => { const r = await p.locator('.tray-tile').nth({ x2: 0, x: 1, unit: 2 }[kind]).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const negatives = async p => { await p.keyboard.press('Escape'); await p.click('.sign-tool'); await p.waitForTimeout(400); };
const settled = p => p.waitForTimeout(1600);   // the rumble, the slide together and the poof

test('a negative x, x squared or 1 dropped over its positive cancels it: both go', { skip }, async () => {
  for (const kind of ['x', 'x2', 'unit']) {
    const p = await open();
    await drag(p, await tray(p, kind), { x: 700, y: 450 });
    const [t] = await board(p);
    await negatives(p);
    await drag(p, await tray(p, kind), { x: t.x + 12, y: t.y + 6 });
    await settled(p);
    assert.deepEqual(await board(p), [], kind);
    assert.deepEqual(p.errs, []);
    await p.close();
  }
});

test('several at once: a selection dropped on its opposites cancels each pair; the rest land as usual', { skip }, async () => {
  let p = await open();
  for (const x of [600, 700, 800]) await drag(p, await tray(p, 'unit'), { x, y: 350 });
  await negatives(p);
  for (const x of [600, 700, 800]) await drag(p, await tray(p, 'unit'), { x, y: 600 });
  const all = await board(p);
  const pos = all.filter(t => t.l === 'unit tile').sort((a, b) => a.x - b.x), neg = all.filter(t => t.l === 'negative unit tile').sort((a, b) => a.x - b.x);
  assert.equal(pos.length + neg.length, 6);
  await p.keyboard.press('Escape');
  await p.mouse.click(neg[0].x, neg[0].y); await p.keyboard.down('Shift');
  await p.mouse.click(neg[1].x, neg[1].y); await p.mouse.click(neg[2].x, neg[2].y); await p.keyboard.up('Shift');
  await drag(p, neg[0], { x: pos[0].x, y: pos[0].y });
  await settled(p);
  assert.deepEqual(await board(p), [], 'three pairs at once');
  await p.close();

  p = await open();
  await drag(p, await tray(p, 'x'), { x: 700, y: 350 });
  await negatives(p);
  await drag(p, await tray(p, 'x'), { x: 700, y: 600 }); await drag(p, await tray(p, 'unit'), { x: 860, y: 600 });
  const b = await board(p);
  const nx = b.find(t => t.l === 'negative x tile'), nu = b.find(t => t.l === 'negative unit tile'), px = b.find(t => t.l === 'x tile');
  await p.keyboard.press('Escape'); await p.mouse.click(nx.x, nx.y); await p.keyboard.down('Shift'); await p.mouse.click(nu.x, nu.y); await p.keyboard.up('Shift');
  await drag(p, nx, { x: px.x, y: px.y });
  await settled(p);
  assert.deepEqual((await board(p)).map(t => t.l), ['negative unit tile'], 'the −1 had nothing to cancel and stays');
  await p.close();
});

test('the same sign never cancels', { skip }, async () => {
  const p = await open();
  await drag(p, await tray(p, 'x'), { x: 700, y: 450 });
  const [a] = await board(p);
  await drag(p, await tray(p, 'x'), { x: a.x, y: a.y });
  await settled(p);
  assert.equal((await board(p)).length, 2);
  await p.close();
});

test('an x on the side of the T going down stands up by itself (and lies flat on the top); the sides then check', { skip }, async () => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const p = await open(w, h);
    const corner = await p.locator('text=×').first().boundingBox();
    const c = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, step = corner.width;
    await drag(p, await tray(p, 'x'), { x: c.x + step * 2, y: c.y });          // top: flat, as it comes
    await drag(p, await tray(p, 'unit'), { x: c.x + step * 5, y: c.y });
    await drag(p, await tray(p, 'x'), { x: c.x, y: c.y + step * 2 });          // down the side: dropped flat
    await drag(p, await tray(p, 'unit'), { x: c.x, y: c.y + step * 5 });
    await drag(p, await tray(p, 'unit'), { x: c.x, y: c.y + step * 6 });
    const xs = (await board(p)).filter(t => t.l === 'x tile').sort((a, b) => a.y - b.y);
    assert.ok(xs[0].w > xs[0].h, `${w}: the top's x lies flat`);
    assert.ok(xs[1].h > xs[1].w, `${w}: the side's x stands up`);
    await p.click('text=Check');
    await p.waitForTimeout(800);
    const now = await p.evaluate(() => [...document.querySelectorAll('[aria-current], .current, .now')].map(e => e.textContent.trim()));
    assert.ok(now.some(x => /Rectangle/.test(x)), `${w}: the sides are right, on to the rectangle (${now})`);
    assert.deepEqual(p.errs, []);
    await p.close();
  }
});
