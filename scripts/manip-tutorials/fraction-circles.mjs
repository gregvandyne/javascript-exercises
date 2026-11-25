// Fraction circles: the tutorial scene (scripts/manip-tutorials.mjs). Task: "Bigger: 1/3 or 1/4?" (a third piece and a
// quarter piece side by side: which is bigger, and how do the pieces prove it?).
const SET = '#mp-content .mp-obj.k-fraction-circles';
const PIECES = `${SET} [data-act="turn"]`;
const piece = n => page => page.locator(PIECES).nth(n);
const loc = (page, target) => (typeof target === 'string' ? page.locator(target).first() : target(page));
const near = (target, dx, dy) => async page => { const b = await (await loc(page, target)).boundingBox(); return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy }; };
/** The n-th piece's wedge (its path), to see that a tap turned it. */
const wedge = n => async page => (await page.locator(PIECES).nth(n).locator('path').getAttribute('d')).replace(/-?\d+\.?\d*/g, v => String(Math.round(+v)));
/** The middle of a wheel button, as a spot (a scroll would close the wheel). */
const wbtn = k => async page => { const b = await page.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = (target, expect) => ({ drag: target, to: async page => { const p = await near(target, 0, 0)(page); await page.waitForTimeout(700); return p; }, expect });

export default h => {
  const { txt, count, sel, all } = h;
  let was = null;
  const labels = want => async page => { const got = await page.locator(`${PIECES} text`).allTextContents(); return JSON.stringify(got) === JSON.stringify(want) || `labels ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`; };
  return {
    'fraction-circles': {
      title: 'Fraction circles: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Fraction circles', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Tap a piece in the palette to put it in the fraction set.', do: [
          { click: '#mp-palette [aria-label="Add 1/3 piece"]', expect: all(count(PIECES, 1), labels(['1/3'])) },
        ] },
        { say: 'Today’s task: which is bigger, 1/3 or 1/4?', do: [
          { click: '#mp-palette [aria-label="Add 1/4 piece"]', expect: all(count(PIECES, 2), labels(['1/3', '1/4'])) },
          { move: near(piece(1), 110, 0) },
          { wait: 900 },
        ] },
        { say: 'The set’s total adds up the pieces.', do: [
          { spot: `${SET} .mp-otot`, ms: 1800, expect: txt(`${SET} .mp-otot`, 'Placed 0.58 wholes') },
        ] },
        { say: 'Tap a piece to turn it around its circle.', do: [
          { expect: async p => { was = await wedge(1)(p); return true; } },
          { click: piece(1), expect: async p => (await wedge(1)(p)) !== was || 'the piece did not turn' },
          { wait: 300 },
          { click: piece(1), expect: count(PIECES, 2) },
          { wait: 300 },
          { click: piece(1), expect: count(PIECES, 2) },
          { wait: 300 },
          { click: piece(1), expect: async p => (await wedge(1)(p)) === was || 'not back at the start' },
        ] },
        { say: 'The 1/3 wedge reaches further. One third is bigger.', poster: true, do: [
          { move: near(piece(0), 40, -20) },
          { wait: 1400 },
        ] },
        { say: 'Labels can show fractions, percents or decimals.', do: [
          { type: '#mp-settings select[data-set="mode"]', text: 'Percent', enter: true, expect: labels(['33.3%', '25%']) },
          { move: near(piece(1), 110, 0) },
          { wait: 1000 },
        ] },
        { say: 'Rings view puts every size in one circle to compare.', do: [
          { click: '#mp-palette [aria-label="Rings view"]', expect: sel(`${SET} svg[aria-label="Fraction circle rings"]`) },
          { move: near(`${SET} svg[aria-label="Fraction circle rings"]`, 200, 0) },
          { wait: 1400 },
          { click: '#mp-palette [aria-label="Single circles"]', expect: count(PIECES, 2) },
        ] },
        { say: 'Hold the set’s handle to lock, copy or delete it.', do: [
          { scroll: SET, center: true },
          hold(`${SET} .mp-ohead`, sel('.mp-wheel .mp-wbtn[data-wk="copy"]')),
          { move: wbtn('lock') },
          { wait: 400 },
          { move: wbtn('copy') },
          { wait: 500 },
          { click: near(`${SET}`, 0, 170), expect: count('.mp-wheel', 0) },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 17) },
          { scroll: page => page.locator('#mp-tasks .mp-task', { hasText: 'Bigger: 1/3 or 1/4?' }), center: true },
          { spot: page => page.locator('#mp-tasks .mp-task', { hasText: 'Bigger: 1/3 or 1/4?' }),
            expect: txt('#mp-tasks .mp-task:has-text("Bigger: 1/3 or 1/4?") p.muted', /^Teacher note: /) },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Bigger: 1/3 or 1/4?' }).locator('p').nth(1) },
          { wait: 700 },
          { move: page => page.locator('#mp-tasks .mp-task', { hasText: 'Bigger: 1/3 or 1/4?' }).locator('p.muted') },
          { wait: 1500 },
        ] },
      ],
    },
  };
};
