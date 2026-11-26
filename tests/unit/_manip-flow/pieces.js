// Hands for the piece tools in the run-through (two-color-counters.js, linking-cubes.js, color-tiles.js next to this
// file): add a piece from the palette, drag a piece to a place on the plane (an object's own spot, or flush beside
// another piece so it snaps), and the hold-to-edit wheel's Delete and Flip. A piece added from the palette goes right
// after the last one placed (manip-board.js nextPieceSpot), so a row needs one drag for its first piece only.
import { wait, palette } from './common.js';

/** The pieces on the board (the newest last). */
export const pieces = (ui, kind = null) => ui.scope.locator(`#mp-content .mp-piece${kind ? `[data-kind="${kind}"]` : ''}:not(.locked)`);
export const newest = ui => pieces(ui).last();
/** Add a piece from the palette (start: the start of its palette name, "Add Red tile"). */
export async function add(ui, start, n = 1) {
  const b = palette(ui, start);
  for (let i = 0; i < n; i++) { await b.click(); await wait(ui, 40); }
}
/** The board in the middle of the screen (a drag is the mouse's own moves, which never scroll the page). */
export async function center(ui) {
  await ui.scope.locator('#mp-board').evaluate(b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(ui, 60);
}
/** Drag an element's middle to a point of the screen (pointer events, in steps). */
export async function dragPt(ui, from, x1, y1) {
  const a = await from.boundingBox(); if (!a) throw new Error('drag: not on screen');
  const m = ui.page.mouse, x0 = a.x + a.width / 2, y0 = a.y + a.height / 2;
  await m.move(x0, y0); await m.down();
  for (let i = 1; i <= 8; i++) { await m.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8); await ui.page.waitForTimeout(8); }
  await m.up(); await wait(ui, 160);
}
/** Plane to screen, from an object on the board (its plane rectangle r: { x, y, w } as in the variation's setup). */
export async function mapper(ui, oid, r) {
  const b = await ui.scope.locator(`#mp-content .mp-obj[data-oid="${oid}"]`).boundingBox();
  const k = b.width / r.w;
  return (px, py) => ({ x: b.x + (px - r.x) * k, y: b.y + (py - r.y) * k, k });
}
/** Drag a piece so its middle lands at a plane point (through map). */
export const dragTo = async (ui, piece, map, px, py) => { const p = map(px, py); await dragPt(ui, piece, p.x, p.y); };
/** Drop a piece flush beside another one (dir: right, below, left, above): it snaps there. */
export async function dropBeside(ui, piece, other, dir = 'right') {
  const b = await other.boundingBox(), a = await piece.boundingBox();
  const x = dir === 'right' ? b.x + b.width + a.width / 2 + 2 : dir === 'left' ? b.x - a.width / 2 - 2 : b.x + b.width / 2;
  const y = dir === 'below' ? b.y + b.height + a.height / 2 + 2 : dir === 'above' ? b.y - a.height / 2 - 2 : b.y + b.height / 2;
  await dragPt(ui, piece, x, y);
}
/** A wheel item on a piece (right-click opens the hold-to-edit wheel): 'delete', 'flip'... */
export async function wheelDo(ui, piece, k) {
  await piece.click({ button: 'right' });
  await ui.scope.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).click();
  await wait(ui, 90);
  if (await ui.scope.locator('.mp-wheel').count()) { await ui.page.keyboard.press('Escape'); await wait(ui, 60); }
}
