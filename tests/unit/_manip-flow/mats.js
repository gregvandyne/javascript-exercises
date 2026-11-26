// Piece tools with labeled work mats in the run-through (number rods, money; tests/unit/manip-task-flow-browser.test.js):
// the variation's solution built the way a student would. Pieces the solution no longer has are deleted on the
// hold-to-edit wheel; each new piece comes from the palette, and one that belongs on a labeled mat ("Way 1", "Toy 2")
// is dragged there, to the place the solution gives it (so a train keeps its order, left to right).
import { wait, wheel } from './common.js';
import { objRect } from '../../../public/js/manip-board.js';

const unlocked = b => (b.pieces || []).filter(p => !p.locked);
const mid = p => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
const inside = (r, c) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;
/** The labeled mat a piece of the solution sits on, or null. */
const matFor = (slug, b, p) => (b.objects || []).find(o => o.k === 'mat' && o.st && o.st.label && inside(objRect(slug, o), mid(p))) || null;
/** The screen point of a world point on a mat (through the mat's own box on the screen). */
async function screenOf(ui, slug, o, w) {
  const box = await ui.scope.locator(`#mp-content .mp-obj[data-oid="${o.id}"]`).boundingBox(), r = objRect(slug, o);
  return { x: box.x + ((w.x - r.x) / r.w) * box.width, y: box.y + ((w.y - r.y) / r.h) * box.height };
}
async function dragToPoint(ui, el, to) {
  const a = await el.boundingBox(); if (!a) throw new Error('drag: not on screen');
  const m = ui.page.mouse, x0 = a.x + a.width / 2, y0 = a.y + a.height / 2;
  await m.move(x0, y0); await m.down();
  for (let i = 1; i <= 12; i++) { await m.move(x0 + ((to.x - x0) * i) / 12, y0 + ((to.y - y0) * i) / 12); await ui.page.waitForTimeout(10); }
  await m.up(); await wait(ui, 200);
}
/** Build v.solution's pieces. addOf(kind): the palette button that adds one. */
export async function buildPieces(ui, v, slug, addOf) {
  const setup = unlocked(v.setup), sol = unlocked(v.solution.board), ids = new Set(setup.map(p => p.id));
  const pieces = kind => ui.scope.locator(`#mp-content .mp-piece[data-kind="${kind}"]:not(.locked)`);
  const kinds = [...new Set([...setup, ...sol].map(p => p.kind))];
  for (const k of kinds) {
    const extra = setup.filter(p => p.kind === k).length - sol.filter(p => p.kind === k && ids.has(p.id)).length;
    for (let i = 0; i < extra; i++) await wheel(ui, pieces(k).last(), 'delete');
  }
  const fresh = sol.filter(p => !ids.has(p.id));
  if (fresh.some(p => matFor(slug, v.solution.board, p))) await ui.scope.locator('#mp-board').evaluate(b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
  // (the new piece found by its id: the one selected last is drawn on top, so "the last one" may be an older piece)
  const pids = kind => pieces(kind).evaluateAll(els => els.map(e => e.dataset.pid));
  for (const p of fresh) {
    const before = new Set(await pids(p.kind));
    let id = null;
    // (a tap that lands while the board is drawn again right after a drop can be lost, as a finger's can: tap again)
    for (let i = 0; i < 3 && !id; i++) {
      await addOf(p.kind).click(); await wait(ui, 150 + 200 * i);
      id = (await pids(p.kind)).find(x => !before.has(x));
    }
    if (!id) throw new Error(`no new ${p.kind}`);
    const o = matFor(slug, v.solution.board, p); if (!o) continue;
    await wait(ui, 250);   // (the new piece's short pop first)
    // (the palette's tap may have scrolled the page to the palette: the board back in the middle, the mat on screen)
    await ui.scope.locator('#mp-board').evaluate(b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await ui.scope.locator(`#mp-content .mp-obj[data-oid="${o.id}"]`).evaluate(m => { const r = m.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) m.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await wait(ui, 60);
    const el = ui.scope.locator(`#mp-content .mp-piece[data-pid="${id}"]`);
    await dragToPoint(ui, el, await screenOf(ui, slug, o, mid(p)));
    const got = await el.boundingBox(), box = await ui.scope.locator(`#mp-content .mp-obj[data-oid="${o.id}"]`).boundingBox();
    if (!got || !inside({ x: box.x, y: box.y, w: box.width, h: box.height }, { x: got.x + got.width / 2, y: got.y + got.height / 2 })) throw new Error(`${p.kind} not on ${o.st.label}: ${JSON.stringify({ got, box })}`);
  }
  // every kind as many times as the solution has it (no tap went astray)
  for (const k of kinds) { const n = await pieces(k).count(), want = sol.filter(p => p.kind === k).length; if (n !== want) throw new Error(`${n} ${k}, wanted ${want}`); }
}
