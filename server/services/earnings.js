// Earnings ledger (Money node): impression recording + fraud controls, the roll-up into `earnings`,
// creator dashboard queries, and payout requests.
//
// Money maths (all integers, no floats stored):
//  - An impression on a game page (placement 'game') is worth 1 impression to that game.
//  - A grid impression is split equally across the games shown in that row (1/n each).
//  - weight_milli = impressions × 1000 (exact to 1/1000 of an impression, so splits don't vanish).
//  - Builder revenue per impression = eCPM / 1000 cents × builder share
//      => revenue_millicents = round(weight × eCPM × share)   (1 millicent = 1/1000 of a cent)
//    e.g. eCPM 200, share 0.7: one impression = 140 millicents = 0.14¢; 1000 impressions = $1.40.
//  - earnings.revenue_cents = round(revenue_millicents / 1000) per (game, day), kept for the shared
//    schema; lifetime totals and balances sum the exact millicents, then floor to whole cents.
//  - Roll-up is idempotent: rolling up a day deletes and rewrites that day's rows in one transaction.
import { q, uid, now, tx, audit, setting, migrate, today } from '../db.js';
import { config } from '../config.js';
import { register } from './jobs.js';
import { getGame, canView } from './games.js';
import * as presence from './presence.js';
import { getAd, PLACEMENTS } from './ads.js';
import { payoutAdapter } from './payouts.js';
import { tEn } from '../i18n/index.js';

migrate([['0002_money', `
  ALTER TABLE earnings ADD COLUMN weight_milli INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN revenue_millicents INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN ecpm_cents INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN share_milli INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE payouts ADD COLUMN paid_at INTEGER;
  ALTER TABLE payouts ADD COLUMN handled_by TEXT;
  CREATE INDEX IF NOT EXISTS adimp_ip ON ad_impressions(ip, day);
  CREATE INDEX IF NOT EXISTS earnings_day ON earnings(day);
  CREATE INDEX IF NOT EXISTS payouts_user ON payouts(user_id, status);
`]]);

export const hourKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 13); // 'YYYY-MM-DDTHH' (UTC)
export const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
/** Exact builder revenue for a (possibly fractional) number of impressions, in millicents. */
export const revenueMillicents = (impressions, ecpmCents = config.adEcpmCents, share = config.builderShare) => Math.round(impressions * ecpmCents * share);
/** Row value with a fallback for rows written without millicents (e.g. inserted by hand). */
const MC = 'COALESCE(NULLIF(e.revenue_millicents,0), e.revenue_cents*1000)';
const IMP = 'COALESCE(NULLIF(e.weight_milli,0), e.impressions*1000)';

// ---------- Impressions ----------
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_GRID = 16;
/** Validate a beacon body. Returns { ok: true, value } or { ok: false, error }. */
export function parseImpression(body) {
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return { ok: false, error: 'Bad request.' }; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Bad request.' };
  const { ad, placement } = body;
  if (!PLACEMENTS.includes(placement)) return { ok: false, error: 'Unknown placement.' };
  if (typeof ad !== 'string' || !ID_RE.test(ad)) return { ok: false, error: 'Unknown ad.' };
  if (placement === 'game') {
    if (typeof body.game !== 'string' || !ID_RE.test(body.game)) return { ok: false, error: 'Missing game.' };
    return { ok: true, value: { ad, placement, game: body.game, games: [] } };
  }
  let games = body.games;
  if (typeof games === 'string') games = games.split(',');
  if (!Array.isArray(games) || !games.length || games.length > MAX_GRID || !games.every(g => typeof g === 'string' && ID_RE.test(g))) return { ok: false, error: 'Missing games.' };
  return { ok: true, value: { ad, placement, game: null, games: [...new Set(games)] } };
}

/**
 * Record one impression after the fraud controls. Never throws for normal rejections.
 * Returns { counted: true, id } or { counted: false, reason }.
 * reasons: no-session | unknown-ad | no-game | owner | ip-cap | duplicate
 */
