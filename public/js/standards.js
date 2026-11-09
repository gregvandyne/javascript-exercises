// The Standards pages (routes/standards.js): a picker <select data-autosubmit> shows its result as soon as it changes.
// The forms work without this script (their Show / Search buttons); with it, the Show buttons are not needed and hide.
for (const s of document.querySelectorAll('form[method="get"] select[data-autosubmit]')) {
  const form = s.form;
  for (const b of form.querySelectorAll('[data-nojs]')) b.hidden = true;
  s.addEventListener('change', () => (form.requestSubmit ? form.requestSubmit() : form.submit()));
}
// The lesson picker's "Add to" (#sf-t): each result's "+ Add" form tags what it shows now. The page also reloads with
// ?to= (data-autosubmit above), but an Add pressed before that finishes still goes to the chosen step.
const addTo = document.querySelector('select[data-addto]');
if (addTo) {
  const sync = () => { for (const i of document.querySelectorAll('.std-results form input[name="stepId"]')) i.value = addTo.value; };
  sync();
  addTo.addEventListener('change', sync);
}
