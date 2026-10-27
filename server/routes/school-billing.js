// School plans (docs/decisions.md "Paid plans" §5; rules in server/services/school-billing.js): the Billing tab of a
// school's page and its APIs. Only school admins and the platform admin (canManageSchool) see either, and only while
// paid-plan pages are on for this request (billing on, and BILLING_PUBLIC=1 or the preview cookie), like the family
// pages; everyone else gets a 404, as if the address weren't there. While the Stripe key is a test key only billing
// testers (and the platform admin) may pay. Paying, changing students and Manage billing need the password typed again.
//   /api/billing/school/:id/checkout        Pay by card (Stripe-hosted Checkout, quantity = students)
//   /api/billing/school/:id/seats           more students now, or next year's students
//   /api/billing/school/:id/portal          Manage billing (Stripe's Customer Portal)
//   /api/billing/school/:id/invoice-request ask for an invoice (D7); .../cancel withdraws it
//   /api/billing/school/:id/status          the return page's poll after Checkout
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { isGrownup } from '../auth.js';
import { config } from '../config.js';
import { tHtml } from '../i18n/index.js';
import { rateLimit } from '../services/ratelimit.js';
import * as SC from '../services/schools.js';
import * as F from '../services/family.js';
import * as S from '../services/stripe.js';
import * as C from '../services/checkout.js';
import * as SB from '../services/school-billing.js';
import { stepUp, passwordField, stripeTrouble } from './family.js';

export const router = Router();
const LESSONS_PER_SEAT = () => Math.floor(config.schoolTurnsPerSeat / SB.LESSON_MESSAGES);

/** May this request see the school's Billing tab? */
export const billingTabOn = (req, school) => !!school && F.familiesOn(req) && SC.canManageSchool(req.user, school.id) && !isGrownup(req.user);

const nope = (req, res) => res.status(404).json({ error: req.t('school.errors.notFound') });
/** The school of /api/billing/school/:id, when this request may manage its plan (else 404). */
function schoolGate(req, res, next) {
  const s = SC.getSchool(req.params.id);
  if (!s || s.archived_at || !req.user || req.user.is_guest || req.user.banned || !billingTabOn(req, s)) return nope(req, res);
  req.school = s;
  next();
}
/** With a test key only billing testers and the platform admin may pay (D14). */
const testerGate = (req, res, next) => (C.mayBill(req.user) ? next() : res.status(403).json({ error: req.t('school.billing.notOpen') }));
const fail = (req, res, r, status = 409) => res.status(status).json({
  error: req.t(`school.billing.errors.${r.code}`, { min: config.schoolMinSeats, max: SB.MAX_SEATS }), ...(r.field ? { field: r.field } : {}),
});
const tabUrl = s => `/school/${encodeURIComponent(s.slug)}?tab=billing`;

