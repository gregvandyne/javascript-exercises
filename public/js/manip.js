// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"; server: services/manipulatives.js). One
// page, views by #hash: '' home, 'tasks' the task library, '<tool>' a tool's board on your own, 'live/<id>' a live
// session's shared room (public/js/manip-room.js; 'join/<id>' joins first).
// A board is one JSON object: the tool's own state, plus __ann { notes, strokes } (sticky notes and pen marks, their
// places as fractions of the board so they land in the same spot on any screen). Every change goes through change(),
// which keeps the undo history and draws the board again.
// Hosts (teachers testing it) save boards with share codes, run sessions and draft with AI; students only see their
// own square in a session's room. Chrome strings are i18n keys (js.manip.*); tool names, tool help and the task library are
// English data (public/js/manip-data.js, public/js/manip-tasks.js).
import { t, api, toast, esc, pageData } from '/js/app.js';
import { TOOLS, CATS, toolOf, pieceDefs, allPieceDefs, BREAKS, FRACTION_DENS, fracLabel, hexValue, paletteName } from '/js/manip-data.js';
import { TASKS } from '/js/manip-tasks.js';
import * as ROOM from '/js/manip-room.js';
import { stepsOf } from '/js/manip-data.js';
import { WORLD, OBJECTS, kindsOf, kindOf, objectTool, objSize, objRect, clockSector, addMinutes, migrate, newBoard, boxesOf, bbox, spotIn, placeObject,
  slotsOf, snapFor, groupOf, pieceBox, SNAP_PX, nextPieceSpot, S_MIN, S_FLOOR, S_MAX, OBJ_MAX, OBJ_HEAD, UNDER, parseFrac, EQ_BAR } from '/js/manip-board.js';

const ROOT = document.getElementById('manip');
const ROLE = pageData().role === 'host' ? 'host' : 'student';
const HOST = ROLE === 'host';
const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
const NOTE_MAX = 12, NOTE_W = 176, NOTE_H = 118;
let STATE = { boards: [], classes: [], sessions: [] };
let V = null;          // the open board (tool view)
let timers = [];       // intervals and timeouts of the current view
const clear = () => { for (const x of timers) { clearInterval(x); clearTimeout(x); } timers = []; };
const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const round3 = n => Math.round(n * 1000) / 1000;
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return d; } };
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;

// ================================================================ tools
// Each tool: init() its state; total(st) the chip text; palette(st) [{ label, color, run(st) }]; settings(st) HTML with
// data-set controls; hint and note (help text); board(st, view) the board's HTML; act(st, data, e) a tap on a [data-act]
// element (true when the board changed); bind(el) pointer work of its own; pieces: true for the drag-and-drop tools.
let pid = 1;
const newId = () => `${Date.now().toString(36)}${(pid++).toString(36)}`;
function mkPiece(d, x, y) {
  return { id: newId(), kind: d.kind, x, y, rot: 0, flipped: false, filled: true, locked: false, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h };
}
const sel = (key, opts, val, label) => `<label class="mp-set"><span>${esc(label)}</span><select class="input input-sm" data-set="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const toggle = (key, on, onLabel, offLabel) => btn('chip', `data-toggle="${key}" aria-pressed="${on ? 'true' : 'false'}"`, esc(on ? onLabel : offLabel));
const sum = ps => ps.reduce((s, p) => s + (+p.value || 0), 0);
const count = (ps, k) => ps.filter(p => p.kind === k).length;

/** A drag-and-drop tool: pieces from a palette, Break and Regroup where the tool has them. */
function piecesTool({ slug, opts = () => ({}), init = {}, total, settings = () => '', hint = '', note = '' }) {
  const defsOf = st => pieceDefs(slug, opts(st));
  const breaks = BREAKS[slug];
  return {
    pieces: true, hint, note,
    init: () => ({ pieces: [], ...init }),
    defs: defsOf,
    total,
    palette: st => [
      ...defsOf(st).map(d => ({ label: d.label, color: d.color, run: s => { s.pieces.push(placePiece(s, d)); } })),
      ...(breaks ? [{ label: 'Break ×10', hot: true, run: (s, v) => breakPiece(s, v, slug) }, { label: 'Regroup 10 → 1', run: (s, v) => regroup(s, v, slug) }] : []),
    ],
    settings,
  };
}
const SHAPES = { hex: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)', trap: 'polygon(25% 0,75% 0,100% 100%,0 100%)', tri: 'polygon(50% 0,100% 100%,0 100%)',
  para: 'polygon(25% 0,100% 0,75% 100%,0 100%)', rhom: 'polygon(12% 0,100% 0,88% 100%,0 100%)' };
const ROUND = new Set(['pos', 'neg', 'blue', 'green', 'm', 'hth', 'tth', 'th', 'h', 't', 'o', 'tenth', 'hund', 'thou', 'penny', 'nickel', 'dime', 'quarter']);
/** A label size that fits the piece: never wider than the piece, never taller than half of it, 9 to 20 pixels. */
const pieceFont = p => Math.round(Math.min(20, Math.max(9, Math.min(p.w / 3, (p.w - 8) / (Math.max(1, [...String(p.label)].length) * 0.62), p.h * 0.55))));
function pieceHtml(p, view) {
  const on = !view.readOnly && view.sel === p.id;
  const shape = SHAPES[p.kind] ? `clip-path:${SHAPES[p.kind]};` : ROUND.has(p.kind) && !/^b\d/.test(p.kind) ? 'border-radius:50%;' : '';
  const face = `<div class="mp-face" style="${shape}background:${p.filled ? esc(p.color) : 'transparent'};color:${p.filled ? '#fff' : 'var(--text)'};font-size:${pieceFont(p)}px">${SHAPES[p.kind] || p.kind === 'sq' || !p.label || p.label === '•' ? '' : `<span>${esc(p.label)}</span>`}</div>`;
  const bar = on ? `<div class="mp-pbar" role="toolbar" aria-label="${esc(t('js.manip.piece.actions', { label: p.label }))}">
    ${[['copy', t('js.manip.piece.copy')], ...(p.g ? [['separate', t('js.manip.piece.separate')]] : []), ['flip', t('js.manip.piece.flip')], ['rotate', t('js.manip.piece.rotate')], ['fill', t('js.manip.piece.fill')], ['lock', p.locked ? t('js.manip.piece.unlock') : t('js.manip.piece.lock')], ['delete', t('js.manip.piece.delete')]]
    .map(([a, l]) => btn(`mp-pbtn${a === 'delete' ? ' bad' : ''}`, `data-pact="${a}" data-pid="${p.id}"`, esc(l))).join('')}</div>` : '';
  return `<div class="mp-piece${on ? ' on' : ''}${p.locked ? ' locked' : ''}${p.g ? ' grouped' : ''}${view.snapped && view.snapped.has(p.id) ? ' snapped' : ''}${view.fresh === p.id ? ' fresh' : ''}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(t('js.manip.piece.label', { label: p.label }))}"
    style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;transform:rotate(${p.rot}deg) scaleX(${p.flipped ? -1 : 1})">${face}${bar}</div>`;
}
function breakPiece(st, v, slug) {
  const p = st.pieces.find(x => x.id === v.sel); const to = p && BREAKS[slug][p.kind];
  if (!to) { toast(t('js.manip.piece.pickBreak')); return false; }
  const d = allPieceDefs(slug).find(x => x.kind === to);
  st.pieces = st.pieces.filter(x => x.id !== p.id);
  for (let i = 0; i < 10; i++) st.pieces.push(mkPiece(d, p.x + (i % 5) * (d.w + 6), p.y + Math.floor(i / 5) * (d.h + 6)));
  v.sel = null; return true;
}
function regroup(st, v, slug) {
  const p = st.pieces.find(x => x.id === v.sel);
  const up = p && Object.keys(BREAKS[slug]).find(k => BREAKS[slug][k] === p.kind);
  const same = p ? st.pieces.filter(x => x.kind === p.kind) : [];
  if (!up || same.length < 10) { toast(t('js.manip.piece.pickRegroup')); return false; }
  const gone = new Set(same.slice(0, 10).map(x => x.id));
  st.pieces = st.pieces.filter(x => !gone.has(x.id));
  st.pieces.push(mkPiece(allPieceDefs(slug).find(x => x.kind === up), same[0].x, same[0].y));
  v.sel = null; return true;
}
const fmtTotal = n => (Number.isInteger(n) ? n.toLocaleString('en-US') : round3(n).toLocaleString('en-US', { maximumFractionDigits: 3 }));

