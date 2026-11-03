# CS Quest — program design, STANDARDS-FIRST angle

Designer angle: airtight CSTA coverage and evidence. Every 1B (grades 3-5) and level 2 (grades 6-8) standard in
`csta.json` (21 + 23 = 44 ids) is the *primary* standard of at least one 45-minute lesson, is practised by a named game
level or activity, is checked by at least one auto-marked exit-ticket item that carries the id, and (where the standard is
about making things) is scored by a capstone rubric line that carries the id. A principal or district gets a coverage map
generated from the same catalogue data the lessons are built from, and a unit test keeps the map honest.

Ground truth: `map-games.md` (how official games are built/shipped), `map-teach.md` (lessons, classes, live, teacher
pages, progress), `csta.json` (ids, statements, practices). Nothing here re-derives those; where this design needs
something the platform does not have, it says so in §4.4 and §6 and names the smallest change.

Vocabulary used below:
- **Band 1B** = grades 3-5 variant, **band 2** = grades 6-8 variant. Every lesson exists in both bands unless marked.
- **Primary standard** = the lesson/level/item is evidence for it. **Builds toward** = practised, not claimed.
- **Evidence tiers**: *Practised* (a tagged game/text step was done), *Checked* (accuracy on tagged exit-ticket items),
  *Applied* (teacher rubric marks on a build/question step). The standards view (§4.2) shows all three per standard.
- CSTA practices P1-P7 as numbered in `csta.json` (`practiceCodes`).

---------------------------------------------------------------------------------------------------------------------------

## 1. Name and branding check

**Keep "CS Quest".** It fits the house pattern of two short words with a concrete noun ("Quest Race", "Atlas Quest",
"Code Isle", "Sum Racer", "Brain Board"), and "CS" is the term US teachers, districts and CSTA itself use
("CS for All", "CSEdWeek", "CSTA standards"), so the public page ranks for the words teachers type. Alternatives
rejected: "Code Quest" (coding is one of five concepts; the data, networks, systems and impacts units are half the
program), "Byte Quest"/"Bit Quest" (cute, hides the subject from search and from a principal reading a lesson title),
"Computer Science Quest" (too long for lesson titles: `lessons.title` is 100 chars and titles carry a unit/lesson code).

How the name is used:
- Program slug `cs-quest` everywhere: `/teachers/cs-quest` (public), `/teach/cs-quest` (signed-in), catalogue folder
  `seed-lessons/cs-quest/`, lesson title prefix `CS Quest 1B.3` / `CS Quest 2.3`, library folder "CS Quest (Grades 3-5)" /
  "CS Quest (Grades 6-8)", class unit names "CS Quest: Algorithms & Programming" (unit name limit 60: longest is
  "CS Quest: Networks, Internet & Security" = 39).
- Subtitle on the public page: "Computer science for grades 3-8, mapped to the CSTA standards" (English-first copy under
  `teachers.cs.*`, rendered with `el()`).
- Kids never see "CS Quest" as a brand inside games; they see the four game titles. Game titles follow the same pattern:
  **Robo Route**, **Data Detective**, **Packet Post**, **Inside the Machine** (slugs `robo-route`, `data-detective`,
  `packet-post`, `inside-the-machine`; none collide with `SEED_GAMES`). `tests/unit/brand.test.js` only forbids old brand
  names, so none of these need a brand exception.
- JSON `cover` fallbacks (must be in `COVERS`): robo-route `mint`, data-detective `ocean`, packet-post `gold`,
  inside-the-machine `night`; real covers come from `covers.js` recipes (§3, each game lists its `cover()` hook).
- A sixth `/learn` hub `computer-science-games` (HUBS entry key `cs`, emoji 💻) lists the four games once they are seed
  games, with `LEARNING` entries (`teaches: ['Algorithms', 'Loops', 'Debugging', ...]`, `level: 'Grades 3-8'`).

---------------------------------------------------------------------------------------------------------------------------

## 2. Scope & sequence

### 2.1 Shape of the program

Seven units, 27 lessons per band, 45 minutes each (≈20 h per band). Runs as a semester at 1-2 lessons a week or as a
six-week daily block. Units 1-6 are independent after unit 1 (a teacher who only has four weeks can run U1 + U2 + one
concept unit + the capstone); the capstone needs U1 and U2.

| Unit | Title (class unit name) | Game / tool | Lessons | 1B primary ids | Level 2 primary ids |
|---|---|---|---|---|---|
| U1 | Algorithms & Programming | Robo Route ch 1-6 | 6 | AP-09, AP-10, AP-11 | AP-10, AP-11, AP-12, AP-13, AP-14 |
| U2 | Debugging & Program Development | Robo Route ch 7-9 | 3 | AP-08, AP-12, AP-15, AP-16, AP-17 | AP-16, AP-17, AP-18, AP-19 |
| U3 | Data & Analysis | Data Detective | 3 | DA-06, DA-07 | DA-08, DA-09, IC-22 |
| U4 | Networks, Internet & Security | Packet Post | 4 | NI-04, NI-05 | NI-04, NI-05, NI-06, IC-23 |
| U5 | Computing Systems | Inside the Machine | 4 | CS-01, CS-02, CS-03 | CS-01, CS-02, CS-03, DA-07 |
| U6 | Impacts of Computing | WYR Tech Choices (Live), audits, Data Detective ch 4 | 3 | IC-18, IC-19, IC-21, AP-14 | IC-20, IC-21, IC-23, AP-16 |
| U7 | Builder Capstone | Oomba Studio | 4 | AP-11, AP-12, AP-13, AP-14, AP-15, AP-16, AP-17, IC-20 | AP-13, AP-15, AP-16, AP-17, AP-18, AP-19, DA-09, IC-22 |

Every 45-minute lesson has the same skeleton, so a teacher learns it once:

| Minutes | Block | Platform mechanism | Evidence |
|---|---|---|---|
| 0-5 | **Warm-up live set** (5 items, retrieval of the last lesson + today's vocabulary) | Oomba Live Quest Race or Question Battle with the lesson's warm-up set (`/live?mode=quest-race&set=<id>&class=<cid>`) | `live_run_scores.marks` (not used for mastery; shows up as *Practised*) |
| 5-30 | **Main activity** (game chapter, pair task or build) | lesson `game` step → `/play/<slug>?lesson&step` with the chapter param; or `build`/`text` steps | `step_progress` score + label; *Practised* |
| 30-38 | **Discussion / share-out** (prompts in the teacher notes; a `text` step holds the student prompt) | `text` step "Talk about it" (mark done) | — |
| 38-45 | **Exit ticket** (3 auto-marked items tagged with CSTA ids + 1 "explain" item) | `quiz` step (from the lesson's exit set) + `question` step | `step_progress.marks` per item → *Checked*; teacher review marks → *Applied* |

Without 1:1 devices the warm-up runs on the projector (hands up / mini whiteboards, teacher taps) and the exit ticket is the
printed version from the lesson's print page; the unplugged fallback for the main activity is in every lesson.

### 2.2 Practices spread (P1-P7 × units)

| Practice | U1 | U2 | U3 | U4 | U5 | U6 | U7 |
|---|---|---|---|---|---|---|---|
| P1 Inclusive computing culture | | | | | | 1B-IC-19, 1B-IC-20, 2-IC-21 | 1B-AP-13, 2-AP-15 |
| P2 Collaborating | | 1B-AP-16, 2-AP-18 | 2-IC-22 | | | | 1B-AP-16, 2-AP-15, 2-AP-18, 2-IC-22 |
| P3 Recognizing & defining problems | 1B-AP-11, 2-AP-13 | 1B-AP-08 | | 1B-NI-05 | 2-CS-01 | 1B-IC-18 | 1B-AP-11, 2-AP-13 |
| P4 Developing & using abstractions | 2-AP-10, 2-AP-14 | | 2-DA-09 | 1B-NI-04, 2-NI-04, 2-NI-06 | 1B-CS-02, 2-DA-07 | | 2-AP-16 |
| P5 Creating computational artifacts | 1B-AP-09, 1B-AP-10, 2-AP-11, 2-AP-12 | 1B-AP-12 | 2-DA-09, 2-IC-22 | | 2-CS-02 | 1B-AP-14 | 1B-AP-12, 1B-AP-13, 1B-AP-14, 2-AP-16 |
| P6 Testing & refining | | 1B-AP-08, 1B-AP-15, 2-AP-17 | 2-DA-08 | | 1B-CS-03, 2-CS-03 | | 1B-AP-15, 2-AP-17 |
| P7 Communicating about computing | | 1B-AP-17, 2-AP-19 | 1B-DA-06, 1B-DA-07 | 2-NI-05, 2-IC-23 | 1B-CS-01 | 1B-IC-21, 2-IC-20, 2-IC-23 | 1B-AP-17, 2-AP-19 |

Every practice appears in at least three units; P5 and P7 appear in five.

### 2.3 Lesson plans

Format per lesson: **Title** · ids (1B / 2) · practices · I can · vocabulary · materials · plan (minute by minute; band
differences inline as "1B:" / "2:") · differentiation · unplugged fallback · teacher notes · exit ticket (item count, ids;
samples in §3.6). Student-facing text lives in lesson steps (plain text, ≤4000 chars, no links); teacher notes, answer
keys and printables live in the catalogue JSON and the print page (§5.3), never in steps, because students see steps.

#### Unit 1 — Algorithms & Programming (Robo Route)

**1.1 Robot, Step by Step (sequences and plans)**
- ids: 1B: **1B-AP-10** (sequences) · 2: **2-AP-10** (flowchart/pseudocode plan before coding), 2-AP-12 (builds toward)
- practices: P5.2 (1B); P4.1, P4.4 (2)
- I can: 1B "put instructions in order so the robot reaches the goal"; 2 "write a plan as a flowchart or pseudocode, then
  turn it into a program that works".
- vocabulary: algorithm, program, sequence, command, bug (1B); + pseudocode, flowchart, input/output (2)
- materials: 1 device per student or pair (tablet first), projector; 2: the printed "Plan card" (flowchart boxes) from the
  print page or mini whiteboards.
- plan: 0-5 warm-up set U1-W1 (what is an algorithm; order matters). 5-10 teacher demo of Robo Route ch 1 level 1 on the
  projector: tap a block, tap a slot, Run, watch the robot. 10-30 main: 1B: Robo Route ch 1 "Sequences" levels 1-6 (walk,
  turn, pick up a gem, avoid a wall; par = fewest blocks). 2: levels 1-4 after filling a Plan card for level 3 and 4 first
  (the game's band-2 ch 1 shows a "Plan it" card: order 5 flowchart boxes before the palette unlocks; levels 5-6 are
  "complex": two gems, a door, limited blocks). 30-38 discussion: "Two people wrote different programs that both
  work: are both right? Which is better and why?" (seeds 1B-AP-08 in U2). 38-45 exit ticket (3 items + explain).
- differentiation: 1B pairs for levels 1-2 (driver/navigator swap each level); extension = ch 1 bonus level "no left turns".
  2 support: Plan card pre-filled with 3 of 5 boxes; extension = write pseudocode for a classmate's level before playing it.
- unplugged: "Human robot": one student is the robot, one reads commands from arrow cards across floor tiles.
- teacher notes: set the chapter lock in the lesson step (param `ch.seq.band.1B`, §3.1.9) so the gradebook cell is ch 1
  only; a kid who finishes early stays in ch 1 bonus levels, not ch 2. Common misconception: "turn" moves the robot.
- exit ticket: 3 auto items tagged 1B-AP-10 (1B) / 2-AP-10, 2-AP-12 (2) + explain "Why does the order of commands matter?"

**1.2 Round and Round (loops)**
- ids: 1B: **1B-AP-10** (loops) · 2: **2-AP-12** (nested loops)
- practices: P5.2 (1B); P5.1, P5.2 (2)
- I can: 1B "use a repeat block instead of writing the same commands again"; 2 "use a loop inside a loop and say how many
  times the inside runs".
- vocabulary: loop, repeat, pattern (1B); + nested loop, iteration, repeat-until (2)
- materials: devices; projector.
- plan: 0-5 warm-up U1-W2 (spot the repeated pattern). 5-8 demo: a level solved with 12 blocks, then with 4 blocks and a
  repeat; the block budget turns red when over par. 8-30 main: 1B ch 2 levels 1-6 (repeat 3 {forward}, repeat 4 {forward,
  turn right} to draw a square path, loop with a gem pickup inside). 2 ch 2 levels 1-6 incl. 4-6 nested: a 3×3 gem field
  (`repeat 3 { repeat 3 { forward; pick } ; turn ... }`), "repeat until at goal". 30-38 discussion: "How many steps did the
  robot take in level 5? Count without running." (iteration counting). 38-45 exit ticket.
- differentiation: 1B support: the game's hint tier 2 highlights the repeated chunk; extension: get par on all levels (3
  stars). 2 support: the game shows the inner-loop count live; extension: bonus level with three nested loops.
- unplugged: clap patterns: "repeat 4 (clap clap stomp)" written on the board vs. the long form; students count.
- teacher notes: 1B stars matter: par pushes toward loops; a student who solves everything without a loop still passes the
  level but gets 1 star, so look at the stars column, not only "done". 2: nested loop counts are the exit-ticket item.
- exit ticket: 3 items tagged 1B-AP-10 / 2-AP-12 (one "how many times" item) + explain.

**1.3 If This, Then That (conditionals)**
- ids: 1B: **1B-AP-10** (conditionals) · 2: **2-AP-12** (compound conditionals AND / OR / NOT; if-else)
- practices: P5.2; (2) P5.1
- I can: 1B "make the robot choose what to do depending on what it sees"; 2 "combine conditions with AND, OR and NOT".
- vocabulary: condition, if, true/false, sensor (1B); + else, AND, OR, NOT, compound condition, boolean (2)
- plan: 0-5 warm-up U1-W3. 5-8 demo: the "path ahead?" sensor block; show a level where the gem's position is random
  per run (the game seeds it per attempt, so the program must branch). 8-30 main: 1B ch 3 levels 1-6 (if gem here pick;
  if wall ahead turn; a loop with an if inside). 2 ch 3 levels 1-6 (if-else, "if gem AND door open", "if NOT wall", a
  key-and-door level mirroring the CSTA example: open the door only if holding a key AND touching the door). 30-38
  discussion: "Write a sentence from your day that has an AND condition and one with OR" (2) / "When does the robot's
  if-block do nothing?" (1B). 38-45 exit ticket.
- differentiation: 1B support: levels 1-3 only, with sensor icons; extension: level 7 "mystery maze" where the layout is
  hidden until run. 2 support: a truth-table card from the print page; extension: rewrite a level's solution with NOT only.
- unplugged: "Simon says if": teacher calls "if you have a sibling AND you like pizza, stand up".
- teacher notes: random levels are the point: a fixed sequence cannot solve them, which is how the game proves a
  conditional was needed (the verdict runs the program on 3 seeded layouts, §3.1.4).
- exit ticket: 3 items tagged 1B-AP-10 / 2-AP-12 (one truth-table item) + explain.

**1.4 When Something Happens (events)**
- ids: 1B: **1B-AP-10** (events) · 2: **2-AP-12** (events combined with conditionals and loops)
- practices: P5.2; (2) P5.1
- I can: 1B "make part of my program run only when something happens (a button is pressed, the robot bumps)"; 2 "use an
  event handler with a condition inside to control a looping program".
- vocabulary: event, trigger, handler, "when" block (1B); + event-driven, state (2)
- plan: 0-5 warm-up U1-W4. 5-8 demo: a level where the player taps a floor button during the run: "when button pressed →
  open gate". 8-30 main: 1B ch 4 levels 1-5 (when bump → turn; when gem seen → pick; the kid taps on-screen buttons while
  the robot patrols). 2 ch 4 levels 1-5 (two handlers at once; a handler with if-else; a patrol loop interrupted by an
  event; a "water cycle" style info level: tap a part → the robot narrates, mirroring the CSTA clarification). 30-38
  discussion: "Name three events in a game you like and what each one triggers." 38-45 exit ticket.
