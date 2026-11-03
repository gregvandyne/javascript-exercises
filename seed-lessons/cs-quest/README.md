# CS Quest catalogue

The content of Oomba Academy's computer-science program (grades 3-5 = band **1B**, "Explorer"; grades 6-8 = band **2**,
"Pro"; CSTA K-12 CS Standards 2017). Everything in this folder is data: the lesson materialiser
(`server/services/lesson-templates.js`, curriculum owner) turns a lesson file into an ordinary lesson in a teacher's
library (steps, derived live sets, `template_key`), and the plan page / print view / coverage map render the same files.
Nothing here is served to anyone by itself. Lesson text is English and shows verbatim in every UI language; only the chrome
around it is translated (`cs.*` keys). US spelling throughout.

| File | Owner | What |
|---|---|---|
| `units.json` | A | the index: 7 units, 23 lessons x 2 bands (46 keys and file names), 4 published paths, the period and its 40-minute and block variants, program rules, materials, FAQ lines, derived-set naming |
| `lessons/<unit>.<n>-<1b\|2>.json` | A | one file per lesson per band (`1.2-1b.json`, `1.2-2.json`): the whole plan page and the student-visible steps (schema below) |
| `games.json` | A (generated) | the four games' chapter table: index, id, title, band, levels, CSTA ids, mode; quest codes and game-step standards are checked against it |
| `sets/u<n>-<1b\|2>.json` | **B** | the 14 unit quiz banks (209 items); see `sets/README.md`. On the curriculum branch they are ignored, uncommitted copies: never commit them here |
| `wyr-tech.json` | **B** | the Would You Rather prompts and CSTA ids for lessons 6.1 and 6.3 |
| `printables/` | A (later stage) | kit-free black-on-white HTML sheets named by the lessons (`grid-mat`, `loop-cards`, ...) |

Checked by `node --test tests/unit/cs-quest-catalogue.test.js` (schema, the CI clauses of plan section 9.5 and the critic
additions; coverage clauses run once all 46 lesson files exist, and bank clauses once the sets are present).

## Ids, bands, names

- Lesson key `csq-<1b|2>-<unit>.<n>` (`csq-1b-1.2`); it is also `lessons.template_key` on a teacher's copy, with
  `version` as `template_version`.
- `band` is the CSTA level (`1B` | `2`); `bandCode` is the in-game / params form (`1b` | `2`). In-game the bands are called
  Explorer and Pro; teacher chrome says "Grades 3-5" / "Grades 6-8".
- `title` is the library title `<u.n> · <name>` (<= 100 chars; no program name: students see it, and the "CS Quest" folder already groups the lessons); `name`
  is the plain lesson name; `short` is the lesson's one-or-two-word topic (the bank's `topic`, the Brain Board column, the
  derived warm-up set's name).
- Kids never see a standard code, and never see the program name inside a game. Step titles and bodies (what students
  read) must not contain `CS Quest` or an id like `1B-AP-10`; the plan page and the printed plan may.
- Every CSTA id used anywhere must be one of the 44 ids in `server/standards/csta-2017.json`, of the lesson's band.

## Lesson file schema (`lessons/<unit>.<n>-<band>.json`)

Required unless marked optional. Strings are plain text (no markup, no links); step bodies use blank lines between
paragraphs and `- ` for a short list (the platform renders `<p>` per blank line, `<br>` per newline).

