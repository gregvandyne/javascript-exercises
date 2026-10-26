// Admin panel actions. Every button posts to /api/admin/... and reloads; risky ones ask first.
import { api, toast, sheet, esc, tappedJustNow, $ } from '/js/app.js';

const ROUTES = {
  approve: id => `/api/admin/games/${id}/approve`, reject: id => `/api/admin/games/${id}/reject`,
  restore: id => `/api/admin/games/${id}/restore`, suspend: id => `/api/admin/games/${id}/suspend`, unsuspend: id => `/api/admin/games/${id}/unsuspend`,
  hide: id => `/api/admin/chat-reports/${id}/hide`, dismiss: id => `/api/admin/chat-reports/${id}/dismiss`, bansender: id => `/api/admin/chat-reports/${id}/ban`,
  ban: id => `/api/admin/users/${id}/ban`, unban: id => `/api/admin/users/${id}/unban`, unphoto: id => `/api/admin/users/${id}/photo/remove`,
  resolvelink: id => `/api/admin/link-reports/${id}/resolve`, banlink: id => `/api/admin/link-reports/${id}/ban`,
  unlinkfamily: (id, b) => `/api/admin/family/${id}/children/${encodeURIComponent(b.dataset.child)}/unlink`,
  tester: id => `/api/admin/users/${id}/billing-tester`,
};
const DONE = { approve: 'Approved. It is public now.', reject: 'Sent back with your note.', restore: 'Restored and reports dismissed.', suspend: 'Game suspended.', unsuspend: 'Game is back.', hide: 'Message hidden.', dismiss: 'Report dismissed.', bansender: 'Sender banned.', ban: 'User banned.', unban: 'User unbanned.', unphoto: 'Photo removed.', resolvelink: 'Report done.', banlink: 'Grown-up banned. Their links have ended.', unlinkfamily: 'Link broken.', tester: 'Billing tester changed.' };
const CONFIRM = {
  suspend: () => ['Suspend this game?', 'Nobody but the builder and admins can open it until you unsuspend it.', '⛔ Suspend'],
  bansender: b => [`Ban @${b.dataset.name}?`, 'Their account is paused, they are signed out everywhere, and the message is hidden.', '⛔ Ban'],
  ban: b => [`Ban @${b.dataset.name}?`, 'Their account is paused and they are signed out everywhere.', '⛔ Ban'],
  banlink: b => [`Ban grown-up @${b.dataset.name}?`, 'Their account is paused, they are signed out everywhere, and every link to their family ends.', '⛔ Ban'],
  unlinkfamily: b => [`Break the family link of @${b.dataset.name}?`, 'The child and the grown-up are no longer linked. Either can start again with a new code.', 'Break link'],
};

async function run(b) {
  const act = b.dataset.act, id = encodeURIComponent(b.dataset.id);
  const body = {};
  if (act === 'approve' || act === 'reject') {
    const f = b.closest('form'); body.note = f ? f.note.value.trim() : '';
    if (act === 'reject' && !body.note) { toast('Write a short note so the builder knows what to change.', { bad: true }); f && f.note.focus(); return; }
  }
  if (act === 'tester') body.on = b.dataset.on === '1';
  b.disabled = true;
  try { await api(ROUTES[act](id, b), { method: 'POST', body }); toast(DONE[act] || 'Done.'); setTimeout(() => location.reload(), 600); }
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

// A game preview's "Try again" (brb:retry): reload that preview from here (a reload the frame starts itself has no
// sign-in cookie, so the server refuses it).
addEventListener('message', e => {
  if (!e.data || e.data.brb !== 1 || e.data.type !== 'brb:retry') return;
  const f = [...document.querySelectorAll('.rc-preview iframe')].find(x => x.contentWindow === e.source);
  if (!f || !tappedJustNow()) return;
  const src = f.getAttribute('src'); f.src = 'about:blank'; setTimeout(() => { f.src = src; }, 30);
});
