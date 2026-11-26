// Fraction Tiles: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation from a seeded random source; conds are this tool's board
// checks, read from the board's tiles (kind f<d>, worth 1/d; locked tiles are the task's own and never count) and its
// Labels setting (mode: frac, pct, dec). Every variation hides the board's totals (they would give the answers away).
import { boardWith, plural } from '../manip-task-kit.js';
import { allPieceDefs, fracLabel } from '../manip-data.js';
import { WORLD } from '../manip-board.js';

export const SLUG = 'fraction-tiles';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
/** The tiles' sizes (the whole is 1). Values are counted in 120ths of a whole, so every sum is exact. */
const SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const DENS = [2, 3, 4, 5, 6, 8, 10, 12];
const U = d => 120 / d;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const fr = (n, d) => (d === 1 ? String(n) : `${n}/${d}`);
const low = (n, d) => { const g = gcd(n, d); return fr(n / g, d / g); };
/** n/d as a mixed number in lowest terms: "1 1/4", "3/4", "2". */
function mixed(n, d) { const w = Math.floor(n / d), r = n % d, g = gcd(r, d); return r ? `${w ? `${w} ` : ''}${r / g}/${d / g}` : String(w); }
const tiles = (n, d) => (d === 1 ? plural(n, 'whole tile') : `${n} ${n === 1 ? 'tile' : 'tiles'} of 1/${d}`);
const dec = x => String(+x.toFixed(3));
const pct = x => String(+(x * 100).toFixed(1));
/** Up to three answer options (the right one and unique wrong ones), shuffled. -> { options, correct } */
function options(R, right, wrong, n = 3) {
  const out = [right];
  for (const w of wrong) if (out.length < n && w && !out.includes(w)) out.push(w);
  const sh = R.shuffle(out);
  return { options: sh, correct: sh.indexOf(right) };
}
const NAMES = ['Mia', 'Leo', 'Ava', 'Sam', 'Zoe', 'Eli', 'Nia', 'Omar'];

// ---------------------------------------------------------------- the board
let seq = 0;
/** A tile of 1/d at (x, y), as the page makes one (manip.js mkPiece). */
function tile(d, x, y, locked = false, mode = 'frac') {
  const k = `f${d}`, t = DEFS[k];
  return { id: `p${(++seq).toString(36)}`, kind: k, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: t.color, label: fracLabel(d, mode), value: t.value, w: t.w, h: t.h };
}
/** Rows of tiles, edge to edge, one row for each [d, n] (a fraction wall), from (x0, y0). */
function rows(list, x0, y0, locked, mode) {
  const out = [];
  list.forEach(([d, n], r) => { for (let i = 0; i < n; i++) out.push(tile(d, x0 + i * DEFS[`f${d}`].w, y0 + r * 40, locked, mode)); });
  return out;
}
const X0 = Math.round(WORLD.w / 2 - 300), Y0 = Math.round(WORLD.h / 2 - 160);
/** A board: locked rows (the task's own tiles) at the top, tiles to work with under them (loose), the Labels mode. */
export function tileBoard({ locked = [], loose = [], mode = 'frac' } = {}) {
  return boardWith(SLUG, [], [...rows(locked, X0, Y0, true, mode), ...rows(loose, X0, Y0 + 40 * locked.length + 50, false, mode)], { mode });
}
/** The same board with the tiles to work with replaced by these rows (and the Labels mode). */
function solved(setup, has, mode) {
  const b = JSON.parse(JSON.stringify(setup)), m = mode || b.mode || 'frac', lockedRows = new Set(b.pieces.filter(p => p.locked).map(p => p.y)).size;
  b.pieces = [...b.pieces.filter(p => p.locked).map(p => ({ ...p, label: fracLabel(+p.kind.slice(1), m) })), ...rows(has.filter(([, n]) => n > 0), X0, Y0 + 40 * lockedRows + 50, false, m)];
  b.mode = m;
  return b;
}

