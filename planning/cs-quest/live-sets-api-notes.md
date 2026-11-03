# CS Quest · live-sets (owner B) · hand-off notes for the curriculum owner and integration

Branch `cs-quest/live-sets`, worktree `/home/user/javascript-exercises/.worktrees/live-sets`, 7 commits on top of
`6df73bd` (#147). Merge-base diff touches 68 files, all inside B's contract (`seed-lessons/cs-quest/sets/**`,
`seed-lessons/cs-quest/wyr-tech.json`, `scripts/data/would-you-rather/**`, `scripts/wyr-bank.js`,
`scripts/i18n-add-cs-quest-live.mjs`, `server/live/wyr.js`, `server/routes/live.js`, `server/views/live.js`,
`server/services/classlive-sets.js`, `server/services/classlive-results.js`, `public/js/live-sets.js`,
`seed-games/would-you-rather{,-live}.html`, `seed-games/would-you-rather.json`, the WYR packs under
`public/vendor/data/would-you-rather/v1-pojpfhbb/`, `docs/live-protocol.md` (one row), the 12 locale files (`live.cs`
only), four unit tests). No integration-only file, no foreign locale namespace. `git merge-tree origin/main HEAD`
reports no conflicts with main as of #148.

Note for whoever reads `git diff origin/main --stat` literally: main moved on (#148, the platform slice) after this
branch was cut, so that command also lists main's new files as "deleted" (`server/services/play-params.js`,
`tests/unit/params.test.js`, `docs/cs-quest.md`, `server/standards/csta.js`, `en-GB.json`, ...). They are not changes
of this branch; `git diff $(git merge-base origin/main HEAD) HEAD --stat` is the real list.

---

## 1. The fourteen quiz banks

Files: `seed-lessons/cs-quest/sets/u<unit>-<band>.json`, band `1b` (Explorer, grades 3-5, CSTA level 1B) or `2`
(Pro, grades 6-8, level 2). Format note: `seed-lessons/cs-quest/sets/README.md`. CI: `tests/unit/cs-quest-sets.test.js`.

### 1.1 Bank file

```json
{
  "id": "csq-u1-1b", "program": "cs-quest", "kind": "quiz", "unit": 1, "band": "1B",
  "title": "CSQ Unit 1 · Think Like a Robot (3-5)",
  "modes": ["quest-race", "battle", "board"],
  "cstaTags": ["1B-AP-10", "1B-AP-08", "1B-AP-09", "1B-AP-11", "1B-AP-12"],
  "items": [ ...see 1.2... ]
}
```

| field | rule |
|---|---|
| `id` | `csq-u<1-7>-<1b|2>`, the contract's set id |
| `band` | `"1B"` or `"2"` (the file name uses `1b` / `2`) |
| `title` | the contract's title, <= 80 chars (`classlive-sets.LIMITS.title`) |
| `modes` | the live modes it is written for; the band's warm-up mode comes first (1B `quest-race`, 2 `battle`) |
| `cstaTags` | exactly the set of `cat` values used by its items (the test checks equality) |

### 1.2 Item schema (every item, no optional fields)

```json
{ "id": "1b-1.2-e1", "lesson": "1.2", "use": "exit", "cat": "1B-AP-10", "topic": "Loops",
  "kind": "apply", "secs": 20,
  "q": "Which program moves Bolt 8 squares with the fewest blocks?",
  "choices": ["eight move blocks", "repeat 4 { move }", "repeat 8 { move }", "repeat 7 { move }, move"],
  "answer": 2 }
```

