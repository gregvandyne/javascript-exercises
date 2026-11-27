// Parent side of the game sandbox. Validates every message from the frame (source, origin, shape)
// and turns allowed ones into server calls. Docs: docs/sdk.md
import { api, toast, sheet, pageData, refreshLive, tappedJustNow, $, t, esc } from '/js/app.js';
import { openLobby, startRelay } from '/js/match.js';
import { ttsBlob, ttsCheck, voiceMode, setVoiceMode, saveData } from '/js/tts.js';
import { fullScreen } from '/js/fullscreen.js';
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
// Inside Homeroom's layer (?in=hr, public/js/homeroom-player.js): Escape on this page (not in full screen, and not inside
// the game, which keeps its own keys) closes the layer, as it does from the layer's own bar.
if (d.embed && parent !== window) addEventListener('keydown', e => { if (e.key === 'Escape' && !document.fullscreenElement) parent.postMessage({ type: 'hr:close' }, location.origin); });
const playing = () => Date.now() - lastInput < ACTIVE_FOR;
// A game that points its own frame somewhere else: this page's CSP (frame-src 'self') refuses any other website before
// a request leaves, and a reload the game starts itself is refused by the server (no sign-in cookie on it). Either way
// the frame would be stuck on an error page, so the game's own document loads once and any later 'load' pins the
// frame straight back to the game (docs/safety.md, section 9).
const frameSrc = frame.dataset.src;
let frameSettled = false, framePins = 0, pinnedAt = [], stopped = false;
frame.addEventListener('load', () => {
  stopLoud();   // a (re)loaded game starts with the microphone off
  if (stopped) return;
  if (framePins > 0) { framePins--; return; }   // a reload we triggered below
  if (!frameSettled) { frameSettled = true; focusOnLoad(); return; }   // the game's own first load
  // A game that keeps reloading itself with no tap from the player: after two pins in 30 s, stop instead of looping.
  if (!(ua && ua.isActive)) {
    const now = Date.now(); pinnedAt = pinnedAt.filter(at => now - at < 30e3);
    if (pinnedAt.length >= 2) return stopGame();
    pinnedAt.push(now);
  }
  framePins = 2; frame.src = 'about:blank'; setTimeout(() => { frame.src = frameSrc; }, 30);
});
frame.src = frameSrc;
// The game gets the keyboard on load, so a laptop player can press Space at once (no click or five Tabs first) —
// unless the player has already put the focus somewhere on the page.
function focusOnLoad() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement && a !== frame) return;
  try { frame.focus({ preventScroll: true }); } catch { /* frame gone */ }
}
// The toasts sit over the game: they never take a tap meant for the game's own buttons (its D-pad, its A button).
{ const box = document.getElementById('toasts'); if (box) box.classList.add('over-game'); }
// The frame goes AFTER the fullscreen back link, not before it: in fullscreen the browser tabs only within
// the stage, so the back link must be the first stop — otherwise a keyboard player has to tab through the
// whole game to reach the way out. Both are absolutely positioned; the visual stack is unchanged.
const fsb = stage.querySelector('.fsback');
if (fsb) fsb.after(frame); else stage.prepend(frame);
function stopGame() {
  stopped = true; stopLoud(); frame.src = 'about:blank';
  const box = document.createElement('div'); box.className = 'game-stopped'; box.setAttribute('role', 'alert'); box.dir = document.documentElement.dir || 'ltr';
  box.innerHTML = `<div><p>${esc(t('js.play.stopped'))}</p><button class="btn btn-primary" type="button">${esc(t('js.play.restart'))}</button></div>`;
  box.querySelector('button').addEventListener('click', () => location.reload());
  stage.appendChild(box);
}

// ---- the course finish bar ----
// A game launched from a course step ends on its own screens (podium, results card), which offer only
// Play again — the student is stranded in the game, and whether the step counted is invisible to them
// (live finding, 2026-11-05). So when the game reports its end, the page itself — inside the stage, so
// fullscreen shows it too — states the outcome and offers the way back to the course as the big primary
// action. Four honest states: the completion was recorded (done), a guest's win was banked for sign-in
// (finished), the finish did not complete the step (notyet), or the win could not be saved (failed).
// Free play never sees it: it is driven entirely by d.cstep.
let courseBar = null;
/** Hand the keyboard focus back to the game frame (its window gets focus, so a kit game resumes what blur paused). */
function refocusGame() { try { frame.focus(); frame.contentWindow.focus(); } catch { /* frame gone */ } }
function hideCourseBar() { if (courseBar) { courseBar.remove(); courseBar = null; } const box = document.getElementById('toasts'); if (box) box.style.bottom = ''; }
function showCourseBar(kind) {
  hideCourseBar();
  if (!d.cstep || !d.backHref) return;
  const text = { done: t('js.play.courseDone'), finished: t('js.play.courseFinished'), notyet: t('js.play.courseNotYet'), failed: t('js.play.courseSaveFailed') }[kind];
  if (!text) return;
  const bar = document.createElement('div'); bar.className = 'course-done'; bar.setAttribute('role', 'status'); bar.dir = document.documentElement.dir || 'ltr';
  bar.innerHTML = `<p class="cd-text">${esc(text)}</p>
    <a class="btn btn-primary btn-big" href="${esc(d.backHref)}">${esc(d.backLabel || t('js.play.courseBack'))}</a>
    <button type="button" class="btn cd-keep">${esc(t('js.play.courseKeepPlaying'))}</button>`;
  bar.querySelector('.cd-keep').addEventListener('click', () => { hideCourseBar(); refocusGame(); });
  stage.appendChild(bar); courseBar = bar;
  // The toast stack is viewport-fixed at the bottom and would land on top of the bar, hiding its text
  // and its primary button behind the Number Quest toasts (which fire a moment earlier). Lift the stack
  // to just above the bar so both stay readable; hideCourseBar puts it back.
  const box = document.getElementById('toasts');
  if (box) { const r = bar.getBoundingClientRect(); box.style.bottom = Math.max(16, Math.round(window.innerHeight - r.top + 8)) + 'px'; }
}

