// Drag a game onto one of my folders in the left column to save it there (docs/decisions.md "Drag a game onto a
// folder"). The folders that take a game carry data-drop-folder="<id>" (server/routes/game-shelf.js, one's own folders
// only). Two ways a drag starts: in a folder whose games can be put in order, reorder.js already drags the card and asks
// here whether it is over a folder; everywhere else on the shelf (All my games, Find Oomba games, a shared folder) a
// small picture of the game follows the pointer. A mouse drags at once (after a few pixels); a finger or pen holds still
// first, so a swipe still scrolls. Dropping saves it the way ⋯ › Save to folder does (POST /api/game-folders/:id/games),
// which stays the way to do it from a keyboard. A game already in that folder is not added twice.
import { $$, api, toast } from '/js/app.js';

const HOLD_MS = 350, SLOP = 8, MOUSE_SLOP = 5;
let over = null;

/** The folder under the pointer that takes a game, or null. */
export function targetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return (el && el.closest('[data-drop-folder]')) || null;
}
/** Light the folder under the pointer (and only it); returns it. */
export function hover(x, y) {
  const t = targetAt(x, y);
  if (t !== over) { if (over) over.classList.remove('is-drop'); over = t; if (t) t.classList.add('is-drop'); }
  return t;
}
export function clear() { if (over) over.classList.remove('is-drop'); over = null; }
export const hasTargets = (root = document) => !!root.querySelector('[data-drop-folder]');

/** Save the game in the folder; the folder's count goes up when it was new there. */
export async function dropOn(target, gameId) {
  const id = target.dataset.dropFolder;
  target.classList.add('is-dropped'); setTimeout(() => target.classList.remove('is-dropped'), 700);
  try {
    const r = await api(`/api/game-folders/${encodeURIComponent(id)}/games`, { method: 'POST', body: { gameId } });
    if (r && !r.already) {
      // The same folder can be in the column twice (the class page's chips and the side): count both.
      for (const a of $$(`[data-drop-folder="${CSS.escape(id)}"]`)) {
        const n = a.querySelector('.n'), sr = a.querySelector('.n + .sr-only');
        if (n && /^\d+$/.test(n.textContent.trim())) {
          const was = +n.textContent.trim(); n.textContent = String(was + 1);
          if (sr) sr.textContent = sr.textContent.replace(String(was), String(was + 1));
        }
      }
    }
    if (r && r.toast) toast(r.toast);
  } catch (err) { toast(err.message, { bad: true }); }
}

/** The games on the shelf's right side that are not in a list reorder.js drags. */
export function wire(main) {
  if (!main || main.dataset.dropOn) return;
  main.dataset.dropOn = '1';
  let drag = null, holdTimer = 0, eatClick = false;

  const rowOf = el => {
    const li = el instanceof Element && el.closest('.shelf-game[data-id]');
    return li && main.contains(li) && !li.parentElement.matches('[data-reorder]') ? li : null;
  };
  const ghostOf = li => {
    const g = document.createElement('div');
    g.className = 'drop-ghost'; g.setAttribute('aria-hidden', 'true');
    const cover = li.querySelector('.mg-cover'), title = li.querySelector('h3');
    if (cover) { const c = cover.cloneNode(true); c.removeAttribute('href'); c.className = 'drop-ghost-cover'; g.appendChild(c); }
    const b = document.createElement('b'); b.textContent = title ? title.textContent.trim() : ''; g.appendChild(b);
    document.body.appendChild(g);
    return g;
  };
  const place = (x, y) => { if (drag.ghost) drag.ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`; };
  const start = () => {
    drag.on = true;
    drag.li.classList.add('is-lifted'); document.body.classList.add('is-sorting');
    drag.ghost = ghostOf(drag.li); place(drag.x, drag.y); hover(drag.x, drag.y);
    if (navigator.vibrate && drag.touch) try { navigator.vibrate(12); } catch { /* not allowed */ }
  };
  const end = commit => {
    clearTimeout(holdTimer);
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    d.li.classList.remove('is-lifted'); document.body.classList.remove('is-sorting');
    if (d.ghost) d.ghost.remove();
    eatClick = true; setTimeout(() => { eatClick = false; }, 50);
    const t = commit ? targetAt(d.x, d.y) : null;
    clear();
    if (t) dropOn(t, d.li.dataset.id);
  };

  main.addEventListener('pointerdown', e => {
    if (drag || e.button > 0 || !hasTargets()) return;
    const li = rowOf(e.target); if (!li) return;
    // Buttons, menus and forms keep their own taps; the cover, the title and the card itself start a drag.
    if (e.target.closest('input, select, textarea, button, form, .mg-actions, details')) return;
    const touch = e.pointerType !== 'mouse';
    drag = { li, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, touch, id: e.pointerId, ghost: null };
    if (touch) holdTimer = setTimeout(() => { if (drag && !drag.on) start(); }, HOLD_MS);
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.on) {
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (drag.touch) { if (moved > SLOP) end(false); return; }
      if (moved < MOUSE_SLOP) return;
      start();
    }
    e.preventDefault();
    place(e.clientX, e.clientY); hover(e.clientX, e.clientY);
  });
  addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) end(true); });
  addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) end(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && drag) end(false); });
  addEventListener('touchmove', e => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  main.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });
  main.addEventListener('click', e => { if (eatClick) { e.preventDefault(); e.stopPropagation(); } }, true);
  // No native link or picture drag for the games (it would hide the pointer events).
  main.addEventListener('dragstart', e => { if (rowOf(e.target) && hasTargets()) e.preventDefault(); });
}
