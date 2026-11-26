// The coordinate grid: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task
// keeps its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's grid objects: st.pts [{ x, y, color, ln }] (the points, in the order plotted), st.shut (the lines closed into
// shapes) and st.four (all four quadrants). Points of one color (and line number, ln) join into a line in the order
// plotted when Lines are on (manip-board.js xyLines). The grids start without labels next to the points; the table
// beside the grid lists what was plotted. Every variation hides the board's totals.
import { boardWith, rowPlaces, objSizeOf } from '../manip-task-kit.js';
import { xyLines, xyKey } from '../manip-board.js';

export const SLUG = 'xy-coordinate-board';
const RED = '#E53935';

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A grid's state: four quadrants or the first, its points [[x, y]...], Lines on or off. */
const gridSt = ({ four = false, pts = [], connect = false, label = '' } = {}) => ({ four, labels: false, connect, arrows: false, table: true, color: RED,
  pts: pts.map(([x, y]) => ({ x, y, color: RED })), shut: [], ...(label ? { label } : {}) });
export function gridBoard(opts = {}) {
  const st = gridSt(opts), [at] = rowPlaces([objSizeOf(SLUG, SLUG, st)]);
  return boardWith(SLUG, [{ id: 'g1', k: SLUG, x: at.x, y: at.y, s: 1, st }]);
}
/** The same board with these points plotted after the ones there (in order, red); close: closed into a shape; four:
 *  switched to four quadrants (which clears the grid first, as the page does). */
function solved(setup, pts, { close = false, four = null } = {}) {
  const b = JSON.parse(JSON.stringify(setup)), st = b.objects.find(o => o.k === SLUG).st;
  if (four !== null && four !== st.four) { st.four = four; st.pts = []; st.shut = []; }
  st.pts.push(...pts.map(([x, y]) => ({ x, y, color: RED })));
  if (close) { st.shut = [xyKey(RED, 0)]; st.connect = true; }
  return b;
}

