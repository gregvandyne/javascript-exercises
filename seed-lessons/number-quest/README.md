# Number Quest catalog — Phase 0 standards lock

The content registry of Oomba Academy's math course (grades K–8, three tiers on one path:
**Launchpad** K–2 · **Explorer** 3–5 · **Pro** 6–8), set in Netville's Numberworks with
Tally the cat as guide. Spec: `goals/oomba-academy-leading-interactive-educational-app/files/math-course-spec.md` (v2);
build brief in the same folder. This folder follows the Cyber Defenders pattern
(`seed-lessons/cyber-defenders/`): everything here is data; lesson text is English.

**Phase 0 scope (this lock).** Only the standards layer exists so far — no decks, no banks yet.
Decks for Explorer Units 1–4, the placement bank and Fraction Factory are separate Phase 1
deliverables and must cite only what this lock allows. The Phase 2 lock (2026-11-05) extends the
same terms to Explorer Units 5–7 and the Vault of Measures finale; see the Phase 2 section at the
end of this file.

| File | What |
|---|---|
| `standards.json` | the registry: CCSS-M framework facts, the eight Mathematical Practices, every verified grades K–5 cluster heading, the LOCKED statement-level code set for Explorer Units 1–7 + the finale (`explorerCodes`; Units 1–4 locked in Phase 0, Units 5–7 + finale in Phase 2), the grades 6–8 cluster headings flagged DEFERRED (`deferredClusters`), and the corrections this lock makes to the spec's shorthand |
| `units.json` | the catalog slice: Explorer intro 0.1 + Units 1–7 + the Vault finale (23 steps), each step's locked codes as `primary` / `also` / `buildsToward` (the CS Quest idiom), its MP spotlight, its Measure Stone, the game mission named in spec §5.2, and per-unit teacher notes |
| `placement.json` | Tally's Sorting Game strand lock: the four strands, the half-grade rung convention, LOCKED rungs K.0–5.5 at cluster level, DEFERRED rungs 6.0–8.0, and the strand→unit crosswalk with per-unit entry profiles and the soft-landing rule |
| `placement/templates.json` | the placement item bank (spec §4.3): 240 item templates, 60 per strand across rungs K.0–8.0 (3–4 per strand × rung cell). Each template carries strand + `strandLabel` (the `placement.json` strand name), rung, `ccssClusterCode` + cluster heading for locked rungs (`lockStatus: "locked"`, 168 templates), `ccssClusterCode: null` + a DEFERRED orientation heading for rungs 6.0–8.0 (`lockStatus: "deferred-pro-phase"`, 72 templates — authored now, not taggable as coverage until the Pro lock), the misconception its main distractor diagnoses, response type (`pick`/`numeric`/`count-out`/`drag`/`build`), reading load (`none`/`low`/`standard`), `audioFirst`/`launchpadSafe` flags, and a `gen` block of randomised-number constraints |
| `placement/generator.js` | turns a template into one concrete item (seeded, reproducible): pick items get 4 choices — the key plus three misconception-tagged distractors; other response types return the worked key plus distractor misconceptions. The worked answer key is the generator output (`answer`, plus `answerIndex` for pick); items never exist as files |

## Lock rules (enforced by `tests/unit/number-quest-standards-lock.test.js`)

- A code may appear in `units.json` (or later, in a deck, check bank, placement tag or the
  teacher page) **only** if it is in `standards.json` `explorerCodes`. `buildsToward` codes are
  preparation, never coverage, and must be labeled so wherever a teacher sees them.
- Every cluster named in `placement.json` locked rungs exists in `standards.json` `clusters`.
  Deferred rungs name no taggable cluster — their headings live only in `deferredClusters`.
- Explorer 7.3 chance language and all pre-grade-6 chance content is **enrichment, no code**
  (CCSS-M has no probability before grade 6). Money is codable only from grade 2 (`2.MD.C`).
- Three shorthand corrections from the spec are locked in `standards.json` `correctionsToSpec`:
  grade-3 patterns are `3.OA.D.9` (not OA.C); grade-3 addition/subtraction is `3.NBT.A.2`
  (grade 3 has no NBT.B); fraction addition is `4.NF.B.3` + `5.NF.A.1/2` (no grade-3 standard;
  `4.NF.B.4` is multiplication and is never cited for adding slices).

## Deferred locks (do not cite until their phase lands)

- **Explorer Units 5–7 + finale** statement lock (MD.A/B/C, G.A/B, 5.G/5.MD depth) — Phase 3.
  Unit 1–4 steps may seed those clusters only as cluster-level `buildsToward` (e.g. `3.MD.C`).
- ~~**Launchpad tier** statement lock~~ — landed unit by unit (2026-11-12 and 2026-11-13,
  `standards.json` `launchpadCodes`), and the tier opened on 2026-11-13 (see "Launchpad opens" at
  the end of this file). Still owed: a purpose-built K–2 placement item form (the game plays its
  short audio-first form over the locked K.0–2.5 rungs meanwhile).
- **Pro tier** statement lock, placement rungs 6.0–8.0 — Phase 3/4. Bridges stay flagged:
  8.F and 8.NS are builds-toward, 8.SP partial (spec §2.5 notes 7, 9, 10).

## Placement bank rules (enforced by `scripts/number-quest-placement-check.js` + `tests/unit/number-quest-placement.test.js`)

- 240 templates, 60 per strand, no strand × rung cell below 3. The check samples 120 seeds per
  template (28,800 items): prompts render fully, keys are present and unique among choices,
  `answerIndex` points at the key, every distractor carries a misconception tag, and keys for the
  core arithmetic archetypes are independently re-derived from the rendered prompt.
- Every template at rung ≤ 2.5 is `audioFirst`; every rung < 3 template is `launchpadSafe`;
  kindergarten templates have reading load `none` (spec §9). The bank's *form* lock for Launchpad
  (manipulation rendering) is still Phase 2 — the flags mark which templates it will apply to.
