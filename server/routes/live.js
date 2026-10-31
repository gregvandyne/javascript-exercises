// Oomba Live pages and APIs (docs/decisions.md "Oomba Live"; protocol and page hooks: docs/live-protocol.md).
//   /join                 one join page: a 7-digit live code here, a 6-character class code goes on to the class flow
//                         (routes/google.js), unchanged. Mounted before googleRoutes.
//   /api/live/join        a code -> a seat token (no cookie, no account, no database row for a guest)
//   /live                 the host's landing: pick a game or mode, questions, who can join
//   /live/host/:sid       the projector page; /live/play/:sid the player's page; /live/frame/:token the game frame
//   /live/results/:id     results (from memory for 10 minutes, then what was saved), .csv for saved runs
//   /live/sets            question sets; /api/live/sets... their API
//   /live/host/:sid/dash  the teacher's dashboard (part 3): the signed-in host only, a phone the class can't see
//   /api/live/prefs       the host's remembered game settings; /api/live/classes/:classId/teams|support the class's
//                         saved teams (the class teams editor) and saved support (LIVE_SAVE_SUPPORT)
//   /api/live/cohost/:sid co-hosts (part 4): the host's panel, invite / cancel / remove / make host; the invitee's
//                         answer; a co-host leaving. /live/cohost/:sid the invite page (LIVE_COHOST; 404 when off)
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
import * as PROG from '../services/progress.js';
import * as LS from '../services/classlive-sessions.js';
import * as A from '../services/classlive-access.js';
import * as R from '../services/classlive-results.js';
import * as SETS from '../services/classlive-sets.js';
import * as C from '../services/classlive-check.js';
import * as T from '../services/classlive-teams.js';
import * as ST from '../services/classlive-settings.js';
import * as D from '../services/classlive-dash.js';
import * as CH from '../services/classlive-cohost.js';
import { SAY, BONUS_REASONS } from '../services/classlive-protocol.js';
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
/** Part 4: this account's role in an open session ('host' | 'cohost' | null). */
const ctlRole = (s, u) => (s && u && s.phase !== 'ended' ? LS.roleOf(s, u.id) : null);
/** What a controller's pages need: { role, tier, cohosts: the co-host feature is on for this room }. */
const ctlInfo = (s, u) => { const role = LS.roleOf(s, u.id); return { role, tier: role === 'host' ? s.host.tier : (s.cohosts.get(u.id) || {}).tier || 'limited', cohosts: LS.cohostOn() && s.audience !== 'open' && role === 'host' }; };
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
  const key = LS.joinKeys(req);
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
  const ready = list => list.filter(g => g.published_version_id && C.gameReady(g)).map(g => { const c = C.liveCheck(g.published_version_id); return { id: g.id, icon: g.icon, title: g.title, quiz: c.quiz, teams: !!c.teams }; });
  const mine = games.myGames(u.id, 200).filter(g => g.status === 'published' && !g.hidden_reason);
  const teaching = S.classesOf(u.id, 'teacher');
  const sharedSeen = new Set(mine.map(g => g.id));
  const shared = [];
  for (const c of teaching) for (const g of games.classGames(c.id, { limit: 100 })) if (!sharedSeen.has(g.id)) { sharedSeen.add(g.id); shared.push(g); }
  const groups = [{ key: 'official', games: ready(officialReady()) }, { key: 'mine', games: ready(mine) }, ...(teaching.length ? [{ key: 'shared', games: ready(shared) }] : [])];
  // Quest Race and Question Battle are not offered for now (scripts/seed.js RETIRED_GAMES); the modes stay in the
  // server so they can come back by listing them here again.
  const modes = [];
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
    body: V.landingBody(req, { modes, groups, sets: SETS.listFor(u), starters, classes: teaching, family, pre, recent: R.hostRuns(u.id, 8), maxPlayers: A.maxPlayersFor(u, 'open', null) === 30 ? 30 : config.liveMaxPlayers, origin: requestOrigin(req),
      prefs: ST.loadPrefs(u.id), teamsOn: LS.teamsOn(),
      cohost: { invites: CH.invitesFor(u).map(x => ({ sid: x.s.id, title: x.s.title, from: x.from })), on: CH.cohostingFor(u).map(x => ({ sid: x.id, title: x.title })) } }) });
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
  // Game settings: a JSON object, or the landing form's flat fields (classlive-settings checks every value).
  const flat = Object.fromEntries(Object.keys(ST.KEYS).filter(k => b[k] !== undefined).map(k => [k, b[k]]));
  o.settings = b.settings && typeof b.settings === 'object' && !Array.isArray(b.settings) ? b.settings : flat;
  // The landing's late-join box doesn't know the audience: open rooms keep locking at start (the host can still allow
  // late joiners in the room's settings).
  if (o.audience === 'open' && o.settings === flat) delete o.settings.late;
  // Teams: { n, scoring, presets } (JSON) or the form's teams (0 = off, 2-6) and scoring.
  const tn = b.teams && typeof b.teams === 'object' ? +b.teams.n : +[].concat(b.teams ?? '').pop();
  if (Number.isInteger(tn) && tn >= 2 && tn <= 6) {
    const sc = b.teams && typeof b.teams === 'object' ? b.teams.scoring : [].concat(b.scoring ?? '').pop();
    o.teams = { n: tn, scoring: sc === 'sum' ? 'sum' : 'avg', ...(b.teams && Array.isArray(b.teams.presets) ? { presets: b.teams.presets.map(Number) } : {}) };
  }
  return o;
}
/** "Play the missed questions again" and "Play again with these teams" (a saved class run): the run's game, audience,
 *  class, settings and teams; the questions (missed: accuracy under 100 %, lowest first, at most 20) or the team plan.
 *  -> { ok, opts } | { ok: false, status, code } */
