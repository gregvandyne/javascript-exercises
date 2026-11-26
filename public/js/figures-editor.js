// Figures, one editor for every kind (routes/figures.js GET /figures/:kind). The controls are made from the kind's data
// (public/js/figures-catalog.js): numbers become number boxes, true/false a switch, a value from a fixed list a select,
// words a text box, and lists and objects live in "Advanced (data)", a JSON box checked as it is typed. The figure is
// drawn live by the pinned Oomba Figures (the page loads only the pack this kind needs); data that cannot be drawn shows
// OF.check's reason in plain words and turns export off. Worked answers come from OF.solve. Undo and redo stay in the
// browser (public/js/figures-history.js: the last 100 changes, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y; the
// cannot-draw panel's Undo my last change is the same history). A figure can be linked (?d=), downloaded as SVG or PNG
// with Oomba's CC0 notice in the file (what that means: /figures/terms), copied, or added to a worksheet (where the
// server checks and answers it again). The ⋯ Presets menu lists the kind's examples first, then the teacher's own
// presets, with Save as my preset and Delete a preset.
// "Draw it" (triangles, the quadrilaterals and the coordinate grid): the teacher draws the shape on a dot grid
// (public/js/figures-draw.js) and its measures are worked out exactly (public/js/figures-draw-geom.js) and filled in as
// the kind's real data; a drawing that is not a shape, or not this kind of shape, says so and never changes the figure.
// The same corners can be a second figure too, plotted on a coordinate grid. Drawn shapes are in undo, redo and presets.
import { t, api, toast, esc, pageData, ask, askText, copyText, sheet } from '/js/app.js';
import { flatSolve, solveOf, numText, encodeData, KINDS } from '/js/figures-catalog.js';
import { parseNum, numShown, nlValue, nlWiden, nlFit, nlWhere } from '/js/figures-nl.js';
import { pngWithNotice } from '/js/figures-export.js';
import { createHistory, historyKey } from '/js/figures-history.js';
import { moreMenu, menuItem, menuGroup, menuSep, bindMenus } from '/js/figures-menu.js';
import { makeBoard } from '/js/figures-draw.js';
import { NAMES, CORNERS, analyze, triangleType, quadType, toData, gridData, lengthValue, lengthLabel, ptsText, parsePts } from '/js/figures-draw-geom.js';

const OF = window.OombaFigures;
const P = pageData('fg-editor');
const K = P.kind;
const app = document.getElementById('fg-editor-app');
const LANG = document.documentElement.lang || 'en';
const clone = o => JSON.parse(JSON.stringify(o));
const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
const tr = (prefix, k) => { const s = t(`${prefix}${k}`); return s.startsWith('js.') ? k : s; };
const fieldLabel = k => tr('js.figures-editor.f.', k);
const keyLabel = path => path.split('.').map(p => tr('js.figures-editor.k.', p)).join(' ');
const hideLabel = h => (h === true ? t('js.figures-editor.hideAll') : tr('js.figures-editor.hp.', h));
const D = (k, v) => t(`js.figures-editor.draw.${k}`, v);

// ---------------------------------------------------------------- "Draw it": which kinds, the grid's sizes, examples
const DRAW = K.id in CORNERS, GRIDK = K.id === 'grid';
// The number line has its own rows for intervals and points (public/js/figures-nl.js), and its range widens itself to
// fit them (docs/decisions.md "Figures: a friendlier number line").
const NL = K.id === 'numberLine';
const SIZES = [6, 8, 10, 12, 16, 20];
const originFor = n => (GRIDK ? [-n / 2, -n / 2] : [0, 0]);
const rangeOf = d => ({ x: [d.o[0], d.o[0] + d.n], y: [d.o[1], d.o[1] + d.n] });
/** Drawn examples for each kind (corners in order, on a 10 by 10 grid unless n says). */
const DRAW_EX = {
  triangle: [['ex.right', [[1, 4], [1, 1], [5, 1]]], ['ex.isosceles', [[1, 1], [7, 1], [4, 6]]], ['ex.obtuse', [[2, 1], [8, 1], [1, 4]]]],
  rectangle: [['t.rectangle', [[1, 1], [7, 1], [7, 4], [1, 4]]], ['t.square', [[3, 1], [7, 3], [5, 7], [1, 5]]]],
  parallelogram: [['t.parallelogram', [[1, 1], [6, 1], [8, 4], [3, 4]]], ['t.rhombus', [[1, 1], [6, 1], [9, 5], [4, 5]]]],
  trapezoid: [['t.isoTrapezoid', [[1, 1], [9, 1], [7, 5], [3, 5]]], ['t.rightTrapezoid', [[1, 1], [8, 1], [5, 5], [1, 5]]], ['t.trapezoid', [[1, 1], [9, 1], [6, 5], [2, 5]]]],
  kite: [['t.kite', [[5, 1], [7, 3], [5, 9], [3, 3]]]],
  grid: [['ex.pentagon', [[-3, -2], [2, -3], [4, 1], [0, 4], [-4, 2]]], ['ex.right', [[-3, 3], [-3, -1], [2, -1]]]],
};

// ---------------------------------------------------------------- state and history
const st = { data: clone(K.presets[0]), hide: false, print: false, question: '', answerKey: null, gen: null, seed: null, genResult: null, draw: { on: false, pts: [], n: 10, o: originFor(10), grid: false } };
const S = P.start;
/** A worksheet's multiple choice question: its options are set in the worksheet; the right one shows here (from the
 *  figure while it comes from a generator: saving back works it out again on the server). */
const CHOICE = !!(S && S.answerType === 'choice');
if (S) Object.assign(st, { data: clone(S.data), hide: S.hide ?? false, question: S.question || '', answerKey: S.answerKey || null, gen: S.gen || null, seed: S.seed || null });
const snap = () => JSON.stringify({ data: st.data, hide: st.hide, question: st.question, answerKey: st.answerKey, gen: st.gen, seed: st.seed, genResult: st.genResult, draw: st.draw });
// Undo and redo (public/js/figures-history.js): the last 100 changes to the figure, its question, answer and drawing.
const hist = createHistory({ snap, restore: s => { Object.assign(st, JSON.parse(s)); st.widen = null; if (DRAW) drawApply(); fields(); render(); }, limit: 100, onChange: () => buttons() });
function commit(now = false) { hist.commit(now); buttons(); }