- Chance before grade 6 is words only, under data clusters, flagged pre-standard in the template
  cluster text (spec §2.1). Rungs are curriculum-order judgements, not calibrations (spec §4.3).

## Changing the lock

Edit the JSON, run `node --test tests/unit/number-quest-standards-lock.test.js`, and update the
lock table appended to the build brief in the same change. A code's lock status changes only
with a line-by-line check against the published CCSS-M document — never from memory alone.

## Explorer decks A — intro + Units 1–2 (Phase 1, this build)

| File | What |
|---|---|
| `course/explorer/<step>.json` | one slide deck per step for steps 0.1, 1.1–1.3 and 2.1–2.3 (single Explorer band, key `explorer-<step>`): 5–7 slides — story, one worked example opening with a "Rough first" estimate, one flagged skippable Stretch slide, one words slide (four words), mission last. Deck → 3-question check (pass 2 of 3) → mission rhythm, exactly as the other courses |
| `sets/u<unit>-explorer.json` | the check banks for units 0–2: item ids `nq-explorer-<step>-e<1..3>`, each item's `cat` is one of the step's LOCKED primary codes from `units.json` (the intro's items are `cat: "framing"` — a routing preview, never assessed coverage), and every choice carries a `misconceptions` tag naming what that distractor diagnoses (the key's tag is `"correct"`). Since 2026-11-10 every item in the unit 0 to 4 banks also carries a `why`, so a miss teaches the path to the answer |

Missions wire to the honest reuse carriers named in `units.json`: Brain Board banks
"Place Value" (1.1) and "Bar Model Problems" (2.3), Sum Racer tracks (1.2 rounding,
2.1 addition, 2.2 subtraction), Quest Race bank "Patterns" (1.3). Jumble beats: heard
before seen in 0.1, the swapped tile in 1.3, "added when the story said difference" in 2.3.
Guarded by `tests/unit/number-quest-decks-a.test.js`.

**Media:** per the house rule (characters are extracted from their own games, never
redrawn), Tally's sprite was extracted from Fraction Factory
(`public/img/csq/chars/tally.webp`, master `scripts/csq-masters/chars/tally.png`) and
appears on the course path, the placement Sorting Game and the passed-check state —
never inside these decks' slides. The decks themselves carry **no `img`**: no
screenshot of these steps' games teaches the math, so the CPA pictorial step is a
**drawn diagram** (`slide.visual`: place-value cards, a number line, a bar model, a
tile strip — the lesson's own numbers, rendered by `server/views/courses.js`) with
**guided focus** (`slide.focus`, 2–3 steps) over it. Focus boxes are verified on
rendered screenshots at phone width 390×844 (reduced-motion static mode shows every
box at once).

## Explorer decks C — Units 5–7 + the Vault finale (Phase 2, this build)

| File | What |
|---|---|
| `course/explorer/<step>.json` | one slide deck per step for steps 5.1–5.3, 6.1–6.3, 7.1–7.3 and the finale 7.4, in the Phase 1 idiom: story, one "Rough first" worked example, one flagged Stretch slide, one words slide (four words), mission last, drawn diagrams with guided focus, no `img` |
| `sets/u<unit>-explorer.json` | the check banks for units 5–7 (unit 7's bank also carries the finale's three items): ids `nq-explorer-<step>-e<1..3>`, `cat` one of the step's LOCKED primary codes (7.3's items are `cat: "enrichment"` — chance has no CCSS home before grade 6, flagged in the lock, the catalog and the teacher map), every choice misconception-tagged, and every item carrying a `why` so a miss teaches the path to the answer |

Missions wire to the carriers named in `units.json`: Brain Board boards "Measures" (5.1),
"Money" (5.3), "Around & Inside" (6.2) and "Lines & Grids" (6.3) — item generators in
`seed-games/brain-board.html` keyed by the step's mode, in the 1.1/2.3 pattern; Quest Race
"Timetables" (5.2) and the finale's "Vault Run" (7.4, a sequenced mixed mission: eight
questions, one lock per workshop, standing in for the Vault game until it ships); Data
Detective "Chart It" (7.1) and "My Data" (7.2), borrowed from CS Quest untouched; Quest Race
"Chance" (7.3, eight questions judged from a share of equal parts: spinners, bags, prize
wheels). Step 6.1 plays Brain Board's "Shape Hunt" board (sides, square corners,
quadrilaterals, families, turns) until Builder's Yard ships, and keeps its classroom
shape-hunt TALK. Unit 2's missions race on Sum Racer's Trading Post track (level 10): 3- and
4-digit adding (2.1) or taking away (2.2), every question with at least one trade. Jumble
beats: misreads $2.05 at the till (5.3), swaps a grid address (6.3), calls a one-in-six
chance impossible (7.3) — and is found inside the Vault in 7.4, relabeling measures it could
not read, and hired as counter-in-training. Guarded by
`tests/unit/number-quest-decks-c.test.js` and `tests/unit/number-quest-guided-focus.test.js`.

**Placement.** The Phase 2 lock adds entry profiles for 5.1, 6.1 and 7.1 to
`placement.json`'s crosswalk (monotone with Units 1–4, per-strand); the crosswalk now walks
all seven units and lands a run that meets every profile on the finale door (explorer-7.4).
The placement bank already sampled the new units' clusters at rungs 3.0–5.5 (Shape & Measure:
measurement, area/perimeter, conversions, geometry, coordinates; Data & Chance: scaled
graphs and line plots), so no template extension was needed; the validator still reports
zero errors.

