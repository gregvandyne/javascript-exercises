# CS Quest — the plan we build

Synthesis of the three judged designs. Base = **TEACHER-FIRST** (highest total, and its delivery mechanism is the thing a
non-CS teacher needs and the hardest to retrofit). Grafted from KID-FIRST: the 4-digit quest code, "first level of every
chapter is always open" + Explorer/Pro naming, the Byte Crew, the two-tap Case-closed card, Quest Race at 1B, the
device-first path, capstone load control (one device per team, staggered starts), the build-time content lint and the
shifted-word profanity check, Model Mechanic "Game Balance", Skip level, per-level `csta` tags, the honest "with/without"
claim text, `brb:progress` design for phase 2. Grafted from STANDARDS-FIRST: the CI coverage test, the three evidence tiers
with stored 0-3 rubric marks, item-tagging discipline, capstone honesty about control-structure standards, random layouts
+ BFS solvability + "name it right" verdicts, the `lock` param, the practices matrix, Assign-unit with cadence and "Reset
to the CS Quest version", the `QUIZ_STEPS` flag, standards kept in data with JSON-LD alignment, the WYR prompts file, the
aggregate-only principal report, and the in-game impacts/HCI levels (Share or Shield, Design Lab personas, Fair Data).

Ground truth: `map-games.md`, `map-teach.md`, `csta.json` (44 ids). Repo at `dd603ce` (branch `wyr-react-contrast`).
Verified during synthesis: WYR `TAGS = brave think make animal food fast kind calm fun nature tech social`; kit core species
`oomba kid fox bunny frog bee`, `art-animals` adds `bear cat dog duck mouse owl penguin` (no robot, no raccoon);
`cleanScoreLabel` keeps commas and slashes (only control chars, profanity, personal-info and link-code patterns are
rejected); `CLASS_TABS` is a fixed list; `liveGameOf` is an export of `server/live/live-games.js`; `/vendor/data/` holds
`atlas-quest live-bank would-you-rather` (new pack folders `data-detective`, `inside-the-machine`, `packet-post`,
`robo-route` all sort after `atlas-quest`, so the kit-platform sample-folder test is unaffected).

Anything the platform must add is marked **PLATFORM** and consolidated in §11. Everything else is content or a game.

---

