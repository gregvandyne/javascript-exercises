// The Studio: chat with the Builder (SSE over fetch), live preview in the player sandbox, versions, sharing and publishing.
import { api, toast, sheet, pageData, $, $$, esc, copyText } from '/js/app.js';

let S = pageData();
const ID = S.game.id;
const log = $('#st-log'), input = $('#st-input'), frame = $('#st-frame'), stage = $('#st-stage'), device = $('#st-device');
let busy = false, pro = false;
try { pro = localStorage.getItem('brb-pro') === '1'; } catch { /* private mode */ }
const SIZES = { phone: [390, 760], tablet: [820, 1100], landscape: [844, 390] };
const VIS = { private: ['🔒', 'Only me'], friends: ['👫', 'Friends'], public: ['🌍', 'Everyone'] };
const START_CHIPS = ['🏃 A running and jumping game', '🧺 Catch the falling things', '❓ A quiz game', '🃏 A memory match', '🔤 A word game', '⚔️ Two players on one phone', '🎲 A board game', '✨ Surprise me!'];
const NEXT_CHIPS = ['Make it harder', 'Add a second level', 'Change the hero to a dragon'];
const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const safetyChip = s => ({ pass: '<span class="stchip good">✅ Safe</span>', flag: '<span class="stchip warn">⚠️ Check</span>', fail: '<span class="stchip bad">⛔ Needs a fix</span>' }[s] || '<span class="stchip">…</span>');

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
  pb.textContent = !S.live ? (S.pending ? '⏳ In review' : '🚀 Publish') : canUpdate ? '⬆️ Update live game' : '✅ Live';
  document.title = `Studio: ${S.game.title} · Magic Cup`;
}
function renderTurns() { $('#st-turns').textContent = `🔋 ${S.turnsLeft} of ${S.dailyTurns} turns left today`; }
function renderLive() {
  const box = $('#st-live'); const parts = [];
  const cur = S.current ? `✏️ Editing: version ${S.current.number}` : '✏️ Nothing built yet';
  if (S.game.hidden_reason) parts.push(`<p class="note">⚠️ This game is hidden for now because players reported it. A grown-up on our team will look at it soon.</p>`);
  if (S.live) {
    const [e, w] = VIS[S.live.visibility] || ['', S.live.visibility];
    parts.push(`<span class="stchip good">🟢 Live: version ${S.live.number} · ${e} ${w}</span><span class="vtag">${cur}</span>`);
    const canUpdate = S.current && S.current.id !== S.live.id && !(S.pending && S.pending.id === S.current.id);
    if (canUpdate) parts.push(`<button class="btn btn-coral btn-sm st-update" type="button" data-act="update">⬆️ Update live game to version ${S.current.number}</button>`);
    if (S.pending && S.pending.id === S.live.id) parts.push(`<p class="note">⏳ Waiting for a quick safety check before everyone can play. Until then: ${S.live.visibility === 'friends' ? 'your friends can play it' : 'only you can play it'}.</p>`);
    else if (S.pending) parts.push(`<p class="note">⏳ Version ${S.pending.number} is waiting for a quick safety check. Players keep playing version ${S.live.number} until it passes.</p>`);
    else if (canUpdate) parts.push(`<p class="note info">Players are playing version ${S.live.number}. Press “Update live game” to give them version ${S.current.number}.${S.live.visibility === 'public' ? ' Games for everyone get a quick safety check first, and players keep the old version until it passes.' : ''}</p>`);
  } else {
    parts.push(`<span class="stchip">${S.status.label}${S.status.label.includes('Draft') ? ' · only you can see it' : ''}</span><span class="vtag">${cur}</span>`);
    if (S.pending) parts.push(`<p class="note">⏳ Version ${S.pending.number} is waiting for a quick safety check. We will share it as soon as it passes.</p>`);
  }
  if (S.game.review_note) parts.push(`<p class="note">💬 Reviewer says: “${esc(S.game.review_note)}” Ask the Builder to change it, then press Update or Publish again.</p>`);
  box.innerHTML = parts.join('');
}
function renderSafety() {
  const box = $('#st-safety'); const c = S.current;
  if (!c) { box.innerHTML = ''; return; }
  const list = c.issues.length ? `<ul>${c.issues.map(i => `<li>${esc(i.message)}</li>`).join('')}</ul>` : '';
  const fixBtn = '<button class="btn btn-sm" type="button" data-act="fix">🛠️ Ask the Builder to fix it</button>';
  if (c.safety === 'pass') box.innerHTML = `✅ Safety check passed for version ${c.number}.`;
  else if (c.safety === 'flag') box.innerHTML = `⚠️ Safety check: version ${c.number} is OK for you and friends, but a person will look before everyone can play. ${fixBtn}${list}`;
  else if (c.safety === 'fail') box.innerHTML = `⛔ Version ${c.number} can’t be shared yet. ${fixBtn}${list}`;
  else box.innerHTML = `Checking version ${c.number}…`;
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
$('#st-reload').addEventListener('click', () => { if (!S.preview) return toast('Build something first!'); frame.src = 'about:blank'; setTimeout(() => (frame.src = S.preview), 30); });
const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => toast('Full screen is not allowed here.', { bad: true })); };
$('#st-full').addEventListener('click', full);
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data || e.data.brb !== 1) return; // only our sandboxed preview
  if (e.data.type === 'brb:fullscreen') { if (!!e.data.on !== !!document.fullscreenElement) full(); }
  else if (e.data.type === 'brb:gameover' && typeof e.data.score === 'number') toast(`Round over! Score: ${e.data.score}`);
});

