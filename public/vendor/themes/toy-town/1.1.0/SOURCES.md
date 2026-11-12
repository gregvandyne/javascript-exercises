# Toy Town 1.1.0: where every file came from

Downloaded 2026-11-12 with `git clone` from GitHub (the makers' own sites were not reachable from the build machine).

| Pack | Source | Commit | Licence |
|---|---|---|---|
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Skeletons Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | 15b62b9bad122f72926c10fb14d622c73819fa54 | CC0 1.0 (`LICENSES/kaykit-skeletons.txt`) |
| KayKit City Builder Bits 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | 63976910ca04d16f0fc531b9c614244be8128713 | CC0 1.0 (`LICENSES/kaykit-city-builder.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |
| KayKit Medieval Hexagon Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | 84fa4e91af6a88989be7c99e0891cede11f2ca38 | CC0 1.0 (`LICENSES/kaykit-medieval.txt`) |

## What was changed

Built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/toy-town/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Heroes**: the five adventurers and the four skeleton pals, with their shared moves, copied from an earlier built theme (Sky Islands 1.0.1 and Castle Quest 1.0.0: held items removed, kid-friendly names).
- **Pieces**: from the packs' `Assets/gltf` models with their colour texture embedded, renamed to short ids (the recipe maps each one); pieces named `theme:…` in the recipe come from an earlier built theme. 1.1.0 keeps every 1.0.0 piece (copied from 1.0.0) and adds Medieval Hexagon trees, bushes and rocks.
- **Sounds**: Kenney platformer kit sounds, copied unchanged.
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.1.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme (kid-safe check).
