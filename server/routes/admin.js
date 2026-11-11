// Admin panel (role admin only). Internal tool: its text stays English (the page frame follows the admin's language). Non-admins get 404 for every page and API under /admin and /api/admin.
// Tabs: Review queue, Reports, Chat reports, All users (user analytics), Users, Team inbox, Audit log. Every action is audited (services/moderation.js, services/publish.js).
import * as aiBudget from '../services/ai-budget.js';
import * as stats from '../services/stats.js';
import * as photos from '../services/photos.js';
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, timeAgo } from '../views/html.js';
import { page } from '../views/layout.js';
import { ADMIN_BODY, ADMIN_CSS, jumpNav, note as foldNote } from '../views/admin-ui.js';
import { avatar, emptyState, statusLabel, coverArt } from '../views/components.js';
import { requireAdmin, signToken, getUser } from '../auth.js';
import { SANDBOX } from '../services/frame.js';
import { REPORT_REASONS as GAME_REASONS } from './games.js';
import * as mod from '../services/moderation.js';
import * as chat from '../services/chat.js';
import { COMMUNITY_CSS } from './social.js';
import { tEn, tFor, CODES } from '../i18n/index.js';
import { sendSchoolWelcome } from '../services/school-welcome.js';
import { schoolsOf, getSchool, isStaff } from '../services/schools.js';
import * as schoolBilling from '../services/school-billing.js';
import * as teacherPlan from '../services/teacher-plan.js';
import * as family from '../services/family.js';
import * as schoolRequests from '../services/school-requests.js';
import * as funnel from '../services/funnel.js';
import * as billing from '../services/billing.js';
import * as sparks from '../services/sparks.js';
import * as stripe from '../services/stripe.js';
import { readiness } from '../services/billing-ready.js';
import { audit, q } from '../db.js';
import { config } from '../config.js';
import * as webSearch from '../builder/search.js';
import * as liveR from '../services/classlive-results.js';
import * as team from '../services/team.js';
import * as AU from '../services/admin-users.js';
import * as AA from '../services/admin-analytics.js';
import { getUserByName, OFFICIAL } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as email from '../services/email.js';
import * as nudges from '../services/nudges.js';
import * as digest from '../services/digest.js';
import * as alerts from '../services/admin-alerts.js';
import { renderDigest } from '../services/digest-email.js';

export const router = Router();
router.use('/admin', requireAdmin);
router.use('/api/admin', requireAdmin);

const TABS = [['queue', '⏳', 'Review queue'], ['reports', '🚩', 'Reports'], ['chat', '💬', 'Chat reports'], ['links', '🧑‍🧒', 'Link reports'], ['live', '📡', 'Live reports'], ['schoolreq', '🏫', 'School requests'], ['people', '👥', 'All users'], ['users', '👤', 'Users'], ['messages', '📬', 'Team inbox'], ['searches', '🔎', 'Web searches'], ['audit', '📜', 'Audit log']];
// The tab menu, grouped (every tab in exactly one group). On phones it folds under the current tab.
const TAB_GROUPS = [['Moderation', ['queue', 'reports', 'chat', 'links', 'live']], ['People', ['people', 'users', 'messages', 'schoolreq']], ['Logs', ['searches', 'audit']]];
const gameReason = k => (GAME_REASONS.find(r => r[0] === k) || [k, k])[1];
const chatReason = k => (chat.REPORT_REASONS.find(r => r[0] === k) || [k, k])[1];
const when = t => html`<time datetime="${new Date(t).toISOString()}" title="${new Date(t).toISOString().replace('T', ' ').slice(0, 16)} UTC">${timeAgo(t)}</time>`;

function queueTab(req) {
  const items = mod.reviewQueue();
  if (!items.length) return emptyState({ emoji: '✅', title: 'Nothing to review', text: 'Games waiting for a human check show up here.' });
  // What the builder asked for: approving applies exactly this audience (never more).
  const audience = (a, classes) => (a === 'class' ? `🎒 ${classes.length ? classes.join(', ') : 'their classes (none live right now)'}` : a === 'school' ? '🏫 the school' : a === 'family' ? '🏠 their family (the grown-up and their linked children)' : '🌍 everyone');
  return html`<p class="small muted">Every game must be approved here before strangers can find or play it (home, search, explore, the sitemap and /g pages). Approving tells the builder in their Oomba team inbox; so does sending it back.</p>
  <div class="stack">${items.map(({ game: g, version: v, isUpdate, liveNumber, liveFor, safety, review, audience: aud, classes }) => {
    const token = signToken({ v: v.id, g: g.id, u: req.user.id, p: 1 }, 3600);
    const issues = safety.issues || [];
    return html`<article class="panel reviewcard" aria-label="Review ${g.title}">
      <div class="rc-head">
        <div class="rc-cover">${coverArt(g)}</div>
        <div class="rc-info">
          <h2>${g.title}</h2>
          <p class="muted small">by ${g.owner_type === 'grownup' ? html`${g.owner_display} <span class="chip-s">🧑 Grown-up builder</span>` : html`<a href="/u/${g.owner_name}">${g.owner_display}</a>`} (@${g.owner_name}) · version ${v.number} · ${fmtNum(Math.round((v.size || 0) / 1024))} KB · sent ${when(g.updated_at)}</p>
          <p>${isUpdate ? html`<span class="chip-s warn">🔁 Update to a live game</span> Players keep version ${liveNumber} until you approve.` : html`<span class="chip-s">🆕 New game</span>`}${liveFor && !isUpdate ? html` Live now for ${liveFor === 'friends' ? (g.owner_type === 'grownup' ? 'their grown-up connections' : 'their friends') : liveFor} while it waits.` : ''}</p>
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
          <h3>Model pre-check: ${review.verdict ? (review.verdict === 'allowed' ? 'no problems found (a hint, not an approval)' : review.verdict) : 'none'}</h3>
          ${(review.reasons || []).length ? html`<ul class="issues">${review.reasons.map(r => html`<li>${r}</li>`)}</ul>` : ''}
        </div>
        <div class="rc-decide">
          <form class="decide" data-game="${g.id}" novalidate>
            <div class="field"><label for="reason-${g.id}">Reason (if you send it back)</label>
              <select class="input" id="reason-${g.id}" name="reason"><option value="">No preset: use my note</option>${chat.REVIEW_REASONS.map(k => html`<option value="${k}">${tEn(`review.reasons.${k}`)}</option>`)}</select>
              <span class="hint">Presets are kid-friendly and shown in the builder's own language.</span></div>
            <div class="field"><label for="note-${g.id}">Note for the builder</label>
              <textarea class="input" id="note-${g.id}" name="note" maxlength="500" placeholder="Say what is great, or what to change (shown as you type it)"></textarea></div>
            <div class="row aacts"><button class="btn btn-primary" type="button" data-act="approve" data-id="${g.id}">✅ Approve</button><button class="btn btn-danger" type="button" data-act="reject" data-id="${g.id}">✏️ Send back</button></div>
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
        <p class="small muted" style="margin:0">by @${g.owner_name}${g.owner_type === 'grownup' ? ' (grown-up builder)' : ''} · ${statusLabel(g, tEn)}${g.hidden_reason ? ` (hidden by ${g.hidden_reason})` : ''}</p>
        <p style="margin:6px 0"><b>${g.open_reports}</b> open report${g.open_reports === 1 ? '' : 's'}${g.last_report ? html` · last ${when(g.last_report)}` : ''}</p>
        ${g.reasons.length ? html`<div class="chips">${g.reasons.map(r => html`<span class="chip-s">${gameReason(r.reason)} × ${r.n}</span>`)}</div>` : ''}
        ${g.details.length ? html`<ul class="small">${g.details.map(d => html`<li>“${d}”</li>`)}</ul>` : ''}
      </div>
    </div>
    <div class="row aacts" style="margin-top:12px">
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
    <div class="row aacts">
      <button class="btn" type="button" data-act="hide" data-id="${r.id}">🙈 Hide message</button>
      <button class="btn" type="button" data-act="dismiss" data-id="${r.id}">👍 Dismiss</button>
      ${sender && !sender.banned && sender.role !== 'admin' && sender.username !== OFFICIAL ? html`<button class="btn btn-danger" type="button" data-act="bansender" data-id="${r.id}" data-name="${sender.username}">⛔ Ban sender</button>` : ''}
    </div>
  </article>`)}</div>`;
}

/** Children's Reports on a grown-up's link request or link (services/family.js). The report itself already ended the
 *  link; here the admin looks at the grown-up account, bans it if needed, and marks the report done. */
function linksTab() {
  const list = family.openReports();
  if (!list.length) return emptyState({ emoji: '🧑‍🧒', title: 'No link reports', text: 'When a child reports a grown-up who asked to link to their account, it shows up here. The report already ended any link.' });
  return html`<div class="stack">${list.map(r => html`<article class="panel">
    <p class="row small" style="gap:6px"><span class="chip-s bad">Reported</span>${r.parent_made ? html` <span class="chip-s warn">made account</span>` : ''} ${when(r.created_at)}</p>
    <p class="small" style="margin:0">Child: ${avatar({ id: r.child_id, avatar: r.child_avatar, color: r.child_color, photo_at: r.child_photo_at }, 26)} <b>${r.child_display}</b> <a href="/admin?tab=users&amp;username=${encodeURIComponent(r.child_name)}">@${r.child_name}</a>${r.child_banned ? ' · banned' : ''}</p>
    <p class="small">Grown-up: ${r.owner_name ? html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(r.owner_name)}">@${r.owner_name}</a> · account made ${when(r.owner_created)}${r.owner_banned ? ' · banned' : ''}` : 'account gone'} · ${r.family_reports} report${r.family_reports === 1 ? '' : 's'} against this family${r.made_count ? html` · ${r.made_count} account${r.made_count === 1 ? '' : 's'} made, ${r.code_linked_count} linked by code` : ''}</p>
    <div class="row aacts">
      <button class="btn" type="button" data-act="resolvelink" data-id="${r.id}">👍 Done</button>
      ${r.owner_id && !r.owner_banned ? html`<button class="btn btn-danger" type="button" data-act="banlink" data-id="${r.id}" data-name="${r.owner_name}">⛔ Ban grown-up</button>` : ''}
    </div>
  </article>`)}</div>`;
}
/** Reports from Oomba Live players (fixed reasons only; never who sent them): the host, the game or question set, and
 *  the questions in the set (classlive-results.js). The admin looks at the game (hide it from Reports if needed) or the
 *  host account, then marks it done. */
const LIVE_REASON = { scary: 'Something scary', mean: 'Something mean', personal: 'Asks for personal information', other: 'Something else' };
function liveTab() {
  const list = liveR.openReports(100);
  if (!list.length) return emptyState({ emoji: '📡', title: 'No live reports', text: 'When a player in a live class game presses Report, it shows up here (the reason only, never who reported).' });
  return html`<div class="stack">${list.map(r => { let items = []; try { items = JSON.parse(r.items || '[]'); } catch { items = []; }
    return html`<article class="panel">
    <p class="row small" style="gap:6px"><span class="chip-s bad">${LIVE_REASON[r.reason] || r.reason}</span> ${when(r.created_at)}</p>
    <p class="small" style="margin:0">${r.game_slug ? html`Game: <a href="/g/${r.game_slug}">${r.game_title}</a>` : 'Built-in question mode'}${r.host_name ? html` · Host: <a href="/admin?tab=users&amp;username=${encodeURIComponent(r.host_name)}">@${r.host_name}</a>` : ' · Host: deleted'}</p>
    ${items.length ? html`<details class="small asum"><summary>${items.length} question${items.length === 1 ? '' : 's'} in the set</summary><ol>${items.slice(0, 50).map(q => html`<li dir="auto">${typeof q === 'string' ? q : q.q}</li>`)}</ol></details>` : ''}
    <div class="row aacts"><button class="btn" type="button" data-act="resolvelive" data-id="${r.id}">👍 Done</button></div>
  </article>`; })}</div>`;
}
const REQUEST_ROLE = { teacher: 'Teacher', leader: 'Principal / head', it: 'IT lead', district: 'District / group', other: 'Other' };
/** "Set up my school" requests from /teachers (services/school-requests.js): open ones first, oldest on top, then the
 *  latest closed. "Create school" opens the usual Add a school form with the name filled in; adding it closes the
 *  request. The site sends no email: reply from your own mail. */
