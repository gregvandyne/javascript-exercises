// The teacher's own books as cards (server/routes/library.js madeCard; /library and /library/make): the More menu
// (Rename, Share, Duplicate, Delete), Try again on a book whose first draft never came. Every action is a call to the
// book maker's API (teachers only, own books only, checked on the server). Delete asks in the site's own dialog
// (app.js ask), then the card goes with an Undo message for a few seconds; the book is deleted on the server when the
// message ends (or the page is left), so Undo only has to bring the card back. A book Oomba is still painting shows the
// painting placeholder as its cover and "Painting pictures"; its card is asked for again every few seconds and swapped
// in, so the painted cover arrives without a reload.
import { api, t, esc, pageData, toast, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const D = pageData('sb-books-data');
const L = (k, v) => t(`js.storybook-books.${k}`, v);
const cardOf = el => el.closest('.sb-bcard');
const idOf = card => card.dataset.book;

// ---------------------------------------------------------------- the More menu
function closeMenus(except = null) { document.querySelectorAll('.sb-bmore[open]').forEach(d => { if (d !== except) d.open = false; }); }
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('sb-bmore') || !d.open) return;
  closeMenus(d);
  // the menu opens toward the side with room (a card in the first column of a phone's grid opens to the right)
  const m = d.querySelector('.sb-bmenu'); m.classList.remove('is-flip');
  const r = m.getBoundingClientRect();
  if (r.left < 8 || r.right > document.documentElement.clientWidth - 8) m.classList.add('is-flip');
  const first = m.querySelector('button'); if (first) first.focus();
}, true);
document.addEventListener('click', e => { if (!e.target.closest('.sb-bmore')) closeMenus(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const d = document.activeElement && document.activeElement.closest('.sb-bmore[open]');
  if (d) { d.open = false; d.querySelector('summary').focus(); }
});

// ---------------------------------------------------------------- the actions
document.addEventListener('click', async e => {
  const b = e.target.closest('.sb-bcard [data-b]'); if (!b) return;
  const card = cardOf(b), id = idOf(card), act = b.dataset.b;
  closeMenus();
  if (act === 'rename') return rename(card);
  if (act === 'share') return share(card);
  if (act === 'duplicate') return duplicate(card, b);
  if (act === 'delete') return remove(card);
  if (act === 'retry') {
    b.disabled = true;
    try { const r = await api(`/api/library/make/${encodeURIComponent(id)}/retry`, { method: 'POST' }); location.href = r.redirect; } catch (er) { b.disabled = false; toast(er.message, { bad: true }); }
  }
});

/** Rename in place: the title becomes a text box; Enter or leaving it saves, Escape puts it back. */
function rename(card) {
  const h = card.querySelector('.lb-title'), a = h.querySelector('a'), old = card.dataset.title;
  const f = document.createElement('form'); f.className = 'sb-brename';
  f.innerHTML = `<label class="sr-only" for="sb-rn-${esc(idOf(card))}">${esc(L('titleLabel'))}</label><input class="input" id="sb-rn-${esc(idOf(card))}" maxlength="80" dir="auto" value="${esc(old)}">`;
  h.hidden = true; h.after(f);
  const input = f.querySelector('input'); input.focus(); input.select();
  let done = false;
  const end = () => { done = true; f.remove(); h.hidden = false; };
  const go = async () => {
    if (done) return;
    const v = input.value.trim();
    if (!v || v === old) { end(); return; }
    done = true; input.disabled = true;
    try {
      const r = await api(`/api/library/make/${encodeURIComponent(idOf(card))}/rename`, { method: 'POST', body: { title: v } });
      a.textContent = r.title; card.dataset.title = r.title;
      card.querySelector('.sb-bmore-btn')?.setAttribute('aria-label', L('moreFor', { title: r.title }));
      f.remove(); h.hidden = false; a.focus(); toast(r.toast);
    } catch (er) { done = false; input.disabled = false; input.focus(); toast(er.message, { bad: true }); }
  };
  f.addEventListener('submit', ev => { ev.preventDefault(); go(); });
  input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); end(); a.focus(); } });
  input.addEventListener('blur', () => { setTimeout(go, 0); });
}

