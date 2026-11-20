# Media credits

Third-party media used on the site, with where it came from and the licence it is used under. Add a row before using
anything new; never use media without a clear licence that allows commercial use (no NC/ND, no "royalty-free" without a
real licence).

## Videos

| Used in | What | Source and licence | Attribution |
|---|---|---|---|
| `public/video/oomba-demo.mp4` (`/teachers/live`), `public/video/oomba-parents.mp4` (`/parents`) | Background music | Background music: AtlasAudio via Pixabay (Pixabay Content License), supplied by the site owner. File: `atlasaudio-background-594872.mp3` (Pixabay track 594872). | Not required by the Pixabay Content License; no on-video credit. |

Everything else in the videos is the site itself (recorded from the real app with made-up names, see
`scripts/demo-video/README.md`). The original synthesized track (`scripts/demo-video/compose-music.py`) is ours.

## 3D models and the 2D pictures drawn from them (Kit 2 worlds)

Each world's own `SOURCES.md` and `LICENSES/` folder (`public/vendor/themes/<world>/<version>/`) is the full record. This
table lists the packs that are **not CC0**: they may be used inside games but their files may never be passed on as
assets (no download link, no export, no asset pack), and where the licence says so, never used to train a
machine-learning model. If the repository ever becomes public, their raw files (branch `asset-packs`) must be removed
first and the built files reviewed. No lawyer has read these licences: the reading is the owner's.

| Used in | What | Source and licence | Attribution |
|---|---|---|---|
| Under the Sea 1.0.0 (3D); 2D pack `animals` 1.1.0 | Reef fish, bass, sardine, red snapper | Fish - PolyPack Asset by ALSTRA INFINITE, https://alstrainfinite.itch.io/fish. Free Asset License: free to use with credit; no reselling or redistribution. | **Required.** "Fish - PolyPack Asset by ALSTRA INFINITE", here, in the world's `SOURCES.md` and `theme.json`, and in the 2D pack's `pack.json`. |
| Under the Sea 1.0.0 (3D); 2D packs `under-the-sea` 1.0.0 and `animals` 1.1.0 | Corals, kelp, rocks, the arch, the shipwreck, shells, the chest; pufferfish, seahorse, jellyfish, little shark | Low Poly Underwater Pack by reodesuxz (uploaded by the owner). Custom licence: no redistribution of the files, no AI training. | Not required; given: "Low Poly Underwater Pack by reodesuxz". |
| Under the Sea 1.0.0 (3D); 2D pack `animals` 1.1.0 | Dolphin, crab | Low Poly Sea Life (sample) by MuteAssets (uploaded by the owner; the author's name is from the upload's folder name). Custom licence: only inside a finished project. | Not required; given. |
| Under the Sea 1.0.0 (3D); 2D pack `animals` 1.1.0 | Clownfish, blue tang, barb | Stylized Fish Pack Free Sampler by aletheiamask (uploaded by the owner). Standard Asset License: packed form only, no redistribution, no AI training. | Not required; given. |
| Under the Sea 1.0.0 (3D); 2D pack `animals` 1.1.0 | Goldfish, little clownfish | Free Fish Sampler by SageGlint (uploaded by the owner; the author's name is from the upload's folder name). Licence version 1.1: no redistribution of the raw files, no machine-learning training. | Not required; given. |
| Under the Sea 1.0.0 (3D); 2D pack `animals` 1.1.0 | Sea turtle, swordfish, squid | Ocean Animals by THEUNSEENVULGA, https://theunseenvulga.itch.io/ocean-animals. Stated as CC0 on its page with a "do not resell the unmodified assets as-is" note, so treated as restricted. | Not required; given. |

## Picture books (Story Library)

| Used in | What | Source and licence | Attribution |
|---|---|---|---|
| `/library` (Story Library): `server/library/manifest.json`, `public/img/library/sw-NNNN/` | 60 picture books: the story text and the illustrations, the pictures resized to WebP (pages at most 720 px, covers 440 px) and shown one page at a time | Pratham Books, StoryWeaver, through the community mirrors `global-asp/pb-source` (text) and `global-asp/pb-imagebank` (pictures and a licence per picture). Only books whose text **and** every picture are CC BY 4.0 or Public Domain are imported, checked in code (`server/library/import-lib.js`); every book's own licences are in the manifest. The full list, with what was left out and why: `docs/story-library-sources.md`. | **Required (CC BY 4.0).** Under every reader page and on each book's page: author, illustrator(s), translator(s), "Pratham Books, StoryWeaver", the licence linked to its deed, and "Oomba resized the pictures and shows the book one page at a time. Pratham Books does not endorse Oomba." The book page also links the original on StoryWeaver. The 3 questions and the glossary notes are Oomba's own and are labelled as not part of the book. |
| `/library` (Story Library): `server/library/manifest.json`, `public/img/library/bl-<id>/` | Picture books from Bloom Library: the story text (English only) and the illustrations, the pictures resized to WebP (pages at most 720 px, covers 440 px) and shown one page at a time | Bloom Library (bloomlibrary.org, SIL Global), each book's own publisher or author (Book Dash, African Storybook, Pratham Books, Little Zebra Books, SIL-PNG Education for Life and others). Only books licensed CC BY, CC BY-SA or CC0 whose **every picture** carries its own CC BY, CC BY-SA or CC0 license (or the book's own copyright holder), checked in code (`server/library/bloom-lib.js`); each book's license and version are in the manifest. The full list, with what was left out and why: `docs/story-library-bloom.md`. | **Required.** Under every reader page and on each book's page: author, illustrator(s), translator(s), the original book's maker for adaptations, the publisher with "Bloom Library", the license linked to its deed, and "Oomba resized the pictures and shows the book one page at a time. Bloom Library, SIL Global and the book's publisher do not endorse Oomba." For CC BY-SA books also: these adapted pages are shared under the same license. The book page links the original on bloomlibrary.org. |
