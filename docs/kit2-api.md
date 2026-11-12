# Oomba3D API reference (Oomba3D 1.0.0)

Oomba3D is the small 3D game library for Kit 2 themes (plan: [kit2-themes-plan.md](kit2-themes-plan.md)). This page
lists only what it does today, with exact signatures: it is the page a model reads before writing a Kit 2 game.
`tests/unit/kit2-oomba3d.test.js` checks that every name on this page exists in the library and that every name the
library offers is on this page, and it plays the Sky Islands demo (`kit2/demo/sky-islands.html`) in the real game frame.

A Kit 2 game carries exactly the Kit 2 import map (`kit2ImportMap()` in `server/services/vendor.js`: Three.js, its
add-ons and Oomba3D, each pinned with its integrity) and imports from `'oomba3d'`:

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
- Name a shipped theme version: `sky-islands` `1.0.1` today. (1.0.0 exists but its models cannot load in a game.)
- There is no WebAssembly, so no Rapier physics. Oomba3D's own platform physics is used instead.
- Words a player sees (questions, toasts) come from the game; keep them kind and short, as on the rest of the site.

## `start(options)`

`start({ theme, version, lowPower = 'auto', reducedMotion, parent = document.body })` → `Promise<g>`

Loads the theme's `theme.json`, makes the renderer, the sky (the theme's colours), fog, light, glow and soft clouds,
and starts the game loop. Also exported: `VERSION` (`'1.0.0'`), `API` (the names below) and `THREE` (the same Three.js).

- `lowPower`: `true`, `false` or `'auto'`. `'auto'` turns it on for devices with 4 or fewer CPU cores or 4 GB or less
  of memory, and the loop turns it on for good after two 3-second spells under 30 frames a second. Low power: no glow,
  no shadows, a third of the clouds, pixel ratio 1, no confetti. Otherwise the pixel ratio is capped at 2.
- `reducedMotion`: defaults to the player's `prefers-reduced-motion`. When on: clouds do not drift, coins do not spin,
  answer tokens do not bob, a wrong island disappears instead of sinking, and there is no confetti.

`g` also has `THREE`, `scene`, `camera`, `renderer`, `theme` (the theme's `theme.json`: `heroes`, `pieces`, `sounds`,
`moves`, `look`), `lowPower` (read-only, may turn on during play) and `reducedMotion`.

### `g.hero(id, options)`

`g.hero(id, { x = 0, y = 0, z = 0, face = 0 })` → `Promise<hero>`

Adds one of the theme's heroes (`g.theme.heroes`; Sky Islands: `knight`, `barbarian` "Explorer", `mage` "Wizard",
`rogue` "Ranger", `rogue-hooded` "Hooded Ranger"). `face` turns it (radians). A hero has `id`, `name`, `object`,
`position` and `play(move, { once = false, fade = 0.2 })`. Moves: `idle`, `ready`, `walk`, `run`, `jumpStart`,
`jumpAir`, `jumpLand`, `jump`, `cheer`, `wave`, `pickUp`, `use`, `bump`, `sit`, `cast` (`g.theme.moves.clips`). Heroes
carry no weapons.

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

### `g.followCamera(target, options)`

`g.followCamera(target, { distance = 10, height = 5.5 })`

The camera glides behind and above the target (a hero) and the sun's shadows follow it. Tall phone screens get a wider
view automatically.

### `g.controls(hero, options)`

`g.controls(hero, { speed = 7, jump = 9.5, gravity = 24, fallY = -12, spawn, tryAgain = 'Try again!' })` → `{ keys }`

Arrows or WASD move, Space jumps; on touch screens an on-screen pad (four arrows and a big Jump button) appears.
Landings are wide and kind. Falling below `fallY` puts the hero back at `spawn` (default: where it stood) and shows
`tryAgain` (`''` for nothing). Plays `run`, `idle` and `jump`, and the `jump`, `land` and `fall` sounds.

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
can be numbers or short words (up to about 6 characters read well).

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
