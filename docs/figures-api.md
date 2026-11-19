# Oomba Figures API (1.0.0)

Oomba Figures draws the figures science, maths and graph worksheets need, as accessible SVG, from plain data: free-body
diagrams, vectors, inclined planes, pulleys, ray diagrams, circuits, motion graphs, a coordinate grid, half-life and
titration curves, Bohr models, orbital box diagrams, Lewis structures and scale readings (thermometer, measuring
cylinder, spring balance). Skeletal structures come from SMILES through SmilesDrawer, and interactive boards from
JSXGraph. Classroom activities (Oomba Canvas 1.2.0, `docs/canvas-api.md`) and arcade games can both use it.

- Source: `figures/src/` (`svg.js` the drawing core and colours, `physics.js`, `graphs.js`, `chem.js`, `readings.js`,
  `words.js` the few default words in every site language, `index.js` the global), plus `canvas/src/expr.js` (the small
  safe formula language it shares with Oomba Canvas). `scripts/build-figures.js` bundles it into
  `public/vendor/oomba-figures/<version>/oomba-figures.js` (with its LICENSE and `manifest.json`) and writes
  `figures/SHIPPED.json`, the lock for it and for the vendored libraries (`scripts/vendor-figures.js` copies JSXGraph
  and SmilesDrawer from npm; licences in `docs/third-party.md`).
- Platform: `server/services/figlibs.js` (the pinned tags, the scanner's `checkFigures`, the server's copy of the frozen
  file for printed worksheets and the activity self-test), `server/builder/figures.js` (when the FIGURE RULES are sent),
  `server/builder/figure-rules.js` (generated from this page by `scripts/build-figure-rules.js`).
- Every figure is pure: `OF.svg(kind, data, opts)` gives the SVG text anywhere (the server prints with it, the tests use
  it); `OF.draw(kind, data, opts)` gives an `<svg>` element in the page. `OF.check(kind, data)` lists what is wrong.

## Correct to scale

A figure is drawn from its numbers, never by eye: an arrow's length is proportional to its force (the longest is a fixed
length); a slope's angle is the angle; a ray goes where the thin-lens or mirror equation sends it (ray diagrams draw
heights on their own scale, as textbooks do: stretching one axis keeps every ray straight and every crossing in its
place); graph points sit on evenly spaced axes; a reading's liquid, meniscus or pointer is exactly at the value; electron
counts come from the element table and the filling rules (Bohr: 2, 8, 8, 2; orbitals: Aufbau, Hund's rule, Cr and Cu);
a titration's pH comes from the charge balance solved exactly. Data that cannot be drawn truthfully (the object at the
focal point, a reading between ticks, a Lewis structure whose electrons do not add up) fails `OF.check` and draws a
small "cannot be drawn" card, never a wrong figure.

