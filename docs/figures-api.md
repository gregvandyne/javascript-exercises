# Oomba Figures API (1.7.0)

Oomba Figures draws the figures science, maths and graph worksheets need, as accessible SVG, from plain data: free-body
diagrams, vectors, inclined planes, pulleys, ray diagrams, circuits, motion graphs, a coordinate grid, half-life and
titration curves, Bohr models, orbital box diagrams, Lewis structures, scale readings (thermometer, measuring
cylinder, spring balance), number lines and measured shapes (since 1.1.0: triangles, rectangles and squares,
parallelograms and rhombi, trapezoids, kites and regular polygons, with their labels typeset as math), and the rest of
plane geometry (since 1.1.0: angles, parallel lines and transversals, segment addition, the circle and composite shapes,
plus inequalities, piecewise functions, π and degree numbering and transformations on the coordinate grid), data
displays (since 1.1.0: bar graphs, dot plots, histograms, box plots, scatter plots, stem-and-leaf plots, pie charts,
cumulative frequency and the normal curve), probability figures and tables (tree diagrams, Venn diagrams, two-way tables,
tables of values), a protractor to read an angle with, 3D solids (prisms, cylinders, pyramids, cones, spheres and
hemispheres) and their nets, mapping diagrams, and a ruler to read a length on; and physics diagrams (since 1.1.0: projectile
motion, transverse and longitudinal waves, motion maps, acceleration-time and stacked motion graphs from one motion,
the plane mirror, compound series-parallel circuits with their currents and voltages, and the vernier caliper,
micrometer and spring scale extras); and chemistry (since 1.2.0: mass spectra, heating and cooling curves, potential
energy diagrams, nuclide notation, line spectra, photoelectron spectra, particle diagrams and dot-and-cross diagrams, the lab readings (burets,
beakers, gas syringes, digital and triple beam balances, digital thermometers, pH meters and pH paper, volume by
displacement), orbital diagrams for all 118 elements, Bohr ion marks, several half-life curves on one graph, titration
curves from measured pH, and more Lewis molecules); and biology (since 1.3.0: population growth and predator-prey graphs,
enzyme activity and photosynthesis rate graphs, Punnett squares, pedigrees, protein synthesis, gel electrophoresis and
osmosis, and the micropipette reading); and economics (since 1.4.0: supply and demand, the money markets, the business
cycle, the Phillips curve, production possibilities, the AD-AS model and the firm's cost and revenue curves); and, since
1.5.0, organic structures (skeletal, carbon skeleton, condensed and full structural formulas, drawn by Oomba itself, so
they print) and atomic energy levels with transitions. SmilesDrawer still draws a structure from any SMILES in the
browser (`OF.structure`, for what `skeletal` refuses), and interactive boards come from
JSXGraph. Classroom activities (Oomba Canvas 1.2.0, `docs/canvas-api.md`) and arcade games can both use it.

- Source: `figures/src/` (`svg.js` the drawing core and colours, `physics.js`, `graphs.js`, `chem.js`, `readings.js`,
  `words.js` the few default words in every site language, `notice.js` the CC0 notice an exported figure carries,
  `mathtext.js` the math label typesetter, `shapes.js` the measured shapes, `ported/` ported code under the Apache
  License 2.0 with its `LICENSE.txt`: `numbering.js`, `numberline.js`, `shapes.js` (shape layout), `polygons.js`
  (shape geometry), `lines.js` (lines and angles layout, and the marks), `segments.js` (segment layout), `circle.js`
  (circle geometry and layout) and `transform.js` (transformations), see `docs/third-party.md`; `lines.js` the angles
  and parallel lines, `segments.js` segment addition, `circle.js` the circle, `composite.js` composite shapes,
  `data.js` the data displays, `prob.js` the probability figures and tables, `protractor.js` the protractor,
  `radians.js` a figure's formulas in radians, `ported/stats.js` the statistics behind the data displays, `solids.js` the 3D
  solids and nets (`ported/solids.js` their measures and projection, `ported/nets.js` the nets), `mapping.js` the mapping
  diagram (`ported/mapping.js` its layout), `ported/ruler.js` a ruler's marks, `motion.js` motion graphs and
  motion maps (`ported/motion.js` the motion from segments), `curves.js` the half-life and titration curves,
  `projectile.js` projectile motion (`ported/projectile.js` its path), `waves.js` waves (`ported/waves.js` the axes and
  the longitudinal lines), `network.js` compound circuits (`ported/circuittree.js` the series/parallel tree),
  `ported/gauges.js` the caliper's and micrometer's scales; since 1.2.0 `spectra.js` the mass, line and photoelectron
  spectra (`ported/isotopes.js`, `ported/spectra.js`), `energy.js` heating curves and potential energy diagrams
  (`ported/heating.js`, `ported/profile.js`), `atoms.js` nuclide notation and dot-and-cross diagrams, `particles.js` particle diagrams
  (`ported/particles.js`), `labware.js` the lab readings (`ported/labware.js`) and `ported/elements.js` the 118 elements
  and their configurations; since 1.3.0 `ecology.js` population growth and predator-prey (`ported/growth.js`,
  `ported/lotka.js`), `rates.js` enzyme activity and photosynthesis (`ported/rates.js`), `genetics.js` Punnett squares and
  pedigrees (`ported/punnett.js`, `ported/pedigree.js`), `molecular.js` protein synthesis and gels (`ported/dna.js`,
  `ported/gel.js`), `osmosis.js` osmosis (`ported/osmosis.js`) and `pipette.js` the micropipette (`ported/pipette.js`); since 1.5.0 `skeletal.js` organic structures (`ported/organic.js` the views) and `levels.js` atomic energy levels; since 1.4.0 `econ.js` what every economics graph is drawn with (`ported/econcurves.js` the curve math), `markets.js` supply and demand and the money markets (`ported/markets.js`), `macro.js` AD-AS, the Phillips curve and the business cycle (`ported/macro.js`) and `firm.js` the cost and revenue curves and production possibilities (`ported/firm.js`); `core.js` the global and the registry, `packs/*.js` each
  pack's registration, `index.js` everything at once for the tests), plus `canvas/src/expr.js` (the small safe formula language it shares with Oomba Canvas). `scripts/build-figures.js` bundles it into
  `public/vendor/oomba-figures/<version>/oomba-figures.js` (with its LICENSE and `manifest.json`) and writes
  `figures/SHIPPED.json`, the lock for it and for the vendored libraries (1.0.0 and 1.1.0 stay byte for byte; 1.1.0 adds the
  number line, the shapes and the notice, 1.2.0 the chemistry kinds and lab readings, 1.3.0 the biology pack and the micropipette, 1.4.0 the economics pack, 1.5.0 organic structures and atomic energy levels in the chem pack, and its LICENSE file carries the Apache License 2.0 after ours; 1.1.0 is minified
  by esbuild, its legal comments kept: the header and each ported file's Apache 2.0 note) (`scripts/vendor-figures.js` copies JSXGraph
  and SmilesDrawer from npm; licences in `docs/third-party.md`).
- Split by subject (since 1.1.0, "The core and its packs" below): `oomba-figures.js` is the core, and `packs/math.js`,
  `packs/data.js`, `packs/physics.js`, `packs/chem.js`, `packs/bio.js` (1.3.0), `packs/econ.js` (1.4.0) and `packs/measure.js` in the same version folder each add their
  kinds; each file has its own pinned tag.
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
a titration's pH comes from the charge balance solved exactly; a number line's ticks, circles and points sit at their
values on a line of fixed length, and a set that runs on past an end gets its own arrow there; a shape's corners come
from its measures (a triangle solved from any three, SSS to SSA), it is scaled to fit as a whole so its proportions are
true, and every mark and stated number on it is true of the measures (a "not drawn to scale" figure says so on it). Rays, lines and a circle's points sit at their true directions (an inscribed angle is half its arc because it is drawn so), a segment's parts at their true lengths, a composite shape's outline is worked out from its parts, and a transformation's image is worked out from its pre-image. A chart is drawn from its data: bar heights, box plot quartiles, pie angles, histogram areas and Venn totals are worked out, never typed in, and a label or summary that states a number must be the true one; branches from one point of a tree diagram add up to 1. Data that cannot be drawn truthfully (the object at the
focal point, a reading between ticks, a Lewis structure whose electrons do not add up) fails `OF.check` and draws a
small "cannot be drawn" card, never a wrong figure.

<!-- builder:rules -->
FIGURE RULES (Oomba Figures: this build needs science, maths or graph figures). Every rule above still applies.
- Draw every science, maths or graph figure with Oomba Figures (and, only where it says, JSXGraph or SmilesDrawer). Never draw one by hand (no SVG or canvas arrows, circuits, atoms, rays or axes of your own), never load another library, a CDN or a picture of a figure. The tags are below: put them before your own script (in a classroom activity, before the Oomba Canvas tag). Oomba Figures draws every kind listed here: its tag (the core), then right after it the tag of each pack your kinds are in (the list of kinds at the end says which pack each needs; a kind whose pack tag is missing draws a "cannot be drawn" card and the self-test fails); add the JSXGraph tag only for OF.board and the SmilesDrawer tag only for OF.structure.
- Correct to scale: give the real numbers (forces in newtons, angles in degrees, the focal length and object distance, the element, the value on the scale) and the figure is drawn from them. Never fake a figure to look right, and never choose numbers it cannot draw truthfully: OF.check(kind, data) lists the problems ([] means fine). Work answers out from the same numbers (OF.solve has the same sums the drawings use).
- The call: const svg = OF.draw(kind, data, { title, lang, hide }); someElement.append(svg). title: what it shows, without the answer (for screen readers). lang: the builder's language (numbers and default words). hide: leave the answer out for the student (true, or the part: "value" for a reading, "electrons" for a Bohr model, "arrows" for orbitals, "rays" or "image" for a ray diagram, "resultant" for vectors, "tension", "meters", "marks", "lone", or a force's name). Figures never mirror in right-to-left languages; their labels read the right way by themselves. Keep them readable on a phone: max-width 100%.
- Kinds and their data (one example each):
  freeBody { body: "box" | "dot", label: "2 kg", forces: [{ name: "W", dir: "down", size: 19.6 }, { name: "N", dir: "up", size: 19.6 }, { name: "F", dir: 30, size: 10 }], net: true } (dir: up, down, left, right or degrees from the right, anticlockwise; size in N)
  vectors { vectors: [{ x: 3, y: 0, label: "a" }, { x: 0, y: 4, label: "b" }], chain: true, resultant: true, unit: "m" } (grid units, y up)
  inclinedPlane { angle: 30, mass: 2, mu: 0.2, components: true } (weight m g down, normal m g cos θ, friction along the slope)
  pulley { type: "atwood" | "table" | "single", masses: [2, 3], show: ["tension", "weight", "acceleration"] }
  rays { type: "convex-lens" | "concave-lens" | "concave-mirror" | "convex-mirror", f: 10, u: 25, h: 4, rays: [1, 2, 3] } (u is not f; the image comes from 1/f = 1/u + 1/v); a plane mirror: { type: "plane-mirror", u: 10, h: 6 } (no f; the image is as far behind as the object is in front; rays [1, 2]; hide: "image")
  circuit { layout: "series" | "parallel", parts: [{ type: "battery", value: "6 V" }, { type: "switch", open: false }, { type: "bulb" }, { type: "resistor", value: "4 Ω" }, { type: "ammeter", value: "0.5 A" }], branches: [[parts], [parts]] (parallel), meters: [{ type: "voltmeter", across: 3, value: "2 V" }] } (parts: cell, battery, bulb, resistor, variable-resistor, switch, ammeter, voltmeter, diode, led, fuse); compound circuits (groups inside groups): { layout: "network", loop: [{ type: "battery", volts: 12 }, { type: "resistor", ohms: 4 }, { parallel: [{ type: "resistor", ohms: 6 }, { series: [{ type: "resistor", ohms: 2 }, { type: "bulb", ohms: 4, voltmeter: true }] }] }, { type: "ammeter" }] } (one cell or battery, in the loop; parts battery, cell, resistor, bulb, switch (open: true), ammeter, fuse; up to 8 parts, groups 3 deep; parts are named R₁, R₂, L...; the ammeters and voltmeters show the currents and voltages worked out; hide: "meters"; OF.solve.circuit gives the total resistance, the current and each part's current and voltage)
  motionGraph { type: "distance-time" | "displacement-time" | "velocity-time", points: [[0, 0], [10, 50], [20, 50]], shade: true, marks: [1, 2] }; or from the motion part by part (then the graphs always agree): { segments: [{ kind: "faster", speed: 4, duration: 4 }, { kind: "forward", speed: 4, duration: 4 }, { kind: "slower", speed: 0, duration: 4 }, { kind: "rest", duration: 3 }], start: 0, type: "position-time" | "velocity-time" | "acceleration-time", marks: true } or graphs: ["position", "velocity", "acceleration"] (stacked on one time axis) (kind: rest, forward, back (constant velocity), faster, slower (to "speed" from the speed before); dir: "back" to speed up backward from rest; an acceleration-time graph is only from segments; OF.solve.motionGraph gives each part's accelerations, positions, the distance and displacement)
  motionMap { segments: [...as above], dt: 1, labels: "times" | "letters", acceleration: true } (a dot every dt at the true position, velocity arrows on one scale, a new row when it turns back; the durations must add up to whole steps of dt; hide: "arrows")
  projectile { speed: 20, angle: 30, height: 0, g: 9.8, positions: 4, letters: true, components: true, gravity: true, marks: ["range", "height", "cliff"] } (angle 5 to 85 from the ground, 0 to 85 from a cliff (height above the ground in m); the real parabola, drawn to scale; OF.solve.projectile gives range, maxHeight, time, vx, vy; hide: "range" (its letter R instead of the value), "path", or true)
  waves { wave: "transverse" | "longitudinal" | "both", amplitude: 3, wavelength: 4, cycles: 2, labels: ["crest", "trough", "compression", "rarefaction"], yunit: "cm" } (along time: axis: "time" with period; marks: ["wavelength", "amplitude"] by default, [] for none; speed gives the frequency in OF.solve.waves; hide: true, "marks", "labels")
  Physics (1.7.0, the physics pack): circularMotion { radius: 2, speed: 4, mass: 1.5 } (view "top" (around "nothing" | "string" | "turntable" | "road", positions 1 to 8, start in degrees, direction "ccw" | "cw") | "vertical" (held "string" | "loop" | "hill" | "dip", at "top" | "bottom" | "side" | "topBottom" | "all") | "conical" (length, angle 15 to 60); speed or period; velocity, acceleration, force, forces, components, letters, values; OF.solve.circularMotion gives acceleration, force, period, omega, contactTop and contactBottom, velocityDir, accelerationDir; hide: "values", "acceleration", "velocity")    fields { setup: "opposite" } (setup "charge" | "opposite" | "like" (sign "+" | "-") | "plates" | "magnet" | "wire" (current "out" | "in"), or charges: [{ q: 1, x: -130, y: 0 }] from the middle, y up; points: [{ name: "P", x: 0, y: 100 }]; lines "fewer" | "normal" | "more"; OF.solve.fields gives points.P.direction ("up", "down", "left", "right"; direction for the first point), strength, stronger, force ("attract" | "repel"); hide: true (no lines), "arrows", "signs")
  lever { class: 1, effortArm: 1.5, loadArm: 0.5, load: 300, loadUnit: "N" } (class 2 has the longer effort arm, class 3 the longer load arm; loadUnit N, lb, kg, g; loadShown "block" | "arrow"; labels: { effort: "?" }; OF.solve.lever gives effort, advantage, class, weight; hide: "effort", "arms", "load", true)    torque { loads: [{ at: 0.3, value: 6 }, { at: 0.9, value: 3, kind: "resting" }] } (support "pivot" (pivot) | "two" (supportA, supportB) | "wall" (cable, cableAt, cableAngle); length, unit; valueUnit N, kg, g with g; beam: its own weight; a load's distanceLabel: "x"; supportForces; OF.solve.torque gives net (clockwise positive), turns, balanceDistance.2, balanceValue.2, forceA, forceB, tension; hide: "distances", "values", "forces", true)
  pendulum { length: 2, angle: 30, mass: 0.5, letters: true } (picture "swing" (A, B, C) | "one" (forces "tensionWeight" | "components"); side; arc, angleMark, heightMark, velocity; OF.solve.pendulum gives period, height, speed, energy, tensionBottom; hide: "height", "length", "angle", "values", true)    spring { k: 200, mass: 2 } (orientation "hanging" | "horizontal"; picture "beforeAfter" | "one" | "positions"; springs 1 to 3 joined "series" | "parallel"; stretch: the drawing's share; extension in m (negative squashes); appliedForce, motion, equilibriumLine; OF.solve.spring gives k (combined), extension, force, energy, period; hide: "force", "extension", "values", true)    rollerCoaster { points: [{ height: 40 }, { height: 10 }, { height: 25 }] } (2 to 8 points, each with a name and mark: true | false | "h"; loop: { at: 3, radius: 8 }; object, objectAt, speed, mass, rough: [2]; OF.solve.rollerCoaster gives speeds.C, fastest, loopMinHeight, makesLoop; hide: "heights", "radius", true)
  grid { x: [-5, 5], y: [-5, 5], points: [{ x: 2, y: 3, label: "A", coords: true }], fns: [{ expr: "2*x - 1", label: "y = 2x − 1" }], segments: [{ from: [0, 0], to: [3, 4] }], shapes: [{ points: [[0, 0], [3, 0], [0, 4]] }] }
  halfLife { halfLife: 5, start: 80, unit: "days", yunit: "g" }
  titration { acid: "weak", base: "strong", pKa: 4.76, ca: 0.1, cb: 0.1, v0: 25 } (flask: "acid" or "base"; never weak with weak)
  bohr { element: "Na", charge: 0 } (H to Ca; give shells for more)    orbitals { element: "Fe", charge: 2 } (H to Kr)
  lewis { molecule: "H2O" } (H2, F2, Cl2, O2, N2, HCl, HF, H2O, NH3, CH4, CCl4, CO2, HCN, C2H4, C2H2, NH4, OH) or { atoms: [{ el: "O", x: 0, y: 0, lone: 2 }, ...], bonds: [{ a: 0, b: 1, order: 1 }], charge: 0 }; style: "dots" draws shared pairs as dots
  reading { type: "thermometer" | "cylinder" | "spring", value: 23.5, min: -10, max: 50, step: 1, major: 10 } (the value on a tick or half way between two; read a cylinder at the bottom of the meniscus); a ruler: { type: "ruler", value: 4.3 (the object's length), start: 0, max: 15, step: 0.1, unit: "cm" } (unit "in": step [1, 8], value [27, 8]; ends on a mark, a cm length also half way; max to 30 cm or 12 in); a vernier caliper: { type: "caliper", value: 23.45 (mm, 0 to 150), leastCount: 0.1 | 0.05 | 0.02, zero: 0.3 (a zero error, drawn closed beside it) }; a micrometer: { type: "micrometer", value: 7.38 (mm, 0 to 25, to 0.01; estimate: true for 0.001), zero: -0.03 }; a spring scale's extras: masses: [100, 50] (grams hanging: the value must be their weight, with g: 9.8 or 10, plus any zero), zero: 0.5 (what it reads unloaded); OF.solve.reading gives value, zero and corrected (and main, k for a caliper; sleeve, thimble for a micrometer)
  Chemistry (1.2.0, the chem pack): massSpectrum { element: "Cl" } (its natural isotopes; or isotopes: [{ mass: 10, abundance: 20 }, { mass: 11, abundance: 80 }] adding up to 100, name; scale: "relative"; missing: 37 a peak to draw; OF.solve.massSpectrum gives mass, the relative atomic mass; hide: "values", "element")    heatingCurve { substance: "water", from: -20, to: 120, mass: 100, x: "time" } (to scale from q = m c ΔT and n ΔH: substance water, ethanol, acetone, mercury, sodiumChloride or x, or your own mp, bp, cSolid, cLiquid, cGas, fusH, vapH, molarMass; to below from is a cooling curve, supercool: 5; x: "heat" in kJ, or "time" at rate kJ/min; OF.solve gives each segment's heat and time, melt, boil; hide: "states", "points")
  energyProfile { levels: [50, 150, 20], catalyst: 100 } (kJ/mol in order: reactants, transition state, [intermediate, transition state,] products: 3, 5 or 7, each transition state a peak; catalyst: the catalyzed transition state, below the highest and above reactants and products; arrows: ["ea", "dh", "eaReverse", "catEa"]; style: "levels" (an energy level diagram); names: { reactants, products }; OF.solve gives dH, ea, eaReverse, steps, rateStep, catEa; hide: "values", "arrows")    nuclide { element: "C", mass: 14, charge: 0 } (any of the 118; or { particle: "alpha" | "beta" | "positron" | "neutron" | "proton" | "gamma" }; notation: "hyphen" | "both"; the mass number is never below Z; OF.solve gives protons, neutrons, electrons; hide: "mass", "Z", "symbol", "charge")
  lineSpectrum { strips: [{ element: "H" }, { element: "Na" }, { name: "Unknown", mix: [0, 1] }] } (elements H, He, Li, Na, K, Ca, Sr, Ba, Cu, Zn, Cd, Hg, Ne, Ar, Kr, or { name, lines: [nm] }; style: "absorption"; from, to in nm; print is black lines on white; hide: "names")    photoelectron { element: "Na", compare: "Mg" } (H to Xe; one peak per sublevel as tall as its electrons at its binding energy; unit "MJ/mol" or "eV", scale "log" or "linear", energies: true; hide: "sublevels", "element")
  dotCross { molecule: "H2O" } (a molecule from the Lewis list without a charge: shells overlap where atoms bond, each atom's electrons its own mark) or { ions: [{ element: "Mg", count: 1 }, { element: "Cl", count: 2 }] } (a metal and a non-metal, charges balanced); OF.solve gives sharedPairs, lonePairs or the ions, transferred; hide: true (empty shells)
  particles { particles: [{ count: 8, shape: "bent", look: { size: "m", shade: "gray" }, outer: { size: "s", shade: "white" }, name: "Water" }], state: "gas" } (shapes single, pair, bent, line, triangle, cross; sizes xs to xl; shades white, light, gray, dark, black; charge "+", "-", "2+"...; state gas, liquid, solid; boxes: 2 with each kind's after count: atoms are conserved; or lattice: { pattern: "alternate", rows: 4, columns: 5, main, second }; every particle must fit; hide: "names")
  Chemistry (1.5.0, the chem pack): skeletal { smiles: "CC(=O)O", name: "Ethanoic acid", formula: true } (an organic structure from SMILES-lite: C N O S P F Cl Br I, R and X for any group, c and n in rings of six, branches, - = #, ring digits, "." between molecules; no brackets, charges or stereo marks; single rings of 3 to 8, never rings that share atoms; or chain: 5 with double: [2], triple, groups: [{ at: 4, group: "OH" }] (OH, NH2, F, Cl, Br, I, CH3, C2H5, =O); or atoms: [{ el: "C", x: 0, y: 0 }] (bond lengths, y up) with bonds: [[1, 2, 2]]; view "skeletal" | "carbons" | "condensed" | "full", layout "zigzag" | "straight", ends, numbers, acids, chiral: [atoms]; hydrogens are worked out from each atom's valence; OF.solve gives formula, atoms.C, atoms.H, hydrogens, mass, unsaturation and groups.alcohol etc.); hide: "name", "formula". It is drawn by Oomba, so it prints and draws on the server: use it, not OF.structure, for worksheets.
  energyLevels { transitions: [{ from: 3, to: 2 }, { from: 4, to: 2 }], series: true } (hydrogen, or z: 2 for He+ and on: E = -13.6 Z²/n² eV, top: the highest n, 2 to 7; or levels: [-10.4, -5.5, -3.7] in eV for any atom; to: "inf" ionizes; cascade: 4 every way down; show "wavelength" | "energy" | "both" | "none"; unit "eV" | "J"; levels too close for an arrow are refused: make height larger; OF.solve gives wavelength (nm), energy (eV), joules, frequency (Hz) of the first transition, and lines); hide: "values", "levels".
  A micropipette is a reading type too (1.3.0): { type: "micropipette", model: "P20", value: 12.5 } (models P2, P10, P20, P100, P200, P1000; a volume the model can be set to; hide: "value").
  The chemistry readings are reading types (the measure pack): { type: "buret", value: 24.65, initial: 1.20, max: 50 } (reads down, to 0.05 mL; OF.solve gives the titre), { type: "beaker", value: 175, max: 250, step: 25 }, { type: "syringe", value: 43.5, max: 100, setup: true }, { type: "balance", value: 24.73, decimals: 2 }, { type: "tripleBeam", value: 347.65 } (to 0.05 g), { type: "thermometer", digital: true, value: 23.4, unit: "°C" | "K" | "°F" }, { type: "pH", meter: "digital" | "analog" | "paper", value: 4.62 } (analog to 0.1, paper whole numbers), { type: "displacement", before: 42, after: 50, max: 100, step: 1, major: 10, object: "rock" | "marbles" } (OF.solve gives the volume). Also bohr { element: "Na", charge: 1, ionMarks: true }, orbitals { element: "Ag", core: true, arrangement: "energy" } (H to Og), halfLife { isotopes: [{ halfLife: 5, name: "A" }, { halfLife: 12, name: "B" }] }, titration { points: [[0, 2.9], [5, 4.1], ...] } (measured pH), and more Lewis molecules: H2S, PH3, PCl3, NF3, OF2, SiH4, CF4, CH3Cl, H2O2, C2H6, HOCl, CO, CN, H3O, HCHO.
  Biology (1.3.0, the bio pack): populationGrowth { model: "logistic", n0: 20, r: 0.4, k: 500, span: 30, unit: "years", inflection: true } (model logistic, exponential, both, overshoot (lag), crash (k is the peak); graph "size" | "rate" | "perCapita", against: "size" for a rate against N; census: { every, noise, seed }; phases: true; OF.solve gives k, maxRate (rK/4), doubling, inflection, final; hide: "k")    predatorPrey { pair: "hare-lynx", names: ["Hares", "Lynx"] } (or prey: { average, start }, predators: { average, start }, period, span; scale: "two" for two axes; OF.solve gives period, lag, each one's high and low; hide: "predators")
  enzymeActivity { graph: "temperature", curves: [{ enzyme: "human" }, { enzyme: "taq" }], axes: "numbered", marks: true } (enzymes human, taq, pepsin, amylase, trypsin, catalase, or { name, opt, width }; graph "pH"; graph "substrate" with curves [{ km: 2, inhibitor: "competitive" }]; OF.solve gives optimum, denatured, vmax, km)    photosynthesis { graph: "light", curves: [{ co2: 0.1, temp: 25 }, { co2: 0.04, temp: 25 }] } (each curve gives the two factors not on the axis: light, co2 (%), temp; graph "co2" or "temperature"; lightAxis: "distance"; net: true; OF.solve gives plateau, saturation, compensation, optimum)
  punnett { parents: [["T", "t"], ["T", "t"]], names: { T: "tall", t: "short" } } (alleles: T, t; C^R, C^W with dominance "incomplete"; I^A, I^B, i with "codominance"; R, r, Y, y for a dihybrid; cross: "x-linked" with X^H, X^h, Y; or letters: ["T"] with parents [[1], [0]]; the ratios are worked out; OF.solve gives genotypes, phenotypes, percents, recessivePercent; hide: "cells", "gametes", "ratios")    pedigree { mode: "ar", seed: 7, generations: 3 } (a random family that fits the mode; or family: "m-F3fcMm-f2mfd", one line: sex m f u, upper case affected, c carrier, d deceased, p proband, then - and the partner and how many children; a family given with a mode must fit it; carriers, numbers, genotypes: true; OF.solve gives fits, tells, modeNumber, genotypes; hide: "genotypes", "affected")
  proteinSynthesis { coding: "ATGGCCTTTAAAGGGTAA", rows: ["template", "mrna", "trna", "amino"] } (or template (3' to 5') or mrna; up to 36 bases; frame "aug" | "first"; codons: n; blanks: { mrna: 50 } with seed; hide: a row)    gel { lanes: [{ ladder: "1kb" }, { label: "Suspect 1", bands: [5200, 3100, 900] }], gel: "1" } (ladders 1kb, 100bp, lambda; gel 0.8, 1, 1.5, 2 %; every band at its distance for its size; values, ruler, look: "glow"; OF.solve gives each band's cm and each sample lane's total; hide: "sizes", "labels")    osmosis { scene: "blood", solutes: [{ name: "salt", inside: 0.9, outside: 3 }], view: "both" } (scenes blood, plant, beaker, utube, bag; cross: true for a solute that passes the membrane; the tonicity, the water's movement and the result are worked out; OF.solve gives tonicity, water, outcome; hide: "tonicity", "arrows", "result")
  cladogram { setup: "vertebrates" } (setup "vertebrates" | "plants" | "apes" | "letters", or taxa: [...] with traits: [...] (a ladder: traits[i] shared by taxa[i] and every taxon after it), or letters: 6, or tree: { trait, children: [{ name }, ...] }; style "diagonal" | "rectangular"; taxaLabels, traitLabels "names" | "blank" | "ticks" | "none"; numbers; mark: ["Jaws"] or [{ trait: 3 }] or [{ tip: 2 }]; OF.solve.cladogram gives shared, first, outgroup, marked.shared, firstTrait, sister; hide: "traits", "taxa", true) (1.7.0, the bio pack)
  Economics (1.4.0, the econ pack; schematic graphs on a hidden 0-to-10 grid unless numbers are given; every equilibrium, quantity and area is worked out from the curves): supplyDemand { shift: { demand: "increase" } } (demand, supply: "normal" | "steep" | "flat" | "vertical" | "horizontal"; numbered: demand { at: 10, slope: -0.1 }, supply { at: 2, slope: 0.1 } or { q: 500 }, or schedule: [[price, qd, qs], ...], a numbered shift is how far across; control: { type: "ceiling" | "floor", at } (schematic: a share of the price axis; numbered: the price); tax: { type: "tax" | "subsidy", amount }; shade: ["cs", "ps", "dwl", "revenue"]; OF.solve gives equilibrium, after, control (qd, qs, shortage or surplus), tax (buyers, sellers, quantity), cs, ps, dwl, revenue; hide: "values", "after", "areas", "names")    moneyMarket { graph: "money" | "funds" | "reserves", regime: "ample" | "limited", shift: { supply: "increase", demand: "decrease" } } (OF.solve gives rate, quantity, after, rateChange; hide: "values", "after")
  businessCycle { cycles: 2, start: "peak", shade: true, phases: ["expansion", "contraction", "recession", "recovery"] } (cycles 1 to 4 by halves; amplitude, trend, irregularity with seed; style: "letters" for a quiz; OF.solve gives peaks, troughs, recessions, letters; hide: "labels")    phillipsCurve { movement: "along", along: "up", longRun: true } (movement "srpc" with side and cause "shock" | "expectations", "lrpc" with side; numbered in %: { nru: 5, expected: 2, u2: 3, pi2: 6, ... }; OF.solve gives A, B, C (u, inflation), nruAfter, expectedAfter; hide: "values", "after")
  possibilitiesCurve { points: [{ name: "A", at: 0.2 }, { name: "B", place: "inside", at: 0.5 }], steps: true } (shape "out" | "straight" | "in"; xMax, yMax for numbers; shift: { which: "both" | "x" | "y", dir: "out" | "in" }; or countries: [{ name: "Country A", x: 40, y: 20 }, { name: "Country B", x: 30, y: 30 }], goods: ["Wheat", "Cloth"], layout: "side"; OF.solve gives points (status), steps (opportunity cost), countryA, countryB (costX, costY), advantageX, advantageY)    adAs { start: "recession", shift: { ad: "full" } } (as: "three" for the Keynesian curve; shift ad, sras "left" | "right" | "full", lras "left" | "right"; numbered: schedule: [[price level, AD, AS], ...], potential; OF.solve gives start, end, potential, gap, gapSize, gapType; hide: "values", "after", "gap")    costCurves { market: "perfect", price: "profit", shade: ["profit"] } (market "costs" | "perfect" | "monopoly" | "monopolistic"; atc: { q, cost } where ATC bottoms out, mcSlope, fixed; price: "profit" | "breakeven" | "loss" | "shutdownPoint" | "shutdown" or a number; demand: { top, end } and regulation "optimal" | "fair" for a monopoly; run "long" for a monopolistic competitor; OF.solve gives q, price, atc, profit, breakEven, shutdown, socialOptimum, fairReturn, cs, dwl, excessCapacity; hide: "values", "areas", "names")
  numberLine { from: -5, to: 5, step: 1, every: 1, intervals: [{ from: -3, to: 4, fromClosed: false }], points: [{ at: [3, 4], label: "P" }], sequence: { expr: "1/n", from: 1, to: 5 } } (a value is a number, a fraction [n, d] or { pi: k }; leave out an interval's from or to to run off that end; ends are closed unless fromClosed or toClosed is false; every: a number at every nth tick; numbering: "decimal" | "fraction" | "pi" | "degree"; hide: true for a numbered line to graph on, "graph", "points", "values"). A line for the student to tap or jump on is the Oomba Canvas tool (numberline.point, numberline.jump), not a figure.
  triangle { AB: 3, BC: 4, B: 90, labels: { CA: "x" } } (any three of the angles A, B, C and the sides AB, BC, CA that make a triangle; more must agree; other: true for the second triangle of the ambiguous case)
  rectangle { AB: 12, BC: 5, unit: "cm" } (a square: { AB: 6, square: true })    parallelogram { AB: 12, DA: 10, A: 30, heights: ["D"], labels: { hD: true } } (a rhombus: { AB: 6, A: 70, rhombus: true })
  trapezoid { AB: 14, CD: 8, h: 4, A: 60 } (bases AB at the bottom and CD; type: "isosceles" with AB, CD, h; type: "right" with AB, CD, DA)    kite { AB: 6, DA: 10, B: 110 } (short sides AB = BC, long sides CD = DA, B the angle between the short sides)
  regularPolygon { n: 6, side: 8, lines: ["apothem"], labels: { apothem: "a" } } (n 3 to 20; one of side, radius, apothem; lines: "apothem", "radius", "radii"; center: false hides the dot)
  The shapes also take: names (["P", "Q", "R"], { A: "P" } or false), labels ({ part: true (its measure), false, or a math label }; given measures show theirs, worked-out ones nothing; a right angle shows its square), ticks, arcs, arrows ({ part: 1 to 3 }, only on sides or angles that really are equal or parallel), heights (["C"]), diagonals (["AC", "BD"]), cross (the name where they cross), unit, round (0 to 2), size, base (the side along the bottom), rotate, flip, rightAngles: false. A length is a number, a fraction [n, d] or { sqrt: 5, times: 3 } (3√5). A math label is a number, a string (letters italic: "x + 3", "2x", "A'") or a list of pieces: [3, { sqrt: 2 }], ["x", { sup: 2 }], ["a", { sub: 1 }], { frac: [1, 2] }, { pi: 1 }, { text: "words" }. A label that states a number must state the true measure; a test figure "not drawn to scale": notToScale: true (the note is printed on it) and drawAs: { the same kind of measures, the proportions to draw }. hide: true (no measures; names and marks stay), a part ("CA", "B", "hC", "apothem"), "sides", "angles", "heights". OF.solve.triangle(data) (and rectangle, ...) gives the angles, sides, perimeter and area.
  angles { rays: [0, 35, 90], vertex: "O", angles: [{ from: 0, to: 1, label: 35 }, { from: 1, to: 2, label: "x" }] } (rays: directions in degrees, 0 to the right, counterclockwise, or { dir, name }; an angle runs counterclockwise from ray "from" to ray "to"; label true writes its measure; a 90° angle shows its square; four rays 0, 50, 180, 230 make two lines crossing: vertical angles)
  parallelLines { lines: ["m", "n"], transversals: [{ angle: 65, name: "t" }], angles: [{ number: 2, label: 65 }, { number: 8, label: "x" }] } (the angles numbered 1 to 4 round each crossing, top crossing first: 1 above left, 2 above right, 3 below left, 4 below right; or { line, transversal, pos: "above-right" }; numbered: true writes the numbers; a line { name, tilt: 6 } is not parallel, for "are these parallel?"; parallel arrows only on lines that are parallel)
  segmentAddition { points: ["A", "B", "C"], unknown: { x: 6 }, parts: [{ expr: [2, 1] }, { expr: [3, -4] }], spans: [{ from: "A", to: "C", label: 27 }] } (a part is { length: 5 } or { expr: [a, b] } for a·x + b, written "2x + 1", worked out at the unknown's value; spans are braces under the line, label true writes the sum; ticks: equal parts; a midpoint is equal ticks either side; cross: { at: "M", angle: 90, name: "ℓ" } a line crossing there; start/end: "arrow" for a ray or a line)
  circle { radius: 6, unit: "cm", points: [{ name: "A", at: 210 }, { name: "B", at: 330 }, { name: "C", at: 100 }], lines: [{ from: "O", to: "A" }, { from: "O", to: "B" }, { from: "C", to: "A" }, { from: "C", to: "B" }], angles: [{ at: "O", from: "A", to: "B" }, { at: "C", from: "A", to: "B", label: "x" }] } (the center is O; a point's "at" is its direction from O in degrees, "dist" its distance in radii, 1 by default; lines: { from, to, extend: "both" } a secant, { tangent: "A" }, { tangentFrom: "P", side: "left", touch: "T" }; crossings: [{ name: "E", lines: [0, 1] }]; arcs: [{ from: "A", to: "B", label: true (degrees) or length: true }], counterclockwise from "from"; sectors and segments: [{ from, to }] shaded)
  compositeShape { parts: [{ rect: [0, 0, 8, 3] }, { rect: [0, 3, 3, 4] }], sides: true, unit: "m" } (parts: rect [x, y, w, h], tri [[x, y] x 3], semicircle [[x, y], [x, y]] (it bulges to the left going from the first end to the second), circle [x, y, r]; cut: true cuts a part out; parts join side to side and never overlap; sides: true labels every straight side of the outline; labels: [{ from: [x, y], to: [x, y], label }] for one side; splits: [{ from, to, label }] dashed lines inside; radius: true on a circle or semicircle; shade: true for a shaded region)
  The grid also takes (1.1.0): xstep, ystep, a range or step as a fraction [n, d] or { pi: k }, numbering ("decimal", "fraction", "pi", "degree"; or xnumbering, ynumbering), xtitle, ytitle; fns with fromClosed, toClosed (true closed, false open: a piecewise function is several fns with from and to), holes: [x], dash; verticals: [{ x: 3, label }]; asymptotes: [{ x: 1 }, { y: 2 }]; inequalities: [{ expr: "2*x + 1", sign: ">" }, { x: 3, sign: "<=" }] (shaded on their side, dashed when strict); points with open: true; a shape's names: ["A", "B", "C"] and transform: { translate: [3, -2] } | { reflect: "x-axis" | "y-axis" | "y=x" | "y=-x" | { x: 1 } | { y: -1 } } | { rotate: 90 (counterclockwise; -90 clockwise; 180, 270), about: [0, 0] } | { dilate: 2, about: [0, 0] }, or a list of up to 3 (the image is worked out and drawn dashed with primes A′, A″; never give image points). Trig in the formula language is in degrees: with numbering "pi", write sin(x*180/pi). hide: "image" leaves the image for the student to draw. Trig is in degrees; a grid (or table of values) in radians says angles: "radians" and then sin(x) takes x in radians (generator formulas, gen, stay in degrees).
  Data displays (one example each): barGraph { categories: ["Soccer", "Tennis"], values: [12, 4], ytitle: "Students" } (double bars: series: [{ name: "Boys", values }, { name: "Girls", values }]; stacked: true; direction: "bars"; from is 0; labels: { "Tennis": "x" }); hide: "values" or a category (that bar left to draw)
  dotPlot { data: [7, 8, 8, 9] } or { counts: [[1, 3], [2, 5]] } (values on ticks: from, to, step, a fraction [1, 8] allowed; mark: "x")    histogram { bins: [[0, 10], [10, 15], [15, 20]], counts: [8, 10, 14] } or { bins, data } (unequal bins are drawn as frequency density; polygon: true); hide: "bin2", "scale"
  boxPlot { data: [...], outliers: true } or { summary: [min, Q1, median, Q3, max] } or { plots: [{ name, data or summary }] } (quartiles the TI-84 way; values: true writes them; a summary given with data must agree); hide: "median", "q1", ...
  scatterPlot { points: [[1, 52], [2, 58]], x: [0, 10], y: [40, 100], fit: true, equation: true, r: true } (the least-squares line, never by eye); hide: "fit", "equation"    stemAndLeaf { data: [56, 62, 65], leaf: 1, key: true } (data2 and names: back to back; split: true; leaf: 0.1 for decimals); hide: true (stems only)
  pieChart { slices: [{ name: "Walk", value: 12 }], show: ["name", "percent"] } (show: name, value, percent, angle, fraction; key: true; labels: { "Bike": "x" }); hide: a slice's name    cumulativeFrequency { bins: [[0, 10], [10, 20]], counts: [4, 10], readings: ["median", "q1", "q3"], at: [15] } (join: "curve" or "lines"; cumulative: [...] for a cumulative table; percent: true); hide: "curve", "readings"
  normalCurve { mean: 100, sd: 15, regions: [{ from: 130 }], z: true } (a region { from, to }, one end left out for a tail; form: "percent" or "decimal"; a region's label must be its area); hide: "areas"
  Probability and tables: treeDiagram { stages: ["1st", "2nd"], branches: [{ name: "R", p: [3, 5], then: [{ name: "R", p: [2, 4] }, { name: "B", p: [2, 4] }] }, { name: "B", p: [2, 5], then: [...] }] } (p a decimal or a fraction [n, d]; branches from one point add up to 1; repeat: 2 for the same branches each stage; the outcomes and their products are worked out); hide: "products", "probabilities", or a path "B,R"
  vennDiagram { sets: ["Cat", "Dog"], counts: { A: 9, B: 7, AB: 4, none: 5 } } (3 sets: A, B, C, AB, AC, BC, ABC, none; or members: [[2, 4, 6], [3, 6]] with universe: [1, ..., 10]; shade: ["AB", { in: ["A"], out: ["B"] }]; totals: { A: 13, all: 25 } must add up; labels: { AB: "x" }); hide: a region, or true
  twoWayTable { columns: ["Bus", "Walk"], rows: ["Grade 7", "Grade 8"], counts: [[12, 18], [8, 22]] } (totals worked out; show: "counts", "joint", "row", "column"; form: "decimal", "percent", "fraction"; blanks: [[row, col]] from 0, totals last)    tableOfValues { rule: "2*x + 1", from: -2, to: 3, blanks: [3, 4] } (or x: [list], or pairs: [[x, y]] that must follow the rule; names: ["Figure number", "Tiles"]; direction: "columns"); hide: "y"
  3D solids, drawn to scale in oblique projection, hidden edges dashed: prism { length: 8, width: 3, height: 5, unit: "cm" } (base: "rectangle" | "right" (triBase, triHeight) | "isosceles" (triBase, triHeight) | "regular" (sides 3, 5 to 8, side); a cube is length = width = height; a square base is "rectangle", never regular with 4 sides)    cylinder { radius: 4, height: 10 } (or diameter)    pyramid { length: 6, width: 6, height: 4 } (base "rectangle" or "regular"; height or slant, or both if they agree)    cone { radius: 5, height: 12 } (or slant)    sphere { radius: 6 } (hemisphere: true; bowl: true)
  Solids also take oblique: true with lean (and for a prism or cylinder any two of height, lean, edge), leanTo, depth ("right" | "left"), pose ("stand" | "lie", a prism), names: true (corners), labels { part: true | false | a label } (parts: length, width, triBase, triHeight, hyp, side, apothem, radius or diameter, height, lean, edge, slant; given measures show theirs; labels: { "apothem": true } draws the apothem), hidden: false (no hidden edges), showHeight: false, notToScale with drawAs, unit, round. A label that states a number must be the true measure (a slant height labeled 13 must be √(h² + r²)). hide: true or a part. OF.solve.prism(data) (and the others) gives volume, surfaceArea, lateralArea, baseArea, slant height, and exact: { volume: { pi: 12 } } for round solids.
  net { solid: "cube", side: 4, net: 1 } (the 11 cube nets, 1 is the cross; or cells: six [column, row] squares, refused unless they fold into a cube) or { solid: "prism" | "pyramid" | "cylinder" | "cone", and that solid's measures } (fold: "solid"; faces: "names" | "areas" | "both"; shade: true; tabs: true; labels as solids, plus slantW, circ, angle (a cone's sector)); OF.solve.net gives each face's area and the surface area; hide: "areas" or a part
  mappingDiagram { inputs: [1, 2, 3], outputs: [3, 5, 7], arrows: [[1, 3], [2, 5], [3, 7]], rule: "2*x + 1" } (items: numbers or labels; an arrow joins two listed items; a rule, when given, must be what every arrow does; shape: "oval" | "box" | "none"; titles: ["x", "y"] or false); hide: "arrows" (true) or "outputs"; OF.solve.mappingDiagram says function (and why not), oneToOne, onto, domain, range, inverse
  protractor { angle: 50, reading: true } (whole degrees 1 to 180; base: "right" reads the inner scale, "left" the outer; start: 20 for an angle that does not start on 0; names: ["A", "B", "C"]); hide: "reading"
  Every chart also takes heading (a title drawn on it) and, where it has axes, xtitle and ytitle; in print, series are told apart by gray, white and hatched fills. OF.solve.barGraph(data) (and every kind above) gives the numbers: mean, median, mode, quartiles, IQR, range, totals, areas, outcome probabilities, P(A|B), the pairs.
  These geometry kinds take names, labels, ticks, arcs and arrows only where true (as the shapes do), unit, round, size, turn, rightAngles: false, and hide: true (no measures; names and marks stay) or a group ("angles", "parts", "spans", "lines", "arcs", "sides", "splits", "radius"). OF.solve.angles(data) (and parallelLines, segmentAddition, circle, compositeShape, grid) gives the numbers.
  OF.structure("CCO", { title }) a skeletal structure drawn by SmilesDrawer in the browser only (for a structure skeletal refuses, such as fused rings; never on a printed sheet); OF.board(element, { x: [-5, 5], y: [-5, 5] }) a JSXGraph board in the Oomba colours (an interactive graph: then board.create("functiongraph", [x => x * x]) etc.).
- In a classroom activity (Oomba Canvas 1.2.0): a figure question is a problem { tool: "figure.number", q: "What is the reading?", fig: { kind: "reading", type: "thermometer", value: 23.5, min: -10, max: 50, step: 1, hide: "value" }, answer: 23.5, dp: 1, unit: "°C", work: ["The liquid stops half way between 23 and 24.", "The reading is 23.5 °C."] } or { tool: "figure.choice", q, fig, choices: ["real", "virtual"], answer: 1, work: [...] }. fig is the figure's data with "kind" (and "hide" to leave the answer out). work is the worked answer the answer key prints: 1 to 6 short lines, the last one ending on the answer. Answers are numbers 0 or more (say a direction in words); dp is the decimal places the student types.
- A figure question generator: gen { tool: "figure.number", vars: { m: [2, 10], a: [2, 5] }, where: "m*a <= 40", q: "A {m} kg cart speeds up at {a} m/s². What is the net force on it?", fig: { kind: "freeBody", body: "box", label: "{m} kg", forces: [{ name: "F", dir: "right", size: "{=m*a}" }], hide: "forces" }, answer: "m*a", dp: 0, unit: "N", work: ["F = m × a", "= {m} × {a}", "= {=m*a} N"] }. vars: [lo, hi], [lo, hi, step] or { "of": [values] }; in text "{m}" is a value and "{=formula}" a worked-out number; in fig a string that is only "{m}" or "{=formula}" becomes that number. Formulas: + − * / ^, brackets, sqrt, abs, round(x, dp), min, max, sin, cos, tan (degrees), log, ln, if(test, a, b).
- The self-test checks every figure (OF.check on each problem, and on three sets from a generator) and that the page loads the pinned Oomba Figures tag and the tag of each pack its kinds need: a version with a wrong figure or a missing pack is not saved, and the reply names it.
- In an arcade game: show the figure on the question card (append OF.draw(...)), ask about it, and work the right answer out from the same data.
<!-- /builder -->

## Kinds

| Kind | Data | Hide |
| --- | --- | --- |
| `freeBody` | `forces: [{ name, dir, size }]`, `body`, `label`, `net` | a force's name, `forces`, `net` |
| `vectors` | `vectors: [{ x, y, label, from }]`, `chain`, `resultant`, `grid`, `unit` | `resultant` |
| `inclinedPlane` | `angle` 5–70, `mass`, `g`, `mu` or `friction`, `applied`, `components`, `labels` | `values`, `angle` |
| `pulley` | `type`, `masses`, `mu`, `show` | `tension`, `acceleration` |
| `rays` | `type`, `f`, `u`, `h`, `rays`, `labels`; since 1.1.0 `type: "plane-mirror"` with `u`, `h`, `rays` (1, 2), `normals` | `rays`, `image` |
| `circuit` | `layout`, `parts`, `branches`, `meters`; since 1.1.0 `layout: "network"` with `loop` (parts with `volts`, `ohms`, `open`, `voltmeter`, `name`; `{ series }`, `{ parallel }`), `names`, `values` | `meters` |
| `motionGraph` | `type`, `points`, `tmax`, `ymax`, `shade`, `marks`, units and labels; since 1.1.0 `segments` (`kind`, `speed`, `duration`, `dir`), `start`, `type` (also `position-time`, `acceleration-time`) or `graphs` | `line`, `area` |
| `motionMap` | `segments`, `start`, `dt`, `labels`, `arrows`, `acceleration`, `numbers`, `heading` | `true` / `arrows`, `positions` |
| `projectile` | `speed`, `angle`, `height`, `g`, `positions`, `letters`, `path`, `velocity`, `components`, `gravity`, `angleMark`, `marks`, `unit`, `heading` | `true`, `path`, `range`, `height`, `cliff` |
| `waves` | `wave`, `axis`, `amplitude`, `wavelength` or `period`, `speed`, `cycles`, `marks`, `labels`, `xunit`, `yunit`, `heading` | `true`, `marks`, `labels` |
| `circularMotion` (1.7.0) | `view`, `radius`, `speed` or `period`, `mass`, `g`, `around`, `positions`, `start`, `direction`, `held`, `at`, `angle`, `length`, `object`, `velocity`, `acceleration`, `force`, `forces`, `components`, `radiusMark`, `letters`, `values`, `heading` | `true`, `values`, `acceleration`, `velocity` |
| `fields` (1.7.0) | `setup` or `charges: [{ q, x, y }]`, `sign`, `current`, `lines`, `fieldLines`, `arrows`, `points: [{ name, x, y }]`, `heading` | `true`, `arrows`, `signs` |
| `lever` (1.7.0) | `class`, `effortArm`, `loadArm`, `unit`, `load`, `loadUnit`, `loadShown`, `names`, `values`, `arms`, `labels`, `heading` | `effort`, `arms`, `load`, `true` |
| `torque` (1.7.0) | `support`, `length`, `unit`, `pivot`, `supportA`, `supportB`, `loads: [{ at, value, kind, label, distanceLabel }]`, `valueUnit`, `g`, `beam`, `distances`, `supportForces`, `cable`, `cableAt`, `cableAngle`, `values`, `lengthMark`, `heading` | `distances`, `values`, `forces`, `true` |
| `pendulum` (1.7.0) | `picture`, `angle`, `side`, `length`, `mass`, `g`, `arc`, `angleMark`, `heightMark`, `letters`, `forces`, `velocity`, `values`, `heading` | `true`, `values`, `height`, `length`, `angle` |
| `spring` (1.7.0) | `orientation`, `picture`, `springs`, `joined`, `stretch`, `k`, `extension`, `mass`, `g`, `object`, `coils`, `extensionMark`, `lengthMark`, `equilibriumLine`, `appliedForce`, `motion`, `moving`, `values`, `heading` | `true`, `force`, `extension`, `values` |
| `rollerCoaster` (1.7.0) | `points: [{ height, name, mark }]`, `unit`, `loop: { at, radius }`, `object`, `objectAt`, `speed`, `mass`, `g`, `ground`, `rough`, `velocity`, `values`, `heading` | `heights`, `radius`, `true` |
| `grid` | `x`, `y`, `step`, `points`, `segments`, `fns`, `shapes`; since 1.1.0 `xstep`, `ystep`, `numbering`, `xtitle`, `ytitle`, `inequalities`, `verticals`, `asymptotes`, a function's `fromClosed`, `toClosed`, `holes`, a shape's `names` and `transform` | `labels`, `image`, `true` (a blank grid) |
| `halfLife` | `halfLife`, `start`, `tmax`, `unit`, `yunit`; 1.2.0 `isotopes` (up to 3) | `marks` |
| `titration` | `acid`, `base`, `flask`, `ca`, `cb`, `v0`, `vmax`, `pKa`, `pKb`; 1.2.0 `points` (measured) | `marks` |
| `bohr` | `element` or `Z`, `charge`, `shells`; 1.2.0 `ionMarks` | `electrons`, `nucleus` |
| `orbitals` | `element` or `Z`, `charge`; 1.2.0: H to Og, `core`, `arrangement` | `arrows` |
| `lewis` | `molecule`, or `atoms` + `bonds` + `charge`; `style` | `lone`, `true` (atoms only) |
| `reading` | `type`, `value`, `min`, `max`, `step`, `major`, `unit`; a ruler (1.1.0): `type: "ruler"`, `value`, `start`, `max`, `step`, `unit`; a caliper (1.1.0): `type: "caliper"`, `value`, `leastCount`, `zero`; a micrometer (1.1.0): `type: "micrometer"`, `value`, `estimate`, `zero`; a spring scale's `masses`, `g`, `zero` (1.1.0); 1.2.0: `type: "buret"` (`value`, `max`, `initial`), `"beaker"`, `"syringe"` (`setup`), `"balance"` (`decimals`, `pan`), `"tripleBeam"`, `"pH"` (`meter`, `decimals`), `"displacement"` (`before`, `after`, `object`, `count`), a thermometer's `digital` and `decimals` | `value` |
| `triangle` | any three of `A`, `B`, `C` (degrees), `AB`, `BC`, `CA` (lengths); `other`; and the shape options below | `true` (no measures), a part, `sides`, `angles`, `heights` |
| `rectangle` | `AB`, `BC`; or `AB` with `square: true` | as for a triangle, and `diagonals` |
| `parallelogram` | `AB`, `DA`, `A`; or `AB`, `A` with `rhombus: true` | as for a rectangle |
| `trapezoid` | `AB`, `CD`, `h`, `A`; `type: "isosceles"` with `AB`, `CD`, `h`; `type: "right"` with `AB`, `CD`, `DA` | as for a rectangle |
| `kite` | `AB` (= `BC`), `DA` (= `CD`), `B` | as for a rectangle |
| `regularPolygon` | `n` 3 to 20 and one of `side`, `radius`, `apothem`; `lines`, `center`, `centerName`, `ticks`, `arcs`, `names: true` | `true`, `side`, `angle`, `apothem`, `radius` |
| `angles` | `rays` (degrees or `{ dir, name, arrow }`), `angles: [{ from, to, label, arcs }]`, `vertex`, `arrows`, `turn`; `notToScale` with `drawAs` | `true`, `angles` |
| `parallelLines` | `lines` (a count, names, or `{ name, tilt, arrows }`), `transversals: [{ angle, at, name, arrows }]`, `angles: [{ number }` or `{ line, transversal, pos }`, `label, arcs }]`, `numbered`, `points`, `arrows` | `true`, `angles` |
| `segmentAddition` | `points`, `parts: [{ length }` or `{ expr: [a, b] }`, `label, ticks }]`, `unknown: { x }`, `spans: [{ from, to, label` or `expr }]`, `start`, `end`, `cross`; `notToScale` with `drawAs` | `true`, a part (`"AB"`), `parts`, `spans` |
| `circle` | `radius`, `unit`, `center`, `points: [{ name, at, dist }]`, `lines`, `crossings`, `angles: [{ at, from, to, label, reflex }]`, `arcs`, `sectors`, `segments` | `true`, `lines`, `angles`, `arcs` |
| `compositeShape` | `parts: [{ rect` / `tri` / `semicircle` / `circle, cut, radius }]`, `sides`, `labels`, `splits`, `shade`, `unit` | `true`, `sides`, `splits`, `radius` |
| `numberLine` | `from`, `to`, `step`, `every`, `numbering`, `size`, `values`, `intervals: [{ from, to, fromClosed, toClosed, set }]`, `points: [{ at, label, value, mark, set }]`, `sequence: { expr, from, to, mark, set }` | `true` (the numbered line only), `graph`, `points`, `values` |
| `barGraph` | `categories`, `values` or `series: [{ name, values }]`, `stacked`, `direction`, `to`, `step`, `labels`, `heading`, `xtitle`, `ytitle` | `true`, `values`, a category |
| `dotPlot` | `data` or `counts: [[value, count]]`, `from`, `to`, `step`, `mark`, `numbering`, `heading`, `xtitle` | `true`, `data` |
| `histogram` | `bins: [[lo, hi]]` with `counts` or `data`, `holds`, `density`, `polygon`, `step`, `ystep`, titles | `true`, `bin1`..., `scale`, `polygon` |
| `boxPlot` | `data` and/or `summary`, or `plots: [{ name, data, summary }]`; `outliers`, `values`, `from`, `to`, `step`, titles | `min`, `q1`, `median`, `q3`, `max` (their values) |
| `scatterPlot` | `points: [[x, y]]`, `x`, `y`, `xstep`, `ystep`, `fit`, `equation`, `r`, `dp`, titles | `true`, `fit`, `equation`, `r`, `points` |
| `stemAndLeaf` | `data`, `data2`, `names`, `leaf`, `split`, `key`, `unit`, `heading` | `true`, `leaves`, `key` |
| `pieChart` | `slices: [{ name, value }]`, `show`, `key`, `dp`, `labels`, `heading` | `true`, `labels`, a slice's name |
| `cumulativeFrequency` | `bins` with `counts`, `data` or `cumulative`; `join`, `readings`, `at`, `percent`, `step`, `ystep`, titles | `true`, `curve`, `readings`, `median`, `q1`, `q3` |
| `normalCurve` | `mean`, `sd`, `regions: [{ from, to, label }]`, `form`, `dp`, `z`, `reach`, `values`, `marks`, `heading`, `xtitle` | `true`, `areas`, `region1`..., `values` |
| `treeDiagram` | `branches: [{ name, p, then, label }]`, `repeat`, `stages`, `outcomes`, `products`, `heading` | `true`, `probabilities`, `products`, a path (`"B,R"`) |
| `vennDiagram` | `sets`, `counts` or `members` (+ `universe`), `totals`, `labels`, `shade`, `show`, `heading` | `true`, `counts`, a region (`"AB"`) |
| `twoWayTable` | `columns`, `rows`, `counts`, `totals`, `show`, `form`, `dp`, `blanks`, `labels`, `corner`, `heading` | `true`, a cell (`"0,1"`) |
| `tableOfValues` | `rule` with `x` or `from`, `to`, `step`; or `pairs`; `names`, `direction`, `blanks`, `dp`, `numbering`, `angles`, `heading` | `true`, `y`, `y0`... |
| `protractor` | `angle`, `base`, `start`, `names`, `reading` | `true`, `reading` |
| `prism` | `base`, `length`, `width` / `triBase`, `triHeight` / `sides`, `side`; `height`; `oblique`, `lean`, `edge`, `leanTo`, `pose`, `depth`, `names`, `labels`, `hidden`, `showHeight`, `notToScale` with `drawAs` | `true`, a part |
| `cylinder` | `radius` or `diameter`, `height`; `oblique`, `lean`, `edge`, `leanTo`, `labels`, `hidden`, `showHeight`, `notToScale` with `drawAs` | `true`, a part |
| `pyramid` | `base` (`rectangle` or `regular`), `length`, `width` / `sides`, `side`; `height` and/or `slant`; `oblique`, `lean`, `leanTo`, `depth`, `names`, `labels`, `hidden`, `showHeight`, `notToScale` with `drawAs` | `true`, a part |
| `cone` | `radius` or `diameter`, `height` and/or `slant`; `oblique`, `lean`, `leanTo`, `labels`, `hidden`, `showHeight`, `notToScale` with `drawAs` | `true`, a part |
| `sphere` | `radius` or `diameter`, `hemisphere`, `bowl`, `labels`, `hidden`, `notToScale` | `true`, `radius`, `diameter` |
| `net` | `solid` (`cube`, `prism`, `pyramid`, `cylinder`, `cone`); a cube's `side` with `net` (1 to 11) or `cells`; or the solid's measures; `fold`, `faces`, `shade`, `tabs`, `labels` | `true`, `areas`, a part |
| `mappingDiagram` | `inputs`, `outputs`, `arrows: [[input, output]]`, `rule`, `shape`, `titles`, `heading` | `true` / `arrows`, `outputs` |
| `massSpectrum` (1.2.0) | `element` or `isotopes: [{ mass, abundance }]` + `name`, `scale`, `values`, `missing`, `x`, `heading` | `values`, `element`, `true` |
| `heatingCurve` (1.2.0) | `substance` (or `mp`, `bp`, `cSolid`, `cLiquid`, `cGas`, `fusH`, `vapH`, `molarMass`), `from`, `to`, `mass`, `x`, `rate`, `supercool`, `labels`, `marks`, `heading` | `states`, `points`, `true` |
| `energyProfile` (1.2.0) | `levels` (3, 5 or 7), `catalyst`, `unit`, `style`, `arrows`, `names`, `heading` | `values`, `arrows`, `true` |
| `nuclide` (1.2.0) | `element` + `mass` + `charge`, or `symbol` + `Z` + `mass`, or `particle` + `symbol`; `notation` | `mass`, `Z`, `symbol`, `charge`, `true` |
| `lineSpectrum` (1.2.0) | `strips: [{ element } \| { name, lines } \| { name, mix }]`, `style`, `from`, `to`, `strength`, `heading` | `names`, `true` |
| `photoelectron` (1.2.0) | `element`, `compare`, `unit`, `scale`, `sublevels`, `energies`, `heading` | `sublevels`, `element`, `true` |
| `dotCross` (1.2.0) | `molecule` (or `atoms` + `bonds`, no charge), or `ions: [{ element, count }]` (a metal and a non-metal) | `true` |
| `skeletal` (1.5.0) | `smiles`, or `chain` with `double`, `triple`, `groups`, or `atoms` + `bonds`; `view`, `layout`, `ends`, `rings`, `acids`, `reverse`, `numbers`, `flip`, `chiral`, `name`, `formula` | `name`, `formula`, `true` |
| `energyLevels` (1.5.0) | `z`, `top` or `levels`; `transitions` or `cascade`; `show`, `unit`, `series`, `ionization`, `height`, `heading` | `values`, `levels`, `true` |
| `populationGrowth` (1.3.0) | `model`, `n0`, `r`, `k`, `lag`, `span`, `unit`, `graph`, `against`, `census`, `kLine`, `inflection`, `phases`, `names`, `heading` | `k`, `curve`, `true` |
| `predatorPrey` (1.3.0) | `pair`, or `prey` + `predators` (`average`, `start`) + `period`; `span`, `unit`, `scale`, `names`, `peaks`, `heading` | `predators`, `true` |
| `enzymeActivity` (1.3.0) | `graph` (`temperature`, `pH`, `substrate`), `curves` (`enzyme`, or `opt` + `width`; or `km`, `inhibitor`, `strength`), `axes`, `unit`, `marks`, `x` | `marks`, `curves`, `true` |
| `photosynthesis` (1.3.0) | `graph` (`light`, `co2`, `temperature`), `curves` (`light`, `co2`, `temp`, `name`), `lightAxis`, `net`, `axes`, `marks`, `x` | `marks`, `curves`, `true` |
| `punnett` (1.3.0) | `parents` (allele tokens) or `letters` + `parents` (counts); `cross`, `dominance`, `names`, `show`, `form`, `heading` | `cells`, `gametes`, `ratios`, `true` |
| `pedigree` (1.3.0) | `family` (one line) or `seed` + `generations` + `size`; `mode`, `carriers`, `numbers`, `numerals`, `genotypes`, `letter` | `genotypes`, `affected`, `true` |
| `proteinSynthesis` (1.3.0) | `coding`, `template` or `mrna`; `rows`, `frame`, `codons`, `names`, `blanks`, `seed` | a row's name, `true` |
| `gel` (1.3.0) | `lanes: [{ ladder } \| { label, bands }]`, `gel`, `look`, `sizes`, `values`, `ruler`, `electrodes`, `numbers` | `sizes`, `labels`, `values`, `true` |
| `osmosis` (1.3.0) | `scene`, `solutes: [{ name, inside, outside, cross }]`, `unit`, `view`, `particles`, `arrows`, `labels`, `burst`, `seed` | `tonicity`, `arrows`, `result`, `true` |
| `cladogram` (1.7.0) | `setup`, `tree`, `taxa` + `traits`, or `letters`; `style`, `taxaLabels`, `traitLabels`, `numbers`, `mark`, `heading` | `traits`, `taxa`, `true` |
| `supplyDemand` (1.4.0) | `demand`, `supply` (a shape; numbered `{ at, slope }` or `{ q }`) or `schedule`; `shift`, `control`, `tax`, `shade`, `x`, `y`, `guides`, `star`, `from`, `labels`, titles | `values`, `after`, `areas`, `names`, `true` |
| `moneyMarket` (1.4.0) | `graph` (`money`, `funds`, `reserves`), `regime`, `shift`, `guides`, `star`, `from`, `labels`, titles | `values`, `after`, `names`, `true` |
| `businessCycle` (1.4.0) | `cycles`, `start`, `amplitude`, `trend`, `irregularity`, `seed`, `style`, `phases`, `every`, `dots`, `shade`, `trendLine`, `names`, titles | `labels`, `true` |
| `phillipsCurve` (1.4.0) | `movement`, `along`, `side`, `cause`, `size`, `longRun`, `withSrpc`, `curvature`; numbered: `nru`, `expected`, `u2`, `pi2`, `expected2`, `uShock`, `nru2`, `x`, `y`; `srpc`, `lrpc`, `guides`, `arrows`, `labels` | `values`, `after`, `names`, `true` |
| `possibilitiesCurve` (1.4.0) | `shape`, `bow`, `xMax`, `yMax`, `points`, `shift`, `steps`, `guides`; or `countries` with `layout`; `goods`, `name`, `heading` | `captions`, `costs`, `after`, `names`, `true` |
| `adAs` (1.4.0) | `as`, `lras`, `start`, `gap`, `shift` (`ad`, `sras`, `lras`, `size`); numbered: `schedule`, `potential`, `smooth`, `x`, `y`; `brace`, `guides`, `star`, `from`, `labels`, titles | `values`, `after`, `gap`, `names`, `true` |
| `costCurves` (1.4.0) | `market`, `atc`, `mcSlope`, `fixed`, `avc`, `afc`, `price`, `demand`, `regulation`, `run`, `outcome`, `shade`, `minimums`, `guides`, `axes`, `labels`, titles | `values`, `areas`, `names`, `true` |
| `particles` (1.2.0) | `particles: [{ count, shape, look, outer, name, after }]`, `state`, `seed`, `boxes`, `afterState`, `arrow`; or `lattice`; `border`, `heading` | `names`, `true` |

`opts.print` draws black on white with grey fills (the printed worksheet). Colours otherwise are the site's: green,
blue, red, gold and purple on the cream paper.

## The number line (1.1.0)

`numberLine` draws a line from `from` to `to` with a tick every `step` and a number every `every` ticks (counting from
0 when 0 is on the line), written as decimals, stacked fractions, multiples of π or degrees (`numbering`; when it is left
out, a fraction `[n, d]` or `{ pi: k }` in the range picks it). On it: `intervals` (a set of numbers, as an inequality
is graphed: a thick line, open or closed circles, and an arrow of its own where it runs on past an end), `points` (dots
or crosses with a letter, and `value: true` to write the value after it), and a `sequence`'s terms from a rule in `n`
(the same formula language as the generators). Items share a color by `set` (0 to 4: green, blue, red, gold, purple);
one set's intervals join, so an end two of them share is drawn once, closed if either is. The value of an endpoint or an
unlettered point that is not under a number is written above the line (rows keep them apart), so the figure is never
ambiguous; `values: false` or `hide: "values"` leaves them out. A lettered point's value is never written unless asked.

`OF.check` refuses a range that does not end on a tick, more than 100 gaps, and anything past the ends of the line (an
interval's end, a point, a sequence term): widen the range, never a figure with a part quietly left off. A circle at an
end that runs off the line is refused too. `OF.solve.numberLine(data)` gives the numbers the drawing uses: the ticks
(and which are numbered), each set's joined intervals (`null` for an end that runs off), the points, the terms, and
`contains(x, set)`.

A figure question generator for it (a test can randomize it): which number is point P at?

```json
{ "tool": "figure.number", "vars": { "b": { "of": [2, 4, 5, 10] }, "a": [1, 19] }, "where": "(a < 2*b) * (a != b)",
  "q": "The line is cut into equal parts. What number is point P at?",
  "fig": { "kind": "numberLine", "from": 0, "to": 2, "step": "{=1/b}", "every": "{b}", "points": [{ "at": "{=a/b}", "label": "P" }] },
  "answer": "a/b", "dp": 2,
  "work": ["Each whole is cut into {b} equal parts, so each part is 1 ÷ {b} = {=1/b}.", "P is {a} parts from 0.", "{a} × {=1/b} = {=a/b}"] }
```

## Shapes (1.1.0)

Six kinds, named the way teachers ask for them, share one reader, one layout and one way of marking and labeling:
`triangle`, `rectangle` (a square is `square: true`), `parallelogram` (a rhombus is `rhombus: true`), `trapezoid` (any,
`type: "isosceles"` or `type: "right"`), `kite` and `regularPolygon`. They are separate kinds, not one `polygon` kind
with a type, because each takes different measures and a teacher (or the Builder) thinks "a trapezoid with bases 14 and
8", not "a polygon of type trapezoid". There is still one way to draw each figure: a parallelogram with a right angle is
refused (draw a rectangle), a rhombus with a right angle too (a square), a trapezoid with equal bases (a parallelogram or
rectangle), and a kite with four equal sides (a rhombus). A regular polygon is drawn for its center, apothem and radius;
a plain square or equilateral triangle on its own is a `rectangle` or a `triangle`. The coordinate `grid` still plots a
polygon from its coordinates on axes: that is coordinate geometry (points you can read off the grid), these are measured
figures with no axes, so the two never draw the same figure.

**Measures.** A triangle is solved from any three of its angles `A`, `B`, `C` and sides `AB`, `BC`, `CA` (three sides,
two sides and an angle, two angles and a side; angles alone fix its shape, not its size, and then no length is written).
A length is a number, a fraction `[n, d]` or a root `{ "sqrt": 5, "times": 3 }` (3√5), drawn at its value and written the
way it was given. Measures that cannot make the figure (sides that break the triangle inequality, angles past 180°, a
side too short to close the triangle, a kite's long side too short to reach) or that contradict each other (a fourth
measure that does not agree, within 1% for a side and half a degree for an angle) fail `OF.check` and draw the "cannot
be drawn" card. Each kind takes only its own measures: a rectangle given `DA` too is refused, not quietly overruled.

**What it says.** Each given measure is written at its part and each worked-out one is not, unless `labels` says
otherwise: `true` writes the part's measure (rounded to `round` places, with `unit`; angles in degrees), `false` writes
nothing, and a math label writes that (`"x"`, `"2x + 3"`). A given right angle shows its square, not "90°". Parts are
the corners (angles), the sides, `hA`/`hB`/`hC` (a triangle's heights), `hD`/`hC` (a parallelogram's or trapezoid's
height to AB), `AC` and `BD` (diagonals), and for a regular polygon `side`, `angle`, `apothem`, `radius`. Ticks, arcs and
arrows (`{ part: 1 to 3 }`) claim equal sides, equal angles and parallel sides, so they go only where that is true; a
parallelogram opens with its arrows, a trapezoid with arrows on its bases and a kite with its ticks.

**Truth.** Everything a shape says is true of its measures. A label that states a number (`7`, `"7"`, `{ "frac": [5, 2] }`,
`[3, { "sqrt": 2 }]`) must state the part's true measure, within the same 1% or half a degree: a rectangle 13 long with
its length labeled 7 is refused. A label with a letter in it (`"x"`, `"2x + 3"`) states no number and is never checked.

**Not drawn to scale.** Test figures often say "Not drawn to scale" so students reason instead of measuring. Oomba keeps
that honest: `notToScale: true` prints the note ("Not drawn to scale", in the reader's language) on the figure, and
`drawAs` (the same kind of measures) gives the proportions to draw instead, for example `{ "AB": 3, "BC": 4, "B": 90,
"notToScale": true, "drawAs": { "AB": 5, "BC": 2, "B": 90 } }`. The labels, `OF.solve` and every mark still come from
the measures, and must be true there and in the drawing: equal ticks on sides that are equal in both, a right angle that
is a right angle in both (its square never sits on a corner that is not square). `drawAs` without `notToScale` is
refused. Without `drawAs` the figure is drawn to scale and the note is printed anyway.

`OF.solve.triangle(data)` (and `rectangle`, `parallelogram`, `trapezoid`, `kite`, `regularPolygon`) gives the numbers
from the measures, never from `drawAs`: angles, sides, perimeter and area; a triangle's heights, right angle and kind
(`byAngles`, `bySides`); a quadrilateral's height and diagonals; a regular polygon's side, radius, apothem, interior,
central and exterior angles. A figure question generator for each (a test can randomize them):

```json
{ "tool": "figure.number", "vars": { "a": [3, 12], "b": [3, 12] }, "q": "Find the length of the hypotenuse x.",
  "fig": { "kind": "triangle", "AB": "{a}", "BC": "{b}", "B": 90, "unit": "cm", "labels": { "CA": "x" } },
  "answer": "sqrt(a^2 + b^2)", "dp": 1, "unit": "cm",
  "work": ["x² = {a}² + {b}²", "x² = {=a^2 + b^2}", "x = √{=a^2 + b^2} = {=round(sqrt(a^2 + b^2), 1)}"] }
{ "tool": "figure.number", "vars": { "l": [3, 15], "w": [2, 12] }, "where": "l > w", "q": "What is the area of the rectangle?",
  "fig": { "kind": "rectangle", "AB": "{l}", "BC": "{w}", "unit": "cm" }, "answer": "l*w", "dp": 0, "unit": "cm²",
  "work": ["Area = length × width", "= {l} × {w}", "= {=l*w}"] }
{ "tool": "figure.number", "vars": { "b": [6, 14], "s": [4, 12, 2] }, "where": "b != s", "q": "What is the area of the parallelogram?",
  "fig": { "kind": "parallelogram", "AB": "{b}", "DA": "{s}", "A": 30, "unit": "m", "heights": ["D"], "labels": { "DA": false, "A": false, "hD": true } },
  "answer": "b*s/2", "dp": 0, "unit": "m²", "work": ["Area = base × height", "= {b} × {=s/2}", "= {=b*s/2}"] }
{ "tool": "figure.number", "vars": { "a": [8, 16], "c": [3, 12], "h": [3, 8] }, "where": "c <= a - 2", "q": "What is the area of the trapezoid?",
  "fig": { "kind": "trapezoid", "type": "isosceles", "AB": "{a}", "CD": "{c}", "h": "{h}", "unit": "cm", "ticks": { "BC": 1, "DA": 1 } },
  "answer": "(a + c)/2*h", "dp": 1, "unit": "cm²", "work": ["Area = (a + b) ÷ 2 × h", "= ({a} + {c}) ÷ 2 × {h}", "= {=(a + c)/2*h}"] }
{ "tool": "figure.number", "vars": { "a": [3, 8], "d": [6, 14], "b": { "of": [80, 90, 100, 110] } }, "where": "d >= a + 2",
  "q": "The short sides of the kite are equal, and so are its long sides. What is its perimeter?",
  "fig": { "kind": "kite", "AB": "{a}", "DA": "{d}", "B": "{b}", "labels": { "B": false } },
  "answer": "2*(a + d)", "dp": 0, "work": ["Perimeter = 2 × short side + 2 × long side", "= 2 × {a} + 2 × {d}", "= {=2*(a + d)}"] }
{ "tool": "figure.number", "vars": { "n": { "of": [5, 6, 8, 9, 10, 12] } }, "q": "This polygon is regular. What is the size of each interior angle x?",
  "fig": { "kind": "regularPolygon", "n": "{n}", "side": 4, "center": false, "labels": { "side": false, "angle": "x" } },
  "answer": "180*(n - 2)/n", "dp": 1, "unit": "°", "work": ["The angles add up to (n − 2) × 180° = ({n} − 2) × 180° = {=(n - 2)*180}°.", "Each angle is {=(n - 2)*180} ÷ {n} = {=round(180*(n - 2)/n, 1)}°."] }
```

## Lines and angles (1.1.0)

Two kinds. `angles` draws rays out from one vertex, each at its true direction (degrees, 0 to the right,
counterclockwise): a single angle, angle pairs (complementary, supplementary, adjacent), angles round a point, and two
lines crossing (four rays in two opposite pairs, so vertical angles are equal because they are drawn equal). An angle
runs counterclockwise from ray `from` to ray `to` (by their place in `rays`), so a reflex angle is just the other way
round. `parallelLines` draws one to four lines, one gap apart, cut by one to three transversals, each at its angle with
the lines (above the top line, right of the transversal, 10° to 170°) and crossing the top line `at` a number of gaps
along it. Its angles are named by where they sit round a crossing (`pos`: `above-left`, `above-right`, `below-left`,
`below-right`) or by their number: 1 to 4 round the top crossing, 5 to 8 round the next, as many textbooks number them;
`numbered: true` writes the numbers on the figure. A line with a `tilt` (degrees off parallel) is not parallel: the
angles at its crossing are its own, for "are these lines parallel?" questions. Reading an angle with a protractor is
its own kind, `protractor` (below).

**Truth.** A label that states a number must be the angle's true measure (within half a degree); `true` writes it. Arcs
claim equal angles only where they are equal; a 90° angle shows its square (not "90°" unless labeled). Parallel arrows
claim lines are parallel, so they go only on lines that are, and at least two lines carry the same arrows; by default
each parallel line gets one, and a tilted line none. A figure "not drawn to scale" (`angles` only): `notToScale: true`
prints the note, and `drawAs` gives the directions to draw, in the same order round the vertex, with right angles kept
right and equal arcs equal as drawn too.

`OF.solve.angles(data)` gives each listed angle's measure and how each pair is related (`adjacent`, `complementary`,
`supplementary`, `linear pair`, `vertical`). `OF.solve.parallelLines(data)` gives each crossing's four angles, every
angle by its number, the listed angles, how each pair is related (`corresponding`, `alternate interior`, `alternate
exterior`, `same-side interior`, `same-side exterior`, `vertical`, `linear pair`) and whether they are equal, and
`parallel`. A generator for each:

```json
{"tool": "figure.number", "vars": {"a": [20, 70, 5]}, "where": "a != 45", "q": "The two angles together make a right angle. Find x.", "fig": {"kind": "angles", "rays": [0, "{a}", 90], "angles": [{"from": 0, "to": 1, "label": "{a}"}, {"from": 1, "to": 2, "label": "x"}, {"from": 0, "to": 2, "label": false}]}, "answer": "90 - a", "dp": 0, "unit": "°", "work": ["Complementary angles add up to 90°.", "x = 90° − {a}°", "x = {=90 - a}°"]}
```
```json
{"tool": "figure.number", "vars": {"a": [40, 140, 5]}, "where": "a != 90", "q": "Lines m and n are parallel. Find x.", "fig": {"kind": "parallelLines", "transversals": [{"angle": "{a}"}], "angles": [{"number": 2, "label": "{a}"}, {"number": 8, "label": "x"}]}, "answer": "180 - a", "dp": 0, "unit": "°", "work": ["Angles 2 and 8 are same-side exterior angles, so they add up to 180°.", "x = 180° − {a}°", "x = {=180 - a}°"]}
```

## Segment addition (1.1.0)

`segmentAddition` draws points in order on one line, each part as long as its true length, with its label above it,
point names below, congruence ticks, and braces under the line for spans (AC over AB and BC) with their labels. A part
is `{ "length": 5 }` or an expression `{ "expr": [a, b] }`, a·x + b in one letter, written as a math label ("2x + 1")
and worked out at the letter's value, `unknown: { "x": 6 }`. Expressions are data, not typed math: nothing is parsed.
A span's label is `true` (the sum of its parts), a number (checked against the sum) or its own `expr` (checked at the
letter's value: 2x + 1 and 3x − 4 with a span labeled 27 is refused unless x = 6). Ticks claim equal parts, so a
midpoint is equal ticks either side of it. `cross: { "at": "M", "angle": 90, "name": "ℓ" }` draws a line crossing at a
point (a bisector), with its square only at 90°. `start` and `end` (`"arrow"`) make it a ray or a line. Not to scale:
`notToScale: true` with `drawAs` (one drawn length per part; equal ticks must be equal as drawn too).
`OF.solve.segmentAddition(data)` gives the unknown, each part and span, the whole length, where each point is, and which
points are midpoints of what.

```json
{"tool": "figure.number", "vars": {"x": [2, 9], "a": [1, 4], "b": [1, 6], "c": [1, 5], "d": [0, 6]}, "q": "B is on AC. Find x.", "fig": {"kind": "segmentAddition", "points": ["A", "B", "C"], "unknown": {"x": "{x}"}, "parts": [{"expr": ["{a}", "{b}"]}, {"expr": ["{c}", "{d}"]}], "spans": [{"from": "A", "to": "C", "label": "{=(a + c)*x + b + d}"}]}, "answer": "x", "dp": 0, "work": ["AB + BC = AC", "({a}x + {b}) + ({c}x + {d}) = {=(a + c)*x + b + d}", "{=a + c}x + {=b + d} = {=(a + c)*x + b + d}", "x = {x}"]}
```

## The circle (1.1.0)

`circle` draws one circle with its center (named `O` unless `center` says otherwise, or `false`), points placed by their
direction from the center (`at`, degrees) and their distance in radii (`dist`, 1 on the circle), and lines between
places: a join from one place to another is a radius, a diameter or a chord by where its ends are (`extend: "both"`
runs it on through the circle: a secant), `{ "tangent": "A" }` touches at a point on the circle, and `{ "tangentFrom":
"P", "side": "left", "touch": "T" }` runs from a point outside to where it touches (named T). `crossings` name where two
lines cross. Angles are at a place between the rays toward two others, along drawn lines (an angle on a line that is not
drawn is refused); the smaller one, unless `reflex: true`. Arcs run counterclockwise from `from` to `to`, labeled with
their degrees (`label: true`) or their length (`length: true`, which needs `radius`); `sectors` and `segments` are
shaded. A right angle between a tangent and the radius to its touch point shows its square by itself.

**Truth.** Everything is drawn from the points' true places, so every measure on the figure is true: an inscribed angle
is half its arc, the angle between chords is half the sum of the arcs they cut off, tangents from one point are equal,
because the figure is drawn that way, not because it says so. A label that states a number must be the true angle, arc
(degrees or length) or line length (which needs `radius`); arcs claim equal angles, ticks equal lengths or arcs, only
where they are. `OF.solve.circle(data)` gives the circumference and area (and as multiples of π), each arc's degrees
and length, each sector's and segment's area, each listed angle and each line's kind and length.

```json
{"tool": "figure.number", "vars": {"c": [40, 160, 10]}, "q": "O is the center of the circle. Find the inscribed angle x.", "fig": {"kind": "circle", "points": [{"name": "A", "at": "{=270 - c/2}"}, {"name": "B", "at": "{=270 + c/2}"}, {"name": "C", "at": 90}], "lines": [{"from": "O", "to": "A"}, {"from": "O", "to": "B"}, {"from": "C", "to": "A"}, {"from": "C", "to": "B"}], "angles": [{"at": "O", "from": "A", "to": "B"}, {"at": "C", "from": "A", "to": "B", "label": "x"}]}, "answer": "c/2", "dp": 0, "unit": "°", "work": ["An inscribed angle is half the central angle on the same arc.", "x = {c}° ÷ 2", "x = {=c/2}°"]}
```

## The coordinate grid, extended (1.1.0)

The coordinate grid stays one kind, `grid`: 1.1.0 adds options to it and changes nothing it drew before (the same data
draws the same SVG, byte for byte). A range or step can be a fraction `[n, d]` or a multiple of π `{ "pi": k }`, with
`xstep` and `ystep` set apart; the numbers on an axis are written as decimals, fractions, multiples of π or degrees
(`numbering`, or `xnumbering` and `ynumbering`; a π range picks π). `xtitle` and `ytitle` run along the axes. A
function's ends can be closed or open circles (`fromClosed`, `toClosed`), so a piecewise function is several functions
each with its `from` and `to`; `holes` are open circles where the curve comes to a value it never takes; `dash` dashes
it. `verticals` draw x = c, `asymptotes` dashed lines, and `inequalities` shade their side of the boundary (`expr` for y
against a formula, or `x` or `y` against a number), the boundary solid for ≤ and ≥ and dashed for < and >; several make
a system, its solutions where the shadings overlap. The formula language works in degrees (school trigonometry); a
graph in radians says `angles: "radians"` (see Radians below). A point can be `open`.

**Transformations** are grid data too: a shape gets `names` (A, B, C) and a `transform`: `translate`, `reflect` (the
axes, y = x, y = −x, or x = c, y = c), `rotate` (90, 180 or 270 degrees, counterclockwise; negative for clockwise)
about a point, or `dilate` by a factor from a point, or a list of up to 3 applied in turn. The image is worked out from
the pre-image, never given, so it is always the true image; it is drawn dashed with primed names (A′, then A″), the
line of reflection dashed and a center of rotation or dilation as a dot. An image that runs off the grid is refused.
`hide: "image"` leaves the image for the student to draw. Why options on `grid` and not a kind of its own: a
transformation is drawn on the same coordinate plane, with the same axes, points and shapes, and a second kind would be
a second way to draw a coordinate grid (rule 5 of the port: one way to draw each figure); the pre-image is already a
grid shape. `OF.solve.grid(data)` gives each shape's corners, its images and its steps in words ("Reflect over the
y-axis").

```json
{"tool": "figure.number", "vars": {"a": [1, 4], "b": [3, 6]}, "q": "Triangle ABC is reflected over the y-axis. What is the x-coordinate of A′?", "fig": {"kind": "grid", "x": [-8, 8], "y": [-2, 8], "step": 1, "shapes": [{"points": [["{=-a}", 1], ["{=-a}", "{b}"], ["{=-a-2}", 1]], "names": ["A", "B", "C"], "transform": {"reflect": "y-axis"}}]}, "answer": "a", "dp": 0, "work": ["A reflection over the y-axis changes the sign of x.", "A is at ({=-a}, 1), so A′ is at ({a}, 1).", "The x-coordinate of A′ is {a}."]}
```

## Composite shapes (1.1.0)

`compositeShape` builds a shape from parts in its own units (y up): `rect` [x, y, width, height], `tri` (three corners),
`semicircle` (the two ends of its diameter; it bulges to the left going from the first to the second) and `circle`
[x, y, r], each added, or cut out with `cut: true`. The outline is worked out from the parts: a side is drawn where the
shape is on one side of it only, so parts that share an edge show no line between them; `splits` draw dashed lines
inside (how it breaks into parts), and `radius: true` (or a label) draws a circle's or semicircle's radius. `sides: true`
labels every straight side of the outline with its length; `labels` label one whole side (`from`, `to`). `shade: true`
shades the shape (the region a question asks about, a hole left white), also in print.

**Truth.** Parts may not overlap (the area would count twice), a cut must lie inside the shape, and the parts must join
side to side into one shape; a label that states a number must be the true length. `OF.solve.compositeShape(data)`
gives the area (the parts added, the cuts taken away), the perimeter (the outline's straight sides and arcs, a hole's
edge included) and each part's area. The source's composite shape is a drawing editor; this kind is Oomba's own code and
takes the parts as data (a hand editor for it is Phase 4 work).

```json
{"tool": "figure.number", "vars": {"w": [6, 10], "h": [5, 9], "t": [2, 4], "s": [2, 4]}, "where": "s < h - 1", "q": "What is the area of the shape?", "fig": {"kind": "compositeShape", "parts": [{"rect": [0, 0, "{w}", "{s}"]}, {"rect": [0, "{s}", "{t}", "{=h - s}"]}], "sides": true, "unit": "m"}, "answer": "w*s + t*(h - s)", "dp": 0, "unit": "m²", "work": ["Split it into two rectangles.", "{w} × {s} = {=w*s}", "{t} × {=h - s} = {=t*(h - s)}", "Area = {=w*s} + {=t*(h - s)} = {=w*s + t*(h - s)}"]}
```

## Data displays (1.1.0)

Nine kinds, each the figure a teacher names: `barGraph`, `dotPlot`, `histogram`, `boxPlot`, `scatterPlot`, `stemAndLeaf`,
`pieChart`, `cumulativeFrequency` and `normalCurve`. Every one is drawn from its data, and nothing on it is typed in:
a bar is as long as its value on an axis that starts at 0; a dot sits on its value's tick (a value between ticks is
refused, never moved); a histogram with unequal bins is drawn as frequency density, so each bar's area is its frequency
(`density: false` with unequal bins is refused); a box plot's quartiles are worked out the TI-84 way (the medians of the
lower and upper halves, the median left out of both when the count is odd) and outliers are the values past 1.5 IQR; a
scatter plot's line of best fit is the least-squares line, with r as a calculator gives it; a stem-and-leaf plot keeps
every stem from the smallest to the largest, empty ones too, and writes its key from a value in the data; a pie chart's
angles are worked out from the values; a cumulative frequency graph plots each bin's end and reads the median at n/2 and
the quartiles at n/4 and 3n/4 off the curve as drawn (a smooth curve that never overshoots, or straight lines); a normal
curve's shaded areas are worked out to calculator accuracy.

**Truth.** A summary given with the data must agree with it (a box plot's `summary` and `data`, a histogram's
`counts` and `data`), and a label that states a number (`5`, `"40°"`, `"2.28%"`) must state the true one: a bar's
value, a slice's value, percent or angle as shown, a region's area; a letter (`"x"`) states none. Data that runs past an
axis is refused (widen it); a figure never leaves data off.

**Print and hide.** In print, series are told apart by fills that photocopy: gray, white, hatching, dots,
cross-hatching and back hatching (SVG patterns, their ids made from the data so two figures on a page never clash).
`hide` leaves out an answer: a bar (by its category, for a bar left to draw), the values, a histogram's bin
(`"bin2"`) or its scale, a box plot's median or quartile values, the line of best fit, a pie slice's label, the
readings, a normal curve's areas; `hide: true` leaves the axes or frame for students to fill in.

**Why separate kinds.** The coordinate `grid` plots points and formulas on a plane through the origin; a scatter plot
is data on axes fitted to it, with a fitted line and its own statistics, so it is its own kind, and the grid draws no
data display. A number line's points mark values; a dot plot stacks one mark per data value. A histogram's bars stand on
number ranges and touch; a bar graph's stand on categories. `OF.solve` gives each kind's numbers: n, mean, median, mode,
range, quartiles and IQR, totals, densities and the modal class, the fit and r, each slice's angle, percent and fraction,
the running totals and readings, each region's area and z-scores. One generator each:

```json
{"tool":"figure.number","vars":{"a":[3,15],"b":[3,15],"c":[2,12]},"q":"The bar graph shows how many students chose each fruit. How many students were asked in all?","fig":{"kind":"barGraph","categories":["Apples","Bananas","Grapes"],"values":["{a}","{b}","{c}"],"ytitle":"Students"},"answer":"a + b + c","dp":0,"work":["Add the heights of the bars.","{a} + {b} + {c}","= {=a + b + c}"]}
```
```json
{"tool":"figure.number","vars":{"a":[1,6],"b":[3,6]},"q":"What is the range of the data?","fig":{"kind":"dotPlot","data":["{a}","{=a + 1}","{=a + 2}","{=a + 2}","{=a + b}"],"xtitle":"Pets"},"answer":"b","dp":0,"work":["Range = largest − smallest","= {=a + b} − {a}","= {b}"]}
```
```json
{"tool":"figure.number","vars":{"a":[2,12],"b":[2,12],"c":[2,40,2]},"q":"What is the frequency density of the 20 to 40 class?","fig":{"kind":"histogram","bins":[[0,10],[10,20],[20,40]],"counts":["{a}","{b}","{c}"],"xtitle":"Time (minutes)"},"answer":"c/20","dp":2,"work":["Frequency density = frequency ÷ class width","= {c} ÷ 20","= {=c/20}"]}
```
```json
{"tool":"figure.number","vars":{"a":[10,30],"b":[2,8],"c":[2,8],"e":[2,8],"f":[2,8]},"q":"What is the interquartile range?","fig":{"kind":"boxPlot","summary":["{a}","{=a + b}","{=a + b + c}","{=a + b + c + e}","{=a + b + c + e + f}"],"values":true,"step":2},"answer":"c + e","dp":0,"work":["IQR = Q3 − Q1","= {=a + b + c + e} − {=a + b}","= {=c + e}"]}
```
```json
{"tool":"figure.number","vars":{"m":[1,5],"k":[2,10],"c":[1,3]},"q":"What is the slope of the line of best fit?","fig":{"kind":"scatterPlot","points":[[1,"{=m + k + c}"],[2,"{=2*m + k}"],[3,"{=3*m + k - 2*c}"],[4,"{=4*m + k}"],[5,"{=5*m + k + c}"]],"fit":true},"answer":"m","dp":2,"work":["The line of best fit goes up {m} for every 1 across.","Slope = {m}"]}
```
```json
{"tool":"figure.number","vars":{"a":[2,5],"b":[5,9]},"q":"What is the median of the data?","fig":{"kind":"stemAndLeaf","data":["{=10*a + 1}","{=10*a + 4}","{=10*a + b}","{=10*a + 12}","{=10*a + 17}"]},"answer":"10*a + b","dp":0,"work":["There are 5 values, so the median is the 3rd.","Stem {a}, leaf {b}: {=10*a + b}"]}
```
```json
{"tool":"figure.number","vars":{"a":[6,14],"b":[6,14]},"q":"36 students were asked how they get to school. What is the angle of the Walk sector?","fig":{"kind":"pieChart","slices":[{"name":"Walk","value":"{a}"},{"name":"Bus","value":"{b}"},{"name":"Car","value":"{=36 - a - b}"}],"show":["name","value"]},"answer":"a*10","dp":0,"unit":"°","work":["Each student is 360° ÷ 36 = 10°.","{a} × 10° = {=a*10}°"]}
```
```json
{"tool":"figure.number","vars":{"a":[2,10],"b":[4,16],"c":[4,20],"d":[2,10]},"q":"How many values are 30 or less?","fig":{"kind":"cumulativeFrequency","bins":[[0,10],[10,20],[20,30],[30,40]],"counts":["{a}","{b}","{c}","{d}"],"join":"lines"},"answer":"a + b + c","dp":0,"work":["Read the graph at 30.","{a} + {b} + {c} = {=a + b + c}"]}
```
```json
{"tool":"figure.number","vars":{"m":[40,100,10],"j":[5,25,5]},"q":"The mean is {m} and the standard deviation 10. What is the z-score where the shaded region starts?","fig":{"kind":"normalCurve","mean":"{m}","sd":10,"regions":[{"from":"{=m + j}"}]},"answer":"j/10","dp":1,"work":["z = (x − mean) ÷ standard deviation","= ({=m + j} − {m}) ÷ 10","= {=j/10}"]}
```

## Probability and tables (1.1.0)

`treeDiagram` draws stages of branches, left to right, each with its probability (a decimal, or a fraction `[n, d]`
kept exact and drawn stacked), then each outcome and its probability, the product along its path (reduced). Branches
from one point must add up to 1 (exactly, for fractions), or the tree is refused; `repeat` draws the same branches at
every stage (independent events), `then` gives each branch its own (without replacement). `vennDiagram` draws 2 or 3
sets in a universe, with a count in each region (`A` is A only, `AB` A and B only, `none` in no set) or the
elements themselves, sorted into their regions from each set's `members`; `shade` fills regions (`{ "in": ["A"], "out":
["B"] }` is A but not B), and stated `totals` must add up. `twoWayTable` works out its row and column totals and shows
counts or relative frequencies (joint, or conditional on the row or column) as decimals, percents or fractions, with
cells left blank. `tableOfValues` works its y values out from a rule in x (the formula language), or checks given
pairs against it. A table of values is not a graph: the `grid` graphs the same rule. `OF.solve` gives each outcome's
probability and each branch's (the conditional probability given its path), each stage's totals; a Venn diagram's set
totals, intersections, union and P(A|B); a table's totals and relative frequencies; a table of values' differences and,
when it is linear, its slope and intercept.

```json
{"tool":"figure.number","vars":{"r":[2,6],"b":[2,6]},"q":"A bag has {r} red and {b} blue marbles. Two are taken without replacement. What is the probability both are red?","fig":{"kind":"treeDiagram","stages":["1st","2nd"],"branches":[{"name":"R","p":["{r}","{=r + b}"],"then":[{"name":"R","p":["{=r - 1}","{=r + b - 1}"]},{"name":"B","p":["{b}","{=r + b - 1}"]}]},{"name":"B","p":["{b}","{=r + b}"],"then":[{"name":"R","p":["{r}","{=r + b - 1}"]},{"name":"B","p":["{=b - 1}","{=r + b - 1}"]}]}],"hide":"products"},"answer":"r*(r - 1)/((r + b)*(r + b - 1))","dp":3,"work":["Multiply along the R, R branches.","{r}/{=r + b} × {=r - 1}/{=r + b - 1}","= {=round(r*(r - 1)/((r + b)*(r + b - 1)), 3)}"]}
```
```json
{"tool":"figure.number","vars":{"a":[2,12],"b":[2,12],"c":[1,8],"n":[1,9]},"q":"How many students have a cat or a dog (or both)?","fig":{"kind":"vennDiagram","sets":["Cat","Dog"],"counts":{"A":"{a}","B":"{b}","AB":"{c}","none":"{n}"}},"answer":"a + b + c","dp":0,"work":["Add every number inside the circles.","{a} + {c} + {b} = {=a + b + c}"]}
```
```json
{"tool":"figure.number","vars":{"a":[5,20],"b":[5,20],"c":[5,20],"d":[5,20]},"q":"How many students take the bus in all?","fig":{"kind":"twoWayTable","columns":["Bus","Walk"],"rows":["Grade 7","Grade 8"],"counts":[["{a}","{b}"],["{c}","{d}"]],"blanks":[[2,0]]},"answer":"a + c","dp":0,"work":["Add the Bus column.","{a} + {c} = {=a + c}"]}
```
```json
{"tool":"figure.number","vars":{"m":[2,6],"k":[1,9]},"q":"The table follows the rule y = {m}x + {k}. What is y when x = 4?","fig":{"kind":"tableOfValues","rule":"{m}*x + {k}","from":0,"to":4,"blanks":[4]},"answer":"4*m + k","dp":0,"work":["y = {m} × 4 + {k}","= {=4*m + k}"]}
```

## The protractor (1.1.0)

`protractor` lays a half-circle protractor on an angle, for reading its measure (Grade 4 and up): two scales, the inner
one counting from 0 on the right and the outer one from 0 on the left, every degree ticked, every 10 numbered. The angle
is given in whole degrees (`angle`, 1 to 180) and its rays are drawn at their true directions, so the reading is true by
construction: with `base: "right"` one ray lies along the base line on the inner scale's 0 and the other crosses the inner
scale at the angle; with `base: "left"` the outer scale reads it (and the inner one shows 180 minus it, the usual
mix-up). `start` turns the angle so it does not start on 0 (read as a difference). `reading: true` writes the measure
by its arc; `hide: "reading"` leaves it for the student. `OF.solve.protractor` gives the angle, its kind, and each
ray's inner and outer readings. Oomba's own code: the source has no protractor.

```json
{"tool":"figure.number","vars":{"a":[10,170,5]},"where":"a != 90","q":"Read the protractor. What does the angle measure?","fig":{"kind":"protractor","angle":"{a}","reading":true,"hide":"reading"},"answer":"a","dp":0,"unit":"°","work":["One ray is on 0 of the inner scale.","The other ray crosses the inner scale at {a}.","The angle is {a}°."]}
```

## 3D solids and nets (1.1.0)

Five kinds, the solids a teacher names: `prism`, `cylinder`, `pyramid`, `cone` and `sphere` (a hemisphere is a sphere with
`hemisphere: true`, `bowl: true` for its flat face up). The source draws all five with one shared module and gives each its
own generator; Oomba keeps them as separate kinds sharing one reader, one projection and one way of labeling, for the
same reason as the flat shapes: each takes different measures (a prism its base and height, a cone its radius and
height or slant height), and a teacher (or the Builder) asks for "a cone with radius 5", not "a solid of type cone".
There is still one way to draw each solid: a regular base with 4 sides is refused (a square base is `base: "rectangle"`
with equal length and width), an isosceles base with three equal sides is refused (`base: "regular"`, `sides: 3`), one
with a right angle at the top is refused (`base: "right"` with equal legs), and a cube is a prism with equal length, width
and height. A solid in a net is a different figure (flat, with fold lines), so it is its own kind, `net`, below.

**To scale.** A solid is built in 3D from its measures and drawn the way textbooks draw one: a prism or pyramid with its
front face square-on and its depth running back at 45° at half length (oblique projection), a round solid seen from a
little above so its circles become level ovals. Every edge no face that holds it faces the viewer is hidden, drawn
dashed (`hidden: false` leaves them out). The whole solid is scaled to fit as one, so its proportions are true. Lines
carry the measures that are not edges: a pyramid's or cone's height (dashed, with its square), a slant height down the
middle of a face, a radius or diameter, an apothem (`labels: { "apothem": true }`), and on an oblique solid (`oblique:
true` with a `lean`) its height dropped outside it with the base line run on to meet it. Measures that cannot make the
solid (a slant height not longer than the radius, a slanted edge shorter than the height) or that disagree (a height and
slant height more than 1% apart) are refused, as are measures more than 40 times apart (too flat to read: use
`notToScale` with `drawAs`).

**Truth.** A label that states a number must state the true measure, within 1%: a cone of radius 5 and height 12 with
its slant height labeled 14 is refused (it is √(12² + 5²) = 13). `notToScale: true` prints "Not drawn to scale" and
`drawAs` (the same measures) gives the proportions to draw; the labels and `OF.solve` stay true to the measures.

`OF.solve.prism(data)` (and `cylinder`, `pyramid`, `cone`, `sphere`) gives every measure (worked-out ones too), the base
area and perimeter, the lateral and total surface area and the volume; a polyhedron's faces, edges and corners; a right
pyramid's slant height (and for a rectangular base both, `slantLength` and `slantWidth`) and lateral edge; a cone's slant
height and sector angle; and for round solids `exact`, each area and volume as a multiple of π written as a math label
(`{ "pi": 12 }`, `{ "pi": { "frac": [1372, 3] } }`, or for a cone with a root slant height `{ "pi": [4, { "sqrt": 97 }] }`).
An oblique cylinder's or cone's curved surface has no school formula, so its areas are `null` (with `why`); its volume
is the same as the right solid's.

**Nets.** `net` lays a solid's faces out flat: a cube in one of its 11 nets (`net: 1` to `11`, 1 is the cross), or any
six squares (`cells`) that fold into a cube, which are refused otherwise; a prism's sides in a row with its two bases on
one of them; a pyramid's base with a triangle on each edge; a cylinder's rectangle (its length is the circumference) with
a circle on each long side; a cone's sector (its angle is 360 r ÷ slant height) with its base circle. It takes the same
measures as the solid's kind (and refuses a prism with three equal edges: that is `solid: "cube"`). Fold lines are
dashed (`fold: "solid"` draws them solid), cut edges solid; `tabs: true` adds glue tabs where they lie clear of every
face; `faces` writes each face's name (A, B, C in reading order) and area; `shade: true` tints faces of the same shape
and size alike (gray in print). Worked-out lengths a net needs for surface area (a triangle's third side, a pyramid's
slant heights) are written from the start. Why a kind and not an option on each solid: a net is a different figure (flat,
with fold lines and cut edges, and a cube's 11 choices), it has no projection, no hidden edges and no lean, and the
source makes it with its own generator; a solid and its net share the reader and the measures, so they always agree.
`OF.solve.net(data)` gives each face's area (they add up to the solid's surface area), the surface area, the volume, the
exact π forms, and for a cube which of the 11 nets it is.

```json
{"tool": "figure.number", "vars": {"l": [3, 12], "w": [2, 8], "h": [2, 10]}, "q": "What is the volume of the rectangular prism?", "fig": {"kind": "prism", "length": "{l}", "width": "{w}", "height": "{h}", "unit": "cm"}, "answer": "l*w*h", "dp": 0, "unit": "cm³", "work": ["Volume = length × width × height", "= {l} × {w} × {h}", "= {=l*w*h}"]}
```
```json
{"tool": "figure.number", "vars": {"r": [2, 8], "h": [3, 12]}, "q": "What is the volume of the cylinder? Use π ≈ 3.14159.", "fig": {"kind": "cylinder", "radius": "{r}", "height": "{h}", "unit": "cm"}, "answer": "pi*r^2*h", "dp": 1, "unit": "cm³", "work": ["Volume = π r² h", "= π × {r}² × {h}", "= {=r^2*h}π ≈ {=round(pi*r^2*h, 1)}"]}
```
```json
{"tool": "figure.number", "vars": {"s": [4, 12, 2], "h": [3, 12]}, "q": "Find the slant height x of the square pyramid.", "fig": {"kind": "pyramid", "length": "{s}", "width": "{s}", "height": "{h}", "unit": "cm", "labels": {"slant": "x"}}, "answer": "sqrt(h^2 + (s/2)^2)", "dp": 1, "unit": "cm", "work": ["x² = height² + (half the base)²", "x² = {h}² + {=s/2}² = {=h^2 + (s/2)^2}", "x = √{=h^2 + (s/2)^2} ≈ {=round(sqrt(h^2 + (s/2)^2), 1)}"]}
```
```json
{"tool": "figure.number", "vars": {"r": [3, 9], "h": [4, 12]}, "q": "What is the volume of the cone? Use π ≈ 3.14159.", "fig": {"kind": "cone", "radius": "{r}", "height": "{h}", "unit": "cm"}, "answer": "pi*r^2*h/3", "dp": 1, "unit": "cm³", "work": ["Volume = π r² h ÷ 3", "= π × {r}² × {h} ÷ 3", "≈ {=round(pi*r^2*h/3, 1)}"]}
```
```json
{"tool": "figure.number", "vars": {"r": [2, 10]}, "q": "What is the surface area of the sphere? Use π ≈ 3.14159.", "fig": {"kind": "sphere", "radius": "{r}", "unit": "cm"}, "answer": "4*pi*r^2", "dp": 1, "unit": "cm²", "work": ["Surface area = 4 π r²", "= 4 × π × {r}²", "= {=4*r^2}π ≈ {=round(4*pi*r^2, 1)}"]}
```
```json
{"tool": "figure.number", "vars": {"s": [2, 9], "n": [1, 11]}, "q": "The net folds into a cube. What is the cube's surface area?", "fig": {"kind": "net", "solid": "cube", "side": "{s}", "net": "{n}", "unit": "cm", "labels": {"side": true}}, "answer": "6*s^2", "dp": 0, "unit": "cm²", "work": ["A cube has 6 square faces.", "Each face is {s} × {s} = {=s^2}.", "6 × {=s^2} = {=6*s^2}"]}
```

## Mapping diagrams (1.1.0)

`mappingDiagram` draws the inputs down the left and the outputs down the right, each side in an oval (`shape: "box"`
or `"none"`) under its title ("Input" and "Output" in the reader's language, or `titles: ["x", "y"]`, or `false`), and an
arrow from each input to each output it maps to. Items are numbers or math labels (a word like "Soccer" is written
upright); each is listed once, and an arrow `[input, output]` must join two listed items. The arrows are the data, never
a drawing by eye, so the figure shows exactly the relation it is given; a `rule` in x (the formula language), when given,
must be what every arrow does (with `rule: "2*x + 1"`, an arrow from 3 to 8 is refused). `hide: "arrows"` (or `true`)
leaves the arrows for students to draw; `hide: "outputs"` leaves the outputs. `OF.solve.mappingDiagram(data)` gives the
pairs, whether it is a function (every input with exactly one arrow) and why not ("1 goes to 4 and 5", "3 has no
output"), whether it is one-to-one and onto (every output reached), the domain (the inputs), the range (the outputs
reached) and codomain, and the inverse where it is a function (one-to-one and onto), with `inverseRelation` always.

```json
{"tool": "figure.number", "vars": {"m": [2, 5], "k": [1, 9]}, "q": "The mapping follows the rule y = {m}x + {k}. What is the output for the input 3?", "fig": {"kind": "mappingDiagram", "inputs": [1, 2, 3, 4], "outputs": ["{=m + k}", "{=2*m + k}", "{=3*m + k}", "{=4*m + k}"], "arrows": [[1, "{=m + k}"], [2, "{=2*m + k}"], [3, "{=3*m + k}"], [4, "{=4*m + k}"]], "rule": "{m}*x + {k}", "hide": "outputs"}, "answer": "3*m + k", "dp": 0, "work": ["y = {m} × 3 + {k}", "= {=3*m + k}"]}
```

## The ruler (1.1.0)

The math sites' length reading is a ruler, so it extends `reading` (one way to read a scale) rather than adding a kind:
`{ "type": "ruler", "value": 4.3, "start": 0, "max": 15, "step": 0.1 }` draws a centimeter ruler (marks 1, 0.5 or 0.1
cm apart, numbered every centimeter, a longer mark at each half) or, with `unit: "in"`, an inch ruler (marks 1/2 to
1/16 inch, shortening from halves to sixteenths), with an object lying on it from `start` to `start + value`, both ends
exactly on their marks. A metric length may end half way between two marks (one decimal more), as on Oomba's other
scales; an inch length ends on a mark and is written as a mixed number ("3 3/8 in"). The magnifiers of the source are
not ported. `OF.solve.reading(data)` gives the reading (for a ruler its start, end and length as written). The caliper
and micrometer (the physics and chemistry length readings, one implementation in the source) joined this same type in
1.1.0 ("Length readings" below); the shared code lives in `figures/src/ported/ruler.js`, `figures/src/ported/gauges.js`
and `figures/src/readings.js`, in the measure pack.

```json
{"tool": "figure.number", "vars": {"a": [11, 120]}, "q": "How long is the bar, in centimeters?", "fig": {"kind": "reading", "type": "ruler", "value": "{=a/10}", "max": 15, "step": 0.1, "hide": "value"}, "answer": "a/10", "dp": 1, "unit": "cm", "work": ["The bar starts at 0.", "It ends {=floor(a/10)} cm and {=a - 10*floor(a/10)} mm along.", "Its length is {=a/10} cm."]}
```

## The core and its packs (1.1.0)

Oomba Figures 1.1.0 is split by subject, so a page loads only the figures it draws. The version folder holds the core,
`oomba-figures.js`, and five packs, `packs/<name>.js`; each pack is a classic script that registers its kinds into the
core, so it loads after it:

| File | What it brings | Why together |
| --- | --- | --- |
| `oomba-figures.js` (the core) | `OF.draw`, `svg`, `check`, `solve`, the registry, the default words, the math label typesetter, the formula language, the notice, `OF.structure`, `OF.board`, and the coordinate `grid` | Every pack uses the drawing core, and the grid and its axes are drawn by every subject (math functions, physics and chemistry graphs) |
| `packs/math.js` | `numberLine`, the shapes, `angles`, `parallelLines`, `segmentAddition`, `circle`, `compositeShape`, the solids, `net`, `mappingDiagram` | Geometry and number: they share the shape layout, the marks and the label placement |
| `packs/data.js` | the data displays and the probability figures and tables | They share the statistics (`ported/stats.js`) and the chart helpers |
| `packs/physics.js` | `freeBody`, `vectors`, `inclinedPlane`, `pulley`, `rays`, `circuit`, `motionGraph`, `motionMap`, `projectile`, `waves` | Mechanics, optics, electricity and waves: the motion graphs and maps share one motion model |
| `packs/chem.js` | `bohr`, `orbitals`, `lewis`, `halfLife`, `titration` | The element table and the chemistry curves |
| `packs/bio.js` (1.3.0) | `populationGrowth`, `predatorPrey`, `enzymeActivity`, `photosynthesis`, `punnett`, `pedigree`, `proteinSynthesis`, `gel`, `osmosis` | Ecology, rates, genetics and molecular biology: the rate graphs share one enzyme temperature curve |
| `packs/measure.js` | `reading` (thermometer, cylinder, spring scale, ruler, caliper, micrometer; 1.2.0 the lab readings; 1.3.0 the micropipette) and `protractor` | Reading an instrument is one skill across math, physics, chemistry and biology: a math teacher with a ruler does not load physics |

Each file has its own pinned tag (its own SRI hash, `crossorigin="anonymous"`); `figTag("oomba-figures")` in
`server/services/figlibs.js` writes the core tag followed by every pack's, `figTag("oomba-figures", v, { kinds })`
exactly the packs those kinds need (the mock Builder and any server code that knows its kinds use this), and
`figPackTag(pack)` one pack's. The scanner admits a pack tag only after the core tag of the same version, once; the
frame's CSP and the screenshot worker name each pack file (never the `packs/` folder); `manifest.json` lists each
pack's file and kinds, and `figures/SHIPPED.json` each file's sha256 and SRI. The server's copy (`figuresKit`) runs
the core and every pack. A kind whose pack is not loaded is named by `OF.check` ("the figure "bohr" is in the chem pack,
which this page does not load: add the chem pack's pinned tag after the Oomba Figures tag") and draws the "cannot be
drawn" card; the activity self-test and the playtest name the exact tag to add, and the Builder's FIGURE RULES list
each kind with its pack. `OF.packs` lists the packs loaded and `OF.packOf(kind)` the pack a kind needs. The core does
not freeze `OF.kinds`: it is the kinds loaded so far, and what a pack adds can never be replaced. Pages pinned to 1.0.0
(one file) are unchanged.

## Motion graphs from segments, and motion maps (1.1.0)

A motion given part by part, `segments: [{ kind, speed, duration }]` (`rest`; `forward` or `back` at a constant
velocity; `faster` or `slower` to `speed` from the velocity the part before ended at, so velocity only jumps going into
a constant velocity or rest; `dir: "back"` speeds up backward from rest) with a `start` position, is worked out from its
velocity-time graph (`ported/motion.js`): position is the area under it and acceleration its slope, exactly. So
`motionGraph` with `segments` draws its position-time (`type: "position-time"`, or `displacement-time`,
`distance-time` when it never goes back), velocity-time or acceleration-time graph, or `graphs: ["position",
"velocity", "acceleration"]` stacked on one time axis, all of them consistent, with letters A, B, C at the parts' ends
(`marks: true`). A part that cannot reach its speed (speeding up to a speed it is already past) is refused. An
acceleration-time graph exists only from segments. `motionMap` draws the same motion as a dot every `dt` at its true
place on a number line in meters, each with its velocity arrow, every arrow on one scale (equal speeds equal arrows,
twice the speed twice as long, none reaching the next dot); a run back goes on in a row above; a stop is one dot with
its times; `acceleration: true` puts the acceleration's way (or a = 0) over each part. The durations must add up to a
whole number of steps. `OF.solve.motionGraph` and `OF.solve.motionMap` give each part's times, velocities,
positions and acceleration, the distance and displacement (and the map's dots). Old `motionGraph` data with `points`
draws exactly as in 1.0.0.

```json
{"tool": "figure.number", "vars": {"v": [2, 12], "t": [2, 6]}, "q": "What is the cart's acceleration while it speeds up?", "fig": {"kind": "motionGraph", "segments": [{"kind": "faster", "speed": "{v}", "duration": "{t}"}, {"kind": "forward", "speed": "{v}", "duration": 3}], "type": "velocity-time", "marks": true}, "answer": "v/t", "dp": 2, "unit": "m/s²", "work": ["a = change in velocity ÷ time", "= {v} ÷ {t}", "= {=round(v/t, 2)} m/s²"]}
{"tool": "figure.number", "vars": {"s": [1, 5], "t": [2, 6]}, "q": "The dots are 1 s apart. How far does the cart go?", "fig": {"kind": "motionMap", "segments": [{"kind": "forward", "speed": "{s}", "duration": "{t}"}], "dt": 1}, "answer": "s*t", "dp": 0, "unit": "m", "work": ["It moves {s} m each second.", "It moves for {t} s.", "{s} × {t} = {=s*t} m"]}
```

## Projectile motion (1.1.0)

`projectile` launches a ball at `speed` (m/s) and `angle` (degrees above the horizontal) from level ground or from a
cliff `height` m high, with `g` (9.8 unless given: 10 for a classroom value, 1.62 on the Moon). Its path is the real
parabola, drawn as one exact quadratic curve to one scale across and up (`ported/projectile.js`), so the range and the
greatest height sit where the physics puts them; `positions` puts the ball again at equal time steps (A at the launch,
then B, C... with `letters`). The arrows (the launch velocity, its components in proportion, `g`) show directions; their
length is a symbol. `marks` adds dimension lines for the `range`, the greatest `height` and the `cliff`, with their
values (or their letters R, H, h when hidden). A launch flatter than 5° from the ground, 90°, or a path too flat or too
tall to draw to scale is refused. `OF.solve.projectile` gives `vx`, `vy`, `time`, `range`, `maxHeight` (above the
ground), `rise` (above the launch), `peakTime`, `landingSpeed`, `landingAngle` and the balls' places.

```json
{"tool": "figure.number", "vars": {"v": [10, 30], "a": {"of": [30, 40, 45, 50, 60]}}, "q": "A ball is kicked at {v} m/s, {a}° above the ground. Take g = 10 m/s². How far away does it land?", "fig": {"kind": "projectile", "speed": "{v}", "angle": "{a}", "g": 10, "marks": ["range"], "hide": "range"}, "answer": "v^2*sin(2*a)/10", "dp": 1, "unit": "m", "work": ["R = v² sin(2θ) ÷ g", "= {v}² × sin({=2*a}°) ÷ 10", "= {=round(v^2*sin(2*a)/10, 1)} m"]}
```

## Waves (1.1.0)

`waves` draws a transverse wave on numbered axes, y = A sin(2πx / λ) from its `amplitude` and `wavelength` (or along
time, `axis: "time"`, from its `period`), `cycles` long in halves; the axes are fitted (`ported/waves.js`) so the
wavelength or period and the amplitude are whole numbers of blocks and the crests land on gridlines, so students can
measure them. `wave: "longitudinal"` draws vertical lines bunched at the compressions and spread at the rarefactions over
a distance axis; `"both"` puts it above its transverse wave, lined up (the compressions over the crests, as a sound
wave lines up with its pressure graph). `marks` (the wavelength or period, and the amplitude; both by default) and
`labels` (crest, trough, compression, rarefaction) name the parts. `OF.solve.waves` gives the amplitude, wavelength,
period, frequency (from the period, or from `speed` and the wavelength), speed, and where the crests and troughs are.

```json
{"tool": "figure.number", "vars": {"A": [1, 5], "L": {"of": [2, 4, 6, 8]}, "c": {"of": [2, 3]}}, "q": "What is the wavelength of this wave, in meters?", "fig": {"kind": "waves", "amplitude": "{A}", "wavelength": "{L}", "cycles": "{c}", "marks": []}, "answer": "L", "dp": 0, "unit": "m", "work": ["One wavelength is from one crest to the next.", "The crests are {L} m apart.", "λ = {L} m"]}
```

## The plane mirror (1.1.0)

`rays` with `type: "plane-mirror"` (no focal length) draws the object `u` in front of a plane mirror and its image as
far behind it, upright, the same size and virtual (dashed). It is drawn to one scale across and up, so each ray leaves
the mirror at the angle it arrived at (the dotted normals show it) and its dashed back-extension runs to the image's
tip. Ray 1 meets the mirror at half the object's height, ray 2 at its foot. `OF.solve.rays` gives `v` = −u, `m` = 1 and
the image's place. The other ray diagrams draw exactly as in 1.0.0.

```json
{"tool": "figure.number", "vars": {"u": [5, 30]}, "q": "The object is {u} cm in front of a plane mirror. How far behind the mirror is its image?", "fig": {"kind": "rays", "type": "plane-mirror", "u": "{u}", "h": "{=u/2}", "hide": "image"}, "answer": "u", "dp": 0, "unit": "cm", "work": ["A plane mirror's image is as far behind it as the object is in front.", "The image is {u} cm behind the mirror."]}
```

## Compound circuits (1.1.0)

`circuit` with `layout: "network"` takes a `loop`: parts and groups in order round it, a `{ series: [...] }` group or a
`{ parallel: [...] }` group whose branches are parts or series groups, nested up to 3 deep, up to 8 parts
(`ported/circuittree.js`). It is laid out so no wires cross: a series run left to right, a parallel group's branches
stacked between two rails with a dot at every joint, the cell or battery on the wire back. Parts name themselves R₁,
R₂, L... (or keep a `name`), with their `ohms` and the source's `volts` written beside them (`names`, `values`).
`OF.solve.circuit` works the numbers out with Ohm's law (resistances in series add; in parallel their reciprocals
add): the total resistance, the current from the source, and every part's current and voltage; ammeters show the
current through them and `voltmeter: true` on a part draws a voltmeter across it showing its voltage (`hide: "meters"`
writes "?"). A short circuit, a bare wire in parallel with a part, a source inside a group, or more than one source is
refused. A bridge circuit (neither series nor parallel) is not drawn. The flat `series` and `parallel` layouts draw
exactly as in 1.0.0.

```json
{"tool": "figure.number", "vars": {"a": [2, 10], "b": [2, 10], "c": [2, 10]}, "q": "What is the total resistance of the circuit?", "fig": {"kind": "circuit", "layout": "network", "loop": [{"type": "battery", "volts": 12}, {"type": "resistor", "ohms": "{a}"}, {"parallel": [{"type": "resistor", "ohms": "{b}"}, {"type": "resistor", "ohms": "{c}"}]}]}, "answer": "a + b*c/(b + c)", "dp": 2, "unit": "Ω", "work": ["In parallel: R = (R₂ × R₃) ÷ (R₂ + R₃) = {=round(b*c/(b + c), 2)} Ω", "In series with R₁: R = {a} + {=round(b*c/(b + c), 2)}", "= {=round(a + b*c/(b + c), 2)} Ω"]}
```

## Length readings: caliper and micrometer; the spring scale's extras (1.1.0)

One reading kind for every subject (the measure pack). `reading` with `type: "caliper"` draws a close-up of a vernier
caliper's scales: the main scale (numbered in centimeters) over the sliding scale, which fits n divisions in n × g − 1
mm (`ported/gauges.js`), set exactly at `value` mm, so the one sliding mark that lines up with a main-scale mark is the
true one; `leastCount` is 0.1, 0.05 or 0.02 mm. `type: "micrometer"` draws the sleeve (millimeters above the datum
line, half millimeters below) and the thimble's 50 marks seen side on, the reading's mark on the datum line; `estimate:
true` reads one digit more (to 0.001 mm). Either takes `zero`, a zero error (what it reads closed, at most 0.5 mm for a
caliper and 0.05 mm for a micrometer either way), drawn closed above it. A spring scale (`type: "spring"`) also takes
`masses` (grams hanging on the hook: the reading must be their weight with `g`, plus any zero error) and `zero` (what it
reads with nothing on it, drawn unloaded beside it). `OF.solve.reading` gives the `value`, the `zero` and the
`corrected` reading (and `main` and `k` for a caliper, `sleeve` and `thimble` for a micrometer, `mass` and `weight`
for hanging masses). The thermometer, cylinder and spring scale without the new options draw exactly as in 1.0.0.
Chemistry's own readings (burets, beakers, balances, gas syringes, digital thermometers, pH) came in 1.2.0 ("Chemistry (1.2.0)").

```json
{"tool": "figure.number", "vars": {"m": [10, 140], "k": [0, 19]}, "q": "What does the caliper read, in mm?", "fig": {"kind": "reading", "type": "caliper", "value": "{=m + k*0.05}", "leastCount": 0.05, "hide": "value"}, "answer": "m + k*0.05", "dp": 2, "unit": "mm", "work": ["The main scale reads {m} mm before the sliding zero.", "Sliding mark {k} lines up: {k} × 0.05 = {=k*0.05} mm.", "{m} + {=k*0.05} = {=m + k*0.05} mm"]}
{"tool": "figure.number", "vars": {"h": [2, 40], "j": [0, 49]}, "q": "What does the micrometer read, in mm?", "fig": {"kind": "reading", "type": "micrometer", "value": "{=h/2 + j/100}", "hide": "value"}, "answer": "h/2 + j/100", "dp": 2, "unit": "mm", "work": ["The sleeve shows {=h/2} mm.", "Thimble mark {j} is on the datum line: {=j/100} mm.", "{=h/2} + {=j/100} = {=h/2 + j/100} mm"]}
```

## Chemistry (1.2.0)

The chemistry sites' generators, ported where Oomba had none and added to the kinds Oomba had (one way to draw each
figure: a lab reading is a type of `reading`, an orbital diagram for heavier elements is still `orbitals`). Oomba
Figures 1.2.0 is a new version folder (the core and its five packs); 1.0.0 and 1.1.0 have shipped and stay byte for
byte, and every chemistry figure 1.1.0 drew draws the same bytes in 1.2.0 unless its data uses a new option
(`tests/unit/figures-v120.test.js`). New builds and the Figures product get 1.2.0. Each figure is drawn from its
numbers and refuses data it cannot draw truthfully:

- `massSpectrum`: one peak per isotope at its mass number, as tall as its abundance (CIAAW 2024 compositions, NIST
  masses: every element's abundances add up to 100 and average to its standard atomic weight); given isotopes must add
  up to 100 and have different mass numbers. `OF.solve.massSpectrum(data).mass` is the relative atomic mass.
- `heatingCurve`: every segment to scale from the substance's specific heats and enthalpies (q = m c ΔT on a slope,
  q = n ΔH on a plateau), along heat in kJ or time at a steady rate; a cooling curve runs the other way and can be
  supercooled.
- `energyProfile`: the peaks and dips are exactly the levels' energies (each transition state above its neighbors);
  Ea, the reverse Ea and ΔH are worked out from them, a catalyst lowers the transition state but not ΔH, and the
  rate-determining step is named only when it is clear cut. `style: "levels"` is an energy level diagram (reactants,
  products and ΔH). Atomic energy levels with transitions came in 1.5.0 (`energyLevels`).
- `nuclide`: the mass number at the top left, the atomic number at the bottom left, the charge at the top right; never
  fewer than 0 neutrons or electrons; nuclear particles with their fixed numbers.
- `lineSpectrum`: each element's strongest visible lines (NIST) at their wavelengths, in their colors; a mixture
  shows every line of its parts; in print, black lines on white.
- `photoelectron`: one peak per sublevel of the real ground state, as tall as its electrons, at its binding energy
  (H to Ca the textbook table, Sc to Xe Lotz 1970), on a log or linear axis growing to the left.
- `particles`: every particle drawn (data that does not fit is refused), seeded so the same data draws the same
  figure; two boxes keep every atom. The discs are grays, so they print as they show.
- Lab readings (`reading`): a buret reads down (to 0.05 mL, with an initial reading for a titre), a beaker's flat
  surface, a gas syringe's plunger, a digital balance's places (and what it holds), a triple beam balance's riders, a
  digital thermometer in °C, K or °F, a pH meter (digital to its places, analog to 0.1) or pH paper (whole numbers; in
  print its 15 swatches are grays from light to dark, which a printer may not tell apart, so print a meter instead),
  and volume by displacement (the object, its area exactly the water it pushed up, must fit under the surface).
- Extensions: `orbitals` for all 118 elements with `core: true` (`[Kr] 5s¹ 4d¹⁰`) and `arrangement: "energy"`, and
  `OF.solve.orbitals` (configuration, core, unpaired electrons); `bohr` with `ionMarks: true` (gained electrons as
  crosses, lost ones on a dashed shell); `halfLife` with `isotopes` (up to three curves); `titration` with measured
  `points`; and more Lewis molecules.

- `dotCross`: a molecule's outer shells as circles overlapping where atoms bond, each shared pair in the overlap (one
  electron from each atom), each atom's own electrons in its own mark (dots, crosses, rings); or an ionic compound's
  ions in brackets, the metal's electrons as crosses in the non-metal's full shell, the charges balanced. Not the same
  figure as `lewis` (no shells) or `bohr` (one atom, every shell). A charged molecule or a dative bond (CO) is refused
  for now (draw it with `lewis`).

Deferred then, both drawn since 1.5.0 ("Chemistry: organic structures and atomic energy levels (1.5.0)"): skeletal
structures with the organic structure editor's views, and atomic energy levels with transitions. Builder trigger words for these figures are in every site language (`server/builder/figures.js`).

```json
{"tool": "figure.number", "vars": {"m": [1, 3], "n": [1, 3]}, "q": "How many electrons does the metal give away in one formula unit of this compound?", "fig": {"kind": "dotCross", "ions": [{"element": "{=10 + m}", "count": "{=n/if(m - n, 1, m)}"}, {"element": "{=18 - n}", "count": "{=m/if(m - n, 1, m)}"}]}, "answer": "m*n/if(m - n, 1, m)", "dp": 0, "work": ["The metal ion is {m}+ and the non-metal ion is {n}−.", "The charges balance with {=n/if(m - n, 1, m)} metal and {=m/if(m - n, 1, m)} non-metal ions.", "Electrons given: {=n/if(m - n, 1, m)} × {m} = {=m*n/if(m - n, 1, m)}"]}
{"tool": "figure.number", "vars": {"m": [6, 60], "a": [51, 95]}, "q": "Element X has two isotopes, shown in its mass spectrum. What is its relative atomic mass?", "fig": {"kind": "massSpectrum", "isotopes": [{"mass": "{m}", "abundance": "{a}"}, {"mass": "{=m + 2}", "abundance": "{=100 - a}"}], "name": "Element X"}, "answer": "(m*a + (m + 2)*(100 - a))/100", "dp": 2, "work": ["Weight each mass number by its abundance.", "({m} × {a} + {=m + 2} × {=100 - a}) ÷ 100", "= {=round((m*a + (m + 2)*(100 - a))/100, 2)}"]}
{"tool": "figure.number", "vars": {"m": [50, 200, 10]}, "q": "{m} g of ice at −20 °C is heated to steam at 120 °C. How much heat melts the ice? (ΔHfus = 6.01 kJ/mol, M = 18.02 g/mol)", "fig": {"kind": "heatingCurve", "substance": "water", "mass": "{m}", "x": "heat"}, "answer": "m/18.02*6.01", "dp": 1, "unit": "kJ", "work": ["n = {m} ÷ 18.02 = {=round(m/18.02, 3)} mol", "q = n × ΔHfus = {=round(m/18.02, 3)} × 6.01", "= {=round(m/18.02*6.01, 1)} kJ"]}
{"tool": "figure.number", "vars": {"r": [20, 80, 5], "t": [100, 200, 10], "p": [0, 90, 5]}, "where": "(t > r + 10) * (t > p + 10) * (p != r)", "q": "What is the activation energy of the forward reaction, in kJ/mol?", "fig": {"kind": "energyProfile", "levels": ["{r}", "{t}", "{p}"], "arrows": ["dh"], "hide": "values"}, "answer": "t - r", "dp": 0, "unit": "kJ/mol", "work": ["Eₐ = E(transition state) − E(reactants)", "= {t} − {r}", "= {=t - r} kJ/mol"]}
{"tool": "figure.number", "vars": {"z": [3, 30], "n": [3, 40]}, "where": "(n >= z) * (n <= 2*z)", "q": "How many neutrons does this nucleus have?", "fig": {"kind": "nuclide", "element": "{z}", "mass": "{=z + n}"}, "answer": "n", "dp": 0, "work": ["Neutrons = mass number − atomic number", "= {=z + n} − {z}", "= {n}"]}
{"tool": "figure.number", "vars": {"a": [400, 700]}, "q": "Element X gives out one visible line. What is the frequency of this light, in units of 10¹⁴ Hz? (c = 3.00 × 10⁸ m/s)", "fig": {"kind": "lineSpectrum", "strips": [{"name": "X", "lines": ["{a}"]}]}, "answer": "3000/a", "dp": 2, "work": ["f = c ÷ λ", "= 3.00 × 10⁸ ÷ ({a} × 10⁻⁹)", "= {=round(3000/a, 2)} × 10¹⁴ Hz"]}
{"tool": "figure.number", "vars": {"z": [3, 20]}, "q": "How many electrons does this atom have?", "fig": {"kind": "photoelectron", "element": "{z}", "hide": "element"}, "answer": "z", "dp": 0, "work": ["Each peak is as tall as the electrons in its sublevel.", "Add the heights of the peaks.", "The atom has {z} electrons."]}
{"tool": "figure.number", "vars": {"a": [3, 10], "b": [2, 8]}, "q": "How many molecules are in the box?", "fig": {"kind": "particles", "particles": [{"count": "{a}", "shape": "pair", "look": {"size": "s", "shade": "white"}, "outer": {"size": "s", "shade": "white"}}, {"count": "{b}", "shape": "bent", "look": {"size": "m", "shade": "dark"}, "outer": {"size": "s", "shade": "white"}}]}, "answer": "a + b", "dp": 0, "work": ["Count each molecule once, whatever its atoms.", "{a} + {b}", "= {=a + b}"]}
{"tool": "figure.number", "vars": {"i": [0, 60], "f": [300, 980]}, "q": "What volume was added from the buret, in mL?", "fig": {"kind": "reading", "type": "buret", "max": 50, "initial": "{=i/20}", "value": "{=f/20}", "hide": "value"}, "answer": "(f - i)/20", "dp": 2, "unit": "mL", "work": ["Initial reading: {=i/20} mL", "Final reading: {=f/20} mL", "Volume added = {=f/20} − {=i/20} = {=(f - i)/20} mL"]}
{"tool": "figure.number", "vars": {"k": [2, 18]}, "q": "What volume of liquid is in the beaker, in mL?", "fig": {"kind": "reading", "type": "beaker", "value": "{=k*12.5}", "max": 250, "step": 25, "hide": "value"}, "answer": "k*12.5", "dp": 1, "unit": "mL", "work": ["The marks are 25 mL apart.", "The surface is at {=k*12.5} mL."]}
{"tool": "figure.number", "vars": {"a": [10, 190]}, "q": "How much gas has the syringe collected, in cm³?", "fig": {"kind": "reading", "type": "syringe", "value": "{=a/2}", "max": 100, "setup": true, "hide": "value"}, "answer": "a/2", "dp": 1, "unit": "cm³", "work": ["Each small mark is 1 cm³.", "The face of the plunger is at {=a/2} cm³."]}
{"tool": "figure.number", "vars": {"h": [0, 5], "t": [0, 9], "f": [0, 199]}, "q": "What mass does the triple beam balance show, in g?", "fig": {"kind": "reading", "type": "tripleBeam", "value": "{=100*h + 10*t + f/20}", "hide": "value"}, "answer": "100*h + 10*t + f/20", "dp": 2, "unit": "g", "work": ["Add the three riders.", "{=100*h} + {=10*t} + {=f/20}", "= {=100*h + 10*t + f/20} g"]}
{"tool": "figure.number", "vars": {"a": [10, 130]}, "q": "What pH does the meter show?", "fig": {"kind": "reading", "type": "pH", "meter": "analog", "value": "{=a/10}", "hide": "value"}, "answer": "a/10", "dp": 1, "work": ["The small marks are 0.2 apart.", "The needle points to {=a/10}."]}
{"tool": "figure.number", "vars": {"b": [20, 60], "r": [4, 20]}, "q": "A rock is lowered into the water. What is its volume, in mL?", "fig": {"kind": "reading", "type": "displacement", "before": "{b}", "after": "{=b + r}", "max": 100, "step": 1, "major": 10, "hide": "value"}, "answer": "r", "dp": 0, "unit": "mL", "work": ["Before: {b} mL. After: {=b + r} mL.", "The rock pushed the water up {=b + r} − {b} = {r} mL.", "Its volume is {r} mL."]}
```

## Biology (1.3.0)

The biology sites' ten live generators, ported where Oomba had none (a new `bio` pack) and the micropipette added to the
kind Oomba had (a type of `reading`, in the measure pack). Oomba Figures 1.3.0 is a new version folder (the core and its
six packs); 1.0.0, 1.1.0 and 1.2.0 have shipped and stay byte for byte, and every figure 1.2.0 drew draws the same bytes
in 1.3.0 (`tests/unit/figures-v130.test.js`). New builds and the Figures product get 1.3.0. Each figure is drawn from its
numbers and refuses data it cannot draw truthfully:

- `populationGrowth`: every point from N0, r and K (dN/dt = rN, rN(K - N)/K; overshoot with a lag; boom and crash),
  as the size, the growth rate or the per capita rate over time or against N; the inflection point at K/2 (fastest
  growth rK/4) and the phases where the steepest tangent meets N0 and K, refused for a curve that starts above K/2; a
  census of seeded counts; an exponential curve that would pass 10¹² is refused.
- `predatorPrey`: the Lotka-Volterra cycles from each population's average (the balance point), its start and the
  cycle's length, worked out numerically so every cycle closes; the predators' peaks follow the prey's. Starting at the
  balance point is refused (nothing cycles).
- `enzymeActivity`: rate against temperature (doubling every width degrees, then denaturing past the optimum), pH (a
  bell either side) or substrate (Michaelis-Menten, a competitive inhibitor raising Km, a non-competitive one lowering
  Vmax). Shape-only axes or numbered ones.
- `photosynthesis`: rate against light (or the lamp's distance, 1/d²), CO₂ or temperature, each curve at its own values
  of the other two, so the limiting factor shows; the plateau, where it levels off and the compensation point come from
  the same model; `net` subtracts respiration.
- `punnett`: gametes and cells from the parents' alleles (monohybrid, dihybrid, X-linked; complete, incomplete,
  codominance); the genotype and phenotype ratios are computed from the cells, daughters and sons apart on an X-linked
  cross. Alleles are tokens (`"C^R"`), not typed text.
- `pedigree`: standard symbols (squares, circles, filled affected, a dot for a carrier, a slash, the proband's arrow); a
  random family for a mode is built by passing real genotypes down, and only a family a student could diagnose is kept;
  a family given with a mode must be consistent with it (genotype elimination proves it, or names who fits no genotype);
  the genotypes written under each person are what the family proves.
- `proteinSynthesis`: the template, coding, mRNA, tRNA and amino acid rows from one strand by base pairing and the
  standard code; codons grouped from the start codon; whole rows or a seeded share of boxes left blank. Every base is
  its letter: the tints on screen are extra, and print is letters on white.
- `gel`: each band as far as its size runs (linear in log10 of the size inside the gel's range, crowding past it),
  against a ladder (NEB 1 kb and 100 bp, lambda HindIII) and a centimeter ruler; bands too close to read as two run
  together, and OF.solve says which.
- `osmosis`: a red blood cell, a plant cell, a split beaker, a U-tube or a dialysis bag; tonicity, the water's
  movement and the result are worked out from the solutes that cannot cross; the dots are to scale (dots per area as the
  concentration), each solute its own shape; a level rises and a bag swells as far as the sides differ.
- `reading` with `type: "micropipette"`: the wheels show exactly the digits of the volume on that model (P2 to P1000), the
  line marks the decimal point; on screen the decimal wheels are red, in print they are gray with the line kept. A volume
  the model cannot be set to is refused.

Skipped (owner decision): the cell diagram, cell division, food web and microscope field of view generators (turned off
on the source's live site). Not ported: the closed chamber's CO₂ and O₂ over time (photosynthesis), the three-up osmosis
panel, the DNA figure's deliberate mistakes and the codon chart. Builder trigger words for these figures are in every
site language (`server/builder/figures.js`).

```json
{"tool": "figure.number", "vars": {"r": {"of": [0.2,0.3,0.4,0.5,0.6,0.8]}, "k": {"of": [200,400,500,800,1000,1200]}}, "q": "This population grows logistically with r = {r} per year. What is its fastest growth rate, in individuals per year?", "fig": {"kind": "populationGrowth", "model": "logistic", "n0": 10, "r": "{r}", "k": "{k}", "span": 30, "unit": "years", "hide": "k"}, "answer": "r*k/4", "dp": 0, "unit": "individuals/year", "work": ["Read K off the graph: K = {k}.", "The fastest growth is at N = K/2: dN/dt = rK/4.", "{r} × {k} ÷ 4 = {=r*k/4}"]}
{"tool": "figure.number", "vars": {"p": [4,12]}, "q": "How many years does one full cycle of the prey take? Read it from peak to peak.", "fig": {"kind": "predatorPrey", "prey": {"average": 50, "start": 20}, "predators": {"average": 20, "start": 12}, "period": "{p}", "span": "{=4*p}", "unit": "years"}, "answer": "p", "dp": 0, "unit": "years", "work": ["Find two prey peaks next to each other.", "Read the time at each.", "The difference is {p} years."]}
{"tool": "figure.number", "vars": {"t": {"of": [25,30,35,40,45,50,55,60]}}, "q": "At what temperature does Enzyme X work fastest, in °C?", "fig": {"kind": "enzymeActivity", "graph": "temperature", "curves": [{"name": "Enzyme X", "opt": "{t}", "width": 10}], "axes": "numbered", "x": [0,100]}, "answer": "t", "dp": 0, "unit": "°C", "work": ["Find the top of the curve.", "Read down to the temperature axis.", "The optimum is {t} °C."]}
{"tool": "figure.number", "vars": {"c": {"of": [0.04,0.05,0.1,0.2,0.4]}}, "q": "At {c}% CO₂ and 30 °C, what is the fastest rate of photosynthesis as the light gets brighter (arbitrary units)?", "fig": {"kind": "photosynthesis", "graph": "light", "curves": [{"co2": "{c}", "temp": 30}], "axes": "numbered", "marks": true}, "answer": "25*c/(0.1 + c)", "dp": 1, "work": ["As the light gets brighter, the rate levels off.", "Then CO₂ (or temperature), not light, is the limiting factor.", "Read the plateau: {=round(25*c/(0.1 + c), 1)}"]}
{"tool": "figure.number", "vars": {"a": [0,2], "b": [0,2]}, "q": "Tall (T) is dominant to short (t). What percent of the offspring are short?", "fig": {"kind": "punnett", "letters": ["T"], "parents": [["{a}"],["{b}"]], "names": {"T": "tall", "t": "short"}, "hide": "ratios"}, "answer": "(2 - a)*(2 - b)*25", "dp": 0, "unit": "%", "work": ["Short plants are tt.", "Count the tt cells out of 4.", "{=(2 - a)*(2 - b)} of 4 = {=(2 - a)*(2 - b)*25}%"]}
{"tool": "figure.choice", "vars": {"m": [0, 2], "s": [1, 400]}, "q": "Which inheritance pattern does this family show?", "fig": {"kind": "pedigree", "mode": "{m}", "seed": "{s}", "generations": 3}, "choices": ["autosomal dominant", "autosomal recessive", "X-linked recessive"], "answer": "m", "work": ["Look for affected children of unaffected parents (recessive), or the trait in every generation (dominant).", "Check whether mostly males are affected (X-linked).", "The pattern is {choice}."]}
{"tool": "figure.number", "vars": {"s": {"of": ["GCAUGGCUUCAAAGGGCUGGACCGAAUUCCGA", "CAUGUUUGGACACGAUCCGGUAGCAAAACUG", "UCAUGCCCGGAUUACUCGAAGCUUGGCACGUC", "ACAUGAAAGUUCUCGGCCAGUUGGAUCCUAAC", "GGAUGCGAACCUUUGGGCAGCAAUCGGUGCUU"]}, "n": [3,8]}, "q": "Translation starts at the first AUG. How many amino acids does this mRNA code for?", "fig": {"kind": "proteinSynthesis", "mrna": "{s}", "rows": ["mrna"], "codons": "{n}"}, "answer": "n", "dp": 0, "work": ["Find the start codon, AUG.", "Count the codons from there: each codon is one amino acid.", "There are {n} amino acids."]}
{"tool": "figure.number", "vars": {"a": [5,30], "b": [5,30]}, "where": "(a - b >= 4) + (b - a >= 4)", "q": "A plasmid was cut into the pieces in lane 2. How long was the plasmid, in bp?", "fig": {"kind": "gel", "gel": "1", "lanes": [{"ladder": "1kb"},{"label": "Digest", "bands": ["{=100*a}", "{=100*b}"]}], "values": true}, "answer": "100*(a + b)", "dp": 0, "unit": "bp", "work": ["The pieces add up to the whole plasmid.", "{=100*a} + {=100*b}", "= {=100*(a + b)} bp"]}
{"tool": "figure.choice", "vars": {"m": [0, 2], "k": [2, 8], "c": [5, 30]}, "q": "Urea crosses the membrane; salt does not. Which way does water move across the cell membrane?", "fig": {"kind": "osmosis", "scene": "blood", "solutes": [{"name": "salt", "inside": 0.9, "outside": "{=0.9 + (m == 1)*k/10 - (m == 0)*k/10}"}, {"name": "urea", "inside": 1, "outside": "{=c/10}", "cross": true}], "view": "start", "particles": false, "arrows": false, "hide": "tonicity"}, "choices": ["into the cell", "out of the cell", "no net movement"], "answer": "m", "work": ["Urea crosses the membrane, so it does not count.", "Compare the salt: 0.9% inside, {=0.9 + (m == 1)*k/10 - (m == 0)*k/10}% outside.", "Water moves toward the side with more salt that cannot cross. Answer: {choice}."]}
{"tool": "figure.number", "vars": {"m": [20,200]}, "q": "What volume is the micropipette set to, in µL?", "fig": {"kind": "reading", "type": "micropipette", "model": "P20", "value": "{=m/10}", "hide": "value"}, "answer": "m/10", "dp": 1, "unit": "µL", "work": ["A P20 reads tens, ones and tenths of a µL.", "The red wheel, below the line, is the tenths.", "The volume is {=m/10} µL."]}
```

## Economics (1.4.0)

The economics site's seven live generators, ported where Oomba had none (a new `econ` pack). Oomba Figures 1.4.0 is a new
version folder (the core and its seven packs); 1.0.0 to 1.3.0 have shipped and stay byte for byte, and every figure 1.3.0
drew draws the same bytes in 1.4.0 (`tests/unit/figures-v140.test.js`). New builds and the Figures product get 1.4.0.
Economics graphs are schematic (no numbers on the axes, on a hidden 0-to-10 grid) unless numbers are given, so
"truthful" means that every equilibrium, quantity, shift and shaded area is worked out from the curves, never placed by
eye, and data the curves cannot honor is refused:

- `supplyDemand`: schematic shapes (normal, steep, flat, upright, level) or numbered curves (a price intercept and slope,
  an upright quantity, or a schedule, run on to the axes for the surplus); a shift of either or both; a price ceiling or
  floor (a control that does not bind says so, and the quantities demanded and supplied are read off the curves); a tax
  or subsidy (the buyers' and sellers' prices and the quantity from the shifted supply curve); consumer and producer
  surplus, deadweight loss and tax revenue shaded, their areas exact (each corner of a schedule's curve is kept). Curves
  that do not cross, cross off the graph or below 0, a tax with a control, and surplus with an upright or flat curve
  are refused.
- `moneyMarket`: the money market (an upright money supply), loanable funds and the market for reserves (the demand for
  reserves flat, sloping, then flat; ample reserves keep the rate on the flat bottom, limited ones on the slope), with
  shifts; OF.solve gives which way the rate and quantity move.
- `businessCycle`: real GDP around a rising trend, irregular cycles from a seed; the peaks, troughs, expansions,
  contractions, recessions and recoveries are found on the wave as drawn; a trend that rises faster than the cycle
  falls is refused. Letters for a quiz, or each label a line to write on.
- `phillipsCurve`: the short-run curve crosses the long-run curve at the natural rate and expected inflation; along it
  A to B, back to the long run at C (expected inflation catches up), a supply shock or new expectations, or the natural
  rate moving; numbered from the rates in %, with a short-run curve that must slope down through both points.
- `possibilitiesCurve`: bowed out, straight or bowed in; points on, inside or outside every curve drawn; a shift out or in
  or a pivot; each step's opportunity cost from the points' own amounts; two countries' straight curves with each one's
  opportunity costs and comparative advantage (equal costs, where neither has one, are refused).
- `adAs`: AD, SRAS (straight or three ranges) and LRAS; a recessionary or inflationary gap; shifts by a size or as far as
  closes the gap ("full"), worked out on the curves; numbered from a schedule of price levels (a smooth curve through
  the rows that never overshoots them) and potential GDP. An inflationary gap on the three-range curve is refused.
- `costCurves`: MC, ATC, AVC and AFC from one cubic total cost, so MC crosses AVC and ATC at their lowest points exactly;
  a price taker (P = MC, or shut down below the lowest AVC), a monopoly (MR = MC, regulated at P = MC or P = ATC) or a
  monopolistic competitor (short run, or long run with demand tangent to ATC and its excess capacity); profit or loss,
  consumer surplus and deadweight loss shaded. MC dipping below the axis, or an outcome off the graph, is refused.

In print every curve is black and is told apart by its name and its dash; each shaded region is a gray with its own
hatching (consumer surplus at 45 degrees, producer surplus at -45, deadweight loss level, revenue upright), so no
meaning is carried by color alone. Not ported: the source's label placer and panel layout (Oomba places its own), the
perfectly competitive firm beside its market panel, the AD-AS callout, and a schedule's dots. Builder trigger words for
these figures are in every site language (`server/builder/figures.js`).

```json
{"tool":"figure.number","vars":{"p":[2,8],"q":{"of":[20,30,40,50,60]}},"q":"Demand meets the price axis at ${=p + q/10}. What is the consumer surplus at the equilibrium, in dollars?","fig":{"kind":"supplyDemand","demand":{"at":"{=p + q/10}","slope":-0.1},"supply":{"at":"{=p - q/20}","slope":0.05},"y":[0,"{=p + q/10 + 1}"],"shade":["cs"],"xtitle":"Quantity","ytitle":"Price ($)"},"answer":"q*q/20","dp":0,"unit":"$","work":["Consumer surplus is the triangle under demand and over the price.","Its height is {=p + q/10} − {p} = {=q/10}, its base {q}.","½ × {q} × {=q/10} = {=q*q/20}"]}
{"tool":"figure.choice","vars":{"s":{"of":[1,-1]},"d":{"of":[1,-1]}},"q":"Money supply and money demand both shift as shown. What happens to the nominal interest rate?","choices":["rises","stays the same","falls"],"answer":"1 - (d - s)/2","work":["More money supplied lowers the interest rate; more money demanded raises it.","Compare i₁ and i₂ on the graph.","The nominal interest rate {choice}."],"fig":{"kind":"moneyMarket","graph":"money","shift":{"supply":"{s}","demand":"{d}"}}}
{"tool":"figure.number","vars":{"n":[1,4],"s":[1,900]},"q":"How many recessions (a fall from a peak to the next trough) does the graph show?","fig":{"kind":"businessCycle","cycles":"{n}","start":"peak","irregularity":0.5,"seed":"{s}","shade":false,"hide":"labels"},"answer":"n","dp":0,"work":["Find each peak.","Count each fall from a peak down to the next trough.","There are {n}."]}
{"tool":"figure.number","vars":{"u":{"of":[4,5,6]},"e":[1,4],"k":[2,5]},"q":"The economy moves along the short-run Phillips curve from A to B, then expectations catch up and it moves to C. What is inflation at C, in %?","fig":{"kind":"phillipsCurve","nru":"{u}","expected":"{e}","u2":"{=u - 2}","pi2":"{=e + k}","movement":"along","longRun":true,"hide":"values"},"answer":"e + k","dp":0,"unit":"%","work":["C is on the long-run curve, at the natural rate.","Inflation at C is the same as at B: expected inflation has caught up.","Read B: {=e + k}%."]}
{"tool":"figure.number","vars":{"a":{"of":[10,20,30,40,60]},"b":{"of":[10,20,40,50,60]}},"where":"a != b","q":"What is Country A's opportunity cost of 1 ton of wheat, in tons of cloth?","fig":{"kind":"possibilitiesCurve","countries":[{"name":"Country A","x":"{a}","y":"{b}"},{"name":"Country B","x":30,"y":30}],"goods":["Wheat (tons)","Cloth (tons)"]},"answer":"b/a","dp":2,"unit":"tons of cloth","work":["Country A gives up {b} tons of cloth to make {a} tons of wheat.","One ton of wheat costs {b} ÷ {a} tons of cloth.","= {=round(b/a, 2)}"]}
{"tool":"figure.choice","vars":{"p":{"of":[80,90,100,110]},"y":{"of":[85,87,89,91,93,95,95,95,97,99,101,103,105]}},"q":"Potential GDP is 9,500 (billions of dollars). At the equilibrium where AD crosses SRAS, what does the economy have?","choices":["a recessionary gap","an inflationary gap","no output gap"],"answer":"if(y < 95, 0, if(y > 95, 1, 2))","work":["Read real GDP where AD crosses SRAS: {=100*y}.","Real GDP minus potential GDP: {=100*y} − 9,500 = {=100*y - 9500}.","Below potential is a recessionary gap, above it an inflationary gap. Answer: {choice}."],"fig":{"kind":"adAs","schedule":[[70,"{=100*y - 60*(70 - p)}","{=100*y + 40*(70 - p)}"],[80,"{=100*y - 60*(80 - p)}","{=100*y + 40*(80 - p)}"],[90,"{=100*y - 60*(90 - p)}","{=100*y + 40*(90 - p)}"],[100,"{=100*y - 60*(100 - p)}","{=100*y + 40*(100 - p)}"],[110,"{=100*y - 60*(110 - p)}","{=100*y + 40*(110 - p)}"],[120,"{=100*y - 60*(120 - p)}","{=100*y + 40*(120 - p)}"],[130,"{=100*y - 60*(130 - p)}","{=100*y + 40*(130 - p)}"]],"potential":9500,"xtitle":"Real GDP (billions)","ytitle":"Price level","hide":"gap"}}
{"tool":"figure.number","vars":{"c":{"of":[3,3.5,4,4.5,5]},"q":{"of":[4,5,6,7]}},"q":"This perfectly competitive firm is in long-run equilibrium: the price is at the lowest point of ATC. What is the price?","fig":{"kind":"costCurves","market":"perfect","price":"breakeven","atc":{"q":"{q}","cost":"{c}"},"mcSlope":1,"axes":"numbered","hide":"values"},"answer":"c","dp":2,"unit":"$","work":["In the long run, entry and exit push the price to the lowest ATC.","Find where MC crosses ATC: the lowest point of ATC.","Read across: ${c}."]}
```

## Physics and the cladogram (1.7.0)

Seven physics kinds in the physics pack and the cladogram in the bio pack. Oomba Figures 1.7.0 is a new version folder
(the core and its seven packs, no new pack); 1.0.0 to 1.5.0 have shipped and stay byte for byte, and every catalog figure
the previous version drew draws the same bytes in 1.7.0 (`tests/unit/figures-v170.test.js`). New builds and the Figures
product get 1.7.0. Only the logic and layout are ported (`docs/third-party.md`): the field tracing (`ported/fields.js`),
circular motion's arrow sizes (`ported/circular.js`), the lever's sums and drawn arms (`ported/lever.js`), the beam's
torques (`ported/moments.js`), the pendulum's layout (`ported/pendulum.js`), the spring's coil (`ported/spring.js`), the
roller coaster's track curve (`ported/track.js`) and the cladogram's tree and layout (`ported/clado.js`). Reading the
data, the checks, the answers (`OF.solve`) and every drawing are Oomba's own (`circular.js`, `fields.js`, `lever.js`,
`torque.js`, `pendulum.js`, `spring.js`, `coaster.js`, `cladogram.js`; `mech.js` their words and shared parts).

- `circularMotion`: a top view (an object on a dashed circle, a string, a turntable or a curved road, at up to 8
  places), a vertical circle (a ball on a string, a car in a loop, over a hill or through a dip) or a conical pendulum.
  Velocity and acceleration are dashed (motion), forces solid. With `radius` and `speed` (or `period`) and `mass`,
  `OF.solve.circularMotion` gives `acceleration` (v²/r), `force` (mv²/r), `period`, `omega`, the tension or normal
  force at the top and bottom (`contactTop`, `contactBottom`), a conical pendulum's `radius`, `speed` and `tension`, and
  `velocityDir` and `accelerationDir` where the object is first drawn. A car too fast for the top of a hill, or too slow
  for the top of a vertical circle, is refused with the speed that would work.
- `fields`: field lines traced through the real field (charges fall off as 1/r², so they curve truthfully and never
  cross): one charge, opposite or like charges, up to 4 charges of the teacher's own (`charges`, sizes up to ±3, more
  lines from a bigger charge), parallel plates, a bar magnet (north on the right) or a wire seen end-on. `points` mark
  named spots; `OF.solve.fields` gives each one's field `direction`, `angle` and relative `strength`, which of the first
  two is `stronger`, and whether two charges `attract` or `repel`. A point on a charge, wire or magnet is refused.
- `lever`: a class 1, 2 or 3 lever drawn to scale from its arms (no arm shorter than 15% of the beam), the load a block
  or an arrow, the effort's arrow, the names and values, and the arms' dimension lines. The effort is never given:
  `OF.solve.lever` works it out (weight × load arm ÷ effort arm; a mass is weighed at 9.8 N/kg) with the mechanical
  advantage. Arms that do not suit the class are refused (class 2 has the longer effort arm, class 3 the longer load arm).
- `torque`: a beam on a pivot, two supports or a wall (with or without a cable), up to 6 loads (hanging, resting, or a
  force down or up), the beam's own weight, and dimension lines from the pivot, support A or the wall. `OF.solve.torque`
  gives each load's torque (clockwise positive), the `net` torque and which way it `turns`, the pivot's force, the value
  (`balanceValue`) and distance from the pivot (`balanceDistance`) that would balance each load (numbered from 1), the
  forces at two supports, and the cable's tension and the wall's force. A cable that would have to push is refused.
- `pendulum`: the swing (A where it is released, B at the bottom, C on the far side) or one bob with its forces (tension
  and weight, and weight's components along the string and the path). With `length` (m), `OF.solve.pendulum` gives the
  `period` 2π√(L/g), the drop `height` L(1 − cos θ) and the `speed` at the bottom √(2gh); with `mass`, the `energy` and
  the tensions.
- `spring`: hanging or on a floor, one copy, before and after, or three positions of an oscillation; 1 to 3 springs in
  series or parallel. `stretch` is only the drawing; the numbers are `k`, `extension` (m) or a hanging `mass`.
  `OF.solve.spring` gives the combined `k`, the `extension`, the `force` kx, the elastic `energy` ½kx² and the `period`.
- `rollerCoaster`: a smooth track through 2 to 8 points that never overshoots them, a loop standing on a point, a cart,
  ball or block, rough stretches and height marks. `OF.solve.rollerCoaster` works the `speeds` out from the
  conservation of energy (no friction, moving right from where the object is), the `fastest` and `slowest` points, the
  energies with a mass, and for a loop the least starting height that carries it round from rest (`loopMinHeight`,
  2.5R above the loop's base) and whether it does. A rough stretch ends the sums there.
- `cladogram`: a cladogram (taxa along the top) or a phylogenetic tree (`style: "rectangular"`) of up to 16 taxa with
  their traits ticked on the branches, from a ready-made `setup`, a ladder of `taxa` and `traits`, `letters` (A, B, C...
  with numbered traits) or the teacher's `tree`. `mark` boxes traits or taxa, and `OF.solve.cladogram` answers about
  them: how many taxa share the first (`marked.shared`), which of two came first (`firstTrait`), a taxon's
  closest relative (`sister`); and `shared`, `first` and `outgroup` for the whole tree. hide `"traits"` leaves
  numbered blank lines for the traits (the key names them).

Each kind has three figure question generators in the catalog (24 in all: the number answers and the choices above);
the first of each:

```json
{"tool":"figure.number","vars":{"v":[2,12],"r":[1,6]},"where":"v != r","q":"The object goes round the circle at a steady speed. What is its centripetal acceleration?","fig":{"kind":"circularMotion","radius":"{r}","speed":"{v}"},"answer":"v*v/r","dp":2,"unit":"m/s²","work":["a = v² ÷ r","= {v}² ÷ {r}","= {=round(v*v/r, 2)} m/s²"]}
{"tool":"figure.choice","vars":{"p":{"of":[0,1,2,3]}},"q":"The current in the wire flows out of the page. Which way does the magnetic field point at P?","fig":{"kind":"fields","setup":"wire","current":"out","points":[{"name":"P","x":"{=110*(p == 3) - 110*(p == 1)}","y":"{=110*(p == 0) - 110*(p == 2)}"}],"hide":"arrows"},"choices":["up","down","left","right"],"answer":"2*(p == 0) + (p == 1) + 3*(p == 2)","work":["Right-hand rule: point your thumb out of the page, and your fingers curl counterclockwise.","Going counterclockwise around the wire, the field at P points {choice}.","Answer: {choice}."]}
{"tool":"figure.number","vars":{"L":[50,500,50],"d":[2,8],"e":[10,20]},"q":"The lever balances. What effort does it need?","fig":{"kind":"lever","class":1,"effortArm":"{=e/10}","loadArm":"{=d/10}","load":"{L}","hide":"effort"},"answer":"L*d/e","dp":1,"unit":"N","work":["Load × load arm = effort × effort arm","{L} × {=d/10} = effort × {=e/10}","Effort = {=round(L*d/e, 1)} N"]}
{"tool":"figure.number","vars":{"w1":[2,10],"w2":[2,10],"a":[1,4],"b":[6,9]},"where":"(w2*(b - 5) - w1*(5 - a) > 0) * (w2*(b - 5) - w1*(5 - a) != 5 - a) * (w2*(b - 5) - w1*(5 - a) != b - 5) * (w2*(b - 5) - w1*(5 - a) != 10*w1) * (w2*(b - 5) - w1*(5 - a) != 10*w2)","q":"Take clockwise as positive. What is the net torque on the beam about the pivot?","fig":{"kind":"torque","loads":[{"at":"{=a/10}","value":"{w1}"},{"at":"{=b/10}","value":"{w2}"}]},"answer":"(w2*(b - 5) - w1*(5 - a))/10","dp":2,"unit":"N·m","work":["Clockwise: {w2} × {=(b - 5)/10} = {=w2*(b - 5)/10} N·m","Counterclockwise: {w1} × {=(5 - a)/10} = {=w1*(5 - a)/10} N·m","Net = {=w2*(b - 5)/10} − {=w1*(5 - a)/10} = {=(w2*(b - 5) - w1*(5 - a))/10} N·m"]}
{"tool":"figure.number","vars":{"L":[2,40]},"q":"What is the period of this pendulum? (g = 9.8 m/s²)","fig":{"kind":"pendulum","picture":"one","angle":10,"length":"{=L/10}"},"answer":"2*pi*sqrt(L/98)","dp":2,"unit":"s","work":["T = 2π √(L ÷ g)","= 2π √({=L/10} ÷ 9.8)","= {=round(2*pi*sqrt(L/98), 2)} s"]}
{"tool":"figure.number","vars":{"k":[50,400,50],"x":[2,20]},"q":"The spring is stretched by the force F. How big is F?","fig":{"kind":"spring","orientation":"horizontal","picture":"one","k":"{k}","extension":"{=x/100}","appliedForce":true,"hide":"force"},"answer":"k*x/100","dp":1,"unit":"N","work":["Hooke's law: F = k x","= {k} × {=x/100}","= {=k*x/100} N"]}
{"tool":"figure.number","vars":{"a":[30,60],"b":[0,10],"c":[10,25],"e":[0,9]},"where":"(round(sqrt(19.6*(a - c)), 1) != a) * (round(sqrt(19.6*(a - c)), 1) != b) * (round(sqrt(19.6*(a - c)), 1) != c) * (round(sqrt(19.6*(a - c)), 1) != e)","q":"The cart starts from rest at A. How fast is it going at C? (g = 9.8 m/s², no friction)","fig":{"kind":"rollerCoaster","points":[{"height":"{a}"},{"height":"{b}"},{"height":"{c}"},{"height":"{e}"}]},"answer":"sqrt(19.6*(a - c))","dp":1,"unit":"m/s","work":["Energy is kept: g h_A = g h_C + ½ v²","v = √(2 × 9.8 × ({a} − {c}))","= {=round(sqrt(19.6*(a - c)), 1)} m/s"]}
{"tool":"figure.number","vars":{"k":[1,7]},"q":"How many of the animals in the cladogram have the boxed trait?","fig":{"kind":"cladogram","taxa":["Lancelet","Lamprey","Shark","Perch","Frog","Lizard","Mouse"],"traits":["Notochord","Vertebrae","Jaws","Bony skeleton","Four limbs","Amniotic egg","Hair"],"mark":[{"trait":"{k}"}]},"answer":"8 - k","dp":0,"work":["A trait is gained on the branch where its tick is.","Every animal that branches off above that tick has it.","Animals with the boxed trait: {=8 - k}"]}
```

## Figure question generators in Figures worksheets

The generators in this page (and in the Figures product's catalog, `public/js/figures-catalog.js`) are written in the
gen language of Oomba Canvas (the `gen` line in the rules above), with two things a Figures worksheet takes that an Oomba
Canvas activity does not (its keypad has no minus sign and its answers are tapped from 2 to 4):

- **Negative numbers.** A `figure.number` generator's answer may be below 0 (a thermometer under freezing, a fall in
  price, a gap below potential). The worksheet's blank takes a minus sign (a ± button on phones), and the marking reads
  "-5", "−5" and "- 5" alike. In an Oomba Canvas activity keep answers 0 or more, as its rules say.
- **Multiple choice.** `{ "tool": "figure.choice", "vars", "q", "fig", "choices": ["rises", "stays the same", "falls"],
  "answer": "1 - (d - s)/2", "work": [..., "The nominal interest rate {choice}."] }`: 2 to 6 short, different options in the order every
  student sees them (the printed sheet letters them A, B, C); `answer` is the index of the right one (0 for the first),
  a number or a formula; `{choice}` in the question or the worked lines is the right option's words, and the last
  worked line must say it. The figure must show the answer plainly (hide the part that names it).
- **Answers from OF.solve.** In the catalog a generator also names `key`, the OF.solve value its answer is. A number
  generator's answer is that value. A choice generator's `key` may name a word OF.solve gives (`mode`, `water`,
  `gapType`) or a number (`rateChange`), and `pick` maps each value to its option (`{ "ad": 0, "ar": 1, "xr": 2 }`):
  the right option is the one OF.solve's value picks, the generator's own `answer` formula must agree (the tests deal
  many seeds and compare), and a worksheet question keeps working it out from the figure while its options are still
  the generator's (`answerKey` `"gen:<generator>"`), even after the teacher changes the figure.

The four generators that asked for a number in place of the natural question now ask it: the pedigree's inheritance
pattern (it was "write 1, 2 or 3"), which way water moves in osmosis (it was the total solute concentration), which way
the nominal interest rate moves in the money market (it was "write 1, 2 or 3") and what kind of output gap AD-AS shows
(it was the size of a recessionary gap, never its sign); the thermometer reads below 0 as its scale does.

## The figure catalog for the AI drafters

Three drafters are shown the same catalog and nothing else (`services/figures.js` `figureCatalog`): the worksheet
drafter ("Power with AI"), the test drafter ("Build a test") and the lesson drafter ("Draft with AI",
`services/lesson-ai.js`, for a Figures tester, passed in beside the game catalog). An entry is a kind with at least one
generator (so a bad figure can always be replaced): `{ id, subject, grades, description, params, example, keys }`.
`params` is the kind's parameter schema, read from its example and the catalog's `extra` and `options`: each field is
`"number"`, `"text"`, `"bool"`, `"list"`, `"object"` or its fixed list of values. `keys` are the OF.solve values of the
example an answer may name (`answerKey`). The test drafter also sees the generators (`genCatalog`: id, kind, subject,
grade bands, number or choice, its question) and is told to prefer them, so every question can be dealt new numbers.

The server never trusts a drafted figure: an unknown kind or generator is dropped (the lesson drafter keeps its question
as words), data that fails `OF.check`, an `answerKey` that is not an OF.solve value or bad options are replaced by that
kind's generator, and each repair is logged with the kind and why, never the teacher's words.

## Chemistry: organic structures and atomic energy levels (1.5.0)

The two chemistry kinds deferred in 1.2.0, now in the chem pack. Oomba Figures 1.5.0 is a new version folder (the core
and its seven packs, no new pack); 1.0.0 to 1.4.0 have shipped and stay byte for byte, and every catalog figure 1.4.0
drew draws the same bytes in 1.5.0 (`tests/unit/figures-v150.test.js`). New builds and the Figures product get 1.5.0.

- `skeletal`: an organic structure as plain lines and text, drawn by Oomba (no browser library), so a printed worksheet,
  the server's thumbnails and a student's lesson step show it as the screen does. One shape, four views, as the source's
  organic structure editor draws them (`ported/organic.js`): the skeletal formula (carbons hidden; `ends: true` writes
  a chain's CH₃ ends), the carbon skeleton (each carbon a C), the condensed formula (CH₃, CH₂, OH; written backward,
  H₃C and HO, when its bonds all come from the right; `acids: true` writes CO₂H), and the full structural formula (every
  hydrogen drawn, spread evenly on 30 degree steps). No view moves an atom. Hydrogens are never given: each atom's are
  worked out from its usual valence (C 4, N 3, O 2, S 2, P 3, halogens 1; R and X take one bond and none). `numbers:
  true` numbers the carbons the way high school naming does (`flip` from the other end); `chiral` marks centers
  with an asterisk. The shape comes from one of three forms. `smiles`: SMILES-lite (the organic subset: C, N, O, S, P,
  F, Cl, Br, I, R and X, lowercase c and n in rings of six, branches, - = #, ring digits 1 to 9, and "." between
  molecules; no brackets, charges, isotopes or stereo marks), laid out by Oomba on 30 degree steps, chains zigzag
  (`layout: "straight"` for a full structural formula's straight chain), single rings of 3 to 8 as regular polygons.
  `chain`: a straight chain of 1 to 12 carbons with `double` and `triple` bonds (the bond from carbon k to k + 1) and
  `groups` (OH, NH2, F, Cl, Br, I, CH3, C2H5, =O), what a generator deals. `atoms` with `bonds`: atoms placed by
  hand (x and y in bond lengths, y up; `h` places an atom's hydrogens in the full formula), as the editor's teacher
  draws them. Refused with the reason: an atom with more bonds than its element can have, rings that share atoms
  (fused, spiro, bridged: give them as `atoms`), aromatic atoms outside a ring of six, a layout where atoms or bonds
  would overlap, a skeletal formula that would hide a carbon in a straight line, and numbering two rings or a ring
  with N or O. `OF.solve.skeletal` gives the molecular formula (Hill order), each element's count (`atoms.H`),
  `carbons`, `hydrogens`, the molar mass (IUPAC standard atomic weights; none with R or X), the degree of
  unsaturation, rings, double and triple bonds, and the functional groups counted (`groups.alcohol`, alkene, alkyne,
  arene, phenol, ether, aldehyde, ketone, carboxylicAcid, ester, amine, amide, nitrile, haloalkane). hide: "name" (the
  caption is a line to write on), "formula" (the molecular formula under it), `true` (both). Print is black; on
  screen, O, N, S, P and the halogens are in color.
- `energyLevels`: atomic energy levels with electron transitions (Oomba's own; the source has no such generator).
  Hydrogen's levels, or a one-electron ion's (`z` 2 to 6), E = -13.6 Z²/n² eV (the Bohr model's textbook value), up to
  `top` (n = 2 to 7), or any atom's `levels` in eV. Every level is drawn exactly at its energy, n = ∞ (0 eV) dashed at
  the top; where lines crowd, their labels spread apart on leaders while the lines stay true. Each transition is a
  vertical arrow between its levels: emission down (solid), absorption up (dashed), `to: "inf"` ionization; on screen a
  visible photon's arrow is in its color. The labels are its photon's wavelength (λ = hc/ΔE, hc = 1239.84 eV·nm), its
  energy, or both (`show`); `cascade: 4` draws every way down from n = 4; `series: true` names hydrogen's series. Levels too
  close for an arrow at the figure's `height` are refused (make it taller, or leave that arrow out). `OF.solve.energyLevels`
  gives the levels, the ionization energy, each transition's photon (eV, J, nm, Hz, emission or absorption, UV, visible
  or IR, series), the first transition's `wavelength`, `energy`, `joules` and `frequency`, and `lines` (how many).
  hide: "values" (the arrows' labels), "levels" (the levels' energies), `true` (both).

Builder trigger words for both are in every site language (`server/builder/figures.js`).

```json
{"tool":"figure.number","vars":{"n":[3,8],"k":[1,7]},"where":"k < n","q":"Each corner and end of a skeletal formula is a carbon with enough hydrogens to make four bonds. How many hydrogen atoms does this molecule have?","fig":{"kind":"skeletal","chain":"{n}","double":["{k}"]},"answer":"2*n","dp":0,"work":["Count the carbons: {n}.","One C=C double bond: an alkene, CₙH₂ₙ.","2 × {n} = {=2*n} hydrogen atoms"]}
{"tool":"figure.number","vars":{"n":[3,6],"m":[1,2]},"q":"The electron in a hydrogen atom falls from n = {n} to n = {m}. What is the wavelength of the light it gives out, in nm? (Eₙ = −13.6 ÷ n² eV, hc = 1239.84 eV·nm)","fig":{"kind":"energyLevels","transitions":[{"from":"{n}","to":"{m}"}],"hide":"values"},"answer":"1239.84198/(13.6*(1/(m*m) - 1/(n*n)))","dp":0,"unit":"nm","work":["ΔE = 13.6 × (1/{m}² − 1/{n}²) = {=round(13.6*(1/(m*m) - 1/(n*n)), 3)} eV","λ = hc ÷ ΔE = 1239.84 ÷ {=round(13.6*(1/(m*m) - 1/(n*n)), 3)}","= {=round(1239.84198/(13.6*(1/(m*m) - 1/(n*n))), 0)} nm"]}
```

## Radians (1.1.0)

The formula language (`canvas/src/expr.js`) works in degrees, as school trigonometry does, and stays so: it is frozen
inside Oomba Canvas 1.3.0 and Oomba Figures 1.0.0. A `grid` or `tableOfValues` in radians says `angles: "radians"`, and
its formulas are rewritten before they are worked out (`figures/src/radians.js`): `sin(x)` becomes `sin((x)*180/pi)`
and `asin(v)` becomes `(asin(v)*pi/180)`. Without it nothing changes: the same data draws the same SVG as before, byte
for byte. `OF.expr(text, values, { angles: "radians" })` works one formula out the same way. A generator's own formulas
(`gen`, worked out by Oomba Canvas) stay in degrees: to use radians there, write the conversion (`sin(a*180/pi)`).

## Math labels

A shape's labels are typeset as math by Oomba's own small typesetter (`mathtext.js`): plain SVG text, fraction bars and
root signs, in a serif font, with nothing to parse. A label is structured data, written the way the Builder writes JSON:

- a **number**: written in the reader's numbers (their decimal mark, Latin digits in Arabic) with a true minus sign;
- a **string**: Latin and Greek letters italic (π stays upright), digits and signs upright, `-` a true minus, `'` a
  prime (`"A'"` is A′), and `+ − × ÷ ± = < > ≤ ≥ ≠` get their spaces; otherwise written as it is (so write numbers that
  need the reader's decimal mark as numbers, not inside strings);
- a **list of pieces**, written one after another: `[3, { "sqrt": 5 }]` is 3√5, `["x", { "sup": 2 }]` is x²;
- `{ "frac": [top, bottom] }` a stacked fraction (`"slash": true` writes top/bottom on the line), `{ "sqrt": x, "times":
  k }` k√x, `{ "pi": k }` kπ, `{ "sup": x }` and `{ "sub": x }` raised or lowered after what comes before, `{ "text":
  "words" }` upright words. Each part is itself a label.

Why data and not a typed syntax: Oomba Figures takes structured data everywhere (a fraction is `[n, d]`, a multiple of π
is `{ "pi": k }`), the Builder writes JSON reliably, and a label that is data can be checked (a list `[5, 2]` is refused
with "write a fraction as { frac: [5, 2] }") and evaluated (`{ "sqrt": 8 }` states 2.83..., so it must match the side it
labels) without a math parser. A label is at most 24 pieces and each string 30 characters.

## The notice on exported figures

A figure made in Oomba that leaves the site carries Oomba's notice: "Made with Oomba Academy. Everything Oomba Academy
contributes to this figure is dedicated to the public domain under CC0 1.0
(https://creativecommons.org/publicdomain/zero/1.0/). Anything original added by the person who made it is theirs."
`OF.notice` is that text and `OF.withNotice(svgText)` puts it into a figure's SVG as `<metadata>` (Creative Commons'
RDF: `dc:rights` and `cc:license`). Figures drawn on a page or a printed worksheet do not carry it. The export path is the
Figures product's editor (`/figures/:kind`, docs/decisions.md "Figures, the standalone product"): Download SVG is
`OF.withNotice`, and Download PNG and Copy image carry the same words as a PNG tEXt "Copyright" chunk and an XMP iTXt
chunk (`public/js/figures-export.js`).

## Not yet

Organic structures print since 1.5.0 (`skeletal`); rings that share atoms (naphthalene, steroids, bridged rings) are not
laid out automatically: give them as `atoms` with places, or draw them with `OF.structure` (SmilesDrawer, browser only).
Atomic energy levels with transitions came in 1.5.0 (`energyLevels`). Optics with thick lenses, 3D molecules and moving physics (Phaser's
built-in Matter physics already serves arcade games) are later. Compound circuits beyond one level of branches came in
1.1.0 (`circuit` with `layout: "network"`, series-parallel only: a bridge circuit, which is neither, is not drawn).
