// Admin panel (role admin only). Internal tool: its text stays English (the page frame follows the admin's language). Non-admins get 404 for every page and API under /admin and /api/admin.
// Tabs: Review queue, Reports, Chat reports, Users, Audit log. Every action is audited (services/moderation.js, services/publish.js).
import * as aiBudget from '../services/ai-budget.js';
import * as stats from '../services/stats.js';
import * as photos from '../services/photos.js';
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
import { schoolsOf, getSchool, isStaff } from '../services/schools.js';
import * as schoolBilling from '../services/school-billing.js';
import * as family from '../services/family.js';
import * as schoolRequests from '../services/school-requests.js';
import * as funnel from '../services/funnel.js';
import * as billing from '../services/billing.js';
import * as stripe from '../services/stripe.js';
import { audit, q } from '../db.js';
import { config } from '../config.js';

export const router = Router();
router.use('/admin', requireAdmin);
router.use('/api/admin', requireAdmin);

const TABS = [['queue', '⏳', 'Review queue'], ['reports', '🚩', 'Reports'], ['chat', '💬', 'Chat reports'], ['links', '🧑‍🧒', 'Link reports'], ['schoolreq', '🏫', 'School requests'], ['users', '👤', 'Users'], ['audit', '📜', 'Audit log']];
const gameReason = k => (GAME_REASONS.find(r => r[0] === k) || [k, k])[1];
const chatReason = k => (chat.REPORT_REASONS.find(r => r[0] === k) || [k, k])[1];
const when = t => html`<time datetime="${new Date(t).toISOString()}" title="${new Date(t).toISOString().replace('T', ' ').slice(0, 16)} UTC">${timeAgo(t)}</time>`;

