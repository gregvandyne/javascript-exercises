# Kit 2 Themes Plan

From the plan doc of 11 Nov 2026 (owner: Greg VanDyne). Stage progress is in `docs/decisions.md`.

Kit 2 replaces hand-drawn kit art with real engines (Three.js, Phaser) and free professional art (KayKit, Kenney, Quaternius), packaged as themes kids pick in the Builder. We start with three themes done well: Sky Islands, Under the Sea and Castle Quest. Kit 1 stays as the Classic theme, so no saved game changes.

## What a theme is

A theme is a ready-made, versioned bundle from one art maker, so every piece in a game matches. Each theme holds:

- **Characters:** 3 to 6 animated heroes or animals (idle, run, jump, cheer, wave at minimum).
- **World pieces:** ground, platforms, buildings, trees, decorations.
- **Props:** collectibles, obstacles and answer markers for questions.
- **Sounds:** jump, coin, land, cheer, wrong answer, plus one ambient loop.
- **Look:** sky, lighting, colours, and the HUD buttons and font.
- **Cover card:** a picture and a one-line description for the picker.

How it is used:

1. A kid or teacher picks a theme card first in the Builder.
2. They describe the game as they do today.
3. The Builder sees only that theme's catalogue (30 to 60 named pieces), and the game loads only that theme's files.
4. A remix keeps its theme. Turn a lesson into a game suggests a theme from the subject, and the teacher can change it.

## The first themes

Three themes ship first; the rest follow once the first three are proven on school Chromebooks.

