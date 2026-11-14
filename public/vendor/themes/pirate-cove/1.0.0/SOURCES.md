# Pirate Cove 1.0.0: where every file came from

| Pack | Source | Commit | Licence |
|---|---|---|---|
| Kenney Pirate Kit 2.1, Kenney | https://kenney.nl/assets/pirate-kit (uploaded by the owner as FBX to branch `asset-packs`, folder `pirate-kit/`, 2026-11-14) | 1d1dbb18a46bc9e8cdfc181ed83b88b095cdd173 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/kenney-pirate.txt`) |
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## What was changed

The Pirate Kit's FBX files were converted to GLB with FBX2glTF 0.9.7 (`kit2/pipeline/fbx-to-glb.mjs`), then built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/pirate-cove/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Heroes**: the five adventurers with their shared moves, copied from an earlier built theme (Castle Quest 1.0.0: held items removed, kid-friendly names). The four skeleton pals are not in this world (`docs/kit2-packs-plan.md`: new worlds carry five heroes).
- **Pieces**: 59 of the kit's models, each with the kit's colour map embedded, no metal, and made 1.3 times bigger so they suit the 2.4 m heroes (the barrel, crate and chest keep the kit's own size). `island-sand` and `island-grass` are the kit's flat sand and grass patches made 12 times thicker, so they stand in the sea. The chest keeps its `open` and `close` clips (Oomba3D 1.1.0 does not play a piece's clips, so it stays shut). The coin comes from an earlier built theme (Castle Quest 1.0.0).
- **Left out on purpose (kid-safe)**: `cannon`, `cannon-mobile` and `cannon-ball` (weapons); `bottle`, `bottle-large` and `crate-bottles` (read as rum); `ship-pirate-small`, `-medium` and `-large` (skull and crossbones on the sails); `ship-ghost` (a ghost ship). Three of the four plain black flags are left out too: one is kept (`flag-black`, no picture on it), beside four cream ones.
- **Sounds**: Kenney platformer kit sounds, copied unchanged from an earlier built theme (Busy Kitchen 1.0.0).
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.1.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme (kid-safe check).
