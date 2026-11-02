// The Builder's Race Board Game template (server/builder/templates/board.html): the die and the move agree. For many
// rolls, in "two players" and "me vs the robot", the face drawn on the die is the number rolled, the token hops exactly
// that many squares (or to the trophy), special squares are announced, and each token stands ON its square (its feet
// inside that tile, its head below the row above), so a player counting the hops sees the same number as the die.
// The page is the template with its pinned kit tags, served straight from public/ (no server state needed).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { withKitTags } from '../../server/builder/templates/index.js';

const ROOT = path.resolve('public');
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'
  + withKitTags(fs.readFileSync('server/builder/templates/board.html', 'utf8')).replace(/ integrity="[^"]*"/g, '') + '</body></html>';

async function openBoard(page, mode) {
  await page.route('http://board.test/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ body: PAGE, contentType: 'text/html' });
    const f = path.join(ROOT, u.pathname);
    if (f.startsWith(ROOT) && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : undefined });
    return r.fulfill({ status: 404 });
  });
  await page.goto('http://board.test/');
  await page.locator('button', { hasText: 'Play' }).first().click();
  await page.locator('button', { hasText: mode === 'bot' ? 'robot' : 'Two players' }).first().click();
  const go = page.locator('button', { hasText: 'Go' });
  await page.waitForTimeout(800);
  if (await go.count()) await go.first().click();
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.bd-roll'))).toBe(true);
  // Record every move: the rolled number, the face the die is drawn with, and the squares before and after the hops.
  await page.evaluate(() => {
    window.__moves = []; window.__toasts = [];
    const O = window.Oomba, toast = O.ui.toast.bind(O.ui);
    O.ui.toast = (t, ...a) => { window.__toasts.push({ t: String(t), at: pos.slice() }); return toast(t, ...a); };
    const realHop = hop;
    // eslint-disable-next-line no-global-assign
    hop = async (w, i, to) => {
      const from = pos[i], face = die.variant, key = world.stage.atlas.entries[die._c.id].key;
      await realHop(w, i, to);
      const t = i ? w.find('p2') : w.hero, p = spot(w, pos[i]), c = w.cell;
      window.__moves.push({ i, from, to: pos[i], face, drawn: key.split('|')[1], feetDy: (t.y - p.y) / c, headDy: (t.y - t.size - p.y) / c });
    };
  });
}

async function play(page, n) {
  for (let k = 0; k < n; k++) {
    const st = await page.evaluate(() => ({ ended: !!(world && world.ended), has: !!document.querySelector('.bd-roll') }));
    if (st.ended || !st.has) break;
    await page.evaluate(() => { const b = document.querySelector('.bd-roll'); if (b && !b.disabled) b.click(); });
    await page.waitForTimeout(150);
    await expect.poll(() => page.evaluate(() => !rolling || world.ended), { timeout: 15_000 }).toBe(true);
  }
  return page.evaluate(() => ({ moves: window.__moves, toasts: window.__toasts, squares: CONFIG.squares, specials: SPECIALS }));
}

function check({ moves, toasts, squares, specials }) {
  expect(moves.length).toBeGreaterThan(5);
  for (const m of moves) {
    expect(m.drawn, `die drawn as rolled (${JSON.stringify(m)})`).toBe(m.face);
    expect(m.to, `hops = die (${JSON.stringify(m)})`).toBe(Math.min(squares, m.from + +m.face));
    // on its own tile: feet inside the tile (half a tile is 0.625 cells), head below the row above (1.55 cells up)
    expect(Math.abs(m.feetDy), `feet on the tile (${JSON.stringify(m)})`).toBeLessThan(0.7);
    expect(m.headDy, `head clear of the row above (${JSON.stringify(m)})`).toBeGreaterThan(-0.95);
    if (specials[m.to] && m.to < squares) expect(toasts.some(t => t.at[m.i] === m.to), `special on ${m.to} announced`).toBe(true);
  }
}

test.describe('Race Board Game template: the die and the move agree', () => {
  test('two players', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1024, height: 768 });
    await openBoard(page, 'two');
    check(await play(page, 30));
  });
  test('me vs the robot, tapping Roll fast, on a phone', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page, 'bot');
    // a fast tapper: extra taps while the die rolls or the robot plays must not add or skip moves
    for (let k = 0; k < 20; k++) {
      await page.evaluate(() => { for (let j = 0; j < 4; j++) document.querySelector('.bd-roll')?.click(); });
      await page.waitForTimeout(400);
      if (await page.evaluate(() => !!(world && world.ended) || !document.querySelector('.bd-roll'))) break;
    }
    check(await play(page, 20));
  });
});
