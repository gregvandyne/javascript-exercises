// Earnings maths, impression fraud controls, roll-up, payouts (Money node).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const E = await import('../../server/services/earnings.js');

const DAY = '2026-03-10';
const T = Date.parse(DAY + 'T10:15:00Z');
const owner = auth.createUser({ username: 'MoneyOwner', password: 'secret1' });
const other = auth.createUser({ username: 'OtherBuilder', password: 'secret1' });
const viewer = auth.createUser({ username: 'Viewer1', password: 'secret1' });
function liveGame(ownerId, title, visibility = 'public') {
  const g = games.createGame(ownerId, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>hi</p>');
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id, g.id);
  return games.getGame(g.id);
}
const A = liveGame(owner.id, 'Alpha'), B = liveGame(owner.id, 'Bravo'), C = liveGame(other.id, 'Charlie');
const P = liveGame(other.id, 'Private one', 'private');
const imp = (o) => E.recordImpression({ user: viewer, sessionId: 's-' + Math.random(), ip: '10.0.0.' + Math.floor(Math.random() * 250), ad: 'house-build', placement: 'game', game: A.id, t: T, ...o });
const clear = () => { q.run('DELETE FROM ad_impressions'); q.run('DELETE FROM earnings'); q.run('DELETE FROM payouts'); };
const row = (g, day = DAY) => q.get('SELECT * FROM earnings WHERE game_id=? AND day=?', g, day);

test('revenue formula: impressions × eCPM / 1000 × builder share, in millicents', () => {
  assert.equal(E.revenueMillicents(1, 200, 0.7), 140); // 0.14 cents
  assert.equal(E.revenueMillicents(1000, 200, 0.7), 140000); // $1.40
  assert.equal(E.revenueMillicents(1 / 3, 200, 0.7), 47);
  assert.equal(E.revenueMillicents(5, 1000, 0.5), 2500);
});

test('game-page impressions accrue to that game', () => {
  clear();
  for (let i = 0; i < 3; i++) assert.equal(imp().counted, true);
  E.rollupDay(DAY);
  const r = row(A.id);
  assert.equal(r.impressions, 3); assert.equal(r.weight_milli, 3000);
  assert.equal(r.revenue_millicents, 420); assert.equal(r.revenue_cents, 0, 'under a cent rounds to 0 in revenue_cents but millicents keep it');
  assert.equal(r.ecpm_cents, config.adEcpmCents); assert.equal(r.share_milli, 700);
  assert.equal(row(B.id), undefined);
});

test('grid impressions split equally across the games shown in the row', () => {
  clear();
  assert.equal(imp({ placement: 'grid', game: null, games: [A.id, B.id, C.id] }).counted, true);
  assert.equal(imp({ placement: 'grid', game: null, games: [A.id, C.id] }).counted, true);
  E.rollupDay(DAY);
  assert.equal(row(A.id).weight_milli, 833); // 1/3 + 1/2
  assert.equal(row(B.id).weight_milli, 333);
  assert.equal(row(C.id).weight_milli, 833);
  assert.equal(row(A.id).revenue_millicents, Math.round((1 / 3 + 1 / 2) * 200 * 0.7));
  assert.equal(row(A.id).impressions, 1);
});

