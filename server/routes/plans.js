// The plans page (docs/decisions.md "Paid plans" §17, the owner's decision of 2026-10-27): /plans, linked from the top
// menu for everyone while paid-plan pages are on (billing on, and BILLING_PUBLIC=1 or the preview cookie), like the
// Plans and Family accounts sections of /parents. Four cards like any pricing page: Free, Basic (one child), Family (up
// to FAMILY_MAX_CHILDREN children) and School, with a monthly / yearly switch. Prices come from Stripe's Price objects
// by lookup key (services/stripe.js caches them), so the page always says what Checkout charges.
//
// Who buys: only a grown-up account (Basic, Family) or a school admin (School). Everyone may look:
//   - signed out: Basic / Family lead to the grown-up sign-up with the plan kept (?plan=…&interval=…), then /family asks
//     for the password again and goes to Stripe's Checkout; children are added after paying.
//   - a kid (own account, guest or school account): a paid plan's button opens a calm panel saying a grown-up buys plans
//     and where (text, not a link). No countdown, no pressure, no "ask now".
//   - school staff and the platform admin: Basic / Family say they are for families and point to the School card.
//   - School: a school admin goes to their school's Billing tab; everyone else to /plans/schools (how to set one up).
// Prices appear only here (and on the grown-up pages): never in the Studio, Me, games or limit messages.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import * as auth from '../auth.js';
import { q } from '../db.js';
import { config } from '../config.js';
import { tHtml, localeInfo, DEFAULT_LOCALE } from '../i18n/index.js';
import { siteHost } from '../site.js';
import * as F from '../services/family.js';
import * as B from '../services/billing.js';
import * as C from '../services/checkout.js';
import * as SC from '../services/schools.js';
import * as SB from '../services/school-billing.js';
import { familyOf } from '../builder/usage.js';
import { limitsText, onSale, planName } from './family.js';

export const router = Router();
const on = (req, res, next) => (F.familiesOn(req) ? next() : notFound(req, res));

/** Who is looking: 'out' (signed out) | 'grownup' | 'staff' (school staff, the platform admin) | 'kid' (own account,
 *  guest, school account). */
export function viewerOf(u) {
  if (!u) return 'out';
  if (auth.isGrownup(u)) return 'grownup';
  if (!u.is_guest && (SC.isSchoolStaff(u) || SC.isPlatformAdmin(u))) return 'staff';
  return 'kid';
}
/** The schools this account is the school admin of (active, not archived), oldest first. */
const adminSchools = u => (u && !u.is_guest ? q.all(`SELECT s.* FROM school_members m JOIN schools s ON s.id=m.school_id
  WHERE m.user_id=? AND m.role='admin' AND m.status='active' AND s.archived_at IS NULL ORDER BY s.created_at`, u.id) : []);
/** Where "Get a school plan" goes: a school admin's own Billing tab, the platform admin's /admin/billing, else the
 *  "for schools" page. */
function schoolTarget(req) {
  const u = req.user;
  const mine = adminSchools(u)[0];
  if (mine && SC.canManageSchool(u, mine.id)) return { href: `/school/${encodeURIComponent(mine.slug)}?tab=billing`, school: mine };
  if (u && SC.isPlatformAdmin(u)) return { href: '/admin/billing', school: null };
  return { href: '/plans/schools', school: null };
}
/** The plan this viewer has now (for the "Your plan" mark): 'free' | 'basic' | 'family' | 'school' | null (nothing is
 *  marked: signed out, and children in a class, who are never shown plans side by side). */
function currentPlan(req, who) {
  const u = req.user;
  if (who === 'out') return null;
  if (who === 'grownup') { const fam = F.familyOfOwner(u.id); const p = fam ? F.familyPlan(fam.id) : null; return p && p.entitled ? p.plan : 'free'; }
  if (who === 'staff') return null;
  if (u.is_guest || SC.inAnySchool(u)) return null;
  const fid = familyOf(u.id);
  return fid ? F.familyPlan(fid).plan || 'free' : 'free';
}

/** An amount in cents for words(): formatted in the sentence's own language (see words). */
const cents = c => ({ cents: c });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** A string of the page in the reader's language; until a language has it, the English is marked as English (lang, and
 *  left to right, so its full stops land on the right side of a right-to-left page), and its prices (cents(…) values)
 *  are written the English way too ("$45.00", never "45.00 $" inside an English sentence). Kids read this page too. */
