// Algebra Tiles in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would. Tiles come from the palette ("Add x tile"); a tile to take away is deleted on its hold-to-edit wheel;
// on an equation's Left and Right mats, a new tile is dragged onto its mat. The run-through compares the board it starts
// from with the solution, kind by kind (on each mat, or on the whole board), and makes the difference.
import { wait, wheel } from './common.js';

const LABEL = { one: '1', mone: '−1', x: 'x', mx: '−x', x2: 'x²', mx2: '−x²', y: 'y', my: '−y', xy: 'xy', y2: 'y²' };
const MAT = { w: 440, h: 320 };
const inMat = (o, p) => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= o.x && cx <= o.x + MAT.w * (o.s || 1) && cy >= o.y && cy <= o.y + MAT.h * (o.s || 1); };
const countBy = list => list.reduce((m, p) => ({ ...m, [p.kind]: (m[p.kind] || 0) + 1 }), {});
const pids = ui => ui.scope.locator('#mp-content .mp-piece').evaluateAll(l => l.map(e => e.dataset.pid));
/** Add a tile from the palette; -> its piece locator. */
async function add(ui, kind) {
  const before = new Set(await pids(ui));
  await ui.scope.locator(`#mp-palette [aria-label="Add ${LABEL[kind]} tile"]`).click(); await wait(ui, 120);
  const id = (await pids(ui)).find(x => !before.has(x));
  return ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
}
/** Drag a tile onto a free spot of a mat (clear of the tiles there, so it does not snap to one). */
async function onto(ui, piece, oid) {
  await ui.scope.locator('#mp-board').evaluate(b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(ui, 80);
  const m = await ui.scope.locator(`#mp-content .mp-obj[data-oid="${oid}"]`).boundingBox(), a = await piece.boundingBox();
  const boxes = await ui.scope.locator('#mp-content .mp-piece').evaluateAll(l => l.map(e => e.getBoundingClientRect().toJSON()));
  const gap = 22, top = m.y + m.height * 0.14;
  let spot = null;
  for (let y = top; !spot && y + a.height < m.y + m.height - 6; y += 8) for (let x = m.x + 10; !spot && x + a.width < m.x + m.width - 6; x += 8) {
    if (!boxes.some(b => x < b.right + gap && x + a.width + gap > b.left && y < b.bottom + gap && y + a.height + gap > b.top)) spot = { x: x + a.width / 2, y: y + a.height / 2 };
  }
  if (!spot) throw new Error('no free spot on the mat');
  const mo = ui.page.mouse, x0 = a.x + a.width / 2, y0 = a.y + a.height / 2;
  await mo.move(x0, y0); await mo.down();
  for (let i = 1; i <= 12; i++) { await mo.move(x0 + ((spot.x - x0) * i) / 12, y0 + ((spot.y - y0) * i) / 12); await ui.page.waitForTimeout(10); }
  await mo.up(); await wait(ui, 200);
}
export async function build(ui, v) {
  const sol = v.solution.board; if (!sol) return;
  const mine = b => b.pieces.filter(p => !p.locked), mats = v.setup.objects.filter(o => o.k === 'mat');
  const groups = mats.length ? mats.map(o => ({ o, have: mine(v.setup).filter(p => inMat(o, p)), want: countBy(mine(sol).filter(p => inMat(o, p))) })) : [{ o: null, have: mine(v.setup), want: countBy(mine(sol)) }];
  for (const g of groups) {
    const have = countBy(g.have);
    for (const k of new Set([...Object.keys(have), ...Object.keys(g.want)])) {
      const extra = (have[k] || 0) - (g.want[k] || 0);
      for (const p of g.have.filter(q => q.kind === k).slice(0, Math.max(0, extra))) await wheel(ui, ui.scope.locator(`#mp-content .mp-piece[data-pid="${p.id}"]`), 'delete');
      for (let i = 0; i < -extra; i++) { const t = await add(ui, k); if (g.o) await onto(ui, t, g.o.id); }
    }
  }
}