| Field | Type | Rule |
|---|---|---|
| `id`, `key` | string | both `csq-<bandCode>-<n>` |
| `version` | int >= 1 | bump when the lesson changes in a way a teacher should re-add ("Update available") |
| `unit`, `order`, `n` | int 1-7, int 1-23, `"u.n"` | as in `units.json` |
| `band`, `bandCode`, `grade` | `1B`\|`2`, `1b`\|`2`, `Grades 3-5`\|`Grades 6-8` | consistent with each other |
| `title`, `name`, `short` | string | `title` = `<n> · <name>` <= 100 (never "CS Quest": students see it); `short` <= 40 and equal to the bank topic |
| `summary` | string <= 600 | the library summary (`lessons.summary`) |
| `duration` | 45 | always; the 40-minute cut is `shortPeriod40` |
| `csta` | `{ primary[], also[], buildsToward[] }` | `primary` non-empty: taught, exit items tagged, rubric line; `also`: practiced again; `buildsToward`: never counted as evidence |
| `iCan` | string[] (>= 2) | kid-readable, lower-case start; joined into `lessons.objectives` (<= 1000) |
| `questCode` | `"C B M L"` or null | spaces between the digits; `C` = chapter index, `B` = 1 Explorer / 2 Pro, `M` = mode index, `L` = 0; null when the main activity is not a game |
| `params` | string or null | the canonical `lesson_steps.options` string: `chapter=<id>&band=<1b\|2>[&mode=<id>]&lock=1` (`play-params.js cleanOptions` must return it unchanged) |
| `materials` | string[] | this lesson's additions to the program list (`units.json materials`) |
| `doNow` | string | paper-answerable, on the board at 0:00 |
| `plan` | `[[clock, minutes, label] x 6]` | the period table; minutes sum to 45 |
| `warmup` | object or null | `{ setId, items[5], mode (quest-race \| battle), secs 15, projectorOk true, default (projector \| live), why? }`; item ids from the lesson's unit bank: `prev-e1, prev-e2, own-r1, own-e1, prev-r1` (first lesson of a unit: `opener, r1, e1, e2, e3`; 6.2: `opener, 6.1-e1, 6.2-r1, 6.2-e1, 6.1-r1`); null for 6.1 and 7.2 |
| `explore` | object | `{ minutes, do[], say[], ask[], bigIdea, vocab[] (<= 5 on the learn card; 6 where the plan lists 6), demo? {chapter, level}, afterAsk? }`: the projector script, two Say, one or two Do, one Ask, in imperative teacher voice |
| `play` | object | `type` = `game` \| `live` \| `unplugged` \| `builder` \| `discussion`. For `game`: `game` (slug), `chapter`, `chapterTitle`, `mode?`, `then? { chapter, levels: "a-b", stretch?, enrichment? }`, `levels`, `goal`, `stretch`, `pairs?`, `lookFors[]`, `misconception`, `earlyFinishers[]`. For `live`: `starter` (`wyr:tech:8:20`), `prompts` note. For unit 7: the protocol text |
| `discuss` | string[] (>= 1) | turn-and-talk, then whole class; `showMe?` names the projector moment |
| `exit` | object | `{ setId, items[3] (own e1..e3), sentencePrompt, frame, rubric[], paper }`; `rubric` = one line per primary id: `{ line (<= 80), ids [that id], levels [4 descriptors for marks 0-3, each <= 200] }` (platform shape, `lessons.js cleanRubric`) |
| `differentiation` | `{ support[], stretch[] }` | |
| `unpluggedTwin` | `{ title, minutes, materials[], steps[] (>= 2), printables[] }` | the no-device version of Play; printable names are sheet keys |
| `subPlan` | string[3] | three sentences a substitute can run without the projector |
| `shortPeriod40` | `{ table (sums to 40), warmupItems[2], discuss (one prompt), keep }` | the documented 40-minute cut: projector warm-up with 2 items, one Discuss prompt, Play 16, never the exit ticket |
| `block` | optional `{ add[] }` | the 80-90 minute version: lesson + unplugged twin + 3-star stretch |
| `notes` | optional string[] | teacher notes |
| `steps` | array | the student-visible steps, below |

### Steps (what the materialiser creates, in order)

