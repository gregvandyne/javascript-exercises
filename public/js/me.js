import { api, toast, $$ } from '/js/app.js';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-avatar],[data-color]'); if (!b) return;
  const body = b.dataset.avatar ? { avatar: b.dataset.avatar } : { color: b.dataset.color };
  try { await api('/api/me', { method: 'POST', body }); $$(b.dataset.avatar ? '[data-avatar]' : '[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); toast('Looking good!'); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});
const t = document.getElementById('chat-toggle');
if (t) t.addEventListener('change', async () => { try { await api('/api/me', { method: 'POST', body: { chatEnabled: t.checked } }); toast(t.checked ? 'Chat is on.' : 'Chat is off.'); } catch (err) { toast(err.message, { bad: true }); t.checked = !t.checked; } });
