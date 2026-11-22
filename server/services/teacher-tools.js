// Who may use the teaching tools, Figures and the Manipulatives (docs/decisions.md "Figures opens to all teachers" and
// "Figures and the Manipulatives: Teacher plan only", the owner's decision of 22 Nov 2026: "Figures and manipulatives
// should only be available via a paid plan for right now."). The one rule both use (services/figures.js canMake,
// services/manipulatives.js canHost):
//   - the tool's own switch is off (FIGURES=0, MANIPULATIVES=0): nobody, the platform admin included;
//   - never a guest, a banned account, a grown-up (family) account, or anyone who is not school staff (students and
//     kids never make or host; they still do the work their teacher assigns and join the rooms their teacher hosts);
//   - the platform admin, and school staff on the tester list (MANIPULATIVES_USERS): always;
//   - while paid plans are on for everyone (billing on and BILLING_PUBLIC=1), school staff with the Teacher plan
//     (services/teacher-plan.js teacherPlan: their own plan or a grant, a 14-day trial included, or a school's teacher
//     seat). Staff without it see the "part of the Teacher plan" page ('plan');
//   - while paid plans are off (no billing, a test key not open to the public, or only the preview cookie): the tester
//     list alone, as before billing, so nothing changes until the Teacher plan can be bought by everyone.
import { config } from '../config.js';
import { isGrownup } from '../auth.js';
import * as S from './schools.js';
import { billingOn } from './stripe.js';
import { teacherPlan } from './teacher-plan.js';

/** Are paid plans on for everyone (not only behind the preview cookie)? The same for every request and every job. */
export const plansOn = () => billingOn() && !!config.billingPublic;
/** On the tester list (MANIPULATIVES_USERS)? */
export const isTester = u => !!u && config.manipulativesUsers.includes(String(u.username || '').toLowerCase());
/**
 * The teaching tools for this account, behind a tool's switch (on): 'yes' (may use it), 'plan' (school staff without the
 * Teacher plan, while plans are on: the plan page) or null (the normal 404).
 */
export function toolAccess(u, on = true) {
  if (!on || !u || u.is_guest || u.banned || isGrownup(u)) return null;
  if (S.isPlatformAdmin(u)) return 'yes';
  if (!S.isSchoolStaff(u)) return null;
  if (isTester(u)) return 'yes';
  if (!plansOn()) return null;
  return teacherPlan(u.id).entitled ? 'yes' : 'plan';
}
