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
| Oomba Figures | 1.0.0, 1.1.0, 1.2.0 | `public/vendor/oomba-figures/1.0.0/`, `public/vendor/oomba-figures/1.1.0/`, `public/vendor/oomba-figures/1.2.0/` | MIT (1.1.0 and 1.2.0: MIT, with the ported parts below under Apache-2.0; both texts in its LICENSE) | (our own) | `figures/src` in this repository |
| STEM Figures (`teacherdotdev/stem-figures`): the number line's layout, its number writing, the interval union; the shape layout (marks, heights, label placement), the triangle solver, the quadrilateral and regular polygon geometry; the lines and angles layout and its marks, the segment layout, the circle geometry and layout, the transformations math; the statistics behind the data displays (five-number summary, outliers, tidy axis, normal distribution, least squares and r, the monotone curve); the 3D solids' measures and oblique-projection layout (hidden edges, heights, slant heights, labels), the nets (the 11 cube nets, folding a net into a cube, unfolding a solid, glue tabs, the net layout), the mapping diagram's layout and the ruler's marks and readings; the motion from segments (motion graphs and maps), the projectile's path, the wave's axes and longitudinal lines, the series/parallel circuit tree, and the vernier caliper's and micrometer's scales and readings | commit `3bb43190fccb45841fe7cae30d05549f9f088306` | `figures/src/ported/` (`numberline.js`, `numbering.js`, `shapes.js`, `polygons.js`, `lines.js`, `segments.js`, `circle.js`, `transform.js`, `stats.js`, `solids.js`, `nets.js`, `mapping.js`, `ruler.js`, `motion.js`, `projectile.js`, `waves.js`, `circuittree.js`, `gauges.js`, `LICENSE.txt`) | Apache-2.0 | Apache-2.0 (ported and changed; a note at the top of each file says how) | https://github.com/teacherdotdev/stem-figures at that commit: `apps/math/src/lib/generators/number-line/numberline.ts`, the `union` in `inequality.ts`, `packages/shared/src/graph/numbering.ts`, `apps/math/src/lib/shapes/layout.ts`, `apps/math/src/lib/generators/triangle/solve.ts` and `layout.ts`, `apps/math/src/lib/shapes/quadrilateral/kinds.ts` and `layout.ts`, `apps/math/src/lib/generators/regular-polygon/settings.ts` and `layout.ts`, `apps/math/src/lib/generators/angles/layout.ts`, `apps/math/src/lib/generators/parallel-lines/layout.ts`, `apps/math/src/lib/labeling/marks.ts`, `apps/math/src/lib/generators/segment-addition/layout.ts`, `apps/math/src/lib/generators/circle/geometry.ts` and `layout.ts`, `apps/math/src/lib/editors/transformations/transform.ts`, `apps/math/src/lib/stats/data.ts`, `normal.ts`, `regression.ts` and `smooth.ts`, `apps/math/src/lib/generators/box-plot/stats.ts`, `apps/math/src/lib/generators/3d-shape/solve.ts` and `layout.ts`, `apps/math/src/lib/shapes/placeLabels.ts`, `apps/math/src/lib/generators/net/cubes.ts`, `solve.ts` and `layout.ts`, `apps/math/src/lib/generators/mapping-diagram/layout.ts`, `apps/math/src/lib/generators/length-reading/ruler.ts`, `apps/physics/src/lib/generators/motion-graphs/motion.ts`, `apps/physics/src/lib/generators/projectile-motion/projectile.ts`, `apps/physics/src/lib/generators/waves/wave.ts`, `apps/physics/src/lib/generators/circuit-diagram/tree.ts`, `apps/physics/src/lib/generators/length-reading/caliper.ts`, `micrometer.ts` and `instrument.ts`; `LICENSE.txt` copied verbatim |

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

## STEM Figures, ported (21 Nov 2026)

- **What it is.** An open source set of worksheet figure generators (`teacherdotdev/stem-figures`). Its code is under the **Apache License 2.0**:
  `LICENSE.txt` at the repository root, the standard text with no copyright line filled in, there since its first
  commit (`6c42b9c`, 24 Sep 2026) and unchanged at `3bb43190`. It has no NOTICE file. The figures its sites make are a
  separate matter (CC0 1.0); Oomba states its own CC0 notice for figures made in Oomba (`docs/figures-api.md`).
