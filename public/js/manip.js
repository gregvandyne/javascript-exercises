// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"; server: services/manipulatives.js). One
// page, views by #hash: '' home, 'tasks' the task library, '<tool>' a tool's board, 'live/<id>' a teacher's session
// dashboard, 'join/<id>' and 'session/<id>' a student's board in a session.
// A board is one JSON object: the tool's own state, plus __ann { notes, strokes } (sticky notes and pen marks, their
// places as fractions of the board so they land in the same spot on any screen). Every change goes through change(),
// which keeps the undo history and (in a session) sends the student's board to their teacher a moment later.
// Hosts (teachers testing it) save boards with share codes, run sessions and draft with AI; students only see their
// own board in a session. Chrome strings are i18n keys (js.manip.*); tool names, tool help and the task library are
// English data (public/js/manip-data.js, public/js/manip-tasks.js).
import { t, api, toast, esc, pageData } from '/js/app.js';
import { TOOLS, CATS, toolOf, pieceDefs, allPieceDefs, BREAKS, FRACTION_DENS, fracLabel } from '/js/manip-data.js';
import { TASKS } from '/js/manip-tasks.js';

const ROOT = document.getElementById('manip');
const ROLE = pageData().role === 'host' ? 'host' : 'student';
const HOST = ROLE === 'host';
const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
const NOTE_MAX = 12, NOTE_W = 176, NOTE_H = 118;
const POLL_MS = 3500;
let STATE = { boards: [], classes: [], sessions: [] };
let V = null;          // the open board (tool view)
let timers = [];       // intervals and timeouts of the current view
const clear = () => { for (const x of timers) { clearInterval(x); clearTimeout(x); } timers = []; };
const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const round3 = n => Math.round(n * 1000) / 1000;
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return d; } };
const when = ms => new Date(ms).toLocaleString();
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;

