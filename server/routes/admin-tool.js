// A small admin tool for fixing a published game by hand (or by an agent working for the owner), from outside a browser:
// find a game, read its live code, put a fixed version live. Off unless ADMIN_API_TOKEN is set (at least 32
// characters); every call needs `Authorization: Bearer <token>`, every change is audited as the admin account, and a
// new version passes the same safety scan as any other. Turn it off again by removing the token.
//   GET  /api/admin-tool/games?q=<title or owner>       -> { games: [{ id, slug, title, owner, visibility, status, version }] }
//   GET  /api/admin-tool/games/:id/source               -> { id, title, owner, version: { id, number }, html }
//   POST /api/admin-tool/games/:id/source { html, notes } -> { ok, version, state } (a new version, live at the game's
//        current sharing level; a version waiting for review is approved as the admin, since an admin made it)
import express, { Router } from 'express';
import crypto from 'node:crypto';
import { q } from '../db.js';
import { getUser, getUserByName } from '../auth.js';
import { config } from '../config.js';
import * as games from '../services/games.js';
import { publish, approve } from '../services/publish.js';
import { allow, ipOf } from '../services/ratelimit.js';

export const router = Router();
const token = () => String(process.env.ADMIN_API_TOKEN || '');
function gate(req, res, next) {
  const want = token();
  if (want.length < 32) return res.status(404).json({ error: 'Not found' });
  if (!allow(`admin-tool:${ipOf(req)}`, 60, 60e3)) return res.status(429).json({ error: 'Slow down' });
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(got).digest(), b = crypto.createHash('sha256').update(want).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Not allowed' });
  req.admin = getUserByName(config.adminUsername);
  if (!req.admin) return res.status(503).json({ error: 'No admin account' });
  next();
}
const shape = g => { const o = getUser(g.owner_id); return { id: g.id, slug: g.slug, title: g.title, owner: o ? o.username : '', visibility: g.visibility, status: g.status, version: g.published_version_id || g.current_version_id }; };

router.get('/api/admin-tool/games', gate, (req, res) => {
  const s = `%${String(req.query.q || '').slice(0, 60)}%`;
  const rows = q.all('SELECT g.* FROM games g JOIN users u ON u.id=g.owner_id WHERE g.title LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? ORDER BY g.updated_at DESC LIMIT 25', s, s, s);
  res.json({ games: rows.map(shape) });
});
router.get('/api/admin-tool/games/:id/source', gate, (req, res) => {
  const g = games.getGame(req.params.id); if (!g) return res.status(404).json({ error: 'Not found' });
  const v = games.getVersion(g.published_version_id || g.current_version_id); if (!v) return res.status(404).json({ error: 'No version' });
  res.json({ ...shape(g), version: { id: v.id, number: v.number }, html: v.html });
});
router.post('/api/admin-tool/games/:id/source', gate, express.json({ limit: '3mb' }), async (req, res) => {
  const g = games.getGame(req.params.id); if (!g) return res.status(404).json({ error: 'Not found' });
  const html = String((req.body || {}).html || '');
  if (html.length < 100 || html.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'html must be a whole game under 2 MB' });
  const v = games.addVersion(g.id, html, { notes: String((req.body || {}).notes || 'Fixed by the admin').slice(0, 300), createdBy: req.admin.id });
  if (!(g.status === 'published' && g.published_version_id)) return res.json({ ok: true, version: v.number, state: 'saved' });
  let r = await publish(req.admin, g.id, g.visibility, { versionId: v.id });
  if (r.ok && r.state !== 'live' && games.getGame(g.id).pending_version_id === v.id) { approve(req.admin, g.id, 'Fixed by the admin'); r = { ok: true, state: 'live' }; }
  res.status(r.ok ? 200 : 400).json({ ok: !!r.ok, version: v.number, state: r.state, message: r.message, report: r.report });
});
