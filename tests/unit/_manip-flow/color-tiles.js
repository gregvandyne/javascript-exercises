// Color Tiles in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would: a row is its first tile dragged to a spot on the mat and the rest tapped in from the palette (each
// goes right after the last); the next row starts with a tile dropped under the first tile of the row above (it snaps
// there) and the rest tapped in; a locked row is carried on (or a row built under it) from a tile dropped beside it.
import { wait } from './common.js';
import { pieces, newest, add, center, dragPt, mapper, dropBeside } from './pieces.js';
import { TILE } from '../../../public/js/manip-tasks/color-tiles.js';

const PAL = k => `Add ${TILE[+k.slice(1)][0].toUpperCase()}${TILE[+k.slice(1)].slice(1)} tile`;
const cond = (v, t, i = 0) => (v.answer.board || []).filter(c => c.t === t)[i] || null;
const HEAD = 30;
const locked = (ui, i) => ui.scope.locator('#mp-content .mp-piece.locked').nth(i);
const byId = (ui, id) => ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
async function addOne(ui, k) { await add(ui, PAL(k)); return newest(ui).getAttribute('data-pid'); }
/** A mat (by label, else the first), its inside top left and plane-to-screen (read again before each drag: a tap on a
 *  palette button low in the list scrolls the page). */
function matOf(v, label = '') {
  const o = v.setup.objects.find(x => x.k === 'mat' && (!label || x.st.label === label)) || v.setup.objects[0];
  return { o, at: { x: o.x + 24, y: o.y + HEAD + 24 }, map: async ui => { await center(ui); return mapper(ui, o.id, { x: o.x, y: o.y, w: o.st.w }); } };
}
/** Rows of tiles (grid[r][c]: a kind, or null at the end of a short row) from a mat's top left, rows flush. */
async function grid(ui, v, rows, label = '') {
  const m = matOf(v, label);
  let first = null;
  for (const [i, row] of rows.entries()) {
    const ks = row.filter(Boolean), id = await addOne(ui, ks[0]);
    if (!i) { const p = (await m.map(ui))(m.at.x + 26, m.at.y + 26); await dragPt(ui, newest(ui), p.x, p.y); } else { await center(ui); await dropBeside(ui, newest(ui), first, 'below'); }
    first = byId(ui, id);
    for (const k of ks.slice(1)) await add(ui, PAL(k));
  }
}
/** A row carried on from (or built under) a placed tile: the first dropped beside it, the rest tapped in. */
async function besideRow(ui, other, dir, ks) {
  const id = await addOne(ui, ks[0]);
  await center(ui); await dropBeside(ui, newest(ui), other, dir);
  for (const k of ks.slice(1)) await add(ui, PAL(k));
  return byId(ui, id);
}
const fill = (r, c, k) => Array.from({ length: r }, () => Array(c).fill(k));
const kindsOf = has => Object.entries(has).flatMap(([k, n]) => Array(n).fill(k));
const rowsOf = (list, c) => Array.from({ length: Math.ceil(list.length / c) }, (_, i) => list.slice(i * c, i * c + c));
const nums = v => v.prompt.match(/\d+/g).map(Number);

const RECIPES = {
  'copy-the-pattern': async (ui, v) => { const seq = cond(v, 'pattern').seq, n = v.setup.pieces.length; await besideRow(ui, locked(ui, n - 1), 'right', seq.slice(n)); },
  'area-of-a-rectangle': async (ui, v) => { const r = cond(v, 'rect'), [k] = Object.keys(cond(v, 'counts').has); await grid(ui, v, fill(r.r, r.c, k)); },
  'same-area-different-perimeter': async (ui, v) => {
    const r1 = cond(v, 'rect'), [k] = Object.keys(cond(v, 'counts').has), a = cond(v, 'area'), n = a.n;
    await grid(ui, v, fill(r1.r, r1.c, k), 'Rectangle 1');
    const pairs = []; for (let r = 1; r * r <= n; r++) if (n % r === 0 && n / r <= 10) pairs.push([r, n / r]);
    const [r2, c2] = pairs.find(x => x[0] !== Math.min(a.not[0], a.not[1]));
    await grid(ui, v, fill(r2, c2, 't3'), 'Rectangle 2');
  },
  'tile-the-fraction': async (ui, v) => { const r = cond(v, 'rect'); await grid(ui, v, rowsOf(kindsOf(cond(v, 'counts').has), r.c)); },
  'border-pattern': async (ui, v) => {
    const c = cond(v, 'border');
    await grid(ui, v, Array.from({ length: c.r }, (_, i) => Array.from({ length: c.c }, (_, j) => (i === 0 || j === 0 || i === c.r - 1 || j === c.c - 1 ? c.out : c.in))));
  },
  'odd-and-even-areas': async (ui, v) => {
    const a = cond(v, 'area'), [k] = Object.keys(cond(v, 'counts').has); let r = 1;
    if (a.minSide > 1) for (r = 2; a.n % r; r++);
    await grid(ui, v, fill(r, a.n / r, k));
  },
  'halves-of-rectangles': async (ui, v) => { const r = cond(v, 'rect'); await grid(ui, v, rowsOf(kindsOf(cond(v, 'counts').has), r.c)); },
  'multiplication-grid': async (ui, v) => { const c = cond(v, 'split'); await grid(ui, v, Array.from({ length: c.r }, () => [...Array(c.c1).fill(c.a), ...Array(c.c2).fill(c.b)])); },
  'tile-symmetry-quilt': async (ui, v) => {
    const q = v.setup.pieces.map(p => p.kind);   // the locked quarter, row by row: (0,0) (0,1) (1,0) (1,1)
    await besideRow(ui, locked(ui, 1), 'right', [q[1], q[0]]);
    await besideRow(ui, locked(ui, 3), 'right', [q[3], q[2]]);
    const row2 = await besideRow(ui, locked(ui, 2), 'below', [q[2], q[3], q[3], q[2]]);
    await besideRow(ui, row2, 'below', [q[0], q[1], q[1], q[0]]);
  },
  'growing-border': async (ui, v) => { const r = cond(v, 'rect'); await grid(ui, v, fill(r.r, r.c, 't1')); },
  'fraction-wall-tiles': async (ui, v) => { const k = cond(v, 'wallRow').k, [kind] = Object.keys(cond(v, 'counts').has); await besideRow(ui, locked(ui, 0), 'below', Array(k).fill(kind)); },
  'area-challenge-20': async (ui, v) => { const r = cond(v, 'rect'); await grid(ui, v, fill(r.r, r.c, 't5')); },
  'tile-number-line': async (ui, v) => { const ls = cond(v, 'under').labels; await besideRow(ui, locked(ui, ls[0] - 1), 'below', Array(ls.length).fill('t0')); },
  'cover-without-gaps': async (ui, v) => {
    const [r, c, r2, c2] = nums(v);
    await grid(ui, v, Array.from({ length: r }, (_, i) => Array(i < r2 ? c - c2 : c).fill('t4')));
  },
  'ratio-tiles': async (ui, v) => { const has = cond(v, 'counts').has; for (const [k, n] of Object.entries(has)) await add(ui, PAL(k), n); },
};
export async function build(ui, v) {
  if (await pieces(ui).count()) return;   // (built already)
  const r = RECIPES[v.id.split('/')[1]];
  if (r) { await r(ui, v); await wait(ui, 80); }   // (tile a letter and percent tiles are answered in the box and the choices)
}
