# CS Quest — program design, teacher-first angle

Designer angle: **TEACHER-FIRST.** The customer is a grade 3-8 classroom teacher (or a librarian, or a substitute) with no
CS background, a 45-minute period, a cart of Chromebooks or iPads that sometimes fails, 25-30 kids, and ten minutes of prep.
Everything below is optimised for "open the lesson, press start, it works", and for honest timing.

Ground truth used (not re-derived here): `map-games.md` (how official games are built/shipped/tested), `map-teach.md`
(lessons, classes, Oomba Live, teacher pages, progress), `csta.json` (CSTA 2017 level 1B and level 2; all 44 ids verified).
Repo spot-checks: `seed-games/*.json` titles, `scripts/data/would-you-rather/en.json` item shape, `server/live/bank/en/*.json`
row shape, `scripts/seed.js seedDemoLessons`, `server/learn.js HUBS`, `lessons.template.*` and `live.bank.*` keys.

Conventions in this document: "1B" = grades 3-5, "2" = grades 6-8. Practice codes (P1.1 ... P7.3) are the ones listed per
standard in `csta.json`; practice names are the 2017 framework names (P1 Inclusive culture, P2 Collaborating, P3 Defining
problems, P4 Abstractions, P5 Creating artifacts, P6 Testing and refining, P7 Communicating).

---

## 0. The eight promises this design keeps

1. **Open, press start, it works.** Every lesson page has at most three buttons a teacher needs: *Start warm-up*, *Open
   the game at the right chapter*, *Assign to class*. No settings screen in the game for the kids to get lost in: the
   chapter, grade band and mode arrive with the link (needs the small `BRB.params` plumbing, §3.0.3; without it the game
   falls back to a one-tap chapter map).
2. **Same shape every time.** Every lesson is the same 45-minute "CS Quest period" (§2.2). After lesson two the teacher
   and the kids know the rhythm; a substitute can run it from the printed page.
3. **Honest minutes.** Plans budget 4 minutes for log-in and devices, 5 for the warm-up, 18 for play, 6 to talk, 5 for the
   exit ticket. "Finish 4 levels" is the goal, "finish the chapter" is the stretch. Nothing assumes a 60-minute block.
4. **A twin for every lesson that needs no device.** Every lesson has an *unplugged twin* (printable) that teaches the same
   standard, for the day the cart is empty or the Wi-Fi is down, and for the first 10 minutes of lessons where paper
   is simply better (packets, binary, ciphers).
5. **Substitute-ready.** Each printed plan has a boxed *Sub plan*: three sentences, no judgement calls, no CS vocabulary
   needed, works signed-in (class login cards) or signed-out (guest play of the official games).
6. **Printable.** One lesson = one two-page print: the plan, the projector script, the unplugged twin, the exit ticket
   half-sheets and the answer key. Lesson pages get a print view (today none exists, `map-teach.md §4.5`).
