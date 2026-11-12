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
- **Launchpad tier** statement lock and audio item-form lock — Phase 2. (Placement rung
  *content* K.0–2.5 is already locked in `placement.json`, because an Explorer-seeded
  staircase can walk down into it.)
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

**Opening a tier.** `tiers.<tier>.status` is `"building"` or `"open"`. While building, the tier's steps,
band, street and teacher-page rows exist for the platform admin only; for everyone else the tier does not
exist. Set it to `"open"` and the street switcher, the band card, the teacher page and placement all pick
it up. A tier with no units does not exist at all, whatever its status.

**Placement.** `placement.json` `crosswalk.entryProfiles` is keyed by a unit's door,
`"<tier>-<unit>.1"`: `{ "Number": rung, "Algebra & Patterns": rung, "Shape & Measure": rung, "Data & Chance": rung }`.
A learner with any rung under 2.5 walks the Launchpad profiles once Launchpad is open and has at least one
(under the first profile: the tier's first step; else the first unit whose profile is not met; all met: the
Explorer welcome). Pro's profiles (`pro-<unit>.1`) continue the walk after Explorer's seven once Pro is open.
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
