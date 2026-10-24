// Admin panel (role admin only). Internal tool: its text stays English (the page frame follows the admin's language). Non-admins get 404 for every page and API under /admin and /api/admin.
// Tabs: Review queue, Reports, Chat reports, Users, Audit log. Every action is audited (services/moderation.js, services/publish.js).
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, timeAgo } from '../views/html.js';
import { page } from '../views/layout.js';
import { avatar, emptyState, statusLabel, coverArt } from '../views/components.js';
import { requireAdmin, signToken } from '../auth.js';
import { SANDBOX } from '../services/frame.js';
import { REPORT_REASONS as GAME_REASONS } from './games.js';
import * as mod from '../services/moderation.js';
import * as chat from '../services/chat.js';
import { COMMUNITY_CSS } from './social.js';
import { tEn } from '../i18n/index.js';

export const router = Router();
router.use('/admin', requireAdmin);
router.use('/api/admin', requireAdmin);

const TABS = [['queue', '⏳', 'Review queue'], ['reports', '🚩', 'Reports'], ['chat', '💬', 'Chat reports'], ['users', '👤', 'Users'], ['audit', '📜', 'Audit log']];
const gameReason = k => (GAME_REASONS.find(r => r[0] === k) || [k, k])[1];
const chatReason = k => (chat.REPORT_REASONS.find(r => r[0] === k) || [k, k])[1];
const when = t => html`<time datetime="${new Date(t).toISOString()}" title="${new Date(t).toISOString().replace('T', ' ').slice(0, 16)} UTC">${timeAgo(t)}</time>`;

function queueTab(req) {
  const items = mod.reviewQueue();
  if (!items.length) return emptyState({ emoji: '✅', title: 'Nothing to review', text: 'Games waiting for a human check show up here.' });
  return html`<div class="stack">${items.map(({ game: g, version: v, isUpdate, liveNumber, safety, review }) => {
    const token = signToken({ v: v.id, g: g.id, u: req.user.id, p: 1 }, 3600);
    const issues = safety.issues || [];
    return html`<article class="panel reviewcard" aria-label="Review ${g.title}">
      <div class="rc-head">
        <div class="rc-cover">${coverArt(g)}</div>
        <div class="rc-info">
          <h2>${g.title}</h2>
          <p class="muted small">by <a href="/u/${g.owner_name}">${g.owner_display}</a> (@${g.owner_name}) · version ${v.number} · ${fmtNum(Math.round((v.size || 0) / 1024))} KB · sent ${when(g.updated_at)}</p>
          <p>${isUpdate ? html`<span class="chip-s warn">🔁 Update to a live game</span> Players keep version ${liveNumber} until you approve.` : html`<span class="chip-s">🆕 New public game</span>`}</p>
          ${g.description ? html`<p class="small">${g.description}</p>` : ''}
          ${v.notes ? html`<p class="small muted">Builder notes: ${v.notes}</p>` : ''}
        </div>
      </div>
      <div class="rc-body">
        <div class="rc-preview"><iframe title="Preview of ${g.title}" src="/frame/${token}" sandbox="${SANDBOX}" referrerpolicy="no-referrer" loading="lazy"></iframe></div>
        <div class="rc-checks">
          <h3>Safety scan: <span class="scan-${safety.status || v.safety_status}">${safety.status || v.safety_status || 'unchecked'}</span></h3>
          ${issues.length ? html`<ul class="issues">${issues.map(i => html`<li class="lvl-${i.level}"><b>${i.level}</b> ${i.message}</li>`)}</ul>` : html`<p class="small muted">No issues found.</p>`}
          <h3>Model review: ${review.verdict || 'none'}${review.by ? html` <span class="small muted">(${review.by})</span>` : ''}</h3>
          ${(review.reasons || []).length ? html`<ul class="issues">${review.reasons.map(r => html`<li>${r}</li>`)}</ul>` : ''}
          <form class="decide" data-game="${g.id}" novalidate>
            <div class="field"><label for="note-${g.id}">Note for the builder</label>
              <textarea class="input" id="note-${g.id}" name="note" maxlength="500" placeholder="Say what is great, or what to change"></textarea></div>
            <div class="row"><button class="btn btn-primary" type="button" data-act="approve" data-id="${g.id}">✅ Approve</button><button class="btn btn-danger" type="button" data-act="reject" data-id="${g.id}">✏️ Reject</button></div>
          </form>
        </div>
      </div>
    </article>`;
  })}</div>`;
}