// ---- presence + play counting ----
async function start() {
  try { const r = await api(`/api/games/${d.gameId}/play`, { method: 'POST', body: {} }); playId = r.playId; refreshLive(); } catch { /* ignore */ }
}
start();
// Opened from a lesson: play time and scores also count for that lesson step (see server/services/progress.js).
const lessonEvent = body => { if (d.lesson && !d.lesson.proof) api(`/api/progress/${d.lesson.cl}/${d.lesson.step}/game`, { method: 'POST', body, active: playing() }).catch(() => {}); };
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
  'brb:gameover': m => typeof m.won === 'boolean' && (m.score === null || Number.isFinite(m.score)) && (m.helped === undefined || m.helped === true),
  'brb:fullscreen': m => typeof m.on === 'boolean',
  'brb:orientation': m => typeof m.value === 'string' && m.value.length < 40,
  'brb:retry': m => true,
  'brb:back': m => true,
  'brb:poll': m => typeof m.item === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(m.item) && (m.choice === 0 || m.choice === 1) && Number.isInteger(m.seat) && m.seat >= 0 && m.seat <= 5 && Number.isInteger(m.n) && m.n >= 0 && m.n < 1e9,
  'brb:online': m => true,
  // AI voices (official games listed for voices, games the admin switched on and scanner-passed Builder games; public/js/tts.js): one line of the game's own words to read aloud.
  'brb:tts': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 600 && typeof m.lang === 'string' && m.lang.length <= 16
    && TTS_ROLES.includes(m.role) && Number.isFinite(m.rate) && m.rate >= 0.5 && m.rate <= 2 && (m.pre === undefined || m.pre === true)
    && (m.check === undefined || m.check === true),
  // Loudness (BRB.loudness; only page-data.mic pages ever listen, public/js/loudness.js): hello / start / keep / stop.
  'brb:loud': m => LOUD_OPS.includes(m.op),
  // BRB.copy: a link to this game's own page or a small PNG (copyForGame checks which); BRB.saveQuestionSet: a set game's
  // questions (the server cleans them); BRB.assign: a set game's lesson parameters (the server cleans them).
  'brb:copy': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && (typeof m.text === 'string' || (typeof Blob === 'function' && m.png instanceof Blob)),
  'brb:set-save': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.items) && m.items.length <= 20 && JSON.stringify(m.items).length <= 20000 && (m.set === null || m.set === undefined || typeof m.set === 'string')
    && (m.title === undefined || (typeof m.title === 'string' && m.title.length <= 60)),
  'brb:assign': m => typeof m.opts === 'string',
  // BRB.hostLive (Atlas Quest's door: Host live): no data; the page knows the game's live mode (page-data hostLive).
  'brb:hostlive': m => true,
  // BRB.mySets and friends ("My worksheets"): the teacher's own sets (the server checks whose they are).
  'brb:sets': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && ['list', 'delete', 'rename', 'duplicate'].includes(m.op)
    && (m.op === 'list' || (typeof m.set === 'string' && /^s-[a-z0-9]{10}$/.test(m.set))) && (m.op !== 'rename' || (typeof m.title === 'string' && m.title.length <= 200)),
  // BRB.findQuestionSet: a class code a student typed (the server reads it).
  'brb:set-find': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.code === 'string' && m.code.length <= 40,
  // BRB.wordsFromDoc (Crossword): a PDF or Word file of at most 2 MB, for AI words (the server checks who may ask), and
  // the teacher's optional focus line for the AI (at most 200 characters; the server filters it).
  'brb:doc': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof Blob === 'function' && m.file instanceof Blob && m.file.size > 0 && m.file.size <= 2 * 1024 * 1024
    && (m.kind === 'pdf' || m.kind === 'docx' || m.kind === 'txt') && typeof m.level === 'string' && m.level.length <= 60
    && (m.focus === undefined || (typeof m.focus === 'string' && m.focus.length <= 200)),
  // BRB.textFromDoc (Mistake Hunt): a PDF or Word file of at most 2 MB, for its text (the server checks who may ask).
  'brb:textdoc': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof Blob === 'function' && m.file instanceof Blob && m.file.size > 0 && m.file.size <= 2 * 1024 * 1024
    && (m.kind === 'pdf' || m.kind === 'docx'),
  // BRB.writeClues (Crossword): the teacher's words, for AI clues (the server checks who may ask).
  'brb:clues': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.words) && m.words.length >= 1 && m.words.length <= 30
    && m.words.every(w => typeof w === 'string' && w.length <= 40) && typeof m.level === 'string' && m.level.length <= 60,
  // Mistake Hunt (docs/sdk.md "Mistake Hunt"): BRB.proofAsk (the server checks who may ask) and a graded step's fixes.
  'brb:proofai': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && ['draft', 'scan', 'why', 'chat', 'chat-get', 'chat-applied'].includes(m.op) && !!m.body && typeof m.body === 'object' && !Array.isArray(m.body) && JSON.stringify(m.body).length <= 60000,
  'brb:proof': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.edits) && JSON.stringify(m.edits).length <= 60000 && typeof m.handIn === 'boolean'
    && (m.hint === undefined || (Number.isInteger(m.hint) && m.hint >= 0 && m.hint < 100)),
  'brb:trial': m => true,
  // BRB.draftCards (Flashcards): the teacher's topic for AI cards (the server checks who may ask and filters the topic).
  'brb:cards': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.topic === 'string' && m.topic.length >= 1 && m.topic.length <= 200
    && typeof m.level === 'string' && m.level.length <= 60 && [5, 10, 15, 20, 30].includes(m.count),
  // BRB.flashProgress (Flashcards): each card's level and misses on the student's own lesson step (the server checks them).
  'brb:flash': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.cards) && m.cards.length >= 1 && m.cards.length <= 50
    && m.cards.every(c => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1])),
  // BRB.flashPics (Flashcards' pictures, services/flash-pics.js): upload a JPEG the frame made (base64), ask Oomba to
  // paint some, fetch one to show (our own route only: the frame can't load it itself), or the owner's states.
  'brb:fpic-up': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.data === 'string' && m.data.length >= 8 && m.data.length <= 2200000,
  'brb:fpic-paint': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.asks) && m.asks.length >= 1 && m.asks.length <= 30
    && m.asks.every(a => a && typeof a === 'object' && typeof a.subject === 'string' && a.subject.length <= 80 && (a.note === undefined || (typeof a.note === 'string' && a.note.length <= 120))),
  'brb:fpic-get': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && typeof m.ref === 'string' && /^img:[A-Za-z0-9]{10,40}$/.test(m.ref) && (m.set === '' || (typeof m.set === 'string' && /^s-[a-z0-9]{10}$/.test(m.set))),
  'brb:fpic-state': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && Array.isArray(m.refs) && m.refs.length >= 1 && m.refs.length <= 100 && m.refs.every(r => typeof r === 'string' && /^img:[A-Za-z0-9]{10,40}$/.test(r)),
  // BRB.flashShare (Flashcards shared with a class, services/flash-share.js): a student's switches ('mine'), the list
  // ('list'), sharing one of their sets with a class or not ('set'), a teacher hiding one from a class ('hide').
  'brb:fshare': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && ['mine', 'list', 'set', 'hide'].includes(m.op)
    && (m.op === 'mine' || m.op === 'list' || (typeof m.set === 'string' && /^s-[a-z0-9]{10}$/.test(m.set) && typeof m.cls === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(m.cls) && typeof m.on === 'boolean')),
  // BRB.print (Crossword): the puzzle as plain data, at most 20,000 characters (the server checks every part of it).
  'brb:print': m => Number.isInteger(m.id) && m.id > 0 && m.id < 1e9 && !!m.doc && typeof m.doc === 'object' && !Array.isArray(m.doc) && JSON.stringify(m.doc).length <= 20000,
};
const LOUD_OPS = ['hello', 'start', 'keep', 'stop'];
const TTS_ROLES = ['narrator', 'friendly', 'bright', 'deep', 'wise', 'grumpy'];
export function validMessage(e, frameWin) {
  if (e.source !== frameWin) return null;            // only our game frame
  if (e.origin !== 'null') return null;              // sandboxed frames have an opaque origin
  const m = e.data; if (!m || typeof m !== 'object' || m.brb !== 1 || typeof m.type !== 'string') return null;
  const check = TYPES[m.type]; if (!check) return null;
  try { return check(m) ? m : null; } catch { return null; }
}
let saveTimer = null, pendingSave = null, lastScoreAt = 0, saveRetry = 0;
let helpedScore = false;   // the last brb:gameover said helped (Oomba Canvas 1.3.0): the score after it is the same set's
// A save that does not reach the server (the connection dropped) is kept and sent again — after 5 s, then less
// often, and at once when the browser is back online — unless a newer save has replaced it. The player hears once.
async function flushSave() {
  saveTimer = null; const data = pendingSave; pendingSave = null; if (!data) return;
  try {
    await api(`/api/games/${d.gameId}/save`, { method: 'POST', body: { data }, active: playing() });
    saveRetry = 0;
  } catch (err) {
    if (err.status === 401) return;
    if (!saveRetry) toast(t('js.play.saveFailed'), { bad: true });
    if (err.status && err.status < 500 && err.status !== 408 && err.status !== 429) return;   // refused: sending it again would not help
    if (!pendingSave) pendingSave = data;
    saveRetry = Math.min(saveRetry + 1, 5);
    if (!saveTimer) saveTimer = setTimeout(flushSave, 5000 * 2 ** (saveRetry - 1));
  }
}
addEventListener('online', () => { if (pendingSave && saveRetry) { clearTimeout(saveTimer); saveTimer = null; flushSave(); } });
// An online match (?match=<id>): the frame hands its private port over with brb:ready; public/js/match.js relays.
const relay = d.match ? startRelay(d, stage) : null;
addEventListener('message', e => {
  const m = validMessage(e, frame.contentWindow); if (!m) return;
  switch (m.type) {
    case 'brb:ready': hideCourseBar(); if (relay && m.match === 1 && e.ports && e.ports[0]) relay.attach(e.ports[0]); tellMode(); break;
    // A poll (BRB.poll, official games on the list): count the choice, hand the totals back to the frame.
    case 'brb:poll': {
      const answer = r => { try { frame.contentWindow.postMessage({ brb: 1, type: 'brb:pollResult', n: m.n, ...(r ? { a: r.a, b: r.b, total: r.total, min: r.min } : { off: true }) }, '*'); } catch { /* frame gone */ } };
      if (!d.polls) { answer(null); break; }
      api(`/api/games/${d.gameId}/poll`, { method: 'POST', body: { item: m.item, choice: m.choice, seat: m.seat }, active: playing() }).then(answer, () => answer(null));
      break;
    }
    case 'brb:tts': gameLine(m); break;
    // Loudness: any other game's page answers 'off' and never touches the microphone (its header also says
    // microphone=()). Remi's page hands the op to loudness.js, which opens the mic only after a real tap.
    case 'brb:loud': if (!d.mic) toFrame({ type: 'brb:loudState', state: 'off' }); else loudMessage(m); break;
    // "Play online" in a game that can be played online: the site's own sheet (friends, family, codes).
    case 'brb:online': if (d.online && !d.match && tappedJustNow()) openLobby(d); break;
    case 'brb:save': if (!d.canSave) return; pendingSave = m.data; if (!saveTimer) saveTimer = setTimeout(flushSave, 1500); break;
    case 'brb:score': {
      const helped = helpedScore; helpedScore = false;
      if (!d.canSave || Date.now() - lastScoreAt < 2000) return; lastScoreAt = Date.now();
      api(`/api/games/${d.gameId}/score`, { method: 'POST', body: { score: m.score, label: m.label || '' }, active: playing() }).then(r => { if (r.improved && r.best > 0) toast(t('js.play.newBest', { score: r.best }), { ms: 2200 }); }).catch(() => {});
      lessonEvent({ event: 'score', score: m.score, label: m.label || '', ...(helped ? { helped: true } : {}) });
      break;
    }
    case 'brb:gameover': {
      lessonEvent({ event: 'end', score: m.score, ...(m.won === true ? { won: true } : {}), ...(m.helped === true ? { helped: true } : {}) });
      helpedScore = m.helped === true;   // the SDK sends this set's score next: it goes with the same mark
      // The game ended without the assigned part won (Sum Racer reports every race's end; only 1st place
      // is a win): say so on the page, with the way back — the game's own results screen celebrates any
      // finish, so without this the student cannot tell a counted finish from an uncounted one.
      if (d.cstep && !m.won) showCourseBar('notyet');
      // A course step is finished only when its game reports the assigned chapter won: opening the module
      // merely started it. The endpoint checks server-side that this player passed the step's check and did
      // enter the game from the step, so this call alone completes nothing.
      if (m.won && d.cstep) api(`/api/courses/${d.cstep.course}/${d.cstep.step}/complete`, { method: 'POST', body: {} }).then(r => {
        // Number Quest moments (Tally Marks, the daily goal, a lap landing) as toasts: quick, cheerful,
        // gone on their own — the game keeps the screen.
        if (r && r.nq) {
          if (r.nq.marks && r.nq.marks.awarded) toast(`🐱 ${t('js.play.nqMarks', { marks: r.nq.marks.marks, total: r.nq.marks.total })}`);
          if (r.nq.dailyGoal && r.nq.dailyGoal.justMet) toast(`🌱 ${t('js.play.nqGoal')}`);
          if (r.nq.lap) toast(`🏅 ${t('js.play.nqLap', { lap: r.nq.lap.lap })}`);
        }
        showCourseBar('done');
      }).catch(e => {
        // A guest's win is not a completion (guests cannot complete courses): the server kept the win
        // and answered with the sign-in prompt, so the student hears that signing up is what counts it.
        if (e && e.data && e.data.needAccount) {
          const s = sheet({ title: t('js.play.guestWinTitle'), content: `<p>${esc(t('js.play.guestWin'))}</p>
            <p><a class="btn btn-primary btn-big" href="${esc(e.data.signup || '/signup')}">${esc(t('js.play.guestWinAction'))}</a></p>
            <p><button type="button" class="btn" id="guest-win-later">${esc(t('js.play.guestWinLater'))}</button></p>`, onClose: refocusGame });
          // Closing the sheet (Keep playing, the close button, Escape) gives the game its focus back: the sheet took it, the frame blurred, and a game that pauses on
          // blur (the kit) would otherwise leave the child on its Pause menu instead of its own win screen.
          const later = s.el.querySelector('#guest-win-later'); if (later) later.addEventListener('click', s.close);
          // The win is banked, not recorded: the bar offers the way back without claiming the step.
          showCourseBar('finished');
        } else {
          // Any other refusal (a precondition the page state disagreed with, a network failure) used to
          // vanish into this catch: the student saw a won game and an unfinished step and no reason.
          // Show the failure where the win was shown.
          showCourseBar('failed');
        }
      });
      break;
    }
    // "Back to class / Back to course" inside the game (BRB.back): the frame is sandboxed with an opaque
    // origin and cannot navigate the page itself, so the page goes back on its behalf. Only a course or
    // lesson launch has somewhere to go back to, and only on a real tap (the retry rule): a game must
    // never be able to yank the student out of a session on its own.
    // (inside Homeroom's layer, public/js/homeroom-player.js: the layer closes instead)
    case 'brb:back': if ((d.cstep || d.lesson || d.glRoom) && d.backHref && tappedJustNow()) { if (d.embed && parent !== window) parent.postMessage({ type: 'hr:close' }, location.origin); else location.href = d.backHref; } break;
    case 'brb:fullscreen': m.on ? goFull() : fs.exit(); break;
    case 'brb:orientation': if (m.value.startsWith('landscape')) { $('#orient').classList.add('show'); orientDismissed = false; orientSync(); } break;
    // "Try again" on the 3D card: reload the page, which makes a fresh frame link and sends the sign-in cookie.
    case 'brb:retry': if (tappedJustNow()) location.reload(); break;
    // BRB.copy: the frame can't use the clipboard (sandboxed), so the page copies for it, only right after a tap, and
    // only a link to this game's own play page (Algebra Builder's activity links) or a PNG picture (that link's QR code).
    case 'brb:copy': copyForGame(m); break;
    // BRB.saveQuestionSet (an official game that keeps question sets): the page saves it for the signed-in teacher.
    case 'brb:set-save': saveSetForGame(m); break;
    case 'brb:set-find': findSetForGame(m); break;
    case 'brb:sets': mySetsForGame(m); break;
    case 'brb:clues': cluesForGame(m); break;
    case 'brb:cards': cardsForGame(m); break;
    case 'brb:fpic-up': case 'brb:fpic-paint': case 'brb:fpic-get': case 'brb:fpic-state': flashPicForGame(m); break;
    case 'brb:flash': flashForGame(m); break;
    case 'brb:fshare': flashShareForGame(m); break;
    case 'brb:doc': docForGame(m); break;
    case 'brb:textdoc': textDocForGame(m); break;
    case 'brb:proofai': proofAiForGame(m); break;
    case 'brb:proof': proofForGame(m); break;
    // The Teacher plan's trial page (Mistake Hunt's daily AI cap), only right after a tap.
    case 'brb:trial': if (tappedJustNow('brb-trial-at', 2000)) location.href = '/trial'; break;
    // BRB.print (Crossword): the frame can't print, so the page does, only right after a tap.
    case 'brb:print': printForGame(m, tappedJustNow('brb-print-at', 2000)); break;
    // BRB.assign (a teacher in a set game): after a tap, the game's Assign page with the problem or set it opens at.
    // BRB.hostLive (a grown-up who may host, in a game whose door offers Host live): after a tap, the live game's setup
    // on /live, the mode the server named for this page; inside Homeroom's layer, Homeroom opens its own live layer.
    case 'brb:hostlive': if (/^[a-z-]{1,20}$/.test(d.hostLive || '') && tappedJustNow('brb-hostlive-at', 2000)) { if (d.embed && parent !== window) parent.postMessage({ type: 'hr:hostlive', mode: d.hostLive }, location.origin); else location.href = `/live?mode=${encodeURIComponent(d.hostLive)}`; } break;
    case 'brb:assign': if (typeof m.opts === 'string' && m.opts.length <= 200 && /^[a-z0-9=&-]*$/.test(m.opts) && tappedJustNow('brb-assign-at', 2000)) location.href = `/teach/assign?game=${encodeURIComponent(d.slug)}&opts=${encodeURIComponent(m.opts)}`; break;
  }
});
addEventListener('pagehide', () => { if (pendingSave) { navigator.sendBeacon && fetch(`/api/games/${d.gameId}/save`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: pendingSave }) }); } });