| field | rule |
|---|---|
| `id` | `<band>-<lesson>-e<n>` exit, `<band>-<lesson>-r<n>` review, `<band>-u<unit>-o1` unit opener; band prefix `1b` / `2`; unique program-wide |
| `lesson` | `u.n`; an opener belongs to the unit's first lesson |
| `use` | `exit` / `review` / `opener`, matching the id letter |
| `cat` | exactly one CSTA 2017 id (`server/standards/csta-2017.json`), of the bank's level and a primary id of the item's lesson (the contract's lesson `csta` list) |
| `topic` | the lesson's short name, 3-40 chars, one per lesson (Brain Board column heading in the unit review): Sequences, Loops, Conditionals, Variables, Functions · Debugging, Level design · Sorting data, Predictions, Surveys · Packets, Passphrases, Secret messages · Parts, Troubleshooting, Bits and pixels · Tech changes, For everyone, Share or keep · Plan, Build, Playtest, Credits |
| `kind` | `recall` / `apply` / `analyze` |
| `secs` | 15 (recall) or 20 (apply, analyze); both are in `classlive-sets.SECS` |
| `q` | <= 300 chars, plain text (no markdown, no asterisks: block names are quoted, `the block "turn left"`) |
| `choices` | exactly 4, each <= 120 chars, all different; 3 distractors are real misconceptions of similar length (right answer <= max(1.6 x longest distractor, longest + 8), except the five "which note / message is best" items) |
| `answer` | 0-3; the right slot varies across items |

Text rules the test enforces with the real code: `scanner.scanVersion` must `pass` over every string;
`classlive-sets.cleanItems` (the filter `SETS.createSet` runs) must accept every bank, so a bank can never fail to
materialise on a teacher's account; no 7+ digit runs, no `@`, no links, no "home address"/"what school" phrasing (the
filter reads them as contact info; `1b-7.4-e3` / `2-7.4-e3` say "your birthday and your age"), no three
space-separated groups of digits (`2-5.3-e2` is written `255, 255, 255`), no "code" within a sentence of
grown-up/parent/family words, never "type your password", US spelling (`UK` regex in the test: colour, grey, labelled,
licence, organise, practise, neighbour, recognise, maths, centre, programme, catalogue, ...). Unit-1 items name Robo
Route's blocks as its shelf shows them (`move`, `turn left`, `turn right`, `pick up`, `repeat`, `repeat until goal`,
`if`/`else`, `when`, `path ahead`, `on a gem`, `set`, `change`, `My Block`); the plan's "forward" is never used. In-game
and bank wording keeps "grown-up" where the plan has it; lesson prose should say "trusted adult" (CA-8).

### 1.3 Counts and ids (209 items; the contract says 207 and `csq-u1-1b` 22: the files win)

| bank | n | ids |
|---|---|---|
| csq-u1-1b | 25 | `1b-u1-o1`, `1b-1.1-r1 r2 r3 e1 e2 e3`, `1b-1.2-r1 e1 e2 e3`, `1b-1.3-r1 e1 e2 e3`, `1b-1.4-r1 e1 e2 e3`, `1b-1.5-r1 r2 r3 e1 e2 e3` |
| csq-u1-2 | 21 | `2-u1-o1`, `2-1.1..1.5` each `r1 e1 e2 e3` |
| csq-u2-1b | 11 | `1b-u2-o1`, `1b-2.1-r1 r2 e1 e2 e3`, `1b-2.2-r1 r2 e1 e2 e3` |
| csq-u2-2 | 11 | `2-u2-o1`, `2-2.1-r1 r2 e1 e2 e3`, `2-2.2-r1 r2 e1 e2 e3` |
| csq-u3-1b / csq-u3-2 | 13 / 13 | `<b>-u3-o1`, `<b>-3.1..3.3` each `r1 e1 e2 e3` |
| csq-u4-1b / csq-u4-2 | 13 / 13 | `<b>-u4-o1`, `<b>-4.1..4.3` each `r1 e1 e2 e3` |
| csq-u5-1b | 13 | `1b-u5-o1`, `1b-5.1..5.3` each `r1 e1 e2 e3` |
| csq-u5-2 | 14 | as above plus `2-5.1-r2` (2-CS-01) |
| csq-u6-1b | 14 | `1b-u6-o1`, `1b-6.1..6.3` each `r1 e1 e2 e3`, plus `1b-6.3-r2` (1B-AP-14) |
| csq-u6-2 | 14 | `2-u6-o1`, `2-6.1..6.3` each `r1 e1 e2 e3`, plus `2-6.3-r2` (2-AP-16) |
| csq-u7-1b / csq-u7-2 | 17 / 17 | `<b>-u7-o1`, `<b>-7.1..7.4` each `r1 e1 e2 e3` |