function words(t, f) {
  const fill = (own, vars) => (vars ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v && typeof v === 'object' && 'cents' in v
    ? (own ? f.money(v.cents) : usd.format((+v.cents || 0) / 100)) : v])) : vars);
  const wrap = (key, s) => (t.own(key) ? s : html`<span lang="en" dir="ltr">${s}</span>`);
  return { T: (key, vars) => wrap(key, t(key, fill(t.own(key), vars))), TH: (key, vars) => wrap(key, tHtml(t, key, fill(t.own(key), vars))) };
}

router.get('/plans', on, async (req, res) => {
  const t = req.t, f = req.fmt, u = req.user, { T, TH } = words(t, f);
  const who = viewerOf(u);
  const interval = req.query.interval === 'year' ? 'year' : 'month';
  const all = await C.planPrices();
  // Basic and Family are on sale nowhere without the "Family" payment method configuration (C.familyPrices's rule):
  // their cards then say "Price coming soon", like a missing price.
  const prices = all && (config.stripePmcFamily ? all : { ...all, basic: null, family: null });
  const mine = currentPlan(req, who);
  // Can this viewer buy Basic / Family here and now? (Kids and staff never buy; their buttons only explain.)
  const buyer = who === 'out' || who === 'grownup';
  const notOnSale = buyer && (!onSale(u) || !config.stripePmcFamily);
  // A plan the platform admin gave (no Stripe customer): it is changed by writing to us, not in Manage billing.
  const granted = who === 'grownup' && (mine === 'basic' || mine === 'family') && F.familyPlan(F.familyOfOwner(u.id).id).via === 'grant';
  const email = config.contactEmail || 'greg@oomba.ai';
  const school = schoolTarget(req);
  const schoolPlan = school.school ? SB.schoolBilling(school.school).plan : null;
  const ask = who === 'kid' || who === 'staff' ? String(req.query.ask || '') : '';
  const yours = html`<span class="plan-yours">${T('plans.yours')}</span>`;

  /** The price line of a family-type plan for the chosen period. */
  const priceOf = plan => {
    const p = prices && prices[plan];
    if (!p) return html`<p class="plan-price"><span class="muted small">${T('plans.noPrice')}</span></p>`;
    const amt = p[interval].unitAmount;
    return html`<p class="plan-price"><span class="amt" dir="ltr">${f.money(amt)}</span> <span class="per">${T(interval === 'year' ? 'plans.perYear' : 'plans.perMonth')}</span></p>
      ${interval === 'year' ? html`<p class="small muted plan-sub">${T('plans.yearAsMonth', { price: cents(Math.round(amt / 12)) })}</p>` : html`<p class="small muted plan-sub">${T('plans.orYearly', { price: cents(p.year.unitAmount) })}</p>`}`;
  };
  /** The button of a paid family-type plan for this viewer. */
  const buyBtn = plan => {
    const label = T(plan === 'basic' ? 'plans.basic.choose' : 'plans.family.choose');
    const q2 = `plan=${plan}&interval=${interval}`;
    // Not on sale to this visitor (or no price): no bright button that ends in "price coming soon" after signing up.
    if (buyer && mine !== plan && (notOnSale || !(prices && prices[plan]))) return html`<p class="plan-soon muted center">${T('plans.soon')}</p>`;
    if (who === 'out') return html`<a class="btn btn-primary btn-block" href="/grown-ups/signup?${q2}">${label}</a>`;
    if (who === 'grownup') {
      if (mine === plan) return html`<a class="btn btn-block" href="/family#plan">${T('plans.manage')}</a>`;
      if (granted) return html`<p class="small muted plan-soon">${TH('plans.grantSwitch', { email: html`<a href="mailto:${email}" dir="ltr">${email}</a>` })}</p>`;
      if (mine === 'basic' || mine === 'family') return html`<a class="btn btn-block" href="/family?${q2}#plan">${T('plans.switch')}</a>`;
      return html`<a class="btn btn-primary btn-block" href="/family?${q2}#checkout">${label}</a>`;
    }
    if (mine === plan) return '';
    return html`<a class="btn btn-block" href="/plans?interval=${interval}&ask=${plan}#ask">${T(who === 'staff' ? 'plans.staff.button' : 'plans.kid.button')}</a>`;
  };
  const lim = { basic: B.planLimits('basic'), family: B.planLimits('family') };
  const items = list => html`<ul class="plan-list">${list.map(s => html`<li><span class="tick" aria-hidden="true">✓</span><span>${s}</span></li>`)}</ul>`;
  const card = ({ id, name, tagline, price, list, button, current, recommended = false }) => html`<section class="plan-card${recommended ? ' recommended' : ''}${current ? ' current' : ''}" id="plan-${id}" aria-labelledby="plan-${id}-h">
    ${recommended ? html`<span class="plan-badge">${T('plans.recommended')}</span>` : ''}
    <h2 id="plan-${id}-h">${name}</h2><p class="plan-tag muted">${tagline}</p>
    ${price}
    ${items(list)}
    <div class="plan-cta">${current ? yours : ''}${button}</div>
  </section>`;

  const freeBtn = who === 'out' || (u && u.is_guest) ? html`<a class="btn btn-block" href="/signup">${T('plans.free.start')}</a>` : '';
  const cards = [
    card({ id: 'free', name: T('plans.free.name'), tagline: T('plans.free.tagline'),
      price: html`<p class="plan-price"><span class="amt" dir="ltr">${new Intl.NumberFormat(localeInfo(req.locale || DEFAULT_LOCALE).intl || 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(0)}</span></p><p class="small muted plan-sub">${T('plans.free.forever')}</p>`,
      list: [T('plans.free.li1'), T('plans.free.li2'), T('plans.free.li3')], button: mine === 'free' ? '' : freeBtn, current: mine === 'free' }),
    card({ id: 'basic', name: T('plans.basic.name'), tagline: T('plans.basic.tagline'), price: priceOf('basic'),
      list: [T('plans.basic.li1'), T('plans.extra', { extra: lim.basic.extra }), T('plans.basic.li3'), T('plans.cancel')], button: buyBtn('basic'), current: mine === 'basic' }),
    card({ id: 'family', name: T('plans.family.name'), tagline: T('plans.family.tagline', { max: lim.family.maxChildren }), price: priceOf('family'), recommended: buyer,
      list: [T('plans.basic.li1'), T('plans.family.extra', { extra: lim.family.extra, max: lim.family.maxChildren }), T('plans.family.li3', { max: lim.family.maxChildren }), T('plans.cancel')], button: buyBtn('family'), current: mine === 'family' }),
    card({ id: 'school', name: T('plans.school.name'), tagline: T('plans.school.tagline'),
      price: prices && prices.school ? html`<p class="plan-price"><span class="amt" dir="ltr">${f.money(prices.school.year.unitAmount)}</span> <span class="per">${T('plans.school.per')}</span></p><p class="small muted plan-sub">${T('plans.school.min', { min: config.schoolMinSeats })}</p>`
        : html`<p class="plan-price"><span class="muted small">${T('plans.noPrice')}</span></p>`,
      list: [T('plans.school.li1', { perSeat: config.schoolTurnsPerSeat }), T('plans.school.li2'), T('plans.school.li3')],
      button: html`<a class="btn btn-block ${school.school ? 'btn-primary' : ''}" href="${school.href}">${school.school && schoolPlan && schoolPlan.entitled ? T('plans.school.manage') : T('plans.school.get')}</a>`,
      current: !!(schoolPlan && schoolPlan.entitled) }),
  ];

  // A kid or a teacher who tapped a paid plan: who buys it, calmly.
  const askPanel = ask === 'basic' || ask === 'family' ? (who === 'kid'
    ? html`<section class="panel plan-ask" id="ask" role="status" aria-labelledby="ask-h"><h2 id="ask-h"><span aria-hidden="true">🧑‍🧒</span> ${T('plans.kid.heading')}</h2>
      <p>${TH('plans.kid.text', { where: html`<bdi dir="ltr"><b>${siteHost(req)}/plans</b></bdi>` })}</p>
      <p class="muted" style="margin-bottom:0">${T('plans.kid.free')}</p></section>`
    : html`<section class="panel plan-ask" id="ask" role="status" aria-labelledby="ask-h"><h2 id="ask-h"><span aria-hidden="true">🏫</span> ${T('plans.staff.heading')}</h2>
      <p>${T('plans.staff.text')}</p><p style="margin-bottom:0"><a class="btn" href="#plan-school">${T('plans.staff.toSchool')}</a></p></section>`) : '';
  // Not on sale to this visitor: said at the top, before any card (a signed-out visitor may still make a grown-up account).
  const soonPanel = notOnSale ? html`<section class="panel plan-ask" id="soon" role="status"><p${who === 'out' ? '' : raw(' style="margin-bottom:0"')}><span aria-hidden="true">⏳</span> ${T('plans.notOnSale')}</p>
    ${who === 'out' ? html`<p style="margin-bottom:0">${T('plans.notOnSaleOut')} <a href="/grown-ups/signup">${T('family.landing.signup')}</a></p>` : ''}</section>` : '';
  const seg = html`<nav class="seg plan-seg" aria-label="${t('plans.interval.label')}">${['month', 'year'].map(iv => html`<a href="/plans?interval=${iv}" ${iv === interval ? raw('aria-current="page"') : ''}>${T(iv === 'year' ? 'plans.interval.year' : 'plans.interval.month')}</a>`)}</nav>`;
  const body = html`<div class="plans">
    <div class="plans-head"><h1>${T('plans.heading')}</h1><p class="lead">${T('plans.intro')}</p>${seg}</div>
    ${askPanel}${soonPanel}
    <div class="plan-grid">${cards}</div>
    <section class="panel plan-fine" aria-labelledby="fine-h"><h2 id="fine-h">${T('plans.fine.h')}</h2>
      <p class="small">${limitsText(t)}</p>
      <p class="small">${T('plans.fine.tax')}</p>
      <p class="small" style="margin-bottom:0">${TH('plans.fine.legal')}</p></section>
  </div>`;
  page(req, res, { title: t('plans.title'), active: 'plans', description: t('plans.description'), body, seo: { index: config.billingPublic, path: '/plans' } });
});

