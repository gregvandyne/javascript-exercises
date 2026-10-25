// Login cards page: the print button.
document.addEventListener('click', e => { if (e.target.closest('[data-print]')) window.print(); });

// ---- School pages (batch 2)
// Add staff: the "Oomba Academy name" field only shows for an existing account, and the button says what will happen.
function staffChoice(f) {
  const v = (f.querySelector('input[name=account]:checked') || {}).value || 'new';
  f.querySelectorAll('[data-account]').forEach(el => { el.hidden = el.dataset.account !== v; });
  const btn = f.querySelector('button[type=submit][data-new]'); if (btn) btn.textContent = v === 'existing' ? btn.dataset.existing : btn.dataset.new;
}
document.querySelectorAll('form.staffform').forEach(staffChoice);
// (Approving a join request with a school account picked asks first: app.js reads the option's data-confirm on submit.)
document.addEventListener('change', e => {
  const f = e.target.closest('form.staffform'); if (f && e.target.name === 'account') staffChoice(f);
});

// ---- Lessons (batch 2) ----
// Lesson editor: a step form shows the fields for its type. data-kind on the form drives the CSS (the Game field only
// for "Play a game"); the text box's label and hint follow the type ([data-for-kind]).
function syncStepKind(sel) {
  const form = sel.closest('.stepgrid'); if (!form) return;
  form.dataset.kind = sel.value;
  form.querySelectorAll('[data-for-kind]').forEach(el => { el.hidden = el.dataset.forKind !== sel.value; });
}
document.addEventListener('change', e => { if (e.target.matches('.stepgrid select[name="kind"]')) syncStepKind(e.target); });
document.querySelectorAll('.stepgrid select[name="kind"]').forEach(syncStepKind);
// A link to a field inside a closed <details> (e.g. "Make a new game for students to play"): open it and focus the field.
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); const id = a && a.getAttribute('href').slice(1); if (!id) return;
  const el = document.getElementById(id); const d = el && el.closest('details');
  if (!d || el === d) return;
  e.preventDefault(); d.open = true; el.focus();
});
