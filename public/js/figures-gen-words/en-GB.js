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
  "circularMotion.direction": {
    "q": "The object goes round anticlockwise at a steady speed. Which way does its acceleration point at this moment?",
    "work": [
      "In uniform circular motion the acceleration points to the centre of the circle.",
      "From where the object is, the centre is {choice}.",
      "Answer: {choice}."
    ]
  },
  "fields": {
    "q": "The current in the wire flows out of the page. Which way does the magnetic field point at P?",
    "work": [
      "Right-hand grip rule: point your thumb out of the page, and your fingers curl anticlockwise.",
      "Going anticlockwise around the wire, the field at P points {choice}.",
      "Answer: {choice}."
    ]
  },
  "torque": {
    "q": "Take clockwise as positive. What is the resultant moment on the beam about the pivot?",
    "work": [
      "Clockwise: {w2} × {=(b - 5)/10} = {=w2*(b - 5)/10} N·m",
      "Anticlockwise: {w1} × {=(5 - a)/10} = {=w1*(5 - a)/10} N·m",
      "Resultant = {=w2*(b - 5)/10} − {=w1*(5 - a)/10} = {=(w2*(b - 5) - w1*(5 - a))/10} N·m"
    ]
  },
  "torque.balance": {
    "q": "Where must the {=g*n1} N load hang to balance the beam? Give its distance x from the pivot.",
    "work": [
      "Balanced: the clockwise moment equals the anticlockwise moment.",
      "{=g*n1} × x = {=g*n2} × {=n1/10}",
      "x = {=g*n2*n1/10} ÷ {=g*n1} = {=n2/10} m"
    ]
  }
};