// ================================================================ tools
// Each tool: init() its state; total(st) the chip text; palette(st) [{ label, color, run(st) }]; settings(st) HTML with
// data-set controls; hint and note (help text); board(st, view) the board's HTML; act(st, data, e) a tap on a [data-act]
// element (true when the board changed); bind(el) pointer work of its own; pieces: true for the drag-and-drop tools.
let pid = 1;
const newId = () => `${Date.now().toString(36)}${(pid++).toString(36)}`;
function mkPiece(d, x = 24 + Math.random() * 130, y = 24 + Math.random() * 110) {
  return { id: newId(), kind: d.kind, x, y, rot: 0, flipped: false, filled: true, locked: false, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h };
}
const sel = (key, opts, val, label) => `<label class="mp-set"><span>${esc(label)}</span><select class="input input-sm" data-set="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const toggle = (key, on, onLabel, offLabel) => btn('chip', `data-toggle="${key}" aria-pressed="${on ? 'true' : 'false'}"`, esc(on ? onLabel : offLabel));
const sum = ps => ps.reduce((s, p) => s + (+p.value || 0), 0);
const count = (ps, k) => ps.filter(p => p.kind === k).length;

/** A drag-and-drop tool: pieces from a palette, Break and Regroup where the tool has them. */
function piecesTool({ slug, opts = () => ({}), init = {}, total, settings = () => '', hint = '', note = '', extra = () => '' }) {
  const defsOf = st => pieceDefs(slug, opts(st));
  const breaks = BREAKS[slug];
  return {
    pieces: true, hint, note,
    init: () => ({ pieces: [], ...init }),
    defs: defsOf,
    total,
    palette: st => [
      ...defsOf(st).map(d => ({ label: d.label, color: d.color, run: s => { s.pieces.push(mkPiece(d)); } })),
      ...(breaks ? [{ label: 'Break ×10', hot: true, run: (s, v) => breakPiece(s, v, slug) }, { label: 'Regroup 10 → 1', run: (s, v) => regroup(s, v, slug) }] : []),
    ],
    settings, extra,
    board: (st, view) => extra(st) + st.pieces.map(p => pieceHtml(p, view)).join('')
      + (st.pieces.length || view.readOnly ? '' : `<p class="mp-empty">${esc(t('js.manip.board.emptyPieces'))}</p>`),
  };
}
const SHAPES = { hex: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)', trap: 'polygon(25% 0,75% 0,100% 100%,0 100%)', tri: 'polygon(50% 0,100% 100%,0 100%)',
  para: 'polygon(25% 0,100% 0,75% 100%,0 100%)', rhom: 'polygon(12% 0,100% 0,88% 100%,0 100%)' };
const ROUND = new Set(['pos', 'neg', 'blue', 'green', 'm', 'hth', 'tth', 'th', 'h', 't', 'o', 'tenth', 'hund', 'thou', 'penny', 'nickel', 'dime', 'quarter']);
function pieceHtml(p, view) {
  const on = !view.readOnly && view.sel === p.id;
  const shape = SHAPES[p.kind] ? `clip-path:${SHAPES[p.kind]};` : ROUND.has(p.kind) && !/^b\d/.test(p.kind) ? 'border-radius:50%;' : '';
  const face = `<div class="mp-face" style="${shape}background:${p.filled ? esc(p.color) : 'transparent'};color:${p.filled ? '#fff' : 'var(--text)'};font-size:${Math.min(20, Math.max(11, p.w / 3))}px">${SHAPES[p.kind] ? '' : `<span>${esc(p.label)}</span>`}</div>`;
  const bar = on ? `<div class="mp-pbar${p.y < 52 ? ' below' : ''}${p.x > 260 ? ' right' : ''}" role="toolbar" aria-label="${esc(t('js.manip.piece.actions', { label: p.label }))}">
    ${[['copy', t('js.manip.piece.copy')], ['flip', t('js.manip.piece.flip')], ['rotate', t('js.manip.piece.rotate')], ['fill', t('js.manip.piece.fill')], ['lock', p.locked ? t('js.manip.piece.unlock') : t('js.manip.piece.lock')], ['delete', t('js.manip.piece.delete')]]
    .map(([a, l]) => btn(`mp-pbtn${a === 'delete' ? ' bad' : ''}`, `data-pact="${a}" data-pid="${p.id}"`, esc(l))).join('')}</div>` : '';
  return `<div class="mp-piece${on ? ' on' : ''}${p.locked ? ' locked' : ''}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(t('js.manip.piece.label', { label: p.label }))}"
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
    note: 'Use the place-value columns at the bottom of the board to build, compare and regroup numbers.',
    extra: st => (st.decimal ? '' : `<div class="mp-pvchart" aria-hidden="true">${['Thousands', 'Hundreds', 'Tens', 'Ones'].map(c => `<div>${c}</div>`).join('')}</div>`) }),
  'place-value-disks': piecesTool({ slug: 'place-value-disks', total: st => `Total ${fmtTotal(sum(st.pieces))}`,
    hint: 'Select a disk, then Break it into ten disks of the next place, or Regroup ten disks into one.',
    note: 'Disks from 1,000,000 down to 0.001. Their size does not show their value: the label does.' }),
  'two-color-counters': piecesTool({ slug: 'two-color-counters', init: { frame: '10' },
    total: st => { const pos = count(st.pieces, 'pos'), neg = count(st.pieces, 'neg'); return `Value ${pos - neg} · Zero pairs ${Math.min(pos, neg)}`; },
    settings: st => sel('frame', [['0', 'None'], ['5', 'Five-frame'], ['10', 'Ten-frame']], st.frame, 'Frame'),
    hint: 'Yellow is +1 and red is -1. Put one of each together to make a zero pair.',
    note: 'Use the frame to count to 5 or 10, and Flip to turn a counter over.',
    extra: st => (+st.frame ? `<div class="mp-frame f${st.frame}" aria-label="${st.frame} frame">${'<div></div>'.repeat(+st.frame)}</div>` : '') }),
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
  'pattern-blocks': piecesTool({ slug: 'pattern-blocks', total: st => `Blocks ${st.pieces.length} · Hexagon value ${sum(st.pieces).toFixed(2)}`,
    hint: 'Rotate turns a block 30 degrees. If the hexagon is 1 whole, what is each block worth?',
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
        ${st.points.map(p => `<circle cx="${x(p)}" cy="110" r="11" fill="#00ACC1" stroke="#fff" stroke-width="2.5"/><text x="${x(p)}" y="80" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">${p}</text>`).join('')}
        ${st.jumpFrom !== null && st.jumpFrom !== undefined ? `<text x="${x(st.jumpFrom)}" y="30" font-size="13" font-weight="700" fill="#FF6B4A">Jump from ${st.jumpFrom}: tap where it lands</text>` : ''}</svg>
        <div class="row mp-chips">${st.points.map((p, i) => btn('chip', `data-act="unpoint" data-i="${i}" aria-label="Remove point ${p}"`, `${p} ✕`)).join('')}</div></div>`;
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
      return `<div class="mp-pad mp-bars">${st.bars.map((b, bi) => `<div><p class="mp-barname">${esc(b.name)} · total ${b.segs.reduce((s, x) => s + x.value, 0)}</p><div class="mp-bar">${b.segs.map((s, si) => `<div class="mp-seg" style="background:${esc(s.color)};width:${(s.value / maxTotal) * 100}%">
        <input class="mp-seglabel" data-bar="${bi}" data-seg="${si}" value="${esc(s.label)}" maxlength="30" aria-label="Part label in ${esc(b.name)}"${view.readOnly ? ' readonly tabindex="-1"' : ''}>
        <span class="mp-steps">${view.readOnly ? '' : btn('', `data-act="seg" data-bar="${bi}" data-seg="${si}" data-d="-1" aria-label="Make ${esc(s.label)} smaller"`, '−')}<b>${s.value}</b>${view.readOnly ? '' : btn('', `data-act="seg" data-bar="${bi}" data-seg="${si}" data-d="1" aria-label="Make ${esc(s.label)} bigger"`, '+')}</span></div>`).join('')}</div></div>`).join('')}</div>`;
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
        <div class="mp-xytable"><p class="mp-barname">Data table</p><table class="mp-table"><thead><tr><th>x</th><th>y</th><th>Point</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${st.pts.map((p, i) => `<tr><td>${p.x}</td><td>${p.y}</td><td><b>(${p.x},${p.y})</b></td><td>${btn('mp-x', `data-act="unpt" data-i="${i}" aria-label="Remove point ${p.x} ${p.y}"`, '✕')}</td></tr>`).join('')}</tbody></table>${st.pts.length ? '' : '<p class="small muted">No points yet. Tap the grid.</p>'}</div></div>`;
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
    init: () => ({ c1: { h: 9, m: 15 }, c2: { h: 11, m: 45 }, two: true, tracker: 0 }),
    total: st => { const e = elapsed(st); return `Elapsed ${Math.floor(e / 60)}h ${e % 60}m`; },
    palette: st => [{ label: st.two ? 'One clock' : 'Two clocks', color: '#1E88E5', run: s => { s.two = !s.two; } },
      { label: 'Time tracker +15 min', color: '#FFC91F', run: s => { s.tracker += 15; const m = s.c1.m + 15; s.c1 = { h: ((s.c1.h + Math.floor(m / 60) + 11) % 12) + 1, m: m % 60 }; } },
      { label: 'Reset the tracker', color: '#616161', run: s => { s.tracker = 0; } }],
    hint: 'Drag near the middle for the red hour hand and near the edge for the blue minute hand. The yellow wedge is the time between the hands.',
    note: 'The time tracker adds 15 minutes to the start clock each time.',
    board: (st, view) => {
      const e = elapsed(st), hm = c => `${((c.h + 11) % 12) + 1}:${String(c.m).padStart(2, '0')}`;
      const face = (c, which, label) => `<div class="mp-clockwrap">${clockSvg(c, which, label, view.readOnly)}<p class="mp-barname">${esc(label)} · ${hm(c)}</p>
        ${view.readOnly ? '' : `<div class="row mp-chips">${btn('chip', `data-act="hour" data-c="${which}" aria-label="${esc(label)}: one hour later"`, 'Hour +')}${btn('chip', `data-act="min5" data-c="${which}" aria-label="${esc(label)}: five minutes later"`, 'Min +5')}</div>`}</div>`;
      return `<div class="mp-pad mp-clocks">${face(st.c1, 'c1', st.two ? 'Start' : 'Clock')}${st.two ? face(st.c2, 'c2', 'End') : ''}
        <div class="mp-clockinfo"><p class="mp-barname">Read the time</p><p>Start <b>${hm(st.c1)}</b>${st.two ? ` · End <b>${hm(st.c2)}</b> · Elapsed <b>${Math.floor(e / 60)} hours ${e % 60} minutes</b>` : ''}</p>
        <div class="mp-timeline" aria-label="Elapsed time as a bar over 12 hours"><div style="width:${(e / 720) * 100}%"></div></div><p class="small muted">Time tracker: ${st.tracker} minutes.</p></div></div>`;
    },
    act: (st, d) => {
      const c = st[d.c]; if (!c) return false;
      if (d.act === 'hour') st[d.c] = { h: (c.h % 12) + 1, m: c.m };
      else if (d.act === 'min5') { const m = c.m + 5; st[d.c] = { h: m >= 60 ? (c.h % 12) + 1 : c.h, m: m % 60 }; } else return false;
      return true;
    },
    bind: el => bindClocks(el),
  },
};
const pie = (cx, cy, r, a0, a1) => `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); }
function geoPegs(board) {
  const out = [];
  if (board === 'circle') { for (let i = 0; i < 12; i++) out.push({ x: 3 + 2.6 * Math.cos((i * Math.PI) / 6), y: 3 + 2.6 * Math.sin((i * Math.PI) / 6) }); out.push({ x: 3, y: 3 }); }
  else for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) out.push(board === 'iso' ? { x: c + (r % 2) * 0.5, y: r * 0.87 } : { x: c, y: r });
  return out;
}
function geoPx(board, p, S) { const span = board === 'circle' ? 6 : board === 'iso' ? 5.5 : 5, sy = board === 'iso' ? 4.35 : span; return { X: 36 + (p.x / span) * (S - 72), Y: 36 + (p.y / sy) * (S - 72) }; }
const elapsed = st => ((st.c2.h * 60 + st.c2.m) - (st.c1.h * 60 + st.c1.m) + 720) % 720;
function clockSvg(c, which, label, readOnly) {
  const cx = 110, cy = 110, ha = ((c.h % 12) + c.m / 60) * (Math.PI / 6) - Math.PI / 2, ma = (c.m / 60) * 2 * Math.PI - Math.PI / 2;
  const ticks = Array.from({ length: 60 }, (_, i) => { const a = (i * Math.PI) / 30, big = i % 5 === 0; return `<line x1="${cx + (big ? 86 : 92) * Math.cos(a)}" y1="${cy + (big ? 86 : 92) * Math.sin(a)}" x2="${cx + 97 * Math.cos(a)}" y2="${cy + 97 * Math.sin(a)}" stroke="${big ? '#E53935' : 'var(--muted)'}" stroke-width="${big ? 3 : 1.5}"/>`; }).join('');
  const nums = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6 - Math.PI / 2; return `<text x="${cx + 72 * Math.cos(a)}" y="${cy + 72 * Math.sin(a) + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${i || 12}</text>`; }).join('');
  return `<svg class="mp-clock" ${readOnly ? '' : `data-clock="${which}"`} width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="${esc(label)} clock showing ${c.h} hours ${c.m} minutes">
    <circle cx="${cx}" cy="${cy}" r="100" fill="var(--card)" stroke="var(--text)" stroke-width="3"/>
    <path d="M ${cx} ${cy} L ${cx + 78 * Math.cos(ma)} ${cy + 78 * Math.sin(ma)} A 78 78 0 0 1 ${cx + 78 * Math.cos(ha)} ${cy + 78 * Math.sin(ha)} Z" fill="#FFC91F" fill-opacity=".35"/>
    ${ticks}${nums}<line x1="${cx}" y1="${cy}" x2="${cx + 56 * Math.cos(ha)}" y2="${cy + 56 * Math.sin(ha)}" stroke="#E53935" stroke-width="8" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${cx + 84 * Math.cos(ma)}" y2="${cy + 84 * Math.sin(ma)}" stroke="#1E88E5" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="7" fill="var(--text)"/></svg>`;
}
/** Dragging a clock's hands: near the middle moves the hour hand, near the edge the minute hand. */
function bindClocks(el) {
  for (const svg of el.querySelectorAll('svg[data-clock]')) {
    let hand = null, before = null;
    const at = e => { const r = svg.getBoundingClientRect(); const dx = ((e.clientX - r.left) / r.width) * 220 - 110, dy = ((e.clientY - r.top) / r.height) * 220 - 110; let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += 2 * Math.PI; return { a, dist: Math.hypot(dx, dy) }; };
    const set = e => {
      const { a } = at(e), k = svg.dataset.clock, c = V.st[k];
      if (hand === 'm') V.st[k] = { h: c.h, m: Math.round((a / (2 * Math.PI)) * 60) % 60 };
      else { const h = Math.round((a / (2 * Math.PI)) * 12) % 12; V.st[k] = { h: h || 12, m: c.m }; }
      const fresh = clockSvg(V.st[k], k, '', false); svg.innerHTML = fresh.replace(/^<svg[^>]*>|<\/svg>$/g, '');
      renderTotal();
    };
    svg.addEventListener('pointerdown', e => { if (V.annotate) return; before = JSON.stringify(V.st); hand = at(e).dist < 58 ? 'h' : 'm'; svg.setPointerCapture(e.pointerId); set(e); });
    svg.addEventListener('pointermove', e => { if (hand) set(e); });
    const up = () => { if (!hand) return; hand = null; pushHistory(before); renderBoard(); renderChrome(); changed(); };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }
}

