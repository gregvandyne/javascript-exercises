# Kit 2 asset packs: inventory, staging and build plan

Phase 1, 14 Nov 2026. Nothing here has shipped: no theme, engine or `kit2/SHIPPED.json` entry changed, and no pack file
is in `main`. Branch `kit2-packs-stage` holds only pipeline scripts, the per-pack configs and this plan.

- **Source:** 14 packs on branch `asset-packs` (719 FBX; a 15th folder, `animals`, is byte-for-byte the same seven
  files as `farm-animals`, checked by SHA-256, and is ignored).
- **Result:** 673 models staged as optimised GLB (34.5 MB raw, 16.9 MB brotli), 46 left out, every model looked at on a
  contact sheet. 69 animated creatures and characters, with only kid-friendly clips kept.
- **Biggest findings:** (1) creatures and several packs need a new Oomba3D (1.2.0); (2) only Pirate Cove is a complete
  world from the packs alone; (3) no pack has ground, so new worlds need a ground the engine makes; (4) the T-Rex cannot
  be given a closed mouth; (5) every existing theme spends 2.26 MB of its 5 MB on the nine heroes.

## 1. Licences

| Packs | Licence | What that means here |
|---|---|---|
| dinosaurs, farm-animals, ultimate-animated-animals, cute-fish, nature-megakit, medieval-village-megakit, ultimate-space-kit (Quaternius); city-kit-suburban, pirate-kit (Kenney); forest-nature-pack (KayKit) | CC0, licence file in each folder | Free to ship, as today's themes. |
| fish (Quaternius, by its style and clip names) | **No licence file was uploaded** | Almost certainly Quaternius's CC0 "Animated Fish" pack, but the file is missing. Add the pack's `License.txt` to the branch before it ships (the theme test needs a licence file per pack). |
| desert-oasis-pack, sky-islands-pack, underwater-pack (reodesuxz) | **Custom, not CC0** | See below. |

