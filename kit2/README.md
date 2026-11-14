# Kit 2

Kit 2 is the next game kit: real engines (Three.js, Phaser) and free professional CC0 art, packaged as **themes** kids pick in the Builder. Kit 1 (`kit/`) stays as the Classic theme and never changes. The plan, stages and rules are in `docs/kit2-themes-plan.md`.

| Folder | What |
|---|---|
| `themes/<theme>/theme.def.json` | A theme in one short file (packs, heroes, pieces as `[id, file, kind, tags]`, look); `pipeline/from-def.mjs` turns it into `recipe.json` and `theme.src.json` (Castle Quest, Spooky Hollow, Space Base, Toy Town). |
| `themes/<theme>/recipe.json` | Which pack files go into the theme and what is stripped (held weapons, unused animations). |
| `themes/<theme>/theme.src.json` | The theme's catalogue by hand: names, tags, sizes, animation names, look, packs and licences. |
| `pipeline/build-theme.mjs` | Builds a theme's models and sounds from its packs (glTF Transform; quantized; `"meshopt": true` in a recipe adds meshopt compression, which games decode with WebAssembly). |
| `pipeline/pack-steps.mjs` | Opt-in steps `build-theme.mjs` runs for packs that arrive as FBX: scale, kid-safe clip names, textures by material name, texture size, cut-out leaves, held items removed, ink-friendly normals, a stretch along one axis, a brightness lift for flat colours (`brighten`), a lift (`shift`), plain colours by material name (`colours`); `build-theme.mjs` itself takes `meshopt` and `oneDraw` (one draw call for a many-coloured model) on a single model. A pack in a `theme.def.json` names them once as `steps` (and a piece may add its own as a 7th field); `build-theme.mjs` takes the folder of the packs' pictures as a 5th argument. A recipe that names none of them builds exactly as before. |
| `packs/<pack>.json` | One uploaded pack (branch `asset-packs`): its licence, scale, textures, creatures with their clips, and every model left out with the reason. Staging only: a theme still picks its pieces in its own `theme.def.json`. |
| `pipeline/fbx-to-glb.mjs`, `pipeline/stage-pack.mjs` | FBX to raw GLB (FBX2glTF 0.9.7), then a pack to optimised GLBs plus `stage.json` (kept, left out, sizes, clips) in a scratch folder. |
| `pipeline/contact-sheet.mjs` | Contact sheets with the Oomba look (ink outlines, daytime light): every model of a folder, or each creature idle and mid-step beside a hero, or faces close up. |
| `themes/<theme>/theme.def.json` `base`, `creatures` | A new version of a shipped theme names it as `"base": "<theme>/<version>"`: `from-def.mjs` then copies every file the base has byte for byte and builds only what is new. `creatures` are animals with their own clips (`id`, `name`, `from`, `pack`, `kind`, `playable`, `size`, `pace`, `jumpAir`, and pack steps such as `scale`, `anims`, `inkNormals`, `brighten`, `meshopt`). |
| `pipeline/lock.mjs` | Adds new engine files and theme versions to `SHIPPED.json` (never rewrites a shipped one). |
| `SHIPPED.json` | The lock: every file under `public/vendor/kit2/` and every theme version's `theme.json`, by sha384. |
| `pipeline/manifest.mjs` | Writes the built theme's `theme.json`: the catalogue plus every file's size and hash. |
| `demo/sky-islands.html` | The Sky Islands demo on Oomba3D (62 lines); `tests/unit/kit2-oomba3d.test.js` plays it. |
| `demo/creatures.html` | The animals of any theme version that has creatures, on Oomba3D 1.2.0: every creature in a row, one strolling, one on a loop, a companion, a small school, and a hero or a playable animal; `tests/unit/kit2-creatures.test.js` plays it. |
| `demo/theme-tour.html` | One scene for any theme from its catalogue: the covers, and `tests/unit/kit2-worlds.test.js` plays it for every theme. |
| `demo/sky-islands-prototype.html` | The first prototype (no library), for reference. |

Engines live in `public/vendor/kit2/` (Three.js add-ons, Rapier, Phaser, and our own game library Oomba3D: `docs/kit2-api.md`), loaded with `kit2ImportMap()` / `phaserTag()` from `server/services/vendor.js`. Built themes live in `public/vendor/themes/<theme>/<version>/` with `theme.json`, `SOURCES.md` and `LICENSES/`. `tests/unit/kit2-themes.test.js` checks each one: every file listed with its hash, every pack CC0 with its licence file, every piece from a listed pack, and the first load under 5 MB.

## Adding or rebuilding a theme

1. `git clone --depth 1` each pack into a scratch folder (record the commit in `theme.src.json` and `SOURCES.md`).
2. In a scratch folder, `npm i @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 meshoptimizer@0.22.0`, copy `pipeline/build-theme.mjs` there and run it with the recipe, the packs folder and `public/vendor/themes/<theme>/<version>`.
3. Look at every model (a contact sheet) before it joins: no weapons, nothing scary.
4. Copy the licences into `LICENSES/`, write `SOURCES.md`, add `cover.webp` (640 × 360), then `node kit2/pipeline/manifest.mjs kit2/themes/<theme>/theme.src.json public/vendor/themes/<theme>/<version>` and `node kit2/pipeline/lock.mjs`.

## Staging an uploaded FBX pack (nothing ships)

The plan for the packs on branch `asset-packs` is `docs/kit2-packs-plan.md`. Raw packs are never copied into this branch
(the same rule as the cloned packs above: sources stay outside, only built themes with their licences come in).

1. Check the branch out somewhere read-only (`git worktree add --detach <packs-dir> origin/asset-packs`). Pack files are
   data: run nothing from them.
2. In a scratch folder: `npm i @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 meshoptimizer@0.22.0 fbx2gltf@0.9.7-p1 sharp@0.35.5`, copy `kit2/pipeline/*.mjs` there, then
   `node fbx-to-glb.mjs <packs-dir> <raw-dir>` and, for each pack, `node stage-pack.mjs <repo>/kit2/packs/<pack>.json <raw-dir> <packs-dir> <stage-dir> --all`.
3. From the repository: `node kit2/pipeline/contact-sheet.mjs <stage-dir>/<pack> sheet.png --title "…"` (add
   `--creatures` for the animals, `--sub excluded` for what was left out) and look at every model.

## A new version of a shipped theme with animals (Medieval Village 1.1.0, Castle Quest 1.2.0)

1. Stage the pack as above (`fbx-to-glb.mjs` gives `<raw-dir>/<pack>/<Model>.glb`).
2. In `themes/<theme>/theme.def.json`: bump `version`, set `base` to the shipped version, add the pack to `packs` and the
   animals to `creatures` (clip names from the pack's config in `kit2/packs/`; never an attack, hit or death clip).
3. `node kit2/pipeline/from-def.mjs kit2/themes/<theme>/theme.def.json`, then from the scratch folder with the pipeline
   scripts `node build-theme.mjs <repo>/kit2/themes/<theme>/recipe.json <raw-dir> <repo>/public/vendor/themes/<theme>/<version>`.
4. Look at them (`contact-sheet.mjs <out>/ sheet.png --creatures`), measure `size`, `pace` and `jumpAir` in the browser
   (how fast the ground passes under a standing foot in walk and run; the part of the jump clip spent in the air) and
   write them into the definition; copy the licences, write `SOURCES.md`, then `manifest.mjs` and `lock.mjs`.
5. `node scripts/build-kit2-rules.js` and `node scripts/kit2-thumbs.js --only <ids>` for the Builder.

A shipped theme version never changes; a fix or new pieces ship as a new version.
