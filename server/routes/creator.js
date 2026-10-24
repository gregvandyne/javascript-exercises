// Creator dashboard (/creator) and the admin money page (/admin/money). Money node.
import { Router } from 'express';
import { html, raw, jsonData, fmtNum, fmtMoney, timeAgo } from '../views/html.js';
import { page } from '../views/layout.js';
import { emptyState, avatar, statusLabel } from '../views/components.js';
import { tEn, tHtml } from '../i18n/index.js';
import { requireAccount, requireAdmin } from '../auth.js';
import { today, audit } from '../db.js';
import { rateLimit } from '../services/ratelimit.js';
import * as earnings from '../services/earnings.js';

export const router = Router();
const HEAD = '<link rel="stylesheet" href="/css/creator.css">';

/** Money from millicents, rounded down to whole cents; tiny amounts say so instead of "$0.00". fmt/t: the reader's language. */
export function fmtEst(mc, fmt = null, t = tEn) {
  mc = +mc || 0;
  if (mc > 0 && mc < 1000) return t('creator.underOneCent');
  return fmt ? fmt.money(Math.floor(mc / 1000)) : fmtMoney(Math.floor(mc / 1000));
}
const dayDate = d => new Date(d + 'T00:00:00Z');
const PAYOUT_EMOJI = { requested: '⏳', paid: '✅', cancelled: '↩️' };
const payoutLabel = (status, t) => (PAYOUT_EMOJI[status] ? `${PAYOUT_EMOJI[status]} ${t(`creator.payoutStatus.${status}`)}` : status);

function mstat(value, label, extra = '') {
  return html`<div class="mstat"><b ${extra ? raw(extra) : ''}>${value}</b><span>${label}</span></div>`;
}