## 0. Decisions (contradictions resolved, in one place)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | How does a lesson open the game at the right chapter/band? | **Both**: a 4-digit **quest code** typed on an in-game keypad ships day one in every game (chapter, band, mode, level); **`BRB.params`** (PLATFORM, 5 allow-listed keys incl. `lock`) is the upgrade that skips the keypad and locks the chapter. Lesson step bodies print the quest code; the materialiser also fills `lesson_steps.options`. | "Press start" must not hinge on an SDK change; the lock makes "one step = one chapter = one gradebook cell" true once it lands. |
| D2 | Live warm-up in a grade-3 period? | Warm-up stays a 5-minute block, **Quest Race at 1B, Question Battle at 2**, but the plan page has two equal buttons: **Start warm-up (live)** and **Show questions on the projector** (hands-up, no join code). Lessons 1.1 and 1.2 default to the projector form; login gets 5 minutes, not 4. | All judges flagged the join-code warm-up at minute 4; projector mode costs nothing. |
| D3 | Exit tickets as quiz steps when `LIVE_HOMEWORK` is off? | **PLATFORM: a separate `QUIZ_STEPS` flag, default on**, gates quiz-step rendering and `/api/lessons/:cl/steps/:step/quiz`; `LIVE_HOMEWORK` keeps gating only "Set as homework". The materialiser keeps `cat` on items; with `QUIZ_STEPS` off it writes a text step "Exit ticket (paper or live)" and the plan page offers *Host exit ticket live* and the printable half-sheet. | Checked evidence needs quiz steps; homework semantics are a different legal question. |
| D4 | Student-visible steps | **Five**: *Today* (text: Do Now, big idea, discuss prompts; 17 min), *Warm-up (live)* (game step on the mode game; Play hidden), *Play: chapter* (game, 18), *Exit ticket* (quiz, 3), *In your own words* (question, 2). Minutes sum to 45. | Three "Mark done" text steps were noise; one is useful (kids read the Do Now). |
| D5 | Warm-up as a bound game step? | Yes (gradebook cell "Warm-up (live)"), with **PLATFORM** fixes: Host-live emits `mode=` via `liveGameOf`, and the student page hides *Play* on steps whose game is a `MODES` slug ("Your teacher hosts this live"). | Only way to bind the live run to a cell today. |
| D6 | Capstone load | Unit 7 is four periods; **one device per team** (pairs at 1B, threes at 2 → 10-15 teams), teams press *Start building* **when their sheet is approved** (staggered by design, not by halves), **paper prototyping is a first-class path** (half the teams build on paper in 7.2 rotation 1 and swap), the Quiz Show template on the build step (PLATFORM `lesson_steps.template`), a **Builder status** line on the plan page, and the program page says in plain words that unit 7 needs a school plan. | One serial runner and a $5/day site-wide pool. |
| D7 | What the capstone rubric claims | Rubric rows map to program-development and impacts ids only. **It does not claim 1B-AP-09/10, 2-AP-11/12** (the AI writes the code); those stay with Robo Route (unit 1) and are marked "builds toward" on the coverage map. | Honesty. |
| D8 | Standards primary only in unit 7 | Promoted so **no id depends on unit 7**: 1B-IC-20 primary in 3.3 and 6.2; 2-AP-16 primary in 6.3; 2-AP-15/18/19 primary in 2.2 (already). Unit 7 adds *Applied* evidence. | A school without a plan must still cover everything. |
| D9 | Level sharing | Robo Route Level Maker: tier 0 pass-the-device; tier 1 **level codes in a 28-symbol consonant alphabet** (14-26 symbols, typed on a symbol pad; a code *is* the level) with a **BFS solvability check** that computes par and refuses unsolvable levels; remix stamps "based on <code>". Class gallery = phase 2. No 6-digit seed codes (too small for a level). | Only codec that carries a real level without a server. |
| D10 | 2-AP-19 (documentation) in-game | **Comment chips with meaning**: band-2 "Document it" levels require each procedure to carry one of four per-level phrase chips and the verdict checks the phrase matches what the procedure does. No free-text note (tap-only rule). Primary evidence stays the 2.2/7.4 question steps. | Kid-first's one-word chip proved nothing; standards-first's free text broke tap-only. |
| D11 | 2-AP-10 (flowcharts for complex problems) | Three places: 1.1 plan cards (order pseudocode lines), Best Route Pro "**flowchart must match the program**" (the kid builds the flowchart from boxes/diamonds, the program is checked against it, incl. a maze-walker with a decision), and 7.1's 6-box flowchart of the game's main rule (a non-grid problem). Fix-It band 2 "build the flowchart first" builds toward it. | All three designs had only "order five boxes". |
| D12 | Pairs and per-student progress | Legend says **per class**; plans say "alternate who signs in" (odd lessons partner A, even lessons B); Standards tab counts the signed-in student only and says so. | Honest, zero platform work. |
| D13 | Unit order | Default 1→2→3→4→5→6→7; four published paths: **Full**, **Core 10**, **CS Ed Week**, and **Device-first** (5→1→2→3→4→6→7, with Fix-It ticket 3 "no sound" as the class's own device test). | Computing Systems first settles device routines. |
| D14 | 3.3 crowdsourcing | Collect with **paper slips (1B)** or a **WYR Live round or paper (2)**; counts go into Data Detective *My Data* via steppers; the whole class's charts are pooled on the projector. No site-wide `BRB.poll` (not class data). Survey mode for live sets = phase 2. | WYR Live counts cannot cross the sandbox automatically today. |
| D15 | In-game check | Every level played in **lesson mode** (quest code or params) ends with the **Case-closed card** (one 3-tile concept check from the level's `check` field + one confidence face). Its tally rides in the score label (`6/7 checks`) today and in `brb:progress` later. | Day-one formative evidence inside the existing label. |
| D16 | Bank subject `computing` | **Not in v1** (13 languages × 4 levels + pack rebuild + test relaxation). Sets are teacher sets. | Cost; sets give solo practice via "my sets". |
| D17 | WYR topics | **Two**: `tech` (20) and `online` (10), English fallback per item in the other 12 files, `cat.*` names in 13 languages, prompts + CSTA ids in a separate catalogue file; **PLATFORM** `/live?starter=` preselect. | 6.3 must be deterministic. |
| D18 | Game characters | **Byte Crew**: Bolt (Robo Route, custom SVG robot), Dot (Data Detective, kit `fox` + `dress` trench coat), Pim (Packet Post, `art-animals` `owl` with a satchel), Gizmo (Inside the Machine, `art-animals` `mouse` with goggles). Cameos on each other's title screens. Explorer/Pro names in-game; "Grades 3-5 / 6-8" only in teacher chrome. | Kids can name them; no shared save needed. |
| D19 | Stars and hints | 1 solved · 2 well made (par / fewest edits / fewest checks / no wrong claim) · 3 no tier-3 hint. Three hint tiers everywhere; **Skip level** after two failed runs (grey, 0 stars, unlocks the next). | Keeps weak pairs moving in 18 minutes. |
| D20 | In-game text | English keys via `window.<Game>I18n` → `Oomba.strings` under `rr. dd. pp. im.`; the 12 translations ship as `/vendor/data/<slug>/<version>/<lang>.js` packs built by one scaffold script; **budget ≤ 450 strings per game**; the per-game unit test enforces 13-locale parity and identical `{slots}`. | Seed tests block any level without 12 translations. |

---

## 1. Name and identity

- **Program: CS Quest.** Tagline "Computer science, one period at a time." Never translated (proper noun, like Oomba Live).
  Teacher-facing lesson titles are `CS Quest 1.2 · Again and again (Loops)` so they sort and search in a crowded library
  (≤ 100 chars). Program slug `cs-quest` (`/teachers/cs-quest`, `/teach/cs-quest`, `seed-lessons/cs-quest/`).
- **Games** (all `category: learning`, `featured: true`, `orientation: any`, `age_rating: everyone`, `cover` from `COVERS`,
  a real `covers.js` recipe each): **Robo Route** `robo-route` 🛤️ `mint`, `players_max 2`; **Data Detective**
  `data-detective` 🔎 `ocean`, `players_max 2`; **Packet Post** `packet-post` 📮 `gold`, `players_max 1`;
  **Inside the Machine** `inside-the-machine` 🔧 `night`, `players_max 1`.
- **The Byte Crew** (kid-facing frame; cameos, no shared save): Bolt the courier robot "does exactly what it is told";
  Dot the fox detective "never guesses without evidence" ("two clues is a hunch, five is a case"); Pim the owl postmaster of
  Netville; Gizmo the workshop mouse who opens machines. Kids never see "CS Quest" or standards codes; teachers see the badge
  "CS Quest · CSTA 1B/2".
- Bands: **Explorer** (grades 3-5, `1b`) and **Pro** (grades 6-8, `2`) inside the games; a toggle, not a lock, unless the
  teacher's params lock it; Explorer stars earned by a Pro player show as silver.

---

## 2. Scope and sequence

### 2.1 Units and paths

Seven units, **23 lessons per band** (46 lesson variants), each 45 minutes, same unit/lesson names in both bands.

| # | Unit | Lessons | Main tool | Primary ids 1B | Primary ids 2 |
|---|---|---|---|---|---|
| 1 | Think Like a Robot | 1.1-1.5 | Robo Route ch. 1-5 | AP-08, AP-09, AP-10, AP-11, AP-12 | AP-10, AP-11, AP-12, AP-13, AP-14 |
| 2 | Bug Hunters | 2.1-2.2 | Robo Route ch. 6-8 | AP-13, AP-15, AP-16, AP-17 | AP-15, AP-17, AP-18, AP-19 |
| 3 | Data Detectives | 3.1-3.3 | Data Detective | DA-06, DA-07, IC-20 | DA-08, DA-09, IC-22 |
| 4 | Packet Post | 4.1-4.3 | Packet Post | NI-04, NI-05 | NI-04, NI-05, NI-06, IC-23 |
| 5 | Inside the Machine | 5.1-5.3 | Inside the Machine | CS-01, CS-02, CS-03 | CS-01, CS-02, CS-03, DA-07 |
| 6 | Tech Choices | 6.1-6.3 | WYR Live `tech`/`online`, settings panel, Design Lab, Fair Data | IC-18, IC-19, IC-20, IC-21, AP-14 | IC-20, IC-21, IC-23, CS-01, AP-16 |
| 7 | Make Your Own Game | 7.1-7.4 | Builder (Quiz Show template) | AP-11, AP-13, AP-14, AP-15, AP-16, AP-17, IC-20 (Applied) | AP-10, AP-13, AP-15, AP-17, AP-18, AP-19, DA-09, IC-22 (Applied) |

Paths (each a one-click *Add to my library*): **Full** (23 periods); **Core 10** (1.2, 2.1, 3.1, 4.1, 5.2, 6.1, 7.1-7.4;
the page lists the ids it misses); **CS Ed Week** (1.1, 1.2, 2.1, 4.1, 6.1; no Builder); **Device-first** (5.2 first, then
5.1, 5.3, 1.x, 2.x, 3.x, 4.x, 6.x, 7.x). Unit 7 needs a school plan (§8.6).

### 2.2 The CS Quest period (every lesson)

| Clock | Segment | What happens | Fallback |
|---|---|---|---|
| 0:00-0:05 | Arrive, log in, Do Now | Login cards; the Do Now from the plan on the board (paper-answerable); teacher projects the plan page. | No devices: Do Now on paper, go to the unplugged twin |
| 0:05-0:10 | Warm-up | *Start warm-up (live)*: Quest Race (1B) / Question Battle (2), the lesson's 5 items, 15 s. Start at ~80% joined. Or *Show questions on the projector* (hands up). | projector form |
| 0:10-0:16 | Explore | Teacher opens the game at the chapter on the projector (mode `projector` = big tiles) and plays level 1 with the class calling moves. Script: 2 *Say this*, 1 *Do this*, 1 *Ask this*, the big-idea sentence, ≤ 5 vocabulary words on the learn card. | unplugged twin acted out |
| 0:16-0:34 | Play (18 min) | Students: Classes → lesson → *Play*. Game opens at the chapter (quest code / params). Pairs on one device at 1B (driver/navigator, *Swap!* banner every 3 levels), solo at 2. **Goal: 4 levels. Stretch: the chapter, then 3 stars.** Teacher circulates with look-fors. | unplugged twin stations |
| 0:34-0:40 | Discuss | Two prompts (turn-and-talk, then whole class), one "show me" on the projector. | same |
| 0:40-0:45 | Exit ticket + pack up | 3 MC items (quiz step, auto-marked) + one sentence (question step; sentence frame printed). Devices away. | printed half-sheet |

Rules printed once: the first two periods lose 3-5 minutes to login (run the Do Now longer, cut Discuss to one prompt,
**never the exit ticket**); early finishers always have the same two moves (*earn 3 stars* or *help a neighbour without
touching their screen*, a role); nothing depends on homework; alternate who signs in on shared devices.

### 2.3 Student-visible steps (what the materialiser creates per lesson)

| Step | kind | minutes | Content |
|---|---|---|---|
| Today | text | 17 | Do Now · big idea · the two discuss prompts (so kids can read them) |
| Warm-up (live) | game (`quest-race` at 1B, `question-battle` at 2) | 5 | "Your teacher hosts this live" (Play hidden: PLATFORM D5); binding gives the "Warm-up (live)" gradebook cell |
| Play: <chapter> | game (the CS game) | 18 | body: goal/stretch, **"Quest code 2 1 0 0"**, `options`, `standards` |
| Exit ticket | quiz (3 items with `cat`) | 3 | from the unit bank by item id (§6) |
| In your own words | question | 2 | the sentence prompt with its frame |

Variants: 6.1/6.3 Play = game step on `would-you-rather-live` (bound; unscored → done on participation); 7.1 Play =
three question steps (planning sheet); 7.2 Play = build step (`template: quiz`, prefill = the sheet's Builder message); 7.3
Play = text step (protocol) + question step (feedback tally); 7.4 Play = question step (credits & how-to).

---

## 3. Standards coverage

### 3.1 Matrix (every 1B and level-2 id). Bold = primary (taught, exit-ticket item tagged); plain = practised again.

| Id | Short | Lessons | Practising activity (game chapter / artefact) | Exit items | Rubric (Applied) |
|---|---|---|---|---|---|
| 1B-CS-01 | parts form a system | **5.1** | IM `parts` 1-6 (Build-a-Device; robot + light sensor) | 5.1 ×2 | — |
| 1B-CS-02 | hardware + software model | **5.1**, **5.3** | IM `hw-sw` 1-5 (A Tap Travels), `bits` as storage | 5.1 ×1, 5.3 ×3 | — |
| 1B-CS-03 | troubleshooting | **5.2** | IM `fixit` 1-7 | 5.2 ×3 | — |
| 1B-NI-04 | packets | **4.1** | PP `packets` 1-5, `routes` 1-4 | 4.1 ×3 | — |
| 1B-NI-05 | cybersecurity, personal info | **4.2**, **4.3**, 6.3 | PP `locks` 1-6, `tricks` 1-6, `ciphers` 1-3 (enrichment) | 4.2 ×3, 4.3 ×3 | — |
| 1B-DA-06 | organise/present data | **3.1**, **3.3** | DD `sort` 1-6, `chart` 1-5, `my-data` | 3.1 ×3, 3.3 ×1 | — |
| 1B-DA-07 | inference, prediction | **3.2**, **3.3** | DD `claims` 1-6, `my-data` 3 | 3.2 ×3, 3.3 ×1 | — |
| 1B-AP-08 | compare algorithms | **1.1**, 2.1 | RR `sequences` 5-6 (two routes), `best-route` 1-5 | 1.1 ×1 | — |
| 1B-AP-09 | variables | **1.4** | RR `variables` 1-6 | 1.4 ×3 | — |
| 1B-AP-10 | seq, events, loops, cond | **1.1**, **1.2**, **1.3** | RR `sequences`, `loops`, `conditionals` (incl. `when` events) | 1.1 ×2, 1.2 ×3, 1.3 ×3 | builds toward (7.2) |
| 1B-AP-11 | decompose | **1.5**, 1.1, **7.1** | RR `functions` 1-6, `sequences` 6 (legs card); planning sheet | 1.5 ×2, 7.1 ×1 | Plan |
| 1B-AP-12 | modify/remix | **1.5**, 2.2 | RR `functions` 4-5 (starter-block shelf remix), `level-maker` remix | 1.5 ×1 | — |
| 1B-AP-13 | iterative plan, perspectives | **2.2**, **7.1** | Level Maker plan→build→test→fix; planning sheet | 2.2 ×1, 7.1 ×1 | Plan |
| 1B-AP-14 | IP, attribution | **6.3**, **7.4** | Credit Card sort; credits screen | 6.3 ×1, 7.4 ×1 | Explain & credit |
| 1B-AP-15 | test and debug | **2.1**, **7.2**, **7.3** | RR `debug` 1-7; Builder fix log | 2.1 ×3, 7.2 ×3, 7.3 ×1 | Test with others |
| 1B-AP-16 | roles | **2.2**, 1.2, **7.1** | designer/tester roles; pair mode Swap banner | 2.2 ×1, 7.1 ×1 | Plan |
| 1B-AP-17 | describe choices | **2.2**, **7.4** | designer's note (question step); 60-s demo | 2.2 ×1, 7.4 ×2 | Explain & credit |
| 1B-IC-18 | tech changed the world | **6.1** | WYR `tech`; Timeline Walk | 6.1 ×3 | — |
| 1B-IC-19 | accessibility brainstorm | **6.2** | settings-panel audit; IM `design-lab` 1-3 | 6.2 ×2 | — |
| 1B-IC-20 | seek diverse perspectives | **3.3**, **6.2**, **7.3** | "is our claim fair?" pair swap; audit-sheet swap; 2 stars & a wish | 3.3 ×1, 6.2 ×1, 7.3 ×2 | Test with others |
| 1B-IC-21 | public domain / CC | **6.3**, 7.4 | Credit Card sort; credits screen | 6.3 ×2 | Explain & credit |
| 2-CS-01 | device design from user analysis | **6.2**, **5.1** | IM `design-lab` 3-5 (personas), `gadget` user quotes | 6.2 ×1, 5.1 ×1 | — |
| 2-CS-02 | HW+SW projects that collect data | **5.1** | IM `gadget` 1-5 | 5.1 ×2 | — |
| 2-CS-03 | systematic troubleshooting | **5.2** | IM `fixit` 1-7 (connected devices, swap test, flowchart) | 5.2 ×3 | — |
| 2-NI-04 | protocols | **4.1** | PP `routes` 1-6, `protocols` 1-6 | 4.1 ×3 | — |
| 2-NI-05 | physical & digital security | **4.2**, 4.3 | PP `locks` 1-7 (physical/digital sort, HTTPS street) | 4.2 ×2 | — |
| 2-NI-06 | encryption | **4.3** | PP `ciphers` 1-7 | 4.3 ×3 | — |
| 2-DA-07 | encoding schemes | **5.3** | IM `bits` 1-7 | 5.3 ×3 | — |
| 2-DA-08 | collect & transform | **3.1**, **3.3** | DD `cleanup` 1-6, `my-data` | 3.1 ×3, 3.3 ×1 | — |
| 2-DA-09 | refine models | **3.2**, **7.3** | DD `models` 1-5 (Game Balance); playtest tally → one change | 3.2 ×3, 7.3 ×1 | Test with others |
| 2-AP-10 | flowcharts / pseudocode | **1.1**, **7.1**, 2.1 | RR `sequences` plan cards, `best-route` flowchart-match; 6-box flowchart; Fix-It flowchart (builds toward) | 1.1 ×2, 7.1 ×1 | Plan |
| 2-AP-11 | named variables, types | **1.4** | RR `variables` 1-6 ("name it right" verdict) | 1.4 ×3 | builds toward (7.2) |
| 2-AP-12 | nested loops, compound cond | **1.2**, **1.3** | RR `loops` 5-8, `conditionals` 4-7 (random layouts) | 1.2 ×3, 1.3 ×3 | builds toward (7.2) |
| 2-AP-13 | decompose | **1.5**, 1.1, **7.1** | RR `functions` 5-7, `sequences` 6; planning sheet parts | 1.5 ×1, 7.1 ×1 | Plan |
| 2-AP-14 | procedures with parameters | **1.5** | RR `functions` 3-7 | 1.5 ×2 | — |
| 2-AP-15 | feedback from users | **2.2**, **7.3** | tester feedback → fix; playtest tally | 2.2 ×1, 7.3 ×1 | Test with others |
| 2-AP-16 | incorporate existing code/media + credit | **6.3**, **7.4**, 1.5 | RR `functions` 7 (credited shelf block); credits | 6.3 ×1, 7.4 ×1 | Explain & credit |
| 2-AP-17 | systematic testing | **2.1**, **7.2** | RR `debug` 1-7 (3 test grids), `best-route` bigger-map test | 2.1 ×3, 7.2 ×3 | Test with others |
| 2-AP-18 | tasks and timeline | **2.2**, **7.1** | 3-line timeline card; roles + 3-period timeline | 2.2 ×1, 7.1 ×1 | Plan |
| 2-AP-19 | document programs | **2.2**, **7.4** | RR `functions` 6-7 "Document it" chips; level note; how-it-works | 2.2 ×1, 7.4 ×2 | Explain & credit |
| 2-IC-20 | tradeoffs, careers | **6.1** | WYR `tech`; T-chart | 6.1 ×3 | — |
| 2-IC-21 | bias & accessibility | **6.2** | DD `fair` 1-4; IM `design-lab` 5 | 6.2 ×2 | — |
| 2-IC-22 | crowdsourcing / surveys | **3.3**, **7.3** | class survey pooled; playtest tally from many testers | 3.3 ×2, 7.3 ×1 | Test with others |
| 2-IC-23 | public vs private | **6.3**, **4.2** | PP `locks` 7 Share or Shield, `tricks` 9-10; WYR `online` | 6.3 ×2, 4.2 ×1 | — |

All 21 + 23 ids have a primary lesson outside unit 7, a practising activity, and ≥ 1 tagged exit item in their band.
Extension-only: binary at 1B (IM `bits`), ciphers at 1B (PP `ciphers` 1-3). "Builds toward" never counts as evidence.

### 3.2 Practices spread (from the primary ids' `practiceCodes`)

| Practice | U1 | U2 | U3 | U4 | U5 | U6 | U7 |
|---|---|---|---|---|---|---|---|
| P1 Inclusive culture | | 1B-AP-13, 2-AP-15 | 1B-IC-20 | | | 1B-IC-19, 1B-IC-20, 2-IC-21 | 1B-AP-13, 1B-IC-20, 2-AP-15 |
| P2 Collaborating | | 1B-AP-16, 2-AP-15, 2-AP-18 | 2-IC-22 | | | | 1B-AP-16, 2-AP-18, 2-IC-22 |
| P3 Defining problems | 1B-AP-08, 1B-AP-11, 2-AP-13 | | | 1B-NI-05 | 2-CS-01 | 1B-IC-18, 2-CS-01 | 1B-AP-11, 2-AP-13 |
| P4 Abstractions | 2-AP-10, 2-AP-14 | | 2-DA-09 | 1B-NI-04, 2-NI-04, 2-NI-06 | 1B-CS-02, 2-DA-07 | 2-AP-16 | 2-AP-10, 2-DA-09, 2-AP-16 |
| P5 Creating artifacts | 1B-AP-09, 1B-AP-10, 1B-AP-12, 2-AP-11, 2-AP-12 | 1B-AP-13 | 2-DA-09, 2-IC-22 | | 2-CS-02 | 1B-AP-14, 2-AP-16 | 1B-AP-13, 1B-AP-14, 2-IC-22 |
| P6 Testing & refining | 1B-AP-08 | 1B-AP-15, 2-AP-17 | 2-DA-08 | | 1B-CS-03, 2-CS-03 | | 1B-AP-15, 2-AP-17 |
| P7 Communicating | | 1B-AP-17, 2-AP-19 | 1B-DA-06, 1B-DA-07 | 2-NI-05, 2-IC-23 | 1B-CS-01 | 1B-IC-21, 2-IC-20, 2-IC-23 | 1B-AP-17, 2-AP-19 |

Every practice appears in ≥ 3 units; P4, P5 and P7 in six. The CI test (§9.5) recomputes this table from the data.

---

## 4. The lessons (23, each with both bands)

Format: standards (bold = primary) · I can · quest code / params · vocabulary · Do Now · warm-up · Explore script ·
Play (chapter, goal) · look-fors + misconception · Discuss · Exit (item ids from §6 + sentence) · differentiation ·
unplugged twin · sub plan · notes. Catalogue keys `csq-1b-1.2` / `csq-2-1.2`. Quest codes are `C B M L` = chapter index,
band (1 Explorer / 2 Pro), mode (0 play, 1 debug, 2 maker/tool, 3 projector), level (0 = first unfinished). The teacher's
*Open game at this chapter* uses mode 3 (projector: big tiles, no save). Steps per lesson are §2.3 unless stated.

### Unit 1 · Think Like a Robot (Robo Route)

#### 1.1 Step by step — sequences, comparing routes
| | Explorer (1B) | Pro (2) |
|---|---|---|
| Standards | **1B-AP-10** (sequence), **1B-AP-08**, 1B-AP-11 | **2-AP-10**, **2-AP-13** |
| I can | order steps so Bolt reaches the goal; compare two routes and say which is better and why; split a long route into legs | write a plan (pseudocode lines / flowchart) before I program; split a route into sub-routes; compare routes by step count |
| Quest code / params | `1 1 0 0` / `chapter=sequences&band=1b&lock=1` | `1 2 0 0` / `chapter=sequences&band=2&lock=1` |

Vocabulary: algorithm, sequence, step; (2) pseudocode, flowchart. **Do Now:** "Write the steps to make a sandwich. Swap: could
a robot follow them?" **Warm-up:** projector form by default (first period). **Explore:** *Do this:* be the robot; a
volunteer reads the sandwich steps literally. *Say this:* "A computer does exactly what the steps say, in order." *Do
this:* level 1 on the projector, class calls forward / turn left. *Ask this:* "Does turning move Bolt?" (no: in-place spin
with a sound). Big idea on the learn card: "An algorithm is a list of steps in order." **Play:** ch. 1 Sequences, 6
levels; 1B 6×6 with a ghost path on 1-2; 2 8×8, plan card on 3-6 (order the pseudocode lines before the shelf unlocks),
levels 5-6 have two valid routes and a par. Goal 4 levels. **Look-fors:** turn-vs-move confusion (misconception of the
day); kids who count squares from the wrong tile (floor numbers help at 1B). **Discuss:** 1B "Two routes both worked:
which is better and why (shorter, fewer turns, avoids the puddle)?"; 2 "Did writing the plan first help or slow you
down? When would it help most?" **Exit:** 1B `1b-1.1-e1..e3` (1B-AP-10, 1B-AP-10, 1B-AP-08); 2 `2-1.1-e1..e3` (2-AP-10,
2-AP-10, 2-AP-13). Sentence: "An algorithm is ___." **Differentiation:** support: tap-to-add, ghost path, read-aloud;
stretch: par stars, level 6 "three legs" card (name the legs: 1B-AP-11 / 2-AP-13). **Unplugged twin: Paper Robot** (grid
mats, arrow cards, partner reads aloud; "two routes" race). **Sub plan:** Do Now on paper → chapter 1 (any band, signed
out is fine) → paper exit ticket. **Notes:** turning does not move the robot; the game makes a turn visible.

#### 1.2 Again and again — loops (the exemplar; every plan page carries this level of detail)
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-10** (loops); 1B-AP-16 (roles) | **2-AP-12** (nested loops) |
| I can | spot steps that repeat and replace them with a *repeat* block; say how many times a loop runs | use a loop inside a loop; explain what each loop repeats; predict how many steps a nested loop makes |
| Quest code / params | `2 1 0 0` / `chapter=loops&band=1b&lock=1` | `2 2 0 0` / `chapter=loops&band=2&lock=1` |

Vocabulary: loop, repeat, times, pattern; (2) nested, inner/outer. Materials: standard list + *Loop Cards* printable + a
chime for pair swaps.
- **0:00-0:05** Board: "Write something you do again and again at school. How many times a day?" Teacher projects the plan
  page and presses *Show questions on the projector* (first weeks) or *Start warm-up (live)*.
- **0:05-0:10 Warm-up** `1b-1.1-e1`, `1b-1.1-e2` (retrieval), `1b-1.2-r1` (vocabulary), `1b-1.2-e1` (preview), `1b-1.1-r1`.
- **0:10-0:16 Explore.** Level 1 is a straight corridor of 6 squares. *Do this:* ask for the program; add six *forward*;
  run it. *Say this:* "That works. A programmer would be annoyed: we wrote the same thing six times." *Do this:* delete
  five, tap *repeat*, tap *Wrap* around the remaining *forward*, set the stepper to 6, run. *Ask this:* "What does the
  number mean? What if I put 7?" (run it: Bolt bumps the wall; the caption says "Bump! One too many."). Big idea: "A loop
  repeats steps so we do not have to write them again." (2 only) Level 2 is a square (repeat 4 {forward 3, turn right});
  then the staircase: "the inner loop makes one stair; the outer loop makes the staircase."
- **0:16-0:34 Play.** 1B pairs, driver/navigator, *Swap!* every 3 levels; the navigator holds the Loop Cards and must say
  the loop in words before the driver builds it (1B-AP-16). 2 solo; levels 1-4 single loops, 5-8 nested, 8 is a par
  challenge. Look-fors: the *repeat* placed after the steps instead of around them; miscounted squares. Misconception: the
  number on a loop is how many times the whole bracket runs, not the number of squares.
- **0:34-0:40 Discuss.** 1: "Show me a level where a loop saved you the most blocks" (count with and without). 2 (1B):
  "Where else do loops happen: songs, dances, a day?" (2): "In the staircase, how many *forward* steps actually ran? Show
  the multiplication."
- **0:40-0:45 Exit.** 1B `1b-1.2-e1..e3`; 2 `2-1.2-e1..e3`. Sentence: "A loop ___, and programmers like it because ___."
Differentiation: support: 1B repeat count pre-set on levels 1-2, hint 1 highlights the repeating blocks, read-aloud;
stretch: 3-star par everywhere, level 7/8. Unplugged twin **Loop Cards** (15 min: 6×6 paper grid, arrow cards, three
*repeat* bracket cards with a number dial; "shrink the program" round; 2: a nested staircase card). Sub plan: Do Now →
chapter Loops in pairs → paper exit ticket (no warm-up, no projector needed). Notes: off-by-one bumps are the lesson's
best moments ("Bolt did exactly what you said"); most pairs reach level 5 of 7 in 18 minutes: that is success.

#### 1.3 If this, then that — conditionals and events
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-10** (conditionals, events) | **2-AP-12** (compound conditionals) |
| I can | use *if* so Bolt decides for itself; use a *when* block so something happens on an event | combine conditions with AND / OR / NOT; nest an *if* inside a loop |
| Quest code / params | `3 1 0 0` / `chapter=conditionals&band=1b&lock=1` | `3 2 0 0` / `chapter=conditionals&band=2&lock=1` |

Vocabulary: condition, if/else, event, sensor; (2) AND, OR, NOT, compound. **Do Now:** "If it rains at recess, then ___.
Write two more if-then sentences about today." **Warm-up:** `1b-1.2-e1`, `1b-1.2-e2`, `1b-1.3-r1`, `1b-1.3-e1`, `1b-1.2-r1`
(2: the `2-` twins; same rule for every lesson from here on). **Explore:** level 1 has fog: Bolt cannot see if the path
ahead is open, so the program must say *if path ahead: forward, else: turn*. *Do this:* run a fixed sequence first; it
fails on the second layout (random layouts: levels marked `random` run on 3 seeded layouts). *Say this:* "A conditional
lets the program choose." *Do this:* the event level: *when gem collected → open door*. *Ask this:* "What is the
difference between *if* and *when*?" Big idea: "A conditional chooses; an event lets the world start a piece of program."
**Play:** ch. 3, 7 levels (1B: if/else, *if on paint*, *when bumped*; 2: *if has key AND touching door*, *if NOT wall
ahead OR gem left*, an *if* inside a loop that solves any maze). **Look-fors:** kids read *if* as a one-time check (step
mode shows the check on every loop pass). **Discuss:** "What question did Bolt ask in level 4?"; 2 "Write the door rule
in English, then as blocks." **Exit:** `1b-1.3-e1..e3` / `2-1.3-e1..e3`. Sentence: "If ___ then Bolt ___." **Diff.:**
support: condition tiles are pictures + words; stretch: one program that solves three different mazes. **Twin: If-Hat**
(the caller wears the hat: "if I clap, hop"; 2 compound round). **Sub plan** as 1.1. **Notes:** events are a condition on
the world; the `when` header sits above the program.

#### 1.4 Counting and remembering — variables
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-09** | **2-AP-11** |
| I can | use a variable to count things and change it as the program runs | name variables clearly; use number, on/off and word variables; do operations on them |
| Quest code / params | `4 1 0 0` / `chapter=variables&band=1b&lock=1` | `4 2 0 0` / `chapter=variables&band=2&lock=1` |

Vocabulary: variable, value, set to, change by; (2) data type, name, boolean. **Do Now:** "The score in your favourite
game: what makes it go up? go down?" **Explore:** level 1 needs 5 gems before the door opens: `set gems to 0`, in a loop
`if on gem: change gems by 1`, `if gems = 5: open`. The *watch* pill ticks up on the projector. *Say this:* "A variable is
a labelled box the program can look in and change." *Ask this:* "What is in the box right now?" **Play:** ch. 4, 6 levels
(1B: a `count` box and a `lives` box; 2: the **name it right** levels: the shelf offers `x`, `thing`, `gemsLeft`,
`doorOpen` and the verdict rejects single-letter and meaningless names and says why; three types: number `gems`, flag
`hasKey`, word `colour` from a list; level 6 "the badly named program": rename so a partner can read it). **Look-fors:**
*set* vs *change* (the box empties and refills vs a +1 pops out). **Discuss:** "What did the box hold at the end? Show the
watch pill." 2 "Why is `x` a bad name? Who pays for it?" **Exit:** `1b-1.4-e1..e3` / `2-1.4-e1..e3`. Sentence: "A variable
is like ___ because ___." **Diff.:** support: watch pill always on; stretch: countdown level. **Twin: Variable Jars**
(labelled jars, counters, cards "change gems by 2"; 2 a yes/no jar). **Sub plan** as usual.

#### 1.5 Build a block — functions, decomposition, remix
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-11**, **1B-AP-12** | **2-AP-14**, **2-AP-13**, 2-AP-16, 2-AP-19 |
| I can | break a big route into named parts; reuse a part I (or the shelf) made and change it | make a procedure with a parameter so one block does many jobs; use a shared block and credit where it came from; label what each block does |
| Quest code / params | `5 1 0 0` / `chapter=functions&band=1b&lock=1` | `5 2 0 0` / `chapter=functions&band=2&lock=1` |

Vocabulary: function (My Block), define, call; (2) parameter, argument, reuse, comment. **Do Now:** "Name three things
'get ready for school' is made of." **Explore:** level 1 is four identical rooms; make *My Block: Room* once, call it four
times; (2) rooms of different lengths → `Room(steps)`. *Say this:* "Name a group of steps once, use it everywhere." *Ask
this:* "What would you name this block so a friend understands it?" **Play:** ch. 5 (1B 6 levels: define/call; levels
4-5 use the *Starter blocks* shelf: two pre-made blocks to **remix** (change one step, keep the "based on" line; 1B-AP-12);
2 7 levels: parameters from level 3, level 5-6 "three subgoals" decomposition (verdict needs three procedures), level 6-7
**Document it** (each procedure carries one of four phrase chips; the verdict checks the chip matches the procedure;
2-AP-19), level 7 uses a shelf block "Zigzag by the Robo Route team" whose credit line must stay on (2-AP-16)).
**Look-fors:** defining a block and never calling it (Run is dimmed until a call exists and the hint says why).
**Discuss:** "Which part of your program deserved a name? Why that one?" 2 "What changed when you added the parameter?"
**Exit:** `1b-1.5-e1..e3` / `2-1.5-e1..e3`. Sentence: "I split ___ into ___ and ___." **Diff.:** support: 1B levels 1-2
pre-define the block, the kid only calls it; stretch: one 2-parameter block solves the level. **Twin: Dance Blocks**
(groups invent a 4-move dance, name it; class calls `Spin!`, `Hop(2)!`). **Sub plan** as usual.

### Unit 2 · Bug Hunters (Robo Route)

#### 2.1 Bug hunt — test and debug
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-15**; 1B-AP-08 | **2-AP-17**; 2-AP-10 (flowchart twin) |
| I can | find and fix a mistake in a program (mine or someone else's); test before I say "done" | test one program against several test grids; find the input that breaks it; fix without breaking the others |
| Quest code / params | `6 1 1 0` / `chapter=debug&band=1b&mode=debug&lock=1` | `6 2 1 0` / `chapter=debug&band=2&mode=debug&lock=1` |

Vocabulary: bug, debug, test, expected vs actual; (2) test case, edge case. **Do Now:** "Find the mistake: 2 + 2 = 5; Teh
cat; a printed route with one wrong turn." **Explore:** a broken program on the projector (Bolt walks into the lake).
*Do this:* step mode, one block at a time; the class says "stop!" when it goes wrong. *Say this:* "Programs break; good
programmers expect it and test." *Ask this:* "What did we expect? What actually happened?" **Play:** ch. 6 Debug Lab, 7
levels with a given `starter` program (1B: one bug each: wrong turn, loop count off by one, missing block, wrong
condition; 2: three test grids per level, level 6 an empty-maze edge case, level 7 "must not bump on any"). Stars count
edits: fewest edits = 3 stars. **Look-fors:** kids deleting everything instead of stepping. **Discuss:** "What was the bug
in level 5 and how did you find it? Show step mode." 2 "Which test grid caught your bug?" **Exit:** `1b-2.1-e1..e3` /
`2-2.1-e1..e3`. Sentence: "I expected ___ but Bolt ___, so I ___." **Diff.:** support: hint 1 highlights the block where
expected and actual first differ; stretch: ch. 7 Best Route (1B-AP-08 / 2-AP-10 flowchart-match). **Twin: Bug Cards**
(printed programs with one bug each + grid mats; fix with a sticker). **Sub plan** as usual (debug mode works signed out).

#### 2.2 Level designers — plan, build, test with a partner, explain
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-13**, **1B-AP-16**, **1B-AP-17**; 1B-AP-12 | **2-AP-15**, **2-AP-18**, **2-AP-19** |
| I can | plan a level on paper first; take a role (designer / tester); explain a design choice | plan with a timeline and split roles; get tester feedback and change my level; write a level description |
| Quest code / params | `8 1 2 0` / `chapter=level-maker&band=1b&mode=maker&lock=1` | `8 2 2 0` / `chapter=level-maker&band=2&mode=maker&lock=1` |

Vocabulary: plan, tester, feedback; (2) iteration, documentation, timeline. **Do Now:** "Draw a tiny 4×4 maze on the printed
grid: start, goal, one trap." **Explore:** Level Maker on the projector: paint walls, place gems and the goal, press
**Check** (the BFS proves it is solvable and shows par; it refuses an unsolvable level and says why), *Test with a friend*
hands the device over, the **level code** appears. *Say this:* "Plan, build, test with someone else, improve, explain."
**Play as a mini-project:** 6 min build from the paper plan → 6 min swap roles (designer silent, tester plays and says one
fun thing and one confusing thing) → 6 min fix + the one-line designer's note (question step). Sharing: pass the device
(tier 0) or type the code on the tester's device (tier 1). 2 pairs keep the 3-line timeline card (build by 6, test by 12,
fix by 18: 2-AP-18) and remix a classmate's code keeping "based on <code>" (2-AP-16 practice). **Look-fors:** designers
"helping" the tester (role card says silent). **Discuss:** "What did your tester find that you did not expect?" **Exit:**
`1b-2.2-e1..e3` / `2-2.2-e1..e3`. Sentence (1B-AP-17 / 2-AP-19): "In my level I chose ___ because ___." **Diff.:** support:
6×6, three object types; stretch: a level that needs a loop for 3 stars (set the block budget). **Twin:** paper mazes
swapped between pairs (whole lesson works on paper). **Sub plan:** paper mazes. **Notes:** the maker never asks for text;
level names do not exist; codes carry grid cells only.

### Unit 3 · Data Detectives (Data Detective)

#### 3.1 Sort it out — organise data to answer a question
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-DA-06** | **2-DA-08** |
| I can | sort and group data so a pattern shows; choose the view that answers the question | clean a messy data set (typos, duplicates, impossible values) and transform it (counts → percentages) |
| Quest code / params | `1 1 0 0` / `chapter=sort&band=1b&lock=1` | `4 2 0 0` / `chapter=cleanup&band=2&lock=1` |

Vocabulary: data, table, sort, group; (2) clean, outlier, percent. **Do Now:** "Most common shoe colour in this room: how
could we find out fast?" **Explore:** Case 1 *The Missing Lunchbox* (10 rows: who, where, when). *Ask this:* "Which column
should we sort by?" Sort by time; the answer pops; Dot says "two clues is a hunch, five is a case." *Say this:* "Data is
facts in rows; sorting and grouping make the answer visible." Rule shown on screen: **you cannot pin a claim until the
view on screen supports it** ("Show me"). **Play:** 1B ch. 1 Sort & Group (6 cases: table → sort/group → view → claim);
2 ch. 4 Clean-Up Crew (6 cases: "12 pets", "dog / Dog / d0g" rows: fix / merge / remove; convert counts to % before
comparing classes of different sizes; star for never removing a good row). **Look-fors:** sorting by the first column by
habit. **Discuss:** "Which view answered fastest?" 2 "What would have gone wrong if we kept the messy rows?" **Exit:**
`1b-3.1-e1..e3` / `2-3.1-e1..e3`. Sentence: "The data showed ___ because ___." **Diff.:** support: cases 1-3 glow the
right column; stretch: cases with two questions needing different sorts. **Twin: Human Bar Chart** (line up by fruit, sort
tallest-first; 2 add three messy cards). **Notes:** charts are DOM bars with printed values (projectors and screen readers).

#### 3.2 What does the data say? — claims, predictions, models
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-DA-07** | **2-DA-09** |
| I can | use data to support a claim or a prediction; say when there is not enough data | test a model's prediction against results and refine the model |
| Quest code / params | `3 1 0 0` / `chapter=claims&band=1b&lock=1` | `5 2 0 0` / `chapter=models&band=2&lock=1` |

Vocabulary: claim, evidence, predict; (2) model, simulation, refine. **Do Now:** "It rained the last 3 Mondays. Will it
rain next Monday? How sure?" **Explore:** *The Plant Race*: height per day; "Predict day 10"; then the trap case with two
points: "Can we tell? What would we need?" *Say this:* "A claim needs enough good data behind it." **Play:** 1B ch. 3 Clues
& Claims (6 cases: supported / not supported / can't tell yet; predict the next bar with a slider; two cases with an
irrelevant column); 2 ch. 5 Model Makers (5 cases: ramp "distance = 2 × height" slider rule; run 5 trials, compare, refine;
plant model; case 5 **Game Balance**: tune a runner's jump so about 80% of 20 seeded test runs finish). **Look-fors:**
claims the chart does not show. **Discuss:** "Which case tricked you? Why was 'can't tell' right?" 2 "How many trials
before you trusted your rule?" **Exit:** `1b-3.2-e1..e3` / `2-3.2-e1..e3`. Sentence: "The chart says ___, so I predict
___." **Diff.:** support: claim tiles with pictures; stretch: distractor-column cases. **Twin: Paper Predictions** (10-roll
die tally, predict the next 10; 2 a paper ramp rule card). **Notes:** Game Balance previews the capstone playtest.

#### 3.3 Our class survey — collect, chart, claim
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-DA-06**, **1B-DA-07**, **1B-IC-20** | **2-DA-08**, **2-IC-22**; 2-DA-09 |
| I can | collect data from the whole class, chart it and make a claim others agree is fair | design a 3-question survey, collect from many people, clean and chart, report a finding |
| Quest code / params | `7 1 2 0` / `chapter=my-data&band=1b&mode=tally&lock=1` | `7 2 2 0` / `chapter=my-data&band=2&mode=tally&lock=1` |

Vocabulary: survey, tally, category; (2) sample, bias, respondent. **Do Now:** board vote with tally marks: pets — dog /
cat / other / none. **Explore:** *My Data*: the teacher enters the tallies with steppers (labels from preset lists), the
chart appears, the class picks a fair claim. *Say this:* "Real data comes from real people; collecting it well is half the
job." **Play:** pairs run a 2-question survey of the class (printed slips; 1B uses the two provided questions; 2 writes
three with one deliberately leading question to fix; 2 may run one question as a WYR Live round and read the counts),
enter numbers in *My Data*, choose the chart, pick/compose the claim; 2 also loads the provided "another class" set and
compares by %. **1B-IC-20:** before finishing, each pair asks another pair "is our claim fair?" and records yes/no + one
reason (question step). **2-IC-22:** every pair's chart is pooled on the projector ("crowdsourced"). **Discuss:** "Did
everyone's chart say the same thing? Why not?" 2 "Which question was leading and how did you fix it?" **Exit:**
`1b-3.3-e1..e3` / `2-3.3-e1..e3`. Sentence: "Our claim is ___; another pair said ___." **Diff.:** provided questions and
tally sheets; stretch: a claim with two charts. **Twin:** tally sheets + grid paper (fully unplugged). **Notes:** no
no-right-answer poll exists in live sets today (phase 2).

### Unit 4 · Packet Post

#### 4.1 How a message travels — packets, routes, protocols
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-NI-04** | **2-NI-04** |
| I can | explain that a message is cut into packets that travel different paths and are put back together | explain what a protocol is for: numbering, acknowledging, re-sending, choosing a path |
| Quest code / params | `1 1 0 0` / `chapter=packets&band=1b&lock=1` | `3 2 0 0` / `chapter=protocols&band=2&lock=1` |

Vocabulary: packet, network, route, router, reassemble; (2) protocol, acknowledge, resend, checksum. **Do Now:** "How does a
picture get from your tablet to your grandma's phone? Draw it in 3 boxes." **Explore (unplugged first, 6 min): Envelope
Relay** — a printed picture cut into 4 numbered pieces, four "routers" (kids at desks), pieces sent along different kids,
reassembled by number; round 2 the teacher "loses" an envelope (2: the receiver must *ask* for piece 3 again = the
protocol). *Say this:* "The internet cuts everything into packets, sends them many ways, and the rules put them back
together." **Play:** 1B ch. 1 Break It Up (5) then ch. 2 Many Roads (first 4: a road closes mid-send, reorder by number);
2 ch. 2 (6) then ch. 3 Rules of the Road (6: ACK cards "got 1, got 2, got 4" → resend 3; duplicates; "count the dots"
checksum; choose the faster path past a busy office; order the 5 rule cards). **Discuss:** "What happened when the road
closed? Did the message still arrive?" 2 "What would happen with no numbers on the packets?" **Exit:** `1b-4.1-e1..e3` /
`2-4.1-e1..e3`. Sentence: "A packet is ___." **Diff.:** support: 3-packet levels with a glowing best path; stretch:
rush-hour levels. **Twin:** the Envelope Relay is the twin. **Notes:** say "many computers and cables", not "the cloud"; no
real site names on the board (the game cannot show URLs either).

#### 4.2 Lock it up — passphrases, private information, physical and digital security
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-NI-05** | **2-NI-05**, **2-IC-23** |
| I can | say what is private; build a strong passphrase and keep it to myself; name ways to protect a device | explain how physical and digital measures protect information and why; weigh public vs private |
| Quest code / params | `4 1 0 0` / `chapter=locks&band=1b&lock=1` | `4 2 0 0` / `chapter=locks&band=2&lock=1` |

Vocabulary: private, passphrase, backup; (2) firewall, HTTPS, two-step, physical vs digital. **Do Now:** "Which would you
NOT tell a stranger: favourite colour, address, pet's name, birthday? Why?" **Explore:** the *Passphrase Builder*: pick
four word tiles (never typed); the strength meter's "guess time" grows from seconds to centuries. *Ask this:* "Why is
`password1` weak even with a number?" *Say this:* "Protect your stuff online like at home: lock it, keep the key, keep a
spare copy." **Play:** ch. 4 Lock It (1B 6 levels: share/keep sort, builder, "where does the spare key (backup) live?",
"who may you tell?" scenarios, reuse-is-risky; 2 7 levels: 12 measures → physical / digital, the HTTPS street (sealed vs
open envelopes to shops), router password, the backup rule, and level 7 **Share or Shield**: six pieces of information
with a benefit and a risk each; decide public/private and pick the reason tile; 2-IC-23). **Discuss:** "What makes a
passphrase strong *and* easy to remember?" 2 "Why is a locked door a cybersecurity measure?" **Exit:** `1b-4.2-e1..e3` /
`2-4.2-e1..e3`. Sentence: "I keep ___ private because ___." **Diff.:** support: picture scenario tiles; stretch: 1B bonus
"Password Detective". **Twin: Lock Sort** cards + the four-word passphrase dice game. **Notes:** never ask kids to say or
type real passwords (the game never does; the scanner forbids that wording).