Why 209 and not 207: CA-5(c) named five review items (`1b-1.1-r2` 1B-AP-08, `1b-1.5-r2` 1B-AP-12, `1b-6.3-r2`
1B-AP-14, `2-6.3-r2` 2-AP-16, `2-5.1-r2` 2-CS-01). 1B-AP-08 and 1B-AP-12 had one item each in the plan, so one review
item each still left them at two; `1b-1.1-r3` and `1b-1.5-r3` bring every standard id to >= 3 bank items program-wide
(the test `mastery coverage` asserts that). **The catalogue / coverage test should read item counts from the bank
files, not from `contract-live-sets.json` (`questionCount` 21/22, `criticAdditions.sets`).** Per-standard item counts
are in `tests/unit/cs-quest-sets.test.js` output; the lowest are 1B-AP-08 3, 1B-AP-12 3, 1B-AP-14 3, 2-AP-16 3,
2-CS-01 3, 2-AP-13 4, 2-AP-15 3, 2-AP-18 4, 2-AP-19 5, 1B-IC-20 5.

### 1.4 What the materialiser derives (per lesson, in the teacher's *My sets*)

The banks are data; nothing in them is a live set by itself. `server/services/lesson-templates.js` (curriculum owner)
calls `SETS.createSet(teacher, { title, subject, items, lessonId })` per lesson. Source of truth for composition is the
contract's `lessons[]` (`warmupItems`, `exitItems`, `warmupMode`, `warmupSetId`/`exitTicketSetId`), mirrored in the
test's `LESSONS` table: if a lesson's item lists change in the contract or the lesson JSON, change that table too.