function chart(req, daily) {
  const t = req.t, f = req.fmt;
  const shortDay = d => dayDate(d).toLocaleDateString(f.intl, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekday = d => dayDate(d).toLocaleDateString(f.intl, { weekday: 'short', timeZone: 'UTC' });
  const max = Math.max(...daily.map(d => d.millicents), 1);
  const anyMoney = daily.some(d => d.millicents > 0);
  return html`<figure class="bars-fig">
    <div class="bars" aria-hidden="true" dir="ltr">
      ${daily.map(d => html`<div class="bar" title="${t('creator.chart.barTitle', { day: shortDay(d.day), money: fmtEst(d.millicents, f, t), views: f.int(d.impressions) })}">
        <span class="fill" style="--h:${d.millicents ? Math.max(4, Math.round(d.millicents / max * 100)) : 0}%"></span>
        <span class="lbl">${f.int(+d.day.slice(8))}</span></div>`)}
    </div>
    <figcaption class="small muted">${anyMoney ? t('creator.chart.caption') : t('creator.chart.empty')}</figcaption>
  </figure>
  <details class="daytable"><summary>${t('creator.chart.showNumbers')}</summary>
    <div class="tblwrap"><table class="tbl"><caption class="sr-only">${t('creator.chart.tableCaption')}</caption>
      <thead><tr><th scope="col">${t('creator.chart.day')}</th><th scope="col">${t('creator.stats.adViews')}</th><th scope="col">${t('creator.chart.earned')}</th></tr></thead>
      <tbody>${[...daily].reverse().map(d => html`<tr><th scope="row">${weekday(d.day)} ${shortDay(d.day)}</th><td>${f.int(d.impressions)}</td><td>${fmtEst(d.millicents, f, t)}</td></tr>`)}</tbody>
    </table></div>
  </details>`;
}

function gameBlock(req, g) {
  const t = req.t, f = req.fmt;
  return html`<li class="panel mgame">
    <div class="mgame-head">
      <span class="mgame-icon cover-${g.cover || 'sunset'}" aria-hidden="true">${g.icon}</span>
      <div style="min-width:0;flex:1"><h3><a href="/g/${g.slug}">${g.title}</a></h3><span class="small muted">${statusLabel(g, t)}</span></div>
      <div class="mgame-earned"><b>${fmtEst(g.lifetimeMillicents, f, t)}</b><span class="small muted">${t('creator.earned')}</span></div>
    </div>
    <div class="mstats compact">
      ${mstat(f.num(g.plays), t('game.stats.plays', { count: g.plays }))}
      ${mstat(f.num(g.uniquePlayers), t('creator.stats.players', { count: g.uniquePlayers }))}
      ${mstat(g.ratingCount ? g.rating.toFixed(1) + ' ★' : t('cards.new'), g.ratingCount ? t('game.stats.ratings', { count: g.ratingCount, n: f.num(g.ratingCount) }) : t('creator.stats.noRatings'))}
      ${mstat(String(g.live), t('game.stats.playingNow'), `data-live="${g.id}" data-live-format="number"`)}
      ${mstat(f.num(g.impressions), t('creator.stats.adViews'))}
    </div>
  </li>`;
}

router.get('/creator', requireAccount, (req, res) => {
  const t = req.t, f = req.fmt;
  const u = req.user;
  const s = earnings.creatorSummary(u.id);
  const b = s.balance;
  const per1000 = f.money(Math.round(s.ecpmCents * s.share));
  const pct = Math.min(100, Math.round(b.availableCents / Math.max(1, b.thresholdCents) * 100));
  const explain = html`<section class="panel" aria-labelledby="how-h"><h2 id="how-h">💡 ${t('creator.how.heading')}</h2>
    <ul class="howlist">
      <li>${tHtml(t, 'creator.how.p1')}</li>
      <li>${tHtml(t, 'creator.how.p2', { amount: per1000, share: Math.round(s.share * 100) })}</li>
      <li>${t('creator.how.p3')}</li>
      <li>${t('creator.how.p4')}</li>
      <li>${tHtml(t, 'creator.how.p5')}</li>
    </ul></section>`;
  if (!s.games.length) {
    const body = html`<div class="pagehead"><h1>💰 ${t('creator.title')}</h1></div>
      <section class="panel">${emptyState({ emoji: '🛠️', title: t('creator.empty.title'), text: t('creator.empty.text'), action: { href: '/build', label: t('home.empty.action') } })}</section>
      ${explain}`;
    return page(req, res, { title: t('creator.title'), active: 'me', back: '/me', backLabel: t('nav.me'), head: HEAD, body });
  }
  const body = html`
  <div class="pagehead"><h1>💰 ${t('creator.title')}</h1><span class="estpill">${t('creator.estimate')}</span></div>
  <section class="mstats big" aria-label="${t('creator.allGames')}">
    ${mstat(fmtEst(s.totals.lifetimeMillicents, f, t), t('creator.stats.earnedSoFar'))}
    ${mstat(f.num(s.totals.impressions), t('creator.stats.adViews'))}
    ${mstat(f.num(s.totals.plays), t('game.stats.plays', { count: s.totals.plays }))}
    ${mstat(f.num(s.totals.uniquePlayers), t('creator.stats.players', { count: s.totals.uniquePlayers }))}
    ${mstat(s.totals.ratingCount ? s.totals.rating.toFixed(1) + ' ★' : t('cards.new'), t('creator.stats.averageStars'))}
    ${mstat(String(s.totals.live), t('game.stats.playingNow'), `id="live-total"`)}
  </section>
  <div class="grid2">
    <div class="stack">
      <section class="panel" aria-labelledby="days-h"><h2 id="days-h">📈 ${t('creator.last14')}</h2>${chart(req, s.daily)}</section>
      <section aria-labelledby="games-h"><h2 id="games-h">🎮 ${t('creator.yourGames')}</h2>
        <ul class="mgames">${s.games.map(g => gameBlock(req, g))}</ul></section>
    </div>
    <div class="stack">
      <section class="panel" aria-labelledby="pay-h"><h2 id="pay-h">🏦 ${t('creator.payouts.heading')}</h2>
        <div class="paybox">
          <div class="mstat"><b>${f.money(b.availableCents)}</b><span>${t('creator.payouts.ready')}</span></div>
          <div class="progress" role="progressbar" aria-label="${t('creator.payouts.progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
          <p class="small muted">${s.canRequest ? t('creator.payouts.reached') : t('creator.payouts.toGo', { min: f.money(b.thresholdCents), left: f.money(Math.max(0, b.thresholdCents - b.availableCents)) })}</p>
          <button class="btn btn-primary btn-block" type="button" id="payout-btn" ${s.canRequest ? '' : raw('disabled aria-disabled="true"')}>${t('creator.payouts.ask')}</button>
          <p class="small muted" style="margin-top:10px">${t('creator.payouts.byHand')}</p>
        </div>
        <dl class="paylist">
          <div><dt>${t('creator.payouts.pending')}</dt><dd>${f.money(b.pendingCents)}</dd></div>
          <div><dt>${t('creator.payouts.paid')}</dt><dd>${f.money(b.paidCents)}</dd></div>
        </dl>
        ${s.payouts.length ? html`<h3>${t('creator.payouts.history')}</h3><ul class="payhist">${s.payouts.map(p => html`<li><span>${f.date(p.created_at)}</span><b>${f.money(p.amount_cents)}</b><span class="tag">${payoutLabel(p.status, t)}</span></li>`)}</ul>` : ''}
      </section>
      ${explain}
    </div>
  </div>
  ${jsonData('page-data', { canRequest: s.canRequest, available: b.availableCents })}`;
  page(req, res, { title: t('creator.title'), active: 'me', back: '/me', backLabel: t('nav.me'), head: HEAD, body, scripts: ['/js/creator.js'] });
});

router.get('/api/creator/summary', requireAccount, (req, res) => res.json(earnings.creatorSummary(req.user.id)));

router.post('/api/creator/payout', requireAccount, rateLimit('payout', 5, 60e3), (req, res) => {
  const r = earnings.requestPayout(req.user, req.t);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, payout: r.payout });
});

// ---------- Admin (internal, English only) ----------
const PAYOUT_LABEL = { requested: '⏳ Waiting', paid: '✅ Paid', cancelled: '↩️ Cancelled' };
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
