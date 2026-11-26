// The coordinate grid in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built
// the way a student would: Quadrants set in the grid's settings when the solution switches to four, each new point
// tapped on the grid in order (a tap on the very edge is nudged a few pixels inside: it snaps to the same grid point), and a line
// closed into a shape with the palette's Close the shape.
import { wait } from './common.js';

const NAMES = { '#E53935': 'red', '#1E88E5': 'blue', '#43A047': 'green', '#FB8C00': 'orange', '#8E24AA': 'purple' };
export async function build(ui, v) {
  if (!v.solution.board) return;
  const g0 = v.setup.objects.find(o => o.k === 'xy-coordinate-board'), g = v.solution.board.objects.find(o => o.id === g0.id);
  let have = g0.st.pts;
  if (!!g.st.four !== !!g0.st.four) {
    await ui.scope.locator('#mp-settings select[data-set="four"]').selectOption(g.st.four ? '1' : ''); await wait(ui, 200);
    have = [];
  }
  const svg = ui.scope.locator(`#mp-content .mp-obj[data-oid="${g.id}"] svg.mp-grid`);
  const lo = g.st.four ? -10 : 0, hi = g.st.four ? 10 : 12;
  for (const p of g.st.pts.slice(have.length)) {
    await svg.scrollIntoViewIfNeeded();
    const b = await svg.boundingBox(), cl = (n, max) => Math.min(max - 4, Math.max(4, n));
    await ui.page.mouse.click(b.x + cl(((p.x - lo) / (hi - lo)) * b.width, b.width), b.y + cl((1 - (p.y - lo) / (hi - lo)) * b.height, b.height));
    await wait(ui, 80);
  }
  if ((g.st.shut || []).length) { await ui.scope.locator(`#mp-palette [aria-label="Close the ${NAMES[g.st.color] || 'red'} shape"]`).click(); await wait(ui, 120); }
}
