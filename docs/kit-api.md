# Oomba Kit API reference (what exists: kit 1.1.0)

This page lists only what the kit does today, with exact signatures. It is the page a model reads before writing a kit
game. Start with **the game layer** (`Oomba.game`): a whole game is a spec, a one-character level and a few handlers.
The design and the plans are in [kit.md](kit.md). `tests/unit/kit-api.test.js` checks that every `Oomba.*` name on this page exists and that every
public name is on this page.

Load the kit with exactly the tag `kitTag()` makes (pinned version, `integrity`, `crossorigin="anonymous"`). It creates
`window.Oomba` (alias `window.OK`) once. New games load the latest kit (1.1.0, with themes); games saved on 1.0.0 keep
their own pinned tag and work as before (the server serves both; a version's files never change).

```html
<script src="/vendor/oomba-kit/1.1.0/oomba-kit.js" integrity="sha384-…" crossorigin="anonymous"></script>
<script>
  const S = Oomba.stage({ api: 1, biome: 'meadow' });
  const hero = S.add('kid', { x: 0, y: 0, size: 120, hair: { style: 'curls', color: 'black' } });
  hero.add('move', { gravity: 2400, floor: 0 });
  Oomba.ui.hud(['score', 'lives:3', 'timer:60'], { onPause: r => { if (r === 'restart') location.reload(); } });
  Oomba.test({ state: () => ({ x: hero.x }), start: () => {} });
</script>
```

## The game layer (start here)

```html
<script src="/vendor/oomba-kit/1.1.0/oomba-kit.js" integrity="sha384-…" crossorigin="anonymous"></script>
<script>
  Oomba.game({
    api: 1, title: 'Spark Hop', theme: 'meadow', controls: 'platformer:kid-easy', hud: ['score', 'lives:3', 'timer:90'],
    howTo: [{ icon: 'move', text: 'Run with the arrows' }, { icon: 'jump', text: 'Jump with Space' }],
    level: Oomba.level.grid([
      '                         ',
      '        $$$       B      ',
      '       =====    $   $  G ',
      '  P  $       ^^    Q     ',
      '#########################',
    ], { Q: { kind: 'gate', q: '3 × 4 = ?', a: 12, choices: [10, 12, 14, 16] } }),
    on: { collect(w, item) {}, win(w) {} },
  });
</script>
```

<!-- builder:api -->
`Oomba.game(spec)` → game. It validates the spec (warnings, never a throw), makes the stage, registers the test hooks
(`__brbTest.state/start/win/skip`) and runs once the kit font is ready: **title → intro → how-to → countdown → play →
results or try again**, with the HUD, the pause screen (P / Esc / Start, a lost focus), touch controls, juice, sound,
captions, read-aloud, right-to-left and reduced motion done by the kit. Scores go to `BRB.gameOver({won, score})`
(which submits `BRB.score`), sounds through `Oomba.sfx` (`BRB.sfx` names pass through), speech through `Oomba.say`
(`BRB.speak`).

Spec (all optional except `level` for a real game; a missing level is generated):
- `api: 1`, `title`, `subtitle` (text or a string key), `titleHue: 'spark' | 'mint' | 'sky' | 'coral'` (the title lockup's gradient), `titleBadge` (a canvas under the lockup that says what the game is about: `Oomba.art.toCanvas('pie', 110, '3/4')`), `style: 'bold'` (12-14: with the `style-bold` pack), `dress: 'auto' | 'off' | 0.2-2` (the scene's automatic dressing: props on the hills, framing leaves, birds and butterflies; 'auto' by default, a number makes it denser or sparser; it needs the `dress` pack), `theme` (a world: `'castle'`, see Themes below; kit 1.0's `'light' | 'dark' | 'auto'` still mean the mode), `mode: 'auto' | 'light' | 'dark'` (pin the light/dark mode; `'auto'` follows the site), `biome` (the world alone, without a theme's light, accent and props; next to a theme it replaces only the world), `backend`, `size: [960, 540]`, `fit`, `seed` (leave it out: each round then gets a fresh `w.rand`, so "Play again" deals new cards, questions and dice; a `seed` replays the same rounds).
- `controls`: `'platformer:kid-easy'` (default) `| 'platformer:snappy' | 'platformer:floaty' | 'topdown' | 'tap' | 'none'`. Platformers have coyote time (90 ms), a jump buffer (110 ms), variable jump height (about 2.7 cells), fall gravity ×1.6, 80% hit boxes and a pickup magnet. `tap`: hold the pointer to walk toward it, tap above the hero to jump. `'none'`: no hero input or physics and no walk-up talk; pickups, the goal, hazards and gates still work when your code moves the hero (`w.hero.x += ...` in `update`, or `Oomba.tween(w.hero, {x}, {ms})`).
- `camera`: `'follow'` (default: about 7 rows high; on a phone in portrait the hero is at least 21% of the screen's height) `| 'fixed'` (the whole level; `update` may set `w.cam.zoom`, `x`, `y` every step, as the kit resets them) or `{lookAhead, deadzone, smooth}`.
- `hud`: widgets of `Oomba.ui.hud` (`'score' 'lives:3' 'timer:60' 'progress' 'combo' 'count:spark'`; `'count:flag'` with `w.hud.count.set(n, total)` shows "3 of 10"). The timer starts at play; time up loses (unless `on.timeup` returns `false`).
- `howTo`: up to 3 `{icon, text}` cards (read aloud). `strings`: `{lang: {key: text}}` (any text field may be a key).
- `level`: a level from `Oomba.level.grid` or `Oomba.level.generate`, or an array of them (the results screen's Next goes to the next one).
- `hero`: `'me'` (default: the player's avatar), a species name or an `Oomba.char()` spec; `heroSize` (cells, 1.75). `titleHero`, `titleHeroSize` for the title card.
- `intro(w)` → Promise: runs after the title (a hero picker, a story). `setup(w)`: after each level is built, so also behind the title (DOM made there shows on the title: make it in `on.start` and remove it in `on.win` / `on.lose`). `update(w, dt)`: every fixed step (1/60 s). `testState(w)` → an object merged into `__brbTest.state()` (your own fields for the playtest).
- `on`: `start title collect hit land goal checkpoint spring gate talk door stomp timeup win lose results skip`, each `(w, ...)`. `on.gate(w, gate)` and `on.talk(w, npc)` may return a Promise (the hero waits). `on.gate` returns `true` (open it), `false` (keep it shut, no quiz) or nothing (the gate's own `q` is asked; with no `q` it opens). `on.talk` returning nothing still plays the NPC's `say` lines; `false` skips them. `on.goal` returning `false` stops the automatic win. `on.results` runs while the screen is wiped dark.
- `stars(w)` → 0-3 (default from the sparks collected), `trySay`, `hurtSay`, `splashSay`, `fallSay` (keys or text), `prebakeText`, `night: true` (bake night art behind the title), `countdown` (seconds, 0 for none), `autorun: false`.

The game handle: `run()`, `start()` (straight into play), `restart('play' | 'title')`, `next()`, `pause()`, `resume()`, `hero(spec)` (change the hero's look in place), `state` (`'title' 'intro' 'howto' 'countdown' 'play' 'talk' 'goal' 'win' 'lose'`), `world`, `stage`, `level`. Results: with more levels (`level: [grid1, grid2, grid3]`) "Next" leads; on the last (or only) level "Play again" is the big button. The kit keeps the cast apart: a character placed on the level's edge or on top of another is moved just enough at the start, and two characters overlapping in play, or a big prop behind the title's Play button, give an `[oomba]` warning.

**Levels.** `Oomba.level.grid(rows, legend, {cell: 48})` → level. **Strictly one character per cell**; rows may be ragged; space and `.` are empty; a longer legend key is dropped with a warning. `Oomba.level.generate({seed, length, difficulty: 0..1, cell})` → a meadow platformer (the same seed makes the same level). `Oomba.level.legend` (the built-in legend), `Oomba.level.kinds`, `Oomba.level.controls`.

| Char | Kind | Char | Kind | Char | Kind |
|---|---|---|---|---|---|
| `#` | ground (auto-tiled) | `=` | ledge (one-way) | `~` | water (swim; `{kind:'water', splash:true}`: back to the bank) |
| `P` | hero start | `G` | goal flag | `$` | spark (10, combos) |
| `o` | coin (5) | `H` | heart (+1 life) | `k` | key |
| `D` | door (needs a key) | `Q` | quiz gate | `^` | spikes |
| `B` | bee (flying hazard) | `E` | rolling spike ball (walks, turns at edges) | `S` | spring |
| `K` | checkpoint | `L` | lantern (lights at night) | `N` | NPC (`{kind:'npc', species, say}`) |
| `M` | moving platform (`platform: {dx, dy, speed}` in cells) | `i` | sign (`say`) | `C` | crate (solid) |

A legend value is a kind, any prop or species name (`'tree'`, `'owl'`), an object `{kind, size (cells), say, q, a, choices, hint, questions, value, tag, variant, flip, z, layer, ox, oy, parts, species, ...character fields}`, or an array of them (several things in one cell). Treasure props are collectibles and hazard props hurt by default.

**The world** `w` (handlers get it first): `w.spawn(what, where)` → entity: exactly two arguments, `what` a kind, species, prop, character spec or `{kind, ...}`, `where` `{c, r}` (cells) or `{x, y}` or `{at: 'K'}` plus, in the same object, `size` (cells), `parts`, `tag`, `variant`, `place`, `ox` / `oy` (cells), `flip`, `say`. `w.find(tagOrKind)`, `w.all(tagOrKind)` (never a pickup already taken), `w.hero`, `w.level`, `w.cell`, `w.score(n)`, `w.points`, `w.got`, `w.total`, `w.keys`, `w.lives` (get/set), `w.hud` (the live widgets: `w.hud.count.add(1)`, `w.hud.progress.set(0.5)` (it follows the hero to the goal by itself until the game sets it), `w.hud.combo.bump()`, `w.hud.count.set(3, 10)`), `w.levelNo` / `w.levelCount` (which level of how many, 1-based), `w.hurt({dir, say})`, `w.heal()`, `w.win({stars, score, say, title, who, submit})` (`title` a key or text instead of "You did it!", `who` the winner's spec on the card, `submit: false` for 2-player games: no leaderboard, no best; with no `score`: the points + 2 a second left on a timer + 25 a heart shown), `w.lose({say})`, `w.ended`, `w.ask(q)` → Promise\<boolean\> (pauses the game; `q`, `hint` and text choices may be keys), `w.say(who, key, vars)` → Promise (bubble + read aloud; the player taps it away), `w.story(async fn)` (the hero waits, the timer pauses), `w.setHero(spec)` (also on the results card), `w.after(ms, fn)`, `w.every(ms, fn)` (game clock, cancelled with the round), `w.on(ev, fn)`, `w.emit(ev, ...)`, `w.rand` (seeded per round), `w.cam`, `w.fx` (`Oomba.juice`), `w.stage` (`toNight(on, ms)`, `light(...)`), `w.theme` (`mode`, `timeOfDay` 0 = noon … 1 = night, settable), `w.scene`, `w.busy`. `entity.collect()` on a pickup counts like a touch.

**Parts** (`parts: [...]` in a legend entry or `w.spawn`, or `entity.add(name, opts)` on a world entity): `player collectible hazard goal checkpoint spring quizGate talk door key solid platform walk` plus the core `move bob patrol follow fly lantern glow shadow`. Options: `collectible {value, heal, key, count}`, `hazard {stomp, value}`, `quizGate {q, a, choices, hint, questions}`, `talk {say, range, repeat}`, `platform {dx, dy, speed, surface, width}`, `solid {w, h}`, `walk {speed, dir, roll}`, `follow {target, gap, fly}` (in a world it hops along the ground after the hero). Gates and doors get `entity.open()`.

**Automatic juice** on collect, hurt, jump, land, springs, checkpoints, win and lose: add your own only for your own moments.

**Input and moving things from code.** `Oomba.input.axis()` → `{x, y}` (-1..1: arrows, WASD, stick, d-pad), `Oomba.input.pressed('jump' | 'action' | ...)` (this step), `Oomba.input.down(a)`, `Oomba.input.on('tap', p => ...)` with `p` in design units (`w.cam.toWorld(p)` → world). Number keys: a `keydown` listener on `window` (`e.code === 'Digit1'`). A race or answer-to-move game: `controls: 'none'`, then `Oomba.tween(w.hero, { x: w.hero.x + 3 * w.cell }, { ms: 500 })` (the run clip plays, pickups and the goal work); a rival moves in `update` (`rival.x += speed * dt`). A shooter: spawn shots with `w.spawn('spark', {x, y, tag: 'shot', parts: []})`, move them in `update`, test `shot.touches(target)`.

**Turn-based, card and two-player games.** `controls: 'none'`, `camera: 'fixed'`, `hero` the player (or drop it out of view), your cards and buttons in `Oomba.ui.root()` placed below `var(--ok-safe-top)` (the HUD and the kit's banner band are above it), turns started from `on.start(w)`. Two players: show whose turn it is in your own DOM, end with `w.win({ title: 'p2Wins', who: CONFIG.p2, submit: false })`. Maths in your DOM gets `dir="ltr"` (it never mirrors in Arabic or Hebrew). Your own motion reads `Oomba.settings.reduced` at each use and has a `.ok-rm` CSS rule.
<!-- /builder -->

## Themes (kit 1.1.0)

<!-- builder:api -->
**Themes.** `Oomba.game({ theme: 'castle' })` picks a whole look at once: the world (biome, sky and time of day), an
accent colour (title lockup, pennants, boards), the ambient life and corner framing, a prop set and a music mood.
Themes come with the `dress` pack; some worlds need one more pack (the art lists give each theme's packs). Themes:
`meadow beach jungle snow desert reef space candy haunted castle cyber stadium forest autumn city` (`cyber` is the
12-14 look: it sets `style: 'bold'`). Names are forgiving (`'Ocean Reef'`, `'candy land'`, `'football'`,
`'halloween'`); an unknown name or a missing pack warns and shows a near world. Recolour a theme with
`theme: { name: 'beach', accent: 'grape', palette: { hills: 'coral', ground: 'mint', sky: 'grape' } }` (hue names; the
kit keeps each colour's brightness, so contrast never breaks; spark yellow is never an accent). `Oomba.theme.look` →
`{name, biome, accent, tod, music, bed, style, packs, props}` while a theme runs (else `null`): `props` are the theme's
props that are loaded now (for legends and `w.spawn`), `music` a mood word and `bed` the kit's nearest music bed
(`const look = Oomba.theme.look; Oomba.music(look.bed)`). `Oomba.theme.names` → every theme.
<!-- /builder -->

## Art packs

Extra art comes in separate pinned files, loaded only by the games that use them, each with its exact tag **after the
kit's tag** (`kitPackTag(name)` on the server; any other form fails the scanner):

```html
<script src="/vendor/oomba-kit/1.1.0/packs/art-animals.js" integrity="sha384-…" crossorigin="anonymous"></script>
```

- `art-animals`: species `cat dog bear mouse owl penguin duck` (13 with the core six).
- `art-school`: props `tile pie clock dice shape book pencil globe bulb magnifier` (learning), `apple banana carrot cookie melon cheese cupcake grapes` (food), `chalkboard abacus ruler crayon schoolbag paint letterblock` (school).
- `art-biomes`: biomes `jungle reef city moon autumn` (11 with the core six).
- `art-biomes-2` (1.1.0): biomes `castle stadium space spooky` for the themes castle, stadium, space and haunted.
- `art-props` (1.1.0): the themes' props: treasure `sweet snowflake starfish pearl` (collectible like coins), seaside
  `sandcastle anchor clam`, snowy `igloo`, spooky `pumpkin ghost cauldron`, castle `tower banner shield torch`, sports
  `ball goalpost`, sweets `donut candycane`, space `ufo satellite`, wild `totem pot pyramid`, tech `drone`.
- `dress`: the automatic scene dressing every Builder template loads: houses, fences, lamp posts, tents, beach huts,
  umbrellas, flags, cones, tyre stacks, rock piles and grass tufts on the hills (and, from 1.1.0, the themes) (on top of the core's trees, pines,
  bushes and flowers), big leaves framing the bottom corners, and ambient life (bird flocks, gulls, butterflies,
  drifting leaves, snow, fish under the sea; fewer on slow devices, none with reduced motion). Also the props `car bus
  rocket boat plane` (vehicles) and `shell cactus snowman log`. `Oomba.game({dress: 'off'})` keeps the bands sparse.
- `bridge-3d` (1.1.0): the 3D bridge for three.js games (`Oomba.three`, below). 2D games never load it.
- `live` (1.1.0): `Oomba.live`, the API for live class games (Oomba Live, below). Only live-ready games load it.
- `style-bold`: the Bold style for 12-14 (`Oomba.game({style: 'bold'})`, or `Oomba.style('bold')` before
  `Oomba.stage`): about 3 heads tall, narrowed eyes, no blush, 'determined' by default; wear `hood visor headset helmet
  cap-back` (head) and `jersey bomber techvest` (body); deep surfaces with neon accents, 8-10 px corners, clipped
  corners on big buttons, a slanted title; scenes start at golden hour; biomes `cyber skate station haunted`.

`Oomba.pack(name)` → `{name, version, species, props, biomes}` when the pack is loaded, else `null` with a warning that
names the tag to add. `Oomba.packs` → the loaded pack names.

## The 3D bridge (kit 1.1.0, pack `bridge-3d`)

A three.js game (the import map from `/vendor/three/`, as before) gets the Oomba Ink look from the `bridge-3d` pack:
toon (cel) shading with a soft rim light and Ink outlines, the kit's colours, a theme as a 3D world, kit characters as
low-poly rigs or as billboards of their 2D art, and the kit's screens over the canvas. `THREE` is passed in, never
imported by the kit. 2D games never load this pack.

<!-- builder:3d -->
**3D games on the kit.** Load the kit tag, then `{{PACK_TAG:dress}}` (themes) and `{{PACK_TAG:bridge-3d}}` (plus the
packs a theme needs, and `{{PACK_TAG:style-bold}}` for `style: 'bold'`), then three.js with its import map. One call
gives the look; the game's code is only its world rules:

```js
import * as THREE from 'three';
Oomba.time.start();   // the kit's clock and pause key with no 2D stage
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: devicePixelRatio < 1.5 });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
const B = Oomba.three(THREE, { renderer, scene, camera, theme: CONFIG.theme });
const W = B.world({ size: 30 });                         // sky, fog, light, land, hills, the theme's props, clouds or stars
const hero = B.rig(CONFIG.hero, { size: 1.6 }); scene.add(hero);   // a kit character spec as a toon rig with Ink
const friend = B.sprite({ species: 'bunny' }); friend.position.set(3, W.heightAt(3, -3), -3); scene.add(friend);
const coin = B.spark(); coin.position.set(0, W.heightAt(0, -6) + 1, -6); scene.add(coin);
BRB.fx.fit3d(renderer, camera, { maxDpr: B.dprCap, onResize(w, h) { camera.fov = w / h < 0.8 ? 70 : 60; } });
B.run(dt => { /* move the hero: hero.position, hero.heading (radians), hero.speed 0..1, hero.air; then the camera */ });
```

- `Oomba.three(THREE, {renderer, scene, camera, theme, style, tod, size, governor})` → `B`. `theme` is a theme name or
  recolour (Themes, above); `style: 'bold'` (12-14) or the theme's; `tod` 0 (noon) … 1 (night): the theme's by default,
  night on a dark site, dusk or later in Bold; `governor: false` when the game runs its own quality ladder.
- `B.world({size, seed, height(x, z), hilly, flat, ground, hills, props, propCount, clouds})` → `{group, heightAt(x, z),
  props, size, sun, hemi}`. `B.sky({size, shadows})` alone sets the sky, fog and lights for a game with its own land;
  `B.look.land` → `{grass, grassDark, rock, sand}` colours for it, `B.look` also has `name biome tod accent music bed props`.
- Characters: `B.rig(spec, {size})` (low-poly, about 17 draw calls with its Ink: the hero; `B.rig(Oomba.avatar())` is
  the player's own character, for "play as me") and `B.sprite(spec, {size,
  mood})` (a billboard of the 2D art, 1 draw call: NPCs and crowds). Both: `position`, `heading`, `speed` (0 idle, 0.3
  walk, 1 run), `air` (jump), `play('cheer' | 'wave' | 'hurt' | 'land', ms)`; a sprite also has `mood(face)`.
- Things: `B.prop(name, {size, variant})` (any kit prop as a billboard), `B.spark({size})` (the reward spark in 3D).
- Your own models: colour them with `B.toon(hueOrRole, {glow, opacity, flat})` (`flat: true` gives a faceted low-poly look) (hue names and roles, never colour codes), or
  build with Lambert / Phong and call `B.inkify(root)`; `B.outline(obj, {important, width})` adds Ink (only `important`
  ones keep it on slow devices); `B.bake(group)` merges a model into one mesh (mark moving parts `userData.pivot = true`).
- `B.update(dt)` every frame when the game runs its own `setAnimationLoop` (`B.run(fn)` does it for you, and caps slow
  devices at 30 fps). `B.fit({onResize})` sizes the renderer where there is no `BRB.fx.fit3d`. `B.tier` (`'low' | 'mid' | 'high'`), `B.quality` (0-2, the governor lowers it: pixel ratio, shadows,
  outline distance, props), `B.dprCap`, `B.reduced`, `B.motion` (multiply your own decorative motion by it: 0 with
  reduced motion, 0.75 in Bold), `B.color(hue, step)`, `B.neon(name)`, `B.toScreen(obj)` → `{x, y}` CSS px for DOM.
- Screens: the kit's own over the canvas: `Oomba.ui.title`, `Oomba.ui.howTo`, `Oomba.ui.hud`, `Oomba.ui.ask`,
  `Oomba.ui.win`, `Oomba.ui.tryAgain`, `Oomba.ui.pause`.
<!-- /builder -->

## Live class games (kit 1.1.0, pack `live`)

Oomba Live lets a teacher or grown-up host any live-ready game for a whole class: players join at /join with a code,
on their own devices. The platform does the room (codes, the lobby, seats, reconnects, the host's controls, a shared
clock, timed questions, the leaderboard, results, the gradebook and safety); the game uses `Oomba.live` from the
`live` pack. Played alone (not in a live session) every call is safe and the game plays as before. The frame never opens
a socket: the SDK carries the messages to the page over a private port, and the server checks every one. The wire
protocol is [live-protocol.md](live-protocol.md).

<!-- builder:live -->
**Live class games.** Load the kit tag, then the game's other packs, then `{{PACK_TAG:live}}`. A game is live-ready
(a teacher can host it) when it: calls `Oomba.live.ready({...})` once; reacts to the session (`on('start')`, `on('end')`);
reports results (`score(n)`, `item(i, ok)` or `quiz.answer(choice)`); and never touches `BRB.live`, `MessageChannel` or
`postMessage`. Everything must also work alone (`Oomba.live.active` is false, the role is `'solo'`, `start` fires after
`ready()`).

- `Oomba.live.ready({presence, lobby, quiz, hostView, maxScorePerSec, view, words})`: once, when the game can play.
  `presence: {bounds (metres from the centre), maxSpeed (m/s)}` for games where players walk around a shared world;
  `lobby: true` when the game draws its own waiting room (otherwise the platform's lobby shows first); `quiz: true` when
  the host's question set drives the game; `hostView: true` when the game draws a view for the projector;
  `words: ['kind', 'word', ...]` (up to 64, written out in the code) lists every event kind and word the game's `send()`
  uses: a player's events carry only these.
- `Oomba.live.active`, `.role` (`'player' | 'host' | 'solo'`), `.phase` (`lobby loading countdown playing paused between
  ended`), `.round`, `.view` (`'3d' | '2d'`: draw 2D when it says so), `.me` (`{seat, name, avatar, team, score}`),
  `.players()` (each `{seat, name, avatar, team, score, connected, ready, late, me}`; names are already in the player's
  language), `.player(seat)`, `.nameOf(seat)`, `.avatarOf(seat)`, `.now()` (the server's clock), `.since(at)`.
- `Oomba.live.on(event, fn)` → off. Events: `welcome start round countdown loading pause resume between end` (`{top}`),
  `phase join leave update`, `event` (`{from, kind, data}`), `state`, `question` (`{i, n, q, choices, secs, at,
  answered}`), `answered`, `answers` (host: `{i, n}`), `reveal` (`{i, answer, counts, top}`), `result` (`{ok, points, rank,
  score}`), `race`, `leaderboard`, `emote` (`{from, name, me}`; `me` is the player's own), `fix` (the server put you
  back: `{x, y, z}`).
- Reporting: `Oomba.live.score(n)` (the player's total, it can only rise as fast as `maxScorePerSec` per second of play), `Oomba.live.item(i,
  ok)` (one result per item, for the teacher's per-question view), `Oomba.live.quiz.answer(choice)` (the open question;
  the server times it), `Oomba.live.quiz.current`, `Oomba.live.quiz.answered`, `Oomba.live.quiz.left()` (ms).
- Sharing: `Oomba.live.send(kind, data, {toHost})`: a small game event to everyone else (or the host); `kind` and every
  word in `data` must be in `ready({ words })` (object keys too, unless 1-2 letters); `data` holds only numbers,
  true/false, null and those words, in arrays or objects two deep at most: never text for people to read (there is no
  chat). Anything else is dropped (send returns false). `Oomba.live.state` and
  `Oomba.live.setState(patch)` (host only): shared state everyone reads. `Oomba.live.emote(name)` (`Oomba.live.emotes`).
- Presence: `Oomba.live.move(x, y, z, heading, anim)` (metres, radians, an anim from `Oomba.live.anims`); call it every
  frame, it sends at most 10 a second and only on a change. `Oomba.live.position(seat)` → the interpolated `{x, y, z, h}`.
- 3D: `const crowd = Oomba.live.crowd(B, {make, size, auto, groundY, nameplates})`: every other player in your bridge
  world, interpolated, with nameplates: kit rigs near, billboards further, one instanced shape far away (the counts fit
  the device). `auto: false` and `crowd.update(dt)` in your own loop; `crowd.place(seat, x, y, z, heading, speed)` to put
  a player where your game says (a race track), `crowd.free(seat)` to go back to their own moves;
  `crowd.spectate(camera, dt)` (a slow camera tour round the players, for the host's view); `make(spec, seat)` builds your
  own model for a player (give it `play(name, ms)` and read `.speed` to animate); `self: () => myRig` so the player's own
  emotes play on their own figure.
- 2D: `const flat = Oomba.live.flat({me, px})`: `flat.draw(ctx, {cx, cz, scale, ox, oy, r})` draws everyone's portrait and
  name at (x, z) top-down, with the emote each just sent; `flat.place(seat, x, z)`, `flat.free(seat)`,
  `flat.portrait(seat)` → a canvas, `flat.badge(ctx, seat, x, y)` (a player's emote, for figures you draw yourself).
- Teams (the host may turn them on for any game; every call is safe without teams: `teamsOn` false, `teams()` `[]`,
  `myTeam` null): `Oomba.live.teamsOn`, `.teams()` → `[{team, name, color, ink, shape, icon, score, sum, avg, rank,
  size, members: [seat], mine}]` (`rank` 0 = no players yet, or ranks hidden), `.team(k)`, `.myTeam`, `.teamOf(seat)` → k
  or 0, `.teamStyle(k)` → `{name, color, ink, shape, icon}`, `.teamScoring` (`'avg' | 'sum'`), `.drawShape(ctx, shape, x,
  y, r, fill, stroke)`. Events: `teams` (`{teams, why: 'setup' | 'move' | 'scores' | 'final'}`), `bonus` (`{seat, team,
  reason, points}`); `leaderboard`, `reveal` and `end` also carry `teams`. `players()` and `.me` carry `team`. Colour is
  never the only cue: draw the team's shape (`drawShape`) or its name next to its colour; write text on a team colour in
  its `ink`. `crowd()` and `flat()` already draw team rings, nameplate bands and shape badges (`crowd.teamRing(myRig, k)`
  for your own figure). `send(kind, data, {team: true})` sends to the player's own team (the host: `{team: k}`). A
  target a role may not use (a player naming a seat or a team number) drops the event: it is never sent to everyone.
  `ready({ teams: true })` says the game draws its own team UI. The platform keeps team scores; games never add them up.
  `Oomba.live.names === 'hidden'` on the projector: show avatars, teams and ranks there, never empty name boxes.
- No typing in a live game: text boxes are read-only and `prompt()` returns null. Show names only from `players()`.
- A 3D live game also needs a 2D path: add `<meta name="oomba-live" content="2d">`, keep the game's rules and a top-down
  view in a classic `<script>`, and put only the 3D view in the module; draw 2D when `Oomba.live.view === '2d'`.

```js
const L = Oomba.live;
L.ready({ quiz: true, hostView: true });
L.on('question', q => showQuestion(q.q, q.choices));            // big buttons; on a tap: L.quiz.answer(i)
L.on('reveal', r => markRight(r.answer));
L.on('result', r => say(r.ok ? 'right' : 'wrong'));
L.on('end', e => showPodium(e.top));
```

```js
const L = Oomba.live;
L.ready({ presence: { bounds: 30, maxSpeed: 8 }, lobby: true, hostView: true, maxScorePerSec: 50, words: ['coin'] });
L.on('event', e => { if (e.kind === 'coin') popCoin(e.from, e.data.n); });  // L.send('coin', { n: 3 })
const crowd = L.crowd(B, { auto: false, self: () => heroRig });   // B = Oomba.three(THREE, {...})
L.on('start', () => { playing = true; });
L.on('end', () => { playing = false; L.score(points); });
B.run(dt => { moveHero(dt); L.move(hero.position.x, 0, hero.position.z, hero.heading, hero.speed > 0.5 ? 'run' : 'idle'); crowd.update(dt); });
```

```js
// Teams: a band per team with its shape and name (never colour alone), and my team's place.
L.ready({ quiz: true, hostView: true, teams: true });
L.on('teams', e => e.teams.forEach((tm, i) => {
  ctx.fillStyle = tm.color; ctx.fillRect(0, i * 40, 300, 36);
  L.drawShape(ctx, tm.shape, 20, i * 40 + 18, 12, tm.ink); ctx.fillStyle = tm.ink; ctx.fillText(`${tm.name} ${tm.score}`, 40, i * 40 + 24);
}));
L.on('result', () => { if (L.myTeam && L.myTeam.rank) say(L.myTeam.name + ': ' + L.myTeam.rank); });
```
<!-- /builder -->

Teacher tools that games never see (docs/decisions.md "Oomba Live, part 3"): a student's support (extra time, read
aloud, Simple view) stays on the player's page and the server; it is never passed into a game frame. Extra time applies
to the platform's timed questions (quiz modes) only: a game that runs its own clock has no extra time, so give it an
untimed or slower mode of its own. "Eyes up" pauses the game (`pause`/`resume`) and the teacher's fixed messages are
shown by the page, not the game. On the projector, a player's bonus points never reach the game (a team's do: `bonus`).

## The two clocks (read this first)

| Clock | Calls | Stops when |
|---|---|---|
| **Game** (the default) | `Oomba.wait(ms)`, `Oomba.after(ms, fn)`, `Oomba.every(ms, fn)`, `Oomba.time.wait/after/every`, `Oomba.tween(...)`, `Oomba.spring(...)` | the game is paused (pause screen, quiz, dialog, a hidden page, a lost focus), in hit-stop, and it slows in slow-mo |
| **Real** | `Oomba.time.real.wait(ms)`, `Oomba.time.real.after(ms, fn)`, `Oomba.time.real.every(ms, fn)`, `Oomba.tween.ui(...)` | never: use it for menus, story beats and results screens |

<!-- builder:api -->
Rule: spawns, cooldowns, level timers and enemies use the game clock. Anything that must keep going while a menu is
open uses `time.real`.
<!-- /builder -->

## Core

- `Oomba.version` (`'1.1.0'`), `Oomba.api` (`1`), `Oomba.tier` (`'low' | 'mid' | 'high'`), `Oomba.backend` (`'paper' | 'glaze'`).
- `Oomba.color(role, step?)` → hex. Roles: `player friend correct go` (mint), `reward hot` (spark), `hazard wrong` (coral), `interact water` (sky), `magic` (grape), ... Steps `'tint' | 'light' | 'base' | 'shade'` or 0-3.
- `Oomba.tokens` → `{radius, space, outline(hPx), motion, z, palette, roles, skin, hair}`.
- `Oomba.theme.mode` (`'light' | 'dark'`), `Oomba.theme.biome`, `Oomba.theme.look` and `Oomba.theme.names` (Themes, above), `Oomba.theme.on('change', fn)` → off, `Oomba.theme.set('light' | 'dark' | 'auto')`.
- `Oomba.rand(seed)` → `{float(), int(a, b), range(a, b), pick(arr), chance(p), shuffle(arr)}`; `Oomba.seedOf(text)` → number.
- `Oomba.tween(target, props, {ms, ease, delay, onUpdate})` → Promise (with `cancel()`), on the game clock. `Oomba.tween.seq(steps)`, `Oomba.tween.all(promises)`, `Oomba.tween.stagger(items, fn, gapMs)`, `Oomba.tween.ui(target, props, opts)` (real clock).
- `Oomba.ease` (31 easing functions by name), `Oomba.easings` (their names).
- `Oomba.spring(target, prop, {k, zeta})` → `{to(v), value, stop()}`.
<!-- builder:api -->
- `Oomba.wait(ms)` → Promise, `Oomba.after(ms, fn)` → cancel, `Oomba.every(ms, fn)` → cancel (game clock).
<!-- /builder -->
- `Oomba.time.start()`: runs the game clock (and the pause key) in a game with no `Oomba.stage` (three.js).
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
<!-- builder:api -->
- `Oomba.input.hold(action, ms)` → Promise: holds an action as if a key were down (demos, tutorials, tests).
- Actions: `left right up down jump action pause confirm back`. P / Esc / gamepad Start is `pause`.
<!-- /builder -->

## Text, sound, save, settings

<!-- builder:api -->
- `Oomba.t(key, vars)` (`{name}` in a string takes `vars.name`, numbers formatted for the language), `Oomba.strings({en: {...}, ar: {...}})`, `Oomba.num(n, intlOptions)`, `Oomba.units(text)` (typewriter units), `Oomba.lang`, `Oomba.dir`.
<!-- /builder -->
- `Oomba.fonts.ready` → Promise (the kit font, or the system font after 1.5 s).
<!-- builder:api -->
- `Oomba.sfx(name, {pitch, pitchVar, volume, at: entity, pan, caption})`. Kit voices: `pop whoosh correct wrong spark step land select levelup count hurt win`, plus `gate` and `splash`; SDK names `jump hit coin lose click powerup` go to `BRB.sfx`. When captions are on, key sounds (`correct wrong hurt levelup win spark gate splash`) show a caption, throttled; `caption: 'text or key'` captions any sound, `caption: false` none.
- `Oomba.music('meadow' | 'calm' | 'off')`; `Oomba.say(textOrKey, {who, vars})` → Promise (speech, caption, mouth flaps).
<!-- /builder -->
- `Oomba.save.define({v, defaults, migrate})` → the saved object; `Oomba.save.get()`, `Oomba.save.set(patch)`.
- `Oomba.settings`: read any setting as a property (`Oomba.settings.captions`), assign to change it, `Oomba.settings.on('change', fn)`, `Oomba.settings.set({...})`, `Oomba.settings.reduced` (reduced motion now).
- `Oomba.validate('char' | 'parts' | 'legend' | 'game', spec)` → `{spec, warnings}` (snaps to valid values).

## Characters and art

<!-- builder:api -->
- `Oomba.char(spec)` → a frozen character spec. Spec: `{species: 'oomba'|'kid'|'fox'|'bunny'|'frog'|'bee', skin: 0-7, hair: {style, color}, outfit: {top, color}, wear: [...], mood, colors: {base, belly, accent}, body, seed}`.
- `Oomba.avatar()` → the character the player designed on their Me page (`BRB.user.character`, a parts spec; with its Bold wear when the game is Bold), else a look from their account; the mascot for guests. `Oomba.me()` is the same.
- `Oomba.icon(name, {size, label, stroke})` → SVG string; `Oomba.icons` (names). Lines are Ink (`currentColor`); stickers fill by role (reward spark, danger coral, success mint). Pairs: `heart` / `heart-off`, `spark` / `spark-off`, `star` / `star-off`, `flag` / `flag-off`.
<!-- /builder -->
- `Oomba.art.species`, `Oomba.art.clips`, `Oomba.art.faces`, `Oomba.art.moods`, `Oomba.art.hair`, `Oomba.art.tops`, `Oomba.art.wear`, `Oomba.art.props` (groups), `Oomba.art.variants`, `Oomba.art.biomes`.
<!-- builder:api -->
- `Oomba.art.toCanvas(nameOrSpec, px, variant)` → a canvas (DOM previews, cards).
<!-- /builder -->
- Art packs: `Oomba.art.define(name, {w, h, ax, ay, draw(ctx, k)})` (works before or after the first `toCanvas`), `Oomba.art.pack(fn)`, `Oomba.art.rig(name, fn)`, `Oomba.art.part(name, fn)`, and the drawing grammar `Oomba.art.ink` (`sticker detail ringEye glow lines ellipse rrect spark`), `Oomba.art.sparkPath`, `Oomba.art.autotile`.

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

<!-- builder:api -->
- `Oomba.ui.root()`, `Oomba.ui.button(label, {kind: 'hot'|'go'|'quiet'|'icon', icon: 'up' (an icon name), big, onPress})` → the `<button>` (label shown as given: pass `Oomba.t('key')`), `Oomba.ui.toast(text, {ms})`, `Oomba.ui.announce(text)`, `Oomba.ui.caption(text, {ms})`. Space and Enter press a focused button (cards, letters) without jumping.
<!-- /builder -->
- `Oomba.ui.title({title, subtitle, hero, heroSize, brand, play, pause})` → Promise (resolves on Play). The block sits above the horizon.
- `Oomba.ui.howTo([{icon, text}])`, `Oomba.ui.countdown(n)`, `Oomba.ui.pause()` → `'resume' | 'restart' | 'quit'`, `Oomba.ui.settings()`.
- `Oomba.ui.win({stars, score, best, hero, title, next, pause})` → `'again' | 'next'` (`next: false`: "Play again" leads, no Next); `Oomba.ui.tryAgain({score, best, hero, title, say})` → `'again'`.
- `Oomba.ui.hud(['score', 'lives:3', 'timer:60', 'progress', 'combo', 'count:spark'], {lives, total, countIcon, pause, sound, onPause})` → `{score: {add, set, value}, lives: {lose, gain, set, value}, timer: {start(s, onEnd), stop(), left}, progress: {set(0..1)}, combo: {bump(), reset()}, count: {add, set(n, total)}, pause()}`. Unknown widget names warn. The HUD binds P / Esc / Start and a lost focus to the pause screen and routes the result to `onPause(result)` and `Oomba.on('pause', fn)`. **Quit** inside a game frame cannot leave the page: treat it as "back to this game's title screen" (the site's own back button leaves).
<!-- builder:api -->
- `Oomba.ui.ask({q, a, choices, hint, tries, who, index})` → Promise\<boolean\>. `a` (or `answer`) is the right **value**; `index` names the right tile instead; `choices` is 2-4 values or a number of tiles to make around a numeric answer. A first miss shows the hint and another go; the last miss reveals the answer. `who` keeps the asking character clear of the scrim. It rejects (and warns) if the answer is not a choice.
<!-- /builder -->
<!-- builder:api -->
- `Oomba.ui.banner('correct' | 'wrong', reason, text)`: "Correct!" / "Not quite." then `reason` (a key or text; maths stays left to right), or `text` alone. It drops in under the HUD, above `var(--ok-safe-top)`; while the quiz card is open it shows inside the card. `Oomba.ui.bubble(entity | {x, y}, textOrKey, {ms, portrait, readAloud})` → Promise, `Oomba.ui.dialog({title, text, portrait, buttons: [{label, kind, value}]})` → value, `Oomba.ui.portrait(spec, {size, mood})` → canvas, `Oomba.ui.open` (modals open now).
<!-- /builder -->

## Juice and helpers

- `Oomba.juice.pop(entityOrElement)`, `Oomba.juice.shake(trauma, element?)`, `Oomba.juice.hitstop(ms)`, `Oomba.juice.float(text, x, y, role)`, `Oomba.juice.burst(preset, x, y, opts)`, `Oomba.juice.confetti()`, `Oomba.juice.flash(color)`, `Oomba.juice.presets`.
- `Oomba.fit(canvas, {size, fit, dprCap, onResize})` and `Oomba.draw` (`panel button text sprite spark ring rrect sky`): kit-styled helpers for porting a hand-drawn canvas game one function at a time.

## Writing a game for the Builder (the kit rules)

The Builder's prompt carries this section, the API lines above marked for it, the kit's art lists and the three
examples below, as one fixed block (`KIT_RULES` in `server/builder/kit-rules.js`, made by `node scripts/build-kit-rules.js`;
a test keeps it in step with this page).

<!-- builder:rules -->
Every new game is built on the Oomba Kit: its characters, props, biomes, icons, screens, sounds and motion make a
game look and feel like a first-party Oomba game in light and dark, in 13 languages, with captions, reduced motion
and the flash limit handled for you. The game's own code is only its idea: the level, the rules and a few handlers.

The document (nothing else around it; the platform wraps it and loads the SDK):

```html
<title>Spark Hop</title>
<style>/* only for your own DOM pieces: kit variables, no colour codes, no fonts */</style>
<div id="game"></div>
{{KIT_TAG}}
{{PACK_TAG:dress}}
{{PACK_TAG:art-props}}
<script>
'use strict';
const CONFIG = {
  title: 'Spark Hop',
  hero: { species: 'fox', wear: ['scarf'] },
  theme: 'castle',
  lives: 3,
};
const WORDS = { en: { sub: 'Reach the flag!' }, es: { sub: '¡Llega a la bandera!' } };
Oomba.game({ api: 1, title: CONFIG.title, subtitle: 'sub', strings: WORDS, /* ... */ });
</script>
```

- Copy the kit tag exactly: `{{KIT_TAG}}`. A pack goes right after it, exactly as listed under the art lists. Load only
  the packs the game uses, and always `dress` (every 2D game: it fills the world with trees, houses, framing leaves
  and birds by itself; never add decoration code of your own).
- Pick the world with a theme (`theme: 'castle'` in CONFIG; what the builder asks for: "a spooky level" is `haunted`,
  "underwater" is `reef`, "football" is `stadium`), load the packs the art lists give for it right after `dress`, and
  use its props (the `props` of `Oomba.theme.look`, or by name in the level's legend). A builder's colour wish is a recolour
  (`theme: { name: 'beach', accent: 'grape' }`), never colour codes. Use `biome` only for a world no theme has.
- Who is it for? Ideas that sound 12-14 (cyber, neon, esports, skate, parkour, ninja, robot, battle, speedrun, space
  station, haunted, or "cool" / "older" / "not babyish") get `style: 'bold'` and the `style-bold` pack (taller cast,
  sharper UI, dusk light, its biomes and wear). Everything else stays playful (no `style`). `<div id="game"></div>` comes before the kit tag (the kit needs the page body).
- Use `Oomba.game` for every kind of game: platformers, catchers and runners (`controls: 'platformer:...'`), top-down
  worlds (`'topdown'`), and quiz, card, word, board and party games (`controls: 'none'`, `camera: 'fixed'`, the turns
  started from `on.start(w)`, your buttons or cards appended to `Oomba.ui.root()`). It brings the title, how-to,
  countdown, HUD, pause, results, best score, `BRB.gameOver` and the test hooks. Use `Oomba.stage` plus `Oomba.ui` only
  when `Oomba.game` truly cannot fit; then call `Oomba.test({state, start})` and `BRB.gameOver({won, score})` yourself.
- `const CONFIG = { ... }` near the top, **one key per line**, holds what a builder may change: title, hero and cast as
  character specs, theme, lives, times, speeds, item lists. Restyling a character is editing its spec line
  (`hero: { species: 'fox', colors: { base: 'sky' }, wear: ['wizard-hat'] },`). Long content (questions, words, level
  rows) goes in its own `const` with one entry per line.
- Art: the kit's. Characters are specs or species names, things are props, pictures in DOM are
  `Oomba.art.toCanvas(name)`, symbols are `Oomba.icon(name)`, the world is a theme (or a biome) plus the level's ground. Unless
  the builder asks, never draw your own characters, never use emoji as pictures, never add images.
- The builder's own choices always win: their colours (even a colour code), characters and made-up creatures (a
  "dragon-cat": the closest species recoloured and dressed, called what they call it), an odd world (the closest theme
  recoloured), a plain look, emoji or a font they asked for. Never swap them back to a kit default: these rules and the
  style check's look suggestions only cover what they did not say.
- "Me", "my character" or "play as me" is `hero: 'me'`: the character the player designed on their Me page
  (`Oomba.avatar()`); Star Island: `hero: 'me'` too.
- Colour: hue names (`mint spark coral sky grape peach cocoa stone snow`) and roles (`player friend correct go reward
  hot hazard wrong interact water magic special`) in specs and `Oomba.color(role, step)`; in CSS only
  `var(--ok-card) var(--ok-text) var(--ok-edge) var(--ok-bg2) var(--ok-line) var(--ok-focus)`. Spark yellow means a
  reward. No colour codes outside CONFIG. Right and wrong always get a shape or words too (✓ / ✕, `Oomba.ui.banner`).
- Words: every word the player reads is a key in a `WORDS` table passed as `strings` (the game's language first,
  then any others you know); the spec's `subtitle`, `howTo` texts and `say` lines are keys. The kit's own buttons and
  screens are already translated. Numbers through `Oomba.num(n)`.
- Time: the game clock only (`w.after`, `w.every`, `Oomba.after`, `Oomba.every`, `Oomba.wait`, `Oomba.tween`) so pause,
  the quiz card and a hidden tab stop it; per-frame code goes in `update(w, dt)`. Never `Date.now`, `setTimeout`,
  `setInterval` or your own `requestAnimationFrame` loop.
- Never your own fonts, title, pause or results screens, `shadowBlur` or canvas filters (use the `glow` part and
  `stage.light`). Juice, sound effects, captions and reduced motion come with the kit: add `Oomba.sfx`, `entity.pop()`,
  `w.stage.burst(...)` for your own moments.
- Finish it like a real game:
  - Progress: `hud: [..., 'count:flag']` set with `w.hud.count.set(n, total)` per question, word or wave ("3 of 10").
  - Two or three levels (`level: [a, b, c]`, harder by `w.levelNo`): the results card then has **Next**.
  - Sums read `'{a} × {b} = ?'`, never a bare `5 × 5`. Races say where the rival is: "Frog is 2 steps behind".
  - Tap / Space acts? Show a big `Oomba.ui.button` (icon `up`, bottom end corner) and a how-to card for the key.
  - Say what it is about on the title: `titleBadge: Oomba.art.toCanvas('pie', 110, '3/4')` (a pie, a letter block, a
    number tile). A night game needs no moon of its own (the kit's is big); make things glow with the `glow` part and a
    `w.stage.light({follow: e, radius: w.cell * 1.7})` each.
  - Questions and words in your DOM cards are big: at least `clamp(40px, 11vw, 64px)` on a phone.
  - Pickups are easy to see: on a phone-first platformer use `$: { kind: 'spark', size: 1 }` in the legend.
- Layout (the kit warns when these break): characters never overlap (each its own spot, row or lane) or get cut off. Falling or flying choices are spread evenly
  (`x = w.stage.viewX(0.18 + 0.64 * i / (n - 1))`), one size. Big decoration sits high in a corner or low at the side,
  never in the middle where the title, Play and the choices go. Keep the band
  behind the title and Play free of ledges (start them below it or past the first screen). Speech bubbles place themselves clear of pickups and faces; your own DOM that must stay visible gets
  `data-ok-keep`. Choices fly above the skyline's signs, not across them.
- Phones first: the kit's camera frames platformers; for `camera: 'fixed'` games set the zoom in `update` so the scene
  fits `w.stage.view` (see the third example). Your DOM pieces sit below `top: var(--ok-safe-top)` (the HUD and the
  kit's right/wrong banner are above it) or in a card at the bottom, and keep 48px buttons. Put something to see near
  the start: the play picture becomes the game's cover.
- 3D games (a world you walk around in, only when the builder asks for 3D) are three.js on the kit's 3D bridge
  (`Oomba.three`, the `bridge-3d` pack: {{PACK_TAG:bridge-3d}}): the 3D RULES say how.
- An older game (no kit tag) keeps its own style. Only when the builder asks ("upgrade it", "the new look") rebuild it
  on the kit with `write_game`, keeping its idea, rules, levels, words and CONFIG values; the old version stays in Versions.
<!-- /builder -->

<!-- builder:examples -->
A platformer with a quiz gate (everything else is the kit):

```js
const CONFIG = {
  title: 'Spark Hop',
  hero: { species: 'fox', wear: ['scarf'] },
  theme: 'meadow',
};
const WORDS = { en: { sub: 'Grab the sparks and reach the flag!', run: 'Run with the arrows', jump: 'Jump with Space' } };
Oomba.game({
  api: 1, title: CONFIG.title, subtitle: 'sub', theme: CONFIG.theme, hero: CONFIG.hero, strings: WORDS,
  controls: 'platformer:kid-easy', hud: ['score', 'lives:3', 'timer:90'],
  howTo: [{ icon: 'move', text: 'run' }, { icon: 'jump', text: 'jump' }],
  level: Oomba.level.grid([
    '                              ',
    '          $$$         B       ',
    '         =====    $ $     $  G',
    '  P   o o      ^^      Q  K   ',
    '##############################',
  ], { Q: { kind: 'gate', q: '3 × 4 = ?', a: 12, choices: [10, 12, 14, 16] } }),
});
```

A catcher: things fall, the hero catches them (the pickup magnet, hurting and the HUD are the kit's):

```js
const CONFIG = {
  title: 'Fruit Catch',
  hero: { species: 'bunny' },
  good: ['gem', 'coin', 'mushroom'],
  bad: ['rock'],
};
const WORDS = { en: { sub: 'Catch the fruit, dodge the rocks!' } };
let wait = 0;
Oomba.game({
  api: 1, title: CONFIG.title, subtitle: 'sub', hero: CONFIG.hero, strings: WORDS,
  controls: 'platformer:snappy', hud: ['score', 'lives:3', 'timer:60', 'combo'],
  level: Oomba.level.grid(['                        ', '                        ', '                        ', '                        ',
    '                        ', '           P            ', '########################', '########################']),
  update(w, dt) {
    if (w.scene !== 'play') return;
    if ((wait -= dt) <= 0) {
      wait = 0.8;
      const bad = w.rand.chance(0.25), x = w.rand.range(w.stage.viewX(0.1), w.stage.viewX(0.9));
      const e = w.spawn(w.rand.pick(bad ? CONFIG.bad : CONFIG.good), { x, y: w.stage.viewY(0) - w.cell, size: 0.9, tag: 'drop', parts: [bad ? 'hazard' : { collectible: { value: 10 } }] });
      e.fall = 4 * w.cell;
    }
    for (const e of w.all('drop')) { e.y += e.fall * dt; if (e.y > w.level.h - 2 * w.cell) e.remove('puff'); }
  },
  on: { hit(w, by) { if (by) by.remove('puff'); }, timeup(w) { w.win(); return false; } },
});
```

A quiz show (`controls: 'none'`: a host asks with the kit's quiz card, the camera frames the set; every word is a key):

```js
const CONFIG = {
  title: 'Planet Quiz',
  host: { species: 'frog', wear: ['glasses'] },
  theme: 'forest',
};
const QUESTIONS = [
  { q: 'q1', a: 'earth', choices: ['earth', 'mars', 'venus'], fact: 'f1' },
  { q: 'q2', a: '1', choices: ['1', '2', '3'] },
];
const WORDS = {
  en: { sub: 'Answer the questions!', hello: 'Ribbit! Ready?', q1: 'Which planet do we live on?', q2: 'How many moons does Earth have?', earth: 'Earth', mars: 'Mars', venus: 'Venus', f1: 'Earth is the only planet we know with life.' },
  es: { sub: '¡Responde las preguntas!', hello: '¡Croac! ¿Listo?', q1: '¿En qué planeta vivimos?', q2: '¿Cuántas lunas tiene la Tierra?', earth: 'Tierra', mars: 'Marte', venus: 'Venus', f1: 'La Tierra es el único planeta con vida que conocemos.' },
};
Oomba.game({
  api: 1, title: CONFIG.title, subtitle: 'sub', theme: CONFIG.theme, strings: WORDS, titleHero: Oomba.char(CONFIG.host),
  controls: 'none', camera: 'fixed', hud: ['score'],
  level: Oomba.level.grid(['                              ', '                              ', '                              ',
    '            P     N           ', '##############################', '##############################'],
  { N: Object.assign({ kind: 'npc', tag: 'host', flip: true }, CONFIG.host) }),
  update(w) {   // the middle 12 cells fill the screen, the ground at the bottom
    const V = w.stage.view, z = Math.min(V.vw / (12 * w.cell), V.vh / (w.level.h + w.cell));
    w.cam.bounds(null); w.cam.zoom = z; w.cam.x = w.level.w / 2; w.cam.y = w.level.h - 0.4 * w.cell - V.vh / z / 2;
  },
  on: {
    async start(w) {
      const host = w.find('host'); let right = 0;
      await w.say(host, 'hello');
      for (const q of QUESTIONS) {
        if (w.ended) return;
        if (await w.ask({ q: q.q, a: q.a, choices: w.rand.shuffle(q.choices.slice()), who: host })) { right++; w.score(100); host.state('cheer'); }
        if (q.fact && !w.ended) await w.say(host, q.fact);
      }
      if (right >= QUESTIONS.length / 2) w.win({ stars: right === QUESTIONS.length ? 3 : 2 }); else w.lose();
    },
  },
});
```
<!-- /builder -->

## Test hooks (`window.__brbTest`)

`state()`, `step(n)` (n fixed updates, deterministic), `seed(n)`, `frameStats()` (`p50 p90 draws pages uploads fireflies ...`), `setTier(t)`, `setBackend(b)`, `setTheme(m)`, `setLang(l)`; `start()`, `win()` and `skip()` once the game registers them with `Oomba.test`.