// ---------------------------------------------------------------- the checks
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** The tiles a student placed (not the task's locked ones): [{ d }]. */
const placed = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && !p.locked && /^f\d+$/.test(String(p.kind)) && SIZES.includes(num(String(p.kind).slice(1)))).map(p => ({ d: num(String(p.kind).slice(1)) }));
const countOf = (ts, d) => ts.filter(t => t.d === d).length;
const sumOf = ts => ts.reduce((s, t) => s + U(t.d), 0);
export const conds = {
  /** Exactly these placed tiles: { has: { d: n } } (no tiles of any other size). */
  counts: (c, b) => { const ts = placed(b); return SIZES.every(d => countOf(ts, d) === num(c.has[d])); },
  /** The placed tiles make u 120ths (only: sizes allowed). */
  total: (c, b) => { const ts = placed(b); return sumOf(ts) === c.u && (!c.only || ts.every(t => c.only.includes(t.d))); },
  /** n tiles of 1/d, and the other placed tiles (none of 1/d) make the same amount: two ways. */
  twoWays: (c, b) => { const ts = placed(b), rest = ts.filter(t => t.d !== c.d); return countOf(ts, c.d) === c.n && rest.length > 0 && sumOf(rest) === c.n * U(c.d); },
  /** The Labels setting is one of these modes. */
  mode: (c, b) => (c.modes || []).includes(b && b.mode),
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
/** [b, D]: D a multiple of b among the tiles (for equal fractions). */
const MULTS = []; for (const b of [1, 2, 3, 4, 5, 6]) for (const D of DENS) if (D > b && D % b === 0) MULTS.push([b, D]);
const STUFF = ['a ribbon', 'a chocolate bar', 'a garden path', 'a board'];

export const TASKS = [
  T('prove-1-2-2-4', 'Prove 1/2 = 2/4', '3.NF.A.3b', '3',
    'A fraction is on the board in tiles. Cover it exactly with smaller tiles of one size. How many do you need?',
    'Exact cover, no gaps and no overlaps, is the proof standard. Children should check edges align before claiming equivalence.',
    R => {
      const [b, D] = R.pick(MULTS), a = b === 1 ? 1 : R.int(1, b - 1), k = (a * D) / b;
      const setup = tileBoard({ locked: [[b, a]] }), what = b === 1 ? 'the whole tile' : `the ${fr(a, b)} (${tiles(a, b)})`;
      return {
        prompt: `Cover ${what} exactly with 1/${D} tiles: no gaps, no overlaps. How many 1/${D} tiles do you need?`,
        setup, answer: { board: [{ t: 'counts', has: { [D]: k }, say: `Use only 1/${D} tiles, just enough to cover ${b === 1 ? 'the whole' : fr(a, b)}.` }], box: { key: String(k), label: `1/${D} tiles` } },
        hints: [`Tap the 1/${D} tile, then drag it under the left end of the top row.`, `Add 1/${D} tiles edge to edge until your row ends where the top row ends.`, `${fr(a, b)} = ${fr(k, D)}: you need ${k}.`],
        explain: `${fr(a, b)} = ${fr(k, D)}. ${b === 1 ? 'The whole tile' : `Each 1/${b} tile`} is exactly as long as ${D / b} tiles of 1/${D}.`,
        solution: { board: solved(setup, [[D, k]]), box: String(k) },
      };
    }),
  T('beat-the-benchmark', 'Beat the benchmark', '4.NF.A.2', '4',
    'Build three fractions under a whole tile, one row each. Which is closest to 1?',
    'Benchmark thinking (compare to 1/2, then to 1) beats finding common denominators at this stage. Ask for the gap each fraction leaves.',
    R => {
      let fs;
      for (;;) {
        fs = R.shuffle(DENS).slice(0, 3).map(d => [R.int(1, d - 1), d]);
        const gaps = fs.map(([n, d]) => 1 - n / d);
        if (new Set(gaps.map(g => g.toFixed(6))).size === 3 && Math.min(...gaps) < 0.5) break;
      }
      const gaps = fs.map(([n, d]) => 1 - n / d), best = gaps.indexOf(Math.min(...gaps)), opts = fs.map(([n, d]) => fr(n, d));
      const setup = tileBoard({ locked: [[1, 1]] }), [bn, bd] = fs[best];
      return {
        prompt: `Under the whole tile, build ${opts[0]}, ${opts[1]} and ${opts[2]}, one row each. Which is closest to 1?`,
        setup, answer: { board: [{ t: 'counts', has: Object.fromEntries(fs.map(([n, d]) => [d, n])), say: `Build ${opts.join(', ')} with their own tiles.` }],
          choice: { options: opts, correct: best, say: 'Look at the gap each row leaves before the end of the whole.' } },
        hints: [`Row 1: ${tiles(fs[0][0], fs[0][1])}. Row 2: ${tiles(fs[1][0], fs[1][1])}. Row 3: ${tiles(fs[2][0], fs[2][1])}.`, 'Look at the gap at the end of each row, before the end of the whole tile.', `${fr(bn, bd)} leaves the smallest gap, ${fr(bd - bn, bd)}, so it is closest to 1.`],
        explain: `${fr(bn, bd)} is closest to 1: it leaves a gap of only ${fr(bd - bn, bd)}. The smaller the gap, the closer to 1.`,
        solution: { board: solved(setup, fs.map(([n, d]) => [d, n])), choice: best },
      };
    }),
  T('build-the-wall', 'Build the wall', '4.NF.A.1', '4',
    'A fraction is in the top row of the wall. Build the same amount in one or two other rows of the wall.',
    'The wall rewards hunting: 4/6 and 8/12 line up under 2/3. Have children run a ruler down the edge to check.',
    R => {
      const fams = []; for (const b of [2, 3, 4, 5, 6]) for (let a = 1; a < b; a++) if (gcd(a, b) === 1) { const ds = DENS.filter(D => D > b && D % b === 0); for (const D of ds) fams.push([a, b, [D]]); for (const D of ds) for (const E of ds) if (D < E) fams.push([a, b, [D, E]]); }
      const [a, b, ds] = R.pick(fams), setup = tileBoard({ locked: [[b, a]] }), ks = ds.map(D => (a * D) / b);
      const rowsTxt = ds.map(D => `1/${D}`).join(' and ');
      return {
        prompt: `The top row shows ${fr(a, b)}. Build the same amount with ${rowsTxt} tiles${ds.length > 1 ? ', one row each' : ''}.`,
        setup, answer: { board: [{ t: 'counts', has: Object.fromEntries(ds.map((D, i) => [D, ks[i]])), say: `Build ${fr(a, b)} again with ${rowsTxt} tiles, ending where the top row ends.` }] },
        hints: [`Put 1/${ds[0]} tiles under the top row, edge to edge.`, 'Stop when your row ends exactly where the top row ends.', ds.map((D, i) => `${fr(a, b)} = ${fr(ks[i], D)}`).join(', ') + '.'],
        explain: `${[fr(a, b), ...ds.map((D, i) => fr(ks[i], D))].join(' = ')}. The rows end on the same line, so they are the same amount.`,
        solution: { board: solved(setup, ds.map((D, i) => [D, ks[i]])) },
      };
    }),
  T('sum-past-one-whole', 'Sum past one whole', '5.NF.A.1', '5',
    'Add two fractions whose sum is more than 1. Show the sum with a whole tile and tiles of one size, and pick the mixed number.',
    'Overflow past the whole is the point: children must regroup twelfths into a whole plus a remainder, just like base ten.',
    R => {
      let b, d, a, c, L, k;
      for (;;) { [b, d] = R.shuffle(DENS).slice(0, 2); L = lcm(b, d); if (L > 12) continue; a = R.int(1, b - 1); c = R.int(1, d - 1); k = a * (L / b) + c * (L / d); if (k > L && k < 2 * L) break; }
      const r = k - L, right = `1 ${low(r, L)}`, setup = tileBoard();
      const ch = options(R, right, [r < b + d ? `1 ${fr(r, b + d)}` : '', `1 ${low(L - r, L)}`, `2 ${low(r, L)}`]);
      return {
        prompt: `Add ${fr(a, b)} + ${fr(c, d)}. Show the sum with one whole tile and 1/${L} tiles. Which mixed number is the sum?`,
        setup, answer: { board: [{ t: 'counts', has: { 1: 1, [L]: r }, say: `Use one whole tile and only 1/${L} tiles for the rest.` }], choice: { ...ch, say: 'The whole tile is the 1. Count the 1/' + L + ' tiles for the rest.' } },
        hints: [`${[[a, b], [c, d]].filter(([, x]) => x !== L).map(([n, x]) => `${fr(n, x)} = ${fr(n * (L / x), L)}`).join(' and ')}.`, `That is ${k} tiles of 1/${L}. ${L} of them make 1 whole: use the whole tile instead.`, `${fr(k, L)} = 1 and ${fr(r, L)}: one whole tile and ${tiles(r, L)}.`],
        explain: `${fr(a, b)} + ${fr(c, d)} = ${fr(k, L)} = ${right}. ${L} of the 1/${L} tiles regroup into one whole, like ten ones into a ten.`,
        solution: { board: solved(setup, [[1, 1], [L, r]]), choice: ch.correct },
      };
    }),
  T('wall-hunt-3-4', 'Wall hunt: 3/4', '4.NF.A.1', '4',
    'On the fraction wall, find every fraction equal to a given one, up to twelfths. Build each one in its own row. How many names does it have?',
    '6/8 and 9/12 join 3/4. The wall edge alignment is the evidence children should cite.',
    R => {
      const fams = []; for (const b of [2, 3, 4, 5, 6]) for (let a = 1; a < b; a++) if (gcd(a, b) === 1) fams.push([a, b]);
      const [a, b] = R.pick(fams), ds = DENS.filter(D => D > b && D % b === 0), ks = ds.map(D => (a * D) / b), what = R.pick(STUFF), who = R.pick(NAMES);
      const setup = tileBoard({ locked: [[b, a]] });
      return {
        prompt: `${who} painted ${fr(a, b)} of ${what}. Under the ${fr(a, b)} row, build every fraction equal to ${fr(a, b)} up to twelfths, one row each. How many fractions in all name this amount, ${fr(a, b)} too?`,
        setup, answer: { board: [{ t: 'counts', has: Object.fromEntries(ds.map((D, i) => [D, ks[i]])), say: `Find every row of the wall where a fraction ends exactly where ${fr(a, b)} ends.` }], box: { key: String(ds.length + 1), label: 'fractions in all' } },
        hints: [`Try each tile size smaller than 1/${b}, up to 1/12. A row that ends exactly where ${fr(a, b)} ends is equal.`, `The rows that work: ${ds.map(D => `1/${D}`).join(', ')}.`, `${[fr(a, b), ...ds.map((D, i) => fr(ks[i], D))].join(' = ')}: ${ds.length + 1} fractions.`],
        explain: `${[fr(a, b), ...ds.map((D, i) => fr(ks[i], D))].join(' = ')}. The other sizes never end on that line.`,
        solution: { board: solved(setup, ds.map((D, i) => [D, ks[i]])), box: String(ds.length + 1) },
      };
    }),
  T('compare-with-benchmarks', 'Compare with benchmarks', '4.NF.A.2', '4',
    'Build two fractions that are both more than a half, under a half tile and a whole tile. Which is closer to 1?',
    'Both pass a half; 2/3 leaves a smaller gap to 1. Gap-to-benchmark reasoning is the target strategy.',
    R => {
      let x, y;
      for (;;) {
        const [d1, d2] = R.shuffle(DENS).slice(0, 2), n1 = R.int(Math.floor(d1 / 2) + 1, d1 - 1), n2 = R.int(Math.floor(d2 / 2) + 1, d2 - 1);
        x = [n1, d1]; y = [n2, d2];
        if (n1 < d1 && n2 < d2 && n1 * d2 !== n2 * d1) break;
      }
      const opts = [fr(...x), fr(...y)], best = 1 - x[0] / x[1] < 1 - y[0] / y[1] ? 0 : 1, [bn, bd] = best ? y : x;
      const setup = tileBoard({ locked: [[1, 1], [2, 1]] });
      return {
        prompt: `Build ${opts[0]} and ${opts[1]} under the whole and the 1/2 tile, one row each. Both are more than 1/2. Which is closer to 1?`,
        setup, answer: { board: [{ t: 'counts', has: { [x[1]]: x[0], [y[1]]: y[0] }, say: `Build ${opts[0]} and ${opts[1]}, each with its own tiles.` }],
          choice: { options: opts, correct: best, say: 'Compare the gaps left before the end of the whole.' } },
        hints: [`Row 1: ${tiles(...x)}. Row 2: ${tiles(...y)}.`, 'Both rows pass the end of the 1/2 tile. Now look at the gap before the end of the whole.', `${fr(bn, bd)} leaves a gap of ${fr(bd - bn, bd)}, the smaller gap.`],
        explain: `${fr(bn, bd)} is closer to 1: its gap, ${fr(bd - bn, bd)}, is smaller than the gap ${best ? fr(x[1] - x[0], x[1]) : fr(y[1] - y[0], y[1])}.`,
        solution: { board: solved(setup, [[x[1], x[0]], [y[1], y[0]]]), choice: best },
      };
    }),
  T('add-thirds-and-sixths', 'Add thirds and sixths', '5.NF.A.1', '5',
    'Add two fractions like 1/3 + 1/6. Trade tiles until the sum is in one size of tile. How many tiles of that size?',
    'Trading a third for two sixths gives 3/6, which is a half. Trading is the physical form of finding common denominators.',
    R => {
      let b, d, a, c, k;
      for (;;) { [b, d] = R.pick(MULTS.filter(([x]) => x > 1)); a = R.int(1, b - 1); c = R.int(1, d - 1); k = a * (d / b) + c; if (k <= d) break; }
      const setup = tileBoard({ loose: [[b, a], [d, c]] });
      return {
        prompt: `The tiles show ${fr(a, b)} + ${fr(c, d)}. Trade the 1/${b} tiles for 1/${d} tiles, so the sum is all 1/${d} tiles. How many 1/${d} tiles is the sum?`,
        setup, answer: { board: [{ t: 'counts', has: { [d]: k }, say: `Trade every 1/${b} tile for 1/${d} tiles of the same length.` }], box: { key: String(k), label: `1/${d} tiles` } },
        hints: [`One 1/${b} tile is as long as ${d / b} tiles of 1/${d}.`, `Delete the ${tiles(a, b)} (hold one, then Delete) and add ${a * (d / b)} tiles of 1/${d} instead.`, `${fr(a * (d / b), d)} + ${fr(c, d)} = ${fr(k, d)}: ${k} tiles.`],
        explain: `${fr(a, b)} + ${fr(c, d)} = ${fr(k, d)}${low(k, d) !== fr(k, d) ? ` = ${low(k, d)}` : ''}. With one size of tile you can count the sum.`,
        solution: { board: solved(setup, [[d, k]]), box: String(k) },
      };
    }),
  T('mixed-number-build', 'Mixed number build', '4.NF.B.3b', '4',
    'Build a mixed number with whole tiles and tiles of one size. How many of those tiles make the same amount, as an improper fraction?',
    '13/5 needs thirteen fifth tiles, which children can count along the row. Both names describe one amount.',
    R => {
      const w = R.int(1, 3), b = R.pick([2, 3, 4, 5, 6, 8]), a = R.int(1, b - 1), n = w * b + a, setup = tileBoard();
      return {
        prompt: `Build ${w} ${fr(a, b)} with whole tiles and 1/${b} tiles. How many 1/${b} tiles would make the same amount? (${w} ${fr(a, b)} = ?/${b})`,
        setup, answer: { board: [{ t: 'counts', has: { 1: w, [b]: a }, say: `Use ${tiles(w, 1)} and ${tiles(a, b)}.` }], box: { key: String(n), label: `1/${b} tiles` } },
        hints: [`Build it: ${tiles(w, 1)} and ${tiles(a, b)}.`, `Each whole is ${b} tiles of 1/${b}.${w > 1 ? ` ${w} wholes are ${w} × ${b} = ${w * b} of them.` : ''}`, `${w * b} + ${a} = ${n}, so ${w} ${fr(a, b)} = ${fr(n, b)}.`],
        explain: `${w} ${fr(a, b)} = ${fr(n, b)}: ${w * b} tiles of 1/${b} in the wholes and ${a} more.`,
        solution: { board: solved(setup, [[1, w], [b, a]]), box: String(n) },
      };
    }),
  T('fraction-times-whole', 'Fraction times whole', '4.NF.B.4', '4',
    'Show some equal groups of a fraction with tiles. What is the whole number times the fraction?',
    'Six fifths regroup as 1 and 1/5. The overflow past the whole tile is where the mixed number appears.',
    R => {
      const g = R.int(2, 5), b = R.pick([2, 3, 4, 5, 6, 8, 10, 12]), a = R.int(1, Math.min(b - 1, 3)), n = g * a, setup = tileBoard({ locked: [[1, 1]] });
      return {
        prompt: `Show ${g} groups of ${fr(a, b)} with 1/${b} tiles, in one row under the whole tile. What is ${g} × ${fr(a, b)}?`,
        setup, answer: { board: [{ t: 'counts', has: { [b]: n }, say: `Make ${g} groups of ${tiles(a, b)}.` }], box: { key: fr(n, b), label: `${g} × ${fr(a, b)}` } },
        hints: [`One group is ${tiles(a, b)}. Make ${g} groups: ${g} × ${a} tiles.`, `That is ${n} tiles of 1/${b}.${n > b ? ` ${b} of them are as long as the whole tile.` : ''}`, `${g} × ${fr(a, b)} = ${fr(n, b)}${mixed(n, b) !== fr(n, b) ? ` = ${mixed(n, b)}` : ''}.`],
        explain: `${g} × ${fr(a, b)} = ${fr(n, b)}${mixed(n, b) !== fr(n, b) ? ` = ${mixed(n, b)}` : ''}: ${g} groups of ${a} make ${n} tiles of 1/${b}.`,
        solution: { board: solved(setup, [[b, n]]), box: fr(n, b) },
      };
    }),
  T('order-unlike-fractions', 'Order unlike fractions', '4.NF.A.2', '4',
    'Build four fractions on the wall, one row each. Pick the order from smallest to largest.',
    'The wall settles order by length. Children should still verbalize: 3/8 sits between 1/4 and 1/2 because its length does.',
    R => {
      let fs;
      for (;;) { fs = R.shuffle([2, 3, 4, 5, 6, 8, 10, 12]).slice(0, 4).map(d => [R.int(1, d - 1), d]); if (new Set(fs.map(([n, d]) => (n / d).toFixed(6))).size === 4) break; }
      const txt = fs.map(([n, d]) => fr(n, d)), up = [...fs].sort((x, y) => x[0] / x[1] - y[0] / y[1]).map(([n, d]) => fr(n, d));
      const swap = (l, i) => { const c = [...l]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c; };
      const ch = options(R, up.join(', '), [swap(up, 0).join(', '), swap(up, 2).join(', '), swap(up, 1).join(', '), [...up].reverse().join(', ')]);
      const setup = tileBoard({ locked: [[1, 1]] });
      return {
        prompt: `Build ${txt.join(', ')} under the whole tile, one row each. Which order goes from smallest to largest?`,
        setup, answer: { board: [{ t: 'counts', has: Object.fromEntries(fs.map(([n, d]) => [d, n])), say: `Build ${txt.join(', ')}, each with its own tiles.` }], choice: { ...ch, say: 'The shortest row is the smallest. Compare where each row ends.' } },
        hints: [fs.map(([n, d]) => tiles(n, d)).join(', ') + '.', 'Line the rows up on the left. The shortest row is the smallest fraction.', `From the shortest row to the longest: ${up.join(', ')}.`],
        explain: `${up.join(' < ')}. On the wall, a longer row is a bigger fraction.`,
        solution: { board: solved(setup, fs.map(([n, d]) => [d, n])), choice: ch.correct },
      };
    }),
  T('subtract-from-a-whole', 'Subtract from a whole', '5.NF.A.1', '5',
    'A whole is covered with tiles of one size. Take some away. What remains, and how can you check it?',
    '7/10 remains, checked by adding back to the whole. Inverse checking should become a habit.',
    R => {
      const d = R.pick(DENS), a = R.int(1, d - 1), setup = tileBoard({ locked: [[1, 1]], loose: [[d, d]] });
      return {
        prompt: `Under the whole tile, ${d} tiles of 1/${d} cover it. Take away ${fr(a, d)}: delete ${a} of them. What remains?`,
        setup, answer: { board: [{ t: 'counts', has: { [d]: d - a }, say: `Take away ${tiles(a, d)}: hold a tile, then Delete.` }], box: { key: fr(d - a, d), label: 'what remains' } },
        hints: ['Hold a 1/' + d + ' tile (or right-click it), then pick Delete.', `Delete ${a === 1 ? '1 tile' : `${a} tiles`}. Count the tiles that are left.`, `1 - ${fr(a, d)} = ${fr(d - a, d)}. Check: ${fr(d - a, d)} + ${fr(a, d)} = 1.`],
        explain: `1 - ${fr(a, d)} = ${fr(d - a, d)}. Adding back: ${fr(d - a, d)} + ${fr(a, d)} = ${fr(d, d)} = 1, so it checks.`,
        solution: { board: solved(setup, [[d, d - a]]), box: fr(d - a, d) },
      };
    }),
  T('decimal-tiles', 'Decimal tiles', '5.NBT.A.3', '5',
    'Switch labels to decimal. Build a decimal with tiles of one size. How many tiles did you use?',
    '0.7 uses tenths, 0.25 needs hundredths thinking modeled with tiles as quarters of tenths discussion. Precision of language matters.',
    R => {
      const d = R.pick([2, 4, 5, 8, 10, 10, 4, 5]), k = R.int(1, d <= 5 ? 2 * d - 1 : d - 1), x = k / d, setup = tileBoard();
      return {
        prompt: `Switch Labels to Decimal. Build ${dec(x)} using only ${dec(1 / d)} tiles. How many ${dec(1 / d)} tiles did you use?`,
        setup, answer: { board: [{ t: 'mode', modes: ['dec'], say: 'Switch Labels under the board to Decimal.' }, { t: 'counts', has: { [d]: k }, say: `Use only ${dec(1 / d)} tiles to make ${dec(x)}.` }], box: { key: String(k), label: 'tiles' } },
        hints: [`Change Labels to Decimal. Find the tile that says ${dec(1 / d)}.`, `Count by ${dec(1 / d)}: ${[1, 2, 3].map(i => dec(i / d)).join(', ')}, ... until you reach ${dec(x)}.`, `${k} × ${dec(1 / d)} = ${dec(x)}: ${k} tiles.`],
        explain: `${dec(x)} = ${k} × ${dec(1 / d)} = ${mixed(k, d)}. The ${dec(1 / d)} tile is the 1/${d} tile with its decimal name.`,
        solution: { board: solved(setup, [[d, k]], 'dec'), box: String(k) },
      };
    }),
  T('half-of-a-half', 'Half of a half', '5.NF.B.4', '5',
    'Cover a fraction exactly with tiles half its size or smaller. What is half (or a quarter) of it?',
    'Each halving doubles the denominator. The pattern 2, 4, 8 prepares for fraction multiplication by a half.',
    R => {
      const all = []; for (const b of [1, 2, 3, 4, 5, 6]) for (let a = 1; a <= Math.max(1, b - 1); a++) { if (2 * b <= 12) all.push([a, b, 2]); if (4 * b <= 12) all.push([a, b, 4]); }
      const [a, b, p] = R.pick(all), D = p * b, food = R.pick(['a pizza', 'a sandwich', 'a ribbon', 'a cake']), setup = tileBoard({ locked: [[b, a]] });
      const part = p === 2 ? 'half' : 'a quarter', nm = b === 1 ? 'the whole' : fr(a, b);
      return {
        prompt: `${b === 1 ? `There is a whole ${food.slice(2)}` : `There is ${fr(a, b)} of ${food}`}. Cover ${b === 1 ? 'the whole tile' : `the ${fr(a, b)}`} exactly with 1/${D} tiles, then find ${part} of it. What is ${part} of ${nm}? (Build just that part.)`,
        setup, answer: { board: [{ t: 'counts', has: { [D]: a }, say: `Build only ${part} of ${fr(a, b)}, with 1/${D} tiles.` }], box: { key: fr(a, D), label: `${part} of ${fr(a, b)}` } },
        hints: [`${fr(a, b)} is covered by ${a * p} tiles of 1/${D}.`, `${part[0].toUpperCase()}${part.slice(1)} of those ${a * p} tiles is ${a}. Keep just ${a} on the board.`, `${part[0].toUpperCase()}${part.slice(1)} of ${fr(a, b)} = ${fr(a, D)}.`],
        explain: `${p === 2 ? '1/2' : '1/4'} × ${fr(a, b)} = ${fr(a, D)}. Cutting each piece into ${p} equal parts multiplies the denominator by ${p}.`,
        solution: { board: solved(setup, [[D, a]]), box: fr(a, D) },
      };
    }),
  T('tile-story-problem', 'Tile story problem', '4.NF.B.3d', '4',
    'A food is cut into equal parts and two people eat some. Build the story with tiles, take away what was eaten, and write the fraction left.',
    '5/8 eaten, 3/8 left. Stories anchor tile work; ask children to act the eating by removing tiles.',
    R => {
      const d = R.pick([4, 6, 8, 10, 12]), food = R.pick(['pizza', 'cake', 'pan of brownies', 'chocolate bar', 'pie']), who = R.pick(NAMES);
      const a = R.int(1, d - 2), c = R.int(1, d - a - 1), left = d - a - c, setup = tileBoard({ loose: [[d, d]] });
      return {
        prompt: `A ${food} is cut into ${d} equal parts: ${d} tiles of 1/${d}. ${who} eats ${a}, a friend eats ${c}. Delete the parts they ate. What fraction is left?`,
        setup, answer: { board: [{ t: 'counts', has: { [d]: left }, say: `Take away ${a} and then ${c} tiles: hold a tile, then Delete.` }], box: { key: fr(left, d), label: 'left' } },
        hints: [`Delete ${a} tiles for ${who}, then ${c} for the friend.`, `${a} + ${c} = ${a + c} parts eaten. Count the tiles left.`, `${fr(d, d)} - ${fr(a + c, d)} = ${fr(left, d)}.`],
        explain: `${fr(a, d)} + ${fr(c, d)} = ${fr(a + c, d)} eaten, so ${fr(left, d)} is left.`,
        solution: { board: solved(setup, [[d, left]]), box: fr(left, d) },
      };
    }),
  T('equivalent-rename', 'Equivalent rename', '4.NF.A.1', '4',
    'Rename a fraction in lowest terms with tiles: cover it exactly with the fewest tiles of one size, and type the fraction.',
    'Covering 4 tenth tiles exactly with 2 fifth tiles proves the rename. Lowest terms means no smaller tile covers exactly.',
    R => {
      const all = []; for (const D of [4, 6, 8, 10, 12]) for (let k = 2; k < D; k++) if (gcd(k, D) > 1) all.push([k, D]);
      const [k, D] = R.pick(all), g = gcd(k, D), a = k / g, b = D / g, what = R.pick(STUFF), setup = tileBoard({ locked: [[D, k]] });
      return {
        prompt: `${fr(k, D)} of ${what} is shown. Cover the ${fr(k, D)} exactly with the fewest tiles of one size. Write ${fr(k, D)} in lowest terms.`,
        setup, answer: { board: [{ t: 'counts', has: { [b]: a }, say: `Use tiles of one size: the biggest size that covers ${fr(k, D)} exactly.` }], box: { key: fr(a, b), simplest: true, label: 'lowest terms', say: 'Use the fewest tiles: lowest terms has no smaller name.' } },
        hints: [`Try bigger tiles under the ${fr(k, D)} row. Which size ends exactly where it ends?`, `1/${b} tiles fit: ${a === 1 ? 'one of them covers' : `${a} of them cover`} ${fr(k, D)}.`, `${fr(k, D)} = ${fr(a, b)}.`],
        explain: `${fr(k, D)} = ${fr(a, b)}: ${tiles(a, b)} ${a === 1 ? 'covers' : 'cover'} it exactly, and no bigger tile does.`,
        solution: { board: solved(setup, [[b, a]]), box: fr(a, b) },
      };
    }),
  T('gap-fractions', 'Gap fractions', '5.NF.A.1', '5',
    'Two tiles sit under a whole with a gap after them. What fraction fills the gap exactly? Fill it with tiles of one size.',
    'The gap is 1/6, found by trading both to sixths. Gap problems are subtraction disguised as building.',
    R => {
      let b, d, a, c, L, k;
      for (;;) { [b, d] = R.shuffle([2, 3, 4, 5, 6, 8, 10, 12]).slice(0, 2); L = lcm(b, d); if (L > 12) continue; a = R.chance(0.6) ? 1 : R.int(1, b - 1); c = R.chance(0.6) ? 1 : R.int(1, d - 1); k = L - a * (L / b) - c * (L / d); if (k > 0) break; }
      const setup = boardWith(SLUG, [], [...rows([[1, 1]], X0, Y0, true, 'frac'), ...Array.from({ length: a }, (_, i) => tile(b, X0 + i * DEFS[`f${b}`].w, Y0 + 40, true)), ...Array.from({ length: c }, (_, i) => tile(d, X0 + a * DEFS[`f${b}`].w + i * DEFS[`f${d}`].w, Y0 + 40, true))], { mode: 'frac' });
      return {
        prompt: `Under the whole tile, ${fr(a, b)} and ${fr(c, d)} sit side by side, with a gap after them. What fraction fills the gap exactly? Fill it with 1/${L} tiles.`,
        setup, answer: { board: [{ t: 'counts', has: { [L]: k }, say: `Fill the gap exactly with 1/${L} tiles.` }], box: { key: fr(k, L), label: 'the gap' } },
        hints: [`Drag 1/${L} tiles into the gap, edge to edge.`, `${fr(a, b)} = ${fr(a * (L / b), L)} and ${fr(c, d)} = ${fr(c * (L / d), L)}. The whole is ${fr(L, L)}.`, `${L} - ${a * (L / b)} - ${c * (L / d)} = ${k}: the gap is ${fr(k, L)}.`],
        explain: `1 - ${fr(a, b)} - ${fr(c, d)} = ${fr(k, L)}${low(k, L) !== fr(k, L) ? ` = ${low(k, L)}` : ''}. Trading everything to 1/${L} tiles makes the gap easy to count.`,
        solution: { board: solved(setup, [[L, k]]), box: fr(k, L) },
      };
    }),
  T('percent-tiles-switch', 'Percent tiles switch', '6.RP.A.3c', '6',
    'Build a fraction, switch labels to percent and type the percent. Then build the same percent a second way, with other tiles.',
    '3/5 is 60 percent. Building it from percent-labeled pieces confirms the switch did not change the amount.',
    R => {
      const all = []; for (const b of [2, 4, 5]) for (let a = 1; a < b; a++) all.push([a, b]);
      const [a, b] = R.pick(all), x = a / b, p = pct(x), what = R.pick(['of a class voted yes', 'of a fish tank is full', 'of a field is planted', 'of a book is read', 'of a race is run']);
      const D = R.pick([4, 8, 10].filter(e => e > b && e % b === 0)), k = (a * D) / b, setup = tileBoard();
      return {
        prompt: `${fr(a, b)} ${what}. Build ${fr(a, b)} with 1/${b} tiles and switch Labels to Percent. What percent is it? Then build the same percent a second way, under it, with other tiles.`,
        setup, answer: { board: [{ t: 'twoWays', d: b, n: a, say: `Build ${fr(a, b)} with 1/${b} tiles, and the same amount again with tiles of another size.` }, { t: 'mode', modes: ['pct'], say: 'Switch Labels under the board to Percent.' }],
          box: { key: p, keys: [p, `${p}%`], label: 'percent' } },
        hints: [`Build ${tiles(a, b)}, then change Labels to Percent: each tile shows ${pct(1 / b)}%.`, `${a} × ${pct(1 / b)}% = ${p}%. For the second way, try 1/${D} tiles: each is ${pct(1 / D)}%.`, `${fr(a, b)} = ${p}% = ${fr(k, D)}: ${k} tiles of ${pct(1 / D)}%.`],
        explain: `${fr(a, b)} = ${p}% = ${fr(k, D)}. Switching the labels does not change any tile, so both rows still match.`,
        solution: { board: solved(setup, [[b, a], [D, k]], 'pct'), box: p },
      };
    }),
];
