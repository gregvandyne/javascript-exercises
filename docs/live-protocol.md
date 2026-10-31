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
| `ev` | `k: /^[a-z][a-z0-9_-]{0,23}$/`, `d`, `to?` | all | 10 | `d`: numbers, booleans, `null`, tokens `/^[a-z0-9_-]{1,24}$/`, arrays/objects (token keys) depth ≤ 2, ≤ 512 B. Player `to: 'host'`; host `to: <seat>` or everyone. |
| `sc` | `n: 0..1e6` | player | 2 | Game-reported score (not in quiz modes); rises at most `maxScorePerSec` × (Δt + 1 s). |
| `it` | `i: 0..199, ok` | player | 4 | Game-reported item result, first report per item counts. |
| `an` | `i, c: 0..3, e: ms` | player | 2 | Quiz answer to the open question `i`. Once. |
| `em` | `e: 0..5` | player | 1 | `EMOTES = ['wave','cheer','jump','dance','clap','heart']`. |
| `pi` | `c` | all | 1 | Clock ping → `po`. |
| `fr` | `f?: 'game'|'lobby'` | all | 1 | A fresh frame token → `fr`. |
| `h` | `a`, `n?`, `at?` | host | 5 | `start pause resume next skip lock unlock kick end`. `next`/`skip` carry the `seq` they were pressed at (stale → ignored). `kick` carries `n` (seat). |
| `st` | `d` (merge patch) | host | 5 | Shared state, 8 KB in all; broadcast as the patch. |

Everything else (unknown types, extra fields, out of range, host types from a player) is dropped silently.

### Server → client

| `t` | Fields | Notes |
|---|---|---|
| `wel` | `v, role: 'player'|'host', seat, phase, seq, round, at, clock, players: [P], state, nameMode, audience, mode, title, cfg (with `threeD`, `twoD` from the live check: the page picks the Watch view), locked, max, frame, lobbyFrame?, quiz?: { q, answered }, race?: [[seat, prog, gems]]` · player: `me: { seat, name, avatar, team, score, late }` · host: `code` | `P = [seat, name, avatar, team, score, connected 0/1, ready 0/1, late 0/1]`. `name` is a nickname index (0-143) or, when `nameMode === 'accounts'`, the account's display name. `lobbyFrame` only when the game draws no lobby (`lobby:true` not declared). `answered`: a boolean for a player, a count for the host. |
| `pj` / `pu` / `pl` | `p: P` / `p: P` / `n: seat` | Joined / changed (connected, ready, renamed) / left (removed or freed after 60 s). |
| `s` | `k, ts, p: [[seat, x, y, z, h, a], …]` | Changed seats only, ~10 Hz (5 Hz above 40 movers), one string for everyone. Interpolate ~120 ms behind. |
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
| `bye` | `why` | `removed ended full locked replaced expired restart flood takenDown`; the socket closes. |

Phases: `lobby → (h start) loading → (every connected seat rdy, or 20 s) countdown (3 s) → playing`. Quiz modes: each
question is `playing`; its reveal moves to `between`; `next` (with `at: seq`) asks the next one or, after the last,
ends the session. Game mode: `next` toggles `playing → between → countdown → playing` (round + 1). `pause`/`resume`
from `playing`. Open rooms lock at `start` (the host can unlock). Seats are held 60 s after a disconnect.

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

**`/live`** (`/js/live-sets.js`): form `#lv-new[data-api="/api/live/sessions"]` with radios `pick`, select `set`
(`#lv-set`), radios `audience`, select `classId` (`#lv-class`), `maxPlayers` (`#lv-max`), hidden `clId`/`stepId`.
Works without the script (app.js posts it and follows `redirect`).

**`/live/sets`**: `#lv-set-new`, `#lv-setlist` (`li[data-set]`), `#lv-set-editor` (hidden; the script builds it).

## 4. The frame

`window.__BRB_INIT__` for a live frame: `user: { displayName (the session name only), avatar, isGuest, character
(the seat's avatar spec), lang, dir }`, `save: {}`, `canSave: false`, `live: { v: 1, role, seat, frame: 'game'|'lobby',
nameMode, mode, nicks[144 in the frame's language], view: '3d'|'2d', me }`, and `device` for 3D games
(`fallback: '2d'` when the game has `<meta name="oomba-live" content="2d">`). The frame never opens a socket: the
page relays messages over a `MessagePort` (docs/sdk.md "Live messages"; `public/js/live-common.js`). The live-ready check (`classlive-check.js`): the pinned `live`
pack (kit ≥ 1.1.0), `live.ready(`, a start/end handler or `live.phase`, a result report, no raw transport.