// ================================================================ the board (shell)
/** The board as one JSON object (the tool's state, its sticky notes and pen marks). */
const boardState = () => ({ ...V.st, __ann: { notes: V.ann.notes, strokes: V.ann.strokes } });
function loadState(obj) {
  const o = parse(obj, {}) || {};
  const ann = o.__ann || {};
  V.ann = { notes: Array.isArray(ann.notes) ? ann.notes.slice(0, NOTE_MAX).map((n, i) => ({ id: String(n.id || `n${i}`), text: String(n.text || ''), x: +n.x || 0, y: +n.y || 0 })) : [],
    strokes: Array.isArray(ann.strokes) ? ann.strokes : [] };
  const rest = { ...o }; delete rest.__ann;
  const base = V.impl.init();
  V.st = V.impl.load ? V.impl.load(rest) : { ...base, ...rest };
  for (const k of Object.keys(base)) if (Array.isArray(base[k]) && !Array.isArray(V.st[k])) V.st[k] = base[k];
  if (V.impl.pieces) {
    const defs = allPieceDefs(V.tool.slug);
    V.st.pieces = V.st.pieces.filter(p => p && typeof p === 'object').map(p => { const d = defs.find(x => x.kind === p.kind) || { w: 50, h: 50 }; return { ...p, id: String(p.id || newId()), w: +p.w || d.w, h: +p.h || d.h, x: +p.x || 0, y: +p.y || 0 }; });
  }
  V.sel = null; V.editing = null; V.hist = []; V.annHist = [];
}
function pushHistory(snapshot) { V.hist.push(snapshot); if (V.hist.length > 40) V.hist.shift(); }
/** Every change to the tool's state: undo history, the board drawn again, the session told. */
function change(fn) {
  const before = JSON.stringify(V.st);
  const r = fn(V.st, V);
  if (r === false) return;
  pushHistory(before);
  renderBoard(); renderChrome(); changed();
}
function changed() {
  if (!V.session || V.session.status !== 'active') return;
  clearTimeout(V.sendTimer);
  V.sendTimer = setTimeout(sendWork, 1200);
}
async function sendWork() {
  if (!V || !V.session) return;
  try { await api(`/api/manipulatives/live/${V.session.id}/work`, { method: 'POST', body: { state: boardState() }, background: true }); setStatus(''); }
  catch (e) { if (e.status === 409) { V.session.status = 'ended'; renderLiveBar(); } else setStatus(e.message, true); }
}
function setStatus(msg, bad = false) { const el = document.getElementById('mp-status'); if (el) { el.textContent = msg; el.classList.toggle('bad', !!bad); } }