function schoolRequestsTab() {
  const { open, closed } = schoolRequests.queue();
  const info = r => html`${r.school_slug && r.user_id ? html`<p class="small" style="margin:0 0 4px">✅ Signed up and already using it: <a href="/school/${r.school_slug}?tab=people">${r.linked_school}</a>${r.username ? html` · <bdi>@${r.username}</bdi>` : ''}</p>` : ''}<p class="small" style="margin:0">${r.contact_name ? html`<b>${r.contact_name}</b> · ` : ''}${REQUEST_ROLE[r.role] || r.role} · <a href="mailto:${r.email}" dir="ltr">${r.email}</a>${r.students ? html` · about ${int(r.students)} students` : ' · made on the sign-up'}${r.country ? html` · ${r.country}` : ''}${r.locale ? html` · page in <code>${r.locale}</code>` : ''}</p>`;
  const act = (r, what, label, cls = 'btn', confirm = '') => html`<form data-api="/api/admin/school-requests/${r.id}/${what}" data-reload ${confirm ? html`data-confirm="${confirm}"` : ''}><button class="${cls}" type="submit">${label}</button></form>`;
  const openList = open.length ? html`<div class="stack">${open.map(r => html`<article class="panel" aria-label="School request: ${r.school_name}">
      <p class="row small" style="gap:6px"><span class="chip-s warn">Waiting</span> sent ${when(r.created_at)}</p>
      <h2 style="margin:0 0 6px">${r.school_name}</h2>
      ${info(r)}
      <div class="row aacts" style="margin-top:12px">
        ${r.school_slug && r.user_id ? html`${act(r, 'approve', '✅ Looks good: send the welcome', 'btn btn-primary')}<a class="btn" href="/school/${r.school_slug}?tab=people">🏫 Open the school</a>`
          : html`<a class="btn btn-primary" href="/admin/schools/setup?request=${encodeURIComponent(r.id)}">🏫 Set up this school</a>`}
        ${act(r, 'declined', 'Decline', 'btn', `Decline the request from ${r.school_name}? Remember to reply by email.`)}
        ${act(r, 'done', 'Close without setting up', 'btn btn-sm', `Close the request from ${r.school_name} without setting it up here? Use this only if you set it up another way.`)}
      </div></article>`)}</div>`
    : emptyState({ emoji: '🏫', title: 'No school requests waiting', text: 'When a teacher fills in "Set up my school" on /teachers, it shows up here. The page promises an answer within 1 school day.' });
  return html`${openList}
    <p class="small muted">"Set up this school" makes the school and its admin account and emails them a welcome (how to sign in, the setup checklist, how teachers start); their replies come to you. A decline sends nothing: reply from your own mail. Requests are deleted 1 year after they are closed.</p>
    ${closed.length ? html`<h2 class="stats-h">Recently closed</h2><div class="panel tblwrap"><table class="tbl atable"><thead><tr><th>School</th><th>Answer</th><th>Closed</th><th></th></tr></thead><tbody>
      ${closed.map(r => html`<tr><td><b>${r.school_name}</b> <span class="small muted">· <span dir="ltr">${r.email}</span></span></td>
        <td data-label="Answer">${r.status === 'done' ? (r.school_slug ? html`✅ <a href="/school/${r.school_slug}?tab=people">${r.linked_school}</a> <a class="btn btn-sm" href="/admin/schools/setup?request=${encodeURIComponent(r.id)}">✉️ Welcome email</a>` : html`✅ done <a class="btn btn-sm btn-primary" href="/admin/schools/setup?request=${encodeURIComponent(r.id)}">🏫 Set up this school</a>`) : '✖️ declined'}</td>
        <td data-label="Closed">${when(r.closed_at)}</td><td class="acell">${act(r, 'reopen', 'Reopen', 'btn btn-sm')}</td></tr>`)}
    </tbody></table></div>` : ''}`;
}
/** The Family row of the users tab: a child's family, or a grown-up's children, each with Break link. */
function familyCell(u) {
  const l = family.adminLinks(u.id);
  const brk = (fid, cid, label) => html` <button class="btn btn-sm" type="button" data-act="unlinkfamily" data-id="${fid}" data-child="${cid}" data-name="${label}">Break link</button>`;
  const st = r => (r.status === 'pending' ? 'asked' : 'linked');
  const look = name => html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(name)}">@${name}</a>`;
  // Parent-made accounts (services/family.js createChildAccount): who made this one, kept after an unlink or a deletion.
  const madeBy = l.madeBy ? html`<div class="made-by">Made by grown-up ${l.madeBy.maker_name ? look(l.madeBy.maker_name) : 'account gone'} (#${l.madeBy.made_by}) on ${new Date(l.madeBy.made_at).toISOString().slice(0, 10)}</div>` : '';
  if (u.account_type === 'grownup') {
    const made = l.made.length ? html`<div class="made-list">Accounts this family made: ${l.made.length} (in the last 365 days: ${l.madeYear})
      ${l.made.map(m => html`<div>· ${m.status === 'deleted' ? html`deleted account (#${m.id})` : look(m.username)} · ${m.status}${['left', 'reported', 'relinked'].includes(m.status) ? ' · not paused with this grown-up: review on its own' : ''}</div>`)}
      <div>Linked by code: ${l.codeLinked}.</div>
      ${u.banned && l.made.some(m => m.pausable) ? html`<button class="btn btn-danger" type="button" data-act="pausemade" data-id="${u.id}" data-name="${u.username}">⛔ Pause all accounts this grown-up made</button>` : ''}</div>` : '';
    return html`Grown-up account${l.children.length ? html`${l.children.map(c => html`<div class="famline"><span>${st(c)}: ${look(c.child_name)}</span>${brk(c.family_id, c.child_id, c.child_name)}</div>`)}` : ' · no children'}${made}`;
  }
  if (!l.asChild.length) return madeBy || 'none';
  return html`${madeBy}${l.asChild.map(r => html`<div class="famline"><span>${st(r)} with grown-up ${look(r.owner_name)}</span>${brk(r.family_id, r.child_id, u.username)}</div>`)}`;
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
    <p class="small muted" style="margin:8px 0 0">Exact usernames here. To browse everyone, with what they play and build, use <a href="/admin?tab=people">All users</a>.</p>
  </section>
  ${name && !u ? html`<p class="notice warn" style="margin-top:16px">No user called “${name}”.</p>` : ''}
  ${u ? userPanel(u) : ''}`;
}
function userPanel(u) {
  const games = AU.userGames(u.id), audits = AU.userAudit(u.id);
  return html`<section class="panel upanel" style="margin-top:16px">
    <div class="row uhead">${avatar(u, 56)}<div style="flex:1;min-width:180px"><h2 style="margin:0">${u.display_name}</h2><div class="muted">@${u.username}${u.is_guest ? ' · guest' : ''}</div></div>
      ${u.banned ? html`<span class="chip-s bad">⛔ Banned</span>` : html`<span class="chip-s">✅ Active</span>`}</div>
    <div class="row aacts uacts">${u.is_guest ? '' : html`<a class="btn btn-primary" href="/admin/messages/${encodeURIComponent(u.username)}"><span aria-hidden="true">📬</span> Message</a>`}${u.account_type === 'grownup' ? '' : html`<a class="btn" href="/u/${u.username}">View profile</a>`}
      ${u.photo_at ? html`<button class="btn" type="button" data-act="unphoto" data-id="${u.id}" data-name="${u.username}">🖼️ Remove photo</button>` : ''}
      ${u.role === 'admin' ? '' : u.banned ? html`<button class="btn" type="button" data-act="unban" data-id="${u.id}" data-name="${u.username}">Unban</button>` : html`<button class="btn btn-danger" type="button" data-act="ban" data-id="${u.id}" data-name="${u.username}">⛔ Ban</button>`}</div>
    ${jumpNav([['u-details', 'Details'], u.is_guest ? null : ['u-activity', '📈 Activity'], games.length ? ['u-games', `Games (${games.length})`] : null, audits.length ? ['u-audit', 'Audit log'] : null])}
    <div class="tblwrap" id="u-details"><table class="tbl afacts" style="margin-top:12px"><tbody>
      <tr><th scope="row">Account type</th><td>${AU.TYPE_LABEL[AU.accountTypeOf(u.id)]} · ${AU.METHOD_LABEL[AU.signupMethod(u.id)]}</td></tr>
      <tr><th scope="row">Site role</th><td>${u.role}</td></tr>
      <tr><th scope="row">Schools</th><td>${schoolsCell(u)}</td></tr>
      <tr><th scope="row">Family</th><td>${familyCell(u)}</td></tr>
      ${u.account_type === 'grownup' || isStaff(u) ? html`<tr><th scope="row">Billing tester</th><td><div class="famline"><span>${u.billing_tester ? 'yes: may check out while the Stripe key is a test key' : 'no'}</span>
        <button class="btn btn-sm" type="button" data-act="tester" data-id="${u.id}" data-on="${u.billing_tester ? '0' : '1'}">${u.billing_tester ? 'Remove tester' : 'Make billing tester'}</button></div></td></tr>` : ''}
      <tr><th scope="row">Created</th><td>${new Date(u.created_at).toISOString().slice(0, 10)} (${timeAgo(u.created_at)})</td></tr>
      <tr><th scope="row">Last seen</th><td>${u.last_seen ? timeAgo(u.last_seen) : 'never'}</td></tr>
      <tr><th scope="row">Games</th><td>${u.games}</td></tr>
      <tr><th scope="row">Friends</th><td>${u.friends}</td></tr>
      <tr><th scope="row">Chat</th><td>${u.chat_enabled ? 'on' : 'off'} · ${u.chatReports} message report${u.chatReports === 1 ? '' : 's'} against them</td></tr>
      <tr><th scope="row">Reports</th><td>${(r => html`${r.againstGames} against their games · ${r.made} made by them`)(AU.reportCounts(u.id))}</td></tr>
    </tbody></table></div>
    ${u.is_guest ? '' : userActivityPanel(u)}
    ${userGamesPanel(games)}
    ${userAuditPanel(u, audits)}
  </section>`;
}

const VIS_LABEL = { private: 'Only them', family: 'Family', friends: 'Friends', class: 'Classes', school: 'School', public: 'Everyone' };
function userGamesPanel(list) {
  if (!list.length) return '';
  return html`<h3 style="margin:16px 0 6px" id="u-games">Games (${list.length})</h3><div class="tblwrap"><table class="tbl small atable"><thead><tr><th>Game</th><th>Status</th><th>Who can play</th><th>Plays</th><th>Reports</th></tr></thead><tbody>
    ${list.map(g => html`<tr><td><a href="/g/${g.slug}">${g.icon} ${g.title}</a></td><td data-label="Status">${statusLabel(g, tEn)}${g.pending_version_id ? html` <span class="chip-s warn">⏳ waiting for ${g.pending_visibility || 'public'}</span>` : ''}</td>
      <td data-label="Who can play">${g.status === 'published' ? VIS_LABEL[g.visibility] || g.visibility : '–'}</td><td data-label="Plays">${int(g.plays)}</td><td data-label="Reports">${g.reports}</td></tr>`)}
  </tbody></table></div>`;
}
function userAuditPanel(u, rows) {
  if (!rows.length) return '';
  return html`<details style="margin-top:12px" id="u-audit"><summary>Audit log for @${u.username} (${rows.length} latest)</summary><div class="tblwrap"><table class="tbl small audit atable"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td data-label="When">${when(r.created_at)}</td><td data-label="Who">${r.actor_name ? '@' + r.actor_name : 'system'}</td><td data-label="What"><code>${r.action}</code></td></tr>`)}
  </tbody></table></div></details>`;
}

/** All users with what they did (services/admin-analytics.js): every column sorts, filters and quick views are plain GET
 *  links, so the page works without JavaScript. ?tab=newusers (the old New users tab) opens it on the New view. */
