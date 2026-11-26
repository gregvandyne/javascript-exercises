// Bar Models in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built the way a
// student would: a part tapped to select its bar, Add a part for the parts a task asks for, then each part's value
// typed into its number (Enter finishes it, like the commit after typing).
import { wait, palette, fit } from './common.js';

const bars = b => b.objects.find(o => o.k === 'bar-models').st.bars;
const seg = (ui, i, j) => ui.scope.locator(`#mp-content .mp-seg[data-bar="${i}"][data-seg="${j}"]`);
export async function build(ui, v) {
  const want = bars(v.solution.board), have = bars(v.setup);
  for (const [i, bar] of want.entries()) {
    const n0 = have[i].segs.length;
    if (bar.segs.length > n0) {
      // tap the part's edge (not its name or number) to select it: Add a part then goes on its bar
      await fit(ui);   // (the bar model grows as parts are added: everything on screen first)
      const box = await seg(ui, i, 0).boundingBox();
      await ui.page.mouse.click(box.x + 6, box.y + box.height - 4); await wait(ui, 120);
      for (let k = n0; k < bar.segs.length; k++) { await palette(ui, 'Add a part').click(); await wait(ui, 120); }
    }
    for (const [j, s] of bar.segs.entries()) {
      const box = ui.scope.locator(`#mp-content .mp-segval[data-bar="${i}"][data-seg="${j}"]`);
      if (String(await box.inputValue()) === String(s.value)) continue;
      await box.fill(String(s.value)); await box.press('Enter'); await wait(ui, 120);
    }
  }
}
