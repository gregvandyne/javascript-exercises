# Doodle Hoot: build plan

Owner's request: "Build a family Pictionary game that users can play with one another. Make this a live game where you
could even be in different places to play."

Owner's decisions (asked explicitly):
- **Who joins:** anyone with a code, like the existing Oomba Live games. The host shows a 7-digit code, a QR and a link.
  Anyone who has it joins from anywhere, on their own device, over the internet.
- **Guessing:** players spell the answer with letter tiles: the word's letters plus a few decoys. Nobody types text
  anywhere. *(Changed after the owner played it on an iPhone: see §15. Guessers now type on their own keyboard while
  the drawing goes on, or say it out loud; tiles are the host's easier choice.)*

Safety defaults the lead promised (all kept below):
- Only a grown-up, teacher or school staff account (or the platform admin) can host. Kids never host or co-host.
- No free text or chat between players. Names follow the live-game rules (`classlive-names.js`).
- Drawings are relayed live from memory only. They are never stored, never logged and never sent to any AI. The server
  validates every stroke message (bounds, point count, size, rate).
- The host can clear the canvas, skip a turn and remove a player. Each viewer can also "hide this drawing" for
  themselves.
- The name is original. It is never "Pictionary" (a Mattel trademark) or any other existing product name.

Branch `draw-guess` in `.claude/work/wt-draw`. Do not push. Use the exact commit footer from the task. Never change a
byte under `public/vendor/oomba-kit/`, anything listed in `kit/SHIPPED.json`, or `kit/src`.

---------------------------------------------------------------------------------------------------------------------

## 1. Name and slug

**Doodle Hoot**. Slug `doodle-hoot`. Live mode id `doodle`. Starter ids look like `doodle:…`.

- Pip, the kit's owl (`art-animals` pack, already Word Peek's mascot), hosts the game and draws the practice doodles. So
  "Hoot" comes from our own character, the same way "Remi's Quiet Meadow" uses Remi.
- We know of no game, app or toy brand with this name. The draw-and-guess names we know of and avoid are:
  Pictionary, Win, Lose or Draw, Draw Something, Quick, Draw!, skribbl.io, Gartic Phone, Drawful, Telestrations,
  Sketchful, Drawasaurus, Doodle Jump, Doodle or Die, Doodle Dash, and "Doodle Champion Island". Before launch, the
  lead does a 5-minute trademark search (USPTO/EUIPO "DOODLE HOOT", class 9/41). If it is taken, the fallback name is
  **Squiggle Owl** (slug `squiggle-owl`).
- Other names: "Doodle Hoot (Live)" is the mode card on `/live`, and the game card reads "Doodle Hoot". The title is
  translated in every locale's `l10n` (the brand word "Doodle Hoot" can stay Latin, the way Tug of Math does).

## 2. What the codebase tells us (findings)

### 2.1 Who may host today (the billing question)
- `server/services/classlive-access.js` `canHost(u)` is `!u.is_guest && !u.banned && (S.isStaff(u) ||
  isGrownup(u) || S.isPlatformAdmin(u))`. Grown-up accounts (`auth.js isGrownup`: `account_type === 'grownup'`) can
  **already** host. It has **no billing check**. `/live`, `POST /api/live/sessions` and the game page's Host button
  (`routes/games.js livePanel`) all go through `canHost` (`routes/live.js hostOnly`). Kids, students and guests are
  refused (404 on the API, redirected to `/join` on pages).
- What depends on billing is **making** a grown-up account. `POST /api/grown-ups/signup` and the `/grown-ups/*` pages
  sit behind `routes/family.js on`, which is `F.familiesOn(req)`, which is `billingOn() && (config.billingPublic ||
  previewing(req))` (`services/family.js:46`). `billingOn()` (`services/stripe.js:30`) needs a Stripe key and a webhook
  secret. With billing off, `/signup?for=grownup` shows the "coming soon" page (`routes/auth.js grownupSoon`).
- The `family` audience also needs `familiesOn()` (`hostFamily` in classlive-access.js). The **open** audience (what the
  owner chose) does **not**.
- **Conclusion: hosting needs no code change.** A signed-in grown-up can host an open Doodle Hoot room in every billing
  state, whether or not they pay. While billing is off or not public, new grown-ups cannot sign up, so in practice the
  hosts are teachers, school staff, the admin and grown-ups who already exist. Teachers can always host.
- We pin this with a unit test: `mum` (a grown-up) hosts `doodle` with billing off; `kid`, a class student, a guest and
  a banned grown-up are refused. It goes in `docs/decisions.md` and `docs/safety.md` §12.
- Open rooms have no co-hosts (`cohostRefusal` returns `cohostRoom`), so nobody but the host runs one. In family and
  class rooms, co-hosts are adults only (`controlTier`), as today. The drawer is a player, never a controller: the only
  drawing control they have is over their own drawing (undo or clear their own strokes).
- `maxPlayersFor` already caps a grown-up's open room at 30 (`GROWNUP_OPEN_MAX`). Doodle Hoot's own cap is lower
  (§3.7).

### 2.2 How a server-run live mode is added (the Tug of Math pattern)
- `classlive-access.js`: add to `MODES`, `GAME_MODES` (no question set, no quiz) and `CAPACITY`.
- `server/live/<mode>.js`: the rules and constants, plus `parseId`, `makeId` and `DEFAULT_ID` for the starter.
- `server/services/classlive-<mode>.js`: the room logic. It has `init`, `publicState`, `start`, `pause`, `resume`,
  `fromPlayer` (it intercepts player `ev`; nothing is relayed generically), `tick` and `finish`. `classlive-tug.js`
  works this way.
- `classlive-sessions.js` hooks: `createSession` (`if (mode === 'doodle') DG.init(...)`), `play()`, `pauseNow`,
  `doAction` (`resume`, `next`/`skip`), `event()` (intercept), `ready()` (resync a reloaded or late frame), `score`/`item`
  (ignored, as for tug), `tick()`, `rematch` (keep the starter), `endSession` (wipe), and the seat `scoredBy: 'server'`.
- `classlive-results.js`: `scoredBy` and `settings.doodle` for play again.
- `routes/live.js`: a mode card in `modes`, the landing picker, `sessionOpts` and `starterPre`.
- `views/live.js`: the `#lv-doodle-opts` fieldset and host controls. `public/js/live-sets.js` shows and hides the
  fieldset.
- `routes/teachers.js MODE_ID` and its card, `server/live/live-games.js LIVE_GAMES`, an i18n one-off script
  (`scripts/i18n-add-live-doodle.mjs`, modelled on `scripts/i18n-add-live-tug.mjs`), `scripts/live-load.js` and
  `scripts/live-layout-audit.js` modes, and the docs.
- One source of truth for the logic shared by the game and the server: tug reads `TugGen` from the seed html between
  markers, with `node:vm` (`server/live/tug-gen.js`). Doodle Hoot does the same for its pure core (§6.1).
- Server → seat private events: `io.toSeat(s, no, { t: 'ev', f: 0, k, d })`. They are not run through `evDataOk`
  (that check is only for messages *from* devices). The page relays them unchanged
  (`live-common.js send`), and the kit emits `event {from, kind, data}`. So the server can send the drawer their word,
  and guessers their tiles, as Unicode strings from our reviewed list.
- Player → server limits that shape the stroke format (`classlive-protocol.js`): a player message is at most 2 KB;
  `ev` data is at most 512 bytes, nested at most 2 deep, arrays at most 64 entries, numbers, booleans, null and
  `[a-z0-9_-]` tokens only. The `ev` rate is 10 a second with a burst of 20, and 5 seconds at 3x the rate closes the
  socket (4429 flood). The kit's `send(kind, data, {toHost})` adds `to: 'host'`, and `ready({ words })` lists the kinds.

## 3. Hosting and joining, end to end

