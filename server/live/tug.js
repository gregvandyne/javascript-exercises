// Tug of Math Live (built-in mode 'tug', docs/decisions.md "Tug of Math goes live"): two teams, Blue Whales against
// Red Foxes, every player answers maths questions on their own device's keypad, and every right answer pulls the rope
// toward their team. The server makes each player's questions with the game's own generator (server/live/tug-gen.js,
// read from seed-games/tug-of-math.html) and checks every answer itself; the rope moves by team averages, so a team of
// 9 and a team of 10 pull just as hard. The room runs in services/classlive-tug.js.
// Starter id: 'tug:<grade 1-8>:<seconds 60|90|120, or 0 for "to the line">'.

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8];
/** Match lengths in seconds; 0 is "to the line" (with a time cap, CAP). */
export const LENS = [60, 90, 120, 0];
/** How far the rope must go to win: a lead of this many right answers per player. */
export const LINE = 5;
/** "To the line" ends after this many seconds at the latest (the team ahead wins, as in the solo game). */
export const CAP = 180;
/** Points for a right answer (a seat's score; team scores are the same points, averaged per player). */
export const POINTS = 100;
/** The two teams: presets 0 (Blue Whales, a circle) and 6 (Red Foxes, a diamond), ranked by the average per player. */
export const TEAMS = { n: 2, presets: [0, 6], scoring: 'avg' };
/** The least time between two answers from one player: after a right one, and after a wrong one (the game shows the
 *  right answer for a moment). Answers sooner than that are dropped (a held key, a script). */
export const GAP_MS = { right: 300, wrong: 1000 };
/** How long everyone sees who won before the results. */
export const HOLD_MS = 3000;
/** The rope's shared state goes out at most this often (ms). */
export const SEND_MS = 200;
export const DEFAULT_ID = 'tug:3:90';

/** 'tug:<grade>:<len>' -> { grade, len } | null */
export function parseId(id) {
  const m = /^tug:([1-8]):(\d{1,3})$/.exec(String(id || ''));
  if (!m || !LENS.includes(+m[2])) return null;
  return { grade: +m[1], len: +m[2] };
}
export const makeId = ({ grade = 3, len = 90 } = {}) => `tug:${GRADES.includes(+grade) ? +grade : 3}:${LENS.includes(+len) ? +len : 90}`;
