// The Studio: chat with the Builder, live preview in the player sandbox, versions, sharing and publishing.
// A build runs on the server whether or not this page is open: Send starts it (POST /chat answers at once) and the page
// follows it on one live stream (GET /live, "live stream" below), which replays a running build in full every time it
// connects, so a reload, another tab or another device shows the same build. After every build the page reads the
// Studio state again and redraws the chat from the saved transcript. Send stays on while a build runs: the message is
// a follow-up ("follow-ups" below) that the Builder reads at its next step.
import { api, toast, sheet, pageData, signedOut, tappedJustNow, setPlaceholder, $, $$, esc, copyText, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';

let S = pageData();
const ID = S.game.id;
/** The live stream and the build this page shows (section "live stream"). turnId: the running build drawn now;
 *  pendingCid: a message this tab sent that hasn't shown up as a build yet; check: a send whose answer never came. */
const LIVE = { ctrl: null, tries: 0, retry: 0, turnId: null, replaying: false, replayVersion: null, stopped: null, restart: false, hidden: false, pendingCid: null, posting: false, check: null, lastErr: null, carry: null };
const log = $('#st-log'), input = $('#st-input'), frame = $('#st-frame'), stage = $('#st-stage'), device = $('#st-device');
let pro = false;
try { pro = localStorage.getItem('brb-pro') === '1'; } catch { /* private mode */ }
const SIZES = { phone: [390, 760], tablet: [820, 1100], landscape: [844, 390] };
const VIS = { private: ['🔒', t('js.studio.vis.private')], friends: ['👫', t('js.studio.vis.friends')], class: ['🎒', t('js.studio.vis.class', { count: 2 })], school: ['🏫', t('js.studio.vis.school')], public: ['🌍', t('js.studio.vis.public')] };
/** [emoji, label] for a sharing level. 'class' says "My class" for one class and "My classes" for several. */
const visOf = (k, count = 1) => (k === 'class' ? ['🎒', t('js.studio.vis.class', { count })] : VIS[k] || ['', k]);
// Idea chips: keys a, b, c... under a prefix (missing letters are skipped).
const chipList = prefix => [...'abcdefgh'].map(k => t(`${prefix}.${k}`)).filter(x => !x.startsWith(prefix));
const START_CHIPS = chipList('js.studio.startChips');
const NEXT_CHIPS = chipList('js.studio.nextChips');
const when = at => { const d = new Date(at); return d.toLocaleDateString(INTL, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(INTL, { hour: 'numeric', minute: '2-digit' }); };
const safetyChip = s => ({ pass: `<span class="stchip good">✅ ${esc(t('js.studio.safety.chipPass'))}</span>`, flag: `<span class="stchip warn">⚠️ ${esc(t('js.studio.safety.chipFlag'))}</span>`, fail: `<span class="stchip bad">⛔ ${esc(t('js.studio.safety.chipFail'))}</span>` }[s] || '<span class="stchip">…</span>');

// ---------------------------------------------------------------- state + top
function applyState(st) { if (st) { S = { ...S, ...st }; renderTop(); renderLive(); renderSafety(); renderTurns(); } }
function renderTop() {
  $('#st-icon').textContent = S.game.icon;
  if (document.activeElement !== $('#st-title')) $('#st-title').value = S.game.title;
  const pb = $('#st-publish');
  const canUpdate = S.live && S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
  pb.classList.toggle('st-update', !!canUpdate);
  pb.classList.toggle('btn-hot', !S.live || !!canUpdate);
  pb.textContent = !S.live ? (S.pending ? `⏳ ${t('js.studio.top.inReview')}` : `🚀 ${t('js.studio.top.publish')}`) : canUpdate ? `⬆️ ${t('js.studio.top.update')}` : `✅ ${t('js.studio.top.live')}`;
  document.title = t('js.studio.docTitle', { title: S.game.title });
}
// Free messages left today of the daily ones; a child whose family plan pays extra messages also sees how many are left
// this month (a number only: no plan or money words on a child's page). In a class context (a school student, or a
// school's pool paying) only what is left today, never a total, so children in a class are never compared by plan.
function renderTurns() {
  // The class wording may still be the English fallback in this language (data-class-en): then it reads left to right.
  const el = $('#st-turns'), en = S.classContext && el.hasAttribute('data-class-en');
  if (en) { el.lang = 'en'; el.dir = 'ltr'; } else { el.removeAttribute('lang'); el.removeAttribute('dir'); }
  if (S.classContext) { $('#st-turns').textContent = `🔋 ${t('js.studio.turnsLeftToday', { left: Math.max(0, S.turnsLeft | 0) })}`; return; }
  const free = typeof S.freeLeft === 'number' ? S.freeLeft : S.turnsLeft;
  $('#st-turns').textContent = `🔋 ${t('js.studio.turns', { left: free, total: S.dailyTurns })}${typeof S.extraLeft === 'number' ? ` · ${t('js.studio.extra', { n: S.extraLeft })}` : ''}`;
}
const E = (key, vars) => esc(t(key, vars));
function renderLive() {
  const box = $('#st-live'); const parts = [];
  const cur = S.current ? `✏️ ${E('js.studio.live.editing', { number: S.current.number })}` : `✏️ ${E('js.studio.live.nothingYet')}`;
  if (S.game.hidden_reason) parts.push(`<p class="note">⚠️ ${E('js.studio.live.hidden')}</p>`);
  if (S.live) {
    // A class game: the classes it reaches right now (a class it was shared with stops counting when the builder leaves
    // it or a teacher takes the game off it).
    const reach = S.live.visibility === 'class' ? classShare().live : null;
    // A class game that reaches no class right now is, in effect, only for its builder: say so, and why.
    const [e, w] = reach && !reach.length ? ['🔒', t('js.studio.live.onlyYouNow')] : visOf(S.live.visibility, reach ? reach.length : 1);
    parts.push(`<span class="stchip good">🟢 ${E('js.studio.live.liveVersion', { number: S.live.number, who: `${e} ${w}` })}</span><span class="vtag">${cur}</span>`);
    if (reach) {
      const off = classShare().classes.filter(c => c.removed).map(c => c.name);
      if (reach.length) {
        parts.push(`<p class="st-shared">🎒 ${t('js.studio.live.sharedWith', { names: nameList(reach.map(c => c.name)) })}</p>`);
        if (off.length) parts.push(`<p class="note">🎒 ${t('js.studio.live.takenOffSome', { names: nameList(off) })}</p>`);
      } else {
        const why = off.length ? t('js.studio.live.takenOff', { names: nameList(off) }) : E('js.studio.live.leftClass');
        parts.push(`<p class="note">🎒 ${why} ${E('js.studio.live.pickAgain')}</p>`);
      }
    }
    const canUpdate = S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
    if (canUpdate) parts.push(`<button class="btn btn-hot btn-sm st-update" type="button" data-act="update">⬆️ ${E('js.studio.live.updateTo', { number: S.current.number })}</button>`);
    if (S.pending && S.pending.id === S.live.id) parts.push(`<p class="note">⏳ ${waitingText()}</p>`);
    else if (S.pending) parts.push(`<p class="note">⏳ ${E('js.studio.live.pendingUpdate', { pending: S.pending.number, live: S.live.number })}</p>`);
    else if (canUpdate) parts.push(`<p class="note info">${E('js.studio.live.playersOn', { live: S.live.number, number: S.current.number })}${S.live.visibility === 'public' ? ' ' + E('js.studio.live.publicCheck') : isGroup(S.live.visibility) && needsCheck(S.current.id) ? ' ' + E('js.studio.share.groupHint') : ''}</p>`);
  } else {
    parts.push(`<span class="stchip">${esc(S.status.label)}${S.status.code === 'draft' ? ' · ' + E('js.studio.live.onlyYou') : ''}</span><span class="vtag">${cur}</span>`);
    if (S.pending) parts.push(`<p class="note">⏳ ${E('js.studio.live.pendingNew', { number: S.pending.number })}</p>`);
  }
  if (S.game.review_note) parts.push(`<p class="note">💬 ${E('js.studio.live.reviewer', { note: S.game.review_note })}</p>`);
  box.innerHTML = parts.join('');
}
// ---- "Share with my classes": S.classShare comes from the server (server/routes/studio.js classShare):
// classes: the builder's classes now [{ id, name, school, chosen, removed }] (removed: a teacher took this game off that
// class, so it can't be picked), multiSchool: show school names, live: the classes a class game reaches right now.
const classShare = () => S.classShare || { classes: [], multiSchool: false, live: [], lost: 0 };
const LIST = typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(INTL, { type: 'conjunction' }) : null;
/** "5B, Art Club and Chess Club" in the reader's language. Class names are typed by teachers: escaped, and each kept
 *  whole inside right-to-left text. */
const nameList = names => (LIST ? LIST.formatToParts(names).map(p => (p.type === 'element' ? `<bdi>${esc(p.value)}</bdi>` : esc(p.value))).join('') : names.map(n => `<bdi>${esc(n)}</bdi>`).join(', '));
const isGroup = v => v === 'class' || v === 'school';
/** Would sharing this version with a class or the school wait for a person? Only a clean or approved version goes
 *  straight out (server/services/publish.js). */
const needsCheck = id => { const v = (S.versions || []).find(x => x.id === id); return !!v && v.safety === 'flag' && v.review !== 'approved'; };
/** The live version itself is waiting to be shared more widely: say with whom, and that nothing changes until then. */
function waitingText() {
  const want = S.pending.visibility || 'public';
  if (want === 'school') return E('js.studio.live.waitingSchool');
  if (want === 'class') return E('js.studio.live.waitingClass', { count: Math.max(1, classShare().classes.filter(c => c.chosen && !c.removed).length) });
  if (isGroup(S.live.visibility)) return E('js.studio.live.waitingPublic');
  return E(S.live.visibility === 'friends' ? 'js.studio.live.waitingFriends' : 'js.studio.live.waitingYou');
}
function renderSafety() {
  const box = $('#st-safety'); const c = S.current;
  if (!c) { box.innerHTML = ''; return; }
  const list = c.issues.length ? `<ul dir="ltr" lang="en">${c.issues.map(i => `<li>${esc(i.message)}</li>`).join('')}</ul>` : '';
  const fixBtn = `<button class="btn btn-sm" type="button" data-act="fix">🛠️ ${E('js.studio.fixButton')}</button>`;
  if (c.safety === 'pass') box.innerHTML = `✅ ${E('js.studio.safety.pass', { number: c.number })}`;
  else if (c.safety === 'flag') box.innerHTML = `⚠️ ${E('js.studio.safety.flag', { number: c.number })} ${fixBtn}${list}`;
  else if (c.safety === 'fail') box.innerHTML = `⛔ ${E('js.studio.safety.fail', { number: c.number })} ${fixBtn}${list}`;
  else box.innerHTML = E('js.studio.safety.checking', { number: c.number });
}

// ---------------------------------------------------------------- preview
let size = 'phone';
try { size = localStorage.getItem('brb-prev-size') || 'phone'; } catch { /* ignore */ }
if (!SIZES[size]) size = 'phone';
function fit() {
  const [w, h] = SIZES[size]; const r = stage.getBoundingClientRect();
  const k = Math.min((r.width - 28) / w, (r.height - 28) / h, 1);
  device.style.setProperty('--w', w + 'px'); device.style.setProperty('--h', h + 'px'); device.style.setProperty('--k', Math.max(0.2, k).toFixed(3));
  device.dataset.size = size;
  $$('[data-size]', $('.st-prev-head')).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
}
$$('.st-prev-head [data-size]').forEach(b => b.addEventListener('click', () => { size = b.dataset.size; try { localStorage.setItem('brb-prev-size', size); } catch { /* ignore */ } fit(); }));
if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else addEventListener('resize', fit);
fit();
let shownVersion = S.current ? S.current.id : null;   // the version in the preview frame now
/** Show a version in the preview (vid: its id, so the same version isn't loaded twice). */
function setPreview(url, vid = null) {
  if (!url) return;
  S.preview = url; $('#st-empty').hidden = true; shownVersion = vid;
  frame.src = url;
}
const reloadPreview = () => { frame.src = 'about:blank'; setTimeout(() => (frame.src = S.preview), 30); };
$('#st-reload').addEventListener('click', () => { if (!S.preview) return toast(t('js.studio.buildFirst')); reloadPreview(); });
// "Try again" in a game (brb:retry): reload the preview from here, with a fresh link (a reload the frame starts itself
// has no sign-in cookie, so the server refuses it).
async function retryPreview() {
  try { const st = await api(`/api/studio/${ID}`); if (st.preview) S.preview = st.preview; } catch { /* keep the old link */ }
  if (S.preview) reloadPreview();
}
const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => toast(t('js.studio.noFullscreen'), { bad: true })); };
$('#st-full').addEventListener('click', full);
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data || e.data.brb !== 1) return; // only our sandboxed preview
  if (e.data.type === 'brb:fullscreen') { if (!!e.data.on !== !!document.fullscreenElement) full(); }
  else if (e.data.type === 'brb:gameover' && typeof e.data.score === 'number') toast(t('js.studio.roundOver', { score: e.data.score }));
  else if (e.data.type === 'brb:retry' && tappedJustNow()) retryPreview();
});

// ---------------------------------------------------------------- chat log
const scrollDown = () => { log.scrollTop = log.scrollHeight; };
const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
/** Add to the chat. While a turn runs its steps card stays last, so replies and cards build up above it (renderLog()
 *  empties the log and leaves the card detached, hence the parentNode check). What is drawn for the running build is
 *  marked with its id (data-live), so a full replay can take away exactly what it draws again. */