**The three reodesuxz packs** (owner's decision, 14 Nov 2026: the repository is private and the packs were downloaded by
the owner's side, so "use in games" and "modify" apply; they are planned and built like the others). Rules that stay:

- They are under the custom reodesuxz licence, **not CC0**. Every theme that uses them records that in `theme.json`,
  `SOURCES.md` and `LICENSES/`.
- Their files (raw or converted) must **never be offered as downloadable asset files**, or bundled into anything that is
  redistributed as an asset pack or library. Serving the optimised GLBs to a running game from `/vendor/themes/` is use
  in a game; a "download this model" link, a public art repository or an export feature would not be.
- They must **not be used to train or fine-tune AI models**.
- **If the repository ever becomes public, their raw FBX must be removed first** (they are on branch `asset-packs`), and
  the committed converted GLBs should be reviewed at the same time.
- **Credits line (recommended, appreciated though not required):** "Low Poly Desert Oasis Pack by reodesuxz", "Low Poly
  Sky Islands Pack by reodesuxz", "Low Poly Underwater Pack by reodesuxz", on the site's credits page and in each
  theme's `SOURCES.md`.
- `tests/unit/kit2-themes.test.js` today accepts only `CC0-1.0`. A theme with these packs needs that test extended (a
  second allowed licence that must come with its licence file, credit and a `redistribute: false` flag), not loosened.

## 2. Inventory and staging results

Up-axis: every pack converts to Y-up with its front along +Z; none needed turning. Units differ per pack, so each pack
(or creature) has a scale in its config. "Staged" sizes are quantized GLB; brotli is what a browser downloads. The
pipeline's budget is 5 MB per theme version (every file counted).

| Pack | Files | Triangles | Kept | Left out | Animated | Staged | Brotli | Already in a shipped theme |
|---|---|---|---|---|---|---|---|---|
| dinosaurs | 6 | 9,532 | 6 | 0 | 6 | 0.72 MB | 0.32 MB | none (new) |
| farm-animals | 7 | 5,317 | 7 | 0 | 7 | 0.59 MB | 0.26 MB | none |
| ultimate-animated-animals | 12 (76 MB of FBX) | 26,735 | 12 | 0 | 12 | 2.95 MB | 1.36 MB | none |
| fish | 7 | 3,959 | 7 | 0 | 7 | 0.17 MB | 0.08 MB | none |
| cute-fish | 52 | 67,866 | 36 | 16 | 31 | 1.68 MB | 0.75 MB | none |
| nature-megakit | 68 + 20 textures | 148,947 | 68 | 0 | 0 | 8.23 MB | 3.57 MB | none |
| medieval-village-megakit | 176 + 20 textures | 117,877 | 176 | 0 | 0 | 6.11 MB | 3.16 MB | none (see note) |
| ultimate-space-kit | 87 | 220,317 | 82 | 5 | 6 | 5.25 MB | 2.17 MB | none (see note) |
| forest-nature-pack | 105 | 34,598 | 93 | 12 | 0 | 5.25 MB | 3.59 MB | none (see note) |
| city-kit-suburban | 40 | 30,035 | 40 | 0 | 0 | 1.52 MB | 0.75 MB | none |
| pirate-kit | 72 | 31,228 | 62 | 10 | 1 (chest) | 1.49 MB | 0.73 MB | none |
| desert-oasis-pack | 27 | 2,828 | 24 | 3 | 0 | 0.11 MB | 0.04 MB | none |
| sky-islands-pack | 30 | 4,289 | 30 | 0 | 0 | 0.18 MB | 0.06 MB | none (see note) |
| underwater-pack | 30 | 8,881 | 30 | 0 | 0 | 0.26 MB | 0.10 MB | none |
| **Total** | **719** | | **673** | **46** | **70** | **34.5 MB** | **16.9 MB** | |

**Overlap with shipped themes: no file overlaps.** The shipped themes are built from other packs by other makers, so
every piece here is new; only the subjects overlap:

- *medieval-village-megakit* (Quaternius) vs the shipped Medieval Village (KayKit Medieval Hexagon): different art. The
  megakit is **building parts** (walls, roofs, doors, stairs at person scale, with brick and wood textures), not
  buildings; the shipped world is flat-coloured miniature buildings on hexagon tiles. They do not mix in one scene.
- *ultimate-space-kit* (Quaternius) vs Space Base (KayKit Space Base Bits): different art and scale. The kit adds what
  Space Base lacks: animal astronauts, aliens, alien plants, planets, spaceships.
- *forest-nature-pack* (KayKit) vs the forest pieces in Castle Quest 1.1.0 and Toy Town 1.1.0 (KayKit Medieval Hexagon
  miniatures, about 1.2 units tall): same maker and look, but these are hero-sized trees, bushes and rocks (3 to 11
  units tall). All 93 are new.
- *sky-islands-pack* (reodesuxz) vs Sky Islands (Kenney platformer kit, 14 pieces): all 30 are new, and it has what the
  theme is thin on: six islands, balloons, clouds, a bridge, a lighthouse, a windmill, an airship.

**What is in each pack, materials and anything broken**

- **Animals, dinosaurs, fish:** flat colours, no textures, one skinned mesh each (6 to 51 joints). 440 to 3,700
  triangles. Colours are darker than the store pictures (the FBX colours are used as they are).
- **Apatosaurus** carries a clip misnamed `Stegosaurus_Death` (a source mistake; the clip is dropped anyway).
- **farm-animals:** Llama, Pig, Pug and Sheep have **only Idle and Jump** (no walk), so they can stand and hop but not
  walk a path. Cow, Horse and Zebra have the full set.
- **ultimate-animated-animals:** every clip is stored twice (`Walk` and `AnimalArmature|Walk`); one copy is kept. This
  is why 76 MB of FBX becomes 2.95 MB.
- **cute-fish:** 35 fish (6 clips each) plus a boat, four docks, five fishing rods, six lures and a worm.
- **nature-megakit:** 2K textures and leaf cards with see-through edges. Textures are cut to 256 px and normal maps
  dropped. Trees are heavy (180 to 540 KB, up to 10,000 triangles each). The five dead trees have a near-black bark
  texture and read as black silhouettes.
- **medieval-village-megakit:** the FBX files name no texture files; the pipeline binds the nine colour textures by
  material name (256 px). Window glass has no texture. Many parts are open at the back by design.
- **ultimate-space-kit:** one small shared atlas, embedded. Three astronauts but four mechs and four spaceships (no red
  panda astronaut was uploaded).
- **Kenney and KayKit packs:** one shared colour map each, bound by material name. Clean.
- **reodesuxz packs:** flat colours, 20 to 700 triangles a piece, no animation (the camel, crab, turtle and fish are
  still models). Simpler in style than KayKit or Kenney.
- **Nothing failed to convert.** 719 of 719.

## 3. Creatures: what was kept

Sizes are measured in the idle pose at the staged scale (the hero is 2.4 units tall). Scales are a first proposal.

| Creature | Size (w × h × l) | Triangles | Staged | Clips kept | Clips dropped |
|---|---|---|---|---|---|
| `t-rex` | 2.3 × 4.4 × 8.9 | 1,820 | 125 KB | idle, walk, run, jump | Attack, Death |
| `velociraptor` | 0.7 × 1.4 × 3.6 | 1,248 | 102 KB | idle, walk, run, jump | Attack, Death |
| `triceratops` | 1.9 × 2.8 × 6.7 | 1,332 | 125 KB | idle, walk, run, jump | Attack, Death |
| `stegosaurus` | 1.6 × 3.2 × 7.0 | 2,282 | 141 KB | idle, walk, run, jump | Attack, Death |
| `parasaurolophus` | 1.1 × 3.2 × 7.1 | 1,412 | 108 KB | idle, walk, run, jump | Attack, Death |
| `apatosaurus` | 2.1 × 4.1 × 17.9 | 1,438 | 133 KB | idle, walk, run, jump | Attack, Death |
| `cow-spotted`, `pony`, `zebra` (farm) | about 1.1 × 2.6-3.0 × 4-4.6 | 690-1,354 | 122-147 KB | idle, walk, stroll, run, jump | Death |
| `llama`, `pig`, `pug`, `sheep` (farm) | 1.0-3.0 tall | 562-661 | 48-51 KB | idle, jump (**no walk exists**) | none |
| `horse`, `horse-white`, `donkey`, `cow`, `bull`, `alpaca`, `deer`, `stag` | 2.6-3.3 tall | 2,000-3,667 | 235-288 KB | idle, look, graze, eat, walk, run, jump, land | Attack_Headbutt, Attack_Kick, Death, Idle_HitReact_Left/Right |
| `fox`, `wolf`, `husky`, `shiba` | 1.3-1.7 tall | 1,848-1,962 | 207-242 KB | idle, look, graze, eat, walk, run, jump, land | Attack, Death, Idle_HitReact_Left/Right |
| `dolphin`, `whale`, `shark`, `manta-ray`, `clownfish`, `fish-blue`, `fish-pink` | 0.9 to 11.8 long | 440-696 | 20-34 KB | swim (the only clip) | none |
| 31 cute fish (list in `stage/cute-fish/stage.json`) | 1.3 long | 1,270-2,142 | 47-68 KB | swim, swimFast, dart | Attack, Death, Out_Of_Water |
| `astronaut-bee`, `astronaut-flamingo`, `astronaut-frog` | 2.0 tall | 5,590-6,258 | 266-283 KB | idle, walk, run, jump, jumpAir, jumpLand, wave, yes, no, duck | Death, HitReact, Punch, Idle_Gun, Run_Gun, Run_Gun_Shoot, Walk_Gun, Weapon; **the pistol mesh is removed** |
| `alien-big` | 2.8 tall | 4,724 | 224 KB | idle, walk, run, jump, jumpAir, jumpLand, wave, yes, no, duck | Death, HitReact, Punch, Weapon |
| `alien-flying`, `alien-tiny` | 2.9 and 1.3 tall | 3,820 / 1,572 | 109 / 51 KB | fly, flyFast, yes, no | Death, Headbutt, HitReact, Punch |

**Do the four named animals read as friendly?** (sheet `faces-trex-raptor-sharks-wolf.png`)

- **T-Rex: no, not fully, and it cannot be fixed in the pipeline.** Its mouth is modelled part open with a row of
  teeth, and the skeleton has no jaw bone, so no pose closes it. Its idle is calm (it stands and sways), and no attack
  clip is kept. Closing the mouth means re-modelling the head (a Blender job of about an hour). Recommendation: ship it
  as a calm animal that never chases, or leave it out of the first Dino Valley and have the head re-modelled.
- **Velociraptor: yes.** Closed mouth, no teeth showing, neutral face.
- **Shark (fish pack): yes.** Closed mouth, no teeth; a plain grey-blue shark shape. The cute-fish `shark` and
  `goblin-shark` are round with big eyes and no teeth, and the underwater-pack shark is a still toy-like model.
- **Wolf: yes.** Closed mouth, neutral; it looks like the husky's grey cousin.

## 4. Everything left out, and why

| Pack | Left out | Reason |
|---|---|---|
| cute-fish | `Anglerfish`, `Piranha`, `Flatfish`, `Turbot` | Drawn with a mouth full of pointed teeth (the last two were found on the sheet, not by name). |
| cute-fish | `FishingRod_Lvl1` to `Lvl5`, `Lure_1` to `Lure_6` | Fishing rods and hooked lures. |
| cute-fish | `Worm` | Bait for the rods; no use without them. |
| pirate-kit | `cannon`, `cannon-mobile`, `cannon-ball` | Weapons. **Judgement call:** as harbour scenery that never fires they are mild; recommendation is to keep them out. |
| pirate-kit | `bottle`, `bottle-large`, `crate-bottles` | Read as rum in a pirate kit (alcohol). A "message in a bottle" would be the reason to bring one back. |
| pirate-kit | `ship-pirate-small`, `-medium`, `-large` | Skull on the sails. The three plain ships are kept. |
| pirate-kit | `ship-ghost` | A glowing green ghost ship: spooky rather than scary. Owner to decide; fits Spooky Hollow better than a kids' cove. |
| ultimate-space-kit | `Pickup_Bullets` | Ammunition. |
| ultimate-space-kit | `Mech_BarbaraTheBee`, `Mech_FernandoTheFlamingo`, `Mech_FinnTheFrog`, `Mech_RaeTheRedPanda` | Walking machines with gun barrels modelled into arms or shoulders (one mesh, they cannot be taken off). The red panda and flamingo ones are the mildest. Owner to decide. |
| ultimate-space-kit | the astronauts' `Pistol` (not a file: a mesh inside each astronaut) | Removed; the astronauts are kept. |
| desert-oasis-pack | `animal_skull` | A skull. |
| desert-oasis-pack | `hookah` | A water pipe (smoking). Found on the list, not in the brief. |
| desert-oasis-pack | `domed_mosque` | A religious building. Recommendation: leave it out, so a faith is never game scenery by accident. If the owner wants places of worship in worlds, do it deliberately and for several faiths at once. |
| forest-nature-pack | 8 `…_Singlesided_…` grasses, `Grass_1_Mesh`, `Grass_2_Mesh`, `Grass_1_SingleSided_Mesh`, `Grass_2_SingleSided_Mesh` | Not a safety matter: duplicates of the grass beside them. |

Kept on purpose, in case anyone asks: the four `flag-pirate` pieces (plain black flags, no skull), `ship-wreck`, the
pirate `hole` and `tool-shovel` (treasure digging), `Pickup_Health` (a green first-aid case), the `floating_temple` in
the sky pack (a plain pillared pavilion, nothing that marks a faith), the aliens the pack calls `Enemy_*` (staged as
friendly `alien-*`, no hitting clips), and the bull. No gravestones, alcohol or weapons are in what is kept.

## 5. Pipeline changes (branch `kit2-packs-stage`)

- `kit2/pipeline/fbx-to-glb.mjs` (new): FBX to raw GLB with FBX2glTF 0.9.7, working in a scratch folder of links.
- `kit2/pipeline/pack-steps.mjs` (new) and three lines in `build-theme.mjs`: opt-in recipe fields, so a recipe that
  names none builds as before. `scale` (baked into positions, skeletons and clips), `anims` (keep and rename clips),
  `textures` (bind a colour picture by material name), `textureSize`, `colourOnly`, `matte`, `cutout`, `keepColour`,
  `dropMeshes` (the pistols), `dropVertexColours`, and `inkNormals`.
- **`inkNormals` matters for the Oomba look.** These packs are flat-shaded, so every hard edge has split normals, and
  the engine's ink outline (a copy pushed out along the normals) cracks into loose black strips. The step gives each
  corner one averaged normal and marks the material `flat`; whoever draws it turns on flat shading, so faces stay flat
  and the outline is one clean line. It also made the creature files about 30% smaller.
- `kit2/pipeline/stage-pack.mjs` (new) with one config per pack in `kit2/packs/`: licence, scale, textures, creatures
  and clip names, and every model left out with its reason. Writes `stage.json` per pack.
- `kit2/pipeline/contact-sheet.mjs` (new): the sheets. The earlier sheets were made by scratch scripts; this one is in
  the repository.
- **Raw sources are not in the branch.** The repository's convention is that source packs stay outside and only built
  themes with their licences come in (`kit2/README.md`: "git clone each pack into a scratch folder"). Converted GLBs are
  not committed either: staging is reproducible from `asset-packs` in under two minutes, and a theme build is what
  brings chosen files in.

## 6. How creatures should enter Kit 2

**Recommendation: Oomba3D 1.2.0, with creatures listed per theme in `theme.json` (`creatures`), not a separate shared
pack.** Shipped engines and themes are frozen, so everything below is a new engine version and new theme versions.

Why per theme: the catalogue, the lint, the scanner, the 5 MB test and the picker already work theme by theme, and
`creatures` is already read. Heroes are shared the same way today (each theme carries its own copy, copied byte for
byte with the recipe's `theme:` source). A shared `/vendor/themes/creatures/` pack would save repository space (a
farm set is 0.6 MB) but needs new frame, scanner and catalogue rules. Revisit when more than three worlds carry the
same animals.

### Proposed API (Oomba3D 1.2.0, everything in 1.1.0 unchanged)

```js
const rex = await g.creature('t-rex', { x: 0, y: 0, z: -12, face: 0, scale: 1 });
rex.play('walk');                                   // any of rex.moves: idle, walk, run, jump, eat, graze, swim…
rex.walkTo({ x: 8, z: -12 }, { speed: 2 });         // Promise: turns, walks, then idles
rex.follow([[8, -12], [8, -20], [0, -20]], { speed: 2, loop: true });   // patrol a path
rex.wander({ radius: 6 });                          // strolls and stops to graze or look around
rex.followHero(me, { distance: 3 });                // a companion that trots behind the player
rex.onMeet(hero => g.toast('Hello, T-Rex!'));       // the hero came close: quests, counting, feeding
const school = await g.school('clownfish', 12, { around: { x: 0, y: 3, z: -10 }, radius: 5 });
const me = await g.hero('pony');                    // a creature as the player, when it is marked playable
```

- **Never an obstacle, never harmful.** Creatures do not block, push or hurt the hero, and the library has no chase or
  attack. `onMeet` is the only interaction.
- **A creature has its own clips** inside its file (skeletons differ, unlike the heroes' shared `moves.glb`).
  `creature.moves` lists them; `play` of a missing move falls back to `idle` and returns `null`.
- **Playable** needs idle, walk or run, and jump: 6 dinosaurs, cow, pony, zebra, the 12 "ultimate" animals, the three
  astronauts and `alien-big`. Missing `cheer` and `wave` fall back to `jump` and `idle`. Llama, pig, pug and sheep
  (idle and jump only) are scenery animals that stand and hop. Fish are playable only in a swimming world.
- **Also needed in 1.2.0 for these packs:** draw `flat` materials flat-shaded; no ink copy on cut-out materials (leaf
  cards would turn into black rectangles in 1.1.0); `g.world.ground({ size, color, hills })` because no pack has
  ground; a piece's own clips (`chest.play('open')`); `'bubbles'` weather and swim controls (up and down) for Under the
  Sea.

### `theme.json`

```json
"creatures": [{ "id": "t-rex", "name": "T-Rex", "file": "creatures/t-rex.glb", "pack": "quaternius-dinosaurs",
  "kind": "land", "size": [2.3, 4.4, 8.9], "moves": ["idle", "walk", "run", "jump"], "playable": true }]
```

### Builder: catalogue and picker

- `scripts/build-kit2-rules.js` already copies `creatures` (id and name) into `server/builder/kit2-catalog.js`; add
  `moves`, `size`, `kind` and `playable` so the Builder never asks a pig to walk.
- `KIT2_CHARACTERS` already returns creatures with `kind: 'creature'`, so the Studio's "3D heroes" tab shows them the
  day a theme has them, and the "no animals yet" sentences switch themselves off. Recommended: a fourth tab, "3D
  animals", once there are more than about ten.
- `scripts/kit2-thumbs.js` draws each character with `g.hero()`: it must use `g.creature()` for creatures (the test
  fails when a picture is missing).
- `wantsKit2`'s creature words need a table from word to world ("dinosaur", "t-rex" to Dino Valley; "cow", "farm" to
  the farm world; "fish", "shark" to Under the Sea).
- The starter (`server/builder/templates/oomba3d.html`) gets one friendly creature per world that has any.
- `kit2-lint.js` already accepts creature ids where hero ids go.

### Size and loading cost on a Chromebook

- A game loads only what it names. One creature is 20 to 290 KB raw (roughly 10 to 130 KB on the wire): six dinosaurs
  are 0.32 MB brotli, seven big fish 0.08 MB.
- Each is one skinned mesh of 440 to 3,700 triangles with 6 to 51 bones; the astronauts are heaviest (about 6,000).
  With outlines on, each skinned mesh is drawn twice.
- Proposed guard rails in 1.2.0: animation paused for creatures off screen or far away; a documented limit of about 8
  walking creatures and one school of 20 fish at the Fast level; a school shares one animation.
- **Not measured on a real Chromebook.** Everything here ran in software WebGL on the build machine.

### Tests

- `kit2-themes.test.js`: every creature is one of the theme's files, from a listed pack, has `moves` that exist as
  clips in the file, and **no clip name matching attack, bite, death, hit, punch, kick, shoot or gun**.
- `kit2-oomba3d.test.js`: docs and library list the same new names; a demo spawns a creature, walks it along a path,
  makes it a companion, plays as one, and the hero walks through it unharmed.
- `kit2-worlds.test.js`: the theme tour places every creature and plays every move in the real game frame.
- `builder-kit2.test.js`: catalogue in step, a picture for every creature, the mock builder answers "a dinosaur game"
  with a dinosaur.
- A frozen-version check that Oomba3D 1.0.0 and 1.1.0 and every shipped `theme.json` keep their hashes (exists today).

## 7. Worlds

The 5 MB budget counts every file of a theme version. **The nine heroes and their moves are 2.26 MB of it** in every
world today, which leaves about 2.7 MB for creatures and pieces. For comparison: Toy Town 1.1.0 is 3.80 MB, Castle
Quest 1.1.0 4.23 MB, Medieval Village 1.0.0 4.72 MB, Sky Islands 1.0.1 1.68 MB.

### New worlds

| World | From | Pieces chosen | Missing for a playable world | Estimated size |
|---|---|---|---|---|
| **Pirate Cove** | pirate-kit, plus cute-fish boat and docks | All 62: three ships and a wreck, rowing boats, docks and platforms, palms, sand and grass patches, rocks, towers and castle walls, flags, barrel, crate, chest that opens | **Nothing essential.** Ground (sand and grass patches), platforms, water (`g.world.water` exists), goal (chest). Works on Oomba3D 1.1.0; only the chest's opening needs 1.2.0. Optional: dolphin and fish in the bay. | 3.8 MB (about Toy Town) |
| **Dino Valley** | dinosaurs, nature-megakit, a few forest-nature rocks | 6 dinosaurs (0.72 MB); 3 pines, 2 leafy trees, fern, plants, flowers, mushrooms, 3 rocks, 4 stone paths (about 1.6 MB) | Ground (engine-made), a goal (no egg or nest in any pack: use the chest and coin every theme reuses), platforms (the big rocks and stone paths). Needs 1.2.0. T-Rex decision. | 4.6 MB (about Medieval Village). Tight: see open question on heroes. |
| **Under the Sea** | fish, cute-fish, underwater-pack | 7 big sea animals (0.17 MB), 12 of the 31 cute fish (0.65 MB), all 30 underwater pieces (0.26 MB): corals, kelp, rocks, arch, shipwreck, shells, anchor, chest | Sea floor (engine-made sand), the underwater look (blue fog, bubbles), a way to move: heroes can only walk, so either a slow-gravity sea-floor walk or a dolphin as the player with swim controls. Needs 1.2.0 and the fish pack's licence file. | 3.4 MB (smaller than Toy Town) |
| **Farm & Friends** | ultimate-animated-animals, farm-animals, forest-nature-pack, medieval megakit | cow, horse, donkey, alpaca, shiba (1.3 MB); pig, sheep, pug, llama (0.2 MB); 8 trees and bushes (0.45 MB); wooden fences, wagon, crate | **A barn, crops, hay and a tractor: none of the packs has them.** A barn and farmhouse can be assembled from the megakit's parts (see below). Ground engine-made. Needs 1.2.0. | 4.7 MB with two assembled buildings: at the limit. |
| **Planet Explorers** | ultimate-space-kit | 3 animal astronauts as heroes (0.83 MB), 3 aliens (0.38 MB), about 35 of the 76 pieces: alien trees and plants, rocks, houses and domes, 2 rovers, 4 spaceships, planets for the sky, pickups (about 1.9 MB) | Ground (engine-made). The astronauts have their own skeleton and clips, so they need 1.2.0's own-clip heroes. To fit, this world ships its own heroes instead of the nine. | 3.1 MB without the nine heroes; 5.4 MB with them (over) |
| **Desert Oasis** | desert-oasis-pack, pirate-kit sand, animals | 24 pieces (0.11 MB): house, tents, market stall and tower, well, arches, palms, cacti, pond, jars, rug, chest; alpaca, donkey, horse (0.8 MB) | Ground (pirate sand patches or engine-made). The camel is a still model. The pack is plainer than the heroes. Needs 1.2.0 for the animals only. | 3.2 MB |

### Packs that enrich existing worlds (as new theme versions)

| Pack | Goes into | What is added | Size |
|---|---|---|---|
| sky-islands-pack | **Sky Islands 1.1.0** | All 30: six islands, five balloons, clouds and a cloud stepping pad, rope bridge, lighthouse, windmill, airship, sky tree, chest | 1.68 to 1.86 MB. The best value in the set. Needs the licence test change. |
| city-kit-suburban | **Toy Town 1.2.0** (not a separate Suburb world: the kit has no roads, ground, cars or people, and Toy Town has all four) | 8 of the 21 houses, fences, planter, paths, 2 trees, scaled to Toy Town's 2-unit tiles | 3.80 to about 4.4 MB. All 21 houses would pass 5 MB. |
| forest-nature-pack | **Castle Quest 1.2.0, Medieval Village 1.1.0, Spooky Hollow 1.1.0** (bare trees), and every new world | Hero-sized trees, bushes and rocks, the same maker and look as those worlds | About 55 KB a piece (each carries the shared 48 KB colour map). Castle Quest has room for about 12, Medieval Village for 4. Shrinking the colour map to 256 px should cut each to about 10 KB: worth testing. |
| nature-megakit | Dino Valley and Farm only | Textured trees, flowers, ferns, stone paths | Does not match the flat KayKit worlds, and its leaf cards need 1.2.0. Use trees sparingly (180 to 540 KB each). |
| medieval-village-megakit | Not into Medieval Village (different look and scale). Source of **assembled buildings** for Farm & Friends, and later a hero-sized "Village Square" | A small "prefab" step: a JSON list of parts and positions merged into one GLB (cottage, two-storey house, barn, tower, shop, gate) | About 100 to 250 KB a building with its textures at 256 px. Assembly is hand work: about half a day for six buildings, checked on sheets. |
| ultimate-space-kit | Its own world (above); a few planets and plants could join **Space Base 1.1.0** as sky decoration | | Space Base has 1.4 MB free. |

## 8. Build order

**Round A (four pieces, all can run in parallel; none depends on another):**

1. **Oomba3D 1.2.0**: `g.creature`, paths, companion, playable creatures, own-clip heroes, flat materials and cut-outs
   in the outline, `g.world.ground`, piece clips, bubbles and swim controls, docs and tests. The long pole.
2. **Pirate Cove 1.0.0** on Oomba3D 1.1.0: theme, cover, sounds, tour test. The first new world a child can play.
3. **Sky Islands 1.1.0** and the licence test change for the reodesuxz packs.
4. **Toy Town 1.2.0** with the suburban houses.

**Round B (after 1; the three worlds in parallel):** Dino Valley 1.0.0, Under the Sea 1.0.0, Planet Explorers 1.0.0.

**Round C (parallel):** the megakit prefab step then Farm & Friends 1.0.0; Desert Oasis 1.0.0; forest pieces into
Castle Quest 1.2.0, Medieval Village 1.1.0 and Spooky Hollow 1.1.0.

**Round D (after B):** Builder work: catalogue fields, pictures, the animals tab, creature words, a starter per new
world, and the real-model one-line-request check that is still open from stage 5.

Each theme is its own pull request, as before, with its contact sheet in the description.

## 9. Open questions for the owner, with a recommendation

1. **T-Rex with teeth showing.** Recommend: ship Dino Valley with five dinosaurs plus the T-Rex as a calm, slow animal,
   and commission a closed-mouth head later; or hold it back if you would rather not have teeth at all.
2. **The nine heroes in every world (2.26 MB of 5 MB).** Recommend: new worlds carry five heroes (the adventurers),
   and Planet Explorers carries only its astronauts. Otherwise Dino Valley and Farm are at the limit.
3. **Creatures per theme or one shared pack?** Recommend per theme now (section 6).
4. **Cannons, the ghost ship and the mechs.** Recommend: all stay out. Say if harbour cannons as scenery are fine.
5. **The mosque.** Recommend: leave it out.
6. **Farm needs a barn, crops and hay.** Recommend: assemble a barn from the megakit now, and upload a CC0 farm kit
   (Kenney or Quaternius both have one) when convenient.
7. **Under the Sea: walk on the sea floor, or play as a dolphin?** Recommend: the dolphin, with the nine heroes left
   out of that world; it is the more magical game and saves 2.26 MB.
8. **The fish pack's licence file.** Please upload the `License.txt` that came with it.
9. **Suburb as part of Toy Town, not its own world.** Recommend yes.
10. **Colours.** The animals are darker than their store pictures. Recommend a small brightness lift in the pipeline
    (a recipe option), judged on a sheet before Dino Valley ships.
11. **Scales.** All creature and pack scales are first guesses against the 2.4-unit hero; say if the dinosaurs should
    be bigger.

## 10. Not verified

- Everything was drawn with software WebGL (SwiftShader) in headless Chromium: no real GPU, no Chromebook, no frame
  rates.
- Walk and swim were checked as one still frame each (mid-clip), not watched as motion: a clip that slides or pops
  would not show.
- Only idle, walk and swim were drawn; run, jump, eat, graze, look and the astronauts' other clips were converted and
  named but not looked at.
- The models were not loaded by Oomba3D itself (1.1.0 has no creature call); the sheets use the same outline method
  and a theme's light, with flat shading where the pipeline marked it.
- That a shipped theme still rebuilds to the same bytes with the changed `build-theme.mjs` was reasoned from the code
  (the new steps do nothing unless a recipe names them), not rebuilt: the source packs for the shipped themes were not
  cloned in this session. The theme and hosting tests pass.
- The `fish` pack's licence, and whether the "free version" megakits are complete (their licence files say they hold
  only part of the full packs).
- The reodesuxz licence reading is the owner's decision as relayed; no lawyer has looked at it.

## 11. Where things are

- Scripts and configs: `kit2/pipeline/` and `kit2/packs/` on branch `kit2-packs-stage` (how to run them: `kit2/README.md`).
- The contact sheets, staged models and the per-file inventory were made in the build session's scratch folder and are
  not in the repository; they are rebuilt from branch `asset-packs` with the steps in `kit2/README.md`.
