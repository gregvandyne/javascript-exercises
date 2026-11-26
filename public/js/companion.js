// Oomba, the teaching companion (docs/decisions.md "Oomba teaching companion"; services/companion.js): the bubble at
// the bottom right of every teacher page (above the phone's tab bar; on the class dashboard at the end of its layout
// bar, hidden in Projector, Eyes up and full screen). Loaded only for Teacher plan staff (views/layout.js companionPage).
// The panel is the shared chat client (public/js/oomba-chat.js); this file adds what the companion has on top:
//   - the page the message was sent from (the server checks it again), an attachment (a lesson plan's text, or a
//     picture without people), web search on or off for this chat, and the microphone (tap to start, tap to stop; the
//     words land in the box to edit; audio isn't kept);
//   - Oomba's answers: the steps it took, game and book cards (Play, Host live, Assign), sources from the web ("Not on
//     Oomba"), a dashboard change to Apply (then Undo), and a hand-off card that opens the Builder or Figures with the
//     brief filled in (the teacher presses the final button there), and a point given to a student or the whole class
//     (the names are filled in by the server for this page only; the AI never sees them), with Undo, or a short choice
//     card when the class, the student or the reason isn't clear;
//   - the book maker (services/companion-book.js): Make a book opens this panel with the first card; the card asks only
//     what is missing (labels dressed by the server in the teacher's language), then waits for the teacher's words (what
//     they type then, and what they attach, goes into the book, never to the AI: "Adding to your book" above the box),
//     then shows exactly what will be sent with Edit and Make my book; a book's changes come back with Undo and Open the book.
//   - the day plan on a class's Homeroom (services/homeroom-plan.js; docs/decisions.md "Homeroom: the day plan"): a card
//     with the parts and their minutes, what each group gets, Use this plan, Start plan, Save plan, the saved plans and
//     Copy to another class. A tap tells the board (the 'oomba:plan' event), whose plan pill follows.
import { t, api, esc, toast, ask, askText, sheet } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { mountChat } from '/js/oomba-chat.js';
import * as BUS from '/js/oomba-bus.js';
import { greeting } from '/js/companion-greet.js';
import { formatText, copyText } from '/js/oomba-text.js';

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
  // A Homeroom teacher's class is one page with three views (public/js/class-views.js): the chat stays where it is (never
  // in the dashboard's footer) and follows the view on screen (the dashboard, or the class).
  const views = !!document.getElementById('cv');
  let dash = PAGE.type === 'dashboard';
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
  const ref = { chat: null };   // the panel, once mounted (its first load runs while mounting)
  const via = (k, ...a) => { const x = P(); return x && typeof x[k] === 'function' ? x[k](...a) : undefined; };
  const chat = mountChat({
    id: 'companion', url: () => '/api/companion/chat', getUrl: () => `/api/companion/chat${ref.chat && ref.chat.state().mode === 'open' ? '' : '?peek=1'}`, alwaysBubble: true,
    start: () => via('start') || 'closed',
    bubbleHost: dash && !views ? document.getElementById('dash-foot') : null,
    subHtml: `<span class="oc-ctx"><i aria-hidden="true"></i>${esc(L('sees'))} <b id="oc-sees">${esc(label())}</b></span>`,
    headExtra: `<button type="button" class="oc-hbtn" id="oc-hist-btn" aria-label="${esc(L('history'))}" title="${esc(L('history'))}" aria-expanded="false" aria-controls="oc-hist">${ic('🕘', 20)}</button><button type="button" class="oc-hbtn" id="oc-new" aria-label="${esc(L('newChat'))}" title="${esc(L('newChat'))}">${ic('✏️', 20)}</button>`,
    aboveRow: '<div class="oc-bookmode" id="oc-bookmode" hidden></div><div class="oc-attach" id="oc-attach" hidden></div><div class="oc-listen" id="oc-listen" role="status" hidden></div>',
    toolsStart: `<button type="button" class="oc-ibtn" id="oc-attach-btn" aria-label="${esc(L('attach'))}" title="${esc(L('attach'))}">${ic('📎', 22)}</button><input type="file" id="oc-file" accept="${DOC_ACCEPT},${IMG_ACCEPT}" hidden>`,
    toolsEnd: `<button type="button" class="oc-ibtn" id="oc-mic" aria-label="${esc(L('mic.start'))}" title="${esc(L('mic.start'))}" hidden>${ic('🎤', 22)}</button>`,
    foot: `<div class="oc-foot"><button type="button" class="oc-pill on" id="oc-web" role="switch" aria-checked="true">${ic('🌐', 16)} <span>${esc(L('web.on'))}</span></button><span class="oc-attachnote" id="oc-note">${esc(L('attachNote'))}</span></div>`,
    // The empty panel: a greeting with the teacher's own name by their local time, no example prompts (the owner's call:
    // nothing is typed for the teacher). A page with its own workflow gives the second line.
    helloHtml: c => { const g = greeting(t, new Date(), PAGE.name || '', via('hello', c) || ''); return `<span class="oc-greet"><b>${esc(g.title)}</b><span>${esc(g.line)}</span></span>`; },
    ideas: () => [],
    ideasAfter: () => [],
    placeholder: c => via('placeholder', c) || L('placeholder'),
    leave: L('leave'),
    stepText: (k, state) => t(`js.companion.prog.${k}.${state === 'done' ? 'done' : 'now'}`),
    quoteText: q => (q.text ? t('js.companion.quoteN', { n: q.n, text: q.text }) : t('js.companion.questionN', { n: q.n })),
    beforeSend: () => via('ensure'),
    body: () => { S.sent = true; stopMic({ cancel: true }); const bk = bookMode(); return { page: pageNow(), ...(via('body') || {}), ...(S.file ? { file: S.file.id } : {}), ...(bk ? { book: bk } : {}) }; },
    errText: code => (['slow', 'fileGone'].includes(code) ? L(`err.${code}`) : null),
    meExtra: x => (x.meta && x.meta.file ? `<span class="oc-file">${ic(x.meta.file.kind === 'image' ? '🖼️' : '📄', 18)} ${esc(x.meta.file.name)}${x.meta.file.pages ? ` <small>${esc(t('js.companion.pages', { n: x.meta.file.pages }))}</small>` : ''}</span>` : ''),
    format: (text, x) => `${x.note && x.note.steps ? stepsHtml(x.note) : ''}${formatText(text)}`,
    // Copy on each answer: its words as clean text (links as "words (address)", steps numbered).
    copyText: x => copyText(x.text, location.origin),
    note: x => noteHtml(x) + (via('note', x) || ''),
    change: x => (x.change && x.change.kind === 'point' ? pointHtml(x) : x.change && x.change.kind === 'class' ? classDoneHtml(x) : x.change && x.change.kind === 'dash' ? changeHtml(x) : x.change && x.change.kind === 'book' ? bookChangeHtml(x) : via('change', x) || changeHtml(x)),
    changeLinks: x => (x.change && x.change.kind === 'class' ? openDashHtml(x) : x.change && x.change.kind === 'book' ? openBookHtml(x) : via('changeLinks', x) || ''),
    extra: (x, c) => via('extra', x, c) || '',
    onAct: async (act, turn, btn) => { const r = await via('onAct', act, turn, btn); return r === undefined ? onAct(act, turn, btn) : r; },
    onAnswer: (x, c) => { if (x.change && x.change.kind === 'dash') afterDash(x.change); if (x.change && x.change.kind === 'point') afterPoint(x.change); via('onAnswer', x, c); },
    onUndo: (r, id) => {
      const u = ((r && r.chat && r.chat.turns) || []).find(x => x.id === id);
      if (u && u.change && u.change.kind === 'point') { afterPoint(u.change); return; }
      // A class Oomba made, deleted: leave its own pages (they are gone with it).
      if (u && u.change && u.change.kind === 'class') { if (PAGE.classId === u.change.classId) location.href = '/teach?all=1'; return; }
      if (dash) { store.set('oc-hl', '[]'); location.reload(); return; }
      via('onUndo', r);
    },
    onQuote: q => via('onQuote', q),
    onMode: m => { if (m !== 'open') stopMic(); via('onMode', m); },
    onSync: c => { if (S.sent) { S.sent = false; setFile(null); } drawBookMode(c); autoCheck(c); via('onSync', c); },
  });
  ref.chat = chat;
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
    if (r.pending) tryResume();
  }).catch(() => {});
  // A request Oomba carried here (Go there): once this page knows what it is (a worksheet or a board says so through
  // the bus), it continues on its own, once. The server runs it only on the exact page it was carried to.
  let resumed = false;
  async function tryResume() {
    if (resumed) return;
    const a = BUS.page();
    if (a && a.ready && !a.ready()) return;
    try {
      const r = await api('/api/companion/resume', { method: 'POST', body: { page: pageNow(), ...(via('body') || {}) } });
      if (!r.resumed) return;
      resumed = true;
      chat.took(r.chat); chat.setMode('open', { focus: false });
    } catch { /* it waits for the next page load */ }
  }
  BUS.onPage(() => { if (!resumed) tryResume(); });
  function drawWeb() {
    const b = $('oc-web'); if (!b) return;
    b.classList.toggle('on', S.web); b.setAttribute('aria-checked', String(S.web)); b.disabled = !S.webAllowed;
    b.querySelector('span').textContent = !S.webAllowed ? L('web.offSchool') : L(S.web ? 'web.on' : 'web.off');
  }
  $('oc-web').addEventListener('click', async () => {
    try { const r = await api('/api/companion/web', { method: 'POST', body: { on: !S.web } }); S.web = !!r.web; drawWeb(); } catch (e) { chat.showErr(e.message); }
  });
  // New chat: the one open goes to the chat history (nothing is lost, so no question first).
  $('oc-new').addEventListener('click', async () => {
    try { const r = await api('/api/companion/chat/new', { method: 'POST', body: {} }); showHist(false); chat.took(r.chat, { initial: true }); setFile(null); } catch (e) { chat.showErr(e.message); }
  });

  // ---------------------------------------------------------------- chat history
  // In the panel, in the conversation's place: the past chats (their first message and when), Open one again, Delete.
  const hist = document.createElement('section');
  hist.className = 'oc-hist'; hist.id = 'oc-hist'; hist.hidden = true; hist.setAttribute('aria-labelledby', 'oc-hist-h');
  $('oc-log').before(hist);
  const when = at => { const d = new Date(at), today = new Date().toDateString() === d.toDateString(), lang = document.documentElement.lang || undefined;
    return today ? d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(lang, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
  function drawHist(list) {
    const rows = list.map(c => `<li class="oc-hrow"><button type="button" class="oc-hopen" data-h="open" data-id="${esc(c.id)}"><span class="oc-htitle" dir="auto">${esc(c.title || L('history'))}</span><span class="oc-hwhen">${esc(when(c.at))}</span></button>
      <button type="button" class="oc-hdel" data-h="del" data-id="${esc(c.id)}" aria-label="${esc(L('historyDelete'))}" title="${esc(L('historyDelete'))}">${ic('🗑️', 18)}</button></li>`).join('');
    hist.innerHTML = `<div class="oc-hhead"><h3 id="oc-hist-h">${esc(L('history'))}</h3><button type="button" class="btn btn-sm" data-h="back">${esc(L('historyBack'))}</button></div>
      ${list.length ? `<ul class="oc-hlist">${rows}</ul>` : `<p class="oc-hempty">${esc(L('historyEmpty'))}</p>`}`;
  }
  async function showHist(on) {
    hist.hidden = !on; $('oc-log').hidden = on; $('oc-form').hidden = on;
    $('oc-hist-btn').setAttribute('aria-expanded', String(on)); $('oc-hist-btn').classList.toggle('on', on);
    if (!on) return;
    hist.innerHTML = '';
    try { const r = await api('/api/companion/chats'); drawHist(r.chats || []); hist.querySelector('[data-h="back"]').focus(); }
    catch (e) { showHist(false); chat.showErr(e.message); }
  }
  $('oc-hist-btn').addEventListener('click', () => showHist(hist.hidden));
  hist.addEventListener('click', async e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    if (b.dataset.h === 'back') { showHist(false); $('oc-in').focus(); return; }
    const id = b.dataset.id;
    if (b.dataset.h === 'open') {
      b.disabled = true;
      try { const r = await api(`/api/companion/chats/${encodeURIComponent(id)}/open`, { method: 'POST', body: {} }); showHist(false); chat.took(r.chat, { initial: true }); setFile(null); $('oc-in').focus(); }
      catch (err) { b.disabled = false; showHist(false); chat.showErr(err.message); }
      return;
    }
    if (b.dataset.h === 'del') {
      if (!(await ask({ text: L('historyDeleteAsk'), ok: L('historyDeleteOk'), danger: true }))) return;
      try { await api(`/api/companion/chats/${encodeURIComponent(id)}/delete`, { method: 'POST', body: {} }); const li = b.closest('li'), next = li.nextElementSibling || li.previousElementSibling; li.remove();
        if (!hist.querySelector('.oc-hrow')) drawHist([]); (next && next.querySelector('.oc-hopen') || hist.querySelector('[data-h="back"]')).focus(); }
      catch (err) { toast(err.message); }
    }
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
      if (r.removed) toast(t('js.companion.removed', { count: r.removed }));
      // A book being set up waits for the teacher's own words: the file goes into the book (never to the AI).
      const bk = bookMode();
      if (bk) { setFile(null); const turn = bookTurn(); const x = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: turn.id, act: 'bookFile', value: r.file.id } }); chat.took(x.chat); $('oc-in').focus(); return; }
      setFile(r.file);
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
    if (n.pick) parts.push(pickHtml(x, n.pick));
    if (n.ask) parts.push(askHtml(x, n.ask));
    if (n.classNew) parts.push(classHtml(x, n.classNew));
    if (n.nav && !n.nav.open) parts.push(navHtml(x, n.nav));
    if (n.book) parts.push(bookHtml(x, n.book));
    if (n.bookDelete) parts.push(bookDelHtml(x, n.bookDelete));
    if (n.plan) parts.push(planHtml(x, n.plan));
    if (n.week) parts.push(weekHtml(x, n.week));
    if (n.bookNone) parts.push(`<div class="oc-acts"><a class="btn btn-sm btn-primary" href="/library/make?new=1" data-oc-book>${ic('✨', 16)} ${esc(L('book.make'))}</a></div>`);
    if (n.bookRef && !x.change) parts.push(`<div class="oc-acts"><a class="btn btn-sm btn-primary" href="${esc(n.bookRef.href)}">${ic('📖', 16)} ${esc(L('book.open'))}</a></div>`);
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
  // ---------------------------------------------------------------- points (docs/decisions.md "Points from the Oomba chat")
  const reasonIc = it => `<span class="oc-pic" aria-hidden="true">${ic(it.icon || '⭐', 22)}</span>`;
  function pointHtml(x) {
    const c = x.change; if (!c || c.kind !== 'point') return '';
    const here = dash && (c.items || []).every(it => it.classId === PAGE.classId);
    const someone = L('point.someone');
    const line = it => (it.user ? t('js.companion.point.given', { name: it.name || someone, reason: it.word || '' }) : t('js.companion.point.classGiven', { reason: it.word || '' }));
    const rows = (c.items || []).map(it => `<p class="oc-point">${reasonIc(it)}<span><b>${esc(line(it))}</b>${it.className && !here ? `<small>${esc(it.className)}</small>` : ''}</span></p>`).join('');
    const gc = (c.items || []).some(it => it.gc) ? `<span class="oc-note">${esc(L('point.gc'))}</span>` : '';
    const open = !here && c.items && c.items[0] ? `<a class="btn btn-sm" href="/class/${encodeURIComponent(c.items[0].classId)}/dashboard">${esc(L('dash.openDash'))}</a>` : '';
    return `${rows}${gc}${open ? `<div class="oc-acts">${open}</div>` : ''}`;
  }
  function pickHtml(x, p) {
    const known = [p.cls ? L('point.wholeClass') : p.name, p.word, p.className].filter(Boolean);
    if (p.state !== 'open') return `<div class="oc-change oc-pick"><p class="oc-state">${ic('✓', 16)} ${esc(L('point.picked'))}</p></div>`;
    const btns = (p.options || []).map(o => `<button type="button" class="btn btn-sm oc-pickb" data-c="act" data-act="pick" data-turn="${esc(x.id)}" data-v="${esc(o.v)}">${o.icon ? `${ic(o.icon, 18)} ` : ''}<span${p.need === 'student' ? ' class="oc-name"' : ''}>${esc(o.label)}</span></button>`).join('');
    return `<div class="oc-change oc-pick"><p><b>${esc(L(`point.pick.${p.need || 'reason'}`))}</b></p>${known.length ? `<p class="oc-hsub">${esc(known.join(' · '))}</p>` : ''}<div class="oc-acts oc-picks">${btns}</div><span class="oc-note">${esc(L('point.nothingYet'))}</span></div>`;
  }
  /** A point given or taken back: the dashboard on this page asks for its points now (public/js/dash.js listens). */
  function afterPoint(c) {
    if (!dash || !(c.items || []).some(it => it.classId === PAGE.classId)) return;
    document.dispatchEvent(new CustomEvent('oomba:points', { detail: { classId: PAGE.classId } }));
  }
  // Navigate-then-do: "I'll open <page> and do this there" with Go there and Not now. Go there keeps the request with
  // the conversation for that exact page (the server), and this page opens it; there the panel opens and the request
  // continues by itself (tryResume below).
  const navName = n => t(`js.companion.nav.${n.pageType === 'dashboard' ? 'dashboard' : n.pageType === 'class' ? 'class' : n.pageType === 'figures-sheet' ? 'sheet' : n.pageType === 'book' ? 'book' : 'board'}`, { name: n.name || '' });
  // A new class: "Create the class ...?" with Create and Not now; once made, Undo and a card to open its dashboard.
  function classHtml(x, p) {
    const q = t(p.grade ? 'js.companion.cls.askGrade' : 'js.companion.cls.ask', { name: p.name, grade: p.grade });
    if (p.state !== 'open') return `<div class="oc-change oc-cls done"><p class="oc-state">${ic(p.state === 'created' ? '✓' : '➖', 16)} ${esc(L(`cls.${p.state === 'created' ? 'created' : p.state === 'denied' ? 'denied' : 'declined'}`))}</p></div>`;
    return `<div class="oc-change oc-cls"><p>${ic('🏫', 20)} <b dir="auto">${esc(q)}</b></p>${p.school ? `<p class="oc-hsub">${esc(t('js.companion.cls.at', { school: p.school }))}</p>` : ''}<div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="create" data-turn="${esc(x.id)}">${ic('➕', 16)} ${esc(L('cls.create'))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="createNo" data-turn="${esc(x.id)}">${esc(L('cls.notNow'))}</button></div></div>`;
  }
  // Beside its Undo: Open its dashboard (Go there, so the panel opens there too; a plain link once used).
  const openDashHtml = x => {
    const n = x.note && x.note.nav;
    return n && n.open && n.state === 'open' ? `<button type="button" class="btn btn-sm btn-primary oc-open" data-c="act" data-act="go" data-turn="${esc(x.id)}">${ic('🖥️', 16)} ${esc(L('cls.openDash'))}</button>`
      : `<a class="btn btn-sm oc-open" href="/class/${encodeURIComponent(x.change.classId)}/dashboard">${ic('🖥️', 16)} ${esc(L('cls.openDash'))}</a>`;
  };
  const classDoneHtml = x => `<p>${ic('🏫', 18)} <b dir="auto">${esc(t('js.companion.cls.done', { name: x.change.name }))}</b></p>`;
  function navHtml(x, n) {
    const where = navName(n);
    if (n.state === 'open') return `<div class="oc-nav"><p>${ic('🧭', 18)} <span>${esc(t('js.companion.nav.offer', { page: where }))}</span></p><p class="oc-navq" dir="auto">${esc(n.request)}</p><div class="oc-acts"><button type="button" class="btn btn-sm btn-primary" data-c="act" data-act="go" data-turn="${esc(x.id)}">${esc(L('nav.go'))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="notNow" data-turn="${esc(x.id)}">${esc(L('nav.notNow'))}</button></div></div>`;
    return `<div class="oc-nav done"><p class="oc-state">${ic(n.state === 'going' ? '🧭' : '➖', 16)} ${esc(t(`js.companion.nav.${n.state === 'going' ? 'went' : n.state === 'expired' ? 'expired' : 'declined'}`, { page: where }))}</p></div>`;
  }
  // A choice card: 2 to 5 options and "Something else" (it puts the caret in the box). A tap is the teacher's answer.
  function askHtml(x, k) {
    const q = k.question || (k.kind ? t(`js.companion.which.${k.kind === 'dashboard' ? 'dashboard' : k.kind === 'class' ? 'class' : k.kind === 'figures-sheet' ? 'sheet' : k.kind === 'book' ? 'book' : 'board'}`) : '');
    if (k.state !== 'open') { const o = k.options[k.chosen]; return `<div class="oc-ask done">${q ? `<p class="oc-askq">${esc(q)}</p>` : ''}${o ? `<p class="oc-state">${ic('✓', 16)} ${esc(o.label)}</p>` : ''}</div>`; }
    // An option that only says what the last button says ("Something else") is not shown twice (turns saved before the server dropped it).
    const same = o => String(o.label || '').toLowerCase().replace(/[\s.!?:;,"'()]+/g, '') === String(L('ask.other')).toLowerCase().replace(/[\s.!?:;,"'()]+/g, '');
    const btns = k.options.map((o, i) => same(o) ? '' : `<button type="button" class="btn btn-sm oc-pickb" data-c="act" data-act="askPick" data-turn="${esc(x.id)}" data-v="${i}"><span dir="auto">${esc(o.label)}</span>${o.sub ? ` <small>${esc(t('js.companion.card.grade', { g: o.sub.replace(/^grade /, '') }))}</small>` : ''}${o.kindText ? ` <small>${esc(o.kindText)}${o.at ? ` · ${esc(new Date(o.at).toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric' }))}` : ''}</small>` : ''}</button>`).join('');
    return `<div class="oc-ask" role="group"${q ? ` aria-label="${esc(q)}"` : ''}>${q ? `<p class="oc-askq">${esc(q)}</p>` : ''}<div class="oc-acts">${btns}<button type="button" class="btn btn-sm btn-ghost" data-c="act" data-act="askOther" data-turn="${esc(x.id)}">${esc(L('ask.other'))}</button></div></div>`;
  }
  // ---------------------------------------------------------------- the day plan (services/homeroom-plan.js)
  function planHtml(x, p) {
    if (p.gone) return `<div class="oc-plan done"><p class="oc-state">${ic('➖', 16)} ${esc(L('plan.gone'))}</p></div>`;
    const id = esc(x.id);
    const b = (act, label, { v = '', primary = false, ghost = false, icon = '', off = false } = {}) => `<button type="button" class="btn btn-sm${primary ? ' btn-primary' : ''}${ghost ? ' btn-ghost' : ''}" data-c="act" data-act="${act}" data-turn="${id}"${v !== '' ? ` data-v="${esc(v)}"` : ''}${off ? ' disabled' : ''}>${icon ? `${ic(icon, 16)} ` : ''}${esc(label)}</button>`;
    const parts = partsHtml(p.parts);
    const st = p.state;
    let acts;
    if (st === 'draft') acts = p.otherRunning ? `<p class="oc-note">${esc(L('plan.otherRunning'))}</p>` : `${b('planUse', L('plan.use'), { primary: true, icon: '🎒' })}${b('planStart', L('plan.useStart'), { icon: '▶️' })}`;
    else if (st === 'ready') acts = `<p class="oc-state">${ic('✓', 16)} ${esc(L('plan.onDesks'))}</p>${b('planStart', L('plan.start'), { primary: true, icon: '▶️' })}`;
    else if (st === 'running' || st === 'done') acts = `<p class="oc-state">${ic('▶️', 16)} ${esc(L(st === 'done' ? 'plan.allDone' : 'plan.running'))}</p>`;
    else if (st === 'finished') acts = `<p class="oc-state">${ic('🏁', 16)} ${esc(L('plan.finished'))}</p>`;
    else acts = `<p class="oc-state">${ic('➖', 16)} ${esc(L('plan.past'))}</p>`;
    const saved = p.savedAs ? `<span class="oc-state">${ic('💾', 16)} ${esc(t('js.companion.plan.savedAs', { name: p.savedAs.name }))}</span>` : b('planSave', L('plan.save'), { ghost: true, icon: '💾' });
    const list = (p.saved || []).filter(s => !p.from || s.id !== p.from.id);
    const savedList = list.length ? `<details class="oc-pmore"><summary>${ic('📚', 16)} ${esc(L('plan.savedPlans'))}</summary><div class="oc-acts">${list.map(s => b('planPick', `${s.name} · ${t('js.companion.plan.min', { count: s.minutes })}`, { v: s.id })).join('')}</div></details>` : '';
    const copy = (p.copy || []).length ? `<details class="oc-pmore"><summary>${ic('📋', 16)} ${esc(L('plan.copyTo'))}</summary><div class="oc-acts">${p.copy.map(c => b('planCopy', c.name, { v: c.id })).join('')}</div></details>` : '';
    return `<div class="oc-plan" role="group" aria-label="${esc(p.name || L('plan.title'))}">
      <div class="oc-planh">${ic('🗓️', 20)} <b dir="auto">${esc(p.name || L('plan.title'))}</b><span class="oc-tag">${esc(t('js.companion.plan.min', { count: p.total }))}</span></div>
      <p class="oc-hsub" dir="auto">${esc(p.className)}${p.from ? ` · ${esc(t('js.companion.plan.fromName', { name: p.from.name }))}` : ''}</p>
      <ol class="plain oc-pparts">${parts}</ol>
      ${p.changed ? `<p class="oc-note">${esc(t('js.companion.plan.changed', { count: p.changed }))}</p>` : ''}
      <div class="oc-acts oc-pacts">${acts}</div>
      <div class="oc-acts oc-pfoot">${saved}</div>${savedList}${copy}
      ${st === 'draft' ? `<p class="oc-note">${esc(L('plan.askChanges'))}</p>` : ''}</div>`;
  }
  /** A plan's parts in order: minutes, kind, title, what each group gets, the note. */
  function partsHtml(list) {
    const kind = k => L(`plan.kind.${k}`);
    return list.map(q => `<li class="oc-ppart k-${esc(q.kind)}${q.now ? ' now' : ''}${q.done ? ' done' : ''}"><span class="oc-pmin">${q.done ? ic('✓', 14) : ''}${esc(t('js.companion.plan.min', { count: q.minutes }))}</span><span class="oc-pb"><b>${esc(kind(q.kind))}</b>${q.title ? `<span dir="auto">${esc(q.title)}</span>` : ''}${q.now ? `<span class="oc-tag oc-pnow">${esc(L('plan.nowTag'))}</span>` : ''}</span>
      ${q.give.length ? `<ul class="plain oc-pgive">${q.give.map(g => `<li>${ic(g.icon || '🎮', 16)} <span>${g.who ? `<b dir="auto">${esc(g.who)}:</b> ` : ''}<span dir="auto">${esc(g.what)}</span>${g.type === 'make' ? ` <small>${esc(L('plan.newLesson'))}</small>` : g.type === 'lesson' ? ` <small>${esc(L('plan.lesson'))}</small>` : ''}</span></li>`).join('')}</ul>` : ''}${q.note ? `<p class="oc-pnote" dir="auto">${esc(q.note)}</p>` : ''}</li>`).join('');
  }
  // ---------------------------------------------------------------- a week plan (services/homeroom-week.js)
  /** The week card: Monday to Friday, each a short day plan (open a day for its parts), Use this week, Copy to next
   *  week, Copy to another class (with a preview first). */
  function weekHtml(x, w) {
    if (w.gone) return `<div class="oc-plan done"><p class="oc-state">${ic('➖', 16)} ${esc(L('plan.gone'))}</p></div>`;
    const id = esc(x.id);
    const b = (act, label, { v = '', primary = false, ghost = false, icon = '' } = {}) => `<button type="button" class="btn btn-sm${primary ? ' btn-primary' : ''}${ghost ? ' btn-ghost' : ''}" data-c="act" data-act="${act}" data-turn="${id}"${v !== '' ? ` data-v="${esc(v)}"` : ''}>${icon ? `${ic(icon, 16)} ` : ''}${esc(label)}</button>`;
    const kinds = d => d.parts.map(q => `<span class="oc-wk k-${esc(q.kind)}">${esc(t(`js.companion.plan.kind.${q.kind}`))} ${esc(t('js.companion.plan.min', { count: q.minutes }))}</span>`).join('');
    const days = w.days.map(d => `<li class="oc-wday${d.today ? ' today' : ''}${d.past ? ' past' : ''}${d.parts ? '' : ' empty'}">
      ${d.parts ? `<details><summary><span class="oc-wdn"><b>${esc(d.day)}</b>${d.today ? `<small>${esc(L('week.today'))}</small>` : ''}</span><span class="oc-wdb"><span class="oc-wname" dir="auto">${esc(d.name || L('plan.title'))}</span><span class="oc-wkinds">${kinds(d)}</span></span><span class="oc-wtot">${esc(t('js.companion.plan.min', { count: d.total }))}${d.half ? `<small>${esc(L('week.half'))}</small>` : ''}</span></summary>
        <ol class="plain oc-pparts">${partsHtml(d.parts)}</ol></details>`
    : `<div class="oc-wnone"><span class="oc-wdn"><b>${esc(d.day)}</b></span><span class="muted">${esc(L('week.noPlan'))}</span></div>`}</li>`).join('');
    const acts = w.state === 'used' ? `<p class="oc-state">${ic('✓', 16)} ${esc(L('week.saved'))}</p>`
      : w.past ? `<p class="oc-state">${ic('➖', 16)} ${esc(L('week.past'))}</p>` : b('planWeekUse', L('week.use'), { primary: true, icon: '🗓️' });
    const copy = (w.copy || []).length ? `<details class="oc-pmore"><summary>${ic('📋', 16)} ${esc(L('plan.copyTo'))}</summary><div class="oc-acts">${w.copy.map(c => b('planWeekCopy', c.name, { v: c.id })).join('')}</div></details>` : '';
    const range = w.days.length ? t('js.companion.week.range', { from: dayShort(w.days[0].date), to: dayShort(w.days[w.days.length - 1].date) }) : '';
    return `<div class="oc-plan oc-week" role="group" aria-label="${esc(w.name || L('week.title'))}">
      <div class="oc-planh">${ic('🗓️', 20)} <b dir="auto">${esc(w.name || L('week.title'))}</b><span class="oc-tag">${esc(range)}</span></div>
      <p class="oc-hsub" dir="auto">${esc(w.className)}${w.copiedFrom ? ` · ${esc(t('js.companion.week.copiedFrom', { name: w.copiedFrom }))}` : ''}</p>
      <ol class="plain oc-wdays">${days}</ol>
      ${w.changed ? `<p class="oc-note">${esc(t('js.companion.plan.changed', { count: w.changed }))}</p>` : ''}
      <div class="oc-acts oc-pacts">${acts}</div>
      <div class="oc-acts oc-pfoot">${b('planWeekNext', L('week.next'), { ghost: true, icon: '⏭️' })}</div>${copy}
      ${w.state !== 'used' ? `<p class="oc-note">${esc(L('week.askChanges'))}</p>` : `<p class="oc-note">${esc(L('week.eachMorning'))}</p>`}</div>`;
  }
  const dayShort = iso => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return iso; } };
  /** The copy preview: what will be handed out where in the other class, and any group it doesn't have. -> true to copy */
  function copyPreview(pv) {
    return new Promise(done => {
      let yes = false;
      const give = g => `<li>${ic(g.type === 'make' ? '✨' : g.type === 'lesson' ? '📄' : '🎮', 16)} <span>${g.who ? `<b dir="auto">${esc(g.who)}:</b> ` : g.others ? `<b>${esc(L('plan.everyoneElse'))}:</b> ` : `<b>${esc(L('copy.everyone'))}:</b> `}<span dir="auto">${esc(g.what)}</span></span></li>`;
      const partRows = parts => parts.filter(q => q.give.length).map(q => `<li><b>${esc(L(`plan.kind.${q.kind}`))}</b>${q.title ? ` <span dir="auto">${esc(q.title)}</span>` : ''}<ul class="plain oc-pgive">${q.give.map(give).join('')}</ul></li>`).join('');
      const body = pv.kind === 'week' ? pv.days.filter(d => d.parts.length).map(d => `<section class="oc-cpday"><h3>${esc(d.day)}${d.name ? ` · <span dir="auto">${esc(d.name)}</span>` : ''}</h3>${partRows(d.parts) ? `<ul class="plain oc-cpparts">${partRows(d.parts)}</ul>` : `<p class="small muted">${esc(L('copy.nothing'))}</p>`}</section>`).join('')
        : partRows(pv.parts) ? `<ul class="plain oc-cpparts">${partRows(pv.parts)}</ul>` : `<p class="small muted">${esc(L('copy.nothing'))}</p>`;
      const miss = (pv.missing || []).map(m => `<li>${ic('ℹ️', 16)} <span>${esc(t(`js.companion.copy.${m.to === 'everyone' ? 'missingEveryone' : 'missingNone'}`, { group: m.group, cls: pv.className }))}</span></li>`).join('');
      const sh = sheet({ title: `📋 ${t('js.companion.copy.title', { cls: pv.className })}`, onClose: () => done(yes), content: `<div class="oc-copyprev">
        <p class="small muted">${esc(L(pv.kind === 'week' ? 'copy.leadWeek' : 'copy.lead'))}</p>
        ${miss ? `<ul class="plain oc-cpmiss">${miss}</ul>` : ''}${body}
        <div class="row oc-cpacts"><button type="button" class="btn" data-cp="no">${esc(L('copy.cancel'))}</button><button type="button" class="btn btn-primary" data-cp="yes">${ic('📋', 16)} ${esc(t('js.companion.copy.go', { cls: pv.className }))}</button></div></div>` });
      sh.el.classList.add('oc-copysheet');
      // (the sheet puts the focus on its first button, at the bottom: the preview is read from the top)
      setTimeout(() => { for (const el of [sh.el.querySelector('.sheet'), sh.el.querySelector('.sheet-body')]) if (el) el.scrollTop = 0; sh.el.querySelector('[data-cp="yes"]')?.focus({ preventScroll: true }); }, 60);
      sh.el.addEventListener('click', e => { const c = e.target.closest('[data-cp]'); if (!c) return; yes = c.dataset.cp === 'yes'; sh.close(); });
    });
  }
  // "Something else" on the book card's theme: Use this theme sends the teacher's own theme (bookTheme).
  document.addEventListener('input', e => {
    const f = e.target.closest && e.target.closest('.oc-btheme');
    if (f) f.querySelector('button[type="submit"]').disabled = e.target.value.trim().length < 2;
  });
  document.addEventListener('submit', async e => {
    const f = e.target.closest && e.target.closest('.oc-btheme'); if (!f) return;
    e.preventDefault();
    const v = f.querySelector('input').value.trim(), go = f.querySelector('button[type="submit"]');
    if (v.length < 2 || go.disabled) return;
    go.disabled = true;
    try { const r = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: f.dataset.turn, act: 'bookTheme', value: v } }); if (r.chat) chat.took(r.chat); }
    catch { go.disabled = false; }
  });
  async function onAct(act, turn, btn) {
    if (!turn) return null;
    if (act === 'askOther') { const box = $('oc-in'); box.focus(); return null; }
    if (act === 'bookOther') {
      const f = document.getElementById(`oc-btheme-${turn.id}`); if (!f) return null;
      f.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('on'); f.querySelector('input').focus(); return null;
    }
    if (act === 'planSave') {
      const p = turn.note && turn.note.plan;
      const v = await askText({ title: L('plan.saveTitle'), label: L('plan.saveLabel'), value: (p && (p.name || p.topic)) || '', ok: L('plan.save'), max: 60 });
      if (!v || !v.trim()) return null;
      btn.dataset.v = v.trim().slice(0, 60);
    }
    // Copying a plan or a week to another class: the preview first (what goes where there, groups it doesn't have).
    if ((act === 'planCopy' || act === 'planWeekCopy') && btn && btn.dataset.v) {
      try {
        const pr = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: turn.id, act: act === 'planCopy' ? 'planCopyPreview' : 'planWeekCopyPreview', value: btn.dataset.v } });
        if (!pr.preview || !(await copyPreview(pr.preview))) return null;
      } catch (e) { chat.showErr(e.message); return null; }
    }
    if (act === 'rebrief') { const box = $('oc-in'); box.value = L('hand.changeText'); box.dispatchEvent(new Event('input')); box.focus(); return null; }
    try {
      const r = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: turn.id, act, ...(act === 'pick' && btn ? { pick: btn.dataset.v } : {}), ...((act === 'askPick' || /^(book|plan)[A-Z]/.test(act)) && btn && btn.dataset.v !== undefined ? { value: btn.dataset.v } : {}) } });
      if (act === 'bookStart' && r.chat) { chat.took(r.chat); return null; }
      // A book deleted from the chat: its card on this page goes; on its own page, back to the books.
      if (act === 'bookDelete' && turn.note && turn.note.bookDelete) {
        const id = turn.note.bookDelete.bookId;
        document.querySelectorAll(`.sb-bcard[data-book="${CSS.escape(id)}"]`).forEach(el => el.remove());
        if (PAGE && pageNow().type === 'book' && pageNow().bookId === id) { chat.took(r.chat); location.href = '/library/make'; return null; }
      }
      if (act === 'go' && r.href) { chat.took(r.chat); store.set('oc:companion', 'open'); location.href = r.href; return null; }
      // An option without a target: sent as the teacher's answer, as if typed.
      if (act === 'askPick' && r.text) { chat.took(r.chat); setTimeout(() => chat.send(r.text), 0); return null; }
      // A day plan's card: the board's plan pill follows (public/js/homeroom-plan.js listens).
      if (r && 'plan' in r) document.dispatchEvent(new CustomEvent('oomba:plan', { detail: { classId: r.classId, plan: r.plan } }));
      if (r && r.toast) toast(r.toast);
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

  // ---------------------------------------------------------------- the book maker (services/companion-book.js)
  /** The card of the book being set up, when it is the newest turn and waits for the teacher's own words. */
  const bookTurn = (c = chat.state().chat) => { const last = [...(c.turns || [])].reverse().find(x => x.role === 'oomba'); const b = last && last.note && last.note.book; return b && (b.state === 'context' || b.state === 'check') && (c.turns || [])[c.turns.length - 1] === last ? last : null; };   // at the check too: more words or files still go into the book
  const bookMode = () => { const x = bookTurn(); return x && S.bookOff !== x.note.book.id ? x.note.book.id : null; };
  function drawBookMode() {
    const el = $('oc-bookmode'); if (!el) return;
    const id = bookMode();
    el.hidden = !id;
    el.innerHTML = id ? `<span class="oc-chipfile oc-bookchip">${ic('📖', 18)} <span>${esc(L('book.adding'))}</span><button type="button" class="oc-hbtn oc-x" id="oc-bookoff" aria-label="${esc(L('book.stopAdding'))}" title="${esc(L('book.stopAdding'))}">✕</button></span>` : '';
  }
  $('oc-bookmode').addEventListener('click', e => { if (e.target.closest('#oc-bookoff')) { const x = bookTurn(); if (x) S.bookOff = x.note.book.id; drawBookMode(); $('oc-in').focus(); } });
  // A card at Check with nothing checked yet (the AI filled the last answer in): it checks once by itself.
  const checked = new Set();
  function autoCheck(c) {
    for (const x of c.turns || []) {
      const b = x.note && x.note.book;
      if (!b || b.state !== 'check' || b.rows || checked.has(`${b.id}:${b.v}`)) continue;
      checked.add(`${b.id}:${b.v}`);
      api('/api/companion/chat/act', { method: 'POST', body: { turnId: x.id, act: 'bookCheck' } }).then(r => chat.took(r.chat)).catch(e => chat.showErr(e.message));
    }
  }
  function bookHtml(x, b) {
    const id = esc(x.id);
    const btn = (act, label, { v = '', primary = false, ghost = false, icon = '', off = false } = {}) => `<button type="button" class="btn btn-sm${primary ? ' btn-primary' : ''}${ghost ? ' btn-ghost' : ''}" data-c="act" data-act="${act}" data-turn="${id}"${v !== '' ? ` data-v="${esc(v)}"` : ''}${off ? ' disabled' : ''}>${icon ? `${ic(icon, 16)} ` : ''}${esc(label)}</button>`;
    if (b.state === 'moved') return '';
    if (b.state === 'cancelled') return `<div class="oc-ask oc-book done"><p class="oc-state">${ic('➖', 16)} ${esc(b.L.stopped)}</p></div>`;
    if (b.state === 'started') return `<div class="oc-ask oc-book done"><p class="oc-state">${ic('✓', 16)} ${esc(b.L.started)}</p>${b.known.length ? `<p class="oc-hsub">${esc(b.known.join(' · '))}</p>` : ''}</div>`;
    const known = b.known.length ? `<p class="oc-hsub oc-bknown">${esc(b.known.join(' · '))}</p>` : '';
    const err = b.error ? `<p class="oc-berr" role="alert">${esc(b.error)}</p>` : '';
    const stop = btn('bookStop', b.L.stop, { ghost: true });
    if (b.options) {
      const opts = b.options.map(o => `<button type="button" class="btn btn-sm oc-pickb${o.sub ? ' oc-bigb' : ''}" data-c="act" data-act="bookPick" data-turn="${id}" data-v="${esc(o.v)}">${o.icon ? `${ic(o.icon, o.sub ? 28 : 18)} ` : ''}<span>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`).join('');
      // The theme: "Something else" opens a box for the teacher's own theme, where the card's foot is.
      const other = b.ownTheme ? `<button type="button" class="btn btn-sm oc-pickb" data-c="act" data-act="bookOther" data-turn="${id}" aria-expanded="false" aria-controls="oc-btheme-${id}"><span>${esc(b.L.other)}</span></button>` : '';
      const own = b.ownTheme ? `<form class="oc-btheme" id="oc-btheme-${id}" data-turn="${id}" hidden><label class="sr-only" for="oc-btheme-in-${id}">${esc(b.L.other)}</label><input class="input" id="oc-btheme-in-${id}" maxlength="${b.ownTheme}" placeholder="${esc(b.L.themeHint)}" dir="auto" autocomplete="off"><button type="submit" class="btn btn-sm btn-primary" disabled>${esc(b.L.useTheme)}</button></form>` : '';
      return `<div class="oc-ask oc-book" role="group" aria-label="${esc(b.question)}">${known}<p class="oc-askq">${esc(b.question)}</p><div class="oc-acts${b.options.some(o => o.sub) ? ' oc-bigs' : ''}">${opts}${other}</div>${err}<div class="oc-bfoot">${own}${stop}</div></div>`;
    }
    if (b.state === 'context') {
      const have = b.have.length ? `<ul class="oc-bhave">${b.have.map(h => `<li>${ic('✓', 14)} <span dir="auto">${esc(h)}</span></li>`).join('')}</ul>` : '';
      return `<div class="oc-ask oc-book">${known}<p class="oc-askq">${esc(b.question)}</p><p class="oc-bhint">${esc(b.hint)}</p>${have}<p class="oc-bnote">${ic('🔒', 14)} ${esc(b.L.privacy)}</p>${err}
        <div class="oc-acts">${b.canSkip ? btn('bookCheck', b.L.skip) : ''}${b.have.length ? btn('bookClear', b.L.clear) : ''}${stop}</div></div>`;
    }
    // check
    if (!b.rows) return `<div class="oc-ask oc-book"><p class="oc-askq">${esc(b.title)}</p><p class="oc-hsub">${esc(b.L.checking)}</p></div>`;
    const rows = b.rows.map(r => `<div class="oc-brow"><dt>${esc(r.label)}</dt><dd>${r.text !== undefined ? (r.text ? `<div class="oc-bsent" dir="auto" tabindex="0">${esc(r.text)}</div>` : `<span class="oc-hsub">${esc(r.none)}</span>`) : `<span dir="auto">${esc(r.value)}</span>`}</dd><dd class="oc-bedit">${btn('bookEdit', b.L.edit, { v: r.part, ghost: true, icon: '✏️' })}</dd></div>`).join('');
    const notes = (b.notes || []).map(n => `<p class="oc-bnote ${n.kind === 'warn' ? 'warn' : ''}"${n.kind === 'warn' ? ' role="alert"' : ''}>${ic(n.kind === 'warn' ? '⚠️' : '🔒', 14)} ${esc(n.text)}</p>`).join('');
    return `<div class="oc-ask oc-book oc-bcheck"><p class="oc-askq">${esc(b.title)}</p><p class="oc-hsub">${esc(b.lead)}</p><dl class="oc-bsum">${rows}</dl>${notes}<p class="oc-bnote">${ic('🔒', 14)} ${esc(b.L.never)}</p>${err}
      <div class="oc-acts">${btn('bookStart', b.L.go, { primary: true, icon: '✨', off: !b.ok })}${stop}</div></div>`;
  }
  // Delete a book from the chat: never at once; Delete (the cards' own delete) or Keep.
  function bookDelHtml(x, d) {
    if (d.state !== 'open') return `<div class="oc-change oc-bdel done"><p class="oc-state">${ic(d.state === 'deleted' ? '✓' : '➖', 16)} ${esc(t(`js.companion.book.${d.state === 'deleted' ? 'deleted' : 'kept'}`, { title: d.title }))}</p></div>`;
    return `<div class="oc-change oc-bdel" role="group" aria-label="${esc(t('js.companion.book.delQ', { title: d.title }))}"><p>${ic('🗑️', 20)} <b dir="auto">${esc(t('js.companion.book.delQ', { title: d.title }))}</b></p><p class="oc-hsub">${esc(L('book.delText'))}</p>
      <div class="oc-acts"><button type="button" class="btn btn-sm btn-danger-solid" data-c="act" data-act="bookDelete" data-turn="${esc(x.id)}">${ic('🗑️', 16)} ${esc(L('book.delete'))}</button><button type="button" class="btn btn-sm" data-c="act" data-act="bookKeep" data-turn="${esc(x.id)}">${esc(L('book.keep'))}</button></div></div>`;
  }
  function bookChangeHtml(x) {
    const c = x.change, l = c.lines || { title: '', items: [] };
    const warn = l.warn ? `<p class="oc-bnote warn oc-ch-warn" role="status">${ic('⚠️', 16)} ${esc(l.warn)}</p>` : '';
    return `${warn}<p class="oc-ch-h"><b>${esc(l.title)}</b></p><ul class="oc-ch-list">${l.items.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  }
  // Open the book: the chat steps aside (minimized) so the book is what shows (the owner, 24 Nov 2026).
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#oc a[href^="/library/make/"]'); if (a) { store.set('oc:companion', 'min'); if (ref.chat) ref.chat.setMode('min', { user: true }); } }, true);
  const openBookHtml = x => (PAGE && pageNow().type === 'book' && pageNow().bookId === x.change.bookId ? '' : `<a class="btn btn-sm btn-primary oc-open" href="/library/make/${encodeURIComponent(x.change.bookId)}">${ic('📖', 16)} ${esc(L('book.open'))}</a>`);
  /** Make a book: the first card in this panel (the library's button, and /read?make=1 after /library/make?new=1). */
  async function makeBook() {
    try { const r = await api('/api/companion/book/new', { method: 'POST', body: {} }); chat.took(r.chat); chat.setMode('open', { focus: false }); } catch (e) { chat.setMode('open', { focus: false }); chat.showErr(e.message); }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-oc-book]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); makeBook();
  });
  if (new URLSearchParams(location.search).get('make') === '1') {
    const u = new URL(location.href); u.searchParams.delete('make'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    makeBook();
  }

  // ---------------------------------------------------------------- the dashboard: hidden while students can see it
  if (dash || views) {
    const sync = () => {
      const eyes = document.getElementById('dash-eyes-btn');
      const hide = !!document.fullscreenElement || (dash && (document.body.classList.contains('dash-projector') || (eyes && eyes.getAttribute('aria-pressed') === 'true')));
      document.body.classList.toggle('oc-hide', hide);
      if (hide && chat.state().mode === 'open') chat.setMode('closed', { focus: false });
    };
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let watched = null;
    const watchEyes = () => { const eyes = document.getElementById('dash-eyes-btn'); if (eyes && eyes !== watched) { watched = eyes; new MutationObserver(sync).observe(eyes, { attributes: true, attributeFilter: ['aria-pressed'] }); } };
    watchEyes();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('cv:view', e => {
      const v = e.detail && e.detail.view;
      dash = v === 'dashboard'; PAGE.type = dash ? 'dashboard' : v === 'homeroom' ? 'homeroom' : 'class';
      watchEyes(); sync();
      const b = document.getElementById('oc-sees'); if (b) b.textContent = label();
    });
    sync();
    const hl = dash && store.get('oc-hl');
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