**Focus.** The new decks' guided-focus boxes were authored to the measured standard of
Cyber's PR #181: each box equals its target element's measured bounds in the drawn diagram
(the renderer's outset supplies the breathing room), verified on rendered pages at
390/834/1280, and pinned in the registry in `tests/unit/number-quest-guided-focus.test.js`.

## Tiers: one path, three streets (the authoring contract)

The engine reads the tiers from the data (`server/services/number-quest-tiers.js`); nothing in the
code names a tier's units. A tier is `launchpad` (K-2), `explorer` (3-5) or `pro` (6-8): the band
value in `course_progress.band` / `course_bands`, and the prefix of every step key,
`<tier>-<unit>.<step>` (`launchpad-1.1`, `explorer-3.2`, `pro-2.1`).

**To add a unit to a tier**

1. `units.json` `units[]`: one object `{ tier, n, title, group, emoji, stamp, tool, teacherNotes: [...], steps: [...] }`.
   `n` is the unit number inside its tier (it may repeat across tiers; a unit is tier + n); `group`
   is the unit's anchor id on the street (`unit-<n>`); `stamp` is its stone or `null`.
   Each step: `{ n: "<unit>.<step>", order, mp: "MP1".."MP8", titles: { <tier>: ... }, shorts: { <tier>: ... },
   game: { <tier>: null | { slug, chapter, chapterTitle, params } }, standards: { <tier>: { primary: [], also: [],
   buildsToward: [], flag: "coverage" | "framing" | "enrichment", primaryNote? } } }`. Every tier-keyed
   field uses the unit's own tier. `order` starts at 1 in each tier and runs through that tier's steps.
2. The tier's line in `units.json` `tiers.<tier>`: `{ district, grades, inGame, stones: [], status }`,
   plus `finale: "<unit>.<step>"` when the tier ends on a finale door (Explorer: `"7.4"`).
3. The deck: `course/<tier>/<unit>.<step>.json` with `key: "<tier>-<n>"`, `n`, `band: "<tier>"`,
   `title` (= `titles.<tier>`), `topic` (= `shorts.<tier>`), `minutes`, `slides`, `check`, `game`
   (the same slug/chapter/params as units.json, or `null`) and `talk` (required when there is no game).
4. The bank: `sets/u<unit>-<tier>.json` with `id: "nq-u<unit>-<tier>"`, `unit`, and three items a step,
   ids `nq-<tier>-<unit>.<step>-e1..e3`, each `{ id, lesson: "<unit>.<step>", use: "exit", cat, topic, kind,
   secs, q, choices (4), answer, misconceptions (4, the key tagged "correct"), why }`. `cat` is one of the
   step's own primary codes (or `framing` / `enrichment` for a step flagged so).
5. Codes: a tier's steps may cite only codes in `standards.json` `<tier>Codes.codes`
   (`explorerCodes`, `launchpadCodes`, later `proCodes`), each in a cluster named in `clusters`.

**Launchpad limits** (ages 5-7, audio-first; `tests/unit/number-quest-launchpad-decks.test.js` holds every
file in `course/launchpad/` to them): slide title 3-40 chars, text 8-160 chars, at most 2 sentences of at
most 12 words; 5-7 slides; exactly one example slide (2-6 chips of at most 40 chars), exactly one words
slide with exactly 3 words (each meaning 6-80 chars, at most 12 words), the mission last; a diagram
carries 1-4 focus steps with cues of at most 12 words; exit `q` at most 90 chars, 4 distinct choices of at
most 24 chars, `why` 20-160 chars; deck `minutes` 3-8.

**Opening a tier.** Launchpad has been `"open"` since 2026-11-13; Pro has no units yet. `tiers.<tier>.status` is `"building"` or `"open"`. While building, the tier's steps,
band, street and teacher-page rows exist for the platform admin only; for everyone else the tier does not
exist. Set it to `"open"` and the street switcher, the band card, the teacher page and placement all pick
it up. A tier with no units does not exist at all, whatever its status.

**Placement.** `placement.json` `crosswalk.entryProfiles` is keyed by a unit's door,
`"<tier>-<unit>.1"`: `{ "Number": rung, "Algebra & Patterns": rung, "Shape & Measure": rung, "Data & Chance": rung }`.
A learner with any rung under 2.5 walks the Launchpad profiles (locked 2026-11-13, one per unit; under the
first profile: the tier's first step; else the first unit whose profile is not met; all met: the Explorer
welcome). A profile that is met moves the walk past its unit, exactly as on the Explorer street. Pro's profiles (`pro-<unit>.1`) continue the walk after Explorer's seven once Pro is open.
The same profiles drive each unit's test-out.

**Game lesson modes.** Brain Board and Quest Race read the step from `mode`: `nq-<unit>-<step>` is the
Explorer tier (unchanged), `nql-<unit>-<step>` Launchpad, `nqp-<unit>-<step>` Pro. A game opens a lesson
board only for a step key in its own known list (the array passed to the `NQ_STEP` decoder in the game's
HTML) with a matching `if (NQ_STEP === '<tier>-<n>')` generator; any other mode opens the normal game.

## Launchpad Unit 1 — The Counting Patch (2026-11-12, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/1.1.json`, `1.2.json`, `1.3.json` | the three kindergarten decks, inside the Launchpad limits above: **1.1 Count to 20** (K.CC.A.1, K.CC.B.4; also K.CC.B.5), **1.2 More, fewer, the same** (K.CC.C.6, K.CC.C.7), **1.3 Teen numbers** (K.NBT.A.1). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u1-launchpad.json` | nine exit items (`nq-launchpad-1.<s>-e1..3`), each `cat` one of its step's primary codes, every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why` |
| `standards.json` `launchpadCodes.codes` | the six locked statements, with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/garden-count.html` | **Garden Count**, the unit's game (Oomba3D 1.1.0, Medieval Village theme): chapter `count` for 1.1, `compare` for 1.2, `teens` for 1.3, six rounds each. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**Diagrams.** The unit adds one drawn diagram type, `counters` (`server/services/diagrams.js`, `server/views/nq-diagrams.js`):
`{ type: "counters", label, groups: [{ n, name?, tone?, count?, frame? }] }`. One group of 1-20 draws rows of ten (`count: true`
writes 1, 2, 3... on the counters); two groups of 1-10 draw two rows matched one to one with a dashed line a pair; `frame: true`
draws a ten-frame with the ones past ten beside it and "10" and the rest named under them. 1.2's number comparison uses the
existing `numberline`. All 25 focus steps are measured and pinned in `tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/garden-count/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/garden-count.recipe.js`.

**Stone.** The unit's stamp is the Counting Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"last number says how many" misconception, and how the game checks each idea by doing. Launchpad stays `status: "building"`.

## Launchpad Unit 2 — The Joining Pond (2026-11-12, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/2.1.json`, `2.2.json`, `2.3.json` | the three decks, inside the Launchpad limits above: **2.1 Put together to 10** (K.OA.A.1, K.OA.A.2), **2.2 Take apart and make 10** (K.OA.A.3, K.OA.A.4), **2.3 Add and take away to 20** (1.OA.C.6; also 1.OA.B.3). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u2-launchpad.json` | nine exit items (`nq-launchpad-2.<s>-e1..3`), each `cat` one of its step's primary codes (2.3's three are all 1.OA.C.6; its turn-around item practises 1.OA.B.3 under that code), every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why` |
| `standards.json` `launchpadCodes.codes` | six more locked statements (twelve in all), with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/lily-hop.html` | **Lily Hop**, the unit's game (Oomba3D 1.1.0, Sky Islands theme 1.0.1 with the sea): chapter `join` for 2.1, `apart` for 2.2, `twenty` for 2.3, six rounds each, every round answered by hopping to one of three number pads. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `join`: four rounds of two groups of frogs put together (totals to 10, "3 and 2 make 5"), then two rounds where some
hop away ("5 take away 2 is 3"), because K.OA.A.2 adds and subtracts within 10. `apart`: rounds 1 and 2 split the same number two different
ways ("5 is 2 and what?"), round 3 a bigger number, rounds 4-6 a ten-frame of spots ("7 and what make 10?"). `twenty`: a row of numbered pads
with a flag on 10: ten and some more, add over ten, the same two numbers turned round (1.OA.B.3), take away inside the teens, take away back
over ten, add over ten again; over ten the helper stops on 10 and the sum is said in two steps.

**Diagrams.** The unit adds no diagram type. `counters` gains two options for a single group of 2-10 (`server/services/diagrams.js`,
`server/views/nq-diagrams.js`): `split: k` draws the first k counters, a gap, then the rest in the next tone with each part's size under it
(5 is 3 and 2), and in a ten-frame only changes the tone after the first part (8 and 2 make 10); `away: true` (with `split`, no frame) draws
the second part as dashed outlines (they went away). 2.3 uses the existing `numberline` with `hops` (8 to 10, then 10 to 13) and `bars` (8
and 5, then 5 and 8, the same length). All 27 focus steps are measured and pinned in `tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/lily-hop/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/lily-hop.recipe.js`.

**Stone.** The unit's stamp is the Joining Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"counts all again from 1" misconception (and hopping past ten without stopping), and how the game checks each idea by doing. Launchpad stays
`status: "building"`.

## Launchpad Unit 3 — The Tens Trellis (2026-11-13, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/3.1.json`, `3.2.json`, `3.3.json` | the three grade 1 decks, inside the Launchpad limits above: **3.1 Tens and ones** (1.NBT.B.2; also 1.NBT.A.1), **3.2 Which is greater?** (1.NBT.B.3), **3.3 Add tens, add ones** (1.NBT.C.4, 1.NBT.C.5). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u3-launchpad.json` | nine exit items (`nq-launchpad-3.<s>-e1..3`), each `cat` one of its step's primary codes (3.3: two for 1.NBT.C.4, one for 1.NBT.C.5), every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why` |
| `standards.json` `launchpadCodes.codes` | five more locked statements (seventeen in all), with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/crate-stacker.html` | **Crate Stacker**, the unit's game (Oomba3D 1.1.0, Toy Town theme 1.1.0): chapter `build` for 3.1, `greater` for 3.2, `add` for 3.3, six rounds each. A crate is a one and a tower of ten crates is a ten. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `build`: three rounds of loading a number with "Add a ten", "Add a one", "Take one off" and "Go" (a teen, a
number to 49, then a number to 99 asked as "5 tens and 3 ones" with the numeral hidden until Go; ten loose crates snap into a tower by
themselves), then three rounds of reading a load: the digits swapped (34 or 43), no loose crates (40, not 4), and ten towers and a few
crates (101-109, the unit's look past 100 for 1.NBT.A.1). `greater`: "Which truck has more?" with different tens, the same tens, then
numerals only with the digits swapped; then the sign for two numbers (>, = or <), one round each of different tens, the same number and
the same tens, the last with numerals only. `add`: a number and 20-40 more, ten more, ones more inside the ten, ones more that fill a
tower first ("15 and 5 make 20", "3 more makes 23"), ten less, and the tower-filling round again with bigger numbers; totals stay under 100.

**Diagrams.** The unit adds no diagram type. `counters` gains one option (`server/services/diagrams.js`, `server/views/nq-diagrams.js`):
`tens: true` on a group of 10-99 draws the number as sticks of ten and loose ones. One number sits in the middle with "3 tens" and
"4 ones" under its parts; two numbers sit side by side, each with its numeral under it (34 and 43, 52 and 38, 27 and 30). 3.1's example
uses the existing `places` chart, 3.2 and 3.3 the existing `numberline` (with `hops` for ten more, ten less and filling a ten). All 27
focus steps are measured and pinned in `tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/crate-stacker/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/crate-stacker.recipe.js`.

**Stone.** The unit's stamp is the Tens Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"two digits are two small numbers" misconception (34 and 43 look the same; 38 looks greater than 52), and how the game checks each idea
by doing. Launchpad stays `status: "building"`.

## Launchpad Unit 4 — The Balance Bridge (2026-11-13, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/4.1.json`, `4.2.json`, `4.3.json` | the three grade 1-2 decks, inside the Launchpad limits above: **4.1 Equals means the same as** (1.OA.D.7, 1.OA.D.8), **4.2 Story problems** (1.OA.A.1, 2.OA.A.1), **4.3 Equal groups, odd and even** (2.OA.C.3, 2.OA.C.4). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u4-launchpad.json` | nine exit items (`nq-launchpad-4.<s>-e1..3`), each `cat` one of its step's primary codes (4.1: two for 1.OA.D.7, one for 1.OA.D.8; 4.2: two for 1.OA.A.1, one two-step item for 2.OA.A.1; 4.3: two for 2.OA.C.3, one for 2.OA.C.4), every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why` |
| `standards.json` `launchpadCodes.codes` | six more locked statements (twenty-three in all), with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/balance-bridge.html` | **Balance Bridge**, the unit's game (Oomba3D 1.1.0, Castle Quest theme 1.1.0): chapter `equal` for 4.1, `story` for 4.2, `groups` for 4.3, six rounds each. A see-saw drawbridge over the castle moat with stone blocks on each side: when both sides weigh the same the bridge goes level and the helper walks across. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `equal`: three rounds of True or Not true with posts holding the bridge level until the answer (a sum and its
total, 5 + 2 = 7; a number and a number, 6 = 6, or on a replay a taking away with the sign first, 7 = 8 − 1; a sum on each side,
4 + 1 = 5 + 2), at least one true and one not true every time; then three rounds of the missing number (8 + ? = 11, 5 = ? − 3, 6 + 6 = ?,
or on a replay 8 + 4 = ? + 5). `story`: spoken stories about stones that the blocks act out: add to, take from (the blocks roll off into the
moat and leave ghosts), put together with one part to find, compare (how many more to match), all within 20; then how many more are needed
within 100 (a slab marked 10 is a ten) and a two-step story within 100. `groups`: two rounds of odd or even, the blocks shared one to each
side (an even number balances, an odd number leaves one over), two rounds of an even number as a double (10 = ? + ?), and two rounds of
rows of blocks added as equal addends (3 rows of 4 is 4 + 4 + 4), up to 5 by 5. A wrong number is tried on the bridge: its blocks drop
in, the bridge shows too light or too heavy, and they go again with a spoken hint.

**Physics.** The bridge is a Rapier rigid body (Oomba3D's `g.physics()`, Rapier 0.21.0) on a hinge with stops and a spring; landing blocks
push it. Which side is heavier comes from the game's own sums, and the game lays the blocks out in stacks of five so they can always be
counted. Where Rapier cannot start the game's own spring turns the bridge instead (`state().physics`).

**Diagrams.** The unit adds no diagram type. `counters` gains one option (`server/services/diagrams.js`, `server/views/nq-diagrams.js`):
`balance: true` on the diagram sets two groups of 1-20 on the two sides of a see-saw beam, level when they are the same and leaning to the
heavier side when not, with each side as it is written under it and "=" (or a crossed "≠") between them. A side may be `split` into two
parts (5 + 2), and `hide: true` (with `split`) draws its second part as a box marked "?" that weighs nothing yet (8 + ?). 4.2 also uses
the existing `numberline` (a hop back from 13 to 9) and matched rows (9 is 3 more than 6); 4.3 uses matched rows as pairs (8 is 4 and 4;
7 leaves one over) and the existing `array` (3 rows of 4). All 28 focus steps are measured and pinned in
`tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/balance-bridge/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/balance-bridge.recipe.js`. The
picture scripts now serve `.mjs` files as JavaScript, as the site does, so Rapier loads in the photographs too.

**Stone.** The unit's stamp is the Balance Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"equals means the answer comes next" misconception (8 + 4 = ? + 5 gets 12; 5 = 2 + 3 looks backwards), and how the game checks each idea
by doing. Launchpad stays `status: "building"`.

## Launchpad Unit 5 — The Hundreds Hedge (2026-11-13, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/5.1.json`, `5.2.json`, `5.3.json` | the three grade 2 decks, inside the Launchpad limits above: **5.1 Hundreds, tens and ones** (2.NBT.A.1, 2.NBT.A.3), **5.2 Skip counting and comparing** (2.NBT.A.2, 2.NBT.A.4), **5.3 Add and subtract to 100** (2.NBT.B.5; also 2.OA.B.2). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u5-launchpad.json` | nine exit items (`nq-launchpad-5.<s>-e1..3`), each `cat` one of its step's primary codes (5.1: two for 2.NBT.A.1, one for 2.NBT.A.3; 5.2: one for 2.NBT.A.2, two for 2.NBT.A.4; 5.3: three for 2.NBT.B.5), every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why`. A choice is a number, a sign or a few words, never a sum that is not true |
| `standards.json` `launchpadCodes.codes` | six more locked statements (twenty-nine in all), with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/rocket-supply.html` | **Rocket Supply**, the unit's game (Oomba3D 1.1.0, Space Base theme 1.0.0): chapter `build` for 5.1, `count` for 5.2, `fuel` for 5.3, six rounds each. A launch pad on a space base: a flat pallet is a hundred, a rack is a ten, a canister is a one, and when the load is right the rocket lifts off. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `build`: load a three-digit number a pallet, a rack or a canister at a time (ten canisters lock into a rack and
ten racks into a pallet; the chip shows the load so far in expanded form), load 110 to 140 with racks only, read a load with an empty
place (407, with 47 and 470 offered), read a load of three different digits, find a number from its parts (300 + 40 + 2) and from its
name, heard and written in words. `count`: what comes next along the fuel gauge, counting by fives, by tens and by hundreds (on a replay
from a number that is not round: 234, 244, 254), then the sign between two three-digit numbers: >, = or <, with the reason said (the
hundreds differ, the same digits in another order, the same hundreds and tens; a replay brings the same number twice). `fuel`: a quick
adding fact past ten, two two-digit numbers whose ones make a new ten (38 + 17), taking away where a ten must be opened (67 − 19), a
quick taking-away fact, and one more of each; the numbers stand as racks and canisters, and the work is shown on the pad (ten ones
lock into a new rack; a rack opens into ten canisters, and what is taken away stays as outlines). A wrong answer shows why on the pad:
how many stand in each place, the hop between two marks, the place that decides, or the sum's work.

**Diagrams.** The unit adds no diagram type. `counters` gains one option (`server/services/diagrams.js`, `server/views/nq-diagrams.js`):
`hundreds: true` on a single group draws a number from 100 to 999 as flats of a hundred (ten by ten, one over the next so each can be
counted), sticks of ten and loose ones, each place named under it ("4 hundreds", "0 tens", "7 ones"); a place that holds nothing keeps
its room, empty. 5.1 also uses the existing `places` chart (342 as 300, 40 and 2); 5.2 uses the existing `numberline` (hops of five and
of ten, and two numbers to compare); 5.3 uses `tens` (38 and 27 side by side, 65, 62) and a `numberline` (8 + 2 + 5). All 29 focus steps
are measured and pinned in `tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/rocket-supply/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/rocket-supply.recipe.js`.

**Stone.** The unit's stamp is the Hundreds Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"write each part in full" misconception (4 hundreds and 7 ones written 4007 or 47; 38 + 27 written 515), and how the game checks each
idea by doing. Launchpad stays `status: "building"`.

## Launchpad Unit 6 — The Shape Shed (2026-11-13, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/6.1.json`, `6.2.json`, `6.3.json` | the three kindergarten to grade 2 decks, inside the Launchpad limits above: **6.1 Name that shape** (K.G.A.2, 1.G.A.1), **6.2 Build with shapes** (K.G.B.6, 1.G.A.2), **6.3 Halves and fourths** (1.G.A.3, 2.G.A.3). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `sets/u6-launchpad.json` | nine exit items (`nq-launchpad-6.<s>-e1..3`), each `cat` one of its step's primary codes (6.1: two for K.G.A.2, one for 1.G.A.1; 6.2: one for K.G.B.6, two for 1.G.A.2; 6.3: two for 1.G.A.3, one about thirds for 2.G.A.3), every distractor tagged with a misconception that starts with a past-tense verb, every item with a `why` |
| `standards.json` `launchpadCodes.codes` | six more locked statements, with the published statement text (the same text as `server/standards/ccss-math.json`) |
| `seed-games/shape-hunt.html` | **Shape Hunt**, the unit's game (Oomba3D 1.1.0, Cosy Home theme 1.0.0): chapter `find` for 6.1, `build` for 6.2, `share` for 6.3, six rounds each. A tidy-up treasure hunt in a cosy house: shapes hide among the furniture, and the helper finds them, builds with them and shares them. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `find`: four shapes on the shelves and the table, one to tap: a shape by name (a triangle; a turned square, or on a
replay a thin or upside-down triangle, a rectangle standing tall, a turned hexagon; then a solid: cube, cone, cylinder or sphere), a shape by
what defines it ("the shape with 3 sides", "the shape with no corners"; on a replay 4 equal sides, 6 sides, the solid with a point), and
"Which one is not a triangle?" (three triangles and a look-alike that is open or has a curved side). Colors and sizes are dealt out by
chance, never the clue. `build`: a ghost outline on a board (a square of two triangles, a rectangle of two squares, a house of a square and
a triangle, a hexagon of two trapezoids, then of six triangles; on a replay a circle of two half circles) or a ghost tower on the table
(a cube and a cone; on a replay a cylinder and a cone), and three sets of pieces to pick from; the right pieces fly in and snap, a wrong
set is tried on the outline and goes again. `share`: are the shares equal (a cut off to one side on the first lap), tap the one cut in
halves, tap the one cut in fourths, what one share is called (a third on the first lap; a fourth is "a quarter" on odd laps), how many
halves make one whole, and which is bigger, a half or a fourth of the same pizza. A wrong pick gets a spoken hint that names the
attribute ("That one has 4 equal sides. A triangle has 3 sides.").

