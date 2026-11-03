# CS Quest

CS Quest is Oomba Academy's computer-science program for grades 3-5 (band 1B, "Explorer") and 6-8 (band 2, "Pro"):
lessons built from the platform's lesson steps, four official games, live question sets, and a Standards tab per class.
This page documents the **platform slice**: the general-purpose pieces of the lesson, progress and game plumbing that the
program is built on. They are switched on for every school and change nothing while the new columns are empty. The
curriculum (catalogue lessons, the teacher pages, the Standards tab) documents itself in the sections it adds below.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `QUIZ_STEPS` | `1` | Quiz steps (server-checked exit tickets, `lesson_steps.kind='quiz'`) on the student lesson page and their APIs, `GET/POST /api/progress/:cl/:step/quiz`. `0` is an emergency switch: the step is left off the page and those APIs answer 404 `quizStepsOff`. The gradebook still counts the step, so no lesson with a quiz step can be finished while it is off. The older `GET/POST /api/lessons/:cl/steps/:step/quiz` routes in `server/routes/live.js` still follow `LIVE_HOMEWORK` (off by default) until they move to this flag. |
| `LIVE_HOMEWORK` | `0` | Unchanged: only "Set as homework" on a live results page (a lesson with one quiz step, assigned to the class). |
| `CS_QUEST_BUILD_TEAMS_PER_PERIOD` | `8` | How many capstone teams the plan page says can build this period (1-60; `server/services/builder-status.js`). |

## Lesson parameters (`BRB.params`)