- **Permission.** The owner of Oomba Academy has confirmed the project's permission for this port, and its owner asked
  for their name to be kept out of the product. So this record and the verbatim `figures/src/ported/LICENSE.txt` are
  the only places that name it; the ported files point here instead. Removing this record would breach Apache 2.0
  section 4 (keep the license and the attribution), so it stays.
- **How it is used (Apache 2.0 section 4).** (a) The license text is next to the ported code and in
  `public/vendor/oomba-figures/1.1.0/LICENSE` and `public/vendor/oomba-figures/1.2.0/LICENSE`, after ours. (b) Each ported file says at its top that it was changed
  and how; the minified `oomba-figures.js` and its packs (1.1.0 and 1.2.0) keep each of those notes as a `/*! ... */` comment, so the shipped
  file says it too. (c) The original had no copyright, patent or trademark notices in the ported files to keep. (d) There is
  no NOTICE file to carry. Only the geometry and pure helpers are ported: no framework components, no apps, no hosting
  config, no analytics, no branding, no example pictures (they carry the project's own notice in their metadata).
- **Not taken.** The math input library the project vendors (its packages have no license file; its author is not
  the project's) is not copied, used or consulted: Oomba Figures takes structured data, so nothing needs to parse typed
  math, and the shapes' math labels are set by Oomba's own typesetter (`figures/src/mathtext.js`, MIT, written fresh). The project's composite shape editor is not ported either: `compositeShape` (`figures/src/composite.js`) is Oomba's own code. The data displays, probability figures and tables (`figures/src/data.js`, `figures/src/prob.js`) port only the statistics (`ported/stats.js`); their drawing is Oomba's own, and the protractor (`figures/src/protractor.js`) is written fresh (the project has none). The 3D solids, nets and mapping diagram (`figures/src/solids.js`, `figures/src/mapping.js`) port only the geometry and layout (`ported/solids.js`, `ported/nets.js`, `ported/mapping.js`); reading the data, the checks, the answers and the drawing are Oomba's own. The ruler (`reading` with `type: "ruler"`) ports only the marks and how a length is written (`ported/ruler.js`, from the math site's ruler-only copy); its checks and drawing in `figures/src/readings.js` are Oomba's own, and the magnifiers are not ported. The physics port (1.1.0) takes only the physics and math logic: the motion from segments (`ported/motion.js`), the projectile's path (`ported/projectile.js`), the wave's fitted axes and longitudinal lines (`ported/waves.js`), the series/parallel circuit tree (`ported/circuittree.js`, from the circuit generator's unused tree code) and the caliper's and micrometer's scales (`ported/gauges.js`, the length reading's one implementation shared by the physics and chemistry sites); reading the data, the checks, the answers (`OF.solve`), the circuit layout and every drawing (`figures/src/motion.js`, `projectile.js`, `waves.js`, `network.js`, `readings.js`, the plane mirror in `physics.js`) are Oomba's own. The coil and magnet generator (switched off on the live sites) is not ported, and the vector diagram is not ported twice (Oomba's `vectors`). Since 1.1.0 the bundle is split by subject: the ported parts are in the core or the pack file their kinds are in, each with its note.

## What we did not vendor

- **matter-js** (MIT): not needed. Phaser 3.90, already vendored for Kit 2 (`public/vendor/kit2/phaser/3.90.0/`, MIT),
  bundles Matter physics for moving physics in arcade games.
- **CircuitJS** and **PhET** simulations: GPL, never vendored. Circuit symbols are drawn by Oomba Figures itself.
- **Ketcher**: far too large for a game frame.
- Worksheet figure sites whose figures are CC0 but whose code has no open licence: none of their code or bundles was
  copied or consulted; every figure here is drawn by our own code or the libraries above.
  **Correction (21 Nov 2026):** the example sites behind that 19 Nov 2026 note were, by the evidence, STEM Figures
  (the same figure kinds: free-body, ray, circuit, motion graph, Bohr, Lewis, scale readings, half-life, titration;
  several sister sites; CC0 figures). Its code was open: Apache 2.0 since its first commit (24 Sep 2026). With the
  owner's confirmed permission it is now ported under that license (above). The rule itself stands for every other
  site: code without an open license is never copied or consulted.
