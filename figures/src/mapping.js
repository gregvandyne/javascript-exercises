// Oomba Figures: a mapping diagram. Two lists side by side, the inputs on the left and the outputs on the right, each in
// an oval (or a box, or nothing) under its title, with an arrow from each input to each output it maps to. The arrows
// are data (pairs of items), so the figure shows exactly the relation it is given; a rule in x, when given, must be what
// every arrow does, so a "y = 2x" diagram cannot draw 3 going to 7. OF.solve says whether it is a function and why not,
// whether it is one-to-one and onto, its domain and range, and its inverse where that is a function. The layout is
// ported (ported/mapping.js); the reading, checks, answers and drawing are Oomba's own (docs/figures-api.md).
import { node, frame, palette, label, hides, r2, fmt } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathText, mathProblem } from './mathtext.js';
import { figExpr, figExprProblem } from './radians.js';
import { layoutMapping } from './ported/mapping.js';

const MP_KEYS = ['kind', 'hide', 'inputs', 'outputs', 'arrows', 'rule', 'shape', 'titles', 'heading', 'size'];
const MP_MAX = 12, MP_ARROWS = 60;
const MP_SIZES = { small: 0.8, medium: 1, large: 1.25 };
const mpKey = x => JSON.stringify(x);
/** A word (two letters in a row, not a function name) is written upright as text; anything else as math. */
const mpIsWord = x => typeof x === 'string' && /\p{L}{2,}/u.test(x.replace(/sqrt|pi|sin|cos|tan|log|ln/g, ''));
const mpShow = x => (typeof x === 'number' ? fmt(x, 6) : mathText(x));

