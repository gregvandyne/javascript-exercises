// Courses (services/courses.js, views/courses.js): the course page (band picker, then the course map), a course step
// (slides, quick check, game module) and the step's small JSON APIs. Grading is on the server: the page never has an
// answer before the player has given theirs. POSTs are same-origin only (csrfCheck in app.js).
import express, { Router } from 'express';
import { page, notFound } from '../views/layout.js';
import * as C from '../services/courses.js';
import { coursePage, stepPage, afterSection } from '../views/courses.js';
import { createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { isStaff } from '../services/schools.js';
import * as seo from '../seo.js';
import { current } from '../i18n/index.js';

export const router = Router();
const form = express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 });
const STEP = /^(1b|2)-\d\.\d$/;

/** A visitor without a session becomes a guest (like one tap on Play), so their course progress saves. Browsers only. */
function ensureUser(req, res) {
  if (req.user) return req.user;
  if (seo.isBot(req.headers['user-agent']) || !allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return null;
  const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  return guest;
}
/** School staff and the platform admin can open any step (to preview it); everyone else only open steps. */
const preview = u => !!u && (u.role === 'admin' || isStaff(u));

router.get('/courses', (req, res) => res.redirect(302, `/courses/${C.COURSES[0].slug}`));
router.get('/courses/:slug', (req, res) => {
  const c = C.getCourse(req.params.slug);
  if (!c) return notFound(req, res);
  const t = req.t, u = req.user;
  page(req, res, { title: t(`${c.key}.title`), active: 'home', body: coursePage({ course: c, games: C.courseGames(u, c), ov: C.overview(u, c), canPick: !isGrownup(u) }),
    description: t(`${c.key}.sub`), seo: { index: true, path: `/courses/${c.slug}`, langs: seo.langsWithKey(`${c.key}.about`) } });
});

// The band: picked once from the two cards, switched later from the course map. A plain form post (no script needed).
router.post('/courses/:slug/band', rateLimit('course-band', 30, 60e3), form, (req, res) => {
  const c = C.getCourse(req.params.slug);
  if (!c) return notFound(req, res);
  const band = String((req.body && req.body.band) || '');
  if (!C.BANDS.includes(band)) return res.redirect(303, `/courses/${c.slug}`);
  const u = isGrownup(req.user) ? null : ensureUser(req, res);
  if (u) C.setBand(u, c, band);
  res.redirect(303, `/courses/${c.slug}`);
});

function loadStep(req, res) {
  const c = C.getCourse(req.params.slug);
  const step = c && STEP.test(req.params.step) ? C.getStep(c, req.params.step) : null;
  if (!step) { notFound(req, res); return null; }
  return { c, step };
}
const seedOf = (u, try_ = 0) => `${u ? u.id : 'anon'}:${try_}`;

router.get('/courses/:slug/:step', (req, res) => {
  const x = loadStep(req, res); if (!x) return;
  const { c, step } = x;
  if (isGrownup(req.user)) return res.redirect(302, `/courses/${c.slug}`);
  if (req.headers['sec-fetch-mode'] === 'navigate') ensureUser(req, res);
  const u = req.user;
  const s = C.stateOf(u, c, step.key);
  // A locked step goes to the course map (staff and the admin may look at any step).
  if (!s.open && !preview(u)) return res.redirect(302, `/courses/${c.slug}#step-${step.key}`);
  const all = C.steps(c, step.band);
  // The result of a check sent without the page script (?r=<score>).
  const r = /^[0-3]$/.test(String(req.query.r || '')) && !s.checked ? +req.query.r : null;
  const result = r === null ? null : { score: r, passed: r >= C.PASS, results: lastWrong(req, step) };
  page(req, res, { title: `${step.title} · ${req.t(`${c.key}.title`)}`, active: 'home', mid: true,
    body: stepPage({ course: c, s, total: all.length, next: all[step.index + 1] || null, seed: seedOf(u), result, signedIn: !!u }), scripts: ['/js/course.js'] });
});
/** The wrong answers of a check sent without the script come back in the query (?w=<id>,<id>), as ids only. */
const lastWrong = (req, step) => String(req.query.w || '').split(',').filter(id => step.check.includes(id)).map(id => ({ id, ...C.answerOne(step, id, null) }));

// ------------------------------------------------------------------------------------------------- APIs
const api = [rateLimit('course', 120, 60e3)];
function apiStep(req, res) {
  const c = C.getCourse(req.params.slug);
  const step = c && STEP.test(req.params.step) ? C.getStep(c, req.params.step) : null;
  if (!step) { res.status(404).json({ error: req.t('errors.api.notFound') }); return null; }
  const u = req.user;
  if (!u || isGrownup(u)) { res.status(401).json({ error: req.t('errors.api.signInFirst') }); return null; }
  const s = C.stateOf(u, c, step.key);
  if (!s.open) { res.status(403).json({ error: req.t('errors.api.notFound') }); return null; }
  return { c, step, u, s };
}
/** The slides were read. */
router.post('/api/courses/:slug/:step/read', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  C.markRead(x.u, x.c, x.step);
  res.json({ ok: true });
});
/** One answer, graded: right or not, and the right answer (only now, after the player answered). */
router.post('/api/courses/:slug/:step/answer', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  const b = req.body || {};
  const r = C.answerOne(x.step, String(b.item || ''), Number.isInteger(b.choice) ? b.choice : null);
  if (!r) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json(r);
});
/** The whole check ({ answers: { id: choice } }), graded again and recorded. A pass opens the game module. */
router.post('/api/courses/:slug/:step/check', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  const g = C.grade(x.step, (req.body || {}).answers);
  C.recordCheck(x.u, x.c, x.step, g);
  const s = C.stateOf(x.u, x.c, x.step.key);
  res.json({ score: g.score, total: g.results.length, passed: g.passed, results: g.results, play: s.checked ? C.playHref(x.c, x.step) : null, html: s.checked ? String(afterHtml(x.c, x.step, s)) : '' });
});
/** The game module was finished: the play page posts this when the game itself reports its assigned chapter
 *  complete (brb:gameover, won — public/js/play.js). Opening the module only starts it (played_at, set when /play
 *  loads), so this refuses a player who never entered the game from this step, and a step whose check is not
 *  passed: a bare call completes nothing. Steps without a game finish at their check, never here. */
router.post('/api/courses/:slug/:step/complete', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  if (!x.step.game) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  if (!x.s.checked || !x.s.played) return res.status(409).json({ error: req.t('errors.api.badRequest') });
  C.markCompleted(x.u, x.c, x.step);
  res.json({ ok: true, complete: true });
});
// The same check as a plain form (no page script): back to the step with the score.
router.post('/courses/:slug/:step/check', rateLimit('course', 120, 60e3), form, (req, res) => {
  const c = C.getCourse(req.params.slug);
  const step = c && STEP.test(req.params.step) ? C.getStep(c, req.params.step) : null;
  if (!step) return notFound(req, res);
  const u = req.user; const s = u && C.stateOf(u, c, step.key);
  if (!s || !s.open || isGrownup(u)) return res.redirect(303, `/courses/${c.slug}`);
  const g = C.grade(step, req.body || {});
  C.recordCheck(u, c, step, g);
  const wrong = g.results.filter(r => !r.right).map(r => r.id).join(',');
  res.redirect(303, `/courses/${c.slug}/${step.key}?r=${g.score}${wrong && !g.passed ? `&w=${wrong}` : ''}#${g.passed ? 'play' : 'check'}`);
});

function afterHtml(c, step, s) {
  const all = C.steps(c, step.band);
  return afterSection(current().t, c, step, s, all[step.index + 1] || null);
}
