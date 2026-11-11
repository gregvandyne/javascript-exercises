// One sign-up (docs/decisions.md "One sign-up"). /signup first asks who is signing up, then one question per screen:
//   /signup                      Who's signing up? A kid, a parent or a teacher (each through /signup/for/<who>,
//                                which counts the choice: routes/auth.js)
//   /signup/kid                  a fun name and a password (POST /api/auth/signup, unchanged: no email, no Google)
//   /signup/kid/code             optional: a class code (POST /api/classes/join), or a family code to give a grown-up
//   /signup/parent               Sign up with Google, or a username and password (POST /api/grown-ups/signup), then
//                                "Add your kids" (/family/add, routes/family.js)
//   /signup/teacher              Sign up with Google, or a username and password (POST /api/onboarding/teacher)
//   /signup/teacher/school       optional: create your school (you are its admin at once), join it (a school admin's
//                                invite), or skip (your own classroom) (POST /api/onboarding/school)
//   /signup/teacher/classes      required: one or more classes, each with a name and a grade (POST /api/onboarding/classes).
//                                The first class saved starts the teacher's own 14-day Teacher plan trial straight
//                                through Stripe's API, no card (TP.autoStartTrial; docs/decisions.md "Automatic trial
//                                at sign-up"), unless their school covers them or has a seat for them
//   /signup/teacher/classroom    "Connect Google Classroom?" (the existing connect flow) or Skip, while Classroom is on
//   /signup/teacher/done         one line about the Teacher plan ("Your 14-day Teacher plan trial has started", "Your
//                                school covers your Teacher plan", "ask your school admin for a seat") and, with no
//                                email on file, an optional "Email for trial reminders"; else straight on to My classes
//                                (or the school's seat trial at /trial?seats=N)
// A trial started at /trial (signed out) comes along as ?trial=1 (and ?seats=N for a school's seat trial).
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { screen, choice } from '../views/onboarding.js';
import * as auth from '../auth.js';
import { q, audit, tx } from '../db.js';
import { tHtml } from '../i18n/index.js';
import * as F from '../services/family.js';
import * as S from '../services/schools.js';
import * as SR from '../services/school-requests.js';
import * as GC from '../services/gclassroom.js';
import { googleEnabled } from '../oidc.js';
import { rememberAddress, addressOf } from '../services/email.js';
import { allow, count, ipOf, rateLimit, SIGNUP } from '../services/ratelimit.js';
import { siteHost } from '../site.js';
import { googleNotice, signupToken } from './google.js';
import { wantedNext, homeFor } from './auth.js';
import { nextFor, chosenPlan, planName } from './family.js';
import * as TP from '../services/teacher-plan.js';
import { trialLineHtml } from '../views/trial-lines.js';

export const router = Router();
const b = req => req.body || {};
const G_LOGO = raw(`<svg class="gbtn-g" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`);
const errSpan = id => raw(`<span class="err" id="${id}-err" aria-live="polite"></span>`);
const formErr = raw('<p class="err form-err" aria-live="polite"></p>');
const enc = encodeURIComponent;

// ---------------------------------------------------------------- the trial, carried through the teacher's steps
/** ?trial=1 (and ?seats=N) from /trial: the steps keep it, and the last one goes on to /trial. */
export function trialOf(src = {}) {
  const trial = src.trial === '1' || src.trial === 1 || src.trial === true;
  const n = Number(src.seats);
  return trial ? { seats: Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null } : null;
}
const carry = tr => (tr ? `?trial=1${tr.seats ? `&seats=${tr.seats}` : ''}` : '');
const carryInputs = tr => (tr ? html`<input type="hidden" name="trial" value="1">${tr.seats ? html`<input type="hidden" name="seats" value="${tr.seats}">` : ''}` : '');
const teacherSteps = () => (GC.enabled() ? 4 : 3);

