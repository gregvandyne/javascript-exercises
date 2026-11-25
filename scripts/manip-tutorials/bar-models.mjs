// Bar models: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Part-part-whole: pets" (a class has 24 pets: 15
// are dogs, the rest are cats).
const BAR = '#mp-content .mp-obj.k-bar-models';
const label = (b, s) => `${BAR} .mp-seglabel[data-bar="${b}"][data-seg="${s}"]`;
const size = (b, s) => `${BAR} .mp-segval[data-bar="${b}"][data-seg="${s}"]`;
const step = (b, s, d) => `${BAR} [data-act="seg"][data-bar="${b}"][data-seg="${s}"][data-d="${d}"]`;
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** A part's top left corner, clear of its name, number and buttons (a tap there selects the part). */
const corner = css => async page => { const b = await page.locator(css).first().boundingBox(); return { x: b.x + 12, y: b.y + 8 }; };

export default h => {
  const { txt, count, sel, all } = h;
  /** The parts of the first bar: [label, value] each. */
  const parts = want => async page => {
    const got = await page.locator(`${BAR} .mp-bar`).first().locator('.mp-seg').evaluateAll(els => els.map(e => [e.querySelector('.mp-seglabel').value, e.querySelector('.mp-segval') ? e.querySelector('.mp-segval').value : e.querySelector('.mp-steps b').textContent]));
    return JSON.stringify(got) === JSON.stringify(want) || `parts ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`;
  };
  const whole = n => txt(`${BAR} .mp-barname`, `Whole · total ${n}`);
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Part-part-whole: pets' });
  return {
    'bar-models': {
      title: 'Bar models: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Bar models', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Pick a layout from the palette, like Part-part-whole.', do: [
          { click: '#mp-palette [aria-label="Part-part-whole"]', expect: all(count(`${BAR} .mp-bar`, 1), parts([['Part', '4'], ['Part', '4']]), whole(8)) },
        ] },
        { say: 'Today’s task: a class has 24 pets, and 15 are dogs.', do: [
          { move: near(`${BAR} .mp-barname`, 120, 0) },
          { wait: 1200 },
        ] },
        { say: 'Type in a part to give it a name.', do: [
          { type: label(0, 0), text: 'Dogs', expect: parts([['Dogs', '4'], ['Part', '4']]) },
          { type: label(0, 1), text: 'Cats', expect: parts([['Dogs', '4'], ['Cats', '4']]) },
        ] },
        { say: 'Tap a part’s number and type its size.', do: [
          { type: size(0, 0), text: '15', enter: true, expect: all(parts([['Dogs', '15'], ['Cats', '4']]), whole(19)) },
          { type: size(0, 1), text: '9', enter: true, expect: all(parts([['Dogs', '15'], ['Cats', '9']]), whole(24)) },
        ] },
        { say: '− and + still change a part by one.', do: [
          { click: step(0, 1, 1), expect: parts([['Dogs', '15'], ['Cats', '10']]) },
          { click: step(0, 1, -1), expect: all(parts([['Dogs', '15'], ['Cats', '9']]), whole(24)) },
        ] },
        { say: '15 dogs and 9 cats make 24 pets.', poster: true, do: [
          { move: near(`${BAR} .mp-barname`, 140, 0) },
          { wait: 1600 },
        ] },
        { say: 'Add a part from the palette.', do: [
          { click: '#mp-palette [aria-label="Add a part"]', expect: all(parts([['Dogs', '15'], ['Cats', '9'], ['Part', '1']]), whole(25)) },
        ] },
        { say: 'Tap a part to select it, then press Delete.', do: [
          { click: corner(`${BAR} .mp-seg[data-seg="2"]`), expect: all(count(`${BAR} .mp-seg.on`, 1), txt(`${BAR} .mp-segdel`, '🗑 Delete Part')) },
          { wait: 400 },
          { click: `${BAR} .mp-segdel`, expect: all(parts([['Dogs', '15'], ['Cats', '9']]), count(`${BAR} .mp-segdel`, 0), whole(24)) },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Part-part-whole: pets") p.muted', /^Teacher note: Drawing the bar before computing/) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