let drawingLog = false;
function place(el) {
  if (LIVE.turnId && !drawingLog && !el.dataset.live) el.dataset.live = LIVE.turnId;
  log.insertBefore(el, live && live.el.parentNode === log ? live.el : null); return el;
}
function bubble(cls, text) { const d = document.createElement('div'); d.className = `msg ${cls}`; d.dir = 'auto'; d.textContent = text || ''; return place(d); }
function attHtml(list) {
  return `<div class="att-list">${list.map(u => `<span class="att">${u.kind === 'image' ? `<img src="/api/studio/${ID}/uploads/${esc(u.id)}" alt="">` : `<span class="fi" aria-hidden="true">${u.kind === 'pdf' ? '📄' : '📝'}</span>`}<span class="nm">${esc(u.name)}</span></span>`).join('')}</div>`;
}
function userBubble(text, uploads = []) {
  const d = bubble('me', text);
  if (uploads.length) d.insertAdjacentHTML('beforeend', attHtml(uploads));
  return d;
}
function card(cls, inner) { const d = document.createElement('div'); d.className = `ev ${cls}`; d.innerHTML = inner; return place(d); }
function versionCard(v, live = false) {
  const fail = v.status === 'fail';
  const d = card(`version ${fail ? 'fail' : ''}`, `<span class="evh">🎮 ${E(fail ? 'js.studio.log.versionFailed' : 'js.studio.log.versionReady', { number: v.number })}</span><span dir="auto">${esc(v.notes)}</span>
    <span class="row">${safetyChip(v.status)}${live ? `<button class="btn btn-sm" type="button" data-act="see">👀 ${E('js.studio.log.seeIt')}</button>` : ''}${fail && live ? `<button class="btn btn-sm" type="button" data-act="fix">🛠️ ${E('js.studio.fixButton')}</button>` : ''}</span>`);
  return d;
}
function notesCard(list) { return card('notes', `<span class="evh">🧪 ${E('js.studio.log.thingsToTry')}</span><ul dir="auto">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); }
function metaCard(m) { return card('meta', `<span>${esc(m.icon)} ${t('js.studio.log.namedIt', { title: `<b>${esc(m.title)}</b>` })}</span>`); }
function chips(options, active) {
  const d = document.createElement('div'); d.className = 'qchips' + (active ? '' : ' used');
  d.innerHTML = options.map(o => `<button class="chip" type="button" data-chip="${esc(o)}">${esc(o)}</button>`).join('');
  return place(d);
}
function askBlock(a, active, into) {
  const b = into || bubble('bot', '');
  const q = document.createElement('span'); q.className = 'q'; q.textContent = a.question; b.appendChild(q);
  if (a.options && a.options.length) chips(a.options, active);
}
const note = (text, cls = '') => bubble(`note${cls ? ' ' + cls : ''}`, text);
/** One saved transcript entry (renderLog, and a running build's own entries in startTurnUI). last: its question's
 *  chips can still be tapped. */
function drawEntry(m, last = false) {
  if (m.role === 'user' && m.followUp) { fuBubble(m.text, { id: m.id, cid: m.cid, state: m.refused ? 'refused' : m.status, why: m.why, by: m.by, move: true }); return; }
  if (m.role === 'user') { userBubble(m.text, m.uploads || []); return; }
  const events = m.events || [];
  // Notes that belong before the reply: the server restarted and the Builder carried on; follow-ups started this build.
  for (const [name, d] of events) {
    if (name === 'resumed') note(d && d.v ? t('js.studio.resumedV', { v: d.v }) : t('js.studio.resumed'));
    else if (name === 'carried') carriedNote();
  }
  const b = m.text || m.open ? bubble('bot' + (m.refused ? ' refused' : ''), m.text) : null;
  // The running build's sentence a follow-up came in the middle of (it sits below): the reply streams on into it.
  if (m.open) { botCur = b; botOpen = fuHeld = true; }
  for (const [name, d] of events) {
    if (name === 'version') versionCard(d, false);
    else if (name === 'notes') notesCard(d.checklist);
    else if (name === 'meta') metaCard(d);
    else if (name === 'ask') askBlock(d, last, b && !b.nextSibling ? b : null);
    else if (name === 'error') bubble('err', d.message);
    else if (name === 'stopped') note(t(`js.studio.stopped.${d && d.why === 'ai' ? 'ai' : 'restart'}`), 'stopped');
    else if (name === 'steps') { const c = stepsCard(d); if (c) place(c); }   // folded; rows are built when opened
  }
}
/** Under the last build when it ended early: whether it used a turn, "Carry on building", and the words of a message
 *  that never reached the Builder ("Put it back in the box"). */
function drawLastTurn(msgs) {
  const lt = S.lastTurn; if (!lt || S.turn) return;
  if (!msgs.length || msgs[msgs.length - 1].turn !== lt.id) return;   // only right after that build's own entries
  if (lt.refunded) note(t('js.studio.notCounted'));
  if (!lt.cont && !lt.putBack) return;
  const row = document.createElement('div'); row.className = 'st-cont';
  if (lt.cont) row.insertAdjacentHTML('beforeend', `<button class="btn btn-primary st-contbtn" type="button" data-act="continue">▶️ ${E('js.studio.continue')}</button>`);
  if (lt.putBack) row.insertAdjacentHTML('beforeend', `<button class="btn st-contbtn" type="button" data-act="putback">✏️ ${E('js.studio.followups.putBack')}</button>`);
  place(row);
}
/** "The AI Builder is resting… back tomorrow at 1:00 AM" in the reader's own time zone and language. */
function restingText(until) {
  const d = new Date(until), now = new Date();
  const time = d.toLocaleTimeString(INTL, { hour: 'numeric', minute: '2-digit' });
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day0(d) - day0(now)) / 864e5);
  const when = days <= 0 ? t('js.studio.resting.today', { time }) : days === 1 ? t('js.studio.resting.tomorrow', { time })
    : t('js.studio.resting.date', { date: d.toLocaleDateString(INTL, { weekday: 'long', month: 'short', day: 'numeric' }), time });
  return t('js.studio.resting.text', { when });
}
/** The resting note, once: sending again while it rests moves the same note to the bottom instead of repeating it. */
let restingEl = null;
function restingNote() {
  if (restingEl && restingEl.isConnected) { log.appendChild(restingEl); return; }
  restingEl = bubble('bot', restingText(S.resting));
}
function renderLog() {
  restingEl = null;
  if (live) live.remove();
  const flying = $$('.msg.fu', log).filter(e => FLYING.has(e.dataset.state));   // follow-ups whose answer hasn't come
  log.innerHTML = '';
  // The running build's own entries are drawn by startTurnUI, with its live card.
  const tid = S.turn && S.turn.id;
  const msgs = (S.chat || []).filter(m => !tid || m.turn !== tid);
  drawingLog = true;
  try {
    msgs.forEach((m, i) => drawEntry(m, i === msgs.length - 1 && !tid));
    drawLastTurn(msgs);
    // The site's AI budget is spent for now: say when the Builder is back instead of asking what to build.
    if (S.resting && !S.turn) restingNote();
    else if (!msgs.length && !S.turn) {
      if (!S.current) { askBlock({ question: t('js.studio.log.whatKind') }, true, bubble('bot', t('js.studio.log.hello'))); chips(START_CHIPS, true); }
      else { bubble('bot', t('js.studio.log.readyToPlay', { title: S.game.title })); chips(NEXT_CHIPS, true); }
    }
  } finally { drawingLog = false; }
  for (const b of flying) if (!fuFind(b.dataset.fu, b.dataset.cid)) place(b);
  scrollDown();
}

// ---------------------------------------------------------------- build steps card ("Behind the scenes")
// What the Builder is really doing, from the server's own events, in the order they happen: step {i, key, ...facts}
// starts row i, stepinfo {i, ...facts} updates row i (not always the newest: a failed edit marks its own row later).
// While the turn runs, the card shows the latest rows. The running row has ONE 💡 line: a "Just now" line for a step
// that was over in a flash (the safety program, naming the game…), then the step's own line, then (once a turn) what
// thinking is, then on a long AI step a "Did you know?" fact. When the turn ends the card folds into a one-line summary
// drawn from the record that 'done' carries, which is also saved as the reply's last event, so a reload draws the same.
// Model text (the AI's plan, a game title) is only ever set with textContent. Nothing here is timer-driven except the
// seconds, the order of the 💡 lines and when the card appears: every row is a real server step (or the page's own
// sending/offline/waiting/restart). Rows carry the server's own times (step.at), so a replay shows real durations.
// The top of the live card ("eta" below): how long builds like this usually take, from the server's numbers (eta.js),
// and that the builder can close the page or sign out. Both appear at the first real authoring step or once the build
// has lasted the estimate's showAt (LEAVE_AT without one), so a quick question reply never flashes them.
const STEP_ICON = { screen: '🛡️', blocks: '🧱', think: '🧠', write: '✍️', edit: '✏️', fix: '🛠️', template: '🏝️', check: '🔒', name: '🏷️', playtest: '📱', notes: '🧪', ask: '💬', resume: '🔄', read: '📬', sending: '📨', offline: '📶', waiting: '⏳', restart: '🔄' };
const SERVER_STEPS = new Set(['screen', 'blocks', 'think', 'write', 'edit', 'fix', 'template', 'check', 'name', 'playtest', 'notes', 'ask', 'resume', 'read']);
// Timed rows run until the next row starts (spinner, seconds); the others take milliseconds and arrive done.
const TIMED = new Set(['screen', 'blocks', 'think', 'write', 'edit', 'fix', 'playtest', 'sending', 'offline', 'waiting', 'restart']);
const AUTHOR = new Set(['write', 'edit', 'fix']);
// An instant row's learning line is shown under the next timed row ("Just now: …"): one per row, most useful first,
// each at most once a turn.
const JUST_NOW = ['check', 'read', 'template', 'notes', 'name', 'ask'];
const THINK_WHY = new Set(['start', 'look', 'scan', 'retry', 'next', 'msg']);
const FACTS = [...'abcdefghijk'];
const TIP_JUST = 6000, TIP_OWN = 8000, TIP_THINK = 8000, TIP_FACT = 11000;
const LONG_AT = 45000, TIP_LONG = 15000;   // a round still planning after 45 s says that big ideas take a while   // how long each 💡 line stays
const SHOW_AFTER = 700;    // the live card appears once a turn has lasted this long (a quick turn goes straight to its summary)
const MIN_SHOWN = 1200;    // once shown, it stays at least this long before it folds (no flash)
const SEC_AFTER = 3000;    // a running step's seconds appear after 3 s ("0 sec" reads as stuck)
const LEAVE_AT = 8000;     // with no estimate: "You can close this page…" appears once a build has lasted this long
const ETA_AUTHOR = new Set(['write', 'edit', 'fix', 'template', 'check']);   // real building: the estimate shows at once
const narrow = matchMedia('(max-width: 520px)');   // phones: one finished row above the running one, not two
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let factNext = Math.floor(Math.random() * FACTS.length);   // carries on across turns, so each turn shows new facts
let live = null;                                // the steps card of the turn in progress
let stepSeq = 0;
let tipsOn = true;
try { tipsOn = localStorage.getItem('brb-tips') !== '0'; } catch { /* private mode: tips stay on */ }
log.classList.toggle('tips-off', !tipsOn);

const ST = (k, vars) => t(`js.studio.steps.${k}`, vars);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hide = e => { e.setAttribute('aria-hidden', 'true'); return e; };
/** An element with a decorative emoji (hidden from screen readers) before its text, and an optional bold lead-in. */
const withIcon = (el, icon, text, lead) => { el.textContent = ''; el.append(hide(mk('span', null, icon)), ' '); if (lead) el.append(mk('b', null, lead), ' '); el.append(text); return el; };
const units = new Map();
const unit = (u, n, digits) => {
  const k = `${u}${digits}`; let f = units.get(k);
  if (!f) { f = new Intl.NumberFormat(INTL, { style: 'unit', unit: u, unitDisplay: 'short', maximumFractionDigits: digits }); units.set(k, f); }
  return f.format(n);
};
/** 600 -> "0.6 sec", 38000 -> "38 sec", 84000 -> "1 min 24 sec", in the reader's language, never broken across lines.
 *  whole: no tenths (live). */
function fmtDur(ms, whole = false) {
  const s = Math.max(0, +ms || 0) / 1000;
  let out;
  try {
    if (s < 60) out = s < 10 && !whole ? unit('second', s, 1) : unit('second', Math.floor(s), 0);
    else {
      const m = Math.floor(s / 60), r = Math.floor(s % 60);
      const parts = [unit('minute', m, 0)]; if (r) parts.push(unit('second', r, 0));
      out = new Intl.ListFormat(INTL, { type: 'unit', style: 'narrow' }).format(parts);
    }
  } catch { out = `${Math.round(s)}s`; }
  return out.replace(/ /g, ' ');
}
const isolate = s => `⁨${s}⁩`;   // a game title in the reader's sentence keeps its own direction
/** done: past wording ("Wrote the game code"); a running, stopped or interrupted row keeps the present wording. */
function stepLabel(k, f, done) {
  if (f.why === 'cut') return ST('cut');
  if (f.ok === false && (AUTHOR.has(k) || k === 'playtest')) return ST(`${k === 'fix' ? (f.via === 'edit' ? 'edit' : 'write') : k}.failed`);
  if (k === 'think') {
    const why = THINK_WHY.has(f.c) ? f.c : 'next';
    // Round 1 says "reading" only until the AI starts answering; after that it is planning (it may think for a while).
    const plan = why === 'start' && (f.a || f.th);
    return ST(`think.${done ? 'done' : 'now'}.${plan ? (f.g ? 'planGame' : 'plan') : why === 'start' && f.g ? 'startGame' : why}`, { n: f.n || 1, m: f.m || 1 });
  }
  if (k === 'check') return ST(`check.${['pass', 'flag', 'fail'].includes(f.st) ? f.st : 'flag'}`, { v: f.v || 1, k: f.k || 1 });
  if (k === 'name') {
    const title = f.title ? isolate(f.title) : '', icon = f.icon || '';
    return title && icon ? ST('name.titleIcon', { title, icon }) : title ? ST('name.title', { title }) : icon ? ST('name.icon', { icon }) : ST('name.details');
  }
  if (k === 'template' || k === 'notes' || k === 'ask') return ST(`${k}.done`);
  if (k === 'resume') return f.v ? ST('resume.doneV', { v: f.v }) : ST('resume.done');
  if (k === 'read') return ST('read.done', { m: f.m || 1 });
  if (k === 'restart') return ST(f.resume ? 'restart.now' : 'restart.saved');
  if (k === 'sending') return ST('sending');
  if (k === 'offline') return ST(f.unsure ? 'offline.check' : 'offline.now');
  if (k === 'waiting') return ST('waiting.now');
  return ST(`${k}.${done ? 'done' : 'now'}`);   // screen, blocks, write, edit, fix, playtest
}
/** The facts worth showing next to the label: lines or changes written, pictures and problems. Never seconds. */
function stepDetail(k, f) {
  const out = [];
  if ((k === 'write' || k === 'fix') && f.l) out.push(ST('lines', { count: f.l }));
  if ((k === 'edit' || k === 'fix') && f.e) out.push(ST('edits', { count: f.e }));
  if (k === 'playtest' && typeof f.pics === 'number') { out.push(ST('pics', { count: f.pics })); if (typeof f.probs === 'number') out.push(ST('probs', { count: f.probs })); }
  return out.join(' · ');
}
/** A row's own learning line ('' for none). A round's line follows why it started, never the thinking. */
function ownLearn(k, f) {
  if (k === 'sending' || (k === 'offline' && f.unsure)) return '';
  if (k === 'offline' || k === 'waiting') return ST('offline.learn');
  if (k === 'think') return ST(`think.learn.${THINK_WHY.has(f.c) ? f.c : 'next'}`);
  return ST(`${k}.learn`);
}
const tipsLabel = b => withIcon(b, '💡', ST(tipsOn ? 'tipsOn' : 'tipsOff'));
function tipsBtn() { const b = tipsLabel(mk('button', 'stp-tips')); b.type = 'button'; b.title = ST('tipsHint'); return b; }
function setTips(on) {
  tipsOn = on; log.classList.toggle('tips-off', !on);
  try { localStorage.setItem('brb-tips', on ? '1' : '0'); } catch { /* not saved: still works for this page */ }
  $$('.stp-tips', log).forEach(tipsLabel);
  if (live) live.retip();
}
let sayQ = [], sayTimer = 0;
/** Screen readers hear step changes only (a new step, the plan, a problem, the estimate, the summary), never counters
 *  or seconds. Changes that come within 0.4 s are read as one message: at most three steps, and a problem is never
 *  dropped. add: joined to whatever else is said then, never dropped (the estimate, so a step can't swallow it). */
function announce(text, urgent = false, add = false) {
  if (LIVE.replaying) return;   // a replay is caught up silently; the current step is read once at the end
  sayQ.push({ text, urgent, add });
  if (!sayTimer) sayTimer = setTimeout(sayNow, 400);
}
function sayNow() {
  sayTimer = 0;
  const box = $('#st-steps-live'), q = sayQ; sayQ = [];
  if (!box || !q.length) return;
  const urgent = q.filter(x => x.urgent).slice(-2), rest = q.filter(x => !x.urgent && !x.add).slice(urgent.length - 3);
  box.textContent = q.filter(x => x.add || urgent.includes(x) || rest.includes(x)).map(x => x.text).join('. ');
}
/** Forget what was waiting to be read (keepUrgent: but not the problems). */
function hush(keepUrgent = false) {
  sayQ = keepUrgent ? sayQ.filter(x => x.urgent) : [];
  if (!sayQ.length) { clearTimeout(sayTimer); sayTimer = 0; }
}
/** Scroll the chat just enough to show el (its top first when it is taller than the chat). */
function reveal(el) {
  const lr = log.getBoundingClientRect(), er = el.getBoundingClientRect();
  let dy = er.bottom > lr.bottom ? er.bottom - lr.bottom : 0;
  if (er.top - dy < lr.top) dy = er.top - lr.top;
  if (dy) log.scrollBy({ top: dy, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

const ETA = (k, vars) => t(`js.studio.eta.${k}`, vars);
let minutesF = null;
/** 2 -> "2 minutes", (1, 2) -> "1–2 minutes", in the reader's language (the browser's own plurals and ranges). */
function minutes(lo, hi = lo) {
  try {
    if (!minutesF) minutesF = new Intl.NumberFormat(INTL, { style: 'unit', unit: 'minute', unitDisplay: 'long' });
    if (lo === hi) return minutesF.format(hi);
    return typeof minutesF.formatRange === 'function' ? minutesF.formatRange(lo, hi) : `${new Intl.NumberFormat(INTL).format(lo)}–${minutesF.format(hi)}`;
  } catch { return lo === hi ? `${hi} min` : `${lo}–${hi} min`; }
}
/** The estimate line for a state. e: { s: the start payload, tail }. "Usually" only when the numbers come from timed
 *  builds (src 'data'); a first guess says "About" and "may". */
function etaWords(state, e) {
  const s = e.s, guess = s.src !== 'data';
  if (state === 'big' || state === 'longer') return ETA(state);
  if (state === 'msg') return ETA('newMsg');
  if (state === 'tail') return e.tail.show === 'under' ? ETA(guess ? 'tailGuessUnder' : 'tailUnder') : ETA(guess ? 'tailGuessAbout' : 'tailAbout', { time: minutes(e.tail.n || 1) });
  if (guess) return ETA('guess', { time: s.show === 'range' ? minutes(s.lo, s.hi) : minutes(s.hi || 1) });
  return s.show === 'under' ? ETA('under') : s.show === 'about' ? ETA('about', { time: minutes(s.hi) }) : ETA('range', { time: minutes(s.lo, s.hi) });
}

const views = new WeakMap();   // <li> -> the parts of the row that live updates change in place
/**
 * Draw one row into its <li>. o: { key, f, done, paused, stopped, current, open, live, spoke, showPlan, dur, toggle }
 *   current: the newest row of a live card (a plain line with the 💡 slot; not a button)
 *   done:    finished (a running timed row has done = false: spinner, live seconds)
 *   paused:  the connection dropped while it ran, so nobody here knows how it ended: present wording, no spinner, no ✓
 *   open:    a finished row tapped open (its learning lines, and its plan)
 *   live:    in the live card (finished rows there are one short line, without seconds)
 * The row is rebuilt only when its shape changes; words and numbers are updated in place, so the spinner keeps turning
 * and a text selection or a screen reader's place survives the live counters. -> the row's parts.
 */
function drawRow(li, o) {
  const { key: k, f } = o;
  const running = !o.done && !o.paused;
  const warn = o.stopped || f.ok === false || (k === 'check' && f.st === 'fail');
  const state = running ? 'now' : o.paused ? 'paused' : warn ? 'warn' : 'done';
  const label = stepLabel(k, f, !running && !o.paused && !o.stopped);
  const facts = stepDetail(k, f);
  const th = k === 'think' && f.th ? ST(running && !o.spoke ? 'thinkingNow' : 'thoughtFirst') : '';
  const sec = TIMED.has(k) && k !== 'sending' && (running || (!o.live && o.dur >= 100));
  const plan = AUTHOR.has(k) && f.plan && (o.current || o.open || o.showPlan) ? f.plan : '';
  const asked = o.open ? [ownLearn(k, f), k === 'think' && f.th ? ST('think.learn.thinking') : ''].filter(Boolean) : [];
  const button = !o.current && !!(asked.length || plan || ownLearn(k, f) || (AUTHOR.has(k) && f.plan));
  const sig = state + [o.current, o.open, button, plan, th, facts, sec, o.stopped].map(x => +!!x).join('');
  let v = views.get(li);
  if (v && v.sig === sig) {   // same shape: only words and numbers change
    if (v.label.textContent !== label) v.label.textContent = label;
    if (v.facts && v.facts.textContent !== facts) v.facts.textContent = facts;
    if (v.th && v.th.lastChild.textContent !== th) v.th.lastChild.textContent = th;
    if (v.plan && v.plan.textContent !== plan) v.plan.textContent = plan;
    return v;
  }
  const hadFocus = li.contains(document.activeElement);
  li.dataset.state = state;
  li.classList.toggle('stp-cur', !!o.current);
  if (o.current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  li.textContent = '';
  v = { sig, label: mk('span', 'stp-label', label) };
  const line = mk(button ? 'button' : 'div', 'stp-line');
  if (button) { line.type = 'button'; line.setAttribute('aria-expanded', String(!!o.open)); if (o.toggle) line.addEventListener('click', o.toggle); }
  const text = mk('span', 'stp-text');
  text.append(v.label);
  if (th || facts || sec) {
    // Parts are separated by " · " in CSS. The 🤔 is a visible word too (no tooltip on phones).
    const d = mk('span', 'stp-detail');
    if (th) { v.th = mk('span', 'stp-th'); v.th.append(hide(mk('span', null, '🤔')), ' ', mk('span', null, th)); d.append(v.th); }
    if (facts) { v.facts = mk('span', null, facts); d.append(v.facts); }
    if (sec) {
      v.sec = mk('span', 'stp-sec', running ? fmtDur(Date.now() - o.at, true) : fmtDur(o.dur));
      if (running) { hide(v.sec); v.sec.classList.toggle('stp-wait', Date.now() - o.at < SEC_AFTER); }   // seconds tick: not for screen readers
      d.append(v.sec);
    }
    text.append(' ', d);
  }
  if (o.stopped) text.append(' ', mk('span', 'stp-stop', ST('stoppedHere')));
  const mark = mk('span', 'stp-mark');
  if (running) { if (o.current) mark.append(hide(mk('span', 'stp-spin'))); mark.append(mk('span', 'sr-only', ST('srNow'))); }
  else if (o.paused) mark.append(hide(mk('span', null, '…')), mk('span', 'sr-only', ST('srPaused')));
  else if (warn) mark.append(hide(mk('span', null, '⚠️')), mk('span', 'sr-only', ST('srWarn')));
  else mark.append(hide(mk('span', null, '✓')), mk('span', 'sr-only', ST('srDone')));
  line.append(hide(mk('span', 'stp-ico', STEP_ICON[k] || '•')), text, mark);
  li.append(line);
  if (plan) {
    const p = mk('p', 'stp-plan'); v.plan = mk('span', null, plan); v.plan.dir = 'auto';
    p.append(mk('b', null, ST('planLabel')), ' ', v.plan); li.append(p);
  }
  // A tapped row always shows its lines (Tips off only stops the automatic ones).
  for (const x of asked) li.append(withIcon(mk('p', 'stp-learn stp-asked'), '💡', x));
  if (o.current) { v.tip = mk('p', 'stp-learn stp-tip'); li.append(v.tip); }
  li.classList.toggle('stp-pad', !!(plan || asked.length || o.current));
  if (hadFocus && button) line.focus({ preventScroll: true });
  views.set(li, v);
  return v;
}

/** The live card for one turn. add/patch take the server's step/stepinfo; local() adds the page's own rows. */
function liveSteps() {
  const el = mk('div', 'ev stp'); el.dataset.state = 'live';
  el.setAttribute('aria-live', 'off');   // inside the role=log region: announced through #st-steps-live instead
  const head = mk('div', 'stp-head');
  const more = mk('button', 'stp-more'); more.type = 'button'; more.hidden = true; more.setAttribute('aria-expanded', 'false');
  head.append(withIcon(mk('span', 'stp-title'), '🔎', ST('title')), more, tipsBtn());
  // The top of the card: the estimate (its learning line is a tip), and that the builder can leave while the build goes
  // on (not a tip: it shows with tips off too).
  const eta = mk('div', 'stp-eta'); eta.hidden = true;
  const etaLine = mk('p', 'stp-eta-line'), etaLearn = mk('p', 'stp-learn stp-eta-learn');
  etaLine.hidden = etaLearn.hidden = true;
  eta.append(etaLine, etaLearn, withIcon(mk('p', 'stp-leave'), '🌙', ST('leave')));
  // Follow-ups waiting to be read: what happens to them, and what they cost (not tips: shown with tips off too).
  const strip = mk('div', 'stp-inbox'); strip.hidden = true;
  const list = mk('ol', 'stp-list');
  el.append(head, eta, strip, list);
  const rows = [], byI = new Map();
  const turn = { justShown: new Set(), thinkShown: false };   // 💡 lines already shown this turn
  let expanded = false, mode = null, pillEl = null, shownAt = 0, heard = false, stopped = false;
  let t0 = Date.now();   // when the build started (anchor(): the server's clock, so a replay keeps its real times)
  // The estimate: est = { s: start payload, overAt, bigAt (only ever later), tail, msg }; authoring: a real build step
  // came; said: what was last read out (the line and the leave line are read once together, then each change once).
  let est = null, authoring = false, said = '', leaveSaid = false;
  const newest = () => rows[rows.length - 1];
  const paint = r => drawRow(r.li, { key: r.key, f: r.f, done: r.done, paused: r.paused, stopped: r.stopped, current: r === newest(), open: r.open, live: true, spoke: r.spoke, at: r.at, toggle: r.toggle });
  function show() {
    clearTimeout(showTimer);
    if (shownAt || !timer) return;
    const stick = nearBottom();
    log.appendChild(el); shownAt = Date.now(); retip(newest()); etaTick();
    if (stick) scrollDown();
  }
  /** The estimate and leave lines now (on the page's clock, anchored to the build's start): which state, what it says.
   *  -> { on, line, state, text, so } */
  function etaNow() {
    const el = Date.now() - t0, s = est && est.s;
    const over = !!s && el >= est.overAt;
    const line = !!s && ((s.show !== 'none' && (authoring || el >= s.showAt)) || over);   // a quick build that hangs is told too
    const on = line || el >= (s ? s.showAt : LEAVE_AT);
    const state = !s ? 'start' : el >= est.bigAt ? 'big' : over ? 'longer' : est.msg ? 'msg' : est.tail ? 'tail' : 'start';
    return { on, line, state, text: line ? etaWords(state, est) : '', so: line && el >= 60e3 ? ETA('soFar', { time: minutes(Math.floor(el / 60e3)) }) : '' };
  }
  /** What to read out now: the line (with the leave line the first time), or '' when nothing changed. */
  function etaSay(n, force = false) {
    const key = `${n.line}|${n.state}`;
    if (!n.on || (key === said && !force)) return '';
    said = key;
    const text = [n.text, leaveSaid && !force ? '' : ST('leave')].filter(Boolean).join('. ');
    leaveSaid = true;
    return text;
  }
  /** Draw the top of the card (it changes only when its words do) and read out a new state once. */
  function etaTick() {
    if (stopped) return;
    const n = etaNow();
    eta.hidden = !n.on; eta.dataset.state = n.state;
    etaLine.hidden = etaLearn.hidden = !n.line;
    const sig = `${n.state}|${n.text}|${n.so}`;
    if (n.line && etaLine.dataset.sig !== sig) {
      etaLine.dataset.sig = sig; etaLine.textContent = '';
      etaLine.append(hide(mk('span', null, n.state === 'longer' || n.state === 'big' ? '⏳' : '⏱')), ' ', mk('span', 'stp-eta-t', n.text));
      if (n.so) etaLine.append(' ', hide(mk('span', 'stp-eta-so', `· ${n.so}`)));   // whole minutes, never read out
    }
    if (n.line && !etaLearn.firstChild) withIcon(etaLearn, '💡', ETA(est.s.p === 'ai' ? 'learnAi' : 'learnBlocks'));
    if (shownAt) { const say = etaSay(n); if (say) announce(say, false, true); }
  }
  function fold() {
    const hidden = Math.max(0, rows.length - 1 - (narrow.matches ? 1 : 2));
    const focused = document.activeElement;
    rows.forEach((r, n) => { r.li.hidden = !expanded && n < hidden && !r.li.contains(focused); });   // never hide the focus
    more.hidden = hidden === 0;
    withIcon(more, expanded ? '▴' : '▾', expanded ? ST('hideEarlier') : ST('earlier', { count: hidden }));
    more.setAttribute('aria-expanded', String(expanded));
  }
  more.addEventListener('click', () => { expanded = !expanded; fold(); });
  const refold = () => fold();
  narrow.addEventListener('change', refold);
  function pill() {
    const r = newest(); if (!pillEl || !r) return;
    const det = AUTHOR.has(r.key) ? stepDetail(r.key, r.f) : '';
    pillEl.textContent = `${STEP_ICON[r.key] || ''} ${stepLabel(r.key, r.f, r.done && !r.stopped)}${det ? ` · ${det}` : ''}`;
  }
  /** The "Just now" line for a new timed row: an instant row that came right before it, not shown yet this turn. */
  function justFor(key) {
    if (!SERVER_STEPS.has(key)) return null;
    const recent = new Set();
    for (let n = rows.length - 1; n >= 0 && !TIMED.has(rows[n].key); n--) recent.add(rows[n].key);
    return JUST_NOW.find(k => recent.has(k) && !turn.justShown.has(k)) || null;
  }
  // "Did you know?": only on an AI step (or, before any round, while waiting for the AI on the server).
  const factsFit = r => mode === 'ai' || (!mode && S.provider === 'claude' && (r.key === 'waiting' || (r.key === 'offline' && !r.f.unsure)));
  /** What the running row's 💡 line shows now: 'just', 'own', 'think' or 'fact<N>' (each stays a while). */
  function tipKind(r) {
    const items = [];
    if (r.just) items.push(['just', TIP_JUST]);
    if (ownLearn(r.key, r.f)) items.push(['own', TIP_OWN]);
    if (r.key === 'think' && r.f.th && (!turn.thinkShown || r.thinkHere)) items.push(['think', TIP_THINK]);
    const age = Date.now() - r.at; let at = 0;
    if (r.key === 'think' && !r.done && !r.paused && age >= LONG_AT && age < LONG_AT + TIP_LONG) return 'long';
    for (const [kind, ms] of items) { if (age < at + ms) return kind; at += ms; }
    if (!r.done && !r.paused && tipsOn && factsFit(r)) return `fact${Math.floor((age - at) / TIP_FACT)}`;
    return items.length ? items[items.length - 1][0] : '';
  }
  function retip(r) {
    const v = r && views.get(r.li); if (!v || !v.tip) return;
    const kind = tipKind(r);
    if (kind !== r.tipKind || !v.tip.firstChild) fillTip(r, v.tip, kind);
    // The line only grows within one step, so changing lines never makes the card jump up and down.
    if (r.tipMin) v.tip.style.minHeight = `${r.tipMin}px`;
    const h = v.tip.offsetHeight; if (h > (r.tipMin || 0)) { r.tipMin = h; v.tip.style.minHeight = `${h}px`; }
  }
  function fillTip(r, tip, kind) {
    r.tipKind = kind;
    if (kind === 'just') { withIcon(tip, STEP_ICON[r.just], ST(`${r.just}.learn`), ST('justNow')); if (tipsOn) turn.justShown.add(r.just); }
    else if (kind === 'own') withIcon(tip, '💡', ownLearn(r.key, r.f));
    else if (kind === 'long') withIcon(tip, '⏳', ST('think.learn.long'));
    else if (kind === 'think') { withIcon(tip, '🤔', ST('think.learn.thinking')); if (tipsOn) { turn.thinkShown = true; r.thinkHere = true; } }
    else if (kind) {
      if (r.factFor !== kind) { r.factFor = kind; r.factText = ST(`facts.${FACTS[factNext++ % FACTS.length]}`); }
      withIcon(tip, '🌟', r.factText, ST('factLabel'));
    } else tip.textContent = '';
  }
  function push(key, facts, i, at = null) {
    const now = at != null ? Math.min(Date.now(), t0 + at) : Date.now();   // the server's time for its own steps
    const last = newest();
    if (last && last.key === 'sending') { last.li.remove(); rows.pop(); }   // the first real step replaces it
    const prev = newest();
    // A new step ends the one before. A dropped connection or a restart doesn't: that step may still be running.
    if (prev && !prev.done && !prev.paused) { if (key === 'offline' || key === 'restart') prev.paused = true; else prev.done = true; prev.dur = Math.max(0, now - prev.at); }
    if (SERVER_STEPS.has(key)) heard = true;
    if (key === 'think') mode = 'ai'; else if (key === 'blocks') mode = 'blocks';
    if (ETA_AUTHOR.has(key)) authoring = true;
    const r = { key, f: { ...facts }, at: now, li: mk('li', 'stp-row'), open: false, done: !TIMED.has(key), paused: false, stopped: false, spoke: false, just: TIMED.has(key) ? justFor(key) : null };
    r.li.dataset.step = key;
    r.toggle = () => { r.open = !r.open; paint(r); };
    rows.push(r); if (i) byI.set(i, r);
    list.appendChild(r.li);
    if (prev) paint(prev);
    paint(r); retip(r); fold(); pill();
    if (key !== 'sending') announce(stepLabel(key, r.f, r.done), r.f.ok === false || (key === 'check' && r.f.st === 'fail'));
    etaTick();
  }
  function tick() {
    etaTick();
    const r = newest(); if (!r || !shownAt) return;
    const stick = nearBottom();
    const v = views.get(r.li);
    if (v && v.sec && !r.done && !r.paused) { const age = Date.now() - r.at; v.sec.textContent = fmtDur(age, true); v.sec.classList.toggle('stp-wait', age < SEC_AFTER); }
    retip(r);
    if (stick) scrollDown();
  }
  let timer = setInterval(tick, 1000);
  const showTimer = setTimeout(show, SHOW_AFTER);
  function stopTimers() { clearInterval(timer); timer = 0; clearTimeout(showTimer); narrow.removeEventListener('change', refold); }
  const api = {
    el,
    add(d) { if (d && SERVER_STEPS.has(d.key)) { const { i, key, at, ...facts } = d; push(key, facts, i, typeof at === 'number' ? at : null); } },
    /** The page's own rows: offline (the stream dropped), waiting (opened while the Builder works), sending, restart
     *  (the server is restarting; facts.resume: the build will carry on by itself). */
    local(key, facts = {}) {
      // Until a step has arrived, nobody knows whether the message reached the server: say "checking", not "keeps going".
      push(key, key === 'offline' && !heard ? { unsure: 1 } : { ...facts }, 0);
      if (key !== 'sending') show();
    },
    /** The build started elapsed ms ago (by the server's clock): rows and the estimate keep its real times. */
    anchor(elapsed) {
      t0 = Date.now() - Math.max(0, +elapsed || 0);
      if (Date.now() - t0 >= SHOW_AFTER) show();
      etaTick();
    },
    /** The server's estimate (eta.js): start, then tail (the first version) and msg (a follow-up read), which only ever
     *  move "longer than usual" and "a big job" later. */
    eta(d) {
      if (!d || d.v !== 1) return;
      if (d.phase === 'start') est = { s: d, overAt: d.overAt, bigAt: d.bigAt, tail: null, msg: false };
      else if (!est) return;
      else {
        est.overAt = Math.max(est.overAt, +d.overAt || 0); est.bigAt = Math.max(est.bigAt, +d.bigAt || 0);
        if (d.phase === 'tail') est.tail = d; else if (d.phase === 'msg') est.msg = true;
      }
      etaTick();
    },
    newestKey() { const r = newest(); return r ? r.key : null; },
    /** After a replay: read the current step, and the estimate with the leave line when they show, once. */
    sayCurrent() {
      const r = newest(); if (r && r.key !== 'sending') announce(stepLabel(r.key, r.f, r.done && !r.stopped));
      const say = !stopped && etaSay(etaNow(), true); if (say) announce(say, false, true);
    },
    patch(d) {
      const r = d && byI.get(d.i); if (!r) return;
      const { i, ...facts } = d; void i;
      const firstPlan = facts.plan && !r.f.plan, failed = facts.ok === false && r.f.ok !== false;
      Object.assign(r.f, facts); paint(r);
      if (r === newest()) { retip(r); pill(); }
      if (firstPlan && r === newest() && !r.done) announce(`${ST('planLabel')} ${r.f.plan}`);
      if (failed) announce(stepLabel(r.key, r.f, true), true);   // a late failure mark on its own row
    },
    /** Text is streaming: a round that thought first is now answering ("🤔 thought first"). */
    spoke() { const r = newest(); if (r && r.key === 'think' && r.f.th && !r.spoke && !r.done) { r.spoke = true; paint(r); } },
    /** An error ended the turn: the current row says "Stopped here" (in its present wording: it did not finish). */
    stop() { stopped = true; eta.hidden = true; strip.hidden = true; const r = newest(); if (!r) return; if (!r.done) { r.done = true; r.dur = Date.now() - r.at; } r.stopped = true; paint(r); pill(); },
    pill(e) { pillEl = e; pill(); },
    retip() { retip(newest()); },
    /** n follow-ups are waiting: "Got your message…", whether the AI is busy writing code (it reads them only when that
     *  step ends), and the turn note. */
    inbox(n) {
      strip.hidden = !n || stopped; if (strip.hidden) return;
      const ai = fuAi(), r = newest();
      const lines = [['📨', FU(ai ? 'gotAi' : 'gotBlocks', { count: n })]];
      if (ai && r && AUTHOR.has(r.key) && !r.done) lines.push(['✍️', FU('writingNow')]);
      lines.push(['🔋', FU('turnNote')]);
      const text = lines.map(x => x[1]).join(' ');
      if (strip.dataset.text === text) return;
      strip.dataset.text = text; strip.textContent = '';
      for (const [icon, x] of lines) strip.append(withIcon(mk('p'), icon, x));
    },
    /** The turn is over: fold into the summary (the server's record), or go away (refusals, limits, early errors). */
    finish(rec) {
      const card = stepsCard(rec);
      stopTimers(); if (live === api) live = null;
      hush(true); if (card) announce(summaryText(rec));
      if (!card) { el.remove(); return; }                // refused, limit, early error: nothing stays under that bubble
      if (!shownAt) { place(card); return; }             // a quick turn: straight to the summary, no flash
      const swap = () => {
        if (!el.parentNode) return;   // the chat was redrawn meanwhile
        const hadFocus = el.contains(document.activeElement);
        el.replaceWith(card);
        if (hadFocus) card.querySelector('.stp-sum').focus({ preventScroll: true });
      };
      const wait = MIN_SHOWN - (Date.now() - shownAt);
      if (wait > 0) setTimeout(swap, wait); else swap();
    },
    remove() { stopTimers(); hush(); if (live === api) live = null; el.remove(); },
  };
  return api;
}

const validRec = rec => !!(rec && rec.v === 1 && Array.isArray(rec.s) && rec.s.length);
function summaryText(rec) {
  const count = rec.s.filter(r => Array.isArray(r) && SERVER_STEPS.has(r[0])).length;
  const end = !rec.end || rec.end === 'ok' ? '' : ` · ${ST(rec.end === 'restart' ? 'stopRestart' : rec.end === 'timeout' ? 'stopTime' : 'stopped')}`;
  const fu = rec.fu > 0 ? ` · ${ST('fuRead', { count: rec.fu })}` : '';
  return ST(rec.p === 'ai' ? 'summaryAi' : 'summaryBlocks', { count, time: fmtDur(rec.ms) }) + fu + end;
}
/** The folded summary of a finished turn ("How the AI did this · 6 steps · 1 min 24 sec"); rows are built on first open,
 *  in the reader's language, from the stored keys, facts and times. -> element (not yet in the log), or null. */
function stepsCard(rec) {
  if (!validRec(rec)) return null;
  const d = mk('div', 'ev stp'); d.dataset.state = 'done'; d.setAttribute('aria-live', 'off');
  const id = `stp-${++stepSeq}`;
  const btn = mk('button', 'stp-sum'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
  const arrow = hide(mk('span', 'stp-arrow', '▾'));
  btn.append(hide(mk('span', 'stp-ico', rec.p === 'ai' ? '🧠' : '🧱')), mk('span', 'stp-sum-t', summaryText(rec)), arrow);
  const body = mk('div', 'stp-body'); body.id = id; body.hidden = true;
  const setOpen = open => {
    if (open && !body.firstChild) fillSummary(body, rec, () => { setOpen(false); btn.focus({ preventScroll: true }); });
    body.hidden = !open;
    btn.setAttribute('aria-expanded', String(open)); arrow.textContent = open ? '▴' : '▾';
    reveal(d);   // opening at the bottom of the chat: show the steps, not just the line
  };
  btn.addEventListener('click', () => setOpen(body.hidden));
  d.append(btn, body);
  return d;
}
function fillSummary(body, rec, close) {
  const list = mk('ol', 'stp-list');
  const rows = rec.s.filter(r => Array.isArray(r) && SERVER_STEPS.has(r[0]));
  rows.forEach((row, n) => {
    const [key, at] = row; const f = row[2] && typeof row[2] === 'object' ? row[2] : {};
    const next = rows[n + 1];
    const o = { key, f, done: true, current: false, open: false, showPlan: true, stopped: !!rec.end && rec.end !== 'ok' && n === rows.length - 1, dur: (next ? next[1] : rec.ms) - at };
    const li = mk('li', 'stp-row'); li.dataset.step = key;
    o.toggle = () => { o.open = !o.open; drawRow(li, o); };
    drawRow(li, o); list.append(li);
  });
  body.append(list);
  if (rec.ti > 0) body.append(withIcon(mk('p', 'stp-foot'), '🔢', ST('tokens', { read: rec.ti, wrote: rec.to || 0 })));
  body.append(withIcon(mk('p', 'stp-foot stp-loop'), '💡', rec.p === 'ai' ? ST('loopAi', { count: rec.r || 0 }) : ST('loopBlocks')));
  // At the bottom of a long list: the tips switch, and a way to fold it again without scrolling back up.
  const bar = mk('div', 'stp-bar'); const less = mk('button', 'stp-less'); less.type = 'button';
  withIcon(less, '▴', ST('showLess')); less.addEventListener('click', close);
  bar.append(tipsBtn(), less); body.append(bar);
}

// ---------------------------------------------------------------- follow-ups
// A message sent while a build runs: screened like any message, then waiting until the Builder reads it at its next
// step (the AI between rounds, the building blocks after a question or a version). Its bubble says where it is, from
// the server's inbox events and the saved transcript: checking -> waiting -> reading (AI only) -> read, or carried (it
// starts the next build), dropped (with "Put it back in the box"), refused (the kind reply follows), failed (no answer:
// "Try again" sends it again with the same id, which the server never stores twice).
const FU = (k, vars) => t(`js.studio.followups.${k}`, vars);
const FLYING = new Set(['checking', 'failed']);
const NOT_READ = ['limit', 'error', 'stopped', 'chain'];
/** Is the running build (or the next one) made by the AI? */
const fuAi = () => (S.turn ? S.turn.provider === 'ai' : S.provider === 'claude');
const fuFind = (id, cid) => $$('.msg.fu', log).find(e => (id && e.dataset.fu === id) || (cid && e.dataset.cid === cid)) || null;
/** Draw (or find, and with move: put at the end) a follow-up bubble. o: { id, cid, state, why, by, move } */
function fuBubble(text, o = {}) {
  let b = fuFind(o.id, o.cid);
  if (!b) { b = mk('div', 'msg me fu'); b.dir = 'auto'; b.append(mk('span', 'fu-text', text)); place(b); }
  else if (o.move) place(b);
  b.dataset.text = text;
  if (o.id) b.dataset.fu = o.id;
  if (o.cid) b.dataset.cid = o.cid;
  fuState(b, o.state || 'waiting', o);
  return b;
}
function fuState(b, state, { why = null, by = null } = {}) {
  if (!b) return;
  b.dataset.state = state;
  b.classList.toggle('refused', state === 'refused');
  let line = $('.fu-st', b);
  if (state === 'refused') { if (line) line.remove(); return; }
  if (!line) { line = mk('p', 'fu-st'); line.setAttribute('aria-live', 'off'); b.append(line); }
  line.dataset.state = state;
  const ai = by ? by === 'ai' : fuAi();
  const [icon, text] = {
    checking: ['🛡️', ST('screen.now')],
    waiting: ['📨', FU(ai ? 'waitingAi' : 'waitingBlocks')],
    reading: ['📬', FU(ai ? 'readingAi' : 'waitingBlocks')],   // the building blocks read and use it at once
    read: ['✓', FU(ai ? 'readAi' : 'readBlocks')],
    carried: ['🔁', FU('nextBuild')],
    dropped: ['⚠️', FU(`notRead.${NOT_READ.includes(why) ? why : 'stopped'}`)],
    failed: ['⚠️', FU('failed')],
  }[state] || ['📨', FU(ai ? 'waitingAi' : 'waitingBlocks')];
  withIcon(line, icon, text);
  const act = state === 'dropped' ? ['fu-putback', '✏️', FU('putBack')] : state === 'failed' ? ['fu-retry', '↻', FU('retry')] : null;
  if (act) { const btn = withIcon(mk('button', 'btn btn-sm fu-btn'), act[1], act[2]); btn.type = 'button'; btn.dataset.act = act[0]; line.append(' ', btn); }
}
/** A follow-up the screening refused: its bubble (moved to where the server put it), then the kind reply. Once. */
function fuRefused(cid, text, reply) {
  let b = fuFind(null, cid);
  if (b && b.dataset.state === 'refused') return;
  fuArrives();
  if (b) place(b); else b = fuBubble(text, { cid, state: 'refused' });
  fuState(b, 'refused');
  bubble('bot refused', reply);
}
/** "Your message started a new build (1 turn)". */
function carriedNote() { return card('carried', `<span>🔁 ${E('js.studio.followups.carriedNote')}</span>`); }
/** The strip in the live card follows the follow-ups waiting now. */
function syncStrip() { if (live) live.inbox($$('.msg.fu[data-state="waiting"]', log).length); }
function onInbox(d) {
  if (d.status === 'waiting' && d.entry) {
    fuArrives();
    fuBubble(d.entry.text, { id: d.entry.id, cid: d.entry.cid, state: 'waiting', move: true });
    if (S.turn && S.turn.mine && typeof d.left === 'number') S.turn.left = d.left;
  } else if (d.status === 'refused') fuRefused(d.cid, d.text, `${d.message} ${d.suggestion}`.trim());
  else { textEnds(); for (const id of d.ids || []) fuState(fuFind(id), d.status, { why: d.why }); }
  if (d.status === 'reading') announce(FU('announceRead'));
  syncStrip(); syncCompose();
  if (!LIVE.replaying && nearBottom()) scrollDown();
}
const putBack = text => { if (text && !input.value.trim()) { input.value = text; autosize(); } };
/** Send a follow-up (el: a failed one, sent again with its cid). */
async function sendFollowUp(text, { cid = null, el = null } = {}) {
  if (!text) { input.focus(); return; }
  if (pending.length) { toast(FU('noUploadsHint')); return; }   // pictures wait for the next build
  cid = cid || newCid();
  // Where the reply goes on (above or below it) is decided when the server stores it (onInbox).
  const b = el || fuBubble(text, { cid, state: 'checking' });
  if (el) { place(el); fuState(el, 'checking'); }
  else { input.value = ''; autosize(); }
  scrollDown();
  let res = null, data = null;
  try {
    res = await fetch(`/api/studio/${ID}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ text, pro, uploads: [], cid, detach: true }) });
    try { data = await res.json(); } catch { data = null; }
  } catch { res = null; }
  if (res && res.ok && data && data.followUp) {
    b.dataset.fu = data.followUp.id;
    if (b.dataset.state === 'checking') fuState(b, data.followUp.status || 'waiting');
    if (S.turn && typeof data.left === 'number') S.turn.left = data.left;
    syncStrip(); syncCompose(); return;
  }
  if (res && res.ok && data && data.refused) { fuRefused(cid, text, `${data.refused.message} ${data.refused.suggestion || ''}`.trim()); syncStrip(); return; }
  if (res && res.ok && data && data.turn) {
    // The build ended while this was on its way: it starts the next build, which draws it as its message.
    b.remove(); LIVE.pendingCid = cid; syncCompose(); openLive(); return;
  }
  if (res && res.status === 401) { b.remove(); putBack(text); signInAgainBubble(); return; }
  if (res && data && data.error) {
    b.remove(); putBack(text); toast(data.error, { bad: true, ms: 5000 });
    if (data.code === 'cap' && S.turn) S.turn.left = 0;
    syncStrip(); syncCompose(); return;
  }
  fuState(b, 'failed');   // no answer (offline, or the server restarting)
}

