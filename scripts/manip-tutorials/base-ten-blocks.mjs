// Base Ten Blocks: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "Regroup to a cube"
// (public/js/manip-tasks.js): make ten flats, then regroup them into one 1,000 cube.
export default ({ txt, count, sel, all }) => {
  const PIECE = '#mp-content .mp-piece', CHART = '#mp-content .mp-obj.k-pv-chart';
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  const col = i => page => page.locator(`${CHART} .mp-pvchart > div`).nth(i);   // 0 Thousands, 1 Hundreds, 2 Tens, 3 Ones
  /** The blocks in each column, by their labels: [thousands, hundreds, tens, ones] counts of the blocks whose middle is in it. */
  const inCols = (...want) => async page => {
    const got = await page.evaluate(([P, C]) => {
      const cols = [...document.querySelectorAll(`${C} .mp-pvchart > div`)].map(c => c.getBoundingClientRect());
      return cols.map(c => [...document.querySelectorAll(P)].filter(p => { const r = p.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; return x > c.left && x < c.right && y > c.top && y < c.bottom; }).length);
    }, [PIECE, CHART]);
    return JSON.stringify(got) === JSON.stringify(want) || `blocks by column [${got}], wanted [${want}]`;
  };
  const total = want => txt(`${CHART} .mp-otot`, want);
  const held = (css, ms = 900) => async page => { await page.waitForTimeout(ms); const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const tapFlat = n => ({ click: pal('Flat'), expect: all(count(PIECE, n), inCols(0, n, 0, 0), total(`Total ${(n * 100).toLocaleString('en-US')}`)) });
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: 'Regroup to a cube' });
  return {
    'base-ten-blocks': {
      title: 'Base Ten Blocks: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Base Ten Blocks', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: make ten flats, then regroup them into a cube.', do: [
          { move: pal('Flat') },
          { wait: 500 },
        ] },
        { say: 'Drag a flat from the palette into the Hundreds column.', do: [
          { drag: pal('Flat'), to: col(1), expect: all(count(PIECE, 1), inCols(0, 1, 0, 0), total('Total 100')) },
        ] },
        { say: 'Each tap adds one more to the same column.', do: [
          tapFlat(2), tapFlat(3), tapFlat(4), tapFlat(5), tapFlat(6), tapFlat(7), tapFlat(8), tapFlat(9), tapFlat(10),
        ] },
        { say: 'Tap a flat, then Regroup: ten flats make one cube.', poster: true, do: [
          { click: `${PIECE}:last-child`, expect: count(`${PIECE}.on`, 1) },
          { click: pal('Regroup'), expect: all(count(PIECE, 1), inCols(1, 0, 0, 0), total('Total 1,000')) },
          { wait: 700 },
        ] },
        { say: 'Hold the cube and pick Break. The total stays 1,000.', do: [
          { drag: PIECE, to: held(PIECE), expect: sel('.mp-wheel .mp-wbtn[data-wk="break"]') },
          { click: '.mp-wheel .mp-wbtn[data-wk="break"]', expect: all(count(PIECE, 10), inCols(0, 10, 0, 0), total('Total 1,000'), count('.mp-wheel', 0)) },
          { wait: 500 },
        ] },
        { say: 'Drag across the column to select all ten flats.', do: [
          { drag: async page => { const b = await col(1)(page).boundingBox(); return { x: b.x + b.width - 6, y: b.y + 30 }; },
            to: async page => { const b = await col(1)(page).boundingBox(); return { x: b.x + 8, y: b.y + b.height - 8 }; },
            expect: all(txt('#mp-selpill .mp-seln', '10 selected'), count(`${PIECE}.on`, 10)) },
        ] },
        { say: 'Drag them into Thousands, and they trade for a cube.', do: [
          // By the middle flat of the middle row, so the whole group lands inside the column.
          { drag: page => page.locator(PIECE).nth(4), to: col(0), expect: all(count(PIECE, 1), inCols(1, 0, 0, 0), total('Total 1,000')) },
          { wait: 700 },
        ] },
        { say: 'Number set switches the palette to decimal blocks.', do: [
          { type: '#mp-settings select[data-set="decimal"]', text: 'Decimals', enter: true,
            expect: all(async p => (await p.locator('#mp-settings select[data-set="decimal"]').inputValue()) === '1' || 'Number set is not Decimals', sel('#mp-palette .mp-pal[aria-label="Add Tenth, 0.1"]'), count('#mp-palette .mp-pal.piece', 4)) },
          { move: pal('Tenth') },
          { wait: 1200 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("Regroup to a cube") p.muted', /^Teacher note: Ten of any piece makes one of the next\./) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
