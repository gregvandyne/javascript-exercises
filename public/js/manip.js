// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"; server: services/manipulatives.js). One
// page, views by #hash: '' home, 'tasks' the task library, '<tool>' a tool's board on your own, 'live/<id>' a live
// session's shared room (public/js/manip-room.js; 'join/<id>' joins first).
// A board is one JSON object: the tool's own state, plus __ann { notes, strokes } (sticky notes and pen marks, their
// places as fractions of the board so they land in the same spot on any screen). Every change goes through change(),
// which keeps the undo history and draws the board again.
// Hosts (teachers testing it) save boards with share codes, run sessions and draft with AI; students only see their
// own square in a session's room. Chrome strings are i18n keys (js.manip.*); tool names, tool help and the task library are
// English data (public/js/manip-data.js, public/js/manip-tasks.js).
import { t, api, toast, esc, pageData, ask, sheet } from '/js/app.js';
import { iconHtml, toolIconHtml } from '/js/icons.js';
import { TOOLS, CATS, toolOf, tutorialOf, pieceDefs, allPieceDefs, BREAKS, FRACTION_DENS, fracLabel, hexValue, paletteName } from '/js/manip-data.js';
import { TASKS } from '/js/manip-tasks.js';
import { answerMatches } from '/js/manip-practice.js';
import * as ROOM from '/js/manip-room.js';
import { PAGE_TEMPLATES, homeLists, byTool } from '/js/manip-library.js';
import { stepsOf } from '/js/manip-data.js';
import { WORLD, OBJECTS, kindsOf, kindOf, objectTool, objSize, objRect, clockSector, addMinutes, migrate, newBoard, boxesOf, bbox, spotIn, placeObject,
  slotsOf, snapFor, groupOf, pieceBox, SNAP_PX, S_MIN, S_FLOOR, S_MAX, OBJ_MAX, OBJ_HEAD, UNDER, parseFrac, EQ_BAR,
  snapOpts, linksPieces, FRAMES, seatedIn, nearSpot, splitGroup, roundPiece, startLock, ANS, FREE_SIZE, answerSize, freeResize, grownHeight, textRect, textBoxFields, xyRange, xyLines, xySnap, xyMoveLine, xyClose, xyOpenLine, xyNextLn,
  rectFrom, inRect, selCount, selKeep, selMoving, selMove, selDelete } from '/js/manip-board.js';
import { settleCharts, chartInfo, strayIds, inChart, homeFor, placeAtHome, columnHome, paletteAdd } from '/js/manip-pv.js';
import { openWheel, closeWheel, startHold, shake, undoToast, icon, SLOP, wheelOpen } from '/js/manip-wheel.js';
import * as CHAT from '/js/manip-chat.js';
import { FC_DENS, FC_MAX, FC_WHOLE, fcLoad, fcAdd, fcNewCircle, fcMove, fcDelete, fcFind, fcFits, fcUsed, fcTotal, fcAmount, fcCircleLabel } from '/js/manip-board.js';
import { inkLine, textBoxHtml, textSizeButton, growText, textBoxPointer, snapText } from '/js/board-ann.js';

const ROOT = document.getElementById('manip');
const ROLE = pageData().role === 'host' ? 'host' : 'student';
const HOST = ROLE === 'host';
// /manipulatives/boards: the All boards page (boardsPage). Its rows open on the manipulatives page itself.
const ALL_PAGE = HOST && pageData().view === 'boards';
const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
const NOTE_MAX = 12, NOTE_W = 176, NOTE_H = 118;
let STATE = { boards: [], recent: [], classes: [], sessions: [], draft: null, eta: null };
let V = null;          // the open board (tool view)
let timers = [];       // intervals and timeouts of the current view
const clear = () => { for (const x of timers) { clearInterval(x); clearTimeout(x); } timers = []; CHAT.detach(); };
const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const round3 = n => Math.round(n * 1000) / 1000;
const parse = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return d; } };
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;

// ---------------------------------------------------------------- number line helpers
/** Where the next jump starts (the tapped start, then where each jump landed); null: the next tap picks it. */
const nlFrom = st => (st.jumpFrom === null || st.jumpFrom === undefined || st.jumpFrom === '' ? null : +st.jumpFrom);
/** The value on the nearest step under clientX. */
function nlValue(st, svg, clientX) {
  const r = svg.getBoundingClientRect(), W = 860, min = +st.min, max = +st.max > min ? +st.max : min + 1, step = +st.step || 1;
  const raw = min + (((clientX - r.left) / r.width) * W - 30) / (W - 60) * (max - min);
  return round3(Math.min(max, Math.max(min, Math.round((raw - min) / step) * step + min)));
}
/** The selected dot or jump, when it is still there. */
const nlSel = st => { const s = st.sel; if (!s) return null; const list = s.k === 'j' ? st.jumps : st.points; return Number.isInteger(s.i) && s.i >= 0 && s.i < (list || []).length ? s : null; };
const nlJumpLabel = j => { const d = round3(j.b - j.a); return `${d > 0 ? '+' : ''}${d}`; };
const nlNum = n => (n < 0 ? `−${-n}` : `${n}`);
/** The number sentence of the last chain of jumps (each starting where the one before landed): -2 + 4 - 1 = 1. */
export function nlSentence(st) {
  const js = st.jumps || []; if (!js.length) return null;
  const run = [js[js.length - 1]];
  for (let i = js.length - 2; i >= 0 && js[i].b === run[0].a; i--) run.unshift(js[i]);
  const parts = run.map(j => { const d = round3(j.b - j.a); return { op: d < 0 ? '−' : '+', n: Math.abs(d) }; });
  const end = run[run.length - 1].b;
  return { text: `${nlNum(run[0].a)} ${parts.map(p => `${p.op} ${p.n}`).join(' ')} = ${nlNum(end)}`,
    html: `<span>${esc(nlNum(run[0].a))}</span> ${parts.map(p => `<span class="mp-nl-j">${p.op} ${p.n}</span>`).join(' ')} = <b>${esc(nlNum(end))}</b>` };
}
/** The faint dot (Points) or dashed arc (Jumps) under the pointer: where a tap would go. Drawn into the board's own svg. */
function nlHover(e) {
  const svg = e.target && e.target.closest ? e.target.closest('svg.mp-nl[data-mode]') : null;
  document.querySelectorAll('svg.mp-nl .mp-nl-ghost').forEach(g => { if (!svg || !svg.contains(g)) g.innerHTML = ''; });
  if (!svg || e.pointerType === 'touch') return;
  const g = svg.querySelector('.mp-nl-ghost'); if (!g) return;
  if (e.target.closest('.mp-nl-pt, .mp-nl-jump, .mp-nl-tag')) { g.innerHTML = ''; return; }
  const st = { min: +svg.dataset.min, max: +svg.dataset.max, step: +svg.dataset.step };
  const v = nlValue(st, svg, e.clientX), W = 860, x = n => 30 + ((n - st.min) / (st.max - st.min)) * (W - 60);
  if (svg.dataset.mode === 'jumps' && svg.dataset.from !== undefined) {
    const a = +svg.dataset.from; if (v === a) { g.innerHTML = ''; return; }
    const mx = (x(a) + x(v)) / 2, h = Math.min(120, 26 + Math.abs(x(v) - x(a)) / 9), d = round3(v - a);
    g.innerHTML = `<path d="M ${x(a)} 102 Q ${mx} ${102 - h * 2} ${x(v)} 102" fill="none" stroke="#FF6B4A" stroke-width="3" stroke-dasharray="7 6" opacity=".6"/><text x="${mx}" y="${102 - h - 7}" text-anchor="middle" font-size="14" font-weight="800" fill="#FF6B4A" opacity=".7">${d > 0 ? '+' : ''}${d}</text>`;
  } else g.innerHTML = `<circle cx="${x(v)}" cy="110" r="11" fill="#00ACC1" opacity=".35"/><text x="${x(v)}" y="92" text-anchor="middle" font-size="12" fill="var(--text)" opacity=".7">${svg.dataset.mode === 'jumps' ? 'start at' : 'add'} ${v}</text>`;
}
if (typeof document !== 'undefined') document.addEventListener('pointermove', nlHover, { passive: true });

// ================================================================ tools
// Each tool: init() its state; total(st) the chip text; palette(st) [{ label, color, run(st) }]; settings(st) HTML with
// data-set controls; hint (a string, or hint(st) for one that follows the settings) and note (help text); board(st, view) the board's HTML; act(st, data, e) a tap on a [data-act]
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
function piecesTool({ slug, opts = () => ({}), init = {}, total, settings = () => '', hint = '', note = '', onSet = null }) {
  const defsOf = st => pieceDefs(slug, opts(st));
  const breaks = BREAKS[slug];
  return {
    pieces: true, hint, note,
    init: () => ({ pieces: [], ...init }),
    defs: defsOf,
    total,
    palette: st => [
      ...defsOf(st).map(d => ({ label: d.label, color: d.color, run: s => { s.pieces.push(placePiece(s, d)); } })),
      ...(breaks ? [{ label: 'Regroup 10 → 1', run: (s, v) => regroup(s, v, slug, WORLD) }] : []),
    ],
    settings,
    ...(onSet ? { onSet } : {}),
  };
}
const SHAPES = { hex: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)', trap: 'polygon(25% 0,75% 0,100% 100%,0 100%)', tri: 'polygon(50% 0,100% 100%,0 100%)',
  para: 'polygon(25% 0,100% 0,75% 100%,0 100%)', rhom: 'polygon(12% 0,100% 0,88% 100%,0 100%)' };
/** A label size that fits the piece: never wider than the piece, never taller than half of it, 9 to 20 pixels. */
const pieceFont = p => Math.round(Math.min(20, Math.max(9, Math.min(p.w / 3, (p.w - 8) / (Math.max(1, [...String(p.label)].length) * 0.62), p.h * 0.55))));
/** The parallelogram turned over (the one pattern block that is not its own mirror image): its outline drawn the other
 *  way, never the piece mirrored. */
const SHAPES_FLIPPED = { para: 'polygon(0 0,75% 0,100% 100%,25% 100%)' };
/** A piece. Its buttons are on the hold-to-edit wheel (manip-wheel.js), which lives outside the piece, so nothing on it
 *  is ever turned or mirrored with it; a piece is never mirrored at all (Flip turns it over: manip.js flipPiece). */
function pieceHtml(p, view) {
  const on = !view.readOnly && (view.sel === p.id || !!(view.many && view.many.p.has(p.id)));
  const clip = (p.flipped && SHAPES_FLIPPED[p.kind]) || SHAPES[p.kind];
  // Round only where the tool's pieces are round (manip-board.js roundPiece: base ten's 'tenth' is a block, a disk's is a disk).
  const shape = clip ? `clip-path:${clip};` : roundPiece(view.slug, p.kind) ? 'border-radius:50%;' : '';
  const face = `<div class="mp-face" style="${shape}background:${p.filled ? esc(p.color) : 'transparent'};color:${p.filled ? '#fff' : 'var(--text)'};font-size:${pieceFont(p)}px">${SHAPES[p.kind] || p.kind === 'sq' || !p.label || p.label === '•' ? '' : `<span class="mp-lab">${esc(p.label)}</span>`}</div>`;
  const lock = p.locked ? `<span class="mp-lockb" aria-hidden="true" style="rotate:${-(+p.rot || 0)}deg">${icon('lock')}</span>` : '';
  const lifted = view.lifted === p.id, flipIn = view.flipIn === p.id;
  return `<div class="mp-piece${on ? ' on' : ''}${p.locked ? ' locked' : ''}${p.g ? ' grouped' : ''}${lifted ? ' lifted' : ''}${flipIn ? ' flipin' : ''}${view.snapped && view.snapped.has(p.id) ? ' snapped' : ''}${view.fresh === p.id ? ' fresh' : ''}${view.traded && view.traded.has(p.id) ? ' traded' : ''}${view.strays && view.strays.has(p.id) ? ' stray' : ''}" data-pid="${esc(p.id)}" role="button" tabindex="${view.readOnly ? -1 : 0}" aria-haspopup="menu" aria-label="${esc(p.locked ? t('js.manip.wheel.pieceLocked', { label: p.label }) : t('js.manip.piece.label', { label: p.label }))}"
    style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;transform:rotate(${+p.rot || 0}deg)">${face}${lock}</div>`;
}
function breakPiece(st, v, slug, space = null) {
  const p = st.pieces.find(x => x.id === v.sel); const to = p && BREAKS[slug][p.kind];
  if (!to) { toast(t('js.manip.piece.pickBreak')); return false; }
  const d = allPieceDefs(slug).find(x => x.kind === to);
  // In a place-value chart the ten pieces go into the column for their value (a rod in Tens: ten units in Ones).
  const home = homeFor(slug, st, p, d.value);
  st.pieces = st.pieces.filter(x => x.id !== p.id);
  const news = Array.from({ length: 10 }, (_, i) => mkPiece(d, p.x + (i % 5) * (d.w + 6), p.y + Math.floor(i / 5) * (d.h + 6)));
  if (home) placeAtHome(home, news, space);
  st.pieces.push(...news);
  v.sel = null; if (home) v.traded = new Set(news.map(q => q.id)); return true;
}
function regroup(st, v, slug, space = null) {
  const p = st.pieces.find(x => x.id === v.sel);
  const up = p && Object.keys(BREAKS[slug]).find(k => BREAKS[slug][k] === p.kind);
  // The selected piece first, then the ones nearest it (in a chart: the ones in its own column come first).
  const near = q => Math.hypot(q.x - p.x, q.y - p.y);
  const same = p ? st.pieces.filter(x => x.kind === p.kind && !x.locked).sort((a, b) => (a === p ? -1 : b === p ? 1 : near(a) - near(b))) : [];
  if (!up || same.length < 10) { toast(t('js.manip.piece.pickRegroup')); return false; }
  const gone = new Set(same.slice(0, 10).map(x => x.id)), d = allPieceDefs(slug).find(x => x.kind === up);
  // In a place-value chart the new piece goes into the column for its value (ten units in Ones: a rod in Tens).
  const home = homeFor(slug, st, p, d.value);
  st.pieces = st.pieces.filter(x => !gone.has(x.id));
  const q = mkPiece(d, same[0].x, same[0].y);
  if (home) placeAtHome(home, [q], space);
  st.pieces.push(q);
  v.sel = null; if (home) v.traded = new Set([q.id]); return true;
}
/**
 * After a change to a piece tool's board: what sits in a place-value chart's columns regroups and every column is laid
 * out again (manip-pv.js). The new pieces get a short "traded" pop (none with reduced motion) and one line says what
 * happened. Shared with the room (st: a square's state, space: its work space). v: the view holder ({ traded }).
 */
function settleBoard(slug, st, v, space) {
  if (!IMPL[slug] || !IMPL[slug].pieces || !Array.isArray(st.pieces)) return;
  const r = settleCharts(slug, st, { make: mkPiece, space });
  if (r.fresh.length) v.traded = new Set([...(v.traded || []), ...r.fresh]);
  const e = r.events[r.events.length - 1];
  if (e && e.kind === 'traded') toast(t('js.manip.pv.traded', { n: e.n, from: e.from, m: e.m, to: e.to }));
  else if (e && e.kind === 'broke') toast(t('js.manip.pv.broke', { from: e.from, n: e.n, to: e.to }));
  else if (e && e.kind === 'moved') toast(t('js.manip.pv.moved', { label: e.label, col: e.col }));
}
/** A chart made bigger or smaller: the pieces in its columns keep their places in it (then the columns are laid out). */
function scaleWithChart(slug, o, s0, pieces) {
  const s = +o.s || 1; if (!s0 || s === s0) return;
  for (const p of inChart(slug, { ...o, s: s0 }, pieces)) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2, k = s / s0;
    p.x = o.x + (cx - o.x) * k - p.w / 2; p.y = o.y + (cy - o.y) * k - p.h / 2;
  }
}
/** Bar models: a part's size (at least 0.5, at most BAR_MAX); the selected part (st.pick, while it is there). */
const BAR_MAX = 999;
const barValue = v => clamp(round3(+v || 0), 0.5, BAR_MAX);
const barPick = st => { const p = st && st.pick; return p && Number.isInteger(p.b) && Number.isInteger(p.s) && st.bars[p.b] && st.bars[p.b].segs[p.s] ? p : null; };
/** The text color with the better contrast on a fill (WCAG relative luminance, as scripts/contrast.js): 'dark' or
 *  'light'. White on light green was hard to read. */
function segInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 'light';
  const ch = i => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  // Against white (1) and the dark text #141414 (about 0.007).
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.057) ? 'light' : 'dark';
}
const fmtTotal = n => (Number.isInteger(n) ? n.toLocaleString('en-US') : round3(n).toLocaleString('en-US', { maximumFractionDigits: 3 }));

