// The Learn tab's filters (routes/teachers.js GET /learn): the grade picker shows its games as soon as it changes. The
// form works without this script (its Show button); with it, the button is not needed and hides.
const form = document.getElementById('filters');
if (form) {
  for (const b of form.querySelectorAll('[data-nojs]')) b.hidden = true;
  for (const s of form.querySelectorAll('select[data-autosubmit]')) s.addEventListener('change', () => form.requestSubmit ? form.requestSubmit() : form.submit());
}
// The chosen subject chip stays in sight on phones, where the subject chips scroll sideways (Music is the last one).
for (const on of document.querySelectorAll('.learn-filters .chips.scroll .chip.on')) {
  const row = on.parentElement;
  if (row.scrollWidth > row.clientWidth) row.scrollLeft += on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
}
