// Number rods: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Equivalence trains" (two different two-rod
// trains as long as the black rod, 7).
const rod = (name, n = 0) => page => page.locator(`#mp-content .mp-piece[aria-label$=" ${name}"]`).nth(n);
const rods = name => `#mp-content .mp-piece[aria-label$=" ${name}"]`;
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
/** A spot (dx, dy) px from an element's top-left corner. */
const corner = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + dx, y: b.y + dy }; };
/** A spot (dx, dy) px from an element's middle. */
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** A rod's place on the plane (style left and top), its turn and its outline. */
const at = (name, n = 0) => page => rod(name, n)(page).evaluate(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), rot: /rotate\((\d+)deg\)/.exec(e.style.transform)?.[1], g: e.classList.contains('grouped'), on: e.classList.contains('on') }));
/** Rod a sits just under rod b, left ends lined up (dy: b's height). */
const under = (a, b, n = 0) => async page => { const [p, q] = [await at(a)(page), await at(b, n)(page)]; return (p.x === q.x && p.y === q.y + 30 && p.g) || `${a} is at ${p.x},${p.y}, not under ${b} at ${q.x},${q.y}`; };
/** Rod a sits just after rod b in a train. */
const after = (a, b) => async page => { const [p, q] = [await at(a)(page), await at(b)(page)]; return (p.x === q.x + q.w && p.y === q.y && p.g) || `${a} is at ${p.x},${p.y}, not after ${b} at ${q.x + q.w},${q.y}`; };
/** The middle of a wheel button, as a spot (so the page is not scrolled to it: a scroll closes the wheel). */
const wbtn = k => async page => { const b = await page.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });

export default h => {
  const { txt, count, sel, all, beside } = h;
  let before = null;
  return {
    'number-rods': {
      title: 'Number rods: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Number rods', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a rod in the palette to put it on the board.', do: [
          { click: '#mp-palette [aria-label="Add Rod 7, black"]', expect: count(rods('black'), 1) },
        ] },
        { say: 'Drag a rod to move it. Hold it for its actions.', do: [
          { drag: rod('black'), to: near(rod('black'), 30, 100), expect: async p => (await at('black')(p)).y > 1040 || 'the black rod did not move' },
          hold(rod('black'), sel('.mp-wheel .mp-wbtn[data-wk="copy"]')),
          { move: wbtn('copy') },
          { wait: 400 },
          { move: wbtn('rotate') },
          { wait: 500 },
          { click: near(rod('black'), 0, 150), expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Today’s task: two-rod trains as long as the black rod.', do: [
          { click: '#mp-palette [aria-label="Add Rod 5, yellow"]', expect: count(rods('yellow'), 1) },
          { click: '#mp-palette [aria-label="Add Rod 2, red"]', expect: count(rods('red'), 1) },
        ] },
        { say: 'Drag a rod under another one. It snaps into place.', do: [
          { drag: rod('yellow'), to: async p => { const b = await (await loc(p, rod('black'))).boundingBox(); return { x: b.x + 85 + 3, y: b.y + b.height + 15 + 4 }; }, expect: under('yellow', 'black') },
        ] },
        { say: 'Drag red to the end of yellow: 5 + 2 makes 7.', do: [
          { drag: rod('red'), to: async p => { const b = await (await loc(p, rod('yellow'))).boundingBox(); return { x: b.x + b.width + 34 + 4, y: b.y + 15 + 3 }; }, expect: after('red', 'yellow') },
        ] },
        { say: 'A second train: dark green and white, 6 + 1.', do: [
          { click: '#mp-palette [aria-label="Add Rod 6, dark green"]', expect: count(rods('dark green'), 1) },
          { click: '#mp-palette [aria-label="Add Rod 1, white"]', expect: count(rods('white'), 1) },
          { drag: rod('dark green'), to: async p => { const b = await (await loc(p, rod('yellow'))).boundingBox(); return { x: b.x + 102, y: b.y + b.height + 15 + 2 }; }, expect: under('dark green', 'yellow') },
          { drag: rod('white'), to: async p => { const b = await (await loc(p, rod('dark green'))).boundingBox(); return { x: b.x + b.width + 17 + 4, y: b.y + 15 + 3 }; }, expect: after('white', 'dark green') },
          { move: near(rod('white'), 90, 0) },
          { wait: 300 },
        ] },
        { say: 'Drag across empty board to select many pieces at once.', do: [
          { drag: async p => { const a = await (await loc(p, rod('white'))).boundingBox(), b = await (await loc(p, rod('black'))).boundingBox(); return { x: b.x + b.width + 30, y: a.y + a.height + 18 }; },
            to: corner(rod('black'), -10, -10),
            expect: txt('#mp-selpill .mp-seln', '5 selected') },
          { move: beside('#mp-selpill', 24) },
          { wait: 600 },
        ] },
        { say: 'Drag one of them and they all move together.', do: [
          { expect: async p => { before = await at('white')(p); return true; } },
          { drag: rod('black'), to: near(rod('black'), 220, 60), expect: async p => { const w = await at('white')(p); return (w.x > before.x + 150 && w.on) || 'the selection did not move'; } },
        ] },
        { say: 'Give the white rod a value. The total follows.', do: [
          { type: '#mp-settings select[data-set="unit"]', text: '1/2', enter: true, expect: all(async p => (await p.locator('#mp-settings select[data-set="unit"]').inputValue()) === '0.5' || 'not set', txt('#mp-total', 'Length value 10.5')) },
          { spot: '#mp-total', ms: 2000, expect: txt('#mp-total', 'Length value 10.5') },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Equivalence trains' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Equivalence trains' }),
            expect: txt('#mp-tasks .mp-task:has-text("Equivalence trains") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Equivalence trains' }).locator('p').nth(1) },
          { wait: 700 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Equivalence trains' }).locator('p.muted') },
          { wait: 1500 },
        ] },
      ],
    },
  };
};