| Theme | Wave | Art source | Engine | Good for |
|---|---|---|---|---|
| Sky Islands | 1 | KayKit Adventurers + Kenney platformer kit | Three.js | Maths, quizzes, platformers |
| Under the Sea | 1 | Quaternius fish and sea creatures | Three.js | Science, counting |
| Castle Quest | 1 | KayKit Dungeon + Adventurers | Three.js | Reading, history, adventures |
| Pixel World | 2 | Kenney pixel platformer (2D) | Phaser | Classic 2D games, low-power devices |
| Dino Valley | 2 | Quaternius dinosaurs + nature | Three.js | Science, history |
| Space Station | 2 | Kenney / KayKit space | Three.js | Science, maths |
| Farm & Friends | 3 | Quaternius animals + Kenney nature | Three.js | Younger kids, counting |
| City Builder | 3 | Kenney / KayKit city | Three.js | Geography, money |
| Classic | now | Kit 1 (today's kit) | Oomba Kit 1.x | Every game made so far |
| Spooky Hollow | added 12 Nov | KayKit Halloween + Skeletons | Three.js | Seasons, science, maths |
| Space Base | added 12 Nov | KayKit Space Base | Three.js | Science, maths, space |
| Toy Town | added 12 Nov | KayKit City Builder | Three.js | Geography, money, maths |

## How it fits together

Everything a Kit 2 game loads comes from oomba.ai itself, pinned by version, inside the same sealed game frame Kit 1 uses.

| Part | What it is | Where it lives |
|---|---|---|
| Engines | Three.js (already vendored, 0.185.1) with its loaders and effects, Rapier physics (WebAssembly), Phaser 3 for 2D | `public/vendor/three`, `public/vendor/kit2/three-addons`, `public/vendor/kit2/rapier`, `public/vendor/kit2/phaser` |
| Art | Each theme's models, textures and sounds, optimised with gltf-transform (quantized; served brotli-compressed) | `public/vendor/themes/<theme>/<version>/` |
| Theme manifest | One JSON per theme version: pieces, tags, animation names, sizes, licence, cover | Same folder, `theme.json` |
| Helper library (Oomba3D) | A short, friendly API the Builder writes against: `hero()`, `world.island()`, `followCamera()`, `controls()` with touch buttons, `coins()`, `askQuestion()`, `sound()`, `celebrate()` | `kit2/src`, built to `public/vendor/oomba-kit2/<version>/` |
| Frame security policy | Allows only the new `/vendor` paths, nothing outside oomba.ai | `server/services/frame.js` |
| Code scanner | Accepts only the pinned Kit 2 tags and theme files; refuses any other host | `server/services/scanner.js` |
| Builder | Theme picker, then the theme's manifest and the Oomba3D API in its instructions | `server/builder/prompt.js` and the Builder pages |
| Version locks | Shipped engine, library and theme versions never change bytes, like `kit/SHIPPED.json` today | A Kit 2 lock file plus a unit test |

A game names its theme and version once; remixes and saved games keep that pin, and a new theme version only adds pieces.

## Build plan

Six stages, each its own pull request that ships on its own; the build starts 12 Nov 2026, after the usage limit resets.

1. **Art pipeline and Sky Islands theme.** Download the packs, keep each licence file and a source log, compress with gltf-transform, write `theme.json`. Done when Sky Islands loads in under 5 MB and every file has a licence entry.
2. **Engines and hosting.** Vendor Three.js add-ons, Rapier and Phaser under `/vendor`, long-lived caching, frame policy and scanner rules for the new paths, version lock file and its test. Done when a test game can load only those files and nothing else.
3. **Oomba3D helper library.** The API above, keyboard and touch controls, low-power mode (no glow, fewer clouds, pixel ratio capped), reduced-motion support, docs in the style of `docs/kit-api.md` with a test that keeps docs and code in step. Done when the Sky Islands demo is rebuilt on it in under 150 lines.
4. **Showcase game 1: Sky Islands.** An official game with three worlds and a lesson's worth of questions, on the live site. Done when it runs at 30+ frames a second on a low-end Chromebook.
5. **Builder themes.** Theme picker cards, the theme manifest and Oomba3D rules in the Builder's instructions, scanner checks, Turn a lesson into a game picks a theme. Done when the Builder makes a working Sky Islands game from a one-line request.
6. **Wave 1 complete.** Under the Sea and Castle Quest themes, plus the 2D Pixel World on Phaser as showcase game 2. Done when all three themes and both showcase games are live.

Wave 2 and 3 themes follow the same steps 1 and 6 for each new theme.

## Rules that do not bend

- **Kit 1 is untouched.** Every file listed in `kit/SHIPPED.json` keeps its bytes; Kit 1 lives on as the Classic theme.
- **Nothing outside oomba.ai.** Games load engines and art only from our own `/vendor` paths; the frame and scanner refuse any other host, and there is no chat or outside link in a game.
- **Licences on file.** Only CC0 packs (KayKit, Kenney, Quaternius) in wave 1. Each pack keeps its licence file and a record of where and when it was downloaded. Mixed-licence sources (Poly Pizza, Sketchfab, Mixamo) need a per-item check and Greg's lawyer first.
- **Kid-safe art.** Every model is looked at before it joins a theme; nothing scary or violent beyond cartoon adventure, and weapons stay optional props.
- **Chromebook first.** A theme's first load stays under 5 MB compressed, the pixel ratio is capped at 2, and a low-power mode turns off glow and shadows.
- **Pinned versions.** Shipped engines, library and theme versions never change; a fix ships as a new version and saved games are moved on deliberately.

## Open decisions

- [ ] Allow the build environment to reach kenney.nl and quaternius.com, so their full packs can be downloaded (today only GitHub copies are reachable).
- [ ] Store theme art in git (simplest, but grows the repo by tens of MB per wave) or in object storage pinned by version. *Stage 1 uses git for now (1.2 MB per theme).*
- [ ] Is the Builder's theme picker free for everyone, or are some themes part of a paid plan?
- [ ] Keep the fantasy heroes in Sky Islands, or swap in kid characters from Quaternius for younger players?
- [x] **Decided 12 Nov 2026: yes.** Allow WebAssembly in the game frame (`wasm-unsafe-eval`) so games can use Rapier physics and meshopt-compressed models? `docs/safety.md` promises no WebAssembly today, so stage 2 shipped without Rapier and Sky Islands 1.0.1 uses quantized models instead (added 12 Nov 2026).

## Sources

- [Sky Islands demo](https://claude.ai/artifact/2RFMPJ3iopGuLRvLKKUvsV), the working Kit 2 prototype (source: `kit2/demo/`).
- [KayKit Adventurers pack](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), CC0 per its LICENSE.txt.
- [Kenney 3D platformer starter kit](https://github.com/KenneyNL/Starter-Kit-3D-Platformer), models and sounds CC0 per its README.
- [Kenney](https://kenney.nl), [Quaternius](https://quaternius.com) and [Kay Lousberg](https://kaylousberg.com) for the full packs.
- [Three.js](https://threejs.org), [Rapier](https://rapier.rs), [Phaser](https://phaser.io), [glTF Transform](https://gltf-transform.dev).
