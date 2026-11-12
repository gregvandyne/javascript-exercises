// Courses (services/courses.js, views/courses.js): the course page (band picker, then the course map), a course step
// (slides, quick check, game module) and the step's small JSON APIs. Grading is on the server: the page never has an
// answer before the player has given theirs. POSTs are same-origin only (csrfCheck in app.js).
import express, { Router } from 'express';
import { page, notFound } from '../views/layout.js';
import * as C from '../services/courses.js';
// Number Quest's progress layer (Tally Marks, daily goal, laps) registers its school-account merge hook on
// import; the course map and step APIs read it from here in the Number Quest stage that wires them up.
import * as NQ from '../services/number-quest-progress.js';
import * as NQP from '../services/number-quest-placement.js';
import * as NQT from '../services/number-quest-tiers.js';
import { coursePage, stepPage, afterSection } from '../views/courses.js';
import { pathPage } from '../views/number-quest-path.js';
import { CSS as NQ_CSS } from '../views/number-quest-placement.js';
import { createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { isStaff } from '../services/schools.js';
import * as seo from '../seo.js';
import { current } from '../i18n/index.js';

export const router = Router();
const form = express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 });
const STEP = C.STEP_KEY;

/** A visitor without a session becomes a guest (like one tap on Play), so their course progress saves. Browsers only. */
function ensureUser(req, res) {
  if (req.user) return req.user;
  if (seo.isBot(req.headers['user-agent']) || !allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return null;
  const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  return guest;
}
/** School staff and the platform admin can open any step (to preview it); everyone else only open steps. */
const preview = u => !!u && (u.role === 'admin' || isStaff(u));

/** The step a locked redirect came from (?locked=<step key>): the map says which step to finish first. */
const lockedKey = req => (STEP.test(String(req.query.locked || '')) ? String(req.query.locked) : '');

router.get('/courses', (req, res) => res.redirect(302, `/courses/${C.COURSES[0].slug}`));
router.get('/courses/:slug', (req, res) => {
  const c = C.getCourse(req.params.slug);
  if (!c) return notFound(req, res);
  const t = req.t, u = req.user;
  // Number Quest's course page is its path home (the Numberworks street, views/number-quest-path.js): the
  // winding path with Tally Marks, the daily goal, lap rings and the placement start, over the same states
  // the generic map reads. A visitor without a session becomes a guest (as below, on navigation) so their
  // street, marks and goal are theirs from the first step.
  if (c.slug === NQ.COURSE_SLUG) {
    if (req.headers['sec-fetch-mode'] === 'navigate' && !isGrownup(u)) ensureUser(req, res);
    const user = req.user;
    honourPendingWins(user); // a win earned as a guest lands before the street is drawn
    const placement = NQP.getPlacement(user);
    // The street shown: the learner's own (their band); with no band yet, the street Tally placed them
    // on; else Explorer. ?street=<tier> looks at another street without moving the learner (a grown-up
    // reading the course has no band to move). Only streets this viewer may see count: the open ones,
    // plus a street still being built for the platform admin.
    const streets = C.bandsFor(c, user);
    const own = C.getBand(user, c);
    const bandSet = !!own;
    const placedTier = placement && placement.startNode ? (NQT.parseKey(placement.startNode) || {}).tier : null;
    const asked = String(req.query.street || '');
    const street = streets.includes(asked) ? asked : own || (streets.includes(placedTier) ? placedTier : C.defaultBand(c, user));
    const ov = C.overview(user, c, street);
    // "You are here" is the placed start while it is still undone: the earlier workshops are open
    // for laps and test-out, but the way forward begins at Tally's workshop, not at step one.
    if (placement && placement.startNode) {
      const startState = ov.list.find(s => s.step.key === placement.startNode);
      if (startState && !startState.complete) ov.next = startState;
    }
    return page(req, res, { title: t(`${c.key}.title`), active: 'learn', head: NQ_CSS,
      body: pathPage({ course: c, ov, units: NQT.unitsOf(street), marks: NQ.totalMarks(user, c),
        street, streets: streets.map(k => ({ key: k, name: NQT.tierName(k), grades: (NQT.tierInfo(k) || {}).grades || '', district: (NQT.tierInfo(k) || {}).district || '', building: !NQT.isOpen(k) })),
        daily: NQ.dailyStatus(user, c), laps: Object.fromEntries(NQ.lapsForTier(user, c, street).map(l => [l.unit, l])),
        placement: placement && placement.startNode ? { ...placement, workshop: NQP.nodeInfo(placement.startNode).workshop } : placement,
        testedOut: NQP.testedOutUnits(user, street), canPick: !isGrownup(user), bandSet, locked: lockedKey(req),
        hasProgress: ov.done > 0 || !!(placement && placement.startNode) }),
      description: t(`${c.key}.sub`), seo: { index: true, path: `/courses/${c.slug}`, langs: seo.langsWithKey(`${c.key}.about`) } });
  }
  honourPendingWins(u); // a win earned as a guest lands before the map is drawn
  page(req, res, { title: t(`${c.key}.title`), active: 'learn', body: coursePage({ course: c, games: C.courseGames(u, c), ov: C.overview(u, c), canPick: !isGrownup(u), preview: preview(u), locked: lockedKey(req) }),
    description: t(`${c.key}.sub`), seo: { index: true, path: `/courses/${c.slug}`, langs: seo.langsWithKey(`${c.key}.about`) } });
});

// The band: picked once from the two cards, switched later from the course map. A plain form post (no script needed).
router.post('/courses/:slug/band', rateLimit('course-band', 30, 60e3), form, (req, res) => {
  const c = C.getCourse(req.params.slug);
  if (!c) return notFound(req, res);
  const band = String((req.body && req.body.band) || '');
  // A band this viewer may not pick is refused before a guest is made for it (a visitor with no session
  // may pick an open band only: a Number Quest street still being built is the platform admin's alone).
  if (!C.bandVisible(req.user || null, c, band)) return res.redirect(303, `/courses/${c.slug}`);
  const u = isGrownup(req.user) ? null : ensureUser(req, res);
  if (u) C.setBand(u, c, band);
  res.redirect(303, `/courses/${c.slug}`);
});

function loadStep(req, res) {
  const c = C.getCourse(req.params.slug);
  // stepFor, not getStep: a step of a band this viewer may not see (a Number Quest street still being
  // built) is not found, exactly as a step that does not exist.
  const step = c && STEP.test(req.params.step) ? C.stepFor(req.user, c, req.params.step) : null;
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
  honourPendingWins(u);
  const s = C.stateOf(u, c, step.key);
  // A locked step goes to the course map (staff and the admin may look at any step).
  if (!s.open && !preview(u)) return res.redirect(302, `/courses/${c.slug}?locked=${step.key}#step-${step.key}`);
  const all = C.steps(c, step.band);
  // The result of a check sent without the page script (?r=<score>).
  const r = /^[0-3]$/.test(String(req.query.r || '')) && !s.checked ? +req.query.r : null;
  const result = r === null ? null : { score: r, passed: r >= C.PASS, results: lastWrong(req, step) };
  page(req, res, { title: `${step.title} · ${req.t(`${c.key}.title`)}`, active: 'learn', mid: true,
    head: c.slug === NQ.COURSE_SLUG ? NQ_CSS : '',
    body: stepPage({ course: c, s, total: all.length, next: all[step.index + 1] || null, seed: seedOf(u), result, signedIn: !!u, slides: C.slidesFor(u, c, step) }), scripts: ['/js/course.js'] });
});
/** The wrong answers of a check sent without the script come back in the query (?w=<id>,<id>), as ids only. */
const lastWrong = (req, step) => String(req.query.w || '').split(',').filter(id => step.check.includes(id)).map(id => ({ id, ...C.answerOne(step, id, null) }));

