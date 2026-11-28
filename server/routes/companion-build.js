// The Builder in the Oomba chat (services/companion-build.js; docs/decisions.md "Builder in the chat (phase 2)").
//   POST /api/companion/build/act       a tap on a build card ({ turnId, act: 'buildPlan' (value: the picks as JSON) |
//                                       'buildGo' (value: the words for the Builder, up to 2000 characters) |
//                                       'buildRedo' }) -> { ok, chat }
//   GET  /api/companion/build/:gameId   a game made in the chat, for its card: the Builder's live steps as five rows
//                                       (while it builds), this viewer's own preview address (?v=<version id>: that
//                                       version), the builds left today -> { ok, busy, rows, preview, left, title }
// Teacher plan staff with the companion only (404 for anyone else), their own games only.
import { Router } from 'express';
import { rateLimit } from '../services/ratelimit.js';
import * as CO from '../services/companion.js';
import * as CB from '../services/companion-build.js';

export const router = Router();
const body = req => (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {});
const may = (req, res, next) => (req.user && CO.companionFor(req.user) ? next() : res.status(404).json({ error: req.t('errors.api.notFound'), code: 'notFound' }));
const STATUS = { notFound: 404, chatBusy: 409, cap: 429, noBuilds: 429, needPick: 400, buildOff: 403 };
const fail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(`js.companion-build.err.${['chatBusy', 'cap', 'noBuilds', 'needPick', 'buildOff', 'notFound'].includes(r.code) ? r.code : 'other'}`), code: r.code });

router.post('/api/companion/build/act', may, rateLimit('companion-act', 300, 3600e3), (req, res) => {
  const b = body(req);
  const v = typeof b.value === 'string' ? b.value.slice(0, 2000) : '';
  const r = CB.act(req.user, String(b.turnId || ''), String(b.act || ''), v);
  return r.ok ? res.json({ ok: true, chat: CO.dress(req.user, r.chat, req.t) }) : fail(req, res, r);
});
router.get('/api/companion/build/:gameId', may, rateLimit('companion-build-view', 240, 60e3), (req, res) => {
  const r = CB.view(req.user, req.params.gameId, { versionId: typeof req.query.v === 'string' ? req.query.v.slice(0, 40) : '', lang: req.locale || 'en' });
  return r.ok ? res.json(r) : fail(req, res, r);
});
