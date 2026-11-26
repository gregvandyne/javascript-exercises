// Pattern Blocks in the run-through (tests/unit/manip-task-flow-browser.test.js): each task's answer built the way a
// student would, with the palette's blocks (a tap on "Add Trapezoid" puts one on the board). Most checks count the
// blocks a student placed, so the run-through adds the solution's unlocked blocks, kind by kind. "Grow the pattern"
// checks the flower's shape (pattern-blocks.js `ring`): each block is added, turned with the wheel's Rotate (30 degrees
// a tap) and dragged to its place around the hexagon.
import { wait, palette } from './common.js';
import { center, dragPt, wheelDo } from './pieces.js';

const LABEL = { hex: 'Hexagon', trap: 'Trapezoid', tri: 'Triangle', para: 'Parallelogram', rhom: 'Rhombus', sq: 'Square' };
const mine = b => (b.pieces || []).filter(p => !p.locked);
const byId = (ui, id) => ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
const ids = ui => ui.scope.locator('#mp-content .mp-piece:not(.locked)').evaluateAll(l => l.map(e => e.dataset.pid));

/** Each block of the solution added, turned and dragged to its place, mapped from the locked hexagon on the screen. */
async function shaped(ui, v) {
  const hub = v.setup.pieces.find(p => p.kind === 'hex'), hubEl = ui.scope.locator('#mp-content .mp-piece.locked[data-kind="hex"]').first();
  for (const p of mine(v.solution.board)) {
    const before = new Set(await ids(ui));
    await palette(ui, `Add ${LABEL[p.kind]}`).click(); await wait(ui, 80);
    const id = (await ids(ui)).find(x => !before.has(x)), el = byId(ui, id);
    for (let i = 0; i < Math.round((+p.rot || 0) / 30); i++) await wheelDo(ui, el, 'rotate');
    await center(ui);
    const b = await hubEl.boundingBox(), k = b.width / hub.w;
    await dragPt(ui, el, b.x + (p.x + p.w / 2 - hub.x) * k, b.y + (p.y + p.h / 2 - hub.y) * k);
  }
}

export async function build(ui, v) {
  if (!v.solution.board) return;
  if ((v.answer.board || []).some(c => c.t === 'ring')) return shaped(ui, v);
  const want = {}, have = {};
  for (const p of mine(v.solution.board)) want[p.kind] = (want[p.kind] || 0) + 1;
  for (const p of mine(v.setup)) have[p.kind] = (have[p.kind] || 0) + 1;
  for (const [k, n] of Object.entries(want)) for (let i = have[k] || 0; i < n; i++) { await palette(ui, `Add ${LABEL[k]}`).click(); await wait(ui, 60); }
}
