# Oomba Canvas API (1.0.0)

Oomba Canvas is the kit for **classroom activities**: a hands-on canvas where each student drags, builds and checks,
one problem at a time, with steps and hints. It is separate from the Oomba Kit (`kit/`, arcade games) and Kit 2
(`kit2/`, the 3D worlds). The Builder makes an activity when the builder picks **Classroom activity** on `/build/new`
(`server/builder/plan.js`, engine `canvas`); everything else is an **Arcade game**, built as before.

- Source: `canvas/src/` (`logic.js` the maths, `words.js` the in-game words in the 13 site languages, `style.js` the
  look, `ui.js` the page, `index.js` the global). `scripts/build-canvas.js` bundles it into
  `public/vendor/oomba-canvas/<version>/oomba-canvas.js` (plus a readable `oomba-canvas.css`, the font and
  `manifest.json`). Shipped versions are listed in `canvas/SHIPPED.json` and never change.
- Platform: `server/services/canvaskit.js` (the pinned tag, the scanner's `checkCanvas`, the self-test that runs the
  kit's own frozen file), `server/builder/templates/canvas.html` (the starter), `server/builder/canvas-rules.js`
  (generated from this page by `scripts/build-canvas-rules.js`: the Builder's CANVAS RULES).

## The page

An activity is one small page: the kit's pinned tag, an `oc-app` element, the activity as **JSON data** in an
`oc-activity` block, and one call.

```html
<title>Equivalent fractions</title>
<script src="/vendor/oomba-canvas/1.0.0/oomba-canvas.js" integrity="sha384-…" crossorigin="anonymous"></script>
<div id="oc-app"></div>
<script type="application/json" id="oc-activity">
{ "config": { "lang": "en", "support": "guided", "count": 5, "fresh": true, "board": false },
  "task": { "title": "Equivalent fractions", "say": "Make each fraction using smaller pieces." },
  "problems": [ { "tool": "fractions.equiv", "from": [3, 4], "to": 8 } ],
  "gen": null, "steps": {}, "hints": {} }
</script>
<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>
```

The data is JSON so the platform can read it: the Builder's self-test runs on it before a version is saved.

## What the student sees

- A top strip: the title, the support chip (Watch, Count up, Guided, On my own), ✓ right, ✗ not yet, "n to go" and a
  Keypad button.
- A task card: "Problem 3 of 5" and the problem's line (the kit writes it from the problem, in the player's language).
  🔊 reads `task.say` aloud: that fixed line only, never a line put together from pieces.
- The workspace: cream graph paper with one manipulative. Beside it (under it on phones) the Steps panel.
- The bottom band (it stays at the bottom on phones): the problem's question and Check, Hint, Clear. Up to 3 hints per
  problem; after a Check that is not right (or 45 s without a move) the Hint button lights up as "Stuck?".
- Check: a second try is allowed; then the kit shows a worked answer with its steps and moves on. Nothing flashes red
  and nothing buzzes.
- The end card: "4 of 5 right", Try new ones (a generator) or Try again, and Back (`BRB.back`).

## Behaviour

- **Digits only.** Students tap, drag and type digits (the kit's keypad, or the digit keys). There is no text field,
  no chat, nothing between players.
- **Their own copy.** Each student works on their own device. Their place in the set is kept in their own game save
  (`BRB.storage`, key `oc-progress-v1`) and resumes there; nothing leaves the device but the end result.
- **A fresh set each.** With `gen` and `config.fresh` (the default), each student gets a set of their own from a seed
  of their own, and a "seen" list keeps new sets from repeating problems.
- **Results.** At the end of a set the kit calls `BRB.gameOver({ won: right === total, score: right })`, once per set,
  exactly as the Big Divide does: the lesson's game step is done and the Classroom completion grade is posted.
  `config.board: true` (played on the board together) sends no score.
- **Theme.** The site's theme (`BRB.theme`), else the device's. Right to left for Arabic and Hebrew; the maths itself
  (bars, number lines, digit columns) always reads left to right.

## Tools

Each problem names a `tool`. The kit owns each tool's maths, in the dashboard's "Build it" contract
(`public/js/dash-build.js`, copied into the kit and frozen with it): `clean`, `start`, `check → { ok, hint }`, `solve`,
`steps`, `hints`, `gen`. A value that is a fraction is `[n, d]`.

<!-- builder:rules -->
CANVAS RULES (Oomba Canvas: this build is a classroom activity, or the builder asked for one). Every rule above still applies, except the KIT RULES: an activity is not an Oomba Kit game.
- What it is: a hands-on canvas where each student builds and checks one problem at a time, with steps and hints, on their own device. It is calm and education first: never add lives, timers, enemies, a title screen with Play, scores that go up by themselves, or the Oomba Kit.
- Start: start_from_template "canvas" (the classroom activity starter; it is allowed even though the tool list names only the arcade starters). Then make it theirs with edit_game on the oc-activity JSON block only: it must stay valid JSON (double quotes, no comments, no trailing commas). Change the <title> to match task.title.
- The data: config { lang: the language the builder writes in, support: "watch" | "count" | "guided" | "own", count: problems in a set (1 to 12), fresh: true (a new set per student from gen), board: true only when it is played on the board together }; task { title (short), say (one short sentence read aloud) }; problems: a list, or gen: one generator for a fresh set per student (use gen whenever the topic suits one); steps / hints: only to replace the kit's own lines for a tool, { "<tool>": ["line", ...] } (up to 6 steps, 1 to 3 hints, short, in the builder's language). The kit writes each problem's own line, question, steps and hints in every language: leave steps and hints empty unless they asked for something special.
- Tools (values: whole numbers, or fractions as [n, d]):
  fractions.equiv { from: [n, d], to: D } make n/d out of 1/D pieces (D must be a multiple of d); tray: [other piece sizes] optional. gen { dens: [2, 3, 4], mult: [2, 3] }
  fractions.shade { n, d } shade n of d parts. gen { dens }
  fractions.compare { a: [n, d], b: [n, d] } pick <, = or >. gen { dens }
  numberline.point { at, lo, hi, sub } tap where at goes (sub: parts in each whole; at × sub must be a whole number between lo × sub and hi × sub). gen { lo, hi, subs: [2, 4] }
  numberline.jump { from, by, lo, hi, sub } start at from, land on from + by. gen { lo, hi, subs }
  digits.add / digits.sub / digits.mul { a, b } column arithmetic in graph-paper digit boxes (sub: a ≥ b; mul: b is one digit). gen { digits: 2 }
  tiles.sort { items: [numbers], rule: "evenodd" | "less" (n) | "mult" (n) | "half" } or { items: [{ t, bin }], bins: ["group", ...] } sort into 2 to 4 groups. gen { rule, n, lo, hi, tiles }
  tiles.order { items: [numbers or fractions], dir: "up" | "down" } put in order (no two the same). gen { lo, hi, tiles, fractions: true, dens, dir }
- Never write answer-checking code: the kit checks every standard tool. Write only data. If the topic needs a tool the kit does not have yet (time, area, money, place value blocks), use the nearest tool, say in one short, kind sentence what you used, and never fake a checker.
- The self-test: every version is checked before it is saved. Every problem must be solvable by its worked answer and an empty start must never count as right; a version that fails is NOT saved, and the reply names each problem ("problem 3: cannot be solved: 5/6 cannot be made with pieces of 1/4"). Fix the data and save again.
- Safety: only the topic and the class's grade reach you. Never ask for or use students' names, never add free text, typing or chat for students (digits only, through the kit), never store or send anything about a student (the kit keeps their place on their own device and reports the end result itself). Read-aloud speaks task.say only.
- Results: the kit reports a set's result itself (BRB.gameOver once per set). Do not call BRB.gameOver, BRB.score or BRB.storage yourself.
- Crossover: when they ask to make it an arcade game instead, build a new arcade game (a quiz, runner or catching game on the Oomba Kit, following the KIT RULES) that asks the same problems as questions; it no longer uses Oomba Canvas. When an arcade game should become a classroom activity, start_from_template "canvas" and turn its questions into problems the tools can check.
- Say your plan in two short sentences (what they practise, how the help works), then build.
<!-- /builder -->

### Values and limits

| Tool | Data | Limits |
| --- | --- | --- |
| `fractions.equiv` | `from: [n, d]`, `to`, `tray?` | d 2–12, n 1–d, to 2–24 (≠ d); solvable only when to is a multiple of d |
| `fractions.shade` | `n`, `d` | d 2–12, n 1–d |
| `fractions.compare` | `a`, `b` | denominators 1–12 |
| `numberline.point` | `at`, `lo`, `hi`, `sub` | hi − lo 1–20, sub 1–12, at most 60 ticks |
| `numberline.jump` | `from`, `by`, `lo`, `hi`, `sub` | as above; the landing must be on a tick |
| `digits.add` / `sub` / `mul` | `a`, `b` | 0–99999; sub a ≥ b; mul a ≤ 9999, b 1–9 |
| `tiles.sort` | `items` + `rule` (`n`), or `items: [{ t, bin }]` + `bins` | 2–12 tiles, 2–4 groups |
| `tiles.order` | `items`, `dir` | 3–8 tiles, no two equal |

## The self-test

`Oc.selfTest(activity)` (and `server/services/canvaskit.js selfTestHtml(html)`, which runs the same frozen kit file on
the server) returns `{ ok, problems: [{ at, why }] }`. For every problem (or 30 a generator makes) it checks:

- the problem is one the tool can make (`clean`);
- `solve(p)` exists and `check(p, solve(p)).ok` is true: the worked answer passes;
- `check(p, start(p)).ok` is false: an empty start never counts as right;
- the steps and hints are there (1 to 3 hints), and the Builder's own lines are short.

`server/builder/tools.js` refuses to save a Builder version whose self-test fails, so a broken answer key never becomes
a version that could be shared or published, and the automatic playtest (`server/builder/autotest.js`) lists it too.

## Safety

- The scanner admits exactly the pinned tag (`checkCanvas`, like the Oomba Kit's `checkKit`); any other mention of
  `/vendor/oomba-canvas/` fails. The frame's CSP allows only that folder for the kit's script and font.
- No network, no `fetch`, no names. Only the topic and the class's grade reach the Builder.
- Read-aloud speaks the fixed `task.say` line only.

## Not yet (later phases)

The Studio's Activity panel (edit problems without a Builder message), teacher controls inside an activity (show answer,
board mode), live canvas runs, class codes and "Assign" for Builder activities, and a bounded score in the gradebook.
