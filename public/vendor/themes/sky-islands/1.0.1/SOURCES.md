# Sky Islands 1.0.1: where every file came from

Downloaded 2026-11-12 with `git clone --depth 1` (GitHub copies; kenney.nl and kaylousberg.com were not reachable from the build machine).

| Pack | Source | Commit | Licence |
|---|---|---|---|
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| Kenney Starter Kit 3D Platformer, Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | Models and sounds CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## What was changed

Built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/sky-islands/recipe.json` (glTF Transform 4.2.1, meshoptimizer 0.22.0): dedup, weld, resample, prune, reorder, quantize. No meshopt compression: its decoder needs WebAssembly, which the game frame does not allow, so the models are quantized only (Three.js reads them as they are) and the server sends them brotli-compressed.

- **Heroes** (`heroes/*.glb`): from `Characters/gltf/{Knight,Barbarian,Mage,Rogue,Rogue_Hooded}.glb`. Every held item is removed (swords, axes, knives, crossbows, shields, wand, staff, spellbooks, the throwable and the mug). All animations are removed from the hero files.
- **Moves** (`heroes/moves.glb`): the shared skeleton from `Knight.glb` with 15 of its 76 animations (listed in `theme.json` under `moves`). The fighting, falling-down and dying animations are left out.
- **World, props** (`world/*.glb`, `props/*.glb`): from `models/*.glb` with `models/Textures/colormap.png` embedded. Some renamed: `platform-grass-large-round` is `island-round`, `block-coin` is `coin-block`, `brick-particle` is `brick-bit`.
- **Sounds** (`sounds/*.ogg`): copied unchanged from `sounds/`; `walking.ogg` is `walk.ogg`.
- **Cover** (`cover.webp`): a screenshot of the Kit 2 prototype built with these packs.

Every model was looked at on a contact sheet before it joined the theme (kid-safe check): no weapons, nothing scary.

## Versions

- **1.0.1** (12 Nov 2026): the same pieces as 1.0.0, without meshopt compression, so games can load them in the game frame. Use this one.
- **1.0.0** (12 Nov 2026): meshopt-compressed; never loaded by a game. Kept unchanged because shipped versions never change.
