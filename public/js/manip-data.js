// Virtual math manipulatives: the 18 tools and the pieces they place (docs/decisions.md "Virtual math manipulatives").
// Pure data, shared by the page (public/js/manip.js) and the server (services/manipulatives.js checks tool names, and
// the AI lesson drafter may only place the pieces listed here). Tool names and descriptions are English for now.
export const CATS = ['Number sense & counting', 'Place value & operations', 'Fractions, decimals & percents', 'Problem solving & modeling', 'Algebra', 'Geometry & measurement'];

export const TOOLS = [
  { slug: 'rekenreks', name: 'Rekenreks', cat: 0, color: '#E53935', emoji: '🔴', grades: 'K-2', desc: 'Subitizing and the 5 and 10 benchmarks. Slide beads in 5 red + 5 white rows, change the rows, use the cover tool.' },
  { slug: 'two-color-counters', name: 'Two-Color Counters', cat: 0, color: '#F9A825', emoji: '🟡', grades: 'K-6', desc: 'Yellow (+1) and red (-1) counters. Flip, fill ten-frames, build zero pairs and part-part-whole models.' },
  { slug: 'linking-cubes', name: 'Linking Cubes', cat: 0, color: '#1E88E5', emoji: '🧊', grades: 'K-5', desc: 'Cubes in ten colors. Join them into sticks, compose and decompose numbers, arrays and bar graphs.' },
  { slug: 'color-tiles', name: 'Color Tiles', cat: 0, color: '#43A047', emoji: '🟩', grades: 'K-6', desc: 'Square tiles for patterns, multiplication as area, area and perimeter, arrays and bar graphs.' },
  { slug: 'hundred-board', name: 'Hundred Board', cat: 0, color: '#8E24AA', emoji: '💯', grades: 'K-5', desc: 'A 1-100 grid for number order, patterns, multiples and rounding. Choose the start, whole numbers or tenths.' },
  { slug: 'base-ten-blocks', name: 'Base Ten Blocks', cat: 1, color: '#FB8C00', emoji: '🧱', grades: '1-6', desc: 'Units, rods, flats and cubes. Break and regroup with the total kept the same, a place-value chart and area models.' },
  { slug: 'place-value-disks', name: 'Place Value Disks', cat: 1, color: '#00897B', emoji: '🪙', grades: '2-6', desc: 'Labeled disks from 1,000,000 down to 0.001. Break and regroup across place values.' },
  { slug: 'number-rods', name: 'Number rods', cat: 1, color: '#D81B60', emoji: '📏', grades: 'K-6', desc: 'Ten rods in ten colors, lengths 1 to 10. Give one rod a value and the rest follow by length. Fractions and decimals too.' },
  { slug: 'fraction-circles', name: 'Fraction Circles', cat: 2, color: '#5E35B1', emoji: '🥧', grades: '2-7', desc: 'Nine color-coded circles, whole to twelfths. Turn pieces to compare, label as fraction, percent or decimal, and a rings view.' },
  { slug: 'fraction-tiles', name: 'Fraction Tiles', cat: 2, color: '#3949AB', emoji: '🍫', grades: '2-7', desc: 'Fraction bars, whole to twelfths. Line them up side by side, show equivalence, build a fraction wall.' },
  { slug: 'number-lines', name: 'Number Lines', cat: 2, color: '#00ACC1', emoji: '↔️', grades: 'K-8', desc: 'Lines for integers, decimals and fractions. Open lines, jump arcs, hidden labels.' },
  { slug: 'bar-models', name: 'Bar Models', cat: 3, color: '#7CB342', emoji: '📊', grades: '2-8', desc: 'Bars for part-part-whole, comparison, rates and ratios. Change the value and label of every part.' },
  { slug: 'money', name: 'Money', cat: 3, color: '#6D4C41', emoji: '💵', grades: 'K-5', desc: 'Coins and bills to make amounts, trade ten 1s for a 10, compare and part-part-whole.' },
  { slug: 'algebra-tiles', name: 'Algebra Tiles', cat: 4, color: '#C62828', emoji: '🔲', grades: '6-8', desc: 'Unit, x, x², y, y² and xy tiles with their opposites. Zero pairs, simplifying, factoring, solving and area models.' },
  { slug: 'xy-coordinate-board', name: 'XY Coordinate Board', cat: 4, color: '#1565C0', emoji: '📍', grades: '5-8', desc: 'Plot points, lines and polygons in one or four quadrants, with ordered-pair labels and a data table.' },
  { slug: 'geoboard', name: 'Geoboard', cat: 5, color: '#AD1457', emoji: '📌', grades: 'K-8', desc: 'Stretch colored bands around pegs on square, isometric and circular boards, with fills and area.' },
  { slug: 'pattern-blocks', name: 'Pattern Blocks', cat: 5, color: '#EF6C00', emoji: '⬡', grades: 'K-6', desc: 'Hexagon, trapezoid, triangle, rhombus, parallelogram and square. Turn, fit together and use them for fractions.' },
  { slug: 'clock', name: 'Clock', cat: 5, color: '#4527A0', emoji: '🕐', grades: 'K-5', desc: 'Red hour and blue minute hands, a digital time beside the face, a time tracker and a two-clock view for elapsed time.' },
];
export const TOOL_SLUGS = TOOLS.map(x => x.slug);
export const toolOf = slug => TOOLS.find(x => x.slug === slug) || null;

