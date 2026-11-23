// British English words of the Figures question generators (public/js/figures-gen-words/index.js): only what differs
// from the catalog's US English (spelling and the words a UK class uses); everything else falls back to it.
export default {
  "trapezoid": {
    "q": "What is the area of the trapezium?"
  },
  "circle": {
    "q": "O is the centre of the circle. Find the inscribed angle x."
  },
  "prism": {
    "q": "What is the volume of the cuboid?"
  },
  "waves": {
    "q": "What is the wavelength of this wave, in metres?"
  },
  "reading.ruler": {
    "q": "How long is the bar, in centimetres?"
  },
  "reading.buret": {
    "q": "What volume was added from the burette, in mL?"
  },
  "punnett": {
    "q": "Tall (T) is dominant to short (t). What percentage of the offspring are short?"
  },
  "possibilitiesCurve": {
    "q": "What is Country A's opportunity cost of 1 tonne of wheat, in tonnes of cloth?",
    "work": [
      "Country A gives up {b} tonnes of cloth to make {a} tonnes of wheat.",
      "One tonne of wheat costs {b} ÷ {a} tonnes of cloth.",
      "= {=round(b/a, 2)}"
    ],
    "unit": "tonnes of cloth",
    "fig": { "Wheat (tons)": "Wheat (tonnes)", "Cloth (tons)": "Cloth (tonnes)" }
  },
  "chromatography.contains": {
    "work": [
      "A dye in X is a known dye only if its spot is the same colour and has travelled the same distance (the same Rf).",
      "Compare each spot of X with the spots of A, B and C.",
      "Dye {choice} is not in ink X."
    ]
  },
  "phaseDiagram": {
    "work": [
      "The solid is left of the fusion line, the liquid between it and the vaporisation curve, and the gas below and to the right.",
      "Find which region point A is in.",
      "At point A the substance is a {choice}."
    ]
  },
  "phaseDiagram.change": {
    "choices": [
      "melting",
      "vaporisation",
      "sublimation"
    ]
  },
  "equilibrium.shift": {
    "q": "N₂ + 3H₂ ⇌ 2NH₃ (the forward reaction is exothermic). At 8 minutes the equilibrium was disturbed as labelled. Which way did it shift?",
    "choices": [
      "forward, towards the products",
      "in reverse, towards the reactants"
    ]
  },
};