/** Signed out meanwhile (timed out, or on another device; the game itself is saved): say so in the chat, with a button
 *  that signs in again and comes back here with the unsent message. */
function signInAgainBubble(key = 'js.app.signedOut') {
  const b = bubble('err', t(key)); const go = document.createElement('button');
  go.type = 'button'; go.className = 'btn btn-sm btn-primary'; go.textContent = t('js.studio.signInAgain');
  go.addEventListener('click', () => signedOut([input])); b.append(' ', go); scrollDown();
}
/** A failed Studio action: signed out goes to the sign-in page (keeping the unsent message), anything else is a toast. */
function failed(err) { if (err.signedOut) signedOut([input]); else toast(err.message, { bad: true }); }

// ---------------------------------------------------------------- live stream
// One stream per tab (GET /live) while the page is open: hello { turn } (the running build as this viewer sees it, with
// its saved entries), the replay of what it did so far, caughtup, then live events, also for builds started in another
// tab or on another device. Every (re)connect replays the running build in full, so the page simply draws it again from
// hello: no cursors. It reconnects by itself (after 1, 2, 4, 8, then every 15 s, with no overall limit) and at once when
// the page is back in view or online. restart: the server is restarting (the build is saved and carries on by itself);
// signedout / gone: this tab may not watch any more, but the build goes on. After every 'done' the page reads the state
// again, redraws the chat from the saved transcript and reopens the stream (resync): one way for every build to end here.
let botCur = null;   // the bot bubble the reply is streaming into
// botOpen: text is streaming into it now. fuHeld: a follow-up came in the middle of that sentence, so it sits below the
// bubble while the sentence goes on in it, until something other than text comes; runner.js splits the saved reply at
// the same events, so a reload draws what was seen.
let botOpen = false, fuHeld = false;
const endBubble = () => { botCur = null; botOpen = false; fuHeld = false; };
/** The sentence ended. A replay never ends a held one: the steps it replays came before it. */
function textEnds() { if (LIVE.replaying && fuHeld) return; botOpen = false; if (fuHeld) endBubble(); }
/** A follow-up was stored: below the sentence it came in the middle of, otherwise the reply goes on below it. */
function fuArrives() { if (botCur && botOpen) fuHeld = true; else endBubble(); }
let pillEl = null;   // the pill on the preview: what the Builder is doing now
function ensurePill() {
  if (!pillEl) { pillEl = document.createElement('div'); pillEl.className = 'st-busy'; pillEl.dir = document.dir; stage.appendChild(pillEl); }
  if (live) live.pill(pillEl);
}
function removePill() { if (pillEl) { pillEl.remove(); pillEl = null; } }
/** While a build runs, Send adds to it (until this build's extra messages are used up), pictures wait for the next
 *  build, and the box says so. Everything is off once the game is gone. */