function openTool(slug, { session = null, restore = null } = {}) {
  clear();
  const tool = toolOf(slug); if (!tool) return home();
  V = { tool, impl: IMPL[slug], st: null, ann: { notes: [], strokes: [] }, hist: [], annHist: [], sel: null, annotate: false, annMode: 'pen', pen: PEN_COLORS[0], editing: null, draftOpen: false, tasksOpen: false, session, seenPush: 0 };
  loadState(restore || {});
  ROOT.innerHTML = `<div class="mp-tool">
    <div class="mp-head"><a class="btn btn-sm" href="#">${esc(session ? t('js.manip.nav.back') : t('js.manip.nav.allTools'))}</a>
      <div class="mp-title"><h1>${tool.emoji} ${esc(tool.name)}</h1><p class="small muted">${esc(CATS[tool.cat])} · ${esc(t('js.manip.grades', { grades: tool.grades }))}</p></div>
      <div class="mp-total" id="mp-total" aria-live="polite"></div></div>
    <div id="mp-livebar"></div>
    <div class="mp-work">
      <aside class="mp-side" aria-label="${esc(t('js.manip.side.label'))}">
        <p class="mp-cap">${esc(t('js.manip.side.objects'))}</p><div class="mp-palette" id="mp-palette"></div>
        <p class="mp-cap mp-cap-tools">${esc(t('js.manip.side.tools'))}</p><div class="mp-toolsrow" id="mp-toolsrow"></div>
      </aside>
      <div class="mp-main">
        <div id="mp-annbar"></div><div id="mp-draft"></div>
        <div class="mp-board" id="mp-board" aria-label="${esc(t('js.manip.board.label', { tool: tool.name }))}">
          <div class="mp-content" id="mp-content"></div>
          <svg class="mp-ink" id="mp-ink" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="mp-notes" id="mp-notes"></div><div id="mp-draw"></div>
        </div>
        <div class="mp-settings" id="mp-settings"></div>
        <div class="mp-share" id="mp-share"></div>
        <section class="mp-tasks panel" id="mp-tasks" aria-label="${esc(t('js.manip.tasks.boxLabel'))}"></section>
        <p class="small muted mp-note">${esc(V.impl.note || '')}</p>
      </div>
    </div></div>`;
  bindBoard();
  renderChrome(); renderBoard(); renderShare(); renderTasksBox(); renderLiveBar();
  window.scrollTo(0, 0);
  if (session) startStudentPoll();
}

function renderChrome() {
  renderTotal();
  const pal = document.getElementById('mp-palette');
  pal.innerHTML = V.impl.palette(V.st).map((p, i) => btn(`mp-pal${p.hot ? ' hot' : ''}`, `data-pal="${i}"${p.pressed ? ' aria-pressed="true"' : ''} aria-label="${esc(t('js.manip.side.add', { label: p.label }))}"`, `${p.color ? `<span class="mp-sw" style="background:${esc(p.color)}"></span>` : ''}<span>${esc(p.label)}</span>`)).join('');
  document.getElementById('mp-toolsrow').innerHTML = [
    btn('mp-tbtn', `data-tool="undo"${V.hist.length ? '' : ' disabled'}`, `↩ ${esc(t('js.manip.side.undo'))}`),
    btn(`mp-tbtn${V.annotate ? ' on' : ''}`, `data-tool="annotate" aria-pressed="${V.annotate}"`, `✎ ${esc(t('js.manip.side.annotate'))}`),
    btn('mp-tbtn', `data-tool="note"${V.ann.notes.length >= NOTE_MAX ? ' disabled' : ''}`, `🗒️ ${esc(t('js.manip.side.note'))}`),
    HOST ? btn(`mp-tbtn${V.draftOpen ? ' on' : ''}`, 'data-tool="draft"', `✨ ${esc(t('js.manip.side.draft'))}`) : '',
    btn('mp-tbtn', 'data-tool="reset"', esc(t('js.manip.side.reset'))),
  ].join('');
  const set = document.getElementById('mp-settings');
  set.innerHTML = `${V.impl.settings ? V.impl.settings(V.st) : ''}<p class="small muted mp-hint">${esc(V.impl.hint || '')}${V.impl.pieces ? ` ${esc(t('js.manip.board.pieceHint'))}` : ''}</p>`;
  renderAnnBar(); renderDraft();
}
function renderTotal() { const el = document.getElementById('mp-total'); if (el) el.textContent = V.impl.total(V.st); }

