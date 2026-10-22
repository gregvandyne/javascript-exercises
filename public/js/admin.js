// Admin panel actions. Every button posts to /api/admin/... and reloads; risky ones ask first.
import { api, toast, sheet, esc, $ } from '/js/app.js';

const ROUTES = {
  approve: id => `/api/admin/games/${id}/approve`, reject: id => `/api/admin/games/${id}/reject`,
  restore: id => `/api/admin/games/${id}/restore`, suspend: id => `/api/admin/games/${id}/suspend`, unsuspend: id => `/api/admin/games/${id}/unsuspend`,
  hide: id => `/api/admin/chat-reports/${id}/hide`, dismiss: id => `/api/admin/chat-reports/${id}/dismiss`, bansender: id => `/api/admin/chat-reports/${id}/ban`,
  ban: id => `/api/admin/users/${id}/ban`, unban: id => `/api/admin/users/${id}/unban`,
};
const DONE = { approve: 'Approved. It is public now.', reject: 'Sent back with your note.', restore: 'Restored and reports dismissed.', suspend: 'Game suspended.', unsuspend: 'Game is back.', hide: 'Message hidden.', dismiss: 'Report dismissed.', bansender: 'Sender banned.', ban: 'User banned.', unban: 'User unbanned.' };
const CONFIRM = {
  suspend: () => ['Suspend this game?', 'Nobody but the builder and admins can open it until you unsuspend it.', '⛔ Suspend'],
  bansender: b => [`Ban @${b.dataset.name}?`, 'Their account is paused, they are signed out everywhere, and the message is hidden.', '⛔ Ban'],
  ban: b => [`Ban @${b.dataset.name}?`, 'Their account is paused and they are signed out everywhere.', '⛔ Ban'],
};

async function run(b) {
  const act = b.dataset.act, id = encodeURIComponent(b.dataset.id);
  const body = {};
  if (act === 'approve' || act === 'reject') {
    const f = b.closest('form'); body.note = f ? f.note.value.trim() : '';
    if (act === 'reject' && !body.note) { toast('Write a short note so the builder knows what to change.', { bad: true }); f && f.note.focus(); return; }
  }
  b.disabled = true;
  try { await api(ROUTES[act](id), { method: 'POST', body }); toast(DONE[act] || 'Done.'); setTimeout(() => location.reload(), 600); }
  catch (ex) { toast(ex.message, { bad: true }); b.disabled = false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !ROUTES[b.dataset.act]) return;
  const c = CONFIRM[b.dataset.act];
  if (!c) return run(b);
  const [title, text, yes] = c(b);
  const s = sheet({ title, content: `<p>${esc(text)}</p><div class="row"><button class="btn btn-danger" type="button" id="yes">${esc(yes)}</button><button class="btn" type="button" id="no">Cancel</button></div>` });
  $('#no', s.el).addEventListener('click', () => s.close());
  $('#yes', s.el).addEventListener('click', () => { s.close(); run(b); });
});

// On phones the tab row scrolls: keep the current tab in view.
const cur = document.querySelector('.tabs [aria-current]');
if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
