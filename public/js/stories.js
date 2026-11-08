// Story Builder pages (server/routes/stories.js): the idea form and its choices, the narrator samples, the progress
// poll (a new story, or a change to a finished one), the edit page, and the share buttons.
import { t, api, $, $$, toast, pageData, copyText } from './app.js';

const data = pageData();
const picked = (root, name) => { const r = $(`input[name="${name}"]:checked`, root); return r ? r.value : undefined; };

// ---------------------------------------------------------------- the idea form
const form = $('#sb-form');
if (form) {
  // The music follows the kind of story and the look (comic leans to piano) until the person picks music themselves.
  let musicTouched = false;
  $$('input[name="music"]', form).forEach(r => r.addEventListener('change', () => { musicTouched = true; }));
  const followMusic = () => {
    const look = data.musicFor && data.musicFor[picked(form, 'look') || 'felt'];
    const m = look && look[picked(form, 'style')];
    const radio = m && $(`input[name="music"][value="${m}"]`, form);
    if (!musicTouched && radio) radio.checked = true;
  };
  $$('input[name="style"], input[name="look"]', form).forEach(r => r.addEventListener('change', followMusic));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#sb-err'), go = $('#sb-go'), idea = $('#sb-idea');
    err.textContent = '';
    idea.removeAttribute('aria-invalid');
    if (idea.value.trim().length < 3) { err.textContent = t('js.stories.needIdea'); idea.setAttribute('aria-invalid', 'true'); idea.focus(); return; }
    go.disabled = true;
    try {
      const body = {
        idea: idea.value, ageBand: $('#sb-age').value, seconds: +$('#sb-len').value,
        style: picked(form, 'style'), tone: picked(form, 'tone'), voice: picked(form, 'voice'), music: picked(form, 'music'), look: picked(form, 'look'),
        characters: $('#sb-chars').value, lesson: $('#sb-lesson').value,
      };
      const r = await api('/api/stories', { method: 'POST', body });
      location.href = `/stories/${encodeURIComponent(r.id)}`;
    } catch (ex) {
      err.textContent = (ex && ex.message) || t('js.stories.failed');
      idea.setAttribute('aria-invalid', 'true');
      go.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- narrator samples (▶): a fixed line, made once
let audio = null;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-sample]');
  if (!b) return;
  const voice = b.dataset.sample;
  const radio = b.parentElement && $('input[type="radio"]', b.parentElement);
  if (radio) radio.checked = true;
  if (audio) { audio.pause(); audio = null; }
  $$('[data-sample]').forEach(x => x.classList.remove('playing'));
  b.disabled = true;
  try {
    const r = await api('/api/stories/voice-sample', { method: 'POST', body: { voice } });
    audio = new Audio(r.u);
    b.classList.add('playing');
    audio.addEventListener('ended', () => b.classList.remove('playing'));
    await audio.play();
  } catch (ex) {
    b.classList.remove('playing');
    toast((ex && ex.message) || t('js.stories.sampleOff'), { bad: true });
  } finally { b.disabled = false; }
});

// ---------------------------------------------------------------- progress
const poll = (onTick, ms = 4000) => {
  const tick = async () => {
    try { if (await onTick(await api(`/api/stories/${encodeURIComponent(data.id)}`, { background: true }))) return; } catch { /* try again on the next tick */ }
    setTimeout(tick, document.hidden ? 15000 : ms);
  };
  setTimeout(tick, 2500);
};
const setBar = (fill, p) => {
  if (!fill) return;
  const pct = Math.round((p || 0) * 100);
  fill.style.width = `${pct}%`;
  if (fill.parentElement) fill.parentElement.setAttribute('aria-valuenow', String(pct));
};
// While it is being made: ask how it is going every few seconds; reload when it is done or failed.
if (data.id && data.status && !['done', 'failed'].includes(data.status)) {
  const status = $('#sb-status');
  poll(r => {
    if (r.status === 'done' || r.status === 'failed') { location.reload(); return true; }
    setBar($('#sb-fill'), r.progress);
    if (status && data.labels && data.labels[r.status]) status.textContent = data.labels[r.status];
    return false;
  });
}
// A change being made to a finished story (the old video keeps playing): reload when the new one is in, or failed.
if (data.id && data.status === 'done' && ['queued', 'working'].includes(data.remake)) {
  poll(r => {
    const m = r.remake || {};
    if (!['queued', 'working'].includes(m.status)) { location.reload(); return true; }
    setBar($('#sb-remake-fill'), m.progress);
    return false;
  }, 5000);
}

// ---------------------------------------------------------------- the edit page
const edit = $('#sb-edit');
if (edit) {
  edit.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#sb-edit-err'), go = $('#sb-edit-go');
    err.textContent = '';
    const lines = [];
    $$('.sb-line', edit).forEach(x => { const i = +x.dataset.scene, k = +x.dataset.line; (lines[i] = lines[i] || [])[k] = x.value; });
    go.disabled = true;
    try {
      await api(`/api/stories/${encodeURIComponent(data.id)}/remake`, { method: 'POST', body: { title: $('#sb-title').value, lines, voice: picked(edit, 'voice'), music: picked(edit, 'music'), look: picked(edit, 'look') } });
      location.href = `/stories/${encodeURIComponent(data.id)}`;
    } catch (ex) {
      err.textContent = (ex && ex.message) || t('js.stories.failed');
      go.disabled = false;
    }
  });
}
const rewrite = $('#sb-rewrite');
if (rewrite) {
  rewrite.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#sb-rw-err'), go = $('#sb-rw-go'), note = $('#sb-note');
    err.textContent = '';
    const style = picked(rewrite, 'style'), tone = picked(rewrite, 'tone');
    const cur = data.current || {};
    if (!note.value.trim() && style === cur.style && tone === cur.tone) { err.textContent = t('js.stories.needNote'); note.focus(); return; }
    go.disabled = true;
    try {
      await api(`/api/stories/${encodeURIComponent(data.id)}/rewrite`, { method: 'POST', body: { note: note.value, style, tone } });
      location.href = `/stories/${encodeURIComponent(data.id)}`;
    } catch (ex) {
      err.textContent = (ex && ex.message) || t('js.stories.failed');
      go.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- share, retry, delete
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