| derived set | items | composition | hosted as |
|---|---|---|---|
| `CSQ 1.2 warm-up · Loops (3-5)` | 5 | `warmupItems`: `prev-e1, prev-e2, own-r1, own-e1, prev-r1`; lesson 1 of a unit: `opener, r1, e1, e2, e3` (a pre-test); **7.2 has none** (and 6.1 has no live warm-up step, CA-9, though its five items exist) | Quest Race (1B) / Question Battle (2); per-item `secs` (15/20) unless the host sets one time for all; shuffle off; or *Show on projector* |
| `CSQ 1.2 exit ticket (3-5)` | 3 | `exitItems` = `own-e1..e3`; keep `cat` | quiz step (`addQuizStep` keeps `cat`+`secs` since #148), or Question Battle 20 s, or a printed half-sheet |
| `CSQ Unit 1 review (3-5)` | all of the bank | every item, **`cat` replaced by `topic`** (so Brain Board's columns read "Loops", not a code); keep bank order (board keeps set order) | Brain Board or Quest Race |

Rules the live platform imposes on those sets: title <= 80, `cat` <= 40 (`topic` fits), <= 100 items (the biggest
bank is 25), items go through `cleanItems` (every bank passes it today), the owner must be staff of a school
(`staffSchool`), and a set is hostable only when every item is complete (`ready`). Copy the item fields the live set
knows: `{ q, choices, answer, secs, cat }`; `id`, `lesson`, `use`, `topic`, `kind` are the bank's own and are not
stored on the live set (keep them in the lesson JSON if the Standards tab needs them).

The `r2`/`r3` review items surface only in the unit review today (no `warmupItems` names them). CA-5(c) says they are
"used by the next lesson's warm-up and the unit review": swapping them into the next lesson's five (for example
`csq-1b-1.2`: `1b-1.1-e1, 1b-1.1-r2, 1b-1.2-r1, 1b-1.2-e1, 1b-1.1-r1`) is the curriculum owner's call in the contract
and lesson JSON; update the test's `LESSONS` table in the same commit.

### 1.5 The "CS Quest" group in the /live set picker (P20)

`server/services/classlive-sets.js`: `CSQ_SUBJECT = 'cs-quest'`, `CSQ_PREFIX = 'CSQ '`,
`isCsQuest(row) = subject === 'cs-quest' || (lesson_id && title.startsWith('CSQ '))`. `listFor(u).mine[].cs` carries
it; `views/live.js` renders those under `<optgroup label="CS Quest" data-csq="1">` (newest first, like *My sets*), after
"My question sets" and before school sets. **Create derived sets with `subject: SETS.CSQ_SUBJECT`** (preferred; the
title prefix + `lessonId` also works). A draft set made from a lesson's question steps (`fromLesson`) is not grouped
unless its title starts with `CSQ `.

### 1.6 Linking a derived set from a lesson step

`/live?mode=quest-race&set=<liveSetId>&cl=<classLessonId>&step=<stepId>` (1B) / `mode=battle` (2); the class comes
from the class lesson; the bound step gets each student's live score. `?set=` selects the set wherever it is grouped.
Unit review: `/live?mode=board&set=<reviewSetId>&class=<classId>`. The host must teach the class; a school admin who
does not gets `notTeacher`.

### 1.7 `cat` on saved runs (P4-live)

`classlive-results.itemRow` keeps `cat` (string, from the loaded items, never from a device) and `secs` on
`live_runs.items[]`, on the summary and on "play the missed questions again" (`missedOf`); `asItem` (the plain item)
drops `cat`. Items without a `cat` save exactly as before (no key). The CSV is unchanged. So a class run of an exit
ticket or warm-up carries one CSTA id per question for the Standards tab; the unit review carries the topic name.

---

## 2. Would You Rather topics `tech` and `online`

### 2.1 Where the dilemmas live

`scripts/data/would-you-rather/en.json` `items[]`: `{ id: 'tech-1', cat: 'tech', a: { text <= 60, tags[] }, b: {...} }`,
ids `tech-1..tech-20` and `online-1..online-10`, appended after `deep-*` (bank total 444). Every one of the 11
translation files (`es fr de it pt nl ru ja zh-Hant ar he`) translates all 30 (no English fallback is used; the test
asserts the texts differ from English). Tags are from `wyr-bank.TAGS`. Text rules (plan §7 + CA-10): a/b <= 60 chars,
no run of 2+ digits (`tech-13` "A 3D printer…" is allowed), no handles, links, brands, names. `wyr-bank.js` now also
fails on an id that does not start with its `cat` and on a missing `cat.<topic>` name in any `ui.json` language.

Topic names: `scripts/data/would-you-rather/ui.json` `<lang>['cat.tech']` / `['cat.online']` in 13 languages (en-GB
reads en): en "Tech choices" / "Online: share or keep".

Lists: `server/live/wyr.js TOPICS` and `scripts/wyr-bank.js CATS` are the same 13 (`..., 'deep', 'tech', 'online'`);
`seed-games/would-you-rather.html` `CONFIG.cats` + `catIcon` (`tech` 🤖, `online` 🌐). Packs rebuilt with
`node scripts/wyr-bank.js`: version `v1-pojpfhbb`, pinned by SRI in both `would-you-rather.html` and
`would-you-rather-live.html`; the old `v1-gcnidmjp` folder is gone. **Integration: `npm run seed` after merging so the
two games pick up the new bank** (seed.js is untouched).

### 2.2 Prompts and CSTA ids: `seed-lessons/cs-quest/wyr-tech.json`

```json
{ "program": "cs-quest", "kind": "wyr", "about": "...",
  "sets": [
    { "id": "wyr-tech", "topic": "tech", "title": "Tech choices", "lesson": "6.1", "band": "both",
      "starter": "wyr:tech:8:20", "blockDayStarter": "wyr:tech:10:20",
      "cstaTags": ["1B-IC-18", "2-IC-20", "2-IC-23", "1B-IC-19", "2-IC-21", "1B-AP-14", "2-AP-16", "1B-NI-05"],
      "items": [ { "id": "tech-1", "a": "A robot that cleans your room", "b": "A robot that cooks your dinner",
                   "prompt": "Who is helped? What would the robot need to sense?", "csta": ["1B-IC-18", "2-IC-20"] }, ... ] },
    { "id": "wyr-online", "topic": "online", "title": "Online: share or keep", "lesson": "6.3", "band": "both",
      "starter": "wyr:online:8:20", "cstaTags": ["2-IC-23", "1B-IC-21", "1B-NI-05", "2-NI-05", "1B-AP-14"], "items": [...] } ],
  "scaffold": { "both": ["Who chose A and why?", "What could go wrong with A? With B?"],
                "2": { "wyr-tech": "Who is helped, who is hurt, what job changes?", "wyr-online": "What is public, what is private, who else could see it?" },
                "defend": "Defend on every other reveal: one student for A, one for B, thirty seconds each.", "note": "..." } }
```

- `items` are exactly the bank's dilemmas of that topic, in bank order; `a`/`b` repeat the bank's English text so the
  printed prompt sheet can show the two choices beside each prompt (the screens never show an id and the eight come
  up in random order); `prompt` is one question (<= 300, ends with `?`), English only; `csta` ids are real and
  `cstaTags` is exactly their union. Every `tech` dilemma carries a 1B id and a 2 id, so any draw of 8 shows both bands.
- Hosting: the lesson step links `/live?starter=wyr:tech:8:20&cl=<clId>&step=<stepId>` (6.1) and
  `/live?starter=wyr:online:8:20&cl=…&step=…` (6.3). Unscored; the reveal is the class split + the all-time split.
  A live WYR session's items carry `wyr: '<dilemma id>'` per question (`server/live/wyr.js wyrItems`), so a results
  page could map a run back to prompts if ever wanted. Dilemmas show in the **host's** locale (session `lang`); the
  prompts are English.
- `online-5` keeps "grown-up" (in-game wording); lesson prose should say "trusted adult".

### 2.3 Starter grammar (`/live?starter=<id>`, P6)

`server/routes/live.js starterPre(id)` → `{ id, kind: 'wyr'|'atlas'|'bank'|'fixed', mode|null, wyr?|atlas?|bank? }`,
or `null` (then the landing shows its usual defaults, no preset note). A literal `+` may arrive as a space (unencoded
link); it is restored. Max 80 chars.

| id | parsed by | preselects |
|---|---|---|
| `wyr:<topic|topic+topic|mix>:<5|8|10|15|20>:<10|15|20|30>` | `WYR.parseId` | mode `wyr`, the topic boxes, count, seconds |
| `bank:<subject|mixed>:<a6|a8|a10|a12>:<5|10|15|20>` | `parseBankId` | set "Question bank", subject, level, count; mode unchanged |
| `bank:board:<level>:<subject>+<subject>[+…]` | `parseBankId` | mode `board`, level, the ticked subjects |
| `atlas:<region>:<level>:<kind+kind>:<count>:<secs>` | `ATL.parseId` | mode `atlas` and its fields |
| `science` / `geo` / `board` / `math-8` / `math-10` / `math-12` | `STARTERS` | set `starter:<id>` (the Starters optgroup appears); mode `board` for `board` |

`?mode=` in the URL wins over the mode a starter implies. When a starter is applied the form shows
`<p class="notice lv-preset" id="lv-preset" data-starter="<id>">` with `live.cs.preset`. `?set=<id>` is unchanged and is
still the way to host a derived set. The same ids are what `POST /api/live/sessions` accepts as `starter` (JSON) or as
the form's `set: 'starter:<id>'`. `public/js/live-sets.js` now posts repeated checkbox names (`wyrTopic`, `bankBoard`,
`atlasKind`) as arrays, like `app.js` does.