// ---------------------------------------------------------------- the page
const ICON_UNDO = '<svg class="fg-svgi" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_REDO = ICON_UNDO.replace('<svg ', '<svg style="transform:scaleX(-1)" ');
const sel = (opts, cur) => opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
app.innerHTML = `<div class="fg-ed-head"><h1>${esc(P.name)}</h1>
  <div class="fg-ed-actions">
    <span class="fg-hist" role="group" aria-label="${esc(t('js.figures-editor.history'))}">
      <button class="btn fg-icon" type="button" data-act="undo" aria-keyshortcuts="Control+Z Meta+Z" title="${esc(t('js.figures-editor.undoTip'))}">${ICON_UNDO}<span class="sr-only">${esc(t('js.figures-editor.undo'))}</span></button>
      <button class="btn fg-icon" type="button" data-act="redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title="${esc(t('js.figures-editor.redoTip'))}">${ICON_REDO}<span class="sr-only">${esc(t('js.figures-editor.redo'))}</span></button></span>
    <span id="fg-presets"></span>
    <button class="btn btn-hot" type="button" data-act="random">🎲 ${esc(t('js.figures-editor.randomize'))}</button>
  </div></div>
<div class="fg-ed-grid">
  <section class="panel fg-ed-controls" aria-label="${esc(t('js.figures-editor.controls'))}"><div id="fg-fields"></div>
    ${NL ? '<div class="fg-nl" id="fg-nl"></div>' : ''}
    <details class="fg-adv" id="fg-adv"><summary>${esc(t('js.figures-editor.advanced'))}</summary>
      <p class="muted fg-small">${esc(t('js.figures-editor.advancedHelp'))}</p>
      <textarea class="input fg-json" id="fg-json" rows="10" spellcheck="false" aria-describedby="fg-json-msg"></textarea><p class="fg-small" id="fg-json-msg" role="status"></p></details>
    <h3 class="fg-h">${esc(t('js.figures-editor.display'))}</h3>
    <label class="fg-switch"><span>${esc(t('js.figures-editor.print'))}</span><input type="checkbox" id="fg-print"></label>
    ${K.nts ? `<label class="fg-switch"><span>${esc(t('js.figures-editor.nts'))}</span><input type="checkbox" id="fg-nts"></label>` : ''}
  </section>
  <section class="fg-ed-stage" aria-label="${esc(t('js.figures-editor.figure'))}">
    ${DRAW ? `<div class="fg-mode" role="group" aria-label="${esc(D('modeLabel'))}"><button type="button" class="fg-seg" data-act="mode" data-mode="type" aria-pressed="true">${esc(D('type'))}</button><button type="button" class="fg-seg" data-act="mode" data-mode="draw" aria-pressed="false">${esc(D('draw'))}</button></div>
    <section class="fg-draw" id="fg-draw" aria-labelledby="fg-draw-h" hidden>
      <div class="fg-draw-top"><h2 class="fg-h" id="fg-draw-h">${esc(D('title'))}</h2>
        <label class="fg-dsize"><span>${esc(D('size'))}</span><select class="input" id="fg-dsize"></select></label>
        <button class="btn" type="button" data-act="dclear">${esc(D('clear'))}</button></div>
      <p class="muted fg-small" id="fg-dhelp">${esc(D(`help.${GRIDK ? 'grid' : K.id === 'triangle' ? 'triangle' : 'quad'}`))} ${esc(D('keys'))}</p>
      <div class="fg-draw-body"><div class="fg-board-wrap" id="fg-board" data-describedby="fg-dhelp"></div><div class="fg-dm" id="fg-dm"></div></div>
      <div id="fg-dmsg" role="status" aria-live="polite"></div>
      ${GRIDK ? '' : `<label class="fg-switch"><span>${esc(D('gridOut'))}</span><input type="checkbox" id="fg-dgrid"></label>`}
    </section>
    ${GRIDK ? '' : `<section class="panel fg-gridout" id="fg-gridout" aria-labelledby="fg-gridout-h" hidden><h3 class="fg-h" id="fg-gridout-h">${esc(D('gridTitle'))}</h3>
      <div class="fg-ed-figure fg-gridfig" id="fg-gridfig"></div><div class="fg-add" id="fg-gaddbox"></div><p class="notice good fg-small" id="fg-gadded" role="status" hidden></p></section>`}` : ''}
    <div class="panel fg-ed-figure" id="fg-figure" aria-live="polite"></div>
    <p class="muted fg-small fg-stale-note" id="fg-stale" role="status" hidden>${esc(t('js.figures-editor.stale'))}</p>
    <div class="fg-cant" id="fg-cant" role="alert" hidden></div>
    <p class="sr-only" id="fg-hist-msg" role="status" aria-live="polite"></p>
    <details class="fg-codebox" id="fg-codebox"><summary>${esc(t('js.figures-editor.showCode'))}</summary><p class="muted fg-small">${esc(t('js.figures-editor.codeHelp'))}</p><code class="fg-code" id="fg-code" dir="ltr"></code></details>
  </section>
  <section class="panel fg-ed-side" aria-label="${esc(t('js.figures-editor.answers'))}">
    <h3 class="fg-h"><label for="fg-question">${esc(t('js.figures-editor.question'))}</label></h3>
    <textarea class="input fg-qbox" id="fg-question" rows="3" maxlength="400" placeholder="${esc(t('js.figures-editor.questionHint'))}"></textarea>
    <h3 class="fg-h">${esc(t('js.figures-editor.worked'))}</h3>
    <div id="fg-answer"></div>
    <label class="fg-block"><span>${esc(t('js.figures-editor.answerIs'))}</span><select class="input" id="fg-key"></select></label>
    <details class="fg-facts" id="fg-factsbox" open><summary>${esc(t('js.figures-editor.facts'))}</summary><dl id="fg-facts"></dl></details>
    <label class="fg-switch"><span>${esc(t('js.figures-editor.hide'))}</span><input type="checkbox" id="fg-hide"></label>
    <label class="fg-block" id="fg-hidewhat" hidden><span>${esc(t('js.figures-editor.hideWhat'))}</span><select class="input" id="fg-hidepart">${sel(K.hide.map(h => [String(h), hideLabel(h)]), String(K.hide[0]))}</select></label>
    <div class="fg-add" id="fg-addbox"></div>
    <div class="fg-exports">
      <button class="btn" type="button" data-act="svg" data-needs-ok>${esc(t('js.figures-editor.svg'))}</button>
      <button class="btn" type="button" data-act="png" data-needs-ok>${esc(t('js.figures-editor.png'))}</button>
      <button class="btn" type="button" data-act="copy" data-needs-ok>${esc(t('js.figures-editor.copy'))}</button>
      <button class="btn" type="button" data-act="link">${esc(t('js.figures-editor.link'))}</button>
    </div>
    <p class="muted fg-small">${esc(t('js.figures-editor.notice'))} <a href="/figures/terms">${esc(t('js.figures-editor.reuseLink'))}</a></p>
  </section>
</div>`;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- presets, in the ⋯ More menu
// The kind's examples first (and its drawn examples), then the teacher's own presets; Save as preset names the figure as
// it is now (with its drawing), Delete a preset lists theirs, each deleted after a question.
let mine = P.mine || [];
function presets() {
  const items = menuGroup(t('js.figures-editor.examples'), P.presets.map((p, i) => menuItem('apply', p.name, { attrs: ` data-p="x${i}"` })).join(''))
    + (DRAW ? menuGroup(D('examples'), DRAW_EX[K.id].map(([k, pts], i) => menuItem('apply', D(k, { count: pts.length }), { attrs: ` data-p="d${i}"` })).join('')) : '')
    + (mine.length ? menuGroup(t('js.figures-editor.mine'), mine.map(p => menuItem('apply', p.name, { attrs: ` data-p="m${esc(p.id)}"` })).join('')) : '')
    + menuSep()
    + menuItem('preset', t('js.figures-editor.savePreset'), { attrs: ' data-needs-ok' })
    + (mine.length ? menuItem('delpresets', t('js.figures-editor.deletePresets')) : '');
  $('fg-presets').innerHTML = moreMenu({ label: t('js.figures-editor.moreLabel'), items, cls: 'fg-presetmenu', text: t('js.figures-editor.presetsBtn'), icon: '⋯' });
  if (typeof render === 'function' && rendered) for (const b of $('fg-presets').querySelectorAll('[data-needs-ok]')) b.disabled = problems().length > 0;
}
function applyPreset(v) {
  if (v[0] === 'd' && DRAW_EX[K.id] && DRAW_EX[K.id][+v.slice(1)]) { startDrawing(DRAW_EX[K.id][+v.slice(1)][1], 10); return; }
  const p = v[0] === 'x' ? P.presets[+v.slice(1)] : mine.find(m => `m${m.id}` === v);
  if (!p) return;
  if (DRAW && p.draw && Array.isArray(p.draw.pts)) { startDrawing(p.draw.pts, p.draw.n, p.draw.o); return; }
  Object.assign(st, { data: clone(p.data), gen: null, seed: null, genResult: null, answerKey: null, widen: null });
  if (DRAW) { st.draw.on = false; drawApply(); }
  fields(); render(); commit(true);
}
/** Delete a preset: the teacher's presets for this kind, each with Delete (after a question). */
function deletePresets() {
  const list = () => (mine.length ? `<ul class="fg-plist">${mine.map(p => `<li><span>${esc(p.name)}</span><button class="btn btn-sm fg-danger" type="button" data-delp="${esc(p.id)}">${esc(t('js.figures-editor.deletePreset'))}<span class="sr-only"> ${esc(p.name)}</span></button></li>`).join('')}</ul>`
    : `<p class="muted">${esc(t('js.figures-editor.noPresets'))}</p>`);
  const sh = sheet({ title: t('js.figures-editor.deletePresets'), content: `<div id="fg-plist">${list()}</div>` });
  sh.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-delp]'); if (!b) return;
    const p = mine.find(m => m.id === b.dataset.delp); if (!p) return;
    if (!(await ask({ title: t('js.figures-editor.deletePresetQ', { name: p.name }), text: t('js.figures-editor.deletePresetText'), ok: t('js.figures-editor.deletePreset'), danger: true }))) return;
    try {
      await api(`/api/figures/presets/${encodeURIComponent(p.id)}/delete`, { method: 'POST', body: {} });
      mine = mine.filter(m => m.id !== p.id); presets();
      sh.el.querySelector('#fg-plist').innerHTML = list();
      (sh.el.querySelector('[data-delp]') || sh.el.querySelector('.close')).focus();
      toast(t('js.figures-editor.presetDeleted', { name: p.name }));
    } catch (x) { toast(x.message, { bad: true }); }
  });
}
let rendered = false;
presets();
bindMenus(app, it => {
  if (it.dataset.mi === 'apply') applyPreset(it.dataset.p);
  else if (it.dataset.mi === 'delpresets') deletePresets();
  else if (ACTS[it.dataset.mi]) ACTS[it.dataset.mi](it);
});