7. **No CS background needed.** The *Explore* segment is a scripted five-minute demonstration on the projector ("Say
   this / Do this / Ask this"), plus the two misconceptions to listen for. Vocabulary is five words or fewer.
8. **Every 1B and level 2 standard at least once, with evidence.** 23 lessons per band; each standard appears in at least
   one lesson as the *primary* standard and is checked by an exit-ticket item (§2.3 matrix, §4).

Non-goals (said plainly so nobody waits for them): no typed-code editor (Code Isle already exists), no physical robots or
micro:bits, no accounts for parents, no live hosting of the four new games (they are solo/pair games; live = the
existing quiz modes and Would You Rather Live), no translation of lesson content (English, US spelling; chrome in 13
languages as the site requires).

---

## 1. Name and branding check

| Candidate | For | Against | Verdict |
|---|---|---|---|
| **CS Quest** (working name) | Teachers search "CS", "computer science standards"; reads as a *program*, not a game; sits next to "Quest Race" / "Atlas Quest" without colliding (those are games, this is the umbrella) | "CS" means nothing to a third-grader; "Quest" is now used three times | **Keep** for everything a teacher sees (page, folder, lesson prefix) |
| Code Quest | kid-friendly | collides with Code Isle and narrows the program to coding (4 of 7 units are not coding) | no |
| Byte Quest / Bit Quest | cute, kid-facing | unsearchable by teachers; "byte" is level-2 vocabulary | no |
| Oomba Computer Science | plain | long, bland, 12-char lesson titles get eaten | no |

Decisions:
- Program name **CS Quest**, tagline *"Computer science, one period at a time."* Treated like the brand: never translated
  (it is a proper noun inside otherwise-localised chrome, same rule as "Oomba Live"). Teacher-facing lesson titles are
  prefixed `CS Quest 1.2 ·` so they sort and search well in a crowded library (title limit is 100 chars).
- Kids never see "CS Quest" as a thing to find: they see the four games (home page, `/learn/computer-science` hub) and
  their class lesson list, exactly like today.
- Game titles follow the site's two-word pattern (Quest Race, Atlas Quest, Code Isle, Gulp City): **Robo Route**
  (`robo-route`, icon 🤖 is taken by Code Isle → use 🛤️), **Data Detective** (`data-detective`, 🔎), **Packet Post**
  (`packet-post`, 📮), **Inside the Machine** (`inside-the-machine`, 🔧; three words is fine, cf. Hero of Sunvale).
  All `category: learning`, `featured: true`, `players_max: 2` for Robo Route and Data Detective (pair mode is a
  first-class classroom feature, §3.1.6), `1` for the other two, `orientation: any`, `age_rating: everyone`, `cover`
  from `COVERS` (`mint`, `ocean`, `gold`, `night`) plus a real `covers.js` recipe each.
- A fifth "game" is not built for Impacts of Computing: it uses Would You Rather (Live) with a new `tech` topic, which
  kids already know.

---

## 2. Scope and sequence

### 2.1 Program shape

Seven units, **23 lessons per band** (46 lesson variants), each 45 minutes. Both bands share unit names, lesson names and
the period shape, so a K-8 specialist or a 5th/6th-grade teacher runs one program with a band toggle, and a substitute
cannot pick the wrong page.

| # | Unit | Lessons | Main tool | Standards (1B / 2) |
|---|---|---|---|---|
| 1 | **Think Like a Robot** (Algorithms & Programming) | 5 | Robo Route ch. 1-5 | 1B-AP-08/09/10/11/12 · 2-AP-10/11/12/13/14 (+2-AP-16) |
| 2 | **Bug Hunters** (Debugging & Program Development) | 2 | Robo Route ch. 6-8 (Debug Lab, Best Route, Level Maker) | 1B-AP-13/15/16/17 · 2-AP-15/17/18/19 |
| 3 | **Data Detectives** (Data & Analysis) | 3 | Data Detective | 1B-DA-06/07, 1B-IC-20 · 2-DA-08/09, 2-IC-22 |
| 4 | **Packet Post** (Networks, Internet & Cybersecurity) | 3 | Packet Post | 1B-NI-04/05 · 2-NI-04/05/06, 2-IC-23 |
| 5 | **Inside the Machine** (Computing Systems) | 3 | Inside the Machine | 1B-CS-01/02/03 · 2-CS-02/03, 2-DA-07 |
| 6 | **Tech Choices** (Impacts of Computing) | 3 | Would You Rather (Live) `tech`, the kit settings panel of any game | 1B-IC-18/19/21, 1B-AP-14 · 2-IC-20/21, 2-CS-01, 2-AP-16 |
| 7 | **Make Your Own Game** (Builder capstone) | 4 | The Builder (Studio), Quiz Show template | 1B-AP-11/13/14/15/16/17, 1B-IC-20/21 · 2-AP-10/13/15/16/17/18/19, 2-DA-09, 2-IC-22 |

Three published *paths* so a teacher can commit to what they actually have (shown on the program page, each a one-click
"Add to my library"):
- **Full CS Quest** — 23 periods (a semester at 1-2 periods a week).
- **Core 10** — one lesson per unit plus the four capstone lessons (1.2, 2.1, 3.1, 4.1, 5.2, 6.1, 7.1-7.4). Still touches
  every concept area; does *not* cover every standard (the page says which it misses).
- **CS Ed Week** — five periods: 1.1, 1.2, 2.1, 4.1, 6.1. Zero prerequisites, zero Builder.

Order within the year: units 1-2 first (the game vocabulary pays off in every later unit's exit ticket), 3-6 in any
order, 7 last (needs a school plan for the AI budget, §3.7.6). Each unit also works alone.

### 2.2 The CS Quest period (the shape of every lesson)

| Clock | Segment | What happens | Fallback |
|---|---|---|---|
| 0:00-0:04 | **Arrive, log in, Do Now** | Devices out, class login cards, a one-line *Do Now* on the board from the plan (unplugged, answerable on paper). Teacher opens the lesson page on the projector. | No devices: Do Now on paper, skip to Explore with the unplugged twin |
| 0:04-0:09 | **Warm-up (live set)** | *Start warm-up* button → Question Battle, class room, the lesson's 5-question set (`CSQ 1.2 warm-up`), 15 s per question. Start when about 80% are in; latecomers watch the projector. Review = retrieval of last lesson + a preview question. | Show of hands on the projected questions (the set editor shows them; or print page) |
| 0:09-0:16 | **Explore (projector script)** | Teacher opens the game at the lesson's chapter on the projector and plays level 1 with the class calling the moves. Scripted: 2 *Say this*, 1 *Ask this*, the big-idea sentence, 3-5 vocabulary words shown on the game's in-level "learn card". | Unplugged twin (acted out) |
| 0:16-0:34 | **Play (18 min)** | Students open the lesson in *Classes* → *Play* → game opens at the right chapter and band. Pairs on one device are the default for grades 3-5 (driver/navigator, swap at the chime every 3 levels); solo for 6-8 if devices allow. Goal: 4 levels. Stretch: the chapter, then 3-star replays. Teacher circulates with the *look-fors* card. | Unplugged twin stations (printed level cards, paper robots) |
| 0:34-0:40 | **Discuss** | Two prompts, turn-and-talk then whole class; one "show me" where a volunteer's program is shown on the projector. | same |
| 0:40-0:45 | **Exit ticket + pack up** | Three multiple-choice items (quiz step, auto-marked) + one sentence (question step). Devices away. | Printed half-sheet exit ticket |

Honest notes a teacher reads once: the first two periods lose 3-5 extra minutes to logging in (cards, caps lock); the
plan tells them to run the Do Now longer and cut the Discuss to one prompt, not to skip the exit ticket. Kids who finish
early always have the same two moves: *earn 3 stars* (optimisation) or *help a neighbour without touching their screen*
(a role, 1B-AP-16). Nothing in a lesson depends on homework.

Lesson materials, every lesson, same list unless stated: projector; 1 device per pair (3-5) or per student (6-8);
headphones optional (read-aloud is on by default for 1B); the lesson's printable (plan, script, twin, exit tickets, key).

### 2.3 Standards coverage matrix

Bold = the lesson where the standard is *primary* (taught and checked by the exit ticket). Plain = practised again.

**Level 1B (grades 3-5)**

| Standard | Lessons |
|---|---|
| 1B-CS-01 Devices as a system | **5.1** |
| 1B-CS-02 Hardware + software model | **5.1**, 5.3 |
| 1B-CS-03 Troubleshooting | **5.2** |
| 1B-NI-04 Packets | **4.1** |
| 1B-NI-05 Cybersecurity & personal info | **4.2**, 4.3, 6.3 |
| 1B-DA-06 Organize/present data | **3.1**, 3.3 |
| 1B-DA-07 Inference, prediction | **3.2**, 3.3 |
| 1B-AP-08 Compare algorithms | **1.1**, 2.1 |
| 1B-AP-09 Variables | **1.4**, 7.2 |
| 1B-AP-10 Sequences, events, loops, conditionals | **1.1**, **1.2**, **1.3**, 7.2 |
| 1B-AP-11 Decompose | **1.5**, 1.1, 7.1 |
| 1B-AP-12 Modify/remix | **1.5**, 2.2 |
| 1B-AP-13 Iterative planning, others' perspectives | **2.2**, 7.1 |
| 1B-AP-14 IP and attribution | **7.4**, 6.3 |
| 1B-AP-15 Test and debug | **2.1**, 7.2 |
| 1B-AP-16 Roles when collaborating | **2.2**, 1.2, 7.1-7.3 |
| 1B-AP-17 Describe choices | **2.2**, 7.4 |
| 1B-IC-18 Technologies that changed the world | **6.1** |
| 1B-IC-19 Accessibility & usability brainstorm | **6.2** |
| 1B-IC-20 Seek diverse perspectives | **7.3**, 3.3 |
| 1B-IC-21 Public domain / CC media | **6.3**, 7.4 |

**Level 2 (grades 6-8)**

| Standard | Lessons |
|---|---|
| 2-CS-01 Recommend device improvements (HCI) | **6.2**, 5.1 |
| 2-CS-02 Design HW+SW projects that collect/exchange data | **5.1** |
| 2-CS-03 Systematic troubleshooting | **5.2** |
| 2-NI-04 Protocols | **4.1** |
| 2-NI-05 Physical & digital security | **4.2**, 4.3 |
| 2-NI-06 Encryption | **4.3** |
| 2-DA-07 Encoding schemes | **5.3** |
| 2-DA-08 Collect & transform data | **3.1**, 3.3 |
| 2-DA-09 Refine models from data | **3.2**, 7.3 |
| 2-AP-10 Flowcharts / pseudocode | **1.1**, 7.1 |
| 2-AP-11 Named variables, data types | **1.4**, 7.2 |
| 2-AP-12 Nested loops, compound conditionals | **1.2**, **1.3**, 7.2 |
| 2-AP-13 Decompose | **1.5**, 1.1, 7.1 |
| 2-AP-14 Procedures with parameters | **1.5** |
| 2-AP-15 Feedback from users | **7.3**, 2.2 |
| 2-AP-16 Incorporate existing code/media + attribution | **7.4**, 1.5, 6.3 |
| 2-AP-17 Systematic testing with test cases | **2.1**, 7.2 |
| 2-AP-18 Distribute tasks, timeline | **7.1**, 2.2 |
| 2-AP-19 Document programs | **7.4**, 2.2 |
| 2-IC-20 Tradeoffs of technologies, careers | **6.1** |
| 2-IC-21 Bias & accessibility in existing tech | **6.2** |
| 2-IC-22 Crowdsourcing / surveys | **3.3**, 7.3 |
| 2-IC-23 Public vs private tradeoffs, social engineering | **6.3**, 4.2 |

All 21 level-1B and all 23 level-2 standards have a primary lesson. Where a lesson's game chapter has no standard at a
band (binary for 1B, ciphers for 1B), the plan says "enrichment" and the exit ticket checks the band's real standard.

### 2.4 The lessons

Format. Each lesson block gives both bands. "Plan" lists only what differs from the standard period (§2.2); the clock is
always the same. Deep links are what the lesson page buttons open (`chapter`/`band`/`mode` become `BRB.params`, §3.0.3).
Catalogue keys are `csq-<band>-<unit>.<lesson>` (e.g. `csq-1b-1.2`, `csq-2-1.2`). Lesson 1.2 is written out in full as
the exemplar of the level of detail every printed plan carries; the others are complete but compressed.

---

#### Unit 1 · Think Like a Robot (Robo Route)

##### 1.1 Step by step — *Sequences and comparing routes*

| | Grades 3-5 (1B) | Grades 6-8 (2) |
|---|---|---|
| Standards | **1B-AP-10** (sequence part), **1B-AP-08**, 1B-AP-11 · P5.2, P6.3, P3.3, P3.2 | **2-AP-10**, 2-AP-13 · P4.4, P4.1, P3.2 |
| I can | put steps in the right order so the robot reaches the goal; compare two routes and say which is better and why; break a long route into legs | write a plan (pseudocode or flowchart) before I program; break a route into sub-routes; compare routes by number of steps |
| Deep link | `/play/robo-route?chapter=sequences&band=1b` | `/play/robo-route?chapter=sequences&band=2` (band 2 shows the *plan card* before each level) |

Vocabulary: algorithm, sequence, step, (2) pseudocode, flowchart. Do Now: "Write the steps to make a sandwich. Swap
with a neighbour: could a robot follow them?" Warm-up set `CSQ 1.1` (preview items: 1B-AP-10 / 2-AP-10).
Explore script: teacher is the robot; a volunteer reads the sandwich steps literally (the classic); then level 1 on the
projector, class calls *forward, turn left*; big idea: "A computer does exactly what the steps say, in order."
Play: ch. 1 Sequences, 8 levels (6×6 grid for 1B, 8×8 for 2; 2 gets levels 6-8 with two possible routes and a par).
Discuss: "Two routes both worked: which is better? Why (shorter, fewer turns, avoids the puddle)?" (1B-AP-08) /
"Did writing the plan first help or slow you down?" (2-AP-10). Exit: 3 MC items (order these steps; which route is
shorter; which plan matches the map) + "One sentence: what is an algorithm?"
Differentiation: support — 1B levels 1-4 have a ghost path; *tap to add* blocks, no dragging; stretch — par stars.
Unplugged twin: **Paper Robot** — grid mats, arrow cards, partner reads cards aloud while the other moves a counter;
"two routes" race. Teacher notes: the "turn" vs "move" confusion (turning does not move the robot) is the misconception
of the day; the game shows a turn as an in-place spin with a sound so it is visible.
Sub plan: Do Now on paper → play chapter 1 (either band) → paper exit ticket.

##### 1.2 Again and again — *Loops* (exemplar, full detail)

| | Grades 3-5 (1B) | Grades 6-8 (2) |
|---|---|---|
| Standards | **1B-AP-10** (loops) · P5.2; 1B-AP-16 (roles) · P2.2 | **2-AP-12** (nested loops) · P5.1, P5.2 |
| I can | spot steps that repeat and replace them with a *repeat* block; say how many times a loop runs | use a loop inside a loop; explain what each loop repeats; predict how many steps a nested loop makes |
| Deep link | `/play/robo-route?chapter=loops&band=1b` | `/play/robo-route?chapter=loops&band=2` |

Vocabulary: loop, repeat, times, pattern; (2) nested loop, inner/outer.
Materials: standard list; printable *Loop Cards* (twin); a chime or timer app for pair swaps.

Minute by minute
- **0:00-0:04 Arrive, log in, Do Now.** Board: "Write something you do again and again at school. How many times a
  day?" Teacher projects the lesson page, presses *Start warm-up* (the class room opens with the code on screen).
- **0:04-0:09 Warm-up** `CSQ 1.2 warm-up`, 5 items, 15 s each (Question Battle): 2 retrieval items from 1.1 (order the
  steps; which route is shorter), 1 vocabulary item (what is an algorithm), 2 preview items (which program repeats
  something; how many squares does *repeat 3: forward* move). Results stay in Oomba Live for the discuss segment.
- **0:09-0:16 Explore.** Teacher opens the deep link on the projector. Level 1 of *Loops* is a straight corridor of 6
  squares. *Do this:* ask the class for the program; add six *forward* blocks; run it. *Say this:* "That works. A
  programmer would be annoyed: we typed the same thing six times." *Do this:* delete five, drag/tap the *repeat* block
  around the remaining *forward*, set it to 6, run. *Ask this:* "What does the number mean? What if I put 7?" (run it:
  the robot bumps the wall, which is a visible, harmless failure and the game says "Oops: one too many"). Big idea
  sentence on the learn card: "A loop repeats steps so we do not have to write them again." (2 only) Level 2 preview:
  a square path; "forward 3, turn right" repeated 4 times; then the staircase level where a *repeat* sits inside a
  *repeat*: "the inner loop makes one stair; the outer loop makes the staircase."
- **0:16-0:34 Play.** 1B: pairs, driver/navigator, swap at the chime every 3 levels (the game shows a *Swap!* banner
  every 3 levels when pair mode is on; the navigator holds the *Loop Cards* and must say the loop in words before the
  driver builds it, 1B-AP-16). 2: solo or pairs; levels 1-5 single loops, 6-9 nested, 10 is a par challenge. Look-fors:
  kids who put the *repeat* block *after* the steps instead of around them; kids who count squares wrong (the game shows
  the count on the floor tiles for 1B).
- **0:34-0:40 Discuss.** Prompt 1: "Show me a level where a loop saved you the most blocks" (volunteer's program on the
  projector; count blocks with and without the loop). Prompt 2 (1B): "Where else do loops happen: in songs, in
  dances, in a day?" (2): "In the staircase, how many *forward* steps actually ran? Show the multiplication."
- **0:40-0:45 Exit ticket.** Quiz step, 3 items: (a) which program moves the robot 8 squares with the fewest blocks
  [1B-AP-10 / 2-AP-12]; (b) how many times does *repeat 4 { repeat 2 { forward } }* move (2) / how many squares does
  *repeat 3 { forward, forward }* move (1B); (c) spot the bug: the loop is around the wrong blocks. Question step:
  "In your own words: what does a loop do and why do programmers like them?"

Differentiation: support — the 1B *repeat* block starts with the count pre-set to the corridor length on levels 1-2;
read-aloud reads the learn card; hint 1 highlights the repeating blocks in the kid's own program. Stretch — 3-star par
on every level; level 10 "fewest blocks in the class" (stars, not names, no leaderboards in class).
Unplugged twin (**Loop Cards**, 15 min): pairs get a 6×6 paper grid, arrow cards and three *repeat* bracket cards with a
number dial; one builds the program on the desk, the other walks a counter; "shrink the program" round: who can solve
the printed level with the fewest cards (2: a nested-loop staircase card).
Teacher notes: the number on a loop is how many times the *whole* bracket runs, not the number of squares; expect
off-by-one bumps and treat them as the lesson's best moments ("the robot did exactly what you said"). If the warm-up
ran long, drop Discuss prompt 2, never the exit ticket. Timing reality check: most pairs reach level 5 of 9 in 18
minutes; that is success.
Sub plan: Do Now → play chapter *Loops* in pairs → paper exit ticket. (No warm-up needed; no projector needed.)

##### 1.3 If this, then that — *Conditionals and events*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-10** (conditionals, events) · P5.2 | **2-AP-12** (compound conditionals) · P5.1, P5.2 |
| I can | use *if* so the robot decides for itself; use a *when* block so something happens on an event | combine conditions with AND/OR/NOT; nest an *if* inside a loop |
| Deep link | `?chapter=conditionals&band=1b` | `?chapter=conditionals&band=2` |

Vocabulary: condition, if/else, event, sensor; (2) AND, OR, NOT, compound. Do Now: "If it rains at recess, then ___.
Write two more if-then sentences about today." Warm-up `CSQ 1.3` (2 loops retrieval, 3 preview incl. an event item).
Explore: level 1 has a fog of war: the robot cannot see if the path ahead is open, so the program must say *if path
ahead: forward, else: turn*; then the event level: *when gem collected → open door*. Big idea: "A conditional lets the
program choose; an event lets the world start a piece of program." Play: ch. 3, 9 levels (1B: if/else, *if on paint*,
*when bumped*; 2: *if has key AND touching door*, *if NOT wall ahead OR gem left*). Discuss: "What question did your
robot ask in level 4?"; (2) "Write the door rule in English, then as a block." Exit: which block makes the robot stop
at the edge of *any* maze; what happens *when* vs *if*; (2) evaluate a compound condition from a picture. Support:
condition tiles are pictures with words; stretch: one program that solves three different mazes (the game's "any
maze" levels). Unplugged twin: **If-Hat** — the caller wears the hat and gives rules ("if I clap, hop; if I say a
colour, touch it"); (2) compound round. Notes: kids read *if* as a one-time check; the game's step mode (§3.1.4) shows
the check happening on every loop pass. Sub plan: Do Now → chapter 3 → paper exit ticket.

##### 1.4 Counting and remembering — *Variables*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-09** · P5.2 | **2-AP-11** · P5.1, P5.2 |
| I can | use a variable to count things and change it as the program runs | name variables clearly; use number, on/off and word-list variables; do operations on them |
| Deep link | `?chapter=variables&band=1b` | `?chapter=variables&band=2` |

Vocabulary: variable, value, change by, set to; (2) data type, name, boolean. Do Now: "The score in your favourite
game: what makes it go up? go down?" Warm-up `CSQ 1.4`. Explore: level 1 needs 5 gems before the door opens: program
`set gems to 0`, in a loop `if on gem: change gems by 1`, `if gems = 5: open`. The *watch* panel shows the value tick up
on the projector. Big idea: "A variable is a labelled box the program can look in and change." Play: ch. 4, 8 levels
(1B: a `count` and a `lives` box; 2: must *name* the variable from a list of good and bad names, three types: number
`gems`, flag `hasKey` on/off, word `colour` from a list; level 7 "the badly named program": fix names so a partner can
read it). Discuss: "What did the box hold at the end? Show the watch panel." (2) "Why is `x` a bad name?" Exit:
trace a value through 3 steps; pick the right variable name; (2) which type fits "is the door locked?". Support: the
watch panel always on; stretch: a countdown timer level. Unplugged twin: **Variable Jars** — labelled jars and
counters; cards say "change gems by 2", kids keep the jars right; (2) a jar for a yes/no card. Notes: "set" vs
"change" is the day's confusion; both blocks animate differently (the box empties and refills vs a +1 pops out). Sub
plan as usual.

##### 1.5 Build a block — *Functions, decomposition, remix*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-11**, **1B-AP-12** · P3.2, P5.3 | **2-AP-14**, **2-AP-13**, 2-AP-16 · P4.1, P4.3, P3.2, P4.2 |
| I can | break a big route into named parts; reuse a part I (or a classmate) made | make a procedure with a parameter so one block does many jobs; use a shared block and credit where it came from |
| Deep link | `?chapter=functions&band=1b` | `?chapter=functions&band=2` |

Vocabulary: function (my block), define, call, (2) parameter, argument, reuse. Do Now: "Name three things 'get ready for
school' is made of." Warm-up `CSQ 1.5`. Explore: level 1 is four identical rooms; make *my block: Room* once, call it
four times; (2) rooms of different lengths → *Room(steps)*. Big idea: "Name a group of steps once, use it everywhere."
Play: ch. 5, 8 levels (1B: define/call, a *Starter blocks* shelf with two pre-made blocks to *remix*: change one step
and use it, 1B-AP-12; 2: parameters, levels 6-8 use a shelf block "made by the Robo Route team" that must be credited:
the program's title card shows *uses: Zigzag by Robo Route team*, the game checks it is left on, 2-AP-16). Discuss:
"Which part of your program would you give a name? Why that one?" (2) "What changed when you added the parameter?"
Exit: which block should be a function; what does `Room(3)` do; (1B) what is a remix / (2) why give credit. Support: 1B
levels pre-define the block, the kid only calls it; stretch: a level solved with one 2-parameter block. Unplugged twin:
**Dance Blocks** — groups invent a 4-move dance, name it, the class calls `Spin!` `Hop(2)!`. Notes: kids often define a
block and never call it; the run button is dimmed until a call exists and the hint says why. Sub plan as usual.

---

#### Unit 2 · Bug Hunters (Robo Route, debugging & program development)

##### 2.1 Bug hunt — *Test and debug*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-15** · P6.1, P6.2; 1B-AP-08 · P6.3 | **2-AP-17** · P6.1 |
| I can | find and fix a mistake in a program (mine or someone else's); test before I say "done" | test a program against several test cases; find the input that breaks it; fix without breaking the others |
| Deep link | `?chapter=debug&band=1b&mode=debug` | `?chapter=debug&band=2&mode=debug` |

Vocabulary: bug, debug, test, expected vs actual; (2) test case, edge case. Do Now: "Find the mistake: *2 + 2 = 5*,
*Teh cat*, a route with one wrong turn (printed)." Warm-up `CSQ 2.1`. Explore: the projector shows a broken program
(the robot walks into the lake). *Do this:* step mode, one block at a time, class says "stop!" when it goes wrong.
Big idea: "Programs break; good programmers expect it and test." Play: ch. 6 Debug Lab, 9 levels (1B: one bug per
level, kinds: wrong turn, loop count off by one, missing block, wrong condition; 2: levels have 3 test maps each; the
program must pass all three; level 8 has an "empty maze" edge case). Stars count edits: fewest edits = 3 stars
(§3.1.5). Discuss: "What was the bug in level 5 and how did you find it?" "Show me step mode." (2) "Which test case
caught your bug?" Exit: spot the bug in a 5-block program; which test would catch a wrong loop count; (2) which of
these is an edge case. Support: hint 1 highlights the block where expected and actual first differ; stretch: the
*Best Route* chapter (ch. 7) for kids who finish, which doubles as 1B-AP-08 practice. Unplugged twin: **Bug Cards** —
printed programs with one bug each and grid mats; find it, fix it with a sticker. Notes: resist telling them the bug;
the "expected vs actual" sentence frame is the whole skill. Sub plan as usual (debug mode works signed out).

##### 2.2 Level designers — *Plan, build, test with a partner, explain*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-13**, **1B-AP-16**, **1B-AP-17** · P1.1, P5.1, P2.2, P7.2; 1B-AP-12 | **2-AP-15**, **2-AP-18**, **2-AP-19** · P2.3, P1.1, P2.2, P7.2 |
| I can | plan a level on paper first; take a role (designer / tester); explain my design choices | plan with a timeline and split roles; get tester feedback and change my level; write a level description |
| Deep link | `?chapter=level-maker&band=1b` | `?chapter=level-maker&band=2` |

Vocabulary: plan, storyboard, tester, feedback, (2) iteration, documentation. Do Now: "Draw a tiny maze (4×4) on the
printed grid. Where is the start, the goal, one trap?" Warm-up `CSQ 2.2`. Explore: the Level Maker on the projector:
place walls, gems, the goal; the *Solve it* gate: a level cannot be saved until its author solves it (so every shared
level is possible). Big idea: "Plan, build, test with someone else, improve, explain." Play (as a mini-project, 18
min): 6 min build from the paper plan; 6 min swap (pair roles: *designer* watches silently while *tester* plays and
says one thing that was fun and one that was confusing; swap); 6 min fix and write the level's one-line "designer's
note" (picked from word tiles + a free sentence in the *question step*, never typed into the game). Sharing: **level
codes** (§3.1.6): the game shows a 12-16-character code; the tester types it in; nothing goes through a server. (2)
pairs keep a 3-line timeline on the printed sheet: build by minute 6, test by 12, fix by 18 (2-AP-18). Discuss: "What
did your tester find that you did not expect?" (1B-AP-13/2-AP-15). Exit: 3 MC (which role does what; what is feedback
for; which level note is most useful) + question step: "Explain one choice you made in your level and why." (1B-AP-17 /
2-AP-19). Support: 1B grid is 6×6 with 3 object types; stretch: a level that needs a loop to get 3 stars. Unplugged
twin: paper mazes swapped between pairs (the whole lesson works on paper). Notes: the remix path (open a classmate's
code, change two things, keep the "based on" line) is the 1B-AP-12 moment; keep it optional. Sub plan: paper mazes.

---

#### Unit 3 · Data Detectives (Data Detective)

##### 3.1 Sort it out — *Organize data to answer a question*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-DA-06** · P7.1 | **2-DA-08** · P6.3 |
| I can | sort and group data so a pattern shows; choose the view that answers the question | clean a messy data set (typos, duplicates, impossible values) and transform it (counts → percentages) so it is useful |
| Deep link | `/play/data-detective?chapter=sort&band=1b` | `/play/data-detective?chapter=cleanup&band=2` |

Vocabulary: data, table, sort, group, (2) clean, outlier, percent. Do Now: "Which is the most common shoe colour in
this room? How could we find out fast?" Warm-up `CSQ 3.1`. Explore: Case 1 *The Missing Lunchbox* on the projector:
a 10-row table (who, where, when); *Ask this:* "Which column should we sort by?"; sort by time, the answer pops. Big
idea: "Data is just facts in rows; sorting and grouping make the answer visible." Play: 1B ch. 1 *Sort & Group* (8
cases; each: table → sort/group → choose the chart → pick the claim); 2 ch. 4 *Clean-Up Crew* (8 cases: a survey with
"12 pets" and "dog/Dog/d0g" rows; remove, merge, fix; then convert counts to percentages before comparing classes of
different sizes). Discuss: "Which view answered the question fastest?" (2) "What would have gone wrong if we kept the
messy rows?" Exit: pick the sort that answers the question; read a grouped count; (2) spot the row that should be
removed; why percentages. Support: cases 1-3 have the right column glowing; stretch: cases with two questions, each
needing a different sort. Unplugged twin: **Human Bar Chart** — kids line up by favourite fruit; then sort the lines
tallest-first; (2) add three "messy" cards (a blank, a joke answer, a duplicate) and decide what to do. Notes: the
game's charts are DOM bars with numbers printed, not canvas, so screen-reader kids and projectors both read them.

##### 3.2 What does the data say? — *Claims, predictions, models*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-DA-07** · P7.1 | **2-DA-09** · P5.3, P4.4 |
| I can | use data to support a claim or make a prediction; say when there is not enough data | test a model's prediction against real results and refine the model |
| Deep link | `?chapter=claims&band=1b` | `?chapter=models&band=2` |

Vocabulary: claim, evidence, predict, pattern, (2) model, simulation, refine. Do Now: "It rained the last 3 Mondays. Will
it rain next Monday? How sure are you?" Warm-up `CSQ 3.2`. Explore: Case *The Plant Race*: a chart of plant height
per day; "Predict day 10"; then the trap case with only two data points: "Can we tell? What would we need?" (the
clarification's point: not enough data). Big idea: "A claim needs enough good data behind it." Play: 1B ch. 3 *Clues &
Claims* (8 cases: supported / not supported / can't tell; predict the next bar); 2 ch. 5 *Model Makers* (6 cases: a ramp
sim with a slider rule "distance = 2 × height"; run 5 trials, compare predicted vs actual, change the rule, re-run;
last case: a game-balance model — tune a power-up so the win rate is near 50%). Discuss: "Which case tricked you?
Why was 'can't tell' the right answer?" (2) "How many trials before you trusted your rule?" Exit: which claim does the
chart support; what extra data would help; (2) which refinement fixes the model. Support: claim tiles use pictures +
words; stretch: 1B cases 7-8 with a distractor column (the irrelevant data in the clarification). Unplugged twin:
**Paper Predictions** — tally a 10-roll die experiment, predict the next 10, compare; (2) adjust a "rule" card for a
paper ramp with marbles if available, else the die. Notes: "the chart says" is the sentence frame; push back on
claims the data does not show.

##### 3.3 Our class survey — *Collect, chart, claim*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-DA-06**, **1B-DA-07**, **1B-IC-20** · P7.1, P1.1 | **2-DA-08**, **2-IC-22**, 2-DA-09 · P6.3, P2.4, P5.2 |
| I can | collect data from the whole class, chart it and make a claim others agree is fair | design a 3-question survey, collect answers from many people, clean and chart them, report a finding |
| Deep link | `?chapter=my-data&band=1b` | `?chapter=my-data&band=2` |

Vocabulary: survey, tally, category, (2) sample, bias, respondent. Do Now: "Vote on the board: pets — dog / cat / other /
none" (tally marks). Warm-up `CSQ 3.3`. Explore: the *My Data* chapter: the teacher types the tallies (numbers only;
category labels are picked from preset lists, §3.2.5), the chart appears, class picks a fair claim. Big idea: "Real
data comes from real people; collecting it well is half the job." Play: pairs run a 2-question survey of the class
(printed slips; 1B uses the two provided questions, 2 writes its own three with one "bad" question to fix); enter the
numbers in *My Data*, choose the chart, pick/write the claim; 2 also enters a second class's data (provided) and
compares with percentages. 2-IC-22: the whole class's results are pooled on the projector ("crowdsourced"); 1B-IC-20:
each pair asks another pair whether the claim is fair before finishing. Discuss: "Did everyone's chart say the same
thing? Why not?" (2) "Which survey question was biased, and how did you fix it?" Exit: read the class chart; which
claim is fair; (2) which question is leading. Support: provided questions and tally sheets; stretch: a claim with two
charts. Unplugged twin: the whole lesson works with tally sheets and grid paper. Notes: the live quiz cannot run a
no-right-answer poll today (set items need an answer), so surveys are paper + *My Data*; Would You Rather Live can
be used as a quick two-choice poll when the question fits.

---

#### Unit 4 · Packet Post (Networks, Internet & Cybersecurity)

##### 4.1 How a message travels — *Packets, routes, protocols*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-NI-04** · P4.4 | **2-NI-04** · P4.4 |
| I can | explain that a message is cut into packets that travel different paths and are put back together | explain what a protocol is for: numbering, acknowledging, re-sending lost packets, choosing a path |
| Deep link | `/play/packet-post?chapter=packets&band=1b` | `/play/packet-post?chapter=protocols&band=2` |

Vocabulary: packet, network, route, router, reassemble, (2) protocol, acknowledge, resend, checksum. Do Now: "How does
a picture get from your tablet to your grandma's phone? Draw it in 3 boxes." Warm-up `CSQ 4.1`.
Explore (unplugged-first, 7 min): **Envelope Relay** — a printed picture cut into 4 numbered pieces, 4 envelopes, four
"routers" (kids standing at desks); the pieces are sent one at a time along different kids; the receiver reassembles
by number; round 2 the teacher "loses" an envelope (2: the receiver must *ask* for packet 3 again = the protocol). Big
idea: "The internet cuts everything into packets, sends them many ways, and the rules (protocols) put them back
together." Play: 1B ch. 1 *Break It Up* then ch. 2 *Many Roads* (split, route, reorder; a link goes down mid-send);
2 ch. 2 then ch. 3 *Rules of the Road* (ACK/resend, duplicate detection, "count the dots" checksum, choose the fastest
path when a router is busy). Discuss: "What happened when the road closed? Did the message still arrive?" (2) "What
would happen with no numbers on the packets?" Exit: order the packet steps; why many paths; (2) what to do when packet
3 never arrives; what a checksum catches. Support: 1B levels with 3 packets and a glowing best path; stretch: timed
"rush hour" levels. Unplugged twin: the Envelope Relay is the twin; it is also the Explore. Notes: never say "the
internet is the cloud"; say "many computers and cables". Avoid real website names in talk and on the board (the
games cannot show real URLs either; §3.3.0).

##### 4.2 Lock it up — *Passphrases, private information, physical and digital security*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-NI-05** · P3.1 | **2-NI-05** · P7.2; 2-IC-23 · P7.2 |
| I can | say what information is private; make a strong passphrase and keep it to myself; name ways to protect a device | explain how physical and digital measures protect information (locks, backups, passwords, firewalls, HTTPS) and why |
| Deep link | `?chapter=locks&band=1b` | `?chapter=locks&band=2` |

Vocabulary: private, password/passphrase, backup, (2) firewall, HTTPS, two-step, physical vs digital. Do Now: "Which
would you NOT tell a stranger: your favourite colour, your address, your pet's name, your birthday? Why?" Warm-up
`CSQ 4.2`. Explore: the *Passphrase Builder*: pick four word tiles (never typed), watch the strength meter and the
"guess time" grow from seconds to centuries; *Ask this:* "Why is `password1` weak even though it has a number?" Big
idea: "Protect your stuff online like your stuff at home: lock it, keep the key, keep a spare copy." Play: ch. 4 *Lock
It* (1B: share/keep sort, passphrase builder, "where should the spare key (backup) live?", "who may you tell your
password?" scenarios; 2: match 12 measures to *physical* / *digital*, the *HTTPS or not* street (which shop sends
your card number in a sealed envelope), router password level, the backup-rule level). Discuss: "What makes a
passphrase strong *and* easy to remember?" (2) "Why is a locked door a cybersecurity measure?" Exit: strongest
passphrase; private or not; (2) physical vs digital classification; what HTTPS protects. Support: scenario tiles with
pictures; stretch: 1B "Password Detective" bonus levels. Unplugged twin: **Lock Sort** cards (physical/digital/both) and
the four-word passphrase dice game. Notes: do not ask kids to say or type their real passwords (the game never asks for
any real information and the scanner forbids that wording anyway); use the game's pretend accounts only.

##### 4.3 Secret messages — *Ciphers, spotting tricks*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-NI-05** (spot tricks; cipher as enrichment) · P3.1 | **2-NI-06** · P4.4; 2-NI-05 |
| I can | spot the signs of a trick message (urgent, too good to be true, asks for a password) and tell a grown-up; (fun) make a Caesar message | encode and decode with two or more methods (shift, substitution key, hidden-in-picture) and say which is harder to crack and why |
| Deep link | `?chapter=tricks&band=1b` | `?chapter=ciphers&band=2` |

Vocabulary: trick/phishing, cipher, key, (2) encryption, decrypt, steganography, brute force. Do Now: "A message says
'You won a free tablet! Reply with your password to claim it.' What do you do?" Warm-up `CSQ 4.3`. Explore: the
*Spot the Trick* inbox on the projector; the class votes safe/trick on three cards; then the Caesar wheel (turn it 3,
read the message). Big idea (1B): "Real companies never ask for your password; when in doubt, ask a grown-up." (2):
"Encryption scrambles a message so only someone with the key can read it; some scrambles are much harder to crack."
Play: 1B ch. 5 *Spot the Trick* (10 inbox cards, 4 cues to tap) then ch. 6 level 1-3 Caesar for fun; 2 ch. 6 *Secret
Messages* (shift, keyed substitution, hidden pixels, the two-key lockbox story for public-key, "crack the shift by
counting E") and the *HTTPS street* if not done. Discuss: "Which cue gave the trick away most often?" (2) "Why is a
keyed substitution harder than a shift? How many keys would a computer try?" Exit: trick or safe; what to do; (2)
decode a 5-letter shift; which method hides the message, not scrambles it. Support: cue checklist printed; stretch:
2-method messages. Unplugged twin: **Cipher Wheels** (printable) and the *Trick or Treat* card sort. Notes: no real
brand names, email addresses or web addresses anywhere on the board or in the game (scanner rules); the cards use
"Prize Team", "Your bank" and buttons like *Claim now* on purpose.

---

#### Unit 5 · Inside the Machine (Computing Systems)

##### 5.1 What's inside? — *Parts, hardware and software, designing a gadget*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-CS-01**, **1B-CS-02** · P7.2, P4.4 | **2-CS-02** · P5.1; 2-CS-01 · P3.3 |
| I can | name the parts of a device and what each does; model how hardware and software work together to do a task | design a gadget by choosing inputs, outputs, storage, processing and a connection, and explain the tradeoffs |
| Deep link | `/play/inside-the-machine?chapter=parts&band=1b` | `/play/inside-the-machine?chapter=gadget&band=2` |

Vocabulary: input, output, processor, storage, hardware, software, (2) sensor, tradeoff, Bluetooth vs cable. Do Now:
"List everything a tablet needs to show you a photo when you tap it." Warm-up `CSQ 5.1`. Explore: *A Tap Travels*
animation: finger → touch sensor → processor → the app (software) → the screen; *Ask this:* "Which of these is
software? What if the screen is missing?" Big idea: "Hardware is the parts you can touch; software is the
instructions; a task needs both." Play: 1B ch. 1 *Parts & Jobs* (tap the part for the job; build-a-device by wiring
input → processor → output; "what breaks if…") then ch. 2 *Hardware or Software* (sort; arrange the 5 tiles to model
*take a photo* / *play a song*); 2 ch. 5 *Design a Gadget* (briefs: step counter, plant waterer, door alarm; pick parts
from a bin with cost/battery/size meters; then three user quotes → choose two improvements, 2-CS-01). Discuss: "Act it
out: five kids are the five parts; what happens when the processor sits down?" (2) "What did you give up to make the
gadget cheaper?" Exit: match parts to jobs; hardware or software; (2) choose the best part for a brief; explain one
tradeoff. Support: picture tiles with labels read aloud; stretch: 1B "model it" level with 7 tiles. Unplugged twin:
**Be the Computer** role-play (input/processor/storage/output/software script cards). Notes: the game never shows a
brand or product name; "tablet", "laptop", "phone" only.

##### 5.2 It's not working! — *Troubleshooting*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-CS-03** · P6.2 | **2-CS-03** · P6.2 |
| I can | try the common fixes in order (power, cables, sound, caps lock, restart, close/reopen, Wi-Fi) before asking for help | follow a troubleshooting checklist/flowchart, change one thing at a time, swap a part to isolate the fault |
| Deep link | `?chapter=fixit&band=1b` | `?chapter=fixit&band=2` |

Vocabulary: restart, reconnect, (2) isolate, swap test, flowchart. Do Now: "Your tablet has no sound. Write 3 things to
check." Warm-up `CSQ 5.2`. Explore: the *Fix-It Desk* ticket "No sound" on the projector; the class orders the checks;
the game shows cost (time) per check; *Say this:* "Good fixers check the cheap things first." Big idea: "Troubleshooting
is a checklist, not a guess." Play: ch. 3 *Fix-It Desk* (1B: 8 tickets: won't turn on, no Wi-Fi, frozen app, caps
lock, no sound, headphones, won't charge, wrong password; choose checks in a sensible order; 2: 8 tickets where the
fault may be in a *connected* device (the printer, the router, the dock); fewest checks wins; swap-a-part moves; one
ticket is a trick: the user's cable, not the laptop). Discuss: "What did you check first and why?" (2) "Which ticket
fooled you? What is a swap test?" Exit: best first check; which check fixes caps-lock passwords; (2) order a 5-step
flowchart; which swap isolates the fault. Support: 1B checks are pictures; stretch: the "two faults" ticket. Unplugged
twin: **Help Desk** — printed tickets and check cards; pairs role-play customer and fixer; the class builds a wall
flowchart. Notes: this lesson pays back all year; print the class flowchart and hang it by the cart.

##### 5.3 Bits and pixels — *How computers store things*

| | 1B | 2 |
|---|---|---|
| Standards | enrichment (supports 1B-CS-02 *storage* in the system model; no 1B standard asks for binary) · P4.4 | **2-DA-07** · P4 |
| I can | explain that computers store everything as on/off (0 and 1); make a picture from 0s and 1s | represent the same data in several ways: binary, decimal, pixels, grey levels, RGB and a colour name |
| Deep link | `?chapter=bits&band=1b` | `?chapter=bits&band=2` |

Vocabulary: bit, binary, pixel, (2) byte, RGB, hexadecimal, encoding. Do Now: "Send 'HI' to a friend across the room
using only a flashlight on/off. How?" Warm-up `CSQ 5.3`. Explore: binary cards (16 8 4 2 1) on the projector; make
the class's grade number; then an 8×8 pixel grid filled from a row of 0/1. Big idea: "Everything in a computer is
numbers, and every number is on/off switches." Play: ch. 4 *Bits & Pixels* (1B: 6 levels: cards to numbers, numbers to
cards, 0/1 pictures, send-a-letter with 5 switches; 2: 8 levels adding grey levels (0-255), RGB sliders matching a
target colour, the same colour as a name / three numbers / a hex code, and "how many colours with 2 bits?"). Discuss:
"How many different numbers can 5 cards make?" (2) "Why do we need 3 numbers for a colour?" Exit (1B, marked against
1B-CS-02): where is a photo kept when the tablet is off; (2) convert 5-bit binary; which RGB is red; same colour, two
representations. Support: cards with dot pictures; stretch: 1B 8-bit letters. Unplugged twin: **Binary Cards &
Pixel Grids** (printables; the classic). Notes: digit runs in the game text are spaced ("255 0 128") because 7+ digits
in a row read as a phone number to the scanner.

