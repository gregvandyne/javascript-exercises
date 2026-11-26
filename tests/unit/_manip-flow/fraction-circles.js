// Fraction Circles in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built the
// way a student would: pieces from the palette (into the selected circle, else the first circle with room), New circle
// before each next circle, Rings view, and the Labels setting (switched after the pieces are in).
import { wait, palette } from './common.js';

const setOf = b => b.objects.filter(o => o.k === 'fraction-circles' && !o.st.q).pop();
const label = d => (d === 1 ? '1' : `1/${d}`);
export async function build(ui, v) {
  const want = setOf(v.solution.board).st;
  if (want.rings) { await palette(ui, 'Rings view').click(); await wait(ui, 150); }
  for (const [i, c] of want.circles.entries()) {
    if (!c.ps.length) continue;
    if (i > 0) { await palette(ui, 'New circle').click(); await wait(ui, 100); }
    for (const p of c.ps) { await palette(ui, `Add ${label(p.d)} piece`).click(); await wait(ui, 60); }
  }
  if (want.mode && want.mode !== 'frac') { await ui.scope.locator('#mp-settings select[data-set="mode"]').selectOption(want.mode); await wait(ui, 200); }
}