// ------------------------------------------------------------------------------------------------- APIs
const api = [rateLimit('course', 120, 60e3)];
function apiStep(req, res) {
  const c = C.getCourse(req.params.slug);
  const step = c && STEP.test(req.params.step) ? C.stepFor(req.user, c, req.params.step) : null;
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
// ------------------------------------------------------------------------------------------------- Number Quest moments
// The Duolingo-lite layer inside a lesson (spec §6.1/§6.2): for Number Quest only, the step APIs carry an
// `nq` payload the page script turns into quick, never-blocking moments — Tally's reaction to an answer
// (a wrong one names the bank item's misconception tag, kindly; the Jumble made the mix-up, never the
// child), Tally Marks when a check passes or a mission completes, the daily goal completing, and a unit's
// Lap 1 landing when its last step finishes. No hearts, nothing spent, nothing ranked: the progress
// service's rules, surfaced. Other courses' responses are untouched.
const TALLY_PRAISE = ['Tally purrs: exactly right.', 'Tally nods: that is the way.', 'Tally taps her paw: counted and correct.', 'Tally smiles: you saw the pattern.', 'Tally does a little spin: yes!', 'Tally writes it in her book: right.', 'Tally\u2019s tail flicks happily: that is it.', 'Tally headbutts the page, gently: correct.'];
/** The frames Tally's wrong-answer line puts a misconception phrase in. A phrase is a kid-readable verb
 *  phrase about the mix-up ("added the sides instead of multiplying"), so it reads after "the Jumble ...". */
const JUMBLE_FRAMES = [
  m => `The Jumble ${m}! Tally says: let's look again, slowly.`,
  m => `The Jumble grins: that is its favorite mix-up. It ${m}. Tally says: read what the question really asks.`,
  m => `Oops, the Jumble ${m}. Tally says: try it step by step.`,
];
const TALLY_PLAIN = ['Tally says: have another look, slowly.', 'Tally says: that one is tricky. Read the question once more.', 'Tally says: mix-ups help us learn. Look at the right answer.'];
/** Does a misconception tag read as a kid sentence that fits the frames? A short lowercase verb phrase of
 *  plain words ("added the sides instead of multiplying"); not a raw tag ("place-from-other-course",
 *  "off_by_one", "units?"), not "correct", not a full sentence of its own. */
export function kidPhrase(tag) {
  const m = String(tag || '').trim();
  if (!m || m === 'correct' || m.length > 90 || m.length < 8) return '';
  if (!/^[a-z]/.test(m) || !/[a-z0-9)]$/i.test(m) || /[_<>{}\[\]]|--|\b[a-z]+-[a-z]+-[a-z]+\b/.test(m)) return '';
  const words = m.split(/\s+/);
  if (words.length < 2 || words.length > 14) return '';
  // The frames need a past-tense verb first ("added", "forgot", "counted", "took", "read", "mixed").
  return /^([a-z]+ed|forgot|did|took|read|put|left|made|got|thought|swapped|split|wrote|drew|chose|gave|kept|lost|saw|went|ran|said|told|began|broke|threw|stuck|spun|found|mixed|cut|never|let|shrank|sank|hid|bent|flipped|skipped|dropped|stopped|counted|used)$/.test(words[0]) ? m : '';
}
/** Tally's line for one graded answer, from the item's own misconception tags (banks carry one per choice).
 *  A wrong answer whose tag reads as a kid phrase gets the Jumble's line, in one of a few frames (picked by
 *  the item and the choice, so the same miss reads the same way and different misses vary); any other wrong
 *  answer gets Tally's plain line. */
