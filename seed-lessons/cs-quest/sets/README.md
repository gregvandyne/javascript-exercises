# CS Quest quiz banks

Fourteen authored banks, one per unit per band: `u<n>-1b.json` (Explorer, grades 3-5, CSTA level 1B) and `u<n>-2.json`
(Pro, grades 6-8, CSTA level 2). They are the only source of the program's warm-ups, exit tickets and unit reviews. The
lesson materialiser (`server/services/lesson-templates.js`, curriculum owner) reads them; nothing here is a live set by
itself. Items are English only and show verbatim in every UI language (a teacher set is never filtered by language).

Checked by `tests/unit/cs-quest-sets.test.js` (`node --test tests/unit/cs-quest-sets.test.js`).

## File shape

```json
{
  "id": "csq-u1-1b", "program": "cs-quest", "kind": "quiz", "unit": 1, "band": "1B",
  "title": "CSQ Unit 1 · Think Like a Robot (3-5)",
  "modes": ["quest-race", "battle", "board"],
  "cstaTags": ["1B-AP-10", "1B-AP-08", "1B-AP-09", "1B-AP-11", "1B-AP-12"],
  "items": [
    { "id": "1b-1.2-e1", "lesson": "1.2", "use": "exit", "cat": "1B-AP-10", "topic": "Loops", "kind": "apply", "secs": 20,
      "q": "Which program moves Bolt 8 squares with the fewest blocks?",
      "choices": ["eight move blocks", "repeat 4 { move }", "repeat 8 { move }", "repeat 7 { move }, move"], "answer": 2 }
  ]
}
```