---

#### Unit 6 · Tech Choices (Impacts of Computing; Would You Rather Live `tech` + the settings panel)

##### 6.1 Tech that changed the world — *Then, now, tradeoffs*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-IC-18** · P3.1 | **2-IC-20** · P7.2 |
| I can | name technologies that changed how people live and say one way they changed us (and we changed them) | compare the tradeoffs of a technology for everyday life and for jobs |
| Deep link | `/live?mode=wyr&class=<id>` (topic `tech`, 10 items, 20 s) | same (the discussion prompts differ) |

Vocabulary: technology, invention, tradeoff, (2) automation, privacy, career. Do Now: "Name one thing your grandparents
did without a computer that you do with one." Warm-up `CSQ 6.1` (5 items: GPS, wireless, robots, wearables, social
media as in the 1B clarification). Main activity (replaces Play): **Would You Rather (Live) · Tech choices**, 10
dilemmas (§3.6), 20 s each; after each reveal the teacher picks one "defend your side" pair (hands, 30 s each). Then the
**Timeline Walk** (unplugged, 8 min): 12 printed invention cards (printing press, telephone, radio, TV, home computer,
GPS, the web, phone with a camera, social media, voice assistants, self-driving cars, wearable trackers) placed on a
rope timeline; each pair gets one card and writes "+ one good change, − one worry" (2: "+ a job it creates, − a job it
changes"). Discuss: "Which invention would you un-invent for a week? What would be better and worse?" Exit: which
technology changed X; one benefit and one risk; (2) a tradeoff pair for driverless cars; a career it creates. Support:
sentence frames on the card; stretch: "influenced by culture" prompt (why emoji exist). Unplugged twin: the whole
lesson is unplugged except the live vote (replace with corners of the room A/B). Notes: WYR Live needs no login (join
code) if the teacher prefers an open room; use the class room when the results should land in the class's live history.

##### 6.2 Made for everyone — *Accessibility, usability, bias*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-IC-19** · P1.2 | **2-IC-21**, **2-CS-01** · P1.2, P3.3 |
| I can | find ways a game could work better for people who see, hear, read or move differently | test a product's usability and accessibility, spot bias in how it was designed, and recommend improvements |
| Deep link | `/play/robo-route?chapter=loops&band=1b` (any kit game; the *Settings* panel is the object of study) | `/play/inside-the-machine?chapter=gadget&band=2&level=4` ("the glove that only fits some hands" brief) |

Vocabulary: accessible, usable, caption, contrast, (2) bias, assistive, ergonomics. Do Now: "Play any game with the sound
off and your eyes closed for 10 seconds (partner keeps you safe). What did you miss?" Warm-up `CSQ 6.2`. Explore: the
kit's **Settings** panel on the projector (motion, captions, read-aloud, text size, speed, assist, contrast, colour
cues, left-handed, graphics): *Ask this:* "Who is each switch for? Who else does it help?" (bright sunlight, a noisy
bus: the clarification's point). Big idea: "Designing for people at the edges makes things better for everyone." Play
(as an audit, 18 min): pairs run the **Accessibility Audit sheet** on a game chapter: try 4 settings, rate "could I
still play?", write two improvements the game should have (1B-IC-19); 2 also audits the *Design a Gadget* brief "a
fitness glove sized for one hand size, tested only by the design team" and writes a 3-line recommendation
(2-CS-01, 2-IC-21). Discuss: "Which setting surprised you by helping *you*?" (2) "Who was missing from the testing
group?" Exit: which feature helps whom; a usability improvement; (2) spot the biased testing; best recommendation.
Support: audit sheet with picture icons; stretch: audit a second game. Unplugged twin: **Design for Sam** — persona
cards (Sam can't see well / hear / read yet / use one hand) and a paper remote control to redesign. Notes: the kit's
settings are real and shipped in every Oomba game, so this lesson needs nothing new to build.

##### 6.3 Share or keep? — *Public vs private, using others' work*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-IC-21**, **1B-AP-14** · P7.3, P5.2; 1B-NI-05 | **2-IC-23** · P7.2; 2-AP-16 · P7.3 |
| I can | use pictures and music I am allowed to use and give credit; keep my private information private online | explain the tradeoffs of making information public; recognise social engineering; give proper attribution |
| Deep link | `/live?mode=wyr&class=<id>` (topic `tech`, the 8 privacy/sharing items are first when the set is `tech-share`, see §3.6) | same |

Vocabulary: permission, credit/attribution, public domain, creative commons, (2) social engineering, spoofing, digital
footprint. Do Now: "You drew a great picture. A classmate copies it and puts their name on it. How do you feel? Now the
picture is a song on the internet." Warm-up `CSQ 6.3`. Main: WYR Live, 8 sharing dilemmas ("Everyone online sees your
drawing / only your family", "Free game with ads / pay once, no ads"...), each with a 30-second "what could go wrong /
what could go right" turn-and-talk; then the **Credit Card** activity: 6 printed media cards with licence badges
(public domain, CC-BY, all rights reserved, "made by me", "made by my friend who said yes", "found on a search")
sorted into *use freely / use with credit / ask first / don't*. 2 adds the **Spot the Spoof** round (a message that
"looks like" the school office asking for a login; cues). Discuss: "Why share at all? What is worth the risk?" Exit:
which media may you use; write a one-line credit; (2) a public/private tradeoff; the social-engineering cue. Support:
badge pictures; stretch: write the credit line the capstone will use. Unplugged twin: fully unplugged already. Notes:
this lesson sets the attribution rule used in 7.4 ("Credits" screen in every capstone game).

---

#### Unit 7 · Make Your Own Game (Builder capstone)

Prerequisite: a school plan (AI budget, §3.7.6) or the admin raises the site budget; the class has done unit 1 (any
band) so "sequence, loop, if, variable" mean something. Four periods; a fifth "showcase" is optional.

##### 7.1 Plan your game — *Design brief, roles, timeline*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-13**, **1B-AP-16**, **1B-AP-11** · P1.1, P5.1, P2.2, P3.2 | **2-AP-18**, **2-AP-13**, **2-AP-10**, 2-AP-15 · P2.2, P3.2, P4.4, P4.1, P2.3 |
| I can | plan a game on the planning sheet (who it is for, what happens, 3 parts); choose roles in my pair | split a game into parts, assign them with a 3-period timeline, write the main rule as pseudocode or a flowchart |

No game step. Do Now: "Your favourite simple game: what is the goal, what can go wrong, how do you win?" Warm-up
`CSQ 7.1` (retrieval across units 1-2). Explore: the Builder on the projector: teacher makes a 30-second "quiz with 3
questions about frogs" so kids see what one message produces, and the *playtest* the platform runs by itself. Big
idea: "Plan first: a good message to the Builder comes from a good plan." Main (18 min): the **Planning Sheet**
(printable + a *question step* so it is saved): audience (who), goal, 3 parts (decomposition), the one rule written
as *if … then …* (2: a 6-box flowchart), what the player sees first, and the *Builder message* (≤ 300 chars, because
that is what the step prefill carries). Pairs choose roles: *designer/typist* and *tester/note-taker*, swapping in 7.2.
2 also fills the timeline: period 2 = build core, period 3 = test and fix, period 4 = credits and demo. Discuss: read
three Builder messages aloud; "which one would a robot misunderstand?" Exit: 3 MC (what is decomposition; which
message is clearer; which role does what) + the planning sheet question step. Unplugged twin: the whole lesson is
paper. Notes: the message, not the plan, is what the AI sees; teach them to put the goal, the controls and the
"feel" into one paragraph.

##### 7.2 Build day — *Build, test, fix*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-15**, 1B-AP-10, 1B-AP-09 · P6.1, P6.2, P5.2 | **2-AP-17**, 2-AP-11, 2-AP-12 · P6.1, P5.1, P5.2 |
| I can | ask the Builder for my game, test it like a player, and ask for one fix at a time | write test cases before testing, find the breaking input, ask for precise fixes |

Build step (prefill = the planning sheet's Builder message). Do Now: "Write two things you will test first." Warm-up:
**skipped** (budget the minutes for the Builder queue). Explore (4 min): the *Builder etiquette* card: one change per
message, say what you saw and what you expected ("expected vs actual" from 2.1), 10 messages per student for the whole
project (the school-plan budget, shown on the sheet). Main (28 min, split): half the class presses *Start building*
at minute 6, the other half at minute 14 (the build runner is serial; a 30-kid stampede queues for minutes), the
waiting half runs **paper test cases** on their plan (2: a 5-row test table: input, expected, actual, pass?). Every
pair plays its own game between messages and logs one bug per message. Discuss (short): "What did the Builder get
wrong first time? What did you say to fix it?" Exit: 3 MC (expected vs actual; one change per message; what makes a
good test case) + "Paste your best fix message and what it changed." Support: the Quiz Show template as a starting
point (needs the small `lesson_steps.template` change, §3.7.5) so a weak plan still yields a working game; stretch:
a variable the player can see (score, lives). Unplugged twin: paper prototype play-test. Notes: if the Builder is
"resting" (budget cap) the lesson becomes paper prototyping; say so on the plan page the morning of.

##### 7.3 Playtest party — *Feedback from users, iterate*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-IC-20**, 1B-AP-16, 1B-AP-15 · P1.1, P2.2, P6.2 | **2-AP-15**, **2-DA-09**, 2-IC-22 · P2.3, P1.1, P5.3, P4.4, P2.4 |
| I can | watch someone play my game without helping; collect "2 stars and a wish"; change one thing because of it | collect feedback from many players with a tally sheet, use the numbers to refine a rule (difficulty, timing), explain the change |

Do Now: "What is the hardest part of watching someone play your game?" Warm-up `CSQ 7.3` (short, 3 items). Main:
**three rotations of 5 minutes**: half the pairs host (hand-in makes the game visible to the class: *Hand in* publishes
at class visibility, §3.7.4), half play two games each; players fill a half-sheet *2 stars and a wish* (1B) or the
**Playtest Tally** (2: fun 1-5, too easy/right/too hard, one bug, one wish); then swap. Rotation 3 (8 min): builders
send ONE fix message based on the feedback (2: "the data says 7 of 9 found level 2 too hard → what do you change?"
= refining a model from data, 2-DA-09). Discuss: "What did players do that you never expected?" Exit: 3 MC (why
feedback from different people; what the tally shows; which change the data supports) + "What did you change and
why?" Support: feedback sheets with faces; stretch: a second fix. Unplugged twin: paper prototypes rotate the same
way. Notes: the teacher moderates the class Games tab during rotation 1 (removing anything odd takes one tap); flagged
hand-ins wait for an admin and should be played from the maker's own screen instead.

##### 7.4 Show and credit — *Demo, document, attribute*

| | 1B | 2 |
|---|---|---|
| Standards | **1B-AP-17**, **1B-AP-14**, 1B-IC-21 · P7.2, P5.2, P7.3 | **2-AP-19**, **2-AP-16** · P7.2, P4.2, P5.2, P7.3 |
| I can | explain the choices in my game in a 60-second demo; credit ideas, art and help I used | write player instructions and a short "how it works"; credit code, media and people properly |

Do Now: "Who or what helped make your game? List everyone and everything." Warm-up `CSQ 7.4`. Main: 8 min to finish
the **Credits & How-to** (a question step with a template: *Made by (first names only / avatars)*, *Idea from*, *Art
and sounds*, *Thanks to our testers*, *How to play in 3 lines*, 2: *How it works: the main rule and the variables*);
then **demo circles** of 6 (each pair 60 s demo + 60 s one question), teacher visits each circle for one demo. The
rubric (§3.7.3) is filled by the teacher from the demo and the handed-in game; the gradebook row already shows the
handed-in game link, the planning sheet, the fix message and the credits. Discuss: "What would version 2 have?"
Exit: 3 MC (what belongs in credits; why attribution; what instructions need) + "One choice you are proud of and
why." Notes: kids never type full names into the Builder or the game; credits use first names or avatars, and the
teacher's class page is where real names live.

---

## 3. Game designs

### 3.0 Conventions shared by the four games

**3.0.1 Base and files.** All four are 2D official games on Oomba Kit 1.1.2: `seed-games/<slug>.html` + `.json`
(`l10n` with all 11 non-English descriptions), the byte-exact kit tag (+ `art-props` where noted), `<div id="game">`
before the kit tag, no doctype shell. Each ships: a `covers.js` recipe with a `cover()` test hook, `SEED_GAMES` entry,
scanner slug lists, `seeds.spec.js` entry, a `tests/unit/<slug>.test.js` in the Code Isle/Atlas pattern (vm-extract the
data block, solve every level with its `sol`, check every string key exists in 13 languages with identical `{slots}`),
`server/learn.js` `LEARNING` entries (`teaches`, `level: 'Grades 3-8'`) and a new hub `{ slug: 'computer-science',
key: 'cs', emoji: '💻', games: [...] }`. Game text lives in a `window.<Game>I18n` table keyed by English (the Code Isle
approach), handed to `Oomba.strings` under a prefix (`rr.`, `dd.`, `pp.`, `im.`); CSTA ids and block names stay
`dir="ltr"`. Everything under 2 MB without data packs (the level data is small; if the 13-language tables push a file
past ~400 KB, split them into `/vendor/data/<slug>/<version>/<lang>.js` packs with English built in).

**3.0.2 Teacher-first rules inside the game.**
- *No kid-facing setup when a lesson opened it:* with `BRB.params` present the game skips title → chapter map and goes
  title → the chapter's first unfinished level (the kit title screen stays: it is the audit's start button and the
  tap that unlocks speech on iPads).
