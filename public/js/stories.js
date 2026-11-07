// Story Builder pages (server/routes/stories.js): the idea form, the progress poll, and the share buttons.
import { t, api, $, toast, pageData, copyText } from './app.js';

const form = $('#sb-form');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#sb-err'), go = $('#sb-go'), idea = $('#sb-idea');
    err.textContent = '';
    idea.removeAttribute('aria-invalid');
    if (idea.value.trim().length < 3) { err.textContent = t('js.stories.needIdea'); idea.setAttribute('aria-invalid', 'true'); idea.focus(); return; }
    go.disabled = true;
    try {
      const r = await api('/api/stories', { method: 'POST', body: { idea: idea.value, ageBand: $('#sb-age').value, seconds: +$('#sb-len').value } });
      location.href = `/stories/${encodeURIComponent(r.id)}`;
    } catch (ex) {
      err.textContent = (ex && ex.message) || t('js.stories.failed');
      idea.setAttribute('aria-invalid', 'true');
      go.disabled = false;
    }
  });
}

const data = pageData();
// While it is being made: ask how it is going every few seconds; reload when it is done or failed.
if (data.id && data.status && !['done', 'failed'].includes(data.status)) {
  const fill = $('#sb-fill'), status = $('#sb-status'), bar = fill && fill.parentElement;
  const tick = async () => {
    try {
      const r = await api(`/api/stories/${encodeURIComponent(data.id)}`, { background: true });
      if (r.status === 'done' || r.status === 'failed') { location.reload(); return; }
      const pct = Math.round((r.progress || 0) * 100);
      if (fill) fill.style.width = `${pct}%`;
      if (bar) bar.setAttribute('aria-valuenow', String(pct));
      if (status && data.labels && data.labels[r.status]) status.textContent = data.labels[r.status];
    } catch { /* try again on the next tick */ }
    setTimeout(tick, document.hidden ? 15000 : 4000);
  };
  setTimeout(tick, 2500);
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || !data.id) return;
  const act = b.dataset.act;
  if (act === 'copy') { await copyText(location.href.split('#')[0]); toast(t('js.stories.copied')); return; }
  if (act === 'delete' && !confirm(t('js.stories.deleteConfirm'))) return;
  b.disabled = true;
  try {
    await api(`/api/stories/${encodeURIComponent(data.id)}/${act}`, { method: 'POST', body: {} });
    if (act === 'delete') location.href = '/stories';
    else location.reload();
  } catch (ex) {
    toast((ex && ex.message) || t('js.stories.failed'), { bad: true });
    b.disabled = false;
  }
});