function nqReaction(step, itemId, choice, right) {
  const h = [...String(itemId)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  if (right) return { who: 'tally', text: TALLY_PRAISE[h % TALLY_PRAISE.length] };
  const it = C.item(itemId);
  const misc = it && Array.isArray(it.misconceptions) && Number.isInteger(choice) ? kidPhrase(it.misconceptions[choice]) : '';
  const k = h + (Number.isInteger(choice) ? choice : 0);
  if (!misc) return { who: 'tally', text: TALLY_PLAIN[k % TALLY_PLAIN.length] };
  return { who: 'jumble', text: JUMBLE_FRAMES[k % JUMBLE_FRAMES.length](misc) };
}
/** Honour a signed-in student's pending wins (services/courses.js, Greg's guest addendum): wins earned
 *  as a guest and kept until sign-in. Each applied win also earns what a live completion earns — the
 *  check's and the mission's Tally Marks, and any lap it lands — so the sign-up step costs the student
 *  nothing. Called wherever the student meets their course state; a no-op for guests and for students
 *  with nothing pending. */
function honourPendingWins(u) {
  // A grown-up has no course progress (they read the course pages Home links to: routes/family.js): a win stashed by the
  // guest they signed in from stays unapplied rather than becoming a grown-up's progress.
  if (!u || u.is_guest || isGrownup(u)) return;
  for (const w of C.applyPendingWins(u)) {
    const c = C.getCourse(w.course); const step = c && C.getStep(c, w.step);
    if (!step || !NQ.isNumberQuest(c)) continue;
    NQ.awardCheckPassed(u, c, step.key);
    if (w.via === 'win') NQ.awardMissionCompleted(u, c, step.key); // a check-honoured step has no mission to pay
    nqLapSync(u, c, step);
  }
}
/** If this step's unit is now fully done and its Lap 1 is unrecorded, record it (the unit as written is
 *  Lap 1, spec §6.3) and return the celebration payload; laps 2 and 3 are walked from the path, not here. */
function nqLapSync(u, c, step) {
  if (!NQ.isNumberQuest(c) || !Number.isInteger(step.unit) || step.unit < 1) return null;
  const unitSteps = C.steps(c, step.band).filter(s => s.unit === step.unit);
  const states = new Map(C.states(u, c, step.band).map(s => [s.step.key, s]));
  if (!unitSteps.length || !unitSteps.every(s => states.get(s.key) && states.get(s.key).complete)) return null;
  const before = NQ.lapState(u, c, step.band, step.unit); // laps are per tier: Launchpad Unit 1 is not Explorer Unit 1
  if (!before || before.completed.includes(1)) return null;
  const out = NQ.completeLap(u, c, step.band, step.unit, 1);
  return out.recorded ? { unit: step.unit, lap: 1, marks: out.marks } : null;
}
/** The moment payload after a check or a mission: what was awarded, the day against the goal (justMet is
 *  true only on the award that reaches the goal), and a lap that landed with this step, if one did. */
function nqMoments(u, c, step, awardResult) {
  const daily = NQ.dailyStatus(u, c);
  return { marks: awardResult && awardResult.awarded ? awardResult : null,
    dailyGoal: daily ? { done: daily.done, goal: daily.goal, met: daily.met, justMet: daily.met && daily.done === daily.goal } : null,
    lap: nqLapSync(u, c, step) };
}

/** One answer, graded: right or not, and the right answer (only now, after the player answered). */
router.post('/api/courses/:slug/:step/answer', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  const b = req.body || {};
  const r = C.answerOne(x.step, String(b.item || ''), Number.isInteger(b.choice) ? b.choice : null);
  if (!r) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  if (NQ.isNumberQuest(x.c)) r.nq = { reaction: nqReaction(x.step, String(b.item || ''), b.choice, r.right) };
  res.json(r);
});
/** The whole check ({ answers: { id: choice } }), graded again and recorded. A pass opens the game module.
 *  A guest's pass is recorded only as a pending fact (services/courses.js): the response is built from
 *  the grade itself, so the sitting flows on to the module exactly as a recorded pass would, but
 *  nothing is stored — and for a step with no game, whose pass IS the completion, the response carries
 *  the sign-in prompt (needAccount) instead of a completion. */
