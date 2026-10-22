// /build: "New game" and "Start from" template cards create a game and open the Studio.
import { api, toast, $, $$ } from '/js/app.js';

async function create(template, btn) {
  $$('.tplcard, #newgame').forEach(b => (b.disabled = true));
  const old = btn.innerHTML;
  if (btn.id === 'newgame') btn.textContent = '✨ Getting ready…';
  try {
    const r = await api('/api/studio/new', { method: 'POST', body: template ? { template } : {} });
    location.href = r.url;
  } catch (e) {
    toast(e.message, { bad: true });
    btn.innerHTML = old; $$('.tplcard, #newgame').forEach(b => (b.disabled = false));
  }
}
const nb = $('#newgame'); if (nb) nb.addEventListener('click', () => create(null, nb));
$$('.tplcard').forEach(b => b.addEventListener('click', () => create(b.dataset.template, b)));
