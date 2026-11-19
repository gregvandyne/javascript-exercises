// Oomba Figures: the global a page uses (docs/figures-api.md). window.OombaFigures (alias OF):
//   OF.draw(kind, data, opts) -> an <svg> element        OF.svg(kind, data, opts) -> the same figure as SVG text
//   OF.check(kind, data) -> [what is wrong] ([] = fine)   OF.kinds, OF.version, OF.colours
//   OF.freeBody(data, opts), OF.vectors, OF.inclinedPlane, OF.pulley, OF.rays, OF.circuit, OF.grid, OF.motionGraph,
//   OF.halfLife, OF.titration, OF.bohr, OF.orbitals, OF.lewis, OF.reading: each -> an <svg> element
//   OF.structure(smiles, opts) -> an <svg> element drawn by SmilesDrawer (its pinned tag must be on the page)
//   OF.board(element, opts) -> a JSXGraph board in the Oomba colours (JSXGraph's pinned tag must be on the page)
// opts: { hide (true, or a part's name: the answer left out), print (black on white), lang (numbers and default
// words), title (the accessible name), width }. With no document (the server's printable worksheets, the tests) only
// svg(), check() and the solvers are used.
import { FIG_VERSION, COLOURS, svgText, toElement, node, label, frame, palette } from './svg.js';
import { PHYSICS, CIRCUIT_PARTS, RAY_TYPES } from './physics.js';
import { GRAPHS } from './graphs.js';
import { CHEM, ELEMENTS, MOLECULES, configOf, configText, bohrShells } from './chem.js';
import { READINGS } from './readings.js';
import { FIG_WORDS } from './words.js';
import { evalExpr } from '../../canvas/src/expr.js';

const KINDS = { ...PHYSICS, ...GRAPHS, ...CHEM, ...READINGS };
const KIND_IDS = Object.keys(KINDS);
const cleanOpts = o => {
  const x = o && typeof o === 'object' ? o : {};
  return { hide: x.hide === true || typeof x.hide === 'string' || Array.isArray(x.hide) ? x.hide : false, print: x.print === true, lang: typeof x.lang === 'string' ? x.lang.slice(0, 16) : 'en',
    title: typeof x.title === 'string' ? x.title.slice(0, 200) : '', width: typeof x.width === 'number' && x.width > 40 && x.width < 4000 ? x.width : 0 };
};
/** What is wrong with this figure's data, in plain English ([] when it can be drawn). */
function checkFig(kind, data) {
  const K = KINDS[kind];
  if (!K) return [`unknown figure "${String(kind).slice(0, 30)}" (figures: ${KIND_IDS.join(', ')})`];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the figure\'s data must be an object'];
  try { return K.check(data); } catch (e) { return [`the data could not be read (${String(e.message).slice(0, 80)})`]; }
}
/** The figure's node tree; data that does not pass check() draws a small card that says so (never a wrong figure). */
function tree(kind, data, opts) {
  const o = cleanOpts(opts), bad = checkFig(kind, data);
  if (bad.length) { const P = palette(o); return frame(360, 90, [node('rect', { x: 2, y: 2, width: 356, height: 86, rx: 10, fill: 'none', stroke: P.red, 'stroke-width': 2, 'stroke-dasharray': '6 5' }), label(180, 45, '⚠ This figure cannot be drawn.', { anchor: 'middle', size: 15, colour: P.red })], { ...o, kind: 'error' }, 'Figure error'); }
  return KINDS[kind].draw(data, o);
}
const svg = (kind, data, opts) => svgText(tree(kind, data, opts));
function draw(kind, data, opts) {
  const el = toElement(tree(kind, data, opts));
  const bad = checkFig(kind, data);
  if (bad.length && typeof console !== 'undefined') console.warn(`[oomba-figures] ${kind}: ${bad.join('; ')}`);
  return el;
}