const IMPL = {
  'base-ten-blocks': piecesTool({ slug: 'base-ten-blocks', init: { decimal: false }, opts: st => ({ decimal: st.decimal }),
    total: st => `Total ${fmtTotal(sum(st.pieces))}`,
    settings: st => sel('decimal', [['', 'Whole numbers'], ['1', 'Decimals']], st.decimal ? '1' : '', 'Number set'),
    hint: 'Hold a block and pick Break to split it into ten of the next size. Tap one of ten blocks, then Regroup joins them back into one. In the place-value chart, ten blocks in the next column up trade for one, and a block dropped one column down breaks into ten. The total stays the same.',
    note: 'Drop blocks into the place-value chart\'s columns to build, compare and regroup numbers. Add more charts or a work mat from the palette.' }),
  'place-value-disks': piecesTool({ slug: 'place-value-disks', total: st => `Total ${fmtTotal(sum(st.pieces))}`,
    hint: 'Hold a disk and pick Break to make ten disks of the next place. Tap one of ten disks, then Regroup makes them one. In a place-value chart, ten disks in the next column up trade for one.',
    note: 'Disks from 1,000,000 down to 0.001. Their size does not show their value: the label does.' }),
  'two-color-counters': piecesTool({ slug: 'two-color-counters',
    total: st => { const pos = count(st.pieces, 'pos'), neg = count(st.pieces, 'neg'); return `Value ${pos - neg} · Zero pairs ${Math.min(pos, neg)}`; },
    hint: 'Yellow is +1 and red is -1. Put one of each together to make a zero pair. Hold a counter and pick Flip to turn it over.',
    note: 'Counters drop into a frame\'s empty cells and stay just where you drop them anywhere else. Hold a frame to lock it in place.' }),
  'linking-cubes': piecesTool({ slug: 'linking-cubes', total: st => `Cubes ${st.pieces.length}`,
    hint: 'Drag cubes edge to edge to make sticks. Copy a cube to make more of the same color.',
    note: 'Ten colors for making numbers, arrays, patterns and bar graphs.' }),
  'color-tiles': piecesTool({ slug: 'color-tiles', total: st => `Tiles ${st.pieces.length} · Area ${st.pieces.length} square units`,
    hint: 'Build a rectangle and read its area from the total. Count the outside edges for the perimeter.',
    note: 'Square tiles for patterns, multiplication as area, and area and perimeter.' }),
  'number-rods': piecesTool({ slug: 'number-rods', init: { unit: '1' },
    total: st => `Length value ${round3(sum(st.pieces) * (+st.unit || 1))}`,
    settings: st => sel('unit', [['1', '1 (whole numbers)'], ['0.1', '0.1 (decimals)'], ['0.5', '1/2 (fractions)']], st.unit, 'Value of the white rod'),
    hint: 'Give the white rod a value and every other rod takes its value by length. Hold a rod and Rotate it to stand it up.',
    note: 'Ten rods in ten colors, each one unit longer than the last.' }),
  'fraction-tiles': piecesTool({ slug: 'fraction-tiles', init: { mode: 'frac' }, opts: st => ({ mode: st.mode }),
    total: st => `Total ${round3(sum(st.pieces))} wholes`,
    settings: st => sel('mode', [['frac', 'Fraction'], ['pct', 'Percent'], ['dec', 'Decimal']], st.mode, 'Labels'),
    // Labels relabels the tiles already on the board too (as fraction circles do), not only new ones.
    onSet: (st, key) => { if (key === 'mode') for (const p of st.pieces || []) { const m = /^f(\d+)$/.exec(p.kind || ''); if (m) p.label = fracLabel(+m[1], st.mode); } },
    hint: 'Stack rows by denominator to build a fraction wall. Hold a tile to pull it out of a row, or pick Fill to make it an outline.',
    note: 'Wholes, halves, thirds, fourths, fifths, sixths, eighths, tenths and twelfths. Line them up to show equivalence.' }),
  'algebra-tiles': piecesTool({ slug: 'algebra-tiles',
    total: st => {
      const c = k => count(st.pieces, k);
      const parts = [[c('x2') - c('mx2'), 'x²'], [c('y2'), 'y²'], [c('xy'), 'xy'], [c('x') - c('mx'), 'x'], [c('y') - c('my'), 'y'], [c('one') - c('mone'), '']].filter(([n]) => n).map(([n, v]) => `${n}${v}`);
      return `Expression ${parts.length ? parts.join(' + ').replace(/\+ -/g, '− ') : '0'} · Zero pairs ${Math.min(c('one'), c('mone')) + Math.min(c('x'), c('mx'))}`;
    },
    hint: 'A tile and its opposite make a zero pair. Hold a tile and pick Flip to turn it into its opposite. Build area models like (x + 3)(x + 2).',
    note: 'The area of each tile is its value: 1, x, x², y, y² and xy, with their opposites.' }),
  'pattern-blocks': piecesTool({ slug: 'pattern-blocks', total: st => { const v = hexValue(st.pieces); return `Blocks ${st.pieces.length} · Hexagons ${v.text}${v.left ? ` · ${v.left} not counted` : ''}`; },
    hint: 'Hold a block: Rotate turns it 30 degrees, and the parallelogram can Flip. If the hexagon is 1 whole, the trapezoid is 1/2, the blue parallelogram 1/3 and the triangle 1/6. The square and the thin rhombus are not counted.',
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
    // Circles that hold pieces (owner, 25 Nov 2026: show 1/2 + 1/4 + 1/4 = 1 whole). The model is manip-board.js fc*.
    init: () => OBJECTS['fraction-circles'][0].init(),
    load: raw => fcLoad(raw),
    total: st => `Total ${fcAmount(fcTotal(st), st.mode)}`,
    // New circle and the rings switch first: always in reach above the ten piece sizes.
    palette: st => [{ label: 'New circle', color: '#5E35B1', run: s => { if (!fcNewCircle(s)) { toast(`A fraction set holds up to ${FC_MAX} circles. Add another fraction set.`); return false; } s.rings = false; } },
      { label: st.rings ? 'Back to circles' : 'Rings view', color: '#5E35B1', run: s => { s.rings = !s.rings; } },
      ...FC_DENS.map(([d, c]) => ({ label: `${fracLabel(d, st.mode, '1')} piece`, adds: true, color: c, run: s => fcAddPiece(s, d) }))],
    settings: st => sel('mode', [['frac', 'Fraction'], ['pct', 'Percent'], ['dec', 'Decimal']], st.mode, 'Labels'),
    hint: 'Tap a piece in the palette to add it to the selected circle, or to the first circle with room. A full circle says 1 whole. Tap a piece to select it, then Delete. Drag a piece onto another circle to move it.',
    note: 'Fill circles to make wholes, compare circles side by side, and use the rings view to compare denominators.',
    board: (st, view = {}) => (st.rings ? fcRingsHtml() : fcBoardHtml(st, view)),
    act: (st, d) => {
      if (d.act === 'fcsel') {
        if (Date.now() - fcDragEnd < 300) return false;   // the tap that ends a drag selects nothing
        const k = d.p ? 'p' : 'c', id = d.p || d.c;
        st.sel = st.sel && st.sel[k] === id ? null : { [k]: id }; return true;
      }
      if (d.act === 'fcdel') return fcDelete(st);
      return false;
    },
    bind: (el, ctx) => bindFractionSets(el, ctx),
  },

  'number-lines': {
    // Two modes (25 Nov 2026, the owner: "whenever I click it adds a blue dot"): Points puts a dot where you tap;
    // Jumps chains arcs (the first tap picks the start, each next tap lands a jump from where the last one landed) and
    // writes the number sentence. Tapping a dot or a jump selects it (never a new dot on top of it); Delete takes it away.
    init: () => ({ min: -10, max: 10, step: 1, hide: false, points: [3], jumps: [], jumpFrom: null, mode: 'points' }),
    total: st => { const s = nlSentence(st); return st.mode === 'jumps' && s ? s.text : `Points ${st.points.join(', ') || 'none'}`; },
    palette: () => [{ label: 'Add a point at 0', color: '#00ACC1', run: s => { s.points.push(0); } },
      { label: 'Clear the line', color: '#212121', run: s => { s.points = []; s.jumps = []; s.jumpFrom = null; } }],
    settings: st => `<label class="mp-set"><span>From</span><input class="input input-sm mp-num" type="number" data-set="min" value="${st.min}"></label><label class="mp-set"><span>To</span><input class="input input-sm mp-num" type="number" data-set="max" value="${st.max}"></label>
      ${sel('step', [['1', '1'], ['0.5', '0.5'], ['0.25', '1/4'], ['0.1', '0.1'], ['5', '5'], ['10', '10']], st.step, 'Step')}${toggle('hide', st.hide, 'Show labels', 'Hide labels')}`,
    // The hint follows the switch (a function of the line's state: renderChrome's hintOf).
    hint: st => (st && st.mode === 'jumps' ? 'Jumps: tap where to start, then where each jump lands. Tap a jump to select it, then Delete. Switch to Points to put dots on the line.'
      : 'Points: tap the line to put a dot on it. Tap a dot to select it, then Delete. Switch to Jumps to make jumps.'),
    note: 'Open lines (labels hidden), jump arcs that write the number sentence, and fraction and decimal steps.',
    board: (st, view = {}) => {
      const W = 860, min = +st.min, max = +st.max > +st.min ? +st.max : +st.min + 1, step = +st.step || 1;
      const x = v => 30 + ((v - min) / (max - min)) * (W - 60);
      const ticks = []; for (let v = min; v <= max + 1e-4 && ticks.length < 201; v += step) ticks.push(round3(v));
      const jm = st.mode === 'jumps' && !st.ask, edit = !st.ask && !view.readOnly, from = nlFrom(st);
      const sent = nlSentence(st), sel = nlSel(st), selJ = sel && sel.k === 'j' ? sel.i : -1, selP = sel && sel.k === 'p' ? sel.i : -1;
      const help = !edit ? '' : jm ? (from === null ? 'Tap the line where the jumps start.' : `Jumping from <b>${from}</b>. Tap where the next jump lands.`) : 'Tap the line to put a dot on it. Tap a dot or a jump to select it.';
      const tags = []; // each jump's label kept clear of the ones before it: a short jump over a long one goes higher
      const arc = (j, i) => {
        const mx = (x(j.a) + x(j.b)) / 2, d = round3(j.b - j.a), dir = d >= 0 ? 1 : -1;
        let h = Math.min(120, 26 + Math.abs(x(j.b) - x(j.a)) / 9);
        while (h < 140 && tags.some(t => Math.abs(t.x - mx) < 48 && Math.abs(t.h - h) < 26)) h += 26;
        tags.push({ x: mx, h });
        const path = `M ${x(j.a)} 102 Q ${mx} ${102 - h * 2} ${x(j.b)} 102`;
        const attrs = edit ? ` data-act="nlsel" data-k="j" data-i="${i}" role="button" aria-pressed="${i === selJ}" aria-label="Select the jump ${d > 0 ? '+' : ''}${d}"` : '';
        // The arc, then (drawn after every arc) its label: no arc ever crosses a label.
        return [`<g class="mp-nl-jump${i === selJ ? ' on' : ''}"${attrs}>${i === selJ ? `<path d="${path}" fill="none" stroke="var(--text)" stroke-width="9" stroke-opacity=".18" stroke-linecap="round"/>` : ''}<path d="${path}" fill="none" stroke="transparent" stroke-width="18"/><path d="${path}" fill="none" stroke="#FF6B4A" stroke-width="${i === selJ ? 5 : 3.5}"/><polygon points="${x(j.b)},103 ${x(j.b) - 9 * dir},92 ${x(j.b) + 3 * dir},90" fill="#FF6B4A"/></g>`,
          `<g class="mp-nl-tag${i === selJ ? ' on' : ''}"${attrs.replace(' role="button"', '').replace(/ aria-[a-z]+="[^"]*"/g, '')}><rect x="${mx - 22}" y="${102 - h - 24}" width="44" height="24" rx="12" fill="var(--card, #fff)" stroke="#FF6B4A" stroke-width="${i === selJ ? 3 : 2}"/><text x="${mx}" y="${102 - h - 7}" text-anchor="middle" font-size="14" font-weight="800" fill="#FF6B4A">${d > 0 ? '+' : ''}${d}</text></g>`];
      };
      const arcs = st.jumps.map(arc);
      return `<div class="mp-pad mp-scrollx">${edit ? `<div class="mp-nl-top"><div class="mp-nl-mode" role="group" aria-label="What a tap does">${btn(`mp-nl-m${jm ? '' : ' on'}`, `data-act="nlmode" data-m="points" aria-pressed="${!jm}"`, '● Points')}${btn(`mp-nl-m${jm ? ' on' : ''}`, `data-act="nlmode" data-m="jumps" aria-pressed="${jm}"`, '↷ Jumps')}</div><p class="mp-nl-help">${help}</p></div>` : ''}
        <svg class="mp-nl" data-w="${W}" data-min="${min}" data-max="${max}" data-step="${step}" data-mode="${jm ? 'jumps' : 'points'}"${from !== null ? ` data-from="${from}"` : ''} width="${W}" height="${jm || st.jumps.length ? 240 : 190}" viewBox="0 ${jm || st.jumps.length ? -50 : 0} ${W} ${jm || st.jumps.length ? 240 : 190}" role="img" aria-label="Number line">
        <line x1="20" y1="110" x2="${W - 20}" y2="110" stroke="var(--text)" stroke-width="3"/><polygon points="${W - 20},110 ${W - 34},102 ${W - 34},118" fill="var(--text)"/><polygon points="20,110 34,102 34,118" fill="var(--text)"/>
        ${ticks.map(v => `<line x1="${x(v)}" y1="100" x2="${x(v)}" y2="120" stroke="var(--text)" stroke-width="2"/>${st.hide ? '' : `<text x="${x(v)}" y="142" text-anchor="middle" font-size="13" fill="var(--text)">${v}</text>`}`).join('')}
        ${arcs.map(a => a[0]).join('')}${arcs.map(a => a[1]).join('')}
        ${jm && from !== null && !st.jumps.some(j => j.b === from) ? `<g><circle cx="${x(from)}" cy="110" r="9" fill="#FF6B4A" stroke="#fff" stroke-width="2.5"/><text x="${x(from)}" y="168" text-anchor="middle" font-size="12" font-weight="700" fill="#FF6B4A">start</text></g>` : ''}
        ${st.points.map((p, i) => `<g class="mp-nl-pt${i === selP ? ' on' : ''}"${edit ? ` data-act="nlsel" data-k="p" data-i="${i}" role="button" aria-pressed="${i === selP}" aria-label="Select the point ${p}"` : ''}><circle cx="${x(p)}" cy="110" r="16" fill="transparent"/>${i === selP ? `<circle cx="${x(p)}" cy="110" r="18" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-dasharray="4 3"/>` : ''}<circle cx="${x(p)}" cy="110" r="11" fill="#00ACC1" stroke="#fff" stroke-width="2.5"/>${st.ask ? `<text x="${x(p)}" y="80" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">?</text>` : `<rect x="${x(p) - 17}" y="64" width="34" height="22" rx="8" fill="#00ACC1"/><text x="${x(p)}" y="80" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${p}</text>`}</g>`).join('')}
        <g class="mp-nl-ghost"></g></svg>
        ${edit && jm && sent ? `<div class="mp-nl-sum" aria-live="polite">${sent.html}</div>` : ''}
        ${edit ? `<div class="row mp-chips">${sel ? btn('chip mp-nl-del', 'data-act="nldel"', `🗑 Delete ${sel.k === 'p' ? `the dot at ${esc(String(st.points[sel.i]))}` : `the ${esc(nlJumpLabel(st.jumps[sel.i]))} jump`}`) : ''}${jm ? `${btn('chip', `data-act="nlundo" ${st.jumps.length ? '' : 'disabled'}`, '↶ Undo jump')}${btn('chip', `data-act="nlnew" ${from === null ? 'disabled' : ''}`, 'Start from a new number')}${btn('chip', `data-act="nlclearj" ${st.jumps.length || from !== null ? '' : 'disabled'}`, 'Clear jumps')}` : `${btn('chip', `data-act="nlundo" ${st.points.length ? '' : 'disabled'}`, '↶ Undo')}${btn('chip', `data-act="nlclearp" ${st.points.length ? '' : 'disabled'}`, 'Clear dots')}`}</div>` : ''}</div>`;
    },
    act: (st, d, e) => {
      if (d.act === 'nlsel') { const k = d.k === 'j' ? 'j' : 'p', i = +d.i; st.sel = st.sel && st.sel.k === k && st.sel.i === i ? null : { k, i }; return true; }
      if (d.act === 'nldel') {
        const sel = nlSel(st); st.sel = null; if (!sel) return true;
        if (sel.k === 'p') { st.points.splice(sel.i, 1); return true; }
        const [j] = st.jumps.splice(sel.i, 1); if (nlFrom(st) === j.b && !st.jumps.some(x => x.b === j.b)) st.jumpFrom = j.a; return true;
      }
      if (d.act && d.act.startsWith('nl')) st.sel = null;
      if (d.act === 'nlmode') { st.mode = d.m === 'jumps' ? 'jumps' : 'points'; return true; }
      if (d.act === 'nlundo') {
        if (st.mode === 'jumps') { const j = st.jumps.pop(); if (!j) return false; st.jumpFrom = j.a; return true; }
        if (!st.points.length) return false; st.points.pop(); return true;
      }
      if (d.act === 'nlnew') { st.jumpFrom = null; return true; }
      if (d.act === 'nlclearj') { st.jumps = []; st.jumpFrom = null; return true; }
      if (d.act === 'nlclearp') { st.points = []; return true; }
      const svg = e && e.target && e.target.closest && e.target.closest('svg.mp-nl'); if (!svg) return false;
      st.sel = null;
      const v = nlValue(st, svg, e.clientX);
      if (st.mode === 'jumps') {
        const from = nlFrom(st);
        if (from === null) { st.jumpFrom = v; return true; }
        if (v === from) return false;
        st.jumps.push({ a: from, b: v }); st.jumpFrom = v; return true;
      }
      st.points.push(v);
      return true;
    },
    boardTap: true,
  },

  'bar-models': {
    init: () => ({ bars: [{ name: 'Whole', segs: [{ label: 'Part A', value: 3, color: '#7CB342' }, { label: 'Part B', value: 2, color: '#AED581' }] }, { name: 'Compare', segs: [{ label: 'Red', value: 5, color: '#1E88E5' }] }, { name: 'Other', segs: [{ label: 'Blue', value: 3, color: '#FB8C00' }] }] }),
    total: st => `Longest bar ${Math.max(1, ...st.bars.map(b => b.segs.reduce((s, x) => s + x.value, 0)))}`,
    palette: () => [
      // A new part goes on the selected part's bar (else the first bar; a new bar when there is none).
      { label: 'Add a part', color: '#7CB342', run: s => { const p = barPick(s), b = s.bars[p ? p.b : 0]; if (b) b.segs.push({ label: 'Part', value: 1, color: '#C0CA33' }); else s.bars.push({ name: 'Whole', segs: [{ label: 'Part', value: 1, color: '#C0CA33' }] }); } },
      { label: 'Add a bar', color: '#1E88E5', run: s => { if (s.bars.length < 8) s.bars.push({ name: `Bar ${s.bars.length + 1}`, segs: [{ label: 'Value', value: 2, color: '#90CAF9' }] }); } },
      { label: 'Part-part-whole', color: '#7CB342', run: s => { s.bars = [{ name: 'Whole', segs: [{ label: 'Part', value: 4, color: '#7CB342' }, { label: 'Part', value: 4, color: '#AED581' }] }]; s.pick = null; } },
      { label: 'Comparison', color: '#FB8C00', run: s => { s.bars = [{ name: 'A', segs: [{ label: 'A', value: 6, color: '#1E88E5' }] }, { name: 'B', segs: [{ label: 'B', value: 4, color: '#FB8C00' }] }]; s.pick = null; } },
    ],
    hint: 'Tap a part\'s number to type its size, or use - and +. Type in a part to rename it. Tap a part to select it, then Delete removes it.',
    note: 'Part-part-whole, comparison and equal groups, for rates, ratios and word problems.',
    board: (st, view) => {
      const ro = !!view.readOnly, pick = ro ? null : barPick(st);
      if (!st.bars.length) return `<div class="mp-pad mp-bars"><p class="small muted">No bars yet. Use Add a bar.</p></div>`;
      const maxTotal = Math.max(1, ...st.bars.map(b => b.segs.reduce((s, x) => s + x.value, 0)));
      const ids = (bi, si) => `data-bar="${bi}" data-seg="${si}"`;
      return `<div class="mp-pad mp-bars">${st.bars.map((b, bi) => `<div><p class="mp-barname">${esc(b.name)} · total ${b.segs.some(x => x.hide) ? '?' : b.segs.reduce((s, x) => s + x.value, 0)}</p><div class="mp-bar">${b.segs.map((s, si) => {
        const on = !!pick && pick.b === bi && pick.s === si;
        // Tap the part (not its name, number or buttons) to select it; its Delete shows under the bar.
        return `<div class="mp-seg${segInk(s.color) === 'dark' ? ' lite' : ''}${on ? ' on' : ''}" ${ro ? '' : `data-act="segsel" ${ids(bi, si)}`} style="background:${esc(s.color)};width:${(s.value / maxTotal) * 100}%">
        <input class="mp-seglabel" ${ids(bi, si)} value="${esc(s.label)}" maxlength="30" aria-label="Part label in ${esc(b.name)}"${ro ? ' readonly tabindex="-1"' : ''}>
        <span class="mp-steps">${ro || s.hide ? `<b>${s.hide ? '?' : s.value}</b>` : `${btn('', `data-act="seg" ${ids(bi, si)} data-d="-1" aria-label="Make ${esc(s.label)} smaller"`, '−')}<input class="mp-segval" type="number" inputmode="decimal" min="0.5" max="${BAR_MAX}" step="any" ${ids(bi, si)} value="${s.value}" aria-label="Size of ${esc(s.label)}" enterkeyhint="done">${btn('', `data-act="seg" ${ids(bi, si)} data-d="1" aria-label="Make ${esc(s.label)} bigger"`, '+')}`}</span></div>`;
      }).join('')}</div>${pick && pick.b === bi ? `<div class="row mp-segact">${btn('chip mp-segdel', `data-act="segdel" aria-label="Delete the part ${esc(b.segs[pick.s].label)}"`, `🗑 Delete ${esc(b.segs[pick.s].label || 'the part')}`)}${btn('chip', 'data-act="segsel" data-bar="-1" aria-label="Keep the part"', 'Done')}</div>` : ''}</div>`).join('')}</div>`;
    },
    act: (st, d, e) => {
      if (d.act === 'seg') { const s = st.bars[+d.bar] && st.bars[+d.bar].segs[+d.seg]; if (!s) return false; s.value = barValue(s.value + +d.d); return true; }
      if (d.act === 'segsel') {
        // Typing in a part's name or number is not a tap on the part.
        if (e && e.target && e.target.closest && e.target.closest('input')) return false;
        const p = barPick(st), b = +d.bar, s = +d.seg;
        st.pick = !(st.bars[b] && st.bars[b].segs[s]) || (p && p.b === b && p.s === s) ? null : { b, s };
        return true;
      }
      if (d.act === 'segdel') {
        const p = barPick(st); if (!p) return false;
        // The bar's last part takes the bar with it.
        st.bars[p.b].segs.splice(p.s, 1); if (!st.bars[p.b].segs.length) st.bars.splice(p.b, 1);
        st.pick = null; return true;
      }
      return false;
    },
    input: (st, el) => { const s = st.bars[+el.dataset.bar] && st.bars[+el.dataset.bar].segs[+el.dataset.seg]; if (s) s.label = el.value.slice(0, 30); },
    // A part's typed size, when it is finished (Enter or leaving the field): clamped like - and +.
    commit: (st, el) => {
      const s = st.bars[+el.dataset.bar] && st.bars[+el.dataset.bar].segs[+el.dataset.seg]; if (!s) return false;
      const v = parseFloat(String(el.value).replace(',', '.'));
      if (!Number.isFinite(v)) { el.value = s.value; return false; }
      const nv = barValue(v); if (nv === s.value) { el.value = s.value; return false; }
      s.value = nv; return true;
    },
  },

  'xy-coordinate-board': {
    init: () => OBJECTS['xy-coordinate-board'][0].init(),
    total: st => { const n = xyShapes(st).length; return `${st.pts.length} points${n ? ` · ${n} closed ${n === 1 ? 'shape' : 'shapes'}` : ''}`; },
    palette: st => [...XY_COLORS.map(c => ({ label: COLOR_NAME[c], aria: `${COLOR_NAME[c]} points`, color: c, pressed: st.color === c, run: s => { s.color = c; } })),
      { label: st.connect ? 'Lines off' : 'Connect the points', color: '#212121', run: s => { s.connect = !s.connect; } },
      // The current color's line closed into a shape (a triangle, a rectangle): its closing side and a light fill.
      { label: 'Close the shape', aria: `Close the ${(COLOR_NAME[st.color] || 'current').toLowerCase()} shape`, color: st.color, run: s => {
        if (xyClose(s, s.color)) return undefined;
        toast(`Plot 3 points or more in ${(COLOR_NAME[s.color] || 'this color').toLowerCase()} first.`); return false;
      } },
      { label: 'Clear points', color: '#616161', run: s => { s.pts = []; s.shut = []; } }],
    settings: st => `${sel('four', [['', 'First quadrant'], ['1', 'All four quadrants']], st.four ? '1' : '', 'Quadrants')}${toggle('labels', st.labels, 'Labels on', 'Labels off')}${toggle('arrows', !!st.arrows, 'Line arrows on', 'Line arrows off')}${toggle('table', st.table !== false, 'Table on', 'Table off')}`,
    hint: 'Tap the grid to plot a point in the chosen color. Points of one color join into a line. Tap the first point again, or Close the shape, to make a shape; the next tap starts a new line. Drag a point to move just that point; drag a line to move all of it. Everything snaps to the grid.',
    note: 'Ordered pairs, lines and polygons, with a table of every point.',
    board: (st, view = {}) => {
      const S = XY_S, ro = !!view.readOnly, shapes = xyShapes(st);
      const shut = shapes.length ? `<p class="small mp-xyshut">${shapes.map(L => `<span><span class="mp-xydot" style="background:${esc(L.color)}"></span>${esc(COLOR_NAME[L.color] || 'A')} shape closed (${L.idx.length} points)</span>`).join(' ')}</p>` : '';
      return `<div class="mp-pad mp-xy"><svg class="mp-grid" ${ro ? '' : `data-xy="${esc(view.oid || '')}"`} width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Coordinate grid, tap to plot a point">${xySvgInner(st, ro)}</svg>
        ${st.ask || st.table === false ? '' : `<div class="mp-xytable"><p class="mp-barname">Table</p><table class="mp-table"><thead><tr><th>x</th><th>y</th><th>Point</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${st.pts.map((p, i) => `<tr><td><span class="mp-xydot" style="background:${esc(p.color)}"></span>${p.x}</td><td>${p.y}</td><td><b>(${p.x},${p.y})</b></td><td>${ro ? '' : btn('mp-x', `data-act="unpt" data-i="${i}" aria-label="Remove point ${p.x} ${p.y}"`, '✕')}</td></tr>`).join('')}</tbody></table>${st.pts.length ? shut : '<p class="small muted">No points yet. Tap the grid.</p>'}</div>`}</div>`;
    },
    act: (st, d, e) => {
      if (d.act === 'unpt') { st.pts.splice(+d.i, 1); return true; }
      // The tap that ends a drag of a point or a line plots nothing; nor does a tap on a point or a line.
      if (Date.now() - xyDragEnd < 300 || e.target.closest('[data-pt], [data-line]')) return false;
      const svg = e.target.closest('svg.mp-grid'); if (!svg) return false;
      const r = svg.getBoundingClientRect(), { lo, hi } = xyRange(st);
      const p = xySnap(lo + ((e.clientX - r.left) / r.width) * (hi - lo), lo + (1 - (e.clientY - r.top) / r.height) * (hi - lo), lo, hi);
      // A tap on a spot that has a point is a tap on that point (it may reach here as a tap on the grid): never a
      // second point there; the first point of the line being drawn closes it into a shape.
      const hit = st.pts.findIndex(q => q.x === p.x && q.y === p.y);
      if (hit >= 0) return xyTapPoint(st, hit);
      if (st.pts.length >= XY_MAX) return false;
      const ln = xyNextLn(st, st.color);
      st.pts.push({ ...p, color: st.color, ...(ln ? { ln } : {}) });
      return true;
    },
    onSet: (st, key) => { if (key === 'four') { st.pts = []; st.shut = []; } },
    boardTap: true,
    bind: (el, ctx) => bindGrids(el, ctx),
  },

  geoboard: {
    init: () => ({ board: 'square', band: [], bands: [], color: '#E53935', fill: true }),
    total: st => { const all = [...st.bands, ...(st.band.length > 1 ? [{ pts: st.band }] : [])]; return `Bands ${all.length} · Area about ${all.reduce((s, b) => s + area(b.pts), 0).toFixed(1)} square units`; },
    palette: st => [...XY_COLORS.map(c => ({ label: COLOR_NAME[c], aria: `${COLOR_NAME[c]} band`, color: c, pressed: st.color === c, run: s => { s.color = c; } })),
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
    hint: 'Drag near the middle for the red hour hand (it moves the time 5 minutes at a time) and near the edge for the blue minute hand (past 12 it carries the hour). Start the tracker, then move the time on: the yellow shows the minutes since the start, with a light ring for each full hour. Totals: off hides the digital time.',
    note: 'Add more clocks from the palette (each keeps its own time). The time tracker adds 15 minutes to the selected clock.',
    board: (st, view) => {
      const e = clockSector(st), oid = view.oid || '';
      if (st.q) return `<div class="mp-clockwrap q">${clockSvg(st, oid, true)}</div>`;   // a clock to read: its face only
      // Totals: off hides the digital time and the elapsed line, so students read the face.
      const digits = view.totals !== false;
      return `<div class="mp-clockwrap">${clockSvg(st, oid, view.readOnly)}<p class="mp-barname">${st.label ? `${esc(st.label)}${digits ? ' · ' : ''}` : ''}${digits ? `<span class="mp-hm">${hm(st)}</span>` : st.label ? '' : '&nbsp;'}</p>
        <p class="small mp-elapsed">${st.start && digits ? `Start ${hm(st.start)} · Elapsed <b>${e ? Math.floor(e.elapsed / 60) : 0} h ${e ? e.part : 0} min</b>` : '&nbsp;'}</p>
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
const clockLabel = c => { const e = clockSector(c); return `${c.q ? 'Clock: what time is it?' : `Clock showing ${hm(c)}`}${e ? `, ${e.elapsed} minutes since ${hm(c.start)}` : ''}`; };
/** One clock face. The yellow is the tracked time only (manip-board.js clockSector): one minute-hand sector from the
 *  start's minute to the current minute, clockwise, and a light full ring for each full hour ("+1 h"); none at zero. */
function clockSvg(c, oid, readOnly) {
  const cx = 110, cy = 110, ha = (((+c.h % 12) + (+c.m) / 60) * Math.PI) / 6 - Math.PI / 2, ma = ((+c.m) / 60) * 2 * Math.PI - Math.PI / 2;
  const ticks = Array.from({ length: 60 }, (_, i) => { const a = (i * Math.PI) / 30, big = i % 5 === 0; return `<line x1="${cx + (big ? 86 : 92) * Math.cos(a)}" y1="${cy + (big ? 86 : 92) * Math.sin(a)}" x2="${cx + 97 * Math.cos(a)}" y2="${cy + 97 * Math.sin(a)}" stroke="${big ? '#E53935' : 'var(--muted)'}" stroke-width="${big ? 3 : 1.5}"/>`; }).join('');
  const nums = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6 - Math.PI / 2; return `<text x="${cx + 72 * Math.cos(a)}" y="${cy + 72 * Math.sin(a) + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text)">${i || 12}</text>`; }).join('');
  const e = clockSector(c);
  // The "+1 h" sits where no hand is: of twelve spots around the middle, the one farthest from both hands (the bottom
  // when that is free; at :30 the minute hand covered it there).
  const away = (a, b) => { const d = Math.abs((((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)); return Math.min(d, 2 * Math.PI - d); };
  const spot = e && e.turns ? Array.from({ length: 12 }, (_, i) => Math.PI / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6)).reduce((best, a) => (Math.min(away(a, ha), away(a, ma)) > Math.min(away(best, ha), away(best, ma)) + 1e-6 ? a : best)) : 0;
  const ring = e && e.turns ? `<circle class="mp-cring" cx="${cx}" cy="${cy}" r="80" fill="#FFC91F" fill-opacity=".16"/><text class="mp-cturns" x="${round3(cx + 44 * Math.cos(spot))}" y="${round3(cy + 44 * Math.sin(spot) + 5)}" text-anchor="middle" font-size="15" font-weight="800" fill="var(--text)" pointer-events="none">+${e.turns} h</text>` : '';
  const a0 = e ? (e.from * Math.PI) / 180 - Math.PI / 2 : 0, a1 = e ? a0 + (e.sweep * Math.PI) / 180 : 0;
  const wedge = e && e.part ? `<path class="mp-csector" d="${pie(cx, cy, 80, a0, a1)}" fill="#FFC91F" fill-opacity=".45"/>` : '';
  return `<svg class="mp-clock" ${readOnly ? '' : `data-clock="${esc(oid)}"`} width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="${clockLabel(c)}">
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
    const set = (e, first = false) => {
      const o = ctx.find(svg.dataset.clock); if (!o) return;
      const { a } = at(e), c = o.st;
      if (hand === 'm') {
        // The minute hand is followed all the way round: past 12 clockwise is an hour later, back past 12 an hour
        // earlier (10:55 on to 11:05). The press itself only moves the minutes.
        const m = Math.round((a / (2 * Math.PI)) * 60) % 60;
        let d = m - (Math.round(+c.m) || 0);
        if (d > 30) d -= 60; else if (d < -30) d += 60;
        if (first) c.m = m; else if (d) Object.assign(c, addMinutes(c, d));
      } else {
        // The hour hand moves the time in 5-minute steps (the minute hand follows), the shorter way round.
        const t = (Math.round((a / (2 * Math.PI)) * 144) * 5) % 720, now = ((((Math.round(+c.h) || 0) % 12) + 12) % 12) * 60 + (Math.round(+c.m) || 0);
        let d = (((t - now) % 720) + 720) % 720; if (d > 360) d -= 720;
        if (d) Object.assign(c, addMinutes(c, d));
      }
      svg.innerHTML = clockSvg(c, o.id, false).replace(/^<svg[^>]*>|<\/svg>$/g, '');
      svg.setAttribute('aria-label', clockLabel(c));
      const t = svg.parentElement && svg.parentElement.querySelector('.mp-hm'); if (t) t.textContent = hm(c);
      if (ctx.live) ctx.live();
    };
    svg.addEventListener('pointerdown', e => { if (ctx.blocked && ctx.blocked()) return; e.stopPropagation(); before = ctx.before(); hand = at(e).dist < 58 ? 'h' : 'm'; svg.setPointerCapture(e.pointerId); set(e, true); });
    svg.addEventListener('pointermove', e => { if (hand) set(e); });
    const up = () => { if (!hand) return; hand = null; ctx.done(before); };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }
}

const XY_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'];
/** The names of the points' and bands' colors (a color button says which color it is). */
const COLOR_NAME = { '#E53935': 'Red', '#1E88E5': 'Blue', '#43A047': 'Green', '#FB8C00': 'Orange', '#8E24AA': 'Purple' };
const XY_S = 440, XY_MAX = 60;
let xyDragEnd = 0;
/** An arrowhead at (x, y) pointing along (dx, dy) (screen pixels), as a polygon's points. */
function arrowHead(x, y, dx, dy, size = 13) {
  const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, bx = x - ux * size, by = y - uy * size;
  return `${x},${y} ${bx - uy * size * 0.55},${by + ux * size * 0.55} ${bx + uy * size * 0.55},${by - ux * size * 0.55}`;
}
/** The grid's drawing: grid lines and numbers, the axes with their arrows and x and y, each color's line (with its end
 *  arrows when on) and the points on top. Points and lines carry their hit areas (a point's is bigger and on top, so a
 *  touch near a point takes the point). */
function xySvgInner(st, ro = false) {
  const S = XY_S, { lo, hi } = xyRange(st), px = v => ((v - lo) / (hi - lo)) * S, py = v => S - ((v - lo) / (hi - lo)) * S;
  const ticks = []; for (let v = lo; v <= hi; v++) ticks.push(v);
  const X0 = px(0), Y0 = py(0), A = 12;
  // The x axis's numbers sit under it; in the first quadrant the axis is the grid's bottom edge, so they go just above it.
  const xLabY = Y0 + 14 <= S - 2 ? Y0 + 14 : Y0 - 4;
  const axes = `<line x1="${X0}" y1="${A}" x2="${X0}" y2="${S - (lo < 0 ? A : 0)}" stroke="var(--text)" stroke-width="2"/><line x1="${lo < 0 ? A : 0}" y1="${Y0}" x2="${S - A}" y2="${Y0}" stroke="var(--text)" stroke-width="2"/>
    <polygon points="${arrowHead(S - 1, Y0, 1, 0, 12)}" fill="var(--text)"/><polygon points="${arrowHead(X0, 1, 0, -1, 12)}" fill="var(--text)"/>
    ${lo < 0 ? `<polygon points="${arrowHead(1, Y0, -1, 0, 12)}" fill="var(--text)"/><polygon points="${arrowHead(X0, S - 1, 0, 1, 12)}" fill="var(--text)"/>` : ''}
    <text x="${S - 16}" y="${Y0 - 12}" font-size="16" font-weight="800" font-style="italic" fill="var(--text)">x</text><text x="${X0 + 12}" y="${18}" font-size="16" font-weight="800" font-style="italic" fill="var(--text)">y</text>`;
  const lines = st.connect ? xyLines(st.pts, st.shut).map(L => {
    const P = L.idx.map(i => st.pts[i]), pts = P.map(p => `${px(p.x)},${py(p.y)}`).join(' ');
    // A closed shape: its closing side and a light fill in its color (no end arrows: a shape has no ends).
    if (L.closed) {
      const hit = ro ? '' : `<polygon class="mp-xyline" data-line="${esc(L.key)}" points="${pts}" fill="none" stroke="transparent" stroke-width="22" stroke-linejoin="round"><title>Drag to move the whole shape</title></polygon>`;
      return `<g class="mp-xyshape"><polygon points="${pts}" fill="${esc(L.color)}" fill-opacity=".16" stroke="${esc(L.color)}" stroke-width="3" stroke-linejoin="round"/>${hit}</g>`;
    }
    let ends = '';
    if (st.arrows) {
      const a = P[0], b = P[1], y = P[P.length - 2], z = P[P.length - 1];
      const tip = (p, q) => { const dx = px(p.x) - px(q.x), dy = py(p.y) - py(q.y), n = Math.hypot(dx, dy) || 1; return { x: px(p.x) + (dx / n) * 26, y: py(p.y) + (dy / n) * 26, dx, dy }; };
      const t1 = tip(a, b), t2 = tip(z, y);
      ends = `<line x1="${px(a.x)}" y1="${py(a.y)}" x2="${t1.x}" y2="${t1.y}" stroke="${esc(L.color)}" stroke-width="3"/><line x1="${px(z.x)}" y1="${py(z.y)}" x2="${t2.x}" y2="${t2.y}" stroke="${esc(L.color)}" stroke-width="3"/>
        <polygon points="${arrowHead(t1.x, t1.y, t1.dx, t1.dy)}" fill="${esc(L.color)}"/><polygon points="${arrowHead(t2.x, t2.y, t2.dx, t2.dy)}" fill="${esc(L.color)}"/>`;
    }
    const hit = ro ? '' : `<polyline class="mp-xyline" data-line="${esc(L.key)}" points="${pts}" fill="none" stroke="transparent" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><title>Drag to move the whole line</title></polyline>`;
    return `<g><polyline points="${pts}" fill="none" stroke="${esc(L.color)}" stroke-width="3" stroke-linejoin="round"/>${ends}${hit}</g>`;
  }).join('') : '';
  const dots = st.pts.map((p, i) => `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="8" fill="${esc(p.color)}" stroke="#fff" stroke-width="2"/>${st.labels ? `<text x="${px(p.x) + 11}" y="${py(p.y) - 8}" font-size="13" font-weight="700" fill="var(--text)" pointer-events="none">(${p.x},${p.y})</text>` : ''}`).join('');
  // The first point of the line being drawn (3 points or more, Lines on): a dashed ring, a tap there closes the shape.
  const open = !ro && st.connect ? xyOpenLine(st, st.color) : null, first = open ? st.pts[open.idx[0]] : null;
  const ring = first ? `<circle class="mp-xyfirst" cx="${px(first.x)}" cy="${py(first.y)}" r="13" fill="none" stroke="${esc(first.color)}" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none"/>` : '';
  const hits = ro ? '' : st.pts.map((p, i) => `<circle class="mp-xypt" data-pt="${i}" cx="${px(p.x)}" cy="${py(p.y)}" r="17" fill="transparent"><title>${open && open.idx[0] === i ? 'Tap to close the shape, or drag to move this point' : 'Drag to move this point'}</title></circle>`).join('');
  return `${ticks.map(v => `<line x1="${px(v)}" y1="0" x2="${px(v)}" y2="${S}" stroke="var(--line)" stroke-dasharray="2 4"/><line x1="0" y1="${py(v)}" x2="${S}" y2="${py(v)}" stroke="var(--line)" stroke-dasharray="2 4"/>${v && v !== hi ? `<text x="${px(v) + 3}" y="${xLabY}" font-size="11" fill="var(--muted)">${v}</text><text x="${X0 + 4}" y="${py(v) - 3}" font-size="11" fill="var(--muted)">${v}</text>` : ''}`).join('')}
    ${axes}${lines}${ring}${dots}${hits}`;
}
/** The grid's closed shapes (Lines on). */
const xyShapes = st => (st.connect ? xyLines(st.pts, st.shut).filter(L => L.closed) : []);
/** A tap on point i (not a drag): the first point of the current color's open line closes it into a shape (Lines on);
 *  any other point adds nothing. -> true when it changed the grid */
function xyTapPoint(st, i) {
  const L = st.connect ? xyOpenLine(st, st.color) : null;
  return !!L && L.idx[0] === i && xyClose(st, st.color);
}
/**
 * Dragging on a coordinate grid (solo and room): a point moves alone (its line reshapes to follow it); the line between
 * points moves the whole line with all its points, by whole grid steps, never off the grid. Both snap to grid points.
 * ctx: as bindClocks.
 */
function bindGrids(el, ctx) {
  for (const svg of el.querySelectorAll('svg[data-xy]')) {
    let d = null;
    const val = e => { const o = ctx.find(svg.dataset.xy), r = svg.getBoundingClientRect(), { lo, hi } = xyRange(o.st); return { x: lo + ((e.clientX - r.left) / r.width) * (hi - lo), y: lo + (1 - (e.clientY - r.top) / r.height) * (hi - lo) }; };
    svg.addEventListener('pointerdown', e => {
      if ((ctx.blocked && ctx.blocked()) || e.button > 0) return;
      const pt = e.target.closest('[data-pt]'), ln = !pt && e.target.closest('[data-line]'); if (!pt && !ln) return;
      const o = ctx.find(svg.dataset.xy); if (!o || o.st.q) return;
      e.stopPropagation(); e.preventDefault();
      const L = ln && xyLines(o.st.pts, o.st.shut).find(x => x.key === ln.dataset.line);
      d = { o, at: val(e), pts0: JSON.parse(JSON.stringify(o.st.pts)), i: pt ? +pt.dataset.pt : -1, idx: L ? L.idx : [], before: ctx.before(), moved: false, sx: e.clientX, sy: e.clientY };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true;
      const v = val(e), { lo, hi } = xyRange(d.o.st);
      if (d.i >= 0) { const p0 = d.pts0[d.i]; if (!p0) return; d.o.st.pts = d.pts0.map((p, i) => (i === d.i ? { ...p, ...xySnap(p0.x + v.x - d.at.x, p0.y + v.y - d.at.y, lo, hi) } : p)); }
      else d.o.st.pts = xyMoveLine(d.pts0, d.idx, v.x - d.at.x, v.y - d.at.y, lo, hi);
      svg.innerHTML = xySvgInner(d.o.st);
      svg.classList.add('dragging');
    });
    const up = e => {
      if (!d) return; const x = d; d = null; if (x.moved) xyDragEnd = Date.now();
      // A tap (no drag) on the first point of the line being drawn closes the shape (the room sees no click on a point).
      if (!x.moved && x.i >= 0) { if (e.type === 'pointerup' && xyTapPoint(x.o.st, x.i)) { xyDragEnd = Date.now(); svg.innerHTML = xySvgInner(x.o.st); ctx.done(x.before); } return; }
      svg.classList.remove('dragging');
      if (x.moved && JSON.stringify(x.pts0) !== JSON.stringify(x.o.st.pts)) ctx.done(x.before);
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }
}

// ---------------------------------------------------------------- fraction circles (the drawing and the drag)
const FC_C = 80, FC_R = 72;
let fcDragEnd = 0;
const fcColor = d => (FC_DENS.find(([x]) => x === d) || [0, '#90A4AE'])[1];
/** A piece of 1/d from the palette (manip-board.js fcAdd: the selected circle, else the first with room, else a new one). */
function fcAddPiece(s, d) {
  const r = fcAdd(s, d);
  if (!r) { toast(`A fraction set holds up to ${FC_MAX} circles. Add another fraction set.`); return false; }
  s.rings = false;
  if (r.diverted) toast(`That circle has no room for ${fracLabel(d, s.mode, '1')}, so it went into circle ${s.circles.indexOf(r.c) + 1}.`);
}
/** "1/2 + 1/4 + 1/4 = 1 whole": a circle's pieces as a sum (its label for screen readers). */
const fcSentence = (c, mode) => (c.ps.length ? `${c.ps.map(p => fracLabel(p.d, mode, '1')).join(' + ')} = ${fcCircleLabel(c, mode).replace(' ✓', '')}` : 'empty');
/** One piece's wedge (the whole piece: the full disk) from angle a0, with its label; selected: outlined and lifted out. */
function fcWedge(p, a0, ci, st, edit) {
  const a1 = a0 + (2 * Math.PI) / p.d, mid = (a0 + a1) / 2, on = edit && !!st.sel && st.sel.p === p.id;
  const dx = on && p.d > 1 ? 5 * Math.cos(mid) : 0, dy = on && p.d > 1 ? 5 * Math.sin(mid) : 0;
  const lab = fracLabel(p.d, st.mode, '1'), fs = p.d >= 10 ? 10.5 : p.d >= 6 ? 12.5 : 15, lr = p.d === 1 ? 0 : p.d === 2 ? FC_R * 0.5 : FC_R * 0.64;
  const shape = p.d === 1 ? `<circle cx="${FC_C}" cy="${FC_C}" r="${FC_R}"` : `<path d="${pie(FC_C, FC_C, FC_R, a0, a1)}"`;
  const attrs = edit ? ` data-act="fcsel" data-p="${esc(p.id)}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(`${lab} piece in circle ${ci + 1}${on ? ', selected' : ''}`)}"` : '';
  return `<g class="mp-fcp${on ? ' on' : ''}" transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})"${attrs}>${shape} fill="${fcColor(p.d)}" stroke="${on ? 'var(--text)' : 'var(--card)'}" stroke-width="${on ? 3.5 : 2}"/>`
    + `<text x="${(FC_C + lr * Math.cos(mid)).toFixed(1)}" y="${(FC_C + lr * Math.sin(mid) + fs * 0.36).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" class="mp-fclab">${esc(lab)}</text></g>`;
}
/** One circle: its outline (the part not yet covered), its pieces edge to edge from 12 o'clock going clockwise, and
 *  its sum under it ("3/4", "1 whole ✓"; none on a practice question, where it would give the answer away). */
function fcCircleHtml(c, ci, st, edit) {
  const on = edit && !!st.sel && st.sel.c === c.id, u = fcUsed(c), lab = fcCircleLabel(c, st.mode);
  let a = -Math.PI / 2, top = '';
  const wedges = c.ps.map(p => {
    const w = fcWedge(p, a, ci, st, edit);
    // The selected piece's outline again on top of its neighbors (drawn only: taps go to the piece itself).
    if (edit && st.sel && st.sel.p === p.id) top = w.replace(/^<g class="mp-fcp on"/, '<g class="mp-fcsel" aria-hidden="true"').replace(/ data-act="fcsel"[^>]*>/, '>').replace(/<text[\s\S]*<\/text>/, '').replace(/fill="[^"]*"/, 'fill="none"');
    a += (2 * Math.PI) / p.d; return w;
  });
  const bg = `<circle class="mp-fcbg" cx="${FC_C}" cy="${FC_C}" r="${FC_R}"${edit ? ` data-act="fcsel" data-c="${esc(c.id)}"` : ''}/>`;
  const ring = on ? `<circle class="mp-fcring" cx="${FC_C}" cy="${FC_C}" r="${FC_R + 5}"/>` : '';
  const sum = st.q ? '' : edit ? btn(`mp-fcsum${u === FC_WHOLE ? ' full' : ''}${on ? ' on' : ''}`, `data-act="fcsel" data-c="${esc(c.id)}" aria-pressed="${on}" aria-label="${esc(`Circle ${ci + 1}: ${fcSentence(c, st.mode)}. Select the circle`)}"`, esc(lab))
    : `<span class="mp-fcsum${u === FC_WHOLE ? ' full' : ''}">${esc(lab)}</span>`;
  return `<div class="mp-fcc${on ? ' on' : ''}" data-fcc="${esc(c.id)}"><svg class="mp-fcsvg" width="160" height="160" viewBox="0 0 160 160" role="group" aria-label="${esc(`Circle ${ci + 1}${st.q ? '' : `: ${fcSentence(c, st.mode)}`}`)}">${bg}${wedges.join('')}${top}${ring}</svg>${sum}</div>`;
}
/** A fraction set: its circles, three a row, and a footer with Delete for what is selected and a short tip. */
function fcBoardHtml(st, view) {
  const edit = !view.readOnly, cs = st.circles || [], any = cs.some(c => c.ps.length);
  const selP = edit && st.sel && st.sel.p ? fcFind(st, st.sel.p) : null, selC = edit && st.sel && st.sel.c ? cs.findIndex(c => c.id === st.sel.c) : -1;
  const del = selP ? btn('chip mp-fcdel', 'data-act="fcdel"', `🗑 Delete the ${esc(fracLabel(selP.c.ps[selP.i].d, st.mode, '1'))} piece`)
    : selC >= 0 ? btn('chip mp-fcdel', 'data-act="fcdel"', `🗑 Delete circle ${selC + 1}`) : '';
  const tip = !any ? 'Tap a piece in the palette to put it in a circle. Pieces fill a circle from the top, going clockwise.'
    : selP ? 'Drag it onto another circle to move it there.' : selC >= 0 ? 'New pieces go into this circle.' : 'Tap a piece to select it. Drag a piece onto another circle to move it.';
  const foot = st.q ? '' : `<div class="mp-fcfoot">${edit ? del : ''}<p class="${any ? 'mp-fctip small muted' : 'mp-empty'}">${esc(tip)}</p></div>`;
  return `<div class="mp-pad mp-fc"${edit ? ` data-fcset="${esc(view.oid || '')}"` : ''}><div class="mp-fcgrid">${cs.map((c, i) => fcCircleHtml(c, i, st, edit)).join('')}</div>${foot}</div>`;
}
/** The rings view: one ring for each size, all in one circle, so equal fractions end on the same line. */
function fcRingsHtml() {
  const R = FC_DENS.slice(1);
  return `<div class="mp-pad"><svg width="320" height="320" viewBox="0 0 320 320" role="img" aria-label="Fraction circle rings">${R.map(([d, c], ri) => Array.from({ length: d }, (_, i) => `<path d="${pie(160, 160, 150 - ri * 14, (i * 2 * Math.PI) / d - Math.PI / 2, ((i + 1) * 2 * Math.PI) / d - Math.PI / 2)}" fill="${c}" fill-opacity=".75" stroke="#fff" stroke-width="1.5"/>`).join('')).join('')}<circle cx="160" cy="160" r="22" fill="var(--card)" stroke="var(--line)"/></svg><p class="small muted">One ring for each denominator, so equal fractions line up.</p></div>`;
}
/**
 * Dragging a piece from one circle onto another (solo and room): a copy of the piece follows the pointer, the circle
 * under it shows whether the piece fits, and on release it moves there (or, dropped on the set's empty space, into a
 * new circle). A piece that would overfill the circle stays where it was. A press without a move is a tap (it selects).
 * ctx: as bindClocks.
 */
function bindFractionSets(el, ctx) {
  for (const pad of el.querySelectorAll('.mp-fc[data-fcset]')) {
    // Enter or Space on a focused piece selects it (an svg element has no click of its own for keys).
    pad.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof SVGElement && e.target.closest('[data-act]')) { e.preventDefault(); e.target.closest('[data-act]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
    pad.addEventListener('pointerdown', e => {
      const pe = e.target.closest('[data-p]'); if (!pe || e.button > 0 || (ctx.blocked && ctx.blocked())) return;
      const o = ctx.find(pad.dataset.fcset); if (!o || o.st.q) return;
      const f = fcFind(o.st, pe.dataset.p); if (!f) return;
      e.stopPropagation();
      const d = { o, pid: pe.dataset.p, piece: f.c.ps[f.i], sx: e.clientX, sy: e.clientY, on: false, ghost: null, over: null, before: ctx.before() };
      const target = (x, y) => {
        const hit = document.elementFromPoint(x, y), set = hit && hit.closest('.mp-fc[data-fcset]');
        const to = set && el.contains(set) ? ctx.find(set.dataset.fcset) : null; if (!to || to.st.q) return null;
        const ce = hit.closest('[data-fcc]'), c = ce ? (to.st.circles || []).find(x => x.id === ce.dataset.fcc) : null;
        const own = c && c.ps.some(p => p.id === d.pid) && to === d.o;
        return { to, el: ce, c, ok: own || (c ? fcFits(c, d.piece.d) : (to.st.circles || []).length < FC_MAX), own };
      };
      const move = ev => {
        if (!d.on && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
        if (!d.on) {
          d.on = true; pad.classList.add('dragging'); pe.classList.add('dragged');
          d.ghost = document.createElement('div'); d.ghost.className = 'mp-fcghost'; d.ghost.setAttribute('aria-hidden', 'true');
          const r = 34, a0 = -Math.PI / 2 - Math.PI / d.piece.d, a1 = a0 + (2 * Math.PI) / d.piece.d;
          d.ghost.innerHTML = `<svg width="84" height="84" viewBox="0 0 84 84">${d.piece.d === 1 ? `<circle cx="42" cy="42" r="${r}"` : `<path d="${pie(42, 50, r, a0, a1)}"`} fill="${fcColor(d.piece.d)}" stroke="var(--text)" stroke-width="2.5"/></svg>`;
          document.body.appendChild(d.ghost);
        }
        ev.preventDefault();
        d.ghost.style.left = `${ev.clientX - 42}px`; d.ghost.style.top = `${ev.clientY - 42}px`;
        const t = target(ev.clientX, ev.clientY);
        if (d.over && (!t || d.over !== t.el)) d.over.classList.remove('drop-ok', 'drop-no');
        d.over = t && t.el && !t.own ? t.el : null;
        if (d.over) { d.over.classList.toggle('drop-ok', t.ok); d.over.classList.toggle('drop-no', !t.ok); }
      };
      const up = ev => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (!d.on) return;
        fcDragEnd = Date.now(); pad.classList.remove('dragging'); pe.classList.remove('dragged');
        if (d.ghost) d.ghost.remove(); if (d.over) d.over.classList.remove('drop-ok', 'drop-no');
        const t = ev.type === 'pointerup' ? target(ev.clientX, ev.clientY) : null;
        if (!t || t.own) return;
        const r = fcMove(d.o.st, d.pid, t.to.st, t.c ? t.c.id : null);
        if (r === 'full') { toast(t.c ? `That circle has no room for ${fracLabel(d.piece.d, d.o.st.mode, '1')}.` : `A fraction set holds up to ${FC_MAX} circles.`); return; }
        if (r === 'moved') ctx.done(d.before);
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
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
    return { id: String(o.id || newId()), k: o.k, x: +o.x || 0, y: +o.y || 0, s: clamp(+o.s || 1, S_FLOOR, S_MAX), st: s2, ...(o.locked ? { locked: true, ...(o.lockBy === 't' ? { lockBy: 't' } : {}) } : {}) };
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
    texts: Array.isArray(ann.texts) ? ann.texts.slice(0, 30).map((n, i) => ({ id: String(n.id || `t${i}`), text: String(n.text || ''), x: +n.x || 0, y: +n.y || 0, ...textBoxFields(n) })) : [] };
  V.steps = stepsOf(o);   // the exercise's steps travel with the board (saves, share codes, pushes)
  V.stepAt = 0; V.stepsList = false;   // the steps card starts at step 1, its list closed
  const rest = { ...o }; delete rest.__ann; delete rest.__steps;
  V.st = normalize(V.tool.slug, V.impl, rest);
  if (V.impl.pieces) settleCharts(V.tool.slug, V.st, { trade: false, space: WORLD });   // blocks fit their chart's columns
  V.sel = null; V.osel = null; V.editing = null; V.hist = []; V.annHist = []; V.textEdit = null;
}
function pushHistory(snapshot) { V.hist.push(snapshot); if (V.hist.length > 40) V.hist.shift(); }
/** Every change to the tool's state: undo history, the board drawn again. */
function change(fn) {
  const before = JSON.stringify(V.st);
  const r = fn(V.st, V);
  if (r === false) return;
  settleBoard(V.tool.slug, V.st, V, WORLD);
  pushHistory(before);
  renderBoard(); renderChrome();
}
function setStatus(msg, bad = false) { const el = document.getElementById('mp-status'); if (el) { el.textContent = msg; el.classList.toggle('bad', !!bad); } }

function openTool(slug, { restore = null, boardId = null, title = '' } = {}) {
  clear();
  const tool = toolOf(slug); if (!tool) return home();
  V = { tool, boardId, title, impl: IMPL[slug], st: null, ann: { notes: [], strokes: [], texts: [] }, hist: [], annHist: [], sel: null, osel: null, annotate: false, annMode: 'pen', pen: PEN_COLORS[0], editing: null, draftOpen: false, tasksOpen: false, view: { x: 0, y: 0, z: 1 } };
  loadState(restore || newBoard(slug));
  ROOT.innerHTML = `<div class="mp-tool">
    <div class="mp-head"><a class="btn btn-sm" href="#">${esc(t('js.manip.nav.allTools'))}</a>
      <div class="mp-title"><h1>${toolIconHtml(tool.slug, { size: 40 })} ${esc(tool.name)}</h1><p class="small muted">${esc(CATS[tool.cat])} · ${esc(t('js.manip.grades', { grades: tool.grades }))}</p></div>
      ${howButton(tool)}
      <div class="mp-total" id="mp-total" aria-live="polite"></div></div>
    <div class="mp-work">
      <aside class="mp-side" aria-label="${esc(t('js.manip.side.label'))}">
        <div id="mp-palette"></div>
        <p class="mp-cap mp-cap-tools">${esc(t('js.manip.side.tools'))}</p><div class="mp-toolsrow" id="mp-toolsrow"></div>
      </aside>
      <div class="mp-main">
        <div id="mp-annbar"></div><div id="mp-steps"></div><div id="mp-draft"></div>
        <div id="mp-stepcard"></div>
        <div class="mp-board" id="mp-board" aria-label="${esc(t('js.manip.board.label', { tool: tool.name }))}">
          <div class="mp-world" id="mp-world" style="width:${WORLD.w}px;height:${WORLD.h}px">
            <div class="mp-content mp-abs" id="mp-content"></div>
            <svg class="mp-ink" id="mp-ink" viewBox="0 0 ${WORLD.w} ${WORLD.h}" aria-hidden="true"></svg>
            <div class="mp-texts" id="mp-texts"></div><div class="mp-notes" id="mp-notes"></div><div class="mp-ghost" id="mp-ghost" hidden></div>
          </div>
          <div class="mp-selbox" id="mp-selbox" hidden></div><div class="mp-selpill" id="mp-selpill" role="group" aria-live="polite" hidden></div>
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
  if (pendingDraftOpen) { pendingDraftOpen = false; V.draftOpen = true; }
  renderChrome(); renderBoard(); renderShare(); renderTasksBox();
  fit();
  window.scrollTo(0, 0);
  startAutosave();
  if (HOST) CHAT.attach(chatCtx());
}
// ---------------------------------------------------------------- "How it works": a short video per tool
/** The quiet "▶ How it works" button, for a tool with a video (manip-data.js TUTORIALS); '' otherwise. */
const howButton = tool => (tutorialOf(tool.slug) ? btn('btn btn-sm mp-howbtn', `data-how="${esc(tool.slug)}"`, `${iconHtml('▶️', { size: 18 })} ${esc(t('js.manip.how.button'))}`) : '');
/** The tool's video in the site's modal sheet (app.js sheet(): ✕, Escape and a tap outside close it, focus goes back
 *  to the button), with its poster and English captions on. */
function openHow(slug) {
  const tool = toolOf(slug), v = tutorialOf(slug); if (!tool || !v) return;
  const { el } = sheet({ title: t('js.manip.how.title', { tool: tool.name }), content: `<video class="mp-howvideo" controls playsinline preload="metadata" width="1280" height="720" poster="${esc(v.poster)}" aria-label="${esc(t('js.manip.how.video', { tool: tool.name }))}">
    <source src="${esc(v.mp4)}" type="video/mp4"><track kind="captions" src="${esc(v.vtt)}" srclang="en" label="English"></video>` });
  el.querySelector('.sheet').classList.add('mp-vsheet');
  // Captions on from the start (Safari ignores the default attribute on a track added with the page's HTML).
  const vid = el.querySelector('video'); if (vid && vid.textTracks[0]) vid.textTracks[0].mode = 'showing';
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-how]'); if (b && ROOT.contains(b)) { e.preventDefault(); openHow(b.dataset.how); } });

/** What Oomba (the companion, with this board's workflow: public/js/manip-chat.js) reads and changes: the open board, one change at a time (Undo too). */
const chatCtx = () => ({
  slug: V.tool.slug, name: V.tool.name, layout: () => V && fit(),
  get: () => ({ boardId: V.boardId, title: V.title, state: boardState(), empty: !(V.steps || []).length && !(V.st.pieces || []).length && V.st.objects.length <= 1 }),
  snapshot: () => ({ state: boardState(), title: V.title }),
  apply: (state, title) => { restoreInto(state); if (title) V.title = title; renderShare(); fit(); },
  restore: s => { restoreInto(s.state); V.title = s.title; renderShare(); fit(); },
});

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
    if (o && !o.st.q) for (const p of impl.palette(o.st)) out.push({ group: 'obj', label: p.label, aria: p.aria, adds: !!p.adds, color: p.color, pressed: p.pressed, run: s => { const x = (s.objects || []).find(q => q.id === o.id); return x ? p.run(x.st) : false; } });
  } else {
    for (const d of impl.defs(st)) { const nm = paletteName(slug, d); out.push({ group: 'piece', label: nm.aria, face: nm.face, text: nm.text, mini: d, round: roundPiece(slug, d.kind), adds: true, color: d.color, run: (s, v) => { const p = ctx.place(d); s.pieces.push(p); v.fresh = p.id; } }); }
    // Break is on a piece's wheel (hold it); Regroup, which takes ten pieces, stays here.
    if (BREAKS[slug]) out.push({ group: 'piece', label: 'Regroup 10 → 1', run: (s, v) => regroup(s, v, slug, ctx.space) });
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
    if (it.mini && SHAPES[it.mini.kind]) ghost.style.clipPath = SHAPES[it.mini.kind]; else if (it.mini && it.round) ghost.style.borderRadius = '50%';
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
/** A palette button's accessible name: a new object or a tool action by its own label ("Lines off", "Close the band",
 *  "Red points"), a new piece "Add <piece>" (add(label) words it: solo or room). */
const palAria = (p, add) => p.aria || (p.adds ? add(p.label) : p.label);
/** One palette button (solo and room): a mini piece with its value inside for pieces, a + for new objects, a color
 *  swatch for an object's actions. aria: its accessible name, or add(label) for the "Add ..." wording (palAria). */
function palButton(p, i, aria) {
  if (typeof aria === 'function') aria = palAria(p, aria);
  const mini = p.mini ? `<span class="mp-sw mp-swv" style="background:${esc(p.color)};${SHAPES[p.mini.kind] ? `clip-path:${SHAPES[p.mini.kind]};border-radius:0;` : p.round ? 'border-radius:50%;' : ''}">${esc(p.face || '')}</span>` : '';
  const lead = p.plus ? '<span class="mp-plus" aria-hidden="true">+</span>' : mini || (p.color ? `<span class="mp-sw" style="background:${esc(p.color)}"></span>` : '');
  const text = p.mini ? p.text : p.label;
  return btn(`mp-pal${p.hot ? ' hot' : ''}${p.plus ? ' add' : ''}${p.mini ? ' piece' : ''}`, `data-pal="${i}"${p.pressed ? ' aria-pressed="true"' : ''} aria-label="${esc(aria)}"`, `${lead}${text ? `<span>${esc(text)}</span>` : ''}`);
}
/** A chart column's foot: "Needs 10 to trade" while it holds fewer than ten blocks one place smaller; or, when its
 *  blocks are at their smallest, how many it holds. */
function pvFoot(c) {
  if (!c || !c.n) return '';
  if (c.waiting) return `<span class="mp-pvfoot">${esc(t('js.manip.pv.needTen'))}</span>`;
  if (c.cramped) return `<span class="mp-pvfoot" aria-label="${esc(t('js.manip.pv.count', { n: c.n, col: c.name }))}">×${c.n}</span>`;
  return '';
}
/** A piece tool's own mats: the place-value chart's columns, a frame's cells, a plain work mat. */
function matHtml(o, view = {}, cols = null) {
  if (o.k === 'answer') return answerHtml(o, view);
  if (o.k === 'frac-eq') return fracEqHtml(o, view);
  if (o.k === 'pv-chart') return `<div class="mp-pvchart">${(o.st.cols || []).map((c, i) => `<div><span class="mp-pvname">${esc(c)}</span>${pvFoot(cols && cols[i])}</div>`).join('')}</div>`;
  if (o.k === 'ten-frame' || o.k === 'five-frame') return `<div class="mp-frame">${'<div></div>'.repeat(o.k === 'five-frame' ? 5 : 10)}</div>`;
  if (o.k === 'double-ten-frame') return `<div class="mp-frame2"><div class="mp-frame">${'<div></div>'.repeat(10)}</div><div class="mp-frame">${'<div></div>'.repeat(10)}</div></div>`;
  if (o.k === 'ppw') return `<div class="mp-ppw"><div>${esc(t('js.manip.obj.whole'))}</div><div>${esc(t('js.manip.obj.part'))}</div><div>${esc(t('js.manip.obj.part'))}</div></div>`;
  return '<div class="mp-matin"></div>';
}
/** An answer box: "?" to type into (the student's own answer: private like their text). */
/** Its words wrap inside the box (a long answer: a corner drag makes the box wider or taller, never the words bigger;
 *  typing past the bottom grows the box: growAnswer). One line of words: Enter finishes, as in a field. */
const answerHtml = (o, view) => `<div class="mp-ansbox wrap${checkCls(o, view)}"><textarea class="mp-answer wrap" data-oid="${esc(o.id)}" rows="1" maxlength="${ANS.max}" placeholder="?" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="${esc(t('js.manip.obj.answer'))}"${view.readOnly ? ' readonly tabindex="-1"' : ''}>${esc(o.st.ans || '')}</textarea>${checkMark(o, view)}</div>`;
/**
 * An answer box whose words no longer fit grows taller to show them all (never past ANS.hMax or the space's bottom; past
 * that its words scroll, never clipped silently). ta: its textarea; o: its object; space: the board's or square's size.
 * -> true when the box grew
 */
function growAnswer(o, ta, space) {
  if (!ta || o.k !== 'answer') return false;
  const s = +o.s || 1, box = ta.closest('.mp-ansbox'), pad = box ? box.offsetHeight - ta.offsetHeight : 14;
  if (ta.scrollHeight <= ta.clientHeight + 1) return false;
  const need = Math.min(grownHeight(o.st, ta.scrollHeight + (ta.offsetHeight - ta.clientHeight) + pad), Math.floor((space.h - (+o.y || 0)) / s) - OBJ_HEAD);
  if (need <= answerSize(o.st).h - OBJ_HEAD) return false;
  o.st.h = need; sizeObjEl(ta.closest('.mp-obj'), o, answerSize(o.st));
  return true;
}
/** Every answer box drawn in el grown to show its whole answer (a long answer from a saved board or a push). */
function growAnswers(el, st, space) {
  for (const ta of el.querySelectorAll('textarea.mp-answer')) { const o = (st.objects || []).find(x => x.id === ta.dataset.oid); if (o) growAnswer(o, ta, space); }
}
/** An object's element drawn at size z (its natural size) and its scale, while it changes (a drag of its corner). */
function sizeObjEl(el, o, z) {
  if (!el) return; const s = +o.s || 1;
  el.style.width = `${Math.round(z.w * s)}px`; el.style.height = `${Math.round(z.h * s)}px`;
  const inn = el.querySelector('.mp-objin'); if (inn) { inn.style.width = `${z.w}px`; inn.style.height = `${z.h}px`; inn.style.transform = `scale(${s})`; }
}
/** After "Check my answers": ✓ (green) or "Try again" (soft orange) on a box. Never the right answer. */
const checkCls = (o, view) => (view.checked && o.id in view.checked ? (view.checked[o.id] ? ' ok' : ' again') : '');
const checkMark = (o, view) => (view.checked && o.id in view.checked ? `<span class="mp-checkmark" role="status">${view.checked[o.id] ? `${iconHtml('✓', { size: 18 })}<span class="sr-only"> ${esc(t('js.manip.check.right'))}</span>` : esc(t('js.manip.check.again'))}</span>` : '');
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
  return `<div class="mp-eq"><p class="mp-eqtext">${esc(st.text || '')}</p>${body}<div class="mp-ansbox${checkCls(o, view)}">${esc(t('js.manip.obj.answerIs'))} <input class="mp-answer" data-oid="${esc(o.id)}" maxlength="20" placeholder="?" autocomplete="off" value="${esc(st.ans || '')}" aria-label="${esc(t('js.manip.obj.answer'))}"${view.readOnly ? ' readonly tabindex="-1"' : ''}>${checkMark(o, view)}</div></div>`;
}
/** An object on the board: its handle bar (drag it, or the object's empty parts, to move it; hold it for its wheel:
 *  Lock or Unlock, Copy, Delete), its own board, a lock badge when locked, and when selected (and not locked) a corner
 *  to resize it (always in proportion). */
/** An object's own total (each clock its time, each frame or chart the pieces on it), never on a practice question. */
function objTotal(slug, impl, o, st) {
  if (!o.st || o.st.q || o.k === 'answer' || o.k === 'frac-eq') return '';
  if (o.k === slug) return impl.ownTotal ? '' : impl.total(o.st);   // a clock shows its time and elapsed time itself
  if (!UNDER.has(o.k) || !Array.isArray(st.pieces)) return '';
  const r = objRect(slug, o), on = st.pieces.filter(p => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
  return on.length ? impl.total({ ...st, pieces: on }) : '';
}
/** An object's name on its handle (a work mat: its label). */
function objName(slug, o) { const K = kindOf(slug, o.k); return o.k === 'mat' && o.st && o.st.label ? o.st.label : `${K ? K.name : ''}${o.st && o.st.label ? ` · ${o.st.label}` : ''}`; }
function objHtml(slug, impl, o, view, st = {}) {
  const K = kindOf(slug, o.k); if (!K) return '';
  // Selected: an outline; selected alone, also the corner that resizes it (never on one of many).
  const z = K.size(o.st), s = +o.s || 1, one = !view.readOnly && view.osel === o.id, on = one || (!view.readOnly && !!(view.many && view.many.o.has(o.id)));
  // A practice question is read-only (a clock to read is not a clock to set): its own controls are off for everyone.
  const inner = o.k === slug ? impl.board(o.st, { ...view, oid: o.id, readOnly: view.readOnly || !!o.st.q }) : matHtml(o, view, o.k === 'pv-chart' && impl.pieces ? chartInfo(slug, st, o) : null);
  const name = objName(slug, o);
  const key = view.showKeys && o.st && o.st.key ? `<span class="mp-key">${iconHtml('✓', { size: 18 })} ${esc(o.st.key)}</span>` : '';
  const tot = view.totals ? objTotal(slug, impl, o, st) : '';
  const bar = one && !o.locked ? `<span class="mp-oresize" data-oresize="${esc(o.id)}" role="img" aria-label="${esc(t('js.manip.obj.resize'))}"></span>` : '';
  const lock = o.locked ? `<span class="mp-olock" aria-hidden="true">${icon('lock')}</span>` : '';
  const head = o.locked ? t('js.manip.wheel.objLocked', { name }) : t('js.manip.obj.move', { name });
  return `<div class="mp-obj${on ? ' on' : ''}${o.locked ? ' locked' : ''}${UNDER.has(o.k) ? ' mp-mat' : ''}${view.fresh === o.id ? ' fresh' : ''} k-${esc(o.k)}" data-oid="${esc(o.id)}" style="left:${+o.x}px;top:${+o.y}px;width:${Math.round(z.w * s)}px;height:${Math.round(z.h * s)}px">
    <div class="mp-objin" style="width:${z.w}px;height:${z.h}px;transform:scale(${s})"><div class="mp-ohead"${view.readOnly ? '' : ' role="button" tabindex="0" aria-haspopup="menu"'} aria-label="${esc(head)}">${lock}<span class="mp-oname">⠿ ${esc(name)}</span>${tot ? `<span class="mp-otot">${esc(tot)}</span>` : ''}${key}</div><div class="mp-obody">${inner}</div></div>${bar}</div>`;
}
/** Everything on a board: objects (mats under the rest), then pieces. view: { sel, osel, many, readOnly }. */
function boardHtml(slug, impl, st, view) {
  const objs = [...(st.objects || [])].sort((a, b) => (UNDER.has(a.k) ? 0 : 1) - (UNDER.has(b.k) ? 0 : 1));
  // Blocks in a chart's column that do not belong there yet (waiting for ten to trade) are drawn a little softer.
  const pv = impl.pieces && objs.some(o => o.k === 'pv-chart') ? { ...view, slug, strays: strayIds(slug, st) } : { ...view, slug };
  return objs.map(o => objHtml(slug, impl, o, pv, st)).join('') + (st.pieces || []).map(p => pieceHtml(p, pv)).join('');
}

// ---------------------------------------------------------------- drawing the tool view
function renderChrome() {
  renderTotal();
  const slug = V.tool.slug, items = paletteFor(slug, V.impl, V.st, { osel: V.osel, region: viewRegion(), space: WORLD, max: OBJ_MAX, place: d => placePiece(V.st, d) });
  const o = target(slug, V.st, V.osel), K = o && kindOf(slug, o.k);
  const group = (g, cap) => { const l = items.map((p, i) => ({ p, i })).filter(x => x.p.group === g); return l.length ? `${cap ? `<p class="mp-cap">${esc(cap)}</p>` : ''}<div class="mp-palette">${l.map(({ p, i }) => palButton(p, i, label => t('js.manip.side.add', { label }))).join('')}</div>` : ''; };
  document.getElementById('mp-palette').innerHTML = group('add', t('js.manip.side.addCap')) + group('obj', K ? t('js.manip.side.forObj', { name: `${K.name}${o.st.label ? ` · ${o.st.label}` : ''}` }) : '') + group('piece', t('js.manip.side.objects'));
  document.getElementById('mp-toolsrow').innerHTML = [
    btn('mp-tbtn', `data-tool="undo"${V.hist.length ? '' : ' disabled'}`, `${iconHtml('↩', { size: 18 })} ${esc(t('js.manip.side.undo'))}`),
    btn(`mp-tbtn${V.annotate ? ' on' : ''}`, `data-tool="annotate" aria-pressed="${V.annotate}"`, `${iconHtml('✎', { size: 18 })} ${esc(t('js.manip.side.annotate'))}`),
    btn('mp-tbtn', `data-tool="note"${V.ann.notes.length >= NOTE_MAX ? ' disabled' : ''}`, `${iconHtml('🗒️', { size: 18 })} ${esc(t('js.manip.side.note'))}`),
    btn(`mp-tbtn${V.textMode ? ' on' : ''}`, `data-tool="text" aria-pressed="${!!V.textMode}"`, `<b class="mp-tglyph">T</b> ${esc(t('js.manip.side.text'))}`),
    HOST ? btn(`mp-tbtn${V.stepsOpen ? ' on' : ''}`, 'data-tool="steps"', `${iconHtml('📋', { size: 18 })} ${esc(t('js.manip.steps.title'))}${V.steps && V.steps.length ? ` (${V.steps.length})` : ''}`) : '',
    // While a draft runs on the server, the same button counts its time (and shows or hides its progress).
    HOST ? (draftLive() ? btn('mp-tbtn mp-busy', `data-tool="draft" aria-expanded="${!V.draftHidden}"`, `<span class="mp-dpulse" aria-hidden="true"></span> ${esc(t('js.manip.draft.drafting'))} <span id="mp-dtime">${mmss(draftElapsed())}</span>`)
      : btn(`mp-tbtn${V.draftOpen ? ' on' : ''}`, 'data-tool="draft"', `${iconHtml('✨', { size: 18 })} ${esc(t('js.manip.side.draft'))}`)) : '',
    HOST && V.st.objects.some(o => o.st && o.st.key) ? btn(`mp-tbtn${V.showKeys ? ' on' : ''}`, `data-tool="keys" aria-pressed="${!!V.showKeys}"`, `${iconHtml('✓', { size: 18 })} ${esc(t('js.manip.side.showAnswers'))}`) : '',
    V.st.objects.some(o => o.st && o.st.key) ? btn('mp-tbtn', 'data-tool="check"', `${iconHtml('☑', { size: 18 })} ${esc(t('js.manip.check.button'))}`) : '',
    btn('mp-tbtn', 'data-tool="reset"', esc(t('js.manip.side.reset'))),
  ].join('');
  const set = document.getElementById('mp-settings');
  const settings = objectTool(slug) ? (o && !o.st.q && V.impl.settings ? V.impl.settings(o.st) : '') : V.impl.settings ? V.impl.settings(V.st) : '';
  set.innerHTML = `${settings}${btn('chip', `data-view="totals" aria-pressed="${V.totals !== false}"`, esc(V.totals !== false ? t('js.manip.view.totalsOn') : t('js.manip.view.totalsOff')))}<p class="small muted mp-hint">${esc(hintOf(V.impl, objectTool(slug) ? o && o.st : V.st))}${V.impl.pieces ? ` ${esc(t('js.manip.board.pieceHint'))}` : ''}</p>`;
  renderAnnBar(); renderDraft(); renderSteps(); renderStepCard();
}
/** A tool's help text under its settings: a string, or a function of the state it describes (the number line's mode). */
const hintOf = (impl, st) => (typeof impl.hint === 'function' ? impl.hint(st || {}) : impl.hint) || '';
function renderTotal() {
  const el = document.getElementById('mp-total'); if (!el) return;
  const slug = V.tool.slug;
  // A board-wide total only where it means something: a piece tool with its pieces loose (money: with one mat at most).
  // Objects show their own totals.
  const mats = V.st.objects.filter(x => UNDER.has(x.k)).length;
  const practice = V.st.objects.some(x => x.st && (x.st.q || x.st.key));   // a practice board: no total gives an answer away
  // Totals: off hides it too (it hid only the objects' own totals; seen recording, 25 Nov 2026).
  el.textContent = V.totals !== false && !practice && !objectTool(slug) && (mats === 0 || (slug === 'money' && mats <= 1)) ? V.impl.total(V.st) : '';
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
  if (V.many) setMany(selKeep(V.st, V.many));   // what a trade, an undo or a delete took away leaves the selection
  content.innerHTML = boardHtml(slug, V.impl, V.st, { sel: V.sel, osel: V.osel, many: V.many, readOnly: false, snapped: V.snapped, showKeys: V.showKeys, totals: V.totals !== false, fresh: V.fresh, checked: V.checked, lifted: V.lifted, flipIn: V.flipIn, traded: V.traded });
  V.fresh = null; V.traded = null;
  // The hint only on a truly empty board, in the middle of the window (never on top of anything).
  const empty = !V.st.objects.length && !(V.st.pieces || []).length && !V.ann.notes.length && !V.ann.texts.length && !V.ann.strokes.length;
  let hint = board.querySelector('.mp-boardhint');
  if (empty && !hint) { hint = document.createElement('p'); hint.className = 'mp-boardhint'; hint.textContent = t('js.manip.board.emptyPieces'); board.appendChild(hint); }
  if (!empty && hint) hint.remove();
  if (V.impl.bind) V.impl.bind(content, bindCtx());
  growAnswers(content, V.st, WORLD);
  renderInk(); renderTexts(); renderNotes();
  const draw = document.getElementById('mp-draw');
  draw.innerHTML = V.annotate ? `<div class="mp-drawlayer" role="application" aria-label="${esc(t('js.manip.ann.surface'))}"></div>` : '';
  if (V.annotate) bindDraw(draw.firstChild);
  renderSelPill(); applyView(); keepInView();
}
// ---------------------------------------------------------------- many at once (owner, 25 Nov 2026: "click and drag your cursor to select a bunch of objects at once")
/** The selection as one set (a selection box, Shift+click): one thing is the usual single selection (V.sel or V.osel,
 *  its corner and wheel as before); two or more are V.many (an outline on each, the pill, moved together). */
function setMany(m) {
  const n = selCount(m);
  V.many = n > 1 ? m : null;
  if (n === 1) { V.sel = m.p.size ? [...m.p][0] : null; V.osel = m.o.size ? [...m.o][0] : null; } else { V.sel = null; V.osel = null; }
}
const curSel = () => V.many || { p: new Set(V.sel ? [V.sel] : []), o: new Set(V.osel ? [V.osel] : []) };
/** Shift+click: a piece (k 'p') or object ('o') joins the selection, or leaves it. Locked: nothing. */
function toggleSel(k, it) {
  if (it.locked) return;
  const m = curSel(), c = { p: new Set(m.p), o: new Set(m.o) };
  if (c[k].has(it.id)) c[k].delete(it.id); else c[k].add(it.id);
  setMany(c);
}
/** The floating pill over the board: "N selected", Delete, and ✕ to clear (shared with the room: s, its words). */
const selPillHtml = (n, s) => `<span class="mp-seln">${esc(s.count)}</span>${btn('chip mp-seldel', `data-seldel aria-label="${esc(s.delLabel)}"`, `🗑 ${esc(s.del)}`)}${btn('chip mp-selx', `data-selx aria-label="${esc(s.clear)}"`, '✕')}`;
function renderSelPill() {
  const el = document.getElementById('mp-selpill'); if (!el) return;
  const n = selCount(V.many); el.hidden = !n;
  el.innerHTML = n ? selPillHtml(n, { count: t('js.manip.sel.count', { n }), del: t('js.manip.sel.delete'), delLabel: t('js.manip.sel.deleteN', { n }), clear: t('js.manip.sel.clear') }) : '';
}
function clearMany() { if (!V.many) return; V.many = null; renderBoard(); renderChrome(); }
/** Delete everything selected: one Undo step (and an Undo on the toast). */
function deleteMany() {
  if (!V.many) return;
  const n = selCount(V.many);
  change((st, v) => { if (!selDelete(st, v.many)) return false; v.many = null; v.sel = null; v.osel = null; });
  const mark = V.hist.length;
  undoToast(t('js.manip.sel.deleted', { n }), t('js.manip.wheel.undo'), () => { if (V && V.hist.length === mark) toolButton('undo'); });
}
/** Keys over a board with many selected: Delete or Backspace deletes them, Escape lets go (never while typing). One
 *  listener for the page (the room has its own in public/js/manip-room.js). */
const typing = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
document.addEventListener('keydown', e => {
  if (!V || !V.many || !document.getElementById('mp-board') || typing(e.target) || wheelOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); clearMany(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteMany(); }
});
/** Space held (with a mouse over the board): a drag pans, wherever it starts. */
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !V || typing(e.target) || e.target.closest?.('button, a, [role="button"]:not(.mp-piece)')) return;
  const b = document.getElementById('mp-board'); if (!b || !(b.matches(':hover') || V.spaceDown)) return;
  e.preventDefault(); V.spaceDown = true; b.classList.add('mp-grab');
});
const letGo = () => { if (V) V.pressing = false; };
window.addEventListener('pointerup', letGo); window.addEventListener('pointercancel', letGo);
const spaceUp = () => { if (!V) return; V.spaceDown = false; document.getElementById('mp-board')?.classList.remove('mp-grab'); };
document.addEventListener('keyup', e => { if (e.code === 'Space') spaceUp(); });
window.addEventListener('blur', spaceUp);
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
}
function zoomAt(f, sx, sy) { const z = clamp(V.view.z * f, Z_MIN, Z_MAX), k = z / V.view.z; V.view = { x: sx - (sx - V.view.x) * k, y: sy - (sy - V.view.y) * k, z }; applyView(); }
/** The board's clear area on screen, in board pixels: the zoom pill (bottom left on a computer, top right on a phone)
 *  takes a strip off the bottom or the top, so Fit and keepInView never put anything under it (seen recording at
 *  1280x720: the pill sat on the number line's corner). -> { top, bottom, w, h } */
function clearArea() {
  const s = vpSize(), b = document.getElementById('mp-board'), z = document.getElementById('mp-zoom');
  let top = 0, bottom = s.h;
  if (b && z && z.offsetHeight) {
    const br = b.getBoundingClientRect(), zr = z.getBoundingClientRect();
    if (zr.top - br.top > s.h / 2) bottom = Math.max(s.h / 2, zr.top - br.top); else top = Math.min(s.h / 2, zr.bottom - br.top);
  }
  return { top, bottom, w: s.w, h: s.h };
}
/** Everything on the board in view (never bigger than life): the objects, pieces, notes, texts and marks. */
function fit() {
  const a = clearArea(), st = boardState(), ch = a.bottom - a.top;
  const marks = V.ann.strokes.flatMap(x => (x.pts || []).map(p => ({ x: p.x * WORLD.w, y: p.y * WORLD.h, w: 1, h: 1 })));
  const box = bbox([...boxesOf(V.tool.slug, st, WORLD), ...marks]) || { x: WORLD.w / 2 - 300, y: WORLD.h / 2 - 200, w: 600, h: 400 };
  const pad = 28, padY = a.top || a.bottom < a.h ? 12 : pad;   // beside the pill its own strip is the gap
  const z = clamp(Math.min((a.w - pad * 2) / box.w, (ch - padY * 2) / box.h), Z_MIN, 1);
  V.view = { z, x: (a.w - box.w * z) / 2 - box.x * z, y: a.top + (ch - box.h * z) / 2 - box.y * z };
  V.sizes = objSizes();
  applyView();
}
/** A copy just made (the .fresh piece or object) out of view: the view moves just enough to show it (as keepInView
 *  does for an object that grew), or fits when it is bigger than the screen. */
function showFresh() {
  const el = document.querySelector('#mp-content .mp-obj.fresh, #mp-content .mp-piece.fresh'), board = document.getElementById('mp-board'); if (!el || !board) return;
  const b = board.getBoundingClientRect(), r = el.getBoundingClientRect(), a = clearArea(), m = 12;
  if (r.width > a.w - 2 * m || r.height > a.bottom - a.top - 2 * m) { fit(); return; }
  const L = r.left - b.left, T = r.top - b.top, R = L + r.width, B = T + r.height;
  let dx = 0, dy = 0;
  if (R > a.w - m) dx = a.w - m - R; if (L + dx < m) dx = m - L;
  if (B > a.bottom - m) dy = a.bottom - m - B; if (T + dy < a.top + m) dy = a.top + m - T;
  if (dx || dy) { V.view = { ...V.view, x: V.view.x + dx, y: V.view.y + dy }; applyView(); }
}
/** Each object's size on the plane (what keepInView compares). */
const objSizes = () => new Map(V.st.objects.map(o => { const r = objRect(V.tool.slug, o); return [o.id, `${r.w}x${r.h}`]; }));
/**
 * An object that grew (the number line in Jumps is taller; an answer box with more lines) and now runs past the
 * board's bottom or right edge: the view moves just enough to show it again, or fits when it no longer fits at this
 * zoom. Only an object that was on screen, and never while a finger or the mouse is down on the board (V.pressing), so
 * the view never jumps under a drag; the sizes are taken again when the drag ends, so a resize never nudges either.
 */
function keepInView() {
  const prev = V.sizes || new Map(), now = objSizes(); V.sizes = now;
  if (V.pressing) return;
  const a = clearArea(), v = V.view, m = 12;
  let dx = 0, dy = 0, refit = false;
  for (const o of V.st.objects) {
    const was = prev.get(o.id); if (!was || was === now.get(o.id)) continue;
    const r = objRect(V.tool.slug, o), L = r.x * v.z + v.x, T = r.y * v.z + v.y, R = L + r.w * v.z, B = T + r.h * v.z;
    if (R < 0 || B < a.top || L > a.w || T > a.bottom) continue;   // not on screen: leave the view alone
    if (B > a.bottom - m) { if (r.h * v.z > a.bottom - a.top - 2 * m) refit = true; else dy = Math.min(dy, a.bottom - m - B, 0); dy = Math.max(dy, a.top + m - T); }
    if (R > a.w - m) { if (r.w * v.z > a.w - 2 * m) refit = true; else dx = Math.min(dx, a.w - m - R, 0); dx = Math.max(dx, m - L); }
  }
  if (refit) { fit(); return; }
  if (dx || dy) { V.view = { ...v, x: v.x + dx, y: v.y + dy }; applyView(); }
}

// ---------------------------------------------------------------- pieces in free spots, notes
/** A new piece from the palette: right after the last one added (manip-board.js nextPieceSpot), in the part of the
 *  board on screen; never on another piece or object. */
function placePiece(st, d) {
  // The last block's column when this one is worth the same, else the next free spot in view (never on a chart), else
  // the chart's column for its value (manip-pv.js paletteAdd; a live room's square places the same way).
  const r = paletteAdd(V.tool.slug, st, d, viewRegion(), V.lastAdd, mkPiece, WORLD);
  V.lastAdd = r.last;
  return r.p;
}
function noteHtml(n, i, readOnly) {
  if (!readOnly && V.editing === n.id) {
    return `<div class="mp-sticky editing" data-note="${esc(n.id)}" style="left:${n.x * 100}%;top:${n.y * 100}%"><label class="sr-only" for="nt-${esc(n.id)}">${esc(t('js.manip.note.text', { n: i + 1 }))}</label>
      <textarea id="nt-${esc(n.id)}" class="mp-notetext" rows="3" maxlength="300" placeholder="${esc(t('js.manip.note.placeholder'))}">${esc(n.text)}</textarea>
      <div class="row">${btn('mp-nbtn', `data-nact="done" data-id="${esc(n.id)}"`, esc(t('js.manip.note.done')))}${btn('mp-nbtn bad', `data-nact="delete" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.deleteN', { n: i + 1 }))}"`, esc(t('js.manip.note.delete')))}</div></div>`;
  }
  return `<div class="mp-sticky" data-note="${esc(n.id)}" role="group" aria-label="${esc(t('js.manip.note.label', { n: i + 1 }))}" style="left:${n.x * 100}%;top:${n.y * 100}%"><p>${n.text ? esc(n.text) : `<span class="mp-ph">${esc(t('js.manip.note.tap'))}</span>`}</p>
    ${readOnly ? '' : `<div class="row">${btn('mp-nbtn', `data-nact="edit" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.editN', { n: i + 1 }))}"`, `${iconHtml('✎', { size: 18 })} ${esc(t('js.manip.note.edit'))}`)}${btn('mp-nbtn bad', `data-nact="delete" data-id="${esc(n.id)}" aria-label="${esc(t('js.manip.note.deleteN', { n: i + 1 }))}"`, esc(t('js.manip.note.delete')))}</div>`}</div>`;
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
  const inp = box.querySelector('textarea.mp-textin'); if (inp) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
/** One text: the words in the theme's ink, or, while it is being written, a field in the same place with its ×. */
function textHtml(x, editing, readOnly = false) {
  return textBoxHtml(x, { editing: editing && !readOnly, ro: readOnly, del: 'data-tx', id: `tx-${x.id}`, label: t('js.manip.text.label'), ph: t('js.manip.text.ph'), delLabel: t('js.manip.text.delete') });
}
/** Everything in a space but one text, as rectangles (what a dropped text snaps to). */
const othersThan = (slug, b, space, id) => boxesOf(slug, { ...b, __ann: { ...(b.__ann || {}), notes: [], texts: ((b.__ann || {}).texts || []).filter(n => n.id !== id) } }, space);
function placeText(e) {
  if (V.textEdit) { commitText(); return; }
  textHist();
  const p = toWorld(e.clientX, e.clientY);
  const x = { id: `t${newId()}`, text: '', x: clamp(p.x / WORLD.w, 0, 0.98), y: clamp((p.y - 12) / WORLD.h, 0, 0.98) };
  V.ann.texts.push(x); V.textEdit = x.id; renderTexts();
}
function commitText() {
  const inp = document.querySelector('#mp-texts textarea.mp-textin'); const x = V.ann.texts.find(n => n.id === V.textEdit);
  if (x && inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200);
  V.ann.texts = V.ann.texts.filter(n => n.text.trim());
  V.textEdit = null; renderTexts();
}
/** Texts move with mouse or finger (anywhere on one that is not being written; by its grip while it is), snapping to
 *  things nearby when let go; a tap opens one to edit; its corner resizes it; A− and A+ change its size. */
function bindTexts() {
  const box = document.getElementById('mp-texts');
  let d = null;
  const others = id => othersThan(V.tool.slug, boardState(), WORLD, id);
  box.addEventListener('pointerdown', e => {
    const el = e.target.closest('.mp-text'); if (!el) return;
    const x = V.ann.texts.find(n => n.id === el.dataset.text); if (!x) return;
    if (el.classList.contains('editing')) {
      if (e.target.closest('.mp-textbar, [data-trz]')) V.textHold = Date.now();   // its own buttons keep it open
      textBoxPointer(e, { x, el, space: WORLD, zoom: () => V.view.z, others: () => others(x.id), start: textHist,
        // The click that ends a move or a resize of the open text is not a tap on the board (the room does the same).
        done: moved => { if (moved) { el.querySelector('textarea')?.focus({ preventScroll: true }); V.justMoved = true; } } });
      return;
    }
    d = { el, x, sx: e.clientX, sy: e.clientY, x0: x.x, y0: x.y, moved: false };
    el.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  });
  box.addEventListener('mousedown', e => { if (e.target.closest('.mp-text.editing .mp-textbar, .mp-text.editing [data-trz]')) e.preventDefault(); });   // the field keeps its focus
  box.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 6) return;
    if (!d.moved) { textHist(); d.el.classList.add('dragging'); }
    d.moved = true;
    d.x.x = clamp(d.x0 + (e.clientX - d.sx) / V.view.z / WORLD.w, 0, 0.99); d.x.y = clamp(d.y0 + (e.clientY - d.sy) / V.view.z / WORLD.h, 0, 0.99);
    d.el.style.left = `${d.x.x * 100}%`; d.el.style.top = `${d.x.y * 100}%`;
  });
  const up = () => {
    if (!d) return; const x = d; d = null; x.el.classList.remove('dragging');
    if (x.moved) { snapText(x.x, x.el, WORLD, others(x.x.id), SNAP_PX / V.view.z); V.justMoved = true; return; }
    if (V.textEdit) commitText(); V.textEdit = x.x.id; renderTexts();
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', () => { if (d) d.el.classList.remove('dragging'); d = null; });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-tsz]'); if (!b) return;
    const x = V.ann.texts.find(n => n.id === b.dataset.id); if (!x) return;
    const inp = box.querySelector('textarea.mp-textin'); if (inp) x.text = inp.value.replace(/\n+/g, ' ').slice(0, 200);
    textHist(); if (textSizeButton(x, +b.dataset.tsz)) renderTexts(); else V.hist.pop();
  });
  box.addEventListener('keydown', e => { if (e.target.matches('.mp-textin') && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); commitText(); } });
  box.addEventListener('focusout', e => { if (e.target.matches('.mp-textin')) setTimeout(() => { if (V && V.textEdit && !box.contains(document.activeElement) && !(Date.now() - (V.textHold || 0) < 700)) commitText(); }, 0); });
  box.addEventListener('input', e => {
    if (!e.target.matches('.mp-textin')) return;
    if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\n+/g, ' ');
    const x = V.ann.texts.find(n => n.id === V.textEdit); if (x) { x.text = e.target.value.slice(0, 200); growText(x, e.target, WORLD); }
  });
}
function renderAnnBar() {
  const el = document.getElementById('mp-annbar');
  el.innerHTML = V.annotate ? `<div class="mp-annbar" role="toolbar" aria-label="${esc(t('js.manip.ann.toolbar'))}">
    ${btn(`chip${V.annMode === 'pen' ? ' on' : ''}`, 'data-ann="pen"', `${iconHtml('✎', { size: 18 })} ${esc(t('js.manip.ann.pen'))}`)}
    ${PEN_COLORS.map(c => btn(`mp-pen${V.pen === c && V.annMode === 'pen' ? ' on' : ''}`, `data-ann="color" data-c="${c}" style="background:${c}" aria-label="${esc(t('js.manip.ann.color', { color: c }))}"`, '')).join('')}
    ${btn(`chip${V.annMode === 'erase' ? ' on' : ''}`, 'data-ann="erase"', `⌫ ${esc(t('js.manip.ann.eraser'))}`)}
    ${btn('chip', `data-ann="undo"${V.annHist.length ? '' : ' disabled'}`, `${iconHtml('↩', { size: 18 })} ${esc(t('js.manip.side.undo'))}`)}
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
  // A drag's end sets V.justMoved so the click that may follow it (same press) is not a tap. The board draws again on
  // pointerup and the dragged element is replaced, so Chrome often sends no click at all: the next press clears the
  // flag, so it never eats a later, real click (a bead, the pill's Delete; seen recording, 25 Nov 2026).
  root.addEventListener('pointerdown', () => { V.justMoved = false; }, true);
  root.addEventListener('keydown', () => { V.justMoved = false; }, true);
  root.addEventListener('click', e => {
    if (V.justMoved) { V.justMoved = false; if (e.target.closest('#mp-board')) return; }
    const vw = e.target.closest('[data-view]');
    if (vw && vw.dataset.view === 'totals') { V.totals = V.totals === false; renderBoard(); renderChrome(); return; }
    if (vw) { const s = vpSize(); if (vw.dataset.view === 'fit') fit(); else zoomAt(vw.dataset.view === 'in' ? 1.25 : 0.8, s.w / 2, s.h / 2); return; }
    if (V.textMode && e.target.closest('#mp-board') && !e.target.closest('.mp-text, .mp-sticky, .mp-zoom, button, input, select, textarea')) { placeText(e); return; }
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
    const tl = e.target.closest('[data-tool]');
    if (tl) return toolButton(tl.dataset.tool);
    if (e.target.closest('[data-seldel]')) return deleteMany();
    if (e.target.closest('[data-selx]')) return clearMany();
    const sc = e.target.closest('[data-sc]');
    if (sc) return stepCardButton(sc.dataset.sc);
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const k = tg.dataset.toggle; return change(st => { const s2 = settingsTarget(st); s2[k] = !s2[k]; }); }
    const an = e.target.closest('[data-ann]');
    if (an) return annButton(an.dataset.ann, an.dataset.c);
    const nb = e.target.closest('[data-nact]');
    if (nb) return noteButton(nb.dataset.nact, nb.dataset.id);
    const objEl = e.target.closest('#mp-content .mp-obj');
    const act = e.target.closest('#mp-content [data-act]');
    if (act && objEl) { change((st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; v.many = null; return V.impl.act(o.st, act.dataset, e); }); return; }
    if (V.impl.boardTap && objEl && e.target.closest('svg.mp-nl, svg.mp-grid')) { change((st, v) => { const o = st.objects.find(x => x.id === objEl.dataset.oid); if (!o || o.st.q) return false; v.osel = o.id; v.many = null; return V.impl.act(o.st, {}, e); }); return; }
  });
  root.addEventListener('change', e => {
    // A typed value inside an object (a bar model's part size), once it is finished.
    if (e.target.classList.contains('mp-segval') && V.impl.commit) {
      const objEl = e.target.closest('.mp-obj');
      change(st => { const o = objEl && st.objects.find(x => x.id === objEl.dataset.oid); return o && !o.st.q ? V.impl.commit(o.st, e.target) : false; });
      return;
    }
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
      if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\n+/g, ' ');
      o.st.ans = e.target.value.slice(0, ANS.max);
      growAnswer(o, e.target, WORLD);
      if (V.checked && o.id in V.checked) { delete V.checked[o.id]; const box = e.target.closest('.mp-ansbox'); box.classList.remove('ok', 'again'); box.querySelector('.mp-checkmark')?.remove(); }
      return;
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
    const s = snapFor([q], st.pieces, (st.objects || []).flatMap(o => slotsOf(slug, o)), snapT, snapOpts(slug));
    if (s && q.x + s.dx >= 0 && q.y + s.dy >= 0 && q.x + q.w + s.dx <= space.w && q.y + q.h + s.dy <= space.h) { q.x = Math.round(q.x + s.dx); q.y = Math.round(q.y + s.dy); }
    st.pieces.push(q);
    if (s && s.to) joinGroup(st.pieces, q, st.pieces.find(x => x.id === s.to));
    v.fresh = q.id; v.lastAdd = { id: q.id, runX: q.x }; return true;
  }
  if (item.plus) {
    if ((st.objects || []).length >= max) { toast(t('js.manip.obj.full', { n: max })); return false; }
    const k = kindsOf(slug).find(K => K.add === item.label); if (!k) return false;
    const z = k.size(k.init()), sc = Math.max(S_MIN, Math.min(1, (space.w - 8) / z.w, (space.h - 8) / z.h));
    const o = { id: newId(), k: k.k, x: Math.round(clamp(p.x - (z.w * sc) / 2, 0, space.w - z.w * sc)), y: Math.round(clamp(p.y - 15 * sc, 0, space.h - z.h * sc)), s: sc, st: k.init(), ...startLock(k.k) };   // a backdrop dragged in starts locked, as a tapped one does
    st.objects.push(o); v.fresh = o.id; return true;
  }
  return false;
}
/** What a setting changes: the selected object (object tools), else the board (a piece tool's settings). */
const settingsTarget = st => (objectTool(V.tool.slug) ? (target(V.tool.slug, st, V.osel) || {}).st : st);
function toolButton(k) {
  if (k === 'undo') {
    const prev = V.hist.pop(); if (!prev) return;
    if (typeof prev === 'object') V.ann.texts = JSON.parse(prev.texts); else { V.st = JSON.parse(prev); V.sel = null; V.many = null; }
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
  if (k === 'check') {
    // On the teacher's own board the answers are here already: checked in the page, with the same rules as the server.
    V.checked = {}; let right = 0, total = 0;
    for (const o of V.st.objects) if (o.st && o.st.key) { total++; const okay = answerMatches(o.st.key, o.st.ans, { simplest: !!o.st.simplest, over: o.k === 'frac-eq' && o.st.op === '=' ? +o.st.b || 0 : 0 }); V.checked[o.id] = okay; if (okay) right++; }
    renderBoard(); setStatus(t('js.manip.check.result', { right, total })); toast(t('js.manip.check.result', { right, total })); return;
  }
  if (k === 'draft') {
    if (draftLive()) { V.draftHidden = !V.draftHidden; renderChrome(); return; }
    // Draft with AI opens Oomba's chat: the first message is the brief, every later one adjusts the board.
    DJ.notice = null; DJ.fallback = null; renderDraft();
    CHAT.open(); return;
  }
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
// ---------------------------------------------------------------- the hold-to-edit wheel (public/js/manip-wheel.js)
/** Each piece tool's wheel, in ring order from the top (owner, 21 Nov 2026). Break shows only on a piece that breaks,
 *  Flip only on a piece with another side (an algebra tile's opposite, a +1/−1 counter) or the parallelogram. Tools not
 *  listed have no pieces. Locked: Unlock alone. */
const WHEEL = {
  'fraction-tiles': ['copy', 'fill', 'rotate', 'lock', 'delete'],
  'linking-cubes': ['copy', 'fill', 'rotate', 'lock', 'delete'],
  'pattern-blocks': ['copy', 'fill', 'flip', 'rotate', 'lock', 'delete'],
  'color-tiles': ['copy', 'fill', 'lock', 'delete'],
  'number-rods': ['copy', 'rotate', 'lock', 'delete'],
  'base-ten-blocks': ['break', 'copy', 'rotate', 'lock', 'delete'],
  'place-value-disks': ['break', 'copy', 'lock', 'delete'],
  'algebra-tiles': ['flip', 'rotate', 'copy', 'lock', 'delete'],
  money: ['copy', 'lock', 'delete'],
  'two-color-counters': ['flip', 'copy', 'lock', 'delete'],
};
/** How far Rotate turns: pattern blocks 30 degrees, every other piece a quarter turn (snapping keeps working). */
const TURN = { 'pattern-blocks': 30 };
/** A piece's other side: an algebra tile and its opposite, the yellow +1 and red −1 counter (the same size each). */
const OPPOSITE = { 'algebra-tiles': { one: 'mone', x: 'mx', x2: 'mx2', y: 'my' }, 'two-color-counters': { pos: 'neg' } };
const oppositeKind = (slug, kind) => { const m = OPPOSITE[slug]; return m ? m[kind] || Object.keys(m).find(k => m[k] === kind) || null : null; };
const canFlip = (slug, p) => (slug === 'pattern-blocks' ? p.kind === 'para' : !!oppositeKind(slug, p.kind));
/** Rotate and Flip keep the wheel open (turn again, flip back); every other action closes it. */
const KEEP_OPEN = new Set(['rotate', 'flip']);
/** The wheel's buttons for a piece. mayUnlock: false for a student holding a piece their teacher locked. */
function pieceWheel(slug, p, { mayUnlock = true } = {}) {
  if (p.locked) return mayUnlock ? ['unlock'] : [];
  return (WHEEL[slug] || []).filter(k => (k !== 'break' || !!(BREAKS[slug] && BREAKS[slug][p.kind])) && (k !== 'flip' || canFlip(slug, p)));
}
/** An object's wheel (frames, mats, charts, clocks, boards...): Lock, Copy, Delete; locked: Unlock alone. */
const objWheel = (o, { mayUnlock = true } = {}) => (o.locked ? (mayUnlock ? ['unlock'] : []) : ['lock', 'copy', 'delete']);
const WLABEL = { copy: () => t('js.manip.wheel.copy'), fill: () => t('js.manip.wheel.fill'), rotate: () => t('js.manip.wheel.rotate'), flip: () => t('js.manip.wheel.flip'),
  break: () => t('js.manip.wheel.break'), lock: () => t('js.manip.wheel.lock'), unlock: () => t('js.manip.wheel.unlock'), delete: () => t('js.manip.wheel.delete') };
const wheelItems = ks => ks.map(k => ({ k, label: WLABEL[k](), bad: k === 'delete' }));
/** Turn a piece over: an algebra tile becomes its opposite and a counter its other color (kind, color, label and value
 *  change; nothing is mirrored); the parallelogram's outline is drawn the other way. */
function flipPiece(slug, p) {
  if (slug === 'pattern-blocks') { if (p.kind !== 'para') return false; p.flipped = !p.flipped; return true; }
  const to = oppositeKind(slug, p.kind), d = to && allPieceDefs(slug).find(x => x.kind === to); if (!d) return false;
  Object.assign(p, { kind: d.kind, color: d.color, label: d.label, value: d.value });
  delete p.flipped;
  return true;
}
/** Holding a piece lifts it out of its snapped group: it leaves the group and moves about 8 px away from the rest (inside
 *  space). Locked pieces stay. -> false when there was nothing to lift */
function liftPiece(st, p, space) {
  const g = p.g; if (!g || p.locked) return false;
  const mates = st.pieces.filter(q => q.g === g && q !== p);
  separate(st, p);
  if (!mates.length) return true;
  const mid = q => { const b = pieceBox(q) || q; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  const a = mid(p), cx = mates.reduce((s2, q) => s2 + mid(q).x, 0) / mates.length, cy = mates.reduce((s2, q) => s2 + mid(q).y, 0) / mates.length;
  let dx = a.x - cx, dy = a.y - cy; const n = Math.hypot(dx, dy) || 1;
  dx = Math.round((dx / n) * 8); dy = Math.round((dy / n) * 8) || (dx ? 0 : 8);
  p.x = Math.round(clamp(p.x + dx, 0, space.w - p.w)); p.y = Math.round(clamp(p.y + dy, 0, space.h - p.h));
  return true;
}
/** A piece's actions (the wheel's; shared with the room): st, the action, the piece's id, the selection holder v, a spot
 *  for copies (place(p) -> { x, y }), the tool and the space pieces stay inside. -> false when nothing changed */
function pieceAction(st, k, id, v, place, slug = V && V.tool.slug, space = WORLD) {
  const p = st.pieces.find(x => x.id === id); if (!p) return false;
  if (p.locked && k !== 'unlock') return false;
  if (k === 'copy') {
    const c = place ? place(p) : { x: p.x + 24, y: p.y + 24 }; const q = { ...p, id: newId(), x: c.x, y: c.y, locked: false }; delete q.g; delete q.lockBy;
    // A copy of a block in a chart's column goes into the same column (never next door, where it would regroup).
    const home = columnHome(slug, st, p); if (home) placeAtHome(home, [q], space);
    st.pieces.push(q); v.fresh = q.id; v.sel = null;
  }
  else if (k === 'flip') return flipPiece(slug, p);
  else if (k === 'rotate') { p.rot = ((+p.rot || 0) + (TURN[slug] || 90)) % 360; separate(st, p); }
  else if (k === 'fill') p.filled = !p.filled;
  else if (k === 'lock') p.locked = true;
  else if (k === 'unlock') { p.locked = false; delete p.lockBy; }
  else if (k === 'lift') return liftPiece(st, p, space);
  else if (k === 'break') { v.sel = id; return breakPiece(st, v, slug, space); }
  else if (k === 'separate') separate(st, p);
  else if (k === 'delete') { st.pieces = st.pieces.filter(x => x.id !== id); separate(st, p); v.sel = null; }
  else return false;
  return true;
}
/** A piece leaves its snapped group (a group of one is no group; the rest regroups by what still touches). */
function separate(st, p) {
  const g = p.g; if (!g) return; delete p.g;
  // What is left falls apart where it no longer touches (a cube out of the middle of a stick: two sticks).
  splitGroup(st.pieces, g);
}
/** An object's actions (its wheel; shared with the room): Lock, Unlock, Copy (in the next free spot nearby, unlocked),
 *  Delete (never a locked one). -> false when nothing changed */
function objectAction(slug, st, k, id, v, region, space, max) {
  const o = (st.objects || []).find(x => x.id === id); if (!o) return false;
  if (k === 'unlock') { if (!o.locked) return false; delete o.locked; delete o.lockBy; return true; }
  if (o.locked) return false;
  if (k === 'lock') { o.locked = true; if (v.osel === id) v.osel = null; return true; }
  if (k === 'delete') { st.objects = st.objects.filter(x => x.id !== id); v.osel = null; return true; }
  if (k === 'copy') {
    if (st.objects.length >= max) { toast(t('js.manip.obj.full', { n: max })); return false; }
    // Beside or under the original in view; else a free spot in view; else beside it anywhere (the page shows it).
    const r = objRect(slug, o), at = nearSpot(boxesOf(slug, st, space), r, region, space, { gap: 24, order: 'right' });
    const c = { ...JSON.parse(JSON.stringify(o)), id: newId(), x: clamp(at.x, 0, space.w - r.w), y: clamp(at.y, 0, space.h - r.h) };
    delete c.locked; delete c.lockBy;
    st.objects.push(c); v.fresh = c.id; return true;
  }
  return false;
}
/** Run a wheel action that animates or can be undone, the same way on the solo board and in the room.
 *  ctx: { slug, id, k, el() the piece's element now, apply(fn) a change, label, undo(), mark() } */
function wheelRun(ctx) {
  const { k } = ctx;
  if (k === 'flip' && ctx.slug !== 'pattern-blocks') {
    // The counter (or tile) squeezes to nothing, turns over, and opens out again: its label is never mirrored.
    const face = ctx.el() && ctx.el().querySelector('.mp-face');
    if (face) face.classList.add('flipout');
    setTimeout(() => ctx.apply(true), face ? 140 : 0);
    return;
  }
  ctx.apply(false);
  if (k === 'delete') { const m = ctx.mark(); undoToast(t('js.manip.wheel.deleted', { label: ctx.label }), t('js.manip.wheel.undo'), () => { if (ctx.mark() === m) ctx.undo(); }); }
  if (k === 'lock') toast(t('js.manip.wheel.lockedHint'));
  if (!KEEP_OPEN.has(k)) closeWheel({ focus: k !== 'delete' && k !== 'break' });
}
const pieceElOf = id => document.querySelector(`#mp-content .mp-piece[data-pid="${CSS.escape(id)}"]`);
const objElOf = id => document.querySelector(`#mp-content .mp-obj[data-oid="${CSS.escape(id)}"]`);
/** Open a piece's wheel on the solo board at a screen point: the piece lifts out of its group first (holding always
 *  separates; drag it back to rejoin). */
function soloPieceMenu(id, x, y, keyboard = false) {
  const slug = V.tool.slug;
  if (!V.st.pieces.some(q => q.id === id)) return;
  V.many = null;
  change((st, v) => pieceAction(st, 'lift', id, v, null, slug, WORLD));
  const p = V.st.pieces.find(q => q.id === id);
  V.sel = id; V.osel = null; V.lifted = p.locked ? null : id;
  renderBoard(); renderChrome();
  openWheel({ x, y, keyboard, items: wheelItems(pieceWheel(slug, p)), label: t('js.manip.wheel.menu', { label: p.label }), focusBack: () => pieceElOf(id),
    onClose: () => { if (V && V.lifted === id) { V.lifted = null; pieceElOf(id)?.classList.remove('lifted'); } },
    onPick: k => {
      const q = V.st.pieces.find(x => x.id === id); if (!q) return closeWheel();
      wheelRun({ k, slug, label: q.label, el: () => pieceElOf(id), mark: () => V.hist.length, undo: () => toolButton('undo'),
        apply: flip => { if (flip) V.flipIn = id; change((st, v) => pieceAction(st, k, id, v, pp => nearSpot(boxesOf(slug, { ...st, __ann: V.ann }, WORLD), pp, viewRegion(), WORLD), slug, WORLD)); V.flipIn = null; if (k === 'copy') showFresh(); } });
    } });
}
/** Open an object's wheel on the solo board. */
function soloObjMenu(id, x, y, keyboard = false) {
  const slug = V.tool.slug, o = V.st.objects.find(q => q.id === id); if (!o) return;
  V.osel = o.locked ? null : id; V.sel = null; V.many = null; renderBoard(); renderChrome();
  openWheel({ x, y, keyboard, items: wheelItems(objWheel(o)), label: t('js.manip.wheel.menu', { label: objName(slug, o) }), focusBack: () => objElOf(id)?.querySelector('.mp-ohead'),
    onPick: k => wheelRun({ k, slug, label: objName(slug, o), el: () => null, mark: () => V.hist.length, undo: () => toolButton('undo'),
      apply: () => { change((st, v) => objectAction(slug, st, k, id, v, viewRegion(), WORLD, OBJ_MAX)); if (k === 'copy') showFresh(); } }) });
}
/** What opens a wheel from the keyboard on a focused piece or object handle: Shift+F10, the ContextMenu key, Enter. */
const wheelKey = e => e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey) || (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey);

/** What an object takes along when it is dragged: an unlocked frame the counters in its cells (owner, 21 Nov 2026), a
 *  place-value chart the blocks in its columns. Shared with the room. */
const carried = (slug, o, pieces) => (FRAMES.has(o.k) ? seatedIn(slug, o, pieces) : o.k === 'pv-chart' ? inChart(slug, o, pieces) : []);
/** The selection box on screen, from (x0, y0) to (x1, y1) (screen points), inside its board element; null hides it. */
function drawSelBox(el, host, a) {
  if (!el) return; el.hidden = !a; if (!a) return;
  const r = host.getBoundingClientRect();
  Object.assign(el.style, { left: `${Math.min(a.x0, a.x1) - r.left}px`, top: `${Math.min(a.y0, a.y1) - r.top}px`, width: `${Math.abs(a.x1 - a.x0)}px`, height: `${Math.abs(a.y1 - a.y0)}px` });
}
/** The wheel over a board: Ctrl or Cmd (and a trackpad's pinch) zooms at the pointer; otherwise it pans (a trackpad's
 *  two-finger scroll, a mouse wheel; Shift turns a mouse wheel sideways). -> { zoom } or { dx, dy } in screen pixels */
function wheelMove(e, page) {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? page : 1;
  if (e.ctrlKey || e.metaKey) return { zoom: Math.exp(-e.deltaY * k * 0.01) };
  return e.shiftKey && !e.deltaX ? { dx: -e.deltaY * k, dy: 0 } : { dx: -e.deltaX * k, dy: -e.deltaY * k };
}
/** The plane's pointer work (docs/decisions.md "Manipulatives: a selection box"). With a mouse or pen, a drag on empty
 *  space draws a selection box (Shift adds to what is selected); Space held or the middle button pans; the wheel pans
 *  (Ctrl or Cmd zooms). With a finger, a drag on empty space pans, a hold there (450 ms) and then a drag draws the box,
 *  two fingers pinch. On a piece or an object: a tap selects it (Shift+click adds or removes it); a drag of 10 px moves
 *  it (a piece with its group; a frame with the counters in its cells; one of many selected: all of them); a hold opens
 *  its wheel (a piece lifted out of its group first; sliding on after that drags just that piece); right-click opens the
 *  wheel at once. Locked: no drag (a small shake). */
function bindPlane() {
  const board = document.getElementById('mp-board'), pointers = new Map();
  let g = null;
  const ghost = () => document.getElementById('mp-ghost');
  const selBox = a => drawSelBox(document.getElementById('mp-selbox'), board, a);
  // A selection box from here; on a locked backdrop's body (o), a hold still opens its wheel.
  const boxFrom = (e, o = null) => {
    const gg = g = { kind: 'box', sx: e.clientX, sy: e.clientY, moved: false, add: e.shiftKey };
    if (o) gg.hold = startHold(e.clientX, e.clientY, () => { if (g !== gg || gg.moved) return; gg.held = true; soloObjMenu(o.id, gg.sx, gg.sy); });
    board.setPointerCapture(e.pointerId);
  };
  // A finger or the mouse down on the board: keepInView waits (the board's own pointerup runs first, then this one).
  board.addEventListener('pointerdown', () => { V.pressing = true; }, true);
  board.addEventListener('contextmenu', e => { if (e.target.closest('.mp-piece, .mp-obj')) e.preventDefault(); });
  board.addEventListener('keydown', e => {
    if (e.target.matches('textarea.mp-answer') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }   // one line of words: Enter finishes
    if (!wheelKey(e)) return;
    const pe = e.target.closest('.mp-piece'), oh = !pe && e.target.closest('.mp-ohead'); if (!pe && !oh) return;
    e.preventDefault();
    const r = (pe || oh).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (pe) soloPieceMenu(pe.dataset.pid, x, y, true); else soloObjMenu(oh.closest('.mp-obj').dataset.oid, x, y, true);
  });
  board.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      if (g && g.kind !== 'pan') { cancel(); } else if (g && g.hold) g.hold.cancel();
      const [a, b] = [...pointers.values()]; g = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return;
    }
    if (e.target.closest('.mp-zoom, .mp-selpill, .mp-drawlayer, .mp-sticky, .mp-text, button, input, select, textarea, a')) return;
    const mouse = e.pointerType !== 'touch';
    // Space held, or the middle button: a mouse pans from anywhere.
    if (e.button === 1 || (mouse && V.spaceDown && e.button === 0)) { e.preventDefault(); g = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: V.view.x, y0: V.view.y, moved: false, grab: true }; board.setPointerCapture(e.pointerId); return; }
    if (V.textMode) return;
    const rz = e.target.closest('[data-oresize]');
    if (rz) { const o = V.st.objects.find(x => x.id === rz.dataset.oresize); if (o && !o.locked) { const z = objSize(V.tool.slug, o); g = { kind: 'resize', o, nat: z, s0: o.s, st0: JSON.stringify(o.st), sx: e.clientX, sy: e.clientY, before: JSON.stringify(V.st), el: rz.closest('.mp-obj') }; board.setPointerCapture(e.pointerId); e.preventDefault(); } return; }
    const pieceEl = e.target.closest('.mp-piece');
    if (pieceEl) {
      const p = V.st.pieces.find(x => x.id === pieceEl.dataset.pid); if (!p) return;
      e.preventDefault();
      if (e.button === 2) { soloPieceMenu(p.id, e.clientX, e.clientY); return; }
      if (e.button > 0) return;
      const gg = g = { kind: 'piece', p, el: pieceEl, sx: e.clientX, sy: e.clientY, moved: false, held: false, before: JSON.stringify(V.st), shift: e.shiftKey, many: !e.shiftKey && !!V.many && V.many.p.has(p.id) };
      gg.hold = startHold(e.clientX, e.clientY, () => { if (g !== gg || gg.moved) return; gg.held = true; soloPieceMenu(p.id, gg.sx, gg.sy); });
      board.setPointerCapture(e.pointerId); return;
    }
    const objEl = e.target.closest('.mp-obj');
    if (objEl) {
      if (e.target.closest('[data-act], svg.mp-nl, svg.mp-grid, svg[data-clock], .mp-peg, .mp-seglabel, .mp-segval, .mp-bead, .mp-cell, .mp-answer')) return;   // the object's own work
      const o = V.st.objects.find(x => x.id === objEl.dataset.oid); if (!o) return;
      e.preventDefault();
      if (e.button === 2) { soloObjMenu(o.id, e.clientX, e.clientY); return; }
      if (e.button > 0) return;
      // A locked backdrop's body is the board under the pieces for a mouse: a drag there draws the selection box.
      if (o.locked && mouse && !e.target.closest('.mp-ohead')) return boxFrom(e, o);
      const gg = g = { kind: 'obj', o, el: objEl, head: !!e.target.closest('.mp-ohead'), x0: o.x, y0: o.y, sx: e.clientX, sy: e.clientY, moved: false, held: false, before: JSON.stringify(V.st), shift: e.shiftKey, many: !e.shiftKey && !!V.many && V.many.o.has(o.id) };
      gg.hold = startHold(e.clientX, e.clientY, () => { if (g !== gg || gg.moved) return; gg.held = true; soloObjMenu(o.id, gg.sx, gg.sy); });
      board.setPointerCapture(e.pointerId); return;
    }
    if (mouse) { if (e.button === 0) boxFrom(e); return; }
    // A finger pans; held still for a moment first, it draws the selection box instead.
    const gg = g = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: V.view.x, y0: V.view.y, moved: false };
    gg.hold = startHold(e.clientX, e.clientY, () => { if (g !== gg || gg.moved) return; g = { kind: 'box', sx: gg.sx, sy: gg.sy, moved: false, add: false }; });
    board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g || g.kind === 'dead') return;
    if (g.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = board.getBoundingClientRect();
      V.view.x += cx - g.cx; V.view.y += cy - g.cy; zoomAt(d / (g.d || d), cx - r.left, cy - r.top); Object.assign(g, { d, cx, cy }); return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    const slug = V.tool.slug;
    if (g.kind === 'box') {
      if (g.held || (!g.moved && Math.abs(dx) + Math.abs(dy) < 5)) return;
      if (g.hold) g.hold.cancel();
      g.moved = true; g.ex = e.clientX; g.ey = e.clientY; selBox({ x0: g.sx, y0: g.sy, x1: g.ex, y1: g.ey }); return;
    }
    if ((g.kind === 'piece' || g.kind === 'obj') && !g.moved) {
      // A piece or object starts to move after 10 px; before that it may still become a hold.
      if (Math.hypot(dx, dy) < SLOP) return;
      g.hold.cancel();
      // A locked chart, grid or mat dragged by its body pans the board (backdrops start locked and can fill a phone's
      // screen); by its handle bar, or a locked piece: a small shake.
      if (g.kind === 'obj' && g.o.locked && !g.held && !g.head) { g = { kind: 'pan', sx: g.sx, sy: g.sy, x0: V.view.x, y0: V.view.y, moved: true }; V.view.x = g.x0 + dx; V.view.y = g.y0 + dy; applyView(); return; }
      if (g.kind === 'piece' ? g.p.locked : g.o.locked) { if (!g.held) shake(g.kind === 'piece' ? pieceElOf(g.p.id) : objElOf(g.o.id)); g = { kind: 'dead' }; return; }
      if (g.held) { closeWheel({ focus: false }); g.before = JSON.stringify(V.st); }
      // One of many selected: all of them move (and what their frames carry), no snapping.
      if (g.many && !g.held) g.list = selMoving(slug, V.st, V.many, o => carried(slug, o, V.st.pieces)).map(x => ({ ...x, el: x.obj ? objElOf(x.it.id) : pieceElOf(x.it.id) }));
      else if (g.kind === 'piece') {
        // Held first (it is out of its group now), or counters (they never link): just this piece.
        const members = g.held || !linksPieces(slug) ? [g.p] : groupOf(V.st.pieces, g.p);
        g.members = members.map(m => ({ m, x0: m.x, y0: m.y, el: pieceElOf(m.id) }));
      } else {
        g.el = objElOf(g.o.id) || g.el; g.x0 = g.o.x; g.y0 = g.o.y;
        // An unlocked frame takes the counters seated in its cells along (owner, 21 Nov 2026).
        g.carry = carried(slug, g.o, V.st.pieces).map(m => ({ m, x0: m.x, y0: m.y, el: pieceElOf(m.id) }));
      }
      g.moved = true;
    }
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    g.moved = true;
    const z = V.view.z;
    if (g.kind === 'pan') { if (g.hold) { g.hold.cancel(); g.hold = null; } V.view.x = g.x0 + dx; V.view.y = g.y0 + dy; applyView(); return; }
    if (g.list) {
      selMove(g.list, dx / z, dy / z, WORLD);
      for (const x of g.list) if (x.el) { x.el.style.left = `${x.it.x}px`; x.el.style.top = `${x.it.y}px`; if (!x.obj) x.el.classList.add('dragging'); }
      return;
    }
    if (g.kind === 'obj') {
      const r = objRect(slug, g.o);
      g.o.x = Math.round(clamp(g.x0 + dx / z, 0, WORLD.w - r.w)); g.o.y = Math.round(clamp(g.y0 + dy / z, 0, WORLD.h - r.h));
      g.el.style.left = `${g.o.x}px`; g.el.style.top = `${g.o.y}px`;
      for (const c of g.carry) { c.m.x = c.x0 + g.o.x - g.x0; c.m.y = c.y0 + g.o.y - g.y0; if (c.el) { c.el.style.left = `${c.m.x}px`; c.el.style.top = `${c.m.y}px`; } }
      return;
    }
    if (g.kind === 'resize' && FREE_SIZE.has(g.o.k)) {
      // A box sized by its own width and height (an answer box): more room for its words, the same font size.
      const st0 = JSON.parse(g.st0), r = freeResize({ ...g.o, st: st0 }, dx / z, dy / z, WORLD);
      g.o.st.w = r.w; g.o.st.h = r.h; sizeObjEl(g.el, g.o, objSize(slug, g.o)); return;
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
  const snapNow = gg => { const ids = new Set(gg.members.map(x => x.m.id)); return snapFor([gg.p, ...gg.members.map(x => x.m).filter(m => m !== gg.p)], V.st.pieces.filter(q => !ids.has(q.id)), V.st.objects.flatMap(o => slotsOf(V.tool.slug, o)), SNAP_PX / V.view.z, snapOpts(V.tool.slug)); };
  const cancel = () => { if (g && g.hold) g.hold.cancel(); if (g && g.before && g.moved) { V.st = JSON.parse(g.before); renderBoard(); } g = null; ghost().hidden = true; selBox(null); };
  const up = e => {
    pointers.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') { if (pointers.size < 2) g = null; return; }
    const x = g, slug = V.tool.slug; g = null; ghost().hidden = true;
    if (x.hold) x.hold.cancel();
    if (x.kind === 'dead') { V.justMoved = true; return; }
    if (x.moved) V.justMoved = true;
    if (x.kind === 'box') {
      selBox(null);
      if (x.held) { V.justMoved = true; return; }
      if (x.moved) {
        // Everything unlocked the box touches (Shift: added to what was selected).
        const m = inRect(slug, V.st, rectFrom(toWorld(x.sx, x.sy), toWorld(x.ex, x.ey)));
        if (x.add) { const c = curSel(); for (const id of c.p) m.p.add(id); for (const id of c.o) m.o.add(id); }
        setMany(m); renderBoard(); renderChrome(); return;
      }
    }
    // A tap on empty space lets go of what was selected.
    if (x.kind === 'pan' || x.kind === 'box') { if (!x.moved && !x.grab && !x.add && (V.sel || V.osel || V.many) && !V.textMode) { V.sel = null; V.osel = null; V.many = null; renderBoard(); renderChrome(); } return; }
    if (x.kind === 'resize') { if (x.o.s !== x.s0 || JSON.stringify(x.o.st) !== x.st0) { scaleWithChart(slug, x.o, x.s0, V.st.pieces); settleBoard(slug, V.st, V, WORLD); pushHistory(x.before); renderBoard(); renderChrome(); } return; }
    // Held: the wheel stays open after the finger lifts.
    if ((x.kind === 'obj' || x.kind === 'piece') && !x.moved && (x.held || e.type === 'pointercancel')) { V.justMoved = true; return; }
    // Many moved together: one Undo step, the selection kept.
    if (x.list) { settleBoard(slug, V.st, V, WORLD); pushHistory(x.before); renderBoard(); renderChrome(); return; }
    if (x.kind === 'obj') {
      // A tap selects it (a corner to resize it; Shift: adds or removes it); a drag only moves it.
      if (x.moved) { settleBoard(slug, V.st, V, WORLD); pushHistory(x.before); V.many = null; } else if (x.shift) toggleSel('o', x.o); else { V.osel = x.o.locked ? null : x.o.id; V.sel = null; V.many = null; }
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
        V.lastAdd = { id: x.p.id, runX: x.p.x };   // the last block placed (a palette add of the same value follows it into its column)
        settleBoard(slug, V.st, V, WORLD);
        pushHistory(x.before);
      }
      // A tap selects the piece (a green outline, no buttons; Shift: adds or removes it).
      if (!x.moved) { if (x.shift) toggleSel('p', x.p); else { V.sel = x.p.id; V.osel = null; V.many = null; } } else { V.many = null; if (V.sel && V.sel !== x.p.id) V.sel = null; }
      renderBoard(); renderChrome(); V.snapped = null;
    }
  };
  board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
  board.addEventListener('wheel', e => {
    if (e.target.closest('textarea')) return;
    e.preventDefault();
    const w = wheelMove(e, vpSize().h), r = board.getBoundingClientRect();
    if (w.zoom) zoomAt(w.zoom, e.clientX - r.left, e.clientY - r.top); else { V.view.x += w.dx; V.view.y += w.dy; applyView(); }
  }, { passive: false });
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
// Saving (docs/decisions.md "Virtual math manipulatives: saving and AI drafts"): a host's board saves itself a moment
// after each change, as one of their recent boards (no button: "Saved 10:42" says it is); the address becomes
// #board/<id>, so a refresh brings the same board back. "Save as template" (the one save button) keeps a fresh starting
// point with a share code: opening a template always gives a copy.
const AUTOSAVE_MS = 2000;
const clockTime = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function startAutosave() {
  if (!HOST || !V) return;
  V.savedJson = JSON.stringify(boardState());
  timers.push(setInterval(() => { autosave(); }, AUTOSAVE_MS));
}
/** Saves the open board when it changed since the last save. keepalive: the page is going away (best effort). */
async function autosave({ keepalive = false } = {}) {
  const v = V;
  if (!HOST || !v || v.saving) return;
  const st = boardState(), s = JSON.stringify(st);
  if (s === v.savedJson) return;
  const body = { id: v.boardId || '', tool: v.tool.slug, title: v.title || v.tool.name, state: st };
  if (keepalive) {
    try { fetch('/api/manipulatives/boards/autosave', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); v.savedJson = s; } catch { /* the page is going */ }
    return;
  }
  v.saving = true;
  try {
    const r = await api('/api/manipulatives/boards/autosave', { method: 'POST', body, background: true });
    v.boardId = r.board.id; v.savedJson = s; v.savedAt = r.board.at; v.saveBad = false;
    if (V === v) { savedLine(); if (location.hash !== `#board/${r.board.id}`) history.replaceState(null, '', `#board/${r.board.id}`); }
  } catch (e) {
    if (e.status === 404 && v.boardId) v.boardId = null;   // gone (deleted elsewhere): the next save makes a new one
    v.saveBad = true; if (V === v) savedLine();
  } finally { v.saving = false; }
}
function savedLine() {
  const el = document.getElementById('mp-saved'); if (!el || !V) return;
  el.classList.toggle('bad', !!V.saveBad);
  el.innerHTML = V.saveBad ? esc(t('js.manip.save.notYet')) : V.savedAt ? `${iconHtml('✓', { size: 16 })} ${esc(t('js.manip.save.savedAt', { time: clockTime(V.savedAt) }))}` : '';
}
function renderShare() {
  const el = document.getElementById('mp-share');
  const mine = HOST ? STATE.boards.filter(b => b.tool === V.tool.slug) : [];
  el.innerHTML = `<div class="row">
    ${HOST ? `${btn('btn btn-primary', `id="mp-save" aria-expanded="${!!V.tplOpen}"`, esc(t('js.manip.share.save')))}<span class="small mp-saved" id="mp-saved" role="status"></span><span class="mp-code" id="mp-code" aria-live="polite"></span>` : ''}
    <form class="row mp-redeem" id="mp-redeem"><label for="mp-redeem-in" class="small"><b>${esc(t('js.manip.share.open'))}</b></label>
      <input id="mp-redeem-in" class="input input-sm mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}">
      <button class="btn btn-sm" type="submit">${esc(t('js.manip.share.go'))}</button></form>
    <span class="small" id="mp-status" role="status"></span></div>
    ${HOST && V.tplOpen ? `<form class="mp-tpl" id="mp-tpl" aria-label="${esc(t('js.manip.share.save'))}"><label class="mp-set mp-block"><span>${esc(t('js.manip.save.name'))}</span><input class="input" id="mp-tplname" maxlength="80" required value="${esc(V.title || V.tool.name)}"></label>
      <p class="small muted">${esc(t('js.manip.save.what'))}</p>
      <div class="row"><button class="btn btn-primary btn-sm" type="submit">${esc(t('js.manip.save.go'))}</button>${btn('btn btn-sm btn-ghost', 'id="mp-tplno"', esc(t('js.manip.save.cancel')))}</div></form>` : ''}
    ${HOST ? STATE.sessions.filter(x => x.status === 'active' && x.tool === V.tool.slug).map(x => `<p class="small"><a href="#live/${esc(x.id)}">${iconHtml('📡', { size: 18 })} ${esc(t('js.manip.share.backToSession', { title: x.title }))}</a></p>`).join('') : ''}
    ${mine.length ? `<div class="row mp-chips" aria-label="${esc(t('js.manip.share.saved'))}">${mine.slice(0, 12).map(b => btn('chip', `data-load="${esc(b.id)}" aria-label="${esc(t('js.manip.share.loadSaved', { code: b.code }))}"`, esc(b.title))).join('')}</div>` : ''}`;
  savedLine();
  const save = document.getElementById('mp-save');
  if (save) save.onclick = () => { V.tplOpen = !V.tplOpen; renderShare(); if (V.tplOpen) document.getElementById('mp-tplname')?.select(); };
  const tpl = document.getElementById('mp-tpl');
  if (tpl) {
    document.getElementById('mp-tplno').onclick = () => { V.tplOpen = false; renderShare(); };
    tpl.onsubmit = async e => {
      e.preventDefault();
      const go = tpl.querySelector('[type="submit"]'); go.disabled = true;
      const title = document.getElementById('mp-tplname').value;
      try {
        const r = await api('/api/manipulatives/boards', { method: 'POST', body: { tool: V.tool.slug, title, state: boardState() } });
        STATE.boards.unshift({ id: r.board.id, code: r.board.code, tool: V.tool.slug, title: r.board.title, kind: 'template', created_at: Date.now() });
        V.tplOpen = false; renderShare();
        document.getElementById('mp-code').textContent = r.board.code;
        setStatus(t('js.manip.save.done', { title: r.board.title, code: r.board.code }));
      } catch (err) { go.disabled = false; setStatus(err.message, true); }
    };
  }
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
  el.innerHTML = `<section class="panel mp-drafter" aria-label="${esc(t('js.manip.steps.title'))}"><div class="row"><h2>${iconHtml('📋', { size: 28 })} ${esc(t('js.manip.steps.title'))}</h2>${btn('btn btn-sm btn-ghost', 'data-tool="steps"', `✕ ${esc(t('js.manip.draft.close'))}`)}</div>
    <p class="small muted">${esc(t('js.manip.steps.text'))}</p><div id="mp-stepsed"></div></section>`;
  ROOM.stepsEditor(document.getElementById('mp-stepsed'), V.steps || [], list => { V.steps = list.filter(x => x.text.trim()); renderStepCard(); });
}
/** The steps on the board itself (owner, 22 Nov 2026: "we need to put the steps on the actual board"): a card pinned
 *  above the board, for everyone who opens it (the teacher, a share code, a student), hidden with no steps. On a board
 *  of one's own the viewer moves through the steps; the teacher may fold the card to one line. */
function renderStepCard() {
  const el = document.getElementById('mp-stepcard'); if (!el || !V) return;
  const list = V.steps || [];
  V.stepAt = clamp(V.stepAt || 0, 0, Math.max(0, list.length - 1));
  el.innerHTML = ROOM.stepCardHtml({ list, i: V.stepAt, move: true, open: !!V.stepsList, folded: HOST && !!V.stepsFolded, fold: HOST });
}
function stepCardButton(k) {
  const n = (V.steps || []).length;
  if (k === 'prev' || k === 'next') V.stepAt = clamp((V.stepAt || 0) + (k === 'next' ? 1 : -1), 0, Math.max(0, n - 1));
  else if (k === 'all') V.stepsList = !V.stepsList;
  else if (k === 'fold') V.stepsFolded = true;
  else if (k === 'unfold') V.stepsFolded = false;
  renderStepCard();
  // Keep the keyboard where it was (the same button, or its partner when it went disabled).
  const card = document.getElementById('mp-stepcard'), same = card && card.querySelector(`[data-sc="${k}"]:not(:disabled)`);
  (same || (card && card.querySelector('[data-sc]:not(:disabled)')))?.focus({ preventScroll: true });
}
// ---------------------------------------------------------------- the AI drafter: a job on the server
// A draft runs on our server (services/manip-drafts.js), not in this page: a refresh or a closed tab changes nothing.
// While it runs, the drafter's box shows its real steps and how long drafts usually take (the Builder's live card,
// public/js/studio.js), and the side button counts the time. When it ends while this page watched it run on this
// tool, it goes onto the board (Undo brings back what was there); otherwise one notice says it finished while the
// teacher was away (the board is in My boards either way). A failed draft opens the drafter again with the words kept.
const DRAFT_STEPS = ['check', 'ai', 'build', 'save'];
const DJ = { job: null, eta: null, sawId: null, timer: null, ticks: 0, skew: 0, notice: null, retry: null, polling: false, fallback: null };
const draftLive = () => !!DJ.job && (DJ.job.status === 'queued' || DJ.job.status === 'running');
const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const draftElapsed = () => (DJ.job ? Date.now() + DJ.skew - (DJ.job.startedAt || DJ.job.createdAt) : 0);
/** The server's job (and estimate): what the page shows and does next. */
function setJob(job, eta) {
  if (eta) DJ.eta = eta;
  DJ.job = job || null;
  if (job && job.now) DJ.skew = job.now - Date.now();
  if (draftLive()) { DJ.sawId = job.id; if (!DJ.timer) DJ.timer = setInterval(draftTick, 1000); }
  else if (DJ.timer) { clearInterval(DJ.timer); DJ.timer = null; }
  const j = DJ.job;
  if (j && !j.seen && (j.status === 'done' || j.status === 'failed')) {
    j.seen = true;
    api(`/api/manipulatives/draft/${encodeURIComponent(j.id)}/seen`, { method: 'POST', body: {}, background: true }).catch(() => {});
    if (j.status === 'done' && DJ.sawId === j.id && V && V.tool.slug === j.tool) { applyDone(j); return; }
    if (j.status === 'failed' && V && V.tool.slug === j.tool) { DJ.retry = j; V.draftOpen = true; V.draftHidden = false; }
    else DJ.notice = j;
  }
  drawDraftPlaces();
}
function drawDraftPlaces() {
  if (V && document.getElementById('mp-draft')) renderChrome();
  else drawNotice();
}
async function pollDraft() {
  if (DJ.polling) return;
  DJ.polling = true;
  try { const r = await api('/api/manipulatives/draft', { background: true }); setJob(r.job, r.eta); } catch { /* try again next tick */ } finally { DJ.polling = false; }
}
function draftTick() {
  if (!draftLive()) return;
  DJ.ticks++;
  if (DJ.ticks % 2 === 0) pollDraft();
  const time = document.getElementById('mp-dtime'); if (time) time.textContent = mmss(draftElapsed());
  const eta = document.getElementById('mp-deta'); if (eta) { const e = etaNow(); eta.dataset.state = e.state; eta.innerHTML = etaHtml(e); }
  const rows = document.getElementById('mp-dsteps'); if (rows) rows.innerHTML = stepRows();
}
/** The estimate line: numbers from the server (manip-drafts.js eta), words here. Like the Builder's: "Usually" only
 *  from real timed drafts, "About" from first guesses; past the usual time, "Taking a bit longer than usual". */
function etaNow() {
  const e = DJ.eta || { src: 'default', p50: 25e3, p75: 40e3 }, el = draftElapsed(), guess = e.src !== 'data';
  // Past the usual time: the server's longest (its AI budget and a margin, manip-drafts.js longest) says when the
  // teacher has a board either way. The page never stops asking while the draft runs.
  if (el > e.p75 + Math.max(15e3, 0.15 * e.p75)) return { state: 'longer', text: e.max ? t('js.manip.draft.eta.longerMax', { n: Math.max(1, Math.ceil((e.max - el) / 60e3)) }) : t('js.manip.draft.eta.longer') };
  if (e.p75 <= 50e3) return { state: 'on', text: t(guess ? 'js.manip.draft.eta.guessUnder' : 'js.manip.draft.eta.under') };
  return { state: 'on', text: t(guess ? 'js.manip.draft.eta.guess' : 'js.manip.draft.eta.about', { n: Math.ceil(e.p75 / 60e3) }) };
}
const etaHtml = e => `<b>${esc(e.text)}</b> <span class="mp-dso">· ${esc(t('js.manip.draft.eta.soFar', { time: mmss(draftElapsed()) }))}</span>`;
function stepRows() {
  const j = DJ.job; if (!j) return '';
  const at = j.steps || [], el = draftElapsed();
  return DRAFT_STEPS.map((k, i) => {
    const state = i < j.step ? 'done' : i === j.step ? 'cur' : 'todo';
    const ms = state === 'done' ? (at[i + 1] ?? at[i] ?? 0) - (at[i] ?? 0) : state === 'cur' ? el - (at[i] ?? 0) : null;
    const mark = state === 'done' ? iconHtml('✓', { size: 16 }) : state === 'cur' ? '<span class="mp-dpulse" aria-hidden="true"></span>' : '<span class="mp-dtodo" aria-hidden="true"></span>';
    return `<li class="mp-dstep ${state}"${state === 'cur' ? ' aria-current="step"' : ''}><span class="mp-dmark">${mark}</span><span>${esc(t(`js.manip.draft.step.${k}.${state === 'done' ? 'done' : 'now'}`))}</span>${ms != null ? `<span class="mp-dt">${mmss(ms)}</span>` : ''}</li>`;
  }).join('');
}
function progressHtml() {
  const j = DJ.job, e = etaNow(), tl = toolOf(j.tool);
  return `<section class="panel mp-drafter mp-dprog" aria-label="${esc(t('js.manip.draft.progress'))}"><div class="row"><h2>${iconHtml('✨', { size: 28 })} ${esc(t('js.manip.draft.progress'))}</h2>${tl && (!V || V.tool.slug !== j.tool) ? `<span class="mp-tag">${esc(tl.name)}</span>` : ''}</div>
    ${j.brief ? `<p class="mp-dbrief">${esc(t('js.manip.draft.quote', { brief: j.brief }))}</p>` : ''}
    <p class="mp-deta" id="mp-deta" data-state="${e.state}" role="status">${etaHtml(e)}</p>
    <ol class="mp-dsteps" id="mp-dsteps">${stepRows()}</ol>
    <p class="small mp-dleave">${iconHtml('🌙', { size: 18 })} ${esc(t('js.manip.draft.leave'))}</p></section>`;
}
/** Why a draft is the tool's starting board instead of the AI's (manip-drafts.js summary reason): the AI is resting,
 *  didn't answer in time, was busy, or sent back something that wasn't a board. */
const FALLBACKS = ['resting', 'timeout', 'busy', 'error'];
const fallbackText = r => t(`js.manip.draft.fallback.${FALLBACKS.includes(r.reason) ? r.reason : 'resting'}`);
const doneMessage = r => (r.ai ? `${t('js.manip.draft.doneSet', { title: r.title, n: r.n, steps: r.steps })}${r.capped ? ` ${t('js.manip.draft.capped', { max: 12 })}` : ''}` : fallbackText(r));
/** Every reason a draft can end as failed (manip-drafts.js: draftRequest's checks, runDraft, cleanState, a restart). */
const ERRORS = ['notFound', 'badTool', 'brief', 'words', 'personal', 'names', 'aiFailed', 'restart', 'badState', 'tooBig'];
const errorText = code => t(`js.manip.draft.err.${ERRORS.includes(code) ? code : 'other'}`);
/** The one notice: a draft that finished (or failed) while the teacher was away. */
function noticeHtml(j) {
  const tl = toolOf(j.tool), r = j.result || {};
  if (j.status === 'done') {
    return `<div class="notice good mp-dnote" role="status">${iconHtml('✨', { size: 22 })}<p><b>${esc(t('js.manip.draft.away', { title: r.title || '' }))}</b> ${esc(r.n ? t('js.manip.draft.awayN', { n: r.n, steps: r.steps }) : '')} ${esc(r.ai === false ? fallbackText(r) : '')} ${esc(t('js.manip.draft.inBoards'))}</p>
      ${btn('btn btn-primary btn-sm', 'data-dnote="use"', esc(t('js.manip.draft.use')))}${btn('mp-dx', `data-dnote="x" aria-label="${esc(t('js.manip.draft.dismiss'))}"`, '✕')}</div>`;
  }
  return `<div class="notice bad mp-dnote" role="status">${iconHtml('⚠️', { size: 22 })}<p><b>${esc(t('js.manip.draft.failedAway', { tool: tl ? tl.name : '' }))}</b> ${esc(errorText(j.error))}</p>
    ${btn('btn btn-primary btn-sm', 'data-dnote="retry"', esc(t('js.manip.draft.retry')))}${btn('mp-dx', `data-dnote="x" aria-label="${esc(t('js.manip.draft.dismiss'))}"`, '✕')}</div>`;
}
function bindNotice(el) {
  for (const b of el.querySelectorAll('[data-dnote]')) b.onclick = () => {
    const j = DJ.notice; DJ.notice = null;
    if (!j) return;
    if (b.dataset.dnote === 'use') applyDone(j);
    else if (b.dataset.dnote === 'retry') { DJ.retry = j; if (V && V.tool.slug === j.tool) { V.draftOpen = true; renderChrome(); } else { pendingDraftOpen = true; location.hash = j.tool; } }
    else drawDraftPlaces();
  };
}
let pendingDraftOpen = false;
function drawNotice() {
  const el = document.getElementById('mp-notice'); if (!el) return;
  el.innerHTML = draftLive() ? progressHtml() : DJ.notice ? noticeHtml(DJ.notice) : '';
  bindNotice(el);
}
/** A finished draft onto the board (the open one when it is the same tool: Undo brings back what was there; the
 *  board it was saved as is the one that goes on saving), else its own board opens. */
async function applyDone(j) {
  try {
    const r = await api(`/api/manipulatives/boards/${encodeURIComponent(j.boardId)}`);
    // The AI didn't make this one (it timed out, was busy or failed): the starting board opens, and a calm note
    // stays above it with the words kept for another try.
    const res = j.result || {};
    DJ.fallback = res.ai === false && res.reason && res.reason !== 'resting' ? { ...j, error: null } : null;
    if (!V || V.tool.slug !== j.tool) { pendingOpen = r.board; location.hash = `board/${r.board.id}`; return; }
    await autosave();   // what was on the board stays in its own recent board
    restoreInto(r.board.state);
    Object.assign(V, { boardId: r.board.id, title: r.board.title, savedJson: JSON.stringify(boardState()), savedAt: Date.now(), saveBad: false, stepsOpen: true, draftOpen: false, draftHidden: false });
    DJ.retry = null;
    history.replaceState(null, '', `#board/${r.board.id}`);
    renderChrome(); renderShare(); fit();
    const m = doneMessage(j.result || {}); setStatus(m); toast(m);
  } catch (e) { toast(e.message, { bad: true }); }
}
function renderDraft() {
  const el = document.getElementById('mp-draft');
  if (!HOST) { el.innerHTML = ''; return; }
  if (draftLive() && !V.draftHidden) { el.innerHTML = progressHtml(); return; }
  if (DJ.notice && !draftLive()) { el.innerHTML = noticeHtml(DJ.notice); bindNotice(el); return; }
  if (DJ.fallback && DJ.fallback.tool !== V.tool.slug) DJ.fallback = null;
  if (!V.draftOpen && DJ.fallback) {
    el.innerHTML = `<div class="notice mp-dnote mp-dfall" role="status">${iconHtml('✨', { size: 22 })}<p>${esc(fallbackText(DJ.fallback.result || {}))}</p>
      ${btn('btn btn-primary btn-sm', 'data-dfall="retry"', esc(t('js.manip.draft.retry')))}${btn('mp-dx', `data-dfall="x" aria-label="${esc(t('js.manip.draft.dismiss'))}"`, '✕')}</div>`;
    for (const b of el.querySelectorAll('[data-dfall]')) b.onclick = () => {
      const j = DJ.fallback; DJ.fallback = null;
      if (b.dataset.dfall === 'retry') { DJ.retry = j; V.draftOpen = true; }
      renderChrome(); if (V.draftOpen) document.getElementById('mp-brief')?.focus();
    };
    return;
  }
  if (!V.draftOpen) { el.innerHTML = ''; return; }
  // One chat everywhere: Try again on a draft that failed (or its starting board) opens Oomba with the words in its box.
  { const re0 = DJ.retry && DJ.retry.tool === V.tool.slug ? DJ.retry : null; V.draftOpen = false; DJ.retry = null; el.innerHTML = ''; CHAT.ask(re0 ? re0.brief : ''); return; }
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
  if (HOST) CHAT.attachLive();
  try {
    if (joinFirst) { await api('/api/manipulatives/live/join', { method: 'POST', body: { id } }); history.replaceState(null, '', `#live/${id}`); }
    await ROOM.open(ROOT, id, { palButton, bindTrayDrag, dropAt, IMPL, mkPiece, breakPiece, regroup, settleBoard, scaleWithChart, newId, boards: STATE.boards, normalize, boardHtml, paletteFor, pieceAction, objectAction, joinGroup, target, inkLine, pieceWheel, objWheel, wheelItems, wheelRun, wheelKey, objName, growAnswer, growAnswers, sizeObjEl, textBoxHtml, textBoxPointer, textSizeButton, growText, snapText, othersThan, selPillHtml, wheelMove, carried, drawSelBox });
  } catch (e) { ROOT.innerHTML = `<div class="empty"><h1>${esc(e.status === 409 ? t('js.manip.live.ended') : t('js.manip.live.gone'))}</h1><p><a href="#">${esc(t('js.manip.nav.back'))}</a></p></div>`; }
}

// ================================================================ home, tasks
function home() {
  clear(); V = null;
  if (!HOST) return studentHome();
  ROOT.innerHTML = `<div class="pagehead"><h1>${iconHtml('🧮', { size: 36 })} ${esc(t('js.manip.home.title'))}</h1><span class="mp-tag">${esc(t('js.manip.home.testing'))}</span></div>
    <p class="mp-lead">${esc(t('js.manip.home.lead', { n: Object.values(TASKS).reduce((s, l) => s + l.length, 0) }))}</p>
    <div id="mp-notice"></div>
    <section class="panel mp-boards" aria-label="${esc(t('js.manip.boards.title'))}"><h2>${iconHtml('🗂️', { size: 28 })} ${esc(t('js.manip.boards.title'))}</h2><div id="mp-boardlist"></div></section>
    <div class="mp-homegrid">
      <section class="panel"><h2>${iconHtml('📡', { size: 28 })} ${esc(t('js.manip.host.title'))}</h2>
        ${STATE.classes.length ? `<form id="mp-host" class="mp-form"><label class="mp-set mp-block"><span>${esc(t('js.manip.host.klass'))}</span><select class="input" name="classId" required>${STATE.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.school)}</option>`).join('')}</select></label>
          <label class="mp-set mp-block"><span>${esc(t('js.manip.host.tool'))}</span><select class="input" name="tool">${TOOLS.map(x => `<option value="${x.slug}">${esc(x.name)}</option>`).join('')}</select></label>
          <label class="mp-set mp-block"><span>${esc(t('js.manip.host.name'))}</span><input class="input" name="title" maxlength="80" placeholder="${esc(t('js.manip.host.namePh'))}"></label>
          ${STATE.boards.length ? `<label class="mp-set mp-block"><span>${esc(t('js.manip.host.board'))}</span><select class="input" name="boardId"><option value="">${esc(t('js.manip.host.noBoard'))}</option>${STATE.boards.map(b => { const x = toolOf(b.tool); return `<option value="${esc(b.id)}">${esc(b.code)} · ${esc(x ? x.name : b.tool)} · ${esc(b.title)}</option>`; }).join('')}</select></label>` : ''}
          <button class="btn btn-primary btn-block" type="submit">${esc(t('js.manip.host.start'))}</button></form><p class="small muted mp-host-who">${esc(t('js.manip.host.who'))}</p>`
    : `<p class="small muted">${esc(t('js.manip.host.noClasses'))}</p>`}
        </section>
      <section class="panel"><h2>${iconHtml('🎟️', { size: 28 })} ${esc(t('js.manip.share.haveCode'))}</h2><p class="small muted">${esc(t('js.manip.share.haveCodeText'))}</p>
        <form class="row mp-redeem" id="mp-homeredeem"><label class="sr-only" for="mp-home-code">${esc(t('js.manip.share.codeLabel'))}</label><input id="mp-home-code" class="input mp-codein" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('js.manip.share.codePh'))}"><button class="btn btn-primary" type="submit">${esc(t('js.manip.share.go'))}</button></form>
        <p><a class="btn btn-block" href="#tasks">${iconHtml('📚', { size: 18 })} ${esc(t('js.manip.tasks.library'))}</a></p></section>
    </div>
    <div class="mp-filter"><label class="sr-only" for="mp-q">${esc(t('js.manip.home.search'))}</label><input id="mp-q" class="input" type="search" placeholder="${esc(t('js.manip.home.search'))}">
      <label class="sr-only" for="mp-cat">${esc(t('js.manip.home.cat'))}</label><select id="mp-cat" class="input"><option value="">${esc(t('js.manip.home.allCats'))}</option>${CATS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('')}</select></div>
    <div id="mp-catalog"></div>`;
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
    document.getElementById('mp-catalog').innerHTML = CATS.map((c, i) => { const l = list.filter(x => x.cat === i); return l.length ? `<section class="mp-cat"><h2>${esc(c)}</h2><div class="mp-toolgrid">${l.map(x => { const card = `<a class="panel mp-toolcard" href="#${x.slug}"><span class="mp-ico" style="--tc:${x.color}">${toolIconHtml(x.slug, { size: 40 })}</span><span><b>${esc(x.name)}</b><span class="small muted">${esc(t('js.manip.grades', { grades: x.grades }))}</span><span class="small">${esc(x.desc)}</span></span></a>`;
      return tutorialOf(x.slug) ? `<div class="mp-toolcell">${card}${howButton(x)}</div>` : card; }).join('')}</div></section>` : ''; }).join('')
      || `<p class="muted">${esc(t('js.manip.home.none'))}</p>`;
  };
  q.oninput = drawCat; cat.onchange = drawCat; drawCat();
  drawBoards(); drawNotice();
}
// ---------------------------------------------------------------- My boards (the home): templates and recent boards
// Templates (fresh starting points, with share codes) and recent boards (saved as the teacher works, AI drafts and live
// rooms among them). A row's title opens it; its one ⋯ menu has the rest: Rename, Duplicate, Delete, "Start a live
// room with it" (templates), "Reopen room" (an ended room). Nothing else on the row.
const whenText = ms => {
  if (!ms) return '';
  const d = new Date(ms), today = new Date();
  if (d.toDateString() === today.toDateString()) return clockTime(ms);
  return Date.now() - ms < 6 * 86400e3 ? d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString();
};
function boardRows() {
  const nameOf = slug => { const x = toolOf(slug); return x ? x.name : slug; };
  const templates = STATE.boards.map(b => ({ type: 'template', id: b.id, tool: b.tool, title: b.title, at: Math.max(b.updated_at || 0, b.opened_at || 0, b.created_at || 0), sub: `${nameOf(b.tool)} · ${t('js.manip.boards.code', { code: b.code })}` }));
  const recent = [
    ...(STATE.recent || []).map(b => {
      const at = Math.max(b.updated_at || 0, b.opened_at || 0, b.created_at || 0), fresh = !b.opened_at;
      return { type: 'board', id: b.id, tool: b.tool, title: b.title, at, isNew: fresh, sub: `${nameOf(b.tool)} · ${fresh ? t('js.manip.boards.aiDraft', { when: whenText(at) }) : t('js.manip.boards.edited', { when: whenText(at) })}` };
    }),
    ...STATE.sessions.map(s => {
      const live = s.status === 'active', at = live ? s.opened_at || s.created_at : s.ended_at || s.opened_at || s.created_at;
      return { type: 'room', id: s.id, tool: s.tool, title: s.title, at, live, sub: live ? t('js.manip.boards.roomLive', { klass: s.class_name, n: s.joined }) : t('js.manip.boards.roomEnded', { klass: s.class_name, when: whenText(at), n: s.joined }) };
    }),
  ].sort((a, b) => b.at - a.at);
  return { templates, recent };
}
function menuItems(r) {
  const it = (act, label, cls = '') => `<button type="button" role="menuitem" class="mp-mi${cls}" data-act="${act}">${esc(label)}</button>`;
  if (r.type === 'template') return [STATE.classes.length ? it('start', t('js.manip.boards.start')) : '', it('rename', t('js.manip.boards.rename')), it('duplicate', t('js.manip.boards.duplicate')), it('delete', t('js.manip.boards.delete'), ' bad')].join('');
  if (r.type === 'board') return [it('rename', t('js.manip.boards.rename')), it('duplicate', t('js.manip.boards.duplicate')), it('delete', t('js.manip.boards.delete'), ' bad')].join('');
  return [r.live ? '' : it('reopen', t('js.manip.boards.reopen')), it('rename', t('js.manip.boards.rename')), r.live ? '' : it('delete', t('js.manip.boards.delete'), ' bad')].join('');
}
/** Where a row's title goes: on the All boards page, back to the manipulatives page with it open. */
const openRow = hash => { if (ALL_PAGE) location.href = `/manipulatives#${hash}`; else location.hash = hash; };
/** Which tool groups on the All boards page are open ('tpl:clock', 'recent:money'...): this browser's, best effort
 *  (all closed without storage; the page still works, remembering only until it is left). */
