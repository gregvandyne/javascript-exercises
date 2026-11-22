// Test helpers for the Teacher plan gate of the teaching tools (services/teacher-tools.js): paid plans on for everyone
// (a fake test key, BILLING_PUBLIC on; no Stripe call is made) and a Teacher plan written straight into the billing
// tables: a paid plan, a trial, a grant or a school seat. Shared by the Figures and Manipulatives tests.
const { config } = await import('../../server/config.js');
const { q, uid, now } = await import('../../server/db.js');

const DAY = 86400e3;
/** Paid plans on for everyone (or off again with on = false). */
export function plansOn(on = true) {
  Object.assign(config, on ? { stripeApiKey: 'rk_test_toolsfake', stripeWebhookSecret: 'whsec_toolsfake', billingPublic: true } : { stripeApiKey: '', stripeWebhookSecret: '', billingPublic: false });
}
const sub = (kind, id, status, { end = now() + 300 * DAY, quantity = 1 } = {}) => {
  const sid = `sub_tools_${uid(8)}`;
  q.run(`INSERT INTO billing_subscriptions(stripe_subscription_id, stripe_customer_id, owner_kind, owner_id, plan, quantity, pool_quantity, status,
    current_period_start, current_period_end, livemode, created_at, updated_at) VALUES (?,?,?,?, 'teacher', ?, ?, ?, ?, ?, 0, ?, ?)`,
  sid, `cus_tools_${uid(6)}`, kind, String(id), quantity, quantity, status, now() - DAY, end, now(), now());
  return sid;
};
/** The teacher's own paid Teacher plan (status 'active'). -> the subscription id */
export const givePlan = userId => sub('teacher', userId, 'active');
/** The teacher's own 14-day trial (status 'trialing'). */
export const giveTrial = userId => sub('teacher', userId, 'trialing', { end: now() + 14 * DAY });
/** A school's teacher seats (n), and one of them given to this teacher. */
export function giveSeat(schoolId, userId, byId, n = 3) {
  sub('school', schoolId, 'active', { quantity: n });
  q.run('INSERT INTO teacher_seats(school_id, user_id, assigned_by, assigned_at) VALUES (?,?,?,?)', schoolId, userId, byId, now());
}
/** The plan ends (canceled, as Stripe does when a trial ends without a card). */
export const endPlan = subId => q.run("UPDATE billing_subscriptions SET status='canceled', current_period_end=? WHERE stripe_subscription_id=?", now() - 1000, subId);
