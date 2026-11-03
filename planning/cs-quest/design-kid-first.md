# CS Quest — program design, KID-FIRST angle

Designer angle: **the games are the curriculum.** Every CSTA 1B (grades 3-5) and level 2 (grades 6-8) standard is
practised inside one of four replayable games, a live set, a Would-You-Rather round or the Builder capstone; lessons
are thin 45-minute wrappers that get kids into the right chapter fast and out with a 90-second "case closed" card.
Assessment is play data plus one short reflection, never a worksheet.

Ground truth used (not re-derived here): `map-games.md` (kit 1.1.2, scanner, frame, fit audit, progress plumbing),
`map-teach.md` (lessons/classes/live/teacher pages/Builder limits) and `csta.json` (21 standards at 1B, 23 at level 2).
Where this design needs something the platform does not have, it says so and names the smallest addition.

Contents
1. Name and branding
2. The shared world (why kids come back)
3. Standards coverage matrix
4. Scope and sequence: 7 units, 24 lessons, each in a 1B and a 2 variant
5. Game designs: Robo Route, Data Detective, Packet Post, Inside the Machine
6. Live quiz sets, the Would You Rather "tech choices" set, the Builder capstone
7. Assessment and tracking
8. How teachers reach it
9. Platform additions this design asks for (ranked)
10. Risks and open questions

---------------------------------------------------------------------------------------------------------------------------

## 1. Name and branding

**Keep "CS Quest".** It matches the house pattern (Atlas Quest, Quest Race: two words, a plain noun plus Quest), it is
what US teachers type into a search box ("CS" is the K-8 word in the CSTA documents, in state standards and in most
district scope-and-sequence sheets), and it leaves "Code" free (Code Isle already owns it). Rejected: "Byte Quest"
(cute, unsearchable), "Computer Science Quest" (too long for a card title; `games.title` is 60 chars but the lesson
library truncates), "Oomba CS" (reads like a product tier).

Kid-facing frame inside the program: **the Byte Crew**, four characters who each own a game and appear on the others'
title screens as cameos (cheap cross-promotion, no shared save needed):

| Game | Crew member | Job | Kit look |
|---|---|---|---|
| Robo Route | **Bolt** | a courier robot that only does exactly what it is told | custom SVG robot (no kit robot species); palette tokens via `Oomba.color` |
| Data Detective | **Dot** | a detective with a magnifying glass who never guesses without evidence | `Oomba.char` fox in a trench coat (`dress` pack) |
| Packet Post | **Pim** | a postal pigeon who carries packets through Netville | `art-animals` bird + `art-props` mailbox/houses |
| Inside the Machine | **Gizmo** | a workshop mechanic who opens up devices | `Oomba.char` raccoon with goggles (`dress` pack) |

Shared visual language across the four: one star rule (1 star = solved, 2 = solved within par, 3 = par on the first
run with no level-3 hint), one "Case closed" end card layout (`Oomba.ui.win` with a two-question reflection on top),
one chapter map screen pattern (DOM in `Oomba.ui.root()`), the kit `style-bold` pack for titles. Teachers see the
program badge "CS Quest · CSTA 1B/2" on the teacher page and lesson cards (site chrome, so 13 languages); kids never see
standards codes.

