# CS Quest: building new official 2D games on Oomba Academy — engineering map

Read-only survey of `/home/user/javascript-exercises` (branch `wyr-react-contrast` at `dd603ce`, 3 Nov 2026).
Every claim below was read from the code or docs named; line numbers are from that checkout.

Scope: what an engineer needs to add **new official 2D games** (Robo Route, Data Detective, Packet Post, Inside the
Machine), the live sets, the Would You Rather (Live) "tech choices" set and the lesson/teacher plumbing around them.

---

## 0. Orientation (read this first)

| Thing | Where | One line |
|---|---|---|
| An official game | `seed-games/<slug>.html` + `seed-games/<slug>.json` | One self-contained HTML document (no doctype/html/head/body: the frame wraps it) plus a metadata JSON. Imported on every boot by `scripts/seed.js`. |
| The 2D engine | Oomba Kit **1.1.2** (`kit/src`, built to `public/vendor/oomba-kit/1.1.2/`) | Loaded by one exact pinned `<script>` tag (SRI + `crossorigin="anonymous"`), plus optional pack tags. API reference: `docs/kit-api.md` (kept equal to the code by `tests/unit/kit-api.test.js`). |
| The platform SDK | `public/sdk/brb-sdk.js` (inlined, unversioned, frozen) | `window.BRB`: user/lang/dir, storage (cloud save), score, gameOver, sfx, fx, speak, poll, live, match, retry. `docs/sdk.md`. |
| The sandbox | `server/services/frame.js`, `server/services/scanner.js`, `server/services/sanitize.js` | Opaque-origin iframe, `connect-src 'none'`, every version statically scanned (pass/flag/fail). `docs/safety.md`. |
| QA | `tests/unit/*.test.js` (node:test), `tests/e2e/*.spec.js` (Playwright), `scripts/games-fit-audit.js` | Seed games have per-game unit tests, a scan test, a smoke e2e and a 5-size layout audit. |
| Reference games to copy from | `seed-games/would-you-rather.html` (kit stage + DOM cards, 128 KB), `server/builder/templates/quiz.html` (16 KB, `Oomba.game` with `controls:'none'`), `seed-games/word-peek.html` (DOM game in `Oomba.ui.root()`), `seed-games/sum-racer.html` (hand-drawn canvas with kit helpers), `seed-games/code-isle.html` (coding mechanics; 3D on three.js) | Pick the pattern per game: see §2.8. |

Key decisions that constrain CS Quest (`docs/decisions.md`):
- "3D worlds are the Builder's own; the Oomba Kit is for 2D" (line 2045): **new 2D official games go on the kit**; 3D games don't use it (Gulp City, line 2078). CS Quest games are 2D, so: kit.
- "Tablets are a required check for every game" (line 2002): the 5-size fit audit must pass, title screen and in play.
- "Brain Board, and fun games kept out of class rooms" (line 1938): `NOT_FOR_CLASS` exists for games teachers must not host; learning games are not on it.
- "Game data packs" (line 1810): big reviewed data (per-language) goes to `public/vendor/data/<game>/<version>/` and is loaded with an SRI script tag, so the game file stays small and each player downloads one language.
- "Game polls" (line 2013): `BRB.poll` for official games on an allowlist (`server/services/polls.js:8`).
- "Would You Rather and Atlas Quest go live" (line 2180): the pattern for a live mode whose questions the server makes (`OWN_QUESTIONS`).

---

## 1. How an official seed game is defined and shipped

### 1.1 Files

- `seed-games/<slug>.html`: the game document. Must start with `<title>`; no `<!doctype>`/`<html>`/`<head>`/`<body>` (the frame wrapper adds charset, viewport, a CSS reset and the SDK: `server/services/frame.js:52,75`). In practice several seed games do carry a full `<!doctype html><html>` shell (e.g. `would-you-rather.html:1-6`); the browser tolerates the duplicate, and the scanner does not fail on it, but `docs/sdk.md:21` says not to. Under **2 MB** (`server/services/sanitize.js:3 MAX_GAME_BYTES`; scanner `size` fail at `scanner.js:127`).
- `seed-games/<slug>.json`: metadata, read by `scripts/import-game.js`.

### 1.2 Every JSON field (`scripts/import-game.js:12-32`, `server/services/games.js`)

| Field | Used how | Notes |
|---|---|---|
| `slug` | `games.slug`; the URL `/g/<slug>`, `/play/<slug>`, cover `public/covers/<slug>.jpg`, OG `public/og/<slug>.jpg` | Must be unique; `createGame` keeps it only if free (`games.js:344`). |
| `title` | `games.title` (max 60, `META_FIELDS` `games.js:347`) | Also the home card / page `<h1>` (e2e `seeds.spec.js:14` checks it). |
| `icon` | emoji shown in the play bar and on cards (max 8 chars) | |
| `cover` | gradient fallback class when no screenshot exists; **must be one of** `COVERS = ['sunset','ocean','forest','candy','night','lava','mint','gold']` (`games.js:18`). `updateMeta` silently drops any other value (`games.js:354`), so `atlas-quest.json`'s `"sky"` and the live games' `"space"` are ignored (they fall back to the created default `sunset`). Irrelevant once `public/covers/<slug>.jpg` exists (`server/views/components.js:68-74`). |
| `category` | one of `CATEGORIES` keys: `arcade sports puzzle words board adventure learning music silly` (`games.js:12-16`). CS Quest games: `learning`. Drives the `/learn` hub and the OG kicker (`scripts/og-images.js:68`). |
| `tags` | comma string, max 200; searched (`games.js:196`) | |
| `description` | max 600; shown on the game page and cards; searched | English (US). |
| `orientation` | `any \| portrait \| landscape` (`games.js:23`); `landscape` shows the "turn your phone" hint (`routes/games.js:262`) | |
| `players_max` | 1-8; shown as `numberOfPlayers` in SEO and used for pass-and-play games | |
| `age_rating` | stored in `games.age_rating` (default `everyone`) | |
| `featured` | `true` → `featured=1` (home rails, `listVisible({featured})` `games.js:164`) | Live modes use `false`. |
| `hero` | `true` → `featured=2`: the home-page hero (`import-game.js:29`; decision line 615). Only one game should have it (today `code-isle.json:155`). |
| `notes` | first 300 chars become the version note `"Imported. …"` (`import-game.js:25`); the rest is documentation for engineers. Convention: a dense paragraph describing engine, modes, saves key, score calls and `__brbTest` hooks. |
| `l10n` | `{ "<lang>": { "description", "tags" } }` stored as JSON in `games.l10n`; `games.localizeGame` swaps description/tags per page language, search matches it (`tests/unit/game-l10n.test.js`). `Object.keys(l10n)` also decides which language URLs are indexed/SEO'd (`routes/games.js:190 seo.pageLangs`). Live games ship `"l10n": {}`. Provide all 11 non-English locales (+ `en-GB` if wording differs): `gulp-city.test.js:58` asserts every one of `pt fr es de he ja ar ru it zh-Hant nl` has a description. |

Not in the JSON: `NOT_FOR_CLASS` (a code set in `server/services/classlive-access.js:24`, slugs only), live capacity (`classlive-access.js:94 CAPACITY`), polls allowlist (`polls.js:8`), AI-voice listing (`server/services/tts-games.js`), live modes (`classlive-access.js:17 MODES`, `server/live/live-games.js:5`).

### 1.3 Import / seeding / upgrades (`scripts/seed.js`, `scripts/import-game.js`)

- `SEED_GAMES` (`scripts/seed.js:23`) is the ordered list; add the new slug there. **Keep it one array literal with single quotes on as few lines as possible**: `scripts/games-fit-audit.js:16` re-parses it from the file with a regex (`/export const SEED_GAMES = (\[[^\]]*\])/` + `'`→`"`), so a comment or a `]` inside breaks the audit.
- `seed()` runs on every container start (`scripts/entrypoint.sh`, `playwright.config.js:41`) and `npm run seed`. For each slug: `importGame(html, json, official.id)`:
  1. `sanitizeGameHtml` then `scanVersion`; **a `fail` throws and aborts the whole seed** (`import-game.js:17`).
  2. Creates the game (`source: 'seed'`, owner = the official `OombaAcademy` account, `server/auth.js OFFICIAL`) or `updateMeta`s it; stores `l10n`.
  3. Adds a new version **only if the HTML changed** byte-for-byte (`import-game.js:25`); older versions stay in history.
  4. Marks the version `review_status='approved'` and sets `visibility='public', status='published', published_version_id, featured, age_rating` (`import-game.js:27-29`).
