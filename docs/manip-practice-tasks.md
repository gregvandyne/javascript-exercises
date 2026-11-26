# Manipulatives: tasks you can practice and assign

How a Manipulatives task becomes practice that students can do on their own, that teachers can assign, and that runs
the same way inside Homeroom. Phase 1 converted Rekenreks and Base Ten Blocks; phase 2 converts the other 16 tools by
following the checklist at the end. The decision record is in `docs/decisions.md` ("Manipulatives: tasks you can
practice and assign").

## Where things live

| What | File |
| --- | --- |
| A tool's tasks (one file per tool, shared by the browser, the server and the tests) | `public/js/manip-tasks/<slug>.js` |
| The task list as before (`TASKS`, slug -> tasks), lookups, `variation`, `variations`, `check` | `public/js/manip-tasks.js` |
| The engine: seeded random source, variations and sets, the one checker, answer matching | `public/js/manip-task-kit.js` |
| The problem card above the board (solo and assigned sets) | `public/js/manip-task-play.js` |
| A tool's task list, the Assign sheet, the student's tool list | `public/js/manip-task-list.js` |
| Solo progress, assigning, a student's set, live boards for Homeroom | `server/services/manip-tasks.js` |
| Checking an assigned set (marks, score, done) | `server/services/progress.js` `manipFor`, `manipAnswer` |
| Homeroom handout of a task | `server/services/homeroom-handouts.js` `handOutTask` |
| Unit tests (50 seeds of every practice task) | `tests/unit/manip-task-variations.test.js` |
| Browser run-through (every task solo, a set of 5 in Homeroom) | `tests/unit/manip-task-flow-browser.test.js` |
| Per-tool "how to build the answer" for the run-through | `tests/unit/_manip-flow/<slug>.js` (+ `common.js`) |

## The task file format

```js
export const SLUG = 'rekenreks';
export const conds = { /* this tool's board checks, see below */ };
export const TASKS = [
  { key: 'show-7-the-5-way',            // stable forever: the task id is '<slug>/<key>' (saved progress, assigned sets)
    title: 'Show 7 the 5-way',           // kept from the library
    ccss: 'K.OA.A.3', grade: 'K',        // kept
    prompt: 'Show a number from 6 to 10 ...',   // what the task list shows (a summary of the practice)
    notes: 'Watch for children who ...',        // teacher notes, teachers only
    make: R => ({ ... }) },              // the variation generator: a task without make() is not practice yet
];
```

The 16 tools not converted yet already have their file with `key`, `title`, `prompt`, `notes`, `ccss`, `grade` and an
empty `conds`; the page lists those tasks to read, with no Practice button.

### `make(R)`: one variation

`R` is a seeded random source (`manip-task-kit.js` `rngOf`): `R()` in [0, 1), `R.int(lo, hi)` (both included),
`R.pick(list)`, `R.chance(p)`, `R.shuffle(list)`. Never use `Math.random`: the same `(task, seed)` must give the same
variation on the page, on the server (which re-checks) and in the tests. `make` returns:

| Field | What |
| --- | --- |
| `prompt` | The student's words, numbers filled in, plain and short (K-1: about 260 characters at most). |
| `setup` | The board to start from: a full board (format 2: `objects`, `pieces`, tool settings). Use the tool file's own builder (`rekBoard`, `tenBoard`). Objects a student must not change: `st.q: true` (read only); pieces: `locked: true`. |
| `answer` | What is right, one or more of `board` (a list of conditions, all must hold), `box` (`{ key, label, kind?, say? }`: `key` the right answer as text, `label` the box's words, `kind: 'expanded'` for expanded form, `say` what to look at when it is wrong), `choice` (`{ options, correct, say? }`). |
| `hints` | 2 or 3 strings, in order, each a little more help, Oomba's calm voice ("Tap the 5th red bead on the top row."). The last may give the answer. Static: Oomba never chats with students. |
| `explain` | Shown after a right answer, and after the last hint. Why it works, one or two sentences. |
| `solution` | The generator's own answer, `{ board?, box?, choice? }`: the tests check it passes and the run-through builds it. |
| `totals` | `false` hides the board's totals (the tool's own "Total 346" would give the answer away). |
| `sig` | Only when the prompt is the same for every seed (the numbers are on the board): what makes this variation different, for "never the same twice". |

### Variations: rules

- At least 20 genuinely different variations (numbers and contexts) per task; the unit test counts distinct ones in 50
  seeds. A set never repeats one (`setOf` by `sigOf`: the prompt, or `sig`).
- Numbers right for the task's grade (K: to 10, sometimes 20; grade 1: to 20; grade 2: to 1,000; and so on).
- Keep the task's title, CCSS code, grade and teaching goal. An open-ended task ("explain to a partner", "record two
  ways") is reworded into something checkable that keeps its goal: two labeled objects that must show different ways
  (`Way 1`, `Way 2`), a choice question, or a box. Say which ones you reworded in your report.
- No em dashes; US spelling; kids' words. The `solution.board` must be reachable through the real UI.

## The checker API

```js
import { check } from '/js/manip-tasks.js';
check(v, { board, box, choice })   // -> { correct, partial, parts: { board?, box?, choice? }, feedback }
```

- `board` conditions: each `{ t: '<type>', ...params, say: '<what to look at>' }` runs `conds[t](cond, board)` from the
  tool file. A condition reads the raw board state (`objects`, `pieces`), defensively (numbers may be strings, arrays
  may be missing): it gets exactly what the page sends, on the server too. The first failing condition's `say` is the
  feedback. Rekenreks has `rows`, `pair`, `total`, `oneRow`, `split`, `fives`, `covered` (a `label` picks a labeled
  rekenrek); Base Ten Blocks has `total`, `fewest`, `counts`, `inChart`.
- `box`: `manip-practice.js` `answerMatches` (numbers with or without commas, any equal fraction or decimal ("1/2" =
  "0.5"), times "3:05" / "half past 3", money "$1.25" / "125¢"), or `expandedMatches` for `kind: 'expanded'`. Spaces
  never matter.
- `choice`: the index picked.
- `feedback` is never the answer; an empty box says "Type your answer in the box."; no choice says "Pick an answer.".

Where checks happen: solo practice is checked by the server (`POST /api/manipulatives/practice/check`; the page checks
itself only when the server can't be reached). An assigned set is always checked by the server
(`POST /api/manipulatives/set/:cl/:step`), which makes the student's own variation again from the step and the student.

## Assigned sets, marks and scores

- A set is a lesson of kind `manip` with one step of kind `manip` (`lessons.MANIP_KIND`): `items` = `{ v: 1, tasks:
  [ids], n }` (n questions of each task; one tool a set; at most 6 tasks and 30 questions).
- Each student's questions: `MT.setFor(step, userId)`, seeded by the step and the student: the same student always
  gets the same questions; classmates get others.
- `step_progress.marks`: one character a question: `-` open, `1` right on the first check with no hint asked for, `0`
  right later, or moved on from after the last hint. Score = % of `1`; done when nothing is open. The gradebook,
  Classroom overview, Google Classroom and the parents' view read it like a quiz step.
- `step_progress.answer` keeps `{ s: [{ w (wrong checks), h (hints shown) }], run (wrong checks in a row) }`; Homeroom's
  Needs a look flags `run >= 3` ("tries").

## Test helpers

- `tests/unit/manip-task-variations.test.js` covers every practice task automatically: add your tool's slug to
  `CONVERTED`.
- `tests/unit/manip-task-flow-browser.test.js` runs every tool with a helper file:
  `MANIP_FLOW_TOOLS=<slug> node --test tests/unit/manip-task-flow-browser.test.js` (one tool at a time keeps it under
  the 280 s limit; `MANIP_FLOW_SHOTS=<dir>` saves screenshots at 1366, 820 and 390).
- Write `tests/unit/_manip-flow/<slug>.js` exporting `build(ui, v)`: build `v.solution` through the real UI, as a
  student would. `ui.scope` is the page or the Homeroom player's frame; `ui.page` is for the mouse. `common.js` has
  `palette(ui, 'Add Rod')`, `wheel(ui, piece, 'break' | 'delete' | ...)`, `dragTo(ui, from, to)`, `fit(ui)`, `wait`;
  `answer(ui, v)` fills the box and the choice for you. Pieces carry `data-kind`; objects `data-oid` (the setup's ids
  stay the same on the page). Tasks answered only in the box or the choices need nothing in `build`.
- The card says which question it shows: `#mp-prob[data-task][data-seed]` (the test makes the same variation).

## Checklist for converting a tool (phase 2)

1. Read the tool's code (`IMPL[slug]` in `manip.js`, its objects in `manip-board.js`) and its 16-17 tasks.
2. In `public/js/manip-tasks/<slug>.js`: a board builder for `setup` (objects at `rowPlaces`, pieces like
   `manip.js mkPiece`), the `conds` you need, and `make(R)` for every task (wrap with `totals: false` where the tool's
   totals would give answers away). Keep keys, titles, codes, grades and notes; update `prompt` only when you reworded.
3. `node --test tests/unit/manip-task-variations.test.js` with your slug in `CONVERTED`: fix until every seed passes.
4. `tests/unit/_manip-flow/<slug>.js` with `build(ui, v)`; run the flow test for your tool, solo and Homeroom; fix
   everything that fails (in the task, the helper, or the tool when the tool can't do what the task asks: phase 1
   added decimal Break and Regroup to Base Ten Blocks for its decimal tasks).
5. Look at the screenshots at 1366, 820 and 390.
6. The "How it works" video scenes find tasks by title and prompt text (`scripts/manip-tutorials/<slug>.mjs`): if you
   changed a task's title, prompt or the task box's DOM, update the scene, then re-run
   `node scripts/manip-tutorials.mjs <slug> --out <scratch dir>` as a regression check (it plays the real page and
   fails loudly on a broken step). Never commit the videos from that run.
7. Run `manip-task-variations`, your flow test, `manipulatives.test.js` and the Homeroom tests that touch tools
   (`homeroom-watch`, `homeroom-handouts`, `homeroom-staged` and their browser tests). `npm run i18n:check`.
8. Report every reworded task and why.