// ---------------------------------------------------------------- pieces
/** The "18 or older" box both ways in (Google and the password) need, at the top of the form. */
const adultBox = (t, key) => html`<div class="field ob-adult"><label class="checkline"><input type="checkbox" id="adult" name="adult" value="1"> <span>${t(key)}</span></label>${errSpan('adult')}</div>`;
/** "Sign up with Google" as the form's other submit button: the API checks the box, then sends them to Google. */
function googleWay(req) {
  if (!googleEnabled()) return '';
  const t = req.t;
  return html`<div class="gsign ob-google"><button class="gbtn" type="submit" name="via" value="google"><span>${G_LOGO}</span><span>${t('onboard.google')}</span></button>
    <p class="center small muted gsign-hint">${t('onboard.googleNote')}</p></div>
    <div class="divider">${t('auth.page.or')}</div>`;
}
/** Username, password and the password again (grown-ups and teachers: the staff length). */
function adultFields(req, minLength, hintKey) {
  const t = req.t;
  return html`<div class="field"><label for="username">${t('family.signup.signInName')}</label>
      <input class="input" id="username" name="username" dir="ltr" autocomplete="username" minlength="3" maxlength="16" autocapitalize="off" spellcheck="false" aria-describedby="username-hint">
      <span class="hint" id="username-hint">${t(hintKey)}</span>${errSpan('username')}</div>
    <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
      <span class="pw-row"><input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="new-password" minlength="${minLength}" maxlength="72" aria-describedby="password-hint">
      <button class="btn pw-toggle" type="button" data-pw-toggle="password" aria-controls="password" aria-pressed="false" data-show="${t('auth.page.showPassword')}" data-hide="${t('auth.page.hidePassword')}">👁️ <span>${t('auth.page.showPassword')}</span></button></span>
      <span class="hint" id="password-hint">${t('family.signup.passwordHint', { min: minLength })}</span>${errSpan('password')}</div>
    <div class="field"><label for="confirm">${t('family.signup.confirmLabel')}</label>
      <input class="input" id="confirm" name="confirm" type="password" dir="ltr" autocomplete="new-password" maxlength="72">${errSpan('confirm')}</div>`;
}
const haveAccount = (req, next) => html`<p class="center small ob-foot">${req.t('auth.page.haveAccount')} <a href="/login${next ? `?next=${enc(next)}` : ''}">${req.t('auth.page.signInLink')}</a></p>`;
/** Signed in with a kid's own account on a grown-up's step: sign out first (as /grown-ups/signup always said). */
const signOutFirst = (req) => html`<div class="notice warn"><p style="margin-top:0">${tHtml(req.t, 'family.signup.signedIn', { name: html`<b><bdi>${req.user.display_name}</bdi></b>` })}</p>
  <form data-api="/api/auth/logout"><input type="hidden" name="next" value="${req.path}"><button class="btn" type="submit">${req.t('me.signOut.button')}</button></form></div>`;