- *Chapter map as the fallback:* 6-8 big tiles (`Oomba.ui.button big`) with the chapter name, a picture and stars; the
  band toggle sits on the map (two tiles: "Grades 3-5" / "Grades 6-8"), remembered per player in `BRB.storage`.
- *Learn card first:* level 1 of every chapter opens a one-screen learn card (big idea sentence, the new block or
  tool, one picture), read aloud when read-aloud is on (`Oomba.say`), re-openable from the HUD (`Oomba.ui.dialog`).
- *Hints that teach, three tiers, same everywhere:* tier 1 asks a question; tier 2 highlights the thing (a block, a
  tile, a column); tier 3 shows one concrete move and costs the third star. Never the full solution. Hint text is a
  per-level string, not generated.
- *Stars:* 1 = solved; +1 = "well made" (at/under par blocks; fewest edits in debug; fewest checks in Fix-It; no
  wrong claim in Data Detective); +1 = no tier-3 hint. Stars are the only reward (plus kit juice: `stage.burst`
  `confetti`/`sparkle`, `Oomba.juice.pop`); no timers unless a level says so, no lives, no leaderboard inside class play.
- *Pair mode* (Robo Route, Data Detective): a title-screen toggle "Two on one device"; a *Swap!* banner every 3 levels
  (`Oomba.ui.banner`), two avatars (`Oomba.avatar()` = the signed-in kid, a kit character for the partner). Nothing is
  typed; no names.
- *Finish state a teacher can see from across the room:* a big chapter progress pill in the HUD (`hud: ['progress',
  'count:star']`), stars on the chapter map, the kit results screen at the end of a chapter.
- *Tablets first:* portrait and landscape layouts, every control ≥ 48 px (grid cells in editors ≥ 40 px, ≥ 28 px under
  `data-fit-dense`), DOM below `var(--ok-safe-top)`, text sized from `--ok-ts`, own CSS motion behind an `.ok-rm`
  rule, `Oomba.settings.reduced` read for replays (instant moves instead of tweens).

**3.0.3 Deep-link parameters (platform change, small, needed by all four games).** Teacher-facing links are readable:
`/play/robo-route?chapter=loops&band=2&mode=debug&level=3`. The page (`/play/:slug`) validates an allow-list of four
keys (`chapter`, `band`, `mode`, `level`, each `[a-z0-9-]{1,16}`), packs them into one string `o = "loops.2.debug.3"`
(≤ 40 chars), signs it into the frame token next to `v g u l`, copies it into `init.params = { chapter, band, mode,
level }` and the SDK exposes `BRB.params` (frozen object, `{}` when absent). Lesson game steps get an `options` column
(`lesson_steps.options TEXT`, same grammar) so `routes/progress.js:254` appends it to the Play link; the CS Quest
materialiser fills it. Tests: token/init shape in `sdk-protocol.test.js` style, `docs/sdk.md` gains a section. Until
this lands, every game works from the chapter map and the lesson step body says "Pick *Loops*".

