// Grown-up accounts and family links (docs/decisions.md "Paid plans", chunk 3; rules in server/services/family.js).
//   /grown-ups              public page about family accounts (linked only from /parents), sign-up and sign-in
//   /family, /family/link   the grown-up's own pages
//   /api/me/family/*        the child's side, from the "For grown-ups" panel on /me
// Everything here answers 404 while billing is off (no STRIPE_API_KEY), except that grown-up accounts stay fenced in and
// keep a small /family page with their language, password and Sign out (so a grown-up can always sign out).
//
// The fence (grownupGuard, before every other route): a grown-up account can play games and look after its family,
// nothing else. It is a list of what they may open; everything else (the Builder, Studio, friends, chat, profiles,
// classes, schools, admin, ...) is a 404, as if the page weren't there. No payments in this chunk.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { avatar, notYou } from '../views/components.js';
import * as auth from '../auth.js';
import { audit, tx } from '../db.js';
import { config } from '../config.js';
import * as F from '../services/family.js';
import * as S from '../services/stripe.js';
import { rateLimit, allow, count, ipOf } from '../services/ratelimit.js';
import { tHtml, saveUserLang } from '../i18n/index.js';
import { saveUserTheme } from '../theme.js';
import { siteHost } from '../site.js';
import { SIGNUP, wantedNext, passwordPanel, signOutPanel, languagePanel } from './auth.js';

export const router = Router();
const isApi = req => req.originalUrl.startsWith('/api/');
const nope = (req, res) => (isApi(req) ? res.status(404).json({ error: req.t('errors.api.notFound') }) : notFound(req, res));

// ---------------------------------------------------------------- the fence
// What a grown-up may open: game pages and play, search, the grown-up and info pages, signing in and out, their own
// password and theme, and the family routes. Game calls a play page makes (save, score, ...) are allowed; a grown-up's
// score is never stored (routes/games.js), so they are on no leaderboard.
const GROWNUP_GET = [/^\/$/, /^\/search$/, /^\/api\/(search|live|me)$/, /^\/(g|play)\/[^/]+$/, /^\/(frame|shots|avatars)\/[^/]+$/,
  /^\/(parents|safety)$/, /^\/grown-ups(\/(signup|login))?$/, /^\/family(\/link)?$/, /^\/(login|signup)$/, /^\/api\/games\/[^/]+\/(save|leaderboard)$/];
const GROWNUP_POST = [/^\/api\/auth\/(login|logout|logout-everywhere)$/, /^\/api\/me\/(password|theme)$/, /^\/api\/family\/(link|children\/[^/]+\/remove)$/,
  /^\/api\/games\/[^/]+\/(play|heartbeat|leave|save|score|report)$/];
/** May a grown-up account use this method and path? */
export function grownupMay(method, path) {
  const list = method === 'GET' || method === 'HEAD' ? GROWNUP_GET : method === 'POST' ? GROWNUP_POST : [];
  return list.some(re => re.test(path));
}
export function grownupGuard(req, res, next) {
  if (!auth.isGrownup(req.user)) return next();
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/me') return res.redirect(302, '/family');
  if (grownupMay(req.method, req.path)) return next();
  nope(req, res);
}
/** Where a sign-in may go back to (?next=): a grown-up only to a page they may open (not just '/'), a child never to a
 *  family page. -> the path, or null for "their own home". */
