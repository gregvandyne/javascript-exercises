// Base Ten Blocks in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would: blocks from the palette (the first of a kind dragged into its column of the chart, the rest follow it
// there by themselves), Regroup 10 → 1 on a tapped block, and Break or Delete on the hold-to-edit wheel.
import { wait, palette, wheel, dragTo } from './common.js';
import { hasOf, decHasOf } from '../../../public/js/manip-tasks/base-ten-blocks.js';

const NAME = { cube: 'Cube', flat: 'Flat', rod: 'Rod', unit: 'Unit', one: 'One', tenth: 'Tenth', hundredth: 'Hundredth' };
const COL = { cube: 'Thousands', flat: 'Hundreds', rod: 'Tens', unit: 'Ones', one: 'Ones', tenth: 'Tenths', hundredth: 'Hundredths' };
const pieces = (ui, kind) => ui.scope.locator(`#mp-content .mp-piece[data-kind="${kind}"]:not(.locked)`);
const column = (ui, kind) => ui.scope.locator('#mp-content .mp-obj.k-pv-chart .mp-pvchart > div', { has: ui.scope.locator('.mp-pvname', { hasText: new RegExp(`^${COL[kind]}$`) }) }).first();
async function inColumn(ui, piece, kind) {
  const a = await piece.boundingBox(), b = await column(ui, kind).boundingBox();
  if (!a || !b) return false;
  const cx = a.x + a.width / 2, cy = a.y + a.height / 2;
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
}
/** Add n blocks of a kind from the palette; into: their column of the chart (the first dragged there, the rest follow). */
export async function add(ui, kind, n, { into = false } = {}) {
  for (let i = 0; i < n; i++) {
    await palette(ui, `Add ${NAME[kind]},`).click(); await wait(ui, 90);
    if (into && i === 0) {
      await wait(ui, 300);   // (the new block's short pop first)
      const p = pieces(ui, kind).last();
      if (!await inColumn(ui, p, kind)) await dragTo(ui, p, column(ui, kind));
      if (!await inColumn(ui, pieces(ui, kind).last(), kind)) throw new Error(`${kind} not in ${COL[kind]}: ${JSON.stringify([await pieces(ui, kind).last().boundingBox(), await column(ui, kind).boundingBox()])}`);
    }
  }
}
/** Add the blocks of `has` (biggest first). */
export async function addAll(ui, has, opts) { for (const k of ['cube', 'flat', 'rod', 'unit', 'one', 'tenth', 'hundredth']) if (has[k]) await add(ui, k, has[k], opts); }
/** Tap a block of a kind, then Regroup 10 → 1, while there are ten or more of it (smallest kinds first). */
export async function regroupAll(ui, kinds) {
  for (const k of kinds) {
    while (await pieces(ui, k).count() >= 10) {
      await pieces(ui, k).first().click(); await wait(ui, 80);
      await palette(ui, 'Regroup').click(); await wait(ui, 250);
    }
  }
}
export const breakOne = async (ui, kind) => wheel(ui, pieces(ui, kind).first(), 'break');
export async function remove(ui, kind, n) { for (let i = 0; i < n; i++) await wheel(ui, pieces(ui, kind).last(), 'delete'); }

const cond = (v, t) => (v.answer.board || []).find(c => c.t === t) || null;
const RECIPES = {
  'build-1-139': async (ui, v) => { await addAll(ui, hasOf(cond(v, 'total').n), { into: true }); await breakOne(ui, 'flat'); },
  'regroup-to-a-cube': async ui => { await pieces(ui, 'flat').first().click(); await wait(ui, 80); await palette(ui, 'Regroup').click(); await wait(ui, 250); },
  '346-278-with-blocks': async (ui, v) => { const b = Number(v.prompt.match(/\d+/g)[1]); await addAll(ui, hasOf(b)); await regroupAll(ui, ['unit', 'rod', 'flat']); },
  'decimal-build-2-35': async (ui, v) => { await addAll(ui, decHasOf(Math.round(cond(v, 'total').n * 100)), { into: true }); await breakOne(ui, 'tenth'); },
  'build-and-read-2-048': async (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'add-with-one-regroup': async (ui, v) => { const b = Number(v.prompt.match(/Add (\d+)/)[1]); await addAll(ui, hasOf(b)); await regroupAll(ui, ['unit', 'rod', 'flat']); },
  'subtract-with-breaking': async (ui, v) => {
    const b = Number(v.prompt.match(/Take away (\d+)/)[1]);
    await breakOne(ui, 'flat'); await breakOne(ui, 'rod');
    await remove(ui, 'rod', Math.floor(b / 10)); await remove(ui, 'unit', b % 10);
  },
  'multiply-by-10': async (ui, v) => addAll(ui, hasOf(cond(v, 'total').n)),
  'decimal-add-1-7-0-85': async (ui, v) => { const b = v.prompt.match(/Add (\d\.\d\d)/)[1]; await addAll(ui, decHasOf(Math.round(Number(b) * 100))); await regroupAll(ui, ['hundredth', 'tenth']); },
  'round-with-blocks': async (ui, v) => addAll(ui, hasOf(cond(v, 'total').n)),
  'thousand-cube-build': async ui => { await add(ui, 'unit', 1); await regroupAll(ui, ['unit', 'rod', 'flat']); },
  'zero-in-the-middle': async (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
};
export async function build(ui, v) {
  const key = v.id.split('/')[1], r = RECIPES[key];
  if (r) await r(ui, v);   // (the other tasks are answered in the box and the choices only)
}
