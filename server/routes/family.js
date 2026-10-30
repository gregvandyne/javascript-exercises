// Grown-up accounts and family links (docs/decisions.md "Paid plans", chunk 3; rules in server/services/family.js).
//   /grown-ups/signup|login the grown-up sign-up and sign-in (/grown-ups itself is a 301 to /parents#families)
//   /family, /family/link   the grown-up's own pages
//   /family/add             "Add your kids": the step after sign-up and after paying (make an account, or link one)
//   /api/me/family/*        the child's side, from the "For grown-ups" panel on /me
//   /api/billing/*          the grown-up's plan (chunk 4): Checkout, the Customer Portal and the return page's status
// Everything here answers 404 while billing is off (no STRIPE_API_KEY), except that grown-up accounts stay fenced in and
// keep a small /family page with their language, password and Sign out (so a grown-up can always sign out).
//
// The fence (grownupGuard, before every other route): a grown-up account can play games and look after its family,
// nothing else. It is a list of what they may open; everything else (the Builder, Studio, friends, chat, profiles,
// classes, schools, admin, ...) is a 404, as if the page weren't there. Paying (chunk 4) is for grown-ups only, behind
// the same families gate, the billing tester rule while the key is a test key, and the password typed again.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, parentsLabel, tabKey as navLabel } from '../views/layout.js';
import { avatar, notYou } from '../views/components.js';
import * as auth from '../auth.js';
import { audit, tx, today } from '../db.js';
import { config } from '../config.js';
import * as F from '../services/family.js';
import * as funnel from '../services/funnel.js';
import * as S from '../services/stripe.js';
import * as C from '../services/checkout.js';
import { log } from '../services/log.js';
import { familyMonth, coveredChildren } from '../builder/usage.js';
import * as B from '../services/billing.js';
const { customerOf } = B;
import { rateLimit, allow, count, clear as clearLimit, ipOf, loginLockKey } from '../services/ratelimit.js';
import { tHtml, saveUserLang } from '../i18n/index.js';
import { saveUserTheme } from '../theme.js';
import { PARENT_GUIDES } from '../learn.js';
import { siteHost } from '../site.js';
import { SIGNUP, LOGIN, wantedNext, passwordPanel, signOutPanel, languagePanel } from './auth.js';
import { LEGAL_UPDATED } from './info.js';
import { madeSees } from '../views/family-made.js';
import { deleteAccount, inSchoolOrClass } from '../services/account-delete.js';
import { cancel as cancelBuild } from '../builder/runner.js';

export const router = Router();
const isApi = req => req.originalUrl.startsWith('/api/');
const nope = (req, res) => (isApi(req) ? res.status(404).json({ error: req.t('errors.api.notFound') }) : notFound(req, res));

// ---------------------------------------------------------------- the fence
// What a grown-up may open: game pages and play, search, the grown-up and info pages, signing in and out, their own
// password and theme, and the family routes. Game calls a play page makes (save, score, ...) are allowed; a grown-up's
// score is never stored (routes/games.js), so they are on no leaderboard.
// The parent pages' own links: the guides (/parents/<guide>), and the read-only age and subject pages (/learn/<slug>).
const GUIDE_PATHS = new RegExp(`^/parents/(${PARENT_GUIDES.map(g => g.slug).join('|')})$`);
const GROWNUP_GET = [/^\/$/, /^\/search$/, /^\/api\/(search|live|me|billing\/status)$/, /^\/(g|play)\/[^/]+$/, /^\/(frame|shots|avatars)\/[^/]+$/,
  /^\/(parents|safety|terms|refunds|privacy|teachers)$/, GUIDE_PATHS, /^\/learn(\/[a-z0-9-]+)?$/, /^\/plans(\/schools(\/print)?)?$/, /^\/grown-ups(\/(signup|login))?$/, /^\/family(\/(link|add))?$/, /^\/family\/account$/, /^\/family\/children\/(new|[^/]+\/data)$/, /^\/(login|signup)$/, /^\/api\/games\/[^/]+\/(save|leaderboard)$/];
const GROWNUP_POST = [/^\/api\/auth\/(login|logout|logout-everywhere)$/, /^\/api\/me\/(password|theme)$/, /^\/api\/family\/(link|checklist\/hide|reauth|children\/new|children\/[^/]+\/(remove|switch|password|delete))$/,
  /^\/api\/billing\/(family\/checkout|portal)$/,
  /^\/api\/teachers\/school-request$/,   // a parent who is also a teacher may ask us to set up their school
  /^\/api\/games\/[^/]+\/(play|heartbeat|leave|save|score|report)$/];
/** May a grown-up account use this method and path? */
export function grownupMay(method, path) {
  const list = method === 'GET' || method === 'HEAD' ? GROWNUP_GET : method === 'POST' ? GROWNUP_POST : [];
  return list.some(re => re.test(path));
}
export function grownupGuard(req, res, next) {
  if (!auth.isGrownup(req.user)) return next();
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/me') return res.redirect(302, '/family');
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/build') return builderForKids(req, res);
  if (grownupMay(req.method, req.path)) return next();
  nope(req, res);
}
/** /build for a grown-up account: not a 404 (the Build tab and "Make a game" links are everywhere a parent looks), a
 *  short page saying the Builder is for kids' accounts and where to read about it. */
function builderForKids(req, res) {
  const t = req.t;
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const body = html`<div class="empty"><div class="emo" aria-hidden="true">🛠️</div>
    <h1${fb('build.grownup.heading')}>${t('build.grownup.heading')}</h1>
    <p${fb('build.grownup.text')}>${t('build.grownup.text')}</p>
    <div class="row" style="justify-content:center">
      ${F.familiesOn(req) ? html`<a class="btn btn-primary" href="/family">${t('family.landing.toFamily')}</a>` : ''}
      <a class="btn" href="/learn/make-a-game"${fb('build.grownup.how')}>${t('build.grownup.how')}</a>
      <a class="btn" href="/parents/ai-builder-safety"${fb('build.grownup.safety')}>${t('build.grownup.safety')}</a>
    </div></div>`;
  page(req, res, { title: t('build.grownup.title'), active: 'build', body });
}
/** Where a sign-in may go back to (?next=): a grown-up only to a page they may open (not just '/'), a child never to a
 *  family page. -> the path, or null for "their own home". */