// ---------------------------------------------------------------- pieces (the tools built from draggable pieces)
const pd = (kind, color, label, value, w, h) => ({ kind, color, label, value, w, h });
const BASE10 = [pd('unit', '#FFD23F', '1', 1, 30, 30), pd('rod', '#4CAF50', '10', 10, 30, 150), pd('flat', '#2196F3', '100', 100, 130, 130), pd('cube', '#9C27B0', '1,000', 1000, 110, 110)];
const BASE10_DEC = [pd('one', '#FB8C00', '1', 1, 52, 52), pd('tenth', '#FFA726', '0.1', 0.1, 90, 30), pd('hundredth', '#FFCC80', '0.01', 0.01, 30, 30), pd('thousandth', '#FFE0B2', '0.001', 0.001, 18, 18)];
const DISKS = [pd('m', '#7B1FA2', '1,000,000', 1e6, 74, 74), pd('hth', '#8E24AA', '100,000', 1e5, 70, 70), pd('tth', '#3949AB', '10,000', 1e4, 66, 66), pd('th', '#1E88E5', '1,000', 1000, 62, 62),
  pd('h', '#00ACC1', '100', 100, 58, 58), pd('t', '#43A047', '10', 10, 54, 54), pd('o', '#F9A825', '1', 1, 50, 50), pd('tenth', '#FB8C00', '0.1', 0.1, 50, 50),
  pd('hund', '#FF7043', '0.01', 0.01, 50, 50), pd('thou', '#E53935', '0.001', 0.001, 50, 50)];
const COUNTERS = [pd('pos', '#FFD23F', '+1', 1, 48, 48), pd('neg', '#E53935', '−1', -1, 48, 48), pd('blue', '#1E88E5', '•', 0, 48, 48), pd('green', '#43A047', '•', 0, 48, 48)];
const CUBES = ['#E53935', '#FB8C00', '#FFD23F', '#43A047', '#00ACC1', '#1E88E5', '#8E24AA', '#EC407A', '#795548', '#000000'].map((c, i) => pd(`c${i}`, c, '1', 1, 40, 40));
const TILES = ['#E53935', '#FB8C00', '#FFD23F', '#43A047', '#1E88E5', '#8E24AA'].map((c, i) => pd(`t${i}`, c, '1', 1, 52, 52));
const RODS = [['#FFFFFF', '1 white'], ['#E53935', '2 red'], ['#AED581', '3 light green'], ['#BA68C8', '4 purple'], ['#FFD23F', '5 yellow'], ['#2E7D32', '6 dark green'], ['#212121', '7 black'], ['#8D6E63', '8 brown'], ['#1E88E5', '9 blue'], ['#FB8C00', '10 orange']]
  .map(([c, l], i) => pd(`r${i + 1}`, c, l, i + 1, 34 * (i + 1), 30));