// ---------------------------------------------------------------- chat log
const scrollDown = () => { log.scrollTop = log.scrollHeight; };
function bubble(cls, text) { const d = document.createElement('div'); d.className = `msg ${cls}`; d.textContent = text || ''; log.appendChild(d); return d; }
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
  const d = card(`version ${fail ? 'fail' : ''}`, `<span class="evh">🎮 Version ${v.number} ${fail ? 'built, but the safety check found a problem' : 'is ready!'}</span><span>${esc(v.notes)}</span>
    <span class="row">${safetyChip(v.status)}${live ? '<button class="btn btn-sm" type="button" data-act="see">👀 See it</button>' : ''}${fail && live ? '<button class="btn btn-sm" type="button" data-act="fix">🛠️ Ask the Builder to fix it</button>' : ''}</span>`);
  return d;
}
function notesCard(list) { return card('notes', `<span class="evh">🧪 Things to try</span><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); }
function metaCard(m) { return card('meta', `<span>${esc(m.icon)} Named it <b>${esc(m.title)}</b></span>`); }
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
    if (!S.current) { askBlock({ question: 'What kind of game should we make?' }, true, bubble('bot', 'Hi! I’m the Builder 🤖 Tell me your game idea, or tap one to start.')); chips(START_CHIPS, true); }
    else { bubble('bot', `Your game “${S.game.title}” is ready to play in the preview! 🎉 What should we change? Tell me in your own words, or tap an idea.`); chips(NEXT_CHIPS, true); }
  }
  scrollDown();
}

// ---------------------------------------------------------------- sending (SSE over fetch)
let pending = []; // uploads waiting to be sent: { id, name, kind, url }
async function send(text) {
  text = String(text || '').trim();
  const ups = pending.filter(u => u.id);
  if (busy) return toast('One moment, the Builder is still working!');
  if (!text && !ups.length) { input.focus(); return; }
  busy = true; $('#st-send').disabled = true;
  $$('.qchips').forEach(c => c.classList.add('used'));
  userBubble(text, ups); input.value = ''; autosize();
  pending = []; renderAttach();
  let cur = bubble('bot', ''); cur.innerHTML = '<span class="typing" aria-label="The Builder is thinking"><i></i><i></i><i></i></span>';
  let typing = true; scrollDown();
  const status = document.createElement('div'); status.className = 'st-busy'; status.textContent = '🤖 The Builder is working…'; stage.appendChild(status);
  const textBubble = () => { if (!cur) cur = bubble('bot', ''); if (typing) { cur.textContent = ''; typing = false; } return cur; };
  const endBubble = () => { if (cur && typing) { cur.remove(); } cur = null; typing = false; };
  const handle = (ev, d) => {
    if (ev === 'text') { const b = textBubble(); b.textContent += d.text; }
    else if (ev === 'ask') { const b = cur && !typing ? cur : (endBubble(), bubble('bot', '')); askBlock(d, true, b); cur = null; }
    else if (ev === 'version') { endBubble(); versionCard(d, true); setPreview(d.preview); status.textContent = `🎮 Version ${d.number} is ready!`; }
    else if (ev === 'meta') { endBubble(); metaCard(d); S.game = { ...S.game, ...d }; renderTop(); }
    else if (ev === 'notes') { endBubble(); notesCard(d.checklist); }
    else if (ev === 'progress') { status.textContent = d.stage === 'building' ? `🔨 Building your game… ${d.bytes ? Math.round(d.bytes / 1024) + ' KB' : ''}` : '✏️ Making changes…'; }
    else if (ev === 'refused') { endBubble(); const b = bubble('bot refused', `${d.message} ${d.suggestion}`); void b; if (d.chips && d.chips.length) chips(d.chips, true); }
    else if (ev === 'error') { endBubble(); bubble('err', d.message); }
    else if (ev === 'done') { if (typeof d.turnsLeft === 'number') { S.turnsLeft = d.turnsLeft; renderTurns(); } }
    scrollDown();
  };
  try {
    const res = await fetch(`/api/studio/${ID}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ text, pro, uploads: ups.map(u => u.id) }) });
    if (!res.ok || !res.body) { let msg = 'The Builder could not answer. Please try again.'; try { msg = (await res.json()).error || msg; } catch { /* not JSON */ } throw new Error(msg); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of block.split('\n')) { if (line.startsWith('event: ')) ev = line.slice(7); else if (line.startsWith('data: ')) data += line.slice(6); }
        if (!data) continue;
        try { handle(ev, JSON.parse(data)); } catch { /* bad chunk */ }
      }
    }
  } catch (e) { endBubble(); bubble('err', e.message || 'Oops, the connection dropped. Please try again.'); }
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
  if (a.dataset.act === 'fix') send(`Please fix the safety check problems in version ${S.current ? S.current.number : ''}: ${(S.current && S.current.issues || []).map(i => i.message).join(' ')}`.trim());
  else if (a.dataset.act === 'see') { $('.st-preview').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (a.dataset.act === 'update') updateLive();
});
const proBtn = $('#st-pro');
const setPro = v => { pro = v; proBtn.setAttribute('aria-pressed', String(pro)); try { localStorage.setItem('brb-pro', pro ? '1' : '0'); } catch { /* ignore */ } };
proBtn.addEventListener('click', () => { setPro(!pro); toast(pro ? '✨ Pro quality on: slower, but fancier games.' : 'Pro quality off: quick builds.'); });
setPro(pro);

