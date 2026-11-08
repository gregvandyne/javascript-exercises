// Admin pages (server/views/admin-ui.js): long notes and extra filters fold away on phones but start open on wide screens.
if (matchMedia('(min-width: 901px)').matches) document.querySelectorAll('details[data-open-wide]').forEach(d => { d.open = true; });
// The section menu on phones: once opened, scroll so its links show above the bottom bar (the summary stays in view).
const navT = document.getElementById('adminnav-t');
if (navT) navT.addEventListener('change', () => {
  const g = document.getElementById('adminnav-groups'), sum = navT.nextElementSibling;
  if (!navT.checked || !g || !sum) return;
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 64;
  const bar = document.querySelector('.tabbar'), barH = bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().height : 0;
  const over = g.getBoundingClientRect().bottom - (innerHeight - barH - 12);
  const room = sum.getBoundingClientRect().top - top - 8;
  const by = Math.min(over, room);
  if (by > 0) scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
// Audit log on phones: long details are cut to two lines; tap (or Enter / Space) shows all of it.
if (matchMedia('(max-width: 700px)').matches) document.querySelectorAll('.adet-t').forEach(d => {
  if (d.scrollHeight <= d.clientHeight + 1) return;
  d.classList.add('more'); d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-expanded', 'false');
  const flip = () => d.setAttribute('aria-expanded', String(d.classList.toggle('open')));
  d.addEventListener('click', flip);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
});
