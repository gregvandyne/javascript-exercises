// Oomba Figures, the core (docs/figures-api.md "The core and its packs"): the global a page uses, window.OombaFigures
// (alias OF), the drawing core (svg.js), the default words, the math label typesetter, the formula language, the notice
// an exported figure carries, the coordinate grid, and the registry the subject packs add their kinds to. Each pack (a
// classic script, loaded after the core: math, data, physics, chem, bio (1.3.0), measure) registers its kinds with register() below.
//   OF.draw(kind, data, opts) -> an <svg> element        OF.svg(kind, data, opts) -> the same figure as SVG text
//   OF.check(kind, data) -> [what is wrong] ([] = fine)   OF.kinds (the kinds loaded), OF.version, OF.colours
//   OF.packs (the packs loaded), OF.packOf(kind) (the pack a kind is in: 'core', 'math', ...; null for no kind)
//   OF.notice, OF.withNotice(svgText) -> the same SVG text carrying Oomba's CC0 notice as <metadata> (for exports)
//   OF.<kind>(data, opts) for every kind loaded -> an <svg> element; OF.solve.<kind>(data) the numbers behind it
//   OF.structure(smiles, opts) -> an <svg> element drawn by SmilesDrawer (its pinned tag must be on the page)
//   OF.board(element, opts) -> a JSXGraph board in the Oomba colours (JSXGraph's pinned tag must be on the page)
// opts: { hide (true, or a part's name: the answer left out), print (black on white), lang (numbers and default
// words), title (the accessible name), width }. With no document (the server's printable worksheets, the tests) only
// svg(), check() and the solvers are used. A kind whose pack is not loaded is named in check() ("add the physics pack's
// tag") and draws the "cannot be drawn" card, never a wrong figure.
import { FIG_VERSION, COLOURS, svgText, toElement, node, label, frame, palette } from './svg.js';
import { GRAPHS } from './graphs.js';
import { FIGURE_NOTICE, withNotice } from './notice.js';
import { FIG_WORDS } from './words.js';
import { figExpr } from './radians.js';

/** Every kind, in the order OF.kinds lists them, and the pack it is in. The packs register exactly these (a pack that
 *  brings another kind, or one twice, is refused), so a page can be told which tag it is missing. */