/** The seat calculator's numbers: students as asked (1 to SEAT_CALC_MAX; null when none or not a number), the seats a
 *  plan would have (never fewer than SCHOOL_MIN_SEATS), and the yearly total in cents (null without a Stripe price). */
export const SEAT_CALC_MAX = 100000;
export function seatQuote(students, seatCents) {
  const n = Number(String(students ?? '').trim());
  const asked = String(students ?? '').trim() !== '' && Number.isInteger(n) && n >= 1 ? Math.min(n, SEAT_CALC_MAX) : null;
  const min = config.schoolMinSeats;
  const seats = asked === null ? null : Math.max(asked, min);
  return { students: asked, seats, min, unit: seatCents ?? null, total: seats !== null && Number.isInteger(seatCents) ? seats * seatCents : null };
}

/** For schools: the price, a seat calculator, what a school gets, and how a school is set up (the "Set up my school"
 *  form on /teachers, then paid from its Billing tab). Prices are Stripe's (C.planPrices), never written here. */
router.get('/plans/schools', on, async (req, res) => {
  const t = req.t, f = req.fmt, { T, TH } = words(t, f);
  const prices = await C.planPrices();
  const target = schoolTarget(req);
  const email = config.contactEmail || 'greg@oomba.ai';
  const mail = html`<a href="mailto:${email}" dir="ltr">${email}</a>`;
  const lessons = Math.floor(config.schoolTurnsPerSeat / SB.LESSON_MESSAGES);
  const seat = prices && prices.school ? prices.school.year.unitAmount : null;
  const quote = seatQuote(req.query.students, seat);
  const shown = quote.students ?? config.schoolMinSeats;
  const calc = seat === null ? '' : html`<section class="panel seatcalc" id="calc" aria-labelledby="calc-h"><h2 id="calc-h">${T('plans.schools.calc.h')}</h2>
      <form method="get" action="/plans/schools#calc" class="row">
        <div class="field"><label for="calc-students">${T('plans.schools.calc.label')}</label>
          <input class="input" id="calc-students" name="students" type="number" inputmode="numeric" min="1" max="${SEAT_CALC_MAX}" step="1" required value="${shown}"></div>
        <button class="btn" type="submit">${T('plans.schools.calc.button')}</button>
      </form>
      ${quote.total !== null ? html`<p class="seatcalc-out" role="status">${TH('plans.schools.calc.result', { seats: quote.seats, price: cents(seat), total: html`<b>${f.money(quote.total)}</b>` })}</p>` : ''}
      ${quote.students !== null && quote.students < quote.min ? html`<p class="small">${T('plans.schools.calc.min', { min: quote.min })}</p>` : ''}
      <p class="small muted">${T('plans.schools.calc.tax')}</p>
      <p style="margin-bottom:0"><a class="btn btn-primary" href="/plans/schools/print?students=${shown}">🖨️ ${T('plans.schools.calc.print')}</a></p>
      <p class="small muted" style="margin:var(--s2) 0 0">${T('plans.schools.calc.printHint')}</p></section>`;
  const body = html`<div class="wrap narrow" style="padding:0"><h1>🏫 ${T('plans.schools.heading')}</h1>
    <p class="lead">${T('plans.schools.intro')}</p>
    <section class="panel"><h2>${T('plans.schools.what.h')}</h2>
      ${seat !== null ? html`<p>${t('school.billing.price', { price: f.money(seat), min: config.schoolMinSeats, perSeat: config.schoolTurnsPerSeat })}</p>` : ''}
      <p>${t('school.billing.priceLessons', { count: lessons })}</p>
      <p>${T('plans.schools.what.p1')}</p></section>
    ${calc}
    <section class="panel"><h2>${T('plans.schools.how.h')}</h2>
      <ol class="steps"><li>${TH('plans.schools.how.li1form', { href: '/teachers#start' })}</li><li>${T('plans.schools.how.li2day')}</li><li>${T('plans.schools.how.li3')}</li></ol>
      ${target.school ? html`<p style="margin-bottom:0"><a class="btn btn-primary" href="${target.href}">${T('plans.schools.toBilling')}</a></p>` : ''}</section>
    <section class="panel" id="contact"><h2>${T('plans.schools.contact.h')}</h2><p style="margin-bottom:0">${TH('plans.schools.contact.p1', { email: mail })}</p></section>
    <p class="small">${tHtml(t, 'school.billing.legal')}</p></div>`;
  page(req, res, { title: t('plans.schools.title'), back: '/plans', backLabel: t('plans.title'), active: 'plans', description: t('plans.schools.description'), body, seo: { index: config.billingPublic, path: '/plans/schools' } });
});

