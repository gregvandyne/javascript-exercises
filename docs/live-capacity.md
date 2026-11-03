# Oomba Live: how many players each game holds

A full classroom is 20 to 30 players. Every live game was run with 10, 20 and 30 players (and 40 for the quiz modes)
to check that it still plays well and stays readable, without crowding a game that can't hold a whole class.

## How it was measured

`scripts/live-load.js` hosts each game on a real projector page (Chromium) and seats N bot players on the real
protocol (HTTP join, then the WebSocket). The bots run around the lobby at 10 moves a second, answer every question
after 1 to 6 seconds (mostly right), and stay to the end. It checks that:

- everyone is seated and counted;
- every bot gets every question;
- every answer is counted at the reveal;
- the leaderboard counts everyone.

It also measures:

- the server's CPU and memory, and its responsiveness (round trips to `/health`);
- what each player receives, in messages and kilobytes a second;
- the projector's frame rate.

`PHONE=1` adds one real phone among the bots, and `LAYOUT=1` checks the projector at projector, desktop and tablet
sizes with everyone in the room (`tests/e2e/frame-fit.js`).

```
BASE=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS=... SIZES=10,20,30 PHONE=1 LAYOUT=1 SERVER_PID=<pid> \
  node scripts/live-load.js
```

`tests/e2e/live-load.spec.js` runs the light version on every e2e run: 10 players in each quiz mode.

**Server:** one Render starter instance. At 30 players the server never went above 3% CPU or 140 MB of memory,
`/health` answered within 11 ms (p95), and every answer was counted.

| Game | Messages a second each player receives (10 / 20 / 30) | KB a second each player receives at 30 |
|---|---|---|
| Question Battle | 1.1 / 1.4 / 1.8 | 0.23 |
| Brain Board | 1.3 / 1.6 / 1.9 | 0.29 |
| Quest Race | under 1.3 | 0.20 |
| Hero of Sunvale (all walking) | 9 | 5.7 |

Position updates are already batched (one 10 Hz snapshot of the players who moved, the same string for everyone, and
5 Hz above 40 players that moved), so the network cost grows gently.

**Projector frame rate:** Question Battle and Brain Board stayed at 50-60 fps with 30 players. The 3D games (Quest
Race, Hero of Sunvale) ran at 3-18 fps in the test browser at every size, 10 players as much as 30. That browser has
no graphics card (software WebGL), so the number reflects the test machine, not the player count. The kit's crowd
keeps 3D cheap: full characters only for the nearest 4-12 players depending on the device, flat pictures behind them,
instanced shapes for the rest, and at most 8 name tags.

## The audit

| Game | Works at 10 / 20 / 30 | Issues found | Fixes | Supported players | Best for |
|---|---|---|---|---|---|
| **Quest Race** | yes / yes / yes | none blocking. The runners move in a formation of 3 across, rows behind, so a pack of 30 stays readable. The phone shows its own place ("Place 31 of 31"). | none needed | **40** | 2-40 |
| **Question Battle** | yes / yes / yes | the lobby crowd was squeezed into a thin strip at the bottom of the projector, with names on top of each other and hidden under the banner; on a phone 30 names overlapped in 3 narrow columns | the boss gets smaller when the room is big; the crowd fills the space between the boss and the banner, in up to 10 columns, never narrower than a name tag; when name tags can't fit (a phone, a full room), the crowd shows just the characters, closer together | **60** (the site's ceiling) | 2-60 |
| **Brain Board** | yes / yes / yes | everyone answers every tile (fastest right answer picks next, when players pick), so the board works for a whole class; but the lobby crowd on a phone overlapped and ran off both edges | the same crowd fix as Question Battle | **40** | 2-40 (teams suggested above 16) |
| **Hero of Sunvale** (family and open rooms only) | yes / yes / yes | a shared 3D world: about 6 KB a second per player at 30, and more players crowd its paths and quests | none needed at 30 | **30** | 2-30 |
| **Builder-made live games** | depends on the game | a Builder game could be anything, from a 1-v-1 duel to a big arena | default **30**; the game can say its own number with `Oomba.live.ready({ maxPlayers: n })` (2-60); the Builder is told to state it and to design for a full class (readable top-N, nearest name tags only, players spread out) | **30**, or the game's own number | 2-30 |

## Where the numbers live

- `server/services/classlive-access.js`:
  - `CAPACITY` holds each built-in mode and official game: `max`, the `best` range, and `teamsAbove`.
  - `BUILDER_DEFAULT_MAX` is 30.
  - `capacityFor()` works out a game's number, and `maxPlayersFor()` caps every room at it.
  - `LIVE_MAX_PLAYERS` (default 60) is still the site's ceiling, and a grown-up's open room still holds 30 at most.
- `server/services/classlive-lint.js` `declaredMax()` reads a Builder game's `ready({ maxPlayers })`.
- **Join:** a full room answers 409 with "This game is full (30 players)." in the player's language.
- **Where teachers see it:**
  - the game cards on `/live` show "Best for 2-40 players", and Brain Board adds "More than 16 players? Teams play best.";
  - "Most players" is clamped to the picked game;
  - `/teachers/live` shows each game's number.
