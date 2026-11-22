// Oomba, the teaching companion (docs/decisions.md "Oomba teaching companion"; services/companion.js): the bubble at
// the bottom right of every teacher page (above the phone's tab bar; on the class dashboard at the end of its layout
// bar, hidden in Projector, Eyes up and full screen). Loaded only for Teacher plan staff (views/layout.js companionPage).
// The panel is the shared chat client (public/js/oomba-chat.js); this file adds what the companion has on top:
//   - the page the message was sent from (the server checks it again), an attachment (a lesson plan's text, or a
//     picture without people), web search on or off for this chat, and the microphone (tap to start, tap to stop; the
//     words land in the box to edit; audio isn't kept);
//   - Oomba's answers: the steps it took, game and book cards (Play, Host live, Assign), sources from the web ("Not on
//     Oomba"), a dashboard change to Apply (then Undo), and a hand-off card that opens the Builder or Figures with the
//     brief filled in (the teacher presses the final button there).
import { t, api, esc, toast, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { mountChat } from '/js/oomba-chat.js';
import * as BUS from '/js/oomba-bus.js';

const raw = document.body.dataset.oc;
const PAGE = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
const store = { get: (k, s = sessionStorage) => { try { return s.getItem(k); } catch { return null; } }, set: (k, v, s = sessionStorage) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* no storage */ } } };
const L = k => t(`js.companion.${k}`);
const ic = (e, size = 18) => iconHtml(e, { size });
const DOC_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
const IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';
const MAX_CLIP_MS = 120e3;   // the longest recording here (the server's own STT_MAX_SECONDS may be shorter)

if (PAGE) start();

