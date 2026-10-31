# Oomba Live: wire protocol (v1) and page hooks

The server side of Oomba Live (`server/services/classlive-*.js`, `server/routes/live.js`, `server/views/live.js`).
Design and reasons: docs/decisions.md "Oomba Live"; safety: docs/safety.md §12. This page is the contract the page
scripts (`public/js/live-*.js`), the SDK transport (`public/sdk/brb-sdk.js`) and the kit's `live` pack build on.

## 1. HTTP

| Route | Who | Body / query | Answer |
|---|---|---|---|
| `GET /join` | anyone | (code in `location.hash`) | The join page (bare). `?code=<7 digits>` and `/join/<7 digits>` redirect to `/join#<code>`; any other `?code=` goes on to the class-code flow (routes/google.js) when Google sign-in is on. |
| `POST /api/live/join` | anyone (same-origin) | `{ code, asGuest?, useMine? }` | 200 `{ sid, tok, seat, nick, name, avatar, audience, nameMode, title, again, canReroll, play }` · 400 `badCode` · 401 `signIn` (+`login`) · 403 `notMember`/`removed` · 404 `notFound`/`takenDown` · 409 `locked`/`full` · 410 `ended` · 429 `slowDown`. Errors are `{ error (translated), code }`. Never sets a cookie. At least 150 ms. |
| `POST /api/live/reroll` | seat token | `{ tok }` | `{ seat, nick, name, avatar }`; 429 after 10 a minute or once the seat has connected. |
| `POST /api/live/report` | seat token | `{ tok, reason: 'scary'|'mean'|'personal'|'other' }` | `{ ok, toast }`; 3 an hour per seat. The host gets `rp`. |
| `GET /live` | hosts (others → `/join`) | `?game=`, `?mode=`, `?class=`, `?cl=&step=`, `?set=` preselect | Landing (a `data-api` form). |
| `POST /api/live/sessions` | hosts, 30/hour | `{ pick: 'mode:quest-race'|'mode:battle'|'game:<id>', set: 'starter:<id>'|'set:<id>', audience: 'class'|'family'|'open', classId?, maxPlayers?, clId?, stepId?, replace? }` (or JSON `mode`, `gameId`, `setId`, `starter`, `items`) | `{ sid, redirect: '/live/host/<sid>' }` · 409 `{ code: 'hasOpen', sid, host }` · 400/404/503 `{ code }` with codes `off notHost mode audience notTeacher noFamily notFound notPublished notPublic notShared notReady noSet setIncomplete busy`. |
| `GET /api/live/mine` | hosts | | `{ sid, title, host }` of their open session, or `{}`. |
| `GET /live/host/:sid` | that host | | Projector page (bare). Ended → `/live/results/:sid`. |
| `GET /live/play/:sid` | anyone | | Player page (bare); 404 page when the session is gone. The token comes from `sessionStorage['lv:'+sid]`. |
| `GET /live/frame/:token` | the game frame | `?view=2d` | The sandboxed game (or the platform lobby when the token says `f:'lobby'`), same CSP and sandbox as `/frame`, gzipped when accepted, no cookie set. |
| `GET /live/results/:id` (`.csv`) | the host (memory, 10 min); the host and the class's teachers (saved runs) | | Results page; CSV of saved class runs. |
| `GET /live/sets`, `GET /api/live/sets`, `GET/POST /api/live/sets/:id`, `POST /api/live/sets`, `POST /api/live/sets/:id/archive`, `POST /api/live/sets/from-lesson/:lessonId` | hosts | items: `[{ q, choices: [2..4], answer, secs: 10|20|30|60 }]`, 1-50 | Set errors: `{ error, code, at? }` with `title items question choice choices sameChoice tooBig noQuestions notFound`. |

**Part 3 (teams and teacher tools).**

