# Medieval Village 1.1.0: where every file came from

Downloaded 2026-11-12 with `git clone` from GitHub (the makers' own sites were not reachable from the build machine).

| Pack | Source | Commit | Licence |
|---|---|---|---|
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Skeletons Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | 15b62b9bad122f72926c10fb14d622c73819fa54 | CC0 1.0 (`LICENSES/kaykit-skeletons.txt`) |
| KayKit Medieval Hexagon Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | 84fa4e91af6a88989be7c99e0891cede11f2ca38 | CC0 1.0 (`LICENSES/kaykit-medieval.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |
| Quaternius Ultimate Animated Animals, Quaternius | https://quaternius.com (FBX uploaded by the owner to branch `asset-packs`, folder `ultimate-animated-animals/`) | 1d1dbb18a46bc9e8cdfc181ed83b88b095cdd173 (the branch) | CC0 1.0 (`LICENSES/quaternius-animals.txt`) |
| Quaternius Farm Animals, Quaternius | https://quaternius.com (FBX uploaded by the owner to branch `asset-packs`, folder `farm-animals/`) | 1d1dbb18a46bc9e8cdfc181ed83b88b095cdd173 (the branch) | CC0 1.0 (`LICENSES/quaternius-farm.txt`) |

## What 1.1.0 adds

Everything in 1.0.0 is here byte for byte (heroes, moves, pieces, sounds: copied from the built 1.0.0, not rebuilt), so a game moves up without any change in how it looks.

- **Creatures** (`creatures/`, for Oomba3D 1.2.0 `g.creature()`): a donkey, a cow and a husky (Ultimate Animated Animals) and a pig and a sheep (Farm Animals). Converted from the pack's FBX with FBX2glTF 0.9.7 (`kit2/pipeline/fbx-to-glb.mjs`), then `build-theme.mjs` with the pack steps in `kit2/themes/medieval-village/recipe.json`: scaled against the 2.4-unit heroes, only the calm clips kept under plain names (idle, eat, walk, run, jump; the pig and sheep have only idle and jump in the pack), one averaged normal per corner so the ink outline stays whole (`inkNormals`), flat colours lifted a little because the FBX colours draw darker than the store pictures (`brighten`: gamma 0.8, gain 1.12, saturation 1.15), every colour put into one tiny palette picture so an animal is one draw call instead of one per colour (`oneDraw`), and meshopt compression (decoded with WebAssembly by Oomba3D).
- **Left out of every animal on purpose**: the pack's attack, headbutt, kick, hit-reaction and death clips. No file here has one (`tests/unit/kit2-creatures.test.js`).

## What was changed

Built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/medieval-village/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Heroes**: the five adventurers and the four skeleton pals, with their shared moves, copied from an earlier built theme (Sky Islands 1.0.1 and Castle Quest 1.0.0: held items removed, kid-friendly names).
- **Pieces**: from the packs' `Assets/gltf` models with their colour texture embedded, renamed to short ids (the recipe maps each one); pieces named `theme:…` in the recipe come from an earlier built theme. Left out on purpose: the archery range, barracks, catapult towers, weapon rack, arrows, target, the wrecked building and the tavern.
- **Sounds**: Kenney platformer kit sounds, copied unchanged.
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.1.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme (kid-safe check).
