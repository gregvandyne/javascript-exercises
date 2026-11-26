// Money: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Make an amount of cents" (two different ways, then compare how
// many coins each way takes).
const coins = label => `#mp-content .mp-piece[aria-label="Piece ${label}"]`;
const coin = (label, n = 0) => page => page.locator(coins(label)).nth(n);
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** Every coin's place on the plane (style left and top) and whether it is selected. */
const places = page => page.locator('#mp-content .mp-piece').evaluateAll(els => els.map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), on: e.classList.contains('on') })));
/** The middle of a wheel button, as a spot (a scroll would close the wheel). */
const wbtn = k => async page => { const b = await page.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });
const add = name => `#mp-palette .mp-pal[aria-label^="Add ${name},"]`;

export default h => {
  const { txt, count, sel, all, beside } = h;
  const total = t => txt('#mp-total', `Total ${t}`);
  let before = null;
  return {
    money: {
      title: 'Money: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Money', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a coin in the palette to put it on the board.', do: [
          { click: add('Quarter'), expect: count(coins('25¢'), 1) },
          { click: add('Quarter'), expect: count(coins('25¢'), 2) },
        ] },
        { say: 'Today’s task: make 67¢ in two different ways.', do: [
          { click: add('Dime'), expect: count(coins('10¢'), 1) },
          { click: add('Nickel'), expect: count(coins('5¢'), 1) },
          { click: add('Penny'), expect: count(coins('1¢'), 1) },
          { click: add('Penny'), expect: all(count(coins('1¢'), 2), total('$0.67')) },
        ] },
        { say: 'The total at the top counts it for you.', do: [
          { spot: '#mp-total', ms: 2000, expect: total('$0.67') },
        ] },
        { say: 'Drag across empty board to select many pieces at once.', do: [
          { drag: async p => { const b = await (await loc(p, coin('1¢', 1))).boundingBox(); return { x: b.x + b.width + 26, y: b.y + b.height + 30 }; },
            to: async p => { const b = await (await loc(p, coin('25¢', 0))).boundingBox(); return { x: b.x - 10, y: b.y - 12 }; },
            expect: txt('#mp-selpill .mp-seln', '6 selected') },
          { scroll: '#mp-selpill' },
          { move: beside('#mp-selpill', 24) },
          { wait: 500 },
        ] },
        { say: 'Drag one of them and they all move together.', do: [
          { expect: async p => { before = await places(p); return true; } },
          { drag: coin('25¢', 0), to: near(coin('25¢', 0), 60, 130), expect: async p => { const now = await places(p); return (now.every((c, i) => c.on && c.y > before[i].y + 100)) || 'the selection did not move'; } },
        ] },
        { say: 'Way two: hold a quarter and pick Delete.', do: [
          hold(coin('25¢', 1), sel('.mp-wheel .mp-wbtn[data-wk="delete"]')),
          { move: wbtn('copy') },
          { wait: 300 },
          { click: wbtn('delete'), expect: all(count(coins('25¢'), 1), count('.mp-wheel', 0), total('$0.42')) },
        ] },
        { say: 'Trade it for two dimes and a nickel. Still 67¢.', poster: true, do: [
          { click: add('Dime'), expect: count(coins('10¢'), 2) },
          { click: add('Dime'), expect: count(coins('10¢'), 3) },
          { click: add('Nickel'), expect: all(count(coins('5¢'), 2), total('$0.67')) },
          { spot: '#mp-total', ms: 1800, expect: total('$0.67') },
        ] },
        { say: 'Turn Totals off so the class counts it themselves.', do: [
          { click: '#mp-settings [data-view="totals"]', expect: all(txt('#mp-settings [data-view="totals"]', 'Totals: off'), async p => !(await p.locator('#mp-total').isVisible()) || 'the total still shows') },
          { wait: 900 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 16) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Make an amount of cents' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Make an amount of cents' }),
            expect: txt('#mp-tasks .mp-task:has-text("Make an amount of cents") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Make an amount of cents' }).locator('p').nth(1) },
          { wait: 700 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Make an amount of cents' }).locator('p.muted') },
          { wait: 1500 },
        ] },
      ],
    },
  };
};