export const FRACTION_DENS = [[1, '#B0BEC5'], [2, '#E53935'], [3, '#FB8C00'], [4, '#FFD23F'], [5, '#43A047'], [6, '#00ACC1'], [8, '#1E88E5'], [10, '#8E24AA'], [12, '#EC407A']];
/** A fraction's label: mode 'frac' | 'pct' | 'dec'; whole: the label of 1 ('1 whole' for tiles, '1' for circles). */
export function fracLabel(d, mode = 'frac', whole = '1 whole') {
  if (d === 1) return mode === 'frac' ? whole : mode === 'pct' ? '100%' : '1.0';
  return mode === 'frac' ? `1/${d}` : mode === 'pct' ? `${Math.round(1000 / d) / 10}%` : `${Math.round(1000 / d) / 1000}`;
}
const fracTiles = (mode = 'frac') => FRACTION_DENS.map(([d, c]) => pd(`f${d}`, c, fracLabel(d, mode), 1 / d, Math.max(44, 264 / d), 40));
const ALGEBRA = [pd('one', '#FFD23F', '1', 1, 34, 34), pd('mone', '#EF9A9A', '−1', -1, 34, 34), pd('x', '#43A047', 'x', 0, 34, 92), pd('mx', '#A5D6A7', '−x', 0, 34, 92),
  pd('x2', '#1E88E5', 'x²', 0, 92, 92), pd('mx2', '#90CAF9', '−x²', 0, 92, 92), pd('y', '#FB8C00', 'y', 0, 92, 34), pd('my', '#FFCC80', '−y', 0, 92, 34),
  pd('xy', '#8E24AA', 'xy', 0, 92, 62), pd('y2', '#5E35B1', 'y²', 0, 62, 62)];
const PATTERN = [pd('hex', '#FFD23F', 'Hexagon', 1, 96, 84), pd('trap', '#E53935', 'Trapezoid', 0.5, 96, 44), pd('tri', '#43A047', 'Triangle', 1 / 6, 52, 44),
  pd('para', '#1E88E5', 'Parallelogram', 1 / 3, 84, 44), pd('rhom', '#D7CCC8', 'Rhombus', 1 / 3, 84, 44), pd('sq', '#FB8C00', 'Square', 0.25, 48, 48)];
const MONEY = [pd('penny', '#B87333', '1¢', 1, 40, 40), pd('nickel', '#9E9E9E', '5¢', 5, 44, 44), pd('dime', '#BDBDBD', '10¢', 10, 36, 36), pd('quarter', '#90A4AE', '25¢', 25, 48, 48),
  pd('b1', '#A5D6A7', '$1', 100, 110, 48), pd('b5', '#81C784', '$5', 500, 110, 48), pd('b10', '#66BB6A', '$10', 1000, 110, 48), pd('b20', '#43A047', '$20', 2000, 110, 48)];

/** The pieces a tool places, for its settings (opts: { decimal, mode }). [] for tools without pieces. */
export function pieceDefs(slug, opts = {}) {
  switch (slug) {
    case 'base-ten-blocks': return opts.decimal ? BASE10_DEC : BASE10;
    case 'place-value-disks': return DISKS;
    case 'two-color-counters': return COUNTERS;
    case 'linking-cubes': return CUBES;
    case 'color-tiles': return TILES;
    case 'number-rods': return RODS;
    case 'fraction-tiles': return fracTiles(opts.mode);
    case 'algebra-tiles': return ALGEBRA;
    case 'pattern-blocks': return PATTERN;
    case 'money': return MONEY;
    default: return [];
  }
}
/** Every piece a tool can ever hold, in any of its settings (to look a saved piece up by its kind). */
export const allPieceDefs = slug => (slug === 'base-ten-blocks' ? [...BASE10, ...BASE10_DEC] : pieceDefs(slug));
/** Break one piece into ten of the next size down (and Regroup ten back into one). */
export const BREAKS = {
  'base-ten-blocks': { cube: 'flat', flat: 'rod', rod: 'unit' },
  'place-value-disks': { th: 'h', h: 't', t: 'o', o: 'tenth', tenth: 'hund', hund: 'thou' },
};
