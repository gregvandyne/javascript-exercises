# Jungle Cup: plan, architecture and the sport module interface

Jungle Cup is an official seed game (`seed-games/jungle-cup.html` + `jungle-cup.json`): Cappy the capybara rafts to
Delta Isle, beats seven rainforest champions at seven sports, lights the Cup Totem with their Feathers and rides the
vine lift up the Great Kapok to win the Jungle Cup. It is an original design: its own name, cast, island, story, UI and
structure. Later stages must keep it that way (no names, characters, places, layouts or logos from other games).

## Decisions

- **Plain canvas, no Oomba Kit.** The requirement is crisp 16-bit pixel art; the scanner does not require the kit
  (it only pins the kit tag when a game loads it). Everything is drawn on one `<canvas>` in code, and the game talks to
  the platform only through `window.BRB` (storage, gameOver, sfx mute, speak). Because the UI is canvas-drawn,
  `frameProblems` (tests/e2e/frame-fit.js) has no DOM to judge; our e2e also checks every canvas button through
  `__brbTest.jc.buttons()` (size in CSS px, inside the frame).
- **Integer pixel scaling.** The view is `JC.view.W x JC.view.H` *virtual* pixels; each is `JC.view.S x S` device
  pixels (S an integer, chosen so the short side is about 240 virtual px). Draw at whole virtual pixels; image
  smoothing is off. `JC.view.tap` is a 46-CSS-px touch target in virtual pixels: size buttons with it.
- **Fixed timestep.** `update(dt)` always gets dt = 1/60 s; drawing happens once per animation frame. `jc.step(ms)` and
  `jc.manual(true)` make tests deterministic and fast.
- **No per-frame allocation in hot loops.** Pools for particles and floating text, a reused draw list, cached text
  bitmaps (`JC.font.text` caches each string as a small canvas), `JC.label(key, n)` for numbers drawn every frame.
  The island is pre-rendered once into offscreen canvases (two water frames + an "over" layer for tree tops, roofs and
  arch beams that Cappy walks behind).
