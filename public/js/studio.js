// The Studio: chat with the Builder (SSE over fetch), live preview in the player sandbox, versions, sharing and publishing.
import { api, toast, sheet, pageData, signedOut, tappedJustNow, $, $$, esc, copyText, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';

let S = pageData();
const ID = S.game.id;
const log = $('#st-log'), input = $('#st-input'), frame = $('#st-frame'), stage = $('#st-stage'), device = $('#st-device');
let busy = false, pro = false;
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
function bubble(cls, text) { const d = document.createElement('div'); d.className = `msg ${cls}`; d.dir = 'auto'; d.textContent = text || ''; log.appendChild(d); return d; }
function attHtml(list) {
  return `<div class="att-list">${list.map(u => `<span class="att">${u.kind === 'image' ? `<img src="/api/studio/${ID}/uploads/${esc(u.id)}" alt="">` : `<span class="fi" aria-hidden="true">${u.kind === 'pdf' ? '📄' : '📝'}</span>`}<span class="nm">${esc(u.name)}</span></span>`).join('')}</div>`;
}
function userBubble(text, uploads = []) {
  const d = bubble('me', text);
  if (uploads.length) d.insertAdjacentHTML('beforeend', attHtml(uploads));
  return d;
}
function card(cls, inner) { const d = document.createElement('div'); d.className = `ev ${cls}`; d.innerHTML = inner; log.appendChild(d); return d; }
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
  log.appendChild(d); return d;
}
function askBlock(a, active, into) {
  const b = into || bubble('bot', '');
  const q = document.createElement('span'); q.className = 'q'; q.textContent = a.question; b.appendChild(q);
  if (a.options && a.options.length) chips(a.options, active);
}
function renderLog() {
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
    }
  });
  if (!msgs.length) {
    if (!S.current) { askBlock({ question: t('js.studio.log.whatKind') }, true, bubble('bot', t('js.studio.log.hello'))); chips(START_CHIPS, true); }
    else { bubble('bot', t('js.studio.log.readyToPlay', { title: S.game.title })); chips(NEXT_CHIPS, true); }
  }
  scrollDown();
}

// After a dropped connection (or a reload mid-build) the server finishes the turn on its own: poll until it's
// done, then redraw the chat and preview from the saved state. -> true once the Builder is free again, false when it
// took too long, SIGNED_OUT when the sign-in ended meanwhile.
const SIGNED_OUT = 'signed-out';
async function waitForBuilder(maxMs = 10 * 60e3) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 3000));
    let st; try { st = await api(`/api/studio/${ID}`); } catch (err) { if (err.signedOut) return SIGNED_OUT; continue; }
    if (!st.busy) { S = { ...S, ...st }; renderLog(); if (S.preview) setPreview(S.preview); return true; }
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
  let cur = bubble('bot', ''); cur.innerHTML = `<span class="typing" aria-label="${E('js.studio.thinking')}"><i></i><i></i><i></i></span>`;
  let typing = true; scrollDown();
  const status = document.createElement('div'); status.className = 'st-busy'; status.dir = document.dir; status.textContent = `🤖 ${t('js.studio.working')}`; stage.appendChild(status);
  const textBubble = () => { if (!cur) cur = bubble('bot', ''); if (typing) { cur.textContent = ''; typing = false; } return cur; };
  const endBubble = () => { if (cur && typing) { cur.remove(); } cur = null; typing = false; };
  const handle = (ev, d) => {
    if (ev === 'text') { const b = textBubble(); b.textContent += d.text; }
    else if (ev === 'ask') { const b = cur && !typing ? cur : (endBubble(), bubble('bot', '')); askBlock(d, true, b); cur = null; }
    else if (ev === 'version') { endBubble(); versionCard(d, true); setPreview(d.preview); status.textContent = `🎮 ${t('js.studio.log.versionReady', { number: d.number })}`; }
    else if (ev === 'meta') { endBubble(); metaCard(d); S.game = { ...S.game, ...d }; renderTop(); }
    else if (ev === 'notes') { endBubble(); notesCard(d.checklist); }
    else if (ev === 'progress') { status.textContent = d.stage === 'building' ? `🔨 ${t('js.studio.building')} ${d.bytes ? Math.round(d.bytes / 1024) + ' KB' : ''}` : d.stage === 'testing' ? `🔍 ${t('js.studio.testing')}` : `✏️ ${t('js.studio.editing')}`; }
    else if (ev === 'refused') { endBubble(); const b = bubble('bot refused', `${d.message} ${d.suggestion}`); void b; if (d.chips && d.chips.length) chips(d.chips, true); }
    else if (ev === 'error') { endBubble(); bubble('err', d.message); }
    else if (ev === 'done') { if (typeof d.turnsLeft === 'number') { S.turnsLeft = d.turnsLeft; renderTurns(); } }
    scrollDown();
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
      mine.remove(); input.value = text; autosize(); signInAgainBubble();
    }
    else if (e.fromServer) bubble('err', e.message);
    else {
      // The connection dropped, but the Builder keeps going on the server: wait for it, then show what it made.
      status.textContent = `📶 ${t('js.studio.reconnecting')}`;
      // If the message never reached the server, nothing new was saved: say so, so it can be sent again.
      const back = await waitForBuilder();
      if (back === SIGNED_OUT) signInAgainBubble();
      else if (!back || (S.chat || []).length <= savedBefore) bubble('err', t('js.studio.dropped'));
    }
  }
  finally {
    endBubble(); status.remove(); busy = false; $('#st-send').disabled = false; scrollDown();
    await refresh();
  }
}
$('#st-compose').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight + 4) + 'px'; }
input.addEventListener('input', autosize);
log.addEventListener('click', e => {
  const c = e.target.closest('[data-chip]'); if (c) { send(c.dataset.chip); return; }
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
// Opened from a lesson ("build a game about..."): the idea is ready in the box; the builder presses Send.
const ask = new URLSearchParams(location.search).get('ask');
if (ask && !input.value) { input.value = ask.slice(0, 600); autosize(); input.focus(); history.replaceState(null, '', location.pathname); }
if (S.busy) {
  toast(t('js.studio.stillFinishing'));
  busy = true; $('#st-send').disabled = true;
  waitForBuilder().then(back => { busy = false; $('#st-send').disabled = false; if (back === SIGNED_OUT) signInAgainBubble(); return refresh(); });
}