<!-- builder:rules -->
FIGURE RULES (Oomba Figures: this build needs science, maths or graph figures). Every rule above still applies.
- Draw every science, maths or graph figure with Oomba Figures (and, only where it says, JSXGraph or SmilesDrawer). Never draw one by hand (no SVG or canvas arrows, circuits, atoms, rays or axes of your own), never load another library, a CDN or a picture of a figure. The tags are below: put them before your own script (in a classroom activity, before the Oomba Canvas tag). Oomba Figures alone draws every kind listed here; add the JSXGraph tag only for OF.board and the SmilesDrawer tag only for OF.structure.
- Correct to scale: give the real numbers (forces in newtons, angles in degrees, the focal length and object distance, the element, the value on the scale) and the figure is drawn from them. Never fake a figure to look right, and never choose numbers it cannot draw truthfully: OF.check(kind, data) lists the problems ([] means fine). Work answers out from the same numbers (OF.solve has the same sums the drawings use).
- The call: const svg = OF.draw(kind, data, { title, lang, hide }); someElement.append(svg). title: what it shows, without the answer (for screen readers). lang: the builder's language (numbers and default words). hide: leave the answer out for the student (true, or the part: "value" for a reading, "electrons" for a Bohr model, "arrows" for orbitals, "rays" or "image" for a ray diagram, "resultant" for vectors, "tension", "meters", "marks", "lone", or a force's name). Figures never mirror in right-to-left languages; their labels read the right way by themselves. Keep them readable on a phone: max-width 100%.
- Kinds and their data (one example each):
  freeBody { body: "box" | "dot", label: "2 kg", forces: [{ name: "W", dir: "down", size: 19.6 }, { name: "N", dir: "up", size: 19.6 }, { name: "F", dir: 30, size: 10 }], net: true } (dir: up, down, left, right or degrees from the right, anticlockwise; size in N)
  vectors { vectors: [{ x: 3, y: 0, label: "a" }, { x: 0, y: 4, label: "b" }], chain: true, resultant: true, unit: "m" } (grid units, y up)
  inclinedPlane { angle: 30, mass: 2, mu: 0.2, components: true } (weight m g down, normal m g cos θ, friction along the slope)
  pulley { type: "atwood" | "table" | "single", masses: [2, 3], show: ["tension", "weight", "acceleration"] }
  rays { type: "convex-lens" | "concave-lens" | "concave-mirror" | "convex-mirror", f: 10, u: 25, h: 4, rays: [1, 2, 3] } (u is not f; the image comes from 1/f = 1/u + 1/v)
  circuit { layout: "series" | "parallel", parts: [{ type: "battery", value: "6 V" }, { type: "switch", open: false }, { type: "bulb" }, { type: "resistor", value: "4 Ω" }, { type: "ammeter", value: "0.5 A" }], branches: [[parts], [parts]] (parallel), meters: [{ type: "voltmeter", across: 3, value: "2 V" }] } (parts: cell, battery, bulb, resistor, variable-resistor, switch, ammeter, voltmeter, diode, led, fuse)
  motionGraph { type: "distance-time" | "displacement-time" | "velocity-time", points: [[0, 0], [10, 50], [20, 50]], shade: true, marks: [1, 2] }
  grid { x: [-5, 5], y: [-5, 5], points: [{ x: 2, y: 3, label: "A", coords: true }], fns: [{ expr: "2*x - 1", label: "y = 2x − 1" }], segments: [{ from: [0, 0], to: [3, 4] }], shapes: [{ points: [[0, 0], [3, 0], [0, 4]] }] }
  halfLife { halfLife: 5, start: 80, unit: "days", yunit: "g" }
  titration { acid: "weak", base: "strong", pKa: 4.76, ca: 0.1, cb: 0.1, v0: 25 } (flask: "acid" or "base"; never weak with weak)
  bohr { element: "Na", charge: 0 } (H to Ca; give shells for more)    orbitals { element: "Fe", charge: 2 } (H to Kr)
  lewis { molecule: "H2O" } (H2, F2, Cl2, O2, N2, HCl, HF, H2O, NH3, CH4, CCl4, CO2, HCN, C2H4, C2H2, NH4, OH) or { atoms: [{ el: "O", x: 0, y: 0, lone: 2 }, ...], bonds: [{ a: 0, b: 1, order: 1 }], charge: 0 }; style: "dots" draws shared pairs as dots
  reading { type: "thermometer" | "cylinder" | "spring", value: 23.5, min: -10, max: 50, step: 1, major: 10 } (the value on a tick or half way between two; read a cylinder at the bottom of the meniscus)
  OF.structure("CCO", { title }) a skeletal structure (SmilesDrawer); OF.board(element, { x: [-5, 5], y: [-5, 5] }) a JSXGraph board in the Oomba colours (an interactive graph: then board.create("functiongraph", [x => x * x]) etc.).