// ---- bar buttons ----
// Full screen: the Fullscreen API, or (iPhone Safari has none for a page, or a refused request) the stage filling the
// window with its own "✕ Exit full screen" button (public/js/fullscreen.js).
const fs = fullScreen(stage, { onEnter: () => { try { screen.orientation.lock && screen.orientation.lock(document.body.classList.contains('wants-landscape') ? 'landscape' : 'any').catch(() => {}); } catch { /* ignore */ } } });
const goFull = () => fs.enter();
$('#p-full').addEventListener('click', goFull);
// The turn-your-device hint (a dialog over the stage): while it is actually on screen — the CSS shows it only
// in portrait on a narrow screen — keyboard focus belongs on its OK button, not inside the game it covers
// (the game takes focus at load, and Tab would cycle through the covered game first). Dismissing hands focus
// back to the game frame, where play continues. On touch devices none of this is visible: the button just
// gains the focus a keyboard or switch user needs.
const orientEl = $('#orient'), orientOk = $('#orient-ok');
const orientMq = matchMedia('(orientation: portrait) and (max-width: 820px)');
let orientDismissed = false;
function orientSync() {
  if (!orientEl || !orientOk || orientDismissed) return;
  if (orientEl.classList.contains('show') && orientMq.matches && document.activeElement !== orientOk) orientOk.focus();
}
if (orientEl && orientOk) {
  orientSync();
  // The game takes focus for itself when its document loads — if the hint is up, take it back for the hint.
  frame.addEventListener('load', orientSync);
  orientMq.addEventListener && orientMq.addEventListener('change', () => {
    if (!orientMq.matches && orientEl.contains(document.activeElement)) frame.focus();
    orientSync();
  });
  orientOk.addEventListener('click', () => { orientDismissed = true; orientEl.classList.remove('show'); frame.focus(); });
}
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

