// Figures: the ⋯ More menus (the editor's presets, each question's row in the worksheet, test and lesson builder). The
// same pattern as the My worksheets More menus (canvas/src/sets.js, the manipulatives' boards): a button with
// aria-haspopup="menu" opens a role="menu" list of role="menuitem" buttons and focuses the first; the arrow keys, Home
// and End move between them; Escape, Tab or a click outside closes it; a pick or Escape gives focus back to the button.
// Bound once on the document, so a list drawn again keeps working.
//   moreMenu({ label, items, cls, icon, text, btnId })  → the markup (items: HTML of menuitems, groups and separators)
//   menuItem(act, label, { danger, attrs })  → one item;  menuGroup(label, items)  → a labeled group
//   bindMenus(root, onPick)  → onPick(item, button) when an item is chosen
import { esc } from '/js/app.js';

let n = 0;
export const menuItem = (act, label, { danger = false, attrs = '', icon = '' } = {}) =>
  `<button type="button" role="menuitem" tabindex="-1" class="fg-mi${danger ? ' bad' : ''}" data-mi="${esc(act)}"${attrs}>${icon ? `<span class="fg-mi-ico" aria-hidden="true">${icon}</span>` : ''}<span>${esc(label)}</span></button>`;
export const menuGroup = (label, items) => {
  const id = `fg-mg-${++n}`;
  return items ? `<div role="group" aria-labelledby="${id}" class="fg-mg"><div class="fg-mg-h" id="${id}" role="presentation">${esc(label)}</div>${items}</div>` : '';
};
export const menuSep = () => '<div role="separator" class="fg-msep"></div>';
export function moreMenu({ label, items, cls = '', icon = '⋯', text = '', btnId = '' }) {
  const id = `fg-mm-${++n}`;
  return `<span class="fg-mm ${cls}"><button type="button"${btnId ? ` id="${esc(btnId)}"` : ''} class="btn fg-icon fg-mm-btn${text ? ' fg-mm-text' : ''}" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}" ${text ? '' : `aria-label="${esc(label)}" `}title="${esc(label)}">${text ? `<span aria-hidden="true">${icon}</span> ${esc(text)}` : `<span aria-hidden="true">${icon}</span>`}</button><div class="fg-mm-list" role="menu" id="${id}" aria-label="${esc(label)}" hidden>${items}</div></span>`;
}
const itemsOf = list => [...list.querySelectorAll('[role="menuitem"]')].filter(x => !x.disabled && !x.closest('[hidden]:not(.fg-mm-list)'));
function close(list, focus = false) {
  if (!list || list.hidden) return;
  list.hidden = true;
  const b = list.parentElement.querySelector('.fg-mm-btn');
  if (b) { b.setAttribute('aria-expanded', 'false'); if (focus) b.focus(); }
}
const closeAll = except => { for (const l of document.querySelectorAll('.fg-mm-list:not([hidden])')) if (l !== except) close(l); };
function open(btn, at = 'first') {
  const list = btn.parentElement.querySelector('.fg-mm-list');
  closeAll(list);
  list.hidden = false; btn.setAttribute('aria-expanded', 'true');
  // A menu near the bottom of the window opens upward, so it is never cut off.
  list.classList.remove('up');
  const r = list.getBoundingClientRect();
  if (r.bottom > window.innerHeight - 8 && btn.getBoundingClientRect().top > r.height + 16) list.classList.add('up');
  const its = itemsOf(list);
  (at === 'last' ? its[its.length - 1] : its[0])?.focus();
}
export function bindMenus(root, onPick) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('.fg-mm-btn');
    if (btn && root.contains(btn)) { e.preventDefault(); e.stopPropagation(); const list = btn.parentElement.querySelector('.fg-mm-list'); if (list.hidden) open(btn); else close(list); return; }
    const it = e.target.closest('.fg-mm-list [role="menuitem"]');
    if (it && root.contains(it)) {
      e.preventDefault(); e.stopPropagation();
      if (it.disabled) return;
      const list = it.closest('.fg-mm-list'), b = list.parentElement.querySelector('.fg-mm-btn');
      close(list, true);
      onPick(it, b);
    }
  });
  root.addEventListener('keydown', e => {
    const btn = e.target.closest('.fg-mm-btn');
    if (btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(btn, e.key === 'ArrowUp' ? 'last' : 'first'); return; }
    const list = e.target.closest('.fg-mm-list'); if (!list) return;
    const its = itemsOf(list), k = its.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(list, true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); its[(k + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length]?.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); its[e.key === 'Home' ? 0 : its.length - 1]?.focus(); }
    else if (e.key === 'Tab') close(list);
  });
  if (!bindMenus.outside) {
    bindMenus.outside = true;
    document.addEventListener('click', e => { if (!e.target.closest('.fg-mm')) closeAll(); });
    document.addEventListener('focusin', e => { if (!e.target.closest('.fg-mm')) closeAll(); });
  }
}
