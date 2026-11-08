// Admin panel actions. Every button posts to /api/admin/... and reloads; risky ones ask first.
import { api, toast, sheet, esc, tappedJustNow, $ } from '/js/app.js';
import '/js/admin-ui.js';

const ROUTES = {
  approve: id => `/api/admin/games/${id}/approve`, reject: id => `/api/admin/games/${id}/reject`,
  restore: id => `/api/admin/games/${id}/restore`, suspend: id => `/api/admin/games/${id}/suspend`, unsuspend: id => `/api/admin/games/${id}/unsuspend`,
  hide: id => `/api/admin/chat-reports/${id}/hide`, dismiss: id => `/api/admin/chat-reports/${id}/dismiss`, bansender: id => `/api/admin/chat-reports/${id}/ban`,
  ban: id => `/api/admin/users/${id}/ban`, unban: id => `/api/admin/users/${id}/unban`, unphoto: id => `/api/admin/users/${id}/photo/remove`,
  resolvelink: id => `/api/admin/link-reports/${id}/resolve`, resolvelive: id => `/api/admin/live-reports/${id}/resolve`, banlink: id => `/api/admin/link-reports/${id}/ban`,
  unlinkfamily: (id, b) => `/api/admin/family/${id}/children/${encodeURIComponent(b.dataset.child)}/unlink`,
  tester: id => `/api/admin/users/${id}/billing-tester`,
  pausemade: id => `/api/admin/users/${id}/pause-made`,
};
const DONE = { approve: 'Approved. The builder has a message about it.', reject: 'Sent back. The builder has a message with your reason.', restore: 'Restored and reports dismissed.', suspend: 'Game suspended.', unsuspend: 'Game is back.', hide: 'Message hidden.', dismiss: 'Report dismissed.', bansender: 'Sender banned.', ban: 'User banned.', unban: 'User unbanned.', unphoto: 'Photo removed.', resolvelink: 'Report done.', banlink: 'Grown-up banned. Their links have ended.', unlinkfamily: 'Link broken.', tester: 'Billing tester changed.', pausemade: 'Accounts paused.' };
const CONFIRM = {
  suspend: () => ['Suspend this game?', 'Nobody but the builder and admins can open it until you unsuspend it.', '⛔ Suspend'],
  bansender: b => [`Ban @${b.dataset.name}?`, 'Their account is paused, they are signed out everywhere, and the message is hidden.', '⛔ Ban'],
  ban: b => [`Ban @${b.dataset.name}?`, 'Their account is paused and they are signed out everywhere.', '⛔ Ban'],
  banlink: b => [`Ban grown-up @${b.dataset.name}?`, 'Their account is paused, they are signed out everywhere, and every link to their family ends.', '⛔ Ban'],
  unlinkfamily: b => [`Break the family link of @${b.dataset.name}?`, 'The child and the grown-up are no longer linked. Either can start again with a new code.', 'Break link'],
  pausemade: b => [`Pause every account @${b.dataset.name} made?`, 'Each account they made is banned (reason: made-by-banned) and signed out everywhere, so you can review it. Unban one to give it back.', '⛔ Pause all'],
};

async function run(b) {
  const act = b.dataset.act, id = encodeURIComponent(b.dataset.id);
  const body = {};
  if (act === 'approve' || act === 'reject') {
    const f = b.closest('form'); body.note = f ? f.note.value.trim() : '';
    if (act === 'reject') body.reason = f && f.reason ? f.reason.value : '';
    if (act === 'reject' && !body.note && !body.reason) { toast('Pick a reason or write a short note so the builder knows what to change.', { bad: true }); f && f.reason.focus(); return; }
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


// A game preview's "Try again" (brb:retry): reload that preview from here (a reload the frame starts itself has no
// sign-in cookie, so the server refuses it).
addEventListener('message', e => {
  if (!e.data || e.data.brb !== 1 || e.data.type !== 'brb:retry') return;
  const f = [...document.querySelectorAll('.rc-preview iframe')].find(x => x.contentWindow === e.source);
  if (!f || !tappedJustNow()) return;
  const src = f.getAttribute('src'); f.src = 'about:blank'; setTimeout(() => { f.src = src; }, 30);
});

// ---- Team inbox: a direct message as the Oomba team (/admin/messages/<username>).
const dm = $('#dm');
if (dm) dm.addEventListener('submit', async e => {
  e.preventDefault();
  const text = dm.text.value.trim(); if (!text) { toast('Write a message first.', { bad: true }); dm.text.focus(); return; }
  const btn = dm.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const r = await api(`/api/admin/users/${encodeURIComponent(dm.dataset.id)}/message`, { method: 'POST', body: { text } });
    toast(r.copiedTo && r.copiedTo.length ? `Sent. Copied to @${r.copiedTo.join(', @')}.` : 'Sent.'); setTimeout(() => location.reload(), 600);
  } catch (ex) { toast(ex.message, { bad: true }); btn.disabled = false; }
});

// ---- Announcements: step 1 shows how many people it reaches; step 2 (the sheet's button) sends it.
const ann = $('#announce');
if (ann) {
  const schoolField = $('#ann-school-f');
  const sync = () => { schoolField.hidden = ann.audience.value !== 'school'; };
  ann.audience.addEventListener('change', sync); sync();
  ann.addEventListener('submit', async e => {
    e.preventDefault();
    const body = { audience: ann.audience.value, schoolId: ann.schoolId ? ann.schoolId.value : '', text: ann.text.value.trim() };
    if (!body.text) { toast('Write the announcement first.', { bad: true }); ann.text.focus(); return; }
    let p;
    try { p = await api('/api/admin/announcements/preview', { method: 'POST', body }); } catch (ex) { toast(ex.message, { bad: true }); return; }
    const label = ann.audience.selectedOptions[0].textContent + (body.audience === 'school' && ann.schoolId ? ` (${ann.schoolId.selectedOptions[0].textContent})` : '');
    const wait = p.limits && p.limits.nextAt ? `<p class="notice warn small">The last announcement was under 10 minutes ago, so this one can't go yet.</p>` : '';
    const s = sheet({ title: `Send to ${p.count} ${p.count === 1 ? 'person' : 'people'}?`, content: `<p><b>${esc(label)}</b> will see this from “Oomba team ✓”:</p><blockquote class="panel" dir="auto">${esc(body.text)}</blockquote>${wait}<div class="row"><button class="btn btn-primary" type="button" id="yes" ${p.count ? '' : 'disabled'}>📣 Send to ${p.count}</button><button class="btn" type="button" id="no">Cancel</button></div>` });
    $('#no', s.el).addEventListener('click', () => s.close());
    $('#yes', s.el).addEventListener('click', async ev => {
      ev.target.disabled = true;
      try { const r = await api('/api/admin/announcements', { method: 'POST', body: { ...body, confirm: p.confirm } }); s.close(); toast(`Sent to ${r.count}.`); setTimeout(() => location.reload(), 700); }
      catch (ex) { toast(ex.message, { bad: true }); ev.target.disabled = false; }
    });
  });
}