function fromRunOpts(req, b) {
  const u = req.user, id = String(b.fromRun || b.againRun || '');
  const mem = LS.get(id);
  const mine = mem && mem.host.userId === u.id && mem.summary ? mem : null;
  const saved = mine ? null : R.persisted(u, id);
  if (!mine && !saved) return { ok: false, status: 404, code: 'notFound' };
  const run = mine ? { mode: mine.mode, game_id: mine.gameId, audience: mine.audience, class_id: mine.classId, set_id: mine.setId, title: mine.title } : saved.run;
  const settings = mine ? mine.summary.settings : saved.settings;
  // A saved run's setup: its n and presets (runs saved since they were kept); an older run lists only the teams that
  // had a member, so those are renumbered 1..n in order and the plan follows (renumber: old k -> new k).
  let teamCfg = null, renumber = null;
  if (mine) teamCfg = T.setupOf(mine);
  else if (saved.teams && Array.isArray(saved.teams.list)) {
    const st = saved.teams, list = st.list.slice().sort((a, c) => a.k - c.k);
    if (Number.isInteger(st.n) && Array.isArray(st.presets)) teamCfg = { n: st.n, presets: st.presets, scoring: st.scoring };
    else { teamCfg = { n: list.length, presets: list.map(t => t.p), scoring: st.scoring }; renumber = new Map(list.map((t, i) => [t.k, i + 1])); }
  }
  const o = { mode: run.mode, gameId: run.mode === 'game' ? run.game_id : null, audience: run.audience, classId: run.class_id, lang: req.locale, replace: true, title: run.title,
    ...(settings ? { settings } : {}), ...(teamCfg && teamCfg.n >= 2 ? { teams: teamCfg } : {}) };
  if (run.audience === 'class' && !run.class_id) return { ok: false, status: 400, code: 'noClass' };
  if (b.fromRun) {
    const m = R.missedOf(mine ? mine.summary.items : saved.items);
    if (!m.ok) return { ok: false, status: 400, code: m.code };
    o.items = m.items;
    o.settings = { ...(o.settings || {}), count: 0 };
  } else {
    // Play again with these teams: the run's questions again; the plan is who was on which team.
    if (mine && mine.allItems) o.items = mine.allItems.map(it => ({ q: it.q, choices: it.choices, answer: it.answer, secs: it.own || it.secs }));
    else if (run.set_id) o.setId = run.set_id;
    else { const all = (mine ? mine.summary.items : saved.items).map(R.asItem).filter(Boolean); if (all.length) o.items = all; }
    const plan = new Map();
    if (mine) { for (const seat of [...mine.seats.values(), ...(mine.gone || [])]) if (seat.userId && seat.team) plan.set(seat.userId, seat.team); }
    else for (const r of saved.scores) { const k = renumber ? renumber.get(r.team) : r.team; if (k) plan.set(r.user_id, k); }
    if (!o.teams) return { ok: false, status: 400, code: 'teamsOff' };
    o.plan = plan;
  }
  return { ok: true, opts: o };
}
router.post('/api/live/sessions', on, requireAnyAccount, hostOnly, rateLimit('lv-new', 30, 3600e3), (req, res) => {
  const b = req.body || {};
  // Play again with the same players (while they linger after the end).
  if (b.again) {
    const r = LS.rematch(LS.get(String(b.again)), req.user, { shuffle: b.shuffle === true || b.shuffle === '1' });
    if (!r.ok) return apiErr(req, res, r.code === 'againGone' ? 410 : 400, r.code === 'againGone' ? 'againGone' : r.code);
    return res.json({ sid: r.session.id, redirect: `/live/host/${r.session.id}`, moved: r.moved });
  }
  let opts;
  if (b.fromRun || b.againRun) {
    const f = fromRunOpts(req, b);
    if (!f.ok) return apiErr(req, res, f.status, f.code);
    opts = f.opts;
  } else opts = sessionOpts(b, req);
  const r = LS.createSession(req.user, opts);
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
  if (s && s.phase === 'ended' && (s.host.userId === req.user.id || (s.endCtl && s.endCtl.has(req.user.id)))) return res.redirect(302, `/live/results/${s.id}`);
  // The host, or a co-host (part 4: the projector slot is decided at hello).
  const role = ctlRole(s, req.user);
  if (!role) return notFound(req, res);
  if (role === 'host') s.host.lang = req.locale; else s.cohosts.get(req.user.id).lang = req.locale;
  noStore(res);
  page(req, res, { title: req.t('live.host.title'), bare: true, bodyClass: 'lv-body lv-projector', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.hostBody(req, { s, origin: requestOrigin(req), token: LS.ctlToken(s, req.user.id), nicks: nicksFor(req.locale), classSignIn: s.audience !== 'open',
      teamsOn: LS.teamsOn(), hasLast: LS.teamsOn() && s.audience === 'class' && !!T.loadClassTeams(s.classId), ctl: ctlInfo(s, req.user) }), scripts: ['/js/live-host.js'] });
});