const GROUPS_KEY = 'manip.allBoards.open';
function groupOpen() {
  if (!groupOpen.set) { let v = []; try { v = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]'); } catch { v = []; } groupOpen.set = new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 100) : []); }
  return groupOpen.set;
}
function saveGroupOpen() { try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...groupOpen()])); } catch { /* no storage: open for this visit only */ } }
/** My boards: on the home the newest HOME_MAX of each section (manip-library.js homeLists) and, when any are left out,
 *  one "See all boards" link; on the All boards page every one, grouped by tool (byTool). The same rows and ⋯ menu. */
function drawBoards() {
  const el = document.getElementById('mp-boardlist'); if (!el) return;
  const rows = boardRows();
  const home = homeLists(rows.templates, rows.recent, STATE.templateCount ?? rows.templates.length);
  const shownTpl = ALL_PAGE ? (drawBoards.allTpl ? rows.templates : rows.templates.slice(0, PAGE_TEMPLATES)) : home.templates;
  const templates = shownTpl, recent = ALL_PAGE ? rows.recent : home.recent;
  const all = [];   // the rows in the order drawn (grouped by tool on the All boards page): data-i is a row's place here
  const row = r => {
    const i = all.push(r) - 1, x = toolOf(r.tool);
    const ico = r.type === 'room' ? `<span class="mp-ico sm">${iconHtml('📡', { size: 28 })}</span>` : `<span class="mp-ico sm" style="--tc:${x ? x.color : '#888'}">${toolIconHtml(r.tool, { size: 28, lazy: true })}</span>`;
    const tags = `${r.live ? ` <span class="mp-tag good">${esc(t('js.manip.boards.live'))}</span>` : ''}${r.isNew ? ` <span class="mp-tag hot">${esc(t('js.manip.boards.new'))}</span>` : ''}`;
    return `<li class="mp-brow" data-i="${i}">${ico}<span class="mp-btx"><span class="mp-bname"><button type="button" class="mp-blink" data-open="${i}">${esc(r.title)}</button>${tags}</span><span class="small muted">${esc(r.sub)}</span></span>
      <span class="mp-bmore"><button type="button" class="mp-more" data-more="${i}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('js.manip.boards.more', { title: r.title }))}">⋯</button><span class="mp-bmenu panel" role="menu" hidden>${menuItems(r)}</span></span></li>`;
  };
  const ul = list => `<ul class="plain mp-blist">${list.map(row).join('')}</ul>`;
  // The All boards page: one disclosure per tool (its icon, name and count), the most recently used tool first; closed
  // until the teacher opens it, and kept open or closed as they left it (groupOpen). Opening one draws nothing again,
  // so each row's data-i stays its place in `all`.
  const byToolHtml = (list, sec) => byTool(list).map(g => { const x = toolOf(g.tool), key = `${sec}:${g.tool}`;
    return `<details class="mp-tgroup" data-tool="${esc(g.tool)}" data-key="${esc(key)}"${groupOpen().has(key) ? ' open' : ''}><summary class="mp-tname"><span class="mp-ico xs" style="--tc:${x ? x.color : '#888'}">${toolIconHtml(g.tool, { size: 20, lazy: true })}</span>${esc(x ? x.name : g.tool)} <span class="small muted">${esc(t('js.manip.boards.count', { n: g.rows.length }))}</span><span class="mp-caret" aria-hidden="true"></span></summary>${ul(g.rows)}</details>`; }).join('');
  const head = (title, sub) => `<h3 class="mp-group">${esc(title)} <span class="small muted">· ${esc(sub)}</span></h3>`;
  const group = (list, title, sub) => (list.length ? head(title, sub) + ul(list) : '');
  if (ALL_PAGE) {
    const rest = rows.templates.length - templates.length;
    el.innerHTML = `<section class="mp-bsec" id="mp-alltpl">${head(t('js.manip.boards.templates'), t('js.manip.boards.templatesSub'))}${templates.length ? byToolHtml(templates, 'tpl') : `<p class="small muted mp-bempty">${esc(t('js.manip.boards.noTemplates'))}</p>`}
      ${rest > 0 ? `<p class="mp-ball"><button type="button" class="btn btn-sm" id="mp-moretpl">${esc(t('js.manip.boards.showAllTemplates', { n: rows.templates.length }))}</button></p>` : ''}</section>
      <section class="mp-bsec" id="mp-allrecent">${head(t('js.manip.boards.recent'), t('js.manip.boards.recentSub'))}${recent.length ? byToolHtml(recent, 'recent') : `<p class="small muted mp-bempty">${esc(t('js.manip.boards.noRecent'))}</p>`}</section>`;
    const more = document.getElementById('mp-moretpl'); if (more) more.onclick = () => { drawBoards.allTpl = true; drawBoards(); };
    for (const d of el.querySelectorAll('details.mp-tgroup')) d.ontoggle = () => { const open = groupOpen(); if (d.open) open.add(d.dataset.key); else open.delete(d.dataset.key); saveGroupOpen(); };
  } else {
    el.innerHTML = templates.length + recent.length ? group(templates, t('js.manip.boards.templates'), t('js.manip.boards.templatesSub')) + group(recent, t('js.manip.boards.recent'), t('js.manip.boards.recentSub'))
      + (home.more ? `<p class="mp-ball"><a href="/manipulatives/boards">${esc(t('js.manip.boards.seeAll', { n: home.total }))}</a></p>` : '')
      : `<p class="small muted">${esc(t('js.manip.boards.none'))}</p>`;
  }
  const closeMenus = () => { for (const m of el.querySelectorAll('.mp-bmenu')) m.hidden = true; for (const b of el.querySelectorAll('.mp-more')) b.setAttribute('aria-expanded', 'false'); };
  for (const b of el.querySelectorAll('[data-open]')) b.onclick = () => { const r = all[+b.dataset.open]; openRow(r.type === 'room' ? `live/${r.id}` : `board/${r.id}`); };
  for (const b of el.querySelectorAll('[data-more]')) b.onclick = e => {
    e.stopPropagation();
    const m = b.nextElementSibling, open = m.hidden; closeMenus();
    if (open) { m.hidden = false; b.setAttribute('aria-expanded', 'true'); m.querySelector('[role="menuitem"]')?.focus(); }
  };
  for (const m of el.querySelectorAll('.mp-bmenu')) m.onkeydown = e => {
    const items = [...m.querySelectorAll('[role="menuitem"]')], k = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenus(); m.previousElementSibling.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
  };
  for (const b of el.querySelectorAll('[data-act]')) b.onclick = e => { e.stopPropagation(); closeMenus(); const li = b.closest('.mp-brow'); boardAction(all[+li.dataset.i], b.dataset.act, li); };
  if (!drawBoards.bound) { drawBoards.bound = true; document.addEventListener('click', e => { if (!e.target.closest('.mp-bmore')) for (const m of document.querySelectorAll('.mp-bmenu')) { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); } }); }
}
async function boardAction(r, act, li) {
  const base = r.type === 'room' ? `/api/manipulatives/live/${encodeURIComponent(r.id)}` : `/api/manipulatives/boards/${encodeURIComponent(r.id)}`;
  try {
    if (act === 'rename') return renameRow(r, li, base);
    if (act === 'delete') {
      // The site's own question box (app.js ask(), not the browser's confirm()): Cancel has the focus first.
      if (!await ask({ text: t(r.type === 'room' ? 'js.manip.boards.deleteRoom' : 'js.manip.boards.deleteConfirm', { title: r.title }), ok: t('js.manip.boards.delete'), danger: true })) return;
      await api(`${base}/delete`, { method: 'POST', body: {} });
    } else if (act === 'duplicate') {
      await api(`${base}/duplicate`, { method: 'POST', body: {} });
    } else if (act === 'reopen') {
      await api(`${base}/reopen`, { method: 'POST', body: {} }); await loadState2(); openRow(`live/${r.id}`); return;
    } else if (act === 'start') {
      if (STATE.classes.length === 1) {
        const s = await api('/api/manipulatives/live', { method: 'POST', body: { classId: STATE.classes[0].id, boardId: r.id } });
        await loadState2(); openRow(`live/${s.session.id}`); return;
      }
      // Several classes: the room form on the home, with this template picked; the teacher picks the class.
      if (ALL_PAGE) { location.href = `/manipulatives#start/${encodeURIComponent(r.id)}`; return; }
      return pickClassFor(r.id);
    }
    await loadState2(); drawBoards();
  } catch (e) { toast(e.message, { bad: true }); }
}
/** The home's room form with a template picked, for a teacher with several classes to pick from. */
function pickClassFor(id) {
  const f = document.getElementById('mp-host'); if (!f) return;
  f.elements.boardId.value = id; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.elements.classId.focus(); toast(t('js.manip.boards.pickClass'));
}
/** The All boards page (/manipulatives/boards): every template and every kept recent board and room, by tool. */
function boardsPage() {
  clear(); V = null;
  ROOT.innerHTML = `<div class="pagehead"><h1>${iconHtml('🗂️', { size: 36 })} ${esc(t('js.manip.boards.allTitle'))}</h1><a class="btn btn-sm" href="/manipulatives">${esc(t('js.manip.boards.back'))}</a></div>
    <p class="mp-lead">${esc(t('js.manip.boards.allLead'))}</p>
    <section class="panel mp-boards mp-allboards" aria-label="${esc(t('js.manip.boards.allTitle'))}"><div id="mp-boardlist"></div></section>`;
  drawBoards();
}
/** Rename in place: the title becomes a text box (Enter saves, Escape puts it back). */
function renameRow(r, li, base) {
  const name = li.querySelector('.mp-bname');
  name.innerHTML = `<form class="row mp-rename"><label class="sr-only" for="mp-rn">${esc(t('js.manip.boards.rename'))}</label><input id="mp-rn" class="input input-sm" maxlength="80" value="${esc(r.title)}"></form>`;
  const f = name.querySelector('form'), input = f.querySelector('input'); input.select(); input.focus();
  let done = false;
  const save = async () => {
    if (done) return; done = true;
    const v = input.value.trim();
    if (v && v !== r.title) { try { await api(`${base}/rename`, { method: 'POST', body: { title: v } }); await loadState2(); } catch (e) { toast(e.message, { bad: true }); } }
    drawBoards();
  };
  f.onsubmit = e => { e.preventDefault(); save(); };
  input.onblur = save;
  input.onkeydown = e => { if (e.key === 'Escape') { done = true; drawBoards(); } };
}
function studentHome() {
  const list = STATE.sessions;
  ROOT.innerHTML = `<div class="pagehead"><h1>${iconHtml('🧮', { size: 36 })} ${esc(t('js.manip.student.title'))}</h1></div>
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
  ROOT.innerHTML = `<div class="pagehead"><h1>${iconHtml('📚', { size: 36 })} ${esc(t('js.manip.tasks.library'))}</h1><a class="btn btn-sm" href="#">${esc(t('js.manip.nav.allTools'))}</a></div>
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
    document.getElementById('mp-tlist').innerHTML = list.slice(0, 300).map(({ tool: x, task }) => `<article class="panel mp-taskcard"><p class="row"><span class="mp-ico sm" style="--tc:${x.color}">${toolIconHtml(x.slug, { size: 28, lazy: true })}</span><b class="small">${esc(x.name)}</b><span class="mp-tag">${esc(task.ccss)}</span></p>
      <h2>${esc(task.title)}</h2><p class="small">${esc(task.prompt)}</p><p class="small muted"><b>${esc(t('js.manip.tasks.teacherNote'))}</b> ${esc(task.notes)}</p><p class="small muted">${esc(t('js.manip.grade', { grade: task.grade }))} · ${esc(task.ccss)}</p>
      <a class="btn btn-primary btn-sm" href="#${x.slug}">${esc(t('js.manip.tasks.open'))}</a></article>`).join('') || `<p class="muted">${esc(t('js.manip.tasks.none'))}</p>`;
  };
  q.oninput = draw; tool.onchange = draw; grade.onchange = draw; draw();
}

