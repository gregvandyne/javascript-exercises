# Tug of Math: build plan

Owner's request: a two-team maths tug-of-war, played (1) alone against the computer (Easy, Normal or Hard), (2) by two
players on one screen, or (3) live with a class. Before each game a GRADE preset (Grade 1 to Grade 8) sets the kinds of
questions, so they suit the players' age. Slug `tug-of-math`. The art and characters are our own, in the Oomba style.
Nothing is copied from the video.

Branch `tug-of-math` in the `.claude/work/wt-tug` worktree. Do not push. Use the exact commit footer from the task. Do not
change `kit/SHIPPED.json`, any file it lists, or any kit version file.

---------------------------------------------------------------------------------------------------------------------

## 0. What the codebase tells us (how things are done today)

### 0.1 How an official seed game is added
- **Files:** `seed-games/<slug>.html` (the whole game in one file) and `seed-games/<slug>.json` (the metadata). Add the
  slug to the end of `SEED_GAMES` in `scripts/seed.js`. `importGame()` publishes it as the official account
  `OombaAcademy`, with `source: 'seed'`. The seed import runs again on every start (`node scripts/seed.js`).
- **JSON fields:** `slug, title, icon (emoji), cover (theme name for the gradient fallback), category ('learning'),
  tags (comma list), description, orientation ('any'|'portrait'|'landscape'), players_max, age_rating ('everyone'),
  featured (true puts it in Home #featured; tests/e2e/seeds.spec.js expects it there), notes (a long developer note:
  kit version, packs, modes, storage key, test hooks), l10n: { <locale>: { title?, description, tags } }` for 12
  locales (en-GB only where the spelling differs: "maths", "colour"). Swish Flick and Sum Racer are good models.
- **Scan:** `server/services/scanner.js scanVersion(html)` must return `status: 'pass'`. That means: no fetch, XHR,
  WebSocket, dynamic `import()`, eval or `new Function`, string timers, window.top/parent/opener, cookies, forms with
  `action`, `location` navigation or `window.open`. Outside URLs are allowed only for Google Fonts. The kit loads
  through its pinned tag: `checkKit`, with the version, SRI hash and `crossorigin="anonymous"`. Profanity and personal
  details in the text also fail the scan. Live games are also linted (`classlive-lint.js`). Add the slug to the list in
  `tests/unit/scanner.test.js` ("seed games pass").
- **Sandbox/CSP:** the game runs in an opaque-origin iframe (`server/services/frame.js` frameDocument + FRAME_CSP). It
  has no network and no access to the parent page. Storage goes through `BRB.storage`. In a live frame nothing can be
  typed: inputs are read-only and `prompt()` returns null. So the keypad is made of buttons, and keyboard input comes
  from `keydown` listeners only, never an `<input>`.
- **SDK (`window.BRB`, docs/sdk.md):** `BRB.user {displayName, lang, dir, character}`,
  `BRB.storage.get/set/remove(key)` (per player, synchronous get, debounced set), `BRB.score.submit(n, label)`,
  `BRB.gameOver({won, score})` (once per round, also submits the score), `BRB.sfx.play/mute/muted`, `BRB.theme`,
  `BRB.orientation('landscape')` (shows the turn-your-phone hint), `BRB.fx.*`, `BRB.speak`, `BRB.params`. Kit games
  use these through the `Oomba.*` wrappers: `Oomba.sfx`, `Oomba.lang`, `Oomba.dir`, `Oomba.theme`, `Oomba.num`,
  `Oomba.settings.reduced`. Do not use `BRB.poll`.
- **I18N block convention:** official kit games such as would-you-rather-live, Sum Racer and Swish Flick wrap their
  strings in `// ==== I18N START ==== … // ==== I18N END ====`. Inside is `var STR = { en: {…}, 'en-GB': {}, es, fr, de,
  it, pt, nl, ru, ja, 'zh-Hant', ar, he }; STR['en-GB'] = STR.en; var I18N = STR;`. A small `t(key, vars)` fills
  `{placeholders}` and formats numbers with `O.num`. The script sets `html lang`/`dir` from `O.lang`/`O.dir`, mirrors
  menus and text for RTL, and keeps the playfield the same in both directions. `server/services/tts-lines.js` reads
  this block with node:vm. Do not put plural objects in it.