- `hidden_reason='retired'` is cleared for official games after import (`seed.js:62`).
- `REPLACED` (`seed.js:27`) hides member games that an official game replaces (once, keyed in `settings`); `tests/unit/replaced-games.test.js`.
- Kit patch upgrades: `scripts/kit-upgrade-seeds.js` rewrites seed files to the patch release in `KIT_PATCHES` (`server/services/kit.js:81`); member games are upgraded at serve time by `upgradeKitPins` (`frame.js:65`). New games should load `KIT_LATEST` = `1.1.2` directly (`kit.js:35`); get the exact tag from `kitTag()` / `kitPackTag(name)` (`kit.js:40-50`) or copy from `would-you-rather.html:218-219`.
- A one-off import: `node scripts/import-game.js seed-games/x.html [x.json] [--owner OombaAcademy]`.
- Live modes also need: `MODES` + `CAPACITY` in `classlive-access.js`, `LIVE_GAMES` in `server/live/live-games.js` (checked against `MODES` by `tests/unit/live-entry.test.js`), a `server/live/<mode>.js` question maker when the platform makes the questions (`OWN_QUESTIONS`), and the landing pickers in `routes/live.js:173` (`wyrPicker`, `atlasPicker`).

### 1.4 Covers (`scripts/covers.js`) and OG images (`scripts/og-images.js`)

- `npm run covers [slug...]` (`package.json`: `BRB_DB=:memory: BRB_SILENT=1 node scripts/covers.js`). It spins a local `http.createServer` per game that serves the real `frameDocument` with `frameCsp(origin)` at `/g`, `/vendor/*` from disk via `snapshot.vendorFile` (kit, three, data packs: `covers.js:211-218`) and a host page with the real `sandbox` attribute; Google Fonts are proxied with `curl` (`covers.js:225-231`). Init is `preview: true, canSave: false`, user `Player` (`covers.js:207`).
- **One recipe per slug** in `RECIPES` (`covers.js:27-196`): `{ viewport, scale?, touch?, async prep(frame, page) }`. Viewports: `PORTRAIT = 360×480` (most games), `LANDSCAPE = 640×480` (ring-rumble), custom for shark-plank/footy. `deviceScaleFactor` defaults to 1.5 (`covers.js:223`); output JPEG quality 78 → `public/covers/<slug>.jpg` (`covers.js:239-240`). No recipe = skipped with a message, so **a new game has no cover until you add a recipe**.
- Recipes drive the game through `window.__brbTest` (e.g. `start({...})`, `skipAnimations()`, `step(n)`, a dedicated `cover()` hook as in `atlas-quest`/`gulp-city`, `covers.js:141-161`) and the kit title button (`play(f)` clicks `.ok-title-screen .ok-hot`, `covers.js:198`). Design your test hooks with the cover in mind: a deterministic seed and a `cover()` that stages a pretty mid-game moment.
- Cards and the game page use `/covers/<slug>.jpg?v=<mtime>` when the file exists (`server/views/components.js:68-74`; decision line 45); Studio games keep gradient art.
- OG/Twitter images: `node scripts/og-images.js` (after covers) renders 1200×630 cards for the site pages and **every slug that has a cover** (`og-images.js:69-73`, kicker from `KICKER[g.category]`, `learning` → "Free learning game") into `public/og/<slug>.jpg`; `routes/games.js:193-194` uses `/og/<slug>.jpg` if it exists, else the cover. Both scripts need Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (or `BRB_CHROMIUM`) and the Bricolage font in `public/fonts/`.
- `tests/unit/seo.test.js:262` fetches `/covers/sum-racer.jpg`; there is no test that every seed game has a cover, but the home/OG pages look broken without one.

### 1.5 Checklists that enumerate seed games (add every new slug)

- `scripts/seed.js:23 SEED_GAMES` (seed + fit audit + covers default list).
- `tests/unit/scanner.test.js:12` and `tests/safety/scanner.test.js:91` ("seed games pass") hard-code slug lists.
- `tests/e2e/seeds.spec.js:5 SEEDS` (loads in the sandbox + shows on Home `#featured`: needs `featured: true`).
- `scripts/covers.js RECIPES`, then `scripts/og-images.js`.
- Optional: `server/routes/games.js LEARNING` / `isLearningGame` (structured-data `teaches`/`educationalLevel`), `server/routes/teachers.js` `/learn` hubs.

---

## 2. The Oomba Kit (2D)

### 2.1 Version, tag, SRI, patches

- Current: **1.1.2** (`kit/src/index.js:34 VERSION`, `server/services/kit.js:35 KIT_LATEST`). Shipped versions are locked in `kit/SHIPPED.json` (1.0.0, 1.0.1, 1.1.0, 1.1.1, 1.1.2) with every pack hash; `tests/unit/kit-platform.test.js:48-56` fails if a locked hash or file changes, and `scripts/build-kit.js:194-195` refuses `--replace` on a shipped version. **Any kit change = a new patch folder** (bump `VERSION`, `node scripts/build-kit.js`, add to `KIT_VERSIONS`/`KIT_PACKS`, later to `SHIPPED.json`).
- Load exactly (`kit.js:40-50`):
  ```html
  <script src="/vendor/oomba-kit/1.1.2/oomba-kit.js" integrity="sha384-AmMbwWGTsxIxVi7l6ccbsROlhaqKEr8dP6sisHytkqLuCwTd/sMLTZyFBpp+J1Q1" crossorigin="anonymous"></script>
  <script src="/vendor/oomba-kit/1.1.2/packs/dress.js" integrity="sha384-JZ2+9mOMVNO4iOIJ8Geoa/9ryqx6ygcPzCxDnZ1XmwOKuMJSCM3llSYH2L4SUAYV" crossorigin="anonymous"></script>
  ```
  Packs come **after** the kit tag, same version, exact attributes only; anything else that names `/vendor/oomba-kit/` fails the scan with `kit_pin`/`kit_tag` (`kit.js:116-156`), and `Oomba.debug` / `Oomba.__pk` in game code is flagged `kit_debug` (`kit.js:152-153`). Packs available in 1.1.2 (`kit.js:19`): `art-animals art-biomes art-biomes-2 art-props art-school bridge-3d dress live style-bold`.
- The kit is a classic IIFE creating `window.Oomba` (alias `OK`) once; it feature-detects `BRB` and never patches it. Size caps (`scripts/build-kit.js:23 SIZE_CAPS`): core 96 KB brotli, packs 8-14 KB; enforced by `kit-platform.test.js:60-70`.
- `<div id="game"></div>` (or your DOM) must come **before** the kit tag (the kit needs `document.body`; `docs/kit-api.md:477`).

### 2.2 Core API surface (exact signatures: `docs/kit-api.md`; design: `docs/kit.md`)

