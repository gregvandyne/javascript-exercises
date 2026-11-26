// Place Value Disks in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would: disks from the palette (the first of a kind dragged into its column of the chart, the rest follow it
// there by themselves), Regroup 10 → 1 on a tapped disk, and Break or Delete on the hold-to-edit wheel.
import { wait, palette, wheel, dragTo } from './common.js';
import { hasOf, hasOfMilli, COL } from '../../../public/js/manip-tasks/place-value-disks.js';
import { allPieceDefs } from '../../../public/js/manip-data.js';

const LABEL = Object.fromEntries(allPieceDefs('place-value-disks').map(d => [d.kind, d.label]));
const ORDER = ['m', 'hth', 'tth', 'th', 'h', 't', 'o', 'tenth', 'hund', 'thou'];
const pieces = (ui, kind) => ui.scope.locator(`#mp-content .mp-piece[data-kind="${kind}"]:not(.locked)`);
const column = (ui, kind) => ui.scope.locator('#mp-content .mp-obj.k-pv-chart .mp-pvchart > div', { has: ui.scope.locator('.mp-pvname', { hasText: new RegExp(`^${COL[kind]}$`) }) }).first();
async function inColumn(ui, piece, kind) {
  const a = await piece.boundingBox(), b = await column(ui, kind).boundingBox();
  if (!a || !b) return false;
  const cx = a.x + a.width / 2, cy = a.y + a.height / 2;
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
}
/** Add n disks of a kind from the palette; into: their column of the chart (the first dragged there, the rest follow). */
export async function add(ui, kind, n, { into = false } = {}) {
  for (let i = 0; i < n; i++) {
    await ui.scope.locator(`#mp-palette [data-pal][aria-label="Add ${LABEL[kind]} disk"]`).click(); await wait(ui, 90);
    if (into && i === 0) {
      await wait(ui, 300);   // (the new disk's short pop first)
      const p = pieces(ui, kind).last();
      if (!await inColumn(ui, p, kind)) await dragTo(ui, p, column(ui, kind));
      if (!await inColumn(ui, pieces(ui, kind).last(), kind)) throw new Error(`${kind} not in ${COL[kind]}`);
    }
  }
}
export async function addAll(ui, has, opts) { for (const k of ORDER) if (has[k]) await add(ui, k, has[k], opts); }
/** Tap a disk of a kind, then Regroup 10 → 1, while there are ten or more of it (smallest kinds first). */
export async function regroupAll(ui, kinds) {
  for (const k of kinds) {
    while (await pieces(ui, k).count() >= 10) {
      await pieces(ui, k).first().click(); await wait(ui, 80);
      await palette(ui, 'Regroup').click(); await wait(ui, 250);
    }
  }
}
const breakOne = async (ui, kind) => wheel(ui, pieces(ui, kind).first(), 'break');
async function remove(ui, kind, n) { for (let i = 0; i < n; i++) await wheel(ui, pieces(ui, kind).last(), 'delete'); }
const cond = (v, t) => (v.answer.board || []).find(c => c.t === t) || null;
const nums = v => v.prompt.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(\.\d+)?/g).map(Number);

const RECIPES = {
  'build-40-206': (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'ten-times-bigger': (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'break-to-subtract': async (ui, v) => {
    const b = Number(v.prompt.match(/Take away (\d+)/)[1]);
    await breakOne(ui, 't'); await remove(ui, 't', Math.floor(b / 10)); await remove(ui, 'o', b % 10);
  },
  'decimal-disks-0-405': async (ui, v) => { await addAll(ui, hasOf(cond(v, 'total').n), { into: true }); await breakOne(ui, 'tenth'); },
  'disk-race-to-a-million': async (ui, v) => {
    const kind = (await ui.scope.locator('#mp-content .mp-piece:not(.locked)').first().getAttribute('data-kind'));
    await add(ui, kind, 10 - await pieces(ui, kind).count());
    await regroupAll(ui, [kind]);
  },
  'write-it-three-ways': (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'divide-disks-by-10': (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'subtract-across-zeros': async (ui, v) => {
    const b = Number(v.prompt.match(/Take away (\d+)/)[1]);
    await breakOne(ui, 'th'); await breakOne(ui, 'h'); if (b % 10) await breakOne(ui, 't');
    await remove(ui, 't', Math.floor(b / 10)); await remove(ui, 'o', b % 10);
  },
  'multiply-disks': async (ui, v) => {
    const [n, k] = nums(v), has = hasOf(n);
    for (const kd of ORDER) if (has[kd]) await add(ui, kd, has[kd] * (k - 1), { into: true });
    await regroupAll(ui, ['o', 't', 'h']);
  },
  'smallest-and-largest': (ui, v) => addAll(ui, hasOf(cond(v, 'total').n), { into: true }),
  'thousandths-build': async (ui, v) => {
    const [t0, k] = nums(v);
    await addAll(ui, hasOfMilli(Math.round(t0 * 1000)), { into: true }); await add(ui, 'thou', k);
    await regroupAll(ui, ['thou']);
  },
  'population-talk': async (ui, v) => {
    const total = cond(v, 'total').n, now = hasOf(Number(v.prompt.replace(/,/g, '').match(/has (\d+)/)[1])), want = hasOf(total);
    for (const kd of ORDER) if ((want[kd] || 0) > (now[kd] || 0)) await add(ui, kd, want[kd] - (now[kd] || 0), { into: true });
  },
  'disk-fractions-link': ui => breakOne(ui, 'tenth'),
  'break-in-two-ways': async (ui, v) => { await addAll(ui, hasOf(cond(v, 'total').n), { into: true }); await breakOne(ui, 't'); },
};
export async function build(ui, v) {
  const key = v.id.split('/')[1], r = RECIPES[key];
  if (r) await r(ui, v);   // (the other tasks are answered in the box and the choices only)
}