// ---- Loudness (one official classroom game: page-data.mic; docs/safety.md "Loudness") ----
// The page, never the game frame, opens the microphone, and only after a real tap; the game gets one number at a time.
let loudBridge = null, loudLoading = null, loudGen = 0;
// The tap check for a start has its own short limit (a browser without navigator.userActivation), apart from Retry's.
const loudTapped = () => tappedJustNow('brb-loud-at', 3e3);
function loudMessage(m) {
  // hello is answered at once from page-data: the frame waits at most 800 ms, and a slow school network loading
  // loudness.js must not read as "no microphone here".
  if (m.op === 'hello' && !loudBridge) { toFrame({ type: 'brb:loudState', state: 'ready' }); return; }
  if (!loudLoading) loudLoading = import('/js/loudness.js').then(mod => { loudBridge = mod.bridge({ toFrame, stage, t, tapped: loudTapped }); return loudBridge; });
  // the tap is checked now, while it is fresh, not after the module has loaded
  const tap = m.op === 'start' ? loudTapped() : false, gen = loudGen;
  loudLoading.then(b => {
    // a start from a game that has since been reloaded or stopped is dropped: the new game never asked for it
    if (m.op === 'start' && gen !== loudGen) return;
    return b.message({ op: m.op }, tap);
  }).catch(() => toFrame({ type: 'brb:loudState', state: 'unavailable' }));
}
function stopLoud() { loudGen++; if (loudBridge) loudBridge.stop('stopped'); }