#### 4.3 Secret messages — spotting tricks, ciphers
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-NI-05** (tricks; cipher = enrichment) | **2-NI-06**; 2-NI-05, 2-IC-23 |
| I can | spot the signs of a trick message and tell a grown-up; (fun) make a Caesar message | encode/decode with two or more methods and say which is harder to crack and why |
| Quest code / params | `5 1 0 0` / `chapter=tricks&band=1b&lock=1` | `6 2 0 0` / `chapter=ciphers&band=2&lock=1` |

Vocabulary: trick/phishing, cipher, key; (2) encryption, decrypt, steganography, brute force. **Do Now:** "A message says
'You won a free tablet! Reply with your password to claim it.' What do you do?" **Explore:** *Spot the Trick* inbox on the
projector: the class votes safe/trick on three cards; then the Caesar wheel (turn it 3, read the message). Big idea (1B):
"Real companies never ask for your password; when in doubt, ask a grown-up." (2): "Encryption scrambles a message so only
someone with the key can read it; some scrambles are much harder to crack." **Play:** 1B ch. 5 Spot the Trick (cards 1-6,
tap the cues, then *safe / trick / ask a grown-up*) then ch. 6 levels 1-3 Caesar for fun; 2 ch. 6 Secret Messages (7:
shift, keyed substitution, hidden pixels, crack the shift by counting E, the two-key lockbox story, compare strength) and
ch. 5 cards 7-10 (spoofed sender badge; "what did they already know about you?" public-profile card: 2-IC-23). **Discuss:**
"Which cue gave the trick away most often?" 2 "Why is a keyed substitution harder than a shift? How many keys would a
computer try?" **Exit:** `1b-4.3-e1..e3` / `2-4.3-e1..e3`. Sentence: "A trick message often ___." **Diff.:** printed cue
checklist; stretch: 2-method messages. **Twin: Cipher Wheels** (printable) + *Trick or Treat* card sort. **Notes:** senders
are roles ("Prize Team", "Your bank"), buttons are verbs ("Claim now"); the cipher word list is screened at build time.

### Unit 5 · Inside the Machine

#### 5.1 What's inside? — parts, hardware and software, designing a gadget
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-CS-01**, **1B-CS-02** | **2-CS-02**, **2-CS-01** |
| I can | name the parts of a device and what each does; model how hardware and software work together | design a gadget by choosing inputs, outputs, storage, processing and a connection, and explain the tradeoffs |
| Quest code / params | `1 1 0 0` / `chapter=parts&band=1b&lock=1` | `5 2 0 0` / `chapter=gadget&band=2&lock=1` |

Vocabulary: input, output, processor, storage, hardware, software; (2) sensor, tradeoff, wireless vs cable. **Do Now:**
"List everything a tablet needs to show you a photo when you tap it." **Explore:** *A Tap Travels*: finger → touch sensor
→ processor → the app (software) → screen. *Ask this:* "Which of these is software? What if the screen is missing?" *Say
this:* "Hardware is what you can touch; software is the instructions; a task needs both." **Play:** 1B ch. 1 Parts & Jobs
(6: tap the part for the job; Build-a-Device tap-to-wire input → processor → output; "what breaks if…"; level 5 the robot
with a plug-in light sensor) then ch. 2 Hardware or Software (first 3: sort 12 cards; order the 5 tiles for *take a
photo*); 2 ch. 5 Design a Gadget (5 briefs: step counter, plant waterer, door alarm, noise meter, lunchbox thermometer;
parts bin with cost / battery / size meters; the gadget runs a 10-s sim; then three user quotes → choose two improvements:
2-CS-01). **Discuss:** 1B "Act it out: five kids are the five parts; what happens when the processor sits down?" 2 "What did
you give up to make the gadget cheaper?" **Exit:** `1b-5.1-e1..e3` / `2-5.1-e1..e3`. Sentence: "The ___ is hardware; the
___ is software." **Diff.:** picture tiles read aloud; stretch: 7-tile model. **Twin: Be the Computer** role-play cards.
**Notes:** no brand or product names, ever.

#### 5.2 It's not working! — troubleshooting
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-CS-03** | **2-CS-03**; 2-AP-10 (builds toward) |
| I can | try the common fixes in order before asking for help | follow a checklist/flowchart, change one thing at a time, swap a part to isolate the fault |
| Quest code / params | `3 1 0 0` / `chapter=fixit&band=1b&lock=1` | `3 2 0 0` / `chapter=fixit&band=2&lock=1` |

Vocabulary: restart, reconnect; (2) isolate, swap test, flowchart. **Do Now:** "Your tablet has no sound. Write 3 things to
check." **Explore:** Fix-It Desk ticket "No sound" on the projector; the class orders the checks; each check shows its
time cost. *Say this:* "Good fixers check the cheap things first." *Say this:* "Troubleshooting is a checklist, not a
guess." **Play:** ch. 3 Fix-It Desk (1B 7 tickets: won't turn on, no Wi-Fi, frozen app, caps lock, no sound, won't charge,
wrong passphrase; choose checks in a sensible order; 2 7 tickets where the fault may be in a connected device (printer,
router, dock); **build the flowchart first** from yes/no diamonds, then run it; swap-a-part moves; one ticket is a trick:
the user's cable). Ticket 3 "no sound (headphones)" is the **Device-first path's** class device test. **Discuss:** "What did
you check first and why?" 2 "Which ticket fooled you? What is a swap test?" **Exit:** `1b-5.2-e1..e3` / `2-5.2-e1..e3`.
Sentence: "Before asking for help I check ___, then ___." **Diff.:** picture checks; stretch: the two-faults ticket.
**Twin: Help Desk** (printed tickets + check cards; the class builds a wall flowchart). **Notes:** hang the class
flowchart by the cart; this lesson pays back all year.

#### 5.3 Bits and pixels — how computers store things
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-CS-02** (storage in the system model; binary = enrichment) | **2-DA-07** |
| I can | explain that computers keep everything as on/off (0 and 1) in storage; make a picture from 0s and 1s | represent the same data several ways: binary, decimal, pixels, grey levels, RGB and a colour name |
| Quest code / params | `4 1 0 0` / `chapter=bits&band=1b&lock=1` | `4 2 0 0` / `chapter=bits&band=2&lock=1` |

Vocabulary: bit, binary, pixel, storage; (2) byte, RGB, encoding. **Do Now:** "Send HI across the room with only a
flashlight on/off. How?" **Explore:** binary cards (16 8 4 2 1) make the class's grade number; an 8×8 pixel grid from a
row of 0/1. *Say this:* "Everything in a computer is numbers, and every number is on/off switches kept in storage." **Play:**
ch. 4 Bits & Pixels (1B 5: cards to numbers, numbers to cards, 0/1 pictures, 5-switch letter sender, "where is the photo
when the tablet is off?"; 2 7: adds grey levels 0-255, RGB sliders to match a swatch, the same colour as a name / three
numbers / a code, "how many colours with 2 bits?"). **Discuss:** "How many numbers can 5 cards make?" 2 "Why three numbers
for a colour?" **Exit:** 1B `1b-5.3-e1..e3` (1B-CS-02: storage/system items, not binary); 2 `2-5.3-e1..e3`. Sentence: "When
the tablet is off my photo is ___." **Diff.:** dot-picture cards; stretch: 1B 8-bit letters. **Twin: Binary Cards &
Pixel Grids.** **Notes:** digit runs in game text are spaced ("255 0 128").

### Unit 6 · Tech Choices

#### 6.1 Tech that changed the world — then, now, tradeoffs
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-IC-18** | **2-IC-20** |
| I can | name technologies that changed how people live and one way they changed us (and we changed them) | compare the tradeoffs of a technology for everyday life and for jobs |
| Main | `/live?mode=wyr&starter=wyr:tech:10:20&class=<id>` | same; the prompts differ |