test('eCPM, share and rounding to cents', () => {
  clear();
  const rows = Array.from({ length: 1000 }, (_, i) => [`id${i}`, A.id, 'game', 'house-build', '', viewer.id, `s${i}`, `ip${i}`, DAY, DAY + 'T10', T]);
  for (const r of rows) q.run('INSERT INTO ad_impressions(id, game_id, placement, ad_id, games_shown, user_id, session_id, ip, day, hour, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...r);
  E.rollupDay(DAY);
  assert.equal(row(A.id).revenue_cents, 140, '1000 impressions at $2 eCPM × 70% = $1.40');
  E.rollupDay(DAY, { ecpmCents: 500, share: 0.5 });
  assert.equal(row(A.id).revenue_cents, 250);
});

test('roll-up is idempotent and replaces the day', () => {
  clear();
  imp(); imp({ placement: 'grid', game: null, games: [A.id, B.id] });
  const r1 = E.rollupDay(DAY); const snap1 = q.all('SELECT * FROM earnings ORDER BY game_id');
  const r2 = E.rollupDay(DAY); const snap2 = q.all('SELECT * FROM earnings ORDER BY game_id');
  assert.deepEqual(snap1, snap2); assert.equal(r1.impressions, r2.impressions); assert.equal(r1.impressions, 2);
  q.run('DELETE FROM ad_impressions');
  E.rollupDay(DAY);
  assert.equal(q.get('SELECT COUNT(*) n FROM earnings').n, 0);
  assert.throws(() => E.rollupDay('nope'));
});

test('dedupe per session, per placement, per hour', () => {
  clear();
  const s = { sessionId: 'sess-1', ip: '1.1.1.1' };
  assert.equal(imp(s).counted, true);
  assert.deepEqual(imp(s), { counted: false, reason: 'duplicate' });
  assert.deepEqual(imp({ ...s, game: B.id, t: T + 60e3 }), { counted: false, reason: 'duplicate' }, 'another game page in the same hour');
  assert.equal(imp({ ...s, placement: 'grid', game: null, games: [B.id] }).counted, true, 'other placement counts');
  assert.equal(imp({ ...s, t: T + 3600e3 }).counted, true, 'next hour counts');
  assert.equal(imp({ ...s, sessionId: 'sess-2' }).counted, true, 'other session counts');
});

test("owner's own impressions are ignored", () => {
  clear();
  assert.deepEqual(imp({ user: owner }), { counted: false, reason: 'owner' });
  assert.deepEqual(imp({ user: owner, placement: 'grid', game: null, games: [A.id, B.id] }), { counted: false, reason: 'owner' });
  assert.equal(imp({ user: owner, placement: 'grid', game: null, games: [A.id, C.id] }).counted, true);
  assert.equal(q.get('SELECT games_shown FROM ad_impressions').games_shown, C.id, "owner's games dropped from the split");
});

test('per-IP daily cap', () => {
  clear();
  const cap = config.adIpDailyCap; config.adIpDailyCap = 3;
  try {
    for (let i = 0; i < 3; i++) assert.equal(imp({ ip: '9.9.9.9' }).counted, true);
    assert.deepEqual(imp({ ip: '9.9.9.9' }), { counted: false, reason: 'ip-cap' });
    assert.equal(imp({ ip: '9.9.9.9', t: T + 86400e3 }).counted, true, 'new day resets');
  } finally { config.adIpDailyCap = cap; }
});

test('no session, unknown ads and games you cannot see are not counted', () => {
  clear();
  assert.deepEqual(imp({ sessionId: null }), { counted: false, reason: 'no-session' });
  assert.deepEqual(imp({ ad: 'not-an-ad' }), { counted: false, reason: 'unknown-ad' });
  assert.deepEqual(imp({ game: 'nosuchgame' }), { counted: false, reason: 'no-game' });
  assert.deepEqual(imp({ game: P.id }), { counted: false, reason: 'no-game' });
  assert.deepEqual(imp({ placement: 'grid', game: null, games: [P.id] }), { counted: false, reason: 'no-game' });
  assert.equal(q.get('SELECT COUNT(*) n FROM ad_impressions').n, 0);
});

test('parseImpression rejects bad shapes', () => {
  const bad = [null, 'x', [], {}, { ad: 'house-build' }, { ad: 'house-build', placement: 'popup', game: 'a' }, { ad: 'house-build', placement: 'game' },
    { ad: 'house build!', placement: 'game', game: 'a' }, { ad: 'house-build', placement: 'grid' }, { ad: 'house-build', placement: 'grid', games: [] },
    { ad: 'house-build', placement: 'grid', games: [1, 2] }, { ad: 'house-build', placement: 'grid', games: Array.from({ length: 17 }, (_, i) => 'g' + i) },
    { ad: 'house-build', placement: 'game', game: '<script>' }, { ad: 5, placement: 'game', game: 'a' }];
  for (const b of bad) assert.equal(E.parseImpression(b).ok, false, JSON.stringify(b));
  assert.deepEqual(E.parseImpression({ ad: 'house-build', placement: 'grid', games: 'a,b,a' }).value.games, ['a', 'b']);
  assert.equal(E.parseImpression(JSON.stringify({ ad: 'house-build', placement: 'game', game: 'abc' })).ok, true);
});

test('payout threshold and balance', () => {
  clear();
  q.run('INSERT INTO earnings(game_id, day, impressions, revenue_cents) VALUES (?,?,?,?)', A.id, '2026-03-01', 6000, 900);
  let b = E.balance(owner.id);
  assert.equal(b.earnedCents, 900); assert.equal(b.availableCents, 900); assert.equal(E.canRequestPayout(b), false);
  assert.equal(E.requestPayout(owner).ok, false);
  q.run('INSERT INTO earnings(game_id, day, impressions, revenue_cents, revenue_millicents) VALUES (?,?,?,?,?)', B.id, '2026-03-02', 1000, 150, 150400);
  b = E.balance(owner.id);
  assert.equal(b.earnedCents, 1050); assert.equal(E.canRequestPayout(b), true);
  const r = E.requestPayout(owner);
  assert.equal(r.ok, true); assert.equal(r.payout.amount_cents, 1050); assert.equal(r.payout.status, 'requested');
  b = E.balance(owner.id);
  assert.equal(b.availableCents, 0); assert.equal(b.pendingCents, 1050);
  assert.equal(E.requestPayout(owner).ok, false, 'no double request');
  assert.equal(E.balance(other.id).earnedCents, 0, 'earnings belong to the game owner only');
  const admin = auth.createUser({ username: 'MoneyAdmin', password: 'secret1', role: 'admin' });
  assert.equal(E.setPayoutStatus(admin, r.payout.id, 'cancelled', 'test').ok, true);
  assert.equal(E.balance(owner.id).availableCents, 1050, 'cancelled goes back to balance');
  assert.equal(E.setPayoutStatus(admin, r.payout.id, 'paid').ok, false, 'only requested payouts change');
  const r2 = E.requestPayout(owner);
  assert.equal(E.setPayoutStatus(admin, r2.payout.id, 'paid', 'sent by hand').ok, true);
  b = E.balance(owner.id); assert.equal(b.paidCents, 1050); assert.equal(b.availableCents, 0);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='payout.mark_paid' AND target=?", r2.payout.id));
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='payout.request' AND actor_id=?", owner.id));
  assert.equal(E.requestPayout(auth.createGuest()).ok, false, 'guests cannot ask');
});

test('creator summary: per-game and total stats, 14 days of history', () => {
  clear();
  games.recordPlay(A.id, viewer.id); games.recordPlay(A.id, viewer.id); games.recordPlay(B.id, viewer.id); games.recordPlay(B.id, other.id); games.recordPlay(A.id, null);
  games.rate(A.id, viewer.id, 4); games.rate(B.id, viewer.id, 2);
  const today = new Date().toISOString().slice(0, 10);
  imp({ t: Date.now() }); E.rollupDay(today);
  const s = E.creatorSummary(owner.id);
  assert.equal(s.games.length, 2);
  const a = s.games.find(g => g.id === A.id);
  assert.equal(a.uniquePlayers, 1); assert.equal(a.impressions, 1); assert.equal(a.lifetimeMillicents, 140);
  assert.equal(s.totals.uniquePlayers, 2); assert.equal(s.totals.rating, 3);
  assert.equal(s.daily.length, 14); assert.equal(s.daily[13].day, today); assert.equal(s.daily[13].millicents, 140);
  assert.equal(E.creatorSummary(viewer.id).games.length, 0);
});