- **Game layer** `Oomba.game(spec)` (`docs/kit-api.md:43-88`, `kit/src/game.js`): spec keys `api:1 title subtitle titleHue titleBadge style dress theme mode biome backend size fit seed controls camera hud howTo strings level hero heroSize titleHero intro setup update testState on stars trySay… countdown autorun`. `controls`: `platformer:kid-easy|snappy|floaty | topdown | tap | none`. Handlers `on.start title collect hit land goal checkpoint spring gate talk door stomp timeup win lose results skip`. World `w`: `spawn find all hero level cell score points got total keys lives hud levelNo levelCount hurt heal win({stars,score,say,title,who,submit}) lose ask say story setHero after every on emit rand cam fx stage theme scene busy ended`. Ends go to `BRB.gameOver({won, score})` automatically (`game.js:645`), test hooks registered automatically (`game.js:677`).
- **Levels** `Oomba.level.grid(rows, legend, {cell})` (`kit/src/level.js:9-13` built-in legend: `# = ~ P G $ H Q ^ B S K L N D k M E i C o`), strictly one char per cell; `Oomba.level.generate`.
- **Stage (level B)** `Oomba.stage({api:1, biome, size:[960,540], fit, backend, seed})` → `add ground update draw camera light setTimeOfDay toNight burst floatText wipe flash transition prebake viewX viewY toWorld view entities destroy` (`docs/kit-api.md:393-412`). Entities: `state mood look pop squash flash wobble float say collect break remove touches add on`.
- **UI (DOM, `docs/kit-api.md:414-428`, `kit/src/screens.js`)**: `Oomba.ui.root()` (the `.ok-ui` layer: append your own DOM here to inherit font, day/night vars, text size, `.ok-rm`), `button(label,{kind:'hot'|'go'|'quiet'|'icon', icon, big, onPress})` (`kit/src/ui.js:106`), `toast announce caption`, `title`(254) `howTo`(272) `countdown`(280) `pause`(291) `win`(308) `tryAgain`(335) `settings`(347) `ask`(375: 2-4 tiles, `a`/`answer` value or `index`, `hint`, `tries`, `who`; keys 1-4) `banner`(438) `bubble`(459) `dialog`(502) `hud`(516: widgets `score lives:N timer:S progress combo count:icon`; binds P/Esc/Start and lost focus to pause) `portrait`. CSS variables on the root (`ui.js:13-15`): `--ok-font --ok-text --ok-card --ok-edge --ok-bg2 --ok-line --ok-focus --ok-scrim --ok-glow --ok-safe-top` (140px: keep your DOM below it) `--ok-ts` (text size); classes `.ok-night`, `.ok-rm`, `.ok-bold`. Buttons: `.ok-btn .ok-hot .ok-go .ok-quiet .ok-icon .ok-big` (≥48 px, 64 on title/results).
- **Input** (`kit/src/input.js`): actions `left right up down jump action pause confirm back`; `Oomba.input.down/pressed/released/axis()`, `pointer`, `on('tap'|'swipe'|'drag'|'flick'|'longpress'|'down'|'up'|'move')` (gestures emitted at `input.js:113-123`, in design units), `map(bindings)` incl. `pad:A`, `touch:A`, `swipe:up`; `touch('stick+jump'|'stick'|'dpad'|'buttons'|'none')` DOM touch controls (`input.js:141`), gamepad standard mapping polled in the loop (`index.js:99-100`), `hold(action, ms)` for tests.
- **Audio** `Oomba.sfx(name,{pitch,pitchVar,volume,at,pan,caption})` (kit voices `pop whoosh correct wrong spark step land select levelup count hurt win gate splash`; SDK names pass to `BRB.sfx`), `Oomba.music('meadow'|'calm'|'off')`, `Oomba.say(textOrKey,{who,vars})` → `BRB.speak` + caption + mouth flap.
- **Time/tween** (`docs/kit-api.md:323-350`): game clock `Oomba.wait/after/every`, `Oomba.tween(target, props, {ms, ease, delay, onUpdate})`, `tween.seq/all/stagger`, `Oomba.spring`, `Oomba.time.hitstop/slowmo/pause/resume`; real clock `Oomba.time.real.*`, `Oomba.tween.ui`. `Oomba.time.start()` runs the clock without a stage. Never `Date.now/setTimeout/setInterval/rAF` in a kit game (stylelint `timing`, `own_loop`).
- **Particles/juice** `stage.burst(preset…)` presets `sparkle dust confetti coins splash smoke hearts fireflies chips sparks`; `Oomba.juice.pop/shake/hitstop/float/burst/confetti/flash` (work on DOM elements too).
- **i18n** `Oomba.t(key, vars)`, `Oomba.strings({en:{…}, ar:{…}})` (register under a prefix so you never shadow kit keys: `wp.`, `sr.`), `Oomba.num`, `Oomba.units`, `Oomba.lang`, `Oomba.dir`; the kit's own chrome is in all 13 languages; `kit.i18n` seeds from `BRB.user.lang` (`index.js:66`).
- **Save** `Oomba.save.define({v, defaults, migrate})/get/set` → one key `__ok_save`, **32 KB cap** (`kit/src/save.js:3`), batched per frame. For anything bigger or your own key use `BRB.storage` directly (450 KB per game per player, `brb-sdk.js:400`).
- **Settings** `Oomba.settings` (`kit/src/settings.js:3-6`): `motion auto|reduce|full, captions, readAloud, textSize 1|1.25|1.5, speed .5|.75|1, assist none|hearts|nofail, contrast, cvd, leftHanded, graphics auto|simple|fancy, music`; `.reduced`, `.on('change')`. Saved under `__ok_settings` via `BRB.storage` (per game, not cross-game).
- **Test hooks** (`kit/src/testhooks.js`): `__brbTest.state()` (merged: `game scene tier backend kit theme lang dir reduced` + yours), `step(n)` (n fixed 1/60 s updates with a frozen clock; deterministic), `seed`, `frameStats`, `setTier setBackend setTheme setLang`; `Oomba.test({state, start, win, skip})` adds `start/win/skip`. Existing keys are never replaced, so `Object.assign(window.__brbTest, {...})` after the kit keeps both (pattern from the pilots, `docs/kit.md:1105`).
- **Art** `Oomba.char Oomba.avatar()/me() Oomba.icon(name) Oomba.icons Oomba.art.toCanvas(nameOrSpec, px, variant) Oomba.art.species/props/biomes…`, `Oomba.color(role, step)`, `Oomba.tokens`, `Oomba.theme.{mode,look,names,set,on}`.
- Query options: `?okBackend okTier okDpr okUltra okGov okDebug` are read from the **frame's** `location.search` (`index.js:36-44`), which is empty for `/frame/<token>`; a game can instead set `window.__OK_OPTS__ = {...}` **before** the kit tag (same parser, `index.js:42`) to force e.g. `okBackend: 'paper'` in a test.

### 2.3 UI primitives for a block palette, grids and charts: reuse vs. draw yourself

What exists:
- DOM: buttons, toasts, banners, the quiz card (`ask`, up to 4 tiles), dialogs with buttons, bubbles, HUD pills, the settings panel, touch stick/d-pad/buttons. All `ok-*` classes and the `--ok-*` variables are usable by your own DOM inside `Oomba.ui.root()` (Word Peek and Would You Rather do exactly this: `would-you-rather.html:290` moves `#game` into the root; its CSS uses `var(--ok-card)`, `var(--ok-edge)` etc.).
- Canvas helpers: `Oomba.draw.panel/button/rrect/ring/spark/sprite/text/sky` and `Oomba.fit(canvas, {size, fit, dprCap, onResize})` for a hand-drawn canvas kept kit-styled (Sum Racer).
- Gestures: `Oomba.input.on('drag'|'tap'|…)` gives pointer positions in **design units of the stage**; for DOM pieces use ordinary Pointer Events.
- Icons: ~40 SVG icons via `Oomba.icon(name)` (`kit/src/icons.js`, includes `drag`, `move`, `tap`, `check`, `cross`, `hint`, `lock`, arrows, `book`, `question`…).

What does **not** exist (grep of `kit/src` for drag/grid/chart: only gesture events and the level grid): no drag-and-drop list/block palette widget, no sortable, no data table or chart primitive, no code editor. For Robo Route's block palette, Data Detective's tables/charts and Packet Post's routing grid you build the DOM yourself inside `Oomba.ui.root()` using the kit's variables, `Oomba.ui.button` for real buttons, `Oomba.icon` for glyphs, and `Oomba.art.toCanvas` for pictures. Rules the audit and lint impose on that DOM: every tappable thing ≥ 40 px (audit) / 48 px (kit rule), never more than 1.5× taller than wide, no text overlapping, nothing off-screen at 390×844 / 844×390 / 820×1180 / 1180×820 / 1280×800 (§6.4); `data-fit-dense` on a dense board container lowers the audit minimum to 28 px (`tests/e2e/frame-fit.js:61-63`, used by Footy Tycoon). Charts drawn on a `<canvas>` are invisible to the audit (it skips CANVAS/SVG, `frame-fit.js:33`) but must still honour reduced motion, high contrast and the 3:1 contrast rule; prefer DOM bars/tables where kids must read values (screen readers, `aria-live`).

A drag-and-drop palette on touch: use Pointer Events with `setPointerCapture` (the kit's own touch pad does this, `input.js:153`), keep a tap-to-place alternative (Code Isle's "tap a word, then a chip replaces it" model, `code-isle.html:3615-3627`), and keyboard moves (arrows + Enter).

### 2.4 Size and quality rules for a game

