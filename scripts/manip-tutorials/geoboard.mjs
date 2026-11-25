// The geoboard's quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Squares of many sizes".
export default ({ txt, attr, beside, all }) => {
  /** A peg on the (first) square board: column c, row r from the top left (manip.js geoPegs: index r * 6 + c). */
  const peg = (c, r) => `#mp-content .mp-peg[data-i="${r * 6 + c}"]`;
  const band = n => txt('#mp-content .mp-obody p.small', `Current band: ${n} pegs.`);
  const total = want => txt('#mp-content .mp-otot', want);
  const pal = label => `#mp-palette [aria-label="Add ${label}"]`;
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Squares of many sizes' });
  return {
    geoboard: {
      title: 'Geoboard: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Geoboard', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Today’s task: make squares of different sizes.', do: [
          { move: beside('#mp-content .mp-obj', 40) },
          { wait: 900 },
        ] },
        { say: 'Tap pegs in order to stretch a band around them.', do: [
          { click: peg(0, 1), expect: band(1) },
          { click: peg(2, 1), expect: band(2) },
          { click: peg(2, 3), expect: band(3) },
          { click: peg(0, 3), expect: band(4) },
        ] },
        { say: 'Close the band to finish the shape.', do: [
          { click: pal('Close the band'), expect: all(band(0), total('Bands 1 · Area about 4.0 square units')) },
          { move: beside('#mp-content .mp-otot', 20) },
          { wait: 700 },
        ] },
        { say: 'Pick a new color, then make a tilted square.', do: [
          { click: '#mp-palette [data-pal="3"]', expect: attr('#mp-palette [data-pal="3"]', 'aria-pressed', 'true') },
          { click: peg(4, 1), expect: band(1) },
          { click: peg(5, 2), expect: band(2) },
          { click: peg(4, 3), expect: band(3) },
          { click: peg(3, 2), expect: band(4) },
          { click: pal('Close the band'), expect: total('Bands 2 · Area about 6.0 square units') },
        ] },
        { say: 'The tilted square has area 2. The total adds both.', poster: true, do: [
          { move: beside('#mp-content .mp-otot', 20) },
          { wait: 1600 },
        ] },
        { say: 'Fill off shows just the bands.', do: [
          { click: '#mp-settings [data-toggle="fill"]', expect: all(txt('#mp-settings [data-toggle="fill"]', 'Fill off'), attr('#mp-content svg.mp-geo polygon', 'fill', 'none')) },
          { move: beside('#mp-content .mp-obj', 40) },
          { wait: 1000 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Squares of many sizes") p.muted', /^Teacher note: Tilted squares are the stretch goal/) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
