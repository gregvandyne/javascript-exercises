// Grammar Lab (services/grammar-lab.js, views/grammar-lab.js): the course page, a unit, a topic's practice, its teaching
// card and its look-back list, and the quiz APIs. Every path here answers the normal 404 unless GRAMMAR_LAB lets the
// visitor in (services/grammar-lab-access.js): with the flag off, for everyone, the platform admin included.
// Grading is on the server: the page never has an answer before the player has given theirs. POSTs are same-origin only
// (csrfCheck in app.js).
import { Router } from 'express';
import { page, notFound } from '../views/layout.js';
import { createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import * as seo from '../seo.js';
import * as GL from '../services/grammar-lab.js';
import { mayOpenGrammarLab, GRAMMAR_LAB_PATH } from '../services/grammar-lab-access.js';
import { honourPendingWins } from './courses.js';
import * as V from '../views/grammar-lab.js';

export const router = Router();
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The gate: nothing of Grammar Lab exists for a visitor the flag does not let in.
router.use((req, res, next) => {
  if (!GRAMMAR_LAB_PATH.test(req.path) || mayOpenGrammarLab(req.user)) return next();
  return req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('errors.api.notFound') }) : notFound(req, res);
});

/** A visitor without a session becomes a guest (like one tap on Play), so the quiz can run on the server. Browsers only. */
function ensureUser(req, res) {
  if (req.user) return req.user;
  if (seo.isBot(req.headers['user-agent']) || !allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return null;
  const guest = createGuest(); startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  return guest;
}
const honor = u => { if (u && !u.is_guest && !isGrownup(u)) honourPendingWins(u); };
const guestOf = u => !u || !!u.is_guest;

/** The unit and topic of a topic URL, the topic's state in that unit, or null (a 404 already sent). */
function loadTopic(req, res) {
  const { band, unit, topic } = req.params;
  const p = ID.test(unit) && ID.test(band) ? GL.pathway(unit, band) : null;
  const tp = p && ID.test(topic) && p.topics.includes(topic) ? GL.topic(topic) : null;
  if (!tp) { notFound(req, res); return null; }
  const s = GL.unitStates(req.user, p).find(x => x.topic.id === tp.id);
  return { p, tp, s };
}

router.get('/courses/grammar-lab', (req, res) => {
  const t = req.t, u = req.user;
  honor(u);
  const list = GL.bands().map(b => ({ band: b, units: GL.pathwaysOf(b.id).map(p => ({ p, prog: GL.unitProgress(u, p) })) }));
  const pending = GL.pendingSet(u).size > 0;
  page(req, res, { title: t('grammarLab.title'), active: 'learn', head: V.HEAD, body: V.coursePage({ t, list, guest: guestOf(u), pending }), description: t('grammarLab.sub') });
});

router.get('/courses/grammar-lab/:band/:unit', (req, res) => {
  const t = req.t, u = req.user;
  const p = ID.test(req.params.unit) && ID.test(req.params.band) ? GL.pathway(req.params.unit, req.params.band) : null;
  if (!p) return notFound(req, res);
  honor(u);
  page(req, res, { title: `${p.title} · ${t('grammarLab.title')}`, active: 'learn', head: V.HEAD, body: V.unitPage({ t, p, states: GL.unitStates(u, p), guest: guestOf(u) }) });
});

router.get('/courses/grammar-lab/:band/:unit/:topic', (req, res) => {
  if (isGrownup(req.user)) return res.redirect(302, '/courses/grammar-lab');
  let x = loadTopic(req, res); if (!x) return;
  // A browser opening a topic with no session becomes a guest, so its quiz can run on the server.
  if (!req.user && req.headers['sec-fetch-mode'] === 'navigate' && ensureUser(req, res)) x = loadTopic(req, res);
  const { p, tp, s } = x, t = req.t, u = req.user;
  honor(u);
  if (!s.open) return res.redirect(302, V.unitHref(p) + `#gl-topic-${tp.id}`);
  const run = u ? GL.currentRun(u, tp.id) : null;
  const again = req.query.again === '1';
  const live = run && !run.mastered && !again;
  const data = {
    topic: tp.id, unit: p.id, band: p.band, again, mastered: s.mastered, capfix: tp.format === 'capfix',
    // A run in progress goes straight back to its question; otherwise the welcome screen starts one.
    run: live ? { summary: GL.summaryOf(run), question: GL.questionFor(tp, run) } : null,
    glossary: Object.fromEntries(V.GLOSSARY.map(k => [k, { word: t(`grammarLab.glossaryWord.${k}`), def: t(`grammarLab.glossary.${k}`) }])),
    // The double-tap tip's demo sentence, in the page's language.
    tip: { before: t('grammarLab.tip.before'), word: t('grammarLab.glossaryWord.adjective'), after: t('grammarLab.tip.after'), def: t('grammarLab.tip.def'), replay: t('grammarLab.tip.replay') },
    unitTitle: p.title,
  };
  page(req, res, { title: `${tp.title} · ${t('grammarLab.title')}`, active: 'learn', mid: true, head: V.HEAD, bodyClass: 'gl-page',
    body: V.practicePage({ t, p, tp, data, guest: guestOf(u) }), scripts: ['/js/grammar-lab.js'] });
});

router.get('/courses/grammar-lab/:band/:unit/:topic/card', (req, res) => {
  const x = loadTopic(req, res); if (!x) return;
  const { p, tp } = x, t = req.t;
  page(req, res, { title: `${tp.title} · ${t('grammarLab.card.heading')}`, active: 'learn', mid: true, head: V.HEAD,
    body: V.cardPage({ t, p, tp, listen: GL.readsAloud(tp) }), scripts: ['/js/grammar-lab-card.js'] });
});

router.get('/courses/grammar-lab/:band/:unit/:topic/review', (req, res) => {
  const x = loadTopic(req, res); if (!x) return;
  const { p, tp, s } = x, t = req.t;
  honor(req.user);
  // Looking back opens once the topic is mastered (a guest's win waiting for sign-in counts for their own sitting).
  const list = s.mastered || s.pending ? GL.reviewOf(req.user, tp) : [];
  page(req, res, { title: `${tp.title} · ${t('grammarLab.review.heading')}`, active: 'learn', mid: true, head: V.HEAD, body: V.reviewPage({ t, p, tp, list }) });
});

// ------------------------------------------------------------------------------------------------- APIs
const api = [rateLimit('grammar-lab', 240, 60e3)];
function apiTopic(req, res) {
  const tp = ID.test(req.params.topic) ? GL.topic(req.params.topic) : null;
  const p = tp && typeof (req.body || {}).unit === 'string' && ID.test(req.body.unit) ? GL.pathway(req.body.unit, tp.band) : null;
  if (!tp || !p || !p.topics.includes(tp.id)) { res.status(404).json({ error: req.t('errors.api.notFound') }); return null; }
  const u = req.user;
  if (!u || isGrownup(u)) { res.status(401).json({ error: req.t('errors.api.signInFirst') }); return null; }
  const s = GL.unitStates(u, p).find(x => x.topic.id === tp.id);
  if (!s.open) { res.status(403).json({ error: req.t('errors.api.notFound') }); return null; }
  return { tp, p, u };
}
/** Start a run (a run in progress is kept; again: true starts over). */
router.post('/api/courses/grammar-lab/topic/:topic/start', ...api, (req, res) => {
  const x = apiTopic(req, res); if (!x) return;
  const run = GL.startRun(x.u, x.tp, { again: (req.body || {}).again === true });
  res.json({ summary: GL.summaryOf(run), question: GL.questionFor(x.tp, run) });
});
/** One try: { unit, marked: [word places] }. Graded here; the answer never goes to the page. */
router.post('/api/courses/grammar-lab/topic/:topic/answer', ...api, (req, res) => {
  const x = apiTopic(req, res); if (!x) return;
  const b = req.body || {};
  if (typeof b.id !== 'string') return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const run = GL.currentRun(x.u, x.tp.id);
  // A try for a question that is no longer on screen (a second tab, a double send) changes nothing.
  const on = run && GL.questionFor(x.tp, run);
  if (!on || on.id !== b.id) return res.status(409).json({ error: req.t('errors.api.badRequest'), summary: run ? GL.summaryOf(run) : null, question: on || null });
  const r = GL.answerRun(x.u, x.tp, b.marked);
  if (!r) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const out = { result: r.result, kind: r.kind, levelDone: r.levelDone, mastered: r.mastered, summary: r.summary, question: r.question, hint: r.hint };
  if (r.mastered) {
    // The next topic, worked out now: never a mastered one (this unit first, then the band's other units).
    const nxt = GL.nextTopic(x.u, x.p, x.tp.id);
    out.closing = { answered: r.summary.counter, next: nxt ? { title: nxt.topic.title, href: V.topicHref(nxt.unit, nxt.topic.id) } : null, win: r.win,
      ...(GL.room(x.tp.id) ? { room: GL.roomHref(x.p.id, x.tp.id) } : {}) };
  }
  res.json(out);
});
/** A Mistake Hunt room's fixes, from the game (public/js/play.js proofForGame): { unit, edits, handIn?, hint? }. Saved,
 *  hinted or handed in and checked here (services/grammar-lab.js roomSave); the key never goes to the page before. */
router.post('/api/courses/grammar-lab/topic/:topic/room', ...api, (req, res) => {
  const x = apiTopic(req, res); if (!x) return;
  if (!GL.room(x.tp.id)) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const b = req.body || {};
  const r = GL.roomSave(x.u, x.tp.id, b.edits, { handIn: b.handIn === true, hint: Number.isInteger(b.hint) ? b.hint : null });
  if (!r.ok) return res.status(r.code === 'notFound' ? 404 : r.code === 'handedIn' ? 409 : 400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  res.json({ view: r.view, ...('hint' in r ? { hint: r.hint } : {}), ...('passed' in r ? { passed: r.passed } : {}) });
});
/** "Report a problem" on a question: logged for the content team (no text is taken from the player). */
router.post('/api/courses/grammar-lab/topic/:topic/flag', rateLimit('grammar-lab-flag', 10, 60e3), (req, res) => {
  const x = apiTopic(req, res); if (!x) return;
  const id = String((req.body || {}).id || '');
  if (!x.tp.items.some(it => it.id === id)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  log('info', 'grammar-lab flag', { topic: x.tp.id, item: id, user: x.u.id });
  res.json({ ok: true });
});
