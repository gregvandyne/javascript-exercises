# Remi's Quiet Meadow: build plan

The owner asked: "Make this game with Remi. Measure the noise level in the class and hear the animation wake up if it
gets too noisy." It is a classroom noise tool, like a "Monster Meter". A red panda sleeps in a meadow at sunset. The
device measures how loud the class is. If the class gets too loud, Remi wakes up, grumbles, and then goes back to sleep
once the room is quiet. A clock counts the quiet time. Slug: `remis-quiet-meadow`.

Branch `remi-noise` in the `.claude/work/wt-remi` worktree (from origin/main f13bbe8). Do not push. Use the exact commit
footer from the task. Do not change `kit/SHIPPED.json`, any file it lists, or any kit version file. This game needs no
kit change at all.

**The art is original.** The owner's pictures look very like the Pixar "Turning Red" panda. We do not copy them, embed
them or trace them. Remi is our own red panda in the Oomba flat "ink" style, the same style as the kit cast and the Tug of
Math scene. Remi keeps only generic red-panda traits: orange-red fur, a cream face and belly, white ear tufts and a
ringed tail. We add one thing of our own, a green leaf scarf. See section C.

---------------------------------------------------------------------------------------------------------------------

## 0. Key decisions (summary)

1. **The microphone cannot work inside the game sandbox.** We tested this (section A.2). Chromium refuses
   `getUserMedia` in any opaque-origin document with `SecurityError: Invalid security origin`. It refuses even when every
   Permissions-Policy and `allow=` setting is open. Our frame must stay opaque: there is no `allow-same-origin`, ever.
   So the mic cannot live in the frame. Granting it there would also open a hole for every game.
2. **The mic lives on the site's own play page, only for this one official game. Only a number crosses into the
   frame.**
   - `/play/remis-quiet-meadow` (server code checks `micGame(g)`: this slug, official, published) gets
     `Permissions-Policy: microphone=(self)` and `page-data.mic = true`. Every other page keeps `microphone=()`.
   - The play page's own code (`public/js/loudness.js`, loaded by `play.js` only when `d.mic`) opens the mic after a
     real tap in the game. It measures RMS with an AnalyserNode and posts one number (dBFS, 0.1 dB steps) to the frame
     20 times a second.
   - The frame, its CSP, its sandbox, its `Permissions-Policy: microphone=()` and the iframe's `allow` attribute do not
     change at all.
   - No audio ever exists outside the page's Web Audio graph. The mic stream is never routed to the speakers, never
     recorded (no MediaRecorder) and never sent anywhere.
   - This is better than the "/tools/remi outside the sandbox" fallback. It keeps the game a normal official game (play
     page, fullscreen, covers, lessons, AI voices). It works the same in Chrome, Edge, Firefox and Safari/iPad, because
     the page is a normal top-level document.
3. **The scanner does not change.** `getUserMedia` still fails the scan for every game, this one included. The game
   never calls it: it calls `BRB.loudness.*` in the SDK, and the SDK just talks to the page. So we need no slug
   exemption in `scanVersion`.
4. **Kit 1.1.3 shell plus our own SVG scene and Remi rig.**
   - The kit gives us the title, the settings panel (sound, less motion), the results card, fonts, the light and dark
     looks, `Oomba.t`/`O.num`, `Oomba.sfx` and the test hooks. We load no packs.
   - The kit cast has no red panda. Its rigs cannot lie flat, stretch, yawn or cover their ears. So Remi and the meadow
     are a hand-drawn inline SVG with a small pose-blending animator of our own (section C).
   - Remi's sounds (yawn, grumble, murmur) are made with WebAudio in the frame.
5. **The game runs its own loop.** The kit pauses its loop and opens the HUD pause when the frame loses focus. That
   happens whenever the teacher clicks the playbar. So we use no kit HUD (`hud: []`), and we drive Remi from our own
   `requestAnimationFrame`. We pause on `visibilitychange` hidden and on our own pause button or Space. We do not pause
   on blur.
6. **Feedback guard.** While Remi's own sound plays, and for 400 ms after, the state machine ignores the mic. The page
   also marks levels as "held" while it plays an AI-voice line.

---------------------------------------------------------------------------------------------------------------------

## A. The microphone: where it is allowed and how it is limited to one game

### A.1 How the game frame is made today (all frames are opaque and can never have a mic)
- `server/services/frame.js:17`: `SANDBOX = 'allow-scripts allow-pointer-lock allow-orientation-lock'`. There is no
  `allow-same-origin`, so the frame is opaque. `frameCsp()` (line 29) also carries `sandbox ${SANDBOX}`, so a frame URL
  is opaque even when opened at the top level.
- `frame.js:80-92 sendFrame()`: `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(),
  serial=(), bluetooth=()` on every frame response. `connect-src 'none'`.
