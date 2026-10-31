// /live (landingBody) and /live/sets (setsBody): the host's landing form and the question-set editor
// (docs/live-protocol.md). The landing form works without this script (app.js posts data-api forms); here it shows the
// question sets only for picks that use questions, the class picker only for class rooms, and asks before replacing an
// open live game (409 hasOpen). The editor builds sets of 1-50 questions with 2-4 answers each; questions are written by
// grown-ups and checked on the server (profanity and personal information are refused).
import { api, toast, t, esc } from '/js/app.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- landing
const form = $('lv-new');
if (form) {
  const sets = $('lv-sets'), cls = $('lv-class');
  const sync = () => {
    const pick = (form.querySelector('input[name="pick"]:checked') || {}).value || '';
    const card = pick && form.querySelector(`input[name="pick"][value="${CSS.escape(pick)}"]`);
    const quiz = pick.startsWith('mode:') || (card && card.closest('.lv-pick') && card.closest('.lv-pick').dataset.quiz === '1');
    if (sets) sets.hidden = !quiz;
    const aud = (form.querySelector('input[name="audience"]:checked') || {}).value;
    if (cls) cls.closest('.field').hidden = aud !== 'class';
  };
  form.addEventListener('change', sync); sync();
  // Our own submit (before app.js's): a second open game asks first.
  document.addEventListener('submit', async e => {
    if (e.target !== form) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const body = {}; for (const [k, v] of new FormData(form).entries()) body[k] = v;
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
  const SECS = [10, 20, 30, 60];
  let current = null;
  const blank = () => ({ q: '', choices: ['', ''], answer: 0, secs: 20 });
  function render(set) {
    current = set;
    editor.hidden = false;
    editor.innerHTML = `<h2 class="lv-h2">${esc(set.id ? t('js.live-sets.edit') : t('js.live-sets.new'))}</h2>
      <form class="stack" id="lv-set-form" novalidate>
        <div class="field"><label for="lv-set-title">${esc(t('js.live-sets.title'))}</label><input id="lv-set-title" class="input" maxlength="80" required value="${esc(set.title || '')}"></div>
        <div class="field"><label for="lv-set-subject">${esc(t('js.live-sets.subject'))}</label><input id="lv-set-subject" class="input" maxlength="40" value="${esc(set.subject || '')}"></div>
        <label class="lv-check"><input type="checkbox" id="lv-set-shared"${set.shared ? ' checked' : ''}> ${esc(t('js.live-sets.shared'))}</label>
        <ol class="lv-qlist" id="lv-qlist"></ol>
        <p><button class="btn" type="button" id="lv-q-add">＋ ${esc(t('js.live-sets.addQuestion'))}</button></p>
        <p class="err form-err" id="lv-set-err" role="alert"></p>
        <div class="lv-controls"><button class="btn btn-primary" type="submit">${esc(t('js.live-sets.save'))}</button>
        ${set.id ? `<button class="btn" type="button" id="lv-set-archive">${esc(t('js.live-sets.archive'))}</button>` : ''}
        <a class="btn" href="/live">${esc(t('js.live-sets.done'))}</a></div>
      </form>`;
    const list = $('lv-qlist');
    (set.items && set.items.length ? set.items : [blank()]).forEach(it => list.append(question(it)));
    $('lv-q-add').addEventListener('click', () => { if (list.children.length < 50) { const li = question(blank()); list.append(li); li.querySelector('textarea').focus(); } });
    $('lv-set-form').addEventListener('submit', save);
    const ar = $('lv-set-archive'); if (ar) ar.addEventListener('click', async () => { if (!confirm(t('js.live-sets.archiveConfirm'))) return; await api(`/api/live/sets/${set.id}/archive`, { method: 'POST', body: {} }); location.href = '/live/sets'; });
    editor.querySelector('#lv-set-title').focus();
  }
  function question(it) {
    const li = document.createElement('li'); li.className = 'lv-q';
    const n = Math.random().toString(36).slice(2, 8);
    li.innerHTML = `<div class="field"><label for="q-${n}">${esc(t('js.live-sets.question'))}</label><textarea id="q-${n}" class="input" rows="2" maxlength="200">${esc(it.q)}</textarea></div>
      <fieldset class="lv-group"><legend>${esc(t('js.live-sets.answers'))}</legend><div class="lv-choices"></div>
      <button class="btn btn-sm" type="button" data-add-choice>＋ ${esc(t('js.live-sets.addAnswer'))}</button></fieldset>
      <div class="field"><label for="s-${n}">${esc(t('js.live-sets.secs'))}</label><select id="s-${n}" class="input">${SECS.map(s => `<option value="${s}"${s === it.secs ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <button class="btn btn-sm" type="button" data-remove-q>${esc(t('js.live-sets.removeQuestion'))}</button>`;
    const box = li.querySelector('.lv-choices');
    const addChoice = (v, right) => {
      const i = box.children.length; if (i >= 4) return;
      const row = document.createElement('div'); row.className = 'lv-choice';
      row.innerHTML = `<label class="lv-check"><input type="radio" name="right-${n}"${right ? ' checked' : ''}> <span class="vh">${esc(t('js.live-sets.right'))}</span></label><input class="input" maxlength="80" aria-label="${esc(t('js.live-sets.answer', { n: i + 1 }))}" value="${esc(v)}">`;
      box.append(row);
    };
    it.choices.forEach((c, i) => addChoice(c, i === it.answer));
    li.querySelector('[data-add-choice]').addEventListener('click', () => addChoice('', false));
    li.querySelector('[data-remove-q]').addEventListener('click', () => { if (li.parentNode.children.length > 1) li.remove(); });
    return li;
  }
  function collect() {
    return [...document.querySelectorAll('#lv-qlist > li')].map(li => {
      const rows = [...li.querySelectorAll('.lv-choice')];
      return { q: li.querySelector('textarea').value.trim(), choices: rows.map(r => r.querySelector('input.input').value.trim()), answer: Math.max(0, rows.findIndex(r => r.querySelector('input[type=radio]').checked)), secs: +li.querySelector('select').value };
    });
  }
  async function save(e) {
    e.preventDefault();
    const err = $('lv-set-err'); err.textContent = '';
    const body = { title: $('lv-set-title').value.trim(), subject: $('lv-set-subject').value.trim(), shared: $('lv-set-shared').checked, items: collect() };
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
  if (/^#[\w-]{4,}$/.test(location.hash)) open(location.hash.slice(1));
}