- **Sound** is WebAudio chiptune made in code (`src/core/03-audio.js`): one context made on the first tap or key,
  silenced whenever `BRB.sfx.muted` (Settings > Sound toggles the platform's own mute), suspended when hidden.
- **Text**: a 5x7 pixel font for Latin letters (accents are built from marks); "Clear" in Settings switches to a plain,
  very readable font, and any string with letters the pixel font lacks (Japanese, Chinese, Arabic, Hebrew, Russian) is
  drawn in the clear font automatically. RTL languages right-align text.

## How to build

```
npm run build:jungle            # tools/jungle-cup/build.mjs -> seed-games/jungle-cup.html (commit the result)
node tools/jungle-cup/build.mjs --check
node --test tests/unit/jungle-cup.test.js
E2E_PORT=<your port> npx playwright test tests/e2e/jungle-cup.spec.js
```

Build order: `src/shell.html` (title, style, canvas), the I18N block (`const I18N = {};` then `src/i18n/core.*.js`,
then the other `src/i18n/*.js` by name), `src/voices.js` (the VOICES block), then one IIFE with `src/core/*.js` by
name, every `src/sport-*.js` by name, and `src/boot.js`. **A new sport needs no edit to any core file**: add
`src/sport-<id>.js` and `src/i18n/<id>.en.js`, rebuild, commit the three files (plus the rebuilt html).
The unit test fails if the committed html is not what the sources build.

Files: `core/00-base.js` (JC, t(), maths, BRB wrapper), `01-gfx.js` (canvas, scaling, palette, sprites, primitives),
`02-font.js`, `03-audio.js`, `04-input.js`, `05-sprites.js` (the cast's pixel maps), `06-ui.js` (buttons, cards, bars,
star bar, floats, particles, banner), `07-textbox.js`, `08-save.js`, `09-world.js` (Delta Isle), `10-npcs.js` (people,
dialogue, side quests), `11-overworld.js`, `12-sports.js` (the runner + HUD helpers), `13-screens.js` (title, map,
settings, controls, style, finale, credits), `14-main.js` (scenes, loop), `15-test.js` (hooks).

## Sport module interface

A sport file is `src/sport-<id>.js`, where id is one of `paddle vine seed rapids frog kick leaf`, wrapped in its own
`(function () { ... })();` and ending with `JC.register({...})`. Paddle Smash (`sport-paddle.js`) is the reference.

```js
(function () {
  const S = { /* all state here, allocated once */ };
  JC.register({
    id: 'vine',                 // required, one of the seven ids
    champion: 'sloane',         // the champion's speaker id (portrait + name.<id>); the arch already knows it
    music: 'vine',              // a song id in JC.audio.songs (add your own: JC.audio.songs.vine = {...}); default 'paddle'
    start(ctx) {},              // a new round: reset S. Called before the 3-2-1 (draw() runs during the countdown)
    update(dt, ctx) {},         // dt = 1/60 s; only while playing (not during the countdown, pause, text boxes)
    draw(g, ctx) {},            // draw the whole screen in virtual pixels (0..ctx.W, 0..ctx.H); the core adds the
                                // pause button (top left, keep JC.hud.left() px clear), effects, cards and text box
    onInput(e, ctx) {},         // input events (below); pause (Esc/P/pause button) is handled by the core
    outro(dt, ctx) {},          // optional: keep animating for ~1 s after finish() (celebrations)
    stop(ctx) {},               // optional: leaving the sport
    testState(ctx) { return {}; },      // required: plain data for tests
    test: { auto(ctx, on) {} },         // optional named hooks: __brbTest.jc.sport('auto', true)
    cheat(won, ctx) { return { score, stars, won }; },   // required: an instant result for jc.win / jc.lose
  });
})();
```

The round ends when the sport calls **`ctx.finish({ score, stars, won, frac?, stats? })`**: score a whole number >= 0,
stars 0-3, won true to earn the Feather; frac (0-1) fills the star bar (default stars / 3). The core then saves the
best, the stars and the Feather, calls `BRB.gameOver`, plays the jingle and shows the results card (Try again / Back
to the island). Losing is never punished: the Feather and bests are kept; Try again restarts at once.

**ctx** (made fresh for each round): `W`, `H`, `tap` (live getters), `touch` (the last input was touch: show touch
hints), `easy` (Settings > Easier champions: make the champion slower / more forgiving), `firstTime` (never played
this sport), `warmedUp` and `markWarm()` (for a once-only warm-up), `best`, `colour` (the sport's colour), `champion`,
`t` (seconds played this round), `rng` (seeded random), `sfx(name)`, `music(id)`, `say(lines, done)` (a text box; play
pauses while it is open), `held` (JC.input.held: left right up down a b), `hud` (= JC.hud), `ui` (= JC.ui), `finish(res)`.

**Analog movement: `ctx.axis`** = `{ x, y, mag }` (the same object every step; read it in `update`, don't keep a copy).
`x` and `y` run -1..1 (y is down the screen), `mag` 0..1 is how hard it is pushed (0 = not moving). It comes from the
touch joystick while a thumb is on it, else the gamepad's left stick (dead zone 0.2, rescaled so a light push moves
slowly), else the arrow keys / WASD / the pad's d-pad (1 along an axis, diagonals normalised to length 1). Move with
`speed * mag` along `(x, y) / |(x, y)|` for analog feel. The joystick also holds `left/right/up/down` once it is
pushed past 0.45 that way, so `press` / `release` events and `ctx.held` keep working for sports that steer in steps.

**The touch joystick: `stick: true`** in `JC.register({...})` gives a sport the floating joystick (like Hero of
Sunvale's): a thumb landing in the left part of the screen (left 55% in portrait, 45% in landscape, below the top
button row) starts it there, the knob follows up to the base's edge (dead zone 0.15), release springs it back, and a
faint one rests bottom left as a hint. It follows its own touch id, so the sport's other touches (an A button on the
right) work at the same time; the stick's own `down/move/up` events never reach the sport. For a different start
area pass a function: `stick: (x, y, ctx) => x < ctx.W * 0.5` (that also lets it start anywhere the function allows).
`ctx.stick` is the stick itself (`ctx.stick.id >= 0` while held; `STICK.draw(g, true)` is drawn by the core above
the sport). The island uses the same stick: Cappy walks freely and analog, slides along walls and slips round corners
(up to 7 px), and arches (24 px round each, kept to 32 px once the prompt shows), people, signs and the lift
(27 px in front, 18 px all round) answer from a generous distance, so one approach is always enough.

**Input events** (`e.type`): `press` / `release` with `e.key` in `left right up down a b pause` (keys, gamepad);
`down` / `move` / `up` with `e.id, x, y, sx, sy, dx, dy` in virtual pixels (touch or mouse); `tap` (`x, y`); `swipe`
(`dir`, `dx, dy`, `speed`). Keyboard: arrows/WASD, Space/Enter/Z = a, Esc/Backspace/X = b. Gamepad: stick/d-pad,
button 0 = a, 1 = b, 9 = pause (the left stick is also `ctx.axis`). Touch-first: every sport must be fully playable with taps/drags/swipes alone, and
with keys alone. Draw your own touch buttons with `JC.ui.button(g, id, x, y, w, h, label)` (at least `ctx.tap` big)
and check them with `JC.ui.hitAt(e.x, e.y)`.

**Shared helpers**: `JC.hud.versus(g, {name, score, of, col}, {...})` (two score panels), `JC.hud.timer(g, secsLeft,
frac)`, `JC.hud.score(g, n)`, `JC.hud.meter(g, x, y, w, label, frac, col, glow)`, `JC.hud.pop(x, y, key, col)`;
`JC.ui.bar`, `JC.ui.starBar`, `JC.ui.float(x, y, text, col)`, `JC.ui.burst(x, y, n, col)`, `JC.ui.confetti(x, y, n)`,
`JC.ui.banner(text, col, secs)`, `JC.ui.card(g, x, y, w, h)`; drawing: `JC.draw.rect/disc/oval/line/box/shadow`,
`JC.sprite(name, rows, palette)`, `JC.spr`, `JC.sprK` (scaled), `JC.sprites` (the cast: `cappy_right`, `jada`,
`sloane`, `tico`, `otter`, `rana`, `mico`, `kiki`, `marmoset`, `mango`...), `JC.drawCappy(g, x, y, dir, walk, hop)`,
`JC.portrait(g, who, x, y, size)`, `JC.featherSprite(col)`, `JC.shade(col, k)`, `JC.pal`, `JC.sportColours`,
`JC.canvas2(w, h)` (offscreen canvas for pre-rendered backgrounds; rebuild when `JC.view.gen` changes);
`JC.font.text(g, str, x, y, {col, edge, align, scale})`, `JC.font.textBlock(...)`, `JC.font.textW`; `JC.t(key, vars)`,
`JC.label(key, n)`, `JC.fmt(n)`; `JC.math` (clamp, lerp, easeOut, easeOutBack, rng); `JC.audio.sfx(name)` (tick tock
grab twang splash drumLow drumMid drumHigh kick whoosh bonk beep go step blip select back pickup miss pounce star
cheer win lose fanfare), `JC.audio.addSfx(name, fn)`, `JC.audio.tone/drum`, `JC.audio.songTime()` / `stepLen()`
(the music clock, for Frog Chorus: chart notes to `songs.<id>` and judge against `songTime()`).

Rules for sport files: no `I18N` in them (words go in `src/i18n/<id>.en.js`); no DOM, storage, network or timers that
outlive the round; one reused state object (no allocation per frame); a "win by playing" path that a bot in
`test.auto` can reach, and `cheat()`.

## Words (i18n)

`src/i18n/<area>.<locale>.js`, each exactly `I18N.<locale> = Object.assign(I18N.<locale> || {}, { 'key': 'text' });`
(`I18N['en-GB']`, `I18N['zh-Hant']` for the hyphenated ones). Locales: en, en-GB, pt, fr, es, de, he, ja, ar, ru, it,
zh-Hant, nl. English is the source, in US spelling like the site's `en.json`; every other language has the whole game
in `src/i18n/all.<locale>.js` (en-GB holds only the lines spelled differently, such as "colour" and "favourite").
A new English key falls back to English until it is added there.
Long words in other languages are narrowed to fit buttons and rows (`text(..., { maxW })`).
Keys: core `btn.*`, `res.*`, `settings.*`, `map.*`...; people `d.<who>.<line>` and `name.<who>`; a sport's intro card
needs `sport.<id>.goal`, `sport.<id>.touch`, `sport.<id>.keys` (`sport.<id>` and `vs.<champ>` are in core);
in-play words use a short prefix of your own (Paddle uses `pad.*`). `{name}` placeholders; `{ one, other }` plurals.
The `d.*`, `story.*`, `end.*`, `sign.*` lines are read aloud by AI voices where the site has them on
(server/services/tts-lines.js 'jungle-cup', roles from `src/voices.js`).

## Storage

`BRB.storage` key `jungle-cup-v1` (per player; the SDK sends it to the server), written on every result, quest step,
setting change and (every 2 s while walking) position:
`{ v: 1, started, pos: {x, y, d}, feathers: {<id>: true}, best: {<id>: n}, stars: {<id>: 0-3}, plays: {<id>: n},
warm: {<id>: true}, cos: { bandana, hat, flag, own: [...] }, quests: {<quest>: 'active'|'got'|'done'}, flags: {...},
settings: { font: 'pixel'|'clear', easy }, cup, t }`. Sound is the platform's own mute. Sports never write storage:
use `ctx.finish` and `ctx.markWarm`.

Score to the platform: `BRB.gameOver({ won, score })` after every round, score = cup points
(100 per star + 250 per Feather + 500 for the Cup), so the leaderboard shows overall progress.

## Test hooks

`window.__brbTest.state()` / `start()` (the platform's autotest) and `window.__brbTest.jc`:
`state()`, `go(where)` (`'title' | 'map' | 'settings' | 'controls' | 'style' | 'finale' | 'credits' | 'dock' |
'village' | 'totem' | 'kapok' | 'lift' | 'lagoon' | 'islet' | <sport id> (stands in its arch) | [x, y, dir]`),
`play(id, {intro})`, `win(id)`, `lose(id)`, `setSave(obj)`, `save()`, `newGame()`, `continue()`, `step(ms)`,
`manual(on)`, `speed(n)`, `press/release/tapKey(key)`, `tap(x, y | buttonId)`, `swipe(dir)`, `walk(dir, n)`,
`talk()`, `skipText()`, `buttons()` (CSS px), `sport()` (testState) / `sport(name, ...args)` (sport.test hooks),
`perf()`, `world()`, `sheet(on)` (every sprite on screen, for looking at the art).

## The island (tiles, 72 x 68)

Dock and raft (36, 64); boardwalk north to Mossy Village (totem at 36, 37; elder, tapir's stall, huts); Great Kapok and
the vine lift (36, 16) to the north. Arches (stand here to play): paddle (26, 31) canopy court; leaf (16, 22) hills and
mud slope; seed (12, 46) lagoon; kick (20, 50) pitch; frog (46, 51) lily pond; rapids (61, 38) east islet over the
stepping stones (y 34) or the rope bridge (y 44); vine (46, 21) giant grove. Side quests: the ants' leaf, the elder's
glasses, Zuzu's letter, Pip's three shells, Mango's mango (cosmetic rewards only, never blocking).

## Story panels and the finale

`core/13b-story.js` paints soft, painted-looking pictures in code (gradients, washes, brush dabs, paper grain), once
per screen size. A text-box line with `panel: '<id>'` shows that picture above the box with a Skip button (Esc / B
skips too): `JC.storyLines('intro')` (river, isle, dock: each launch, from Play or the first Continue) and
`JC.storyLines('finale')` (lift, stage, cup), then Mango on the pixel Canopy Stage, the Cup raised, Cappy's thanks,
the credits and free play. Bonus bandanas: gold for the Cup (worn at once), berry for the first three-star round.
Timed beats (Cappy's thanks, Zuzu's lift news) run on game time, never `setTimeout`.
