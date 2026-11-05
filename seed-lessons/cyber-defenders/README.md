# Cyber Defenders catalogue

The content of Oomba Academy's cybersecurity and online-safety course (grades 3-5 = band **1b**, "Explorer";
grades 6-8 = band **2**, "Pro"), set in Pim the owl's Netville post office. It is a standalone course beside
CS Quest: it reuses CS Quest's student-course machinery (`server/services/courses.js`), its deck format, its
check rules (three questions, pass 2 of 3) and its games (Packet Post, Would You Rather), but none of its
content files. Everything in this folder is data. Lesson text is English and shows verbatim in every UI
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
- A deck's game module is exactly the one `units.json` names for that band (Packet Post chapter and
  canonical params, or Would You Rather's "Online: share or keep" topic), and its mission slide names the
  game and the chapter as the game shows them.
- A deck's check is its own step's three bank items; an item's `cat` is one of the step's CYBER.ORG codes
  from `units.json`, and every code in `units.json` is in the `standards.json` registry; inherited CSTA
  codes must be real CSTA 2017 ids of the right level (`server/standards/csta-2017.json`).
- Kid-safe text, the same rules as CS Quest's decks: US spelling, no brands, no links, no standard codes
  or framework names in anything a child reads, "trusted adult" (never "grown-up"), never "type your
  password", and the course's own name ("Cyber Defenders") never appears in a deck — a child in the story
  is a Cyber Defender (singular), which is a job, not the program name.
- The last step of each unit carries a Magpie beat (the course's comic trickster, introduced in the intro),
  and each unit carries teacher notes.
- A slide picture (`img`) may only reuse a CS Quest manifest key (`public/img/csq/manifest.json`) whose
  game state genuinely matches the slide, with the manifest's alt copied verbatim. New Cyber Defenders
  captures are a later phase; slides without a genuine match keep their emoji `art`.

## Changing the catalogue

Deck and bank text is data: edit the JSON and run the tests. The standards map is `units.json` +
`standards.json`; the published mapping is CYBER.ORG v1.0 (see the course spec's version note) — a v2.0
re-map updates both files together.
