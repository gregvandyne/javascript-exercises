# Third-party code in the figure libraries

What Oomba Academy self-hosts for science, maths and graph figures (`docs/figures-api.md`), under which licence, and how
each licence was checked. Each folder keeps the package's own LICENSE file next to the one file games load, and a
`manifest.json` with the sha256 (and sha384, the SRI hash) of every file; `figures/SHIPPED.json` locks them all
(`server/services/figlibs.js` pins the script tags; `tests/unit/figures-vendor.test.js` checks files, hashes and
licences). Other vendored code (Three.js, Phaser, Rapier, fonts) is listed where it is pinned: `docs/decisions.md`,
`kit2/SHIPPED.json` and each folder's own licence file.

| Library | Version | Folder | Licence | Used under | Copied from |
| --- | --- | --- | --- | --- | --- |
| JSXGraph | 1.14.3 | `public/vendor/jsxgraph/1.14.3/` | MIT OR LGPL-3.0-or-later | **MIT** | npm `jsxgraph@1.14.3`: `distrib/jsxgraphcore.js`, `LICENSE.MIT` |
| SmilesDrawer | 2.4.2 | `public/vendor/smiles-drawer/2.4.2/` | MIT | MIT | npm `smiles-drawer@2.4.2`: `dist/smiles-drawer.min.js`, `LICENSE.md` |
| Oomba Figures | 1.0.0 | `public/vendor/oomba-figures/1.0.0/` | MIT | (our own) | `figures/src` in this repository |

## How the licences were checked (19 Nov 2026)

- **JSXGraph 1.14.3.** `package.json` says `(MIT OR LGPL-3.0-or-later)`. The package ships both texts (`LICENSE.MIT`,
  `LICENSE.LGPL`, the same two in `distrib/`). We choose **MIT** and copy only `LICENSE.MIT` (the MIT text, © 2008-2012
  Matthias Ehmann, Michael Gerhaeuser, Carsten Miller, Bianca Valentin, Alfred Wassermann, Peter Wilfahrt), recorded as
  `usedUnder: "MIT"` in its manifest. The minified file also carries a small UTF-8 decoder by Bjoern Hoehrmann under
  the MIT licence, with its notice kept in the file.
- **SmilesDrawer 2.4.2.** `package.json` says `MIT`; `LICENSE.md` is the MIT text (© 2017 GDB / Reymond Research
  Group). Its one dependency, **chroma-js** (© 2011-2019 Gregor Aisch), is bundled into `smiles-drawer.min.js` under
  its BSD-3-Clause licence (its colour names under Apache-2.0); both notices are kept, unchanged, in the file's own
  "Bundled license information" comment.
- `scripts/vendor-figures.js` refuses a package whose `package.json` licence or LICENSE file is not the one checked
  here, and never copies a GNU licence text.

## What we did not vendor

- **matter-js** (MIT): not needed. Phaser 3.90, already vendored for Kit 2 (`public/vendor/kit2/phaser/3.90.0/`, MIT),
  bundles Matter physics for moving physics in arcade games.
- **CircuitJS** and **PhET** simulations: GPL, never vendored. Circuit symbols are drawn by Oomba Figures itself.
- **Ketcher**: far too large for a game frame.
- Worksheet figure sites whose figures are CC0 but whose code has no open licence: none of their code or bundles was
  copied or consulted; every figure here is drawn by our own code or the libraries above.
