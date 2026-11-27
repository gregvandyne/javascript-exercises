// Grammar Lab's pictures and animations (public/js/grammar-lab-art.js, public/css/grammar-lab-art.css), in a real
// browser, at a 390 px phone and a 1366 px laptop, in the light and the dark palette:
//   - all four animations (greeting, welcome, mastery, double-tap tip) play and end in their final state, and that end
//     state is exactly the still a reduced-motion setting shows at once (nothing plays then);
//   - the lesson's submit button next to each one still takes clicks while it plays, and the scene takes none;
//   - the tip replays from its Replay button; nothing makes the page scroll sideways; no page errors;
//   - the picture files exist, are small, and use only the light palette (no var(), no photos: no raster images).
// Stills of every picture and mid and end frames of every animation with GLA_SHOTS=<dir>. Skipped with no Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serve, PICTURES } from './_grammar-lab-art-page.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.GLA_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const KINDS = ['greeting', 'welcome', 'mastery', 'tapTip'];
const MID = { greeting: 900, welcome: 1500, mastery: 1300, tapTip: 1700 };
const SIZES = [{ width: 390, height: 844 }, { width: 1366, height: 900 }];

let browser = null, server = null, skip = !pw ? 'needs Playwright' : false;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = await serve();
});
test.after(async () => { if (browser) await browser.close(); if (server) server.srv.close(); });

/** Where each scene's moving parts end up, relative to its scene, and the opacities that matter. */
const endState = page => page.evaluate(() => {
  const out = {};
  for (const [k, c] of Object.entries(window.__gla.ctl)) {
    const r = c.root.getBoundingClientRect();
    const parts = {};
    for (const s of ['.gla-m-arm', '.gla-m-all', '.gla-m-eyes', '.gla-w-door', '.gla-w-spill', '.gla-w-float', '.gla-ms-fly', '.gla-ms-slot', '.gla-ms-burst', '.gla-ms-last', '.gla-tap-bubble', '.gla-tap-finger', '.gla-tap-mark']) {
      c.root.querySelectorAll(s).forEach((n, i) => {
        const b = n.getBoundingClientRect(), cs = getComputedStyle(n);
        parts[`${s}#${i}`] = [b.left - r.left, b.top - r.top, b.width, b.height, +cs.opacity, cs.strokeDashoffset].map(v => (typeof v === 'number' ? Math.round(v) : v));
      });
    }
    out[k] = { state: c.root.dataset.glaState, motion: c.root.dataset.glaMotion, parts };
  }
  return out;
});
const ready = page => page.waitForFunction(() => window.__gla && Object.keys(window.__gla.ctl).length === 4, null, { timeout: 10000 });
const allDone = page => page.evaluate(() => Promise.all(Object.values(window.__gla.ctl).map(c => c.finished)).then(() => true));

