// The coordinate grid's quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Plot the treasure" (plot three
// points, connect them in order, name the shape).
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
  const shapes = n => count(`${GRID} .mp-xyshape`, n);
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Plot the treasure' });
  return {
    'xy-coordinate-board': {
      title: 'Coordinate grid: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Coordinate grid', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: plot (3, 4), (6, 2) and (6, 7), then connect them.', do: [
          { move: beside('#mp-content .mp-xytable', -60) },
          { wait: 1500 },
        ] },
        { say: 'First set Quadrants to First quadrant. It starts empty.', do: [
          { type: '#mp-settings select[data-set="four"]', text: 'First', enter: true,
            expect: all(quad(''), txt('#mp-content .mp-xytable p.muted', 'No points yet. Tap the grid.')) },
        ] },
        { say: 'Tap the grid to plot a point. Points of one color join into a line.', do: [
          { click: at(3, 4), expect: pts('(3,4)') },
          { click: at(6, 2), expect: pts('(3,4) (6,2)') },
          { click: at(6, 8), expect: all(pts('(3,4) (6,2) (6,8)'), count(`${GRID} polyline.mp-xyline`, 1)) },
        ] },
        { say: 'A point in the wrong place? Drag it. It snaps to the grid.', do: [
          { drag: at(6, 8), to: at(6, 7), expect: pts('(3,4) (6,2) (6,7)') },
        ] },
        { say: 'Tap the first point again to close the shape.', do: [
          { move: at(3, 4), expect: count(`${GRID} .mp-xyfirst`, 1) },
          { wait: 500 },
          { click: at(3, 4), expect: all(shapes(1), pts('(3,4) (6,2) (6,7)'), txt('#mp-content .mp-xyshut', 'Red shape closed (3 points)')) },
        ] },
        { say: 'Three sides and three corners: the treasure is a triangle.', poster: true, do: [
          { move: beside('#mp-content .mp-xyshut', 16) },
          { wait: 2600 },
        ] },
        { say: 'Undo opens it again. Close the shape in the palette closes it.', do: [
          { click: '[data-tool="undo"]', expect: shapes(0) },
          { click: '#mp-palette [aria-label="Close the red shape"]', expect: shapes(1) },
          { scroll: GRID },
        ] },
        { say: 'The next tap starts a new line, in any color.', do: [
          { click: '#mp-palette [aria-label="Blue points"]', expect: attr('#mp-palette [aria-label="Blue points"]', 'aria-pressed', 'true') },
          { click: at(8, 10), expect: pts('(3,4) (6,2) (6,7) (8,10)') },
          { click: at(11, 10), expect: all(pts('(3,4) (6,2) (6,7) (8,10) (11,10)'), shapes(1), count(`${GRID} polyline.mp-xyline`, 1)) },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Plot the treasure") p.muted', /^Teacher note: x first, along the corridor/) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
