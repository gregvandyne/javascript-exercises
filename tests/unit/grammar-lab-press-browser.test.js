// Grammar Lab: pressing a topic tile, a unit row or a band's fold highlights all of it, evenly, edge to edge (the owner's
// phone screenshot of 27 Nov 2026: the press covered only the tile's inner link, a darker box inside a lighter one). At
// 390 x 844, light and dark: the tile's link takes every tap across the tile but the ⋯ button (its own target, which
// still opens the menu), the pressed and hover state is the tile's own (the link inside has no box of its own), the
// keyboard focus ring outlines the whole tile, and a locked tile shows no press. On the course page a unit row and a
// folded band's summary fill their card. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const VIEW = { width: 390, height: 844 };
const UNIT = '/courses/grammar-lab/k-2/adjectives-and-adverbs';

/** The background of sel, once the browser has drawn the frame after the last pointer move or press (hover and
 *  active states land on the next frame): the color it settles on. */
async function bgOf(page, sel) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.$eval(sel, e => getComputedStyle(e).backgroundColor);
}
const hoverColor = page => page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--hover)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });

test('a topic tile: one even press highlight over the whole tile, the ⋯ button its own target; rows and bands too', async t => {
  if (env.skip) return t.skip(env.skip);
  const kid = H.newKid('glpress');
  const ctx = await env.browser.newContext({ viewport: VIEW, colorScheme: 'light', reducedMotion: 'reduce', hasTouch: false });
  await ctx.addCookies([H.sessionCookie(kid.id, env.base)]);
  const page = await ctx.newPage();
  try {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(env.base + UNIT, { waitUntil: 'domcontentloaded' });
      const tile = '.gl-tile:has(>a.gl-tile-main)';
      await page.locator(tile).first().scrollIntoViewIfNeeded();
      // Every point across the tile (left edge to the ⋯ button, top to bottom edge) is the link; the ⋯ button is not.
      const r = await page.evaluate(sel => {
        const li = document.querySelector(sel), sum = li.querySelector('.gl-menu summary');
        const a = li.getBoundingClientRect(), m = sum.getBoundingClientRect();
        const miss = [];
        // (the rounded corners are left out: a tap there is outside the tile, as it looks)
        const rad = parseFloat(getComputedStyle(li).borderTopLeftRadius) || 0;
        const at = (x, y) => { const e = document.elementFromPoint(x, y); if (!e || !e.closest('a.gl-tile-main') || !li.contains(e)) miss.push([Math.round(x - a.left), Math.round(y - a.top)]); };
        for (const y of [a.top + 3, a.top + a.height / 2, a.bottom - 3]) {
          const edge = y === a.top + a.height / 2 ? 3 : rad + 2;
          for (let x = a.left + edge; x < m.left - 2; x += 8) at(x, y);
          // the far side: past the ⋯ button, and above and below it
          if (y === a.top + a.height / 2) { if (m.right + 2 < a.right - 2) at(m.right + 2, y); } else at(Math.min(m.left + m.width / 2, a.right - edge), y);
        }
        const onMenu = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);
        return { miss, menuOwn: !!(onMenu && onMenu.closest('summary') === sum), tileW: a.width, menuW: m.width, linkW: li.querySelector('a.gl-tile-main').getBoundingClientRect().width };
      }, tile);
      assert.deepEqual(r.miss, [], `${scheme}: every point of the tile but the ⋯ button opens the topic`);
      assert.ok(r.menuOwn, `${scheme}: the ⋯ button is its own target`);
      assert.ok(r.linkW >= r.tileW - r.menuW - 24, `${scheme}: the link spans the tile up to the menu (${r.linkW} of ${r.tileW})`);
      // Pressed: the tile itself turns the hover color, the link inside has no box of its own (no darker box).
      const hover = await hoverColor(page);
      const box = await page.locator(tile).first().boundingBox();
      await page.mouse.move(box.x + 60, box.y + box.height / 2);
      await page.mouse.down();
      assert.equal(await bgOf(page, tile), hover, `${scheme}: the pressed tile is the hover color`);
      assert.equal(await bgOf(page, `${tile} > a.gl-tile-main`), 'rgba(0, 0, 0, 0)', `${scheme}: the link has no background of its own`);
      assert.equal(await page.$eval(`${tile} > a.gl-tile-main`, e => getComputedStyle(e).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)', 'no gray tap box');
      await H.shot(page, `tile-pressed-${scheme}`);
      await page.mouse.move(2, 2); await page.mouse.up();
      // A locked tile: no link, no press highlight.
      const locked = '.gl-tile.gl-locked';
      if (await page.locator(locked).count()) {
        const before = await bgOf(page, locked);
        const lb = await page.locator(locked).first().boundingBox();
        await page.mouse.move(lb.x + 60, lb.y + lb.height / 2); await page.mouse.down();
        assert.equal(await bgOf(page, locked), before, `${scheme}: a locked tile shows no press`);
        await page.mouse.up();
      }
      // The ⋯ menu still opens, with its own pressed state.
      const sum = `${tile} .gl-menu summary`;
      const sb = await page.locator(sum).first().boundingBox();
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
      assert.notEqual(await bgOf(page, sum), 'rgba(0, 0, 0, 0)', 'the ⋯ button has its own pressed state');
      await page.mouse.up();
      assert.ok(await page.locator(`${tile} .gl-menu`).first().evaluate(d => d.open), `${scheme}: the ⋯ menu opens`);
      assert.ok(await page.locator(`${tile} .gl-menu-list`).first().isVisible(), 'its items show');
      await page.keyboard.press('Escape');
      // The keyboard focus ring outlines the whole tile.
      await page.goto(env.base + UNIT, { waitUntil: 'domcontentloaded' });
      let ok = false;
      for (let i = 0; i < 60 && !ok; i++) { await page.keyboard.press('Tab'); ok = await page.evaluate(() => !!document.activeElement && document.activeElement.matches('a.gl-tile-main')); }
      assert.ok(ok, 'the tile link takes keyboard focus');
      const ring = await page.evaluate(() => { const li = document.activeElement.closest('.gl-tile'); const s = getComputedStyle(li); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), own: getComputedStyle(document.activeElement).outlineStyle }; });
      assert.equal(ring.style, 'solid', `${scheme}: the focus ring is on the tile`); assert.ok(ring.width >= 2);
      assert.equal(ring.own, 'none', 'and not a second ring inside it');

      // The course page: a unit row and a folded band's summary fill their card when pressed.
      await page.goto(`${env.base}/courses/grammar-lab?band=3-5`, { waitUntil: 'domcontentloaded' });
      const row = '#gl-sec-3-5 .gl-unit';
      await page.locator(row).first().scrollIntoViewIfNeeded();
      const rb = await page.locator(row).first().boundingBox();
      await page.mouse.move(rb.x + 40, rb.y + rb.height / 2); await page.mouse.down();
      assert.equal(await bgOf(page, row), hover, `${scheme}: a pressed unit row is the hover color, all of it`);
      await page.mouse.move(2, 2); await page.mouse.up();
      const fold = await page.evaluate(() => { const d = document.querySelector('details.gl-bandfold:not([open])'); if (!d) return null; const a = d.getBoundingClientRect(), b = d.querySelector('summary').getBoundingClientRect(); return { dl: a.left, dr: a.right, dt: a.top, db: a.bottom, sl: b.left, sr: b.right, st: b.top, sb: b.bottom }; });
      assert.ok(fold, 'a folded band');
      for (const [x, y] of [['dl', 'sl'], ['dr', 'sr'], ['dt', 'st'], ['db', 'sb']]) assert.ok(Math.abs(fold[x] - fold[y]) <= 1, `${scheme}: the folded band's summary fills its card (${x})`);
      await page.locator('details.gl-bandfold:not([open]) > summary').first().scrollIntoViewIfNeeded();
      const fs = await page.locator('details.gl-bandfold:not([open]) > summary').first().boundingBox();
      await page.mouse.move(fs.x + 40, fs.y + fs.height / 2); await page.mouse.down();
      assert.equal(await bgOf(page, 'details.gl-bandfold:not([open]) > summary'), hover, `${scheme}: a pressed band is the hover color`);
      await H.shot(page, `band-pressed-${scheme}`);
      await page.mouse.move(2, 2); await page.mouse.up();
    }
  } finally { await ctx.close(); }
});