- differentiation: 1B support: level 1-2 pairs; extension: make the robot react to two events. 2 extension: level 6
  "traffic" with three handlers.
- unplugged: "event cards": when the bell rings → line up; when the teacher claps → freeze; students sort cause/effect.
- teacher notes: this is the one chapter where the player acts during the run; it's tap-only, so it also works in a live
  frame (no typing). Band 2 has no separate events standard; evidence counts toward 2-AP-12 (control structures combined).
- exit ticket: 3 items tagged 1B-AP-10 / 2-AP-12 + explain.

**1.5 Keeping Count (variables)**
- ids: 1B: **1B-AP-09** · 2: **2-AP-11**
- practices: P5.2; (2) P5.1, P5.2
- I can: 1B "use a variable to store and change a number in my program"; 2 "name variables clearly, tell a number from a
  true/false value, and do operations on them".
- vocabulary: variable, value, set, change, counter, score (1B); + data type, number, boolean, text, naming convention,
  expression (2)
- plan: 0-5 warm-up U1-W5. 5-8 demo: the gem counter: "set gems to 0; when pick → change gems by 1; if gems = 3 → open
  gate". 8-30 main: 1B ch 5 levels 1-5 (counter, countdown timer of battery, score display block, lives lost on bump).
  2 ch 5 levels 1-6: rename the variables (the palette offers `x`, `thing`, `gemsCollected`, `doorOpen`; the verdict
  requires the clear names: level "name it right"), a boolean `hasKey` vs a number `gems`, an expression `energy - 2`,
  a text variable shown in the robot's speech bubble (`"Gems: " + gems`). 30-38 discussion: "What would break if two
  variables were both called x?" 38-45 exit ticket.
- differentiation: 1B support: the counter display is always visible; extension: level 6 "battery budget". 2 support: a
  data-type sort card; extension: write the expression for a level before running.
- unplugged: a student holds a "score" card and a marker; classmates call events; the card is updated. Then two cards with
  the same name: confusion is the lesson.
- teacher notes: naming is checked by the game in band 2 (the verdict rejects single-letter names in the "name it right"
  levels and tells why), so the gradebook stars evidence 2-AP-11 directly.
- exit ticket: 3 items tagged 1B-AP-09 / 2-AP-11 (one "which name is clearest" item) + explain.

**1.6 Break It Down (decomposition and functions)**
- ids: 1B: **1B-AP-11** (decompose) · 2: **2-AP-14** (procedures with parameters), **2-AP-13** (decompose)
- practices: P3.2; (2) P4.1, P4.3, P3.2
- I can: 1B "break a big route into named parts and solve one part at a time"; 2 "write a procedure with a parameter and
  call it with different values".
- vocabulary: subproblem, part, chunk, name (1B); + procedure/function, parameter, argument, call, reuse (2)
- plan: 0-5 warm-up U1-W6. 5-10 demo: a long route; the teacher circles three repeating shapes on the projector and names
  them ("zigzag", "climb"). 10-30 main: 1B ch 6 levels 1-5: "chunks": define a named block from selected commands, call
  it; a level that can only fit on screen with chunks (block budget 8). 2 ch 6 levels 1-6: `walk(n)`, `square(size)`,
  `collectRow(count)`; a level where three staircase sizes must be drawn with one procedure; a decomposition level that
  shows the goal as 3 subgoals first (2-AP-13). 30-38 discussion: "What did you name your chunk and why? Would a classmate
  understand it?" 38-45 exit ticket.
- differentiation: 1B support: pre-made chunk names; extension: a chunk that uses a loop. 2 extension: a procedure that
  calls another procedure.
- unplugged: "make a sandwich" decomposed into steps and sub-steps on sticky notes; group the notes into named parts.
- teacher notes: the decomposition evidence at 1B is the chunk list the kid made (the game stores the names in the save;
  the label reports `chunks:n`); at band 2 the exit ticket asks which parameter value produces a given output.
- exit ticket: 3 items tagged 1B-AP-11 / 2-AP-14, 2-AP-13 + explain.

#### Unit 2 — Debugging & Program Development (Robo Route)

**2.1 Bug Hunt (test and debug)**
- ids: 1B: **1B-AP-15** · 2: **2-AP-17** (systematic testing with a range of cases), 1B/2 builds toward P6
- practices: P6.1, P6.2; (2) P6.1
- I can: 1B "find and fix the mistake in a program, mine or someone else's"; 2 "test a program with several cases and fix
  it until all of them pass".
- vocabulary: bug, debug, expected vs actual, step through (1B); + test case, edge case, pass/fail, regression (2)
- plan: 0-5 warm-up U2-W1. 5-10 demo: Robo Route **Debug mode**: a level opens with a program already written and a
  "what should happen" card; Step button runs one block at a time with the current block highlighted and the robot's
  sensor values shown. 10-30 main: 1B ch 7 levels 1-6 (off-by-one loop, wrong turn, missing pick, a conditional that
  checks the wrong sensor, a bug in a "classmate's" program). 2 ch 7 levels 1-6: each level has 3 test maps; the program
  must pass all three (the verdict panel shows ✓/✗ per map); an edge case (gem at the start cell), a program that passes
  2 of 3. 30-38 discussion: "Which test map found the bug? Could you have found it without running?" 38-45 exit ticket.
- differentiation: 1B support: hint tier 2 highlights the first block whose effect differs from expected; extension:
  write a bug for a partner (level maker preview). 2 extension: design a 4th test map that would break the given fix.
- unplugged: a recipe with a wrong step; students find it by "running" it on paper.
- teacher notes: debug levels are seeded so expected outcomes are fixed; the score label includes `fixed:n`.
- exit ticket: 3 items tagged 1B-AP-15 / 2-AP-17 (a "which test case catches it" item) + explain.

**2.2 Best Route (compare, refine, explain)**
- ids: 1B: **1B-AP-08** (compare/refine algorithms), **1B-AP-17** (describe choices) · 2: **2-AP-17** (refine using
  tests), **2-AP-19** (document programs); 1B-AP-08 content also practised at 2 (builds toward)
- practices: P3.3, P6.3, P7.2; (2) P6.1, P7.2
- I can: 1B "compare two programs that both work and say which is better for the job"; 2 "add notes to my program so a
  classmate can follow and test it".
- vocabulary: efficient, shortest, fewest blocks, trade-off (1B); + comment/note, documentation, readability (2)
- plan: 0-5 warm-up U2-W2. 5-10 demo: **Optimisation stars**: a level shows two given solutions A and B side by side
  (A: 14 blocks, B: 6 blocks with a loop, but B fails if the gem moves); pick one and refine it. 10-30 main: 1B ch 8
  levels 1-5 (fewest blocks, fewest steps, least battery, "easiest to change for a bigger grid"). 2 ch 8 levels 1-5 + the
  **note block** (a comment attached to a chunk; the verdict in "document it" levels requires a note on every procedure,
  checked for length only, and the exit explain asks them to paste theirs). 30-38 share-out: two students show their
  routes on the projector and explain one choice each (1B-AP-17 demonstration). 38-45 exit ticket.
- differentiation: 1B support: compare only "fewest blocks"; extension: a level with three criteria that conflict.
  2 extension: refactor a classmate's level solution and note what changed.
- unplugged: two routes to the cafeteria on the school map: shortest vs. no stairs. "Most appropriate" depends on the
  user (bridge to U6 accessibility).
- teacher notes: the "explain" question step is the 1B-AP-17 / 2-AP-19 evidence; mark it 0-2 with the rubric line in the
  print page (0 none, 1 names a choice, 2 names a choice and a reason that refers to the task).
- exit ticket: 3 items tagged 1B-AP-08 / 2-AP-17, 2-AP-19 + explain (1B-AP-17 / 2-AP-19).

**2.3 Level Maker (remix, roles, credit)**
- ids: 1B: **1B-AP-16** (varying roles), **1B-AP-12** (modify/remix) · 2: **2-AP-18** (distribute tasks, timeline),
  **2-AP-16** (incorporate existing work + attribution)
- practices: P2.2, P5.3; (2) P2.2, P4.2, P5.2, P7.3
- I can: 1B "take turns as designer, builder and tester; remix a classmate's level and say whose it was"; 2 "split a
  level-making job across a team with a timeline, build on another team's level and credit them".
- vocabulary: remix, credit/attribution, role, tester, designer (1B); + timeline, task list, version (2)
- plan: 0-5 warm-up U2-W3. 5-10 demo: Robo Route ch 9 **Level Maker**: paint tiles, place robot/goal/gems/doors, set the
  palette and par, press Check (the game solves it with its own search to confirm it is solvable, §3.1.6), get a 6-digit
  share code. 10-30 main, in pairs (1B) or threes (2) with printed role cards: Designer sketches, Builder paints, Tester
  solves and reports; swap after each level (1B: roles swap every 6 min, timer on the projector). Then **remix**: enter a
  classmate's code, change one rule, keep the "based on code 123456" credit line the game adds automatically (the credit
  is the code, never a name). 2 teams also fill the mini timeline card (who does what by minute 15/25) and tick it.
  30-38 share: play two class levels on the projector. 38-45 exit ticket.
- differentiation: support: a half-made level template; extension: a level that needs a specific concept (the maker can
  require "must use a loop" by setting the block budget).
- unplugged: design a maze on grid paper, swap, solve, remix with one change, write "based on ___'s maze".
- teacher notes: share codes are digits (6, under the 7-digit phone rule) typed inside the game only; nothing a kid types
  reaches another kid (level data travels as a code the game decodes locally, §3.1.6). A class-wide level shelf needs the
  platform addition in §6. Attribution is enforced by the game, which is the 1B-AP-14/2-AP-16 attribution habit later used
  in the capstone.
- exit ticket: 3 items tagged 1B-AP-16, 1B-AP-12 / 2-AP-18, 2-AP-16 + explain.

#### Unit 3 — Data & Analysis (Data Detective)

**3.1 Sort It Out (organise, chart, claim)**
- ids: 1B: **1B-DA-06** · 2: **2-DA-08** (collect with computational tools, transform/clean), 1B-DA-06 (builds toward)
- practices: P7.1; (2) P6.3
- I can: 1B "sort and chart data so it shows a pattern and backs up a claim"; 2 "clean a messy data set and transform it
  so the pattern is clear".
- vocabulary: data, table, sort, group, bar chart, claim, evidence (1B); + clean, duplicate, outlier, typo, percentage,
  transform (2)
- plan: 0-5 warm-up U3-W1. 5-10 demo: Data Detective ch 1 "The Missing Lunch": a table of 20 rows; sort by column; group;
  switch to bars; pick the claim the chart supports. 10-30 main: 1B ch 1 levels 1-5 (sort, group, chart, choose the claim,
  choose the chart that best shows it; sports-team and weather sets as in the CSTA clarification). 2 ch 1 levels 1-6 with
  a **Clean** step first (find 3 duplicates, 2 typos "Blu"/"Blue", one impossible value), then percentages-of-whole
  (count → %) to compare unequal groups. 30-38 discussion: "Same data, two charts, two claims: can both be true?"
  38-45 exit ticket.
- differentiation: support: 10-row sets; extension: level 6 "trick chart" (axis not at zero).
- unplugged: index cards with class pets/shoe types; sort physically; make a human bar chart.
- teacher notes: band 2 data sets have deliberate errors listed in the answer key; the game marks a level done only when
  the cleaned set matches.
- exit ticket: 3 items tagged 1B-DA-06 / 2-DA-08 + explain.

**3.2 Predict It (cause and effect, models)**
- ids: 1B: **1B-DA-07** · 2: **2-DA-09** (refine a computational model from data), 1B-DA-07 (builds toward)
- practices: P7.1; (2) P4.4, P5.3
- I can: 1B "use data to predict what happens next and explain cause and effect"; 2 "change a model until its
  predictions match the data, and say which data mattered".
- vocabulary: predict, pattern, cause, effect, enough data (1B); + model, simulation, parameter, prediction error,
  relevant/irrelevant data (2)
- plan: 0-5 warm-up U3-W2. 5-10 demo: ch 2 "Robot Race": a robot runs for 2, 4, 6 seconds; distance table; predict 8 s
  (CSTA's own example). 10-30 main: 1B ch 2 levels 1-5 (predict from a table, pick the cause, spot the irrelevant column
  (day of week), "is 2 tries enough?" level that asks for more trials before allowing a prediction). 2 ch 2 **Model Lab**
  levels 1-5: a plant-growth / ball-roll simulation with sliders (speed, friction, start height); run, compare predicted
  vs measured dots, adjust, repeat until error < threshold; a level where a new batch of data arrives and the model must
  be refined again; one level where a parameter is irrelevant (changing it does nothing). 30-38 discussion: "What
  changed your mind about the model?" 38-45 exit ticket.
- differentiation: support: two-parameter models; extension: level 6 with noisy data.
- unplugged: roll a toy car down a ramp at 3 heights, measure, predict the 4th.
- teacher notes: Model Lab scores on final error and refinements made (label `err:12 ref:3`), so "refined based on data"
  is in the gradebook, not just "done".
- exit ticket: 3 items tagged 1B-DA-07 / 2-DA-09 + explain.

**3.3 Survey Squad (collect class data, analyse it)**
- ids: 1B: **1B-DA-06**, **1B-DA-07** (applied to the class's own data) · 2: **2-DA-08**, **2-IC-22** (collaborate via a
  survey of many contributors)
- practices: P7.1; (2) P6.3, P2.4, P5.2
- I can: "collect data from the whole class with a computer tool, put it into a chart and make a claim we can check".
- vocabulary: survey, sample, tally, respondent (1B); + crowdsourcing, response rate, bias (2)
- plan: 0-5 warm-up U3-W3. 5-15 **collect**: the teacher hosts Would You Rather (Live) with the "tech" topic, 8 items,
  20 s (`wyr:tech:8:20`); every student votes; the results page shows counts per option. 15-30 **analyse**: Data
  Detective ch 3 "Our Class" levels: the student enters the class tallies with +/- steppers (numbers only), the game
  charts them, asks which claim the class data supports, and (2) asks whether 28 of 30 answering is enough and what a
  "silly answer" row does to the result (clean it). 30-38 discussion: "Would the next class get the same result? What
  would change the answer?" 38-45 exit ticket.
- differentiation: support: the teacher reads tallies aloud; extension: compare with the built-in "another class" set.
- unplugged: hands-up tallies on the board; same analysis on paper.
- teacher notes: this is the one lesson that needs the projector and a live room; the fallback is a printed tally sheet.
  A dedicated survey mode for live sets (no right answer) is a small platform addition (§6); until then WYR Live is the
  computational collection tool and its results page is the data source.
- exit ticket: 3 items tagged 1B-DA-06, 1B-DA-07 / 2-DA-08, 2-IC-22 + explain.

#### Unit 4 — Networks, Internet & Security (Packet Post)

