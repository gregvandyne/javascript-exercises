// Two-Color Counters: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "Fill the ten-frame"
// (public/js/manip-tasks.js): show 7 as a full row of 5 plus 2.
export default ({ txt, count, sel, all }) => {
  const PIECE = '#mp-content .mp-piece', FRAME = '#mp-content .mp-obj.k-ten-frame';
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  const frameTotal = want => txt(`${FRAME} .mp-otot`, want);
  /** A cell of the ten-frame (0-9, row by row). */
  const cell = i => page => page.locator(`${FRAME} .mp-frame > div`).nth(i);
  /** How many counters sit in the ten-frame's cells. */
  const seated = n => async page => {
    const got = await page.evaluate(([P, F]) => {
      const cells = [...document.querySelectorAll(`${F} .mp-frame > div`)].map(c => c.getBoundingClientRect());
      return [...document.querySelectorAll(P)].filter(p => { const r = p.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; return cells.some(c => x > c.left && x < c.right && y > c.top && y < c.bottom); }).length;
    }, [PIECE, FRAME]);
    return got === n || `${got} counters in the frame's cells, wanted ${n}`;
  };
  const onBoard = (dx, dy) => async page => { const b = await page.locator('#mp-board').boundingBox(); return { x: b.x + dx, y: b.y + dy }; };
  const held = (css, ms = 650) => async page => { await page.waitForTimeout(ms); const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const yellow = pal('Yellow counter');
  const tapYellow = n => ({ click: yellow, expect: all(count(PIECE, n), seated(n), frameTotal(`Value ${n} · Zero pairs 0`)) });
  /** A spot dx, dy px from a corner of the ten-frame (fx, fy: 0 left or top, 1 right or bottom). */
  const nearFrame = (fx, fy, dx, dy) => async page => { const b = await page.locator(FRAME).boundingBox(); return { x: b.x + b.width * fx + dx, y: b.y + b.height * fy + dy }; };
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: 'Fill the ten-frame' });
  return {
    'two-color-counters': {
      title: 'Two-Color Counters: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Two-Color Counters', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      // Zoomed in a little (156%) so the counters read well in the video.
      setup: page => page.evaluate(() => { for (let i = 0; i < 2; i++) document.querySelector('#mp-zoom [data-view="in"]').click(); }),
      steps: [
        { say: 'Tap a counter in the palette to put it on the board.', do: [
          { click: yellow, expect: all(count(PIECE, 1), seated(0)) },
        ] },
        { say: 'Drag it into the ten-frame. It drops into a cell.', do: [
          { drag: PIECE, to: cell(0), expect: all(seated(1), frameTotal('Value 1 · Zero pairs 0')) },
        ] },
        { say: 'Today’s task: show 7 as a full row of 5 plus 2.', do: [
          tapYellow(2), tapYellow(3), tapYellow(4), tapYellow(5), tapYellow(6), tapYellow(7),
        ] },
        { say: 'Hold a counter and pick Flip. Red is −1.', poster: true, do: [
          { drag: `${PIECE}:nth-child(7)`, to: held(`${PIECE}:nth-child(7)`), expect: all(sel('.mp-wheel .mp-wbtn[data-wk="flip"]'), count('.mp-wheel .mp-wbtn', 4)) },
          { click: '.mp-wheel .mp-wbtn[data-wk="flip"]', expect: frameTotal('Value 5 · Zero pairs 1') },
          { wait: 700 },
        ] },
        { say: 'A yellow and a red make a zero pair. Flip it back.', do: [
          { click: '.mp-wheel .mp-wbtn[data-wk="flip"]', expect: frameTotal('Value 7 · Zero pairs 0') },
          { click: onBoard(120, 60), expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Drag across the board to select several counters.', do: [
          { drag: nearFrame(0, 0, -50, -50), to: nearFrame(1, 1, 50, 50), expect: all(txt('#mp-selpill .mp-seln', '7 selected'), count(`${PIECE}.on`, 7)) },
        ] },
        { say: 'Delete takes them all away. Undo brings them back.', do: [
          { click: '#mp-selpill .mp-seldel', expect: count(PIECE, 0) },
          { wait: 400 },
          { click: '#mp-toolsrow [data-tool="undo"]', expect: all(count(PIECE, 7), seated(7)) },
        ] },
        { say: 'Turn Totals off so the class counts for themselves.', do: [
          { click: '#mp-settings [data-view="totals"]', expect: all(count(`${FRAME} .mp-otot`, 0), txt('#mp-settings [data-view="totals"]', 'Totals: off')) },
          { wait: 600 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("Fill the ten-frame") p.muted', /^Teacher note: The 5-plus structure mirrors the rekenrek\./) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