// ---- AI voices (docs/tts-design.md): the game frame can't fetch, so its lines come through here ----
// Only official games listed for voices, games the admin switched on and Builder games whose published version passed
// the safety scanner get d.tts (a token bound to this player and
// game); the server checks the game, the language and the words again. Any refusal, a timeout or the device choice: the frame is told no, and it uses the device's voice.
/** BRB.copy (docs/sdk.md): a link to this game's play page (any query, at most 400 characters) or a PNG of at most
 *  300 KB, after a tap. The answer goes back as brb:copied { id, ok }. */
async function copyForGame(m) {
  let ok = false;
  try {
    const own = `${location.origin}/play/${d.slug}`;
    const link = typeof m.text === 'string' && m.text.length <= 400 && (m.text === own || m.text.startsWith(own + '?'));
    const png = typeof Blob === 'function' && m.png instanceof Blob && m.png.type === 'image/png' && m.png.size <= 300 * 1024;
    if (tappedJustNow('brb-copy-at', 1000) && navigator.clipboard && (link || png)) {
      if (link) await navigator.clipboard.writeText(m.text);
      else await navigator.clipboard.write([new ClipboardItem({ 'image/png': m.png })]);
      ok = true;
    }
  } catch { ok = false; }
  if (typeof m.id === 'number') toFrame({ type: 'brb:copied', id: m.id, ok });
}
async function findSetForGame(m) {
  let out = { error: 'none' };
  const code = m.code.replace(/[^A-Za-z0-9-]/g, '');
  if (code) {
    try { const r = await api(`/api/games/${d.gameId}/sets/${encodeURIComponent(code)}`); out = { set: r.id, items: r.items }; }
    catch (e) { out = { error: e.status === 404 ? 'none' : 'offline' }; }
  }
  toFrame({ type: 'brb:set-found', id: m.id, ...out });
}
/** "My worksheets" (BRB.mySets, deleteQuestionSet, renameQuestionSet, duplicateQuestionSet): the signed-in teacher's own
 *  sets in this game. The answer goes back as brb:sets-done { id, sets } / { id, ok, title? } / { id, set, view } or
 *  { id, error } ('notAllowed', 'none', 'title', 'full', 'offline'). */
