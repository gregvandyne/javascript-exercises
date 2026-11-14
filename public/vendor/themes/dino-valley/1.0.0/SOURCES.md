# Dino Valley 1.0.0: where every file came from

| Pack | Source | Commit | Licence |
|---|---|---|---|
| Quaternius Animated Dinosaurs, Quaternius | https://quaternius.com (uploaded by the owner as FBX to branch `asset-packs`, folder `dinosaurs/`, 2026-11-14) | 6de6ee07a0b8b77f125534477d13d73159d447b4 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/quaternius-dinosaurs.txt`) |
| Kenney Nature Kit 2.1, Kenney | https://kenney.nl/assets/nature-kit (uploaded by the owner as FBX to branch `asset-packs`, folder `kenney-nature-kit/`, 2026-11-14) | 6de6ee07a0b8b77f125534477d13d73159d447b4 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/kenney-nature.txt`) |
| Quaternius Ultimate Nature Pack, Quaternius | https://quaternius.com/packs/ultimatenature.html (uploaded by the owner as FBX to branch `asset-packs`, folder `quaternius-ultimate-nature/`, 2026-11-14) | 6de6ee07a0b8b77f125534477d13d73159d447b4 (the `asset-packs` commit) | CC0 1.0 (`LICENSES/quaternius-nature.txt`) |
| KayKit Adventurers Character Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | 672074b73ba276876a19e8816ecdc5241817ab47 | CC0 1.0 (`LICENSES/kaykit-adventurers.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## What was changed

The three uploaded packs' FBX files were converted to GLB with FBX2glTF 0.9.7 (`kit2/pipeline/fbx-to-glb.mjs`), then built by `kit2/pipeline/build-theme.mjs` from `kit2/themes/dino-valley/recipe.json`, which `kit2/pipeline/from-def.mjs` makes from `theme.def.json` (glTF Transform 4.2.1: dedup, weld, resample, prune, reorder, quantize; served brotli-compressed).

- **Dinosaurs** (`creatures/`, five of the pack's six): Triceratops, Stegosaurus, Parasaurolophus, Apatosaurus and Velociraptor, each scaled to its size beside the 2.4 m heroes (3.6 m to 15 m long), with four calm clips kept and renamed (`idle`, `walk`, `run`, `jump`). The pack's dark colours are replaced by one bright colour per material (`colours`: blue, orange, purple, green and yellow, with pale bellies); normals smoothed for the ink outline and the model marked flat-shaded (`inkNormals`); every colour put into one tiny palette picture so an animal is one draw call (`oneDraw`); meshopt compression (decoded with WebAssembly by Oomba3D).
- **Left out of every dinosaur on purpose**: the pack's `Attack` and `Death` clips. No file here has one (`tests/unit/kit2-dino-valley.test.js`, `tests/unit/kit2-creatures.test.js`).
- **The pack's sixth model is not in this world, in any form**: it is modelled with its mouth open and a row of teeth, and its skeleton has no jaw to close it (`docs/kit2-packs-plan.md`).
- **Heroes**: the five adventurers with their shared moves, copied from an earlier built theme (Castle Quest 1.0.0: held items removed, kid-friendly names).
- **Pieces from the Kenney Nature Kit** (69 models): made 4 times bigger so they suit the 2.4 m heroes (ground tiles are 4 m; flowers and the small mushrooms 3 times, the sign 5 times, the nest 6 times, the giant mushroom 10 times), lifted by the 0.05 the kit's models sit below their own floor, no metal. `valley-ground` and `stone-block` are the kit's cliff blocks made 3 deep. The three eggs are the kit's round stone made taller and narrower towards the top (`stretch`, `taper`) and given an egg colour; the nest is the kit's large pot in straw colours.
- **Pieces from the Quaternius Ultimate Nature Pack** (17 models: three palms, a tree with hanging leaves, four plants, a bush, reeds, six rocks and a log): made 2 times bigger (the big boulders 4 and 5 times; plants 1 to 1.5 times), no metal.
- **Colours**: both nature packs carry plain material colours and no pictures, so every material is given one colour from a shared valley palette (`colours` in `theme.def.json`, the approach of Wild Woods): fresh grass, two jungle greens, warm sandstone cliffs, pale stone, river blue.
- **Left out on purpose**: nothing in the packs used is a weapon. Not in this world: bare "dead" trees, snow pieces, cacti (spines), statues and the carved stone head, and anything that would be a bone, a skull or a fossil (the packs have none). The cave is an empty hollow in a cliff block: scenery.
- **Coin**: from an earlier built theme (Castle Quest 1.0.0). **Sounds**: Kenney platformer kit sounds, copied unchanged from an earlier built theme (Busy Kitchen 1.0.0).
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.2.0 (ink outlines on).

Every model was looked at on a contact sheet before it joined the theme, and each dinosaur beside a hero, face on and side on, standing, walking and running (kid-safe check: closed mouths, no teeth showing).
