// Linking Cubes: a quick tour (scripts/manip-tutorials.mjs plays it). The task: "Build and break 8"
// (public/js/manip-tasks.js): a stick of 8 in two colors, split into two parts, then split a different way.
export default ({ txt, count, sel, all }) => {
  const PIECE = '#mp-content .mp-piece';
  const pal = label => page => page.locator('#mp-palette .mp-pal', { hasText: label }).first();
  const cube = i => page => page.locator(PIECE).nth(i);
  const box = async (page, i) => page.locator(PIECE).nth(i).boundingBox();
  /** Cube i's middle, moved left until it meets the cube before it, and a little lower (a piece only starts to move
   *  after 10 px; the snap lines it up again). A drag there snaps them together. */
  const against = i => async page => { const a = await box(page, i - 1), b = await box(page, i); return { x: b.x + b.width / 2 - (b.x - (a.x + a.width)) + 1, y: b.y + b.height / 2 + 8 }; };
  /** The snapped sticks' sizes, largest first: grouped cubes (manip.js pieceHtml .grouped) side by side and touching. */
  const groups = (...want) => async page => {
    const rects = await page.locator(PIECE).evaluateAll(els => els.map(e => ({ g: e.classList.contains('grouped'), ...e.getBoundingClientRect().toJSON() })));
    const n = rects.length, up = [...Array(n).keys()], find = x => (up[x] === x ? x : (up[x] = find(up[x])));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const A = rects[a], B = rects[b];
      if (A.g && B.g && Math.abs(A.top - B.top) < 2 && (Math.abs(A.right - B.left) < 2 || Math.abs(B.right - A.left) < 2)) up[find(a)] = find(b);
    }
    const size = {}; rects.forEach((r, i) => { if (r.g) size[find(i)] = (size[find(i)] || 0) + 1; });
    const got = Object.values(size).sort((a, b) => b - a);
    return JSON.stringify(got) === JSON.stringify(want) || `sticks of [${got}], wanted [${want}]`;
  };
  const onBoard = (dx, dy) => async page => { const b = await page.locator('#mp-board').boundingBox(); return { x: b.x + dx, y: b.y + dy }; };
  const task = page => page.locator('#mp-tasks .mp-task', { hasText: 'Build and break 8' });
  const tap = (label, n) => ({ click: pal(label), expect: count(PIECE, n) });
  const join = (i, ...want) => ({ drag: cube(i), to: against(i), expect: groups(...want) });
  let before = null;
  const spots = page => page.locator(PIECE).evaluateAll(els => els.map(e => [parseFloat(e.style.left), parseFloat(e.style.top)]));
  return {
    'linking-cubes': {
      title: 'Linking Cubes: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Linking Cubes', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      setup: page => page.evaluate(() => { for (let i = 0; i < 2; i++) document.querySelector('#mp-zoom [data-view="in"]').click(); }),
      steps: [
        { say: 'Today’s task: a stick of 8 in two colors. Tap to add cubes.', do: [
          tap('Red cube', 1), tap('Red cube', 2), tap('Red cube', 3), tap('Red cube', 4), tap('Red cube', 5),
          tap('Blue cube', 6), tap('Blue cube', 7), tap('Blue cube', 8),
        ] },
        { say: 'Drag a cube against another. It snaps on.', do: [
          join(1, 2), join(2, 3),
        ] },
        { say: 'Snap the rest the same way: 5 red and 3 blue.', do: [
          join(3, 4), join(4, 5), join(6, 5, 2), join(7, 5, 3),
        ] },
        { say: 'Drag a stick and its cubes move along. 5 + 3 = 8.', poster: true, do: [
          join(5, 8),
          { wait: 500 },
        ] },
        { say: 'Hold a cube, then slide it away to break the stick: 7 and 1.', do: [
          { drag: cube(7), to: async page => { await page.waitForTimeout(1200); const b = await box(page, 7); return { x: b.x + b.width / 2 + 40, y: b.y + b.height / 2 + 110 }; },
            expect: all(groups(7), count(`${PIECE}.grouped`, 7), count('.mp-wheel', 0)) },
        ] },
        { say: 'Drag across empty space to select several at once.', do: [
          { drag: async page => { const b = await box(page, 7); return { x: b.x + b.width + 60, y: b.y + b.height + 40 }; },
            to: async page => { const b = await box(page, 0); return { x: b.x + 20, y: b.y + 20 }; },
            expect: all(txt('#mp-selpill .mp-seln', '8 selected'), count(`${PIECE}.on`, 8)) },
        ] },
        { say: 'Drag one, and they all move together.', do: [
          { drag: cube(3), to: async page => { before = await spots(page); const b = await box(page, 3); return { x: b.x + b.width / 2 + 120, y: b.y + b.height / 2 + 140 }; },
            expect: async page => { const now = await spots(page); return (now.length === 8 && now.every((p, i) => p[0] - before[i][0] > 50 && p[1] - before[i][1] > 50)) || 'the cubes did not all move'; } },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: task, center: true },
          { spot: task, expect: txt('#mp-tasks .mp-task:has-text("Build and break 8") p.muted', /^Teacher note: Record every split on the board\./) },
          { move: page => task(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => task(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
