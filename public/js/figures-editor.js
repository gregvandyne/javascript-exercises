// Figures, one editor for every kind (routes/figures.js GET /figures/:kind). The controls are made from the kind's data
// (public/js/figures-catalog.js): numbers become number boxes, true/false a switch, a value from a fixed list a select,
// words a text box, and lists and objects live in "Advanced (data)", a JSON box checked as it is typed. The figure is
// drawn live by the pinned Oomba Figures (the page loads only the pack this kind needs); data that cannot be drawn shows
// OF.check's reason in plain words and turns export off. Worked answers come from OF.solve. Undo and redo stay in the
// browser; a figure can be linked (?d=), downloaded as SVG or PNG with Oomba's CC0 notice in the file, copied, saved
// as one of the teacher's presets, or added to a worksheet (where the server checks and answers it again).
import { t, api, toast, esc, pageData, askText, copyText } from '/js/app.js';
import { flatSolve, solveOf, numText, encodeData } from '/js/figures-catalog.js';
import { pngWithNotice } from '/js/figures-export.js';

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

// ---------------------------------------------------------------- state and history
const st = { data: clone(K.presets[0]), hide: false, print: false, question: '', answerKey: null, gen: null, seed: null, genResult: null };
const S = P.start;
if (S) Object.assign(st, { data: clone(S.data), hide: S.hide ?? false, question: S.question || '', answerKey: S.answerKey || null, gen: S.gen || null, seed: S.seed || null });
const snap = () => JSON.stringify({ data: st.data, hide: st.hide, question: st.question, answerKey: st.answerKey, gen: st.gen, seed: st.seed, genResult: st.genResult });
const undo = [], redo = [];
let last = snap(), timer = 0;
function commit(now = false) {
  clearTimeout(timer);
  const go = () => { const s = snap(); if (s !== last) { undo.push(last); if (undo.length > 100) undo.shift(); redo.length = 0; last = s; } buttons(); };
  if (now) go(); else timer = setTimeout(go, 350);
}
function restore(s) { Object.assign(st, JSON.parse(s)); last = s; fields(); render(); }

