# Kit 2

Kit 2 is the next game kit: real engines (Three.js, Phaser) and free professional CC0 art, packaged as **themes** kids pick in the Builder. Kit 1 (`kit/`) stays as the Classic theme and never changes. The plan, stages and rules are in `docs/kit2-themes-plan.md`.

| Folder | What |
|---|---|
| `themes/<theme>/recipe.json` | Which pack files go into the theme and what is stripped (held weapons, unused animations). |
| `themes/<theme>/theme.src.json` | The theme's catalogue by hand: names, tags, sizes, animation names, look, packs and licences. |
| `pipeline/build-theme.mjs` | Builds a theme's models and sounds from its packs (glTF Transform, meshopt). |
| `pipeline/manifest.mjs` | Writes the built theme's `theme.json`: the catalogue plus every file's size and hash. |
| `demo/` | The Sky Islands prototype, for reference. |

Built themes live in `public/vendor/themes/<theme>/<version>/` with `theme.json`, `SOURCES.md` and `LICENSES/`. `tests/unit/kit2-themes.test.js` checks each one: every file listed with its hash, every pack CC0 with its licence file, every piece from a listed pack, and the first load under 5 MB.

## Adding or rebuilding a theme

1. `git clone --depth 1` each pack into a scratch folder (record the commit in `theme.src.json` and `SOURCES.md`).
2. In a scratch folder, `npm i @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 meshoptimizer@0.22.0`, copy `pipeline/build-theme.mjs` there and run it with the recipe, the packs folder and `public/vendor/themes/<theme>/<version>`.
3. Look at every model (a contact sheet) before it joins: no weapons, nothing scary.
4. Copy the licences into `LICENSES/`, write `SOURCES.md`, add `cover.webp` (640 × 360), then `node kit2/pipeline/manifest.mjs kit2/themes/<theme>/theme.src.json public/vendor/themes/<theme>/<version>`.

A shipped theme version never changes; a fix or new pieces ship as a new version.
