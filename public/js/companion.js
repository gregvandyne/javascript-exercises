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

const raw = document.body.dataset.oc;
const PAGE = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
const store = { get: (k, s = sessionStorage) => { try { return s.getItem(k); } catch { return null; } }, set: (k, v, s = sessionStorage) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* no storage */ } } };
const L = k => t(`js.companion.${k}`);
const ic = (e, size = 18) => iconHtml(e, { size });
const DOC_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
const IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';
const MAX_CLIP_MS = 60e3;

if (PAGE) start();

function start() {
  const dash = PAGE.type === 'dashboard';
  const S = { file: null, sent: false, web: true, webAllowed: true, mic: null };
  const label = () => {
    const h = document.querySelector(dash ? '.dash-class' : 'main h1');
    const txt = (h ? h.textContent : document.title.split('·')[0]).replace(/\s+/g, ' ').trim().slice(0, 60);
    return dash ? t('js.companion.dashOf', { name: txt }) : txt;
  };
  /** The page as it is now: on the dashboard, the layout on screen (by its chip's name). */
  function pageNow() {
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

  const chat = mountChat({
    id: 'companion', url: () => '/api/companion/chat', start: 'closed', alwaysBubble: true,
    bubbleHost: dash ? document.getElementById('dash-foot') : null,
    subHtml: `<span class="oc-ctx"><i aria-hidden="true"></i>${esc(L('sees'))} <b>${esc(label())}</b></span>`,
    headExtra: `<button type="button" class="oc-hbtn" id="oc-new" aria-label="${esc(L('newChat'))}" title="${esc(L('newChat'))}">${ic('✏️', 20)}</button>`,
    aboveRow: '<div class="oc-attach" id="oc-attach" hidden></div><div class="oc-listen" id="oc-listen" role="status" hidden></div>',
    toolsStart: `<button type="button" class="oc-ibtn" id="oc-attach-btn" aria-label="${esc(L('attach'))}" title="${esc(L('attach'))}">${ic('📎', 22)}</button><input type="file" id="oc-file" accept="${DOC_ACCEPT},${IMG_ACCEPT}" hidden>`,
    toolsEnd: `<button type="button" class="oc-ibtn" id="oc-mic" aria-label="${esc(L('mic.start'))}" title="${esc(L('mic.start'))}" hidden>${ic('🎤', 22)}</button>`,
    foot: `<div class="oc-foot"><button type="button" class="oc-pill on" id="oc-web" role="switch" aria-checked="true">${ic('🌐', 16)} <span>${esc(L('web.on'))}</span></button><span class="oc-attachnote" id="oc-note">${esc(L('attachNote'))}</span></div>`,
    hello: () => L('hello'),
    ideas: () => (dash ? ['dashTimer', 'dashJobs', 'game', 'plan'] : ['game', 'book', 'dash', 'plan']).map(k => ({ label: L(`idea.${k}.label`), text: L(`idea.${k}.text`) })),
    placeholder: () => L('placeholder'),
    leave: L('leave'),
    stepText: (k, state) => t(`js.companion.prog.${k}.${state === 'done' ? 'done' : 'now'}`),
    body: () => { S.sent = true; return { page: pageNow(), ...(S.file ? { file: S.file.id } : {}) }; },
    errText: code => (['slow', 'fileGone'].includes(code) ? L(`err.${code}`) : null),
    meExtra: x => (x.meta && x.meta.file ? `<span class="oc-file">${ic(x.meta.file.kind === 'image' ? '🖼️' : '📄', 18)} ${esc(x.meta.file.name)}${x.meta.file.pages ? ` <small>${esc(t('js.companion.pages', { n: x.meta.file.pages }))}</small>` : ''}</span>` : ''),
    format: (text, x) => `${x.note && x.note.steps ? stepsHtml(x.note) : ''}${formatText(text)}`,
    note: x => noteHtml(x),
    change: x => changeHtml(x),
    onAct: (act, turn, btn) => onAct(act, turn, btn),
    onAnswer: x => { if (x.change && x.change.kind === 'dash') afterDash(x.change); },
    onUndo: () => { if (dash) { store.set('oc-hl', '[]'); location.reload(); } },
    onSync: () => { if (S.sent) { S.sent = false; setFile(null); } },
  });
  const root = chat.root;
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- the flags: web search, the microphone
  api('/api/companion/chat', { background: true }).then(r => {
    S.web = !!r.web; S.webAllowed = !!r.webAllowed; drawWeb();
    $('oc-mic').hidden = !(r.mic && window.MediaRecorder && navigator.mediaDevices);
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

  // ---------------------------------------------------------------- the microphone (tap to start, tap to stop)
  const micBtn = $('oc-mic'), bar = $('oc-listen');
  micBtn.addEventListener('click', () => (S.mic ? stopMic() : startMic()));
  async function startMic() {
    chat.showErr('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { chat.showErr(L('mic.denied')); return; }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(x => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
    const parts = [], t0 = Date.now();
    rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(x => x.stop());
      const ms = Date.now() - t0, blob = new Blob(parts, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] });
      parts.length = 0;
      drawMic(null);
      try {
        const res = await fetch('/api/companion/transcribe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type, 'X-Clip-Ms': String(ms) }, body: blob });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || L('mic.failed'));
        if (data.text) { const box = $('oc-in'); box.value = `${box.value ? `${box.value.replace(/\s+$/, '')} ` : ''}${data.text}`; box.dispatchEvent(new Event('input')); box.focus(); }
      } catch (e) { chat.showErr(e.message || L('mic.failed')); }
    };
    S.mic = { rec, t0, timer: setInterval(() => { drawMic(S.mic); if (Date.now() - t0 > MAX_CLIP_MS) stopMic(); }, 500) };
    rec.start(500);
    drawMic(S.mic);
  }
  function stopMic() { const m = S.mic; if (!m) return; S.mic = null; clearInterval(m.timer); try { m.rec.stop(); } catch { /* stopped */ } }
  function drawMic(m) {
    micBtn.classList.toggle('oc-mic-on', !!m);
    micBtn.innerHTML = m ? ic('⏹️', 22) : ic('🎤', 22);
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
