// /build: My games can be renamed or deleted. "New game" is a link to the setup steps (/build/new, buildsetup.js), where
// a game is started (the "Start from" and 3D world cards that were here are in those steps).
import { api, toast, sheet, esc, $, $$, t } from '/js/app.js';

// My games: rename and delete right from the list.
function card(btn) { return btn.closest('.mygame'); }

function rename(li) {
  const { el, close } = sheet({
    title: t('js.build.renameTitle'),
    content: `<form class="mg-sheet"><div class="field"><label for="mg-name">${esc(t('js.build.nameLabel'))}</label>
      <input class="input" id="mg-name" maxlength="60" dir="auto" autocomplete="off" value="${esc(li.dataset.title)}"></div>
      <div class="mg-btns"><button class="btn btn-primary" type="submit">💾 ${esc(t('js.build.save'))}</button></div></form>`,
  });
  const input = $('#mg-name', el); setTimeout(() => input.select(), 40);
  $('form', el).addEventListener('submit', async e => {
    e.preventDefault();
    const title = input.value.trim(); if (!title) { input.focus(); return; }
    const b = $('button[type=submit]', el); b.disabled = true;
    try {
      const r = await api(`/api/studio/${li.dataset.id}/meta`, { method: 'POST', body: { title } });
      const name = r.state.game.title;
      li.dataset.title = name; $('h3 a', li).textContent = name;
      close(); toast(`✅ ${t('js.build.renamed')}`);
    } catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
  });
}

function remove(li) {
  const { el, close } = sheet({
    title: t('js.build.deleteTitle'),
    content: `<div class="mg-sheet"><p>${esc(t('js.build.deleteText', { title: '\u2068' + li.dataset.title + '\u2069' }))}${li.dataset.live ? ' ' + esc(t('js.build.deleteLive')) : ''}</p>
      <div class="mg-btns"><button class="btn" type="button" data-keep>${esc(t('js.build.keep'))}</button>
      <button class="btn btn-danger" type="button" data-yes>🗑️ ${esc(t('js.build.deleteYes'))}</button></div></div>`,
  });
  $('[data-keep]', el).addEventListener('click', close);
  const yes = $('[data-yes]', el);
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      await api(`/api/studio/${li.dataset.id}/delete`, { method: 'POST', body: {} });
      close();
      const list = li.parentElement; li.remove();
      toast(`🗑️ ${t('js.build.deleted')}`);
      if (list && !list.children.length) location.reload();
    } catch (err) { toast(err.message, { bad: true }); yes.disabled = false; }
  });
}

$$('[data-rename]').forEach(b => b.addEventListener('click', () => rename(card(b))));
$$('[data-delete]').forEach(b => b.addEventListener('click', () => remove(card(b))));
