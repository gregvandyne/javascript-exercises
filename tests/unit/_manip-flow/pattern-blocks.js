// Pattern Blocks in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would, with the palette's blocks (a tap on "Add Trapezoid" puts one on the board). The checks count the
// blocks a student placed, so the run-through adds the solution's unlocked blocks, kind by kind.
import { wait, palette } from './common.js';

const LABEL = { hex: 'Hexagon', trap: 'Trapezoid', tri: 'Triangle', para: 'Parallelogram', rhom: 'Rhombus', sq: 'Square' };
const mine = b => (b.pieces || []).filter(p => !p.locked);
export async function build(ui, v) {
  if (!v.solution.board) return;
  const want = {}, have = {};
  for (const p of mine(v.solution.board)) want[p.kind] = (want[p.kind] || 0) + 1;
  for (const p of mine(v.setup)) have[p.kind] = (have[p.kind] || 0) + 1;
  for (const [k, n] of Object.entries(want)) for (let i = have[k] || 0; i < n; i++) { await palette(ui, `Add ${LABEL[k]}`).click(); await wait(ui, 60); }
}
