// /admin/voices: play a sample in any language with any voice, switch languages on, choose narrator and character
// voices, and warm up a game's lines (routes/tts.js). Admin only; English like the rest of the admin panel.
import { api, toast, $ } from '/js/app.js';

const data = JSON.parse(document.getElementById('page-data').textContent);
let audio = null;

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-play],[data-play-narrator]'); if (!b) return;
  // The phone layout's single ▶ plays the narrator chosen in that row's select.
  const voice = b.hasAttribute('data-play-narrator') ? (document.querySelector(`select[data-narrator="${b.dataset.locale}"]`) || {}).value : b.dataset.voice;
  b.disabled = true;
  try {
    const r = await api('/api/admin/tts/sample', { method: 'POST', body: { locale: b.dataset.locale, voice } });
    if (audio) audio.pause();
    audio = new Audio(r.u);
    await audio.play();
  } catch (ex) { toast(ex.message, { bad: true }); }
  finally { b.disabled = false; }
});

// The ▶ of the narrator chosen in each row is marked (aria-current), and follows the select.
document.addEventListener('change', e => {
  const sel = e.target.closest('select[data-narrator]'); if (!sel) return;
  for (const b of document.querySelectorAll(`[data-play][data-locale="${sel.dataset.narrator}"]`)) {
    if (b.dataset.voice === sel.value) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
});

const form = $('#tv-form');
form && form.addEventListener('submit', async e => {
  e.preventDefault();
  const locales = {}, roles = {};
  for (const tr of form.querySelectorAll('tr[data-locale]')) {
    const l = tr.dataset.locale;
    const on = form.elements[`on-${l}`], nar = form.elements[`narrator-${l}`];
    locales[l] = { narrator: nar.value, ...(on.disabled ? {} : { on: on.checked }) };
  }
  for (const s of form.querySelectorAll('select[name^="role-"]')) roles[s.name.slice(5)] = s.value;
  try { await api('/api/admin/tts/settings', { method: 'POST', body: { locales, roles } }); toast('Saved.'); setTimeout(() => location.reload(), 600); }
  catch (ex) { toast(ex.message, { bad: true }); }
});

const go = $('#tv-warm-go'), stop = $('#tv-warm-stop'), line = $('#tv-warm-status');
function show(s) {
  if (!line) return;
  const bits = [`${s.done} of ${s.total} lines ready`, `${s.cached} were already made`, `${s.failed} failed`, `${s.skipped} skipped`, `${(s.chars || 0).toLocaleString('en-US')} characters`, `about $${(s.usd || 0).toFixed(2)}`];
  line.textContent = s.total ? `${s.running ? 'Warming up… ' : 'Done: '}${bits.join(' · ')}${s.stopped === 'budget' ? ' · stopped: daily characters or AI budget used up' : s.stopped === 'admin' ? ' · stopped' : ''}` : '';
  if (go) go.disabled = !!s.running || !data.on;
  if (stop) stop.hidden = !s.running;
}
let timer = null;
async function poll() {
  clearTimeout(timer);
  try { const s = await api('/api/admin/tts/warm'); show(s); if (s.running) timer = setTimeout(poll, 2000); } catch { timer = setTimeout(poll, 5000); }
}
go && go.addEventListener('click', async () => {
  try { show(await api('/api/admin/tts/warm', { method: 'POST', body: { games: [data.warmGame || 'hero-of-sunvale'], locales: data.onLocales.length ? data.onLocales : data.allowed } })); poll(); }
  catch (ex) { toast(ex.message, { bad: true }); }
});
// Picking another game reloads the page with its line count and cost.
const pick = $('#tv-warm-game');
pick && pick.addEventListener('change', () => { location.href = `/admin/voices?warm=${encodeURIComponent(pick.value)}#tv-warm`; });
stop && stop.addEventListener('click', async () => { try { show(await api('/api/admin/tts/warm/stop', { method: 'POST', body: {} })); } catch (ex) { toast(ex.message, { bad: true }); } });
show(data.warm);
if (data.warm.running) poll();

// Games with AI voices: switch one on from its link or name, or off from the list (routes/tts.js /api/admin/tts/games).
const addForm = $('#tv-game-add'), gStatus = $('#tv-games-status');
addForm && addForm.addEventListener('submit', async e => {
  e.preventDefault();
  const game = addForm.elements.game.value.trim(); if (!game) return;
  try {
    const r = await api('/api/admin/tts/games', { method: 'POST', body: { game, on: true } });
    if (gStatus) gStatus.textContent = `AI voices are on for ${r.game.title}.`;
    toast('Switched on.'); setTimeout(() => location.reload(), 600);
  } catch (ex) { if (gStatus) gStatus.textContent = ex.message; toast(ex.message, { bad: true }); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tg-off]'); if (!b) return;
  b.disabled = true;
  try { await api('/api/admin/tts/games', { method: 'POST', body: { game: b.dataset.tgOff, on: false } }); toast('Switched off.'); setTimeout(() => location.reload(), 600); }
  catch (ex) { toast(ex.message, { bad: true }); b.disabled = false; }
});
