// Drag a game onto one of my folders in the left column to save it there (docs/decisions.md "Drag a game onto a
// folder"). The folders that take a game carry data-drop-folder="<id>" (server/routes/game-shelf.js, one's own folders
// only). Two ways a drag starts: in a folder whose games can be put in order, reorder.js already drags the card and asks
// here whether it is over a folder; everywhere else on the shelf (All my games, Find Oomba games, a shared folder) a
// small picture of the game follows the pointer. A mouse drags at once (after a few pixels); a finger or pen holds still
// first, so a swipe still scrolls. Dropping saves it the way ⋯ › Save to folder does (POST /api/game-folders/:id/games),
// which stays the way to do it from a keyboard. A game already in that folder is not added twice. A game dragged out
// of one of my folders onto another asks first, in a small pop-up beside the folder: Move here (it leaves the folder it
// came from) or Keep in both.
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

/** Add to (+1) or take from (-1) a folder's count in the left column (it can be there twice: the class page's chips). */
function bump(id, by) {
  for (const a of $$(`[data-drop-folder="${CSS.escape(id)}"]`)) {
    const n = a.querySelector('.n'), sr = a.querySelector('.n + .sr-only');
    if (n && /^\d+$/.test(n.textContent.trim())) {
      const was = +n.textContent.trim(), now = Math.max(0, was + by); n.textContent = String(now);
      if (sr) sr.textContent = sr.textContent.replace(String(was), String(now));
    }
  }
}
const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(v), s || '');

/** Save the game in the folder; its count goes up when it was new there. -> the server's answer, or null. */
async function add(target, gameId, { quiet = false } = {}) {
  const id = target.dataset.dropFolder;
  try {
    const r = await api(`/api/game-folders/${encodeURIComponent(id)}/games`, { method: 'POST', body: { gameId } });
    if (r && !r.already) bump(id, 1);
    if (r && r.toast && !quiet) toast(r.toast);
    return r;
  } catch (err) { toast(err.message, { bad: true }); return null; }
}

// ---- Move here or Keep in both: a game dragged out of one of my folders onto another ----
let ask = null;
function closeAsk({ focus = true } = {}) {
  if (!ask) return;
  const { box, back } = ask; ask = null;
  box.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true);
  if (focus && back && back.isConnected) back.focus({ preventScroll: true });
}
function outside(e) { if (ask && !ask.box.contains(e.target)) closeAsk({ focus: false }); }
function onKey(e) {
  if (!ask) return;
  if (e.key === 'Escape') { e.preventDefault(); closeAsk(); return; }
  if (e.key === 'Tab') {   // keep Tab inside the pop-up
    const els = [...ask.box.querySelectorAll('button')], i = els.indexOf(document.activeElement);
    e.preventDefault(); els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length].focus();
  }
}
/** The pop-up beside the folder: Move here (takes it out of the folder it came from) / Keep in both / Cancel. */
function askMove(target, li) {
  closeAsk({ focus: false });
  const tpl = document.getElementById('drop-ask'); if (!tpl) { add(target, li.dataset.id); return; }
  const w = tpl.dataset, game = li.dataset.title || '', from = li.dataset.folderName || '';
  const folder = (target.querySelector('.shelf-name') || target).textContent.trim();
  const box = document.createElement('div');
  box.className = 'drop-ask'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'false');
  box.innerHTML = `<p class="drop-ask-h" id="drop-ask-h"></p>
    <button type="button" class="btn btn-primary drop-ask-move" data-act="move"><span class="drop-ask-l"></span><span class="drop-ask-n"></span></button>
    <button type="button" class="btn drop-ask-keep" data-act="keep"></button>
    <button type="button" class="btn btn-ghost btn-sm drop-ask-cancel" data-act="cancel"></button>`;
  box.setAttribute('aria-labelledby', 'drop-ask-h');
  box.querySelector('.drop-ask-h').textContent = fill(w.title, { game, folder });
  box.querySelector('.drop-ask-l').textContent = w.move;
  box.querySelector('.drop-ask-n').textContent = fill(w.moveNote, { from });
  box.querySelector('.drop-ask-keep').textContent = w.keep;
  box.querySelector('.drop-ask-cancel').textContent = w.cancel;
  document.body.appendChild(box);
  // Beside the folder (or under it, when the folders are a row of chips at the top of a phone), kept on screen.
  const r = target.getBoundingClientRect(), b = box.getBoundingClientRect(), pad = 12, rtl = getComputedStyle(target).direction === 'rtl';
  const side = rtl ? r.left - b.width - 10 : r.right + 10;
  let x, y;
  if (side >= pad && side + b.width <= innerWidth - pad) { x = side; y = r.top + r.height / 2 - 28; }
  else { x = r.left + r.width / 2 - b.width / 2; y = r.bottom + 8; }
  x = Math.max(pad, Math.min(innerWidth - b.width - pad, x)); y = Math.max(pad, Math.min(innerHeight - b.height - pad, y));
  box.style.left = `${x}px`; box.style.top = `${y}px`;
  ask = { box, back: li.querySelector('h3 a') };
  box.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    closeAsk({ focus: act === 'cancel' });
    if (act === 'keep') add(target, li.dataset.id);
    else if (act === 'move') move(target, li, { game, folder });
  });
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true); }, 0);
  box.querySelector('.drop-ask-move').focus({ preventScroll: true });
}
/** Save it in the new folder, then take it out of the one it came from; the right side then shows that folder again. */
async function move(target, li, { game, folder }) {
  const from = li.dataset.folder, gameId = li.dataset.id;
  const r = await add(target, gameId, { quiet: true }); if (!r) return;
  try {
    await api(`/api/game-folders/${encodeURIComponent(from)}/games/${encodeURIComponent(gameId)}/delete`, { method: 'POST' });
    bump(from, -1);
    li.classList.add('is-leaving');
    const tpl = document.getElementById('drop-ask');
    toast(fill(tpl ? tpl.dataset.moved : '', { game, folder }));
    setTimeout(() => document.dispatchEvent(new CustomEvent('shelf:refresh')), 250);
  } catch (err) { toast(err.message, { bad: true }); }
}

/** A game dropped on a folder: from another of my folders, ask Move here or Keep in both; otherwise just save it there.
 *  Dropped on the folder it is already in: nothing happens. */
export function dropOn(target, li) {
  target.classList.add('is-dropped'); setTimeout(() => target.classList.remove('is-dropped'), 700);
  const from = li.dataset.folder;
  if (from && from === target.dataset.dropFolder) return;
  if (from) askMove(target, li); else add(target, li.dataset.id);
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
    if (t) dropOn(t, d.li);
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