/** "Send this to my admin": one printable page (the print stylesheet hides the menus) with the seat price, the total
 *  for the students asked, and how to set up, for whoever pays at the school. Never indexed. */
router.get('/plans/schools/print', on, async (req, res) => {
  const t = req.t, f = req.fmt, { T, TH } = words(t, f);
  const prices = await C.planPrices();
  const seat = prices && prices.school ? prices.school.year.unitAmount : null;
  const quote = seatQuote(req.query.students ?? config.schoolMinSeats, seat);
  const email = config.contactEmail || 'greg@oomba.ai';
  const host = siteHost(req);
  const row = (k, v, ltr = true) => html`<tr><th scope="row">${T(k)}</th><td${ltr ? raw(' dir="ltr"') : ''}>${v}</td></tr>`;
  const body = html`<div class="printdoc">
    <div class="row printbar"><button class="btn btn-primary" type="button" data-print>🖨️ ${T('plans.schools.print.printButton')}</button>
      <a class="btn" href="/plans/schools?students=${quote.students ?? config.schoolMinSeats}#calc">${T('plans.schools.print.back')}</a></div>
    <h1>🏫 ${T('plans.schools.print.heading')}</h1>
    <p class="lead">${T('plans.schools.print.intro')}</p>
    <section class="panel"><h2>${T('plans.schools.print.cost')}</h2>
      ${seat === null ? html`<p style="margin-bottom:0">${T('plans.noPrice')}</p>` : html`<div class="tblwrap"><table class="tbl"><tbody>
        ${row('plans.schools.print.perStudent', f.money(seat))}
        ${row('plans.schools.print.minimum', T('plans.schools.print.minimumN', { min: quote.min }), false)}
        ${row('plans.schools.print.students', String(quote.seats))}
        ${row('plans.schools.print.total', html`<b>${f.money(quote.total)}</b>`)}
      </tbody></table></div>
      <p class="small" style="margin:var(--s3) 0 0">${T('plans.schools.print.estimate', { date: f.date(Date.now()) })}</p>`}</section>
    <section class="panel"><h2>${T('plans.schools.what.h')}</h2>
      <p>${t('school.billing.priceLessons', { count: Math.floor(config.schoolTurnsPerSeat / SB.LESSON_MESSAGES) })}</p>
      <p style="margin-bottom:0">${T('plans.schools.what.p1')}</p></section>
    <section class="panel"><h2>${T('plans.schools.print.setup')}</h2>
      <ol class="steps"><li>${TH('plans.schools.print.li1', { url: html`<bdi dir="ltr"><b>${host}/teachers</b></bdi>` })}</li><li>${T('plans.schools.how.li2day')}</li><li>${T('plans.schools.how.li3')}</li></ol>
      <p style="margin-bottom:0">${TH('plans.schools.print.contact', { email: html`<bdi dir="ltr">${email}</bdi>` })}</p></section>
  </div>`;
  page(req, res, { title: t('plans.schools.print.title'), back: '/plans/schools', backLabel: t('plans.schools.title'), active: 'plans', description: t('plans.schools.description'), body, bodyClass: 'printpage', scripts: ['/js/print.js'], seo: { index: false, path: '/plans/schools/print' } });
});