router.post('/api/billing/school/:id/checkout', schoolGate, rateLimit('billing-checkout', 10, 600e3), testerGate, stepUp, async (req, res) => {
  const seats = SB.seatsFrom((req.body || {}).seats);
  try {
    const r = await SB.startSchoolCheckout({ school: req.school, user: req.user, seats, base: C.baseUrl(req) });
    if (!r.ok) return fail(req, res, r, r.code === 'minSeats' ? 400 : 409);
    res.json({ ok: true, redirect: r.url });
  } catch (e) { stripeTrouble(req, res, e); }
});
router.post('/api/billing/school/:id/seats', schoolGate, rateLimit('billing-seats', 20, 600e3), testerGate, stepUp, async (req, res) => {
  const b = req.body || {};
  const seats = SB.seatsFrom(b.seats);
  const when = b.when === 'renewal' ? 'renewal' : 'now';
  try {
    const r = await SB.changeSeats({ school: req.school, user: req.user, seats, when });
    if (!r.ok) return fail(req, res, r, r.code === 'minSeats' || r.code === 'sameSeats' ? 400 : 409);
    res.json({ ok: true, toast: req.t(`school.billing.seats.${r.did}`, { seats: r.seats }) });
  } catch (e) { stripeTrouble(req, res, e); }
});
router.post('/api/billing/school/:id/portal', schoolGate, rateLimit('billing-portal', 20, 600e3), testerGate, stepUp, async (req, res) => {
  try {
    const r = await C.startPortalFor({ kind: 'school', id: req.school.id, user: req.user, returnUrl: `${C.baseUrl(req)}${tabUrl(req.school)}` });
    if (!r.ok) return fail(req, res, r);
    res.json({ ok: true, redirect: r.url });
  } catch (e) { stripeTrouble(req, res, e); }
});
router.post('/api/billing/school/:id/invoice-request', schoolGate, rateLimit('billing-request', 30, 3600e3), testerGate, (req, res) => {
  const r = SB.requestInvoice(req.user, req.school, req.body || {});
  if (!r.ok) return fail(req, res, r, r.code === 'requestOpen' ? 409 : 400);
  res.json({ ok: true, toast: req.t('school.billing.invoice.sent') });
});
router.post('/api/billing/school/:id/invoice-request/cancel', schoolGate, rateLimit('billing-request-cancel', 20, 3600e3), (req, res) => {
  const r = SB.cancelRequest(req.user, req.school);
  if (!r.ok) return fail(req, res, r, 404);
  res.json({ ok: true, toast: req.t('school.billing.invoice.cancelled') });
});
router.get('/api/billing/school/:id/status', schoolGate, rateLimit('billing-status', 60, 60e3), async (req, res) => {
  const id = typeof req.query.checkout === 'string' ? req.query.checkout : '';
  const state = id ? await C.checkoutReturnFor('school', req.school.id, id) : SB.schoolBilling(req.school).plan.entitled ? 'active' : 'none';
  res.set('Cache-Control', 'no-store').json({ state });
});

// ---------------------------------------------------------------- the Billing tab
const plural = (t, key, n) => t(key, { count: n });