### 3.1 The host
1. A grown-up (from the family page's "Host a live game", `routes/family.js:427`), a teacher (`/teachers/live`) or
   anyone who can host opens `/g/doodle-hoot` → **Host** (`/live?mode=doodle`), or picks "Doodle Hoot (Live)" on `/live`.
2. The landing fieldset `#lv-doodle-opts` (§9.2) has these settings:
   - **word language**: one of the 13 locales, defaulting to the host's own;
   - **word level**: Easy, Medium or Tricky, with three sample words;
   - **rounds**: 1, 2 or 3, defaulting to 2;
   - **drawing time**: 60, 80 or 100 s, defaulting to 80;
   - **who can join**: open (the default for grown-ups, and the owner's choice), family when available, or class for
     teachers;
   - **max players**: up to 16.
3. `POST /api/live/sessions { pick: 'mode:doodle', doodleLang, doodleLevel, doodleRounds, doodleSecs, audience }`.
   `sessionOpts` turns these into `starter: 'doodle:<lang>:<level>:<rounds>:<secs>'`, for example
   `doodle:en:1:2:80`, and drops any set, items and teams.
4. The host lands on `/live/host/:sid`, which shows the code, the QR and `/join`. We add two buttons to the join box
   (for every mode; they matter most here):
   - **Copy join link** copies `https://oomba.ai/join#1234567`. The code stays in the fragment, never in a query string
     or a log, as docs/safety.md §12 requires. `navigator.share` is used where available, so a parent can drop it into
     the family group chat.
   - **Play too** opens `/join#<code>` in a new tab, so the grown-up can take a seat as a player on this device or scan
     the QR with their phone. The host page itself is the control and spectator screen, the same as the projector in
     class. A grown-up who wants to draw and guess takes a seat like everyone else, with a nickname in open rooms.
5. There is no audio or video in the product. Families in different places can talk on their own call. The game
   needs no voice: the tiles are the whole guessing channel.

### 3.2 Players in different places
- Each person opens the link or types the code on `/join`, on their own phone, tablet or laptop, anywhere.
  `/api/live/join` gives them a seat token. Guests need no account; in open rooms everyone shows as a generated
  nickname (`classlive-names.js`, 144 phrases, rerolls limited). They land on `/live/play/:sid` with the game frame.
- Joining needs at least 2 seats before the host can start (`DG.canStart`; the Start button is disabled with "2 players
  needed"). Each player sees the lobby: avatars, nicknames, and Pip saying "Waiting for the host".

### 3.3 Reconnects
- A dropped socket reconnects with backoff (`live-common.js connect`). The seat token is in `sessionStorage`. On `rdy`
  the server calls `DG.resync(s, io, seat)`. That sends the seat's private state again (the drawer's word and next
  stroke id; or a guesser's tray, hints, placed-tile limits and "solved"), then the **current canvas from server
  memory** (§5.6), then the shared state already in `wel.state.dd`.
- If a reloaded drawer's frame is mid-stroke, the stroke is ended at the server's last point. The frame continues with
  the stroke id from `wd.s0`.
- After 60 s offline, a seat is freed by the existing sweep (`freeSeat`, `hooks.holdMs`). The `DG.left` hook removes it
  from the turn order. Its points stay in the summary (`s.gone`).

### 3.4 Late joiners
- Open rooms lock at Start (`autoLock`). The host can let people in late with Unlock or the "late" setting, as today.
  A late seat (`seat.late`) is put into the turn order just before the end of the current round, if that round still
  has turns to come; otherwise it goes into the next round. It can guess the turn in progress straight away: on `rdy`
  it gets the tray and a replay of the canvas so far. Its score is speed-based from the time left, like everyone's.

### 3.5 A player leaving mid-turn
- **A guesser leaves:** nothing changes. If every *connected* guesser has solved it, the turn ends early.
- **The drawer disconnects:** the turn clock keeps running and the canvas stays. If the drawer is back within 15 s
  (`DROP_GRACE_MS`), they carry on. If not, or if the seat is freed or removed, the turn ends: the word is revealed,
  guessers keep their points, the drawer gets their points so far, and the next turn starts.
- **The drawer is removed by the host:** the turn ends at once and the canvas is cleared on every screen (`cl`), so a
  removed player's drawing does not stay up during the reveal.
- **Fewer than 2 connected players:** the game shows "Waiting for players…" (`dd.ph = 'wait'`) and the timers stop. It
  goes on when 2 are back, and ends by itself after 3 minutes (`WAIT_MAX_MS`). The host can End at any time.

### 3.6 Host controls in this mode
- **Start, Pause/Resume, Lock/Unlock, End and Remove** (roster) work as today.
- **Eyes up** pauses as today. Pause freezes the turn clock and drops strokes and guesses while paused.
- **Skip turn** reuses `h skip`. In doodle mode, `at` is the turn number `dd.tn` from shared state, not `s.seq`, so a
  double tap can't skip two turns. Skipping reveals the word and gives no drawer points.
- **Clear drawing** is a new host action, `h { a: 'clear' }` (appended to the end of `HOST_ACTIONS`). It is allowed
  from the projector page and a full or limited dashboard, recorded in the activity log, and limited by `ACTION_GAP`
  (1 s). The server wipes the turn's strokes and broadcasts `ev { f: 0, k: 'cl', d: { n } }`.
- **Next** is hidden, as it is for tug.
- The host also sees a "**2 players hid this drawing**" badge (§10).

### 3.7 Capacity
`CAPACITY.doodle = { max: 16, best: [3, 10] }`. A turn-based drawing game cannot sensibly hold a class of 30: 30 turns
of 80 s is 40 minutes a round. So `tests/unit/live-capacity.test.js`'s "every mode holds a full class" gets a documented
exception list, `TURN_MODES = new Set(['doodle'])`, explained in docs/decisions.md and docs/live-capacity.md (measured
with `scripts/live-load.js MODES=doodle SIZES=4,8,16`). A later "team doodle" for classes, where one drawer per team draws
at a time, is listed as a follow-up, not built now.

## 4. The game loop (server-authoritative)

Platform phases are `lobby → loading → countdown → playing → ended`, the same as tug. The whole game is one `playing`
phase. The game's own sub-phase lives in the shared state `dd` (§8.2). In `services/classlive-doodle.js`:

| Sub-phase | How long | What happens |
|---|---|---|
| `pick` | 15 s (`PICK_MS`) | The drawer gets 3 word choices privately (`ch`). Others see "‹nickname› is choosing…" and Pip doodling. On timeout the server picks one at random. |
| `draw` | 60, 80 or 100 s | The drawer draws. Strokes are relayed live. Guessers spell with tiles. Hints come at set times. It ends when time is up, when every connected guesser has solved it, on a skip, or when the drawer leaves. |
| `reveal` | 5 s (`REVEAL_MS`) | The word (text and emoji) and each player's points this turn show on every screen. The canvas stays visible. |
| `wait` | until 2 players are back | The timers are frozen (§3.5). |
| `done` | 6 s (`HOLD_MS`) | The final podium in the frame (§4.6), then `io.end(s, 'ended')`, then the platform podium and results. |

### 4.1 Turn order
- At the start of each round the order is the connected seats in join order (`seat.no` ascending), so it is stable and
  fair. Round r is one full pass. Late joiners are inserted as in §3.4. Seats that are gone are skipped.
- There are 1 to 3 rounds; the host picks. The landing suggests 1 round when there are more than 8 players.
  `dd.rd` and `dd.rds` show "Round 2 of 3" and `dd.tn` is the turn number.

### 4.2 Word choice
- The drawer gets **3 different words** at the room's level, in the room's language. Nothing is repeated within the
  session (`s.doodle.used` holds concept ids). The 3 words are spread across the level's word list. A word whose
  `cat` (category) was used in the last two turns is avoided, so it isn't "animals" three times.
- The drawer answers `ev pk { n, i }` (i is 0 to 2). The chosen word's concept id stays on the server.

### 4.3 Timer and hints
- `dd.end` is the server clock time when drawing ends. Frames show a ring using `L.since`/`L.now()`.
- **Hints reveal tiles over time** (`HINTS`, as fractions of the drawing time):
  - At **40%**: remove up to 2 decoy tiles from every guesser's tray (`hd { n, t: [tile idx] }`).
  - At **55%** and **75%**: lock one letter into its slot (`hn { n, i: slot, t: tile }`). The letter is chosen at
    random among the slots not yet revealed, never the last hidden one.
  - At **85%**, for words of 8 or more graphemes: one more letter.
  - Revealed letters are capped at `floor(len / 2)`, so at least half the word is always left to spell.
  - The same hint goes to every guesser at the same moment. It goes to the drawer and the host only as a count
    (`dd.hint`).

### 4.4 Guessing (tiles)
- When all slots are filled, the frame sends `ev gs { n, t: [tile idx…] }` in slot order (hint-locked slots included).
- The server builds the string from its own tray, `grapheme(tray[t[k]])`, and compares it with the answer's grapheme
  sequence (§7.2). Tiles with the same letter can stand in for each other. Malformed guesses are dropped: a repeated
  index, the wrong length, an index out of range, a hint slot not matching, or a guess sent before the tray was sent.
- Every guess gets a result sent to **that seat only**: `ev gr { n, ok, p? }`.
  - **Wrong guesses** clear the non-hint slots on that device. At most one guess every **1.2 s** (`GUESS_GAP_MS`) and
    **12 wrong guesses a turn** (`GUESS_MAX`); after that it's "Keep watching!". This stops trying every arrangement
    of a short word.
  - **A right guess** puts the seat into `dd.got`. Everyone sees a tick next to that player, but never the letters. The
    seat then sees the word (`wd`) and the drawing, and can't guess again.

### 4.5 Scoring (server only; device `sc`/`it` are ignored as for tug)
- **Guesser:**
  - `round(50 + 50 × timeLeft / drawTime)`, which is 50 to 100 points;
  - plus an order bonus: +20 for the first right guess, +10 for the second;
  - minus 10 for each letter hint already shown when they solved it (`HINT_COST`), but never below 30.
- **Drawer:** `round(120 × solved / eligibleGuessers)`, where eligible guessers are the connected guessers at the end of
  the turn plus anyone who solved and then left. This scales the same for 2 players or 15. A drawer gets 0 for a
  skipped turn, or for a turn ended by the "hide" vote (§10).
- `seat.score` is the score; `seat.correct` and `seat.answered` count turns guessed and turns played, which feed the
  results page. `s.scoresDirty` drives the existing 2 s leaderboard. A right guess also sends a leaderboard at once.
- No teams in this mode: `T.isOn(s)` stays false, `teamActionOk` refuses all, and the landing hides the teams row.

### 4.6 The end and the podium (kit results card)
- After the last turn of the last round, `dd.ph = 'done'` and `dd.top = [[seat, score] × 3]`.
- **Players' frames** show the kit results card: `Oomba.ui.win({ title: <"1st place!" | "2nd place!" | "3rd place!" |
  "Well played!">, score, stars: 3/2/1 by rank band, hero: my avatar spec, next: false, pause: false })`. These are the
  1.1.4 yellow stars. There are no prices, plans or sign-up prompts on any player page (bare layout).
- **The host frame** draws a podium: the top three portraits via `L.flat({}).portrait(seat)` (or `Oomba.ui.portrait`),
  medals 🥇🥈🥉, nicknames and scores, with Pip cheering.
- After `HOLD_MS`, `io.end`. The host page runs the existing `podiumHold` and goes to `/live/results/:id`: players by
  score, no question review, a play-again that keeps the starter.

## 5. The drawing tool

### 5.1 Tools (drawer only)
- **12 colours** (`PALETTE`, fixed in DoodleCore): black, white, grey, red, orange, yellow, green, teal, blue, purple,
  pink and brown. Each swatch is a 44 px button with an aria-label colour name in the I18N block. Each is checked for
  contrast on both canvas backgrounds; the canvas is always paper-white, even in dark mode, so drawings look the same
  on everyone's screen.
- **4 sizes** (`SIZES` in logical units 4, 10, 20 and 36), shown as dots.
- **Eraser**: a stroke with `e: 1` drawn in paper white, so the replay is the same everywhere.
- **Undo**: removes the drawer's last stroke on every screen, up to the whole turn.
- **Clear**: clears the drawer's own canvas, with a confirm tap.
- There is no fill bucket. A flood fill gives different results on different screen sizes, so it is listed as a
  follow-up. There is no text tool and there are no stamps.

### 5.2 Input: touch and mouse
- Pointer Events on a `<canvas>` with `touch-action: none`, `setPointerCapture`, and `getCoalescedEvents()` where the
  browser has it.
- Only the primary pointer draws: a second finger or a palm is ignored, and a multi-touch gesture cancels the stroke in
  progress. Pen pressure is ignored, so every stroke is the same width everywhere.
- The keyboard can pick tools: 1 to 9 for colours, [ and ] for size, E for the eraser, Ctrl/Cmd+Z for undo. These are
  `keydown` handlers only, with no inputs.
- The drawer's own strokes are drawn locally at once. The server never echoes them back to the drawer.

### 5.3 Coordinates and quantisation
- The board is logical **1000 × 750** (4:3), drawn letterboxed and scaled to fit each device. The canvas backing store
  is set to `devicePixelRatio`.
- Points are rounded to whole logical units, which is about 0.4 mm on a 390 px phone, well under a finger's precision.
- **Simplification on the drawer's device:** a point is kept only if it is at least 3 units from the last kept point,
  or if the direction turns more than 25°. Each segment is then smoothed with midpoint quadratic curves when drawn.
  The same `DoodleCore.render` code draws on every device, so everyone sees the same smoothing.

### 5.4 Stroke streaming format (player → server)
```
ev ln { s, c, w, e, p }      to: 'host'
  s  stroke id, 0-4095, counts up within a turn (a new id starts a stroke; the same id as the last stroke continues it)
  c  colour index 0-11      w  size index 0-3      e  0 | 1 (eraser)
  p  [x0, y0, dx1, dy1, dx2, dy2, ...]   (x0 0-1000, y0 0-750; each delta -127..127; 2-60 numbers: 1-30 points)
     a continued stroke starts from its last point: every p is deltas only ([dx, dy, ...], 2-60 numbers)
```
- All keys are 1 or 2 letters, so they pass `evVocabOk` without being listed as words. The kinds `ln`, `un`, `cl`,
  `pk`, `gs`, `hide` and `need` are listed in `ready({ words })`.
- The largest message is 60 numbers of at most 4 characters plus keys, about 330 bytes, inside `MAX.ev` (512).
- **Batching:** the drawer's frame sends a batch every **100 ms** or every 30 points, whichever comes first, so a
  stroke streams as it is drawn and others watch it appear.
- The frame keeps its own token bucket at **8 `ev` a second, burst 12**, below the server's 10 and 20. This leaves room
  for `pk`/`un`/`cl`, so the drawer can never trip the flood close.
- If the outgoing queue backs up for more than 1 s (a slow network), the frame coarsens: the minimum distance becomes 6
  units, then 10. It never drops the start and end of a stroke.

### 5.5 Server validation and limits (`DG.stroke(s, io, seat, d)`)
A message is dropped silently, and counted in `s.doodle.drops` (counted, never logged), unless all of these hold:
- the room is `playing`, `dd.ph === 'draw'`, the clock is running (not paused or waiting), and `seat.no` is the drawer;
- `d` is a plain object with only the keys `s c w e p`; `c` is 0-11; `w` is 0-3; `e` is 0 or 1;
- `s` is the last stroke's id (a continuation, with the same `c`, `w` and `e`) or a new id that is bigger, at most +16;
- `p` is an array of whole numbers with an even length from 2 to 60. A new stroke starts with an absolute point in
  0-1000 × 0-750. Every delta is within ±127. Points that run past the board are **clamped** to its edge, so a drawing
  can't escape the board and the message still counts;
- per turn, at most **600 strokes** (`MAX_STROKES`) and **8,000 points** (`MAX_POINTS`). Past either cap, the drawer is
  told once with `ev full { n }` ("The page is full: undo or clear to draw more"), and undo or clear frees room;
- point rate: at most **400 points a second** over a rolling 2 s window (`MAX_PPS`). This is on top of the socket's
  per-type token bucket and the 2 KB message cap, which close a flooding socket.

`un { n, s }` removes the last stroke if its id is `s`; `cl { n }` clears the canvas; both are drawer-only, during
`draw`. When a message passes, the server stores it as a stroke record `{ s, c, w, e, pts: Int16Array }` in
`s.doodle.canvas`. At most 8,000 points × 2 × 2 bytes is about 32 KB per room, all in memory. It relays one normalised
message, `ev { f: <drawer seat>, k: 'ln', d }` (the clamped absolute form), built once with `JSON.stringify` to every
other connected seat and to the projector. The drawer's own device never gets it back. Dashboards get nothing: they have
no frame.

**Back-pressure:** a stroke can't be skipped without breaking the picture. When a connection's `bufferedAmount` is over
`MAX_BUFFERED` (64 KB), the server stops relaying to it and marks it `stale`. When it has drained (checked each tick),
the server sends it a full canvas snapshot (§5.6) and relays normally again.

### 5.6 Replay for late joiners and reloads (from memory only)
`DG.sendCanvas(s, io, target)` sends `ev cv { n, k, of, l }` in chunks of at most **12 KB** each:
- `k` is the chunk number and `of` the number of chunks;
- `l` is a list of `[s, c, w, e, x0, y0, dx…]` stroke records;
- `k = 0` tells the frame to clear its canvas before drawing.

It is sent to:
- a seat on `rdy` during `draw` or `reveal`;
- the projector when its frame says `rdy` (a new hook in `hostReady`);
- a connection that went stale and has drained.

The canvas lives only in `s.doodle.canvas`. It is emptied when a turn ends, after the reveal, on a host or drawer clear,
when the drawer is removed, when the room is wiped by the hide vote, and in `endSession` (`DG.wipe(s)`, called before
the 10-minute keep-for-results period starts). It is never in `s.state`, the summary, the results, a saved run, a
report, a log line or an analytics event.

### 5.7 Rendering on viewers
- Each frame keeps the turn's stroke list in memory, so it can redraw after a resize or rotation, and
  `DoodleCore.render(ctx, strokes, scale)` redraws it.
- Incoming `ln` messages are drawn straight away, in place.
- Everything is dropped at the turn change, and on `cl` or `cv` with `k = 0`.

## 6. The game file and shared core

### 6.1 `seed-games/doodle-hoot.html` structure
On **Oomba Kit 1.1.4**, the page loads, in order:
- the exact `kitTag('1.1.4')`;
- `kitPackTag('art-animals', '1.1.4')` (Pip, avatars);
- `kitPackTag('live', '1.1.4')`, the same tags as `seed-games/tug-of-math.html`;
- the word pack for the player's language, loaded with `integrity` and `crossorigin="anonymous"` (§7.4);
- script 1: `/* doodle-core:begin */ window.DoodleCore = { … } /* doodle-core:end */`, which is pure, with no DOM. It
  holds `PALETTE`, `SIZES`, `W`, `H`, `encode`/`decode` for strokes, `simplify`, `render(ctx, strokes, scale)` (it
  takes a context and does no DOM lookups), `graphemes(str)`, `buildTray(answer, lang, level, rng, decoyPool)`,
  `check(tray, answer, picks)`, `score(...)`, `hintPlan(len, rng)`, `rng(seed)` (mulberry32) and the `HINTS` timings.
  `server/live/doodle-core.js` loads this block with `vm.runInNewContext` (with a timeout) exactly as
  `server/live/tug-gen.js` does, so the server and the game share one source of truth;
- script 2: `/* doodle-art:begin */ window.DoodleArt = { <concept id>: [stroke records] } /* doodle-art:end */`, the
  practice doodles (§11) in the same stroke format;
- script 3: the game, with the `// ==== I18N START ==== … // ==== I18N END ====` block (`var STR = { en, 'en-GB', es,
  fr, de, it, pt, nl, ru, ja, 'zh-Hant', ar, he }`, no plural objects), read by `tts-lines.js`.

### 6.2 Screens
- **Live, player, phone portrait:** a top bar (round, timer ring, the drawer's avatar and nickname), the canvas (4:3,
  full width), then the drawer's toolbar (2 rows: swatches, then size, eraser, undo, clear) or the guesser's slots, tray
  and "Hide drawing" button. A score strip shows the top 5, ✓ for who solved it, and "you".
- **Phone or tablet landscape:** the canvas on the left; the tools or tiles on the right.
- **Desktop and projector:** the canvas in the middle, the roster and scores on the side, and the slots under the canvas
  (empty, with hints filling in), so a TV in a living room works as the "big screen".
- Every control is at least 44 px and nothing scrolls. It must pass `tests/e2e/frame-fit.js frameProblems` at 390×844,
  844×390, 820×1180, 1180×820, 1280×800 and 1920×1080.
- **Pick:** the drawer sees three big word cards (emoji + word); everyone else sees Pip with a pencil and "‹name› is
  choosing a word".
- **Reveal:** the word, its emoji, and +points chips per player.
- **Accessibility:**
  - `aria-live` for "‹name› got it!", hints and the time left at 10 s;
  - tiles are `<button>`s with the letter as their label;
  - a physical keyboard's letter keys pick a matching tile (keydown), and Backspace removes the last placed tile;
  - reduced motion turns off the confetti and Pip's wobble.
- **RTL:** the UI's direction follows `O.dir`. The *slots'* direction follows the **room's word language**: `rtl` for
  `ar` and `he`. The canvas is never mirrored.
- **Test hooks** (`window.__brbTest`):
  - `state()` → `{ mode: 'solo'|'pass'|'live', role, ph, rd, tn, drawer, me, word (drawer or solved only), tray:
    [chars], slots, hintSlots, strokes (count), points (count), hidden, got: [seats], scores, ended, top }`;
  - `pick(i)` and `draw(pointsArray)` (feeds synthetic pointer moves through the real input path);
  - `tap(trayIdx)` and `spell(word)` (taps the tray tiles for these graphemes);
  - `undo()`, `clear()`, `hide()`, `seed(n)`, `step(ms)` and `skipAnimations()`.

## 7. Letter tiles in 13 languages

### 7.1 Grapheme model
- Answers are stored in NFC. `DoodleCore.graphemes(s)` splits with `Intl.Segmenter(lang, {granularity: 'grapheme'})`
  where it exists (Node 22 and current browsers). The fallback is `Array.from` and joining combining marks (`\p{M}`).
- One tile is one grapheme. Spaces split words and are **never** tiles. Slots are grouped per word (`g: [3, 5]` for
  "ice cream"), with a fixed gap between them.
- Hyphens and apostrophes are not allowed in answers; the word-list test enforces it.
- **Case:** Latin, Cyrillic and Greek-style scripts are shown in capitals, using `toLocaleUpperCase(lang)`. **ß stays
  ß** (it is never turned into ẞ or SS). Comparison is done on the stored form, so case is never part of a guess.

### 7.2 Per script
- **Latin with accents** (es, fr, de, it, pt, nl, en, en-GB):
  - Accented letters are their own tiles: É is not E, and Ñ is not N. The answer needs the exact letter.
  - On **Easy**, decoys never include the plain or accented twin of a letter in the word (no E decoy next to É), so a
    young player isn't tricked by accents.
  - On Medium and Tricky, one "twin" decoy may appear, which is a gentle spelling lesson.
  - Dutch "ij" is two tiles, I and J.
- **Cyrillic** (ru):
  - The word list writes ё where it belongs, so Ё is its own tile and the twin rule above applies to Е/Ё.
  - Й and Ъ/Ь are ordinary tiles.
- **Arabic** (ar), right to left:
  - No harakat in answers.
  - Tiles show the **isolated** letter. Under the slots, a preview line shows the letters placed so far as one joined,
    shaped word in a single text run, so the player sees the word as it is really written.
  - Hamza and alef forms (ا أ إ آ), ة/ه and ى/ي are distinct tiles. On Easy, no twin decoys of these.
  - Lists avoid words that need a shadda in their usual spelling, or the shadda is a fixed (pre-placed) mark.
    **Decision: no shadda words in v1** (the test rejects them).
- **Hebrew** (he), right to left:
  - No niqqud.
  - Final forms (ך ם ן ף ץ) are distinct tiles: the final letter must be the final form. On Easy, the plain/final twin
    is not used as a decoy.
- **Japanese** (ja):
  - **Kana tiles.** Each answer is written as children see it written: **hiragana** for native words (ねこ, さかな,
    はさみ) and **katakana** for loanwords (ライオン, ピザ, ロケット).
  - One kana is one tile. Small kana (ゃ ゅ ょ っ ャ ュ ョ ッ) and the long-vowel mark ー are their own tiles.
  - Decoys come from the same script as the word and look plausible: kana from other words in the list, so the pool
    stays everyday kana.
  - The drawer's card also shows the kanji form where one is common (猫 ねこ), as a reading aid. Tiles and the check
    use the kana.
- **Chinese, Traditional** (zh-Hant):
  - **Character tiles.** Answers are 2 to 4 characters, which is the natural length (小貓, 蘋果, 長頸鹿); there are no
    1-character answers.
  - Decoys are characters taken from other words at the same level, so they are known characters, and never one that
    makes a different list word out of the tray.
  - There is no Zhuyin in v1.

### 7.3 Decoys (`DoodleCore.buildTray`)
- **How many:** Easy `clamp(round(len × 0.4), 2, 4)`, Medium `clamp(round(len × 0.5), 3, 5)`, Tricky
  `clamp(round(len × 0.6), 4, 7)`. A tray has at most **20 tiles** (2 rows of 10 on a phone).
- **From where:** each language's decoy pool is its alphabet, weighted by letter frequency (a table per language in the
  word data), or for ja/zh the kana or characters of the other words.
  - A decoy never repeats a letter that is already a decoy.
  - It avoids look-alikes on Easy (the twin rules above).
  - It never makes the tray spell a rude word: a check against `services/textfilter.js` blocklists via `foldForList`,
    with a reshuffle on a hit.
  - It is seeded per turn with crypto randomness on the server; the frames never build trays in live play.
- **Tray order:** the tray is shuffled. **Every guesser gets the same tray**, so the game is fair and hints line up. The
  tray never shows the answer letters in order (it reshuffles if it does).

### 7.4 Word lists per language
- **Source of truth:** `server/live/doodle/concepts.json`. It has about 330 concepts, each `{ id, lvl: 1|2|3, cat,
  emoji }`. Cats include animals, food, home, school, toys, nature, weather, vehicles, sports, body, clothes, jobs,
  places, actions (Tricky only) and space.
  - **Easy:** about 140 concrete nouns that are quick to draw (cat, sun, tree, ball, fish, cake).
  - **Medium:** about 120 (rainbow, castle, rocket, octopus, umbrella, snowman).
  - **Tricky:** about 70, including two-word answers and simple actions (ice cream, treasure map, swimming, juggling,
    hot air balloon). Every concept must be drawable without letters or numbers.
- **Per locale:** `server/live/doodle/words/<lang>.json` holds `{ "<id>": "<word>" }`. A concept with no good short
  word in a language is left out of that language (its key is missing). `en-GB` uses en plus British spellings via a
  small `en-GB.json` overlay. The words are written by the builder (the translator role, as for the live bank) and
  checked by tests. At least **100 Easy, 80 Medium and 40 Tricky per language**, so 1 to 3 rounds of up to 16 players
  never runs dry.
- **Kid-safety rules for words:**
  - Nothing scary, violent, rude or brand-named, and no people's names, flags or religious symbols.
  - Nothing that is a slur or rude word in any other of the 13 languages, checked against all blocklists with
    `profanityMatch`.
  - At most 12 graphemes per word and at most 2 words.
- **Data packs for the frame** (practice and pass-and-play only; live trays come from the server): built by
  `scripts/doodle-words.js`, modelled on `scripts/live-bank.js`, into `public/vendor/data/doodle-hoot/v1/<lang>.js`
  (`window.DoodleWords = { lang, dir, concepts: [[id, lvl, emoji, word], …], decoys }`). The script writes each pack's
  sha384 into the game. Version folders never change once published. If a pack can't load, the game falls back to the
  English pack and says so.

## 8. Protocol messages (additions to v1; no new socket types)

### 8.1 Player → server (`ev`, always `to: 'host'`, intercepted by `DG.fromPlayer`; never relayed generically)
| kind | data | who / when |
|---|---|---|
| `pk` | `{ n, i }` (turn number, choice 0-2) | the drawer, during `pick` |
| `ln` | `{ s, c, w, e, p }` (§5.4) | the drawer, during `draw` |
| `un` | `{ n, s }` | the drawer, during `draw` |
| `cl` | `{ n }` | the drawer, during `draw` |
| `gs` | `{ n, t: [tile idx…] }` | an unsolved guesser, during `draw`, at most 1 per 1.2 s |
| `hide` | `{ n }` | any viewer, once per turn (§10) |
| `need` | `null` | a frame asking for its private state and the canvas again (as tug's `need`) |

### 8.2 Server → devices
- **Shared state `dd`**, via `io.publish`, which goes to every device, the projector and `wel.state`. It is small and
  holds numbers and tokens, plus the word only in `reveal`/`done`:
  ```
  { lang, lvl, rds, rd, tn, ph: 'pick'|'draw'|'reveal'|'wait'|'done', dr: drawer seat, end: server ms | 0, left: ms,
    g: [word lengths in graphemes, per word] (draw), dir: 'ltr'|'rtl', hint: n, got: [seats], order: [seats],
    rv: { w, e, pts: [[seat, points]…] } (reveal only), top: [[seat, score]…] (done only) }
  ```
  It is sent on every change, at most about 5 a second, with numbers only between changes.
- **Private, `io.toSeat(... { t: 'ev', f: 0, k, d })`:**
  - `ch { n, w: [3 words], e: [3 emoji], ms }` goes to the drawer.
  - `wd { n, w, e, s0 }` goes to the drawer after the pick, to a guesser after a right guess, and on resync.
  - `tray { n, t: [tile strings], g, dir }` goes to each guesser when drawing starts and on resync.
  - `hn { n, i, t }` and `hd { n, t: [...] }` go to guessers.
  - `gr { n, ok, p? }` goes to the guesser who guessed.
  - `full { n }` goes to the drawer.
- **Relayed:** `ln`, `un` and `cl` from the drawer (`f: drawer`). The host's clear is `cl` with `f: 0`. `cv` chunks
  (§5.6) go to the one connection that needs them.
- **To the hosts only (`io.toHosts`):** `hid { n, k }`, the number of viewers hiding this turn's drawing.
- **Host action:** `h { a: 'clear' }` is new (§3.6). `h { a: 'skip', at: dd.tn }` is reinterpreted in doodle mode.
  `kick` is unchanged and ends the turn if the drawer is removed.
- Everything is documented in `docs/live-protocol.md` under a new "### Doodle Hoot Live (`doodle`)" section, after Tug
  of Math's.

## 9. Files to add or change

### 9.1 New
| File | What |
|---|---|
| `seed-games/doodle-hoot.html` | The game: solo practice, pass-and-play, and the live player and host views (§6, §11). |
| `seed-games/doodle-hoot.json` | Metadata: `category: 'learning'`, `players_max`, `featured: true`, `notes` (kit 1.1.4, packs, modes, storage key `doodle-hoot-v1` (settings and best only, never drawings), test hooks), and `l10n` for 12 locales. |
| `server/live/doodle.js` | `LANGS` (13), `LEVELS [1,2,3]`, `ROUNDS [1,2,3]`, `SECS [60,80,100]`, `PICK_MS`, `REVEAL_MS`, `HOLD_MS`, `DROP_GRACE_MS`, `WAIT_MAX_MS`, `GUESS_GAP_MS`, `GUESS_MAX`, `HINT_COST`, `MAX_STROKES`, `MAX_POINTS`, `MAX_PPS`, `parseId`, `makeId`, `DEFAULT_ID = 'doodle:en:1:2:80'`, and `wordsFor(lang, lvl)`, which loads `doodle/concepts.json` and `doodle/words/<lang>.json` once and filters them. |
| `server/live/doodle-core.js` | Loads `DoodleCore` from the seed html between the markers with node:vm (the pattern of `tug-gen.js`). |
| `server/live/doodle/concepts.json`, `server/live/doodle/words/*.json` (13) | The word data (§7.4). |
| `server/services/classlive-doodle.js` | The room: `init`, `publicState`, `canStart`, `start`, `pause`, `resume`, `fromPlayer`, `stroke`, `undo`, `clearCanvas`, `pick`, `guess`, `hide`, `hostClear`, `skip`, `resync`, `sendCanvas`, `left`, `drawerDropped`, `tick`, `finish`, `wipe`, `hooks` (the times, for tests). |
| `scripts/doodle-words.js` | Builds the data packs and their hashes into the html (§7.4). |
| `public/vendor/data/doodle-hoot/v1/<lang>.js` (13) | The packs. |
| `scripts/covers/doodle-hoot.recipe.js` | The cover: practice mode with Pip's doodle half drawn and the tray half spelled. |
| `public/covers/doodle-hoot.jpg`, `public/og/doodle-hoot.jpg` | From `scripts/covers.js` and `scripts/og-images.js`. |
| `scripts/i18n-add-live-doodle.mjs` | Site keys in all 13 locales (§9.3). |
| `tests/unit/doodle-core.test.js`, `tests/unit/doodle-words.test.js`, `tests/unit/live-doodle.test.js`, `tests/e2e/doodle-hoot.spec.js`, `tests/e2e/doodle-hoot-live.spec.js` | §12. |

### 9.2 Changed (append new entries at the END of ordered lists)
- `server/services/classlive-access.js`:
  - `MODES.doodle = 'doodle-hoot'`;
  - `GAME_MODES` gets `'doodle'`;
  - `CAPACITY.doodle = { max: 16, best: [3, 10] }`;
  - a new `TURN_MODES = new Set(['doodle'])`, used by the capacity test and `/live` (it suggests 1 round above 8
    players).
- `server/services/classlive-sessions.js`:
  - `import * as DG` / `* as DOO`;
  - `createSession`: `if (mode === 'doodle') DG.init(s, opts.starter)`;
  - `play()`: `if (s.doodle) DG.start(s, io)`;
  - `pauseNow` and `resume`;
  - `doAction`: `skip` goes to `DG.skip(s, io, at)` and the new `clear` to `DG.hostClear`;
  - `event()`: `if (s.doodle) { if (from) DG.fromPlayer(...); return; }`;
  - `ready()`: `DG.resync`;
  - `hostReady`: `DG.sendCanvas(s, io, 'host')`;
  - `detachSeat`: `DG.drawerDropped`;
  - `freeSeat`: `DG.left`;
  - `score`/`item` ignore doodle;
  - `tick()`: `DG.tick` plus stale-connection snapshots;
  - `endSession`: `DG.wipe(s)` before anything is kept;
  - `rematch` keeps the starter;
  - `scoredBy` is `'server'` for doodle seats;
  - the `start` action refuses fewer than 2 seats (`DG.canStart`, a nak `wait`).
- `server/services/classlive-protocol.js`: `HOST_ACTIONS` gets `'clear'` (at the end), with no fields.
- `server/services/classlive-results.js`: `scoredBy` and `settings.doodle`. There is no item review: `items` is empty.
- `server/routes/live.js`:
  - a mode card `{ id: 'doodle', icon: '🦉', title: t('live.mode.doodle'), text: t('live.mode.doodleText'), own: true }`
    at the end of `modes`;
  - `doodlePicker(req)` (languages with their own names, levels with 3 sample words from `wordsFor`);
  - `sessionOpts` handles the `doodleLang`, `doodleLevel`, `doodleRounds` and `doodleSecs` fields;
  - `starterPre` handles the `doodle:` prefix;
  - `fromRunOpts` keeps `settings.doodle`.
- `server/views/live.js`:
  - `landingBody` gets `doodle` and the `#lv-doodle-opts` fieldset;
  - `hostBody`'s controls for `s.doodle` are `['start','pause','resume','skip','clear','lock','unlock','end']`;
  - the doodle note under the teams row;
  - the **Copy join link** and **Play too** buttons in `lv-joinbox` (all modes).
- `public/js/live-sets.js` shows and hides the fieldset. `public/js/live-host.js` handles `clear` with a confirm, skip
  with `dd.tn`, the `hid` badge, and the copy and share link. `public/js/live-dash.js` handles `clear`, `skip` and the
  hide count.
- `server/routes/teachers.js`: `MODE_ID.doodle = 'doodle'` and a card at the end.
- `server/live/live-games.js`: `'doodle-hoot': { mode: 'doodle', solo: 'doodle-hoot', play: true }` at the end. The
  second button reads "Practise or play on one device" (`live.doodle.play`).
- `scripts/seed.js`: `SEED_GAMES` gets `'doodle-hoot'` at the **end**.
- `tests/unit/scanner.test.js`: the "seed games pass" list gets it at the end.
- `tests/e2e/seeds.spec.js`: `SEEDS` gets `['doodle-hoot', 'Doodle Hoot']` at the end.
- `server/services/tts-lines.js`: `GAMES['doodle-hoot'] = { title: 'Doodle Hoot', role: 'bright', spoken:
  /^(?:howto|title|pick|yourTurn|gotIt|timeUp|podium)/ }`. The secret word is **never** spoken: it isn't in the I18N
  block, and a spoken word would tell the room the answer.
- `server/learn.js`:
  - `LEARNING['doodle-hoot'] = { key: 'doodleHoot', teaches: ['Spelling', 'Vocabulary', 'Drawing', 'Languages'],
    level: 'Ages 6-14' }`;
  - `HUBS` word-games gets `'doodle-hoot'` at the end;
  - `TEACHER_GAMES` gets it at the end;
  - `AGES` a8 and a10 get it at the end;
  - bump `CONTENT_UPDATED`;
  - new keys `learn.games.doodleHoot`, `learn.ages.a8.fit.doodleHoot` and `learn.ages.a10.fit.doodleHoot`.
- `scripts/live-load.js`: `MODES=doodle`. A bot drawer sends a stroke every 100 ms; bot guessers spell from the tray
  with 30% wrong guesses. It measures relay latency and bytes at 4, 8 and 16 players.
- `scripts/live-layout-audit.js`: a `doodle` mode, with shots at pick, draw (drawer and guesser) and reveal.
- `tests/unit/live-capacity.test.js`: the `TURN_MODES` exception with a comment.
- `docs/decisions.md`: a new entry "Doodle Hoot (Nov 2026)", covering the name check, the hosting and billing finding,
  tiles, memory-only drawings, the capacity exception and the hide vote.
- `docs/safety.md` §12: a "Doodle Hoot" paragraph (§10 below) and the honest limits.
- `docs/live-protocol.md`: the new section (§8).
- `docs/live-capacity.md`: the measured row.
- No migration: everything is in memory, and the run row and its settings JSON already exist. We stay at
  `0042_tts`.

### 9.3 Site i18n keys (13 locales, via the script; then `npm run i18n:check`)
- `live.mode.doodle` and `live.mode.doodleText`;
- `live.doodleUi.{legend, lang, level, levels (Easy|Medium|Tricky), like, rounds, roundsN, secs, secsN, hint,
  bigRoom}`;
- `live.host.{clear, clearConfirm, copyLink, copied, share, playToo, hidCount}`;
- `live.act.clear` (the activity line);
- `live.api.needTwo`;
- `live.doodle.play`;
- `live.teachersCard.doodle.{h,p}`;
- the three `learn.*` keys.

The known `play.js uses layout.back` failure also fails on main and is not ours.

## 10. Safety measures (what goes into docs/safety.md §12)

- **Hosts are adults only.** `canHost` is unchanged: teachers, school staff, grown-ups and the admin; kids, students,
  guests and banned accounts never. Open rooms have no co-hosts. Tested.
- **No free text.**
  - Players draw, tap tiles and press buttons. Names are the 144 nickname phrases (or class roster names in a teacher's
    own class room).
  - Guesses are tile *indexes*, never text.
  - The words come only from our reviewed list. The server sends a word only to the drawer, and to a guesser once they
    have solved it.
  - Players' events still pass `evVocabOk`, and the server intercepts every doodle event, so nothing is relayed as-is.
  - There is no chat, no "close guess" message and no typed guess. Emotes keep their fixed six, in the lobby and
    between turns only.
- **Drawings are memory only.**
  - Relayed from `s.doodle.canvas` in memory and wiped at the end of each turn and of the session.
  - Never stored (no database, files or `BRB.storage`), never in shared state, results, saved runs, reports or logs. The
    socket only logs the session id, seat and reason, and the doodle code logs counts only.
  - Never sent to any AI: `classlive-doodle.js` imports nothing from the AI, moderation, screenshot or TTS services
    (a static test, like `tests/unit/mic-scope.test.js`).
  - Never screenshotted by the server: the shots worker never opens `/live/frame`.
- **Strokes are validated** for bounds, point count, message size, stroke and point caps per turn, and points per
  second; the drawer only, during drawing, never while paused (§5.5). This is on top of the socket's 2 KB cap, its
  per-type token buckets and the flood close.
- **Host tools:** Clear drawing (everyone's screen), Skip turn, Remove player (which ends their turn and clears their
  drawing if they were drawing), Pause, Eyes up, Lock and End.
- **Hide this drawing** (each viewer, guessers and the host's own view):
  - It blurs this turn's canvas on that device only, showing "Drawing hidden", and the viewer can still spell from the
    hints.
  - It also sends `hide { n }`. The server counts distinct viewers and tells the host (`hid`).
  - If **at least half of the connected guessers (and at least 2)** hide the same drawing, the server clears it
    everywhere and ends the turn with no drawer points (`dd.rv.hid = 1`, "This drawing was skipped").
  - The drawer is never told who hid it.
- **Report** (the existing player-page button, fixed reasons, the host told) works in this mode. A report stores the
  reason and the room, never the drawing.
- **Honest limits:** a drawer can draw letters, numbers, a rude picture or contact details, because a drawing is free
  form and nothing automatic can stop that without storing or analysing drawings, which we promised not to do. The
  protections are:
  - adult hosts who see every drawing live;
  - Clear, Skip and Remove;
  - each viewer's Hide, and the hide vote;
  - Report;
  - nicknames only, open rooms locked at Start, at most 16 players, and codes that die with the session;
  - drawings that vanish at the end of each turn.
  The game also tells drawers "Draw pictures, not letters".

## 11. Solo modes (the game page's second button: "Practise or play on one device")

1. **Guess Pip's doodles** (solo practice):
   - Pip "draws" a pre-made doodle stroke by stroke, using the same stroke format and renderer as live play.
   - The player spells with tiles; hints work the same way; there are 8 doodles a game; points use the live formula.
   - The end is the kit results card (`Oomba.ui.win` with stars by points, `BRB.gameOver({ won: true, score })`).
   - Level picker: Easy, Medium or Tricky, in the player's own language.
   - There are about **60 doodles** at launch (Easy 36, Medium 24), hand-authored as stroke records in
     `DoodleArt`, 3 to 12 strokes each, simple line art in the house style. A unit test checks each doodle against the
     same validator as live strokes and checks that the concept exists in every language's list. If a concept is
     missing in a language, that doodle is skipped for it.
2. **Pass and play** (2-6 people, one device):
   - Players are added by tapping avatars (no names typed; "Player 1-6" with kit portraits).
   - Turn order rotates. "Pass to the drawer" is a cover screen; the drawer peeks at 3 word cards and draws; then "Pass
     to the guessers", and they spell on the same device with the same tile rules.
   - Nothing leaves the device and nothing is stored but settings and the best practice score (key
     `doodle-hoot-v1`).
   - No score is submitted, because the screen is shared (`submit: false`, as for two-player games).

`LIVE_GAMES['doodle-hoot'].play: true`, so the button says it is a full game on its own, as for Tug of Math.

## 12. Tests

### 12.1 Unit (`TMPDIR=/tmp/bx node --test <files>`)
- `tests/unit/doodle-core.test.js` (DoodleCore through `server/live/doodle-core.js`):
  - stroke encode/decode round trips;
  - simplify keeps the end points;
  - graphemes: é in NFC and NFD, Arabic with no harakat, Hebrew final letters, ja small kana and ー, zh characters,
    and "ice cream" in two groups;
  - `buildTray`:
    - it contains every answer grapheme with its count;
    - the decoy count per level is right, and there are at most 20 tiles;
    - Easy has no twin decoys (É/E, Ё/Е, final/plain Hebrew, alef forms);
    - the tray is never in answer order, and is the same for a given seed;
    - no rude word appears in it (a stubbed blocklist hit forces a reshuffle);
  - `check`:
    - duplicate letters are interchangeable;
    - the wrong length, a repeated index, a hint-slot mismatch and an out-of-range index are refused;
  - `score`: the bounds and the order bonus;
  - `hintPlan`: never more than half, never the last letter.
- `tests/unit/doodle-words.test.js`:
  - every locale has at least 100 Easy, 80 Medium and 40 Tricky words;
  - each word is in its own script only (Latin plus that language's accents; Cyrillic for ru; Arabic, Hebrew,
    kana-only, Han);
  - at most 12 graphemes and at most 2 words; no digits, hyphens, apostrophes or shadda;
  - no duplicates within a level;
  - every word passes `cleanText` and `profanityMatch` against **all 13 blocklists** and `personalInfo`;
  - every concept has an emoji;
  - the data packs match the JSON and the hashes in the html match the files.
- `tests/unit/live-doodle.test.js` (a real socket via `tests/unit/_live.js`, with `DG.hooks` times shortened):
  - **starter and mode:** `parseId`/`makeId`; `MODES`, `GAME_MODES` and `CAPACITY`; `LIVE_GAMES`;
  - **hosting:**
    - `mum` (a grown-up) opens an open doodle room **with billing off**;
    - a teacher opens one;
    - `kid`, a class student and a guest get `notHost`, and so does a banned grown-up;
    - a `family` room without `familiesOn` gets `noFamily`;
  - **joining:**
    - guests join with nicknames;
    - Start with one seat gets a nak `wait`, and with two it starts;
  - **turn order** over 3 players and 2 rounds;
  - **pick:**
    - only the drawer gets `ch`; others never see a word;
    - a timeout auto-picks;
    - `pk` from a non-drawer is dropped;
  - **strokes:**
    - they are relayed to the others and the projector, never back to the drawer, and never to the dashboard;
    - a non-drawer's `ln` is dropped;
    - out-of-bounds points are clamped;
    - a bad colour, size or keys, an odd-length `p`, more than 60 numbers, a delta over 127 and a stroke id going
      backwards are dropped;
    - `MAX_POINTS` and `MAX_STROKES` give `full` once;
    - `MAX_PPS` drops the excess;
    - strokes are dropped while paused;
    - undo removes only the last stroke, and clear works;
  - **replay:**
    - a third seat joining late (after unlock) gets `cv` chunks equal to the server canvas, and `tray`;
    - a reloaded drawer gets `wd` and the canvas;
    - the projector's `rdy` gets the canvas;
  - **guesses:**
    - a right one gives `gr ok`, `dd.got` updates, and others see only the seat;
    - a wrong one gives `gr false`;
    - the gap and `GUESS_MAX` are enforced;
    - all solved ends the turn early;
  - **hints:** timing, and the drawer never gets the tray;
  - **scoring** as in §4.5; device `sc`/`it` are ignored;
  - **leaving:**
    - the drawer disconnects, and after the grace the turn ends;
    - the drawer comes back within the grace and carries on;
    - the host kicks the drawer: the turn ends and `cl` is broadcast;
    - with fewer than 2 players the room waits, then ends after `WAIT_MAX_MS`;
  - **host controls:**
    - `h clear` gives `cl` with `f: 0` everywhere;
    - `h skip` with a stale `at` does nothing, and with the current `tn` skips;
  - **hide vote:** 2 of 3 guessers hide, so the turn ends with no drawer points, and the host gets `hid`;
  - **the end:** `done` with `top`, then `ended`. The results rank by score. `s.doodle.canvas` is empty after
    `endSession`. **No log line contains stroke data or a word** (scan `logs` from `_live.js`). The summary, run row
    and report rows hold no drawing.
  - **static:** `classlive-doodle.js` and `server/live/doodle*.js` import nothing from `set-ai`, `lesson-ai`,
    `moderation`, `shots`, `snapshot`, `tts*` or `chat`;
  - **load:** 16 players and a long drawing turn, with each message under `MAX.ev` and the relay done in under 5 ms per
    message.
- Updates to existing tests: `live-capacity.test.js` (the exception), `live-entry.test.js` (passes through
  `LIVE_GAMES`⇔`MODES`), `live-protocol.test.js` (`h clear` parses, and unknown fields are dropped), `tts-coverage` and
  `tts-lines` (the new GAMES row), `scanner.test.js` and `seo`/`learn` tests that count lists.
  `tests/unit/live-pages.test.js` checks the landing fieldset and the host controls for doodle.

### 12.2 e2e (`TMPDIR=/tmp/bx E2E_PORT=<unique> BRB_SNAPSHOTS=1 BRB_CHROMIUM=… npx playwright test <spec> --trace off`)
- `tests/e2e/doodle-hoot.spec.js` (solo):
  - from title to setup to "Guess Pip's doodles": the doodle replays, tiles are spelled by tapping (taking the word from
    `__brbTest.state()` in solo), and the results card shows stars;
  - pass-and-play with 2 players for one turn;
  - frame-fit at the 5 sizes with touch;
  - RTL: an `ar` run with slots right to left;
  - `ja`: kana tiles.
- `tests/e2e/doodle-hoot-live.spec.js` (the headline test: **two player browser contexts play a full round over the
  socket**):
  1. DemoTeacher logs in, opens `/live?mode=doodle`, chooses en, Easy, 1 round, 60 s and an open audience, and opens
     the room. The projector is at 1920×1080.
  2. Two guest contexts (390×844 with touch, and 844×390) join with `/join#code` (`ownIp` for each), and get nicknames.
  3. Start → countdown. Player A is the drawer, picks card 0 by tapping, and draws 3 strokes with `page.mouse` /
     `touchscreen` on the canvas.
     - Player B's frame and the projector frame report `strokes ≥ 3` and the same `points` count as the drawer.
     - The projector never shows the word.
  4. Undo on A: B's stroke count goes down by 1.
  5. B taps a wrong arrangement and gets "Not quite". Then B spells the word: the test reads it from **A's** frame
     state (the drawer knows it) and maps the letters to B's tray (`__brbTest.state().tray`). B gets `gr ok`. The turn
     ends early (all solved), and the reveal shows the word on all three screens.
  6. Turn 2: B draws, A guesses. A reloads the page mid-turn and gets the canvas replayed (the stroke count matches).
     A solves it.
  7. The end: both players see the kit results card (the rank title and stars). The projector shows the podium, then
     `/live/results/:id` lists the two nicknames with their scores.
  8. A second test checks the host's **Clear drawing** (B's canvas is emptied), **Remove** on the drawer (the turn
     ends), **hide** on B, and a **late joiner** C (the host unlocks; C sees the current drawing replayed).
  9. Layout: `frameProblems` on the drawer, guesser and projector at their sizes; the page doesn't scroll sideways.
     `LIVE_SHOTS=/home/user/javascript-exercises/.claude/work/draw-out` saves the screenshots.
- An optional third spec, `doodle-hoot-grownup.spec.js`: a grown-up host on its own server with
  `tests/support/fake-stripe.js` (the family.spec.js pattern). The grown-up signs up, hosts and a guest joins. This
  proves the real grown-up path end to end. The unit test already covers it if time is short.
- Also run `tests/e2e/live-layout.spec.js`, `live.spec.js`, `tug-of-math-live.spec.js` (shared host page changes),
  `seeds.spec.js`, `games-fit.spec.js` and `layout.spec.js` (`/live` with the new fieldset, `/g/doodle-hoot`).
- Run the full `TMPDIR=/tmp/bx npm test` and compare the failures with a clean origin/main worktree (about 26 fail
  there already).

## 13. Build order (suggested commits)
1. DoodleCore in the html shell, `server/live/doodle-core.js`, and `doodle-core.test.js`.
2. The word data, `doodle-words.test.js`, the `scripts/doodle-words.js` packs, and the hashes.
3. `server/live/doodle.js`, `classlive-doodle.js`, the sessions, protocol and access hooks, and `live-doodle.test.js`.
4. The live frame UI: player, drawer and host views, the results card, and the test hooks.
5. The site: `/live` fieldset, host controls (clear, skip, hide badge, copy link, play too), teachers card,
   `LIVE_GAMES`, i18n script, `i18n:check`.
6. Solo practice (Pip's doodles) and pass-and-play; the cover recipe, covers and OG; `SEED_GAMES` and the test lists;
   tts-lines; learn.js.
7. The e2e specs, layout audits, live-load measurements, docs (decisions, safety, live-protocol, live-capacity), and a
   full test comparison.

## 14. Risks
- **Free-form drawings in open rooms with people the host invited.** They can't be checked automatically (see the
  honest limits in §10). The protections are the controls listed there. The lead should say this plainly to the owner.
- **Brute force with tiles.** Short words have few arrangements. The guess gap, `GUESS_MAX` and the speed scoring
  limit it. A determined kid can still solve a 3-letter word by trying; that's acceptable for a family game.
- **Word list quality in 13 languages.** Translations by the builder can be odd (a regional word, the wrong
  hiragana/katakana choice, gendered forms).
  - Mitigation: the tests above, plus a reviewer pass per language; concepts can be left out per language.
  - ja and zh-Hant are the riskiest: a native review is recommended before marketing in those languages.
- **The Arabic tile experience.** Isolated-form tiles are standard in Arabic spelling apps, but letters joining in the
  preview needs a check on iOS Safari, Android Chrome and Windows.
- **Network quality across homes.** Strokes are small (about 330 B per 100 ms while drawing, roughly 3 KB/s up for the
  drawer, and the same down for each viewer), so 3G works. A slow viewer is handled by back-pressure and a snapshot
  instead of a broken picture. Latency is about 100-300 ms, which is fine for drawing.
- **Server memory and CPU.** At most 32 KB of canvas per room. Relay fan-out is at most 16 sends per message × 8 a
  second. `LIVE_MAX_SESSIONS` still caps the rooms. A deploy or restart ends rooms in progress (as for every live game;
  `drainLive` sends `bye restart`).
- **Capacity exception.** "Every mode holds a full class" was a rule; Doodle Hoot breaks it on purpose (16). Teachers
  see the cap on the card, and a team mode is a follow-up.
- **Shared host page changes** (clear, copy link, play too) touch every live mode. Run the whole live e2e set.
- **The name.** The trademark search is still to do (§1); the fallback is ready.
- **Practice art effort.** Hand-authoring about 60 good doodles is real work. If time runs short, ship 36 Easy doodles
  first, and pass-and-play still gives a full offline game.
- **Billing state.** While billing isn't public, only existing grown-ups and staff can host. The game page's Host button
  is shown only to those who can host, so nobody hits a dead end.

## 15. Guess while drawing, typed or out loud (the owner's second request)

The owner, after playing on an iPhone: "The guesser should be able to guess while the drawer is drawing [so the drawer
can] adjust what they are drawing if the guesser is going off course. Also, the guesser should be able to type in
(without the bank of letters... just the normal keyboard because it's too easy with letters already given) or guess
aloud and the drawer should have an option to just pick a button that says something like Guessed Correctly!" Also: a
mobile and desktop pass (a photo showed SUNFLOWER broken as "SUNFLOWE / R" on the word cards).

Decisions (told to the owner before building):
1. **Guessing is open for the whole drawing.** It already was on the server (a guesser gets the turn when the drawing
   starts, before the first stroke); the guess box shows from that moment and stays while strokes arrive.
2. **Typing is the default**, on the device's own keyboard: one line and a Guess button, Enter sends. Letter tiles stay
   as the host's choice "Letter tiles (easier)" for little ones (`doodleTiles`, starter `:t`), off by default; the game
   on its own has the same choice on its setup card. A typed guess goes to the server only, as code points (the wire
   protocol still carries no strings), is compared there and forgotten: never kept, logged or sent to an AI.
   `DoodleCore.judge` (shared with the game on its own) normalises it (NFKC, lower case, accents and marks, ß/ss,
   umlauts, ё/е, alef forms, Arabic ال and Hebrew ה on the word, Hebrew final letters, spaces, hyphens, a leading
   article; 40 letters at most) and accepts the answer, its plural (an ending added; dropped only from a plural answer,
   leaving 4 letters or more) and the other English spelling, never another word of the list (Ei/Eis, Koch/Kochen).
   Japanese and Chinese input methods never send a half-made word; in the other languages Enter and Guess send what is
   in the box even while an Android keyboard still marks the word as "in composition". Every typed guess gets an answer
   from the server (too soon or no letters: not counted, and the box works again), and the game stops waiting after
   2.5 s, so a guess box can never get stuck.
3. **What anyone else sees of a guess.** The drawer and the host's page get a short list (the last 6): a wrong guess
   only when it is a word of the game's own reviewed list for that language or its plural ("Sam guessed DOG", sent as
   the word's id), at most 3 a guesser a turn (so list words can't spell out a message), anything else as "Sam guessed
   something else", a right one as "Sam got it!". A close guess is "So close!" to that guesser alone; the drawer and the
   host's page see it only as "something else" (on a shared screen the whole room would learn who is near). Other
   guessers never see anyone's guesses on their own device (no copying); the host's page may be on a shared screen, so
   the room can see the vetted list words there. This keeps the no-free-text rule: only vetted vocabulary is ever passed
   on. One guess a second, 30 wrong a turn.
4. **Said out loud.** The drawer has **Someone said it!**, which opens **Who guessed it?** with a button for each
   player who may still get it; a tap counts as that player's right guess (points by speed, the drawer's usual share).
   Only the drawer while drawing (or the host's page), once something is drawn that turn (a blank page can't hand out
   points: "Draw something first!"), once a player a turn; the list shows it as "Sam said it out loud!". Pass and play has
   the same button while drawing (the word stays covered so the others can watch; "My word" shows it for a moment).
5. **Mobile and desktop.** A word never breaks inside: word cards (one column on a narrow phone), the top bar's word,
   the reveal and the host's blanks shrink their type to fit (`fit()`); slots stay on one line and shrink. Below 600 px
   wide (a phone with its keyboard up included) the game stacks; with the keyboard up the players strip and notes give
   way, and the live page and the play page fit the visible part of the screen (`interactive-widget=resizes-content`,
   and the visual viewport on iOS). Checked with `tests/e2e/doodle-hoot-shots.spec.js` (DOODLE_SHOTS=<dir>) at
   375x667, 390x844, 430x932, 360x640, 844x390, 820x1180, 1366x768 and 1920x1080, light and dark, with frame-fit.