const IMPL = {
  'base-ten-blocks': piecesTool({ slug: 'base-ten-blocks', init: { decimal: false }, opts: st => ({ decimal: st.decimal }),
    total: st => `Total ${fmtTotal(sum(st.pieces))}`,
    settings: st => sel('decimal', [['', 'Whole numbers'], ['1', 'Decimals']], st.decimal ? '1' : '', 'Number set'),
    hint: 'Select a piece, then Break splits it into ten of the next size and Regroup joins ten back into one. The total stays the same.',
    note: 'Drop blocks into the place-value chart\'s columns to build, compare and regroup numbers. Add more charts or a work mat from the palette.' }),
  'place-value-disks': piecesTool({ slug: 'place-value-disks', total: st => `Total ${fmtTotal(sum(st.pieces))}`,
    hint: 'Select a disk, then Break it into ten disks of the next place, or Regroup ten disks into one.',
    note: 'Disks from 1,000,000 down to 0.001. Their size does not show their value: the label does.' }),
  'two-color-counters': piecesTool({ slug: 'two-color-counters',
    total: st => { const pos = count(st.pieces, 'pos'), neg = count(st.pieces, 'neg'); return `Value ${pos - neg} · Zero pairs ${Math.min(pos, neg)}`; },
    hint: 'Yellow is +1 and red is -1. Put one of each together to make a zero pair.',
    note: 'Counters drop into the ten-frame\'s cells. Add five-frames and ten-frames from the palette, and Flip to turn a counter over.' }),
  'linking-cubes': piecesTool({ slug: 'linking-cubes', total: st => `Cubes ${st.pieces.length}`,
    hint: 'Drag cubes edge to edge to make sticks. Copy a cube to make more of the same color.',
    note: 'Ten colors for making numbers, arrays, patterns and bar graphs.' }),
  'color-tiles': piecesTool({ slug: 'color-tiles', total: st => `Tiles ${st.pieces.length} · Area ${st.pieces.length} square units`,
    hint: 'Build a rectangle and read its area from the total. Count the outside edges for the perimeter.',
    note: 'Square tiles for patterns, multiplication as area, and area and perimeter.' }),
  'number-rods': piecesTool({ slug: 'number-rods', init: { unit: '1' },
    total: st => `Length value ${round3(sum(st.pieces) * (+st.unit || 1))}`,
    settings: st => sel('unit', [['1', '1 (whole numbers)'], ['0.1', '0.1 (decimals)'], ['0.5', '1/2 (fractions)']], st.unit, 'Value of the white rod'),
    hint: 'Give the white rod a value and every other rod takes its value by length. Rotate a rod to stand it up.',
    note: 'Ten rods in ten colors, each one unit longer than the last.' }),
  'fraction-tiles': piecesTool({ slug: 'fraction-tiles', init: { mode: 'frac' }, opts: st => ({ mode: st.mode }),
    total: st => `Total ${round3(sum(st.pieces))} wholes`,
    settings: st => sel('mode', [['frac', 'Fraction'], ['pct', 'Percent'], ['dec', 'Decimal']], st.mode, 'Labels'),
    hint: 'Stack rows by denominator to build a fraction wall. Use Fill to make a tile an outline.',
    note: 'Wholes, halves, thirds, fourths, fifths, sixths, eighths, tenths and twelfths. Line them up to show equivalence.' }),
  'algebra-tiles': piecesTool({ slug: 'algebra-tiles',
    total: st => {
      const c = k => count(st.pieces, k);
      const parts = [[c('x2') - c('mx2'), 'x²'], [c('y2'), 'y²'], [c('xy'), 'xy'], [c('x') - c('mx'), 'x'], [c('y') - c('my'), 'y'], [c('one') - c('mone'), '']].filter(([n]) => n).map(([n, v]) => `${n}${v}`);
      return `Expression ${parts.length ? parts.join(' + ').replace(/\+ -/g, '− ') : '0'} · Zero pairs ${Math.min(c('one'), c('mone')) + Math.min(c('x'), c('mx'))}`;
    },
    hint: 'A tile and its opposite make a zero pair. Build area models like (x + 3)(x + 2).',
    note: 'The area of each tile is its value: 1, x, x², y, y² and xy, with their opposites.' }),
  'pattern-blocks': piecesTool({ slug: 'pattern-blocks', total: st => { const v = hexValue(st.pieces); return `Blocks ${st.pieces.length} · Hexagons ${v.text}${v.left ? ` · ${v.left} not counted` : ''}`; },
    hint: 'Rotate turns a block 30 degrees. If the hexagon is 1 whole, the trapezoid is 1/2, the blue parallelogram 1/3 and the triangle 1/6. The square and the thin rhombus are not counted.',
    note: 'Hexagon, trapezoid, triangle, parallelogram, rhombus and square.' }),
  money: piecesTool({ slug: 'money', total: st => `Total $${(sum(st.pieces) / 100).toFixed(2)}`,
    hint: 'To trade, delete ten $1 bills and add a $10 bill, or trade ten 1¢ coins for a 10¢ coin.',
    note: 'Coins and bills to make, compare and trade amounts.' }),

  rekenreks: {
    init: () => ({ rows: 2, counts: Array(10).fill(0), covered: false, long: false }),
    total: st => `Showing ${st.counts.slice(0, st.rows).reduce((s, c) => s + c, 0)}`,
    palette: st => [
      ...[1, 2, 5, 10].map(n => ({ label: n === 1 ? '1 row' : `${n} rows`, color: '#E53935', run: s => { s.rows = n; } })),
      { label: st.long ? '10-bead rows' : '20-bead rows', color: '#FFD23F', run: s => { s.long = !s.long; } },
      { label: st.covered ? 'Uncover' : 'Cover', color: '#212121', run: s => { s.covered = !s.covered; } },
    ],
    hint: 'Tap a bead to slide beads to the left. Rows are 5 red and 5 white, so 5 and 10 are easy to see.',
    note: 'The number on the right of each row is that row\'s total.',
    board: (st, view) => {
      const per = st.long ? 20 : 10;
      return `<div class="mp-pad mp-rek${st.long ? ' long' : ''}">${Array.from({ length: st.rows }, (_, r) => `<div class="mp-rekrow"><div class="mp-wire" aria-hidden="true"></div><div class="mp-beads">${Array.from({ length: per }, (_, i) => {
        const on = i < (st.counts[r] || 0), red = st.long ? i < 10 : i < 5;
        return `<button type="button" class="mp-bead${on ? ' on' : ''}" data-act="bead" data-r="${r}" data-i="${i}" ${view.readOnly ? 'tabindex="-1"' : ''} aria-label="Row ${r + 1} bead ${i + 1}" style="background:${red ? '#E53935' : '#FFFFFF'};${st.covered && on ? 'opacity:.15;' : ''}"></button>`;
      }).join('')}</div><span class="mp-rowtotal">${st.covered ? '?' : st.counts[r] || 0}</span></div>`).join('')}
      ${st.covered ? '<p class="mp-callout">Cover is on: the counted beads are hidden. How many are hidden?</p>' : ''}</div>`;
    },
    act: (st, d) => { if (d.act !== 'bead') return false; const r = +d.r, i = +d.i; st.counts[r] = i + 1 === st.counts[r] ? i : i + 1; return true; },
  },

  'hundred-board': {
    init: () => ({ start: 1, picked: [], mult: 0, decimalMode: false, hidden: false }),
    total: st => {
      const val = i => (st.decimalMode ? (st.start + i) / 10 : st.start + i);
      if (st.picked.length !== 1) return `Covered ${st.picked.length} cells`;
      const v = val(st.picked[0]);
      return st.decimalMode ? `Covered ${v.toFixed(1)} · 1 more ${(v + 0.1).toFixed(1)} · 10 more ${(v + 1).toFixed(1)}` : `Covered ${v} · 1 more ${v + 1} · 10 more ${v + 10}`;
    },
    palette: st => [...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(m => ({ label: `Multiples of ${m}`, color: '#8E24AA', pressed: st.mult === m, run: s => { s.mult = s.mult === m ? 0 : m; } })),
      { label: st.hidden ? 'Show numbers' : 'Hide numbers', color: '#212121', run: s => { s.hidden = !s.hidden; } }],
    settings: st => `<label class="mp-set"><span>Start at</span><input class="input input-sm mp-num" type="number" data-set="start" value="${st.start}"></label>${sel('decimalMode', [['', 'Whole numbers'], ['1', 'Tenths']], st.decimalMode ? '1' : '', 'Numbers')}`,
    hint: 'Tap a cell to cover it. Rounding: cover a number, round it to the nearest 10, then uncover it to check.',
    note: 'Look for patterns down the columns and across the rows.',
    board: (st, view) => `<div class="mp-pad"><div class="mp-hundred" role="grid" aria-label="Hundred board">${Array.from({ length: 100 }, (_, i) => {
      const v = st.decimalMode ? (st.start + i) / 10 : st.start + i, on = st.picked.includes(i), m = st.mult && !st.decimalMode && Math.round(v) % st.mult === 0;
      return `<button type="button" role="gridcell" class="mp-cell${on ? ' on' : ''}${m ? ' mult' : ''}" data-act="cell" data-i="${i}" ${view.readOnly ? 'tabindex="-1"' : ''} aria-label="Cell ${st.decimalMode ? v.toFixed(1) : v}${on ? ' covered' : ''}">${on ? '★' : st.hidden ? '?' : st.decimalMode ? v.toFixed(1) : v}</button>`;
    }).join('')}</div></div>`,
    act: (st, d) => { if (d.act !== 'cell') return false; const i = +d.i; st.picked = st.picked.includes(i) ? st.picked.filter(x => x !== i) : [...st.picked, i]; return true; },
    load: o => ({ start: Number(o.start) || 1, picked: Array.isArray(o.picked) ? o.picked.map(Number).filter(n => n >= 0 && n < 100) : [], mult: +o.mult || 0, decimalMode: !!o.decimalMode, hidden: !!o.hidden }),
  },

  'fraction-circles': {
    init: () => ({ placed: [], mode: 'frac', rings: false }),
    total: st => `Placed ${st.placed.reduce((s, p) => s + 1 / p.d, 0).toFixed(2)} wholes`,
    palette: st => [...FRACTION_DENS.map(([d, c]) => ({ label: `${fracLabel(d, st.mode, '1')} piece`, color: c, run: s => { s.placed.push({ id: newId(), d, rot: 0 }); } })),
      { label: st.rings ? 'Single circles' : 'Rings view', color: '#5E35B1', run: s => { s.rings = !s.rings; } }],
    settings: st => sel('mode', [['frac', 'Fraction'], ['pct', 'Percent'], ['dec', 'Decimal']], st.mode, 'Labels'),
    hint: 'Tap a placed piece to turn it. The ✕ takes it away.',
    note: 'Put pieces together to make a whole, and use the rings view to compare denominators.',
    board: (st, view) => {
      const col = d => (FRACTION_DENS.find(([x]) => x === d) || [0, '#888'])[1];
      if (st.rings) {
        return `<div class="mp-pad"><svg width="320" height="320" viewBox="0 0 320 320" role="img" aria-label="Fraction circle rings">${FRACTION_DENS.slice(1).map(([d, c], ri) => Array.from({ length: d }, (_, i) => `<path d="${pie(160, 160, 150 - ri * 16, (i * 2 * Math.PI) / d - Math.PI / 2, ((i + 1) * 2 * Math.PI) / d - Math.PI / 2)}" fill="${c}" fill-opacity=".75" stroke="#fff" stroke-width="1.5"/>`).join('')).join('')}<circle cx="160" cy="160" r="22" fill="var(--card)" stroke="var(--line)"/></svg><p class="small muted">One ring for each denominator, so equal fractions line up.</p></div>`;
      }
      return `<div class="mp-pad mp-circles">${st.placed.map(p => {
        const a0 = (p.rot * Math.PI) / 180 - Math.PI / 2, lab = fracLabel(p.d, st.mode, '1');
        return `<div class="mp-circle"><button type="button" data-act="turn" data-id="${p.id}" ${view.readOnly ? 'tabindex="-1"' : ''} aria-label="${esc(lab)} piece, tap to turn"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="70" fill="none" stroke="var(--line)" stroke-dasharray="4 4"/>${p.d === 1 ? `<circle cx="75" cy="75" r="68" fill="${col(1)}" fill-opacity=".9" stroke="#fff" stroke-width="2"/>` : `<path d="${pie(75, 75, 68, a0, a0 + (2 * Math.PI) / p.d)}" fill="${col(p.d)}" fill-opacity=".85" stroke="#fff" stroke-width="2"/>`}<text x="75" y="80" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${esc(lab)}</text></svg></button>${view.readOnly ? '' : btn('mp-x', `data-act="remove" data-id="${p.id}" aria-label="Remove ${esc(lab)} piece"`, '✕')}</div>`;
      }).join('')}${st.placed.length ? '' : '<p class="mp-empty">Add pieces from the palette, then tap them to turn them into a whole.</p>'}</div>`;
    },
    act: (st, d) => {
      if (d.act === 'turn') { const p = st.placed.find(x => x.id === d.id); if (p) p.rot += 360 / p.d; return !!p; }
      if (d.act === 'remove') { st.placed = st.placed.filter(x => x.id !== d.id); return true; }
      return false;
    },
  },

  'number-lines': {
    init: () => ({ min: -10, max: 10, step: 1, hide: false, points: [3], jumps: [], jumpFrom: null }),
    total: st => `Points ${st.points.join(', ') || 'none'}`,
    palette: () => [{ label: 'Add a point at 0', color: '#00ACC1', run: s => { s.points.push(0); } },
      { label: 'Start a jump', color: '#FF6B4A', run: s => { s.jumpFrom = s.points[0] ?? s.min; } },
      { label: 'Clear jumps', color: '#212121', run: s => { s.jumps = []; } }],
    settings: st => `<label class="mp-set"><span>From</span><input class="input input-sm mp-num" type="number" data-set="min" value="${st.min}"></label><label class="mp-set"><span>To</span><input class="input input-sm mp-num" type="number" data-set="max" value="${st.max}"></label>
      ${sel('step', [['1', '1'], ['0.5', '0.5'], ['0.25', '1/4'], ['0.1', '0.1'], ['5', '5'], ['10', '10']], st.step, 'Step')}${toggle('hide', st.hide, 'Show labels', 'Hide labels')}`,
    hint: 'Tap the line to drop a point on the nearest step. Start a jump, then tap where it lands.',
    note: 'Open lines (labels hidden), jump arcs for adding and subtracting, and fraction and decimal steps.',
    board: st => {
      const W = 860, min = +st.min, max = +st.max > +st.min ? +st.max : +st.min + 1, step = +st.step || 1;
      const x = v => 30 + ((v - min) / (max - min)) * (W - 60);
      const ticks = []; for (let v = min; v <= max + 1e-4 && ticks.length < 201; v += step) ticks.push(round3(v));
      return `<div class="mp-pad mp-scrollx"><svg class="mp-nl" data-w="${W}" width="${W}" height="190" viewBox="0 0 ${W} 190" role="img" aria-label="Number line">
        <line x1="20" y1="110" x2="${W - 20}" y2="110" stroke="var(--text)" stroke-width="3"/><polygon points="${W - 20},110 ${W - 34},102 ${W - 34},118" fill="var(--text)"/><polygon points="20,110 34,102 34,118" fill="var(--text)"/>
        ${ticks.map(v => `<line x1="${x(v)}" y1="100" x2="${x(v)}" y2="120" stroke="var(--text)" stroke-width="2"/>${st.hide ? '' : `<text x="${x(v)}" y="142" text-anchor="middle" font-size="13" fill="var(--text)">${v}</text>`}`).join('')}
        ${st.jumps.map(j => { const mx = (x(j.a) + x(j.b)) / 2, h = 34 + Math.abs(x(j.b) - x(j.a)) / 9, d = round3(j.b - j.a); return `<path d="M ${x(j.a)} 100 Q ${mx} ${100 - h} ${x(j.b)} 100" fill="none" stroke="#FF6B4A" stroke-width="3"/><text x="${mx}" y="${92 - h / 2}" text-anchor="middle" font-size="13" font-weight="700" fill="#FF6B4A">${d > 0 ? '+' : ''}${d}</text>`; }).join('')}
        ${st.points.map(p => `<circle cx="${x(p)}" cy="110" r="11" fill="#00ACC1" stroke="#fff" stroke-width="2.5"/><text x="${x(p)}" y="80" text-anchor="middle" font-size="${st.ask ? 22 : 14}" font-weight="800" fill="var(--text)">${st.ask ? '?' : p}</text>`).join('')}
        ${st.jumpFrom !== null && st.jumpFrom !== undefined ? `<text x="${x(st.jumpFrom)}" y="30" font-size="13" font-weight="700" fill="#FF6B4A">Jump from ${st.jumpFrom}: tap where it lands</text>` : ''}</svg>
        ${st.ask ? '' : `<div class="row mp-chips">${st.points.map((p, i) => btn('chip', `data-act="unpoint" data-i="${i}" aria-label="Remove point ${p}"`, `${p} ✕`)).join('')}</div>`}</div>`;
    },
    act: (st, d, e) => {
      if (d.act === 'unpoint') { st.points.splice(+d.i, 1); return true; }
      const svg = e.target.closest('svg.mp-nl'); if (!svg) return false;
      const r = svg.getBoundingClientRect(), W = 860, min = +st.min, max = +st.max > min ? +st.max : min + 1, step = +st.step || 1;
      const v = round3(Math.round((min + (((e.clientX - r.left) / r.width) * W - 30) / (W - 60) * (max - min)) / step) * step);
      if (st.jumpFrom !== null && st.jumpFrom !== undefined) { st.jumps.push({ a: st.jumpFrom, b: v }); st.jumpFrom = null; } else st.points.push(v);
      return true;
    },
    boardTap: true,
  },

  'bar-models': {
    init: () => ({ bars: [{ name: 'Whole', segs: [{ label: 'Part A', value: 3, color: '#7CB342' }, { label: 'Part B', value: 2, color: '#AED581' }] }, { name: 'Compare', segs: [{ label: 'Red', value: 5, color: '#1E88E5' }] }, { name: 'Other', segs: [{ label: 'Blue', value: 3, color: '#FB8C00' }] }] }),
    total: st => `Longest bar ${Math.max(1, ...st.bars.map(b => b.segs.reduce((s, x) => s + x.value, 0)))}`,
    palette: () => [
      { label: 'Add a part', color: '#7CB342', run: s => { if (s.bars[0]) s.bars[0].segs.push({ label: 'Part', value: 1, color: '#C0CA33' }); } },
      { label: 'Add a bar', color: '#1E88E5', run: s => { if (s.bars.length < 8) s.bars.push({ name: `Bar ${s.bars.length + 1}`, segs: [{ label: 'Value', value: 2, color: '#90CAF9' }] }); } },
      { label: 'Part-part-whole', color: '#7CB342', run: s => { s.bars = [{ name: 'Whole', segs: [{ label: 'Part', value: 4, color: '#7CB342' }, { label: 'Part', value: 4, color: '#AED581' }] }]; } },
      { label: 'Comparison', color: '#FB8C00', run: s => { s.bars = [{ name: 'A', segs: [{ label: 'A', value: 6, color: '#1E88E5' }] }, { name: 'B', segs: [{ label: 'B', value: 4, color: '#FB8C00' }] }]; } },
    ],
    hint: 'Use - and + to resize a part, and type in a part to rename it.',
    note: 'Part-part-whole, comparison and equal groups, for rates, ratios and word problems.',
    board: (st, view) => {
      const maxTotal = Math.max(1, ...st.bars.map(b => b.segs.reduce((s, x) => s + x.value, 0)));
      return `<div class="mp-pad mp-bars">${st.bars.map((b, bi) => `<div><p class="mp-barname">${esc(b.name)} · total ${b.segs.some(x => x.hide) ? '?' : b.segs.reduce((s, x) => s + x.value, 0)}</p><div class="mp-bar">${b.segs.map((s, si) => `<div class="mp-seg" style="background:${esc(s.color)};width:${(s.value / maxTotal) * 100}%">
        <input class="mp-seglabel" data-bar="${bi}" data-seg="${si}" value="${esc(s.label)}" maxlength="30" aria-label="Part label in ${esc(b.name)}"${view.readOnly ? ' readonly tabindex="-1"' : ''}>
        <span class="mp-steps">${view.readOnly || s.hide ? '' : btn('', `data-act="seg" data-bar="${bi}" data-seg="${si}" data-d="-1" aria-label="Make ${esc(s.label)} smaller"`, '−')}<b>${s.hide ? '?' : s.value}</b>${view.readOnly || s.hide ? '' : btn('', `data-act="seg" data-bar="${bi}" data-seg="${si}" data-d="1" aria-label="Make ${esc(s.label)} bigger"`, '+')}</span></div>`).join('')}</div></div>`).join('')}</div>`;
    },
    act: (st, d) => { if (d.act !== 'seg') return false; const s = st.bars[+d.bar] && st.bars[+d.bar].segs[+d.seg]; if (!s) return false; s.value = Math.max(0.5, s.value + +d.d); return true; },
    input: (st, el) => { const s = st.bars[+el.dataset.bar] && st.bars[+el.dataset.bar].segs[+el.dataset.seg]; if (s) s.label = el.value.slice(0, 30); },
  },

  'xy-coordinate-board': {
    init: () => ({ four: true, labels: true, connect: true, color: '#E53935', pts: [{ x: 3, y: 4, color: '#E53935' }, { x: 6, y: 2, color: '#1E88E5' }] }),
    total: st => `${st.pts.length} points`,
    palette: st => [...['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'].map(c => ({ label: 'Point color', color: c, pressed: st.color === c, run: s => { s.color = c; } })),
      { label: st.connect ? 'Lines off' : 'Connect the points', color: '#212121', run: s => { s.connect = !s.connect; } },
      { label: 'Clear points', color: '#616161', run: s => { s.pts = []; } }],
    settings: st => `${sel('four', [['', 'First quadrant'], ['1', 'All four quadrants']], st.four ? '1' : '', 'Quadrants')}${toggle('labels', st.labels, 'Labels on', 'Labels off')}`,
    hint: 'Tap the grid to plot a point in the chosen color. Points snap to the grid.',
    note: 'Ordered pairs, lines and polygons, with a data table of every point.',
    board: st => {
      const S = 440, lo = st.four ? -10 : 0, hi = st.four ? 10 : 12;
      const px = v => ((v - lo) / (hi - lo)) * S, py = v => S - ((v - lo) / (hi - lo)) * S;
      const ticks = []; for (let v = lo; v <= hi; v++) ticks.push(v);
      return `<div class="mp-pad mp-xy"><svg class="mp-grid" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Coordinate grid, tap to plot a point">
        ${ticks.map(v => `<line x1="${px(v)}" y1="0" x2="${px(v)}" y2="${S}" stroke="var(--line)" stroke-dasharray="2 4"/><line x1="0" y1="${py(v)}" x2="${S}" y2="${py(v)}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${px(v) + 3}" y="${py(0) - 4}" font-size="11" fill="var(--muted)">${v}</text><text x="${px(0) + 3}" y="${py(v) - 3}" font-size="11" fill="var(--muted)">${v}</text>`).join('')}
        <line x1="${px(0)}" y1="0" x2="${px(0)}" y2="${S}" stroke="var(--text)" stroke-width="2"/><line x1="0" y1="${py(0)}" x2="${S}" y2="${py(0)}" stroke="var(--text)" stroke-width="2"/>
        ${st.connect && st.pts.length > 1 ? `<polyline fill="none" stroke="var(--text)" stroke-width="2.5" points="${st.pts.map(p => `${px(p.x)},${py(p.y)}`).join(' ')}"/>` : ''}
        ${st.pts.map(p => `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="8" fill="${esc(p.color)}" stroke="#fff" stroke-width="2"/>${st.labels ? `<text x="${px(p.x) + 11}" y="${py(p.y) - 8}" font-size="13" font-weight="700" fill="var(--text)">(${p.x},${p.y})</text>` : ''}`).join('')}</svg>
        ${st.ask ? '' : `<div class="mp-xytable"><p class="mp-barname">Data table</p><table class="mp-table"><thead><tr><th>x</th><th>y</th><th>Point</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${st.pts.map((p, i) => `<tr><td>${p.x}</td><td>${p.y}</td><td><b>(${p.x},${p.y})</b></td><td>${btn('mp-x', `data-act="unpt" data-i="${i}" aria-label="Remove point ${p.x} ${p.y}"`, '✕')}</td></tr>`).join('')}</tbody></table>${st.pts.length ? '' : '<p class="small muted">No points yet. Tap the grid.</p>'}</div>`}</div>`;
    },
    act: (st, d, e) => {
      if (d.act === 'unpt') { st.pts.splice(+d.i, 1); return true; }
      const svg = e.target.closest('svg.mp-grid'); if (!svg) return false;
      const r = svg.getBoundingClientRect(), lo = st.four ? -10 : 0, hi = st.four ? 10 : 12;
      st.pts.push({ x: Math.round(lo + ((e.clientX - r.left) / r.width) * (hi - lo)), y: Math.round(lo + (1 - (e.clientY - r.top) / r.height) * (hi - lo)), color: st.color });
      return true;
    },
    onSet: (st, key) => { if (key === 'four') st.pts = []; },
    boardTap: true,
  },

  geoboard: {
    init: () => ({ board: 'square', band: [], bands: [], color: '#E53935', fill: true }),
    total: st => { const all = [...st.bands, ...(st.band.length > 1 ? [{ pts: st.band }] : [])]; return `Bands ${all.length} · Area about ${all.reduce((s, b) => s + area(b.pts), 0).toFixed(1)} square units`; },
    palette: st => [...['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'].map(c => ({ label: 'Band color', color: c, pressed: st.color === c, run: s => { s.color = c; } })),
      { label: 'Close the band', color: '#212121', run: s => { if (s.band.length > 2) { s.bands.push({ pts: s.band, color: s.color }); s.band = []; } } },
      { label: 'Clear all', color: '#616161', run: s => { s.bands = []; s.band = []; } }],
    settings: st => `${sel('board', [['square', 'Square'], ['iso', 'Isometric'], ['circle', 'Circular']], st.board, 'Board')}${toggle('fill', st.fill, 'Fill on', 'Fill off')}`,
    hint: 'Tap pegs in order to stretch a band, then Close the band. Pegs next to each other are 1 unit apart.',
    note: 'Square, isometric and circular boards with colored bands and fills. Use the pen to mark angles.',
    board: (st, view) => {
      const S = 400, pegs = geoPegs(st.board), P = p => geoPx(st.board, p, S);
      const all = [...st.bands, ...(st.band.length > 1 ? [{ pts: st.band, color: st.color, open: true }] : [])];
      return `<div class="mp-pad"><svg class="mp-geo" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Geoboard, tap pegs to stretch a band">
        ${all.map(b => `<${b.open ? 'polyline' : 'polygon'} points="${b.pts.map(p => { const q = P(p); return `${q.X},${q.Y}`; }).join(' ')}" fill="${st.fill && !b.open ? esc(b.color) : 'none'}" fill-opacity=".35" stroke="${esc(b.color)}" stroke-width="5" stroke-linejoin="round"/>`).join('')}
        ${pegs.map((p, i) => { const q = P(p); return `<g><circle cx="${q.X}" cy="${q.Y}" r="17" fill="transparent" ${view.readOnly ? '' : `data-act="peg" data-i="${i}" role="button" aria-label="Peg ${i + 1}" class="mp-peg"`}/><circle cx="${q.X}" cy="${q.Y}" r="8.5" fill="#5D4037" stroke="#fff" stroke-width="2" pointer-events="none"/></g>`; }).join('')}</svg>
        <p class="small muted">Current band: ${st.band.length} pegs.</p></div>`;
    },
    act: (st, d) => { if (d.act !== 'peg') return false; const p = geoPegs(st.board)[+d.i]; if (p) st.band.push(p); return !!p; },
    onSet: (st, key) => { if (key === 'board') { st.bands = []; st.band = []; } },
  },

  clock: {
    init: () => OBJECTS.clock[0].init(),
    total: st => { const e = clockSector(st); return st.start ? `Elapsed ${e ? Math.floor(e.elapsed / 60) : 0}h ${e ? e.part : 0}m` : `Time ${hm(st)}`; },
    palette: st => [{ label: st.start ? 'Start again from here' : 'Start the tracker here', color: '#FFC91F', run: s => { s.start = { h: s.h, m: s.m }; } },
      { label: 'Time tracker +15 min', color: '#FFC91F', run: s => { if (!s.start) s.start = { h: s.h, m: s.m }; Object.assign(s, addMinutes(s, 15)); } },
      { label: 'Reset the tracker', color: '#616161', run: s => { s.start = null; } }],
    hint: 'Drag near the middle for the red hour hand and near the edge for the blue minute hand. Start the tracker, then move the time on: the yellow shows the minutes since the start, with a light ring for each full hour.',
    note: 'Add more clocks from the palette (each keeps its own time). The time tracker adds 15 minutes to the selected clock.',
    board: (st, view) => {
      const e = clockSector(st), oid = view.oid || '';
      if (st.q) return `<div class="mp-clockwrap q">${clockSvg(st, oid, true)}</div>`;   // a clock to read: its face only
      return `<div class="mp-clockwrap">${clockSvg(st, oid, view.readOnly)}<p class="mp-barname">${st.label ? `${esc(st.label)}${st.q ? '' : ' · '}` : ''}${st.q && !view.showKeys ? '&nbsp;' : hm(st)}</p>
        <p class="small mp-elapsed">${st.start && !(st.q && !view.showKeys) ? `Start ${hm(st.start)} · Elapsed <b>${e ? Math.floor(e.elapsed / 60) : 0} h ${e ? e.part : 0} min</b>` : '&nbsp;'}</p>
        ${view.readOnly ? '' : `<div class="row mp-chips">${btn('chip', 'data-act="hour" aria-label="One hour later"', 'Hour +')}${btn('chip', 'data-act="min5" aria-label="Five minutes later"', 'Min +5')}</div>`}</div>`;
    },
    act: (st, d) => {
      if (d.act === 'hour') Object.assign(st, addMinutes(st, 60));
      else if (d.act === 'min5') Object.assign(st, addMinutes(st, 5)); else return false;
      return true;
    },
    bind: (el, ctx) => bindClocks(el, ctx),
    ownTotal: true,
  },
};
const hm = c => `${((Math.round(+c.h || 0) + 11) % 12) + 1}:${String(Math.round(+c.m || 0)).padStart(2, '0')}`;
const pie = (cx, cy, r, a0, a1) => `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); }
function geoPegs(board) {
  const out = [];
  if (board === 'circle') { for (let i = 0; i < 12; i++) out.push({ x: 3 + 2.6 * Math.cos((i * Math.PI) / 6), y: 3 + 2.6 * Math.sin((i * Math.PI) / 6) }); out.push({ x: 3, y: 3 }); }
  else for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) out.push(board === 'iso' ? { x: c + (r % 2) * 0.5, y: r * 0.87 } : { x: c, y: r });
  return out;
}
function geoPx(board, p, S) { const span = board === 'circle' ? 6 : board === 'iso' ? 5.5 : 5, sy = board === 'iso' ? 4.35 : span; return { X: 36 + (p.x / span) * (S - 72), Y: 36 + (p.y / sy) * (S - 72) }; }
/** One clock face. The yellow is the tracked time only (manip-board.js clockSector): one minute-hand sector from the
 *  start's minute to the current minute, clockwise, and a light full ring for each full hour ("+1 h"); none at zero. */
function clockSvg(c, oid, readOnly) {
  const cx = 110, cy = 110, ha = (((+c.h % 12) + (+c.m) / 60) * Math.PI) / 6 - Math.PI / 2, ma = ((+c.m) / 60) * 2 * Math.PI - Math.PI / 2;
  const ticks = Array.from({ length: 60 }, (_, i) => { const a = (i * Math.PI) / 30, big = i % 5 === 0; return `<line x1="${cx + (big ? 86 : 92) * Math.cos(a)}" y1="${cy + (big ? 86 : 92) * Math.sin(a)}" x2="${cx + 97 * Math.cos(a)}" y2="${cy + 97 * Math.sin(a)}" stroke="${big ? '#E53935' : 'var(--muted)'}" stroke-width="${big ? 3 : 1.5}"/>`; }).join('');
  const nums = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6 - Math.PI / 2; return `<text x="${cx + 72 * Math.cos(a)}" y="${cy + 72 * Math.sin(a) + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${i || 12}</text>`; }).join('');
  const e = clockSector(c);
  const ring = e && e.turns ? `<circle class="mp-cring" cx="${cx}" cy="${cy}" r="80" fill="#FFC91F" fill-opacity=".16"/><text x="${cx}" y="${cy + 44}" text-anchor="middle" font-size="15" font-weight="800" fill="var(--text)">+${e.turns} h</text>` : '';
  const a0 = e ? (e.from * Math.PI) / 180 - Math.PI / 2 : 0, a1 = e ? a0 + (e.sweep * Math.PI) / 180 : 0;
  const wedge = e && e.part ? `<path class="mp-csector" d="${pie(cx, cy, 80, a0, a1)}" fill="#FFC91F" fill-opacity=".45"/>` : '';
  return `<svg class="mp-clock" ${readOnly ? '' : `data-clock="${esc(oid)}"`} width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="${c.q ? 'Clock: what time is it?' : `Clock showing ${hm(c)}`}${e ? `, ${e.elapsed} minutes since ${hm(c.start)}` : ''}">
    <circle cx="${cx}" cy="${cy}" r="100" fill="var(--card)" stroke="var(--text)" stroke-width="3"/>${ring}${wedge}
    ${ticks}${nums}<line x1="${cx}" y1="${cy}" x2="${cx + 56 * Math.cos(ha)}" y2="${cy + 56 * Math.sin(ha)}" stroke="#E53935" stroke-width="8" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${cx + 84 * Math.cos(ma)}" y2="${cy + 84 * Math.sin(ma)}" stroke="#1E88E5" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="7" fill="var(--text)"/></svg>`;
}
/** Dragging a clock's hands: near the middle moves the hour hand, near the edge the minute hand. ctx: { find(oid) the
 *  object, before() a snapshot for undo, done(snapshot) after the drag, live() while dragging (the total) }. */