test('the picture files: every one there, small, light palette only, no raster images', () => {
  for (const p of PICTURES) {
    const svg = fs.readFileSync(path.join(ROOT, 'public/img/grammar-lab', `${p}.svg`), 'utf8');
    assert.match(svg, /^<\?xml[^>]*>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/, p);
    assert.ok(svg.length < 16000, `${p}: ${svg.length} bytes`);
    assert.doesNotMatch(svg, /var\(|<image|data:image|\u2014/, p);
  }
  for (const f of ['public/js/grammar-lab-art.js', 'public/css/grammar-lab-art.css', 'scripts/grammar-lab-art.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /\u2014|prefers-color-scheme|data-theme|<audio|new Audio/, f);
  assert.ok(fs.statSync(path.join(ROOT, 'public/covers/grammar-lab.jpg')).size > 5000, 'the course card cover');
});

for (const size of SIZES) for (const theme of ['light', 'dark']) {
  const tag = `${size.width}-${theme}`;
  test(`animations at ${size.width} px, ${theme}: play to their end, which is the reduced-motion still; never block the lesson`, async t => {
    if (skip) return t.skip(skip);
    const ctx = await browser.newContext({ viewport: size, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.url}/preview?theme=${theme}`);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    // While they play: the scenes take no clicks, and each lesson's submit button does.
    const playing = await page.evaluate(() => Object.values(window.__gla.ctl).map(c => [c.root.dataset.glaState, c.root.dataset.glaMotion, getComputedStyle(c.root).pointerEvents]));
    for (const [state, motion, pe] of playing) { assert.equal(state, 'playing'); assert.equal(motion, 'full'); assert.equal(pe, 'none'); }
    for (const k of KINDS) {
      const btn = page.locator(`[data-submit="${k}"]`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 2000 });
    }
    assert.equal(await page.evaluate(() => window.__gla.clicks), 4, 'every submit button took its click');
    await allDone(page);
    const full = await endState(page);
    for (const k of KINDS) assert.equal(full[k].state, 'done', k);
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'nothing left running');
    // The end state: the door open, the star in its place, the slot ring and the burst gone, the bubble shown.
    const W = full.welcome.parts, M = full.mastery.parts, P = full.tapTip.parts;
    assert.ok(W['.gla-w-door#0'][2] < 0.3 * full.welcome.parts['.gla-w-spill#0'][2], 'the door is open');
    assert.equal(M['.gla-ms-slot#0'][4], 0); assert.equal(M['.gla-ms-burst#0'][4], 0); assert.equal(M['.gla-ms-last#0'][5], '0px');
    assert.equal(P['.gla-tap-bubble#0'][4], 1); assert.equal(P['.gla-tap-mark#0'][4], 1);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'no sideways scroll');
    // The bubble stays inside its card.
    const inCard = await page.evaluate(() => { const c = document.querySelector('.gla-tap-card').getBoundingClientRect(), b = document.querySelector('.gla-tap-bubble').getBoundingClientRect(); return b.left >= c.left - 1 && b.right <= c.right + 1 && b.top >= c.top - 1; });
    assert.ok(inCard, 'the definition bubble fits its card');

    if (SHOTS) {
      for (const k of KINDS) await page.locator(`[data-slot="${k}"] .gla`).screenshot({ path: `${SHOTS}/anim-${k}-end-${tag}.png` });
      for (const k of KINDS) {
        await page.evaluate(([k, ms]) => window.__gla.ctl[k].replay().seek(ms), [k, MID[k]]);
        await page.locator(`[data-slot="${k}"] .gla`).screenshot({ path: `${SHOTS}/anim-${k}-mid-${tag}.png` });
      }
      await page.evaluate(() => Promise.all(Object.values(window.__gla.ctl).map(c => c.finish().finished)));
      if (theme === 'light' && size.width === 1366) {
        for (const p of PICTURES) await page.locator(`img[data-pic="${p}"]`).screenshot({ path: `${SHOTS}/picture-${p}.png` });
      }
      if (size.width === 1366) for (const [i, p] of PICTURES.entries()) await page.locator('#inline .gla').nth(i).screenshot({ path: `${SHOTS}/picture-${p}-inline-${theme}.png` });
    }

    // The tip replays from its button, and ends where it ended before.
    await page.locator('.gla-replay').click();
    assert.equal(await page.evaluate(() => window.__gla.ctl.tapTip.root.dataset.glaState), 'playing');
    await page.evaluate(() => window.__gla.ctl.tapTip.finished);
    assert.deepEqual((await endState(page)).tapTip, full.tapTip);

    // Reduced motion: the same end state at once, with nothing playing.
    const still = await (await browser.newContext({ viewport: size, reducedMotion: 'reduce' })).newPage();
    still.on('pageerror', e => errors.push(e.message));
    await still.goto(`${server.url}/preview?theme=${theme}`);
    await ready(still);
    await still.evaluate(() => document.fonts.ready);
    await still.waitForTimeout(100);
    assert.equal(await still.evaluate(() => document.getAnimations().length), 0, 'no animation runs with reduced motion');
    const s = await endState(still);
    for (const k of KINDS) {
      assert.equal(s[k].state, 'done', k); assert.equal(s[k].motion, 'still', k);
      assert.deepEqual(s[k].parts, full[k].parts, `${k}: the reduced-motion still is the animation's end`);
    }
    if (SHOTS) for (const k of KINDS) await still.locator(`[data-slot="${k}"] .gla`).screenshot({ path: `${SHOTS}/anim-${k}-still-${tag}.png` });
    await still.context().close();
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
