// The Teacher plan's one-line notes for the automatic trial (docs/decisions.md "Automatic trial at sign-up"), kept here
// so the pages that show them (the sign-up's last step, the Teacher plan card, /trial) each need one call:
//   trialLineHtml   "Your 14-day Teacher plan trial has started. No card needed." / "Your school covers your Teacher
//                   plan" / "Your school has Teacher plan seats: ask your school admin for one" (TP.trialLine)
//   seatPaidNotice  a teacher who pays for their own plan while a school seat covers them: they can cancel their own
// No prices here: amounts only show on /plans and the pages that sell.
import { raw } from './html.js';
import { tHtml } from '../i18n/index.js';
import { config } from '../config.js';
import * as TP from '../services/teacher-plan.js';

/** A string as an element, marked English until this language has it. */
const el = (t, tag, key, vars = {}, attrs = '') => raw(`<${tag}${attrs}${t.own(key) ? '' : ' lang="en" dir="ltr"'}>${tHtml(t, key, vars)}</${tag}>`);
const KEYS = { started: 'plans.auto.started', covered: 'plans.auto.covered', askAdmin: 'plans.auto.askAdmin' };

/** The line for TP.trialLine(userId) (or a line already read), or '' when there is nothing to say. */
export function trialLineHtml(t, line, { id = 'trial-line' } = {}) {
  if (!line || !KEYS[line.state]) return '';
  const cls = line.state === 'askAdmin' ? 'notice' : 'notice good';
  return el(t, 'p', KEYS[line.state], { days: config.teacherTrialDays }, ` class="${cls}" role="status" id="${id}" data-trial-line="${line.state}"`);
}

/** "Your school now covers you. You can cancel your own plan.": while a teacher pays for their own plan (past its trial)
 *  and a school seat covers them too. The card's Manage billing button (the Customer Portal) is where they cancel. */
export function seatPaidNotice(t, userId, plan) {
  if (!plan || plan.via !== 'own' || plan.trialing || !plan.subscription || plan.subscription.cancel_at_period_end) return '';
  if (!TP.seatSchool(userId)) return '';
  return el(t, 'p', 'plans.auto.seatPaid', {}, ' class="notice warn" role="status" id="seat-paid"');
}