- `server/app.js:116`: every site page sends `Permissions-Policy: camera=(), microphone=(), …`. Only the Studio
  overrides it (`server/routes/studio.js:200`: `microphone=(self)` while speech to text is on, "the game frame never
  gets it").
- `server/routes/games.js:229` `/play/:slug`. At line 314 the frame template is `<iframe id="gameframe" data-src="/frame/<token>"
  sandbox="${SANDBOX}" allow="fullscreen; autoplay" …>`. `/frame/:token` is at line 339, and it calls `sendFrame` at line 376.
- Other frame hosts each set their own sandbox and none of them allows the mic: `public/js/live-common.js:116` (Oomba
  Live), `routes/studio.js:250`, `routes/admin.js:59`, `routes/kit.js:40` and `services/snapshot.js:275`.
- `public/sdk/brb-sdk.js` is inlined into every frame. It removes WebRTC and blocks child frames. Its `send()` (line
  152) posts `{brb:1, type}` to the parent. `public/js/play.js:101-118` `TYPES`/`validMessage` accept only known
  shapes, from our frame (`e.source`) and from origin `'null'`.
- Scanner (`server/services/scanner.js:40`): `getUserMedia|geolocation` gives **fail** (`privacy`). Line 88
  `DANGER_NAMES` also catches it when it is built from pieces. AudioContext is allowed: the SDK's sfx use it.

### A.2 What we tested (Chromium 1194 headless shell, fake media flags)
Test harness: `/tmp/claude-0/-home-user-javascript-exercises/7e93eb31-0e54-51a2-86cc-b45e55b43821/scratchpad/mic/`
(`srv.cjs`/`run.cjs` and `srv2.cjs`/`run2.cjs`).

| Setup | Result in the sandboxed frame |
|---|---|
| Site headers as today (`microphone=()`, no `allow`) | `SecurityError: Invalid security origin` |
| Top `microphone=(self)` + `allow="microphone"`, frame header `microphone=()` / none / `(self)` | the same `SecurityError` |
| Top `microphone=*` + `allow="microphone *"` (`featurePolicy.allowsFeature('microphone') === true`) | **still** `SecurityError` |
| Parent page with `microphone=(self)`, getUserMedia in the page | works |
| Tap in the frame, then postMessage, then the parent calls getUserMedia + `new AudioContext()` with `--autoplay-policy=user-gesture-required` | `userActivation.isActive === true` in the parent (activation spreads to ancestors), the AudioContext is `running`, the level reaches the frame |

So the frame cannot get the mic in Chromium, the browser on most school Chromebooks and smartboards. The only fix would be
`allow-same-origin`, and that is forbidden (docs/safety.md, frame.js comment). Firefox and Safari are even stricter
about opaque or sandboxed capture. **Decision: the play page runs the mic. The frame never does.**

### A.3 The server gate: one game, official, by id and owner, not by its HTML
New `server/services/mic-games.js`:
```js
import { isOfficial } from './classlive-access.js';
import { config } from '../config.js';
/** Official games whose play page may listen for loudness (a number only; docs/safety.md "Loudness"). */
export const MIC_GAMES = Object.freeze(new Set(['remis-quiet-meadow']));
export const micGame = g => config.micGames !== false && !!g && MIC_GAMES.has(g.slug) && isOfficial(g)
  && g.status === 'published' && !!g.published_version_id && !g.hidden_reason;
export const MIC_POLICY = 'camera=(), microphone=(self), geolocation=(), payment=(), interest-cohort=()';
```
- `isOfficial` (classlive-access.js:37) requires `source === 'seed'` and the owner `OombaAcademy`. A user game cannot
  pass it with a copied file, a similar title or a slug like `remis-quiet-meadow-2`.
- `config.micGames`: `MIC_GAMES=0` turns the gate off site-wide (owner kill switch). The game then shows its demo mode.
  Add it to `server/config.js` next to the STT settings, and to the env docs.
- `server/routes/games.js` `/play/:slug`, just before `page(...)` (around line 318): `const mic = micGame(g) && !inMatch;
  if (mic) res.set('Permissions-Policy', MIC_POLICY);` and add `...(mic ? { mic: true } : {})` to `page-data`.
  **Nothing else changes.** The iframe template keeps `allow="fullscreen; autoplay"`, and `/frame/:token`/`sendFrame`
  keep `microphone=()`.

### A.4 The page side (site code, outside the sandbox)
New `public/js/loudness.js`. It has no imports, so `node --test` can import it directly. It holds:
- `rmsDb(samples)`, pure: it removes the DC offset (subtracts the mean) and returns
  `20·log10(sqrt(mean(x²)) + 1e-9)`, clamped to −100…0 and rounded to 0.1. `bytesToFloat(u8)` is a fallback for
  `getByteTimeDomainData` on old Safari.
- `createListener({ onLevel, onState })` returns `{ start(), stop(), active() }`:
  - `start()`: `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`.
    Then `new AudioContext()`, `createMediaStreamSource(stream)`, and an `AnalyserNode` with `fftSize 2048` and
    `smoothingTimeConstant 0`.
  - **The analyser is connected to nothing else.** It never goes to `ctx.destination`.
  - Every 50 ms (setInterval) it calls `onLevel(rmsDb(buf))`.
  - Errors map to states:
    - `NotAllowedError` or `SecurityError` → `denied`
    - `NotFoundError` → `nodevice`
    - `NotReadableError` → `busy`
    - no `mediaDevices` → `unavailable`
  - If `ctx.state !== 'running'` 600 ms after the stream starts (an iPad that did not pass on the tap), the state is
    `needsTap`. The page then shows its own "🎤 Tap to start listening" button over the stage, and a tap calls
    `ctx.resume()`.
  - `stop()` calls `track.stop()` on every track, closes the context, clears the interval and drops every reference.
  - No MediaRecorder, no buffers kept, nothing stored, nothing sent.

Changes in `public/js/play.js` (dynamic `import('/js/loudness.js')` only `if (d.mic)`):
- `TYPES['brb:loud'] = m => ['hello','start','stop','keep'].includes(m.op)`.
- `case 'brb:loud'`:
  - Without `d.mic`, answer `toFrame({type:'brb:loudState', state:'off'})` and do nothing else.
  - `hello`: answer `ready`.
  - `start`: act **only if `tappedJustNow()`/`navigator.userActivation.isActive`**, so the mic only starts after a real
    tap. Otherwise answer `needsTap`.
  - `keep`: renews a 6 s lease.
  - `stop`: stops the mic.
- Levels go out as `toFrame({type:'brb:level', db, h})`. `h:1` means a held level: while play.js is playing an AI-voice
  line (`gameLine`) and for 400 ms after it.
- **The mic is stopped** on:
  - `brb:loud stop`
  - a missed lease (6 s without `keep`: the game froze or went somewhere else)
  - `visibilitychange` hidden
  - `pagehide`
  - any frame `load` after the first (a reload or a pinned frame, play.js line 27)
  - `stopGame()`
- **A visible, site-made indicator** sits inside `#stage`, so fullscreen shows it too: a pill "🎤 Listening · Stop"
  with `role=status`. Its Stop button stops the mic and tells the frame `off`. It also sets
  `document.documentElement.dataset.mic = 'on'|'off'` (e2e reads this; it is not a test-only hook).
- New site locale keys: `js.play.mic.listening`, `js.play.mic.stop`, `js.play.mic.tap`, `js.play.mic.stopped`.

### A.5 The SDK (`public/sdk/brb-sdk.js`), the only frame-side change
Add a `// ---- Loudness (BRB.loudness) ----` block next to Polls (line 285). It follows the same pattern: listen only to
`e.source === parentWin`, and accept only `brb:loudState`/`brb:level` with a numeric `db` in −100…0.
- `BRB.loudness.start()` → Promise of a state: `'on' | 'denied' | 'nodevice' | 'busy' | 'unavailable' | 'needsTap' |
  'off'`. It sends `hello` first; no answer within 800 ms means `off` (Studio preview, admin preview, covers, snapshot,
  Live and kit demo pages never answer). Then it sends `start`, and sends `keep` every 2 s while on.
- `BRB.loudness.stop()`, `BRB.loudness.on(fn(db, held))` → off, and `BRB.loudness.state`.
- It is documented in docs/sdk.md **outside** the `builder:api` markers: it is for official games, so the Builder is
  never told about it. For any other game it answers `off`, because the page refuses. Even a page bug could not turn
  the mic on there, because that page's header is `microphone=()`.
- Check that `tests/unit/sandbox-lockdown.test.js` / `live-frame.test.js` / `three-frame.test.js` still pass. The SDK is
  inlined, so the frame bytes change for every game. Nothing pins the SDK's hash; confirm with `grep -rn "brb-sdk" tests/unit`.

### A.6 CSP and Permissions-Policy summary
- Site CSP (`app.js:54`): nothing changes (capture and Web Audio are not CSP-governed; `/js/loudness.js` is `'self'`).
- Frame CSP, sandbox and Permissions-Policy: **nothing changes.**
- `/play/remis-quiet-meadow` only: `microphone=(self)`. Every other route keeps `microphone=()`. The Studio keeps its own
  rule.
- `X-Frame-Options: DENY` on the play page means no other site can frame it and borrow its mic permission.
- The permission prompt names oomba.ai, the trusted origin. Teachers allow it once per browser.

### A.7 docs/safety.md
Update the mic paragraph at line 172 ("allowed on the Studio page only") to say:
- The mic is also allowed on the play page of one official game, Remi's Quiet Meadow.
- There, the page measures loudness on the device and passes only a number to the game.
- Audio is never recorded, stored or sent.
- The game frame still never gets the mic.
- The scanner still fails any game that asks for it.

Also add a "Loudness" subsection to the SDK section.

---------------------------------------------------------------------------------------------------------------------

## B. Official-game wiring (the same checklist as Tug of Math, docs/tug-of-math-plan.md §0.1)

- `seed-games/remis-quiet-meadow.html` (the game) and `.json`:
  - `slug`, `title: "Remi's Quiet Meadow"`, `icon: '🤫'`, `cover: 'meadow'`, `category: 'learning'`
  - `tags: 'noise meter,classroom noise,quiet,voice level,sound level,calm,classroom management,teacher tool,red
    panda,brain break,class'`
  - `description` (what it does, plus "nothing is recorded"), `orientation: 'any'`, `players_max: 1`,
    `age_rating: 'everyone'`, `featured: true`
  - `notes`: the kit version, no packs, the storage key, the test hooks, the loudness bridge, and "audio never leaves
    the device"
  - `l10n` for the 12 other locales. en-GB only where the wording differs. Remi stays "Remi" in every language; record
    this in `server/i18n/notes.json`.
- `scripts/seed.js` `SEED_GAMES`: append `'remis-quiet-meadow'`.
- `tests/unit/scanner.test.js:12`: append the slug to the "seed games pass" list.
- `tests/unit/tts-lines.test.js:96` list, and `server/services/tts-lines.js` GAMES:
  `'remis-quiet-meadow': { title: "Remi's Quiet Meadow", role: 'friendly', spoken: /^(?:title|howto|goal|end|calib)/ }`.
  This is required by tts-coverage.test.js. Speech is used only on the title, the how-to, calibration and the end
  screen, never while listening. Its playback is held anyway (A.4).
- `server/learn.js`:
  - `LEARNING['remis-quiet-meadow'] = { key: 'remisQuietMeadow', teaches: ['Self-regulation', 'Voice levels',
    'Classroom routines'], level: 'Grades K-8' }`.
  - Append it to `TEACHER_GAMES` (the teacher page "Play to learn" cards).
  - No subject hub and no age pages: it is a class tool, not a subject game.
  - Bump `CONTENT_UPDATED`.
  - Locale key `learn.games.remisQuietMeadow` in all 13 files. The teacher-page FAQ wording is unchanged.
- Covers: `scripts/covers/remis-quiet-meadow.recipe.js` (the Tug pattern: viewport 1280×720, touch).
  - `prep`: Play, then `__brbTest.demo(true)`, `__brbTest.pose('asleep')`, `__brbTest.level(28)`, and wait for 2 Zzz.
  - Then run `BRB_DB=:memory: BRB_SILENT=1 node scripts/covers.js remis-quiet-meadow` and `node scripts/og-images.js`.
  - Commit `public/covers/remis-quiet-meadow.jpg` and `public/og/remis-quiet-meadow.jpg`.
  - The covers server builds frames with no play page, so the game is in demo mode there, which is what we want.
- `tests/e2e/seeds.spec.js` SEEDS: append `['remis-quiet-meadow', "Remi's Quiet Meadow"]`.
- Locales: run `scripts/i18n-add-remi.mjs` (modelled on the Tug/live scripts) for `learn.games.remisQuietMeadow` and
  `js.play.mic.*` in 13 files, add translator notes, then `npm run i18n:check`.
- `docs/decisions.md`: a "Remi's Quiet Meadow (Nov 2026)" entry covering the mic decision and the test evidence,
  originality, the levels and states, and child safety. Update `docs/sdk.md` and `docs/safety.md` too.

---------------------------------------------------------------------------------------------------------------------

## C. The game (`seed-games/remis-quiet-meadow.html`)

**Structure:**
1. The kit tag `kitTag('1.1.3')`, exactly as tug-of-math.html line 1 of its scripts. No packs.
2. `<script>` 1 is `window.RemiCore`, between `/* remi-core:begin */` and `/* remi-core:end */`. It is pure ES5 with no
   DOM, and it holds the level math, calibration, the state machine, scoring and stars. Unit tests load it with node:vm.
3. `<script>` 2 is the game: the I18N block (`// ==== I18N START/END ====`, 13 languages), the SVG scene and the Remi
   rig, the animator, the synthesized sounds, the screens and the test hooks.

`Oomba.game({ api:1, title, controls:'none', camera:'fixed', hud:[], dress:'off', theme:'meadow', intro: setupCard })`
works as in Tug of Math: the kit title shows over our own sunset scene with Remi already asleep behind it. `intro` shows
the setup card. The kit stage is a quiet backdrop, and our SVG fills the screen. The results card is `Oomba.ui.win({
stars, title, next:false })` over our happy-Remi scene.

### C.1 Level math (RemiCore, unit-tested)
- **Input:** `db` (dBFS) from the page, or the demo slider/clap (which sets `level` directly).
- **dB to level:** `level = clamp((db − (−70)) / 60 · 100, 0, 100)`. That puts −70 dBFS at 0 and −10 dBFS at 100,
  linear in dB, so the gauge feels like loudness.
  - With no auto gain, typical readings are: a quiet room about 20–30, talking about 50–60, shouting over 85.
  - Calibration takes care of mic differences.
- **Smoothing:** an asymmetric exponential moving average using real `dt`: `a = 1 − exp(−dt/τ)`.
  - Attack τ = 0.12 s, release τ = 0.5 s.
  - The meter shows the smoothed level plus a peak tick that falls 25 units a second.
  - **A single clap does not wake Remi:** smoothing plus the 1.5 s rule turn it into at most a stir.
- **Line:** `line = clamp(base + margin[preset] + fine, 15, 95)`.
  - Presets (how quiet the class should be): Whisper margin 10, Quiet work 18, Group work 30.
  - `base` is the calibrated room baseline. Uncalibrated it is 30, which gives Whisper 40, Quiet work 48, Group work 60.
  - `fine` is a slider from −25 to +25.
- **Calibration** ("Set to the room's quiet"): collect 3 s of smoothed levels (about 60 samples) and set `base = median`.
  - If the median is above 70, report `tooLoud` and keep the old base.
  - If no samples arrive (no mic), report `noInput`.
  - Show a progress ring with "Shh… listening to the room (3)". The result shows as "Room: 24 · Line: 42".
- **Sensitivity** is the same thing seen from the other side: a teacher who finds Remi too touchy moves the slider.
  The meter's line moves live as they do.

### C.2 Remi's state machine (RemiCore.step, unit-tested)
`RemiCore.make(opts)` returns a state. `RemiCore.step(s, { level, line, held, dt, rnd })` returns `{ s, events: [...] }`.
The steps are deterministic with `rnd`.

| State | Enter when | Quiet clock | What happens |
|---|---|---|---|
| `asleep` | start, after settling | **runs** | breathing, Zzz. The leaky `over` counter goes down at 0.5×dt |
| `stirring` | level > line − 10 for 0.3 s, or `over > 0` | **runs** (still asleep) | a cooldown of 2.5 s picks one micro-action: `ear`, `tail`, `peek` (one eye opens a crack), `murmur` (a soft sound). Back to `asleep` after 1.2 s below line − 10 |
| `waking` | `over ≥ 1.5 s` (`over += dt` when level > line; leaky down otherwise, so noise that is on about 70% of the time still wakes him) | stopped | `wakes++`, event `wake`. A fixed 2.8 s sequence: sit up (0.6) → stretch and yawn (1.4, *yawn* sound) → "Too loud!" (0.8, *grumble* sound). It cannot be interrupted |
| `grumpy` | after `waking`, or noise during `settling` | stopped | hands over ears while level > line, arms crossed and a tapping foot when lower. The eyelids droop as `calm` grows (the class *sees* him getting sleepy). `calm += dt` while level < line − 5, reset otherwise |
| `settling` | `calm ≥ 4 s` | stopped | small yawn → turn → flop down (2.0 s). Noise (`over ≥ 0.6`) sends him back to `grumpy`, **with no extra wake** |
| `celebrate` | quiet clock ≥ goal (checked in `asleep`/`stirring`) | done | a gentle wake → stand with arms wide → confetti → results. Event `goal`, once |
| `paused` | pause, Space, page hidden, mic lost | frozen | the mic stops (`BRB.loudness.stop()`). Resume calls `start()` again |

- When `held` is set (Remi's own sound + 400 ms, or the page's AI voice), the counters do not change and the meter
  shows "🔇 Remi is talking" dimmed.
- **Stars:** 3 for 0–1 wake, 2 for 2–3 wakes, 1 for more.
- **Session lengths:** 2, 5, 10, 15, 20 or 30 minutes of *quiet time*, plus "No goal" (free run with no end).

### C.3 Scene and Remi (original art; inline SVG, `viewBox 0 0 1600 900`)
**Scene layers:**
- the sky gradient: peach → coral → lavender, with a low sun and two soft clouds
- 3 hill bands
- the grass, with tufts and swaying blades
- daisies and poppies
- a few fireflies and stars for the dark look (`.ok-night` gives a dusk palette)

The scene is drawn with `preserveAspectRatio="xMidYMax slice"`, so it fills any ratio. Remi sits in a safe zone that
stays clear of the meter and the top bar.

**The Remi rig** is named `<g>` parts with their pivot points:
- `root`, `body` (round, chubby), `belly` (cream)
- `head`: a big round head with a cream face mask, two Oomba ink dot-ring eyes with lids, `mouth` variants (`sleep`,
  `o`, `yawn`, `grr`, `smile`) and blush
- `earL`/`earR`: rounded triangles with white tufts
- `armL`/`armR` and `legL`/`legR`: short and dark russet
- `tail`: 5 segments with dark rings, each segment rotated so the tail curls and flicks
- `scarf`: 3 leaves knotted at the neck, with two tails that flutter

**Style:** kit ink outlines (`var(--ok-edge)`, about 6 px at 1600 wide), flat fills with one shade tone, and no
gradients on the character. The palette is our own: fur `#E0662A`, shade `#B8471D`, cream `#FBE7C6`, limbs `#5A2E1E`,
leaf `#5DB548`/`#3E8E3A`.

**Not used:** no Turning Red cues such as the big eye shines, the humanlike hair tuft or the outfit.

**Animator** (our own rAF):
- Poses are plain number sets: root x/y/rot, body squash, head rot/y, ear angles, arm and leg angles, tail curl and
  flick, lid opening on each side, mouth.
- Transitions blend between poses with easeInOut, plus spring-damped secondary motion on the ears, tail and scarf. That
  makes it feel alive, not like an image swap.
- Breathing is a sine overlay at 0.25 Hz (body scaleY ±3%). Zzz glyphs float and drift. A tiny "!" shows on a stir.
- The "Too loud!" bubble pops in with squash.
- **Reduced motion** (the kit setting or `prefers-reduced-motion`): no particles, sway, squash or confetti. Poses
  cross-fade in 300 ms, and the state is still clear from the pose and the face.

### C.4 Sounds (WebAudio in the frame, created on the Start tap, following the kit sound setting)
- **Yawn** (1.3 s): a sawtooth glottal source from 330 to 210 Hz, through two bandpass formants that sweep from "ah" to
  "oh", plus a breathy noise layer and a soft envelope.
- **Grumble** (0.8 s): two "hmph" syllables, 150–180 Hz with an 18 Hz tremolo, low-passed at 900 Hz.
- **Murmur** (0.35 s): a quiet "mm" sine at 260→230 Hz.
- **Lie down:** a soft sigh.
- **Happy end:** `Oomba.sfx('win')` plus a cheerful chirp.
- Every sound sets `held` for its length + 400 ms (C.2). Nothing plays while Remi sleeps, because a snore would feed
  the mic.

### C.5 Screens and layout
- **Setup card** (DOM in `Oomba.ui.root()`, radiogroups, keys of at least 48 px, Start always in view):
  - How quiet: Whisper / Quiet work / Group work, plus the Fine slider
  - Goal: 2 / 5 / 10 / 15 / 20 / 30 min / No goal
  - "Set to the room's quiet" button
  - the privacy note **"Remi only listens for how loud it is. Nothing is recorded or saved."**
  - Start listening (the tap that asks for the mic)
  - Saved in `BRB.storage` key `remis-quiet-meadow-v1` = `{ preset, fine, goal, base }`: numbers and ids only.
- **Play layout:**
  - **Landscape**, which covers the 16:9 projector (1920×1080), a laptop and a tablet on its side: the scene fills the
    screen. A vertical gauge sits on the right edge, inside the safe area. The top bar has the big "Quiet time 03:12 /
    10:00", "Woke up: 2" and the pause and settings buttons.
  - **Portrait** (a phone or tablet held upright): the gauge becomes a horizontal bar above the bottom safe area.
    Remi is centred.
  - The clock is at least 7vh tall on the projector.
- **Gauge:**
  - The colour bands run calm green → yellow → red. Each zone also has an icon (😴 / 🤫 / 🙉) and a stripe pattern, so
    colour is never the only cue.
  - The "Too loud" line has a label and a bell icon. Around the line there is a near band.
  - The current level bar has a peak tick. In demo mode the slider sits on the gauge.
- **No mic** (`denied`/`nodevice`/`busy`/`unavailable`/`off`):
  - A friendly card explains why, with steps for that state. For `denied`: "Tap the 🔒 or 🎤 next to the web address,
    choose Allow for the microphone, then Try again". For `off`: "This page can't use a microphone", which is what the
    Studio and admin previews show.
  - The card has **Try again** and **Try it without a mic**.
  - **Demo mode:** a big "Noise" slider, a 👏 Clap button (a level spike of 0.4 s), and a "Class chatter" toggle
    (random noise around 55). Remi reacts the same way. A "Demo" ribbon stays on screen.
- **Pause:** our button, Space or P/Esc. It shows the kit pause screen with Resume / Teacher settings / Start over. The
  mic is off while paused.
- **Settings:** the kit panel (sound, less motion).
- **Accessibility:** `role=status` announces state changes ("Remi woke up!", "Remi is asleep again", "Quiet time 5
  minutes"), throttled. The gauge has `role=meter` with aria-valuenow and aria-valuemax=100, plus a label giving the line.
- **RTL:** the page `dir` comes from `O.dir`, and the menus and top bar are mirrored. The scene and gauge side stay the
  same.
- **I18N:** every string, in 13 languages, inside the I18N block. Numbers and the clock go through `O.num`.

### C.6 Test hooks (`window.__brbTest`)
- `state()` → `{ screen, remi, wakes, quiet, goal, line, level, held, mic, demo, preset, stars }`
- `demo(on)`, `level(v)` (forces the input level), `setGoal(sec)`, `step(ms)` (advances the core and the animator in
  fixed steps), `pose(name)`, `skipAnimations()`, `calibrate(samples[])`, `sounds()` (a log of own-sound events, for
  e2e)

---------------------------------------------------------------------------------------------------------------------

## D. Child safety checklist

- **Audio is never recorded, stored, uploaded or sent.**
  - The only output is a dBFS number. It goes from the page to the frame by postMessage. The frame has `connect-src
    'none'` and no network.
  - We never use MediaRecorder; a unit test greps loudness.js, play.js and the game file for it.
  - The analyser is never connected to the speakers.
- **Nothing about the level is stored.** Storage holds only the teacher's settings (numbers). There is no score
  submission: on a goal we send `BRB.gameOver({won:true, score:null})`, which only feeds lesson "end" tracking.
- **The mic starts only after a real tap.** It stops on pause, hide, leave, reload and a lost lease. The page shows its
  own Listening/Stop pill, as well as the browser's indicator.
- **No accounts, no data, no kid text, nothing to buy.** Speech reads only the game's own lines.

---------------------------------------------------------------------------------------------------------------------

## E. Tests

**Unit** (`TMPDIR=/tmp/bx npm test`):
1. `tests/unit/remis-quiet-meadow.test.js`. It loads RemiCore from the html with vm (as in tug-of-math.test.js) and
   checks:
   - **dB → level:** −70 gives 0, −10 gives 100, a clamp at both ends, and a monotone curve.
   - **Smoothing time constants:** a step input reaches 63% in about τ for attack and for release.
   - **Calibration:** the median plus the preset margin, the 15/95 clamps, `tooLoud` when the median is over 70, and
     `noInput`.
   - **State machine scenarios:**
     - silence keeps Remi asleep and the clock counts
     - a 0.2 s clap gives at most `stirring`, wakes 0
     - 1.6 s over the line gives one `wake` event
     - on/off noise at 70% duty for 3 s wakes him
     - noise while `held` is ignored
     - `grumpy` plus 4 s calm gives `settling`, then `asleep`
     - noise during `settling` gives `grumpy` with no extra wake
     - the quiet clock never counts while waking, grumpy or settling
     - the goal fires `celebrate` once
     - stars 3/2/1
     - "No goal" never ends
     - the same steps always give the same result
   - **I18N:** every key in 13 languages and the placeholders match.
   - **Scan:** `scanVersion(html).status === 'pass'`.
   - **The html has no `getUserMedia`, `MediaRecorder` or `mediaDevices`.**
   - **JSON:** the fields and l10n.
2. `tests/unit/loudness.test.js` imports `public/js/loudness.js`:
   - **`rmsDb`:** zeros give −100, a full-scale sine gives about −3.0, a DC offset is removed, the byte fallback works,
     and values are rounded to 0.1.
   - **The listener with a fake `navigator.mediaDevices` and AudioContext:**
     - the analyser is never connected to the destination
     - `stop()` stops every track and closes the context
     - errors map to the states
   - **The file has no MediaRecorder, fetch or WebSocket.**
3. `tests/unit/mic-scope.test.js`, with a real app and the same harness as stt.test.js:
   - **The Remi play page:** `/play/remis-quiet-meadow` sends `permissions-policy` with `microphone=(self)` and
     `page-data.mic === true`. Its iframe still has exactly `sandbox="allow-scripts allow-pointer-lock
     allow-orientation-lock" allow="fullscreen; autoplay"`.
   - **Its frame is unchanged:** `/frame/<token>` for Remi still sends `microphone=()` and the same CSP as any other
     frame (`frameCsp`, sandbox with no `allow-same-origin`).
   - **Other games get nothing:** `/play/tug-of-math`, `/play/sum-racer` and `/g/remis-quiet-meadow` have
     `microphone=()` and no `mic` in page-data.
   - **Look-alikes get nothing:**
     - a user's public game whose html is **a byte copy of Remi's**
     - a user game titled "Remi's Quiet Meadow" with slug `remis-quiet-meadow-2`
     - a game with `source='seed'` that the official account does not own (forced in the DB)
     - the Remi game once it is hidden or unpublished
     - Remi in an online match (`?match`)
   - **The kill switch:** with `MIC_GAMES=0` (`config.micGames=false`) Remi itself gets `microphone=()`.
   - **Static checks:**
     - no `allow=` attribute in server/routes, public/js or services contains `microphone`
     - `SANDBOX` is unchanged in both frame.js and live-common.js
     - `scanVersion` still fails `navigator.mediaDevices.getUserMedia(...)` and its obfuscated forms, even inside a
       copy of Remi's html: the rule has no slug exemption
     - studio.js, live-common.js, live-host.js and live-play.js never handle `brb:loud`
   - **play.js validation:** `validMessage` accepts `brb:loud` only with a known op. A `start` while `!d.mic` answers
     `off`; checked with jsdom, or by testing the exported pure `loudDecision(d, m, activeTap)` helper.
4. Update `scanner.test.js`, `tts-lines.test.js` and (implicitly) `tts-coverage.test.js`. Run the SDK tests
   (`sandbox-lockdown`, `live-frame`, `three-frame`, `params`, `voice`) after the SDK change.

**e2e** (`tests/e2e/remis-quiet-meadow.spec.js`; `TMPDIR=/tmp/bx E2E_PORT=… BRB_SNAPSHOTS=1 BRB_CHROMIUM=… npx
playwright test tests/e2e/remis-quiet-meadow.spec.js --trace off`):
1. **Demo run (default browser, no mic permission):**
   - Open `/play/remis-quiet-meadow`, the title, Play, then the setup card.
   - Start listening gives the no-mic card (denied or unavailable), then "Try it without a mic".
   - With the slider low, the quiet clock ticks.
   - The slider high for 2 s: Remi `waking` → `grumpy`, wakes = 1, and `sounds()` logs yawn and grumble.
   - The slider low: after 4 s, `settling` → `asleep`.
   - A 👏 clap: a stir, no wake.
   - Space pauses and resumes.
   - `setGoal(3)` leads to `celebrate` and the results card with stars. No page errors.
2. **The real mic path:** its own `chromium.launch` with `--use-fake-device-for-media-stream
   --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>` (the studio-mic.spec.js:174 pattern).
   - Before the test, write the WAV to `os.tmpdir()`: 4 s of quiet noise at about −65 dBFS, then 3 s of a 440 Hz
     tone at about −12 dBFS, then 10 s of quiet. Chromium loops it.
   - Check the steps:
     - Start → `html[data-mic="on"]` and the Listening pill
     - "Set to the room's quiet" during the quiet part sets a base under 40
     - Remi wakes within about 8 s, then falls asleep again
     - Pause → `data-mic="off"`
     - Resume → on
     - a forced `visibilitychange` hidden → off
     - the pill's Stop → off, and the game shows its paused state
     - leaving the page → no errors
2b. **Only Remi gets the mic:** in the same fake-mic browser, open `/play/tug-of-math`.
   - Run `navigator.mediaDevices.getUserMedia({audio:true})` inside the frame. It rejects (SecurityError).
   - Post a forged `{brb:1,type:'brb:loud',op:'start'}` from the frame. The page stays `data-mic` off and the frame
     gets `off`.
   - On the top page, `getUserMedia` rejects (NotAllowedError) because the header is `microphone=()`.
3. **Layout:** run `frameProblems` empty and `pageScrollsSideways` false at 390×844, 844×390, 820×1180, 1180×820,
   1280×800 and **1920×1080**. Check the setup card, asleep, grumpy and results (demo mode), plus `he` (RTL) and dark.
4. **Covered elsewhere:** `seeds.spec.js` (it loads, the h1 shows, it is in Home #featured). `games-fit.spec.js` picks
   the game up from SEED_GAMES: after Play it shows the setup card, and the mic is not asked for until Start.

---------------------------------------------------------------------------------------------------------------------

## F. Step order
1. Write `RemiCore` (level, calibration, state machine) in the html, with `remis-quiet-meadow.test.js`.
2. The page bridge: `mic-games.js`, the games.js header and page-data, `loudness.js`, play.js, and the SDK
   `BRB.loudness`. Then `loudness.test.js` and `mic-scope.test.js`, and the SDK test suite.
3. The scene and Remi rig (SVG, poses, animator, reduced motion), the sounds, the gauge, setup, the no-mic and demo
   screens, I18N (en first, then all 13), storage, test hooks. Take screenshots at phone, tablet and 1920×1080 with
   Playwright and look at every state.
4. Seed json, SEED_GAMES, the scanner list, tts-lines, learn.js, locales (`npm run i18n:check`) and notes.json.
5. e2e spec, then games-fit and seeds runs.
6. Covers, OG, then docs (decisions, safety, sdk).
7. Full `TMPDIR=/tmp/bx npm test`. The only failures allowed are the known ones listed in the task; check any other
   against a clean origin/main worktree. Commit with the exact footer. Do not push.

## G. Risks and notes
- **iPad Safari and the tap:** if the tap in the frame does not reach the page there, the page's "Tap to start
  listening" button covers it (`needsTap`). Test it by hand on a real iPad before release; e2e cannot.
- **Speakers next to the mic** (projector audio): the `held` window covers Remi's own sounds. Keep the sounds short and
  never let them overlap the sleep state.
- **Mics differ widely** with auto gain off: calibration is on the setup card, with the result shown as numbers.
- **Kit blur pause:** with `hud: []` the kit has no `hudPause`. Still, its own loop pauses on blur. Our rAF and
  `RemiCore` must not depend on `kit.loop`. Check by clicking the playbar during e2e.
- **The SDK change** alters every frame's bytes. Run all frame and SDK tests, `live.spec`, and one 3D game spec.
- **seo, teachers and parents tests** check list orders: append to TEACHER_GAMES, never put it first. Grep the tests
  for `TEACHER_GAMES` before finishing.
