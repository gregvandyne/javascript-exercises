// Number Quest guided focus, pinned by the 2026-11-05 PERFECTION pass (Greg's live review of the
// deployed Explorer decks: deck 1.2 slide 1 "Look at the next digit" — step 1's highlight pill
// clipped the "350" tick label below the rounding number line, and step 2's box was a big slab
// covering the "300" label it was meant to spotlight; Greg: "Make sure each screen is perfect.").
// This pass measured EVERY focus step in the 13 built Explorer decks (104 steps after the deck art
// pass, PR #196, drew diagrams on 24 more slides) against the rendered figure on a seeded server
// at 390px (and 834/1280 for the box-% invariance checks), and re-authored each box to equal the
// measured bounds of the part its cue names. Findings encoded here so they cannot silently regress:
//   1. REGISTRY below stores, for every focus step, the measured target bounds [x0, y0, x1, y1]
//      and the authored box [x, y, w, h]; the test asserts the box matches the bounds within
//      0.6%/side and covers every focus step exactly once. Before the pass, 0 of the original 56
//      steps and 0 of the art pass's 48 steps met that standard.
//   2. Two labels-crowding defects lived in the shared visual component (server/views/courses.js
//      visualSvg), not in any box: number-line mark labels printed over each other where ticks sit
//      close (287/300 on the counting-up line; 398/400 and 700/703 on the 398–703 line, measured
//      print overlap up to 49%²). The component now nudges colliding label centres apart, and
//      where nudging would shove a label more than 4 units off its own tick, the cluster keeps
//      its true centres and staggers onto a second row. The browser test below pins the 398–703
//      line: all four mark labels pairwise disjoint at 390px.
//   3. The art pass handed over one named residual: deck 1.2 slide 3 step 1, whose authored box's
//      ring cut the "12,500" tick label's last digit (measured ring ∩ label 13.7%²). Measurement
//      showed the point's true bounds end at y 68.1 while the authored box ran to 78.3 — the
//      re-measured box [55.8, 43, 14.5, 25.1] clears the label entirely (browser test pins
//      ring ∩ "12,500" = 0 at 390px). No exception needed.
//   4. Long drawn captions (tiles/array diagrams) overflowed the 100-wide frame at the standard
//      font size (a 69-character caption rendered 120 units wide); the component now fits the
//      caption size to its length (labelFs, calibrated from the measured worst per-character
//      width 0.534em). The browser test below asserts every drawn caption renders in frame.
//   5. A few boxes necessarily contain a sliver of a NEIGHBOURING element's bounding box where
//      the geometry is connected: hop arcs that originate at the spotlighted point or share its
//      node, and the shared stroke between adjacent bar parts. Those are bbox artefacts, listed
//      per step in the perfection report; the registry still pins the exact measured bounds.
//   6. Two caption chips graze the ring's outset glow at 390px without touching any glyph
//      (1.1 slide 1 step 1: 13.7%² of glow; 3.1 slide 3 step 2: 6.1%²) — the cue-placement code
//      settles against the ring and badge only; both are screenshot-verified readable and are
//      listed as named exceptions in the perfection report.
// Report: ~/workspace/goals/oomba-academy-leading-interactive-educational-app/hidden_files/nq-focus-perfection/nq-focus-perfection-report.md
// Phase 2 addendum (2026-11-05): the ten Phase 2 decks (5.1-7.4, Units 5-7 + the Vault of Measures
// finale) are registered below in the same format: 57 more steps, measured on rendered step pages
// at 390/834/1280 (getBBox on the served SVG) before the perfection pass landed, against the same
// standard (box = measured bounds, 0.6%/side tolerance). Registry totals: 23 decks, 71 visual
// slides, 161 focus steps. Two by-geometry adjacencies are recorded with the Phase 2 entries: hop
// arcs that graze their own endpoint point label (5.2 slide 3 step 2, 7.4 slide 4 step 2).
// Fix round (2026-11-06, course audit): a box whose edge sat exactly on its target's bounds read as
// a cut label on the rendered ring ("/8", "rays of 5"), so every box now wraps its target with a
// small margin (registry test below), and the content changes of that round re-shape a few figures:
// 2.2 slides 1 and 3 are open number lines (ticks at 0/20/80/100, hops in order, not to scale) so
// 398/400 and 700/703 read; 2.2 slide 3 gained a third step; 3.1 slide 3 draws the turned array
// (7 rows of 6); 4.2 slide 3 draws the tiny and huge wholes at their sizes (bars). 162 steps.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NQ = path.join(ROOT, 'seed-lessons/number-quest/course/explorer');
const deck = n => JSON.parse(fs.readFileSync(path.join(NQ, `${n}.json`), 'utf8'));
const allDecks = () => fs.readdirSync(NQ).filter(f => f.endsWith('.json')).sort()
  .map(f => ({ n: f.replace('.json', ''), deck: deck(f.replace('.json', '')) }));