**3.0.4 What a game reports (today's plumbing).** After every solved level the game calls
`BRB.score.submit(starsInChapter, '<done>/<total> levels · <stars> stars')` (label ≤ 40 chars, e.g. `7/9 levels · 18
stars`); the page turns the first score into *done* for the lesson step and keeps the best. At the end of a chapter
the game shows the kit results screen and calls `BRB.gameOver({ won: true, score })`. Because the lesson link fixes the
chapter, **one lesson step = one chapter = one gradebook cell** that reads "7/9 levels · 18 stars". Phase 2 (§4.4): a
validated `brb:progress` message carrying `{ chapter, level, stars, std }` end to end.

**3.0.5 Test hooks (deterministic; the covers, autotest and e2e drive them).** `Object.assign(window.__brbTest, {
start({chapter, band, mode, level, seed}), program(blocks), run(), verdict(), skipAnimations(), cover() })` plus the
kit's `state()/step(n)`. RNG from `spec.seed`/`Oomba.rand(seed)`; replays on the kit clock (`Oomba.after/tween`), never
`setTimeout`.

**3.0.6 Scanner and safety.** No URLs, email-like or phone-like strings in any literal or comment (Packet Post's
"addresses" are invented words without `//`, `@` or `.tld`); no "type your password" wording (Packet Post picks word
tiles); numbers with 7+ digits are spaced; no brand or product names; nothing a kid types is ever shown to another kid
(level codes carry grid cells, not text, §3.1.6).

### 3.1 Robo Route (block coding on a grid)

**3.1.1 Base.** `Oomba.game({ api: 1, title: 'Robo Route', controls: 'none', camera: 'fixed', mode: 'topdown', fit:
'contain', hud: ['progress', 'count:star'], seed, levels: [...] })` with levels as `Oomba.level.grid` rows using the
built-in legend where the meaning fits (`#` wall, `~` water/lake, `$` gem, `K` key, `D` door, `G` goal, `P` start,
`i` learn-card sign, `^` trap), plus *paint* and *pressure-plate* tiles spawned as props (`w.spawn`, drawn with
`Oomba.art.toCanvas` from `art-props` or inline SVG). The robot is a kit character in a robot look (check
`Oomba.art.species` at build time; otherwise a 48-px SVG string). Moves are `Oomba.tween(w.hero, {x, y}, {ms:
Oomba.settings.reduced ? 0 : 220})` per command; bumps use `w.hero.wobble()` + `Oomba.sfx('wrong')` + a caption ("Bump!
A wall."), so right/wrong is never colour-only.

**3.1.2 The block editor (custom DOM in `Oomba.ui.root()`).** Two panels: the *shelf* (palette, 4-8 blocks per chapter,
real `<button class="ok-btn">` 48 px tall with an icon (`Oomba.icon`) and a word) and the *program* (an ordered list;
nested blocks are indented list items with a coloured left rail). Interaction is **tap-first** (the Code Isle lesson):
tap a shelf block → it appends at the cursor; tap a program block → it is selected and a 4-button tray appears (move
up, move down, delete, edit number/condition); tap a *repeat* or *if* block then *Wrap* → the selected blocks move
inside. Drag is an enhancement on Pointer Events with `setPointerCapture` and a tap fallback always available.
Keyboard: arrows move the selection, Enter/Space activate, Delete removes, `1-8` picks a shelf block; the tray is a
focus trap. Numbers (loop counts, parameters) come from a `-`/`+` stepper, never a text field (so the game would even
survive a live frame, though it is not hosted live). Layout: landscape → grid left (square, ~55%), shelf + program
right; portrait → grid top, shelf row, program list below in a scroller (more than 8 buttons, so the audit allows it
to scroll); `data-fit-dense` only on the editor grid. Run bar: *Run*, *Step*, *Reset*, *Hint* (`Oomba.ui.button`
kinds `go`, `quiet`, `quiet`, `icon`), plus a *watch* pill per variable in chapter 4+.

**3.1.3 Engine (the Code Isle split, reused as a pattern, not a module).** `window.RoboRoute = { compile(blocks) →
ast, run(level, ast) → { sim, events[], verdict } }`: a pure, synchronous interpreter with limits (≤ 500 commands, ≤
64 nested calls, ≤ 200 loop iterations), events `when gem collected`, `when bumped`, `when button pressed` fired by the
sim, variables as a small typed store (`number`, `flag`, `word` from a fixed list), procedures with up to two numeric
parameters. `verdict = { ok, reachedGoal, gemsLeft, bumps, commandsRun, blocksUsed, editsFromStarter, failReason }`.
The game replays `events` on the stage with the running block highlighted (step mode = one event per tap). Kids'
programs are data, never JavaScript (`scanner` requires it; the unit test proves no escape). Level record: `{ id, ch,
band: ['1b','2'], grid[], shelf[], starter[], sol[], par, tests?: [grid...], learn?: {title, text, block}, hints: [q,
highlight, move], story }` — `sol` solves it in tests, `starter` must fail in debug levels, `par ≥ blocks(sol)`.

**3.1.4 Chapters → levels (what each level practises).** Band 1B levels are 6×6, band 2 are 8×8 with a *plan card*
(write the plan by ordering pseudocode lines before the shelf unlocks on levels marked ✎). Numbers in brackets are
level counts.

| # | Chapter (`chapter=`) | Levels | Standard practised (1B / 2) | New blocks / tools |
|---|---|---|---|---|
| 1 | Sequences (`sequences`) | 8 (1B: 1-8) / 8 (2: 1-5 + 6-8 ✎ with two valid routes and par) | 1B-AP-10 seq, 1B-AP-08 (levels 6-8 compare two routes, star for the shorter), 1B-AP-11 (level 8: three legs, "plan the legs" card) / 2-AP-10 (plan cards), 2-AP-13 | forward, turn left, turn right; (2) plan card |
| 2 | Loops (`loops`) | 9 / 10 | 1B-AP-10 loops / 2-AP-12 nested (levels 6-9), level 10 par | repeat N; (2) repeat inside repeat |
| 3 | Conditionals & events (`conditionals`) | 9 / 9 | 1B-AP-10 if/else, events / 2-AP-12 compound (AND/OR/NOT levels 5-9) | if path ahead / on paint / has key, else; when gem / when bumped / when button; (2) AND OR NOT |
| 4 | Variables (`variables`) | 8 / 8 | 1B-AP-09 / 2-AP-11 (naming levels 5-7, three types) | set, change by, watch pill; (2) name picker, flag and word variables |
| 5 | Functions (`functions`) | 8 / 8 | 1B-AP-11, 1B-AP-12 (shelf "starter blocks" to remix, levels 6-7) / 2-AP-14 (parameters levels 4-8), 2-AP-16 (level 8 credited shelf block) | define My Block, call; (2) parameter stepper, "uses: … by …" credit line |
| 6 | Debug Lab (`debug`, `mode=debug`) | 9 / 9 | 1B-AP-15 / 2-AP-17 (every level has 3 test grids; level 8 edge case = empty maze; level 9 = program must *not* bump on any) | starter program given; edit counter; step mode; (2) test tabs |
| 7 | Best Route (`best-route`) | 6 / 6 | 1B-AP-08 (two given programs: pick and improve the better) / 2-AP-10 (flowchart card → program) | compare view (two programs side by side, run both) |
| 8 | Level Maker (`level-maker`, `mode=maker`) | editor + 3 "fix this level" tasks | 1B-AP-13/16/17 / 2-AP-15/18/19 (the lesson supplies the collaboration; the game supplies the editor, the solve gate and the code) | tile painter, solve gate, level code |

Each chapter's level 1 is the learn card + a near-trivial level; 2-4 build; 5-7 combine with earlier blocks; the last
one or two are par challenges. Levels used in lessons 1.1-2.2 are the chapters' first six; the rest are stretch.

**3.1.5 Stars, hints, feedback.** Stars per §3.0.2 (par = blocks; debug = edits ≤ minimal; maker = tester solved
it). Hints: tier 1 e.g. "How many squares until the wall? Count the floor numbers."; tier 2 pulses the tile or the
block; tier 3 adds one block greyed-in at the right place ("Try putting this here") — costs the star. On failure the
robot stops where it went wrong, the failing block pulses, and a caption says what happened in robot words ("I bumped
a wall after step 4"), which is the expected-vs-actual language the debugging lesson needs.

**3.1.6 Make-your-own-level, shared with the class (three tiers of sharing).**
- *Tier 0 — pass the device (ships day one, needs nothing):* the maker taps *Test with a friend*; the game hides the
  editor, shows the level in play mode with a "Hand the device to your tester" banner and the partner avatar; the
  tester's result (solved, bumps, blocks) is shown to both; the maker gets the level back with a *Change it* button.
  The solve gate (the author must solve the level before it can be saved or tested) guarantees every shared level is
  possible. Levels live in `BRB.storage['robo-route-v1'].levels` (≤ 20 per player, ~200 B each).
- *Tier 1 — level codes (ships day one, meant for grades 6-8 and for teachers):* a level is serialised to a code in a
  28-symbol alphabet with no vowels and no 0/O/1/I (`23456789BCDFGHJKMNPQRSTVWXYZ`), so no code can spell a word:
  version symbol + size (6/8) + wall/water bitmap, run-length coded + up to 4 gems, 1 key, 1 door, start+facing,
  goal + a 5-bit check symbol. Typical 6×6 level ≈ 14-18 symbols, worst case 26; shown in groups of four on the
  maker's screen and typed with an on-screen symbol pad (no keyboard, no text field; so nothing a kid types is free
  text). Decoding is local; nothing goes through a server; a teacher can put a code on the board for the whole class
  (the lesson's "class level of the day"). Risk accepted and noted (§6): an 8×8 wall bitmap can draw a crude shape;
  the teacher sees the level before projecting it, and tier-2 adds moderation.
- *Tier 2 — class level gallery (platform work, phase 2):* a new SDK call `BRB.classShare.put(blob)` / `.list()` with
  the same shape rules as live events (numbers and declared words only, ≤ 2 KB, validated in `play.js` and a route),
  stored per game × class with the maker's avatar, listed in-game as avatar tiles, removable by the teacher from the
  class Games tab style moderation UI, deleted with the class. Only then does "the class gallery" exist across
  devices without typing anything.

**3.1.7 Grade-band switch.** 1B: 6×6, four to six shelf blocks, floor numbers on tiles, read-aloud default on, ghost
path on the first two levels of each chapter, hints after 1 failed run. 2: 8×8, plan cards on ✎ levels, nested and
compound blocks, parameters, variable naming, test tabs, hints after 2 failed runs, par tighter, no ghost path.
Both: the same chapters and ids, so a lesson page needs only `band=`.

**3.1.8 Params and progress.** `chapter` (table above), `band` (`1b`|`2`), `mode` (`play`|`debug`|`maker`), `level`
(1-10). Progress per §3.0.4 (score = stars in the chapter; label `n/m levels · s stars`); in `mode=maker` the score is
the number of levels that passed a tester, label `3 levels tested`.

**3.1.9 Kit pieces reused vs custom.** Reused: `Oomba.game` lifecycle (title/how-to/countdown/results/pause/settings),
`level.grid`, `w.spawn/find/hud/win`, `Oomba.ui.button/dialog/banner/toast/announce/ask` (the chapter map's band question
uses `ask`), `Oomba.icon`, `Oomba.tween/after`, `stage.burst`, `Oomba.strings/t`, `Oomba.save` (settings only) +
`BRB.storage` (levels, drafts), `__brbTest`. Custom: the shelf/program editor DOM, the interpreter/sim/verdict, the
plan-card ordering widget (a list with up/down buttons), the compare view, the tile painter and symbol pad, the level
code codec. Audit watch-outs: program list items are controls (≥ 48 px, not taller than 1.5× wide → horizontal
pills, not tall squares); the tray must not overlap the program text; portrait phone needs the grid at ≤ 50% height.

### 3.2 Data Detective (data & analysis mysteries)

**3.2.1 Base.** The Would You Rather pattern: `Oomba.stage` (a detective's office backdrop, `art-props` desk, a kit
character as the detective who comments via `Oomba.say`) behind DOM *case cards* in `Oomba.ui.root()`; `Oomba.time.start()`
for the clock; the game calls `Oomba.test({state, start})` and `BRB.gameOver` itself. Every case: a **case file**
(story + question), a **data view** (table, grouped counts or bar chart: DOM `<table>` and `<div role="img">` bars with
printed values, never canvas), **tools** (sort by column, group by column, chart type, filter, +/- on bars in Chart It,
clean/merge/remove in Clean-Up, a slider in Model Makers) and a **claim card** (2-4 tiles via `Oomba.ui.ask`, with
`hint` and `tries`). Tables are ≤ 12 rows × 4 columns so they fit a phone in portrait with `data-fit-dense` and read
aloud row by row (`aria-live` through `Oomba.ui.announce`).

**3.2.2 Chapters → cases.**

| # | Chapter (`chapter=`) | Cases | Standard (1B / 2) | Core mechanic |
|---|---|---|---|---|
| 1 | Sort & Group (`sort`) | 8 | **1B-DA-06** / (2 warm-up) | tap a column header to sort, tap *Group* to count by category; the claim appears only when the right view is shown; star for the fewest views used |
| 2 | Chart It (`chart`) | 6 | **1B-DA-06** | choose the chart that answers the question (bar/pictograph/table), build the bar heights with +/- to match the table, then claim |
| 3 | Clues & Claims (`claims`) | 8 | **1B-DA-07** | read a chart; tiles *supported / not supported / can't tell yet*; predict the next bar with a slider; two cases have an irrelevant column to ignore |
| 4 | Clean-Up Crew (`cleanup`) | 8 | **2-DA-08** | tap bad rows → *fix / merge / remove*; convert counts to % before comparing groups of different size; star for not removing a good row |
| 5 | Model Makers (`models`) | 6 | **2-DA-09** | a toy simulation (ramp, plant, game power-up) with a rule slider; *predict → run 5 trials → compare → refine*; star when the rule's error is under the target in ≤ 3 refinements |
| 6 | My Data (`my-data`) | open + 3 guided | 1B-DA-06/07 · 2-DA-08, 2-IC-22 | enter class tallies (numbers via stepper, up to 8 categories whose labels are chosen from preset lists: colours, pets, fruit, sports, transport, "Option A-H"); chart; pick/compose a claim from tiles; compare two groups by % (2) |

**3.2.3 Controls.** All tap/keyboard (headers are buttons; bars have +/- buttons; sliders are `<input type=range>`
with 48-px thumbs and arrow keys); no drag required anywhere; no text fields (categories are presets, numbers are
steppers), so the game is also live-frame safe by construction.

**3.2.4 Hints and feedback.** Tier 1 "Which column would tell us *when*?"; tier 2 the column header glows; tier 3 the
sort is applied for you (costs a star). A wrong claim never says "wrong" alone: the detective says what the data
actually shows ("The chart shows Tuesday is the tallest bar, not Friday"), which is the sentence frame of lesson 3.2.

**3.2.5 Band switch.** 1B: chapters 1-3 + My Data (two preset survey questions), tables ≤ 8 rows, pictographs
available, read-aloud on. 2: chapters 4-6 + My Data with percentages and a second data set, tables to 12 rows,
"can't tell" appears more often, no pictographs. `params`: `chapter`, `band`, `level` (case 1-8).

**3.2.6 Progress.** Score = stars in the chapter (3 per case); label `5/8 cases · 12 stars`. My Data: score =
charts completed (label `2 charts made`).

**3.2.7 Kit reuse vs custom.** Reused: stage + character + `say`, `ui.ask` (claims), `ui.dialog` (case file),
buttons, `announce`, `strings`, juice. Custom: the table/sort/group widget, DOM bar chart with steppers, the
clean-up row tray, the simulation panel (a 200-line DOM/canvas toy per sim, drawn with `Oomba.draw` on a kit-fitted
canvas; the numbers it produces are printed in DOM). Audit watch-outs: table cells are text (overlap rule), so column
widths must not truncate without `text-overflow: ellipsis`; bars are not controls but their +/- buttons are.

### 3.3 Packet Post (packets, routing, protocols, passphrases, phishing, ciphers)

**3.3.1 Base.** `Oomba.game({ controls: 'none', camera: 'fixed', mode: 'topdown' })` with a hand-placed node graph per
level: houses and post offices (routers) as `w.spawn` props from `art-props`/`art-school`, roads drawn once on the
stage ground, packets as small sprites tweened along edges. Decisions are DOM cards in `Oomba.ui.root()` (choose a
road, reorder packets, pick a word tile, tap a cue) and `Oomba.ui.ask` for yes/no and 2-4-choice moments. The postal
metaphor is kept everywhere (packet = parcel, router = post office, protocol = the post office rules, encryption =
sealed envelope), because non-CS teachers can extend it unaided.

**3.3.2 Chapters → levels.**

| # | Chapter (`chapter=`) | Levels | Standard | Core mechanic |
|---|---|---|---|---|
| 1 | Break It Up (`packets`) | 6 | **1B-NI-04** | a picture/message splits into 3-6 numbered packets; tap a road per packet; at the house, drag/tap packets into order to rebuild (the picture reassembles visibly) |
| 2 | Many Roads (`routes`) | 7 | **1B-NI-04**, 2-NI-04 | several paths; a road closes mid-send (reroute); packets arrive out of order (reorder by number); a busy post office is slower (choose the faster path) |
| 3 | Rules of the Road (`protocols`) | 8 | **2-NI-04** | ACK cards: the house sends "got 1, got 2, got 4" → resend 3; duplicates to discard; "count the dots" checksum spots a damaged packet; a 3-step handshake ordering level; last level: write the rules by ordering 5 rule cards |
| 4 | Lock It (`locks`) | 8 (1B) / 8 (2) | **1B-NI-05** / **2-NI-05** | *share / keep* sort of info cards; passphrase builder from word tiles with a strength meter and "a computer would need … to guess"; backup level (where does the spare copy live?); (2) 12 measures → physical / digital; the HTTPS street (sealed vs open envelopes to shops); router admin password level |
| 5 | Spot the Trick (`tricks`) | 10 cards | **1B-NI-05**, 2-IC-23 | an inbox of pretend messages; tap the cues (urgent, prize, asks for password, odd sender, odd button) then *safe / trick / ask a grown-up*; star when all cues found before deciding |
| 6 | Secret Messages (`ciphers`) | 8 | **2-NI-06** (1B: levels 1-3 enrichment) | Caesar wheel (two rings, drag or ± to rotate), keyed substitution with a printed-style key card, "hide it in the picture" (toggle last bits of pixels), "crack the shift" by counting the most common letter, the two-key lockbox story level (public key, unplugged model) |

**3.3.3 Controls.** Roads and packets are buttons (≥ 48 px) or keyboard-selectable (Tab/arrows + Enter); reorder uses
up/down buttons as well as drag; the cipher wheel has ± buttons and arrow keys as well as rotate-drag; the pixel
toggles are a `data-fit-dense` grid of 40-px buttons. No text entry anywhere (passphrases are tiles; decoded messages
are revealed, not typed; the "answer" for a decode is a 4-tile `ask`).

**3.3.4 Safety constraints that shape content.** No real domains, email addresses, phone numbers, brands or company
names (scanner `external_url`, `contact_info`, `profanity`, `link`); senders are roles ("Prize Team", "Your bank",
"Game Shop"), buttons are verbs ("Claim now"), "addresses" are made-up place names; the HTTPS street shows a padlock
and "sealed", never a URL bar. The passphrase builder never asks for anything real and never uses the words "type your
password" (scanner `personal_info`).

**3.3.5 Hints, stars, band.** Tier 1 "Which packet number is missing?"; tier 2 the gap in the order strip glows; tier
3 the packet slots in. Stars: solved; no lost packet / all cues found / fewest resends; no tier-3 hint. 1B: chapters
1, 2 (levels 1-5), 4 (1B set), 5, 6 (1-3); 2: chapters 2 (all), 3, 4 (2 set), 5, 6. `params`: `chapter`, `band`,
`level`.

**3.3.6 Progress.** Score = stars; label `6/8 levels · 15 stars`; Spot the Trick reports `9/10 spotted`.

**3.3.7 Kit reuse vs custom.** Reused: `Oomba.game` chrome, props and characters for the town, `ask` for decisions,
`banner` for "Road closed!", `say` for the postmaster, juice, HUD. Custom: the graph layer (node/edge data per level,
edge buttons laid over the stage in DOM using `stage.viewX/viewY` to place them), the order strip, the strength meter,
the inbox card, the cipher wheel (two SVG rings) and the pixel grid. Audit watch-outs: edge buttons over a canvas must
not overlap each other at 390×844 → cap at 7 nodes per level and lay out per orientation.

### 3.4 Inside the Machine (parts, hardware vs software, troubleshooting, binary, gadget design)

**3.4.1 Base.** DOM-first in `Oomba.ui.root()` over a plain `Oomba.stage` backdrop (a workbench), pictures from
`Oomba.art.toCanvas` where the kit has them and inline SVG where it does not (processor, memory, cable, speaker,
sensor icons, drawn once, themed with `--ok-*` vars so dark mode and contrast work). `Oomba.ui.dialog` for tickets and
briefs, `Oomba.ui.ask` for 2-4-choice checks, custom DOM for sorting and wiring.

**3.4.2 Chapters → levels.**

| # | Chapter (`chapter=`) | Levels | Standard | Core mechanic |
|---|---|---|---|---|
| 1 | Parts & Jobs (`parts`) | 7 | **1B-CS-01** | a job is described ("turns your tap into a signal") → tap the part; *Build-a-Device*: connect input → processor → storage/output with tap-to-wire (tap a port, tap another); "what if it's missing?" prediction tiles |
| 2 | Hardware or Software (`hw-sw`) | 6 | **1B-CS-02** | sort 12 cards into hardware / software; *A Tap Travels*: order 5 tiles (finger, touch sensor, processor, app, screen) to model a task; two tasks (photo, song) |
| 3 | Fix-It Desk (`fixit`) | 8 (1B) / 8 (2) | **1B-CS-03** / **2-CS-03** | a ticket; a tray of checks each with a time cost; choose checks in order; the device reacts; (2) the fault may be in a connected device; *swap test* moves; star for fewest checks; a flowchart view shows the path taken |
| 4 | Bits & Pixels (`bits`) | 6 (1B) / 8 (2) | 1B enrichment (ties to 1B-CS-02 storage) / **2-DA-07** | flip 5 binary cards to make a number and back; 0/1 rows → pixel grid; a 5-switch letter sender; (2) grey levels, RGB sliders to match a swatch, the same colour as name / three numbers / hex, "how many colours with n bits" |
| 5 | Design a Gadget (`gadget`) | 6 briefs | **2-CS-02**, 2-CS-01 | parts bin (sensors, inputs, outputs, storage, connection, power) with cost / battery / size meters; a brief; build; the gadget "runs" a 10-second sim; then three user quotes → pick two improvements and justify (tiles) |

**3.4.3 Controls.** Everything is a button or a range input; wiring is tap-tap (drag optional); the pixel grid is a
`data-fit-dense` 8×8 of 40-px toggles (`aria-pressed`); sliders have ± buttons. No text entry.

**3.4.4 Hints, stars, band.** Tier 1 "Which check is quickest?"; tier 2 the cheapest useful check glows; tier 3 it
is chosen for you. Stars: solved; fewest checks / all parts right / colour within tolerance; no tier-3 hint. 1B:
chapters 1-4 (4 as enrichment); 2: chapters 3-5 (+1-2 as a quick review). `params`: `chapter`, `band`, `level`.

**3.4.5 Progress.** Score = stars; label `7/8 tickets · 19 stars` (Fix-It) or `n/m levels · s stars`.

**3.4.6 Kit reuse vs custom.** Reused: stage, dialogs, `ask`, buttons, `announce`, `say`, `strings`, juice.
Custom: card sorter (two drop zones with tap-to-move), tap-wiring canvas with DOM ports, the check tray with cost
meter and the flowchart view (an SVG built from the chosen path), binary cards, pixel grid, RGB panel, parts bin with
meters. Audit watch-outs: the parts bin is a scroller with > 8 buttons (allowed to scroll); the flowchart SVG is not
inspected but its labels must meet 3:1 contrast in both themes.

### 3.5 Live quiz sets (warm-ups, unit reviews, exit tickets)

**3.5.1 Shape.** All sets are teacher sets (`live_sets`) created in the teacher's own library by the materialiser (§5.3),
so they appear under *My sets* and can be edited. Three kinds per band:

| Kind | Per | Items | Mode and settings | Name pattern |
|---|---|---|---|---|
| Warm-up | lesson (23) | 5 (2 retrieval from the previous lesson, 1 vocabulary, 2 preview) | Question Battle, 15 s, shuffle off | `CSQ 1.2 warm-up · Loops (3-5)` |
| Unit review | unit (7) | 12 (3 columns × 4, `cat` = lesson topic so Brain Board gets columns) | Brain Board or Quest Race, 20 s | `CSQ Unit 1 review (6-8)` |
| Exit ticket | lesson (23) | 3 MC (`cat` = the CSTA id each checks) | a `quiz` lesson step (needs `LIVE_HOMEWORK`), or Question Battle at 20 s when hosted live, or paper | `CSQ 1.2 exit ticket (3-5)` |

Totals per band: 115 + 84 + 69 = **268 items** (536 for both bands). Limits respected: question ≤ 300 chars, 2-4
choices ≤ 120 chars, `secs ∈ {15, 20}`, `cat` ≤ 40, title ≤ 80, ≤ 100 items per set. English only (sets show verbatim in
every UI language). Items never mention real products, people or URLs. Warm-up and exit items are the same bank of
~8 per lesson, drawn differently, so authoring is ~8 items × 46 lessons + 168 review items.

**3.5.2 Deep links and gradebook binding.** The lesson page's *Start warm-up* opens
`/live?mode=battle&set=<setId>&class=<classId>` (and, once the lesson is assigned, `&cl=<clid>&step=<stepId>`, so the
run writes each student's score into the lesson's "Warm-up (live)" game step via `gameScore(..., 'live')`). The step is
a `game` step pointing at `question-battle` (the mode's official game) because that is what `createSession` binds to;
this depends on fixing the "Host live" link for built-in modes (map-teach gotcha 1: emit `mode=` via `liveGameOf`).
Exit tickets as `quiz` steps need `LIVE_HOMEWORK=1`; the program page says so and offers the live or paper form.

**3.5.3 Sample items** (each with the CSTA id it checks; `*` marks the right choice).

*Unit 1 · 1B* — "Which program moves the robot 8 squares with the fewest blocks?" `repeat 8 { forward }*` / eight
`forward` blocks / `repeat 4 { forward }` / `forward, repeat 7` [1B-AP-10]. "Two routes reach the flag. Route A has 9
steps, route B has 6 steps and crosses the puddle. Which is best if the robot must stay dry?" A* / B / both / neither
[1B-AP-08]. "What does `change score by 1` do?" adds one to the score* / sets the score to 1 / deletes the score /
repeats once [1B-AP-09].
*Unit 1 · 2* — "How many squares does `repeat 3 { repeat 2 { forward } }` move?" 6* / 5 / 3 / 9 [2-AP-12]. "The door
opens only if the robot has the key AND is touching the door. The robot has the key and is two squares away. Does it
open?" no* / yes / sometimes / only with a loop [2-AP-12]. "Which is the clearest variable name for the number of gems
left?" `gemsLeft`* / `g` / `thing` / `number1` [2-AP-11]. "A procedure `Room(steps)` is called with 3 and then 5. What is
`steps` called?" a parameter* / a loop / an event / a bug [2-AP-14].
*Unit 2 · 1B* — "The robot was supposed to stop at the flag but walked into the lake. What is the first thing a good
debugger does?" runs it one step at a time to see where it goes wrong* / deletes everything / adds more blocks / asks
for the answer [1B-AP-15]. "Who is the *navigator* in pair programming?" the one who reads the plan and watches for
mistakes* / the one who types / the teacher / the fastest kid [1B-AP-16].
*Unit 2 · 2* — "Your program passes maze A and B but not C, which has no gems. What kind of test is C?" an edge
case* / a syntax error / a loop / a parameter [2-AP-17]. "Which note helps the next person most?" "Level 3: the key is
behind the water; you need `if has key`"* / "good level" / "my level" / "123" [2-AP-19].
*Unit 3 · 1B* — "You want to know which month had the most rain. What should you do to the table first?" sort by
rain* / sort by month name / delete the months / count the rows [1B-DA-06]. "The chart shows 2 days of plant growth.
Can we predict day 10?" not yet, we need more days* / yes, exactly / yes, it will be 10 / plants do not grow
[1B-DA-07].
*Unit 3 · 2* — "A survey row says a student has 'twelvety' pets. What should you do?" remove or fix the row before
charting* / keep it, data is data / change every row / make it the title [2-DA-08]. "Your ramp rule predicted 40 cm;
five trials averaged 52 cm. What next?" change the rule and test again* / keep the rule / stop measuring / run one more
trial only [2-DA-09]. "Which survey question is biased?" "Don't you agree recess is too short?"* / "How long should
recess be?" / "What do you do at recess?" / "Do you like recess? yes/no" [2-IC-22].
*Unit 4 · 1B* — "A photo is sent over the internet. Which is true?" it is cut into packets that may take different
roads and are put back together* / it travels in one piece / it goes through one wire / it is drawn again [1B-NI-04].
"Which passphrase is strongest?" `purple-river-bicycle-moon`* / `password1` / `abc123` / your pet's name [1B-NI-05].
*Unit 4 · 2* — "Packet 3 never arrives. What does the protocol do?" the receiver asks for packet 3 again* / gives up /
guesses what it said / sends the whole message to everyone [2-NI-04]. "Which is a *physical* security measure?"
locking the room with the backup drive* / a firewall / HTTPS / a strong Wi-Fi password [2-NI-05]. "A shift of 3 turns
A into D. What does HELLO become?" KHOOR* / EBIIL / HELLO / OLLEH [2-NI-06].
*Unit 5 · 1B* — "Which part does the thinking?" processor* / screen / speaker / cable [1B-CS-01]. "The tablet has no
sound. Best first check?" is the volume up and are headphones plugged in?* / buy a new tablet / delete the app / restart
the Wi-Fi [1B-CS-03].
*Unit 5 · 2* — "The printer will not print from one laptop but prints from another. Where is the fault most likely?"
the first laptop or its connection* / the printer / the paper / the building's power [2-CS-03]. "Which three numbers
make pure red in RGB?" 255 0 0* / 0 255 0 / 0 0 255 / 255 255 255 [2-DA-07]. "A plant-watering gadget needs to know
if soil is dry. Which part?" a moisture sensor* / a speaker / a screen / a bigger battery [2-CS-02].
*Unit 6 · 1B* — "Which invention let people talk to someone far away for the first time?" the telephone* / the
printing press / the bicycle / the oven [1B-IC-18]. "Captions in a game help…" people who cannot hear AND people in a
noisy room* / only the designer / nobody / only people who can hear [1B-IC-19]. "You find a picture online for your
game. What first?" check if you are allowed to use it and give credit* / use it, it is online / change one pixel /
print it [1B-IC-21].
*Unit 6 · 2* — "Driverless cars might…" reduce some accidents but could be hacked and change drivers' jobs* / have no
downsides / have no upsides / not need software [2-IC-20]. "Face unlock works badly for some skin tones. Most likely
cause?" it was tested with a group that all looked alike* / phones are too small / nobody uses it / it is a cipher
[2-IC-21]. "Posting your full name, school and daily route online is risky because…" strangers can use it to trick or
find you* / it uses data / it is boring / it is illegal everywhere [2-IC-23].
*Unit 7 · both* — "Decomposition means…" breaking a big problem into smaller parts* / deleting a program / making a
loop / adding music [1B-AP-11 / 2-AP-13]. "Which Builder message is clearest?" "A quiz with 6 space questions, 3
choices each, a rocket flies higher for each right answer"* / "make a game" / "something cool" / "space!!!" [1B-AP-13 /
2-AP-10]. "Credits should list…" people, art and ideas you used* / your home address / your password / nothing
[1B-AP-14 / 2-AP-16].

### 3.6 Would You Rather (Live) · "Tech choices"

**3.6.1 Platform work.** Two new topics instead of one, so lesson 6.3 can be deterministic: `tech` (impacts, 20
items) and `online` (sharing & privacy, 10 items). Each: items in `scripts/data/would-you-rather/en.json` (`id:
'tech-1'…`, `cat`, `a/b: {text ≤ 60 chars, tags from TAGS}`), English fallback per item in the other 12 files (the
bank stays ≥ 90% complete: 414 + 30 → 93%), `cat.tech` / `cat.online` names in `ui.json` for 13 languages, `TOPICS`
(`server/live/wyr.js:12`) and `CATS` (`scripts/wyr-bank.js:21`), `node scripts/wyr-bank.js`, seed, the
`live-wyr-atlas.test.js` topic count. Teacher-first addition: `/live?mode=wyr&starter=wyr:tech:10:20` should preselect
topics/count/secs (today only mode is preselectable), a ~10-line change in `routes/live.js:166-171` + `views/live.js`.
Lesson 6.1 uses `wyr:tech:10:20`, 6.3 `wyr:online:8:20`. No points, class split + all-time split at the reveal, as today.

**3.6.2 The 30 dilemmas** (A / B; tags in brackets). Topic `tech`:
1. A robot that cleans your room / a robot that cooks your dinner [make, food]
2. A phone that never needs charging / internet that never drops [tech, calm]
3. A self-driving school bus / a bus with a driver you know [brave, social]
4. Learn from a video you can pause / learn from a person you can ask [think, social]
5. A watch that counts your steps / a watch that reminds you to drink water [fast, kind]
6. Video-call your grandparents every day / visit them once a month [social, kind]
7. A voice helper that knows everything / one that never listens unless you press a button [think, calm]
8. A game that is free but shows ads / a game you pay for once with no ads [fun, think]
9. Live in a town with no internet for a week / with no cars for a week [nature, brave]
10. A robot teacher for a day / a robot referee for a game [tech, fun]
11. A map app that picks your route / a paper map and your own choices [fast, think]
12. Translate any language with your phone / learn one language really well [tech, think]
13. A 3D printer that makes toys / a 3D printer that makes spare parts for broken things [fun, make]
14. Headphones that block all noise / headphones that let safe sounds through [calm, kind]
15. A drone that delivers your lunch / a friend who brings it on a bike [fast, social]
16. A smart fridge that orders food / a shopping list on paper [tech, calm]
17. Every lesson on a tablet / every lesson on paper [tech, make]
18. A robot arm that helps a doctor / a robot that helps a farmer [kind, nature]
19. Computers that write songs / computers that only play songs people wrote [make, think]
20. A job building robots / a job fixing robots [make, tech]
Topic `online`:
21. Everyone online can see your drawing / only your family can see it [brave, social]
22. Share one photo with the whole world / share ten photos with ten friends [social, calm]
23. A nickname online that nobody knows / your real first name online [think, social]
24. An app that is free if it sees where you are / an app that costs a little and never knows [think, calm]
25. Ask a grown-up before every download / never download anything [kind, calm]
26. Tell a friend your password so they can help / fix it alone and take longer [brave, think]
27. Save your photos only on your tablet / also keep a copy somewhere safe [calm, think]
28. Use a picture someone else made and credit them / draw your own, even if it is worse [make, kind]
29. A class page where anyone can comment / one where only your class can [social, calm]
30. Delete an old post you are embarrassed by / leave it and laugh [brave, fun]

**3.6.3 Discussion scaffolds printed with lessons 6.1/6.3.** After each reveal: "Who chose A and why? What could go
wrong with A? With B?" and for 2: "Who is helped, who is hurt, what job changes?" (2-IC-20) / "What is public, what
is private, who else could see it?" (2-IC-23).

### 3.7 Builder capstone

**3.7.1 Planning sheet** (printable; also a `question` step with the same prompts so it is saved and visible in the
gradebook). Fields: *Title (working)* · *Who is it for?* (age, what they like) · *What is the goal of the player?* ·
*Three parts of the game* (decomposition) · *The main rule* as `if … then …` (1B) / a 6-box flowchart (2) · *What the
player sees first* · *One variable the player can see* (score, lives, time) · *Roles* (designer/typist, tester/note-taker;
swap in 7.2) · *Timeline* (2: build by period 2, test by 3, credits by 4) · ***The Builder message*** (≤ 300 chars: the
step prefill limit; the sheet has a 300-character box) · *Test plan* (3 things to try, 2: a 5-row test table).

**3.7.2 Builder etiquette card** (one page, stays on the desk): one change per message; say what you saw and what you
expected; 10 messages for the whole project; play your game after every change; never type your full name, school,
address or anyone else's name; if the Builder is "resting", switch to the paper prototype.

**3.7.3 Rubric** (teacher fills from the demo, the handed-in game and the question steps; 3 levels: *Getting there /
Got it / Went further*). Each row names the standard it evidences.

| Criterion | 1B evidence | 2 evidence |
|---|---|---|
| **Plan** — the game matches a plan made first, with the audience in mind | 1B-AP-13 (plan sheet before building; a change made because of a tester) · 1B-AP-11 (three parts named) | 2-AP-10 (pseudocode/flowchart of the main rule) · 2-AP-13 (parts) · 2-AP-18 (roles and timeline kept) |
| **Program** — the game works and uses the ideas from unit 1 | 1B-AP-10 (a sequence, a loop or a condition the player can see) · 1B-AP-09 (a visible variable) · 1B-AP-15 (a bug found and fixed, logged) | 2-AP-11/12 (named variable, a condition or loop) · 2-AP-17 (test table with a failing case that was fixed) |
| **Test with others** — feedback was collected and used | 1B-IC-20, 1B-AP-16 (two stars and a wish from ≥ 2 testers; one change made) | 2-AP-15 (feedback from ≥ 4 players) · 2-DA-09 (a change justified by the tally) · 2-IC-22 (pooled class tally) |
| **Explain and credit** — demo, instructions, credits | 1B-AP-17 (60-s demo explains one choice) · 1B-AP-14, 1B-IC-21 (credits list ideas, art, help; no unpermitted media) | 2-AP-19 (how-to-play + how-it-works) · 2-AP-16 (credits for code/media/people) |

**3.7.4 Peer play-testing protocol** (lesson 7.3). Rotations of 5 minutes, three per period. Hosts hand in first
(*Hand in* publishes the game at class visibility: a clean scan goes live instantly, a flagged version waits for an
admin and is played from the maker's screen instead). Players open the class Games tab, play, and fill the sheet:
1B *2 stars and a wish* (faces + two lines); 2 *Playtest Tally* (fun 1-5, too easy / right / too hard, one bug, one
wish). Testers do not talk to the maker during play; makers watch and write what the player did (not what they
should have done). Rotation 3 is a single fix message; 2 pools the tallies on the projector (crowdsourced data) and
each pair reads its own row before changing anything.

**3.7.5 Class-sharing safety and the small platform changes.** Hand-in never widens beyond the class; teachers remove
and restore games on the class Games tab; the scanner blocks anything that fails and queues anything flagged; kids'
games cannot collect text from players unless the template does and even then nothing leaves the frame. Credits use
first names or avatars only (the etiquette card says so; `cleanText` filters titles and descriptions anyway). Two
small changes make the capstone safer for weak plans: (a) `lesson_steps.template TEXT` (one of `TEMPLATE_KEYS`) so a
build step can start from *Quiz Show* instead of an empty game (`routes/progress.js:307` passes it to `templateHtml`);
(b) the build-step prefill stays 300 chars, so the planning sheet's message box is 300 chars.

**3.7.6 Budget and scheduling (honest numbers from map-teach §5.5).** 30 students × ~8 messages = ~240 Builder turns
per period, far beyond the free site-wide $5/day pool (which would also switch *every* site user to the mock). The
program page therefore says: the capstone needs a **school plan** (30 seats ≈ 3,000 messages/year, 30 per person per
day) or an admin-raised budget; per-user limits of 2 concurrent builds and 20 chat messages/min are fine; the single
build runner means *stagger starts in two halves* (built into lesson 7.2). The lesson page shows a live "Builder
status" line (on / resting) the morning of, so the teacher can switch to the paper prototype before the period.

---

## 4. Assessment and tracking

### 4.1 Exit tickets (what the teacher actually gets at 0:45)

Every lesson ends with **three multiple-choice items + one sentence**:
- The 3 MC items are a `quiz` step (`items: [{q, choices, answer}]`, auto-marked, `score` = % right, `marks` = `1/0/-`
  per item; `cat` on each item = the CSTA id it checks). This needs `LIVE_HOMEWORK=1` (quiz steps and their student
  APIs 404 without it) and the materialiser must create quiz steps from the catalogue, since `copyLesson` drops quiz
  items. Where a school has the flag off, the lesson page offers the same 3 items as a live set (Question Battle, 20
  s; marks land in `live_run_scores`) and as a printable half-sheet.
- The sentence is a `question` step; the teacher reads and gives feedback from the lesson progress page (existing
  `review()` flow, "to read" badges). Sentence frames are printed in the plan so grade-3 answers are one line.
- The teacher's 0:45 view: the lesson progress grid (students × steps) already shows ✅/◐, the game step's `score +
  label` ("5/9 levels · 12 stars"), the quiz % and the unread answers. Nothing new is needed for *this lesson, today*.

### 4.2 What the platform can record today (used as is)

| Signal | Store | How CS Quest uses it |
|---|---|---|
| Step done / started, plays, seconds | `step_progress` | "practised": the game step is *done* on the first score (= first level solved) or 120 s of play |
| Best score + 40-char label per game step | `step_progress.score/label` | levels and stars per chapter (one step per chapter, §3.0.4) |
| Quiz % + per-item marks | `step_progress.score/marks` | exit-ticket accuracy, per item |
| Live run per-question marks and item stats | `live_runs.items`, `live_run_scores.marks` | warm-up and live exit tickets; "top wrong" per question for re-teaching |
| Free-text answer + teacher feedback | `step_progress.answer/feedback` | the sentence, the planning sheet, the credits |
| Handed-in game link | `step_progress.game_id` | capstone evidence |
| Lesson `subject`, `grade`, `objectives` | `lessons` | filtering the library; the band |

Not recordable today: which *level* inside a chapter a student is on, hints used, per-level stars, which standard a
particular level practised. The one-step-per-chapter rule plus `lesson_steps.standards` covers "practised"; accuracy
comes only from exit tickets and live runs.

### 4.3 The per-class "Standards practiced" view (what it shows)

A new class tab **Standards** (`/class/:id/standards`, key `school.classTabs.standards` in 13 languages, class
managers only, plus `/class/:id/standards.csv`). Rows = CSTA standards grouped by concept for the band(s) of the
lessons assigned to the class (1B, 2 or both; other bands hidden). Columns:

| Column | Source | Meaning in plain words (shown as a tooltip/legend) |
|---|---|---|
| **Lessons** | `class_lessons` (not removed) ⋈ `lesson_steps.standards` | which assigned lessons teach it (links) |
| **Practiced** `17 / 26` | students with ≥ 1 *done* step carrying the code | "did the activity" |
| **Checked** `72%` | mean of per-item marks where the item's `cat` = the code (quiz steps, live runs of this class) | "got exit-ticket items right"; blank when no checks yet |
| **Needs a look** | students with 0 of ≥ 2 checked items right | names (teacher only) |
| **Last** | max `done_at` / run date | recency |

A legend states the honest limit: *Practiced* means the step was completed, not that the standard was mastered;
*Checked* is three questions, not a test. A per-student drill-down lists the same rows for one child (inside the
class; never on a projector page, never public, deleted with the class like the gradebook).

### 4.4 What must be added (smallest set, in order)

1. `lesson_steps.standards TEXT` (comma list of codes; migration in `db.js MIGRATIONS`), set by the materialiser;
   `L.cleanStep` accepts it (validated against `server/standards/csta.js`, a tiny catalogue: code → band, concept,
   practices, short statement; generated once from `csta.json`).
2. Keep `cat` through `addQuizStep` (lessons.js:234) and `itemRow` (classlive-results.js:80) so per-item codes survive
   into `marks`.
3. The grouped query (one SQL per page, `P.classProgress` style) + the tab + CSV + i18n keys + deletion hooks (nothing
   new is stored per student, so the existing `step_progress`/`live_run_scores` deletion already covers it).
4. (Phase 2) `brb:progress` message `{ chapter, level, stars, std }` validated in `play.js TYPES`, a route writing a
   small `step_events` table, so *Practiced* can say "9 levels, incl. 3 nested-loop levels" and the game can report
   per-level standards. Not needed for v1.
5. (Nice to have) `games.standards` from the seed JSON for the four games so the game page can show "Practices CSTA
   1B-AP-10…" to teachers.

### 4.5 Formative moves that need no data at all

Printed in every plan: the *look-fors* while circulating, the "show me" on the projector, and thumbs up/side/down on
the big idea sentence. The standards view is for the end of a unit and for the principal, not for the period.

---

## 5. How teachers reach it

### 5.1 Pages

| Page | Who | What it does |
|---|---|---|
| `/teachers/cs-quest` (public, indexed) | anyone | The program in one scroll: the promise (8 bullets of §0, shorter), the seven units with lesson titles and standards, the three paths, how-it-works screenshots (`STEPS.teachersCs`: program page → lesson plan → warm-up live → game at chapter → standards tab; 4 webp sizes each via `how-shots.js --only cs`), FAQ (devices, time, no CS background, standards, privacy, cost of the capstone without a price), *Set up my school* / *Sign in* CTAs. Copy under `teachers.cs.*` (uncounted prefix, English-first, rendered with `el()`/`fb()`); `LOCALIZED`, `sitemapEntries`, `seo.test.js PUBLIC`, `langsWithKey('teachers.cs.h1')`, OG image. No child names, no prices. |
| `/learn/computer-science` (public) | parents, kids, search | A `HUBS` entry listing the four games with `LEARNING` data ("Grades 3-8", teaches "Algorithms, Loops, Debugging, Data, Networks, Cybersecurity, Computer parts"). |
| `/teach/cs-quest` (signed-in staff) | teachers, school admins | The **program page**: band toggle (3-5 / 6-8, remembered), the units as cards with lesson rows; per lesson: *Open plan*, *Preview game* (deep link), and the state *Added to my library ✓ / Add*; per unit: *Add unit to my library*; top: *Add Full / Core 10 / CS Ed Week*. A **Classroom checks** box: devices tested? (`/play/robo-route` works signed-out), live on? (`liveOn()`), quiz steps on? (`LIVE_HOMEWORK`), Builder budget status for unit 7, school time zone. Links from `/teach` (next to *Lesson library*) and from the library's tools row. |
| `/teach/cs-quest/:key` (signed-in) | teachers, subs | The **lesson plan page** = the printed plan rendered: header (title, band, 45 min, standards with hover statements, practices), I-can, vocabulary, materials, the minute-by-minute table, projector script, differentiation, unplugged twin, teacher notes, the boxed *Sub plan*, exit ticket preview + answer key. Buttons: **Start warm-up** (`/live?mode=battle&set=<id>&class=<cid>` → needs the set to exist, so it first materialises if needed), **Open game at this chapter** (deep link; opens in a new tab for the projector), **Assign to class** (existing `POST /api/lessons/:id/assign` with class + due date; materialises first if the teacher has not added it), **Print** (`?print=1` → `.printdoc` + `/js/print.js`; two pages + the printable twin and exit tickets as extra pages). Band toggle at the top switches to the twin key. |
| `/teach/lessons/:id` (existing editor) | teacher | The materialised copy, fully editable like any lesson. A small banner "From CS Quest 1.2 (v3) · Open the plan page" via `lessons.template_key/template_version`. |
| `/class/:id/standards` (new tab) | class managers | §4.3. |
| `/class/:cid/lessons/:clid` (existing student page) | students | Unchanged: *Play* opens the game at the right chapter because the step carries `options`; quiz step, question step, build step as today. |

### 5.2 The buttons, end to end (what "press start" really does)

1. **Start warm-up.** Teacher is on the plan page, class is chosen (last used class remembered). If the lesson is not
   yet in the library → materialise (lesson + 2 sets, < 1 s), then redirect to `/live?mode=battle&set=<warmupSetId>
   &class=<classId>[&cl&step]`. The /live form opens preselected; one more click (*Open the room*) shows the join code
   on the projector. Hosting a class room requires that the teacher *teaches* the class (school admins who do not get
   the existing `notTeacher` message, with a hint to use an open room instead).
2. **Open game at this chapter.** `/play/<slug>?chapter=…&band=…[&mode&level]` (teacher preview; the `BRB.params`
   plumbing makes the game skip the map). Students never use this link: they open the lesson in *Classes*.
3. **Assign to class.** Materialise if needed, then the existing assign dialog (unit, opens, due; time-zone note). On
   the student page the game step link already carries `?lesson&step` and now the `options`.
4. **Print.** Server-rendered `.printdoc` with `@media print` rules (hide chrome, page breaks before the twin and the
   exit tickets, 12-pt body, no colour reliance). The same page with `?band=2` prints the other band.

### 5.3 Mechanism: a repo catalogue plus a materialiser (map-teach §1.10 option 1)

- **Catalogue**: `seed-lessons/cs-quest/<band>/<unit>.<lesson>.json` (46 files) + `units.json` (names, order, paths)
  + `sets/` (warm-up, review, exit items). Schema in Appendix A. Validated by a unit test against the same limits the
  services enforce (`cleanStep`, `SETS.LIMITS`), that every `gameSlug` is in `SEED_GAMES`, every `standards` code is in
  `csta.json`, every band's 21/23 codes appear as primary at least once, every lesson's minutes sum to 45, and every
  `options` string matches the params grammar.
- **Materialiser** `server/services/lesson-templates.js`: `addToLibrary(user, schoolId, key)` → folder *CS Quest* →
  subfolder per unit → `L.createLesson` (title `CS Quest 1.2 · Again and again (Loops)`, subject `Computer science`,
  grade `Grades 3-5` / `Grades 6-8`, summary, objectives = the I-can lines, `template_key`, `template_version`) →
  `L.addStep` per step in order: *Do Now* (text, 4 min) · *Warm-up (live)* (game = `question-battle`, 5 min, options =
  the warm-up set id is not needed here; the set is created with `SETS.createSet` and linked by `lesson_id`) ·
  *Explore* (text, 7 min, the projector script condensed to ≤ 4000 chars) · *Play* (game = the CS game, 18 min,
  `options`, `standards`) · *Discuss* (text, 6 min) · *Exit ticket* (quiz, 3 min, items with `cat`) · *In your own
  words* (question, 2 min). Build lessons use a `build` step with the ≤ 300-char idea (+ `template: 'quiz'`). Game
  steps whose game is not published are skipped with a notice, exactly like `seedDemoLessons`. Idempotent per
  `(owner, key, version)`; "Add again" makes a fresh copy; a newer catalogue version shows an *Update available*
  banner that adds a new copy and leaves the teacher's edited one alone (assignments are live links, so we never
  mutate a lesson in place).
- **Route** `POST /api/lessons/from-template/:key` (rate-limited like `lesson-new`), `POST /api/lessons/from-template/
  unit/:unit`, `.../path/:path`; mounted from a new `server/routes/cs-quest.js` in `server/app.js`. Requires
  `isStaffOf` some school (a teacher in no school sees the public page and the "Set up my school" box, as today).
- **Why not official lesson rows**: the ownerless/official lesson concept touches every permission helper
  (map-teach §1.10 option 3); the catalogue path makes everything downstream (assign, progress, live, gradebook,
  copy, share within school) work unchanged, and teachers can edit their copy, which they will.

### 5.4 Fit with the existing lessons library

The teacher's library gets a *CS Quest* folder they own; colleagues get copies through the normal "Share with my
school" / *Copy* path (and quiz steps must be regenerated from the set on copy: fix `copyLesson` to copy `set_id/items`,
or re-materialise by `template_key`). *Draft with AI* and the demo lessons are untouched. The library tools row gains
one link: *CS Quest program*.

### 5.5 Chrome, languages, tests

New UI strings (program page, plan page, buttons, the Standards tab, CSV headers, banners, toasts) go in `en.json` +
all 12 locales (`lessons.cs.*`, `school.classTabs.standards`, `js.cs.*` if a browser module is needed; expect ~90
keys), with notes in `notes.json`. Lesson content, items, dilemmas and standards codes are data (English). Tests to
extend: `lessons.test.js`/`lessons-quiz.test.js` (materialiser), `progress.test.js` (standards tab + CSV),
`live-pages.test.js` (preselect by starter), `seo.test.js PUBLIC`, `how-it-works.test.js` (`teachersCs` files),
`i18n.test.js` (runs itself), new `cs-quest-catalogue.test.js`, per-game unit tests, `seeds.spec.js`, `games-fit`.

---

## 6. Risks and open questions

**Risks**
1. **Scope.** Four games (~70 + ~40 + ~47 + ~35 levels), 536 quiz items, 46 lesson plans, two platform changes with
   SDK/docs/test surface. Mitigation: ship by unit (§7); each unit is useful alone; Core 10 first.
2. **`BRB.params` is the linchpin of "press start".** Without it every lesson needs a kid-facing chapter pick; the
   fallback is designed, but the promise weakens. It touches token signing, `init`, the frozen SDK, `play.js`, docs,
   tests. Keep it to one string and four keys.
3. **Warm-up timing.** A live quiz in minutes 4-9 assumes 80% of a class is logged in and joined within four minutes;
   grades 3-4 in September will not be. The plan's honest alternative (hands-up on the projected items) must be a real
   button on the plan page (*Show questions on the projector*), not a footnote.
4. **Exit-ticket quiz steps depend on `LIVE_HOMEWORK`**, which is off by default and legal-review-adjacent. Decision
   needed: default it on for schools, or ship CS Quest exit tickets live/paper only (then *Checked* in the standards
   view comes only from live runs).
5. **Capstone budget.** Without a school plan the whole site's Builder can drop to the mock during one class period.
   The program page must say "unit 7 needs a school plan" in plain words, and lesson 7.2 is written to degrade to
   paper. Also one build runner → staggered starts are mandatory, not optional.
6. **Level codes** can encode a crude wall shape (8×8); no text, no server, teacher previews before projecting.
   Accepted for 6-8 only; tier-2 gallery adds moderation.
7. **"Host live" from a lesson step is broken for built-in modes** today (gotcha 1); the warm-up step relies on the
   `mode=` fix. Small but blocking.
8. **Audit and scanner surprises** in content-heavy games: tables, long block labels and 13-language strings
   overflow at 390×844; packet "addresses", cipher text and RGB numbers can trip `contact_info`/phone rules. Budget a
   fit-audit pass per chapter and a scanner run per content commit (the seed aborts on a fail).
9. **Authoring quality.** 536 items and 46 plans written by engineers read like engineers. Plan a teacher review
   pass (two classroom teachers, one per band) before the public page claims standards coverage.
10. **Session limits.** Student sessions end after 1 h idle / 10 h; multi-day capstones mean re-login with cards; the
    plan says so. A deploy during a period ends live sessions: publish a "no deploys 8-3 local" habit.
11. **Standards view interpretation.** Principals may read *Practiced 26/26* as mastery; the legend and the honest
    column names are the mitigation, plus no per-student export beyond the teacher CSV.

**Open questions**
1. Band toggle vs separate lessons: one lesson row per band (this design) doubles the library entries for a K-8
   specialist. Alternative: one lesson with a band field and band-specific steps hidden per class grade. Needs a
   schema the lessons service does not have; deferred.
2. Should the warm-up be its own game step (gradebook cell, needs the mode fix) or just a button with no binding
   (simpler, no evidence)? This design binds it; confirm with teachers that a "Warm-up" column is wanted.
3. `LIVE_HOMEWORK` default (risk 4).
4. Pair mode and accounts: in pairs on one device only the signed-in kid gets progress. Acceptable for 3-5 (the
   gradebook is for the class, not grading) but say it on the plan page; or alternate who signs in.
5. Should Robo Route also ship a *no-grid* "events and variables" sandbox for 1B-AP-10's event clause, or is the
   grid's `when` block enough? This design says enough; a CS teacher reviewer should confirm.
6. Which Studio template best suits the 1B capstone (*Quiz Show* is safe; *Catch*/*Runner* show loops and variables
   better)? Pilot both.
7. Do we want `games.standards` on the public game page (helps teachers searching by code; adds a field to every seed
   JSON path)?
8. Is a `computing` bank subject (solo practice in Quest Race/Brain Board) worth the 13-language cost later? Not in v1.

---

## 7. Build order (so a teacher can use something early)

1. **Platform slice** (unblocks everything): `BRB.params` + `lesson_steps.options`; `lesson_steps.standards` +
   `csta.js`; keep `cat` through snapshot/save; "Host live" `mode=` fix; `/live` starter preselect; `copyLesson` keeps
   quiz steps; `lessons.template_key/version`; `lesson_steps.template`. Tests and docs with each.
2. **Robo Route chapters 1-3 + lessons 1.1-1.3 (both bands) + their sets + the catalogue/materialiser + plan page +
   print.** This is a usable "CS Ed Week" minus units 2 and 4. Fit audit, cover, scanner, seed lists.
3. Robo Route 4-8, unit 2; **Packet Post**, unit 4 → the full CS Ed Week path.
4. **Data Detective**, unit 3; **Inside the Machine**, unit 5.
5. WYR `tech`/`online` topics, unit 6 (cheap: data + lesson pages).
6. Unit 7 capstone pages + the template change; school-plan messaging.
7. Standards tab + CSV; public `/teachers/cs-quest` with screenshots; `/learn/computer-science`; teacher review
   pass; (phase 2) `brb:progress`, class level gallery.

---

## Appendix A — Catalogue JSON (one lesson)

```json
{
  "key": "csq-1b-1.2", "version": 1, "band": "1b", "unit": 1, "n": 2,
  "title": "Again and again (Loops)", "subject": "Computer science", "grade": "Grades 3-5", "minutes": 45,
  "summary": "Students spot repeating steps and replace them with a repeat block in Robo Route.",
  "objectives": ["Spot steps that repeat and use a repeat block", "Say how many times a loop runs"],
  "standards": { "primary": ["1B-AP-10"], "also": ["1B-AP-16"] },
  "vocabulary": ["loop", "repeat", "times", "pattern"],
  "materials": ["projector", "1 device per pair", "Loop Cards printable"],
  "doNow": "Write something you do again and again at school. How many times a day?",
  "script": { "say": ["..."], "do": ["..."], "ask": ["..."], "bigIdea": "A loop repeats steps so we do not have to write them again." },
  "lookFors": ["repeat block placed after the steps instead of around them"],
  "steps": [
    { "kind": "text", "title": "Do Now", "minutes": 4, "body": "..." },
    { "kind": "game", "title": "Warm-up (live)", "minutes": 5, "gameSlug": "question-battle", "set": "warmup" },
    { "kind": "text", "title": "Explore: the corridor", "minutes": 7, "body": "..." },
    { "kind": "game", "title": "Play: Loops", "minutes": 18, "gameSlug": "robo-route",
      "options": "chapter=loops&band=1b", "standards": ["1B-AP-10"], "body": "Goal: 4 levels. Stretch: the chapter, then 3 stars." },
    { "kind": "text", "title": "Discuss", "minutes": 6, "body": "..." },
    { "kind": "quiz", "title": "Exit ticket", "minutes": 3, "set": "exit" },
    { "kind": "question", "title": "In your own words", "minutes": 2, "body": "What does a loop do and why do programmers like them?" }
  ],
  "sets": {
    "warmup": { "title": "CSQ 1.2 warm-up · Loops (3-5)", "secs": 15, "items": [{ "q": "...", "choices": ["...", "..."], "answer": 0, "cat": "1B-AP-10" }] },
    "exit":   { "title": "CSQ 1.2 exit ticket (3-5)", "secs": 20, "items": [ "..." ] }
  },
  "differentiation": { "support": "...", "stretch": "..." },
  "unplugged": { "title": "Loop Cards", "minutes": 15, "steps": ["..."], "printables": ["loop-cards.html"] },
  "notes": ["The number on a loop is how many times the whole bracket runs, not the number of squares."],
  "subPlan": ["Do Now on paper", "Play chapter Loops in pairs", "Paper exit ticket"],
  "answerKey": { "exit": ["a", "c", "b"], "sentence": "Repeats steps; saves writing the same thing many times." }
}
```

Unit review sets live in `sets/unit-<n>-<band>.json`; dilemmas in the WYR data files; printables are small HTML
fragments rendered into the print view (no images, kit-free, black on white).

## Appendix B — Printables (one set per lesson, generated from the catalogue)

Plan (2 pages) · projector script card · unplugged twin cards (grid mats, arrow/loop/if cards, bug cards, tally
sheets, envelope-relay picture, lock-sort cards, cipher wheel, parts/role cards, help-desk tickets, binary cards and
pixel grids, invention timeline cards, accessibility audit sheet, licence badge cards, planning sheet, etiquette card,
test table, 2-stars-and-a-wish, playtest tally, rubric) · exit ticket half-sheets (2 per page) · answer key · the
class login-card reminder (links to `/cards/:k`).

## Appendix C — Platform changes consolidated (all small, listed once)

| Change | Where | Why |
|---|---|---|
| `BRB.params` (4 allow-listed keys, packed `o` ≤ 40 in the token, `init.params`, frozen SDK object) | `routes/games.js /play + /frame`, `brb-sdk.js`, `docs/sdk.md`, tests | open the game at the right chapter/band/mode |
| `lesson_steps.options TEXT` | `db.js`, `lessons.js cleanStep`, `routes/progress.js:254` | the Play link carries the params |
| `lesson_steps.standards TEXT`, `server/standards/csta.js` | `db.js`, `lessons.js` | standards view |
| keep `cat` through quiz snapshots and run saves | `lessons.js:234`, `classlive-results.js:80` | per-item standard accuracy |
| "Host live" emits `mode=` for built-in modes | `routes/progress.js:286` via `liveGameOf` | the bound warm-up step |
| `/live` preselect `?starter=` (bank/wyr ids) | `routes/live.js:166-171`, `views/live.js` | deterministic WYR topics from a lesson button |
| WYR topics `tech`, `online` | data files, `ui.json`, `wyr.js`, `wyr-bank.js`, pack rebuild | unit 6 |
| `lessons.template_key/template_version` | `db.js`, `lessons.js` | "from CS Quest" banner, updates |
| `copyLesson` copies `set_id/items` of quiz steps | `lessons.js:191` | colleagues' copies keep exit tickets |
| `lesson_steps.template` for build steps | `db.js`, `routes/progress.js:307` | capstone starts from Quiz Show |
| Standards class tab + CSV + 13-language keys | `routes/schools.js CLASS_TABS`, new route, `schools.css` | §4.3 |
| Lesson print view (`.printdoc` + `/js/print.js`) | new plan-page route | printable plans |
| `LIVE_HOMEWORK` decision | `config.js:228` | exit-ticket quiz steps |
| (phase 2) `brb:progress`; `BRB.classShare` level gallery | SDK, `play.js`, routes, tables | per-level evidence; shared levels without typing |