function bindClocks(el, ctx) {
  for (const svg of el.querySelectorAll('svg[data-clock]')) {
    let hand = null, before = null;
    const at = e => { const r = svg.getBoundingClientRect(); const dx = ((e.clientX - r.left) / r.width) * 220 - 110, dy = ((e.clientY - r.top) / r.height) * 220 - 110; let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += 2 * Math.PI; return { a, dist: Math.hypot(dx, dy) }; };
    const set = e => {
      const o = ctx.find(svg.dataset.clock); if (!o) return;
      const { a } = at(e), c = o.st;
      if (hand === 'm') { const m = Math.round((a / (2 * Math.PI)) * 60) % 60; c.m = m; }
      else { const h = Math.round((a / (2 * Math.PI)) * 12) % 12; c.h = h || 12; }
      svg.innerHTML = clockSvg(c, o.id, false).replace(/^<svg[^>]*>|<\/svg>$/g, '');
      if (ctx.live) ctx.live();
    };
    svg.addEventListener('pointerdown', e => { if (ctx.blocked && ctx.blocked()) return; e.stopPropagation(); before = ctx.before(); hand = at(e).dist < 58 ? 'h' : 'm'; svg.setPointerCapture(e.pointerId); set(e); });
    svg.addEventListener('pointermove', e => { if (hand) set(e); });
    const up = () => { if (!hand) return; hand = null; ctx.done(before); };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }
}

// ================================================================ the board (shell)
// The board is a big plane (manip-board.js WORLD) seen through a window: drag empty space to pan, pinch or the zoom
// buttons to zoom, Fit to see everything. Objects (a clock, a geoboard, a place-value chart...) sit on it, each with
// its own state; pieces are free on it and snap together (or into an object's slots) when dropped close.
/** The board as one JSON object (format 2: objects, pieces, the tool's settings, notes, texts, pen marks, steps). */
const boardState = () => ({ ...V.st, v: 2, ...(V.steps && V.steps.length ? { __steps: V.steps } : {}), __ann: { notes: V.ann.notes, strokes: V.ann.strokes, texts: V.ann.texts.filter(x => x.text.trim()) } });
/** A board's state made whole: known objects only (each with its kind's defaults), pieces with their sizes, a piece
 *  tool's settings. Used here and by the room (public/js/manip-room.js). */
function normalize(slug, impl, st) {
  const out = { ...st, v: 2 };
  out.objects = (Array.isArray(st.objects) ? st.objects : []).filter(o => o && kindOf(slug, o.k)).slice(0, OBJ_MAX).map(o => {
    const K = kindOf(slug, o.k), base = K.init(), raw = o.st && typeof o.st === 'object' ? o.st : {};
    const s2 = o.k === slug && impl.load ? impl.load(raw) : { ...base, ...raw };
    for (const k of Object.keys(base)) if (Array.isArray(base[k]) && !Array.isArray(s2[k])) s2[k] = base[k];
    return { id: String(o.id || newId()), k: o.k, x: +o.x || 0, y: +o.y || 0, s: clamp(+o.s || 1, S_FLOOR, S_MAX), st: s2 };
  });
  if (objectTool(slug)) delete out.pieces;
  else {
    const base = impl.init(); for (const k of Object.keys(base)) if (!(k in out)) out[k] = base[k];
    const defs = allPieceDefs(slug);
    out.pieces = (Array.isArray(st.pieces) ? st.pieces : []).filter(p => p && typeof p === 'object').map(p => { const d = defs.find(x => x.kind === p.kind) || { w: 50, h: 50 }; return { ...p, id: String(p.id || newId()), w: +p.w || d.w, h: +p.h || d.h, x: +p.x || 0, y: +p.y || 0 }; });
  }
  return out;
}
function loadState(obj) {
  const o = migrate(V.tool.slug, parse(obj, {}) || {});
  const ann = o.__ann || {};
  V.ann = { notes: Array.isArray(ann.notes) ? ann.notes.slice(0, NOTE_MAX).map((n, i) => ({ id: String(n.id || `n${i}`), text: String(n.text || ''), x: +n.x || 0, y: +n.y || 0 })) : [],
    strokes: Array.isArray(ann.strokes) ? ann.strokes : [],
    texts: Array.isArray(ann.texts) ? ann.texts.slice(0, 30).map((n, i) => ({ id: String(n.id || `t${i}`), text: String(n.text || ''), x: +n.x || 0, y: +n.y || 0 })) : [] };
  V.steps = stepsOf(o);   // the exercise's steps travel with the board (saves, share codes, pushes)
  const rest = { ...o }; delete rest.__ann; delete rest.__steps;
  V.st = normalize(V.tool.slug, V.impl, rest);
  V.sel = null; V.osel = null; V.editing = null; V.hist = []; V.annHist = []; V.textEdit = null;
}
function pushHistory(snapshot) { V.hist.push(snapshot); if (V.hist.length > 40) V.hist.shift(); }
/** Every change to the tool's state: undo history, the board drawn again. */
function change(fn) {
  const before = JSON.stringify(V.st);
  const r = fn(V.st, V);
  if (r === false) return;
  pushHistory(before);
  renderBoard(); renderChrome();
}
function setStatus(msg, bad = false) { const el = document.getElementById('mp-status'); if (el) { el.textContent = msg; el.classList.toggle('bad', !!bad); } }