router.post('/api/courses/:slug/:step/check', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  honourPendingWins(x.u);
  const g = C.grade(x.step, (req.body || {}).answers);
  C.recordCheck(x.u, x.c, x.step, g);
  const s = C.stateOf(x.u, x.c, x.step.key);
  const guest = C.isGuestUser(x.u);
  const checked = guest ? g.passed : s.checked;
  const shown = guest && g.passed ? { ...s, read: true, checked: true, complete: !x.step.game, won: false } : s;
  const out = { score: g.score, total: g.results.length, passed: g.passed, results: g.results, play: checked ? C.playHref(x.c, x.step) : null, html: checked ? String(afterHtml(x.c, x.step, shown)) : '' };
  if (guest && g.passed && !x.step.game) out.needAccount = { signup: `/signup?next=${encodeURIComponent(`/courses/${x.c.slug}/${x.step.key}`)}` };
  if (NQ.isNumberQuest(x.c) && !guest) {
    // The soft-landing rule reads check results at the placed start (placement service §4.4), and a pass
    // earns its Tally Marks (for doing: any attempt count, awarded once per step).
    NQP.recordStartCheck(x.u, x.step.key, g.passed);
    out.nq = nqMoments(x.u, x.c, x.step, g.passed ? NQ.awardCheckPassed(x.u, x.c, x.step.key) : null);
  }
  res.json(out);
});
/** The game module was finished: the play page posts this when the game itself reports its assigned chapter
 *  complete (brb:gameover, won — public/js/play.js). Opening the module only starts it (played_at, set when /play
 *  loads), so this refuses a player who never entered the game from this step, and a step whose check is not
 *  passed: a bare call completes nothing. Steps without a game finish at their check, never here. */
