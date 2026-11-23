// /compare (server/routes/compare.js): each row of the table opens and closes its detail row (the row right under it).
// The need's label is a button (aria-expanded, aria-controls), so a tap, a click, Enter or Space toggles it. Rows start
// closed; any number may be open at once.

document.addEventListener('click', e => {
  const btn = e.target.closest('.cmp-tog');
  if (!btn) return;
  const det = document.getElementById(btn.getAttribute('aria-controls'));
  if (!det) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  det.hidden = !open;
  const row = btn.closest('tr');
  if (row) row.classList.toggle('cmp-open', open);
});
