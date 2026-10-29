// The 31 easing curves (Penner set + linear). t in 0..1 -> progress; ends are exact (0 -> 0, 1 -> 1).
const { sin, cos, PI, pow, sqrt } = Math;
const BACK = 1.70158, BACK2 = BACK * 1.525, EL = (2 * PI) / 3, EL2 = (2 * PI) / 4.5;
function bounceOut(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
export const ease = {
  linear: t => t,
  sineIn: t => 1 - cos((t * PI) / 2), sineOut: t => sin((t * PI) / 2), sineInOut: t => -(cos(PI * t) - 1) / 2,
  quadIn: t => t * t, quadOut: t => 1 - (1 - t) * (1 - t), quadInOut: t => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
  cubicIn: t => t * t * t, cubicOut: t => 1 - pow(1 - t, 3), cubicInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  quartIn: t => t * t * t * t, quartOut: t => 1 - pow(1 - t, 4), quartInOut: t => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
  quintIn: t => t * t * t * t * t, quintOut: t => 1 - pow(1 - t, 5), quintInOut: t => (t < 0.5 ? 16 * pow(t, 5) : 1 - pow(-2 * t + 2, 5) / 2),
  expoIn: t => (t === 0 ? 0 : pow(2, 10 * t - 10)), expoOut: t => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
  expoInOut: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
  circIn: t => 1 - sqrt(1 - t * t), circOut: t => sqrt(1 - (t - 1) * (t - 1)),
  circInOut: t => (t < 0.5 ? (1 - sqrt(1 - 4 * t * t)) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2),
  backIn: t => (BACK + 1) * t * t * t - BACK * t * t, backOut: t => 1 + (BACK + 1) * pow(t - 1, 3) + BACK * pow(t - 1, 2),
  backInOut: t => (t < 0.5 ? (pow(2 * t, 2) * ((BACK2 + 1) * 2 * t - BACK2)) / 2 : (pow(2 * t - 2, 2) * ((BACK2 + 1) * (t * 2 - 2) + BACK2) + 2) / 2),
  elasticIn: t => (t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * EL)),
  elasticOut: t => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * EL) + 1),
  elasticInOut: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * EL2)) / 2 : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * EL2)) / 2 + 1),
  bounceIn: t => 1 - bounceOut(1 - t), bounceOut, bounceInOut: t => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
};
export const EASE_NAMES = Object.keys(ease);
/** A name, a function or nothing -> an easing function (unknown names fall back to cubicOut). */
export const easeFn = e => (typeof e === 'function' ? e : ease[e] || ease.cubicOut);
