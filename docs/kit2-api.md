# Oomba3D API reference (Oomba3D 1.2.0)

Oomba3D is the small 3D game library for Kit 2 themes (plan: [kit2-themes-plan.md](kit2-themes-plan.md)). This page
lists only what it does today, with exact signatures: it is the page a model reads before writing a Kit 2 game.
`tests/unit/kit2-oomba3d.test.js` checks that every name on this page exists in the library and that every name the
library offers is on this page, and it plays the Sky Islands demo (`kit2/demo/sky-islands.html`) in the real game frame.
`tests/unit/kit2-creatures.test.js` plays the animals (`kit2/demo/creatures.html`) the same way.

A Kit 2 game carries exactly the Kit 2 import map (`kit2ImportMap()` in `server/services/vendor.js`: Three.js, its
add-ons and Oomba3D, each pinned with its integrity) and imports from `'oomba3d'`. **The import map is how a game picks
its Oomba3D version, and it keeps it for good:** a new game gets the newest (`kit2ImportMap()`, 1.2.0); a game saved
with the 1.1.0 or 1.0.0 map (`kit2ImportMap('1.1.0')`) still loads that exact file, which never changes
(`kit2/SHIPPED.json`), and the scanner accepts the map of every shipped version and no other.

```html
<!-- kit2ImportMap() goes here -->
<script type="module">
  import { start } from 'oomba3d';
  const g = await start({ theme: 'sky-islands', version: '1.0.1' });
  await g.world.island({ x: 0, y: 0, z: 0 });
  const me = await g.hero('knight', { x: 0, y: 1.5, z: 3 });
  g.controls(me);
  g.followCamera(me);
  g.coins([[0, 3, -6], [0, 3, -9]]);
  await g.world.island({ x: 0, y: 1.2, z: -11, scale: 1 });
  g.askQuestion({ question: '7 × 8 = ?', answers: [54, 56, 63], correct: 56, at: { x: 0, y: 3, z: -24 } });
</script>
```

Rules the frame and scanner hold every Kit 2 game to (`docs/safety.md`):
- Load art only through Oomba3D, from the theme and version named in `start()`. The game's own code may not call
  `fetch` or `XMLHttpRequest`.
- Name a shipped theme and version (`g.theme` has its catalogue: `heroes`, `pieces` with tags and sizes, `sounds`):

  | Theme | Version | Heroes | Stand on (pass as `piece` to `g.world.island`) |
  |---|---|---|---|
  | `sky-islands` | `1.0.1` | the 5 adventurers | `island-round` (the default), `platform`, `platform-medium`, `platform-large` |
  | `castle-quest` | `1.2.0` (adds animals: `horse`, `deer`, `stag`, `fox`, `shiba`; 1.1.0 added trees, hills, rocks, a castle, tower, well, fence, bridge) | adventurers + the 4 skeleton pals | `floor-stone`, `floor-wood`, `floor-dirt`, `block`, `stairs` |
  | `spooky-hollow` | `1.0.0` | skeleton pals + adventurers | `ground`, `ground-small` |
  | `space-base` | `1.0.0` | adventurers + skeleton pals | `ground`, `ground-high`, `landing-pad`, `landing-pad-small` |
  | `toy-town` | `1.1.0` (adds trees, bushes, rocks) | adventurers + skeleton pals | `ground`, `road`, `road-crossing`, `road-junction` |
  | `medieval-village` | `1.1.0` (adds animals: `donkey`, `cow`, `husky`, `pig`, `sheep`) | adventurers + skeleton pals | `ground` (hexagon tiles), `ground-high`, `road`, `river-crossing`, `bridge` |
  | `cosy-home` | `1.0.0` | adventurers + skeleton pals | `floor`, `floor-small`, `bed`, `couch`, `table`, `cabinet` |
  | `busy-kitchen` | `1.0.0` | adventurers + skeleton pals | `floor`, `floor-small`, `counter`, `kitchen-table`, `table-round` |

  Adventurers: `knight`, `barbarian` (Explorer), `mage` (Wizard), `rogue` (Ranger), `rogue-hooded` (Hooded Ranger).
  Skeleton pals: `skelly`, `rattles`, `bonzo`, `captain-clank` (friendly cartoon skeletons, no weapons). Every hero plays
  every move, and `outfit` recolours capes, so there are many more looks than heroes.
  Animals (`g.theme.creatures`, Oomba3D 1.2.0 `g.creature()`): only the two worlds above have them so far. Each has its
  own moves; the pig and the sheep have only `idle` and `jump`, so they hop. No dinosaurs or fish have shipped yet.