---

## 3. Locale keys and translation plumbing

- `live.cs.sets` = "CS Quest" (the optgroup label; the program name is fine for teachers) and `live.cs.preset` =
  "Set up from the lesson plan. You can still change anything." in `en es fr de it pt nl ru ja zh-Hant ar he`
  (`server/i18n/locales/*.json`, appended as the last block of `live`). `en-GB.json` is a sparse override file (163
  keys) and falls back to `en`; nothing here spells differently, so it is untouched (`npm run i18n:check` reports it as
  `·`, not an error).
- Merge script: `node scripts/i18n-add-cs-quest-live.mjs` (idempotent; adds or replaces `live.cs.*`, nothing else).
  Integration runs A's `scripts/i18n-add-cs-quest.mjs` and this one, then `npm run i18n:check`.
- WYR UI words: `scripts/data/would-you-rather/ui.json` only (`cat.tech`, `cat.online` x 13, built into the game by
  `wyr-bank.js`); no locale-file key.
- Everything else B ships is English-only data by contract: bank items, `wyr-tech.json` prompts/scaffold.

---

## 4. Tests and commands

```
node --test tests/unit/cs-quest-sets.test.js         # banks + wyr-tech.json (11 tests; the Robo Route block-name test is skipped until scripts/data/cs-quest/robo-route/en.json is on the same branch)
node --test tests/unit/live-wyr-atlas.test.js        # TOPICS/CATS, counts, 13 names, translations, pack pins, landing
node --test tests/unit/live-pages.test.js            # ?starter= preselects (good and bad ids), the CS Quest optgroup
node --test tests/unit/classlive-results.test.js     # cat/secs on saved runs, itemRow
node scripts/wyr-bank.js                             # rebuild WYR packs after any data change (then npm run seed)
node scripts/i18n-add-cs-quest-live.mjs && npm run i18n:check
```

