// The look of Homeroom's board tools (docs/decisions.md "Homeroom: board tools"): the selected object's toolbar, its
// style popovers (Outline, Fill, Text style, Note color, More), the Shapes picker and the small glyphs they use. Only
// HTML here; public/js/homeroom-board.js decides what is selected and what a press does.
//   data-hrsel="<action>"  an action on the selection (edit, done, delete, dup, copy, cut, paste, front, back, lock,
//                          all, smaller, bigger)
//   data-hrpop="<name>"    opens or closes a popover (line, fill, text, note, more; shapes from the Board tools)
//   data-hrset="<f>:<v>"   sets one style field on the selection, or on the tool when the popover is the tool's
//   data-hrshape="<pick>"  a shape from the picker
import { t, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import * as B from '/js/board-shapes.js';

export const tb = (k, v) => t(`js.homeroom.bt.${k}`, v);
const tm = k => t(`js.manip-room.${k}`), ta = k => t(`js.board-ann.${k}`), th = k => t(`js.homeroom.${k}`);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const svg = (body, size = 18) => `<svg class="hr-gl" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** Small line glyphs for the actions emoji do not cover. */
export const GL = {
  redo: svg('<path d="M15 5l4 4-4 4"/><path d="M19 9H9a5 5 0 0 0 0 10h3"/>'),
  undo: svg('<path d="M9 5L5 9l4 4"/><path d="M5 9h10a5 5 0 0 1 0 10h-3"/>'),
  dup: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>'),
  paste: svg('<rect x="5" y="5" width="14" height="16" rx="2.5"/><path d="M9 5V3.5h6V5"/><path d="M9 11h6M9 15h4"/>'),
  front: svg('<rect x="9" y="9" width="11" height="11" rx="2" fill="currentColor"/><path d="M4 15V6a2 2 0 0 1 2-2h9"/>'),
  back: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  all: svg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 12l2 2 4-4"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
  caret: svg('<path d="M7 10l5 5 5-5"/>', 12),
  eraser: svg('<path d="M15.5 4.5l4 4a2 2 0 0 1 0 2.8L12 18.8H7.2l-3-3a2 2 0 0 1 0-2.8L12.7 4.5a2 2 0 0 1 2.8 0z"/><path d="M9 9l6 6"/><path d="M12 18.8h8"/>'),
  clear: svg('<path d="M14.5 4.5l5 5L11 18H7l-3-3 10.5-10.5z"/><path d="M9 10l5 5"/><path d="M11 18h9"/>'),
  al: { l: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), c: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'), r: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>') },
};
/** A line sample: its weight (px), dash and arrowheads, for the Outline popover and its button. */
function lineSample({ w = 4, d = 'solid', a = 'none' } = {}) {
  const dash = d === 'dash' ? ` stroke-dasharray="${Math.max(5, w * 1.8)} ${Math.max(4, w * 1.4)}"` : d === 'dot' ? ` stroke-dasharray="0.01 ${Math.max(4, w * 1.9)}"` : '';
  const head = (x, dir) => `<path d="M${x - dir * 7},5 L${x},12 L${x - dir * 7},19" stroke-width="2.4"/>`;
  return `<svg class="hr-gl" viewBox="0 0 40 24" width="34" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M${a === 'start' || a === 'both' ? 6 : 4},12 H${a === 'end' || a === 'both' ? 34 : 36}" stroke-width="${w}"${dash}/>${a === 'start' || a === 'both' ? head(3, -1) : ''}${a === 'end' || a === 'both' ? head(37, 1) : ''}</svg>`;
}
const SAMPLE_W = { S: 1.5, M: 3, L: 5.5, XL: 8 };
/** A shape's picture for the picker (and the Shapes button). */
export function shapeIcon(pick, size = 30) {
  const p = B.PICKS.find(x => x.id === pick) || B.PICKS[0], line = B.isLine(p.k), sq = ['circle', 'star', 'heart', 'oct', 'pent', 'hex', 'cross'].includes(p.k);
  const s = line ? { k: p.k, x: 0.12, y: 0.8, x2: 0.88, y2: 0.2, c: '#141414', a: p.a, w: 'L' } : { k: p.k, x: 0.1, y: sq ? 0.1 : 0.2, x2: 0.9, y2: sq ? 0.9 : 0.8, c: '#141414', f: '#FFD23F', w: 'L' };
  return `<svg class="hr-shico" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" focusable="false">${B.shapeSvg(s, 120, 120).replace(/stroke="#141414"/g, 'stroke="currentColor"').replace(/fill="#141414"/g, 'fill="currentColor"')}</svg>`;
}
/** The Shapes picker: shapes, then lines. */
export function pickerHtml(cur) {
  const item = p => btn(`hr-pick${p.id === cur ? ' on' : ''}`, `data-hrshape="${p.id}" aria-pressed="${p.id === cur}" aria-label="${esc(tb(`kinds.${p.id}`))}" title="${esc(tb(`kinds.${p.id}`))}"`, shapeIcon(p.id));
  return `<div class="hr-popin hr-picker" role="group" aria-label="${esc(tb('shapes'))}"><p class="hr-pophead">${esc(tb('shapes'))}</p>
    <div class="hr-pickgrid">${B.PICKS.filter(p => !B.isLine(p.k)).map(item).join('')}</div>
    <p class="hr-pophead">${esc(tb('lines'))}</p><div class="hr-pickgrid">${B.PICKS.filter(p => B.isLine(p.k)).map(item).join('')}</div>
    <p class="hr-pophint small">${esc(tb('hintShape'))}</p></div>`;
}

