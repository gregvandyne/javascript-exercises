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
  if (d === el) { d.open = true; return; }   // a "Jump to" chip to a folded section opens it
  if (!d) return;
  e.preventDefault(); d.open = true; el.focus();
});

// ---- Tidy-up: "Find a name" over long lists (components.js nameFilter) ----
// Rows are table rows or the labels of a tick list; a row matches when its text has every typed word (accents and case
// ignored). The optional chip shows only the rows marked data-<only> (e.g. students not in a class). Hidden rows stay
// in the page (and in forms), they are only out of sight.
const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
document.querySelectorAll('[data-filter]').forEach(box => {
  const list = document.getElementById(box.dataset.filter); if (!list) return;
  const rows = [...list.querySelectorAll('tbody > tr, fieldset > label, li')];
  const input = box.querySelector('input'), chip = box.querySelector('[data-only]'), none = box.querySelector('[data-filter-none]');
  const run = () => {
    const words = fold(input.value).split(/\s+/).filter(Boolean), only = chip && chip.getAttribute('aria-pressed') === 'true' ? chip.dataset.only : '';
    let shown = 0;
    for (const r of rows) {
      const ok = words.every(w => fold(r.textContent).includes(w)) && (!only || r.dataset[only] !== undefined);
      r.hidden = !ok; if (ok) shown++;
    }
    none.hidden = shown > 0;
  };
  input.addEventListener('input', run);
  if (chip) chip.addEventListener('click', () => { chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')); run(); });
  box.hidden = false;
});

// A text cut short with an ellipsis shows all of it on tap (or Enter / Space): a standard's statement on the Standards tab
// on phones (two lines), and a step title over one lesson's progress (three lines; touch screens have no hover title).
const expandable = [...document.querySelectorAll('.gradebook.steps .gb-step')];
if (matchMedia('(max-width: 700px)').matches) expandable.push(...document.querySelectorAll('.csq-std .csq-std-id .small'));
expandable.forEach(d => {
  if (d.scrollHeight <= d.clientHeight + 1) return;
  d.classList.add('more'); d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-expanded', 'false');
  const flip = () => d.setAttribute('aria-expanded', String(d.classList.toggle('open')));
  d.addEventListener('click', flip);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
});

// One lesson's progress: "Needs attention first" puts students with answers to read, then late, then half-done on top;
// pressed again, the roster order comes back. Nothing is hidden.
document.querySelectorAll('[data-sort]').forEach(btn => {
  const body = document.querySelector(`#${btn.dataset.sort} tbody`); if (!body) return;
  const rows = [...body.rows];
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    const order = on ? rows.map((r, i) => [r, i]).sort((a, b) => (+b[0].dataset.attn - +a[0].dataset.attn) || a[1] - b[1]).map(x => x[0]) : rows;
    order.forEach(r => body.appendChild(r));
  });
  btn.closest('[hidden]')?.removeAttribute('hidden');
});

// A link to a folded section from another page (People's #add-staff from a class's Settings) opens it on arrival.
{ const el = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (el && el.tagName === 'DETAILS' && !el.open) { el.open = true; el.scrollIntoView(); } }

// School settings on phones: the Save bar sticks to the bottom of the screen only once the page has been scrolled, so it
// never sits over the first fields when the page opens.
document.querySelectorAll('.settingsform').forEach(form => {
  const on = () => { if (scrollY > 0) { form.classList.add('scrolled'); removeEventListener('scroll', on); } };
  addEventListener('scroll', on, { passive: true }); on();
});

// A fold that is open on wider screens (data-open-wide): the class's "📌 Assign a lesson" form and the gradebook's
// "How to read it" stay folded on phones, where space is short, and start open on a desk-sized screen, as before.
if (matchMedia('(min-width: 901px)').matches) document.querySelectorAll('details[data-open-wide]').forEach(d => { d.open = true; });

// ---- School › Settings: say when something is changed but not saved, and ask before leaving it unsaved (another tab,
// a link, closing the page); the chat hint follows the choice; with no time zone yet, offer this computer's.
const setForm = document.getElementById('school-settings');
if (setForm) {
  const start = new FormData(setForm), note = document.getElementById('set-unsaved');
  const changed = () => [...new FormData(setForm).entries()].some(([k, v]) => start.get(k) !== v);
  let dirty = false, saving = false;
  const sync = () => { dirty = changed(); if (note) note.hidden = !dirty; setForm.classList.toggle('is-dirty', dirty); };
  setForm.addEventListener('input', sync); setForm.addEventListener('change', sync);
  setForm.addEventListener('submit', () => { saving = true; });
  window.addEventListener('beforeunload', e => { if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]'); if (!a || !dirty || saving || a.target === '_blank' || a.getAttribute('href').startsWith('#')) return;
    if (!confirm(setForm.dataset.unsaved)) { e.preventDefault(); return; }
    saving = true;   // they chose to leave: no second question from the browser
  }, true);
  const chat = document.getElementById('set-chat'), chatHint = document.getElementById('set-chat-hint');
  if (chat && chatHint) chat.addEventListener('change', () => { chatHint.textContent = chat.value === 'off' ? chat.dataset.hintOff : chat.dataset.hintClassmates; });
  const tzBtn = document.getElementById('tz-suggest'), tzSel = document.getElementById('set-timeZone');
  let mine = ''; try { mine = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  if (tzBtn && tzSel && mine && [...tzSel.options].some(o => o.value === mine)) {
    tzBtn.textContent = tzBtn.dataset.tpl.replace('{zone}', mine.replace(/_/g, ' ')); tzBtn.hidden = false;
    tzBtn.addEventListener('click', () => { tzSel.value = mine; tzSel.dispatchEvent(new Event('change', { bubbles: true })); tzBtn.hidden = true; });
  }
}

// "Select all shown": ticks every checkbox in a pick list that the filter leaves in view (or unticks them, if all are).
document.addEventListener('click', e => {
  const b = e.target.closest('[data-select-all]'); if (!b) return;
  const list = document.getElementById(b.dataset.selectAll); if (!list) return;
  const boxes = [...list.querySelectorAll('label:not([hidden]) input[type=checkbox]')];
  const all = boxes.length && boxes.every(x => x.checked);
  for (const x of boxes) x.checked = !all;
});

// School › Billing: the total for the number of students typed ("25 students × $20.00 = $500.00 a year").
document.querySelectorAll('input[data-total-tpl]').forEach(inp => {
  const out = document.getElementById(`${inp.id}-total`); if (!out) return;
  const money = new Intl.NumberFormat(inp.dataset.lang || undefined, { style: 'currency', currency: 'USD' });
  const num = new Intl.NumberFormat(inp.dataset.lang || undefined);
  const show = () => {
    const n = Math.floor(+inp.value || 0), unit = +inp.dataset.unit || 0;
    out.hidden = !(n > 0);
    if (n > 0) out.textContent = inp.dataset.totalTpl.replace('{seats}', num.format(n)).replace('{price}', money.format(unit / 100)).replace('{total}', money.format((unit * n) / 100));
  };
  inp.addEventListener('input', show);
});
