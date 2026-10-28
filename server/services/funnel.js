// Funnel step counts for /admin/stats (the navigation proposal's "How we'll know it worked"; docs/decisions.md
// "Funnel counts"). Counted on the server, like services/traffic.js counts visits:
// - one daily total per step (funnel_counts: day, step, n) and nothing else: no user, family, school or class ids, no
//   cookies, no third-party trackers;
// - a step is counted where it happens (a sign-up, a checkout, a webhook), never by watching a person move from page to
//   page, so the report compares totals, not people;
// - kid pages add only the guardrail totals (kid sign-ups, games played), which are the same daily totals.
import { q, today } from '../db.js';

/** The funnels, in order. Each step: [key, label]. Labels are admin-only English (the admin pages aren't translated). */
export const FUNNELS = Object.freeze([
  { key: 'parent', title: 'Parents', steps: [
    ['parent.view', 'Parent page views'], ['parent.signup', 'Grown-up sign-ups'], ['parent.child', 'Child linked'],
    ['parent.checkout', 'Checkout started'], ['parent.paid', 'Paid (webhook)']] },
  { key: 'teacher', title: 'Teachers', steps: [
    ['teacher.view', 'Teacher page views'], ['teacher.request', 'School requests'], ['teacher.school', 'Schools set up'],
    ['teacher.class', 'First class with students'], ['teacher.plan', 'School plan']] },
  { key: 'guardrail', title: 'Guardrail (must not drop)', guardrail: true, steps: [
    ['kid.signup', 'Kid sign-ups'], ['kid.play', 'Games played']] },
]);
export const STEPS = Object.freeze(FUNNELS.flatMap(f => f.steps.map(s => s[0])));
const KNOWN = new Set(STEPS);

/** Adds n to a step's total for the day. Unknown steps are refused (a typo must not make a new row). Never throws: a
 *  count must never break a sign-up, a checkout or a webhook. -> true if counted */
export function bump(step, n = 1, day = today()) {
  if (!KNOWN.has(step) || !(n > 0)) return false;
  try {
    q.run('INSERT INTO funnel_counts(day, step, n) VALUES (?,?,?) ON CONFLICT(day, step) DO UPDATE SET n=n+excluded.n', day, step, n | 0);
    return true;
  } catch { return false; }
}

// Page views: the grown-up pages only (the path after the language prefix, which server/seo.js pathLocale removes).
// /learn is left out: its subject pages are for teachers and its age pages for parents, and the funnel would mix them.
const PAGES = [[/^\/(parents(\/[^/]+)?|grown-ups)$/, 'parent.view'], [/^\/(teachers|plans\/schools)$/, 'teacher.view']];
/** The view step a page path counts toward, or null (every kid page, and anything else). */
export const viewStepOf = path => (PAGES.find(([re]) => re.test(String(path || ''))) || [null, null])[1];

const DAY = 86400e3;
const shift = (day, days) => today(Date.parse(day + 'T00:00:00Z') + days * DAY);
const sums = (from, to) => Object.fromEntries(q.all('SELECT step, SUM(n) n FROM funnel_counts WHERE day>=? AND day<=? GROUP BY step', from, to).map(r => [r.step, r.n || 0]));
/** A change in percent, or null when there was nothing before. */
export const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * The weekly report: the last 7 days (ending `end`, today by default) against the 7 before.
 * -> { last: { from, to }, prev: { from, to }, funnels: [{ key, title, guardrail, steps: [{ key, label, last, prev,
 *      change, rate }] }] }, where rate is this step's share of the step before it over the last 7 days (null for a
 *      first step, a guardrail or nothing before).
 */
export function weekly(end = today()) {
  const last = { from: shift(end, -6), to: end }, prev = { from: shift(end, -13), to: shift(end, -7) };
  const a = sums(last.from, last.to), b = sums(prev.from, prev.to);
  return {
    last, prev,
    funnels: FUNNELS.map(f => ({
      key: f.key, title: f.title, guardrail: !!f.guardrail,
      steps: f.steps.map(([key, label], i) => {
        const before = i ? a[f.steps[i - 1][0]] || 0 : 0;
        return { key, label, last: a[key] || 0, prev: b[key] || 0, change: change(a[key] || 0, b[key] || 0),
          rate: !f.guardrail && i && before ? Math.round(((a[key] || 0) / before) * 1000) / 10 : null };
      }),
    })),
  };
}
