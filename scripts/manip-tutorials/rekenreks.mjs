// Rekenreks: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "Hidden beads" (public/js/manip-tasks.js):
// show 13 across two rows, then turn on the cover and work out how many beads are hidden.
export default ({ txt, count, sel, attr, all }) => {
  const OBJ = '#mp-content .mp-obj';
  const bead = (r, i) => `${OBJ} .mp-bead[data-r="${r}"][data-i="${i}"]`;
  /** The first rekenrek's row totals read want (numbers, or '?' under the cover). */
  const rows = (...want) => async page => {
    const got = (await page.locator(OBJ).first().locator('.mp-rowtotal').allTextContents()).map(s => s.trim());
    return JSON.stringify(got) === JSON.stringify(want.map(String)) || `row totals [${got}], wanted [${want}]`;
  };
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  /** A spot on the board, dx, dy px from its top left. */
  const onBoard = (dx, dy) => async page => { const b = await page.locator('#mp-board').boundingBox(); return { x: b.x + dx, y: b.y + dy }; };
  /** Hold still on a target long enough for its wheel (a drag that ends where it started). */
  const held = (css, ms = 650) => async page => { await page.waitForTimeout(ms); const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // Where the rekenreks were when a drag of them began (the `to` of that drag runs while the mouse is down).
  let before = null;
  const lefts = page => page.locator(OBJ).evaluateAll(els => els.map(e => [parseFloat(e.style.left), parseFloat(e.style.top)]));
  const thenTo = (dx, dy) => async page => { before = await lefts(page); const b = await page.locator(`${OBJ}:nth-child(2) .mp-ohead`).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
  const allMoved = async page => { const now = await lefts(page); return (before && now.length === 2 && now.every((p, i) => p[0] - before[i][0] > 100)) || `rekenreks at ${JSON.stringify(now)}, were at ${JSON.stringify(before)}`; };
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: 'Hidden beads' });
  return {
    rekenreks: {
      title: 'Rekenreks: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Rekenreks', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a bead to slide it over, with every bead before it.', do: [
          { click: bead(0, 6), expect: rows(7, 0) },
          { click: bead(0, 4), expect: rows(5, 0) },
        ] },
        { say: 'Today’s task: show 13 across two rows.', do: [
          { click: bead(0, 9), expect: rows(10, 0) },
          { click: bead(1, 2), expect: all(rows(10, 3), txt(`${OBJ} .mp-otot`, 'Showing 13')) },
        ] },
        { say: 'Turn on Cover. How many beads are hidden?', poster: true, do: [
          { click: pal('Cover'), expect: all(rows('?', '?'), txt(`${OBJ} .mp-otot`, 'Showing 13'), sel(`${OBJ} .mp-callout`)) },
          { wait: 1200 },
        ] },
        { say: 'Uncover to check.', do: [
          { click: pal('Uncover'), expect: all(rows(10, 3), count(`${OBJ} .mp-callout`, 0)) },
        ] },
        { say: 'Switch to 20-bead rows to count to 20 on one row.', do: [
          { click: pal('20-bead rows'), expect: all(sel(`${OBJ} .mp-rek.long`), count(`${OBJ} .mp-rekrow:first-child .mp-bead`, 20), rows(10, 3)) },
          { wait: 700 },
        ] },
        { say: 'Drag the handle bar to move a rekenrek.', do: [
          { drag: `${OBJ} .mp-ohead`, to: async page => { before = await lefts(page); const w = (await page.locator(OBJ).first().boundingBox()).width; return onBoard(24 + w / 2, 36)(page); },
            expect: async page => { const [[x, y]] = await lefts(page); return (x < before[0][0] - 100 && y < before[0][1] - 100) || 'the rekenrek did not move up and left'; } },
        ] },
        { say: 'Hold it for its wheel. Copy makes a second one.', do: [
          { drag: `${OBJ} .mp-ohead`, to: held(`${OBJ} .mp-ohead`), expect: all(count('.mp-wheel .mp-wbtn', 3), sel('.mp-wheel .mp-wbtn[data-wk="copy"]')) },
          { wait: 500 },
          { click: '.mp-wheel .mp-wbtn[data-wk="copy"]', expect: all(count(OBJ, 2), count('.mp-wheel', 0)) },
        ] },
        { say: 'Drag across empty space to select several at once.', do: [
          { drag: onBoard(880, 14), to: onBoard(330, 400), expect: all(txt('#mp-selpill .mp-seln', '2 selected'), count(`${OBJ}.on`, 2)) },
        ] },
        { say: 'Drag one, and they all move together.', do: [
          { drag: `${OBJ}:nth-child(2) .mp-ohead`, to: thenTo(230, 30), expect: all(allMoved, txt('#mp-selpill .mp-seln', '2 selected')) },
        ] },
        { say: 'Tap empty space to let go.', do: [
          { click: onBoard(150, 440), expect: all(count(`${OBJ}.on`, 0), async p => (await p.locator('#mp-selpill').isHidden()) || 'the pill is still shown') },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("Hidden beads") p.muted', /^Teacher note: The cover tool turns counting into reasoning/) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