// ================================================================ start
async function loadState2() {
  try { STATE = { boards: [], recent: [], classes: [], sessions: [], draft: null, eta: null, ...(await api(`/api/manipulatives/state${ALL_PAGE ? '?all=1' : ''}`)) }; } catch { return; /* keep what we have */ }
  if (HOST) setJob(STATE.draft, STATE.eta);
}
/** A saved board by id (#board/<id>): a recent board goes on saving into itself; a template opens as a fresh copy. */
let pendingOpen = null;
async function openSaved(id) {
  clear(); V = null;
  try {
    const b = pendingOpen && pendingOpen.id === id ? pendingOpen : (await api(`/api/manipulatives/boards/${encodeURIComponent(id)}`)).board;
    pendingOpen = null;
    if (!toolOf(b.tool)) return home();
    openTool(b.tool, { restore: b.state, boardId: b.fresh ? null : b.id, title: b.title });
    if (b.fresh) history.replaceState(null, '', `#${b.tool}`);
  } catch (e) { toast(e.message, { bad: true }); history.replaceState(null, '', '#'); await loadState2(); home(); }
}
async function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (V) autosave({ keepalive: true });   // leaving a board: its last change is saved
  ROOM.close();
  if (HOST && h.startsWith('board/')) return openSaved(h.slice(6));
  // From the All boards page: "Start a live room with it" for a teacher with several classes (the home's room form).
  if (HOST && h.startsWith('start/')) { await loadState2(); home(); history.replaceState(null, '', '#'); return pickClassFor(h.slice(6)); }
  if (h.startsWith('join/')) return liveRoom(h.slice(5), true);
  if (h.startsWith('live/') || h.startsWith('session/')) return liveRoom(h.slice(h.indexOf('/') + 1), false);
  if (h === 'tasks' && HOST) return tasksView();
  if (HOST && toolOf(h)) { const r = pendingRestore; pendingRestore = null; return openTool(h, { restore: r }); }
  if (!h || !HOST) { await loadState2(); return home(); }
  home();
}
if (ALL_PAGE) loadState2().then(boardsPage);
else {
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', () => { if (V) autosave({ keepalive: true }); });
  loadState2().then(route);
}
