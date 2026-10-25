# The Game Contract and the `window.BRB` SDK

Every game on Oomba Academy, whether it came from our team, a "Start from" template or the AI Builder, follows the same contract.

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
- Allowed from outside: fonts from `fonts.googleapis.com` / `fonts.gstatic.com`. Scripts from `https://cdnjs.cloudflare.com`
  load, but any library not on the scanner's short reviewed list is *flagged* (a person looks before it can go Public).
  3D games use the site's own pinned Three.js through one exact import map (see [3D games](#3d-games)). Nothing else.
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
| `BRB.user` | `{ displayName, avatar, isGuest, lang, dir }`. No other identity is ever given to a game. `lang` and `dir` are explained in [Languages](#languages). |
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
| `BRB.fx.fit(canvas, width, height)` | Crisp scaling of a **2D** canvas to the screen (device pixel ratio, resizes). It only sets the transform of a 2D context the game made (or starts the one it makes later at that scale) and never creates a context, so it is harmless on a WebGL canvas. |
| `BRB.fx.fit3d(renderer, camera, opts?)` | Fits a 3D renderer (e.g. a Three.js `WebGLRenderer`) to the screen: pixel ratio first (capped, `opts.maxDpr`, default 1.5), then the size, then `camera.aspect`, again on every resize and rotate. `opts.element` fits an element instead of the window; `opts.onResize(w, h, dpr)` runs after each fit. Returns `{ resize(), maxDpr(n), stop() }` (`maxDpr(n)` is for quality ladders). |
| `BRB.sfx.play(name)` | `'jump' \| 'hit' \| 'coin' \| 'win' \| 'lose' \| 'click' \| 'powerup'`, synthesised with WebAudio. |
| `BRB.sfx.mute(on?)` | Toggle or set mute; returns the new state. `BRB.sfx.muted` reads it. The choice is saved. |

There is no network and no way to reach the page around the game.

## 3D games

A game is a 3D game when it uses an import map or imports `three` (`server/services/vendor.js`, `isThreeGame`). Three.js
**0.185.1** is served by the site itself from `/vendor/three/0.185.1/` and is loaded with exactly this import map (the
relative URLs resolve against the frame's own address; the integrity lines pin both files):

```html
<script type="importmap">
{ "imports": { "three": "/vendor/three/0.185.1/three.module.min.js" },
  "integrity": {
    "/vendor/three/0.185.1/three.module.min.js": "sha384-QHQk1LzjJlJYNdthXjKCmffpDRZL3EqJ7LfqBzyKyvGgjAYM2ZVuYtFGg42NcAJ/",
    "/vendor/three/0.185.1/three.core.min.js": "sha384-rx+KIp/9ptjArhnFAcpVoOc/ynktDsRtRJKIbC7YVKylEvFu8sgmzk9RmQ+CIV48" } }
</script>
<script type="module">
  import * as THREE from 'three';
  const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas') });
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 300);
  BRB.fx.fit3d(renderer, camera, { maxDpr: 1.5 });
</script>
```

- The scanner passes exactly this form. Any other Three.js (another version, another host, the files without the map or
  without the integrity lines, add-ons such as `three/addons/...`) **fails**.
- There are no add-ons (no GLTFLoader, OrbitControls...) and nothing can be loaded by URL: build models from Three.js shapes
  and make textures with `CanvasTexture`.
- **Device check.** For a 3D game the frame tells the SDK what it needs (`window.__BRB_INIT__.device`: WebGL 2 and import
  maps). If the browser has no import maps (`HTMLScriptElement.supports('importmap')`, e.g. iPads on iPadOS 15) or cannot
  make a WebGL 2 context, the SDK covers the game with a friendly, translated message ("This game needs a newer device or
  browser") instead of a blank screen. It does the same when the 3D picture is lost (`webglcontextlost`) and is not
  restored within 4 seconds, or the game did not ask for it back (`preventDefault()`); the message goes away if it comes back.
  Games should not show their own.
- The **Star Island** template (`server/builder/templates/island.html`) is the reference: comfort (field of view 60-75,
  a smooth follow camera, no shake), a pixel-ratio cap of 1.5 and an automatic quality ladder, context-loss handling,
  reduced motion, keyboard + touch joystick, and every word in the 13 languages.

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
changes and the Builder is told why), `set_game(title, icon, description, category, tags, orientation, players)`,
`playtest_game()`, `start_from_template(template, notes)` (3D only: copies Star Island in as a new version on the server)
and `test_notes(checklist)`. Every `write_game` / `edit_game` / `start_from_template` makes a new, safety-scanned version.
The 3D rules are a separate fixed system block, sent only when the builder asks for 3D or the game is already 3D.

Without an API key a deterministic mock Builder is used. It adapts the "Start from" templates and makes changes like
"make it harder", "change the colour", "change the hero to a dragon" or "add a second level" through a small
"tune-up" script (`server/builder/layer.js`) whose settings are single lines such as `BRB_TUNE.speed = 1.25;`,
so every change is a real `edit_game` find/replace and a new version. Asked for a 3D game, it starts from Star Island,
and in a 3D game it also changes the number of stars, the floating rocks and the sky (`stars`, `platforms`, `sky` lines in
CONFIG); Star Island reads `BRB_TUNE.hero` to pick its 3D hero.

## Languages

Oomba Academy is offered in 13 languages (see `server/i18n`). A game can speak the player's language too:

| Field | Value |
|---|---|
| `BRB.user.lang` | The player's site language code: `en`, `en-GB`, `pt` (Brazilian Portuguese), `fr`, `es`, `de`, `he`, `ja`, `ar`, `ru`, `it`, `zh-Hant`, `nl`. Always set; `en` when unknown. |
| `BRB.user.dir` | `rtl` for right-to-left languages (`he`, `ar`), otherwise `ltr`. |

The page does **not** change the game's own direction: the frame stays left-to-right so existing games keep their layout.
A game that has text in several languages picks one and sets the direction itself:

```js
const TEXT = {
  en: { play: 'Play', again: 'Play again' },
  fr: { play: 'Jouer', again: 'Rejouer' },
  ar: { play: 'العب', again: 'العب مرة أخرى' },
};
const lang = BRB.user.lang.split('-')[0];            // 'en-GB' -> 'en', 'zh-Hant' -> 'zh'
const T = TEXT[BRB.user.lang] || TEXT[lang] || TEXT.en;
document.documentElement.lang = BRB.user.lang;
document.querySelector('#menu').dir = BRB.user.dir;  // mirror menus and text, not the playfield
```

- Keep the playfield, controls and scores working the same in both directions (an arrow key still moves the way it points).
- Numbers can be shown with `n.toLocaleString(BRB.user.lang)`.
- The language comes from the play page (it is in the signed frame link), so it is right in the Studio preview as well.
- The AI Builder already writes new games in the builder's language, unless they ask for another one.
- The launch games are not translated yet: they read `BRB.user.lang` when they are.

