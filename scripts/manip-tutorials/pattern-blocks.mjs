// Pattern blocks' quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Design with value".
export default ({ txt, count, sel, attr, beside, all }) => {
  const pal = label => `#mp-palette [aria-label="Add ${label}"]`;
  /** The n-th (0-based) block of a kind, in the order they were added. */
  const block = (label, n = 0) => page => page.locator(`#mp-content .mp-piece[aria-label="Piece ${label}"]`).nth(n);
  const mid = async (page, loc) => { const b = await loc(page).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  /** A hold: press low on the block and keep still past the wheel's 450 ms (manip-wheel.js HOLD_MS), then let go. */
  const hold = loc => { let p = null; return { drag: async page => { const m = await mid(page, loc); p = { x: m.x, y: m.b.y + m.b.height - 12 }; return p; }, to: async page => { await page.waitForTimeout(700); return p; } }; };
  const total = want => txt('#mp-total', want);
  const matTotal = want => txt('#mp-content .mp-obj.k-mat .mp-otot', want);
  const turn = deg => async page => { const t = await block('Parallelogram', 2)(page).evaluate(e => e.style.transform); return t === `rotate(${deg}deg)` || `the parallelogram is at "${t}", wanted ${deg} degrees`; };
  const H = hold(block('Parallelogram', 2));
  let before = null;
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Design with value' });
  return {
    'pattern-blocks': {
      title: 'Pattern blocks: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Pattern blocks', 'Find it in Teaching tools, Manipulatives.'],
      top: '.mp-head',   // the tool's total stays in view above the board
      steps: [
        { say: 'Today’s task: a design worth exactly 2 hexagons.', do: [
          { move: pal('Trapezoid') },
          { wait: 500 },
        ] },
        { say: 'Tap a block in the palette to put it on the board.', do: [
          { click: pal('Trapezoid'), expect: total('Blocks 1 · Hexagons 1/2') },
          { click: pal('Trapezoid'), expect: total('Blocks 2 · Hexagons 1') },
        ] },
        { say: 'The total counts in hexagons. Add 3 parallelograms.', do: [
          { click: pal('Parallelogram'), expect: total('Blocks 3 · Hexagons 1 1/3') },
          { click: pal('Parallelogram'), expect: total('Blocks 4 · Hexagons 1 2/3') },
          { click: pal('Parallelogram'), expect: total('Blocks 5 · Hexagons 2') },
        ] },
        { say: 'Hold a block, or right-click it, for its wheel.', do: [
          { drag: H.drag, to: H.to, expect: all(sel('.mp-wheel .mp-wbtn[data-wk="rotate"]'), sel('.mp-wheel .mp-wbtn[data-wk="flip"]')) },
        ] },
        { say: 'Rotate turns it 30 degrees. Flip turns it over.', do: [
          { click: '.mp-wheel .mp-wbtn[data-wk="rotate"]', expect: turn(30) },
          { click: '.mp-wheel .mp-wbtn[data-wk="flip"]', expect: async page => (await block('Parallelogram', 2)(page).locator('.mp-face').getAttribute('style')).includes('polygon(0 0,75% 0') || 'the parallelogram did not flip' },
          { click: page => mid(page, block('Parallelogram', 2)).then(p => ({ x: p.x, y: p.y + 260 })), expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Drag a block to move it.', do: [
          { drag: block('Parallelogram', 2), to: page => mid(page, block('Trapezoid', 1)).then(p => ({ x: p.x, y: p.y + 70 })),
            expect: async page => { const t = await mid(page, block('Trapezoid', 1)), q = await mid(page, block('Parallelogram', 2)); return (q.y - t.y > 40 && Math.abs(q.x - t.x) < 40) || 'the parallelogram did not move under the trapezoid'; } },
        ] },
        { say: 'Drag a work mat from the palette onto the board.', do: [
          { drag: pal('a work mat'), to: page => page.locator('#mp-board').boundingBox().then(b => ({ x: b.x + 700, y: b.y + 120 })),
            expect: all(count('#mp-content .mp-obj.k-mat', 1), count('#mp-total:not(:empty)', 0)) },
        ] },
        { say: 'Drag on empty space to select several blocks.', do: [
          { drag: page => mid(page, block('Parallelogram', 1)).then(p => ({ x: p.b.x + p.b.width + 8, y: p.y + 170 })), to: page => mid(page, block('Trapezoid', 0)),
            expect: all(txt('#mp-selpill .mp-seln', '5 selected'), count('#mp-content .mp-piece.on', 5)) },
        ] },
        { say: 'Drag one, and they all move. The mat counts them.', do: [
          { drag: async page => { before = await mid(page, block('Trapezoid', 0)); return before; },
            to: async page => {
              const bs = await page.locator('#mp-content .mp-piece').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
              const x0 = Math.min(...bs.map(b => b.left)), x1 = Math.max(...bs.map(b => b.right)), y0 = Math.min(...bs.map(b => b.top)), y1 = Math.max(...bs.map(b => b.bottom));
              const m = (await page.locator('#mp-content .mp-obj.k-mat').boundingBox());
              return { x: before.x + (m.x + m.width / 2 - (x0 + x1) / 2), y: before.y + (m.y + 15 + m.height / 2 - (y0 + y1) / 2) };
            },
            expect: all(txt('#mp-selpill .mp-seln', '5 selected'), matTotal('Blocks 5 · Hexagons 2')) },
          { move: beside('#mp-content .mp-obj.k-mat .mp-otot', 16) },
        ] },
        { say: 'The design is worth 2 hexagons.', poster: true, do: [
          { wait: 1500 },
        ] },
        { say: 'Totals off hides the count, so students work it out.', do: [
          { click: '#mp-settings [data-view="totals"]', expect: all(txt('#mp-settings [data-view="totals"]', 'Totals: off'), count('#mp-content .mp-otot', 0)) },
          { wait: 500 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 16) },
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Design with value") p.muted', /^Teacher note: Many combinations reach 2/) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
