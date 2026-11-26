// The geoboard in the run-through (tests/unit/manip-task-flow-browser.test.js): each new band of the variation's
// solution stretched the way a student would: tap its pegs in order on the right geoboard, pick the band's color in the
// palette, then Close the band.
import { wait } from './common.js';
import { circlePegs } from '../../../public/js/manip-tasks/geoboard.js';

const NAMES = { '#E53935': 'Red', '#1E88E5': 'Blue', '#43A047': 'Green', '#FB8C00': 'Orange', '#8E24AA': 'Purple' };
const pegIndex = (st, p) => {
  if (st.board === 'circle') { const C = circlePegs(); let best = 0; C.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(C[best].x - p.x, C[best].y - p.y)) best = i; }); return best; }
  return Math.round(p.y) * 6 + Math.round(p.x);
};
export async function build(ui, v) {
  if (!v.solution.board) return;
  const before = new Map(v.setup.objects.map(o => [o.id, o]));
  for (const o of v.solution.board.objects.filter(x => x.k === 'geoboard')) {
    const had = (before.get(o.id) || { st: { bands: [] } }).st.bands.length;
    for (const band of o.st.bands.slice(had)) {
      for (const p of band.pts) { await ui.scope.locator(`#mp-content .mp-obj[data-oid="${o.id}"] .mp-peg[data-i="${pegIndex(o.st, p)}"]`).click(); await wait(ui, 50); }
      const color = ui.scope.locator(`#mp-palette [aria-label="${NAMES[band.color] || 'Red'} band"]`);
      if ((await color.getAttribute('aria-pressed')) !== 'true') { await color.click(); await wait(ui, 80); }
      await ui.scope.locator('#mp-palette [aria-label="Close the band"]').click(); await wait(ui, 120);
    }
  }
}