Vocabulary: technology, invention, tradeoff; (2) automation, privacy, career. **Do Now:** "One thing your grandparents did
without a computer that you do with one." **Main (replaces Play): Would You Rather Live · Tech choices**, 10 dilemmas, 20
s; after each reveal one "defend your side" pair (30 s each) using the item's printed prompt (§7). Then the **Timeline
Walk** (8 min): 12 invention cards on a rope timeline; each pair writes "+ one good change, − one worry" (2: "+ a job it
creates, − a job it changes"). **Discuss:** "Which invention would you un-invent for a week? Better and worse?" **Exit:**
`1b-6.1-e1..e3` / `2-6.1-e1..e3`. Sentence: "___ changed how people ___." **Diff.:** sentence frames; stretch: "influenced
by culture" (why emoji exist). **Twin:** fully unplugged except the vote (corners of the room A/B). **Notes:** use the class
room so the run lands in class history; open room if no login.

#### 6.2 Made for everyone — accessibility, usability, bias
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-IC-19**, **1B-IC-20** | **2-IC-21**, **2-CS-01** |
| I can | find ways a game could work better for people who see, hear, read or move differently; ask another pair for ideas | test usability and accessibility, spot bias in how something was designed and tested, recommend improvements |
| Quest code / params | `6 1 0 0` / `chapter=design-lab&band=1b&lock=1` (+ any kit game's Settings panel) | `6 2 0 0` / `chapter=design-lab&band=2&lock=1` (+ DD `fair`: `6 2 0 0` in Data Detective) |

Vocabulary: accessible, usable, caption, contrast; (2) bias, assistive, testing group. **Do Now:** "Play any game with the
sound off and eyes closed for 10 seconds (partner keeps you safe). What did you miss?" **Explore:** the kit **Settings**
panel on the projector (motion, captions, read-aloud, text size, speed, assist, contrast, colour cues, left-handed,
graphics). *Ask this:* "Who is each switch for? Who else does it help?" (bright sun, a noisy bus). *Say this:* "Designing
for people at the edges makes things better for everyone." **Play (audit, 18 min):** pairs run the **Accessibility Audit
sheet** on a Robo Route level: try 4 settings, rate "could I still play?", write two improvements (1B-IC-19); then IM
ch. 6 Design Lab (1B briefs 1-3: low-vision, one-handed, very young user; 2 briefs 3-5: bright-sun user, "face unlock
tested on a group that all looked alike", "controller for one hand size"; pick two changes; the verdict says who else
each change helps: 2-CS-01); 2 also DD ch. 6 **Fair Data** (4 cases: biased samples, who is missing, a system that fails
for some users; last case: pick the two extra groups to survey: 2-IC-21). **1B-IC-20:** pairs swap audit sheets and add
one improvement from the other pair before finishing. **Discuss:** "Which setting surprised you by helping *you*?" 2 "Who
was missing from the testing group?" **Exit:** `1b-6.2-e1..e3` / `2-6.2-e1..e3`. Sentence: "___ would help ___ and also
___." **Diff.:** picture-icon audit sheet; stretch: audit a second game. **Twin: Design for Sam** (persona cards + a paper
remote). **Notes:** the kit settings are real; nothing new to build for the audit.

#### 6.3 Share or keep? — public vs private, using others' work
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-IC-21**, **1B-AP-14**; 1B-NI-05 | **2-IC-23**, **2-AP-16** |
| I can | use pictures and music I am allowed to use and give credit; keep private information private | explain the tradeoffs of making information public; recognise social engineering; give proper attribution |
| Main | `/live?mode=wyr&starter=wyr:online:8:20&class=<id>` | same |

Vocabulary: permission, credit, public domain, creative commons; (2) social engineering, spoofing, footprint. **Do Now:**
"You drew a great picture. A classmate copies it and puts their name on it. How do you feel? Now the picture is a song on
the internet." **Main:** WYR Live, 8 sharing dilemmas (`online`), each with a 30-s "what could go wrong / go right"
turn-and-talk; then the **Credit Card** sort: 6 media cards with licence badges (public domain, CC-BY, all rights
reserved, made by me, made by my friend who said yes, found on a search) → *use freely / use with credit / ask first /
don't*. 2 adds **Spot the Spoof** (PP `tricks` cards 9-10 on the projector). **Discuss:** "Why share at all? What is worth
the risk?" **Exit:** `1b-6.3-e1..e3` / `2-6.3-e1..e3`. Sentence (the credit line the capstone will use): "Art: ___. Idea:
___." **Diff.:** badge pictures; stretch: write the capstone credit line. **Twin:** fully unplugged already. **Notes:** sets
the attribution rule used in 7.4.

### Unit 7 · Make Your Own Game (Builder capstone; needs a school plan; unit 1 done first)

Teams: pairs (1B) or threes (2), **one device per team**; roles on printed cards; teams start the Builder only when the
teacher has approved their sheet (staggered by design). Honesty: the rubric evidences program-development and impacts
ids; 1B-AP-09/10 and 2-AP-11/12 are "builds toward" (the AI writes the code).

#### 7.1 Plan your game — design brief, roles, timeline
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-13**, **1B-AP-16**, **1B-AP-11** | **2-AP-18**, **2-AP-13**, **2-AP-10**; 2-AP-15 |
| I can | plan a game on the sheet (who it is for, goal, 3 parts); choose roles | split a game into parts, assign them on a 3-period timeline, write the main rule as a 6-box flowchart |
| Main | three question steps = the planning sheet | same |

**Do Now:** "Your favourite simple game: goal, what can go wrong, how you win?" **Explore:** the Builder on the projector:
a 30-second "quiz with 3 frog questions" so kids see what one message produces, and the automatic playtest. *Say this:*
"A good message to the Builder comes from a good plan." **Main (18 min):** the Planning Sheet (§8.1) on paper, then typed
into the three question steps (audience + goal + parts; the rule as `if … then …` (1B) / 6-box flowchart described in
words (2); the Builder message ≤ 300 chars). Roles: designer/typist, tester/note-taker (swap in 7.2). 2 fills the
timeline: period 2 build core, 3 test and fix, 4 credits and demo. Pairs swap sheets for one "have you thought about…"
note (2-AP-15 start). **Discuss:** three Builder messages read aloud: "which one would a robot misunderstand?" **Exit:**
`1b-7.1-e1..e3` / `2-7.1-e1..e3`. **Twin:** whole lesson is paper. **Notes:** the message, not the plan, is what the AI sees.

#### 7.2 Build day — build, test, fix
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-15**; builds toward 1B-AP-09/10 | **2-AP-17**; builds toward 2-AP-11/12 |
| I can | ask the Builder for my game, test it like a player, ask for one fix at a time | write test cases first, find the breaking input, ask for precise fixes |
| Main | build step (`template: quiz`, prefill = the sheet's Builder message) | same |

**Warm-up skipped** (budget for the queue). **Do Now:** "Write two things you will test first." **Explore (4 min):** the
**Builder etiquette card** (§8.2). **Main (30 min, two rotations):** rotation 1: approved teams press *Start building*;
the others **build on paper** (storyboard panels + a 5-row test table: input, expected, actual, pass?) and play-test each
other's paper prototypes; rotation 2: swap. Every team plays its own game between messages and logs one bug per message
(expected vs actual, from 2.1). **Discuss (short):** "What did the Builder get wrong first? What did you say to fix it?"
**Exit:** `1b-7.2-e1..e3` / `2-7.2-e1..e3`. Sentence: "My best fix message was ___ and it changed ___." **Diff.:** Quiz Show
start for weak plans; stretch: a variable the player can see. **Twin:** paper prototype play-test (it is already half the
lesson). **Notes:** the plan page's **Builder status** line (on / resting) tells the teacher the morning of; if resting,
the whole class takes the paper path.

#### 7.3 Playtest party — feedback from users, iterate
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-IC-20**, **1B-AP-15**; 1B-AP-16 | **2-AP-15**, **2-DA-09**, **2-IC-22** |
| I can | watch someone play without helping; collect "2 stars and a wish"; change one thing because of it | collect feedback from many players with a tally; use the numbers to refine a rule; explain the change |
| Main | text step (protocol) + question step (feedback tally + change) | same |

**Do Now:** "What is the hardest part of watching someone play your game?" **Main:** hand in first (class visibility; clean
scan = instant, flagged = play from the maker's screen); **three rotations of 5 minutes**: half the teams host, half play
two games each and fill the half-sheet (1B *2 stars and a wish*: 4 faces + one word tile; 2 **Playtest Tally**: fun 1-5,
too easy/right/too hard, "I got stuck at" on a storyboard panel, one wish); swap; rotation 3 (8 min): makers tally (2: in
Data Detective *My Data* → bar → claim "7 of 9 found level 2 too hard") and send **one** fix message (2-DA-09: a change
the data supports). **Discuss:** "What did players do that you never expected?" **Exit:** `1b-7.3-e1..e3` / `2-7.3-e1..e3`.
Sentence: "Testers said ___; I changed ___." **Twin:** paper prototypes rotate the same way. **Notes:** the teacher watches
the class Games tab during rotation 1 (remove = one tap).

#### 7.4 Show and credit — demo, document, attribute
| | Explorer | Pro |
|---|---|---|
| Standards | **1B-AP-17**, **1B-AP-14**; 1B-IC-21 | **2-AP-19**, **2-AP-16** |
| I can | explain the choices in my game in a 60-second demo; credit ideas, art and help | write player instructions and a short "how it works"; credit code, media and people |
| Main | question step: Credits & How-to template | same + How it works |

**Do Now:** "Who or what helped make your game? List everyone and everything." **Main:** 8 min to finish **Credits &
How-to** (question step template: *Made by (first names or avatars)*, *Idea from*, *Art and sounds* (kit art), *Thanks to
our testers*, *How to play in 3 lines*; 2: *How it works: the main rule and the variables*); then **demo circles** of 6
(60 s demo + 60 s one question); the teacher visits each circle. The rubric (§8.3) is marked on the lesson progress page
(0-3 per line: PLATFORM P11). **Discuss:** "What would version 2 have?" **Exit:** `1b-7.4-e1..e3` / `2-7.4-e1..e3`.
Sentence: "One choice I am proud of is ___ because ___." **Notes:** no full names in the Builder or the game; credits use
first names or avatars.

---

## 5. Game designs

### 5.0 Conventions shared by the four games (each game section lists only its own specifics)

- **Base and files.** 2D official games on Oomba Kit 1.1.2: `seed-games/<slug>.html` + `.json` (`l10n` for all 11
  non-English locales), the byte-exact kit tag from `kitTag()` + `kitPackTag()` (`art-props`, `art-animals`, `dress`,
  `style-bold` as listed), `<div id="game">` before the kit tag, no doctype shell. Everything under 2 MB without packs.
- **Levels are data**: `window.<Game>Levels` in its own classic `<script>` (vm-loadable, Code Isle pattern). Level record
  (all games): `{ id, ch, bands: ['1b'|'2'], csta: ['1B-AP-10'], csta2?: ['2-AP-12'], par, starter?, sol, tests?: [...],
  random?: true, learn?: {title, text}, hints: [q, highlight, move], check: { q, tiles: [3], answer }, ...game-specific }`.
  The per-game unit test solves every level with `sol`, asserts `starter` fails where one exists, asserts `par ≥
  blocks(sol)`, asserts every `csta`/`csta2` id exists in `csta.json`, round-trips every codec, and checks 13-locale
  parity with identical `{slots}`.
- **Text**: English keys through `window.<Game>I18n` → `Oomba.strings` under `rr.`, `dd.`, `pp.`, `im.`; CSTA ids, block
  names, numbers and code get `dir="ltr"`; translations in `/vendor/data/<slug>/<version>/<lang>.js` packs (SRI, English
  inline, game runs without the pack); built by `scripts/cs-quest-i18n.mjs` (one scaffold for all four, reading
  `scripts/data/cs-quest/<slug>/<lang>.json`); **≤ 450 strings per game**.
- **Lesson mode** = quest code entered or `BRB.params` present. Title screen stays (audit start button, iOS speech
  unlock). Lesson mode skips the chapter map → the chapter's first unfinished level (or `level`), shows "Class quest:
  Loops · Explorer" on the HUD, enables the **Case-closed card** (one 3-tile concept check from the level's `check` + a
  confidence face; 2 taps on top of `Oomba.ui.win`), and with `lock=1` hides the chapter map and the band toggle.
- **Chapter map** (fallback and free play): 6-8 big tiles (`Oomba.ui.button big`) with name, picture, stars; band toggle
  Explorer / Pro (remembered per player in `BRB.storage`); a gear opens the **Quest Card** (band, pairs chime, read-aloud,
  *Enter a quest code*: a 4-digit keypad drawn by the game, hidden in live frames). Chapters unlock in order but **the
  first level of every chapter is always open**; later levels unlock one at a time; **Skip level** appears after two
  failed runs (grey, 0 stars, unlocks the next).
- **Learn card first**: level 1 of every chapter opens a one-screen learn card (big idea, the new block/tool, one
  picture), read aloud when read-aloud is on, re-openable from the HUD.
- **Hints**: tier 1 asks a question; tier 2 highlights the thing; tier 3 shows one concrete move and costs the third
  star. Never the full solution. Hint text is a per-level string.
- **Stars**: 1 solved · 2 well made (par blocks / fewest edits / fewest checks / no wrong claim / all cues found) · 3 no
  tier-3 hint. Chapter crown at full stars recolours the crew member's outfit (SVG layers; cosmetic; per-game save).
  Explorer stars earned by a Pro player show silver. Stars + kit juice (`stage.burst('confetti'|'sparkle')`,
  `Oomba.juice.pop`) are the rewards; no timers unless a level says so, no lives, no leaderboard in class play.
- **Daily Crew Challenge**: one deterministic level per day per game seeded from the UTC day number (`new Date()` /
  `Oomba.time.real`, never `Date.now` next to the game loop) through `Oomba.rand`, own 3-star card, no new content.
- **Pair mode** (Robo Route, Data Detective): title toggle "Two on one device"; *Swap!* banner every 3 levels
  (`Oomba.ui.banner`); two avatars (`Oomba.avatar()` + a kit character). Nothing typed; no names.
- **Finish state visible across the room**: HUD chapter progress pill (`hud: ['progress', 'count:star']`), stars on the
  map, the kit results screen at chapter end.
- **Controls**: tap-first everywhere; drag is an enhancement (Pointer Events + `setPointerCapture`); keyboard: Tab between
  panels, arrows within, Enter/Space, Delete, digits pick shelf items; numbers come from `-`/`+` steppers, never a text
  field; **no text input anywhere** (live-frame safe by construction). Everything announces via `Oomba.ui.announce`.
- **Fit**: tablets first; landscape = board left (~55%), work panel right; portrait = board top (≤ 50% height), work panel
  below; palettes/shelves show ≤ 8 controls at a time (paginate with *more*); `data-fit-dense` only on grids/tables (28
  px cells), all buttons ≥ 48 px; DOM below `var(--ok-safe-top)`; text sized from `--ok-ts`; own CSS motion behind an
  `.ok-rm` rule; `Oomba.settings.reduced` → instant moves; `cvd` → tile shapes, never colour-only feedback.
- **Clock**: `Oomba.after/every/wait/tween` for play; `Oomba.time.real.*` for menus.
- **Progress out (today's plumbing; exact grammar in Appendix C):** after every solved level
  `BRB.score.submit(starsInChapter, '<done>/<total> <noun>, <stars> stars[, <ck>/<n> checks]')` (`noun` = levels | cases |
  tickets | cards; the checks part only in lesson mode); at chapter end `BRB.gameOver({ won: true, score: starsInChapter
  })`. One lesson step = one chapter = one gradebook cell reading e.g. `5/7 levels, 12 stars, 4/5 checks`. Phase 2:
  `BRB.progress({...})` per level (Appendix C).
- **Test hooks**: `Object.assign(window.__brbTest, { start({chapter, band, mode, level, seed, lesson}), step(n),
  skipAnimations(), cover(), state() → {chapter, level, stars, band, mode, phase, ...} })` plus game-specific
  (`program(blocks)`, `run()`, `verdict()`, `tap(id)`). RNG from `spec.seed` / `Oomba.rand(seed)`.
- **Scanner and safety**: no URLs, emails, `@`, `//host`, phone-like or 7+ digit runs in any literal or comment; no
  "type your password"; no brands, products or real people; nothing a kid types is ever shown to another kid. A shared
  content lint test (`tests/unit/cs-quest-content-lint.test.js`) runs `/\d{7,}|@|\/\/\w+\./` and the profanity lists over
  every string literal and pack of the four games; Packet Post's cipher word list is additionally shifted by all 25 keys
  and any word whose shift hits a profanity list in any language is rejected at build time.
- **Each game ships**: the HTML + JSON, `scripts/covers/<slug>.recipe.js` (loaded by `covers.js`: PLATFORM P16; 360×480
  portrait, drives `__brbTest.start(...)` + `cover()`), `scripts/data/cs-quest/<slug>/<lang>.json` + the built packs,
  `tests/unit/<slug>.test.js` (vm data test + real-Chromium frame test at the five audit sizes on its densest level, RTL,
  150% text), `tests/e2e/<slug>.spec.js` (kit-pilots pattern: pinned tag, `__csp` empty, drive `__brbTest`). The
  integration item adds the slug to `SEED_GAMES`, both scanner slug lists, `seeds.spec.js`, and runs covers + OG.

### 5.1 Robo Route — block coding on a grid (Bolt)

**Base.** `Oomba.game({ api: 1, title: 'Robo Route', controls: 'none', camera: 'fixed', mode: 'topdown', fit: 'contain',
hud: ['progress', 'count:star'], seed, levels: [...] })`, levels as `Oomba.level.grid` rows (built-in legend `# ~ $ K D G P i
^`), paint and pressure-plate tiles spawned as props (`art-props` / inline SVG). Bolt is a 3-layer SVG robot (paint jobs
= crown rewards). Moves: `Oomba.tween(w.hero, {x, y}, {ms: reduced ? 0 : 220})`; bumps: `w.hero.wobble()` +
`Oomba.sfx('wrong')` + caption "Bump! A wall after step 4" (the expected-vs-actual sentence the debugging lesson needs).

**Editor (custom DOM in `Oomba.ui.root()`).** *Shelf* (4-8 blocks per chapter, `<button class="ok-btn">` 48 px, icon +
word at Explorer, word + shape at Pro) and *program* (ordered list; containers are indented items with a coloured rail).
Tap shelf → append at cursor; tap program block → select + 4-button tray (up, down, delete, edit); select blocks then tap
a `repeat`/`if` + **Wrap** → they move inside. Keyboard: arrows, Enter/Space, Delete, `1-8` shelf; tray is a focus trap.
Steppers for counts and parameters. Run bar: Run, Step, Reset, Hint (`go`, `quiet`, `quiet`, `icon`) + a *watch* pill per
variable (ch. 4+). Portrait: grid top, shelf row, program scroller (> 8 buttons, so scrolling is allowed); `data-fit-dense`
only on the grid.

**Engine (Code Isle's split as a pattern).** `window.RoboRoute = { compile(blocks) → ast, run(level, ast, layoutSeed) →
{ sim, events[], verdict } }`: pure, synchronous, limits (≤ 500 commands, ≤ 64 nested calls, ≤ 200 loop iterations);
events `when gem collected / when bumped / when button pressed` fired by the sim; typed variable store (`number`, `flag`,
`word` from a fixed list); procedures with ≤ 2 numeric parameters; `verdict = { ok, reachedGoal, gemsLeft, bumps,
commandsRun, blocksUsed, editsFromStarter, namesOk, chipsOk, planMatch, failReason, perLayout: [...] }`. Levels with
`random: true` run on **3 seeded layouts** and pass only if all pass (a fixed sequence cannot solve them: the proof that a
conditional was needed). Replays stream `events` on the stage with the running block highlighted; step mode = one event
per tap. Kids' programs are data, never JavaScript (unit test proves no escape).

**Chapters** (quest-code index = row; levels 1B / 2; csta per band):

| # | Chapter id | Levels | CSTA 1B / 2 | New blocks / tools | Notes |
|---|---|---|---|---|---|
| 1 | `sequences` | 6 / 6 | 1B-AP-10, 1B-AP-08 (5-6 two routes), 1B-AP-11 (6 legs card) / 2-AP-10 (plan cards 3-6), 2-AP-13 (6) | forward, turn left, turn right; (2) plan card: order the pseudocode lines before the shelf unlocks; verdict `planMatch` | 1B 6×6 ghost path on 1-2; 2 8×8 |
| 2 | `loops` | 7 / 8 | 1B-AP-10 / 2-AP-12 (5-8 nested; 8 par challenge) | repeat N (stepper); (2) repeat inside repeat; "predict the count" tap before run on level 4 | |
| 3 | `conditionals` | 7 / 7 | 1B-AP-10 (if/else, `when` events) / 2-AP-12 (4-7 AND/OR/NOT, if inside loop) | if path ahead / on paint / has key, else; when gem / when bumped / when button; (2) AND OR NOT | levels 3-7 `random: true` |
| 4 | `variables` | 6 / 6 | 1B-AP-09 / 2-AP-11 | set, change by, watch pill; (2) name picker (verdict `namesOk` rejects `x`, `thing`, `number1` and says why), flag and word types | "the badly named program" level 6 |
| 5 | `functions` | 6 / 7 | 1B-AP-11, 1B-AP-12 (4-5 starter-shelf remix keeps "based on") / 2-AP-14 (3-7 parameters), 2-AP-13 (5-6 three subgoals), 2-AP-19 (6-7 Document it chips, verdict `chipsOk`), 2-AP-16 (7 credited shelf block) | define My Block, call; (2) parameter stepper, phrase chips, credit line | Run dimmed until a call exists |
| 6 | `debug` (default mode `debug`) | 7 / 7 | 1B-AP-15 / 2-AP-17 (3 test grids per level; 6 empty-maze edge case; 7 "never bump") | given `starter`; edit counter; step mode; (2) test tabs with ✓/✗ per grid | stars = fewest edits |
| 7 | `best-route` | 5 / 5 | 1B-AP-08 (two given programs: pick and improve) / 2-AP-10 (**flowchart must match**: build the flowchart from box/diamond tiles incl. a maze-walker decision; the program is checked against it), 2-AP-17 ("now the hallway is 2 longer" re-test) | compare view (two programs side by side, run both) | |
| 8 | `level-maker` (default mode `maker`) | editor + 3 "fix this level" tasks | 1B-AP-13, 1B-AP-12 / 2-AP-15, 2-AP-16 | tile painter, **Check** (BFS over robot states: solvable? par), *Test with a friend*, level code + symbol pad, remix stamps "based on <code>" | lesson 2.2 supplies roles/feedback |

Totals: 1B 44 levels + maker; 2 46 + maker; ~52 unique grid records shared with band overrides. Modes: `play`, `debug`
(ch. 6 default; also "broken twin" levels of ch. 1-5 as stretch), `maker`, `projector`.

**Level codes (tier 1).** 28-symbol alphabet `23456789BCDFGHJKMNPQRSTVWXYZ` (no vowels, no 0/O/1/I: cannot spell a word, never
7 digits in a row): version symbol + size (6/8) + run-length-coded wall/water bitmap + ≤ 4 gems + 1 key + 1 door + start +
facing + goal + 5-bit check symbol; typical 6×6 ≈ 14-18 symbols, worst 26; shown in groups of four; typed on an on-screen
symbol pad (no keyboard). Decoded locally; a teacher can put a code on the board (plan pages print one per lesson as the
"class level of the day"). Levels live in `BRB.storage['robo-route-v1'].levels` (≤ 20, ~200 B each). Tier 2 class gallery =
phase 2 (§11).

**Band switch.** Explorer: 6×6, 4-6 shelf blocks, floor numbers, read-aloud on, ghost path on the first two levels of a
chapter, hints after 1 failed run. Pro: 8×8, plan cards, nested/compound blocks, parameters, name picker, chips, test tabs,
hints after 2 failed runs, tighter par, no ghost path.

**Progress.** Score = stars in the chapter; label `n/m levels, s stars[, c/k checks]`; maker: score = levels that passed a
tester, label `3 made, 2 tested`. Params/quest code per Appendix B.

**Tests.** `tests/unit/robo-route.test.js`: vm-load levels + engine; solve all with `sol`; starters fail; random levels'
`sol` passes all 3 layouts and a hand-written fixed sequence fails at least one; `namesOk`/`chipsOk`/`planMatch`
verdicts; BFS check on every level equals the author's par; level-code round trip for 200 random levels; no escape from the
interpreter; 13-locale parity. Chromium: densest level (ch. 3 L5 at Pro) at the five audit sizes, Hebrew UI, 150% text.
Cover: `start({chapter:'loops', band:'1b', level:4, seed:7})` → `cover()` (half-built program with an open repeat, Bolt
mid-route, sparkle burst, 2 of 3 stars lit).

### 5.2 Data Detective — mysteries solved with data (Dot)

**Base.** Would You Rather pattern: `Oomba.stage` (detective office backdrop, `art-props` desk, Dot = kit `fox` +
`dress` coat, comments via `Oomba.say`) behind DOM **case cards** in `Oomba.ui.root()`; `Oomba.time.start()`; the game calls
`Oomba.test({state, start})` and `BRB.gameOver` itself. Every case: **case file** (story + question, `Oomba.ui.dialog`),
**data view** (DOM `<table>` ≤ 12 rows × 4 cols with `data-fit-dense`; grouped counts; `<div role="img">` bars with printed
values; never canvas; read aloud row by row through `announce`), **tools** (sort by column header, Group, chart type,
filter, +/- on bars, fix / merge / remove rows, rule sliders), and the **claim card** (`Oomba.ui.ask`, 2-4 tiles, `hint`,
`tries`). Core rule: **the claim appears only when the evidence view on screen supports it** ("Show me"); Dot's scoring for
"not enough data": "two clues is a hunch, five is a case".

**Chapters:**

| # | Chapter id | Cases | CSTA | Core mechanic |
|---|---|---|---|---|
| 1 | `sort` | 6 | **1B-DA-06** (2: warm-up) | tap a header to sort, *Group* to count by category; claim appears when the right view is shown; star for fewest views |
| 2 | `chart` | 5 | **1B-DA-06** | choose the chart that answers the question (bar / pictograph / table); build bar heights with +/- to match the table; claim |
| 3 | `claims` | 6 | **1B-DA-07** | read a chart; tiles *supported / not supported / can't tell yet*; predict the next bar with a slider; two cases with an irrelevant column; "two points is a hunch" case |
| 4 | `cleanup` | 6 | **2-DA-08** | tap bad rows → fix / merge / remove; counts → % before comparing groups of different size; star for never removing a good row |
| 5 | `models` | 5 | **2-DA-09** | toy simulation (ramp, plant, runner) with a rule slider; predict → run 5 seeded trials → compare → refine; case 5 **Game Balance** (tune the jump so ~80% of 20 seeded runs finish); star when error under target in ≤ 3 refinements |
| 6 | `fair` | 4 | **2-IC-21** | biased samples (one grade asked), who is missing (vegetarians), a system that fails for some users; last case: pick the two extra groups to survey |
| 7 | `my-data` (mode `tally`) | 3 guided + open | 1B-DA-06, 1B-DA-07 / 2-DA-08, 2-IC-22 | enter class tallies with steppers (≤ 8 categories; labels from preset lists: colours, pets, fruit, sports, transport, Option A-H); chart; pick/compose a claim from tiles; (2) load "another class" and compare by % |

Total 35 cases + open tally. 1B plays 1-3 + 7 (pictographs on, tables ≤ 8 rows, read-aloud on); 2 plays 4-7 (+ 1 as
review; "can't tell" appears more; tables to 12 rows). Controls all tap/keyboard (headers are buttons; bars have +/-;
sliders are `<input type=range>` with 48-px thumbs); no text fields. Hints: "Which column would tell us *when*?" → header
glows → the sort is applied for you. A wrong claim never says "wrong" alone: Dot says what the data actually shows. Progress:
label `n/m cases, s stars[, c/k checks]`; My Data: score = charts made, label `2 charts made`. Tests: vm-load cases; each
case's evidence predicate is satisfiable from its data by the `sol` tap script; exactly one supported claim; the Game
Balance sim is deterministic per seed; 13-locale parity; Chromium: bar chart at 150% text and Hebrew UI (numbers LTR).
Cover: `start({chapter:'sort', band:'1b', level:3})` → `cover()` (bars half-sorted, Dot pointing, claim card open).

### 5.3 Packet Post — Netville's postal network (Pim)

**Base.** `Oomba.game({ controls: 'none', camera: 'fixed', mode: 'topdown' })`; houses and post offices (routers) as
`w.spawn` props (`art-props`, `art-school`), roads on the stage ground, packets as small sprites tweened along edges
(instant under reduced motion); Pim = `art-animals` `owl` with a satchel, speaks via `say`. DOM in `Oomba.ui.root()`: road
buttons laid over the stage with `stage.viewX/viewY` (≤ 7 nodes per level, per-orientation layout), the order strip, ACK
board, rule toggles, inbox card with cue chips (48 px chips under the text, never inline), passphrase tiles + strength
meter, the cipher wheel (two SVG rings, ± buttons and arrow keys), the pixel grid (`data-fit-dense` 40-px toggles), the
lockbox cards. Postal metaphor throughout (packet = parcel, router = post office, protocol = post office rules, encryption
= sealed envelope).

**Chapters:**

| # | Chapter id | Levels 1B / 2 | CSTA | Core mechanic |
|---|---|---|---|---|
| 1 | `packets` | 5 / 5 | **1B-NI-04** | a picture splits into 3-6 numbered packets; tap a road per packet; rebuild in order at the house (the picture reassembles visibly) |
| 2 | `routes` | 4 / 6 | **1B-NI-04**, 2-NI-04 | several paths; a road closes mid-send (reroute); packets arrive out of order; a busy office is slower; (2) per-packet roads under a hop budget; a "sealed" road costs a hop |
| 3 | `protocols` | 2 / 6 | **2-NI-04** (1B: 1-2 "say got it") | ACK cards → resend the missing number; duplicates to discard; "count the dots" checksum; 3-step handshake ordering; design your rule set under a step budget; order the 5 rule cards |
| 4 | `locks` | 6 / 7 | **1B-NI-05** / **2-NI-05**, 2-IC-23 (7) | share/keep sort; passphrase builder (word tiles, meter, "a computer would need …"); backup level; reuse-is-risky; (2) 12 measures → physical / digital; HTTPS street (sealed vs open envelopes); router password; **Share or Shield** (6 facts, benefit + risk, public/private + reason tile) |
| 5 | `tricks` | 6 / 10 cards | **1B-NI-05**, 2-IC-23 (9-10) | an inbox of pretend messages; tap the cues (urgent, prize, asks for the key, odd sender badge, odd button) then *safe / trick / ask a grown-up*; star when all cues found first; a friendly-but-odd letter (no false positives); (2) spoofed badge; the public-profile card ("what did they already know?") |
| 6 | `ciphers` | 3 / 7 | **2-NI-06** (1B 1-3 enrichment) | Caesar wheel; keyed substitution with a key card; hide it in the picture (last bits of pixels); crack the shift by counting E; the two-key lockbox story (public key model); compare strength |

Modes: `play`, `projector`, `wheel` (a free Caesar wheel for the unplugged twin). Safety: senders are roles ("Prize Team",
"Your bank", "Game Shop"), buttons are verbs ("Claim now"), addresses are made-up place names / house numbers 1-99, no
URL bar (a padlock and "sealed" instead), passphrases are tiles, "mailbox key" not "password" in prompts, cipher
plaintexts from a reviewed word list screened by the shifted-word check. Hints: "Which packet number is missing?" → the
gap glows → the packet slots in. Stars: solved; no lost packet / all cues found / fewest resends; no tier-3 hint. Progress:
label `n/m levels, s stars[, c/k checks]`; tricks: `n/m cards, …`. Tests: vm-load; a routing solver proves every level
deliverable under budget; the protocol sim proves the stated rule set catches the seeded events; cipher round trips for all
methods; the shifted-word profanity check; 13-locale parity; Chromium: cipher wheel at 390×844, a letter with 3 cue chips
at 150% text. Cover: `start({chapter:'packets', band:'1b', level:4})` → `cover()` (six numbered packets in flight on
three roads, two placed in the frame).

### 5.4 Inside the Machine — parts, systems, help desk, bits, gadgets, design lab (Gizmo)

**Base.** DOM-first in `Oomba.ui.root()` over a quiet `Oomba.stage` workbench (`art-school` props); Gizmo = `art-animals`
`mouse` with goggles via `dress`, talks via `say`; pictures from `Oomba.art.toCanvas` where the kit has them, inline SVG
elsewhere (processor, memory, cable, speaker, sensors; themed with `--ok-*` vars; every tappable SVG part has a DOM hit
target ≥ 48 px). `Oomba.ui.dialog` for tickets and briefs, `Oomba.ui.ask` for 2-4-choice checks, custom DOM for sorting,
tap-wiring, the check tray, the flowchart builder, switches (`role="switch"`, knob inside its track), the pixel grid, the
RGB panel and the parts bin (a scroller with > 8 buttons; allowed).

**Chapters:**

| # | Chapter id | Levels 1B / 2 | CSTA | Core mechanic |
|---|---|---|---|---|
| 1 | `parts` | 6 / 6 | **1B-CS-01** | a job is described → tap the part; *Build-a-Device*: tap a port, tap another to wire input → processor → storage/output; "what if it's missing?" tiles; level 5 the robot with a plug-in light sensor; level 6 printer ↔ tablet dependency |
| 2 | `hw-sw` | 5 / 5 | **1B-CS-02** | sort 12 cards hardware / software; *A Tap Travels*: order 5 tiles (finger, touch sensor, processor, app, screen) for *take a photo* / *play a song* / *video call* |
| 3 | `fixit` | 7 / 7 | **1B-CS-03** / **2-CS-03** (2-AP-10 builds toward) | a ticket; a tray of checks each with a time cost; choose checks in order; the device reacts; (2) **build the flowchart first** (yes/no diamonds from tiles) then run it; connected-device tickets; swap-test moves; star for fewest checks; flowchart view of the path taken |
| 4 | `bits` | 5 / 7 | 1B enrichment (tied to 1B-CS-02 storage) / **2-DA-07** | flip 5 binary cards; 0/1 rows → pixel grid; 5-switch letter sender; "where is the photo when the tablet is off?"; (2) grey levels, RGB sliders to a swatch, the same colour as name / three numbers / code, "how many colours with n bits" |
| 5 | `gadget` | — / 5 briefs | **2-CS-02**, 2-CS-01 | parts bin (sensors, inputs, outputs, storage, connection, power) with cost / battery / size meters; a brief; build; 10-s sim; three user quotes → pick two improvements and justify (tiles) |
| 6 | `design-lab` | 3 / 5 | **1B-IC-19** / **2-CS-01**, **2-IC-21** | short animated persona scenes (can't see small text; one hand; a 6-year-old; bright sun; "tested on a group that all looked alike"); tap the moment the user struggles; choose two of nine changes; the verdict explains who else each change helps |

Modes: `play`, `projector`. Hints: "Which check is quickest?" → the cheapest useful check glows → it is chosen for you.
Stars: solved; fewest checks / all parts right / colour within tolerance / both best changes; no tier-3 hint. Progress:
label `n/m tickets, …` (fixit) or `n/m levels, …`. Tests: vm-load; chain/flowchart solvers; the parts-bin score is monotone
in the brief's needs; every Fix-It ticket's cheapest path equals the author's par; the switch board passes the `knob`
audit rule at five sizes; 13-locale parity. Cover: `start({chapter:'fixit', band:'1b', level:3})` → `cover()` (the tablet
open on the bench, two checks done, Gizmo pointing).

---

## 6. Quiz sets (warm-ups, exit tickets, unit reviews)

### 6.1 Shape

**Fourteen authored banks**, one per unit per band (`csq-u<n>-1b`, `csq-u<n>-2`), in `seed-lessons/cs-quest/sets/`. Every
item: `{ id, q ≤ 300, choices: 4 × ≤ 120, answer (index), secs ∈ {15, 20}, cat: '<CSTA id>', topic: '<lesson short
name>', lesson: '1.2', use: 'exit' | 'review' | 'opener', kind: 'recall' | 'apply' | 'analyze' }`. Rules: `cat` is exactly one
CSTA id and **must be a primary standard of the item's lesson** (CI rule); three wrong answers of similar length to the
right one, each a real misconception; the right answer's position varies across items in the JSON (the tables below list
it first for readability); plain text, no brands, people, URLs, emails or 7+ digit runs; never "type your password".
Limits respected: ≤ 100 items per set, title ≤ 80, `cat` ≤ 40.

Derived live sets (created per lesson by the materialiser in the teacher's *My sets*, `SETS.createSet`, `lesson_id` set):

| Derived set | Items | Composition (item ids listed explicitly in the lesson JSON) | Hosted as |
|---|---|---|---|
| `CSQ 1.2 warm-up · Loops (3-5)` | 5 | `prev-e1, prev-e2, own-r1, own-e1, prev-r1` (lesson 1 of a unit: `opener, r1, e1, e2, e3` = a pre-test) | Quest Race (1B) / Question Battle (2), 15 s, shuffle off; or *Show on projector* |
| `CSQ 1.2 exit ticket (3-5)` | 3 | `own-e1..e3` | quiz step (`cat` kept); or Question Battle 20 s; or printed half-sheet |
| `CSQ Unit 1 review (3-5)` | all of the bank | `cat` replaced by `topic` so Brain Board columns read "Loops", not a code | Brain Board (columns = lessons, 5 tiles easy→hard) or Quest Race |

Totals: 101 items per band, 202 in all (U1 21 · U2 11 · U3 13 · U4 13 · U5 13 · U6 13 · U7 17).

### 6.2 Explorer banks (grades 3-5)

**`csq-u1-1b` · CSQ Unit 1 · Think Like a Robot (3-5)** · modes: quest-race, battle, board

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u1-o1 | 1B-AP-10 | A list of steps a robot follows in order is called… | an algorithm | a password | a pixel | a packet |
| 1b-1.1-r1 | 1B-AP-10 | Which block makes Bolt move one square? | forward | turn left | repeat | if |
| 1b-1.1-e1 | 1B-AP-10 | Bolt faces a wall. The gem is two squares to the right. Which program reaches it? | turn right, forward, forward | forward, forward, turn right | turn left, forward, forward | forward, turn right, turn right |
| 1b-1.1-e2 | 1B-AP-10 | What does the block *turn left* do to Bolt? | spins Bolt in place to the left | moves Bolt one square left | moves Bolt back one square | makes Bolt pick up a gem |
| 1b-1.1-e3 | 1B-AP-08 | Route A has 9 steps. Route B has 6 steps but crosses the puddle. Bolt must stay dry. Which route? | Route A, it keeps Bolt dry | Route B, it is shorter | Both routes are the same | Neither route works |
| 1b-1.2-r1 | 1B-AP-10 | Which word means "do the same steps again"? | loop | event | variable | sensor |
| 1b-1.2-e1 | 1B-AP-10 | Which program moves Bolt 8 squares with the fewest blocks? | repeat 8 { forward } | eight forward blocks | repeat 4 { forward } | forward, repeat 7 |
| 1b-1.2-e2 | 1B-AP-10 | How many squares does repeat 3 { forward, forward } move Bolt? | 6 | 3 | 5 | 9 |
| 1b-1.2-e3 | 1B-AP-10 | The repeat is around the wrong blocks, so Bolt turns 4 times. What is the bug? | the loop wraps the turn, not the forward | the loop count is too small | Bolt needs more gems | the goal is in the wrong place |
| 1b-1.3-r1 | 1B-AP-10 | A block that lets Bolt choose what to do is… | an if block | a repeat block | a forward block | a stop block |
| 1b-1.3-e1 | 1B-AP-10 | Bolt cannot see ahead. Which program never bumps a wall? | if path ahead: forward, else: turn | forward, forward, forward | repeat 4 { forward } | turn left, forward |
| 1b-1.3-e2 | 1B-AP-10 | What is the difference between *when* and *if*? | when waits for something to happen; if checks now | when repeats; if moves | they are the same block | if is only for turning |
| 1b-1.3-e3 | 1B-AP-10 | "when gem collected: open door". When does the door open? | the moment Bolt picks up a gem | at the start of the program | after every forward | never |
| 1b-1.4-r1 | 1B-AP-09 | A labelled box the program can look in and change is a… | variable | loop | event | packet |
| 1b-1.4-e1 | 1B-AP-09 | What does *change score by 1* do? | adds one to the score | sets the score to 1 | deletes the score | repeats once |
| 1b-1.4-e2 | 1B-AP-09 | gems is 0. Bolt picks up 3 gems; each time *change gems by 1* runs. What is gems now? | 3 | 0 | 1 | 4 |
| 1b-1.4-e3 | 1B-AP-09 | What does *set lives to 3* do? | puts exactly 3 in the lives box | adds 3 to the lives box | takes 3 away from lives | counts how many lives there are |
| 1b-1.5-r1 | 1B-AP-11 | Breaking a big job into smaller parts is called… | decomposing | looping | debugging | encrypting |
| 1b-1.5-e1 | 1B-AP-11 | Bolt must cross four identical rooms. What is the smart move? | make one My Block: Room and call it 4 times | write every step four times | use one very long forward | skip the rooms |
| 1b-1.5-e2 | 1B-AP-11 | Which group of steps most deserves its own named block? | steps that repeat in several places | the very first step | a single turn | the last step only |
| 1b-1.5-e3 | 1B-AP-12 | You changed one step of a shelf block and used it. What should stay on it? | the "based on" line that credits the original | nothing, it is yours now | a new name only | the old bug |

**`csq-u2-1b` · CSQ Unit 2 · Bug Hunters (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u2-o1 | 1B-AP-15 | A mistake that makes a program do the wrong thing is a… | bug | loop | packet | pixel |
| 1b-2.1-r1 | 1B-AP-15 | Running a program one block at a time to watch what happens is… | stepping through | deleting blocks | guessing | starting over |
| 1b-2.1-r2 | 1B-AP-15 | "Expected vs actual" means… | what should happen vs what did happen | fast vs slow programs | long vs short programs | easy vs hard levels |
| 1b-2.1-e1 | 1B-AP-15 | Bolt should stop at the flag but walks into the lake. The best first move is… | step through and watch where it goes wrong | delete everything and start again | add more forward blocks | ask for the answer |
| 1b-2.1-e2 | 1B-AP-15 | A loop should run 4 times but Bolt goes one square too far. Most likely bug? | the repeat count is one too many | the goal is missing | Bolt needs a gem | the program has no turn |
| 1b-2.1-e3 | 1B-AP-15 | When is a program really fixed? | when you test it and it does what you expected | when it looks right | when it has fewer blocks | when a friend says so |
| 1b-2.2-r1 | 1B-AP-16 | Who is the navigator in pair programming? | the one who reads the plan and watches for mistakes | the one who taps the blocks | the teacher | the fastest kid |
| 1b-2.2-r2 | 1B-AP-13 | Why plan a level on paper before building it? | to think about the player before you start | because the game needs paper | to make it take longer | to avoid testing |
| 1b-2.2-e1 | 1B-AP-13 | Your tester got stuck at the start. What next? | change the level and test it again | tell them they played wrong | delete the level | add more traps |
| 1b-2.2-e2 | 1B-AP-16 | During the test, the designer should… | watch quietly and take notes | explain every step | play it themselves | fix it while the tester plays |
| 1b-2.2-e3 | 1B-AP-17 | Which designer's note explains a choice best? | "I put the key behind water so you must plan a path" | "good level" | "my level is hard" | "level by me" |

**`csq-u3-1b` · CSQ Unit 3 · Data Detectives (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u3-o1 | 1B-DA-06 | Facts collected in rows and columns are called… | data | code | packets | pixels |
| 1b-3.1-r1 | 1B-DA-06 | Putting rows in order from biggest to smallest is… | sorting | grouping | charting | cleaning |
| 1b-3.1-e1 | 1B-DA-06 | You want to know which month had the most rain. What do you do first? | sort by the rain column | sort by the month name | delete the months | count the rows |
| 1b-3.1-e2 | 1B-DA-06 | To find the most common pet in the class, you should… | group the rows by pet and count | sort by the kid's name | draw a line chart | remove the cats |
| 1b-3.1-e3 | 1B-DA-06 | A chart supports a claim when… | the data really shows it | it has bright colours | the teacher says so | it has many rows |
| 1b-3.2-r1 | 1B-DA-07 | A guess about what comes next, based on data, is a… | prediction | password | packet | program |
| 1b-3.2-e1 | 1B-DA-07 | The plant grew 2 cm each day for 5 days. On day 6 it will most likely be… | 2 cm taller than day 5 | the same height as day 1 | 10 cm shorter | impossible to say |
| 1b-3.2-e2 | 1B-DA-07 | The chart shows only 2 days of plant growth. Can we predict day 10? | not yet, we need more days | yes, exactly | yes, it will be 10 | plants do not grow |
| 1b-3.2-e3 | 1B-DA-07 | The chart shows Tuesday is the tallest bar. Which claim is supported? | most lunches were sold on Tuesday | Friday had the most lunches | nobody ate on Tuesday | lunches cost more on Tuesday |
| 1b-3.3-r1 | 1B-DA-06 | Asking many people the same question and counting the answers is a… | survey | sort | cipher | sensor |
| 1b-3.3-e1 | 1B-DA-06 | Which chart answers "which fruit is most popular?" fastest? | a bar chart with one bar per fruit | a list of every kid's name | a line of dates | a table sorted by name |
| 1b-3.3-e2 | 1B-DA-07 | 12 kids said dog, 3 said cat. Which claim is fair? | dogs are the favourite pet in our class | everyone in the world prefers dogs | cats are the favourite | nobody likes cats |
| 1b-3.3-e3 | 1B-IC-20 | Why ask another pair whether your claim is fair? | they may see something your pair missed | so they can copy your work | because the game needs it | to finish faster |

**`csq-u4-1b` · CSQ Unit 4 · Packet Post (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u4-o1 | 1B-NI-04 | A small piece of a message sent over a network is a… | packet | pixel | password | program |
| 1b-4.1-r1 | 1B-NI-04 | A machine that passes packets along the way is a… | router | printer | speaker | battery |
| 1b-4.1-e1 | 1B-NI-04 | A photo is sent over the internet. Which is true? | it is cut into packets that may take different roads | it travels in one big piece | it goes through one single wire | it is drawn again by hand |
| 1b-4.1-e2 | 1B-NI-04 | Packets arrive in the order 3, 1, 2. What does the receiving device do? | uses the numbers to put them back in order | throws them away | sends them back | prints them as they came |
| 1b-4.1-e3 | 1B-NI-04 | A road in the network closes while a message is being sent. What happens? | the packets take another road | the message is lost for ever | the internet stops | the picture changes colour |
| 1b-4.2-r1 | 1B-NI-05 | Information that only you and your family should know is… | private | public | a packet | a router |
| 1b-4.2-e1 | 1B-NI-05 | Which passphrase is the strongest? | purple-river-bicycle-moon | password1 | abc123 | your pet's name |
| 1b-4.2-e2 | 1B-NI-05 | Who may you tell your passphrase? | a parent or guardian only | your best friend | anyone who asks nicely | a prize team online |
| 1b-4.2-e3 | 1B-NI-05 | Why keep a backup copy of your photos somewhere safe? | if the tablet breaks you still have them | so they load faster | because it is the law | so friends can see them |
| 1b-4.3-r1 | 1B-NI-05 | A message that tries to trick you into giving away private information is… | a trick message (phishing) | a backup | a packet | a loop |
| 1b-4.3-e1 | 1B-NI-05 | "You won a tablet! Reply with your password to claim it." What do you do? | do not reply, and tell a grown-up | reply with the password quickly | send it to a friend | reply with your address |
| 1b-4.3-e2 | 1B-NI-05 | Which is a sign of a trick message? | it says hurry and asks for your password | it comes from your class page | it has no pictures | it is short |
| 1b-4.3-e3 | 1B-NI-05 | Why does a cipher wheel keep a message private? | only someone with the key can read it | it makes the message shorter | it deletes the message | it sends the message faster |

**`csq-u5-1b` · CSQ Unit 5 · Inside the Machine (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u5-o1 | 1B-CS-01 | Parts of a computer you can touch are called… | hardware | software | data | packets |
| 1b-5.1-r1 | 1B-CS-01 | Which part does the thinking? | the processor | the screen | the speaker | the cable |
| 1b-5.1-e1 | 1B-CS-01 | Which part keeps your photos when the tablet is off? | storage | the processor | the speaker | the touch sensor |
| 1b-5.1-e2 | 1B-CS-01 | A robot's light sensor needs the robot for… | power | light | sound | wheels |
| 1b-5.1-e3 | 1B-CS-02 | Taking a photo needs the camera (hardware) and… | the camera app (software) | a second camera | a printer | a passphrase |
| 1b-5.2-r1 | 1B-CS-03 | Turning a device off and on again is a… | restart | backup | download | loop |
| 1b-5.2-e1 | 1B-CS-03 | The tablet has no sound. Best first check? | volume up and headphones unplugged? | buy a new tablet | delete the app | reset the Wi-Fi password |
| 1b-5.2-e2 | 1B-CS-03 | Your passphrase keeps failing even though you know it. What should you check? | whether caps lock is on | whether the screen is broken | whether the speaker works | whether the battery is full |
| 1b-5.2-e3 | 1B-CS-03 | The app is frozen. Which check comes first? | close the app and open it again | throw the tablet away | change the wallpaper | unplug the printer |
| 1b-5.3-r1 | 1B-CS-02 | The smallest piece of computer storage, an on or an off, is a… | bit | byte | pixel | packet |
| 1b-5.3-e1 | 1B-CS-02 | Where is a photo kept when the tablet is switched off? | in storage, as on/off switches | on the screen | in the speaker | nowhere, it is gone |
| 1b-5.3-e2 | 1B-CS-02 | A picture on a screen is made of tiny dots called… | pixels | packets | routers | loops |
| 1b-5.3-e3 | 1B-CS-02 | You tap a photo and it appears. Which order is right? | touch sensor, processor, storage, screen | screen, storage, sensor, processor | storage, screen, sensor, processor | processor, sensor, screen, storage |

**`csq-u6-1b` · CSQ Unit 6 · Tech Choices (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u6-o1 | 1B-IC-18 | A tool or machine people invent to solve a problem is a… | technology | tradeoff | survey | packet |
| 1b-6.1-r1 | 1B-IC-18 | Which invention first let people talk to someone far away? | the telephone | the printing press | the bicycle | the oven |
| 1b-6.1-e1 | 1B-IC-18 | GPS changed how people… | find their way | cook their food | brush their teeth | spell words |
| 1b-6.1-e2 | 1B-IC-18 | People change technology too. Which is an example? | captions were added because viewers asked | the sun rises every day | rain falls on roofs | birds build nests |
| 1b-6.1-e3 | 1B-IC-18 | Video calls let families far apart… | see and talk to each other every day | send paper letters faster | share one phone | drive to each other |
| 1b-6.2-r1 | 1B-IC-19 | Something everyone can use, including people who see, hear or move differently, is… | accessible | encrypted | compressed | private |
| 1b-6.2-e1 | 1B-IC-19 | Captions in a game help… | people who cannot hear and people in a noisy room | only the game designer | nobody at all | only people who can hear |
| 1b-6.2-e2 | 1B-IC-19 | A player cannot hold the tablet with two hands. Which change helps most? | a one-hand button layout | brighter colours | more levels | louder music |
| 1b-6.2-e3 | 1B-IC-20 | Asking another pair what they think of your audit ideas is… | seeking other perspectives | cheating | debugging | encrypting |
| 1b-6.3-r1 | 1B-IC-21 | Saying who made the picture or music you used is giving… | credit | a password | a packet | a loop |
| 1b-6.3-e1 | 1B-IC-21 | You find a picture online for your game. What first? | check you are allowed to use it, then give credit | use it, it is online | change one pixel | print it out |
| 1b-6.3-e2 | 1B-IC-21 | A picture marked "public domain" may be… | used freely | never used | used only on Fridays | sold as your own only |
| 1b-6.3-e3 | 1B-AP-14 | You remix a friend's level. What should you do? | credit the friend whose level it was | hide where it came from | delete their level | say you made it alone |

**`csq-u7-1b` · CSQ Unit 7 · Make Your Own Game (3-5)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 1b-u7-o1 | 1B-AP-13 | A drawing of each screen of a game, made before building, is a… | storyboard | packet | cipher | sensor |
| 1b-7.1-r1 | 1B-AP-13 | The first step of making a game for someone is… | decide who it is for and plan | add music | build it fast | pick a colour |
| 1b-7.1-e1 | 1B-AP-13 | Why ask "who is this game for?" before building? | so the game fits the player's needs | because the Builder asks | to make it longer | to skip testing |
| 1b-7.1-e2 | 1B-AP-16 | In your pair, the tester/note-taker should… | play the game and write what happened | type every message | decide everything alone | do nothing |
| 1b-7.1-e3 | 1B-AP-11 | Splitting your game into "start screen", "playing" and "winning" is… | decomposition | looping | encryption | debugging |
| 1b-7.2-r1 | 1B-AP-15 | After every change to your game you should… | play it to test the change | send two more messages | close the Builder | change the title |
| 1b-7.2-e1 | 1B-AP-15 | The Builder made the rocket fly down instead of up. Which message is best? | "I expected the rocket to fly up when I tap; it flies down. Please fix." | "it is wrong" | "make it cool" | "add more rockets and a dog" |
| 1b-7.2-e2 | 1B-AP-15 | Why send one change per message? | so you can test each change and see what fixed what | because messages are short | to use more messages | so the Builder rests |
| 1b-7.2-e3 | 1B-AP-15 | A good test plan lists… | things to try and what should happen | your favourite colours | the names of your friends | the game's price |
| 1b-7.3-r1 | 1B-IC-20 | Feedback from a tester is… | what they noticed while playing your game | a bug in the Builder | the game's score | a kind of loop |
| 1b-7.3-e1 | 1B-IC-20 | Why get feedback from different people? | different players notice different things | one person is always enough | it is faster | so nobody plays it |
| 1b-7.3-e2 | 1B-IC-20 | Two testers said level 2 is confusing. What next? | change level 2 and test again | ignore them, they played wrong | delete the game | add more levels |
| 1b-7.3-e3 | 1B-AP-15 | While a tester plays, the maker should… | watch where they get stuck, without helping | tell them every move | play instead of them | leave the room |
| 1b-7.4-r1 | 1B-AP-17 | Explaining why you chose a timer in your game is… | describing a design choice | debugging | encrypting | sorting |
| 1b-7.4-e1 | 1B-AP-17 | A good 60-second demo tells the audience… | who it is for and one choice you made and why | your password | every bug ever | nothing, just play |
| 1b-7.4-e2 | 1B-AP-17 | "How to play" instructions should… | tell a new player what to do in a few lines | list every line of code | be kept secret | be longer than the game |
| 1b-7.4-e3 | 1B-AP-14 | Credits should list… | people, art and ideas you used | your home address | your password | nothing at all |

### 6.3 Pro banks (grades 6-8)

**`csq-u1-2` · CSQ Unit 1 · Think Like a Robot (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u1-o1 | 2-AP-10 | A plan for a program written in plain words, step by step, is… | pseudocode | a packet | a protocol | a password |
| 2-1.1-r1 | 2-AP-10 | In a flowchart, a diamond shape means… | a decision | a loop | the end | a variable |
| 2-1.1-e1 | 2-AP-10 | Which is pseudocode? | IF gem ahead THEN pick up | a drawing of Bolt | a photo of the grid | a list of names |
| 2-1.1-e2 | 2-AP-10 | Why write a plan (pseudocode or flowchart) before programming? | to think the steps through before building | because the game refuses to run | to make the program longer | to avoid testing it |
| 2-1.1-e3 | 2-AP-13 | Splitting a long route into "reach the key", "open the door", "reach the goal" is… | decomposing the problem | debugging the program | encrypting the route | looping the route |
| 2-1.2-r1 | 2-AP-12 | A loop inside another loop is a… | nested loop | compound loop | variable loop | event loop |
| 2-1.2-e1 | 2-AP-12 | How many squares does repeat 3 { repeat 2 { forward } } move Bolt? | 6 | 5 | 3 | 9 |
| 2-1.2-e2 | 2-AP-12 | repeat 4 { forward, repeat 2 { pick up } }: how many pick-ups? | 8 | 6 | 4 | 2 |
| 2-1.2-e3 | 2-AP-12 | Which program moves Bolt 8 squares with the fewest blocks? | repeat 8 { forward } | eight forward blocks | repeat 4 { forward } | forward, repeat 7 |
| 2-1.3-r1 | 2-AP-12 | A condition joined with AND, OR or NOT is a… | compound condition | nested loop | parameter | procedure |
| 2-1.3-e1 | 2-AP-12 | The door opens if Bolt has the key AND is touching the door. Bolt has the key, two squares away. Opens? | no, both parts must be true | yes, one part is enough | sometimes | only with a loop |
| 2-1.3-e2 | 2-AP-12 | "if NOT wall ahead: forward". When does Bolt move? | when there is no wall ahead | when there is a wall ahead | never | only on paint |
| 2-1.3-e3 | 2-AP-12 | Which program solves any maze? | repeat until goal { if path ahead: forward, else: turn right } | forward, forward, turn left, forward | repeat 10 { forward } | if path ahead: forward |
| 2-1.4-r1 | 2-AP-11 | A variable that holds only true or false is a… | boolean (flag) | number | word | list |
| 2-1.4-e1 | 2-AP-11 | Which is the clearest name for the number of gems left? | gemsLeft | g | thing | number1 |
| 2-1.4-e2 | 2-AP-11 | Which type fits "is the door locked?" | true/false (flag) | number | word | colour list |
| 2-1.4-e3 | 2-AP-11 | energy is 10. *change energy by -2* runs three times. What is energy? | 4 | 8 | 6 | 16 |
| 2-1.5-r1 | 2-AP-14 | A named group of steps you can call many times is a… | procedure | parameter | packet | pixel |
| 2-1.5-e1 | 2-AP-14 | Room(steps) is called with 3 and then 5. What is "steps"? | a parameter | a loop | an event | a bug |
| 2-1.5-e2 | 2-AP-14 | Why give a procedure a parameter? | so one procedure can do different amounts | to make it run faster | to avoid loops | so it cannot be called |
| 2-1.5-e3 | 2-AP-13 | You decompose a level into three subgoals. What should your program have? | three separate procedures, one per subgoal | one giant block | no procedures | three copies of the same steps |

**`csq-u2-2` · CSQ Unit 2 · Bug Hunters (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u2-o1 | 2-AP-17 | A specific input used to check that a program works is a… | test case | parameter | packet | procedure |
| 2-2.1-r1 | 2-AP-17 | An unusual input that often breaks programs, like an empty maze, is an… | edge case | easy case | event | argument |
| 2-2.1-r2 | 2-AP-17 | "Expected vs actual" means… | what should happen vs what did happen | fast vs slow programs | long vs short programs | easy vs hard levels |
| 2-2.1-e1 | 2-AP-17 | Your program passes grids A and B but fails grid C, which has no gems. What kind of test is C? | an edge case | a syntax error | a loop | a parameter |
| 2-2.1-e2 | 2-AP-17 | Which test would catch a loop count that is one too many? | a grid where the goal is right before a wall | a grid with no walls at all | a grid with only one square | no test can catch it |
| 2-2.1-e3 | 2-AP-17 | You fixed grid C but now grid A fails. What does systematic testing say? | run all the test grids again after every fix | grid A does not matter now | delete grid A | only test the newest grid |
| 2-2.2-r1 | 2-AP-18 | A list of who does what by when is a… | timeline | storyboard | protocol | variable |
| 2-2.2-r2 | 2-AP-19 | Notes that help the next person understand a program are… | documentation | encryption | a parameter | a test case |
| 2-2.2-e1 | 2-AP-15 | Your tester found level 2 confusing. Incorporating their feedback means… | changing the level and testing again | ignoring it | blaming the tester | deleting level 2 |
| 2-2.2-e2 | 2-AP-18 | Your pair has 18 minutes: build, test, fix. What helps most? | set a time for each part and who does it | build until time runs out | skip testing | both do the same thing |
| 2-2.2-e3 | 2-AP-19 | Which level note helps the next person most? | "Level 3: the key is behind the water; you need if has key" | "good level" | "my level" | "hard one" |

**`csq-u3-2` · CSQ Unit 3 · Data Detectives (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u3-o1 | 2-DA-08 | Fixing typos, removing duplicates and dropping impossible values is… | cleaning data | sorting data | charting data | encrypting data |
| 2-3.1-r1 | 2-DA-08 | A value far outside the rest, like "200 lunches" on a normal day, is an… | outlier | average | argument | event |
| 2-3.1-e1 | 2-DA-08 | A survey row says a student has "twelvety" pets. What should you do? | fix or remove the row before charting | keep it, data is data | change every row | make it the title |
| 2-3.1-e2 | 2-DA-08 | "Blue", "blue" and "Blu" appear in one column. Before charting you should… | merge them into one spelling | delete all three | chart them as three colours | sort them by length |
| 2-3.1-e3 | 2-DA-08 | Comparing 12 of 20 in one class and 15 of 30 in another fairly needs… | percentages | raw counts | dates | the class names |
| 2-3.2-r1 | 2-DA-09 | A rule or simulation that predicts what will happen is a… | model | survey | checksum | router |
| 2-3.2-e1 | 2-DA-09 | Your ramp rule predicted 40 cm; five trials averaged 52 cm. What next? | change the rule and test again | keep the rule as it is | stop measuring | run one more trial only |
| 2-3.2-e2 | 2-DA-09 | After a change, the model's error went from 12 to 3. What does that show? | the refined model fits the data better | the data is wrong | the model is now perfect | the trials were too short |
| 2-3.2-e3 | 2-DA-09 | In Game Balance, only 4 of 20 test runs finished; the target is about 16. You should… | change the jump rule and run the 20 tests again | ship it, it is hard | run 2 tests only | remove the jump |
| 2-3.3-r1 | 2-IC-22 | Getting ideas or answers from many people, like a class survey, is… | crowdsourcing | debugging | encrypting | routing |
| 2-3.3-e1 | 2-IC-22 | Which survey question is biased? | "Don't you agree recess is too short?" | "How long should recess be?" | "What do you do at recess?" | "Do you like recess? yes/no" |
| 2-3.3-e2 | 2-IC-22 | Why pool every pair's results on the projector? | many contributors make a bigger, fairer sample | one pair's data is always enough | to find the fastest pair | because charts need colour |
| 2-3.3-e3 | 2-DA-08 | 28 of 30 students answered. The two missing answers… | could change a close result | never matter | mean the data is fake | are an error in the app |

**`csq-u4-2` · CSQ Unit 4 · Packet Post (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u4-o1 | 2-NI-04 | Rules that computers agree on for sending data are a… | protocol | password | packet | processor |
| 2-4.1-r1 | 2-NI-04 | A number on each packet that says where it belongs is a… | sequence number | checksum | password | pixel |
| 2-4.1-e1 | 2-NI-04 | Packet 3 never arrives. What does the protocol do? | the receiver asks for packet 3 again | gives up on the message | guesses what it said | sends the whole message to everyone |
| 2-4.1-e2 | 2-NI-04 | A checksum helps to… | detect a damaged packet | encrypt the message | find the fastest road | name the router |
| 2-4.1-e3 | 2-NI-04 | Why do all post offices (routers) need the same rules? | so packets from anywhere can be passed on and rebuilt | so they look the same | so packets travel slower | so only one road is used |
| 2-4.2-r1 | 2-NI-05 | A lock on the server room door is an example of… | physical security | digital security | encryption | a protocol |
| 2-4.2-e1 | 2-NI-05 | Which is a physical security measure? | locking the room with the backup drive | a firewall | HTTPS | a strong Wi-Fi password |
| 2-4.2-e2 | 2-NI-05 | The padlock (HTTPS) on a shop page means… | your details travel in a sealed envelope | the shop is cheap | the page loads faster | the shop is closed |
| 2-4.2-e3 | 2-IC-23 | Posting your weekly schedule publicly: friends can find you, but the risk is… | strangers know where you will be | the internet gets slower | it costs money | nobody sees it |
| 2-4.3-r1 | 2-NI-06 | Scrambling a message so only someone with the key can read it is… | encryption | compression | routing | sorting |
| 2-4.3-e1 | 2-NI-06 | A shift of 3 turns A into D. What does HELLO become? | KHOOR | EBIIL | HELLO | OLLEH |
| 2-4.3-e2 | 2-NI-06 | Which method hides a message instead of scrambling it? | steganography (in a picture's pixels) | a Caesar shift | a keyed substitution | a checksum |
| 2-4.3-e3 | 2-NI-06 | Why is a keyed substitution harder to crack than a shift? | there are far more possible keys to try | the letters are bigger | it uses numbers | it is shorter |

**`csq-u5-2` · CSQ Unit 5 · Inside the Machine (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u5-o1 | 2-CS-02 | A part that measures something in the world, like light or soil moisture, is a… | sensor | speaker | processor | screen |
| 2-5.1-r1 | 2-CS-02 | Giving up one good thing to get another, like battery life for wireless, is a… | tradeoff | protocol | checksum | variable |
| 2-5.1-e1 | 2-CS-02 | A plant-watering gadget needs to know if soil is dry. Which part? | a moisture sensor | a speaker | a screen | a bigger battery |
| 2-5.1-e2 | 2-CS-02 | Bluetooth sensor vs a cable: the tradeoff is… | mobility vs extra battery use | colour vs size | sound vs picture | price only |
| 2-5.1-e3 | 2-CS-01 | Users say the gadget's text is too small outdoors. Best improvement? | a bigger, brighter text option | more buttons | a longer cable | a cheaper case |
| 2-5.2-r1 | 2-CS-03 | Replacing a part with one you know works, to find the fault, is a… | swap test | restart | backup | checksum |
| 2-5.2-e1 | 2-CS-03 | The printer prints from one laptop but not another. Where is the fault most likely? | the first laptop or its connection | the printer | the paper | the building's power |
| 2-5.2-e2 | 2-CS-03 | What does "change one thing at a time" do for troubleshooting? | shows which change fixed it | makes it faster | fixes everything at once | avoids testing |
| 2-5.2-e3 | 2-CS-03 | "Is it plugged in?" or "replace the main board": which check comes first, and why? | is it plugged in, because it is cheap and quick | replace the board, because it is thorough | both at the same time | neither, ask for help first |
| 2-5.3-r1 | 2-DA-07 | Showing the same data in a different form, like binary or RGB, is a different… | encoding | packet | password | processor |
| 2-5.3-e1 | 2-DA-07 | Binary 1010 is… | 10 | 5 | 12 | 101 |
| 2-5.3-e2 | 2-DA-07 | Which three numbers make pure red in RGB? | 255 0 0 | 0 255 0 | 0 0 255 | 255 255 255 |
| 2-5.3-e3 | 2-DA-07 | How many different colours can 2 bits per pixel show? | 4 | 2 | 8 | 16 |

**`csq-u6-2` · CSQ Unit 6 · Tech Choices (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u6-o1 | 2-IC-20 | A benefit that comes with a cost is a… | tradeoff | protocol | pixel | parameter |
| 2-6.1-r1 | 2-IC-20 | Doing a task by machine instead of by hand is… | automation | encryption | decomposition | crowdsourcing |
| 2-6.1-e1 | 2-IC-20 | Driverless cars might… | reduce some accidents but change drivers' jobs | have no downsides at all | have no upsides at all | need no software |
| 2-6.1-e2 | 2-IC-20 | Self-checkout: faster lines for shoppers; the career tradeoff is… | fewer cashier jobs, new technician jobs | more cashier jobs | no change to jobs | cheaper food only |
| 2-6.1-e3 | 2-IC-20 | A map app that picks your route saves time. A cost is… | you may stop learning your way around | it never works | it is always wrong | it needs no battery |
| 2-6.2-r1 | 2-IC-21 | When a technology works worse for some groups because of how it was built or tested, that is… | bias | accessibility | a protocol | a loop |
| 2-6.2-e1 | 2-IC-21 | Face unlock works badly for some skin tones. Most likely cause? | it was tested with a group that all looked alike | phones are too small | nobody uses it | it is a cipher |
| 2-6.2-e2 | 2-IC-21 | A "best lunch" survey skipped every vegetarian. The result is… | biased, because a group is missing | perfect | random | encrypted |
| 2-6.2-e3 | 2-CS-01 | Users struggle to read the screen in bright sun. Which recommendation helps them and others? | a high-brightness, high-contrast mode | smaller text | more icons | a longer cable |
| 2-6.3-r1 | 2-IC-23 | Tricking a person into giving away information, like a fake "office" message, is… | social engineering | a checksum | a protocol | automation |
| 2-6.3-e1 | 2-IC-23 | Posting your full name, school and daily route online is risky because… | strangers can use it to trick or find you | it uses too much data | it is boring | it is illegal everywhere |
| 2-6.3-e2 | 2-IC-23 | Making your high scores public: a benefit is competition; a risk is… | it shows who played and when | the game gets slower | the art gets worse | nothing at all |
| 2-6.3-e3 | 2-AP-16 | You use a library's code in your game. The licence asks for… | attribution (credit as it asks) | nothing at all | deleting it later | a password |

**`csq-u7-2` · CSQ Unit 7 · Make Your Own Game (6-8)**

| id | cat | question | right | wrong | wrong | wrong |
|---|---|---|---|---|---|---|
| 2-u7-o1 | 2-AP-18 | A plan of who does what by when, for a team project, is a… | timeline | storyboard | checksum | variable |
| 2-7.1-r1 | 2-AP-13 | Breaking a game into "menu", "play loop", "scoring" before building is… | decomposition | encryption | automation | debugging |
| 2-7.1-e1 | 2-AP-18 | Your team has 3 sessions and 4 features. You should… | set milestones and split the features | build everything at once | skip planning | let one person do it all |
| 2-7.1-e2 | 2-AP-13 | Which plan is best decomposed? | start screen · play loop · scoring · end screen | "the whole game" | "make it fun" | "add levels" |
| 2-7.1-e3 | 2-AP-10 | A 6-box flowchart of your game's main rule helps because… | it shows the decisions before you build | the Builder requires it | it is prettier | it replaces testing |
| 2-7.2-r1 | 2-AP-17 | A table of input, expected, actual and pass/fail is a… | test table | storyboard | credits list | timeline |
| 2-7.2-e1 | 2-AP-17 | Why write test cases before you test? | so you check what matters, not just what you notice | because testing is optional | to use more messages | so the Builder rests |
| 2-7.2-e2 | 2-AP-17 | The score goes up when you lose a life. Which message is best? | "Expected the score to stay the same when a life is lost; it goes up by 1. Fix that." | "broken" | "make it harder" | "add a boss and music" |
| 2-7.2-e3 | 2-AP-17 | Which is a good range of test cases for a timer? | start, halfway, and the last second | only the start | none, timers always work | a random tap |
| 2-7.3-r1 | 2-AP-15 | Changing your game because of what players said is… | incorporating feedback | automation | encryption | decomposition |
| 2-7.3-e1 | 2-AP-15 | Feedback from many testers helps because… | different players find different problems | one tester is always enough | it is faster | testers are smarter |
| 2-7.3-e2 | 2-DA-09 | 7 of 9 testers rated level 2 "too hard". Which change does the data support? | make level 2 easier, then test again | make level 1 harder | add a level 3 | change the title |
| 2-7.3-e3 | 2-IC-22 | Pooling every team's tally sheets is an example of… | crowdsourcing feedback | encrypting data | a protocol | decomposition |
| 2-7.4-r1 | 2-AP-19 | A "How to play" card and a "How it works" note are… | documentation | variables | protocols | test cases |
| 2-7.4-e1 | 2-AP-19 | Documentation makes a program easier to… | follow, test and debug | sell | encrypt | shorten |
| 2-7.4-e2 | 2-AP-19 | Which "How it works" line is most useful? | "score goes up by 10 per star; lives at 0 ends the game" | "it works well" | "trust me" | "it is a game" |
| 2-7.4-e3 | 2-AP-16 | Credits in your game should name… | the template, art and ideas you reused | your home address | your password | nothing |

### 6.4 Live hosting

Warm-ups: `/live?mode=quest-race&set=<id>&class=<cid>&cl=<clid>&step=<stepId>` (1B) / `mode=battle` (2); the bound step
gets each student's `gameScore(..., 'live')`. Exit tickets hosted live: `mode=battle`, 20 s, the exit set. Unit review:
`mode=board&set=<reviewSetId>`. Dashboard "needs help" tells the teacher whom to visit during Play. English-only items show
verbatim in every UI language (read-aloud uses the page-language voice; the notes say so for ELL classes).

---

## 7. Would You Rather (Live) · Tech choices

Two new topics: **`tech`** (20 items, lesson 6.1, starter `wyr:tech:10:20`) and **`online`** (10 items, lesson 6.3, starter
`wyr:online:8:20`). Data: `scripts/data/would-you-rather/en.json` items `{ id: 'tech-1', cat: 'tech', a: {text ≤ 60, tags},
b: {...} }` with English fallback per item in the 12 other files (bank stays ≥ 90%: 414 + 30), `cat.tech` / `cat.online`
in `ui.json` ×13, `TOPICS` (`server/live/wyr.js`) and `CATS` (`scripts/wyr-bank.js`), `node scripts/wyr-bank.js`, seed,
`live-wyr-atlas.test.js` topic count. Prompts and CSTA ids live in **`seed-lessons/cs-quest/wyr-tech.json`** (the WYR
format has no room). All tags are from the real `TAGS` list. Unscored; class split + all-time split at the reveal.

| id | A | B | tags A / B | prompt (after the reveal) | CSTA |
|---|---|---|---|---|---|
| tech-1 | A robot that cleans your room | A robot that cooks your dinner | make / food | Who is helped? What would the robot need to sense? | 1B-IC-18 / 2-IC-20 |
| tech-2 | A phone that never needs charging | Internet that never drops | tech / calm | Which one changed how people live more? | 1B-IC-18 |
| tech-3 | A self-driving school bus | A bus with a driver you know | brave / social | Who gains, who loses a job, who do you trust? | 2-IC-20 |
| tech-4 | Learn from a video you can pause | Learn from a person you can ask | think / social | How has technology changed learning? What did it not change? | 1B-IC-18 |
| tech-5 | A watch that counts your steps | A watch that reminds you to drink water | fast / kind | What data does each collect? Who should see it? | 2-IC-23 |
| tech-6 | Video-call your grandparents every day | Visit them once a month | social / kind | What did people do before video calls? | 1B-IC-18 |
| tech-7 | A voice helper that knows everything | One that never listens unless you press a button | think / calm | What is the tradeoff between handy and private? | 2-IC-23 |
| tech-8 | A game that is free but shows ads | A game you pay for once with no ads | fun / think | How does the free game make money? | 2-IC-20 |
| tech-9 | Live in a town with no internet for a week | With no cars for a week | nature / brave | Which would change your day more? Why? | 1B-IC-18 |
| tech-10 | A robot teacher for a day | A robot referee for a game | tech / fun | What can a robot not do well here? | 2-IC-20 |
| tech-11 | A map app that picks your route | A paper map and your own choices | fast / think | What skill might you lose? What do you gain? | 2-IC-20 |
| tech-12 | Translate any language with your phone | Learn one language really well | tech / think | How might this change jobs for translators? | 2-IC-20 |
| tech-13 | A 3D printer that makes toys | A 3D printer that makes spare parts for broken things | fun / make | Which helps more people? | 1B-IC-18 |
| tech-14 | Headphones that block all noise | Headphones that let safe sounds through | calm / kind | Who needs to hear the street? Who needs quiet? | 1B-IC-19 |
| tech-15 | A drone that delivers your lunch | A friend who brings it on a bike | fast / social | What job changes? What is nicer? | 2-IC-20 |
| tech-16 | A smart fridge that orders food | A shopping list on paper | tech / calm | What does the fridge know about you? | 2-IC-23 |
| tech-17 | Every lesson on a tablet | Every lesson on paper | tech / make | What is better on each? Who is left out by each? | 1B-IC-19 / 2-IC-21 |
| tech-18 | A robot arm that helps a doctor | A robot that helps a farmer | kind / nature | Which jobs change? Which get safer? | 2-IC-20 |
| tech-19 | Computers that write songs | Computers that only play songs people wrote | make / think | Who should get the credit for a computer-made song? | 1B-AP-14 / 2-AP-16 |
| tech-20 | A job building robots | A job fixing robots | make / tech | Which skills from CS Quest does each need? | 2-IC-20 |
| online-1 | Everyone online can see your drawing | Only your family can see it | brave / social | What could go right? What could go wrong? | 2-IC-23 / 1B-IC-21 |
| online-2 | Share one photo with the whole world | Share ten photos with ten friends | social / calm | Who else might see them later? | 2-IC-23 |
| online-3 | A nickname online that nobody knows | Your real first name online | think / social | What does a stranger learn from a real name? | 1B-NI-05 / 2-IC-23 |
| online-4 | An app that is free if it sees where you are | An app that costs a little and never knows | think / calm | What are you paying with? | 2-IC-23 |
| online-5 | Ask a grown-up before every download | Never download anything | kind / calm | What is the middle path? | 1B-NI-05 |
| online-6 | Tell a friend your passphrase so they can help | Fix it alone and take longer | brave / think | Who may know your passphrase? | 1B-NI-05 / 2-NI-05 |
| online-7 | Save your photos only on your tablet | Also keep a copy somewhere safe | calm / think | What happens when the tablet breaks? | 1B-NI-05 / 2-NI-05 |
| online-8 | Use a picture someone else made and credit them | Draw your own, even if it is worse | make / kind | What does credit do for the artist? | 1B-IC-21 / 1B-AP-14 |
| online-9 | A class page where anyone can comment | One where only your class can | social / calm | Who might comment? Who moderates? | 2-IC-23 |
| online-10 | Delete an old post you are embarrassed by | Leave it and laugh | brave / fun | Is anything online ever really gone? | 2-IC-23 |

Discussion scaffold printed with 6.1/6.3: "Who chose A and why? What could go wrong with A? With B?"; 2 adds "Who is
helped, who is hurt, what job changes?" (2-IC-20) / "What is public, what is private, who else could see it?" (2-IC-23).

---

## 8. Builder capstone (unit 7)

### 8.1 Planning sheet (printable; also three `question` steps so it is saved and rubric-marked)

| Box | Explorer (3-5) | Pro (6-8) |
|---|---|---|
| Title (working) | no names | no names |
| Who is it for? | a player type (younger kid, grandparent, a friend who likes …) or one of the 6.2 "Design for" users | user card: age, device, one need (text size, captions, one hand) |
| The one-sentence game | "You are a ___ who must ___ before ___." | pitch + genre + win/lose rule |
| Parts (decomposition) | 3-4 boxes: start screen, playing, winning, losing | feature tree: 3 features → 2 sub-parts each; mark must / nice |
| The main rule | `if … then …` | a 6-box flowchart (described in words in the question step) |
| One variable the player can see | score, lives or time | variables table: name, type, starts at, changes when |
| What the player sees first | one sentence | storyboard of 3 panels + the "How to play" text |
| Roles | designer/typist · tester/note-taker (swap in 7.2) | + recorder; timeline: period 2 build core, 3 test and fix, 4 credits and demo |
| Reused and credited | "I reused: ___ (template / classmate idea)" | credits block: template, ideas, kit art; the exact credit line |
| Accessibility check | tick: big buttons, read-aloud on, colours + shapes | tick 5: text size, contrast, captions, one hand, no flashing |
| **The Builder message** (≤ 300 chars; the step prefill limit) | 300-char box | 300-char box |
| Test plan | 3 things to try | 5-row test table: input, expected, actual, pass? |

### 8.2 Builder etiquette card (stays on the desk)
One change per message · say what you saw and what you expected · 10 messages for the whole project (the school-plan
budget) · play your game after every change · never type your full name, school, address or anyone else's name · if the
Builder is "resting", switch to the paper prototype · demos show the game, not the chat.

### 8.3 Rubric (teacher marks 0-3 per line on the lesson progress page: PLATFORM P11; 0 missing · 1 attempted · 2 meets
· 3 exceeds). The ids are what the Standards tab counts as **Applied**.

| Line | Evidence | 1B ids | 2 ids | "3" looks like |
|---|---|---|---|---|
| Plan | sheet before building; user named; parts; partner note used | 1B-AP-13, 1B-AP-11 | 2-AP-13, 2-AP-10, 2-AP-15 | the plan changed after the partner note and the change is visible in the game |
| Roles / timeline | roles rotated (1B); timeline kept and ticked (2) | 1B-AP-16 | 2-AP-18 | three roles / three milestones with dates |
| Program (builds toward only) | a visible variable, a condition or loop the player can see | *builds toward 1B-AP-09/10* | *builds toward 2-AP-11/12* | not counted as evidence |
| Test with others | ≥ 2 (1B) / ≥ 4 (2) tester cards; one change made and explained; (2) change justified by the tally; pooled class tally | 1B-AP-15, 1B-IC-20 | 2-AP-17, 2-AP-15, 2-DA-09, 2-IC-22 | second round of ratings recorded after the change |
| Explain & credit | 60-s demo names one choice and why; how-to-play; (2) how-it-works; credits list template, art, ideas, testers | 1B-AP-17, 1B-AP-14, 1B-IC-21 | 2-AP-19, 2-AP-16 | the reason refers to the user's need; documentation would let a classmate change the game |

### 8.4 Peer play-testing protocol (7.3)
Hand in **at the start** (class visibility; clean scan instant, flagged → maker's screen). Three rotations of 5 minutes;
roles Player / Watcher (maker, silent, notes where the player hesitates) / Note-taker. Explorer card: 4 faces (fun / clear
/ fair / would play again) + 1 word tile from 8. Pro card: 5-row 1-5 tally incl. "too easy ↔ too hard" and "I got stuck
at…" tapped on a storyboard panel. Cards are paper (or the tester's own Data Detective *My Data* tally: per-player save,
nothing crosses players). Rotation 3: tally (2: My Data → bar → claim), **one** fix message, re-hand-in. Rules: be
specific, be kind, say what not who, never type a name; the maker says "thank you" only.

### 8.5 Class-sharing safety (stated for teachers)
Hand-in never widens beyond the class; every version is statically scanned; flagged builds wait for a human; the teacher
removes/restores class games on the Games tab; no in-game chat; testers' words reach the maker only through paper or the
teacher-visible question step; credits use first names or avatars; `cleanText` filters titles and descriptions; schools
with `publishing: 'school'` keep games inside the school.

### 8.6 Budget and scheduling (honest numbers)
15 teams × ~8 messages ≈ 120 turns per period: still beyond the free **site-wide** $5/day pool (which would switch every
site user to the mock). The program page says: **unit 7 needs a school plan** (≥ 25 seats ≈ 2,500 messages/year, 30 per
person per day) or an admin-raised budget; one build runner → teams start when approved, never all at once; the paper path
is half of 7.2 by design; student sessions end after 1 h idle (login cards each period); no deploys in class hours. The
plan page's **Builder status** line (on / resting, from the AI budget state) is shown the morning of.

---

## 9. Assessment and tracking

### 9.1 Three tiers of evidence (per standard, per class)

| Tier | Meaning | Source today | Needs |
|---|---|---|---|
| **Practiced** | the student completed a step tagged with the id | `step_progress.status='done'` × `lesson_steps.standards` (+ `live_run_scores` on runs whose items carry the id) | PLATFORM P3 |
| **Checked** | accuracy on exit-ticket / live items tagged with the id | `step_progress.marks` × `lesson_steps.items[i].cat`; `live_run_scores.marks` × `live_runs.items[i].cat` | PLATFORM P4 (keep `cat`), P7 |
| **Applied** | teacher rubric mark ≥ 2 on a question/build step whose rubric line carries the id | new 0-3 marks per rubric line in `step_progress.marks` for question/build steps | PLATFORM P11 |

Mastery rule (v1, shown as raw numbers so a district can apply its own): a student *meets* an id when ≥ 2 of 3 items on
the most recent exit ticket tagged with it are right **or** a rubric line ≥ 2; a class *meets* when ≥ 80% of students meet.

### 9.2 Exit tickets at 0:45
3 MC items (quiz step, auto-marked, `score` = % right, `marks` = `1/0/-` per item, `cat` kept) + one sentence (question
step; teacher reads and gives feedback from the lesson progress page). Fallbacks: live (Question Battle, 20 s; marks land
in `live_run_scores`) or paper. The lesson progress grid already shows ✅/◐, `score + label` ("5/7 levels, 12 stars, 4/5
checks"), quiz % and unread answers: nothing new is needed for *this lesson, today*.

### 9.3 In-game formative check (Case-closed card)
In lesson mode every level ends with one 3-tile concept check (from the level's `check` field, tagged with the level's
`csta`) and a confidence face. The chapter tally rides in the label (`4/5 checks`); with `brb:progress` (phase 2) each
check is stored per level. Teachers use it with the look-fors; it is not a grade.

### 9.4 The class **Standards** tab (`/class/:id/standards`, `.csv`, `?report=1`) — PLATFORM P12
Rows = CSTA ids grouped by concept, for the band(s) of the lessons assigned to the class (toggle: all 44). Columns:

| Column | Meaning (legend text) |
|---|---|
| Lessons | assigned lessons that tag it (links; open/due state) |
| Practiced `17 / 26` | students with ≥ 1 done step carrying the id ("did the activity") |
| Checked `72% · 6 items · 24 students` | mean per-item accuracy on items tagged with the id, with counts ("three questions, not a test") |
| Applied `2.1 · 12 marked` | mean rubric mark 0-3 and students marked |
| Needs a look | students with 0 of ≥ 2 checked items right (teacher only) |
| Last | latest done / run date |
| Status | Not yet · Assigned · Practiced · Checked · Meets (≥ 80%) |

Legend: *Practiced* means the step was completed by the signed-in student (pairs: alternate who signs in), not mastery;
coverage is claimed **per class**. Per-student drill-down inside the class (never on a projector or public page; deleted
with the class like the gradebook; `onClassLeave` / `onAccountMerge` hooks). CSV is formula-injection-safe like
`progress.csv`. `?report=1` prints the **principal's coverage report**: aggregate only (lessons taught with dates, items
asked per id, class accuracy, rubric means; no student names). Query: one grouped SQL over `class_lessons (removed_at IS
NULL) → lesson_steps → step_progress` by id × student, union `live_runs(class_id) → live_run_scores` by `items[i].cat`, in a
new `server/services/standards.js`; ids and statements from `server/standards/csta.js` (loads the JSON: a 2024/state
crosswalk is a data file).

### 9.5 Keeping the map honest (CI) — `tests/unit/cs-quest-catalogue.test.js`
For every id in `csta.json` with level 1B or 2: (a) ≥ 1 lesson of that band lists it as primary; (b) ≥ 1 bank item of that
band has `cat` = id; (c) if the id is in a unit-7 lesson's primary list, a rubric line carries it; (d) every `cat`,
`standards`, `csta`, `csta2` value in the catalogue, the WYR prompts file and the four games' level data is a real id;
(e) every lesson's plan blocks sum to 45 and its steps fit `L.cleanStep` limits (title 100, body 4000, ≤ 40 steps, minutes
0-240) and `SETS.LIMITS`; (f) every game chapter named in a lesson exists in that game's data with that band and the
quest code matches the chapter index; (g) every exit item's `cat` is a primary id of its lesson; (h) every `options` string
matches the params grammar; (i) the practices table has every practice in ≥ 3 units; (j) every set has ≥ 10 items with 4
choices and no digit run ≥ 7, `@`, `//`. `scripts/cs-quest-coverage.js` prints the map (Markdown/HTML) from the same data
for `/teach/cs-quest/coverage` and the docs.

### 9.6 What a teacher can honestly claim
With P3/P4/P7/P11: "every student practised 1B-AP-10 in three lessons; the class averaged 71% on the nine U1 items tagged
1B-AP-10; 24 of 26 reached 4/5 checks in Loops." Day one without them: "every student played the Loops lesson (done),
best label, and the class's live results per question." The program page says which one the school is getting.

---

## 10. How teachers reach it

### 10.1 Pages

| Page | Who | What |
|---|---|---|
| `/teachers/cs-quest` (public, indexed) | anyone | the promise (8 bullets), the Byte Crew with four *Try it* buttons (`launchGame`), the seven units with lesson titles and ids, the four paths, how-it-works screenshots (`STEPS.teachersCs`: program page → plan page → warm-up live → game at chapter → standards tab; `how-shots.js --only cs`), the coverage-map teaser, FAQ (devices, time, no CS background, standards, privacy, capstone needs a school plan: no price), *Set up my school* / *Sign in*. Copy under `teachers.cs.*` (uncounted, English-first, `el()`/`fb()`); `LOCALIZED`, `sitemapEntries`, `seo.test.js PUBLIC`, `langsWithKey('teachers.cs.h1')`, OG image; JSON-LD `Course`/`LearningResource` with `educationalAlignment` naming "CSTA K-12 CS Standards 2017" and each id. No child names, no prices. |
| `/learn/computer-science` (public) | parents, kids, search | `HUBS` entry (key `cs`, 💻) with the four games, `LEARNING` entries (`teaches`, `Grades 3-8`), `CONTENT_UPDATED`. |
| `/teach/cs-quest` (staff) | teachers, school admins | **Program page**: band toggle (remembered), units as cards with lesson rows; per lesson *Open plan*, *Preview game* (projector mode), *Added ✓ / Add*; per unit *Add unit*; top: *Add Full / Core 10 / CS Ed Week / Device-first*; **Before you start** box: devices tested (`/play/robo-route` works signed out), live on, quiz steps on (`QUIZ_STEPS`), a class you teach (live hosting needs it), school time zone, Builder status + school plan for unit 7; link to `/teach/cs-quest/coverage`. Linked from `/teach` (card next to *Lesson library*) and the library tools row. |
| `/teach/cs-quest/coverage` (staff; `?print=1`) | teachers, principals | the program coverage map (44 ids → lessons, chapters, item counts, rubric lines, practices; extension-only notes), generated by `scripts/cs-quest-coverage.js`. |
| `/teach/cs-quest/:key` (staff) | teachers, subs | **Plan page** = the printed plan rendered (§10.3) with buttons: **Start warm-up (live)** · **Show questions on the projector** · **Open game at this chapter** (projector mode, new tab; shows the quest code large) · **Assign to class** (materialises first if needed; existing assign dialog) · **Assign unit…** (start date + cadence: every school day / twice a week / weekly → `opens_at` per lesson in the school zone: PLATFORM P17) · **Host exit ticket live** · **Print** (`?print=1`) · **Printables** (`?sheet=<name>`) · band switch; state chips *In your library · Open* / *Update available* / **Reset to the CS Quest version** (re-materialises a fresh copy; the old one keeps student work). Unit 7 pages show the **Builder status** line. |
| `/teach/lessons/:id` (existing editor) | teacher | the materialised copy, fully editable; banner "From CS Quest 1.2 (v3) · Open the plan page" via `lessons.template_key/template_version`. |
| `/class/:id/standards` (new tab) | class managers | §9.4. |
| `/class/:cid/lessons/:clid` (existing student page) | students | *Play* carries `?lesson&step` + `options`; Play hidden on mode-game steps ("Your teacher hosts this live"); quiz, question and build steps as today. |

### 10.2 The buttons, end to end
1. **Start warm-up (live)**: materialise if needed (lesson + derived sets, < 1 s) → `/live?mode=quest-race|battle&set=<id>&class=<cid>[&cl&step]` preselected → *Open the room* → join code on the projector. School admins who do not teach the class get the existing `notTeacher` message with a hint to use an open room.
2. **Show questions on the projector**: a projector-sized page of the 5 items (one per screen, tap to reveal the answer; no login, no room).
3. **Open game at this chapter**: `/play/<slug>?chapter=…&band=…&mode=projector` (teacher preview; falls back to the quest code shown large until `BRB.params` lands).
4. **Assign to class** / **Assign unit…**: materialise if needed, then assign (unit, opens, due or cadence; time-zone note).
5. **Print**: server-rendered `.printdoc` + `/js/print.js`; `?band=2` prints the other band.

### 10.3 Printable lesson format (generated from the catalogue, never from student steps)
- **Page 1 — the plan**: header (title, unit, band, 45 min, standards with statements, practices); I can; vocabulary;
  materials; the minute-by-minute table; the projector script (*Say this / Do this / Ask this*, big idea); look-fors and
  the misconception of the day; differentiation (support / stretch); the **quest code** large.
- **Page 2 — the rest**: unplugged twin (steps, minutes, materials); the boxed **Sub plan** (three sentences); teacher
  notes; discussion prompts; the class login-card reminder (`/cards/:k`).
- **Printables** (page breaks; black on white, no images, kit-free HTML): grid mats, arrow/loop/if cards, bug cards, tally
  sheets, envelope-relay picture, lock-sort cards, cipher wheel, parts/role cards, help-desk tickets, binary cards and
  pixel grids, invention timeline cards, accessibility audit sheet, licence badge cards, planning sheet, etiquette card,
  test table, 2-stars-and-a-wish, playtest tally, rubric.
- **Exit ticket half-sheets** (2 per page) and the **answer key** (its own page break, teacher-only).

### 10.4 Mechanism: catalogue + materialiser (map-teach §1.10 option 1) — PLATFORM P15
- **Catalogue**: `seed-lessons/cs-quest/lessons/<band>/<unit>.<n>.json` (46), `units.json` (names, order, paths),
  `sets/u<n>-<band>.json` (14), `wyr-tech.json`, `printables/*.html`. Schema in Appendix A; validated by §9.5.
- **Materialiser** `server/services/lesson-templates.js`: `addToLibrary(user, schoolId, key)` → folder *CS Quest* → subfolder
  per unit → `L.createLesson` (title, subject `Computer science`, grade `Grades 3-5` / `Grades 6-8`, summary, objectives =
  I-can lines, `template_key`, `template_version`) → `L.addStep` per step (§2.3) with `options`, `standards`, `template`;
  `SETS.createSet` for the derived warm-up and exit sets (`lesson_id` set) and the unit review set once per unit;
  `addQuizStep` from the exit set with `cat` kept (or the text fallback when `QUIZ_STEPS` is off). A game step whose game is
  not published becomes a **text step "game not available yet"** (never silently skipped). Idempotent per `(owner, key,
  version)`; *Add again* makes a fresh copy; a newer catalogue version shows *Update available* (new copy; the edited one is
  left alone: assignments are live links).
- **Routes** (`server/routes/cs-quest.js`, mounted in `server/app.js`): `POST /api/lessons/from-template/:key`,
  `/unit/:unit`, `/path/:path` (rate-limited like `lesson-new`), `POST /api/classes/:id/assign-unit` (cadence), the pages
  above. Requires `isStaffOf` some school.
- Why not official lesson rows: the ownerless concept touches every permission helper; the catalogue path makes assign,
  progress, live, gradebook, copy and share work unchanged, and teachers can edit their copy.

---

## 11. Platform additions (consolidated; all small; listed once)

| # | Change | Where | Why | Owner |
|---|---|---|---|---|
| P1 | **`BRB.params`**: `/play/:slug` reads allow-listed `chapter band mode level lock` (`[a-z0-9-]{1,16}`, `band ∈ 1b|2`, `level 1-30`, `lock 0|1`), packs `o = chapter.band.mode.level.lock` (≤ 40) into the signed token, `/frame` copies `init.params`, SDK exposes a frozen object (`{}` when absent) | `routes/games.js`, `brb-sdk.js`, `docs/sdk.md`, `sdk-protocol`/`visibility` tests | lesson link opens the right chapter; `lock` makes the cell honest | A (platform-slice) |
| P2 | `lesson_steps.options TEXT` (query-string grammar above), appended to the Play link | `db.js`, `lessons.js cleanStep`, `routes/progress.js` | the step carries the params | A |
| P3 | `lesson_steps.standards TEXT` (comma ids) + `server/standards/csta.js` (loads the JSON) | `db.js`, `lessons.js` | Practiced tier | A |
| P4 | keep `cat` (+ `secs`) through `addQuizStep` snapshots and `classlive-results.itemRow` | `lessons.js:234`, `classlive-results.js:80` | Checked tier | A (lessons.js), B (classlive-results.js) |
| P5 | Host-live link emits `mode=` via `liveGameOf`; student page hides Play on `MODES`-slug steps | `routes/progress.js:244,286` | bound warm-up step | A |
| P6 | `/live?starter=<wyr:…|bank:…>` preselects topics/count/secs | `routes/live.js:166-171`, `views/live.js` | deterministic WYR from a button | B |
| P7 | **`QUIZ_STEPS` flag (default on)** gates quiz steps and their student APIs; `LIVE_HOMEWORK` keeps "Set as homework" | `config.js`, `routes/live.js:650`, `routes/progress.js`, README | exit tickets | A |
| P8 | `copyLesson` copies `set_id` and regenerates `items` of quiz steps | `lessons.js:191` | colleagues' copies keep exit tickets | A |
| P9 | `lessons.template_key`, `template_version` | `db.js`, `lessons.js` | banner, updates, reset | A |
| P10 | `lesson_steps.template` (one of `TEMPLATE_KEYS`) → `templateHtml(key)` on the build route | `db.js`, `routes/progress.js:307` | capstone starts from Quiz Show | A |
| P11 | review `marks` 0-3 per rubric line on question/build steps (API + form + gradebook display) | `progress.js review()`, `routes/progress.js`, views | Applied tier | A |
| P12 | Standards class tab + CSV + principal report + `school.classTabs.standards` ×13 + deletion hooks | `routes/schools.js CLASS_TABS`, new route, `services/standards.js`, `schools.css` | §9.4 | A |
| P13 | lesson plan page + print view (`.printdoc`, `/js/print.js`) + projector-questions page | `routes/cs-quest.js`, views | printable plans | A |
| P14 | WYR topics `tech`, `online` (data ×13, `ui.json`, `TOPICS`, `CATS`, pack rebuild, seed, test count) | `scripts/data/would-you-rather/**`, `wyr.js`, `wyr-bank.js` | unit 6 | B |
| P15 | catalogue + materialiser + routes + pages + CI test + coverage script | `seed-lessons/cs-quest/**`, `services/lesson-templates.js`, `routes/cs-quest.js`, `app.js`, tests | delivery | A (+ B for sets) |
| P16 | `covers.js` merges recipes from `scripts/covers/*.recipe.js` | `scripts/covers.js` | game owners own their recipe file | integration |
| P17 | `POST /api/classes/:id/assign-unit` with cadence → `opens_at` per lesson | `routes/cs-quest.js`, `lessons.js assign` | 23 date pickers → 1 | A |
| P18 | Builder status endpoint for the plan page (AI budget resting / on) | `routes/cs-quest.js` reading `ai-budget` | morning-of switch to paper | A |
| P19 | seed/scan/e2e registrations: `SEED_GAMES`, scanner slug lists, `seeds.spec.js`, covers + OG run, `docs/decisions.md`, `docs/status.md` | `scripts/seed.js` etc. | ship | integration |
| Phase 2 | `brb:progress` (`BRB.progress(detail)` → `play.js TYPES` → `/api/progress/:cl/:step/game {event:'progress'}` → `step_progress.detail` + `step_progress_events` capped 200/cell) · class level shelf (numeric payloads) · survey mode for live sets · `computing` bank subject · `games.standards` | SDK, page, routes, tables | per-level evidence; shared levels; polls | later |

### 11.1 i18n rules
- **English-only data** (never in locale files): lesson text, step bodies, quiz items, WYR dilemma text (English fallback
  per item in the 12 files is allowed), prompts, rubric lines, printables, CSTA ids and statements (shown with `el()` as
  `lang="en"`), game level data.
- **Must be in all 13 locale files**: every piece of chrome: `cs.*` (program page, plan page buttons, banners, toasts,
  state chips, Standards tab headings, legend, status words, CSV headers, "Your teacher hosts this live", "game not
  available yet"), `school.classTabs.standards`, `js.cs.*` for any browser module, `live.cs.*` (B: anything new on `/live`),
  WYR `cat.tech` / `cat.online` in `ui.json`, and every **in-game string** of the four games (own packs, 13 locales,
  identical `{slots}`). Public landing copy goes under `teachers.cs.*` (uncounted; English-first; rendered with `el()`).
- Namespaces per owner to avoid conflicts: A `cs.*`, `js.cs.*`, `school.classTabs.standards`, `teachers.cs.*`, `learn.cs*`;
  B `live.cs.*` + the WYR `ui.json`; games touch no locale file. Each owner appends its own block at the end of each
  locale file and runs `npm run i18n:check`.

---

## 12. Build order, ownership, risks

### 12.1 Build order (so a teacher can use something early)
1. **platform-slice** (A): P1-P5, P7-P11, P17-P18 with tests and docs. Unblocks the materialiser's `options`/`standards`/
   quiz steps; games do not wait for it (quest codes).
2. **robo-route** (C), **data-detective** (D), **packet-post** (E), **inside-the-machine** (F) in parallel; Robo Route
   chapters 1-3 first (unit 1 is half the program). **live-sets** (B) in parallel: the 14 banks, WYR topics, P6, P4-live.
3. **curriculum** (A): catalogue, materialiser, pages, print, Standards tab, CI test, coverage script, `/learn` hub, SEO.
4. **integration**: seed list, scanner lists, `seeds.spec`, covers loader + run, OG, `decisions.md`, `status.md`, full
   `npm test` + fit audit on the four slugs + i18n check; the public page claims coverage only after the CI test is green and a
   teacher review pass (two classroom teachers, one per band) has read the plans and items.

### 12.2 Work items (files per owner; detail in the StructuredOutput `workItems`)
Shared-file rules: `scripts/seed.js SEED_GAMES` (one single-quoted array literal), both scanner slug lists, `tests/e2e/
seeds.spec.js` and `docs/decisions.md` are edited **only by the integration item**; `scripts/covers.js` gets the recipe
loader once (integration) and game owners write `scripts/covers/<slug>.recipe.js`; locale files follow §11.1 namespaces;
`server/services/lessons.js`, `progress.js`, `routes/progress.js`, `db.js`, `config.js`, `routes/games.js`, `brb-sdk.js`,
`play.js` belong to A's platform slice; `server/routes/live.js`, `views/live.js`, `server/live/**`, `classlive-results.js`,
`scripts/wyr-bank.js`, `scripts/data/would-you-rather/**`, `seed-lessons/cs-quest/sets/**`, `wyr-tech.json` belong to B;
each game owns `seed-games/<slug>.*`, `scripts/data/cs-quest/<slug>/**`, `public/vendor/data/<slug>/**`,
`scripts/covers/<slug>.recipe.js`, `tests/unit/<slug>.test.js`, `tests/e2e/<slug>.spec.js`. The shared i18n scaffold
`scripts/cs-quest-i18n.mjs` and the content lint test belong to C (Robo Route) and are used by D/E/F read-only.

### 12.3 Risks (kept from the designs, with the mitigation we chose)
Scope (four Code-Isle-sized games): lean level counts, ship by unit, Core 10 first. `BRB.params` not landing: quest codes
day one. Warm-up timing: projector form, 5-minute login. Quiz steps gated: `QUIZ_STEPS` default on + paper/live fallback.
Capstone budget: school plan, staggered starts, paper path, status line. Scanner aborts the seed: the content lint test and
the shifted-word check run in CI before the seed. Fit audit on dense editors: each game's Chromium test runs its densest
level at five sizes from day one; `data-fit-dense` only on grids. 13-language in-game text: ≤ 450 strings per game, one
scaffold, parity tests. Level codes can draw a crude 8×8 shape: 6-8 only, teacher previews before projecting. Pairs record
one login: alternate, legend says per class. Standards view read as mastery: raw numbers, honest column names, no
per-student export beyond the teacher CSV. Sessions and deploys: login cards each period; no deploys 8-3 local.

---

## Appendix A — Catalogue JSON (one lesson)

```json
{
  "key": "csq-1b-1.2", "version": 1, "band": "1b", "unit": 1, "n": 2,
  "title": "Again and again (Loops)", "subject": "Computer science", "grade": "Grades 3-5", "minutes": 45,
  "summary": "Students spot repeating steps and replace them with a repeat block in Robo Route.",
  "iCan": ["Spot steps that repeat and use a repeat block", "Say how many times a loop runs"],
  "standards": { "primary": ["1B-AP-10"], "also": ["1B-AP-16"], "buildsToward": [] },
  "vocabulary": ["loop", "repeat", "times", "pattern"],
  "materials": ["projector", "1 device per pair", "Loop Cards printable", "a chime"],
  "doNow": "Write something you do again and again at school. How many times a day?",
  "plan": [["0:00", 5, "Arrive, log in, Do Now"], ["0:05", 5, "Warm-up"], ["0:10", 6, "Explore"], ["0:16", 18, "Play"], ["0:34", 6, "Discuss"], ["0:40", 5, "Exit ticket"]],
  "script": { "say": ["That works. A programmer would be annoyed: we wrote the same thing six times."], "do": ["Delete five, tap repeat, Wrap, set 6, run."], "ask": ["What does the number mean? What if I put 7?"], "bigIdea": "A loop repeats steps so we do not have to write them again." },
  "lookFors": ["repeat placed after the steps instead of around them", "miscounted squares"],
  "misconception": "The number on a loop is how many times the whole bracket runs, not the number of squares.",
  "discuss": ["Show me a level where a loop saved you the most blocks.", "Where else do loops happen: songs, dances, a day?"],
  "game": { "slug": "robo-route", "chapter": "loops", "questCode": "2100", "options": "chapter=loops&band=1b&lock=1", "goal": "4 levels", "stretch": "the chapter, then 3 stars" },
  "warmup": { "mode": "quest-race", "secs": 15, "items": ["1b-1.1-e1", "1b-1.1-e2", "1b-1.2-r1", "1b-1.2-e1", "1b-1.1-r1"] },
  "exit": { "items": ["1b-1.2-e1", "1b-1.2-e2", "1b-1.2-e3"], "sentence": "A loop ___, and programmers like it because ___.", "rubric": [{ "id": "1B-AP-10", "max": 2, "levels": ["none", "says it repeats", "says it repeats and why that helps"] }] },
  "steps": [
    { "kind": "text", "title": "Today", "minutes": 17, "body": "Do Now: ... Big idea: ... We will talk about: ..." },
    { "kind": "game", "title": "Warm-up (live)", "minutes": 5, "gameSlug": "quest-race", "live": "warmup" },
    { "kind": "game", "title": "Play: Loops", "minutes": 18, "gameSlug": "robo-route", "options": "chapter=loops&band=1b&lock=1", "standards": ["1B-AP-10"], "body": "Goal: 4 levels. Stretch: the chapter, then 3 stars. Quest code 2 1 0 0." },
    { "kind": "quiz", "title": "Exit ticket", "minutes": 3, "set": "exit" },
    { "kind": "question", "title": "In your own words", "minutes": 2, "body": "What does a loop do and why do programmers like them? Frame: A loop ___, and programmers like it because ___." }
  ],
  "differentiation": { "support": "...", "stretch": "..." },
  "unplugged": { "title": "Loop Cards", "minutes": 15, "steps": ["..."], "printables": ["grid-mat", "loop-cards"] },
  "subPlan": ["Do Now on paper", "Play chapter Loops in pairs", "Paper exit ticket"],
  "notes": ["Off-by-one bumps are the lesson's best moments.", "Most pairs reach level 5 of 7 in 18 minutes: that is success."],
  "answerKey": { "exit": [0, 0, 0], "sentence": "Repeats steps; saves writing the same thing many times." }
}
```
Bank item: `{ "id": "1b-1.2-e1", "lesson": "1.2", "use": "exit", "cat": "1B-AP-10", "topic": "Loops", "kind": "apply", "secs": 20,
"q": "...", "choices": ["...", "...", "...", "..."], "answer": 2 }`. Unit 7 lessons replace `game` with `build: { template: "quiz",
prefill: "<the sheet's message>" }` or `questions: [...]`; 6.1/6.3 use `live: { mode: "wyr", starter: "wyr:tech:10:20" }`.

## Appendix B — Params and quest codes

- URL (teacher-readable): `/play/<slug>?chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>`; each value
  `[a-z0-9-]{1,16}`; unknown keys dropped; packed token field `o = "<chapter>.<band>.<mode>.<level>.<lock>"` (empty parts
  allowed, ≤ 40 chars); `BRB.params` = frozen `{ chapter, band, mode, level, lock }` (strings; `level`/`lock` as numbers), `{}`
  when absent. Games read `(window.BRB && BRB.params) || {}` defensively.
- Quest code `C B M L` (4 digits, typed on the game's keypad; never 7 digits; hidden in live frames): `C` chapter index
  from the game's chapter table (0 = map), `B` 1 Explorer / 2 Pro, `M` mode index (0 play, 1 debug, 2 maker/tool
  (`maker` in Robo Route, `tally` in Data Detective, `wheel` in Packet Post), 3 projector), `L` level 0-9 (0 = first
  unfinished). The code cannot lock; params win over codes; the game shows "Class quest: <chapter> · <band>".
- Chapter indices: Robo Route 1 sequences · 2 loops · 3 conditionals · 4 variables · 5 functions · 6 debug · 7 best-route ·
  8 level-maker. Data Detective 1 sort · 2 chart · 3 claims · 4 cleanup · 5 models · 6 fair · 7 my-data. Packet Post 1
  packets · 2 routes · 3 protocols · 4 locks · 5 tricks · 6 ciphers. Inside the Machine 1 parts · 2 hw-sw · 3 fixit · 4 bits
  · 5 gadget · 6 design-lab.

## Appendix C — Progress reporting grammar

- After every solved level: `BRB.score.submit(score, label)`, `score = starsInChapter` (integer, monotonic within the
  chapter), `label` matches `^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$` (≤ 40
  chars, ASCII; the `checks` part only in lesson mode). Maker/tally modes: `^\d{1,2} made, \d{1,2} tested$` /
  `^\d{1,2} charts made$`.
- Chapter complete: `BRB.gameOver({ won: true, score: starsInChapter })`.
- Phase 2: `BRB.progress({ game: 'rr'|'dd'|'pp'|'im', chapter, level, stars: 0-3, band: 1|2, csta: ['1B-AP-10'], check: 0|1,
  confidence: 1-3, hint: 0-3, runs, skipped: bool })`, JSON ≤ 1 KB, keys `[a-z][a-zA-Z0-9]{0,23}`, values numbers / booleans /
  `[A-Za-z0-9-]` strings, one per 2 s; the page forwards it only with a lesson context.

---

## Critic additions (completeness pass, 3 Nov 2026; overrides the sections above where they conflict)

Checked programmatically against `contracts.json`, `csta.json` and the §6 tables: `csta.json` holds 21 + 23 = 44 ids
(CSTA level 2 has 23 statements; the "31" in the brief is wrong), every id has a primary lesson in its band outside unit 7,
≥ 1 tagged bank item, every exit item's `cat` is a primary id of its lesson, every quest code matches its chapter index,
band and mode, all 14 bank counts match (202 items, none over the 300/120 limits, no digit runs/`@`/`//`), and all 46
lessons' steps sum to 45. What follows is what did **not** hold or was missing.

### CA-1 `lock=1` semantics and chapter chains (fixes 4.1, 4.3, 5.1 prose vs params, and 6.2 Pro)
- Under `lock=1`: band locked, chapter map and band toggle hidden, start at `chapter`. **At chapter end lesson mode continues
  into the chapter named by the catalogue's `game.then`** for that band (4.1 Explorer `packets → routes`, 4.3 Explorer
  `tricks → ciphers 1-3`, 5.1 Explorer `parts → hw-sw 1-3`); without a `then`, the kit results screen and *Back to class*.
  Each game's level data declares `then` per band so the quest code (one chapter digit) gets the same chain.
- Score/label under a chain: chained chapters add their stars to `score` (still monotonic); the label keeps the locked
  chapter's noun and totals, so the gradebook cell always reads the locked chapter. CI clause (f') replaces (f): a game
  step's `standards` ⊆ the union of `csta` of its chapter and its `then` chapters for the band.
- **4.1 Pro**: the contracts field `first: "routes 1-6"` is withdrawn. Locked chapter = `protocols` (2-NI-04); `routes`
  level 5 (hop budget) is the Pro *Explore* demo on the projector; `routes` 5-6 is the stretch via `then`. §4.1 prose "2
  ch. 2 (6) then ch. 3" reads "2 ch. 3 Rules of the Road (6); ch. 2 Many Roads 5-6 as stretch".
- **6.2 Pro** had three activities in 18 minutes (audit sheet, IM Design Lab 3-5, DD Fair Data 1-4). It becomes two Play
  steps: *Play A: Design Lab* (IM, 10 min, `chapter=design-lab&band=2&lock=1`, standards `2-CS-01`; the audit sheet is
  its first 4 minutes) and *Play B: Fair Data* (DD, 8 min, `chapter=fair&band=2&lock=1`, quest code `6 2 0 0` in Data
  Detective, standards `2-IC-21`). Steps: Today 17 · Warm-up 5 · Play A 10 · Play B 8 · Exit 3 · Question 2 = 45.

### CA-2 Standards on the step that evidences them (fixes 7 contract/chapter mismatches)
`standards` is allowed on game, question and build steps; *Practiced* counts a question step when answered and a build
step when handed in. Moves: 1B 2.2 game `[1B-AP-13, 1B-AP-12]`, question `[1B-AP-16, 1B-AP-17]` (the designer's note asks
"which role did you take; what did your tester find; what did you change and why"); 2 2.2 game `[2-AP-15, 2-AP-16]`,
question `[2-AP-18, 2-AP-19]`; 1B 3.3 game `[1B-DA-06, 1B-DA-07]`, question `[1B-IC-20]` ("is our claim fair?" yes/no +
reason); 1B 6.2 game `[1B-IC-19]`, question `[1B-IC-20]` (the other pair's improvement); 1B 5.1 stays `[1B-CS-01,
1B-CS-02]` on the game step through the `then` chain. Appendix A gains `"standards"` on the question step.

### CA-3 Unit 7 step shapes (contracts listed "Play" as a text step; rubric marks cannot hang on text)
- **7.1**: three `question` steps replace "Play": *Who and what* (audience, one-sentence game; 6 min), *Parts and the rule*
  (3-4 parts / feature tree; `if … then` or the 6-box flowchart in words; 6 min), *Roles, timeline (Pro) and test plan +
  the Builder message* (6 min). Standards: Plan-line ids on steps 1-2, Roles-line ids on step 3.
- **7.2**: the `build` step carries `template: "quiz"`, `standards: [1B-AP-15]` / `[2-AP-17]`, body = the etiquette card
  with the team's message pasted first (the first 300 chars are the prefill; the teacher pastes it from 7.1's answer).
- **7.3**: `text` *Playtest protocol* (3 min) + `question` *Tally and the one change* (15 min), standards `[1B-IC-20,
  1B-AP-15]` / `[2-AP-15, 2-DA-09, 2-IC-22]`.
- **7.4**: `question` *Credits & How-to* (18 min; Pro adds How it works), standards `[1B-AP-17, 1B-AP-14, 1B-IC-21]` /
  `[2-AP-19, 2-AP-16]`. Minutes per lesson still sum to 45 (7.1: 17+5+6+6+6+3+2; 7.3: 17+5+3+15+3+2).

### CA-4 Capstone teams and accounts
- A build step makes one Studio game per **account**: the team **captain** signs in for every unit-7 period (role card +
  plan page say so; the captain's login card stays in the team folder). Other members have no build cell.
- **P11 adds "Also mark these teammates"** (multi-select of class students) on the review form: rubric marks upsert a
  `step_progress` row for teammates who never opened the step (question/build steps only), so the Standards tab counts
  every member. Platform-slice; small.
- Credits and the class Games tab show first names/avatars only; the captain rule is stated in §8.5.

### CA-5 Mastery rule is unsatisfiable for 13 ids; per-lesson rubric
- Outside unit 7, these ids never have 2 tagged items on one exit ticket: 1B-AP-08, 1B-AP-12, 1B-AP-13, 1B-AP-14,
  1B-AP-16, 1B-AP-17, 1B-IC-20, 2-AP-13, 2-AP-15, 2-AP-16, 2-AP-18, 2-AP-19, 2-CS-01 (10 of them even with unit 7), and
  1B-AP-08 / 1B-AP-12 have **one bank item in the whole program**. "≥ 2 of 3 items" can never flip *Meets* for them.
- Fix: (a) every lesson's *In your own words* question step carries a **0-3 rubric line** tagged with the lesson's primary
  ids (Appendix A's `exit.rubric` with `max: 2` becomes `rubric: [{ id, levels: [4 descriptors] }]` on that step, same 0-3
  scale and storage as P11), so the *Applied* tier exists in every lesson, not only unit 7; (b) Checked rule: "on the most
  recent ticket, ≥ 2 of the items tagged with the id are right, **or all of them when fewer than 2 are tagged**"; (c) CI
  clause (b'): ≥ 3 bank items per id per band → add review items `1b-1.1-r2` (1B-AP-08), `1b-1.5-r2` (1B-AP-12),
  `1b-6.3-r2` (1B-AP-14), `2-6.3-r2` (2-AP-16), `2-5.1-r2` (2-CS-01) used by the next lesson's warm-up and the unit review.
  The thresholds themselves are a human decision (§Critic mustFix).

### CA-6 Scanner wording rules that would abort every seed
- `LINK_CODE_PROMPT` (`scanner.js:47`): a string literal with *grown-up(s) / parent(s) / guardian(s) / family / families /
  mum / mom / dad / link* within 40 characters of *code(s)* **fails**. Packet Post never says "code": "secret message",
  "cipher", "key wheel", "shift"; its tiles stay *safe / trick / ask a grown-up*. Robo Route's "quest code" / "level
  code" strings never mention family, parents or grown-ups. Learn cards and Case-closed tiles follow the same rule.
- `PERSONAL_PROMPT` (`scanner.js:44`): `(enter|type|what's|tell us) (your|ur) (real name|full name|address|phone|email|
  school|age|birthday|password)` fails. Lock It "share or keep" tiles are nouns ("home address", "birthday", "the name of
  your school"), never "what's your …" questions; trick cards never say "type your password" ("reply with the mailbox key").
- The content-lint test also runs the real `scanner.scanVersion` on each game's sanitised HTML and fails on any `fail`
  (printing `flag`s), so owners see scan failures before integration.
- Level codes: 8 of the 28 symbols are digits. The encoder never emits 5+ consecutive digit symbols (field order / check
  symbol placement) and codes are always shown and printed in groups of four with spaces, so a code pasted anywhere on the
  platform cannot read as a phone number (`/\d{7,}/`) or a family link code (`looksLikeLinkCode`, 7-char mixed runs).

### CA-7 Strings budget, translations, l10n
- The 450-string cap covers **chrome**. Level prose (learn cards, 3 hints, check question + 3 tiles, case files, tickets,
  briefs, inbox letters, personas, user quotes) is another ~600-900 strings per game and must also ship in 13 languages
  (the parity test covers both). Budget: chrome ≤ 450 and level text ≤ 1,000 per game; data packs of 60-120 KB per
  language are fine (the 8-14 KB cap is for kit packs, not `/vendor/data`).
- Translation production is undecided: the scaffold reads `scripts/data/cs-quest/<slug>/<lang>.json`, but nobody writes
  the 12 translations. Proposal: machine-translate through the scaffold, native review of the 12 locales before the public
  page goes up; ≈ 4 × 1,300 × 12 ≈ 60k strings. (Human decision: budget and reviewers.)
- Each game's unit test asserts the JSON `l10n` has all 11 non-English descriptions (`gulp-city.test.js:58` pattern).
- Data Detective's fictional names in tables are data too: short, locale-neutral names, never real-name shapes.
- The `dress` pack has only `hat` (kit core: `crown`, `glasses`, `scarf`): Dot's coat, Pim's satchel and Gizmo's goggles
  are inline SVG layers on the kit character (goggles may reuse `glasses`).

### CA-8 US English and US classrooms
- US spelling everywhere in lesson content, bank items and in-game `en` text (en-GB packs/`en-GB.json` may differ). The
  plan and items currently use UK forms (colour ×24, favourite, grey, labelled, licence, organise, practised, neighbour,
  recognise, maths); bank items to fix: `1b-1.4-r1 1b-3.1-e3 1b-3.3-e2 1b-4.1-e3 1b-6.2-e2 1b-7.1-r1 1b-7.2-e3 2-1.4-e2
  2-3.1-e2 2-3.3-e2 2-5.1-e2 2-5.3-e3 2-6.3-e3`. The content lint and the catalogue CI test add a UK-spelling rule for
  `en` strings. Teacher chrome says "catalog"; lesson text says "trusted adult" (in-game keeps "grown-up").
- Every plan page gets a **Short period (40 min)** row (projector warm-up with 2 items, one Discuss prompt, never cut the
  exit ticket) and a **Block (80-90 min)** row (lesson + unplugged twin + 3-star stretch).
- Paths: add **Core 10 (no Builder)** = 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.2, 6.1 (Core 10 as written has four
  Builder lessons that need a school plan).
- FAQ adds: "Classes and lessons live inside a school on Oomba; set one up for free (one teacher is enough)"; "Chromebooks
  without touch work: everything is click-or-tap plus keyboard"; "Headphones recommended; lesson mode starts with music
  off and captions on".
- The materials list names headphones; lesson mode defaults music off, captions on.

### CA-9 Timing fixes
- **6.1** was ≈ 24 minutes of content in an 18-minute slot (10 dilemmas × 20 s + reveals + two 30-s defenders each, plus an
  8-minute Timeline Walk). Both bands: no live warm-up (like 7.2); starter **`wyr:tech:8:20`** (defend on every other
  reveal); steps Today 27 (Do Now, Timeline Walk 10 min, discuss prompts) · Would You Rather (live) 13 · Exit 3 · Question 2
  = 45. The `wyr-tech` set keeps 20 items (teachers may pick 10 on a block day); `1b-u6-o1`/`2-u6-o1` open 6.2's warm-up.
- **7.2** is 5 + 4 + 30 + 1 + 5: Discuss is one minute by construction; the plan page says so.

### CA-10 Platform and ownership details missed
- P5 also hides the **"I played it"** button (`routes/progress.js:256`) on MODES-slug steps and the WYR-live steps.
- P8: `copyLesson` (`lessons.js:191`) inserts an explicit column list; it must also copy `options`, `standards`, `template`
  (plus `set_id` and regenerated `items`), or copied CS Quest lessons silently lose params, standards and the template.
- P17: cadence also sets `due_at` = the day before the next lesson opens (last lesson +7 days); teachers may clear it.
- *Reset to the CS Quest version*: materialise a fresh copy, assign it to the same classes with the old `opens_at`/`due_at`,
  unassign the old copy (student work stays in the removed row and is restorable).
- Derived sets clutter *My sets* (23 × 2 + 7 per band). B groups sets that have `lesson_id` under a "CS Quest" optgroup in
  the `/live` picker (`live.cs.sets`), newest lesson first; names `CSQ 1.2 warm-up` / `CSQ 1.2 exit` / `CSQ Unit 1 review`.
- Locale files: A and B both append to the same 13 files → each ships a merge script (`scripts/i18n-add-cs-quest.mjs`,
  precedent `scripts/i18n-add-live-wyr-atlas.mjs`); integration runs both, then `npm run i18n:check`.
- Data Detective and Inside the Machine do not use `Oomba.game`, so the kit never binds pause/settings for them: both bind
  P/Esc to pause, expose `Oomba.ui.settings()` from the title screen and the HUD gear (WYR pattern), and call
  `Oomba.test({state, start})` + `BRB.gameOver` themselves.
- Tests without an owner: `tests/e2e/how-it-works.spec.js` `PAGES` (add `/teachers/cs-quest`) → curriculum;
  `scripts/how-shots.js --only cs` must materialise `csq-1b-1.2` for the demo teacher and seed `step_progress` rows with
  `standards`/`marks` for the Standards-tab shot (names only from `NAMES`/`STUDENTS`).
- `docs/legal-review.md`: the Standards tab and rubric marks are new per-student education records → a review line next
  to items 42-43 (school-only, deletion hooks, no export beyond the teacher CSV).
- WYR data rule "no digits" blocks `tech-13` ("3D printer"): the rule is "no runs of 2+ digits".
- The etiquette card's "10 messages for the whole project" is per **team** (captain's account).
- Robo Route's content-lint ownership: D/E/F must be able to run it locally before integration (it is a plain `node --test`
  file reading the four slugs; integration only adds slugs).

### CA-11 Builder capstone: the numbers that need a human
- **Spend.** The free pool is $5/day site-wide. A school plan adds seats × $10 / 12 per month to the paid pool
  (`school-billing.js:102-112`, shared by every plan school): a 30-seat school adds **$25/month**. 15 teams × ~8 turns ×
  2 periods × $0.15-0.40 ≈ **$36-96 per class capstone**, so one class can exhaust a small school's share in a week and the
  Builder then rests for everyone on the paid pool. Message counts are fine (captains use ~20 of 100 per seat-year).
- **Throughput.** One serial build runner per instance (`runner.js` header), `maxPerUser 2`; at ~1-3 min per build turn a
  30-minute block yields ~15-30 turns for the whole class, i.e. **1-2 turns per team per period, not 8**. The budget
  above is an upper bound; the queue is the real limit.
- Decisions: measure a build turn on production hardware; put a per-period team cap on the plan page's Builder status
  line ("8 teams can build this period"); design 7.2 as "one good message, then one fix" with the paper path (already half
  by design); decide whether unit 7 requires a school plan or a per-class AI allowance (admin-raised budget), and whether
  the program page may say "about $2-3 of AI per team".

### Critic mustFix (human decisions)
1. Mastery thresholds (CA-5) and whether per-lesson rubric marks count as *Applied* evidence.
2. Capstone money and queue policy (CA-11): school plan vs per-class allowance; team cap per period; the public wording.
3. Translation production and review for ~60k in-game strings (CA-7) and the launch gate (English-only packs fail the seed
   tests, so the games cannot ship half-translated).
4. Captain-login rule and "mark teammates" (CA-4) vs a real team feature (phase 2).
5. 6.1 without a live warm-up and `wyr:tech:8:20` (CA-9); 6.2 Pro as two Play steps (CA-1).
