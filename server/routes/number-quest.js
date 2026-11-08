// Tally's Sorting Game — Number Quest placement (spec §4; services/number-quest-placement.js).
// The child's page (/number-quest/sorting-game) and its JSON APIs, the grown-up Starting Point note
// (/number-quest/starting-point, optionally ?child=<id> for a linked child or a school student), the
// override APIs, and the unit test-out APIs ("Show Tally you know this", §4.6). Grading is on the server:
// an item's key is regenerated from its template + seed when the answer arrives, never sent to the page
// (the courses.js idiom). POSTs are same-origin only (csrfCheck in app.js).
import express, { Router } from 'express';
import { page, notFound } from '../views/layout.js';
import { createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { isStaff } from '../services/schools.js';
import * as F from '../services/family.js';
import { q } from '../db.js';
import * as P from '../services/number-quest-placement.js';
import * as NQ from '../services/number-quest-progress.js';
import * as C from '../services/courses.js';
import * as S from '../services/schools.js';
import { sortingGamePage, startingPointPage, CSS } from '../views/number-quest-placement.js';
import * as tts from '../services/tts.js';
import { mapAndNotes, placementSection } from '../views/number-quest-teacher.js';
import { html } from '../views/html.js';
import * as V from '../views/cs-quest.js';
import { crewArt } from '../views/components.js';
import { el, lp, faqBlock, launchGame } from './teachers.js';
import * as seo from '../seo.js';

export const router = Router();
const form = express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 });

/** Like the course pages: a visitor without a session becomes a guest so their placement saves. */
function ensureUser(req, res) {
  if (req.user) return req.user;
  if (seo.isBot(req.headers['user-agent']) || !allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return null;
  const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  return guest;
}
const userOf = id => q.get('SELECT id, username, display_name FROM users WHERE id=?', String(id || '')) || null;

/** May this actor read and manage this student's placement? A platform admin; school staff who share a
 *  school with the student; or a grown-up whose family has the child linked. */
export function canManagePlacement(actor, studentId) {
  if (!actor || !studentId) return false;
  if (actor.role === 'admin') return true;
  if (isStaff(actor) && q.get(`SELECT 1 FROM school_members a JOIN school_members b ON a.school_id=b.school_id
      WHERE a.user_id=? AND b.user_id=? AND a.status='active' AND b.status='active' AND a.role!='student'`, actor.id, studentId)) return true;
  if (isGrownup(actor)) {
    const fam = F.familyOfOwner(actor.id);
    if (fam && F.childrenOf(fam.id).some(c => c.child_id === studentId && c.status === 'linked')) return true;
  }
  return false;
}
/** The student a note/override request is about: ?child= (or body child) for a manager, else the caller. */
function targetOf(req) {
  const want = String((req.query && req.query.child) || (req.body && req.body.child) || '');
  if (!want || want === (req.user && req.user.id)) return { student: req.user, self: true };
  const student = userOf(want);
  return student && canManagePlacement(req.user, student.id) ? { student, self: false } : { student: null, self: false };
}

// ------------------------------------------------------------------------------------------------- the game
router.get('/number-quest/sorting-game', (req, res) => {
  if (isGrownup(req.user)) return notFound(req, res);
  if (req.headers['sec-fetch-mode'] === 'navigate') ensureUser(req, res);
  const placement = P.getPlacement(req.user);
  page(req, res, { title: "Tally's Sorting Game · Number Quest", active: 'home', head: CSS,
    body: sortingGamePage({ placement, ttsLangs: tts.onLocales() }), scripts: ['/js/number-quest-placement.js'] });
});

const api = [rateLimit('nq-placement', 120, 60e3)];
const needUser = (req, res) => {
  const u = req.user || ensureUser(req, res);
  if (!u || isGrownup(u)) { res.status(401).json({ error: req.t('errors.api.signInFirst') }); return null; }
  return u;
};

router.post('/api/number-quest/placement/start', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const out = P.startRun(u, { grade: (req.body || {}).grade, kind: 'placement' });
  if (!out) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  if (out.disabled) return res.status(409).json({ error: 'disabled', placement: out.placement });
  res.json({ runId: out.runId, current: out.current });
});
router.post('/api/number-quest/placement/begin', ...api, form, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const p = P.placeAtBeginning(u, (req.body || {}).grade);
  res.json({ placement: p, workshop: P.nodeInfo(p.startNode).workshop });
});
router.post('/api/number-quest/placement/answer', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const out = P.answerRun(u, String((req.body || {}).runId || ''), (req.body || {}).answer || {});
  if (!out) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json(out);
});
router.post('/api/number-quest/placement/finish', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const out = P.finishEarly(u, String((req.body || {}).runId || ''));
  if (!out) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json(out);
});
router.post('/api/number-quest/placement/confirm-retake', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const p = P.confirmRetake(u, String((req.body || {}).runId || ''));
  if (!p) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json({ placement: p });
});
router.get('/api/number-quest/placement', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const p = P.getPlacement(u);
  res.json({ placement: p, testedOut: P.testedOutUnits(u), softLand: p && p.softLandNode ? { node: p.softLandNode, workshop: P.nodeInfo(p.softLandNode).workshop } : null });
});
/** A check result at the placed start (the soft-landing rule, §4.4); the course step API calls the same
 *  service function, this endpoint keeps the rule usable and testable on its own. */