- WebAssembly is allowed, so `g.physics()` gives real physics (Rapier) and meshopt-compressed models load. Heroes still
  use Oomba3D's own simple platform physics (`g.controls`), which is kinder to young players.
- Words a player sees (questions, toasts) come from the game; keep them kind and short, as on the rest of the site.

The Builder builds Kit 2 games too (since 13 Nov 2026, `docs/decisions.md` "Kit 2 in the Builder"). It reads this page
from `start(options)` on, and the catalogue of every shipped world (heroes, creatures, pieces with sizes, sounds, moves),
both generated into `server/builder/kit2-catalog.js` by `node scripts/build-kit2-rules.js`
(`tests/unit/builder-kit2.test.js` fails when that file is out of date). Its starter game is
`server/builder/templates/oomba3d.html`. The table above is a summary for people; the generated catalogue is the list
of names a built game may use.

## `start(options)`

`start({ theme, version, graphics = 'auto', time = 'day', weather = 'clear', outline = false, settings = true, reducedMotion, parent = document.body })` → `Promise<g>`

Loads the theme's `theme.json`, makes the renderer, the sky (the theme's colours), fog, light, glow and soft clouds,
and starts the game loop. Also exported: `VERSION` (`'1.2.0'`), `API` (the names below), `GRAPHICS`, `TIMES`, `WEATHER`
(the allowed values), `CREATURE_LIMITS` and `THREE` (the same Three.js). Everything in 1.1.0 and 1.0.0 is in 1.2.0 and
works the same (1.0.0's `lowPower: true` means `graphics: 'low'`); what 1.2.0 adds is opt-in: animals (`g.creature`,
`g.school`, an animal as the hero), `g.world.ground`, a piece's own clips, `'bubbles'` weather and swim controls.

- `graphics`: `'auto'`, `'low'` (shown to players as Fast), `'medium'` (Balanced) or `'high'` (Beautiful); see
  `g.graphics()`. `'auto'` starts at low on devices with 4 or fewer CPU cores or 4 GB or less of memory, otherwise high,
  and steps down a level after two 3-second spells under 30 frames a second.
- `time`: `'morning'`, `'day'` (the theme's own look), `'sunset'` or `'night'` (with stars); see `g.sky()`.
- `weather`: `'clear'`, `'snow'`, `'rain'`, `'sparkles'`, `'leaves'` or `'bubbles'`; see `g.weather()`.
- `outline`: `true` draws a thin ink outline round every hero and piece (the Oomba look). It doubles the meshes drawn, so
  keep it for scenes with up to a few hundred pieces.
- `settings`: `true` shows the gear button (top right). Players use it to pick Auto, Fast, Balanced or Beautiful
  graphics and to turn weather effects off, for this game only.
- `reducedMotion`: defaults to the player's `prefers-reduced-motion`. When on: clouds do not drift, coins do not spin,
  answer tokens do not bob, a wrong island disappears instead of sinking, and there is no confetti.

`g` also has `THREE`, `scene`, `camera`, `renderer`, `theme` (the theme's `theme.json`: `heroes`, `creatures`, `pieces`,
`sounds`, `moves`, `look`), `lowPower` (read-only: whether the level is low now) and `reducedMotion`.

| Level | Pixel ratio | Shadows | Glow | Smoothing (SMAA) | Clouds | Weather | Confetti | Animals animating / drawn / in a school |
|---|---|---|---|---|---|---|---|---|
| low (Fast) | 1 | off | off | off | a third | 35% | off | 6 / 10 / 12 |
| medium (Balanced) | up to 1.5 | 1024 | on | off | all | 70% | on | 12 / 20 / 20 |
| high (Beautiful) | up to 2 | 2048, soft | on | on | all | all | on | 20 / 32 / 30 |

### `g.hero(id, options)`

`g.hero(id, { x = 0, y = 0, z = 0, face = 0, outfit })` → `Promise<hero>`

Adds one of the theme's heroes (`g.theme.heroes`; Sky Islands: `knight`, `barbarian` "Explorer", `mage` "Wizard",
`rogue` "Ranger", `rogue-hooded` "Hooded Ranger"). `face` turns it (radians). A hero has `id`, `name`, `object`,
`position` and `play(move, { once = false, fade = 0.2 })`. Moves: `idle`, `ready`, `walk`, `run`, `jumpStart`,
`jumpAir`, `jumpLand`, `jump`, `cheer`, `wave`, `pickUp`, `use`, `bump`, `sit`, `cast` (`g.theme.moves.clips`). Heroes
carry no weapons. `outfit` (any CSS colour: `'#66C792'`, `'gold'`) recolours the hero's cape (and the Wizard's hat), so
one hero can be many characters: a green Knight, a gold Wizard, a team in matching capes.