async function mySetsForGame(m) {
  const done = out => toFrame({ type: 'brb:sets-done', id: m.id, ...out });
  if (!d.signedIn) return done({ error: 'notAllowed' });
  const base = `/api/games/${d.gameId}/sets`, one = m.set ? `${base}/${encodeURIComponent(m.set)}` : '';
  try {
    if (m.op === 'list') { const r = await api(base); return done({ sets: Array.isArray(r.sets) ? r.sets : [] }); }
    if (m.op === 'delete') { await api(one, { method: 'DELETE' }); return done({ ok: true }); }
    if (m.op === 'rename') { const r = await api(`${one}/rename`, { method: 'POST', body: { title: m.title } }); return done({ ok: true, title: String(r.title ?? '') }); }
    const r = await api(`${one}/duplicate`, { method: 'POST', body: {} });
    return done({ set: r.id, view: r.set || null });
  } catch (e) {
    const code = e && e.data && e.data.code;
    done({ error: e && e.status === 404 ? 'none' : code === 'title' || code === 'full' ? code : e && e.status === 403 ? 'notAllowed' : 'offline' });
  }
}
/** Checked work (services/verify-change.js): when the AI's draft lost some of what it made to the checks, the page says
 *  how many were kept, so the list in the builder is never taken for the whole draft. */
