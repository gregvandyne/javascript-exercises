# CS Quest · platform slice (A1) — API notes for the curriculum owner

Branch `cs-quest/platform-slice` (worktree `/home/user/javascript-exercises/.worktrees/platform-slice`), commits
`f347496` + `479dc06`, pushed. Everything here is additive and switched on for every school; with the new columns empty,
lessons, steps, games and the gradebook behave exactly as on `main`. Long-form prose is in `docs/cs-quest.md` and
`docs/sdk.md` ("Lesson parameters") on the branch; this file is the exact surface you can build on without reading the diff.

Scope reminder: this slice is P1–P5, P7–P11, P17 (service only), P18 (helper only). **Not on this branch** (yours or
integration's): P12 Standards tab + `services/standards.js` + `school.classTabs.standards`, P13 plan/print/projector
pages, P15 catalogue + materialiser + `routes/cs-quest.js` + `app.js` mount, the P17 route, the P18 endpoint, P21 reset,
`docs/legal-review.md` line, and the `routes/live.js:650` quiz-API gate (integration moves it from `LIVE_HOMEWORK` to `QUIZ_STEPS`).

---

## 1. Settings / flags (`server/config.js`, documented in `README.md` and `docs/cs-quest.md`)

| Env var | Default | `config.` field | Effect |
|---|---|---|---|
| `QUIZ_STEPS` | `1` | `config.quizSteps` | Quiz steps on the student lesson page (`GET /class/:cid/lessons/:clid`) and the student quiz APIs `GET/POST /api/progress/:cl/:step/quiz`. `0` = step left off the page, those APIs answer 404 `{ code: 'quizStepsOff' }`. The gradebook still counts the step. |
| `LIVE_HOMEWORK` | `0` | `config.liveHomework` | **Unchanged**: only "Set as homework" on a live results page (and, until integration moves the gate, the older `GET/POST /api/lessons/:cl/steps/:step/quiz` in `routes/live.js`). |
| `CS_QUEST_BUILD_TEAMS_PER_PERIOD` | `8` | `config.csQuestBuildTeamsPerPeriod` | Clamped to 1–60. Read by `builderStatus()` (§8). |

Middleware you can reuse: `import { quizStepsOn } from '../routes/progress.js'` — `(req, res, next)`; 404 JSON
`{ error: t('progress.errors.notFound'), code: 'quizStepsOff' }` when the flag is off.

---

## 2. Schema (migration `0044_cs_quest_steps` in `server/db.js MIGRATIONS`)

Additive and idempotent: each `ALTER TABLE … ADD COLUMN` runs only when `PRAGMA table_info` lacks the column (tested:
running it twice on a pre-CS-Quest schema is a no-op the second time).

| Column | Type | On which steps/rows | Holds |
|---|---|---|---|
| `lesson_steps.options` | `TEXT NOT NULL DEFAULT ''` | `game` steps only (cleared on other kinds) | The Play-link query string in **fixed key order** (§4), e.g. `chapter=loops&band=1b&lock=1`. |
| `lesson_steps.standards` | `TEXT NOT NULL DEFAULT ''` | `game`, `question`, `build` (cleared on `text`/`quiz`) | Comma list of CSTA ids, canonical upper case, de-duplicated, order kept: `1B-AP-10,1B-AP-12`. Max 40 ids. |
| `lesson_steps.template` | `TEXT NOT NULL DEFAULT ''` | `build` only | A Studio template key from `server/builder/catalog.js TEMPLATE_KEYS` (`quiz runner catch memory word duel board island`); the capstone uses `quiz`. |
| `lesson_steps.rubric` | `TEXT NOT NULL DEFAULT ''` | `question`, `build` only | JSON `[{ "line": "Plan", "ids": ["1B-AP-13","1B-AP-11"], "levels": ["d0","d1","d2","d3"] }, …]`. Limits (`L.RUBRIC_LIMITS`): ≤ 8 lines, `line` 1–80 chars, ≤ 8 ids per line (each a real CSTA id), ≤ 4 `levels` of ≤ 200 chars. `ids` and `levels` optional (stored as `[]`). |
| `lesson_steps.items` (existing, quiz steps) | JSON | `quiz` | **Now keeps `cat` (≤ 40 chars) and `secs`** per item: `[{ q, choices, answer, cat?, secs? }]` (`L.quizSnapshot`). |
| `lessons.template_key` | `TEXT NOT NULL DEFAULT ''` | lessons | Catalogue key the library copy came from, e.g. `csq-1b-1.2`. Grammar `^[a-z0-9][a-z0-9._-]{0,59}$` (lower-cased on write); anything else → `templateKey` error. |
| `lessons.template_version` | `INTEGER NOT NULL DEFAULT 0` | lessons | Catalogue version; forced to `0` when `template_key` is empty. |
| `step_progress.marks` (existing) | TEXT | question/build rows | **Reused** for rubric marks: one character per rubric line, `0`–`3` or `-` (not marked), e.g. `'23-1'`. Quiz rows keep their `1/0/-` per item there, as before. |

No new tables. `L.getStep(id)` is `SELECT *` and `L.steps(lessonId)` is `SELECT s.*, …` so every new column is on the
step objects you already get; `progress.lessonProgress()`'s `stepsOf` also selects `rubric` and `standards`.

---

## 3. CSTA loader — `server/standards/csta.js` (reads `server/standards/csta-2017.json`, 44 ids: 21 × 1B, 23 × 2)

```js
import * as CSTA from '../standards/csta.js';
CSTA.LEVELS                 // { '1B': '3-5', '2': '6-8' } (from the file's `levels`)
CSTA.normId(id)             // '1b-ap-10' -> '1B-AP-10' (trim + upper case)
CSTA.isId(id)               // boolean, case-insensitive
CSTA.byId(id)               // { id, level, grades, concept, subconcept, practices, practiceCodes, statement, clarification } | null (frozen)
CSTA.all(level?)            // every standard in file order; all('1B') / all('2') filters
CSTA.ids(level?)            // the ids in file order
CSTA.parseList(text)        // "1B-AP-10, 1b-ap-11 bogus" -> { ids: ['1B-AP-10','1B-AP-11'], bad: ['bogus'] } (splits on commas/whitespace, de-dupes)
```

---

## 4. Lesson parameters — the exact grammar (P1 / P2)

**Teacher-readable URL** (what the student page builds, what a teacher may paste):

```
/play/<slug>?lesson=<classLessonId>&step=<stepId>&chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>
```

- Exactly five param keys exist: `chapter band mode level lock` (`KEYS`). Unknown keys are dropped silently at `/play`.
- Every value must match `^[a-z0-9-]{1,16}$` after trim + lower-case (`VALUE`); `band ∈ {1b, 2}`; `level` is 1–30
  (`MAX_LEVEL`), digits only; `lock ∈ {0, 1}`. A bad value drops that key only.
- `lesson=&step=` are consumed by the play page (gradebook context) and never reach the frame, as before.

**Step column `lesson_steps.options`**: the same query string **without** `lesson/step`, canonicalised by `cleanOptions`
into fixed key order `chapter, band, mode, level, lock`, only the keys present, no leading `?`:
`chapter=loops&band=1b&lock=1`. Writing a step with an unknown key or a bad value is **refused** (`stepOptions`), so a
catalogue typo shows up at materialise time; input may carry a leading `?` and be ≤ 200 chars. Empty → `''`.

**Play link built by the student page** (`routes/progress.js playHref`):
- student: `/play/<slug>?lesson=<cl.id>&step=<s.id>` + (`&` + `options` when non-empty);
- teacher preview (no tracking): `/play/<slug>` + (`?` + `options` when non-empty).

**Signed frame token** field `o` = `"<chapter>.<band>.<mode>.<level>.<lock>"`, empty parts allowed (`loops.1b...1`),
≤ 40 chars (`MAX_PACKED`). Two 16-char ids plus everything else would make 41, so in that one case `mode` is left out.
`/frame/:token` copies it into `window.__BRB_INIT__.params` only when at least one key survives.

**In the game** (`public/sdk/brb-sdk.js`): `BRB.params` is a frozen object with only the keys given —
`chapter`, `band`, `mode` as strings; `level`, `lock` as **numbers** — or `{}`. The SDK re-validates with the same
grammar, so a game never sees anything else. Read it as `const P = (window.BRB && BRB.params) || {};`.

**Module** `server/services/play-params.js`:

```js
export const KEYS = ['chapter','band','mode','level','lock'];  // frozen
export const VALUE = /^[a-z0-9-]{1,16}$/;  BANDS = ['1b','2'];  MAX_LEVEL = 30;  MAX_PACKED = 40;
cleanValue(key, raw)   // one key's clean value (string | number) or undefined
parseParams(query)     // req.query | URLSearchParams | 'a=b&c=d' | {} -> { chapter?, band?, mode?, level?: number, lock?: number }
hasParams(p)           // at least one of the five keys present
packParams(p)          // -> 'chapter.band.mode.level.lock' | '' (the token field)
unpackParams(o)        // token field -> params object; {} for anything malformed, never throws
toQuery(p)             // -> canonical 'chapter=…&band=…' (fixed order) | ''
cleanOptions(text)     // step input -> canonical query string | '' (empty) | null (refuse: unknown key / bad value / > 200 chars)
```

Quest codes (`C B M L`) are the games' business; params win over codes (plan Appendix B). The platform does not parse codes.

---

## 5. Lessons service — new/changed signatures (`server/services/lessons.js`)

```js
export const STEP_KINDS = ['game','build','text','question'];       // unchanged; QUIZ_KIND = 'quiz'
export const STANDARDS_KINDS = ['game','question','build'];
export const RUBRIC_KINDS = ['question','build'];
export const RUBRIC_LIMITS = { lines: 8, line: 80, levels: 4, level: 200, ids: 8 };

cleanLesson(fields = {}, old = {})
  // -> { ok, v: { title, summary, subject, grade, objectives, shared, template_key, template_version } } | { ok:false, code:'lessonTitle'|'templateKey' }
createLesson(u, schoolId, { title, folderId=null, summary='', subject='', grade='', objectives='', templateKey='', templateVersion=0 })
updateLesson(u, lessonId, { title?, summary?, subject?, grade?, objectives?, shared?, templateKey?, templateVersion? })
copyLesson(u, lessonId, { folderId? })
  // copies EVERY step with options, standards, template, rubric; quiz steps keep set_id and get fresh items from the set
  // (when it still exists, is unarchived and complete) else the old snapshot; copies template_key/template_version; sets copied_from.

quizSnapshot(items)    // -> JSON text [{ q, choices, answer, cat?, secs? }]
cleanStandards(input)  // comma string | array -> canonical 'ID,ID' | '' | null (unknown id or > 40 ids)
cleanRubric(input)     // JSON text | array -> canonical JSON text | '' | null (malformed)
rubricOf(step)         // -> [{ line, ids: [], levels: [] }] ([] when none/unreadable)
quizItemsOf(step)      // -> [{ q, choices, answer, cat?, secs? }]

addStep(u, lessonId, { kind, title, body, minutes, gameId, options?, standards?, template?, rubric? })
updateStep(u, stepId, { …same; a field left undefined keeps the old value })
  // kind rules (applied BEFORE validation, so the wrong kind drops silently, the right kind refuses bad values):
  //   options only on game; template only on build; standards only on game|question|build; rubric only on question|build.
  // error codes: stepOptions, stepStandards, stepTemplate (not in TEMPLATE_KEYS), stepRubric (+ the old ones).
  // standards may be given as an array or a comma string; rubric as an array or JSON text.
addQuizStep(u, lessonId, { title='', setId, items, minutes=0, body='' })   // snapshot keeps cat + secs; minutes/body new, optional

export const CADENCES = ['daily','weekdays','weekly','twice-weekly'];
cadenceDates(start, n, cadence='weekdays')
  // start: 'YYYY-MM-DD' | stored day (ms) | '' / null = today (UTC day); -> [ms at 00:00 UTC, …] or null (bad start / cadence)
  // weekdays skips Sat/Sun (and moves a weekend start to Monday); twice-weekly alternates +3 / +4 days.
assignUnitWithCadence(u, classId, lessonIds, { unitId=null, start=null, cadence='weekdays', dueDays=null })
  // -> { ok:true, assigned:[{ lessonId, classLesson, opensAt(ms), dueAt(ms), restored }], skipped:[{ lessonId, code }] }
  //  | { ok:false, code: 'notFound' (class not managed / unit not of this class) | 'badRequest' (0 or > 60 ids) | 'badCadence' | 'badDate' }
  // lesson k opens on cadence day k; due = opens + dueDays, or (no dueDays) the day before lesson k+1 opens, last one opens + 7 days.
  // Only lessons assign() would take get a day (this school's, editable by u, or coming back after removal); others -> skipped notFound,
  // the following lessons keep their dates. Already-assigned -> skipped { code: 'alreadyAssigned' }. Dates are 'YYYY-MM-DD' through assign().
```

`POST /api/classes/:id/assign-unit` does **not** exist yet: it lands in your `routes/cs-quest.js` and should call
`L.assignUnitWithCadence` (the service already enforces `S.canManageClass`).

---

## 6. Progress service — new/changed signatures (`server/services/progress.js`)

```js
export const HOSTED_LIVE = new Set([...Object.values(MODES), 'would-you-rather-live']);
  // = quest-race, question-battle, brain-board, would-you-rather-live, atlas-quest-live (seed games only)
hostedLive(step)       // true for a game step on one of those official games (takes a steps() row or a getStep() row)
// markDone / gameStarted / gameTime (and the /game, /done routes, and /play's lesson context) refuse hosted-live steps: fail('notFound').
// gameScore is unchanged: classlive-results.save still writes the cell with label 'live'.

cleanMarks(marks, lines, existing='')
  // marks: '23-1' | [2,'3',null,1] ; lines = rubric line count; -> stored string, or null when malformed (value ∉ 0-3, or longer than lines)
  // undefined entries / a shorter list keep `existing`; null / '' / '-' un-mark a line.
export const ALSO_MARK_MAX = 60;
review(u, clId, stepId, userId, feedback, { marks, alsoMark = [] } = {})
  // -> { ok:true, marks: '<stored>', alsoMarked: [userIds] } | fail('notFound') | fail('badMarks')
  // question and build steps only. feedback: string replaces (even ''); undefined keeps. marks: undefined keeps.
  // reviewed_at is set when feedback is sent, else only when the row has no unread answer (marks alone never "read" an answer).
  // alsoMark: classmates (role student) get the same marks on this step; a row is created if missing; feedback stays with userId;
  // ignored when every mark is '-' or the step has no rubric. A step without a rubric accepts only "nothing marked".
quizFor(u, clId, stepId)   // unchanged shape: { ok, items:[{ q, choices }], marks } — never answer, never cat
quizAnswer(u, clId, stepId, i, c)  // unchanged: { ok, right, answer, next, score }
```

---

## 7. Routes

### Changed / new in `server/routes/games.js`
| Route | Change |
|---|---|
| `GET /play/:slug` | Reads `chapter band mode level lock` from `req.query` (§4), signs `o` into the token. Lesson context (`?lesson=&step=`) is dropped when the step is hosted-live. |
| `GET /frame/:token` | `init.params` = `unpackParams(tok.o)` when non-empty. |

### Changed / new in `server/routes/progress.js`
| Route | Behaviour |
|---|---|
| `GET /class/:cid/lessons/:clid` (student page) | Game step: Play href = `playHref` (§4). Hosted-live game step: `📡 cs.step.hostedLive` notice, **no Play, no "I played it"** (best live score still shown). Quiz step: rendered only when `config.quizSteps`; its block now points at `/api/progress/:cl/:step/quiz`. Build step: shows teacher feedback once reviewed. Question step: feedback block only when there is an answer and it was read. Teacher "Host live" link: `/live?cl=<clid>&step=<sid>&mode=<liveGameOf(g).mode>` for built-in modes, else `&game=<gameId>`. |
| `GET /class/:cid/progress/:clid` (lesson gradebook) | Marks (`📏 2 · 3 · – · 1`) next to cells and answer cards; the review form grows a rubric (`mark-<i>` radios `- 0 1 2 3` per line, level descriptors as titles) and `👥 Also mark these teammates` checkboxes (`alsoMark`, other students of the class); a panel per build step **with a rubric** listing every student row (started / handed in / marked) with the same form. CSS classes in `public/css/schools.css`: `.st-marks .rubric .rubric-line .rubric-opts .rubric-levels .rubric-also .rubric-mates .sc-hosted`. |
| `POST /api/progress/:clid/:sid/:uid/review` | Body `{ feedback?, marks?: [..] \| '23-1', alsoMark?: id \| [ids] }` **or** form fields `feedback`, `mark-0…mark-n`, `alsoMark` (repeatable). 200 `{ ok, marks, alsoMarked }`; 400 `{ code:'badMarks' }`; 404 as before. |
| `GET /api/progress/:clid/:sid/quiz` | `quizStepsOn` → `{ items:[{ q, choices }], marks }`, `Cache-Control: no-store`. |
| `POST /api/progress/:clid/:sid/quiz` | `quizStepsOn`; body `{ i, c }` (numbers or digit strings) → `{ ok: right, answer, next, score }`; 400 `{ code:'badRequest'\|'answered' }`. |
| `POST /api/progress/:clid/:sid/build` | When `step.template ∈ TEMPLATE_KEYS`: the student's new game gets that template's HTML as version 1 (sanitised + scanned, notes `studio.startedFrom`), `cover`, `players_max`, `tags = key`; otherwise an empty game as before. Still redirects to `/studio/:id?ask=<body.slice(0,300)>`. |
| `POST /api/progress/:clid/:sid/game`, `/done` | 404 on hosted-live steps. |

### Changed in `server/routes/lessons.js`
`POST /api/lessons/:id/steps` and `POST /api/lesson-steps/:id` accept `options`, `standards`, `template`, `rubric`
(same shapes as §5). A refusal answers `400 { error: t('errors.api.badRequest'), code: 'stepOptions'|'stepStandards'|'stepTemplate'|'stepRubric' }`.
The editor form never sends these fields, so editing title/body/minutes in the UI keeps them.

### Unchanged but relevant
`routes/live.js:662-673` (`GET/POST /api/lessons/:clId/steps/:stepId/quiz`) still gated by `LIVE_HOMEWORK` — integration
moves it; the student page no longer uses it. `classlive-sessions.createSession` still binds a live run to a step when
`step.game_id === mode game id`, so the `mode=` Host-live link writes the cell.

---

## 8. Builder status helper (`server/services/builder-status.js`, P18)

```js
import { builderStatus } from '../services/builder-status.js';
builderStatus(now = Date.now())
// -> { on: bool, state: 'on'|'resting', why: null|'noKey'|'daily'|'monthly'|'hard', resetsAt: ms|null,
//      teamsPerPeriod: config.csQuestBuildTeamsPerPeriod, pools: { free: bool, paid: bool } }
```
`on` while the free **or** paid pool is open (a school plan pays into the paid pool). Plan-page line: "Builder: on / resting"
+ "about {n} teams can build this period". No prices. The endpoint on `routes/cs-quest.js` is yours.

---

## 9. Locale keys added (all 13 files, appended at the end as the `cs` block; merge script `scripts/i18n-add-cs-quest.mjs`, re-runnable)

| Key | en |
|---|---|
| `cs.step.hostedLive` | Your teacher hosts this live |
| `cs.review.rubric` | Rubric marks |
| `cs.review.notMarked` | Not marked |
| `cs.review.marksTitle` | Rubric marks: {marks} |
| `cs.review.alsoMark` | Also mark these teammates |
| `cs.review.alsoMarkHint` | They get the same rubric marks on this step. Your written feedback stays with this student. |
| `cs.review.noHandIns` | Nothing handed in yet. |

The script rebuilds `cs.step.*` and `cs.review.*` by key and **keeps any other `cs.*` sub-blocks** you add later (it
merges `j.cs` then re-appends it at the end). Add your own `cs.*` / `js.cs.*` / `school.classTabs.standards` /
`teachers.cs.*` keys with your own script the same way (precedent in this file); do not reuse `cs.step` / `cs.review`.
Error codes added to the API use existing `errors.api.badRequest`; the lesson/progress `progress.errors.*` strings are untouched.

---

## 10. Behaviour notes you should design around

- **Hosted-live steps**: an existing lesson that put Quest Race / Would You Rather Live / Brain Board / Question Battle /
  Atlas Live on a game step for solo practice loses its Play button; the step is completed by hosting it live. For CS Quest
  warm-up steps bound to a live mode this is the intended "Your teacher hosts this live" cell.
- **Rubric marks are not a reading**: marks alone (or copying to teammates) never set `reviewed_at` on a row with an unread
  answer, so your to-review counts and the student's "seen" state are unchanged by bulk marking.
- **Applied-tier evidence** = `step_progress.marks[i]` for rubric line `i` on question/build steps, joined through
  `rubricOf(step)[i].ids`. **Checked** = quiz `marks[i]` × `quizItemsOf(step)[i].cat`. **Practiced** = `status='done'` ×
  `step.standards`. All three are now storable; the Standards tab query is yours (`services/standards.js`).
- `copyLesson` regenerates quiz items from the live set when it is complete; a catalogue "Reset to the CS Quest version"
  (P21) should materialise fresh, then move the assignments, not rely on copy.
- `template_key` is free-form within its grammar; the materialiser decides the key format (`csq-1b-1.2` fits).
- A `question`/`build` step with no rubric still accepts review feedback exactly as before; a `text`/`game` row never does.

## 11. Tests on the branch

- `tests/unit/params.test.js` — grammar, packing/unpacking, SDK `BRB.params`, `/play` → token → `/frame` → `init.params`.
- `tests/unit/cs-quest-platform.test.js` — P3 loader; P2/P3/P10 step fields; P2/P5 student page; P4/P7 snapshots + quiz
  APIs + flag; P8/P9 copies; P10 build template; P11 marks (two tests); P17 cadence; P18 builderStatus; migration idempotence.
- Run: `node --test tests/unit/params.test.js tests/unit/cs-quest-platform.test.js`.

## 12. Gates run on the branch (stage 4, 3 Nov 2026)

- `npm test`: 1389 tests, 1368 pass, 5 fail, 16 skipped. The 5 are `main`'s known failures (class-sharing `/shots` 500,
  `/parents` "How it works", the two three-frame 3D tests) plus `tests/safety/stylelint.test.js` "scan fast" (a 400 ms
  threshold hit under a loaded box; 13/13 pass when the file runs alone). No new failures.
- `npm run i18n:check`: "No problems found" (4328 keys; 11 locales 100%, en-GB holds only its differences).
- `E2E_PORT=3190 npx playwright test tests/e2e/lessons.spec.js tests/e2e/progress.spec.js`: 2 passed.
- `git diff origin/main --name-only` touches no integration-only file (`scripts/seed.js`, scanner tests, `seeds.spec.js`,
  `scripts/covers.js`, `docs/decisions.md`, `docs/status.md`, `server/routes/live.js`); locale diffs add only the `cs.*` block.