router.post('/api/number-quest/placement/check-result', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const p = P.recordStartCheck(u, String((req.body || {}).step || ''), !!(req.body || {}).passed);
  res.json({ placement: p, softLand: p && p.softLandNode ? { node: p.softLandNode, workshop: P.nodeInfo(p.softLandNode).workshop } : null });
});

// ------------------------------------------------------------------------------------------------- test-out (§4.6)
router.post('/api/number-quest/testout/start', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const unit = Number((req.body || {}).unit);
  if (![1, 2, 3, 4].includes(unit)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const out = P.startRun(u, { kind: 'testout', unit });
  if (!out || !out.current) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json({ runId: out.runId, current: out.current });
});
router.post('/api/number-quest/testout/answer', ...api, (req, res) => {
  const u = needUser(req, res); if (!u) return;
  const out = P.answerRun(u, String((req.body || {}).runId || ''), (req.body || {}).answer || {});
  if (!out) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json(out);
});

// ------------------------------------------------------------------------------------------------- the note + overrides
router.get('/number-quest/starting-point', (req, res) => {
  if (!req.user || req.user.is_guest) return notFound(req, res);
  const { student, self } = targetOf(req);
  if (!student || self) return notFound(req, res); // the note is a grown-up view, never the child's
  const placement = P.getPlacement(student);
  const note = placement && placement.rungs && Object.keys(placement.rungs).length ? rebuildNote(placement) : null;
  page(req, res, { title: 'Starting Point note · Number Quest', active: 'home', head: CSS,
    body: startingPointPage({ child: student, placement, note, canManage: true }) });
});
/** The note's words are rebuilt from the stored rungs with the same plain-words builder the game used. */
function rebuildNote(placement) {
  const placed = Object.fromEntries(Object.entries(placement.rungs).map(([k, v]) => [k, { rung: v, confirmed: placement.source !== 'beginning' }]));
  const lines = Object.entries(placed).map(([k, v]) => P.strandNoteWords(P.STRAND_LABELS[k], v, placement.rungs));
  const { launchpadGap, finaleDoor } = P.crosswalk(placement.rungs);
  const info = P.nodeInfo(placement.startNode);
  return { lines, placedUnit: finaleDoor
      ? `Past Unit 7: every strand pointed beyond the Explorer street's workshops. The start is the Vault of Measures, the finale at the end of Unit 7 (The Fairground), and every workshop stays open for games, laps and test-out.`
      : `Unit ${info.unit}: ${info.workshop}`,
    launchpadLine: launchpadGap ? 'One or more strands landed below the Explorer starting line; the Launchpad gardens are still being built, so this learner starts at Welcome to the Numberworks for now.' : null, partial: null };
}
// ------------------------------------------------------------------------------------------------- the daily goal
/** The student's own daily-goal choice (1, 2 or 3 activities, progress service §6.1) from the path home's
 *  picker: a plain form post, answered with a redirect back to the street. Missing a goal stores and costs
 *  nothing — this only ever sets the target the student picked. */
