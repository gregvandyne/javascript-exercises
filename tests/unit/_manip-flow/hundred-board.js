// Hundred Board in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would: Multiples of on the palette when the task asks for it, then a tap on each cell to cover (a covered
// cell already in the question stays as it is).
import { wait, palette } from './common.js';
import { cellOf } from '../../../public/js/manip-tasks/hundred-board.js';

export async function build(ui, v) {
  const st = v.setup.objects[0].st, conds = v.answer.board || [];
  const m = conds.find(c => c.t === 'mult');
  if (m && !(await palette(ui, `Multiples of ${m.m}`).getAttribute('aria-pressed'))) { await palette(ui, `Multiples of ${m.m}`).click(); await wait(ui, 80); }
  const cov = conds.find(c => c.t === 'covered');
  for (const val of cov ? cov.vals : []) {
    const cell = ui.scope.locator(`#mp-content .mp-obj.k-hundred-board .mp-cell[data-i="${cellOf(st, val)}"]`);
    if (!(await cell.getAttribute('class')).includes(' on')) { await cell.click(); await wait(ui, 30); }
  }
}