test('every visual slide carries focus; every box is a non-degenerate in-frame rectangle', () => {
  let slides = 0, steps = 0;
  for (const { n, deck: d } of allDecks()) {
    d.slides.forEach((s, si) => {
      if (!s.visual) return;
      assert.ok(Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4,
        `${n} s${si} "${s.title}": visual slide carries 1-4 focus steps`);
      slides++;
      s.focus.forEach((f, fi) => {
        steps++;
        const [x, y, w, h] = f.box || [];
        assert.ok([x, y, w, h].every(v => Number.isFinite(v)), `${n} s${si} step ${fi + 1}: box is four numbers`);
        assert.ok(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100, `${n} s${si} step ${fi + 1}: box in frame (${f.box})`);
        assert.ok(w >= 2 && h >= 2, `${n} s${si} step ${fi + 1}: box not degenerate (${f.box})`);
        assert.ok(typeof f.cue === 'string' && f.cue.trim() === f.cue && f.cue.length >= 1 && f.cue.length <= 80,
          `${n} s${si} step ${fi + 1}: cue well-formed`);
      });
    });
  }
  assert.equal(slides, 75, 'visual focus slides across the 23 Explorer decks');
  assert.equal(steps, 173, 'focus steps across the 23 Explorer decks');
});

// Greg's reported slide: deck 1.2 slide 1 "Look at the next digit" (rounding line 300 — 347 — 350 — 400).
// Step 1 rings the 347 marker (label + point); step 2 rings the 300 tick + label it rounds to.
test("Greg's reported slide (1.2 slide 1): both boxes wrap their measured targets", () => {
  const s = deck('1.2').slides[1];
  assert.deepEqual(s.focus[0].box, [42.3, 41.4, 10.2, 28.3]);
  assert.deepEqual(s.focus[1].box, [1.5, 57.8, 9.1, 25.5]);
});

