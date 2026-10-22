// Creator dashboard (/creator) and the admin money page (/admin/money). Money node.
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, fmtMoney, timeAgo } from '../views/html.js';
import { page } from '../views/layout.js';
import { emptyState, avatar, statusLabel } from '../views/components.js';
import { requireAccount, requireAdmin } from '../auth.js';
import { today, audit } from '../db.js';
import { rateLimit } from '../services/ratelimit.js';
import * as earnings from '../services/earnings.js';

export const router = Router();
const HEAD = '<link rel="stylesheet" href="/css/creator.css">';

/** Money from millicents, rounded down to whole cents; tiny amounts say so instead of "$0.00". */
export function fmtEst(mc) {
  mc = +mc || 0;
  if (mc > 0 && mc < 1000) return 'under 1¢';
  return fmtMoney(Math.floor(mc / 1000));
}
const shortDay = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekday = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
const PAYOUT_LABEL = { requested: '⏳ Waiting', paid: '✅ Paid', cancelled: '↩️ Cancelled' };

function mstat(value, label, extra = '') {
  return html`<div class="mstat"><b ${extra ? raw(extra) : ''}>${value}</b><span>${label}</span></div>`;
}

function chart(daily) {
  const max = Math.max(...daily.map(d => d.millicents), 1);
  const anyMoney = daily.some(d => d.millicents > 0);
  return html`<figure class="bars-fig">
    <div class="bars" aria-hidden="true">
      ${daily.map(d => html`<div class="bar" title="${shortDay(d.day)}: ${fmtEst(d.millicents)}, ${fmtNum(d.impressions)} ad views">
        <span class="fill" style="--h:${d.millicents ? Math.max(4, Math.round(d.millicents / max * 100)) : 0}%"></span>
        <span class="lbl">${+d.day.slice(8)}</span></div>`)}
    </div>
    <figcaption class="small muted">${anyMoney ? 'Each bar is one day. Taller bar = more earned.' : 'No earnings in the last 14 days yet. Bars grow here when players see the Sponsored cards.'}</figcaption>
  </figure>
  <details class="daytable"><summary>Show the numbers for each day</summary>
    <div class="tblwrap"><table class="tbl"><caption class="sr-only">Estimated earnings for each of the last 14 days</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Ad views</th><th scope="col">Earned (estimate)</th></tr></thead>
      <tbody>${[...daily].reverse().map(d => html`<tr><th scope="row">${weekday(d.day)} ${shortDay(d.day)}</th><td>${fmtNum(d.impressions)}</td><td>${fmtEst(d.millicents)}</td></tr>`)}</tbody>
    </table></div>
  </details>`;
}

function gameBlock(g) {
  return html`<li class="panel mgame">
    <div class="mgame-head">
      <span class="mgame-icon cover-${g.cover || 'sunset'}" aria-hidden="true">${g.icon}</span>
      <div style="min-width:0;flex:1"><h3><a href="/g/${g.slug}">${g.title}</a></h3><span class="small muted">${statusLabel(g)}</span></div>
      <div class="mgame-earned"><b>${fmtEst(g.lifetimeMillicents)}</b><span class="small muted">earned</span></div>
    </div>
    <div class="mstats compact">
      ${mstat(fmtNum(g.plays), 'plays')}
      ${mstat(fmtNum(g.uniquePlayers), 'players')}
      ${mstat(g.ratingCount ? g.rating.toFixed(1) + ' ★' : 'New', g.ratingCount ? `${fmtNum(g.ratingCount)} ratings` : 'no ratings')}
      ${mstat(String(g.live), 'playing now', `data-live="${g.id}" data-live-format="number"`)}
      ${mstat(fmtNum(g.impressions), 'ad views')}
    </div>
  </li>`;
}

