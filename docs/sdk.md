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
| `BRB.user` | `{ displayName, avatar, isGuest, lang, dir, character }`. No other identity is ever given to a game. `lang` and `dir` are explained in [Languages](#languages). `character` is the Oomba character the player designed on their Me page (a frozen parts spec from the kit's lists: `species body skin hair mood outfit colors wear bold`, never a picture), or `null` (guests, or not designed yet); kit games read it with `Oomba.avatar()`. |
| `BRB.game` | `{ id, title }` |
| `BRB.preview` | `true` inside the Studio preview (saving is off there). |
| `BRB.params` | Lesson parameters, when a lesson step opened the game at a place: a frozen `{ chapter, band, mode, level, lock }` (any of them may be missing), `{}` otherwise. See [Lesson parameters](#lesson-parameters). |
| `BRB.theme` / `BRB.motion` | The site theme (`'light'`, `'dark'`, or `''` to follow the device): read-only plumbing for games that follow the site, like [Oomba Kit](kit-api.md) games; other games keep their own colours. `BRB.motion` is **reserved** for a future site motion setting and is always `''` today: games follow the device's reduced-motion setting (the kit also has its own settings panel). |
| `BRB.storage.get(key)` | Per-player, per-game cloud save. Synchronous read. Values are JSON-decoded when possible. |
| `BRB.storage.set(key, value)` / `remove(key)` | Writes are debounced and sent to the server. Max ~450 KB per game per player. |
| `localStorage` / `sessionStorage` | Work as usual. `localStorage` is a shim backed by the same cloud save, pre-filled before the game starts, so older games just work. |
| `BRB.score.submit(score, label)` | Leaderboard entry (best score only, whole numbers ≥ 0). |
| `BRB.gameOver({ won, score })` | Call at the end of each round (also submits the score). |
| `BRB.fullscreen()` | Asks the page to go full screen. `element.requestFullscreen()` is routed here too. |
| `BRB.retry()` | Asks the page to load the game again from scratch, for a "Try again" button when the game could not start (a reload from inside the frame would go without the sign-in). Works only right after a tap. |
| `BRB.back()` | Asks the page to go back to where the game was launched from (a course step or a class lesson), for a "Back to class/course" button at the end of a course chapter. The frame cannot navigate the page itself. Works only right after a tap, and only when the game was launched from somewhere with a way back; in free play it does nothing. |
| `BRB.orientation('landscape')` | Tells the page the game wants landscape (it shows a "turn your phone" hint). |
| `BRB.fx.confetti(opts?)` | Confetti burst (skipped when the player prefers reduced motion). |
| `BRB.fx.shake(element, strength?)` | A short shake. |
| `BRB.fx.flash(color?)` | One gentle flash (never repeat it quickly). |
| `BRB.fx.tween(from, to, ms, onUpdate, ease?)` | Returns a Promise when done. |
| `BRB.fx.fit(canvas, width, height)` | Crisp scaling of a **2D** canvas to the screen (device pixel ratio, resizes). It only sets the transform of a 2D context the game made (or starts the one it makes later at that scale) and never creates a context, so it is harmless on a WebGL canvas. |
| `BRB.fx.fit3d(renderer, camera, opts?)` | Fits a 3D renderer (e.g. a Three.js `WebGLRenderer`) to the screen: pixel ratio first (capped, `opts.maxDpr`, default 1.5), then the size, then `camera.aspect`, again on every resize and rotate. `opts.element` fits an element instead of the window; `opts.onResize(w, h, dpr)` runs after each fit. Returns `{ resize(), maxDpr(n), stop() }` (`maxDpr(n)` is for quality ladders). |
| `BRB.sfx.play(name)` | `'jump' \| 'hit' \| 'coin' \| 'win' \| 'lose' \| 'click' \| 'powerup'`, synthesised with WebAudio. |
| `BRB.sfx.mute(on?)` | Toggle or set mute; returns the new state. `BRB.sfx.muted` reads it. The choice is saved. |
| `BRB.speak(text, opts?)` | Reads `text` aloud with the most natural voice already on the device (see [Speech](#speech)). `opts`: `{ lang, rate, pitch, volume, queue, onend, voice, device }`; `lang` is the language the text is written in (default `BRB.user.lang`); `voice` a character role for AI voices; `device: true` always the device's voice. Returns `true` if it started, `false` if it cannot (no speech, or no voice for the language). After `true`, `onend` comes exactly once unless the line is stopped. |
| `BRB.voice(lang?)` | The `SpeechSynthesisVoice` `BRB.speak` would use for a language tag (default `BRB.user.lang`), or `null`. |
| `BRB.prefetchSpeech(lines, opts?)` | AI voices only (see [AI voices](#ai-voices)): asks for lines the game will say soon (a whole conversation card), so they start at once. `opts`: `{ lang, voice, rate }`. `false` (and nothing happens) without AI voices. |
| `BRB.aiVoice(lang?)` | `true` when lines in this language are read by an AI voice now (an official game, the language switched on, the player has not chosen the device's voice). A game can leave out its own "voice" beeps then. |
| `BRB.stopSpeaking()` | Stops the speech that is playing or waiting. |

There is no network and no way to reach the page around the game.

## Speech

Games that read words or messages aloud use `BRB.speak`, never `speechSynthesis` directly (old games that do still get
better voices: see the end of this section). It uses the Web Speech API with
the best voice the device **already has**: free, no server, and the text never leaves the device.

```js
sayBtn.addEventListener('click', () => {
  if (BRB.sfx.muted) return;                          // speak() does not check mute: the game decides
  if (!BRB.speak('cat', { lang: 'en-US', rate: 0.9 })) showText('cat');   // no voice here: show the word instead
});
BRB.speak('Great job!', { lang: 'en' });             // lang = the language the text is written in, normal speed
BRB.speak('Next word', { lang: 'en', queue: true });  // after what is playing instead of cutting it off
BRB.speak(T[BRB.user.lang].win);                      // text from the game's own translations: lang can be left out
```

- **`lang` matches the text, not the player.** A game is written in one language (the builder's) but played by people whose
  site language (`BRB.user.lang`, the default) may differ: a French game played by an English player must still pass
  `{ lang: 'fr' }`, or its French text is read by an English voice (or not at all). Leave `lang` out only when the text
  comes from the game's own per-`BRB.user.lang` translations.

- **Which voice.** Every voice for the language is scored (`public/sdk/brb-sdk.js`, "Speech"):
  - the exact language and region first (`en-GB` gets a British voice before an American one; `pt` is Brazilian, so
    `pt-BR` before `pt-PT`; `zh-Hant` is spoken as Mandarin: `zh-TW`, then `zh-CN`, and `zh-HK` last, because Hong Kong
    voices speak Cantonese; `he` also matches the old `iw`; a tag like `en-US` or `es-MX` tries its region first, then the
    language's own order, so `en-US` on a device with no American voice gets a British one);
  - then quality by name: "Natural" / "Neural", Apple "Premium", "Enhanced" and Siri voices, local Google voices (Android,
    ChromeOS) go up; Windows "… Desktop" voices, Apple "compact" voices, Apple's Eloquence voices (Eddy, Flo, Grandma,
    Grandpa, Reed, Rocko, Sandy, Shelley), eSpeak, and Apple's novelty voices (Albert, Bad News, Bahh, Bells, Boing,
    Bubbles, Cellos, Good News, Jester, Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox, Fred, Junior, Kathy, Ralph…)
    go down; the device's default voice gets a small nudge.
  - **Online voices are used, after on-device natural ones.** The order within the language is: on-device natural voices
    (Natural / Neural, Premium, Siri, Enhanced, ChromeOS natural); then the browser's online voices (`localService ===
    false` or a `-network` name: Edge's "Microsoft … Online (Natural)", Chrome's "Google US English", "Google UK English
    Female", "Google español"…); then plain on-device voices (Microsoft David / Zira, "Desktop" voices, Apple compact
    voices); eSpeak, Eloquence and novelty voices last. An online voice sends the spoken text to the browser vendor
    (Microsoft or Google); the owner accepted this (`docs/decisions.md`, 29 Oct 2026) because without them Chrome and Edge
    on Windows speak with robotic voices or not at all. With no voice for the language, `speak()` returns `false`.
  - The pick is cached per language and refreshed when the browser's voice list changes (`voiceschanged`). Some browsers
    fill the list a moment after load: a `speak()` in that moment waits for it (up to 1.5 s) and returns `true`.
- **Natural defaults:** `rate` 1 and `pitch` 1. Do not raise the pitch or slow everything down: that is what makes a voice
  sound robotic. A slower rate (0.8–0.9) is right only for something a child must hear clearly, such as a word to spell.
- **Start speech from a tap or key.** iPhones and iPads only speak after the player has tapped; the SDK unlocks speech on
  the first tap or key press, so later lines (after an animation or a timer) work too.
- Long text is spoken a sentence at a time (Chrome stops one utterance after about 15 seconds). A new line stops the one
  playing unless `queue: true`. A paused speech engine is resumed, speech stops when the game closes, and every call is a
  safe no-op when the browser has no speech at all.
- `onend` runs once the whole text has been spoken.
- **Games that call `speechSynthesis` directly get better voices too.** Older games (and Builder games saved before
  `BRB.speak`) build their own `SpeechSynthesisUtterance`. The SDK wraps `window.speechSynthesis.speak` once (on the
  instance: `'speechSynthesis' in window` and `instanceof SpeechSynthesis` still work, and it is a no-op where speech is
  missing) and adjusts each utterance just before the browser speaks it (owner's decision, 29 Oct 2026, `docs/decisions.md`):
  - no voice set: the best voice for `u.lang`, or for the game's language (`BRB.user.lang`, then the page's `lang`) when
    `u.lang` is empty; with no voice for the language it is left as it is;
  - a voice the game set: replaced only when it is a penalised voice (eSpeak, Eloquence, Apple novelty / MacinTalk,
    Windows "Desktop", Apple compact) **and** the best voice for the same language is clearly better (30 or more points:
    a Desktop or compact voice only gives way to an on-device natural voice or an online one; eSpeak, Eloquence and
    novelty voices to any ordinary voice). A voice in another language than the utterance is never changed;
  - a mild pitch shift (0.85–1.25, but not 1) is set to 1; stronger shifts (below 0.85, above 1.25) are deliberate
    character voices and are kept. `rate` and `volume` are never changed;
  - `BRB.speak`'s own utterances pass straight through. Nothing is delayed or split: an utterance spoken before the
    voice list has loaded goes out exactly as the game made it.

### AI voices

Official games (our seed games, never Builder games) can be read by a hosted AI voice (OpenAI's speech API) when the
owner turns it on (`TTS_ENABLED`, a key, and each language switched on at `/admin/voices`; docs/tts-design.md). The frame
then gets `INIT.tts = { langs }`, and the SDK's `tts-client` block (`// tts-client:start … end`) puts it behind the same
`BRB.speak`:
- The frame can't fetch, so it asks the play page with `brb:tts { id, text, lang, role, rate, pre? }`; the page asks
  `POST /api/tts` (with its game token) and answers `{ brb:1, type:'brb:tts', id, ok:true, buf }` (the MP3's bytes,
  transferred) or `{ ok:false, why }`. The SDK plays the bytes as a `blob:` URL on one shared `Audio` element (unlocked
  on the first tap with a silent sound), with the line's `volume`; queueing, `queue: false`, `stopSpeaking()` and
  closing the page work as with the device's voice. Replies are accepted only from `window.parent` and for a line that
  is still waiting.
- **Fallback:** no answer within 4 s, a refusal, or audio that won't play: that line is spoken by the device's voice
  (`startSpeech`), and `onend` still comes once. A reply after the fallback is dropped.
- **The `onend` promise:** once `speak()` returned `true`, `onend` comes exactly once, even when no voice could say the
  line after all (the device path too: a line waiting for the voice list that never finds a voice). A line stopped by a
  new line or `stopSpeaking()` gets no `onend` (as before).
- `opts.voice`: `'narrator'` (default), `'friendly'`, `'bright'`, `'deep'`, `'wise'` or `'grumpy'`; the admin maps
  roles to OpenAI voices. `pitch` is ignored by AI voices; `rate` picks slow (< 0.9), normal or fast (> 1.1).
- The language: `en-GB` stays British, `zh-TW`/`zh-HK`/`zh-Hant` are read as Taiwanese Mandarin, `zh-CN` and `pt-PT`
  keep the device's voice (the site's Chinese is Traditional and its Portuguese Brazilian), any other tag uses its base
  language when the site has it.
- The play page's 🔊 Voices sheet lets the player choose "This device's voice" (`localStorage['oomba:voices']`; Data
  Saver picks it by default); the page tells the frame with `brb:tts-mode { mode }` and answers every `brb:tts` with
  `ok:false`.
- An official game's own `speechSynthesis.speak(u)` is read by the AI voice too (start and end events are fired on `u`,
  and `speechSynthesis.cancel()` stops it); on any failure `u` goes to the device as before.
- Hero of Sunvale speaks its conversation cards and cut-scene captions this way, each speaker with the role in its
  `// ==== VOICES START/END ====` block, prefetches the whole card, and keeps its "voice" beeps when AI voices are off.

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
- The AI Builder starts every new 3D game from its own starter, `server/builder/templates/world3d.html` (no Oomba Kit):
  a walking player (gravity, ground, slopes, steps, walls it slides along, jumps that land, bounds and respawn), a follow
  camera that never goes under the land or into a wall, keyboard and touch controls, its own screens in the 13 languages,
  and an example world the Builder replaces with the world the builder asked for.
- The **Star Island** template (`server/builder/templates/island.html`, on the kit's 3D bridge) is a finished 3D game: comfort (field of view 60-75,
  a smooth follow camera, no shake), a pixel-ratio cap of 1.5 and an automatic quality ladder, context-loss handling,
  reduced motion, keyboard + touch joystick, and every word in the 13 languages.

## Lesson parameters

A teacher's lesson step can open a game at a chapter, for a grade band, in a mode, at a level, and lock it there (CS Quest
lessons do; `lesson_steps.options`). The step's Play link carries them as a query string the teacher can read:

```
/play/<slug>?chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>
```

Only those five keys exist. Values are `[a-z0-9-]{1,16}`; `band` is `1b` (grades 3-5) or `2` (grades 6-8); `level` 1-30;
`lock` 0 or 1. Unknown keys and bad values are dropped before anything reaches the game: the play page signs what is left
into the frame token (`o = "chapter.band.mode.level.lock"`, empty parts allowed, at most 40 characters), `/frame` copies it
into `__BRB_INIT__.params`, and the SDK exposes it as **`BRB.params`**: a frozen object with the keys that were given
(`chapter`, `band`, `mode` as strings; `level` and `lock` as numbers), or `{}`. Nothing else from the URL ever reaches a game.

```js
const P = (window.BRB && BRB.params) || {};     // works in older frames too
if (P.chapter) openChapter(P.chapter, P.band || '1b');
if (P.lock === 1) hideChapterMap();              // the lesson wants this chapter only
```

Read it defensively: a game must also work with no parameters at all (the game page, previews, covers).

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
| `brb:retry` | – | the 3D card's "Try again": the page reloads the game, only right after a tap (a reload started inside the frame has no sign-in cookie, so the server refuses it) |
| `brb:back` | – | `BRB.back()`: the page navigates back to the course step or class lesson the game was launched from, only right after a tap and only when the play page carries that back context (course step or lesson); otherwise ignored |
| `brb:online` | – | `BRB.match.menu()`: opens the "Play online" sheet, for online games only, right after a tap |
| `brb:tts` | `{ id, text, lang, role, rate, pre? }` | AI voices (official games, when on): fetches the line from `/api/tts` and posts the MP3's bytes back (`{ id, ok, buf }`), or `{ id, ok:false, why }`; `pre`: fetch only, no answer |

The parent checks that each message comes from its own game frame (`event.source`), has the expected shape,
and the server validates and rate-limits every resulting API call (`public/js/play.js`, `public/js/studio.js`, `public/js/admin.js`).

## Live messages (Oomba Live)

A live frame (`/live/frame/:token`, `__BRB_INIT__.live`) makes a `MessageChannel` before the game's code runs and hands
`port2` to the page with its first `brb:ready` (`{ title, live: 1 }` plus the port as a transfer). Everything live goes
over that port, never over `window.postMessage`: a page the frame navigates to never has it, and the page tears a frame
down on its second load (`public/js/live-common.js`). Games never use the port: they use `Oomba.live` (the kit's
`live` pack); `BRB.live` is `{ v, active, init, send(t, m), on(fn) }` for the pack only.

- Frame to page: `rdy {view, cfg}`, `mv {p}`, `ev {k, d, to}`, `sc {n}`, `it {i, ok}`, `an {i, c, e}`, `em {e}`, and
  for the host's frame `st {d}`. The SDK checks each one's exact shape (game event data: numbers, booleans, null and
  `[a-z0-9_-]{1,24}` tokens, two levels deep at most) and drops anything else with a console warning; the page checks
  again (type, role, size) and the server a third time.
- Page to frame: the server's messages (docs/live-protocol.md §2) without tokens, the join code or report counts, and
  `clk {s}` (the server's time, so the frame can count down to the same moment as everyone).
- In a live frame nothing can be typed: `prompt()` returns null, text inputs and textareas are read-only and
  contenteditable is switched off, also for elements the game adds later (buttons, sliders and checkboxes still work).
- `BRB.device` (3D games): `{webgl2, importmap}`. A game with `<meta name="oomba-live" content="2d">` gets no "newer
  device" card when they are missing: it draws its own 2D view.

## Online matches (`BRB.match`)

For official two-player games on the allowlist (`server/services/match.js` `GAMES`). `BRB.match.menu()` asks the page
to open the site's "Play online" sheet (friends, family, match codes); the page ignores it for other games. On
`/play/<slug>?match=<id>` the frame gets `INIT.match = { v: 1, seat }`, and then:

- `BRB.match.active` (true), `BRB.match.init` (`{ v: 1, seat: 0|1 }`; seat 0 made the match).
- `BRB.match.on(fn)`: `{ t: 'wait' }` (the other player hasn't joined; the page shows the code or "waiting for…"),
  `{ t: 'go', seat, me: { name }, opp: { name, character }, hist: [[seat, k, d], …] }` (both in; the whole history,
  sent again after the frame reloads), `{ t: 'ev', f, k, d }` (the other player's event; your own are not echoed),
  `{ t: 'opp', on }` (their connection), `{ t: 'left' }` (they left for good).
- `BRB.match.send(k, d)`: `k` is `'mv'` or `'act'`; `d` is an object of at most 8 keys `/^[a-z]{1,2}$/`, each an
  integer 0-9999 or a boolean. Anything else is dropped with a console warning (and refused by the page and server).
- `BRB.match.leave()`: leaves the match; the page goes back to the plain game.

Like live frames, the transport is a private `MessagePort` handed to the page with the first `brb:ready`
(`{ match: 1 }` plus the port); `public/js/match.js` relays it to `/api/match/:id/wait` and `/send`.

## Polls (`BRB.poll`)

For official games on the list (`server/services/polls.js` POLL_GAMES). `BRB.poll(item, choice, seat)` counts a choice
(`item`: `/^[a-z0-9][a-z0-9-]{0,39}$/`, `choice` 0 or 1, `seat` 0-5 for pass-and-play players) once per player and seat,
and resolves to `{ a, b, total, min }` (show a percentage only when `total >= min`), or `null` when polls are off, the
player is offline or the page is slow (5 s). Messages: `brb:poll {item, choice, seat, n}` to the page and
`brb:pollResult {n, a, b, total, min}` (or `{n, off: true}`) back.

## Loudness (`BRB.loudness`, official classroom games only)
Not part of the Builder's API: only the play page of an official game on the list in `server/services/mic-games.js`
(today Remi's Quiet Meadow) listens. The PAGE opens the microphone after a tap and posts one number; the frame never
touches the microphone. Everywhere else (other games, previews, covers, Live) the answer is `off`.

- `BRB.loudness.available()` → `Promise<boolean>` (false after at most 800 ms when the page cannot listen). The page
  answers at once from its page data; only its answer is remembered (a timeout is asked again next time).
- `BRB.loudness.start()` → `Promise<'on' | 'off' | 'denied' | 'nodevice' | 'busy' | 'unavailable' | 'needsTap' |
  'stopped'>`. Call it from a tap (the page checks `navigator.userActivation`). `needsTap`: the page wants one more tap
  of its own (a tablet that kept audio asleep); `stopped`: the page stopped while the browser prompt was up. Only after
  its own `start()` does the SDK send a keep-alive (at once, then every 2 s, also while the page waits for its tap); the
  page stops after 6 s without one (a minute while it waits for its tap). An `on` the game never asked for (a start
  left over from before a reload) is answered with `stop`.
- `BRB.loudness.on(fn(db))` → off: dBFS (-100…0, 0.1 steps) about 20 times a second while on.
- `BRB.loudness.onState(fn(state))` → off: `'stopped'` when the page stopped listening (the teacher pressed Stop, the
  page was hidden), `'idle'` after `stop()`.
- `BRB.loudness.stop()`, `BRB.loudness.state`.

Messages (validated in `public/js/play.js`): frame → page `{type:'brb:loud', op:'hello'|'start'|'keep'|'stop'}`; page →
frame `{type:'brb:loudState', state}` and `{type:'brb:level', db}`.

## How the Builder edits games

The AI Builder works with these tools: `ask_user(question, options)`, `write_game(html, notes)` (a whole new version),
`edit_game(edits[{find, replace}], notes)` (each `find` must appear exactly once in the current game, otherwise nothing
changes and the Builder is told why), `set_game(title, icon, description, category, tags, orientation, players)`,
`playtest_game()`, `start_from_template(template, notes)` (3D only: copies Star Island in as a new version on the server)
and `test_notes(checklist)`. Every `write_game` / `edit_game` / `start_from_template` makes a new, safety-scanned version.
The 3D rules are a separate fixed system block, sent only when the builder asks for 3D or the game is already 3D.

`playtest_game()` plays the game on a phone (a picture of the title screen and one after pressing Play, errors, the kit's
warnings and a short scripted round), then shows the same two moments on every device: phone portrait 390x844, tablet
portrait 820x1180, phone landscape 844x390, tablet landscape 1180x820 and desktop 1280x800 (`VIEWS` in
server/services/snapshot.js), made by resizing the window as a tablet turning does. The model gets them as two labelled
contact sheets, and the layout problems found at each size (sideways scrolling, text or buttons cut off, text cut off
in its box, things on top of each other, tap targets under 44px, buttons squashed tall and thin) as problems named by
device. The system prompt's "EVERY DEVICE, TABLET FIRST" rule says the game must look right on all five, tablets above
all, and that the Builder never finishes while any view looks wrong.

After the AI finishes a build that saved a version, the platform also plays it by itself (the automatic playtest,
`server/builder/autotest.js`): about 18 s of keys, taps, swipes and the game's own buttons, watching the screen, the
score (`__brbTest.state()`, numbers on screen, `BRB.score` / `BRB.gameOver`) and errors, then the layout on phone
landscape, tablet portrait and desktop. Real problems go back to the AI for a fix round (1 a build, 3 for teachers,
school staff and the admin) and the fixed version is played again (docs/decisions.md "The Builder playtests every
build by itself").

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