**4.1 Packets (break it down, send it, rebuild it)**
- ids: 1B: **1B-NI-04** · 2: **2-NI-04** (protocol basics: numbering and ordering) and 1B-NI-04 (builds toward)
- practices: P4.4
- I can: "model how a message is split into packets, sent through several devices and rebuilt in order".
- vocabulary: packet, network, router, destination, reassemble (1B); + protocol, header, sequence number, path (2)
- plan: 0-5 warm-up U4-W1. 5-10 demo: Packet Post ch 1 "Netville": a picture is cut into 6 numbered packets; tap routers
  to pass each one along; packets arrive out of order; put them back. 10-30 main: 1B ch 1 levels 1-6 (2 → 4 → 9 packets,
  two paths, a slow router, a message to two destinations). 2 ch 1 levels 1-6 (headers: to/from/number; a level with no
  numbers where reassembly fails, then numbers are "invented" by the class = the protocol). 30-38 discussion: "Why not
  send the whole picture in one piece?" 38-45 exit ticket.
- differentiation: support: 4-packet levels; extension: route 3 messages at once.
- unplugged: the class passes an envelope of 6 numbered puzzle pieces hand to hand along two rows; reassemble.
- teacher notes: nothing in the game shows real addresses, URLs or emails (scanner rules, §3.3.7); addresses are house
  numbers 1-99 and street colours.
- exit ticket: 3 items tagged 1B-NI-04 / 2-NI-04 + explain.

**4.2 Rules of the Road (protocols: lost, late, broken)**
- ids: 1B: **1B-NI-04** (transmission through multiple devices, deepened) · 2: **2-NI-04**
- practices: P4.4
- I can: 1B "explain what happens when a packet is lost and how the message still arrives"; 2 "model the rules (protocol)
  that detect missing or broken packets, resend them and pick the fastest path".
- vocabulary: lost packet, resend, path (1B); + acknowledgement (ACK), timeout, checksum, redundancy, fastest path (2)
- plan: 0-5 warm-up U4-W2. 5-10 demo: ch 2 "Lost Mail": a link drops packets; the receiver's ACK board shows which
  numbers are missing. 10-30 main: 1B ch 2 levels 1-5 (spot the missing number, ask for a resend, choose another path when
  a router is down). 2 ch 2 levels 1-6 (ACK/timeout rules you set with toggles, a parity/checksum level where one packet
  is corrupted, the "picture with missing pieces" rule from the CSTA clarification, choose the fastest of three paths
  with link speeds, a secure-lane level introducing encryption as a preview of 4.4). 30-38 discussion: "What rule did you
  add that made delivery reliable? What did it cost (time)?" 38-45 exit ticket.
- differentiation: support: the ACK board highlights gaps; extension: design the rule set with the fewest resends.
- unplugged: the envelope game again, but one student secretly keeps a piece; the class invents a rule to notice.
- teacher notes: 1B keeps 1B-NI-04 as primary (there is no 1B protocol standard); the lesson still matters for the
  spiral into level 2. The exit ticket for 1B asks about reassembly and multiple devices only.
- exit ticket: 3 items tagged 1B-NI-04 / 2-NI-04 + explain.

**4.3 Lock It Down (passphrases, phishing, physical and digital security)**
- ids: 1B: **1B-NI-05** · 2: **2-NI-05**, **2-IC-23** (public vs private trade-offs)
- practices: P3.1; (2) P7.2
- I can: 1B "explain real cybersecurity problems and how to protect my information"; 2 "explain how physical and digital
  measures protect information and weigh public vs private".
- vocabulary: passphrase, private information, phishing, backup (1B); + firewall, HTTPS/padlock, two-step verification,
  encryption, trade-off (2)
- plan: 0-5 warm-up U4-W3. 5-10 demo: Packet Post ch 3 "Lock It Down": the **passphrase builder** (tap word tiles to build
  a passphrase; a strength meter explains length beats symbols; the game never asks for a real password: tiles only,
  nothing typed) and the **phishing spotter** (a fake in-game message card; tap the tells: urgency, prize, asks for a
  passphrase, odd sender name, "click here" button; no URLs or email addresses are ever drawn). 10-30 main: 1B ch 3 levels
  1-6 (build a strong passphrase, spot 3 phishing tells, sort "share / don't share" items, back up Netville's photos, "a
  friend asks for your passphrase" scenario). 2 ch 3 levels 1-7 (sort measures into physical vs digital, lock a building
  (doors, hidden passwords, backups, wipe before reuse), a padlock-in-the-browser level, firewall rules for the Netville
  post office, and **Share or Shield**: six pieces of information with a benefit and a risk each; decide public/private and
  justify). 30-38 discussion: 1B "What is one thing you will change about your passwords?" 2 "When is making information
  public worth the risk?" 38-45 exit ticket.
- differentiation: support: fewer tells per card; extension: write a phishing-spotting checklist for younger students.
- unplugged: "lock sort" cards: physical vs digital measures; passphrase from three random words from a dice table.
- teacher notes: wording in the game and lesson steps must avoid "type your password" (scanner `personal_info`), so steps
  say "build a passphrase from tiles". No real brand names in phishing cards.
- exit ticket: 3 items tagged 1B-NI-05 / 2-NI-05, 2-IC-23 + explain.

**4.4 Secret Codes (ciphers)**
- ids: 1B: **1B-NI-05** (protecting information: how codes keep messages private; builds toward 2-NI-06) · 2: **2-NI-06**
- practices: P3.1; (2) P4.4
- I can: 1B "use a code wheel to hide and reveal a message and say why people encrypt"; 2 "encrypt and decrypt with
  several methods and compare how hard each is to break".
- vocabulary: code, key, encrypt/decrypt (1B); + cipher, Caesar shift, substitution, steganography, public key,
  frequency (2)
- plan: 0-5 warm-up U4-W4. 5-10 demo: ch 4 "Secret Codes": a Caesar wheel with +/- buttons and keyboard arrows; letters
  are tapped from an on-screen alphabet (tap-only). 10-30 main: 1B ch 4 levels 1-4 (shift-3 encode, decode, find the
  shift, send a secret packet through Netville that a snooping router cannot read). 2 ch 4 levels 1-7 (Caesar, keyword
  substitution, pigpen symbols, hide a message in a pixel picture's last bits (steganography), crack a Caesar with letter
  frequency bars, the **two-key lockbox** model of public-key encryption (lock with the public padlock, open with the
  private key), compare the methods on a "how hard to break" scale). 30-38 discussion: "Which method would you trust for
  a bank? Why not Caesar?" 38-45 exit ticket.
- differentiation: support: shift ≤ 5; extension: break a classmate's keyword cipher.
- unplugged: paper cipher wheels (print page) and a padlock-and-box demo with two real padlocks.
- teacher notes: 1B does not claim 2-NI-06; the 1B exit items stay on 1B-NI-05 (why encrypt, what to protect).
- exit ticket: 3 items tagged 1B-NI-05 / 2-NI-06 + explain.

#### Unit 5 — Computing Systems (Inside the Machine)

**5.1 Parts of the Machine (devices and how people use them)**
- ids: 1B: **1B-CS-01** · 2: **2-CS-01** (recommend design improvements from user analysis); 1B-CS-01 (builds toward)
- practices: P7.2; (2) P3.3
- I can: 1B "name the inside and outside parts of a device and describe how they work together"; 2 "watch how people
  use a device, find problems and recommend improvements".
- vocabulary: input, output, processor, memory, storage, sensor, battery, screen (1B); + interface, usability,
  accessibility, ergonomics, learnability, human-computer interaction (2)
- plan: 0-5 warm-up U5-W1. 5-10 demo: Inside the Machine ch 1: an exploded tablet/laptop/robot; tap a label, tap the
  part; "what happens when you press a key" trace (key → processor → screen) animated. 10-30 main: 1B ch 1 levels 1-6
  (label 3 devices, trace 3 actions, the robot-and-light-sensor dependency from the CSTA clarification, "which part is
  missing?"). 2 ch 1 **Design Lab** levels 1-5: short animated persona scenarios (a user who can't see small text, a
  user holding a baby with one hand, a 6-year-old, a user outdoors in sun); tap the moment the user struggles; choose two
  recommendations from a list and one free-sort of trade-offs (bigger buttons vs. fewer on screen); final level: design
  a controller layout for one persona on a grid. 30-38 discussion: 2 "Which recommendation helps everyone, not just that
  user?" 38-45 exit ticket.
- differentiation: support: 1B two devices; extension: label a game console. 2 extension: a persona of their own.
- unplugged: the class acts out a computer: input kid, processor kid, memory kid, output kid; pass a "key press" card.
- teacher notes: 1B exit explain asks for a sentence using two part names correctly (1B-CS-01 asks for terminology).
- exit ticket: 3 items tagged 1B-CS-01 / 2-CS-01 + explain.

**5.2 Hardware Meets Software (systems and gadgets)**
- ids: 1B: **1B-CS-02** · 2: **2-CS-02**
- practices: P4.4; (2) P5.1
- I can: 1B "show how hardware and software work together to do a task"; 2 "design a project that combines hardware and
  software parts to collect and exchange data, and explain my choices".
- vocabulary: hardware, software, app, instructions, task (1B); + component, sensor types, wireless vs wired, storage,
  cost/size/power trade-off (2)
- plan: 0-5 warm-up U5-W2. 5-10 demo: ch 2 "Make it Work": a task card ("take a photo and send it to Grandma"); drag/tap
  cards into Input → Process → Output → Storage lanes, with a software card per lane. 10-30 main: 1B ch 2 levels 1-5
  (model four everyday tasks; a level where a software card is missing and nothing happens; a level where a hardware
  card is missing). 2 ch 2 **Build-a-Gadget** levels 1-5: a brief (a lunchbox that reports its temperature to a phone; a
  plant that asks for water; a classroom noise meter), a parts bin with cost, size and power per part, a budget; choose
  sensors, processor, output, storage, connection (wired vs Bluetooth trade-off from the CSTA clarification); the game
  simulates data flowing and scores on meeting the brief under budget. 30-38 discussion: "What did you give up to stay
  under budget?" 38-45 exit ticket.
- differentiation: support: pre-placed processor; extension: 2: design for two briefs with one gadget.
- unplugged: 1B: draw the model on paper (the CSTA clarification allows this); 2: parts cards with prices, build on desk.
- teacher notes: 2-CS-02 says "design projects"; the gadget design card (print page) is the artifact; the game score is
  the brief-met evidence.
- exit ticket: 3 items tagged 1B-CS-02 / 2-CS-02 + explain.

**5.3 Help Desk (troubleshooting)**
- ids: 1B: **1B-CS-03** · 2: **2-CS-03**; 2: 2-AP-10 (builds toward: following a flowchart)
- practices: P6.2
- I can: 1B "pick sensible fixes for common device problems"; 2 "follow a systematic checklist to find and fix a problem in
  a system of connected devices".
- vocabulary: restart, charge, connection, volume, caps lock, update (1B); + checklist, isolate, swap a component,
  reproduce, settings (2)
- plan: 0-5 warm-up U5-W3. 5-10 demo: ch 3 "Help Desk": tickets arrive ("no sound", "won't turn on", "app froze", "wifi
  gone", "password not working" (caps lock)); choose steps in a sensible order; each step costs time; the fix is found
  when the right step is reached. 10-30 main: 1B ch 3 levels 1-6 (one ticket each; the CSTA list of problems). 2 ch 3
  levels 1-6: multi-device cases (printer + laptop + router): follow the troubleshooting flowchart, swap in a known-good
  component to isolate, change a setting to test hardware; the game scores on steps-to-fix and on never skipping a
  checklist box. 30-38 discussion: "What is the first thing you try now, and why first?" 38-45 exit ticket.
- differentiation: support: 3-step tickets; extension: write a ticket for a partner.
- unplugged: printed flowchart; role-play a help-desk call.
- teacher notes: 1B asks for "potential solutions" so the exit items are "which two steps could fix this".
- exit ticket: 3 items tagged 1B-CS-03 / 2-CS-03 + explain.

**5.4 Bits & Bytes (same data, many codes)** — band 2 primary; 1B extension
- ids: 1B: extension (no 1B standard claimed; builds toward 2-DA-07) · 2: **2-DA-07**
- practices: P4
- I can: 2 "represent the same data as words, decimal, binary, hex and a colour".
- vocabulary: bit, byte, binary, on/off (1B); + hexadecimal, RGB, encoding, place value, pixel (2)
- plan: 0-5 warm-up U5-W4. 5-10 demo: ch 4 "Bits & Bytes": eight switches; flip them, the number appears; letters appear
  via a code table; a colour mixer shows the same colour as RGB numbers, hex and binary at once. 10-30 main: 1B ch 4
  levels 1-4 (count in binary to 15, spell a 3-letter word in a code table, a 5×5 pixel picture as 0/1). 2 ch 4 levels
  1-6 (binary to 255, hex, one colour in four forms, a 8×8 pixel picture encoded three ways (run-length too), "same
  message, different code: which is shortest?"). 30-38 discussion: "Why do computers use two symbols?" 38-45 exit ticket
  (2); 1B: a short reflection question only (no mastery claim).
- differentiation: support: 4 switches; extension: hex colour of the classroom wall.
- unplugged: binary cards (1, 2, 4, 8, 16) held up by students.
- teacher notes: the coverage map lists 5.4 as "extension" for grades 3-5; a 1B class may skip it without losing coverage.
- exit ticket: 2: 3 items tagged 2-DA-07 + explain.

#### Unit 6 — Impacts of Computing

**6.1 Tech That Changed the World (Would You Rather: Tech Choices)**
- ids: 1B: **1B-IC-18** · 2: **2-IC-20** (trade-offs for everyday activities and careers)
- practices: P3.1; (2) P7.2
- I can: 1B "talk about technologies that changed how people live and how people change technology"; 2 "compare the
  trade-offs of a technology for everyday life and for jobs".
- vocabulary: technology, invention, influence, culture (1B); + trade-off, automation, career, benefit/cost (2)
- plan: 0-5 warm-up U6-W1. 5-25 **Would You Rather (Live), topic "tech"** (`wyr:tech:10:20`): 10 dilemmas (§3.7); after
  each reveal, 60 s of talk with the printed prompt for that item (each item has a 1B prompt and a 2 prompt). 25-38:
  1B: pairs pick one technology from the "changed the world" card set (GPS, wireless internet, robots, wearables, social
  media) and say one way it changed life and one way people changed it. 2: T-chart of trade-offs for one technology
  across "everyday" and "careers", shared aloud. 38-45 exit ticket.
- differentiation: support: sentence frames on the print page; extension: a technology that changed their family's life.
- unplugged: the same dilemmas as printed cards; vote by moving to a side of the room.
- teacher notes: WYR Live is unscored by design; evidence for this lesson is the exit ticket and the explain item. The
  topic must be picked in the /live form (chips) until the `?wyr=tech` preselect lands (§6).
- exit ticket: 3 items tagged 1B-IC-18 / 2-IC-20 + explain.

**6.2 Games for Everyone (accessibility and bias)**
- ids: 1B: **1B-IC-19**, **1B-IC-20** (seek perspectives) · 2: **2-IC-21**
- practices: P1.2, P1.1
- I can: 1B "find ways to make a game easier for people with different needs"; 2 "find bias and accessibility problems in
  technology that exists and explain who is left out".
- vocabulary: accessibility, captions, read-aloud, contrast, usability (1B); + bias, assumption, sample, left out,
  inclusive design (2)
- plan: 0-5 warm-up U6-W2. 5-10 demo: open Robo Route's settings panel (kit: motion, captions, read-aloud, text size,
  speed, assist, contrast, colour cues, left-handed): "someone built this for a reason: who?" 10-28 main: **accessibility
  audit** in pairs with the print-page audit sheet: play one Robo Route level four ways (sound off + captions; text size
  150%; one-handed/left-handed; high contrast) and note what helped and what still got in the way; then brainstorm two
  improvements for the game and one for a game they know (1B-IC-19). 2 adds Data Detective ch 4 "Fair Data" levels 1-4
  (a survey that only asked one grade; a "best lunch" chart from a sample that skipped vegetarians; a face-unlock story
  that fails for some users; who is missing from the data?) — 2-IC-21. 28-38 share-out: each pair offers one
  improvement; the class votes on the top three (1B-IC-20: perspectives from other groups). 38-45 exit ticket.
- differentiation: support: audit two settings only; extension: write the improvement as a feature request.
- unplugged: audit the classroom (door handles, signs, light switches) for who they are hard for.
- teacher notes: the audit sheet is the artifact; the top-three list is re-used in the capstone brief (design for one of
  these users).
- exit ticket: 3 items tagged 1B-IC-19, 1B-IC-20 / 2-IC-21 + explain.

**6.3 Fair Use, Fair Share (media rights, public and private)**
- ids: 1B: **1B-IC-21**, **1B-AP-14** · 2: **2-IC-23**, **2-AP-16** (attribution part)
- practices: P7.3; (2) P7.2, P5.2
- I can: 1B "choose media I am allowed to use and give credit"; 2 "weigh public vs private information and give
  attribution when I build on others' work".
- vocabulary: permission, public domain, Creative Commons, credit, copy (1B); + licence, attribution, privacy, consent,
  terms (2)
- plan: 0-5 warm-up U6-W3. 5-10 demo: the "Can I use it?" card: a picture with a licence badge; what the badge allows.
  10-28 main: Brain Board live set **License to Use** (columns: Public domain / CC-BY / All rights reserved / Ask first;
  5 tiles each; teams), then the **credits writer** text step: each student writes the credit line for the kit art and a
  classmate's level they will reuse in the capstone, in the format the lesson gives ("Art: Oomba Kit. Level idea: code
  123456."). 2 adds **Share or Shield** cases from Packet Post ch 3 level 7 as discussion. 28-38 discussion: "What
  happens to the artist when people copy without asking?" 38-45 exit ticket.
- differentiation: support: badge cheat-sheet; extension: find the licence of a real song's cover art (teacher-led).
- unplugged: licence badge cards sort.
- teacher notes: the credit line is reused in 7.2; the game Builder adds the kit's own attribution automatically.
- exit ticket: 3 items tagged 1B-IC-21, 1B-AP-14 / 2-IC-23, 2-AP-16 + explain.

#### Unit 7 — Builder Capstone (Oomba Studio)

The capstone evidences the **program-development** standards (plan, roles, feedback, test, document, attribute,
perspectives). It does **not** claim the control-structure standards (1B-AP-10, 2-AP-12, 2-AP-11): the AI Builder writes
the code from the student's words, so that evidence stays with Robo Route. This is stated on the coverage map.

**7.1 Plan It**
- ids: 1B: **1B-AP-13**, **1B-AP-11**, **1B-AP-16** · 2: **2-AP-13**, **2-AP-18**, **2-AP-15** (start: user interview)
- practices: P1.1, P5.1, P3.2, P2.2; (2) P3.2, P2.2, P2.3
- I can: "plan a game for a real user, break it into parts, and agree who does what by when".
- vocabulary: user, feature, storyboard, plan, role (1B); + user story, milestone, timeline, scope (2)
- plan: 0-5 warm-up U7-W1. 5-10 brief: 1B "Make a quiz or runner game that teaches one thing from CS Quest to a 2nd
  grader." 2 "Make a game that a classmate from the 6.2 top-three list can play; it must keep score and have at least one
  rule that changes play." 10-20 **user interview** (pairs: three questions from the planning sheet to the partner
  playing the user). 20-35 **planning sheet** (print page; also as question steps so it is in the gradebook): title,
  user, 3 features, storyboard of 3 screens (1B) / 3 user stories + parts list + who-does-what-by-when (2). 35-40 pairs
  swap sheets and add one "have you thought about…" note (perspectives). 40-45 exit ticket (short).
