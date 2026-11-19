// Drag to reorder (docs/decisions.md "Folders: drag to reorder, save in a pop-up" and "Folders: one drag for games"): a
// list with data-reorder="<url>" and items with data-id. The new order is posted as { ids } to the list's URL.
// - Games in a folder (.shelf-game) are dragged by folder-drop.js, the one drag for games on the shelf: the same lifted
//   row and small picture whether a folder has one game or many. It uses placeAt, putBack and saveOrder from here.
// - Other items (the sidebar's folder chips) are dragged here: a mouse drags at once (after a few pixels); a finger or
//   pen holds still for a moment first, so a swipe still scrolls the page. Escape puts it back.
// - Keyboard, for both: on an item's grip ([data-grip]), Alt and an arrow key move it one place.
// Saves go one at a time. If one fails, the list goes back to the order the server last saved (no reload).
// Loaded by app.js and shelf.js on pages that have such a list.
import { $$, api, toast } from '/js/app.js';

const HOLD_MS = 350, SLOP = 8, MOUSE_SLOP = 5;
let live = null;
export const say = msg => {
  if (!live) { live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
  live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30);
};
export const itemsOf = list => [...list.children].filter(li => li.dataset.id);
const idsOf = list => itemsOf(list).map(li => li.dataset.id);
const nameOf = li => (li.querySelector('h3, b') || li).textContent.trim();
/** "{name}: {n} of {total}" in the page's language, from the list's data-moved (the server fills in the words). */
export const movedMsg = (list, li, n, total) => (list.dataset.moved || '{name}: {n} / {total}').replace('{name}', nameOf(li)).replace('{n}', n).replace('{total}', total);

/** Put the items back in this order (ids first to last). */
function arrange(list, ids) {
  const by = new Map(itemsOf(list).map(li => [li.dataset.id, li])), anchor = itemsOf(list).at(-1)?.nextSibling || null;
  for (const id of ids) { const li = by.get(id); if (li) list.insertBefore(li, anchor); }
}

/** Save the list's order as it is now. Saves wait for the one before (so they land in order); a failed one puts the
 *  list back in the order the server has (the last one it saved, or the page's own), so nothing seems to vanish or
 *  move that did not. -> a promise that settles once it has been saved or put back. */
export function saveOrder(list) {
  if (!list._saved) list._saved = idsOf(list);
  list._chain = (list._chain || Promise.resolve()).then(async () => {
    const ids = idsOf(list);
    if (ids.join() === list._saved.join()) return;
    try { await api(list.dataset.reorder, { method: 'POST', body: { ids } }); list._saved = ids; }
    catch (err) { arrange(list, list._saved); toast(err.message, { bad: true }); }
  });
  return list._chain;
}

/** Move li to where the pointer is: before the item whose middle it has not reached (reading order, so wrapped rows and
 *  right-to-left pages work), else at the end. */
export function placeAt(list, li, x, y) {
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
}
/** Back to place `from` (its index when the drag began). */
export function putBack(list, li, from) {
  const items = itemsOf(list).filter(o => o !== li), at = items[from];
  if (at) list.insertBefore(li, at); else if (items.length && items.at(-1).nextElementSibling !== li) items.at(-1).after(li);
}

// ---- The pointer drag for items that are not games (folder chips): one at a time, for every list on the page. ----
let drag = null, holdTimer = 0;
const startDrag = () => {
  const { li, list, x, y } = drag;
  const r = li.getBoundingClientRect();
  drag.on = true; drag.dx = x - r.left; drag.dy = y - r.top;
  li.classList.add('is-dragging'); list.classList.add('is-sorting'); document.body.classList.add('is-sorting');
  if (navigator.vibrate && drag.touch) try { navigator.vibrate(12); } catch { /* not allowed */ }
};
const follow = (x, y) => {
  const { li, list } = drag;
  li.style.transform = '';
  placeAt(list, li, x, y);
  const r = li.getBoundingClientRect();
  li.style.transform = `translate(${x - drag.dx - r.left}px, ${y - drag.dy - r.top}px)`;
};
const end = commit => {
  clearTimeout(holdTimer);
  if (!drag) return;
  const { li, list, on, from } = drag;
  drag = null;
  if (!on) return;
  li.classList.remove('is-dragging'); li.style.transform = ''; list.classList.remove('is-sorting'); document.body.classList.remove('is-sorting');
  list._eatClick = true; setTimeout(() => { list._eatClick = false; }, 50);
  if (!commit || !list.isConnected) { putBack(list, li, from); return; }
  const to = itemsOf(list).indexOf(li);
  if (to !== from) { saveOrder(list); say(movedMsg(list, li, to + 1, itemsOf(list).length)); }
};
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.on) {
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (drag.touch) { if (moved > SLOP) end(false); return; }   // a finger moving before the hold: a scroll
    if (moved < MOUSE_SLOP) return;
    startDrag();
  }
  e.preventDefault();
  follow(e.clientX, e.clientY);
});
addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) end(true); });
addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) end(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { if (drag.on) e.preventDefault(); end(false); } });
// While a finger drags, the page must not scroll (a passive listener could not stop it).
addEventListener('touchmove', e => { if (drag && drag.on) e.preventDefault(); }, { passive: false });

function wire(list) {
  if (list.dataset.reorderOn) return;
  list.dataset.reorderOn = '1';
  list.classList.add('is-reorderable');
  list._saved = idsOf(list);

  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('[data-id]');
    if (drag || !li || li.parentElement !== list || e.button > 0) return;
    if (li.classList.contains('shelf-game')) return;   // a game: folder-drop.js drags it
    // Buttons, fields and forms in an item keep their own taps; the grip and the item itself start a drag.
    if (e.target.closest('input, select, textarea, form, .mg-actions, details') && !e.target.closest('[data-grip]')) return;
    const touch = e.pointerType !== 'mouse';
    drag = { li, list, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, touch, from: itemsOf(list).indexOf(li), id: e.pointerId };
    if (touch) holdTimer = setTimeout(() => { if (drag && !drag.on) { startDrag(); follow(drag.x, drag.y); } }, HOLD_MS);
  });
  // The long press that starts a drag would also open the browser's menu for a link or picture.
  list.addEventListener('contextmenu', e => { if (drag && drag.list === list) e.preventDefault(); });
  // A drag that ends over a link (a folder chip) must not also open it.
  list.addEventListener('click', e => { if (list._eatClick) { e.preventDefault(); e.stopPropagation(); } }, true);
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
