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
  }
};