// ---------------------------------------------------------------- the controls, from the kind's data
const SKIP = new Set(['notToScale', 'drawAs', 'hide', 'kind']);
const typeOf = (k, v) => (K.options && K.options[k] ? 'enum' : K.extra && K.extra[k] ? K.extra[k] : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'text' : v === undefined ? null : 'json');
// ---------------------------------------------------------------- number boxes that forgive (public/js/figures-nl.js)
// A number box is a text box: a phone's number pad has no minus key (and no "/"), so the box opens the decimal pad with a
// ± key beside it on touch screens, and the number line's from, to and step open the full keyboard for fractions (3/4)
// and π. What is still being typed ("-", "1/", an empty box) waits quietly; the figure keeps its last good drawing.
const PI_FIELDS = new Set(NL ? ['from', 'to', 'step'] : []);
/** Measures that can be below 0 (any kind's example has one below 0, or the measure is a position, a reading or a charge):
 *  their box has the ± key on a touch screen. */
const NEG = new Set(['from', 'to', 'min', 'max', 'angle', 'charge', 'start', 'value', 'initial', 'before', 'after', 'yaw', 'pitch', 'trend', 'x', 'y',
  ...KINDS.flatMap(k => k.presets.flatMap(p => Object.entries(p).filter(([, v]) => typeof v === 'number' && v < 0).map(([key]) => key)))]);
const PM = t('js.figures-editor.pm');
/** One number box: its label, the box, the ± key (touch screens), the exact form of a √ length, its message. */
function numBox({ id, label, value, attrs, pi = false, neg = false, disabled = false }) {
  // A length given exactly ({ sqrt: 13 }) shows its value, and its exact form under it, until it is typed over; a
  // fraction or a multiple of π shows as it is written (3/4, π/2).
  const shown = numShown(value) || (Number.isFinite(lengthValue(value)) ? numText(lengthValue(value), 4) : '');
  const exact = value && typeof value === 'object' && !Array.isArray(value) && 'sqrt' in value ? lengthLabel(value) : '';
  return `<label class="fg-num"><span>${esc(label)}</span><span class="fg-numbox"><input class="input" type="text" inputmode="${pi ? 'text' : 'decimal'}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" dir="ltr" id="${id}" ${attrs} value="${esc(shown)}" aria-describedby="${id}-m"${disabled ? ' disabled' : ''}>${neg && !disabled ? `<button type="button" class="fg-pm" data-pm="${id}" tabindex="-1" aria-label="${esc(PM)}" title="${esc(PM)}">±</button>` : ''}</span>${exact ? `<small class="fg-exact" dir="ltr">= ${esc(exact)}</small>` : ''}<small class="fg-fmsg" id="${id}-m"></small></label>`;
}
/** A box being typed in: mode 'ok' (a number), 'partial' (not one yet: the figure waits, nothing is said) or 'bad' (not a
 *  number: a word under this box only, never a red page). */