export function nextFor(u, next) {
  if (!next) return null;
  const path = next.split(/[?#]/)[0];
  if (auth.isGrownup(u)) return path !== '/' && grownupMay('GET', path) ? next : null;
  return /^\/(family|grown-ups)(\/|$)/.test(path) ? null : next;
}

// ---------------------------------------------------------------- preview (before BILLING_PUBLIC)
// ?bpreview=<BILLING_PREVIEW_TOKEN> on any page sets the preview cookie (12 hours) and comes back without it in the URL.
router.use((req, res, next) => {
  const want = req.method === 'GET' && typeof req.query.bpreview === 'string' ? req.query.bpreview : null;
  if (want === null) return next();
  const u = new URL(req.originalUrl, 'http://x'); u.searchParams.delete('bpreview');
  const secure = config.env === 'production' ? '; Secure' : '';
  if (config.billingPreviewToken && want === config.billingPreviewToken) res.append('Set-Cookie', `${F.PREVIEW_COOKIE}=${want}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}${secure}`);
  else if (want === 'off') res.append('Set-Cookie', `${F.PREVIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.redirect(302, u.pathname + u.search);
});

// ---------------------------------------------------------------- gates
const on = (req, res, next) => (F.familiesOn(req) ? next() : nope(req, res));
/** The grown-up's pages: signed out -> the grown-up sign-in; anyone else -> 404. While families are off, only a
 *  grown-up's own /family and /family/account pages are there (to sign out and change the language or password);
 *  /family/link and the APIs are 404. */
const OPEN_WHEN_OFF = new Set(['/family', '/family/account']);
function grownupOnly(req, res, next) {
  if (!F.familiesOn(req) && !(auth.isGrownup(req.user) && req.method === 'GET' && OPEN_WHEN_OFF.has(req.path))) return nope(req, res);
  if (auth.isGrownup(req.user)) return next();
  if (!isApi(req) && (!req.user || req.user.is_guest)) return res.redirect(`/grown-ups/login?next=${encodeURIComponent(req.originalUrl)}${req.sessionEnded ? '&signedout=1' : ''}`);
  nope(req, res);
}
/** The child's side: only own kid accounts (never guests, school accounts, staff or grown-ups). */
const childOnly = (req, res, next) => (F.familiesOn(req) && F.isChildAccount(req.user) ? next() : nope(req, res));
/** Parent-made child accounts (F.madeOn: families on and PARENT_MADE_CHILDREN=1), then the grown-up fence: off, every
 *  one of their pages and APIs is a 404 like an unknown address. */
const madeOnly = (req, res, next) => (F.madeOn(req) ? grownupOnly(req, res, next) : nope(req, res));
/** A child this grown-up's family made and is still linked to (:token, F.requestToken): req.made = { row, child,
 *  family }; a code-linked child, another family's child or an unknown token is a 404. */
function madeKid(req, res, next) {
  const m = F.madeChild(req.user, req.params.token);
  if (!m) return nope(req, res);
  req.made = m;
  next();
}

// ---------------------------------------------------------------- the child's "For grown-ups" panel on /me
/** Neutral and always there for own accounts: no plans, messages or money. Empty for everyone else. */
export function meFamilyPanel(req) {
  const t = req.t, u = req.user;
  if (!F.familiesOn(req) || !F.isChildAccount(u)) return '';
  // Safety words a child must be able to read: until a language has them, the English is marked as English (lang, and
  // left to right so its full stops land on the right side on a right-to-left page).
  const say = (key, s) => (t.own(key) ? s : html`<span lang="en" dir="ltr">${s}</span>`);
  const k = (key, vars) => say(key, t(key, vars));
  const kh = (key, vars) => say(key, tHtml(t, key, vars));
  const head = html`<h2 id="fam-h"><span aria-hidden="true">🧑‍🧒</span> ${k('me.family.heading')}</h2>`;
  const form = (action, label, { cls = 'btn', confirm = '', extra = '' } = {}) => html`<form data-api="/api/me/family/${action}" data-reload data-confirm="${confirm}">${extra}<button class="${cls}" type="submit">${label}</button></form>`;
  const r = F.liveRowOf(u.id);
  let inner;
  if (r && r.status === 'linked' && F.madeLinkOf(u)) {
    // An account the linked grown-up made: what they can see (the same list as the first-sign-in card and /family), and
    // Unlink and Report, each asking for a new password (the grown-up knows the old one).
    const leave = (action, id, label, confirm) => html`<details class="famleave" id="${id}" data-hash-open><summary class="btn">${label}</summary>
      <form data-api="/api/me/family/${action}" data-reload data-confirm="${confirm}" novalidate>
        <p class="small">${k('me.family.made.newPwWhy')}</p>
        <div class="field"><label for="${id}-pw">${k('me.family.made.newPw')}</label>
          <input class="input" id="${id}-pw" name="newPassword" type="password" dir="ltr" autocomplete="new-password" required minlength="6" maxlength="72"><span class="err" id="${id}-pw-err" aria-live="polite"></span></div>
        <div class="field"><label for="${id}-confirm">${k('me.family.made.newPwConfirm')}</label>
          <input class="input" id="${id}-confirm" name="newConfirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="${id}-confirm-err" aria-live="polite"></span></div>
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn ${action === 'report' ? 'btn-danger' : 'btn-primary'}" type="submit">${label}</button>
      </form></details>`;
    inner = html`<p>${kh('me.family.madeLinked')}</p>${madeSees(req)}
      <div class="row famleaves">${leave('unlink', 'grownups-unlink', k('me.family.unlink'), t('me.family.unlinkConfirm'))}${leave('report', 'grownups-report', html`🚩 ${k('me.family.report')}`, t('me.family.reportLinkedConfirm'))}</div>`;
  } else if (r && r.status === 'linked') {
    inner = html`<p>${kh('me.family.linked')}</p>
      <div class="row">${form('unlink', k('me.family.unlink'), { confirm: t('me.family.unlinkConfirm') })}${form('report', html`🚩 ${k('me.family.report')}`, { confirm: t('me.family.reportLinkedConfirm') })}</div>`;
  } else if (r) {
    const ans = v => html`<input type="hidden" name="answer" value="${v}">`;
    inner = html`<div class="notice warn" role="status" style="margin-bottom:.8em"><p style="margin-top:0">${kh('me.family.pending')}</p><p style="margin-bottom:0">${k('me.family.pendingCheck')}</p></div>
      <div class="row">${form('answer', html`✅ ${k('me.family.yes')}`, { cls: 'btn btn-primary', extra: ans('yes') })}${form('answer', k('me.family.no'), { extra: ans('no') })}${form('answer', html`🚩 ${k('me.family.report')}`, { extra: ans('report'), confirm: t('me.family.reportConfirm') })}</div>`;
  } else {
    const open = F.openCode(u.id);
    const where = `${siteHost(req)}/family/link`;
    inner = html`<p class="muted">${k('me.family.text')}</p>
      ${open ? html`<p class="small" id="famcode-open">${k('me.family.codeOpen')}</p>` : ''}
      <div id="famcode" class="famcode" hidden><p class="small muted" style="margin:0">${k('me.family.codeLabel')}</p>
        <p style="margin:6px 0"><span class="bigcode" id="famcode-value" dir="ltr"></span></p>
        <p class="small">${kh('me.family.codeHowDay', { where: html`<bdi dir="ltr">${where}</bdi>` })}</p>
        <p class="small"><strong><span aria-hidden="true">🔒</span> ${k('me.family.codeWarn')}</strong></p></div>
      <button class="btn btn-primary" type="button" data-family-code>${open ? k('me.family.newCode') : k('me.family.getCode')}</button>`;
  }
  return html`<section class="panel" id="grownups" aria-labelledby="fam-h">${head}${inner}</section>`;
}
const childErr = (req, res, code, status = 400) => res.status(status).json({ error: req.t(`me.family.errors.${code}`) });
router.post('/api/me/family/code', childOnly, rateLimit('family-code', 10, 3600e3), (req, res) => {
  const r = F.createCode(req.user);
  if (!r.ok) return childErr(req, res, r.code === 'notChild' ? 'nothing' : r.code, 409);
  res.json({ ok: true, code: r.code, expiresAt: r.expiresAt });
});
router.post('/api/me/family/answer', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => {
  const what = String((req.body || {}).answer || '');
  const r = F.answer(req.user, what);
  if (!r.ok) return childErr(req, res, 'nothing', 409);
  res.json({ ok: true, toast: req.t(`me.family.done.${what}`) });
});
/** Unlink or Report. On an account the linked grown-up made (F.madeLinkOf) both need a new password (kid rules, typed
 *  twice, not the old one): the password changes, every sign-in ends and this device gets a fresh one, and the link ends,
 *  all at once. A code-linked child keeps the one-tap Unlink and Report (that adult never knew the password). */
function childLeaves(req, res, reportIt) {
  const t = req.t, u = req.user;
  let newPassword = null;
  if (F.madeLinkOf(u)) {
    const { newPassword: pw, newConfirm } = req.body || {};
    const rule = auth.checkPassword(pw, u.username, t);
    if (rule) return res.status(400).json({ error: rule, field: 'newPassword' });
    if (String(newConfirm ?? '') !== String(pw)) return res.status(400).json({ error: t('me.password.mismatch'), field: 'newConfirm' });
    if (auth.verifyPassword(u, pw)) return res.status(400).json({ error: t('me.password.same'), field: 'newPassword' });
    newPassword = String(pw);
  }
  const r = F.childLeaves(u, { reportIt, newPassword });
  if (!r.ok) return childErr(req, res, 'nothing', 409);
  // A fresh sign-in on this device; one a Switch started stays marked as one (req.sessionVia).
  if (r.made) auth.startSession(res, u.id, req.headers['user-agent'], { via: req.sessionVia });
  res.json({ ok: true, toast: t(reportIt ? 'me.family.done.reportLinked' : 'me.family.done.unlink') });
}
router.post('/api/me/family/unlink', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => childLeaves(req, res, false));
router.post('/api/me/family/report', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => childLeaves(req, res, true));
// The first-sign-in card's OK (madeCard). Answered for good only in a sign-in the child made themselves: in one a
// grown-up's Switch started (often the grown-up still holding the device), OK hides the card for that sign-in only, so
// the child still sees it the first time they sign in on their own.
router.post('/api/me/family/made-seen', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => {
  if (!F.madeOn(req) || !req.user.made_by) return nope(req, res);
  if (req.sessionVia === 'switch') F.madeCardOkThisSession(req.sessionId);
  else F.madeNoteSeen(req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- /grown-ups (public): the sign-up and sign-in
/** A plan's limits, stated before buying: the per-child daily ceiling (only when it is below the plan's monthly extras,
 *  `extra`, Family's by default: a bigger number would read like a promise of that many a day), the cost backstop, and
 *  (reset) when extras start again. */
export function limitsText(t, { reset = true, extra = config.familyExtraMessages } = {}) {
  const parts = [];
  if (config.familyChildDailyMax < extra) parts.push(t('family.landing.what.limitDaily', { daily: config.familyChildDailyMax }));
  parts.push(t('family.landing.what.limitCost'));
  if (reset) parts.push(t('family.landing.what.limitReset'));
  return parts.join(' ');
}
/** Are family plans on sale to this visitor? With a live key, yes; with a test key, only to billing testers (D14). */
export const onSale = u => S.billingMode() === 'live' || (auth.isGrownup(u) && C.mayBill(u));
/** Can this visitor buy a family plan here and now? onSale, and the family prices exist (C.familyPrices: billing on and
 *  the "Family" payment method configuration set, config.stripePmcFamily): the same rule as /plans's notOnSale. Used by
 *  /parents ("not on sale yet") and the /family checklist. */
export async function familyOnSale(u) {
  return onSale(u) && !!config.stripePmcFamily && !!(await C.familyPrices('family').catch(() => null));
}
/** A plan a grown-up picked on /plans (?plan=basic|family&interval=month|year), kept through sign-up or sign-in and
 *  shown on /family as the plan to pay for. -> { plan, interval } or null */
export function chosenPlan(query = {}) {
  const plan = typeof query.plan === 'string' && C.FAMILY_PLANS.includes(query.plan) ? query.plan : null;
  if (!plan) return null;
  return { plan, interval: query.interval === 'year' ? 'year' : 'month' };
}
const choiceQuery = c => (c ? `?plan=${c.plan}&interval=${c.interval}` : '');
/** The plan's name in a sentence ("Basic plan", "Family plan", "Free plan"). */
export const planName = (t, plan) => t(plan === 'basic' ? 'family.plan.basic' : plan === 'family' ? 'family.plan.family' : 'family.plan.free');
// /grown-ups was the grown-up accounts page; it is part of the one parent page now (routes/parents.js, its Family accounts
// section), so the old address moves there for good, keeping any query (?bpreview is handled above). Always a 301, also
// while families are off: /parents is there either way, and a permanent redirect must not change with a setting.
router.get('/grown-ups', (req, res) => {
  const i = req.originalUrl.indexOf('?');
  res.redirect(301, `/parents${i < 0 ? '' : req.originalUrl.slice(i)}#families`);
});

/** A grown-up sign-up or sign-in box. Someone signed in with a kid account is asked to sign out first. */
function grownupAuthPage(req, res, mode) {
  const t = req.t, u = req.user, isSignup = mode === 'signup';
  const chosen = chosenPlan(req.query);
  if (auth.isGrownup(u)) return res.redirect(nextFor(u, wantedNext(req.query.next)) || `/family${choiceQuery(chosen)}`);
  const wanted = chosen ? null : nextFor({ account_type: 'grownup' }, wantedNext(req.query.next));   // e.g. back to /plans
  const next = wanted || `/family${choiceQuery(chosen)}`;
  const nextQuery = chosen ? choiceQuery(chosen) : wanted ? `?next=${encodeURIComponent(wanted)}` : '';
  const signedInKid = u && !u.is_guest;
  // The plan picked on /plans, named above the form and kept through sign-up or sign-in (then paid for on /family).
  const picked = chosen ? html`<p class="notice" role="status"><span aria-hidden="true">🧾</span> ${t('family.signup.chosen', { plan: planName(t, chosen.plan) })}</p>` : '';
  const min = auth.STAFF_PASSWORD_MIN;
  // "Your sign-in name" and its hint are new: until a language has them, its translated name label and hint stand in.
  const nameKey = t.own('family.signup.signInName') || !t.own('family.signup.nameLabel') ? 'family.signup.signInName' : 'family.signup.nameLabel';
  const nameHintKey = t.own('family.signup.signInNameHint') || !t.own('family.signup.nameHint') ? 'family.signup.signInNameHint' : 'family.signup.nameHint';
  const form = isSignup ? html`<form data-api="/api/grown-ups/signup" novalidate>${chosen ? html`<input type="hidden" name="plan" value="${chosen.plan}"><input type="hidden" name="interval" value="${chosen.interval}">` : ''}${wanted ? html`<input type="hidden" name="next" value="${wanted}">` : ''}
      <div class="field"><label for="username">${t(nameKey)}</label>
        <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false">
        <span class="hint">${t(nameHintKey)}</span><span class="err" id="username-err" aria-live="polite"></span></div>
      <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
        <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="${min}" maxlength="72" aria-describedby="password-hint">
        <span class="hint" id="password-hint">${t('family.signup.passwordHint', { min })}</span><span class="err" id="password-err" aria-live="polite"></span></div>
      <div class="field"><label for="confirm">${t('family.signup.confirmLabel')}</label>
        <input class="input" id="confirm" name="confirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="confirm-err" aria-live="polite"></span></div>
      <div class="field"><label class="checkline"><input type="checkbox" id="adult" name="adult" value="1" required> <span>${t('family.signup.adult')}</span></label><span class="err" id="adult-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('family.signup.submit')}</button>
    </form>
    <p class="center small" style="margin-top:16px">${t('family.signup.haveAccount')} <a href="/grown-ups/login${nextQuery}">${t('family.landing.login')}</a></p>`
    : html`<form data-api="/api/auth/login" novalidate><input type="hidden" name="next" value="${next}">
      <div class="field"><label for="username">${t(nameKey)}</label>
        <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required maxlength="16" autocapitalize="off" spellcheck="false"><span class="err" id="username-err" aria-live="polite"></span></div>
      <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
        <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="current-password" required><span class="err" id="password-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('family.login.submit')}</button>
    </form>
    ${config.contactEmail ? html`<p class="small muted" style="margin-top:12px">${tHtml(t, 'family.login.forgot', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p>` : ''}
    <p class="center small" style="margin-top:16px">${t('family.login.newHere')} <a href="/grown-ups/signup${nextQuery}">${t('family.landing.signup')}</a></p>`;
  const body = html`<div class="authbox"><div class="panel">
    <h1 class="center">${isSignup ? t('family.signup.heading') : t('family.login.heading')}</h1>
    <p class="center muted">${isSignup ? t('family.signup.intro') : t('family.login.intro')}</p>
    ${!isSignup && (req.query.signedout === '1' || req.sessionEnded) ? html`<p class="notice warn" role="status">${t('auth.page.signedOut')}</p>` : ''}
    ${signedInKid ? '' : picked}
    ${signedInKid ? html`<div class="notice warn"><p style="margin-top:0">${tHtml(t, 'family.signup.signedIn', { name: html`<b><bdi>${u.display_name}</bdi></b>` })}</p>
      <form data-api="/api/auth/logout"><input type="hidden" name="next" value="${req.path}"><button class="btn" type="submit">${t('me.signOut.button')}</button></form></div>` : form}
  </div></div>`;
  page(req, res, { title: isSignup ? t('family.signup.title') : t('family.login.title'), back: chosen ? '/plans' : '/parents#families', backLabel: chosen ? t('plans.title') : parentsLabel(t), body });
}
router.get('/grown-ups/signup', on, (req, res) => grownupAuthPage(req, res, 'signup'));
router.get('/grown-ups/login', on, (req, res) => grownupAuthPage(req, res, 'login'));

// Grown-up sign-up: the same address limits as the kids' sign-up (routes/auth.js SIGNUP: the same buckets), a password
// of at least 12 characters, and the "parent or guardian, 18 or older" box (a statement, not a check). Never from a
// guest (a new account; the guest's sign-in on this device ends), never while a kid account is signed in here.
router.post('/api/grown-ups/signup', on, (req, res) => {
  const t = req.t, ip = ipOf(req);
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return res.status(429).json({ error: t('auth.api.tooManySignups') });
  if (req.user && !req.user.is_guest) return res.status(409).json({ error: t('family.signup.signOutFirst') });
  const { username, password, confirm, adult } = req.body || {};
  const n = auth.cleanName(username, t, { realNames: true }); if (!n.ok) return res.status(400).json({ error: n.error, field: 'username' });
  const pw = String(password ?? '');
  const pe = auth.checkPassword(pw, n.value, t) || (pw.length < auth.STAFF_PASSWORD_MIN ? t('family.signup.short', { min: auth.STAFF_PASSWORD_MIN }) : null);
  if (pe) return res.status(400).json({ error: pe, field: 'password' });
  if (String(confirm ?? '') !== pw) return res.status(400).json({ error: t('me.password.mismatch'), field: 'confirm' });
  if (!(adult === true || adult === '1' || adult === 'on')) return res.status(400).json({ error: t('family.signup.needAdult'), field: 'adult' });
  if (auth.getUserByName(n.value) || auth.isRetiredName(n.value)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' });
  let u, fam;
  try { tx(() => { u = auth.createUser({ username: n.value, password: pw, accountType: 'grownup' }); fam = F.ensureFamily(u); }); }
  catch (e) { if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' }); throw e; }
  if (req.user) auth.endSession(req, res);   // a guest playing on this device: their sign-in ends, their account stays
  auth.startSession(res, u.id, req.headers['user-agent']);
  audit(u.id, 'user.signup', u.id, { grownup: true });
  funnel.bump('parent.signup');
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale);
  if (req.themeSource === 'cookie') saveUserTheme(u, req.theme);
  // A plan picked on /plans comes along: /family then asks for it (password again, then Stripe's Checkout), and "Add your
  // kids" comes after paying. Otherwise a grown-up page they started on (?next=, e.g. /plans via "Who's this for?") is
  // where they go back to, and with neither, "Add your kids" (/family/add, skippable).
  const chosen = chosenPlan(req.body || {});
  res.json({ ok: true, redirect: (!chosen && nextFor(u, wantedNext((req.body || {}).next))) || (chosen ? `/family${choiceQuery(chosen)}` : ADD_AFTER.signup) });
});

// ---------------------------------------------------------------- /family (the grown-up's pages)
router.get('/family', grownupOnly, async (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  // Families off (billing off): no children, links or plans, but the grown-up can still change their language and
  // password and sign out.
  if (!F.familiesOn(req)) {
    const body = html`<div class="pagehead"><h1>👪 ${t('family.page.heading')}</h1>${notYou(req, { plain: true })}</div>
    <section class="panel"><p class="muted"${en('family.page.offAccount')}>${t('family.page.offAccount')}</p>
      <p style="margin-bottom:0"><a class="btn" href="/family/account">⚙️ ${t(navLabel(t, 'account'))}</a></p></section>`;
    return page(req, res, { title: t('family.page.title'), active: 'family', body, scripts: ['/js/family.js'] });
  }
  const fam = F.ensureFamily(u);
  const plan = F.familyPlan(fam.id);
  // Just paid (back from Checkout, the plan on): the next step is adding a child, on "Add your kids".
  if (plan.entitled && (req.query.welcome === '1' || typeof req.query.checkout === 'string')) return res.redirect(302, ADD_AFTER.checkout);
  const kids = F.childrenOf(fam.id);
  const chosen = chosenPlan(req.query);
  // The children the plan pays extra messages for (Basic: the first linked child only).
  const covered = new Set(plan.entitled ? coveredChildren(fam.id, plan.plan) : []);
  const max = F.maxChildrenFor(fam.id);
  const planBox = await planPanel(req, fam, plan, kids, chosen);
  const removeForm = (k, label, confirm) => html`<form data-api="/api/family/children/${F.requestToken(fam.id, k.child_id)}/remove" data-reload data-confirm="${confirm}"><button class="btn" type="submit">${label}</button></form>`;
  const made = F.madeOn(req);
  const rows = kids.map(k => {
    if (k.status === 'pending') {
      return html`<li class="famkid pending"><span class="avatar" style="--s:44px;--c:var(--hover)" aria-hidden="true">⏳</span>
        <div class="famkid-main"><b>${t('family.page.pending')}</b><div class="small muted">${t('family.page.pendingSent', { when: f.ago(k.requested_at) })}</div></div>
        ${removeForm(k, t('family.page.cancel'), t('family.page.cancelConfirm'))}</li>`;
    }
    const use = F.childUsage(fam.id, k.child_id);
    const source = !covered.has(k.child_id) ? 'family.page.sourceFree' : plan.plan === 'basic' ? 'family.page.sourceBasic' : 'family.page.sourceFamily';
    // A child this family made, still on the link made with the account (made_link): never a Remove, whatever
    // PARENT_MADE_CHILDREN says (the grown-up knows the password, so unlinking would leave an account an adult can sign
    // in to; the child leaves with a new password instead). While madeOn, the made-only tools (Delete among them); off,
    // no tools at all. A code-linked child (also one this family made who left and linked again) keeps today's row.
    const madeLink = k.made_link === 1 && k.made_by_family === fam.id, mine = made && madeLink;
    return html`<li class="famkid${mine ? ' famkid-made' : ''}">${avatar({ id: k.child_id, avatar: k.avatar, color: k.color, photo_at: 0, display_name: k.display_name }, 44)}
      <div class="famkid-main"><b><bdi>${k.display_name}</bdi></b> <span class="muted small"><bdi>@${k.username}</bdi></span>
        <div class="small">${t('family.page.yesterday', { n: use.yesterday })} · ${t('family.page.month', { n: use.month })}</div>
        <div class="small muted">${t(source)}</div>${mine ? html`<div class="small muted"${en('family.made.madeByYou')}>${t('family.made.madeByYou')}</div>` : ''}</div>
      ${mine ? madeTools(req, fam, k) : madeLink ? '' : removeForm(k, t('family.page.remove'), t('family.page.removeConfirm', { name: k.display_name }))}</li>`;
  });
  const linked = kids.filter(k => k.status === 'linked');
  // A Family plan switched to Basic keeps every link; only the first linked child gets the extra messages.
  const firstCovered = linked.find(k => covered.has(k.child_id));
  const basicNote = plan.entitled && plan.plan === 'basic' && linked.length > 1 && firstCovered
    ? html`<p class="notice warn" id="basic-note">${tHtml(t, 'family.billing.basicNote', { name: html`<b><bdi>${firstCovered.display_name}</bdi></b>`, max: config.familyMaxChildren })}</p>` : '';
  // One door to "Add your kids" (make an account while madeOn, or link one with the child's code).
  const addKey = made ? 'family.add.cta' : 'family.page.add';
  const addBtn = kids.length < max ? html`<a class="btn btn-primary" href="/family/add"${en(addKey)}>➕ ${t(addKey)}</a>`
    : html`<p class="small">${plan.entitled && plan.plan === 'basic' ? t('family.page.fullBasic', { max: config.familyMaxChildren }) : t('family.page.full', { max })}</p>`;
  const kidsBox = html`<section class="panel" aria-labelledby="kids-h"><h2 id="kids-h">${t('family.page.children')}</h2>
    ${kids.length ? html`<ul class="famkids">${rows}</ul><p class="small muted">${t('family.page.usageNote')}</p>` : html`<p class="muted">${t('family.page.none')}</p>`}
    ${basicNote}${addBtn}
  </section>`;
  // A plan picked on /plans (and not paid yet) comes first: that is what the grown-up came here to do.
  const planFirst = (chosen && !plan.entitled) || (typeof req.query.checkout === 'string' && !plan.entitled);
  const body = html`
  <div class="pagehead"><h1>👪 ${t('family.page.heading')}</h1>${notYou(req, { plain: true })}</div>
  ${familyChecklist(req, { fam, kids, plan, max, sale: await familyOnSale(u) })}
  ${planFirst ? html`${planBox}${kidsBox}` : html`${kidsBox}${planBox}`}
  ${config.contactEmail ? html`<section class="panel" aria-labelledby="help-h"><h2 id="help-h">${t('family.page.helpHeading')}</h2>
    <p>${tHtml(t, 'family.page.help', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p></section>` : ''}`;
  page(req, res, { title: t('family.page.title'), active: 'family', body, scripts: ['/js/family.js'] });
});

// /family/account: the grown-up's own settings (Language, Password, Sign out and Sign out everywhere), moved off /family
// so that page is about the children and the plan. No new settings. Open while families are off too (grownupOnly), so a
// grown-up can always sign out. /family#password, #language and #signout (old bookmarks and links) come here
// (public/js/family.js).
router.get('/family/account', grownupOnly, (req, res) => {
  const t = req.t;
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const body = html`<div class="pagehead"><h1${en('family.account.heading')}>⚙️ ${t('family.account.heading')}</h1>${notYou(req, { plain: true })}</div>
  <div class="mesettings">${languagePanel(req)}${passwordPanel(req)}${signOutPanel(req)}</div>`;
  page(req, res, { title: t(navLabel(t, 'account')), active: 'account', body, back: '/family', backLabel: t('family.page.title') });
});

/**
 * The checklist at the top of /family (the navigation proposal's Week 2; docs/decisions.md "The /family checklist"),
 * for the grown-up only (the page is grownupOnly, and only while families are on):
 *   1. Your grown-up account: always done (they are reading it).
 *   2. Link your child: done once a child is linked; until then how (the child's Me › For grown-ups code) and the link
 *      form, or "waiting for your child to say yes" while a request waits.
 *   3. Pick a plan (optional): done while the family has a plan ("Your plan is on"); otherwise one calm line and a
 *      link to /plans (no "any time" promise: plans are US-only for now), or, while this grown-up can't buy a plan
 *      (familyOnSale), "not on sale yet" and no link. No amounts here: prices are only on /plans.
 * Steps 1–2 done and a plan on (or the grown-up said "Free is fine", families.checklist_hidden_at) -> it folds to a
 * small "All set" line (a <details>, so the steps can still be opened). Straight back from Checkout with the plan on,
 * /family goes on to "Add your kids" (/family/add), which says thank you. Nothing is counted here: the steps are the funnel's own (parent.signup, parent.child,
 * parent.paid, counted where they happen). Its words come in one language: until a language has them, the English is
 * marked as English (lang="en", left to right).
 */
export function familyChecklist(req, { fam, kids, plan, max, sale = true }) {
  const t = req.t;
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const w = (tag, key, attrs = '') => raw(`<${tag}${attrs}${en(key)}>${html`${t(key)}`}</${tag}>`);
  const linked = kids.some(k => k.status === 'linked'), waits = kids.some(k => k.status === 'pending');
  const planOn = !!plan.entitled, hidden = !!fam.checklist_hidden_at;
  const checkoutWait = typeof req.query.checkout === 'string' && !planOn;
  const allSet = linked && (planOn || hidden);
  const step = (n, done, titleKey, detail = '') => html`<li class="famcheck-step${done ? ' done' : ''}">
    <span class="famcheck-mark" aria-hidden="true">${done ? '✓' : n}</span>
    <div class="famcheck-text">${w('b', titleKey)}${done ? html` <span class="sr-only">${t('family.check.done')}</span>` : ''}${detail}</div></li>`;
  let s2 = '';
  // Parent-made accounts on (F.madeOn): step 2 is "Add your child": make their account, or link one they already have.
  const made = F.madeOn(req);
  if (!linked) {
    s2 = waits ? html`<p class="small muted">${t('family.page.pending')}</p>`
      : made ? html`${w('p', 'family.check.step2MadeHow', ' class="small"')}${kids.length < max ? html`<p class="small famcheck-acts"><a href="/family/children/new"${en('family.made.add')}>${t('family.made.add')}</a> · <a href="/family/link"${en('family.check.linkCta')}>${t('family.check.linkCta')}</a></p>` : ''}`
      : html`<p class="small">${tHtml(t, 'family.link.step1')}</p>${kids.length < max ? html`<p class="small"><a href="/family/link"${en('family.check.linkCta')}>${t('family.check.linkCta')}</a></p>` : ''}`;
  }
  let s3;
  if (planOn) s3 = html`<p class="small">${w('span', 'family.check.planOn')}</p>`;
  else if (checkoutWait) s3 = '';
  else {
    // A plan this grown-up can't buy now (not on sale yet, e.g. a test key and not a billing tester) is not promised.
    s3 = html`${w('p', !sale ? 'family.check.notOnSale' : hidden ? 'family.check.staying' : 'family.check.planWhy', ' class="small"')}
      ${sale ? html`<p class="small famcheck-acts"><a href="/plans">${t('family.page.seePlans')}</a></p>` : ''}
      ${linked && !hidden ? html`<form data-api="/api/family/checklist/hide" data-reload class="famcheck-hide"><button class="btn btn-sm" type="submit"${en('family.check.hide')}>${t('family.check.hide')}</button></form>` : ''}`;
  }
  const list = html`<ol class="famcheck-list">
    ${step(1, true, 'family.check.account')}
    ${step(2, linked, made ? 'family.check.step2Made' : 'family.check.link', s2)}
    ${step(3, planOn, 'family.check.plan', s3)}</ol>`;
  if (allSet) {
    return html`<details class="panel famcheck folded" id="famcheck"><summary><span aria-hidden="true">✓</span> ${w('span', 'family.check.allSet')}</summary>${list}</details>`;
  }
  return html`<section class="panel famcheck" id="famcheck" aria-labelledby="famcheck-h">${w('h2', 'family.check.heading', ' id="famcheck-h"')}${list}</section>`;
}

/** The password typed again, inside a payment form. Always there: hidden (and not required) while this sign-in typed it
 *  in the last 10 minutes, so a page left open longer (or brought back from Stripe with Back) can still ask for it: the
 *  server's 403 needPassword makes app.js show it ([data-reauth]). */
export function passwordField(req, id) {
  const t = req.t, fresh = C.reauthFresh(req.sessionId);
  return html`<div class="field" data-reauth ${fresh ? 'hidden' : ''}><label for="${id}">${t('family.billing.password.label')}</label>
    <input class="input" id="${id}" name="password" type="password" dir="ltr" autocomplete="current-password" ${fresh ? '' : 'required'} maxlength="72" aria-describedby="${id}-hint">
    <span class="hint" id="${id}-hint">${t('family.billing.password.hint')}</span><span class="err" id="${id}-err" aria-live="polite"></span></div>`;
}
/** The first day of next month (UTC): when a family's extra messages start again. */
const nextMonthUtc = (t0 = Date.now()) => { const d = new Date(t0); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };

/**
 * The plan card of /family: which plan the family has (Free, Basic or Family) and its state, extra messages left this
 * month, Manage billing (the Customer Portal, where Basic and Family are switched), and Change plan (/plans). A plan
 * picked on /plans and not paid yet is offered here, with everything a grown-up should read before paying (renewal,
 * cancelling, refunds, the plan's limits, tax, US only). Coming back from Checkout (?checkout=…) it waits for the plan.
 */
async function planPanel(req, fam, plan, kids, chosen) {
  const t = req.t, f = req.fmt, u = req.user;
  const sub = plan.subscription;
  const customer = C.mayBill(u) ? customerOf('family', fam.id) : null;
  const portal = customer ? html`<form data-api="/api/billing/portal" class="planform">${passwordField(req, 'pw-portal')}<p class="err form-err" aria-live="polite"></p>
      <button class="btn" type="submit">${t('family.billing.manage')}</button></form>` : '';
  const checkoutId = typeof req.query.checkout === 'string' ? req.query.checkout.slice(0, 200) : '';
  const head = html`<h2 id="plan-h">${t('family.page.yourPlan')}</h2>`;
  // Back from Checkout and the plan isn't on yet: only the wait (no "Free plan", no Subscribe: they just paid).
  if (checkoutId && !plan.entitled) {
    return html`<section class="panel" aria-labelledby="plan-h" id="plan">${head}
      <div class="notice" role="status" data-checkout-wait="${checkoutId}" data-back="${ADD_AFTER.checkout}">
        <p style="margin:0"><span aria-hidden="true">⏳</span> ${t('family.billing.waiting')}</p>
        <div data-slow hidden><p class="small" style="margin:.5em 0 0">${t('family.billing.slow')}</p>
          <p class="small" style="margin:.5em 0 0"><a href="/family">${t('family.billing.back')}</a></p></div></div></section>`;
  }
  const parts = [html`<p class="planname"><span class="planchip${plan.entitled ? ' paid' : ''}">${planName(t, plan.entitled ? plan.plan : null)}</span></p>`];
  if (plan.entitled) {
    const lim = B.planLimits(plan.plan);
    const month = familyMonth(fam.id, today(), { beforeDay: true });
    const left = Math.max(0, lim.extra - month.used);
    let state;
    if (plan.via === 'grant') state = t('family.billing.grant', { date: f.date(plan.grant.until) });
    else if (sub.status === 'past_due') state = t('family.billing.pastDue', { date: f.date(sub.grace_until) });
    else if (sub.cancel_at_period_end) state = t('family.billing.ends', { date: f.date(sub.current_period_end) });
    else state = t(sub.interval === 'year' ? 'family.billing.renewsYearly' : 'family.billing.renewsMonthly', { date: f.date(sub.current_period_end) });
    parts.push(html`<p>${state}</p>
      <p class="planextras"><b>${t('family.billing.extrasLeft', { left, total: lim.extra })}</b><br>
        <span class="small muted">${t('family.billing.extrasReset', { date: f.day(nextMonthUtc()) })}</span></p>
      <p class="small muted">${t(plan.plan === 'basic' ? 'family.billing.coversBasic' : 'family.billing.coversFamily', { max: lim.maxChildren })} ${limitsText(t, { reset: false, extra: lim.extra })}</p>
      ${chosen && chosen.plan !== plan.plan && portal ? html`<p class="notice" role="status">${t('family.billing.switchHow', { plan: planName(t, chosen.plan) })}</p>` : ''}
      <div class="row planbtns">${portal}<a class="btn" href="/plans">${t('family.page.changePlan')}</a></div>`);
  } else {
    const unsettled = C.mayBill(u) && C.unsettledPlan(fam.id);
    parts.push(html`<p>${t('family.page.planFreeText')}</p>`);
    if (unsettled) parts.push(html`<p class="notice warn">${t('family.billing.errors.fixPayment')}</p>`);
    else if (chosen) parts.push(await checkoutForm(req, chosen, fam, kids));
    else parts.push(html`<p><a class="btn btn-primary" href="/plans">${t('family.page.seePlans')}</a></p>`);
    if (portal) parts.push(html`<p class="small muted">${t('family.billing.history')}</p>${portal}`);
  }
  return html`<section class="panel" aria-labelledby="plan-h" id="plan">${head}
    ${parts}</section>`;
}

/** The form that pays for a picked plan: what it gives, the terms, the password again and one button per period (the
 *  picked one first). Not on sale (a test key and not a billing tester, prices unreadable): says so instead. */
async function checkoutForm(req, chosen, fam, kids = []) {
  const t = req.t, f = req.fmt, u = req.user;
  const prices = C.mayBill(u) ? await C.familyPrices(chosen.plan) : null;
  const heading = html`<h3>${t(chosen.plan === 'basic' ? 'family.checkout.headingBasic' : 'family.checkout.headingFamily')}</h3>`;
  const other = html`<p class="small" style="margin-bottom:0"><a href="/plans">${t('family.checkout.other')}</a></p>`;
  if (!prices) return html`<div class="planpick">${heading}<p class="small muted">${t('family.checkout.soon')}</p>${other}</div>`;
  const lim = B.planLimits(chosen.plan);
  // Basic covers one child: with more children already linked (or asked), say before paying which one it covers (the
  // first linked, as coveredChildren counts) and that the others keep the free messages, with the Family plan one tap away.
  let many = '';
  if (chosen.plan === 'basic' && kids.length > 1) {
    const firstId = coveredChildren(fam.id, 'basic')[0];
    const first = firstId && kids.find(k => k.child_id === firstId);
    const toFamily = html`<a href="/family?plan=family&interval=${chosen.interval}#checkout">${t('family.checkout.basicManyLink')}</a>`;
    many = html`<div class="notice warn" id="basic-many"><p style="margin-top:0">${first
      ? tHtml(t, 'family.checkout.basicMany', { name: html`<b><bdi>${first.display_name}</bdi></b>` })
      : t('family.checkout.basicManyPending')}</p><p style="margin-bottom:0">${toFamily}</p></div>`;
  }
  const btn = iv => html`<button class="btn ${iv === chosen.interval ? 'btn-primary' : ''}" type="submit" name="interval" value="${iv}">${t(iv === 'year' ? 'family.billing.subscribeYearly' : 'family.billing.subscribeMonthly', { price: f.money(prices[iv].unitAmount) })}</button>`;
  const order = chosen.interval === 'year' ? ['year', 'month'] : ['month', 'year'];
  return html`<form data-api="/api/billing/family/checkout" class="planform planpick" id="checkout">
    ${heading}<input type="hidden" name="plan" value="${chosen.plan}">
    <p>${chosen.plan === 'basic' ? t('plans.basic.what', { extra: lim.extra }) : t('family.landing.what.p1', { extra: lim.extra, max: lim.maxChildren })}</p>
    ${many}${kids.length ? '' : html`<p class="small">${t('family.checkout.addAfter')}</p>`}
    <ul class="small planterms">
      <li>${t('family.billing.terms.renew')}</li>
      <li>${t('family.billing.terms.cancel')}</li>
      <li>${t('family.billing.terms.refund')}</li>
      <li>${limitsText(t, { extra: lim.extra })}</li>
      <li>${t('family.billing.terms.taxPlans')}</li>
    </ul>
    ${config.termsPublished ? html`<p class="small">${tHtml(t, 'family.billing.terms.agree', { terms: html`<a href="/terms">${t('family.billing.terms.link')}</a>` })}</p>` : html`<p class="small">${tHtml(t, 'family.billing.legal')}</p>`}
    ${passwordField(req, 'pw-checkout')}
    <p class="err form-err" aria-live="polite"></p>
    <div class="row planbtns">${order.map(btn)}</div>
    <p class="small muted">${t('family.billing.stripe')}</p>
    ${other}
  </form>`;
}

// ---------------------------------------------------------------- paying (chunk 4)
/** Billing APIs: families on for this request (BILLING_PUBLIC or the preview cookie) and a grown-up account; anyone
 *  else gets a 404, as if the address weren't there. */
const billingGate = (req, res, next) => (F.familiesOn(req) && auth.isGrownup(req.user) && !req.user.banned ? next() : nope(req, res));
/** With a test key only billing testers may pay or open the Portal (D14). */
const testerGate = (req, res, next) => (C.mayBill(req.user) ? next() : res.status(403).json({ error: req.t('family.billing.errors.notOpen') }));
/** The password typed again within the last 10 minutes (sessions.reauth_at), or in this very request. Wrong
 *  passwords are limited to 5 per 15 minutes per account here, and also count toward the account's sign-in lock
 *  (LOGIN.userFails, like /api/me/password): a locked account takes no password here either, so a device left signed
 *  in gives no more guesses than the sign-in page. */
export const REAUTH_TRIES = { fails: 5, window: 900e3 };
export function stepUp(req, res, next) {
  if (C.reauthFresh(req.sessionId)) return next();
  const t = req.t, key = `reauth-fail:${req.user.id}`, lockKey = loginLockKey(req.user.username);
  if (count(key) >= REAUTH_TRIES.fails || count(lockKey) >= LOGIN.userFails) return res.status(429).json({ error: t('family.errors.tooMany') });
  const pw = String((req.body || {}).password ?? '');
  if (!pw) return res.status(403).json({ error: t('family.billing.password.needed'), field: 'password', needPassword: true });
  if (!auth.verifyPassword(req.user, pw)) {
    allow(key, REAUTH_TRIES.fails, REAUTH_TRIES.window); allow(lockKey, LOGIN.userFails, LOGIN.window);
    return res.status(403).json({ error: t('family.billing.password.wrong'), field: 'password', needPassword: true });
  }
  C.markReauth(req.sessionId);
  next();
}
export const stripeTrouble = (req, res, e) => {
  log('warn', 'billing: Stripe call failed', e instanceof S.StripeCallError ? e.fields : { error: e.message });
  res.status(502).json({ error: req.t('family.billing.errors.stripe') });
};
router.post('/api/billing/family/checkout', billingGate, rateLimit('billing-checkout', 10, 600e3), testerGate, stepUp, async (req, res) => {
  const t = req.t, { interval, plan = 'family' } = req.body || {};
  if ((interval !== 'month' && interval !== 'year') || !C.FAMILY_PLANS.includes(plan)) return res.status(400).json({ error: t('errors.api.badRequest') });
  // Pay first, add children after: no child needs to be linked before paying.
  const fam = F.ensureFamily(req.user);
  try {
    const r = await C.startFamilyCheckout({ family: fam, user: req.user, plan, interval, base: C.baseUrl(req) });
    if (!r.ok) return res.status(409).json({ error: t(`family.billing.errors.${r.code}`) });
    res.json({ ok: true, redirect: r.url });
  } catch (e) { stripeTrouble(req, res, e); }
});
router.post('/api/billing/portal', billingGate, rateLimit('billing-portal', 20, 600e3), testerGate, stepUp, async (req, res) => {
  const fam = F.ensureFamily(req.user);
  try {
    const r = await C.startPortal({ family: fam, user: req.user, base: C.baseUrl(req) });
    if (!r.ok) return res.status(409).json({ error: req.t(`family.billing.errors.${r.code}`) });
    res.json({ ok: true, redirect: r.url });
  } catch (e) { stripeTrouble(req, res, e); }
});
/** The return page's poll: { state: 'active' | 'processing' | 'not_yours' | 'none' }. With ?checkout=<session id> it
 *  also runs the shared sync's fallback, which only trusts the session's own owner. */
router.get('/api/billing/status', billingGate, rateLimit('billing-status', 60, 60e3), async (req, res) => {
  const fam = F.ensureFamily(req.user);
  const id = typeof req.query.checkout === 'string' ? req.query.checkout : '';
  const state = id ? await C.checkoutReturn(fam, id) : F.familyPlan(fam.id).entitled ? 'active' : 'none';
  res.set('Cache-Control', 'no-store').json({ state });
});

/** The hidden field that brings a form's answer back to "Add your kids" (/family/add) instead of /family. */
const backToAdd = then => (then ? html`<input type="hidden" name="then" value="add">` : '');
/** Link a child with their code: the steps and the form. On /family/link and, inline, on "Add your kids" ({ then }). */
function linkForm(req, { then = false } = {}) {
  const t = req.t;
  return html`<ol class="steps"><li>${tHtml(t, 'family.link.step1')}</li><li>${t('family.link.step2Day')}</li><li>${t('family.link.step3')}</li></ol>
    <form data-api="/api/family/link" novalidate>${backToAdd(then)}
      <div class="field"><label for="code">${t('family.link.label')}</label>
        <input class="input codeinput" id="code" name="code" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="K7Q-4MZ9" required><span class="err" id="code-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block" type="submit">${t('family.link.submit')}</button>
    </form>`;
}
router.get('/family/link', grownupOnly, (req, res) => {
  const t = req.t;
  const body = html`<div class="authbox"><div class="panel">
    <h1>${t('family.link.heading')}</h1>
    ${linkForm(req)}</div></div>`;
  page(req, res, { title: t('family.link.title'), active: 'family', back: '/family', backLabel: t('family.page.title'), body, head: raw('<link rel="stylesheet" href="/css/community.css">') });
});

/**
 * "Add your kids" (/family/add): where a new grown-up lands right after signing up (ADD_AFTER.signup) and right after
 * paying (ADD_AFTER.checkout), and the Children panel's add button on /family. Two choices side by side: "Make my
 * child's account" (only while madeOn: the same form, direct notice and boxes as /family/children/new, posting to the
 * same API) and "Link my child's existing account" (the same code form as /family/link, same API). ?how=make|link
 * opens one of them inline (no script needed); their answer comes back here (then=add), where the children added so
 * far are listed (display names, to this grown-up only) with "Add another" while there is room and Done. "I'll do this
 * later" goes to /family, and nothing asks again. A child just made here comes back with ?made=<token>: the step says
 * the account is ready and Switch / Done go on to /family?made=<token> (Switch open), like /family/children/new.
 * Nothing here is about paying: a plan and a child are separate steps.
 */
export const ADD_AFTER = { signup: '/family/add?from=signup', checkout: '/family/add?from=checkout' };
router.get('/family/add', grownupOnly, (req, res) => {
  const t = req.t, u = req.user;
  const en = key => enAttr(t, key);
  const el = (tag, key, attrs = '', vars) => raw(`<${tag}${attrs}${en(key)}>${html`${t(key, vars)}`}</${tag}>`);
  const fam = F.ensureFamily(u);
  const kids = F.childrenOf(fam.id), plan = F.familyPlan(fam.id), max = F.maxChildrenFor(fam.id);
  const made = F.madeOn(req);
  const from = req.query.from === 'signup' || req.query.from === 'checkout' ? req.query.from : '';
  const how = req.query.how === 'make' && made ? 'make' : req.query.how === 'link' || !made ? 'link' : '';
  const room = kids.length < max;
  // Where the step starts from: a thank-you after paying, "your account is ready" after signing up.
  const hello = from === 'checkout' && plan.entitled
    ? html`<p class="notice good" role="status"><span aria-hidden="true">🎉</span> ${t('family.billing.welcomePlan', { plan: planName(t, plan.plan) })}</p>`
    : from === 'signup' ? html`<p class="notice good" role="status"><span aria-hidden="true">✅</span> ${el('span', 'family.add.accountReady')}</p>` : '';
  const added = kids.length ? html`<section class="addkids-added" aria-labelledby="addkids-added-h">${el('h2', 'family.add.added', ' id="addkids-added-h"')}
    <ul class="famkids">${kids.map(k => (k.status === 'pending'
      ? html`<li class="famkid pending"><span class="avatar" style="--s:36px;--c:var(--hover)" aria-hidden="true">⏳</span><div class="famkid-main">${t('family.page.pending')}</div></li>`
      : html`<li class="famkid">${avatar({ id: k.child_id, avatar: k.avatar, color: k.color, photo_at: 0, display_name: k.display_name }, 36)}<div class="famkid-main"><b><bdi>${k.display_name}</bdi></b></div></li>`))}</ul></section>` : '';
  const q = how => `/family/add?${from ? `from=${from}&` : ''}how=${how}#addkids-how`;
  const choice = (key, emoji, sub) => html`<a class="door addkids-choice" href="${q(key)}"${how === key ? raw(' aria-current="true"') : ''}>
    <span class="door-e" aria-hidden="true">${emoji}</span><span class="door-t">${el('span', `family.add.${key}Title`, ' class="door-h"')}${el('span', sub, ' class="door-s"')}</span></a>`;
  let adding;
  if (!room) {
    adding = html`<p class="notice" role="status">${plan.entitled && plan.plan === 'basic' ? t('family.page.fullBasic', { max: config.familyMaxChildren }) : t('family.page.full', { max })}</p>`;
  } else {
    const pickKey = kids.length ? 'family.add.another' : 'family.add.pick';
    const choices = made ? html`${el('h2', pickKey, ' id="addkids-pick-h"')}
      <div class="addkids-choices" role="group" aria-labelledby="addkids-pick-h">${choice('make', '🧒', 'family.add.makeSub')}${choice('link', '🔗', 'family.add.linkSub')}</div>` : '';
    const inner = how === 'make' ? madeFormBox(req, fam, { then: true }) : how === 'link' ? linkForm(req, { then: true }) : '';
    // Parent-made accounts off: linking is the only way, so it is open straight away under its own heading.
    adding = html`${choices}${how ? html`<section class="addkids-how" id="addkids-how" aria-labelledby="addkids-how-h">
      ${el('h2', how === 'make' ? 'family.made.heading' : made ? 'family.add.linkTitle' : kids.length ? 'family.add.another' : 'family.add.linkTitle', ' id="addkids-how-h"')}
      ${how === 'make' ? el('p', 'family.made.intro', ' class="muted small"') : ''}${inner}</section>` : ''}`;
  }
  // Right after making an account here (?made=<token>, as /family gets it from /family/children/new): the child made by
  // this family says it is ready, and Done (and "Switch to <name>") go on to /family?made=<token>, where Switch is open.
  const justMade = made && typeof req.query.made === 'string'
    ? kids.find(k => k.made_link === 1 && k.made_by_family === fam.id && F.requestToken(fam.id, k.child_id) === req.query.made) : null;
  const doneHref = justMade ? `/family?made=${encodeURIComponent(req.query.made)}` : '/family';
  const ready = justMade ? html`<p class="notice good famkid-ready" role="status"${en('family.made.ready')}>✅ ${t('family.made.ready', { name: justMade.display_name })}</p>` : '';
  // Done once a child is added; until then "I'll do this later". Either way /family, and nothing asks again.
  const leave = kids.length ? html`${justMade ? html`<a class="btn btn-primary" href="${doneHref}#made-switch"${en('family.switch.button')}>${t('family.switch.button', { name: justMade.display_name })}</a>` : ''}<a class="btn${justMade ? '' : ' btn-primary'}" href="${doneHref}"${en('family.add.done')}>${t('family.add.done')}</a>`
    : html`<a class="btn" href="/family"${en('family.add.later')}>${t('family.add.later')}</a>`;
  const body = html`<div class="authbox addkids"><div class="panel">
    ${hello}
    ${ready}
    ${el('h1', 'family.add.heading')}
    ${el('p', made ? 'family.add.intro' : 'family.add.introLink', ' class="muted"')}
    ${added}
    ${adding}
    <div class="row addkids-leave">${leave}${kids.length ? '' : el('span', 'family.add.laterNote', ' class="small muted"')}</div>
  </div></div>`;
  page(req, res, { title: t('family.add.title'), active: 'family', back: '/family', backLabel: t('family.page.title'), body, head: raw('<link rel="stylesheet" href="/css/community.css">') });
});

// Typing a child's code: 10 wrong codes per 15 minutes per grown-up (and 60 per address), counted like sign-in
// failures. With ~2.7e10 possible codes that live 1 hour, guessing one is hopeless.
export const LINK_TRIES = { userFails: 10, ipFails: 60, window: 900e3 };
router.post('/api/family/link', grownupOnly, (req, res) => {
  const t = req.t, u = req.user, ip = ipOf(req);
  const uKey = `family-link-fail:${u.id}`, ipKey = `family-link-ip:${ip}`;
  if (count(uKey) >= LINK_TRIES.userFails || count(ipKey) >= LINK_TRIES.ipFails) return res.status(429).json({ error: t('family.errors.tooMany') });
  const code = String((req.body || {}).code || '').trim();
  if (!code) return res.status(400).json({ error: t('family.errors.typeCode'), field: 'code' });
  const r = F.redeem(u, code);
  if (!r.ok) {
    if (r.code === 'badCode') { allow(uKey, LINK_TRIES.userFails, LINK_TRIES.window); allow(ipKey, LINK_TRIES.ipFails, LINK_TRIES.window); }
    const status = r.code === 'notGrownup' ? 404 : r.code === 'badCode' ? 400 : 409;
    return res.status(status).json({ error: t(`family.errors.${r.code === 'notGrownup' || r.code === 'badCode' ? 'badCodeDay' : r.code}`, { max: r.code === 'full' ? F.maxChildrenFor(F.familyOfOwner(u.id)?.id) : config.familyMaxChildren }), field: 'code' });
  }
  res.json({ ok: true, redirect: (req.body || {}).then === 'add' ? '/family/add' : '/family', toast: t('family.link.sent') });
});
// "Free is fine": hides the checklist's plan step for good (the plan card below still has See plans).
router.post('/api/family/checklist/hide', grownupOnly, rateLimit('family-checklist', 20, 60e3), (req, res) => {
  F.hideChecklist(F.ensureFamily(req.user).id);
  res.json({ ok: true });
});
router.post('/api/family/children/:id/remove', grownupOnly, rateLimit('family-remove', 30, 60e3), (req, res) => {
  // A child this family made (on the link made with the account) has no Remove, also while PARENT_MADE_CHILDREN is off:
  // the grown-up knows the password, so unlinking would leave an account an adult can still sign in to (decisions.md).
  if (F.madeChild(req.user, req.params.id)) return res.status(404).json({ error: req.t('family.errors.notFound') });
  const r = F.removeChild(req.user, req.params.id);
  if (!r.ok) return res.status(404).json({ error: req.t('family.errors.notFound') });
  res.json({ ok: true, toast: req.t('family.page.removed') });
});

// ---------------------------------------------------------------- parent-made child accounts (madeOn)
// docs/decisions.md "Parent-made child accounts". Every page and API here: madeOn (families on and PARENT_MADE_CHILDREN=1)
// and the grown-up fence (madeOnly), else a 404 like an unknown address. The APIs are POST with a JSON body (csrfCheck runs
// on every route), behind the grown-up's step-up (their password within 10 minutes) and a flood guard. The child-only
// actions (madeKid) reach only a child this family made and is still linked to; a code-linked child is a 404.
/** Text in a language that doesn't have it yet is marked as English. */
const enAttr = (t, key) => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
/** The tools on a made child's /family row: Switch to <name>, Change <name>'s password, What we keep, Delete. Right after
 *  making the account (?made=<token>) the row says it is ready and Switch is open. */
function madeTools(req, fam, k) {
  const t = req.t, tok = F.requestToken(fam.id, k.child_id), name = k.display_name;
  const en = key => enAttr(t, key);
  const just = req.query.made === tok;
  return html`<div class="famkid-acts">
    ${just ? html`<p class="notice good famkid-ready" role="status"${en('family.made.ready')}>✅ ${t('family.made.ready', { name })}</p>` : ''}
    <details class="famkid-act"${just ? raw(' id="made-switch" open') : ''}><summary class="btn btn-primary"${en('family.switch.button')}>${t('family.switch.button', { name })}</summary>
      <form data-api="/api/family/children/${tok}/switch" novalidate>
        <p class="small"${en('family.switch.device')}>${t('family.switch.device', { name })}</p>
        <div class="field"><label for="sw-${tok}"${en('family.switch.childPw')}>${t('family.switch.childPw', { name })}</label>
          <input class="input" id="sw-${tok}" name="childPassword" type="password" dir="ltr" autocomplete="off" required maxlength="72"><span class="err" id="sw-${tok}-err" aria-live="polite"></span></div>
        ${passwordField(req, `pw-sw-${tok}`)}
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary" type="submit"${en('family.switch.submit')}>${t('family.switch.submit', { name })}</button>
      </form></details>
    <details class="famkid-act"><summary class="btn"${en('family.childPw.button')}>${t('family.childPw.button', { name })}</summary>
      <form data-api="/api/family/children/${tok}/password" data-reset novalidate>
        <div class="field"><label for="cp-${tok}"${en('family.childPw.label')}>${t('family.childPw.label', { name })}</label>
          <input class="input" id="cp-${tok}" name="newPassword" type="password" dir="ltr" autocomplete="new-password" required minlength="6" maxlength="72" aria-describedby="cp-${tok}-hint">
          <span class="hint" id="cp-${tok}-hint"${en('family.made.pwHint')}>${t('family.made.pwHint')}</span><span class="err" id="cp-${tok}-err" aria-live="polite"></span></div>
        <div class="field"><label for="cpc-${tok}"${en('family.made.pwConfirm')}>${t('family.made.pwConfirm')}</label>
          <input class="input" id="cpc-${tok}" name="newConfirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="cpc-${tok}-err" aria-live="polite"></span></div>
        ${passwordField(req, `pw-cp-${tok}`)}
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary" type="submit"${en('family.childPw.submit')}>${t('family.childPw.submit')}</button>
      </form></details>
    <a class="btn" href="/family/children/${tok}/data"${en('family.kept.link')}>${t('family.kept.link')}</a>
    <a class="btn" href="/family/children/${tok}/data#delete"${en('family.kept.deleteLink')}>${t('family.kept.deleteLink')}</a>
  </div>`;
}

/** "Make your child's account" (/family/children/new, and inline on "Add your kids"): the name and password (kid rules), the grown-up's password when the step-up isn't
 *  fresh, the direct notice (family.made.notice.*: a COPPA 312.4 draft for the lawyer), "I've read this", the guardian
 *  statement and the no-consent sentence. Never asks for age, birthday, real name, school, photo, email or phone. */
function madeFormBox(req, fam, { then = false } = {}) {
  const t = req.t;
  const en = key => enAttr(t, key);
  const el = (tag, key, attrs = '', vars) => raw(`<${tag}${attrs}${en(key)}>${html`${t(key, vars)}`}</${tag}>`);
  const cap = F.madeLimit(fam);
  const capText = cap && (cap === 'yearCap' ? t('family.made.errors.yearCap', { max: F.MADE.perYear }) : cap === 'dayCap' ? t('family.made.errors.dayCap', { max: F.MADE.perDay })
    : cap === 'fullBasic' ? t('family.errors.fullBasic') : t('family.errors.full', { max: F.maxChildrenFor(fam.id) }));
  const notice = html`<section class="made-notice" aria-labelledby="made-notice-h">
    ${el('h2', 'family.made.notice.h', ' id="made-notice-h"')}
    <ul class="small">${['keep', 'ai', 'who', 'howLong', 'rights'].map(k => el('li', `family.made.notice.${k}`))}</ul>
    <p class="small" style="margin-bottom:0"><a href="/privacy#made"${en('family.made.notice.more')}>${t('family.made.notice.more')}</a></p></section>`;
  const form = html`<form data-api="/api/family/children/new" novalidate>${backToAdd(then)}
      <div class="field"><label for="made-name"${en('family.made.nameLabel')}>${t('family.made.nameLabel')}</label>
        <input class="input" id="made-name" name="username" dir="ltr" autocomplete="off" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false" aria-describedby="made-name-hint">
        <span class="hint" id="made-name-hint"${en('family.made.nameHint')}>${t('family.made.nameHint')}</span><span class="err" id="made-name-err" aria-live="polite"></span></div>
      <div class="field"><label for="made-pw"${en('family.made.pwLabel')}>${t('family.made.pwLabel')}</label>
        <input class="input" id="made-pw" name="newPassword" type="password" dir="ltr" autocomplete="new-password" required minlength="6" maxlength="72" aria-describedby="made-pw-hint">
        <span class="hint" id="made-pw-hint"${en('family.made.pwHint')}>${t('family.made.pwHint')}</span><span class="err" id="made-pw-err" aria-live="polite"></span></div>
      <div class="field"><label for="made-confirm"${en('family.made.pwConfirm')}>${t('family.made.pwConfirm')}</label>
        <input class="input" id="made-confirm" name="newConfirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="made-confirm-err" aria-live="polite"></span></div>
      ${passwordField(req, 'pw-made')}
      ${notice}
      <div class="field"><label class="checkline"><input type="checkbox" id="made-ack" name="ack" value="1" required> <span${en('family.made.ack')}>${t('family.made.ack')}</span></label><span class="err" id="made-ack-err" aria-live="polite"></span></div>
      <div class="field"><label class="checkline"><input type="checkbox" id="made-guardian" name="guardian" value="1" required> <span${en('family.made.guardian')}>${t('family.made.guardian')}</span></label><span class="err" id="made-guardian-err" aria-live="polite"></span></div>
      ${el('p', 'family.made.noConsent', ' class="small made-noconsent"')}
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block btn-big" type="submit"${en('family.made.submit')}>${t('family.made.submit')}</button>
    </form>`;
  return cap ? html`<p class="notice warn" role="status">${capText}</p>` : form;
}
router.get('/family/children/new', madeOnly, (req, res) => {
  const t = req.t, fam = F.ensureFamily(req.user);
  const el = (tag, key, attrs = '') => raw(`<${tag}${attrs}${enAttr(t, key)}>${html`${t(key)}`}</${tag}>`);
  const body = html`<div class="authbox"><div class="panel">
    ${el('h1', 'family.made.heading')}
    ${el('p', 'family.made.intro', ' class="muted"')}
    ${madeFormBox(req, fam)}
  </div></div>`;
  page(req, res, { title: t('family.made.title'), active: 'family', back: '/family', backLabel: t('family.page.title'), body });
});

/** Refusal codes of F.createChildAccount -> [status, i18n key]. */
const MADE_ERRORS = {
  name: [400, 'errors.api.badRequest'], password: [400, 'errors.api.badRequest'], notGrownup: [404, 'errors.api.notFound'], reported: [409, 'family.made.errors.reported'], slowDown: [429, 'errors.api.slowDown'], tooManySignups: [429, 'auth.api.tooManySignups'],
  yearCap: [409, 'family.made.errors.yearCap'], dayCap: [409, 'family.made.errors.dayCap'], full: [409, 'family.errors.full'], fullBasic: [409, 'family.errors.fullBasic'],
  nameLikeYours: [400, 'family.made.errors.nameLikeYours'], nameTaken: [400, 'auth.api.nameTaken'], mismatch: [400, 'me.password.mismatch'],
  sameAsYours: [400, 'family.made.errors.sameAsYours'], needAck: [400, 'family.made.errors.needAck'], needGuardian: [400, 'family.made.errors.needGuardian'],
};
/** The form's own fields checked before the step-up, all at once (name, password typed twice, the two boxes), with the
 *  grown-up's password when the step-up isn't fresh: one answer lists everything to fix, so nobody goes round the form
 *  once per field. createChildAccount checks every rule again (and the ones that cost more, after the address limits). */
function madeFieldsFirst(req, res, next) {
  const t = req.t, b = req.body || {}, errors = F.childFieldErrors(req.user, { username: b.username, password: b.newPassword, confirm: b.newConfirm, ack: b.ack, guardian: b.guardian }, t);
  const fields = Object.keys(errors);
  if (!fields.length) return next();
  const out = Object.fromEntries(fields.map(f => [f, errors[f].error || t(MADE_ERRORS[errors[f].code][1])]));
  const needPw = !C.reauthFresh(req.sessionId);
  if (needPw && !String(b.password ?? '')) out.password = t('family.billing.password.needed');
  const field = fields[0];
  res.status(400).json({ error: out[field], field, errors: out, ...(needPw ? { needPassword: true } : {}) });
}
router.post('/api/family/children/new', madeOnly, rateLimit('family-child-new', 10, 3600e3), madeFieldsFirst, stepUp, (req, res) => {
  const t = req.t, b = req.body || {};
  const r = F.createChildAccount(req.user, { username: b.username, password: b.newPassword, confirm: b.newConfirm, ack: b.ack, guardian: b.guardian },
    { ip: ipOf(req), t, noticeVersion: LEGAL_UPDATED });
  if (!r.ok) {
    const [status, key] = MADE_ERRORS[r.code] || [400, 'errors.api.badRequest'];
    const fam = F.familyOfOwner(req.user.id);
    const error = r.error || (r.code === 'reported' && config.contactEmail ? t('family.made.errors.reportedContact', { email: config.contactEmail })
      : t(key, { max: r.code === 'dayCap' ? F.MADE.perDay : r.code === 'full' && fam ? F.maxChildrenFor(fam.id) : F.MADE.perYear }));
    return res.status(status).json({ error, ...(r.field ? { field: r.field } : {}) });
  }
  res.json({ ok: true, redirect: `${b.then === 'add' ? '/family/add' : '/family'}?made=${encodeURIComponent(r.token)}`, toast: t('family.made.done', { name: r.child.display_name }) });
});

/** Switch to <child>: a sign-in as the child, never an impersonation. Made accounts only (madeKid); not a banned,
 *  school-managed or non-standard account. The child's current password is needed: wrong tries count toward the
 *  child's own sign-in lock (LOGIN.userFails) and a per-grown-up key (SWITCH_TRIES), so this gives no more guesses than
 *  the sign-in page. Then, in one response: the grown-up's session row is deleted (no second cookie keeps it), a fresh
 *  child session starts (a new id, the child's own SESSION_RULES, no reauth_at), brb_ended is cleared, and the audit
 *  says who switched to whom. The only way back is a real grown-up sign-in. */
export const SWITCH_TRIES = { fails: 5, window: 900e3 };
router.post('/api/family/children/:token/switch', madeOnly, rateLimit('family-switch', 20, 900e3), madeKid, stepUp, (req, res) => {
  const t = req.t, g = req.user, { child } = req.made;
  if (child.banned || child.managed_school || auth.accountKind(child) !== 'standard') return nope(req, res);
  const name = child.display_name, lockKey = loginLockKey(child.username), failKey = `switch-fail:${g.id}`;
  if (count(lockKey) >= LOGIN.userFails || count(failKey) >= SWITCH_TRIES.fails) return res.status(429).json({ error: t('family.errors.tooMany') });
  const pw = String((req.body || {}).childPassword ?? '');
  if (!pw) return res.status(400).json({ error: t('family.switch.errors.need', { name }), field: 'childPassword' });
  if (!auth.verifyPassword(child, pw)) {
    allow(lockKey, LOGIN.userFails, LOGIN.window); allow(failKey, SWITCH_TRIES.fails, SWITCH_TRIES.window);
    return res.status(400).json({ error: t('family.switch.errors.wrong', { name }), field: 'childPassword' });
  }
  audit(g.id, 'family.switch', child.id, { from: g.id, to: child.id });
  auth.endSession(req, res);
  // Marked as a Switch sign-in: the child's first-sign-in card and new-password note wait for a sign-in of their own.
  auth.startSession(res, child.id, req.headers['user-agent'], { via: 'switch' });
  auth.clearEnded(req, res);
  res.json({ ok: true, redirect: '/' });
});

/** The grown-up sets a new password for a child they made: kid rules, typed twice, not the grown-up's own. Every sign-in
 *  of the child ends, their sign-in lock is cleared (as a teacher's reset does), and the child is told once. */
router.post('/api/family/children/:token/password', madeOnly, rateLimit('family-child-pw', 10, 3600e3), madeKid, stepUp, (req, res) => {
  const t = req.t, { child } = req.made, { newPassword: pw, newConfirm } = req.body || {};
  const rule = auth.checkPassword(pw, child.username, t);
  if (rule) return res.status(400).json({ error: rule, field: 'newPassword' });
  if (String(newConfirm ?? '') !== String(pw)) return res.status(400).json({ error: t('me.password.mismatch'), field: 'newConfirm' });
  if (auth.verifyPassword(req.user, pw)) return res.status(400).json({ error: t('family.made.errors.sameAsYours'), field: 'newPassword' });
  F.resetChildPassword(req.user, child, String(pw));
  clearLimit(loginLockKey(child.username));
  res.json({ ok: true, toast: t('family.childPw.done', { name: child.display_name }) });
});

/** The password typed again for a page that needs it ("What we keep"): runs the step-up and only marks the session. */
router.post('/api/family/reauth', madeOnly, rateLimit('family-reauth', 20, 900e3), stepUp, (req, res) => res.json({ ok: true }));

/** "What we keep" for a made child (COPPA 312.6, GDPR Art 15), behind the step-up: counts only, as of the end of
 *  yesterday (UTC), never content (whether a parent may read the child's own chats is a lawyer question: legal-review
 *  item 35). Then Delete (COPPA 312.6, GDPR Art 17): the account's name typed to confirm. */
router.get('/family/children/:token/data', madeOnly, madeKid, (req, res) => {
  const t = req.t, f = req.fmt, { child } = req.made, tok = req.params.token, name = child.display_name;
  const en = key => enAttr(t, key);
  const el = (tag, key, vars = {}, attrs = '') => raw(`<${tag}${attrs}${en(key)}>${html`${t(key, vars)}`}</${tag}>`);
  const head = el('h1', 'family.kept.heading', { name });
  let inner;
  if (!C.reauthFresh(req.sessionId)) {
    inner = html`${el('p', 'family.kept.reauthText', { name })}
      <form data-api="/api/family/reauth" data-reload novalidate>${passwordField(req, 'pw-kept')}<p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary" type="submit"${en('family.kept.reauthSubmit')}>${t('family.kept.reauthSubmit')}</button></form>`;
  } else {
    const c = F.keptCounts(child.id);
    const row = (key, vars) => el('li', `family.kept.rows.${key}`, vars);
    const items = F.GROWNUP_SEES.filter(k => k !== 'extras').map(k => {
      if (k === 'games') return row('games', { n: c.games.n, pub: c.games.public });
      if (k === 'photo') return row(c.photo ? 'photoYes' : 'photoNo');
      if (k === 'signins') return c.signins.length ? html`<li${en('family.kept.rows.signins')}>${t('family.kept.rows.signins', { n: c.signins.length })}<ul>${c.signins.map(s => html`<li><bdi dir="ltr">${s.ua || '?'}</bdi> · ${f.date(s.since)}</li>`)}</ul></li>` : row('signinsNone');
      return row(k, { n: c[k] });
    });
    const school = inSchoolOrClass(child);
    inner = html`${el('p', 'family.kept.introCounts', { name }, ' class="muted"')}
      <ul class="keptlist">${items}
        ${c.madeAt ? row('madeAt', { date: f.date(c.madeAt) }) : ''}${c.notice ? row('notice', { version: c.notice }) : ''}</ul>
      ${el('p', 'family.kept.never', { name }, ' class="small"')}
      <p class="small muted"${en('family.kept.extras')}>${t('family.kept.extras')}</p>
      <section class="kept-delete" id="delete" aria-labelledby="delete-h">${el('h2', 'family.kept.deleteHeading', { name }, ' id="delete-h"')}
        ${school ? el('p', 'family.kept.errors.inSchool', { name }, ' class="notice warn"') : html`${el('p', 'family.kept.deleteTextKeeps', { name })}
        <form data-api="/api/family/children/${tok}/delete" novalidate>
          <div class="field"><label for="del-name"${en('family.kept.confirmLabel')}>${t('family.kept.confirmLabel', { name: child.username })}</label>
            <input class="input" id="del-name" name="confirmName" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="16"><span class="err" id="del-name-err" aria-live="polite"></span></div>
          ${passwordField(req, 'pw-del')}
          <p class="err form-err" aria-live="polite"></p>
          <button class="btn btn-danger" type="submit"${en('family.kept.deleteSubmit')}>${t('family.kept.deleteSubmit')}</button>
        </form>`}</section>`;
  }
  const body = html`<div class="wrap narrow" style="padding:0"><section class="panel">${head}${inner}</section></div>`;
  page(req, res, { title: t('family.kept.title'), active: 'family', back: '/family', backLabel: t('family.page.title'), body });
});
router.post('/api/family/children/:token/delete', madeOnly, rateLimit('family-child-delete', 10, 3600e3), madeKid, stepUp, (req, res) => {
  const t = req.t, { child } = req.made, name = child.display_name;
  if (String((req.body || {}).confirmName ?? '').trim().toLowerCase() !== child.username.toLowerCase()) return res.status(400).json({ error: t('family.kept.errors.confirmName'), field: 'confirmName' });
  const r = deleteAccount(child.id, req.user, { by: 'grownup' });
  if (!r.ok) return r.code === 'inSchool' ? res.status(409).json({ error: t('family.kept.errors.inSchool', { name }) }) : nope(req, res);
  for (const g of r.games) cancelBuild(g, 'deleted');   // a build in one of the child's games stops at once
  res.json({ ok: true, redirect: '/family', toast: t('family.kept.deleted', { name }) });
});
