// Needs a look's words (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups"; server:
// services/homeroom-look.js): one reason in plain words, for the teacher's board (public/js/homeroom-live.js) and the
// sub's page (public/js/homeroom-sub.js, only the live reasons there).
import { t } from '/js/app.js';

const tk = (k, v) => t(`js.homeroom-look.${k}`, v);
/** What each reason suggests (the button and the line under it). */
export const ACTS = Object.freeze({ stuck: 'look', hand: 'hands', ask: 'hands', tries: 'sit', reading: 'readWith', overdue: 'checkIn' });
/** A reason ({ rule, minutes, title, kind, right, total, count }) in plain words. */
export function reasonText(r) {
  const m = r.minutes || 0;
  if (r.rule === 'stuck') return r.title ? tk('r.stuck', { title: r.title, count: m }) : tk('r.stuckNo', { count: m });
  if (r.rule === 'hand') return tk(r.kind === 'help' ? 'r.handHelp' : 'r.hand', { count: m });
  if (r.rule === 'ask') return m >= 120 ? tk('r.askHours', { count: Math.floor(m / 60) }) : tk('r.ask', { count: m });
  if (r.rule === 'tries') return tk('r.tries', { title: r.title || '', count: r.count || 2, right: r.right, total: r.total });
  if (r.rule === 'reading') return tk('r.reading', { title: r.title || '', right: r.right, total: r.total });
  if (r.rule === 'overdue') return tk('r.overdue', { count: r.count || 0 });
  return '';
}