function hold(el, mode) {
  const m = document.getElementById(`${el.id}-m`);
  if (mode === 'ok') delete el.dataset.hold; else el.dataset.hold = mode;
  el.classList.toggle('fg-typo', mode === 'bad');
  if (m) { m.dataset.typing = mode === 'bad' ? '1' : ''; if (mode !== 'ok') m.textContent = mode === 'bad' ? t('js.figures-editor.typeNumber') : ''; }
}
/** A box left: what was not a number goes back to the figure's value (the figure never changed). */
function settle(el) {
  const was = !!el.dataset.hold;
  if (was) hold(el, 'ok');
  syncBoxes(true);
  if (was) render();
}
/** The boxes show the figure's numbers again (a widened range, a value tidied), except the one being typed in. */
function syncBoxes(all = false) {
  const focus = all ? null : document.activeElement;
  for (const el of app.querySelectorAll('input[data-ty="number"],input[data-nl-num]')) {
    if (el === focus || el.dataset.hold) continue;
    const v = el.dataset.f ? st.data[el.dataset.f] : nlGet(el);
    const want = numShown(v) || (Number.isFinite(lengthValue(v)) ? numText(lengthValue(v), 4) : '');
    if (el.value !== want && !(el.dataset.f && v && typeof v === 'object' && 'sqrt' in v)) el.value = want;
  }
  if (document.activeElement !== $('fg-json')) $('fg-json').value = JSON.stringify(st.data, null, 2);
}
// ± on a touch screen: the box keeps its focus (and the keyboard stays up).
app.addEventListener('pointerdown', e => { if (e.target.closest('[data-pm]')) e.preventDefault(); });
app.addEventListener('click', e => {
  const b = e.target.closest('[data-pm]'); if (!b) return;
  e.preventDefault();
  const el = document.getElementById(b.dataset.pm); if (!el || el.disabled) return;
  const v = el.value.trim().replace(/^[−–]/, '-');
  el.value = v.startsWith('-') ? v.slice(1) : `-${v}`;
  el.focus({ preventScroll: true });
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// ---------------------------------------------------------------- the number line: its range, intervals and points
/** The range widens to fit an interval or a point that falls outside it, with a note that says so (and a way back). */
function widen() {
  if (!NL) return;
  const w = nlWiden(st.data);
  if (w.widened) st.data = w.data;
  st.widen = w.widened || null;
}
const nlList = k => (Array.isArray(st.data[k]) ? st.data[k] : []);
function nlGet(el) { const it = nlList(el.dataset.list)[+el.dataset.i]; return it ? it[el.dataset.k] : undefined; }
const NLX = k => t(`js.figures-editor.nl.${k}`);
const nlRange = () => { const F = nlValue(st.data.from), T = nlValue(st.data.to), S = nlValue(st.data.step === undefined ? 1 : st.data.step); return { F, T, S, n: Number.isFinite(F) && Number.isFinite(T) && S > 0 ? Math.max(0, Math.round((T - F) / S)) : 0 }; };
const nlTick = i => { const { F, S } = nlRange(); return +(F + i * S).toFixed(10); };
function nlRows() {
  const box = $('fg-nl'); if (!box) return;
  const ends = (side, it) => (it[side] == null ? 'ray' : it[`${side}Closed`] === false ? 'open' : 'closed');
  const endSel = (i, side, it) => `<label class="fg-block fg-nlend"><span>${esc(NLX(side === 'from' ? 'leftEnd' : 'rightEnd'))}</span><select class="input" data-nl-end data-list="intervals" data-i="${i}" data-k="${side}">${sel([['closed', NLX('closed')], ['open', NLX('open')], ['ray', NLX(side === 'from' ? 'rayLeft' : 'rayRight')]], ends(side, it))}</select></label>`;
  const ivs = nlList('intervals'), pts = nlList('points');
  const iv = (it, i) => `<fieldset class="fg-nlrow" data-row="interval ${i + 1}"><legend>${esc(t('js.figures-editor.nl.interval', { n: i + 1 }))}</legend>
    <div class="fg-nlgrid">${numBox({ id: `fg-iv${i}-from`, label: NLX('from'), value: it.from, attrs: `data-nl-num data-list="intervals" data-i="${i}" data-k="from"`, pi: true, neg: true, disabled: it.from == null })}${endSel(i, 'from', it)}
    ${numBox({ id: `fg-iv${i}-to`, label: NLX('to'), value: it.to, attrs: `data-nl-num data-list="intervals" data-i="${i}" data-k="to"`, pi: true, neg: true, disabled: it.to == null })}${endSel(i, 'to', it)}</div>
    <p class="fg-fmsg fg-rowmsg" data-rowmsg></p>
    <button class="btn btn-sm" type="button" data-act="nldel" data-list="intervals" data-i="${i}">${esc(NLX('remove'))}<span class="sr-only"> ${esc(t('js.figures-editor.nl.interval', { n: i + 1 }))}</span></button></fieldset>`;
  const pt = (p, i) => `<fieldset class="fg-nlrow" data-row="point ${i + 1}"><legend>${esc(t('js.figures-editor.nl.point', { n: i + 1 }))}</legend>
    <div class="fg-nlgrid">${numBox({ id: `fg-pt${i}-at`, label: NLX('at'), value: p.at, attrs: `data-nl-num data-list="points" data-i="${i}" data-k="at"`, pi: true, neg: true })}
    <label class="fg-block"><span>${esc(NLX('letter'))}</span><input class="input" type="text" maxlength="6" autocomplete="off" autocapitalize="off" data-nl-text data-list="points" data-i="${i}" data-k="label" value="${esc(typeof p.label === 'string' ? p.label : '')}"></label>
    <label class="fg-block"><span>${esc(NLX('mark'))}</span><select class="input" data-nl-mark data-list="points" data-i="${i}">${sel([['dot', NLX('dot')], ['cross', NLX('cross')]], p.mark === 'cross' ? 'cross' : 'dot')}</select></label></div>
    <label class="fg-switch"><span>${esc(NLX('showValue'))}</span><input type="checkbox" data-nl-value data-list="points" data-i="${i}"${p.value === true ? ' checked' : ''}></label>
    <p class="fg-fmsg fg-rowmsg" data-rowmsg></p>
    <button class="btn btn-sm" type="button" data-act="nldel" data-list="points" data-i="${i}">${esc(NLX('remove'))}<span class="sr-only"> ${esc(t('js.figures-editor.nl.point', { n: i + 1 }))}</span></button></fieldset>`;
  box.innerHTML = `<h3 class="fg-h">${esc(NLX('intervals'))}</h3>${ivs.map(iv).join('')}
    <button class="btn fg-wide" type="button" data-act="nladd" data-list="intervals"${ivs.length >= 12 ? ' disabled' : ''}>+ ${esc(NLX('addInterval'))}</button>
    <h3 class="fg-h">${esc(NLX('points'))}</h3>${pts.map(pt).join('')}
    <button class="btn fg-wide" type="button" data-act="nladd" data-list="points"${pts.length >= 30 ? ' disabled' : ''}>+ ${esc(NLX('addPoint'))}</button>`;
}
/** A change to an interval or a point: the data follows, the range widens if it must, the figure redraws. */
function nlChange({ rows = false, typing = false } = {}) {
  widen(); changed(); if (rows) nlRows(); render({ typing }); commit(rows); syncBoxes();
}
function nlItem(el) {
  const k = el.dataset.list, list = nlList(k).map(x => ({ ...x }));
  st.data[k] = list;
  return list[+el.dataset.i];
}
if (NL) {
  $('fg-nl').addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-nl-num]')) {
      const r = parseNum(el.value, { pi: true });
      if (!('value' in r)) { hold(el, r.bad ? 'bad' : 'partial'); return; }
      hold(el, 'ok');
      nlItem(el)[el.dataset.k] = r.value;
      nlChange({ typing: true });
    } else if (el.matches('[data-nl-text]')) {
      const it = nlItem(el), v = el.value.trim();
      if (v) it.label = v; else delete it.label;
      nlChange({ typing: true });
    }
  });
  $('fg-nl').addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-nl-num]')) return settle(el);
    if (el.matches('[data-nl-end]')) {
      const it = nlItem(el), side = el.dataset.k, { F, T, S } = nlRange(), step = S > 0 ? S : 1;
      if (el.value === 'ray') { delete it[side]; delete it[`${side}Closed`]; } else {
        // An end that ran off the line comes back at the line's own end, always on the right side of the other end.
        const other = it[side === 'from' ? 'to' : 'from'] == null ? NaN : nlValue(it[side === 'from' ? 'to' : 'from']);
        if (it[side] == null) it[side] = side === 'from' ? (Number.isFinite(other) && other <= F ? +(other - step).toFixed(10) : Number.isFinite(F) ? st.data.from : 0)
          : (Number.isFinite(other) && other >= T ? +(other + step).toFixed(10) : Number.isFinite(T) ? st.data.to : 1);
        if (el.value === 'open') it[`${side}Closed`] = false; else delete it[`${side}Closed`];
      }
      nlChange({ rows: true });
    } else if (el.matches('[data-nl-mark]')) { const it = nlItem(el); if (el.value === 'cross') it.mark = 'cross'; else delete it.mark; nlChange({ rows: true }); }
    else if (el.matches('[data-nl-value]')) { const it = nlItem(el); if (el.checked) it.value = true; else delete it.value; nlChange({ rows: true }); }
    else if (el.matches('[data-nl-text]')) commit(true);
  });
}
/** Words for the note under the range: widened to fit, with "Keep 2 to 5" (what does not fit is left out). */
function nlNote() {
  const box = $('fg-nlnote'); if (!box) return;
  const w = st.widen;
  const html = w ? `<div class="fg-nlnote"><p>${esc(t('js.figures-editor.nl.widened', { from: numShown(w.newFrom), to: numShown(w.newTo) }))}</p><button class="btn btn-sm" type="button" data-act="nlkeep">${esc(t('js.figures-editor.nl.keep', { from: numShown(w.from), to: numShown(w.to) }))}</button></div>` : '';
  if (box.dataset.last !== html) { box.innerHTML = html; box.dataset.last = html; }
}