function reportsTab() {
  const list = mod.reportedGames();
  if (!list.length) return emptyState({ emoji: '🌈', title: 'No reported games', text: 'Games with open reports, hidden games and suspended games show up here.' });
  return html`<div class="stack">${list.map(g => html`<article class="panel reportcard">
    <div class="row" style="align-items:flex-start">
      <div class="rc-cover small">${coverArt(g)}</div>
      <div style="flex:1;min-width:200px">
        <h2 style="margin:0"><a href="/g/${g.slug}">${g.title}</a></h2>
        <p class="small muted" style="margin:0">by @${g.owner_name} · ${statusLabel(g, tEn)}${g.hidden_reason ? ` (hidden by ${g.hidden_reason})` : ''}</p>
        <p style="margin:6px 0"><b>${g.open_reports}</b> open report${g.open_reports === 1 ? '' : 's'}${g.last_report ? html` · last ${when(g.last_report)}` : ''}</p>
        ${g.reasons.length ? html`<div class="chips">${g.reasons.map(r => html`<span class="chip-s">${gameReason(r.reason)} × ${r.n}</span>`)}</div>` : ''}
        ${g.details.length ? html`<ul class="small">${g.details.map(d => html`<li>“${d}”</li>`)}</ul>` : ''}
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      ${g.open_reports || g.hidden_reason ? html`<button class="btn" type="button" data-act="restore" data-id="${g.id}">↩️ Restore &amp; dismiss reports</button>` : ''}
      ${g.status === 'suspended' ? html`<button class="btn" type="button" data-act="unsuspend" data-id="${g.id}">▶️ Unsuspend</button>` : html`<button class="btn btn-danger" type="button" data-act="suspend" data-id="${g.id}">⛔ Suspend game</button>`}
    </div>
  </article>`)}</div>`;
}

function chatTab() {
  const list = mod.chatReports();
  if (!list.length) return emptyState({ emoji: '💬', title: 'No chat reports', text: 'Messages that kids report show up here with the messages around them.' });
  const who = u => (u ? html`${avatar(u, 26)} <b>${u.display_name}</b> <span class="muted">@${u.username}${u.banned ? ' · banned' : ''}</span>` : '?');
  return html`<div class="stack">${list.map(({ report: r, message: m, context, sender, reporter }) => html`<article class="panel chatreport">
    <p class="row small" style="gap:6px"><span class="chip-s bad">${chatReason(r.reason)}</span> reported ${when(r.created_at)}</p>
    <p class="small" style="margin:0">Sender: ${who(sender)}</p>
    <p class="small">Reporter: ${who(reporter)}</p>
    <ol class="ctx" aria-label="Conversation around the message">${context.map(c => html`<li class="${c.id === m.id ? 'hit' : ''} ${c.from_id === m.from_id ? 'from-sender' : 'from-other'}">
      <span class="ctx-who">${c.from_id === m.from_id ? (sender && sender.username) : (reporter && c.from_id === reporter.id ? reporter.username : 'other')}</span>
      <span class="ctx-body">${c.kind === 'game' ? '🎮 shared a game' : c.kind === 'quick' ? chat.quickText(c.body) : c.body}${c.status === 'hidden' ? html` <i class="muted">(hidden)</i>` : ''}</span>
      <span class="ctx-time muted">${when(c.created_at)}</span></li>`)}</ol>
    <div class="row">
      <button class="btn" type="button" data-act="hide" data-id="${r.id}">🙈 Hide message</button>
      <button class="btn" type="button" data-act="dismiss" data-id="${r.id}">👍 Dismiss</button>
      ${sender && !sender.banned && sender.role !== 'admin' ? html`<button class="btn btn-danger" type="button" data-act="bansender" data-id="${r.id}" data-name="${sender.username}">⛔ Ban sender</button>` : ''}
    </div>
  </article>`)}</div>`;
}

function usersTab(req) {
  const name = String(req.query.username || '').trim().slice(0, 40);
  const u = name ? mod.findUser(name) : null;
  return html`<section class="panel">
    <form method="get" action="/admin" class="row nowrap" role="search">
      <input type="hidden" name="tab" value="users">
      <label class="sr-only" for="uname">Exact username</label>
      <input class="input" id="uname" name="username" value="${name}" placeholder="Exact username" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn btn-primary" type="submit">Look up</button>
    </form>
    <p class="small muted" style="margin:8px 0 0">Exact usernames only. There is no browsing of players.</p>
  </section>
  ${name && !u ? html`<p class="notice warn" style="margin-top:16px">No user called “${name}”.</p>` : ''}
  ${u ? html`<section class="panel" style="margin-top:16px">
    <div class="row">${avatar(u, 56)}<div style="flex:1;min-width:180px"><h2 style="margin:0">${u.display_name}</h2><div class="muted">@${u.username}${u.is_guest ? ' · guest' : ''}</div></div>
      ${u.banned ? html`<span class="chip-s bad">⛔ Banned</span>` : html`<span class="chip-s">✅ Active</span>`}</div>
    <div class="tblwrap"><table class="tbl" style="margin-top:12px"><tbody>
      <tr><th scope="row">Role</th><td>${u.role}</td></tr>
      <tr><th scope="row">Created</th><td>${new Date(u.created_at).toISOString().slice(0, 10)} (${timeAgo(u.created_at)})</td></tr>
      <tr><th scope="row">Last seen</th><td>${u.last_seen ? timeAgo(u.last_seen) : 'never'}</td></tr>
      <tr><th scope="row">Games</th><td>${u.games}</td></tr>
      <tr><th scope="row">Friends</th><td>${u.friends}</td></tr>
      <tr><th scope="row">Chat</th><td>${u.chat_enabled ? 'on' : 'off'} · ${u.chatReports} message report${u.chatReports === 1 ? '' : 's'} against them</td></tr>
    </tbody></table></div>
    <div class="row" style="margin-top:12px"><a class="btn" href="/u/${u.username}">View profile</a>
      ${u.role === 'admin' ? '' : u.banned ? html`<button class="btn" type="button" data-act="unban" data-id="${u.id}" data-name="${u.username}">Unban</button>` : html`<button class="btn btn-danger" type="button" data-act="ban" data-id="${u.id}" data-name="${u.username}">⛔ Ban</button>`}</div>
  </section>` : ''}`;
}

