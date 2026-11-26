// Fraction circles: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Mix two piece sizes" (cover a whole using
// only halves and quarters, in as many ways as you can): 1/2 + 1/4 + 1/4 fills one circle, four quarters fill the next,
// the two circles side by side; a piece selected, then Delete; a piece dragged into the other circle.
const SET = '#mp-content .mp-obj.k-fraction-circles';
const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Mix two piece sizes' });
const circle = i => page => page.locator(`${SET} .mp-fcc`).nth(i).locator('svg');
/** Piece n of circle i (its label: the middle of its wedge). */
const piece = (i, n) => page => page.locator(`${SET} .mp-fcc`).nth(i).locator('.mp-fcp').nth(n).locator('text');
const add = label => `#mp-palette [aria-label="Add ${label} piece"]`;
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };

export default h => {
  const { txt, count, sel, all } = h;
  /** Each circle's sum under it, in order. */
  const sums = want => async page => { const got = await page.locator(`${SET} .mp-fcsum`).allTextContents(); return JSON.stringify(got.map(s => s.trim())) === JSON.stringify(want) || `sums ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`; };
  return {
    'fraction-circles': {
      title: 'Fraction circles: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Fraction circles', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: cover a whole using only halves and quarters.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: TASK, center: true },
          { spot: TASK, ms: 2400, expect: txt('#mp-tasks .mp-task:has-text("Mix two piece sizes") p.small', /^Cover a whole using only halves and quarters/) },
          { wait: 500 },
          { scroll: '#mp-board' },
        ] },
        { say: 'Tap a piece in the palette. It goes into the circle.', do: [
          { click: add('1/2'), expect: sums(['1/2']) },
          { move: near(circle(0), 120, 0) },
        ] },
        { say: 'Pieces fit edge to edge, clockwise from the top.', do: [
          { click: add('1/4'), expect: sums(['3/4']) },
          { click: add('1/4'), expect: sums(['1 whole ✓']) },
        ] },
        { say: 'A full circle says 1 whole: 1/2 + 1/4 + 1/4 = 1.', poster: true, do: [
          { spot: `${SET} .mp-fcsum.full`, ms: 2200, expect: txt(`${SET} .mp-otot`, 'Total 1') },
          { wait: 900 },
        ] },
        { say: 'A full circle takes no more, so the next piece starts a new circle.', do: [
          { click: add('1/4'), expect: sums(['1 whole ✓', '1/4']) },
          { click: add('1/4'), expect: sums(['1 whole ✓', '1/2']) },
          { click: add('1/4'), expect: sums(['1 whole ✓', '3/4']) },
          { click: add('1/4'), expect: sums(['1 whole ✓', '1 whole ✓']) },
        ] },
        { say: 'Compare them side by side: two ways to make one whole.', do: [
          { move: near(circle(0), 0, -20) },
          { wait: 500 },
          { move: near(circle(1), 0, -20) },
          { wait: 700 },
        ] },
        { say: 'Tap a piece to select it, then Delete takes it away.', do: [
          { click: piece(1, 3), expect: all(sel(`${SET} .mp-fcp.on`), txt(`${SET} [data-act="fcdel"]`, '🗑 Delete the 1/4 piece')) },
          { wait: 300 },
          { click: `${SET} [data-act="fcdel"]`, expect: all(sums(['1 whole ✓', '3/4']), count(`${SET} [data-act="fcdel"]`, 0)) },
          { move: near(circle(1), 110, 0) },
          { wait: 400 },
        ] },
        { say: 'Drag a piece onto another circle to move it there.', do: [
          { drag: piece(0, 2), to: near(circle(1), -20, -30), expect: sums(['3/4', '1 whole ✓']) },
          { wait: 600 },
        ] },
        { say: 'Labels can show fractions, percents or decimals.', do: [
          { type: '#mp-settings select[data-set="mode"]', text: 'Percent', enter: true, expect: sums(['75%', '1 whole ✓']) },
          { move: near(circle(0), 110, 0) },
          { wait: 900 },
        ] },
        { say: 'Rings view puts every size in one circle to compare.', do: [
          { click: '#mp-palette [aria-label="Rings view"]', expect: sel(`${SET} svg[aria-label="Fraction circle rings"]`) },
          { move: near(`${SET} svg[aria-label="Fraction circle rings"]`, 200, 0) },
          { wait: 1100 },
          { click: '#mp-palette [aria-label="Back to circles"]', expect: count(`${SET} .mp-fcc`, 2) },
          { wait: 300 },
        ] },
      ],
    },
  };
};
