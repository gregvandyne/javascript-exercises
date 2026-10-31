// Oomba Live pages and APIs (docs/decisions.md "Oomba Live"; protocol and page hooks: docs/live-protocol.md).
//   /join                 one join page: a 7-digit live code here, a 6-character class code goes on to the class flow
//                         (routes/google.js), unchanged. Mounted before googleRoutes.
//   /api/live/join        a code -> a seat token (no cookie, no account, no database row for a guest)
//   /live                 the host's landing: pick a game or mode, questions, who can join
//   /live/host/:sid       the projector page; /live/play/:sid the player's page; /live/frame/:token the game frame
//   /live/results/:id     results (from memory for 10 minutes, then what was saved), .csv for saved runs
//   /live/sets            question sets; /api/live/sets... their API
// Everything answers 404 while LIVE_CLASSROOM=0 (the class-code /join keeps working).
import { Router } from 'express';
import { config } from '../config.js';
import { readToken, requireAnyAccount } from '../auth.js';
import { page, notFound } from '../views/layout.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { googleEnabled } from '../oidc.js';
import { requestOrigin, frameDocument, sendFrame, sendFrameText, frameOrigins } from '../services/frame.js';
import { localeInfo, normalizeCode, tFor } from '../i18n/index.js';
import { log } from '../services/log.js';
import * as games from '../services/games.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as LS from '../services/classlive-sessions.js';
import * as A from '../services/classlive-access.js';
import * as R from '../services/classlive-results.js';
import * as SETS from '../services/classlive-sets.js';
import * as C from '../services/classlive-check.js';
import { nicksFor } from '../services/classlive-names.js';
import { STARTERS } from '../live/starters.js';
import { familyOfOwner, familiesOn } from '../services/family.js';
import { isGrownup } from '../auth.js';
import * as V from '../views/live.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const router = Router();
const LOBBY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../live/lobby.html');
const on = (req, res, next) => (LS.liveOn() ? next() : next('router'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const noStore = res => res.set('Cache-Control', 'no-store');
const apiErr = (req, res, status, code, extra = {}) => res.status(status).json({ error: req.t(`live.api.${code}`), code, ...extra });
const hostOnly = (req, res, next) => (A.canHost(req.user) ? next() : (req.originalUrl.startsWith('/api/') ? res.status(404).json({ error: req.t('errors.api.notFound') }) : res.redirect(302, '/join')));
const CODE_RE = /^\d{7}$/;
const digits = v => String(v ?? '').replace(/[\s-]/g, '');

// ---------------------------------------------------------------- /join (live codes; class codes go on)
router.get('/join/:code', (req, res, next) => {
  if (!LS.liveOn() || !CODE_RE.test(digits(req.params.code))) return next();
  res.redirect(302, `/join#${digits(req.params.code)}`);
});
router.get('/join', (req, res, next) => {
  if (!LS.liveOn()) return next();
  const q = req.query;
  if (q.code !== undefined || q.gerr || q.jerr || q.bad) {
    // A live code typed without the page script: it goes to the page's #fragment (never kept in an address again).
    if (CODE_RE.test(digits(q.code))) return res.redirect(302, `/join#${digits(q.code)}`);
    if (googleEnabled()) return next();   // a class code: the class flow (routes/google.js)
    return joinPage(req, res, { bad: true });
  }
  joinPage(req, res);
});
function joinPage(req, res, { bad = false } = {}) {
  noStore(res);
  page(req, res, { title: req.t('live.join.title'), bare: true, bodyClass: 'lv-body', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.joinBody(req, { googleOn: googleEnabled(), bad, nicks: nicksFor(req.locale) }), scripts: ['/js/live-join.js'] });
}

/** A seat from a token in a request body: -> { s, seat } or null. */
function seatOf(tok) {
  const p = readToken(String(tok || ''));
  const s = p && LS.get(p.s);
  const seat = s && LS.seatFor(s, p);
  return seat && s.phase !== 'ended' ? { s, seat, p } : null;
}
const seatInfo = (s, seat) => ({ seat: seat.no, nick: seat.nick, name: s.nameMode === 'accounts' ? seat.name : '', avatar: seat.avatar });

router.post('/api/live/join', on, async (req, res) => {
  const t0 = Date.now();
  const key = LS.ipKey(req);
  // Every answer takes at least 150 ms, so timing says nothing about which codes exist.
  const reply = async (status, body) => { const wait = LS.JOIN_LIMITS.minMs - (Date.now() - t0); if (wait > 0) await sleep(wait); noStore(res); res.status(status).json(body); };
  const err = (status, code, extra = {}) => reply(status, { error: req.t(`live.join.${code}`), code, ...extra });
  const why = LS.joinTry(key);
  if (why) return err(429, 'slowDown');
  const code = digits(req.body && req.body.code);
  if (!CODE_RE.test(code)) return err(400, 'badCode');
  const s = LS.byJoinCode(code);
  if (!s) { LS.joinMiss(key); return err(404, 'notFound'); }
  const r = LS.join(s, req.user, { asGuest: !!(req.body && req.body.asGuest), useMine: !!(req.body && req.body.useMine), lang: req.locale });
  if (!r.ok) {
    const status = { signIn: 401, notMember: 403, removed: 403, takenDown: 404, locked: 409, full: 409, ended: 410 }[r.code] || 400;
    return err(status, r.code, r.code === 'signIn' ? { login: '/login?next=%2Fjoin' } : {});
  }
  return reply(200, { sid: s.id, tok: r.token, ...seatInfo(s, r.seat), audience: s.audience, nameMode: s.nameMode, title: s.title, again: r.again, canReroll: !r.seat.everConnected && s.nameMode !== 'accounts' && !r.seat.ownAvatar, play: `/live/play/${s.id}` });
});

router.post('/api/live/reroll', on, (req, res) => {
  noStore(res);
  const x = seatOf(req.body && req.body.tok);
  if (!x) return res.status(404).json({ error: req.t('live.join.ended'), code: 'ended' });
  const seat = LS.reroll(x.s, x.seat);
  if (!seat) return res.status(429).json({ error: req.t('live.join.slowDown'), code: 'slowDown' });
  res.json(seatInfo(x.s, seat));
});

router.post('/api/live/report', on, (req, res) => {
  noStore(res);
  const x = seatOf(req.body && req.body.tok);
  if (!x) return res.status(404).json({ error: req.t('live.join.ended'), code: 'ended' });
  const reason = String((req.body && req.body.reason) || '');
  if (!R.REPORT_REASONS.includes(reason)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  if (!allow(`lv-rep:${x.seat.nonce}`, 3, 3600e3)) return res.status(429).json({ error: req.t('live.join.slowDown'), code: 'slowDown' });
  R.report(x.s, reason);
  x.s.reports++;
  // The host hears about every report (never who sent it); from the third, admins see it flagged in the log too.
  LS.toHost(x.s, { t: 'rp', n: x.s.reports });
  if (x.s.reports === 3) log('warn', 'live session reported 3 times', { sid: x.s.id });
  res.json({ ok: true, toast: req.t('live.play.reportThanks') });
});

// ---------------------------------------------------------------- /live: the host's landing
const officialReady = () => games.listVisible(null, { official: true, limit: 100 }).filter(g => !Object.values(A.MODES).includes(g.slug));
router.get('/live', on, requireAnyAccount, hostOnly, (req, res) => {
  const t = req.t, u = req.user;
  const ready = list => list.filter(g => g.published_version_id && C.gameReady(g)).map(g => ({ id: g.id, icon: g.icon, title: g.title, quiz: C.liveCheck(g.published_version_id).quiz }));
  const mine = games.myGames(u.id, 200).filter(g => g.status === 'published' && !g.hidden_reason);
  const teaching = S.classesOf(u.id, 'teacher');
  const sharedSeen = new Set(mine.map(g => g.id));
  const shared = [];
  for (const c of teaching) for (const g of games.classGames(c.id, { limit: 100 })) if (!sharedSeen.has(g.id)) { sharedSeen.add(g.id); shared.push(g); }
  const groups = [{ key: 'official', games: ready(officialReady()) }, { key: 'mine', games: ready(mine) }, ...(teaching.length ? [{ key: 'shared', games: ready(shared) }] : [])];
  const modes = [
    { id: 'quest-race', icon: '🏝️', title: t('live.mode.questRace'), text: t('live.mode.questRaceText') },
    { id: 'battle', icon: '⚡', title: t('live.mode.battle'), text: t('live.mode.battleText') },
  ];
  const starters = STARTERS.map(id => ({ id, title: t(`live.starter.title.${id.replace('-', '')}`) }));
  const q = req.query;
  const pre = {
    pick: q.game ? `game:${String(q.game)}` : q.mode ? `mode:${String(q.mode)}` : '',
    classId: q.class ? String(q.class) : '', audience: q.class || q.cl ? 'class' : '', set: q.set ? `set:${String(q.set)}` : '',
    clId: q.cl ? String(q.cl) : '', stepId: q.step ? String(q.step) : '',
  };
  // From a lesson's "Host live": the class comes from the class lesson.
  if (pre.clId && !pre.classId) { const cl = L.getClassLesson(pre.clId); if (cl) pre.classId = cl.class_id; }
  const family = isGrownup(u) && familiesOn(req) && !!familyOfOwner(u.id);
  noStore(res);
  page(req, res, { title: t('live.landing.title'), active: 'classes', head: '<link rel="stylesheet" href="/css/live.css">', scripts: ['/js/live-sets.js'],
    body: V.landingBody(req, { modes, groups, sets: SETS.listFor(u), starters, classes: teaching, family, pre, recent: R.hostRuns(u.id, 8), maxPlayers: A.maxPlayersFor(u, 'open', null) === 30 ? 30 : config.liveMaxPlayers, origin: requestOrigin(req) }) });
});

/** The landing's form ({ pick: 'mode:<id>'|'game:<id>', set: 'starter:<id>'|'set:<id>', audience, classId, ... }) or
 *  the same as JSON fields ({ mode, gameId, setId, starter, items, ... }). */
function sessionOpts(b, req) {
  const o = { audience: String(b.audience || 'open'), classId: b.classId ? String(b.classId) : null, clId: b.clId ? String(b.clId) : null, stepId: b.stepId ? String(b.stepId) : null,
    maxPlayers: Number.isInteger(+b.maxPlayers) && +b.maxPlayers > 0 ? +b.maxPlayers : null, replace: b.replace === true || b.replace === '1', lang: req.locale };
  const pick = String(b.pick || '');
  if (pick.startsWith('mode:')) o.mode = pick.slice(5);
  else if (pick.startsWith('game:')) { o.mode = 'game'; o.gameId = pick.slice(5); }
  else { o.mode = b.mode ? String(b.mode) : null; o.gameId = b.gameId ? String(b.gameId) : null; }
  const set = String(b.set || '');
  if (set.startsWith('starter:')) o.starter = set.slice(8);
  else if (set.startsWith('set:')) o.setId = set.slice(4);
  if (b.setId) o.setId = String(b.setId);
  if (b.starter) o.starter = String(b.starter);
  if (Array.isArray(b.items)) o.items = b.items;
  return o;
}
router.post('/api/live/sessions', on, requireAnyAccount, hostOnly, rateLimit('lv-new', 30, 3600e3), (req, res) => {
  const r = LS.createSession(req.user, sessionOpts(req.body || {}, req));
  if (!r.ok) {
    if (r.code === 'hasOpen') return apiErr(req, res, 409, 'hasOpen', { sid: r.sid, host: `/live/host/${r.sid}` });
    const status = { off: 404, notHost: 404, notFound: 404, busy: 503 }[r.code] || 400;
    return apiErr(req, res, status, r.code, r.issue ? { issue: r.issue.code } : {});
  }
  res.json({ sid: r.session.id, redirect: `/live/host/${r.session.id}` });
});

// ---------------------------------------------------------------- the host's page
router.get('/live/host/:sid', on, requireAnyAccount, (req, res) => {
  const s = LS.get(req.params.sid);
  if (!s || s.host.userId !== req.user.id) return notFound(req, res);
  if (s.phase === 'ended') return res.redirect(302, `/live/results/${s.id}`);
  s.host.lang = req.locale;
  noStore(res);
  page(req, res, { title: req.t('live.host.title'), bare: true, bodyClass: 'lv-body lv-projector', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.hostBody(req, { s, origin: requestOrigin(req), token: LS.hostToken(s), nicks: nicksFor(req.locale), classSignIn: s.audience !== 'open' }), scripts: ['/js/live-host.js'] });
});

// ---------------------------------------------------------------- the player's page
router.get('/live/play/:sid', on, (req, res) => {
  const s = LS.get(req.params.sid);
  const open = !!s && s.phase !== 'ended';
  noStore(res);
  page(req, res, { title: s ? s.title : req.t('live.play.title'), bare: true, bodyClass: 'lv-body lv-player', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.playBody(req, { sid: s ? s.id : String(req.params.sid).slice(0, 40), title: s ? s.title : req.t('live.play.title'), nicks: nicksFor(req.locale), open }), scripts: ['/js/live-play.js'] }, open ? 200 : 404);
});

// ---------------------------------------------------------------- the game frame
router.get('/live/frame/:token', on, (req, res) => {
  const t = req.t;
  const tok = readToken(req.params.token);
  if (!tok || !tok.s || !['game', 'lobby'].includes(tok.f)) return sendFrameText(res, 403, t('play.frameExpired'));
  const s = LS.get(tok.s);
  if (!s || s.phase === 'ended') return sendFrameText(res, 404, t('live.play.gone'));
  const host = tok.r === 'h';
  const seat = host ? null : LS.seatFor(s, tok);
  if (host ? tok.k !== s.host.nonce : !seat) return sendFrameText(res, 403, t('play.frameExpired'));
  // The frame is same-site, so the sign-in cookie comes along: a signed-in seat's frame is theirs only.
  const u = req.user && !req.user.is_guest ? req.user : null;
  if (tok.u && (!u || u.id !== tok.u)) return sendFrameText(res, 403, t('play.frameExpired'));
  if (!host && !A.seatCanView(s, tok.u ? u : null)) return sendFrameText(res, 404, t('live.play.takenDown'));
  const lang = normalizeCode(tok.l) || req.locale;
  const nicks = nicksFor(lang);
  const name = host ? '' : (s.nameMode === 'accounts' && seat.name ? seat.name : nicks[seat.nick]);
  let gameHtml, cacheKey, title = s.title;
  if (tok.f === 'lobby') {
    if (!fs.existsSync(LOBBY_FILE)) return sendFrameText(res, 404, t('errors.api.notFound'));
    gameHtml = fs.readFileSync(LOBBY_FILE, 'utf8'); cacheKey = null;
  } else {
    const v = games.getVersion(s.versionId);
    if (!v || v.id !== tok.v) return sendFrameText(res, 404, t('errors.api.notFound'));
    gameHtml = v.html; cacheKey = v.id;
  }
  const tl = tFor(lang);
  const init = {
    // The session's name only (a nickname, or the account name in a teacher's own class room), never the account's.
    user: { displayName: name, avatar: '🙂', isGuest: !(seat && seat.userId), character: host ? null : seat.avatar, lang, dir: localeInfo(lang).dir },
    game: { id: s.gameId, title },
    ...(req.theme === 'light' || req.theme === 'dark' ? { theme: req.theme } : {}),
    save: {}, canSave: false, preview: false,
    deviceText: { title: tl('play.device.title'), text: tl('play.device.text'), lostTitle: tl('play.device.lostTitle'), lostText: tl('play.device.lostText'), retry: tl('play.device.retry') },
    live: {
      v: 1, role: host ? 'host' : 'player', seat: host ? 0 : seat.no, frame: tok.f, nameMode: s.nameMode, mode: s.mode, nicks,
      view: req.query.view === '2d' ? '2d' : '3d',
      me: host ? null : { seat: seat.no, name, avatar: seat.avatar, team: seat.team },
    },
  };
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  sendFrame(res, frameDocument(gameHtml, init, { cacheKey }), frameOrigins(req), { gzip });
});

// ---------------------------------------------------------------- results
router.get('/live/results/:id', on, requireAnyAccount, (req, res) => {
  const t = req.t, u = req.user;
  const id = String(req.params.id).replace(/\.csv$/, '');
  if (String(req.params.id).endsWith('.csv')) return resultsCsv(req, res, id);
  const s = LS.get(id);
  noStore(res);
  if (s && s.host.userId === u.id && s.summary) {
    const sum = s.summary;
    return page(req, res, { title: t('live.results.title'), head: '<link rel="stylesheet" href="/css/live.css">', body: V.resultsBody(req, { title: sum.title, players: sum.players, items: sum.items, guests: sum.guests, nicks: nicksFor(req.locale), nameMode: sum.nameMode, csv: s.startedAt ? `/live/results/${id}.csv` : null, gradebook: !!(s.clId && s.stepId && s.audience === 'class') }) });
  }
  const p = R.persisted(u, id);
  if (!p) return notFound(req, res, t('live.results.gone'));
  const players = p.scores.map(r => ({ rank: r.rank, name: r.display_name || r.username, score: r.score, correct: r.correct, answered: r.answered }));
  page(req, res, { title: t('live.results.title'), head: '<link rel="stylesheet" href="/css/live.css">', body: V.resultsBody(req, { title: p.run.title, players, items: p.items, guests: p.run.guests, saved: true, csv: `/live/results/${id}.csv`, nameMode: 'accounts' }) });
});
function resultsCsv(req, res, id) {
  const p = R.persisted(req.user, id);
  if (!p) return notFound(req, res, req.t('live.results.gone'));
  const cell = v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['rank', 'student', 'score', 'correct', 'answered'], ...p.scores.map(r => [r.rank, r.display_name || r.username, r.score, r.correct, r.answered])];
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="live-${id}.csv"`, 'Cache-Control': 'no-store' });
  res.send(rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n');
}

// ---------------------------------------------------------------- question sets
const setErr = (req, res, r) => res.status(r.code === 'notFound' ? 404 : 400).json({ error: req.t(`live.api.set.${r.code}`, { n: (r.at || 0) + 1 }), code: r.code, ...(r.at !== undefined ? { at: r.at } : {}) });
router.get('/live/sets', on, requireAnyAccount, hostOnly, (req, res) => {
  noStore(res);
  page(req, res, { title: req.t('live.sets.title'), active: 'classes', back: '/live', head: '<link rel="stylesheet" href="/css/live.css">', body: V.setsBody(req, { sets: SETS.listFor(req.user) }), scripts: ['/js/live-sets.js'] });
});
router.get('/api/live/sets', on, requireAnyAccount, hostOnly, (req, res) => res.json(SETS.listFor(req.user)));
router.get('/api/live/sets/:id', on, requireAnyAccount, hostOnly, (req, res) => {
  const set = SETS.getSet(req.params.id);
  if (!SETS.canUse(req.user, set)) return res.status(404).json({ error: req.t('errors.api.notFound') });
  res.json({ id: set.id, title: set.title, subject: set.subject, grade: set.grade, shared: !!set.shared, mine: set.owner_id === req.user.id, items: SETS.itemsOf(set) });
});
router.post('/api/live/sets', on, requireAnyAccount, hostOnly, rateLimit('lv-set', 120, 3600e3), (req, res) => {
  const b = req.body || {};
  const r = SETS.createSet(req.user, { title: b.title, subject: b.subject, grade: b.grade, items: b.items, shared: !!b.shared, lang: req.locale });
  if (!r.ok) return setErr(req, res, r);
  res.json({ id: r.set.id });
});
router.post('/api/live/sets/from-lesson/:lessonId', on, requireAnyAccount, hostOnly, rateLimit('lv-set', 120, 3600e3), (req, res) => {
  const r = SETS.fromLesson(req.user, req.params.lessonId);
  if (!r.ok) return setErr(req, res, r);
  res.json({ id: r.set.id, redirect: `/live/sets#${r.set.id}` });
});
router.post('/api/live/sets/:id', on, requireAnyAccount, hostOnly, rateLimit('lv-set', 120, 3600e3), (req, res) => {
  const b = req.body || {};
  const r = SETS.updateSet(req.user, req.params.id, { title: b.title, subject: b.subject, grade: b.grade, items: b.items, shared: b.shared === undefined ? undefined : !!b.shared });
  if (!r.ok) return setErr(req, res, r);
  res.json({ id: r.set.id });
});
router.post('/api/live/sets/:id/archive', on, requireAnyAccount, hostOnly, (req, res) => {
  const r = SETS.archiveSet(req.user, req.params.id);
  if (!r.ok) return setErr(req, res, r);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- the host's open session (entry points ask first)
router.get('/api/live/mine', on, requireAnyAccount, hostOnly, (req, res) => {
  const s = LS.hostSession(req.user.id);
  res.json(s && s.phase !== 'ended' ? { sid: s.id, title: s.title, host: `/live/host/${s.id}` } : {});
});

/** Is this game live-ready (its published version)? For game pages and the Studio. */
export const gameLiveReady = game => LS.liveOn() && C.gameReady(game);