const clip = $('#st-clip'), CLIP_TITLE = clip.title;
const PLACEHOLDER = { long: input.dataset.long || input.placeholder, short: input.dataset.short };
function syncCompose() {
  const gone = LIVE.stopped === 'gone';
  const building = !!(S.turn || LIVE.pendingCid || LIVE.check);
  const full = !!(S.turn && S.turn.mine && S.turn.left === 0);
  $('#st-send').disabled = gone || (building && full);
  input.disabled = gone; clip.disabled = gone || building;
  clip.title = building ? FU('noUploadsHint') : CLIP_TITLE;
  if (!building) setPlaceholder(input, PLACEHOLDER.long, PLACEHOLDER.short);
  else if (full) setPlaceholder(input, FU('capPlaceholder'), FU('capShort'));
  else setPlaceholder(input, FU(fuAi() ? 'placeholderAi' : 'placeholderBlocks'), FU('placeholderShort'));
}

/** One event of the build this page shows, live or replayed (a replay doesn't scroll, speak or load the preview). */
function onEvent(ev, d) {
  const stick = !LIVE.replaying && nearBottom();   // follow the build only when the chat is at the bottom
  if (ev !== 'text' && ev !== 'stepinfo' && ev !== 'eta') textEnds();
  if (ev === 'stepinfo') { if (live) live.patch(d); }
  else if (ev === 'eta') { if (live) live.eta(d); }
  else if (ev === 'text') { if (!botCur) botCur = bubble('bot', ''); botCur.textContent += d.text; botOpen = true; if (live) live.spoke(); }
  else if (ev === 'step') {
    if (live) live.add(d);
    $$('.qchips:not(.used)', log).forEach(c => c.classList.add('used'));   // it went on (a new message answered the question)
    syncStrip();
  }
  else if (ev === 'ask') { askBlock(d, true, botCur || bubble('bot', '')); botCur = null; }
  else if (ev === 'version') { endBubble(); versionCard(d, true); if (LIVE.replaying) LIVE.replayVersion = d; else setPreview(d.preview, d.id); }
  else if (ev === 'meta') { endBubble(); metaCard(d); S.game = { ...S.game, ...d }; renderTop(); }
  else if (ev === 'notes') { endBubble(); notesCard(d.checklist); }
  else if (ev === 'playtest') endBubble();   // not drawn, but the saved reply starts a new part after it, as after any card
  else if (ev === 'refused') { endBubble(); bubble('bot refused', `${d.message} ${d.suggestion}`); if (d.chips && d.chips.length) chips(d.chips, true); }
  else if (ev === 'error') { endBubble(); bubble('err', d.message); if (live) live.stop(); LIVE.lastErr = d.message; }
  else if (ev === 'done') {
    endBubble();
    if (typeof d.turnsLeft === 'number') { S.turnsLeft = d.turnsLeft; S.freeLeft = typeof d.freeLeft === 'number' ? d.freeLeft : d.turnsLeft; if ('extraLeft' in d) S.extraLeft = d.extraLeft; if ('classContext' in d) S.classContext = d.classContext; renderTurns(); }
    // Ended before it was charged with an error (no turns left): nothing was saved, so after the redraw the error stays
    // and the message goes back in the box.
    const first = S.turn && (S.turn.entries || []).find(m => m.role === 'user');
    LIVE.carry = !d.steps && LIVE.lastErr ? { err: LIVE.lastErr, text: first ? first.text : '' } : null;
    LIVE.lastErr = null;
    if (live) live.finish(d.steps || null);   // no record: refused, no turns left, an early error
  }
  if (stick) scrollDown();
}
function onLive(ev, d) {
  if (ev === 'hello') return onHello(d);
  if (ev === 'caughtup') return onCaughtUp();
  if (ev === 'turn') return startTurnUI(d);
  if (ev === 'inbox') return onInbox(d);
  if (ev === 'restart') return onRestart(d);
  if (ev === 'signedout') return onSignedOut(true);
  if (ev === 'gone') return onGone();
  if (!LIVE.turnId) return;                       // nothing running here (late events after 'done' are ignored)
  onEvent(ev, d);
  if (ev === 'done') { LIVE.turnId = null; resync(); }
}
/** Read a text/event-stream body: on(event, data) for each event. */
async function readSSE(body, on) {
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message', data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event: ')) ev = line.slice(7); else if (line.startsWith('data: ')) data += line.slice(6); }
      if (!data) continue;
      let d; try { d = JSON.parse(data); } catch { continue; }
      try { on(ev, d); } catch (e) { console.error(e); }   // one bad event never stops the stream
    }
  }
}
async function openLive() {
  if (LIVE.ctrl || LIVE.stopped || LIVE.hidden) return;
  clearTimeout(LIVE.retry);
  const ctrl = new AbortController(); LIVE.ctrl = ctrl;
  let res = null;
  try { res = await fetch(`/api/studio/${ID}/live`, { credentials: 'same-origin', headers: { Accept: 'text/event-stream', 'X-Brb-Background': '1' }, signal: ctrl.signal }); } catch { /* offline, or the server is down */ }
  if (LIVE.ctrl !== ctrl) return;                 // closed meanwhile (a resync, a restart, signed out)
  if (!res || !res.ok || !res.body) {
    LIVE.ctrl = null;
    if (res && (res.status === 401 || res.status === 403)) return onSignedOut();
    if (res && res.status === 404) return onGone();
    if (res && res.status === 429) return retryLive(15000);
    return liveFailed();
  }
  try { await readSSE(res.body, (ev, d) => { if (LIVE.ctrl === ctrl) onLive(ev, d); }); } catch { /* the connection dropped */ }
  if (LIVE.ctrl !== ctrl) return;
  LIVE.ctrl = null; LIVE.replaying = false;
  retryLive(backoff());                           // it ended on its own (a proxy, a phone asleep): back with a full replay
}
const BACKOFF = [1000, 2000, 4000, 8000, 15000];
function backoff() { const b = BACKOFF[Math.min(LIVE.tries++, BACKOFF.length - 1)]; return Math.round(b * (0.8 + Math.random() * 0.4)); }
function retryLive(ms) { clearTimeout(LIVE.retry); if (!LIVE.stopped) LIVE.retry = setTimeout(openLive, ms); }
function closeLive() { const c = LIVE.ctrl; LIVE.ctrl = null; LIVE.replaying = false; clearTimeout(LIVE.retry); if (c) c.abort(); }
/** A (re)connect failed: while a build is shown, say the connection dropped (unless the restart row already says why). */
function liveFailed() {
  if (live && (LIVE.turnId || LIVE.check) && !LIVE.restart && live.newestKey() !== 'offline') live.local('offline');
  retryLive(backoff());
}
function onHello(d) {
  LIVE.tries = 0; LIVE.restart = false;
  const chk = LIVE.check;
  if (d.turn) {
    LIVE.replaying = true; LIVE.replayVersion = null;
    startTurnUI(d.turn, { full: true });
    if (chk && LIVE.check === chk) arrived(chk);   // a different build than the message we're unsure about
    return;
  }
  if (chk) return arrived(chk);                   // a message sent while the server was down: decide now
  if (LIVE.turnId || (LIVE.pendingCid && !LIVE.posting)) resync();   // it ended (or was refused) while we weren't connected
}
function onCaughtUp() {
  if (!LIVE.replaying) return;
  LIVE.replaying = false;
  const v = LIVE.replayVersion; LIVE.replayVersion = null;
  if (v && v.preview && v.id !== shownVersion) setPreview(v.preview, v.id);   // once, for the newest version replayed
  scrollDown();
  if (live && LIVE.turnId) live.sayCurrent();
}
/**
 * Show a running build. turn: { id, attempt, cid, elapsed, entries, ... } (from hello, a turn event or the state).
 * The card and bubble this tab drew for its own send are kept when the turn event says it is that message; otherwise
 * (full: a replay, another tab's build, a resumed attempt) what was drawn for it is taken away and drawn again from
 * its saved entries, with a new live card that the replay then fills. waiting: say it's working until hello comes.
 */