function openTool(slug, { restore = null } = {}) {
  clear();
  const tool = toolOf(slug); if (!tool) return home();
  V = { tool, impl: IMPL[slug], st: null, ann: { notes: [], strokes: [], texts: [] }, hist: [], annHist: [], sel: null, osel: null, annotate: false, annMode: 'pen', pen: PEN_COLORS[0], editing: null, draftOpen: false, tasksOpen: false, view: { x: 0, y: 0, z: 1 } };
  loadState(restore || newBoard(slug));
  ROOT.innerHTML = `<div class="mp-tool">
    <div class="mp-head"><a class="btn btn-sm" href="#">${esc(t('js.manip.nav.allTools'))}</a>
      <div class="mp-title"><h1>${tool.emoji} ${esc(tool.name)}</h1><p class="small muted">${esc(CATS[tool.cat])} · ${esc(t('js.manip.grades', { grades: tool.grades }))}</p></div>
      <div class="mp-total" id="mp-total" aria-live="polite"></div></div>
    <div class="mp-work">
      <aside class="mp-side" aria-label="${esc(t('js.manip.side.label'))}">
        <div id="mp-palette"></div>
        <p class="mp-cap mp-cap-tools">${esc(t('js.manip.side.tools'))}</p><div class="mp-toolsrow" id="mp-toolsrow"></div>
      </aside>
      <div class="mp-main">
        <div id="mp-annbar"></div><div id="mp-steps"></div><div id="mp-draft"></div>
        <div class="mp-board" id="mp-board" aria-label="${esc(t('js.manip.board.label', { tool: tool.name }))}">
          <div class="mp-world" id="mp-world" style="width:${WORLD.w}px;height:${WORLD.h}px">
            <div class="mp-content mp-abs" id="mp-content"></div>
            <svg class="mp-ink" id="mp-ink" viewBox="0 0 ${WORLD.w} ${WORLD.h}" aria-hidden="true"></svg>
            <div class="mp-texts" id="mp-texts"></div><div class="mp-notes" id="mp-notes"></div><div class="mp-ghost" id="mp-ghost" hidden></div>
          </div>
          <div id="mp-draw"></div>
          <div class="mp-zoom" id="mp-zoom" role="group" aria-label="${esc(t('js.manip.view.zoom'))}">${btn('chip', `data-view="out" aria-label="${esc(t('js.manip.view.out'))}"`, '−')}<span class="mp-pct">100%</span>${btn('chip', `data-view="in" aria-label="${esc(t('js.manip.view.in'))}"`, '+')}${btn('chip', 'data-view="fit"', `⤢ ${esc(t('js.manip.view.fit'))}`)}</div>
        </div>
        <div class="mp-settings" id="mp-settings"></div>
        <div class="mp-share" id="mp-share"></div>
        <section class="mp-tasks panel" id="mp-tasks" aria-label="${esc(t('js.manip.tasks.boxLabel'))}"></section>
        <p class="small muted mp-note">${esc(V.impl.note || '')}</p>
      </div>
    </div></div>`;
  bindBoard();
  renderChrome(); renderBoard(); renderShare(); renderTasksBox();
  fit();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- objects and the palette (shared with the room)
/** The object the palette and the settings work on: the selected one, else the last of the tool's own kind. */
function target(slug, st, osel) {
  const own = (st.objects || []).filter(o => o.k === slug);
  return own.find(o => o.id === osel) || own[own.length - 1] || null;
}
/**
 * What a palette offers, in three groups: 'add' (a new object of each kind, in the next free spot of ctx.region),
 * 'obj' (the tool's actions on the selected object: rows, a band color, the tracker...) and 'piece' (a new piece, Break,
 * Regroup). ctx: { osel, region, space, max, place(d) a new piece }. Each: { group, label, color, hot, pressed, run(st, v) }.
 */
function paletteFor(slug, impl, st, ctx) {
  const out = kindsOf(slug).map(K => ({ group: 'add', label: K.add, plus: true, run: (s, v) => {
    if ((s.objects || []).length >= ctx.max) { toast(t('js.manip.obj.full', { n: ctx.max })); return false; }
    const o = placeObject(slug, s, K.k, ctx.region, ctx.space); if (!o) return false;
    s.objects.push(o); v.fresh = o.id;   // not selected: its buttons open only when it is tapped
  } }));
  if (objectTool(slug)) {
    const o = target(slug, st, ctx.osel);
    if (o && !o.st.q) for (const p of impl.palette(o.st)) out.push({ group: 'obj', label: p.label, color: p.color, pressed: p.pressed, run: s => { const x = (s.objects || []).find(q => q.id === o.id); return x ? p.run(x.st) : false; } });
  } else {
    for (const d of impl.defs(st)) { const nm = paletteName(slug, d); out.push({ group: 'piece', label: nm.aria, face: nm.face, text: nm.text, mini: d, color: d.color, run: (s, v) => { const p = ctx.place(d); s.pieces.push(p); v.fresh = p.id; } }); }
    if (BREAKS[slug]) out.push({ group: 'piece', label: 'Break ×10', hot: true, run: (s, v) => breakPiece(s, v, slug) }, { group: 'piece', label: 'Regroup 10 → 1', run: (s, v) => regroup(s, v, slug) });
  }
  return out;
}
/**
 * Dragging a piece or a new object from the palette onto the board (solo and room). Mouse: a move of a few pixels
 * starts it. Touch: a press held a moment, or a drag toward the board (across the tray), starts it; a sideways swipe
 * still scrolls the phone's tray. A ghost follows the pointer; ctx.drop(x, y, item) puts it where it is released (false:
 * not a place for it: nothing changes). The click that ends a drag adds nothing more.
 * ctx: { item(i), zoom(), drop(clientX, clientY, item) -> boolean }
 */
function bindTrayDrag(host, ctx) {
  let d = null, ghost = null;
  const end = () => { if (d && d.timer) clearTimeout(d.timer); if (ghost) ghost.remove(); ghost = null; d = null; };
  const start = () => {
    d.on = true; host.dataset.dragged = '1';
    const z = ctx.zoom(), it = d.item, w = it.mini ? it.mini.w * z : 120, h = it.mini ? it.mini.h * z : 70;
    ghost = document.createElement('div'); ghost.className = `mp-trayghost${it.mini ? '' : ' obj'}`; ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { width: `${w}px`, height: `${h}px`, ...(it.mini ? { background: it.color } : {}) });
    if (it.mini && SHAPES[it.mini.kind]) ghost.style.clipPath = SHAPES[it.mini.kind]; else if (it.mini && ROUND.has(it.mini.kind) && !/^b\d/.test(it.mini.kind)) ghost.style.borderRadius = '50%';
    ghost.textContent = it.mini ? it.face || '' : it.label.replace(/^Add (a |an )?/, '');
    d.w = w; d.h = h; document.body.appendChild(ghost); place(d.x, d.y);
    try { d.b.setPointerCapture(d.id); } catch { /* gone */ }
  };
  const place = (x, y) => { if (ghost) { ghost.style.left = `${x - d.w / 2}px`; ghost.style.top = `${y - d.h / 2}px`; } };
  host.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-pal]'); if (!b || e.button > 0) return;
    const item = ctx.item(+b.dataset.pal); if (!item || !(item.mini || item.plus)) return;
    end();
    d = { b, item, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', on: false, column: getComputedStyle(b.parentElement).flexDirection === 'column' };
    if (d.touch) d.timer = setTimeout(() => { if (d && !d.on) start(); }, 260);
  });
  host.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.on) {
      if (!d.touch) { if (Math.abs(dx) + Math.abs(dy) > 6) start(); }
      else {
        // Across the tray (toward the board) starts a drag; along it scrolls the tray (a phone's row, a tablet's column).
        const along = d.column ? Math.abs(dy) : Math.abs(dx), across = d.column ? Math.abs(dx) : Math.abs(dy);
        if (across > 10 && across > along) start(); else if (along > 10) { end(); return; }
      }
    }
    if (d && d.on) { e.preventDefault(); place(e.clientX, e.clientY); }
  });
  host.addEventListener('pointerup', e => {
    if (!d || e.pointerId !== d.id) return;
    const x = d; if (ghost) ghost.style.display = 'none';
    if (x.on) ctx.drop(e.clientX, e.clientY, x.item);
    end();
    if (x.on) setTimeout(() => { delete host.dataset.dragged; }, 0);
  });
  host.addEventListener('pointercancel', () => { if (d && d.on) delete host.dataset.dragged; end(); });
}
/** One palette button (solo and room): a mini piece with its value inside for pieces, a + for new objects, a color
 *  swatch for an object's actions. aria: its accessible name. */
function palButton(p, i, aria) {
  const mini = p.mini ? `<span class="mp-sw mp-swv" style="background:${esc(p.color)};${SHAPES[p.mini.kind] ? `clip-path:${SHAPES[p.mini.kind]};border-radius:0;` : ROUND.has(p.mini.kind) && !/^b\d/.test(p.mini.kind) ? 'border-radius:50%;' : ''}">${esc(p.face || '')}</span>` : '';
  const lead = p.plus ? '<span class="mp-plus" aria-hidden="true">+</span>' : mini || (p.color ? `<span class="mp-sw" style="background:${esc(p.color)}"></span>` : '');
  const text = p.mini ? p.text : p.label;
  return btn(`mp-pal${p.hot ? ' hot' : ''}${p.plus ? ' add' : ''}${p.mini ? ' piece' : ''}`, `data-pal="${i}"${p.pressed ? ' aria-pressed="true"' : ''} aria-label="${esc(aria)}"`, `${lead}${text ? `<span>${esc(text)}</span>` : ''}`);
}
/** A piece tool's own mats: the place-value chart's columns, a frame's cells, a plain work mat. */
function matHtml(o, view = {}) {
  if (o.k === 'answer') return answerHtml(o, view);
  if (o.k === 'frac-eq') return fracEqHtml(o, view);
  if (o.k === 'pv-chart') return `<div class="mp-pvchart">${(o.st.cols || []).map(c => `<div>${esc(c)}</div>`).join('')}</div>`;
  if (o.k === 'ten-frame' || o.k === 'five-frame') return `<div class="mp-frame">${'<div></div>'.repeat(o.k === 'five-frame' ? 5 : 10)}</div>`;
  if (o.k === 'double-ten-frame') return `<div class="mp-frame2"><div class="mp-frame">${'<div></div>'.repeat(10)}</div><div class="mp-frame">${'<div></div>'.repeat(10)}</div></div>`;
  if (o.k === 'ppw') return `<div class="mp-ppw"><div>${esc(t('js.manip.obj.whole'))}</div><div>${esc(t('js.manip.obj.part'))}</div><div>${esc(t('js.manip.obj.part'))}</div></div>`;
  return '<div class="mp-matin"></div>';
}
/** An answer box: "?" to type into (the student's own answer: private like their text). */
const answerHtml = (o, view) => `<div class="mp-ansbox"><input class="mp-answer" data-oid="${esc(o.id)}" maxlength="40" placeholder="?" autocomplete="off" enterkeyhint="done" value="${esc(o.st.ans || '')}" aria-label="${esc(t('js.manip.obj.answer'))}"${view.readOnly ? ' readonly tabindex="-1"' : ''}></div>`;
/** A fraction equation: the question, its operands as tiles (or circles), an empty bar to build the answer on, and an
 *  answer box. */
function fracEqHtml(o, view) {
  const st = o.st, a = parseFrac(st.a), b = parseFrac(st.b), col = d => (FRACTION_DENS.find(([x]) => x === d) || [0, '#90A4AE'])[1];
  const bar = (f, empty = false) => {
    if (!f) return '';
    const rows = []; for (let i = 0; i < Math.max(1, Math.ceil(f.n / f.d)); i++) rows.push(Array.from({ length: Math.min(f.d, f.n - i * f.d) }, () => `<span class="mp-eqtile" style="width:${EQ_BAR / f.d}px;${empty ? '' : `background:${col(f.d)}`}">${f.d > 1 ? `1/${f.d}` : '1'}</span>`).join(''));
    return rows.map(r => `<div class="mp-eqrow">${r}</div>`).join('');
  };
  const circle = f => { if (!f) return ''; const parts = Array.from({ length: Math.min(f.n, f.d * 2) }, (_, i) => i); const whole = Math.ceil(f.n / f.d);
    return Array.from({ length: whole }, (_, w) => `<svg width="110" height="110" viewBox="0 0 110 110"><circle cx="55" cy="55" r="50" fill="none" stroke="var(--line)"/>${parts.filter(i => Math.floor(i / f.d) === w).map(i => (f.d === 1 ? `<circle cx="55" cy="55" r="48" fill="${col(1)}"/>` : `<path d="${pie(55, 55, 48, ((i % f.d) * 2 * Math.PI) / f.d - Math.PI / 2, (((i % f.d) + 1) * 2 * Math.PI) / f.d - Math.PI / 2)}" fill="${col(f.d)}" stroke="#fff" stroke-width="2"/>`)).join('')}</svg>`).join(''); };
  const sym = { '+': '+', '-': '−', x: '×', '/': '÷', '=': '=', compare: '○' }[st.op] || '';
  const bWhole = b && b.d === 1 && (st.op === 'x' || st.op === '/');
  const bSide = st.op === '=' ? bar({ n: +st.b, d: +st.b }, true) : bWhole ? `<b class="mp-eqnum">${esc(st.b)}</b>` : st.shape === 'circles' ? circle(b) : bar(b);
  const body = st.shape === 'circles' ? `<div class="mp-eqcirc">${circle(a)}<b class="mp-eqsym">${sym}</b>${st.op === '=' || bWhole ? `<div>${bSide}</div>` : circle(b)}</div>`
    : `<div class="mp-eqbars"><div class="mp-eqline"><span class="mp-eqsym"></span><div>${bar(a)}</div></div><div class="mp-eqline"><span class="mp-eqsym">${sym}</span><div>${bSide}</div></div>
      ${st.op === 'compare' || st.op === '=' ? '' : `<div class="mp-eqline"><span class="mp-eqsym">=</span><div class="mp-eqbuild" style="width:${EQ_BAR}px">${esc(t('js.manip.obj.buildHere'))}</div></div>`}</div>`;
  return `<div class="mp-eq"><p class="mp-eqtext">${esc(st.text || '')}</p>${body}<div class="mp-ansbox">${esc(t('js.manip.obj.answerIs'))} <input class="mp-answer" data-oid="${esc(o.id)}" maxlength="20" placeholder="?" autocomplete="off" value="${esc(st.ans || '')}" aria-label="${esc(t('js.manip.obj.answer'))}"${view.readOnly ? ' readonly tabindex="-1"' : ''}></div></div>`;
}
/** An object on the board: its handle bar (drag it, or the object's empty parts, to move it), its own board, and when
 *  selected: Duplicate, Delete and a corner to resize it (always in proportion). */
