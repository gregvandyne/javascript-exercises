// A game's page, for the platform admin only: the "AI voices for this game" switch (routes/tts.js
// /api/admin/tts/games, services/tts-games.js). English like the admin panel.
import { api, toast, $ } from '/js/app.js';

const box = $('#admin-voices'), cb = $('#admin-voices-on'), status = $('#admin-voices-status');
cb && box && cb.addEventListener('change', async () => {
  const on = cb.checked; cb.disabled = true;
  try {
    await api('/api/admin/tts/games', { method: 'POST', body: { game: box.dataset.game, on } });
    if (status) status.textContent = on ? 'AI voices are on for this game.' : 'AI voices are off for this game.';
    toast(on ? 'Switched on.' : 'Switched off.');
  } catch (ex) { cb.checked = !on; if (status) status.textContent = ex.message; toast(ex.message, { bad: true }); }
  finally { cb.disabled = false; }
});