function startTurnUI(turn, { full = false, waiting = false } = {}) {
  const mine = turn.cid ? $$('.msg.me[data-cid]', log).find(e => e.dataset.cid === turn.cid) : null;
  const own = !full && !!mine && !!live && LIVE.pendingCid === turn.cid;
  if (turn.cid && turn.cid === LIVE.pendingCid) LIVE.pendingCid = null;
  if (LIVE.check && turn.cid === LIVE.check.cid) LIVE.check = null;
  LIVE.turnId = turn.id; S.turn = turn;
  endBubble();
  if (own) mine.dataset.live = turn.id;
  else {
    if (live) live.remove();
    const flying = $$('.msg.fu', log).filter(e => FLYING.has(e.dataset.state));   // follow-ups on their way stay
    $$('[data-live]', log).filter(e => !flying.includes(e)).forEach(e => e.remove());
    const entries = turn.entries || [];
    if (turn.carried && !entries.some(m => (m.events || []).some(e => e[0] === 'carried'))) carriedNote();
    entries.forEach(m => drawEntry(m, false));   // place() marks them with the build's id
    for (const b of flying) if (b.isConnected && FLYING.has(b.dataset.state)) place(b);
    live = liveSteps();
    if (waiting) live.local('waiting');
  }
  live.anchor(turn.elapsed);
  ensurePill();
  $$('.qchips', log).forEach(c => c.classList.add('used'));
  syncStrip(); syncCompose();
  if (!LIVE.replaying) scrollDown();
}
function onRestart(d) {
  closeLive();
  if (live && (LIVE.turnId || LIVE.pendingCid)) { LIVE.restart = true; live.local('restart', d && d.resume ? { resume: 1 } : {}); }
  retryLive(Math.max(1000, +(d && d.retryMs) || 5000));
}
/** The session ended. verify: told by the stream, so first check whether this browser is signed in again (a password
 *  change gives this device a new sign-in): then carry on. */