- File ≤ 2 MB after sanitising (`sanitize.js:3`); stylelint stops linting over 300 KB (`stylelint.js:21`); the public review model reads whole games under ~60 KB only (`docs/safety.md:234`, irrelevant for seeds). Big data → data packs (§4.6).
- Style lint for kit games (`server/services/stylelint.js:132-225`; notes only, never a scan status, but the Builder playtest and the team treat `warn` as fix-worthy): `raw_hex` (colour codes outside `const CONFIG = {…}`: use roles/`Oomba.color`/`--ok-*`), `emoji_text`/`emoji_dom`, `font` (no own fonts; the editor monospace in Code Isle is the known exception), `own_screens`, `own_loop` (no rAF next to `Oomba.game`), `timing`, `slow_effect` (`shadowBlur`/filters per frame), `colour_only` (right/wrong needs a shape or words), `theme_name`, `theme_kit`, `pack_missing`, `dress_missing`, `icon_name`, `motion` (own CSS animation needs an `.ok-rm` rule), `gate_handler`, `none_world`, `missing_key`, plus the live codes (§4.4).
- Performance (`docs/kit.md:924-929`): 60 fps target, ≤ 4 ms logic, no per-frame allocation, time-sliced baking; low-end Chromebooks land on tier `low` (Paper). Gulp City's budget as a yardstick: < 400 draw calls, < 600k triangles (`gulp-city.test.js:142-143`).
- The builder-rules section of `docs/kit-api.md:441-532` is the house style for any kit game (CONFIG one key per line, `WORDS` table as `strings`, `hud: ['count:flag']` with `w.hud.count.set(n,total)`, levels in an array for "Next", questions as `'{a} × {b} = ?'`, big text `clamp(40px, 11vw, 64px)`, DOM below `var(--ok-safe-top)`, `dir="ltr"` on maths/code, read `Oomba.settings.reduced` for your own motion).

### 2.5 How Code Isle does its coding mechanics (and what is reusable)

`seed-games/code-isle.html` (1.43 MB; kit 1.1.2 + `art-animals` + the pinned Three.js import map; `code-isle.json` notes):
- Script 1 (`:222-1543`), classic: `window.CodeIsle` = lexer, parser, tree-walking interpreter with step/call-depth/array-size/action limits and friendly errors (`runLevel(level, code)` → `{ syntax?, results:[{sim, verdict:{ok, fails}}], stars, ok }`, `Sim`, `diffSim`, `applyDiff`). Kids' code is **never executed as JavaScript**; `tests/unit/code-isle.test.js:93-100` proves there is no way out (`constructor.constructor`, `globalThis`, runaway loops). This is the pattern the scanner requires: no `eval`/`new Function` (`scanner.js:34-36`).
- Script 2 (`:1544-2282`): `window.CodeIsleLevels` (`LEVELS` 48, `CHALLENGES`, `CHAPTERS`, `SANDBOX`): each level `{ id, ch, map, starter, sol, goal, story, hints[], learn:{title,text,code}, par }`; tests solve every level with `sol` and assert `starter` does not pass (`code-isle.test.js:17-35`).
- Script 3 (`:2283-2286`): `window.CodeIsleI18n`: English text → translation per language, handed to `Oomba.strings`; code stays English; `{slots}` and `pip.xxx()` calls must survive translation (`code-isle.test.js:50-61`).
- Module (`:2293-4045`): the game. Editor = a plain `<textarea id="code">` (`:202`) with a chip row `.ci-chips` (`:91-96`, `:209`; code/symbol/edit chips), a hidden `#kbProxy` textarea (`:213`) focused first in the same tap so the phone keyboard opens (`setKeyboard`, `:3600-3614`), "tap mode" selecting whole words for chip replacement (`wordAt`, pointerup at `:3616-3627`), `runCode()` (`:3364`) → `E.runLevel` → replay of recorded `sim.events` in the 3D view with the running line highlighted → `afterRun` verdict/stars; drafts and builds saved in `BRB.storage['code-isle-v1']`.
- Reusable for Robo Route: the **interpreter/sim/verdict split**, the level record shape, the i18n-as-English-key approach, the keyboard-proxy trick and the tap-to-pick editor. Not directly reusable as a module (everything is inline in one HTML file; the 3D replay is three.js). For a block-coding game you would write a block→AST or block→command list and reuse the idea of `Sim` + `verdict` + `events` replayed on a 2D kit stage (`w.spawn`/`Oomba.tween` moves, `stage.burst` for feedback).

### 2.6 Live class games on the kit (`live` pack; `docs/kit-api.md:217-321`)

`Oomba.live.ready({presence, lobby, quiz, hostView, maxScorePerSec, view, words[≤64], maxPlayers, teams})`, events `welcome start round countdown … question answered answers reveal result race leaderboard emote fix teams bonus`, reporting `score(n) item(i, ok) quiz.answer(choice)`, `send(kind, data)` (only numbers/booleans/null/your declared words, 2 deep, ≤ 600 B; `brb-sdk.js:165-186`), `flat()` for 2D crowds, `setState` (host). Live-readiness is a static check (`server/services/classlive-lint.js:55-85`; fail codes `live_pack live_ready_call live_no_start live_no_report live_raw`, warns `live_text live_no_words live_text_out live_team_cue live_no_2d live_presence_unused`). A live quiz mode where the platform makes the questions (WYR, Atlas) is a **server** module + a thin game: see `server/live/wyr.js` (72 lines) and `seed-games/would-you-rather-live.html` (37 KB).

### 2.7 Platform hooks a kit game gets for free

Title → intro → how-to → countdown → play → results, HUD, pause (P/Esc/Start/lost focus), touch controls, juice, sound, captions, read-aloud, RTL for the UI, reduced motion, dark theme (`BRB.theme`), `BRB.gameOver`, `__brbTest.state/start/win/skip/step`, the 13-language chrome. A pure-DOM game on `Oomba.stage` (not `Oomba.game`) must call `Oomba.test({state, start})` and `BRB.gameOver` itself (Would You Rather does neither for scores by design: it is unscored).

### 2.8 Which pattern for which CS Quest game

| Game | Suggested base | Why |
|---|---|---|
| Robo Route (blocks, grid, debugging) | `Oomba.game` with `controls:'none'`, `camera:'fixed'`, levels as `Oomba.level.grid` arrays (one per puzzle), your block palette DOM in `Oomba.ui.root()` below `--ok-safe-top`; move the robot with `Oomba.tween(w.hero, {x}, {ms})` per step; `w.spawn` for goals/obstacles; `stars(w)` for par | Quiz template pattern (`templates/quiz.html:142-152`) + Code Isle's interpreter/verdict split |
| Data Detective (data & analysis) | `Oomba.stage` behind DOM cards (Would You Rather pattern, `would-you-rather.html:281-290`) with DOM tables/bars | Reading values needs DOM, not canvas |
| Packet Post (networks/security) | `Oomba.game` `topdown` or `controls:'none'` with a node graph drawn via `w.spawn` props + DOM choice cards | Kit props/characters give the look; `ask` for decisions |
| Inside the Machine (systems) | DOM-first in `Oomba.ui.root()` + `Oomba.art.toCanvas` pictures; `Oomba.ui.dialog`/`ask` | Mostly explanatory interaction |

---

## 3. The SDK (`public/sdk/brb-sdk.js`, `docs/sdk.md`)

Order inside the frame (`frame.js:75`): `window.__BRB_INIT__ = {...}` → the SDK → your document. The SDK is inlined, unversioned, frozen (`BRB.version = 1`; `Object.defineProperty(window,'BRB', {writable:false})`, `brb-sdk.js:987`), so it only ever gains plumbing.

| API | Source | Behaviour that matters |
|---|---|---|
| `BRB.user` `{displayName, avatar, isGuest, lang, dir, character}` | `brb-sdk.js:945-947`; init from `routes/games.js:301` | `lang` is the site locale carried in the signed frame token (`l`, `routes/games.js:241,299`), so it is right in previews too; `dir` `rtl` for he/ar. `character` is the kid's Me-page avatar spec or null. |
| `BRB.game {id, title}`, `BRB.preview`, `BRB.theme` `'light'|'dark'|''`, `BRB.motion` (always `''` today), `BRB.device` | `:948-956` | Kit games follow `BRB.theme`; `init.theme` only when the site theme is not "system" (`routes/games.js:304`). |
| `BRB.storage.get/set/remove`, `localStorage` shim | `:396-422, 964-968` | Per player per game, pre-filled from `init.save`, debounced 400 ms → `brb:save`; **450 KB cap** (`QuotaExceededError`); `canSave` false for guests? No: guests get a session (`routes/games.js:227-228`) and `canSave: !!u && !preview` (`:306`), so guests save too. Studio previews and covers never save. |
| `BRB.score.submit(score, label≤40)` | `:969`; page `play.js:108-113` | Whole numbers ≥ 0; the page rate-limits to one per 2 s and posts `/api/games/:id/score` (best kept, `games.js:321`), and if opened from a lesson also `lessonEvent({event:'score', score, label})`. |
| `BRB.gameOver({won, score})` | `:970`; page `play.js:114` | Also submits the score; page sends `lessonEvent({event:'end', score})`. |
| `BRB.poll(item, choice 0|1, seat 0-5)` → `{a,b,total,min}|null` | `:285-301`; page `play.js:98-103`; server `services/polls.js` | Only slugs in `POLL_GAMES` (`polls.js:8`, today `would-you-rather`); `MIN_SHOWN = 5`; one vote per account/item/seat; 5 s timeout → null. Add the slug to the set for a new poll game. |
| `BRB.speak(text, {lang, rate, pitch, volume, queue, onend, voice, device})`, `BRB.voice`, `BRB.stopSpeaking`, `BRB.prefetchSpeech`, `BRB.aiVoice` | `:541-938` | Best device voice; AI voices only for official games the admin lists (`INIT.tts`, `server/services/tts-games.js`). Start speech from a tap. `lang` = the text's language. |
| `BRB.sfx.play(name)/mute/muted`, `BRB.fx.confetti/shake/flash/tween/fit/fit3d` | `:435-539` | `fx` respects `prefers-reduced-motion`; `fit` is 2D-only safe. |
| `BRB.fullscreen()`, `BRB.orientation('landscape')`, `BRB.retry()` | `:971-975` | `retry` reloads via the page only right after a tap (`play.js:118`). |
| `BRB.live` / `BRB.match` | `:156-284` | Transport only; games use `Oomba.live` / `BRB.match.menu()`. |