function queueTab(req) {
  const items = mod.reviewQueue();
  if (!items.length) return emptyState({ emoji: '✅', title: 'Nothing to review', text: 'Games waiting for a human check show up here.' });
  // What the builder asked for: approving applies exactly this audience (never more).
  const audience = (a, classes) => (a === 'class' ? `🎒 ${classes.length ? classes.join(', ') : 'their classes (none live right now)'}` : a === 'school' ? '🏫 the school' : '🌍 everyone');
  return html`<div class="stack">${items.map(({ game: g, version: v, isUpdate, liveNumber, safety, review, audience: aud, classes }) => {
    const token = signToken({ v: v.id, g: g.id, u: req.user.id, p: 1 }, 3600);
    const issues = safety.issues || [];
    return html`<article class="panel reviewcard" aria-label="Review ${g.title}">
      <div class="rc-head">
        <div class="rc-cover">${coverArt(g)}</div>
        <div class="rc-info">
          <h2>${g.title}</h2>
          <p class="muted small">by <a href="/u/${g.owner_name}">${g.owner_display}</a> (@${g.owner_name}) · version ${v.number} · ${fmtNum(Math.round((v.size || 0) / 1024))} KB · sent ${when(g.updated_at)}</p>
          <p>${isUpdate ? html`<span class="chip-s warn">🔁 Update to a live game</span> Players keep version ${liveNumber} until you approve.` : html`<span class="chip-s">🆕 New game</span>`}</p>
          <p class="small">Waiting to share with: <b>${audience(aud, classes)}</b></p>
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

/** Children's Reports on a grown-up's link request or link (services/family.js). The report itself already ended the
 *  link; here the admin looks at the grown-up account, bans it if needed, and marks the report done. */
function linksTab() {
  const list = family.openReports();
  if (!list.length) return emptyState({ emoji: '🧑‍🧒', title: 'No link reports', text: 'When a child reports a grown-up who asked to link to their account, it shows up here. The report already ended any link.' });
  return html`<div class="stack">${list.map(r => html`<article class="panel">
    <p class="row small" style="gap:6px"><span class="chip-s bad">Reported</span> ${when(r.created_at)}</p>
    <p class="small" style="margin:0">Child: ${avatar({ id: r.child_id, avatar: r.child_avatar, color: r.child_color, photo_at: r.child_photo_at }, 26)} <b>${r.child_display}</b> <a href="/admin?tab=users&amp;username=${encodeURIComponent(r.child_name)}">@${r.child_name}</a>${r.child_banned ? ' · banned' : ''}</p>
    <p class="small">Grown-up: ${r.owner_name ? html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(r.owner_name)}">@${r.owner_name}</a> · account made ${when(r.owner_created)}${r.owner_banned ? ' · banned' : ''}` : 'account gone'} · ${r.family_reports} report${r.family_reports === 1 ? '' : 's'} against this family</p>
    <div class="row">
      <button class="btn" type="button" data-act="resolvelink" data-id="${r.id}">👍 Done</button>
      ${r.owner_id && !r.owner_banned ? html`<button class="btn btn-danger" type="button" data-act="banlink" data-id="${r.id}" data-name="${r.owner_name}">⛔ Ban grown-up</button>` : ''}
    </div>
  </article>`)}</div>`;
}
const REQUEST_ROLE = { teacher: 'Teacher', leader: 'Principal / head', it: 'IT lead', district: 'District / group', other: 'Other' };
/** "Set up my school" requests from /teachers (services/school-requests.js): open ones first, oldest on top, then the
 *  latest closed. "Create school" opens the usual Add a school form with the name filled in; adding it closes the
 *  request. The site sends no email: reply from your own mail. */
function schoolRequestsTab() {
  const { open, closed } = schoolRequests.queue();
  const info = r => html`<p class="small" style="margin:0">${REQUEST_ROLE[r.role] || r.role} · <a href="mailto:${r.email}" dir="ltr">${r.email}</a> · about ${int(r.students)} students · ${r.country}${r.locale ? html` · page in <code>${r.locale}</code>` : ''}</p>`;
  const act = (r, what, label, cls = 'btn', confirm = '') => html`<form data-api="/api/admin/school-requests/${r.id}/${what}" data-reload ${confirm ? html`data-confirm="${confirm}"` : ''}><button class="${cls}" type="submit">${label}</button></form>`;
  const openList = open.length ? html`<div class="stack">${open.map(r => html`<article class="panel" aria-label="School request: ${r.school_name}">
      <p class="row small" style="gap:6px"><span class="chip-s warn">Waiting</span> sent ${when(r.created_at)}</p>
      <h2 style="margin:0 0 6px">${r.school_name}</h2>
      ${info(r)}
      <div class="row" style="margin-top:12px">
        <a class="btn btn-primary" href="/admin/schools?request=${encodeURIComponent(r.id)}">➕ Create school</a>
        ${act(r, 'done', '👍 Mark done')}
        ${act(r, 'declined', 'Decline', 'btn', `Decline the request from ${r.school_name}? Remember to reply by email.`)}
      </div></article>`)}</div>`
    : emptyState({ emoji: '🏫', title: 'No school requests waiting', text: 'When a teacher fills in "Set up my school" on /teachers, it shows up here. The page promises an answer within 1 school day.' });
  return html`${openList}
    <p class="small muted">The site sends no email: reply to each request from your own mail. Requests are deleted 1 year after they are closed.</p>
    ${closed.length ? html`<h2 class="stats-h">Recently closed</h2><div class="panel tblwrap"><table class="tbl rtable"><thead><tr><th>School</th><th>Answer</th><th>Closed</th><th></th></tr></thead><tbody>
      ${closed.map(r => html`<tr><td><b>${r.school_name}</b> <span class="small muted">· <span dir="ltr">${r.email}</span></span></td>
        <td data-label="Answer">${r.status === 'done' ? (r.school_slug ? html`✅ <a href="/school/${r.school_slug}?tab=people">${r.linked_school}</a>` : '✅ done') : '✖️ declined'}</td>
        <td data-label="Closed">${when(r.closed_at)}</td><td>${act(r, 'reopen', 'Reopen', 'btn btn-sm')}</td></tr>`)}
    </tbody></table></div>` : ''}`;
}
/** The Family row of the users tab: a child's family, or a grown-up's children, each with Break link. */
function familyCell(u) {
  const l = family.adminLinks(u.id);
  const brk = (fid, cid, label) => html` <button class="btn" type="button" data-act="unlinkfamily" data-id="${fid}" data-child="${cid}" data-name="${label}">Break link</button>`;
  const st = r => (r.status === 'pending' ? 'asked' : 'linked');
  if (u.account_type === 'grownup') {
    return html`Grown-up account${l.children.length ? html`${l.children.map(c => html`<div>${st(c)}: <a href="/admin?tab=users&amp;username=${encodeURIComponent(c.child_name)}">@${c.child_name}</a>${brk(c.family_id, c.child_id, c.child_name)}</div>`)}` : ' · no children'}`;
  }
  if (!l.asChild.length) return 'none';
  return html`${l.asChild.map(r => html`<div>${st(r)} with grown-up <a href="/admin?tab=users&amp;username=${encodeURIComponent(r.owner_name)}">@${r.owner_name}</a>${brk(r.family_id, r.child_id, u.username)}</div>`)}`;
}

const SCHOOL_ROLE = { admin: 'School admin', teacher: 'Teacher', student: 'Student' };
const schoolLink = s => html`<a href="/school/${s.slug}?tab=people">${s.name}</a>`;
/** The Schools row of the users tab: who owns the account (school accounts) and every active membership with its role.
 *  The platform admin can open every school page, so each school links to its People tab. */
function schoolsCell(u) {
  const owner = u.managed_school ? getSchool(u.managed_school) : null;
  const list = schoolsOf(u.id);
  if (!u.managed_school && !list.length) return 'none';
  return html`${u.managed_school ? html`<div>School account of ${owner ? schoolLink(owner) : 'a school that no longer exists'}</div>` : ''}
    ${list.map(s => html`<div>${schoolLink(s)} · ${SCHOOL_ROLE[s.role] || s.role}</div>`)}`;
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
      <tr><th scope="row">Site role</th><td>${u.role}</td></tr>
      <tr><th scope="row">Schools</th><td>${schoolsCell(u)}</td></tr>
      <tr><th scope="row">Family</th><td>${familyCell(u)}</td></tr>
      ${u.account_type === 'grownup' || isStaff(u) ? html`<tr><th scope="row">Billing tester</th><td>${u.billing_tester ? 'yes: may check out while the Stripe key is a test key' : 'no'}
        <button class="btn" type="button" data-act="tester" data-id="${u.id}" data-on="${u.billing_tester ? '0' : '1'}">${u.billing_tester ? 'Remove tester' : 'Make billing tester'}</button></td></tr>` : ''}
      <tr><th scope="row">Created</th><td>${new Date(u.created_at).toISOString().slice(0, 10)} (${timeAgo(u.created_at)})</td></tr>
      <tr><th scope="row">Last seen</th><td>${u.last_seen ? timeAgo(u.last_seen) : 'never'}</td></tr>
      <tr><th scope="row">Games</th><td>${u.games}</td></tr>
      <tr><th scope="row">Friends</th><td>${u.friends}</td></tr>
      <tr><th scope="row">Chat</th><td>${u.chat_enabled ? 'on' : 'off'} · ${u.chatReports} message report${u.chatReports === 1 ? '' : 's'} against them</td></tr>
    </tbody></table></div>
    <div class="row" style="margin-top:12px"><a class="btn" href="/u/${u.username}">View profile</a>
      ${u.photo_at ? html`<button class="btn" type="button" data-act="unphoto" data-id="${u.id}" data-name="${u.username}">🖼️ Remove photo</button>` : ''}
      ${u.role === 'admin' ? '' : u.banned ? html`<button class="btn" type="button" data-act="unban" data-id="${u.id}" data-name="${u.username}">Unban</button>` : html`<button class="btn btn-danger" type="button" data-act="ban" data-id="${u.id}" data-name="${u.username}">⛔ Ban</button>`}</div>
  </section>` : ''}`;
}

function auditTab() {
  const rows = mod.auditLog(200);
  if (!rows.length) return emptyState({ emoji: '📜', title: 'No entries yet' });
  return html`<div class="panel tblwrap"><table class="tbl audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Details</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td>${when(r.created_at)}</td><td>${r.actor_name ? '@' + r.actor_name : 'system'}</td><td><code>${r.action}</code></td><td>${r.targetLabel}</td><td class="small muted">${r.detailsLabel}</td></tr>`)}
  </tbody></table></div>`;
}

/** AI spending vs the caps (AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD). Admin pages are English-only. */
function aiSpendPanel() {
  const b = aiBudget.status(); const usd = n => '$' + n.toFixed(2);
  return html`<section class="panel" aria-label="AI spending"><b>🤖 AI spending</b>
    today ${usd(b.today)} of ${usd(b.daily)} (${b.todayCalls} calls) · this month ${usd(b.month)} of ${usd(b.monthly)}
    ${b.ok ? '' : html`<br><b>Cap reached (${b.reason}):</b> the Builder is using the offline builder, picture uploads are paused and public reviews wait for a person.`}</section>`;
}

router.get('/admin', (req, res) => {
  const tab = TABS.some(t => t[0] === req.query.tab) ? req.query.tab : 'queue';
  const c = mod.counts();
  const n = { queue: c.queue, reports: c.reports, chat: c.chat, links: family.openReportCount(), schoolreq: schoolRequests.openCount() };
  const content = { queue: queueTab, reports: reportsTab, chat: chatTab, links: linksTab, schoolreq: schoolRequestsTab, users: usersTab, audit: auditTab }[tab](req);
  const body = html`
  <div class="pagehead"><h1>🛡️ Admin</h1><div class="row"><a class="btn btn-primary" href="/admin/stats"><span aria-hidden="true">📊</span> Stats</a><a class="btn" href="/admin/schools"><span aria-hidden="true">🏫</span> Schools${n.schoolreq ? html`&nbsp;<span class="badge" aria-label="${n.schoolreq} school request${n.schoolreq === 1 ? '' : 's'} waiting">${n.schoolreq}</span>` : ''}</a><a class="btn" href="/admin/billing"><span aria-hidden="true">💳</span> Billing</a></div></div>
  ${aiSpendPanel()}
  <nav class="tabs" aria-label="Admin sections">${TABS.map(([k, e, l]) => html`<a href="/admin?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}><span aria-hidden="true">${e}</span>&nbsp;${l}${n[k] ? html`&nbsp;<span class="badge">${n[k]}</span>` : ''}</a>`)}</nav>
  ${content}
  ${jsonData('page-data', { tab })}`;
  page(req, res, { title: 'Admin', active: 'me', body, head: COMMUNITY_CSS, scripts: ['/js/admin.js'], back: '/me', backLabel: 'Me' });
});

// ---- Stats dashboard ----
const usd = n => '$' + (+n || 0).toFixed(n >= 100 ? 0 : 2);
const int = n => Math.round(+n || 0).toLocaleString('en-US');
const shortDay = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** A round axis top: 1, 2, 5 x 10^k at or above max. */
function niceMax(max) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map(f => f * p).find(v => v >= max);
}
function tile(label, value, sub = '', tone = '') {
  return html`<div class="kpi panel ${tone}"><span class="kpi-l">${label}</span><b class="kpi-v">${value}</b>${sub ? html`<span class="kpi-s">${sub}</span>` : ''}</div>`;
}
/** One measure per chart (never two axes). Bars are HTML, so labels stay crisp at any width; tap or hover a bar for its day. */
function barChart({ title, rows, key, fmt = int, unit, tip, total = true }) {
  const vals = rows.map(r => +r[key] || 0), top = niceMax(Math.max(...vals)), sum = vals.reduce((a, b) => a + b, 0);
  const tipOf = (r, v) => `${shortDay(r.day)}: ${tip ? tip(r) : `${fmt(v)} ${unit}`}`;
  const mid = Math.floor(rows.length / 2);
  return html`<figure class="chart panel">
    <figcaption><h3>${title}</h3><span class="chart-sum">${total ? html`<b>${fmt(sum)}</b> ${unit} in ${rows.length} days` : ''}</span></figcaption>
    <p class="chart-read" aria-live="polite">Latest: ${tipOf(rows[rows.length - 1], vals[vals.length - 1])}</p>
    <div class="plot">
      <div class="yaxis" aria-hidden="true"><span>${fmt(top)}</span><span>${fmt === int && !Number.isInteger(top / 2) ? '' : fmt(top / 2)}</span><span>0</span></div>
      <div class="bars" role="img" aria-label="${title}, daily, ${shortDay(rows[0].day)} to ${shortDay(rows[rows.length - 1].day)}. Highest day ${fmt(Math.max(...vals))} ${unit}.">
        ${rows.map((r, i) => html`<button type="button" class="bar" data-tip="${tipOf(r, vals[i])}" title="${tipOf(r, vals[i])}" tabindex="-1"><i style="--h:${(vals[i] / top * 100).toFixed(1)}%" class="${vals[i] ? '' : 'zero'}"></i></button>`)}
      </div>
    </div>
    <div class="xaxis" aria-hidden="true"><span>${shortDay(rows[0].day)}</span><span>${shortDay(rows[mid].day)}</span><span>${shortDay(rows[rows.length - 1].day)}</span></div>
    <details><summary>Show as a table</summary><div class="tblwrap"><table class="tbl small"><thead><tr><th>Day</th><th>${title}</th></tr></thead><tbody>
      ${rows.slice().reverse().map((r, i) => html`<tr><td>${shortDay(r.day)}</td><td>${tip ? tip(r) : fmt(vals[rows.length - 1 - i])}</td></tr>`)}
    </tbody></table></div></details>
  </figure>`;
}
/** Readable names for services/traffic.js areas. */
const AREA_LABELS = { home: 'Home', game: 'Game pages', play: 'Play', build: 'Studio', search: 'Search', favorites: 'Favorites', friends: 'Friends & chat', profile: 'Profiles', me: 'Me', signup: 'Sign up & log in', school: 'Schools', other: 'Other' };
/** Cost per Builder message, messages per day and what the free budget pays for (docs/decisions.md "Paid plans"). */
function costSection(c) {
  const cents = n => (n >= 1 ? usd(n) : `${(n * 100).toFixed(n * 100 >= 10 ? 0 : 1)}¢`);
  const row = (label, s) => html`<tr><td>${label}</td><td>${int(s.n)}${s.estimated ? html` <span class="muted small">(${int(s.estimated)} estimated)</span>` : ''}</td>
    <td>${s.n ? cents(s.avg) : '–'}</td><td>${s.n ? cents(s.median) : '–'}</td><td>${s.n ? cents(s.p90) : '–'}</td><td>${usd(s.total)}</td></tr>`;
  const est = c.all.estimated;
  return html`
  <h2 class="stats-h">Cost per Builder message, last ${c.days} days</h2>
  <div class="kpis">
    ${tile('💵 Average per message', c.all.n ? cents(c.all.avg) : '–', c.all.n ? `median ${cents(c.all.median)} · ${int(c.all.n)} messages` : 'no AI-built messages yet')}
    ${tile('📨 Messages per day', fmtNum(Math.round(c.perDay * 10) / 10), `${fmtNum(Math.round(c.perDay7 * 10) / 10)} a day over the last 7 days`)}
    ${tile('🎁 Free messages per month', c.expectedPerMonth === null ? '–' : int(c.expectedPerMonth), c.expectedPerMonth === null ? `the ${usd(c.monthly)} budget, once messages have a cost` : `the ${usd(c.monthly)} budget after other AI use · ${int(c.expectedPerMonthAll)} if it all went to the Builder`)}
    ${tile('📆 Free messages per day', c.perDayCap === null ? '–' : int(c.perDayCap), `what the ${usd(c.daily)} daily cap pays for`)}
    ${tile('📈 This month at this pace', usd(c.projectedMonth), `free AI spend for 30 days · budget ${usd(c.monthly)}`, c.projectedMonth > c.monthly ? 'warn' : '')}
  </div>
  <section class="panel stats-cost"><div class="tblwrap"><table class="tbl"><thead><tr><th>Quality</th><th>Messages</th><th>Average</th><th>Median</th><th>90% under</th><th>Total</th></tr></thead><tbody>
    ${row('Normal', c.normal)}${row('Pro', c.pro)}${row('All', c.all)}</tbody></table></div>
    <p class="small muted">A message is one Builder build the AI ran, counted on the day it was charged (refunded builds too: their AI calls were paid).
    Its cost is what its own model calls cost; screening, picture checks, reviews and lesson help are the "other AI use"
    (${usd(c.otherUsd)} of ${usd(c.spentUsd)} free AI spend over these days), taken off the monthly budget at the same pace
    before dividing by the average cost.${est ? ` ${int(est)} older builds have no stored cost: they are estimated from their token counts.` : ''}
    Builder rows are kept 35 days.</p>
  </section>`;
}
/** The funnels (services/funnel.js), weekly: the last 7 days against the 7 before, one table per funnel. */
function funnelSection(r) {
  const pct = c => (c === null ? '–' : `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c)}%`);
  const changeCell = (s, guard) => {
    if (s.change === null) return s.last ? 'new' : '–';
    return guard && s.change < 0 ? html`<span class="chip-s warn">${pct(s.change)}</span>` : pct(s.change);
  };
  const range = d => `${shortDay(d.from)} – ${shortDay(d.to)}`;
  return html`
  <h2 class="stats-h" id="funnels">Funnels, last 7 days vs the 7 before</h2>
  <div class="stats-grid stats-funnels">
    ${r.funnels.map(f => html`<section class="panel" aria-labelledby="funnel-${f.key}"><h2 id="funnel-${f.key}">${f.title}</h2>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Step</th><th title="${range(r.last)}">Last 7 days</th><th title="${range(r.prev)}">Week before</th><th>Change</th>${f.guardrail ? '' : html`<th>Of step before</th>`}</tr></thead><tbody>
        ${f.steps.map((s, i) => html`<tr><td>${s.label}</td><td>${int(s.last)}</td><td>${int(s.prev)}</td><td>${changeCell(s, f.guardrail)}</td>${f.guardrail ? '' : html`<td>${i === 0 ? '' : s.rate === null ? '–' : `${s.rate}%`}</td>`}</tr>`)}
      </tbody></table></div></section>`)}
  </div>
  <p class="small muted">Daily totals counted on the server where each step happens (no cookies, no trackers, no ids:
  one number per step per day, so steps compare totals, not the same people). Page views are the parent pages
  (/parents, its guides, /grown-ups) and the teacher pages (/teachers, /plans/schools), counted like visits. Paid and
  School plan: a subscription's first invoice once it is paid (an invoiced school counts when it pays, not when the
  invoice is sent), from Stripe's webhook (gifted plans don't count). Checkout started: once per family per try (opening
  Checkout again within a day doesn't add to it). A teacher page reloaded after sending the form isn't a new view. Counting started
  with this update, so the first two weeks read low. Days are UTC.</p>`;
}
const gameLink = g => html`<a href="/g/${g.slug}">${g.icon} ${g.title}</a>${g.source === 'seed' ? html` <span class="chip-s">launch</span>` : ''}`;

router.get('/admin/stats', (req, res) => {
  const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 30;
  const k = stats.kpis(), rows = stats.daily(days);
  const cost = stats.messageCosts(Math.min(days, 30));
  const top7 = stats.topGames(7), topAll = stats.topGamesAllTime(10), builders = stats.topBuilders(10), areas = stats.areas(7), models = stats.aiByModel(30), fresh = stats.newestUsers(8);
  const tok = t => int((t.input || 0) + (t.output || 0));
  const body = html`
  <div class="pagehead"><h1>📊 Stats</h1><nav class="seg" aria-label="Time range">${[7, 30, 90].map(d => html`<a href="/admin/stats?days=${d}" ${d === days ? raw('aria-current="page"') : ''}>${d} days</a>`)}</nav></div>
  <p class="muted small">All times are UTC. Visits count page loads by people (no bots, no tracking: one daily total per page area, and each visitor once a day).</p>

  <h2 class="stats-h">Today and this week</h2>
  <div class="kpis">
    ${tile('👀 Visitors today', int(k.visits.visitorsToday), `${int(k.visits.viewsToday)} page views · ${int(k.visits.visitorsWeek)} visitor-days this week`)}
    ${tile('👤 Accounts', int(k.users.accounts), `+${int(k.users.newToday)} today · +${int(k.users.newWeek)} this week`)}
    ${tile('🙋 Active players', int(k.users.activeToday), `today · ${int(k.users.activeWeek)} this week`)}
    ${tile('🎮 Plays', int(k.plays.today), `today · ${int(k.plays.week)} this week · ${int(k.plays.minutesWeek)} min played`)}
    ${tile('🛠️ Games built', int(k.games.built), `${int(k.games.live)} live (${int(k.games.livePublic)} public) · +${int(k.games.newWeek)} this week`)}
    ${tile('⏳ Waiting for review', int(k.games.waiting), k.games.waiting ? html`<a href="/admin?tab=queue">Open the queue</a>` : 'all clear', k.games.waiting ? 'warn' : '')}
    ${tile('🤖 AI cost today', usd(k.ai.today), `of ${usd(k.ai.daily)} cap · ${int(k.ai.callsToday)} calls`, k.ai.ok ? '' : 'bad')}
    ${tile('📅 AI cost this month', usd(k.ai.month), `of ${usd(k.ai.monthly)} cap · ${int(k.ai.callsMonth)} calls`, k.ai.ok ? '' : 'bad')}
    ${tile('🔤 Tokens today', tok(k.ai.tokensToday), `${int(k.ai.tokensToday.input)} in · ${int(k.ai.tokensToday.output)} out`)}
    ${tile('💬 Builder messages', int(k.ai.turnsToday), `today · from ${int(k.ai.buildersToday)} builder${k.ai.buildersToday === 1 ? '' : 's'}`)}
  </div>
  ${k.ai.ok ? '' : html`<p class="notice warn">The AI ${k.ai.reason} cap is reached: the Builder is using the offline builder until it resets.</p>`}
  ${costSection(cost)}
  ${funnelSection(funnel.weekly())}

  <h2 class="stats-h">Last ${days} days</h2>
  <div class="charts">
    ${barChart({ title: 'Visitors', rows, key: 'visitors', unit: 'visitors', total: false, tip: r => `${int(r.visitors)} visitors, ${int(r.views)} page views` })}
    ${barChart({ title: 'New accounts', rows, key: 'signups', unit: 'accounts', tip: r => `${int(r.signups)} accounts, ${int(r.guests)} guests` })}
    ${barChart({ title: 'Plays', rows, key: 'plays', unit: 'plays', tip: r => `${int(r.plays)} plays, ${int(r.minutes)} minutes` })}
    ${barChart({ title: 'Games started in the Studio', rows, key: 'built', unit: 'games' })}
    ${barChart({ title: 'Builder messages', rows, key: 'turns', unit: 'messages' })}
    ${barChart({ title: 'AI cost', rows, key: 'usd', fmt: usd, unit: '', tip: r => `${usd(r.usd)}, ${int(r.calls)} calls` })}
    ${barChart({ title: 'AI tokens', rows: rows.map(r => ({ ...r, tokens: r.tokensIn + r.tokensOut })), key: 'tokens', fmt: fmtNum, unit: 'tokens', tip: r => `${int(r.tokensIn)} in, ${int(r.tokensOut)} out` })}
  </div>

  <div class="stats-grid">
    <section class="panel"><h2>🔥 Most played, last 7 days</h2>
      ${top7.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Game</th><th>Plays</th><th>Players</th><th>Minutes</th></tr></thead><tbody>
        ${top7.map(g => html`<tr><td>${gameLink(g)}</td><td>${int(g.plays)}</td><td>${int(g.players)}</td><td>${int(g.minutes)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No plays yet this week.</p>`}
    </section>
    <section class="panel"><h2>🏆 All-time favourites</h2>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Game</th><th>Plays</th><th>❤️</th><th>★</th></tr></thead><tbody>
        ${topAll.map(g => html`<tr><td>${gameLink(g)}</td><td>${int(g.plays)}</td><td>${int(g.likes)}</td><td>${g.rating ? html`${g.rating} <span class="muted small">(${g.rating_count})</span>` : '–'}</td></tr>`)}</tbody></table></div>
    </section>
    <section class="panel"><h2>🛠️ Top builders</h2>
      ${builders.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Builder</th><th>Games</th><th>Live</th><th>Plays</th></tr></thead><tbody>
        ${builders.map(b => html`<tr><td><a href="/u/${b.username}">${b.avatar} ${b.display_name}</a></td><td>${int(b.games)}</td><td>${int(b.live)}</td><td>${int(b.plays)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Nobody has built a game yet.</p>`}
    </section>
    <section class="panel"><h2>🧭 Where people go, last 7 days</h2>
      ${areas.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Page area</th><th>Views</th></tr></thead><tbody>
        ${areas.map(a => html`<tr><td>${AREA_LABELS[a.area] || a.area}</td><td>${int(a.views)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No visits counted yet. Counting started with this update.</p>`}
    </section>
    <section class="panel"><h2>🤖 AI by model, last 30 days</h2>
      ${models.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Model</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th></tr></thead><tbody>
        ${models.map(m => html`<tr><td><code>${m.model}</code></td><td>${int(m.calls)}</td><td>${fmtNum(m.input + m.cache_read + m.cache_write)}</td><td>${fmtNum(m.output)}</td><td>${usd(m.usd)}</td></tr>`)}</tbody></table></div>
        <p class="small muted">Tokens in include cached prompt tokens. Token counts started with this update; costs before it are in the AI cost chart.</p>` : html`<p class="muted">No AI calls recorded yet.</p>`}
    </section>
    <section class="panel"><h2>🆕 Newest accounts</h2>
      ${fresh.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Player</th><th>Joined</th><th>Last seen</th></tr></thead><tbody>
        ${fresh.map(u => html`<tr><td><a href="/u/${u.username}">${u.avatar} ${u.display_name}</a></td><td>${timeAgo(u.created_at)}</td><td>${u.last_seen ? timeAgo(u.last_seen) : 'never'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No accounts yet.</p>`}
      <p class="small muted">${int(k.users.guests)} guest players in total, +${int(k.users.guestsWeek)} this week. ${int(k.users.banned)} banned.</p>
    </section>
  </div>`;
  page(req, res, { title: 'Stats', active: 'me', body, head: raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/stats.css">'), scripts: ['/js/admin-stats.js'], back: '/admin', backLabel: 'Admin' });
});

// ---- Billing (read-only, chunk 4): subscriptions with their flags, recent webhook events and failures, unlinked
// events, the Stripe Tax banner, and (chunk 5) school invoice requests with Create invoice subscription and unpaid
// school invoices with Mark paid by check. Refunds, cancels and links are done in the Stripe Dashboard for now (each
// row links there); grants and family links come in later chunks. ----
const BILLING_FLAGS = { duplicate: 'Paid twice: cancelled and refunded', refunded_active: 'Refunded but still active', dispute: 'Disputed: cancelled', efw: 'Fraud warning: cancelled, consider a refund', overdue: 'Invoice overdue', async_failed: 'Delayed payment failed', unknown_price: 'Price sells no known plan' };
const SUB_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'];
const dash = (path) => `https://dashboard.stripe.com/${stripe.billingMode() === 'live' ? '' : 'test/'}${path}`;
const day = t => (t ? new Date(t).toISOString().slice(0, 10) : '–');
function ownerCell(r) {
  if (r.owner_kind === 'family') {
    const o = q.get('SELECT u.username FROM families f JOIN users u ON u.id=f.owner_id WHERE f.id=?', r.owner_id);
    return o ? html`Family of <a href="/admin?tab=users&amp;username=${encodeURIComponent(o.username)}">@${o.username}</a>` : html`Family ${r.owner_id} (gone)`;
  }
  const sc = getSchool(r.owner_id);
  return sc ? html`School <a href="/school/${sc.slug}">${sc.name}</a>` : html`${r.owner_kind} ${r.owner_id}`;
}
router.get('/admin/billing', (req, res) => {
  const mode = stripe.billingMode();
  const status = SUB_STATUSES.includes(req.query.status) || req.query.status === 'entitled' ? req.query.status : '';
  const flag = Object.hasOwn(BILLING_FLAGS, req.query.flag) || req.query.flag === 'any' ? req.query.flag : '';
  const lm = stripe.currentLivemode();
  let subs = q.all('SELECT * FROM billing_subscriptions WHERE livemode=? ORDER BY updated_at DESC LIMIT 500', lm);
  if (status === 'entitled') subs = subs.filter(r => billing.entitledRow(r));
  else if (status) subs = subs.filter(r => r.status === status);
  if (flag === 'any') subs = subs.filter(r => r.flag); else if (flag) subs = subs.filter(r => r.flag === flag);
  const events = q.all('SELECT * FROM billing_events ORDER BY received_at DESC LIMIT 50');
  const problems = q.all("SELECT * FROM billing_events WHERE result IS NULL OR result NOT IN ('ok','ignored','duplicate') ORDER BY received_at DESC LIMIT 50");
  const orphaned = q.all('SELECT * FROM billing_subscriptions WHERE livemode=? AND orphaned_at IS NOT NULL ORDER BY orphaned_at DESC LIMIT 50', lm);
  const open = q.get('SELECT COUNT(*) n FROM billing_checkouts WHERE livemode=?', lm).n;
  const tax = stripe.lastTaxReadiness();
  const families = billing.entitledOwnerCount('family');
  const schools = billing.entitledOwnerCount('school');
  const requests = schoolBilling.openRequests();
  const unpaid = q.all("SELECT * FROM billing_subscriptions WHERE livemode=? AND owner_kind='school' AND collection_method='send_invoice' AND open_invoices IS NOT NULL AND open_invoices != '[]' ORDER BY updated_at DESC", lm)
    .flatMap(r => schoolBilling.openInvoicesOf(r).map(i => ({ ...i, row: r })));
  const sel = (name, value, opts) => html`<label class="sr-only" for="f-${name}">${name}</label><select class="input" id="f-${name}" name="${name}">${opts.map(([v, l]) => html`<option value="${v}" ${v === value ? raw('selected') : ''}>${l}</option>`)}</select>`;
  const body = html`
  <div class="pagehead"><h1>💳 Billing</h1><span class="chip-s ${mode === 'live' ? 'good' : mode === 'test' ? 'warn' : ''}">Stripe: ${mode}</span></div>
  ${mode === 'off' ? html`<p class="notice">Billing is off: set STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET (see the README). Rows from an earlier key still show below.</p>` : ''}
  ${mode !== 'off' && !config.stripePmcFamily ? html`<p class="notice bad" role="alert"><b>Family checkout is off: STRIPE_PMC_FAMILY is not set.</b> Create the "Family" payment method configuration in Stripe (cards, Apple Pay, Google Pay on; Link off) and put its pmc_… id in STRIPE_PMC_FAMILY. Until then family plans are not on sale.</p>` : ''}
  ${tax && tax.on && !tax.ok ? html`<p class="notice bad" role="alert"><b>${tax.problem === 'settings_pending' ? 'Stripe Tax is on but its settings are pending' : 'Stripe Tax is on but is collecting in no state'}.</b> No tax is collected. ${tax.problem === 'settings_pending' ? 'Set the head office address in Stripe (Tax → Settings).' : 'Add a registration in Stripe (Tax → Registrations).'} Checked ${timeAgo(tax.checkedAt)}.</p>` : ''}
  <div class="kpis" style="margin-bottom:var(--s4)">
    ${tile('👪 Families with a plan', int(families), mode === 'test' ? 'test mode: billing testers only' : '')}
    ${tile('🏫 Schools with a plan', int(schools), requests.length ? html`<a href="#requests">${int(requests.length)} invoice request${requests.length === 1 ? '' : 's'}</a>` : '')}
    ${tile('🛒 Open checkouts', int(open))}
    ${tile('⚠️ Flagged', int(q.get('SELECT COUNT(*) n FROM billing_subscriptions WHERE livemode=? AND flag IS NOT NULL', lm).n), html`<a href="/admin/billing?flag=any">Show</a>`)}
    ${tile('📨 Event problems', int(problems.length), 'unlinked, other mode or version, failed')}
  </div>
  <section class="panel"><h2>Subscriptions</h2>
    <form method="get" action="/admin/billing" class="row" role="search">
      ${sel('status', status, [['', 'Any status'], ['entitled', 'Entitled now'], ...SUB_STATUSES.map(x => [x, x])])}
      ${sel('flag', flag, [['', 'Any or no flag'], ['any', 'Flagged'], ...Object.entries(BILLING_FLAGS)])}
      <button class="btn" type="submit">Filter</button></form>
    ${subs.length ? html`<div class="tblwrap"><table class="tbl small" style="margin-top:12px"><thead><tr><th>Owner</th><th>Plan</th><th>Status</th><th>Period end</th><th>Last payment</th><th>Refund window</th><th>Flag</th><th>Stripe</th></tr></thead><tbody>
      ${subs.map(r => { const rw = billing.refundWindow(r); return html`<tr>
        <td>${ownerCell(r)}</td>
        <td>${r.plan}${r.interval ? ` · ${r.interval}ly` : ''}${r.quantity > 1 ? ` × ${r.quantity}` : ''}${r.plan === 'school' ? html`<div class="small muted">${r.collection_method === 'send_invoice' ? 'invoice' : 'card'} · pool ${r.pool_quantity || 0} paid${r.next_quantity ? ` · next year ${r.next_quantity}` : ''}</div>` : ''}</td>
        <td>${r.status}${billing.entitledRow(r) ? ' ✅' : ''}${r.cancel_at_period_end ? ' · ends at period end' : ''}${r.grace_until ? ` · grace to ${day(r.grace_until)}` : ''}${r.payment_pending ? ' · payment pending' : ''}${r.orphaned_at ? ' · not at Stripe' : ''}</td>
        <td>${day(r.current_period_end)}</td>
        <td>${r.latest_paid_at ? html`${day(r.latest_paid_at)} · $${((r.latest_amount_paid || 0) / 100).toFixed(2)}${r.latest_billing_reason ? html` <span class="muted">(${r.latest_billing_reason.replace('subscription_', '')})</span>` : ''}` : '–'}</td>
        <td>${rw ? `open until ${day(rw)}` : '–'}</td>
        <td>${r.flag ? html`<span class="chip-s bad">${BILLING_FLAGS[r.flag] || r.flag}</span>` : ''}${r.risk_payment_intent ? html` <a href="${dash(`payments/${r.risk_payment_intent}`)}" rel="noopener noreferrer" target="_blank">Refund in Stripe</a>` : ''}</td>
        <td><a href="${dash(`subscriptions/${r.stripe_subscription_id}`)}" rel="noopener noreferrer" target="_blank"><code>${r.stripe_subscription_id}</code></a></td></tr>`; })}
    </tbody></table></div>` : html`<p class="muted">No subscriptions${status || flag ? ' match' : ' yet'}.</p>`}
    <p class="small muted">Refunds (D10): a full refund on request within ${billing.REFUND_DAYS} days of a payment that started a plan or renewed a yearly plan; monthly renewals are not refunded. Cancel first, then refund, in the Stripe Dashboard: a full refund of the latest payment also ends the plan here.</p>
  </section>
  <section class="panel" id="requests"><h2>School invoice requests</h2>
    ${requests.length ? html`<div class="stack">${requests.map(r => html`<div class="panel" style="margin:0">
      <p style="margin-top:0"><b><a href="/school/${r.school_slug}?tab=billing">${r.school_name}</a></b> · ${int(r.seats)} students · asked ${when(r.created_at)}</p>
      <div class="tblwrap"><table class="tbl small"><tbody>
        <tr><th scope="row">PO number</th><td>${r.po || '–'}</td></tr>
        <tr><th scope="row">Billing contact</th><td>${r.contact_name || '–'} · <span dir="ltr">${r.contact_email || '–'}</span></td></tr>
        <tr><th scope="row">Billing address</th><td>${[r.address.line1, r.address.line2, r.address.city, r.address.state, r.address.postal_code, r.address.country].filter(Boolean).join(', ') || '–'}</td></tr>
        <tr><th scope="row">Tax-exempt</th><td>${r.tax_exempt_claimed ? 'they say so: wait for the exemption certificate before ticking the box below' : 'no'}</td></tr>
        ${r.note ? html`<tr><th scope="row">Note</th><td>${r.note}</td></tr>` : ''}
      </tbody></table></div>
      <form class="row" data-api="/api/admin/billing/requests/${r.id}/invoice-subscription" data-reload data-toast="Invoice subscription created. Stripe sends the invoice to the contact." data-confirm="Create a yearly invoice subscription (net 30) for ${r.school_name}?" style="margin-top:12px">
        <label for="seats-${r.id}">Students</label><input class="input" id="seats-${r.id}" name="seats" type="number" min="${config.schoolMinSeats}" step="1" value="${r.seats}" style="max-width:8em">
        <label class="checkline"><input type="checkbox" name="exempt" value="1"> <span>Exemption certificate received: mark the customer tax-exempt</span></label>
        <button class="btn btn-primary" type="submit">Create invoice subscription</button></form>
      <form data-api="/api/admin/billing/requests/${r.id}/close" data-reload data-confirm="Close this request without an invoice?" style="margin-top:8px"><button class="btn btn-sm" type="submit">Close without invoice</button></form>
    </div>`)}</div>
    <p class="small muted">Create invoice subscription: the school's Stripe Customer gets the school's name, the contact's email (Stripe emails the invoice there), the address and the PO number; then a yearly send_invoice subscription, due in 30 days${config.stripeTax ? ', with Stripe Tax' : ''}. How a school may pay an invoice (card, ACH, bank transfer) is set in the Stripe Dashboard.</p>` : html`<p class="muted">No open requests.</p>`}
  </section>
  <section class="panel" id="unpaid"><h2>Unpaid school invoices</h2>
    ${unpaid.length ? html`<div class="tblwrap"><table class="tbl small"><thead><tr><th>School</th><th>Invoice</th><th>Amount</th><th>Due</th><th></th></tr></thead><tbody>
      ${unpaid.map(i => html`<tr><td>${ownerCell(i.row)}${i.row.flag === 'overdue' ? html` <span class="chip-s bad">overdue</span>` : ''}</td>
        <td><a href="${dash(`invoices/${i.id}`)}" rel="noopener noreferrer" target="_blank"><code>${i.number || i.id}</code></a> · <a href="${dash(`customers/${i.row.stripe_customer_id}`)}" rel="noopener noreferrer" target="_blank">customer (cash balance)</a></td>
        <td>$${((i.amount_due || 0) / 100).toFixed(2)}</td><td>${day(i.due_date)}</td>
        <td><form data-api="/api/admin/billing/invoices/${i.id}/paid-by-check" data-reload data-toast="Marked paid." data-confirm="Mark invoice ${i.number || i.id} as paid by check?"><button class="btn btn-sm" type="submit">Mark paid by check</button></form></td></tr>`)}
    </tbody></table></div><p class="small muted">An invoice school stays on its plan until ${config.schoolInvoiceGraceDays} days after the due date. A bank transfer that doesn't match the invoice waits in the customer's cash balance until you apply it in Stripe.</p>` : html`<p class="muted">None.</p>`}
  </section>
  <section class="panel"><h2>Event problems</h2>
    ${problems.length ? html`<div class="tblwrap"><table class="tbl small"><thead><tr><th>When</th><th>Event</th><th>Result</th><th>Customer</th><th>Subscription</th></tr></thead><tbody>
      ${problems.map(e => html`<tr><td>${when(e.received_at)}</td><td><code>${e.type}</code> <span class="muted">${e.event_id}</span></td><td>${e.result || 'not finished'}</td><td>${e.stripe_customer_id || '–'}</td><td>${e.stripe_subscription_id || '–'}</td></tr>`)}
    </tbody></table></div><p class="small muted">"unlinked": a subscription of a Stripe Customer we don't know (made in the Dashboard?). Linking it to a family or school comes with the next billing update; until then it entitles nobody.</p>` : html`<p class="muted">None.</p>`}
    ${orphaned.length ? html`<p>Subscriptions Stripe no longer knows: ${orphaned.map(r => html`<code>${r.stripe_subscription_id}</code> `)}</p>` : ''}
  </section>
  <section class="panel"><h2>Recent webhook events</h2>
    ${events.length ? html`<div class="tblwrap"><table class="tbl small"><thead><tr><th>When</th><th>Event</th><th>Mode</th><th>Result</th><th>Subscription</th></tr></thead><tbody>
      ${events.map(e => html`<tr><td>${when(e.received_at)}</td><td><code>${e.type}</code></td><td>${e.livemode ? 'live' : 'test'}</td><td>${e.result || 'not finished'}</td><td>${e.stripe_subscription_id || '–'}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">No webhook events yet.</p>`}
  </section>`;
  page(req, res, { title: 'Billing', active: 'me', body, head: raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/stats.css">'), back: '/admin', backLabel: 'Admin' });
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
router.post('/api/admin/users/:id/photo/remove', (req, res) => (photos.removePhoto(req.params.id, req.user.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'That player has no photo.' })));
router.post('/api/admin/users/:id/unban', (req, res) => { const r = mod.unbanUser(req.user, req.params.id); res.status(r.ok ? 200 : 400).json(r); });
router.get('/api/admin/audit', (req, res) => res.json({ rows: mod.auditLog(200) }));
// Family links (services/family.js): a link report done, its grown-up banned (every link of theirs ends), a link broken.
router.post('/api/admin/school-requests/:id/:what', (req, res) => {
  const { id, what } = req.params;
  const ok = what === 'reopen' ? schoolRequests.reopen(req.user, id) : schoolRequests.close(req.user, id, what);
  return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'That request is not waiting (or is gone).' });
});
router.post('/api/admin/link-reports/:id/resolve', (req, res) => (family.resolveReport(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
router.post('/api/admin/link-reports/:id/ban', (req, res) => {
  const r = family.reportById(req.params.id); const fam = r && family.familyById(r.family_id);
  if (!fam) return res.status(404).json({ error: 'Report not found.' });
  const out = mod.banUser(req.user, fam.owner_id, `link report ${r.id}`);
  if (!out.ok) return res.status(400).json(out);
  family.resolveReport(req.user, r.id);
  res.json({ ok: true });
});
// School plans (chunk 5): the owner turns an invoice request into a send_invoice subscription, closes one, or marks an
// open invoice paid by check (paid_out_of_band).
const billingTrouble = (res, e) => {
  if (e instanceof stripe.StripeCallError) return res.status(502).json({ error: `Stripe refused or couldn't be reached (${e.type}${e.code ? ` ${e.code}` : ''}).` });
  throw e;
};
const REQUEST_ERRORS = { noRequest: 'That request is not open any more.', noSchool: 'The school is gone.', entitled: 'This school already has a plan (or one waiting for a payment).', noPrice: 'No active Stripe Price has the lookup key oomba_school_seat_yearly.', minSeats: `At least ${config.schoolMinSeats} students.`, noInvoice: 'No open invoice of a school plan has that id.' };
const requestFail = (res, r) => res.status(r.code === 'noRequest' || r.code === 'noInvoice' ? 404 : 409).json({ error: REQUEST_ERRORS[r.code] || r.code, ...(r.field ? { field: r.field } : {}) });
router.post('/api/admin/billing/requests/:id/invoice-subscription', async (req, res) => {
  if (!stripe.billingOn()) return res.status(409).json({ error: 'Billing is off.' });
  const b = req.body || {};
  const seats = b.seats === undefined || b.seats === '' ? undefined : (schoolBilling.seatsFrom(b.seats) ?? -1);
  try {
    const r = await schoolBilling.createInvoiceSubscription(req.user, req.params.id, { seats, exempt: b.exempt === true || b.exempt === '1' });
    if (!r.ok) return requestFail(res, r);
    res.json({ ok: true });
  } catch (e) { billingTrouble(res, e); }
});
router.post('/api/admin/billing/requests/:id/close', (req, res) => {
  const r = schoolBilling.closeRequest(req.user, req.params.id);
  if (!r.ok) return requestFail(res, r);
  res.json({ ok: true });
});
router.post('/api/admin/billing/invoices/:id/paid-by-check', async (req, res) => {
  if (!stripe.billingOn()) return res.status(409).json({ error: 'Billing is off.' });
  try {
    const r = await schoolBilling.markPaidByCheck(req.user, req.params.id);
    if (!r.ok) return requestFail(res, r);
    res.json({ ok: true });
  } catch (e) { billingTrouble(res, e); }
});
// Billing testers (D14): while the Stripe key is a test key, only these grown-up accounts may check out.
router.post('/api/admin/users/:id/billing-tester', (req, res) => {
  const u = q.get('SELECT id, username, account_type FROM users WHERE id=?', String(req.params.id));
  // Grown-ups (family plans) and school staff (school plans: only a school admin can pay).
  if (!u || (u.account_type !== 'grownup' && !isStaff(u))) return res.status(404).json({ error: 'Only grown-up accounts and school staff can be billing testers.' });
  const on = (req.body || {}).on === true || (req.body || {}).on === '1' ? 1 : 0;
  q.run('UPDATE users SET billing_tester=? WHERE id=?', on, u.id);
  audit(req.user.id, 'admin.billing.tester', u.id, { username: u.username, on: !!on });
  res.json({ ok: true });
});
router.post('/api/admin/family/:fid/children/:cid/unlink', (req, res) => (family.adminUnlink(req.user, req.params.fid, req.params.cid) ? res.json({ ok: true }) : res.status(404).json({ error: 'No such link.' })));
