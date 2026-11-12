# Castle Quest 1.0.0: where every file came from

Downloaded 2026-11-12 with `git clone` (GitHub copies; the makers' own sites were not reachable from the build machine).

| Pack | Source | Commit | Licence |
|---|---|---|---|
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Skeletons Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | 15b62b9bad122f72926c10fb14d622c73819fa54 | CC0 1.0 (`LICENSES/kaykit-skeletons.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## What was changed

Built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/castle-quest/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Heroes**: the five adventurers and their shared moves are copied unchanged from Sky Islands 1.0.1 (held items already removed there). The four skeletons come from `Characters/gltf/Skeleton_*.glb` with every animation removed (they use the same moves; their weapons are separate files that were not used) and kid-friendly names: Skelly (Mage), Rattles (Minion), Bonzo (Rogue), Captain Clank (Warrior).
- **Pieces**: from the packs' `Assets/gltf` models with their colour texture embedded, renamed to short ids (the recipe maps each one). Left out on purpose: swords, shields and other weapons, and the pillar and banner decorated with crossed swords.
- **Sounds**: Kenney platformer kit sounds, copied unchanged.
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.1.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme (kid-safe check).
