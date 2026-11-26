// Linking Cubes in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would: a stick is its first cube dragged to a spot on the mat and the rest tapped in from the palette (each
// joins the end of the stick); an array's next row starts with a cube dropped under the first cube of the row above
// (it snaps there) and the rest tapped in; a mirror half starts with a cube dropped at the end of the locked stick.
import { wait } from './common.js';
import { pieces, newest, add, center, dragPt, mapper, dropBeside } from './pieces.js';
import { CUBE } from '../../../public/js/manip-tasks/linking-cubes.js';

const PAL = k => `Add ${CUBE[+k.slice(1)][0].toUpperCase()}${CUBE[+k.slice(1)].slice(1)} cube`;
const cond = (v, t, i = 0) => (v.answer.board || []).filter(c => c.t === t)[i] || null;
const HEAD = 30;
/** The mat (by label, else the first) and plane-to-screen for it. */
async function matOf(ui, v, label = '') {
  await center(ui);
  const o = v.setup.objects.find(x => x.k === 'mat' && (!label || x.st.label === label)) || v.setup.objects[0];
  // (map is read again before each drag: a tap on a palette button low in the list scrolls the page)
  return { o, map: async () => { await center(ui); return mapper(ui, o.id, { x: o.x, y: o.y, w: o.st.w }); }, at: { x: o.x + 20, y: o.y + HEAD + 20 } };
}
/** A stick of these kinds whose first cube's top left is at plane (px, py). -> the first cube's locator */
async function stickAt(ui, map, px, py, kinds) {
  await add(ui, PAL(kinds[0]));
  const id = await newest(ui).getAttribute('data-pid'), p = (await map())(px + 20, py + 20);
  await dragPt(ui, newest(ui), p.x, p.y);
  for (const k of kinds.slice(1)) await add(ui, PAL(k));
  return ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
}
/** Sticks one under another from the mat's top left, `gap` apart. */
async function sticks(ui, v, list, { label = '', gap = 100, dy = 0 } = {}) {
  const m = await matOf(ui, v, label);
  for (const [i, ks] of list.entries()) await stickAt(ui, m.map, m.at.x, m.at.y + dy + i * gap, ks);
}
/** An array of r rows of c cubes of one kind: row by row, each row's first cube dropped under the row above's first. */
async function array(ui, v, r, c, kind, at = null) {
  const m = await matOf(ui, v), start = at || m.at;
  let first = await stickAt(ui, m.map, start.x, start.y, Array(c).fill(kind));
  for (let i = 1; i < r; i++) {
    await add(ui, PAL(kind));
    const id = await newest(ui).getAttribute('data-pid');
    await center(ui); await dropBeside(ui, newest(ui), first, 'below');
    first = ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
    for (let j = 1; j < c; j++) await add(ui, PAL(kind));
  }
}
const run = (k, n) => Array(n).fill(k);
const kindsOf = has => Object.entries(has).flatMap(([k, n]) => run(k, n));

const RECIPES = {
  'build-and-break-8': async (ui, v) => {
    const [a, b] = cond(v, 'sticks').sizes, n = a + b, c = [1, 2, 3, 4].find(x => x !== a && x !== b);
    await sticks(ui, v, [run('c0', a), run('c5', b)], { label: 'Way 1' });
    await sticks(ui, v, [run('c0', c), run('c5', n - c)], { label: 'Way 2' });
  },
  'cube-bar-graph': async (ui, v) => sticks(ui, v, cond(v, 'bars').bars.map(x => run(x.kind, x.n))),
  'arrays-for-12': async (ui, v) => { const r = cond(v, 'rect'), [k] = Object.keys(cond(v, 'counts').has); await array(ui, v, r.r, r.c, k); },
  'staircase-sums': async (ui, v) => sticks(ui, v, cond(v, 'sticks').sizes.map(n => run('c3', n))),
  'train-lengths': async (ui, v) => sticks(ui, v, cond(v, 'sticks').sizes.map((n, i) => run(`c${i}`, n))),
  'measure-with-cubes': async (ui, v) => { for (const c of v.answer.board) await sticks(ui, v, [run('c1', c.sizes[0])], { label: c.on }); },
  'make-a-meter-of-cubes': async (ui, v) => {
    const c = cond(v, 'tens'), list = [...Array(c.k).fill(run('c6', 10)), ...(c.extra ? [run('c6', c.extra)] : [])];
    await sticks(ui, v, list, { gap: 70 });
  },
  'cube-trains-for-15': async (ui, v) => sticks(ui, v, cond(v, 'bars').bars.map(x => run(x.kind, x.n))),
  'volume-by-cubes': async (ui, v) => { const r = cond(v, 'rect'); await array(ui, v, r.r, r.c, 'c4'); },
  'symmetry-tower': async (ui, v) => {
    const ks = [...cond(v, 'mirror').pattern].reverse();
    await add(ui, PAL(ks[0]));
    await center(ui); await dropBeside(ui, newest(ui), ui.scope.locator('#mp-content .mp-piece.locked').last(), 'right');
    for (const k of ks.slice(1)) await add(ui, PAL(k));
  },
  'equal-groups': async (ui, v) => sticks(ui, v, cond(v, 'sticks').sizes.map(n => run('c2', n)), { gap: 60 }),
  'cube-fractions': async (ui, v) => sticks(ui, v, [kindsOf(cond(v, 'stickHas').has)]),
  'perimeter-with-cubes': async (ui, v) => {
    const c = cond(v, 'inside'), [k] = Object.keys(cond(v, 'counts').has);
    await array(ui, v, c.r, c.c, k, { x: c.box.x + 6, y: c.box.y + 6 });
  },
  'number-bond-tower': async (ui, v) => sticks(ui, v, [kindsOf(cond(v, 'stickHas').has)]),
  'scaling-a-model': async (ui, v) => sticks(ui, v, [kindsOf(cond(v, 'counts').has)], { dy: 90 }),
  'missing-cubes': async (ui, v) => { const [x] = cond(v, 'bars').bars; await sticks(ui, v, [run(x.kind, x.n)], { dy: 90 }); },
};
export async function build(ui, v) {
  if (await pieces(ui).count()) return;   // (built already)
  const r = RECIPES[v.id.split('/')[1]];
  if (r) { await r(ui, v); await wait(ui, 80); }
}
