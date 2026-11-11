// /admin/schools/setup (routes/schools.js): shows the fields for the chosen kind of admin account, and points
// "Preview the email" at the chosen language. The form works without it (every field is sent; the server uses the
// ones the choice needs).
const f = document.getElementById('setup-form');
if (f) {
  const sync = () => {
    const v = (f.querySelector('input[name=account]:checked') || {}).value;
    for (const el of f.querySelectorAll('[data-when]')) el.hidden = !el.dataset.when.split(' ').includes(v);
  };
  f.addEventListener('change', sync); sync();
  const lang = document.getElementById('su-lang'), pv = document.getElementById('su-preview');
  if (lang && pv) lang.addEventListener('change', () => { pv.href = `/admin/schools/setup/preview?in=${encodeURIComponent(lang.value)}`; });
}
