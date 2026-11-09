// What the Studio's daily-limit card offers besides "more tomorrow" (docs/decisions.md "Spark Packs": the owner's
// decision of 2026-11-08). One function, upsellFor(user, req), read into the Studio state; the card shows it only once
// the builder has no message left today (public/js/studio.js syncLimit). No price and no plan name ever reaches a
// child's card: a child asks their grown-up, or is told where a grown-up can look.
//   null      nothing to offer: paid-plan pages are off, a guest, the Spark Packs left only wait for tomorrow's daily
//             cap, or nothing can be bought for this account.
//   resting   the site's AI budget is spent for everyone: not this builder's own limit, so nothing to buy (the card says
//             the Builder is resting for everyone).
//   class     a school student, or anyone a school's pool or a Teacher plan pays for: "ask your teacher". Never an offer
//             in class.
//   teacher   a teacher with the Teacher plan whose classes used today's shared messages: "more tomorrow" (no offer).
//   plan      no plan yet: a grown-up builder goes to /plans; school staff go to /trial (the Teacher plan); a
//             child with a linked grown-up taps "Ask my grown-up" (a builder_asks row, services/sparks.js); a child
//             without one is told where a grown-up can look (/parents, where family accounts and plans are explained:
//             the address as text and a QR code, never a link),
//             next to the existing "a grown-up can link to your account" line.
//   spark     the family's plan is on (or its packs ran out): a grown-up goes to the Spark Pack picker on /family; a child
//             asks their grown-up for one.
import { config } from '../config.js';
import { isGrownup } from '../auth.js';
import { familiesOn, isChildAccount, linkOf, familyOfOwner, familyPlan } from '../services/family.js';
import { schoolSide } from '../services/school-billing.js';
import { teacherSide, teacherPlan } from '../services/teacher-plan.js';
import { isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import * as aiBudget from '../services/ai-budget.js';
import * as sparks from '../services/sparks.js';
import { qrSvg } from '../services/qr.js';
import { siteHost } from '../site.js';
import { allowanceFor } from './usage.js';

/** Where a grown-up picks a Spark Pack. */
export const SPARK_HREF = '/family?sparks=1#sparks';
/** Spark Packs are on sale at all (the "Family" payment method configuration is set; prices are read on /family). */
const sparksOnSale = () => !!config.stripePmcFamily;

/** -> null | { kind: 'resting' | 'class' } | { kind: 'plan' | 'spark', who: 'grownup' | 'staff', href }
 *     | { kind, who: 'kid', grownup: true, asked } | { kind: 'plan', who: 'kid', grownup: false, address, qr } */
export function upsellFor(user, req) {
  if (!req || !user || user.is_guest || user.banned || !familiesOn(req)) return null;
  // The site's AI is resting for everyone (the free pool, or the site-wide ceiling), or the paid pool is at the owner's
  // own cap (AI_PAID_MONTHLY_BUDGET_USD): buying anything wouldn't help today. (A paid pool that is only at its computed
  // ceiling grows with what is bought, so it is no reason to stop.)
  const paid = aiBudget.status(undefined, 'paid');
  if (!aiBudget.ok('free') || (!paid.ok && (paid.reason === 'hard' || (config.aiPaidMonthlyBudgetUsd != null && paid.month >= config.aiPaidMonthlyBudgetUsd)))) return { kind: 'resting' };
  const side = schoolSide(user.id), ts = teacherSide(user.id);
  const staff = !isGrownup(user) && (isSchoolStaff(user) || isPlatformAdmin(user));
  // A teacher with the Teacher plan: their classes' shared messages are used up for today. Nothing to buy.
  if (staff && teacherPlan(user.id).entitled) return { kind: 'teacher' };
  if (!staff && (side.student || side.school || ts.teacher || ts.entitled)) return { kind: 'class' };
  const a = allowanceFor(user);
  // Spark Pack messages are left, only today's cap is reached: tomorrow brings them back, nothing to buy.
  if (a.sparkFamilyId && sparks.balance(a.sparkFamilyId) > 0) return null;
  if (staff) return { kind: 'plan', who: 'staff', href: '/trial' };
  if (side.entitled) return { kind: 'class' };   // a school with a plan whose pool is empty: family money is never used in class
  if (isGrownup(user)) {
    const fam = familyOfOwner(user.id);
    if (fam && familyPlan(fam.id).entitled) return sparksOnSale() ? { kind: 'spark', who: 'grownup', href: SPARK_HREF } : null;
    return { kind: 'plan', who: 'grownup', href: '/plans' };
  }
  if (!isChildAccount(user)) return null;
  const link = linkOf(user.id);
  if (!link) {
    // The grown-ups' page: family accounts (how to link this child), then the plans.
    const address = `${siteHost(req)}/parents`;
    return { kind: 'plan', who: 'kid', grownup: false, address, qr: qrSvg(`${config.publicUrl || `${req.protocol}://${req.get('host')}`}/parents#families`, { title: address }) };
  }
  const kind = familyPlan(link.family_id).entitled ? 'spark' : 'plan';
  if (kind === 'spark' && !sparksOnSale()) return null;
  const open = sparks.openAsk(user.id);
  return { kind, who: 'kid', grownup: true, asked: !!(open && open.kind === kind) };
}
/** What a child's "Ask my grown-up" asks for, now: { fid, kind } or null when there is nothing to ask (no linked
 *  grown-up, messages left, class, resting). */
export function askTarget(user, req) {
  const u = upsellFor(user, req);
  if (!u || u.who !== 'kid' || !u.grownup || allowanceFor(user).left > 0) return null;
  return { fid: linkOf(user.id).family_id, kind: u.kind };
}
