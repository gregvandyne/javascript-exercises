// The clock's quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Time tracker challenge".
export default ({ txt, count, attr, sel, beside, all }) => {
  const FACE = '#mp-content svg.mp-clock';
  /** A spot on the (first) clock face: toward the number n on the dial (12 at the top), r units from the middle (the face
   *  is 220 units across; manip.js bindClocks: under 58 from the middle is the hour hand, else the minute hand). */
  const dial = (n, r) => async page => {
    const b = await page.locator(FACE).first().boundingBox();
    const a = (n / 12) * 2 * Math.PI - Math.PI / 2, k = b.width / 220;
    return { x: b.x + b.width / 2 + Math.cos(a) * r * k, y: b.y + b.height / 2 + Math.sin(a) * r * k };
  };
  const shows = hm => attr(FACE, 'aria-label', `Clock showing ${hm}`);
  const elapsed = re => txt('#mp-content .mp-elapsed', re);
  const pal = label => `#mp-palette [aria-label="Add ${label}"]`;
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Time tracker challenge' });
  return {
    clock: {
      title: 'Clock: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Clock', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Drag near the middle to turn the red hour hand.', do: [
          { drag: dial(9.25, 40), to: dial(10.2, 40), expect: shows('10:15') },
        ] },
        { say: 'Drag near the edge to turn the blue minute hand.', do: [
          { drag: dial(3, 78), to: dial(5, 78), expect: shows('10:25') },
        ] },
        { say: 'Or use the buttons: Hour + and Min +5.', do: [
          { click: '#mp-content [data-act="min5"]', expect: all(shows('10:30'), txt('#mp-content .mp-clockwrap .mp-barname', '10:30')) },
        ] },
        { say: 'Today’s task: from 10:30, add 15 minutes four times.', do: [
          { move: pal('Start the tracker here') },
          { wait: 900 },
        ] },
        { say: 'Start the tracker here, then tap Time tracker +15 min.', do: [
          { click: pal('Start the tracker here'), expect: elapsed('Start 10:30 · Elapsed 0 h 0 min') },
          { click: pal('Time tracker +15 min'), expect: all(shows('10:45, 15 minutes since 10:30'), elapsed(/Elapsed 0 h 15 min$/)) },
          { click: pal('Time tracker +15 min'), expect: elapsed(/Elapsed 0 h 30 min$/) },
          { click: pal('Time tracker +15 min'), expect: elapsed(/Elapsed 0 h 45 min$/) },
        ] },
        { say: 'The yellow shows the time since the start.', do: [
          { move: beside(FACE, 30) },
          { wait: 1300 },
        ] },
        { say: 'Tap +15 once more. Four 15s make an hour.', do: [
          { click: pal('Time tracker +15 min'), expect: all(shows('11:30, 60 minutes since 10:30'), elapsed(/Elapsed 1 h 0 min$/), sel(`${FACE} .mp-cring`)) },
          { move: beside(FACE, 30) },
          { wait: 500 },
        ] },
        { say: 'Each full hour adds a light ring and +1 h.', poster: true, do: [
          { wait: 1700 },
        ] },
        { say: 'Add another clock from the palette. Each keeps its own time.', do: [
          { click: pal('a clock'), expect: count(FACE, 2) },
          { wait: 900 },
        ] },
        { say: 'Every task has its prompt and a teacher note, below the board.', do: [
          { click: '#mp-tasksmore', expect: count('#mp-tasks .mp-task', 16) },
          { scroll: TASK, center: true },
          { spot: TASK, expect: txt('#mp-tasks .mp-task:has-text("Time tracker challenge") p.muted', /^Teacher note: Four 15s make an hour: 11:30\./) },
          { move: page => TASK(page).locator('p').nth(1) },
          { wait: 900 },
          { move: page => TASK(page).locator('p.muted') },
          { wait: 1800 },
        ] },
      ],
    },
  };
};
