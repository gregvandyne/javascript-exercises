// Drag to reorder (docs/decisions.md "Folders: drag to reorder, save in a pop-up"): a list with data-reorder="<url>" and
// items with data-id. A mouse drags at once (after a few pixels); a finger or pen holds still for a moment first, so a
// swipe still scrolls the page. Keyboard: on an item's grip ([data-grip]), Alt and an arrow key move it one place. The new
// order is posted as { ids } to the list's URL; if that fails, the page reloads with the order that was saved.
// Loaded by app.js on pages that have such a list.
import { $$, api, toast } from '/js/app.js';
import * as drop from '/js/folder-drop.js';

const HOLD_MS = 350, SLOP = 8, MOUSE_SLOP = 5;
let live = null;
const say = msg => {
  if (!live) { live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
  live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30);
};
const itemsOf = list => [...list.children].filter(li => li.dataset.id);
const nameOf = li => (li.querySelector('h3, b') || li).textContent.trim();
/** "{name}: {n} of {total}" in the page's language, from the list's data-moved (the server fills in the words). */
const movedMsg = (list, li, n, total) => (list.dataset.moved || '{name}: {n} / {total}').replace('{name}', nameOf(li)).replace('{n}', n).replace('{total}', total);

async function saveOrder(list) {
  try { await api(list.dataset.reorder, { method: 'POST', body: { ids: itemsOf(list).map(li => li.dataset.id) } }); }
  catch (err) { toast(err.message, { bad: true }); setTimeout(() => location.reload(), 1200); }
}

function wire(list) {
  if (list.dataset.reorderOn) return;
  list.dataset.reorderOn = '1';
  list.classList.add('is-reorderable');
  let drag = null, holdTimer = 0, eatClick = false;

  const startDrag = () => {
    const { li, x, y } = drag;
    const r = li.getBoundingClientRect();
    drag.on = true; drag.dx = x - r.left; drag.dy = y - r.top;
    li.classList.add('is-dragging'); list.classList.add('is-sorting'); document.body.classList.add('is-sorting');
    if (navigator.vibrate && drag.touch) try { navigator.vibrate(12); } catch { /* not allowed */ }
  };
  const follow = (x, y) => {
    const li = drag.li;
    li.style.transform = '';
    // Where the pointer is now: before the item whose middle it has not reached (reading order, so wrapped rows and
    // right-to-left pages work), else at the end.
    const others = itemsOf(list).filter(o => o !== li);
    const rects = others.map(o => o.getBoundingClientRect());
    // One column (game cards): above an item's middle goes before it. Wrapped rows (folder chips): reading order, an
    // earlier row or, in the same row, before an item's middle (from the right on a right-to-left page).
    const column = rects.length < 2 || rects.every(r => Math.abs(r.left - rects[0].left) < 4);
    const rtl = getComputedStyle(list).direction === 'rtl';
    let before = null;
    for (let k = 0; k < others.length; k++) {
      const r = rects[k];
      const hit = column ? y < r.top + r.height / 2
        : y < r.top || (y <= r.bottom && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2));
      if (hit) { before = others[k]; break; }
    }
    const tail = itemsOf(list).at(-1);
    if (before !== li.nextElementSibling && before !== li) {
      if (before) list.insertBefore(li, before); else if (tail && tail !== li) tail.after(li);
    }
    const r = li.getBoundingClientRect();
    // A game card over one of my folders (folder-drop.js): it shrinks toward the pointer, so the folder shows.
    const onFolder = drag.games && drop.hover(x, y);
    li.style.transformOrigin = `${drag.dx}px ${drag.dy}px`;
    li.style.transform = `translate(${x - drag.dx - r.left}px, ${y - drag.dy - r.top}px)${onFolder ? ' scale(.3)' : ''}`;
  };
  const end = commit => {
    clearTimeout(holdTimer);
    if (!drag) return;
    const { li, on, from, x, y, games } = drag;
    drag = null;
    if (!on) return;
    li.classList.remove('is-dragging'); li.style.transform = ''; li.style.transformOrigin = ''; list.classList.remove('is-sorting'); document.body.classList.remove('is-sorting');
    eatClick = true; setTimeout(() => { eatClick = false; }, 50);
    // Dropped on one of my folders: the game is saved there and keeps its place here.
    const folder = games && commit ? drop.targetAt(x, y) : null;
    if (games) drop.clear();
    if (folder) {
      const items = itemsOf(list).filter(o => o !== li), at = items[from];
      if (at) list.insertBefore(li, at); else if (items.length) items.at(-1).after(li);
      drop.dropOn(folder, li);
      return;
    }
    const to = itemsOf(list).indexOf(li);
    if (commit && to !== from) { saveOrder(list); say(movedMsg(list, li, to + 1, itemsOf(list).length)); }
  };

  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('[data-id]');
    if (!li || li.parentElement !== list || e.button > 0) return;
    // Buttons, fields and forms in a card keep their own taps; the grip and the card itself start a drag.
    if (e.target.closest('input, select, textarea, form, .mg-actions, details') && !e.target.closest('[data-grip]')) return;
    const touch = e.pointerType !== 'mouse';
    drag = { li, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, touch, from: itemsOf(list).indexOf(li), id: e.pointerId, games: li.classList.contains('shelf-game') };
    if (touch) holdTimer = setTimeout(() => { if (drag && !drag.on) { startDrag(); follow(drag.x, drag.y); } }, HOLD_MS);
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (!drag.on) {
      if (drag.touch) { if (moved > SLOP) end(false); return; }   // a finger moving before the hold: a scroll
      if (moved < MOUSE_SLOP) return;
      startDrag();
    }
    e.preventDefault();
    follow(e.clientX, e.clientY);
  });
  addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) end(true); });
  addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) end(true); });
  // While a finger drags, the page must not scroll (a passive listener could not stop it).
  addEventListener('touchmove', e => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  // The long press that starts a drag would also open the browser's menu for a link or picture.
  list.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });
  // A drag that ends over a link (a folder chip) must not also open it.
  list.addEventListener('click', e => { if (eatClick) { e.preventDefault(); e.stopPropagation(); } }, true);
  list.addEventListener('dragstart', e => e.preventDefault());   // no native image/link drag

  // Keyboard: Alt + arrows on a focused grip (a folder chip, a game's ⠿).
  list.addEventListener('keydown', e => {
    const grip = e.target.closest('[data-grip]'); if (!grip || !e.altKey) return;
    const li = grip.closest('[data-id]'); if (!li || li.parentElement !== list) return;
    const rtl = getComputedStyle(list).direction === 'rtl';
    const back = e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const fwd = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    if (!back && !fwd) return;
    e.preventDefault();
    const items = itemsOf(list), i = items.indexOf(li), j = i + (back ? -1 : 1);
    if (j < 0 || j >= items.length) return;
    if (back) list.insertBefore(li, items[j]); else items[j].after(li);
    grip.focus();
    saveOrder(list);
    say(movedMsg(list, li, j + 1, items.length));
  });
}

export function wireAll(root = document) { for (const list of $$('[data-reorder]', root)) wire(list); }