- differentiation: support: half-filled sheet with a template choice; extension: a second user persona.
- unplugged: the whole lesson is paper; devices only for the exit ticket.
- teacher notes: the planning sheet answers are typed into three `question` steps (≤3000 chars each) so the teacher can
  rubric-mark them; keep names out (the sheet asks for a user *type*, not a classmate's name).
- exit ticket: 2 items tagged 1B-AP-13 / 2-AP-18 + explain (plan quality is rubric-marked, §3.8).

**7.2 Build It (two sessions recommended)**
- ids: 1B: **1B-AP-12** (remix a template), **1B-AP-14** (attribution) · 2: **2-AP-16**, **2-AP-19** (describe in the
  game's about text)
- practices: P5.3, P7.3; (2) P4.2, P5.2, P7.3, P7.2
- I can: "build my planned game from a starting template, keep my credits, and describe how it works".
- plan: 0-5 warm-up U7-W2 (Studio safety and the plan). 5-40 build step → Studio with the plan as the ask (first 300
  chars of the step body; the lesson's build step body is the student's own plan summary line they typed in 7.1 — the
  teacher pastes nothing). Students work from the Quiz Show (1B) or Runner/Catch (2) template (needs the template-on-
  build-step change, §6; until then the AI picks). Credits line from 6.3 goes in the game's description. 40-45 save,
  "Keep building" (not hand-in yet), 1-minute exit reflection.
- differentiation: support: Quiz Show with 5 questions; extension: two levels of difficulty.
- unplugged: none (device lesson); the fallback is paper prototyping cards from 7.1 if the Builder is resting.
- teacher notes: a 30-student class exceeds the free AI pool (§6): schedule half the class per session or have a school
  plan; students hit 60 msgs/day, 2 builds at once. Builds queue: expect minutes for first builds; have the 7.3 feedback
  form ready for early finishers.
- exit ticket: none; evidence is rubric marks on the build step (§3.8) and the attribution check.

**7.3 Test It (peer play-testing)**
- ids: 1B: **1B-IC-20**, **1B-AP-15**, **1B-AP-16** · 2: **2-AP-15**, **2-AP-17**, **2-DA-09**, **2-IC-22**
- practices: P1.1, P6.1, P6.2, P2.2; (2) P2.3, P6.1, P5.3, P2.4
- I can: "run a fair play-test, collect feedback from several testers, and change my game because of it".
- plan: 0-5 warm-up U7-W3 (how to give kind, specific feedback). 5-10 **hand in** (publishes at class; clean scan =
  instant, flagged = teacher/admin queue, so hand in at the start of the lesson not the end). 10-34 **play-test protocol**
  (§3.8): three rounds of 7 min; roles Player / Watcher / Note-taker rotate; the tester fills the feedback form (question
  step: "I liked / I wonder / I got stuck at"; 2 adds a 1-5 fun and 1-5 fair rating entered as digits); the maker does
  not talk during the round. 34-42 **revise**: back to Studio with one concrete change from the notes (2: justify the
  change with the ratings = refine based on data, 2-DA-09; the three testers = many contributors, 2-IC-22). 42-45 exit
  reflection.
- differentiation: support: feedback sentence starters; extension: a fourth tester from another class via the teacher.
- unplugged: paper-prototype testing with the 7.1 storyboards.
- teacher notes: the class Games tab is where flagged games appear once approved; nothing a tester types can reach the
  maker except through the teacher-visible question step (the platform has no in-game chat); keep it that way.
- exit ticket: 2 items tagged 1B-IC-20 / 2-AP-15 + the feedback-form question steps (rubric-marked).

**7.4 Show It (demo day)**
- ids: 1B: **1B-AP-17** · 2: **2-AP-19**, 2-AP-18 (timeline review)
- practices: P7.2
- I can: "explain the choices I made in my game and what I changed after testing".
- plan: 0-5 warm-up U7-W4 (the unit's vocabulary). 5-38 **two-minute demos** on the projector (teacher opens `/g/<slug>`
  from the lesson progress page), each with the three-sentence script from the print page: what it does, one choice and
  why, one change after testing (1B); 2 adds "how it is organised" (the game's about text as documentation) and whether
  the timeline held. Audience fills one "I noticed" per demo (question step, one line each, no names). 38-45 exit
  ticket + self-assessment against the rubric (digits 0-3 per line typed in a question step).
- teacher notes: the rubric (§3.8) is marked during demos; the standards view turns these marks into the *Applied* tier.
- exit ticket: 2 items tagged 1B-AP-17 / 2-AP-19 + explain.

---------------------------------------------------------------------------------------------------------------------------

## 3. Game, live-set, WYR and capstone designs

Conventions shared by all four games (from `map-games.md`; repeated here only where it drives a design decision):
- Oomba Kit 1.1.2 by the exact `kitTag()`; `<div id="game">` before the tag; all custom DOM appended to `Oomba.ui.root()`
  below `var(--ok-safe-top)`; buttons via `Oomba.ui.button` (≥48 px), dense boards marked `data-fit-dense` (≥28 px) and
  never taller than 1.5× wide; strings via `Oomba.strings({en:{'rr.…':…}, …13 locales})`; game clock only
  (`Oomba.after/every/tween`), `Oomba.time.real` for menus; `Oomba.settings.reduced` honoured by every custom animation
  (`.ok-rm` rule); `dir="ltr"` on code, numbers and grids; the frame is LTR, menus follow `BRB.user.dir`.
- Deterministic `__brbTest`: `Object.assign(window.__brbTest, { start({chapter, band, mode, level, seed}), step(n),
  skipAnimations(), cover(), state() → {chapter, level, stars, band, mode, program, verdict} })`.
- **Chapter/band/mode selection**: an in-game **setup card** (title screen → "Choose chapter", band toggle "Grades 3-5 /
  Grades 6-8", mode where it applies) remembered in `BRB.storage['<slug>-v1'].setup`; when `BRB.params` exists (§4.4
  P0 item) the card is skipped and the chapter is **locked** (`lock.1`) so a lesson step's gradebook cell can only
  contain that chapter. Param grammar (letters/digits/dots, ≤40 chars): `ch.<id>.band.<1B|2>.mode.<play|debug|opt>.lock.1`,
  e.g. `ch.loops.band.2.mode.debug.lock.1` (33 chars).
- **Progress reporting** (today's surface = one best integer score + 40-char label per lesson step): after every level
  `BRB.score.submit(starsInChapter, label)` with label `<game>:<ch>:<band>:<levelsDone>/<levels>:s<stars>` (e.g.
  `rr:loops:2:5/6:s13`, 18 chars, no 7-digit runs, ASCII only, passes `cleanScoreLabel`); `BRB.gameOver({won:true,
  score})` when the chapter's last level is done (marks the step done; the gradebook keeps the best). The stars number is
  monotonic within a chapter so "best" is also "latest". When the proposed `brb:progress` message exists (§4.4 P2) the
  game additionally sends `{chapter, level, stars, standards:[…]}` per level; nothing else changes.
- **Hints that teach** (three tiers, same UI in all games, `Oomba.ui.bubble` from the game's mascot): T1 a question
  ("What should happen right after the turn?"); T2 the game points at the place (highlights the block/row/node whose
  effect differs from the goal, using the step-through); T3 shows one concrete piece (one block, one row, one node) and
  says why. Hints never cost a level; T3 caps stars at 2 so the stars column still separates "solved" from "mastered".
  Every hint is a string in 13 languages (`<slug>.hint.<level>.<tier>`).
- Rewards: stars (1 solved, 2 solved within par+2, 3 solved at par), chapter badges on the setup card, a per-game
  "detective rank"/"robot licence"/"postal badge"/"technician level" title shown on the results card; no leaderboards
  across kids (official scores exist, but the games submit chapter stars, which are capped and not competitive).
- Grade-band switch (common): vocabulary set (1B: picture + word blocks; 2: text), number of levels, par tightness,
  which hint tiers exist (2 has no T3 on the last two levels of a chapter), extra concept levels (listed per game),
  read-aloud default on at 1B, and the exit "learn card" text.
- Safety constraints baked into content: no URLs, emails, phone-like digit runs, real brands or real people; nothing
  typed by a kid ever leaves the frame except numbers via score; no text input at all in anything that may be hosted
  live (all four games are tap-only; Data Detective's numeric entry uses +/- steppers).
- Each game ships: `seed-games/<slug>.html` (+ `.json` with 11-locale `l10n`), a `covers.js` recipe using `cover()`,
  entries in `SEED_GAMES`, scanner slug lists, `seeds.spec.js` (`featured: true`), `LEARNING`/HUBS, a unit test in the
  `code-isle.test.js` pattern (vm-load the data script, solve every level with its `sol`, assert `starter` fails, assert
  every string key exists in 13 locales with equal `{slots}`, assert every level's `std` is a real id in `csta.json`),
  and the 5-size fit audit on title and play.

### 3.1 Robo Route (`robo-route`) — block coding on a grid

**Base**: `Oomba.game({api:1, controls:'none', camera:'fixed', mode:'topdown', size:[960,540], fit:'contain', hud:
['count:gem'], level: Oomba.level.grid(rows, legend, {cell:64})})`, one level record per puzzle; the robot is `w.hero`
(kit `art-animals` robot/`Oomba.char` with a `dress`), gems/doors/buttons/keys/walls are `w.spawn` props; moves are
`Oomba.tween(w.hero, {x,y}, {ms: 260/speed})` chained from the recorded sim events; feedback via `stage.burst('sparkle')`,
`Oomba.juice.shake` (off under reduced motion), `Oomba.sfx('correct'|'wrong'|'step')`.

**Custom DOM** (in `Oomba.ui.root()`): the **palette** (a row/column of block buttons), the **program area** (slots in a
vertical list; loop/if/when/define blocks are containers with an indented slot list), the **run bar** (Run, Step, Reset,
speed 1×/2×, Hint, Plan card at band 2), the **block budget** pill (used/par), the **verdict panel** (per test map ✓/✗ +
reason), the **variables watch** (ch 5+), the **note** popover (band 2, ch 8). Layout: portrait = grid on top (max 55%
height), program below in a scroller marked `data-fit-dense` with ≤ 8 visible buttons before scrolling; landscape/desktop
= grid left, program right. Blocks are 48 px tall (40 inside `data-fit-dense`), full width of the program column.

**Controls**: *touch* tap a palette block → it appends to the selected slot (tap a slot first to insert there); long-press
a program block → menu (delete, duplicate, move up/down); drag via Pointer Events with `setPointerCapture` as the
secondary path (drop targets grow to 56 px while dragging); container blocks open with a tap. *Keyboard*: 1-9 picks a
palette block, ↑/↓ moves the slot cursor, Enter inserts, Delete removes, Tab cycles palette/program/run bar, R run, S
step, Esc pause (kit). Focus ring is the kit's `--ok-focus`. Everything announces through `Oomba.ui.announce`
("Repeat 3 added at step 4").

**Interpreter** (plain script, vm-testable, no eval): blocks → a small AST → `Sim(level, seedLayout)` with step limits
(2,000 steps, call depth 16, 200 loop iterations) → `events[]` (move, turn, pick, bump, say, set var, event fired, error)
→ `verdict(level, results)` = `{ok, stars, fails:[{map, reason, atStep}]}`. Each level runs the program on **every test
map** (1 at 1B, up to 3 at band 2, more for random layouts) and only passes when all pass. The sim is deterministic from
the level seed; `__brbTest.state().verdict` exposes it. Block set:

| Block | 1B form | 2 form | Chapter |
|---|---|---|---|
| move forward / turn left / turn right / pick up / use key | icon + word | text | 1 |
| repeat N { } | icon "↻ 3" | `repeat 3 times`, `repeat until <sensor>` | 2 |
| if <sensor> { } | icon sensor tiles: path ahead, gem here, door ahead, has key | `if … else`, sensors combined with `and / or / not` | 3 |
| when <event> { } | button pressed, bumped, gem seen | + `when timer ticks`, state checks inside | 4 |
| set / change / show variable | `gems`, `battery`, `score` presets | named by the player from a list incl. bad names; types number/boolean/text; expressions `a + 1`, `a - b` | 5 |
| define chunk / call chunk | named from a picker | `define walk(n)`, `call walk(3)`; params shown in the watch | 6 |
| note | — | free-text note attached to a block (text is local only; never leaves the frame; filtered by nothing because it is never shown to anyone else) | 8 |

**Chapters → levels** (count 1B / 2; `std` is the standard each level is evidence for):

1. **Sequences** `seq` (6 / 6) — 1B-AP-10 / 2-AP-10 (levels 3-6 require the Plan card: order flowchart boxes before the
   palette unlocks; verdict compares the plan's order with the program's) + 2-AP-12 for 5-6.
2. **Loops** `loops` (6 / 6) — 1B-AP-10 / 2-AP-12 (4-6 nested; 6 = repeat-until).
3. **Conditionals** `cond` (6+1 / 6) — 1B-AP-10 / 2-AP-12 (3 if-else, 4 AND, 5 OR+NOT, 6 key-and-door). Levels with
   `random: true` run on 3 seeded layouts.
4. **Events** `events` (5 / 5+1) — 1B-AP-10 / 2-AP-12.
5. **Variables** `vars` (5+1 / 6) — 1B-AP-09 / 2-AP-11 (2 = "name it right": verdict rejects `x`, `thing`; 4 = boolean;
   5 = expression; 6 = text in a bubble).
6. **Functions** `funcs` (5 / 6) — 1B-AP-11 / 2-AP-14 (1-4), 2-AP-13 (5-6: the goal is shown as three subgoals the
   player ticks off; verdict needs three separate procedures).
7. **Bug Hunt** `debug` (6 / 6) — 1B-AP-15 / 2-AP-17 (each level ships 3 test maps and a broken `starter`; passes when
   all maps pass; the "learn card" names the bug type).
8. **Best Route** `opt` (5 / 5) — 1B-AP-08 / 2-AP-17 + 2-AP-19 (levels 3-5 need a note on every procedure/loop; verdict
   checks presence and ≥ 12 chars). Each level shows two given algorithms (A/B cards) with their block count, steps and
   battery; the player picks, edits, runs; stars = criteria met (shortest / fewest blocks / "works on the bigger map"
   test).
9. **Level Maker** `maker` (open-ended) — 1B-AP-12, 1B-AP-16 / 2-AP-16, 2-AP-18 (evidence is the exit ticket and the
   `label` `rr:maker:*:made<n>:remixed<m>`). Tools: tile painter (floor/wall/water), place robot/goal/gems/door/key/button,
   choose palette and block budget (which is how a maker "requires a loop"), **Check** (a breadth-first search over
   robot states proves solvability and computes par; refuses unsolvable levels with the reason), **Share code** (6
   digits = index into a per-player level list encoded as base-10 of a 20-bit payload is not enough — so the code is a
   16-bit checksum + the level is stored under the maker's own save, and a classmate can only open it if the **class
   level shelf** exists, §6; until then "share" means the maker's device: pass the tablet, or the teacher projects it).
   Remix: open a level, change it, the game stamps `based on 123456` in the level card (code, never a name).

**Modes** (any chapter): *play*, *debug* (program given, find the bug; available for ch 1-6 as "broken twin" levels, used
by lesson 2.1 extension), *opt* (two given algorithms + criteria; ch 2-6 twins, used by 2.2 extension). The mode is a
param/setup choice; stars are stored per (chapter, mode).

**Grade-band switch specifics**: 1B palette is icon+word, max 10 program slots visible, par+2 for 2 stars, hints T1-T3,
robot narrates each step aloud on first run; 2 palette is text, 16 slots, par+1 for 2 stars, T3 absent on the last two
levels, Plan card in ch 1, test maps 3 per level from ch 3, "name it right" and note rules on.

**Teacher deep-link params** (via `BRB.params`): `ch.<seq|loops|cond|events|vars|funcs|debug|opt|maker>.band.<1B|2>
.mode.<play|debug|opt>.lock.1.level.<n>`; `level` optional (start there, earlier levels still open). Without params the
setup card is shown and the lesson text says which chapter to pick.

**What it reports**: per lesson step: best `rr:<ch>:<band>:<done>/<n>:s<stars>`; `BRB.gameOver` on chapter end; with
`brb:progress`: `{game:'robo-route', chapter, level, stars, standards:['1B-AP-10'], mode, band}` per solved level.

**Kit reuse vs custom**: reuse `Oomba.game` title/how-to/pause/results/settings, `level.grid`, `w.spawn/tween`, `hud`,
`ui.button/toast/announce/bubble/dialog`, `icon` (`drag move tap check cross hint lock` + arrows), `art.toCanvas` for the
robot portrait, `sfx`, `strings`, `save` (setup + per-chapter stars under 32 KB) and `BRB.storage` for maker levels
(≤ 450 KB: a level is ≈ 200 bytes; cap 200 levels). Custom: palette, program list, containers, step-through highlighter,
verdict panel, variable watch, tile painter, BFS checker, the interpreter.

**Cover** (`covers.js` recipe, 360×480): `__brbTest.start({chapter:'loops', band:'1B', level:4, seed:7})` then
`cover()` = program half-built with a repeat block open, robot mid-path with a sparkle burst, 2 of 3 stars lit.

### 3.2 Data Detective (`data-detective`) — mysteries solved with data

**Base**: `Oomba.stage({api:1, biome:'town', size:[960,540]})` as a living backdrop (the kit's town/props, a detective
character, day/night by chapter) behind DOM "case cards" in `Oomba.ui.root()` (the Would You Rather pattern). All data
views are DOM: a **table** (sortable column headers as buttons, row grouping chips, a "clean" toggle per row at band 2),
**bars** (CSS bars with the value printed, `role="img"` + a text summary for screen readers, min 3:1 contrast, pattern
fills under `cvd`), a **dot plot** for Model Lab (DOM dots positioned in a grid; predicted vs measured in two shapes, not
just two colours), **claim cards** (`Oomba.ui.ask` with 2-4 tiles: "which claim does the chart support?"), **steppers**
(+/- buttons, 48 px, with a digit display; keyboard ←/→, Home/End) for entering class tallies, **sliders** for model
parameters (native range inputs styled with `--ok-*` and 48 px thumbs; arrow keys step).

**Core mechanic**: each level is a *case*: a question, a data set (≤ 40 rows × ≤ 5 columns so it fits a tablet), tools
unlocked for that level, and a goal checked by the verdict (`sortedBy`, `groupedBy`, `chartOf`, `claim`, `cleanedRows`,
`modelError`, `prediction`). Stars: solved / solved with the best representation / solved and the written-out reasoning
tile picked correctly ("because…" tile).

**Chapters → levels**:
1. **Sort & Chart** `sort` (5 / 6) — 1B-DA-06 / 2-DA-08 (2: levels 1-2 clean first: duplicates, typos, impossible values;
   level 5 counts → percentages; level 6 "trick chart").
2. **Predict It** `predict` (5 / 5) — 1B-DA-07 / 2-DA-09 (**Model Lab**: 2-3 sliders, run, error bar, "new data arrived"
   refinement round; level 4 has an irrelevant slider; level 5 noisy data).
3. **Our Class** `survey` (3 / 4) — 1B-DA-06, 1B-DA-07 / 2-DA-08, 2-IC-22: enter the class tally from the WYR Live results
   (steppers, 0-60 per option), chart it, choose a supported claim; 2: response-rate level ("28 of 30 answered: enough?"),
   clean a nonsense row, compare with the built-in "another class" set.
4. **Fair Data** `fair` (— / 4) — 2-IC-21 (biased samples, who is missing, a system that fails for some users; the last
   level asks the player to pick the two extra groups to survey).
Band 1B has no ch 4; the setup card hides it at 1B.

**Hints**: T1 "Which column would you sort to see the biggest first?", T2 highlights the column/row, T3 performs one step
and explains. **Rewards**: stars, "Detective rank" (Rookie → Inspector → Chief) per chapter, case-file badges.

**Grade-band switch**: 1B 10-20 rows, single-sort, bars only, claims as pictures+text; 2 up to 40 rows, clean step,
percentages, dot plots, model sliders, Fair Data chapter, claim tiles with "because" tiles.

**Deep-link params**: `ch.<sort|predict|survey|fair>.band.<1B|2>.lock.1`. **Reports**: `dd:<ch>:<band>:<done>/<n>:s<stars>`;
Model Lab adds `e<err>r<refinements>` inside the 40 chars (e.g. `dd:predict:2:5/5:s12:e9r3`).

**Kit reuse vs custom**: reuse stage + a kit character for the detective (`Oomba.char`, mouth flap via `Oomba.say` for
the case intro), `ui.ask` for claims, `ui.button/dialog/toast/announce`, `icon` (`book question check cross hint`),
settings/pause/title (`Oomba.ui.title` + `Oomba.test({state,start})` since this is a stage game, and the game calls
`BRB.gameOver` itself). Custom: table, bars, dot plot, steppers, sliders, the verdict.

**Cover**: `start({chapter:'sort', band:'1B', level:3})` → `cover()`: a bar chart half-sorted, the detective pointing,
a claim card open.

### 3.3 Packet Post (`packet-post`) — Netville's postal network

**Base**: `Oomba.game({api:1, controls:'none', camera:'fixed', mode:'topdown'})` with the network drawn as `w.spawn`
props: houses (art-props), routers (post offices), links as stage lines (`stage.add` ground strips), packets as small
entities tweened along links; the kit character is the postal robot. DOM in `Oomba.ui.root()`: the **packet tray**
(numbered tiles to tap in order), **route picker** (tap a router then a next router; links highlight), the **ACK board**
(received numbers grid), **rule toggles** (band 2 protocols: number packets, ACK, resend after timeout, checksum), the
**phishing card** (a pretend message built from avatar + name + body + a button; tapping a tell marks it), the
**passphrase tiles** (word tiles → a strength meter: length, words, not-a-pattern), the **cipher wheel** (two rings; +/-
and arrow keys; an on-screen alphabet to tap letters), the **lockbox** model (public padlock / private key cards).

**Chapters → levels**:
1. **Packets** `packets` (6 / 6) — 1B-NI-04 / 2-NI-04 (headers and numbering as the "rule we invented").
2. **Rules of the Road** `rules` (5 / 6) — 1B-NI-04 / 2-NI-04 (ACK, timeout, checksum/parity, fastest path by link speed,
   secure lane preview).
3. **Lock It Down** `lock` (6 / 7) — 1B-NI-05 / 2-NI-05 (1-6) + 2-IC-23 (7 **Share or Shield**).
4. **Secret Codes** `codes` (4 / 7) — 1B-NI-05 / 2-NI-06 (Caesar, keyword, pigpen, pixel steganography, frequency crack,
   two-key lockbox, compare strength).

**Core mechanic by chapter**: packets = split (tap "cut" N times), route (tap hops), reassemble (tap in order; the
picture/message appears as tiles land); verdict = all packets delivered + correct order + hop count within par. Rules =
set toggles then "send 20 packets" simulation; verdict = delivered complete within the time budget with the fewest
rules/resends (stars). Lock = sorting (tap item, tap bin), tells (tap), tile builder (strength ≥ threshold), Share or
Shield (choose + pick the trade-off reason tile). Codes = encode/decode with the wheel/table (verdict compares the
produced tiles), crack (bars of letter frequency: tap the likely E), lockbox (drag/tap cards to the right actor).

**Safety**: no domain/URL/email/phone strings anywhere in the file (the phishing card uses an avatar + display name like
"Prize Team" and a "Claim prize" button; tells are rendered as icons+words); passphrases are tiles, the game never says
"type your password"; addresses are house numbers 1-99; 1B passphrase levels say "a passphrase for Netville", never a real
account; nothing typed.

**Hints**: T1 question, T2 highlight the missing packet number / the risky tell / the wrong wheel offset, T3 do one.
**Rewards**: stars, "postal badges" per chapter (Courier → Router → Guardian → Cryptographer).

**Grade-band switch**: 1B 2-9 packets, two paths, 3 tells per card, Caesar only; 2 headers, rule toggles, checksum,
fastest path, physical/digital sort, Share or Shield, five cipher methods and the strength comparison.

**Deep-link params**: `ch.<packets|rules|lock|codes>.band.<1B|2>.lock.1`. **Reports**: `pp:<ch>:<band>:<done>/<n>:s<stars>`.

**Kit reuse vs custom**: reuse `Oomba.game` world (spawn/tween/burst/floatText), `ui.ask` for decisions, `ui.dialog`
for the "learn card", `icon` (`lock check cross hint question`), `art.toCanvas` for the message avatar (kit species, never
a photo), settings/pause/results. Custom: tray, route picker, ACK board, toggles, phishing card, tiles, wheel, lockbox.

**Cover**: `start({chapter:'packets', band:'1B', level:4})` → `cover()`: six numbered packets mid-flight on three links,
two already placed in the picture frame.

### 3.4 Inside the Machine (`inside-the-machine`) — parts, systems, help desk, bits

**Base**: DOM-first in `Oomba.ui.root()` on a quiet `Oomba.stage` (workshop biome, a technician character who talks via
`Oomba.say`), pictures from `Oomba.art.toCanvas` (kit props) and inline SVG strings (exploded device views, switches,
pixel grids; SVG is invisible to the fit audit, so every tappable part also has a DOM hit target ≥ 48 px). Widgets:
**label board** (tap a label, tap a part; keyboard: Tab to parts, 1-9 labels), **lane model** (Input → Process → Output →
Storage lanes; tap a card then a lane), **trace player** (press play: a key press travels key → processor → memory →
screen with captions), **persona scene** (short animated scenario with a "tap when the user struggles" moment and a
recommendation picker), **parts bin** (cards with cost/size/power; a budget bar), **ticket desk** (ticket card, step
buttons in a checklist order, time cost), **flowchart** (band 2 troubleshooting: tap the next box; the game grays
impossible branches), **switch row** (8 toggles; number/letter/colour readouts), **pixel grid** (tap cells; the binary
and run-length string update live).

**Chapters → levels**:
1. **Parts** `parts` (6 / 5) — 1B-CS-01 / 2-CS-01 (**Design Lab** personas and recommendations; level 5 controller
   layout on a grid for one persona, verdict = reach/size/contrast rules met).
2. **Make it Work** `system` (5 / 5) — 1B-CS-02 / 2-CS-02 (**Build-a-Gadget**: brief + parts bin + budget; verdict = brief
   met (all required data flows simulate) under budget; stars for cheapest/smallest/longest battery).
3. **Help Desk** `help` (6 / 6) — 1B-CS-03 / 2-CS-03 (flowchart-driven multi-device tickets; verdict = fixed, with stars
   for steps-to-fix and no skipped checklist box).
4. **Bits & Bytes** `bits` (4 / 6) — extension at 1B (no claim) / 2-DA-07.

**Hints**: T1 question, T2 highlight (the part/lane/step/switch), T3 do one. **Rewards**: stars, "Technician level"
badges, a printable-looking "certificate" card at the end of ch 3 (in-game only; no names).

**Grade-band switch**: 1B two devices, four-lane model, single-device tickets, 4 switches; 2 personas and
recommendations, parts bin with budget and trade-offs, flowchart tickets with component swap, hex/RGB/run-length.

**Deep-link params**: `ch.<parts|system|help|bits>.band.<1B|2>.lock.1`. **Reports**: `im:<ch>:<band>:<done>/<n>:s<stars>`.

**Kit reuse vs custom**: reuse stage + character, `ui.dialog/ask/button/toast/announce`, `icon`, `art.toCanvas`, settings
and pause (`Oomba.ui.title` + `Oomba.test`), `BRB.gameOver` called by the game. Custom: all widgets above (DOM + SVG).

**Cover**: `start({chapter:'parts', band:'1B', level:2})` → `cover()`: the exploded tablet with three labels placed and
one label mid-drag, the technician pointing.

### 3.5 Live quiz sets: structure and authoring rules

Sets are **teacher sets created in the teacher's library** when a lesson is added (materialiser, §5.2), never a bank
subject: set items carry `cat` and the bank's rows cannot. Two sets per lesson per band:

| Set | Items | Secs | Modes | Purpose | Recorded as |
|---|---|---|---|---|---|
| **Warm-up** `U<n>-W<m>` | 5 | 15 (1B) / 10 (2) | Quest Race (default), Question Battle | retrieval of the previous lesson + today's words; energy | `live_runs` + `live_run_scores.marks` → *Practised* |
| **Exit ticket** `U<n>.<m>-X` | 3 auto + 1 explain | — (quiz step, self-paced) | `quiz` step in the lesson (+ a `question` step for the explain item); can also be hosted live as a 3-item Quest Race when devices are shared | `step_progress.marks` per item (+ `cat` kept, §4.4) → *Checked*; explain → teacher marks → *Applied* |

Totals per band: 27 warm-up sets × 5 = 135 items; 26 exit sets × 3 = 78 auto items (7.2 has none) + 26 explain prompts;
both bands: 270 warm-up + 156 exit auto items + 52 explain prompts. Plus one Brain Board set (6.3 *License to Use*, 4
columns × 5 tiles, each band) and the WYR topic (§3.7).

Item schema in the catalogue (validated by the materialiser against `classlive-sets.LIMITS`/`SECS`):
`{ q ≤300, choices 2-4 × ≤120, answer, secs ∈ SECS, cat: '<CSTA id>', kind: 'recall|apply|analyze' }`. `cat` is exactly one
CSTA id (≤ 40 chars; the standards view groups by it). Rules: plain text; no URLs, emails, digit runs ≥ 7, brand or
people names; every item must be answerable from the lesson; distractors are the misconceptions named in the lesson's
teacher notes; at most one "all of the above"-free design (never used); each exit item is tagged to a **primary**
standard of its lesson only, so item accuracy is never attributed to a standard the lesson did not teach.

Sample items (the `cat` shows which standard each checks; A = answer):

*U1 warm-up, 1B (U1-W2)*: "Which word means 'do the same steps again'? loop / variable / event / bug" A loop [1B-AP-10].
"The robot must: forward, forward, turn right. What is this list called? a program / a chart / a packet / a password"
A program [1B-AP-10]. *U1 warm-up, 2 (U1-W3)*: "`repeat 3 { repeat 2 { forward } }` moves the robot how many squares?
5 / 6 / 9 / 3" A 6 [2-AP-12]. "Which is pseudocode? a drawing of the robot / `IF gem THEN pick` / a photo of the grid /
a list of names" A `IF gem THEN pick` [2-AP-10].

*1.2 exit, 1B*: "Pick the shortest program that walks 4 squares: forward×4 written out / repeat 4 {forward} / repeat 2
{forward} / turn, forward" A repeat 4 [1B-AP-10]. "What happens if the number in a repeat block is 0? runs once /
never runs / runs forever / the robot turns" A never runs [1B-AP-10]. "Which part of 'forward, pick, forward, pick,
forward, pick' could go in one loop? forward only / pick only / forward then pick / nothing" A forward then pick
[1B-AP-10]. Explain: "Where in your level 5 program did you use a loop, and why there?" [1B-AP-10].
*1.2 exit, 2*: "`repeat 3 { forward; repeat 2 { pick } }`: how many picks? 2 / 3 / 5 / 6" A 6 [2-AP-12]. "Which loop
stops because of a condition? repeat 4 / repeat until wall ahead / forward / define walk" A repeat until [2-AP-12].
"A 4×4 gem field with one loop inside another: the inner loop repeats… 4 times total / 4 times per outer turn / 16 times
per outer turn / once" A 4 per outer turn [2-AP-12]. Explain: "Describe the nested loop you used in level 5 and how many
times the inside ran." [2-AP-12].

*1.3 exit, 2*: "`if hasKey AND doorAhead`: hasKey true, doorAhead false. Runs? yes / no / only once / error" A no
[2-AP-12]. *1.5 exit, 2*: "Best name for the number of gems collected: g / gemsCollected / thing / x1" A gemsCollected
[2-AP-11]. "`hasKey` should hold… a number / true or false / a word / a picture" A true or false [2-AP-11].
*1.6 exit, 2*: "`walk(3)` then `walk(5)`: the parameter lets one procedure… run faster / do different amounts / use fewer
loops / draw" A do different amounts [2-AP-14]. *1.6 exit, 1B*: "Breaking a big route into 'climb', 'zigzag', 'finish' is
called… looping / decomposing / debugging / encrypting" A decomposing [1B-AP-11].

*2.1 exit, 1B*: "The robot turns left but should turn right. The first thing to do: delete everything / step through and
watch / add a loop / change the goal" A step through [1B-AP-15]. *2.1 exit, 2*: "A program passes maps 1 and 2 but not
map 3 where the gem is at the start. Map 3 is a(n)… edge case / loop / variable / protocol" A edge case [2-AP-17].
*2.2 exit, 1B*: "Two programs reach the goal. One has 6 blocks, one has 14. Which is usually more appropriate if the
grid gets bigger? the 14-block one / the 6-block one with a loop / both the same / neither" A 6 with loop [1B-AP-08].
*2.2 exit, 2*: "A note on a procedure is for… the robot / people reading the code / making it faster / the verdict"
A people reading [2-AP-19]. *2.3 exit, 1B*: "You changed a classmate's level. You should… hide it / keep the 'based on'
code line / delete their level / rename it as yours" A keep the based-on line [1B-AP-12]. "During level-making, roles
should… stay the same / swap so everyone tries each / go to the fastest typer / be chosen by the game" A swap [1B-AP-16].

*U3 warm-up, 1B (U3-W1)*: "A chart that helps you compare amounts with rectangles: bar chart / packet / program / loop"
A bar chart [1B-DA-06]. *3.1 exit, 1B*: "To show which pet is most common, you should… sort by name / group and count by
pet / sort by date / delete rows" A group and count [1B-DA-06]. "A chart supports a claim when… it is colourful / the
data shows it / the teacher says so / it has many rows" A the data shows it [1B-DA-06]. *3.1 exit, 2*: "'Blue', 'blue',
'Blu' in one column: before charting you should… delete all three / make them one spelling / sort them / chart them as
three" A one spelling [2-DA-08]. "Comparing 12 of 20 boys and 15 of 30 girls fairly: counts / percentages / sums /
dates" A percentages [2-DA-08]. *3.2 exit, 1B*: "After 2 s the robot went 10 cm, after 4 s 20 cm. Predict 6 s: 25 / 30 /
40 / 60" A 30 [1B-DA-07]. "Two tries is… enough / not enough to be sure / too many / the rule" A not enough [1B-DA-07].
*3.2 exit, 2*: "Your model predicted 40 cm, you measured 52 cm. Next: change a parameter and re-run / keep it / delete the
data / measure once more only" A change and re-run [2-DA-09]. *3.3 exit, 2*: "28 of 30 students answered. The two missing
answers… don't matter at all / could change a close result / are an error / mean the data is fake" A could change a close
result [2-DA-08]. "Asking many people to add questions to a shared quiz is called… crowdsourcing / debugging / routing /
encrypting" A crowdsourcing [2-IC-22].

*U4 warm-up, 1B (U4-W1)*: "A small piece of a message sent over a network: packet / pixel / password / program" A packet
[1B-NI-04]. *4.1 exit, 1B*: "Packets arrive 3, 1, 2. The destination… throws them away / puts them in order / sends them
back / makes new ones" A puts them in order [1B-NI-04]. "A message to a friend travels through… one wire / several devices
/ no devices / only the air" A several devices [1B-NI-04]. *4.2 exit, 2*: "Packet 4 never arrived. The protocol says…
give up / ask for packet 4 again / resend everything / wait forever" A ask again [2-NI-04]. "A checksum helps to…
encrypt / detect a broken packet / find the fastest path / name a router" A detect broken [2-NI-04]. *4.3 exit, 1B*:
"Strongest passphrase: 1234 / blue / purple-turtle-sings-loudly / your pet's name" A purple-turtle… [1B-NI-05]. "A
message says 'You won! Tell us your passphrase now!' This is… a prize / phishing / a protocol / a backup" A phishing
[1B-NI-05]. *4.3 exit, 2*: "Locking the server room door is… digital security / physical security / encryption / a
protocol" A physical [2-NI-05]. "Posting your weekly schedule publicly: benefit friends can find you, risk… nothing /
strangers know where you are / slower internet / it costs money" A strangers know [2-IC-23]. *4.4 exit, 2*: "Caesar
shift 3: A becomes… B / C / D / Z" A D [2-NI-06]. "Hiding a message in a picture's pixels is… Caesar / steganography /
a checksum / phishing" A steganography [2-NI-06]. "The public padlock can be shared because… anyone can lock, only the
owner can open / it has no key / it is a Caesar cipher / it is a password" A anyone lock, owner open [2-NI-06].

*U5 warm-up, 1B (U5-W1)*: "Which is an input part? screen / speaker / keyboard / battery" A keyboard [1B-CS-01].
*5.1 exit, 1B*: "A robot's light sensor needs the robot for… light / power / wheels / sound" A power [1B-CS-01]. "You
press a key and a letter appears because the ___ decided what to show: speaker / processor / battery / cable" A processor
[1B-CS-01]. *5.1 exit, 2*: "A user in sunlight can't read the screen. Best recommendation: smaller text / brighter screen
option / more buttons / a longer cable" A brighter option [2-CS-01]. *5.2 exit, 1B*: "Taking a photo needs hardware
(camera) and… more cameras / software (the camera app) / a printer / a password" A software [1B-CS-02]. *5.2 exit, 2*:
"A plant monitor on a shelf with no plug: Bluetooth + battery or USB cable + no battery? Trade-off: mobility vs. needing
power / colour vs. size / speed vs. cost / none" A mobility vs power [2-CS-02]. *5.3 exit, 1B*: "No sound. Two good first
checks: volume and headphones / reinstall everything and buy speakers / restart and change the wallpaper / caps lock and
battery" A volume and headphones [1B-CS-03]. *5.3 exit, 2*: "The printer won't print from the laptop. To find out if the
printer is the problem you… buy a printer / print from another device / turn off wifi / change the font" A print from
another device [2-CS-03]. *5.4 exit, 2*: "1010 in binary is… 5 / 10 / 12 / 101" A 10 [2-DA-07]. "The same colour can be
written as a word, as RGB numbers and as hex. These are… different colours / different encodings / errors / pixels" A
different encodings [2-DA-07].

*U6 warm-up, 2 (U6-W1)*: "A trade-off is… a free upgrade / a benefit that comes with a cost / a bug / a password" A
benefit with cost [2-IC-20]. *6.1 exit, 1B*: "GPS changed how people… count / find their way / sleep / spell" A find their
way [1B-IC-18]. "People change technology too. Example: … adding captions because viewers asked / the sun rising / rain
/ gravity" A adding captions [1B-IC-18]. *6.1 exit, 2*: "Self-checkout: everyday benefit faster lines; career trade-off…
more cashier jobs / fewer cashier jobs, new tech jobs / no change / cheaper food" A fewer cashier, new tech [2-IC-20].
*6.2 exit, 1B*: "Captions in a game help people who… can't hear well or are in a quiet room / are tall / own a tablet /
like blue" A can't hear [1B-IC-19]. "Asking another group what they think of your game is… cheating / seeking
perspectives / debugging / encrypting" A seeking perspectives [1B-IC-20]. *6.2 exit, 2*: "A face unlock tested only on
one group of people and failing for others shows… good design / bias in the data / a protocol / a loop" A bias [2-IC-21].
*6.3 exit, 1B*: "A picture marked 'public domain' can be… used freely / never used / used only on Fridays / sold as yours
only" A used freely [1B-IC-21]. "When you remix, you should… hide the original / credit the original creator / charge money
/ delete it" A credit [1B-AP-14]. *6.3 exit, 2*: "Using a library's code in your game requires… nothing / attribution as
the licence asks / deleting it later / a password" A attribution [2-AP-16]. "Making your game's high scores public: benefit
competition; risk… none / shows who played when / faster game / better art" A shows who played when [2-IC-23].

*U7 warm-up, 1B (U7-W1)*: "Before building, a plan with pictures of each screen is a… storyboard / packet / checksum /
loop" A storyboard [1B-AP-13]. *7.1 exit, 2*: "A timeline in a team project helps to… make the game faster / know who does
what by when / encrypt / add loops" A who does what by when [2-AP-18]. *7.3 exit, 1B*: "A tester got stuck on level 2. You
should… ignore it / change the game and test again / blame the tester / delete level 2" A change and test again
[1B-AP-15]. *7.3 exit, 2*: "Feedback from three testers helps because… it is more perspectives / it is faster / it is
longer / testers are smarter" A more perspectives [2-AP-15]. *7.4 exit, 1B*: "Explaining why you chose a timer in your
game is… debugging / describing a design choice / a protocol / remixing" A describing a design choice [1B-AP-17].
*7.4 exit, 2*: "Documentation makes a program easier to… sell / follow, test and debug / encrypt / shorten" A follow,
test and debug [2-AP-19].

### 3.6 Warm-up/exit set language and languages

All items are English (US) data; chrome follows each player's UI language, which the live engine already handles (set
text verbatim, chrome localized). Read-aloud reads the English with the page-language voice (known platform behaviour);
the lesson notes say so for ELL classes and offer the printed set.

### 3.7 Would You Rather (Live) — "Tech choices" topic (`cat: 'tech'`)

Format per `scripts/data/would-you-rather/en.json`: `{ id:'tech-<n>', cat:'tech', a:{text ≤60, tags⊂TAGS}, b:{…} }`; tags
from the existing `TAGS` list (`brave think make animal food fast kind calm fun nature tech social`); `cat.tech` in
`ui.json` for 13 languages ("Tech choices"); translations per `<lang>.json` (English fallback per item is allowed by
`wyr.js:28-32`, but the pack build wants ≥ 90% per language, so ship all 13). Each item has a discussion prompt and a CSTA
tag in a **separate catalogue file** (`seed-lessons/cs-quest/wyr-tech-prompts.json`), since the WYR data format has no
room for them. Starter `wyr:tech:10:20` (10 items, 20 s). Thirty items (a | b):

1. Have a robot that cleans your room | a robot that does your homework (prompt: who benefits, who loses? 1B-IC-18 / 2-IC-20)
2. Give up video games for a year | give up music streaming for a year (what tech do you rely on; 1B-IC-18)
3. A phone that never dies | a phone that never needs an update (what updates protect; 1B-NI-05 / 2-NI-05)
4. Everyone sees your high scores | nobody can see them, not even friends (public vs private; 2-IC-23)
5. A self-driving school bus | a human driver with a smart map (trust, jobs; 2-IC-20)
6. Learn with a game | learn with a video (how tech changes learning; 1B-IC-18)
7. A smart watch that counts your steps | a diary where you write them (data collection; 2-IC-23)
8. Talk to a helpful AI all day | talk to one friend all day (social interaction; 1B-IC-18)
9. A game only playable with sound | a game only playable with captions (accessibility; 1B-IC-19 / 2-IC-21)
10. Your town has free wifi everywhere | your town has more parks (trade-offs of infrastructure; 2-IC-20)
11. A camera that tags your friends by face | a camera that tags nobody (bias, consent; 2-IC-21)
12. Share your drawing so anyone can remix it | keep it only yours (licences; 1B-IC-21 / 2-AP-16)
13. One password for everything | a different one for every app (security vs convenience; 1B-NI-05)
14. A drone delivers your lunch | a person delivers your lunch (careers; 2-IC-20)
15. Vote on class rules with an app | vote with hands up (crowdsourcing, privacy; 2-IC-22)
16. A translator earbud for every language | a teleporter that works once a year (tech that changed culture; 1B-IC-18)
17. Buttons you can feel | a flat touch screen (ergonomics, accessibility; 2-CS-01 / 1B-IC-19)
18. A game that saves to the cloud | a game that saves only on your tablet (backups, data loss; 1B-NI-05)
19. Your drawing in a museum with your name | with no name but seen by millions (attribution; 1B-AP-14)
20. A wristband that unlocks the school door | a key you might lose (physical vs digital security; 2-NI-05)
21. A robot pet | a real pet (needs tech meets; 1B-IC-18)
22. An app that picks your outfit | pick it yourself in half the time (automation; 2-IC-20)
23. A map app that knows where you are | a paper map that knows nothing (location privacy; 2-IC-23)
24. Build a game alone | build a game with three friends (collaboration; 1B-AP-16 / 2-AP-18)
25. A quiz written by your whole class | a quiz written by one expert (crowdsourcing; 2-IC-22)
26. Text with emojis only | text with words only (encoding, culture; 1B-IC-18 / 2-DA-07)
27. A screen reader reads every sign to you | signs with big clear text everywhere (accessibility design; 2-IC-21)
28. A free app with ads that watch you | a paid app with no ads (data as payment; 2-IC-23)
29. Code that anyone can copy and improve | code that stays secret (open source; 1B-IC-21 / 2-AP-16)
30. Fix the school wifi yourself | wait for the technician (troubleshooting confidence; 1B-CS-03)

All options are ≤ 60 chars, contain no brands, digits, names or URLs, and are kid-safe. Item 28 avoids "spy": "watch
you" passes the filters. Translations follow the existing WYR process (`node scripts/wyr-bank.js`, pack version without
digit runs, seed).

### 3.8 Builder capstone

**Planning sheet** (print page + three `question` steps; 1B / 2 columns): Title (no names) · Who is it for (a user type
from 6.2 or "a 2nd grader") · What they need (one sentence) · Three features · 1B: storyboard of three screens (draw) /
2: three user stories ("As a …, I want …, so that …") · Parts list (decomposition: screens, rules, score, sounds) ·
2: who-does-what-by-when (three rows) · Credits I will need (from 6.3) · One "have you thought about" note from a partner.

**Rubric** (0-3 per line: 0 missing, 1 attempted, 2 meets, 3 exceeds; marked on the build step and the 7.1/7.3/7.4
question steps; the ids are what the standards view counts as *Applied*):

| Line | 1B id | 2 id | 3 looks like |
|---|---|---|---|
| Plan: user named, features and storyboard/user stories complete, partner note used | 1B-AP-13 | 2-AP-15 (user needs) | plan changed after the partner note, and the change is visible in the game |
| Decomposition: parts list matches what was built | 1B-AP-11 | 2-AP-13 | parts built in the order planned; each part testable alone |
| Roles / timeline: roles rotated (1B) / timeline kept and updated (2) | 1B-AP-16 | 2-AP-18 | evidence of three roles / three milestones ticked with dates |
| Build on existing work with credit: template or remix named; credits line present in the game's description | 1B-AP-12, 1B-AP-14 | 2-AP-16 | credits name every source (kit art, template, level code) in the lesson's format |
| Testing: play-test notes exist; at least one change made because of them | 1B-AP-15, 1B-IC-20 | 2-AP-17, 2-AP-15 | change justified with tester ratings (2) / two testers' notes (1B) |
| Explain: demo script names a choice and a reason; (2) about-text documents how the game is organised | 1B-AP-17 | 2-AP-19 | reason refers to the user's need; (2) documentation would let a classmate change the game |
| 2 only: refine from data: ratings before/after the change | — | 2-DA-09 | second round of ratings recorded |
| 2 only: many contributors: three testers' feedback used | — | 2-IC-22 | feedback from a tester outside the team |

**Peer play-testing protocol** (7.3): groups of three; three rounds of 7 minutes; roles **Player** (plays without help),
**Watcher** (the maker, silent, notes where the player hesitates), **Note-taker** (fills the form). Form = a `question`
step per tester with sentence starters "I liked… / I wonder… / I got stuck at…" and (2) two digits 1-5 "fun" and "fair".
Rules on the print card: be specific, be kind, say what, not who; never type a name; the maker says "thank you" only.

**Class-sharing safety**: hand-in publishes at `class` to this class only (never wider); a clean static scan is instant,
a flagged version waits in the admin queue and the teacher is told to hand in at the *start* of 7.3; teachers can remove
or restore a class game from the Games tab; titles/descriptions pass `textfilter.cleanText` (no names, contacts, links);
schools with `publishing: 'school'` keep games inside the school for good; there is no in-game chat and testers' words
only reach the maker through the teacher-visible question step; the kit's attribution of its own art is automatic and
the lesson's credits format never includes a classmate's name (the level code stands in for it).

**Capacity**: a 30-student 7.2 session is ≈ 240 Builder turns, beyond the free site-wide pool (§6). The program page
shows a "Before the capstone" checklist: school plan active (seats ≥ class size), builder enabled for the class, two
sessions booked, login cards printed (1 h idle sessions), 7.3 hand-in at the start.

---------------------------------------------------------------------------------------------------------------------------

## 4. Assessment and tracking

### 4.1 Exit tickets (the mastery signal)

- Every lesson except 7.2 ends with **3 auto-marked items + 1 explain item**. Auto items live in a `quiz` lesson step
  made from the lesson's exit set at materialisation (`addQuizStep`); each item's `cat` is one CSTA id. The explain item
  is a `question` step (free text ≤ 3000, teacher-reviewed) whose rubric line (0-2) is printed on the lesson's print page.
- Marking data that exists today: `step_progress.marks` ('1/0/-' per item, aligned to the snapshot's item order), `score`
  = % right, `label = 'quiz'`, `answer` for the question step, `feedback`/`reviewed_at` for the review.
- What is missing for a per-standard roll-up: the snapshot drops `cat` (lessons.js:234), so the marks cannot be
  attributed to ids. Fix: keep `cat` in `lesson_steps.items` (and `secs`), and in `classlive-results.itemRow` for live
  runs (§4.4). With that, item accuracy per id per student is a join over `step_progress.marks` × `items[i].cat`.
- Teacher marks on explain items and rubric lines: `review()` today stores text feedback only. Add an optional integer
  `mark` (0-3) to the review form/API, stored in `step_progress.marks` for question/build steps (a one-char string per
  rubric line, e.g. `"2"` for explain, `"3/2/3/1/2/3"` for the capstone build step in rubric-line order). The lesson
  catalogue defines the rubric lines (ids per line) so the view can attribute each mark.
- Mastery thresholds (configurable per school later; fixed for v1): a student *meets* a standard when ≥ 2 of 3 auto items
  on the most recent exit ticket tagged with it are right **or** the rubric line ≥ 2; a class *meets* when ≥ 80% of
  students meet. The view shows the numbers, not only the chip, so a district can apply its own rule.
- Hosting the exit ticket live instead (shared devices): a 3-item Quest Race from the same set; the marks land in
  `live_run_scores.marks` with `live_runs.items[i].cat` kept (after the fix) and the view counts them the same way.
- Requires `LIVE_HOMEWORK=1` (quiz steps are gated by it). Recommendation: a separate `QUIZ_STEPS` flag defaulting on,
  or make the CS Quest materialiser refuse to run with a clear message when quiz steps are off.

### 4.2 The per-class "Standards" view (`/class/:id/standards`, new class tab)

Rows: every CSTA id whose lesson is assigned to the class (filtered by the band of the assigned lessons; a toggle shows
all 44). Columns:

| Column | Source (today / after the P1 changes) | Meaning |
|---|---|---|
| Standard | `server/standards/csta.js` (ships `csta.json`: id, concept, statement, practices) | id, short statement, concept, practice codes, band |
| Lessons | `lesson_steps.standards` (new) joined through `class_lessons` | which assigned lessons tag it; open/due state |
| Practised | `step_progress.status='done'` on steps tagged with the id (game/text/build) + `live_run_scores` on runs whose set items carry the id | "22 of 28 students" |
| Checked | `step_progress.marks` × `items[i].cat` and `live_run_scores.marks` × `live_runs.items[i].cat` | class accuracy on tagged items, item count, students assessed, date of latest check |
| Applied | rubric marks (new `mark` on review) on question/build steps whose rubric line carries the id | mean 0-3, students marked |
| Status | computed | Not yet · Assigned · Practised · Checked · Meets (≥ 80% of students meet) |

Per-student drill-down (teacher only): student × standard grid with the three tiers; links to the gradebook cell. CSV
(`/class/:id/standards.csv`, formula-injection-safe like `progress.csv`). Printable **coverage report** for a principal:
aggregate only (no student names: lessons taught with dates, items asked per standard, class accuracy, rubric means),
`.printdoc` + `data-print`. Privacy: an education record like the gradebook; teacher/school-admin only, never on
projectors or results pages; any new per-student table honours `onClassLeave`/`onAccountMerge` deletion hooks.

Program-level coverage map (no class data): `/teach/cs-quest/coverage` and the print page, generated from the catalogue
by the same module the unit test uses (§4.3), listing for each of the 44 ids: lessons (1B / 2), game levels, exit-ticket
item count, rubric lines, practices, and "extension only" notes (5.4 at 1B).

### 4.3 Keeping the map honest (CI)

`tests/unit/cs-quest-catalogue.test.js`: for every id in `csta.json` with level 1B or 2: (a) at least one lesson of that
band lists it as primary; (b) at least one exit item of that band has `cat` = id; (c) if the id's practice set includes
P5 and the id is in U7's list, a rubric line carries it; (d) every `cat`, `standards` and `std` value in the catalogue
and the four games' level data is a real id; (e) every lesson's `minutes` sum to 45 and its steps fit `L.cleanStep`
limits; (f) every game level listed in a lesson exists in that game's data with the same band. `scripts/cs-quest-
coverage.js` prints the map as Markdown/HTML from the same data for the docs and the print page.

### 4.4 What must be added to the platform (ordered)

**P0 — needed to run the program at all**
1. Catalogue + materialiser + routes (`seed-lessons/cs-quest/*.json`, `server/services/lesson-templates.js`,
   `POST /api/lessons/from-template/:key`, `/teach/cs-quest`, `/teachers/cs-quest`): lessons via `L.createLesson/addStep`,
   warm-up and exit sets via `SETS.createSet`, exit `quiz` steps via `addQuizStep`, lesson `copied_from` + new
   `template_key`/`template_version` columns so updates can be offered.
2. `BRB.params` passthrough (`?o=` allow-listed, ≤ 40 chars, signed into the token, `init.params`, frozen `BRB.params`;
   `lesson_steps.options TEXT` appended by `routes/progress.js:254`; docs/sdk.md; `sdk-protocol`/`visibility` tests).
   Without it the chapter lock does not exist and a gradebook cell may hold the wrong chapter (fallback: setup card +
   lesson text; the label still names the chapter, so the view can at least ignore mismatched labels).
3. Fix the lesson "Host live" deep link for mode games (`routes/progress.js:286` → `liveGameOf` → `?mode=`).
4. Quiz steps on by default for CS Quest (`LIVE_HOMEWORK` or a new `QUIZ_STEPS` flag) and `copyLesson` regenerating quiz
   steps from `set_id` (lessons.js:191).
5. WYR `tech` topic (13 data files, `ui.json`, `TOPICS`, `CATS`, rebuild, seed) and a `?wyr=tech` preselect on `/live`
   (routes/live.js:166-172, views/live.js:477-484) so the lesson button lands on the right topic.
6. Four games shipped per `map-games.md` §1.5 lists, covers, OG, LEARNING/HUBS, `TEACHER_GAMES`.
7. Printable lesson page (`/teach/cs-quest/lessons/:key/print`, `.printdoc`, `data-print`, `/js/print.js`).

**P1 — needed for the standards evidence**
8. `lesson_steps.standards TEXT` (comma list) + migration; set by the materialiser; `games.standards` optional.
9. Keep `cat` (+ `secs`) in quiz snapshots (lessons.js:234) and in saved live items (classlive-results.js:80).
10. Review `mark` (0-3 per rubric line) on question/build steps via `review()`; gradebook shows it.
11. `server/standards/csta.js` + the class Standards tab, drill-down, CSV, coverage report, `school.classTabs.standards`
    and all view strings in 13 languages; `tests/unit/progress.test.js` cases.
12. The catalogue CI test (§4.3).

**P2 — nicer, not blocking**
13. `brb:progress` message (SDK → play.js TYPES → route → `step_progress_events`) for per-level evidence.
14. Class **level shelf** for Robo Route's Level Maker: a numeric-only level payload (tiles, entities, palette, par) sent
    through a new validated message, stored per class, listed by code; no free text, so no `cleanText` need; the game
    reads the shelf through `init`.
15. Template on build steps (`lesson_steps.template` → `templateHtml(key)` in routes/progress.js:307).
16. Survey mode for live sets (`scoring:'none'`, results = counts) so 3.3 does not depend on WYR Live.
17. A `computing` bank subject for free-play practice (needs the per-subject relaxation in `live-bank.test.js:121`).

---------------------------------------------------------------------------------------------------------------------------

## 5. How teachers reach it

### 5.1 Pages

- **`/teachers/cs-quest`** (public, indexable; `routes/teachers.js` `page()` with `seo{}`, `LOCALIZED`, `sitemapEntries`,
  `seo.test.js PUBLIC`, `how.js STEPS.teachersCs` + `how-shots --only cs`): hero "Computer science for grades 3-8, mapped
  to the CSTA standards", the four game cards (`launchGame` so a signed-out teacher can try a chapter), the 7 units with
  lesson counts, a **coverage map** teaser (44 of 44 ids; link to the full map), "What you need" (devices, projector,
  45 minutes, a free teacher account; the capstone needs a school plan — stated without a price, the how-shots guard
  forbids prices), FAQ with JSON-LD, a `Course`/`LearningResource` graph with `educationalAlignment` entries naming
  "CSTA K-12 CS Standards 2017" and each id (search engines read English). Copy under `teachers.cs.*` (uncounted prefix,
  English-first with `el()`); no child names ever. CTA: "Add CS Quest to my library" → sign in → `/teach/cs-quest`.
- **`/teach/cs-quest`** (signed-in staff; `requireUser`, `isSchoolStaff`, `active:'classes'`): band toggle (Grades 3-5 /
  Grades 6-8), unit accordions, lesson cards with buttons: **Add to my library** (one lesson), **Add the whole unit**,
  **Add the whole band** (creates the folder "CS Quest (Grades 3-5)", 27 lessons, 54 sets); after adding: **Assign to
  class** (opens the existing assign form with the lesson pre-picked and the unit name pre-filled; "Assign unit" asks for
  a start date and a cadence (every school day / twice a week / weekly) and computes `opens_at` per lesson in the school
  zone), **Start warm-up live** (`/live?mode=quest-race&set=<setId>&class=<cid>`; for 6.1 `/live?mode=wyr&wyr=tech
  &class=<cid>`), **Open the game here** (teacher preview: `/play/<slug>?o=ch.loops.band.2` once `BRB.params` exists),
  **Print** (`/teach/cs-quest/lessons/<key>/print`), **Standards** (the program coverage map). A "Before you start"
  banner lists quiz steps enabled, a class that the teacher teaches (live hosting needs it), and the capstone checklist.
- **Lesson pages for students** are the existing `/class/:cid/lessons/:clid` (steps: warm-up note, Play at chapter,
  Talk about it, Exit ticket quiz, Explain question); nothing new to build there except the chapter param on Play.
- **Teacher lesson print page**: title, band, ids with statements, practices, I can, vocabulary, materials, the
  minute-by-minute plan, differentiation, unplugged fallback, teacher notes and misconceptions, the exit ticket with
  answers and the explain rubric line, printables (plan card, role cards, audit sheet, cipher wheel, planning sheet,
  rubric) — all from the catalogue JSON by `template_key`, never from steps (students see steps).
- **Class Standards tab** (§4.2) in `classHeader` tabs, next to Progress.
- Links from `/teach` (a "CS Quest" card next to Lesson library and Make a game), the lesson library's `libtools`
  ("Browse CS Quest"), the `/learn/computer-science-games` hub and each game page ("Teachers: lesson plans for this game").

### 5.2 The library mechanism (what "seeded template lessons" means here)

There are no official lesson rows and every lesson must belong to a school and an owner, so CS Quest ships as a **repo
catalogue** (`seed-lessons/cs-quest/<band>/<unit>.<n>.json`, plus `sets.json`, `wyr-tech-prompts.json`, `rubrics.json`)
and a **materialiser** that copies a lesson into the *teacher's own library* (owner = the teacher, school = their staff
school): `createLesson` (title "CS Quest 1B.3 · Round and Round", subject "Computer science", grade "Grades 3-5",
summary, objectives = the I-can lines + ids), `addStep` per step (text/game/question; game steps resolve `gameSlug` →
published official game and carry `options` for the chapter param and `standards`), `SETS.createSet` for the warm-up and
exit sets (title "CS Quest 1B.3 warm-up", subject, grade; items with `cat`), `addQuizStep` from the exit set, a folder per
band, and `template_key/template_version` on the lesson. From then on everything is the teacher's: edit (edits never
flow back; "Reset to the CS Quest version" re-materialises a fresh copy and keeps student work on the old one),
assign, gradebook, live, copy to a colleague via "Shared". Re-adding an existing key asks "You already have this lesson:
open it / add another copy". Quiz steps survive teacher copies once `copyLesson` regenerates them from `set_id` (P0.4).
A school admin can add lessons but can only host live for classes they teach (existing rule; the page says so).

### 5.3 Lesson step content rules the catalogue obeys

Steps are student-facing, plain text ≤ 4000, no links/markdown; titles ≤ 100; a lesson ≤ 40 steps (CS Quest uses 5-7);
minutes 0-240 and summing to 45; `grade` written as "Grades 3-5"/"Grades 6-8" (≤ 12 chars); game steps only for
published official games (the seed order guarantees it); build-step body ≤ 300 meaningful chars at the front (Studio
prefill); question steps for the explain item and the capstone sheets; no step ever contains a student's or teacher's
name, a URL, an email or a 7-digit run.

---------------------------------------------------------------------------------------------------------------------------

## 6. Risks and open questions

1. **No param passthrough today.** Without `BRB.params` the chapter lock is impossible; a lesson step's gradebook cell
   can contain any chapter the student chose. Mitigation: the label names the chapter so the standards view can ignore
   mismatches and the setup card remembers the last chapter; but airtight evidence needs P0.2.
2. **Quiz steps are gated by `LIVE_HOMEWORK` (off) and lose `cat` on snapshot and items on copy.** The exit-ticket
   design depends on P0.4 and P1.9; until then exit tickets must be hosted live (marks exist, `cat` still lost) or paper.
3. **AI budget for the capstone.** 30 students × ~8 turns ≈ $35-100/h against a $5/day site-wide pool: the free pool
   switches the Builder to the mock for everyone on the site. A school plan (≥ 25 seats) or a raised budget is required;
   the program page says so (without prices). Builds also queue through one runner: plan two sessions.
4. **Scanner and content.** Any `//host.tld` string (even in comments), 7+ digit runs, "type your password", emails,
   profanity in any string literal (all languages) fail the seed and abort every boot. Packet Post and the phishing cards
   are the risk; the rules in §3.3 (icons + words, house numbers, tiles) are the mitigation; a pre-commit run of
   `scanVersion` on the four files is in the build checklist.
5. **13-language in-game text.** Each game's strings (hints ×3 tiers × ~25 levels, learn cards, UI) must exist in all 13
   locales with equal `{slots}` (seed unit tests enforce it): roughly 400-700 strings per game to translate. Lesson and
   set content stays English. Budget for translation, or ship a band-limited string set first.
6. **Fit audit with a block palette.** Five sizes, title and play, every control ≥ 40 px (28 inside `data-fit-dense`),
   no overlap: the program column on a 390×844 phone is the hardest case; the design caps visible slots and uses a
   scroller with ≤ 8 buttons before scrolling. Robo Route needs an early layout spike.
7. **Level sharing.** Nothing a kid makes can reach another kid from inside a game; the Level Maker's class shelf is
   platform work (P2.14). Until then "share" is physical (pass the tablet, projector), which 2.3 is written to allow.
8. **Live hosting rights.** Class rooms need the host to *teach* the class; a coach or admin running CS Quest for several
   classes cannot host the warm-ups. Open question: a "co-teacher" membership flow for CS specialists.
9. **Sessions.** School student sessions end after 1 h idle / 10 h: a multi-day capstone means re-login with cards; a
   deploy during class ends live rooms. Open question: a "class time" deploy freeze.
10. **Survey collection (3.3) rides on WYR Live.** It works, but counts must be read from the results page and typed into
    Data Detective; a survey mode for sets (P2.16) or a `brb:poll`-style class tally would make it one step.
11. **Capstone standards honesty.** The AI Builder writes code, so control-structure standards are evidenced by Robo
    Route only; the coverage map says so. Open question: does Studio expose `CONFIG` editing to kids in a way that could
    honestly evidence 2-AP-11 (variables)? Not claimed until verified.
12. **Standards versioning.** `csta.json` is the 2017 set (practice codes partly unconfirmed per its notes); CSTA has a
    revision under way and several states (Colorado 2024, Maryland) key their own ids to it. Keep ids in data
    (`server/standards/csta.js` loading the JSON), so a 2024/2025 or state crosswalk is a data file, not a code change.
    Open question: ship a state crosswalk table (CA, TX, VA, CO) in v1?
13. **Mastery rule.** "2 of 3 items" and "80% of students" are v1 defaults; districts differ. The view shows raw numbers;
    open question: per-school thresholds in `schools.settings`.
14. **Privacy.** Per-student standards data is an education record (legal-review items 42-43 pattern): teacher/school
    only, deletion hooks, no projector/results exposure, no export beyond the teacher's CSV. The principal's coverage
    report is aggregate-only by design.
15. **Time realism.** 45 minutes with login (cards), a live warm-up and a quiz step is tight in grade 3; every lesson has
    a "short version" note (skip the warm-up, 2 exit items) and the unplugged fallback; a field test with two classes per
    band before the public launch is recommended.
16. **Game scope.** Four kit games with custom DOM widgets (palette, tables, routing, SVG devices), ~25 levels × 2 bands
    each, deterministic verdicts and test hooks: roughly Code Isle-sized work each. Order of build: Robo Route (U1-U2,
    half the lessons), then Packet Post, Inside the Machine, Data Detective; lessons for a unit can ship only when its
    game is in `SEED_GAMES`.

---------------------------------------------------------------------------------------------------------------------------

## Appendix A — Coverage map (every 1B and level-2 id → primary lesson(s), practising level(s), checks)

| Id | Primary lessons | Game levels (practised) | Exit items (checked) | Rubric (applied) |
|---|---|---|---|---|
| 1B-CS-01 | 5.1 | IM parts 1-6 | 5.1 ×3 | — |
| 1B-CS-02 | 5.2 | IM system 1-5 | 5.2 ×3 | — |
| 1B-CS-03 | 5.3 | IM help 1-6 | 5.3 ×3 | — |
| 1B-NI-04 | 4.1, 4.2 | PP packets 1-6, rules 1-5 | 4.1 ×3, 4.2 ×3 | — |
| 1B-NI-05 | 4.3, 4.4 | PP lock 1-6, codes 1-4 | 4.3 ×3, 4.4 ×3 | — |
| 1B-DA-06 | 3.1, 3.3 | DD sort 1-5, survey 1-3 | 3.1 ×3, 3.3 ×2 | — |
| 1B-DA-07 | 3.2, 3.3 | DD predict 1-5, survey 3 | 3.2 ×3, 3.3 ×1 | — |
| 1B-AP-08 | 2.2 | RR opt 1-5 | 2.2 ×3 | — |
| 1B-AP-09 | 1.5 | RR vars 1-6 | 1.5 ×3 | — |
| 1B-AP-10 | 1.1, 1.2, 1.3, 1.4 | RR seq 1-6, loops 1-6, cond 1-7, events 1-5 | 1.1-1.4 ×12 | — |
| 1B-AP-11 | 1.6, 7.1 | RR funcs 1-5 | 1.6 ×3 | Decomposition |
| 1B-AP-12 | 2.3, 7.2 | RR maker (remix) | 2.3 ×2 | Build on existing work |
| 1B-AP-13 | 7.1 | planning sheet | 7.1 ×2 | Plan |
| 1B-AP-14 | 6.3, 7.2 | credits writer | 6.3 ×2 | Build on existing work |
| 1B-AP-15 | 2.1, 7.3 | RR debug 1-6 | 2.1 ×3, 7.3 ×1 | Testing |
| 1B-AP-16 | 2.3, 7.1 | role cards (maker, capstone) | 2.3 ×1 | Roles |
| 1B-AP-17 | 2.2, 7.4 | share-out, demo script | 2.2 explain, 7.4 ×2 | Explain |
| 1B-IC-18 | 6.1 | WYR tech | 6.1 ×3 | — |
| 1B-IC-19 | 6.2 | accessibility audit | 6.2 ×2 | — |
| 1B-IC-20 | 6.2, 7.3 | class vote, play-test | 6.2 ×1, 7.3 ×1 | Testing |
| 1B-IC-21 | 6.3 | License to Use board | 6.3 ×1 | — |
| 2-CS-01 | 5.1 | IM parts 1-5 (Design Lab) | 5.1 ×3 | — |
| 2-CS-02 | 5.2 | IM system 1-5 (Build-a-Gadget) | 5.2 ×3 | — |
| 2-CS-03 | 5.3 | IM help 1-6 | 5.3 ×3 | — |
| 2-NI-04 | 4.1, 4.2 | PP packets 1-6, rules 1-6 | 4.1 ×3, 4.2 ×3 | — |
| 2-NI-05 | 4.3 | PP lock 1-6 | 4.3 ×2 | — |
| 2-NI-06 | 4.4 | PP codes 1-7 | 4.4 ×3 | — |
| 2-DA-07 | 5.4 | IM bits 1-6 | 5.4 ×3 | — |
| 2-DA-08 | 3.1, 3.3 | DD sort 1-6, survey 1-4 | 3.1 ×3, 3.3 ×2 | — |
| 2-DA-09 | 3.2, 7.3 | DD predict 1-5 (Model Lab) | 3.2 ×3 | Refine from data |
| 2-AP-10 | 1.1 (5.3 builds toward) | RR seq 3-6 (Plan card) | 1.1 ×2 | — |
| 2-AP-11 | 1.5 | RR vars 1-6 | 1.5 ×3 | — |
| 2-AP-12 | 1.2, 1.3, 1.4 (1.1 builds toward) | RR loops 1-6, cond 1-6, events 1-6 | 1.1 ×1, 1.2-1.4 ×9 | — |
| 2-AP-13 | 1.6, 7.1 | RR funcs 5-6 | 1.6 ×1 | Decomposition |
| 2-AP-14 | 1.6 | RR funcs 1-4 | 1.6 ×2 | — |
| 2-AP-15 | 7.1, 7.3 | user interview, play-test | 7.3 ×2 | Plan, Testing |
| 2-AP-16 | 2.3, 6.3, 7.2 | RR maker remix, credits | 2.3 ×1, 6.3 ×1 | Build on existing work |
| 2-AP-17 | 2.1, 2.2, 7.3 | RR debug 1-6, opt 1-5 | 2.1 ×3, 2.2 ×2 | Testing |
| 2-AP-18 | 2.3, 7.1, 7.4 | timeline card | 2.3 ×2, 7.1 ×2 | Timeline |
| 2-AP-19 | 2.2, 7.4 | RR opt 3-5 (notes) | 2.2 ×1, 7.4 ×2 | Explain |
| 2-IC-20 | 6.1 | WYR tech, T-chart | 6.1 ×3 | — |
| 2-IC-21 | 6.2 | DD fair 1-4, audit | 6.2 ×3 | — |
| 2-IC-22 | 3.3, 7.3 | WYR survey, three testers | 3.3 ×1 | Many contributors |
| 2-IC-23 | 4.3, 6.3 | PP lock 7 (Share or Shield) | 4.3 ×1, 6.3 ×1 | — |

44 of 44 ids have a primary lesson and at least one exit item in their band. Extension-only: Inside the Machine ch 4 at
grades 3-5 (no 1B id claimed).

## Appendix B — Catalogue JSON shape (what the materialiser and the CI test read)

```json
{
  "key": "1B.1.2", "band": "1B", "unit": 1, "n": 2,
  "title": "Round and Round (loops)", "subject": "Computer science", "grade": "Grades 3-5",
  "summary": "…≤600", "iCan": ["…"], "standards": ["1B-AP-10"], "buildsToward": [], "practices": ["5.2"],
  "vocabulary": ["loop", "repeat", "pattern"], "materials": ["device per student or pair", "projector"],
  "steps": [
    { "kind": "text", "title": "Warm-up", "body": "…", "minutes": 5, "set": "U1-W2" },
    { "kind": "game", "title": "Robo Route: Loops", "gameSlug": "robo-route", "options": "ch.loops.band.1B.lock.1",
      "standards": ["1B-AP-10"], "minutes": 25, "body": "Play chapter 2…" },
    { "kind": "text", "title": "Talk about it", "body": "…", "minutes": 8 },
    { "kind": "quiz", "title": "Exit ticket", "set": "U1.2-X", "minutes": 5 },
    { "kind": "question", "title": "Explain", "body": "Where did you use a loop and why there?", "minutes": 2,
      "rubric": [{ "id": "1B-AP-10", "max": 2, "levels": ["none", "names the place", "names place and reason"] }] }
  ],
  "sets": { "U1-W2": { "title": "CS Quest 1B.2 warm-up", "items": [ { "q": "…", "choices": ["…"], "answer": 0, "secs": 15, "cat": "1B-AP-10", "kind": "recall" } ] },
            "U1.2-X": { "title": "CS Quest 1B.2 exit ticket", "items": [ … ] } },
  "teacher": { "plan": [["0-5", "…"], ["5-8", "…"]], "differentiation": "…", "unplugged": "…", "notes": "…",
               "misconceptions": ["…"], "answerKey": {…}, "printables": ["plan-card"] }
}
```