**An animal as the hero** (1.2.0): `id` may be a creature the theme marks `playable` (`g.hero('horse')`); the result
works with `g.controls`, `g.followCamera`, `g.coins` and `g.celebrate` like any hero, and also has `creature: true`
and `moves`. Its own clips do the hero's moves: `idle`, `walk`, `run` and `jump` are its own (run and walk keep step
with its speed, and the jump is fitted to the time it is in the air); `jumpStart`, `jumpAir`, `jumpLand` and `cheer`
are its jump; any other move plays `idle` and returns `null`. `outfit` does nothing for an animal. An animal that is
not playable (the pig and sheep: no walk) throws an error that lists the playable ones.

### `g.world.island(options)`

`g.world.island({ x = 0, y = 0, z = 0, scale = 3, turn = 0, piece = 'island-round' })` → `Promise<solid>`

A piece the hero can stand on (any piece id works with `piece`; Sky Islands' standing pieces: `island-round`,
`platform`, `platform-medium`, `platform-large`, `platform-falling`, `brick`, `coin-block`). At scale 1 a
`island-round` is 5 wide and 0.5 tall; scale 3 is a big start island, 0.9 to 1.3 a stepping stone. A solid has
`object`, `box`, `top()` (the y to stand at), `onLand` (set it to `hero => {}`: called each time the hero lands on it)
and `sink()` (it falls away and can no longer be stood on).

### `g.world.piece(id, options)`

`g.world.piece(id, { x = 0, y = 0, z = 0, scale = 1, turn = 0, solid = false })` → `Promise<{ object }>` (or a solid
with `solid: true`)