function keptNote(r) {
  if (!r || !(r.asked > r.kept) || !(r.kept > 0)) return;
  toast(t('js.play.aiKept', { kept: r.kept, asked: r.asked }));
}
async function docForGame(m) {
  let out;
  try {
    const bytes = new Uint8Array(await m.file.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await api(`/api/games/${d.gameId}/words-from-doc`, { method: 'POST', body: { kind: m.kind, data: btoa(bin), level: m.level, ...(m.focus ? { focus: m.focus } : {}) } });
    out = { title: String(r.title || ''), words: Array.isArray(r.words) ? r.words.map(p => [String(p[0]), String(p[1])]) : [], cut: r.cut === true, ai: r.ai !== false };
    keptNote(r.report);
  } catch (e) { out = { error: (e.data && e.data.code) || (e.status ? 'aiFailed' : 'offline') }; }
  toFrame({ type: 'brb:doc-done', id: m.id, ...out });
}
async function textDocForGame(m) {
  let out;
  try {
    const bytes = new Uint8Array(await m.file.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await api(`/api/games/${d.gameId}/text-from-doc`, { method: 'POST', body: { kind: m.kind, data: btoa(bin) } });
    out = { text: String(r.text || ''), cut: r.cut === true };
  } catch (e) { out = { error: (e.data && e.data.code) || (e.status ? 'docBad' : 'offline') }; }
  toFrame({ type: 'brb:textdoc-done', id: m.id, ...out });
}
/** BRB.proofAsk (Mistake Hunt's AI tools): the server answers; the answer (or { error }) goes back as brb:proofai-done. */
// Oomba's chat on a set (Phase 3): 'chat' sends a message, 'chat-get' reads the conversation (asked every 2 s while a
// turn runs), 'chat-applied' says a change was put in the builder.
async function proofAiForGame(m) {
  let r;
  try {
    if (m.op === 'chat-get') r = await api(`/api/games/${d.gameId}/proof/chat${typeof m.body.setId === 'string' && m.body.setId ? `?setId=${encodeURIComponent(m.body.setId.slice(0, 40))}` : ''}`, { background: true });
    else r = await api(`/api/games/${d.gameId}/proof/${m.op === 'chat-applied' ? 'chat/applied' : m.op}`, { method: 'POST', body: m.body, active: playing(), ...(m.op === 'chat-applied' ? { background: true } : {}) });
  }
  catch (e) { r = { error: (e.data && e.data.code) || (e.status === 429 ? 'slow' : 'offline'), ...(e.data && e.data.left === 0 ? { left: 0 } : {}) }; }
  toFrame({ type: 'brb:proofai-done', id: m.id, r });
}
/** BRB.proofSave (a graded Mistake Hunt step): save or hand in the fixes; the step as it is now goes back. With hint (a
 *  passage index, when the teacher allowed hints) the server saves the fixes and answers the hint (it holds the key). */
async function proofForGame(m) {
  const done = out => toFrame({ type: 'brb:proof-done', id: m.id, ...out });
  // A Grammar Lab room (services/grammar-lab.js roomSave) hands in to Grammar Lab, which checks the fixes.
  if (d.glRoom) {
    try {
      const hint = Number.isInteger(m.hint) ? { hint: m.hint } : {};
      const r = await api(`/api/courses/grammar-lab/topic/${encodeURIComponent(d.glRoom.topic)}/room`, { method: 'POST', body: { unit: d.glRoom.unit, edits: m.edits, handIn: m.handIn === true, ...hint }, active: playing() });
      return done({ view: r.view, ...('hint' in hint ? { hint: r.hint || null } : {}) });
    } catch (e) { return done({ error: (e.data && e.data.code) || 'offline' }); }
  }
  if (!d.lesson || !d.lesson.proof) return done({ error: 'notAllowed' });
  try {
    const hint = Number.isInteger(m.hint) ? { hint: m.hint } : {};
    const r = await api(`/api/progress/${d.lesson.cl}/${d.lesson.step}/proofread`, { method: 'POST', body: { edits: m.edits, handIn: m.handIn, ...hint }, active: playing() });
    done({ view: r.view, ...('hint' in hint ? { hint: r.hint || null } : {}) });
  } catch (e) { done({ error: (e.data && e.data.code) || 'offline' }); }
}
/** BRB.print (docs/sdk.md "Printing"): the server checks the puzzle (its words and clues through the text filter, the
 *  layout, the answer key for teachers only) and makes the printable page in the viewer's language; it goes into a
 *  print area of its own on this page, which is all that prints (public/css/app.css "Printing"), and this page prints.
 *  The answer goes back as brb:printed { id, ok } or { id, error }. */
let printing = false;
async function printForGame(m, tapped) {
  const done = out => toFrame({ type: 'brb:printed', id: m.id, ...out });
  if (!d.print) return done({ error: 'notAllowed' });
  if (!tapped) return done({ error: 'tap' });
  if (printing) return done({ error: 'tap' });
  printing = true;
  try {
    const r = await api(`/api/games/${d.gameId}/print`, { method: 'POST', body: { doc: m.doc }, active: playing() });
    if (!r || typeof r.html !== 'string') throw new Error('bad');
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; area.className = 'print-area'; document.body.appendChild(area); }
    area.innerHTML = r.html;   // the server's own page: every word in it is escaped there
    // Flashcards' pictures: wait (a few seconds at most) for them to load, so they are on the paper.
    const imgs = [...area.querySelectorAll('img')].filter(i => !i.complete);
    if (imgs.length) await Promise.race([Promise.all(imgs.map(i => new Promise(ok => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); }))), new Promise(ok => setTimeout(ok, 4000))]);
    document.body.classList.add('printing');
    const after = () => { document.body.classList.remove('printing'); area.innerHTML = ''; removeEventListener('afterprint', after); };
    addEventListener('afterprint', after);
    done({ ok: true });
    window.print();
  } catch (e) {
    done({ error: e && e.data && (e.data.code === 'key' || e.data.code === 'bad') ? e.data.code : 'offline' });
  } finally { printing = false; }
}
async function cluesForGame(m) {
  let out;
  try { const r = await api(`/api/games/${d.gameId}/clues`, { method: 'POST', body: { words: m.words, level: m.level } }); out = { clues: Array.isArray(r.clues) ? r.clues.map(c => String(c)) : [] }; keptNote(r.report); }
  catch (e) { out = { error: (e.data && e.data.code) || (e.status ? 'aiFailed' : 'offline') }; }
  toFrame({ type: 'brb:clues-done', id: m.id, ...out });
}
async function cardsForGame(m) {
  let out;
  try {
    const r = await api(`/api/games/${d.gameId}/cards-ai`, { method: 'POST', body: { topic: m.topic, level: m.level, count: m.count } });
    out = { title: String(r.title || ''), cards: Array.isArray(r.cards) ? r.cards.map(c => [String(c[0]), String(c[1]), String(c[2] || '')]) : [] };
    keptNote(r.report);
  } catch (e) { out = { error: (e.data && e.data.code) || (e.status ? 'aiFailed' : 'offline') }; }
  toFrame({ type: 'brb:cards-done', id: m.id, ...out });
}
/** BRB.flashPics: Flashcards' pictures. The frame (an opaque origin) can't load our pictures, so the page fetches each
 *  one from our own route and hands it in as a data: URL (kept for this page's life). */