A lesson step can open a game at a chapter, for a band, in a mode, at a level, locked or not. Full grammar in
[docs/sdk.md, "Lesson parameters"](sdk.md#lesson-parameters); in short:

- URL (teacher-readable): `/play/<slug>?chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>`; only those five keys,
  values `[a-z0-9-]{1,16}`, `band` `1b` or `2`, `level` 1-30, `lock` 0 or 1. Anything else is dropped before it reaches a game.
- Step column: `lesson_steps.options` holds the same query string in a fixed key order (`chapter=loops&band=1b&lock=1`);
  the student page appends it to the Play link. A step with an unknown key or a bad value is refused (`stepOptions`).
- Frame token: `o = "chapter.band.mode.level.lock"` (empty parts allowed, at most 40 characters; when two 16-character
  ids would make 41, `mode` is left out). `/frame` copies it into `__BRB_INIT__.params`; the SDK exposes
  `BRB.params`, a frozen object (`chapter`, `band`, `mode` strings; `level`, `lock` numbers), `{}` when absent.
- Code: `server/services/play-params.js` (`parseParams`, `packParams`, `unpackParams`, `cleanOptions`, `toQuery`).

## Step and lesson columns (migration `0044_cs_quest_steps`, additive and idempotent)

| Column | On | Holds |
| --- | --- | --- |
| `lesson_steps.options` | game steps | the query string above |
| `lesson_steps.standards` | game, question, build steps | a comma list of CSTA 2017 ids (`1B-AP-10,1B-AP-12`), checked against `server/standards/csta-2017.json` by `server/standards/csta.js`; refused with `stepStandards` |
| `lesson_steps.template` | build steps | the Studio template key the student's game starts from (`builder/catalog.js` `TEMPLATE_KEYS`, e.g. `quiz`); refused with `stepTemplate` |
| `lesson_steps.rubric` | question, build steps | JSON `[{ line, ids: [CSTA ids], levels: [up to 4 descriptors] }]`, at most 8 lines; refused with `stepRubric` |
| `lesson_steps.items[].cat`, `.secs` | quiz steps | kept through `addQuizStep` snapshots (the item's CSTA id and its seconds) |
| `lessons.template_key`, `template_version` | lessons | which catalogue lesson (`csq-1b-1.2`) and version a library copy came from; `copyLesson` carries them, with `options`, `standards`, `template`, `rubric` and `set_id`, and regenerates quiz items from the set when it still exists |

A field that does not belong to the step's kind is dropped, not refused (a text step sent a template keeps nothing). The
lesson editor form never sends these fields, so editing a step keeps them; the catalogue materialiser and the step APIs
(`POST /api/lessons/:id/steps`, `POST /api/lesson-steps/:id`) set them.

## Hosted-live steps (P5)

A game step on an official live-only game (the Oomba Live built-in modes, Quest Race among them, and Would You Rather
Live; `services/progress.js` `HOSTED_LIVE`) says "Your teacher hosts this live" instead of Play and "I played it". The
teacher's "Host live" link carries `mode=` for those games (`/live?cl=&step=&mode=quest-race`), and the live run writes
the student's score into that cell (`classlive-results.js` -> `progress.gameScore(..., 'live')`). The server refuses the
student's own calls on such a step (`/api/progress/:cl/:step/game`, `/done`, and `/play/<slug>?lesson=&step=` opens the
game without the lesson context), so the cell comes from live runs only. Note for existing lessons: a teacher who had
put one of those games on a step for solo practice loses the Play button there; the step is completed by hosting it.

## Rubric marks (P11)

`POST /api/progress/:cl/:step/:user/review` takes `{ feedback?, marks?, alsoMark? }` (or the review form's `mark-<i>`
radios and `alsoMark` checkboxes):

- `marks`: one 0-3 mark per rubric line, as an array (`[2, 3, null, 1]`) or a string (`'23-1'`); stored one character per
  line in `step_progress.marks` (`0`-`3`, `-` not marked; quiz steps keep their `1`/`0`/`-` there). A line left out
  (a shorter list, a form missing a line) or `undefined` is **unchanged**; `null`, `''` or `'-'` un-marks it. A value
  outside 0-3, or more lines than the rubric has, answers 400 `badMarks`; on a step without a rubric only "nothing
  marked" is accepted.
- `feedback`: a string replaces the feedback, even `''` (the form's Send with an empty box, which also marks the answer
  read, as it always did). Left out, the feedback is **kept**.
- `reviewed_at` ("the teacher has seen this") is set when feedback is sent, and otherwise only on a row with no unread
  answer: marks alone, or marks copied to teammates, never take an unread answer off the to-review list or tell the
  student "Your teacher has seen your answer". The student page shows the feedback block only for an answer that was read.
- `alsoMark`: up to 60 classmates who get the same marks on this step (a capstone team: the captain handed the game in);
  a row is made for a teammate who has none; the feedback stays with the one student; nothing happens when every mark
  is `-`. Answer: `{ ok, marks, alsoMarked: [ids] }`.
- Only question and build steps can be reviewed; a text or game step row answers 404 as before.

## Unit cadence (P17)

`lessons.assignUnitWithCadence(u, classId, lessonIds, { unitId, start, cadence, dueDays })`: lesson *k* opens on the
*k*-th cadence day from `start` (`daily`, `weekdays`, `weekly`, `twice-weekly`; today when empty) and is due `dueDays`
later or, without it, the day before the next lesson opens (the last one a week after it opens). Only lessons `assign()`
would take get a day (this school's, editable by the teacher or coming back after a removal); the rest are reported in
`skipped` with `notFound` and the following lessons keep their dates. A lesson already in the class keeps its day and is
reported `alreadyAssigned`. The route lands with the curriculum.

## Builder status (P18)

`builderStatus(now)` -> `{ on, state: 'on' | 'resting', why: null | 'noKey' | 'daily' | 'monthly' | 'hard', resetsAt,
teamsPerPeriod, pools: { free, paid } }`, from `services/ai-budget.js`: the Builder is on while either money pool is
open (a school plan pays into the paid pool, so it stays on while the free pool rests); `resetsAt` says when the free pool
comes back. No prices anywhere on the page.

## Words

Site chrome under `cs.*` in all 13 locale files (`scripts/i18n-add-cs-quest.mjs` merges them; `npm run i18n:check`).
Lesson text, quiz items, rubric lines and CSTA statements are English (rendered with `lang="en"`).

## Curriculum: the catalogue and the materialiser

The program's content is data in `seed-lessons/cs-quest/` (`README.md` there has the schema): `units.json` (7 units, 23
lessons, 46 keys, the four paths, the period and its 40-minute cut), `lessons/<u.n>-<1b|2>.json` (one file per lesson and
band: the whole plan page and the student-visible steps), `games.json` (the chapter table the catalogue test checks quest
codes and step standards against), owner B's `sets/u<n>-<1b|2>.json` (the 14 unit banks) and `wyr-tech.json`. Checked by
`node --test tests/unit/cs-quest-catalogue.test.js`; printed by `node scripts/cs-quest-coverage.js [--json] [--level 1B|2]`.

`server/services/lesson-templates.js` reads it once (`catalogue()`, `getTemplate(key)`, `templates({ band, unit })`,
`unitKeys(n, band)`, `pathKeys(id, band)`, `bankOf(setId)`, `bankItems(setId, ids)`, `setTitles(lesson)`, `coverage()`) and
turns a lesson file into an ordinary lesson in a teacher's library:

- `materialise(u, schoolId, key, { folderId, again })`: the folder **CS Quest** with a sub-folder per unit and band
  (`Unit 1 · Think Like a Robot (Grades 3-5)`), the lesson (title `CS Quest 1.2 · …`, subject `Computer science`, grade,
  summary, the I-can lines as objectives, `template_key` = the catalogue key, `template_version`), the derived live sets in
  the teacher's My sets with subject `cs-quest` (`CSQ 1.2 warm-up · Loops (3-5)`: the five warm-up items at 15 s;
  `CSQ 1.2 exit ticket (3-5)`: the three exit items with `cat`; once per unit and band `CSQ Unit 1 review (3-5)`: the whole
  bank with `cat` replaced by the lesson topic), and the steps in the file's order: Today (text) · Warm-up (live) (a game
  step on Quest Race at 1B / Question Battle at 2, hosted live) · Play: <chapter> (a game step with `options`, `standards`
  and the quest code in the body) · Exit ticket (a quiz step from the exit set, `cat` and `secs` kept; with `QUIZ_STEPS=0` a
  text step "Exit ticket (paper or live)") · In your own words (a question step with the sentence frame and one rubric line
  per primary id). 6.1 / 6.3 put a Would You Rather (live) step there, 6.2 Pro two Play steps, 7.1 three question steps,
  7.2 a Builder etiquette text step and a build step on the `quiz` template with the Program rubric line, 7.3 a text and a
  question step, 7.4 a question step. A game that is not published (or not yet seeded) becomes a text step that says the
  game is not available yet, never a skipped step. The answer carries `notes` (`gameNotPublished`, `quizStepsOff`,
  `bankMissing`) for the plan page's state chips.