export const KIND_PACKS = Object.freeze({
  freeBody: 'physics', vectors: 'physics', inclinedPlane: 'physics', pulley: 'physics', rays: 'physics', circuit: 'physics', grid: 'core', motionGraph: 'physics',
  halfLife: 'chem', titration: 'chem', bohr: 'chem', orbitals: 'chem', lewis: 'chem', reading: 'measure', numberLine: 'math',
  triangle: 'math', rectangle: 'math', parallelogram: 'math', trapezoid: 'math', kite: 'math', regularPolygon: 'math', angles: 'math', parallelLines: 'math',
  segmentAddition: 'math', circle: 'math', compositeShape: 'math', barGraph: 'data', dotPlot: 'data', histogram: 'data', boxPlot: 'data', scatterPlot: 'data',
  stemAndLeaf: 'data', pieChart: 'data', cumulativeFrequency: 'data', normalCurve: 'data', treeDiagram: 'data', vennDiagram: 'data', twoWayTable: 'data',
  tableOfValues: 'data', protractor: 'measure', prism: 'math', cylinder: 'math', pyramid: 'math', cone: 'math', sphere: 'math', net: 'math', mappingDiagram: 'math',
  motionMap: 'physics', projectile: 'physics', waves: 'physics',
  massSpectrum: 'chem', heatingCurve: 'chem', energyProfile: 'chem', nuclide: 'chem', lineSpectrum: 'chem', photoelectron: 'chem', particles: 'chem', dotCross: 'chem',
  populationGrowth: 'bio', predatorPrey: 'bio', enzymeActivity: 'bio', photosynthesis: 'bio', punnett: 'bio', pedigree: 'bio', proteinSynthesis: 'bio', gel: 'bio', osmosis: 'bio',
});
/** The packs, in the order a page loads their tags (after the core's). */
export const PACK_NAMES = Object.freeze(['math', 'data', 'physics', 'chem', 'bio', 'measure']);
const ALL_KINDS = Object.keys(KIND_PACKS);
const KINDS = {}, LOADED = ['core'];
const cleanOpts = o => {
  const x = o && typeof o === 'object' ? o : {};
  return { hide: x.hide === true || typeof x.hide === 'string' || Array.isArray(x.hide) ? x.hide : false, print: x.print === true, lang: typeof x.lang === 'string' ? x.lang.slice(0, 16) : 'en',
    title: typeof x.title === 'string' ? x.title.slice(0, 200) : '', width: typeof x.width === 'number' && x.width > 40 && x.width < 4000 ? x.width : 0 };
};
const kindIds = () => ALL_KINDS.filter(k => KINDS[k]);
/** What is wrong with this figure's data, in plain English ([] when it can be drawn). */
function checkFig(kind, data) {
  const K = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  if (!K) {
    const pack = Object.prototype.hasOwnProperty.call(KIND_PACKS, kind) ? KIND_PACKS[kind] : null;
    if (pack) return [`the figure "${kind}" is in the ${pack} pack, which this page does not load: add the ${pack} pack's pinned tag after the Oomba Figures tag`];
    return [`unknown figure "${String(kind).slice(0, 30)}" (figures: ${kindIds().join(', ')})`];
  }
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

const fixed = (obj, k, value, enumerable = true) => Object.defineProperty(obj, k, { value, enumerable, writable: false, configurable: false });
const SOLVE = {}, DATA = {};
const OombaFigures = {};
fixed(OombaFigures, 'version', FIG_VERSION);
Object.defineProperty(OombaFigures, 'kinds', { get: () => Object.freeze(kindIds()), enumerable: true, configurable: false });
Object.defineProperty(OombaFigures, 'packs', { get: () => Object.freeze(LOADED.slice()), enumerable: true, configurable: false });
for (const [k, v] of Object.entries({ colours: COLOURS, draw, svg, check: checkFig, structure, board, notice: FIGURE_NOTICE, withNotice,
  packOf: kind => (Object.prototype.hasOwnProperty.call(KIND_PACKS, kind) ? KIND_PACKS[kind] : null),
  // the numbers behind the figures (for a generator's answers and the tests): the same functions the drawings use
  solve: SOLVE, data: DATA,
  // the formula language (degrees, as the generators use it); { angles: 'radians' } works trig in radians, as a figure can
  expr: (src, vars, opts) => figExpr(src, vars, opts && opts.angles) })) fixed(OombaFigures, k, v);
fixed(DATA, 'words', FIG_WORDS);

/**
 * A pack adds its kinds (exactly the ones KIND_PACKS gives it), their shortcuts (OF.<kind>), OF.solve.<kind> for each
 * kind that solves, and its extra solvers and data. Nothing it adds can be changed afterwards; a pack loaded twice is
 * left as it was the first time.
 */
export function register(pack, kinds, solve = {}, data = {}) {
  if (pack !== 'core' && !PACK_NAMES.includes(pack)) throw new Error(`Oomba Figures: no pack "${pack}"`);
  if (LOADED.includes(pack) && pack !== 'core') { if (typeof console !== 'undefined') console.warn(`[oomba-figures] the ${pack} pack is loaded twice`); return; }
  const want = ALL_KINDS.filter(k => KIND_PACKS[k] === pack), got = Object.keys(kinds);
  if (got.length !== want.length || got.some(k => KIND_PACKS[k] !== pack || KINDS[k])) throw new Error(`Oomba Figures: the ${pack} pack must bring exactly ${want.join(', ')}`);
  for (const k of want) {
    KINDS[k] = kinds[k];
    fixed(OombaFigures, k, (d, opts) => draw(k, d, opts));
    if (typeof kinds[k].solve === 'function' && !(k in SOLVE)) fixed(SOLVE, k, d => KINDS[k].solve(d));
  }
  for (const [k, v] of Object.entries(solve)) fixed(SOLVE, k, v);
  for (const [k, v] of Object.entries(data)) fixed(DATA, k, v);
  if (pack !== 'core') LOADED.push(pack);
}
register('core', GRAPHS);

globalThis.OombaFigures = OombaFigures;
globalThis.OF = OombaFigures;