- **AI voices registration (a required test):** `tests/unit/tts-coverage.test.js` fails for any seed game missing from
  `GAMES` in `server/services/tts-lines.js`, and the I18N block must yield at least 1 spoken line. The game reads no
  questions aloud, because they are numbers. Still register `'tug-of-math': { title: 'Tug of Math', role: 'bright',
  spoken: /^(?:win|tie|go|ready|howto)/ }` so the title, how-to and end lines can be spoken. This is required by the
  owner's 5 Nov rule ("AI voices for every official game"). Nothing else is needed.
- **Covers:** add a recipe to `RECIPES` in `scripts/covers.js`: `{ viewport, touch, async prep(f) }`. It plays to a
  good moment, for example a two-player match mid-pull with the rope off centre. Then
  `BRB_DB=:memory: BRB_SILENT=1 node scripts/covers.js tug-of-math` writes `public/covers/tug-of-math.jpg`, and
  `node scripts/og-images.js` writes `public/og/tug-of-math.jpg` (one card per seed json that has a cover). Commit both
  jpgs.
- **Learn hub ("practises" line):** in `server/learn.js` add `LEARNING['tug-of-math'] = { key: 'tugOfMath', teaches:
  ['Addition','Subtraction','Multiplication','Division','Order of operations','Integers','Equations'], level:
  'Grades 1-8' }`, put it in `HUBS` math-games `games: ['sum-racer','tug-of-math']`, add it to `TWO_PLAYER`, add it
  after the existing games in the `AGES` a8 and a10 lists, and bump `CONTENT_UPDATED`. New locale keys in all 13 files:
  `learn.games.tugOfMath` (the "Practises:" line on `/g/<slug>`, routes/games.js:121) and
  `learn.ages.a8.fit.tugOfMath` / `learn.ages.a10.fit.tugOfMath`. Keep sum-racer first, because the seo-parents tests
  check that order.
- **Search and Home:** these come for free from the seed import. The game is featured, in category learning, and its
  tags are searchable.

### 0.2 Kit or plain canvas
Every 2D official game is on **Oomba Kit 1.1.3**. That is `KIT_LATEST`. 1.1.3 is not in SHIPPED.json yet, but we only
pin its tag and never edit it. Recent 2D learning games (Sum Racer, Fraction Factory, Brain Board, the WYR and Atlas
live games) use `Oomba.game({ controls: 'none', camera: 'fixed' })` or a plain DOM inside `Oomba.ui.root()`. The kit
provides the title screen, pause and settings (sound, less motion), results, font, light and dark looks, and test
hooks. The game's own DOM/SVG sits below `var(--ok-safe-top)`. Decision (#121 / "3D worlds are the Builder's own; the
Oomba Kit is for 2D"): **Tug of Math is a 2D kit game**. It uses the pinned kit 1.1.3 tag plus the `live` pack, and
`art-animals` for the team characters (kit characters drawn as SVG/canvas portraits: our own look). The rope, the
tuggers and the keypads are the game's own DOM, SVG and canvas. Load the tags with exactly the strings from
`kitTag('1.1.3')` and `kitPackTag(name, '1.1.3')`, copied from would-you-rather-live.html.

