// Number rods in the run-through (tests/unit/manip-task-flow-browser.test.js): each new rod from the palette ("Add Rod
// 4, purple"), dragged onto its labeled mat where the task has mats, end to end in the solution's order (mats.js).
import { buildPieces } from './mats.js';

export const build = (ui, v) => buildPieces(ui, v, 'number-rods', kind => ui.scope.locator(`#mp-palette [data-pal][aria-label^="Add Rod ${kind.slice(1)},"]`).first());
