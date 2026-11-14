# Number Quest catalog — Phase 0 standards lock

> **Pro (grades 6–8)** was declared on 2026-11-14 as a tier that is still being built. Everything about it (its
> names, its seven reserved units, its 69 locked codes, what it does not cover, and exactly what a unit's pull
> request touches) is in the section **"Pro tier (The Towers)"** at the end of this file. Where an older section
> below says rungs 6.0–8.0 or the grade 6–8 clusters are "deferred", that was true until that date.

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
| `standards.json` | the registry: CCSS-M framework facts, the eight Mathematical Practices, every verified cluster heading for grades K–8 (`clusters`; grades 6–8 since the Pro lock of 2026-11-14, `deferredClusters` is empty), the LOCKED statement-level code sets (`explorerCodes`: Units 1–4 locked in Phase 0, Units 5–7 + finale in Phase 2; `launchpadCodes`; `proCodes`, 69 statements), what Pro does not cover (`proCoverage`), and the corrections this lock makes to the spec's shorthand |
| `units.json` | the catalog slice: Explorer intro 0.1 + Units 1–7 + the Vault finale (23 steps), each step's locked codes as `primary` / `also` / `buildsToward` (the CS Quest idiom), its MP spotlight, its Measure Stone, the game mission named in spec §5.2, and per-unit teacher notes |
| `placement.json` | Tally's Sorting Game strand lock: the four strands, the half-grade rung convention, all 17 rungs K.0–8.0 LOCKED at cluster level (6.0–8.0 since 2026-11-14), and the strand→unit crosswalk with per-unit entry profiles, the Pro starting line (`crosswalk.proLine`) and the soft-landing rule |
| `placement/templates.json` | the placement item bank (spec §4.3): 266 item templates across the four strands and rungs K.0–8.0 (180 below rung 6, unchanged since repair round 3; 86 at rungs 6.0–8.0, at least four a strand × rung cell, rebuilt on 2026-11-14). Each template carries strand + `strandLabel` (the `placement.json` strand name), rung, `ccssClusterCode` + the cluster's heading (`lockStatus: "locked"`, every template), the misconception its main distractor diagnoses, response type (`pick`/`numeric`/`count-out`/`drag`/`build`), reading load (`none`/`low`/`standard`), `audioFirst`/`launchpadSafe` flags, and a `gen` block of randomised-number constraints |
| `placement/generator-pro.js` | the 73 item archetypes for rungs 6.0–8.0 (grades 6–8), merged into `generator.js`'s table; nothing below rung 6 uses one |
| `placement/retired.json` | the 63 templates the game served at rungs 6.0–8.0 before 2026-11-14 and never serves again; kept findable by id so an item already dealt still grades |
| `math-text.js` | Pro's maths in running text: `mathText` (typed stand-ins printed with the real signs) and `sayMath` (the same said in words for read-aloud) |
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
- ~~**Pro tier** statement lock, placement rungs 6.0–8.0~~ — landed 2026-11-14 (`proCodes`, the rung 6.0–8.0 locks; see
  "Pro tier (The Towers)" at the end of this file). 8.NS stays builds-toward and 8.SP partial (spec §2.5 notes 7, 9);
  for 8.F the owner replaced note 10: step 5.2 claims 8.F.B.4, 8.F.A.1 and 8.F.A.3 and nothing else in the domain.

## Placement bank rules (enforced by `scripts/number-quest-placement-check.js` + `tests/unit/number-quest-placement.test.js`)

- 266 templates (Number 70, Algebra & Patterns 63, Shape & Measure 70, Data & Chance 63), no strand × rung cell
  below 3, and none below 4 at rungs 6.0–8.0. The check samples 120 seeds per
  template (31,920 items): prompts render fully, keys are present and unique among choices,
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

**Opening a tier.** Launchpad has been `"open"` since 2026-11-13; Pro is `"building"` since 2026-11-14 (its welcome is built, its seven units are planned). `tiers.<tier>.status` is `"building"` or `"open"`. While building, the tier's steps,
band, street and teacher-page rows exist for the platform admin only; for everyone else the tier does not
exist. Set it to `"open"` and the street switcher, the band card, the teacher page and placement all pick
it up. A tier with no built unit does not exist at all, whatever its status.