Gate results for this branch (stage 5) are in section 6.

---

## 5. Requests to other owners (also in the structured report)

1. **Curriculum / gen-contracts.py**: `contract-live-sets.json` counts (`csq-u1-1b.questionCount` 22, totals 202+5)
   are stale: the banks hold 25 / 209 (section 1.3). Read counts from the files, or regenerate the contract with
   `1b-1.1-r3` and `1b-1.5-r3`.
2. **Curriculum**: decide whether the `r2`/`r3` review items join the next lesson's `warmupItems` (CA-5(c) wording);
   if so, update the contract, the lesson JSON and `tests/unit/cs-quest-sets.test.js` `LESSONS` together.
3. **Curriculum**: create derived sets with `subject: SETS.CSQ_SUBJECT` and titles `CSQ <lesson> warm-up · <topic>
   (<grades>)` / `CSQ <lesson> exit ticket (<grades>)` / `CSQ Unit <n> review (<grades>)`; replace `cat` by `topic` in
   the review set only; link WYR steps with `?starter=wyr:tech:8:20` / `wyr:online:8:20` (+ `cl`/`step`).
4. **Integration**: `npm run seed` after merge (new WYR bank in both games, pack `v1-pojpfhbb`); run both i18n merge
   scripts, then `npm run i18n:check`.
5. **Robo Route (C)**: the sets test reads `scripts/data/cs-quest/robo-route/en.json` to confirm the block names used
   in unit-1 items exist in the game's strings (`move`, `turn left`, `turn right`, `pick up`, `repeat`,
   `repeat until goal`, `if`, `else`, `when`, `path ahead`, `on a gem`, `set`, `change`, `My Block`). If the shelf
   labels differ, tell B (or the integration step) which words to use; the test will say which name is missing.

---

## 6. Stage 5 gate results

(filled in below)
