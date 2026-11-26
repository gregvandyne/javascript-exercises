// Two-Color Counters in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way
// a student would: counters from the palette (the first dragged into the ten-frame's first cell, the next ones follow
// into the next cells; into a part of the part-part-whole mat one by one), Flip and Delete on the hold-to-edit wheel.
import { wait } from './common.js';
import { pieces, newest, add, center, dragPt, mapper, wheelDo } from './pieces.js';
import { ppwParts } from '../../../public/js/manip-tasks/two-color-counters.js';

const PAL = { pos: 'Add Yellow counter', neg: 'Add Red counter', blue: 'Add Blue counter', green: 'Add Green counter' };
const cond = (v, t) => (v.answer.board || []).find(c => c.t === t) || null;
const count = (ui, k) => pieces(ui, k).count();
/** Add counters until there are `has` of each kind on the board (anywhere). */
async function addUpTo(ui, has) { for (const [k, n] of Object.entries(has)) { const m = n - await count(ui, k); if (m > 0) await add(ui, PAL[k], m); } }
/** n counters of a kind into the ten-frame: the first dragged into the first empty cell, the rest follow. */
async function intoFrame(ui, kind, n) {
  if (!n) return;
  await add(ui, PAL[kind]);
  await center(ui);
  const used = await count(ui, null), cell = ui.scope.locator('#mp-content .mp-obj.k-ten-frame .mp-frame > div').nth(used - 1);
  const b = await cell.boundingBox(); await dragPt(ui, newest(ui), b.x + b.width / 2, b.y + b.height / 2);
  await add(ui, PAL[kind], n - 1);
}
/** Counters of `list` into a part of the part-part-whole mat, each at its own spot (rows from the part's top left). */
async function intoPart(ui, v, part, list, skip = 0) {
  const o = v.setup.objects.find(x => x.k === 'ppw'), r = ppwParts(o)[part], per = Math.max(1, Math.floor((r.w - 8) / 54));
  for (const [i, kind] of list.entries()) {
    const j = i + skip, px = r.x + 6 + (j % per) * 54 + 24, py = r.y + 6 + Math.floor(j / per) * 54 + 24;
    await add(ui, PAL[kind]);
    await center(ui);
    const p = (await mapper(ui, o.id, { x: o.x, y: o.y, w: 440 * o.s }))(px, py), b = await newest(ui).boundingBox();
    if (Math.hypot(b.x + b.width / 2 - p.x, b.y + b.height / 2 - p.y) > 6) await dragPt(ui, newest(ui), p.x, p.y);
  }
}
async function remove(ui, kind, n) { for (let i = 0; i < n; i++) await wheelDo(ui, pieces(ui, kind).last(), 'delete'); }
async function flip(ui, kind, n) { for (let i = 0; i < n; i++) await wheelDo(ui, pieces(ui, kind).last(), 'flip'); }
const nums = v => v.prompt.match(/\d+/g).map(Number);

const RECIPES = {
  'fill-the-ten-frame': async (ui, v) => { const c = cond(v, 'frame'), [k, n] = Object.entries(c.has)[0]; await intoFrame(ui, k, n - await count(ui, k)); },
  'zero-pairs': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'part-part-whole-hunt': async (ui, v) => {
    const c = cond(v, 'ppw'); if (await count(ui, null)) return;
    await intoPart(ui, v, 'a', Array(c.a.pos).fill('pos')); await intoPart(ui, v, 'b', Array(c.b.neg).fill('neg'));
  },
  'subtracting-a-negative': async (ui, v) => {
    // zero pairs first, then the red ones taken away
    const b = nums(v)[1]; if (await count(ui, 'pos') >= cond(v, 'counts').has.pos) return;
    await add(ui, PAL.pos, b); await add(ui, PAL.neg, b); await remove(ui, 'neg', b);
  },
  'make-10-in-a-frame': async (ui, v) => {
    const c = cond(v, 'frame'); if (await count(ui, null)) return;
    await intoFrame(ui, 'pos', 10); await flip(ui, 'pos', c.has.neg);
  },
  'integer-climb': async (ui, v) => { const b = nums(v)[1]; if (!await count(ui, 'pos')) await add(ui, PAL.pos, b); },
  'two-colors-one-total': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'probability-counters': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'groups-of-counters': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'negative-take-away': async (ui, v) => {
    const b = nums(v)[1]; if (await count(ui, 'neg') >= cond(v, 'counts').has.neg) return;
    await add(ui, PAL.neg, b); await add(ui, PAL.pos, b); await remove(ui, 'pos', b);
  },
  'fraction-of-a-set': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'pattern-with-counters': async (ui, v) => addUpTo(ui, cond(v, 'counts').has),
  'balance-the-mat': async (ui, v) => { const c = cond(v, 'ppw'); if (!await count(ui, 'neg')) await intoPart(ui, v, 'b', Array(c.b.neg).fill('neg')); },
  'zero-pair-detective': async ui => {
    while (await count(ui, 'pos') && await count(ui, 'neg')) { await remove(ui, 'pos', 1); await remove(ui, 'neg', 1); }
  },
  'double-and-halve': async (ui, v) => {
    const want = cond(v, 'counts').has.pos;
    if (/Double/.test(v.prompt)) await add(ui, PAL.neg, want - await count(ui, 'neg'));
    else await flip(ui, 'pos', await count(ui, 'pos') - want);
  },
  'add-unlike-signs': async (ui, v) => {
    const [a, b] = nums(v); if (await count(ui, null)) return;
    await add(ui, PAL.pos, a); await add(ui, PAL.neg, b);
    for (let i = Math.min(a, b); i > 0; i--) { await remove(ui, 'pos', 1); await remove(ui, 'neg', 1); }
  },
};
export async function build(ui, v) {
  const r = RECIPES[v.id.split('/')[1]];
  if (r) { await r(ui, v); await wait(ui, 80); }   // (counters for data is answered in the box and the choices)
}
