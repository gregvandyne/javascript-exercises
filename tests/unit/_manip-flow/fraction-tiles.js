// Fraction Tiles in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built the way
// a student would: tiles from the palette, tiles taken away with Delete on the hold-to-edit wheel, then the Labels
// setting. The checks count the tiles a student placed (the task's own tiles are locked), so no drags are needed.
import { wait, palette, wheel } from './common.js';

const LABEL = d => (d === 1 ? '1 whole' : `1/${d}`);
const countBy = ps => { const m = {}; for (const p of ps.filter(x => !x.locked)) m[p.kind] = (m[p.kind] || 0) + 1; return m; };
const pieces = (ui, kind) => ui.scope.locator(`#mp-content .mp-piece[data-kind="${kind}"]:not(.locked)`);
export async function build(ui, v) {
  const want = countBy(v.solution.board.pieces), have = countBy(v.setup.pieces);
  for (const kind of new Set([...Object.keys(want), ...Object.keys(have)])) {
    const d = +kind.slice(1);
    for (let i = have[kind] || 0; i > (want[kind] || 0); i--) await wheel(ui, pieces(ui, kind).last(), 'delete');
    for (let i = have[kind] || 0; i < (want[kind] || 0); i++) { await palette(ui, `Add ${LABEL(d)} tile`).click(); await wait(ui, 70); }
  }
  const mode = v.solution.board.mode || 'frac';
  if (mode !== (v.setup.mode || 'frac')) { await ui.scope.locator('#mp-settings select[data-set="mode"]').selectOption(mode); await wait(ui, 200); }
}
