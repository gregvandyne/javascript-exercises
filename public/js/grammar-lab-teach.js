// Grammar Lab's teacher page (/teach/grammar-lab; server: routes/grammar-lab-teach.js): each Assign button opens the one
// Assign dialog with what it gives (a unit, a topic or a proofread room). The dialog's "Who" lists the chosen class's
// whole class, groups and students only. The form itself is a data-api form (public/js/app.js): it posts, shows the
// toast and reloads.
const dlg = document.getElementById('glt-dialog');
if (dlg) {
  const f = dlg.querySelector('form'), cls = f.querySelector('#glt-class'), who = f.querySelector('#glt-who');
  const data = JSON.parse((document.getElementById('glt-data') || {}).textContent || '{}');
  let opener = null, keyed = false;
  // After a tap or a click the dialog itself takes the focus (no ring on a touch screen); the keyboard gets the field.
  document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyed = true; }, true);
  document.addEventListener('pointerdown', () => { keyed = false; }, true);
  /** Only the chosen class's choices in Who, its Whole class picked. */
  const syncWho = () => {
    for (const el of who.querySelectorAll('[data-class]')) { const on = el.dataset.class === cls.value; el.hidden = !on; el.disabled = !on; }
    const first = who.querySelector(`option[value="all"][data-class="${CSS.escape(cls.value)}"]`);
    if (first) first.selected = true;
  };
  cls.addEventListener('change', syncWho);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-glassign]');
    if (!b) return;
    opener = b;
    for (const k of ['what', 'unit', 'band', 'topic']) f.elements[k].value = b.dataset[k] || '';
    // the heading is in the page's language; the unit or topic name in it is course text, English (lang="en"; a room's
    // title is already "Proofread: <topic>" in the teacher's language)
    const h = dlg.querySelector('#glt-dialog-h'), [pre, post = ''] = String(data.titleOf || '{title}').split('{title}');
    const name = document.createElement('span'); if (b.dataset.what !== 'room') name.lang = 'en'; name.dir = 'ltr'; name.textContent = b.dataset.title || '';
    h.textContent = ''; h.append(pre, name, post);
    const what = dlg.querySelector('#glt-what'); what.textContent = what.dataset[b.dataset.what] || '';
    const err = f.querySelector('.form-err'); if (err) err.textContent = '';
    syncWho();
    dlg.showModal();
    if (keyed) cls.focus(); else { dlg.setAttribute('tabindex', '-1'); dlg.focus({ preventScroll: true }); }
  });
  f.querySelector('#glt-cancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { if (opener) opener.focus(); });
}