function start() {
  const dash = PAGE.type === 'dashboard';
  const S = { file: null, sent: false, web: true, webAllowed: true, mic: null };
  const label = () => {
    const a = BUS.page(); if (a && a.label) { const x = a.label(); if (x) return String(x).slice(0, 60); }
    const h = document.querySelector(dash ? '.dash-class' : 'main h1');
    const txt = (h ? h.textContent : document.title.split('·')[0]).replace(/\s+/g, ' ').trim().slice(0, 60);
    return dash ? t('js.companion.dashOf', { name: txt }) : txt;
  };
  /** The page as it is now: on the dashboard, the layout on screen (by its chip's name). */
  function pageNow() {
    const a = BUS.page(); if (a && a.page) { const x = a.page(); if (x) return x; }
    const p = { ...PAGE };
    if (dash) {
      try {
        const data = JSON.parse(document.getElementById('page-data').textContent);
        const name = (document.querySelector('#dash-layouts [aria-current="true"]') || {}).textContent;
        const l = (data.layouts || []).find(x => x.name === name);
        p.layoutId = l ? l.id : data.current;
      } catch { /* no page data */ }
    }
    return p;
  }

  // The page's own workflow, when it has one (a Figures worksheet, a Manipulatives board: public/js/oomba-bus.js).
  const P = () => BUS.page();
  const via = (k, ...a) => { const x = P(); return x && typeof x[k] === 'function' ? x[k](...a) : undefined; };
  const chat = mountChat({
    id: 'companion', url: () => '/api/companion/chat', getUrl: () => `/api/companion/chat${chat && chat.state().mode === 'open' ? '' : '?peek=1'}`, alwaysBubble: true,
    start: () => via('start') || 'closed',
    bubbleHost: dash ? document.getElementById('dash-foot') : null,
    subHtml: `<span class="oc-ctx"><i aria-hidden="true"></i>${esc(L('sees'))} <b id="oc-sees">${esc(label())}</b></span>`,
    headExtra: `<button type="button" class="oc-hbtn" id="oc-new" aria-label="${esc(L('newChat'))}" title="${esc(L('newChat'))}">${ic('✏️', 20)}</button>`,
    aboveRow: '<div class="oc-attach" id="oc-attach" hidden></div><div class="oc-listen" id="oc-listen" role="status" hidden></div>',
    toolsStart: `<button type="button" class="oc-ibtn" id="oc-attach-btn" aria-label="${esc(L('attach'))}" title="${esc(L('attach'))}">${ic('📎', 22)}</button><input type="file" id="oc-file" accept="${DOC_ACCEPT},${IMG_ACCEPT}" hidden>`,
    toolsEnd: `<button type="button" class="oc-ibtn" id="oc-mic" aria-label="${esc(L('mic.start'))}" title="${esc(L('mic.start'))}" hidden>${ic('🎤', 22)}</button>`,
    foot: `<div class="oc-foot"><button type="button" class="oc-pill on" id="oc-web" role="switch" aria-checked="true">${ic('🌐', 16)} <span>${esc(L('web.on'))}</span></button><span class="oc-attachnote" id="oc-note">${esc(L('attachNote'))}</span></div>`,
    hello: c => via('hello', c) || L('hello'),
    ideas: c => via('ideas', c) || (dash ? ['dashTimer', 'dashJobs', 'game', 'plan'] : ['game', 'book', 'dash', 'plan']).map(k => ({ label: L(`idea.${k}.label`), text: L(`idea.${k}.text`) })),
    ideasAfter: c => via('ideasAfter', c) || [],
    placeholder: c => via('placeholder', c) || L('placeholder'),
    leave: L('leave'),
    stepText: (k, state) => t(`js.companion.prog.${k}.${state === 'done' ? 'done' : 'now'}`),
    quoteText: q => (q.text ? t('js.companion.quoteN', { n: q.n, text: q.text }) : t('js.companion.questionN', { n: q.n })),
    beforeSend: () => via('ensure'),
    body: () => { S.sent = true; stopMic({ cancel: true }); return { page: pageNow(), ...(via('body') || {}), ...(S.file ? { file: S.file.id } : {}) }; },
    errText: code => (['slow', 'fileGone'].includes(code) ? L(`err.${code}`) : null),
    meExtra: x => (x.meta && x.meta.file ? `<span class="oc-file">${ic(x.meta.file.kind === 'image' ? '🖼️' : '📄', 18)} ${esc(x.meta.file.name)}${x.meta.file.pages ? ` <small>${esc(t('js.companion.pages', { n: x.meta.file.pages }))}</small>` : ''}</span>` : ''),
    format: (text, x) => `${x.note && x.note.steps ? stepsHtml(x.note) : ''}${formatText(text)}`,
    note: x => noteHtml(x) + (via('note', x) || ''),
    change: x => (x.change && x.change.kind === 'dash' ? changeHtml(x) : via('change', x) || changeHtml(x)),
    changeLinks: x => via('changeLinks', x) || '',
    extra: (x, c) => via('extra', x, c) || '',
    onAct: async (act, turn, btn) => { const r = await via('onAct', act, turn, btn); return r === undefined ? onAct(act, turn, btn) : r; },
    onAnswer: (x, c) => { if (x.change && x.change.kind === 'dash') afterDash(x.change); via('onAnswer', x, c); },
    onUndo: r => { if (dash) { store.set('oc-hl', '[]'); location.reload(); return; } via('onUndo', r); },
    onQuote: q => via('onQuote', q),
    onMode: m => { if (m !== 'open') stopMic(); via('onMode', m); },
    onSync: c => { if (S.sent) { S.sent = false; setFile(null); } via('onSync', c); },
  });
  BUS.setChat(chat);
  BUS.onPage(() => { const b = document.getElementById('oc-sees'); if (b) b.textContent = label(); chat.render(); });
  const root = chat.root;
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- the flags: web search, the microphone
  api('/api/companion/chat?peek=1', { background: true }).then(r => {
    S.web = !!r.web; S.webAllowed = !!r.webAllowed; drawWeb();
    S.live = !!r.live; S.rate = r.rate || 16000; S.maxMs = Math.min(r.maxMs || MAX_CLIP_MS, MAX_CLIP_MS);
    $('oc-mic').hidden = !(r.mic && navigator.mediaDevices && (window.MediaRecorder || (r.live && AC)));
    // An answer that ended while the teacher was away: the bubble's dot.
    if (r.unseen && chat.state().mode !== 'open') { chat.state().unread = true; chat.setMode(chat.state().mode, { focus: false, user: false }); }
  }).catch(() => {});
  function drawWeb() {
    const b = $('oc-web'); if (!b) return;
    b.classList.toggle('on', S.web); b.setAttribute('aria-checked', String(S.web)); b.disabled = !S.webAllowed;
    b.querySelector('span').textContent = !S.webAllowed ? L('web.offSchool') : L(S.web ? 'web.on' : 'web.off');
  }
  $('oc-web').addEventListener('click', async () => {
    try { const r = await api('/api/companion/web', { method: 'POST', body: { on: !S.web } }); S.web = !!r.web; drawWeb(); } catch (e) { chat.showErr(e.message); }
  });
  $('oc-new').addEventListener('click', async () => {
    if (!(await ask({ text: L('newChatAsk'), ok: L('newChatOk') }))) return;
    try { const r = await api('/api/companion/chat/new', { method: 'POST', body: {} }); chat.took(r.chat, { initial: true }); setFile(null); } catch (e) { chat.showErr(e.message); }
  });

  // ---------------------------------------------------------------- attachments
  function setFile(f) {
    S.file = f;
    const box = $('oc-attach');
    box.hidden = !f;
    box.innerHTML = f ? `<span class="oc-chipfile">${ic(f.kind === 'image' ? '🖼️' : '📄', 18)} <span>${esc(f.name)}</span>${f.pages ? ` <small>${esc(t('js.companion.pages', { n: f.pages }))}</small>` : ''}<button type="button" class="oc-hbtn oc-x" id="oc-unattach" aria-label="${esc(L('removeFile'))}" title="${esc(L('removeFile'))}">✕</button></span>` : '';
    $('oc-note').textContent = f && f.kind === 'doc' ? L('fileNote') : f ? L('imageNote') : L('attachNote');
  }
  $('oc-attach').addEventListener('click', e => { if (e.target.closest('#oc-unattach')) { setFile(null); $('oc-in').focus(); } });
  $('oc-attach-btn').addEventListener('click', () => $('oc-file').click());
  $('oc-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    chat.showErr('');
    const box = $('oc-attach'); box.hidden = false; box.innerHTML = `<span class="oc-chipfile">${ic('⏳', 18)} ${esc(t('js.companion.reading', { name: f.name }))}</span>`;
    try {
      let r;
      if (/^image\//.test(f.type)) {
        const jpg = await toJpeg(f);
        r = await upload(`/api/companion/image?name=${encodeURIComponent(f.name.replace(/\.[^.]+$/, '') + '.jpg')}`, jpg, 'image/jpeg');
      } else r = await upload(`/api/companion/file?name=${encodeURIComponent(f.name)}`, f, 'application/octet-stream');
      setFile(r.file);
      if (r.removed) toast(t('js.companion.removed', { count: r.removed }));
      $('oc-in').focus();
    } catch (err) { setFile(S.file && S.file.id ? S.file : null); chat.showErr(err.message || L('file.other')); }
  });
  async function upload(url, blob, type) {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': type }, body: blob });
    let data = null; try { data = await res.json(); } catch { /* none */ }
    if (!res.ok) throw new Error((data && data.error) || L('file.other'));
    return data;
  }
  /** A picture as a JPEG of at most 1,600 px (the canvas drops its EXIF; the server removes any metadata again). */
  async function toJpeg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(L('file.imgType'))); i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------------------------------------------------------------- the microphone: words as the teacher speaks
  // Tap to start. Live (services/stt-live.js, /api/companion/listen): the mic goes through public/js/stt-worklet.js as
  // 16-bit mono PCM to our relay, which streams it to the speech service and sends back the words so far (greyed in
  // the box: not final yet) and, on stop, the final words (settled, editable). The audio passes through: nothing is
  // kept here or on the server. MediaRecorder also records the clip in memory, so if the live link is not there (the
  // relay is off or fails), the clip is uploaded once instead (/api/companion/transcribe). Stops on a tap, on Send,
  // when the panel closes, when the page is hidden, and at the longest recording.
  const micBtn = $('oc-mic'), bar = $('oc-listen'), box = $('oc-in');
  const AC = window.AudioContext || window.webkitAudioContext;
  micBtn.addEventListener('click', () => (S.mic ? stopMic() : startMic()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMic({ cancel: true }); });
  window.addEventListener('pagehide', () => stopMic({ cancel: true }));
  const joined = (base, text) => (base && text ? `${base} ${text}` : base || text).slice(0, 1000);
  function setBox(text, interim) { box.value = text; box.classList.toggle('interim', !!interim); box.readOnly = !!interim; box.dispatchEvent(new Event('input')); }
  async function startMic() {
    chat.showErr('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { chat.showErr(L('mic.denied')); return; }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(x => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
    const rec = window.MediaRecorder ? new MediaRecorder(stream, type ? { mimeType: type } : {}) : null;
    const m = { stream, rec, parts: [], t0: Date.now(), base: box.value.replace(/\s+$/, ''), live: null, done: false, cancel: false, upload: true };
    S.mic = m;
    if (rec) { rec.ondataavailable = e => { if (e.data && e.data.size) m.parts.push(e.data); }; rec.onstop = () => finish(m); rec.start(500); }
    m.timer = setInterval(() => { drawMic(S.mic); if (Date.now() - m.t0 >= S.maxMs) stopMic(); }, 500);
    if (S.live && AC && window.AudioWorkletNode && window.WebSocket) startLive(m);
    drawMic(m);
  }
  function startLive(m) {
    const l = m.live = { ws: null, ctx: null, node: null, src: null, ready: false, failed: false, queue: [], final: null };
    let ws;
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/companion/listen`); } catch { l.failed = true; return; }
    ws.binaryType = 'arraybuffer'; l.ws = ws;
    ws.onopen = () => { for (const b of l.queue) ws.send(b); l.queue = []; };
    ws.onmessage = e => {
      let x = null; try { x = JSON.parse(e.data); } catch { return; }
      if (x.liveId) l.liveId = String(x.liveId);
      if (S.mic !== m && x.type !== 'final') return;
      if (x.type === 'ready') l.ready = true;
      else if (x.type === 'text' && !m.cancel) setBox(joined(m.base, String(x.text || '')), true);
      else if (x.type === 'limit') stopMic();
      else if (x.type === 'final') { l.final = String(x.text || ''); if (!m.cancel) setBox(joined(m.base, l.final), false); m.upload = false; closeLive(l); }
      else if (x.type === 'error') { l.failed = true; closeLive(l); if (!x.fallback) { m.upload = false; chat.showErr(x.error || L('mic.failed')); stopMic({ cancel: true }); } }
    };
    ws.onclose = () => { if (!l.final) l.failed = true; };
    ws.onerror = () => {};
    (async () => {
      try {
        l.ctx = new AC();
        await l.ctx.audioWorklet.addModule('/js/stt-worklet.js');
        if (S.mic !== m) return;
        l.src = l.ctx.createMediaStreamSource(m.stream);
        l.node = new AudioWorkletNode(l.ctx, 'oomba-pcm', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { targetRate: S.rate || 16000 } });
        l.node.port.onmessage = ev => { if (ev.data === 'flushed' || l.failed) return; if (l.ws && l.ws.readyState === 1) l.ws.send(ev.data); else if (l.queue.length < 1200) l.queue.push(ev.data); };
        const mute = l.ctx.createGain(); mute.gain.value = 0;
        l.src.connect(l.node); l.node.connect(mute); mute.connect(l.ctx.destination);
      } catch { l.failed = true; closeLive(l); }
    })();
  }
  function closeLive(l, msg) {
    try { if (l.node) { l.node.port.onmessage = null; l.node.disconnect(); } } catch { /* gone */ }
    try { if (l.src) l.src.disconnect(); } catch { /* gone */ }
    try { if (l.ctx && l.ctx.state !== 'closed') l.ctx.close(); } catch { /* gone */ }
    l.node = l.src = l.ctx = null;
    const ws = l.ws; l.ws = null;
    if (ws) { try { if (msg && ws.readyState === 1) ws.send(JSON.stringify(msg)); else ws.close(1000); } catch { /* gone */ } }
  }
  /** Stop listening. cancel: Send, the panel closed or the page hidden: no more words go into the box. */
  function stopMic({ cancel = false } = {}) {
    const m = S.mic; if (!m) return;
    S.mic = null; clearInterval(m.timer); m.cancel = cancel;
    m.stream.getTracks().forEach(x => x.stop());
    if (m.live) {
      const l = m.live;
      if (cancel) { m.upload = false; closeLive(l, { type: 'cancel' }); }
      else if (l.ws && l.ws.readyState === 1 && !l.failed) { try { l.ws.send(JSON.stringify({ type: 'stop' })); } catch { /* gone */ } setTimeout(() => { if (!l.final) { l.failed = true; closeLive(l); finish(m); } }, 6000); }
      else l.failed = true;
    }
    if (cancel) { m.upload = false; box.classList.remove('interim'); box.readOnly = false; }
    if (m.rec && m.rec.state !== 'inactive') { try { m.rec.stop(); } catch { /* stopped */ } } else finish(m);
    drawMic(null);
  }
  /** After the recorder stopped: the live words are in the box already; otherwise the clip is uploaded once. */
  async function finish(m) {
    if (m.done) return;
    if (m.live && !m.live.failed && !m.live.final && !m.cancel) return;   // the final words are on their way
    m.done = true;
    const blob = m.parts.length ? new Blob(m.parts, { type: (m.rec && m.rec.mimeType || 'audio/webm').split(';')[0] }) : null;
    m.parts = [];
    if (!m.upload || m.cancel || !blob) { box.classList.remove('interim'); box.readOnly = false; return; }
    try {
      const res = await fetch('/api/companion/transcribe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type, 'X-Clip-Ms': String(Date.now() - m.t0), ...(m.live && m.live.liveId ? { 'X-Live-Id': m.live.liveId } : {}) }, body: blob });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || L('mic.failed'));
      setBox(joined(m.base, data.text || ''), false); box.focus();
    } catch (e) { setBox(m.base, false); chat.showErr(e.message || L('mic.failed')); }
  }
  function drawMic(m) {
    micBtn.classList.toggle('oc-mic-on', !!m);
    micBtn.innerHTML = m ? ic('⏹️', 22) : ic('🎤', 22);
    micBtn.setAttribute('aria-pressed', String(!!m));
    micBtn.setAttribute('aria-label', L(m ? 'mic.stop' : 'mic.start')); micBtn.title = L(m ? 'mic.stop' : 'mic.start');
    bar.hidden = !m;
    if (m) { const s = Math.round((Date.now() - m.t0) / 1000); bar.innerHTML = `<span class="oc-wave" aria-hidden="true">${[8, 14, 18, 10, 16, 6, 12].map(h => `<i style="height:${h}px"></i>`).join('')}</span><span>${esc(L('mic.listening'))}</span><small>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${esc(L('mic.kept'))}</small>`; }
  }
  // ---------------------------------------------------------------- Oomba's answers
  function stepsHtml(n) {
    const rows = (n.steps || []).map(s => `<li>${ic('✓', 14)} <span>${esc(t(`js.companion.step.${s.k}`, { n: s.n || 0, q: s.q || '' }))}</span></li>`).join('');
    const sum = t('js.companion.stepsSum', { n: (n.steps || []).length, s: Math.max(1, Math.round((n.ms || 0) / 1000)) });
    return (n.steps || []).length ? `<div class="oc-did"><ul>${rows}</ul><span class="oc-sum">${esc(sum)}</span></div>` : '';
  }
  function noteHtml(x) {
    const n = x.note; if (!n) return '';
    const parts = [];
    if (!x.text && n.steps) parts.push(stepsHtml(n));
    if (n.cards && n.cards.length) parts.push(`<div class="oc-cards">${n.cards.map(cardHtml).join('')}</div>`);
    if (n.sources && n.sources.length) parts.push(webHtml(n.sources));
    if (n.proposal) parts.push(proposalHtml(x, n.proposal));
    if (n.handoff) parts.push(handoffHtml(x, n.handoff));
    return parts.join('');
  }
  const meta = list => `<div class="oc-meta">${list.filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('')}</div>`;
  const link = (href, text, primary = false) => `<a class="btn btn-sm${primary ? ' btn-primary' : ''}" href="${esc(href)}">${esc(text)}</a>`;
  function cardHtml(c) {
    if (c.kind === 'game') return `<div class="oc-card"><img src="${esc(c.cover)}" alt="" width="64" height="64" loading="lazy"><div class="oc-b"><h4>${esc(c.title)}</h4>${meta([t('js.companion.card.grade', { g: c.grades }), ...(c.standards || []).slice(0, 3), t('js.companion.card.minutes', { n: c.minutes }), c.live ? L('card.live') : ''])}<p>${esc(c.summary || '')}</p><div class="oc-acts">${link(c.play, L('card.play'), true)}${link(`${c.host}${PAGE.classId ? `&class=${encodeURIComponent(PAGE.classId)}` : ''}`, L('card.host'))}${link(c.assign, L('card.assign'))}</div></div></div>`;
    if (c.kind === 'book') return `<div class="oc-card book">${c.cover ? `<img src="${esc(c.cover)}" alt="" width="54" height="68" loading="lazy">` : `<span class="oc-ico">${ic('📚', 32)}</span>`}<div class="oc-b"><h4>${esc(c.title)}</h4>${meta([t('js.companion.card.grade', { g: c.grade }), t('js.companion.pages', { n: c.pages })])}<div class="oc-acts">${link(c.read, L('card.read'), true)}${link(c.assign, L('card.assign'))}</div></div></div>`;
    return `<div class="oc-card"><span class="oc-ico">${ic(c.kind === 'lesson' ? '📝' : '🧮', 32)}</span><div class="oc-b"><h4>${esc(c.title)}</h4>${meta([L(c.kind === 'lesson' ? 'card.lessonKind' : 'card.genKind'), c.grades ? t('js.companion.card.grade', { g: c.grades }) : ''])}<div class="oc-acts">${link(c.href, L('card.open'), true)}</div></div></div>`;
  }
  function webHtml(list) {
    return `<div class="oc-web"><div class="oc-webh">${ic('🌐', 16)} ${esc(L('web.from'))} <span class="oc-tag">${esc(L('web.notOn'))}</span></div>${list.map((s, i) => `<div class="oc-li"><b class="n">${i + 1}</b><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.title)} ↗</a><span class="oc-src">${esc(s.site)}</span></div>`).join('')}<span class="oc-warn">${esc(L('web.warn'))}</span></div>`;
  }
  const settingText = (s = {}) => Object.entries(s).map(([k, v]) => (k === 'minutes' ? t('js.companion.dash.minutes', { n: v }) : `${k}: ${v}`)).join(', ');
  const lineHtml = l => `<p>${ic(l.icon || '▫️', 18)} <b>${esc(l.name)}</b> <span>${esc(t(`js.companion.dash.${l.op}`, { what: settingText(l.settings) }))}</span></p>`;
  function proposalHtml(x, p) {
    const acts = p.state === 'open' ? `<div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="apply" data-turn="${esc(x.id)}">${esc(L('dash.apply'))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="decline" data-turn="${esc(x.id)}">${esc(L('dash.notNow'))}</button></div>`
      : `<p class="oc-state">${ic(p.state === 'applied' ? '✓' : '➖', 16)} ${esc(L(p.state === 'applied' ? 'dash.applied' : 'dash.declined'))}</p>`;
    return `<div class="oc-change oc-prop">${p.lines.map(lineHtml).join('')}${acts}</div>`;
  }
  function changeHtml(x) {
    const c = x.change; if (!c || c.kind !== 'dash') return '';
    return `<p><b>${esc(L('dash.done'))}</b></p>${(c.lines || []).map(lineHtml).join('')}${dash ? `<span class="oc-note">${esc(L('dash.highlighted'))}</span>` : `<a class="btn btn-sm" href="/class/${encodeURIComponent(c.classId)}/dashboard">${esc(L('dash.openDash'))}</a>`}`;
  }
  function handoffHtml(x, h) {
    const facts = [h.grade ? [L('hand.grade'), h.grade] : null, ...(h.facts || []).map(f => [L(`hand.${f.k}`), f.v])].filter(Boolean);
    return `<div class="oc-hand"><h4>${ic('🛠️', 18)} ${esc(h.title || L(`hand.${h.tool}`))}</h4>${h.title ? `<p class="oc-hsub">${esc(L(`hand.${h.tool}`))}</p>` : ''}${facts.length ? `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}<div class="oc-brief" dir="auto">${esc(h.brief)}</div>
      <div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="handoff" data-turn="${esc(x.id)}">${esc(L(`hand.open.${h.tool}`))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="rebrief" data-turn="${esc(x.id)}">${esc(L('hand.change'))}</button></div></div>`;
  }
  async function onAct(act, turn) {
    if (!turn) return null;
    if (act === 'rebrief') { const box = $('oc-in'); box.value = L('hand.changeText'); box.dispatchEvent(new Event('input')); box.focus(); return null; }
    try {
      const r = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: turn.id, act } });
      if (act === 'handoff' && r.handoff) {
        store.set('oomba-handoff', JSON.stringify({ tool: r.handoff.tool, text: handoffText(r.handoff), at: Date.now() }));
        location.href = r.handoff.href;
        return null;
      }
      return r;
    } catch (e) { chat.showErr(e.message); return null; }
  }
  const handoffText = h => [h.title, h.brief, ...(h.facts || []).map(f => `${L(`hand.${f.k}`)}: ${f.v}`), h.grade ? `${L('hand.grade')}: ${h.grade}` : ''].filter(Boolean).join('\n');
  function afterDash(c) {
    if (!dash || c.classId !== PAGE.classId) return;
    store.set('oc-hl', JSON.stringify(c.ids || []));
    setTimeout(() => location.reload(), 400);
  }

  // ---------------------------------------------------------------- the dashboard: hidden while students can see it
  if (dash) {
    const sync = () => {
      const eyes = document.getElementById('dash-eyes-btn');
      const hide = document.body.classList.contains('dash-projector') || !!document.fullscreenElement || (eyes && eyes.getAttribute('aria-pressed') === 'true');
      document.body.classList.toggle('oc-hide', hide);
      if (hide && chat.state().mode === 'open') chat.setMode('closed', { focus: false });
    };
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const eyes = document.getElementById('dash-eyes-btn'); if (eyes) new MutationObserver(sync).observe(eyes, { attributes: true, attributeFilter: ['aria-pressed'] });
    document.addEventListener('fullscreenchange', sync);
    sync();
    const hl = store.get('oc-hl');
    if (hl) {
      store.set('oc-hl', null);
      let ids = []; try { ids = JSON.parse(hl); } catch { ids = []; }
      setTimeout(() => { for (const id of ids) { const w = document.querySelector(`.dash-w[data-id="${CSS.escape(id)}"]`); if (w) { w.classList.add('oc-hl'); setTimeout(() => w.classList.remove('oc-hl'), 4000); } } }, 600);
    }
  } else {
    document.addEventListener('fullscreenchange', () => document.body.classList.toggle('oc-hide', !!document.fullscreenElement));
  }

  // ---------------------------------------------------------------- a hand-off arriving here (the Builder, Figures)
  const h = store.get('oomba-handoff');
  if (h) {
    let x = null; try { x = JSON.parse(h); } catch { x = null; }
    const target = x && Date.now() - x.at < 10 * 60e3 ? (x.tool === 'builder' && location.pathname === '/build/new' ? 'su-ltext' : x.tool === 'figures' && location.pathname === '/figures' ? 'fgd-in' : null) : null;
    if (target && document.getElementById(target)) {
      store.set('oomba-handoff', null);
      const box = document.getElementById(target);
      box.value = x.text.slice(0, Number(box.maxLength) > 0 ? Number(box.maxLength) : 2000);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      toast(L('hand.filled'));
    } else if (!x || Date.now() - x.at >= 10 * 60e3) store.set('oomba-handoff', null);
  }
  void root;
}

/** Oomba's words as html: escaped first, then **bold**, "- " lists, paragraphs and [^n] citation numbers. */
export function formatText(text) {
  const blocks = String(text || '').split(/\n{2,}/);
  return blocks.map(b => {
    const lines = b.split('\n');
    const inline = s => esc(s).replace(/\*\*([^*]{1,200})\*\*/g, '<b>$1</b>').replace(/\s?\[\^(\d{1,2})\]/g, '<sup class="oc-c">$1</sup>');
    if (lines.every(l => /^\s*(?:[-•*]|\d+[.)])\s+/.test(l))) return `<ul class="oc-ul">${lines.map(l => `<li>${inline(l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p class="oc-p" dir="auto">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
