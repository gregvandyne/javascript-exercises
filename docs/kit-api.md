# Oomba Kit 1.0 API reference (what exists)

This page lists only what the kit does today, with exact signatures. It is the page a model reads before writing a kit
game. The design and the plans (including the declarative `game({...})` layer, which is **not built**) are in
[kit.md](kit.md). `tests/unit/kit-api.test.js` checks that every `Oomba.*` name on this page exists and that every
public name is on this page.

Load the kit with exactly the tag `kitTag()` makes (pinned version, `integrity`, `crossorigin="anonymous"`). It creates
`window.Oomba` (alias `window.OK`) once.

```html
<script src="/vendor/oomba-kit/1.0.0/oomba-kit.js" integrity="sha384-…" crossorigin="anonymous"></script>
<script>
  const S = Oomba.stage({ api: 1, biome: 'meadow' });
  const hero = S.add('kid', { x: 0, y: 0, size: 120, hair: { style: 'curls', color: 'black' } });
  hero.add('move', { gravity: 2400, floor: 0 });
  Oomba.ui.hud(['score', 'lives:3', 'timer:60'], { onPause: r => { if (r === 'restart') location.reload(); } });
  Oomba.test({ state: () => ({ x: hero.x }), start: () => {} });
</script>
```

## The two clocks (read this first)

| Clock | Calls | Stops when |
|---|---|---|
| **Game** (the default) | `Oomba.wait(ms)`, `Oomba.after(ms, fn)`, `Oomba.every(ms, fn)`, `Oomba.time.wait/after/every`, `Oomba.tween(...)`, `Oomba.spring(...)` | the game is paused (pause screen, quiz, dialog, a hidden page, a lost focus), in hit-stop, and it slows in slow-mo |
| **Real** | `Oomba.time.real.wait(ms)`, `Oomba.time.real.after(ms, fn)`, `Oomba.time.real.every(ms, fn)`, `Oomba.tween.ui(...)` | never: use it for menus, story beats and results screens |

Rule: spawns, cooldowns, level timers and enemies use the game clock. Anything that must keep going while a menu is
open uses `time.real`.

## Core

