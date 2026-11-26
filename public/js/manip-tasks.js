// The manipulatives task library (docs/decisions.md "Virtual math manipulatives" and "Manipulatives: tasks you can
// practice and assign"; docs/manip-practice-tasks.md): 300 original tasks, 16 to 17 for each of the 18 tools, each with
// a stable key, a title, a prompt, teacher notes, its Common Core code and a grade (K-8). English only for now. Each
// tool's tasks live in their own file (public/js/manip-tasks/<slug>.js); a task with make(R) is practice (seeded
// variations, checked answers, hints). Shared by the page (public/js/manip.js), the server (services/manipulatives.js:
// the AI drafter's task list; services/manip-tasks.js: practice and assigned sets) and the tests.
import * as rekenreks from './manip-tasks/rekenreks.js';
import * as twoColorCounters from './manip-tasks/two-color-counters.js';
import * as linkingCubes from './manip-tasks/linking-cubes.js';
import * as colorTiles from './manip-tasks/color-tiles.js';
import * as hundredBoard from './manip-tasks/hundred-board.js';
import * as baseTenBlocks from './manip-tasks/base-ten-blocks.js';
import * as placeValueDisks from './manip-tasks/place-value-disks.js';
import * as numberRods from './manip-tasks/number-rods.js';
import * as fractionCircles from './manip-tasks/fraction-circles.js';
import * as fractionTiles from './manip-tasks/fraction-tiles.js';
import * as numberLines from './manip-tasks/number-lines.js';
import * as barModels from './manip-tasks/bar-models.js';
import * as money from './manip-tasks/money.js';
import * as algebraTiles from './manip-tasks/algebra-tiles.js';
import * as xyCoordinateBoard from './manip-tasks/xy-coordinate-board.js';
import * as geoboard from './manip-tasks/geoboard.js';
import * as patternBlocks from './manip-tasks/pattern-blocks.js';
import * as clock from './manip-tasks/clock.js';
import { variationOf, setOf, checkWork, taskId } from './manip-task-kit.js';

/** Each tool's task file: { SLUG, TASKS, conds }. */
export const TOOL_TASKS = Object.fromEntries([rekenreks, twoColorCounters, linkingCubes, colorTiles, hundredBoard, baseTenBlocks, placeValueDisks, numberRods,
  fractionCircles, fractionTiles, numberLines, barModels, money, algebraTiles, xyCoordinateBoard, geoboard, patternBlocks, clock].map(m => [m.SLUG, m]));
/** slug -> [task] (as before: title, prompt, notes, ccss, grade; now with key, and make for practice tasks). */
export const TASKS = Object.fromEntries(Object.entries(TOOL_TASKS).map(([slug, m]) => [slug, m.TASKS]));

/** Can this task be practiced (it has a variation generator)? */
export const isPractice = task => !!task && typeof task.make === 'function';
/** Every task id ('<slug>/<key>') -> { slug, task, index }. */
const BY_ID = new Map(Object.entries(TASKS).flatMap(([slug, list]) => list.map((task, index) => [taskId(slug, task), { slug, task, index }])));
/** A task by its id, or null. */
export const taskOf = id => BY_ID.get(String(id || '')) || null;
export const idOf = taskId;
/** The practice tasks of a tool (or of every tool). */
export const practiceTasks = (slug = null) => Object.entries(TASKS).filter(([s]) => !slug || s === slug).flatMap(([s, list]) => list.filter(isPractice).map(task => ({ slug: s, task, id: taskId(s, task) })));
/** A task's variation for a seed, by id; null for an unknown or non-practice task. */
export function variation(id, seed) {
  const x = taskOf(id); if (!x || !isPractice(x.task)) return null;
  return variationOf(x.slug, x.task, seed);
}
/** n distinct variations of a task, by id. */
export function variations(id, n, seed, opts) {
  const x = taskOf(id); if (!x || !isPractice(x.task)) return [];
  return setOf(x.slug, x.task, n, seed, opts);
}
/** Check work on a variation (manip-task-kit.js checkWork with the tool's own board checks). */
export function check(v, work) {
  const x = taskOf(v && v.id); if (!x) return { correct: false, partial: false, parts: {}, feedback: '' };
  return checkWork(TOOL_TASKS[x.slug], v, work);
}
