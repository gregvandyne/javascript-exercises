// POST /api/ads/impression — the beacon from public/js/ads.js (Money node).
// Body (JSON or text/plain JSON): { ad, placement: 'grid'|'game', game? , games?: [ids] | 'a,b,c' }
// 400 for a bad shape; otherwise 200 { counted, reason? } (ignored impressions are not errors,
// so browsers never retry them). Fraud controls live in services/earnings.js.
import { Router } from 'express';
import { rateLimit } from '../services/ratelimit.js';
import { parseImpression, recordImpression } from '../services/earnings.js';

export const router = Router();

router.post('/api/ads/impression', rateLimit('adimp', 120, 60e3), (req, res) => {
  const p = parseImpression(req.body);
  if (!p.ok) return res.status(400).json({ error: p.error });
  const r = recordImpression({ user: req.user, sessionId: req.sessionId, ip: req.ip, ...p.value });
  res.json(r.counted ? { counted: true } : { counted: false, reason: r.reason });
});