// ---------------------------------------------------------------- the teacher's dashboard (part 3)
// The address holds only the session id (the projector shows it as a QR): the page needs the host's own sign-in, so a
// student who scans it gets the sign-in page, and anyone else signed in a 404. The host token is in the page only for
// that account, never in the address.
// Part 4: a co-host's Teacher view is this page with their own token; a pending invitee who scans the projector's QR is
// sent to their invite.
router.get('/live/host/:sid/dash', on, requireAnyAccount, (req, res) => {
  const s = LS.get(req.params.sid);
  if (s && s.phase === 'ended' && (s.host.userId === req.user.id || (s.endCtl && s.endCtl.has(req.user.id)))) return res.redirect(302, `/live/results/${s.id}`);
  const role = ctlRole(s, req.user);
  if (!role) {
    if (s && s.phase !== 'ended' && LS.cohostOn() && s.invites.has(req.user.id)) return res.redirect(302, `/live/cohost/${s.id}`);
    return notFound(req, res);
  }
  noStore(res);
  page(req, res, { title: req.t('live.dash.title'), bare: true, bodyClass: 'lv-body lv-dashboard', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.dashBody(req, { s, token: LS.ctlToken(s, req.user.id), nicks: nicksFor(req.locale), presets: T.presetsFor(req.t), saveSupport: LS.supportSaveOn(s), ctl: ctlInfo(s, req.user), origin: requestOrigin(req) }), scripts: ['/js/live-dash.js'] });
});

