// The Studio: chat with the Builder (SSE over fetch), live preview in the player sandbox, versions, sharing and publishing.
import { api, toast, sheet, pageData, $, $$, esc, copyText, t } from '/js/app.js';
import { INTL } from '/js/i18n.js';

let S = pageData();
const ID = S.game.id;
const log = $('#st-log'), input = $('#st-input'), frame = $('#st-frame'), stage = $('#st-stage'), device = $('#st-device');
let busy = false, pro = false;
try { pro = localStorage.getItem('brb-pro') === '1'; } catch { /* private mode */ }
const SIZES = { phone: [390, 760], tablet: [820, 1100], landscape: [844, 390] };
const VIS = { private: ['🔒', t('js.studio.vis.private')], friends: ['👫', t('js.studio.vis.friends')], public: ['🌍', t('js.studio.vis.public')] };
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
  pb.classList.toggle('btn-coral', !S.live || !!canUpdate);
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
    if (canUpdate) parts.push(`<button class="btn btn-coral btn-sm st-update" type="button" data-act="update">⬆️ ${E('js.studio.live.updateTo', { number: S.current.number })}</button>`);
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
$('#st-reload').addEventListener('click', () => { if (!S.preview) return toast(t('js.studio.buildFirst')); frame.src = 'about:blank'; setTimeout(() => (frame.src = S.preview), 30); });
const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => toast(t('js.studio.noFullscreen'), { bad: true })); };
$('#st-full').addEventListener('click', full);
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data || e.data.brb !== 1) return; // only our sandboxed preview
  if (e.data.type === 'brb:fullscreen') { if (!!e.data.on !== !!document.fullscreenElement) full(); }
  else if (e.data.type === 'brb:gameover' && typeof e.data.score === 'number') toast(t('js.studio.roundOver', { score: e.data.score }));
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
// done, then redraw the chat and preview from the saved state. -> true once the Builder is free again.
async function waitForBuilder(maxMs = 10 * 60e3) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 3000));
    let st; try { st = await api(`/api/studio/${ID}`); } catch { continue; }
    if (!st.busy) { S = { ...S, ...st }; renderLog(); if (S.preview) setPreview(S.preview); return true; }
  }
  return false;
}

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
  userBubble(text, ups); input.value = ''; autosize();
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
    else if (ev === 'progress') { status.textContent = d.stage === 'building' ? `🔨 ${t('js.studio.building')} ${d.bytes ? Math.round(d.bytes / 1024) + ' KB' : ''}` : `✏️ ${t('js.studio.editing')}`; }
    else if (ev === 'refused') { endBubble(); const b = bubble('bot refused', `${d.message} ${d.suggestion}`); void b; if (d.chips && d.chips.length) chips(d.chips, true); }
    else if (ev === 'error') { endBubble(); bubble('err', d.message); }
    else if (ev === 'done') { if (typeof d.turnsLeft === 'number') { S.turnsLeft = d.turnsLeft; renderTurns(); } }
    scrollDown();
  };
  try {
    const res = await fetch(`/api/studio/${ID}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ text, pro, uploads: ups.map(u => u.id) }) });
    if (!res.ok || !res.body) { let msg = t('js.studio.noAnswer'); try { msg = (await res.json()).error || msg; } catch { /* not JSON */ } const err = new Error(msg); err.fromServer = true; throw err; }
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
    if (e.fromServer) bubble('err', e.message);
    else {
      // The connection dropped, but the Builder keeps going on the server: wait for it, then show what it made.
      status.textContent = `📶 ${t('js.studio.reconnecting')}`;
      // If the message never reached the server, nothing new was saved: say so, so it can be sent again.
      if (!(await waitForBuilder()) || (S.chat || []).length <= savedBefore) bubble('err', t('js.studio.dropped'));
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
      if (!res.ok) throw new Error(data.error || t('js.studio.uploads.failed'));
      Object.assign(item, data.upload);
    } catch (e) { pending = pending.filter(x => x !== item); toast(e.message, { bad: true }); }
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
  catch (e) { toast(e.message, { bad: true }); return false; }
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
      if (el) el.textContent = err.message; else toast(err.message, { bad: true });
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
    catch (err) { toast(err.message, { bad: true }); }
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
    catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
  });
});

// ---------------------------------------------------------------- share, publish, update
function shareSheet(mode) {
  if (!S.current) return toast(t('js.studio.share.buildFirst'));
  const live = S.live; let pick = live ? live.visibility : (S.game.visibility || 'private');
  const opts = ['private', 'friends', 'public'].map(k => `<button type="button" data-vis="${k}" aria-pressed="${k === pick}"><b>${VIS[k][0]} ${VIS[k][1]}</b><span>${esc(S.shareText[k])}</span></button>`).join('');
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
    } catch (err) { applyState(err.data && err.data.state); toast(err.message + (err.data && err.data.reasons && err.data.reasons.length ? ' ' + err.data.reasons.join(' ') : ''), { bad: true, ms: 6000 }); go.disabled = false; }
  });
}
async function updateLive() {
  if (!S.live || !S.current) return;
  const pub = S.live.visibility === 'public';
  const s = sheet({ title: `⬆️ ${t('js.studio.update.title')}`, content: `<p>${t('js.studio.update.text', { live: `<b>${E('js.studio.update.version', { number: S.live.number })}</b>`, number: `<b>${E('js.studio.update.version', { number: S.current.number })}</b>` })}</p><p>${pub ? E('js.studio.update.publicText', { live: S.live.number }) : E('js.studio.update.now')}</p><div class="sheet-actions"><button class="btn" type="button" data-close>${E('js.studio.update.notYet')}</button><button class="btn btn-coral" type="button" id="upd-go">⬆️ ${E('js.studio.update.button')}</button></div>` });
  s.el.querySelector('[data-close]').addEventListener('click', s.close);
  $('#upd-go', s.el).addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await api(`/api/studio/${ID}/update`, { method: 'POST', body: {} }); applyState(r.state); toast(r.message, { ms: 5000 }); s.close(); }
    catch (err) { applyState(err.data && err.data.state); toast(err.message, { bad: true, ms: 6000 }); e.target.disabled = false; }
  });
}
$('#st-share').addEventListener('click', () => shareSheet('share'));
$('#st-publish').addEventListener('click', () => {
  const canUpdate = S.live && S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
  if (canUpdate) updateLive(); else shareSheet('publish');
});

renderTop(); renderLive(); renderSafety(); renderTurns(); renderLog();
if (S.busy) {
  toast(t('js.studio.stillFinishing'));
  busy = true; $('#st-send').disabled = true;
  waitForBuilder().then(() => { busy = false; $('#st-send').disabled = false; return refresh(); });
}
