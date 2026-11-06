# Cyber Defenders catalogue

The content of Oomba Academy's cybersecurity and online-safety course (grades 3-5 = band **1b**, "Explorer";
grades 6-8 = band **2**, "Pro"), set in Pim the owl's Netville post office. It is a standalone course beside
CS Quest: it reuses CS Quest's student-course machinery (`server/services/courses.js`), its deck format, its
check rules (three questions, pass 2 of 3) and its games (Packet Post, Would You Rather), but none of its
content files. Its own games carry the trick, chat and kindness units: Trick Inbox rounds (`chapter=<set>&band=..&lock=1`)
and Escape the Post Office practice locks (`chapter=<lock id>&band=..&lock=1` opens one lock alone; `chapter=escape` is
the whole room). Packet Post keeps the network, key and cipher units (1-2); Would You Rather is locked to its online
topic (`topic=online&lock=1`). Everything in this folder is data. Lesson text is English and shows verbatim in every UI
language; only the chrome around it is translated (`courses.*` keys). US spelling throughout.

| File | What |
|---|---|
| `units.json` | the index: the intro, units 1-6 and the finale, their 20 steps per band, each step's standards (CYBER.ORG v1.0 codes, the Common Sense topic, inherited CSTA codes), its game module per band, the six stamps' names, and the per-unit teacher notes |
| `standards.json` | the registry: the frameworks named above and the CYBER.ORG v1.0 code set `units.json` may cite |
| `course/<band>/<u.n>.json` | one slide deck per step per band (`course/1b/1.1.json`): the same schema as CS Quest's decks (key `1b-1.1`, 5-7 slides with exactly one example, one words slide with four words and the mission last, a 3-item check, the game module or a talk prompt) |
| `sets/u<n>-<band>.json` | the check-item banks: one file per unit per band (`u0` holds the intro's items). Item ids are `cd-<band>-<step>-e<1..3>`; an item's `cat` is the step's first CYBER.ORG code |
| `trick-pack.json` | the printable Spot-the-Trick pack (teacher page `?print=tricks` and `public/teachers/spot-the-trick-pack.pdf`, built by `scripts/cyber-trick-pack-pdf.js`): the Trick Inbox game's own both-band messages as printable cards plus the answer key. Generated from `seed-games/trick-inbox.html`; never hand-edit the wording |

## Rules the tests enforce

Checked by `node --test tests/unit/cyber-defenders-course-content.test.js` and
`tests/unit/cyber-defenders-platform.test.js`:

- 20 steps per band (0.1, 1.1-6.4), in `units.json` order; a deck for every step and nothing else in
  `course/<band>`.
- A deck's game module is exactly the one `units.json` names for that band (a Packet Post chapter, a Trick
  Inbox set or an escape-room lock with canonical params, or Would You Rather locked to "Online: share or keep"),
  and its mission slide names the game and the chapter as the game shows them. Units 1-2 play Packet Post
  (except 1.3, Escape's Lock 1: Sorting Gate; 2.2, Trick Inbox's Prize Letters; and 2.3, Escape's Lock 2: Sealed
  Note), units 4-6 the course's own games (except Explorer 4.1, Packet Post's own Spot the Trick cards, which chain
  into its 3 Secret Messages puzzles), and steps 4.3, 5.1 and 5.2 open three different modules. Neighboring steps
  never open the same module, and never two cipher-wheel games (Secret Messages, Sealed Note) back to back.
  No step replays work an earlier step already required: not its chapter, not the chapter Packet Post chains
  into at the end (Break It Up into Many Roads, Rules of the Road into Many Roads, Explorer's Spot the Trick into
  Secret Messages, Pro's Secret Messages into Spot the Trick), and not an escape lock (no lock is a band's module twice; the finale plays the whole escape).
- A slide is pictured only when the capture shows what the slide teaches, and its tour cues name what is on it;
  otherwise it draws a diagram of the exact idea (`visual`, one of the engine's drawn types, with a tour), or its
  topic art (`art`) with no picture and no tour.
- The Pro intro (`course/2/0.1.json`) also carries `slides_first_time` (same schema as `slides`): the welcome a
  kid sees who never finished an Explorer step, so it never says "welcome back".
- A deck's check is its own step's three bank items; an item's `cat` is one of the step's CYBER.ORG codes
  from `units.json`, and every code in `units.json` is in the `standards.json` registry; inherited CSTA
  codes must be real CSTA 2017 ids of the right level (`server/standards/csta-2017.json`).
- Kid-safe text, the same rules as CS Quest's decks: US spelling, no brands, no links, no standard codes
  or framework names in anything a child reads, "trusted adult" (never "grown-up"), never "type your
  password", and the course's own name ("Cyber Defenders") never appears in a deck — a child in the story
  is a Cyber Defender (singular), which is a job, not the program name.
- The last step of each unit carries a Magpie beat (the course's comic trickster, introduced in the intro),
  and each unit carries teacher notes.
- A slide picture (`img`) is a manifest key (`public/img/csq/manifest.json`) whose game state genuinely matches
  the slide, with the manifest's alt copied verbatim, used at most twice per band. Cyber Defenders' own captures
  come from `scripts/cyber-shots.js` (table: `scripts/cyber-shots-spec.json`); its Trick Inbox and Escape shots
  render the game at 800x450 with a 1.6 scale and record the game's real element boxes in
  `scripts/cyber-shots-rects.json`, which every highlight box on those pictures is taken from.
- Every screenshot slide with guided focus carries a `view` [x, y, w, h] (% of the picture): the crop a phone
  shows, holding every focus box (boxes stay in % of the whole picture).
- A crop never cuts a line of the game's text, and on a phone each tour step zooms to its box (zoom-to-cue,
  `public/js/course-zoom.js`) without cutting one either. Every capture run records the game's text size and word
  boxes (`scripts/cyber-shots-rects.json`); `node scripts/cyber-zoom-data.mjs` turns them into the engine's data
  (`public/js/course-zoom-data.js`, `public/img/zoom/`). `tests/unit/cyber-shots.test.js` checks every step at a
  390 px phone: no cut line, every line the box touches shown whole, and 11 px words wherever the game's layout
  allows (the steps whose boxes hold lines too wide for that are counted and pinned).

## Changing the catalogue

Deck and bank text is data: edit the JSON and run the tests. The standards map is `units.json` +
`standards.json`; the published mapping is CYBER.ORG v1.0 (see the course spec's version note) — a v2.0
re-map updates both files together.