Decoration and props: Sky Islands has `grass`, `grass-small`, `cloud`, `flag`, `coin`, `coin-block`, `dust`, `brick-bit`
and the platforms above (`g.theme.pieces`, with sizes at scale 1 and tags). Pieces stand on their `y`.
1.2.0: the result also has `moves` (the piece's own clips: `[]` for every piece shipped so far) and
`play(move, { once = true })` (a chest that opens; with reduced motion it goes straight to the end pose).

### `g.world.ground(options)`

`g.world.ground({ x = 0, y = 0, z = 0, size = 120, color = '#7cc46a', hills = 0 })` → `solid`

Ground the library makes, for a meadow or a field when the theme's tiles are not what you want: one flat-coloured
square, `size` wide, to stand and walk on, with its top at `y`. `hills` (a height, like `2`) rolls the outer part up
and down; the middle third stays level. The hero and the animals walk over it. Calling it again replaces it.

### `g.world.water(options)`

`g.world.water({ y = -6, color = '#3fa7d6', size = 600 })` → `{ object, y }`

A sea with gentle waves made in the shader (no texture), tinted by the sky. Still when reduced motion is on. Calling it
again replaces the sea.

### `g.followCamera(target, options)`

`g.followCamera(target, { distance = 10, height = 5.5 })`

The camera glides behind and above the target (a hero) and the sun's shadows follow it. Tall phone screens get a wider
view automatically.

### `g.controls(hero, options)`

`g.controls(hero, { speed = 7, jump = 9.5, gravity = 24, fallY = -12, spawn, tryAgain = 'Try again!', swim = false, floor, ceiling })` → `{ keys }`

Arrows or WASD move, Space jumps; on touch screens an on-screen pad (four arrows and a big Jump button) appears.
Landings are wide and kind. Falling below `fallY` puts the hero back at `spawn` (default: where it stood) and shows
`tryAgain` (`''` for nothing). Plays `run`, `idle` and `jump`, and the `jump`, `land` and `fall` sounds.
`swim: true` (1.2.0, for an underwater world): no falling. Space (or E, or the pad's up button) swims up, Q (or Shift,
or the pad's down button) swims down, letting go sinks very slowly; `floor` and `ceiling` (heights) keep the hero in.

### `g.coins(spots, options)`

`g.coins([[x, y, z], …], { piece = 'coin', scale = 2.6, value = 1, onCollect })` → `{ left() }`

Spinning coins; touching one adds `value` to the score, plays `coin` and calls `onCollect(coin)`. `left()` is how many
are still there.

### `g.askQuestion(options)`

`g.askQuestion({ question, answers, correct, at = { x: 0, y: 3, z: -38 }, spacing = 8, prompt = 'Jump to the answer:', notIt = a => 'Not ' + a + '! Try another island', rightText = 'Correct! +5', bonus = 5, onRight, onWrong })`
→ `Promise<{ islands, answered() }>`

Shows `prompt question` at the top and makes one island per answer in a row at `at`, `spacing` apart, each with its
answer floating above it on a big token. Landing on `correct`: the token turns green, `bonus` is added, the hero cheers
and `onRight()` is called. Landing on another: it sinks, `notIt(answer)` shows and `onWrong(answer)` is called. Answers
can be numbers or short words (up to about 6 characters read well). The answer islands are made from the piece
`island-round`, so this works in Sky Islands only: in every other world a game makes its own answer pads from that
world's pieces (the Builder's starter does: a solid with `onLand`, and the answer on a sprite above it).

### `g.sound(name)`

`g.sound(name)`

Plays a theme sound (Sky Islands: `jump`, `land`, `coin`, `fall`, `break`, `walk`) or one made in code: `cheer`,
`wrong`. Nothing plays until the player has pressed a key or tapped (browsers require it).

### `g.celebrate(hero, text)`

`g.celebrate(hero, text = 'You did it!')`

The hero cheers, the `cheer` sound plays, `text` shows big, and confetti bursts (not in low-power or reduced motion).

### `g.toast(text, ms)`

`g.toast(text, ms = 1400)`

Big outlined words in the middle of the screen for `ms` milliseconds.

### `g.score(add)`

`g.score(add)` → the score

Adds `add` (a number) and shows the score at the top; with no number, just returns it.

### `g.onUpdate(fn)`

`g.onUpdate(dt => { … })`

Runs `fn` every frame with the seconds since the last frame (at most 1/30), before the camera moves and the frame draws.

### `g.graphics(level)`

`g.graphics(level)` → the level now

Sets `'auto'`, `'low'`, `'medium'` or `'high'` (the table above) while the game runs; with no level, returns it (`'auto (high)'`
while on auto). The gear button calls this too.

### `g.sky(time)`

`g.sky(time = 'day')` → the time

Changes the sky, sun, light, fog and cloud colours to `'morning'`, `'day'`, `'sunset'` or `'night'` (stars come out at
night, a few at sunset), at once. Good for a level that ends at sunset, or a night level.

### `g.weather(kind)`

`g.weather(kind = 'clear')` → the kind

`'snow'`, `'rain'`, `'sparkles'` (gold, rising), `'leaves'` (green and orange), `'bubbles'` (rising, for under water) or `'clear'`. The particles travel with the
hero. None with reduced motion, or when a player turns weather effects off in the gear menu; fewer at lower levels.

### `g.physics(options)`

`g.physics({ gravity = -24 })` → `Promise<{ RAPIER, world, add }>`

Real physics with Rapier 0.21 (WebAssembly), loaded the first time a game asks (about 1.5 MB, so only games that need
it pay for it). `add(object, { type = 'dynamic', shape = 'box', bounce = 0.3, friction = 0.8 })` puts a body round an
object (a piece's `object`) from its size and keeps the object on it every frame; `type: 'fixed'` makes ground and walls,
`shape: 'ball'` rolls. `world` and `RAPIER` are Rapier's own, for joints, forces and anything else. Heroes moved by
`g.controls` are not in the physics world.

### `g.creature(id, options)`

`g.creature(id, { x = 0, y = 0, z = 0, face = 0, scale = 1 })` → `Promise<creature>`

Adds one of the theme's animals (`g.theme.creatures`: each has `id`, `name`, `kind`, `size` as width, height and
length, `moves` and `playable`). A world with no creatures throws an error that says so. **Animals are kind by
construction:** they are never solid (the hero walks straight through), they never push, chase, bite or hurt, nothing
an animal does can make the player lose, and the library never plays an attack, hit or death clip. Big animals (3 or
more tall, or 4.5 or more long: the horse, stag and cow) stroll slowly and never go faster than 2.5 a second on their
own (the hero runs at 7); no animal walks into the hero: when its next step would come nearer than its calm distance
(about 0.6 of its length, at least 3 for a big one) it waits. A creature has `id`, `name`, `kind`, `object`,
`position`, `moves`, `size`, `large`, `playable` and:

- `play(move, { once = false, fade = 0.2, speed = 1 })`: one of its `moves` (`idle`, `eat`, `walk`, `run`, `jump`). A
  move it does not have plays the nearest it has (`run` ↔ `walk`, `cheer` → `jump`, `graze` ↔ `eat`), else `idle`, and
  then returns `null`.
- `walkTo(x, z, { speed })` or `walkTo({ x, z }, { speed })` → `Promise<boolean>`: turns, walks there, then idles.
  `true` when it arrived, `false` when another order replaced this one.
- `follow(path, { speed, loop = false })` → `Promise<boolean>`: walks through `[[x, z], …]` in turn; `loop: true` keeps
  going round (a patrol).
- `wander({ x, z, radius = 6, speed })`: strolls to spots near that place (its own, by default), stopping to eat or
  look around. With reduced motion it stays where it is.
- `followHero(hero, { distance })`: a companion that trails the hero (the one under `g.controls` by default) and stops
  a little behind; it keeps up by running, and joins the hero again after a long jump or a respawn.
- `onMeet((hero, creature) => {}, { distance })`: called once each time the hero comes close (then again after the
  hero has walked away and come back). The place for a spoken line, a question or a count.
- `stop()` (stand still), `remove()` (take it out of the world).

An animal with no `walk` (the pig and the sheep: `idle` and `jump` only) **hops**: it travels while it is in the air
and stands between hops, so its feet never slide; with reduced motion it glides in its idle pose. Speeds are clamped
(`speed` up to 5, big animals 2.5). Only animals on screen animate, the nearest first, up to the level's limit (the
table above); past the drawing limit the farthest are hidden. Geometry, materials and clips are shared by every copy.

### `g.school(id, count, options)`

`g.school(id, count = 8, { around = { x: 0, y: 0, z: 0 }, radius = 5, speed, scale = 1 })` → `Promise<school>`

Many of one animal moving together (a shoal of fish, a flock) for the price of one: they share one skeleton and one
animation. Water animals (`kind` other than `land`) circle `around` at different depths; land animals that can walk
circle on the ground; ones that cannot walk, and everyone with reduced motion, stand together. `count` is at most 40,
and each graphics level shows only so many (the table above). A school has `id`, `name`, `kind`, `count`, `objects`,
`position` (move it to move the school), `onMeet(fn, { distance })` and `remove()`. Never solid, like every animal.