// ---------------------------------------------------------------- uploads (inspiration pictures and files)
const OK_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|markdown|csv)|application\/json)$/;
function renderAttach() {
  const box = $('#st-attach'); box.hidden = !pending.length;
  box.innerHTML = pending.map((u, i) => `<span class="att ${u.id ? '' : 'loading'}">${u.kind === 'image' && u.preview ? `<img src="${esc(u.preview)}" alt="">` : `<span class="fi" aria-hidden="true">${u.kind === 'image' ? '🖼️' : u.kind === 'pdf' ? '📄' : '📝'}</span>`}<span class="nm">${esc(u.name)}</span>${u.id ? `<button class="rm" type="button" data-rm="${i}" aria-label="Remove ${esc(u.name)}">✕</button>` : ''}</span>`).join('');
}
async function addFiles(files) {
  for (const f of files) {
    if (pending.length >= S.uploads.limits.perMessage) { toast(`You can add up to ${S.uploads.limits.perMessage} at a time.`, { bad: true }); break; }
    const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    if (!OK_TYPES.test(f.type) && !/^(txt|md|csv|json)$/i.test(ext)) { toast('I can use pictures, PDFs and text files.', { bad: true }); continue; }
    const kind = f.type.startsWith('image/') ? 'image' : f.type === 'application/pdf' ? 'pdf' : 'text';
    const max = kind === 'text' ? S.uploads.limits.text : S.uploads.limits.image;
    if (f.size > max) { toast(kind === 'text' ? 'Text files can be up to 200 KB.' : 'Pictures and PDFs can be up to 5 MB.', { bad: true }); continue; }
    const item = { name: f.name, kind, preview: kind === 'image' ? URL.createObjectURL(f) : null };
    pending.push(item); renderAttach();
    try {
      const res = await fetch(`/api/studio/${ID}/uploads?name=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That file could not be added.');
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
titleIn.addEventListener('change', async () => { const v = titleIn.value.trim(); if (!v || v === S.game.title) { titleIn.value = S.game.title; return; } if (!(await saveMeta({ title: v }, 'Name saved!'))) titleIn.value = S.game.title; });
$('#st-icon').addEventListener('click', () => {
  const s = sheet({ title: 'Pick an icon', content: `<div class="emojigrid">${S.icons.map(e => `<button type="button" data-emoji="${esc(e)}" aria-pressed="${e === S.game.icon}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>` });
  s.el.addEventListener('click', async e => { const b = e.target.closest('[data-emoji]'); if (!b) return; if (await saveMeta({ icon: b.dataset.emoji })) s.close(); });
});
$('#st-settings').addEventListener('click', () => {
  const g = S.game;
  const s = sheet({ title: '⚙️ Game settings', content: `<form id="setform">
    <div class="field"><label for="set-desc">What is your game about?</label><textarea class="input" id="set-desc" maxlength="600" rows="3">${esc(g.description)}</textarea><span class="err" id="set-desc-err"></span></div>
    <div class="field"><label for="set-cat">Kind of game</label><select class="input" id="set-cat">${S.categories.map(([k, i, l]) => `<option value="${k}" ${k === g.category ? 'selected' : ''}>${i} ${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="set-tags">Search words</label><input class="input" id="set-tags" maxlength="200" value="${esc(g.tags)}" placeholder="shark, ocean, fast"><span class="hint">Words that help people find it, with commas between.</span><span class="err" id="set-tags-err"></span></div>
    <div class="field"><span id="set-or-l"><b>Which way up?</b></span><div class="seg" role="group" aria-labelledby="set-or-l" id="set-or">${[['any', 'Any way'], ['portrait', 'Tall'], ['landscape', 'Sideways']].map(([k, l]) => `<button type="button" data-or="${k}" aria-pressed="${k === g.orientation}">${l}</button>`).join('')}</div></div>
    <div class="field"><label for="set-pl">How many players on one phone?</label><select class="input" id="set-pl">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option ${n === g.players_max ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field"><span id="set-cov-l"><b>Card colour</b></span><div class="covergrid" role="group" aria-labelledby="set-cov-l">${S.covers.map(c => `<button type="button" class="cover-${c}" data-cover="${c}" aria-pressed="${c === g.cover}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn btn-primary" type="submit">Save settings</button></div></form>` });
  let or = g.orientation, cover = g.cover;
  s.el.addEventListener('click', e => {
    const o = e.target.closest('[data-or]'); if (o) { or = o.dataset.or; $$('[data-or]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === o))); }
    const c = e.target.closest('[data-cover]'); if (c) { cover = c.dataset.cover; $$('[data-cover]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === c))); }
  });
  $('#setform', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api(`/api/studio/${ID}/meta`, { method: 'POST', body: { description: $('#set-desc', s.el).value, category: $('#set-cat', s.el).value, tags: $('#set-tags', s.el).value, orientation: or, players_max: +$('#set-pl', s.el).value, cover } });
      applyState(r.state); toast('Settings saved!'); s.close();
    } catch (err) {
      const f = err.data && err.data.field; const el = f && $(`#set-${f === 'description' ? 'desc' : f}-err`, s.el);
      if (el) el.textContent = err.message; else toast(err.message, { bad: true });
    }
  });
});

// ---------------------------------------------------------------- save + versions
$('#st-save').addEventListener('click', () => {
  if (!S.current) return toast('Build something first, then save it!');
  const s = sheet({ title: '💾 Save this version', content: `<form id="saveform"><div class="field"><label for="save-note">Give it a name (you can skip this)</label><input class="input" id="save-note" maxlength="80" placeholder="My favourite so far"></div><p class="small muted">Every change is kept anyway. Saving adds a ⭐ so it is easy to find later.</p><div class="sheet-actions"><button class="btn btn-primary" type="submit">Save</button></div></form>` });
  $('#saveform', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    try { const r = await api(`/api/studio/${ID}/save`, { method: 'POST', body: { note: $('#save-note', s.el).value } }); applyState(r.state); toast(r.message); s.close(); }
    catch (err) { toast(err.message, { bad: true }); }
  });
});
$('#st-history').addEventListener('click', () => {
  if (!S.versions.length) return toast('No versions yet. Ask the Builder to make your game!');
  const row = v => `<li class="vrow"><span class="vn">v${v.number}</span><span><span class="vnotes">${esc(v.notes || 'A new version')}</span><br><span class="vmeta">${esc(when(v.at))}</span>
    <span class="tags">${safetyChip(v.safety)}${v.current ? '<span class="stchip">✏️ Editing</span>' : ''}${v.live ? '<span class="stchip good">🟢 Live</span>' : ''}${v.pending ? '<span class="stchip warn">⏳ In review</span>' : ''}</span></span>
    ${v.current ? '' : `<button class="btn btn-sm" type="button" data-restore="${esc(v.id)}">↩️ Bring back</button>`}</li>`;
  const s = sheet({ title: '🕘 Versions', content: `<p class="small muted">“Bring back” copies an old version to the top as a new version. Nothing is ever lost.</p><ul class="vlist">${S.versions.map(row).join('')}</ul>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-restore]'); if (!b) return; b.disabled = true;
    try { const r = await api(`/api/studio/${ID}/restore`, { method: 'POST', body: { versionId: b.dataset.restore } }); applyState(r.state); setPreview(r.state.preview); toast(r.message); s.close(); }
    catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
  });
});

// ---------------------------------------------------------------- share, publish, update
function shareSheet(mode) {
  if (!S.current) return toast('Build your game first, then share it!');
  const live = S.live; let pick = live ? live.visibility : (S.game.visibility || 'private');
  const opts = ['private', 'friends', 'public'].map(k => `<button type="button" data-vis="${k}" aria-pressed="${k === pick}"><b>${VIS[k][0]} ${VIS[k][1]}</b><span>${esc(S.shareText[k])}</span></button>`).join('');
  const link = live ? `<div class="field"><label for="share-link">Link to your game</label><div class="row"><input class="input" id="share-link" readonly value="${esc(location.origin + S.shareUrl)}" style="flex:1;min-width:0"><button class="btn" type="button" id="share-copy">📋 Copy</button></div></div>` : '';
  const title = live ? '🔗 Share your game' : mode === 'publish' ? '🚀 Publish your game' : '🔗 Who can play?';
  const s = sheet({ title, content: `${live ? `<p>Players get version ${live.number}.</p>` : `<p>Pick who can play version ${S.current.number}.</p>`}<div class="vischoice" role="group" aria-label="Who can play">${opts}</div><p class="small muted" id="vis-hint"></p>${link}<div class="sheet-actions"><button class="btn btn-primary" type="button" id="vis-go">${live ? 'Save' : 'Publish'}</button></div>` });
  const hint = () => { $('#vis-hint', s.el).textContent = pick === 'public' ? 'Games for everyone get a quick safety check first.' : ''; };
  hint();
  s.el.addEventListener('click', async e => {
    const v = e.target.closest('[data-vis]');
    if (v) { pick = v.dataset.vis; $$('[data-vis]', s.el).forEach(b => b.setAttribute('aria-pressed', String(b === v))); hint(); return; }
    if (e.target.closest('#share-copy')) { (await copyText(location.origin + S.shareUrl)) ? toast('Link copied! ' + S.shareText[S.live.visibility]) : toast('Could not copy.', { bad: true }); return; }
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
  const s = sheet({ title: '⬆️ Update your live game', content: `<p>Players are playing <b>version ${S.live.number}</b>. This gives them <b>version ${S.current.number}</b>.</p>${pub ? '<p>Because everyone can play it, the update gets a quick safety check first. Players keep version ' + S.live.number + ' until it passes.</p>' : '<p>It updates straight away.</p>'}<div class="sheet-actions"><button class="btn" type="button" data-close>Not yet</button><button class="btn btn-coral" type="button" id="upd-go">⬆️ Update</button></div>` });
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
if (S.busy) toast('The Builder is still finishing your last message…');