function auditTab() {
  const rows = mod.auditLog(200);
  if (!rows.length) return emptyState({ emoji: '📜', title: 'No entries yet' });
  const details = d => { if (!d) return ''; try { const o = JSON.parse(d); return Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ').slice(0, 220); } catch { return String(d).slice(0, 220); } };
  return html`<div class="panel tblwrap"><table class="tbl audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Details</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td>${when(r.created_at)}</td><td>${r.actor_name ? '@' + r.actor_name : 'system'}</td><td><code>${r.action}</code></td><td>${r.targetLabel}</td><td class="small muted">${details(r.details)}</td></tr>`)}
  </tbody></table></div>`;
}

router.get('/admin', (req, res) => {
  const tab = TABS.some(t => t[0] === req.query.tab) ? req.query.tab : 'queue';
  const c = mod.counts();
  const n = { queue: c.queue, reports: c.reports, chat: c.chat };
  const content = { queue: queueTab, reports: reportsTab, chat: chatTab, users: usersTab, audit: auditTab }[tab](req);
  const body = html`
  <div class="pagehead"><h1>🛡️ Admin</h1><a class="btn" href="/admin/money"><span aria-hidden="true">💰</span> Money</a></div>
  <nav class="tabs" aria-label="Admin sections">${TABS.map(([k, e, l]) => html`<a href="/admin?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}><span aria-hidden="true">${e}</span>&nbsp;${l}${n[k] ? html`&nbsp;<span class="badge">${n[k]}</span>` : ''}</a>`)}</nav>
  ${content}
  ${jsonData('page-data', { tab })}`;
  page(req, res, { title: 'Admin', active: 'me', body, head: COMMUNITY_CSS, scripts: ['/js/admin.js'], back: '/me', backLabel: 'Me' });
});

// ---- APIs ----
const note = req => String((req.body || {}).note || '').slice(0, 500);
const gameAct = fn => (req, res) => {
  const g = fn(req);
  if (!g) return res.status(404).json({ error: 'Game not found or nothing to do.' });
  res.json({ ok: true });
};
router.post('/api/admin/games/:id/approve', gameAct(req => mod.approve(req.user, req.params.id, note(req))));
router.post('/api/admin/games/:id/reject', gameAct(req => mod.reject(req.user, req.params.id, note(req))));
router.post('/api/admin/games/:id/restore', gameAct(req => mod.restoreGame(req.user, req.params.id)));
router.post('/api/admin/games/:id/suspend', gameAct(req => mod.suspendGame(req.user, req.params.id, note(req))));
router.post('/api/admin/games/:id/unsuspend', gameAct(req => mod.unsuspendGame(req.user, req.params.id)));
router.post('/api/admin/chat-reports/:id/hide', (req, res) => (mod.hideMessage(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
router.post('/api/admin/chat-reports/:id/dismiss', (req, res) => (mod.dismissChatReport(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
router.post('/api/admin/chat-reports/:id/ban', (req, res) => { const r = mod.banSender(req.user, req.params.id); res.status(r.ok ? 200 : 400).json(r); });
router.get('/api/admin/users', (req, res) => { const u = mod.findUser(req.query.username); return u ? res.json({ user: u }) : res.status(404).json({ error: 'No user with that exact name.' }); });
router.post('/api/admin/users/:id/ban', (req, res) => { const r = mod.banUser(req.user, req.params.id, note(req)); res.status(r.ok ? 200 : 400).json(r); });
router.post('/api/admin/users/:id/unban', (req, res) => { const r = mod.unbanUser(req.user, req.params.id); res.status(r.ok ? 200 : 400).json(r); });
router.get('/api/admin/audit', (req, res) => res.json({ rows: mod.auditLog(200) }));
