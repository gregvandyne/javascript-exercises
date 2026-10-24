# The Game Contract and the `window.BRB` SDK

Every game on Magic Cups, whether it came from our team, a "Start from" template or the AI Builder, follows the same contract.

## The Game Contract

A game is **one self-contained HTML document** that starts with `<title>` and then `<style>`:

```html
<title>Shark Catch</title>
<style>
  body { margin: 0; background: #8fd8ff; font-family: system-ui, sans-serif; }
</style>
<canvas id="game"></canvas>
<script>
  const CONFIG = { roundSeconds: 60, lives: 3, hero: '🦈' };
  // ... draw with canvas or SVG, read touch + keyboard, use BRB.sfx / BRB.fx ...
</script>
```

- **No** `<!doctype>`, `<html>`, `<head>` or `<body>` tags. The platform wraps the document with a charset, the viewport tag,
  a small CSS reset and the SDK script, then serves it inside the sandbox (see `docs/safety.md`).
- Under **2 MB**.
- Allowed from outside: fonts from `fonts.googleapis.com` / `fonts.gstatic.com`, scripts from `https://cdnjs.cloudflare.com`.
  Nothing else.
- Not allowed (the scanner rejects it): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`,
  `import()`, `eval`, `new Function`, string timers, `window.top`, `parent.location` / `parent.document`, `window.open`,
  navigating away, `document.cookie`, forms that submit, links that leave the game, camera, microphone, location,
  notifications, external URLs, hidden text, fast flashing (more than 3 flashes per second).
- No chat between players and no asking for names or personal details.

### What a good game has (the Builder always aims for this)

- Real graphics drawn with canvas or SVG (emoji are fine as sprites), smooth time-based animation with `requestAnimationFrame`.
- Juice: screen shake, particles, hit flashes, confetti, bouncy tweens.
- Sound only through `BRB.sfx` (synthesised, no files), on by default, with a mute button.
- A title screen with a big Play button, a HUD (score, lives or time), a pause button, a results screen with "Play again".
- Touch **and** keyboard controls, buttons at least 48 px, readable on a phone.
- Rounds under three minutes with a gentle difficulty ramp.
- A `const CONFIG = { ... }` near the top for the numbers people like to change.

## `window.BRB`

The SDK (`public/sdk/brb-sdk.js`) is loaded before the game's own code and is frozen.

| API | What it does |
|---|---|
| `BRB.user` | `{ displayName, avatar, isGuest }`. No other identity is ever given to a game. |
| `BRB.game` | `{ id, title }` |
| `BRB.preview` | `true` inside the Studio preview (saving is off there). |
| `BRB.storage.get(key)` | Per-player, per-game cloud save. Synchronous read. Values are JSON-decoded when possible. |
| `BRB.storage.set(key, value)` / `remove(key)` | Writes are debounced and sent to the server. Max ~450 KB per game per player. |
| `localStorage` / `sessionStorage` | Work as usual. `localStorage` is a shim backed by the same cloud save, pre-filled before the game starts, so older games just work. |
| `BRB.score.submit(score, label)` | Leaderboard entry (best score only, whole numbers ≥ 0). |
| `BRB.gameOver({ won, score })` | Call at the end of each round (also submits the score). |
| `BRB.fullscreen()` | Asks the page to go full screen. `element.requestFullscreen()` is routed here too. |
| `BRB.orientation('landscape')` | Tells the page the game wants landscape (it shows a "turn your phone" hint). |
| `BRB.fx.confetti(opts?)` | Confetti burst (skipped when the player prefers reduced motion). |
| `BRB.fx.shake(element, strength?)` | A short shake. |
| `BRB.fx.flash(color?)` | One gentle flash (never repeat it quickly). |
| `BRB.fx.tween(from, to, ms, onUpdate, ease?)` | Returns a Promise when done. |
| `BRB.fx.fit(canvas, width, height)` | Crisp canvas scaling to the screen (handles device pixel ratio and resizes). |
| `BRB.sfx.play(name)` | `'jump' \| 'hit' \| 'coin' \| 'win' \| 'lose' \| 'click' \| 'powerup'`, synthesised with WebAudio. |
| `BRB.sfx.mute(on?)` | Toggle or set mute; returns the new state. `BRB.sfx.muted` reads it. The choice is saved. |

There is no network and no way to reach the page around the game.

## Messages to the page (for platform developers)

The SDK talks to the page with `postMessage`. Every message is `{ brb: 1, type, ... }`:

| `type` | Payload | Page does |
|---|---|---|
| `brb:ready` | `{ title }` | game loaded |
| `brb:save` | `{ data: { key: string } }` | saves for signed-in players (not in previews) |
| `brb:score` | `{ score, label }` | leaderboard |
| `brb:gameover` | `{ won, score }` | round finished |
| `brb:fullscreen` | `{ on }` | toggles full screen on the game area |
| `brb:orientation` | `{ value }` | orientation hint |

The parent checks that each message comes from its own game frame (`event.source`), has the expected shape,
and the server validates and rate-limits every resulting API call (`public/js/play.js`, `public/js/studio.js`).

## How the Builder edits games

The AI Builder works with these tools: `ask_user(question, options)`, `write_game(html, notes)` (a whole new version),
`edit_game(edits[{find, replace}], notes)` (each `find` must appear exactly once in the current game, otherwise nothing
changes and the Builder is told why), `set_game(title, icon, description, category, tags, orientation, players)` and
`test_notes(checklist)`. Every `write_game` / `edit_game` makes a new, safety-scanned version.

Without an API key a deterministic mock Builder is used. It adapts the "Start from" templates and makes changes like
"make it harder", "change the colour", "change the hero to a dragon" or "add a second level" through a small
"tune-up" script (`server/builder/layer.js`) whose settings are single lines such as `BRB_TUNE.speed = 1.25;`,
so every change is a real `edit_game` find/replace and a new version.