function fields() {
  const ex = K.presets[0], keys = [...new Set([...Object.keys(K.extra || {}), ...Object.keys(ex), ...Object.keys(st.data), ...Object.keys(K.options || {})])].filter(k => !SKIP.has(k));
  const groups = { number: [], enum: [], bool: [], text: [] };
  for (const k of keys) { const ty = typeOf(k, st.data[k] !== undefined ? st.data[k] : ex[k]); if (groups[ty]) groups[ty].push(k); }
  const id = k => `fg-f-${k.replace(/[^\w-]/g, '_')}`;
  const num = k => numBox({ id: id(k), label: fieldLabel(k), value: st.data[k], attrs: `data-f="${esc(k)}" data-ty="number"`, pi: PI_FIELDS.has(k), neg: NEG.has(k) });
  const en = k => `<label class="fg-block"><span>${esc(fieldLabel(k))}</span><select class="input" id="${id(k)}" data-f="${esc(k)}" data-ty="enum">${sel([['', t('js.figures-editor.default')], ...K.options[k].filter(o => o !== '').map(o => [o, o])], st.data[k] ?? '')}</select></label>`;
  const bo = k => `<label class="fg-switch"><span>${esc(fieldLabel(k))}</span><input type="checkbox" id="${id(k)}" data-f="${esc(k)}" data-ty="bool"${st.data[k] === true ? ' checked' : ''}></label>`;
  const tx = k => `<label class="fg-block"><span>${esc(fieldLabel(k))}</span><input class="input" type="text" id="${id(k)}" data-f="${esc(k)}" data-ty="text" maxlength="80" value="${esc(typeof st.data[k] === 'string' ? st.data[k] : '')}"></label>`;
  $('fg-fields').innerHTML = (groups.number.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.measures'))}</h3><div class="fg-nums">${groups.number.map(num).join('')}</div>${K.extra ? `<p class="muted fg-small">${esc(t('js.figures-editor.leaveEmpty'))}</p>` : ''}` : '')
    + (groups.enum.length || groups.text.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.options'))}</h3>${groups.enum.map(en).join('')}${groups.text.map(tx).join('')}` : '')
    + (groups.bool.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.show'))}</h3>${groups.bool.map(bo).join('')}` : '')
    + (NL ? `<p class="muted fg-small">${esc(t('js.figures-editor.nl.typeHelp'))}</p><div id="fg-nlnote" role="status"></div>` : '');
  if (NL) nlRows();
  const hasJson = keys.some(k => typeOf(k, st.data[k] !== undefined ? st.data[k] : ex[k]) === 'json') || 'drawAs' in st.data;
  if (hasJson && !$('fg-adv').dataset.touched) $('fg-adv').open = !groups.number.length && !groups.enum.length;
  if (document.activeElement !== $('fg-json')) $('fg-json').value = JSON.stringify(st.data, null, 2);
  $('fg-json-msg').textContent = ''; $('fg-json').classList.remove('bad');
  $('fg-print').checked = st.print;
  if ($('fg-nts')) $('fg-nts').checked = st.data.notToScale === true;
  $('fg-question').value = st.question;
  $('fg-hide').checked = st.hide !== false;
  $('fg-hidewhat').hidden = st.hide === false;
  if (st.hide !== false) $('fg-hidepart').value = String(st.hide);
}
$('fg-fields').addEventListener('input', e => {
  const el = e.target.closest('[data-f]'); if (!el) return;
  const k = el.dataset.f, ty = el.dataset.ty, inEx = k in K.presets[0];
  if (ty === 'number') {
    const r = parseNum(el.value, { pi: PI_FIELDS.has(k) });
    // Still being typed ("-", "1/", an empty box the figure needs): the figure waits, nothing shouts. Not a number: a
    // word under this box only. A box a kind may leave empty (its "extra" measures) is left out when emptied.
    if (!('value' in r) && !(r.empty && K.extra && k in K.extra)) { hold(el, r.bad ? 'bad' : 'partial'); return; }
    hold(el, 'ok');
    if (r.empty) delete st.data[k]; else st.data[k] = r.value;
  } else if (ty === 'bool') { if (el.checked) st.data[k] = true; else if (inEx) st.data[k] = false; else delete st.data[k]; }
  else if (ty === 'enum' || ty === 'text') { if (el.value === '') delete st.data[k]; else st.data[k] = el.value; }
  if (ty === 'number') typed();
  widen();
  changed(); render({ typing: ty === 'number' || ty === 'text' }); commit();
  syncBoxes();
});
$('fg-fields').addEventListener('change', e => { if (e.target.closest('[data-ty="enum"],[data-ty="bool"]')) fields(); else if (e.target.closest('[data-ty="number"]')) settle(e.target); });
$('fg-adv').addEventListener('toggle', () => { $('fg-adv').dataset.touched = '1'; });
$('fg-json').addEventListener('input', () => {
  let o = null, msg = '';
  try { o = JSON.parse($('fg-json').value); if (!o || typeof o !== 'object' || Array.isArray(o)) { o = null; msg = t('js.figures-editor.jsonObject'); } } catch (e) { msg = t('js.figures-editor.jsonBad', { why: String(e.message).slice(0, 120) }); }
  $('fg-json').classList.toggle('bad', !o); $('fg-json-msg').textContent = msg; $('fg-json-msg').classList.toggle('fg-bad', !o);
  if (!o) return;
  st.data = o; st.widen = null; typed(); changed(); if (NL) nlRows(); render({ typing: true }); commit();
});
$('fg-json').addEventListener('blur', () => { if (!$('fg-json').classList.contains('bad')) fields(); });
$('fg-print').addEventListener('change', () => { st.print = $('fg-print').checked; render(); });
if ($('fg-nts')) $('fg-nts').addEventListener('change', () => { if ($('fg-nts').checked) st.data.notToScale = true; else { delete st.data.notToScale; delete st.data.drawAs; } changed(); fields(); render(); commit(true); });
$('fg-question').addEventListener('input', () => { st.question = $('fg-question').value; commit(); });
$('fg-hide').addEventListener('change', () => { st.hide = $('fg-hide').checked ? (K.hide[0] === true ? true : String(K.hide[0])) : false; fields(); render(); commit(true); });
$('fg-hidepart').addEventListener('change', () => { const v = $('fg-hidepart').value; st.hide = v === 'true' ? true : v; render(); commit(true); });
$('fg-key').addEventListener('change', () => { st.answerKey = $('fg-key').value || null; answers(); commit(true); });
/** The figure is no longer exactly what its generator made: it is the teacher's own now (as the server decides too). */
function changed() { if (st.genResult && canon(st.genResult.data) !== canon(st.data)) { st.gen = null; st.seed = null; st.genResult = null; } }
/** A measure typed in: the figure follows what was typed, so the editor is back in Type the measures. */
function typed() { if (DRAW && st.draw.on) { st.draw.on = false; drawShow(); } }

// ---------------------------------------------------------------- drawing, the cannot-draw state and the answers
const WHY = [[/cannot make a triangle|has to be longer than/i, 'triangle'], [/180/, 'angles'], [/too short|cannot reach|never meet/i, 'short'], [/agree|contradict/i, 'agree'],
  [/drawAs|notToScale/, 'drawAs'], [/positive|more than 0|greater than 0|above 0/i, 'positive'], [/between|at most|at least|from .* to|range/i, 'range'], [/leave out|only one of|instead of/i, 'extra'], [/JSON|object|could not be read/i, 'data']];
const problems = () => { try { return OF.check(K.id, st.data); } catch (e) { return [String(e.message)]; } };
const opts = () => ({ hide: st.hide === false ? false : st.hide, print: st.print, lang: LANG, title: st.question || P.name });
/** Each problem in its place: next to the box or row it is about (the number line's ranges, intervals and points; any
 *  kind's problem that starts with a measure's name), or the page's cannot-draw panel. -> { at: { place: words }, rest }. */
function place(bad) {
  const at = {}, rest = [];
  const box = k => app.querySelector(`#fg-fields [data-f="${CSS.escape(k)}"]`), row = k => app.querySelector(`#fg-nl [data-row="${CSS.escape(k)}"]`);
  for (const p of bad) {
    let where = null, words = '';
    if (NL) { const w = nlWhere(p); where = w.at; words = w.key ? t(`js.figures-editor.nl.why.${w.key}`, w.vars) : t('js.figures-editor.ofSays', { reason: p }); }
    else { const m = /^"(\w+)"/.exec(p); if (m) { where = m[1]; words = t('js.figures-editor.ofSays', { reason: p }); } }
    if (where && (box(where) || row(where))) { if (!(where in at)) at[where] = words; } else rest.push(p);
  }
  return { at, rest };
}
let lastGood = null, cantTimer = 0;
/** typing: the change came from a box being typed in, so the cannot-draw panel waits a moment (a half-typed number is
 *  not a mistake yet). */
function render({ typing = false } = {}) {
  const bad = problems(), box = $('fg-figure'), { at, rest } = place(bad);
  box.innerHTML = '';
  // A problem shown next to its box keeps the last figure that worked on the page, faded, until it is fixed.
  const stale = bad.length > 0 && !rest.length && lastGood;
  if (stale) box.appendChild(lastGood.cloneNode(true));
  else { const svg = OF.draw(K.id, st.data, opts()); box.appendChild(svg); if (!bad.length) lastGood = svg.cloneNode(true); }
  box.classList.toggle('fg-stale', !!stale);
  $('fg-stale').hidden = !stale;
  box.classList.toggle('fg-print-on', st.print);
  const cant = $('fg-cant');
  clearTimeout(cantTimer);
  if (rest.length) {
    const why = (WHY.find(([re]) => re.test(rest[0])) || [null, 'generic'])[1];
    // The same panel is not built again (a tap on its Undo would land on a button that just left the page).
    const show = () => {
      const html = `<h3>⚠ ${esc(t(`js.figures-editor.why.${why}.t`))}</h3><p>${esc(t(`js.figures-editor.why.${why}.p`))}</p>
      <p class="fg-small">${esc(t('js.figures-editor.ofSays', { reason: rest.slice(0, 3).join('; ') }))}</p>
      <div class="row"><button class="btn btn-primary" type="button" data-act="undo"${hist.canUndo() ? '' : ' disabled'}>${esc(t('js.figures-editor.undoLast'))}</button><button class="btn" type="button" data-act="example">${esc(t('js.figures-editor.backToExample'))}</button>${DRAW && !st.draw.on ? `<button class="btn btn-hot" type="button" data-act="drawit">✏️ ${esc(D('drawInstead'))}</button>` : ''}</div>`;
      if (cant.dataset.last !== html) { cant.innerHTML = html; cant.dataset.last = html; }
      cant.hidden = false;
    };
    if (typing && cant.hidden) cantTimer = setTimeout(show, 900); else show();
  } else cant.hidden = true;
  // the words next to each box and row (a box still being typed in keeps its own "Type a number")
  for (const el of app.querySelectorAll('#fg-fields input[data-ty="number"]')) {
    const k = el.dataset.f, m = document.getElementById(`${el.id}-m`);
    el.classList.toggle('bad', k in at);
    el.setAttribute('aria-invalid', String(k in at));
    if (m && m.dataset.typing !== '1') m.textContent = at[k] || '';
  }
  for (const r of app.querySelectorAll('#fg-nl [data-row]')) {
    const k = r.dataset.row, m = r.querySelector('[data-rowmsg]');
    r.classList.toggle('bad', k in at);
    if (m) m.textContent = at[k] || '';
  }
  if (NL) nlNote();
  $('fg-code').textContent = `OF.svg('${K.id}', ${JSON.stringify(st.data)}${st.hide !== false ? `, { hide: ${JSON.stringify(st.hide)} }` : ''})`;
  for (const b of document.querySelectorAll('[data-needs-ok]')) b.disabled = bad.length > 0;
  rendered = true;
  answers(bad);
  addBox(bad);
  if (DRAW) drawShow();
  buttons();
}
function answers(bad = problems()) {
  if (CHOICE) {
    $('fg-key').closest('label').hidden = true;
    $('fg-answer').innerHTML = `<p class="muted fg-small">${esc(t('js.figures-editor.choiceNote'))}</p><ol class="fg-work" type="A">${(S.choices || []).map((c, i) => `<li${i === S.correct ? ' class="fg-big"' : ''}>${esc(c)}${i === S.correct ? ' ✓' : ''}</li>`).join('')}</ol>`;
    $('fg-factsbox').hidden = true;
    return;
  }
  const solve = bad.length ? null : solveOf(OF, K.id, st.data), flat = solve ? flatSolve(solve) : {}, keys = Object.keys(flat);
  if (st.answerKey && !(st.answerKey in flat)) st.answerKey = null;
  $('fg-key').innerHTML = sel([['', keys.length ? t('js.figures-editor.pickAnswer') : t('js.figures-editor.noAnswers')], ...keys.slice(0, 60).map(k => [k, `${keyLabel(k)} = ${numText(flat[k], 2)}`])], st.answerKey || '');
  $('fg-key').disabled = !keys.length;
  $('fg-key').closest('label').hidden = !keys.length;
  const g = st.genResult;
  let main = '';
  if (bad.length) main = `<p class="muted">${esc(t('js.figures-editor.answersWait'))}</p>`;
  else if (st.answerKey) main = `<p class="fg-big">${esc(keyLabel(st.answerKey))} = ${esc(numText(flat[st.answerKey], 2))}</p>`;
  else if (g) main = `<p class="fg-big">${esc(g.answer)}</p>${g.work.length ? `<ol class="fg-work">${g.work.map(w => `<li>${esc(w)}</li>`).join('')}</ol>` : ''}`;
  else main = `<p class="muted">${esc(keys.length ? t('js.figures-editor.pickHelp') : t('js.figures-editor.noSolve'))}</p>`;
  $('fg-answer').innerHTML = main;
  $('fg-factsbox').hidden = !keys.length;
  $('fg-facts').innerHTML = keys.slice(0, 18).map(k => `<div><dt>${esc(keyLabel(k))}</dt><dd>${esc(numText(flat[k], 2))}</dd></div>`).join('');
}
function buttons() {
  for (const b of document.querySelectorAll('[data-act="undo"]')) b.disabled = !hist.canUndo();
  for (const b of document.querySelectorAll('[data-act="redo"]')) b.disabled = !hist.canRedo();
}

// ---------------------------------------------------------------- add to a worksheet (or save back to one)
/** What goes on a worksheet: this figure, or (out 'grid') the drawn corners plotted on a coordinate grid. */
function item(out) {
  if (out === 'grid') return { kind: 'grid', data: gridOut(), hide: false, question: st.question, answerKey: null };
  return { kind: K.id, data: st.data, hide: st.hide, question: st.question, answerKey: st.answerKey, ...(st.gen ? { gen: st.gen, seed: st.seed } : {}) };
}
const addMenu = (bad, out = '') => `<details class="fg-addmenu${bad ? ' off' : ''}"><summary class="btn btn-primary fg-wide">+ ${esc(out ? D('addGrid') : t('js.figures-editor.add'))}</summary><div class="fg-menu" role="menu">
    ${(P.sheets || []).slice(0, 8).map(w => `<button type="button" role="menuitem" data-act="addto" data-out="${out}" data-ws="${esc(w.id)}">${esc(w.title)} <small>${esc(t('js.figures-editor.qs', { count: w.n }))}</small></button>`).join('')}
    <button type="button" role="menuitem" data-act="addnew" data-out="${out}">+ ${esc(t('js.figures-editor.newSheet'))}</button></div></details>`;
function addBox(bad) {
  const box = $('fg-addbox'), off = bad.length ? ' disabled' : '';
  if (S && S.ws) { box.innerHTML = `<button class="btn btn-primary fg-wide" type="button" data-act="saveback"${off}>💾 ${esc(t('js.figures-editor.saveBack', { title: S.wsTitle }))}</button>`; return; }
  if (box.dataset.built) { const d = box.querySelector('details'); d.classList.toggle('off', !!bad.length); if (bad.length) d.open = false; box.querySelector('summary').setAttribute('aria-disabled', String(!!bad.length)); return; }
  box.dataset.built = '1';
  box.innerHTML = addMenu(bad.length > 0);
}
async function addTo(ws, out = '') {
  const it = item(out);
  // Checked here first (the server checks it again): a figure that cannot be drawn is never sent.
  let bad; try { bad = OF.check(it.kind, it.data); } catch (e) { bad = [String(e.message)]; }
  if (bad.length) { toast(t('js.figures-editor.ofSays', { reason: bad.slice(0, 3).join('; ') }), { bad: true }); return; }
  try {
    const r = ws ? await api(`/api/figures/worksheets/${encodeURIComponent(ws)}/items`, { method: 'POST', body: { item: it } })
      : await api('/api/figures/worksheets', { method: 'POST', body: { title: P.untitled, items: [it] } });
    const id = r.worksheet.id;
    if (!ws) P.sheets = [{ id, title: r.worksheet.title, n: r.worksheet.items.length }, ...(P.sheets || [])];
    else { const w = (P.sheets || []).find(x => x.id === ws); if (w) w.n = r.worksheet.items.length; }
    const box = $('fg-addbox'); delete box.dataset.built; addBox(problems());
    if ($('fg-gaddbox')) $('fg-gaddbox').innerHTML = addMenu(false, 'grid');
    const note = out === 'grid' ? $('fg-gadded') : $('fg-added');
    note.innerHTML = `${esc(t('js.figures-editor.added', { title: r.worksheet.title }))} <a href="/figures/worksheets/${esc(id)}">${esc(t('js.figures-editor.openSheet'))}</a>`;
    note.hidden = false;
  } catch (e) { toast(e.message, { bad: true }); }
}
const added = document.createElement('p'); added.id = 'fg-added'; added.className = 'notice good fg-small'; added.setAttribute('role', 'status'); added.hidden = true;
$('fg-addbox').after(added);

// ---------------------------------------------------------------- export: SVG and PNG with the notice, copy, link
const svgText = () => OF.withNotice(OF.svg(K.id, st.data, opts()));
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function pngBlob(scale = 2) {
  const s = svgText(), m = /viewBox="([\d.\s-]+)"/.exec(s), vb = m ? m[1].split(/\s+/).map(Number) : [0, 0, 600, 400];
  const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image')); img.src = url; });
    const c = document.createElement('canvas'); c.width = Math.round(vb[2] * scale); c.height = Math.round(vb[3] * scale);
    const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const raw0 = await new Promise(res => c.toBlob(res, 'image/png'));
    return new Blob([pngWithNotice(new Uint8Array(await raw0.arrayBuffer()), OF.notice)], { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}
const ACTS = {
  undo() { if (hist.undo()) announce('undone'); },
  redo() { if (hist.redo()) announce('redone'); },
  example() { Object.assign(st, { data: clone(K.presets[0]), gen: null, seed: null, genResult: null, answerKey: null, widen: null }); if (DRAW) { st.draw.on = false; drawApply(); } fields(); render(); commit(true); },
  async random(btn) {
    if (!K.gens.length) {
      const list = P.presets.filter(p => canon(p.data) !== canon(st.data)); const p = list[Math.floor(Math.random() * list.length)] || P.presets[0];
      Object.assign(st, { data: clone(p.data), gen: null, seed: null, genResult: null, answerKey: null, widen: null }); fields(); render(); commit(true);
      toast(t('js.figures-editor.noGen')); return;
    }
    btn.disabled = true;
    try {
      const g = await api('/api/figures/gen', { method: 'POST', body: { kind: K.id, ...(S && S.ws ? { ws: S.ws } : {}) } });
      Object.assign(st, { data: g.data, hide: g.hide, question: g.question, gen: g.gen, seed: g.seed, answerKey: null, widen: null, genResult: { data: clone(g.data), answer: g.answer, work: g.work } });
      fields(); render(); commit(true);
    } catch (e) { toast(e.message, { bad: true }); } finally { btn.disabled = false; }
  },
  svg() { download(new Blob([svgText()], { type: 'image/svg+xml' }), `${K.id}.svg`); },
  async png() { try { download(await pngBlob(), `${K.id}.png`); } catch { toast(t('js.figures-editor.pngFailed'), { bad: true }); } },
  async copy() {
    try { if (!window.ClipboardItem) throw new Error('no'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]); toast(t('js.figures-editor.copied')); }
    catch { if (await copyText(svgText())) toast(t('js.figures-editor.copiedSvg')); else toast(t('js.figures-editor.copyFailed'), { bad: true }); }
  },
  async link() { const u = `${location.origin}/figures/${K.id}?d=${encodeData(st.data)}`; if (await copyText(u)) toast(t('js.figures-editor.linkCopied')); history.replaceState(null, '', `?d=${encodeData(st.data)}`); },
  async preset() {
    const name = await askText({ title: t('js.figures-editor.savePreset'), label: t('js.figures-editor.presetName'), max: 60 });
    if (!name) return;
    const draw = DRAW && st.draw.on && drawn && drawn.ok ? { pts: st.draw.pts, n: st.draw.n, o: st.draw.o } : undefined;
    try { const r = await api('/api/figures/presets', { method: 'POST', body: { kind: K.id, name, data: st.data, ...(draw ? { draw } : {}) } }); mine = [r.preset, ...mine]; presets(); toast(t('js.figures-editor.presetSaved')); }
    catch (e) { toast(e.message, { bad: true }); }
  },
  nladd(btn) {
    const k = btn.dataset.list, list = nlList(k).map(x => ({ ...x })), { n } = nlRange();
    if (k === 'intervals') { const a = Math.round(n / 4), b = Math.max(a + 1, Math.round((3 * n) / 4)); list.push(n >= 2 ? { from: nlTick(a), to: nlTick(Math.min(b, n)) } : { from: nlTick(0), to: nlTick(n) }); }
    else {
      const used = new Set(list.map(p => p.label)), letter = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('').find(c => !used.has(c)) || '';
      const taken = list.map(p => nlValue(p.at)), i = [Math.round(n / 2), ...Array.from({ length: n + 1 }, (_, j) => j)].find(j => !taken.some(v => Math.abs(v - nlTick(j)) < 1e-9));
      list.push({ at: nlTick(i === undefined ? 0 : i), ...(letter ? { label: letter } : {}) });
    }
    st.data[k] = list; nlChange({ rows: true });
    const rows = $('fg-nl').querySelectorAll(`[data-row^="${k === 'intervals' ? 'interval' : 'point'} "] input[data-nl-num]`);
    if (rows.length && !matchMedia('(pointer:coarse)').matches) rows[rows.length - (k === 'intervals' ? 2 : 1)].focus({ preventScroll: false });
  },
  nldel(btn) {
    const k = btn.dataset.list, list = nlList(k).filter((_, i) => i !== +btn.dataset.i);
    if (list.length) st.data[k] = list; else delete st.data[k];
    nlChange({ rows: true });
  },
  nlkeep() {
    const w = st.widen; if (!w) return;
    const r = nlFit(st.data, w.fromData, w.toData);
    st.data = r.data; st.widen = null; changed(); fields(); render(); commit(true);
    if (r.removed) toast(t('js.figures-editor.nl.removed', { count: r.removed }));
  },
  addto(btn) { btn.closest('details').open = false; addTo(btn.dataset.ws, btn.dataset.out); },
  addnew(btn) { btn.closest('details').open = false; addTo(null, btn.dataset.out); },
  mode(btn) { const on = btn.dataset.mode === 'draw'; if (on === st.draw.on) return; st.draw.on = on; drawApply(); fields(); render(); commit(true); if (on) board.focus({ preventScroll: true }); },
  drawit() { st.draw.on = true; drawApply(); fields(); render(); commit(true); $('fg-draw').scrollIntoView({ block: 'start', behavior: 'smooth' }); board.focus({ preventScroll: true }); },
  dclear() { st.draw.pts = []; drawApply(); render(); commit(true); board.focus({ preventScroll: true }); },
  async saveback() {
    try { await api(`/api/figures/worksheets/${encodeURIComponent(S.ws)}/items/${encodeURIComponent(S.item)}`, { method: 'POST', body: { data: st.data, hide: st.hide, question: st.question, ...(CHOICE ? {} : { answerKey: st.answerKey }) } }); location.href = `/figures/worksheets/${encodeURIComponent(S.ws)}`; }
    catch (e) { toast(e.message, { bad: true }); }
  },
};
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const f = ACTS[b.dataset.act]; if (f) { e.preventDefault(); f(b); }
});
// Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y redo; a text box keeps the keys for its own typing.
document.addEventListener('keydown', e => {
  const k = historyKey(e); if (!k || e.target.closest('input,textarea,select,[contenteditable]') || e.target.closest('.sheet-bg,dialog')) return;
  e.preventDefault(); ACTS[k]();
});
/** Undo and redo say what happened to a screen reader (the figure itself changes silently). */
function announce(what) { const el = $('fg-hist-msg'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = t(`js.figures-editor.${what}`); }, 30); } }

