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
| `BRB.params` | Lesson parameters, when a lesson step opened the game at a place: a frozen `{ chapter, band, mode, level, lock, style }` (any of them may be missing), `{}` otherwise. See [Lesson parameters](#lesson-parameters). |
| `BRB.classRules` | Official games only (Typing Pets): a frozen `{ acc, wpm }` the player's teachers ask for before each next lesson opens (the strictest among the player's classes; 0 = no minimum), or `null`. Never a preview, a guest or a signed-out player. |
| `BRB.theme` / `BRB.motion` | The site theme (`'light'`, `'dark'`, or `''` to follow the device): read-only plumbing for games that follow the site, like [Oomba Kit](kit-api.md) games and the Builder's classroom games (they set `data-theme` from it for the classroom look's light and dark); other games keep their own colors. `BRB.motion` is **reserved** for a future site motion setting and is always `''` today: games follow the device's reduced-motion setting (the kit also has its own settings panel). |
| `BRB.storage.get(key)` | Per-player, per-game cloud save. Synchronous read. Values are JSON-decoded when possible. |
| `BRB.storage.set(key, value)` / `remove(key)` | Writes are debounced and sent to the server. Max ~450 KB per game per player. |
| `localStorage` / `sessionStorage` | Work as usual. `localStorage` is a shim backed by the same cloud save, pre-filled before the game starts, so older games just work. |
| `BRB.score.submit(score, label)` | Leaderboard entry (best score only, whole numbers ≥ 0). |
| `BRB.gameOver({ won, score, helped? })` | Call at the end of each round (also submits the score). `helped: true` (optional, Oomba Canvas 1.3.0): a teacher showed an answer in this set; those problems are not in the score. Older pages and servers ignore it. |
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
| `BRB.speak(text, opts?)` | Reads `text` aloud with the most natural voice already on the device (see [Speech](#speech)). `opts`: `{ lang, rate, pitch, volume, queue, onend, voice, device, ai, onfail }`; `lang` is the language the text is written in (default `BRB.user.lang`); `voice` a character role for AI voices; `device: true` always the device's voice; `ai: 'only'` the AI voice or nothing (`false` when there is none for this game and language, and a line the AI voice does not read ends with `onfail` instead of `onend`, never with the device's voice: the Oomba Kit's how-to speaker button). Returns `true` if it started, `false` if it cannot (no speech, or no voice for the language). After `true`, `onend` comes exactly once unless the line is stopped. |
| `BRB.voice(lang?)` | The `SpeechSynthesisVoice` `BRB.speak` would use for a language tag (default `BRB.user.lang`), or `null`. |
| `BRB.gameUrl` | The game's own play page (`https://…/play/<slug>`), or `null` in a preview. A game that shares a link to itself adds lesson parameters to it (`?mode=…&chapter=…&lock=1`, see [Lesson parameters](#lesson-parameters)). |
| `BRB.copy(textOrPng)` | Copies for the game, which can't use the clipboard itself (it is sandboxed): a link to the game's own play page (`BRB.gameUrl`, with any query, at most 400 characters) or a PNG `Blob` (at most 300 KB, such as that link's QR code). The play page copies only right after a tap. A Promise of `true` when copied, `false` when refused or after 3 s. |
| `BRB.questionSet` / `BRB.saveQuestionSet(items, id?)` | Official games on the list (Algebra Builder, The Big Divide, Crossword, Mistake Hunt), and Builder classroom activities on Oomba Canvas 1.4.0 (the kit uses them itself: never call them from a Builder game's own code): the teacher's question set a link opened, and saving one. See [Question sets](#question-sets-brbquestionset). |
| `BRB.wordsFromDoc(file, { kind, level, focus })` | Crossword, Word Hunt (Word Hunt gets the words only, each clue `''`, 2 to 15 letters) and Atlas Quest (Atlas Quest also takes `kind` `'txt'`, a plain text lesson, and its `words` are `[question, answer]`, or `['@map', 'FR']`-style country questions; services/atlas-doc.js), the same grown-ups as `writeClues`: a PDF (at most 5 pages) or Word (.docx) `Blob` of at most 2 MB (`kind` `'pdf'` or `'docx'`); about 5 pages of text are read (15,000 characters), the rest is cut off. `focus` (optional, Crossword and Word Hunt): the teacher's own line for the AI ("Science words only", "Words a 3rd grader should know"), at most 200 characters; the server trims it and runs it through the site's text filter, and the AI uses it only to narrow which words it picks from the document (a plain list ignores it). A Promise of `{ title, words: [[word, clue]], cut, ai }` (`cut`: only the start was read; `ai`: the AI took the words out, `false` for a plain "word - definition" list read as it is) or `{ error }` (`notAllowed`, `aiOff`, `aiFailed`, `docBad`, `docBig`, `docType`, `docPages`, `docScan` (no text: a scanned page), `docEmpty`, `docNone`, `docLimit` (10 files a day), `focusBad` (the text filter refused the focus line: no AI was asked, and the file does not count), `offline`). The page posts `POST /api/games/:id/words-from-doc`; the file is never stored. |
| `BRB.canReadDocs` / `BRB.textFromDoc(file, { kind })` | Mistake Hunt only, for grown-ups who may host (`INIT.docText`; never a kid, a student or a guest, and not past the family grown-up fence): the text of a PDF (at most 5 pages) or Word (.docx) `Blob` of at most 2 MB, read on the server with **no AI** (Crossword's readers and limits, its 10 files a day). A Promise of `{ text, cut }` (`cut`: only about the first 5 pages were read) or `{ error }` (`notAllowed`, `docBad`, `docBig`, `docType`, `docPages`, `docScan`, `docEmpty`, `docLimit`, `offline`). The page posts `POST /api/games/:id/text-from-doc`; the file is never stored or logged. |
| `BRB.proofAi` / `BRB.proofAsk(op, body)` / `BRB.openTrial()` | Mistake Hunt only, for teachers (school staff and the platform admin; `INIT.proofAi`; never a student, a kid, a family grown-up or a guest): `{ access: 'plan' \| 'free', left, plans }` (`left`: free AI requests left today, `null` with the Teacher plan). `proofAsk('draft', { topic, grade, length, n, types, count, seed })` (Power with AI passages, planted by proof-core), `proofAsk('scan', { text })` (Check my passage: flags `{ at, len, was, fix, why }`, nothing changed) and `proofAsk('why', { grade, items })` (why lines) -> a Promise of the server's answer (`ai: false` with a `reason` when the AI did not answer) or `{ error }` (`notAllowed`, `cap`, `names`, `words`, `personal`, `topic`, `short`, `bad`, `slow`, `offline`). The page posts `POST /api/games/:id/proof/draft \| scan \| why`. `openTrial()`: the page opens `/trial`, only right after a tap. **Phase 3, Oomba's chat on a set:** `proofAi.chat` is `'yes'` (Teacher plan holders, testers, the platform admin), `'plan'` (a teacher without the plan while paid plans are on: show the plan note and `openTrial`) or `null`. `proofAsk('chat', { setId?, text, set, retry? })` sends a message with the builder's draft (`set`: `{ T, g, types, n, p: [{ t, x, m }] }`; the server cleans it and builds the AI's context itself) -> `{ chat }` at once (the answer is a job: `chat.pending` until it comes); `proofAsk('chat-get', { setId? })` -> `{ chat }` (ask every 2 s while `pending`); `proofAsk('chat-applied', { setId?, turnId })` marks a change as put in the builder. A turn's `change.set` is the whole new set, every passage's mistakes planted by proof-core on the server. Errors also `teacherPlan`, `chatBusy`, `brief`. The page calls `GET/POST /api/games/:id/proof/chat` and `POST .../proof/chat/applied`. |
| `BRB.proofStep` / `BRB.proofSave(edits, { handIn })` | A graded Mistake Hunt lesson step (`/play/mistake-hunt?lesson=&step=`, `INIT.proofStep`): the passages as students see them (`w`: `[word, space]` pairs, `n` mistakes), the student's saved fixes, marks once handed in, and the key and why lines only once the teacher allows it. `proofSave` saves the fixes (`[[{ a, b, s }], ...]`, a list a passage) or hands them in (final) -> a Promise of `{ view }` or `{ error }` (`handedIn`, `words`, `badRequest`, `noHints`, `offline`). The page posts `POST /api/progress/:cl/:step/proofread`. When the teacher allowed hints (`view.hints`; `view.hintsUsed` is the count so far), `proofSave(edits, { hint: i })` saves the fixes and asks the server for a hint on passage `i` -> `{ view, hint: { i, a, b, k, g } | null }` (the sentence `a..b` over the words students see and the kind of mistake; `null`: nothing left to hint). The server holds the key and counts each hint. |
| `BRB.canMake` | Crossword, Word Hunt and Atlas Quest: whether this viewer gets "Make your own" (`INIT.make`), the builder for a teacher's own puzzle or quiz and the drafts it keeps in the player's game save ("Your crosswords", "Your word hunts", "Your quizzes"). True for grown-ups who may host, the same people who may host a live game: school staff, the platform admin and a family grown-up (whom the fence lets save their game). It does not depend on AI being on. False for a student, a child, a guest and a signed-out player, and in any preview (as `canListSets` and `canWriteClues` are). When it is false the game hides Make, every way into the builder and the drafts list (a child's old drafts stay in their save, unshown); a link or a class code still plays. `canSaveSet` is false then too: `POST /api/games/:id/sets` refuses anyone who may not host in these games (`notAllowed`), as `clues` and `words-from-doc` already do. |
| `BRB.canWriteClues` / `BRB.writeClues(words, { level })` | Crossword only (in Word Hunt `canWriteClues` means only that `wordsFromDoc` is offered; `writeClues` there is refused), for a grown-up who may host and whom the family fence lets through (school staff and the admin, not a family grown-up), with AI on: a Promise of `{ clues }` (one per word, `''` where none) or `{ error }` (`notAllowed`, `aiOff`, `aiFailed`, `words`, `offline`). The page posts `POST /api/games/:id/clues`; the clues are for the teacher to read and edit, nothing is saved. |
| `BRB.afterSpeech(fn, opts?)` | Calls `fn` once nothing is being said: no line playing, queued, or still on its way from the AI voice, for `gap` ms (250). Never before `min` ms (0) nor after `max` ms (10000), so a line that never ends can't hold the game. Returns a function that cancels it. Use it wherever the game moves on to the next question, so the last line is never cut off by the next one. |
| `BRB.speaking()` | `true` while a line is playing, queued or on its way from the AI voice. |
| `BRB.prefetchSpeech(lines, opts?)` | AI voices only (see [AI voices](#ai-voices)): asks for lines the game will say soon (a whole conversation card), so they start at once. `opts`: `{ lang, voice, rate }`. `false` (and nothing happens) without AI voices. |
| `BRB.aiVoiceCheck(lines, opts?)` | AI voices only: a Promise of `true` when the AI voice will read every one of these lines (at most 8) in `opts.lang`. The play page asks the server (`POST /api/tts` with `check: true`: the same checks as a real read, no audio made). `false` without AI voices, for a language that is off, with the device's voice chosen, for a refused line or with no answer in 4 s. The Oomba Kit shows its how-to speaker button only after a yes. |
| `BRB.aiVoice(lang?)` | `true` when lines in this language are read by an AI voice now (an official game or a published Builder game, the language switched on, the player has not chosen the device's voice). A game can leave out its own "voice" beeps then. |
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

Official games (our seed games) and, since 13 Nov 2026, games made in the Builder can be read by a hosted AI voice
(OpenAI's speech API) when the owner turns it on (`TTS_ENABLED`, a key, and each language switched on at
`/admin/voices`; docs/tts-design.md). The frame then gets `INIT.tts = { langs }`, and the SDK's `tts-client` block
(`// tts-client:start … end`) puts it behind the same `BRB.speak`.

**Builder games** (docs/decisions.md "AI voices for Builder games: fixed, scanned lines only"; `TTS_BUILT_GAMES=0`
turns it off): only a published version that passed the safety scanner gets `INIT.tts`, never a Studio or Builder
preview. The AI voice reads a line only when it is **exactly** one of the strings fixed in that saved version (a
string literal, markup text, a text attribute, or one sentence of one; upper/lower case ignored), always in one
friendly voice (`opts.voice` is ignored). Anything else is refused by the server and read by the device's voice at
once: a line with a score, a number that changes, a name, something the player typed, or pieces joined while playing.
So a game that wants the natural voice writes each spoken line as one whole fixed string:

```js
BRB.speak('Tap the animal that says moo!', { lang: 'en' });      // fixed: AI voice
BRB.speak('You scored ' + score + ' points!', { lang: 'en' });   // changes: the device's voice
```

How it works:
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
/play/<slug>?chapter=<id>&band=<1b|2>&mode=<id>&level=<n>&lock=<0|1>&style=<ink|pixel>
```

Only those six keys exist. Values are `[a-z0-9-]{1,16}`; `band` is `1b` (grades 3-5) or `2` (grades 6-8); `level` 1-30;
`lock` 0 or 1; `style` `ink` or `pixel` (the art style, for an Oomba Kit game that has the pixel style: Sum Racer opens in pixel art with `?style=pixel`, see [kit.md](kit.md) "Pixel style"). Unknown keys and bad values are dropped before anything reaches the game: the play page signs what is left
into the frame token (`o = "chapter.band.mode.level.lock"`, plus `.style` only when a style is given, empty parts allowed, at most 40 characters), `/frame` copies it
into `__BRB_INIT__.params`, and the SDK exposes it as **`BRB.params`**: a frozen object with the keys that were given
(`chapter`, `band`, `mode`, `style` as strings; `level` and `lock` as numbers), or `{}`. Nothing else from the URL ever reaches a game.

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
| `brb:print` | `{ id, doc }` | `BRB.print` (Crossword, The Big Divide) (see "Printing" below): right after a tap, the server checks `doc` and makes the printable page; the page prints it and answers `brb:printed { id, ok }` or `{ id, error }` |

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
  The one exception is the built-in Doodle Hoot Live with typed guesses: in a player's frame (the server sets
  `INIT.live.guess: 1` only for mode `doodle` without tiles) an `<input type="text" data-live-guess>` stays typeable.
  Its text is sent to the server only (as code points), checked there and never passed on.
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

For official games on the list (`server/services/polls.js` POLL_GAMES). Builder games never get it, a teacher's included:
the Builder's class survey starter counts on the device instead (docs/decisions.md "Classroom activities in the Builder"). `BRB.poll(item, choice, seat)` counts a choice
(`item`: `/^[a-z0-9][a-z0-9-]{0,39}$/`, `choice` 0 or 1, `seat` 0-5 for pass-and-play players) once per player and seat,
and resolves to `{ a, b, total, min }` (show a percentage only when `total >= min`), or `null` when polls are off, the
player is offline or the page is slow (5 s). Messages: `brb:poll {item, choice, seat, n}` to the page and
`brb:pollResult {n, a, b, total, min}` (or `{n, off: true}`) back.

## Question sets (`BRB.questionSet`)
An official game on the list (`SET_GAMES` in `server/services/game-sets.js`: Algebra Builder, The Big Divide; each with its own
cleaner) can keep a teacher's set on Oomba, so one short link (and its QR code, and a lesson step) opens it:
`/play/<slug>?chapter=s-<10 letters and digits>&lock=1`.
- A Builder classroom activity on Oomba Canvas 1.4.0 keeps sets too (a teacher's "worksheets": the kit's own problems,
  cleaned for the activity's published version by `cleanCanvasItems`; saving is for school staff only). The kit does
  everything itself (docs/canvas-api.md "Worksheets"); the Builder never writes code for it.
- `BRB.questionSet`: the set the link opened, `{ id, items, mine }` (`mine`: the player saved it), or
  `{ id, missing: true }` for a code with no set; `null` without one. The items are the game's own shape, as its
  cleaner left them. Algebra Builder: 1 to 20 items `{ a, p, s, l }`: the activity (`solve`, `multiply`, `factor`), the
  problem in the math alphabet (digits, x, `+ - − = ^ ( )` and spaces, at most 40 characters), what students start with
  (`all` or `none`) and the live balance (true or false). The Big Divide: one item `{ k, p, l, c?, d?, g? }`: `divide` or
  `multiply`, up to 100 `[a, b]` problems it can work, the support level, the 7 flags of a custom mix, `d: 1` for a fresh
  set per student and the plan `g` it is made from. No free text in either. Crossword: one item `{ t, w, r, b, h }`: a title,
  3 to 30 `[word, clue]` pairs (the teacher's own words: each word, clue and the title pass the site's text filter when
  saved), the layout's seed and the word bank and hints options. Mistake Hunt: 1 to 8 passages
  `{ t, x, g, m: [{ a, b, w, k, p?, y? }], o? }`: a title, the teacher's correct text (40 to 1,500 characters, in the
  form the game keeps it), a grade (0 to 8), the mistakes (a token range of the text, the wrong words students see, the
  kind, pinned, a why line of the teacher's own), and on the first passage only the options `{ h: hints, s: Show
  answers, n: 'total' | 'type' | 'none' }`; `cleanProofItems` checks every mistake by the game's own rules
  (`services/proof-core.js`) and every text through the site's filter (refused, never changed), 20,000 characters in all.
- `BRB.saveQuestionSet(items, id?, { title }?)` → a Promise of `{ id }` or `{ error }` (`guest`, `bad`, `full`,
  `notYours`, `offline`). The page posts it to `POST /api/games/:id/sets` for the signed-in player (not a guest): a new
  set, or with `id` their own set changed under the same code. 1 to 20 items (Algebra Builder); 200 sets per player per
  game. `title` (optional, at most 60 characters) is the set's name in its owner's list ("My worksheets", below); it
  passes the site's text filter, and one the filter refuses is left out while the set still saves. Left out, the name
  stays as it was. Crossword's name is always its puzzle's title (`items[0].t`). The Big Divide sends its activity's
  title.
- **My worksheets** (the owner's own list of their sets in this game). `BRB.canListSets`: true for school staff and the
  platform admin (`INIT.mySets`; never a student, a child, a guest or a family grown-up, never in a preview); a game
  shows its "My worksheets" button only then. Each call goes through the page to the server, and a set that isn't the
  caller's reads exactly like one that isn't there:
  - `BRB.mySets()` → `{ sets: [{ id, code, title, label, n, updated, items }] }`, newest first (`code`: the class code
    as shown, "C5EXP 1CM9H"; `title`: '' until named; `label`: an English description from the server, "Long
    division, 12 problems, Guided"; `n`: its words, problems or questions; `updated`: ms; `items`: the game's own
    shape, as `BRB.questionSet` has them). `GET /api/games/:id/sets`.
  - `BRB.deleteQuestionSet(id)` → `{ ok: true }`: the set is gone, its link and class code stop working.
    `DELETE /api/games/:id/sets/:set`.
  - `BRB.renameQuestionSet(id, title)` → `{ ok: true, title }` (the name as kept: spaces tidied, at most 60
    characters; '' takes the name away) or `{ error: 'title' }` when the text filter refuses it. For Crossword the
    puzzle's title changes too. `POST /api/games/:id/sets/:set/rename` `{ title }`.
  - `BRB.duplicateQuestionSet(id)` → `{ id, set }`: a copy under a new code, named "Copy of ..." in the teacher's
    language (`game.sets.copyOf`), with the list's view of it; `{ error: 'full' }` at 200.
    `POST /api/games/:id/sets/:set/duplicate`.
  - Errors: `notAllowed` (not offered to this viewer), `none` (not theirs, or gone), `title`, `full`, `offline`.
  - The server: owner only (anyone else's set, a bad id or another game's set: 404 `noSet`), never a guest (403
    `guest`), not past the grown-up fence, 60 calls a minute per account (as saving). Opening a set for editing needs no
    call of its own: `items` are in the list, and saving with its `id` keeps its code.
- `BRB.canAssign` / `BRB.assign(query)`: a teacher (school staff, not in a preview) may assign what they made. `query`
  is the problem's or set's lesson parameters (`chapter=s-…&lock=1`); after a tap the page opens
  `/teach/assign?game=<slug>&opts=<query>`, which says what students will open, makes a one-step lesson named after it
  whose game step carries those options, and offers "Also post to Google Classroom" for a class linked to Classroom.
  Students finish it with `BRB.gameOver` (the step done), which is the Classroom completion grade.
- `BRB.findQuestionSet(code)` → a Promise of `{ id, items }` or `{ error: 'none' | 'offline' }`: a class code a
  student typed (the set id without `s-`, any case, spaces or dashes; `GET /api/games/:id/sets/:code`, open to anyone
  who can open the game, 30 a minute per address). New codes leave out i, l, o, 0 and 1.
- `BRB.canSaveSet` / `BRB.canFindSet`: `false` when the server would refuse `saveQuestionSet` / `findQuestionSet` for
  this viewer (the frame's `setSave: false` / `setFind: false`: a family grown-up, whom the fence in routes/family.js
  keeps to playing; in Crossword, Word Hunt and Atlas Quest also anyone without `BRB.canMake`), `true` otherwise. A game hides those buttons when they are `false`.
- Sets go with their owner's account. Nothing about who played is kept.

## Teacher controls (`BRB.canTeach`)
A Builder classroom activity on Oomba Canvas 1.3.0 shows its teacher controls (Show answer, Board mode, Help on this
screen, New set; docs/canvas-api.md) only when `BRB.canTeach` is true: from `INIT.teach`, which the server sets by the
same rule as `INIT.printKey` (the activity's maker, school staff) and never for a student or the Studio's "As a student"
preview. Nothing in those controls reaches the server.

## Printing (`BRB.print`)
Crossword, The Big Divide and Mistake Hunt (frames where `INIT.print` is set: those official games, not in a preview; each game's
printer is in `server/services/game-print.js`), and Builder classroom activities on Oomba Canvas 1.2.0 whose purpose is a
worksheet or a question generator (also in the Studio's preview; `server/services/canvas-print.js`: the doc is only
`{ k: 'canvas', seed, n, paper, key }` and the server makes the sheet from the version's own data; `BRB.canPrintKey` is
true only for the activity's maker and school staff, from `INIT.printKey`). The frame can't print (no
`allow-modals`, no popups), so the play page prints for it.
- `BRB.canPrint`: true when printing is on. `BRB.print(doc)` → a Promise of `{ ok: true }` or `{ error }` (`notAllowed`,
  `bad`, `key`, `tap`, `offline`). Call it from a tap: the page checks `navigator.userActivation` when the message
  arrives and answers `tap` otherwise.
- `doc` is plain data, never HTML (at most 20,000 characters as JSON; the SDK, the page and the server each check).
  The Big Divide's: `{ k, p, r?, dec?, m?, key, set, note? }`, an activity's kind, problems and options exactly as a question
  set's item (`cleanBoxItems`: numbers and fixed words only); the server works out the answers for the key
  (`services/box-by-box-print.js`). Crossword's:
  `{ t, w: [[word, clue]], b, g: { w, h, e: [[word index, 'a'|'d', row, col]] }, key, set, note? }`: the title, the words and
  clues (a question set's rules, `cleanCrossItems`: each word, clue and the title pass the site's text filter), the word
  bank option, the layout as numbers (1 to 25 a side, at most one entry per word), the answer key (true or false) and the
  saved set's id (or `''`). The server puts the letters down from the words (a layout that doesn't spell its words is
  refused), counts the clue numbers in reading order, and adds the class code and link to the footer only for a set of
  this game that exists. Mistake Hunt's: `{ T, p, key, set, note? }`: the set's name and its passages exactly as a
  saved set holds them (`cleanProofItems`); the server writes the wrong text from the teacher's text and the mistakes, so
  the worksheet and its key always agree (`services/proof-print.js`: a sheet a passage with the directions, a legend of
  proofreading marks and "I found ___ of N"; then for staff a key a passage, each fix numbered in place and listed with
  its kind, Common Core code and why line). All three take `note`, the teacher's own instructions: plain text of at most 300 characters
  (`services/print-note.js`: control characters dropped, line breaks kept, blank is none), printed in bold at the top of
  the sheet and never on the answer key.
- `POST /api/games/:id/print` `{ doc }` → `{ html }` (the printable page in the viewer's language and direction) or
  `{ code: 'bad' }` (400), `{ code: 'key' }` (403: the answer key is for school staff only, BRB.canAssign's check;
  in Atlas Quest also for the grown-ups who may make a quiz, `BRB.canMake`'s check, never a student or a child). Open
  to anyone who can open the game, 20 a minute per address. Nothing is kept.
- The page puts the HTML in `#print-area` (hidden on screen; in print it is all that shows, `public/css/app.css`
  "Printing"), calls `window.print()` and empties it after printing.

## Loudness (`BRB.loudness`)
How loud the room is, as one number. Any game may use it (the official noise meters, and Builder games since 13 Nov
2026; `server/services/mic-games.js` decides, `MIC_BUILDER=0` limits it to the official ones). The PAGE (the play page,
or the Studio page for the preview) opens the microphone after a tap and posts one number; the frame never touches the
microphone. Covers, Live frames and online matches answer `off`. A game must work without it (a tap fallback).

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
`playtest_game()`, `start_from_template(template, notes)` (copies a starter in as a new version on the server: the
classroom starters quiet, categories, survey, bingo, flashcards, exitticket, spinner, scoreboard, classquiz, classmemory
and classword, plain HTML in the Oomba classroom style 2, the Crossword look; with `ARCADE=1` also the 2D kit templates and the 3D starters)
and `test_notes(checklist)`. Every `write_game` / `edit_game` / `start_from_template` makes a new, safety-scanned version.
With the arcade side off (the default, `config.arcade`), the Builder's fixed prompt and tools are the classroom ones
(`prompt.js` `SYSTEM_PROMPT_FOCUS`, `TOOLS_FOCUS`): no kit, Kit 2, 2D art or 3D rules, and no kit template to start from;
a game made on the kit before gets its own engine's rules as a separate block on its own turns only. With `ARCADE=1`, the
3D rules are a separate fixed system block, sent only when the builder asks for 3D or the game is already 3D.

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