/** An object's own total (each clock its time, each frame or chart the pieces on it), never on a practice question. */
function objTotal(slug, impl, o, st) {
  if (!o.st || o.st.q || o.k === 'answer' || o.k === 'frac-eq') return '';
  if (o.k === slug) return impl.ownTotal ? '' : impl.total(o.st);   // a clock shows its time and elapsed time itself
  if (!UNDER.has(o.k) || !Array.isArray(st.pieces)) return '';
  const r = objRect(slug, o), on = st.pieces.filter(p => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
  return on.length ? impl.total({ ...st, pieces: on }) : '';
}
function objHtml(slug, impl, o, view, st = {}) {
  const K = kindOf(slug, o.k); if (!K) return '';
  const z = K.size(o.st), s = +o.s || 1, on = !view.readOnly && view.osel === o.id;
  // A practice question is read-only (a clock to read is not a clock to set): its own controls are off for everyone.
  const inner = o.k === slug ? impl.board(o.st, { ...view, oid: o.id, readOnly: view.readOnly || !!o.st.q }) : matHtml(o, view);
  const name = o.k === 'mat' && o.st.label ? o.st.label : `${K.name}${o.st && o.st.label ? ` · ${o.st.label}` : ''}`;
  const key = view.showKeys && o.st && o.st.key ? `<span class="mp-key">✓ ${esc(o.st.key)}</span>` : '';
  const tot = view.totals ? objTotal(slug, impl, o, st) : '';
  const bar = on ? `<div class="mp-obar" role="toolbar" aria-label="${esc(t('js.manip.obj.actions', { name }))}">${btn('mp-pbtn', `data-oact="copy" data-oid="${esc(o.id)}"`, esc(t('js.manip.obj.copy')))}${btn('mp-pbtn bad', `data-oact="delete" data-oid="${esc(o.id)}"`, esc(t('js.manip.obj.delete')))}</div>
    <span class="mp-oresize" data-oresize="${esc(o.id)}" role="img" aria-label="${esc(t('js.manip.obj.resize'))}"></span>` : '';
  return `<div class="mp-obj${on ? ' on' : ''}${UNDER.has(o.k) ? ' mp-mat' : ''}${view.fresh === o.id ? ' fresh' : ''} k-${esc(o.k)}" data-oid="${esc(o.id)}" style="left:${+o.x}px;top:${+o.y}px;width:${Math.round(z.w * s)}px;height:${Math.round(z.h * s)}px">
    <div class="mp-objin" style="width:${z.w}px;height:${z.h}px;transform:scale(${s})"><div class="mp-ohead" aria-label="${esc(t('js.manip.obj.move', { name }))}"><span class="mp-oname">⠿ ${esc(name)}</span>${tot ? `<span class="mp-otot">${esc(tot)}</span>` : ''}${key}</div><div class="mp-obody">${inner}</div></div>${bar}</div>`;
}
/** Everything on a board: objects (mats under the rest), then pieces. view: { sel, osel, readOnly }. */
function boardHtml(slug, impl, st, view) {
  const objs = [...(st.objects || [])].sort((a, b) => (UNDER.has(a.k) ? 0 : 1) - (UNDER.has(b.k) ? 0 : 1));
  return objs.map(o => objHtml(slug, impl, o, view, st)).join('') + (st.pieces || []).map(p => pieceHtml(p, view)).join('');
}

// ---------------------------------------------------------------- drawing the tool view
function renderChrome() {
  renderTotal();
  const slug = V.tool.slug, items = paletteFor(slug, V.impl, V.st, { osel: V.osel, region: viewRegion(), space: WORLD, max: OBJ_MAX, place: d => placePiece(V.st, d) });
  const o = target(slug, V.st, V.osel), K = o && kindOf(slug, o.k);
  const group = (g, cap) => { const l = items.map((p, i) => ({ p, i })).filter(x => x.p.group === g); return l.length ? `${cap ? `<p class="mp-cap">${esc(cap)}</p>` : ''}<div class="mp-palette">${l.map(({ p, i }) => palButton(p, i, p.plus ? p.label : t('js.manip.side.add', { label: p.label }))).join('')}</div>` : ''; };
  document.getElementById('mp-palette').innerHTML = group('add', t('js.manip.side.addCap')) + group('obj', K ? t('js.manip.side.forObj', { name: `${K.name}${o.st.label ? ` · ${o.st.label}` : ''}` }) : '') + group('piece', t('js.manip.side.objects'));
  document.getElementById('mp-toolsrow').innerHTML = [
    btn('mp-tbtn', `data-tool="undo"${V.hist.length ? '' : ' disabled'}`, `↩ ${esc(t('js.manip.side.undo'))}`),
    btn(`mp-tbtn${V.annotate ? ' on' : ''}`, `data-tool="annotate" aria-pressed="${V.annotate}"`, `✎ ${esc(t('js.manip.side.annotate'))}`),
    btn('mp-tbtn', `data-tool="note"${V.ann.notes.length >= NOTE_MAX ? ' disabled' : ''}`, `🗒️ ${esc(t('js.manip.side.note'))}`),
    btn(`mp-tbtn${V.textMode ? ' on' : ''}`, `data-tool="text" aria-pressed="${!!V.textMode}"`, `<b class="mp-tglyph">T</b> ${esc(t('js.manip.side.text'))}`),
    HOST ? btn(`mp-tbtn${V.stepsOpen ? ' on' : ''}`, 'data-tool="steps"', `📋 ${esc(t('js.manip.steps.title'))}${V.steps && V.steps.length ? ` (${V.steps.length})` : ''}`) : '',
    HOST ? btn(`mp-tbtn${V.draftOpen ? ' on' : ''}`, 'data-tool="draft"', `✨ ${esc(t('js.manip.side.draft'))}`) : '',
    HOST && V.st.objects.some(o => o.st && o.st.key) ? btn(`mp-tbtn${V.showKeys ? ' on' : ''}`, `data-tool="keys" aria-pressed="${!!V.showKeys}"`, `✓ ${esc(t('js.manip.side.showAnswers'))}`) : '',
    btn('mp-tbtn', 'data-tool="reset"', esc(t('js.manip.side.reset'))),
  ].join('');
  const set = document.getElementById('mp-settings');
  const settings = objectTool(slug) ? (o && !o.st.q && V.impl.settings ? V.impl.settings(o.st) : '') : V.impl.settings ? V.impl.settings(V.st) : '';
  set.innerHTML = `${settings}${btn('chip', `data-view="totals" aria-pressed="${V.totals !== false}"`, esc(V.totals !== false ? t('js.manip.view.totalsOn') : t('js.manip.view.totalsOff')))}<p class="small muted mp-hint">${esc(V.impl.hint || '')}${V.impl.pieces ? ` ${esc(t('js.manip.board.pieceHint'))}` : ''}</p>`;
  renderAnnBar(); renderDraft(); renderSteps();
}
function renderTotal() {
  const el = document.getElementById('mp-total'); if (!el) return;
  const slug = V.tool.slug;
  // A board-wide total only where it means something: a piece tool with its pieces loose (money: with one mat at most).
  // Objects show their own totals.
  const mats = V.st.objects.filter(x => UNDER.has(x.k)).length;
  const practice = V.st.objects.some(x => x.st && (x.st.q || x.st.key));   // a practice board: no total gives an answer away
  el.textContent = !practice && !objectTool(slug) && (mats === 0 || (slug === 'money' && mats <= 1)) ? V.impl.total(V.st) : '';
  el.hidden = !el.textContent;
}
/** The clocks' (and any tool's) own pointer work, on the solo board. */
const bindCtx = () => ({ find: id => V.st.objects.find(o => o.id === id), before: () => JSON.stringify(V.st), live: renderTotal, blocked: () => V.annotate || V.textMode,
  done: before => { pushHistory(before); renderBoard(); renderChrome(); } });
function renderBoard() {
  const board = document.getElementById('mp-board'); if (!board) return;
  board.classList.toggle('texting', !!V.textMode);
  const content = document.getElementById('mp-content');
  const slug = V.tool.slug;
  content.innerHTML = boardHtml(slug, V.impl, V.st, { sel: V.sel, osel: V.osel, readOnly: false, snapped: V.snapped, showKeys: V.showKeys, totals: V.totals !== false, fresh: V.fresh });
  V.fresh = null;
  // The hint only on a truly empty board, in the middle of the window (never on top of anything).
  const empty = !V.st.objects.length && !(V.st.pieces || []).length && !V.ann.notes.length && !V.ann.texts.length && !V.ann.strokes.length;
  let hint = board.querySelector('.mp-boardhint');
  if (empty && !hint) { hint = document.createElement('p'); hint.className = 'mp-boardhint'; hint.textContent = t('js.manip.board.emptyPieces'); board.appendChild(hint); }
  if (!empty && hint) hint.remove();
  if (V.impl.bind) V.impl.bind(content, bindCtx());
  renderInk(); renderTexts(); renderNotes();
  const draw = document.getElementById('mp-draw');
  draw.innerHTML = V.annotate ? `<div class="mp-drawlayer" role="application" aria-label="${esc(t('js.manip.ann.surface'))}"></div>` : '';
  if (V.annotate) bindDraw(draw.firstChild);
  applyView();
}
/** A piece's or object's buttons stay inside the visible board: under it when there is no room above, moved left near
 *  the right edge, moved right near the left edge (frame: the visible box; z: the zoom). Solo and room. */
function keepBarsInside(root, frame, z) {
  for (const bar of root.querySelectorAll('.mp-pbar, .mp-obar')) {
    bar.style.translate = ''; bar.classList.remove('below');
    let r = bar.getBoundingClientRect();
    if (r.top < frame.top + 4) { bar.classList.add('below'); r = bar.getBoundingClientRect(); if (r.bottom > frame.bottom - 4) { bar.classList.remove('below'); r = bar.getBoundingClientRect(); } }
    let dx = 0, dy = 0;
    if (r.right > frame.right - 6) dx = frame.right - 6 - r.right;
    if (r.left + dx < frame.left + 6) dx = frame.left + 6 - r.left;
    if (r.top < frame.top + 4) dy = frame.top + 4 - r.top;
    if (dx || dy) bar.style.translate = `${dx / z}px ${dy / z}px`;
  }
}
/** Pen marks in plane pixels. A mark is drawn once it has two different points: a single point (the moment the pen
 *  touches down) drew, in some browsers, a "dot" as wide as the whole board in the pen's color (a zero-length line
 *  with round caps under a stretched 0..1 viewBox), which is the flash seen on pointerdown. */
const inkLine = (s, W, H) => { const pts = (s.pts || []).map(p => `${Math.round(+p.x * W * 10) / 10},${Math.round(+p.y * H * 10) / 10}`); return new Set(pts).size < 2 ? '' : `<polyline fill="none" stroke="${esc(s.c)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}"/>`; };
function renderInk() { document.getElementById('mp-ink').innerHTML = V.ann.strokes.map(s => inkLine(s, WORLD.w, WORLD.h)).join(''); }

// ---------------------------------------------------------------- the view: pan, zoom, fit
const Z_MIN = 0.15, Z_MAX = 2.5;
function vpSize() { const b = document.getElementById('mp-board'); return b ? { w: b.clientWidth || 800, h: b.clientHeight || 480 } : { w: 800, h: 480 }; }
function toWorld(cx, cy) { const r = document.getElementById('mp-board').getBoundingClientRect(); return { x: (cx - r.left - V.view.x) / V.view.z, y: (cy - r.top - V.view.y) / V.view.z }; }
/** The part of the plane on screen (a plane rectangle, inside the plane). */
function viewRegion() {
  if (!V || !V.view) return { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
  const s = vpSize(), v = V.view, x = clamp(-v.x / v.z, 0, WORLD.w - 200), y = clamp(-v.y / v.z, 0, WORLD.h - 200);
  return { x, y, w: Math.max(200, Math.min(s.w / v.z, WORLD.w - x)), h: Math.max(200, Math.min(s.h / v.z, WORLD.h - y)) };
}
function applyView() {
  const w = document.getElementById('mp-world'); if (!w || !V) return;
  w.style.transform = `translate(${V.view.x}px,${V.view.y}px) scale(${V.view.z})`; w.style.setProperty('--iz', String(Math.min(2.5, 1 / V.view.z)));
  const b = document.getElementById('mp-board'); b.style.backgroundPosition = `${V.view.x}px ${V.view.y}px`; b.style.backgroundSize = `${24 * V.view.z}px ${24 * V.view.z}px`;
  const p = document.querySelector('#mp-zoom .mp-pct'); if (p) p.textContent = `${Math.round(V.view.z * 100)}%`;
  keepBarsInside(w, b.getBoundingClientRect(), V.view.z);
}
function zoomAt(f, sx, sy) { const z = clamp(V.view.z * f, Z_MIN, Z_MAX), k = z / V.view.z; V.view = { x: sx - (sx - V.view.x) * k, y: sy - (sy - V.view.y) * k, z }; applyView(); }
/** Everything on the board in view (never bigger than life): the objects, pieces, notes, texts and marks. */
function fit() {
  const s = vpSize(), st = boardState();
  const marks = V.ann.strokes.flatMap(x => (x.pts || []).map(p => ({ x: p.x * WORLD.w, y: p.y * WORLD.h, w: 1, h: 1 })));
  const box = bbox([...boxesOf(V.tool.slug, st, WORLD), ...marks]) || { x: WORLD.w / 2 - 300, y: WORLD.h / 2 - 200, w: 600, h: 400 };
  const pad = 28, z = clamp(Math.min((s.w - pad * 2) / box.w, (s.h - pad * 2) / box.h), Z_MIN, 1);
  V.view = { z, x: (s.w - box.w * z) / 2 - box.x * z, y: (s.h - box.h * z) / 2 - box.y * z };
  applyView();
}

// ---------------------------------------------------------------- pieces in free spots, notes
/** A new piece from the palette: right after the last one added (manip-board.js nextPieceSpot), in the part of the
 *  board on screen; never on another piece or object. */
function placePiece(st, d) {
  const at = nextPieceSpot(V.tool.slug, st, d, viewRegion(), V.lastAdd), p = mkPiece(d, at.x, at.y);
  V.lastAdd = { id: p.id, runX: at.runX };
  return p;
}
function noteHtml(n, i, readOnly) {
  if (!readOnly && V.editing === n.id) {
    return `<div class="mp-sticky editing" data-note="${esc(n.id)}" style="left:${n.x * 100}%;top:${n.y * 100}%"><label class="sr-only" for="nt-${esc(n.id)}">${esc(t('js.manip.note.text', { n: i + 1 }))}</label>
      <textarea id="nt-${esc(n.id)}" class="mp-notetext" rows="3" maxlength="300" placeholder="${esc(t('js.manip.note.placeholder'))}">${esc(n.text)}</textarea>
      <div class="row">${btn('mp-nbtn', `data-nact="done" data-id="${esc(n.id)}"`, esc(t('js.manip.note.done')))}${btn('mp-nbtn bad', `data-nact="delete" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.deleteN', { n: i + 1 }))}"`, esc(t('js.manip.note.delete')))}</div></div>`;
  }
  return `<div class="mp-sticky" data-note="${esc(n.id)}" role="group" aria-label="${esc(t('js.manip.note.label', { n: i + 1 }))}" style="left:${n.x * 100}%;top:${n.y * 100}%"><p>${n.text ? esc(n.text) : `<span class="mp-ph">${esc(t('js.manip.note.tap'))}</span>`}</p>
    ${readOnly ? '' : `<div class="row">${btn('mp-nbtn', `data-nact="edit" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.editN', { n: i + 1 }))}"`, `✎ ${esc(t('js.manip.note.edit'))}`)}${btn('mp-nbtn bad', `data-nact="delete" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.deleteN', { n: i + 1 }))}"`, esc(t('js.manip.note.delete')))}</div>`}</div>`;
}
function renderNotes() {
  const box = document.getElementById('mp-notes');
  box.innerHTML = V.ann.notes.map((n, i) => noteHtml(n, i, false)).join('');
  const ta = box.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true });
}
/** A clear spot for a new note, in the part of the board on screen. -> { x, y } as fractions of the plane */
function noteSpot() {
  const at = spotIn(boxesOf(V.tool.slug, boardState(), WORLD), NOTE_W, NOTE_H, viewRegion());
  return { x: at.x / WORLD.w, y: at.y / WORLD.h };
}
// ---------------------------------------------------------------- text typed straight on the board (T)
/** Before a text change: the texts as they were, for Undo. */
function textHist() { pushHistory({ texts: JSON.stringify(V.ann.texts) }); }
function renderTexts() {
  const box = document.getElementById('mp-texts'); if (!box) return;
  box.innerHTML = V.ann.texts.map(x => textHtml(x, V.textEdit === x.id)).join('');
  const inp = box.querySelector('input'); if (inp) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
/** One text: the words in the theme's ink, or, while it is being written, a field in the same place with its ×. */
function textHtml(x, editing, readOnly = false) {
  const pos = `left:${(+x.x || 0) * 100}%;top:${(+x.y || 0) * 100}%`;
  if (editing && !readOnly) return `<div class="mp-text editing" data-text="${esc(x.id)}" style="${pos}"><label class="sr-only" for="tx-${esc(x.id)}">${esc(t('js.manip.text.label'))}</label><input id="tx-${esc(x.id)}" class="mp-textin" maxlength="200" value="${esc(x.text)}" placeholder="${esc(t('js.manip.text.ph'))}" autocomplete="off" enterkeyhint="done">${btn('mp-textx', `data-tx="${esc(x.id)}" aria-label="${esc(t('js.manip.text.delete'))}"`, '×')}</div>`;
  return `<div class="mp-text${readOnly ? ' ro' : ''}" data-text="${esc(x.id)}" style="${pos}">${esc(x.text)}</div>`;
}
function placeText(e) {
  if (V.textEdit) { commitText(); return; }
  textHist();
  const p = toWorld(e.clientX, e.clientY);
  const x = { id: `t${newId()}`, text: '', x: clamp(p.x / WORLD.w, 0, 0.98), y: clamp((p.y - 12) / WORLD.h, 0, 0.98) };
  V.ann.texts.push(x); V.textEdit = x.id; renderTexts();
}
function commitText() {
  const inp = document.querySelector('#mp-texts input'); const x = V.ann.texts.find(n => n.id === V.textEdit);
  if (x && inp) x.text = inp.value.slice(0, 200);
  V.ann.texts = V.ann.texts.filter(n => n.text.trim());
  V.textEdit = null; renderTexts();
}
/** Texts move with mouse or finger; a tap opens one to edit. */
function bindTexts() {
  const box = document.getElementById('mp-texts');
  let d = null;
  box.addEventListener('pointerdown', e => {
    const el = e.target.closest('.mp-text'); if (!el || el.classList.contains('editing')) return;
    const x = V.ann.texts.find(n => n.id === el.dataset.text); if (!x) return;
    d = { el, x, sx: e.clientX, sy: e.clientY, x0: x.x, y0: x.y, moved: false };
    el.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  });
  box.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 6) return;
    if (!d.moved) textHist();
    d.moved = true;
    d.x.x = clamp(d.x0 + (e.clientX - d.sx) / V.view.z / WORLD.w, 0, 0.99); d.x.y = clamp(d.y0 + (e.clientY - d.sy) / V.view.z / WORLD.h, 0, 0.99);
    d.el.style.left = `${d.x.x * 100}%`; d.el.style.top = `${d.x.y * 100}%`;
  });
  const up = () => { if (!d) return; const x = d; d = null; if (!x.moved) { if (V.textEdit) commitText(); V.textEdit = x.x.id; renderTexts(); } };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', () => { d = null; });
  box.addEventListener('keydown', e => { if (e.target.matches('.mp-textin') && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); commitText(); } });
  box.addEventListener('focusout', e => { if (e.target.matches('.mp-textin')) setTimeout(() => { if (V && V.textEdit && !box.contains(document.activeElement)) commitText(); }, 0); });
  box.addEventListener('input', e => { if (e.target.matches('.mp-textin')) { const x = V.ann.texts.find(n => n.id === V.textEdit); if (x) x.text = e.target.value.slice(0, 200); } });
}
function renderAnnBar() {
  const el = document.getElementById('mp-annbar');
  el.innerHTML = V.annotate ? `<div class="mp-annbar" role="toolbar" aria-label="${esc(t('js.manip.ann.toolbar'))}">
    ${btn(`chip${V.annMode === 'pen' ? ' on' : ''}`, 'data-ann="pen"', `✎ ${esc(t('js.manip.ann.pen'))}`)}
    ${PEN_COLORS.map(c => btn(`mp-pen${V.pen === c && V.annMode === 'pen' ? ' on' : ''}`, `data-ann="color" data-c="${c}" style="background:${c}" aria-label="${esc(t('js.manip.ann.color', { color: c }))}"`, '')).join('')}
    ${btn(`chip${V.annMode === 'erase' ? ' on' : ''}`, 'data-ann="erase"', `⌫ ${esc(t('js.manip.ann.eraser'))}`)}
    ${btn('chip', `data-ann="undo"${V.annHist.length ? '' : ' disabled'}`, `↩ ${esc(t('js.manip.side.undo'))}`)}
    ${btn('chip', 'data-ann="clear"', esc(t('js.manip.ann.clear')))}
    ${btn('btn btn-primary btn-sm', 'data-ann="done"', esc(t('js.manip.ann.done')))}
    <span class="small muted">${esc(V.annMode === 'pen' ? t('js.manip.ann.penHint') : t('js.manip.ann.eraseHint'))}</span></div>` : '';
}
function bindDraw(layer) {
  let mode = null;
  const pt = e => { const p = toWorld(e.clientX, e.clientY); return { x: clamp(p.x / WORLD.w, 0, 1), y: clamp(p.y / WORLD.h, 0, 1) }; };
  const erase = p => { const r = 16 / V.view.z; V.ann.strokes = V.ann.strokes.filter(s => !s.pts.some(q => Math.hypot((q.x - p.x) * WORLD.w, (q.y - p.y) * WORLD.h) < r)); };
  layer.addEventListener('pointerdown', e => {
    e.preventDefault();
    layer.setPointerCapture(e.pointerId); V.annHist.push(JSON.stringify(V.ann.strokes)); if (V.annHist.length > 40) V.annHist.shift();
    mode = V.annMode; const p = pt(e);
    if (mode === 'pen') V.ann.strokes.push({ c: V.pen, pts: [p] }); else erase(p);
    renderInk();
  });
  layer.addEventListener('pointermove', e => {
    if (!mode) return; const p = pt(e);
    if (mode === 'pen') { const s = V.ann.strokes[V.ann.strokes.length - 1]; if (s && s.pts.length < 600) s.pts.push(p); } else erase(p);
    renderInk();
  });
  const up = () => { if (!mode) return; mode = null; V.ann.strokes = V.ann.strokes.filter(s => s.pts.length > 1); renderInk(); renderAnnBar(); };
  layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
}