function renderBoard() {
  const content = document.getElementById('mp-content'); if (!content) return;
  content.classList.toggle('mp-abs', !!V.impl.pieces);
  content.innerHTML = V.impl.board(V.st, { sel: V.sel, readOnly: false });
  if (V.impl.bind) V.impl.bind(content);
  renderInk(); renderNotes();
  const draw = document.getElementById('mp-draw');
  draw.innerHTML = V.annotate ? `<div class="mp-drawlayer" role="application" aria-label="${esc(t('js.manip.ann.surface'))}"></div>` : '';
  if (V.annotate) bindDraw(draw.firstChild);
}
function renderInk() {
  document.getElementById('mp-ink').innerHTML = V.ann.strokes.map(s => `<polyline fill="none" stroke="${esc(s.c)}" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" points="${s.pts.map(p => `${p.x},${p.y}`).join(' ')}"/>`).join('');
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
  // A note's height depends on its text: pull any note that hangs over the board's edge back inside.
  const board = document.getElementById('mp-board'), W = board.clientWidth, H = board.clientHeight;
  if (W && H) for (const el of box.children) {
    const n = V.ann.notes.find(x => x.id === el.dataset.note); if (!n) continue;
    const x = clamp(n.x, 0, (W - el.offsetWidth) / W), y = clamp(n.y, 0, (H - el.offsetHeight) / H);
    if (x !== n.x || y !== n.y) { n.x = x; n.y = y; el.style.left = `${x * 100}%`; el.style.top = `${y * 100}%`; }
  }
  const ta = box.querySelector('textarea'); if (ta) ta.focus();
}
/** A clear spot for a new note: the first candidate that covers no piece and no other note, else the least covered. */
function noteSpot() {
  const board = document.getElementById('mp-board'), r = board.getBoundingClientRect(), W = r.width || 360, H = r.height || 430, wf = NOTE_W / W, hf = NOTE_H / H;
  const obs = [...board.querySelectorAll('.mp-piece, .mp-content button, .mp-content svg')].map(el => el.getBoundingClientRect()).filter(b => b.width && b.height)
    .map(b => ({ x: (b.left - r.left) / W, y: (b.top - r.top) / H, w: b.width / W, h: b.height / H }));
  for (const n of V.ann.notes) obs.push({ x: n.x, y: n.y, w: wf, h: hf });
  const cover = (x, y) => obs.reduce((s, b) => s + Math.max(0, Math.min(x + wf, b.x + b.w) - Math.max(x, b.x)) * Math.max(0, Math.min(y + hf, b.y + b.h) - Math.max(y, b.y)), 0);
  let best = { x: 0.03, y: 0.72 }, score = Infinity;
  for (const y of [0.72, 0.46, 0.2, 0.03].map(v => clamp(v, 0, 1 - hf))) for (const x of [0.03, 0.3, 0.56].map(v => clamp(v, 0, 1 - wf))) {
    const s = cover(x, y); if (s === 0) return { x, y }; if (s < score) { score = s; best = { x, y }; }
  }
  return best;
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
  const pt = e => { const r = layer.getBoundingClientRect(); return { x: r.width ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0, y: r.height ? clamp((e.clientY - r.top) / r.height, 0, 1) : 0 }; };
  const erase = p => { V.ann.strokes = V.ann.strokes.filter(s => !s.pts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.04)); };
  layer.addEventListener('pointerdown', e => {
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
  const up = () => { if (!mode) return; mode = null; V.ann.strokes = V.ann.strokes.filter(s => s.pts.length > 1); renderInk(); renderAnnBar(); changed(); };
  layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
}

/** Everything a tap, a drag or typing does on the tool view (one set of listeners, bound once). */
function bindBoard() {
  const root = ROOT.querySelector('.mp-tool');
  root.addEventListener('click', e => {
    const pal = e.target.closest('[data-pal]');
    if (pal) { const p = V.impl.palette(V.st)[+pal.dataset.pal]; if (p) change((st, v) => p.run(st, v)); return; }
    const tl = e.target.closest('[data-tool]');
    if (tl) return toolButton(tl.dataset.tool);
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const k = tg.dataset.toggle; return change(st => { st[k] = !st[k]; }); }
    const an = e.target.closest('[data-ann]');
    if (an) return annButton(an.dataset.ann, an.dataset.c);
    const nb = e.target.closest('[data-nact]');
    if (nb) return noteButton(nb.dataset.nact, nb.dataset.id);
    const pa = e.target.closest('[data-pact]');
    if (pa) return pieceButton(pa.dataset.pact, pa.dataset.pid);
    const act = e.target.closest('#mp-content [data-act]');
    if (act) { change(st => V.impl.act(st, act.dataset, e)); return; }
    if (V.impl.boardTap && e.target.closest('#mp-content svg')) { change(st => V.impl.act(st, {}, e)); return; }
    if (V.impl.pieces && V.sel && e.target.closest('#mp-board') && !e.target.closest('.mp-piece')) { V.sel = null; renderBoard(); }
  });
  root.addEventListener('change', e => {
    const s = e.target.closest('[data-set]'); if (!s) return;
    const k = s.dataset.set, v = s.value;
    change(st => {
      st[k] = typeof st[k] === 'boolean' ? !!v : typeof st[k] === 'number' ? (Number.isFinite(+v) ? +v : st[k]) : v;
      if (V.impl.onSet) V.impl.onSet(st, k);
    });
  });
  root.addEventListener('input', e => {
    if (e.target.classList.contains('mp-seglabel') && V.impl.input) {
      if (!V.typing) { pushHistory(JSON.stringify(V.st)); V.typing = true; }
      V.impl.input(V.st, e.target); changed(); return;
    }
    if (e.target.classList.contains('mp-notetext')) { const n = V.ann.notes.find(x => x.id === V.editing); if (n) { n.text = e.target.value.slice(0, 300); changed(); } }
  });
  root.addEventListener('focusout', e => { if (e.target.classList.contains('mp-seglabel')) V.typing = false; });
  bindPieceDrag(); bindNoteDrag();
}
function toolButton(k) {
  if (k === 'undo') { const prev = V.hist.pop(); if (prev) { V.st = JSON.parse(prev); V.sel = null; renderBoard(); renderChrome(); changed(); } return; }
  if (k === 'annotate') { V.annotate = !V.annotate; V.annMode = 'pen'; renderChrome(); renderBoard(); return; }
  if (k === 'note') {
    if (V.ann.notes.length >= NOTE_MAX) return;
    const n = { id: `note-${newId()}`, text: '', ...noteSpot() }; V.ann.notes.push(n); V.editing = n.id; renderNotes(); renderChrome(); changed(); return;
  }
  if (k === 'draft') { V.draftOpen = !V.draftOpen; renderChrome(); if (V.draftOpen) document.getElementById('mp-brief')?.focus(); return; }
  if (k === 'reset') change(st => { const fresh = V.impl.init(); for (const key of Object.keys(st)) delete st[key]; Object.assign(st, fresh); V.sel = null; });
}
function annButton(k, c) {
  if (k === 'pen') V.annMode = 'pen';
  else if (k === 'color') { V.pen = c; V.annMode = 'pen'; }
  else if (k === 'erase') V.annMode = 'erase';
  else if (k === 'undo') { const prev = V.annHist.pop(); if (prev) { V.ann.strokes = JSON.parse(prev); renderInk(); changed(); } }
  else if (k === 'clear') { V.annHist.push(JSON.stringify(V.ann.strokes)); V.ann.strokes = []; renderInk(); changed(); }
  else if (k === 'done') { V.annotate = false; renderChrome(); renderBoard(); return; }
  renderAnnBar();
}
function noteButton(k, id) {
  if (k === 'edit') V.editing = id;
  else if (k === 'done') V.editing = null;
  else if (k === 'delete') { V.ann.notes = V.ann.notes.filter(n => n.id !== id); if (V.editing === id) V.editing = null; changed(); renderChrome(); }
  renderNotes();
}
function pieceButton(k, id) {
  change(st => {
    const p = st.pieces.find(x => x.id === id); if (!p) return false;
    if (k === 'copy') st.pieces.push({ ...p, id: newId(), x: p.x + 24, y: p.y + 24, locked: false });
    else if (k === 'flip') p.flipped = !p.flipped;
    else if (k === 'rotate') p.rot = (p.rot + 30) % 360;
    else if (k === 'fill') p.filled = !p.filled;
    else if (k === 'lock') p.locked = !p.locked;
    else if (k === 'delete') { st.pieces = st.pieces.filter(x => x.id !== id); V.sel = null; }
    return true;
  });
}
/** Pieces move with mouse, pen or finger; a press that barely moves selects the piece (its toolbar appears). */
function bindPieceDrag() {
  const board = document.getElementById('mp-board');
  let drag = null;
  board.addEventListener('pointerdown', e => {
    if (!V.impl.pieces || V.annotate || e.target.closest('.mp-pbar')) return;
    const el = e.target.closest('.mp-piece'); if (!el) return;
    const p = V.st.pieces.find(x => x.id === el.dataset.pid); if (!p) return;
    const r = board.getBoundingClientRect();
    drag = { el, p, dx: e.clientX - r.left - p.x, dy: e.clientY - r.top - p.y, sx: e.clientX, sy: e.clientY, moved: false, x: p.x, y: p.y };
    if (!p.locked) el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  board.addEventListener('pointermove', e => {
    if (!drag || drag.p.locked) return;
    if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 5) return;
    drag.moved = true;
    const r = board.getBoundingClientRect();
    drag.x = clamp(e.clientX - r.left - drag.dx, 0, r.width - drag.p.w); drag.y = clamp(e.clientY - r.top - drag.dy, 0, r.height - drag.p.h);
    drag.el.style.left = `${drag.x}px`; drag.el.style.top = `${drag.y}px`; drag.el.classList.add('dragging');
  });
  const up = () => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved) change(st => { const p = st.pieces.find(x => x.id === d.p.id); if (!p) return false; p.x = Math.round(d.x); p.y = Math.round(d.y); V.sel = p.id; });
    else { V.sel = d.p.id; renderBoard(); }
  };
  board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
}
/** Sticky notes move with mouse or finger (places kept as fractions of the board); a tap opens the note to type in. */
function bindNoteDrag() {
  const box = document.getElementById('mp-notes'), board = document.getElementById('mp-board');
  let d = null;
  box.addEventListener('pointerdown', e => {
    if (e.target.closest('textarea, button')) return;
    const el = e.target.closest('.mp-sticky'); if (!el) return;
    const n = V.ann.notes.find(x => x.id === el.dataset.note); if (!n) return;
    const r = board.getBoundingClientRect();
    d = { el, n, dx: (e.clientX - r.left) / r.width - n.x, dy: (e.clientY - r.top) / r.height - n.y, sx: e.clientX, sy: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  box.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 7) return;
    d.moved = true;
    const r = board.getBoundingClientRect();
    d.n.x = clamp((e.clientX - r.left) / r.width - d.dx, 0, 1 - d.el.offsetWidth / r.width);
    d.n.y = clamp((e.clientY - r.top) / r.height - d.dy, 0, 1 - d.el.offsetHeight / r.height);
    d.el.style.left = `${d.n.x * 100}%`; d.el.style.top = `${d.n.y * 100}%`;
  });
  const up = () => { if (!d) return; const x = d; d = null; if (x.moved) changed(); else if (!x.el.classList.contains('editing')) { V.editing = x.n.id; renderNotes(); } };
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
  renderChrome(); renderBoard(); changed();
}
let pendingRestore = null;
async function redeem(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { setStatus(t('js.manip.share.needCode'), true); return; }
  try {
    const r = await api(`/api/manipulatives/code/${encodeURIComponent(code)}`);
    if (V && r.board.tool === V.tool.slug) { restoreInto(r.board.state); setStatus(t('js.manip.share.loaded', { code: r.board.code })); return; }
    if (V && V.session) { setStatus(t('js.manip.share.otherTool'), true); return; }
    pendingRestore = r.board.state; location.hash = r.board.tool;
  } catch (e) { if (V) setStatus(e.message, true); else toast(e.message, { bad: true }); }
}
function renderDraft() {
  const el = document.getElementById('mp-draft');
  if (!HOST || !V.draftOpen) { el.innerHTML = ''; return; }
  const tasks = TASKS[V.tool.slug] || [], vocab = V.impl.pieces ? V.impl.defs(V.st) : [];
  el.innerHTML = `<section class="panel mp-drafter" aria-label="${esc(t('js.manip.draft.title'))}"><div class="row"><h2>✨ ${esc(t('js.manip.draft.title'))}</h2>${btn('btn btn-sm btn-ghost', 'data-tool="draft"', `✕ ${esc(t('js.manip.draft.close'))}`)}</div>
    <p class="small muted">${esc(t('js.manip.draft.text'))}</p>
    <div class="mp-draftrow"><label class="mp-set grow"><span>${esc(t('js.manip.draft.task'))}</span><select class="input input-sm" id="mp-dtask"><option value="">${esc(t('js.manip.draft.ownLesson'))}</option>${tasks.map(x => `<option value="${esc(`${x.title}: ${x.prompt}`)}" data-grade="${esc(x.grade)}">${esc(x.title)} · ${esc(t('js.manip.grade', { grade: x.grade }))}</option>`).join('')}</select></label>
      <label class="mp-set"><span>${esc(t('js.manip.draft.grade'))}</span><select class="input input-sm" id="mp-dgrade"><option value="">${esc(t('js.manip.draft.any'))}</option>${['K', '1', '2', '3', '4', '5', '6', '7', '8'].map(g => `<option value="${g}">${esc(t('js.manip.grade', { grade: g }))}</option>`).join('')}</select></label></div>
    <label class="mp-set mp-block"><span>${esc(t('js.manip.draft.brief'))}</span><textarea class="input" id="mp-brief" rows="3" maxlength="1000" placeholder="${esc(t('js.manip.draft.briefPh'))}"></textarea></label>
    <p class="small muted">${esc(t('js.manip.draft.private'))}</p>
    <div class="row">${btn('btn btn-primary', 'id="mp-dgo"', `✨ ${esc(t('js.manip.draft.go'))}`)}<span class="small muted">${esc(vocab.length ? t('js.manip.draft.withPieces') : t('js.manip.draft.noPieces'))}</span></div>
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
      const m = t('js.manip.draft.done', { title: r.draft.board_title, pieces: r.draft.pieces.length, notes: r.draft.notes.length, marks: r.draft.strokes.length });
      document.getElementById('mp-dmsg').textContent = r.ai ? m : `${m} ${t('js.manip.draft.noAi')}`; setStatus(m);
    } catch (e) { msg.textContent = e.message; } finally { b.disabled = false; }
  };
}
/** A drafted board becomes an ordinary board: pieces placed from the tool's palette, sticky notes and pen marks. */
function applyDraft(d) {
  const r = document.getElementById('mp-board').getBoundingClientRect(), W = r.width || 800, H = r.height || 430;
  const base = JSON.parse(JSON.stringify(V.st));
  if (V.impl.pieces) {
    const defs = V.impl.defs(V.st);
    base.pieces = d.pieces.map(p => { const def = defs.find(x => x.kind === p.kind); return def ? mkPiece(def, clamp(p.x, 0, 1) * Math.max(0, W - def.w), clamp(p.y, 0, 1) * Math.max(0, H - def.h)) : null; }).filter(Boolean);
  }
  const notes = d.notes.map(n => ({ id: `note-${newId()}`, text: n.text, x: clamp(n.x, 0, 1 - NOTE_W / W), y: clamp(n.y, 0, 1 - NOTE_H / H) }));
  const strokes = d.strokes.map(s => ({ c: PEN_COLORS.includes(s.color) ? s.color : PEN_COLORS[0], pts: s.points.map(p => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) })) }));
  V.title = d.board_title;
  restoreInto({ ...base, __ann: { notes, strokes } });
}
function renderTasksBox() {
  const el = document.getElementById('mp-tasks'), tasks = TASKS[V.tool.slug] || [];
  if (!tasks.length) { el.hidden = true; return; }
  const shown = V.tasksOpen ? tasks : tasks.slice(0, 1);
  el.innerHTML = `<h2>${esc(t('js.manip.tasks.boxTitle'))}</h2>${shown.map(x => `<div class="mp-task"><p><b>${esc(x.title)}</b> <span class="mp-tag">${esc(x.ccss)}</span> <span class="mp-tag">${esc(t('js.manip.grade', { grade: x.grade }))}</span></p><p class="small">${esc(x.prompt)}</p>${HOST ? `<p class="small muted"><b>${esc(t('js.manip.tasks.teacherNote'))}</b> ${esc(x.notes)}</p>` : ''}</div>`).join('')}
    <div class="row">${btn('btn btn-sm', 'id="mp-tasksmore"', esc(V.tasksOpen ? t('js.manip.tasks.less') : t('js.manip.tasks.all', { n: tasks.length })))}${HOST ? `<a class="small" href="#tasks">${esc(t('js.manip.tasks.library'))}</a>` : ''}</div>`;
  document.getElementById('mp-tasksmore').onclick = () => { V.tasksOpen = !V.tasksOpen; renderTasksBox(); };
}

// ---------------------------------------------------------------- a student's session
function renderLiveBar() {
  const el = document.getElementById('mp-livebar'); if (!el) return;
  const s = V.session;
  if (!s) { el.innerHTML = ''; return; }
  const pushed = s.status === 'active' && s.pushedAt && s.pushedAt > V.seenPush ? parse(s.pushed, null) : null;
  el.innerHTML = `<div class="mp-livebar" role="status"><b>● ${esc(t('js.manip.live.on', { title: s.title }))}</b><span class="small">${esc(t('js.manip.live.saves'))}</span>
    ${s.status !== 'active' ? `<span class="mp-tag bad">${esc(t('js.manip.live.ended'))}</span>` : ''}
    ${pushed ? `<span class="mp-tag hot">${esc(t('js.manip.live.sent'))}</span>${btn('btn btn-sm btn-primary', 'id="mp-loadpush"', esc(t('js.manip.live.load')))}${btn('btn btn-sm', 'id="mp-keep"', esc(t('js.manip.live.keep')))}` : ''}</div>`;
  if (pushed) {
    document.getElementById('mp-loadpush').onclick = () => { V.seenPush = s.pushedAt; restoreInto(pushed.state); renderLiveBar(); setStatus(t('js.manip.live.loaded')); };
    document.getElementById('mp-keep').onclick = () => { V.seenPush = s.pushedAt; renderLiveBar(); };
  }
}
function startStudentPoll() {
  const poll = async () => {
    if (document.hidden || !V || !V.session) return;
    try {
      const r = await api(`/api/manipulatives/live/${V.session.id}`, { background: true });
      const was = V.session; V.session = { ...was, ...r.session };
      if (was.status !== V.session.status || was.pushedAt !== V.session.pushedAt) renderLiveBar();
    } catch (e) { if (e.status === 404) { clear(); ROOT.innerHTML = `<div class="empty"><h1>${esc(t('js.manip.live.gone'))}</h1></div>`; } }
  };
  timers.push(setInterval(poll, POLL_MS));
}
async function studentSession(id, joinFirst) {
  clear();
  ROOT.innerHTML = `<p class="muted">${esc(t('js.manip.loadingShort'))}</p>`;
  try {
    if (joinFirst) await api('/api/manipulatives/live/join', { method: 'POST', body: { id } });
    const r = await api(`/api/manipulatives/live/${encodeURIComponent(id)}`);
    if (r.role !== 'student') { location.hash = `live/${id}`; return; }
    if (joinFirst) { history.replaceState(null, '', `#session/${id}`); }
    openTool(r.session.tool, { session: r.session, restore: r.session.mine });
    V.seenPush = 0;
    renderLiveBar();
  } catch (e) { ROOT.innerHTML = `<div class="empty"><h1>${esc(e.status === 409 ? t('js.manip.live.ended') : t('js.manip.live.gone'))}</h1><p><a href="#">${esc(t('js.manip.nav.back'))}</a></p></div>`; }
}