router.get('/creator', requireAccount, (req, res) => {
  const u = req.user;
  const s = earnings.creatorSummary(u.id);
  const b = s.balance;
  const per1000 = fmtMoney(Math.round(s.ecpmCents * s.share));
  const pct = Math.min(100, Math.round(b.availableCents / Math.max(1, b.thresholdCents) * 100));
  const explain = html`<section class="panel" aria-labelledby="how-h"><h2 id="how-h">💡 How earnings work</h2>
    <ul class="howlist">
      <li>Your games earn when players see the small <b>Sponsored</b> cards on your game's page, or next to your game on Home and Search.</li>
      <li>About 1,000 views of those cards earn your games about <b>${per1000}</b>. You get ${Math.round(s.share * 100)}% and the rest keeps BRB Gaming free.</li>
      <li>We never show ads inside games or while you play.</li>
      <li>Your own visits don't count. Each player counts once an hour.</li>
      <li>These numbers are an <b>estimate</b>. They update every hour and can change after we check for cheating.</li>
    </ul></section>`;
  if (!s.games.length) {
    const body = html`<div class="pagehead"><h1>💰 Creator money</h1></div>
      <section class="panel">${emptyState({ emoji: '🛠️', title: 'Build a game to start earning', text: 'When players enjoy your games, you earn money from the small Sponsored cards they see.', action: { href: '/build', label: 'Build a game' } })}</section>
      ${explain}`;
    return page(req, res, { title: 'Creator money', active: 'me', back: '/me', backLabel: 'Me', head: HEAD, body });
  }
  const body = html`
  <div class="pagehead"><h1>💰 Creator money</h1><span class="estpill">Estimate</span></div>
  <section class="mstats big" aria-label="All your games">
    ${mstat(fmtEst(s.totals.lifetimeMillicents), 'earned so far')}
    ${mstat(fmtNum(s.totals.impressions), 'ad views')}
    ${mstat(fmtNum(s.totals.plays), 'plays')}
    ${mstat(fmtNum(s.totals.uniquePlayers), 'players')}
    ${mstat(s.totals.ratingCount ? s.totals.rating.toFixed(1) + ' ★' : 'New', 'average stars')}
    ${mstat(String(s.totals.live), 'playing now', `id="live-total"`)}
  </section>
  <div class="grid2">
    <div class="stack">
      <section class="panel" aria-labelledby="days-h"><h2 id="days-h">📈 Last 14 days</h2>${chart(s.daily)}</section>
      <section aria-labelledby="games-h"><h2 id="games-h">🎮 Your games</h2>
        <ul class="mgames">${s.games.map(gameBlock)}</ul></section>
    </div>
    <div class="stack">
      <section class="panel" aria-labelledby="pay-h"><h2 id="pay-h">🏦 Payouts</h2>
        <div class="paybox">
          <div class="mstat"><b>${fmtMoney(b.availableCents)}</b><span>ready to pay out</span></div>
          <div class="progress" role="progressbar" aria-label="Progress to the payout minimum" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
          <p class="small muted">${s.canRequest ? 'You reached the minimum. You can ask for a payout!' : `You can ask for a payout at ${fmtMoney(b.thresholdCents)}. ${fmtMoney(Math.max(0, b.thresholdCents - b.availableCents))} to go.`}</p>
          <button class="btn btn-primary btn-block" type="button" id="payout-btn" ${s.canRequest ? '' : raw('disabled aria-disabled="true"')}>Ask for a payout</button>
          <p class="small muted" style="margin-top:10px">Our team pays every payout by hand. If you are under 18, we check with your parent or guardian first.</p>
        </div>
        <dl class="paylist">
          <div><dt>Waiting to be paid</dt><dd>${fmtMoney(b.pendingCents)}</dd></div>
          <div><dt>Paid to you</dt><dd>${fmtMoney(b.paidCents)}</dd></div>
        </dl>
        ${s.payouts.length ? html`<h3>History</h3><ul class="payhist">${s.payouts.map(p => html`<li><span>${new Date(p.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span><b>${fmtMoney(p.amount_cents)}</b><span class="tag">${PAYOUT_LABEL[p.status] || p.status}</span></li>`)}</ul>` : ''}
      </section>
      ${explain}
    </div>
  </div>
  ${jsonData('page-data', { canRequest: s.canRequest, available: b.availableCents })}`;
  page(req, res, { title: 'Creator money', active: 'me', back: '/me', backLabel: 'Me', head: HEAD, body, scripts: ['/js/creator.js'] });
});

router.get('/api/creator/summary', requireAccount, (req, res) => res.json(earnings.creatorSummary(req.user.id)));

router.post('/api/creator/payout', requireAccount, rateLimit('payout', 5, 60e3), (req, res) => {
  const r = earnings.requestPayout(req.user);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, payout: r.payout });
});