Messages to the page (`docs/sdk.md:209-227`; validated in `public/js/play.js:64-85`, unit `tests/unit/sdk-protocol.test.js`): `brb:ready brb:save brb:score brb:gameover brb:fullscreen brb:orientation brb:retry brb:poll brb:online brb:tts`. Nothing else gets through: there is **no generic "progress event"** channel.

### 3.1 Structured progress: what the platform can store today

- Leaderboard: `scores(game_id, user_id, best score, label)` via `brb:score` (`games.js:321 submitScore`; label cleaned by `cleanScoreLabel`).
- Lesson gradebook (`server/services/progress.js`): when a student opens `/play/<slug>?lesson=<classLessonId>&step=<stepId>` (`routes/games.js:246-248`, link built at `routes/progress.js:254`), the page posts `/api/progress/:cl/:step/game` with `{event:'start'}`, `{event:'time', seconds:30}` every 30 s while visible, `{event:'score', score, label}`, `{event:'end', score}` (`play.js:53-60,111,114`). Stored per student per step in `step_progress`: `status started|done, score (best), label, plays, seconds, done_at` (`progress.js:34-46, 96-118`); a game step is "done" on any score/end or after `PLAYED_ENOUGH = 120` s (`progress.js:17`).
- That is the whole structured surface: **one best integer score + a 40-char label per step**. There is no API for "level 3 complete with tags algorithms,loops". Options for CS Quest: (a) encode progress in the score/label (e.g. score = levels done, label `'levels'`; Atlas does `submit(litCountries, 'countries')`, Code Isle `submit(totalStars, 'stars')`), (b) one lesson step per chapter so each chapter's score is its own gradebook cell, (c) a platform extension: a new message type (`brb:progress {chapter, tags}`) validated in `play.js TYPES`, a route, and columns/rows in `step_progress` (every layer must be added: SDK, page, server, tests `sdk-protocol.test.js`). The SDK contract allows adding plumbing (`docs/kit.md:120`).
- Quiz steps (`lessons.js:19 QUIZ_KIND`, `progress.js:76-94 quizAnswer`) are server-checked and store `% right` with label `quiz`; a live run stores one row of counts and class gradebook entries (`docs/safety.md:481`).

---

## 4. The sandbox, the scanner and the kid-safety text rules

### 4.1 The frame

- `<iframe sandbox="allow-scripts allow-pointer-lock allow-orientation-lock">` (`frame.js:17 SANDBOX`), never `allow-same-origin`; `/frame/<token>` (`routes/games.js:285-321`), token signed, 15 min, bound to the viewer (`:241, :296`), `Cache-Control: no-store`, `Permissions-Policy` denies camera/mic/geo (`frame.js:79-91`).
- CSP (`frame.js:25-31`): `default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com <origin>/vendor/three/ <origin>/vendor/oomba-kit/ <origin>/vendor/data/; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data: <origin>/vendor/oomba-kit/; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`. So: no fetch/XHR/WebSocket/beacon, **no image URLs** (all art is code, `data:`/`blob:` or canvas), no workers, no wasm, no `blob:` scripts.
- SDK lockdown before game code (`brb-sdk.js:20-148`; proven in `tests/unit/sandbox-lockdown.test.js`): WebRTC deleted; no child browsing context can ever be attached (`appendChild`/`innerHTML`/`insertAdjacentHTML`/`Range`/`document.write` all screened). In live frames `prompt()` returns null and every text input/textarea/contenteditable is forced read-only (`:219-240`).
- The page side (`public/js/play.js:21-46`) pins a frame that navigates itself back to the game and stops a reload loop.
- Sanitizer (`sanitize.js:6-27`) strips `<base>`, `<meta http-equiv>`, iframe/frame/object/embed/portal, non-Google-Fonts `<link>`, form targets.

### 4.2 Scanner rules a game must pass (`server/services/scanner.js`)

Fail (`FAIL_RULES :19-41` + others): `fetch( XMLHttpRequest WebSocket EventSource RTC* sendBeacon importScripts( import( window.top top.location parent.location/document window.opener document.cookie eval( new Function / Function(" set(Timeout|Interval)("string" window.open( location.href=/assign/replace <form action getUserMedia geolocation Notification.requestPermission`; de-obfuscated copies and `window['fetch']`-style access (`:66-88, 136-143`); `external_url` (any `//host.tld` not Google Fonts/cdnjs, `:148-153`; `http://www.w3.org/` namespaces allowed); `external_script`; `three_pin` (any Three.js but the pinned import map, `vendor.js:69-89`); `kit_pin`/`kit_tag`; `link` (`<a href="http…|mailto:|tel:|javascript:">`, `:166`); `profanity` in visible text **or any string literal of 2-200 chars** (`:168-176`; lists in `textfilter.js:16 BLOCK` + `server/i18n/blocklists/*.txt`); `personal_info` (`PERSONAL_PROMPT :44`: "enter/type/what's your real name/address/phone/email/school/age/birthday/password"); `link_code` (a family link code pattern or "grown-up/parent … code" wording, `:46-47, :179`); `size` > 2 MB.
Flag (human look before Public; seeds are auto-approved but the import still succeeds): `frame` borrow rules (`:91-99`), `unknown_cdnjs`, `contact_info` (phone/email-looking strings), `hidden_text`, `flashing` (timers < 334 ms flipping colours, infinite CSS animations < 333 ms on colour/opacity, `:101-122`), `empty`, `kit_debug`.
Tests: `tests/unit/scanner.test.js`, `tests/safety/scanner.test.js`. Gotchas for CS content: a networking game must not print real URLs/emails/IP-like phone numbers (7+ digits in a row count as a phone, `textfilter.js:149`); a "password" lesson must not say "type your password"; version strings with digit runs look like phones (`wyr-bank.js:50-51` encodes digits as letters for that reason); the word `kill` is fine in text but not in names.

### 4.3 Kid-safety text rules for anything a kid types or shares

- `textfilter.cleanText(s, max)` (`textfilter.js:179-186`): profanity (every language list applies to everyone), `personalInfo` (phone, email, link/domain-like tokens, street address, social/contact words, `@handle` is tolerated), family link codes. Used for titles, descriptions, report details, score labels (`games.js:316`), live set text (`classlive-sets.js`).
- `cleanName` (`:163-174`): usernames Latin `A-Za-z0-9_` 3-16, no profanity (plus `NAME_ONLY` words), no 5+ digits, no birth year, no real-name shape.
- Inside a game frame there is **no path for a kid's typed text to reach another kid**: saves are per player (`brb:save`), scores carry only a number and a label the game writes, live events carry numbers/booleans/declared words only (SDK `:165-186`, page, server `classlive-protocol.js:31 MAX.ev 512`), matches carry 1-2-letter integer keys. A **level editor whose levels are shared between players is therefore not possible without a new platform feature**; what is possible today: (a) levels kept in the player's own save (per device/account), (b) a short **numeric share code** typed by a classmate (digits only: beware `/\d{7,}/` phone detection in any text the platform sees; inside the frame nothing is scanned at run time, so an in-game code box is fine; in a *live* frame nothing can be typed at all), (c) levels as a Builder game (the Studio, class sharing via `visibility: 'class'` with a clean scan or teacher approval, `docs/safety.md:210-231`, `games.js:44-108 CLASS_SQL`). Any kid-authored strings (level names) would need `cleanText` on the server before they are shown to others; today only Builder game metadata goes through it.
- Official games may ask for nothing personal, show no links, no chat. Pass-and-play names are avatars/fixed nicknames (WYR uses faces, never typed names).

