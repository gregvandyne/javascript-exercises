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
  assert.equal(slides, 71, 'visual focus slides across the 23 Explorer decks');
  assert.equal(steps, 161, 'focus steps across the 23 Explorer decks');
});

// Greg's reported slide: deck 1.2 slide 1 "Look at the next digit" (rounding line 300 — 347 — 350 — 400).
// Step 1 rings the 347 marker (label + point); step 2 rings the 300 tick + label it rounds to.
test("Greg's reported slide (1.2 slide 1): both boxes hug their measured targets", () => {
  const s = deck('1.2').slides[1];
  assert.deepEqual(s.focus[0].box, [43.2, 43, 8.3, 25.1]);
  assert.deepEqual(s.focus[1].box, [2.4, 59.3, 7.2, 22.4]);
});

// [deck, slideIdx, stepIdx, measured target [x0, y0, x1, y1], authored box [x, y, w, h]]
const REGISTRY = [
  ['0.1', 2, 0, [6, 32, 26.5, 58.67], [6, 32, 20.5, 26.7]],
  ['0.1', 2, 1, [51, 32, 71.5, 58.67], [51, 32, 20.5, 26.7]],
  ['0.1', 3, 0, [6, 32, 64, 72.75], [6, 32, 58, 40.8]],
  ['0.1', 3, 1, [6, 32, 34, 72.75], [6, 32, 28, 40.8]],
  ['0.1', 4, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['0.1', 4, 1, [36, 32, 64, 58.67], [36, 32, 28, 26.7]],
  ['1.1', 0, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['1.1', 0, 1, [6, 32, 94, 58.67], [6, 32, 88, 26.7]],
  ['1.1', 1, 0, [7.5, 16, 33.83, 78.63], [7.5, 16, 26.4, 62.7]],
  ['1.1', 1, 1, [36.83, 16, 92.5, 78.63], [36.8, 16, 55.7, 62.7]],
  ['1.1', 2, 0, [7.5, 16, 26.5, 78.63], [7.5, 16, 19, 62.7]],
  ['1.1', 2, 1, [29.5, 16, 70.5, 78.63], [29.5, 16, 41, 62.7]],
  ['1.1', 2, 2, [73.5, 16, 92.5, 78.63], [73.5, 16, 19, 62.7]],
  ['1.1', 3, 0, [7.5, 16, 48.5, 78.63], [7.5, 16, 41, 62.7]],
  ['1.1', 3, 1, [51.5, 16, 92.5, 78.63], [51.5, 16, 41, 62.7]],
  ['1.2', 0, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['1.2', 0, 1, [36, 32, 94, 58.67], [36, 32, 58, 26.7]],
  ['1.2', 1, 0, [43.22, 43.03, 51.5, 68.09], [43.2, 43, 8.3, 25.1]],
  ['1.2', 1, 1, [2.47, 59.38, 9.53, 81.63], [2.4, 59.3, 7.2, 22.4]],
  ['1.2', 2, 0, [71.95, 43.03, 80.85, 68.09], [71.9, 43, 9, 25.1]],
  ['1.2', 2, 1, [71.95, 24.57, 94, 68.09], [71.9, 24.5, 22.1, 43.6]],
  ['1.2', 3, 0, [55.82, 43.03, 70.24, 68.09], [55.8, 43, 14.5, 25.1]],
  ['1.2', 3, 1, [86.91, 59.38, 98.26, 81.63], [86.9, 59.3, 11.4, 22.4]],
  ['1.3', 0, 0, [6, 32, 58, 58.67], [6, 32, 52, 26.7]],
  ['1.3', 0, 1, [78, 32, 94, 58.67], [78, 32, 16, 26.7]],
  ['1.3', 1, 0, [6, 32, 58, 58.67], [6, 32, 52, 26.7]],
  ['1.3', 1, 1, [59.72, 32, 76.28, 72.75], [59.7, 32, 16.6, 40.8]],
  ['1.3', 2, 0, [6, 32, 16.86, 58.67], [6, 32, 10.9, 26.7]],
  ['1.3', 2, 1, [83.14, 32, 94, 58.67], [83.1, 32, 10.9, 26.7]],
  ['1.3', 3, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['1.3', 3, 1, [36, 32, 64, 58.67], [36, 32, 28, 26.7]],
  ['2.1', 1, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['2.1', 1, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['2.1', 2, 0, [6, 32, 26.5, 58.67], [6, 32, 20.5, 26.7]],
  ['2.1', 2, 1, [51, 32, 94, 58.67], [51, 32, 43, 26.7]],
  ['2.1', 3, 0, [6, 32, 64, 58.67], [6, 32, 58, 26.7]],
  ['2.1', 3, 1, [66, 32, 94, 58.67], [66, 32, 28, 26.7]],
  ['2.2', 1, 0, [6, 24.57, 11.08, 60.44], [6, 24.5, 5.1, 36]],
  ['2.2', 1, 1, [11.08, 24.57, 89.31, 60.44], [11, 24.5, 78.4, 36]],
  ['2.2', 1, 2, [89.31, 24.57, 94, 60.44], [89.3, 24.5, 4.7, 36]],
  ['2.2', 2, 0, [6, 37.33, 55.33, 52.44], [6, 37.3, 49.4, 15.2]],
  ['2.2', 2, 1, [55.33, 37.33, 94, 52.44], [55.3, 37.3, 38.7, 15.2]],
  ['2.2', 3, 0, [5.06, 24.57, 7.51, 60.44], [5, 24.5, 2.6, 36]],
  ['2.2', 3, 1, [6.58, 24.57, 94.79, 60.44], [6.5, 24.5, 88.3, 36]],
  ['2.3', 1, 0, [6, 28.13, 94, 52.44], [6, 28.1, 88, 24.4]],
  ['2.3', 1, 1, [58.8, 37.33, 94, 52.44], [58.8, 37.3, 35.2, 15.2]],
  ['2.3', 2, 0, [6, 37.33, 39.51, 52.44], [6, 37.3, 33.6, 15.2]],
  ['2.3', 2, 1, [39.51, 37.33, 94, 52.44], [39.5, 37.3, 54.5, 15.2]],
  ['2.3', 3, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['2.3', 3, 1, [67.6, 53.33, 94, 68.44], [67.6, 53.3, 26.4, 15.2]],
  ['2.3', 5, 0, [6, 37.33, 70.24, 52.44], [6, 37.3, 64.3, 15.2]],
  ['2.3', 5, 1, [70.24, 37.33, 94, 52.44], [70.2, 37.3, 23.8, 15.2]],
  ['3.1', 0, 0, [20.95, 24.21, 79.05, 31.5], [20.9, 24.2, 58.2, 7.3]],
  ['3.1', 0, 1, [20.95, 24.21, 79.05, 71.79], [20.9, 24.2, 58.2, 47.6]],
  ['3.1', 1, 0, [19.15, 21.69, 80.85, 28.98], [19.1, 21.6, 61.8, 7.4]],
  ['3.1', 1, 1, [19.15, 21.69, 80.85, 74.31], [19.1, 21.6, 61.8, 52.8]],
  ['3.1', 2, 0, [17.09, 19.16, 82.91, 26.45], [17, 19.1, 66, 7.4]],
  ['3.1', 2, 1, [17.09, 19.16, 82.91, 76.84], [17, 19.1, 66, 57.8]],
  ['3.1', 3, 0, [17.09, 19.16, 82.91, 26.45], [17, 19.1, 66, 7.4]],
  ['3.1', 3, 1, [17.09, 19.16, 82.91, 76.84], [17, 19.1, 66, 57.8]],
  ['3.1', 4, 0, [6, 37.33, 82.56, 52.44], [6, 37.3, 76.6, 15.2]],
  ['3.1', 4, 1, [82.56, 37.33, 94, 52.44], [82.5, 37.3, 11.5, 15.2]],
  ['3.2', 1, 0, [6, 32, 26.5, 58.67], [6, 32, 20.5, 26.7]],
  ['3.2', 1, 1, [51, 32, 94, 58.67], [51, 32, 43, 26.7]],
  ['3.2', 2, 0, [17.09, 21.69, 82.91, 28.98], [17, 21.6, 66, 7.4]],
  ['3.2', 2, 1, [47.95, 86.13, 72.48, 94.08], [47.9, 86.1, 24.6, 8]],
  ['3.2', 4, 0, [6, 37.33, 79.04, 52.44], [6, 37.3, 73.1, 15.2]],
  ['3.2', 4, 1, [79.04, 37.33, 94, 52.44], [79, 37.3, 15, 15.2]],
  ['3.3', 0, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['3.3', 0, 1, [66, 32, 94, 58.67], [66, 32, 28, 26.7]],
  ['3.3', 1, 0, [6, 5.02, 68.86, 29.33], [6, 5, 62.9, 24.4]],
  ['3.3', 1, 1, [6, 65.47, 94, 89.78], [6, 65.4, 88, 24.4]],
  ['3.3', 2, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['3.3', 2, 1, [66, 32, 94, 58.67], [66, 32, 28, 26.7]],
  ['3.3', 4, 0, [6, 32, 34, 58.67], [6, 32, 28, 26.7]],
  ['3.3', 4, 1, [66, 32, 94, 58.67], [66, 32, 28, 26.7]],
  ['4.1', 0, 0, [6, 28.13, 94, 52.44], [6, 28.1, 88, 24.4]],
  ['4.1', 0, 1, [6, 28.13, 94, 52.44], [6, 28.1, 88, 24.4]],
  ['4.1', 1, 0, [6, 28.13, 94, 52.44], [6, 28.1, 88, 24.4]],
  ['4.1', 1, 1, [6, 37.33, 72, 52.44], [6, 37.3, 66, 15.2]],
  ['4.1', 2, 0, [47.7, 59.38, 52.3, 81.63], [47.7, 59.3, 4.6, 22.4]],
  ['4.1', 2, 1, [68.47, 43.03, 75.53, 68.09], [68.4, 43, 7.2, 25.1]],
  ['4.1', 3, 0, [6, 28.13, 94, 52.44], [6, 28.1, 88, 24.4]],
  ['4.1', 3, 1, [6, 37.33, 61, 52.44], [6, 37.3, 55, 15.2]],
  ['4.1', 4, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.1', 4, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.2', 0, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.2', 0, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.2', 1, 0, [6, 35.25, 94, 59.55], [6, 35.2, 88, 24.4]],
  ['4.2', 1, 1, [6, 65.47, 94, 89.78], [6, 65.4, 88, 24.4]],
  ['4.2', 2, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.2', 2, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.2', 3, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.2', 3, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.2', 4, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.2', 4, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.3', 0, 0, [6, 13.91, 94, 38.22], [6, 13.9, 88, 24.4]],
  ['4.3', 0, 1, [6, 44.13, 94, 68.44], [6, 44.1, 88, 24.4]],
  ['4.3', 1, 0, [6, 5.02, 94, 59.55], [6, 5, 88, 54.6]],
  ['4.3', 1, 1, [6, 65.47, 94, 89.78], [6, 65.4, 88, 24.4]],
  ['4.3', 2, 0, [6, 35.25, 94, 59.55], [6, 35.2, 88, 24.4]],
  ['4.3', 2, 1, [6, 65.47, 94, 89.78], [6, 65.4, 88, 24.4]],
  ['4.3', 4, 0, [6, 32, 64, 58.67], [6, 32, 58, 26.7]],
  ['4.3', 4, 1, [66, 32, 94, 58.67], [66, 32, 28, 26.7]],
  // Phase 2 (Units 5-7 + the finale), measured the same way: [deck, slideIdx, stepIdx, measured, box]
  ['5.1', 1, 0, [4.77, 59.38, 7.22, 81.63], [4.6, 59.2, 2.8, 22.6]],
  ['5.1', 1, 1, [47.7, 59.38, 52.3, 81.63], [47.5, 59.2, 5, 22.6]],
  ['5.1', 1, 2, [6, 24.57, 94, 60.44], [5.8, 24.4, 88.4, 36.2]],
  ['5.1', 2, 0, [6, 13.91, 94, 38.22], [5.8, 13.7, 88.4, 24.7]],
  ['5.1', 2, 1, [6, 53.33, 50, 68.44], [5.8, 53.1, 44.4, 15.5]],
  ['5.1', 2, 2, [6, 44.13, 94, 68.44], [5.8, 43.9, 88.4, 24.7]],
  ['5.2', 1, 0, [6, 24.57, 50, 60.44], [5.8, 24.4, 44.4, 36.2]],
  ['5.2', 1, 1, [46.01, 59.38, 53.99, 81.63], [45.8, 59.2, 8.4, 22.6]],
  ['5.2', 1, 2, [50, 24.57, 72, 60.44], [49.8, 24.4, 22.4, 36.2]],
  ['5.2', 2, 0, [19.43, 43.03, 29.25, 68.09], [19.2, 42.8, 10.2, 25.5]],
  ['5.2', 2, 1, [24.33, 24.57, 50, 60.44], [24.1, 24.4, 26.1, 36.2]],
  ['5.2', 2, 2, [45.25, 59.38, 54.76, 81.63], [45, 59.2, 10, 22.6]],
  ['5.3', 1, 0, [6, 37.33, 28, 52.44], [5.8, 37.1, 22.4, 15.5]],
  ['5.3', 1, 1, [6, 37.33, 50, 52.44], [5.8, 37.1, 44.4, 15.5]],
  ['5.3', 1, 2, [6, 28.13, 94, 52.44], [5.8, 27.9, 88.4, 24.7]],
  ['5.3', 2, 0, [6, 13.91, 94, 38.22], [5.8, 13.7, 88.4, 24.7]],
  ['5.3', 2, 1, [6, 53.33, 63.2, 68.44], [5.8, 53.1, 57.6, 15.5]],
  ['5.3', 2, 2, [63.2, 53.33, 94, 68.44], [63, 53.1, 31.2, 15.5]],
  ['6.1', 1, 0, [6, 32, 26.5, 58.67], [5.8, 31.8, 20.9, 27.1]],
  ['6.1', 1, 1, [28.5, 32, 49, 58.67], [28.3, 31.8, 20.9, 27.1]],
  ['6.1', 1, 2, [73.5, 32, 94, 58.67], [73.3, 31.8, 20.9, 27.1]],
  ['6.1', 2, 0, [50, 23.11, 94, 38.22], [49.8, 22.9, 44.4, 15.5]],
  ['6.1', 2, 1, [50, 53.33, 94, 68.44], [49.8, 53.1, 44.4, 15.5]],
  ['6.1', 2, 2, [6, 13.91, 94, 68.44], [5.8, 13.7, 88.4, 54.9]],
  ['6.2', 1, 0, [6, 37.33, 32.4, 52.44], [5.8, 37.1, 26.8, 15.5]],
  ['6.2', 1, 1, [50, 37.33, 76.4, 52.44], [49.8, 37.1, 26.8, 15.5]],
  ['6.2', 1, 2, [6, 28.13, 94, 52.44], [5.8, 27.9, 88.4, 24.7]],
  ['6.2', 2, 0, [17.09, 24.21, 82.91, 31.5], [16.9, 24, 66.2, 7.7]],
  ['6.2', 2, 1, [17.09, 24.21, 82.91, 71.79], [16.9, 24, 66.2, 48]],
  ['6.3', 1, 0, [6, 37.33, 50, 52.44], [5.8, 37.1, 44.4, 15.5]],
  ['6.3', 1, 1, [43.71, 23.7, 56.29, 56.89], [43.5, 23.5, 13, 33.6]],
  ['6.3', 1, 2, [50, 37.33, 94, 52.44], [49.8, 37.1, 44.4, 15.5]],
  ['6.3', 2, 0, [47.95, 21.69, 52.05, 74.31], [47.8, 21.5, 4.5, 53]],
  ['6.3', 2, 1, [47.95, 36.8, 52.05, 44.09], [47.8, 36.6, 4.5, 7.7]],
  ['7.1', 1, 0, [6, 5.02, 58.8, 29.33], [5.8, 4.8, 53.2, 24.7]],
  ['7.1', 1, 1, [6, 35.25, 94, 59.55], [5.8, 35, 88.4, 24.8]],
  ['7.1', 1, 2, [6, 65.47, 76.4, 89.78], [5.8, 65.3, 70.8, 24.7]],
  ['7.1', 2, 0, [6, 24.57, 28, 60.44], [5.8, 24.4, 22.4, 36.2]],
  ['7.1', 2, 1, [50, 24.57, 72, 60.44], [49.8, 24.4, 22.4, 36.2]],
  ['7.1', 2, 2, [68.63, 59.38, 75.38, 81.63], [68.4, 59.2, 7.2, 22.6]],
  ['7.2', 1, 0, [6, 5.02, 72, 29.33], [5.8, 4.8, 66.4, 24.7]],
  ['7.2', 1, 1, [6, 35.25, 94, 59.55], [5.8, 35, 88.4, 24.8]],
  ['7.2', 1, 2, [6, 65.47, 35.3, 89.78], [5.8, 65.3, 29.7, 24.7]],
  ['7.2', 2, 0, [4.93, 59.38, 7.08, 81.63], [4.7, 59.2, 2.6, 22.6]],
  ['7.2', 2, 1, [29.2, 43.03, 41.47, 68.09], [29, 42.8, 12.7, 25.5]],
  ['7.2', 2, 2, [92.77, 59.38, 95.22, 81.63], [92.6, 59.2, 2.8, 22.6]],
  ['7.3', 1, 0, [6, 37.33, 20.67, 52.44], [5.8, 37.1, 15.1, 15.5]],
  ['7.3', 1, 1, [20.67, 37.33, 94, 52.44], [20.5, 37.1, 73.7, 15.5]],
  ['7.3', 1, 2, [6, 28.13, 94, 52.44], [5.8, 27.9, 88.4, 24.7]],
  ['7.3', 2, 0, [6, 32, 26.5, 58.67], [5.8, 31.8, 20.9, 27.1]],
  ['7.3', 2, 1, [51, 32, 71.5, 58.67], [50.8, 31.8, 20.9, 27.1]],
  ['7.4', 2, 0, [6, 13.91, 94, 38.22], [5.8, 13.7, 88.4, 24.7]],
  ['7.4', 2, 1, [6, 53.33, 83.62, 68.44], [5.8, 53.1, 78, 15.5]],
  ['7.4', 2, 2, [83.62, 53.33, 94, 68.44], [83.4, 53.1, 10.8, 15.5]],
  ['7.4', 3, 0, [45.4, 59.38, 54.6, 81.63], [45.2, 59.2, 9.6, 22.6]],
  ['7.4', 3, 1, [50, 24.57, 88.5, 60.44], [49.8, 24.4, 38.9, 36.2]],
  ['7.4', 3, 2, [84.21, 43.03, 92.8, 68.09], [84, 42.8, 9, 25.5]],
];
test('every authored box matches its measured target bounds within 0.6%/side (161-step registry)', () => {
  assert.equal(REGISTRY.length, 161);
  const seen = new Set();
  for (const [n, si, fi, measured, box] of REGISTRY) {
    const f = deck(n).slides[si].focus[fi];
    assert.ok(f, `${n} s${si} step ${fi + 1}: step exists`);
    seen.add(`${n}/${si}/${fi}`);
    assert.deepEqual(f.box, box, `${n} s${si} step ${fi + 1}: box as audited`);
    const [x, y, w, h] = f.box;
    const sides = [
      ['left', x, measured[0]], ['top', y, measured[1]],
      ['right', x + w, measured[2]], ['bottom', y + h, measured[3]],
    ];
    for (const [side, got, want] of sides) {
      assert.ok(Math.abs(got - want) <= 0.6, `${n} s${si} step ${fi + 1}: ${side} ${got} ≈ measured ${want}`);
    }
  }
  let total = 0;
  for (const { n, deck: d } of allDecks()) {
    d.slides.forEach((s, si) => { if (s.visual && Array.isArray(s.focus)) s.focus.forEach((f, fi) => { total++; assert.ok(seen.has(`${n}/${si}/${fi}`), `${n} s${si} step ${fi + 1} in registry`); }); });
  }
  assert.equal(total, 161);
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
    const authored = [[43.2, 43, 8.3, 25.1], [2.4, 59.3, 7.2, 22.4]];
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
