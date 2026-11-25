// Fraction tiles: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Prove 1/2 = 2/4" (a 1/2 tile, covered exactly
// by 1/4 tiles).
const tiles = label => `#mp-content .mp-piece[aria-label="Piece ${label}"]`;
const tile = (label, n = 0) => page => page.locator(tiles(label)).nth(n);
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
const corner = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + dx, y: b.y + dy }; };
/** A tile's place on the plane (style left and top), its width and its state. */
const at = (label, n = 0) => page => tile(label, n)(page).evaluate(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height), g: e.classList.contains('grouped'), on: e.classList.contains('on'), filled: e.querySelector('.mp-face').style.background !== 'transparent' }));
/** The middle of a wheel button, as a spot (a scroll would close the wheel). */
const wbtn = k => async page => { const b = await page.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });

export default h => {
  const { txt, count, sel, all, beside } = h;
  let before = null;
  return {
    'fraction-tiles': {
      title: 'Fraction tiles: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Fraction tiles', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a tile in the palette to put it on the board.', do: [
          { click: '#mp-palette [aria-label="Add 1/2 tile"]', expect: count(tiles('1/2'), 1) },
        ] },
        { say: 'Drag a tile to move it. Hold it for its actions.', do: [
          { drag: tile('1/2'), to: near(tile('1/2'), 30, 100), expect: async p => (await at('1/2')(p)).y > 1040 || 'the tile did not move' },
          hold(tile('1/2'), sel('.mp-wheel .mp-wbtn[data-wk="fill"]')),
          { move: wbtn('copy') },
          { wait: 300 },
          { move: wbtn('fill') },
          { wait: 400 },
        ] },
        { say: 'Fill turns a tile into an outline, and back.', do: [
          { click: wbtn('fill'), expect: async p => (!(await at('1/2')(p)).filled && (await p.locator('.mp-wheel').count()) === 0) || 'not an outline' },
          { wait: 700 },
          hold(tile('1/2'), sel('.mp-wheel .mp-wbtn[data-wk="fill"]')),
          { click: wbtn('fill'), expect: async p => (await at('1/2')(p)).filled || 'not filled again' },
        ] },
        { say: 'Today’s task: show that 1/2 is the same as 2/4.', do: [
          { click: '#mp-palette [aria-label="Add 1/4 tile"]', expect: count(tiles('1/4'), 1) },
          { click: '#mp-palette [aria-label="Add 1/4 tile"]', expect: count(tiles('1/4'), 2) },
        ] },
        { say: 'Drag a 1/4 tile under the 1/2. It snaps into place.', do: [
          { drag: tile('1/4', 0), to: async p => { const b = await (await loc(p, tile('1/2'))).boundingBox(), q = await (await loc(p, tile('1/4', 0))).boundingBox(); return { x: b.x + q.width / 2 + 3, y: b.y + b.height + q.height / 2 + 4 }; },
            expect: async p => { const [a, b] = [await at('1/4', 0)(p), await at('1/2')(p)]; return (a.x === b.x && a.y === b.y + b.h && a.g) || `1/4 at ${a.x},${a.y}, not under 1/2 at ${b.x},${b.y + b.h}`; } },
        ] },
        { say: 'Two fourths fill the same length as one half.', poster: true, do: [
          { drag: tile('1/4', 1), to: async p => { const b = await (await loc(p, tile('1/4', 0))).boundingBox(); return { x: b.x + b.width * 1.5 + 4, y: b.y + b.height / 2 + 3 }; },
            expect: async p => { const [a, b, c] = [await at('1/4', 1)(p), await at('1/4', 0)(p), await at('1/2')(p)]; return (a.x === b.x + b.w && a.y === b.y && a.x + a.w === c.x + c.w) || `the second 1/4 is at ${a.x},${a.y}`; } },
          { move: near(tile('1/4', 1), 110, 0) },
          { wait: 600 },
        ] },
        { say: 'Drag across empty board to select many pieces at once.', do: [
          { drag: async p => { const b = await (await loc(p, tile('1/4', 1))).boundingBox(); return { x: b.x + b.width + 30, y: b.y + b.height + 22 }; },
            to: corner(tile('1/2'), -12, -12),
            expect: txt('#mp-selpill .mp-seln', '3 selected') },
          { move: beside('#mp-selpill', 24) },
          { wait: 500 },
        ] },
        { say: 'Drag one of them and they all move together.', do: [
          { expect: async p => { before = await at('1/4', 1)(p); return true; } },
          { drag: tile('1/2'), to: near(tile('1/2'), 240, 40), expect: async p => { const w = await at('1/4', 1)(p); return (w.x > before.x + 150 && w.on) || 'the selection did not move'; } },
        ] },
        { say: 'Labels can show percents or decimals for new tiles.', do: [
          { type: '#mp-settings select[data-set="mode"]', text: 'Percent', enter: true, expect: all(async p => (await p.locator('#mp-settings select[data-set="mode"]').inputValue()) === 'pct' || 'not set', sel('#mp-palette [aria-label="Add 50% tile"]')) },
          { move: beside('#mp-palette [aria-label="Add 25% tile"]', -60) },
          { wait: 1100 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Prove 1/2 = 2/4' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Prove 1/2 = 2/4' }),
            expect: txt('#mp-tasks .mp-task:has-text("Prove 1/2 = 2/4") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Prove 1/2 = 2/4' }).locator('p').nth(1) },
          { wait: 700 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Prove 1/2 = 2/4' }).locator('p.muted') },
          { wait: 1500 },
        ] },
      ],
    },
  };
};