/** Everything a tap, a drag or typing does on the tool view (one set of listeners, bound once). */
function bindBoard() {
  const root = ROOT.querySelector('.mp-tool');
  root.addEventListener('click', e => {
    if (V.justMoved) { V.justMoved = false; if (e.target.closest('#mp-board')) return; }
    const vw = e.target.closest('[data-view]');
    if (vw && vw.dataset.view === 'totals') { V.totals = V.totals === false; renderBoard(); renderChrome(); return; }
    if (vw) { const s = vpSize(); if (vw.dataset.view === 'fit') fit(); else zoomAt(vw.dataset.view === 'in' ? 1.25 : 0.8, s.w / 2, s.h / 2); return; }
    if (V.textMode && e.target.closest('#mp-board') && !e.target.closest('.mp-text, .mp-sticky, .mp-pbar, .mp-obar, .mp-zoom, button, input, select, textarea')) { placeText(e); return; }
    const tx = e.target.closest('[data-tx]');
    if (tx) { textHist(); V.ann.texts = V.ann.texts.filter(x => x.id !== tx.dataset.tx); V.textEdit = null; renderTexts(); return; }
    const pal = e.target.closest('[data-pal]');
    if (pal && pal.closest('[data-dragged]')) return;   // the end of a drag from the palette, not a tap
    if (pal) {
      const items = paletteFor(V.tool.slug, V.impl, V.st, { osel: V.osel, region: viewRegion(), space: WORLD, max: OBJ_MAX, place: d => placePiece(V.st, d) });
      const p = items[+pal.dataset.pal]; if (!p) return;
      const n = V.st.objects.length; change((st, v) => p.run(st, v));
      if (V.st.objects.length > n) { const r = objRect(V.tool.slug, V.st.objects[V.st.objects.length - 1]), vr = viewRegion(); if (r.x < vr.x || r.y < vr.y || r.x + r.w > vr.x + vr.w || r.y + r.h > vr.y + vr.h) fit(); }
      return;
    }
    const oa = e.target.closest('[data-oact]');
    if (oa) return objButton(oa.dataset.oact, oa.dataset.oid);
    const tl = e.target.closest('[data-tool]');
    if (tl) return toolButton(tl.dataset.tool);
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const k = tg.dataset.toggle; return change(st => { const s2 = settingsTarget(st); s2[k] = !s2[k]; }); }
    const an = e.target.closest('[data-ann]');
    if (an) return annButton(an.dataset.ann, an.dataset.c);
    const nb = e.target.closest('[data-nact]');
    if (nb) return noteButton(nb.dataset.nact, nb.dataset.id);
    const pa = e.target.closest('[data-pact]');
    if (pa) return pieceButton(pa.dataset.pact, pa.dataset.pid);
    const objEl = e.target.closest('#mp-content .mp-obj');
    const act = e.target.closest('#mp-content [data-act]');
    if (act && objEl) { change((st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; return V.impl.act(o.st, act.dataset, e); }); return; }
    if (V.impl.boardTap && objEl && e.target.closest('svg.mp-nl, svg.mp-grid')) { change((st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; return V.impl.act(o.st, {}, e); }); return; }
  });
  root.addEventListener('change', e => {
    const s = e.target.closest('[data-set]'); if (!s) return;
    const k = s.dataset.set, v = s.value;
    change(st => {
      const s2 = settingsTarget(st); if (!s2) return false;
      s2[k] = typeof s2[k] === 'boolean' ? !!v : typeof s2[k] === 'number' ? (Number.isFinite(+v) ? +v : s2[k]) : v;
      if (V.impl.onSet) V.impl.onSet(s2, k);
    });
  });
  root.addEventListener('input', e => {
    if (e.target.classList.contains('mp-seglabel') && V.impl.input) {
      const objEl = e.target.closest('.mp-obj'), o = objEl && V.st.objects.find(x => x.id === objEl.dataset.oid); if (!o) return;
      if (!V.typing) { pushHistory(JSON.stringify(V.st)); V.typing = true; }
      V.impl.input(o.st, e.target); return;
    }
    if (e.target.classList.contains('mp-answer')) {
      const o = V.st.objects.find(x => x.id === e.target.dataset.oid); if (!o) return;
      if (!V.typing) { pushHistory(JSON.stringify(V.st)); V.typing = true; }
      o.st.ans = e.target.value.slice(0, 40); return;
    }
    if (e.target.classList.contains('mp-notetext')) { const n = V.ann.notes.find(x => x.id === V.editing); if (n) { n.text = e.target.value.slice(0, 300); } }
  });
  root.addEventListener('focusout', e => { if (e.target.classList.contains('mp-seglabel') || e.target.classList.contains('mp-answer')) V.typing = false; });
  bindPlane(); bindNoteDrag(); bindTexts();
  bindTrayDrag(root.querySelector('.mp-side'), { item: i => soloItems()[i], zoom: () => V.view.z, drop: soloDrop });
}
const soloItems = () => paletteFor(V.tool.slug, V.impl, V.st, { osel: V.osel, region: viewRegion(), space: WORLD, max: OBJ_MAX, place: d => placePiece(V.st, d) });
/** A piece or object dropped from the palette at a screen point: there, snapped like a dragged piece. Off the board: nothing. */
function soloDrop(cx, cy, item) {
  const r = document.getElementById('mp-board').getBoundingClientRect();
  if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
  const p = toWorld(cx, cy), slug = V.tool.slug;
  change((st, v) => dropAt(slug, st, v, item, p, WORLD, OBJ_MAX, SNAP_PX / V.view.z));
  return true;
}
/** Put a palette item at a point of a space (solo: the board; room: a square), snapped. Shared with the room. */
function dropAt(slug, st, v, item, p, space, max, snapT) {
  if (item.mini) {
    const d = item.mini, q = mkPiece(d, Math.round(clamp(p.x - d.w / 2, 0, space.w - d.w)), Math.round(clamp(p.y - d.h / 2, 0, space.h - d.h)));
    const s = snapFor([q], st.pieces, (st.objects || []).flatMap(o => slotsOf(slug, o)), snapT);
    if (s && q.x + s.dx >= 0 && q.y + s.dy >= 0 && q.x + q.w + s.dx <= space.w && q.y + q.h + s.dy <= space.h) { q.x = Math.round(q.x + s.dx); q.y = Math.round(q.y + s.dy); }
    st.pieces.push(q);
    if (s && s.to) joinGroup(st.pieces, q, st.pieces.find(x => x.id === s.to));
    v.fresh = q.id; v.lastAdd = { id: q.id, runX: q.x }; return true;
  }
  if (item.plus) {
    if ((st.objects || []).length >= max) { toast(t('js.manip.obj.full', { n: max })); return false; }
    const k = kindsOf(slug).find(K => K.add === item.label); if (!k) return false;
    const z = k.size(k.init()), sc = Math.max(S_MIN, Math.min(1, (space.w - 8) / z.w, (space.h - 8) / z.h));
    const o = { id: newId(), k: k.k, x: Math.round(clamp(p.x - (z.w * sc) / 2, 0, space.w - z.w * sc)), y: Math.round(clamp(p.y - 15 * sc, 0, space.h - z.h * sc)), s: sc, st: k.init() };
    st.objects.push(o); v.fresh = o.id; return true;
  }
  return false;
}
/** What a setting changes: the selected object (object tools), else the board (a piece tool's settings). */
const settingsTarget = st => (objectTool(V.tool.slug) ? (target(V.tool.slug, st, V.osel) || {}).st : st);
function toolButton(k) {
  if (k === 'undo') {
    const prev = V.hist.pop(); if (!prev) return;
    if (typeof prev === 'object') V.ann.texts = JSON.parse(prev.texts); else { V.st = JSON.parse(prev); V.sel = null; }
    V.textEdit = null; renderBoard(); renderChrome(); return;
  }
  if (k === 'text') { V.textMode = !V.textMode; if (V.textMode) { V.annotate = false; } renderChrome(); renderBoard(); return; }
  if (k === 'annotate') { V.annotate = !V.annotate; V.annMode = 'pen'; renderChrome(); renderBoard(); return; }
  if (k === 'note') {
    if (V.ann.notes.length >= NOTE_MAX) return;
    const n = { id: `note-${newId()}`, text: '', ...noteSpot() }; V.ann.notes.push(n); V.editing = n.id; renderNotes(); renderChrome(); return;
  }
  if (k === 'steps') { V.stepsOpen = !V.stepsOpen; renderChrome(); return; }
  if (k === 'keys') { V.showKeys = !V.showKeys; renderChrome(); renderBoard(); return; }
  if (k === 'draft') { V.draftOpen = !V.draftOpen; renderChrome(); if (V.draftOpen) document.getElementById('mp-brief')?.focus(); return; }
  if (k === 'reset') { change(st => { const settings = {}; for (const key of ['decimal', 'mode', 'unit']) if (key in st) settings[key] = st[key]; const fresh = normalize(V.tool.slug, V.impl, newBoard(V.tool.slug, WORLD, settings)); for (const key of Object.keys(st)) delete st[key]; Object.assign(st, fresh); V.sel = null; V.osel = null; }); fit(); }
}
function annButton(k, c) {
  if (k === 'pen') V.annMode = 'pen';
  else if (k === 'color') { V.pen = c; V.annMode = 'pen'; }
  else if (k === 'erase') V.annMode = 'erase';
  else if (k === 'undo') { const prev = V.annHist.pop(); if (prev) { V.ann.strokes = JSON.parse(prev); renderInk(); } }
  else if (k === 'clear') { V.annHist.push(JSON.stringify(V.ann.strokes)); V.ann.strokes = []; renderInk(); }
  else if (k === 'done') { V.annotate = false; renderChrome(); renderBoard(); return; }
  renderAnnBar();
}
function noteButton(k, id) {
  if (k === 'edit') V.editing = id;
  else if (k === 'done') V.editing = null;
  else if (k === 'delete') { V.ann.notes = V.ann.notes.filter(n => n.id !== id); if (V.editing === id) V.editing = null; renderChrome(); }
  renderNotes();
}
/** A piece's toolbar (shared with the room: st, the piece's id, the selection holder v, a free spot for copies). */
function pieceAction(st, k, id, v, place) {
  const p = st.pieces.find(x => x.id === id); if (!p) return false;
  if (k === 'copy') { const c = place ? place(p) : { x: p.x + 24, y: p.y + 24 }; const q = { ...p, id: newId(), x: c.x, y: c.y, locked: false }; delete q.g; st.pieces.push(q); v.fresh = q.id; v.sel = null; }
  else if (k === 'flip') p.flipped = !p.flipped;
  else if (k === 'rotate') { p.rot = ((p.rot || 0) + 30) % 360; separate(st, p); }
  else if (k === 'fill') p.filled = !p.filled;
  else if (k === 'lock') p.locked = !p.locked;
  else if (k === 'separate') separate(st, p);
  else if (k === 'delete') { st.pieces = st.pieces.filter(x => x.id !== id); separate(st, p); v.sel = null; }
  return true;
}
/** A piece leaves its snapped group (a group of one is no group). */
function separate(st, p) {
  const g = p.g; if (!g) return; delete p.g;
  const left = st.pieces.filter(x => x.g === g); if (left.length < 2) for (const x of left) delete x.g;
}
function pieceButton(k, id) { change((st, v) => pieceAction(st, k, id, v, p => spotIn(boxesOf(V.tool.slug, { ...st, __ann: V.ann }, WORLD), p.w, p.h, viewRegion()))); }
/** An object's toolbar: Duplicate (in the next free spot nearby) or Delete. Shared with the room. */
function objectAction(slug, st, k, id, v, region, space, max) {
  const o = (st.objects || []).find(x => x.id === id); if (!o) return false;
  if (k === 'delete') { st.objects = st.objects.filter(x => x.id !== id); v.osel = null; return true; }
  if (k === 'copy') {
    if (st.objects.length >= max) { toast(t('js.manip.obj.full', { n: max })); return false; }
    const r = objRect(slug, o), at = spotIn(boxesOf(slug, st, space), r.w, r.h, region);
    const c = { ...JSON.parse(JSON.stringify(o)), id: newId(), x: clamp(at.x, 0, space.w - r.w), y: clamp(at.y, 0, space.h - r.h) };
    st.objects.push(c); v.fresh = c.id; return true;
  }
  return false;
}
function objButton(k, id) { change((st, v) => objectAction(V.tool.slug, st, k, id, v, viewRegion(), WORLD, OBJ_MAX)); }

