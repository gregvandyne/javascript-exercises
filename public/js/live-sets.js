// /live (landingBody) and /live/sets (setsBody): the host's landing form and the question-set editor
// (docs/live-protocol.md). The landing form works without this script (app.js posts data-api forms); here it shows the
// question sets only for picks that use questions, the class picker only for class rooms, and asks before replacing an
// open live game (409 hasOpen). Each question may have a category (Brain Board's column). The editor builds sets of 1-100 questions with 2-4 answers each (typed, pasted from a spreadsheet or drafted by the
// AI, then edited); questions are written by
// grown-ups and checked on the server (profanity and personal information are refused).
import { api, toast, sheet, t, esc } from '/js/app.js';
import { SECS, MAX, parsePasted } from '/js/live-paste.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- landing
const form = $('lv-new');
if (form) {
  const sets = $('lv-sets'), cls = $('lv-class');
  const sync = ev => {
    const pick = (form.querySelector('input[name="pick"]:checked') || {}).value || '';
    const card = pick && form.querySelector(`input[name="pick"][value="${CSS.escape(pick)}"]`);
    const quiz = pick.startsWith('mode:') || (card && card.closest('.lv-pick') && card.closest('.lv-pick').dataset.quiz === '1');
    // Would You Rather Live and Atlas Quest Live make their own questions: their options instead of a question set.
    const own = !!(card && card.closest('.lv-pick') && card.closest('.lv-pick').dataset.own === '1');
    if (sets) sets.hidden = !quiz || own;
    for (const box of form.querySelectorAll('.lv-own')) box.hidden = pick !== `mode:${box.dataset.ownMode}`;
    // Tug of Math Live splits the players into its own two teams: no teams row; its grade shows sample questions.
    const tr = $('lv-teams-landing'); if (tr) tr.hidden = pick === 'mode:tug';
    const tg = $('lv-tug-grade'), sample = $('lv-tug-sample');
    if (tg && sample) { try { sample.textContent = JSON.parse($('lv-tug-samples').textContent)[tg.value] || ''; } catch { /* keep */ } }
    // at least one topic / question kind stays ticked (unticking the last one ticks it again)
    for (const name of ['wyrTopic', 'atlasKind']) {
      const boxes = [...form.querySelectorAll(`input[name="${name}"]`)];
      if (boxes.length && !boxes.some(x => x.checked)) ((ev && ev.target && boxes.includes(ev.target)) ? ev.target : boxes[0]).checked = true;
    }
    // The question bank: subject, level and how many; a board (Brain Board) ticks its subjects instead.
    const bank = $('lv-bank'), setSel = $('lv-set');
    if (bank && setSel) {
      bank.hidden = !quiz || setSel.value !== 'bank';
      const board = pick === 'mode:board';
      for (const el of bank.querySelectorAll('.lv-bank-one')) el.hidden = board;
      const bf = bank.querySelector('.lv-bank-board'); if (bf) bf.hidden = !board;
      // a board needs 2 to 6 subjects: stop at 6, never untick the second-last
      const boxes = [...bank.querySelectorAll('input[name="bankBoard"]')], on = boxes.filter(x => x.checked).length;
      for (const x of boxes) x.disabled = (!x.checked && on >= 6) || (x.checked && on <= 2);
    }
    const aud = (form.querySelector('input[name="audience"]:checked') || {}).value;
    if (cls) cls.closest('.field').hidden = aud !== 'class';
    // part 3: quiz-only settings only for picks that use questions; how teams score only when teams are on;
    // "names" (account names) only in a class room
    for (const el of form.querySelectorAll('#lv-settings-landing .lv-quiz-only')) el.hidden = !quiz;
    const teams = +((form.querySelector('input[name="teams"]:checked') || {}).value || 0);
    const sc = form.querySelector('.lv-team-scoring'); if (sc) sc.hidden = !teams;
    const names = form.querySelector('select[name="names"]');
    if (names) { const o = names.querySelector('option[value="names"]'); if (o) { o.hidden = o.disabled = aud !== 'class'; if (aud !== 'class' && names.value === 'names') names.value = 'nicknames'; } }
    // "Most players": never more than the picked game is made for (its card's data-max); the server clamps it too.
    const mx = $('lv-max'), hint = $('lv-max-hint');
    if (mx) {
      const lab = card && card.closest('.lv-pick'), ceiling = +mx.dataset.ceiling || 60;
      const top = Math.min(ceiling, lab && +lab.dataset.max ? +lab.dataset.max : ceiling);
      const was = +mx.max;
      mx.max = String(top);
      if (!+mx.value || +mx.value > top || +mx.value === was) mx.value = String(top);
      if (hint && hint.dataset.tpl) hint.textContent = hint.dataset.tpl.replace('{max}', String(top));
    }
  };
  const reset = $('lv-prefs-reset');
  if (reset) reset.addEventListener('click', async () => {
    reset.disabled = true;
    try { await api(reset.dataset.href, { method: 'DELETE' }); location.reload(); } catch (er) { toast(er.message, { bad: true }); reset.disabled = false; }
  });
  // Tug of Math Live: the grade and length this browser picked last (not when a lesson's link chose them).
  const TUG_KEY = 'lv-tug', tugBox = $('lv-tug-opts');
  if (tugBox && !tugBox.dataset.preset) {
    try {
      const last = JSON.parse(localStorage.getItem(TUG_KEY) || 'null');
      if (last) for (const [id, v] of [['lv-tug-grade', last.g], ['lv-tug-len', last.l]]) { const el = $(id); if (el && [...el.options].some(o => o.value === String(v))) el.value = String(v); }
    } catch { /* private mode */ }
  }
  form.addEventListener('change', sync); sync();
  // Our own submit (before app.js's): a second open game asks first.
  document.addEventListener('submit', async e => {
    if (e.target !== form) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // ticked boxes of one name (wyrTopic, bankBoard, atlasKind) go as a list, as app.js posts forms
    const body = {}; for (const [k, v] of new FormData(form).entries()) body[k] = k in body ? [].concat(body[k], v) : v;
    if (body.pick === 'mode:tug') { try { localStorage.setItem(TUG_KEY, JSON.stringify({ g: body.tugGrade, l: body.tugLen })); } catch { /* private mode */ } }
    const btn = form.querySelector('[type=submit]'), err = form.querySelector('.form-err');
    btn.disabled = true; err.textContent = '';
    const go = async replace => {
      try { const r = await api('/api/live/sessions', { method: 'POST', body: { ...body, replace } }); location.href = r.redirect; }
      catch (er) {
        if (er.data && er.data.code === 'hasOpen') {
          if (confirm(t('js.live-sets.replaceOpen'))) return go(true);
          location.href = er.data.host; return;
        }
        err.textContent = er.message; btn.disabled = false;
      }
    };
    go(false);
  }, true);
}