// ---------------------------------------------------------------- /signup: who's signing up?
// A ?next= on a grown-up or teacher page (Plans, the parent and teacher pages, the guides) still asks; any other page
// (the Builder, joining a class, a game, Friends, Me) is a kid on their way somewhere, so the kid's step opens at once.
const GROWNUP_NEXT = /^\/([a-z]{2}(-[A-Za-z]{2,4})?\/)?(plans|parents|teachers|grown-ups|family|safety|privacy|terms|refunds|learn)(\/|\?|#|$)/;
router.get('/signup', (req, res) => {
  const t = req.t, u = req.user;
  const next = wantedNext(req.query.next);
  if (u && !u.is_guest) return res.redirect(nextFor(u, next) || homeFor(u));
  const nq = next ? `?next=${enc(next)}` : '';
  // The old addresses: ?for=kid|grownup|teacher.
  if (req.query.for === 'kid') return res.redirect(302, `/signup/kid${nq}`);
  if (req.query.for === 'grownup' || req.query.for === 'parent') return res.redirect(302, `/signup/parent${nq}`);
  if (req.query.for === 'teacher') return res.redirect(302, '/signup/teacher');
  // A guest keeping their progress is a kid already playing; so is a kid on their way to a page.
  if ((u && u.is_guest) || (next && !GROWNUP_NEXT.test(next))) return res.redirect(302, `/signup/kid${nq}`);
  const body = html`<div class="doors whofor ob-doors" role="group" aria-labelledby="ob-h">
      ${choice({ href: `/signup/for/kid${nq}`, emoji: '🧒', title: t('onboard.who.kid'), sub: t('onboard.who.kidSub'), cls: 'door-kid', attrs: ' rel="nofollow"' })}
      ${choice({ href: `/signup/for/grownup${nq}`, emoji: '👪', title: t('onboard.who.parent'), sub: t('onboard.who.parentSub'), cls: 'door-grownup', attrs: ' rel="nofollow"' })}
      ${choice({ href: '/signup/for/teacher', emoji: '🍎', title: t('onboard.who.teacher'), sub: t('onboard.who.teacherSub'), cls: 'door-teacher', attrs: ' rel="nofollow"' })}
    </div>
    ${haveAccount(req, next)}
    <p class="center small ob-guest"><button class="btn btn-sm btn-link" type="button" data-guest-play="${next || '/'}">${t('auth.page.playAsGuest')}</button></p>`;
  screen(req, res, { title: t('auth.page.titleSignup'), heading: t('onboard.who.heading'), emoji: '🎉', body });
});

// ---------------------------------------------------------------- the kid's steps
/** After the kid's account: the code step, unless they are already on their way to join a class with its code. */
const kidAfter = next => (next && /^\/join(\?|$)/.test(next) ? next : `/signup/kid/code${next ? `?next=${enc(next)}` : ''}`);
router.get('/signup/kid', (req, res) => {
  const t = req.t, u = req.user;
  const next = wantedNext(req.query.next);
  if (u && !u.is_guest) return res.redirect(nextFor(u, next) || homeFor(u));
  const upgrading = !!(u && u.is_guest);
  const body = html`${upgrading ? html`<p class="notice good">${tHtml(t, 'auth.page.upgradeNotice', { name: u.display_name })}</p>` : ''}
    <form data-api="/api/auth/signup" data-next="${kidAfter(next)}" novalidate>
      <div class="field"><label for="username">${t('auth.page.nameLabelSignup')}</label>
        <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false" placeholder="${t('auth.page.namePlaceholder')}" aria-describedby="username-hint">
        <span class="hint" id="username-hint">${t('auth.page.nameHint')}</span>${errSpan('username')}</div>
      <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
        <span class="pw-row"><input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="6" aria-describedby="password-hint">
        <button class="btn pw-toggle" type="button" data-pw-toggle="password" aria-controls="password" aria-pressed="false" data-show="${t('auth.page.showPassword')}" data-hide="${t('auth.page.hidePassword')}">👁️ <span>${t('auth.page.showPassword')}</span></button></span>
        <span class="hint" id="password-hint">${t('auth.page.passwordHint')}</span>${errSpan('password')}</div>
      ${formErr}
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('auth.page.submitSignup')}</button>
    </form>
    ${upgrading ? '' : haveAccount(req, next)}`;
  screen(req, res, { title: t('auth.page.titleSignup'), back: upgrading ? '' : `/signup${next && GROWNUP_NEXT.test(next) ? `?next=${enc(next)}` : ''}`, at: 1, total: 2, emoji: '🧒',
    heading: upgrading ? t('auth.page.headingUpgrade') : t('auth.page.headingSignup'), lead: t('auth.page.introSignup'), body });
});
router.get('/signup/kid/code', (req, res) => {
  const t = req.t, u = req.user;
  const next = wantedNext(req.query.next);
  if (!u || u.is_guest) return res.redirect(302, '/signup/kid');
  if (!F.isChildAccount(u)) return res.redirect(nextFor(u, next) || homeFor(u));
  const fam = F.familiesOn(req) && !F.liveRowOf(u.id);
  const where = `${siteHost(req)}/family/link`;
  const body = html`<form data-api="/api/classes/join" novalidate>
      <div class="field"><label for="ob-code">${t('onboard.kid.codeLabel')}</label>
        <input class="input jc-input" id="ob-code" name="code" dir="ltr" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false">${errSpan('ob-code')}</div>
      ${formErr}
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('onboard.kid.join')}</button>
    </form>
    ${fam ? html`<section class="ob-alt" aria-labelledby="ob-fam-h"><h2 id="ob-fam-h"><span aria-hidden="true">👪</span> ${t('onboard.kid.familyHeading')}</h2>
      <p class="small">${t('onboard.kid.familyText')}</p>
      <div id="famcode" class="famcode" hidden><p class="small muted" style="margin:0">${t('me.family.codeLabel')}</p>
        <p style="margin:6px 0"><span class="bigcode" id="famcode-value" dir="ltr"></span></p>
        <p class="small">${tHtml(t, 'me.family.codeHowDay', { where: html`<bdi dir="ltr">${where}</bdi>` })}</p>
        <p class="small"><strong><span aria-hidden="true">🔒</span> ${t('me.family.codeWarn')}</strong></p></div>
      <button class="btn btn-block" type="button" data-family-code>${t('onboard.kid.familyButton')}</button></section>` : ''}
    <p class="ob-skip"><a class="btn btn-block" href="${next || '/'}" id="ob-skip">${t('onboard.kid.skip')}</a></p>`;
  screen(req, res, { title: t('onboard.kid.codeHeading'), at: 2, total: 2, emoji: '🎒', heading: t('onboard.kid.codeHeading'), lead: t('onboard.kid.codeLead'), body });
});

// ---------------------------------------------------------------- the parent's step
/** "Me (a grown-up)" while parents' accounts are off: an honest "coming soon", the parent page, and the kid's step. */
function grownupSoon(req, res) {
  const t = req.t;
  const body = html`<p>${t('auth.page.soonText')}</p>
    <div class="soon-btns"><a class="btn btn-primary btn-block" href="/parents">${t('auth.page.soonParents')}</a>
    <a class="btn btn-block" href="/signup/kid">${t('auth.page.soonKid')}</a></div>`;
  screen(req, res, { title: t('auth.page.titleSignup'), back: '/signup', emoji: '👪', heading: t('auth.page.soonHeading'), body });
}
router.get('/signup/parent', (req, res) => {
  const t = req.t, u = req.user;
  if (!F.familiesOn(req)) return grownupSoon(req, res);
  const chosen = chosenPlan(req.query);
  const choiceQ = chosen ? `?plan=${chosen.plan}&interval=${chosen.interval}` : '';
  if (auth.isGrownup(u)) return res.redirect(nextFor(u, wantedNext(req.query.next)) || `/family${choiceQ}`);
  // A grown-up page they started on (e.g. back to /plans), unless a plan was picked (then /family asks for it).
  const wanted = chosen ? null : nextFor({ account_type: 'grownup' }, wantedNext(req.query.next));
  const signedInKid = u && !u.is_guest;
  const picked = chosen ? html`<p class="notice" role="status"><span aria-hidden="true">🧾</span> ${t('family.signup.chosen', { plan: planName(t, chosen.plan) })}</p>` : '';
  const body = signedInKid ? signOutFirst(req) : html`${picked}${googleNotice(req)}
    <form data-api="/api/grown-ups/signup" novalidate>${chosen ? html`<input type="hidden" name="plan" value="${chosen.plan}"><input type="hidden" name="interval" value="${chosen.interval}">` : ''}${wanted ? html`<input type="hidden" name="next" value="${wanted}">` : ''}
      ${adultBox(t, 'family.signup.adult')}
      ${googleWay(req)}
      ${adultFields(req, auth.STAFF_PASSWORD_MIN, 'family.signup.signInNameHint')}
      ${formErr}
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('onboard.create')}</button>
    </form>
    ${haveAccount(req, wanted || (chosen ? `/family${choiceQ}` : null))}`;
  screen(req, res, { title: t('family.signup.title'), back: chosen ? '/plans' : '/signup', at: 1, total: 2, emoji: '👪', heading: t('onboard.parent.heading'), lead: t('onboard.parent.lead'), body });
});

// ---------------------------------------------------------------- the teacher's steps
/** Who may be on the teacher's steps after their account: an own account (never a grown-up's or a school-made one). */
const teacherAccount = u => !!u && !u.is_guest && !u.banned && !auth.isGrownup(u) && !u.managed_school && !S.isPlatformAdmin(u);
router.get('/signup/teacher', (req, res) => {
  const t = req.t, u = req.user;
  const tr = trialOf(req.query);
  if (u && !u.is_guest) {
    if (S.teacherToBe(u)) return res.redirect(`/signup/teacher/school${carry(tr)}`);
    if (S.isSchoolStaff(u)) return res.redirect(tr ? `/trial${tr.seats ? `?seats=${tr.seats}` : ''}` : '/teach');
  }
  const signedIn = u && !u.is_guest;
  const body = signedIn ? signOutFirst(req) : html`${googleNotice(req)}
    <form data-api="/api/onboarding/teacher" novalidate>${carryInputs(tr)}
      ${adultBox(t, 'plans.trial.signup.adult')}
      ${googleWay(req)}
      ${adultFields(req, auth.STAFF_PASSWORD_MIN, 'plans.trial.signup.usernameHint')}
      ${formErr}
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('onboard.create')}</button>
    </form>
    ${haveAccount(req, tr ? `/trial${tr.seats ? `?seats=${tr.seats}` : ''}` : null)}`;
  screen(req, res, { title: t('onboard.teacher.heading'), back: '/signup', at: 1, total: teacherSteps(), emoji: '🍎', heading: t('onboard.teacher.heading'), lead: t('onboard.teacher.lead'), body });
});

const yes = v => v === true || v === '1' || v === 'on';
/** The teacher's account: { username, password, confirm, adult, via: 'google'?, trial?, seats? }. With via=google only
 *  the box is checked, then on to Google (routes/google.js makes the account when Google answers). */
router.post('/api/onboarding/teacher', (req, res) => {
  const t = req.t, body = b(req), ip = ipOf(req);
  const tr = trialOf(body);
  if (req.user && !req.user.is_guest) return res.status(409).json({ error: t('plans.trial.errors.signedIn'), redirect: homeFor(req.user) });
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return res.status(429).json({ error: t('auth.api.tooManySignups') });
  if (!yes(body.adult)) return res.status(400).json({ error: t('plans.trial.errors.adult'), field: 'adult' });
  if (body.via === 'google') {
    if (!googleEnabled()) return res.status(404).json({ error: t('errors.api.notFound') });
    return res.json({ ok: true, redirect: `/auth/google/start?intent=signup&t=${enc(signupToken('teacher'))}&next=${enc(`/signup/teacher/school${carry(tr)}`)}` });
  }
  const errors = {};
  const n = auth.cleanName(body.username, t);
  if (!n.ok) errors.username = n.error;
  else if (auth.getUserByName(n.value) || auth.isRetiredName(n.value)) errors.username = t('auth.api.nameTaken');
  const pw = String(body.password ?? '');
  const pe = auth.checkStaffPassword(pw, n.ok ? n.value : '', t, t('plans.trial.errors.password', { min: auth.STAFF_PASSWORD_MIN }));
  if (pe) errors.password = pe;
  else if (String(body.confirm ?? '') !== pw) errors.confirm = t('me.password.mismatch');
  const fields = ['username', 'password', 'confirm'].filter(k => errors[k]);
  if (fields.length) return res.status(400).json({ error: errors[fields[0]], field: fields[0], errors });
  let u;
  try { u = tx(() => { const made = auth.createUser({ username: n.value, password: pw }); q.run("UPDATE users SET signup_as='teacher' WHERE id=?", made.id); return auth.getUser(made.id); }); }
  catch (e) { if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' }); throw e; }
  if (req.user) auth.endSession(req, res);   // a guest playing on this device: their sign-in ends, their account stays
  audit(u.id, 'user.signup', u.id, { via: 'teacher' });
  auth.clearTeacherWay(req, res);
  auth.startSession(res, u.id, req.headers['user-agent'], { method: 'signup', teacherWay: true });
  auth.notePasswordLength(u, pw);
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  res.json({ ok: true, redirect: `/signup/teacher/school${carry(tr)}` });
});

/** A teacher's step after the account, or a redirect to where they belong. -> the user, or null when redirected. */
function teacherStep(req, res) {
  const u = req.user;
  if (!u || u.is_guest) { res.redirect(302, `/signup/teacher${carry(trialOf(req.query))}`); return null; }
  // Only an account made on the teacher's step (users.signup_as) or one that is staff already: a kid's own account never
  // makes itself a school admin here.
  if (!teacherAccount(u) || !(S.teacherToBe(u) || S.isSchoolStaff(u))) { res.redirect(302, homeFor(u)); return null; }
  return u;
}
router.get('/signup/teacher/school', (req, res) => {
  const t = req.t, u = teacherStep(req, res); if (!u) return;
  const tr = trialOf(req.query);
  // Staff already (made or joined a school, or a teacher of another school): on to the classes.
  if (S.isSchoolStaff(u) && req.query.how !== 'join') return res.redirect(302, `/signup/teacher/classes${carry(tr)}`);
  const how = ['create', 'join', 'own'].includes(req.query.how) ? req.query.how : '';
  const total = teacherSteps();
  const here = `/signup/teacher/school${carry(tr)}`;
  const howHref = h => `/signup/teacher/school?how=${h}${tr ? `&${carry(tr).slice(1)}` : ''}`;
  const nameField = html`<div class="field"><label for="ob-name">${t('onboard.school.yourName')}</label>
      <input class="input" id="ob-name" name="name" maxlength="60" autocomplete="name" aria-describedby="ob-name-hint"><span class="hint" id="ob-name-hint">${t('onboard.school.yourNameHint')}</span>${errSpan('ob-name')}</div>`;
  const tz = html`<input type="hidden" name="tz" data-browser-tz>`;
  if (how === 'create') {
    const known = (addressOf(u.id) || {}).email || '';
    const body = html`<form data-api="/api/onboarding/school" novalidate><input type="hidden" name="how" value="create">${tz}${carryInputs(tr)}
        <div class="field"><label for="ob-school">${t('onboard.school.schoolName')}</label>
          <input class="input" id="ob-school" name="school" maxlength="80" autocomplete="organization">${errSpan('ob-school')}</div>
        ${nameField}
        <div class="field"><label for="ob-email">${t('onboard.school.email')}</label>
          <input class="input" id="ob-email" name="email" type="email" dir="ltr" maxlength="${SR.LIMITS.email}" autocomplete="email" autocapitalize="off" spellcheck="false" value="${known}" aria-describedby="ob-email-hint">
          <span class="hint" id="ob-email-hint">${t('onboard.school.emailHint')}</span>${errSpan('ob-email')}</div>
        ${formErr}
        <button class="btn btn-primary btn-block btn-big" type="submit">${t('onboard.school.createSubmit')}</button>
        <p class="small muted">${tHtml(t, 'onboard.school.privacy', { privacy: '/privacy?for=grownups#schoolSetup' })}</p>
      </form>`;
    return screen(req, res, { title: t('onboard.school.createHeading'), back: here, at: 2, total, emoji: '🏫', heading: t('onboard.school.createHeading'), lead: t('onboard.school.createLead'), body });
  }
  if (how === 'own') {
    const body = html`<form data-api="/api/onboarding/school" novalidate><input type="hidden" name="how" value="own">${tz}${carryInputs(tr)}
        ${nameField}${formErr}
        <button class="btn btn-primary btn-block btn-big" type="submit">${t('onboard.school.ownSubmit')}</button></form>`;
    return screen(req, res, { title: t('onboard.school.ownHeading'), back: here, at: 2, total, emoji: '🍎', heading: t('onboard.school.ownHeading'), lead: t('onboard.school.ownLead'), body });
  }
  if (how === 'join') {
    const invites = S.invitesFor(u.id);
    const list = invites.length ? html`<ul class="plain ob-invites">${invites.map(i => html`<li class="ob-invite"><p>${t('school.invite.text', { school: i.school_name, role: t(`school.roles.${i.role}`) })}</p>
        <p class="small muted">⚠️ ${t('school.invite.warn')}</p>
        <form data-api="/api/onboarding/invite/${i.school_id}" novalidate>${carryInputs(tr)}${formErr}<button class="btn btn-primary btn-block" type="submit">✅ ${t('school.invite.accept')}</button></form></li>`)}</ul>` : '';
    const body = html`${list}
      ${invites.length ? '' : html`<p>${t('onboard.join.how')}</p>
        <p class="center ob-username"><bdi dir="ltr" class="bigcode">${u.username}</bdi> <button class="btn btn-sm" type="button" data-copy="${u.username}">📋 ${t('onboard.join.copy')}</button></p>
        <p class="small">${t('onboard.join.where')}</p>
        ${googleEnabled() ? html`<p class="small muted">${t('onboard.join.google')}</p>` : ''}
        <p><a class="btn btn-primary btn-block" href="${howHref('join')}">${t('onboard.join.check')}</a></p>`}
      ${S.isSchoolStaff(u) ? html`<p><a class="btn btn-block" href="/signup/teacher/classes${carry(tr)}">${t('onboard.classes.continue')}</a></p>`
        : html`<p><a class="btn btn-block" href="${howHref('own')}">${t('onboard.join.own')}</a></p>`}`;
    return screen(req, res, { title: t('onboard.join.heading'), back: here, at: 2, total, emoji: '🤝', heading: t('onboard.join.heading'), body });
  }
  const body = html`<div class="doors whofor ob-doors" role="group" aria-labelledby="ob-h">
      ${choice({ href: howHref('create'), emoji: '🏫', title: t('onboard.school.create'), sub: t('onboard.school.createSub'), cls: 'ob-create' })}
      ${choice({ href: howHref('join'), emoji: '🤝', title: t('onboard.school.join'), sub: t('onboard.school.joinSub'), cls: 'ob-join' })}
      ${choice({ href: howHref('own'), emoji: '⏭️', title: t('onboard.school.own'), sub: t('onboard.school.ownSub'), cls: 'ob-own' })}
    </div>`;
  screen(req, res, { title: t('onboard.school.heading'), at: 2, total, emoji: '🏫', heading: t('onboard.school.heading'), lead: t('onboard.school.lead'), body });
});

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/** The school step: { how: 'create', school, name, email?, tz } makes their school (they are its admin at once) and,
 *  with an email, a request already linked to it for our team to look over; { how: 'own', name, tz } makes their own
 *  classroom (a school of their own, named after them). */
router.post('/api/onboarding/school', rateLimit('onboard-school', 20, 3600e3), (req, res) => {
  const t = req.t, body = b(req), u = req.user;
  if (!teacherAccount(u) || !S.teacherToBe(u)) return res.status(409).json({ error: t('errors.api.notFound'), redirect: u && !u.is_guest ? homeFor(u) : '/signup/teacher' });
  const tr = trialOf(body);
  const how = body.how === 'create' ? 'create' : 'own';
  const errors = {};
  const name = clip(body.name, 60);
  if (name.length < 2) errors.name = t('plans.trial.errors.name');
  const school = how === 'create' ? clip(body.school, 80) : t('onboard.school.ownName', { name: name || u.username }).slice(0, 80);
  if (how === 'create' && school.length < 2) errors.school = t('plans.trial.errors.school');
  const email = how === 'create' ? clip(body.email, SR.LIMITS.email + 1).toLowerCase() : '';
  if (email && (email.length > SR.LIMITS.email || !SR.looksLikeEmail(email))) errors.email = t('teachers.setup.errors.email');
  const fields = ['school', 'name', 'email'].filter(k => errors[k]);
  if (fields.length) return res.status(400).json({ error: errors[fields[0]], field: fields[0], errors: Object.fromEntries(fields.map(k => [k, errors[k]])) });
  const r = S.setUpOwnSchool(u, { name, school, tz: typeof body.tz === 'string' ? body.tz.trim().slice(0, 64) : '' });
  if (!r.ok) return res.status(400).json({ error: t('plans.trial.errors.school'), field: 'school' });
  audit(u.id, 'onboard.school', r.school.id, { how });
  // A school of their own with a work email: our team looks it over ("Looks good" sends the welcome guide there).
  if (how === 'create' && email) {
    rememberAddress(u.id, email, 'school-request');
    SR.createForSchool({ school, name, email }, { by: auth.getUser(u.id), locale: req.locale, schoolId: r.school.id });
  }
  res.json({ ok: true, redirect: `/signup/teacher/classes${carry(tr)}` });
});
/** Join: accept a school admin's invite (services/schools.js answerInvite), then on to the classes. */
router.post('/api/onboarding/invite/:sid', rateLimit('onboard-school', 20, 3600e3), (req, res) => {
  const t = req.t, u = req.user;
  if (!teacherAccount(u)) return res.status(404).json({ error: t('errors.api.notFound') });
  const r = S.answerInvite(u, String(req.params.sid), true);
  if (!r.ok) return res.status(r.code === 'notFound' ? 404 : 400).json({ error: t(`school.errors.${r.code}`) });
  q.run("UPDATE users SET signup_as='' WHERE id=?", u.id);
  res.json({ ok: true, toast: t('school.invite.accepted', { school: r.school.name }), redirect: `/signup/teacher/classes${carry(trialOf(b(req)))}` });
});

// ---- classes
export const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
export const MAX_CLASSES = 10;
const gradeLabel = (t, g) => (g === 'K' ? t('onboard.classes.gradeK') : t('onboard.classes.gradeN', { n: g }));
function classRow(t, i) {
  return html`<fieldset class="ob-class" data-ob-class>
    <legend class="sr-only">${t('onboard.classes.rowLabel', { n: i + 1 })}</legend>
    <div class="field"><label for="ob-cn-${i}">${t('onboard.classes.name')}</label>
      <input class="input" id="ob-cn-${i}" name="name" maxlength="60" placeholder="${t('onboard.classes.namePh')}" autocomplete="off">${errSpan(`ob-cn-${i}`)}</div>
    <div class="field"><label for="ob-cg-${i}">${t('onboard.classes.grade')}</label>
      <select class="input" id="ob-cg-${i}" name="grade"><option value="">${t('onboard.classes.gradePick')}</option>${GRADES.map(g => html`<option value="${g}">${gradeLabel(t, g)}</option>`)}</select>${errSpan(`ob-cg-${i}`)}</div>
    <button class="btn btn-sm ob-remove" type="button" data-ob-remove hidden>✕ ${t('onboard.classes.remove')}</button>
  </fieldset>`;
}
router.get('/signup/teacher/classes', (req, res) => {
  const t = req.t, u = teacherStep(req, res); if (!u) return;
  const tr = trialOf(req.query);
  if (!S.isSchoolStaff(u)) return res.redirect(302, `/signup/teacher/school${carry(tr)}`);
  const total = teacherSteps();
  const next = `/signup/teacher/${GC.enabled() ? 'classroom' : 'done'}${carry(tr)}`;
  const mine = S.classesOf(u.id, 'teacher');
  const schools = S.classSchoolsFor(u);
  if (!schools.length) {
    // Joined a school whose admin makes the classes: nothing to add here.
    const s = S.schoolsOf(u.id).find(x => x.role !== 'student');
    const body = html`<p>${t('onboard.classes.noCreate', { school: s ? s.name : '' })}</p><p><a class="btn btn-primary btn-block btn-big" href="${next}">${t('onboard.classes.continue')}</a></p>`;
    return screen(req, res, { title: t('onboard.classes.heading'), at: 3, total, emoji: '📚', heading: t('onboard.classes.heading'), body });
  }
  const have = mine.length ? html`<div class="ob-have"><p class="small"><b>${t('onboard.classes.have')}</b></p><ul class="plain ob-have-list">${mine.map(c => html`<li>📘 <bdi>${c.name}</bdi>${c.grade ? html` <span class="muted small">· ${GRADES.includes(c.grade) ? gradeLabel(t, c.grade) : c.grade}</span>` : ''}</li>`)}</ul>
    <p><a class="btn btn-primary btn-block btn-big" href="${next}" id="ob-classes-next">${t('onboard.classes.continue')}</a></p>
    <h2 class="ob-more-h">${t('onboard.classes.more')}</h2></div>` : '';
  const body = html`${have}
    <form data-api="/api/onboarding/classes" novalidate>${carryInputs(tr)}
      ${schools.length > 1 ? html`<div class="field"><label for="ob-cs">${t('onboard.classes.school')}</label><select class="input" id="ob-cs" name="schoolId">${schools.map(s => html`<option value="${s.id}">${s.name}</option>`)}</select></div>`
        : html`<input type="hidden" name="schoolId" value="${schools[0].id}">`}
      <div class="ob-classes" data-ob-classes>${classRow(t, 0)}</div>
      <template data-ob-class-template>${classRow(t, 99)}</template>
      <p><button class="btn btn-block ob-addrow" type="button" data-ob-add data-max="${MAX_CLASSES}">➕ ${t('onboard.classes.add')}</button></p>
      ${formErr}
      <button class="btn ${mine.length ? '' : 'btn-primary '}btn-block btn-big" type="submit">${t(mine.length ? 'onboard.classes.submitMore' : 'onboard.classes.submit')}</button>
    </form>`;
  // No way back: the school is chosen (made or joined) by now.
  screen(req, res, { title: t('onboard.classes.heading'), at: 3, total, emoji: '📚', heading: t('onboard.classes.heading'), lead: mine.length ? '' : t('onboard.classes.lead'), body, wide: true });
});
/** { schoolId, name: [..], grade: [..] }: every row with something typed needs a name and a grade, and at least one
 *  class in all. The classes are made with the teacher as their teacher (services/schools.js createClass). */
router.post('/api/onboarding/classes', rateLimit('class-new', 60, 3600e3), async (req, res) => {
  const t = req.t, body = b(req), u = req.user;
  if (!teacherAccount(u) || !S.isSchoolStaff(u)) return res.status(404).json({ error: t('errors.api.notFound') });
  const tr = trialOf(body);
  const s = S.classSchoolsFor(u).find(x => x.id === String(body.schoolId || '')) || null;
  if (!s) return res.status(400).json({ error: t('school.errors.notFound') });
  const names = [].concat(body.name ?? []).map(v => clip(v, 60));
  const grades = [].concat(body.grade ?? []).map(v => String(v ?? ''));
  const rows = names.map((name, i) => ({ name, grade: grades[i] || '' })).filter(r => r.name || r.grade);
  if (!rows.length) return res.status(400).json({ error: t('onboard.classes.errors.none'), field: 'name' });
  if (rows.length > MAX_CLASSES) return res.status(400).json({ error: t('onboard.classes.errors.tooMany', { max: MAX_CLASSES }) });
  if (rows.some(r => !r.name)) return res.status(400).json({ error: t('school.errors.className'), field: 'name' });
  if (rows.some(r => !GRADES.includes(r.grade))) return res.status(400).json({ error: t('onboard.classes.errors.grade'), field: 'grade' });
  const made = [];
  tx(() => { for (const r of rows) { const c = S.createClass(u, s.id, r); if (c.ok) made.push(c.class); } });
  // The first class saved: the teacher's own free trial starts (not for a school's seat trial, ?seats=N, which /trial
  // starts next). It never stops the sign-up: Stripe trouble is logged, and /trial or /plans offer it again.
  if (made.length && !(tr && tr.seats) && F.familiesOn(req)) await TP.autoStartTrial(auth.getUser(u.id), { ip: ipOf(req) });
  res.json({ ok: true, toast: t('onboard.classes.made', { count: made.length }), redirect: `/signup/teacher/${GC.enabled() ? 'classroom' : 'done'}${carry(tr)}` });
});

// ---- Google Classroom, then done
router.get('/signup/teacher/classroom', (req, res) => {
  const t = req.t, u = teacherStep(req, res); if (!u) return;
  const tr = trialOf(req.query);
  const done = `/signup/teacher/done${carry(tr)}`;
  if (!GC.enabled() || !S.isSchoolStaff(u)) return res.redirect(302, done);
  const first = S.classesOf(u.id, 'teacher')[0];
  const connected = !!GC.connectionOf(u.id);
  const body = html`<ul class="lp-list small ob-gc-list">${['li1', 'li2', 'li3'].map(k => html`<li>${t(`onboard.classroom.${k}`)}</li>`)}</ul>
    ${connected ? html`<p class="notice good" role="status">${t('onboard.classroom.connected')}</p>`
      : GC.mayConnect(u) && GC.canStore() ? html`<form data-api="/api/google-classroom/connect" novalidate>${first ? html`<input type="hidden" name="back" value="${first.id}">` : ''}${formErr}
        <button class="gbtn ob-gc" type="submit"><span>${G_LOGO}</span><span>${t('onboard.classroom.connect')}</span></button></form>` : html`<p class="small muted">${t('onboard.classroom.later')}</p>`}
    <p class="ob-skip"><a class="btn btn-block${connected ? ' btn-primary' : ''}" href="${done}" id="ob-skip">${t(connected ? 'onboard.classes.continue' : 'onboard.classroom.skip')}</a></p>`;
  screen(req, res, { title: t('onboard.classroom.heading'), back: `/signup/teacher/classes${carry(tr)}`, at: 4, total: 4, emoji: '🔗', heading: t('onboard.classroom.heading'), lead: t('onboard.classroom.lead'), body });
});
router.get('/signup/teacher/done', (req, res) => {
  const t = req.t, u = teacherStep(req, res); if (!u) return;
  const tr = trialOf(req.query);
  if (!S.isSchoolStaff(u)) return res.redirect(302, `/signup/teacher/school${carry(tr)}`);
  // The classes are required: a teacher who may make one and has none goes back to that step.
  if (S.classSchoolsFor(u).length && !S.classesOf(u.id, 'teacher').length) return res.redirect(302, `/signup/teacher/classes${carry(tr)}`);
  const plans = F.familiesOn(req);
  if (tr && tr.seats && plans) return res.redirect(302, `/trial?seats=${tr.seats}`);
  // "{school} is ready ... we'll look over your school and email you a short guide": only when our team has its request.
  const next = S.adminSchools(u).some(s => SR.latestForSchool(s.id)) ? '/teach?welcome=school' : '/teach';
  // One line about the Teacher plan: the trial started at the classes step, or the school covers them / has a seat.
  const line = plans ? TP.trialLine(u.id) : null;
  if (!line) return res.redirect(302, tr && plans ? '/trial' : next);
  const own = line.state === 'started';
  const go = next;
  // No email yet (a password sign-up): an optional one for the trial reminders; the in-app notices come either way.
  const ask = own && !(addressOf(u.id) || {}).email;
  const body = html`${trialLineHtml(t, line)}
    ${ask ? html`<form data-api="/api/trial/email" novalidate>
        <div class="field"><label for="ob-temail">${t('plans.auto.emailLabel')}</label>
          <input class="input" id="ob-temail" name="email" type="email" dir="ltr" maxlength="254" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="ob-temail-hint">
          <span class="hint" id="ob-temail-hint">${t('plans.auto.emailHint')}</span>${errSpan('ob-temail')}</div>
        ${formErr}
        <button class="btn btn-primary btn-block" type="submit">${t('plans.auto.emailSave')}</button></form>
      <p class="ob-skip"><a class="btn btn-block" href="${go}" id="ob-done-go">${t('onboard.classroom.skip')}</a></p>`
      : html`<p><a class="btn btn-primary btn-block btn-big" href="${go}" id="ob-done-go">${t('onboard.classes.continue')}</a></p>`}`;
  screen(req, res, { title: t('plans.auto.doneHeading'), emoji: '🎉', heading: t('plans.auto.doneHeading'), body });
});

export { GROWNUP_NEXT };