// ---------------------------------------------------------------- co-hosts (part 4)
const cohostOn = (req, res, next) => (LS.cohostOn() ? next() : res.status(404).json({ error: req.t('errors.api.notFound') }));
const notFoundJson = (req, res) => res.status(404).json({ error: req.t('errors.api.notFound') });
const cohostErr = (req, res, status, code) => res.status(status).json({ error: req.t(`live.api.cohost.${code}`), code });
/** The host's panel: who runs the game, who may be invited (names from lists the host already sees), the link. */
router.get('/api/live/cohost/:sid', on, cohostOn, requireAnyAccount, (req, res) => {
  const s = LS.get(req.params.sid);
  if (!s || s.phase === 'ended' || s.host.userId !== req.user.id) return notFoundJson(req, res);
  if (s.audience === 'open') return cohostErr(req, res, 400, 'cohostRoom');
  noStore(res);
  res.json(CH.view(s));
});
router.post('/api/live/cohost/:sid', on, cohostOn, requireAnyAccount, rateLimit('lv-cohost', 60, 3600e3), (req, res) => {
  const s = LS.get(req.params.sid), b = req.body || {};
  if (!s || s.phase === 'ended' || s.host.userId !== req.user.id) return notFoundJson(req, res);
  const fn = { invite: CH.invite, cancel: CH.cancel, remove: CH.remove, host: CH.makeHost }[String(b.a || '')];
  if (!fn) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const r = fn(s, req.user, String(b.userId || ''));
  if (!r.ok) return r.code === 'notFound' || r.code === 'off' ? notFoundJson(req, res) : cohostErr(req, res, 400, r.code);
  noStore(res);
  res.json({ ok: true, ...(b.a === 'host' ? {} : CH.view(s)), ...(b.a === 'invite' ? { toast: req.t('live.cohost.toastInvited') } : {}), ...(b.a === 'host' ? { redirect: `/live/host/${s.id}/dash` } : {}) });
});
const yes = v => v === true || v === 1 || v === '1' || v === 'yes';
router.post('/api/live/cohost/:sid/answer', on, cohostOn, requireAnyAccount, rateLimit('lv-cohost-ans', 30, 3600e3), (req, res) => {
  const s = LS.get(req.params.sid);
  const want = yes((req.body || {}).yes);
  const r = CH.answer(s, req.user, want);
  if (!r.ok) return cohostErr(req, res, 410, 'gone');
  noStore(res);
  res.json({ ok: true, redirect: want ? `/live/host/${s.id}/dash` : '/live' });
});
router.post('/api/live/cohost/:sid/leave', on, cohostOn, requireAnyAccount, (req, res) => {
  const s = LS.get(req.params.sid);
  const r = CH.leave(s, req.user);
  if (!r.ok) return notFoundJson(req, res);
  res.json({ ok: true, redirect: '/live', toast: req.t('live.cohost.left') });
});
/** The invite page: only for the invited account (anyone else gets the same 404 as an unknown session); a co-host or
 *  the host goes to their Teacher view. */
router.get('/live/cohost/:sid', on, requireAnyAccount, (req, res) => {
  const s = LS.get(req.params.sid);
  if (!LS.cohostOn() || !s || s.phase === 'ended') return notFound(req, res);
  if (ctlRole(s, req.user)) return res.redirect(302, `/live/host/${s.id}/dash`);
  CH.prune(s);
  const inv = s.invites.get(req.user.id);
  if (!inv) return notFound(req, res);
  noStore(res);
  page(req, res, { title: req.t('live.cohost.inviteTitle'), bare: true, mid: true, bodyClass: 'lv-body', head: '<link rel="stylesheet" href="/css/live.css">',
    body: V.cohostInviteBody(req, { s, from: s.names.get(inv.by) || '', tier: inv.tier }) });
});