// ================================================================ the teacher's dashboard
async function teacherLive(id) {
  clear(); V = null;
  ROOT.innerHTML = `<p class="muted">${esc(t('js.manip.loadingShort'))}</p>`;
  let s;
  const draw = () => {
    const tool = toolOf(s.tool), mine = STATE.boards.filter(b => b.tool === s.tool);
    ROOT.innerHTML = `<div class="pagehead"><h1>📡 ${esc(t('js.manip.dash.title'))}</h1><span class="mp-tag ${s.status === 'active' ? 'good' : 'bad'}">${esc(s.status === 'active' ? t('js.manip.dash.live') : t('js.manip.dash.ended'))}</span><a class="btn btn-sm" href="#">${esc(t('js.manip.nav.allTools'))}</a></div>
      <section class="panel mp-dashtop"><p class="small">${esc(t('js.manip.dash.codeFor', { klass: s.className }))}</p><p class="mp-bigcode" aria-label="${esc(t('js.manip.dash.codeLabel'))}">${esc(s.code)}</p>
        <p><b>${esc(s.title)}</b> · ${tool ? `${tool.emoji} ${esc(tool.name)}` : ''}</p><p class="small muted">${esc(t('js.manip.dash.joined', { n: s.students.length }))}</p>
        <div class="row"><a class="btn" href="#${esc(s.tool)}">${esc(t('js.manip.dash.build', { tool: tool ? tool.name : '' }))}</a>
          <a class="btn btn-hot" href="/api/manipulatives/live/${esc(s.id)}/export.pdf" download id="mp-pdf">${esc(t('js.manip.dash.pdf'))}</a>
          ${s.status === 'active' ? btn('btn btn-danger', 'id="mp-end"', esc(t('js.manip.dash.end'))) : ''}</div>
        <p class="small" id="mp-dashmsg" role="status"></p></section>
      <section class="panel"><h2>${esc(t('js.manip.dash.pushTitle'))}</h2><p class="small muted">${esc(t('js.manip.dash.pushText'))}</p>
        ${mine.length ? `<div class="row">${mine.map(b => btn('btn btn-primary btn-sm', `data-push="${esc(b.id)}" aria-label="${esc(t('js.manip.dash.pushOne', { code: b.code }))}"`, esc(t('js.manip.dash.pushOne', { code: b.code })))).join('')}</div>` : `<p class="small"><b>${esc(t('js.manip.dash.noBoards'))}</b></p>`}
        ${s.pushed ? `<p class="small">${esc(t('js.manip.dash.pushedAt', { when: when(s.pushedAt) }))}</p>` : ''}</section>
      <section class="mp-workgrid" aria-label="${esc(t('js.manip.dash.work'))}"><h2>${esc(t('js.manip.dash.work'))}</h2>
        ${s.students.length ? `<div class="mp-cards">${s.students.map(w => `<article class="panel mp-workcard" aria-label="${esc(t('js.manip.dash.workOf', { name: w.name }))}"><h3>${esc(w.name)}</h3><p class="small muted">${esc(t('js.manip.dash.lastSaved', { when: when(w.updatedAt) }))}</p>
          <ul class="small">${summarize(w.state).map(l => `<li>${esc(l)}</li>`).join('')}</ul>${btn('btn btn-sm', `data-view="${esc(w.id)}"`, esc(t('js.manip.dash.view')))}</article>`).join('')}</div>` : `<p class="muted">${esc(t('js.manip.dash.noStudents'))}</p>`}</section>`;
    const msg = m => { const el = document.getElementById('mp-dashmsg'); if (el) el.textContent = m; };
    const end = document.getElementById('mp-end');
    if (end) end.onclick = async () => { try { await api(`/api/manipulatives/live/${s.id}/end`, { method: 'POST', body: {} }); toast(t('js.manip.dash.endedMsg')); await refresh(); } catch (e) { msg(e.message); } };
    for (const b of ROOT.querySelectorAll('[data-push]')) b.onclick = async () => { try { await api(`/api/manipulatives/live/${s.id}/push`, { method: 'POST', body: { boardId: b.dataset.push } }); toast(t('js.manip.dash.pushed')); await refresh(); } catch (e) { msg(e.message); } };
    for (const b of ROOT.querySelectorAll('[data-view]')) b.onclick = () => { const w = s.students.find(x => x.id === b.dataset.view); if (w) viewWork(s.tool, w); };
  };
  const refresh = async () => {
    try {
      const r = await api(`/api/manipulatives/live/${encodeURIComponent(id)}`, { background: true });
      if (r.role !== 'teacher') { location.hash = `session/${id}`; return; }
      const sig = JSON.stringify(r.session);
      if (sig !== JSON.stringify(s)) { s = r.session; if (!document.querySelector('.mp-viewer')) draw(); }
    } catch (e) { clear(); ROOT.innerHTML = `<div class="empty"><h1>${esc(t('js.manip.live.gone'))}</h1><p>${esc(e.message)}</p></div>`; }
  };
  await refresh();
  timers.push(setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS));
}
/** A student's board, read-only, in a sheet over the dashboard. */
function viewWork(slug, w) {
  const impl = IMPL[slug], o = parse(w.state, {}) || {}, ann = o.__ann || {};
  const st = { ...impl.init(), ...o };
  const box = document.createElement('div');
  box.className = 'mp-viewer'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('js.manip.dash.workOf', { name: w.name }));
  box.innerHTML = `<div class="mp-viewbox panel"><div class="row"><h2>${esc(w.name)}</h2>${btn('btn btn-sm', 'id="mp-viewclose"', esc(t('js.manip.dash.close')))}</div>
    <div class="mp-board mp-readonly"><div class="mp-content${impl.pieces ? ' mp-abs' : ''}">${impl.board(st, { readOnly: true })}</div>
      <svg class="mp-ink" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${(Array.isArray(ann.strokes) ? ann.strokes : []).map(s => `<polyline fill="none" stroke="${esc(s.c)}" stroke-width="4" vector-effect="non-scaling-stroke" points="${(s.pts || []).map(p => `${+p.x},${+p.y}`).join(' ')}"/>`).join('')}</svg>
      <div class="mp-notes">${(Array.isArray(ann.notes) ? ann.notes : []).map((n, i) => noteHtml({ id: String(n.id), text: String(n.text || ''), x: +n.x || 0, y: +n.y || 0 }, i, true)).join('')}</div></div>
    <p class="small muted">${esc(impl.total(st))}</p></div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', esc1); };
  const esc1 = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc1);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.getElementById('mp-viewclose').onclick = close;
  document.getElementById('mp-viewclose').focus();
}
/** The teacher's lines for a board (the same as the server's summary, services/manipulatives.js summarize). */
function summarize(text) {
  const o = parse(text, null); if (!o) return [t('js.manip.dash.unreadable')];
  const out = [];
  if (Array.isArray(o.pieces)) {
    const c = new Map(); for (const p of o.pieces) c.set(p.label, (c.get(p.label) || 0) + 1);
    out.push(o.pieces.length ? `${o.pieces.length} pieces: ${[...c].map(([l, n]) => `${n} x ${l}`).join(', ')}. Value ${round3(sum(o.pieces))}.` : t('js.manip.dash.empty'));
  } else out.push(...Object.entries(o).filter(([k]) => !k.startsWith('__')).slice(0, 4).map(([k, v]) => `${k}: ${String(JSON.stringify(v)).slice(0, 80)}`));
  for (const n of ((o.__ann && o.__ann.notes) || [])) if (String(n.text || '').trim()) out.push(`🗒️ ${n.text}`);
  return out;
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
    try { const r = await api('/api/manipulatives/live', { method: 'POST', body: { classId: f.get('classId'), tool: f.get('tool'), title: f.get('title') } }); await loadState2(); location.hash = `live/${r.session.id}`; }
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
      ${s.status === 'active' ? `<a class="btn btn-primary btn-sm" href="#${s.joined ? 'session' : 'join'}/${esc(s.id)}">${esc(s.joined ? t('js.manip.student.back') : t('js.manip.student.join'))}</a>` : `<span class="mp-tag bad">${esc(t('js.manip.live.ended'))}</span>`}</li>`; }).join('')}</ul>` : `<p class="muted">${esc(t('js.manip.student.none'))}</p>`}</section>
    <section class="panel"><h2>${esc(t('js.manip.student.codeTitle'))}</h2><form class="row mp-redeem" id="mp-join"><label class="sr-only" for="mp-join-code">${esc(t('js.manip.student.codeLabel'))}</label><input id="mp-join-code" class="input mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}"><button class="btn btn-primary" type="submit">${esc(t('js.manip.student.join'))}</button></form><p class="small" id="mp-joinmsg" role="status"></p></section>`;
  document.getElementById('mp-join').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/api/manipulatives/live/join', { method: 'POST', body: { code: document.getElementById('mp-join-code').value } }); location.hash = `session/${r.session.id}`; }
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
  if (V && V.session && V.sendTimer) { clearTimeout(V.sendTimer); await sendWork(); }
  if (h.startsWith('join/')) return studentSession(h.slice(5), true);
  if (h.startsWith('session/')) return studentSession(h.slice(8), false);
  if (h.startsWith('live/') && HOST) return teacherLive(h.slice(5));
  if (h === 'tasks' && HOST) return tasksView();
  if (HOST && toolOf(h)) { const r = pendingRestore; pendingRestore = null; return openTool(h, { restore: r }); }
  if (!h || !HOST) { await loadState2(); return home(); }
  home();
}
window.addEventListener('hashchange', route);
loadState2().then(route);
