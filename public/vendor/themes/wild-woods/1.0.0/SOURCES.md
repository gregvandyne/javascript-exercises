# Wild Woods 1.0.0: where every file came from

| Pack | Source | Commit | Licence |
|---|---|---|---|
| Kenney Nature Kit 2.1, Kenney | https://kenney.nl/assets/nature-kit (uploaded by the owner as FBX to branch `asset-packs`, folder `kenney-nature-kit/`, 2026-11-14) | 6de6ee07a0b8b77f125534477d13d73159d447b4 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/kenney-nature.txt`) |
| Quaternius Ultimate Nature Pack, Quaternius | https://quaternius.com/packs/ultimatenature.html (uploaded by the owner as FBX to branch `asset-packs`, folder `quaternius-ultimate-nature/`, 2026-11-14) | 6de6ee07a0b8b77f125534477d13d73159d447b4 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/quaternius-nature.txt`) |
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## What was changed

The two nature packs' FBX files were converted to GLB with FBX2glTF 0.9.7 (`kit2/pipeline/fbx-to-glb.mjs`), then built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/wild-woods/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Heroes**: the five adventurers with their shared moves, copied from an earlier built theme (Castle Quest 1.0.0: held items removed, kid-friendly names). The four skeleton pals are not in this world (`docs/kit2-packs-plan.md`: new worlds carry five heroes).
- **Pieces from the Kenney Nature Kit** (89 models, two of the kit's cliff blocks among them made into the `meadow` and `stone-block` ground): made 4 times bigger so they suit the 2.4 m heroes (ground tiles are 4 m; flowers and mushrooms 3 times, tents and the sign 5 times), lifted by the 0.05 the kit's models sit below their own floor, no metal.
- **Pieces from the Quaternius Ultimate Nature Pack** (17 models: five trees, three bushes, four rocks, a fern, flowers, a water lily, a log and a stump): made 2 times bigger (bushes 1.4 times; ferns, lilies, flowers, the log and the stump 1.5 times), no metal.
- **Colours**: both packs carry plain material colours and no pictures. The converter reads the Kenney colours too pale and the Quaternius colours too dark, and the two packs' greens do not match, so every material is given one colour from a shared woodland palette (`colours` in `theme.def.json`): one meadow green, two leaf greens, autumn orange, bark and plank browns, grey stone, river blue.
- **Left out on purpose**: nothing in either pack is a weapon or scary. Left out because they do not belong in a sunny wood, or to keep the world small: the bare "dead" trees (they read as spooky), every snow piece, cacti, palms, crops and field rows, the stone statues and columns, pots, hanging moss, the kit's second (stone) cliff set, and near-duplicates of what is in (`kit2/packs/kenney-nature-kit.json`, `kit2/packs/quaternius-ultimate-nature.json`).
- **The campfire** is logs in a ring of stones with no flames: a cosy prop, nothing burns.
- **Coin**: from an earlier built theme (Castle Quest 1.0.0). **Sounds**: Kenney platformer kit sounds, copied unchanged from an earlier built theme (Busy Kitchen 1.0.0).
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.1.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme (kid-safe check).
