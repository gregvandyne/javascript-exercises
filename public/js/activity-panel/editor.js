// Edit one problem: a bottom sheet on phones, a dialog on wider screens (app.js sheet). The fields of its kind (a
// figure's reading, a number line's numbers...), the question, the answer and the worked steps (figure questions), with
// a live picture and the kit's own check. Scale, units, decimals and reordering steps sit under "More". Text only: the
// server screens what a teacher types exactly as it screens a Builder message.
import { sheet, esc } from '/js/app.js';
import { P, E, clone, valText, valParse, kindIcon, kindName, checkOne, figures } from './shared.js';
import { move } from './list.js';

// A tool's numbers: [field, kind] (kind 'val': a number or n/d; 'int': a whole number)
const FIELDS = {
  'numberline.point': [['at', 'val'], ['lo', 'int'], ['hi', 'int'], ['sub', 'int']],
  'numberline.jump': [['from', 'val'], ['by', 'val'], ['lo', 'int'], ['hi', 'int'], ['sub', 'int']],
  'fractions.equiv': [['from', 'val'], ['to', 'int']],
  'fractions.shade': [['n', 'int'], ['d', 'int']],
  'fractions.compare': [['a', 'val'], ['b', 'val']],
  'digits.add': [['a', 'int'], ['b', 'int']], 'digits.sub': [['a', 'int'], ['b', 'int']], 'digits.mul': [['a', 'int'], ['b', 'int']],
};
const numText = x => String(Math.round(x * 1000) / 1000);