// ---------------------------------------------------------------- the page
const sel = (opts, cur) => opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
app.innerHTML = `<div class="fg-ed-head"><h1>${esc(P.name)}</h1>
  <div class="fg-ed-actions">
    <button class="btn fg-icon" type="button" data-act="undo" aria-label="${esc(t('js.figures-editor.undo'))}" title="${esc(t('js.figures-editor.undo'))}">↶</button>
    <button class="btn fg-icon" type="button" data-act="redo" aria-label="${esc(t('js.figures-editor.redo'))}" title="${esc(t('js.figures-editor.redo'))}">↷</button>
    <label class="fg-presets"><span class="sr-only">${esc(t('js.figures-editor.presets'))}</span><select class="input" id="fg-preset"></select></label>
    <button class="btn btn-hot" type="button" data-act="random">🎲 ${esc(t('js.figures-editor.randomize'))}</button>
  </div></div>
<div class="fg-ed-grid">
  <section class="panel fg-ed-controls" aria-label="${esc(t('js.figures-editor.controls'))}"><div id="fg-fields"></div>
    <details class="fg-adv" id="fg-adv"><summary>${esc(t('js.figures-editor.advanced'))}</summary>
      <p class="muted fg-small">${esc(t('js.figures-editor.advancedHelp'))}</p>
      <textarea class="input fg-json" id="fg-json" rows="10" spellcheck="false" aria-describedby="fg-json-msg"></textarea><p class="fg-small" id="fg-json-msg" role="status"></p></details>
    <h3 class="fg-h">${esc(t('js.figures-editor.display'))}</h3>
    <label class="fg-switch"><span>${esc(t('js.figures-editor.print'))}</span><input type="checkbox" id="fg-print"></label>
    ${K.nts ? `<label class="fg-switch"><span>${esc(t('js.figures-editor.nts'))}</span><input type="checkbox" id="fg-nts"></label>` : ''}
  </section>
  <section class="fg-ed-stage" aria-label="${esc(t('js.figures-editor.figure'))}">
    <div class="panel fg-ed-figure" id="fg-figure" aria-live="polite"></div>
    <div class="fg-cant" id="fg-cant" role="alert" hidden></div>
    <code class="fg-code" id="fg-code" dir="ltr"></code>
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
      <button class="btn" type="button" data-act="preset" data-needs-ok>${esc(t('js.figures-editor.savePreset'))}</button>
    </div>
    <p class="muted fg-small">${esc(t('js.figures-editor.notice'))}</p>
  </section>
</div>`;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- presets
let mine = P.mine || [];
function presets() {
  $('fg-preset').innerHTML = `<option value="">${esc(t('js.figures-editor.presets'))}</option><optgroup label="${esc(t('js.figures-editor.examples'))}">${P.presets.map((p, i) => `<option value="x${i}">${esc(p.name)}</option>`).join('')}</optgroup>`
    + (mine.length ? `<optgroup label="${esc(t('js.figures-editor.mine'))}">${mine.map(p => `<option value="m${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>` : '');
}
presets();
$('fg-preset').addEventListener('change', async e => {
  const v = e.target.value; e.target.value = '';
  const p = v[0] === 'x' ? P.presets[+v.slice(1)] : mine.find(m => `m${m.id}` === v);
  if (!p) return;
  Object.assign(st, { data: clone(p.data), gen: null, seed: null, genResult: null, answerKey: null });
  fields(); render(); commit(true);
});

// ---------------------------------------------------------------- the controls, from the kind's data
const SKIP = new Set(['notToScale', 'drawAs', 'hide', 'kind']);
const typeOf = (k, v) => (K.options && K.options[k] ? 'enum' : K.extra && K.extra[k] ? K.extra[k] : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'text' : v === undefined ? null : 'json');
function fields() {
  const ex = K.presets[0], keys = [...new Set([...Object.keys(K.extra || {}), ...Object.keys(ex), ...Object.keys(st.data), ...Object.keys(K.options || {})])].filter(k => !SKIP.has(k));
  const groups = { number: [], enum: [], bool: [], text: [] };
  for (const k of keys) { const ty = typeOf(k, st.data[k] !== undefined ? st.data[k] : ex[k]); if (groups[ty]) groups[ty].push(k); }
  const id = k => `fg-f-${k.replace(/[^\w-]/g, '_')}`;
  const num = k => `<label class="fg-num"><span>${esc(fieldLabel(k))}</span><input class="input" type="number" step="any" inputmode="decimal" id="${id(k)}" data-f="${esc(k)}" data-ty="number" value="${typeof st.data[k] === 'number' ? esc(st.data[k]) : ''}"></label>`;
  const en = k => `<label class="fg-block"><span>${esc(fieldLabel(k))}</span><select class="input" id="${id(k)}" data-f="${esc(k)}" data-ty="enum">${sel([['', t('js.figures-editor.default')], ...K.options[k].filter(o => o !== '').map(o => [o, o])], st.data[k] ?? '')}</select></label>`;
  const bo = k => `<label class="fg-switch"><span>${esc(fieldLabel(k))}</span><input type="checkbox" id="${id(k)}" data-f="${esc(k)}" data-ty="bool"${st.data[k] === true ? ' checked' : ''}></label>`;
  const tx = k => `<label class="fg-block"><span>${esc(fieldLabel(k))}</span><input class="input" type="text" id="${id(k)}" data-f="${esc(k)}" data-ty="text" maxlength="80" value="${esc(typeof st.data[k] === 'string' ? st.data[k] : '')}"></label>`;
  $('fg-fields').innerHTML = (groups.number.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.measures'))}</h3><div class="fg-nums">${groups.number.map(num).join('')}</div>${K.extra ? `<p class="muted fg-small">${esc(t('js.figures-editor.leaveEmpty'))}</p>` : ''}` : '')
    + (groups.enum.length || groups.text.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.options'))}</h3>${groups.enum.map(en).join('')}${groups.text.map(tx).join('')}` : '')
    + (groups.bool.length ? `<h3 class="fg-h">${esc(t('js.figures-editor.show'))}</h3>${groups.bool.map(bo).join('')}` : '');
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
  if (ty === 'number') { if (el.value === '' || !Number.isFinite(+el.value)) delete st.data[k]; else st.data[k] = +el.value; }
  else if (ty === 'bool') { if (el.checked) st.data[k] = true; else if (inEx) st.data[k] = false; else delete st.data[k]; }
  else if (ty === 'enum' || ty === 'text') { if (el.value === '') delete st.data[k]; else st.data[k] = el.value; }
  changed(); render(); commit();
  if (document.activeElement !== $('fg-json')) $('fg-json').value = JSON.stringify(st.data, null, 2);
});
$('fg-fields').addEventListener('change', e => { if (e.target.closest('[data-ty="enum"],[data-ty="bool"]')) fields(); });
$('fg-adv').addEventListener('toggle', () => { $('fg-adv').dataset.touched = '1'; });
$('fg-json').addEventListener('input', () => {
  let o = null, msg = '';
  try { o = JSON.parse($('fg-json').value); if (!o || typeof o !== 'object' || Array.isArray(o)) { o = null; msg = t('js.figures-editor.jsonObject'); } } catch (e) { msg = t('js.figures-editor.jsonBad', { why: String(e.message).slice(0, 120) }); }
  $('fg-json').classList.toggle('bad', !o); $('fg-json-msg').textContent = msg; $('fg-json-msg').classList.toggle('fg-bad', !o);
  if (!o) return;
  st.data = o; changed(); render(); commit();
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

// ---------------------------------------------------------------- drawing, the cannot-draw state and the answers
const WHY = [[/cannot make a triangle|has to be longer than/i, 'triangle'], [/180/, 'angles'], [/too short|cannot reach|never meet/i, 'short'], [/agree|contradict/i, 'agree'],
  [/drawAs|notToScale/, 'drawAs'], [/positive|more than 0|greater than 0|above 0/i, 'positive'], [/between|at most|at least|from .* to|range/i, 'range'], [/leave out|only one of|instead of/i, 'extra'], [/JSON|object|could not be read/i, 'data']];
const problems = () => { try { return OF.check(K.id, st.data); } catch (e) { return [String(e.message)]; } };
const opts = () => ({ hide: st.hide === false ? false : st.hide, print: st.print, lang: LANG, title: st.question || P.name });
function render() {
  const bad = problems(), box = $('fg-figure');
  box.innerHTML = '';
  box.appendChild(OF.draw(K.id, st.data, opts()));
  box.classList.toggle('fg-print-on', st.print);
  const cant = $('fg-cant');
  if (bad.length) {
    const why = (WHY.find(([re]) => re.test(bad[0])) || [null, 'generic'])[1];
    cant.innerHTML = `<h3>⚠ ${esc(t(`js.figures-editor.why.${why}.t`))}</h3><p>${esc(t(`js.figures-editor.why.${why}.p`))}</p>
      <p class="fg-small">${esc(t('js.figures-editor.ofSays', { reason: bad.slice(0, 3).join('; ') }))}</p>
      <div class="row"><button class="btn btn-primary" type="button" data-act="undo"${undo.length ? '' : ' disabled'}>${esc(t('js.figures-editor.undoLast'))}</button><button class="btn" type="button" data-act="example">${esc(t('js.figures-editor.backToExample'))}</button></div>`;
    cant.hidden = false;
  } else cant.hidden = true;
  for (const el of document.querySelectorAll('.fg-ed-controls .fg-num input')) el.classList.toggle('bad', bad.length > 0 && el.value !== '');
  $('fg-code').textContent = `OF.svg('${K.id}', ${JSON.stringify(st.data)}${st.hide !== false ? `, { hide: ${JSON.stringify(st.hide)} }` : ''})`;
  for (const b of document.querySelectorAll('[data-needs-ok]')) b.disabled = bad.length > 0;
  answers(bad);
  addBox(bad);
  buttons();
}
function answers(bad = problems()) {
  const solve = bad.length ? null : solveOf(OF, K.id, st.data), flat = solve ? flatSolve(solve) : {}, keys = Object.keys(flat);
  if (st.answerKey && !(st.answerKey in flat)) st.answerKey = null;
  $('fg-key').innerHTML = sel([['', keys.length ? t('js.figures-editor.pickAnswer') : t('js.figures-editor.noAnswers')], ...keys.slice(0, 60).map(k => [k, `${keyLabel(k)} = ${numText(flat[k], 2)}`])], st.answerKey || '');
  $('fg-key').disabled = !keys.length;
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
  for (const b of document.querySelectorAll('[data-act="undo"]')) b.disabled = !undo.length;
  for (const b of document.querySelectorAll('[data-act="redo"]')) b.disabled = !redo.length;
}

// ---------------------------------------------------------------- add to a worksheet (or save back to one)
function item() { return { kind: K.id, data: st.data, hide: st.hide, question: st.question, answerKey: st.answerKey, ...(st.gen ? { gen: st.gen, seed: st.seed } : {}) }; }
function addBox(bad) {
  const box = $('fg-addbox'), off = bad.length ? ' disabled' : '';
  if (S && S.ws) { box.innerHTML = `<button class="btn btn-primary fg-wide" type="button" data-act="saveback"${off}>💾 ${esc(t('js.figures-editor.saveBack', { title: S.wsTitle }))}</button>`; return; }
  if (box.dataset.built) { const d = box.querySelector('details'); d.classList.toggle('off', !!bad.length); if (bad.length) d.open = false; box.querySelector('summary').setAttribute('aria-disabled', String(!!bad.length)); return; }
  box.dataset.built = '1';
  box.innerHTML = `<details class="fg-addmenu${bad.length ? ' off' : ''}"><summary class="btn btn-primary fg-wide">+ ${esc(t('js.figures-editor.add'))}</summary><div class="fg-menu" role="menu">
    ${(P.sheets || []).slice(0, 8).map(w => `<button type="button" role="menuitem" data-act="addto" data-ws="${esc(w.id)}">${esc(w.title)} <small>${esc(t('js.figures-editor.qs', { count: w.n }))}</small></button>`).join('')}
    <button type="button" role="menuitem" data-act="addnew">+ ${esc(t('js.figures-editor.newSheet'))}</button></div></details>`;
}
async function addTo(ws) {
  try {
    const r = ws ? await api(`/api/figures/worksheets/${encodeURIComponent(ws)}/items`, { method: 'POST', body: { item: item() } })
      : await api('/api/figures/worksheets', { method: 'POST', body: { title: P.untitled, items: [item()] } });
    const id = r.worksheet.id;
    if (!ws) P.sheets = [{ id, title: r.worksheet.title, n: r.worksheet.items.length }, ...(P.sheets || [])];
    const box = $('fg-addbox'); delete box.dataset.built; addBox([]);
    $('fg-added').innerHTML = `${esc(t('js.figures-editor.added', { title: r.worksheet.title }))} <a href="/figures/worksheets/${esc(id)}">${esc(t('js.figures-editor.openSheet'))}</a>`;
    $('fg-added').hidden = false;
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
  undo() { if (!undo.length) return; clearTimeout(timer); redo.push(snap()); restore(undo.pop()); buttons(); },
  redo() { if (!redo.length) return; undo.push(snap()); restore(redo.pop()); buttons(); },
  example() { Object.assign(st, { data: clone(K.presets[0]), gen: null, seed: null, genResult: null, answerKey: null }); fields(); render(); commit(true); },
  async random(btn) {
    if (!K.gens.length) {
      const list = P.presets.filter(p => canon(p.data) !== canon(st.data)); const p = list[Math.floor(Math.random() * list.length)] || P.presets[0];
      Object.assign(st, { data: clone(p.data), gen: null, seed: null, genResult: null, answerKey: null }); fields(); render(); commit(true);
      toast(t('js.figures-editor.noGen')); return;
    }
    btn.disabled = true;
    try {
      const g = await api('/api/figures/gen', { method: 'POST', body: { kind: K.id } });
      Object.assign(st, { data: g.data, hide: g.hide, question: g.question, gen: g.gen, seed: g.seed, answerKey: null, genResult: { data: clone(g.data), answer: g.answer, work: g.work } });
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
    try { const r = await api('/api/figures/presets', { method: 'POST', body: { kind: K.id, name, data: st.data } }); mine = [r.preset, ...mine]; presets(); toast(t('js.figures-editor.presetSaved')); }
    catch (e) { toast(e.message, { bad: true }); }
  },
  addto(btn) { btn.closest('details').open = false; addTo(btn.dataset.ws); },
  addnew(btn) { btn.closest('details').open = false; addTo(null); },
  async saveback() {
    try { await api(`/api/figures/worksheets/${encodeURIComponent(S.ws)}/items/${encodeURIComponent(S.item)}`, { method: 'POST', body: { data: st.data, hide: st.hide, question: st.question, answerKey: st.answerKey } }); location.href = `/figures/worksheets/${encodeURIComponent(S.ws)}`; }
    catch (e) { toast(e.message, { bad: true }); }
  },
};
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const f = ACTS[b.dataset.act]; if (f) { e.preventDefault(); f(b); }
});
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.target.closest('input,textarea,select')) return;
  e.preventDefault(); (e.shiftKey ? ACTS.redo : ACTS.undo)();
});

// A worksheet question from a generator: what the generator says, so its answer and worked lines show (the server
// works them out again when it is saved).
if (S && S.gen && S.seed) api('/api/figures/gen', { method: 'POST', body: { gen: S.gen, seed: S.seed } }).then(g => { if (canon(g.data) === canon(st.data)) { st.genResult = { data: g.data, answer: g.answer, work: g.work }; last = snap(); answers(); } }).catch(() => {});
fields(); render();