function mpRead(d) {
  const odd = Object.keys(d).filter(k => !MP_KEYS.includes(k));
  if (odd.length) return { problems: [`mappingDiagram does not take "${odd[0]}" (it takes ${MP_KEYS.slice(2).join(', ')})`] };
  const out = [];
  const list = (k, what) => {
    const v = d[k];
    if (!Array.isArray(v) || v.length < 1 || v.length > MP_MAX) { out.push(`"${k}" must be a list of 1 to ${MP_MAX} ${what} (numbers, or labels like "x", "Ana" or { "frac": [1, 2] })`); return []; }
    v.forEach((x, i) => { const why = x === '' ? `${k} ${i + 1} is empty` : mathProblem(x, `${k} ${i + 1}`); if (why) out.push(why); });
    const seen = new Set();
    for (const x of v) { if (seen.has(mpKey(x))) out.push(`"${k}": ${mpShow(x)} is listed twice (a mapping diagram shows each item once)`); seen.add(mpKey(x)); }
    return v;
  };
  const inputs = list('inputs', 'inputs'), outputs = list('outputs', 'outputs');
  if (out.length) return { problems: out };
  const ins = inputs.map(mpKey), outs = outputs.map(mpKey), arrows = [];
  if (!Array.isArray(d.arrows) || d.arrows.length > MP_ARROWS) out.push(`"arrows" must be a list of [input, output] pairs (at most ${MP_ARROWS}), like [[1, 4], [2, 5]]; [] for none`);
  else for (const a of d.arrows) {
    if (!Array.isArray(a) || a.length !== 2) { out.push('an arrow is [input, output], like [1, 4]'); continue; }
    const i = ins.indexOf(mpKey(a[0])), j = outs.indexOf(mpKey(a[1]));
    if (i < 0) { out.push(`the arrow from ${mpShow(a[0])} starts at an item that is not one of the inputs`); continue; }
    if (j < 0) { out.push(`the arrow from ${mpShow(a[0])} to ${mpShow(a[1])} ends at an item that is not one of the outputs`); continue; }
    if (arrows.some(([p, q]) => p === i && q === j)) { out.push(`the arrow from ${mpShow(a[0])} to ${mpShow(a[1])} is listed twice`); continue; }
    arrows.push([i, j]);
  }
  if (d.rule !== undefined) {
    const why = typeof d.rule === 'string' ? figExprProblem(d.rule) : '"rule" must be a formula in x, like "2*x + 1"';
    if (why) out.push(`"rule": ${why}`);
    else if (![...inputs, ...outputs].every(x => typeof x === 'number')) out.push('a "rule" works on numbers: every input and output must be a number');
    else for (const [i, j] of arrows) {
      let v; try { v = figExpr(d.rule, { x: inputs[i] }); } catch (e) { out.push(`the rule has no value at x = ${fmt(inputs[i], 4)}`); break; }
      if (Math.abs(v - outputs[j]) > 1e-9 * Math.max(1, Math.abs(v))) { out.push(`the arrow from ${fmt(inputs[i], 4)} to ${fmt(outputs[j], 4)} does not follow the rule: it sends ${fmt(inputs[i], 4)} to ${fmt(v, 4)}`); break; }
    }
  }
  const shape = d.shape === undefined ? 'oval' : d.shape;
  if (!['oval', 'box', 'none'].includes(shape)) out.push('"shape" must be "oval", "box" or "none" (what each side\'s list is drawn in)');
  let titles = null;
  if (d.titles !== undefined && d.titles !== false) {
    if (!Array.isArray(d.titles) || d.titles.length !== 2 || !d.titles.every(t => typeof t === 'string' && t.length <= 30)) out.push('"titles" must be two short titles, like ["x", "y"] or ["Student", "Sport"], or false for none');
    else titles = d.titles;
  }
  if (d.heading !== undefined && (typeof d.heading !== 'string' || d.heading.length > 60)) out.push('"heading" must be a short title (60 characters at most)');
  if (d.size !== undefined && !MP_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(MP_SIZES).join(', ')}`);
  if (out.length) return { problems: out };
  return { problems: [], inputs, outputs, arrows, shape, titles: d.titles === false ? false : titles, heading: d.heading || '', scale: MP_SIZES[d.size || 'medium'], rule: d.rule };
}

function mpSolve(r) {
  const { inputs, outputs, arrows } = r;
  const outsOf = inputs.map((_, i) => arrows.filter(a => a[0] === i).map(a => outputs[a[1]]));
  const many = outsOf.findIndex(o => o.length > 1), none = inputs.filter((_, i) => !outsOf[i].length);
  const isFunction = many < 0 && !none.length;
  const why = many >= 0 ? `${mpShow(inputs[many])} goes to ${outsOf[many].map(mpShow).join(' and ')}` : none.length ? `${none.map(mpShow).join(', ')} ${none.length === 1 ? 'has' : 'have'} no output` : null;
  const hit = new Set(arrows.map(a => a[1]));
  const oneToOne = isFunction && hit.size === arrows.length;
  const onto = outputs.every((_, j) => hit.has(j));
  const pairs = arrows.map(([i, j]) => [inputs[i], outputs[j]]);
  return {
    pairs, function: isFunction, why, oneToOne, onto,
    domain: inputs.slice(), range: outputs.filter((_, j) => hit.has(j)), codomain: outputs.slice(),
    inverse: isFunction && oneToOne && onto ? pairs.map(([a, b]) => [b, a]) : null, inverseRelation: pairs.map(([a, b]) => [b, a]),
  };
}

function mpDraw(r, o) {
  const P = palette(o), W = figWords(o.lang), lang = o.lang, k = r.scale, FS = 20 * k, TS = 18 * k, HS = 22 * k;
  const box = x => (typeof x === 'number' ? mathBox(x, FS, { lang }) : mpIsWord(x) ? mathBox({ text: x }, FS, { lang }) : mathBox(x, FS, { lang }));
  const hideOut = o.hide === true ? false : hides(o, 'outputs');
  const sides = [r.inputs.map(box), r.outputs.map(box)];
  const titles = r.titles === false ? ['', ''] : r.titles || [W('input'), W('output')];
  const tw = titles.map(t => (t ? t.length * TS * 0.56 : 0));
  const L = layoutMapping({ sides, arrows: r.arrows, shape: r.shape, titles: tw, titleSize: TS, heading: r.heading ? r.heading.length * HS * 0.56 : 0, headingSize: HS, size: FS });
  const kids = [];
  const ARROWS = !(o.hide === true || hides(o, 'arrows'));
  kids.push(node('g', { fill: o.print ? 'none' : P.fill, stroke: P.ink, 'stroke-width': 2.2, class: 'of-sides' }, L.sides.map(s => (r.shape === 'oval' ? node('ellipse', { cx: r2(s.cx), cy: r2(s.cy), rx: r2(s.rx), ry: r2(s.ry) })
    : r.shape === 'box' ? node('rect', { x: r2(s.cx - s.rx), y: r2(s.cy - s.ry), width: r2(2 * s.rx), height: r2(2 * s.ry), rx: s.round }) : null))));
  L.items.forEach((side, si) => side.forEach((it, i) => {
    if (si === 1 && hideOut) return;
    kids.push(node('g', { class: si ? 'of-output' : 'of-input', 'data-item': mpShow(si ? r.outputs[i] : r.inputs[i]) }, mathNode(it.box, r2(it.x), r2(it.y), { color: P.ink })));
  }));
  if (ARROWS) kids.push(node('g', { class: 'of-arrows' }, L.arrows.map(a => {
    const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1), ux = (a.x2 - a.x1) / len, uy = (a.y2 - a.y1) / len, hl = 11, hw = 5;
    const bx = a.x2 - ux * hl, by = a.y2 - uy * hl;
    return node('g', { class: 'of-arrow', 'data-from': mpShow(r.inputs[a.from]), 'data-to': mpShow(r.outputs[a.to]) },
      node('line', { x1: r2(a.x1), y1: r2(a.y1), x2: r2(bx + ux), y2: r2(by + uy), stroke: P.green, 'stroke-width': 2, 'stroke-linecap': 'round' }),
      node('polygon', { points: `${r2(a.x2)},${r2(a.y2)} ${r2(bx - uy * hw)},${r2(by + ux * hw)} ${r2(bx + uy * hw)},${r2(by - ux * hw)}`, fill: P.green }));
  })));
  titles.forEach((t, i) => { if (t) kids.push(node('g', { class: 'of-title' }, label(L.centers[i], L.titleY - TS * 0.35, t, { anchor: 'middle', size: TS, weight: 700, colour: P.ink }))); });
  if (r.heading) kids.push(node('g', { class: 'of-heading' }, label(L.width / 2, L.headingY - HS * 0.35, r.heading, { anchor: 'middle', size: HS, weight: 800, colour: P.ink })));
  return frame(L.width, L.height, kids, { ...o, kind: 'mappingDiagram' }, o.title || r.heading || W('mappingDiagram'));
}

export const mappingDiagram = {
  check(d) { return mpRead(d).problems; },
  draw(d, o) { return mpDraw(mpRead(d), o); },
  /** The pairs, whether it is a function (and why not), one-to-one, onto, the domain, range and codomain, and the
   *  inverse where it is a function (inverseRelation always). */
  solve(d) { const r = mpRead(d); return r.problems.length ? null : mpSolve(r); },
};
export const MAPPING_KINDS = { mappingDiagram };
