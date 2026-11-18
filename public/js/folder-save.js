// "Save to folder" as a pop-up (docs/decisions.md "Folders: drag to reorder, save in a pop-up"): any link to
// /build/save?id=… (or ?game=<slug>) opens this instead of the page, so a teacher stays where they were (the Oomba game
// list, a game's page, the Studio). Pick a folder or name a new one, Save, then "Keep browsing" (close) or "Open <folder>".
// Without script the link still goes to the /build/save page. Loaded by app.js on the first such click.
import { $, $$, esc, api, sheet, toast } from '/js/app.js';

const fillIn = (s, folder) => String(s).replace('{folder}', folder);

export async function openSave(href) {
  const u = new URL(href, location.href);
  const qs = u.searchParams.get('id') ? `id=${encodeURIComponent(u.searchParams.get('id'))}` : `game=${encodeURIComponent(u.searchParams.get('game') || '')}`;
  let d;
  try { d = await api(`/api/game-folders/save?${qs}`); } catch (err) { if (err.signedOut) { location.href = href; return; } toast(err.message, { bad: true }); return; }
  const W = d.words, first = d.folders.find(f => !f.has);
  const sh = sheet({ title: W.title, content: `<form class="stack fsave" novalidate>
    <fieldset class="fsave-pick"><legend class="fsave-leg">${esc(W.pick)}</legend>
      ${d.folders.length ? `<ul class="plain fsave-list">${d.folders.map(f => `<li><label class="fsave-opt${f.has ? ' is-in' : ''}">
        <input type="radio" name="folder" value="${esc(f.id)}"${f.has ? ' disabled' : ''}${first && f.id === first.id ? ' checked' : ''}>
        <span class="fsave-name"><b dir="auto">📁 ${esc(f.name)}</b><span class="small muted">${esc(f.count)}</span>${f.has ? `<span class="fsave-here">✅ ${esc(fillIn(W.already, f.name))}</span>` : ''}</span></label></li>`).join('')}
      </ul>` : `<p class="muted">${esc(W.none)}</p>`}
      <label class="fsave-opt fsave-newopt"><input type="radio" name="folder" value=""${first ? '' : ' checked'}><span class="fsave-name"><b>➕ ${esc(W.newFolder)}</b></span></label>
      <div class="fsave-new"${first ? ' hidden' : ''}><label class="sr-only" for="fsave-name">${esc(W.name)}</label>
        <input class="input" id="fsave-name" maxlength="60" placeholder="${esc(W.namePlaceholder)}" autocomplete="off"><p class="err small" id="fsave-name-err" role="alert"></p></div>
    </fieldset>
    <button class="btn btn-primary btn-block" type="submit">📁 ${esc(W.save)}</button></form>` });
  const form = $('form', sh.el), newBox = $('.fsave-new', sh.el), nameIn = $('#fsave-name', sh.el), err = $('#fsave-name-err', sh.el);
  const picked = () => (($('input[name="folder"]:checked', form) || {}).value ?? '');
  form.addEventListener('change', () => { newBox.hidden = picked() !== ''; if (!newBox.hidden) nameIn.focus(); });
  // Opening on "New folder" (no folders yet, or every folder already has it): straight to the name.
  if (!first) setTimeout(() => nameIn.focus(), 60);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('[type=submit]', form), id = picked();
    if (id === '' && !nameIn.value.trim()) { err.textContent = W.needName; nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return; }
    btn.disabled = true; err.textContent = '';
    try {
      const r = id ? await api(`/api/game-folders/${encodeURIComponent(id)}/games`, { method: 'POST', body: { gameId: d.game.id } })
        : await api('/api/game-folders', { method: 'POST', body: { name: nameIn.value.trim(), gameId: d.game.id } });
      done(sh, W, r.folder, !!r.already);
    } catch (e2) { btn.disabled = false; if (id === '') { err.textContent = e2.message; nameIn.focus(); } else toast(e2.message, { bad: true }); }
  });
}

/** The confirmation: where it went, then keep browsing (close) or open that folder. */
function done(sh, W, folder, already) {
  const body = $('.sheet-body', sh.el);
  body.innerHTML = `<div class="stack fsave-done" role="status"><p class="fsave-ok"><span aria-hidden="true">✅</span> <b dir="auto">${esc(fillIn(already ? W.already : W.savedTo, folder.name))}</b></p>
    <div class="fsave-acts"><button class="btn btn-block" type="button" data-keep>${esc(W.keep)}</button>
    <a class="btn btn-primary btn-block" href="/build/folders/${encodeURIComponent(folder.id)}" dir="auto">📁 ${esc(fillIn(W.open, folder.name))}</a></div></div>`;
  $('[data-keep]', body).addEventListener('click', () => sh.close());
  $('[data-keep]', body).focus();
}

// The links: every "Save to folder" (on the Oomba game list, a game's page, the Studio, a folder shared with you...).
export function wire(root = document) {
  for (const a of $$('a[href^="/build/save?"]', root)) a.setAttribute('aria-haspopup', 'dialog');
}
