// The Builder in the Oomba chat (services/companion-build.js; docs/decisions.md "Builder in the chat (phase 2)").
//   POST /api/companion/build/act       a tap on a build card ({ turnId, act: 'buildPlan' (value: the picks as JSON) |
//                                       'buildGo' (value: the words for the Builder, up to 2000 characters) |
//                                       'buildRedo' }) -> { ok, chat }
//   POST /api/companion/build/studio    with the chat docked in Studio: a Studio button's fixed Builder message ({ gameId,
//                                       text }) into the chat and straight to that game's Builder -> { ok, chat }
//   GET  /api/companion/build/news      the "Your game is ready" notice for builds that ended while a page was open
//                                       (told once) -> { ok, kind, html }
//   GET  /api/companion/build/:gameId   a game made in the chat, for its card: the Builder's live steps as five rows
//                                       (while it builds), this viewer's own preview address (?v=<version id>: that
//                                       version), the builds left today -> { ok, busy, rows, preview, left, title }
// Teacher plan staff with the companion only (404 for anyone else), their own games only.
import { Router } from 'express';
import { rateLimit } from '../services/ratelimit.js';
import { tHtml } from '../i18n/index.js';
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
  const r = CB.act(req.user, String(b.turnId || ''), String(b.act || ''), v, req.locale || 'en');
  return r.ok ? res.json({ ok: true, chat: CO.dress(req.user, r.chat, req.t) }) : fail(req, res, r);
});
router.post('/api/companion/build/studio', may, rateLimit('companion-act', 300, 3600e3), (req, res) => {
  const b = body(req);
  if (!CB.pageGame(req.user, String(b.gameId || ''))) return fail(req, res, { code: 'notFound' });
  CO.ensureChat(req.user);
  const r = CB.studioSend(req.user, String(b.gameId || ''), typeof b.text === 'string' ? b.text.slice(0, 2000) : '', req.locale || 'en');
  return r.ok ? res.json({ ok: true, chat: CO.dress(req.user, r.chat, req.t) }) : fail(req, res, r);
});
// The "Your game is ready" notice for a build that ended while this page was open (public/js/companion-build.js asks
// when a game's card turns done): the layout's own words, told once. ?not=<game id>: the game open in Studio here.
router.get('/api/companion/build/news', may, rateLimit('companion-build-news', 60, 60e3), (req, res) => {
  const list = CB.news(req.user, { not: typeof req.query.not === 'string' ? req.query.not.slice(0, 40) : '' });
  if (!list.length) return res.json({ ok: true, html: '' });
  const one = list.length === 1 ? list[0] : null;
  const msg = one ? tHtml(req.t, `layout.build.${one.kind}`, { title: `\u2068${one.title}\u2069`, href: `/studio/${encodeURIComponent(one.gameId)}` }) : tHtml(req.t, 'layout.build.many', { href: '/build' });
  res.json({ ok: true, kind: one ? one.kind : 'many', html: String(msg) });
});
router.get('/api/companion/build/:gameId', may, rateLimit('companion-build-view', 240, 60e3), (req, res) => {
  const r = CB.view(req.user, req.params.gameId, { versionId: typeof req.query.v === 'string' ? req.query.v.slice(0, 40) : '', lang: req.locale || 'en' });
  return r.ok ? res.json(r) : fail(req, res, r);
});