**Face on.** Flat shapes, the board and the things to share are pictures on cards that always face the player, so the room's perspective
never turns a square into another shape; solids are real 3D shapes. A shape in the room is tapped through a clear button that sits exactly
over it (so Tab, Enter and Space work too); the test holds each to at least 44 px, in full view of the camera and clear of the helper.

**Diagrams.** The unit adds no diagram type, and two options. The existing `shapes` type (`server/services/courses.js`,
`server/views/courses.js`) gains `look` on an item (a triangle `flip`, `thin` or `right`; a square `turned`) and `made` (a square of 2
triangles, a rectangle of 2 squares, a hexagon of 2 trapezoids or 6 triangles: the lines inside are drawn). The existing `spinner` gains
`pie: true` (`server/services/diagrams.js`, `server/views/nq-diagrams.js`): the same circle cut in equal shares with no pointer and its
shaded shares green. 6.1 also uses the existing shape strip (`tiles`), 6.3 the existing `fraction` bars (halves, thirds, fourths) and
`bars` (two shares that are not equal over two that are). All 30 focus steps are measured and pinned in
`tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The three mission slides carry `nq/shape-hunt/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/shape-hunt.recipe.js`.

**Stone.** The unit's stamp is the Shape Seed (`tiers.launchpad.stones`). **Teacher notes** (three) say what the unit covers, the
"one picture of each shape" misconception (an upside-down triangle is "not a triangle"; any two pieces are "halves"), and how the game
checks each idea by doing. Launchpad stays `status: "building"`.

## Launchpad Unit 7 — The Measuring Meadow, and the tier's finale (2026-11-13, tier still `building`)

| File | What |
|---|---|
| `course/launchpad/7.1.json`, `7.2.json`, `7.3.json` | the three kindergarten to grade 2 decks, inside the Launchpad limits above: **7.1 How long is it?** (1.MD.A.2, 2.MD.A.1), **7.2 Clocks and coins** (1.MD.B.3, 2.MD.C.7, 2.MD.C.8), **7.3 Sort it and chart it** (K.MD.B.3, 1.MD.C.4, 2.MD.D.10). Story slide with Tally, drawn diagrams with guided focus, one example, three words, the mission last |
| `course/launchpad/7.4.json` | **7.4 The Garden Gate**, the tier's finale: a mixed review, nothing new. Two story slides (the gate, and the Jumble counting twice to check), tens and ones, make ten, both sides the same, three words, the mission |
| `sets/u7-launchpad.json` | twelve exit items (`nq-launchpad-7.<s>-e1..3`): three a teaching step, each `cat` one of its step's primary codes, and the finale's three (1.OA.C.6, 1.NBT.B.2, 2.NBT.A.1), as Explorer's Unit 7 bank carries its finale's. Every distractor is tagged with a misconception that starts with a past-tense verb, every item has a `why`, and no choice is a false sum |
| `standards.json` `launchpadCodes.codes` | eight more locked statements, with the published statement text (the same text as `server/standards/ccss-math.json`). The finale locks nothing: its six codes are Units 1 to 6's |
| `units.json` | the unit, its stone, and `tiers.launchpad.finale: "7.4"` (the finale door, read by placement exactly as Explorer's is) |
| `seed-games/kitchen-rush.html` | **Kitchen Rush**, the unit's game (Oomba3D 1.1.0, Busy Kitchen theme 1.0.0): chapter `measure` for 7.1, `clock` for 7.2, `chart` for 7.3 and `gate` for the finale 7.4, six rounds each. A busy kitchen getting a garden party ready; every right round puts a dish on the party table. There is no timer: the rush is the busy kitchen. Lesson mode is `chapter=<id>&lock=1`; the sixth right round reports game over (won), which completes the step |

**What each chapter plays.** `measure`: a thing with same-size units laid end to end under it, twice (a baguette is 6 sugar cubes long, a spoon
4 beans), "do the cubes measure it the right way?" (gaps on the first lap; on replays a fair row, overlaps, cubes of two sizes), a ruler
with the thing starting at 0 (inches, then centimeters turn about), the classic trap (a fork from 2 to 9: the number at its end is offered
and is wrong), and two things on one ruler: how much longer is the top one. `clock`: the kitchen clock to the hour (the half hour on a
replay), the oven's digital clock matched to one of three clock faces, a time to five minutes with a.m. or p.m. (breakfast, after school,
bedtime), then the tip jar: dimes and pennies in cents, a quarter with other coins in cents, and a dollar bill with coins written with the
dollar sign. Coins are counted for their value only: nothing is bought, sold or priced, and the game uses none of the theme's shop pieces.
`chart`: a muddle of two kinds to sort and count, three bins (which has the most), how many more (how many altogether on a replay), a
picture graph of four fruits (how many), and a bar graph (how many more or fewer, how many altogether). `gate`: one round from each
earlier unit: a teen number on two trays of buns, adding over ten, bags of ten and loose rolls, the two sides of a scale (a comparing
story on a replay), boxes of 100 with tens and ones, and the name of one equal share of a pie (the name of a shape on a replay).

**Face on.** Every ruler, clock, coin, bin and graph is drawn by the game on one kitchen board that always faces the player, so the room's
perspective never bends a ruler or squashes a clock. On a tall screen the board hangs over a run of counters with the helper and the party
table under it (smaller and tucked in on a short phone); on a wide one it stands between them. Coins differ by size, color and the value
written on each. The board has three looks: asked, "why" (after a wrong answer: counting marks, rings and guides, with the spoken hint) and
found. The test holds the board to its 4 by 3 shape, in full view, clear of the helper and the table, and its smallest numbers to a
readable size at 960, 390 and 360 px.

**The finale.** Explorer's finale (7.4, the Vault of Measures) is an ordinary fourth step of Unit 7 named by `tiers.explorer.finale`, with
its own deck, three exit items in the unit bank and a mission. Launchpad's is built the same way. Its mission is not one of the shared
quiz games: it is Kitchen Rush's own fourth chapter, The Garden Gate (`chapter=gate&lock=1`). The step cites one code from each of
Units 1 to 6: three primary (1.OA.C.6, 1.NBT.B.2, 2.NBT.A.1, the ones its exit items check) and three also-covers (K.NBT.A.1, 1.OA.D.7,
1.G.A.3); `server/standards/official-tags.js` `KITCHEN_CHAPTERS.gate` credits a step locked to the chapter with exactly those. The game's
own library tags stay the eight measurement and data codes.

**Diagrams.** The unit adds no diagram type, and one option. The existing `spinner` (`server/services/diagrams.js`,
`server/views/nq-diagrams.js`) gains `clock: { h, m }` (twelve parts, none shaded): the same circle as a clock face with its twelve
numbers, a short thick hand for the hour and a long blue hand for the minutes; `fives: true` counts the minutes by fives round the edge.
7.1 uses `counters` (cubes counted in a row), `bars` (with and without gaps) and `numberline` as a ruler; 7.2 the clock and a `table` of
coin values; 7.3 `tally`, two matched rows of `counters` and `chart`; 7.4 sticks of ten, hops to ten and the level see-saw. All 40 focus
steps are measured and pinned in `tests/unit/number-quest-guided-focus.test.js`.

**Pictures.** The four mission slides carry `nq/kitchen-rush/<state>` phone-width captures (`scripts/nq-shots.js`, shots marked
`tier: 'launchpad'`; manifest entries with `band: "launchpad"`). Cover and share picture: `scripts/covers/kitchen-rush.recipe.js`.

**Stone.** The unit's stamp is the Measuring Seed (`tiers.launchpad.stones`). **Teacher notes** (four) say what the unit covers, the
"read the number at the end" misconception (and swapped clock hands, and coins counted instead of valued), how the game checks each idea
by doing, and what the finale is. Launchpad stays `status: "building"`.

## Launchpad opens (2026-11-13)

`units.json` `tiers.launchpad.status` is `"open"`: the Launchpad street (kindergarten to grade 2, the welcome,
Units 1–7 and the Garden Gate finale, 23 steps) is there for everyone, beside Explorer. Pro still has no units,
so it exists for nobody. The per-unit sections above are the build log and keep their "tier still `building`"
headings as history.

**Placement.** `placement.json` `crosswalk.entryProfiles` gains `launchpad-1.1` … `launchpad-7.1`; the evidence
for each is written beside them in `crosswalk.launchpadProfiles`. Rungs as Number / Algebra & Patterns /
Shape & Measure / Data & Chance:

| Door | Profile | What the unit teaches, and the rung that samples it |
|---|---|---|
| `launchpad-1.1` The Counting Patch | 0.5 / 0 / 0 / 0 | K.CC.A/B/C, K.NBT.A: Number K.5 |
| `launchpad-2.1` The Joining Pond | 0.5 / 1.0 / 0 / 0 | K.OA.A, then facts to 20: Algebra 1.0 (1.OA.A/B within 20) |
| `launchpad-3.1` The Tens Trellis | 1.5 / 1.0 / 0 / 0 | 1.NBT.A/B/C: Number 1.5 |
| `launchpad-4.1` The Balance Bridge | 1.5 / 2.0 / 0 / 0 | 1.OA.D, 1.OA.A, 2.OA.A: Algebra 2.0 (its last step, 2.OA.C, sits at 2.5, Explorer's line, and is not asked) |
| `launchpad-5.1` The Hundreds Hedge | 2.5 / 2.0 / 0 / 0 | 2.NBT.A/B: Number 2.5 |
| `launchpad-6.1` The Shape Shed | 2.5 / 2.0 / 2.0 / 0 | K.G, 1.G.A, 2.G.A: Shape & Measure 2.0 |
| `launchpad-7.1` The Measuring Meadow | 2.5 / 2.0 / 2.5 / 2.0 | 1.MD.A/B, 2.MD.A/C: Shape & Measure 2.5; K.MD.B, 1.MD.C, 2.MD.D: Data & Chance 2.0 |

How a start is chosen now (`server/services/number-quest-placement.js` `crosswalk`, `beginningNode`):

1. **Just Play** with a named grade: K–2 starts at `launchpad-0.1` (Meet Tally in the Gardens), 3–5 at
   `explorer-1.1`, 6–8 at `explorer-7.1` (until Pro exists).
2. **The Sorting Game.** A named grade of K–2 plays the short form (Number, Shape & Measure, Data & Chance, at
   most four questions each, every item audio-first; the Number rung stands in for Algebra). Grades 3–8 play
   the standard form. If any placed rung is under 2.5 the Launchpad doors are walked in order: nothing met →
   `launchpad-0.1`; else the door of the first unit whose profile is not fully met; all seven met →
   `explorer-0.1`. With every rung at or over 2.5, Explorer's walk is unchanged.
3. **The Launchpad finale is never a start.** A learner who meets every Launchpad profile starts at the
   Explorer welcome; the Garden Gate (`launchpad-7.4`) is a review door a learner walks to. (Explorer's finale
   is still where a run that meets every Explorer profile lands, as before.) A grown-up may still choose any
   door, the Garden Gate included, with the override.
4. On the short form `launchpad-1.1` is not a landing the game picks: a run with nothing settled starts at the
   welcome (one step before it), and a run with Number K.5 has met Unit 1 and starts at Unit 2.

**Existing learners are not moved.** Opening the tier writes nothing: no migration, no backfill, no new column.
A learner's band, progress, stones, laps, marks, test-outs and stored start are exactly what they were. A
learner who was placed at the Explorer welcome with the gap flagged (a rung under 2.5 before the gardens
opened) stays there; their Starting Point note now says where the same answers would start them today and
that nothing has been moved (`launchpadNoteLine`). A start changes only by a retake the learner confirms or by
a grown-up's override. The Launchpad street is open behind every Explorer-placed learner, and the street
switcher on the path moves between the two streets without touching either street's progress.

**The path.** With two streets, a brand-new learner sees both street cards (and the Sorting Game invitation);
until they choose or are placed, the street drawn is Explorer, the course's default. A street walked to its
end shows "You walked the whole Launchpad street!" with the way on to the next open street
(`views/number-quest-path.js`, `#nqp-onward`).

**Copy.** The teacher page's counts (steps, units, streets, games, the grade range, the game list) come from
the catalogue the reader may see (`routes/number-quest.js` `nqFacts`), so they follow the data. The seven
Launchpad games are in the page's game list with a short description each (`teachers.nq.crew.*`).

**Still owed: a proper K–2 placement check.** The game uses what exists: the grade the learner names and the
bank's K.0–2.5 rungs. What a purpose-built check would need: items a non-reader can answer alone (every prompt
spoken by a recorded or AI voice in the learner's language, picture or tap answers only, no typed answers);
hands-on forms for each strand (count out, build on a ten-frame, sort, match shapes, compare lengths); more
than the bank's three or four templates a rung so a retake does not repeat; an Algebra staircase of its own
(the short form folds it into Number, so Units 2 and 4 are placed from the Number rung); enough questions to
settle a rung without tiring a five-year-old, or a second short sitting; a floor rule (today a run that
misses everything places half a rung under the lowest rung it reached, not at the bottom, when it runs out of
questions); and profiles re-fitted from real item data once there is some. Guarded by
`tests/unit/number-quest-launchpad-open.test.js`.
