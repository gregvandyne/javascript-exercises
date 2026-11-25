// Place value disks: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Break in two ways" (build 34 as 3 tens and
// 4 ones, then as 2 tens and 14 ones).
const PIECE = '#mp-content .mp-piece';
/** The disks of one value (their aria-label is "Piece <value>"). */
const disks = v => `${PIECE}[aria-label="Piece ${v}"]`;
/** The n-th disk of value v. */
const disk = (v, n = 0) => page => page.locator(disks(v)).nth(n);
/** A spot (dx, dy) px from the middle of an element. */
const near = (target, dx, dy) => async page => { const b = await (typeof target === 'string' ? page.locator(target).first() : await target(page)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** A long press on an element (the wheel opens after 450 ms): a drag that stays put. */
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });
/** Each disk's place on the plane (its style left and top), by value. */
const placesOf = v => page => page.locator(disks(v)).evaluateAll(els => els.map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), on: e.classList.contains('on') })));

export default h => {
  const { txt, count, sel, all, beside } = h;
  const total = n => txt('#mp-total', `Total ${n}`);
  let before = null;   // where the selected ones were before they were dragged
  return {
    'place-value-disks': {
      title: 'Place value disks: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Place value disks', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a disk in the palette to put it on the board.', do: [
          { click: '#mp-palette [aria-label="Add 10 disk"]', expect: count(disks(10), 1) },
          { click: '#mp-palette [aria-label="Add 10 disk"]', expect: count(disks(10), 2) },
          { click: '#mp-palette [aria-label="Add 10 disk"]', expect: count(disks(10), 3) },
        ] },
        { say: 'Today’s task: build 34, then break it a second way.', do: [
          { click: '#mp-palette [aria-label="Add 1 disk"]', expect: count(disks(1), 1) },
          { click: '#mp-palette [aria-label="Add 1 disk"]', expect: count(disks(1), 2) },
          { click: '#mp-palette [aria-label="Add 1 disk"]', expect: count(disks(1), 3) },
          { click: '#mp-palette [aria-label="Add 1 disk"]', expect: all(count(disks(1), 4), total(34)) },
        ] },
        { say: 'The total at the top keeps count: 3 tens and 4 ones.', do: [
          { spot: '#mp-total', ms: 2200, expect: total(34) },
        ] },
        { say: 'Drag a disk to move it.', do: [
          { drag: disk(10, 0), to: near(disk(10, 0), 0, 190), expect: async p => (await placesOf(10)(p)).some(d => d.y > 1100) || 'no ten disk was moved down' },
        ] },
        { say: 'Hold a disk to open its actions, then pick Break.', do: [
          hold(async p => { const i = (await placesOf(10)(p)).findIndex(d => d.y > 1100); return p.locator(disks(10)).nth(i); }, sel('.mp-wheel .mp-wbtn[data-wk="break"]')),
          { move: '.mp-wheel .mp-wbtn[data-wk="break"]' },
          { click: '.mp-wheel .mp-wbtn[data-wk="break"]', expect: all(count(disks(10), 2), count(disks(1), 14), count('.mp-wheel', 0)) },
        ] },
        { say: 'Now it is 2 tens and 14 ones. The total is still 34.', poster: true, do: [
          { spot: '#mp-total', ms: 2200, expect: total(34) },
        ] },
        { say: 'Drag across empty board to select many pieces at once.', do: [
          { drag: async p => { const ds = (await placesOf(1)(p)); const i = ds.findIndex(d => d.y > 1100); return near(disk(1, i), -31, -34)(p); },
            to: async p => { const ds = (await placesOf(1)(p)); let i = 0; ds.forEach((d, k) => { if (d.x + d.y > ds[i].x + ds[i].y) i = k; }); return near(disk(1, i), 36, 34)(p); },
            expect: all(txt('#mp-selpill .mp-seln', '10 selected'), sel('#mp-selpill .mp-seldel')) },
          { scroll: '#mp-selpill' },
          { move: beside('#mp-selpill', 24) },
          { wait: 1000 },
        ] },
        { say: 'Drag one of them and they all move together.', do: [
          { expect: async p => { before = (await placesOf(1)(p)).filter(d => d.on); return before.length === 10 || `${before.length} ones selected`; } },
          { drag: async p => { const i = (await placesOf(1)(p)).findIndex(d => d.on); return p.locator(disks(1)).nth(i); },
            to: async p => { const i = (await placesOf(1)(p)).findIndex(d => d.on); return near(disk(1, i), 330, 0)(p); },
            expect: async p => { const now = (await placesOf(1)(p)).filter(d => d.on); return (now.length === 10 && now.every((d, i) => d.x > before[i].x + 150)) || 'the selected ones did not all move'; } },
        ] },
        { say: 'Tap one of ten ones, then Regroup makes them one ten.', do: [
          { click: async p => { const ds = (await placesOf(1)(p)).map((d, i) => ({ ...d, i })).filter(d => d.on).sort((a, b) => a.y - b.y || a.x - b.x); return p.locator(disks(1)).nth(ds[2].i); },
            expect: all(count(`${disks(1)}.on`, 1), async p => (await p.locator('#mp-selpill').isHidden()) || 'the pill is still shown') },
          { click: '#mp-palette [aria-label="Regroup 10 → 1"]', expect: all(count(disks(10), 3), count(disks(1), 4), total(34)) },
          { scroll: disk(10, 2), center: true },
          { move: near(disk(10, 2), 70, 10) },
          { wait: 900 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Break in two ways' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Break in two ways' }),
            expect: txt('#mp-tasks .mp-task:has-text("Break in two ways") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Break in two ways' }).locator('p').nth(1) },
          { wait: 900 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Break in two ways' }).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
