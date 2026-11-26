// Money in the run-through (tests/unit/manip-task-flow-browser.test.js): coins and bills from the palette ("Add Quarter,
// 25¢", "Add Bill, $5"), dragged onto their labeled mat where the task has mats; a trade deletes pieces on the
// hold-to-edit wheel first (mats.js).
import { buildPieces } from './mats.js';
import { allPieceDefs, paletteName } from '../../../public/js/manip-data.js';

const ARIA = Object.fromEntries(allPieceDefs('money').map(d => [d.kind, paletteName('money', d).aria]));
export const build = (ui, v) => buildPieces(ui, v, 'money', kind => ui.scope.locator(`#mp-palette [data-pal][aria-label="Add ${ARIA[kind]}"]`).first());
