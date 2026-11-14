# Under the Sea 1.0.0: where every file came from

**Most of this world is NOT CC0.** Six of its packs allow use inside games and modification but forbid passing the
files on as assets, and three of them forbid machine-learning training. The models here are served to running games
only; they must never be offered as downloads, exported, or put into an asset pack or library. If the repository ever
becomes public, the raw packs (branch `asset-packs`) must be removed first and these built files reviewed.

| Pack | Source | Commit | Licence |
|---|---|---|---|
| Low Poly Underwater Pack, reodesuxz | uploaded by the owner as FBX to branch `asset-packs`, folder `underwater-pack/`, 2026-11-14 | 3e9121133905ea04d88208483b2591fd9812e958 (the `asset-packs` commit) | Custom: games and modification yes; no redistribution of the files, no AI training (`LICENSES/reodesuxz-underwater.txt`) |
| Low Poly Sea Life (sample: dolphin and crab), MuteAssets | folder `muteassets-sea-life-sample/`, same branch and commit | same | Custom: only inside a finished project; never given away or downloadable as assets (`LICENSES/muteassets-sea-life.txt`) |
| Stylized Fish Pack Free Sampler, aletheiamask | folder `pipothai-fish-sampler/` | same | Custom "Standard Asset License": packed form only; no redistribution, no AI training (`LICENSES/stylized-fish-sampler.txt`) |
| Free Fish Sampler, SageGlint | folder `sageglint-fish-sampler/` | same | Custom, version 1.1: no redistribution of the raw files, no machine-learning training (`LICENSES/free-fish-sampler.txt`) |
| **Fish - PolyPack Asset, ALSTRA INFINITE** | https://alstrainfinite.itch.io/fish, folder `alstra-fish-polypack/` | same | Free Asset License: free to use **with credit**; no reselling or redistribution (`LICENSES/alstra-fish-polypack.txt`) |
| Ocean Animals, THEUNSEENVULGA | https://theunseenvulga.itch.io/ocean-animals, folder `ocean-animals/` | same | Stated as CC0 on its page with a do-not-resell-as-is note, so treated as restricted (`LICENSES/ocean-animals.txt`) |
| Quaternius Cute Fish, Quaternius | https://quaternius.com, folder `cute-fish/` | same | CC0 1.0 (`LICENSES/quaternius-cute-fish.txt`) |
| Kenney Pirate Kit 2.1, Kenney | https://kenney.nl/assets/pirate-kit | 1d1dbb18a46bc9e8cdfc181ed83b88b095cdd173 | CC0 1.0 (`LICENSES/kenney-pirate.txt`) |
| KayKit Dungeon Remastered Pack 1.0, Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07 | CC0 1.0 (`LICENSES/kaykit-dungeon.txt`) |
| Kenney Starter Kit 3D Platformer (sounds), Kenney | https://github.com/KenneyNL/Starter-Kit-3D-Platformer | 3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 | CC0 1.0 (`LICENSES/kenney-platformer.md`) |

## Credits

Fish - PolyPack Asset by ALSTRA INFINITE (required). Low Poly Underwater Pack by reodesuxz. Low Poly Sea Life by
MuteAssets. Stylized Fish Pack Free Sampler by aletheiamask. Free Fish Sampler by SageGlint. Ocean Animals by
THEUNSEENVULGA. Cute Fish by Quaternius. Sand patch and sounds by Kenney. Coin by Kay Lousberg. The same list is in
`docs/media-credits.md`.

## What was changed

The FBX files were converted to GLB with FBX2glTF 0.9.7 (`kit2/pipeline/fbx-to-glb.mjs`), then built by
`kit2/pipeline/build-theme.mjs` from `kit2/themes/under-the-sea/recipe.json`, which `kit2/pipeline/from-def.mjs` makes
from `theme.def.json` (glTF Transform 4.2.1; pictures cut to 256 px, or 128 px for the ALSTRA fish).

- **No walking heroes.** The player is one of the sea animals (every swimmer is playable), so this world has no
  `heroes/` folder and no shared moves.
- **Animals with their own clips** (kept under plain names; every model is moved so its lowest point is at y 0):
  dolphin (idle, swim, leap, spin, chatter; dropped: Death, Hit, Ram, Nudge), crab (idle, and its sideways scuttle as
  stroll; dropped: Death, Hit, Pinch, Threat, Grab), clownfish, blue tang and barb (SwimIdle as idle, SwimFast as swim;
  dropped: Hooked, Flop, Display), butterfly fish, yellow tang, mandarin fish, koi and lionfish (Swimming_Normal as idle,
  Swimming_Fast as swim, Swimming_Impulse as dart; dropped: Attack, Death, Out_Of_Water; colours lifted a little).
- **Animals that arrived still** got a spine and two clips made in the pipeline (`swimRig` in
  `kit2/pipeline/pack-steps.mjs`: idle, a slow sway, and swim, a wave that runs to the tail): goldfish and little
  clownfish (their own black outline shells removed: Oomba3D draws its ink), reef fish, bass, sardine and red snapper
  (turned to face forward, made 1.8 to 2.4 times thicker, their picture bound by material name), sea turtle (its flippers
  beat), swordfish and squid (their old skeletons, which had no clips, baked into the rest pose; their pictures were not
  uploaded, so each has one plain colour: green, blue, pink), pufferfish, seahorse (its sand stand removed), jellyfish
  and little shark (the underwater pack's still models).
- **Pieces**: 22 from the underwater pack, 2.5 times bigger (the arch 4, the shipwreck 4.5), no metal, ink-friendly
  normals. There are no ground tiles: the sandy floor is Oomba3D's own `g.world.ground()`; `sand` is Pirate Cove's thin sand patch, copied from that built theme for the 2D pictures' ground. Coin and sounds are copied from earlier
  built themes.
- **Left out on purpose** (`kit2/packs/*.json` has every reason): everything with teeth showing (the reef shark, the
  ALSTRA shark, the barracuda, the shark, the hammerhead and all seven deep-sea fish), the lobster, sea urchin and rock
  fish (heavy, and their pictures were not uploaded), every fishing rod, lure, worm, dock and boat of the Cute Fish
  pack, and the Quaternius "Animated Fish" pack (whale, manta ray: no licence file was uploaded with it).
- **Cover** (`cover.webp`): a screenshot of `kit2/demo/theme-tour.html` with this theme in Oomba3D 1.2.0.

Every model was looked at on a contact sheet, and every animal's face close up, before it joined the theme.