router.post('/api/number-quest/daily-goal', ...api, form, (req, res) => {
  const u = req.user || ensureUser(req, res);
  const back = String((req.body && req.body.back) || '') === '/courses/number-quest' ? '/courses/number-quest' : '/courses/number-quest';
  if (u && !isGrownup(u)) NQ.setDailyGoal(u, NQ.COURSE_SLUG, Number((req.body || {}).goal));
  res.redirect(303, back);
});

// ------------------------------------------------------------------------------------------------- the teacher page
/** /teachers/number-quest: the public program page (Cyber Defenders' page is the model): overview, the
 *  six games, the units and steps, the locked CCSS-M map for Explorer Units 1-7 plus the finale, the
 *  teacher notes and the printed pack (?print=1). Anyone may read it; the course stands alone. */
router.get('/teachers/number-quest', (req, res) => {
  const t = req.t, cat = C.numberQuestCatalogue();
  const K = 'teachers.nq';
  if (req.query.print === '1') {
    const body = html`<div class="printdoc csq-print"><h1 lang="en" dir="ltr">🔢 Number Quest — ${t(`${K}.print.h`)}</h1>
      <p class="muted" lang="en" dir="ltr">${cat.program.standards}</p>${mapAndNotes(req, cat, el)}</div>`;
    return page(req, res, { title: `${t(`${K}.title`)} — ${t(`${K}.print.h`)}`, body, head: V.CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
  }
  const staff = !!req.user && !req.user.is_guest && S.isSchoolStaff(req.user);
  const crew = [
    { slug: 'brain-board', key: 'brainBoard', emoji: '🌟', title: 'Brain Board' },
    { slug: 'sum-racer', key: 'sumRacer', emoji: '🏎️', title: 'Sum Racer' },
    { slug: 'quest-race', key: 'questRace', emoji: '🏝️', title: 'Quest Race' },
    { slug: 'fraction-factory', key: 'fractionFactory', emoji: '🧁', title: 'Fraction Factory' },
    { slug: 'data-detective', key: 'dataDetective', emoji: '🔎', title: 'Data Detective' },
  ].map(c => ({ ...c, live: launchGame(c.slug) }));
  const unitItem = u => html`<li class="panel"><b lang="en" dir="ltr">${u.n === 0 ? u.title : `${t('cs.unit.n', { n: u.n })} · ${u.title}`}</b>${u.stamp ? html` <span class="chip-s">🏅 ${t(`${K}.units.stamp`, { stamp: u.stamp })}</span>` : ''}
    <ol class="csq-lessons" lang="en" dir="ltr">${(u.steps || []).map(s => html`<li>${s.n} ${(s.titles || {}).explorer || s.n}</li>`)}</ol></li>`;
  const faqPairs = [1, 2, 3, 4, 5].map(n => [`${K}.faq.q${n}`, `${K}.faq.a${n}`]).filter(([qk, ak]) => t.own(qk) && t.own(ak));
  const faq = faqBlock(req, faqPairs, `${K}.faq.h`, { teachers: lp(req, '/teachers') });
  const path = '/teachers/number-quest';
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t(`${K}.crumb`), path]];
  const codes = [...new Set(cat.units.flatMap(u => (u.steps || []).flatMap(s => { const st = (s.standards || {}).explorer || {}; return [...(st.primary || []), ...(st.also || [])]; })))];
  const body = html`<div class="lp">
  <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
  <section class="lp-hero" aria-labelledby="lp-h1">
    ${el(t, 'p', `${K}.kicker`, {}, ' class="lp-kicker"')}
    ${el(t, 'h1', `${K}.h1`, {}, ' id="lp-h1"')}
    ${el(t, 'p', `${K}.lead`, {}, ' class="lead"')}
    <ul class="lp-badges">${['steps', 'units', 'games', 'minutes', 'free'].map(x => html`<li>${el(t, 'span', `${K}.badges.${x}`)}</li>`)}</ul>
    <div class="row lp-cta"><a class="btn btn-primary btn-big" href="${lp(req, '/courses/number-quest')}">🔢 ${t(`${K}.cta.open`)}</a><a class="btn btn-big" href="${path}?print=1" target="_blank" rel="noopener">🖨️ ${t(`${K}.print.button`)}</a></div>
  </section>
  <section class="lp-sec" id="promise" aria-labelledby="promise-h">${el(t, 'h2', `${K}.promise.h`, {}, ' id="promise-h"')}
    <ul class="lp-list">${[1, 2, 3, 4, 5, 6].map(n => el(t, 'li', `${K}.promise.li${n}`))}</ul></section>
  ${placementSection()}
  <section class="lp-sec" id="crew" aria-labelledby="crew-h">${el(t, 'h2', `${K}.crew.h`, {}, ' id="crew-h"')}${el(t, 'p', `${K}.crew.p`)}
    <ul class="csq-crew">${crew.map(c => html`<li class="panel">${crewArt(c.slug, c.emoji)}<h3 lang="en" dir="ltr">${c.title}</h3>
      ${el(t, 'p', `${K}.crew.${c.key}`, {}, ' class="small"')}
      <div class="row">${c.live ? html`<a class="btn btn-primary" href="/play/${c.slug}" rel="nofollow">▶ ${t(`${K}.crew.try`)}</a>` : html`<a class="btn" href="${lp(req, '/courses/number-quest')}">🔢 ${t(`${K}.crew.inCourse`)}</a>`}</div></li>`)}</ul></section>
  <section class="lp-sec" id="units" aria-labelledby="units-h">${el(t, 'h2', `${K}.units.h`, {}, ' id="units-h"')}${el(t, 'p', `${K}.units.p`)}
    <ul class="csq-public-units">${cat.units.map(unitItem)}</ul></section>
  ${mapAndNotes(req, cat, el)}
  <div class="lp-cols">
    <section class="panel" id="safety" aria-labelledby="safety-h">${el(t, 'h2', `${K}.safety.h`, {}, ' id="safety-h"')}
      <ul class="lp-list">${[1, 2, 3, 4].map(n => el(t, 'li', `${K}.safety.li${n}`))}</ul></section>
    <section class="panel" id="print" aria-labelledby="print-h">${el(t, 'h2', `${K}.print.h`, {}, ' id="print-h"')}
      ${el(t, 'p', `${K}.print.p`)}
      <p><a class="btn" href="${path}?print=1" target="_blank" rel="noopener">🖨️ ${t(`${K}.print.button`)}</a></p></section>
  </div>
  ${faq.markup}
  <section class="panel lp-start" id="start" aria-labelledby="start-h">${el(t, 'h2', `${K}.start.h`, {}, ' id="start-h"')}${el(t, 'p', staff ? `${K}.start.staff` : `${K}.start.p`)}
    <div class="row"><a class="btn btn-primary btn-big" href="${lp(req, '/courses/number-quest')}">🔢 ${t(`${K}.cta.open`)}</a></div></section>
  </div>`;
  const course = {
    '@type': ['Course', 'LearningResource'], '@id': seo.abs(req, `${path}#course`), url: seo.abs(req, path), name: 'Number Quest', description: t(`${K}.description`),
    provider: { '@id': seo.orgId(req) }, educationalLevel: 'Grades 3-5', inLanguage: 'en', isAccessibleForFree: true, learningResourceType: 'Lesson plan',
    teaches: [...new Set(cat.units.flatMap(u => (u.steps || []).map(s => (s.titles || {}).explorer)))], audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' },
    educationalAlignment: codes.map(code => ({ '@type': 'AlignmentObject', alignmentType: 'teaches', educationalFramework: 'Common Core State Standards for Mathematics (CCSS-M, 2010)', targetName: code })),
  };
  page(req, res, {
    title: t(`${K}.title`), description: t(`${K}.description`), body, bodyClass: 'lp-page', head: V.CSS,
    seo: {
      index: true, path, langs: seo.langsWithKey(`${K}.h1`), image: '/og/teachers.jpg', imageAlt: t(`${K}.title`),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${K}.title`), description: t(`${K}.description`), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' }, mainEntity: { '@id': course['@id'] } },
        course, faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

router.post('/api/number-quest/placement/override', ...api, (req, res) => {
  if (!req.user || req.user.is_guest) return res.status(401).json({ error: req.t('errors.api.signInFirst') });
  const { student, self } = targetOf(req);
  if (!student || self) return res.status(403).json({ error: req.t('errors.api.notFound') });
  const b = req.body || {};
  let p = P.getPlacement(student);
  if (typeof b.disabled === 'boolean') p = P.setPlacementDisabled(student, b.disabled);
  if (typeof b.node === 'string') p = P.overrideStartNode(student, b.node) || p;
  if (!p) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json({ placement: p });
});