export function recordImpression({ user = null, sessionId = null, ip = '', ad, placement, game = null, games = [], t = now() }) {
  if (!sessionId) return { counted: false, reason: 'no-session' }; // bots / cookie-less hits don't count
  if (!getAd(ad)) return { counted: false, reason: 'unknown-ad' };
  let gameId = null, shown = [];
  if (placement === 'game') {
    const g = getGame(game);
    if (!g || !canView(user, g)) return { counted: false, reason: 'no-game' };
    if (user && g.owner_id === user.id) return { counted: false, reason: 'owner' };
    gameId = g.id;
  } else {
    const list = games.map(getGame).filter(g => g && canView(user, g));
    if (!list.length) return { counted: false, reason: 'no-game' };
    shown = list.filter(g => !(user && g.owner_id === user.id)).map(g => g.id);
    if (!shown.length) return { counted: false, reason: 'owner' };
  }
  const day = today(t), hour = hourKey(t);
  ip = String(ip || '').slice(0, 64);
  return tx(() => {
    if (q.get('SELECT COUNT(*) n FROM ad_impressions WHERE ip=? AND day=?', ip, day).n >= config.adIpDailyCap) return { counted: false, reason: 'ip-cap' };
    if (q.get('SELECT 1 FROM ad_impressions WHERE session_id=? AND placement=? AND hour=?', sessionId, placement, hour)) return { counted: false, reason: 'duplicate' };
    const id = uid();
    q.run('INSERT INTO ad_impressions(id, game_id, placement, ad_id, games_shown, user_id, session_id, ip, day, hour, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, gameId, placement, ad, shown.join(','), user ? user.id : null, sessionId, ip, day, hour, t);
    return { counted: true, id };
  });
}

// ---------- Roll-up ----------
/** Weighted impressions per game for one day: Map(gameId -> impressions, possibly fractional). */
export function dayWeights(day) {
  const w = new Map();
  const add = (id, x) => w.set(id, (w.get(id) || 0) + x);
  for (const r of q.all('SELECT placement, game_id, games_shown FROM ad_impressions WHERE day=?', day)) {
    if (r.placement === 'game') { if (r.game_id) add(r.game_id, 1); continue; }
    const ids = String(r.games_shown || '').split(',').filter(Boolean);
    for (const id of ids) add(id, 1 / ids.length);
  }
  return w;
}

/** Roll one day's impressions into `earnings`. Idempotent. */
export function rollupDay(day = today(), { ecpmCents = config.adEcpmCents, share = config.builderShare } = {}) {
  if (!isDay(day)) throw new Error('day must be YYYY-MM-DD');
  const weights = dayWeights(day);
  let totalMilli = 0, totalMc = 0;
  tx(() => {
    q.run('DELETE FROM earnings WHERE day=?', day);
    for (const [gameId, w] of weights) {
      const weightMilli = Math.round(w * 1000), mc = revenueMillicents(w, ecpmCents, share);
      totalMilli += weightMilli; totalMc += mc;
      q.run('INSERT INTO earnings(game_id, day, impressions, revenue_cents, weight_milli, revenue_millicents, ecpm_cents, share_milli) VALUES (?,?,?,?,?,?,?,?)',
        gameId, day, Math.round(w), Math.round(mc / 1000), weightMilli, mc, ecpmCents, Math.round(share * 1000));
    }
  });
  const result = { day, games: weights.size, impressions: totalMilli / 1000, builderMillicents: totalMc, at: now() };
  setting('earnings_last_rollup', JSON.stringify(result));
  return result;
}
export function lastRollup() { try { return JSON.parse(setting('earnings_last_rollup') || 'null'); } catch { return null; } }

// Scheduled: every hour roll up today (so dashboards stay fresh) and yesterday (catches impressions
// that landed just before midnight, and is the "nightly" roll-up). Cheap: one indexed day each.
export const ROLLUP_EVERY_MS = 60 * 60e3;
register('earnings-rollup', ROLLUP_EVERY_MS, () => { const d = today(); rollupDay(addDays(d, -1)); rollupDay(d); });

// ---------- Balances and payouts ----------
export function lifetimeMillicents(userId) {
  return q.get(`SELECT COALESCE(SUM(${MC}),0) mc FROM earnings e JOIN games g ON g.id=e.game_id WHERE g.owner_id=?`, userId).mc;
}
export function balance(userId) {
  const earnedCents = Math.floor(lifetimeMillicents(userId) / 1000);
  const p = q.get("SELECT COALESCE(SUM(CASE WHEN status='requested' THEN amount_cents END),0) pending, COALESCE(SUM(CASE WHEN status='paid' THEN amount_cents END),0) paid FROM payouts WHERE user_id=?", userId);
  return { earnedCents, pendingCents: p.pending, paidCents: p.paid, availableCents: Math.max(0, earnedCents - p.pending - p.paid), thresholdCents: config.payoutThresholdCents };
}
export const canRequestPayout = b => b.availableCents >= b.thresholdCents;
export const listPayouts = userId => q.all('SELECT * FROM payouts WHERE user_id=? ORDER BY created_at DESC', userId);

/** Ask for the whole available balance. Creates a 'requested' row for a person to handle. */
export function requestPayout(user, t = tEn) {
  if (!user || user.is_guest) return { ok: false, error: t('errors.api.needAccount') };
  return tx(() => {
    const b = balance(user.id);
    if (!canRequestPayout(b)) return { ok: false, error: t('creator.payouts.notYet', { min: `$${(b.thresholdCents / 100).toFixed(2)}` }) };
    const id = uid();
    q.run("INSERT INTO payouts(id, user_id, amount_cents, status, note, created_at) VALUES (?,?,?, 'requested', '', ?)", id, user.id, b.availableCents, now());
    audit(user.id, 'payout.request', id, { amount_cents: b.availableCents });
    const payout = q.get('SELECT * FROM payouts WHERE id=?', id);
    try { payoutAdapter().onRequested(payout, user); } catch { /* adapter is advisory; manual handling continues */ }
    return { ok: true, payout };
  });
}

/** Admin: mark a requested payout as paid (sent by hand) or cancel it (amount goes back to the balance). */
export function setPayoutStatus(admin, payoutId, status, note = '') {
  if (!['paid', 'cancelled'].includes(status)) return { ok: false, error: 'Unknown status.' };
  const p = q.get('SELECT * FROM payouts WHERE id=?', payoutId);
  if (!p) return { ok: false, error: 'Payout not found.' };
  if (p.status !== 'requested') return { ok: false, error: `This payout is already ${p.status}.` };
  q.run('UPDATE payouts SET status=?, note=?, paid_at=?, handled_by=? WHERE id=?', status, String(note || '').slice(0, 300), status === 'paid' ? now() : null, admin.id, p.id);
  audit(admin.id, status === 'paid' ? 'payout.mark_paid' : 'payout.cancel', p.id, { user: p.user_id, amount_cents: p.amount_cents, note: String(note || '').slice(0, 300) });
  return { ok: true, payout: q.get('SELECT * FROM payouts WHERE id=?', p.id) };
}

// ---------- Dashboard queries ----------
/** Everything /creator shows for one builder. */
export function creatorSummary(userId, { days = 14, day = today() } = {}) {
  const rows = q.all(`SELECT g.id, g.slug, g.title, g.icon, g.cover, g.status, g.visibility, g.plays, g.rating_sum, g.rating_count, g.hidden_reason,
      (SELECT COUNT(DISTINCT p.user_id) FROM plays p WHERE p.game_id=g.id AND p.user_id IS NOT NULL) AS unique_players,
      (SELECT COALESCE(SUM(${IMP}),0) FROM earnings e WHERE e.game_id=g.id) AS imp_milli,
      (SELECT COALESCE(SUM(${MC}),0) FROM earnings e WHERE e.game_id=g.id) AS mc
    FROM games g WHERE g.owner_id=? ORDER BY g.plays DESC, g.created_at DESC`, userId);
  const games = rows.map(r => ({
    id: r.id, slug: r.slug, title: r.title, icon: r.icon, cover: r.cover, status: r.status, visibility: r.visibility, hidden_reason: r.hidden_reason,
    plays: r.plays, uniquePlayers: r.unique_players, rating: r.rating_count ? r.rating_sum / r.rating_count : 0, ratingCount: r.rating_count,
    live: presence.count(r.id), impressions: Math.round(r.imp_milli / 1000), lifetimeMillicents: r.mc,
  }));
  const from = addDays(day, -(days - 1));
  const perDay = new Map(q.all(`SELECT e.day, SUM(${IMP}) imp_milli, SUM(${MC}) mc FROM earnings e JOIN games g ON g.id=e.game_id WHERE g.owner_id=? AND e.day BETWEEN ? AND ? GROUP BY e.day`, userId, from, day).map(r => [r.day, r]));
  const daily = Array.from({ length: days }, (_, i) => { const d = addDays(from, i); const r = perDay.get(d); return { day: d, impressions: r ? Math.round(r.imp_milli / 1000) : 0, millicents: r ? r.mc : 0 }; });
  const ratingSum = rows.reduce((s, r) => s + r.rating_sum, 0), ratingCount = rows.reduce((s, r) => s + r.rating_count, 0);
  const totals = {
    games: games.length,
    plays: games.reduce((s, g) => s + g.plays, 0),
    uniquePlayers: q.get('SELECT COUNT(DISTINCT p.user_id) n FROM plays p JOIN games g ON g.id=p.game_id WHERE g.owner_id=? AND p.user_id IS NOT NULL', userId).n,
    rating: ratingCount ? ratingSum / ratingCount : 0, ratingCount,
    live: games.reduce((s, g) => s + g.live, 0),
    impressions: Math.round(rows.reduce((s, r) => s + r.imp_milli, 0) / 1000),
    lifetimeMillicents: rows.reduce((s, r) => s + r.mc, 0),
  };
  const b = balance(userId);
  return { games, totals, daily, balance: b, canRequest: canRequestPayout(b), payouts: listPayouts(userId), lastRollup: lastRollup(),
    ecpmCents: config.adEcpmCents, share: config.builderShare };
}

/** Site-wide numbers for /admin/money. */
export function adminTotals() {
  const e = q.get(`SELECT COALESCE(SUM(${IMP}),0) imp_milli, COALESCE(SUM(${MC}),0) mc FROM earnings e`);
  const raw = q.get('SELECT COUNT(*) n FROM ad_impressions');
  const todayRaw = q.get('SELECT COUNT(*) n FROM ad_impressions WHERE day=?', today()).n;
  const p = q.get("SELECT COALESCE(SUM(CASE WHEN status='requested' THEN amount_cents END),0) pending, COALESCE(SUM(CASE WHEN status='paid' THEN amount_cents END),0) paid, COUNT(CASE WHEN status='requested' THEN 1 END) open FROM payouts");
  const share = config.builderShare;
  return {
    impressions: Math.round(e.imp_milli / 1000), rawImpressions: raw.n, todayImpressions: todayRaw,
    builderMillicents: e.mc, grossMillicents: share > 0 ? Math.round(e.mc / share) : 0,
    pendingCents: p.pending, paidCents: p.paid, openRequests: p.open,
    ecpmCents: config.adEcpmCents, share, thresholdCents: config.payoutThresholdCents, ipCap: config.adIpDailyCap, lastRollup: lastRollup(),
  };
}
export function adminPayouts(limit = 200) {
  return q.all(`SELECT p.*, u.username, u.display_name, u.avatar, u.color, h.username AS handled_name FROM payouts p JOIN users u ON u.id=p.user_id LEFT JOIN users h ON h.id=p.handled_by
    ORDER BY CASE p.status WHEN 'requested' THEN 0 ELSE 1 END, p.created_at DESC LIMIT ?`, limit);
}
