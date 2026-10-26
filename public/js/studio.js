// The Studio: chat with the Builder (SSE over fetch), live preview in the player sandbox, versions, sharing and publishing.
import { api, toast, sheet, pageData, signedOut, tappedJustNow, $, $$, esc, copyText, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';

let S = pageData();
const ID = S.game.id;
const log = $('#st-log'), input = $('#st-input'), frame = $('#st-frame'), stage = $('#st-stage'), device = $('#st-device');
let busy = false, pro = false;
try { pro = localStorage.getItem('brb-pro') === '1'; } catch { /* private mode */ }
const SIZES = { phone: [390, 760], tablet: [820, 1100], landscape: [844, 390] };
const VIS = { private: ['🔒', t('js.studio.vis.private')], friends: ['👫', t('js.studio.vis.friends')], school: ['🏫', t('js.studio.vis.school')], public: ['🌍', t('js.studio.vis.public')] };
// Idea chips: keys a, b, c... under a prefix (missing letters are skipped).
const chipList = prefix => [...'abcdefgh'].map(k => t(`${prefix}.${k}`)).filter(x => !x.startsWith(prefix));
const START_CHIPS = chipList('js.studio.startChips');
const NEXT_CHIPS = chipList('js.studio.nextChips');
const when = at => { const d = new Date(at); return d.toLocaleDateString(INTL, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(INTL, { hour: 'numeric', minute: '2-digit' }); };
const safetyChip = s => ({ pass: `<span class="stchip good">✅ ${esc(t('js.studio.safety.chipPass'))}</span>`, flag: `<span class="stchip warn">⚠️ ${esc(t('js.studio.safety.chipFlag'))}</span>`, fail: `<span class="stchip bad">⛔ ${esc(t('js.studio.safety.chipFail'))}</span>` }[s] || '<span class="stchip">…</span>');

// ---------------------------------------------------------------- state + top
async function refresh() {
  try { S = { ...S, ...(await api(`/api/studio/${ID}`)) }; } catch { return; }
  renderTop(); renderLive(); renderSafety(); renderTurns();
}
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
function renderTurns() { $('#st-turns').textContent = `🔋 ${t('js.studio.turns', { left: S.turnsLeft, total: S.dailyTurns })}`; }
const E = (key, vars) => esc(t(key, vars));
function renderLive() {
  const box = $('#st-live'); const parts = [];
  const cur = S.current ? `✏️ ${E('js.studio.live.editing', { number: S.current.number })}` : `✏️ ${E('js.studio.live.nothingYet')}`;
  if (S.game.hidden_reason) parts.push(`<p class="note">⚠️ ${E('js.studio.live.hidden')}</p>`);
  if (S.live) {
    const [e, w] = VIS[S.live.visibility] || ['', S.live.visibility];
    parts.push(`<span class="stchip good">🟢 ${E('js.studio.live.liveVersion', { number: S.live.number, who: `${e} ${w}` })}</span><span class="vtag">${cur}</span>`);
    const canUpdate = S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
    if (canUpdate) parts.push(`<button class="btn btn-hot btn-sm st-update" type="button" data-act="update">⬆️ ${E('js.studio.live.updateTo', { number: S.current.number })}</button>`);
    if (S.pending && S.pending.id === S.live.id) parts.push(`<p class="note">⏳ ${E(S.live.visibility === 'friends' ? 'js.studio.live.waitingFriends' : 'js.studio.live.waitingYou')}</p>`);
    else if (S.pending) parts.push(`<p class="note">⏳ ${E('js.studio.live.pendingUpdate', { pending: S.pending.number, live: S.live.number })}</p>`);
    else if (canUpdate) parts.push(`<p class="note info">${E('js.studio.live.playersOn', { live: S.live.number, number: S.current.number })}${S.live.visibility === 'public' ? ' ' + E('js.studio.live.publicCheck') : ''}</p>`);
  } else {
    parts.push(`<span class="stchip">${esc(S.status.label)}${S.status.code === 'draft' ? ' · ' + E('js.studio.live.onlyYou') : ''}</span><span class="vtag">${cur}</span>`);
    if (S.pending) parts.push(`<p class="note">⏳ ${E('js.studio.live.pendingNew', { number: S.pending.number })}</p>`);
  }
  if (S.game.review_note) parts.push(`<p class="note">💬 ${E('js.studio.live.reviewer', { note: S.game.review_note })}</p>`);
  box.innerHTML = parts.join('');
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
function setPreview(url) {
  if (!url) return;
  S.preview = url; $('#st-empty').hidden = true;
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
 *  empties the log and leaves the card detached, hence the parentNode check). */
function place(el) { log.insertBefore(el, live && live.el.parentNode === log ? live.el : null); return el; }
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
function renderLog() {
  if (live) live.remove();
  log.innerHTML = '';
  const msgs = S.chat || [];
  msgs.forEach((m, i) => {
    const last = i === msgs.length - 1;
    if (m.role === 'user') { userBubble(m.text, m.uploads || []); return; }
    const b = m.text ? bubble('bot' + (m.refused ? ' refused' : ''), m.text) : null;
    for (const [name, d] of m.events || []) {
      if (name === 'version') versionCard(d, false);
      else if (name === 'notes') notesCard(d.checklist);
      else if (name === 'meta') metaCard(d);
      else if (name === 'ask') askBlock(d, last, b && !b.nextSibling ? b : null);
      else if (name === 'steps') { const c = stepsCard(d); if (c) place(c); }   // folded; rows are built when opened
    }
  });
  if (!msgs.length) {
    if (!S.current) { askBlock({ question: t('js.studio.log.whatKind') }, true, bubble('bot', t('js.studio.log.hello'))); chips(START_CHIPS, true); }
    else { bubble('bot', t('js.studio.log.readyToPlay', { title: S.game.title })); chips(NEXT_CHIPS, true); }
  }
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
// sending/offline/waiting).
const STEP_ICON = { screen: '🛡️', blocks: '🧱', think: '🧠', write: '✍️', edit: '✏️', fix: '🛠️', template: '🏝️', check: '🔒', name: '🏷️', playtest: '📱', notes: '🧪', ask: '💬', sending: '📨', offline: '📶', waiting: '⏳' };
const SERVER_STEPS = new Set(['screen', 'blocks', 'think', 'write', 'edit', 'fix', 'template', 'check', 'name', 'playtest', 'notes', 'ask']);
// Timed rows run until the next row starts (spinner, seconds); the others take milliseconds and arrive done.
const TIMED = new Set(['screen', 'blocks', 'think', 'write', 'edit', 'fix', 'playtest', 'sending', 'offline', 'waiting']);
const AUTHOR = new Set(['write', 'edit', 'fix']);
// An instant row's learning line is shown under the next timed row ("Just now: …"): one per row, most useful first,
// each at most once a turn.
const JUST_NOW = ['check', 'template', 'notes', 'name', 'ask'];
const THINK_WHY = new Set(['start', 'look', 'scan', 'retry', 'next']);
const FACTS = [...'abcdefghij'];
const TIP_JUST = 6000, TIP_OWN = 8000, TIP_THINK = 8000, TIP_FACT = 11000;   // how long each 💡 line stays
const SHOW_AFTER = 700;    // the live card appears once a turn has lasted this long (a quick turn goes straight to its summary)
const MIN_SHOWN = 1200;    // once shown, it stays at least this long before it folds (no flash)
const SEC_AFTER = 3000;    // a running step's seconds appear after 3 s ("0 sec" reads as stuck)
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
    return ST(`think.${done ? 'done' : 'now'}.${why === 'start' && f.g ? 'startGame' : why}`, { n: f.n || 1 });
  }
  if (k === 'check') return ST(`check.${['pass', 'flag', 'fail'].includes(f.st) ? f.st : 'flag'}`, { v: f.v || 1, k: f.k || 1 });
  if (k === 'name') {
    const title = f.title ? isolate(f.title) : '', icon = f.icon || '';
    return title && icon ? ST('name.titleIcon', { title, icon }) : title ? ST('name.title', { title }) : icon ? ST('name.icon', { icon }) : ST('name.details');
  }
  if (k === 'template' || k === 'notes' || k === 'ask') return ST(`${k}.done`);
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
/** Screen readers hear step changes only (a new step, the plan, a problem, the summary), never counters or seconds.
 *  Changes that come within 0.4 s are read as one message: at most three, and a problem is never dropped. */
function announce(text, urgent = false) {
  sayQ.push({ text, urgent });
  if (!sayTimer) sayTimer = setTimeout(sayNow, 400);
}
function sayNow() {
  sayTimer = 0;
  const box = $('#st-steps-live'), q = sayQ; sayQ = [];
  if (!box || !q.length) return;
  const urgent = q.filter(x => x.urgent).slice(-2), rest = q.filter(x => !x.urgent).slice(urgent.length - 3);
  box.textContent = q.filter(x => urgent.includes(x) || rest.includes(x)).map(x => x.text).join('. ');
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
  const list = mk('ol', 'stp-list');
  el.append(head, list);
  const rows = [], byI = new Map();
  const turn = { justShown: new Set(), thinkShown: false };   // 💡 lines already shown this turn
  let expanded = false, mode = null, pillEl = null, shownAt = 0, heard = false;
  const newest = () => rows[rows.length - 1];
  const paint = r => drawRow(r.li, { key: r.key, f: r.f, done: r.done, paused: r.paused, stopped: r.stopped, current: r === newest(), open: r.open, live: true, spoke: r.spoke, at: r.at, toggle: r.toggle });
  function show() {
    clearTimeout(showTimer);
    if (shownAt || !timer) return;
    const stick = nearBottom();
    log.appendChild(el); shownAt = Date.now(); retip(newest());
    if (stick) scrollDown();
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
    else if (kind === 'think') { withIcon(tip, '🤔', ST('think.learn.thinking')); if (tipsOn) { turn.thinkShown = true; r.thinkHere = true; } }
    else if (kind) {
      if (r.factFor !== kind) { r.factFor = kind; r.factText = ST(`facts.${FACTS[factNext++ % FACTS.length]}`); }
      withIcon(tip, '🌟', r.factText, ST('factLabel'));
    } else tip.textContent = '';
  }
  function push(key, facts, i) {
    const now = Date.now();
    const last = newest();
    if (last && last.key === 'sending') { last.li.remove(); rows.pop(); }   // the first real step replaces it
    const prev = newest();
    // A new step ends the one before. A dropped connection doesn't: that step may still be running on the server.
    if (prev && !prev.done && !prev.paused) { if (key === 'offline') prev.paused = true; else prev.done = true; prev.dur = now - prev.at; }
    if (SERVER_STEPS.has(key)) heard = true;
    if (key === 'think') mode = 'ai'; else if (key === 'blocks') mode = 'blocks';
    const r = { key, f: { ...facts }, at: now, li: mk('li', 'stp-row'), open: false, done: !TIMED.has(key), paused: false, stopped: false, spoke: false, just: TIMED.has(key) ? justFor(key) : null };
    r.li.dataset.step = key;
    r.toggle = () => { r.open = !r.open; paint(r); };
    rows.push(r); if (i) byI.set(i, r);
    list.appendChild(r.li);
    if (prev) paint(prev);
    paint(r); retip(r); fold(); pill();
    if (key !== 'sending') announce(stepLabel(key, r.f, r.done), r.f.ok === false || (key === 'check' && r.f.st === 'fail'));
  }
  function tick() {
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
    add(d) { if (d && SERVER_STEPS.has(d.key)) { const { i, key, ...facts } = d; push(key, facts, i); } },
    /** The page's own rows: offline (the stream dropped), waiting (opened while the Builder works), sending. */
    local(key) {
      // Until a step has arrived, nobody knows whether the message reached the server: say "checking", not "keeps going".
      push(key, key === 'offline' && !heard ? { unsure: 1 } : {}, 0);
      if (key !== 'sending') show();
    },
    /** The server said it is busy with this turn: the offline row can say the Builder keeps going. */
    confirm() {
      const r = newest(); if (!r || r.key !== 'offline' || !r.f.unsure) return;
      delete r.f.unsure; paint(r); retip(r); pill(); announce(stepLabel(r.key, r.f, false));
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
    stop() { const r = newest(); if (!r) return; if (!r.done) { r.done = true; r.dur = Date.now() - r.at; } r.stopped = true; paint(r); pill(); },
    pill(e) { pillEl = e; pill(); },
    retip() { retip(newest()); },
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
  return ST(rec.p === 'ai' ? 'summaryAi' : 'summaryBlocks', { count, time: fmtDur(rec.ms) }) + (rec.end && rec.end !== 'ok' ? ` · ${ST('stopped')}` : '');
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

// After a dropped connection (or a reload mid-build) the server finishes the turn on its own: poll until it's
// done, then redraw the chat and preview from the saved state. onBusy() runs when a poll says it is still working.
// -> true once the Builder is free again, false when it took too long, SIGNED_OUT when the sign-in ended meanwhile.
const SIGNED_OUT = 'signed-out';
async function waitForBuilder(onBusy = null, maxMs = 10 * 60e3) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 3000));
    let st; try { st = await api(`/api/studio/${ID}`); } catch (err) { if (err.signedOut) return SIGNED_OUT; continue; }
    if (!st.busy) { S = { ...S, ...st }; renderLog(); if (S.preview) setPreview(S.preview); return true; }
    if (onBusy) onBusy();
  }
  return false;
}
/** Signed out meanwhile (timed out, or on another device; the game itself is saved): say so in the chat, with a button
 *  that signs in again and comes back here with the unsent message. */
function signInAgainBubble() {
  const b = bubble('err', t('js.app.signedOut')); const go = document.createElement('button');
  go.type = 'button'; go.className = 'btn btn-sm btn-primary'; go.textContent = t('js.studio.signInAgain');
  go.addEventListener('click', () => signedOut([input])); b.append(' ', go); scrollDown();
}
/** A failed Studio action: signed out goes to the sign-in page (keeping the unsent message), anything else is a toast. */
function failed(err) { if (err.signedOut) signedOut([input]); else toast(err.message, { bad: true }); }

// ---------------------------------------------------------------- sending (SSE over fetch)
let pending = []; // uploads waiting to be sent: { id, name, kind, url }
async function send(text) {
  text = String(text || '').trim();
  const ups = pending.filter(u => u.id);
  if (busy) return toast(t('js.studio.stillWorking'));
  if (!text && !ups.length) { input.focus(); return; }
  busy = true; $('#st-send').disabled = true;
  const savedBefore = (S.chat || []).length;   // to tell, after a dropped connection, whether the server got the message
  $$('.qchips').forEach(c => c.classList.add('used'));
  const mine = userBubble(text, ups); input.value = ''; autosize();
  pending = []; renderAttach();
  // The steps card takes the reply's place at the bottom until the turn ends (it appears after 0.7 s, so a quick
  // turn goes straight to its summary); the pill on the preview says the same.
  let cur = null;   // the bot bubble text is streaming into
  live = liveSteps(); live.local('sending');
  const status = document.createElement('div'); status.className = 'st-busy'; status.dir = document.dir; stage.appendChild(status);
  live.pill(status); scrollDown();
  const textBubble = () => { if (!cur) cur = bubble('bot', ''); return cur; };
  const endBubble = () => { cur = null; };
  const handle = (ev, d) => {
    const stick = nearBottom();   // follow the turn only when the chat is at the bottom: never pull a reader back down
    if (ev === 'stepinfo') { if (live) live.patch(d); }
    else if (ev === 'text') { const b = textBubble(); b.textContent += d.text; if (live) live.spoke(); }
    else if (ev === 'step') { if (live) live.add(d); }
    else if (ev === 'ask') { askBlock(d, true, cur || bubble('bot', '')); cur = null; }
    else if (ev === 'version') { endBubble(); versionCard(d, true); setPreview(d.preview); }
    else if (ev === 'meta') { endBubble(); metaCard(d); S.game = { ...S.game, ...d }; renderTop(); }
    else if (ev === 'notes') { endBubble(); notesCard(d.checklist); }
    else if (ev === 'refused') { endBubble(); const b = bubble('bot refused', `${d.message} ${d.suggestion}`); void b; if (d.chips && d.chips.length) chips(d.chips, true); }
    else if (ev === 'error') { endBubble(); bubble('err', d.message); if (live) live.stop(); }
    else if (ev === 'done') {
      if (typeof d.turnsLeft === 'number') { S.turnsLeft = d.turnsLeft; renderTurns(); }
      if (live) live.finish(d.steps || null);   // no record: refused, limit, early error
    }
    if (stick) scrollDown();
  };
  try {
    const res = await fetch(`/api/studio/${ID}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ text, pro, uploads: ups.map(u => u.id) }) });
    if (!res.ok || !res.body) { let msg = t('js.studio.noAnswer'); try { msg = (await res.json()).error || msg; } catch { /* not JSON */ } const err = new Error(msg); err.fromServer = true; err.signedOut = res.status === 401; throw err; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let finished = false;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of block.split('\n')) { if (line.startsWith('event: ')) ev = line.slice(7); else if (line.startsWith('data: ')) data += line.slice(6); }
        if (!data) continue;
        if (ev === 'done') finished = true;
        try { handle(ev, JSON.parse(data)); } catch { /* bad chunk */ }
      }
    }
    if (!finished) throw new Error('stream ended early');
  } catch (e) {
    endBubble();
    if (e.signedOut) {
      // The message never reached the Builder: it goes back in the box, and signing in again brings it back here.
      if (live) live.remove();
      mine.remove(); input.value = text; autosize(); signInAgainBubble();
    }
    else if (e.fromServer) { if (live) live.remove(); bubble('err', e.message); }
    else {
      // The connection dropped, but the Builder keeps going on the server: wait for it, then show what it made
      // (renderLog() draws the saved reply, with its steps summary, in place of this card).
      if (live) live.local('offline');
      // If the message never reached the server, nothing new was saved: say so, so it can be sent again.
      const back = await waitForBuilder(() => { if (live) live.confirm(); });
      if (live) live.remove();
      if (back === SIGNED_OUT) signInAgainBubble();
      else if (!back || (S.chat || []).length <= savedBefore) bubble('err', t('js.studio.dropped'));
    }
  }
  finally {
    endBubble(); if (live) live.remove(); status.remove(); busy = false; $('#st-send').disabled = false; scrollDown();
    await refresh();
  }
}
$('#st-compose').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight + 4) + 'px'; }
input.addEventListener('input', autosize);
log.addEventListener('click', e => {
  const c = e.target.closest('[data-chip]'); if (c) { send(c.dataset.chip); return; }
  if (e.target.closest('.stp-tips')) setTips(!tipsOn);   // "💡 Tips: on/off" in any steps card (one setting for all)
});
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'fix') send(`${t('js.studio.fixMessage', { number: S.current ? S.current.number : '' })} ${(S.current && S.current.issues || []).map(i => i.message).join(' ')}`.trim());
  else if (a.dataset.act === 'see') { $('.st-preview').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (a.dataset.act === 'update') updateLive();
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
    ${v.current ? '' : `<button class="btn btn-sm" type="button" data-restore="${esc(v.id)}">↩️ ${E('js.studio.versions.bringBack')}</button>`}</li>`;
  const s = sheet({ title: `🕘 ${t('js.studio.versions.title')}`, content: `<p class="small muted">${E('js.studio.versions.hint')}</p><ul class="vlist">${S.versions.map(row).join('')}</ul>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-restore]'); if (!b) return; b.disabled = true;
    try { const r = await api(`/api/studio/${ID}/restore`, { method: 'POST', body: { versionId: b.dataset.restore } }); applyState(r.state); setPreview(r.state.preview); toast(r.message); s.close(); }
    catch (err) { failed(err); b.disabled = false; }
  });
});

// ---------------------------------------------------------------- share, publish, update
function shareSheet(mode) {
  if (!S.current) return toast(t('js.studio.share.buildFirst'));
  const live = S.live; let pick = live ? live.visibility : (S.game.visibility || 'private');
  const opts = (S.shareOptions || ['private', 'friends', 'public']).map(k => `<button type="button" data-vis="${k}" aria-pressed="${k === pick}"><b>${VIS[k][0]} ${VIS[k][1]}</b><span>${esc(S.shareText[k])}</span></button>`).join('');
  const link = live ? `<div class="field"><label for="share-link">${E('js.studio.share.link')}</label><div class="row"><input class="input" id="share-link" dir="ltr" readonly value="${esc(location.origin + S.shareUrl)}" style="flex:1;min-width:0"><button class="btn" type="button" id="share-copy">📋 ${E('js.studio.share.copy')}</button></div></div>` : '';
  const title = live ? `🔗 ${t('js.studio.share.titleLive')}` : mode === 'publish' ? `🚀 ${t('js.studio.share.titlePublish')}` : `🔗 ${t('js.studio.share.titleWho')}`;
  const s = sheet({ title, content: `${live ? `<p>${E('js.studio.share.playersGet', { number: live.number })}</p>` : `<p>${E('js.studio.share.pickWho', { number: S.current.number })}</p>`}<div class="vischoice" role="group" aria-label="${E('js.studio.share.whoLabel')}">${opts}</div><p class="small muted" id="vis-hint"></p>${link}<div class="sheet-actions"><button class="btn btn-primary" type="button" id="vis-go">${live ? E('js.studio.share.save') : E('js.studio.top.publish')}</button></div>` });
  const hint = () => { $('#vis-hint', s.el).textContent = pick === 'public' ? t('js.studio.share.publicHint') : ''; };
  hint();
  s.el.addEventListener('click', async e => {
    const v = e.target.closest('[data-vis]');
    if (v) { pick = v.dataset.vis; $$('[data-vis]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === v))); hint(); return; }
    if (e.target.closest('#share-copy')) { (await copyText(location.origin + S.shareUrl)) ? toast(`${t('js.studio.share.copied')} ${S.shareText[S.live.visibility]}`) : toast(t('js.studio.share.copyFailed'), { bad: true }); return; }
    const go = e.target.closest('#vis-go'); if (!go) return;
    if (live && pick === live.visibility) { s.close(); return; }
    go.disabled = true;
    try {
      const r = await api(`/api/studio/${ID}/${live ? 'visibility' : 'publish'}`, { method: 'POST', body: { visibility: pick } });
      applyState(r.state); toast(r.message, { ms: 5000 }); s.close();
    } catch (err) {
      if (err.signedOut) return failed(err);
      applyState(err.data && err.data.state); toast(err.message + (err.data && err.data.reasons && err.data.reasons.length ? ' ' + err.data.reasons.join(' ') : ''), { bad: true, ms: 6000 }); go.disabled = false;
    }
  });
}
async function updateLive() {
  if (!S.live || !S.current) return;
  const pub = S.live.visibility === 'public';
  const s = sheet({ title: `⬆️ ${t('js.studio.update.title')}`, content: `<p>${t('js.studio.update.text', { live: `<b>${E('js.studio.update.version', { number: S.live.number })}</b>`, number: `<b>${E('js.studio.update.version', { number: S.current.number })}</b>` })}</p><p>${pub ? E('js.studio.update.publicText', { live: S.live.number }) : E('js.studio.update.now')}</p><div class="sheet-actions"><button class="btn" type="button" data-close>${E('js.studio.update.notYet')}</button><button class="btn btn-hot" type="button" id="upd-go">⬆️ ${E('js.studio.update.button')}</button></div>` });
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
// Opened from a lesson ("build a game about..."): the idea is ready in the box; the builder presses Send.
const ask = new URLSearchParams(location.search).get('ask');
if (ask && !input.value) { input.value = ask.slice(0, 600); autosize(); input.focus(); history.replaceState(null, '', location.pathname); }
if (S.busy) {
  // The card's "still working on the server" row says it (no toast on top of it).
  busy = true; $('#st-send').disabled = true;
  live = liveSteps(); live.local('waiting'); scrollDown();
  waitForBuilder().then(back => { if (live) live.remove(); busy = false; $('#st-send').disabled = false; if (back === SIGNED_OUT) signInAgainBubble(); return refresh(); });
}