async function onSignedOut(verify = false) {
  closeLive();
  if (verify) { try { await api(`/api/studio/${ID}`, { background: true }); resync(); return; } catch { /* signed out indeed */ } }
  if (LIVE.stopped) return;
  LIVE.stopped = 'signedout';
  const building = !!(LIVE.turnId || S.turn);
  if (live) live.remove(); removePill(); endBubble();
  signInAgainBubble(building ? 'js.studio.signedOutBuilding' : 'js.app.signedOut');
  syncCompose();
}
/** The game was deleted (or this account may not edit it any more). */
function onGone() {
  closeLive();
  if (LIVE.stopped === 'gone') return;
  LIVE.stopped = 'gone';
  if (live) live.remove(); removePill(); endBubble();
  LIVE.turnId = null; S.turn = null;
  bubble('err', t('js.studio.gameGone'));
  syncCompose();
}
/** After a build ends (and when the stream says nothing runs that this page thought did): read the state, redraw the
 *  chat from the transcript and the top, then reopen the stream. Waits for a message that is still on its way. */
let resyncing = false, resyncAgain = false;
async function resync() {
  if (resyncing || LIVE.posting) { resyncAgain = true; return; }
  resyncing = true; closeLive();
  let st = null, err = null;
  try { st = await api(`/api/studio/${ID}`, { background: true }); } catch (e) { err = e; }
  resyncing = false;
  if (err) {
    if (err.status === 401) return onSignedOut();
    if (err.status === 404) return onGone();
    clearTimeout(LIVE.retry); LIVE.retry = setTimeout(resync, backoff()); return;   // the server is restarting
  }
  applyResync(st);
  if (resyncAgain) { resyncAgain = false; resync(); }
}
function applyResync(st) {
  S = { ...S, ...st };
  if (live) live.remove(); endBubble();
  renderTop(); renderLive(); renderSafety(); renderTurns(); renderLog();
  if (S.current && S.preview && S.current.id !== shownVersion) setPreview(S.preview, S.current.id);
  const carry = LIVE.carry; LIVE.carry = null;
  if (carry) { bubble('err', carry.err); if (carry.text && !input.value.trim()) { input.value = carry.text; autosize(); } }
  if (S.turn) startTurnUI(S.turn, { waiting: true });
  else { LIVE.turnId = null; removePill(); if (!LIVE.posting) LIVE.pendingCid = null; }
  syncCompose(); openLive();
}
const seen = (st, cid) => !!((st.turn && st.turn.cid === cid) || (st.lastTurn && st.lastTurn.cid === cid));
/** A send whose answer never came (offline, or the server restarting): did the server get it? */
async function arrived(chk) {
  let st;
  try { st = await api(`/api/studio/${ID}`, { background: true }); }
  catch (e) {
    if (e.status === 401) { LIVE.check = null; giveBack(chk); return onSignedOut(); }
    // Don't decide yet: it may have been stored just before the server stopped, and then the next boot runs it. Saying
    // "it didn't arrive" would make the child send it again and pay twice. Decide after the next good connect (hello).
    LIVE.check = chk;
    if (live && live.newestKey() !== 'offline') live.local('offline');
    if (!LIVE.ctrl) retryLive(backoff());
    syncCompose(); return;
  }
  LIVE.check = null;
  if (seen(st, chk.cid)) { if (LIVE.pendingCid === chk.cid) LIVE.pendingCid = null; closeLive(); applyResync(st); return; }   // it got there
  giveBack(chk);
  bubble('err', t('js.studio.dropped'));
  syncCompose(); openLive();
}
/** The message never reached the Builder: it goes back in the box (with its pictures). */
function giveBack(chk) {
  if (chk.el) chk.el.remove();
  if (live) live.remove(); removePill();
  if (LIVE.pendingCid === chk.cid) LIVE.pendingCid = null;
  if (!input.value.trim()) { input.value = chk.text; autosize(); }
  if (chk.ups.length && !pending.length) { pending = chk.ups; renderAttach(); }
}

