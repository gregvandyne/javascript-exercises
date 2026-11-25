// Color Tiles: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "Same area, different perimeter"
// (public/js/manip-tasks.js): 12 tiles as two different rectangles, the same area but not the same perimeter.
export default ({ txt, count, sel, all }) => {
  const PIECE = '#mp-content .mp-piece';
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  const tile = i => page => page.locator(PIECE).nth(i);
  const box = async (page, i) => page.locator(PIECE).nth(i).boundingBox();
  /** The tiles stand in cols columns and rows rows (their left and top edges, to the pixel). */
  const grid = (cols, rows) => async page => {
    const r = await page.locator(PIECE).evaluateAll(els => els.map(e => [Math.round(parseFloat(e.style.left)), Math.round(parseFloat(e.style.top))]));
    const xs = new Set(r.map(p => p[0])), ys = new Set(r.map(p => p[1]));
    return (xs.size === cols && ys.size === rows && r.length === cols * rows) || `tiles in ${xs.size} columns and ${ys.size} rows, wanted ${cols} by ${rows}`;
  };
  const head = want => txt('#mp-total', want);
  const tap = (label, n) => ({ click: pal(label), expect: all(count(PIECE, n), head(`Tiles ${n} · Area ${n} square units`)) });
  const held = (i, ms = 700) => async page => { await page.waitForTimeout(ms); const b = await box(page, i); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: 'Same area, different perimeter' });
  return {
    'color-tiles': {
      title: 'Color Tiles: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Color Tiles', 'Find it in Teaching tools, Manipulatives.'],
      top: '.mp-head',
      // Zoomed in (244%) so a row of tapped tiles wraps after six: 12 taps make a 6 by 2 rectangle.
      setup: page => page.evaluate(() => { for (let i = 0; i < 4; i++) document.querySelector('#mp-zoom [data-view="in"]').click(); }),
      steps: [
        { say: 'Today’s task: two rectangles from the same 12 tiles.', do: [
          tap('Green tile', 1), tap('Green tile', 2), tap('Green tile', 3), tap('Green tile', 4), tap('Green tile', 5), tap('Green tile', 6),
        ] },
        { say: 'Each tap adds a tile. The total up top is the area: 12.', do: [
          tap('Blue tile', 7), tap('Blue tile', 8), tap('Blue tile', 9), tap('Blue tile', 10), tap('Blue tile', 11), tap('Blue tile', 12),
          { expect: grid(6, 2) },
        ] },
        { say: 'Fit brings everything into view. Plus and minus zoom.', do: [
          { click: '#mp-zoom [data-view="fit"]', expect: txt('#mp-zoom .mp-pct', '100%') },
          { click: '#mp-zoom [data-view="in"]', expect: txt('#mp-zoom .mp-pct', '125%') },
        ] },
        { say: 'Drag across empty space to select several tiles.', do: [
          { drag: async page => { const b = await box(page, 5); return { x: b.x + b.width + 30, y: b.y - 14 }; },
            to: async page => { const b = await box(page, 9); return { x: b.x + 12, y: b.y + b.height + 22 }; },
            expect: all(txt('#mp-selpill .mp-seln', '6 selected'), count(`${PIECE}.on`, 6)) },
        ] },
        { say: 'Drag one, and they all move. Now it is 3 by 4.', poster: true, do: [
          { drag: tile(3), to: async page => { const a = await box(page, 0), b = await box(page, 3), c = await box(page, 6); return { x: b.x + b.width / 2 + (a.x - b.x), y: b.y + b.height / 2 + 2 * (c.y - a.y) }; },
            expect: all(grid(3, 4), head('Tiles 12 · Area 12 square units')) },
        ] },
        { say: 'Same area, but the perimeter went from 16 to 14.', do: [
          { click: async page => { const b = await page.locator('#mp-board').boundingBox(); return { x: b.x + b.width - 120, y: b.y + 60 }; }, expect: count(`${PIECE}.on`, 0) },
          { wait: 1200 },
        ] },
        { say: 'Hold a tile for Copy, Fill, Lock and Delete.', do: [
          { drag: tile(0), to: held(0), expect: all(count('.mp-wheel .mp-wbtn', 4), sel('.mp-wheel .mp-wbtn[data-wk="fill"]')) },
          { wait: 400 },
          { click: '.mp-wheel .mp-wbtn[data-wk="fill"]', expect: all(count('.mp-wheel', 0), async p => (await p.locator(PIECE).first().locator('.mp-face').evaluate(e => e.style.background)) === 'transparent' || 'the tile is still filled') },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("Same area, different perimeter") p.muted', /^Teacher note: 3 × 4 gives perimeter 14, 2 × 6 gives 16/) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
