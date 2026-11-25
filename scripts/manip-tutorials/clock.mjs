// The clock's quick tutorial (scripts/manip-tutorials.mjs loads it). Task: "Time tracker challenge" (from 10:30, add 15
// minutes four times).
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
  const pal = label => `#mp-palette [aria-label="${label}"]`;
  /** The hour hand's angle (degrees from the 12) is h hours on the dial. */
  const hourAt = h => async page => {
    const a = await page.locator(`${FACE} line[stroke="#E53935"][stroke-width="8"]`).first().evaluate(l => ((Math.atan2(+l.getAttribute('y2') - 110, +l.getAttribute('x2') - 110) * 180) / Math.PI + 450) % 360);
    return Math.abs(a - h * 30) < 1 || `the hour hand is at ${a.toFixed(1)}°, wanted ${h * 30}°`;
  };
  const TASK = page => page.locator('#mp-tasks .mp-task', { hasText: 'Time tracker challenge' });
  return {
    clock: {
      title: 'Clock: a quick tour',
      sub: 'Oomba Manipulatives',
      end: ['Clock', 'Find it in Teaching tools, Manipulatives.'],
      top: '#mp-board',
      steps: [
        { say: 'Drag near the middle for the red hour hand. The minutes follow.', do: [
          { drag: dial(9.25, 40), to: dial(9 + 55 / 60, 40), expect: all(shows('9:55'), hourAt(9 + 55 / 60)) },
        ] },
        { say: 'Drag the blue minute hand past 12, and the hour moves on.', do: [
          { drag: dial(11, 78), to: dial(1, 78), expect: all(shows('10:05'), txt('#mp-content .mp-hm', '10:05')) },
        ] },
        { say: 'Back past 12, and the hour goes back.', do: [
          { drag: dial(1, 78), to: dial(11, 78), expect: shows('9:55') },
          { drag: dial(11, 78), to: dial(1, 78), expect: shows('10:05') },
        ] },
        { say: 'At 10:30 the hour hand is halfway between 10 and 11.', do: [
          { drag: dial(1, 78), to: dial(6, 78), expect: all(shows('10:30'), hourAt(10.5)) },
          { move: beside(FACE, 30) },
          { wait: 1200 },
        ] },
        { say: 'Today’s task: from 10:30, add 15 minutes four times.', do: [
          { click: pal('Start the tracker here'), expect: elapsed('Start 10:30 · Elapsed 0 h 0 min') },
          { click: pal('Time tracker +15 min'), expect: all(shows('10:45, 15 minutes since 10:30'), elapsed(/Elapsed 0 h 15 min$/)) },
          { click: pal('Time tracker +15 min'), expect: elapsed(/Elapsed 0 h 30 min$/) },
          { click: pal('Time tracker +15 min'), expect: elapsed(/Elapsed 0 h 45 min$/) },
          { click: pal('Time tracker +15 min'), expect: all(shows('11:30, 60 minutes since 10:30'), elapsed(/Elapsed 1 h 0 min$/), sel(`${FACE} .mp-cring`)) },
          { move: beside(FACE, 30) },
        ] },
        { say: 'Four 15s make an hour: a light ring and +1 h.', poster: true, do: [
          { wait: 1800 },
        ] },
        { say: 'Totals off hides the digital time, so students read the face.', do: [
          { click: '#mp-settings [data-view="totals"]', expect: all(txt('#mp-settings [data-view="totals"]', 'Totals: off'), count('#mp-content .mp-hm', 0), count('#mp-content .mp-elapsed b', 0)) },
          { move: beside(FACE, 30) },
          { wait: 1200 },
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