- In a classroom activity (Oomba Canvas 1.2.0): a figure question is a problem { tool: "figure.number", q: "What is the reading?", fig: { kind: "reading", type: "thermometer", value: 23.5, min: -10, max: 50, step: 1, hide: "value" }, answer: 23.5, dp: 1, unit: "°C", work: ["The liquid stops half way between 23 and 24.", "The reading is 23.5 °C."] } or { tool: "figure.choice", q, fig, choices: ["real", "virtual"], answer: 1, work: [...] }. fig is the figure's data with "kind" (and "hide" to leave the answer out). work is the worked answer the answer key prints: 1 to 6 short lines, the last one ending on the answer. Answers are numbers 0 or more (say a direction in words); dp is the decimal places the student types.
- A figure question generator: gen { tool: "figure.number", vars: { m: [2, 10], a: [1, 5] }, where: "m*a <= 40", q: "A {m} kg cart speeds up at {a} m/s². What is the net force on it?", fig: { kind: "freeBody", body: "box", label: "{m} kg", forces: [{ name: "F", dir: "right", size: "{=m*a}" }] }, answer: "m*a", dp: 0, unit: "N", work: ["F = m × a", "= {m} × {a}", "= {=m*a} N"] }. vars: [lo, hi], [lo, hi, step] or { "of": [values] }; in text "{m}" is a value and "{=formula}" a worked-out number; in fig a string that is only "{m}" or "{=formula}" becomes that number. Formulas: + − * / ^, brackets, sqrt, abs, round(x, dp), min, max, sin, cos, tan (degrees), log, ln, if(test, a, b).
- The self-test checks every figure (OF.check on each problem, and on three sets from a generator) and that the page loads the pinned Oomba Figures tag: a version with a wrong figure is not saved, and the reply names it.
- In an arcade game: show the figure on the question card (append OF.draw(...)), ask about it, and work the right answer out from the same data.
<!-- /builder -->

## Kinds

| Kind | Data | Hide |
| --- | --- | --- |
| `freeBody` | `forces: [{ name, dir, size }]`, `body`, `label`, `net` | a force's name, `forces`, `net` |
| `vectors` | `vectors: [{ x, y, label, from }]`, `chain`, `resultant`, `grid`, `unit` | `resultant` |
| `inclinedPlane` | `angle` 5–70, `mass`, `g`, `mu` or `friction`, `applied`, `components`, `labels` | `values`, `angle` |
| `pulley` | `type`, `masses`, `mu`, `show` | `tension`, `acceleration` |
| `rays` | `type`, `f`, `u`, `h`, `rays`, `labels` | `rays`, `image` |
| `circuit` | `layout`, `parts`, `branches`, `meters` | `meters` |
| `motionGraph` | `type`, `points`, `tmax`, `ymax`, `shade`, `marks`, units and labels | `line`, `area` |
| `grid` | `x`, `y`, `step`, `points`, `segments`, `fns`, `shapes` | `labels`, `true` (a blank grid) |
| `halfLife` | `halfLife`, `start`, `tmax`, `unit`, `yunit` | `marks` |
| `titration` | `acid`, `base`, `flask`, `ca`, `cb`, `v0`, `vmax`, `pKa`, `pKb` | `marks` |
| `bohr` | `element` or `Z`, `charge`, `shells` | `electrons`, `nucleus` |
| `orbitals` | `element` or `Z`, `charge` | `arrows` |
| `lewis` | `molecule`, or `atoms` + `bonds` + `charge`; `style` | `lone`, `true` (atoms only) |
| `reading` | `type`, `value`, `min`, `max`, `step`, `major`, `unit` | `value` |

`opts.print` draws black on white with grey fills (the printed worksheet). Colours otherwise are the site's: green,
blue, red, gold and purple on the cream paper.

## Not yet

Skeletal structures (SmilesDrawer) are drawn in the browser only, so a printed worksheet cannot show them yet (use a
Lewis structure there). Optics with thick lenses, compound circuits beyond one level of branches, 3D molecules,
energy-level diagrams and moving physics (Phaser's built-in Matter physics already serves arcade games) are later.
