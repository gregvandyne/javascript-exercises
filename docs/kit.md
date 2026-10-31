# Oomba Kit (developer docs)

> **Status: phase 1 (engine, art library, UI kit, demo) and phase 2's game layer and art packs are built; kit 1.1.0
> (the current version, with themes: §6.5) is built next to the locked 1.0.0. This file is
> the design; for what exists, with exact signatures, read [kit-api.md](kit-api.md)** (that page is what a model reads;
> a unit test keeps it equal to the code). Sections marked **(not built)** describe plans.
>
> - **Sources:** `kit/src/*.js` (ES modules; the unit tests import them directly, no DOM needed at import).
>   Core: `tokens color rand ease tween loop input i18n strings audio save settings theme validate`.
>   Render: `list atlas paper glaze governor sky camera particles fit stage entity text`. Art: `grammar art chars props
>   biomes icons`. DOM: `ui screens juice`. Game (level A): `level game` (§7.2). Packs: `packs` (the registry) and the pack
>   sources in `kit/packs/*.js` (`art-animals`, `art-school`, `art-biomes`). Glue: `parts helpers testhooks index`.
> - **Build and versions:** `node scripts/build-kit.js` (esbuild 0.28.2, a pinned build-only devDependency; without it a
>   built-in stripper) writes `public/vendor/oomba-kit/<version>/` (the core `oomba-kit.js`, `packs/<name>.js`, fonts,
>   `manifest.json`) and the SRIs into `server/services/kit.js` (`KIT_VERSIONS`, `KIT_PACKS`), and prints every file's
>   brotli size against its cap (`SIZE_CAPS`: core 95 KB; art-animals 12, art-school 12, art-biomes 8). A version folder is immutable: the build refuses to overwrite it,
>   `--replace` works only while the version is unshipped, and once a version is listed in `kit/SHIPPED.json`
>   (version → sha384, plus its packs' hashes, added in the change that ships it; **1.0.0 is locked**, with its three packs, in the change that ships the first games on it) `--replace` is refused and a test fails if its hash or file
>   ever changes (saved games pin that hash). Sizes in 1.1.0 (brotli): core 94.9 KB (cap 95), art-animals 1.9, art-biomes 1.9, art-biomes-2 3.3, art-props 3.1,
>   art-school 4.0, dress 8.1, style-bold 3.0 (packs cap 10-12 KB). Sizes in 1.0.0: core about 91 KB (cap 95 KB, with the game layer;
>   the learning and food props moved to `art-school`), art-animals 1.8 KB, art-school 4.1 KB, art-biomes 1.5 KB.
>   `tests/unit/kit-platform.test.js` enforces the caps.
> - **Platform:** the frame CSP allows `<origin>/vendor/oomba-kit/` in `script-src` and `font-src` (next to cdnjs and
>   `/vendor/three/`); the scanner accepts exactly `kitTag()` and, after it, exactly `kitPackTag(name)` for each pack (same
>   version), fails anything else naming the kit (`kit_pin`, `kit_tag`) and flags games that name `Oomba.debug` or the
>   pack hook `Oomba.__pk` (`kit_debug`); `snapshot.js` and `scripts/covers.js` serve kit files from
>   disk; the SDK exposes `BRB.theme` (from `init.theme`). `BRB.motion` is reserved: no site setting sends
>   `init.motion` yet, so it is always `''` and the kit follows the device's reduced-motion setting and its own
>   settings panel. `BRB.on('theme')` is not built (the kit reads `BRB.theme` once). `/kit` (admins, or everyone with
>   `KIT_PREVIEW=1`) runs `kit/demo/<scene>.html` through the real frame wrapper; scenes `meadow` (the demo, on `Oomba.game`), `quest` (one
>   `Oomba.game` call with every part and all three packs, two levels), `core` and `gallery` (loads every pack) (`&tab=chars|props|icons|biomes|screens`). Its frame takes `?l=`, `?mode=`, `?okBackend=`,
>   `?okTier=`, `?okGov=off` (freeze the governor for screenshots) and `?okDebug=1` (exposes the unsupported
>   `Oomba.debug.kit` internals to the kit's own tests; games never have it).
> - **Engine (phase 1 review fixes):** parallax bands live on one atlas page per band slot and re-bake in place when
>   the view size changes (debounced 150 ms while resizing), so rotation, split view and zoom never add pages; freed
>   pages release their canvases and Glaze deletes their textures. Paper's night, moon (the cast's quarter-strength
>   grade) and white variants are made by compositing only (no `getImageData`), queued and time-sliced, and
>   `stage.prebake()` bakes them behind the title. Glaze allocates each page's texture once (`texStorage2D`) and copies
>   only the rectangle baked since the last frame; steady play uploads no whole page. `Glaze.dispose()` releases its
>   WebGL context. The loop pauses on a lost focus (and the HUD opens the pause screen); the audio context sleeps while
>   the page is hidden. On Paper the governor skips the pixel-ratio rung on 1x screens and has a render-scale rung.
>   The stage watches the device pixel ratio itself and unsubscribes from the theme when destroyed.
> - **Art direction (review fixes):** the cast is lit apart from the world (a quarter of the night grade, eye whites
>   unlit, a cool moonlight rim on Glaze), so skin and fur stay warm at night; pupils start centred and travel at most
>   ~a third of the ring; kids have thinner eye rings than the mascot (never "glasses"), arms tucked behind the torso,
>   a backpack behind the arms, pigtail puffs with hair ties (never ears), long hair parted with face-framing curtains
>   on its own part behind the body, hair moved toward 3:1 against the skin. The bee is honey amber with Ink stripes
>   (spark yellow is rewards only; a unit test scans every species). Ground tiles have strata, three pebble looks, a
>   root band and closed outlines on step corners; clouds are cream tinted by the sky; lanterns glow without blowing
>   out (tone-mapped bloom, halo behind the props); 12-20 small green-yellow fireflies low in the scene, stars only in
>   the sky band. Icons are Ink lines plus role-filled stickers (the HUD heart is the prop heart).
> - **UI (review fixes):** the title is a sticker lockup (Ink outline, Cream rim, backOut pop, the Oomba wordmark)
>   above the horizon, so the cast is never behind the button; modal scrims are 42-55% Ink with a light blur; the quiz
>   keeps its asker clear of the scrim, gives a hint and a second go before revealing; speech bubbles are 20 px (18 on
>   phones), never hyphenate; the phone HUD is one row (clock-face timer, flag meter, combo badge, one menu button);
>   touch controls are Cream sticker discs with a Mint jump button; world labels under 18 px are Ink on a Cream pill;
>   score pops start at the pickup (never on the hero) and fly into the score pill.
> - **Demo: "Oomba Meadow"** (`kit/demo/meadow.html`, dev-only, never in the games list) uses the public API only
>   (`Oomba.test`, `Oomba.scene`, `stage.timeOfDay`, `Oomba.input.hold`, `Oomba.time.real`). Test hooks:
>   `__brbTest.meadow()`, `beat('custom'|'play'|'pond'|'bee'|'fox'|'night'|'goal'|'lose')`, `hold(action, ms)`,
>   `nightfall(ms)`, `collectAll()`.
> - **Not built yet:** `Oomba.game` and `level.grid`, gameplay parts (player, collectible, hazard, goal, quizGate...),
>   `toSVG`/`toTexture`, the /kit drawer toggles, the CVD palette gate, pixel-exact snapshot baselines (the night
>   metrics test stands in), `?okUltra`.
> - **Tests:** unit `tests/unit/kit-core.test.js`, `kit-render.test.js`, `kit-art.test.js`, `kit-api.test.js`,
>   `kit-platform.test.js` (with the size gate and the shipped-version lock); e2e `tests/e2e/kit.spec.js`,
>   `kit-gallery.spec.js`, `kit-meadow.spec.js`.

## 0. What we're building, in one paragraph

The Oomba Kit is a brand-owned game foundation that we write ourselves. It is a pinned, SRI-checked classic script served from `/vendor/oomba-kit/1.0.0/`.
- **The world** is drawn on a canvas from one pooled display list. Two stateless backends read that list:
  - **Paper** (Canvas 2D) is the reference look and always works. It is a finished sticker-book art style, not a degraded mode.
  - **Glaze** (WebGL2) adds sky shaders, emissive glow, point lights, a LUT colour grade, bloom and spark-shaped transitions.
- **The UI** (screens, HUD, buttons, quiz widgets, dialogue, settings) is real DOM.
- **The art** is procedural vector code in one strict illustration grammar taken from the logo, "Oomba Ink". It is baked once per size into atlases.

A Builder game becomes `CONFIG` + `Oomba.game({...})` + a one-character ASCII level + a few event handlers. Every game gets a title screen, how-to, pause, settings, win and try-again screens, a HUD, juice, touch, keyboard and gamepad input, 13-language UI chrome, RTL, reduced motion and `__brbTest` for free. That is what "better than Roblox" means for us:
- every game, including an 8-year-old's AI-built one, looks first-party;
- it runs on a $200 Chromebook;
- it is accessible by default.

## 1. Non-negotiable constraints (from the repo)

- **Frame CSP** (`server/services/frame.js` `frameCsp`):
  - `script-src`: inline scripts, cdnjs, `<origin>/vendor/three/` and `<origin>/vendor/oomba-kit/`;
  - `font-src`: gstatic, `data:` and `<origin>/vendor/oomba-kit/` (the kit's own font);
  - images only from `data:`/`blob:`;
  - `connect-src 'none'`;
  - opaque origin.

  So the kit cannot use eval or `new Function`, wasm, workers, fetch/XHR, or URL images. **All art is code.**
- **Frame documents are `no-store` and uncompressed for signed-in kids.** So the kit is **never inlined**. It is a cached, immutable, brotli-compressed vendor file.
- **iPadOS 15 has no import maps**, so the kit must be a **classic script**. It is not an ES module at runtime.
- **The playtest `inspect()` only sees DOM**, so all UI chrome is DOM.
- **`layer.js` patches rAF, `performance.now` and the timers for `BRB_TUNE.speed`.** The kit takes time only from rAF timestamps and never uses `Date.now`.
- **The SDK is inlined, unversioned and must stay backward-compatible forever.** It gets plumbing only (theme, motion), never look. The kit feature-detects the SDK and never patches `BRB`.

## 2. Art direction: "Oomba Ink" (one direction, exact rules)

Everything is drawn the way the logo is drawn:
- a thick round Ink line, flat fill, one hard shade;
- **the logo's ring eyes** on every living thing;
- **the 4-point spark** as the only reward glyph.

### 2.1 Palette

These are role tokens; games never write hex. Each hue has 4 steps: `tint / light / base / shade`. The ramps are built in OKLCH, and `shade` = base L − 0.12 at the same hue (never "mix black"). The values below are the **phase 1 starting values**. The extended `scripts/contrast.js` gate (§13) may nudge them by ≤ 0.03 L; the brand values are fixed.

| Hue | Role(s) | tint | light | base | shade |
|---|---|---|---|---|---|
| **mint** (brand) | `friend`, `player`, `correct`, `go` | `#DDF3E6` | `#9BDDB7` | **`#66C792`** | **`#1F9D63`** (leaf) |
| **spark** (brand) | `reward`, `hot` (primary CTA) — reserved | `#FFF3C4` | `#FFE27A` | **`#FFD23F`** | **`#C99A00`** |
| coral | `hazard`, `wrong` | `#FFE1DC` | `#FF9C8F` | `#FF6B5B` | `#C8402F` |
| sky | `interact`, `neutral`, `water` | `#DDEEFD` | `#93CBF6` | `#4FA8F0` | `#2F6FC8` |
| grape | `magic`, `special` | `#ECE2FB` | `#C6A9F3` | `#9B6BE8` | `#6C44C0` |
| peach | env / fur | `#FFEAD8` | `#FFC89E` | `#F5A26B` | `#C9713A` |
| cocoa | env / wood / hair | `#EEDFD0` | `#BF957A` | `#8A5A3C` | `#5C3A26` |
| stone | env / rock / UI muted | `#EEECE5` | `#C6C2B5` | `#8F8A7C` | `#5E5A50` |
| snow | env / clouds | `#FFFFFF` | `#F4F7FA` | `#DDE6EE` | `#B4C3D1` |
| **ink** | outlines, UI text | — | — | **`#141414`** | — |
| **cream** | sticker rim, cards, belly | — | — | **`#FFFDF2`** | `#F4F1E6` (paper) |

- **Skin tones (8, no default ordering bias):** `#FCE1CB #F5CBA7 #E8B48A #D29A6B #B97E4E #96603A #6E4529 #4A2E1C`. Each gets a derived shade (L − 0.10).
- **Hair colours:** cocoa, `#2B2220` (black-brown), `#E8C26A` (blonde), `#C8572F` (copper), stone, grape, sky, mint.
- **Colour-role rules** (enforced by `validate` and the style lint):
  - Spark yellow appears **only** on rewards and the primary CTA.
  - Hazards are always coral **and** spiky or triangular.
  - Correct = mint + ✓ + round. Wrong = coral + ✕ + spiky badge.
  - Meaning is never carried by hue alone.
- **Dark theme = night, never an inversion:**
  - The sky runs `#0E2A2E → #163B3A` (deep teal), with ground bands from the biome night ramp.
  - Objects get +0.05 L. Large areas lose 20% chroma.
  - Spark stays `#FFD23F` exactly.
  - Lanterns, fireflies and emissive parts switch on (§5.4).

### 2.2 Shape language

- Friends and players are built from **circles, capsules and rounded rects** (corner radius 23% of the short side, like the icon's rx 56/240).
- Rewards use the **4-point curved spark** (the logo's path, scaled).
- Hazards use **triangles and zigzags** only: spikes, bee stingers, thorns. Hazards are still cute: no gore and no skulls.
- Characters are **2–2.3 heads tall** (chibi), with a big head and a short bean or ball body.
- **Ring eyes:**
  - each eye is a ring whose stroke is 22% of the eye diameter;
  - the eye diameter is about 1/3 of head width;
  - a solid pupil (55% of the inner diameter) is offset toward the look target;
  - a 1-px highlight dot sits at the top-start.
- The mouth is a single curve. Mood is shown by the brows, the lid angle, the pupil size and the mouth curve.

### 2.3 Line

- **Outline:** Ink `#141414`, round caps and joins, `w = clamp(2, 0.055 × h_px, 6)` **device px**. It is computed when baking, so it is constant on screen whatever the sprite size.
- **Inner detail lines** (belly seam, ear inner, mouth) are drawn at `0.6 × w`.
- **Sticker rim:** a Cream `#FFFDF2` halo `max(2, 0.45 × w)` device px wide, outside the ink, on characters, props and pickups (not on terrain). It makes silhouettes read on night skies and busy scenes.
- **Terrain:** the ink line goes on **top edges only** (the grass lip), not the sides.

### 2.4 Shading

- A flat base fill.
- **One hard cel shade**, in the `shade` step at 100% opacity. It is clipped to the side away from a fixed light at the top-start (top-left in LTR). The light mirrors only if the game sets `mirrorWorld`.
- **One gloss oval** in white at 55% opacity, at the top-start of the largest body part.
- **No gradients on characters or props.** Gradients are allowed only on the sky, water and glow sprites.
- **Contact shadow:** an ellipse 70% × 18% of the sprite width, Ink at 18% (night: 30%), baked. No blur anywhere at runtime.
- **Glaze extras** (render-only, never change the art): emissive parts glow, point lights add light on the lit side and a sky-coloured rim, and the colour grade comes from a LUT. The Paper and Glaze outputs must match in silhouette, line and fill (§13).

### 2.5 Type

- **UI/display face:** Bricolage Grotesque, self-hosted at `/vendor/oomba-kit/1.0.0/fonts/` (latin + latin-ext woff2, OFL).
  - Weight 800 at opsz 72 for titles and big numbers. 700 for buttons. 600 for body UI.
  - `font-variant-numeric: tabular-nums` for HUD numbers.
- **Fallbacks per script**, matching `app.css` `:lang()`:
  - `ar`: Noto Sans Arabic, Tahoma, line-height 1.6.
  - `he`: Rubik, Arial Hebrew, Arial.
  - `ja`: Hiragino Maru Gothic ProN, Noto Sans JP.
  - `zh-Hant`: PingFang TC, Microsoft JhengHei, Noto Sans TC.
  - `ru`: system-ui sans. Bricolage has no Cyrillic; Andika is phase 2.
- **Never on any script:** forced uppercase. **Never on ar/he:** letter-spacing or faux bold.
- **Minimum sizes:** 18 px for world text and 24 px for HUD numbers, scaled by `min(vw, vh)`.

### 2.6 Motion tokens (the single source the Builder prompt cites)

| Token | Value |
|---|---|
| `tap` | 80 ms |
| `ui` | 200 ms, `cubicOut` |
| `pop` | 320 ms, `backOut` (s = 1.70158) |
| `scene` | 500 ms (spark iris wipe) |
| `spring.play` | k 180, ζ 0.55 |
| `spring.ui` | k 260, ζ 0.8 |
| `hitstop` | 40–80 ms (default 60) |
| `shake` | `off = 18px · trauma² · noise(t·25)`, rotation `±3° · trauma²`, trauma decays 1.6/s, capped at 1 |
| `squash` | volume-preserving, `sx = 1/√sy`. Jump: stretch sy 1.15. Land: sy 0.8 + dust puff |
| `breathe` | ±2% scaleY at 0.4 Hz |
| `blink` | every 2–6 s (seeded), 120 ms |
| `flash` | at most 3 per second, enforced by a global limiter (WCAG 2.3.1) |

**Reduced motion** (from `BRB.motion`, `prefers-reduced-motion` or the settings panel):
- no shake, zoom punch or parallax (parallax factor 0.2 max);
- pops become 200 ms fades;
- 80% fewer particles;
- no screen flashes;
- hit-stop is kept, because it is not motion.

## 3. Packaging, loading, versioning

```
kit/src/*.js                         ES-module sources (tests import directly; no DOM needed for pure modules)
kit/ART.md                           the illustration grammar (§2) for artists/devs/Builder
scripts/build-kit.js                 concat in dependency order → IIFE → minify → write dist + SRI table
public/vendor/oomba-kit/1.0.0/
  oomba-kit.js                       classic IIFE: window.Oomba (alias window.OK); core+ui+paper+glaze+art+game
  fonts/bricolage-latin.woff2  fonts/bricolage-latin-ext.woff2  fonts/OFL.txt
  LICENSE  manifest.json            {version, api:1, files:{name:sha384}}
server/services/kit.js               KIT_PATH, KIT_VERSIONS={'1.0.0':'sha384-…'}, KIT_LATEST, kitTag(v), kitVersion(html), checkKit(src)
```

- **One code file per version.** Glaze ships inside it (about 16 KB br). That avoids a second runtime-injected pin.
- **Art packs** ship as `packs/<name>.js` in the same version folder, each with its own SRI in `KIT_PACKS[v][name]` and the
  manifest. A pack is a classic script built from `kit/packs/<name>.js` (`export const PACK`, `export function define(K)`,
  no imports): it calls the kit's non-enumerable hook `Oomba.__pk({name, version}, define)`, which refuses a pack built for
  another kit version. `define(K)` gets the Ink grammar and `K.species(name, def)`, `K.prop(name, group, def, variants)`,
  `K.biome(name, def, {decos, profiles})`; species hook into the core character builder (geometry, colours, `headBack`,
  `headFront`, `parts`, `beak`, `legs`), so they get every clip, face, wear item and the night grade. A game declares a
  pack like the core, with exactly `kitPackTag(name)` after `kitTag()`; only games that use a pack download it, and the
  file is cached for a year like the core. `Oomba.pack(name)` reports what a loaded pack added.
- **Opt-in tag** (exact, emitted by `kitTag()`):
  ```html
  <script src="/vendor/oomba-kit/1.0.0/oomba-kit.js" integrity="sha384-…" crossorigin="anonymous"></script>
  ```
  `crossorigin="anonymous"` is required: the frame is opaque-origin, so without it SRI fails and errors show as "Script error.".
- **Minifier:** **esbuild 0.28.2, a pinned build-only devDependency** (owner approved). Production installs skip devDependencies; there `build-kit.js` would fall back to its own stripper, but the built files are committed (like three.js), so production never builds. Budgets are measured as brotli.
- **Two versions live (1.1.0).** `public/vendor/oomba-kit/1.0.0/` is locked (`kit/SHIPPED.json`) and saved games keep
  loading it byte for byte; `1.1.0/` is built from today's `kit/src` and `kit/packs` and has seven packs (the five of
  1.0.0 rebuilt, plus `art-biomes-2` and `art-props`) and is locked in `kit/SHIPPED.json` too (with its packs), so the
  next kit change is a new version folder. `KIT_LATEST = '1.1.0'`: `kitTag()` / `kitPackTag(name)` default to
  it, so templates, the Builder's rules, the `/kit` preview and the seed games use 1.1.0. The scanner accepts each
  version's exact tags (a pack must match its kit tag's version; a 1.0.0 game asking for a 1.1.0-only pack is told which
  kit has it), the style lint reads the game's own version, and the vendor route serves both folders.
- **Immutable folders:**
  - The build refuses to overwrite an existing version folder (`--replace` only while unshipped).
  - `kit/SHIPPED.json` locks every shipped version's hash: the build refuses `--replace` for it and a unit test fails
    if `KIT_VERSIONS` or the file ever changes. Bug fixes ship as new patch folders.
  - `KIT_VERSIONS` only grows.
- **API freeze:**
  - `Oomba.version = '1.1.0'` (1.0.0 for saved games) and `Oomba.api = 1`.
  - Games pass `api: 1` in `Oomba.game({api:1, ...})` / `Oomba.stage(..., {api:1})`.
  - Within major 1, changes are additive only. Deprecated calls keep working and warn once (`kit.deprecate(name, hint)`,
    built). An `api` other than 1 warns.
  - A second copy refuses to initialise (`if (window.Oomba) return`).
- **SDK coupling:** the kit feature-detects (`BRB.version`, `typeof BRB.sfx`, `BRB.theme`, `BRB.motion`). Each missing feature degrades to the kit's own synth, the media queries or a no-op. The kit never throws and never patches `BRB`.
- **Builder pinning:** the Builder emits `KIT_LATEST`. `edit_game` keeps a game's pinned version; upgrading is an explicit one-line edit path (phase 2).
- **Caching:** `/vendor/*` is immutable for a year, brotli-compressed, with `ACAO:*` and `CORP: cross-origin` (already in `app.js`). The kit and fonts are downloaded once per device.

### 3.1 Platform changes (phase 1, each with a unit test)

1. **`frameCsp`:** add `<origin>/vendor/oomba-kit/` to `script-src` **and** `font-src`. `img-src` is unchanged (art is code).
2. **Scanner:**
   - Strip exact pinned kit tags (`checkKit`) before the other checks.
   - Narrow `checkThree`'s `rest.includes('/vendor/')` to `/vendor/three/`.
   - Exempt the pinned tag from `external_script`.
   - Fail with `kit_pin` (unknown version, wrong SRI, missing `crossorigin`) or `kit_tag` (any other `/vendor/oomba-kit/` reference, or the kit inside an import map). Messages are actionable by the Builder.
   - `isThreeGame` and `deviceNeeds` are unchanged: kit games are 2D and need no device card.
3. **`snapshot.js` `vendorFile()` and `scripts/covers.js`:** route `/vendor/oomba-kit/<ver>/<file>` (plus `font-src`/`script-src` in `covers.js`'s CSP). Without this, covers and Builder playtests lose the kit.
4. **`init.theme` (`'light'|'dark'` from `req.theme` in `routes/games.js` and the default in `snapshot.js`)**, exposed by the SDK as `BRB.theme`. `BRB.motion` (`init.motion`) is reserved and always `''` until the site has a motion setting; `BRB.on('theme', fn)` is not built. These changes are additive.
   - Kit games follow the site theme by default; `Oomba.game({theme:'light'})` pins it.
   - Non-kit games are untouched, which matches the rebrand rule that "frames keep their colours".
5. **Demo route** `GET /kit` (gallery + demo). It is enabled when `KIT_PREVIEW=1` or the viewer is an admin. The demo runs through a **real `/frame/<token>`** with the real CSP.

## 4. Module list (sources in `kit/src/`)

| Layer | Module | Responsibility | Budget (br) |
|---|---|---|---|
| core | `tokens` | palette ramps, roles, radii, spacing, outline formula, motion tokens, z-layers | 2 KB |
| | `rand` | mulberry32, `Oomba.rand(seed)`. Math.random is never used in the kit | 0.3 |
| | `tween` | tweens, seq/all/stagger, 31 easings, spring solver, promises | 3 |
| | `loop` | fixed 60 Hz update, interpolated render, ≤ 5 updates/frame, rAF clock, `time.scale`, hit-stop, pause on blur/visibility/modal | 1.5 |
| | `input` | action map (keyboard by `code`, pointer, touch, Gamepad API standard mapping), gestures, DOM touch controls | 4 |
| | `i18n` | `t`, `strings`, `num`, plurals, `Intl.Segmenter`, 13-language kit strings | 5 |
| | `audio` | sfx bridge + 12 synth voices, pitch/pan variation, music beds (2 in P1), ducking, captions | 3.5 |
| | `save` | versioned, debounced, size-guarded layer over `BRB.storage` | 1 |
| | `validate` | snaps specs to valid values, dev warnings → `BRB.debug` | 1.5 |
| render | `list` | pooled typed-array display list (struct-of-arrays) | 1.5 |
| | `atlas` | bake queue (≤ 4 ms/frame, pre-bake behind the title), shelf packer, 2048² pages (1024² low), LRU, size buckets | 2 |
| | `paper` | Canvas 2D backend | 2.5 |
| | `glaze` | WebGL2 backend: batcher, sky, lit/emissive sprite shader, particles, post chain, iris wipe | 9 |
| | `stage` | fit (letterbox/expand, DPR cap, safe areas), layers, camera, particles, backend pick/demote, governor | 4 |
| art | `art/*` | grammar primitives, rig + clips, 6 species, ~25 props, ~40 icons, meadow biome (day + night), effects | 18 |
| ui | `ui/*` | injected CSS, screens, HUD, buttons, ask widgets, dialogue, toast, captions, settings, live region | 10 |
| game | `game`, `level`, `packs` | `Oomba.game`, world, tile physics, 6 control presets, 19 parts, `level.grid`/`generate`, the pack registry | 11.5 (built) |
| test | `testhooks` | `__brbTest` auto-hooks, `step(n)`, `frameStats` | 0.7 |
| | **total `oomba-kit.js`** | **target ≤ 80 KB br, hard CI cap 95 KB** | ≈ 91 today (esbuild, with `game` + `level`) |

Fonts are 77 + 31 KB woff2, loaded with `FontFace` on demand and cached.

The **size gate** in `tests/unit/kit-platform.test.js` brotli-compresses the dist file (node `zlib`) and fails when it is over the cap.

## 5. Rendering

### 5.1 Pipeline

```
spec ─validate─► geometry (pure fns → named Path2D layers, 100-unit box, seeded)
     ─bake────► albedo sprite (+ emissive mask sprite, + silhouette/white variant lazily) at (specHash, sizeBucket, theme, tier)
                into atlas pages; animated parts (lids, pupils, mouth, arms, legs, tail, ears, wear) baked separately
scene ─emit──► display list: per frame, flat pooled typed arrays {page,u,v,w,h,x,y,sx,sy,rot,alpha,tint,flash,layer,blend,emissive}
               + light list (≤4) + sky params + post params
      ─cull──► backend.draw(list)  (Paper | Glaze)  ─► DOM UI on top (native res)
```

- **Backends are stateless consumers.** Atlases are canvases owned by `atlas`, and Glaze only mirrors them as textures, uploading dirty pages. This makes a GL→2D switch lossless at any moment.
- **Size buckets:** sprites are re-baked only when the on-screen scale changes by more than 15%. Pop and squash tweens draw the next larger bucket scaled, so they never trigger re-bakes.
- **No allocation in the frame loop:** pools, typed arrays, no closures in hot paths.
- **No `shadowBlur` or `ctx.filter` anywhere in per-frame code.** Gradients are created only when baking. A source-grep test enforces this.

### 5.2 Backend choice

The kit tries each step in order:
1. Use the `?okBackend=paper|glaze` / `Oomba.game({backend})` override (tests, the demo drawer).
2. Try `canvas.getContext('webgl2', {failIfMajorPerformanceCaveat:true, antialias:false, premultipliedAlpha:true, alpha:false})`.
3. Read `WEBGL_debug_renderer_info`. If it matches `/SwiftShader|llvmpipe|Software|Basic Render|Microsoft Basic/i`, use Paper.
4. Otherwise use Glaze. **There is no WebGL1 path:** every target that has a GPU has WebGL2, and Paper covers the rest.

**Context loss:** on `webglcontextlost` the kit switches to Paper in the same frame. If the context comes back, Glaze resumes at the next scene transition or pause. After 2 losses in 60 s the kit stays on Paper for the session.

### 5.3 Quality tiers

**Each tier is a finished art style.**

| Tier | Selected when | Backend | DPR cap | Particles | Parallax bands | Lighting / post |
|---|---|---|---|---|---|---|
| `low` "Paper" | no WebGL2, software GL, `?okTier=low`, the user's "Simple" setting, or demotion | Paper | 1.25 | 120 | 2 | Baked cel shade. Prebaked vignette. Night glow uses baked radial sprites with `globalCompositeOperation='lighter'` |
| `mid` "Glaze" | default when Glaze is available | Glaze | 1.5 | 300 | 3 | Sky shader, emissive glow, ≤ 2 point lights, LUT grade + vignette in one pass, iris wipe |
| `high` "Glaze+" | Glaze, `hardwareConcurrency ≥ 8`, and a 2 s probe with p90 < 9 ms | Glaze | 2 | 600 | 4 | + ≤ 4 point lights, ½-res dual-Kawase bloom keyed on emissive, rim light, firefly sprites, depth-fog on parallax |

- **Experimental flag `?okUltra=1` (demo only, not a tier):** lit sprites with a normal/height channel. It is baked on the CPU from a 2D distance transform (8SSEDT) of each part's silhouette, once per (spec, size), time-sliced. It ships only after real-device QA.
- **Frame budget:** 16.6 ms in total, at most 4 ms of game logic, and at most 6 ms of render submission on a Celeron.

**Governor** (a pure state machine, unit-tested with synthetic frame-time series):
- It reads p90 frame time over a rolling 90-frame window.
- The ladder has 3 rungs: (1) dynamic render scale 1.0 → 0.6 in steps of 0.1 (Glaze) or DPR cap down to 1.0 (Paper); (2) particle cap ×0.5 and post off (bloom, then lights); (3) the tier drops one step, from `high` to `mid` to `low` (= backend Paper).
- Step down after 1.5 s at p90 > 18 ms. Step up only after 5 s at p90 < 10 ms, at most once per scene.
- **Render scale may change any time. Tier and backend changes happen only at a scene transition, the pause screen or a context loss**, so nothing visibly pops.
- The settings panel has "Graphics: Auto / Simple / Fancy". The current tier is exposed as `Oomba.tier`.

### 5.4 Glaze passes

1. **Sky:** a full-screen procedural shader with an OKLab two-stop gradient, a sun or moon disc, soft value-noise clouds, a `timeOfDay` uniform (0 = noon, 1 = night) and stars at night. Paper uses the same function baked to a cached canvas per (theme, size).
2. **Far layers:** parallax bands baked once into textures 1.5 screens wide that tile horizontally. They scroll and are never redrawn.
3. **Shadows:** contact ellipses from the same instance buffer.
4. **World:** instanced sprites, sorted by (layer, page). The fragment shader computes `albedo × (ambient(sky, timeOfDay) + Σ≤4 point(color, radius, falloff) on the sprite's lit side) + emissive × glow`.
   - The ink outline and the sticker rim are marked unlit in the mask, so the line stays crisp and brand-correct.
   - A vertex wind sway runs on tagged foliage.
5. **FX:** instanced particles, with one draw for additive blending and one for alpha.
6. **Post**, at render scale r: bright-pass on emissive → ½-res bloom (high only). Then one uber pass: bloom add + a 16³ LUT generated in code per (biome, theme) + vignette + screen flash + **transition mask** (a spark-shaped iris wipe, or dissolve).
7. Bilinear upscale to the canvas.

**Paper equivalents:** iris wipe = a canvas clip with the spark Path2D. Glow = baked radial sprites drawn with `lighter`. LUT = a per-biome baked tint overlay at 8%. Vignette = a prebaked image.

### 5.5 Night ("dark theme") is the showpiece, on both backends

When `Oomba.theme.mode === 'dark'`, or during the demo's sunset transition:
- the sky shifts to deep teal, with the moon and stars;
- ambient light drops to 35%;
- entities tagged `lantern` light up (point lights on Glaze; baked glow sprites on Paper);
- a firefly emitter starts (30 on low, 80 on mid, 160 on high);
- emissive masks glow: eye highlights, spark and gem cores, lantern glass, the Oomba mascot's spark antenna.

Night on **Paper** has its own snapshot gate (§13) so it is never second-class.

## 6. Art system

### 6.1 Rig and clips

- **Bones (11):** root, hip, chest, head, armL, armR, handL, handR, legL, legR, plus optional `tail`, `earL`/`earR` and `wingL`/`wingR`. An optional bone the species lacks is a no-op.
- **Procedural clips** for every species: `idle`, `walk`, `run`, `jump`, `fall`, `land`, `hurt`, `cheer`, `think`, `sad`, `sleep`, `talk`, `wave`. They are made of sines, springs and squash, with no frame data.
  - `ent.state(name)` blends over 120 ms.
  - Secondary motion: ears, tail and hair follow on springs (k 120, ζ 0.5). Eyes look at the target or the pointer. Blink and breathe always run.
  - `talk`: the mouth flaps on `SpeechSynthesisUtterance` `boundary` events when the browser fires them, otherwise on a 110 ms seeded timer.

### 6.2 Character spec (`Oomba.char`)

```js
Oomba.char({
  species: 'oomba'|'kid'|'fox'|'bunny'|'frog'|'bee',       // P1 set; unknown → nearest by edit distance, else 'oomba'
  body: 'bean'|'ball'|'pear',  size: 1,                     // size clamped 0.6..1.4
  colors: { base:'peach', belly:'cream', accent:'spark' },  // role/hue names only; hex → nearest hue
  skin: 0..7, hair: { style:'puffs'|'bob'|'curls'|'spiky'|'braids'|'buzz'|'long'|'cap', color:'cocoa' },
  outfit: { top:'tee'|'hoodie'|'dress'|'overalls', color:'sky' },
  face: { joy:-1..1, surprise:0..1, worry:0..1, look:[x,y] }, mood: 'happy'|'sad'|'surprised'|'determined'|'thinking'|'sleepy'|'wink',
  wear: ['scarf','glasses','crown','wizard-hat','backpack','headphones'],  // P1: 6 items
  seed: 42,
})  // → frozen, validated spec (also accepted by world.spawn)
```

**Phase 1 species (6):**
- `oomba`, the mascot proposal: a mint bean with the logo's two ring eyes looking up at a spark antenna (emissive).
- `kid`: 8 skin tones, 8 hair styles, 4 outfits, no gendered defaults.
- `fox`, `bunny`, `frog`, and `bee` (hazard: coral stripes plus a triangular stinger).

### 6.3 Props, icons, biome

- **About 25 props:**
  - treasure: spark, coin, gem, heart, key, chest
  - world: crate, platform, spring, flag, gate, sign, lantern, bush, flower, tree, rock, cloud, mushroom
  - learning: number tile, letter tile, fraction pie, clock
  - hazards: spikes, thorn
  - Each prop has `idle` (bob), `collect` (pop + burst) and `break` states.
- **About 40 icons:** 24-unit grid, round caps, SVG strings. They cover the UI glyphs: play, pause, sound, music, settings, restart, home, check, cross, hint, lock, arrows, heart, spark, timer, move, jump, tap, drag, star-off, and so on. **The kit never draws emoji.**
- **Biome `meadow`**, day and night. It has:
  - an OKLab sky;
  - 3–4 smoothed-noise hill bands, inked on the top edge;
  - capsule clouds;
  - Poisson-disc flowers and bushes;
  - auto-tiled rounded ground with a grass lip (16-case marching-squares rule set);
  - a seeded variation.
- **Auto-dressing (phase 2b).** A game with no decoration code still looks lush:
  - The bands are taller and steeper: tops at 34/46/58/72% of the view height, 16/12/9/5% tall, so the sky is at most
    about 40% of a landscape frame. Every profile is normalised to its band; the far band of meadow, forest and snow is
    a mountain range ('peaks', snow caps). Band colours follow aerial perspective: far = clean sky blue mixed into the
    hue, near = the hue at full chroma (never a grey mix).
  - Each band carries a dressing recipe (`'kind:spacing'`, `c` = clusters of 2-4 with air between groups), seeded per
    prop (±30% size, mirrored flips) and drawn across the tile seam, with 20% headroom so tall trees never clip. The core
    draws trees (round and two pine shapes), bushes, flowers, mushrooms, cacti, palms and lollipops; the `dress` pack
    adds houses, fences, lamp posts, tents, beach huts, umbrellas, flags, cones, tyre stacks, rocks and grass tufts, and
    richer per-biome recipes. Portrait views grow the props with the view (up to 2.4×).
  - The `dress` pack also gives each biome foreground framing (big leaves, palm fronds, agave, snowy or candy mounds in
    the bottom corners, about 4-6% of the frame, swaying) and ambient life (bird flocks, gulls, butterflies, drifting
    leaves, snow, fish under the sea), on analytic paths: nothing is allocated per frame. Half as many on the low tier;
    reduced motion keeps the framing and drops the movers.
  - `Oomba.game({dress: 'off' | 'auto' | 0.2-2})`, `stage.setDress(v)`.
  - Colour: noon sky `#4FB4F7` → `#BFE8FF`; the day grade adds about 8% chroma; the vignette is 0.35 by day, 1 at
    night; clouds are white with a sky-blue shade at two depths (7 of them).
  - The low tier bakes 3 bands (was 2), so the mountains show on every device.
- **Bold style (phase 2b, `style-bold` pack).** `Oomba.game({style: 'bold'})` / `Oomba.style('bold')`. The core keeps
  only the switch: no blush, narrowed eyes (the upper lid covers about a quarter), thicker brows, 'determined' by
  default, and the rig and portraits apply the pack's proportions (legs ×1.6, head ×0.84 about the neck, body ×0.9:
  about 3 heads tall). The pack adds wear (`hood visor headset helmet cap-back`, `jersey bomber techvest`; visor and vest
  strip glow at night), a UI overlay under `.ok-bold` (deep surfaces `#121826`/`#1E2738`, neon mint/cyan/magenta/volt
  accents, 8-10 px corners, pill-shaped big buttons with a volt glow (the kit's rounded Play), a light rim on characters on the dark cards, a slanted title with a cyan-to-magenta face and a magenta glow edge,
  monospace HUD numbers), golden-hour light by default, and the biomes `cyber skate station haunted`.
- **Title lockup (phase 2b).** Each word of the title is a sticker: a gradient face (`titleHue`: spark→coral by default,
  mint, sky, coral), an Ink edge, a Cream rim and an Ink extrude, words tilted −4°/+2°, two-word titles stacked, about
  18-22% of the screen's height. The game's hero stands big (about 40% of the height) in the bottom-start corner (not on
  a fixed-camera set, whose cast is already big; on a tall phone up to 46% of the width, 3 vh clear of the bottom), Play
  is 76-90 px tall and breathes with one ring (the keyboard focus ring replaces the pulse, never both), the tagline is
  bigger, the wordmark is a Cream chip in the top corner (it reads on a night sky), the title pan is 2.5× faster, and
  a soft clear zone (5 px blur, faded) sits behind the logo, tagline and Play so busy scenery never crowds them.
- **Night sky (round 2).** The moon is bigger (170) with a bright glow that falls off softly; on a tall phone it hangs
  in the top end corner (84% across), clear of the title and the HUD. A character on a dark card (night results)
  gets a light rim.
- **Layout guards (round 2, in the `dress` pack).** At build time and after `setup()` the cast is moved just enough
  that no character starts cut off by the level's edge or on top of another (the hero stays put). While a game runs,
  two characters overlapping for over a second, or a big prop behind the title's Play button, give a one-time
  `[oomba]` warning that the Builder's playtest passes to the model. `w.levelNo` / `w.levelCount` tell a game which
  level it is on; `count:flag` in the HUD shows "3 of 10" (`w.hud.count.set(n, total)`). Speech bubbles sit a little
  higher (above the speaker's head with room for the tail).
- **Answer dock (phase 2b).** `Oomba.ui.ask` tiles sit on a deep grape dock (`#2B1F5C`), white with a 6 px coloured lip;
  right punches (1→1.12→1, 220 ms) and turns mint, wrong shakes (±6 px, 240 ms) and turns coral.
- **Sizes (round 2, brotli).** Core 94.6 KB (cap 95 KB; the vehicles and the shell, cactus, snowman and log props
  moved to `dress`, the layout guards live in `dress`, and the build strips comments and spaces from the shader
  sources, about 0.6 KB); `dress` 5.5 KB; `style-bold` 3.0 KB; art-animals 1.9, art-biomes 1.9, art-school 4.0.
- **Scale (phase 2b).** The landscape camera shows about 7.2 rows (was 8.4) with at most ~0.6 cell of soil; on a phone
  in portrait the hero is at least 21% of the height. HUD pills are 46 px with a 3 px Ink edge; the progress bar fills
  mint→spark.
- **Round 3 polish.**
  - Title: no blurred strip behind the lockup (the soft glow stays); Play sits in a `.ok-cta` wrapper with a soft halo,
    so scenery never seems to touch it. `titleBadge` (a canvas, e.g. `Oomba.art.toCanvas('pie', 110, '3/4')`) puts the
    game's motif under the lockup.
  - Results: the card's portrait is 156 px; the sparks get a glow behind them once lit; the scrim covers more of the
    scene; with the `dress` pack, paper confetti falls behind the card (`kit.celebrate(root)`, never over its text;
    off with reduced motion). The score count-up and spark pop-in were already there.
  - Speech bubbles try centred, then to either side, then higher, and take the spot that covers no pickup, face or
    `[data-ok-keep]` element.
  - The HUD flag meter follows the hero to the goal in every game until the game calls `w.hud.progress.set`.
  - A night sky's moon is 250 units (was 170); platformer framing shows about a cell of soil so feet never sit on the
    screen edge. Pickup sizes stay as they were (bigger defaults overflowed the first atlas page in the meadow demo and
    caused whole-page GPU uploads mid-play); a game that wants bigger sparks sets them in its legend
    (`$: { kind: 'spark', size: 1 }`), which the kit rules now suggest.
  - Bold style: HUD numbers use the game font (tabular figures), not monospace; the tagline is upright; the oomba logo
    pill is dark with a cyan edge.
  - The Builder's playtest gives a talk scene still running at the end a few more seconds (tapping bubbles and
    answers) before it reports the game as stuck.
  - Build: prose comments inside the CSS strings are stripped (`cssComments`), about 0.45 KB brotli.
  - Sizes: core 94.7 KB (cap 95), `dress` 6.0 KB, `style-bold` 3.0 KB.
- **Exports:** `Oomba.art.toSVG(spec) → string` (DOM portraits, the Builder preview), `toCanvas(spec, px) → HTMLCanvasElement`, and `toTexture(THREE, spec, px)` (the 3D bridge; `THREE` is passed in, never imported).

### 6.4 The player's avatar

`Oomba.avatar()` (kit 1.1.0; `Oomba.me()` is the same) returns the player's character spec.
- **Built (foundation step 3): the shared avatar.** A kid designs their own character once, on the Me page
  ("My Oomba character", `server/views/character.js` + `public/js/character.js`): kind (`kid oomba fox bunny frog bee`),
  body shape, one of 8 skin tones, hair style and colour, eyes (mood), top and its colour, a colour and an extra colour,
  one accessory, and a Bold variant for teens (a Bold hat `hood visor headset helmet cap-back`, a jacket `jersey bomber
  techvest`, Bold eyes). Real radio buttons in fieldsets, a sticky preview on phones, all 13 languages. The preview is
  drawn by kit 1.1.0 in a hidden same-origin frame (pinned with its hash), so the kit never touches the site's page.
- **Stored** as a small JSON parts spec (`users.character_spec`, migration 0036; `server/services/character.js`
  checks every value against the kit's own lists, at most 600 bytes), never a picture, a photo, free text or a name;
  cleared when the account is deleted. `POST /api/me/character {character}`, `DELETE /api/me/character`.
- **Games** get it as `BRB.user.character` (null for guests and accounts without one), and the kit turns it into the
  hero: `hero: 'me'` (the `Oomba.game` default), `Oomba.avatar()`, Sum Racer's player 1, Star Island's `hero: 'me'`
  (a `B.rig` of it), `B.rig(Oomba.avatar())` in any 3D game. In a Bold game its `bold.wear` is added and `bold.mood`
  replaces its eyes (default 'determined').
- **Defaults:** a guest gets the `oomba` mascot; an account with no character gets the old deterministic look (a hash
  of `BRB.user.avatar` and `displayName` picks the skin, hair and colours). Kit 1.0.0 games keep that old look.

### 6.5 Themes (kit 1.1.0)

`Oomba.game({ theme: 'castle' })` picks a whole look: a biome (sky, bands, ground), the time of day, an accent hue, the
biome's dressing recipe (ambient life, corner framing), a prop set and a music mood. The table is plain data in the
`dress` pack (`THEMES`, `ALIAS` in `kit/packs/dress.js`, also read by the server: the Builder's rules list each theme's
packs and props, the style lint checks names and packs).

| Theme | World (pack) | Light | Accent | Life | Props |
|---|---|---|---|---|---|
| meadow | meadow (core) | noon | mint | birds, butterflies | tree flower bush mushroom rock log |
| beach | beach (core) | noon | sky | gulls | sandcastle starfish shell boat |
| jungle | jungle (art-biomes) | 0.1 | mint | parrots, butterflies; palms, fronds | totem tree bush flower log |
| snow | snow (core) | noon | sky | snow | igloo snowman snowflake rock |
| desert | desert (core) | golden 0.36 | peach | birds | pyramid pot cactus rock |
| reef | reef (art-biomes) | under water | sky | fish, bubbles | clam pearl anchor starfish shell |
| space | space (art-biomes-2) | starry | grape | comets, saucers | ufo satellite rocket planet asteroid |
| candy | candy (core) | noon | coral | butterflies | sweet donut candycane cupcake gift |
| haunted | spooky (art-biomes-2) | dusk 0.7 | grape | bats, little ghosts | pumpkin ghost cauldron sweet lantern |
| castle | castle (art-biomes-2) | 0.22 | coral | birds, butterflies | tower banner shield torch chest flag |
| cyber | cyber (style-bold; Bold style) | night | sky | — | drone sign block lantern |
| stadium | stadium (art-biomes-2) | noon | sky | birds, confetti | ball goalpost trophy medal flag |
| forest / autumn / city | core / art-biomes | 0.1-0.3 | | | |

- **New art:** `art-biomes-2` (3.2 KB br): castle (a crenellated keep with cone-roofed towers and pennants in the
  accent, striped tourney tents, cobbled ground), stadium (stands full of a cheering crowd under a roof, floodlight
  masts that glow at night, plain pitch-side boards with no words or logos, a striped pitch with a chalk-line lip),
  space (an alien teal planet: moon-base domes with lit windows, dishes, glowing crystals, a ringed world as the sun),
  spooky (a friendly haunted hill: a crooked manor with warm windows, bare trees, smiling pumpkins that glow).
  `art-props` (3.1 KB br): 25 props for the prop sets; the treasure ones (`sweet snowflake starfish pearl`) are
  collectible like coins. The `dress` pack (8.0 KB br) gains the theme table and engine and five critters (bat, ghost,
  comet, saucer, confetti, plus parrot), flown on the existing paths: a recipe's life entry `'bat:bird'` is the bat
  sprite on the bird's path (the core reads `sprite:path`; plain names work as before).
- **Light:** the theme's time of day applies in the light mode (a dark site is still night); `stage.toNight(false)`
  goes back to the theme's light, not to noon.
- **Recolour:** `theme: { name, accent, palette: { hills, ground, sky } }` with hue names. Each recoloured colour is
  mixed toward the hue and then brought back to its old WCAG luminance (chroma drops only when the gamut needs it),
  so every contrast in the scene (hero, pickups, Ink against the bands and ground) stays what the theme was drawn
  with; `tests/unit/kit-themes.test.js` checks every theme × hue within 5%. Spark is never an accent (rewards only).
  The recoloured world is a copy of the biome with the same recipe.
- **Fallbacks:** a theme whose pack is missing warns with the pack to add and shows a core world (`alt`); without the
  dress pack the core warns once. `'light' | 'dark' | 'auto'` in `theme` still mean the mode (kit 1.0 games); `mode` is
  the new key for it. An explicit `biome` next to a theme replaces only the world.
- **Core cost:** about 0.1 KB br (the hook call, the `theme` / `mode` split in validation, `Oomba.theme.look` and
  `names`, `K.recipes` for packs, and the `sprite:path` life entries). Core 94.9 KB br (cap 95).
- **Preview:** `/kit?scene=themes&th=castle` (`kit/demo/themes.html`: one small platformer with the theme's props).

### 6.6 The 3D bridge (kit 1.1.0, pack `bridge-3d`)

three.js games get the Oomba Ink look from one pack (`kit/packs/bridge-3d.js`, 10.4 KB br, cap 14 KB), so 2D games
pay nothing. `Oomba.three(THREE, { renderer, scene, camera, theme })` → a bridge `B` (the API is in
[kit-api.md](kit-api.md#the-3d-bridge-kit-110-pack-bridge-3d)). `THREE` is passed in; the pack never imports it.

- **Materials.** `MeshToonMaterial` with a gradient map: 3 soft cel steps (Playful), 2 hard steps (Bold), and a rim
  term in the fragment shader (Cream, 0.22; Bold: neon cyan, 0.5; none on the ground). One shader program for every
  toon material (`customProgramCacheKey`), cached per colour. `B.inkify(root)` turns a game's Lambert / Phong /
  Standard materials into them (faceted meshes get face normals, since toon has no `flatShading`).
- **Ink.** An inverted hull (BackSide, Ink) pushed out along a smoothed normal in clip space, so the line is the same
  number of pixels at any distance (about 5% of a character's on-screen height, as in 2D: `clamp(0.0055 h, 2.2, 5)` px,
  thinner past `0.45 × size` and 0.82× in Bold). It works for instanced meshes (one more draw call for a whole forest).
  Far hulls hide by distance (the LOD follows the quality level); on a low tier only `important` objects keep Ink.
- **Worlds from themes.** The theme table from step 1 (`kit.useTheme`): the sky gradient at the theme's time of day
  (the core's sky keys, tinted by the biome), fog in the horizon colour, a hemisphere light and a sun (warm by day,
  blue at night), the land in the biome's near band with its ground colour as the plaza, three rings of faceted hills
  in its band colours (peaks when the biome has them), the theme's props as billboards of their 2D art, clouds by day
  and stars at night or in space. Bold: dusk or later, surfaces 16% deeper, a neon ridge line in the accent, and a
  glowing neon grid on the tech worlds (cyber, station, skate, space).
- **Characters.** `B.sprite(spec)` is the 2D art itself on a camera-facing card (the portrait canvas, feet at the
  origin), with the kit's motion (breathe, waddle, hop, squash on land) and flipping by heading. `B.rig(spec)` builds
  the same spec in 3D: species shapes (ears, tails, beaks, antenna and spark, bee stripes and wings, kid hair styles and
  outfits), ring eyes (a white disc with an Ink pupil; the hull draws the ring), blush in Playful, Bold proportions
  (`style.legs`, `style.head`) and narrowed eyes in Bold. Each moving part is baked into one vertex-coloured mesh
  (`B.bake`), so a rig is about 17 draw calls with its Ink. Clips: idle, walk, run, jump, cheer, wave, hurt, land, and
  a blink.
- **Performance.** A device tier (cores, memory, max texture; `?okTier=` overrides): pixel ratio cap 1 / 1.25 / 1.5,
  shadows off on low, 6 / 10 / 14 props. A governor steps quality down after 2 s under ~28 fps (pixel ratio, shadows,
  outline distance, half the props) and back up after 6 s over 55 fps; `B.run` caps low-tier devices at 30 fps. A game
  with its own ladder (Star Island) passes `governor: false`. The demo scene is about 40-50 draw calls.
- **Motion.** Decorative motion (prop sway, sparks, breathing, hops) is scaled by `B.motion`: 0 with reduced motion,
  0.75 in Bold. Walking legs still move (they say where the hero goes).
- **Screens.** The kit's DOM screens work over the WebGL canvas as they are (`Oomba.time.start()` runs the clock): the
  title with the hero's portrait, how-to, HUD, the quiz card (the ask dock), pause and results; Bold's UI comes from
  the `style-bold` pack.
- **Star Island** (the 3D template) uses it: `theme` and `style` in CONFIG, its colours `''` = the theme's
  (`B.look.land`), the sky and light from `B.sky`, `B.inkify(scene)`, the hero baked with Ink, Ink on trees, rocks and
  floating rocks, `B.update(dt)` in its loop; its own quality ladder stays (`governor: false`). About 46 draw calls.
- **Preview:** `/kit?scene=three&th=castle&style=bold&view=cast` (`kit/demo/three.html`): a small spark hunt with a
  quiz, or `view=cast` (rigs in front of their 2D twins).
- **Versioning.** `bridge-3d` was first added beside the locked 1.1.0 with `node scripts/build-kit.js --packs` (it builds
  only the packs the lock does not list, and checks the core and every locked pack byte for byte). Foundation step 3
  (1.1.0 had not shipped yet) rebuilt 1.1.0's core (`Oomba.avatar()`, and `bridge-3d` in `Oomba.pack()`'s pack names)
  and re-locked it with all eight packs, `bridge-3d` included; the seven other packs kept their bytes.

### 6.7 Live class games (kit 1.1.0, pack `live`)

`Oomba.live` (`kit/packs/live.js`, about 6 KB br, cap 10 KB) is the API a game uses to be hosted live with Oomba Live
(the reference is [kit-api.md](kit-api.md#live-class-games-kit-110-pack-live); the wire protocol is
[live-protocol.md](live-protocol.md)). It is thin on purpose: the transport (a private `MessagePort` to the page, the
data-shape checks, text entry off) is the SDK's, which is not pinned, and every limit is the server's, so a protocol fix
never changes pinned pack bytes. The pack ignores messages and fields it does not know. What it adds over the
transport: the roster with names in the player's language, phases as events, the server clock, quiz helpers, moves
sent at most 10 a second, interpolation (120 ms behind, the short way round, a 5 m jump snaps), `crowd(B)` for the 3D
bridge (rigs near, billboards further, one instanced shape far away: 4/6, 8/10 or 12/16 by device tier; nameplates for
the 8 nearest within 18 m; at most one new rig a frame) and `flat()` for 2D. Solo play is unchanged.

- **Versioning.** Added beside the locked 1.1.0 with `node scripts/build-kit.js --packs` (the core and the eight locked
  packs are checked byte for byte; 1.0.0 is untouched); 1.1.0's `manifest.json` and `KIT_PACKS['1.1.0']` gain one
  entry. It goes into `kit/SHIPPED.json` only with the owner's sign-off, in the change that ships it; until then a
  rebuild may change its hash (the seed games that pin it are re-stamped with it).
- **Reference games:** Quest Race and Question Battle (the built-in modes, `seed-games/`), the platform lobby
  (`server/live/lobby.html`) and Hero of Sunvale's live mode.

## 7. Public API (namespace `Oomba`, alias `OK`)

The API has three adoption levels:
- **A.** `Oomba.game` (declarative; the Builder target)
- **B.** `Oomba.stage` (imperative world)
- **C.** drop-in helpers (`Oomba.draw`, `Oomba.juice`, `Oomba.ui`) for porting hand-drawn games one function at a time

Lower layers never depend on higher ones.

### 7.1 Core

> The exact, current signatures are in [kit-api.md](kit-api.md); this section is the original design. Two notes that
> differ from the design below: `Oomba.input.axis()` takes no name (one movement axis), and the clocks are split:
> `Oomba.time.wait/after/every` and `Oomba.wait/after/every` run on the game clock; `Oomba.time.real.*` on real time.

```ts
Oomba.version: '1.0.0'; Oomba.api: 1; Oomba.tier: 'low'|'mid'|'high'; Oomba.backend: 'paper'|'glaze'
Oomba.color(role: string, step?: 'tint'|'light'|'base'|'shade'): string        // '#66C792'
Oomba.tokens: { radius:{sm:12,md:20,lg:32}, space:[4,8,12,16,24,32], outline(hPx:number):number, motion:{…§2.6}, z:{…} }
Oomba.theme: { mode:'light'|'dark', biome:string, on(ev:'change', fn):off }
Oomba.rand(seed:number|string): { float():number, int(a,b):number, pick<T>(arr:T[]):T, chance(p):boolean, shuffle<T>(arr:T[]):T[] }
Oomba.tween(target:object, props:object, opts?:{ms?:number, ease?:EaseName|((t)=>number), delay?:number}): Promise<void> & {cancel():void}
Oomba.tween.seq(steps:(()=>Promise)[]): Promise; Oomba.tween.all(ps:Promise[]): Promise
Oomba.tween.stagger(items:any[], fn:(item,i)=>Promise, gapMs:number): Promise
Oomba.spring(target:object, prop:string, opts?:{k?:number, zeta?:number}): {to(v:number):void, value:number, stop():void}
Oomba.ease: { linear, sineIn/Out/InOut, quad…, cubic…, quart…, expo…, back…, elastic…, bounce… }  // 31 total
Oomba.time: { now:number /*ms, rAF clock*/, scale:number /*assist speed*/, hitstop(ms:number):void, slowmo(scale:number, ms:number):void }
Oomba.input: {
  down(action):boolean, pressed(action):boolean, released(action):boolean, axis(name='move'):{x:number,y:number},
  pointer:{x,y,down:boolean}, on(ev:'tap'|'swipe'|'drag'|'flick'|'longpress', fn):off,
  map(bindings:{[action]:string[]}):void,  // 'KeyW','Space','pad:A','pad:left','swipe:up','touch:A'
  touch(layout:'stick+jump'|'stick'|'dpad'|'buttons'|'none'):void }      // DOM controls, shown after first touch
// default actions: move(axis), jump, action, pause, confirm, back
Oomba.t(key:string, vars?:object): string;   Oomba.strings(table:{[lang]:{[key]:string|{one,other,…}}}): void
Oomba.num(n:number, opts?:Intl.NumberFormatOptions): string;  Oomba.lang:string;  Oomba.dir:'ltr'|'rtl'
Oomba.fonts.ready: Promise<void>   // resolves on load or after 1.5 s (system fallback)
Oomba.sfx(name:string, opts?:{pitchVar?:number /*default .05*/, at?:{x:number}, volume?:number}): void
  // passes through BRB.sfx names; kit synth: pop whoosh correct wrong spark step land select levelup count hurt win
Oomba.music(bed:'meadow'|'calm'|'off'): void;  Oomba.say(textOrKey:string, opts?:{who?:Entity, vars?:object}): Promise<void>
  // BRB.speak + caption + mouth flap + 60% music duck; queued, never overlapping
Oomba.save: { define({v:number, defaults:object, migrate?:(old,fromV)=>object}):void, get():object, set(patch:object):void }
Oomba.settings: { motion:'auto'|'reduce'|'full', captions, readAloud, textSize:1|1.25|1.5, speed:.5|.75|1,
                  assist:'none'|'hearts'|'nofail', contrast:boolean, cvd:boolean, leftHanded:boolean, graphics:'auto'|'simple'|'fancy',
                  on('change', fn):off }
Oomba.validate(kind:'char'|'prop'|'game', spec:object): {spec:object, warnings:string[]}
Oomba.me(): CharSpec
```

### 7.2 Game (level A) (built)

> Built in `kit/src/game.js` and `kit/src/level.js`; the exact, current signatures (including additions over this
> design: `intro`, `setup`, `on.title/results/checkpoint/door/spring/stomp/skip`, `w.story`, `w.setHero`, levels as an
> array, `game.start()/next()/hero()`, `heroSize`, `trySay`, the extra legend characters `o k D E M i C`) are in
> [kit-api.md](kit-api.md). Differences from the sketch below: sizes in legends and `w.spawn` are in cells; `w.score(n)`
> adds points and `w.points` reads them; `Oomba.level.generate` takes `cell`. "Oomba Meadow" and "Oomba Quest" (`/kit`)
> are built on it: the meadow lost its hand-written tile collisions, coyote time, magnet, hazards, scenes and test hooks.

```ts
Oomba.game(spec: {
  api: 1, title: string, biome?: 'meadow', theme?: 'auto'|'light'|'dark', backend?: 'auto'|'paper'|'glaze',
  size?: [w,h] /*design units, default [960,540]*/, fit?: 'expand'|'letterbox',
  controls?: 'platformer:kid-easy'|'platformer:snappy'|'platformer:floaty'|'topdown'|'tap'|'none',
  camera?: 'follow'|'fixed'|{follow?:true, lookAhead?:number, deadzone?:[number,number], bounds?:'level'},
  hud?: string[],            // 'score' 'lives:3' 'timer:60' 'progress' 'combo' 'count:coin' 'pause' 'sound'
  howTo?: {icon:string, text:string /*key*/}[],   // ≤3 cards, each its own key
  strings?: {[lang]:{[key]:string}},
  level?: Level, hero?: CharSpec|'me'|string,
  mirrorWorld?: boolean, seed?: number|string,
  setup?(w: World): void,
  update?(w: World, dt: number): void,   // fixed 1/60 s, scaled by time.scale
  on?: { collect?(w, item), hit?(w, hazard), land?(w), goal?(w, g), gate?(w, g), talk?(w, npc),
         timeup?(w), start?(w), win?(w), lose?(w), [custom:string]?(w, ...args) },
}): Game
Game: { run():void, pause():void, resume():void, restart():void, state:'title'|'howto'|'countdown'|'play'|'paused'|'win'|'lose' }
```

`World`:

```ts
w.spawn(kind: string|CharSpec, opts?: {at?:string|{x,y}, x?, y?, as?:'player'|'npc', parts?:(string|{[part]:object})[],
        colors?, wear?, z?, tag?:string}): Entity
w.find(tagOrKind:string): Entity|null;  w.all(tagOrKind):Entity[];  w.hero: Entity
w.score(n:number): void;  w.lives: number;  w.hurt():void;  w.heal():void
w.win(opts?:{stars?:0|1|2|3, score?:number, say?:string}): void;  w.lose(opts?:{say?:string}): void
w.ask(q:{q:string, a:number|string, choices?:number /*tiles*/|(number|string)[], pad?:boolean, tiles?:string,
         hint?:string, timeoutMs?:number}): Promise<boolean>
   // OPENS A MODAL: the sim is paused (loop stops updating, camera/idle anims keep rendering), input routed to the widget,
   // resolves after the feedback animation; on timeout (default none) resolves false; pause screen closes it with false.
w.say(who:Entity, key:string, vars?):Promise<void>   // bubble + read aloud + caption
w.after(ms, fn):cancel;  w.every(ms, fn):cancel;  w.emit(ev, ...a);  w.rand: RNG (seeded from spec.seed)
w.cam: Camera;  w.fx: Juice;  w.stage: Stage;  w.theme: {mode, timeOfDay:number /*tweenable 0..1*/}
```

**`Entity`:**

```ts
{ x, y, vx, vy, rot, sx, sy, alpha, z, tag, kind, spec, grounded:boolean,
  state(clip:string):Entity, look(at:{x,y}|null):Entity, mood(m:string):Entity,
  pop():Promise, squash(amt:number, ms?:number):void, flash():void, wobble():void, float(text:string, role?:string):void,
  say(key:string, vars?):Promise, add(part:string, opts?):Entity, remove(fx?:'puff'|'sparkle'|'none'):void,
  on(ev:string, fn):off, open?():void /*gates*/, hint?():void }
```

**Automatic juice** (no code needed):

| Event | What happens |
|---|---|
| collect | pop + sparkle burst + float "+n" + `coin`/`spark` sfx with pitch variation |
| hurt | hit-stop 60 + shake 0.4 + flash + 1 s invulnerability blink + `hurt` |
| land | squash 0.8 + dust + `land` |
| jump | anticipation squash, then stretch 1.15 + `whoosh` |
| win | 300 ms slow-mo 0.3 + spark iris wipe to the results screen + confetti |
| lose | gentle "So close!" screen |

**`level.grid`**: **strictly one character per cell.** Rows may be ragged; spaces and `.` are empty. Built-in legend (a game may extend it with single characters only; a multi-character key is a validation error):

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` | ground (auto-tiled) | `=` | platform (one-way) |
| `P` | player start | `G` | goal flag |
| `$` | spark/coin pickup | `H` | heart |
| `Q` | quiz gate (fires `on.gate`) | `^` | spikes |
| `B` | bee (patrol hazard) | `S` | spring |
| `K` | checkpoint | `L` | lantern |
| `N` | NPC (species from `legend.N`) | `~` | water (hazard-free swim) |

```ts
Oomba.level.grid(rows:string[], legend?:{[ch:string]:string|{kind:string, ...opts}}, opts?:{cell?:number /*default 48*/}): Level
Oomba.level.generate({seed, length, difficulty:0..1}): Level     // P1: meadow platformer only
```

**Parts** (P1, 15):
- movement: `player`, `patrol`, `follow`, `bob`, `fly`
- roles: `collectible`, `hazard`, `goal`, `checkpoint`, `spring`, `quizGate`, `talk`, `lantern`
- feel: `shadow`, `glow`

Default parts every entity gets: `blink`, `breathe` and `shadow` (where they apply).

**Controls presets:** `platformer:kid-easy|snappy|floaty`, `topdown`, `tap`. All include:
- coyote time 90 ms;
- jump buffer 110 ms;
- variable jump height;
- fall gravity ×1.6;
- hitboxes at 80% of the sprite;
- a pickup magnet radius of 0.6 × the sprite size.

### 7.3 Stage (level B)

```ts
Oomba.stage(canvas?: HTMLCanvasElement, opts?: {api:1, size?:[w,h], fit?:'expand'|'letterbox', backend?, biome?}): Stage
Stage: { layers:{sky,far,world,fx,front}, camera:Camera, particles:Particles, ui:UIRoot,
         add(specOrName, opts):Entity, update(fn:(dt)=>void):off, draw(fn:(ctx:CanvasRenderingContext2D, k:DrawKit)=>void):off,
         light(opts:{x,y,follow?:Entity, radius:number, color:string, intensity?:number}):Light, theme(mode):void, destroy():void }
// draw(): an escape hatch on a world-space overlay canvas (Paper path), composited above `world`.
Camera: { follow(e, {lookAhead?:number=.25 /*of viewport*/, deadzone?:[.2,.3], smooth?:.12}), bounds(r), shake(trauma:number),
          punch(zoom=1.06), frame(entities:Entity[]), pan(to:{x,y}, ms):Promise, zoom:number, x, y, toScreen(p), toWorld(p) }
Particles: burst(preset:'sparkle'|'dust'|'confetti'|'coins'|'splash'|'smoke'|'hearts'|'fireflies'|'sparks', x, y,
                 opts?:{n?:number, color?:string, dir?:number}): void
```

### 7.4 Helpers (level C, for ports)

```ts
Oomba.fit(canvas, {size:[w,h], fit, dprCap?}): {scale, offsetX, offsetY, dpr, off():void}
Oomba.draw: { panel(ctx,x,y,w,h,{fill?,radius?}), button(ctx,…), rrect(ctx,x,y,w,h,r), ring(ctx,x,y,r,w),
              spark(ctx,x,y,r,{fill?}), sprite(ctx, specOrName, x, y, {size, state?, flip?}), text(ctx, str, x, y, {size, weight, max, align, role}),
              sky(ctx, w, h, {biome, mode}) }     // all kit-styled; sprite() uses the atlas
Oomba.juice: { pop(el|ent), shake(trauma, el?), hitstop(ms), float(text, x, y, role?), burst(preset, x, y, opts?), confetti(), flash() }
             // work on DOM elements too (WAAPI), so DOM games get kit juice
```

### 7.5 UI (DOM)

```ts
Oomba.ui.title({title, subtitle?, hero?:CharSpec, heroSize?, brand?=true, play?:()=>void, pause?=false}): Promise<void>
Oomba.ui.howTo(cards:{icon, text}[]): Promise<void>
Oomba.ui.countdown(n=3): Promise<void>
Oomba.ui.pause(): Promise<'resume'|'restart'|'quit'>       // also has the sound switch
Oomba.ui.win({stars, score, best?, hero?, title?, pause?}): Promise<'again'|'next'>
Oomba.ui.tryAgain({score?, best?, say?, hero?, title?}): Promise<'again'>
Oomba.ui.settings(): Promise<void>
Oomba.ui.hud(widgets:string[] /* 'score' | 'lives:3' | 'timer:60' | 'progress' | 'combo' | 'count:icon' */,
             opts?:{lives?, total?, countIcon?, pause?=true, sound?=true, onPause?(result)}): Hud
  // hud.score.{value, add(n), set(n)}, hud.lives.{value, lose(), gain(), set(n)}, hud.timer.{start(s, onEnd), left, stop()},
  // hud.progress.set(0..1), hud.combo.bump()/reset(), hud.count.{add(n), set(n, total)}, hud.pause()
  // unknown widget names warn; P / Esc / Start and a lost focus open the pause screen; the result goes to onPause and Oomba.on('pause')
Oomba.ui.button(label:string, {kind:'hot'|'go'|'quiet'|'icon', icon?, big?, onPress}): HTMLButtonElement
Oomba.ui.toast(text, {ms?}); Oomba.ui.banner('correct'|'wrong', reason?:string)
Oomba.ui.ask({q, a (or answer: the right VALUE), choices: values[] | number, hint?, tries?=2, who?:Entity, index?}): Promise<boolean>
Oomba.ui.bubble(ent|{x,y}, textOrKey, {portrait?, readAloud?=true, ms?}): Promise<void>
Oomba.ui.dialog({title?, text?, portrait?, mood?, buttons?:[{label, kind?, value?, icon?}]}): Promise<value>
Oomba.ui.portrait(spec, {size?, mood?}): HTMLCanvasElement
Oomba.ui.announce(text): void           // polite live region
Oomba.ui.caption(text, {ms?}): void     // shown when captions are on; key sounds caption themselves (Oomba.sfx)
```

- **Structure:** one `<div class="ok-ui" dir lang>`. All classes are prefixed `ok-`. The CSS is injected once as `<style>`. There is no shadow DOM, so `inspect()` sees the UI.
- **Buttons:**
  - pills with a `0 4px 0 <press>` shadow that collapses to 1 px on `:active` within 80 ms;
  - `hot` = Spark / `#C99A00` with Ink text; `go` = mint / leaf; `quiet` = cream with a 2 px Ink border;
  - at least 48 px tall (64 px on title and results screens);
  - focus ring: 3 px `--focus` (Ink in light, Spark in dark);
  - the `select` sfx on press.
- **Screens:**
  - **pause and modals:** an Ink scrim at 42% (55% at night) with a light blur, so the world reads as paused, not broken;
  - **results:** sparks land one by one with pop + `spark` sfx, rolling score, "New best!" badge, confetti;
  - **try-again:** the hero in `sad` → `cheer` encourages the kid ("So close! Try again"), with a best-score ghost. Never a skull or "GAME OVER".
- **HUD:**
  - pills at the start edge, pause and sound at the end edge, inside `env(safe-area-inset-*)`;
  - mirrors for RTL;
  - rolling tabular digits; hearts pop on loss; the timer is a clock face whose mint pie drains with the hand (coral with a pulse in the last 10 s);
  - phones (≤ 600 px): one compact row (counter, hearts, clock, flag meter) and one menu button (sound is in the pause screen); the combo is a badge on the counter.
- **Focus:** a focus trap on each modal; arrow keys and the gamepad d-pad move between buttons; 1–4 answer quiz tiles.
- **Ask widget:**
  - **correct:** mint ✓ banner + sparkle + `correct`;
  - **wrong (first miss):** soft wobble + coral ✕ badge on the pick + a gentle `wrong` tone + the hint and "try again"; the right tile is not shown;
  - **wrong (last miss):** the correct tile highlighted with ✓ and "The answer is …". Never a buzzer.

### 7.6 Test hooks

`window.__brbTest` is created or merged: existing keys are never replaced.

```ts
{ state():{scene, score, lives, timeLeft, hero:{x,y,state}, tier, backend},
  start():void, win():void, skip():void /*skip intros/anims*/,
  step(n:number):void /*advance n fixed steps with a frozen clock*/,
  seed(n):void, frameStats():{p50,p90,p95,max,draws,pages,particles},
  setTier(t), setBackend(b), setTheme(m), setLang(l) }
```

## 8. Input

- **Keyboard** by `code` (layout-independent): WASD and arrows, Space/Z/W/↑ = jump, X/Enter = action, P/Esc = pause.
- **Gamepad** (standard mapping, polled in the loop): left stick and d-pad = move, A = jump/confirm, B = back, Start = pause.
- **Pointer:** Pointer Events with capture.
- **Touch controls** are DOM, so `inspect()` sees them:
  - they appear on the first `touchstart`;
  - floating stick bottom-start, 72 px jump button bottom-end;
  - 40% opacity at rest;
  - a left-handed mirror setting;
  - inside safe areas.

## 9. Audio

- **SDK names** go through `BRB.sfx`. If one is missing, the kit synth plays it. The kit honours `BRB.sfx.muted` and `__brb_muted`.
- **Every play** gets ±5% pitch variation and stereo pan from the screen x.
- **Music:** 2 procedural beds in P1 (meadow, calm). They are a pentatonic step sequencer with soft triangle and square waves, with separate music and sfx volumes. They duck to 40% while speaking, and mute with the sound toggle.
- **Captions:** speech and key sounds ("[sparkle]", "[gate opens]") appear in a caption strip when captions are on.

## 10. Text, i18n, RTL, CJK

- **Kit chrome strings, in all 13 site languages:** Play, Pause, Resume, Restart, Settings, Sound, Music, Best, New best!, So close!, Try again, Play again, Great!, Level, Score, Time, Lives, correct and wrong phrases, How to play, the settings labels, and the graphics labels. That is about 45 keys, verified by an extended `scripts/i18n-check.js`.
- **Game strings:** a missing language falls back to `en`.
- **Plurals and numbers:** plurals use `Intl.PluralRules`; numbers use `Intl.NumberFormat`.
- **World text:** drawn with `fillText`, `ctx.direction = Oomba.dir`, and cached as an atlas entry keyed by (text, style, size bucket).
- **Typewriter:** splits with `Intl.Segmenter`. Arabic and Hebrew are revealed by **word**, ja and zh by grapheme, other scripts by grapheme.
- **Auto-fit:** text shrinks to at least 70% to fit, then wraps. A dev warning fires if it still overflows.
- **RTL:** the DOM UI, HUD, arrows and progress bars mirror. The world, maths, clocks and physics never mirror unless `mirrorWorld: true`.

## 11. Accessibility

The settings panel (pause and title screens) holds these options. They are saved through `Oomba.save` under the `__ok_settings` key. Cross-game sharing is phase 2.

| Setting | What it does |
|---|---|
| reduced motion | as in §2.6 |
| captions | shows the caption strip (§9) |
| read-aloud | reads text aloud |
| text size | 100, 125 or 150% |
| game speed | 50, 75 or 100% (`time.scale`) |
| assist | extra hearts, or no-fail |
| high contrast | outlines ×1.5, plain sky, no parallax, no bloom |
| colour cues | stripes on hazards, ring halos on pickups (role shapes are always there) |
| left-handed controls | mirrors the touch controls |
| graphics | Auto / Simple / Fancy |

- All UI is labelled DOM buttons.
- World events go to an `aria-live=polite` region ("Spark! 5 of 12", "Gate opened", "You won! 3 sparks").
- UI text contrast ≥ 4.5:1 in both themes. Gameplay objects ≥ 3:1 against the biome background behind them.

## 12. Performance rules

- **Budgets:** 60 fps target, ≤ 4 ms of logic, zero per-frame allocation (checked in e2e by sampling `performance.memory`, Chromium only), ≤ 2 draw calls per layer per atlas page on Glaze.
- **Baking:** time-sliced at ≤ 4 ms per frame. Everything the scene declares is pre-baked behind the title screen.
- **Fit:** one `fit` handles DPR, safe areas and resize for every kit game, replacing per-game `resize()`.

## 13. Test plan

### Unit (`node --test`, importing `kit/src` directly)

- **Maths and rendering primitives:**
  - easing endpoints (0 → 0, 1 → 1), monotonic where expected, back/elastic overshoot bounds;
  - the spring settles within tolerance;
  - `rand` golden values;
  - the atlas packer never overlaps, and LRU eviction works;
  - size-bucket selection;
  - the display-list pool never grows in steady state.
- **`validate`:** unknown species → nearest or `oomba`; hex → nearest hue; sizes clamped; **multi-character legend keys rejected**; unknown parts warn.
- **Geometry:** each species, prop and icon produces deterministic path strings (a hash snapshot per spec + seed).
- **`level.grid`:** parser (ragged rows, legend extension, unknown characters warn).
- **Governor:** fed synthetic frame-time series, it covers step-down timing, hysteresis, "tier changes only at a transition" and the context-loss demotion rule.
- **Ask:** the sim pauses, resolves on answer, timeout and pause-close.
- **i18n:** every chrome key in all 13 languages, plus plural forms.
- **Palette gate:** an extended `scripts/contrast.js` checks:
  - UI text pairs AA in both themes;
  - gameplay roles ≥ 3:1 against meadow day and night;
  - Machado 2009 protan, deutan and tritan simulation with OKLab ΔE ≥ 0.08 between player, reward, hazard and interact;
  - coral vs mint ΔL ≥ 0.15.
- **Platform:**
  - `kit.js`: SRI matches the file on disk, the version table only grows, manifest consistency, and the size gate (≤ 95 KB br).
  - `frameCsp` string includes the kit path in `script-src` and `font-src`.
  - Scanner matrix:
    - pinned tag → pass;
    - wrong SRI, unknown version, missing `crossorigin`, bare `/vendor/oomba-kit/` in code, kit in an import map → fail;
    - three.js games unchanged; `isThreeGame` false for kit games.
  - `snapshot.vendorFile` routes the kit.
- **Source grep over `kit/src`:** forbids `eval`, `Function(`, `fetch`, `XMLHttpRequest`, `Worker`, `import(`, `Date.now`, `Math.random`, `shadowBlur`, `.filter =` and emoji code points.

### E2E (`tests/e2e/kit.spec.js`, `TMPDIR=/tmp/bx E2E_PORT=59xx BRB_SNAPSHOTS=1`)

- **Real `/frame/<token>`:** zero page errors and zero `securitypolicyviolation` events, on both backends (`?okBackend=paper|glaze`; Glaze with `--use-angle=swiftshader` + the override, since detection would correctly pick Paper there).
- **Detection:** under SwiftShader with no override, Paper is chosen.
- **Context loss:** `WEBGL_lose_context.loseContext()` mid-play switches to Paper with no errors, and play continues.
- **Playthrough:** keyboard-only from title → how-to → play → (`step`) → quiz gate answered → goal → win screen; the try-again path; the quiz's wrong path shows the correct-answer highlight.
- **Touch:** emulation shows the touch controls after the first touch.
- **Gamepad:** a `navigator.getGamepads` stub drives a jump.
- **Layout:** DOM buttons ≥ 48 px; no overflow at 360 × 640.
- **Reduced motion:** no shake transform and no flash.
- **Snapshots:** title, play, quiz, win and try-again × {light day, dark night} × {en, ar} at 390 × 700 and 844 × 390.
  - Paper is pixel-baselined (fixed seed, `step`, bundled font).
  - Glaze is compared to Paper with a perceptual tolerance (post off, < 2% diff).
  - **Night on Paper has its own baselines.**
- **Perf (soft gate):** CDP `setCPUThrottlingRate(4)` at 1366 × 768 on tier low, 40 entities + 300 particles: p90 < 16.6 ms against the stored baseline.
- **Gallery:** every species × mood, prop, icon, widget, easing curve and particle preset, in both themes. These are art regression baselines.
- **Game layer and packs (built):** `tests/e2e/kit-meadow.spec.js` (the meadow on `Oomba.game`, end to end) and `tests/e2e/kit-quest.spec.js` (one `Oomba.game` call with all three packs: pinned pack tags, talk, spring, key and door, quiz gate, flag, the generated level 2; Glaze, dark, Arabic). Unit: `tests/unit/kit-game.test.js` runs whole rounds headless (`tests/support/kit-fake.js`) with `step(n)`: physics, every part, outcomes, presets, packs.

### Manual sign-off (phase 1 exit)

One Celeron or MediaTek Chromebook, one iPad (iPadOS 15/16) and one mid Android phone. Record `frameStats()` and the chosen tier.

## 14. Demo: "Oomba Meadow", the approval showcase (`/kit`)

**Goal:** about 90 seconds that make the owner say "wow". It runs through the real frame and CSP. The kit code is about 120 lines, which also proves the Builder story.

**Layout:** the `/kit` page has two tabs: **Demo** (the iframe) and **Gallery**.

**Drawer (toggles):**
- Theme: Day / Night
- Language: en / ar / ja / ru
- Reduced motion
- Graphics: Paper / Glaze / Glaze+ / side-by-side split (the same scene on both backends)
- Chromebook mode: forces low, DPR 1
- Colour-vision simulation: SVG `feColorMatrix` on the frame element (demo-only)
- Ultra lit-sprites flag
- A live `frameStats` readout

**Storyboard**

1. **Title (0–8 s).**
   - The meadow at golden hour pans slowly behind the DOM title card "Oomba Meadow" in Bricolage 800.
   - The Oomba mascot pops in (`backOut`). Its ring eyes blink and look at the pointer, and its spark antenna glows.
   - Clouds drift; flowers sway in the wind.
   - The yellow **Play** pill bounces on idle, and its press shadow collapses on tap.
2. **Make your hero (8–20 s).**
   - A customiser card lists skin (8), hair (8), outfit (4) and a wear item. Each tap re-bakes the kid live, and the kid reacts: `cheer` + sparkle.
   - "Use my avatar" applies `Oomba.me()`.
   - Then the 3-card how-to (move, jump, collect), read aloud, and the 3-2-1 countdown.
3. **Run (20–45 s).**
   - The kid runs right. The camera follows with look-ahead, and 4 parallax bands move.
   - Jumps show anticipation → stretch → land squash + dust. Coyote time is noticeable on ledge drops.
   - Sparks bob and are magnet-collected (pop + sparkle + "+1" + rising pitch on a streak). The HUD score rolls, and the combo meter fills.
   - **Characters:**
     - a **bunny** hops alongside on a `follow`;
     - a **frog** on a lily pad croaks when the kid lands near it;
     - a **bee** patrols over spikes. Touching it gives hit-stop, camera shake, a heart pop in the HUD and invulnerability blinks.
4. **The fox and the gate (45–60 s).**
   - The **fox** NPC waves. Its speech bubble types and reads aloud: "The gate wants a times-table answer!"
     - In `ar` mode the bubble shows Arabic, typed word by word, right-aligned.
     - In `ja` it shows Japanese, typed by character.
   - The **quiz gate** "7 × 6?" opens with 4 tiles and the world dims.
     - Wrong: the tile wobbles, a coral ✕ appears, 42 is highlighted with ✓, and a gentle tone plays.
     - Correct: a mint ✓ banner and a sparkle; the gate swings open with a spring.
5. **Sunset to night (60–75 s).** This is the "incredible" moment.
   - Crossing the gate tweens `timeOfDay` 0 → 1 over 3 s: the sky shader goes gold → violet → deep teal, the moon rises, stars appear.
   - **Lanterns** along the path ignite one by one: point lights, with a warm glow on the characters' lit sides.
   - **Fireflies** rise; sparks and the mascot's antenna bloom.
   - Toggling Paper in the drawer shows the same night as the sticker-book look with baked glows, smooth and still beautiful.
6. **Goal (75–90 s).**
   - The kid reaches the flag. Slow-mo 0.3, a camera `punch`, then a **spark iris wipe** to the results.
   - **Results:** 3 sparks land one by one with rising tones, the score counts up, a "New best!" badge appears, and confetti in brand colours falls. The fox, bunny, frog and mascot cheer in a row.
   - **Play again** returns to the title.
   - Losing (timer or hearts) shows the encouraging "So close!" with the kid's `sad` → `cheer` turn.
7. **Gallery tab.** Every character × mood, prop, icon, button, screen, HUD widget, easing curve (animated plots) and particle preset, in Day/Night × Paper/Glaze. It is the living style guide and the Builder's reference.

Everything is also reachable by keyboard, touch and gamepad. In `ar` the HUD, menus and bubbles mirror, and the world does not.

## 15. Phase 1 build order

1. **Foundation:** tokens, rand, tween, loop, input, i18n, save, validate, plus their unit tests and the source grep.
2. **Art + Paper:** the atlas and the Paper backend, then the art (grammar, rig, 6 species, props, meadow day/night). Paper must look finished on its own.
3. **UI kit:** screens, HUD, ask, bubbles, settings, captions.
4. **Game layer:** `game`, world, platformer, the 15 parts, `level.grid`, auto-juice, `__brbTest`.
5. **Glaze:** sky, emissive, lights, LUT, bloom, iris, the governor, context loss, and the Paper↔Glaze tolerance tests.
6. **Platform:** CSP, scanner, `kit.js`, snapshot and covers routing, `init.theme`/`init.motion`, and the `/kit` route.
7. **Demo + gallery**, the e2e snapshots, `docs/kit.md` and the `decisions.md` entry.

## 16. Phase 2 plan

1. **Builder:**
   - A byte-stable `KIT_RULES` block in `server/builder/prompt.js`, about 2.5 k tokens. The tag comes from `kitTag()`. It holds the §7.2 schema, the legend, the parts, species, props and HUD lists, the motion tokens and 3 example games. It replaces most of the "Art direction" prose.
   - **Style lint** (scanner `info`/`warn`, fed back to the playtest): raw hex outside `CONFIG`, emoji in `fillText`, fonts outside the kit, hand-built pause or results screens in `Oomba.game` games, `Date.now`/`setInterval` timing, `shadowBlur`/`filter` in rAF, hue-only meaning.
   - A `layer.js` tune hook, `Oomba.__tune({hero, speed})`, so "make the fox blue with a hat" is a spec edit.
   - An "upgrade kit" edit path.
2. **Templates:** rewrite the 7 2D templates on the kit (each about 3–8 KB, keeps `const CONFIG =` with single-line keys, passes the scan, gains i18n). Star Island gets the kit UI over three.js.

   **Built (Builder on the kit):**
   - `KIT_RULES` (`server/builder/kit-rules.js`) is generated by `node scripts/build-kit-rules.js` from the parts of
     [kit-api.md](kit-api.md) marked `<!-- builder:rules|api|examples -->` plus the kit's own lists (species, props and
     biomes per pack with their exact pinned tags, wear, hair, moods, clips, icons, controls, level kinds, roles, motion
     tokens). It is fixed text ending `SYSTEM_PROMPT` (one cached block); `prompt.js` puts in `kitTag()` /
     `kitPackTag(name)`. About 5 k tokens, not 2.5 k: the game-layer reference alone is about 2 k, and the model needs it
     exact. `tests/unit/builder-kit.test.js` fails when it is out of date and runs the three example games.
   - The Art direction section is now short: the kit is the art direction. `start_from_template` accepts every template.
   - Style lint: `server/services/stylelint.js`, in `scanVersion(...).lint` (never changes the status), only for kit
     games; codes `raw_hex font emoji_text emoji_dom own_screens own_loop timing slow_effect pack_missing icon_name
     motion none_world` (warn) and `colour_only gate_handler missing_key` (info). Every pattern is linear and games over
     300 KB are not linted (a 2 MB upload scans in about a second). The notes go back to the model after each version
     and in the playtest. 3D games only count colour codes in CSS.
   - Playtest: the model also gets the kit's `[oomba]` console warnings, and a probe that steps about 25 s of game
     time (holding right, jumping, answering questions, pressing the game's own buttons): a round where nothing
     happens, nothing is collected, a hero hidden under the game's own DOM, or an empty cover frame is reported.
   - Safety scan: a profanity fail carries a model-only `detail` (which word matched, and where), and everyday words
     in the kit's languages that start like a blocked word are allowed (fr "pas de retard").
   - Tune hook (**mock Builder only** today: the real model edits CONFIG lines instead; its `<script id="brb-builder-layer"
     data-kit="1">` tag marks it): kit 2D games get the kit layer (`layer.js`): `BRB_TUNE.speed | level2 | name | look | biome` lines
     applied through `Oomba.__tune` (not enumerable), which wraps `Oomba.game`, `Oomba.stage(...).add` and
     `Oomba.ui.title/win/tryAgain`: looks merge into character specs by species (`look.fox`) and for the hero
     (`look.hero`). Older games and the 3D island keep the original layer byte for byte.
   - Upgrade path: the model is told to keep an older game's style unless the builder asks; the mock rebuilds an older
     game on the kit template of its kind only on an unambiguous ask ("upgrade it", "upgrade my game", "the new look",
     "Oomba Kit"; never "add an upgrade shop"), keeping its title and tune-ups; fixing a failed scan on an older game
     maps its hero to the template's theme.
   - Templates: all 8 on 1.0.0 (`<!--KIT-->` / `<!--PACK:name-->` in the files, filled by `loadTemplate`), 2D ones
     5.7–14.6 KB, every one an `Oomba.game` call (quiz, memory, word, duel and board use `controls: 'none'` with DOM
     pieces in `Oomba.ui.root()`), `WORDS` in 12 languages (en-GB falls back to en), lint-clean. Star Island keeps its
     3D world and controls, with the kit's title, how-to, HUD, pause and results (`Oomba.time.start()` runs the kit
     clock: a 3D game has no 2D stage). No 2D template fixes `seed`, so "Play again" deals new rounds; the quiz carries
     its questions per language (en, es, fr; English otherwise); duel and board name the winner and submit no score in
     two-player mode.
3. **Seed games**, one at a time, small → large: word-peek, shark-plank, brick-drop, connect-4, munch-maze, sum-racer, happy-putt, beat-lanes, word-hunt, swish-flick, then castle-clash and footy-tycoon, then the Hero of Sunvale DOM chrome. For each:
   1. Add the tag.
   2. Swap the shell CSS and screen/pause/mute/visibility code for `Oomba.ui`.
   3. Swap `resize()` for `Oomba.fit`.
   4. Swap the local `rrect`, particles, popups and toasts for `Oomba.draw`/`juice`.
   5. Change hex to roles and emoji to `Oomba.char`/`prop`.
   6. Move i18n to `Oomba.strings`.
   7. **Keep `__brbTest` byte-compatible** (merged) and keep the `voice.test.js` copies in sync.
   8. Re-run `npm run covers`, the OG images, `seed.js` and the scanner tests, plus a per-game smoke e2e.

   **Built (the pilots): Word Peek and Sum Racer** (`tests/e2e/kit-pilots.spec.js`). Their rules, words, word lists,
   question decks, saves (`word-peek-v1`, `sum-racer-v1`) and `__brbTest` hooks are unchanged; each assigns its hooks
   with `Object.assign(window.__brbTest, {...})`, so its own names win and the kit's (`setTheme`, `setLang`, ...) stay.
   Patterns the next ports reuse:
   - **A DOM game** (Word Peek): the game's DOM moves into `Oomba.ui.root()`, so it inherits the kit's font and its
     `--ok-*` day/night variables; its cards use the kit's `ok-modal` / `ok-card` / `ok-btn` / `ok-switch` classes;
     a kit stage draws the world behind it (Pip's forest, night in the dark theme), which also runs the kit's clock
     for `Oomba.time.real` timers. The owl is `Oomba.ui.portrait` of the `art-animals` owl.
   - **A hand-drawn canvas game** (Sum Racer): its renderer stays (two-player split screen needs two views), sized by
     `Oomba.fit`, drawing kit props with `Oomba.draw.sprite`, kit characters with `Oomba.art.toCanvas`, sticker text
     with `Oomba.draw.text` and kit colours from `Oomba.color` / `Oomba.tokens.palette`. The title and pause are
     `Oomba.ui.title` / `Oomba.ui.pause`; the one stage is empty during play and shows the podium (the cast on
     `stage.ground` steps in the track's biome) behind the results card.
   - **Strings**: the game's table goes to `Oomba.strings` under a prefix (`wp.`, `sr.`) so its keys never replace the
     kit's button words; emoji in the table are dropped when it is registered and kit icons are shown instead; lists
     (cheers, ordinals) are read from the table directly.
   - **Colours as CSS variables**: set once from `Oomba.color(...)` on `:root` (`--wp-*`, `--sr-*`), so the game's CSS
     has no colour codes.
   - Gaps found: the core `tree` prop's `palm` variant draws its leaves in Ink (Sum Racer draws its own palm); no
     dinosaur species (Rex became a dog: the game's descriptions say so); the kit has no public way to close its
     title or pause screen from code (the pilots click the screen's own button).
4. **Art breadth:** packs, each pinned with SRI. **Built:** the pack mechanism, `art-animals` (7 species, 13 in all), `art-school` (25 props: learning, food, classroom) and `art-biomes` (5 biomes, 11 in all). Next: more species toward 20+, props toward 120, icons toward 150, `art-space`. Andika for reading and Cyrillic; self-hosted Hebrew and Arabic display faces.
5. **3D bridge (built, kit 1.1.0, §6.6):** the `bridge-3d` pack: gradient-map toon materials with a rim, inverted-hull
   Ink, themes as 3D worlds, kit characters as rigs or billboards, Bold in 3D, a perf governor; Star Island uses it.
6. **Platform:** an avatar parts-spec schema on the profile; cross-game kit settings; the optional sticker book (needs a safety review).

### 16.1 The creative-freedom guarantee (foundation step 3)

The kit is the default look, never a rule over a kid's own idea. The style lint (`server/services/stylelint.js`) and the
Builder respect a builder's explicit creative choices: their colours, their characters and made-up creatures, odd or
mixed themes, a plain or minimal look, emoji or a font they asked for.
- **Look notes are suggestions.** `raw_hex emoji_text emoji_dom font theme_name dress_missing three_bridge` are level
  `info` with `look: true` (they never were blocking); the model reads them as "Look suggestion, skip it if the builder
  asked for this look".
- **Asked-for looks are dropped.** `lintGame(html, {request})` / `respectChoices(lint, requests)` take the builder's
  own messages for the game (`agent.js` passes every message so far to the toolbox): colour words or codes drop
  `raw_hex`, emoji drop the emoji notes, font words drop `font`, plain / simple / minimal / "my own style" drop
  `dress_missing` and `three_bridge`, and a made-up theme name the builder used themselves drops `theme_name` (words in
  the site's languages, not only English). Made-up creatures are never flagged (an unknown species is not a pack name).
- **The rule is in KIT_RULES** (docs/kit-api.md, "The builder's own choices always win") and in the style-check
  sentence after each version. Tests: `tests/safety/stylelint.test.js` (the lint) and
  `tests/unit/builder-kit.test.js` (the rules and the toolbox's message).

## 17. Decisions for the owner

1. **Kit games follow the site's light/dark theme** through the new `init.theme`. Non-kit games keep their own colours, as before.
2. **CSP: allow `/vendor/oomba-kit/` in `script-src` and `font-src`.**
3. **Font: Bricolage for kit UI and display**, with per-script system fallbacks (Andika for Cyrillic and reading in phase 2), instead of a rounder game face.
4. **The "Oomba" mascot species** (logo ring eyes + spark antenna) as the kit's default character and the guest avatar.
5. **The size budget (decided).** The owner approved esbuild as a pinned build-only devDependency and keeping the core
   small with optional pinned packs. With the game layer the core is about 91 KB brotli (cap 95 KB); packs have their
   own caps and only the games that use them load them.
6. **Size: about 91 KB brotli of core code + about 108 KB of fonts, cached once per device.** In return, Builder games shrink to about 3–15 KB.

**Still uncertain (verify in phase 1):**
- real Chromebook and iPad frame times, since headless SwiftShader numbers don't represent them;
- `ctx.direction` and `ctx.letterSpacing` support on school iPadOS and ChromeOS versions;
- whether the speech `boundary` event fires on ChromeOS and iPadOS voices;
- the final palette after the CVD gate.
