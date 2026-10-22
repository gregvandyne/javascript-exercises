// Friends-only chat. Inbox: refreshes every 4 s. Thread: polls for new messages every 3.5 s while open,
// sends text / quick messages / game invites, report and block. All user text is set with textContent or esc().
import { api, toast, sheet, pageData, esc, $ } from '/js/app.js';
const d = pageData();

const ago = t => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now'; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`; const dd = Math.round(h / 24); return `${dd} day${dd > 1 ? 's' : ''} ago`;
};
const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const avatarHtml = (a, c, s) => `<span class="avatar" style="--s:${s}px;--c:${esc(c)}" aria-hidden="true">${esc(a)}</span>`;

// ---------------- Inbox ----------------
if (d.mode === 'inbox') {
  const box = $('#inbox');
  const row = t => `<li><a class="inboxrow ${t.unread ? 'unread' : ''}" href="/chat/${encodeURIComponent(t.username)}" data-thread="${esc(t.username)}">${avatarHtml(t.avatar, t.color, 48)}<span class="who"><span class="nm">${esc(t.displayName)}</span><span class="sub">${esc(t.preview || (t.chatOn ? 'Say hi! 👋' : 'Chat is switched off'))}</span></span><span class="meta">${t.last ? `<span class="time">${esc(ago(t.last))}</span>` : ''}${t.unread ? `<span class="badge" aria-label="${t.unread} new">${t.unread > 9 ? '9+' : t.unread}</span>` : ''}</span></a></li>`;
  let last = box ? box.innerHTML : '';
  const refresh = async () => {
    if (!box || document.hidden) return;
    try { const r = await api('/api/chat'); const h = r.threads.map(row).join(''); if (h !== last) { box.innerHTML = h; last = h; } } catch { /* offline */ }
  };
  setInterval(refresh, 4000);
  refresh();
}