function peopleQuery(req) {
  const qs = { ...req.query };
  if (req.query.tab === 'newusers' && !qs.joined && !qs.from && !qs.to) qs.joined = Object.hasOwn(AA.JOINED, qs.range) ? qs.range : '30d';
  return AA.cleanFilters(qs);
}
const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
/** The filters as a query string, defaults left out (so links stay short). */
const peopleParams = f => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== AA.DEFAULTS[k] && !(k === 'dir' && v === AA.SORTS[f.sort][1])));
const peopleLink = f => `/admin?${qs({ tab: 'people', ...peopleParams(f) })}`;
function sparkline(days) {
  const max = Math.max(1, ...days.map(d => d.n)); const w = 300, h = 48, step = w / Math.max(1, days.length - 1);
  const pts = days.map((d, i) => `${(i * step).toFixed(1)},${(h - 4 - (d.n / max) * (h - 8)).toFixed(1)}`).join(' ');
  const total = days.reduce((a, d) => a + d.n, 0);
  return html`<figure class="panel nu-spark"><figcaption><b>Sign-ups per day</b> <span class="small muted">last ${days.length} days · ${int(total)} in all · busiest day ${int(max === 1 && !total ? 0 : max)}</span></figcaption>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Sign-ups per day for the last ${days.length} days, ${int(total)} in all, ${int(days[days.length - 1].n)} today">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="xaxis" aria-hidden="true"><span>${shortDay(days[0].day)}</span><span>today: ${int(days[days.length - 1].n)}</span></div>
    <details><summary>Show as a table</summary><div class="tblwrap"><table class="tbl small"><thead><tr><th>Day</th><th>Sign-ups</th></tr></thead><tbody>${days.slice().reverse().map(d => html`<tr><td>${shortDay(d.day)}</td><td>${int(d.n)}</td></tr>`)}</tbody></table></div></details>
  </figure>`;
}
const ymdhm = t => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
const ago = (t, none = 'never') => (t ? html`<time datetime="${new Date(t).toISOString()}" title="${ymdhm(t)} UTC">${timeAgo(t)}</time>` : none);
const linkedLine = u => (u.type === 'grownup' ? (u.children ? `${u.children} child${u.children === 1 ? '' : 'ren'} linked` : '') : [u.parent ? `grown-up @${u.parent}` : '', u.schools || ''].filter(Boolean).join(' · '));
const dirWords = f => (['joined', 'login', 'active'].includes(f.sort) ? (f.dir === 'asc' ? 'oldest first' : 'newest first') : f.sort === 'name' || f.sort === 'type' ? (f.dir === 'asc' ? 'A to Z' : 'Z to A') : f.dir === 'asc' ? 'lowest first' : 'highest first');
const COLS = [['name', 'Account'], ['type', 'Type'], ['joined', 'Joined'], ['login', 'Last login'], ['active', 'Last active'], ['days', 'Days active'], ['plays', 'Played'], ['built', 'Built'], ['ai', 'AI messages'], ['courses', 'Course steps'], ['live', 'Live games'], ['popularity', 'Popularity'], ['status', 'Status']];
function peopleTab(req) {
  const f = peopleQuery(req);
  const r = AA.listUsers(f);
  const c = AU.signupCounts(), act = AA.activeCounts();
  const accounts = q.get('SELECT COUNT(*) n FROM users WHERE is_guest=0 AND username<>?', OFFICIAL).n;
  const link = over => peopleLink({ ...f, page: 1, ...over });
  const sortLink = k => link({ sort: k, dir: f.sort === k ? (f.dir === 'asc' ? 'desc' : 'asc') : AA.SORTS[k][1] });
  const th = ([k, label]) => {
    const on = f.sort === k || (k === 'plays' && f.sort === 'distinct') || (k === 'built' && f.sort === 'public');
    return html`<th scope="col" ${on ? raw(`aria-sort="${f.dir === 'asc' ? 'ascending' : 'descending'}"`) : ''}><a class="sorth" href="${sortLink(k)}">${label}${on ? html` <span aria-hidden="true">${f.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</a></th>`;
  };
  const sel = (id, name, label, value, opts) => html`<div class="field"><label for="${id}">${label}</label><select class="input" id="${id}" name="${name}">${opts.map(([v, l]) => html`<option value="${v}" ${value === v ? raw('selected') : ''}>${l}</option>`)}</select></div>`;
  const desc = [f.type ? AU.TYPE_LABEL[f.type] : '', f.active ? AA.ACTIVE[f.active].toLowerCase() : '', f.from || f.to ? `joined ${f.from || '…'} to ${f.to || 'today'}` : f.joined !== 'all' ? `joined ${AA.JOINED[f.joined].toLowerCase()}` : '', f.search ? `matching “${f.search}”` : ''].filter(Boolean);
  const everyone = !Object.keys(peopleParams({ ...f, page: 1 })).length;
  // The extra filters fold away on phones; they start open when one of them is in use.
  const filtered = Boolean(f.type || f.active || f.from || f.to || f.joined !== AA.DEFAULTS.joined);
  return html`
  <div class="kpis">
    ${tile('👥 Accounts', int(accounts), 'real accounts (no guests)')}
    ${tile('🟢 Active today', int(act.dau), `${int(act.wau)} this week · ${int(act.mau)} in 30 days`)}
    ${tile('🆕 New, last 7 days', int(c.week), `${int(c.today)} today`)}
    ${tile('🗓️ New, last 30 days', int(c.month), Object.entries(c.byType).filter(([, n]) => n).map(([k, n]) => `${int(n)} ${AU.TYPE_LABEL[k].toLowerCase()}`).join(' · ') || 'none yet')}
  </div>
  ${sparkline(AU.signupsByDay(30))}
  <form class="panel nu-form" method="get" action="/admin" role="search">
    <input type="hidden" name="tab" value="people">
    <div class="nu-top"><div class="field"><label for="nu-q">Search</label><input class="input" id="nu-q" name="q" value="${f.search}" placeholder="Username or display name" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <div class="row nu-go"><button class="btn btn-primary" type="submit">Show</button><a class="btn" href="/admin/users.csv?${qs(peopleParams({ ...f, page: 1 }))}" download><span aria-hidden="true">⬇️</span> CSV</a></div></div>
    <details class="nu-more" data-open-wide ${filtered ? raw('open') : ''}><summary><span>Filters &amp; sort <span class="small muted nu-now">· ${desc.length ? `${desc.join(' · ')} · ` : ''}sorted by ${AA.SORTS[f.sort][2].toLowerCase()}, ${dirWords(f)}</span></span></summary><div class="nu-filters">
    ${sel('nu-type', 'type', 'Account type', f.type, [['', 'All types'], ...AU.TYPES.map(k => [k, AU.TYPE_LABEL[k]])])}
    ${sel('nu-active', 'active', 'Active', f.active, Object.entries(AA.ACTIVE))}
    ${sel('nu-joined', 'joined', 'Joined', f.joined, Object.entries(AA.JOINED))}
    <div class="field"><label for="nu-from">Joined from</label><input class="input" type="date" id="nu-from" name="from" value="${f.from}"></div>
    <div class="field"><label for="nu-to">Joined until</label><input class="input" type="date" id="nu-to" name="to" value="${f.to}"></div>
    ${sel('nu-sort', 'sort', 'Sort by', f.sort, Object.entries(AA.SORTS).map(([k, v]) => [k, v[2]]))}
    ${sel('nu-dir', 'dir', 'Order', f.dir, [['desc', '↓ Descending'], ['asc', '↑ Ascending']])}
    </div></details>
  </form>
  <nav class="chips nu-quick" aria-label="Quick views"><a class="chip ${everyone ? 'on' : ''}" href="/admin?tab=people" ${everyone ? raw('aria-current="true"') : ''}>Everyone</a>${Object.entries(AA.QUICK).map(([k, v]) => { const on = AA.quickOn(f, k); return html`<a class="chip ${on ? 'on' : ''}" href="${peopleLink({ ...AA.DEFAULTS, ...v.set })}" ${on ? raw('aria-current="true"') : ''}>${v.label}</a>`; })}</nav>
  <p class="small muted">${int(r.total)} account${r.total === 1 ? '' : 's'}${desc.length ? ` · ${desc.join(' · ')}` : ''} · sorted by ${AA.SORTS[f.sort][2].toLowerCase()}, ${dirWords(f)}. Guests are not listed. Kids show only their names and counts. Days are UTC; “days active” counts the last 30.</p>
  ${r.rows.length ? html`<div class="panel tblwrap"><table class="tbl rtable nu-table au-table"><thead><tr>${COLS.map(th)}</tr></thead><tbody>
    ${r.rows.map(u => html`<tr>
      <td><a class="nu-who" href="/admin?tab=users&amp;username=${encodeURIComponent(u.username)}">${avatar(u, 32)}<span><b dir="auto">${u.display_name}</b><br><span class="small muted">@${u.username}</span></span></a></td>
      <td data-label="Type" class="au-type"><span class="au-nw">${AU.TYPE_LABEL[u.type]}</span><span class="au-sub small muted">${[AU.METHOD_LABEL[u.method], linkedLine(u)].filter(Boolean).join(' · ')}</span></td>
      <td data-label="Joined"><time datetime="${new Date(u.created_at).toISOString()}" title="${ymdhm(u.created_at)} UTC">${new Date(u.created_at).toISOString().slice(0, 10)}</time></td>
      <td data-label="Last login">${ago(u.last_login_at)}</td>
      <td data-label="Last active">${u.never_active ? 'never' : ago(u.last_seen)}</td>
      <td data-label="Days active">${int(u.days30)}</td>
      <td data-label="Played"><span class="au-l">${int(u.plays)} play${u.plays === 1 ? '' : 's'}</span> <span class="au-l small muted">${int(u.distinct_games)} game${u.distinct_games === 1 ? '' : 's'}</span></td>
      <td data-label="Built"><span class="au-l">${int(u.games_made)} game${u.games_made === 1 ? '' : 's'}</span> <span class="au-l small muted">${int(u.games_public)} public</span>${u.games_waiting ? html` <span class="chip-s warn">${u.games_waiting} waiting</span>` : ''}</td>
      <td data-label="AI messages">${int(u.ai_messages)}</td>
      <td data-label="Course steps">${int(u.course_steps)}</td>
      <td data-label="Live games">${int(u.live_joined)}</td>
      <td data-label="Plays of their games" title="Plays of the games they built">${int(u.plays_of_games)}</td>
      <td data-label="Status" class="au-status">${u.banned ? html`<span class="chip-s bad">⛔ Suspended</span>` : html`<span class="chip-s">✅ Active</span>`}</td>
    </tr>`)}
  </tbody></table></div>
  ${r.pages > 1 ? html`<nav class="row nu-pages" aria-label="Pages">${r.page > 1 ? html`<a class="btn" href="${link({ page: r.page - 1 })}" rel="prev">← Previous</a>` : ''}<span class="small muted">Page ${r.page} of ${r.pages}</span>${r.page < r.pages ? html`<a class="btn" href="${link({ page: r.page + 1 })}" rel="next">Next →</a>` : ''}</nav>` : ''}`
    : emptyState({ emoji: '👥', title: 'No accounts match', text: 'Try another filter or a longer date range.' })}`;
}

/** One person's activity on the Users tab (services/admin-analytics.js userAnalytics): totals, 30 days of plays, Builder
 *  messages and active days, the games they play most, course progress and a timeline. Counts and titles only. */
function dayStrip(daily) {
  const n = daily.filter(d => d.active).length;
  return html`<figure class="chart panel"><figcaption><h3>Days active</h3><span class="chart-sum"><b>${n}</b> of ${daily.length} days</span></figcaption>
    <div class="dstrip" role="img" aria-label="Active on ${n} of the last ${daily.length} days">${daily.map(d => html`<span class="${d.active ? 'on' : ''}" title="${shortDay(d.day)}: ${d.active ? 'active' : 'not active'}"></span>`)}</div>
    <div class="xaxis dstrip-x" aria-hidden="true"><span>${shortDay(daily[0].day)}</span><span>${shortDay(daily[daily.length - 1].day)}</span></div>
    <details><summary>Show as a list</summary><p class="small">${daily.filter(d => d.active).map(d => shortDay(d.day)).join(', ') || 'No active days.'}</p></details>
  </figure>`;
}
const TL_ICON = { joined: '🐣', signin: '🔑', built: '🛠️', published: '🚀', played: '🎮', ai: '🤖', course: '📚', live: '📡' };
const HOW = { password: 'password', google: 'Google', switch: 'switched in by their grown-up', signup: 'sign-up', '': 'sign-in' };
function userActivityPanel(u) {
  const a = AA.userAnalytics(u.id);
  if (!a) return '';
  const t = a.totals;
  return html`<section class="ua" id="u-activity" aria-labelledby="ua-h"><h3 id="ua-h" class="stats-h">📈 Activity</h3>
    <div class="kpis">
      ${tile('🔑 Last login', a.lastLogin ? timeAgo(a.lastLogin) : 'never', a.lastLogin ? `${ymdhm(a.lastLogin)} UTC${a.lastLoginMethod !== null ? ` · ${HOW[a.lastLoginMethod] || 'sign-in'}` : ''}` : 'no sign-in recorded')}
      ${tile('👣 Last active', a.never ? 'never' : timeAgo(a.lastSeen), a.never ? '' : `${ymdhm(a.lastSeen)} UTC`)}
      ${tile('📅 Days active', `${int(t.days30)} / 30`, `${int(t.daysAll)} day${t.daysAll === 1 ? '' : 's'} recorded · ${int(t.signIns30)} sign-in${t.signIns30 === 1 ? '' : 's'} in 30 days`)}
      ${tile('🎮 Games played', int(t.plays), `${int(t.distinctGames)} different · ${int(t.minutes)} min · ${int(t.plays30)} in 30 days`)}
      ${tile('🛠️ Games built', int(t.built), `${int(t.live)} live · ${int(t.public)} public${t.waiting ? ` · ${t.waiting} waiting` : ''}`)}
      ${tile('⭐ Plays of their games', int(t.playsOfGames))}
      ${tile('🤖 AI Builder messages', int(t.ai), `${int(t.ai30)} in the last 30 days`)}
      ${tile('📚 Course steps done', int(t.courseSteps), a.courses.length ? a.courses.map(c => `${c.name} ${c.done}${c.total ? `/${c.total}` : ''}`).join(' · ') : 'no course started')}
      ${tile('📡 Live games', int(t.liveJoined), `joined · ${int(t.liveHosted)} hosted`)}
    </div>
    <p class="small muted ua-joined">Joined ${ymdhm(a.joined)} UTC (${timeAgo(a.joined)}) · ${AU.METHOD_LABEL[a.method]}. Days are UTC.</p>
    <details class="asection" open><summary>Charts, last 30 days</summary><div class="charts">
      ${barChart({ title: 'Plays per day', rows: a.daily, key: 'plays', unit: 'plays' })}
      ${barChart({ title: 'AI Builder messages per day', rows: a.daily, key: 'ai', unit: 'messages' })}
      ${dayStrip(a.daily)}
    </div></details>
    <div class="stats-grid">
      <section class="panel"><h2>🎮 Games they play most</h2>
        ${a.topPlayed.length ? html`<div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Game</th><th>Plays</th><th>Minutes</th><th>Last</th></tr></thead><tbody>
          ${a.topPlayed.map(g => html`<tr><td><a href="/g/${g.slug}">${g.icon} ${g.title}</a></td><td data-label="Plays">${int(g.plays)}</td><td data-label="Minutes">${int(g.minutes)}</td><td data-label="Last">${ago(g.last)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No plays yet.</p>`}
      </section>
      <section class="panel"><h2>📚 Courses</h2>
        ${a.courses.length ? html`<div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Course</th><th>Done</th><th>Band</th><th>Last</th></tr></thead><tbody>
          ${a.courses.map(c => html`<tr><td>${c.emoji} ${c.name}</td><td data-label="Done">${int(c.done)}${c.total ? ` of ${int(c.total)}` : ''} <span class="small muted">(${int(c.touched)} started)</span></td><td data-label="Band">${c.band || '–'}</td><td data-label="Last">${ago(c.last > 1 ? c.last : 0, '–')}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No course started (CS Quest, Cyber Defenders, Number Quest).</p>`}
      </section>
    </div>
    <section class="panel ua-tl"><h2>🕒 Recent activity</h2>
      <ol class="plain timeline">${a.timeline.map(e => html`<li><span class="tl-i" aria-hidden="true">${TL_ICON[e.kind] || '•'}</span><span class="tl-t">${e.text}${e.game ? html`: <a href="/g/${e.game.slug}">${e.game.icon} ${e.game.title}</a>` : ''}</span>
        <span class="tl-w small muted">${e.day ? shortDay(e.day) : html`<time datetime="${new Date(e.at).toISOString()}" title="${ymdhm(e.at)} UTC">${timeAgo(e.at)}</time>`}</span></li>`)}</ol>
      <p class="small muted">Sign-ins, games started and published, plays, AI Builder messages per day, course checks and wins, live games. Never chat, Builder requests or IPs. Sign-ins and active days are kept ${AA.KEEP_DAYS} days.</p>
    </section>
  </section>`;
}

/** The Oomba team inbox (services/team.js): people the team wrote to or who wrote back, and announcements. */
const AUDIENCE_LABEL = { all: 'Everyone with an account', kids: 'Kids', grownups: 'Grown-ups (parents)', staff: 'Teachers and school staff', school: 'One school' };
// The three automatic welcomes (services/team.js): who gets each and when, in the admin's words.
const WELCOME_PANELS = [
  { audience: 'kid', title: 'Welcome message for new kids', who: 'new kids', when: 'Sent to every new kid account the first time it signs in, and copied to their grown-up if they have one.' },
  { audience: 'grownup', title: 'Welcome message for new parents', who: 'new parents', when: 'Sent to every new grown-up (parent) account the first time it signs in. They read it on their Family page (📬 link) at /chat/OombaAcademy. A grown-up who later has a school set up also gets the teachers’ welcome.' },
  { audience: 'teacher', title: 'Welcome message for new teachers and school staff', who: 'new teachers and school staff', when: 'Sent when an account becomes a teacher or school admin (added on a school’s People tab, a staff login card, a Google staff invite, a role change), when a grown-up’s “Set up my school” request is marked done, or at the first sign-in of someone who signed up after choosing “I’m a teacher”. A kid welcome sent to them before is taken back. They read it in their chat inbox.' },
];
const welcomeForm = (w, s) => html`<details class="asection welcomefold" id="wel-${w.audience}" data-open-wide><summary><span id="wel-${w.audience}-h">${w.title}</span> <span class="chip-s ${s.on ? 'wel-on' : 'warn'}">${s.on ? 'On' : 'Off'}</span></summary>
  <form class="stack welcomeform" data-api="/api/admin/team/welcome" data-reload data-toast="Welcome message saved." aria-labelledby="wel-${w.audience}-h" novalidate>
    <p class="small muted" style="margin:0">${w.when}</p>
    <input type="hidden" name="audience" value="${w.audience}">
    <label class="checkline"><input type="checkbox" name="on" value="1" ${s.on ? raw('checked') : ''}> <span>Send it to ${w.who}</span></label>
    <div class="field"><label for="wel-${w.audience}-text">Message</label><textarea class="input" id="wel-${w.audience}-text" name="text" maxlength="${team.MAX_TEAM_LEN}" rows="14">${s.text}</textarea></div>
    <div class="row"><button class="btn btn-primary" type="submit">Save</button></div>
  </form></details>`;
function messagesTab(req) {
  const threads = team.adminThreads();
  const lim = team.announceLimits();
  const schools = q.all('SELECT id, name FROM schools WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE LIMIT 500');
  const recent = team.recentAnnouncements(10);
  const unread = threads.reduce((a, th) => a + (th.unread || 0), 0);
  // Conversations first (what the tab's badge counts), then announcements, then the three automatic welcomes.
  return html`
  ${jumpNav([['conv-h', '💬 Conversations', unread], ['ann-h', '📣 Announce'], ['wel-h', '👋 Welcome messages']])}
  <h2 class="stats-h" id="conv-h">Conversations</h2>
  <p class="small muted">To start one, open a person on <a href="/admin?tab=users">Users</a> or <a href="/admin?tab=people">All users</a> and press Message. Messages to a child are logged with their text and copied to their linked grown-up (or their school's admins) when they have one. Sent something by mistake? Open the conversation and press Unsend under it.</p>
  ${threads.length ? html`<ul class="plain inbox panel">${threads.map(th => html`<li><a class="inboxrow ${th.unread ? 'unread' : ''}" href="/admin/messages/${encodeURIComponent(th.username)}">${avatar(th, 40)}<span class="who"><span class="nm">${th.display_name}</span><span class="sub">@${th.username}${th.account_type === 'grownup' ? ' · grown-up' : ''}${th.banned ? ' · banned' : ''}</span></span><span class="meta"><span class="time">${timeAgo(th.last)}</span>${th.unread ? html`<span class="badge">${th.unread}</span>` : ''}</span></a></li>`)}</ul>`
    : emptyState({ emoji: '📬', title: 'No conversations yet', text: 'Replies to the team show up here.' })}
  <section class="panel" aria-labelledby="ann-h" style="margin-top:var(--s5)">
    <h2 id="ann-h" style="margin-top:0">📣 Send an announcement</h2>
    <p class="small muted">It arrives in each person's inbox from “Oomba team ✓”. You will see how many people it reaches and confirm before it goes. At most one every ${team.ANNOUNCE_GAP_MS / 60e3} minutes and ${team.ANNOUNCE_DAILY} a day for the whole site${lim.nextAt ? html`: next one possible ${when(lim.nextAt)}` : ''} (${lim.leftToday} left today). Kids read it too, so write for a 6-year-old.</p>
    <form id="announce" class="stack" novalidate>
      <div class="field"><label for="ann-aud">Who gets it</label><select class="input" id="ann-aud" name="audience">${team.AUDIENCES.map(k => html`<option value="${k}">${AUDIENCE_LABEL[k]}</option>`)}</select></div>
      <div class="field" id="ann-school-f" hidden><label for="ann-school">School</label><select class="input" id="ann-school" name="schoolId">${schools.map(s => html`<option value="${s.id}">${s.name}</option>`)}</select></div>
      <div class="field"><label for="ann-text">Message</label><textarea class="input" id="ann-text" name="text" maxlength="${team.MAX_TEAM_LEN}" rows="3" placeholder="New games are here! ..."></textarea></div>
      <div class="row"><button class="btn btn-primary" type="submit">Check who it reaches…</button></div>
    </form>
    ${recent.length ? html`<details class="asection annhist" data-open-wide><summary>Recent announcements (${recent.length})</summary><ul class="small annlist">${recent.map(a => html`<li>${when(a.created_at)} · ${AUDIENCE_LABEL[a.audience] || a.audience}${a.school_name ? ` (${a.school_name})` : ''} · ${int(a.recipients)} people · by @${a.admin_name || '?'}: “${a.body.slice(0, 140)}” ${a.unsent ? html`<b>· unsent</b>` : html`<form class="inline" style="display:inline" data-api="/api/admin/announcements/${a.id}/unsend" data-reload data-toast="Unsent: it's gone from everyone's inbox." data-confirm="Unsend this announcement? It disappears from all ${int(a.recipients)} inboxes."><button class="btn btn-sm" type="submit">↩️ Unsend</button></form>`}</li>`)}</ul></details>` : ''}
  </section>
  <section class="panel" aria-labelledby="wel-h">
    <h2 id="wel-h" style="margin-top:0">👋 Welcome messages for new people</h2>
    <p class="small muted">Sent automatically from “Oomba team ✓”, once per person for each kind of welcome, only to accounts up to ${team.WELCOME_DAYS} days old. <code>{name}</code> becomes their first name. Line breaks are kept. They can write back, and replies land in Conversations above.</p>
    <div class="stack">${WELCOME_PANELS.map(w => welcomeForm(w, team.welcomeSettings(w.audience)))}</div>
  </section>`;
}

function auditTab() {
  const rows = mod.auditLog(200);
  if (!rows.length) return emptyState({ emoji: '📜', title: 'No entries yet' });
  return html`<div class="panel tblwrap"><table class="tbl audit atable alog alogx"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Details</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td data-label="When" class="aw-when">${when(r.created_at)}</td><td data-label="Who" class="aw-who">${r.actor_name ? '@' + r.actor_name : 'system'}</td><td data-label="What" class="aw-what"><code>${r.action}</code></td><td data-label="Target" class="full aw-tgt">${r.targetLabel}</td><td data-label="Details" class="small muted full adet">${r.detailsLabel ? html`<span class="adet-t">${r.detailsLabel}</span>` : ''}</td></tr>`)}
  </tbody></table></div>`;
}

/** The Builder's web searches (builder/search.js): newest first, ?flagged=1 for flagged ones only. No user names are
 *  stored; the build id and the game are there to follow one up. */
function searchesTab(req) {
  const flaggedOnly = req.query.flagged === '1';
  const rows = webSearch.listSearches({ flagged: flaggedOnly, limit: 300 });
  const filter = html`<nav class="chips afilter" aria-label="Which searches"><a class="chip ${flaggedOnly ? '' : 'on'}" href="/admin?tab=searches" ${flaggedOnly ? '' : raw('aria-current="true"')}>Show all</a><a class="chip ${flaggedOnly ? 'on' : ''}" href="/admin?tab=searches&amp;flagged=1" ${flaggedOnly ? raw('aria-current="true"') : ''}>⚠️ Show flagged only</a></nav>
    <p class="small">${flaggedOnly ? 'Showing flagged searches only.' : 'Showing all searches.'} · Web search is <b>${webSearch.webSearchOn() ? 'on' : 'off'}</b> (BUILDER_WEB_SEARCH) · kept 90 days</p>`;
  if (!rows.length) return html`${filter}${emptyState({ emoji: '🔎', title: 'No web searches', text: 'Searches the Builder makes to check a fact show up here.' })}`;
  return html`${filter}<div class="panel tblwrap"><table class="tbl audit atable slog"><thead><tr><th>When</th><th>Query</th><th>Sites</th><th>Result</th><th>Game</th><th>Build</th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td data-label="When">${when(r.created_at)}</td><td class="at" dir="auto">${r.query}</td><td data-label="Sites" class="small muted full sl-sites">${r.domains.join(', ') || '–'}</td>
      <td data-label="Result">${r.flagged ? html`<span class="chip-s warn">⚠️ flagged${r.reason ? ` (${r.reason})` : ''}</span>` : html`${r.results} result${r.results === 1 ? '' : 's'}${r.reason ? html` <span class="small muted">${r.reason}</span>` : ''}`}</td>
      <td data-label="Game">${r.game_slug ? html`<a href="/studio/${r.game_id}">${r.game_title}</a>` : '–'}</td><td data-label="Build" class="small muted">${r.turn_id ? html`<code>${r.turn_id}</code>` : '–'}</td></tr>`)}
  </tbody></table></div>`;
}

/** AI spending vs the caps (AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD). Admin pages are English-only. */
function aiSpendPanel() {
  const b = aiBudget.status(); const usd = n => '$' + n.toFixed(2);
  const bar = (v, max) => html`<span class="ameter" aria-hidden="true"><i style="--p:${Math.min(100, max > 0 ? v / max * 100 : 0).toFixed(1)}%"></i></span>`;
  return html`<section class="panel aispend${b.ok ? '' : ' bad'}" aria-label="AI spending"><b>🤖 AI spending</b>
    <span class="aispend-i"><span>today ${usd(b.today)} of ${usd(b.daily)} (${b.todayCalls} calls)</span>${bar(b.today, b.daily)}</span><span class="aispend-sep" aria-hidden="true">·</span>
    <span class="aispend-i"><span>this month ${usd(b.month)} of ${usd(b.monthly)}</span>${bar(b.month, b.monthly)}</span>
    ${b.ok ? '' : html`<span class="aispend-cap"><b>Cap reached (${b.reason}):</b> the Builder is using the offline builder, picture uploads are paused and public reviews wait for a person.</span>`}</section>`;
}

router.get('/admin', (req, res) => {
  // The old New users tab is All users on its New view (?tab=newusers keeps working, with its ?range=).
  const tab = req.query.tab === 'newusers' ? 'people' : TABS.some(t => t[0] === req.query.tab) ? req.query.tab : 'queue';
  const c = mod.counts();
  const n = { queue: c.queue, reports: c.reports, chat: c.chat, links: family.openReportCount(), live: liveR.openReports(500).length, schoolreq: schoolRequests.openCount(), searches: webSearch.flaggedCount(), messages: team.adminUnread() };
  const content = { queue: queueTab, reports: reportsTab, chat: chatTab, links: linksTab, live: liveTab, schoolreq: schoolRequestsTab, people: peopleTab, users: usersTab, messages: messagesTab, searches: searchesTab, audit: auditTab }[tab](req);
  const tabInfo = TABS.find(t => t[0] === tab);
  const waiting = Object.values(n).reduce((a, b) => a + (b || 0), 0);
  const tabLink = ([k, e, l]) => html`<a href="/admin?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}><span aria-hidden="true">${e}</span>&nbsp;${l}${n[k] ? html`&nbsp;<span class="badge">${n[k]}</span>` : ''}</a>`;
  const body = html`
  <div class="ahead"><div class="pagehead adminhead"><h1>🛡️ Admin</h1><div class="row ashort"><a class="btn${c.queue ? ' btn-hot' : ''}" href="/admin?tab=queue" aria-label="Review queue: ${c.queue} game${c.queue === 1 ? '' : 's'} waiting"><span aria-hidden="true">⏳</span> Review${c.queue ? html`&nbsp;<span class="badge">${c.queue}</span>` : ''}</a><a class="btn" href="/admin/stats"><span aria-hidden="true">📊</span> Stats</a><a class="btn" href="/admin/schools"><span aria-hidden="true">🏫</span> Schools${n.schoolreq ? html`&nbsp;<span class="badge" aria-label="${n.schoolreq} school request${n.schoolreq === 1 ? '' : 's'} waiting">${n.schoolreq}</span>` : ''}</a><a class="btn" href="/admin/billing"><span aria-hidden="true">💳</span> Billing</a><a class="btn" href="/admin/emails"><span aria-hidden="true">📧</span> Emails</a><a class="btn" href="/admin/voices"><span aria-hidden="true">🔊</span> Voices</a></div></div>
  ${aiSpendPanel()}
  <nav class="tabs adminnav" aria-label="Admin sections">
    <input type="checkbox" id="adminnav-t" class="adminnav-t" aria-controls="adminnav-groups">
    <label for="adminnav-t" class="adminnav-sum"><span class="adminnav-cur"><span aria-hidden="true">${tabInfo[1]}</span>&nbsp;${tabInfo[2]}</span><span class="adminnav-all">All sections${waiting ? html`&nbsp;<span class="badge" aria-label="${waiting} waiting in all sections">${waiting}</span>` : ''}</span></label>
    <div class="adminnav-groups" id="adminnav-groups">${TAB_GROUPS.map(([g, keys]) => html`<div class="adminnav-g" role="group" aria-label="${g}"><span class="adminnav-gl" aria-hidden="true">${g}</span>${keys.map(k => tabLink(TABS.find(t => t[0] === k)))}</div>`)}</div>
  </nav></div>
  ${content}
  ${jsonData('page-data', { tab })}`;
  page(req, res, { title: 'Admin', active: 'me', body, bodyClass: ADMIN_BODY, head: html`${COMMUNITY_CSS}${tab === 'people' || tab === 'users' ? raw('<link rel="stylesheet" href="/css/stats.css">') : ''}${ADMIN_CSS}`, scripts: tab === 'users' ? ['/js/admin.js', '/js/admin-stats.js'] : ['/js/admin.js'], back: '/me', backLabel: 'Me' });
});

// ---- All users as CSV (the same filters and order as the tab, up to services/admin-users.js CSV_MAX rows). Audited.
// /admin/new-users.csv is the old New users export: the same file on the New view (?range= as the joined range).
function usersCsv(req, res) {
  const f = peopleQuery(req.path === '/admin/new-users.csv' ? { query: { ...req.query, tab: 'newusers' } } : req);
  const { page, ...filters } = f;
  audit(req.user.id, 'admin.export_users', '', Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== AA.DEFAULTS[k])));
  const name = `oomba-users-${f.from || f.to ? `${f.from || 'start'}-to-${f.to || 'today'}` : f.joined}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  res.send(AA.usersCsv(filters));
}
router.get('/admin/users.csv', usersCsv);
router.get('/admin/new-users.csv', usersCsv);

// ---- One conversation with the Oomba team (an admin writes as the team).
router.get('/admin/messages/:username', (req, res) => {
  const u = getUserByName(req.params.username);
  if (!u || u.is_guest || u.username === OFFICIAL) return res.status(404).send('Not found');
  team.markReadByTeam(u);
  const msgs = team.adminThread(u);
  const can = team.canMessage(u);
  const tu = team.teamUser();
  const type = AU.accountTypeOf(u.id);
  const line = m => {
    const fromTeam = m.from_id === tu.id;
    return html`<li class="msg ${fromTeam ? 'mine' : 'theirs'} ${m.kind}"><div class="bubble" dir="auto">${chat.present(m, u, tEn).body}</div>
      <span class="when small muted">${fromTeam ? (m.kind === 'notice' ? 'automatic notice' : m.kind === 'announce' ? `announcement by @${m.admin_name || '?'}` : m.admin_name ? `@${m.admin_name}` : 'automatic welcome') : `@${u.username}`} · ${when(m.created_at)}${m.status === 'unsent' ? ' · unsent (they no longer see it)' : m.status !== 'ok' ? ' · hidden' : ''}</span>${fromTeam && m.kind === 'team' && m.status === 'ok' ? html`<form class="unsend" data-api="/api/admin/team/messages/${m.id}/unsend" data-reload data-toast="Unsent." data-confirm="Unsend this message? It disappears from their inbox (and their grown-up's copy)."><button class="btn btn-sm" type="submit">↩️ Unsend</button></form>` : ''}</li>`;
  };
  const body = html`
  <div class="pagehead"><h1>📬 ${u.display_name} <span class="muted small">@${u.username}</span></h1><div class="row"><a class="btn" href="/admin?tab=users&amp;username=${encodeURIComponent(u.username)}">👤 User details</a></div></div>
  <p class="small">${AU.TYPE_LABEL[type]}${u.banned ? ' · banned' : ''}. They see these messages as from <b>Oomba team ✓</b>, in their inbox (<code>/chat/${OFFICIAL}</code>).</p>
  ${can.ok && can.child ? html`<p class="notice warn small">👀 This is a child. Everything you send here, and everything they reply, is written to the audit log with its text${can.guardians.length ? html` and copied to ${can.guardians.map(g => `@${g.username}`).join(', ')}` : html`. They have no linked grown-up or school admin, so no copy goes to anyone: keep it to Oomba matters, never ask for personal details`}.</p>` : ''}
  <section class="panel"><ol class="plain adminthread" aria-label="Conversation">${msgs.length ? msgs.map(line) : html`<li class="muted">No messages yet.</li>`}</ol></section>
  ${can.ok ? html`<form class="panel stack" id="dm" data-id="${u.id}" novalidate>
      <div class="field"><label for="dm-text">Message as the Oomba team</label><textarea class="input" id="dm-text" name="text" maxlength="${team.MAX_TEAM_LEN}" rows="3"></textarea></div>
      <div class="row"><button class="btn btn-primary" type="submit">Send</button></div></form>`
    : html`<p class="notice warn">${can.error}</p>`}`;
  page(req, res, { title: `Messages: ${u.username}`, active: 'me', body, bodyClass: ADMIN_BODY, head: html`${COMMUNITY_CSS}${ADMIN_CSS}`, scripts: ['/js/admin.js'], back: '/admin?tab=messages', backLabel: 'Team inbox' });
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
  const row = (label, s) => html`<tr><td>${label}</td><td data-label="Messages">${int(s.n)}${s.estimated ? html` <span class="muted small">(${int(s.estimated)} estimated)</span>` : ''}</td>
    <td data-label="Average">${s.n ? cents(s.avg) : '–'}</td><td data-label="Median">${s.n ? cents(s.median) : '–'}</td><td data-label="90% under">${s.n ? cents(s.p90) : '–'}</td><td data-label="Total">${usd(s.total)}</td></tr>`;
  const est = c.all.estimated;
  return html`
  <h2 class="stats-h" id="st-cost">Cost per Builder message, last ${c.days} days</h2>
  <div class="kpis">
    ${tile('💵 Average per message', c.all.n ? cents(c.all.avg) : '–', c.all.n ? `median ${cents(c.all.median)} · ${int(c.all.n)} messages` : 'no AI-built messages yet')}
    ${tile('📨 Messages per day', fmtNum(Math.round(c.perDay * 10) / 10), `${fmtNum(Math.round(c.perDay7 * 10) / 10)} a day over the last 7 days`)}
    ${tile('🎁 Free messages per month', c.expectedPerMonth === null ? '–' : int(c.expectedPerMonth), c.expectedPerMonth === null ? `the ${usd(c.monthly)} budget, once messages have a cost` : `the ${usd(c.monthly)} budget after other AI use · ${int(c.expectedPerMonthAll)} if it all went to the Builder`)}
    ${tile('📆 Free messages per day', c.perDayCap === null ? '–' : int(c.perDayCap), `what the ${usd(c.daily)} daily cap pays for`)}
    ${tile('📈 This month at this pace', usd(c.projectedMonth), `free AI spend for 30 days · budget ${usd(c.monthly)}`, c.projectedMonth > c.monthly ? 'warn' : '')}
  </div>
  <section class="panel stats-cost"><div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Quality</th><th>Messages</th><th>Average</th><th>Median</th><th>90% under</th><th>Total</th></tr></thead><tbody>
    ${row('Normal', c.normal)}${row('Pro', c.pro)}${row('All', c.all)}</tbody></table></div>
    ${foldNote('How the cost is counted', html`A message is one Builder build the AI ran, counted on the day it was charged (refunded builds too: their AI calls were paid).
    Its cost is what its own model calls cost; screening, picture checks, reviews and lesson help are the "other AI use"
    (${usd(c.otherUsd)} of ${usd(c.spentUsd)} free AI spend over these days), taken off the monthly budget at the same pace
    before dividing by the average cost.${est ? ` ${int(est)} older builds have no stored cost: they are estimated from their token counts.` : ''}
    Builder rows are kept 35 days.`, 'wideopen')}
  </section>`;
}
/** Active people (services/admin-analytics.js activeCounts): distinct real accounts used per UTC day (user_days). */
function activeSection(a) {
  const ch = a.wauBefore ? Math.round((a.wau - a.wauBefore) / a.wauBefore * 100) : null;
  return html`
  <h2 class="stats-h" id="st-active">Active people</h2>
  <div class="kpis">
    ${tile('🟢 Daily active (DAU)', int(a.dau), 'accounts used today')}
    ${tile('📅 Weekly active (WAU)', int(a.wau), ch === null ? 'last 7 days' : `last 7 days · ${ch > 0 ? '+' : ch < 0 ? '−' : ''}${Math.abs(ch)}% on the week before (${int(a.wauBefore)})`)}
    ${tile('🗓️ Monthly active (MAU)', int(a.mau), `last 30 days · ${a.stickiness}% come back daily (DAU / MAU)`)}
    ${tile('🌱 New this week', int(a.newThisWeek), 'joined in the last 7 days and used it')}
    ${tile('🔁 Returning this week', int(a.returningThisWeek), 'joined before and came back')}
  </div>
  <p class="small muted">A person is active on a UTC day when they sign in or open any page signed in. Real accounts only (no guests, not the Oomba team account). <a href="/admin?tab=people">All users</a> has each person's numbers.</p>`;
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
      <div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Step</th><th title="${range(r.last)}">Last 7 days</th><th title="${range(r.prev)}">Week before</th><th>Change</th>${f.guardrail || f.tally ? '' : html`<th>Of step before</th>`}</tr></thead><tbody>
        ${f.steps.map((s, i) => html`<tr><td>${s.label}</td><td data-label="Last 7 days">${int(s.last)}</td><td data-label="Week before">${int(s.prev)}</td><td data-label="Change">${changeCell(s, f.guardrail)}</td>${f.guardrail || f.tally ? '' : html`<td data-label="Of step before">${i === 0 ? '' : s.rate === null ? '–' : `${s.rate}%`}</td>`}</tr>`)}
      </tbody></table></div></section>`)}
  </div>
  ${foldNote('How the funnels are counted', html`Daily totals counted on the server where each step happens (no cookies, no trackers, no ids:
  one number per step per day, so steps compare totals, not the same people). Page views are the parent pages
  (/parents and its guides) and the teacher pages (/teachers, /plans/schools), counted like visits. Paid and
  School plan: a subscription's first invoice once it is paid (an invoiced school counts when it pays, not when the
  invoice is sent), from Stripe's webhook (gifted plans don't count). Checkout started: once per family per try (opening
  Checkout again within a day doesn't add to it). A teacher page reloaded after sending the form isn't a new view. Home doors: clicks on the three doors signed-out
  visitors and guests see on the home page, and on the top bar's "▶ Play now" (each click counted by a beacon to
  /go/&lt;door&gt; on its way; older links through /go/&lt;door&gt; count and redirect; robots are left out). Who's this for: the choice on Start free (/signup) before the kid form, counted the
  same way through /signup/for/&lt;choice&gt; (a guest keeping their progress and a kid on their way to a page skip it). Counting started
  with this update, so the first two weeks read low. Days are UTC.`, 'wideopen')}`;
}
const gameLink = g => html`<a href="/g/${g.slug}">${g.icon} ${g.title}</a>${g.source === 'seed' ? html` <span class="chip-s">launch</span>` : ''}`;