### 4.4 Live-specific limits (if a CS Quest game is hosted live)

No typing (enforced), `words` ≤ 64 tokens `[a-z0-9_-]{1,24}`, event data 2 deep/≤ 600 B (SDK) and ≤ 512 B (server), player messages ≤ 2 KB, host ≤ 16 KB, shared state ≤ 8 KB (`classlive-protocol.js:31-33`), `maxPlayers` 2-60 or `CAPACITY` by slug/mode (`classlive-access.js:94-112`), per-session `score` capped by `maxScorePerSec`. Layout checked live by `scripts/live-layout-audit.js` at six sizes (decision line 1954).

### 4.5 Allowed external resources

Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`) only; cdnjs loads but is flagged unless on the (empty) `CDNJS_ALLOW` list (`scanner.js:16`): **assume no libraries**. Three.js only through the pinned import map (`vendor.js:23-28`). Kit font Bricolage self-hosted from the kit folder.

### 4.6 Reviewed data packs (`/vendor/data/`)

`public/vendor/data/<game>/<version>/<lang>.js` served immutable; load with `<script src=… integrity="sha384-…" crossorigin="anonymous">`; the game holds `PACK_VER` and `PACK_SRI` constants; must work without the pack (English built in). Builders: `scripts/wyr-bank.js` (writes between `/* wyr-data:begin */ … end */` markers in the game and `/* wyr-live:begin */` in the live game), `scripts/live-bank.js` (question bank + engine per language, markers `/* live-bank:begin */`), Atlas's packs under `public/vendor/data/atlas-quest/1.0.0-b244a5ca/`. Version names avoid digit runs. `scanner.js` passes these tags because `/vendor/data/` is same-origin relative (no `//host`); the CSP allows `<origin>/vendor/data/` (`frame.js:28`); `snapshot.vendorFile` and `covers.js` serve them from disk (`kit-platform.test.js:235-240`).

---

## 5. URL params and settings passthrough

### 5.1 What reaches a game frame today

Nothing from the URL. `/play/:slug` mints a token `{ v: versionId, g: gameId, u: userId|null, l: req.locale, m?: matchId }` (`routes/games.js:241`); `/frame/:token` builds `init` (`:300-319`): `user {displayName, avatar, isGuest, character, lang, dir}`, `game {id,title}`, `theme?`, `save`, `canSave`, `preview`, `tts?`, `match?`, `deviceText`. `?lesson=&step=` and `?match=` are consumed by the **page**, not forwarded. The frame's `location.search` is empty (kit options via `window.__OK_OPTS__` only, §2.2).