router.post('/api/courses/:slug/:step/complete', ...api, (req, res) => {
  const x = apiStep(req, res); if (!x) return;
  if (!x.step.game) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  // Guests cannot complete a course (Greg's addendum, 2026-11-04): the win the game just reported is
  // kept as a pending fact, and the answer is the sign-in prompt — the win completes, marks and all,
  // the moment the student signs in, so a finished game is never lost to the sign-up step. The facts
  // demanded are the same ones a signed-in completion demands (check passed, module entered), read
  // from the guest's pending facts instead of recorded progress.
  if (C.isGuestUser(x.u)) {
    const facts = C.pendingFacts(x.u, x.c, x.step);
    if (!facts.check || !facts.played) return res.status(409).json({ error: req.t('errors.api.badRequest') });
    C.stashPendingFact(x.u, x.c, x.step, 'win');
    return res.status(403).json({ error: req.t('errors.api.needAccount'), needAccount: true, pendingWin: true,
      signup: `/signup?next=${encodeURIComponent(`/courses/${x.c.slug}/${x.step.key}`)}` });
  }
  honourPendingWins(x.u);
  const s = C.stateOf(x.u, x.c, x.step.key);
  if (!s.checked || !s.played) return res.status(409).json({ error: req.t('errors.api.badRequest') });
  C.markCompleted(x.u, x.c, x.step);
  const out = { ok: true, complete: true };
  if (NQ.isNumberQuest(x.c)) out.nq = nqMoments(x.u, x.c, x.step, NQ.awardMissionCompleted(x.u, x.c, x.step.key));
  res.json(out);
});
// The same check as a plain form (no page script): back to the step with the score.
router.post('/courses/:slug/:step/check', rateLimit('course', 120, 60e3), form, (req, res) => {
  const c = C.getCourse(req.params.slug);
  const step = c && STEP.test(req.params.step) ? C.stepFor(req.user, c, req.params.step) : null;
  if (!step) return notFound(req, res);
  const u = req.user; const s = u && C.stateOf(u, c, step.key);
  if (!s || !s.open || isGrownup(u)) return res.redirect(303, `/courses/${c.slug}`);
  const g = C.grade(step, req.body || {});
  C.recordCheck(u, c, step, g);
  // The plain-form flow earns the same Number Quest marks and lap as the scripted one (no moment can be
  // shown without the script; the path home shows the new totals when the student gets there).
  if (NQ.isNumberQuest(c)) {
    NQP.recordStartCheck(u, step.key, g.passed);
    if (g.passed) NQ.awardCheckPassed(u, c, step.key);
    nqLapSync(u, c, step);
  }
  const wrong = g.results.filter(r => !r.right).map(r => r.id).join(',');
  res.redirect(303, `/courses/${c.slug}/${step.key}?r=${g.score}${wrong && !g.passed ? `&w=${wrong}` : ''}#${g.passed ? 'play' : 'check'}`);
});

function afterHtml(c, step, s) {
  const all = C.steps(c, step.band);
  return afterSection(current().t, c, step, s, all[step.index + 1] || null);
}