// ---------------------------------------------------------------- remembered settings (part 3)
router.get('/api/live/prefs', on, requireAnyAccount, hostOnly, (req, res) => { noStore(res); res.json(ST.loadPrefs(req.user.id) || {}); });
router.post('/api/live/prefs', on, requireAnyAccount, hostOnly, rateLimit('lv-prefs', 60, 3600e3), (req, res) => {
  const b = req.body || {};
  const t = b.teams && typeof b.teams === 'object' ? b.teams : {};
  const p = ST.savePrefs(req.user.id, { settings: b.settings || {}, teams: { on: !!t.on, n: Number.isInteger(t.n) && t.n >= 2 && t.n <= 6 ? t.n : 2, scoring: t.scoring === 'sum' ? 'sum' : 'avg' } });
  res.json(p);
});
router.delete('/api/live/prefs', on, requireAnyAccount, hostOnly, (req, res) => { ST.resetPrefs(req.user.id); res.json({ ok: true }); });

// ---------------------------------------------------------------- a class's saved teams and support (class teachers)
/** The class, when the user teaches it (else null: 404). Archived classes only for deleting saved student data
 *  (archived: true), which must stay possible on demand. */
const taughtClass = (req, { archived = false } = {}) => { const c = S.getClass(String(req.params.classId || '')); return c && (archived || !c.archived_at) && S.teaches(req.user, c.id) ? c : null; };
const classStudents = classId => S.roster(classId).filter(r => r.role === 'student').map(r => ({ id: r.id, name: r.roster_name || r.display_name || r.username }));
router.get('/api/live/classes/:classId/teams', on, requireAnyAccount, (req, res) => {
  const c = taughtClass(req);
  if (!c || !LS.teamsOn()) return res.status(404).json({ error: req.t('errors.api.notFound') });
  noStore(res);
  const saved = T.loadClassTeams(c.id);
  res.json({ classId: c.id, students: classStudents(c.id), saved: saved ? { n: saved.cfg.n, presets: saved.cfg.presets, scoring: saved.cfg.scoring, plan: [...saved.plan], savedAt: saved.savedAt } : null });
});
router.put('/api/live/classes/:classId/teams', on, requireAnyAccount, rateLimit('lv-cteams', 120, 3600e3), (req, res) => {
  const c = taughtClass(req);
  if (!c || !LS.teamsOn()) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const b = req.body || {};
  const n = +b.n;
  if (!Number.isInteger(n) || n < 2 || n > 6 || !Array.isArray(b.plan) || b.plan.length > 1000) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const plan = new Map();
  for (const x of b.plan) if (Array.isArray(x) && typeof x[0] === 'string' && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= n) plan.set(x[0], x[1]);
  T.saveClassPlan(c.id, { n, presets: Array.isArray(b.presets) ? b.presets.map(Number) : [], scoring: b.scoring }, plan, req.user.id);
  res.json({ ok: true, toast: req.t('live.team.saved') });
});
// Deleting saved student data works whatever the feature flags (Oomba Live, teams, LIVE_SAVE_SUPPORT) and for archived
// classes: data saved while a flag was on must stay deletable on demand after it is turned off (legal-review item 42).
router.delete('/api/live/classes/:classId/teams', requireAnyAccount, (req, res) => {
  const c = taughtClass(req, { archived: true });
  if (!c) return res.status(404).json({ error: req.t('errors.api.notFound') });
  T.forgetClassTeams(c.id);
  res.json({ ok: true });
});
const supportOn = (req, res, next) => (config.liveSaveSupport ? next() : res.status(404).json({ error: req.t('errors.api.notFound') }));
router.get('/api/live/classes/:classId/support', on, supportOn, requireAnyAccount, (req, res) => {
  const c = taughtClass(req);
  if (!c) return res.status(404).json({ error: req.t('errors.api.notFound') });
  noStore(res);
  res.json({ classId: c.id, support: R.classSupport(c.id).map(r => ({ userId: r.user_id, name: r.display_name || r.username, time: r.extra_time, read: !!r.read_aloud, simple: !!r.simple })) });
});
router.post('/api/live/classes/:classId/support', on, supportOn, requireAnyAccount, rateLimit('lv-sup', 300, 3600e3), (req, res) => {
  const c = taughtClass(req);
  if (!c) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const b = req.body || {};
  const userId = String(b.userId || '');
  const m = S.classMember(c.id, userId);
  const time = +b.time;
  if (!m || m.role !== 'student' || ![100, 150, 200].includes(time)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  R.saveSupport(c.id, userId, { time, read: !!b.read, simple: !!b.simple }, req.user.id);
  res.json({ ok: true });
});
router.delete('/api/live/classes/:classId/support', requireAnyAccount, (req, res) => {
  const c = taughtClass(req, { archived: true });
  if (!c) return res.status(404).json({ error: req.t('errors.api.notFound') });
  res.json({ ok: true, cleared: R.clearClassSupport(c.id) });
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
  // The host's frame, or (part 4) a co-host's who holds the projector slot: the token's account and nonce must be a
  // current controller's.
  const host = tok.r === 'h' || tok.r === 'c';
  const seat = host ? null : LS.seatFor(s, tok);
  if (host ? !LS.ctlNonceOk(s, tok.u, tok.k) : !seat) return sendFrameText(res, 403, t('play.frameExpired'));
  // The frame is same-site, so the sign-in cookie comes along: a signed-in seat's frame is theirs only.
  const u = req.user && !req.user.is_guest ? req.user : null;
  if (tok.u && (!u || u.id !== tok.u)) return sendFrameText(res, 403, t('play.frameExpired'));
  if (!host && !A.seatCanView(s, tok.u ? u : null)) return sendFrameText(res, 404, t('live.play.takenDown'));
  const lang = normalizeCode(tok.l) || req.locale;
  const nicks = nicksFor(lang);
  const own = host ? '' : LS.nameFor(s, seat, 'player');
  const name = typeof own === 'number' ? nicks[own] : own;
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
      // Team presets with their names in the frame's language (the pack keeps no copy). Never anyone's support.
      teamPresets: T.presetsFor(tl),
    },
  };
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  sendFrame(res, frameDocument(gameHtml, init, { cacheKey }), frameOrigins(req), { gzip });
});