export function openEditor(M, i) {
  const orig = M.data.problems[i]; if (!orig) return;
  const p = clone(orig);
  let more = false, moreSteps = false;
  const s = sheet({ title: P('editTitle', { n: i + 1, total: M.data.problems.length }), content: '<div class="ap-ed"></div>' });
  s.el.querySelector('.sheet').classList.add('ap-sheet');
  const root = s.el.querySelector('.ap-ed');
  const field = (label, html, id) => `<div class="field"><label for="${id}">${label}</label>${html}</div>`;
  const input = (id, value, attrs = '') => `<input class="input" id="${id}" value="${String(value ?? '').replace(/"/g, '&quot;')}" ${attrs}>`;

  function draw() {
    const fig = p.fig && p.fig.kind === 'reading' ? p.fig : null, isFig = String(p.tool).startsWith('figure.');
    root.innerHTML = `<p class="ap-kind"><span class="stchip"><span aria-hidden="true">${kindIcon(p)}</span> ${esc(kindName(p))}</span></p>
      <div class="ap-fields">${p.fig ? '<div class="ap-pic" aria-hidden="true"></div>' : ''}<div class="ap-nums"></div></div>
      ${isFig ? `${field(E('question'), input('ap-q', p.q, 'maxlength="200" dir="auto"'), 'ap-q')}<div class="ap-ans"></div>` : ''}
      <p class="ap-check" role="status" aria-live="polite"></p>
      ${isFig ? `<h3>${E('workedSteps')}</h3><p class="small muted">${E('workedHint')}</p><ol class="ap-steps"></ol>
        <div class="ap-acts"><button type="button" class="btn btn-sm" data-ed="step"${(p.work || []).length >= 6 ? ' disabled' : ''}>＋ ${E('addStep')}</button><button type="button" class="btn btn-sm ap-more" data-ed="moresteps" aria-expanded="${moreSteps}">${E(moreSteps ? 'lessOptions' : 'moreOptions')}</button></div>` : `<p class="small muted">${E('kitStepsHint')}</p>`}
      <div class="ap-edfoot"><button type="button" class="btn btn-sm btn-danger" data-ed="del"${M.data.problems.length <= 1 ? ' disabled' : ''}>🗑 ${E('delete')}</button><button type="button" class="btn btn-sm" data-ed="up"${i === 0 ? ' disabled' : ''}>↑ ${E('up')}</button><button type="button" class="btn btn-sm" data-ed="down"${i >= M.data.problems.length - 1 ? ' disabled' : ''}>↓ ${E('down')}</button>
        <span class="ap-grow"></span><button type="button" class="btn" data-ed="cancel">${E('cancel')}</button><button type="button" class="btn btn-primary" data-ed="done">${E('done')}</button></div>`;
    const nums = root.querySelector('.ap-nums');
    if (fig) {
      nums.innerHTML = field(E('reading'), input('ap-v', fig.value, 'inputmode="decimal" dir="ltr"'), 'ap-v')
        + `<div class="ap-more-box" ${more ? '' : 'hidden'}><div class="ap-two">${field(E('scaleFrom'), input('ap-min', fig.min, 'inputmode="decimal" dir="ltr"'), 'ap-min')}${field(E('scaleTo'), input('ap-max', fig.max, 'inputmode="decimal" dir="ltr"'), 'ap-max')}</div>${field(E('tickEvery'), input('ap-step', fig.step, 'inputmode="decimal" dir="ltr"'), 'ap-step')}</div>`
        + `<label class="ap-cb"><input type="checkbox" id="ap-hide"${fig.hide ? ' checked' : ''}> ${E('hideReading')}</label>`;
    } else if (FIELDS[p.tool]) {
      nums.innerHTML = `<div class="ap-two">${FIELDS[p.tool].map(([k]) => field(E(`f.${k}`), input(`ap-f-${k}`, valText(p[k]), 'dir="ltr" inputmode="text"'), `ap-f-${k}`)).join('')}</div>`;
    } else if (!isFig) nums.innerHTML = `<p class="small muted">${E('builderOnly')}</p>`;
    if (isFig) {
      const ans = root.querySelector('.ap-ans');
      if (p.tool === 'figure.number') {
        ans.innerHTML = field(E('answer'), input('ap-a', p.answer, 'inputmode="decimal" dir="ltr"'), 'ap-a')
          + `<div class="ap-more-box" ${more ? '' : 'hidden'}><div class="ap-two">${field(E('unit'), input('ap-u', p.unit || '', 'maxlength="12" dir="auto"'), 'ap-u')}${field(E('decimals'), `<select class="input" id="ap-dp">${[0, 1, 2, 3].map(n => `<option${(p.dp || 0) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>`, 'ap-dp')}</div></div>`;
      } else {
        ans.innerHTML = `<fieldset class="ap-choices"><legend>${E('choices')}</legend>${(p.choices || []).map((c, k) => `<label class="ap-cb"><input type="radio" name="ap-right" value="${k}"${p.answer === k ? ' checked' : ''} aria-label="${E('rightOne', { n: k + 1 })}"> <input class="input" data-choice="${k}" maxlength="60" dir="auto" value="${String(c).replace(/"/g, '&quot;')}"></label>`).join('')}</fieldset>`;
      }
      if (p.fig) ans.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-sm ap-more" data-ed="more" aria-expanded="${more}">${E(more ? 'lessOptions' : 'moreOptions')}</button>`);
      drawSteps();
    }
    wire(); paintPic(); paintCheck();
  }
  function drawSteps() {
    const ol = root.querySelector('.ap-steps'); if (!ol) return;
    const w = p.work || [];
    ol.innerHTML = w.map((line, k) => `<li><span class="ap-k" aria-hidden="true">${k + 1}</span><label class="sr-only" for="ap-w-${k}">${E('stepN', { n: k + 1 })}</label><input class="input" id="ap-w-${k}" data-step="${k}" maxlength="160" dir="auto" value="${String(line).replace(/"/g, '&quot;')}">
      ${moreSteps ? `<button type="button" class="iconbtn" data-sup="${k}" aria-label="${E('stepUp', { n: k + 1 })}"${k === 0 ? ' disabled' : ''}>↑</button><button type="button" class="iconbtn" data-sdown="${k}" aria-label="${E('stepDown', { n: k + 1 })}"${k === w.length - 1 ? ' disabled' : ''}>↓</button>` : ''}
      <button type="button" class="iconbtn" data-sdel="${k}" aria-label="${E('stepDel', { n: k + 1 })}"${w.length <= 1 ? ' disabled' : ''}>✕</button></li>`).join('');
  }
  function paintPic() {
    const box = root.querySelector('.ap-pic'), F = figures(); if (!box) return;
    box.textContent = '';
    try { const { kind, hide, ...data } = p.fig; const svg = F && F.draw(kind, { kind, ...data }, { hide: false }); if (svg) box.append(svg); } catch { /* drawn when it is valid */ }
  }
  /** The kit's own check of this problem (and the figure's), in one line. */
  function paintCheck() {
    const el = root.querySelector('.ap-check'), F = figures();
    let why = checkOne(p);
    if (!why && p.fig && F && typeof F.check === 'function') { const { kind, hide, ...rest } = p.fig; const w = F.check(kind, { kind, ...rest }); if (w && w.length) why = w.slice(0, 2).join('; '); }
    const done = root.querySelector('[data-ed="done"]'); if (done) done.disabled = false;
    if (why) { el.className = 'ap-check bad'; el.innerHTML = `⚠️ <b>${E('notYet')}</b> <span lang="en" dir="ltr"></span>`; el.querySelector('span').textContent = why; return; }
    el.className = 'ap-check good';
    el.textContent = `✅ ${p.fig && p.fig.kind === 'reading' && p.tool === 'figure.number' && +p.answer === +p.fig.value ? P('matchesReading', { a: `${numText(p.answer)}${p.unit ? ` ${p.unit}` : ''}` }) : P('checksOut')}`;
  }
  const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  function wire() {
    const num = el => { const v = valParse(el.value); return typeof v === 'number' ? v : null; };
    on('#ap-v', 'input', e => {
      const v = num(e.target); if (v === null) return;
      const old = p.fig.value; p.fig.value = v;
      // the answer and the last worked line follow the reading when they said the old one
      if (p.tool === 'figure.number' && +p.answer === +old) {
        p.answer = v; const a = root.querySelector('#ap-a'); if (a) a.value = numText(v);
        const w = p.work || [], last = w.length - 1;
        if (last >= 0 && w[last].includes(numText(old))) { w[last] = w[last].split(numText(old)).join(numText(v)); const li = root.querySelector(`#ap-w-${last}`); if (li) li.value = w[last]; }
      }
      paintPic(); paintCheck();
    });
    for (const [id, k] of [['#ap-min', 'min'], ['#ap-max', 'max'], ['#ap-step', 'step']]) on(id, 'input', e => { const v = num(e.target); if (v === null) return; p.fig[k] = v; paintPic(); paintCheck(); });
    on('#ap-hide', 'change', e => { if (e.target.checked) p.fig.hide = 'value'; else delete p.fig.hide; paintCheck(); });
    on('#ap-q', 'input', e => { p.q = e.target.value; paintCheck(); });
    on('#ap-a', 'input', e => { const v = num(e.target); p.answer = v === null ? e.target.value : v; paintCheck(); });
    on('#ap-u', 'input', e => { if (e.target.value.trim()) p.unit = e.target.value; else delete p.unit; paintPic(); paintCheck(); });
    on('#ap-dp', 'change', e => { p.dp = +e.target.value; paintCheck(); });
    on('[data-choice]', 'input', e => { p.choices[+e.target.dataset.choice] = e.target.value; paintCheck(); });
    on('input[name="ap-right"]', 'change', e => { p.answer = +e.target.value; paintCheck(); });
    for (const [k] of FIELDS[p.tool] || []) on(`#ap-f-${k}`, 'input', e => { const v = valParse(e.target.value); if (v !== null) p[k] = v; paintCheck(); });
    wireSteps();
    on('[data-ed="step"]', 'click', () => { p.work = [...(p.work || []), '']; draw(); const last = root.querySelector(`#ap-w-${p.work.length - 1}`); if (last) last.focus(); });
    on('[data-ed="more"]', 'click', () => { more = !more; draw(); root.querySelector('[data-ed="more"]').focus(); });
    on('[data-ed="moresteps"]', 'click', () => { moreSteps = !moreSteps; draw(); root.querySelector('[data-ed="moresteps"]').focus(); });
    on('[data-ed="cancel"]', 'click', () => s.close());
    on('[data-ed="done"]', 'click', () => { keep(); s.close(); M.render(); });
    on('[data-ed="del"]', 'click', () => { M.commit({ k: 'deleted', n: i + 1 }, d => d.problems.splice(i, 1)); M.sel = Math.max(0, i - 1); s.close(); M.render(); });
    on('[data-ed="up"]', 'click', () => { keep(); move(M, i, i - 1); s.close(); M.render(); openEditor(M, i - 1); });
    on('[data-ed="down"]', 'click', () => { keep(); move(M, i, i + 1); s.close(); M.render(); openEditor(M, i + 1); });
  }
  /** The worked steps' own fields (drawn again on their own when a line moves or goes). */
  function wireSteps() {
    const again = () => { drawSteps(); wireSteps(); paintCheck(); };
    on('[data-step]', 'input', e => { p.work[+e.target.dataset.step] = e.target.value; paintCheck(); });
    on('[data-sdel]', 'click', e => { p.work.splice(+e.currentTarget.dataset.sdel, 1); again(); });
    on('[data-sup]', 'click', e => { const k = +e.currentTarget.dataset.sup; [p.work[k - 1], p.work[k]] = [p.work[k], p.work[k - 1]]; again(); });
    on('[data-sdown]', 'click', e => { const k = +e.currentTarget.dataset.sdown; [p.work[k + 1], p.work[k]] = [p.work[k], p.work[k + 1]]; again(); });
  }
  /** The edit, kept (if anything changed): steps without empty lines. */
  function keep() {
    if (Array.isArray(p.work)) p.work = p.work.map(x => String(x).trim()).filter(Boolean);
    if (JSON.stringify(p) !== JSON.stringify(M.data.problems[i])) M.commit({ k: 'edited', n: i + 1 }, d => { d.problems[i] = clone(p); });
  }
  draw();
}
