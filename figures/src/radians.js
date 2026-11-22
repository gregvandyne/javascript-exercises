// Oomba Figures: a figure's formulas in radians, when it asks for them. The shared formula language
// (canvas/src/expr.js) works in degrees, as school trigonometry does, and stays that way: it is frozen inside Oomba
// Canvas 1.3.0 and Oomba Figures 1.0.0, so neither its text nor its meaning may change. A figure that graphs in radians
// says so with angles: "radians", and its formulas are rewritten before they are worked out: sin(x) becomes
// sin((x)*180/pi), and asin(v) becomes (asin(v)*pi/180), so the language itself is untouched and a figure without the
// option is worked out exactly as before.
import { evalExpr, exprProblem } from '../../canvas/src/expr.js';

export const ANGLE_UNITS = ['degrees', 'radians'];
const RAD_IN = ['sin', 'cos', 'tan'], RAD_OUT = ['asin', 'acos', 'atan'];
const RAD_MAX = 300;

/** The formula with every trig call turned from radians into the language's degrees (text in, text out). */
export function radiansExpr(src) {
  const s = String(src);
  let out = '', i = 0;
  while (i < s.length) {
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!id) { out += s[i]; i++; continue; }
    const name = id[0], after = i + name.length, open = /^\s*\(/.exec(s.slice(after));
    if (!open || !(RAD_IN.includes(name) || RAD_OUT.includes(name))) { out += name; i = after; continue; }
    // the matching bracket (an unbalanced formula is left as it is: the language says what is wrong with it)
    const start = after + open[0].length;
    let depth = 1, j = start;
    for (; j < s.length && depth; j++) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; }
    if (depth) { out += s.slice(i); break; }
    const arg = radiansExpr(s.slice(start, j - 1));
    out += RAD_IN.includes(name) ? `${name}((${arg})*180/pi)` : `(${name}(${arg})*pi/180)`;
    i = j;
  }
  return out;
}
/** The formula as the language works it out: rewritten for radians, or exactly as given. */
export const figFormula = (src, angles) => (angles === 'radians' ? radiansExpr(src) : src);
/** Why this formula cannot be read ('' when it can), in the figure's angle unit. */
export function figExprProblem(src, angles) {
  const why = exprProblem(src);
  if (why || angles !== 'radians') return why;
  return radiansExpr(src).length > RAD_MAX ? `in radians a formula with trig must be shorter (at most about ${RAD_MAX - 60} characters)` : exprProblem(radiansExpr(src));
}
/** A formula's value, in the figure's angle unit (no unit: degrees, the language's own). */
export const figExpr = (src, vars, angles) => evalExpr(figFormula(src, angles), vars);
/** Is "angles" right? -> '' or why not. */
export const anglesProblem = v => (v === undefined || ANGLE_UNITS.includes(v) ? '' : '"angles" must be "degrees" (the default) or "radians" (then sin(x) takes x in radians)');
