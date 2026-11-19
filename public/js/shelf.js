// The folder sidebar on Build and the class page's Games tab (server/routes/game-shelf.js; docs/decisions.md "Folders in
// a sidebar, on Build and the class page"). Every item in the left column is a plain link (?folder=<id> or ?view=…),
// so without script the page simply loads. Here a click fetches the same address with the X-Shelf header, swaps in
// the right side only, marks the item (aria-current) and pushes the address: a reload and Back keep what was picked.
// A modifier-key click (a new tab) or a failed fetch opens the page as a link would.
import { $, $$ } from '/js/app.js';
import { wire as wireDrop } from '/js/folder-drop.js';

const shelf = $('[data-shelf]');
const V = new URL(import.meta.url).search;
let ctrl = null;

const mainOf = () => $('#shelf-main', shelf);
function mark(key) {
  for (const a of $$('.shelf-item[data-shelf-key]', shelf)) {
    const on = a.dataset.shelfKey === key;
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  }
  // On a phone the items are one row of chips: the picked one is scrolled into view (the row only, never the page).
  const cur = $('.shelf-item.is-on', shelf), nav = $('.shelf-nav', shelf);
  if (cur && nav && nav.scrollWidth > nav.clientWidth) {
    const a = cur.getBoundingClientRect(), n = nav.getBoundingClientRect(), pad = 16;
    if (a.left < n.left) nav.scrollLeft -= n.left - a.left + pad; else if (a.right > n.right) nav.scrollLeft += a.right - n.right + pad;
  }
}
/** Lists in the new side that can be dragged into order (public/js/reorder.js, the same copy app.js loads). */
function wire(root) { if (root.querySelector('[data-reorder]')) import(`/js/reorder.js${V}`).then(m => m.wireAll(root)).catch(() => {}); }

async function show(href, { push = true } = {}) {
  const main = mainOf(); if (!main) { location.href = href; return; }
  if (ctrl) ctrl.abort(); ctrl = new AbortController();
  main.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(href, { headers: { 'X-Shelf': '1' }, credentials: 'same-origin', signal: ctrl.signal });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('json')) throw new Error(String(res.status));
    const r = await res.json();
    main.innerHTML = r.html; main.dataset.shelfKey = r.key; main.dataset.href = r.href;
    mark(r.key);
    if (push) history.pushState({ shelf: r.key }, '', r.href);
    wire(main);
    const h = $('#shelf-h', main), say = $('#shelf-say', shelf);
    if (say && h) { say.textContent = ''; setTimeout(() => { say.textContent = h.textContent.trim(); }, 30); }
    // A narrow screen: the new side starts below the chips, so bring its top into view when it is off screen.
    const top = main.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.8) main.scrollIntoView({ block: 'start' });
  } catch (e) {
    if (e.name !== 'AbortError') location.href = href;
  } finally { main.removeAttribute('aria-busy'); }
}

if (shelf) {
  // Games on the right side can be dragged onto one of my folders on the left (folder-drop.js).
  wireDrop(mainOf());
  history.replaceState({ shelf: mainOf()?.dataset.shelfKey || '' }, '', location.href);
  shelf.addEventListener('click', e => {
    // The left column's items, and links in the right side that open another part of it (Find Oomba games, its subjects).
    const a = e.target instanceof Element && e.target.closest('a.shelf-item[data-shelf-key], #shelf-main a[data-shelf-go]');
    if (!a || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (a.getAttribute('aria-current') === 'true') return;
    show(a.href);
  });
  // A game moved out of the folder on show (folder-drop.js): show that folder again, as it is now.
  document.addEventListener('shelf:refresh', () => show(location.href, { push: false }));
  addEventListener('popstate', e => { if (e.state && 'shelf' in e.state) show(location.href, { push: false }); });
  // Find Oomba games: a new grade, or the search sent with Enter, loads that list in place (the form's own GET address).
  const formHref = form => { const u = new URL(form.action, location.href); u.search = new URLSearchParams(new FormData(form)).toString(); return u.pathname + u.search; };
  shelf.addEventListener('change', e => { const sel = e.target instanceof Element && e.target.closest('#shelf-main [data-oomba-grade]'); if (sel) show(formHref(sel.form)); });
  shelf.addEventListener('submit', e => { const f = e.target instanceof Element && e.target.closest('#shelf-main form[data-oomba-form]'); if (!f) return; e.preventDefault(); show(formHref(f)); });

  // The ⋯ menus and the Assign folds: one open at a time; a tap outside or Escape closes them.
  const folds = () => $$('details.shelf-menu[open],details.shelf-pop[open],details.shelf-newf[open]', shelf);
  shelf.addEventListener('toggle', e => {
    const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    for (const o of folds()) if (o !== d && !o.contains(d)) o.open = false;
    const first = d.querySelector('input:not([type=hidden]),select,button,a');
    if (first && d.matches('.shelf-pop,.shelf-newf')) setTimeout(() => first.focus(), 30);
  }, true);
  document.addEventListener('click', e => { for (const d of folds()) if (!d.contains(e.target)) d.open = false; });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const d of folds()) { d.open = false; const s = d.querySelector('summary'); if (s) s.focus(); }
  });
}

// Find Oomba games' search box filters the list as it is typed (each game's title, subject and grades), here and in the
// phone's library; Enter (or the grade) asks the server, so the address keeps it.
document.addEventListener('input', e => {
  const box = e.target instanceof Element && e.target.closest('[data-oomba-q]'); if (!box) return;
  const pane = box.closest('#shelf-main, .lib-oomba') || document;
  const words = box.value.toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  for (const li of $$('.oomba-game', pane)) { const hit = words.every(w => (li.dataset.q || '').includes(w)); li.hidden = !hit; if (hit) n++; }
  const none = $('.oomba-none', pane); if (none) none.hidden = n > 0;
  const count = $('[data-oomba-count]', pane); if (count) count.textContent = n === 1 ? count.dataset.one : count.dataset.many.replace('{n}', n);
});
