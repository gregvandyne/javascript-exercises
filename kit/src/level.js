// Levels (spec §7.2): Oomba.level.grid(rows, legend, {cell}) turns ASCII rows (strictly one character per cell) into a
// Level: a tile grid for the physics (solid ground, one-way ledges, water) and a list of things to spawn. Rows may be
// ragged; spaces and '.' are empty. A game's legend adds or overrides single characters (a longer key is a validation
// error and is dropped, with a warning). Oomba.level.generate({seed, length, difficulty}) makes a meadow platformer.
import { validate } from './validate.js';
import { mulberry32, seedOf } from './rand.js';

/** The built-in legend. Values are kinds (see game.js KINDS); a game's legend may name any kind, prop or species. */
export const LEGEND = {
  '#': 'ground', '=': 'ledge', '~': 'water', P: 'player', G: 'goal', $: 'spark', H: 'heart', Q: 'gate', '^': 'spikes',
  B: 'bee', S: 'spring', K: 'checkpoint', L: 'lantern', N: 'npc', D: 'door', k: 'key', M: 'mover', E: 'roller', i: 'sign',
  C: 'crate', o: 'coin',
};
export const TILE = { empty: 0, solid: 1, ledge: 2, water: 3 };
const TILE_OF = { ground: 1, ledge: 2, water: 3 };

/** Oomba.level.grid(rows, legend?, {cell = 48}) -> Level. */
export function grid(rows, legend = {}, o = {}) {
  const warnings = [];
  rows = [].concat(rows || []).map(r => String(r == null ? '' : r));
  const v = validate('legend', legend || {});
  warnings.push(...v.warnings);
  const L = Object.assign({}, LEGEND, v.spec);
  const cell = Math.max(16, Math.min(256, +o.cell || 48));
  const cols = rows.reduce((m, r) => Math.max(m, [...r].length), 0), nrows = rows.length;
  const tiles = new Uint8Array(Math.max(1, cols * nrows)), items = [], unknown = new Set();
  let start = null;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === ' ' || ch === '.') return;
    const spec = L[ch];
    if (spec == null) { unknown.add(ch); return; }
    for (const s of [].concat(spec)) {
      const kind = typeof s === 'string' ? s : s && s.kind;
      if (TILE_OF[kind]) { tiles[r * cols + c] = TILE_OF[kind]; if (typeof s === 'object') items.push({ ch, c, r, spec: s, tile: true }); continue; }
      if (kind === 'player') start = { c, r };
      items.push({ ch, c, r, spec: s });
    }
  }));
  for (const ch of unknown) warnings.push(`level: "${ch}" is not in the legend (ignored). Add it: legend: { '${ch}': 'kind' }`);
  if (!start) warnings.push('level: no player start ("P"); the hero starts at the left');
  return new Level({ rows, legend: L, cell, cols, nrows, tiles, items, start: start || { c: 1, r: Math.max(0, nrows - 2) }, warnings, water: o.water || null });
}

export class Level {
  constructor(o) { Object.assign(this, o); this.w = this.cols * this.cell; this.h = this.nrows * this.cell; this.__level = true; }
  /** Tile type at a cell (outside the grid: solid at the sides, empty above and below). */
  at(c, r) {
    if (c < 0 || c >= this.cols) return r < this.nrows ? TILE.solid : TILE.empty;
    if (r < 0 || r >= this.nrows) return TILE.empty;
    return this.tiles[r * this.cols + c];
  }
  col(x) { return Math.floor(x / this.cell); }
  row(y) { return Math.floor(y / this.cell); }
  /** The top of the highest solid or ledge tile at or below world y in column of x (or null). */
  floorBelow(x, y = -1e9) {
    const c = this.col(x); if (c < 0 || c >= this.cols) return null;
    for (let r = Math.max(0, this.row(y)); r < this.nrows; r++) { const t = this.at(c, r); if (t === TILE.solid || t === TILE.ledge || t === TILE.water) return r * this.cell; }
    return null;
  }
  /** Rows for stage.ground(): the solid cells as '#'. */
  groundRows() { return this.rows.map((row, r) => { let s = ''; for (let c = 0; c < this.cols; c++) s += this.tiles[r * this.cols + c] === TILE.solid ? '#' : ' '; return s; }); }
}

/** Oomba.level.generate({seed, length = 60, difficulty = 0.5, cell}) -> a meadow platformer Level: gaps, ledges with
 *  sparks over them, spikes, bees, springs, a checkpoint half way and the flag at the end. Same seed, same level. */
export function generate(o = {}) {
  const R = mulberry32(seedOf(o.seed == null ? 1 : o.seed)), d = Math.max(0, Math.min(1, +o.difficulty || 0.5));
  const W = Math.max(30, Math.min(400, o.length | 0 || 60)), H = 9, g = H - 2;   // surface row g, one row under it
  const rows = Array.from({ length: H }, () => Array(W).fill(' '));
  for (let c = 0; c < W; c++) { rows[g][c] = '#'; rows[g + 1][c] = '#'; }
  rows[g - 1][2] = 'P';
  let c = 8; const mid = W >> 1;
  while (c < W - 10) {
    const pick = R();
    if (pick < 0.2 + d * 0.15) {   // a gap with sparks arcing over it
      const gap = 2 + (R() < d ? 1 : 0); for (let i = 0; i < gap; i++) { rows[g][c + i] = ' '; rows[g + 1][c + i] = ' '; }
      for (let i = -1; i <= gap; i++) rows[g - 3][c + i] = '$';
      c += gap + 4;
    } else if (pick < 0.45) {      // a ledge with sparks on top
      const n = 3 + ((R() * 3) | 0); for (let i = 0; i < n; i++) { rows[g - 3][c + i] = '='; rows[g - 4][c + i] = '$'; }
      if (R() < 0.3 + d * 0.4) rows[g - 1][c + 1] = '^';
      c += n + 3;
    } else if (pick < 0.6 + d * 0.1) { rows[g - 1][c] = '^'; rows[g - 1][c + 1] = '^'; rows[g - 3][c] = '$'; c += 5; }
    else if (pick < 0.72) { rows[g - 1][c] = 'S'; for (let i = 0; i < 3; i++) rows[g - 5 - i][c + 1] = '$'; c += 5; }
    else if (pick < 0.85) { rows[g - 4][c] = 'B'; rows[g - 1][c - 1] = '$'; rows[g - 1][c + 2] = '$'; c += 6; }
    else { rows[g - 1][c] = '$'; rows[g - 1][c + 1] = '$'; rows[g - 1][c + 2] = 'H'; c += 5; }
    if (c >= mid && !rows.some(r => r.includes('K'))) { rows[g - 1][c] = 'K'; c += 3; }
  }
  rows[g - 1][W - 4] = 'G';
  return grid(rows.map(r => r.join('')), {}, { cell: o.cell || 48 });
}
