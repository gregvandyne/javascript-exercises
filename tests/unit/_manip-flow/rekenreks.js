// Rekenreks in the run-through (tests/unit/manip-task-flow-browser.test.js): the variation's solution built with real
// taps. A tap on bead i of a row slides the beads up to it over (tapping the last one pushed takes it back), so each
// row is set by one or two taps; Cover is the palette's button for the rekenrek tapped last.
import { wait, palette } from './common.js';

const reks = b => b.objects.filter(o => o.k === 'rekenreks');
export async function build(ui, v) {
  const want = reks(v.solution.board), have = new Map(reks(v.setup).map(o => [o.id, o.st]));
  // the one to cover last, so it is the rekenrek the palette works on
  const order = [...want].sort((a, b) => (a.st.covered && !have.get(a.id).covered ? 1 : 0) - (b.st.covered && !have.get(b.id).covered ? 1 : 0));
  for (const o of order) {
    const cur = [...have.get(o.id).counts];
    const tap = async (r, i) => { await ui.scope.locator(`.mp-obj[data-oid="${o.id}"] [data-act="bead"][data-r="${r}"][data-i="${i}"]`).click(); cur[r] = i + 1 === cur[r] ? i : i + 1; await wait(ui, 60); };
    for (let r = 0; r < o.st.rows; r++) {
      const n = o.st.counts[r] || 0;
      if (cur[r] === n) continue;
      if (n > 0) await tap(r, n - 1);
      else { await tap(r, 0); if (cur[r]) await tap(r, 0); }
    }
    if (o.st.covered && !have.get(o.id).covered) {
      // make sure this rekenrek is the one the palette works on: tap its last pushed bead twice (no change)
      const r = cur.findIndex(n => n > 0);
      if (r >= 0) { await tap(r, cur[r] - 1); await tap(r, cur[r]); }
      await palette(ui, 'Cover').click(); await wait(ui, 150);
    }
  }
}