// ---------- Admin ----------
router.get('/admin/money', requireAdmin, (req, res) => {
  const t = earnings.adminTotals();
  const payouts = earnings.adminPayouts();
  const lr = t.lastRollup;
  const body = html`
  <div class="pagehead"><h1>💰 Money</h1></div>
  <section class="mstats big" aria-label="Totals">
    ${mstat(fmtNum(t.impressions), 'impressions in ledger')}
    ${mstat(fmtNum(t.todayImpressions), 'impressions today (raw)')}
    ${mstat(fmtEst(t.grossMillicents), 'ad revenue (est.)')}
    ${mstat(fmtEst(t.builderMillicents), 'builders’ share')}
    ${mstat(fmtMoney(t.pendingCents), `requested (${t.openRequests})`)}
    ${mstat(fmtMoney(t.paidCents), 'paid out')}
  </section>
  <div class="grid2">
    <section class="panel" aria-labelledby="po-h"><h2 id="po-h">Payout requests</h2>
      ${payouts.length ? html`<ul class="adminpay">${payouts.map(p => html`<li class="${p.status}">
        <div class="who">${avatar(p, 40)}<div style="min-width:0"><b>${p.display_name}</b><br><span class="small muted">@${p.username} · ${timeAgo(p.created_at)}</span></div></div>
        <div class="amt"><b>${fmtMoney(p.amount_cents)}</b><span class="tag">${PAYOUT_LABEL[p.status] || p.status}</span></div>
        ${p.status === 'requested' ? html`<div class="row acts"><button class="btn btn-primary btn-sm" type="button" data-payout="${p.id}" data-status="paid">Mark paid</button><button class="btn btn-sm" type="button" data-payout="${p.id}" data-status="cancelled">Cancel</button></div>`
          : html`<div class="small muted">${p.handled_name ? `by @${p.handled_name}` : ''}${p.note ? ` · “${p.note}”` : ''}</div>`}
      </li>`)}</ul>` : html`<p class="muted">No payout requests yet.</p>`}
    </section>
    <div class="stack">
      <section class="panel" aria-labelledby="ru-h"><h2 id="ru-h">Roll up earnings</h2>
        <p class="small muted">Turns ad impressions into the earnings ledger. Runs every hour on its own (today and yesterday). Safe to run again: it replaces that day.</p>
        <form id="rollup-form" class="stack">
          <label class="field"><span>Day</span><input class="input" type="date" name="day" id="rollup-day" value="${today()}" max="${today()}" required></label>
          <button class="btn btn-primary" type="submit">Roll up now</button>
        </form>
        <p class="small muted" id="rollup-last">${lr ? `Last run: ${lr.day}, ${lr.games} game${lr.games === 1 ? '' : 's'}, ${timeAgo(lr.at)}.` : 'Not run yet.'}</p>
      </section>
      <section class="panel" aria-labelledby="set-h"><h2 id="set-h">Settings</h2>
        <dl class="paylist">
          <div><dt>eCPM (per 1,000 impressions)</dt><dd>${fmtMoney(t.ecpmCents)}</dd></div>
          <div><dt>Builder share</dt><dd>${Math.round(t.share * 100)}%</dd></div>
          <div><dt>Payout minimum</dt><dd>${fmtMoney(t.thresholdCents)}</dd></div>
          <div><dt>Impressions per IP per day</dt><dd>${fmtNum(t.ipCap)}</dd></div>
        </dl>
        <p class="small muted">Set with AD_ECPM_CENTS, BUILDER_SHARE, PAYOUT_THRESHOLD_CENTS, AD_IP_DAILY_CAP. The 70% share is waiting for the owner to confirm.</p>
      </section>
    </div>
  </div>`;
  page(req, res, { title: 'Money', active: 'me', back: '/admin', backLabel: 'Admin', head: HEAD, body, scripts: ['/js/creator.js'] });
});

router.post('/api/admin/money/rollup', requireAdmin, (req, res) => {
  const day = (req.body && req.body.day) || today();
  if (!earnings.isDay(day) || day > today()) return res.status(400).json({ error: 'Pick a day that is not in the future.' });
  const r = earnings.rollupDay(day);
  audit(req.user.id, 'earnings.rollup', day, r);
  res.json({ ok: true, result: r });
});

router.post('/api/admin/money/payouts/:id', requireAdmin, (req, res) => {
  const { status, note = '' } = req.body || {};
  const r = earnings.setPayoutStatus(req.user, req.params.id, status, note);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, payout: r.payout });
});