router.get('/admin/stats', (req, res) => {
  const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 30;
  const k = stats.kpis(), rows = stats.daily(days);
  const cost = stats.messageCosts(Math.min(days, 30));
  const act = AA.activeCounts(), activeRows = AA.activeByDay(days), busy = AA.mostActive(7, 10);
  const top7 = stats.topGames(7), topAll = stats.topGamesAllTime(10), builders = stats.topBuilders(10), areas = stats.areas(7), models = stats.aiByModel(30), fresh = stats.newestUsers(8);
  const tok = t => int((t.input || 0) + (t.output || 0));
  const body = html`
  <div class="pagehead"><h1>📊 Stats</h1><nav class="seg" aria-label="Time range">${[7, 30, 90].map(d => html`<a href="/admin/stats?days=${d}" ${d === days ? raw('aria-current="page"') : ''}>${d} days</a>`)}</nav></div>
  <p class="muted small">All times are UTC. Visits count page loads by people (no bots, no tracking: one daily total per page area, and each visitor once a day).</p>
  ${jumpNav([['st-today', 'Today'], ['st-active', 'Active'], ['st-cost', 'Cost'], ['funnels', 'Funnels'], ['st-days', `Last ${days} days`], ['st-top', 'Top lists']])}

  <h2 class="stats-h" id="st-today">Today and this week</h2>
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
  ${activeSection(act)}
  ${costSection(cost)}
  ${funnelSection(funnel.weekly())}

  <h2 class="stats-h" id="st-days">Last ${days} days</h2>
  <div class="charts">
    ${barChart({ title: 'Active people', rows: activeRows, key: 'active', unit: 'people', total: false, tip: r => `${int(r.active)} people used their account` })}
    ${barChart({ title: 'Visitors', rows, key: 'visitors', unit: 'visitors', total: false, tip: r => `${int(r.visitors)} visitors, ${int(r.views)} page views` })}
    ${barChart({ title: 'New accounts', rows, key: 'signups', unit: 'accounts', tip: r => `${int(r.signups)} accounts, ${int(r.guests)} guests` })}
    ${barChart({ title: 'Plays', rows, key: 'plays', unit: 'plays', tip: r => `${int(r.plays)} plays, ${int(r.minutes)} minutes` })}
    ${barChart({ title: 'Games started in the Studio', rows, key: 'built', unit: 'games' })}
    ${barChart({ title: 'Builder messages', rows, key: 'turns', unit: 'messages' })}
    ${barChart({ title: 'AI cost', rows, key: 'usd', fmt: usd, unit: '', tip: r => `${usd(r.usd)}, ${int(r.calls)} calls` })}
    ${barChart({ title: 'AI tokens', rows: rows.map(r => ({ ...r, tokens: r.tokensIn + r.tokensOut })), key: 'tokens', fmt: fmtNum, unit: 'tokens', tip: r => `${int(r.tokensIn)} in, ${int(r.tokensOut)} out` })}
  </div>

  <h2 class="stats-h" id="st-top">Top lists</h2>
  <div class="stats-grid">
    <section class="panel"><h2>🔥 Most played, last 7 days</h2>
      ${top7.length ? html`<div class="tblwrap"><table class="tbl atable inl n3"><thead><tr><th>Game</th><th>Plays</th><th>Players</th><th>Minutes</th></tr></thead><tbody>
        ${top7.map(g => html`<tr><td>${gameLink(g)}</td><td data-label="Plays">${int(g.plays)}</td><td data-label="Players">${int(g.players)}</td><td data-label="Minutes">${int(g.minutes)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No plays yet this week.</p>`}
    </section>
    <section class="panel"><h2>🏆 All-time favourites</h2>
      <div class="tblwrap"><table class="tbl atable inl n3"><thead><tr><th>Game</th><th>Plays</th><th>❤️</th><th>★</th></tr></thead><tbody>
        ${topAll.map(g => html`<tr><td>${gameLink(g)}</td><td data-label="Plays">${int(g.plays)}</td><td data-label="❤️">${int(g.likes)}</td><td data-label="★">${g.rating ? html`${g.rating} <span class="muted small">(${g.rating_count})</span>` : '–'}</td></tr>`)}</tbody></table></div>
    </section>
    <section class="panel"><h2>🛠️ Top builders</h2>
      ${builders.length ? html`<div class="tblwrap"><table class="tbl atable inl n3"><thead><tr><th>Builder</th><th>Games</th><th>Live</th><th>Plays</th></tr></thead><tbody>
        ${builders.map(b => html`<tr><td>${b.account_type === 'grownup' ? html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(b.username)}">🧑 ${b.display_name}</a> <span class="muted small">(grown-up)</span>` : html`<a href="/u/${b.username}">${b.avatar} ${b.display_name}</a>`}</td><td data-label="Games">${int(b.games)}</td><td data-label="Live">${int(b.live)}</td><td data-label="Plays">${int(b.plays)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Nobody has built a game yet.</p>`}
    </section>
    <section class="panel"><h2>🧭 Where people go, last 7 days</h2>
      ${areas.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Page area</th><th>Views</th></tr></thead><tbody>
        ${areas.map(a => html`<tr><td>${AREA_LABELS[a.area] || a.area}</td><td>${int(a.views)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No visits counted yet. Counting started with this update.</p>`}
    </section>
    <section class="panel"><h2>🤖 AI by model, last 30 days</h2>
      ${models.length ? html`<div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Model</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th></tr></thead><tbody>
        ${models.map(m => html`<tr><td><code>${m.model}</code></td><td data-label="Calls">${int(m.calls)}</td><td data-label="Tokens in">${fmtNum(m.input + m.cache_read + m.cache_write)}</td><td data-label="Tokens out">${fmtNum(m.output)}</td><td data-label="Cost">${usd(m.usd)}</td></tr>`)}</tbody></table></div>
        <p class="small muted">Tokens in include cached prompt tokens. Token counts started with this update; costs before it are in the AI cost chart.</p>` : html`<p class="muted">No AI calls recorded yet.</p>`}
    </section>
    <section class="panel"><h2>🙋 Most active, last 7 days</h2>
      ${busy.length ? html`<div class="tblwrap"><table class="tbl atable inl n3"><thead><tr><th>Person</th><th>Days</th><th>Plays</th><th>AI msgs</th></tr></thead><tbody>
        ${busy.map(b => html`<tr><td><a href="/admin?tab=users&amp;username=${encodeURIComponent(b.username)}">${b.display_name}</a> <span class="muted small">(${AU.TYPE_LABEL[b.type].toLowerCase()})</span></td><td data-label="Days">${int(b.days)}</td><td data-label="Plays">${int(b.plays)}</td><td data-label="AI msgs">${int(b.ai)}</td></tr>`)}</tbody></table></div>
        <p class="small muted"><a href="/admin?tab=people&amp;active=7d&amp;sort=days">Everyone active this week</a></p>` : html`<p class="muted">Nobody has used their account this week.</p>`}
    </section>
    <section class="panel"><h2>🆕 Newest accounts</h2>
      ${fresh.length ? html`<div class="tblwrap"><table class="tbl atable inl"><thead><tr><th>Player</th><th>Joined</th><th>Last seen</th></tr></thead><tbody>
        ${fresh.map(u => html`<tr><td>${u.account_type === 'grownup' ? html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(u.username)}">🧑 ${u.display_name}</a>` : html`<a href="/u/${u.username}">${u.avatar} ${u.display_name}</a>`}</td><td data-label="Joined">${timeAgo(u.created_at)}</td><td data-label="Last seen">${u.last_seen ? timeAgo(u.last_seen) : 'never'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No accounts yet.</p>`}
      <p class="small muted">${int(k.users.guests)} guest players in total, +${int(k.users.guestsWeek)} this week. ${int(k.users.banned)} banned.</p>
    </section>
  </div>`;
  page(req, res, { title: 'Stats', active: 'me', body, bodyClass: ADMIN_BODY, head: html`${raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/stats.css">')}${ADMIN_CSS}`, scripts: ['/js/admin-stats.js', '/js/admin.js'], back: '/admin', backLabel: 'Admin' });
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
  if (r.owner_kind === 'teacher') {
    const o = q.get('SELECT username FROM users WHERE id=?', r.owner_id);
    return o ? html`Teacher <a href="/admin?tab=users&amp;username=${encodeURIComponent(o.username)}">@${o.username}</a>` : html`Teacher ${r.owner_id} (gone)`;
  }
  const sc = getSchool(r.owner_id);
  return sc ? html`School <a href="/school/${sc.slug}">${sc.name}</a>` : html`${r.owner_kind} ${r.owner_id}`;
}
/** The Teacher plan on /admin/billing (services/teacher-plan.js): teachers' own plans and schools' teacher seats, their
 *  trials (trialing / converted / ended, trial end dates) and the legacy per-student school plans still running. */
function teacherSection(lm) {
  const rows = q.all("SELECT * FROM billing_subscriptions WHERE livemode=? AND plan='teacher' ORDER BY COALESCE(trial_end, current_period_end) DESC LIMIT 300", lm);
  const legacy = q.all("SELECT * FROM billing_subscriptions WHERE livemode=? AND plan='school' AND status NOT IN ('canceled','incomplete_expired') ORDER BY current_period_end", lm);
  const st = teacherPlan.trialStats();
  const count = s => rows.filter(r => r.status === s).length;
  const rate = st.converted + st.ended ? Math.round((st.converted / (st.converted + st.ended)) * 100) : null;
  return html`<section class="panel" id="teachers"><h2>Teacher plans</h2>
    <div class="kpis" style="margin-bottom:var(--s3)">
      ${tile('🍎 Trialing', int(count('trialing')))}${tile('✅ Active', int(count('active') + count('past_due')))}${tile('🚫 Canceled', int(count('canceled')))}
      ${tile('🧪 Trials started', int(st.total), rate === null ? '' : `${rate}% of ended trials converted`)}${tile('🔁 Converted', int(st.converted))}${tile('⌛ Ended without a card', int(st.ended))}
    </div>
    ${rows.length ? html`<div class="tblwrap"><table class="tbl small atable wide"><thead><tr><th>Owner</th><th>Seats</th><th>Status</th><th>Trial ends</th><th>Period end</th><th>Stripe</th></tr></thead><tbody>
      ${rows.map(r => html`<tr><td>${ownerCell(r)}</td><td data-label="Seats">${r.owner_kind === 'school' ? `${r.quantity} teacher seat${r.quantity === 1 ? '' : 's'}` : 'own plan'}</td>
        <td data-label="Status">${r.status}${billing.entitledRow(r) ? ' ✅' : ''}${r.cancel_at_period_end ? ' · ends at period end' : ''}${r.trial_notice_at ? ' · told the trial ends' : ''}</td>
        <td data-label="Trial ends">${day(r.trial_end)}</td><td data-label="Period end">${day(r.current_period_end)}</td>
        <td data-label="Stripe" class="full"><a href="${dash(`subscriptions/${r.stripe_subscription_id}`)}" rel="noopener noreferrer" target="_blank"><code>${r.stripe_subscription_id}</code></a></td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">No Teacher plans yet.</p>`}
    <h3>Legacy per-student school plans</h3>
    ${legacy.length ? html`<ul>${legacy.map(r => html`<li>${ownerCell(r)} · ${r.quantity} students · ${r.status} · renews ${day(r.current_period_end)} <span class="chip-s warn">legacy plan</span></li>`)}</ul>` : html`<p class="muted">None.</p>`}
    ${foldNote('About the Teacher plan', html`$119 a year per teacher (lookup key oomba_teacher_yearly), ${config.teacherTrialDays}-day free trial with no card (a trial that ends without a card is cancelled by Stripe; nothing is deleted). One trial per teacher, email and school. Each teacher with the plan shares ${config.teacherDailyMessages} Builder messages a day with their classes. Legacy per-student school plans keep their price at renewal; nothing moves them automatically.`)}
  </section>`;
}
/** Spark Packs on /admin/billing (services/sparks.js): this month's sales, messages left, the latest packs with Revoke,
 *  and the grant form (a grown-up's username, or a linked child's, names the family). Refunds are made in Stripe: the
 *  webhook takes back what is left. */
function sparkSection() {
  const tot = sparks.totals(), list = sparks.recentPacks(50);
  const famOf = fid => q.get('SELECT u.username FROM families f JOIN users u ON u.id=f.owner_id WHERE f.id=?', fid);
  return html`<section class="panel" id="sparks"><h2>⚡ Spark Packs</h2>
    <p class="small">This month: <b>${int(tot.sold)}</b> pack${tot.sold === 1 ? '' : 's'} paid · <b>$${((tot.cents || 0) / 100).toFixed(2)}</b> · <b>${int(tot.left)}</b> messages left in usable packs.</p>
    ${list.length ? html`<div class="tblwrap"><table class="tbl small"><thead><tr><th>When</th><th>Family</th><th>Pack</th><th>Status</th><th>Left</th><th>Paid</th><th>Ends</th><th></th></tr></thead><tbody>
      ${list.map(p => { const o = famOf(p.family_id); const st = sparks.packState(p); return html`<tr data-pack="${p.id}">
        <td>${when(p.paid_at || p.created_at)}</td>
        <td>${o ? html`<a href="/admin?tab=users&amp;username=${encodeURIComponent(o.username)}">@${o.username}</a>` : p.family_id}</td>
        <td>${p.source === 'grant' ? `grant · ${p.messages}` : `${p.messages} messages`}${p.note ? html`<div class="muted">${p.note}</div>` : ''}</td>
        <td>${st}</td><td>${int(p.remaining)} / ${int(p.messages)}</td>
        <td>${p.amount_total != null && p.source === 'stripe' ? `$${(p.amount_total / 100).toFixed(2)}` : '–'}${p.stripe_payment_intent ? html` <a href="${dash(`payments/${p.stripe_payment_intent}`)}" rel="noopener noreferrer" target="_blank">Stripe</a>` : ''}</td>
        <td>${p.expires_at ? day(p.expires_at) : '–'}</td>
        <td>${['active', 'processing'].includes(p.status) && p.remaining > 0 ? html`<form data-api="/api/admin/billing/sparks/${p.id}/revoke" data-reload data-confirm="End the ${p.remaining} messages left in this pack?"><button class="btn btn-sm" type="submit">Revoke</button></form>` : ''}</td></tr>`; })}
    </tbody></table></div>` : html`<p class="muted">No Spark Packs yet.</p>`}
    <form class="row" data-api="/api/admin/billing/sparks/grant" data-reload data-toast="Spark Pack messages granted." style="margin-top:12px">
      <label for="spark-user">Username</label><input class="input" id="spark-user" name="username" required maxlength="40" style="max-width:12em">
      <label for="spark-n">Messages</label><input class="input" id="spark-n" name="messages" type="number" min="1" max="${sparks.GRANT_MAX}" step="1" required style="max-width:7em">
      <label for="spark-note">Note</label><input class="input" id="spark-note" name="note" maxlength="300" style="max-width:16em">
      <button class="btn btn-primary" type="submit">Grant</button><span class="err form-err" aria-live="polite"></span></form>
    <p class="small muted">A grant is a pack of its own (lasts ${config.sparkExpiryDays} days, audited). A grown-up's username names their family; a linked child's names the family they are linked to. Refund a paid pack in the Stripe Dashboard: the webhook then takes back what is left (all of it for a full refund).</p>
  </section>`;
}
/** "Ready to go live?" (services/billing-ready.js; docs/billing-go-live.md): one row per check, green or red, with what to
 *  do. Setting names only: never a key, secret or id. All green folds the list away. */
function readyPanel(r) {
  const allOk = r.ready === r.total;
  const list = html`<ul class="readylist">${r.rows.map(x => html`<li class="ready-row ${x.ok ? 'is-ok' : 'is-bad'}" data-check="${x.id}">
      <span class="chip-s ready-chip ${x.ok ? 'good' : 'bad'}">${x.ok ? html`<span aria-hidden="true">✓</span> Ready` : html`<span aria-hidden="true">✗</span> To do`}</span>
      <div class="ready-main"><b>${x.label}</b><div class="small muted ready-now">Now: ${x.now}</div>${x.fix ? html`<div class="small ready-fix">${x.fix}</div>` : ''}</div></li>`)}</ul>`;
  return html`<section class="panel" id="ready"><h2>🚦 Ready to go live?</h2>
    <p class="ready-sum"><span class="chip-s ${allOk ? 'good' : 'bad'}"><b>${r.ready} of ${r.total}</b>&nbsp;ready</span> ${allOk ? 'Every check is green.' : html`Red rows still need doing. The full steps, the open decisions and the test purchase are in <code>docs/billing-go-live.md</code>.`}</p>
    ${allOk ? html`<details class="anote"><summary>Show the checks</summary>${list}</details>` : list}
    <p class="small muted">Read from the server's settings by name only: no key, secret or id is shown here. The lawyer's sign-off and the Stripe Dashboard's own settings (Customer emails, the Portal, Radar) are on the checklist in the doc.</p>
    <p><a class="btn btn-sm" href="/admin/billing?recheck=1#ready">Check again</a></p>
  </section>`;
}
router.get('/admin/billing', async (req, res) => {
  const mode = stripe.billingMode();
  const ready = await readiness({ refresh: req.query.recheck === '1' });
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
  const teachers = billing.entitledOwnerCount('teacher');
  const schools = billing.entitledOwnerCount('school');
  const requests = schoolBilling.openRequests();
  const unpaid = q.all("SELECT * FROM billing_subscriptions WHERE livemode=? AND owner_kind='school' AND collection_method='send_invoice' AND open_invoices IS NOT NULL AND open_invoices != '[]' ORDER BY updated_at DESC", lm)
    .flatMap(r => schoolBilling.openInvoicesOf(r).map(i => ({ ...i, row: r })));
  const sel = (name, value, opts) => html`<label class="sr-only" for="f-${name}">${name}</label><select class="input" id="f-${name}" name="${name}">${opts.map(([v, l]) => html`<option value="${v}" ${v === value ? raw('selected') : ''}>${l}</option>`)}</select>`;
  const body = html`
  <div class="pagehead"><h1>💳 Billing</h1><span class="chip-s ${mode === 'live' ? 'good' : mode === 'test' ? 'warn' : ''}">Stripe: ${mode}</span></div>
  ${mode === 'off' ? html`<p class="notice">Billing is off: set STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET (see the README). Rows from an earlier key still show below.</p>` : ''}
  ${emailWarning()}
  ${mode !== 'off' && !config.stripePmcFamily ? html`<p class="notice bad" role="alert"><b>Family checkout is off: STRIPE_PMC_FAMILY is not set.</b> Create the "Family" payment method configuration in Stripe (cards, Apple Pay, Google Pay on; Link off) and put its pmc_… id in STRIPE_PMC_FAMILY. Until then family plans are not on sale.</p>` : ''}
  ${tax && tax.on && !tax.ok ? html`<p class="notice bad" role="alert"><b>${tax.problem === 'settings_pending' ? 'Stripe Tax is on but its settings are pending' : 'Stripe Tax is on but is collecting in no state'}.</b> No tax is collected. ${tax.problem === 'settings_pending' ? 'Set the head office address in Stripe (Tax → Settings).' : 'Add a registration in Stripe (Tax → Registrations).'} Checked ${timeAgo(tax.checkedAt)}.</p>` : ''}
  <div class="kpis" style="margin-bottom:var(--s4)">
    ${tile('👪 Families with a plan', int(families), mode === 'test' ? 'test mode: billing testers only' : '')}
    ${tile('🏫 Schools with a plan', int(schools), requests.length ? html`<a href="#requests">${int(requests.length)} invoice request${requests.length === 1 ? '' : 's'}</a>` : '')}
    ${tile('🍎 Teachers with their own plan', int(teachers), html`<a href="#teachers">Teacher plans</a>`)}
    ${tile('🛒 Open checkouts', int(open))}
    ${tile('⚠️ Flagged', int(q.get('SELECT COUNT(*) n FROM billing_subscriptions WHERE livemode=? AND flag IS NOT NULL', lm).n), html`<a href="/admin/billing?flag=any">Show</a>`)}
    ${tile('📨 Event problems', int(problems.length), 'unlinked, other mode or version, failed')}
  </div>
  ${jumpNav([['ready', 'Go-live checks', ready.total - ready.ready, 'need'], ['requests', 'Invoice requests', requests.length, 'need'], ['unpaid', 'Unpaid', unpaid.length, 'need'], ['teachers', 'Teacher plans', q.get("SELECT COUNT(*) n FROM billing_subscriptions WHERE livemode=? AND plan='teacher'", lm).n, 'info'], ['b-subs', 'Subscriptions', subs.length, 'info'], ['sparks', 'Spark Packs', sparks.recentPacks(50).length, 'info'], ['b-problems', 'Event problems', problems.length, 'need'], ['b-webhooks', 'Webhooks', events.length, 'info']])}
  ${readyPanel(ready)}
  <section class="panel" id="requests"><h2>School invoice requests</h2>
    ${requests.length ? html`<div class="stack">${requests.map(r => html`<div class="panel" style="margin:0">
      <p style="margin-top:0"><b><a href="/school/${r.school_slug}?tab=billing">${r.school_name}</a></b> · ${int(r.seats)} ${r.unit === 'student' ? 'students (asked before teacher seats: type the number of teachers below)' : 'teachers'} · asked ${when(r.created_at)}</p>
      <div class="tblwrap"><table class="tbl small afacts"><tbody>
        <tr><th scope="row">PO number</th><td>${r.po || '–'}</td></tr>
        <tr><th scope="row">Billing contact</th><td>${r.contact_name || '–'} · <span dir="ltr">${r.contact_email || '–'}</span></td></tr>
        <tr><th scope="row">Billing address</th><td>${[r.address.line1, r.address.line2, r.address.city, r.address.state, r.address.postal_code, r.address.country].filter(Boolean).join(', ') || '–'}</td></tr>
        <tr><th scope="row">Tax-exempt</th><td>${r.tax_exempt_claimed ? 'they say so: wait for the exemption certificate before ticking the box below' : 'no'}</td></tr>
        ${r.note ? html`<tr><th scope="row">Note</th><td>${r.note}</td></tr>` : ''}
      </tbody></table></div>
      <form class="row binv" data-api="/api/admin/billing/requests/${r.id}/invoice-subscription" data-reload data-toast="Invoice subscription created. Stripe sends the invoice to the contact." data-confirm="Create a yearly invoice subscription (net 30) for ${r.school_name}?" style="margin-top:12px">
        <span class="binv-seats"><label for="seats-${r.id}">Teacher seats</label><input class="input" id="seats-${r.id}" name="seats" type="number" min="1" step="1" value="${r.unit === 'student' ? '' : r.seats}" style="max-width:8em"></span>
        <label class="checkline"><input type="checkbox" name="exempt" value="1"> <span>Exemption certificate received: mark the customer tax-exempt</span></label>
        <button class="btn btn-primary" type="submit">Create invoice subscription</button></form>
      <form data-api="/api/admin/billing/requests/${r.id}/close" data-reload data-confirm="Close this request without an invoice?" style="margin-top:8px"><button class="btn btn-sm" type="submit">Close without invoice</button></form>
    </div>`)}</div>
    ${foldNote('About invoice subscriptions', html`Create invoice subscription: the school's Stripe Customer gets the school's name, the contact's email (Stripe emails the invoice there), the address and the PO number; then a yearly send_invoice subscription of teacher seats at the Teacher price (oomba_teacher_yearly × teachers), due in 30 days${config.stripeTax ? ', with Stripe Tax' : ''}. How a school may pay an invoice (card, ACH, bank transfer) is set in the Stripe Dashboard.`)}` : html`<p class="muted">No open requests.</p>`}
  </section>
  <section class="panel" id="unpaid"><h2>Unpaid school invoices</h2>
    ${unpaid.length ? html`<div class="tblwrap"><table class="tbl small atable"><thead><tr><th>School</th><th>Invoice</th><th>Amount</th><th>Due</th><th></th></tr></thead><tbody>
      ${unpaid.map(i => html`<tr><td>${ownerCell(i.row)}${i.row.flag === 'overdue' ? html` <span class="chip-s bad">overdue</span>` : ''}</td>
        <td data-label="Invoice" class="full"><a href="${dash(`invoices/${i.id}`)}" rel="noopener noreferrer" target="_blank"><code>${i.number || i.id}</code></a> · <a href="${dash(`customers/${i.row.stripe_customer_id}`)}" rel="noopener noreferrer" target="_blank">customer (cash balance)</a></td>
        <td data-label="Amount">$${((i.amount_due || 0) / 100).toFixed(2)}</td><td data-label="Due">${day(i.due_date)}</td>
        <td class="acell"><form data-api="/api/admin/billing/invoices/${i.id}/paid-by-check" data-reload data-toast="Marked paid." data-confirm="Mark invoice ${i.number || i.id} as paid by check?"><button class="btn btn-sm" type="submit">Mark paid by check</button></form></td></tr>`)}
    </tbody></table></div><p class="small muted">An invoice school stays on its plan until ${config.schoolInvoiceGraceDays} days after the due date. A bank transfer that doesn't match the invoice waits in the customer's cash balance until you apply it in Stripe.</p>` : html`<p class="muted">None.</p>`}
  </section>
  <section class="panel" id="b-subs"><h2>Subscriptions</h2>
    <form method="get" action="/admin/billing" class="row bfilter" role="search">
      ${sel('status', status, [['', 'Any status'], ['entitled', 'Entitled now'], ...SUB_STATUSES.map(x => [x, x])])}
      ${sel('flag', flag, [['', 'Any or no flag'], ['any', 'Flagged'], ...Object.entries(BILLING_FLAGS)])}
      <button class="btn" type="submit">Filter</button></form>
    ${subs.length ? html`<div class="tblwrap"><table class="tbl small atable wide" style="margin-top:12px"><thead><tr><th>Owner</th><th>Plan</th><th>Status</th><th>Period end</th><th>Last payment</th><th>Refund window</th><th>Flag</th><th>Stripe</th></tr></thead><tbody>
      ${subs.map(r => { const rw = billing.refundWindow(r); return html`<tr>
        <td>${ownerCell(r)}</td>
        <td data-label="Plan">${r.plan === 'school' ? 'school (legacy per-student)' : r.plan === 'teacher' && r.owner_kind === 'school' ? 'teacher seats' : r.plan}${r.interval ? ` · ${r.interval}ly` : ''}${r.quantity > 1 ? ` × ${r.quantity}` : ''}${r.trial_end ? html` <span class="chip-s">trial to ${day(r.trial_end)}</span>` : ''}${r.owner_kind === 'school' ? html`<div class="small muted">${r.collection_method === 'send_invoice' ? 'invoice' : 'card'} · pool ${r.pool_quantity || 0} paid${r.next_quantity ? ` · next year ${r.next_quantity}` : ''}</div>` : ''}</td>
        <td data-label="Status">${r.status}${billing.entitledRow(r) ? ' ✅' : ''}${r.cancel_at_period_end ? ' · ends at period end' : ''}${r.grace_until ? ` · grace to ${day(r.grace_until)}` : ''}${r.payment_pending ? ' · payment pending' : ''}${r.orphaned_at ? ' · not at Stripe' : ''}</td>
        <td data-label="Period end">${day(r.current_period_end)}</td>
        <td data-label="Last payment">${r.latest_paid_at ? html`${day(r.latest_paid_at)} · $${((r.latest_amount_paid || 0) / 100).toFixed(2)}${r.latest_billing_reason ? html` <span class="muted">(${r.latest_billing_reason.replace('subscription_', '')})</span>` : ''}` : '–'}</td>
        <td data-label="Refund window">${rw ? `open until ${day(rw)}` : '–'}</td>
        <td data-label="Flag">${r.flag ? html`<span class="chip-s bad">${BILLING_FLAGS[r.flag] || r.flag}</span>` : ''}${r.risk_payment_intent ? html` <a href="${dash(`payments/${r.risk_payment_intent}`)}" rel="noopener noreferrer" target="_blank">Refund in Stripe</a>` : ''}</td>
        <td data-label="Stripe" class="full"><a href="${dash(`subscriptions/${r.stripe_subscription_id}`)}" rel="noopener noreferrer" target="_blank"><code>${r.stripe_subscription_id}</code></a></td></tr>`; })}
    </tbody></table></div>` : html`<p class="muted">No subscriptions${status || flag ? ' match' : ' yet'}.</p>`}
    ${foldNote('Refund rules', html`Refunds (D10): a full refund on request within ${billing.REFUND_DAYS} days of a payment that started a plan or renewed a yearly plan; monthly renewals are not refunded. Cancel first, then refund, in the Stripe Dashboard: a full refund of the latest payment also ends the plan here.`)}
  </section>
  ${teacherSection(lm)}
  ${sparkSection()}
  <section class="panel" id="b-problems"><h2>Event problems</h2>
    ${problems.length ? html`<div class="tblwrap"><table class="tbl small atable wide alog"><thead><tr><th>When</th><th>Event</th><th>Result</th><th>Customer</th><th>Subscription</th></tr></thead><tbody>
      ${problems.map(e => html`<tr><td data-label="When">${when(e.received_at)}</td><td class="at"><code>${e.type}</code> <span class="muted">${e.event_id}</span></td><td data-label="Result">${e.result || 'not finished'}</td><td data-label="Customer" class="full">${e.stripe_customer_id || '–'}</td><td data-label="Subscription" class="full">${e.stripe_subscription_id || '–'}</td></tr>`)}
    </tbody></table></div>${foldNote('What "unlinked" means', html`"unlinked": a subscription of a Stripe Customer we don't know (made in the Dashboard?). Linking it to a family or school comes with the next billing update; until then it entitles nobody.`)}` : html`<p class="muted">None.</p>`}
    ${orphaned.length ? html`<p>Subscriptions Stripe no longer knows: ${orphaned.map(r => html`<code>${r.stripe_subscription_id}</code> `)}</p>` : ''}
  </section>
  <section class="panel" id="b-webhooks"><h2>Recent webhook events</h2>
    ${events.length ? html`<div class="tblwrap"><table class="tbl small atable wide alog"><thead><tr><th>When</th><th>Event</th><th>Mode</th><th>Result</th><th>Subscription</th></tr></thead><tbody>
      ${events.map(e => html`<tr><td data-label="When">${when(e.received_at)}</td><td class="at"><code>${e.type}</code></td><td data-label="Mode">${e.livemode ? 'live' : 'test'}</td><td data-label="Result">${e.result || 'not finished'}</td><td data-label="Subscription" class="full">${e.stripe_subscription_id || '–'}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">No webhook events yet.</p>`}
  </section>`;
  page(req, res, { title: 'Billing', active: 'me', body, bodyClass: ADMIN_BODY, head: html`${raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/stats.css">')}${ADMIN_CSS}`, scripts: ['/js/admin.js'], back: '/admin', backLabel: 'Admin' });
});

// ---- Emails (services/email.js, services/nudges.js; docs/decisions.md "Trial emails") ----
const STEP_LABEL = { welcome: '#1 Welcome (at once)', class: '#2 Set up a class (day 2, skipped if they have one)', ideas: '#3 Three ideas (day 5)', ending: '#4 Trial ends in 3 days (day 11)', ended: '#5 Trial ended (day 14, not converted)', thanks: 'Thank-you (on conversion)' };
/** Where the admin's test emails go: their own address (Google), else CONTACT_EMAIL, else EMAIL_REPLY_TO. */
const testAddress = u => email.addressOf(u.id)?.email || email.normEmail(config.contactEmail) || email.normEmail(config.emailReplyTo.replace(/^.*<([^>]+)>.*$/, '$1'));
const sampleTrial = () => ({ trial_start: Date.now(), trial_end: Date.now() + 14 * 864e5 });
const sampleUser = u => ({ id: u.id, display_name: 'Alex Rivera', lang: 'en' });
/** The CAN-SPAM / settings warning, for /admin/emails and /admin/billing. */
const emailWarning = () => {
  const s = email.emailStatus();
  return s.nudges ? '' : html`<p class="notice bad" role="alert" id="email-warning"><b>Trial emails are not being sent.</b> ${s.problems.join(' ')} <a href="/admin/emails">Emails</a> has the details and the go-live checklist is in <code>docs/emails-go-live.md</code>.</p>`;
};
router.get('/admin/emails', (req, res) => {
  const s = email.emailStatus();
  const on = nudges.switchOn();
  const c = email.logCounts();
  const seq = nudges.sequenceCounts();
  const log = email.recentLog(50);
  const to = testAddress(req.user);
  const body = html`
  <div class="pagehead"><h1>📧 Emails</h1><span class="chip-s ${s.sending ? 'good' : 'warn'}">Sending: ${s.sending ? 'on' : 'off'}</span> <span class="chip-s ${on && s.nudges ? 'good' : 'warn'}">Trial emails: ${!on ? 'switched off' : s.nudges ? 'on' : 'waiting for settings'}</span></div>
  ${emailWarning()}
  <div class="kpis" style="margin-bottom:var(--s4)">
    ${tile('✅ Sent (30 days)', int(c.total.sent))}${tile('❌ Failed (30 days)', int(c.total.failed), '', c.total.failed ? 'bad' : '')}${tile('⏭️ Skipped (30 days)', int(c.total.skipped), 'no address, unsubscribed, not an adult')}
  </div>
  ${alertsSection(s)}
  <section class="panel" id="e-switch"><h2>Trial email sequence</h2>
    <p>${on ? 'On: due emails go out (checked every 15 minutes).' : 'Switched off: nothing is sent. Due emails wait, and any that would then be more than their allowed lateness are skipped.'}</p>
    <form data-api="/api/admin/emails/nudges" data-reload data-toast="${on ? 'Trial emails switched off.' : 'Trial emails switched on.'}" ${on ? raw('data-confirm="Stop sending trial emails?"') : ''}><input type="hidden" name="on" value="${on ? '0' : '1'}"><button class="btn ${on ? '' : 'btn-primary'}" type="submit">${on ? 'Switch off' : 'Switch on'}</button></form>
    <div class="tblwrap"><table class="tbl small atable" style="margin-top:12px"><thead><tr><th>Email</th><th>Waiting</th><th>Sent</th><th>Skipped / canceled</th><th>Failed</th></tr></thead><tbody>
      ${nudges.TRIAL_STEPS.map(st => { const x = seq[st] || {}; return html`<tr><td>${STEP_LABEL[st]}</td><td data-label="Waiting">${int((x.pending || 0) + (x.sending || 0))}</td><td data-label="Sent">${int(x.sent)}</td><td data-label="Skipped / canceled">${int((x.skipped || 0) + (x.canceled || 0))}</td><td data-label="Failed">${int(x.failed)}</td></tr>`; })}
    </tbody></table></div>
  </section>
  ${digestSection(s, to)}
  <section class="panel" id="e-preview"><h2>Preview and test</h2>
    <p class="small muted">Previews use a sample teacher ("Alex") and a trial starting today. A test goes to ${to ? html`<b dir="ltr">${email.maskEmail(to)}</b> (your Google address, else CONTACT_EMAIL, else EMAIL_REPLY_TO)` : 'nobody: no address is known'}, with "[Test]" in the subject.</p>
    <ul class="stack" style="list-style:none;padding:0">${nudges.TRIAL_STEPS.map(st => html`<li class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span style="min-width:16em">${STEP_LABEL[st]}</span>
      <a class="btn btn-sm" href="/admin/emails/preview/${st}" target="_blank" rel="noopener">Preview</a><a class="btn btn-sm" href="/admin/emails/preview/${st}?format=text" target="_blank" rel="noopener">Text</a>
      <form data-api="/api/admin/emails/test" data-toast="Test sent."><input type="hidden" name="step" value="${st}"><button class="btn btn-sm" type="submit" ${s.sending && to ? '' : raw('disabled')}>Send me a test</button></form></li>`)}</ul>
  </section>
  <section class="panel" id="e-settings"><h2>Settings</h2>
    <div class="tblwrap"><table class="tbl small afacts"><tbody>
      <tr><th scope="row">RESEND_API_KEY</th><td>${s.key ? 'set' : 'not set'}</td></tr>
      <tr><th scope="row">EMAIL_ENABLED</th><td>${s.enabled ? 'on' : 'off (0)'}</td></tr>
      <tr><th scope="row">EMAIL_FROM</th><td dir="ltr">${s.from}</td></tr>
      <tr><th scope="row">EMAIL_REPLY_TO</th><td dir="ltr">${s.replyTo}</td></tr>
      <tr><th scope="row">EMAIL_POSTAL_ADDRESS</th><td>${s.postal ? s.postalAddress : html`<b>not set</b>: trial emails are not sent`}</td></tr>
    </tbody></table></div>
  </section>
  <section class="panel" id="e-log"><h2>Recent sends</h2>
    ${log.length ? html`<div class="tblwrap"><table class="tbl small atable wide alog"><thead><tr><th>When</th><th>Email</th><th>To</th><th>Status</th><th>Detail</th></tr></thead><tbody>
      ${log.map(r => html`<tr><td data-label="When">${when(r.created_at)}</td><td class="at"><code>${r.template}</code></td><td data-label="To" dir="ltr">${email.maskEmail(r.to_email) || '–'}</td><td data-label="Status">${r.status}${r.attempts > 1 ? ` (${r.attempts} tries)` : ''}</td><td data-label="Detail" class="full">${r.error || (r.provider_id ? html`<code>${r.provider_id}</code>` : '')}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">Nothing sent yet.</p>`}
    <p class="small muted">Kept a year. Addresses are shortened here; bodies are never stored.</p>
  </section>`;
  page(req, res, { title: 'Emails', active: 'me', body, bodyClass: ADMIN_BODY, head: html`${raw('<link rel="stylesheet" href="/css/community.css"><link rel="stylesheet" href="/css/stats.css">')}${ADMIN_CSS}`, scripts: ['/js/admin.js'], back: '/admin', backLabel: 'Admin' });
});
// Admin alerts (services/admin-alerts.js; docs/decisions.md "Admin alerts by email"): one summary email every 10 minutes
// at most to the platform admins when something needs them. Kinds, counts, public usernames and links only.
const ALERT_STATUS = { sending: 'sending', retry: 'will retry', sent: 'sent', failed: 'failed', skipped: 'not sent' };
const hm = t => new Date(t).toISOString().slice(11, 16);
function alertsSection(s) {
  const a = alerts.overview();
  const state = a.killed ? 'Stopped by ADMIN_ALERTS=0 on the server: nothing is queued or sent, tests included.'
    : !a.on ? 'Switched off: nothing is queued or sent. Things that happen while it is off are not sent later.'
      : !s.sending ? 'Switched on, but sending is off (RESEND_API_KEY, EMAIL_ENABLED), so nothing is queued.'
        : 'On: when something needs you, one email every 10 minutes at most sums it up (counts, public usernames, links). It never includes message text, real names or addresses.';
  const next = a.nextAt ? `Next check about ${hm(a.nextAt)} UTC` : 'Next check within 10 minutes of the server starting';
  const kindName = k => alerts.KINDS[k]?.label || k;
  const src = r => (r.source === 'ADMIN_ALERTS_TO' ? 'ADMIN_ALERTS_TO' : r.source === 'google' ? "an admin's Google address" : "an admin's saved address");
  return html`<section class="panel" id="e-alerts"><h2>Admin alerts</h2>
    <p>${state}</p>
    ${a.killed ? '' : html`<form data-api="/api/admin/emails/admin-alerts" data-reload data-toast="${a.on ? 'Admin alerts switched off.' : 'Admin alerts switched on.'}" ${a.on ? raw('data-confirm="Stop emailing you admin alerts?"') : ''}><input type="hidden" name="on" value="${a.on ? '0' : '1'}"><button class="btn ${a.on ? '' : 'btn-primary'}" type="submit">${a.on ? 'Switch off' : 'Switch on'}</button></form>`}
    <h3>What to email you about</h3>
    <ul class="alerts-kinds">${a.kinds.map(k => html`<li><span class="ak-l"><span class="chip-s ${k.on ? 'good' : 'warn'}">${k.on ? 'on' : 'off'}</span> ${k.label}</span>
      <form data-api="/api/admin/emails/admin-alerts/kind" data-reload data-toast="${k.on ? 'Switched off.' : 'Switched on.'}"><input type="hidden" name="kind" value="${k.kind}"><input type="hidden" name="on" value="${k.on ? '0' : '1'}"><button class="btn btn-sm" type="submit" aria-label="${k.on ? 'Switch off' : 'Switch on'}: ${k.label}">${k.on ? 'Switch off' : 'Switch on'}</button></form></li>`)}</ul>
    <h3>Who gets them</h3>
    ${a.recipients.length ? html`<ul class="small" id="alerts-to" style="margin:0 0 8px">${a.recipients.map(r => html`<li><b dir="ltr">${email.maskEmail(r.email)}</b> <span class="muted">(${src(r)})</span></li>`)}</ul>`
      : html`<p class="notice bad" role="alert" id="alerts-no-address"><b>No address is known.</b> Alerts wait (up to 2 days) and are not sent until a platform admin account has a Google sign-in, or ADMIN_ALERTS_TO is set on the server.</p>`}
    <p class="small muted">Only platform admin accounts, plus the addresses in ADMIN_ALERTS_TO. ${next}${a.waiting ? html` · <b>${int(a.waiting)}</b> waiting` : ''}.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><a class="btn btn-sm" href="/admin/emails/preview-alerts" target="_blank" rel="noopener">Preview</a><a class="btn btn-sm" href="/admin/emails/preview-alerts?format=text" target="_blank" rel="noopener">Text</a>
      <form data-api="/api/admin/emails/admin-alerts/test" data-toast="Test alert sent."><button class="btn btn-sm" type="submit" ${!a.killed && s.sending && a.recipients.length ? '' : raw('disabled')}>Send a test alert</button></form></div>
    <h3>Last emails</h3>
    ${a.batches.length ? html`<div class="tblwrap"><table class="tbl small atable" id="alerts-log"><thead><tr><th>When</th><th>What</th><th>Status</th><th>Sent to</th></tr></thead><tbody>
      ${a.batches.map(b => html`<tr><td data-label="When">${when(b.created_at)}</td><td data-label="What">${b.test ? 'Test alert' : Object.entries(b.kinds).map(([k, n]) => `${kindName(k)}: ${n}`).join(' · ') || `${int(b.items)} item${b.items === 1 ? '' : 's'}`}</td><td data-label="Status">${ALERT_STATUS[b.status] || b.status}${b.attempts > 1 ? ` (${b.attempts} tries)` : ''}${b.error && b.status !== 'sent' ? html` <span class="muted">${b.error}</span>` : ''}</td><td data-label="Sent to">${int(b.delivered)} of ${int(b.recipients)}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted small">None sent yet.</p>`}
  </section>`;
}
router.get('/admin/emails/preview-alerts', (req, res) => {
  const m = alerts.renderEmail(alerts.sampleItems(), { test: true });
  res.set('Cache-Control', 'no-store');
  if (req.query.format === 'text') return res.type('text/plain; charset=utf-8').send(`Subject: ${m.subject}\n\n${m.text}`);
  res.type('html').send(m.html);
});
router.post('/api/admin/emails/admin-alerts', (req, res) => {
  const v = (req.body || {}).on;
  res.json({ ok: true, on: alerts.setSwitch(req.user, v === true || v === '1') });
});
router.post('/api/admin/emails/admin-alerts/kind', (req, res) => {
  const b = req.body || {};
  const on = alerts.setKind(req.user, String(b.kind || ''), b.on === true || b.on === '1');
  if (on === null) return res.status(404).json({ error: 'No such kind of alert.' });
  res.json({ ok: true, on });
});
const ALERT_TEST_ERR = { killed: 'ADMIN_ALERTS=0 is set on the server.', off: 'Sending is off: set RESEND_API_KEY (and EMAIL_ENABLED not 0).', no_recipient: 'No address to send to: sign in with Google as an admin, or set ADMIN_ALERTS_TO.' };
router.post('/api/admin/emails/admin-alerts/test', rateLimit('admin-email-test', 10, 10 * 60e3), async (req, res) => {
  const r = await alerts.sendTest(req.user);
  if (!r.ok) return res.status(ALERT_TEST_ERR[r.code] ? 409 : 502).json({ error: ALERT_TEST_ERR[r.code] || `Not sent (${r.code}).` });
  res.json({ ok: true, toast: `Test alert sent to ${r.to.map(email.maskEmail).join(', ')}.` });
});
// The weekly class summary (services/digest.js; docs/decisions.md "Weekly class summary email").
const DIGEST_REASON = { empty: 'nothing new in any class', no_address: 'no address', unsubscribed: 'turned off', not_adult: 'not an adult account' };
/** A made-up week for the preview and the test send: counts only, like the real one. */
const sampleDigest = () => ({ active: [
  { id: 'sample-a', name: 'Room 12 Science', school: 'Sample School', due: 2, pct: 64, toRead: 5, notStarted: 3, live: 1 },
  { id: 'sample-b', name: 'Coding Club', school: 'Sample School', due: 0, pct: null, toRead: 0, notStarted: 0, live: 2 },
], quiet: [{ id: 'sample-c', name: 'Art' }] });
const sampleSlot = () => { const p = { day: 1, hour: 7, zone: digest.FALLBACK_TZ }; return digest.slotFor(p); };
function digestSection(s, to) {
  const on = digest.switchOn();
  const c = digest.sendCounts();
  const n = k => int(c.status[k] || 0);
  const why = Object.entries(c.reasons).map(([k, v]) => `${DIGEST_REASON[k] || k}: ${v}`).join(' · ');
  return html`<section class="panel" id="e-digest"><h2>Weekly class summary</h2>
    <p>${on ? 'On: each teacher gets one email a week at the day and hour they picked (default Monday 7:00 in their school\'s time zone), with counts per class and no student names or answers. Weeks with nothing new send nothing.' : 'Switched off: no weekly summary is sent. A week missed while it is off is not sent later.'}${s.sending ? '' : ' Sending is off, so nothing goes either way.'}</p>
    <form data-api="/api/admin/emails/digest" data-reload data-toast="${on ? 'Weekly summary switched off.' : 'Weekly summary switched on.'}" ${on ? raw('data-confirm="Stop sending the weekly class summary?"') : ''}><input type="hidden" name="on" value="${on ? '0' : '1'}"><button class="btn ${on ? '' : 'btn-primary'}" type="submit">${on ? 'Switch off' : 'Switch on'}</button></form>
    <div class="tblwrap"><table class="tbl small atable" style="margin-top:12px"><thead><tr><th>Email</th><th>Sent (30 days)</th><th>Skipped</th><th>Waiting</th><th>Failed</th></tr></thead><tbody>
      <tr id="e-digest-row"><td>📬 Weekly class summary (teachers)</td><td data-label="Sent (30 days)">${n('sent')}</td><td data-label="Skipped">${n('skipped')}${why ? html` <span class="muted">(${why})</span>` : ''}</td><td data-label="Waiting">${int((c.status.pending || 0) + (c.status.sending || 0))}</td><td data-label="Failed">${n('failed')}</td></tr>
    </tbody></table></div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px"><a class="btn btn-sm" href="/admin/emails/preview-digest" target="_blank" rel="noopener">Preview</a><a class="btn btn-sm" href="/admin/emails/preview-digest?format=text" target="_blank" rel="noopener">Text</a>
      <form data-api="/api/admin/emails/digest-test" data-toast="Test sent."><button class="btn btn-sm" type="submit" ${s.sending && to ? '' : raw('disabled')}>Send me a test</button></form></div>
  </section>`;
}
router.get('/admin/emails/preview-digest', (req, res) => {
  const m = renderDigest(sampleUser(req.user), sampleDigest(), sampleSlot(), { firstName: 'Alex' });
  res.set('Cache-Control', 'no-store');
  if (req.query.format === 'text') return res.type('text/plain; charset=utf-8').send(`Subject: ${m.subject}\nPreview: ${m.preview}\n\n${m.text}`);
  res.type('html').send(m.html);
});
router.post('/api/admin/emails/digest', (req, res) => {
  const v = (req.body || {}).on;
  res.json({ ok: true, on: digest.setSwitch(req.user, v === true || v === '1') });
});
router.post('/api/admin/emails/digest-test', rateLimit('admin-email-test', 10, 10 * 60e3), async (req, res) => {
  if (!email.sendingOn()) return res.status(409).json({ error: 'Sending is off: set RESEND_API_KEY (and EMAIL_ENABLED not 0).' });
  const to = testAddress(req.user);
  if (!to) return res.status(409).json({ error: 'No address to send to: sign in with Google, or set CONTACT_EMAIL.' });
  const m = renderDigest(req.user, sampleDigest(), sampleSlot());
  const r = await email.send({ userId: req.user.id, template: 'class_digest', category: 'test', subject: `[Test] ${m.subject}`, html: m.html, text: m.text, to });
  audit(req.user.id, 'admin.emails.test', 'class_digest', { status: r.status });
  if (r.status !== 'sent') return res.status(502).json({ error: `Not sent (${r.reason || r.status}).` });
  res.json({ ok: true, toast: `Test sent to ${email.maskEmail(to)}.` });
});
router.get('/admin/emails/preview/:step', (req, res) => {
  if (!nudges.TRIAL_STEPS.includes(req.params.step)) return res.status(404).type('text').send('No such email.');
  const m = nudges.renderFor(req.params.step, sampleUser(req.user), sampleTrial());
  res.set('Cache-Control', 'no-store');
  if (req.query.format === 'text') return res.type('text/plain; charset=utf-8').send(`Subject: ${m.subject}\nPreview: ${m.preview}\n\n${m.text}`);
  res.type('html').send(m.html);
});
router.post('/api/admin/emails/nudges', (req, res) => {
  const v = (req.body || {}).on;
  res.json({ ok: true, on: nudges.setSwitch(req.user, v === true || v === '1') });
});
router.post('/api/admin/emails/test', rateLimit('admin-email-test', 10, 10 * 60e3), async (req, res) => {
  const step = String((req.body || {}).step || '');
  if (!nudges.TRIAL_STEPS.includes(step)) return res.status(404).json({ error: 'No such email.' });
  if (!email.sendingOn()) return res.status(409).json({ error: 'Sending is off: set RESEND_API_KEY (and EMAIL_ENABLED not 0).' });
  const to = testAddress(req.user);
  if (!to) return res.status(409).json({ error: 'No address to send to: sign in with Google, or set CONTACT_EMAIL.' });
  const m = nudges.renderFor(step, req.user, sampleTrial());
  const r = await email.send({ userId: req.user.id, template: `trial_${step}`, category: 'test', subject: `[Test] ${m.subject}`, html: m.html, text: m.text, to });
  audit(req.user.id, 'admin.emails.test', step, { status: r.status });
  if (r.status !== 'sent') return res.status(502).json({ error: `Not sent (${r.reason || r.status}).` });
  res.json({ ok: true, toast: `Test sent to ${email.maskEmail(to)}.` });
});

// ---- APIs ----
const note = req => String((req.body || {}).note || '').slice(0, 500);
const gameAct = fn => (req, res) => {
  const g = fn(req);
  if (!g) return res.status(404).json({ error: 'Game not found or nothing to do.' });
  res.json({ ok: true });
};
router.post('/api/admin/games/:id/approve', gameAct(req => mod.approve(req.user, req.params.id, note(req))));
router.post('/api/admin/games/:id/reject', gameAct(req => mod.reject(req.user, req.params.id, note(req), String((req.body || {}).reason || ''))));
// The Oomba team writes to one person (services/team.js: a child's messages are copied to their grown-up and audited).
router.post('/api/admin/users/:id/message', rateLimit('admin-dm', 30, 10 * 60e3), (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id=?', String(req.params.id));
  const r = team.sendDirect(req.user, u, String((req.body || {}).text || ''));
  res.status(r.ok ? 200 : r.code === 'missing' ? 404 : 400).json(r.ok ? { ok: true, copiedTo: r.copiedTo.map(g => g.username) } : { error: r.error, code: r.code });
});
// The automatic welcomes (team.js welcomeSettings / saveWelcome): audience 'kid' (the default), 'grownup' or 'teacher'.
router.post('/api/admin/team/welcome', (req, res) => {
  const b = req.body || {};
  const r = team.saveWelcome(req.user, { audience: b.audience === undefined ? 'kid' : String(b.audience), on: b.on === '1' || b.on === true || b.on === 'on', text: String(b.text || '') });
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.error, code: r.code });
});
// Unsend a team message or an announcement (team.js unsendDirect / unsendAnnouncement).
router.post('/api/admin/team/messages/:id/unsend', (req, res) => {
  const r = team.unsendDirect(req.user, req.params.id);
  res.status(r.ok ? 200 : r.code === 'missing' ? 404 : 400).json(r.ok ? r : { error: r.error, code: r.code });
});
router.post('/api/admin/announcements/:id/unsend', (req, res) => {
  const r = team.unsendAnnouncement(req.user, req.params.id);
  res.status(r.ok ? 200 : r.code === 'missing' ? 404 : 400).json(r.ok ? r : { error: r.error, code: r.code });
});
// Announcements: preview (how many people, and the confirm code), then send with that code. Limits live in team.js.
const annInput = req => { const b = req.body || {}; return { audience: String(b.audience || ''), schoolId: String(b.schoolId || ''), text: String(b.text || ''), confirm: String(b.confirm || '') }; };
router.post('/api/admin/announcements/preview', rateLimit('admin-ann', 30, 10 * 60e3), (req, res) => {
  const r = team.previewAnnouncement(req.user, annInput(req));
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.error, code: r.code });
});
router.post('/api/admin/announcements', rateLimit('admin-ann', 30, 10 * 60e3), (req, res) => {
  const r = team.sendAnnouncement(req.user, annInput(req));
  res.status(r.ok ? 200 : r.code === 'rate' || r.code === 'daily' ? 429 : 400).json(r.ok ? r : { error: r.error, code: r.code });
});
router.post('/api/admin/games/:id/restore', gameAct(req => mod.restoreGame(req.user, req.params.id)));
router.post('/api/admin/games/:id/suspend', gameAct(req => mod.suspendGame(req.user, req.params.id, note(req))));
router.post('/api/admin/games/:id/unsuspend', gameAct(req => mod.unsuspendGame(req.user, req.params.id)));
router.post('/api/admin/chat-reports/:id/hide', (req, res) => (mod.hideMessage(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
router.post('/api/admin/chat-reports/:id/dismiss', (req, res) => (mod.dismissChatReport(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
router.post('/api/admin/chat-reports/:id/ban', (req, res) => { const r = mod.banSender(req.user, req.params.id); res.status(r.ok ? 200 : 400).json(r); });
router.get('/api/admin/users', (req, res) => { const u = mod.findUser(req.query.username); return u ? res.json({ user: u }) : res.status(404).json({ error: 'No user with that exact name.' }); });
router.post('/api/admin/users/:id/ban', (req, res) => { const r = mod.banUser(req.user, req.params.id, note(req)); res.status(r.ok ? 200 : 400).json(r); });
router.post('/api/admin/users/:id/photo/remove', (req, res) => (photos.removePhoto(req.params.id, req.user.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'That player has no photo.' })));
// After a ban: pause (ban, reason made-by-banned) the accounts this grown-up made that are still theirs (family.pausableMade:
// not a child who left or reported them), so the admin can review them.
router.post('/api/admin/users/:id/pause-made', (req, res) => {
  const g = q.get('SELECT * FROM users WHERE id=?', String(req.params.id || ''));
  if (!g || g.account_type !== 'grownup') return res.status(404).json({ error: 'No grown-up with that id.' });
  res.json({ ok: true, paused: family.pauseMade(req.user, g.id, mod.banUser) });
});
router.post('/api/admin/users/:id/unban', (req, res) => { const r = mod.unbanUser(req.user, req.params.id); res.status(r.ok ? 200 : 400).json(r); });
router.get('/api/admin/audit', (req, res) => res.json({ rows: mod.auditLog(200) }));
// Family links (services/family.js): a link report done, its grown-up banned (every link of theirs ends), a link broken.
// "Looks good" on a request whose sender signed up with their school (account first): the welcome email to the
// request's address (services/school-welcome.js: sign in with their own account, the checklist, how teachers start),
// then the request is done. Nothing is made: the account and the school already exist.
router.post('/api/admin/school-requests/:id/approve', async (req, res) => {
  const r = schoolRequests.getRequest(req.params.id);
  if (!r || r.status !== 'open' || !r.school_id || !r.user_id) return res.status(404).json({ error: 'That request is not waiting (or has no school yet: use Set up this school).' });
  const s = getSchool(r.school_id), u = getUser(r.user_id);
  if (!s || !u) return res.status(404).json({ error: 'That school or account is gone.' });
  let sent;
  try {
    sent = await sendSchoolWelcome(tFor(CODES.includes(r.locale) ? r.locale : 'en'), { user: u, email: r.email, name: r.contact_name || '', school: s.name, setUrl: null,
      schoolUrl: `${email.siteBase()}/school/${s.slug}`, loginUrl: `${email.siteBase()}/login` });
  } catch { sent = { status: 'failed', reason: 'error' }; }
  schoolRequests.close(req.user, r.id, 'done', { schoolId: s.id });
  audit(req.user.id, 'school.welcome_email', s.id, { user: u.id, status: sent.status, account: 'signup' });
  res.json({ ok: true, toast: sent.status === 'sent' ? `Welcome email sent to ${email.maskEmail(r.email)}.` : `Marked done, but the email was not sent (${sent.reason || sent.status}). Use Welcome email on the Schools list to try again.` });
});
router.post('/api/admin/school-requests/:id/:what', (req, res) => {
  const { id, what } = req.params;
  const ok = what === 'reopen' ? schoolRequests.reopen(req.user, id) : schoolRequests.close(req.user, id, what);
  return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'That request is not waiting (or is gone).' });
});
router.post('/api/admin/live-reports/:id/resolve', (req, res) => (liveR.resolveReport(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Report not found.' })));
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
const REQUEST_ERRORS = { noRequest: 'That request is not open any more.', noSchool: 'The school is gone.', entitled: 'This school already has a plan (or one waiting for a payment).', noPrice: 'No active Stripe Price has the lookup key oomba_teacher_yearly.', minSeats: 'Type a number of teacher seats (at least 1).', seatsNeeded: 'This request counted students: type the number of teachers.', noInvoice: 'No open invoice of a school plan has that id.' };
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
// Spark Packs (services/sparks.js): the owner grants messages to a family or ends what is left of a pack. Audited.
router.post('/api/admin/billing/sparks/grant', (req, res) => {
  const b = req.body || {};
  const u = getUserByName(String(b.username || '').trim());
  if (!u) return res.status(404).json({ error: 'No account with that username.', field: 'username' });
  const fam = family.familyOfOwner(u.id) || family.familyById(family.linkOf(u.id)?.family_id);
  if (!fam) return res.status(404).json({ error: 'That account has no family (a grown-up, or a child linked to one).', field: 'username' });
  const r = sparks.grant(req.user, fam.id, b.messages, String(b.note || ''));
  if (!r.ok) return res.status(400).json({ error: r.code === 'badCount' ? `Between 1 and ${sparks.GRANT_MAX} messages.` : 'No such family.', field: 'messages' });
  res.json({ ok: true });
});
router.post('/api/admin/billing/sparks/:id/revoke', (req, res) => {
  const r = sparks.revoke(req.user, req.params.id);
  if (!r.ok) return res.status(404).json({ error: 'No active pack with that id.' });
  res.json({ ok: true });
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