// ---------------------------------------------------------------- results
// Split for a projector (T2): a class-safe part (team podium and table, hardest questions, question review; no student
// names) and "Student details" (closed): marks, bonus, needs help and the CSV.
router.get('/live/results/:id', on, requireAnyAccount, (req, res) => {
  const t = req.t, u = req.user;
  const id = String(req.params.id).replace(/\.csv$/, '');
  if (String(req.params.id).endsWith('.csv')) return resultsCsv(req, res, id);
  const s = LS.get(id);
  noStore(res);
  const presets = T.presetsFor(t);
  const common = { presets, homework: config.liveHomework && S.isStaff(u), sayTeams: LS.teamsOn(), classes: config.liveHomework ? S.classesOf(u.id, 'teacher') : [] };
  const tier = memTier(s, u);
  if (tier) {
    const sum = s.summary, limited = tier !== 'full';
    // part 4: a limited controller (not a teacher of the class) gets the class-safe part only (no student details, no CSV)
    return page(req, res, { title: t('live.results.title'), head: '<link rel="stylesheet" href="/css/live.css">', scripts: ['/js/live-results.js'],
      body: V.resultsBody(req, { ...common, id, title: sum.title, mode: sum.mode, players: limited ? [] : sum.players, playerCount: sum.players.length, items: sum.items, teams: sum.teams, scoring: sum.scoring, guests: sum.guests, nicks: nicksFor(req.locale), nameMode: sum.nameMode,
        csv: s.startedAt && !limited ? `/live/results/${id}.csv` : null, gradebook: !!(s.clId && s.stepId && s.audience === 'class'), still: LS.lingering(s), quiz: !!s.quiz, setId: s.setId,
        againRun: s.audience === 'class' && sum.teams.length > 0, limited, hostActs: s.host.userId === u.id, runLog: tier === 'full' && s.cohostEver ? memLog(req, s) : [], logZone: zoneOfClass(s.classId) }) });
  }
  const p = R.persisted(u, id);
  if (!p) return notFound(req, res, t('live.results.gone'));
  const players = p.scores.map(r => ({ rank: r.rank, name: r.display_name || r.username, score: r.score, bonus: r.bonus, team: r.team, marks: r.marks, correct: r.correct, answered: r.answered, help: r.answered >= 3 && r.correct / r.answered < 0.5 ? 'lowScore' : '' }));
  const teams = p.teams ? p.teams.list.map(x => ({ ...x, score: p.teams.scoring === 'sum' ? x.sum : x.avg })) : [];
  page(req, res, { title: t('live.results.title'), head: '<link rel="stylesheet" href="/css/live.css">', scripts: ['/js/live-results.js'],
    body: V.resultsBody(req, { ...common, id, title: p.run.title, mode: p.run.mode, players, items: p.items, teams, scoring: p.teams ? p.teams.scoring : null, guests: p.run.guests, saved: true, csv: `/live/results/${id}.csv`, nameMode: 'accounts',
      quiz: p.run.scored_by === 'server' || p.items.some(it => R.asItem(it)), setId: p.run.set_id, againRun: !!(p.run.class_id && teams.length),
      runLog: R.runLog(p.run).map(x => ({ at: x.at, text: logText(req, x, presets, p.teams ? p.teams.list : []) })), logZone: zoneOfClass(p.run.class_id) }) });
});
/** A class's school time zone (IANA) or null. */
function zoneOfClass(classId) {
  const c = classId && S.getClass(classId);
  return c ? S.zoneOf(S.getSchool(c.school_id)) : null;
}
/** Part 4: the in-memory results for this account: the owner and everyone who controlled the game at its end, each
 *  with their tier ('full' | 'limited'), or null. */