So a lesson link cannot say "open chapter 3 in grade-band 2 mode" without a platform change. Routes to add it (smallest first):
1. Put teacher-chosen options **inside the game**: a setup card (Would You Rather `openSetup`/`__brbTest.start(mode, {count, topics})`, `would-you-rather.html:611-630`; the live bank's `setupCard` in `server/live/bank/engine.js`) remembered in `BRB.storage`; lesson text tells the class which chapter to pick.
2. Platform passthrough: read an allow-listed `req.query` (e.g. `?o=chapter3.band2`, letters/digits/dots only, ≤ 40 chars) in `/play/:slug`, sign it into the token, copy it into `init.params`, expose as frozen `BRB.params` in the SDK (plumbing only), and extend `lessons` game steps with an options field so `routes/progress.js:254` can append it. Unit-test token/init shape (`tests/unit/visibility.test.js`, `sdk-protocol.test.js` style) and update `docs/sdk.md`. Not built today.

### 5.2 How `BRB.user.lang` / `dir` arrive

Site locale resolution `?lang=` → cookie → account → `Accept-Language` → `en` (`docs/decisions.md:51-66`; `tests/unit/i18n.test.js:101`). `req.locale` goes into the token as `l`; `/frame` uses `normalizeCode(tok.l) || req.locale` and `localeInfo(lang).dir` (`routes/games.js:299-301`); `frameDocument` sets `<html lang="…">` (`frame.js:74-75`, tested in `game-l10n.test.js:41-45`). The frame is always LTR; the game mirrors its own menus with `BRB.user.dir` (`docs/sdk.md:314-327`) or lets the kit's `.ok-ui[dir]` do it. Only "finished" locales (≥ 90% of `en.json`) are offered in the picker (`server/i18n/index.js:81-100`, decision line 64; e2e runs with `BRB_ALL_LOCALES=1`).

### 5.3 How Would You Rather and Atlas Quest pick topics / regions

- **Solo** Would You Rather: an in-game setup screen (mode, 10/20/endless, topic chips) → `S.topics`, seen ids in `BRB.storage['would-you-rather-v1']`; the bank is built into the file (`WYR_EN` rows `[id, cat, aText, aTags, bText, bTags]`, `scripts/wyr-bank.js:36`), translations load as packs (`WYR_PACK_VER/SRI`). Topics `CATS` (`wyr-bank.js:21`): `animals food powers school travel silly sports space future family deep`; option text ≤ 60 chars, tags from `TAGS` (12 kind traits). **Adding a "tech choices" topic** = a new `cat` in `scripts/data/would-you-rather/en.json` (+ each `<lang>.json`, which must stay ≥ 90% complete or the pack is skipped, `wyr-bank.js:43`), add it to `CATS` in `wyr-bank.js:21`, to `TOPICS` in `server/live/wyr.js:12` (the live starter's allow-list) and the topic name to `ui.json` (`cat.<id>` in 13 languages); run `node scripts/wyr-bank.js` then seed; `tests/unit/live-wyr-atlas.test.js:28-41` checks topics/languages.
- **Live** Would You Rather: the teacher's picker on `/live` (`routes/live.js:173 wyrPicker`) builds a starter id `wyr:<topics joined by +|mix>:<count 5|8|10|15|20>:<secs 10|15|20|30>` (`wyr.js:44-57`); `wyrItems(id, lang)` makes `{ q: title, choices:[a,b], answer:-1, secs, wyr:id }` from the same bank files (`wyr.js:64-72`); votes feed the game's poll (`POLL_SLUG`).
- **Live** Atlas Quest: starter `atlas:<region world|af|as|eu|na|sa|oc>:<level easy|medium|hard>:<kinds find+capital+flag+famous>:<count>:<secs>` (`server/live/atlas.js:18-22, 83-94`); questions' choices are all 195 country codes, the answer is an index (`:104-120`); data read from `seed-games/atlas-quest.html`'s `window.AtlasData` line and its packs (`:29-57`). Solo Atlas has its own mode/continent/level menu in-game.
- Lesson → live: `routes/progress.js:284` links `/live?cl=<classLesson>&step=<step>&game=<gameId>`; `/live` pre-fills `pick`, `classId`, `set`, `clId`, `stepId` from `req.query` (`routes/live.js:165-171`). A CS Quest teacher page can deep-link `/live?mode=wyr` or `/live?game=<id>&set=<setId>&class=<classId>` the same way.

---

## 6. Testing and QA conventions

### 6.1 Unit tests (node:test, `npm test` = `tests/unit/*.test.js tests/safety/*.test.js`)

Three patterns used for seed games:
1. **Data extracted with `vm`** (no browser): `tests/unit/atlas-quest.test.js:9-22` runs every `<script>` block in a `vm` context and asserts on `window.AtlasData`; checks pack SRI equals the file hash (`:18-22`) and every `tr('…')` key exists in every language with the same `{slots}` (`:51-62`). `tests/unit/code-isle.test.js:7-15` does the same for the interpreter and levels. `gulp-city.test.js:61-70` extracts `const I18N = {…}` by slicing and `new Function` (test-only) to assert every language has every key and the same placeholders.
2. **Real Chromium in the production wrapper**: `gulp-city.test.js:13-50` (`open()` routes `game.invalid/` and `/frame` to `frameDocument(HTML, init)` with `frameCsp(HOST)`, serves `/vendor/three` from disk, aborts everything else, collects `pageerror`, waits for `__brbTest`, drives via `T(frame, fn, ...args)`; skipped when no Chromium: `LOCAL` paths or `BRB_CHROMIUM`). Use it for play logic, RTL, device sizes, the loading/failure cards.
3. **Headless kit** (`tests/unit/kit-game.test.js:14-27` + `tests/support/kit-fake.js`): `createKit(fakeWin({brb}))`, `O.game({... autorun:false})`, `g.start()`, `__brbTest.step(n)`, `hold/release` actions; deterministic without a browser. Good for Robo Route's command/verdict logic if it lives in plain JS the test can `vm`-load.
Also: scan tests (`scanner.test.js:12`), `game-l10n.test.js` (JSON `l10n`), `voice.test.js` (seed games that copy the SDK's `voice-pick` block must stay byte-identical to it: `word-peek`, `shark-plank`), `tests/unit/live-wyr-atlas.test.js` (live modes over the real socket with 30 players, `_live.js` helpers), `i18n.test.js:158` (locale guard: extra keys or bad placeholders **fail the build**; missing keys only warn).
Setup: import `./_setup.js` first (in-memory DB, quiet logs, billing off, `tests/unit/_setup.js`). Many tests read fixtures by **cwd-relative** paths (`atlas-quest`, `code-isle`, `live-bank`, `scanner`, `sdk-protocol`, `voice` tests use `'seed-games/…'`/`'public/…'`), so run from the repo root.

### 6.2 E2E (Playwright, `npm run test:e2e`, `playwright.config.js`)

- Starts `node scripts/seed.js && node server/index.js` on `E2E_PORT` (default 4310) with a temp `BRB_DATA_DIR` (`E2E_DATA`), merged locale stubs, `BRB_ALL_LOCALES=1`, admin `admin/admin-pass-123`, demo teacher, mock STT/TTS, `TRUST_PROXY=1` (`playwright.config.js:8-9, 41-56`); 90 s start budget (seeding + covers). Chromium from `/opt/pw-browsers/chromium-1194` when present.
- Helpers (`tests/e2e/helpers.js`): `gameFrame(page)` (`:22-27`, waits for the `/frame/` iframe and `window.BRB`), `signup/login/ownIp` (random `X-Forwarded-For` per test to dodge per-IP limits), `uniq()` names that never contain blocked words, `adminPage`, `templateGame`, `publishFromStudio`, `schoolWithAdmin`.
- Per-game smoke: `tests/e2e/seeds.spec.js:5-24` (game page 200, `<h1>`, frame has `BRB.sfx.play`, `document.title`, no page errors, visible on Home `#featured`). Kit games: `kit-pilots.spec.js` pattern (pinned tag list, `Oomba.version`, `window.__csp` violations must be `[]`, drive `__brbTest`, click kit buttons). Kit engine: `kit.spec.js` (SwiftShader flags for Glaze).
- Fit audit: `tests/e2e/games-fit.spec.js` runs `scripts/games-fit-audit.js` (below) with a 60-min budget; keep screenshots with `GAMES_FIT_SHOTS=<dir>`.

### 6.3 Layout audit (`scripts/games-fit-audit.js`, `tests/e2e/frame-fit.js`)

- `BASE=http://localhost:3000 OUT=/tmp/games-fit GAMES=<slug,…> node scripts/games-fit-audit.js` (`npm run layout:games`). Sizes (`:18-24`): `phone-portrait 390×844 (touch, mobile)`, `phone-landscape 844×390`, `tablet-portrait 820×1180 (touch)`, `tablet-landscape 1180×820 (touch)`, `desktop 1280×800`; `reducedMotion: 'reduce'`, DPR 1, a distinct `x-forwarded-for` per check. Opens `/play/<slug>` as a guest, waits for `readyState complete` + 3.5 s, checks the **title**, then presses Play (`.ok-title-screen .ok-hot, .ok-title-screen .ok-cta button, [data-start], #play, #playBtn, #start, #startBtn`, `:55`; give your start button one of these) and checks **play** 2.5 s later. Exit 1 on any problem; `report.json` + a PNG per check.
- `frameProblems(frame, {minTap:40})` (`frame-fit.js:11-87`) flags: `offscreen` (text/control outside the frame, or a control inside a scroller with ≤ 8 buttons that needs scrolling, `:50-56`), `clipped` (overflow hidden/clip cutting text, unless ellipsis/line-clamp, `:58`), `squashed` (control < 40 px, or 28 px inside `[data-fit-dense]`, or taller than 1.5× its width, `:63-65`), `overlap` (two texts or two controls overlapping > 20% of the smaller, not nested, not in one heading, `:70-83`), `knob` (a `role=switch`/`.ok-switch` knob outside its track, `:92-116`); plus `page-scrolls-sideways`. Visible, non-floating (`pointer-events:none` is ignored), not-covered elements only; canvas/SVG content is not inspected.
- Live games: `npm run layout:live` (`scripts/live-layout-audit.js`, `tests/e2e/live-layout.spec.js`).

### 6.4 i18n check (`npm run i18n:check`, `scripts/i18n-check.js`, `server/i18n/check.js`)

For the **site UI** (teacher page, lesson pages, cards), not for in-game text. Rules: every locale key must exist in `en.json` (extra = error), placeholders must match, every literal `t('…')`/`req.t('…')`/`tr(…)`/`E(…)` key in `server/**/*.js` and `public/js/*.js` must exist in `en.json` (`check.js:42-76`), a browser module may only use `js.app.*` and `js.<its filename>.*` (`check.js:58-64`; pages pass extra scopes via `page(..., { i18n: ['js.match'] })`), notes must name real keys. `--strict` makes missing translations errors. Today: 4321 keys, 12 locales at 100%, `en-GB` 163 (UK differences only). `tests/unit/i18n.test.js:158` runs the same guard in `npm test`, and `tests/unit/brand.test.js:29` forbids the old brand names in any locale string. New UI strings: add to `server/i18n/locales/en.json` **and all 12 others** (otherwise the picker may drop a language under 90%, `index.js:81-100`); read `server/i18n/README.md` (ICU plurals, `{placeholders}`, tone, never translate the brand).

### 6.5 Running a local server on its own port and data dir

```bash
PORT=4600 BRB_DATA_DIR=/tmp/cs-quest-data ADMIN_PASSWORD=admin-pass-123 BRB_SNAPSHOTS=0 node scripts/seed.js && \
PORT=4600 BRB_DATA_DIR=/tmp/cs-quest-data ADMIN_PASSWORD=admin-pass-123 BRB_SNAPSHOTS=0 LOG_REQUESTS=0 node server/index.js
# then: BASE=http://localhost:4600 OUT=/tmp/games-fit GAMES=<slug> node scripts/games-fit-audit.js
```
`tests/unit/_proc.js startServer(env, {tmp, dataDir})` is the programmatic version (free port, `BRB_SNAPSHOTS=0`, waits for the `"listening"` log line). `BRB_DB=:memory:` runs without a file (the covers script does this). `BRB_ALL_LOCALES=1` shows every language. `DEMO_TEACHER_PASSWORD=x` seeds a demo school/teacher/class with sample lessons (`seed.js:145-184`), handy for teacher-page work. Re-running the seed re-imports a changed HTML as a new version.

### 6.6 Covers and screenshots

`npm run covers -- <slug>` (§1.4), `node scripts/og-images.js <slug>.jpg`, `BASE=… npm run screenshots` for site pages (`scripts/screenshots.js`), Builder-style playtest shots via `server/services/snapshot.js` (`VIEWS` `:57-63` are the same five sizes; it calls `__brbTest.start()` when present, `:193-196`).

### 6.7 Worktrees and paths

Several agent worktrees live under `.claude/worktrees/<id>` inside the main checkout (`git worktree list`), and `.claude/` is **not** in `.gitignore`, so a recursive grep from the main root returns each file several times (seen in this survey). Tests compute `ROOT` from `import.meta.url` and are worktree-safe, but the tests listed in §6.1 read `seed-games/…` relative to `process.cwd()`: always run `npm test`/`node --test` from the worktree root you are editing, or the main checkout's games are what gets tested. `server/i18n/check.js` walks only `server/` and `public/js/`, so it does not double count. `tests/unit/kit-platform.test.js:235-240` picks the alphabetically first folder in `public/vendor/data/` as its sample pack: a new data-pack game that sorts first must have a complete `<version>/<lang>.js` layout.

---

## 7. Accessibility and settings parity expected of official games

Kit games get these from `Oomba.ui.settings()` (pause/title) and the kit (`kit/src/settings.js`, `docs/kit.md:903-923`): reduced motion (`Oomba.settings.reduced` = setting → `BRB.motion` → media query; root class `.ok-rm`; the kit drops shake/parallax/flash, your own CSS needs an `.ok-rm` rule and your JS must read `Oomba.settings.reduced`), captions (`Oomba.ui.caption`, key sfx auto-captioned), read-aloud (`Oomba.say` → `BRB.speak`; `readAloud` default on), text size 100/125/150% (`--ok-ts` on the root: size your DOM in `em`/`rem` relative to the root or read `Oomba.settings.textSize`), game speed, assist (hearts/no-fail), high contrast (`contrast`), colour cues (`cvd`), left-handed touch, graphics Auto/Simple/Fancy, music. Keyboard: arrows/WASD, Space/Z jump, X/Enter action, P/Esc pause, 1-4 answer tiles, focus trap and focus ring (`--ok-focus`) on modals; everything is a real `<button>`; `aria-live` region via `Oomba.ui.announce`. Minimums: buttons ≥ 48 px, world text ≥ 18 px, HUD numbers ≥ 24 px, UI contrast ≥ 4.5:1 both themes, gameplay objects ≥ 3:1 (`docs/kit.md:201, 920-922`), flashes ≤ 3/s (global limiter). RTL: the kit mirrors UI, never the world; put `dir="ltr"` on maths, code and numbers (`docs/kit-api.md:87`).

A non-kit official game must build the same by hand; the bar set by Gulp City (`gulp-city.json` notes; `docs/decisions.md:2078`): its own title/how-to/settings (sound, music, read aloud via `BRB.speak`, motion auto/less, high contrast, text size 100/125/150%), pause and results in 13 languages, RTL for ar/he, light and dark, words rendered before heavy loading, a "couldn't start" card with `BRB.retry()`.

Site-level: `prefers-reduced-motion` is honoured by `BRB.fx` (`brb-sdk.js:436`); the play page has fullscreen and an orientation hint; AI voices (when on) read only the game's own words.

---

## 8. Gotchas (things that commonly break)

1. **A scan `fail` aborts the whole seed** on every boot (`import-game.js:17`): profanity in any string literal (multi-language lists; everyday words like Spanish "sexta" are allow-listed in `textfilter.js:20-28`, but check), 7+ digit runs (phone), any `//host.tld` string **anywhere in the file, comments included** (the `external_url` rule runs on the raw source, `scanner.js:148`; only the FAIL word rules see comment-stripped script, `:129`), `location.href=`, `window.open`, `eval`/`new Function`, "type your password".
2. **Kit tag must be byte-exact** (`checkKit`): version in `KIT_VERSIONS`, right integrity, `crossorigin="anonymous"`, no extra attributes, packs after the core tag and same version. Copy from `kitTag()`.
3. **No image URLs, no libraries, no fonts of your own** (CSP + stylelint). Pictures are kit art, SVG strings, `data:` URIs or canvas.
4. **2 MB file cap**; big word banks go to `/vendor/data` packs with SRI, and the game must still run without them.
5. **Immutable kit**: a change to `kit/src` means a new patch version, a rebuild (`node scripts/build-kit.js`), new hashes in `kit.js`, `KIT_PATCHES`, `kit-upgrade-seeds.js`, and the size gate (96 KB brotli core).
6. **Fit audit**: every control ≥ 40 px (28 under `data-fit-dense`), not taller than 1.5× wide, nothing clipped/overlapping/offscreen, no sideways page scroll, at all 5 sizes, on the title **and** after pressing Play; a start button the audit can find.
7. **Deterministic test hooks**: covers, the Builder autotest and e2e rely on `__brbTest.state()`/`start()`/`step()`; seed your RNG (`w.rand` from `spec.seed`, or `Oomba.rand(seed)`) and expose a `cover()` hook.
8. **i18n completeness**: in-game text must exist in all 13 languages with identical `{slots}` (every seed test checks this); site UI keys go in `en.json` + 12 locales, extra keys fail the build, client scopes are `js.app.*` + `js.<file>.*`; en-GB only differences.
9. **`l10n` in the JSON**: 11 locales for description (+tags); it also decides SEO language URLs.
10. **`cover` field** must be one of `COVERS`; the real cover is the screenshot recipe.
11. **Lists to extend**: `SEED_GAMES` (single array literal), scanner test slug lists, `seeds.spec.js`, covers `RECIPES`, and for live: `MODES`, `CAPACITY`, `LIVE_GAMES`, `OWN_QUESTIONS`, the `/live` pickers, `POLL_GAMES` for polls.
12. **No teacher option passthrough into the frame today** (§5.1): bake a setup card into the game or add `BRB.params` plumbing.
13. **Structured progress is one best score + label per lesson step** (§3.1); chapter tags need new plumbing or one step per chapter.
14. **Kid-typed text cannot be shared between players from inside a game**; a shareable level editor needs platform work and `cleanText`.
15. **Game clock vs. real clock**: `setTimeout`/`Date.now` keep running through pause and the quiz card (lint `timing`); use `Oomba.after/every/wait`, `Oomba.time.real.*` for menus.
16. **`Oomba.save` is 32 KB**; use `BRB.storage` (450 KB) for level drafts; `localStorage` is a shim over the same cloud save.
17. **Worktrees**: run tests from the worktree root (cwd-relative fixtures); greps from the main root hit `.claude/worktrees` copies.
18. **The frame is LTR**; mirror only menus (`BRB.user.dir`) and put `dir="ltr"` on code/maths.
19. **Speech starts only after a tap** on iOS; `BRB.speak` returns `false` when no voice: show the text.
20. **Live frames forbid typing**: a game hosted live cannot have a text box, so a block-coding game live needs tap-only input.
21. **Chromium for covers/OG/e2e** is expected at `/opt/pw-browsers/chromium-1194/...` (or `BRB_CHROMIUM`); unit tests that need it skip without it.
22. **Teachers' live picker hides `NOT_FOR_CLASS` games**; `CAPACITY` defaults a new slug to 30 players unless listed.

---

## 9. File index (quick reference)

- Docs: `docs/kit-api.md` (API + builder rules + examples), `docs/kit.md` (design, §2 art rules, §7-11 API/accessibility, §13 tests, §16 pilots), `docs/sdk.md`, `docs/safety.md` (§1 sandbox, §2 scanner, §6 sharing, §9 limits, §12 live), `docs/decisions.md` (lines 45, 51, 64, 166, 615, 619, 1547, 1810, 1938, 1954, 1973, 2002, 2013, 2045, 2078, 2113, 2167, 2180, 2221), `docs/live-protocol.md`, `docs/live-capacity.md`, `server/i18n/README.md`.
- Seed pipeline: `scripts/seed.js`, `scripts/import-game.js`, `scripts/covers.js`, `scripts/og-images.js`, `scripts/kit-upgrade-seeds.js`, `scripts/wyr-bank.js`, `scripts/live-bank.js`, `scripts/atlas-live-data.js`, `public/covers/`, `public/og/`, `public/vendor/data/`.
- Kit: `kit/src/index.js` (public API assembly `:150-290`), `game.js`, `level.js`, `screens.js`, `ui.js`, `input.js`, `settings.js`, `save.js`, `testhooks.js`, `i18n.js`/`strings.js`, `kit/packs/*.js`, `kit/SHIPPED.json`, `scripts/build-kit.js`, `public/vendor/oomba-kit/1.1.2/`, `server/services/kit.js`, `server/services/stylelint.js`, `server/builder/templates/{quiz,memory,word,board,duel,catch,runner}.html` (small kit games to crib from).
- Platform: `server/services/frame.js`, `sanitize.js`, `scanner.js`, `vendor.js`, `textfilter.js`, `games.js`, `progress.js`, `lessons.js`, `polls.js`, `snapshot.js`, `classlive-access.js`, `classlive-lint.js`, `classlive-sets.js`, `classlive-protocol.js`; `server/routes/games.js`, `progress.js`, `lessons.js`, `live.js`, `teachers.js`; `server/live/{wyr,atlas,starters,live-games}.js`, `server/live/bank/`; `public/sdk/brb-sdk.js`, `public/js/play.js`.
- Tests: `tests/unit/{gulp-city,atlas-quest,code-isle,game-l10n,scanner,sdk-protocol,sandbox-lockdown,kit-api,kit-game,kit-platform,live-wyr-atlas,live-entry,replaced-games,i18n,voice}.test.js`, `tests/safety/{scanner,stylelint,i18n-filters,screening}.test.js`, `tests/support/kit-fake.js`, `tests/e2e/{seeds,kit,kit-pilots,games-fit,i18n,play,lessons,progress}.spec.js`, `tests/e2e/{helpers,frame-fit}.js`, `scripts/games-fit-audit.js`, `playwright.config.js`.
