// The sign-up's screens (server/routes/onboarding.js): more class rows on the teacher's class step, and the kid's
// "Get my family code" (the same API as Me › For grown-ups; only an HMAC of the code is kept, so it is shown once).
import { api, toast, $$ } from '/js/app.js';

// ---- "Add another class": a copy of the row template with fresh ids; each extra row can be removed again.
const list = document.querySelector('[data-ob-classes]');
const tpl = document.querySelector('template[data-ob-class-template]');
const add = document.querySelector('[data-ob-add]');
function renumber() {
  const rows = $$('[data-ob-class]', list);
  rows.forEach((row, i) => {
    for (const el of $$('[id]', row)) el.id = el.id.replace(/-\d+(-err)?$/, (m, err) => `-${i}${err || ''}`);
    for (const el of $$('label[for]', row)) el.htmlFor = el.htmlFor.replace(/-\d+$/, `-${i}`);
    const lg = row.querySelector('legend'); if (lg) lg.textContent = lg.textContent.replace(/\d+/, String(i + 1));
    const rm = row.querySelector('[data-ob-remove]'); if (rm) rm.hidden = rows.length < 2;
  });
  if (add) add.hidden = rows.length >= (+add.dataset.max || 10);
}
if (list && tpl && add) {
  add.addEventListener('click', () => {
    list.appendChild(tpl.content.cloneNode(true));
    renumber();
    const rows = $$('[data-ob-class]', list); const input = rows[rows.length - 1].querySelector('input');
    if (input) input.focus();
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-ob-remove]'); if (!b) return;
    b.closest('[data-ob-class]').remove(); renumber();
    const first = list.querySelector('input'); if (first) first.focus();
  });
  renumber();
}

// ---- A field's message goes once it is changed (the form shows them again on the next try if still wrong).
document.addEventListener('input', e => {
  const el = e.target.closest('.ob [aria-invalid]'); if (!el) return;
  el.removeAttribute('aria-invalid');
  const er = el.id && document.getElementById(`${el.id}-err`); if (er) er.textContent = '';
});

// ---- The kid's family code.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-family-code]'); if (!b) return;
  b.disabled = true;
  try {
    const r = await api('/api/me/family/code', { method: 'POST', body: {} });
    const box = document.getElementById('famcode'), val = document.getElementById('famcode-value');
    if (box && val) { val.textContent = r.code; box.hidden = false; }
    b.remove();
  } catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});