function memTier(s, u) {
  if (!s || !s.summary || !u) return null;
  if (s.endCtl && s.endCtl.has(u.id)) {
    // details only while they still teach the class (access can fall after the end too); the owner keeps theirs
    const was = s.endCtl.get(u.id);
    return was === 'full' && s.owner !== u.id && A.controlTier(s, u) !== 'full' ? 'limited' : was;
  }
  return s.owner === u.id || s.host.userId === u.id ? 'full' : null;
}
const ACT_OF = { eyes: x => (x.detail === '0' ? 'eyesOff' : 'eyesOn'), bonus: x => (/^k\d+$/.test(x.detail) ? 'bonusTeam' : 'bonus') };
/** One line of "Who ran this game" (a saved run's log, or the session's in memory). */
function logText(req, x, presets = [], teamList = []) {
  const t = req.t, former = t('live.cohost.log.former');
  const a = ACT_OF[x.action] ? ACT_OF[x.action](x) : x.action;
  const k = /^k(\d+)$/.exec(x.detail || '');
  const team = k ? ((presets[(teamList.find(r => r.k === +k[1]) || {}).p] || {}).name || t('live.cohost.log.team')) : '';
  return t(`live.cohost.act.${V.ACT_KEYS.includes(a) ? a : 'settings'}`, { name: x.actor || former, other: x.other || former, player: x.target || t('live.cohost.log.player'), s: Number(x.detail) || 0, team });
}
/** The session's log while it is in memory (the host's results page right after the end). */
function memLog(req, s) {
  const nm = id => s.names.get(id) || '';
  return s.log.map(e => ({ at: e.at, text: logText(req, { action: e.a, actor: nm(e.by), other: nm(e.other), target: '', detail: e.v !== undefined ? String(e.v) : e.k !== undefined ? `k${e.k}` : '' }, T.presetsFor(req.t), s.summary ? s.summary.teams : []) }));
}
/** CSV: saved class runs (the host and the class's teachers), and in-memory runs (the host, 10 minutes; nicknames). */
function resultsCsv(req, res, id) {
  const tn = T.presetsFor(req.t);
  const teamName = (k, list) => { const x = list.find(r => r.k === k); return x ? tn[x.p].name : ''; };
  let body;
  const s = LS.get(id);
  if (s && memTier(s, req.user) === 'full' && s.startedAt) {
    const sum = s.summary, nicks = nicksFor(req.locale);
    body = R.csv({ players: sum.players.map(p => ({ ...p, name: typeof p.name === 'number' ? nicks[p.name] : p.name, team: teamName(p.team, sum.teams) })), items: sum.items });
  } else {
    const p = R.persisted(req.user, id);
    if (!p) return notFound(req, res, req.t('live.results.gone'));
    const list = p.teams ? p.teams.list : [];
    body = R.csv({ players: p.scores.map(r => ({ rank: r.rank, name: r.display_name || r.username, team: teamName(r.team, list), score: r.score, bonus: r.bonus, correct: r.correct, answered: r.answered, marks: r.marks })), items: p.items });
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="live-${id}.csv"`, 'Cache-Control': 'no-store' });
  res.send(body);
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

// ---------------------------------------------------------------- homework from a question set (LIVE_HOMEWORK, off)
const homeworkOn = (req, res, next) => (config.liveHomework ? next() : apiErr(req, res, 404, 'homeworkOff'));
router.post('/api/live/sets/:id/homework', on, homeworkOn, requireAnyAccount, hostOnly, rateLimit('lv-hw', 60, 3600e3), (req, res) => {
  const b = req.body || {};
  const r = SETS.homework(req.user, req.params.id, b.classId, { opensAt: b.opensAt || null, dueAt: b.dueAt || null });
  if (!r.ok) {
    if (r.code === 'noClass' || r.code === 'setIncomplete') return apiErr(req, res, 400, r.code);
    if (r.code === 'notFound') return res.status(404).json({ error: req.t('errors.api.notFound') });
    return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  }
  res.json({ ok: true, lessonId: r.lesson.id, classLessonId: r.classLesson.id, redirect: `/class/${r.classLesson.class_id}/progress` });
});
// The student's quiz step: its questions (never the answers) and one answer at a time, checked here.
router.get('/api/lessons/:clId/steps/:stepId/quiz', on, homeworkOn, requireAnyAccount, (req, res) => {
  const r = PROG.quizFor(req.user, req.params.clId, req.params.stepId);
  if (!r.ok) return res.status(404).json({ error: req.t('errors.api.notFound') });
  noStore(res);
  res.json({ items: r.items, marks: r.marks });
});
router.post('/api/lessons/:clId/steps/:stepId/quiz', on, homeworkOn, requireAnyAccount, rateLimit('lv-quiz', 600, 3600e3), (req, res) => {
  const b = req.body || {};
  const r = PROG.quizAnswer(req.user, req.params.clId, req.params.stepId, +b.i, +b.c);
  if (!r.ok) return res.status(r.code === 'notFound' ? 404 : 400).json({ error: req.t(r.code === 'notFound' ? 'errors.api.notFound' : 'errors.api.badRequest'), code: r.code });
  res.json({ ok: r.right, answer: r.answer, next: r.next, score: r.score });
});

// ---------------------------------------------------------------- the host's open session (entry points ask first)
router.get('/api/live/mine', on, requireAnyAccount, hostOnly, (req, res) => {
  const s = LS.hostSession(req.user.id);
  // part 4: also the games this account co-hosts and its invites (only while co-hosts are on)
  const cohosting = CH.cohostingFor(req.user).map(x => ({ sid: x.id, title: x.title, dash: `/live/host/${x.id}/dash` }));
  const invites = CH.invitesFor(req.user).map(x => ({ sid: x.s.id, title: x.s.title, from: x.from, page: `/live/cohost/${x.s.id}` }));
  const extra = { ...(cohosting.length ? { cohosting } : {}), ...(invites.length ? { invites } : {}) };
  noStore(res);
  res.json({ ...(s && s.phase !== 'ended' ? { sid: s.id, title: s.title, host: `/live/host/${s.id}` } : {}), ...extra });
});

/** Is this game live-ready (its published version)? For game pages and the Studio. */
export const gameLiveReady = game => LS.liveOn() && C.gameReady(game);