// ---------------------------------------------------------------- a phone's keyboard
// While a box has the keyboard up on a phone, the site's bottom tab bar and Oomba's chat button step aside (iOS Safari
// would float them over the form, just above the keyboard). The visual viewport says when the keyboard is up; a touch
// screen with no visual viewport counts a focused box as the keyboard.
let pressing = false;
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,select';
function keyboard() {
  const a = document.activeElement, vv = window.visualViewport;
  const focused = !!(a && a.matches && a.matches(TYPING) && app.contains(a));
  const small = matchMedia('(max-width:820px)').matches;
  const up = focused && small && (!vv || matchMedia('(pointer:coarse)').matches || vv.height < window.innerHeight - 120);
  if (!up && pressing) return;   // the press ends first (below)
  document.body.classList.toggle('fg-kb', up);
}
// The tab bar comes back only once a press has ended: a tap that takes the focus away from a box lands where it was
// aimed, never on the tab bar coming back under the finger.
const later = () => setTimeout(() => { if (!pressing) keyboard(); }, 120);
document.addEventListener('pointerdown', () => { pressing = true; }, true);
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => { pressing = false; later(); }, true);
document.addEventListener('focusin', keyboard);
document.addEventListener('focusout', later);
if (window.visualViewport) window.visualViewport.addEventListener('resize', keyboard);