/** The plane's pointer work: pan (empty space), pinch, moving and resizing objects, dragging pieces (with their
 *  snapped group, a snap preview, and the snap on release). */
function bindPlane() {
  const board = document.getElementById('mp-board'), pointers = new Map();
  let g = null;
  const ghost = () => document.getElementById('mp-ghost');
  board.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      if (g && g.kind !== 'pan') { cancel(); }
      const [a, b] = [...pointers.values()]; g = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return;
    }
    if (e.target.closest('.mp-zoom, .mp-drawlayer, .mp-sticky, .mp-text, .mp-pbar, .mp-obar, button, input, select, textarea, a')) return;
    if (V.textMode) return;
    const rz = e.target.closest('[data-oresize]');
    if (rz) { const o = V.st.objects.find(x => x.id === rz.dataset.oresize); if (o) { const z = objSize(V.tool.slug, o); g = { kind: 'resize', o, nat: z, s0: o.s, sx: e.clientX, sy: e.clientY, before: JSON.stringify(V.st), el: rz.closest('.mp-obj') }; board.setPointerCapture(e.pointerId); e.preventDefault(); } return; }
    const pieceEl = e.target.closest('.mp-piece');
    if (pieceEl) {
      const p = V.st.pieces.find(x => x.id === pieceEl.dataset.pid); if (!p) return;
      const members = p.locked ? [p] : groupOf(V.st.pieces, p);
      g = { kind: 'piece', p, members: members.map(m => ({ m, x0: m.x, y0: m.y, el: board.querySelector(`.mp-piece[data-pid="${CSS.escape(m.id)}"]`) })), sx: e.clientX, sy: e.clientY, moved: false, before: JSON.stringify(V.st) };
      board.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    const objEl = e.target.closest('.mp-obj');
    if (objEl) {
      if (e.target.closest('[data-act], svg.mp-nl, svg.mp-grid, svg[data-clock], .mp-peg, .mp-seglabel, .mp-bead, .mp-cell, .mp-answer')) return;   // the object's own work
      const o = V.st.objects.find(x => x.id === objEl.dataset.oid); if (!o) return;
      g = { kind: 'obj', o, el: objEl, x0: o.x, y0: o.y, sx: e.clientX, sy: e.clientY, moved: false, before: JSON.stringify(V.st) };
      board.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    g = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: V.view.x, y0: V.view.y, moved: false };
    board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = board.getBoundingClientRect();
      V.view.x += cx - g.cx; V.view.y += cy - g.cy; zoomAt(d / (g.d || d), cx - r.left, cy - r.top); Object.assign(g, { d, cx, cy }); return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    g.moved = true;
    const z = V.view.z;
    if (g.kind === 'pan') { V.view.x = g.x0 + dx; V.view.y = g.y0 + dy; applyView(); return; }
    if (g.kind === 'obj') {
      const r = objRect(V.tool.slug, g.o);
      g.o.x = Math.round(clamp(g.x0 + dx / z, 0, WORLD.w - r.w)); g.o.y = Math.round(clamp(g.y0 + dy / z, 0, WORLD.h - r.h));
      g.el.style.left = `${g.o.x}px`; g.el.style.top = `${g.o.y}px`; return;
    }
    if (g.kind === 'resize') {
      g.o.s = Math.round(clamp((g.nat.w * g.s0 + dx / z) / g.nat.w, S_MIN, Math.min(S_MAX, (WORLD.w - g.o.x) / g.nat.w, (WORLD.h - g.o.y) / g.nat.h)) * 1000) / 1000;
      g.el.style.width = `${Math.round(g.nat.w * g.o.s)}px`; g.el.style.height = `${Math.round(g.nat.h * g.o.s)}px`; g.el.querySelector('.mp-objin').style.transform = `scale(${g.o.s})`; return;
    }
    if (g.kind === 'piece' && !g.p.locked) {
      const box = bbox(g.members.map(x => ({ x: x.x0, y: x.y0, w: x.m.w, h: x.m.h })));
      const ddx = clamp(dx / z, -box.x, WORLD.w - box.x - box.w), ddy = clamp(dy / z, -box.y, WORLD.h - box.y - box.h);
      for (const x of g.members) { x.m.x = Math.round(x.x0 + ddx); x.m.y = Math.round(x.y0 + ddy); if (x.el) { x.el.style.left = `${x.m.x}px`; x.el.style.top = `${x.m.y}px`; x.el.classList.add('dragging'); } }
      g.snap = snapNow(g);
      const gh = ghost();
      if (g.snap) { const b = pieceBox(g.p); gh.hidden = false; Object.assign(gh.style, { left: `${b.x + g.snap.dx}px`, top: `${b.y + g.snap.dy}px`, width: `${b.w}px`, height: `${b.h}px` }); } else gh.hidden = true;
    }
  });
  const snapNow = gg => { const ids = new Set(gg.members.map(x => x.m.id)); return snapFor([gg.p, ...gg.members.map(x => x.m).filter(m => m !== gg.p)], V.st.pieces.filter(q => !ids.has(q.id)), V.st.objects.flatMap(o => slotsOf(V.tool.slug, o)), SNAP_PX / V.view.z); };
  const cancel = () => { if (g && g.before && g.moved) { V.st = JSON.parse(g.before); renderBoard(); } g = null; ghost().hidden = true; };
  const up = e => {
    pointers.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') { if (pointers.size < 2) g = null; return; }
    const x = g; g = null; ghost().hidden = true;
    if (x.moved) V.justMoved = true;
    if (x.kind === 'pan') { if (!x.moved && (V.sel || V.osel) && !V.textMode) { V.sel = null; V.osel = null; renderBoard(); renderChrome(); } return; }
    if (x.kind === 'resize') { if (x.o.s !== x.s0) { pushHistory(x.before); renderBoard(); renderChrome(); } return; }
    if (x.kind === 'obj') {
      // A tap selects (its buttons open); a drag only moves it.
      if (x.moved) pushHistory(x.before); else { V.osel = x.o.id; V.sel = null; }
      renderBoard(); renderChrome(); return;
    }
    if (x.kind === 'piece') {
      if (x.moved && !x.p.locked) {
        const s = snapNow(x);
        if (s) {
          const box = bbox(x.members.map(q => ({ x: q.m.x, y: q.m.y, w: q.m.w, h: q.m.h })));
          const fits = box.x + s.dx >= 0 && box.y + s.dy >= 0 && box.x + box.w + s.dx <= WORLD.w && box.y + box.h + s.dy <= WORLD.h;
          if (fits) {
            for (const q of x.members) { q.m.x = Math.round(q.m.x + s.dx); q.m.y = Math.round(q.m.y + s.dy); }
            if (s.to) joinGroup(V.st.pieces, x.p, V.st.pieces.find(q => q.id === s.to));
            V.snapped = new Set(x.members.map(q => q.m.id));
          }
        }
        pushHistory(x.before);
      }
      if (!x.moved) { V.sel = x.p.id; V.osel = null; } else if (V.sel && V.sel !== x.p.id) V.sel = null;
      renderBoard(); renderChrome(); V.snapped = null;
    }
  };
  board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
  board.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = board.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
}
/** Two pieces snapped together: their groups become one. */
function joinGroup(pieces, a, b) {
  if (!a || !b) return;
  const g = b.g || a.g || `g${newId()}`, old = new Set([a.g, b.g].filter(Boolean));
  for (const p of pieces) if (p === a || p === b || (p.g && old.has(p.g))) p.g = g;
}
/** Sticky notes move with mouse or finger (places kept as fractions of the plane); a tap opens the note to type in. */
function bindNoteDrag() {
  const box = document.getElementById('mp-notes');
  let d = null;
  box.addEventListener('pointerdown', e => {
    if (e.target.closest('textarea, button')) return;
    const el = e.target.closest('.mp-sticky'); if (!el) return;
    const n = V.ann.notes.find(x => x.id === el.dataset.note); if (!n) return;
    d = { el, n, x0: n.x, y0: n.y, sx: e.clientX, sy: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  });
  box.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 7) return;
    d.moved = true;
    d.n.x = clamp(d.x0 + (e.clientX - d.sx) / V.view.z / WORLD.w, 0, 1 - d.el.offsetWidth / WORLD.w);
    d.n.y = clamp(d.y0 + (e.clientY - d.sy) / V.view.z / WORLD.h, 0, 1 - d.el.offsetHeight / WORLD.h);
    d.el.style.left = `${d.n.x * 100}%`; d.el.style.top = `${d.n.y * 100}%`;
  });
  const up = () => { if (!d) return; const x = d; d = null; if (!x.moved && !x.el.classList.contains('editing')) { V.editing = x.n.id; renderNotes(); } };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', () => { d = null; });
}

// ---------------------------------------------------------------- saving, share codes, the AI drafter, tasks
function renderShare() {
  const el = document.getElementById('mp-share');
  const mine = HOST ? STATE.boards.filter(b => b.tool === V.tool.slug) : [];
  el.innerHTML = `<div class="row">
    ${HOST ? `${btn('btn btn-primary', 'id="mp-save"', esc(t('js.manip.share.save')))}<span class="mp-code" id="mp-code" aria-live="polite"></span>` : ''}
    <form class="row mp-redeem" id="mp-redeem"><label for="mp-redeem-in" class="small"><b>${esc(t('js.manip.share.open'))}</b></label>
      <input id="mp-redeem-in" class="input input-sm mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}">
      <button class="btn btn-sm" type="submit">${esc(t('js.manip.share.go'))}</button></form>
    <span class="small" id="mp-status" role="status"></span></div>
    ${HOST ? STATE.sessions.filter(x => x.status === 'active' && x.tool === V.tool.slug).map(x => `<p class="small"><a href="#live/${esc(x.id)}">📡 ${esc(t('js.manip.share.backToSession', { title: x.title }))}</a></p>`).join('') : ''}
    ${mine.length ? `<div class="row mp-chips" aria-label="${esc(t('js.manip.share.saved'))}">${mine.slice(0, 12).map(b => btn('chip', `data-load="${esc(b.id)}" aria-label="${esc(t('js.manip.share.loadSaved', { code: b.code }))}"`, `${esc(b.code)} · ${esc(new Date(b.created_at).toLocaleDateString())}`)).join('')}</div>` : ''}`;
  const save = document.getElementById('mp-save');
  if (save) save.onclick = async () => {
    save.disabled = true;
    try {
      const r = await api('/api/manipulatives/boards', { method: 'POST', body: { tool: V.tool.slug, title: V.title || V.tool.name, state: boardState() } });
      document.getElementById('mp-code').textContent = r.board.code;
      setStatus(t('js.manip.share.saved1', { code: r.board.code }));
      STATE.boards.unshift({ id: r.board.id, code: r.board.code, tool: V.tool.slug, title: V.tool.name, created_at: Date.now() });
    } catch (e) { setStatus(e.message, true); } finally { save.disabled = false; }
  };
  document.getElementById('mp-redeem').onsubmit = async e => { e.preventDefault(); await redeem(document.getElementById('mp-redeem-in').value); };
  for (const b of el.querySelectorAll('[data-load]')) b.onclick = async () => {
    try { const r = await api(`/api/manipulatives/boards/${encodeURIComponent(b.dataset.load)}`); restoreInto(r.board.state); setStatus(t('js.manip.share.loaded', { code: r.board.code })); }
    catch (err) { setStatus(err.message, true); }
  };
}
/** Put a board into the open tool (a share code, a saved board, a push): the tool's undo keeps what was there. */
function restoreInto(state) {
  const before = JSON.stringify(V.st);
  loadState(state); pushHistory(before);
  renderChrome(); renderBoard();
}
let pendingRestore = null;
async function redeem(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { setStatus(t('js.manip.share.needCode'), true); return; }
  try {
    const r = await api(`/api/manipulatives/code/${encodeURIComponent(code)}`);
    if (V && r.board.tool === V.tool.slug) { restoreInto(r.board.state); setStatus(t('js.manip.share.loaded', { code: r.board.code })); return; }
    pendingRestore = r.board.state; location.hash = r.board.tool;
  } catch (e) { if (V) setStatus(e.message, true); else toast(e.message, { bad: true }); }
}
/** The exercise's steps (a host's): built here, saved with the board, stepped through in a live session. */
function renderSteps() {
  const el = document.getElementById('mp-steps'); if (!el) return;
  if (!HOST || !V.stepsOpen) { el.innerHTML = ''; return; }
  if (el.firstChild && el.contains(document.activeElement)) return;   // typing in it: the editor keeps its own place
  el.innerHTML = `<section class="panel mp-drafter" aria-label="${esc(t('js.manip.steps.title'))}"><div class="row"><h2>📋 ${esc(t('js.manip.steps.title'))}</h2>${btn('btn btn-sm btn-ghost', 'data-tool="steps"', `✕ ${esc(t('js.manip.draft.close'))}`)}</div>
    <p class="small muted">${esc(t('js.manip.steps.text'))}</p><div id="mp-stepsed"></div></section>`;
  ROOM.stepsEditor(document.getElementById('mp-stepsed'), V.steps || [], list => { V.steps = list.filter(x => x.text.trim()); });
}
function renderDraft() {
  const el = document.getElementById('mp-draft');
  if (!HOST || !V.draftOpen) { el.innerHTML = ''; return; }
  const tasks = TASKS[V.tool.slug] || [];
  el.innerHTML = `<section class="panel mp-drafter" aria-label="${esc(t('js.manip.draft.title'))}"><div class="row"><h2>✨ ${esc(t('js.manip.draft.title'))}</h2>${btn('btn btn-sm btn-ghost', 'data-tool="draft"', `✕ ${esc(t('js.manip.draft.close'))}`)}</div>
    <p class="small muted">${esc(t('js.manip.draft.text'))}</p>
    <div class="mp-draftrow"><label class="mp-set grow"><span>${esc(t('js.manip.draft.task'))}</span><select class="input input-sm" id="mp-dtask"><option value="">${esc(t('js.manip.draft.ownLesson'))}</option>${tasks.map(x => `<option value="${esc(`${x.title}: ${x.prompt}`)}" data-grade="${esc(x.grade)}">${esc(x.title)} · ${esc(t('js.manip.grade', { grade: x.grade }))}</option>`).join('')}</select></label>
      <label class="mp-set"><span>${esc(t('js.manip.draft.grade'))}</span><select class="input input-sm" id="mp-dgrade"><option value="">${esc(t('js.manip.draft.any'))}</option>${['K', '1', '2', '3', '4', '5', '6', '7', '8'].map(g => `<option value="${g}">${esc(t('js.manip.grade', { grade: g }))}</option>`).join('')}</select></label></div>
    <label class="mp-set mp-block"><span>${esc(t('js.manip.draft.brief'))}</span><textarea class="input" id="mp-brief" rows="3" maxlength="1000" placeholder="${esc(t('js.manip.draft.briefPh'))}"></textarea></label>
    <p class="small muted">${esc(t('js.manip.draft.private'))}</p>
    <div class="row">${btn('btn btn-primary', 'id="mp-dgo"', `✨ ${esc(t('js.manip.draft.go'))}`)}<span class="small muted">${esc(t('js.manip.draft.hint'))}</span></div>
    <p class="small" id="mp-dmsg" role="status"></p></section>`;
  const task = document.getElementById('mp-dtask'), brief = document.getElementById('mp-brief');
  task.onchange = () => { if (task.value) { brief.value = task.value; document.getElementById('mp-dgrade').value = task.selectedOptions[0].dataset.grade || ''; } };
  document.getElementById('mp-dgo').onclick = async ev => {
    const b = ev.currentTarget, msg = document.getElementById('mp-dmsg');
    if (brief.value.trim().length < 3) { msg.textContent = t('js.manip.draft.needBrief'); return; }
    b.disabled = true; msg.textContent = t('js.manip.draft.working');
    try {
      const r = await api('/api/manipulatives/draft', { method: 'POST', body: { tool: V.tool.slug, brief: brief.value, grade: document.getElementById('mp-dgrade').value, task: task.value } });
      applyDraft(r.draft);
      const m = `${t('js.manip.draft.doneSet', { title: r.draft.title, n: r.draft.n, steps: r.draft.steps.length })}${r.draft.capped ? ` ${t('js.manip.draft.capped', { max: 12 })}` : ''}`;
      document.getElementById('mp-dmsg').textContent = r.ai ? m : `${m} ${t('js.manip.draft.noAi')}`; setStatus(m);
    } catch (e) { msg.textContent = e.message; } finally { b.disabled = false; }
  };
}
/** A drafted board becomes an ordinary board: the server built it (public/js/manip-practice.js: the objects and pieces
 *  in a tidy grid, a title, answer boxes with the teacher's answers); its steps become the exercise's deck. */
