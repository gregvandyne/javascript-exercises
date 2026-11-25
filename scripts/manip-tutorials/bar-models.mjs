// Bar models: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Fraction bar: leftovers" (a whole pizza of 8
// slices with 3 eaten: the fraction eaten and the fraction left).
const BAR = '#mp-content .mp-obj.k-bar-models';
const label = (b, s) => `${BAR} .mp-seglabel[data-bar="${b}"][data-seg="${s}"]`;
const step = (b, s, d) => `${BAR} [data-act="seg"][data-bar="${b}"][data-seg="${s}"][data-d="${d}"]`;
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** The middle of a wheel button, as a spot (a scroll would close the wheel). */
const wbtn = k => async page => { const b = await page.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });

export default h => {
  const { txt, count, sel, all } = h;
  /** The parts of the first bar: [label, value] each. */
  const parts = want => async page => {
    const got = await page.locator(`${BAR} .mp-bar`).first().locator('.mp-seg').evaluateAll(els => els.map(e => [e.querySelector('.mp-seglabel').value, e.querySelector('.mp-steps b').textContent]));
    return JSON.stringify(got) === JSON.stringify(want) || `parts ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`;
  };
  const value = v => async page => (await page.locator(label(0, 0)).inputValue()) === v || `the label reads "${await page.locator(label(0, 0)).inputValue()}"`;
  let at = null;
  return {
    'bar-models': {
      title: 'Bar models: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Bar models', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Pick a layout from the palette, like Part-part-whole.', do: [
          { click: '#mp-palette [aria-label="Add Part-part-whole"]', expect: all(count(`${BAR} .mp-bar`, 1), parts([['Part', '4'], ['Part', '4']]), txt(`${BAR} .mp-barname`, 'Whole · total 8')) },
        ] },
        { say: 'Today’s task: a pizza of 8 slices, and 3 are eaten.', do: [
          { move: near(`${BAR} .mp-barname`, 120, 0) },
          { wait: 1200 },
        ] },
        { say: 'Type in a part to give it a name.', do: [
          { type: label(0, 0), text: 'Eaten', expect: parts([['Eaten', '4'], ['Part', '4']]) },
          { type: label(0, 1), text: 'Left', expect: parts([['Eaten', '4'], ['Left', '4']]) },
        ] },
        { say: 'Use − and + to change the size of a part.', do: [
          { click: step(0, 0, -1), expect: parts([['Eaten', '3'], ['Left', '4']]) },
          { click: step(0, 1, 1), expect: all(parts([['Eaten', '3'], ['Left', '5']]), txt(`${BAR} .mp-barname`, 'Whole · total 8')) },
        ] },
        { say: '3 of 8 slices are eaten, so 5/8 of the pizza is left.', poster: true, do: [
          { move: near(`${BAR} .mp-barname`, 120, 0) },
          { wait: 1500 },
        ] },
        { say: 'Add a part or a new bar from the palette.', do: [
          { click: '#mp-palette [aria-label="Add Add a bar"]', expect: all(count(`${BAR} .mp-bar`, 2), txt(`${BAR} p.mp-barname >> nth=1`, 'Bar 2 · total 2')) },
          { move: near(`${BAR} .mp-bar >> nth=1`, 0, 40) },
          { wait: 900 },
        ] },
        { say: 'A bar model starts locked. Hold its handle to unlock it.', do: [
          hold(`${BAR} .mp-ohead`, sel('.mp-wheel .mp-wbtn[data-wk="unlock"]')),
          { click: wbtn('unlock'), expect: all(count('.mp-wheel', 0), async p => !(await p.locator(BAR).getAttribute('class')).includes('locked') || 'still locked') },
        ] },
        { say: 'Then drag the handle to move it.', do: [
          { expect: async p => { at = await p.locator(BAR).evaluate(e => parseFloat(e.style.left)); return true; } },
          { drag: `${BAR} .mp-ohead`, to: near(`${BAR} .mp-ohead`, -120, 30), expect: async p => (await p.locator(BAR).evaluate(e => parseFloat(e.style.left))) < at - 60 || 'the bar model did not move' },
        ] },
        { say: 'Totals off hides the total on the handle.', do: [
          { click: '#mp-settings [data-view="totals"]', expect: all(txt('#mp-settings [data-view="totals"]', 'Totals: off'), count(`${BAR} .mp-otot`, 0)) },
          { move: near(`${BAR} .mp-ohead`, 200, 0) },
          { wait: 900 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Fraction bar: leftovers' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Fraction bar: leftovers' }),
            expect: txt('#mp-tasks .mp-task:has-text("Fraction bar: leftovers") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Fraction bar: leftovers' }).locator('p').nth(1) },
          { wait: 700 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Fraction bar: leftovers' }).locator('p.muted') },
          { wait: 1500 },
        ] },
      ],
    },
  };
};
