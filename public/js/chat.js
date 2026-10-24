// Friends-only chat. Inbox: refreshes every 4 s. Thread: polls for new messages every 3.5 s while open,
// sends text / quick messages / game invites, report and block. All user text is set with textContent or esc().
import { api, toast, sheet, pageData, esc, $, t } from '/js/app.js';
import { timeAgo as ago, INTL } from '/js/i18n.js';
const d = pageData();

const clock = at => new Date(at).toLocaleTimeString(INTL, { hour: 'numeric', minute: '2-digit' });
const avatarHtml = (a, c, s) => `<span class="avatar" style="--s:${s}px;--c:${esc(c)}" aria-hidden="true">${esc(a)}</span>`;

// ---------------- Inbox ----------------
if (d.mode === 'inbox') {
  const box = $('#inbox');
  const row = th => `<li><a class="inboxrow ${th.unread ? 'unread' : ''}" href="/chat/${encodeURIComponent(th.username)}" data-thread="${esc(th.username)}">${avatarHtml(th.avatar, th.color, 48)}<span class="who"><span class="nm">${esc(th.displayName)}</span><span class="sub">${esc(th.preview || (th.chatOn ? t('js.chat.sayHi') : t('js.chat.chatOff')))}</span></span><span class="meta">${th.last ? `<span class="time">${esc(ago(th.last))}</span>` : ''}${th.unread ? `<span class="badge" aria-label="${esc(t('js.chat.newCount', { count: th.unread }))}">${th.unread > 9 ? '9+' : th.unread}</span>` : ''}</span></a></li>`;
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
        ? `<div class="gameinvite"><span class="gi-art cover-${esc(g.cover)}" aria-hidden="true">${esc(g.icon)}</span><span class="gi-t">${esc(g.title)}</span><a class="btn btn-primary btn-sm" href="/play/${encodeURIComponent(g.slug)}">▶ ${esc(t('js.chat.play'))}</a></div>`
        : `<div class="gameinvite gone">🎮 ${esc(t('js.chat.gameGone'))}</div>`;
    } else {
      const b = document.createElement('div'); b.className = 'bubble'; b.dir = 'auto'; b.textContent = m.body;
      if (EMOJI_ONLY.test(m.body)) el.classList.add('emoji');
      el.appendChild(b);
    }
    const w = document.createElement('span'); w.className = 'when'; w.textContent = clock(m.at); w.title = new Date(m.at).toLocaleString(INTL);
    el.appendChild(w);
    if (!m.mine) {
      const r = document.createElement('button'); r.type = 'button'; r.className = 'rep'; r.textContent = t('js.chat.report');
      r.setAttribute('aria-label', t('js.chat.reportLabel')); r.dataset.report = m.id;
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
      pausedNote.textContent = `⏸️ ${t('js.chat.paused', { minutes: Math.max(1, Math.ceil((paused - Date.now()) / 60000)) })}`;
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
    const text = input.value.trim(); if (!text) { err.textContent = t('js.chat.typeFirst'); input.focus(); return; }
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
    if (!d.games.length) return toast(t('js.chat.noGames'));
    const s = sheet({ title: t('js.chat.shareTitle', { name: other.displayName }), content: `<p class="muted">${esc(t('js.chat.shareText', { name: other.displayName }))}</p><div class="gamepick">${d.games.map(g => `<button type="button" data-game="${esc(g.id)}"><span class="gi-art cover-${esc(g.cover)}" aria-hidden="true">${esc(g.icon)}</span><span class="t">${esc(g.title)}</span>${g.mine ? `<span class="small muted">${esc(t('js.chat.yourGame'))}</span>` : ''}</button>`).join('')}</div>` });
    s.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-game]'); if (!b) return;
      s.close(); if (await send('game', b.dataset.game)) toast(t('js.chat.gameShared'));
    });
  });

  list.addEventListener('click', e => {
    const b = e.target.closest('[data-report]'); if (!b) return;
    const id = b.dataset.report;
    const s = sheet({ title: t('js.chat.reportTitle'), content: `<p>${esc(t('js.chat.reportText'))}</p><div class="stack">${d.reasons.map(([k, l]) => `<button class="btn btn-block" type="button" data-reason="${esc(k)}">${esc(l)}</button>`).join('')}</div><p class="small muted" style="margin-top:12px">${esc(t('js.chat.reportBlockHint', { name: other.displayName }))}</p>` });
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
    const s = sheet({ title: t('js.chat.blockTitle', { name: other.displayName }), content: `<p>${esc(t('js.chat.blockText', { name: other.displayName }))}</p><div class="row"><button class="btn btn-danger" type="button" id="yes">🚫 ${esc(t('js.chat.block'))}</button><button class="btn" type="button" id="no">${esc(t('js.chat.cancel'))}</button></div>` });
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
