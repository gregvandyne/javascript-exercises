// The run-through tests' hands on the real Manipulatives page (tests/unit/manip-task-flow-browser.test.js;
// docs/manip-practice-tasks.md "Test helpers"). ui: { scope (the page, or the Homeroom player's frameLocator), page (for
// the mouse) }. Each tool's file next to this one exports build(ui, v): put the variation's answer on the board through
// the real UI (palette, taps, drags, the hold-to-edit wheel), the way a student would. answer(ui, v, { wrong }) here
// types the box and picks the choice.
export const wait = (ui, ms = 120) => ui.page.waitForTimeout(ms);
/** The answer box and the choice: the variation's own solution, or a wrong one. */
export async function answer(ui, v, { wrong = false } = {}) {
  const a = v.answer, s = v.solution;
  if (a.box) {
    const k = String(s.box), bad = /^\d+(\.\d+)?$/.test(k.replace(/,/g, '')) ? String(Number(k.replace(/,/g, '')) + 1) : 'not it';
    await ui.scope.locator('#mp-probbox').fill(wrong ? bad : k);
  }
  if (a.choice && !wrong) await ui.scope.locator(`[data-pc="${s.choice}"]`).click();
  if (a.choice && wrong && !a.box) await ui.scope.locator(`[data-pc="${(s.choice + 1) % a.choice.options.length}"]`).click();
}
/** A palette button by the start of its label ("Add Rod", "Cover", "Regroup"). */
export const palette = (ui, start) => ui.scope.locator(`#mp-palette [data-pal][aria-label^="${start}"]`).first();
/** Open a piece's hold-to-edit wheel (a right-click, as on a laptop) and pick an item: break, delete, copy... */
export async function wheel(ui, piece, k) {
  await piece.click({ button: 'right' });
  await ui.scope.locator(`.mp-wheel .mp-wbtn[data-wk="${k}"]`).click();
  await wait(ui, 200);
}
/** Drag an element's middle to the middle of another (pointer events, in steps, as a hand would). */
export async function dragTo(ui, from, to) {
  // (the board in the middle of the screen first: a drag is the mouse's own moves, which never scroll the page)
  await ui.scope.locator('#mp-board').evaluate(b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(ui, 80);
  const a = await from.boundingBox(), b = await to.boundingBox();
  if (!a || !b) throw new Error('drag: not on screen');
  const m = ui.page.mouse;
  const x0 = a.x + a.width / 2, y0 = a.y + a.height / 2, x1 = b.x + b.width / 2, y1 = b.y + b.height / 2;
  await m.move(x0, y0); await m.down();
  for (let i = 1; i <= 12; i++) { await m.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await ui.page.waitForTimeout(10); }
  await m.up();
  await wait(ui, 250);
}
/** The board's Fit (so everything is on screen before taps and drags). */
export const fit = async ui => { await ui.scope.locator('[data-view="fit"]').first().click(); await wait(ui, 200); };