- Idempotent per owner, school, key and version: the copy a teacher already has at the catalogue's version is answered as it
  is (`created: false`); `again: true` makes a fresh copy; `status(u, schoolId, key)` / `libraryStatus(u, schoolId)` say
  whether a key is in the library and whether a newer catalogue version exists ("Update available").
  `materialiseUnit(u, schoolId, n, band)`, `materialisePath(u, schoolId, id, band)` and `materialiseMany(u, schoolId, keys)`
  go through the same function; lesson files not written yet are reported in `missing`.
- `resetLesson(u, lessonId)` (P21): a fresh copy of the catalogue version takes over the old copy's class assignments with
  the same unit, `opens_at` and `due_at`; the old copy is unassigned there and keeps the students' work (it comes back if
  the old copy is assigned again); classes the teacher does not manage keep the old copy (`kept`).

Routes (`server/routes/cs-quest.js`, mounted before the lesson routes; staff of a school by membership; refusals are JSON
`{ error, code }`):

| Route | Body / answer |
| --- | --- |
| `POST /api/lessons/from-template/:key` | `{ schoolId?, again? }` -> `{ ok, lesson, created, notes, sets: { warmup, exit, review } }` |
| `POST /api/lessons/from-template/unit/:unit`, `/path/:path` | `{ band: '1b' \| '2', schoolId?, again? }` -> `{ ok, lessons, skipped, missing }` |
| `POST /api/lessons/from-template` | `{ key }` \| `{ keys }` \| `{ unit, band }` \| `{ path, band }` (+ `schoolId?`, `again?`): the same answers |
| `POST /api/lessons/:id/reset-template` | -> `{ ok, lesson, old, moved: [{ classId, classLessonId }], kept, notes }` |
| `POST /api/classes/:id/assign-unit` | `{ lessonIds }` \| `{ keys }` \| `{ unit, band }` \| `{ path, band }` (catalogue keys are materialised first), `unitId?` \| `unitName?` (a class unit found or made; the catalogue unit's or the path's name by default), `start?` (`YYYY-MM-DD`, today when empty), `cadence?` (`daily`, `weekdays`, `weekly`, `twice-weekly`), `dueDays?` -> `{ ok, unit, assigned: [{ lessonId, key, classLessonId, opensAt, dueAt, restored }], skipped, materialised, missing }` (`lessons.assignUnitWithCadence`) |
| `GET /api/cs-quest/catalog` | the program for the signed-in teacher: units and lessons with each band's key, quest code, params and library status in the school, paths, period, rules, FAQ, `missing`, flags, the Builder status |
| `GET /api/cs-quest/lessons/:key` | one lesson file, its derived set titles and library status (unit 7: the Builder status too) |
| `GET /api/cs-quest/coverage` | `coverage()`: the 44 ids with lessons, steps, chapters, bank items, rubric lines, and the practices table |
| `GET /api/cs-quest/builder-status` | `builderStatus()` (P18) |

Tests: `tests/unit/cs-quest-templates.test.js` (the loader, every lesson file present materialised on an in-memory database,
the derived sets, idempotence and Add again, the QUIZ_STEPS-off and game-not-published text steps, reset, the routes) and
`tests/unit/cs-quest-pages.test.js` (the JSON the pages read; the pages themselves are todo until they land).