| field | meaning | rule |
|---|---|---|
| `id` | `<band>-<lesson>-e<n>` exit item, `<band>-<lesson>-r<n>` review item, `<band>-u<unit>-o1` unit opener; band prefix `1b` or `2` | unique program-wide; lessons reference items by this id |
| `lesson` | `u.n` the item belongs to (an opener belongs to the unit's first lesson) | matches the id |
| `use` | `exit` (e), `review` (r), `opener` (o) | matches the id letter |
| `cat` | exactly one CSTA 2017 id | a real id of the bank's level **and** a primary id of the item's lesson (the contract's `csta` list) |
| `topic` | the lesson's short name, the Brain Board column heading in the unit review ("Loops", never a code) | 3-40 chars, one per lesson |
| `kind` | `recall`, `apply` or `analyze` | |
| `secs` | 15 (recall) or 20 (apply, analyze) | a value of `classlive-sets.SECS`; the host can set one time for all |
| `q` | the question | <= 300 chars |
| `choices` | 4 answers, the right one's slot varies | each <= 120 chars, all different; 3 wrong ones are real misconceptions of similar length: the right answer is at most 1.6x the longest distractor (or 8 chars longer), except the five "which note / message is best" items where the fuller answer is the point |
| `answer` | index of the right choice | 0-3 |
| `why` | one or two plain sentences on why the answer is right, shown after a course quick-check answer | the only field allowed after `answer`; 20-240 chars; every exit item carries one (`tests/unit/course-mission-truth.test.js`), openers and review items need none |

Writing rules the test enforces beyond the schema: one defensible right answer (a sharp student must not be able to refute
the stem; the stem never states the answer); no markdown (quote a block name: `the block "turn left"`, never `*turn left*`,
because the live games render stems as plain text and read them aloud); unit-1 items name Robo Route's blocks as its shelf
shows them (`move`, `turn left`, `turn right`, `pick up`, `repeat`, `repeat until goal`, `if` / `else`, `when`, `path ahead`,
`on a gem`, `set`, `change`, `My Block`; the plan's "forward" is never used), checked against the game's English string
list once both are on main; review and exit items prefer terms the unit has met (unit-1 recall distractors are loop /
event / block / debugging, not packet / cipher / pixel, which only the unit openers, as pre-tests, may use).

Text rules (the test runs the real `scanner.scanVersion` and the live-set filter `classlive-sets.cleanItems` over every
string): plain text, no brands, people, URLs, `@`, 7+ digit runs, phone-shaped numbers (three space-separated groups of
three digits read as one: write `255, 255, 255`), no "home address" / "what school" (the filter reads them as contact
info), never "type your password", no "code" within a sentence of grown-up/parent/family words, US spelling (color, gray,
favorite, labeled, license, practice, neighbor, recognize, math, center).

## What the materialiser derives (per lesson, in the teacher's *My sets*, `lesson_id` set)

| derived set | items | composition | hosted as |
|---|---|---|---|
| `CSQ 1.2 warm-up · Loops (3-5)` | 5 | the ids in the lesson JSON's `warmupItems`: `prev-e1, prev-e2, own-r1, own-e1, prev-r1`; lesson 1 of a unit: `opener, r1, e1, e2, e3` (a pre-test); 7.2 has none | Quest Race (1B) / Question Battle (2), 15 s, shuffle off; or *Show on projector* |
| `CSQ 1.2 exit ticket (3-5)` | 3 | `own-e1..e3` (`exitItems`), `cat` kept so marks carry a standard | quiz step; or Question Battle 20 s; or printed half-sheet |
| `CSQ Unit 1 review (3-5)` | all of the bank | every item, `cat` replaced by `topic` | Brain Board (columns = lessons, tiles easy to hard) or Quest Race |

The `r2`/`r3` review items are extra material for the unit review and for a teacher's own warm-up; the contract's
`warmupItems` lists are the source of truth for what a derived warm-up contains. CA-5(c) says the five critic review items
are "used by the next lesson's warm-up and the unit review", but no lesson's `warmupItems` names them, so today they surface
in the unit review only; swapping them into the next lesson's five (for example `csq-1b-1.2`: `1b-1.1-e1, 1b-1.1-r2,
1b-1.2-r1, 1b-1.2-e1, 1b-1.1-r1`) is the curriculum owner's call, in the contract and the lesson JSON, not here.
`/live?starter=bank:...` hosts the platform's own bank; derived sets are ordinary teacher sets picked under the "CS Quest"
group of the `/live` set picker.

## How the live pieces fit (owner B's platform changes)

- **The "CS Quest" group** (`server/services/classlive-sets.js isCsQuest`): a set is grouped when the materialiser
  creates it with `subject: 'cs-quest'` (`CSQ_SUBJECT`, preferred), or with a `lessonId` and a title that starts with
  `CSQ ` (`CSQ_PREFIX`: `CSQ 1.2 warm-up · Loops (3-5)`, `CSQ Unit 1 review (6-8)`). Newest first, as in *My sets*.
- **`/live?starter=<id>`** (`server/routes/live.js starterPre`) fills the host form from a starter the lesson plan names
  and picks the mode it implies when the URL gives none: `wyr:<topic|topic+topic|mix>:<5|8|10|15|20>:<10|15|20|30>`
  (lesson 6.1 `wyr:tech:8:20`, 6.3 `wyr:online:8:20`), `bank:<subject|mixed>:<a6|a8|a10|a12>:<count>`,
  `bank:board:<level>:<subject>+<subject>`, `atlas:<region>:<level>:<kinds>:<count>:<secs>`, or `science` / `geo` /
  `board` / `math-8` / `math-10` / `math-12`. Unknown ids are ignored. Derived sets are linked with `?set=<id>` as before.
- **Saved runs keep `cat` and `secs`** per question (`classlive-results.itemRow`), so a class run can say which
  standard each question practiced; "play the missed questions again" keeps them too.
- **Would You Rather**: the dilemmas of topics `tech` and `online` live in the game's bank
  (`scripts/data/would-you-rather/`, translated in all 11 languages); `seed-lessons/cs-quest/wyr-tech.json` adds the
  prompt after each reveal and the CSTA ids per dilemma, and repeats each dilemma's English A/B text so the printed prompt
  sheet can show the two choices beside the prompt (the screens never show an id and the eight come in random order);
  `tests/unit/cs-quest-sets.test.js` checks the file against the bank and the CSTA list. Every dilemma of the `tech` set
  carries a grade 3-5 id as well as a grade 6-8 one, so a random draw of 8 always shows both bands' standards.

## Counts

| bank | items | | bank | items |
|---|---|---|---|---|
| u1-1b | 25 (21 + `1b-1.1-r2`, `1b-1.1-r3`, `1b-1.5-r2`, `1b-1.5-r3`) | | u1-2 | 21 |
| u2-1b | 11 | | u2-2 | 11 |
| u3-1b | 13 | | u3-2 | 13 |
| u4-1b | 13 | | u4-2 | 13 |
| u5-1b | 13 | | u5-2 | 14 (13 + `2-5.1-r2`) |
| u6-1b | 14 (13 + `1b-6.3-r2`) | | u6-2 | 14 (13 + `2-6.3-r2`) |
| u7-1b | 17 | | u7-2 | 17 |

209 items: the plan's 202 (section 6.2 / 6.3; ids and standards as in the plan, wording revised by the review round: the
13 US-spelling fixes of CA-8, Robo Route's block names, no asterisks, no giveaway or self-contradicting stems, one
defensible answer per item, distractors that are misconceptions of similar length, no brand names, "trusted adult" in
place of "grown-up"), the five review items the critic named in CA-5 (`1b-1.1-r2` 1B-AP-08, `1b-1.5-r2` 1B-AP-12,
`1b-6.3-r2` 1B-AP-14, `2-6.3-r2` 2-AP-16, `2-5.1-r2` 2-CS-01), and two more (`1b-1.1-r3`, `1b-1.5-r3`) because 1B-AP-08
and 1B-AP-12 each had one item in the plan, so one review item each still left them below the agreed "at least three bank
items per standard id" rule. (The contract's `criticAdditions` still says 22 for `csq-u1-1b` and 202 + 5 overall; the
files and this test say 25 and 209, and a catalogue or coverage test should read the counts from the bank files.) Two
distractors differ from the plan's wording because the live-set filter refuses it: "your home address" (1b-7.4-e3,
2-7.4-e3) reads as contact info and became "your birthday and your age"; "255 255 255" (2-5.3-e2) reads as a phone
number and is written `255, 255, 255`.
