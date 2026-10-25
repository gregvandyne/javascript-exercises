// Friends page: copy my code, add by code, accept/decline/cancel/remove/unblock, refresh "playing now".
import { api, toast, sheet, pageData, copyText, esc, $, t } from '/js/app.js';
const d = pageData();

const copy = $('#copycode');
if (copy) copy.addEventListener('click', async () => {
  if (await copyText(copy.dataset.code)) toast(t('js.friends.codeCopied'));
  else toast(t('js.friends.holdToCopy'));
});

const form = $('#addform');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#code'), err = $('#code-err'), btn = form.querySelector('[type=submit]');
  err.textContent = ''; input.removeAttribute('aria-invalid');
  const code = input.value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!code) { err.textContent = t('js.friends.typeCode'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  btn.disabled = true;
  try {
    const r = await api('/api/friends/add', { method: 'POST', body: { code } });
    toast(r.message); input.value = '';
    setTimeout(() => location.reload(), 900);
  } catch (ex) { err.textContent = ex.message; input.setAttribute('aria-invalid', 'true'); input.focus(); }
  finally { btn.disabled = false; }
});

async function run(b) {
  const { act, id, username } = b.dataset;
  const url = act === 'unblock' ? `/api/chat/${encodeURIComponent(username)}/unblock` : `/api/friends/${encodeURIComponent(id)}/${act}`;
  b.disabled = true;
  try { const r = await api(url, { method: 'POST', body: {} }); toast(r.message || t('js.friends.done')); setTimeout(() => location.reload(), 600); }
  catch (ex) { toast(ex.message, { bad: true }); b.disabled = false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'remove') {
    const s = sheet({ title: t('js.friends.removeTitle', { name: b.dataset.name }), content: `<p>${esc(t('js.friends.removeText'))}</p><div class="row"><button class="btn btn-danger" type="button" id="yes">${esc(t('js.friends.removeYes'))}</button><button class="btn" type="button" id="no">${esc(t('js.friends.removeNo'))}</button></div>` });
    s.el.querySelector('#yes').addEventListener('click', () => { s.close(); run(b); });
    s.el.querySelector('#no').addEventListener('click', () => s.close());
    return;
  }
  run(b);
});

// What friends are playing: refresh every 30 s without a reload.
async function refreshPlaying() {
  if (!d.friendIds || !d.friendIds.length || document.hidden) return;
  try {
    const r = await api('/api/friends', { background: true });
    for (const f of r.friends) {
      const el = document.querySelector(`[data-playing="${CSS.escape(f.id)}"]`); if (!el) continue;
      el.innerHTML = f.playing ? `<a class="playing" href="/g/${esc(f.playing.slug)}"><span class="dot" aria-hidden="true"></span>${esc(t('js.friends.playing', { game: `${f.playing.icon} ${f.playing.title}` }))}</a>` : `<span class="sub">${esc(t('js.friends.notPlaying'))}</span>`;
    }
  } catch { /* try again later */ }
}
setInterval(refreshPlaying, 30000);