| kind | title | minutes | fields |
|---|---|---|---|
| `text` | `Today` | 17 (6.1: 27) | `body`: Do Now, big idea, the discuss prompts (kid-readable) |
| `game` | `Warm-up (live)` | 5 | `gameSlug` = `quest-race` (1B) / `question-battle` (2), `live: "warmup"`, `playHidden: true`; the platform shows "Your teacher hosts this live" (absent in 6.1 and 7.2) |
| `game` | `Play: <chapter title>` | 18 (6.2 Pro: `Play A` 10 + `Play B` 8) | `gameSlug`, `options` (= `params`), `questCode`, `standards` (a subset of the chapter's ids plus its `then` chapter's, for the band), `body` with goal, stretch and the quest code |
| `game` | `Would You Rather (live)` | 13 (6.1) / 18 (6.3) | `gameSlug: would-you-rather-live`, `live: "wyr"`, `starter`, `playHidden: true` |
| `question` x3 | 7.1 `Who and what`, `Parts and the rule`, `Roles and test plan` (Pro: `Roles, timeline and test plan`) | 6 each | `standards` = the Plan / Plan / Roles rubric-line ids, `rubric` = that capstone line |
| `text` + `build` | 7.2 `Builder etiquette` (replaces the warm-up) + `Build your game` | 5 + 18 | build: `template: "quiz"`, `standards`, `rubric` (Program line, no ids), `body` = the team's Builder message first (first 300 chars = the Studio prefill), then the etiquette card |
| `text` + `question` | 7.3 `Playtest protocol` + `Tally and the one change` | 3 + 15 | question: `standards`, `rubric` (Test with others) |
| `question` | 7.4 `Credits and How-to` (Pro: `Credits, How-to and How it works`) | 18 | `standards`, `rubric` (Explain & credit) |
| `quiz` | `Exit ticket` | 3 | `set: "exit"` (the materialiser snapshots `exit.items` with `cat` kept; with `QUIZ_STEPS=0` it writes a text step "Exit ticket (paper or live)") |
| `question` | `In your own words` | 2 | `standards` (the lesson's primary ids unless CA-2 moved some to the game step), `rubric: "exit"` (= `exit.rubric`), `body` = prompt + frame |

Rules the test enforces: minutes sum to 45; <= 40 steps; titles <= 100; bodies <= 4000; `text`, `question` and
`build` steps have a body; every `standards` list is non-empty valid ids of the band (`lessons.js cleanStandards`);
every rubric passes `cleanRubric`; game steps on a hosted-live game carry no `options`; other game steps carry canonical
`options` that name the lesson's chapter, band and mode with `lock=1`; the quest code matches `games.json`
(chapter index, band digit, mode index, level 0); game-step standards are a subset of the chapter's ids plus the `then`
chapter's; every primary id appears in some step's `standards` (Practiced) and in some rubric line (Applied); warm-up and
exit item ids exist in the unit bank and exit items are the lesson's own `e1..e3` whose `cat` is a primary id.

### Text rules (every string in a lesson file)

US spelling (color, gray, favorite, labeled, practiced, neighbor, recognize, math, center, catalog, program); no 7+ digit
run, no `@`, no `//host.tld`, no `http`, no brand or product names, no real people; lesson text says "trusted adult"
(in-game text keeps "grown-up", never within 40 characters of the word "code"); never "type your password"; the real
game scanner's text rules are run over every string, as the content lint does for the games.

## Derived live sets

Per lesson the materialiser creates, in the teacher's *My sets* (`lesson_id` set, subject `cs-quest`):
`CSQ 1.2 warm-up · Loops (3-5)` (the 5 `warmup.items`, 15 s, shuffle off), `CSQ 1.2 exit ticket (3-5)` (the 3
`exit.items`, `cat` kept) and, once per unit, `CSQ Unit 1 review (3-5)` (the whole bank, `cat` replaced by `topic` so
Brain Board columns read "Loops", never a code).

## Paths

`units.json paths`, in display order: **Core 10 (no Builder)** (default: 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.2, 6.1),
**Full** (23), **CS Ed Week** (1.1, 1.2, 2.1, 4.1, 6.1), **Device-first** (5.2 first). Unit 7 is optional and needs a
school plan: teachers add it with *Add unit*. No prices anywhere.

## Changing the catalogue

Lesson text is data: edit the JSON, bump `version` when a teacher should re-add the lesson, run the test. The chapter
table (`games.json`) and `units.json` come from the program's contract generator; change the generator, not the files.
Bank items and WYR prompts belong to owner B's branch.