### 0.3 How live games work, end to end
- **Server:** `server/services/classlive-*.js`.
  - `access`: `MODES`, `OWN_QUESTIONS`, `CAPACITY`, `capacityFor`, `maxPlayersFor`, `hostable`, `nameMode`.
  - `sessions`: `createSession`, phases, `doAction` (start, pause, resume, next, skip, end), `event()`,
    `score()`/`item()`, `publish()` (platform-made shared state to every device), `projectorState()`, `tick()`
    (100 ms; the leaderboard every 2 s), `endSession`, `rematch`.
  - `protocol` (parse and validate every message), `socket`, `quiz` (shared question, reveal, points), `teams`
    (`fromSetup`, `place`, `balance`, `bankScore` with `avg` = rise / connected members; `ranked`, `tsMsg`), `board`
    (Brain Board), `results` (summary, CSV, saved class runs), `dash`, `settings`, `check`/`lint` (live-ready check:
    pinned live pack, `live.ready(`, start/end handlers, result report, `words` read from the game's code).
  - Routes: `server/routes/live.js`, which handles landing options, `sessionOpts`, `ownStarter`, `starterPre`, `fromRun`.
  - Views: `server/views/live.js landingBody`, with mode cards and per-mode fieldsets like `#lv-wyr-opts` and
    `#lv-atlas-opts`.
  - Generators: `server/live/{wyr,atlas,starters,live-games}.js`.
- **Pages:** `/live` (landing, `public/js/live-sets.js`), `/live/host/:sid` (projector page, `live-host.js`, game frame
  with role host), `/live/host/:sid/dash` (teacher dashboard), `/join` → `/live/play/:sid` (`live-play.js`, game frame
  with role player), `/live/results/:id`. The pages relay the socket into the frame over a MessagePort
  (`live-common.js`; `welTracker` replays state to a reloaded frame). The frame uses `Oomba.live` (kit live pack):
  `ready({lobby, quiz, hostView, teams, words, maxPlayers})`, `on('start'|'phase'|'event'|'state'|'teams'|'end'…)`,
  `send(kind, data, {toHost})`, `players()`, `teams()`, `drawShape`, `names`.
- **How #143 added a game-specific live mode (Would You Rather Live, Atlas Quest Live):**
  - New `MODES` entry and seed html.
  - `OWN_QUESTIONS` (the platform makes the questions; no set).
  - `CAPACITY` row.
  - `server/live/<mode>.js` with `parseId`/`makeId`/`<mode>Items` and a starter id `<mode>:…`, which reads its data
    straight from the seed html (`atlas.js data()` parses `window.AtlasData` from the html: one source of truth).
  - `routes/live.js` gets the picker, the `ownStarter` form fields and play again.
  - The `views/live.js` fieldset, plus show/hide in `live-sets.js`.
  - `teachers.js` MODE_ID gets a mode card.
  - `LIVE_GAMES` in `server/live/live-games.js` gets the Live badge and the join/host panel on `/g/<slug>`
    (`live-entry.test.js` requires `LIVE_GAMES` ⇔ `MODES`).
  - i18n via a script (`scripts/i18n-add-live-wyr-atlas.mjs`).
  - Dash and results tweaks (`vote` flag).
  - A `live-layout-audit.js` mode, a `live-load.js` mode, `docs/live-protocol.md`, `docs/decisions.md` and
    `docs/live-capacity.md`.
  - Unit test `tests/unit/live-wyr-atlas.test.js` (real socket via `tests/unit/_live.js`).
  - Brain Board (#116) is the precedent for the server *intercepting* a game event (`ev k:'pick'`) instead of relaying
    it.
- **Capacity:** `CAPACITY[mode] = { max, best, teamsAbove? }`, measured with `scripts/live-load.js` at 10, 20 and 30
  players and written up in docs/live-capacity.md. A room is capped at `min(max, LIVE_MAX_PLAYERS)`.

### 0.4 Layout checks (#117, #121)
- `scripts/games-fit-audit.js` (`npm run layout:games`; `tests/e2e/games-fit.spec.js`) opens every `SEED_GAMES` game
  at 390×844, 844×390, 820×1180, 1180×820 and 1280×800 with touch, on the title and after pressing Play (it clicks
  `.ok-title-screen .ok-hot`/`#play`/`[data-start]`). `tests/e2e/frame-fit.js frameProblems` fails on anything off
  screen, cut off, overlapping, squashed (controls under 44 px), needing a scroll, or scrolling sideways. Tablets in
  both orientations are a required check.
- `scripts/live-layout-audit.js` (`tests/e2e/live-layout.spec.js`) runs every live mode through lobby, question, reveal
  and end, at phone, small phone, both tablet orientations, desktop and projector, for the projector page and a player
  page.
- `tests/e2e/touching.js findTouching` checks that site page containers never touch. It applies to `/g/tug-of-math`
  and `/live` with the new fieldset, via `layout.spec.js` page lists if they enumerate game pages.

---------------------------------------------------------------------------------------------------------------------

## A. The game (solo vs computer + two players on one screen): `seed-games/tug-of-math.html`

**Structure.** The page is classic scripts on kit 1.1.3, in this order:
- The kit tag, then `art-animals` and `live` packs.
- `<script>` 1: `window.TugGen`, the question generator, pure (no DOM), between `/* tug-gen:begin */` and
  `/* tug-gen:end */`.
- `<script>` 2: `window.TugBot`, the computer opponent, pure, between `/* tug-bot:begin */` and `/* tug-bot:end */`.
- `<script>` 3: the game, with the I18N block.

Both pure blocks are ES5, use no globals other than their own namespace, and take a seeded RNG (mulberry32). The server
and unit tests load them with node:vm, the way atlas.js reads AtlasData, so there is one source of truth.

**TugGen (curriculum; every answer a whole number; questions random but never the same twice in a row; both sides
equally hard).**
- `TugGen.make(grade, rng, prev)` → `{ e: [tokens], a: <int>, k: '<kind>', neg: bool }`. `e` is made of numbers and op
  tokens: `add sub mul div lp rp pow2 sqrt pct of x eq`. The same tokens travel in live `ev` data, which allows tokens
  matching `/^[a-z0-9_-]{1,24}$/` and numbers, so the question is never text. The renderer turns them into
  `7 + 5 = ?`, `□ + 4 = 11`, `x + 5 = 12, x = ?`, `25% of 80`, `√81`, `3²`, and so on.
- `TugGen.pair(grade, rng, prevA, prevB)` → `[qA, qB]` from the **same kind and size band**, with different operands. A
  shared schedule picks the kind for that turn, so both sides get equally hard questions. `TugGen.kinds(grade)` lists
  the kinds.
- Grades:
  - **G1:** add and subtract within 20, never negative (sums to 20, take-aways from 20 or less), and missing addend
    within 10.
  - **G2:** add and subtract within 100 (two-digit; regrouping allowed), and skip-count/doubles to 20.
  - **G3:** times tables 2–10 (×1 rarely), division facts to 100÷10 with no remainder, and add/subtract within 1000.
  - **G4:** 2–4-digit × 1-digit (up to 999×9), division with no remainder (up to 3-digit ÷ 1-digit), and two-step
    questions like `6 × 4 + 9` or `(35 − 7) ÷ 4`, always exact.
  - **G5:** 2-digit × 2-digit (up to 99×99), 3–4-digit ÷ 1–2-digit with no remainder, and simple order of operations
    `a + b × c` / `(a + b) × c`.
  - **G6:** order of operations with 3–4 terms and brackets, a percent of an easy number (10/20/25/50/75% of a multiple
    that comes out whole), and squares to 15² (pow2).
  - **G7:** add, subtract, multiply and divide integers with negatives (−20…20, products within ±144), and one-step
    equations `x + a = b`, `x − a = b`, `a·x = b` (solution an integer, which can be negative).
  - **G8:** two-step equations `a·x + b = c` (integer x), powers (squares to 20², cubes to 5³, 2^n to 2^10), square roots
    of perfect squares to 400, and integer order of operations.
- `TugGen.needsMinus(grade)` returns true only for G7 and G8. The minus key appears only then. Unit tests check that
  G1–6 answers are never below 0.

**TugBot.** `TugBot.make(difficulty, grade, rng)` → `{ next(q) → { ms, ok } }`, which gives the time to answer and
whether the answer is right.
- Base time per kind effort: `effort(q.k)` is 1 for facts, 1.5 for multi-digit, 2 for two-step and equations.
- Easy: `ms ≈ 9000 × effort ± 25%`, accuracy 0.65.
- Normal: `5000 × effort`, accuracy 0.82.
- Hard: `2600 × effort`, accuracy 0.94.
- On a wrong answer the bot "stumbles" and loses about 1.2 s.
- Tuned so that a simulated slow 2nd grader (9 s per answer, 80% right, G2) beats Easy in at least 80% of seeded 90 s
  matches, and Hard beats a steady player (5 s, 85%) in at least 70%. These are checked by unit tests.

**Screens.** The kit flow is: title, then `intro(w)` showing the **setup card**, then the countdown, then play, then
results.
- **Setup card** (DOM in `Oomba.ui.root()`, big touch targets of at least 48 px, a radiogroup for each row, arrow keys
  move within a row, Tab moves between rows, the Start button is always in view):
  - **Grade** chips G1 to G8, each with a one-line sample, for example "G3 · 7 × 8", showing what it means.
  - **Mode**: "vs Computer" or "2 players".
  - **Difficulty** (only for vs Computer): Easy, Normal or Hard.
  - **Length**: 60 s, 90 s, 120 s or "First to the line" (capped at 3 min).
  - **Start**.
  - The last choice is remembered in `BRB.storage` key `tug-of-math-v1`: `{grade, mode, diff, len, best:{…}}`. It
    stores ids only.
  - In a live frame the card never shows: the teacher chose these settings.
- **Play layout:**
  - Centre panel: the rope across, our own team characters on the left (Blue team, whale icon, circle shape) and the
    right (Red team, fox icon, diamond shape), the centre flag/marker, a timer ring, and both scores ("pulls"). Colour
    is never the only cue: each side shows its name and shape.
  - Each side has a question card and a keypad: 0–9, ⌫, ✓ and, for G7+ only, ±.
  - **Landscape** (desktop, smartboard, tablet on its side, phone on its side): split left (Blue) | centre tug | right
    (Red), as in the classroom setup.
  - **Portrait:**
    - Two players: Sum Racer's convention. Red's half sits at the top, turned 180° so the player opposite reads it,
      with the tug band in the middle and Blue at the bottom.
    - Vs Computer: the player's keypad sits at the bottom and the computer side shrinks to a card showing the
      computer's progress (thinking dots). The computer's question is shown small and its answer is never typed for
      the player to see.
    - Very short landscape phones (height under 420): a compact keypad (4×3 grid next to the question) plus the
      rope strip.
  - Use `BRB.orientation` only as a hint; never block play.
- **Input:**
  - Taps. On desktop: digits, Backspace, Enter, and `-` for G7+. For two players on one keyboard: Blue types on the
    number row and confirms with Enter, Red uses the numpad (numpad Enter). Both are documented on the how-to card; on
    touch each side taps its own keypad.
  - A right answer pulls the rope one step toward that side: a pull animation, `Oomba.sfx('coin')` and a little
    squash. A wrong answer shakes the card, shows "7 × 8 = 56" for 0.9 s with no pull, then the next question.
- **Win:** past the line (±8 steps; ±6 in "First to the line"), or the most pulls when time ends (a tie is a draw).
  Results use the kit results screen with the winner, pulls, accuracy and best streak. Vs Computer calls
  `BRB.gameOver({won, score: rightAnswers})`. Two-player matches submit no score (a shared screen).
- **Pause** comes from the kit (P/Esc/the button). It stops the timer and the bot.
- **Settings** come from the kit panel: sound, less motion (no rope sway or confetti; the rope moves by easing only).
- **Accessibility:**
  - Each side's question has `aria-live="polite"` and a per-side `role=status` result line ("Right! Blue pulls",
    "Not quite: 56").
  - The timer is announced at 30 s and 10 s.
  - Keypad buttons have labels ("minus", "delete", "enter").
  - Focus order is grade, then mode, then Start; in play the keypad is focusable.
- **RTL:** the page dir comes from `O.dir`. Menus and cards are mirrored, but the tug field keeps Blue on the left and
  Red on the right, and numbers and equations stay LTR (`dir="ltr"` on the expression spans).
- **I18N:** every in-game string in 13 languages, inside the I18N block. Numbers are formatted with `O.num` on display.
- **Test hooks** (`window.__brbTest`): `state()` returns `{screen, mode, grade, diff, len, rope, scores, q:{A,B},
  timeLeft, winner}`, plus `setup(opts)`, `start(opts)`, `answer(side, value)`, `solve(side)`, `step(ms)`,
  `skipAnimations()`, `seed(n)`, `setTime(s)`, `gen(grade, n)`.

## B. Live mode (Oomba Live, built-in mode `tug`)

**Design.** This is a server-authoritative "game" mode on the existing machinery. It needs no kit change and no new
wire message types:
- Per-seat questions travel as host→seat game events.
- Answers travel as a player game event that the server intercepts, the way Brain Board intercepts `pick`.
- The rope is platform-made shared state.

**Server changes:**
1. `classlive-access.js`:
   - `MODES.tug = 'tug-of-math'`.
   - `export const GAME_MODES = new Set(['tug'])` for built-in modes that run as a timed game, with no quiz and no
     question set.
   - `CAPACITY.tug = { max: 60, best: [4, 60] }` (to be confirmed by measuring).
2. `server/live/tug.js` (new):
   - Loads TugGen from the seed html between its markers using `vm.runInNewContext` (with a timeout, as tts-lines
     does).
   - `GRADES = [1..8]`, `LENGTHS = [60, 90, 120, 'line']`, `MARGIN` (in average correct answers per player: 6 for
     timed games, 5 for "line"), `LINE_CAP = 180`.
   - `parseId('tug:<grade>:<len>')`, `makeId`.
   - `nextFor(seat, grade)` → `{i, e}` (the answer stays on the server). Keeps `seat.tug = { i, q, a, prev, at,
     streak }`. The two teams draw kinds from a shared per-session schedule, so both sides get equally hard questions.
   - `check(seat, i, v)`.
   - `pull(s)` → `−1000..1000` from the team `avg`s.
3. `classlive-sessions.js`:
   - `createSession`: `quiz = mode !== 'game' && !A.GAME_MODES.has(mode)`. For `tug` it parses the starter (default
     `tug:3:90`), sets `s.tug = { grade, len, margin, endsAt:null, schedule, p:0, w:0 }` and **forces teams**:
     `T.fromSetup(s, { n: 2, presets: [0, 6], scoring: 'avg' })`, which is Blue Whales against Red Foxes, with a
     different shape for each. If `LIVE_TEAMS=0`, refuse with `teamsOff`. Late joiners go to the smaller team
     (`T.place`); at `start` every unplaced seat is placed, and the teams are balanced if uneven by more than 1.
   - `teamAction`: in `tug`, refuse `off`, `count`, `scoring` and `choose`. Keep `balance`, `shuffle`, `move`, `lock`
     and `preset`.
   - `play()`: for `tug`, set `endsAt = now + len` (or `LINE_CAP`) and a timer `tugEnd`, then send every connected seat
     its first question. `pause`/`resume` shift `endsAt` and the timer. `next`/`skip` do nothing in `tug`; the host
     page hides those buttons. `end` works as usual.
   - `event()`: when `s.mode === 'tug' && from && m.k === 'ans'`, take the answer only while `playing`, with `d.i`
     equal to the seat's current `i` and `d.v` an integer within ±100000. It is never relayed. The server then:
     - Updates `seat.answered`/`correct`.
     - On a right answer adds 100 to `seat.score` (plus `T.bankScore`, which updates the team `avg` normalised by
       connected members, so uneven teams are fair).
     - Updates `s.itemStats` keyed by kind index.
     - Sets `s.scoresDirty`/`dpDirty` and `s.tugDirty`.
     - Sends to that seat only: `ev{f:0,k:'tr',d:{i,ok,a}}` (the right answer after a wrong one) and, after 600 ms
       (900 ms after a wrong answer), `ev{f:0,k:'tq',d:{i,e,n}}`.
     - Rate limit: one answer per 350 ms per seat, with extras dropped.
   - `ready(s, seat)` in `tug` while `playing`: resend the seat's current `tq`, for a reloaded frame or a reconnect.
   - `tick()`: every 2 ticks (200 ms), if `tugDirty`, `publish(s, { tug: { p, t: endsAt, w } })`. `p` is −1000..1000. If
     `|p| ≥ 1000` the session finishes at once. On finishing: set `w` (1 = Blue, 2 = Red, 0 = draw), publish, a final
     `teamScores(s, {fin:true})`, then `endSession(s.id, 'ended')`. The existing podium hold and results follow.
4. `classlive-results.js`/`dash.js`: game-mode summaries already use `answered`/`correct`/`score`, and `needsHelp`
   already handles game modes (3 or more answered with under half right). Add a `tug` line to the summary:
   `{ winner, grade, len }`. No "play the missed ones" for `tug`: `fromRun` returns `noMissed`, as for `wyr`/`atlas`.
   Play again keeps the grade and length (`s.tug` carried in `rematch`) and rebalances the teams.
5. `routes/live.js`:
   - The landing mode card `{ id: 'tug', icon: '🪢', own: true }`.
   - `tugPicker(req)` gives the grades with sample lines and the lengths.
   - `ownStarter` for tug reads `tugGrade` and `tugLen`.
   - `sessionOpts` for tug: a starter only; ignore any set or items.
   - `starterPre('tug:…')`.
   - Host/play page data adds `mode: 'tug'`.
6. `views/live.js`: `#lv-tug-opts` (`data-own-mode="tug"`) with `select#lv-tug-grade name=tugGrade` (Grade 1–8) and
   `select#lv-tug-len name=tugLen` (60/90/120/line). Teams are fixed: the fieldset shows "Two teams, picked for you" and
   hides the team-count radios for this mode. `live-sets.js` shows and hides the fieldset like wyr/atlas.
7. `live-host.js`/`live-dash.js`: hide `next` and `skip` and the `#lv-time` row in `tug`. The team count controls in
   the Teams sheet are disabled (balance, shuffle and move still work).
8. `server/live/live-games.js`: add `'tug-of-math': { mode: 'tug', solo: 'tug-of-math', play: true }`. Add a small
   change to `livePanel` in `routes/games.js` so the solo button reads "▶ Play (vs computer or 2 players)" (a new key,
   `live.entry.playBoth`) when `play: true`. This game page offers Join, Host and Play.
9. `routes/teachers.js` MODE_ID gets `tug: 'tug'`, a `teachersLive.modes.tug.{h,p}` card and the 🪢 icon.

**Frame (the same `tug-of-math.html`):**
- `L.ready({ lobby: true, hostView: true, teams: true, maxPlayers: 60, words: ['ans'] })`.
- **Player frame:** a team band (its colour, shape and name in `ink`), the mini rope strip from `L.state.tug.p`, the
  question card from the last `tq`, and the keypad (± only for G7+, from the question's grade in `tq.d.n`). It sends
  `L.send('ans', { i, v }, { toHost: true })` and shows the `tr` result. The aria-live behaviour is the same as solo.
  The lobby says "You are on Blue Whales ●: wait for the teacher".
- **Projector (host role):** a big tug scene (both team crowds drawn as kit portraits, avatars only when
  `L.names === 'hidden'`), the timer from `tug.t` with `L.now()`, team pulls (`L.teams()` avg and sum), and the correct
  answers per team. There is no individual leaderboard; the end shows the team podium. The lobby shows both team
  columns (portraits plus nicknames or roster names per `L.players()`), and "Join at oomba.ai/join" comes from the host
  page.
- `end`: the winner banner (no confetti with less motion), then the platform's podium hold, then results.
- Child safety:
  - Only taps and number answers; no text from players.
  - Names come only from `players()`, which follows the existing nickname/roster rules, and are hidden on the
    projector when the setting says so.
  - Nothing is sold, and kids never host.

## C. Site integration, docs and tests

**Integration files:**
- `seed-games/tug-of-math.{html,json}`: category `learning`, `featured: true`, `orientation: 'any'`,
  `players_max: 60`, tags `math,maths,tug of war,two player,2 player,live,class,addition,subtraction,times
  tables,division,order of operations,integers,equations,grade 1…grade 8`, and l10n in 12 locales.
- `scripts/seed.js` `SEED_GAMES` (append).
- `public/covers/tug-of-math.jpg` and `public/og/tug-of-math.jpg`, via `scripts/covers.js` (a recipe) and
  `scripts/og-images.js`.
- `server/learn.js` (section 0.1) and `server/services/tts-lines.js` GAMES.
- **Locales** (all 13; en-GB only where it differs), written with a script `scripts/i18n-add-tug.mjs` following the
  `i18n-add-live-wyr-atlas.mjs` model:
  - `live.mode.tug`, `live.mode.tugText`, `live.tugUi.{legend,grade,len,lenLine,teamsFixed,hint}`, `live.tug.grade.1..8`
  - `teachersLive.modes.tug.{h,p}`, `live.entry.playBoth`
  - `learn.games.tugOfMath`, `learn.ages.a8.fit.tugOfMath`, `learn.ages.a10.fit.tugOfMath`
  - Then run `npm run i18n:check`.
- **Docs:**
  - `docs/live-protocol.md`: a new "Tug of Math (`tug`)" section covering events `tq`/`tr`/`ans`, state `tug`, the
    starter, forced teams and timing.
  - `docs/decisions.md`: "Tug of Math (6 Nov 2026)".
  - `docs/live-capacity.md`: the tug row from live-load.

**Unit tests (`node --test`; `TMPDIR=/tmp/bx npm test`):**
- `tests/unit/tug-of-math.test.js` loads TugGen and TugBot from the html with vm, like atlas-quest.test.js does. It
  checks:
  - For each grade, 2,000 questions: the answer is an integer, `eval(render(e)) === a`, ranges are right, and answers
    are negative only for G7 and G8 (`needsMinus` only for 7 and 8). G1 stays within 20, G2 within 100, G3 facts are
    at most 10×10, and so on.
  - No question repeats back to back (same `e`).
  - `pair()` gives both sides the same kind and band.
  - Bot simulation: the slow 2nd grader beats Easy in at least 80% of matches, Hard beats a steady player in at least
    70%, and Easy is slower than Normal, which is slower than Hard, at every grade.
  - The I18N block has every key in all 13 languages, and placeholders match.
  - `scanVersion(html).status === 'pass'`, and `liveCheck`/`checkHtml(html).ready`.
  - The json has the required fields and l10n.
- `tests/unit/live-tug.test.js` uses `_live.js`: it publishes the real seed html as `tug-of-math` and works over the
  real socket. It checks:
  - The session from the starter has forced teams 2, avg, presets [0, 6].
  - Six players are split 3/3, with late joiners balanced.
  - The `tq` reaches only that seat, and the answer is never in any message.
  - A right `ans` gets `tr ok`, the score rises and team avg banking works; uneven teams (2 against 4) pull fairly.
  - Wrong or stale `i` answers and spam are dropped, and `ans` is never relayed.
  - Pause shifts the end time.
  - Crossing the line ends the session with `w`; a timeout ends it with the most pull, or a draw.
  - Results have team ranks and per-student correct/answered.
  - `teamAction off/count` is refused in tug, and `LIVE_TEAMS=0` gives `teamsOff`.
  - `capacityFor({mode:'tug'})`, and a full-class 30-seat run with bounded message sizes.
- Update `tests/unit/scanner.test.js` (the seed list), `live-entry.test.js` (passes through LIVE_GAMES ⇔ MODES),
  `live-capacity.test.js` (if it enumerates CAPACITY), and `tests/unit/tts-coverage.test.js` (passes once registered).

**e2e (Playwright; `TMPDIR=/tmp/bx E2E_PORT=48xx BRB_SNAPSHOTS=1 BRB_CHROMIUM=… npx playwright test <spec>`):**
- `tests/e2e/tug-of-math.spec.js`:
  1. **Solo against the computer, to results:** `/play/tug-of-math`, title, Play, setup (G3, vs Computer, Easy, 60 s;
     reload to check it was remembered), answer with the keypad and the keyboard (digits, Backspace, Enter) using
     `__brbTest.solve`, `setTime(1)`, results show and `BRB.gameOver` is called. No page errors.
  2. **Two players on one screen:** landscape 1280×800, Blue on its keypad and Red on its keypad, the rope moves each
     way, play reaches the line, and the winner is shown. Portrait 390×844: Red's half is turned 180°, and both keypads
     are visible and at least 44 px.
  3. **Grade 7:** the ± key shows and a negative answer works. At Grade 3 there is no ± key.
  4. **Layout:** at 390×844, 844×390, 820×1180, 1180×820, 1280×800 and 1920×1080 (smartboard), on the setup card,
     during solo play and during two-player play, `frameProblems` is empty and `pageScrollsSideways` is false. RTL
     (`he`) and dark mode are checked as well.
  5. **A live room, host plus 4 players, to results:** using `live.spec.js` helpers (`openRoom({ pick: 'mode:tug',
     starter: 'tug:2:60' })`, 4 guest players). Teams are 2 and 2. Start, every player answers via
     `__brbTest.solve()`, the projector rope moves, the host ends the game (or it crosses the line), the podium, then
     `/live/results/<id>` shows the team podium and the student table.
- Add `tug-of-math` to `tests/e2e/seeds.spec.js` SEEDS (it loads, the h1 title shows, it is in Home #featured).
  `games-fit.spec.js` picks it up from SEED_GAMES automatically, so the setup card must be what shows after Play.
- `scripts/live-layout-audit.js`: add `tug` with `OWN.tug = 'tug:4:120'` and a `tug` branch with stages lobby, playing
  (after a few answers) and end. Add it to the default MODES.
- `scripts/live-load.js`: add a `tug` bot that answers its `tq` (via the vm-loaded TugGen evaluator) every 2–4 s.
  Measure 10, 20 and 30 players and write the results into live-capacity.md.

## D. Step order
1. Add TugGen and TugBot inside the seed html, with `tests/unit/tug-of-math.test.js` for the generator and the bot.
   Write these first and tune the bot numbers.
2. Build the solo and two-player game: setup card, layouts, input, I18N (en first, then all 13), storage, test hooks.
   Play it by hand on phone, tablet and smartboard sizes.
3. Seed json, SEED_GAMES, scanner list, tts-lines, learn.js and locale keys. Check `npm run i18n:check`.
4. Live server: access, tug.js, sessions, routes, views, live-sets, live-host/dash tweaks, live-games, teachers. Write
   `tests/unit/live-tug.test.js`.
5. Live frame: player and projector views, lobby and end.
6. e2e specs, then `live-layout-audit`/`live-load` tug paths, then games-fit and live-layout runs.
7. Covers and OG images. Docs: live-protocol, decisions, live-capacity.
8. Full `TMPDIR=/tmp/bx npm test`. Known failures are allowed only for: "every per-game endpoint…" (env only), and on
   main also "build steps: a real playtest with problems…" and "/parents: How it works…". Then the relevant e2e specs,
   then commits with the exact footer. Do not push.

## E. Risks and notes
- `seo`/`seo-parents` tests check the order of the learn and age lists. Append tug-of-math; never put it first.
- Adding `tug` to `MODES` touches every place that loops over modes, including `live-entry`, `/live` cards,
  teachers/live, live-capacity tests and the layout audit defaults. Run `grep -rn "MODES\|'atlas'"` before finishing.
- `quiz` is now false for one built-in mode. Look for code that assumes `mode !== 'game'` means quiz:
  `routes/live.js` (settings `QUIZ_ONLY`, `#lv-time`), `results.js` (`items`), `dash.js` (`dq`), and `tts.js` (live
  read-aloud must refuse tug; there is no `q`).
- The `ev` data budget is 512 B and two levels deep. A tq of `{i, n, e:[≤9 tokens]}` is about 80 B.
- Fairness: team `avg` divides by the *connected* members at the moment of each rise (`bankScore`), so a disconnect does
  not hurt a team's past pulls.