export function nextFor(u, next) {
  if (!next) return null;
  const path = next.split(/[?#]/)[0];
  if (auth.isGrownup(u)) return path !== '/' && grownupMay('GET', path) ? next : null;
  return /^\/(family|grown-ups)(\/|$)/.test(path) ? null : next;
}

// ---------------------------------------------------------------- gates
const on = (req, res, next) => (F.familiesOn() ? next() : nope(req, res));
/** The grown-up's pages: signed out -> the grown-up sign-in; anyone else -> 404. While families are off, only a
 *  grown-up's own /family page is there (to sign out and change the password); /family/link and the APIs are 404. */
function grownupOnly(req, res, next) {
  if (!F.familiesOn() && !(auth.isGrownup(req.user) && req.method === 'GET' && req.path === '/family')) return nope(req, res);
  if (auth.isGrownup(req.user)) return next();
  if (!isApi(req) && (!req.user || req.user.is_guest)) return res.redirect(`/grown-ups/login?next=${encodeURIComponent(req.originalUrl)}${req.sessionEnded ? '&signedout=1' : ''}`);
  nope(req, res);
}
/** The child's side: only own kid accounts (never guests, school accounts, staff or grown-ups). */
const childOnly = (req, res, next) => (F.familiesOn() && F.isChildAccount(req.user) ? next() : nope(req, res));

// ---------------------------------------------------------------- the child's "For grown-ups" panel on /me
/** Neutral and always there for own accounts: no plans, messages or money. Empty for everyone else. */
export function meFamilyPanel(req) {
  const t = req.t, u = req.user;
  if (!F.familiesOn() || !F.isChildAccount(u)) return '';
  // Safety words a child must be able to read: until a language has them, the English is marked as English (lang, and
  // left to right so its full stops land on the right side on a right-to-left page).
  const say = (key, s) => (t.own(key) ? s : html`<span lang="en" dir="ltr">${s}</span>`);
  const k = (key, vars) => say(key, t(key, vars));
  const kh = (key, vars) => say(key, tHtml(t, key, vars));
  const head = html`<h2 id="fam-h"><span aria-hidden="true">🧑‍🧒</span> ${k('me.family.heading')}</h2>`;
  const form = (action, label, { cls = 'btn', confirm = '', extra = '' } = {}) => html`<form data-api="/api/me/family/${action}" data-reload data-confirm="${confirm}">${extra}<button class="${cls}" type="submit">${label}</button></form>`;
  const r = F.liveRowOf(u.id);
  let inner;
  if (r && r.status === 'linked') {
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
        <p class="small">${kh('me.family.codeHow', { where: html`<bdi dir="ltr">${where}</bdi>` })}</p>
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
router.post('/api/me/family/unlink', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => {
  const r = F.childLeaves(req.user);
  if (!r.ok) return childErr(req, res, 'nothing', 409);
  res.json({ ok: true, toast: req.t('me.family.done.unlink') });
});
router.post('/api/me/family/report', childOnly, rateLimit('family-answer', 30, 60e3), (req, res) => {
  const r = F.childLeaves(req.user, { reportIt: true });
  if (!r.ok) return childErr(req, res, 'nothing', 409);
  res.json({ ok: true, toast: req.t('me.family.done.reportLinked') });
});

// ---------------------------------------------------------------- /grown-ups (public)
const PANEL_STYLE = 'wrap narrow';
async function familyPrices() {
  if (!S.billingOn()) return null;
  try {
    const p = await S.prices();
    const m = p[S.PRICE_LOOKUP_KEYS.familyMonthly], y = p[S.PRICE_LOOKUP_KEYS.familyYearly];
    return m && y ? { monthly: m.unitAmount, yearly: y.unitAmount } : null;
  } catch { return null; }
}
router.get('/grown-ups', on, async (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  const prices = await familyPrices();
  const qa = k => html`<h3>${t(`family.landing.faq.${k}.q`)}</h3><p>${t(`family.landing.faq.${k}.a`)}</p>`;
  const actions = auth.isGrownup(u) ? html`<a class="btn btn-primary" href="/family">${t('family.landing.toFamily')}</a>`
    : html`<a class="btn btn-primary" href="/grown-ups/signup">${t('family.landing.signup')}</a><a class="btn" href="/grown-ups/login">${t('family.landing.login')}</a>`;
  const body = html`<div class="${PANEL_STYLE}" style="padding:0">
    <h1>👪 ${t('family.landing.heading')}</h1>
    <p class="lead">${t('family.landing.intro')}</p>
    <div class="row" style="margin-bottom:16px">${actions}</div>
    <section class="panel"><h2>${t('family.landing.what.h')}</h2>
      <p>${t('family.landing.what.p1', { extra: config.familyExtraMessages, max: config.familyMaxChildren })}</p>
      <p>${t('family.landing.what.p2')}</p></section>
    <section class="panel"><h2>${t('family.landing.price.h')}</h2>
      ${prices ? html`<p>${t('family.landing.price.p1', { monthly: f.money(prices.monthly), yearly: f.money(prices.yearly) })}</p>` : ''}
      <p>${t('family.landing.price.soon')}</p>
      <p class="muted">${t('family.landing.price.us')}</p></section>
    <section class="panel"><h2>${t('family.landing.how.h')}</h2>
      <ol class="steps"><li>${t('family.landing.how.p1')}</li><li>${tHtml(t, 'family.landing.how.p2')}</li><li>${t('family.landing.how.p3')}</li></ol></section>
    <section class="panel faq"><h2>${t('family.landing.faq.h')}</h2>
      ${qa('cancel')}${qa('store')}${qa('see')}
      <h3>${t('family.landing.faq.reset.q')}</h3><p>${t('family.landing.faq.reset.a')} <span data-utc-midnight hidden>${tHtml(t, 'family.landing.faq.reset.local', { time: html`<time data-time></time>` })}</span></p>
      ${qa('consent')}</section>
  </div>`;
  page(req, res, { title: t('family.landing.title'), back: '/parents', backLabel: t('layout.footer.parents'), description: t('family.landing.description'), body, scripts: ['/js/family.js'] });
});

/** A grown-up sign-up or sign-in box. Someone signed in with a kid account is asked to sign out first. */
function grownupAuthPage(req, res, mode) {
  const t = req.t, u = req.user, isSignup = mode === 'signup';
  if (auth.isGrownup(u)) return res.redirect(nextFor(u, wantedNext(req.query.next)) || '/family');
  const next = nextFor({ account_type: 'grownup' }, wantedNext(req.query.next)) || '/family';
  const signedInKid = u && !u.is_guest;
  const min = auth.STAFF_PASSWORD_MIN;
  const form = isSignup ? html`<form data-api="/api/grown-ups/signup" novalidate>
      <div class="field"><label for="username">${t('family.signup.nameLabel')}</label>
        <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false">
        <span class="hint">${t('family.signup.nameHint')}</span><span class="err" id="username-err" aria-live="polite"></span></div>
      <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
        <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="${min}" maxlength="72" aria-describedby="password-hint">
        <span class="hint" id="password-hint">${t('family.signup.passwordHint', { min })}</span><span class="err" id="password-err" aria-live="polite"></span></div>
      <div class="field"><label for="confirm">${t('family.signup.confirmLabel')}</label>
        <input class="input" id="confirm" name="confirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="confirm-err" aria-live="polite"></span></div>
      <div class="field"><label class="checkline"><input type="checkbox" id="adult" name="adult" value="1" required> <span>${t('family.signup.adult')}</span></label><span class="err" id="adult-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('family.signup.submit')}</button>
    </form>
    <p class="center small" style="margin-top:16px">${t('family.signup.haveAccount')} <a href="/grown-ups/login">${t('family.landing.login')}</a></p>`
    : html`<form data-api="/api/auth/login" novalidate><input type="hidden" name="next" value="${next}">
      <div class="field"><label for="username">${t('family.signup.nameLabel')}</label>
        <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required maxlength="16" autocapitalize="off" spellcheck="false"><span class="err" id="username-err" aria-live="polite"></span></div>
      <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
        <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="current-password" required><span class="err" id="password-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('family.login.submit')}</button>
    </form>
    ${config.contactEmail ? html`<p class="small muted" style="margin-top:12px">${tHtml(t, 'family.login.forgot', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p>` : ''}
    <p class="center small" style="margin-top:16px">${t('family.login.newHere')} <a href="/grown-ups/signup">${t('family.landing.signup')}</a></p>`;
  const body = html`<div class="authbox"><div class="panel">
    <h1 class="center">${isSignup ? t('family.signup.heading') : t('family.login.heading')}</h1>
    <p class="center muted">${isSignup ? t('family.signup.intro') : t('family.login.intro')}</p>
    ${!isSignup && (req.query.signedout === '1' || req.sessionEnded) ? html`<p class="notice warn" role="status">${t('auth.page.signedOut')}</p>` : ''}
    ${signedInKid ? html`<div class="notice warn"><p style="margin-top:0">${tHtml(t, 'family.signup.signedIn', { name: html`<b><bdi>${u.display_name}</bdi></b>` })}</p>
      <form data-api="/api/auth/logout"><input type="hidden" name="next" value="${req.path}"><button class="btn" type="submit">${t('me.signOut.button')}</button></form></div>` : form}
  </div></div>`;
  page(req, res, { title: isSignup ? t('family.signup.title') : t('family.login.title'), back: '/grown-ups', backLabel: t('family.landing.title'), body });
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
  const n = auth.cleanName(username, t); if (!n.ok) return res.status(400).json({ error: n.error, field: 'username' });
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
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale);
  if (req.themeSource === 'cookie') saveUserTheme(u, req.theme);
  res.json({ ok: true, redirect: '/family' });
});

// ---------------------------------------------------------------- /family (the grown-up's pages)
router.get('/family', grownupOnly, (req, res) => {
  const t = req.t, f = req.fmt, u = req.user;
  // Families off (billing off): no children, links or plans, but the grown-up can still change their language and
  // password and sign out.
  if (!F.familiesOn()) {
    const body = html`<div class="pagehead"><h1>👪 ${t('family.page.heading')}</h1>${notYou(req, { plain: true })}</div>
    <section class="panel"><p class="muted" style="margin:0">${t('family.page.off')}</p></section>
    <div class="mesettings">${languagePanel(req)}${passwordPanel(req)}${signOutPanel(req)}</div>`;
    return page(req, res, { title: t('family.page.title'), active: 'family', body });
  }
  const fam = F.ensureFamily(u);
  const kids = F.childrenOf(fam.id);
  const plan = F.familyPlan(fam.id);
  const linkedN = kids.length;
  const removeForm = (k, label, confirm) => html`<form data-api="/api/family/children/${F.requestToken(fam.id, k.child_id)}/remove" data-reload data-confirm="${confirm}"><button class="btn" type="submit">${label}</button></form>`;
  const rows = kids.map(k => {
    if (k.status === 'pending') {
      return html`<li class="famkid pending"><span class="avatar" style="--s:44px;--c:var(--hover)" aria-hidden="true">⏳</span>
        <div class="famkid-main"><b>${t('family.page.pending')}</b><div class="small muted">${t('family.page.pendingSent', { when: f.ago(k.requested_at) })}</div></div>
        ${removeForm(k, t('family.page.cancel'), t('family.page.cancelConfirm'))}</li>`;
    }
    const use = F.childUsage(fam.id, k.child_id);
    return html`<li class="famkid">${avatar({ id: k.child_id, avatar: k.avatar, color: k.color, photo_at: 0, display_name: k.display_name }, 44)}
      <div class="famkid-main"><b><bdi>${k.display_name}</bdi></b> <span class="muted small"><bdi>@${k.username}</bdi></span>
        <div class="small">${t('family.page.yesterday', { n: use.yesterday })} · ${t('family.page.month', { n: use.month })}</div>
        <div class="small muted">${plan.entitled ? t('family.page.sourceFamily') : t('family.page.sourceFree')}</div></div>
      ${removeForm(k, t('family.page.remove'), t('family.page.removeConfirm', { name: k.display_name }))}</li>`;
  });
  const body = html`
  <div class="pagehead"><h1>👪 ${t('family.page.heading')}</h1>${notYou(req, { plain: true })}</div>
  <section class="panel" aria-labelledby="kids-h"><h2 id="kids-h">${t('family.page.children')}</h2>
    ${kids.length ? html`<ul class="famkids">${rows}</ul><p class="small muted">${t('family.page.usageNote')}</p>` : html`<p class="muted">${t('family.page.none')}</p>`}
    ${linkedN < config.familyMaxChildren ? html`<a class="btn btn-primary" href="/family/link">➕ ${t('family.page.add')}</a>` : html`<p class="small">${t('family.page.full', { max: config.familyMaxChildren })}</p>`}
  </section>
  <section class="panel" aria-labelledby="plan-h"><h2 id="plan-h">${t('family.page.planHeading')}</h2>
    <p>${plan.entitled ? t('family.page.planActive') : t('family.page.planNone')}</p>
    <a href="/grown-ups">${t('family.page.planMore')}</a></section>
  ${config.contactEmail ? html`<section class="panel" aria-labelledby="help-h"><h2 id="help-h">${t('family.page.helpHeading')}</h2>
    <p>${tHtml(t, 'family.page.help', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p></section>` : ''}
  <div class="mesettings">${languagePanel(req)}${passwordPanel(req)}${signOutPanel(req)}</div>`;
  page(req, res, { title: t('family.page.title'), active: 'family', body });
});
router.get('/family/link', grownupOnly, (req, res) => {
  const t = req.t;
  const body = html`<div class="authbox"><div class="panel">
    <h1>${t('family.link.heading')}</h1>
    <ol class="steps"><li>${tHtml(t, 'family.link.step1')}</li><li>${t('family.link.step2')}</li><li>${t('family.link.step3')}</li></ol>
    <form data-api="/api/family/link" novalidate>
      <div class="field"><label for="code">${t('family.link.label')}</label>
        <input class="input codeinput" id="code" name="code" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="K7Q-4MZ9" required><span class="err" id="code-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-block" type="submit">${t('family.link.submit')}</button>
    </form></div></div>`;
  page(req, res, { title: t('family.link.title'), active: 'family', back: '/family', backLabel: t('family.page.title'), body, head: raw('<link rel="stylesheet" href="/css/community.css">') });
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
    return res.status(status).json({ error: t(`family.errors.${r.code === 'notGrownup' ? 'badCode' : r.code}`, { max: config.familyMaxChildren }), field: 'code' });
  }
  res.json({ ok: true, redirect: '/family', toast: t('family.link.sent') });
});
router.post('/api/family/children/:id/remove', grownupOnly, rateLimit('family-remove', 30, 60e3), (req, res) => {
  const r = F.removeChild(req.user, req.params.id);
  if (!r.ok) return res.status(404).json({ error: req.t('family.errors.notFound') });
  res.json({ ok: true, toast: req.t('family.page.removed') });
});