const flashPicCache = new Map();
async function flashPicForGame(m) {
  const done = out => toFrame({ type: 'brb:fpic-done', id: m.id, ...out });
  const base = `/api/games/${d.gameId}/flash-pics`;
  const fail = e => done({ error: (e && e.data && e.data.code) || (e && e.status ? 'failed' : 'offline') });
  try {
    if (m.type === 'brb:fpic-up') { const r = await api(base, { method: 'POST', body: { data: m.data } }); return done({ ref: String(r.ref), width: +r.width || 0, height: +r.height || 0 }); }
    if (m.type === 'brb:fpic-paint') { const r = await api(`${base}/paint`, { method: 'POST', body: { asks: m.asks } }); return done({ refs: (r.refs || []).map(x => (typeof x === 'string' ? x : null)), more: +r.more || 0, left: +r.left || 0 }); }
    if (m.type === 'brb:fpic-state') { const r = await api(`${base}/state?refs=${encodeURIComponent(m.refs.join(','))}`); return done({ pics: r.pics && typeof r.pics === 'object' ? r.pics : {} }); }
    const key = `${m.ref}|${m.set}`;
    if (flashPicCache.has(key)) return done({ url: flashPicCache.get(key) });
    const res = await fetch(`${base}/${m.ref.slice(4)}${m.set ? `?set=${m.set}` : ''}`, { credentials: 'same-origin' });
    if (res.status === 202) return done({ painting: true });
    if (!res.ok) return done({ error: 'none' });
    const blob = await res.blob();
    if (!/^image\/(jpeg|png)$/.test(blob.type)) return done({ error: 'none' });
    const url = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = no; fr.readAsDataURL(blob); });
    flashPicCache.set(key, url);
    done({ url });
  } catch (e) { fail(e); }
}
/** BRB.flashShare: Flashcards shared with a class. The server checks who may do what (services/flash-share.js). */
async function flashShareForGame(m) {
  const done = out => toFrame({ type: 'brb:fshare-done', id: m.id, ...out });
  if (!d.signedIn) return done({ error: 'none' });
  const base = `/api/games/${d.gameId}/flash-share`;
  try {
    if (m.op === 'mine') { const r = await api(`${base}/mine`); return done({ classes: Array.isArray(r.classes) ? r.classes : [], sets: r.sets && typeof r.sets === 'object' ? r.sets : {} }); }
    if (m.op === 'list') { const r = await api(`${base}/list`); return done({ list: String(r.list || ''), sets: Array.isArray(r.sets) ? r.sets : [] }); }
    if (m.op === 'set') { const r = await api(`${base}/${m.set}`, { method: 'POST', body: { classId: m.cls, on: m.on } }); return done({ classes: Array.isArray(r.classes) ? r.classes : [] }); }
    const r = await api(`${base}/${m.set}/hide`, { method: 'POST', body: { classId: m.cls, hidden: m.on } });
    done({ hidden: r.hidden === true, ok: true });
  } catch (e) { done({ error: (e && e.data && e.data.code) || (e && e.status === 404 ? 'none' : e && e.status ? 'failed' : 'offline') }); }
}
/** BRB.flashProgress: only a game opened from the student's lesson step passes card states on (services/flash-progress.js). */
async function flashForGame(m) {
  const done = out => toFrame({ type: 'brb:flash-done', id: m.id, ...out });
  if (!d.lesson || d.lesson.proof) return done({ error: 'notLesson' });
  try {
    const r = await api(`/api/progress/${d.lesson.cl}/${d.lesson.step}/flash`, { method: 'POST', body: { cards: m.cards }, active: playing() });
    done({ ok: true, mastered: r.mastered, n: r.n });
  } catch (e) { done({ error: e && e.status === 400 ? 'bad' : 'offline' }); }
}
async function saveSetForGame(m) {
  if (typeof m.id !== 'number') return;
  let out = { error: 'offline' };
  if (!d.signedIn) out = { error: 'guest' };
  else {
    try { const r = await api(`/api/games/${d.gameId}/sets`, { method: 'POST', body: { items: m.items, ...(typeof m.set === 'string' ? { id: m.set } : {}), ...(typeof m.title === 'string' ? { title: m.title } : {}) } }); out = { set: r.id }; }
    catch (e) { out = { error: (e.data && e.data.code) || (e.status ? 'bad' : 'offline') }; }
  }
  toFrame({ type: 'brb:set-saved', id: m.id, ...out });
}
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
  // BRB.aiVoiceCheck: would this line get the AI voice? (the server checks it; no audio is made)
  if (m.check) {
    const ok = !!(d.tts && d.tts.tok) && voiceMode() === 'ai' && await ttsCheck({ ctx: 'game', tok: d.tts.tok, text: m.text, lang: m.lang, role: m.role, rate: m.rate });
    toFrame({ type: 'brb:tts', id: m.id, ok, check: true });
    return;
  }
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

// A game's text box (Doodle Hoot's guess box): with an on-screen keyboard up, the stage fits what is still visible.
// Android shrinks the page itself (interactive-widget=resizes-content); iOS keeps it full height and slides it.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fitKeyboard = () => {
    document.body.classList.toggle('kb-up', vv.height < window.innerHeight * 0.8);
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    document.documentElement.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
  };
  vv.addEventListener('resize', fitKeyboard); vv.addEventListener('scroll', fitKeyboard);
}
