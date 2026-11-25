// The Classroom tab's overview (Homeroom, step 2c; server: routes/homeroom-overview.js): a column's grade chip opens a
// small menu to change how that handout is graded (Score, Completion, Not graded), for the class's teachers
// (POST /api/homeroom/<class>/handouts/<id>/grade). The page then reloads, so every figure follows the new grading.
import { t, api, toast, esc, pageData } from '/js/app.js';

const D = pageData('hv-data');
const tv = (k, v) => t(`js.homeroom-overview.${k}`, v);
const MODES = ['score', 'completion', 'none'];
let open = null;

function close() { if (open) { open.menu.remove(); open.btn.setAttribute('aria-expanded', 'false'); open = null; } }
function menuFor(b) {
  close();
  const cur = b.dataset.grade, menu = document.createElement('div');
  menu.className = 'hv-menu'; menu.setAttribute('role', 'menu');
  menu.innerHTML = `<p class="hv-menucap">${esc(tv('title'))}</p>${MODES.map(m => `<button type="button" role="menuitemradio" aria-checked="${m === cur}" class="hv-mi${m === cur ? ' on' : ''}" data-mode="${m}"><b>${esc(tv(`${m}.name`))}</b><span>${esc(tv(`${m}.hint`))}</span></button>`).join('')}`;
  // On the page itself (the table scrolls sideways, so a menu inside it would be cut off), under the chip, on screen.
  document.body.appendChild(menu);
  const r = b.getBoundingClientRect(), w = Math.min(260, window.innerWidth - 32);
  menu.style.width = `${w}px`;
  menu.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - w - 16))}px`;
  const below = r.bottom + 6, h = menu.offsetHeight;
  menu.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  b.setAttribute('aria-expanded', 'true');
  open = { menu, btn: b };
  menu.querySelector(".hv-mi.on, .hv-mi")?.focus({ preventScroll: true });
  menu.addEventListener('click', async e => {
    const it = e.target.closest('[data-mode]'); if (!it) return;
    if (it.dataset.mode === cur) { close(); b.focus(); return; }
    for (const x of menu.querySelectorAll('button')) x.disabled = true;
    try {
      const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/handouts/${encodeURIComponent(b.dataset.hvgrade)}/grade`, { method: 'POST', body: { grade: it.dataset.mode } });
      toast(r.toast); setTimeout(() => location.reload(), 400);
    } catch (err) { toast(err.message, { bad: true }); for (const x of menu.querySelectorAll('button')) x.disabled = false; }
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-hvgrade]');
  if (b) { e.preventDefault(); if (open && open.btn === b) close(); else menuFor(b); return; }
  if (open && !e.target.closest('.hv-menu')) close();
});
window.addEventListener('scroll', close, { passive: true });
window.addEventListener('resize', close);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && open) { const b = open.btn; close(); b.focus(); }
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const items = [...open.menu.querySelectorAll('.hv-mi')], i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); e.preventDefault();
  }
});
