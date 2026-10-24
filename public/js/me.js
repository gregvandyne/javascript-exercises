import { api, toast, $$, t } from '/js/app.js';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-avatar],[data-color]'); if (!b) return;
  const body = b.dataset.avatar ? { avatar: b.dataset.avatar } : { color: b.dataset.color };
  try { await api('/api/me', { method: 'POST', body }); $$(b.dataset.avatar ? '[data-avatar]' : '[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); toast(t('js.me.lookingGood')); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});
const tg = document.getElementById('chat-toggle');
if (tg) tg.addEventListener('change', async () => { try { await api('/api/me', { method: 'POST', body: { chatEnabled: tg.checked } }); toast(tg.checked ? t('js.me.chatOn') : t('js.me.chatOff')); } catch (err) { toast(err.message, { bad: true }); tg.checked = !tg.checked; } });