- `Oomba.version` (`'1.0.0'`), `Oomba.api` (`1`), `Oomba.tier` (`'low' | 'mid' | 'high'`), `Oomba.backend` (`'paper' | 'glaze'`).
- `Oomba.color(role, step?)` → hex. Roles: `player friend correct go` (mint), `reward hot` (spark), `hazard wrong` (coral), `interact water` (sky), `magic` (grape), ... Steps `'tint' | 'light' | 'base' | 'shade'` or 0-3.
- `Oomba.tokens` → `{radius, space, outline(hPx), motion, z, palette, roles, skin, hair}`.
- `Oomba.theme.mode` (`'light' | 'dark'`), `Oomba.theme.biome`, `Oomba.theme.on('change', fn)` → off, `Oomba.theme.set('light' | 'dark' | 'auto')`.
- `Oomba.rand(seed)` → `{float(), int(a, b), range(a, b), pick(arr), chance(p), shuffle(arr)}`; `Oomba.seedOf(text)` → number.
- `Oomba.tween(target, props, {ms, ease, delay, onUpdate})` → Promise (with `cancel()`), on the game clock. `Oomba.tween.seq(steps)`, `Oomba.tween.all(promises)`, `Oomba.tween.stagger(items, fn, gapMs)`, `Oomba.tween.ui(target, props, opts)` (real clock).
- `Oomba.ease` (31 easing functions by name), `Oomba.easings` (their names).
- `Oomba.spring(target, prop, {k, zeta})` → `{to(v), value, stop()}`.
- `Oomba.wait(ms)` → Promise, `Oomba.after(ms, fn)` → cancel, `Oomba.every(ms, fn)` → cancel (game clock).
- `Oomba.time.now` (real ms), `Oomba.time.game` (game ms), `Oomba.time.scale` (assist speed, settable), `Oomba.time.hitstop(ms)`, `Oomba.time.slowmo(scale, ms)`, `Oomba.time.pause(reason)`, `Oomba.time.resume(reason)`, `Oomba.time.paused`, `Oomba.time.wait(ms)`, `Oomba.time.after(ms, fn)`, `Oomba.time.every(ms, fn)` (game clock), `Oomba.time.real.wait(ms)`, `Oomba.time.real.after(ms, fn)`, `Oomba.time.real.every(ms, fn)` (real clock).
- `Oomba.on(event, fn)` → off. Events: `'pause'` (the pause screen's result: `'resume' | 'restart' | 'quit'`), `'blur'`, `'focus'`, `'hide'`, `'show'`, `'sound'`.
- `Oomba.scene` (get/set): the current scene name; it shows in `__brbTest.state()` and the Builder's playtest.
- `Oomba.test({state, start, win, skip})`: registers the game's test hooks on `window.__brbTest`. `state()` returns the game's state; `start()` begins a round (the screenshot worker and the playtest call it instead of tapping Play). Until a game calls this, `__brbTest.state()` reports `game: false` and there is no `__brbTest.start`.

## Input

- `Oomba.input.down(action)`, `Oomba.input.pressed(action)` (this step only), `Oomba.input.released(action)`.
- `Oomba.input.axis()` → `{x, y}` in -1..1 from arrows/WASD, the d-pad, a gamepad stick and the touch stick.
- `Oomba.input.pointer` → `{x, y, down}` in design units; `Oomba.input.on('tap' | 'swipe' | 'drag' | 'flick' | 'longpress' | 'down' | 'up' | 'move', fn)` → off.
- `Oomba.input.map({action: ['KeyW', 'Space', 'pad:A', 'touch:A', 'swipe:up']})` replaces bindings.
- `Oomba.input.touch('stick+jump' | 'stick' | 'dpad' | 'buttons' | 'none')`: DOM touch controls, shown after the first touch.
- `Oomba.input.hold(action, ms)` → Promise: holds an action as if a key were down (demos, tutorials, tests).
- Actions: `left right up down jump action pause confirm back`. P / Esc / gamepad Start is `pause`.

## Text, sound, save, settings

- `Oomba.t(key, vars)`, `Oomba.strings({en: {...}, ar: {...}})`, `Oomba.num(n, intlOptions)`, `Oomba.units(text)` (typewriter units), `Oomba.lang`, `Oomba.dir`.
- `Oomba.fonts.ready` → Promise (the kit font, or the system font after 1.5 s).
- `Oomba.sfx(name, {pitch, pitchVar, volume, at: entity, pan, caption})`. Kit voices: `pop whoosh correct wrong spark step land select levelup count hurt win`, plus `gate` and `splash`; SDK names `jump hit coin lose click powerup` go to `BRB.sfx`. When captions are on, key sounds (`correct wrong hurt levelup win spark gate splash`) show a caption, throttled; `caption: 'text or key'` captions any sound, `caption: false` none.
- `Oomba.music('meadow' | 'calm' | 'off')`; `Oomba.say(textOrKey, {who, vars})` → Promise (speech, caption, mouth flaps).
- `Oomba.save.define({v, defaults, migrate})` → the saved object; `Oomba.save.get()`, `Oomba.save.set(patch)`.
- `Oomba.settings`: read any setting as a property (`Oomba.settings.captions`), assign to change it, `Oomba.settings.on('change', fn)`, `Oomba.settings.set({...})`, `Oomba.settings.reduced` (reduced motion now).
- `Oomba.validate('char' | 'parts' | 'legend' | 'game', spec)` → `{spec, warnings}` (snaps to valid values).

## Characters and art

- `Oomba.char(spec)` → a frozen character spec. Spec: `{species: 'oomba'|'kid'|'fox'|'bunny'|'frog'|'bee', skin: 0-7, hair: {style, color}, outfit: {top, color}, wear: [...], mood, colors: {base, belly, accent}, body, seed}`.
- `Oomba.me()` → the player's avatar as a kid spec (the mascot for guests).
- `Oomba.icon(name, {size, label, stroke})` → SVG string; `Oomba.icons` (names). Lines are Ink (`currentColor`); stickers fill by role (reward spark, danger coral, success mint). Pairs: `heart` / `heart-off`, `spark` / `spark-off`, `star` / `star-off`, `flag` / `flag-off`.
- `Oomba.art.species`, `Oomba.art.clips`, `Oomba.art.faces`, `Oomba.art.moods`, `Oomba.art.hair`, `Oomba.art.tops`, `Oomba.art.wear`, `Oomba.art.props` (groups), `Oomba.art.variants`, `Oomba.art.biomes`.
- `Oomba.art.toCanvas(nameOrSpec, px, variant)` → a canvas (DOM previews, cards).
- Art packs: `Oomba.art.define(name, {w, h, ax, ay, draw(ctx, k)})`, `Oomba.art.pack(fn)`, `Oomba.art.rig(name, fn)`, `Oomba.art.part(name, fn)`, and the drawing grammar `Oomba.art.ink` (`sticker detail ringEye glow lines ellipse rrect spark`), `Oomba.art.sparkPath`, `Oomba.art.autotile`.

## The stage (the world)

`Oomba.stage({api: 1, biome, size: [960, 540], fit: 'expand' | 'letterbox', backend, seed})` → stage. One per game.

- `stage.add(name, {x, y, size, layer, z, variant, flip, parts, tag, grade, ...character fields})` → entity. `name` is a prop or core sprite (`Oomba.art.props`), a species (`'kid'`: character fields go at the top level: `skin`, `hair`, `outfit`, `wear`, `mood`, `colors`), or a spec from `Oomba.char()`. An unknown name warns with the nearest real one and shows a placeholder.
- `stage.ground(['  ##', '####'], {cell, x, y, biome})`: auto-tiled ground (strata, pebbles, closed outlines).
- `stage.update(fn(dt))`, `stage.draw(fn(ctx, draw))` (an overlay canvas in world space) → remove.
- `stage.camera`: `follow(entity, {lookAhead, deadzone, smooth})`, `bounds({x, y, w, h})`, `shake(trauma)`, `punch(zoom)`, `frame(entities)`, `toScreen(p)`, `toWorld(p)`, `x`, `y`, `zoom`.
- `stage.light({x, y, follow, radius, color, intensity, night})`, `stage.setTimeOfDay(0..1, ms)`, `stage.toNight(on, ms)`, `stage.timeOfDay`, `stage.setBiome(name)`.
- `stage.burst(preset, x, y, {n, color, dir, spread, w, h})`: presets `sparkle dust confetti coins splash smoke hearts fireflies chips sparks`.
- `stage.floatText(text, x, y, role, {avoid: entity, to: 'score', onArrive})`: world text that never covers `avoid` and can fly into the score pill.
- `stage.wipe('out' | 'in', {at, ms})`, `stage.flash(color)` (at most 3 a second; none with reduced motion), `stage.transition()` (apply a pending quality change, between scenes).
- `stage.prebake({night, zooms, sprites, text})`: bake what the scene draws behind the title, so play never stalls.
- `stage.viewX(f)`, `stage.viewY(f)`, `stage.toWorld(p)`, `stage.view` (`vw`, `vh`), `stage.entities`, `stage.destroy()`.

Entities: `x`, `y`, `vx`, `vy`, `size`, `flip`, `alpha`, `rot`, `visible`, `tag`, `grounded`, `dead`; `state(clip)`, `mood(m)`, `look(target | 'pointer' | null)`, `pop()`, `squash(amt)`, `flash()`, `wobble()`, `float(text, role, opts)`, `say(key)`, `collect()`, `break()`, `remove()`, `touches(other)`, `add(part, opts)`, `on(event, fn)`.

**Motion:** `vx` / `vy` move an entity only when it has the `move` part (otherwise they only pick the walk/run clip):
`hero.add('move', {vx, vy, gravity, drag, floor: y | (x) => y, minX, maxX, bounce})` (sets `grounded`).
Other parts: `bob patrol follow fly lantern glow shadow`.

## UI (real DOM)

- `Oomba.ui.root()`, `Oomba.ui.button(label, {kind: 'hot'|'go'|'quiet'|'icon', icon, big, onPress})`, `Oomba.ui.toast(text, {ms})`, `Oomba.ui.announce(text)`, `Oomba.ui.caption(text, {ms})`.
- `Oomba.ui.title({title, subtitle, hero, heroSize, brand, play, pause})` → Promise (resolves on Play). The block sits above the horizon.
- `Oomba.ui.howTo([{icon, text}])`, `Oomba.ui.countdown(n)`, `Oomba.ui.pause()` → `'resume' | 'restart' | 'quit'`, `Oomba.ui.settings()`.
- `Oomba.ui.win({stars, score, best, hero, title, pause})` → `'again' | 'next'`; `Oomba.ui.tryAgain({score, best, hero, title, say})` → `'again'`.
- `Oomba.ui.hud(['score', 'lives:3', 'timer:60', 'progress', 'combo', 'count:spark'], {lives, total, countIcon, pause, sound, onPause})` → `{score: {add, set, value}, lives: {lose, gain, set, value}, timer: {start(s, onEnd), stop(), left}, progress: {set(0..1)}, combo: {bump(), reset()}, count: {add, set}, pause()}`. Unknown widget names warn. The HUD binds P / Esc / Start and a lost focus to the pause screen and routes the result to `onPause(result)` and `Oomba.on('pause', fn)`. **Quit** inside a game frame cannot leave the page: treat it as "back to this game's title screen" (the site's own back button leaves).
- `Oomba.ui.ask({q, a, choices, hint, tries, who, index})` → Promise\<boolean\>. `a` (or `answer`) is the right **value**; `index` names the right tile instead; `choices` is 2-4 values or a number of tiles to make around a numeric answer. A first miss shows the hint and another go; the last miss reveals the answer. `who` keeps the asking character clear of the scrim. It rejects (and warns) if the answer is not a choice.
- `Oomba.ui.banner('correct' | 'wrong', reason)`, `Oomba.ui.bubble(entity | {x, y}, textOrKey, {ms, portrait, readAloud})` → Promise, `Oomba.ui.dialog({title, text, portrait, buttons: [{label, kind, value}]})` → value, `Oomba.ui.portrait(spec, {size, mood})` → canvas, `Oomba.ui.open` (modals open now).

## Juice and helpers

- `Oomba.juice.pop(entityOrElement)`, `Oomba.juice.shake(trauma, element?)`, `Oomba.juice.hitstop(ms)`, `Oomba.juice.float(text, x, y, role)`, `Oomba.juice.burst(preset, x, y, opts)`, `Oomba.juice.confetti()`, `Oomba.juice.flash(color)`, `Oomba.juice.presets`.
- `Oomba.fit(canvas, {size, fit, dprCap, onResize})` and `Oomba.draw` (`panel button text sprite spark ring rrect sky`): kit-styled helpers for porting a hand-drawn canvas game one function at a time.

## Test hooks (`window.__brbTest`)

`state()`, `step(n)` (n fixed updates, deterministic), `seed(n)`, `frameStats()` (`p50 p90 draws pages uploads fireflies ...`), `setTier(t)`, `setBackend(b)`, `setTheme(m)`, `setLang(l)`; `start()`, `win()` and `skip()` once the game registers them with `Oomba.test`.

## Not in 1.0

The declarative game layer (`game({...})`, `level.grid`, gameplay parts such as player, collectible, hazard, goal,
quiz gate) is a phase 2 design in [kit.md](kit.md) §7.2. Nothing on this page depends on it.