// ---------------------------------------------------------------- the checks
const gridOf = (c, b) => { const gs = ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object'); return (c.label ? gs.find(o => o.st.label === c.label) : gs.filter(o => !o.st.q).pop()) || null; };
const ptsOf = g => (g && Array.isArray(g.st.pts) ? g.st.pts : []).filter(p => p && typeof p === 'object').map(p => ({ x: num(p.x, NaN), y: num(p.y, NaN), color: p.color, ln: p.ln }));
const at = (list, [x, y]) => list.some(p => p.x === x && p.y === y);
/** Does a list of points run through want in order (or the other way)? closed: from any start. */
function sameRun(got, want, closed) {
  const n = want.length; if (got.length !== n) return false;
  const eq = (i0, dir) => want.every((w, i) => { const p = got[(((i0 + dir * i) % n) + n) % n]; return p.x === w[0] && p.y === w[1]; });
  for (const dir of [1, -1]) for (let i0 = 0; i0 < (closed ? n : 1); i0++) if (eq(dir === 1 ? i0 : (closed ? i0 : n - 1), dir)) return true;
  return false;
}
export const conds = {
  /** These points are plotted (only: and no others). */
  pts: (c, b) => { const ps = ptsOf(gridOf(c, b)); return (c.pts || []).every(w => at(ps, w)) && (!c.only || ps.length === (c.pts || []).length); },
  /** A line (Lines on) runs through these points in order; closed: closed into a shape, from any of its points. */
  line: (c, b) => {
    const g = gridOf(c, b); if (!g || g.st.connect === false) return false;
    const ps = ptsOf(g);
    return xyLines(g.st.pts || [], g.st.shut || []).some(L => (!c.closed || L.closed) && sameRun(L.idx.map(i => ps[i]), c.pts || [], !!c.closed));
  },
  /** All four quadrants are on. */
  four: (c, b) => { const g = gridOf(c, b); return !!g && !!g.st.four === !!c.on; },
  /** At least n different points with x = v (axis 'x') or y = v (axis 'y'). */
  count: (c, b) => { const ps = ptsOf(gridOf(c, b)).filter(p => p[c.axis] === c.v); return new Set(ps.map(p => `${p.x},${p.y}`)).size >= num(c.n, 1); },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const P = ([x, y]) => `(${x}, ${y})`;
const PK = ([x, y]) => `(${x},${y})`;
const list = ps => (ps.length < 2 ? ps.map(P).join('') : `${ps.slice(0, -1).map(P).join(', ')} and ${P(ps[ps.length - 1])}`);
const shuffled = (R, options, right) => { const o = R.shuffle(options); return { options: o, correct: o.indexOf(right) }; };
const nz = (R, lo, hi) => { let v; do { v = R.int(lo, hi); } while (!v); return v; };
const plotHint = 'Tap the grid where the point goes: across to x first, then up (or down) to y.';
const plot = (pts, say) => ({ t: 'pts', pts, say: say || `Plot ${list(pts)}.` });
const QUAD = ['Quadrant I', 'Quadrant II', 'Quadrant III', 'Quadrant IV'];
const quadOf = ([x, y]) => (x > 0 ? (y > 0 ? 0 : 3) : (y > 0 ? 1 : 2));
const rule = (m, b) => `y = ${m === 1 ? '' : m === -1 ? '−' : m < 0 ? `−${-m}` : m}x${b ? ` + ${b}` : ''}`;

export const TASKS = [
  T('plot-the-treasure', 'Plot the treasure', '5.G.A.1', '5',
    'Plot three or four points, connect them in order and close the shape. What shape have you made?',
    'x first, along the corridor, then y, up the stairs. Swapped coordinates are the number one error; the shape exposes them.',
    R => {
      const kind = R.pick(['tri', 'rect', 'sq']);
      let pts;
      if (kind === 'tri') { do { pts = [0, 1, 2].map(() => [R.int(1, 11), R.int(1, 11)]); } while ((pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) === (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1])); }
      else {
        let x, y, w, h;
        do { x = R.int(1, 7); y = R.int(1, 7); w = R.int(2, 12 - x); h = kind === 'sq' ? w : R.int(2, 12 - y); } while (y + h > 12 || (kind === 'rect' && w === h));
        pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; pts = [...pts.slice(R.int(0, 3)), ...pts].slice(0, 4);
      }
      const name = { tri: 'Triangle', rect: 'Rectangle (not a square)', sq: 'Square' }[kind], opts = ['Triangle', 'Rectangle (not a square)', 'Square'];
      const setup = gridBoard({ connect: true });
      return {
        prompt: `Plot ${list(pts)} in that order, then tap the first point again to close the shape. What shape have you made?`,
        setup, answer: { board: [plot(pts), { t: 'line', pts, closed: true, say: 'Plot the points in the order given, then close the shape.' }], choice: { options: opts, correct: opts.indexOf(name), say: 'Count the sides and check whether they are all the same length.' } },
        hints: [plotHint, 'Tap the first point again (or Close the shape) to join the last point back to it.', kind === 'tri' ? 'Three sides and three corners: a triangle.' : kind === 'sq' ? 'Four square corners and four sides of the same length: a square.' : 'Four square corners, but two sides are longer: a rectangle.'],
        explain: kind === 'tri' ? 'Three points that are not in a line make a triangle.' : `The sides go straight across and straight up, so every corner is a right angle. ${kind === 'sq' ? 'All four sides are the same length: a square.' : 'The sides are not all the same length: a rectangle.'}`,
        solution: { board: solved(setup, pts, { close: true }), choice: opts.indexOf(name) },
      };
    }),
  T('growing-pattern-table', 'Growing pattern table', '6.EE.C.9', '6',
    'Plot four points from a growing pattern, spot the rule, and predict y for a bigger x.',
    'y = 2x + 1, so (10, 21). Children who extend the line on the board first guess better than those who only stare at the table.',
    R => {
      const opts = []; for (let m = 1; m <= 3; m++) for (let b = 0; b <= 4; b++) if (4 * m + b <= 12) opts.push([m, b]);
      const [m, b] = R.pick(opts), X = R.int(6, 12), pts = [1, 2, 3, 4].map(x => [x, m * x + b]), y = m * X + b, setup = gridBoard({});
      return {
        prompt: `Plot ${list(pts)}. Look at the table: how does y grow when x goes up by 1? Predict: what is y when x is ${X}?`,
        setup, answer: { board: [plot(pts)], box: { key: String(y), label: `y when x is ${X}` } },
        hints: [plotHint, `Each time x goes up by 1, y goes up by ${m}. When x is 0, y would be ${b}.`, `The rule is ${rule(m, b)}: ${m} × ${X}${b ? ` + ${b}` : ''} = ${y}.`],
        explain: `The pattern grows by ${m} each step: ${rule(m, b)}. So when x is ${X}, y is ${y}: the point (${X}, ${y}).`,
        solution: { board: solved(setup, pts), box: String(y) },
      };
    }),
  T('four-quadrant-tour', 'Four quadrant tour', '6.NS.C.6b', '6',
    'Switch to all four quadrants. Plot four points that differ only in their signs, connect them and name the shape.',
    'A rectangle centered on the origin. Sign errors land points in the wrong quadrant, which the symmetry makes easy to spot.',
    R => {
      const a = R.int(1, 9), b = R.int(1, 9), pts = [[a, b], [-a, b], [-a, -b], [a, -b]], sq = a === b, setup = gridBoard({ connect: true });
      const opts = ['Triangle', 'Rectangle (not a square)', 'Square'], name = sq ? 'Square' : 'Rectangle (not a square)';
      return {
        prompt: `Set Quadrants to All four quadrants. Plot ${list(pts)} in order and close the shape. What shape is it?`,
        setup, answer: { board: [{ t: 'four', on: true, say: 'Set Quadrants to All four quadrants first.' }, plot(pts), { t: 'line', pts, closed: true, say: 'Plot the points in the order given, then close the shape.' }], choice: { options: opts, correct: opts.indexOf(name), say: 'Compare how wide and how tall the shape is.' } },
        hints: ['Quadrants is in the grid\'s settings. A negative x is left of the y-axis; a negative y is below the x-axis.', plotHint, sq ? `It is ${2 * a} wide and ${2 * b} tall, with square corners: a square.` : `It is ${2 * a} wide and ${2 * b} tall, with square corners: a rectangle.`],
        explain: `The points differ only in their signs, so each is a mirror image of another across an axis. The shape is ${2 * a} wide and ${2 * b} tall, centered on (0, 0): ${sq ? 'a square' : 'a rectangle'}.`,
        solution: { board: solved(setup, pts, { close: true, four: true }), choice: opts.indexOf(name) },
      };
    }),
  T('same-x-same-y', 'Same x, same y', '8.F.A.1', '8',
    'Plot three points with the same x and three with the same y. Pick what each set makes.',
    'Vertical and horizontal lines appear without any teaching of equations of lines. Name them x = 4 and y = −2 at the end.',
    R => {
      const a = nz(R, -7, 7), b = nz(R, -7, 7), ask = R.pick(['x', 'y']), setup = gridBoard({ four: true });
      const xs = [1, 2, 3].map(i => [a, b + (b > 0 ? -i - 1 : i + 1)]), ys = [1, 2, 3].map(i => [a + (a > 0 ? -i - 1 : i + 1), b]);
      const right = ask === 'x' ? 'A straight up-and-down line' : 'A straight side-to-side line';
      const choice = { ...shuffled(R, ['A straight up-and-down line', 'A straight side-to-side line', 'A slanted line'], right), say: `Look at where the points with the same ${ask} sit.` };
      return {
        prompt: `Plot three points with x = ${a} and three other points with y = ${b}. What do the points with ${ask} = ${ask === 'x' ? a : b} make?`,
        setup, answer: { board: [{ t: 'count', axis: 'x', v: a, n: 3, say: `Plot three points whose x is ${a}.` }, { t: 'count', axis: 'y', v: b, n: 3, say: `Plot three points whose y is ${b}.` }], choice },
        hints: [`For x = ${a}, any y works: for example ${list(xs)}.`, `For y = ${b}, any x works: for example ${list(ys)}.`, `Same x: an up-and-down line called x = ${a}. Same y: a side-to-side line called y = ${b}.`],
        explain: `Points with the same x line up straight up and down (the line x = ${a}); points with the same y line up side to side (the line y = ${b}).`,
        solution: { board: solved(setup, [...xs, ...ys]), choice: choice.correct },
      };
    }),
  T('reflections', 'Reflections', '8.G.A.1', '8',
    'Plot a point and reflect it across the y-axis and across the x-axis. Plot all three and type one of the reflections.',
    'Reflections flip one sign at a time: (-3, 2) and (3, -2). The symmetry on the board makes sign rules memorable.',
    R => {
      const a = nz(R, -9, 9), b = nz(R, -9, 9), ry = [-a, b], rx = [a, -b], ask = R.pick(['y', 'x']), key = PK(ask === 'y' ? ry : rx), setup = gridBoard({ four: true });
      return {
        prompt: `Plot (${a}, ${b}). Reflect it across the y-axis and plot that point, then reflect (${a}, ${b}) across the x-axis and plot that one too. Where does the reflection across the ${ask}-axis land?`,
        setup, answer: { board: [plot([[a, b], ry, rx])], box: { key, kind: 'point', label: 'the point, like (2, -3)', say: `Across the ${ask}-axis, only one of the signs changes.` } },
        hints: [plotHint, 'Across the y-axis, the point flips left and right: x changes sign. Across the x-axis it flips up and down: y changes sign.', `Across the ${ask}-axis: ${P(ask === 'y' ? ry : rx)}.`],
        explain: `Reflecting across the y-axis changes the sign of x: ${P(ry)}. Across the x-axis it changes the sign of y: ${P(rx)}. The distance to the axis stays the same.`,
        solution: { board: solved(setup, [[a, b], ry, rx]), box: key },
      };
    }),
  T('line-of-points', 'Line of points', '6.EE.C.9', '6',
    'Plot the points where y is always the same amount more than x. Pick what the points do and predict another point.',
    'They form a straight line with rule y = x + 2. Children should predict the next point before plotting it.',
    R => {
      const k = R.int(1, 5), n = R.int(3, Math.min(6, 12 - k)), X = R.int(n + 2, n + 8), pts = Array.from({ length: n + 1 }, (_, x) => [x, x + k]), setup = gridBoard({});
      const right = 'They make a straight line going up';
      const choice = { ...shuffled(R, [right, 'They make a curve', 'They go down'], right), say: 'Look at the points from left to right.' };
      return {
        prompt: `Plot the points where y is always ${k} more than x, for x from 0 to ${n}. What do the points do? What is y when x is ${X}?`,
        setup, answer: { board: [plot(pts, `Plot ${list(pts)}.`)], box: { key: String(X + k), label: `y when x is ${X}` }, choice },
        hints: [`Start at (0, ${k}): x is 0, so y is 0 + ${k}.`, `The points are ${list(pts)}. Each step goes 1 across and 1 up.`, `y = x + ${k}: when x is ${X}, y is ${X + k}.`],
        explain: `Every point is 1 across and 1 up from the last, so they make a straight line going up: y = x + ${k}. At x = ${X}, y = ${X + k}.`,
        solution: { board: solved(setup, pts), box: String(X + k), choice: choice.correct },
      };
    }),
  T('distance-on-the-grid', 'Distance on the grid', '6.NS.C.8', '6',
    'Plot two points in a straight line across or up and down, and count how far apart they are.',
    'Vertical distance 5, horizontal distance 5. Counting grid steps along one axis is the method at this stage.',
    R => {
      const vert = R.chance(), c = R.int(-9, 9);
      let u, w; do { u = R.int(-9, 9); w = R.int(-9, 9); } while (Math.abs(u - w) < 2);
      const pts = vert ? [[c, u], [c, w]] : [[u, c], [w, c]], d = Math.abs(u - w), setup = gridBoard({ four: true });
      const cross = Math.sign(u) * Math.sign(w) < 0;
      return {
        prompt: `Plot ${list(pts)}. How far apart are they?`,
        setup, answer: { board: [plot(pts)], box: { key: String(d), label: 'units', say: `Count the steps ${vert ? 'up and down' : 'across'} from one point to the other.` } },
        hints: [`They have the same ${vert ? 'x' : 'y'}, so they are straight ${vert ? 'above each other' : 'across from each other'}.`, cross ? `One is ${Math.abs(u)} from the axis on one side, the other ${Math.abs(w)} on the other side: add them.` : `Both are on the same side of the axis: take the smaller distance from the bigger one.`, `${cross ? `${Math.abs(u)} + ${Math.abs(w)}` : `${Math.max(Math.abs(u), Math.abs(w))} - ${Math.min(Math.abs(u), Math.abs(w))}`} = ${d}.`],
        explain: `The points share ${vert ? 'an x' : 'a y'}, so the distance is the difference of the other numbers: ${d} units.`,
        solution: { board: solved(setup, pts), box: String(d) },
      };
    }),
  T('quadrant-sort', 'Quadrant sort', '6.NS.C.6b', '6',
    'Plot four points, one in each quadrant, and name the quadrant of one of them.',
    'One point per quadrant. Sign pairs decide quadrants: this is the core skill and the board makes it visual.',
    R => {
      const pts = R.shuffle([[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => [sx * R.int(1, 9), sy * R.int(1, 9)])), ask = R.pick(pts), setup = gridBoard({ four: true });
      return {
        prompt: `Plot ${list(pts)}. Which quadrant is ${P(ask)} in?`,
        setup, answer: { board: [plot(pts)], choice: { options: QUAD, correct: quadOf(ask), say: 'Look at the signs of x and y.' } },
        hints: [plotHint, 'Quadrant I is (+, +), top right. Going around the other way: II (−, +), III (−, −), IV (+, −).', `${P(ask)}: x is ${ask[0] > 0 ? 'positive' : 'negative'} and y is ${ask[1] > 0 ? 'positive' : 'negative'}, so ${QUAD[quadOf(ask)]}.`],
        explain: `The signs decide the quadrant: ${P(ask)} has x ${ask[0] > 0 ? '+' : '−'} and y ${ask[1] > 0 ? '+' : '−'}, so it is in ${QUAD[quadOf(ask)]}.`,
        solution: { board: solved(setup, pts), choice: quadOf(ask) },
      };
    }),
  T('shape-translation', 'Shape translation', '8.G.A.1', '8',
    'Plot a triangle, then move every point the same steps right or left and up or down. Plot the new points and type where one corner moves.',
    'Translations add to coordinates: (x + 3, y + 2). The shape does not turn or resize, which children should verify.',
    R => {
      let tri, dx, dy, moved;
      do {
        tri = [0, 1, 2].map(() => [R.int(-7, 5), R.int(-7, 5)]); dx = nz(R, -5, 5); dy = nz(R, -5, 5);
        moved = tri.map(([x, y]) => [x + dx, y + dy]);
      } while ((tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) === (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1]) || moved.some(([x, y]) => Math.abs(x) > 10 || Math.abs(y) > 10) || moved.some(p => tri.some(q => q[0] === p[0] && q[1] === p[1])));
      const i = R.int(0, 2), key = PK(moved[i]), setup = gridBoard({ four: true });
      const mv = `${Math.abs(dx)} ${dx > 0 ? 'right' : 'left'} and ${Math.abs(dy)} ${dy > 0 ? 'up' : 'down'}`;
      return {
        prompt: `Plot the triangle ${list(tri)}. Move every point ${mv}, and plot the new points. Where does ${P(tri[i])} move to?`,
        setup, answer: { board: [plot([...tri, ...moved], `Plot the triangle and all three moved points.`)], box: { key, kind: 'point', label: 'the new point, like (2, -3)', say: `Add ${dx} to x and ${dy} to y.` } },
        hints: [plotHint, `${dx > 0 ? 'Right' : 'Left'} ${Math.abs(dx)} changes x by ${dx}; ${dy > 0 ? 'up' : 'down'} ${Math.abs(dy)} changes y by ${dy}.`, `${P(tri[i])} moves to ${P(moved[i])}.`],
        explain: `A translation adds the same amounts to every point: (x ${dx > 0 ? '+' : '−'} ${Math.abs(dx)}, y ${dy > 0 ? '+' : '−'} ${Math.abs(dy)}). The triangle slides without turning or changing size.`,
        solution: { board: solved(setup, [...tri, ...moved]), box: key },
      };
    }),
  T('table-to-graph', 'Table to graph', '8.F.A.1', '8',
    'A table gives four points. Plot them and pick the rule linking x and y.',
    'Rule is y = 2x + 1. Plotting first often reveals the doubling pattern faster than staring at numbers.',
    R => {
      const opts = []; for (const m of [-3, -2, -1, 1, 2, 3]) for (let b = 0; b <= 12; b++) { const ys = [0, 1, 2, 3].map(x => m * x + b); if (ys.every(y => y >= 0 && y <= 12)) opts.push([m, b]); }
      const [m, b] = R.pick(opts), pts = [0, 1, 2, 3].map(x => [x, m * x + b]), setup = gridBoard({});
      const right = rule(m, b), wrong = [...new Set([rule(-m, b), rule(m, b + m), b ? rule(b, m > 0 ? m : 0) : rule(m, 1), rule(m + (m > 0 ? 1 : -1), b)])].filter(r => r !== right).slice(0, 3);
      const choice = { ...shuffled(R, [right, ...wrong], right), say: 'Check each rule with one of the points.' };
      return {
        prompt: `A table shows ${list(pts)}. Plot them. Which rule links x and y?`,
        setup, answer: { board: [plot(pts)], choice },
        hints: [plotHint, `When x is 0, y is ${b}. Each time x goes up 1, y goes ${m > 0 ? 'up' : 'down'} ${Math.abs(m)}.`, `The rule is ${right}.`],
        explain: `Start at ${b} and change by ${m} for each 1 in x: ${right}. Check: x = 3 gives ${3 * m + b}.`,
        solution: { board: solved(setup, pts), choice: choice.correct },
      };
    }),
  T('midpoint-guess', 'Midpoint guess', '6.NS.C.8', '6',
    'Plot two points, find the point exactly halfway between them, plot it and type its coordinates.',
    'Midpoint is (4, 4), the average of each coordinate. Averaging emerges naturally from the picture.',
    R => {
      let a, b; do { a = [R.int(0, 12), R.int(0, 12)]; b = [R.int(0, 12), R.int(0, 12)]; } while ((a[0] - b[0]) % 2 || (a[1] - b[1]) % 2 || (a[0] === b[0] && a[1] === b[1]) || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 4);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], key = PK(m), setup = gridBoard({});
      return {
        prompt: `Plot ${P(a)} and ${P(b)}. Find the point exactly halfway between them by eye, plot it, and check its coordinates in the table. What is the halfway point?`,
        setup, answer: { board: [plot([a, b, m], 'Plot both points and the point halfway between them.')], box: { key, kind: 'point', label: 'the halfway point, like (4, 4)', say: 'Halfway across and halfway up.' } },
        hints: [plotHint, `Across: halfway between ${a[0]} and ${b[0]} is ${m[0]}. Up: halfway between ${a[1]} and ${b[1]} is ${m[1]}.`, `The halfway point is ${P(m)}.`],
        explain: `Halfway is the average of each coordinate: (${a[0]} + ${b[0]}) ÷ 2 = ${m[0]} and (${a[1]} + ${b[1]}) ÷ 2 = ${m[1]}, so ${P(m)}.`,
        solution: { board: solved(setup, [a, b, m]), box: key },
      };
    }),
  T('negative-slope-talk', 'Negative slope talk', '8.F.B.4', '8',
    'Plot points on a downhill line. Pick the direction and type how much y falls for each step in x.',
    'As x grows by 2, y falls by 2. Direction language (downhill) prepares for slope without formulas.',
    R => {
      let s, d, b; do { s = R.int(1, 3); d = R.int(1, 3); b = R.int(3 * d, 12); } while (3 * s > 12);
      const pts = [0, 1, 2, 3].map(i => [i * s, b - i * d]), setup = gridBoard({}), right = 'Downhill from left to right';
      const choice = { ...shuffled(R, [right, 'Uphill from left to right', 'Flat'], right), say: 'Follow the points from left to right.' };
      return {
        prompt: `Plot ${list(pts)}. Which way does the line go, and how much does y go down each time x goes up by ${s}?`,
        setup, answer: { board: [plot(pts)], box: { key: String(d), label: 'y goes down by', say: 'Compare the y of one point with the next.' }, choice },
        hints: [plotHint, `From ${P(pts[0])} to ${P(pts[1])}: x goes up ${s}, y goes from ${pts[0][1]} to ${pts[1][1]}.`, `${pts[0][1]} - ${pts[1][1]} = ${d}: downhill, ${d} down for every ${s} across.`],
        explain: `Each step ${s} to the right goes ${d} down, so the line goes downhill: y falls by ${d} every time x grows by ${s}.`,
        solution: { board: solved(setup, pts), box: String(d), choice: choice.correct },
      };
    }),
  T('area-on-the-grid', 'Area on the grid', '6.G.A.3', '6',
    'Plot a rectangle from two opposite corners, close it, and find its width, height and area.',
    'Width 4, height 3, area 12 square units. Coordinates give side lengths by subtraction.',
    R => {
      const x1 = R.int(0, 8), y1 = R.int(0, 8), x2 = R.int(x1 + 2, Math.min(12, x1 + 8)), y2 = R.int(y1 + 2, Math.min(12, y1 + 8));
      const pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], w = x2 - x1, h = y2 - y1, setup = gridBoard({ connect: true });
      return {
        prompt: `Plot a rectangle with opposite corners at ${P([x1, y1])} and ${P([x2, y2])}: plot all four corners in order around it and close the shape. What is its area?`,
        setup, answer: { board: [plot(pts, `Plot all four corners: ${list(pts)}.`), { t: 'line', pts, closed: true, say: 'Plot the corners in order around the rectangle, then close the shape.' }], box: { key: String(w * h), label: 'square units' } },
        hints: [`The other two corners are ${P([x2, y1])} and ${P([x1, y2])}.`, `Width: ${x2} - ${x1} = ${w}. Height: ${y2} - ${y1} = ${h}.`, `${w} × ${h} = ${w * h}.`],
        explain: `Subtracting coordinates gives the sides: ${w} wide and ${h} tall, so the area is ${w} × ${h} = ${w * h} square units.`,
        solution: { board: solved(setup, pts, { close: true }), box: String(w * h) },
      };
    }),
  T('ordered-pair-story', 'Ordered pair story', '6.EE.C.9', '6',
    'A walk is told as points (hours, kilometers). Plot them and read the story from the graph.',
    'Context stops plotting being mechanical. A flat section means resting, which children read eagerly.',
    R => {
      let km, rest;
      do { rest = R.int(1, 4); km = [0]; for (let h = 1; h <= 5; h++) km.push(km[h - 1] + (h === rest + 1 ? 0 : R.int(1, 3))); } while (km[5] > 12);
      const pts = km.map((k, h) => [h, k]), q = R.pick(['total', 'part', 'rest']), setup = gridBoard({});
      const a = R.int(0, 3), b = R.int(a + 1, 5);
      const ask = { total: 'How many kilometers did they walk in all?', part: `How many kilometers did they walk from hour ${a} to hour ${b}?`, rest: 'During which hour did they stop to rest?' }[q];
      const restOpts = [1, 2, 3, 4, 5].map(h => `From hour ${h - 1} to hour ${h}`);
      const answer = { board: [plot(pts)] };
      if (q === 'rest') answer.choice = { options: restOpts, correct: rest, say: 'Look for where the graph is flat.' };
      else answer.box = { key: String(q === 'total' ? km[5] : km[b] - km[a]), label: 'kilometers' };
      return {
        prompt: `A walk: each point is (hours, kilometers walked so far): ${list(pts)}. Plot them. ${ask}`,
        setup, answer,
        hints: ['x is the time in hours; y is how far they have walked so far.', q === 'rest' ? 'Where the y does not change, they did not move.' : q === 'total' ? `At hour 5 they had walked ${km[5]} km.` : `At hour ${a} they had walked ${km[a]} km; at hour ${b}, ${km[b]} km.`, q === 'rest' ? `From hour ${rest} to hour ${rest + 1} the distance stays ${km[rest]}: a rest.` : q === 'total' ? `${km[5]} kilometers in all.` : `${km[b]} - ${km[a]} = ${km[b] - km[a]}.`],
        explain: `The graph rises while they walk and stays flat from hour ${rest} to hour ${rest + 1}, while they rest. In all they walked ${km[5]} km.`,
        solution: { board: solved(setup, pts), ...(q === 'rest' ? { choice: rest } : { box: answer.box.key }) },
      };
    }),
  T('symmetry-points', 'Symmetry points', '8.G.A.1', '8',
    'Plot two points level with each other. Find the up-and-down line that would swap them, and plot a point on it.',
    'The mirror line is x = 5, halfway between. Points on the line stay fixed under reflection.',
    R => {
      let a, b; do { a = R.int(0, 11); b = R.int(a + 2, 12); } while ((a + b) % 2);
      const y = R.int(0, 12), m = (a + b) / 2, py = R.pick([0, 1, 2, 3, 9, 10, 11, 12].filter(v => v !== y)), setup = gridBoard({});
      return {
        prompt: `Plot (${a}, ${y}) and (${b}, ${y}). Where is the up-and-down mirror line that would swap them? Plot a point on that line, then type its rule: x = ?`,
        setup, answer: { board: [plot([[a, y], [b, y]]), { t: 'count', axis: 'x', v: m, n: 1, say: 'Plot a point on the mirror line, halfway between the two points.' }], box: { key: String(m), kind: 'poly', label: 'x =', say: 'The mirror line is halfway between the two points.' } },
        hints: [plotHint, `Halfway between ${a} and ${b}: count in from both ends until you meet.`, `(${a} + ${b}) ÷ 2 = ${m}. The line is x = ${m}; for example plot (${m}, ${py}).`],
        explain: `The mirror line is halfway between the points, x = ${m}: each point is ${m - a} away from it. A point on the line stays where it is when reflected.`,
        solution: { board: solved(setup, [[a, y], [b, y], [m, py]]), box: String(m) },
      };
    }),
  T('first-quadrant-map', 'First quadrant map', '5.G.A.2', '5',
    'Plot places on a map grid. Find the route that joins them with two straight moves and how long it is.',
    'Moves are horizontal then vertical, like city blocks. Route length is 5 + 5 = 10 units.',
    R => {
      const places = R.shuffle(['school', 'park', 'shop', 'library', 'pool', 'zoo']).slice(0, 3);
      let a, b, c, d; do { a = R.int(0, 11); b = R.int(0, 11); c = R.int(0, 12); d = R.int(0, 12); } while (a === c || b === d);
      const pts = [[a, b], [c, b], [c, d]], len = Math.abs(c - a) + Math.abs(d - b), setup = gridBoard({});
      return {
        prompt: `Plot a ${places[0]} at ${P(pts[0])}, a ${places[1]} at ${P(pts[1])} and a ${places[2]} at ${P(pts[2])}. Walk from the ${places[0]} to the ${places[1]}, then to the ${places[2]}, along the grid lines. How long is the route?`,
        setup, answer: { board: [plot(pts)], box: { key: String(len), label: 'units' } },
        hints: [plotHint, `${places[0][0].toUpperCase()}${places[0].slice(1)} to the ${places[1]}: straight ${c > a ? 'right' : 'left'} ${Math.abs(c - a)}. ${places[1][0].toUpperCase()}${places[1].slice(1)} to the ${places[2]}: straight ${d > b ? 'up' : 'down'} ${Math.abs(d - b)}.`, `${Math.abs(c - a)} + ${Math.abs(d - b)} = ${len}.`],
        explain: `The route is one straight move across (${Math.abs(c - a)}) and one up or down (${Math.abs(d - b)}), like city blocks: ${len} units in all.`,
        solution: { board: solved(setup, pts), box: String(len) },
      };
    }),
];
