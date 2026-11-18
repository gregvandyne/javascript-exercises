// Oomba Canvas: the global a game uses. window.OombaCanvas (alias Oc):
//   Oc.activity({ config, task, problems, gen, steps, hints })   draw the activity and run it (docs/canvas-api.md)
//   Oc.selfTest(activity)                                        the Builder's check (every problem solvable, never right empty)
//   Oc.tools, Oc.words, Oc.version
// In a page with no document (the server's check, server/services/canvaskit.js) only the pure parts are there.
import { activity, TOOLS, deal, selfTest, seeded, cleanProblem, WORDS, VERSION } from './ui.js';

const OombaCanvas = Object.freeze({
  version: VERSION,
  activity,
  selfTest: a => selfTest(a, WORDS.en),
  tools: Object.freeze(Object.keys(TOOLS)),
  logic: Object.freeze({ TOOLS, deal, seeded, cleanProblem }),
  words: WORDS,
});
globalThis.OombaCanvas = OombaCanvas;
globalThis.Oc = OombaCanvas;