/** Share with classes: the editor's own sheet (the classes the teacher may share with, ticked where it is shared). */
function share(card) {
  const classes = D.classes || [];
  if (!classes.length) { toast(L('noClasses'), { bad: true }); return; }
  const on = (card.dataset.shared || '').split(',').filter(Boolean);
  const s = sheet({ title: `📌 ${L('shareTitle')}`, content: `<p class="muted" dir="auto">${esc(card.dataset.title)}</p>
    <form class="sb-shareform"><fieldset><legend class="sr-only">${esc(L('shareTitle'))}</legend>${classes.map(c => `<label class="sb-check"><input type="checkbox" name="c" value="${esc(c.id)}"${on.includes(c.id) ? ' checked' : ''}> <span dir="auto">${esc(c.name)}</span></label>`).join('')}</fieldset>
    <p class="small muted">${esc(L('shareNote'))}</p><div class="row"><button class="btn btn-primary" type="submit">${esc(L('shareSave'))}</button></div></form>` });
  s.el.querySelector('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      const r = await api(`/api/library/make/${encodeURIComponent(idOf(card))}/share`, { method: 'POST', body: { classIds: [...s.el.querySelectorAll('input[name=c]:checked')].map(x => x.value) } });
      card.dataset.shared = r.shared.join(','); s.close(); toast(r.toast);
      const m = card.querySelector('.lb-meta');
      if (m) m.textContent = m.textContent.split(' · ').slice(0, 2).concat(r.shared.length ? [L('sharedN', { count: r.shared.length })] : []).join(' · ');
    } catch (er) { toast(er.message, { bad: true }); }
  });
}

/** Duplicate: the copy's card goes first in the grid. */
async function duplicate(card, btn) {
  btn.disabled = true;
  try {
    const r = await api(`/api/library/make/${encodeURIComponent(idOf(card))}/duplicate`, { method: 'POST' });
    const tmp = document.createElement('ul'); tmp.innerHTML = r.card;
    const nc = tmp.firstElementChild; card.parentElement.prepend(nc);
    nc.classList.add('is-new'); nc.querySelector('.lb-title a')?.focus();
    toast(r.toast); watchPainting();
  } catch (er) { toast(er.message, { bad: true }); } finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- delete, with Undo
const UNDO_MS = 6000;
const pending = new Map();   // id -> { card, at, timer }
let undoEl = null;
function undoBar(msg, onUndo) {
  if (!undoEl || !undoEl.isConnected) { undoEl = document.createElement('div'); undoEl.className = 'sb-undo'; undoEl.setAttribute('role', 'status'); document.body.appendChild(undoEl); }
  undoEl.innerHTML = `<span dir="auto">${esc(msg)}</span><button type="button" class="sb-undobtn">${iconHtml('↩️', { size: 16 })} ${esc(L('undo'))}</button>`;
  undoEl.hidden = false;
  undoEl.querySelector('button').onclick = () => { undoEl.hidden = true; onUndo(); };
}
function commit(id, { leaving = false } = {}) {
  const p = pending.get(id); if (!p) return;
  pending.delete(id); clearTimeout(p.timer);
  const url = `/api/library/make/${encodeURIComponent(id)}/delete`;
  if (leaving) { try { fetch(url, { method: 'POST', credentials: 'same-origin', keepalive: true }); } catch { /* the page is going */ } return; }
  api(url, { method: 'POST' }).then(() => { p.card.remove(); if (undoEl && !pending.size) undoEl.hidden = true; })
    .catch(er => { p.card.hidden = false; toast(er.message, { bad: true }); });
}
async function remove(card) {
  const title = card.dataset.title;
  if (!(await ask({ title: L('deleteQ', { title }), text: L('deleteText'), ok: L('deleteOk'), danger: true }))) return;
  const id = idOf(card);
  card.hidden = true;
  const timer = setTimeout(() => commit(id), UNDO_MS);
  pending.set(id, { card, timer });
  undoBar(L('deleted', { title }), () => {
    const p = pending.get(id); if (!p) return;
    clearTimeout(p.timer); pending.delete(id); card.hidden = false; card.querySelector('.lb-title a, button')?.focus();
  });
  setTimeout(() => { if (undoEl && !pending.size) undoEl.hidden = true; }, UNDO_MS + 50);
}
// Leaving the page while Undo is still offered: the delete goes now.
window.addEventListener('pagehide', () => { for (const id of [...pending.keys()]) commit(id, { leaving: true }); });

// ---------------------------------------------------------------- books Oomba is still painting
let watching = null;
/** Every few seconds, each card still painting is asked for again (GET .../card) and swapped in when it changed; a card
 *  with its menu open, being renamed or waiting for Undo waits for the next look. Stops when no card is painting. */
function watchPainting() {
  if (watching || !document.querySelector('.sb-bcard[data-painting]')) return;
  watching = setTimeout(async () => {
    for (const card of [...document.querySelectorAll('.sb-bcard[data-painting]')]) {
      if (card.hidden || card.querySelector('.sb-bmore[open], .sb-brename')) continue;
      try {
        const r = await api(`/api/library/make/${encodeURIComponent(idOf(card))}/card`, { background: true });
        const tmp = document.createElement('ul'); tmp.innerHTML = r.card;
        const nc = tmp.firstElementChild;
        if (nc && card.isConnected && !card.hidden && nc.outerHTML !== card.outerHTML) card.replaceWith(nc);
      } catch (er) { if (er && er.status === 404) card.removeAttribute('data-painting'); }
    }
    watching = null; watchPainting();
  }, 4000);
}
watchPainting();
