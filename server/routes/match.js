// Online matches (services/match.js): the "Play online" sheet's APIs, invites and the relay the play page uses.
// Docs: docs/decisions.md "Online matches"; safety: docs/safety.md §13.
import { Router } from 'express';
import { requireUser, OFFICIAL } from '../auth.js';
import { rateLimit, allow, ipOf } from '../services/ratelimit.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import * as match from '../services/match.js';

export const router = Router();

/** An official online game the player may open, by id or slug. */
export function onlineGame(user, idOrSlug) {
  const g = games.getGame(String(idOrSlug || '')) || games.getGameBySlug(idOrSlug);
  if (!g || !match.GAMES.has(g.slug) || !games.canView(user, g)) return null;
  const owner = games.getOwner(g);
  return owner && owner.username === OFFICIAL ? g : null;
}
const ERR = { signIn: 401, notOnline: 404, notFound: 404, gone: 410, tooMany: 409, codeLength: 400, ownCode: 400, notPlaying: 409, bad: 400, full: 409 };
const fail = (req, res, code) => res.status(ERR[code] || 400).json({ error: req.t('match.err.' + code), code });
const reply = (req, m) => ({ id: m.id, redirect: `/play/${m.slug}?match=${encodeURIComponent(m.id)}` });

// The sheet: who you can invite (friends and family) and who of them is playing this game now.
router.get('/api/match/people', requireUser, rateLimit('match-people', 60, 60e3), (req, res) => {
  const g = onlineGame(req.user, req.query.game); if (!g) return fail(req, res, 'notOnline');
  const u = req.user;
  const ids = match.people(u).map(p => p.id);
  const now = presence.playingByUser(ids);
  const playing = new Set(Object.keys(now).filter(id => now[id] === g.id));
  res.json({ people: match.people(u, playing), guest: !!u.is_guest });
});
router.post('/api/match', requireUser, rateLimit('match-new', 30, 3600e3), (req, res) => {
  const b = req.body || {};
  const g = onlineGame(req.user, b.game); if (!g) return fail(req, res, 'notOnline');
  const r = match.create(req.user, g, b.invite || null);
  if (r.error) return fail(req, res, r.error);
  res.json(reply(req, r.match));
});
// Wrong codes are limited per address (as for live codes), so nobody can try them all.
router.post('/api/match/join', requireUser, rateLimit('match-join', 30, 60e3), (req, res) => {
  const key = `match-wrong:${ipOf(req)}`;
  const r = match.joinByCode(req.user, (req.body || {}).code);
  if (r.error) {
    if (r.wrong && !allow(key, 40, 10 * 60e3)) return res.status(429).json({ error: req.t('errors.api.slowDown'), code: 'slowDown' });
    return fail(req, res, r.error);
  }
  res.json(reply(req, r.match));
});
router.get('/api/match/inbox', requireUser, rateLimit('match-inbox', 20, 60e3), (req, res) => res.json({ invites: match.inbox(req.user) }));
router.post('/api/match/:id/accept', requireUser, rateLimit('match-answer', 30, 60e3), (req, res) => {
  const r = match.accept(req.user, req.params.id);
  if (r.error) return fail(req, res, r.error);
  res.json(reply(req, r.match));
});
router.post('/api/match/:id/decline', requireUser, rateLimit('match-answer', 30, 60e3), (req, res) => res.json({ ok: match.decline(req.user, req.params.id) }));
router.post('/api/match/:id/leave', requireUser, rateLimit('match-answer', 30, 60e3), (req, res) => res.json({ ok: match.leave(req.user, req.params.id) }));

// The relay: the play page long-polls for the other player's events and posts its own game's.
router.get('/api/match/:id/wait', requireUser, rateLimit('match-wait', 120, 60e3), (req, res) => {
  let open = true;
  const stop = match.wait(req.user, req.params.id, Math.max(0, parseInt(req.query.after, 10) || 0), String(req.query.k || ''), v => {
    if (!open) return; open = false;
    if (!v) return fail(req, res, 'gone');
    res.set('Cache-Control', 'no-store').json(v);
  }, req.t);
  req.on('close', () => { if (open) { open = false; stop(); } });
});
router.post('/api/match/:id/send', requireUser, rateLimit('match-send', 120, 60e3), (req, res) => {
  const b = req.body || {};
  const r = match.send(req.user, req.params.id, b.k, b.d);
  if (r.error) return fail(req, res, r.error);
  res.json(r);
});