// ---------------- Thread ----------------
if (d.mode === 'thread') {
  const other = d.other;
  const list = $('#msgs'), empty = $('#msgs-empty'), form = $('#sendform'), input = $('#msg'), err = $('#sendmsg'), count = $('#msgcount');
  const composer = $('#composer'), cant = $('#cantchat'), pausedNote = $('#pausednote');
  const seen = new Set(); let lastAt = 0; let can = d.can; let paused = d.paused || 0;
  const EMOJI_ONLY = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u;
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  function render(m) {
    const el = document.createElement('div');
    el.className = `msg ${m.mine ? 'mine' : 'theirs'} ${m.kind}`;
    el.dataset.id = m.id;
    if (m.kind === 'game') {
      const g = m.game;
      el.innerHTML = g
        ? `<div class="gameinvite"><span class="gi-art cover-${esc(g.cover)}" aria-hidden="true">${esc(g.icon)}</span><span class="gi-t">${esc(g.title)}</span><a class="btn btn-primary btn-sm" href="/play/${encodeURIComponent(g.slug)}">▶ Play</a></div>`
        : '<div class="gameinvite gone">🎮 This game isn\'t available.</div>';
    } else {
      const b = document.createElement('div'); b.className = 'bubble'; b.textContent = m.body;
      if (EMOJI_ONLY.test(m.body)) el.classList.add('emoji');
      el.appendChild(b);
    }
    const w = document.createElement('span'); w.className = 'when'; w.textContent = clock(m.at); w.title = new Date(m.at).toLocaleString();
    el.appendChild(w);
    if (!m.mine) {
      const r = document.createElement('button'); r.type = 'button'; r.className = 'rep'; r.textContent = 'Report';
      r.setAttribute('aria-label', 'Report this message'); r.dataset.report = m.id;
      el.appendChild(r);
    }
    return el;
  }
  function add(msgs, { scroll = false } = {}) {
    const stick = scroll || nearBottom(); let added = 0;
    for (const m of msgs) {
      lastAt = Math.max(lastAt, m.at);
      if (seen.has(m.id)) continue;
      seen.add(m.id); list.appendChild(render(m)); added++;
    }
    if (empty) empty.hidden = seen.size > 0;
    if (added && stick) toBottom();
    return added;
  }
  function setCan(c) {
    can = c;
    composer.hidden = !c.ok; cant.hidden = c.ok;
    if (!c.ok) cant.textContent = c.reason;
  }
  function showPaused() {
    if (paused && paused > Date.now()) {
      pausedNote.hidden = false;
      pausedNote.textContent = `⏸️ Chat is taking a little break. You can type again in ${Math.max(1, Math.ceil((paused - Date.now()) / 60000))} min. Quick messages still work.`;
      input.disabled = true; form.querySelector('[type=submit]').disabled = true;
    } else { pausedNote.hidden = true; input.disabled = false; form.querySelector('[type=submit]').disabled = false; }
  }
  add(d.messages || [], { scroll: true });
  showPaused();
  setInterval(showPaused, 15000);

  let polling = false;
  async function poll() {
    if (polling || document.hidden) return; polling = true;
    try {
      const r = await api(`/api/chat/${encodeURIComponent(other.username)}?after=${lastAt}`);
      add(r.messages);
      if (r.can.ok !== can.ok || r.can.reason !== can.reason) setCan(r.can);
      if ((r.paused || 0) !== paused) { paused = r.paused || 0; showPaused(); }
    } catch { /* offline: try again */ }
    finally { polling = false; }
  }
  setInterval(poll, 3500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  async function send(kind, body) {
    err.textContent = '';
    try {
      const r = await api(`/api/chat/${encodeURIComponent(other.username)}`, { method: 'POST', body: { kind, body } });
      add([r.message], { scroll: true });
      return true;
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.data && ex.data.paused) { paused = ex.data.paused; showPaused(); }
      if (ex.data && ['not_friends', 'blocked_by_me', 'blocked_by_other', 'chat_off_me', 'chat_off_other', 'guest', 'missing'].includes(ex.data.code)) poll();
      return false;
    }
  }
  const updateCount = () => { count.textContent = `${input.value.length}/${d.max}`; };
  input.addEventListener('input', () => { updateCount(); if (err.textContent) err.textContent = ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) { err.textContent = 'Type a message first.'; input.focus(); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    if (await send('text', text)) { input.value = ''; updateCount(); }
    btn.disabled = false; showPaused(); input.focus();
  });
  composer.addEventListener('click', e => {
    const q = e.target.closest('[data-quick]'); if (!q) return;
    send('quick', q.dataset.quick);
  });

  const share = $('#sharegame');
  if (share) share.addEventListener('click', () => {
    if (!d.games.length) return toast('No games to share yet.');
    const s = sheet({ title: `Share a game with ${other.displayName}`, content: `<p class="muted">Only games ${esc(other.displayName)} can open are shown.</p><div class="gamepick">${d.games.map(g => `<button type="button" data-game="${esc(g.id)}"><span class="gi-art cover-${esc(g.cover)}" aria-hidden="true">${esc(g.icon)}</span><span class="t">${esc(g.title)}</span>${g.mine ? '<span class="small muted">Your game</span>' : ''}</button>`).join('')}</div>` });
    s.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-game]'); if (!b) return;
      s.close(); if (await send('game', b.dataset.game)) toast('Game shared!');
    });
  });

  list.addEventListener('click', e => {
    const b = e.target.closest('[data-report]'); if (!b) return;
    const id = b.dataset.report;
    const s = sheet({ title: 'Report this message', content: `<p>What is wrong? We will hide it for you, and a grown-up on our team will look.</p><div class="stack">${d.reasons.map(([k, l]) => `<button class="btn btn-block" type="button" data-reason="${esc(k)}">${esc(l)}</button>`).join('')}</div><p class="small muted" style="margin-top:12px">You can also block ${esc(other.displayName)} with the Block button at the top.</p>` });
    s.el.addEventListener('click', async ev => {
      const r = ev.target.closest('[data-reason]'); if (!r) return;
      try {
        const res = await api(`/api/chat/messages/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason: r.dataset.reason } });
        s.close(); toast(res.message, { ms: 4500 });
        const el = list.querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) el.remove();
      } catch (ex) { toast(ex.message, { bad: true }); }
    });
  });

  const blockBtn = $('#blockbtn');
  if (blockBtn) blockBtn.addEventListener('click', () => {
    const s = sheet({ title: `Block ${other.displayName}?`, content: `<p>You won't see messages from ${esc(other.displayName)}, and they can't send you any. You stay friends, and you can unblock them on the Friends page.</p><div class="row"><button class="btn btn-danger" type="button" id="yes">🚫 Block</button><button class="btn" type="button" id="no">Cancel</button></div>` });
    s.el.querySelector('#no').addEventListener('click', () => s.close());
    s.el.querySelector('#yes').addEventListener('click', async () => {
      try { const r = await api(`/api/chat/${encodeURIComponent(other.username)}/block`, { method: 'POST', body: {} }); s.close(); toast(r.message); setTimeout(() => location.reload(), 700); }
      catch (ex) { toast(ex.message, { bad: true }); }
    });
  });
  const unblockBtn = $('#unblockbtn');
  if (unblockBtn) unblockBtn.addEventListener('click', async () => {
    try { const r = await api(`/api/chat/${encodeURIComponent(other.username)}/unblock`, { method: 'POST', body: {} }); toast(r.message); setTimeout(() => location.reload(), 600); }
    catch (ex) { toast(ex.message, { bad: true }); }
  });
}