// ---------------------------------------------------------------- sets editor
const editor = $('lv-set-editor');
if (editor) {
  let current = null;
  const blank = () => ({ q: '', choices: ['', ''], answer: 0, secs: 20 });
  const tf = () => [t('js.live-sets.true'), t('js.live-sets.false')];
  function render(set) {
    current = set;
    editor.hidden = false;
    editor.innerHTML = `<h2 class="lv-h2">${esc(set.id ? t('js.live-sets.edit') : t('js.live-sets.new'))}</h2>
      <form class="stack" id="lv-set-form" novalidate>
        <div class="field"><label for="lv-set-title">${esc(t('js.live-sets.title'))}</label><input id="lv-set-title" class="input" maxlength="80" required value="${esc(set.title || '')}"></div>
        <div class="lv-set-meta">
          <div class="field"><label for="lv-set-subject">${esc(t('js.live-sets.subject'))}</label><input id="lv-set-subject" class="input" maxlength="40" value="${esc(set.subject || '')}"></div>
          <div class="field"><label for="lv-set-grade">${esc(t('js.live-sets.grade'))}</label><input id="lv-set-grade" class="input" maxlength="20" placeholder="${esc(t('js.live-sets.gradeHint'))}" value="${esc(set.grade || '')}"></div>
        </div>
        <label class="lv-check"><input type="checkbox" id="lv-set-shared"${set.shared ? ' checked' : ''}> ${esc(t('js.live-sets.shared'))}</label>
        <div class="lv-set-tools">
          <button class="btn" type="button" id="lv-set-ai">✨ ${esc(t('js.live-sets.aiButton'))}</button>
          <button class="btn" type="button" id="lv-set-paste">📋 ${esc(t('js.live-sets.pasteButton'))}</button>
        </div>
        <ol class="lv-qlist" id="lv-qlist"></ol>
        <p><button class="btn" type="button" id="lv-q-add">＋ ${esc(t('js.live-sets.addQuestion'))}</button> <span class="small muted" id="lv-q-count"></span></p>
        <p class="err form-err" id="lv-set-err" role="alert"></p>
        <div class="lv-controls"><button class="btn btn-primary" type="submit">${esc(t('js.live-sets.save'))}</button>
        ${set.id ? `<button class="btn" type="button" id="lv-set-archive">${esc(t('js.live-sets.archive'))}</button>` : ''}
        <a class="btn" href="/live">${esc(t('js.live-sets.done'))}</a></div>
      </form>`;
    const list = $('lv-qlist');
    (set.items && set.items.length ? set.items : [blank()]).forEach(it => list.append(question(it)));
    count();
    $('lv-q-add').addEventListener('click', () => { if (list.children.length < MAX.items) { const li = question(blank()); list.append(li); count(); li.querySelector('textarea').focus(); } });
    $('lv-set-ai').addEventListener('click', aiDialog);
    $('lv-set-paste').addEventListener('click', pasteDialog);
    $('lv-set-form').addEventListener('submit', save);
    const ar = $('lv-set-archive'); if (ar) ar.addEventListener('click', async () => { if (!confirm(t('js.live-sets.archiveConfirm'))) return; await api(`/api/live/sets/${set.id}/archive`, { method: 'POST', body: {} }); location.href = '/live/sets'; });
    editor.querySelector('#lv-set-title').focus();
  }
  const count = () => { const n = $('lv-qlist').children.length; $('lv-q-count').textContent = t('js.live-sets.count', { n, max: MAX.items }); $('lv-q-add').disabled = n >= MAX.items; };
  /** Adds questions at the end (an untouched first blank question is replaced). */
  function addItems(items) {
    const list = $('lv-qlist');
    const only = list.children.length === 1 && !collect()[0].q && collect()[0].choices.every(c => !c);
    if (only) list.innerHTML = '';
    const room = MAX.items - list.children.length;
    items.slice(0, room).forEach(it => list.append(question(it)));
    count();
    return Math.min(items.length, room);
  }
  function question(it) {
    const li = document.createElement('li'); li.className = 'lv-q';
    const n = Math.random().toString(36).slice(2, 8);
    li.innerHTML = `<div class="field lv-cat"><label for="c-${n}">${esc(t('js.live-sets.category'))}</label><input id="c-${n}" class="input" maxlength="${MAX.cat}" placeholder="${esc(t('js.live-sets.categoryHint'))}" value="${esc(it.cat || '')}" data-cat></div>
      <div class="field"><label for="q-${n}">${esc(t('js.live-sets.question'))}</label><textarea id="q-${n}" class="input" rows="2" maxlength="${MAX.q}">${esc(it.q)}</textarea></div>
      <fieldset class="lv-group"><legend>${esc(t('js.live-sets.answers'))}</legend><div class="lv-choices"></div>
      <div class="lv-row"><button class="btn btn-sm" type="button" data-add-choice>＋ ${esc(t('js.live-sets.addAnswer'))}</button>
      <button class="btn btn-sm" type="button" data-tf>${esc(t('js.live-sets.makeTf'))}</button></div></fieldset>
      <div class="field"><label for="s-${n}">${esc(t('js.live-sets.secs'))}</label><select id="s-${n}" class="input lv-secs">${SECS.map(s => `<option value="${s}"${s === it.secs ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="lv-row lv-q-tools">
        <button class="btn btn-sm" type="button" data-up aria-label="${esc(t('js.live-sets.moveUp'))}">↑</button>
        <button class="btn btn-sm" type="button" data-down aria-label="${esc(t('js.live-sets.moveDown'))}">↓</button>
        <button class="btn btn-sm" type="button" data-dup>${esc(t('js.live-sets.duplicate'))}</button>
        <button class="btn btn-sm" type="button" data-remove-q>${esc(t('js.live-sets.removeQuestion'))}</button>
      </div>`;
    const box = li.querySelector('.lv-choices');
    const addChoice = (v, right) => {
      const i = box.children.length; if (i >= 4) return;
      const row = document.createElement('div'); row.className = 'lv-choice';
      row.innerHTML = `<label class="lv-check"><input type="radio" name="right-${n}"${right ? ' checked' : ''}> <span class="vh">${esc(t('js.live-sets.right'))}</span></label><input class="input" maxlength="${MAX.choice}" aria-label="${esc(t('js.live-sets.answer', { n: i + 1 }))}" value="${esc(v)}"><button class="btn btn-sm lv-x" type="button" data-remove-choice aria-label="${esc(t('js.live-sets.removeAnswer'))}">✕</button>`;
      box.append(row);
    };
    it.choices.forEach((c, i) => addChoice(c, i === it.answer));
    li.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-add-choice]')) addChoice('', false);
      else if (b.matches('[data-remove-choice]')) { if (box.children.length > 2) b.closest('.lv-choice').remove(); }
      else if (b.matches('[data-tf]')) { box.innerHTML = ''; tf().forEach((c, i) => addChoice(c, i === 0)); }
      else if (b.matches('[data-up]') && li.previousElementSibling) { li.previousElementSibling.before(li); b.focus(); }
      else if (b.matches('[data-down]') && li.nextElementSibling) { li.nextElementSibling.after(li); b.focus(); }
      else if (b.matches('[data-dup]')) { if (li.parentNode.children.length < MAX.items) { li.after(question(read(li))); count(); } }
      else if (b.matches('[data-remove-q]')) { if (li.parentNode.children.length > 1) { li.remove(); count(); } }
    });
    return li;
  }
  const read = li => {
    const rows = [...li.querySelectorAll('.lv-choice')];
    const cat = li.querySelector('[data-cat]').value.trim();
    return { ...(cat ? { cat } : {}), q: li.querySelector('textarea').value.trim(), choices: rows.map(r => r.querySelector('input.input').value.trim()), answer: Math.max(0, rows.findIndex(r => r.querySelector('input[type=radio]').checked)), secs: +li.querySelector('select').value };
  };
  const collect = () => [...document.querySelectorAll('#lv-qlist > li')].map(read);

  // ✨ Draft with AI: the questions come into the editor; nothing is saved until Save.
  function aiDialog() {
    const s = sheet({ title: t('js.live-sets.aiTitle'), content: `<form class="stack" id="lv-ai-form" novalidate>
      <p class="small muted">${esc(t('js.live-sets.aiIntro'))}</p>
      <div class="field"><label for="lv-ai-topic">${esc(t('js.live-sets.aiTopic'))}</label><textarea id="lv-ai-topic" class="input" rows="2" maxlength="300" placeholder="${esc(t('js.live-sets.aiTopicHint'))}"></textarea></div>
      <div class="field"><label for="lv-ai-level">${esc(t('js.live-sets.aiLevel'))}</label><input id="lv-ai-level" class="input" maxlength="60" placeholder="${esc(t('js.live-sets.aiLevelHint'))}" value="${esc(($('lv-set-grade') || {}).value || '')}"></div>
      <div class="lv-set-meta">
        <div class="field"><label for="lv-ai-count">${esc(t('js.live-sets.aiCount'))}</label><select id="lv-ai-count" class="input">${[5, 10, 15, 20, 30].map(x => `<option${x === 10 ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="lv-ai-kind">${esc(t('js.live-sets.aiKind'))}</label><select id="lv-ai-kind" class="input">
          <option value="mixed">${esc(t('js.live-sets.aiMixed'))}</option><option value="choice4">${esc(t('js.live-sets.aiChoice4'))}</option><option value="truefalse">${esc(t('js.live-sets.aiTf'))}</option><option value="board">${esc(t('js.live-sets.aiBoard'))}</option></select></div>
      </div>
      <p class="err" role="alert"></p>
      <button class="btn btn-primary" type="submit">✨ ${esc(t('js.live-sets.aiGo'))}</button></form>` });
    const f = s.el.querySelector('form'), err = s.el.querySelector('.err');
    f.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const topic = f.querySelector('#lv-ai-topic').value.trim(); if (!topic) { err.textContent = t('js.live-sets.aiNeedTopic'); return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = t('js.live-sets.aiWorking');
      try {
        const r = await api('/api/live/sets/draft', { method: 'POST', body: { topic, level: f.querySelector('#lv-ai-level').value.trim(), count: +f.querySelector('#lv-ai-count').value, kind: f.querySelector('#lv-ai-kind').value } });
        const title = $('lv-set-title'); if (!title.value.trim()) title.value = r.title;
        const n = addItems(r.items); s.close(); toast(t('js.live-sets.added', { n }));
      } catch (er) { err.textContent = er.message; btn.disabled = false; btn.textContent = `✨ ${t('js.live-sets.aiGo')}`; }
    });
  }
  // 📋 Paste questions: from a spreadsheet (one row each) or a document (one block each).
  function pasteDialog() {
    const s = sheet({ title: t('js.live-sets.pasteTitle'), content: `<div class="stack">
      <p class="small">${esc(t('js.live-sets.pasteSheet'))}</p>
      <p class="small">${esc(t('js.live-sets.pasteText'))}</p>
      <p class="small muted">${esc(t('js.live-sets.pasteCats'))}</p>
      <pre class="lv-paste-example" dir="auto">${esc(t('js.live-sets.pasteExample'))}</pre>
      <label class="sr-only" for="lv-paste">${esc(t('js.live-sets.pasteButton'))}</label>
      <textarea id="lv-paste" class="input" rows="8"></textarea>
      <p class="small muted" id="lv-paste-n" aria-live="polite"></p>
      <button class="btn btn-primary" type="button" id="lv-paste-go" disabled>${esc(t('js.live-sets.pasteGo'))}</button></div>` });
    const ta = s.el.querySelector('#lv-paste'), go = s.el.querySelector('#lv-paste-go'), info = s.el.querySelector('#lv-paste-n');
    let found = [];
    ta.addEventListener('input', () => { found = parsePasted(ta.value, { header: t('js.live-sets.question'), catHeader: t('js.live-sets.categoryColumn') }); info.textContent = t('js.live-sets.pasteFound', { n: found.length }); go.disabled = !found.length; });
    go.addEventListener('click', () => { const n = addItems(found); s.close(); toast(t('js.live-sets.added', { n })); });
  }
  async function save(e) {
    e.preventDefault();
    const err = $('lv-set-err'); err.textContent = '';
    const body = { title: $('lv-set-title').value.trim(), subject: $('lv-set-subject').value.trim(), grade: $('lv-set-grade').value.trim(), shared: $('lv-set-shared').checked, items: collect() };
    try {
      const r = await api(current.id ? `/api/live/sets/${current.id}` : '/api/live/sets', { method: 'POST', body });
      toast(t('js.live-sets.saved'));
      if (!current.id) { current.id = r.id; history.replaceState(null, '', `/live/sets#${r.id}`); }
    } catch (er) { err.textContent = er.message; }
  }
  const open = async id => { try { render(await api(`/api/live/sets/${encodeURIComponent(id)}`)); } catch (er) { toast(er.message, { bad: true }); } };
  $('lv-set-new') && $('lv-set-new').addEventListener('click', () => render({ title: '', items: [] }));
  const list = $('lv-setlist');
  if (list) for (const li of list.querySelectorAll('li[data-set]')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = t('js.live-sets.edit');
    b.addEventListener('click', () => open(li.dataset.set)); li.append(' ', b);
  }
  // A colleague's shared set: make your own copy to change.
  for (const b of document.querySelectorAll('[data-copy-set]')) b.addEventListener('click', async () => {
    b.disabled = true;
    try { const r = await api(`/api/live/sets/${encodeURIComponent(b.dataset.copySet)}/copy`, { method: 'POST', body: {} }); location.href = r.redirect; location.reload(); }
    catch (er) { toast(er.message, { bad: true }); b.disabled = false; }
  });
  if (/^#[\w-]{4,}$/.test(location.hash)) open(location.hash.slice(1));
}