// ---------------------------------------------------------------- popovers
const swatch = (field, c, on, label) => btn(`hr-sw2${on ? ' on' : ''}${c === '#FFFFFF' ? ' light' : ''}`, `data-hrset="${field}:${c}" aria-pressed="${on}" aria-label="${esc(label)}" title="${esc(label)}" style="--sw:${c}"`, '');
const noneSw = (field, on, disabled = false) => btn(`hr-sw2 none${on ? ' on' : ''}`, `data-hrset="${field}:none" aria-pressed="${on}" aria-label="${esc(tb('none'))}" title="${esc(tb('none'))}"${disabled ? ' disabled' : ''}`, '');
export function paletteHtml(field, cur, { none = false, noneOk = true } = {}) {
  return `<div class="hr-pal" role="group">${none ? noneSw(field, cur === 'none' || cur == null, !noneOk) : ''}${B.PALETTE.map(c => swatch(field, c, c === cur, tb(`colors.${B.colorName(c)}`))).join('')}</div>`;
}
const seg = (field, opts, cur, label) => `<div class="hr-seg2" role="group" aria-label="${esc(label)}">${opts.map(([v, inner, name]) => btn(`hr-segb2${v === cur ? ' on' : ''}`, `data-hrset="${field}:${v}" aria-pressed="${v === cur}" aria-label="${esc(name)}" title="${esc(name)}"`, inner)).join('')}</div>`;
const row = (label, inner) => `<div class="hr-poprow"><p class="hr-pophead">${esc(label)}</p>${inner}</div>`;
/**
 * A popover's contents. kind: line | fill | text | note | more. v: the current values ({ c, w, d, a, f, fo, tc, b,
 * al, nc, lines, closed, noneOk, locked, canPaste, n }); mixed values show nothing picked.
 */
export function popHtml(kind, v) {
  if (kind === 'line') {
    return `<div class="hr-popin">${row(tb('color'), paletteHtml('c', v.c, { none: v.closed && !v.lines && !v.pen, noneOk: v.noneOk }))}
      ${row(tb('weight'), seg('w', B.WEIGHTS.map(w => [w, lineSample({ w: SAMPLE_W[w] }), tb(`weights.${w}`)]), v.w, tb('weight')))}
      ${row(tb('style'), seg('d', B.DASHES.map(d => [d, lineSample({ w: 3, d }), tb(`dashes.${d}`)]), v.d, tb('style')))}
      ${v.lines ? row(tb('arrows'), seg('a', B.ARROWS.map(a => [a, lineSample({ w: 2.5, a }), tb(`arrowsN.${a}`)]), v.a, tb('arrows'))) : ''}</div>`;
  }
  if (kind === 'fill') {
    return `<div class="hr-popin">${row(tb('fill'), paletteHtml('f', v.f, { none: true }))}
      ${row(tb('opacity'), seg('fo', B.OPACITIES.map(o => [String(o), `<span class="hr-opsw" style="--o:${o / 100}"></span>${o}%`, tb('opacityN', { n: o })]), v.fo == null ? null : String(v.fo), tb('opacity')))}</div>`;
  }
  if (kind === 'text') {
    return `<div class="hr-popin">${row(tb('textStyle'), `<div class="hr-seg2">${btn(`hr-segb2 hr-bold${v.b ? ' on' : ''}`, `data-hrset="b:${v.b ? '0' : '1'}" aria-pressed="${!!v.b}" aria-label="${esc(tb('bold'))}" title="${esc(tb('bold'))}"`, '<b>B</b>')}</div>
      ${seg('al', B.ALIGNS.map(a => [a, GL.al[a], tb(`alignN.${a}`)]), v.al, tb('align'))}`)}
      ${row(tb('textColor'), paletteHtml('tc', v.tc))}</div>`;
  }
  if (kind === 'note') {
    return `<div class="hr-popin">${row(tb('noteColor'), `<div class="hr-pal" role="group">${Object.entries(B.NOTE_COLORS).map(([k, c]) => btn(`hr-sw2 note${k === v.nc ? ' on' : ''}`, `data-hrset="nc:${k}" aria-pressed="${k === v.nc}" aria-label="${esc(tb(`noteColors.${k}`))}" title="${esc(tb(`noteColors.${k}`))}" style="--sw:${c}"`, '')).join('')}</div>`)}</div>`;
  }
  // more: copy, cut, paste, arrange, lock, select all
  const mi = (k, glyph, label, dis = false) => btn('rm-mi hr-mi', `data-hrsel="${k}" role="menuitem"${dis ? ' disabled' : ''}`, `${glyph}<span>${esc(label)}</span>`);
  return `<div class="hr-popin hr-moremenu" role="menu">${mi('copy', GL.copy, tb('copy'))}${mi('cut', iconHtml('✂️', { size: 18 }), tb('cut'), v.locked)}${mi('paste', GL.paste, tb('paste'))}
    ${mi('front', GL.front, tb('front'), v.locked)}${mi('back', GL.back, tb('back'), v.locked)}${mi('lock', v.allLocked ? GL.unlock : GL.lock, tb(v.allLocked ? 'unlock' : 'lock'))}${mi('all', GL.all, tb('selectAll'))}</div>`;
}

