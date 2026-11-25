// Hundred Board: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "10 more, 10 less"
// (public/js/manip-tasks.js): cover 47, name 1 more, 1 less, 10 more and 10 less, then uncover and check.
export default ({ txt, count, sel, attr, all }) => {
  const OBJ = '#mp-content .mp-obj.k-hundred-board';
  const cell = i => `${OBJ} .mp-cell[data-i="${i}"]`;
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  const total = want => txt(`${OBJ} .mp-otot`, want);
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: '10 more, 10 less' });
  const below = (css, dy = 24) => async page => { const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height + dy }; };
  return {
    'hundred-board': {
      title: 'Hundred Board: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Hundred Board', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: cover 47, then name its neighbors.', do: [
          { move: cell(46) },
          { wait: 500 },
        ] },
        { say: 'Tap a cell to cover it with a star.', do: [
          { click: cell(46), expect: all(attr(cell(46), 'aria-label', 'Cell 47 covered'), txt(cell(46), '★')) },
        ] },
        { say: 'Say 1 more and 10 more. The handle bar checks you.', poster: true, do: [
          { move: below(`${OBJ} .mp-otot`, 10), expect: total('Covered 47 · 1 more 48 · 10 more 57') },
          { wait: 1500 },
        ] },
        { say: 'Cover 37 and 57 too: 10 less and 10 more.', do: [
          { click: cell(36), expect: total('Covered 2 cells') },
          { click: cell(56), expect: all(total('Covered 3 cells'), count(`${OBJ} .mp-cell.on`, 3)) },
        ] },
        { say: 'Tap the stars again to uncover and check.', do: [
          { click: cell(36), expect: txt(cell(36), '37') },
          { click: cell(46), expect: txt(cell(46), '47') },
          { click: cell(56), expect: all(txt(cell(56), '57'), count(`${OBJ} .mp-cell.on`, 0), total('Covered 0 cells')) },
        ] },
        { say: 'Multiples of 6 shades every sixth number.', do: [
          { click: pal('Multiples of 6'), expect: all(count(`${OBJ} .mp-cell.mult`, 16), attr('#mp-palette .mp-pal[aria-pressed="true"]', 'aria-label', 'Multiples of 6')) },
          { wait: 1200 },
        ] },
        { say: 'Start at sets the first number, for 101 to 200.', do: [
          { type: '#mp-settings input[data-set="start"]', text: '101', enter: true, expect: all(txt(cell(0), '101'), txt(cell(99), '200'), count(`${OBJ} .mp-cell.mult`, 17)) },
          { wait: 900 },
        ] },
        { say: 'Hold the handle bar for its wheel. Boards start locked.', do: [
          { drag: `${OBJ} .mp-ohead`, to: async page => { await page.waitForTimeout(650); const b = await page.locator(`${OBJ} .mp-ohead`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; },
            expect: all(count('.mp-wheel .mp-wbtn', 1), sel('.mp-wheel .mp-wbtn[data-wk="unlock"]')) },
          { move: '.mp-wheel .mp-wbtn[data-wk="unlock"]', expect: txt('.mp-wtip', 'Unlock') },
          { wait: 900 },
          { click: async page => { const b = await page.locator('#mp-board').boundingBox(); return { x: b.x + 90, y: b.y + 120 }; }, expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("10 more, 10 less") p.muted', /^Teacher note: Moving down a row adds 10/) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
