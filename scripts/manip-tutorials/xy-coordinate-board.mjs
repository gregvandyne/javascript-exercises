// The coordinate grid's quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Growing pattern table".
export default ({ txt, count, attr, beside, all }) => {
  const GRID = '#mp-content svg.mp-grid';
  /** The spot on the grid at (x, y): the inverse of manip.js xy act (0..12 in the first quadrant, -10..10 in four). */
  const at = (x, y) => async page => {
    const svg = page.locator(GRID).first();
    const r = await svg.evaluate(s => s.getBoundingClientRect().toJSON());
    const four = (await page.locator('#mp-settings select[data-set="four"]').inputValue()) === '1';
    const lo = four ? -10 : 0, hi = four ? 10 : 12;
    return { x: r.left + ((x - lo) / (hi - lo)) * r.width, y: r.top + (1 - (y - lo) / (hi - lo)) * r.height };
  };
  /** The points in the table, in order: "(1,3) (2,5)". */
  const pts = want => async page => {
    const got = (await page.locator('#mp-content .mp-xytable td b').allTextContents()).join(' ');
    return got === want || `table shows "${got}", wanted "${want}"`;
  };
  const quad = want => async page => (await page.locator('#mp-settings select[data-set="four"]').inputValue()) === want || 'Quadrants did not change';
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Growing pattern table' });
  return {
    'xy-coordinate-board': {
      title: 'Coordinate grid: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Coordinate grid', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: plot (1, 3), (2, 5), (3, 7) and (4, 9).', do: [
          { move: beside('#mp-content .mp-xytable', -60) },
          { wait: 900 },
        ] },
        { say: 'First set Quadrants to First quadrant. It starts empty.', do: [
          { type: '#mp-settings select[data-set="four"]', text: 'First', enter: true,
            expect: all(quad(''), txt('#mp-content .mp-xytable p.muted', 'No points yet. Tap the grid.')) },
        ] },
        { say: 'Tap the grid to plot a point. The table lists each one.', do: [
          { click: at(1, 3), expect: pts('(1,3)') },
          { click: at(2, 5), expect: pts('(1,3) (2,5)') },
          { click: at(3, 7), expect: pts('(1,3) (2,5) (3,7)') },
        ] },
        { say: 'Points of one color join into a line.', do: [
          { click: at(4, 8), expect: all(pts('(1,3) (2,5) (3,7) (4,8)'), count(`${GRID} polyline.mp-xyline`, 1)) },
        ] },
        { say: 'A point in the wrong place? Drag it. It snaps to the grid.', do: [
          { drag: at(4, 8), to: at(4, 9), expect: pts('(1,3) (2,5) (3,7) (4,9)') },
        ] },
        { say: 'Pick another color to start a new line.', do: [
          { click: '#mp-palette [data-pal="3"]', expect: attr('#mp-palette [data-pal="3"]', 'aria-pressed', 'true') },
          { click: at(5, 11), expect: all(pts('(1,3) (2,5) (3,7) (4,9) (5,11)'), count('#mp-content .mp-xytable .mp-xydot[style*="#1E88E5"]', 1)) },
          { move: beside('#mp-content .mp-xytable tbody', 16) },
        ] },
        { say: 'Read the rule from the table: y is 2x + 1.', poster: true, do: [
          { expect: count('#mp-content .mp-xytable tbody tr', 5) },
          { wait: 2200 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 16) },
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Growing pattern table") p.muted', /^Teacher note: y = 2x \+ 1, so \(10, 21\)\./) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
