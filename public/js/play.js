// Parent side of the game sandbox. Validates every message from the frame (source, origin, shape)
// and turns allowed ones into server calls. Docs: docs/sdk.md
import { api, toast, sheet, pageData, refreshLive, tappedJustNow, $, t, esc } from '/js/app.js';
import { openLobby, startRelay } from '/js/match.js';
import { ttsBlob, voiceMode, setVoiceMode, saveData } from '/js/tts.js';
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
  'brb:poll': m => typeof m.item === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(m.item) && (m.choice === 0 || m.choice === 1) && Number.isInteger(m.seat) && m.seat >= 0 && m.seat <= 5 && Number.isInteger(m.n) && m.n >= 0 && m.n < 1e9,
  'brb:online': m => true,
  // AI voices (official games listed for voices, and games the admin switched on; public/js/tts.js): one line of the game's own words to read aloud.
  'brb:tts': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 600 && typeof m.lang === 'string' && m.lang.length <= 16
    && TTS_ROLES.includes(m.role) && Number.isFinite(m.rate) && m.rate >= 0.5 && m.rate <= 2 && (m.pre === undefined || m.pre === true),
};
const TTS_ROLES = ['narrator', 'friendly', 'bright', 'deep', 'wise', 'grumpy'];
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
// An online match (?match=<id>): the frame hands its private port over with brb:ready; public/js/match.js relays.
const relay = d.match ? startRelay(d, stage) : null;
addEventListener('message', e => {
  const m = validMessage(e, frame.contentWindow); if (!m) return;
  switch (m.type) {
    case 'brb:ready': if (relay && m.match === 1 && e.ports && e.ports[0]) relay.attach(e.ports[0]); tellMode(); break;
    // A poll (BRB.poll, official games on the list): count the choice, hand the totals back to the frame.
    case 'brb:poll': {
      const answer = r => { try { frame.contentWindow.postMessage({ brb: 1, type: 'brb:pollResult', n: m.n, ...(r ? { a: r.a, b: r.b, total: r.total, min: r.min } : { off: true }) }, '*'); } catch { /* frame gone */ } };
      if (!d.polls) { answer(null); break; }
      api(`/api/games/${d.gameId}/poll`, { method: 'POST', body: { item: m.item, choice: m.choice, seat: m.seat }, active: playing() }).then(answer, () => answer(null));
      break;
    }
    case 'brb:tts': gameLine(m); break;
    // "Play online" in a game that can be played online: the site's own sheet (friends, family, codes).
    case 'brb:online': if (d.online && !d.match && tappedJustNow()) openLobby(d); break;
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
$('#p-like') && $('#p-like').addEventListener('click', async () => {
  if (!d.signedIn) return toast(t('js.play.signInToLike'));
  try { const r = await api(`/api/games/${d.gameId}/like`, { method: 'POST', body: {} }); const b = $('#p-like'); b.setAttribute('aria-pressed', String(r.liked)); b.querySelector('.emo').textContent = r.liked ? '❤️' : '🤍'; toast(r.liked ? t('js.play.liked') : t('js.play.unliked')); } catch (err) { toast(err.message, { bad: true }); }
});
$('#p-rate') && $('#p-rate').addEventListener('click', () => {
  if (!d.signedIn) return toast(t('js.play.signInToRate'));
  const s = sheet({ title: t('js.play.rateTitle', { title: d.title }), content: `<div class="rate" role="radiogroup" aria-label="${esc(t('js.play.stars'))}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n === d.myStars}" aria-label="${esc(t('js.play.starsLabel', { count: n }))}" data-stars="${n}" class="${n <= d.myStars ? 'on' : ''}">★</button>`).join('')}</div>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-stars]'); if (!b) return;
    try { await api(`/api/games/${d.gameId}/rate`, { method: 'POST', body: { stars: +b.dataset.stars } }); d.myStars = +b.dataset.stars; toast(t('js.play.thanksRating')); s.close(); } catch (err) { toast(err.message, { bad: true }); }
  });
});

// ---- AI voices (docs/tts-design.md): the game frame can't fetch, so its lines come through here ----
// Only official games listed for voices and games the admin switched on get d.tts (a token bound to this player and
// game); the server checks the game, the language and the words again. Any refusal, a timeout or the device choice: the frame is told no, and it uses the device's voice.
const toFrame = (msg, transfer) => { try { frame.contentWindow.postMessage({ brb: 1, ...msg }, '*', transfer || []); } catch { /* frame gone */ } };
function tellMode() { if (d.tts) toFrame({ type: 'brb:tts-mode', mode: voiceMode() }); }
// After the server says "slow down" ('fast'), prefetches pause for a minute so the lines actually spoken keep their
// voice. The first time an AI voice plays on this device, a toast says the voices are AI-made (the 🔊 Voices sheet
// says more).
const TOLD_KEY = 'oomba:voices-told';
let fastUntil = 0;
function tellAiOnce() {
  try { if (localStorage.getItem(TOLD_KEY)) return; localStorage.setItem(TOLD_KEY, '1'); } catch { /* storage off: tell every time */ }
  toast(t('js.play.voicesNote', { provider: d.tts.provider || 'OpenAI' }), { ms: 9000 });
}
async function gameLine(m) {
  const no = why => { if (!m.pre) toFrame({ type: 'brb:tts', id: m.id, ok: false, why }); };
  if (!d.tts || !d.tts.tok) return no('off');
  if (voiceMode() !== 'ai') return no('off');
  if (m.pre && Date.now() < fastUntil) return;
  try {
    const blob = await ttsBlob({ ctx: 'game', tok: d.tts.tok, text: m.text, lang: m.lang, role: m.role, rate: m.rate }, { pre: !!m.pre });
    if (m.pre) return;
    const buf = await blob.arrayBuffer();   // a fresh copy each time: the transfer hands it to the frame
    toFrame({ type: 'brb:tts', id: m.id, ok: true, buf }, [buf]);
    tellAiOnce();
  } catch (err) {
    if (err && err.code === 'fast') fastUntil = Date.now() + 60e3;
    no(err && err.code ? err.code : 'error');
  }
}
// The 🔊 Voices button (only when this game has AI voices): AI voices or this device's own voice, and what AI voices are.
$('#p-voices') && $('#p-voices').addEventListener('click', () => {
  const cur = voiceMode();
  const opt = (v, label) => `<label class="radio-row"><input type="radio" name="voices" value="${v}"${cur === v ? ' checked' : ''}> ${esc(label)}</label>`;
  const s = sheet({ title: t('js.play.voicesTitle'), content: `<div class="stack" role="radiogroup" aria-label="${esc(t('js.play.voicesTitle'))}">${opt('ai', t('js.play.voicesAi'))}${opt('device', t('js.play.voicesDevice'))}</div>
    <p class="small muted" id="p-voices-note">${esc(t('js.play.voicesNote', { provider: d.tts.provider || 'OpenAI' }))}</p>${saveData() ? `<p class="small muted">${esc(t('js.play.voicesSaveData'))}</p>` : ''}` });
  s.el.addEventListener('change', e => {
    const r = e.target.closest('input[name="voices"]'); if (!r) return;
    setVoiceMode(r.value); tellMode();
    $('#p-voices').setAttribute('aria-pressed', String(r.value === 'ai'));
  });
});
