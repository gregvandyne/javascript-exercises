// Number Lines in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built with real
// taps on the line. In Points a tap puts a dot where it lands (the line snaps it to the nearest tick); in Jumps the first
// tap picks the start and each next tap lands a jump. The switch is the line's own Points / Jumps buttons.
import { wait } from './common.js';

const lines = b => b.objects.filter(o => o.k === 'number-lines');
const same = (a, b) => Math.abs(a - b) < 2e-3;
/** Tap the line of object oid at value v: the inverse of manip.js nlValue (x = 30 + (v - min) / (max - min) * 800 of
 *  860), on the line (y 110 in the svg's viewBox). */
async function tap(ui, oid, v) {
  const svg = ui.scope.locator(`.mp-obj[data-oid="${oid}"] svg.mp-nl`);
  const r = await svg.boundingBox(), min = Number(await svg.getAttribute('data-min')), max = Number(await svg.getAttribute('data-max'));
  const vb = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  const x = r.x + ((30 + ((v - min) / (max - min)) * 800) / 860) * r.width, y = r.y + ((110 - vb[1]) / vb[3]) * r.height;
  await ui.page.mouse.click(x, y); await wait(ui, 90);
}
const mode = async (ui, oid, m) => { const b = ui.scope.locator(`.mp-obj[data-oid="${oid}"] [data-act="nlmode"][data-m="${m}"]`); if (await b.getAttribute('aria-pressed') !== 'true') { await b.click(); await wait(ui, 120); } };
export async function build(ui, v) {
  const have = new Map(lines(v.setup).map(o => [o.id, o.st]));
  for (const o of lines(v.solution.board)) {
    const st0 = have.get(o.id); if (!st0 || st0.q) continue;
    await ui.scope.locator(`.mp-obj[data-oid="${o.id}"] svg.mp-nl`).scrollIntoViewIfNeeded();
    const dots = o.st.points.filter(p => !st0.points.some(q => same(p, q)));
    if (dots.length) { await mode(ui, o.id, 'points'); for (const p of dots) await tap(ui, o.id, p); }
    const jumps = o.st.jumps.slice(st0.jumps.length);
    if (jumps.length) {
      await mode(ui, o.id, 'jumps');
      await tap(ui, o.id, jumps[0].a);
      for (const j of jumps) await tap(ui, o.id, j.b);
    }
  }
}
