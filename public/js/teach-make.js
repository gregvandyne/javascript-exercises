// /teach/make (views/live.js makeBody): "Turn your lesson into a game". Step 1 sends the pasted lesson (or a PDF /
// text file) to /api/teach/make/draft; step 2 is the question-set editor (live-sets.js, on the same page), where the
// teacher checks and edits every question and saves; step 3 offers to host the set live or assign it to a class.
// The lesson is never kept: not on the server and not in this browser.
import { api, toast, t } from '/js/app.js';

const $ = id => document.getElementById(id);
const form = $('mk-form');
if (form) {
  const text = $('mk-text'), file = $('mk-file'), note = $('mk-file-note'), err = $('mk-err'), go = $('mk-go'), wait = $('mk-wait');
  const MIN = +form.dataset.min, MAX = +form.dataset.max, PDF = +form.dataset.pdf;
  const steps = [...$('mk-steps').children], panels = [$('mk-1'), $('mk-2'), $('mk-3')];
  let pdf = null, setId = null;
  const show = n => {
    panels.forEach((p, i) => { p.hidden = i !== n; });
    steps.forEach((li, i) => { if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); li.classList.toggle('done', i < n); });
    const h = panels[n].querySelector('h2[tabindex]'); if (h) h.focus();
    panels[n].scrollIntoView({ block: 'start' });
  };
  const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  file.addEventListener('change', async () => {
    err.textContent = ''; note.textContent = ''; pdf = null;
    const f = file.files[0]; if (!f) return;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (isPdf) {
      if (f.size > PDF) { err.textContent = t('js.teach-make.pdfBig'); file.value = ''; return; }
      pdf = b64(await f.arrayBuffer()); note.textContent = t('js.teach-make.pdfReady', { name: f.name });
    } else if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
      text.value = (await f.text()).slice(0, MAX); file.value = ''; note.textContent = t('js.teach-make.textLoaded', { name: f.name });
    } else { err.textContent = t('js.teach-make.fileKind'); file.value = ''; }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const lesson = text.value.trim();
    if (!pdf && lesson.length < MIN) { err.textContent = t('js.teach-make.tooShort', { n: MIN }); text.focus(); return; }
    go.disabled = true; wait.hidden = false;
    try {
      const level = $('mk-level').value.trim();
      const r = await api('/api/teach/make/draft', { method: 'POST', body: { text: lesson, ...(pdf ? { pdf } : {}), level, count: +$('mk-count').value } });
      show(1);
      document.dispatchEvent(new CustomEvent('lv-set-draft', { detail: { title: r.title, grade: level.slice(0, 20), items: r.items } }));
      toast(t('js.teach-make.drafted', { n: r.items.length }));
    } catch (er) { err.textContent = er.message; }
    go.disabled = false; wait.hidden = true;
  });
  $('mk-back').addEventListener('click', () => { if (confirm(t('js.teach-make.backConfirm'))) show(0); });
  document.addEventListener('lv-set-saved', e => {
    setId = e.detail.id;
    $('mk-host').href = `/live?set=${encodeURIComponent(setId)}`;
    show(2);
  });
  const assign = $('mk-assign');
  if (assign) assign.addEventListener('submit', async e => {
    e.preventDefault(); const er = $('mk-assign-err'); er.textContent = '';
    const btn = assign.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('/api/teach/make/assign', { method: 'POST', body: { setId, classId: $('mk-class').value, dueAt: $('mk-due').value || null } });
      toast(t('js.teach-make.assigned')); location.href = r.redirect;
    } catch (x) { er.textContent = x.message; btn.disabled = false; }
  });
}