/** A skeletal structure from SMILES, drawn by SmilesDrawer into an <svg> (browser only). */
function structure(smiles, opts = {}) {
  const o = cleanOpts(opts), w = o.width || 320, h = Math.round(w * 0.7);
  const doc = typeof document !== 'undefined' ? document : null, SD = typeof globalThis !== 'undefined' ? globalThis.SmilesDrawer : null;
  if (!doc) throw new Error('Oomba Figures: structure() needs a page');
  const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${w} ${h}`); el.setAttribute('width', String(w)); el.setAttribute('height', String(h)); el.setAttribute('role', 'img');
  el.setAttribute('aria-label', o.title || `Structure ${String(smiles).slice(0, 60)}`); el.setAttribute('class', 'of-fig of-structure'); el.style.maxWidth = '100%'; el.style.height = 'auto';
  el.style.background = o.print ? '#fff' : COLOURS.paper; el.style.borderRadius = o.print ? '0' : '12px';
  if (!SD || !SD.SvgDrawer || typeof SD.parse !== 'function') { el.appendChild(toElement(label(w / 2, h / 2, '⚠ SmilesDrawer is not loaded', { anchor: 'middle', size: 14, colour: COLOURS.red }))); if (typeof console !== 'undefined') console.warn('[oomba-figures] structure: add the pinned SmilesDrawer tag before this one'); return el; }
  const s = String(smiles || '').slice(0, 200);
  try {
    const ink = o.print ? '#000000' : COLOURS.ink, el2 = o.print ? '#000000' : null;
    const oomba = { FOREGROUND: ink, BACKGROUND: o.print ? '#ffffff' : COLOURS.paper, C: ink, O: el2 || COLOURS.red, N: el2 || COLOURS.blue, F: el2 || COLOURS.green, CL: el2 || COLOURS.green, BR: el2 || '#9A4A12', I: el2 || COLOURS.purple, P: el2 || '#9A4A12', S: el2 || COLOURS.gold, B: el2 || COLOURS.gold, SI: el2 || COLOURS.gold, H: el2 || COLOURS.muted };
    const drawer = new SD.SvgDrawer({ width: w, height: h, padding: 12, compactDrawing: false, terminalCarbons: !!opts.carbons, explicitHydrogens: opts.hydrogens !== false, themes: { oomba } });
    SD.parse(s, t => { drawer.draw(t, el, 'oomba'); }, () => { el.appendChild(toElement(label(w / 2, h / 2, '⚠ That SMILES could not be read', { anchor: 'middle', size: 14, colour: COLOURS.red }))); });
  } catch (e) { if (typeof console !== 'undefined') console.warn(`[oomba-figures] structure: ${String(e.message).slice(0, 120)}`); }
  return el;
}
/** A JSXGraph board in the Oomba colours: OF.board(el, { x: [lo, hi], y: [lo, hi], grid, axis }) (browser only). */
function board(target, opts = {}) {
  const JXG = typeof globalThis !== 'undefined' ? globalThis.JXG : null;
  if (!JXG || !JXG.JSXGraph) throw new Error('Oomba Figures: add the pinned JSXGraph tag before using OF.board()');
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el && !el.id) el.id = `of-board-${Math.random().toString(36).slice(2, 8)}`;
  const x = Array.isArray(opts.x) ? opts.x : [-5, 5], y = Array.isArray(opts.y) ? opts.y : [-5, 5];
  if (el) { el.style.background = COLOURS.paper; el.style.borderRadius = '12px'; if (!el.style.aspectRatio && !el.style.height) el.style.aspectRatio = `${x[1] - x[0]} / ${y[1] - y[0]}`; }
  JXG.Options.text.cssDefaultStyle = 'font-family:system-ui,sans-serif;'; JXG.Options.text.highlightCssDefaultStyle = JXG.Options.text.cssDefaultStyle;
  Object.assign(JXG.Options.point, { strokeColor: COLOURS.red, fillColor: COLOURS.red, highlightStrokeColor: COLOURS.greenInk, highlightFillColor: COLOURS.green });
  Object.assign(JXG.Options.line, { strokeColor: COLOURS.green, highlightStrokeColor: COLOURS.greenInk, strokeWidth: 3 });
  Object.assign(JXG.Options.curve, { strokeColor: COLOURS.green, strokeWidth: 3 });
  return JXG.JSXGraph.initBoard(el.id, { boundingbox: [x[0], y[1], x[1], y[0]], axis: opts.axis !== false, grid: opts.grid !== false, keepAspectRatio: opts.keepAspectRatio !== false, showCopyright: false, showNavigation: false, pan: { enabled: false }, zoom: { enabled: false }, ...(opts.board || {}) });
}

const named = Object.fromEntries(KIND_IDS.map(k => [k, (data, opts) => draw(k, data, opts)]));
const OombaFigures = Object.freeze({
  version: FIG_VERSION, kinds: Object.freeze(KIND_IDS.slice()), colours: COLOURS,
  draw, svg, check: checkFig, structure, board, ...named,
  // the numbers behind the figures (for a generator's answers and the tests): the same functions the drawings use
  solve: Object.freeze({
    rays: d => KINDS.rays.solve(d), pulley: d => KINDS.pulley.solve(d), inclinedPlane: d => KINDS.inclinedPlane.sizes(d), titration: (d, v) => KINDS.titration.pH(d, v),
    halfLife: (d, t) => KINDS.halfLife.at(d, t), motionArea: (d, a, b) => KINDS.motionGraph.area(d, a, b), bohrShells, config: (el, q = 0) => configOf(typeof el === 'number' ? el : ELEMENTS.findIndex(e => e && e[0] === el), q), configText,
  }),
  data: Object.freeze({ elements: ELEMENTS, molecules: Object.keys(MOLECULES), circuitParts: CIRCUIT_PARTS, rayTypes: RAY_TYPES, words: FIG_WORDS }),
  expr: evalExpr,
});
globalThis.OombaFigures = OombaFigures;
globalThis.OF = OombaFigures;
