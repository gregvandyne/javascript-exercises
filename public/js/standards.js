// The Standards pages (routes/standards.js): a picker <select data-autosubmit> shows its result as soon as it changes.
// The forms work without this script (their Show / Search buttons); with it, the Show buttons are not needed and hide.
// A pick made while the page was still loading (before this module ran, so before the listener) is not lost: a select
// that no longer shows what the server rendered submits its form as soon as the script starts.
const go = form => (form.requestSubmit ? form.requestSubmit() : form.submit());
const changed = s => { const d = [...s.options].find(o => o.defaultSelected) || s.options[0]; return !!d && s.value !== d.value; };
let early = null;
for (const s of document.querySelectorAll('form[method="get"] select[data-autosubmit]')) {
  const form = s.form;
  for (const b of form.querySelectorAll('[data-nojs]')) b.hidden = true;
  s.addEventListener('change', () => go(form));
  if (!early && changed(s)) early = form;
}
// The lesson picker's "Add to" (#sf-t): each result's "+ Add" form tags what it shows now. The page also reloads with
// ?to= (data-autosubmit above), but an Add pressed before that finishes still goes to the chosen step.
const addTo = document.querySelector('select[data-addto]');
if (addTo) {
  const sync = () => { for (const i of document.querySelectorAll('.std-results form input[name="stepId"]')) i.value = addTo.value; };
  sync();
  addTo.addEventListener('change', sync);
}
if (early) go(early);
