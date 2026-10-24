// Parent side of the game sandbox. Validates every message from the frame (source, origin, shape)
// and turns allowed ones into server calls. Docs: docs/sdk.md
import { api, toast, sheet, pageData, refreshLive, $, t, esc } from '/js/app.js';
const d = pageData();
const frame = $('#gameframe'), stage = $('#stage');
let playId = null;

// ---- presence + play counting ----
async function start() {
  try { const r = await api(`/api/games/${d.gameId}/play`, { method: 'POST', body: {} }); playId = r.playId; refreshLive(); } catch { /* ignore */ }
}
start();
setInterval(() => { if (!document.hidden) api(`/api/games/${d.gameId}/heartbeat`, { method: 'POST', body: {} }).then(() => refreshLive()).catch(() => {}); }, 30000);
addEventListener('pagehide', () => { navigator.sendBeacon(`/api/games/${d.gameId}/leave`, new Blob([JSON.stringify({ playId })], { type: 'text/plain' })); });

// ---- message validation ----
const TYPES = {
  'brb:ready': m => true,
  'brb:save': m => m.data && typeof m.data === 'object' && !Array.isArray(m.data) && Object.values(m.data).every(v => typeof v === 'string') && JSON.stringify(m.data).length < 500000,
  'brb:score': m => Number.isFinite(m.score) && m.score >= 0 && m.score <= 1e9 && (m.label === undefined || typeof m.label === 'string'),
  'brb:gameover': m => typeof m.won === 'boolean' && (m.score === null || Number.isFinite(m.score)),
  'brb:fullscreen': m => typeof m.on === 'boolean',
  'brb:orientation': m => typeof m.value === 'string' && m.value.length < 40,
};
export function validMessage(e, frameWin) {
  if (e.source !== frameWin) return null;            // only our game frame
  if (e.origin !== 'null') return null;              // sandboxed frames have an opaque origin
  const m = e.data; if (!m || typeof m !== 'object' || m.brb !== 1 || typeof m.type !== 'string') return null;
  const check = TYPES[m.type]; if (!check) return null;
  try { return check(m) ? m : null; } catch { return null; }
}
let saveTimer = null, pendingSave = null, lastScoreAt = 0;
async function flushSave() {
  saveTimer = null; const data = pendingSave; pendingSave = null; if (!data) return;
  try { await api(`/api/games/${d.gameId}/save`, { method: 'POST', body: { data } }); } catch (err) { if (err.status !== 401) toast(t('js.play.saveFailed'), { bad: true }); }
}
addEventListener('message', e => {
  const m = validMessage(e, frame.contentWindow); if (!m) return;
  switch (m.type) {
    case 'brb:save': if (!d.canSave) return; pendingSave = m.data; if (!saveTimer) saveTimer = setTimeout(flushSave, 1500); break;
    case 'brb:score': {
      if (!d.canSave || Date.now() - lastScoreAt < 2000) return; lastScoreAt = Date.now();
      api(`/api/games/${d.gameId}/score`, { method: 'POST', body: { score: m.score, label: m.label || '' } }).then(r => { if (r.improved) toast(t('js.play.newBest', { score: r.best })); }).catch(() => {});
      break;
    }
    case 'brb:gameover': break;
    case 'brb:fullscreen': m.on ? goFull() : (document.fullscreenElement && document.exitFullscreen().catch(() => {})); break;
    case 'brb:orientation': if (m.value.startsWith('landscape')) $('#orient').classList.add('show'); break;
  }
});
addEventListener('pagehide', () => { if (pendingSave) { navigator.sendBeacon && fetch(`/api/games/${d.gameId}/save`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: pendingSave }) }); } });

// ---- bar buttons ----
function goFull() {
  const el = stage; const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return toast(t('js.play.noFullscreen'));
  Promise.resolve(req.call(el)).then(() => { try { screen.orientation.lock && screen.orientation.lock(document.body.classList.contains('wants-landscape') ? 'landscape' : 'any').catch(() => {}); } catch { /* ignore */ } }).catch(() => toast(t('js.play.tapFullscreen')));
}
$('#p-full').addEventListener('click', goFull);
$('#orient-ok') && $('#orient-ok').addEventListener('click', () => $('#orient').classList.remove('show'));
$('#p-like').addEventListener('click', async () => {
  if (!d.signedIn) return toast(t('js.play.signInToLike'));
  try { const r = await api(`/api/games/${d.gameId}/like`, { method: 'POST', body: {} }); const b = $('#p-like'); b.setAttribute('aria-pressed', String(r.liked)); b.querySelector('.emo').textContent = r.liked ? '❤️' : '🤍'; toast(r.liked ? t('js.play.liked') : t('js.play.unliked')); } catch (err) { toast(err.message, { bad: true }); }
});
$('#p-rate').addEventListener('click', () => {
  if (!d.signedIn) return toast(t('js.play.signInToRate'));
  const s = sheet({ title: t('js.play.rateTitle', { title: d.title }), content: `<div class="rate" role="radiogroup" aria-label="${esc(t('js.play.stars'))}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n === d.myStars}" aria-label="${esc(t('js.play.starsLabel', { count: n }))}" data-stars="${n}" class="${n <= d.myStars ? 'on' : ''}">★</button>`).join('')}</div>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-stars]'); if (!b) return;
    try { await api(`/api/games/${d.gameId}/rate`, { method: 'POST', body: { stars: +b.dataset.stars } }); d.myStars = +b.dataset.stars; toast(t('js.play.thanksRating')); s.close(); } catch (err) { toast(err.message, { bad: true }); }
  });
});
