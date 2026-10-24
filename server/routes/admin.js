// Admin panel (role admin only). Internal tool: its text stays English (the page frame follows the admin's language). Non-admins get 404 for every page and API under /admin and /api/admin.
// Tabs: Review queue, Reports, Chat reports, Users, Audit log. Every action is audited (services/moderation.js, services/publish.js).
import * as aiBudget from '../services/ai-budget.js';
import * as stats from '../services/stats.js';
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
  const n = { queue: c.queue, reports: c.reports, chat: c.chat };
  const content = { queue: queueTab, reports: reportsTab, chat: chatTab, users: usersTab, audit: auditTab }[tab](req);
  const body = html`
  <div class="pagehead"><h1>🛡️ Admin</h1><div class="row"><a class="btn btn-primary" href="/admin/stats"><span aria-hidden="true">📊</span> Stats</a><a class="btn" href="/admin/money"><span aria-hidden="true">💰</span> Money</a></div></div>
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
const gameLink = g => html`<a href="/g/${g.slug}">${g.icon} ${g.title}</a>${g.source === 'seed' ? html` <span class="chip-s">launch</span>` : ''}`;

router.get('/admin/stats', (req, res) => {
  const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 30;
  const k = stats.kpis(), rows = stats.daily(days);
  const top7 = stats.topGames(7), topAll = stats.topGamesAllTime(10), builders = stats.topBuilders(10), areas = stats.areas(7), models = stats.aiByModel(30), fresh = stats.newestUsers(8);
  const tok = t => int((t.input || 0) + (t.output || 0));
  const body = html`
  <div class="pagehead"><h1>📊 Stats</h1><nav class="seg" aria-label="Time range">${[7, 30, 90].map(d => html`<a class="btn ${d === days ? 'btn-primary' : ''}" href="/admin/stats?days=${d}" ${d === days ? raw('aria-current="page"') : ''}>${d} days</a>`)}</nav></div>
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
    ${tile('💬 Builder messages today', int(k.ai.turnsToday), `from ${int(k.ai.buildersToday)} builder${k.ai.buildersToday === 1 ? '' : 's'}`)}
  </div>
  ${k.ai.ok ? '' : html`<p class="notice warn">The AI ${k.ai.reason} cap is reached: the Builder is using the offline builder until it resets.</p>`}

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
        ${areas.map(a => html`<tr><td>${a.area}</td><td>${int(a.views)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No visits counted yet. Counting started with this update.</p>`}
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