// ---------------------------------------------------------------- the selected object's toolbar
const sb = (k, label, inner, { cls = '', dis = false, pop = false, on = false } = {}) => btn(`hr-stb${cls ? ` ${cls}` : ''}${on ? ' open' : ''}`, `${pop ? `data-hrpop="${k}" aria-haspopup="true" aria-expanded="${on}"` : `data-hrsel="${k}"`} aria-label="${esc(label)}" title="${esc(label)}"${dis ? ' disabled' : ''}`, inner);
/** A color dot: a color, none (a red slash) or mixed (null: the selection's objects differ). */
const chip = c => `<span class="hr-chipsw${c === 'none' ? ' none' : c == null ? ' mixed' : ''}" style="--sw:${c && c !== 'none' ? c : 'transparent'}"></span>`;
/**
 * The toolbar's buttons for what is selected. v: { typed (one note or text), editing, notes, texts, draws (shapes or
 * pen lines), closed, lines, c, f, fs, nc, locked (all), pop (the open popover) }
 */
export function selToolsHtml(v) {
  const parts = [];
  if (v.locked) {
    parts.push(btn('hr-stb', 'data-hrsel="lock" aria-pressed="true"', `${GL.unlock} <span class="hr-stl">${esc(tb('unlock'))}</span>`));
    parts.push(sb('more', tb('more'), GL.more, { pop: true, on: v.pop === 'more' }));
    return parts.join('');
  }
  if (v.typed) parts.push(v.editing ? btn('hr-stb', 'data-hrsel="done"', `${iconHtml('✓', { size: 16 })} <span class="hr-stl">${esc(tm('done'))}</span>`) : btn('hr-stb', 'data-hrsel="edit"', `${iconHtml('✎', { size: 16 })} <span class="hr-stl">${esc(tm('edit'))}</span>`));
  if (v.texts) {
    parts.push(btn('hr-stb', `data-hrsel="smaller" aria-label="${esc(ta('smaller'))}" title="${esc(ta('smaller'))}"${v.fs === 'S' ? ' disabled' : ''}`, 'A−'), btn('hr-stb big', `data-hrsel="bigger" aria-label="${esc(ta('bigger'))}" title="${esc(ta('bigger'))}"${v.fs === 'XL' ? ' disabled' : ''}`, 'A+'));
    parts.push(sb('text', tb('textStyle'), `<span class="hr-aa" style="--sw:${v.tc || 'currentColor'}">Aa</span>${GL.caret}`, { pop: true, on: v.pop === 'text' }));
  }
  if (v.notes) parts.push(sb('note', tb('noteColor'), `${chip(B.NOTE_COLORS[v.nc] || B.NOTE_COLORS.yellow)}${GL.caret}`, { pop: true, on: v.pop === 'note' }));
  if (v.draws) parts.push(sb('line', tb('outline'), `${chip(v.c)}${lineSample({ w: SAMPLE_W[v.w || 'M'] || 3, d: v.d || 'solid' })}${GL.caret}`, { pop: true, on: v.pop === 'line', cls: 'wide' }));
  if (v.closed) parts.push(sb('fill', tb('fill'), `<span class="hr-filli">${chip(v.f)}</span><span class="hr-stl">${esc(tb('fill'))}</span>${GL.caret}`, { pop: true, on: v.pop === 'fill' }));
  parts.push(sb('dup', tb('duplicate'), GL.dup));
  parts.push(sb('more', tb('more'), GL.more, { pop: true, on: v.pop === 'more' }));
  parts.push(btn('hr-stb bad', `data-hrsel="delete" aria-label="${esc(th('sel.delete'))}" title="${esc(th('sel.delete'))}"`, `${iconHtml('🗑️', { size: 16 })} <span class="hr-stl">${esc(tm('delete'))}</span>`));
  return parts.join('');
}
/** The Board tools' row for the pen or the shape tool: its outline (and fill) as the next one will have it. */
export function toolStyleHtml(mode, st, pop) {
  const line = sb('line', tb('outline'), `${chip(st.c)}${lineSample({ w: SAMPLE_W[st.w || 'M'] || 3, d: st.d || 'solid' })}${GL.caret}`, { pop: true, on: pop === 'line', cls: 'wide' });
  const fill = mode === 'shape' && st.closed ? sb('fill', tb('fill'), `<span class="hr-filli">${chip(st.f || 'none')}</span>${GL.caret}`, { pop: true, on: pop === 'fill' }) : '';
  return `<div class="hr-toolstyle" role="group" aria-label="${esc(tb('nextStyle'))}">${line}${fill}</div>`;
}
