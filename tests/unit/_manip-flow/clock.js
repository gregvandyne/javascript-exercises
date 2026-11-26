// Clock in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built the way a student
// would: Hour + and Min +5 under each clock, the palette's Start the tracker here and Time tracker +15 min, and for a
// time a little earlier the blue minute hand dragged back round the face (it carries the hour back past the 12).
import { wait, palette } from './common.js';

const toMin = c => ((Math.round(+c.h) % 12) + 12) % 12 * 60 + Math.round(+c.m);
const clocks = b => b.objects.filter(o => o.k === 'clock');
const mod = x => ((x % 720) + 720) % 720;
const tap = async (ui, id, act, n) => { for (let i = 0; i < n; i++) { await ui.scope.locator(`#mp-content .mp-obj[data-oid="${id}"] [data-act="${act}"]`).click(); await wait(ui, 50); } };
/** Move a clock on by d minutes (a multiple of 5) with its buttons. */
const forward = async (ui, id, d) => { await tap(ui, id, 'hour', Math.floor(d / 60)); await tap(ui, id, 'min5', (d % 60) / 5); };
/** Drag the minute hand back k minutes from minute m0, a minute at a time. */
async function dragBack(ui, id, m0, k) {
  const b = await ui.scope.locator(`#mp-content .mp-obj[data-oid="${id}"] svg[data-clock]`).boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = (80 / 220) * b.width;
  const pt = m => { const a = (m / 60) * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ms = ui.page.mouse;
  await ms.move(...pt(m0)); await ms.down();
  for (let i = 1; i <= k; i++) { await ms.move(...pt(m0 - i)); await ui.page.waitForTimeout(8); }
  await ms.up(); await wait(ui, 150);
}
export async function build(ui, v) {
  const have = clocks(v.setup), want = clocks(v.solution.board);
  for (const [i, o] of want.entries()) {
    const id = o.id, cur = have[i].st, w = o.st;
    let now = toMin(cur);
    if (w.start && !(cur.start && toMin(cur.start) === toMin(w.start))) {
      const s = toMin(w.start), n = mod(toMin(w) - s);
      if (mod(s - now)) { await forward(ui, id, mod(s - now)); now = s; }
      if (n % 15 === 0) { for (let j = 0; j < n / 15; j++) { await palette(ui, 'Time tracker +15 min').click(); await wait(ui, 60); } }
      else { await palette(ui, 'Start the tracker here').click(); await wait(ui, 60); await forward(ui, id, n); }
      continue;
    }
    const back = mod(now - toMin(w));
    if (!back) continue;
    if (back <= 60) await dragBack(ui, id, Math.round(+cur.m), back);
    else await forward(ui, id, mod(toMin(w) - now));
  }
}