**Planned units (reserving a tier).** A unit object may carry `planned: true`: its number, title, stone, `group`, emoji,
step numbers, `order` numbers, titles, shorts, MP spotlights and standards are final, and it has no decks, bank or game
(`tool: null`, every step's `game.<tier>` is `null`). `reserved` (on the unit: `{ game, world }`; on a step: `{ params }`)
names the game slug, world and chapter the plan expects; nothing reads it. For the engine a planned unit is **not in the
tier**: `unitsOf()` and `stepsOf()` leave it out, so it has no steps, no door, no start node, no test-out, no standards
tag and no page, for anyone. `plannedUnitsOf(tier)` lists it, and only the platform admin's preview of a building street
shows it (a "Planned" block under the path, a "Planned units" table on the teacher page). A tier with a planned unit is
never open, whatever its status line says. **Building a planned unit is deleting the flag** in the same change that brings
its decks, bank and game (the deck checker reports "no deck" for a step whose flag is lifted without one).

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

## Pro diagram pack: the drawn types for grades 6–8 (2026-11-13, no Pro units yet)

Seven drawn types and three number-line options that the Pro decks will need, built once before the units so no
unit has to touch the shared drawing files. Nothing here changes a deck: there are no Pro units, decks or tier
changes in this pack. Cleaned in `server/services/diagrams-pro.js` (called by `services/diagrams.js`
`cleanDiagram` and, for the number line, by `services/courses.js` `cleanSlide`); drawn in
`server/views/nq-diagrams-pro.js`; tested in `tests/unit/course-diagrams.test.js`.

**The contract every type here keeps**

- **`label` is required** (as for every `visual`): the picture's short name, at most 160 characters. For these types
  the viewer then adds the drawing's own data in words (`diagramAlt`), so the accessible name is
  `"<label>. <the numbers on the drawing>"` and a learner who cannot see the picture gets the same information.
  A value drawn as `?` is always said as "unknown", never as its number. Write the label as a name ("Flour and
  cookies"), not as a description of the numbers.
- **Malformed data drops the diagram** (the slide keeps its art; `fromDeck` reports it), exactly like the older
  types. That covers anything that would draw something false: a point off the plane, five numbers out of order,
  angles that do not add up, more items than the type allows. **A label is never cut short**: one longer than its
  limit drops the diagram (half a number is a wrong number).
- **What is only a matter of drawing is clamped**, not refused: a plane or an axis with many gridlines numbers every
  2nd, 5th or 10th so the numbers stay 12 px or more on a phone; a very thin triangle or net is drawn no thinner
  than a phone can show (the labels stay true); labels that would touch are moved apart.
- **Minus signs.** A number given as a number prints with the deck's minus sign (U+2212, `−3`), and a hyphen typed
  for a minus in a label (`"-3"`, `"y = -2x + 1"`, `"- 9"`) is turned into it. A hyphen inside a word stays.
  This now also holds for a negative number given as a number in the older `table`, `squares` and `swap` cells.
- **Fractions, decimals, exponents, degrees** are written as text and drawn as written: `"1 1/2"`, `"2.5"`,
  `"c² = 100"`, `"65°"`, `"A′"`. In the accessible name they are said in words ("1 and 1 over 2", "c squared equals
  100", "65 degrees", "A prime", "negative 3", "5 minus 2").
- **Read-aloud never speaks a diagram.** The Listen button reads `slide.say` (or the title and text); nothing in
  `visual` reaches the voice. Put what the picture shows into `say` in words if it should be heard.
- **Never colour alone.** A second line is dashed, an image polygon is dashed, an open circle is hollow, an unknown
  is a `?` in a dashed outline, the way back in a flow is dashed and under the way forward.
- **Sizes.** No text under 3.4 units (12 px at 390 px wide, 10 px at 326 px, the floor the older diagrams use).
  Drawn on the Cream ground in light and dark themes alike. The deck is `dir="ltr"`, so the drawings do not mirror
  in a right-to-left interface.
- **Guided focus.** Layouts are a pure function of the data. `diagramParts(visual)` (exported by
  `server/views/nq-diagrams.js`; pass the cleaned visual) returns `{ name: [x, y, w, h] }` for each named part, in
  the unit `slide.focus[].box` is written in, with the same small margin the measured boxes use. Print them with
  `node -e "import('./server/services/courses.js').then(async C => { const { diagramParts } = await import('./server/views/nq-diagrams.js'); console.log(diagramParts(C.cleanSlide({ title: 'T', visual: JSON.parse(process.argv[1]) }).visual)); })" '<visual json>'`.
  Part names are listed with each type below. Boxes for the Pro decks still get pinned in
  `tests/unit/number-quest-guided-focus.test.js` when the decks are written.

**`plane`: a coordinate plane (also the scatter plot).** `x` and `y` are `[min, max]` and must both include 0;
`step` (a number, or `[xStep, yStep]`, default 1) is the size of one grid square; 2–20 squares each way. Optional:
`points` (1–16: `{ x, y, label?, tone? 0–3, open? }`), `segments` (1–6: `{ from, to, label?, dash? }`), `lines`
(1–3: `{ m, b }` for y = mx + b, or `{ through: [[x, y], [x, y]] }`, the only way to write an upright line; plus
`label?`, `dash?`; the 2nd and 3rd are dashed anyway), `polygons` (1–2: `{ pts: 3–8 points, names?, image? }`; the
`image` one is dashed and blue), `slope` (`{ from, to, rise?, run? }`, default labels "rise 4", "run 2"),
`xName`, `yName` (default x and y; a name of 3–20 characters is written along its axis: a scatter plot).
Equal steps draw square units. Parts: `plane`, `origin`, `point:<i>`, `segment:<i>`, `line:<i>`, `polygon:<i>`, `slope`.

```json
{ "type": "plane", "label": "A line and its slope", "x": [-4, 6], "y": [-3, 7],
  "points": [{ "x": 1, "y": 1, "label": "A (1, 1)" }, { "x": 3, "y": 5 }],
  "lines": [{ "m": 2, "b": -1, "label": "y = 2x − 1" }], "slope": { "from": [1, 1], "to": [3, 5] } }
```
```json
{ "type": "plane", "label": "A slide", "x": [-6, 6], "y": [-4, 4],
  "polygons": [{ "pts": [[-5, 1], [-2, 1], [-2, 3]], "names": ["A", "B", "C"] },
               { "pts": [[1, -3], [4, -3], [4, -1]], "names": ["A′", "B′", "C′"], "image": true }] }
```
```json
{ "type": "plane", "label": "Practice and score", "x": [0, 10], "y": [0, 100], "step": [1, 10],
  "xName": "Hours of practice", "yName": "Score",
  "points": [{ "x": 1, "y": 22 }, { "x": 4, "y": 48 }, { "x": 9, "y": 90 }],
  "lines": [{ "m": 8, "b": 14, "dash": true, "label": "trend" }] }
```

**`double`: a double number line.** `ticks` is 2–7 pairs `[top, bottom]`, drawn evenly spaced, each pair one above
the other; any value may be `"?"`. Values are whole labels of up to 7 characters (up to 5 on a line of 6 or 7
ticks). `top` and `bottom` (optional, up to 24 characters) name the two scales. Parts: `top`, `bottom`, `pair:<i>`,
`blank:<i>:top`, `blank:<i>:bottom`.

```json
{ "type": "double", "label": "Flour and cookies", "top": "Cups of flour", "bottom": "Cookies",
  "ticks": [[0, 0], [2, 12], [4, 24], [6, "?"], [8, 48]] }
```

**`boxplot`: one or two box plots over one axis.** `min`, `max`, `step` set the axis (2–12 steps); `plots` is 1–2 of
`{ five: [lowest, lower quartile, median, upper quartile, highest], name?, tone? }`, in order and on the axis;
`unit` (optional) is the axis title. Parts: `axis`, `plot:<i>`, `box:<i>`, `median:<i>`.

```json
{ "type": "boxplot", "label": "Two classes", "min": 50, "max": 100, "step": 5, "unit": "Test score",
  "plots": [{ "name": "Class A", "five": [55, 68, 75, 82, 95] }, { "name": "Class B", "five": [60, 70, 72, 78, 100] }] }
```

**`angles`: angles at one point.** `angles` go round anticlockwise from the ray pointing right; each is
`{ deg, label?, blank? }` with `deg` its true size (20 or more) and `label` what is written (default `"65°"`;
`"?"` or `"x°"` for an unknown, up to 9 characters; `blank: true` writes nothing). A 90° angle gets a square corner.
`layout`: `"line"` (2–4 angles that make 180: supplementary), `"corner"` (2–3 that make 90: complementary),
`"cross"` (exactly 4, two lines crossing: a, b, a, b with a + b = 180: vertical angles), `"rays"` (1–5 angles, up
to 360 in all). Parts: `vertex`, `angle:<i>`.

```json
{ "type": "angles", "label": "Angles on a line", "layout": "line", "angles": [{ "deg": 65 }, { "deg": 115, "label": "?" }] }
```
```json
{ "type": "angles", "label": "Two lines cross", "layout": "cross",
  "angles": [{ "deg": 50 }, { "deg": 130, "label": "?" }, { "deg": 50, "label": "x°" }, { "deg": 130, "blank": true }] }
```

**`righttriangle`: a labelled right triangle.** `base` and `height` are numbers (the proportions it is drawn to);
`labels` has two or three of `base`, `height`, `hyp` (up to 9 characters; `"?"` for the unknown); `corner: "right"`
puts the square corner at the bottom right. Parts: `triangle`, `corner`, `base`, `height`, `hyp`.

```json
{ "type": "righttriangle", "label": "A right triangle", "base": 4, "height": 3, "labels": { "base": "4 cm", "height": "3 cm", "hyp": "?" } }
```

**`net`: the net of a prism.** `solid: "box"` with `dims: [length, width, height]` draws six rectangles (a strip of
four, the top over the front, the bottom under it); `solid: "prism"` with `dims: [triangle base, triangle height,
length]` draws three rectangles and two triangles. `labels` (optional, three, up to 7 characters) replace the
numbers on the edges. Parts: box `net`, `left`, `front`, `right`, `back`, `top`, `bottom`; prism `net`, `side:0`,
`base`, `side:1`, `end:0`, `end:1`.

```json
{ "type": "net", "label": "A box, unfolded", "solid": "box", "dims": [5, 3, 2], "labels": ["5 cm", "3 cm", "2 cm"] }
```
```json
{ "type": "net", "label": "A prism, unfolded", "solid": "prism", "dims": [6, 4, 7], "labels": ["6 m", "4 m", "7 m"] }
```

**`flow`: an operation flow (a function machine).** `ops` is 1–3 operations; `values` is one more than that, the
value before and after each machine, any of them `"?"`; `undo` (optional, one per op) draws the way back under it,
each inverse under the operation it undoes; `inName`, `outName` (optional) name the two ends. Labels are up to 6
characters (up to 4 with three machines). Parts: `value:<i>`, `op:<i>`, `undo:<i>`.

```json
{ "type": "flow", "label": "Undo it", "values": ["?", "15", "17"], "ops": ["× 3", "+ 2"], "undo": ["÷ 3", "− 2"] }
```

**`numberline` options.** `upright: true` stands the line up (bigger numbers higher): marks named on the left, the
point on the right, each hop an arrow up or down beside the line with level lines to its two numbers (hop labels up
to 5 characters; no `stacks`). `tube: true` (with `upright`) draws it as a thermometer filled to the point.
`ray: { at, dir: "left" | "right", open? }` (on the flat line) shades every number from `at` to that end, with a
filled circle at `at`, or a hollow one when `open: true` (an inequality). Parts: `line`, `point`, `hop:<i>`; `ray`, `end`.

```json
{ "type": "numberline", "label": "From 4 down to −3", "min": -5, "max": 5, "upright": true,
  "marks": [{ "at": -5, "label": "−5" }, { "at": 0, "label": "0" }, { "at": 5, "label": "5" }],
  "point": { "at": -3, "label": "−3" }, "hops": [{ "from": 4, "to": -3, "label": "−7" }] }
```
```json
{ "type": "numberline", "label": "A cold morning", "min": -20, "max": 30, "upright": true, "tube": true,
  "marks": [{ "at": -20, "label": "−20°" }, { "at": 0, "label": "0°" }, { "at": 30, "label": "30°" }], "point": { "at": -5, "label": "−5°C" } }
```
```json
{ "type": "numberline", "label": "x is greater than −2", "min": -5, "max": 5,
  "marks": [{ "at": -5, "label": "−5" }, { "at": -2, "label": "−2" }, { "at": 0, "label": "0" }, { "at": 5, "label": "5" }],
  "ray": { "at": -2, "dir": "right", "open": true } }
```

**The older types, checked against grades 6–8.** Ratio table (`table`), percent bar (`split`), area model
(`squares` with `top` / `side` labels) and bar chart (`chart`) already take decimals, fractions and negatives as
text. Four real gaps were closed, none of which changes an existing deck:

- `numberline` takes up to 11 marks (it was 6): a line from −5 to 5, or a dot plot from 0 to 10, names every number.
- `numberline` hops must start and land on the line (a hop from 999 to −999 used to pass and draw off the frame);
  a hop back, below zero, is allowed as before.
- `bars` takes up to 10 parts a row (it was 4): a tape diagram of 3 : 5 or 3 : 7, a percent bar in tenths.
- `chart` takes `touch: true`: a histogram, its bars touching, up to six, in one tone.

  ```json
  { "type": "chart", "label": "Heights of 30 plants", "max": 12, "step": 2, "unit": "plants", "touch": true,
    "bars": [{ "label": "0–9", "value": 2 }, { "label": "10–19", "value": 7 }, { "label": "20–29", "value": 11 }, { "label": "30–39", "value": 6 }] }
  ```

**No existing drawing moved.** `tests/fixtures/course/diagram-baseline.json` holds every diagram in the seed decks
(173) with the hash of the SVG it drew before this pack; `course-diagrams.test.js` draws each again and compares.
Regenerate it (`node scripts/nq-diagram-baseline.js`) only when a drawing is changed on purpose.

**Not in the pack:** algebra tiles, a tree diagram (a `table` stands in), a fraction-division model, a pyramid net.

## Pro tier (The Towers), grades 6–8: foundations (2026-11-14, tier `building`)

The owner approved the Pro plan on 2026-11-14 with seven decisions (recorded in `docs/decisions.md`, "Number Quest
Pro: foundations"). This build declares the tier and reserves everything the seven units need, so they can be built
side by side. **No Pro game and no Pro unit deck exists yet.** For everyone but the platform admin, Pro does not exist.

**Names.** District **The Towers**; the stones are **Gears** (Ratio, Zero, Variable, Scale, Slope, Angle, Chance); the
finale is **The Great Clock**, step 7.4, a fourth chapter of the Unit 7 game, as Launchpad's finale is. Seven gears
start the Numberworks clock.

**What is built.** `tiers.pro` in `units.json` (`status: "building"`); the welcome unit and its step `pro-0.1`,
**Welcome to the Towers** (`course/pro/0.1.json`, `sets/u0-pro.json`: framing, no game, a talk question, a double
number line and an upright number line from the diagram pack, five measured focus steps); the 69 locked codes; the
rung 6.0–8.0 item bank; the Pro starting line and entry profiles (inert); the Pro deck limits; maths in text and in
read-aloud; the admin's preview.

### The seven units (reserved, `planned: true`)

| Unit | Title | Gear | Reserved game | World | Chapters, in step order |
|---|---|---|---|---|---|
| 1 | The Mixing Tower | Ratio Gear | `lantern-mix` | spooky-hollow | `mix`, `rate`, `percent` |
| 2 | The Cold Store | Zero Gear | `sub-zero` | busy-kitchen | `pour`, `below`, `change` |
| 3 | The Machine Hall | Variable Gear | `machine-line` | toy-town | `build`, `same`, `undo` |
| 4 | The Map Room | Scale Gear | `scale-scout` | medieval-village | `constant`, `scale`, `percent` |
| 5 | The Sky Wires | Slope Gear | `sky-lines` | sky-islands | `slope`, `rule`, `meet` |
| 6 | The Drafting Keep | Angle Gear | `keep-builder` | castle-quest | `build`, `move`, `span` |
| 7 | The Test Range | Chance Gear | `launch-lab` | space-base | `spread`, `chance`, `trend`, `clock` |

Unit 7 has four chapters: the fourth, `clock`, is the finale. No two units in a row share a world. A reserved game slug
is a name only: nothing is registered for it, and no file exists.

### The 23 steps and their codes (final: a unit PR changes none of this)

| Step | Title | `order` | Primary | Also covers | MP |
|---|---|---|---|---|---|
| 0.1 | Welcome to the Towers | 1 | (framing) | — | MP1 |
| 1.1 | Ratios and equal mixes | 2 | 6.RP.A.1, 6.RP.A.3a | — | MP7 |
| 1.2 | Unit rates | 3 | 6.RP.A.2, 6.RP.A.3b | — | MP2 |
| 1.3 | Percent and changing units | 4 | 6.RP.A.3c, 6.RP.A.3d | — | MP6 |
| 2.1 | Divide by a fraction | 5 | 6.NS.A.1 | 6.NS.B.3 | MP4 |
| 2.2 | Below zero: opposites and absolute value | 6 | 6.NS.C.5, 6.NS.C.6, 6.NS.C.7 | — | MP2 |
| 2.3 | Add, subtract, multiply and divide with negatives | 7 | 7.NS.A.1, 7.NS.A.2 | 7.NS.A.3 | MP8 |
| 3.1 | Write and work out expressions | 8 | 6.EE.A.2, 6.EE.B.6 | 6.EE.A.1 | MP6 |
| 3.2 | Expressions that are equal | 9 | 6.EE.A.3, 6.EE.A.4, 7.EE.A.1 | 7.EE.A.2 | MP7 |
| 3.3 | Solve equations and inequalities | 10 | 6.EE.B.7, 7.EE.B.4a | 6.EE.B.5, 6.EE.B.8, 7.EE.B.4b | MP1 |
| 4.1 | Is it proportional? Find the constant | 11 | 7.RP.A.2a, 7.RP.A.2b | 7.RP.A.1 | MP7 |
| 4.2 | Scale drawings and maps | 12 | 7.G.A.1, 7.RP.A.2c | 7.RP.A.2d | MP4 |
| 4.3 | Percent problems | 13 | 7.RP.A.3 | 7.EE.B.3 | MP2 |
| 5.1 | Slope: the steepness of a line | 14 | 8.EE.B.5, 8.EE.B.6 | 6.NS.C.8 | MP7 |
| 5.2 | y = mx + b: a line as a rule | 15 | 8.F.B.4 | 8.F.A.1, 8.F.A.3, 6.EE.C.9 | MP4 |
| 5.3 | Solve linear equations and find where two lines meet | 16 | 8.EE.C.7, 8.EE.C.8 | — | MP1 |
| 6.1 | Area, surface area and volume | 17 | 6.G.A.1, 6.G.A.2, 6.G.A.4 | 7.G.B.6 | MP4 |
| 6.2 | Angles and moves: slide, flip, turn, resize | 18 | 7.G.B.5, 8.G.A.1, 8.G.A.3 | 8.G.A.2, 8.G.A.4 | MP5 |
| 6.3 | The Pythagorean theorem | 19 | 8.G.B.7, 8.G.B.8 | 8.G.B.6, 8.EE.A.2 | MP3 |
| 7.1 | Center and spread | 20 | 6.SP.A.3, 6.SP.B.4, 6.SP.B.5 | 6.SP.A.2 | MP6 |
| 7.2 | Chance: experiments and models | 21 | 7.SP.C.5, 7.SP.C.6, 7.SP.C.7 | 7.SP.C.8 | MP5 |
| 7.3 | Compare two data sets and spot a trend | 22 | 7.SP.B.4, 8.SP.A.1 | 7.SP.B.3, 7.SP.A.2, 8.SP.A.2 | MP3 |
| 7.4 | The Great Clock | 23 | 7.EE.B.3 | 6.RP.A.3b, 7.NS.A.3, 7.EE.B.4a, 7.RP.A.3, 8.EE.B.5, 8.G.B.7, 6.SP.B.5 | MP1 |

Step 6.3 also carries `8.NS.A` as a cluster-level builds-toward (preparation, never coverage). The finale's primary is
7.EE.B.3; its seven also-covers are one code from each unit. All 69 codes are in `standards.json` `proCodes.codes` with
the published statement text (checked word for word against `server/standards/ccss-math.json`): RP 12, NS 9, EE 19,
F 3, G 13, SP 13.

### What Pro does not cover

Pro ships as **"the major work of grades 6–8"** (owner decision 2). Of the 81 grade 6–8 statements (lettered parts
folded into their parent) the seven units cite 62. The other 19 are recorded in `standards.json` `proCoverage.notCovered`,
grouped in plain words, so the teacher page's list can be generated from the data when the tier opens:

| Not covered | Statements |
|---|---|
| Circles: area and circumference **(named on the page first)** | 7.G.B.4 |
| Volume of cylinders, cones and spheres **(named on the page first)** | 8.G.C.9 |
| Exponent rules and scientific notation **(named on the page first)** | 8.EE.A.1, 8.EE.A.3, 8.EE.A.4 |
| Irrational numbers **(named on the page first)** | 8.NS.A.1, 8.NS.A.2 |
| Long division, greatest common factor and least common multiple | 6.NS.B.2, 6.NS.B.4 |
| Polygons drawn on the coordinate plane | 6.G.A.3 |
| Drawing shapes from given conditions and slicing solids | 7.G.A.2, 7.G.A.3 |
| Angle sums of triangles and angles made by parallel lines | 8.G.A.5 |
| Statistical questions and random sampling | 6.SP.A.1, 7.SP.A.1 |
| The equation of a trend line and two-way tables | 8.SP.A.3, 8.SP.A.4 |
| Comparing two functions and describing a graph in words | 8.F.A.2, 8.F.B.5 |

Partly covered (`proCoverage.partial`): 8.F (three statements, step 5.2: 8.F.B.4 primary, 8.F.A.1 and 8.F.A.3 also;
owner decision 5, replacing the spec's "bridges it, never claims it"), 8.SP.A (8.SP.A.1 and 8.SP.A.2 only), 8.EE.A
(8.EE.A.2 only), 8.NS.A (builds-toward only). The lock test recomputes the 19 from the published file, so a statement
can be neither hidden nor invented.

### Rules every Pro unit keeps

- **Percent contexts (owner decision 3).** Games and decks use neutral contexts: recipes, maps, sports statistics,
  science data, measurement error. Nothing is priced, bought or sold. At most one or two tax or discount items may
  appear in the whole tier, in step 4.3's lesson check only, worded about a third person. No interest and no commission
  item anywhere. Kids are never sold to. (`tests/unit/number-quest-pro-decks.test.js` holds every Pro deck and bank to this.)
- **Read-aloud is ON by default in Pro games (owner decision 6**; the standing rule: every game has the AI voiceover by
  default), with the usual replay button and the Launchpad voice setup (`server/services/tts-lines.js`, fixed and
  scanned lines only). Lesson decks keep the Listen button on every slide, as on the other streets.
- **Entering Pro (owner decision 4).** Every strand at rung 5.5 or above, else the Explorer finale door as today.
- **Functions (owner decision 5).** Only 8.F.B.4, 8.F.A.1 and 8.F.A.3, in step 5.2.
- **The finale (owner decision 7)** is the fourth chapter of the Unit 7 game.
- **Games** are Kit 2 games, three chapters each (Unit 7: four), locked with `chapter=<id>&lock=1`; no fail state, no
  clock that ends a round, answers by dragging, dials, steppers and tiles (no typing, no names), no reward currency.

### Pro deck limits (ages 11–14; `tests/unit/number-quest-pro-decks.test.js`, every file in `course/pro/`)

Slide title 3–60 chars; text 20–320 chars, at most 4 sentences of at most 28 words; a deck reads at grade 9 or under
(Flesch-Kincaid estimate); 5–7 slides; exactly one example slide (2–8 chips of at most 60 chars); exactly one words
slide with 3–5 words (a meaning of 10–140 chars); the mission last; a diagram carries 1–4 focus steps with cues of 8–80
chars and at most 18 words; `minutes` 4–12; exit `q` at most 220 chars, 4 distinct choices of at most 70 chars, `why`
30–240 chars, every distractor tagged with a misconception that starts with a past-tense verb. (Launchpad, for
comparison: text to 160 chars, two sentences of twelve words.)

**Maths in text.** Write `−3` or `-3`, `x²` or `x^2`, `√16` or `sqrt(16)`, `3 × 4` or `3 x 4`, `≤` or `<=`, `65°`,
`3/4`, `4 1/2`: the loader prints a Pro deck's and a Pro check item's text with the real signs (`math-text.js`
`mathText`; a true minus sign, never a hyphen), and read-aloud says them in words (`sayMath`: "negative 3", "x
squared", "the square root of 16", "3 fourths", "65 degrees"). Write a ratio with spaces round its colon (`2 : 3`, said
"2 to 3"); a clock time has none. A diagram's labels follow the diagram pack's own rules, and read-aloud never speaks
a diagram. Only Pro text passes through `math-text.js`: every Launchpad and Explorer line is printed and said exactly
as before (`tests/unit/number-quest-math-text.test.js` compares every slide of both streets).

### Placement: the rung 6.0–8.0 bank, the Pro starting line and the profiles

**The bank.** Until 2026-11-14 the 72 templates at rungs 6.0–8.0 were "deferred" with no cluster code and yet served;
15 named grade and domain pairs CCSS-M does not have (6.NF, 7.NF, 8.NF, 6.MD, 7.MD, 8.MD, 8.RP); most repeated earlier
grades' work with bigger numbers; nothing asked about slope, the Pythagorean theorem, transformations, surface area,
dividing by a fraction, box plots or scatter plots. Now:

- 63 were **retired** (`placement/retired.json`): never dealt again, still graded for an item already on a screen.
  Their wrong labels were not kept. 9 sound ones **stay** with their real cluster: `ratioScale` (6.RP.A), `exprEval` ×2
  (6.EE.A), `equation` x + b (6.EE.B), `propSolve` (7.RP.A), `equation` ax + b (7.EE.B), `angle` (7.G.B), `medianCalc`
  ×2 (6.SP.A, 6.SP.B). 77 are **new**: 76 from the 73 archetypes in `placement/generator-pro.js`, and one more `percentOf` template (6.RP.A) on the Algebra strand, where ratios belong.
- Every rung 6.0–8.0 cell holds at least four templates (Number 5/5/4/4/4, Algebra 5/4/4/4/4, Shape 4/4/4/5/5,
  Data 5/4/4/4/4 at rungs 6.0/6.5/7.0/7.5/8.0), each locked to a cluster its rung names in `placement.json`.
- Every item is **solved independently** from its prompt (`tests/support/nq-pro-solvers.js`): exactly one choice is
  correct, it is the key, and every wrong choice is what a named mistake produces. A negative number is printed with
  the true minus sign; nothing is priced; the spoken prompt says every sign in words; an answer is typed only when it
  is a whole number from 0 to 99, as everywhere in the game.
- **Nothing below rung 6 changed.** `tests/unit/number-quest-placement-pro.test.js` pins the 180 templates there and
  every item they deal for 40 seeds each by hash, the outcome of 324 simulated runs, and the whole game of the 245 of
  those runs that stay under rung 6; `number-quest-pro-foundations.test.js` pins where all 88,434 possible sets of
  placed rungs start. (One honest footnote: a learner who climbs to rung 6 and comes back may once be dealt a
  different sub-6 template than before, because the game never repeats an item and the old rung 6 items were verbatim
  copies of sub-6 ones. The outcome is the same.)
- A rung names **clusters**, never statements, and samples curriculum order to route a learner. So a rung may sample a
  statement the Pro units do not teach (greatest common factor at Number 6.5, a statistical question at Data 6.0, a
  root between two whole numbers at Number 8.0 under 8.NS.A). That is routing, not coverage.

**The Pro starting line** (`P.PRO_LINE`, `crosswalk.proLine`): every strand at rung **5.5** or above. Explorer's
highest profile asks rung 4.0, so without the line a strong fourth grader who meets all seven Explorer profiles would
be walked into Pro. Under the line in any strand, the start is the Explorer finale door, as today.

**The seven profiles** (`crosswalk.entryProfiles`, `pro-<unit>.1`; the evidence is in `crosswalk.proProfiles`), as
Number / Algebra & Patterns / Shape & Measure / Data & Chance: Unit 1 5.5 / 6 / 5.5 / 5.5 · Unit 2 7 / 6 / 5.5 / 5.5 ·
Unit 3 7 / 6.5 / 5.5 / 5.5 · Unit 4 7 / 7 / 5.5 / 5.5 · Unit 5 7 / 8 / 5.5 / 5.5 · Unit 6 7 / 8 / 7.5 / 5.5 ·
Unit 7 7 / 8 / 7.5 / 7.5. Monotone, never under Explorer 7.1.

**Inert while building.** Placement never lands a learner on a street that is not open, and a planned unit's profile
cannot be asked for (`P.entryProfile` is null for it), so today every start is exactly what it is on main. Once Pro is
open: under the first profile the start is `pro-0.1`; else the first unit whose profile is not met; all seven met, the
Great Clock door; "Just Play" with grade 6–8 starts at `pro-0.1`. **Existing learners are never moved**, by the
declaration or by the opening: nothing is written (tested as #323 was).

### What a unit PR touches (the exact list)

Each unit is one PR. Everything in it is the unit's own, except these shared lines, which is why units can be built
side by side and registered one at a time on top of the latest main.

**In `units.json`, the unit's own object only** (no other line of the file):

1. delete `"planned": true` and `"reserved"` (the unit's, and each of its steps');
2. set `"tool"` to the game slug;
3. set each step's `"game": { "pro": { "slug", "chapter", "chapterTitle", "params": "chapter=<id>&lock=1" } }`;
4. write `"teacherNotes"` (three notes; Unit 7: four, the last about the finale).

Do **not** touch: `tiers.pro`, another unit, any `n`, `order`, `titles`, `shorts`, `mp` or `standards`. Do not touch
`standards.json` (every code is locked) or `placement.json` and the bank (already locked).

**New files, all the unit's own:** `course/pro/<n>.1.json`, `.2.json`, `.3.json` (Unit 7: and `7.4.json`);
`sets/u<n>-pro.json` (nine items; Unit 7: twelve); `seed-games/<slug>.html` and `.json`; `tests/unit/<slug>.test.js`;
`public/img/nq/<slug>/*.webp`; `public/covers/<slug>.jpg`, `public/og/<slug>.jpg`; `scripts/covers/<slug>.recipe.js`.

**One line or block each in shared files** (the "register" commit, made at merge time on the latest main, one unit at
a time, as the Launchpad units did):

| File | What the unit adds |
|---|---|
| `scripts/seed.js`, `server/db.js` (the Learn list) | the game |
| `server/learn.js`, `server/services/course-catalog.js` | the game's grades and its course line |
| `server/standards/official-tags.js` | the game's codes, its chapters, `LEVELLED` |
| `server/services/tts-lines.js` | the game's spoken lines (read-aloud on by default) |
| `scripts/nq-shots.js`, `public/img/nq/manifest.json` | the mission shots (`tier: 'pro'`, `band: "pro"`) |
| this README | a section for the unit, like the Launchpad ones |
| `tests/unit/course-mission-truth.test.js` | the pinned totals: deck-check items (+9; Unit 7: +12), set files (+1), exit items (+9; Unit 7: +12) |
| `tests/unit/number-quest-guided-focus.test.js` | the unit's measured focus steps in `REGISTRY`, and the two totals |
| `tests/unit/number-quest-standards-lock.test.js` | in "Pro units cite only codes in proCodes": the unit's `planned` flag in the pinned list (`true` to `false`) |
| `tests/unit/number-quest-tiers.test.js`, `number-quest-pro-foundations.test.js` | the pinned lists of built and planned Pro units and steps |
| `tests/unit/shelves.test.js`, `scanner.test.js`, `vendor.test.js`, `tts-lines.test.js`, `number-quest-parity-repair.test.js` | the pinned game lists and counts |

A unit PR adds **no** diagram type (the diagram pack is in), **no** code to `proCodes`, **no** placement template, and
**no** learner-facing mention of Pro outside its own decks.

**Which units can be built at the same time.** All seven are independent once this is in: the game, the decks, the bank
and the unit's own object in `units.json` never collide. The plan's sets are **{1, 2, 3}**, then **{4, 5}**, then
**{6, 7}**: three at a time is what review and the shared machine can carry, Unit 5 comes before Unit 7 because the
scatter plot reuses the coordinate-plane work, and Unit 7 is last because it carries the finale. Only the register
commit is serial.

### Opening the tier (later, its own PR)

Set `tiers.pro.status` to `"open"` once no unit is planned. That is the only switch: the street switcher, the band
card, the teacher page's units, map and counts, the placement matrix and explainer (`proPlacementWords`), placement and
"Just Play" follow the data. What the opening PR still writes by hand: the course copy in the 13 locale files (two
streets, kindergarten to grade 5, the game list, the lock paragraph, the FAQ), the teacher page's list of what Pro
does not cover (from `proCoverage`), `units.json` `program.standards`, and a decisions entry.
