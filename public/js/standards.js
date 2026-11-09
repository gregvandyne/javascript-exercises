// The Standards pages (routes/standards.js): a picker <select data-autosubmit> shows its result as soon as it changes.
// The forms work without this script (their Show / Search buttons); with it, the Show buttons are not needed and hide.
for (const s of document.querySelectorAll('form[method="get"] select[data-autosubmit]')) {
  const form = s.form;
  for (const b of form.querySelectorAll('[data-nojs]')) b.hidden = true;
  s.addEventListener('change', () => (form.requestSubmit ? form.requestSubmit() : form.submit()));
}