| Route | Who | Body / query | Answer |
|---|---|---|---|
| `POST /api/live/sessions` (more) | hosts | as above, plus `settings: { secs, count, shuffleQ, shuffleA, points, board, late, names, sound, emotes }` (or those as flat form fields; checkboxes post a hidden `0` first), `teams: { n: 2..6, scoring: 'avg'|'sum', presets? }` (or form `teams` = `0`/`2`..`6` and `scoring`) · or `{ again: <ended sid>, shuffle? }` (play again with the lingering players) · or `{ fromRun: <run id>, only: 'missed' }` · or `{ againRun: <run id> }` (a saved class run's teams as the plan) | `{ sid, redirect, moved? }` · 410 `againGone` · 400 `noMissed`/`teamsOff`/`noClass` · 404 `notFound`. |
| `GET /live/host/:sid/dash` | that host (signed in; others 404, signed out → sign-in) | | The teacher's dashboard (bare, `no-store`). The address holds no token. |
| `GET/POST/DELETE /api/live/prefs` | hosts | POST `{ settings, teams: { on, n, scoring } }` | `{ settings, teams }` or `{}` (remembered defaults; also saved at every start). |
| `GET/PUT/DELETE /api/live/classes/:classId/teams` | the class's teachers (404 otherwise, or `LIVE_TEAMS=0`) | PUT `{ n: 2..6, presets: [p], scoring, plan: [[userId, k]] }` | GET `{ classId, students: [{ id, name }], saved: { n, presets, scoring, plan, savedAt } | null }`; PUT `{ ok, toast }`. |
| `GET/POST/DELETE /api/live/classes/:classId/support` | the class's teachers; 404 unless `LIVE_SAVE_SUPPORT=1` | POST `{ userId, time: 100|150|200, read, simple }` (all off deletes) | GET `{ support: [{ userId, name, time, read, simple }] }`; DELETE `{ cleared }`. |
| `GET /live/results/:id.csv` (more) | the host (in memory, 10 min) and saved runs as before | | `rank,student,team,score,bonus,correct,answered,q1..qN` (marks `1`/`0`/`-`), a blank line, then `question,right,answered,choice_a..choice_d`. |
| `POST /api/live/sets/:id/homework` | hosts who teach the class; 404 `homeworkOff` unless `LIVE_HOMEWORK=1` | `{ classId, opensAt?, dueAt? }` | `{ ok, lessonId, classLessonId, redirect }` · 400 `noClass`/`setIncomplete`. |
| `GET/POST /api/lessons/:clId/steps/:stepId/quiz` | a student of the class (`LIVE_HOMEWORK`) | POST `{ i, c }` | GET `{ items: [{ q, choices }], marks }` (never the answers); POST `{ ok, answer, next, score }` once per question; 400 `answered`. |

The frame's `INIT.live` also has `teamPresets: [{ id, color, ink, shape, icon, name, shapeName }]` (names in the
frame's language). Never anyone's support.

Seat token: `signToken({ s: sid, n: seat, k: nonce, r: 'p', u? }, 4 h)`. Host token: `{ s, n: 0, k, r: 'h', u }`.
Frame token: `{ s, n, k, r, v: versionId, g: gameId, f: 'game'|'lobby', l: lang, u? }`, 15 minutes.

## 2. The socket: `wss://<site>/api/live/ws`

Same origin only (the Origin header must be the site's). JSON text frames. The first message must be `hello` within
5 s. Close codes: `4000` ended, `4400` wrong protocol version, `4401` no/bad hello or not the right sign-in, `4403`
removed, `4404` no session/seat, `4409` replaced by another device, `4413` message too big, `4429` flood,
`4503` server restarting, `1009` over 16 KB.

### Client → server

| `t` | Fields | Who | Rate/s | Notes |
|---|---|---|---|---|
| `hello` | `v: 1, tok` | all | 1 | Seat or host token. A signed-in seat's token needs that account's cookie. |
| `rdy` | `view: '3d'|'2d'|'watch'`, host: `cfg?` | all | 2 | Send after `wel` once the frame is loaded, and again after `ph{phase:'loading'}` once the game frame is ready. Host `cfg` = the game's `Oomba.live.ready(opts)`: `{ presence?: { bounds (m, 1-1000), maxSpeed (m/s) }, lobby?, quiz?, hostView?, maxScorePerSec? }`. |
| `mv` | `p: [x, y, z, h, a]` | player | 12 | cm (±100000), heading 0-255, anim index 0-7 (`ANIM`). Accepted in `lobby`, and in `playing` for game mode (not quiz modes). Clamped to bounds; too fast → `fix`. One jump a 5 s is allowed. |
| `ev` | `k: /^[a-z][a-z0-9_-]{0,23}$/`, `d`, `to?` | all | 10 | `d`: numbers, booleans, `null`, tokens `/^[a-z0-9_-]{1,24}$/`, arrays/objects (token keys) depth ≤ 2, ≤ 512 B. A player's `k`, every string and every key longer than 2 must be one of the game's words (`ready({ words })`, read from the game's code when the session opens); the host's strings must pass the text filter. Player `to: 'host'`; host `to: <seat>` or everyone. |
| `sc` | `n: 0..1e6` | player | 2 | Game-reported score (not in quiz modes); rises at most `maxScorePerSec` × the seconds actually played since the last report (lobby, loading, countdown, pauses and the gaps between rounds count nothing). |
| `it` | `i: 0..199, ok` | player | 4 | Game-reported item result, first report per item counts. |
| `an` | `i, c: 0..3, e: ms` | player | 2 | Quiz answer to the open question `i`. Once. |
| `em` | `e: 0..5` | player | 1 | `EMOTES = ['wave','cheer','jump','dance','clap','heart']`. |
| `pi` | `c` | all | 1 | Clock ping → `po`. |
| `fr` | `f?: 'game'|'lobby'` | all | 1 | A fresh frame token → `fr`. |
| `h` | `a`, `n?`, `at?` | host | 5 | `start pause resume next skip lock unlock kick end`. `next`/`skip` carry the `seq` they were pressed at (stale → ignored). `kick` carries `n` (seat). |
| `st` | `d` (merge patch) | host | 5 | Shared state, 8 KB in all; every string and key must pass the text filter (no rude words, contact details, handles or links), else the patch is dropped; broadcast as the patch. |
| `hello` (more) | `view?: 'projector'|'dash'` | host | 1 | `dash`: the teacher's dashboard (same host token and sign-in). One projector and one dashboard per session; a newer one of the same view replaces the old (4409). The dashboard sends only `h`, `tm`, `cf`, `pi`; it has no frame and is not waited for at loading. |
| `h` (more) | `eyes {on}`, `say {m: 0..9}`, `time {s: 10|20|30}`, `bonus {n: seat | k: 1..6, r: 0..4}`, `rename {n}`, `acc {n, x: 100|150|200, ra: 0|1, sv: 0|1, save?: 1}` | host | 5 (say 1 per 3 s, bonus 1/s, eyes 1/s) | `SAY = twoMinutes oneMinute lastQuestion lastRound eyesOnMe greatTeamwork greatEffort beKind getReady almostDone` (`live.say.*`). `BONUS_REASONS = teamwork kindness effort helping listening` (+100). `time`: quiz modes, while playing. `rename`: a seat shown by nickname. `acc`: support (`save` only in class rooms with `LIVE_SAVE_SUPPORT`). |
| `tm` | `a: on {n?} off count {n} preset {k, p: 0..7} scoring {v: 'avg'|'sum'} choose {v: bool} lock unlock balance shuffle move {s: seat, k: 0..6} last` | host | 10 | Lobby only: on, off, count, preset, scoring, choose, shuffle, last (class rooms). Balance: lobby or `between`. Move: any time (`k: 0` lobby only). Lock: any time. Ignored with `LIVE_TEAMS=0`. Answer: `tms` to everyone (and `tml` to the hosts for `last`). |
| `pt` | `k: 1..6` | player | 1 | Pick a team: lobby only, the host allows it, not locked, the team under ceil(players / n) + 1. |
| `cf` | `d: { secs, count, shuffleQ, shuffleA, points, board, late, names, sound, emotes }` (a subset) | host | 5 | Unknown keys and values dropped; `secs count shuffleQ shuffleA points` only in the lobby; `names: 'names'` only in a teacher's own class room. `late` is the room's `autoLock` (after start: off locks now, on unlocks). |
| `ev` (more) | player `to: 'team'`; host `tm: 1..6` | all | 10 | To the sender's own team (and the hosts) / to one team. Relayed with `tm`. The same vocabulary rules. |

Everything else (unknown types, extra fields, out of range, host types from a player) is dropped silently.

### Server → client

| `t` | Fields | Notes |
|---|---|---|
| `wel` | `v, role: 'player'|'host', seat, phase, seq, round, at, clock, players: [P], state, nameMode, audience, mode, title, cfg (with `threeD`, `twoD` from the live check: the page picks the Watch view), locked, max, frame, lobbyFrame?, quiz?: { q, answered }, race?: [[seat, prog, gems]]` · player: `me: { seat, name, avatar, team, score, late }` · host: `code` | `P = [seat, name, avatar, team, score, connected 0/1, ready 0/1, late 0/1]`. `name` is a nickname index (0-143) or, when `nameMode === 'accounts'`, the account's display name. `lobbyFrame` only when the game draws no lobby (`lobby:true` not declared). `answered`: a boolean for a player, a count for the host. |
| `pj` / `pu` / `pl` | `p: P` / `p: P` / `n: seat` | Joined / changed (connected, ready, renamed) / left (removed or freed after 60 s). |
| `s` | `k, ts, p: [[seat, x, y, z, h, a, age], …]` | Changed seats only, ~10 Hz (5 Hz above 40 movers), one string for everyone. `age`: ms since that position arrived, so it was true at `ts - age` (interpolate on that, ~120 ms behind). |
| `fix` | `p` | Your last accepted position (a move was too fast). |
| `ph` | `phase, round, seq, at, …` | `lobby loading countdown playing paused between ended`. `countdown.at` = when play starts (server clock). `ended` carries `top: [[seat, score]×5]`. `loading` carries `locked`. |
| `q` | `i, n, q, choices, secs, at` | A question opens at `at` (server ms); deadline `at + secs*1000 + 600`. Sent again with a new `at` after a resume. Never the answer. |
| `ack` | `i` | Your answer arrived (not whether it was right). |
| `ac` | `i, n` | Host only: answers so far. |
| `rv` | `i, answer, counts, top` · or `i, skipped: true` | The reveal (when every connected, ready seat answered, or at the deadline). |
| `you` | `i, ok, points, rank, score, none?` · at the end `rank, score, of` | Your own result. |
| `race` | `p: [[seat, prog 0..1000, gems]]` | Quest Race, after each reveal. |
| `lb` | `top: [[seat, score]×10], n, you?: [rank, score]` | Game-scored leaderboard, every 2 s while scores change. |
| `ev` | `f, k, d` | A relayed event (`f` = sender seat, 0 = host). |
| `em` | `f, e` | An emote. |
| `st` | `d` | A shared-state patch (merge it). |
| `po` | `c, s` | Clock: your `c` back and the server time. |
| `fr` | `f, tok` | A frame token. |
| `lk` | `locked` | Host only: lock changed. |
| `rp` | `n` | Host only: reports so far in this session. |
| `res` | `id` | Host only: the session ended; results at `/live/results/<id>`. |
| `bye` | `why` | `removed ended full locked replaced expired restart flood takenDown` (part 4: `cohostOff projectorBusy`); the socket closes. After a normal end the players' `bye ended` comes when the linger ends (up to 2 minutes; the end screen shows at `ph ended` as before). |
| `wel` (more) | `teams` (the `tms` fields), `ts?` (rows), `settings` (players: `{ board, emotes, names }`; hosts: all, with `late`, `maxPlayers`, `locked`), `eyes`, `lang` (the set's language, for read aloud), `me.acc: { time, read, simple }` (player; PRIVATE) · host: `view`; the dashboard also `dp`, `sup`, `dq?` and no `frame` | `players` and `nameMode` are per view. |
| `tms` | `on, n, teams: [[k, p, size]], m: [[seat, k]], scoring, choose, locked` | Every team setup or membership change (one message, never a `pu` per seat). |
| `tml` | `ok, uneven?: [sizes] | null` | Hosts: the answer to `tm last` (`ok: false` = no saved teams). |
| `ts` | `s: [[k, score, rank, sum, avg]], fin?: 1` | Team scores (score = the ranking kind; rank 0 = no members, or the leaderboard is off for players). Before `rv`, with every `lb`, after a bonus, and before `ph ended` (`fin`). |
| `bn` | `n?` or `k?`, `r: 0..4`, `p: 100` | Bonus: a seat's goes to that seat and the hosts only; a team's to everyone. |
| `eyes` | `on` | Everyone. Players cover the screen; frames see `ph paused` when it paused play. |
| `say` | `m: 0..9` | Everyone: a fixed message, shown in each device's language. |
| `opt` | `board, emotes, names` | Players: the public settings changed. |
| `ros` | `players: [P], nameMode` | Everyone, per view: the names setting changed (replace the roster). |
| `cf` | `d` (all settings) | Hosts: the settings changed. |
| `lk` (more) | `locked` | Also when late join is switched after start. |
| `snd` | `on` | Projector only: game sound on the big screen (the page relays it to its frame). |
| `me` | `acc: { time, read, simple }` | PRIVATE, to that seat only: its support changed. Never relayed into a frame. |
| `again` | `sid, tok` | PRIVATE, to one lingering player: play again in session `sid` with this seat token (store it in `sessionStorage['lv:'+sid]`, go to `/live/play/<sid>`). The old socket then closes. |
| `dq` | `i, answer, counts, answered: [seat], extra` | Dashboard only: live answer counts for the open question (`extra`: still answering with extra time; `answer`: the right choice, which the dashboard keeps behind "Show answer"). |
| `dp` | `p: [[seat, answered, correct, wrongRun, missRun, flag]]` | Dashboard only: progress; `flag` '' or `lowScore`/`wrongRun`/`missRun` (needs help). After reveals, joins, leaves; game items at most once a second. |
| `sup` | `p: [[seat, time, read, simple, saved]]` | Dashboard only: seats with support. |

Changed in part 3 (still v1): `q` goes to a seat with extra time with its own `secs` (the broadcast `q` carries
nothing per seat). `lb`: players get the top 10 / 5 / none (`board`) and `you: [rank or 0, score]`. `rv`: players get
`top` cut the same way (the hosts keep 5). `you`: `rank: 0` when the leaderboard is off. Leaderboard scores are score +
bonus. `ph ended.top` for players obeys `board`. `pj`/`pu`/`ros`/`wel` names are per view (`names: 'hidden'` → `''` on
the projector). `ac`, `lb`, `rp` and `res` go to both host connections.

Phases: `lobby → (h start) loading → (every connected seat rdy, or 20 s) countdown (3 s) → playing`. Quiz modes: each
question is `playing`; its reveal moves to `between`; `next` (with `at: seq`) asks the next one or, after the last,
ends the session. Game mode: `next` toggles `playing → between → countdown → playing` (round + 1). `pause`/`resume`
from `playing`. Open rooms lock at `start` (the host can unlock). Seats are held 60 s after a disconnect.
At `start` the settings shape the questions (shuffled order, the first N, one time for all), every seat without a team
gets one, and the host's settings become their remembered defaults. Eyes up in `playing` pauses (a host's own pause is
not undone by eyes off); a round or question that opens while eyes are up (raised in the lobby, loading, the countdown
or `between`) opens straight into `paused` (`q` is sent, no deadline runs), and eyes off starts it. `resume` while eyes
are up also sends `eyes {on: false}`: no clock ever runs behind the cover. After `ph ended` connected players linger up to 2 minutes (their messages are dropped) for
"Play again"; then `bye ended`.

## 3. Page hooks (server-rendered; the scripts show and fill them)

All pages: `<div class="lv lv-<page>" data-lv-page="<page>">`, stylesheet `/css/live.css` (prefix `.lv-`).

**`/join`** (`/js/live-join.js`): form `#lv-join[data-lv-join]` (GET `/join`, works without script for class codes)
with `#jc` (name `code`) and `#lv-err`; `#lv-who-step` (hidden) with `#lv-who-name`, `#lv-use-mine-row` +
`#lv-use-mine`, `#lv-as-me`, `#lv-as-guest`, `#lv-who-err`; `#lv-card-step` (hidden) with `#lv-avatar`, `#lv-nick`,
`#lv-reroll`, `#lv-go`, `#lv-card-err`. JSON `#lv-join-data`: `{ signedIn, name, googleOn, nicks[144], msgs{code:
text}, signInHref }`. Flow: read `location.hash` into `#jc` and clear it; 6 characters → let the form submit (class
flow); 7 digits → POST `/api/live/join`; store `tok` in `sessionStorage['lv:'+sid]`; signed in → who step; guest →
card step; `#lv-go` → `play`.

**`/live/play/:sid`** (`/js/live-play.js`): `#lv-title`, `#lv-me-avatar`, `#lv-me-name`, `#lv-simple`
(aria-pressed), `#lv-report-open` → `<dialog id="lv-report">` with buttons `[data-report]`, `#lv-leave`
(`data-confirm`), `#lv-phase` (role=status, aria-live), `#lv-stage` (frame host), `#lv-watch` canvas (hidden),
`#lv-emotes` with `[data-emote="0..5"]`, `#lv-end` (hidden) with `#lv-end-title`, `#lv-place`, `#lv-again`. JSON
`#lv-play-data`: `{ sid, title, open, nicks, msgs{bye code: text}, phases{phase: text}, emotes, thanks, place, late,
watchHint }`. On `bye removed` set `sessionStorage['lv:removed:'+sid]`.

**`/live/host/:sid`** (`/js/live-host.js`): `#lv-qr` (inline SVG), `#lv-code` (`dir=ltr`, "482 9137"),
`#lv-count`, `#lv-hide-code`, `#lv-stage`, `#lv-controls` with `[data-lv-act]` buttons (start pause resume next skip
lock unlock end; `aria-keyshortcuts`; hidden ones the script shows by phase; end has `data-confirm`), `#lv-autolock`,
`#lv-roster` + `<template id="lv-player-tpl">` (`.lv-p-avatar`, `.lv-p-name`, `.lv-p-marks`, `.lv-p-remove
[data-lv-kick]`), `#lv-empty`, `#lv-reports`. JSON `#lv-host-data`: `{ sid, tok, code, joinUrl, audience, nameMode,
mode, title, max, nicks, actions, results, text{…} }`.

**Part 3 hooks.** Every live page has the shape sprite `<svg id="lv-shapes">` with `<symbol id="lv-shape-<shape>">`
(`circle triangle square heart star hexagon diamond moon`): draw a team's shape with `<use href="#lv-shape-…">`. Team
colours are `--team` / `--team-ink` on the element. JSON data adds `presets: [{ id, color, ink, shape, icon, name,
shapeName }]`, `say: [10 texts]`, `bonus: [5 texts]`.

- `/live/play/:sid`: `#lv-me-team` (hidden; `.lv-shape use`, `.lv-me-team-name`, `.lv-me-team-rank`) for the header
  band; `#lv-team-pick` (hidden) with `#lv-team-pick-list` (the script adds a ≥ 48 px button per team; full or locked
  ones `disabled` with the reason as text); `#lv-read` (hidden 🔊; shown in quiz modes when `speechSynthesis` has a voice
  for `wel.lang`); `#lv-eyes` (hidden cover with `role=alert` text; make `#lv-stage` and `#lv-emotes` `inert` while
  shown); `#lv-say-banner` (`role=status`, 6 s); `#lv-bonus-toast`; `#lv-team-live` (polite: "You are in …"); in the end
  box `#lv-end-teams` (ol) and `#lv-again-wait`. JSON `#lv-play-data` adds `text: { team, you, moved, rank, full,
  locked, size, toastSeat, toastTeam, read, readAgain, eyes, again, perPlayer }`. `me` and `again` are PRIVATE
  (`live-common.js`): never relayed into the frame. On `again`: store `tok` in `sessionStorage['lv:'+sid]`, go to
  `/live/play/<sid>`.
- `/live/host/:sid`: controls add `[data-lv-act="eyes"]` (aria-pressed, key `Y`), `#lv-time` (quiz; hidden; buttons
  `[data-lv-time="10|20|30"]`), `#lv-say` (`<details>`; buttons `[data-lv-say="0..9"]`), `[data-lv-act="settings"]` →
  `<dialog id="lv-settings">` with `#lv-settings-form` (fields named by setting; `.lv-quiz-only`; send `cf`),
  `[data-lv-act="sound"]` (aria-pressed), `[data-lv-act="dash"]` → `<dialog id="lv-dash-qr">` (QR and link of the
  dashboard). `#lv-eyes-banner`, `#lv-say-banner`, `#lv-bonus-toast`. Teams (when `teamsOn`): `#lv-teamsbox` with the
  radio group `#lv-teams-n` (`name="lv-teams"`, `0` = off, 2-6), `#lv-teams-summary` (ul), `#lv-teams-edit` (hidden until
  teams are on), `#lv-team-board` (ol, hidden; during play). `<dialog id="lv-teams-sheet">`: `#lv-teams-done`,
  `[data-lv-tm="balance|shuffle|last|lock|unlock"]`, `#lv-teams-more` (`#lv-teams-presets` for the per-team `<select>`s,
  radios `name="lv-scoring"`, `#lv-teams-choose`), `#lv-teams-warn` (`role=status`: empty teams, uneven after `tml`),
  `#lv-teams-cols`, `#lv-teams-unassigned`, `#lv-teams-live` (polite), `<template id="lv-team-tpl">`
  (`.lv-team[data-team]`, `.lv-team-head` with `.lv-shape use`, `.lv-team-icon`, `.lv-team-name`, `.lv-team-size`;
  `.lv-chips`; `.lv-team-empty`; `.lv-move-here[data-lv-move]`) and `<template id="lv-chip-tpl">` (`button.lv-chip
  [data-seat][aria-pressed]` with `.lv-chip-avatar`, `.lv-chip-name`). `#lv-podium-hold` (hidden) with
  `#lv-see-results`: after `res`, show it for `podiumHoldMs` (6000), then go to `results`. JSON `#lv-host-data` adds
  `quiz, teamsOn, hasLast, presets, say, bonus, settings, quizOnly, dashUrl, podiumHoldMs`, `text.{revealNow, waiting,
  eyesOn, eyesOff, soundOn, soundOff, toastTeam, toastSeat, team{…}, settings{…}}`.
- `/live/host/:sid/dash` (`/js/live-dash.js`, socket `hello { view: 'dash' }`): `#lv-dash-code`, `#lv-dash-phase`,
  `[data-lv-act]` (start pause resume next skip eyes lock unlock end; `next` reads "Reveal now" in quiz modes),
  `[data-lv-time="10"]`, `#lv-dash-notice` (hidden; show once, `localStorage`) + `#lv-dash-notice-ok`; tabs
  `[role=tab][data-lv-tab="players|question|teams|messages|settings"]` → panels `#lv-tab-<name>`; players:
  `#lv-dash-help-toggle` (aria-pressed, remembered), `#lv-dash-empty`, `#lv-dash-players` + `<template
  id="lv-dash-card-tpl">` (`.lv-dash-card[data-seat]`: `.lv-p-avatar`, `.lv-p-name`, `.lv-dash-team`, `.lv-dash-status`,
  `.lv-dash-help`, `.lv-dash-sup`, `.lv-dash-menu`); question: `#lv-dash-q`, `#lv-dash-answer-toggle`, `#lv-dash-bars`,
  `#lv-dash-answered`, `#lv-dash-extra`; teams: `#lv-dash-teams`, `#lv-dash-noteams`; messages `[data-lv-say]`;
  settings `#lv-dash-settings`. `<dialog id="lv-dash-player">`: `#lv-dash-player-h`, `[data-lv-bonus="0..4"]`,
  `#lv-dash-move` (select), `#lv-dash-rename`, `#lv-dash-support` (radios `name="lv-acc-time"`, `#lv-acc-read`,
  `#lv-acc-simple`, `#lv-acc-save` only when saving is on, `#lv-acc-apply`), `#lv-dash-remove`. JSON `#lv-dash-data`:
  `{ sid, tok, code, audience, mode, quiz, title, nicks, presets, say, bonus, settings, quizOnly, teamsOn, saveSupport,
  results, kit, text{…} }`.
- `/live`: `#lv-teams-n` (radios `name="teams"`, `0`/2-6, and `name="scoring"`), `<details id="lv-settings-landing">`
  with the setting fields (filled from the remembered defaults) and `#lv-prefs-reset` (`data-href="/api/live/prefs"`:
  DELETE it). Game cards made for teams carry `.lv-teams-badge`.
- `/live/results/:id` (`/js/live-results.js`): class-safe part: `#lv-team-podium`, `#lv-team-table`, `#lv-hardest`,
  `#lv-review` (`div.lv-bar[role=listitem]` per choice, never an `li`: the e2e counts `.lv-items li`, `--w` = percent, `.lv-bar-right` + "✓ Right" text), `#lv-results-acts` (data-api
  forms: play missed, `#lv-play-again` while players linger with `#lv-still`, play again with these teams; New game,
  `#lv-print`); `<details id="lv-homework">` with `LIVE_HOMEWORK` (a data-api form: `#lv-hw-class`, `#lv-hw-due` → `POST /api/live/sets/:id/homework`); `<details id="lv-details">` (closed): `#lv-student-table` (marks
  `.lv-mark-right|wrong|none` with screen-reader text), `#lv-needs-help`, the CSV link. JSON `#lv-results-data`: `{ id,
  mode, still, again }`.
- Class progress page (`/class/:id/progress`), "Live games" panel: `#lv-class-teams[data-api]` with
  `#lv-class-teams-state`, `#lv-class-teams-open`, `#lv-class-teams-board` (hidden) and JSON `#lv-class-teams-data` `{
  classId, api, presets, text }` (`/js/live-class-teams.js` is included once the file exists); `#lv-class-support`
  (with `LIVE_SAVE_SUPPORT`: a count and a Clear form).

**`/live`** (`/js/live-sets.js`): form `#lv-new[data-api="/api/live/sessions"]` with radios `pick`, select `set`
(`#lv-set`), radios `audience`, select `classId` (`#lv-class`), `maxPlayers` (`#lv-max`), hidden `clId`/`stepId`.
Works without the script (app.js posts it and follows `redirect`).

**`/live/sets`**: `#lv-set-new`, `#lv-setlist` (`li[data-set]`), `#lv-set-editor` (hidden; the script builds it).

**Part 3 page scripts.** `/js/live-teams-ui.js` (shared by the projector's Teams sheet, the dashboard and the class
editor): `board({ root, unassigned, live, presets, text, onMove })` draws one column per team with chips; a chip is
moved by drag (pointer events) or by select then "Move here" (keyboard, switch, tap; Escape cancels; focus stays on the
chip across the server's `tms` redraw; each move is announced); `teamBars(ol, rows, presets)` draws the ranked team
board. `/js/live-dash.js` (the dashboard), `/js/live-class-teams.js` (the class teams editor), `/js/live-quiz-step.js`
(a lesson's quiz step: `.lv-qstep[data-api]`, one question at a time, `.lv-qstep-a` answers, Read aloud, no timer).
Templates in the pages' JSON `text` are the messages as written (ICU plurals included): `live-common.js` `fill()` formats
them in the page's language. On the projector a player's `bn` (bonus) is never shown and never passed to the frame; a
team's is. The projector holds its frame on the game's end for `podiumHoldMs`, then opens the results.

## Part 4: co-hosts (still v1; additive)

Design: docs/decisions.md "Oomba Live, part 4". `LIVE_COHOST=0`: none of this (the APIs 404, no `ch`/`act`, a co-host
token gets 4401).

**HTTP**

| Route | Who | Body | Answer |
|---|---|---|---|
| `GET /api/live/cohost/:sid` | the current host (404 otherwise) | | `{ list: [{ ref, id, name, tier, state: 'on'|'away'|'invited', since }], candidates: [{ id, name, tier }], max: 3, link: '/live/cohost/<sid>', room }` (`no-store`) · 400 `cohostRoom` (open rooms). |
| `POST /api/live/cohost/:sid` | the current host, 60/hour | `{ a: 'invite'|'cancel'|'remove'|'host', userId }` | `{ ok, list, candidates, … , toast? }` (`host`: `{ ok, redirect }`) · 400 `{ code }`: `cohostRoom notEligible full already self notCohost hasOpen` · 404. |
| `POST /api/live/cohost/:sid/answer` | the invitee, 30/hour | `{ yes }` (`true`/`'1'` accepts) | `{ ok, redirect: '/live/host/<sid>/dash' | '/live' }` · 410 `gone` (expired, ended, full, no longer eligible, not invited). |
| `POST /api/live/cohost/:sid/leave` | a co-host | | `{ ok, redirect: '/live', toast }` · 404. |
| `GET /live/cohost/:sid` | signed in | | The invite page for the invited account (`#lv-cohost-accept`, `#lv-cohost-decline`: data-api forms); a controller → 302 to their Teacher view; anyone else the same 404 as an unknown session. |
| `GET /live/host/:sid`, `GET /live/host/:sid/dash` (more) | the host or a co-host (their own token in the page); a pending invitee at `/dash` → 302 `/live/cohost/:sid` | | Per role and tier. |
| `GET /api/live/mine` (more) | hosts | | adds `cohosting: [{ sid, title, dash }]` and `invites: [{ sid, title, from, page }]` when there are any. |
| `GET /live/results/:id` (`.csv`) (more) | in memory: the owner and every controller at the end | | A limited controller gets the class-safe part only (`#lv-limited-note`, no `#lv-details`; the CSV 404). Saved runs that had a co-host add `<details id="lv-run-log">` "Who ran this game". |

Co-host token: `signToken({ s, n: 0, k: <their nonce>, r: 'c', u }, 4 h)` (a new nonce on every accept). The host
frame's token carries the projector slot's holder (`r: 'h'|'c'`, `k`, `u`).

**Socket.** `hello` with an `r: 'h'` or `r: 'c'` token: the signed-in account must be `tok.u`, and `tok.k` the host's
nonce or that account's co-host nonce (else 4401; a removed or no longer eligible co-host gets `bye cohostOff` and
4403). Views: `dash` (one per controller; a newer one of the same person replaces it, 4409) and `projector` (one slot:
the host always takes it, the old holder gets `bye replaced`; a co-host only when it is empty, else `bye
projectorBusy`, 4409). Authority is looked up per message: a removed co-host's next message gets `bye cohostOff`.

| `t` | Fields | Notes |
|---|---|---|
| `h` (more, client → server) | `end` may carry `sure: 1` | Required from a co-host; other values are dropped. `acc` from a limited controller → `nak notAllowed`. |
| `wel` (more) | controllers: `ctl: { me, host, role: 'host'|'cohost', tier: 'full'|'limited' }`, `ch` (as below, without `t`), `acts: [act…]` (last 10; `acc` ones only for a full-tier dashboard, never the projector page) | A limited dashboard: no `dp`/`sup`, `dq` without `answered`/`extra`, players and `nameMode` per the players' view. |
| `ch` | `host: ref, list: [[ref, name, 'on'|'away'|'invited', tier]], max: 3, past?: [[ref, name]]` | Every controller connection, on any co-host, invite, presence or host change. `list[0]` is the host. `past`: adults no longer listed (removed, left, an invite cancelled or declined), so the activity line keeps naming them, also after a reload; pages merge names and never drop one. Adults' display (school roster) names, to adults only. |
| `act` | `i, by: ref, a, n?: seat, k?: team, v?, o?: ref` | Every controller connection (`a: 'acc'` only to full tier), only once the session has had a co-host. `a`: `start pause resume next skip lock unlock kick end eyes (v 1/0) say time (v secs) bonus rename acc teams settings joined left removed invited declined cancelled host away back`. `i` rises: the order the server applied. |
| `nak` | `a, why: 'already'|'conflict'|'tooSoon'|'wait'|'notAllowed', by?: ref` | To the refused connection only. `already`: the toggle is already in that state (`by` only when that adult's change is what the state is now, never a stale one), or another adult already added time to this question within 1 s. `conflict`: another controller changed a toggle family this action would change (pause/resume, lock/unlock, eyes; resume also checks eyes, and eyes up/down also checks pause, since each moves the other) within 1 s. `tooSoon`: another adult sent a message (3 s) or a bonus (1 s) just now (the session's gap: the class hears one at a time), `by` names them; `wait`: the same adult, too soon. |
| `bye` (more) | `why: 'cohostOff'|'projectorBusy'` | `cohostOff`: removed, left, or no longer eligible (4403). |
| `dq` (limited) | `i, answer, counts` | |

`ch`, `act` and `nak` are PRIVATE in `live-common.js` (never relayed into a frame); `wel.ctl`, `wel.ch` and `wel.acts`
are stripped before the projector page relays its `wel`. Players never receive them.

**Part 4 hooks.**
- `/live/host/:sid`: `[data-lv-act="cohosts"]` (class and family rooms, the host) → `<dialog id="lv-cohosts">`:
  `#lv-cohosts-gate` (notice, `#lv-cohosts-show`, `#lv-cohosts-phone`) and `#lv-cohosts-body` (hidden until Show;
  hidden again on close) with the panel below (prefix `lv-cohosts`). A co-host on this page: `#lv-cohost-me`, End
  with the co-host confirm; `#lv-proj-busy` (`#lv-proj-busy-text`, Teacher view link) on `projectorBusy`/`replaced`;
  `#lv-cohost-off` (`#lv-cohost-off-text`) on `cohostOff`. No activity line. JSON adds `ctl: { role, tier, cohosts }`
  and `cohost` (texts: `act.*`, `state.*`, …).
- `/live/host/:sid/dash`: `#lv-dash-role` (chip: "Host" / "Co-host · {host} is the host"), `#lv-dash-activity`
  (`role=status`, polite: the newest `act`/`nak`), tab `[data-lv-tab="cohosts"]` → `#lv-tab-cohosts` (the panel, prefix
  `lv-dch`), `#lv-dash-limited` (limited only), `#lv-cohost-off`. Limited: no `#lv-dash-help-toggle`, no
  `#lv-dash-support`, no `names` option. A `wel` whose `ctl.role` or `ctl.tier` differs from the page's reloads it.
- The panel (`[data-lv-cohost-panel][data-prefix][data-role]`, `/js/live-cohost.js`): `#<p>-list`
  (`li.lv-cohost-row[data-state]` with `[data-cohost-act="cancel|remove|host"][data-user-id]`, each with
  `data-confirm` where it asks), host only `#<p>-pick` (`#<p>-who` select of candidates, submit), `#<p>-none`,
  `#<p>-err`, `#<p>-link` (QR and link); `#<p>-recent`; a co-host's `#lv-cohost-leave`.
- `/live`: `[data-lv-cohost-invite="<sid>"]` (a link to the invite) and `[data-lv-cohost-on="<sid>"]` (Teacher view).
- `/live/cohost/:sid`: `.lv-cohost-invite-text`, `#lv-cohost-accept`, `#lv-cohost-decline`.

## 4. The frame

`window.__BRB_INIT__` for a live frame: `user: { displayName (the session name only), avatar, isGuest, character
(the seat's avatar spec), lang, dir }`, `save: {}`, `canSave: false`, `live: { v: 1, role, seat, frame: 'game'|'lobby',
nameMode, mode, nicks[144 in the frame's language], view: '3d'|'2d', me, teamPresets }` (the SDK passes `teamPresets` on as strings only), and `device` for 3D games
(`fallback: '2d'` when the game has `<meta name="oomba-live" content="2d">`). The frame never opens a socket: the
page relays messages over a `MessagePort` (docs/sdk.md "Live messages"; `public/js/live-common.js`). The live-ready check (`classlive-check.js`): the pinned `live`
pack (kit ≥ 1.1.0), `live.ready(`, a start/end handler or `live.phase`, a result report, no raw transport.
