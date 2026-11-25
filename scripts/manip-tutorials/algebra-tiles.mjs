// Algebra tiles' quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Simplify with zero pairs".
export default ({ txt, count, sel, beside, all }) => {
  const pal = label => `#mp-palette [aria-label="Add ${label} tile"]`;
  /** The n-th (0-based) tile of a kind, by its label (x, −x, 1, −1), in the order they were added. */
  const tile = (label, n = 0) => page => page.locator(`#mp-content .mp-piece[aria-label="Piece ${label}"]`).nth(n);
  const mid = async (page, loc) => { const b = await loc(page).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  /** A hold: press low on the tile (the wheel opens around that spot, clear of the top of the screen) and keep still past the wheel's 450 ms (manip-wheel.js HOLD_MS), then let go. */
  const hold = loc => { let p = null; return { drag: async page => { const m = await mid(page, loc); p = { x: m.x, y: m.b.y + m.b.height - 14 }; return p; }, to: async page => { await page.waitForTimeout(700); return p; } }; };
  const total = want => txt('#mp-total', want);
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Simplify with zero pairs' });
  const H = hold(tile('x', 3));
  let before = null;   // where the −x was before the selection was dragged
  return {
    'algebra-tiles': {
      title: 'Algebra tiles: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Algebra tiles', 'Find it in Teaching tools, Manipulatives.'],
      top: '.mp-head',   // the board total (the expression) stays in view above the board
      steps: [
        { say: 'Today’s task: build 3x + 2 − x − 5, then simplify it.', do: [
          { move: pal('x') },
          { wait: 600 },
        ] },
        { say: 'Tap a tile in the palette to put it on the board. The total keeps count.', do: [
          { click: pal('x'), expect: total('Expression 1x · Zero pairs 0') },
          { click: pal('x'), expect: total('Expression 2x · Zero pairs 0') },
          { click: pal('x'), expect: total('Expression 3x · Zero pairs 0') },
          { click: pal('1'), expect: total('Expression 3x + 1 · Zero pairs 0') },
          { click: pal('1'), expect: total('Expression 3x + 2 · Zero pairs 0') },
          ...[1, 2, 3, 4, 5].map(n => ({ click: pal('−1'), expect: total(`Expression 3x ${n < 2 ? '+ 1' : n === 2 ? '' : `− ${n - 2}`} · Zero pairs ${Math.min(n, 2)}`.replace('  ', ' ')) })),
        ] },
        { say: 'For −x, add an x. Hold it, or right-click it, for its wheel.', do: [
          { click: pal('x'), expect: total('Expression 4x − 3 · Zero pairs 2') },
          { drag: H.drag, to: H.to, expect: all(sel('.mp-wheel .mp-wbtn[data-wk="flip"]'), count('#mp-content .mp-piece.on', 1)) },
        ] },
        { say: 'Flip turns a tile into its opposite.', do: [
          { click: '.mp-wheel .mp-wbtn[data-wk="flip"]', expect: all(count('#mp-content .mp-piece[aria-label="Piece −x"]', 1), total('Expression 2x − 3 · Zero pairs 3')) },
          { wait: 500 },
          { click: page => mid(page, tile('−x')).then(p => ({ x: p.x, y: p.y + 120 })), expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Drag the −x under an x to make a zero pair.', do: [
          { drag: tile('−x'), to: page => mid(page, tile('x', 2)).then(p => ({ x: p.x, y: p.b.y + p.b.height + 50 })),
            expect: all(count('#mp-content .mp-piece.grouped', 2), async page => { const a = await mid(page, tile('x', 2)), b = await mid(page, tile('−x')); return (Math.abs(a.x - b.x) < 2 && Math.abs(b.b.y - (a.b.y + a.b.height)) < 2) || 'the −x did not snap under the x'; }) },
        ] },
        { say: 'Drag on empty board space to select several tiles.', do: [
          { drag: page => Promise.all([mid(page, tile('−1', 1)), mid(page, tile('−x'))]).then(([m, x]) => ({ x: m.x, y: x.b.y + x.b.height + 26 })),
            to: page => mid(page, tile('x', 2)),
            expect: all(txt('#mp-selpill .mp-seln', '6 selected'), count('#mp-content .mp-piece.on', 6), sel('#mp-selpill [data-seldel]')) },
        ] },
        { say: 'Delete takes the zero pairs away.', do: [
          { click: '#mp-selpill [data-seldel]', expect: all(count('#mp-content .mp-piece', 5), total('Expression 2x − 3 · Zero pairs 0'), count('#mp-selpill:not([hidden])', 0)) },
          { wait: 300 },
        ] },
        { say: 'Select the rest the same way. Drag one, and they all move.', do: [
          { drag: page => mid(page, tile('−1', 2)).then(p => ({ x: p.b.x + p.b.width + 40, y: p.y + 110 })), to: page => mid(page, tile('x', 0)),
            expect: all(txt('#mp-selpill .mp-seln', '5 selected'), count('#mp-content .mp-piece.on', 5)) },
          { drag: async page => { before = await mid(page, tile('x', 1)); return before; }, to: page => mid(page, tile('x', 1)).then(p => ({ x: p.x + 260, y: p.y + 150 })),
            expect: all(txt('#mp-selpill .mp-seln', '5 selected'), async page => { const x = await mid(page, tile('x', 1)), m = await mid(page, tile('−1', 2)); return (x.x - before.x > 200 && m.y - before.y > 100) || 'the selection did not move'; }) },
        ] },
        { say: 'What is left is the simplest form: 2x − 3.', poster: true, do: [
          { move: beside('#mp-total', -60) },
          { wait: 1300 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 16) },
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Simplify with zero pairs") p.muted', /^Teacher note: x and −x cancel/) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