/** The Billing tab of /school/:slug (school admins). Async: it reads the seat price from Stripe (cached). */
export async function schoolBillingTab(req, s) {
  const t = req.t, f = req.fmt, u = req.user;
  const v = SB.schoolBilling(s);
  const { plan, sub, pool } = v;
  const may = C.mayBill(u);
  const price = await SB.schoolPrice();
  const api = `/api/billing/school/${s.id}`;
  const checkoutId = typeof req.query.checkout === 'string' ? req.query.checkout.slice(0, 200) : '';
  const contact = config.contactEmail ? html`<p class="small muted">${tHtml(t, 'school.billing.help', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p>` : '';
  const err = html`<p class="err form-err" aria-live="polite"></p>`;
  const seatsField = (id, value, hint) => html`<div class="field"><label for="${id}">${t('school.billing.seatsLabel')}</label>
    <input class="input" id="${id}" name="seats" type="number" inputmode="numeric" min="${config.schoolMinSeats}" max="${SB.MAX_SEATS}" step="1" value="${value}" required dir="ltr" aria-describedby="${id}-hint">
    <span class="hint" id="${id}-hint">${hint}</span><span class="err" id="${id}-err" aria-live="polite"></span></div>`;
  const studentsNow = plural(t, 'school.billing.studentsN', v.students);
  const parts = [];

  // Back from Checkout and the plan isn't on yet: only the wait.
  if (checkoutId && !plan.entitled) {
    return html`<section class="panel" aria-labelledby="bill-h" id="plan"><h2 id="bill-h">${t('school.billing.heading')}</h2>
      <div class="notice" role="status" data-checkout-wait="${checkoutId}" data-status-url="${api}/status" data-back="${tabUrl(s)}" data-done="${t('school.billing.welcome')}">
        <p style="margin:0"${t.own('school.billing.waiting') ? '' : raw(' lang="en" dir="ltr"')}><span aria-hidden="true">⏳</span> ${t('school.billing.waiting')}</p>
        <div data-slow hidden><p class="small" style="margin:.5em 0 0">${t('school.billing.slow')}</p>
          <p class="small" style="margin:.5em 0 0"><a href="${tabUrl(s)}">${t('school.billing.back')}</a></p></div></div></section>`;
  }
  if (checkoutId && plan.entitled) parts.push(html`<p class="notice good" role="status"><span aria-hidden="true">🎉</span> ${t('school.billing.welcome')}</p>`);

  // ---- the plan's state
  if (plan.entitled) {
    let state;
    if (plan.via === 'grant') state = t('school.billing.grant', { date: f.date(plan.grant.until), count: plan.grant.seats || 0 });
    else if (sub.status === 'past_due' && sub.collection_method !== 'send_invoice') state = t('school.billing.pastDue', { date: f.date(sub.grace_until) });
    else if (sub.cancel_at_period_end) state = t('school.billing.ends', { date: f.date(sub.current_period_end) });
    else state = t('school.billing.renews', { date: f.date(sub.current_period_end) });
    parts.push(html`<p><b>${plural(t, 'school.billing.active', plan.via === 'grant' ? plan.grant.seats || 0 : sub.quantity)}</b> ${state}</p>`);
    if (sub && sub.collection_method === 'send_invoice' && sub.grace_until) parts.push(html`<p class="notice warn" role="status">${t('school.billing.overdue', { date: f.date(sub.grace_until) })}</p>`);
    for (const i of v.invoices) {
      parts.push(html`<p class="small">${t('school.billing.invoiceOpen', { amount: f.money(i.amount_due), date: i.due_date ? f.date(i.due_date) : '–' })}
        ${i.url ? html` <a href="${i.url}" rel="noopener noreferrer" target="_blank">${t('school.billing.invoiceView')}</a>` : ''}</p>`);
    }
    if (pool) {
      parts.push(html`<div class="planextras"><b>${t('school.billing.pool', { left: f.int(pool.left), total: f.int(pool.size), date: f.date(pool.until) })}</b>${v.lessons ? html`<br>` : ''}
        ${v.lessons ? html`<span class="small muted">${plural(t, 'school.billing.lessons', v.lessons)}</span>` : ''}</div>`);
      if (sub && sub.quantity > pool.seats) parts.push(html`<p class="small">${t('school.billing.poolWaits')}</p>`);
    }
    const paid = plan.via === 'grant' ? plan.grant.seats || 0 : sub.quantity;
    if (paid && v.students >= Math.ceil(paid * 1.1)) parts.push(html`<p class="notice warn">${t('school.billing.over', { students: studentsNow, seats: paid })}</p>`);
  } else {
    parts.push(html`<p>${t('school.billing.none')}</p>`);
    if (sub && sub.flag === 'async_failed') parts.push(html`<p class="notice warn">${t('school.billing.asyncFailed')}</p>`);
    else if (v.unsettled && v.unsettled.payment_pending) parts.push(html`<p class="notice">${t('school.billing.pending')}</p>`);
    else if (v.unsettled) parts.push(html`<p class="notice warn">${t('school.billing.errors.fixPayment')}</p>`);
  }
  if (plan.entitled) parts.push(html`<p class="small muted">${t('school.billing.daily', { cap: v.cap })}</p>`);
  if (price) parts.push(html`<p class="small muted">${t('school.billing.price', { price: f.money(price.unitAmount), min: config.schoolMinSeats, perSeat: config.schoolTurnsPerSeat })}${LESSONS_PER_SEAT() ? ` ${t('school.billing.priceLessons', { count: LESSONS_PER_SEAT() })}` : ''}</p>`);

  const head = html`<section class="panel" aria-labelledby="bill-h" id="plan"><h2 id="bill-h">${t('school.billing.heading')}</h2>${parts}
    ${!may ? html`<p class="small muted">${t('school.billing.notOpen')}</p>` : ''}</section>`;

  // ---- actions
  const actions = [];
  if (may) {
    // The renewal reminder: next year's students (today's count proposed).
    if (v.renewing) {
      actions.push(html`<section class="panel" aria-labelledby="renew-h" id="renewal"><h3 id="renew-h">${t('school.billing.renewal.heading')}</h3>
        <p>${t('school.billing.renewal.text', { date: f.date(sub.current_period_end), seats: plural(t, 'school.billing.studentsN', sub.quantity), students: studentsNow })}</p>
        ${sub.next_quantity ? html`<p><b>${t('school.billing.renewal.next', { seats: plural(t, 'school.billing.studentsN', sub.next_quantity) })}</b></p>` : ''}
        <form data-api="${api}/seats" data-reload class="planform" novalidate><input type="hidden" name="when" value="renewal">
          ${seatsField('seats-next', sub.next_quantity || Math.max(config.schoolMinSeats, v.students), t('school.billing.renewal.hint', { min: config.schoolMinSeats }))}
          ${passwordField(req, 'pw-next')}${err}
          <button class="btn" type="submit">${t('school.billing.renewal.button')}</button></form></section>`);
    }
    if (plan.entitled && plan.via === 'subscription') {
      actions.push(html`<section class="panel" aria-labelledby="seats-h" id="seats"><h3 id="seats-h">${t('school.billing.change.heading')}</h3>
        <p class="small muted">${t('school.billing.change.text')}</p>
        ${sub.next_quantity && !v.renewing ? html`<p class="small"><b>${t('school.billing.renewal.next', { seats: plural(t, 'school.billing.studentsN', sub.next_quantity) })}</b></p>` : ''}
        <form data-api="${api}/seats" data-reload class="planform" novalidate>
          ${seatsField('seats-change', Math.max(sub.quantity, v.students), t('school.billing.seatsHint', { min: config.schoolMinSeats, students: studentsNow }))}
          ${passwordField(req, 'pw-seats')}${err}
          <button class="btn btn-primary" type="submit">${t('school.billing.change.button')}</button></form></section>`);
    } else if (!v.unsettled && price) {
      actions.push(html`<section class="panel" aria-labelledby="pay-h" id="pay"><h3 id="pay-h">${t('school.billing.pay.heading')}</h3>
        <form data-api="${api}/checkout" class="planform" novalidate>
          ${seatsField('seats-pay', Math.max(config.schoolMinSeats, v.students), t('school.billing.seatsHint', { min: config.schoolMinSeats, students: studentsNow }))}
          <ul class="small planterms"><li>${t('school.billing.pay.renew')}</li><li>${t('school.billing.pay.cancel')}</li><li>${t('school.billing.pay.tax')}</li></ul>
          <p class="small">${tHtml(t, 'school.billing.legal')}</p>
          ${passwordField(req, 'pw-pay')}${err}
          <button class="btn btn-primary" type="submit">${t('school.billing.pay.button')}</button>
          <p class="small muted" style="margin-bottom:0">${t('school.billing.pay.stripe')}</p></form></section>`);
    }
    if (v.customer) {
      actions.push(html`<section class="panel" aria-labelledby="manage-h" id="manage"><h3 id="manage-h">${t('school.billing.manage.heading')}</h3>
        <p class="small muted">${t('school.billing.manage.text')}</p>
        <form data-api="${api}/portal" class="planform">${passwordField(req, 'pw-portal')}${err}
          <button class="btn" type="submit">${t('school.billing.manage.button')}</button></form></section>`);
    }
    // Invoice / PO: for a school without a plan (a card school changes its students above).
    if (v.request) {
      const who = html`<bdi dir="ltr">${v.request.contact_email}</bdi>`;
      actions.push(html`<section class="panel" aria-labelledby="inv-h" id="invoice"><h3 id="inv-h">${t('school.billing.invoice.heading')}</h3>
        <p>${tHtml(t, 'school.billing.invoice.requested', { date: f.date(v.request.created_at), seats: plural(t, 'school.billing.studentsN', v.request.seats), email: who })}</p>
        <form data-api="${api}/invoice-request/cancel" data-reload data-confirm="${t('school.billing.invoice.cancelConfirm')}"><button class="btn" type="submit">${t('school.billing.invoice.cancel')}</button></form></section>`);
    } else if (!(plan.entitled && plan.via === 'subscription') && !v.unsettled && price) {
      const fld = (name, label, { type = 'text', req: required = true, max = 100, auto = '', ltr = false, wide = false, value = '' } = {}) => html`<div class="field${wide ? ' wide' : ''}"><label for="inv-${name}">${label}${required ? '' : html` <span class="muted">${t('school.optional')}</span>`}</label>
        <input class="input" id="inv-${name}" name="${name}" type="${type}" maxlength="${max}" ${required ? 'required' : ''} ${auto ? html`autocomplete="${auto}"` : ''} ${ltr ? html`dir="ltr"` : ''} value="${value}"><span class="err" id="inv-${name}-err" aria-live="polite"></span></div>`;
      actions.push(html`<section class="panel" aria-labelledby="inv-h" id="invoice"><details><summary><h3 id="inv-h" style="display:inline">${t('school.billing.invoice.heading')}</h3></summary>
        <p class="small muted">${t('school.billing.invoice.text')}</p>
        <p class="small">${tHtml(t, 'school.billing.legal')}</p>
        <form class="formgrid" data-api="${api}/invoice-request" data-reload novalidate>
          ${seatsField('inv-seats', Math.max(config.schoolMinSeats, v.students), t('school.billing.seatsHint', { min: config.schoolMinSeats, students: studentsNow }))}
          ${fld('po', t('school.billing.invoice.po'), { req: false, max: 60, ltr: true })}
          ${fld('contactName', t('school.billing.invoice.contactName'), { max: 80, auto: 'name' })}
          ${fld('contactEmail', t('school.billing.invoice.contactEmail'), { type: 'email', max: 120, auto: 'email', ltr: true })}
          ${fld('line1', t('school.billing.invoice.line1'), { auto: 'address-line1', wide: true })}
          ${fld('line2', t('school.billing.invoice.line2'), { req: false, auto: 'address-line2', wide: true })}
          ${fld('city', t('school.billing.invoice.city'), { max: 60, auto: 'address-level2' })}
          ${fld('state', t('school.billing.invoice.state'), { req: false, max: 60, auto: 'address-level1' })}
          ${fld('postalCode', t('school.billing.invoice.postal'), { max: 20, auto: 'postal-code', ltr: true })}
          ${fld('country', t('school.billing.invoice.country'), { max: 2, auto: 'country', ltr: true, value: 'US' })}
          <div class="field wide"><label class="checkline"><input type="checkbox" name="taxExempt" value="1"> <span>${t('school.billing.invoice.taxExempt')}</span></label></div>
          <div class="field wide"><label for="inv-note">${t('school.billing.invoice.note')} <span class="muted">${t('school.optional')}</span></label><textarea class="input" id="inv-note" name="note" rows="2" maxlength="500"></textarea></div>
          <p class="err form-err wide" aria-live="polite"></p>
          <div class="formacts"><button class="btn btn-primary" type="submit">${t('school.billing.invoice.button')}</button></div>
        </form></details></section>`);
    }
  }

  // ---- the daily cap (a school setting): only while the school has a plan (without one it changes nothing). The box
  // shows the cap in force, and nothing below the free daily messages can be set.
  const capForm = !plan.entitled ? '' : html`<section class="panel" aria-labelledby="cap-h" id="cap"><h3 id="cap-h">${t('school.billing.cap.heading')}</h3>
    <form class="stack" data-api="/api/schools/${s.id}/settings" data-reload data-toast="${t('school.settings.saved')}" novalidate>
      <div class="field"><label for="set-builderDailyCap">${t('school.billing.cap.label')}</label>
        <input class="input" id="set-builderDailyCap" name="builderDailyCap" type="number" inputmode="numeric" min="${SC.minDailyCap()}" max="${SC.MAX_DAILY_CAP}" step="1" dir="ltr" value="${v.cap}" aria-describedby="cap-hint">
        <span class="hint" id="cap-hint">${t('school.billing.cap.hint', { free: config.builderDailyTurns, cap: v.cap })}</span><span class="err" id="set-builderDailyCap-err" aria-live="polite"></span></div>
      <div><button class="btn" type="submit">${t('school.save')}</button></div></form></section>`;

  // Until this language has the Billing tab's words, the English fallback reads left to right (also on he/ar pages).
  const out = html`${head}${actions}${capForm}${contact}`;
  return t.own('school.billing.heading') ? out : html`<div lang="en" dir="ltr" style="display:contents">${out}</div>`;
}