function applyDraft(d) {
  const steps = (d.steps || []).map((text, i) => ({ id: `s${newId()}${i}`, text }));
  V.title = d.title;
  restoreInto({ ...d.board, __steps: steps });
  V.stepsOpen = true; V.draftOpen = false; renderChrome(); fit();
}
function renderTasksBox() {
  const el = document.getElementById('mp-tasks'), tasks = TASKS[V.tool.slug] || [];
  if (!tasks.length) { el.hidden = true; return; }
  const shown = V.tasksOpen ? tasks : tasks.slice(0, 1);
  el.innerHTML = `<h2>${esc(t('js.manip.tasks.boxTitle'))}</h2>${shown.map(x => `<div class="mp-task"><p><b>${esc(x.title)}</b> <span class="mp-tag">${esc(x.ccss)}</span> <span class="mp-tag">${esc(t('js.manip.grade', { grade: x.grade }))}</span></p><p class="small">${esc(x.prompt)}</p>${HOST ? `<p class="small muted"><b>${esc(t('js.manip.tasks.teacherNote'))}</b> ${esc(x.notes)}</p>` : ''}</div>`).join('')}
    <div class="row">${btn('btn btn-sm', 'id="mp-tasksmore"', esc(V.tasksOpen ? t('js.manip.tasks.less') : t('js.manip.tasks.all', { n: tasks.length })))}${HOST ? `<a class="small" href="#tasks">${esc(t('js.manip.tasks.library'))}</a>` : ''}</div>`;
  document.getElementById('mp-tasksmore').onclick = () => { V.tasksOpen = !V.tasksOpen; renderTasksBox(); };
}

// ---------------------------------------------------------------- a live session: the shared room (public/js/manip-room.js)
async function liveRoom(id, joinFirst) {
  clear(); V = null;
  try {
    if (joinFirst) { await api('/api/manipulatives/live/join', { method: 'POST', body: { id } }); history.replaceState(null, '', `#live/${id}`); }
    await ROOM.open(ROOT, id, { palButton, bindTrayDrag, dropAt, IMPL, mkPiece, breakPiece, regroup, newId, boards: STATE.boards, normalize, boardHtml, paletteFor, pieceAction, objectAction, joinGroup, target, inkLine, keepBarsInside });
  } catch (e) { ROOT.innerHTML = `<div class="empty"><h1>${esc(e.status === 409 ? t('js.manip.live.ended') : t('js.manip.live.gone'))}</h1><p><a href="#">${esc(t('js.manip.nav.back'))}</a></p></div>`; }
}

// ================================================================ home, tasks
function home() {
  clear(); V = null;
  if (!HOST) return studentHome();
  ROOT.innerHTML = `<div class="pagehead"><h1>🧮 ${esc(t('js.manip.home.title'))}</h1><span class="mp-tag">${esc(t('js.manip.home.testing'))}</span></div>
    <p class="mp-lead">${esc(t('js.manip.home.lead', { n: Object.values(TASKS).reduce((s, l) => s + l.length, 0) }))}</p>
    <div class="mp-homegrid">
      <section class="panel"><h2>📡 ${esc(t('js.manip.host.title'))}</h2>
        ${STATE.classes.length ? `<form id="mp-host" class="mp-form"><label class="mp-set mp-block"><span>${esc(t('js.manip.host.klass'))}</span><select class="input" name="classId" required>${STATE.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.school)}</option>`).join('')}</select></label>
          <label class="mp-set mp-block"><span>${esc(t('js.manip.host.tool'))}</span><select class="input" name="tool">${TOOLS.map(x => `<option value="${x.slug}">${esc(x.name)}</option>`).join('')}</select></label>
          <label class="mp-set mp-block"><span>${esc(t('js.manip.host.name'))}</span><input class="input" name="title" maxlength="80" placeholder="${esc(t('js.manip.host.namePh'))}"></label>
          ${STATE.boards.length ? `<label class="mp-set mp-block"><span>${esc(t('js.manip.host.board'))}</span><select class="input" name="boardId"><option value="">${esc(t('js.manip.host.noBoard'))}</option>${STATE.boards.map(b => { const x = toolOf(b.tool); return `<option value="${esc(b.id)}">${esc(b.code)} · ${esc(x ? x.name : b.tool)} · ${esc(b.title)}</option>`; }).join('')}</select></label>` : ''}
          <button class="btn btn-primary btn-block" type="submit">${esc(t('js.manip.host.start'))}</button></form><p class="small muted">${esc(t('js.manip.host.who'))}</p>`
    : `<p class="small muted">${esc(t('js.manip.host.noClasses'))}</p>`}
        ${STATE.sessions.length ? `<h3>${esc(t('js.manip.host.mine'))}</h3><ul class="plain mp-list">${STATE.sessions.slice(0, 8).map(s => `<li><a href="#live/${esc(s.id)}">${esc(s.title)}</a> <span class="small muted">${esc(s.class_name)} · ${esc(s.status === 'active' ? t('js.manip.dash.live') : t('js.manip.dash.ended'))} · ${esc(t('js.manip.dash.joined', { n: s.joined }))}</span></li>`).join('')}</ul>` : ''}
        </section>
      <section class="panel"><h2>🎟️ ${esc(t('js.manip.share.haveCode'))}</h2><p class="small muted">${esc(t('js.manip.share.haveCodeText'))}</p>
        <form class="row mp-redeem" id="mp-homeredeem"><label class="sr-only" for="mp-home-code">${esc(t('js.manip.share.codeLabel'))}</label><input id="mp-home-code" class="input mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}"><button class="btn btn-primary" type="submit">${esc(t('js.manip.share.go'))}</button></form>
        <p><a class="btn btn-block" href="#tasks">📚 ${esc(t('js.manip.tasks.library'))}</a></p></section>
    </div>
    <div class="mp-filter"><label class="sr-only" for="mp-q">${esc(t('js.manip.home.search'))}</label><input id="mp-q" class="input" type="search" placeholder="${esc(t('js.manip.home.search'))}">
      <label class="sr-only" for="mp-cat">${esc(t('js.manip.home.cat'))}</label><select id="mp-cat" class="input"><option value="">${esc(t('js.manip.home.allCats'))}</option>${CATS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('')}</select></div>
    <div id="mp-catalog"></div>
    <section class="panel mp-boards"><h2>${esc(t('js.manip.boards.title'))}</h2><div id="mp-boardlist"></div></section>`;
  const host = document.getElementById('mp-host');
  if (host) host.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(host);
    try { const r = await api('/api/manipulatives/live', { method: 'POST', body: { classId: f.get('classId'), tool: f.get('tool'), title: f.get('title'), boardId: f.get('boardId') || null } }); await loadState2(); location.hash = `live/${r.session.id}`; }
    catch (err) { toast(err.message, { bad: true }); }
  };
  document.getElementById('mp-homeredeem').onsubmit = e => { e.preventDefault(); redeem(document.getElementById('mp-home-code').value); };
  const q = document.getElementById('mp-q'), cat = document.getElementById('mp-cat');
  const drawCat = () => {
    const needle = q.value.trim().toLowerCase();
    const list = TOOLS.filter(x => (cat.value === '' || String(x.cat) === cat.value) && (!needle || `${x.name} ${x.desc} ${CATS[x.cat]}`.toLowerCase().includes(needle)));
    document.getElementById('mp-catalog').innerHTML = CATS.map((c, i) => { const l = list.filter(x => x.cat === i); return l.length ? `<section class="mp-cat"><h2>${esc(c)}</h2><div class="mp-toolgrid">${l.map(x => `<a class="panel mp-toolcard" href="#${x.slug}"><span class="mp-ico" style="background:${x.color}" aria-hidden="true">${x.emoji}</span><span><b>${esc(x.name)}</b><span class="small muted">${esc(t('js.manip.grades', { grades: x.grades }))}</span><span class="small">${esc(x.desc)}</span></span></a>`).join('')}</div></section>` : ''; }).join('')
      || `<p class="muted">${esc(t('js.manip.home.none'))}</p>`;
  };
  q.oninput = drawCat; cat.onchange = drawCat; drawCat();
  drawBoards();
}
function drawBoards() {
  const el = document.getElementById('mp-boardlist'); if (!el) return;
  el.innerHTML = STATE.boards.length ? `<ul class="plain mp-list">${STATE.boards.map(b => { const x = toolOf(b.tool); return `<li class="mp-boardrow"><b class="mp-code">${esc(b.code)}</b> <span>${esc(x ? x.name : b.tool)}</span> <span class="small muted">${esc(new Date(b.created_at).toLocaleString())}</span>
    <span class="row">${btn('btn btn-sm', `data-open="${esc(b.id)}"`, esc(t('js.manip.boards.open')))}${btn('btn btn-sm btn-danger', `data-del="${esc(b.id)}" aria-label="${esc(t('js.manip.boards.deleteOne', { code: b.code }))}"`, esc(t('js.manip.boards.delete')))}</span></li>`; }).join('')}</ul>`
    : `<p class="small muted">${esc(t('js.manip.boards.none'))}</p>`;
  for (const b of el.querySelectorAll('[data-open]')) b.onclick = async () => { const r = await api(`/api/manipulatives/boards/${encodeURIComponent(b.dataset.open)}`); pendingRestore = r.board.state; location.hash = r.board.tool; };
  for (const b of el.querySelectorAll('[data-del]')) b.onclick = async () => {
    try { await api(`/api/manipulatives/boards/${encodeURIComponent(b.dataset.del)}/delete`, { method: 'POST', body: {} }); STATE.boards = STATE.boards.filter(x => x.id !== b.dataset.del); drawBoards(); }
    catch (e) { toast(e.message, { bad: true }); }
  };
}
function studentHome() {
  const list = STATE.sessions;
  ROOT.innerHTML = `<div class="pagehead"><h1>🧮 ${esc(t('js.manip.student.title'))}</h1></div>
    <section class="panel"><h2>${esc(t('js.manip.student.yours'))}</h2>${list.length ? `<ul class="plain mp-list">${list.map(s => { const x = toolOf(s.tool); return `<li class="mp-boardrow"><span>${x ? x.emoji : ''} <b>${esc(s.title)}</b></span> <span class="small muted">${esc(s.className)}</span>
      ${s.status === 'active' ? `<a class="btn btn-primary btn-sm" href="#${s.joined ? 'live' : 'join'}/${esc(s.id)}">${esc(s.joined ? t('js.manip.student.back') : t('js.manip.student.join'))}</a>` : `<span class="mp-tag bad">${esc(t('js.manip.live.ended'))}</span>`}</li>`; }).join('')}</ul>` : `<p class="muted">${esc(t('js.manip.student.none'))}</p>`}</section>
    <section class="panel"><h2>${esc(t('js.manip.student.codeTitle'))}</h2><form class="row mp-redeem" id="mp-join"><label class="sr-only" for="mp-join-code">${esc(t('js.manip.student.codeLabel'))}</label><input id="mp-join-code" class="input mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}"><button class="btn btn-primary" type="submit">${esc(t('js.manip.student.join'))}</button></form><p class="small" id="mp-joinmsg" role="status"></p></section>`;
  document.getElementById('mp-join').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/api/manipulatives/live/join', { method: 'POST', body: { code: document.getElementById('mp-join-code').value } }); location.hash = `live/${r.session.id}`; }
    catch (err) { document.getElementById('mp-joinmsg').textContent = err.message; }
  };
}
function tasksView() {
  clear(); V = null;
  const all = TOOLS.flatMap(x => (TASKS[x.slug] || []).map(task => ({ tool: x, task })));
  const grades = [...new Set(all.map(x => x.task.grade))].sort((a, b) => (a === 'K' ? -1 : b === 'K' ? 1 : +a - +b));
  ROOT.innerHTML = `<div class="pagehead"><h1>📚 ${esc(t('js.manip.tasks.library'))}</h1><a class="btn btn-sm" href="#">${esc(t('js.manip.nav.allTools'))}</a></div>
    <p class="mp-lead">${esc(t('js.manip.tasks.lead', { n: all.length }))}</p>
    <div class="mp-filter"><label class="sr-only" for="mp-tq">${esc(t('js.manip.tasks.search'))}</label><input id="mp-tq" class="input" type="search" placeholder="${esc(t('js.manip.tasks.search'))}">
      <label class="sr-only" for="mp-ttool">${esc(t('js.manip.tasks.byTool'))}</label><select id="mp-ttool" class="input"><option value="">${esc(t('js.manip.tasks.allTools'))}</option>${TOOLS.map(x => `<option value="${x.slug}">${esc(x.name)}</option>`).join('')}</select>
      <label class="sr-only" for="mp-tgrade">${esc(t('js.manip.tasks.byGrade'))}</label><select id="mp-tgrade" class="input"><option value="">${esc(t('js.manip.tasks.allGrades'))}</option>${grades.map(g => `<option value="${g}">${esc(t('js.manip.grade', { grade: g }))}</option>`).join('')}</select></div>
    <p class="small" id="mp-tcount" role="status"></p><div class="mp-taskgrid" id="mp-tlist"></div>`;
  const q = document.getElementById('mp-tq'), tool = document.getElementById('mp-ttool'), grade = document.getElementById('mp-tgrade');
  const draw = () => {
    const n = q.value.trim().toLowerCase();
    const list = all.filter(({ tool: x, task }) => (!tool.value || x.slug === tool.value) && (!grade.value || task.grade === grade.value) && (!n || `${x.name} ${task.title} ${task.prompt} ${task.ccss}`.toLowerCase().includes(n)));
    document.getElementById('mp-tcount').textContent = t('js.manip.tasks.count', { n: list.length });
    document.getElementById('mp-tlist').innerHTML = list.slice(0, 300).map(({ tool: x, task }) => `<article class="panel mp-taskcard"><p class="row"><span class="mp-ico sm" style="background:${x.color}" aria-hidden="true">${x.emoji}</span><b class="small">${esc(x.name)}</b><span class="mp-tag">${esc(task.ccss)}</span></p>
      <h2>${esc(task.title)}</h2><p class="small">${esc(task.prompt)}</p><p class="small muted"><b>${esc(t('js.manip.tasks.teacherNote'))}</b> ${esc(task.notes)}</p><p class="small muted">${esc(t('js.manip.grade', { grade: task.grade }))} · ${esc(task.ccss)}</p>
      <a class="btn btn-primary btn-sm" href="#${x.slug}">${esc(t('js.manip.tasks.open'))}</a></article>`).join('') || `<p class="muted">${esc(t('js.manip.tasks.none'))}</p>`;
  };
  q.oninput = draw; tool.onchange = draw; grade.onchange = draw; draw();
}

// ================================================================ start
async function loadState2() { try { STATE = { boards: [], classes: [], sessions: [], ...(await api('/api/manipulatives/state')) }; } catch { /* keep what we have */ } }
async function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  ROOM.close();
  if (h.startsWith('join/')) return liveRoom(h.slice(5), true);
  if (h.startsWith('live/') || h.startsWith('session/')) return liveRoom(h.slice(h.indexOf('/') + 1), false);
  if (h === 'tasks' && HOST) return tasksView();
  if (HOST && toolOf(h)) { const r = pendingRestore; pendingRestore = null; return openTool(h, { restore: r }); }
  if (!h || !HOST) { await loadState2(); return home(); }
  home();
}
window.addEventListener('hashchange', route);
loadState2().then(route);