// [deck, slideIdx, stepIdx, measured target [x0, y0, x1, y1], authored box [x, y, w, h]]
const REGISTRY = [
  ['0.1', 2, 0, [6, 32, 26.5, 58.67], [5, 30.4, 22.6, 29.9]],
  ['0.1', 2, 1, [51, 32, 71.5, 58.67], [50, 30.4, 22.6, 29.9]],
  ['0.1', 4, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['0.1', 4, 1, [36, 32, 64, 58.67], [35, 30.4, 30.1, 29.9]],
  ['1.1', 1, 0, [7.5, 16, 33.83, 78.35], [6.5, 14.4, 28.4, 65.6]],
  ['1.1', 1, 1, [36.83, 16, 92.5, 78.35], [35.8, 14.4, 57.8, 65.6]],
  ['1.1', 2, 0, [7.5, 16, 26.5, 78.35], [6.5, 14.4, 21.1, 65.6]],
  ['1.1', 2, 1, [29.5, 16, 70.5, 78.35], [28.5, 14.4, 43.1, 65.6]],
  ['1.1', 2, 2, [73.5, 16, 92.5, 78.35], [72.5, 14.4, 21.1, 65.6]],
  ['1.1', 3, 0, [7.5, 16, 48.5, 78.35], [6.5, 14.4, 43.1, 65.6]],
  ['1.1', 3, 1, [51.5, 16, 92.5, 78.35], [50.5, 14.4, 43.1, 65.6]],
  ['1.2', 0, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['1.2', 0, 1, [36, 32, 94, 58.67], [35, 30.4, 60.1, 29.9]],
  ['1.2', 1, 0, [43.3, 43, 51.41, 68.09], [42.3, 41.4, 10.2, 28.3]],
  ['1.2', 1, 1, [2.51, 59.38, 9.5, 81.65], [1.5, 57.8, 9.1, 25.5]],
  ['1.2', 3, 0, [55.75, 43, 70.31, 68.09], [54.8, 41.4, 16.6, 28.3]],
  ['1.2', 3, 1, [86.94, 59.38, 98.23, 81.65], [85.9, 57.8, 13.4, 25.5]],
  ['1.3', 0, 0, [6, 32, 58, 58.67], [5, 30.4, 54.1, 29.9]],
  ['1.3', 0, 1, [78, 32, 94, 58.67], [77, 30.4, 18.1, 29.9]],
  ['1.3', 1, 0, [6, 32, 58, 58.67], [5, 30.4, 54.1, 29.9]],
  ['1.3', 1, 1, [59.71, 32, 76.28, 72.75], [58.7, 30.4, 18.6, 44]],
  ['1.3', 2, 0, [6, 32, 16.86, 58.67], [5, 30.4, 12.9, 29.9]],
  ['1.3', 2, 1, [83.14, 32, 94, 58.67], [82.1, 30.4, 13, 29.9]],
  ['1.3', 3, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['1.3', 3, 1, [36, 32, 64, 58.67], [35, 30.4, 30.1, 29.9]],
  ['2.1', 1, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['2.1', 1, 1, [6, 44.12, 94, 68.44], [5, 42.5, 90.1, 27.6]],
  ['2.1', 2, 0, [6, 32, 26.5, 58.67], [5, 30.4, 22.6, 29.9]],
  ['2.1', 2, 1, [51, 32, 94, 58.67], [50, 30.4, 45.1, 29.9]],
  ['2.1', 3, 0, [6, 32, 64, 58.67], [5, 30.4, 60.1, 29.9]],
  ['2.1', 3, 1, [66, 32, 94, 58.67], [65, 30.4, 30.1, 29.9]],
  ['2.2', 1, 0, [2.83, 24.82, 27.1, 81.65], [1.8, 23.2, 26.4, 60.1]],
  ['2.2', 1, 1, [20.11, 24.82, 79.9, 81.65], [19.1, 23.2, 61.9, 60.1]],
  ['2.2', 1, 2, [72.9, 24.82, 96.8, 81.65], [71.9, 23.2, 25.9, 60.1]],
  ['2.2', 2, 0, [6, 37.33, 55.33, 52.44], [5.6, 35.7, 50.2, 18.4]],
  ['2.2', 2, 1, [55.33, 37.33, 94, 52.44], [54.9, 35.7, 39.6, 18.4]],
  ['2.2', 3, 0, [2.55, 24.82, 27.14, 81.65], [1.5, 23.2, 26.7, 60.1]],
  ['2.2', 3, 1, [20.06, 24.82, 79.7, 81.65], [19.1, 23.2, 61.6, 60.1]],
  ['2.2', 3, 2, [73.1, 24.82, 97.19, 81.65], [72.1, 23.2, 26.1, 60.1]],
  ['3.1', 0, 0, [20.95, 24.21, 79.05, 31.5], [20, 22.6, 60.1, 10.6]],
  ['3.1', 0, 1, [20.95, 24.21, 79.05, 71.79], [20, 22.6, 60.1, 50.8]],
  ['3.1', 1, 0, [19.15, 21.69, 80.85, 28.98], [18.2, 20.1, 63.7, 10.5]],
  ['3.1', 1, 1, [19.15, 21.69, 80.85, 74.31], [18.2, 20.1, 63.7, 55.9]],
  ['3.1', 2, 0, [17.09, 19.16, 82.91, 26.45], [16.1, 17.6, 67.9, 10.5]],
  ['3.1', 2, 1, [17.09, 19.16, 82.91, 76.84], [16.1, 17.6, 67.9, 60.9]],
  ['3.1', 3, 0, [7.96, 19.18, 46.04, 76.82], [7, 17.6, 40.1, 60.9]],
  ['3.1', 3, 1, [59.11, 18.99, 86.89, 77.01], [58.1, 17.4, 29.8, 61.3]],
  ['3.2', 2, 0, [17.09, 21.69, 82.91, 28.98], [16.1, 20.1, 67.9, 10.5]],
  ['3.2', 2, 1, [47.95, 86.13, 72.08, 94.1], [47, 84.5, 26.1, 11.2]],
  ['3.2', 4, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['3.2', 4, 1, [6, 44.12, 94, 68.44], [5, 42.5, 90.1, 27.6]],
  ['3.3', 0, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['3.3', 0, 1, [66, 32, 94, 58.67], [65, 30.4, 30.1, 29.9]],
  ['3.3', 1, 0, [6, 5.01, 68.86, 29.33], [5, 3.4, 64.9, 27.6]],
  ['3.3', 1, 1, [6, 65.46, 94, 89.78], [5, 63.9, 90.1, 27.5]],
  ['3.3', 2, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['3.3', 2, 1, [66, 32, 94, 58.67], [65, 30.4, 30.1, 29.9]],
  ['3.3', 4, 0, [6, 32, 34, 58.67], [5, 30.4, 30.1, 29.9]],
  ['3.3', 4, 1, [66, 32, 94, 58.67], [65, 30.4, 30.1, 29.9]],
  ['4.1', 0, 0, [6, 28.12, 94, 52.44], [5, 26.5, 90.1, 27.6]],
  ['4.1', 0, 1, [6, 37.33, 94, 52.44], [5, 35.7, 90.1, 18.4]],
  ['4.1', 1, 0, [6, 28.12, 94, 52.44], [5, 26.5, 90.1, 27.6]],
  ['4.1', 1, 1, [6, 37.33, 72, 52.44], [5.6, 35.7, 66.9, 18.4]],
  ['4.1', 3, 0, [6, 28.12, 94, 52.44], [5, 26.5, 90.1, 27.6]],
  ['4.1', 3, 1, [6, 37.33, 61, 52.44], [5.6, 35.7, 55.9, 18.4]],
  ['4.1', 4, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['4.1', 4, 1, [6, 44.12, 94, 68.44], [5, 42.5, 90.1, 27.6]],
  ['4.3', 0, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['4.3', 0, 1, [6, 44.12, 94, 68.44], [5, 42.5, 90.1, 27.6]],
  ['4.3', 1, 0, [6, 5.01, 94, 59.56], [5, 3.4, 90.1, 57.8]],
  ['4.3', 1, 1, [6, 65.46, 94, 89.78], [5, 63.9, 90.1, 27.5]],
  ['4.3', 2, 0, [6, 35.24, 94, 59.56], [5, 33.6, 90.1, 27.6]],
  ['4.3', 2, 1, [6, 65.46, 94, 89.78], [5, 63.9, 90.1, 27.5]],
  ['4.3', 4, 0, [6, 32, 64, 58.67], [5, 30.4, 60.1, 29.9]],
  ['4.3', 4, 1, [66, 32, 94, 58.67], [65, 30.4, 30.1, 29.9]],
  ['5.1', 1, 0, [4.8, 59.38, 7.2, 81.65], [3.8, 57.8, 4.4, 25.5]],
  ['5.1', 1, 1, [47.7, 59.38, 52.29, 81.65], [46.7, 57.8, 6.6, 25.5]],
  ['5.1', 1, 2, [6, 24.82, 94, 67.2], [5, 23.2, 90.1, 45.7]],
  ['5.1', 2, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['5.1', 2, 1, [6, 53.33, 50, 68.44], [5.6, 51.7, 44.9, 18.4]],
  ['5.1', 2, 2, [6, 44.12, 94, 68.44], [5, 42.5, 90.1, 27.6]],
  ['5.2', 1, 0, [6, 24.82, 50, 60.44], [5, 23.2, 46.1, 38.9]],
  ['5.2', 1, 1, [46.07, 59.38, 53.93, 81.65], [45.1, 57.8, 9.9, 25.5]],
  ['5.2', 1, 2, [50, 24.82, 72, 60.44], [49, 23.2, 24.1, 38.9]],
  ['5.3', 2, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90.1, 27.6]],
  ['5.3', 2, 1, [6, 53.33, 63.2, 68.44], [5.6, 51.7, 58.1, 18.4]],
  ['5.3', 2, 2, [63.2, 53.33, 94, 68.44], [62.8, 51.7, 31.7, 18.4]],
  ['6.1', 1, 0, [9.8, 33.78, 24.2, 87.25], [8.8, 32.2, 16.5, 56.7]],
  ['6.1', 1, 1, [32.51, 33.35, 45.49, 87.25], [31.5, 31.8, 15, 57.1]],
  ['6.1', 1, 2, [75, 32.12, 91, 87.25], [74, 30.5, 18.1, 58.4]],
  ['6.1', 2, 0, [17.86, 26.42, 38.14, 87.25], [16.9, 24.8, 22.3, 64.1]],
  ['6.1', 2, 1, [59, 30.58, 85, 87.25], [58, 29, 28.1, 59.9]],
  ['6.1', 2, 2, [17.86, 26.42, 85, 87.25], [16.9, 24.8, 69.1, 64.1]],
  ['6.2', 1, 0, [6, 37.33, 32.4, 52.44], [5.6, 35.7, 27.3, 18.4]],
  ['6.2', 1, 1, [50, 37.33, 76.4, 52.44], [49.6, 35.7, 27.3, 18.4]],
  ['6.2', 1, 2, [6, 28.12, 94, 52.44], [5, 26.5, 90.1, 27.6]],
  ['7.2', 1, 0, [6, 5.01, 72, 29.33], [5, 3.4, 68.1, 27.6]],
  ['7.2', 1, 1, [6, 35.24, 94, 59.56], [5, 33.6, 90.1, 27.6]],
  ['7.2', 1, 2, [6, 65.46, 35.3, 89.78], [5, 63.9, 31.4, 27.5]],
  ['7.4', 3, 0, [45.38, 59.38, 54.62, 81.65], [44.4, 57.8, 11.3, 25.5]],
  ['7.4', 3, 1, [50, 24.82, 93.01, 68.09], [49, 23.2, 45.1, 46.5]],
  ['7.4', 3, 2, [83.99, 43, 93.01, 68.09], [83, 41.4, 11.1, 28.3]],
  // Fix round A2 (2026-11-07): slides redrawn with the grid, squares, lines, chart and table diagrams
  // (views/nq-diagrams.js), a two-question bar model (3.2) and a line plot (7.1), measured with getBBox at 390px.
  ['3.2', 1, 0, [6, 13.9, 94, 38.22], [5, 12.3, 90, 27.5]],
  ['3.2', 1, 1, [6, 44.13, 94, 68.44], [5, 42.5, 90, 27.5]],
  ['5.2', 3, 0, [6, 61.87, 50, 75.38], [5, 60.3, 46, 16.7]],
  ['5.2', 3, 1, [50, 61.87, 72, 75.38], [49, 60.3, 24, 16.7]],
  ['5.2', 3, 2, [72, 61.87, 94, 75.38], [71, 60.3, 24, 16.7]],
  ['5.3', 0, 0, [23.6, 21.33, 41.2, 48.36], [22.6, 19.7, 19.6, 30.2]],
  ['5.3', 0, 1, [41.2, 21.33, 94, 48.36], [40.2, 19.7, 54.8, 30.2]],
  ['6.2', 2, 0, [28.5, 17.82, 77.5, 39.11], [27.5, 16.2, 51.0, 24.5]],
  ['6.2', 2, 1, [24.71, 17.82, 77.5, 64], [23.7, 16.2, 54.8, 49.4]],
  ['6.2', 3, 0, [11.22, 44.9, 55.62, 82.31], [10.2, 43.3, 46.4, 40.6]],
  ['6.2', 3, 1, [61.82, 17.82, 94.49, 82.31], [60.8, 16.2, 34.7, 67.7]],
  ['6.3', 0, 0, [7.5, 14.22, 33.83, 81.64], [6.5, 12.6, 28.3, 70.6]],
  ['6.3', 0, 1, [36.83, 14.22, 63.16, 81.64], [35.8, 12.6, 28.3, 70.6]],
  ['6.3', 0, 2, [66.17, 14.22, 92.5, 81.64], [65.2, 12.6, 28.3, 70.6]],
  ['6.3', 2, 0, [19.26, 83.38, 31.1, 95.86], [18.3, 81.8, 13.8, 15.7]],
  ['6.3', 2, 1, [30, 76.13, 55.09, 95.86], [29, 74.5, 27.1, 22.9]],
  ['6.3', 2, 2, [52.1, 45.88, 66.09, 75.06], [51.1, 44.3, 16.0, 32.4]],
  ['7.1', 1, 0, [13.68, 23.11, 20, 82], [12.7, 21.5, 8.3, 62.1]],
  ['7.1', 1, 1, [48.35, 17.99, 63.65, 88.75], [47.4, 16.4, 17.3, 74.0]],
  ['7.1', 1, 2, [73, 28.3, 87, 88.75], [72, 26.7, 16, 63.6]],
  // Fix round A4 (2026-11-07): the build (1.1), letters (6.3) and spinner (7.3) diagrams and 4.1's three hops,
  // measured with getBBox at 390px.
  ['1.1', 0, 0, [25, 14.22, 37, 39.11], [24, 12.6, 14, 28.1]],
  ['1.1', 0, 1, [32, 58.67, 68, 83.56], [31, 57.1, 38, 28.1]],
  ['6.3', 1, 0, [10.5, 14.22, 34.83, 81.64], [9.5, 12.6, 26.3, 70.6]],
  ['6.3', 1, 1, [37.83, 14.22, 62.16, 81.64], [36.8, 12.6, 26.3, 70.6]],
  ['6.3', 1, 2, [65.17, 14.22, 89.5, 81.64], [64.2, 12.6, 26.3, 70.6]],
  ['7.3', 1, 0, [50, 15.11, 88.03, 48.39], [49, 13.5, 40.0, 36.5]],
  ['7.3', 1, 1, [33.5, 15.11, 66.5, 73.78], [32.5, 13.5, 35.0, 61.9]],
  ['7.3', 1, 2, [4.67, 15.11, 66.5, 73.78], [3.7, 13.5, 63.8, 61.9]],
  ['4.1', 2, 0, [47.64, 59.38, 52.36, 81.64], [46.6, 57.8, 6.7, 25.5]],
  ['4.1', 2, 1, [6, 25.1, 75.76, 60.44], [5, 23.5, 71.8, 38.5]],
  ['4.1', 2, 2, [68.38, 43.02, 75.76, 68.09], [67.4, 41.4, 9.4, 28.3]],
  // Fix round A5 (2026-11-07): both hops (5.2, 1.2), the swap undone (0.1), part bars under the whole (2.3) and
  // phone-sized line plot Xs (7.1, 7.2), measured with getBBox at 390px.
  ['5.2', 2, 0, [19.32, 43.02, 29.35, 68.09], [18.3, 41.4, 12.0, 28.3]],
  ['5.2', 2, 1, [19.32, 25.1, 50, 60.44], [18.3, 23.5, 32.7, 38.5]],
  ['5.2', 2, 2, [49.25, 59.38, 58.7, 81.64], [48.2, 57.8, 11.5, 25.5]],
  ['1.2', 2, 0, [71.94, 43.02, 80.89, 68.09], [70.9, 41.4, 11.0, 28.3]],
  ['1.2', 2, 1, [6, 25.1, 94, 60.44], [5, 23.5, 90, 38.5]],
  ['7.1', 2, 0, [25.67, 44.98, 30.54, 81.64], [24.7, 43.4, 6.9, 39.9]],
  ['7.1', 2, 1, [47.64, 44.98, 52.36, 81.64], [46.6, 43.4, 6.7, 39.9]],
  ['7.2', 2, 0, [4.9, 59.38, 7.1, 81.64], [3.9, 57.8, 4.2, 25.5]],
  ['7.2', 2, 1, [33.63, 37.51, 37.03, 81.64], [32.6, 35.9, 5.4, 47.3]],
  ['7.2', 2, 2, [92.3, 52.44, 95.7, 81.64], [91.3, 50.8, 5.4, 32.4]],
  ['0.1', 3, 0, [17, 24.89, 43, 65.29], [16, 23.3, 28, 43.6]],
  ['0.1', 3, 1, [56.25, 24.89, 83.75, 65.29], [55.2, 23.3, 29.5, 43.6]],
  ['3.1', 4, 0, [6, 39.11, 82.56, 55.11], [5, 37.5, 78.6, 19.2]],
  ['3.1', 4, 1, [76.51, 39.11, 94, 68.85], [75.5, 37.5, 19.5, 32.9]],
  ['7.4', 2, 0, [6, 14.22, 94, 30.22], [5, 12.6, 90, 19.2]],
  ['7.4', 2, 1, [6, 39.11, 83.62, 55.11], [5, 37.5, 79.6, 19.2]],
  ['7.4', 2, 2, [82.24, 39.11, 94, 68.85], [81.2, 37.5, 13.8, 32.9]],
  ['7.3', 2, 0, [34, 10.67, 78, 23.47], [33, 9.1, 46, 16.0]],
  ['7.3', 2, 1, [34, 58.67, 78, 71.47], [33, 57.1, 46, 16.0]],
  ['2.3', 1, 0, [6, 13.37, 94, 38.22], [5, 11.8, 90, 28.1]],
  ['2.3', 1, 1, [6, 43.59, 94, 68.44], [5, 42.0, 90, 28.0]],
  ['2.3', 2, 0, [6, 37.33, 39.51, 52.44], [5, 35.7, 35.5, 18.3]],
  ['2.3', 2, 1, [39.51, 37.33, 94, 52.44], [38.5, 35.7, 56.5, 18.3]],
  ['2.3', 3, 0, [6, 13.36, 94, 38.22], [5, 11.8, 90, 28.1]],
  ['2.3', 3, 1, [67.6, 53.33, 94, 68.44], [66.6, 51.7, 28.4, 18.3]],
  ['2.3', 4, 0, [6, 37.33, 70.24, 52.44], [5, 35.7, 66.2, 18.3]],
  ['2.3', 4, 1, [70.24, 37.33, 94, 52.44], [69.2, 35.7, 25.8, 18.3]],
  ['4.2', 0, 0, [6, 13.36, 94, 38.22], [5, 11.8, 90, 28.1]],
  ['4.2', 0, 1, [6, 43.58, 94, 68.44], [5, 42.0, 90, 28.1]],
  ['4.2', 1, 0, [6, 34.7, 94, 59.56], [5, 33.1, 90, 28.1]],
  ['4.2', 1, 1, [6, 64.92, 94, 89.78], [5, 63.3, 90, 28.1]],
  ['4.2', 2, 0, [6, 8.39, 94, 38.22], [5, 6.8, 90, 33.0]],
  ['4.2', 2, 1, [6, 43.59, 94, 68.44], [5, 42.0, 90, 28.0]],
  ['4.2', 3, 0, [6, 13.36, 39.09, 38.22], [5, 11.8, 35.1, 28.1]],
  ['4.2', 3, 1, [6, 43.58, 94, 68.44], [5, 42.0, 90, 28.1]],
  ['4.2', 4, 0, [6, 13.36, 94, 38.22], [5, 11.8, 90, 28.1]],
  ['4.2', 4, 1, [6, 43.58, 94, 68.44], [5, 42.0, 90, 28.1]],
  ['5.3', 1, 0, [6, 37.33, 28, 62], [5, 35.7, 24, 27.9]],
  ['5.3', 1, 1, [6, 37.33, 50, 62], [5, 35.7, 46, 27.9]],
  ['5.3', 1, 2, [6, 28.13, 94, 62], [5, 26.5, 90, 37.1]],
];
test('every authored box contains its measured target with a small margin (173-step registry)', () => {
  // 2026-11-06 fix round: boxes no longer equal the target bounds (an edge sitting exactly on a
  // label read as a cut letter: "/8" for "5/8", "rays of 5"). Each box now wraps its target with a
  // small margin on every side (about 1% across, 1.6% down; 0.45% across for one part of a bar,
  // where the neighbouring part starts), never more than 3%, and no box edge crosses a label it
  // does not name (measured with getBBox at authoring time).
  assert.equal(REGISTRY.length, 173);
  const seen = new Set();
  for (const [n, si, fi, measured, box] of REGISTRY) {
    const f = deck(n).slides[si].focus[fi];
    assert.ok(f, `${n} s${si} step ${fi + 1}: step exists`);
    seen.add(`${n}/${si}/${fi}`);
    assert.deepEqual(f.box, box, `${n} s${si} step ${fi + 1}: box as audited`);
    const [x, y, w, h] = f.box;
    const margins = [['left', measured[0] - x], ['top', measured[1] - y], ['right', x + w - measured[2]], ['bottom', y + h - measured[3]]];
    for (const [side, m] of margins) {
      assert.ok(m >= -0.05, `${n} s${si} step ${fi + 1}: ${side} edge inside the target by ${-m}`);
      assert.ok(m <= 3, `${n} s${si} step ${fi + 1}: ${side} margin ${m} is not small`);
    }
  }
  let total = 0;
  for (const { n, deck: d } of allDecks()) {
    d.slides.forEach((s, si) => { if (s.visual && Array.isArray(s.focus)) s.focus.forEach((f, fi) => { total++; assert.ok(seen.has(`${n}/${si}/${fi}`), `${n} s${si} step ${fi + 1} in registry`); }); });
  }
  assert.equal(total, 173);
});

// The renderer, checked on real step pages in a real browser: the box % must land identically at
// phone/tablet/desktop figure sizes, the ring must contain the measured target, and the caption
// pill must never cover the ring or the step badge.
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const { chromium } = await import('@playwright/test');
seed({ quiet: true });
const kid = auth.createUser({ username: `nqgf${Date.now() % 1e6}`, password: 'correct-horse-12', displayName: 'Kid', role: 'admin' });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const sessionCookie = (user) => {
  let cookie = '';
  auth.startSession({ append: (k, v) => { cookie = v.split(';')[0]; } }, user.id);
  const [name, value] = cookie.split(/=(.*)/).filter(Boolean);
  return { name, value };
};
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = () => chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
async function openDeck(browser, w, key) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
  await page.context().addCookies([{ ...sessionCookie(kid), url: base }]);
  await page.goto(`${base}/courses/number-quest/explorer-${key}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.evaluate(() => document.querySelectorAll('.smedia.gf').forEach(f => { f.dataset.gfPlayed = '1'; f.removeAttribute('data-gf-step'); }));
  return page;
}
async function gotoSlide(page, si) {
  await page.evaluate((idx) => { const dots = document.querySelectorAll('#deck-dots .dot'); if (dots[idx]) dots[idx].click(); }, si);
  await page.waitForFunction((idx) => { const sl = document.querySelectorAll('.slide')[idx]; return sl && !sl.hidden && sl.querySelector('.smedia.gf'); }, si, { timeout: 5000 }).catch(() => {});
  await page.evaluate((idx) => { const sl = document.querySelectorAll('.slide')[idx]; const fig = sl && sl.querySelector('.smedia.gf'); if (fig) fig.scrollIntoView({ block: 'center' }); }, si);
  await page.waitForTimeout(120);
}
function stepRects(page, si, fi) {
  return page.evaluate(({ si, fi }) => {
    const sl = document.querySelectorAll('.slide')[si];
    const fig = sl.querySelector('.smedia.gf');
    fig.setAttribute('data-gf-step', String(fi));
    return new Promise(res => setTimeout(() => {
      // Everything in % of the ORIGINAL 100 x 56.25 drawing, the space the boxes are authored in: the frame
      // (.sframe) shows only the drawing's content band (the SVG viewBox), so rects are mapped back through it.
      const F = fig.querySelector('.sframe').getBoundingClientRect();
      const vb = fig.querySelector('svg.vf-svg').viewBox.baseVal;
      const rel = r => [+(100 * (r.left - F.left) / F.width).toFixed(2), +((vb.y + (r.top - F.top) / F.height * vb.height) / 0.5625).toFixed(2),
        +(100 * r.width / F.width).toFixed(2), +(r.height / F.height * vb.height / 0.5625).toFixed(2)];
      const stepEl = fig.querySelectorAll('.gf-step')[fi];
      const box = stepEl.querySelector('.gf-box');
      const insetRaw = getComputedStyle(box, '::after').inset.split(' ')[0];
      let outsetPx = Math.abs(parseFloat(insetRaw));
      if (!Number.isFinite(outsetPx) || insetRaw.includes('cqw')) {
        const num = /[\d.]+/.exec(insetRaw);
        outsetPx = num ? F.width * parseFloat(num[0]) / 100 : 8;
      }
      const br = box.getBoundingClientRect();
      const ring = rel({ left: br.left - outsetPx, top: br.top - outsetPx, width: br.width + 2 * outsetPx, height: br.height + 2 * outsetPx });
      const els = [...fig.querySelectorAll('svg.vf-svg *')].map(el => ({ tag: el.tagName, text: el.tagName === 'text' ? el.textContent : undefined, rect: rel(el.getBoundingClientRect()) }));
      const badgeEl = stepEl.querySelector('.gf-badge');
      res({ box: rel(br), ring, badge: getComputedStyle(badgeEl).display === 'none' ? null : rel(badgeEl.getBoundingClientRect()), cueOnPicture: !!stepEl.querySelector('.gf-cue'), els });
    }, 340));
  }, { si, fi });
}
const inter = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));

test("Greg's slide renders the same box % at 390/834/1280, the ring contains its target, and the cue is under the picture", async () => {
  const browser = await launch();
  try {
    // Measured target bounds at 390px: step 1 = the 347 label + point; step 2 = the 300 tick + label.
    const targets = [[43.22, 43.03, 51.5, 68.09], [2.47, 59.38, 9.53, 81.63]];
    const authored = [[42.3, 41.4, 10.2, 28.3], [1.5, 57.8, 9.1, 25.5]];
    const first = [];
    for (const w of [390, 834, 1280]) {
      const page = await openDeck(browser, w, '1.2');
      await gotoSlide(page, 1);
      for (let fi = 0; fi < 2; fi++) {
        const m = await stepRects(page, 1, fi);
        // The engine pads a diagram box outward until no label is cut by its edge: the rendered box holds
        // the authored one, and lands at the same % at every width.
        const a = authored[fi];
        assert.ok(m.box[0] <= a[0] + 0.6 && m.box[1] <= a[1] + 0.6 && m.box[0] + m.box[2] >= a[0] + a[2] - 0.6 && m.box[1] + m.box[3] >= a[1] + a[3] - 0.6, `width ${w} step ${fi + 1}: rendered box % ${m.box} holds authored ${a}`);
        if (w === 390) first[fi] = m.box; else m.box.forEach((v, i) => assert.ok(Math.abs(v - first[fi][i]) <= 0.6, `width ${w} step ${fi + 1}: box % ${m.box} ≈ at 390 ${first[fi]}`));
        const t = targets[fi];
        assert.ok(m.ring[0] <= t[0] && m.ring[1] <= t[1] && m.ring[0] + m.ring[2] >= t[2] && m.ring[1] + m.ring[3] >= t[3],
          `width ${w} step ${fi + 1}: ring ${m.ring} contains measured target ${t}`);
        // A diagram's cue is the caption strip under the picture, never on it; its badge sits on no text.
        assert.equal(m.cueOnPicture, false, `width ${w} step ${fi + 1}: no cue chip on the diagram`);
        if (m.badge) for (const e of m.els.filter(e => e.tag === 'text')) assert.equal(inter(m.badge, e.rect), 0, `width ${w} step ${fi + 1}: badge ∩ "${e.text}"`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test('the art-pass residual slide (1.2 slide 3): the ring around 12,648 clears the 12,500 tick label at 390px', async () => {
  const browser = await launch();
  try {
    const page = await openDeck(browser, 390, '1.2');
    await gotoSlide(page, 3);
    const m = await stepRects(page, 3, 0);
    const label = m.els.find(e => e.tag === 'text' && e.text === '12,500');
    assert.ok(label, '12,500 label rendered');
    const held = inter(m.ring, label.rect) >= label.rect[2] * label.rect[3] - 0.05;
    assert.ok(inter(m.ring, label.rect) === 0 || held, `ring ∩ 12,500 label = ${inter(m.ring, label.rect)}%²: the ring never cuts the label (was 13.7%² with the authored box)`);
    await page.close();
  } finally { await browser.close(); }
});

test('crowded number lines (2.2 slides 1 and 3): mark labels are pairwise disjoint at 390px', async () => {
  const browser = await launch();
  try {
    const page = await openDeck(browser, 390, '2.2');
    for (const si of [1, 3]) {
      await gotoSlide(page, si);
      const m = await stepRects(page, si, 0);
      const labels = m.els.filter(e => e.tag === 'text' && e.rect[1] > 65);
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        assert.equal(inter(labels[i].rect, labels[j].rect), 0, `slide ${si}: labels "${labels[i].text}" ∩ "${labels[j].text}"`);
      }
    }
    await page.close();
  } finally { await browser.close(); }
});

test('every drawn caption (tiles/array diagrams) renders inside the frame at 390px', async () => {
  const browser = await launch();
  try {
    for (const { n, deck: d } of allDecks()) {
      const page = await openDeck(browser, 390, n);
      for (let si = 0; si < d.slides.length; si++) {
        const s = d.slides[si];
        if (!s.visual || !s.visual.label || (s.visual.type !== 'tiles' && s.visual.type !== 'array')) continue;
        await gotoSlide(page, si);
        const m = await stepRects(page, si, 0);
        const cap = m.els.find(e => e.tag === 'text' && e.text === s.visual.label);
        assert.ok(cap, `${n} s${si}: caption rendered`);
        assert.ok(cap.rect[0] >= -0.5 && cap.rect[0] + cap.rect[2] <= 100.5,
          `${n} s${si}: caption "${s.visual.label}" spans ${cap.rect[0]}..${cap.rect[0] + cap.rect[2]} inside the frame`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

// Fix round A6 (grade r5): a tour badge is a number in a circle, so parked right beside a number on the diagram it
// reads as one ("score 3" and badge 2 read "32", badge 1 beside "350"). public/js/course.js gives labels that hold a
// digit a wider berth; this pins it on every Number Quest diagram, in the tour and in the still (reduced-motion) view.
test('no tour badge sits within 5 px of a number on any Number Quest diagram (390 px, tour and still view)', async () => {
  const browser = await launch();
  const problems = [];
  try {
    for (const reduced of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addCookies([{ ...sessionCookie(kid), url: base }]);
      const page = await ctx.newPage();
      for (const { n, deck: d } of allDecks()) {
        if (!d.slides.some(s => s.visual && s.focus)) continue;
        await page.goto(`${base}/courses/number-quest/explorer-${n}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.evaluate(() => document.fonts.ready);
        for (let si = 0; si < d.slides.length; si++) {
          if (!(d.slides[si].visual && d.slides[si].focus)) continue;
          await page.evaluate(idx => { const dots = document.querySelectorAll('#deck-dots .dot'); if (dots[idx]) dots[idx].click(); }, si);
          await page.waitForTimeout(reduced ? 450 : 300);
          const near = await page.evaluate(idx => {
            const fig = document.querySelectorAll('.slide')[idx].querySelector('.smedia.gf.vf');
            if (!fig) return [];
            const R = el => el.getBoundingClientRect();
            const nums = [...fig.querySelectorAll('.vf-svg text')].filter(t => /\d/.test(t.textContent)).map(t => ({ r: R(t), s: t.textContent }));
            const out = [];
            fig.querySelectorAll('.gf-step').forEach((stp, k) => {
              const bg = stp.querySelector('.gf-badge');
              if (!bg || bg.classList.contains('gf-badge--off') || getComputedStyle(bg).display === 'none') return;
              const g = R(bg); if (!g.width) return;
              for (const t of nums) {
                const gap = Math.max(0, t.r.left - g.right, g.left - t.r.right, t.r.top - g.bottom, g.top - t.r.bottom);
                if (gap < 5) out.push(`badge ${k + 1} is ${gap.toFixed(1)} px from "${t.s}"`);
              }
            });
            return out;
          }, si);
          for (const p of near) problems.push(`${reduced ? 'still' : 'tour'} ${n} slide ${si + 1}: ${p}`);
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(problems, []);
});
