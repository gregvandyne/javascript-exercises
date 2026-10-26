// Parent side of the game sandbox. Validates every message from the frame (source, origin, shape)
// and turns allowed ones into server calls. Docs: docs/sdk.md
import { api, toast, sheet, pageData, refreshLive, tappedJustNow, $, t, esc } from '/js/app.js';
const d = pageData();
// The game frame waits in a <template> until its 'load' listener is on (below), so its first load is never missed.
const frame = document.importNode($('#gameframe-tpl').content.firstElementChild, true), stage = $('#stage');
let playId = null;

// ---- is someone playing? ----
// The game's own calls (heartbeat, saves, scores, lesson time) keep a sign-in awake only if the player pressed a key,
// clicked or tapped in the last few minutes (server/auth.js), so a game left running on a shared classroom device still
// times out. The browser marks this page as activated for a few seconds after real input, even input inside the game
// frame, and a game can't fake that; presses on this page count too. (Opening the page counted already, on the server.)
const ACTIVE_FOR = 5 * 60e3; let lastInput = 0;
const ua = navigator.userActivation;
if (ua) setInterval(() => { if (ua.isActive) lastInput = Date.now(); }, 1000);
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true });
const playing = () => Date.now() - lastInput < ACTIVE_FOR;
// A game that points its own frame somewhere else: this page's CSP (frame-src 'self') refuses any other website before
// a request leaves, and a reload the game starts itself is refused by the server (no sign-in cookie on it). Either way
// the frame would be stuck on an error page, so the game's own document loads once and any later 'load' pins the
// frame straight back to the game (docs/safety.md, section 9).
const frameSrc = frame.dataset.src;
let frameSettled = false, framePins = 0, pinnedAt = [], stopped = false;
frame.addEventListener('load', () => {
  if (stopped) return;
  if (framePins > 0) { framePins--; return; }   // a reload we triggered below
  if (!frameSettled) { frameSettled = true; return; }   // the game's own first load
  // A game that keeps reloading itself with no tap from the player: after two pins in 30 s, stop instead of looping.
  if (!(ua && ua.isActive)) {
    const now = Date.now(); pinnedAt = pinnedAt.filter(at => now - at < 30e3);
    if (pinnedAt.length >= 2) return stopGame();
    pinnedAt.push(now);
  }
  framePins = 2; frame.src = 'about:blank'; setTimeout(() => { frame.src = frameSrc; }, 30);
});
frame.src = frameSrc; stage.prepend(frame);
function stopGame() {
  stopped = true; frame.src = 'about:blank';
  const box = document.createElement('div'); box.className = 'game-stopped'; box.setAttribute('role', 'alert'); box.dir = document.documentElement.dir || 'ltr';
  box.innerHTML = `<div><p>${esc(t('js.play.stopped'))}</p><button class="btn btn-primary" type="button">${esc(t('js.play.restart'))}</button></div>`;
  box.querySelector('button').addEventListener('click', () => location.reload());
  stage.appendChild(box);
}

// ---- presence + play counting ----
async function start() {
  try { const r = await api(`/api/games/${d.gameId}/play`, { method: 'POST', body: {} }); playId = r.playId; refreshLive(); } catch { /* ignore */ }
}
start();
// Opened from a lesson: play time and scores also count for that lesson step (see server/services/progress.js).
const lessonEvent = body => { if (d.lesson) api(`/api/progress/${d.lesson.cl}/${d.lesson.step}/game`, { method: 'POST', body, active: playing() }).catch(() => {}); };
lessonEvent({ event: 'start' });
setInterval(() => {
  if (document.hidden) return;
  api(`/api/games/${d.gameId}/heartbeat`, { method: 'POST', body: {}, active: playing() }).then(() => refreshLive()).catch(() => {});
  lessonEvent({ event: 'time', seconds: 30 });
}, 30000);
addEventListener('pagehide', () => { navigator.sendBeacon(`/api/games/${d.gameId}/leave`, new Blob([JSON.stringify({ playId })], { type: 'text/plain' })); });

// ---- message validation ----
const TYPES = {
  'brb:ready': m => true,
  'brb:save': m => m.data && typeof m.data === 'object' && !Array.isArray(m.data) && Object.values(m.data).every(v => typeof v === 'string') && JSON.stringify(m.data).length < 500000,
  'brb:score': m => Number.isFinite(m.score) && m.score >= 0 && m.score <= 1e9 && (m.label === undefined || typeof m.label === 'string'),
  'brb:gameover': m => typeof m.won === 'boolean' && (m.score === null || Number.isFinite(m.score)),
  'brb:fullscreen': m => typeof m.on === 'boolean',
  'brb:orientation': m => typeof m.value === 'string' && m.value.length < 40,
  'brb:retry': m => true,
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
  try { await api(`/api/games/${d.gameId}/save`, { method: 'POST', body: { data }, active: playing() }); } catch (err) { if (err.status !== 401) toast(t('js.play.saveFailed'), { bad: true }); }
}
addEventListener('message', e => {
  const m = validMessage(e, frame.contentWindow); if (!m) return;
  switch (m.type) {
    case 'brb:save': if (!d.canSave) return; pendingSave = m.data; if (!saveTimer) saveTimer = setTimeout(flushSave, 1500); break;
    case 'brb:score': {
      if (!d.canSave || Date.now() - lastScoreAt < 2000) return; lastScoreAt = Date.now();
      api(`/api/games/${d.gameId}/score`, { method: 'POST', body: { score: m.score, label: m.label || '' }, active: playing() }).then(r => { if (r.improved) toast(t('js.play.newBest', { score: r.best })); }).catch(() => {});
      lessonEvent({ event: 'score', score: m.score, label: m.label || '' });
      break;
    }
    case 'brb:gameover': lessonEvent({ event: 'end', score: m.score }); break;
    case 'brb:fullscreen': m.on ? goFull() : (document.fullscreenElement && document.exitFullscreen().catch(() => {})); break;
    case 'brb:orientation': if (m.value.startsWith('landscape')) $('#orient').classList.add('show'); break;
    // "Try again" on the 3D card: reload the page, which makes a fresh frame link and sends the sign-in cookie.
    case 'brb:retry': if (tappedJustNow()) location.reload(); break;
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