Naming rule for everything kid-facing: two short English words, no digits (scanner phone rule, OG/cover scripts),
no brand names of real companies or products (the Impacts unit talks about "a video app", "a map app", "a smart
speaker", never a trademark; that also keeps the live sets and WYR items safe in every locale).

---------------------------------------------------------------------------------------------------------------------------

## 2. The shared world (why kids come back)

Design goals, in priority order: (1) a kid who has 8 minutes left in a lesson can start, finish and feel something;
(2) a kid who finishes early has a reason to replay (stars, a harder band, a make-and-share mode); (3) nothing in the
loop depends on a teacher being present; (4) everything works on a 2019 iPad in portrait with one finger.

**Progression per game (saved per player in `BRB.storage`, 450 KB; `Oomba.save` only for settings-like bits):**
- Chapters unlock in order but the **first level of every chapter is always open** (a teacher can send the class to
  chapter 5 on day one; the game never blocks a lesson). Later levels in a chapter unlock one at a time.
- Stars: 1/2/3 as above. A chapter's crown appears at full stars; crowns recolour the crew member's outfit (purely
  cosmetic, drawn from `dress` pack variants or our own SVG layers, no cross-game currency because saves are per game).
- **Band is a toggle, not a lock.** "Explorer" (3-5) and "Pro" (6-8) are two block sets / two case decks over the same
  maps. A 4th grader who finishes Explorer can try Pro; a 7th grader who struggles can drop to Explorer and still earns
  stars (shown as silver instead of gold so the gradebook label can tell them apart).
- Daily "Crew Challenge": one deterministic level per day per game (seeded from the UTC day number through
  `Oomba.rand`, so the whole class gets the same one) with its own 3-star card. Replay hook that costs no content.
- **Make-and-share**: each game ends with a maker chapter (Level Maker, Case Maker, Postmaster, Gadget Garage).
  Sharing is by a **6-digit code** shown in the game and typed by a classmate in the same game (digits only, under the
  7-digit phone rule; the code *is* the level, see §5.1.9: a compact base-10 encoding of a small grid, not a lookup, so
  no platform storage or text filter is involved and nothing a kid types can reach another kid as text). A level
  carries no name and no words: it is a map, a block limit and a par. This is the only sharing that exists today
  without platform work; the Builder capstone is where kids share named, playable games (class visibility, scan,
  teacher moderation, `map-teach.md` §5.3).
- Replay sugar the kit gives for free: `stage.burst('confetti')` on 3 stars, `Oomba.juice.pop` on every placed block,
  `Oomba.music('calm')` in editors, `Oomba.say` read-aloud of every instruction card (captions on by default).

**What "the standards are embedded in play" means concretely:** each level record carries `csta: ['1B-AP-10']` (and
`csta2: ['2-AP-12']` where the Pro variant practises a different standard). Solving the level is the evidence. The
exit ticket is two taps inside the end card (§7.1). There is no quiz screen in any of the four games; quizzes live in
Oomba Live where they are a race with classmates, which kids experience as a game.

---------------------------------------------------------------------------------------------------------------------------

## 3. Standards coverage matrix

Every id in `csta.json`, where it is **practised in play** (P), **discussed** (D: live set, WYR, class talk) and
**assessed** (A: exit ticket, rubric, live marks). Lesson codes are from §4; game chapters from §5.

### Level 1B (grades 3-5)

| CSTA id | Statement (short) | Practised (P) | Discussed (D) | Assessed (A) |
|---|---|---|---|---|
| 1B-CS-01 | internal/external parts form a system | Inside the Machine ch.1 Parts Party | L5.1 talk | L5.1 exit card; U5 live set |
| 1B-CS-02 | model hardware + software together | Inside the Machine ch.2 Team Up (model builder) | L5.2 | L5.2 exit card (build a 4-box model) |
| 1B-CS-03 | troubleshooting strategies | Inside the Machine ch.3 Fix-It Shop | L5.3 | Fix-It cases solved; U5 live set |
| 1B-NI-04 | packets, routing, reassembly | Packet Post ch.1 Break It Up, ch.2 Find a Path | L4.1, L4.2 | ch.1/2 stars; L4.1 exit card |
| 1B-NI-05 | cybersecurity problems, protecting info | Packet Post ch.4 Lock the Mailbox, ch.5 Phish or Friend, ch.6 Secret Ink (Explorer) | L4.3, L4.4, WYR tech set | U4 live set; L4.3 exit card |
| 1B-DA-06 | organise/present data to support a claim | Data Detective ch.1 Sort It Out, ch.2 Chart Chasers | L3.1 | case stars (claim + chart check) |
| 1B-DA-07 | data for cause/effect, prediction | Data Detective ch.3 Pattern Predictors, ch.4 Dirty Data (Explorer) | L3.2, L3.3 | ch.3 stars; L3.2 exit card |
| 1B-AP-08 | compare and refine algorithms | Robo Route ch.8 Best Route (two-solution compare) | L1.1, L2.2 | Best Route stars (par) |
| 1B-AP-09 | variables store and modify data | Robo Route ch.5 Variables (Explorer) | L1.4 | ch.5 stars; L1.4 exit card |
| 1B-AP-10 | sequences, events, loops, conditionals | Robo Route ch.1-4 | L1.1-L1.3 | ch.1-4 stars; U1 live set |
| 1B-AP-11 | decompose problems | Robo Route ch.6 Functions (Explorer: "tricks"); L7.1 planning sheet | L1.5, L7.1 | L7.1 planning sheet rubric row |
| 1B-AP-12 | modify/remix existing programs | Robo Route ch.7 Bug Hunt remix levels, ch.9 Level Maker "remix a classmate's code"; capstone remix | L2.3, L7.2 | capstone rubric row |
| 1B-AP-13 | iterative planning with others' perspectives | L7.1 planning sheet + "ask a tester" step; Robo Route ch.9 playtest loop | L2.3, L7.1 | planning sheet rubric |
| 1B-AP-14 | intellectual property, attribution | capstone credits screen; Data Detective ch.2 "sources" card | L6.3, L7.2 | capstone rubric row (credits) |
| 1B-AP-15 | test and debug | Robo Route ch.7 Bug Hunt | L2.1 | ch.7 stars; U2 live set |
| 1B-AP-16 | varying roles when collaborating | L2.3 and L7.x pair roles (driver/navigator/tester/note-taker cards) | L7.1 | teacher observation tick on rubric |
| 1B-AP-17 | describe choices (comments, demos) | Robo Route Pro "Plan" notes; capstone "show it" demo | L7.3 | capstone demo rubric row |
| 1B-IC-18 | technologies that changed the world | WYR tech set (history items), Data Detective ch.3 "then and now" case | L6.1 | L6.1 exit card; U6 live set |
| 1B-IC-19 | improve accessibility/usability | Inside the Machine ch.5 Design Lab (Explorer briefs); capstone settings check | L6.2, L7.3 | capstone rubric row (accessibility) |
| 1B-IC-20 | seek diverse perspectives | peer play-test protocol (L7.3); Data Detective ch.7 world poll | L7.3 | play-test cards returned |
| 1B-IC-21 | public domain / creative commons, no copying | capstone asset picker (kit art only + credit line); L6.3 sort game | L6.3 | U6 live set; capstone credits |

### Level 2 (grades 6-8)

| CSTA id | Statement (short) | Practised (P) | Discussed (D) | Assessed (A) |
|---|---|---|---|---|
| 2-CS-01 | recommend device design improvements from user analysis | Inside the Machine ch.5 Design Lab (Pro briefs: redesign for a user) | L5.1, L6.2 | Design Lab brief score |
| 2-CS-02 | design projects combining hardware+software to collect/exchange data | Inside the Machine ch.2 Team Up Pro (component picker with tradeoffs), ch.6 Gadget Garage | L5.2 | L5.2 exit card; Gadget brief |
| 2-CS-03 | systematically troubleshoot | Inside the Machine ch.3 Fix-It Shop Pro (build the checklist flowchart, swap parts) | L5.3 | Fix-It Pro stars |
| 2-NI-04 | role of protocols | Packet Post ch.2 Pro, ch.3 Rules of the Road | L4.1, L4.2 | ch.3 stars; U4 live set |
| 2-NI-05 | physical and digital security measures | Packet Post ch.4 Pro (sort physical/digital, HTTPS lock, router key, backups) | L4.3 | L4.3 exit card |
| 2-NI-06 | multiple encryption methods | Packet Post ch.6 Secret Ink Pro (Caesar, keyword, pigpen, steganography, padlock keys) | L4.4 | ch.6 stars |
| 2-DA-07 | multiple encoding schemes | Data Detective ch.6 Code Breakers; Inside the Machine ch.4 Bits & Lights | L3.3 | ch.6 stars; U3 live set |
| 2-DA-08 | collect with tools, transform/clean data | Data Detective ch.1-2 Pro, ch.4 Dirty Data, ch.7 Survey Lab (poll + tally) | L3.1, L3.3 | case stars |
| 2-DA-09 | refine computational models from data | Data Detective ch.3 Pro, ch.5 Model Mechanic | L3.2 | ch.5 stars; L3.2 exit card |
| 2-AP-10 | flowcharts/pseudocode for complex problems | Robo Route Pro "Plan" tab (flowchart view, pseudocode export), ch.8 Best Route Pro | L1.1, L2.2 | ch.8 Pro stars; Plan-first levels |
| 2-AP-11 | clearly named variables, data types, operations | Robo Route ch.5 Pro (named counters/flags/lists of one type) | L1.4 | ch.5 stars |
| 2-AP-12 | nested loops, compound conditionals | Robo Route ch.2 Pro (nested), ch.3 Pro (AND/OR/NOT) | L1.2, L1.3 | ch.2/3 Pro stars; U1 live set |
| 2-AP-13 | decompose problems and subproblems | Robo Route ch.6 Pro; L7.1 planning sheet (feature tree) | L1.5, L7.1 | planning sheet rubric |
| 2-AP-14 | procedures with parameters | Robo Route ch.6 Pro (define trick with a number/colour parameter) | L1.5 | ch.6 Pro stars |
| 2-AP-15 | seek and incorporate feedback | peer play-test protocol with a "changed because" line (L7.3); Level Maker playtest loop | L2.3, L7.3 | rubric row (feedback used) |
| 2-AP-16 | incorporate existing code/media, attribution | capstone remix of a Studio template + credits; Robo Route ch.9 remix | L6.3, L7.2 | rubric row (credits) |
| 2-AP-17 | test with a range of test cases | Robo Route ch.7 Pro (program must pass 3 maps incl. an "invalid" one) | L2.1 | ch.7 Pro stars |
| 2-AP-18 | distribute tasks, keep a timeline | L7.1 team sheet (roles + 3-session timeline) | L7.1 | sheet rubric row |
| 2-AP-19 | document programs | capstone "How to play" card + in-code comments shown in Studio; Robo Route Pro notes | L7.3 | rubric row (docs) |
| 2-IC-20 | tradeoffs of technologies on activities and careers | WYR tech set; Data Detective ch.3 "jobs then and now" case | L6.1 | L6.1 exit card; U6 live set |
| 2-IC-21 | bias and accessibility in existing tech | Inside the Machine ch.5 Design Lab Pro ("who was this tested with?" briefs); L6.2 settings-panel audit | L6.2 | L6.2 exit card |
| 2-IC-22 | crowdsourcing/surveys to collaborate | Data Detective ch.7 Survey Lab (world poll + class tally); capstone class play-test survey | L3.1, L7.3 | play-test tally sheet |
| 2-IC-23 | public vs private tradeoffs | Packet Post ch.5 Phish or Friend Pro; WYR tech set | L4.3, L6.3 | U4/U6 live sets; L6.3 exit card |

Every one of the 44 ids has at least one P or D and one A. The thinnest rows (1B-AP-16, 2-AP-18: collaboration roles
and timelines) are inherently classroom behaviours; they are assessed by the printed role cards and the team sheet,
not by a game, and the teacher ticks them on the rubric.

---------------------------------------------------------------------------------------------------------------------------

## 4. Scope and sequence

Seven units, 24 lessons, 45 minutes each; every lesson ships as **two lesson rows** in the catalogue (`cs-1b-<code>` and
`cs-2-<code>`, grade `Grades 3-5` / `Grades 6-8`, 10 chars each, inside the 12-char `lessons.grade` limit). Teachers add
a whole unit or one lesson to their library (§8). Units are independent; the recommended order is 5 → 1 → 2 → 3 → 4 →
6 → 7 for a year with one period a week (Computing Systems first because it needs the least reading and settles device
routines), or 1 → 2 → 7 for a 6-week "coding" block.

### 4.0 The shared 45-minute shape (every lesson follows it; cards below list only what changes)

| Minute | Block | What happens | Platform object |
|---|---|---|---|
| 0-3 | Log in | class login cards; the lesson page is the only tab | `/class/:cid/lessons/:clid` |
| 3-10 | **Warm-up live set** | teacher hosts the unit's live set in Quest Race (1B) or Question Battle (2), 6-8 questions, 15 s each. Replays the previous lesson, previews today's words. | `/live?mode=quest-race&set=<id>&class=<id>` (set materialised with the lesson, §8.3) |
| 10-14 | Hook | projector shows the chapter intro of the game (the game's own story card, read aloud by the crew member); teacher asks the one Hook question on the plan | game title → chapter map → intro card |
| 14-32 | **Main play** | kids play the named chapter from the lesson's game step (Play link `?lesson&step`); pairs on one device in 1B by default (driver/navigator swap at the chime: the game shows a swap prompt every 4 minutes when "Pairs" is on in the setup card), solo in 2 | game step; stars; hints |
| 32-39 | Talk | "Show me" pair share (one pair projects their solution) + the two Discussion prompts on the plan | nothing to click |
| 39-44 | **Exit ticket** | the game's "Case closed" card asks 2 taps (one concept check, one confidence); or, when the teacher prefers typed answers, the lesson's `question` step | end card → score label (§7.1); or question step |
| 44-45 | Log out | | |

Unplugged fallback for every lesson is one printable page per lesson in the lesson pack (§8.4), designed to be run with
paper and the projector when devices fail; each card names it. Differentiation defaults for every lesson: Explorer/Pro
band toggle; kit assist (`Oomba.settings.assist`), read-aloud and text size on by default for 1B; hint tier 3 ("show a
block") always available; an extension star goal ("get 3 stars on 2 levels") for early finishers; the Crew Challenge
level as a stretch.

CSTA practices are quoted as `P1`…`P7` with the sub-practice codes given in `csta.json` for the listed ids.

### Unit 1 — Algorithms & Programming (Robo Route)

**L1.1 "Bolt Wakes Up" — sequences and algorithms**
- CSTA: 1B-AP-10 (P5.2), 1B-AP-08 (P6.3, P3.3) · Pro: 2-AP-10 (P4.4, P4.1), 2-AP-12 (P5.1, P5.2)
- I can: put instructions in order so Bolt reaches the lamp; say why one route is better than another (Pro: write my plan as a flowchart before I build it).
- Vocabulary: algorithm, sequence, program, run, step · Pro: flowchart, pseudocode
- Materials: one device per pair (1B) / per student (2); projector; printable grid mat (unplugged).
- Game: Robo Route ch.1 First Steps, levels 1-6 (Pro: Plan tab required on levels 4-6).
- Hook question: "If I tell you 'go to the door' and you walk into the wall first, whose fault is it?"
- Discussion: (1) two pairs show different programs for level 4: which is shorter, which is easier to change? (2) Pro: where would your flowchart branch if a wall appeared?
- Exit card: "Which program gets Bolt to the lamp?" (pick 1 of 3 tiny programs) + confidence slider.
- Differentiation: Explorer palette is 3 blocks (move, turn left, turn right); Pro adds "turn around" and the Plan tab; stretch = level 6 par in one run.
- Unplugged: "Robot teacher": one kid is Bolt, partner reads cards (move/turn) to reach a chair; swap.
- Teacher notes: the first run always fails on level 3 by design (a turn is missing); let them discover it. Don't explain loops yet even if a kid asks: "Great question, that's next week's chapter" keeps the hook.

**L1.2 "Round and Round" — loops**
- CSTA: 1B-AP-10 (P5.2) · Pro: 2-AP-12 (P5.1, P5.2) nested loops
- I can: use a repeat block instead of copying the same blocks; (Pro) put a loop inside a loop to draw a square of squares.
- Vocabulary: loop, repeat, times · Pro: nested loop, inner/outer
- Game: Robo Route ch.2 Loops 1-6 (Explorer: levels 1-4 required, 5-6 stretch; Pro: all, 5-6 are nested).
- Hook: play level 1 on the projector with 12 move blocks, then with repeat 12 { move }. "Which one would you rather fix if the hallway got longer?"
- Discussion: (1) when does a loop NOT help? (2) Pro: predict how many steps `repeat 3 { repeat 4 { move } turn }` takes before running it.
- Exit card: "How many times does Bolt move?" for a shown loop + confidence.
- Differentiation: Explorer repeat dial 2-9; Pro repeat with a variable count (preview of L1.4); stretch = par on level 4.
- Unplugged: clapping patterns written as "repeat 4 { clap stomp }" on the board; kids write their own and perform them.
- Teacher notes: par on loop levels is set so a loop is the only way to 2 stars; a 1-star brute-force solution is fine for a first pass. Tell them so.

**L1.3 "If the Light Is Red" — conditionals and events**
- CSTA: 1B-AP-10 (P5.2) · Pro: 2-AP-12 (P5.1, P5.2) compound conditionals
- I can: make Bolt decide using an "if" block; make something happen when a button is pressed (event); (Pro) combine conditions with AND/OR/NOT.
- Vocabulary: condition, if/else, true/false, event, sensor · Pro: AND, OR, NOT, compound
- Game: Robo Route ch.3 Ifs 1-6 (Explorer: 1-4) and ch.4 Events 1-2.
- Hook: "If it's raining, I take an umbrella. What's the condition? What happens if it's false?"
- Discussion: (1) a level where "if path ahead { move } else { turn }" inside a loop solves any maze: why? (2) Pro: "if has key AND at door" vs "if has key OR at door" — act out both with a real key.
- Exit card: choose the condition that matches a picture (Bolt on a red tile) + confidence.
- Differentiation: Explorer conditions are tile colours and "path ahead"; Pro adds carried-item flags and compound blocks; stretch = ch.4 Events 3-4 (two buttons, two handlers).
- Unplugged: "Simon says with ifs": "if you are wearing blue, stand up"; then "if blue AND sneakers".
- Teacher notes: Events are introduced here (not in a separate lesson) because an event is just a condition on a button; the game's event levels put a "when button pressed" header block above the program.

**L1.4 "Count the Sparks" — variables**
- CSTA: 1B-AP-09 (P5.2) · Pro: 2-AP-11 (P5.1, P5.2)
- I can: use a variable to count what Bolt picks up and to stop when the count is right; (Pro) name my variables well and pick the right type (number, yes/no, list).
- Vocabulary: variable, value, set, change by · Pro: data type, name, counter, flag
- Game: Robo Route ch.5 Variables 1-5 (Explorer 1-3: one counter called "sparks"; Pro all five: rename variables, a flag, a 3-item list).
- Hook: a jar and marbles on the projector camera: "the jar is the variable, the marbles are the value."
- Discussion: (1) what breaks if you forget "set sparks to 0" at the start? (2) Pro: which name is better, `x` or `sparksLeft`, and why would a teammate care?
- Exit card: "After this program, what is the value of sparks?" + confidence.
- Differentiation: Explorer shows the value in Bolt's thought bubble at every step; Pro hides it until "step" mode; stretch = level 5 (use the list to visit lamps in order).
- Unplugged: score keeper with a mini whiteboard: one partner calls "change score by 2", the other updates the variable.
- Teacher notes: the "repeat until sparks = 3" block is the payoff; the game's hint tier 2 draws the count on the grid.

**L1.5 "Teach Bolt a Trick" — functions, decomposition**
- CSTA: 1B-AP-11 (P3.2), 1B-AP-12 (P5.3) · Pro: 2-AP-13 (P3.2), 2-AP-14 (P4.1, P4.3)
- I can: break a big route into smaller tricks and name them; reuse a trick; (Pro) give a trick a parameter so one trick draws many sizes.
- Vocabulary: function (trick), define, call, reuse · Pro: procedure, parameter, argument
- Game: Robo Route ch.6 Functions 1-6 (Explorer 1-3: define/call without parameters; Pro 4-6: parameters).
- Hook: "Describe making a sandwich in one word to your partner. What did 'sandwich' hide?"
- Discussion: (1) which trick did you define, and where did you call it twice? (2) Pro: what would `zigzag(3)` and `zigzag(5)` have in common?
- Exit card: match three tricks to the shapes they draw + confidence.
- Differentiation: Explorer tricks are picked from a menu (a trick slot with 4 blocks); Pro defines up to 3 tricks with a number parameter; stretch = level 6 par (one trick, three calls).
- Unplugged: "Dance tricks": groups invent a 4-move trick, name it, then a leader calls tricks to make a dance.
- Teacher notes: this is the first lesson where the Plan tab (Pro) shows a feature tree instead of a flowchart; it feeds directly into the capstone planning sheet.

### Unit 2 — Debugging and program development (Robo Route)

**L2.1 "Bug Hunt" — test and debug**
- CSTA: 1B-AP-15 (P6.1, P6.2) · Pro: 2-AP-17 (P6.1)
- I can: find and fix a mistake in a program I didn't write, using step-by-step running; (Pro) test one program against several maps, including a tricky one.
- Vocabulary: bug, debug, step, breakpoint, expected vs actual · Pro: test case, edge case
- Game: Robo Route ch.7 Bug Hunt 1-8 (Explorer 1-5; Pro 1-8 where 6-8 have 3 test maps each).
- Hook: run a buggy program on the projector; class calls "stop!" when Bolt goes wrong; teacher taps that block (breakpoint).
- Discussion: (1) which bug type was hardest: wrong order, off-by-one loop, wrong condition? (2) Pro: what test map would have caught the bug sooner?
- Exit card: "Where is the bug?" (tap one of 4 blocks) + confidence.
- Differentiation: Explorer bugs are one-block; Pro bugs can be a missing else or a loop count; stretch = the Crew Challenge debug level.
- Unplugged: "Spot the bug" worksheet of 4 short paper programs; kids act them out on the grid mat.
- Teacher notes: Bug Hunt levels report "fixed with N runs" in the star card; the 3-star rule is "fixed in ≤2 runs", teaching read-before-run.

**L2.2 "Best Route" — compare and improve algorithms**
- CSTA: 1B-AP-08 (P6.3, P3.3) · Pro: 2-AP-10 (P4.4, P4.1)
- I can: solve a level two different ways and explain which is better for a reason (shorter, fewer blocks, easier to change); (Pro) choose and justify with a flowchart.
- Vocabulary: efficient, par, compare, trade-off · Pro: criteria, constraint
- Game: Robo Route ch.8 Best Route 1-6: each level asks for two solutions and shows both side by side with block count and step count.
- Hook: two routes to the cafeteria on the school map; "shorter" vs "doesn't pass the noisy gym."
- Discussion: (1) when is the shorter program not the best program? (2) Pro: a level where fewest blocks and fewest steps disagree: which did you pick and why?
- Exit card: shown two programs for one map, pick "which is better for a longer hallway" + confidence.
- Differentiation: Explorer compares 2 solutions on the metric the level names; Pro picks the metric and defends it in a 40-char note (kept in the player's save only); stretch = beat par by two blocks.
- Unplugged: route cards on a paper city map; teams measure each with string.
- Teacher notes: this is the lesson where kids who "already know coding" meet the standard's real demand (justify a choice). Make them say the reason aloud.

**L2.3 "Level Maker" — remix, plan, share, credit**
- CSTA: 1B-AP-12 (P5.3), 1B-AP-13 (P1.1, P5.1), 1B-AP-14 (P5.2, P7.3), 1B-AP-16 (P2.2), 1B-AP-17 (P7.2) · Pro: 2-AP-15 (P2.3, P1.1), 2-AP-16 (P4.2, P5.2, P7.3), 2-AP-18 (P2.2), 2-AP-19 (P7.2)
- I can: plan a level for someone else, build it, have a partner test it, change it from their feedback, and credit the level I remixed.
- Vocabulary: remix, playtest, feedback, credit/attribution · Pro: iteration, user, documentation
- Game: Robo Route ch.9 Level Maker: build a map (grid paint, lamps, walls, tile colours), set the allowed blocks and par, solve it yourself (the game refuses to issue a code for an unsolved level), get a 6-digit code, swap codes with a partner, play theirs, give 2 taps of feedback on the end card (fun? fair?), then edit yours once.
- Hook: open a classmate-made level from the teacher (a prepared code) and fail it; "what would you tell the maker?"
- Discussion: (1) what did your tester's feedback change in your level? (2) the credits line: every remixed level shows "Remix of code 123456 by a classmate" (no names, see §2); why does that matter?
- Exit card: none in-game; the lesson's `question` step: "Write one thing you changed after feedback and why" (40-200 chars).
- Differentiation: Explorer maker has a 6x6 grid and 2 lamps; Pro 8x8 with buttons/events and a required block; roles printed: maker/tester swap at minute 25 (1B-AP-16, 2-AP-18 timeline: Pro teams of 3 use a 3-step timeline card).
- Unplugged: paper maze design on the grid mat with a solution card; swap and solve.
- Teacher notes: codes are the level (no server); if a kid loses the code, "My levels" in the game keeps the last 10 per player. Levels made in a live-hosted frame can't be typed into (no typing live), so this lesson is never hosted live.

### Unit 3 — Data & Analysis (Data Detective)

**L3.1 "Sort It Out" — organise and present data to support a claim**
- CSTA: 1B-DA-06 (P7.1) · Pro: 2-DA-08 (P6.3), 2-IC-22 (P2.4, P5.2) via the tally tool
- I can: sort and group a data set to answer a question; pick a chart that shows the answer; (Pro) collect class data with a tally and turn counts into percentages.
- Vocabulary: data, sort, group, bar chart, claim, evidence · Pro: percentage, survey, sample
- Game: Data Detective ch.1 Sort It Out cases 1-5 (Pro: also ch.7 Survey Lab "class tally" case using numbers the class counted by hands-up).
- Hook: the "Case of the Lost Lunchbox" intro: 12 lunchbox cards; "can you find whose it is by sorting?"
- Discussion: (1) which sort answered the case fastest? (2) Pro: counts vs percentages: when do percentages lie (tiny sample)?
- Exit card: "Which chart shows the claim 'most pets are dogs'?" (3 small DOM bar charts) + confidence.
- Differentiation: Explorer cases have ≤12 rows and one question; Pro ≤30 rows, two-step questions, and the class tally; stretch = ch.2 Chart Chasers 1-2.
- Unplugged: sticky-note bar chart of the class's favourite game category on the wall; sort by two different attributes.
- Teacher notes: the game never lets a claim be chosen until a chart that supports it is on screen ("Show me the evidence" rule), which is the whole standard in one mechanic.

**L3.2 "Pattern Predictors" — inference, prediction, enough data**
- CSTA: 1B-DA-07 (P7.1) · Pro: 2-DA-09 (P5.3, P4.4)
- I can: use data to predict what comes next and say how sure I am; spot data that doesn't belong; (Pro) tune a model until its predictions match the real data.
- Vocabulary: pattern, predict, cause and effect, relevant · Pro: model, simulation, refine, accurate
- Game: Data Detective ch.3 Pattern Predictors 1-5 (robot speed/distance case from the standard's own clarification, temperature-by-month, plant growth) and, Pro, ch.5 Model Mechanic 1-2.
- Hook: ch.3 case 1 on the projector: "the robot drove 2 s, 4 s, 6 s; how far at 10 s?" with only two data points first, then five: "did your guess change?"
- Discussion: (1) the case with the weekend gaps: why did the prediction go wrong? (2) Pro: what did you change in the model and what happened to the error bar?
- Exit card: "Which data column was NOT needed to predict?" + confidence.
- Differentiation: Explorer predictions are multiple-choice ranges; Pro drags a prediction marker and tunes two sliders; stretch = Model Mechanic 3 (game balance: tweak a runner game's jump so 80% of test runs finish).
- Unplugged: measure a toy car down a ramp at 3 heights, predict the 4th, test it.
- Teacher notes: Model Mechanic's "game balance" case is a preview of the capstone play-test (2-DA-09's own example).

**L3.3 "Code Breakers" (Pro) / "Dirty Data" (Explorer)**
- CSTA: Explorer 1B-DA-07 (P7.1), 1B-DA-06 (P7.1) · Pro: 2-DA-07 (P4), 2-DA-08 (P6.3)
- I can: (Explorer) clean a messy data set so my chart tells the truth; (Pro) show the same data in several encodings: binary, pixel bits, RGB numbers, words.
- Vocabulary: Explorer: error, duplicate, missing, outlier · Pro: bit, binary, encode/decode, RGB, hex-free ("colour numbers")
- Game: Explorer ch.4 Dirty Data 1-5; Pro ch.6 Code Breakers 1-6 (+ Inside the Machine ch.4 Bits & Lights as a second route for kinesthetic learners).
- Hook: Explorer: a chart that "proves" Tuesday has 200 lunches because of a typo. Pro: the projector shows a 5x5 pixel smiley and its 25 bits; "send the smiley to your partner by saying only 0 and 1."
- Discussion: (1) Explorer: when is removing a row cheating? (2) Pro: why do computers store colour as three numbers and not a word?
- Exit card: Explorer "which row is the error?"; Pro "which binary makes 5?" + confidence.
- Differentiation: both bands can play either chapter; Explorer kids who finish try Code Breakers 1-2 (counting on fingers to 31) as enrichment (not reported as a 1B standard).
- Unplugged: Explorer: a printed roster with 4 planted errors; Pro: binary bracelets with two bead colours (initials in 5 bits).
- Teacher notes: Code Breakers never shows hex (`#` codes look like raw colour literals in the game source and the style lint flags raw hex outside CONFIG; more importantly 6-8 kids don't need it: the standard asks for "multiple" schemes, and binary + RGB + words + pixels is four).

### Unit 4 — Networks & the Internet, Cybersecurity (Packet Post)

**L4.1 "Packets on the Move" — break down, send, reassemble**
- CSTA: 1B-NI-04 (P4.4) · Pro: 2-NI-04 (P4.4)
- I can: split a message into numbered packets, send them through more than one post office, and put them back together; (Pro) explain what the numbers (headers) are for.
- Vocabulary: packet, network, router (post office), destination, reassemble · Pro: header, sequence number, path
- Game: Packet Post ch.1 Break It Up 1-5 and ch.2 Find a Path 1-3.
- Hook: tear a printed picture into 6 numbered pieces, hand them to 6 kids who walk different routes to the back wall and tape it up in order.
- Discussion: (1) what happened in level 4 when packets took different roads? (2) Pro: what would go wrong without the sequence numbers?
- Exit card: order 4 shuffled packet cards + confidence.
- Differentiation: Explorer packets are 3-4 picture pieces; Pro 6-8 with two simultaneous messages to keep apart; stretch = ch.2 level 4 (a broken road appears mid-send).
- Unplugged: the torn-picture relay above, with a "busy post office" chair that only lets one kid through at a time.
- Teacher notes: the game's grid is a small town map; avoid saying "internet = the cloud"; the chapter intro says the Internet is "lots of post offices that agreed on the same rules," setting up L4.2.

**L4.2 "Rules of the Road" — routing and protocols**
- CSTA: 1B-NI-04 (P4.4) · Pro: 2-NI-04 (P4.4)
- I can: choose the best path and reroute when a road closes; (Pro) model a protocol: say "got it", resend lost packets, check for damage.
- Vocabulary: path, reroute, busy, rule · Pro: protocol, acknowledgement, resend, timeout, checksum (parity)
- Game: Packet Post ch.2 Find a Path 4-6 (both) and ch.3 Rules of the Road 1-6 (Explorer 1-2: the "say OK" rule; Pro 1-6).
- Hook: two kids pass a message across the room while the teacher "loses" one packet; "how does the sender know?"
- Discussion: (1) why do all post offices need the same rules? (2) Pro: parity level: how did one extra bit catch a damaged packet, and what can't it catch?
- Exit card: "A packet got lost. What does the protocol do?" (3 choices) + confidence.
- Differentiation: Explorer timers off (assist "no rush"); Pro has a gentle clock and a "secure road" (padlock) option that costs a step; stretch = ch.3 level 6 (design the rule set yourself from 3 toggles).
- Unplugged: "Protocol charades": the class invents hand signals for got-it / resend / done and passes a 5-word message.
- Teacher notes: the standard says protocol details are not expected; the game names only "rules" and shows them as road signs.

**L4.3 "Lock the Mailbox" — protecting information**
- CSTA: 1B-NI-05 (P3.1) · Pro: 2-NI-05 (P7.2), 2-IC-23 (P7.2)
- I can: build a strong passphrase from words I'll remember and keep it secret; spot a phishy letter; (Pro) sort protections into physical and digital and explain the trade-off between sharing and keeping private.
- Vocabulary: passphrase, private, phishing, back up · Pro: physical/digital security, firewall (gate), secure connection (padlock), spoofing
- Game: Packet Post ch.4 Lock the Mailbox 1-6 and ch.5 Phish or Friend 1-6 (Explorer 1-4).
- Hook: ch.5 case 1 on the projector: a letter from "the Mayor" promising a prize if you reply with your mailbox key; class votes phish/friend, then the game reveals the three clues.
- Discussion: (1) what three clues give a phish away? (2) Pro: a public profile helps an artist and helps a scammer: where's your line?
- Exit card: "Which passphrase is strongest?" (4 word-tile phrases) + confidence.
- Differentiation: Explorer phish letters have 1 obvious clue; Pro letters have subtle mismatches (sender badge vs signature) and a spoofed badge; stretch = ch.4 level 6 (2-step lock: key + a code the mailbox shows).
- Unplugged: the "Phish or Friend" card deck (12 printed letters, class sorts on the floor).
- Teacher notes: nothing in the game or lesson asks kids for their own passwords (the scanner fails "type your password", and it is bad practice); passphrases are built from word tiles for Pim's mailbox.

**L4.4 "Secret Ink" — ciphers**
- CSTA: Explorer 1B-NI-05 (P3.1) · Pro: 2-NI-06 (P4.4)
- I can: (Explorer) send a Caesar-wheel message and explain why hiding information protects it; (Pro) encode and decode with several methods and rank how hard each is to crack.
- Vocabulary: cipher, key, encode/decode · Pro: substitution, Caesar shift, keyword cipher, steganography, public key/private key (padlock model)
- Game: Packet Post ch.6 Secret Ink 1-7 (Explorer 1-2; Pro all).
- Hook: the projector shows "KHOOR"; "the key is a number. Who can read it?"
- Discussion: (1) why is a shift of 13 no safer than a shift of 3? (2) Pro: the padlock level: why can anyone lock but only one person unlock?
- Exit card: decode a 4-letter word with a shown wheel + confidence.
- Differentiation: Explorer wheel is on screen; Pro hides the key and gives a frequency hint; stretch = level 7 (hide a 3-letter word in a pixel picture's last bits, linking to Code Breakers).
- Unplugged: paper cipher wheels (print template in the pack); teams pass notes across the room.
- Teacher notes: all cipher text in the game is generated from a kid-safe word list that is also run through the profanity filter at build time (a Caesar shift can turn a clean word into a rude one; the build script rejects such pairs).

### Unit 5 — Computing Systems (Inside the Machine)

**L5.1 "Parts Party" — devices as systems**
- CSTA: 1B-CS-01 (P7.2) · Pro: 2-CS-01 (P3.3)
- I can: name the parts inside and outside a device and tell what each one does for the others; (Pro) watch how someone uses a device and recommend one design change.
- Vocabulary: input, output, processor, memory, storage, sensor, battery · Pro: interface, usability, ergonomic, accessible
- Game: Inside the Machine ch.1 Parts Party 1-6 (Pro: also ch.5 Design Lab brief 1).
- Hook: Gizmo opens a tablet on the projector; "what would stop working if I took out THIS?"
- Discussion: (1) the chain: finger → screen (input) → processor → speaker (output): where does the game go wrong if the sensor is missing? (2) Pro: the Design Lab user who can't see small text: what did you change?
- Exit card: tap the part that "remembers your photos when the power is off" + confidence.
- Differentiation: Explorer parts have pictures and 6 names; Pro adds GPS, accelerometer, microphone and wireless radio and asks "why that part" questions; stretch = ch.1 level 6 (a robot that needs a light sensor, from the standard's own example).
- Unplugged: parts cards on a big paper tablet outline; kids place and explain.
- Teacher notes: "external" parts matter for 1B-CS-01: the game's level 5 is a robot with a plug-in sensor, level 6 a printer that needs the tablet.

**L5.2 "Team Up" — hardware and software together**
- CSTA: 1B-CS-02 (P4.4) · Pro: 2-CS-02 (P5.1)
- I can: model how hardware and software work together to do one task (take a photo, play a song); (Pro) pick hardware and software parts for a project that collects and shares data, weighing cost, size, speed, battery and accessibility.
- Vocabulary: hardware, software, app, model, task · Pro: component, trade-off, data collection, wireless vs wired
- Game: Inside the Machine ch.2 Team Up 1-6 (Explorer 1-4: card sort + task chain; Pro 5-6: the component picker with a budget) and, Pro, ch.6 Gadget Garage brief 1.
- Hook: "Is the camera app hardware or software? Is the lens? What happens with only one of them?"
- Discussion: (1) show a task chain for "record the weather at the window": which boxes are hardware? (2) Pro: Bluetooth vs cable for the weather sensor: what did it cost you in battery?
- Exit card: Explorer: build a 4-box model (input → software → processor → output) by tapping cards into slots; Pro: "which part is wrong for the brief?" + confidence.
- Differentiation: Explorer cards are 8; Pro picker has 14 components with 5 stats each; stretch = Gadget Garage brief 2.
- Unplugged: act it out (the standard's own suggestion): kids are keyboard, app, processor, screen; a "message" card travels.
- Teacher notes: the 1B exit card *is* the standard ("model … hardware and software"); it is stored as the end-card score label, see §7.

**L5.3 "Fix-It Shop" — troubleshooting**
- CSTA: 1B-CS-03 (P6.2) · Pro: 2-CS-03 (P6.2)
- I can: fix common device problems with a checklist (power, cable, restart, settings, sound, caps lock); (Pro) build the checklist as a flowchart and find faults in connected devices by swapping parts.
- Vocabulary: troubleshoot, restart, check, connection, settings · Pro: checklist, flowchart, isolate, swap test
- Game: Inside the Machine ch.3 Fix-It Shop cases 1-8 (Explorer 1-5; Pro all, 6-8 are "connected device" cases).
- Hook: a real classroom device with the volume muted; "what would you try first, second, third?"
- Discussion: (1) which check solved most cases? (2) Pro: case 7 (printer won't print, but the fault was the router): how did the swap test find it?
- Exit card: order 4 troubleshooting steps + confidence.
- Differentiation: Explorer customers say the symptom plainly; Pro customers are vague and the kid must ask (tap) the right question first; stretch = case 8 (two faults).
- Unplugged: printed "Fix-It flowchart" that the class completes for "no sound".
- Teacher notes: the cases are the exact list in the 1B clarification (not responding, no power, no network, app crashing, no sound, caps lock) so this lesson doubles as the class's own device routine.

### Unit 6 — Impacts of Computing (Would You Rather Live + Data Detective + Inside the Machine)

**L6.1 "Tech That Changed the World"**
- CSTA: 1B-IC-18 (P3.1) · Pro: 2-IC-20 (P7.2)
- I can: name a technology that changed how people live and say one way it changed culture and one way culture changed it; (Pro) weigh a trade-off of a technology on everyday life and on jobs.
- Vocabulary: technology, invention, culture, change · Pro: trade-off, automation, privacy, career
- Main activity (replaces the game slot): **Would You Rather (Live), topic "tech"**, 10 items, 20 s, class room, then Data Detective ch.3 case "Then and Now" (a 1900-2020 timeline data set: letters sent vs messages sent; Pro: "jobs then and now" case).
- Hook: WYR item "Would you rather have no maps app for a year or no music app for a year?" with the live vote on the projector.
- Discussion: the WYR results screen *is* the discussion: after each vote the teacher asks the minority side "why?" (2 min); then (Pro) "driverless buses: who gains, who loses?"
- Exit card: `question` step: "One technology that changed the world, one good change, one problem it brought" (3 lines).
- Differentiation: Explorer items are concrete (robots, GPS, video calls); Pro items are trade-offs (privacy vs convenience, automation vs jobs); the WYR live frame is tap-only so every kid votes.
- Unplugged: timeline cards on a string across the room; kids place inventions and one "life before/after" sticky note.
- Teacher notes: WYR Live is unscored by design; the gradebook gets nothing from it except the bound step's "live" mark, which is why the exit ticket here is a typed question step.

**L6.2 "Games for Everyone" — accessibility and bias**
- CSTA: 1B-IC-19 (P1.2) · Pro: 2-IC-21 (P1.2), 2-CS-01 (P3.3)
- I can: find ways a game could work better for someone who sees, hears, reads or moves differently; (Pro) spot when a technology was built or tested for only some people and say how to fix that.
- Vocabulary: accessible, usable, captions, read-aloud, contrast, colour-blind · Pro: bias, testing group, diverse users
- Main activity: a **settings audit of CS Quest itself**: pairs open any Byte Crew game, go to the kit settings panel and play one level four ways (reduced motion, text 150%, high contrast + colour cues, read-aloud with sound off), filling the "Who is this for?" card; then Inside the Machine ch.5 Design Lab briefs 2-3 (Explorer) / 3-5 (Pro: "the face unlock that fails for some skin tones" brief, "the game only playable with two hands" brief).
- Hook: play Robo Route level 1 on the projector with colour-only tiles and ask the class to call the red tile; then switch on colour cues (shapes appear).
- Discussion: (1) which setting helped you even though you don't "need" it? (bright-room example from the standard) (2) Pro: who should have been in the testing group for the face-unlock brief?
- Exit card: Design Lab end card "pick the two changes that help the most users" + confidence.
- Differentiation: Explorer audit card has pictures; Pro adds "write one improvement for a classmate who is left-handed" (kit has a left-handed setting: let them find it).
- Unplugged: redesign a paper remote control for a user card (big hands, low vision, one hand).
- Teacher notes: this is the lesson that makes the capstone's accessibility rubric row concrete; keep the "Who is this for?" cards for L7.3.

**L6.3 "Share or Keep?" — copyright, creative commons, public vs private**
- CSTA: 1B-IC-21 (P7.3), 1B-AP-14 (P5.2, P7.3) · Pro: 2-IC-23 (P7.2), 2-AP-16 (P4.2, P5.2, P7.3)
- I can: use only media I'm allowed to use and give credit; (Pro) explain a trade-off between sharing something publicly and keeping it private.
- Vocabulary: permission, credit, copy, public domain, Creative Commons (the idea, not the licence names) · Pro: licence, attribution, public, private, social engineering
- Main activity: Data Detective ch.2 "Sources" case (every chart card has a source tag; the case is solved only when the claim cites the right source) then **Would You Rather (Live) "tech" set, Pro subset "share or keep"** (8 items) and Packet Post ch.5 Pro cases 5-6 (what a scammer learns from a public profile).
- Hook: "I found a great picture of a dragon online for my game. Can I use it?" Class votes; teacher shows the three answers the game gives (ask, find allowed media, make your own).
- Discussion: (1) when you remix a classmate's Robo Route level, what does the credit line do for them? (2) Pro: an artist's public gallery vs a scammer's shopping list: same page, two readings.
- Exit card: sort 4 media cards into "use with credit / ask first / make your own" + confidence.
- Differentiation: Explorer cards are images and music; Pro adds code snippets and a library; stretch = write the credit line for a remixed level in the Builder format used in L7.2.
- Unplugged: a "credit line" relay: each team adds one borrowed idea to a poster and writes who it came from.
- Teacher notes: the Builder capstone's asset picker offers only kit art and the kid's own drawings, so "allowed media" is enforced by the tool; this lesson is where kids learn why.

### Unit 7 — Builder capstone: "Make a game for someone"

Three lessons, ideally in the same week (school student sessions end after 1 h idle / 10 h, so each lesson starts with
the login cards again; the Studio game persists per student per build step). Teams of 2 (1B) or 3 (2); one device per
team to halve Builder load (§10).

**L7.1 "Plan It"**
- CSTA: 1B-AP-11 (P3.2), 1B-AP-13 (P1.1, P5.1), 1B-AP-16 (P2.2) · Pro: 2-AP-13 (P3.2), 2-AP-15 (P2.3, P1.1), 2-AP-18 (P2.2), 2-AP-19 (P7.2)
- I can: choose a player (who is this for?), break the game into parts, write a plan with pictures, and agree who does what; (Pro) set a 3-session timeline and name the variables and rules before building.
- Vocabulary: user, feature, storyboard, role · Pro: timeline, milestone, spec
- Main activity: the **planning sheet** (§6.3) on paper first (no devices for 20 minutes), then "Start building" on the build step so the Studio has the plan as its first message (prefill is the first 300 chars of the step body; the team pastes their own 2-sentence pitch as the first chat message).
- Hook: play two tiny Studio template games (Quiz Show, Catch) on the projector; "who is each one for?"
- Discussion: teams swap sheets and ask one question each ("what happens when the player loses?").
- Exit: the sheet's "decomposition" box is photographed/kept; teacher ticks the role cards.
- Differentiation: Explorer sheet is a 4-panel storyboard; Pro adds a feature tree and a variables table; stretch = a "stretch feature" box.
- Unplugged: the whole lesson is unplugged except the last 10 minutes.
- Teacher notes: the Builder is one runner per instance and the free AI pool is site-wide; a class of 30 needs a school plan (§10). Start builds staggered: teams press "Start building" when their sheet is approved, not all at once.

**L7.2 "Build It"**
- CSTA: 1B-AP-09 (P5.2), 1B-AP-10 (P5.2), 1B-AP-12 (P5.3), 1B-AP-14 (P5.2, P7.3) · Pro: 2-AP-11, 2-AP-12 (P5.1, P5.2), 2-AP-16 (P4.2, P5.2, P7.3)
- I can: build the game from my plan with the Builder, ask for a change at a time, check it myself, and add credits for anything I reused.
- Vocabulary: version, playtest, remix, credit · Pro: iteration, library, attribution
- Main activity: 30 minutes of Studio with the "one change per message" rule (printed), the autotest report read aloud by the navigator each round, and the credits line added in the game's own "About" (the Studio template WORDS table has a credits slot; the plan asks the AI to show it on the title screen).
- Hook: show the autotest card from a previous build: "the platform plays your game like a kid would; read what it found."
- Discussion: 5-minute "stuck share": each team names one bug and how they described it to the Builder.
- Exit: `question` step: "What did you reuse (template or idea) and how did you credit it?"
- Differentiation: Explorer teams start from a template by name ("make a Catch game where…"); Pro teams describe mechanics with variables and conditions ("score goes up by 2 when…, lives drop when… AND …"); stretch = a settings check (text size, captions) from L6.2.
- Unplugged: none (if devices fail, run L7.1's storyboard critique instead).
- Teacher notes: daily Builder cap 60 messages/user (30 on school plans by default); 2 concurrent builds; keep teams to ≤10 messages per lesson (`LESSON_MESSAGES` assumption). Flagged builds wait for admin review; a clean scan goes to the class instantly on hand-in.

**L7.3 "Test It, Show It"**
- CSTA: 1B-AP-15 (P6.1, P6.2), 1B-AP-17 (P7.2), 1B-IC-20 (P1.1), 1B-IC-19 (P1.2) · Pro: 2-AP-17 (P6.1), 2-AP-19 (P7.2), 2-AP-15 (P2.3, P1.1), 2-IC-22 (P2.4, P5.2), 2-DA-09 (P5.3, P4.4)
- I can: run a play-test with classmates, collect their answers, change one thing because of them, and demo my game explaining a choice I made.
- Vocabulary: play-test, feedback, tester, demo · Pro: test case, survey, tally, balance
- Main activity: **peer play-testing protocol** (§6.3): hand in → class Games tab → 3 rounds of 6 minutes (tester plays 3 min, fills the 4-tap card, maker watches silently), tally the cards (Data Detective's Tally tool or paper), one "changed because" edit, 60-second demos.
- Hook: "A tester is a scientist. Makers may not talk during the test. Watch where they get stuck."
- Discussion: each team's demo answers: who is it for, one choice you made, one thing you changed after testing.
- Exit: `question` step: "Two things testers said; what you changed; what you'd do with one more day."
- Differentiation: Explorer cards are 4 faces + 1 word; Pro cards are a 5-row tally with a "balance" row (too easy/too hard) feeding 2-DA-09; stretch = host the game live if the Builder made it live-ready.
- Unplugged: paper prototypes play-tested the same way.
- Teacher notes: hand-in publishes at class visibility only; the teacher can remove any game from the class Games tab. Testers never type into a classmate's game; feedback is on paper or in the tester's own Data Detective tally (per-player save).

---------------------------------------------------------------------------------------------------------------------------

## 5. Game designs

Common to all four (so each game section lists only its own specifics):

- **Base**: Oomba Kit 1.1.2 exact tag + packs (`style-bold` for titles; `dress`/`art-animals`/`art-props` where named),
  `<div id="game">` before the kit tag, `Oomba.game({ api:1, controls:'none', camera:'fixed', hud:[...], seed })` so the
  title → how-to → countdown → results flow, pause, settings panel, captions, read-aloud, RTL menus, 13-language chrome,
  `BRB.gameOver` and the `__brbTest` hooks come free. All boards, palettes, tables and cards are our own DOM appended to
  `Oomba.ui.root()` below `var(--ok-safe-top)`, sized in `rem` against `--ok-ts`, using `--ok-card/--ok-edge/--ok-text`
  and `Oomba.ui.button` for every real button (≥48 px). The kit stage behind the DOM draws the biome, the crew member
  and particles (`stage.burst`), never text kids must read.
- **No typing anywhere** (so every chapter can also be hosted live later and iOS keyboards never appear) except two
  numeric keypads drawn by us (share code entry, Data Detective's tally), which are disabled in live frames.
- **Start button**: `.ok-title-screen .ok-hot` from the kit title (fit audit finds it). Chapter map is the first screen
  after Play; the **Quest Card** (band, chapter, mode) opens from a gear on the map and from a 4-digit "quest code"
  keypad (§5.5).
- **Levels are data**: `window.<Game>Levels` in its own classic `<script>` block (vm-loadable, Code Isle pattern) with
  `{ id, ch, band:'both'|'pro'|'explorer', csta:[...], csta2:[...], map/case, par, hints:[3], learn:{title,text}, sol }`;
  a unit test solves every level with `sol`, asserts the starter does not pass, and asserts every `csta` id exists in
  `csta.json`. Text goes through `Oomba.strings` under a prefix (`rr.`, `dd.`, `pp.`, `im.`) with English keys; 13
  locales for in-game text are built from `scripts/data/cs-quest/<game>/<lang>.json` and shipped as `/vendor/data/`
  packs (English inline), so the game file stays far under 2 MB and the pack test layout (`<version>/<lang>.js`) is
  complete from day one.
- **Determinism**: `w.rand` from `spec.seed`; `__brbTest.start({band, chapter, level, mode})`, `step(n)`,
  `skipAnimations()`, `cover()` (stages a pretty mid-level moment for `covers.js`), `state()` returns `{band, chapter,
  level, stars, phase}`.
- **Progress out** (today's plumbing): `BRB.score.submit(totalStars, label)` after every level, label ≤40 chars ASCII,
  e.g. `rr loops L4 2s 14/27` (game, chapter, last level, stars this level, chapter stars/possible); `BRB.gameOver({won:
  true, score: totalStars})` when a chapter is completed. Both are monotonic so "best score" is meaningful. §7 adds the
  structured `brb:progress` message.
- **Hints that teach** (same three tiers everywhere; tier shown counts toward stars): T1 *question* ("What does Bolt see
  after the third move?"), T2 *picture* (the ghost path / the sorted column / the packet's road is drawn), T3 *one piece*
  (one block/card is highlighted or placed). Never the full solution; "Skip level" exists after two failed runs and
  marks the level grey (0 stars, still unlocks the next).
- **Fit**: tablets first. Landscape: board left (60%), work panel right. Portrait: board top, work panel bottom; palette
  as a horizontal strip of ≤8 controls at a time (the audit forbids scrolling to reach a button in a ≤8-button scroller,
  so palettes paginate with "more" when a chapter has >8 blocks). Dense boards (8x8 grids, data tables) carry
  `data-fit-dense` (28 px minimum) but all *buttons* stay ≥48 px.

### 5.1 Robo Route (slug `robo-route`, icon 🤖, category learning, orientation any, players_max 1, featured)

**Fantasy.** Bolt is a courier robot in a lamp-lit town; sparks must reach lamps. Bolt does exactly what the program
says, no more, with visible delight (`squash`, `pop`) when a lamp lights and a sad `wobble` when it bumps a wall.

**Core loop.** Read the goal card → tap blocks from the palette into the program strip → Run (or Step) → watch Bolt →
verdict card (stars, block count vs par, "why" line) → next. A run is a **simulation first** (block list → command
list → `Sim` on the grid with step/loop limits, producing `events`), then a **replay** on the kit stage (`Oomba.tween`
per move, `stage.burst('sparks')` per lamp, the current block highlighted in the strip). Kids' programs are data; nothing
is ever evaluated as JavaScript (scanner `eval` rule; Code Isle precedent).

**Blocks (palette grows by chapter).** move · turn left · turn right · (Pro: turn around) · pick up · repeat N { } ·
repeat until lamp { } · if <cond> { } else { } · <cond>: path ahead / on red / on blue / holding spark / at lamp ·
(Pro) AND / OR / NOT · when button A/B pressed { } · set <var> to N · change <var> by N · repeat until <var> = N ·
(Pro) <var> types: number / yes-no / list of lamps; `next in list` · define trick { } · trick · (Pro) define trick
(n) { } with `n` usable as a repeat count or turn amount · breakpoint (debug chapters) · comment chip (Pro: a 1-word
label from a fixed list, for 2-AP-19; no free text).

**Chapters → levels** (E = Explorer required, P = Pro required, S = stretch; `csta` per level):

| Ch | Name | Levels | Standard practised | What changes level to level |
|---|---|---|---|---|
| 1 | First Steps | 6 (E1-6, P1-6; P4-6 Plan-first) | 1B-AP-10; Pro 2-AP-10 | straight line → one turn → missing turn (planted) → two lamps (order) → 2 routes same length (compare card) → long route (par pressure sets up loops) |
| 2 | Loops | 6 (E1-4, S5-6; P1-6) | 1B-AP-10; Pro 2-AP-12 (5-6 nested) | repeat move → repeat {move turn} square → loop + tail → count the repeats yourself (prediction tap before run) → nested square-of-squares → nested with inner turn |
| 3 | Ifs | 6 (E1-4; P1-6) | 1B-AP-10; Pro 2-AP-12 (5-6 compound) | if on red pick up → if/else → if inside repeat (maze walker) → unknown map (program must work blind: tiles revealed on run) → AND (key and door) → NOT/OR |
| 4 | Events | 4 (E1-2; P1-4) | 1B-AP-10 | when A pressed move; the kid presses A on a big on-screen button during the run → two buttons two handlers → event + loop → event + variable |
| 5 | Variables | 5 (E1-3; P1-5) | 1B-AP-09; Pro 2-AP-11 | set/change a counter shown in Bolt's bubble → repeat until sparks = 3 → forgot to set 0 (planted) → rename vars, a yes-no flag → list of lamps visited in order |
| 6 | Functions | 6 (E1-3; P1-6) | 1B-AP-11, 1B-AP-12; Pro 2-AP-13, 2-AP-14 | define/call a "trick" → call it 3 times → remix a given trick (change one block) → trick(n) as repeat count → trick(n) as turn → two tricks, one calls the other |
| 7 | Bug Hunt | 8 (E1-5; P1-8) | 1B-AP-15; Pro 2-AP-17 | wrong order → off-by-one loop → wrong condition → missing else → wrong variable start → Pro: must pass 3 maps → one map is "invalid" (no lamp: program must stop cleanly, i.e. repeat-until guard) → two bugs |
| 8 | Best Route | 6 (E1-4; P1-6) | 1B-AP-08; Pro 2-AP-10 | two solutions required per level; metric named (fewest blocks / fewest steps / avoids red) → kid picks the metric → Pro: flowchart must match the program (Plan tab diff) → changeable: "now the hallway is 2 longer" re-run |
| 9 | Level Maker | maker (E 6x6, P 8x8) | 1B-AP-12, 1B-AP-13, 1B-AP-14; Pro 2-AP-15, 2-AP-16, 2-AP-19 | paint map → place lamps/walls/colours/buttons → choose allowed blocks + par → must solve it yourself → 6-digit code → play a code → 2-tap feedback → edit once (iteration counter shown) |
| ★ | Crew Challenge | 1/day | rotates ch.1-8 | deterministic from the UTC day |

47 authored levels + maker. Every level stores `hints[3]` and a `learn` card (one sentence + a picture) shown the
first time a block appears.

**Controls.**
- Touch: tap a palette block → appended at the cursor; tap a program block → selected (cursor after it) with a mini
  toolbar: ◀ ▶ (move), ⧉ (duplicate), ✕ (delete), and for containers "into/out of". Long-press drag with
  `setPointerCapture` also works (optional path; everything is reachable by taps). Numbers (repeat count, set value) via
  a +/- stepper, never a keyboard. Run ▶, Step ⏭, Reset ↺, Speed 1x/2x, Hint ?: all `Oomba.ui.button`, 56 px on tablets.
- Keyboard: Tab/Shift-Tab between palette, program and buttons; arrows move within; Enter adds/selects; Delete removes;
  `[`/`]` move a block; R run, S step, Esc pause (kit). Focus ring from `--ok-focus`; `aria-live` announces "Added
  move. Program has 4 blocks." via `Oomba.ui.announce`.
- Gamepad: standard mapping polled by the kit; d-pad = arrows, A = Enter, B = delete, Start = run.

**Progression and rewards.** Stars per level (1 solved / 2 ≤ par blocks / 3 ≤ par on the first run with hint ≤ T2);
chapter crown at full stars; crowns unlock Bolt paint jobs and antenna toppers (SVG layers, our art). Explorer stars
are gold; Pro stars are gold with a blue ring; a Pro kid who plays Explorer earns silver (counts as 1 star toward
unlocks, shows as "E" in the label). Bug Hunt's extra badge: "Fixed in one run" ×5.

**Hints that teach (examples).** Ch.2 L3: T1 "How many times does the pattern move-turn repeat before the tail?"; T2 the
ghost path shows four identical segments and one extra; T3 highlights the empty repeat block with "4" preset. Ch.7 L2:
T1 "Count Bolt's moves out loud as you step"; T2 the lamp tile flashes when the loop ends one short; T3 the repeat
count field is outlined.

**Explorer → Pro switch changes.** Block labels: icons + word (Explorer) vs word + shape (Pro, smaller); palette size;
nested containers allowed; compound conditions; named variables with types; parameters; the **Plan tab** (Pro only):
a flowchart rendered as DOM boxes from the program (read-only in ch.1-7; in ch.8 the kid builds the flowchart from
flow blocks first and the program is checked against it); the **Tests tab** (Pro ch.7: three maps, each with a pass/fail
pill, run-all button); par is tighter in Pro; Explorer gets the "swap pairs" chime option and read-aloud auto-on.

**Teacher deep link.** Target syntax (via `BRB.params`, §9): `?o=rr.ch7.b2.debug.l3` → `/play/robo-route?o=…`, which
the lesson step stores and `routes/progress.js` appends. Tokens: `ch1-9|maker|daily`, `b1|b2` (Explorer/Pro, kid can
still toggle unless `lock`), `mode: play|debug|compare|plan`, `l<n>`, `lock`. Until `BRB.params` exists: the same
tuple as a **4-digit quest code** on the printed lesson page and in the step body ("Enter quest code 7 2 3 1"), typed on
the game's keypad (chapter, band, mode, level; <7 digits so platform text filters never read it as a phone number).

**Progress reported.** Per level: `submit(totalStars, 'rr <ch> L<n> <s>s <chapterStars>/<max> <E|P>')`; chapter
complete: `gameOver({won:true, score:totalStars})`. With `brb:progress` (§7.2): `{game:'rr', chapter:'loops',
level:3, stars:2, band:2, csta:['2-AP-12'], runs:3, hint:1}`.

**Kit pieces reused / custom.** Reused: `Oomba.game` flow, `Oomba.level.grid` (one char per cell; legend extended with
our own chars for lamps/buttons/colours via `spawn` in `setup`), `w.spawn` for lamps/walls/buttons as kit props
(`art-props` lamp, crate, button), `Oomba.tween`/`tween.seq` for Bolt's replay, `stage.burst`, `Oomba.ui.button/
dialog/toast/announce/hud (count:lamp)`, `Oomba.icon` (arrows, check, cross, hint, drag), `Oomba.say` for cards,
`Oomba.settings` (reduced motion → no squash/wobble, instant replay; cvd → tile shapes), `Oomba.save` for settings-size
state and `BRB.storage['robo-route-v1']` for stars/levels/drafts. Custom: Bolt (SVG, 3 layers for paint jobs), the block
palette and program strip (DOM, with container nesting rendered as indented rows, `dir="ltr"` on the strip), the
flowchart view (DOM boxes + CSS borders, no SVG lines needed), the interpreter/sim/verdict (plain JS, vm-testable),
the level-code encoder.

**Share code.** 6 digits ≈ 2^19.9 bits: too small for an 8x8 map, so the code is a *seed + recipe*: 2 digits chapter
template (which legend set and size), 4 digits seed; the maker's edits are quantised to a seeded random walk picker
(the kid chooses among 9 seeded variations of walls/lamps per "shuffle", then places up to 3 lamps and 2 colours by
tapping, which are encoded in a second optional 6-digit "extras" code). Honest limit: the maker is a **constrained**
editor, not free paint, which is also what keeps every shared level solvable and content-free. Explorer never needs
the extras code.

**Tests.** `tests/unit/robo-route.test.js`: vm-load the level script and interpreter; solve all 47 with `sol`; starters
fail; `csta` ids valid; par ≥ sol length; share codes round-trip; every `rr.` key in 13 languages with equal `{slots}`.
Headless kit test (kit-fake) for the game spec. Real-Chromium test (gulp-city pattern) for RTL menus, 150% text and
the 5 audit sizes on ch.2 L5 (the densest strip). Cover recipe: `start({chapter:2, level:4})`, `skipAnimations()`,
`cover()` places a half-built program and Bolt mid-route.

### 5.2 Data Detective (slug `data-detective`, icon 🔍, category learning, orientation any, players_max 1, featured)

**Fantasy.** Dot the fox detective solves small-town mysteries where the culprit is always found in the data. Each case
is a **mystery card** (a question), a **data deck** (8-30 record cards, each with 3-6 fields), a **toolbench** and a
**claim board**. The rule that carries 1B-DA-06/2-DA-08: *you cannot pin a claim until the evidence view on screen
supports it* ("Show me" check); the rule that carries 1B-DA-07/2-DA-09: *predictions are scored by how close they land
and by whether you had enough, relevant data* (Dot says "two clues is a hunch, five is a case").

**Toolbench (grows by chapter).** Sort ↑↓ (tap a column header) · Group (chips: by field) · Count · Filter (tap a value
to keep/drop) · Chart: bar / pictograph / line / dot plot (DOM bars and dots, never canvas, so values are readable and
`aria-live` can say "Dogs: 7") · Clean: fix (pick from 3 corrections) / remove / merge duplicates · Predict (marker on a
line chart; Explorer picks a range tile) · Tune (two sliders on a tiny simulation) · Tally (our numeric keypad: enter
counts the class collected by hand) · Poll (Explorer/Pro: 2-choice world polls through `BRB.poll`; `data-detective`
added to `POLL_GAMES`; results shown as a live bar when ≥ `MIN_SHOWN` votes, else "collecting…").

**Chapters → cases.**

| Ch | Name | Cases | Standard | Case list (question → tool that solves it) |
|---|---|---|---|---|
| 1 | Sort It Out | 5 (E1-5, P1-5) | 1B-DA-06; Pro 2-DA-08 | Lost Lunchbox (sort by colour then size) · Pet Parade (group + count) · Library Late (sort by date) · Field Day (two sorts disagree: which answers the question?) · Pro: Lunch Count (counts → percentages toggle; the claim needs %) |
| 2 | Chart Chasers | 5 (E1-4; P1-5) | 1B-DA-06; Pro 2-DA-08 | pick the chart for "most/least" (bar) · "change over time" (line) · "how spread out" (dot plot) · Sources case (every card has a source tag; claim must cite it, L6.3) · Pro: a misleading chart (truncated axis) you must fix |
| 3 | Pattern Predictors | 5 (E1-5; P1-5) | 1B-DA-07; Pro 2-DA-09 | Robot Run (speed/time/distance, predict at 10 s with 2 vs 5 points) · Noon Temperatures (weekend gaps break the prediction) · Plant Race (relevant vs irrelevant columns: day-of-week is noise) · Then and Now (letters vs messages 1900-2020, L6.1) · Pro: Jobs Then and Now (two series, trade-off claim) |
| 4 | Dirty Data | 5 (E1-5; P1-5) | Explorer 1B-DA-07; Pro 2-DA-08 | the Tuesday typo (200 lunches) · duplicates · missing values (drop or estimate?) · mixed units (cm and inches) · Pro: survey junk responses |
| 5 | Model Mechanic | 4 (P1-4; E stretch) | 2-DA-09 | ramp height → distance (tune slope) · bounce height (tune two sliders, compare predicted vs actual) · Game Balance (tune a runner's jump so 80% of 20 seeded test runs finish) · ball mass matters? (add a factor) |
| 6 | Code Breakers | 6 (P1-6; E1-2 enrichment) | 2-DA-07 | count to 31 on one hand (5 switches) · number ↔ binary tiles · 5x5 pixel picture ↔ 25 bits · colour as three sliders (RGB numbers ↔ swatch ↔ word) · same message four ways (word, number code, bits, pixels) · hide 3 letters in a picture's last bits (bridge to Packet Post Secret Ink) |
| 7 | Survey Lab | 3 (E1-2; P1-3) | 2-DA-08, 2-IC-22 (Explorer: 1B-DA-06) | World Poll (vote on 5 two-choice questions, read the live bars) · Class Tally (enter hands-up counts, chart them, claim) · Pro: design a 3-question survey from tiles, predict results, compare with the poll |
| ★ | Crew Challenge | 1/day | rotates ch.1-4 | seeded deck shuffle |

33 cases + daily. Each case: `deck` (records), `question`, `claims[3]` with the one supported, `evidence` (predicate on
the view state: e.g. `{chart:'bar', by:'pet', sort:'desc'}`), `par` (tool taps), `hints[3]`, `csta`.

**Controls.** Touch: tap headers to sort, tap chips to group/filter, tap a chart type, tap a claim; the deck scrolls
vertically (a list, not buttons, so the audit's scroller rule does not apply); tally keypad is 12 buttons ≥48 px.
Keyboard: Tab through headers/chips/claims; Enter toggles; arrows move the predict marker (±1 unit), `+`/`-` tune
sliders; number row for the tally. Everything announces its result ("Sorted by size, biggest first").

**Progression.** Stars: 1 case solved / 2 within par taps / 3 first claim correct with hint ≤ T2. Dot's badge wall:
"Sorter", "Chart Chaser", "Never Guesses" (five 3-star predictions), "Clean Hands" (Dirty Data crown). Rewards are
new detective hats and office furniture on the chapter map (kit `dress` variants + props).

**Hints.** T1 question ("Which column would separate the lunchboxes fastest?"), T2 picture (the right chart appears
ghosted behind yours), T3 one piece (the header to tap pulses).

**Explorer → Pro.** Deck size (≤12 vs ≤30), fields per record (3 vs 6), claims with numbers vs with percentages and
"because" clauses, Predict as range tiles vs marker with an error band, Model Mechanic and Code Breakers required,
survey design, and the misleading-chart case. Explorer shows Dot's read-aloud for every card by default.

**Teacher deep link.** `?o=dd.ch3.b1.l2` / quest code `3 1 0 2`. Modes: `play`, `poll` (opens Survey Lab directly for a
whole-class 5-minute poll), `tally` (opens the Tally tool with an empty 2-column table for a class count).

**Progress.** `submit(totalStars, 'dd <ch> C<n> <s>s <chapterStars>/<max> <E|P>')`; with `brb:progress`: `{game:'dd',
chapter:'patterns', case:2, stars:3, band:1, csta:['1B-DA-07'], taps:9, hint:0, predictionError:0.4}`.

**Kit reused / custom.** Reused: `Oomba.game` flow with `controls:'none'`, `Oomba.stage` biome `town` behind the cards
(WYR pattern: `#game` moved into `Oomba.ui.root()`), `Oomba.char` fox + `dress`, `Oomba.ui.ask` for the 3-claim board
(it is a 2-4 tile quiz card with `hint` and `tries`, exactly right), `Oomba.ui.dialog` for case intros, `stage.burst
('confetti')`, `Oomba.num` for locale numbers (Arabic keeps Western digits per site rule), `BRB.poll`. Custom: the
record deck (DOM list), the table/chart renderer (DOM: bars as `div` widths with value text, dots as absolutely placed
`span`s with `aria-label`, line chart as a CSS-drawn polyline using rotated segments or an inline SVG `<polyline>`:
SVG is allowed inline and skipped by the audit, so the SVG line gets a DOM twin table for screen readers), the
simulations for Model Mechanic (plain JS, seeded), the pixel/bit grid, the keypad.

**Safety notes.** Decks contain no real names: records are things (lunchboxes, pets, plants, robots) or first-name-free
roles ("Runner 3"); the poll questions are the WYR style ("cats or dogs"), never about the kid; numbers never form
7-digit runs (years are 4 digits, counts ≤ 999; dates render as "Mon 3" not 2026-03-03).

**Tests.** vm-load cases; assert each case's `evidence` predicate is satisfiable from `deck` by the `sol` tap script;
assert exactly one claim is supported; Code Breakers encoders round-trip; i18n parity; Chromium test of the bar chart
at 150% text and in Hebrew UI (numbers stay LTR); poll gating (<5 votes shows "collecting").

### 5.3 Packet Post (slug `packet-post`, icon 📮, category learning, orientation any, players_max 1, featured)

**Fantasy.** Pim the pigeon runs the post in Netville, a town where houses are devices, post offices are routers and
roads are links. Messages are pictures torn into packets. Later chapters move into the locked mailroom (security) and
the secret-ink desk (ciphers). Tone: cosy, slightly silly; villains are "the Mixers" who scramble, lose and fake mail.

**Core mechanics (one per chapter family).**
- *Split & reassemble* (ch.1): tap a picture to tear it into N packets (N chosen by the level), each gets a number stamp
  (Explorer: automatic; Pro: you stamp them and a missing stamp causes a jumble), send, then at the destination drag/tap
  arriving packets into numbered slots. Arrival order is shuffled by the route.
- *Route* (ch.2): a node graph (5-12 nodes) drawn with kit props; tap nodes in order to lay a road for the next packet
  (or "auto" lets the post offices choose: Explorer); mid-send events: a road closes (reroute), a post office is busy
  (queue animation), two messages share roads. Stars reward total hops and no lost packets.
- *Protocol* (ch.3): the level gives three rule toggles (ACK "got it", resend after timeout, parity check) and a budget
  of extra steps; events are seeded losses and damage; the verdict shows which rules caught what. Explorer plays a
  fixed 2-rule version with pictures of the rules as road signs.
- *Lock* (ch.4): passphrase builder from word tiles with a strength meter that explains itself ("4 words you remember
  beat 8 random letters"), "who do you tell?" sorter, physical/digital protection sorter (door lock, hidden key, backup
  drive vs router key, firewall gate, padlock road), 2-step lock mini-game, backup-before-disaster case.
- *Phish or Friend* (ch.5): letters arrive; the kid taps clues (urgency, prize, asks for the key, sender badge mismatch,
  odd spelling) then verdicts phish/friend; Pro letters have 0-3 subtle clues and spoofed badges; a "what did they
  already know about you?" case links to 2-IC-23 (public profile card → which lines helped the scammer).
- *Secret Ink* (ch.6): Caesar wheel (tap to rotate), keyword substitution grid, pigpen symbols, steganography in a
  pixel picture (last bit per pixel), padlock keys (public padlock anyone can snap shut, one private key opens: modelled
  as a two-colour puzzle).
- *Postmaster* (ch.7, Pro): build a Netville map (nodes/roads/one busy office), choose a message size and rules; must
  deliver it yourself; 6-digit share code (same scheme as Robo Route: template + seed, taps as extras).

**Chapters → levels.**

| Ch | Name | Levels | Standard | Progression |
|---|---|---|---|---|
| 1 | Break It Up | 5 (E1-5; P1-5) | 1B-NI-04; Pro 2-NI-04 | 3 packets one road → 4 packets two roads (arrive out of order) → stamps matter (Pro stamps by hand) → two messages at once → a packet is late: wait or ask again? |
| 2 | Find a Path | 6 (E1-4; P1-6) | 1B-NI-04; Pro 2-NI-04 | shortest road → busy office (longer but faster) → road closes mid-send → packets of one message on different roads (Explorer "wow" moment) → Pro: choose per-packet roads under a hop budget → Pro: a secure road costs one extra hop (set-up for HTTPS talk) |
| 3 | Rules of the Road | 6 (E1-2; P1-6) | 2-NI-04 (Explorer: 1B-NI-04) | "say got it" → resend the lost one → timeout too short/too long → parity bit catches damage → parity misses a double flip → design your own rule set under a step budget |
| 4 | Lock the Mailbox | 6 (E1-6; P1-6) | 1B-NI-05; Pro 2-NI-05 | strength meter → never share (sorter) → 2-step lock → physical vs digital sorter (Pro extra cards: router key, firewall gate, padlock road) → back up before the flood → reuse is risky (one key for 3 mailboxes) |
| 5 | Phish or Friend | 6 (E1-4; P1-6) | 1B-NI-05; Pro 2-NI-05, 2-IC-23 | prize letter → urgent letter → mismatched badge → friend letter that looks odd (no false positives!) → Pro: public profile → scammer's list → Pro: spoofed badge |
| 6 | Secret Ink | 7 (E1-2; P1-7) | 2-NI-06 (Explorer: 1B-NI-05) | Caesar encode → decode with a known key → crack by trying keys (why 25 tries is small) → keyword cipher → pigpen → steganography → padlock keys |
| 7 | Postmaster | maker (P) | 2-NI-04 (+2-AP-15 via playtest loop) | build → deliver → code → play a classmate's → 2-tap feedback → edit once |
| ★ | Crew Challenge | 1/day | rotates ch.1-3 | seeded town |

36 authored levels + maker.

**Controls.** Touch: tap nodes to lay a road (tap again to undo the last hop), tap slots to place packets, tap clue
words on letters (each clue is a 48 px chip under the letter text, not inline text, so the audit and small fingers are
happy), rotate the cipher wheel with two big ◀ ▶ buttons or drag. Keyboard: arrows move a cursor over nodes/slots,
Enter selects, Backspace undoes a hop, 1-9 picks a slot, `,`/`.` rotate the wheel. Timed levels (Pro ch.2-3) have a
gentle clock the kit `assist: nofail` removes; Explorer never has a clock.

**Progression.** Stars: 1 delivered / 2 within hop or step budget / 3 budget on the first send with no lost packet.
Chapter crowns give Pim satchels and Netville buildings on the map. The "Postmaster" badge shows the number of
classmates' towns delivered (a counter in the player's own save; no social data).

**Hints.** T1 "Which office has the shortest queue?"; T2 the roads light up with hop counts; T3 the next hop pulses.
In Phish or Friend, T2 highlights the sender badge area, T3 reveals one clue chip.

**Explorer → Pro.** Automatic stamps/roads vs manual; clocks off vs gentle; protocol toggles hidden vs chosen;
security sorter has 8 vs 14 cards; letters have 1 obvious vs 0-3 subtle clues; ciphers: wheel only vs five methods and
"crack it"; the Postmaster maker; Pro verdict cards use the words protocol, acknowledgement, checksum, encryption.

**Teacher deep link.** `?o=pp.ch5.b2.l1` / quest code `5 2 0 1`; mode `sorter` opens the physical/digital sorter as a
5-minute whole-class activity on the projector (teacher taps), mode `wheel` opens a free Caesar wheel for the
unplugged lesson.

**Progress.** `submit(totalStars, 'pp <ch> L<n> <s>s <chapterStars>/<max> <E|P>')`; `brb:progress`: `{game:'pp',
chapter:'phish', level:3, stars:2, band:2, csta:['2-NI-05','2-IC-23'], falsePositives:0}`.

**Kit reused / custom.** Reused: `Oomba.game` with `controls:'none'`, biome `town` or `meadow`, `w.spawn` for houses,
post offices, mailboxes (`art-props`), Pim from `art-animals` (bird) with `say` bubbles, `Oomba.tween.seq` for packet
flights along roads, `stage.burst('sparks')` on delivery, `Oomba.ui.ask` for phish/friend and sorter verdicts,
`Oomba.ui.hud(['count:mail','timer:S'])`, `Oomba.icon('lock')`, `Oomba.settings.reduced` (packets jump node to node
instead of flying). Custom: the node graph layout (DOM nodes positioned over the stage, roads as rotated `div`s with
`aria-hidden` plus a text list of roads for screen readers), the packet slot tray, letters (DOM cards with clue chips),
the cipher wheel (two concentric DOM rings of 26 letter cells, `dir="ltr"`), the strength meter, the pixel
steganography grid (shared component with Data Detective's Code Breakers: copy, not import, since each game is one file).

**Scanner and safety specifics (this game is the risky one).** No real URLs, domains, emails, phone-like numbers or
"@name@host" strings anywhere, including comments and translations: letters are addressed to "Pim, 7 Birch Lane" and
signed "The Mayor's Office"; the "link" in a phish letter is a button labelled "Claim prize" that the kid taps as a
clue, never a URL. The word "password" never appears in a prompt ("mailbox key", "passphrase"); nobody is asked for
their own anything. Cipher plaintexts come from a reviewed word list; the build script shifts every word by all 25
keys and rejects any word whose shift hits the profanity list in any language. Public-profile cards use the crew
characters, never a kid or a real person. IP-like numbers are not shown at all (house numbers 1-99 suffice at this
level). "Hack" is not used as a verb (textfilter and the public review model both dislike it); the Mixers "scramble"
and "fake".

**Tests.** vm-load levels; routing solver proves each level deliverable under budget; protocol sim proves the stated
rule set catches the seeded events; cipher round-trips for all methods; a test that no string literal in the file or
packs matches `/\d{7,}|@|\/\/\w+\./`; i18n parity; Chromium: cipher wheel at 390x844 (44 px cells need
`data-fit-dense`), letters with 3 clue chips at 150% text; cover recipe mid-route with a packet in flight.

### 5.4 Inside the Machine (slug `inside-the-machine`, icon 🔧, category learning, orientation any, players_max 1, featured)

**Fantasy.** Gizmo the raccoon runs a repair workshop. Customers (crew cameos and townsfolk animals) bring devices:
tablets, a robot, a smart speaker, a printer, a game controller, a weather station. Gizmo opens them up (a satisfying
"lid off" animation), and the kid does the work: name parts, wire the chain, fix faults, read the bits, redesign.

**Core mechanics.**
- *Parts board* (ch.1): a device outline with glowing slots; tap a part card then a slot (or tap the slot to pick from a
  wheel). After placement, the **"what happens when" chain**: a trigger card (finger taps screen / sound is heard /
  light changes) and the kid orders 3-5 chain cards (sensor → processor → memory → output). Pro adds "why this part"
  justification tiles and an external device (printer, sensor) that depends on the main device.
- *Hardware/software sort and task chain* (ch.2): cards flip into two trays (hardware/software); then a task ("take a
  photo and send it") is built as a chain alternating hardware and software boxes; Pro's **component picker**: a brief
  (collect rain data at the window and send it to a tablet), 14 components with 5 stats (cost, size, speed, battery,
  accessibility), a budget and a must-have; the verdict scores the brief's needs, not a single answer.
- *Fix-It Shop* (ch.3): a customer bubble describes a symptom; the kid taps checks in order from a checklist (power,
  cable, restart, settings, sound, caps lock, network, close/reopen app, swap part) — each check costs a minute on a
  friendly clock and shows a result; the fault is found when the right check "clicks". Explorer: the checklist is given
  and the order is scored; Pro: the kid first **builds the flowchart** (yes/no diamonds from tiles) and then runs it;
  cases 6-8 are connected systems (tablet → router → printer) where the broken box is not the one complaining, and a
  "swap in a working part" action isolates it.
- *Bits & Lights* (ch.4): five light switches = a 5-bit number (count to 31), then letters as numbers, then a pixel
  lamp board (bits ↔ picture). Pro adds "same number three ways" (switches, decimal, tally) for 2-DA-07.
- *Design Lab* (ch.5): a user card (a person with a need: can't see small text, uses one hand, very young, works in
  bright sun, was left out of the testing group) plus a device; the kid picks up to 3 changes from 9 tiles (bigger
  text, contrast, voice, one-hand mode, captions, haptics, lighter, longer battery, test with more people); the verdict
  explains who each change helps beyond the named user (the standard's "benefits others too" idea).
- *Gadget Garage* (ch.6, Pro): compose a gadget from parts for a brief; the game generates a 6-digit code for a
  classmate to "review" (they see the parts and the brief and give the 2-tap feedback).

**Chapters → levels.**

| Ch | Name | Levels | Standard | Progression |
|---|---|---|---|---|
| 1 | Parts Party | 6 (E1-6; P1-6) | 1B-CS-01; Pro 2-CS-01 | tablet (6 parts) → chain: tap → screen → processor → speaker → laptop adds keyboard/mouse (input vs output) → smart speaker (microphone sensor) → robot with plug-in light sensor (external part dependency) → printer depends on the tablet, tablet depends on the printer for paper output |
| 2 | Team Up | 6 (E1-4; P1-6) | 1B-CS-02; Pro 2-CS-02 | hardware/software sort (8 cards) → task chain "take a photo" → "play a song" → "video call" (two devices) → Pro: component picker, rain station brief → Pro: wireless vs wired trade-off brief (battery vs mobility) |
| 3 | Fix-It Shop | 8 (E1-5; P1-8) | 1B-CS-03; Pro 2-CS-03 | not responding → no power → no sound (headphones) → caps lock login → no network → Pro: build the flowchart first → connected: printer blames the router → two faults |
| 4 | Bits & Lights | 6 (E1-3 enrichment; P1-6) | 2-DA-07 | 5 switches → make 13 → letters as numbers → pixel lamp board 5x5 → same number three ways → a 2-colour picture is 2 bits per lamp |
| 5 | Design Lab | 5 (E1-3; P1-5) | 1B-IC-19; Pro 2-CS-01, 2-IC-21 | low-vision user → one-handed user → very young user → Pro: bright-sun user (change helps everyone) → Pro: face unlock tested on few people |
| 6 | Gadget Garage | maker (P) | 2-CS-02 | brief → parts → code → classmate review → edit once |
| ★ | Crew Challenge | 1/day | rotates ch.1,3 | seeded customer |

31 authored levels + maker.

**Controls.** Everything is tap-card-then-tap-slot (or tap-slot-then-pick), 48 px cards, 56 px on tablets; chains and
flowcharts are vertical lists with ▲▼ buttons per row (no drag needed); the five switches are real `role="switch"`
toggles with the knob inside its track (the audit's `knob` rule). Keyboard: Tab/arrows/Enter/Space, `1-5` flip
switches. Read-aloud reads every customer bubble; captions on.

**Progression.** Stars: 1 fixed/placed / 2 within the check or tap budget / 3 budget first try without T3. Crowns give
Gizmo tools on the wall and new customers. "Master Mechanic" badge for all eight Fix-It cases at 3 stars.

**Hints.** T1 "Which part remembers things when the power is off?"; T2 the slot glows with a silhouette; T3 the card
lifts. Fix-It T2 shows the customer's last action ("I pressed the volume key"); T3 greys out checks already ruled out.

**Explorer → Pro.** Part counts (6 vs 10+), chain lengths (3 vs 5), justification tiles, component picker with stats,
flowchart building before running, connected-system cases, Bits & Lights required, Design Lab bias briefs, Gadget
Garage.

**Teacher deep link.** `?o=im.ch3.b1.l2` / quest code `3 1 0 2`; mode `projector` enlarges one case for whole-class
play with big tap targets (teacher at the board).

**Progress.** `submit(totalStars, 'im <ch> L<n> <s>s <chapterStars>/<max> <E|P>')`; `brb:progress`: `{game:'im',
chapter:'fixit', level:5, stars:3, band:1, csta:['1B-CS-03'], checks:3}`.

**Kit reused / custom.** Reused: `Oomba.game` + biome `workshop`-like (`art-school` indoor props as the bench), Gizmo
from `Oomba.char` + `dress` goggles, `Oomba.ui.dialog` for customers, `Oomba.ui.ask` for 3-4 way verdict questions,
`Oomba.art.toCanvas` for device pictures where a kit prop exists (laptop, phone, speaker are in `art-props`/
`art-school`; otherwise our SVG), `Oomba.ui.hud(['timer:S'])` as the friendly clock, `stage.burst('sparks')` on a fix.
Custom: device outlines with slots (inline SVG + DOM slot buttons), card trays, the flowchart builder (DOM rows with
diamond/box styling), the switch board, the component picker table (DOM table with `data-fit-dense`, stats as filled
dots with text equivalents).

**Safety.** Customers are animals; no real brands or model numbers; "caps lock login" case says "the mailbox key
was typed with CAPS LOCK on" (never "type your password"); the network case uses "the Wi-Fi is off", no router
addresses.

**Tests.** vm-load levels; chain/flowchart solvers; picker scoring is monotone in the brief's needs; i18n parity; the
switch board passes the `knob` audit rule at 5 sizes; cover recipe: Fix-It case 3 with the tablet open.

### 5.5 The Quest Card (all four games)

One shared screen pattern after Play: the **chapter map** (a scroll-free grid of chapter tiles with stars) and a gear
that opens the **Quest Card**: Band (Explorer / Pro), Pairs chime (on/off, 1B default on), Read-aloud, and **"Enter a
quest code"** (4 digits on our keypad). The code tuple is `<chapter 1-9><band 1|2><mode 0-3><level 0-9>`; `0` means
default. The game remembers the last code and shows "Class quest: Loops, Pro" on the map. Teachers see the same codes
on the printed plan and in the step body. When `BRB.params` lands (§9.1), the Play link carries the same tuple and the
keypad becomes the fallback; the card also gains "Locked by your teacher" when `lock` is set. In a **live** frame the
keypad is hidden (no typing live) and the host's chosen chapter arrives in the live `start` event instead.

---------------------------------------------------------------------------------------------------------------------------

## 6. Live sets, the Would You Rather "tech choices" set, the Builder capstone

### 6.1 Live quiz sets (warm-ups and "boss rounds")

Fourteen **teacher sets** (7 units × 2 bands), each 8 items, 2-4 choices, 15 s (20 s for the three longest), every
item carrying `cat:'<CSTA id>'` so a per-standard mark survives once `cat` is kept through snapshots and run saves
(§7.3). They ship as catalogue JSON and are materialised into the teacher's "My sets" with the lesson (§8.3), so they
work in Quest Race (1B default: the race keeps slow readers in), Question Battle (2 default) and Brain Board (`cat`
becomes the column heading, which makes a "CSTA board" for review day for free). English-only is fine: set text is
shown verbatim in every UI language. Rules for items: no trademarks, no digit runs, no "your password"; distractors
are real misconceptions. The "boss round" variant of each set (another 8 items, harder) is the end-of-unit review
and is tagged the same way.

| Set | Items | Sample questions (answer in **bold**) → CSTA id checked |
|---|---|---|
| U1 Explorer | 8 | "Bolt must go forward 3 and turn. Which comes first?" **move** / turn / lamp → 1B-AP-10 · "repeat 4 { move } moves Bolt how far?" 1 / **4** / 8 → 1B-AP-10 · "Which block checks something before acting?" repeat / **if** / move → 1B-AP-10 · "Two routes both reach the lamp. Which is better?" the longer one / **the one that fits the goal (shorter or safer)** / neither → 1B-AP-08 |
| U1 Pro | 8 | "`repeat 3 { repeat 2 { move } turn }`: how many moves?" 5 / **6** / 9 → 2-AP-12 · "Open the door only if has key AND at door. Has key, not at door: opens?" yes / **no** → 2-AP-12 · "Best name for a variable counting sparks left?" x / s1 / **sparksLeft** → 2-AP-11 · "A flowchart diamond means…" a loop / **a decision** / the end → 2-AP-10 |
| U2 Explorer | 8 | "Bolt goes one step too far at the end of a loop. The bug is most likely…" **the repeat count** / the lamp / the colour → 1B-AP-15 · "First thing to do when a program fails?" delete it all / **run it step by step and watch** / add more blocks → 1B-AP-15 · "You changed a classmate's level. What goes on it?" nothing / **a credit line** / your name only → 1B-AP-14 |
| U2 Pro | 8 | "A program works on 2 maps and fails on a map with no lamp. What was missing?" a longer loop / **a test for the no-lamp case** / a faster robot → 2-AP-17 · "Fewest blocks vs fewest steps disagree. You should…" always pick fewest blocks / **pick by the goal and say why** / flip a coin → 2-AP-10 · "Comments in a program are for…" the robot / **people reading it later** / speed → 2-AP-19 |
| U3 Explorer | 8 | "To find the most common pet, first…" **group and count** / sort by name / draw a line chart → 1B-DA-06 · "Best chart for 'change over the week'?" **line** / pictograph of totals / none → 1B-DA-06 · "Two measurements. Is that enough to predict?" yes / **no, collect more** → 1B-DA-07 · "Which column is NOT needed to predict plant height?" days / water / **day of the week** → 1B-DA-07 |
| U3 Pro | 8 | "12 of 30 said yes. As a percentage?" 12% / **40%** / 60% → 2-DA-08 · "A survey row says 'banana' for age. You should…" keep it / **remove it (junk response)** / change it to 10 → 2-DA-08 · "Binary 00101 is…" 3 / **5** / 10 → 2-DA-07 · "Your model predicts 80 cm; the ball went 60 cm three times. Next step?" **change the model and test again** / ignore the data / pick 70 → 2-DA-09 |
| U4 Explorer | 8 | "A big picture is sent as…" one giant piece / **many small packets** / a sound → 1B-NI-04 · "Packets arrive out of order. The receiver…" gives up / **uses the numbers to rebuild** / prints them anyway → 1B-NI-04 · "Strongest passphrase?" cat / 1234 (shown as tiles) / **blue-turtle-piano-rain** → 1B-NI-05 · "A letter promises a prize if you send your mailbox key. It is…" a friend / **a phish** → 1B-NI-05 |
| U4 Pro | 8 | "A protocol is…" a cable / **rules computers agree on for sending** / a password → 2-NI-04 · "A packet is lost. The sender finds out because…" **no 'got it' arrived in time** / the screen turns red / it never finds out → 2-NI-04 · "Which is a physical security measure?" firewall / HTTPS / **locking the server room** → 2-NI-05 · "Caesar shift 3 turns CAB into…" **FDE** / ABC / ZYX → 2-NI-06 · "Public profiles help scammers because…" **they give clues for guessing and tricking** / they are slow / they cost money → 2-IC-23 |
| U5 Explorer | 8 | "Which part remembers your photos with the power off?" processor / **storage** / speaker → 1B-CS-01 · "The camera app is…" hardware / **software** → 1B-CS-02 · "No sound. Try first:" buy new speakers / **check headphones and volume** / restart the school → 1B-CS-03 · "A robot's light sensor is…" software / **an external part the robot depends on** / a battery → 1B-CS-01 |
| U5 Pro | 8 | "A printer won't print; the tablet is fine. Next systematic step?" **check the connection between them** / replace the tablet / shout → 2-CS-03 · "Bluetooth sensor vs cable: the trade-off is…" colour / **mobility vs extra battery** / price only → 2-CS-02 · "A checklist for fixing is like…" a recipe for soup / **a pilot's pre-flight list** / a poem → 2-CS-03 · "Studying how people use a device to improve it is called…" **human-computer interaction** / networking / encryption → 2-CS-01 |
| U6 Explorer | 8 | "GPS changed how people…" **find their way** / cook / sleep → 1B-IC-18 · "Adding read-aloud to a game helps…" nobody / only one person / **many kinds of players** → 1B-IC-19 · "A picture online with no permission to reuse. You…" use it anyway / **ask or pick an allowed one** / crop it → 1B-IC-21 · "Asking another class to try your game is called…" cheating / **getting feedback** / a bug → 1B-IC-20 |
| U6 Pro | 8 | "Driverless buses: a trade-off is…" **fewer driving jobs, more software jobs** / no trade-off / only bad → 2-IC-20 · "Face unlock worked worse for some people because…" phones are slow / **the testing group lacked diversity** / faces change → 2-IC-21 · "Sharing your art publicly: a cost is…" nothing / **personal info can be misused** / art gets worse → 2-IC-23 · "A survey of 100 classmates to improve a game is a form of…" **crowdsourcing** / encryption / debugging → 2-IC-22 |
| U7 Explorer | 8 | "First step of making a game for someone?" build it / **decide who it is for and plan** / add music → 1B-AP-13 · "Breaking the game into parts is called…" looping / **decomposition** / credit → 1B-AP-11 · "During testing, the maker should…" explain everything / **watch quietly** / play instead → 1B-AP-15 |
| U7 Pro | 8 | "Your team has 3 sessions and 4 features. You should…" build all at once / **set milestones and split roles** / skip planning → 2-AP-18 · "A 'How to play' card is…" a bug / **documentation** / a variable → 2-AP-19 · "Testers found a 'too hard' level. Incorporating feedback means…" ignoring it / **changing the level and re-testing** / blaming testers → 2-AP-15 |

Hosting: `/live?mode=quest-race&set=<setId>&class=<classId>&cl=<clId>&step=<stepId>` from the lesson page (the
mode form of the Host-live link, fixing `map-teach.md` gotcha 1); results land in `live_runs`/`live_run_scores` and
the bound step gets the "live" score. Solo practice: a `computing` bank subject is **not** proposed for v1 (it forces
all 13 languages at 4 levels and a pack rebuild); instead each set is also playable solo through Question Battle's
"my sets" once the teacher owns it, which the materialiser guarantees.

### 6.2 "Boss round" mechanics kids like

Quest Race for Explorer (everyone moves, nobody is eliminated); Question Battle for Pro (teams from the class teams
editor; the dashboard's "needs help" flag tells the teacher whom to visit during main play). Review day: Brain Board
with columns = CSTA concepts (via `cat`), 5 tiles easy→hard, which doubles as the class's visible "standards board".

### 6.3 Would You Rather (Live): topic `tech` ("Tech choices")

Mechanism (from the map): new items with `cat:'tech'` in `scripts/data/would-you-rather/en.json` plus the 12 other
language files (English fallback per item is allowed by `wyr.js`, but the ≥90% pack rule means we translate all 30 up
front: they are short), `cat.tech` names in `ui.json` ×13, `tech` added to `CATS` (wyr-bank.js) and `TOPICS` (wyr.js),
`node scripts/wyr-bank.js`, seed. Starter from the lesson page: `/live?mode=wyr&class=<id>` (topics are not
preselectable by URL today, so the plan says "pick Tech choices, 10 questions, 20 s"; §9.3 proposes `&wyr=tech:10:20`).
Items also appear in the solo game's topic chips, where the kid sees world poll bars after voting (`BRB.poll`).

Rules: ≤60 chars per side, no brands, no personal questions, both sides defensible (the point is the "why"), tags
from the existing `TAGS` traits. Each item lists the standard it opens up for the minority-side "why?" talk.
Explorer items are concrete; Pro items (marked P) carry trade-offs. The live picker shows all 30 mixed; the lesson
plan names which 10 to keep for L6.1 and which 8 for L6.3 (host picks count; order is shuffled, so the plan says
"play 10 and stop").

| # | Would you rather… (A) | …or (B) | Opens up |
|---|---|---|---|
| 1 | have a robot that cleans your room | a robot that does your homework (and you learn nothing) | 1B-IC-18 / 2-IC-20 |
| 2 | live with no maps app for a year | no music app for a year | 1B-IC-18 |
| 3 | video-call a friend far away every day | get one paper letter from them a month | 1B-IC-18 |
| 4 | be able to search any fact instantly | remember everything you read | 1B-IC-18 |
| 5 | have a watch that counts your steps | a watch that cannot track anything | 2-IC-23 (P) |
| 6 | ride a driverless school bus | a bus with a driver and a longer route | 2-IC-20 (P) |
| 7 | play a game only on a huge screen | only on a tiny phone | 1B-IC-19 |
| 8 | use a game with captions but no sound | sound but no captions | 1B-IC-19 / 2-IC-21 |
| 9 | design a controller for one hand | a controller for tiny hands | 1B-IC-19 / 2-CS-01 |
| 10 | have your drawings shared with the whole world | shown only to your class | 2-IC-23 (P) / 1B-IC-21 |
| 11 | get credit for an idea a friend improved | improve a friend's idea and share the credit | 1B-AP-14 / 2-AP-16 |
| 12 | use free music made by others with credit | make all your own sounds | 1B-IC-21 |
| 13 | have a smart speaker that always listens | a speaker you must tap first | 2-IC-23 (P) |
| 14 | live in a town with cameras on every street | a town with none | 2-IC-23 (P) |
| 15 | have a job a robot could do faster | a job that needs you to fix the robot | 2-IC-20 (P) |
| 16 | learn from a video that never asks questions | an app that asks you questions all the time | 1B-IC-18 |
| 17 | have a phone that unlocks with your face | a phone that unlocks with a long passphrase | 2-IC-21 / 2-NI-05 (P) |
| 18 | let a game pick your next level for you | always pick it yourself | 2-IC-20 (P) |
| 19 | test your game with your best friends | with people you've never met | 1B-IC-20 / 2-AP-15 |
| 20 | have a translator earpiece for any language | learn one new language perfectly | 1B-IC-18 |
| 21 | fly a delivery drone over your street | wait a day for a delivery van | 2-IC-20 (P) |
| 22 | have the internet go off for a weekend | have no screens after dinner forever | 1B-IC-18 |
| 23 | play a game made for everyone | a harder game made just for you | 1B-IC-19 / 2-IC-21 |
| 24 | ask 100 people to vote on your game's name | pick the name with your team | 2-IC-22 (P) |
| 25 | have a tablet that is cheap but slow | expensive but fast | 2-CS-02 (P) |
| 26 | charge your gadget once a week and carry it | plug it in all day and never charge it | 2-CS-02 (P) |
| 27 | have a secret diary app with a lock | a paper diary under your bed | 1B-NI-05 |
| 28 | back up your photos in two places | keep them only on your tablet | 1B-NI-05 / 2-NI-05 |
| 29 | be the first to try a brand-new app | wait until your friends say it works | 1B-IC-18 |
| 30 | invent a gadget that helps one person a lot | one that helps everyone a little | 1B-IC-19 / 2-IC-21 (P) |

Tag suggestions (existing trait list): 1-4, 16, 20, 22, 29 `curious/clever`; 5, 13, 14, 17, 27, 28 `careful`; 6, 15, 18,
21, 25, 26 `bold/practical`; 7-9, 23, 30 `kind`; 10-12, 19, 24 `friendly/creative`. Translation note for `notes.json`:
keep "passphrase" as one word's local equivalent; never localise into a brand.

Teacher use: after each vote the projector shows the split; the host asks the smaller side "why?" (the WYR Live game
already pauses on results). For L6.3 the plan uses items 10-14, 17, 27, 28 (share-or-keep subset).

### 6.4 The Builder capstone kit

**Planning sheet (printable, one page; Explorer and Pro versions).**

| Box | Explorer (3-5) | Pro (6-8) |
|---|---|---|
| Who is it for? | draw/name a player type (younger kid, grandparent, a friend who likes…) | user card: age, device, one need (text size, captions, one hand) |
| The one-sentence game | "You are a ___ who must ___ before ___." | pitch + genre + win/lose rule |
| Parts (decomposition) | 4 boxes: start screen, playing, winning, losing | feature tree: 3 features → 2 sub-parts each; mark "must / nice" |
| Rules with variables | "score goes up when…", "lives go down when…" | variables table: name, type, starts at, changes when; two conditions with AND/OR |
| Storyboard | 4 panels | 6 panels + the "How to play" card text (documentation) |
| Roles | driver / navigator, swap at the chime | driver / navigator / tester-recorder; timeline: session 1 plan+start, 2 build, 3 test+ship with milestones |
| Reused and credited | "I reused: ___ (template name / classmate idea)" | credits block: template, ideas, kit art; the exact credit line to paste |
| Accessibility check | tick: big buttons, read-aloud on, colours + shapes | tick 5: text size, contrast, captions, one-hand, no flashing |

The sheet's first 300 characters (the pitch + user line) are what the team pastes as the Builder's first message
(the build step's own prefill is the lesson's generic prompt; the sheet overrides it in chat).

**Rubric (4 rows × 3 levels, mapped to CSTA; teacher ticks on the lesson progress page's feedback box, 1 line per
row, and the question-step answers hold the evidence).**

| Row | Meets (2) | Approaching (1) | Not yet (0) | CSTA ids |
|---|---|---|---|---|
| Plan and decomposition | plan has parts and a named user; built game matches the plan or the change is explained | plan exists, loosely followed | no plan | 1B-AP-11, 1B-AP-13 / 2-AP-13, 2-AP-18 |
| Program behaviour | score/lives (variables) change by rules; at least one condition and one loop or repeated event are visible in play; game is winnable and losable | some rules work | the template is unchanged | 1B-AP-09, 1B-AP-10, 1B-AP-12 / 2-AP-11, 2-AP-12, 2-AP-16 |
| Test, feedback, iterate | ran the protocol, has 3 tester cards, made and explained one change | tested, no change | not tested | 1B-AP-15, 1B-IC-20, 1B-AP-16 / 2-AP-17, 2-AP-15, 2-IC-22, 2-DA-09 |
| Communicate and credit | How-to-play card, credits line, 60-s demo names one design choice; accessibility ticks | two of four | none | 1B-AP-14, 1B-AP-17, 1B-IC-19, 1B-IC-21 / 2-AP-16, 2-AP-19, 2-IC-21 |

**Peer play-testing protocol (L7.3; 3 rounds × 6 minutes).**
1. Makers hand in (publishes at class visibility; clean scan = instant, flagged = teacher sees "waiting for review" and
   the team demos from the Studio preview instead).
2. Testers open the class Games tab on their own device; makers sit beside them with a "no talking" card.
3. Tester plays 3 minutes; recorder fills the tester card (Explorer: 4 faces for fun / clear / fair / would play again +
   1 word tile from 8; Pro: a 5-row 1-5 tally incl. "too easy ↔ too hard" and "I got stuck at…" tapped on a storyboard
   panel). Cards are paper, or the tester's own Data Detective Tally (their save only; nothing crosses players).
4. Rotate; after 3 rounds the makers tally (Pro: in Data Detective's Tally → bar chart → claim: "most testers found
   level 2 too hard").
5. One change ("changed because: ___"), re-hand-in, 60-second demo: who it's for, one design choice, what changed.

**Class-sharing safety (what the platform already enforces, stated for teachers).** Hand-in never widens beyond the
class; every version is statically scanned; flagged builds wait for a human; the teacher can remove any class game
from the Games tab; kids never type into each other's games; the Builder refuses personal-info prompts and external
links; assets are kit art or the kid's own drawings only (which is why the credits line is about templates and ideas,
not downloaded media); school accounts set to `publishing:'school'` can never go public. Teacher-facing text adds two
rules of our own: team names are the Builder's suggested names (no real names), and demos show the game, not the chat.

**Capacity plan (from `map-teach.md` §5.5).** One device per team halves message volume; "one change per message" and
a printed 10-message budget per session keep a class of 30 (≈12 teams) near 120 turns per lesson; this still exceeds
the free site-wide pool, so the teacher page says plainly: *the capstone needs a school plan or a day the admin raised
the AI budget*; without it kids see "resting" and the lesson falls back to the paper prototype path.

---------------------------------------------------------------------------------------------------------------------------

## 7. Assessment and tracking

Principle: the game run is the assessment; the teacher reads stars and marks, not worksheets. Everything below is
split into **works today** (the plumbing in `map-teach.md`/`map-games.md`) and **needs adding**.

### 7.1 Exit tickets that don't feel like tests

- **Case-closed card** (in every game, end of each level played from a lesson): two taps on top of `Oomba.ui.win`:
  one concept check (`Oomba.ui.ask`, 3 tiles, drawn from the level's `check` field) and one confidence face (3 faces).
  Kids see it as the level's end screen. The game folds the result into the score label: `rr loops L4 2s 14/27 P c1 f3`
  (`c1` = check right, `f3` = confident). Works today: one 40-char label per step, best score kept, so the label is the
  *last* label at the best score, which is acceptable for a two-tap check but lossy; §7.2 fixes it.
- **Typed reflection** only where the standard is about explaining (L2.3, L6.1, L7.x): the lesson's `question` step
  (3000 chars, teacher feedback, "to read" badges). Works today.
- **Live exit**: the unit's boss-round set hosted in the last 7 minutes instead of the card, when the teacher prefers
  a class-wide read (marks per question with `cat`). Works today for marks; the per-standard rollup needs `cat` kept
  (§7.3).
- **Capstone**: rubric rows as feedback lines on the per-lesson progress page + question steps. Works today.

### 7.2 The structured progress message (`brb:progress`) — needs adding, small

SDK: `BRB.progress(detail)` where `detail` is `{ game, chapter, level, stars, band, csta:[...], ...numbers }`, JSON ≤
1 KB, keys `[a-z][a-zA-Z0-9]{0,23}`, values numbers/booleans/short `[A-Za-z0-9-]` strings only, rate-limited to one per
2 s like scores. Page (`play.js` `TYPES`) validates and posts to `/api/progress/:cl/:step/game` as `{event:'progress',
detail}` only when the play has a lesson context (free play drops it, matching today's rule that free play never
counts). Server: `step_progress.detail` TEXT (latest), plus an append-only `step_progress_events(class_lesson_id,
step_id, user_id, at, detail)` capped at 200 rows per cell (so star history and per-level checks survive). Tests:
`sdk-protocol.test.js` (shape, size, rejection of strings with spaces/URLs), `progress.test.js`. The games already
emit the label fallback, so nothing breaks before this lands.

### 7.3 Per-class "Standards practised" view

**What it shows (tab `Standards` on the class page, teacher-only, same deletion hooks and privacy as the gradebook):**
a grid of the 21 or 23 ids for the class's band (both when mixed) × students, each cell one of: blank (no lesson
assigned that practises it), ○ assigned not started, ◐ practised (any level with that `csta` played / any quiz item
with that `cat` answered), ● practised with evidence (≥2 stars on a level, or ≥ 60% on the id's quiz items, or a
rubric row ≥ 1), plus a row footer "practised by N of M". Hover/tap a cell: which lessons/levels, stars, last date.
Filters: unit, band. CSV like `progress.csv`. A read-only **class standards board** (counts only, no names) is
printable for a wall or a principal.

**Data it uses:**

| Signal | Source | Status |
|---|---|---|
| which ids a lesson step practises | `lesson_steps.standards` (comma list) written by the materialiser from the catalogue | needs adding: column + migration, materialiser writes it, editor shows it read-only |
| a game step was played / score / label | `step_progress` (`status`, `score`, `label`, `plays`, `seconds`) | works today |
| per-level stars and `csta` of the levels actually played | `brb:progress` detail/events | needs adding (§7.2); until then ◐ comes from `status='done'` on a step whose `standards` list is known, and ● from `score` ≥ a per-step threshold stored in the catalogue |
| quiz/live marks per standard | `live_run_scores.marks` + `live_runs.items[].cat`; `lesson_steps.items[].cat` | needs adding: keep `cat` in `addQuizStep` snapshots and in `classlive-results` item rows (two one-line changes + tests) |
| question-step reflections, rubric rows | `step_progress.answer`, `feedback` | works today (teacher reads; the view links to "to read") |
| capstone hand-in | `step_progress.game_id` + class visibility | works today |

**Query**: one grouped SQL over `class_lessons (removed_at IS NULL) → lesson_steps → step_progress` by id × student,
union `live_runs(class_id) → live_run_scores` by `cat`, computed per page load (class sizes ≤ 60; no cache needed),
in a new `server/services/standards.js` with `server/standards/csta.js` holding the 44 ids → `{band, concept, short}`
(the English statement is shown with `el()`; the id is a token). i18n: tab name, legend, CSV headers in 13 locales.

### 7.4 What a teacher can honestly claim

With the additions: "every student practised 1B-AP-10 in three lessons, 24 of 26 reached 2 stars on a loops level,
and the class averaged 71% on the four U1 quiz items tagged 1B-AP-10." Without them (day one): "every student played
the loops lesson (done), best stars label, and the class's live results per question." The teacher page says which
one the school is getting.

---------------------------------------------------------------------------------------------------------------------------

## 8. How teachers reach it

### 8.1 Public page `/teachers/cs-quest` (and `/learn/computer-science` hub)

Built like `/teachers/live` (`routes/teachers.js` `page()` with `seo{}`, `el()/fb()` English-first copy under
`teachers.cs.*`, added to `seo.js LOCALIZED`, `sitemapEntries`, `seo.test.js PUBLIC`, OG card via `og-images.js`,
`how.js STEPS.teachersCs` + a `csShots` block in `how-shots.js` with the demo school names only, no prices). Sections:
hero ("A ready-made computer-science program for grades 3-8, built as games"), the Byte Crew with four "Try it" launch
buttons (official games are playable signed-out: `launchGame(slug)`), the 7 units as cards with lesson titles and
CSTA ids, a standards coverage table (the §3 matrix, collapsed), "How a lesson runs" (the §4.0 shape with 4 how-it-works
screenshots: lesson page, live warm-up, game chapter map, standards tab), FAQ JSON-LD (devices, time, grade bands,
privacy: no kid names, nothing typed inside games, class-only sharing), and "Set up my school" (`setupBlock`). The
hub adds `computer-science` to `learn.js HUBS` with the four slugs, `LEARNING` entries (`teaches`, `educationalLevel`
3-8), `CONTENT_UPDATED`. No child names, no prices anywhere on these pages (tests).

### 8.2 Signed-in page `/teach/cs-quest` ("CS Quest program")

Follows `/teach` (`requireUser`, `isSchoolStaff`, `active:'classes'`, schools CSS). It lists the catalogue: Unit → Lesson
rows with band chips (3-5 / 6-8), minutes, CSTA ids, and per row **"Add to my library"** (and per unit "Add all 3-5" /
"Add all 6-8"). Already-added rows show "In your library · Open" (matched by `lessons.copied_from = 'cs:<key>'`, see
8.3). The page links to the printable plan (8.4) and to a one-screen "Before your first lesson" checklist (login cards,
device check with Inside the Machine Fix-It case 3 as the class's own test, enable live, school plan note for the
capstone). Linked from `/teach` (a "CS Quest" tile next to "Lesson library") and from the library tools row.

### 8.3 The mechanism: catalogue + materialiser (the map's recommended option 1)

Content lives in the repo as `seed-lessons/cs-quest/<key>.json`, one per lesson per band, validated by a unit test
against `L.cleanStep` limits and against `csta.json`:

```
{ "key": "cs-1b-l1-2", "unit": "algorithms", "band": "1B", "title": "Round and Round - loops",
  "grade": "Grades 3-5", "subject": "Computer science", "summary": "...≤600",
  "objectives": ["I can use a repeat block...", "..."], "minutes": 45,
  "standards": ["1B-AP-10"], "questCode": "2102",
  "steps": [
    { "kind": "text", "title": "Warm-up: U1 Explorer live set", "minutes": 7, "body": "Host the set 'CS Quest U1 Explorer' in Quest Race...", "standards": ["1B-AP-10","1B-AP-08"] },
    { "kind": "game", "gameSlug": "robo-route", "title": "Robo Route: Loops (quest code 2 1 0 2)", "minutes": 18, "body": "...", "standards": ["1B-AP-10"], "params": "rr.ch2.b1" },
    { "kind": "text", "title": "Talk: when does a loop not help?", "minutes": 7, "body": "..." },
    { "kind": "question", "title": "Exit: how many times does Bolt move?", "minutes": 5, "body": "..." }
  ],
  "set": { "title": "CS Quest U1 Explorer", "items": [ { "q": "...", "choices": ["..."], "answer": 1, "secs": 15, "cat": "1B-AP-10" } ] },
  "wyr": null, "print": { "hook": "...", "discussion": ["...", "..."], "differentiation": "...", "unplugged": "...", "notes": "..." } }
```

`server/services/lesson-templates.js` materialises a key into the caller's library exactly as `seedDemoLessons` does:
`L.createLesson` (owner = the teacher, school = their staff school) → `L.addStep` per step (game steps resolve
`gameSlug` via `games.getGameBySlug`, only when published; a missing game becomes a text step saying "game not
available yet" rather than being silently skipped) → `SETS.createSet` for `set` (so it appears under "My sets" on
`/live`) → stores `copied_from = 'cs:<key>'` and, once the column exists, `lesson_steps.standards`. Route `POST
/api/lessons/from-template/:key` (rate-limited like `lesson-new`), returns the new lesson id; the UI redirects to the
editor with a `?drafted=` style banner ("Added to your library. You can edit anything."). The lesson is then an
ordinary owned lesson: assign to a class with units and dates, students see it open, progress and live work
unchanged. A teacher who wants the program's updates later re-adds (a "newer version available" chip compares a
`version` field in the JSON with one stored in the lesson summary's first line); no live-link to the catalogue, which
keeps teachers' edits safe. Quiz steps (`LIVE_HOMEWORK`) are not used by the catalogue because the flag is off by
default; the live set is the warm-up instead.

### 8.4 Lesson pages, printable

The lesson editor shows the materialised lesson as usual. A new **print view** `/teach/lessons/:id/print` renders the
`.printdoc` (title, band, 45-min table from step minutes, objectives, standards with short statements, each step's
body, and the `print` block fields that the catalogue stored in a `text` step titled "Teacher notes (print)" placed
last with `minutes: 0` so it never appears in the student timeline — students see steps with 0 minutes too, so the
materialiser marks it `[teacher]` in the title and the student page hides steps whose title starts with that tag:
a 3-line change in `routes/progress.js`), with a `data-print` button and `scripts:['/js/print.js']`. The unplugged
page and the planning sheet / tester cards / cipher wheel are static printable HTML under the same route with
`?sheet=<name>`.

### 8.5 Buttons on the lesson page (teacher preview)

Per step, next to the existing Play / Host live links:
- text step "Warm-up": **Host warm-up** → `/live?mode=quest-race&set=<setId>&class=<classId>&cl=<clId>&step=<gameStepId>`
  (set id stored in the step body's first line as `set:<id>` by the materialiser until a `lesson_steps.set_id` is
  allowed for text steps; the route reads it).
- game step: **Play** (student link, with `?o=<params>` once `BRB.params` exists), **Open on projector** (same link
  without lesson context), the quest code printed large.
- WYR step (L6.1/L6.3): **Host Would You Rather** → `/live?mode=wyr&class=<id>` with the topic named in the body.
- **Assign to class** is the existing library/class flow; the CS Quest page adds a shortcut "Assign unit to…" that
  creates a class unit named after the CS Quest unit and assigns its lessons with weekly dates.
- Fix for gotcha 1: the Host-live link emits `mode=` for built-in mode games via `liveGameOf`.

---------------------------------------------------------------------------------------------------------------------------

## 9. Platform additions this design asks for (ranked by value per line of code)

| # | Addition | Why the kid-first design wants it | Size | Without it |
|---|---|---|---|---|
| 1 | `lesson_steps.standards` + materialiser + Standards tab/CSV (§7.3) | the only way a teacher sees "standards practised" | medium (migration, service, tab, 13-locale keys, tests) | gradebook only |
| 2 | Keep `cat` through quiz snapshots and live run item rows | per-standard quiz marks | tiny | marks per question without ids |
| 3 | `BRB.params` (`?o=` allow-listed token, signed into the frame token, `init.params`, frozen SDK getter, `lesson_steps.params`) | Play opens the right chapter/band/mode; no quest codes to type | small-medium (route, token, SDK, docs, tests) | 4-digit quest codes (shipped in v1 anyway) |
| 4 | `brb:progress` message + `step_progress.detail/events` (§7.2) | per-level stars, checks, `csta` per play | medium | 40-char label encoding |
| 5 | Host-live link uses `mode=` for built-in games; `/live` accepts `&wyr=tech:10:20` | one-tap warm-ups and WYR rounds | tiny | plan text says what to pick |
| 6 | `data-detective` in `POLL_GAMES` | Survey Lab world polls (2-DA-08, 2-IC-22) | one line + test | tally-only chapter |
| 7 | Print view for lessons + `[teacher]` step hiding | printable 45-min plans | small | teachers print the editor page |
| 8 | Catalogue + `lesson-templates` service + `/teach/cs-quest` + public page | the whole delivery mechanism | medium | none: required |
| 9 | WYR `tech` topic (data ×13, ui.json, CATS/TOPICS, rebuild) | L6.1/L6.3 | small, mostly content | skip WYR, use question steps |
| 10 | School-plan note / raised `AI_DAILY_BUDGET_USD` for capstone days | capstone viability | config/ops | paper prototypes |

Not asked for (deliberately): a shared level-store or kid-authored text sharing (codes are self-contained and
wordless), a `computing` bank subject (13-language cost; sets cover it), new kit widgets (all boards are DOM in the
game), a new step kind, official school-less lessons (option 3 in the map), cross-game currency (per-game saves).

---------------------------------------------------------------------------------------------------------------------------

## 10. Risks and open questions

**Risks**
1. **Four large kit games at once.** Robo Route alone is Code-Isle-sized logic (interpreter, flowchart, maker, 47
   levels, 13 languages). Mitigation: ship in two waves (Robo Route + Inside the Machine with Units 1, 2, 5; then Data
   Detective + Packet Post with 3, 4, 6, 7); the catalogue materialiser already turns a missing game into a text step.
2. **Fit audit on dense editors.** The block strip with nested containers at 390×844 and 150% text is the hardest
   layout on the site; palettes with >8 blocks must paginate (scroller rule) and the strip must never overlap the grid.
   Mitigation: Robo Route's Chromium test runs the five sizes on its densest level from day one; `data-fit-dense` only
   on grids/tables, never on buttons.
3. **Scanner failures aborting the seed.** Packet Post's phishing letters and cipher text are a minefield (domains,
   `@`, digit runs, profanity after a shift, "password"). Mitigation: a build-time lint over every string literal and
   pack with the same regexes, plus the shifted-word profanity check; no real-world addresses at all.
4. **Share codes are not a level editor.** Kids will expect free painting; the constrained maker (template + seed +
   extras) may disappoint older kids. Mitigation: Pro gets the "extras" code (lamp/colour taps); the real creative
   outlet is the Builder capstone; state this on the teacher page.
5. **Progress label encoding is lossy** until `brb:progress` exists (best score keeps the last label at that score);
   a teacher may read "L4 2s" when the kid later did L5. Mitigation: the label always carries chapter totals; ship #4
   early.
6. **Builder capacity.** A 30-kid capstone cannot run on the free pool; the lesson has a paper path, but the promise
   "design your own game" is the program's headline. Mitigation: the teacher page gates L7 behind a school plan
   check and the admin budget; staggered starts; one device per team.
7. **WYR Live is unscored and topic-less by URL**; teachers may host the wrong topic. Mitigation: #5, plan text, and
   the projector shows the topic name.
8. **Poll data is site-wide, not class-wide** (MIN_SHOWN 5 and one vote per account/item): Survey Lab's "world poll"
   must be described honestly; class data comes from the hands-up tally.
9. **Pairs on one device** (1B default) means one login records the progress: the second kid's gradebook cell is
   empty unless they also play. Mitigation: the swap chime plus a "both log in once" note; the Standards view treats a
   pair-step as practised when the teacher ticks it (manual override in the view: a small addition to #1).
10. **13-language in-game text** for ~150 levels × 4 games is a translation volume comparable to Atlas Quest's; packs
    keep the file small but the i18n parity tests will block any level added without its 12 translations.
    Mitigation: level `learn/hints` keep a strict template style; a `scripts/cs-quest-i18n.mjs` scaffold like the
    WYR one.
11. **Standards view is an education record.** Must stay teacher-only, inside the class, with the leave/merge deletion
    hooks (legal-review items 42-43 pattern); never on projectors or public pages.

**Open questions**
1. Does the program promise full coverage *per student* (then pairs must both log in) or *per class* (then pair play
   is fine)? The Standards tab's legend depends on it.
2. Should Explorer stars earned by a 6-8 student count toward the 2-level ids they map to? Proposed: silver (shown,
   not counted as "with evidence").
3. Is `BRB.params` acceptable under the frozen-SDK rule ("only ever gains plumbing")? It is additive and read-only;
   needs the SDK owner's yes before Play links depend on it.
4. Where do the printable sheets live long-term: static HTML under `/teach/lessons/:id/print?sheet=` (proposed) or
   PDFs in `public/` (simpler, not localisable, not themeable)?
5. Do we want a `cs-quest` **Studio template** ("Quest Show": a quiz-plus-runner starter with a credits slot and a
   settings check) so Explorer capstones start from something that already meets the rubric's accessibility row? It
   needs the small `lesson_steps.template` change the map describes.
6. Wave order: Units 1/2/5 first (Robo Route + Inside the Machine) matches the "coding block" most schools book
   first; confirm with the first two pilot teachers before authoring 36 Packet Post levels.
7. Live hosting of the games themselves (a class racing through Bug Hunt together) is possible later (`live` pack,
   tap-only input already) but is out of scope here; is it wanted for v2?