// ---------------------------------------------------------------- sending
let pending = []; // uploads waiting to be sent: { id, name, kind, url }
const newCid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
/** Send a message to the Builder. The server answers at once (the build runs on its own); the live stream shows it.
 *  continueOf: the id of the build that stopped early ("Carry on building"). */
async function send(text, { continueOf = null } = {}) {
  text = String(text || '').trim();
  const ups = pending.filter(u => u.id);
  if (LIVE.stopped === 'gone') return;
  // A build is running (or this tab's message is on its way to start one): this message adds to it.
  if (S.turn || LIVE.pendingCid || LIVE.check) return sendFollowUp(text);
  if (!text && !ups.length) { input.focus(); return; }
  const cid = newCid();   // the same message sent twice (a lost answer) is one build
  LIVE.pendingCid = cid; LIVE.posting = true;
  $$('.qchips', log).forEach(c => c.classList.add('used'));
  endBubble();
  const mine = userBubble(text, ups); mine.dataset.cid = cid; mine.dataset.live = 'pending';
  input.value = ''; autosize();
  pending = []; renderAttach();
  // The steps card takes the reply's place at the bottom until the build ends (it appears after 0.7 s, so a quick
  // build goes straight to its summary), and the pill on the preview says the same. Both are made now: the build can
  // start before the answer to this POST arrives.
  if (live) live.remove();
  live = liveSteps(); live.local('sending'); ensurePill(); scrollDown(); syncCompose();
  const chk = { cid, text, ups, el: mine };
  let res = null, data = null;
  try {
    res = await fetch(`/api/studio/${ID}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ text, pro, uploads: ups.map(u => u.id), cid, detach: true, ...(continueOf ? { continueOf } : {}) }) });
    try { data = await res.json(); } catch { data = null; }
  } catch { res = null; }
  LIVE.posting = false;
  if (res && res.ok && data && data.turn) {
    openLive();                                    // the turn event (or the next hello) draws the build
    if (resyncAgain) { resyncAgain = false; resync(); }
    return;
  }
  if (res && res.ok && data && (data.followUp || data.refused)) {
    // This tab didn't know a build was running: the message was added to it. Its bubble becomes a follow-up, the card
    // and pill it made go, and the state draws the running build.
    if (live) live.remove(); removePill(); mine.remove();
    if (LIVE.pendingCid === cid) LIVE.pendingCid = null;
    if (data.followUp) fuBubble(text, { id: data.followUp.id, cid, state: data.followUp.status || 'waiting' });
    else fuRefused(cid, text, `${data.refused.message} ${data.refused.suggestion || ''}`.trim());
    resync(); return;
  }
  if (res && res.status === 401) { giveBack(chk); signInAgainBubble(); syncCompose(); return; }
  if (res && data && data.resting) { giveBack(chk); S.resting = data.resting.until; restingNote(); syncCompose(); scrollDown(); return; }
  if (res && data && data.error) { giveBack(chk); bubble('err', data.error); syncCompose(); scrollDown(); return; }
  arrived(chk);   // no answer: offline, or the server is restarting (the platform may answer for it, without JSON)
}
$('#st-compose').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight + 4) + 'px'; }
input.addEventListener('input', autosize);
// A shorter placeholder was swapped in (app.js data-short): an empty box shrinks back to one line.
input.addEventListener('placeholderfit', () => { if (!input.value) autosize(); });
log.addEventListener('click', e => {
  const c = e.target.closest('[data-chip]'); if (c) { send(c.dataset.chip); return; }
  if (e.target.closest('.stp-tips')) setTips(!tipsOn);   // "💡 Tips: on/off" in any steps card (one setting for all)
});
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'fix') send(`${t('js.studio.fixMessage', { number: S.current ? S.current.number : '' })} ${(S.current && S.current.issues || []).map(i => i.message).join(' ')}`.trim());
  else if (a.dataset.act === 'see') { $('.st-preview').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (a.dataset.act === 'update') updateLive();
  else if (a.dataset.act === 'continue' && S.lastTurn) send(t('js.studio.continueMessage'), { continueOf: S.lastTurn.id });
  else if (a.dataset.act === 'putback' && S.lastTurn && S.lastTurn.putBack) { input.value = S.lastTurn.putBack; autosize(); input.focus(); }
  else if (a.dataset.act === 'fu-putback') { const b = a.closest('.msg.fu'); if (b) { input.value = b.dataset.text || ''; autosize(); input.focus(); } }
  else if (a.dataset.act === 'fu-retry') { const b = a.closest('.msg.fu'); if (b) sendFollowUp(b.dataset.text || '', { cid: b.dataset.cid, el: b }); }
});
const proBtn = $('#st-pro');
const setPro = v => { pro = v; proBtn.setAttribute('aria-pressed', String(pro)); try { localStorage.setItem('brb-pro', pro ? '1' : '0'); } catch { /* ignore */ } };
proBtn.addEventListener('click', () => { setPro(!pro); toast(pro ? `✨ ${t('js.studio.proOn')}` : t('js.studio.proOff')); });
setPro(pro);

// ---------------------------------------------------------------- uploads (inspiration pictures and files)
const OK_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|markdown|csv)|application\/json)$/;
function renderAttach() {
  const box = $('#st-attach'); box.hidden = !pending.length;
  box.innerHTML = pending.map((u, i) => `<span class="att ${u.id ? '' : 'loading'}">${u.kind === 'image' && u.preview ? `<img src="${esc(u.preview)}" alt="">` : `<span class="fi" aria-hidden="true">${u.kind === 'image' ? '🖼️' : u.kind === 'pdf' ? '📄' : '📝'}</span>`}<span class="nm">${esc(u.name)}</span>${u.id ? `<button class="rm" type="button" data-rm="${i}" aria-label="${E('js.studio.uploads.remove', { name: u.name })}">✕</button>` : ''}</span>`).join('');
}
async function addFiles(files) {
  for (const f of files) {
    if (pending.length >= S.uploads.limits.perMessage) { toast(t('js.studio.uploads.max', { max: S.uploads.limits.perMessage }), { bad: true }); break; }
    const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    if (!OK_TYPES.test(f.type) && !/^(txt|md|csv|json)$/i.test(ext)) { toast(t('js.studio.uploads.types'), { bad: true }); continue; }
    const kind = f.type.startsWith('image/') ? 'image' : f.type === 'application/pdf' ? 'pdf' : 'text';
    const max = kind === 'text' ? S.uploads.limits.text : S.uploads.limits.image;
    if (f.size > max) { toast(kind === 'text' ? t('js.studio.uploads.textTooBig') : t('js.studio.uploads.fileTooBig'), { bad: true }); continue; }
    const item = { name: f.name, kind, preview: kind === 'image' ? URL.createObjectURL(f) : null };
    pending.push(item); renderAttach();
    try {
      const res = await fetch(`/api/studio/${ID}/uploads?name=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || t('js.studio.uploads.failed')), { signedOut: res.status === 401 });
      Object.assign(item, data.upload);
    } catch (e) { pending = pending.filter(x => x !== item); if (e.signedOut) { renderAttach(); return failed(e); } toast(e.message, { bad: true }); }
    renderAttach();
  }
}
$('#st-clip').addEventListener('click', () => $('#st-file').click());
$('#st-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
$('#st-attach').addEventListener('click', async e => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  const u = pending[+b.dataset.rm]; if (!u) return;
  pending = pending.filter(x => x !== u); renderAttach();
  try { await api(`/api/studio/${ID}/uploads/${u.id}`, { method: 'DELETE' }); } catch { /* already gone */ }
});
const compose = $('#st-compose');
compose.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); compose.classList.add('drag'); } });
compose.addEventListener('dragleave', () => compose.classList.remove('drag'));
compose.addEventListener('drop', e => { compose.classList.remove('drag'); if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
input.addEventListener('paste', e => { const files = [...(e.clipboardData && e.clipboardData.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } });

// ---------------------------------------------------------------- title, icon, settings
const titleIn = $('#st-title');
async function saveMeta(body, okMsg) {
  try { const r = await api(`/api/studio/${ID}/meta`, { method: 'POST', body }); applyState(r.state); if (okMsg) toast(okMsg); return true; }
  catch (e) { failed(e); return false; }
}
titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } if (e.key === 'Escape') { titleIn.value = S.game.title; titleIn.blur(); } });
titleIn.addEventListener('change', async () => { const v = titleIn.value.trim(); if (!v || v === S.game.title) { titleIn.value = S.game.title; return; } if (!(await saveMeta({ title: v }, t('js.studio.nameSaved')))) titleIn.value = S.game.title; });
$('#st-icon').addEventListener('click', () => {
  const s = sheet({ title: t('js.studio.pickIcon'), content: `<div class="emojigrid">${S.icons.map(e => `<button type="button" data-emoji="${esc(e)}" aria-pressed="${e === S.game.icon}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>` });
  s.el.addEventListener('click', async e => { const b = e.target.closest('[data-emoji]'); if (!b) return; if (await saveMeta({ icon: b.dataset.emoji })) s.close(); });
});
$('#st-settings').addEventListener('click', () => {
  const g = S.game;
  const s = sheet({ title: `⚙️ ${t('js.studio.settings.title')}`, content: `<form id="setform">
    <div class="field"><label for="set-desc">${E('js.studio.settings.about')}</label><textarea class="input" id="set-desc" maxlength="600" rows="3" dir="auto">${esc(g.description)}</textarea><span class="err" id="set-desc-err"></span></div>
    <div class="field"><label for="set-cat">${E('js.studio.settings.kind')}</label><select class="input" id="set-cat">${S.categories.map(([k, i, l]) => `<option value="${k}" ${k === g.category ? 'selected' : ''}>${i} ${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="set-tags">${E('js.studio.settings.tags')}</label><input class="input" id="set-tags" maxlength="200" dir="auto" value="${esc(g.tags)}" placeholder="${E('js.studio.settings.tagsPlaceholder')}"><span class="hint">${E('js.studio.settings.tagsHint')}</span><span class="err" id="set-tags-err"></span></div>
    <div class="field"><span id="set-or-l"><b>${E('js.studio.settings.orientation')}</b></span><div class="seg" role="group" aria-labelledby="set-or-l" id="set-or">${['any', 'portrait', 'landscape'].map(k => `<button type="button" data-or="${k}" aria-pressed="${k === g.orientation}">${E(`js.studio.settings.or.${k}`)}</button>`).join('')}</div></div>
    <div class="field"><label for="set-pl">${E('js.studio.settings.players')}</label><select class="input" id="set-pl">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === g.players_max ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field"><span id="set-cov-l"><b>${E('js.studio.settings.color')}</b></span><div class="covergrid" role="group" aria-labelledby="set-cov-l">${S.covers.map(c => `<button type="button" class="cover-${c}" data-cover="${c}" aria-pressed="${c === g.cover}" aria-label="${E(`js.studio.covers.${c}`)}"></button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn btn-primary" type="submit">${E('js.studio.settings.save')}</button></div></form>` });
  let or = g.orientation, cover = g.cover;
  s.el.addEventListener('click', e => {
    const o = e.target.closest('[data-or]'); if (o) { or = o.dataset.or; $$('[data-or]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === o))); }
    const c = e.target.closest('[data-cover]'); if (c) { cover = c.dataset.cover; $$('[data-cover]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === c))); }
  });
  $('#setform', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api(`/api/studio/${ID}/meta`, { method: 'POST', body: { description: $('#set-desc', s.el).value, category: $('#set-cat', s.el).value, tags: $('#set-tags', s.el).value, orientation: or, players_max: +$('#set-pl', s.el).value, cover } });
      applyState(r.state); toast(t('js.studio.settings.saved')); s.close();
    } catch (err) {
      const f = err.data && err.data.field; const el = f && $(`#set-${f === 'description' ? 'desc' : f}-err`, s.el);
      if (el && !err.signedOut) el.textContent = err.message; else failed(err);
    }
  });
});

// ---------------------------------------------------------------- save + versions
$('#st-save').addEventListener('click', () => {
  if (!S.current) return toast(t('js.studio.save.buildFirst'));
  const s = sheet({ title: `💾 ${t('js.studio.save.title')}`, content: `<form id="saveform"><div class="field"><label for="save-note">${E('js.studio.save.label')}</label><input class="input" id="save-note" maxlength="80" dir="auto" placeholder="${E('js.studio.save.placeholder')}"></div><p class="small muted">${E('js.studio.save.hint')}</p><div class="sheet-actions"><button class="btn btn-primary" type="submit">${E('js.studio.save.button')}</button></div></form>` });
  $('#saveform', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    try { const r = await api(`/api/studio/${ID}/save`, { method: 'POST', body: { note: $('#save-note', s.el).value } }); applyState(r.state); toast(r.message); s.close(); }
    catch (err) { failed(err); }
  });
});
$('#st-history').addEventListener('click', () => {
  if (!S.versions.length) return toast(t('js.studio.versions.none'));
  const row = v => `<li class="vrow"><span class="vn" dir="ltr">v${v.number}</span><span><span class="vnotes" dir="auto">${esc(v.notes || t('js.studio.versions.newVersion'))}</span><br><span class="vmeta">${esc(when(v.at))}</span>
    <span class="tags">${safetyChip(v.safety)}${v.current ? `<span class="stchip">✏️ ${E('js.studio.versions.editing')}</span>` : ''}${v.live ? `<span class="stchip good">🟢 ${E('js.studio.top.live')}</span>` : ''}${v.pending ? `<span class="stchip warn">⏳ ${E('js.studio.top.inReview')}</span>` : ''}</span></span>
    ${v.current ? '' : `<button class="btn btn-sm" type="button" data-restore="${esc(v.id)}"${S.turn ? ' disabled' : ''}>↩️ ${E('js.studio.versions.bringBack')}</button>`}</li>`;
  const s = sheet({ title: `🕘 ${t('js.studio.versions.title')}`, content: `<p class="small muted">${E('js.studio.versions.hint')}</p><ul class="vlist">${S.versions.map(row).join('')}</ul>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-restore]'); if (!b) return; b.disabled = true;
    try { const r = await api(`/api/studio/${ID}/restore`, { method: 'POST', body: { versionId: b.dataset.restore } }); applyState(r.state); setPreview(r.state.preview, r.state.current && r.state.current.id); toast(r.message); s.close(); }
    catch (err) { failed(err); b.disabled = false; }
  });
});

// ---------------------------------------------------------------- share, publish, update
const CLASS_CODES = ['pickClass', 'classGone', 'classRemoved'];
function shareSheet(mode) {
  if (!S.current) return toast(t('js.studio.share.buildFirst'));
  const live = S.live;
  const options = () => S.shareOptions || ['private', 'friends', 'public'];   // read again after a refused request
  // Before it is live, the dialog opens on what is waiting for a check (if anything), else on the game's level.
  let pick = live ? live.visibility : (S.pending && S.pending.visibility) || S.game.visibility || 'private';
  if (!live && !options().includes(pick)) pick = 'private';
  // Classes: ticked = the game's list (classes a teacher took it off can't be ticked). The first time nothing is
  // ticked: sharing with a class is the builder's own choice, and "All my classes" is one tap.
  const ticked = new Set(classShare().classes.filter(c => c.chosen && !c.removed).map(c => c.id));
  const cls = () => classShare().classes, open = () => cls().filter(c => !c.removed);
  // One class (and not taken off): the option says which, and there is nothing to tick. Several: a list to tick.
  const single = () => (cls().length === 1 && open().length === 1 ? open()[0] : null);
  const many = () => cls().length > 1;
  const classOption = k => {
    const one = single(), none = !open().length;
    const text = none ? E('js.studio.share.allRemoved', { count: cls().length }) : one ? t('js.studio.share.classOne', { name: `<bdi>${esc(one.name)}</bdi>` }) : E('js.studio.share.classMany');
    const [e, w] = visOf(k, many() ? cls().length : 1);
    return `<button type="button" data-vis="${k}" aria-pressed="${k === pick}"${none ? ' aria-disabled="true"' : ''}${many() && !none ? ` aria-controls="cp" aria-expanded="${k === pick}"` : ''}><b>${e} ${esc(w)}</b><span>${text}</span></button>${many() ? classPick() : ''}`;
  };
  const classPick = () => {
    const boxes = cls().map((c, i) => {
      const name = classShare().multiSchool ? t('js.studio.share.classInSchool', { class: `<bdi>${esc(c.name)}</bdi>`, school: `<span class="muted"><bdi>${esc(c.school)}</bdi></span>` }) : `<bdi>${esc(c.name)}</bdi>`;
      return `<label class="cp-row${c.removed ? ' is-off' : ''}"><input type="checkbox" id="cp-${i}" value="${esc(c.id)}" data-class${c.removed ? ` disabled aria-describedby="cp-${i}-off"` : ticked.has(c.id) ? ' checked' : ''}><span>${name}${c.removed ? `<span class="cp-off" id="cp-${i}-off">${E('js.studio.share.classRemoved')}</span>` : ''}</span></label>`;
    });
    const ids = cls().map((c, i) => (c.removed ? '' : `cp-${i}`)).filter(Boolean).join(' ');
    return `<fieldset class="classpick" id="cp"${pick === 'class' ? '' : ' hidden'}><legend>${E('js.studio.share.classesLegend')}</legend>
      <div class="cp-list"><label class="cp-row cp-all"><input type="checkbox" id="cp-all" aria-controls="${ids}"><span><b>${E(cls().some(c => c.removed) ? 'js.studio.share.allOpenClasses' : 'js.studio.share.allClasses')}</b></span></label>${boxes.join('')}</div>
      <p class="cp-later">${E('js.studio.share.classLater')}</p><p class="cp-err" id="cp-err" role="alert"></p></fieldset>`;
  };
  const optsHtml = () => options().filter(k => VIS[k] && (k !== 'class' || cls().length))
    .map(k => (k === 'class' ? classOption(k) : `<button type="button" data-vis="${k}" aria-pressed="${k === pick}"><b>${VIS[k][0]} ${esc(VIS[k][1])}</b><span>${esc(S.shareText[k])}</span></button>`)).join('');
  const link = live ? `<div class="field"><label for="share-link">${E('js.studio.share.link')}</label><div class="row"><input class="input" id="share-link" dir="ltr" readonly value="${esc(location.origin + S.shareUrl)}" style="flex:1;min-width:0"><button class="btn" type="button" id="share-copy">📋 ${E('js.studio.share.copy')}</button></div></div>` : '';
  const title = live ? `🔗 ${t('js.studio.share.titleLive')}` : mode === 'publish' ? `🚀 ${t('js.studio.share.titlePublish')}` : `🔗 ${t('js.studio.share.titleWho')}`;
  const s = sheet({ title, content: `${live ? `<p>${E('js.studio.share.playersGet', { number: live.number })}</p>` : `<p>${E('js.studio.share.pickWho', { number: S.current.number })}</p>`}<div class="vischoice" role="group" aria-label="${E('js.studio.share.whoLabel')}">${optsHtml()}</div><p class="small muted" id="vis-hint"></p>${link}<div class="sheet-actions"><button class="btn btn-primary" type="button" id="vis-go">${live ? E('js.studio.share.save') : E('js.studio.top.publish')}</button></div>` });
  const choice = $('.vischoice', s.el);
  // Changing who can play a live game shares its live version; publishing shares the version being edited.
  const hint = () => { $('#vis-hint', s.el).textContent = pick === 'public' ? t('js.studio.share.publicHint') : isGroup(pick) && needsCheck(live ? live.id : S.current.id) ? t('js.studio.share.groupHint') : ''; };
  const boxes = () => $$('input[data-class]', s.el);
  const err = msg => { const el = $('#cp-err', s.el); if (el) el.textContent = msg || ''; };
  const focusFirst = () => { const f = [$('#cp-all', s.el), ...boxes()].find(x => x && !x.disabled); if (f) f.focus(); };
  // "All my classes": ticked when every class that can be picked is, half-ticked when only some are.
  const syncAll = () => {
    const all = $('#cp-all', s.el); if (!all) return;
    const on = boxes().filter(b => !b.disabled), n = on.filter(b => b.checked).length;
    all.checked = !!on.length && n === on.length; all.indeterminate = n > 0 && n < on.length; all.disabled = !on.length;
  };
  const redraw = () => { choice.innerHTML = optsHtml(); syncAll(); };
  syncAll(); hint();
  // Keyboard and switch users start on what is chosen now, not on the first option.
  { const on = $('[data-vis][aria-pressed="true"]', s.el); if (on) on.focus(); }
  s.el.addEventListener('change', e => {
    const b = e.target;
    if (b.id === 'cp-all') boxes().forEach(x => { if (!x.disabled) x.checked = b.checked; });
    if (b.id !== 'cp-all' && !b.matches('input[data-class]')) return;
    ticked.clear(); boxes().filter(x => x.checked).forEach(x => ticked.add(x.value));
    syncAll(); err('');
  });
  s.el.addEventListener('click', async e => {
    const v = e.target.closest('[data-vis]');
    if (v) {
      if (v.getAttribute('aria-disabled') === 'true') return;   // every class took this game off: nothing to pick
      pick = v.dataset.vis; $$('[data-vis]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === v)));
      const cp = $('#cp', s.el); if (cp) cp.hidden = pick !== 'class';
      const cb = $('[data-vis="class"][aria-controls]', s.el); if (cb) cb.setAttribute('aria-expanded', String(pick === 'class'));
      hint(); return;
    }
    if (e.target.closest('#share-copy')) { (await copyText(location.origin + S.shareUrl)) ? toast(`${t('js.studio.share.copied')} ${S.shareText[S.live.visibility]}`) : toast(t('js.studio.share.copyFailed'), { bad: true }); return; }
    const go = e.target.closest('#vis-go'); if (!go) return;
    let classIds;
    if (pick === 'class') {
      // Nothing to send when the builder is in no class it can share with (every one left, or took the game off).
      if (!open().length) { toast(t('js.studio.share.allRemoved', { count: cls().length }), { bad: true }); return; }
      classIds = single() ? [single().id] : [...ticked];
      if (!classIds.length) { err(t('js.studio.share.pickClass')); focusFirst(); return; }
      const now = new Set(classShare().live.map(c => c.id));
      if (live && live.visibility === 'class' && classIds.length === now.size && classIds.every(id => now.has(id))) { s.close(); return; }
    } else if (live && pick === live.visibility) { s.close(); return; }
    go.disabled = true;
    try {
      const r = await api(`/api/studio/${ID}/${live ? 'visibility' : 'publish'}`, { method: 'POST', body: { visibility: pick, ...(classIds ? { classIds } : {}) } });
      applyState(r.state); toast(r.message, { ms: 5000 }); s.close();
    } catch (er) {
      if (er.signedOut) return failed(er);
      applyState(er.data && er.data.state); go.disabled = false;
      // A class can't be picked any more (left it, or a teacher took the game off it): show the list as it is now and
      // say why next to it.
      if (pick === 'class' && CLASS_CODES.includes(er.data && er.data.code) && many()) {
        for (const id of [...ticked]) if (!open().some(c => c.id === id)) ticked.delete(id);
        redraw(); err(er.message); focusFirst();
        return;
      }
      if (pick === 'class' && CLASS_CODES.includes(er.data && er.data.code)) redraw();
      toast(er.message + (er.data && er.data.reasons && er.data.reasons.length ? ' ' + er.data.reasons.join(' ') : ''), { bad: true, ms: 6000 });
    }
  });
}
async function updateLive() {
  if (!S.live || !S.current) return;
  const pub = S.live.visibility === 'public';
  // A class or school game updates at once unless the safety robot flagged the new version (then a person checks it).
  const text = pub ? E('js.studio.update.publicText', { live: S.live.number }) : isGroup(S.live.visibility) && needsCheck(S.current.id) ? E('js.studio.update.groupText', { live: S.live.number }) : E('js.studio.update.now');
  const s = sheet({ title: `⬆️ ${t('js.studio.update.title')}`, content: `<p>${t('js.studio.update.text', { live: `<b>${E('js.studio.update.version', { number: S.live.number })}</b>`, number: `<b>${E('js.studio.update.version', { number: S.current.number })}</b>` })}</p><p>${text}</p><div class="sheet-actions"><button class="btn" type="button" data-close>${E('js.studio.update.notYet')}</button><button class="btn btn-hot" type="button" id="upd-go">⬆️ ${E('js.studio.update.button')}</button></div>` });
  s.el.querySelector('[data-close]').addEventListener('click', s.close);
  $('#upd-go', s.el).addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await api(`/api/studio/${ID}/update`, { method: 'POST', body: {} }); applyState(r.state); toast(r.message, { ms: 5000 }); s.close(); }
    catch (err) { if (err.signedOut) return failed(err); applyState(err.data && err.data.state); toast(err.message, { bad: true, ms: 6000 }); e.target.disabled = false; }
  });
}
$('#st-share').addEventListener('click', () => shareSheet('share'));
$('#st-publish').addEventListener('click', () => {
  const canUpdate = S.live && S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
  if (canUpdate) updateLive(); else shareSheet('publish');
});

renderTop(); renderLive(); renderSafety(); renderTurns(); renderLog();
// A build running now (also one started in another tab or on another device): its message and a "still working" row
// at once (no greeting), then the live stream replays what it did so far.
if (S.turn) startTurnUI(S.turn, { waiting: true });
syncCompose(); openLive();
// A hidden page with nothing building lets its stream go; when it comes back, builds may have started or ended.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!LIVE.turnId && !LIVE.pendingCid && !LIVE.check && !LIVE.stopped) { closeLive(); LIVE.hidden = true; } return; }
  if (LIVE.hidden) { LIVE.hidden = false; resync(); }
  else if (!LIVE.ctrl && !LIVE.stopped) { LIVE.tries = 0; openLive(); }
});
addEventListener('online', () => { if (!LIVE.ctrl && !LIVE.stopped && !LIVE.hidden) { LIVE.tries = 0; openLive(); } });
// Opened from a lesson ("build a game about..."): the idea is ready in the box; the builder presses Send.
const ask = new URLSearchParams(location.search).get('ask');
if (ask && !input.value) { input.value = ask.slice(0, 600); autosize(); input.focus(); history.replaceState(null, '', location.pathname); }