// ---------------------------------------------------------------- Draw it
let drawn = null;
// What a new drawing keeps of the figure before it: its display options, never its measures or marks (they would be
// about the old shape).
const KEEP = ['unit', 'round', 'names', 'size', 'rotate', 'flip', 'rightAngles'];
const KEEP_GRID = ['step', 'xstep', 'ystep', 'numbering', 'xnumbering', 'ynumbering', 'xtitle', 'ytitle'];
const okData = (kind, d) => { try { return OF.check(kind, d).length === 0; } catch { return false; } };
/** The drawing's corners in the order the data names them (A first). */
const ordered = () => (drawn && drawn.ok ? drawn.order.map(i => st.draw.pts[i]) : st.draw.pts);
/** The drawn corners plotted on a coordinate grid, the second output. */
const gridOut = () => gridData(ordered(), rangeOf(st.draw));
/** The drawing, worked out: when it is this kind's shape and Oomba Figures can draw it, it becomes the figure's data. */
function drawApply() {
  if (!DRAW) return;
  drawn = st.draw.pts.length ? toData(K.id, st.draw.pts, { range: rangeOf(st.draw) }) : { ok: false, why: 'few', need: CORNERS[K.id][0] };
  if (!st.draw.on || !drawn.ok) return;
  const own = { ...Object.fromEntries((GRIDK ? KEEP_GRID : KEEP).filter(k => k in st.data).map(k => [k, st.data[k]])), ...drawn.data };
  const data = okData(K.id, own) ? own : okData(K.id, drawn.data) ? drawn.data : null;
  if (!data) { drawn = { ok: false, why: 'cannot' }; return; }
  if (canon(data) !== canon(st.data)) { st.data = data; changed(); }
}
function startDrawing(pts, n = 10, o) {
  const size = SIZES.includes(n) ? n : 10;
  st.draw = { on: true, pts: pts.map(p => [p[0], p[1]]), n: size, o: Array.isArray(o) && o.length === 2 ? o : originFor(size), grid: st.draw.grid };
  Object.assign(st, { gen: null, seed: null, genResult: null, answerKey: null });
  drawApply(); fields(); render(); commit(true);
}
const fmt = (x, dp) => new Intl.NumberFormat(LANG, { maximumFractionDigits: dp }).format(Math.abs(x) < 1e-9 ? 0 : x);
const xy = p => `(${p[0]}, ${p[1]})`;
function measures() {
  const pts = st.draw.pts;
  if (!pts.length) return '';
  const order = drawn && drawn.ok ? drawn.order : pts.map((p, i) => i), P = order.map(i => pts[i]);
  const corners = `<div><dt>${esc(D('corners'))}</dt><dd dir="ltr">${P.map((p, k) => `<span class="fg-cc">${NAMES[k]}${xy(p)}</span>`).join(' ')}</dd></div>`;
  const a = analyze(P);
  if (!a.ok) return `<dl class="fg-dm-list">${corners}</dl>`;
  const typeText = a.n === 3 ? (ty => `${D(`tri.${ty.byAngles}`)} · ${D(`tri.${ty.bySides}`)}`)(triangleType(a))
    : a.n === 4 ? (q => D(`t.${q.type === 'trapezoid' && q.right ? 'rightTrapezoid' : q.type === 'trapezoid' && q.isosceles ? 'isoTrapezoid' : q.type}`))(quadType(a)) : D('t.polygon', { count: a.n });
  const allWhole = a.sides.every(s => Number.isInteger(s.value));
  return `<dl class="fg-dm-list">${corners}
    <div><dt>${esc(D('sides'))}</dt><dd dir="ltr"><ul>${a.sides.map(s => `<li><b>${s.name}</b> = ${s.text}${Number.isInteger(s.value) ? '' : ` ≈ ${fmt(s.value, 2)}`}</li>`).join('')}</ul></dd></div>
    <div><dt>${esc(D('angles'))}</dt><dd dir="ltr"><ul>${a.angles.map(g => `<li><b>∠${g.name}</b> = ${g.right ? '90° ∟' : `${fmt(Math.round(g.deg * 10) / 10, 1)}°`}</li>`).join('')}</ul></dd></div>
    <div><dt>${esc(D('kind'))}</dt><dd class="fg-dtype">${esc(typeText)}</dd></div>
    <div><dt>${esc(D('perimeter'))}</dt><dd dir="ltr">${allWhole ? fmt(a.perimeter, 0) : `${a.perimeterText} ≈ ${fmt(a.perimeter, 2)}`}</dd></div>
    <div><dt>${esc(D('area'))}</dt><dd>${esc(D('sqUnits', { area: fmt(a.area, 1) }))}</dd></div></dl>`;
}
function message() {
  const r = drawn;
  if (!r || !st.draw.pts.length) return '';
  const keep = ` ${esc(D('keep'))}`;
  if (r.ok) return `<p class="fg-dnote good">✓ ${esc(D('filled'))}</p>`;
  if (r.why === 'few') return `<p class="fg-dnote">${esc(D('more', { count: r.need }))}</p>`;
  if (r.why === 'kind') {
    const is = D(`a.${r.type}`), href = `/figures/${r.kind}?draw=${encodeURIComponent(ptsText(st.draw.pts))}&n=${st.draw.n}&o=${encodeURIComponent(st.draw.o.join(','))}`;
    return `<div class="fg-dnote warn"><p>${esc(r.special ? D('special', { is }) : D('isNot', { is, want: D(`a.${K.id}`) }))}${keep}</p><a class="btn btn-primary" href="${esc(href)}" data-open="${esc(r.kind)}">${esc(D(`open.${r.kind}`))}</a></div>`;
  }
  return `<p class="fg-dnote warn">⚠ ${esc(D(r.why))}${keep}</p>`;
}
let board = null;
function drawShow() {
  if (!DRAW) return;
  const on = st.draw.on;
  for (const b of document.querySelectorAll('[data-act="mode"]')) b.setAttribute('aria-pressed', String((b.dataset.mode === 'draw') === on));
  $('fg-draw').hidden = !on;
  const names = st.draw.pts.map((p, i) => NAMES[i]);
  if (drawn && drawn.ok) drawn.order.forEach((i, k) => { names[i] = NAMES[k]; });
  board.set({ pts: st.draw.pts, n: st.draw.n, o: st.draw.o, names, max: CORNERS[K.id][1], bad: !!(drawn && !drawn.ok && drawn.why !== 'few') });
  const inRange = n => { const o = GRIDK ? originFor(n) : [0, 0]; return st.draw.pts.every(p => p[0] >= o[0] && p[0] <= o[0] + n && p[1] >= o[1] && p[1] <= o[1] + n); };
  $('fg-dsize').innerHTML = SIZES.map(n => `<option value="${n}"${n === st.draw.n ? ' selected' : ''}${inRange(n) ? '' : ' disabled'}>${esc(D('sizeOpt', { n }))}</option>`).join('');
  $('fg-dm').innerHTML = measures();
  const msg = message();
  if ($('fg-dmsg').dataset.last !== msg) { $('fg-dmsg').innerHTML = msg; $('fg-dmsg').dataset.last = msg; }
  if (GRIDK) return;
  $('fg-dgrid').checked = st.draw.grid;
  const g = on && st.draw.grid && drawn && drawn.ok ? gridOut() : null, show = !!(g && okData('grid', g));
  $('fg-gridout').hidden = !show;
  if (show) {
    $('fg-gridfig').innerHTML = '';
    $('fg-gridfig').appendChild(OF.draw('grid', g, { lang: LANG, print: st.print, title: D('gridTitle') }));
    if (!$('fg-gaddbox').innerHTML) $('fg-gaddbox').innerHTML = addMenu(false, 'grid');
  }
}
if (DRAW) {
  board = makeBoard($('fg-board'), {
    D,
    onChange(pts, { final }) {
      st.draw.pts = pts;
      drawApply(); fields(); render();
      if (final) commit(true);
    },
  });
  $('fg-dsize').addEventListener('change', () => {
    const n = +$('fg-dsize').value; if (!SIZES.includes(n)) return;
    st.draw.n = n; if (GRIDK) st.draw.o = originFor(n);
    drawApply(); fields(); render(); commit(true);
  });
  if ($('fg-dgrid')) $('fg-dgrid').addEventListener('change', () => { st.draw.grid = $('fg-dgrid').checked; render(); commit(true); });
  // ?draw=1,1;4,1;1,3&n=10&o=0,0: corners sent here from another kind's "That shape is a ..." (or a link).
  const qs = new URLSearchParams(location.search), pts = parsePts(qs.get('draw'));
  if (pts && !S) {
    const o = parsePts(qs.get('o')), n = SIZES.includes(+qs.get('n')) ? +qs.get('n') : 10;
    st.draw = { on: true, pts: pts.slice(0, CORNERS[K.id][1]), n, o: o && o.length === 1 ? o[0] : originFor(n), grid: false };
    drawApply();
  } else drawApply();
  hist.reset();
}

// A worksheet question from a generator: what the generator says, so its answer and worked lines show (the server
// works them out again when it is saved). The figure goes too, so a question saved with an earlier definition of its
// generator (PAST_GENS in figures-catalog.js) finds that definition, as the server does when it saves (dealtFor).
if (S && S.gen && S.seed) api('/api/figures/gen', { method: 'POST', body: { gen: S.gen, seed: S.seed, data: S.data, ws: S.ws } }).then(g => { if (canon(g.data) === canon(st.data)) { st.genResult = { data: g.data, answer: g.answer, work: g.work }; hist.settle(); answers(); } }).catch(() => {});
fields(); render();
