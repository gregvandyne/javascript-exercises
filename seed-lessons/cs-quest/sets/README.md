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
      "choices": ["eight forward blocks", "repeat 4 { forward }", "repeat 8 { forward }", "forward, repeat 7"], "answer": 2 }
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
| `choices` | 4 answers, the right one's slot varies | each <= 120 chars, all different; 3 wrong ones are real misconceptions of similar length |
| `answer` | index of the right choice | 0-3 |

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
`warmupItems` lists are the source of truth for what a derived warm-up contains. `/live?starter=bank:...` hosts the
platform's own bank; derived sets are ordinary teacher sets picked under the "CS Quest" group of the `/live` set picker.

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

209 items: the plan's 202 (section 6.2 / 6.3, verbatim apart from the 13 US-spelling fixes of CA-8), the five review items
the critic named in CA-5 (`1b-1.1-r2` 1B-AP-08, `1b-1.5-r2` 1B-AP-12, `1b-6.3-r2` 1B-AP-14, `2-6.3-r2` 2-AP-16,
`2-5.1-r2` 2-CS-01), and two more (`1b-1.1-r3`, `1b-1.5-r3`) because 1B-AP-08 and 1B-AP-12 each had one item in the plan,
so one review item each still left them below the agreed "at least three bank items per standard id" rule. Two
distractors say the same thing in other words because the live-set filter refuses the plan's wording: "your home address"
(1b-7.4-e3, 2-7.4-e3) reads as contact info and "255 255 255" (2-5.3-e2) as a phone number.
