// The day plan's timer (docs/decisions.md "Homeroom: the day plan"), shared by the server (services/homeroom-plan.js) and
// the pages that show it (the board's plan pill, the projector, a desk's Now line), so all of them count the same way.
// A run is { idx, startedAt, partAt, extra, done }: the part on now, when the plan started, when this part started, the
// minutes added to it with +5 min (in ms), and done once Next went past the last part. Nothing here ever moves to the
// next part: only the teacher's Next does (services/homeroom-plan.js runAction). Time's up is only a state.
export const MIN = 60e3;
export const MORE_MS = 5 * MIN;          // +5 min
export const EXTRA_MAX = 60 * MIN;       // at most an hour added to one part

const minutesOf = p => Math.max(0, Number(p && p.minutes) || 0);
/** How the plan stands at `at`: { idx, part, next, endsAt, left (ms, negative when over), timesUp, done, behindMin,
 *  plannedMin, usedMin }. behindMin: how much later than planned the plan would end if every part from now on took its
 *  planned time (whole minutes, never below 0): said calmly, never as an alarm. */
export function timing(parts = [], run = null, at = Date.now()) {
  const list = Array.isArray(parts) ? parts : [];
  const plannedMin = list.reduce((s, p) => s + minutesOf(p), 0);
  if (!run || !list.length) return { idx: -1, part: null, next: list[0] || null, endsAt: null, left: null, timesUp: false, done: false, behindMin: 0, plannedMin, usedMin: 0 };
  const usedMin = Math.max(0, Math.round((at - run.startedAt) / MIN));
  if (run.done || run.idx >= list.length) return { idx: list.length, part: null, next: null, endsAt: null, left: null, timesUp: false, done: true, behindMin: Math.max(0, usedMin - plannedMin), plannedMin, usedMin };
  const idx = Math.max(0, Math.min(list.length - 1, run.idx | 0)), part = list[idx];
  const endsAt = run.partAt + minutesOf(part) * MIN + Math.max(0, run.extra || 0);
  const left = endsAt - at;
  const rest = list.slice(idx + 1).reduce((s, p) => s + minutesOf(p), 0) * MIN;
  const projected = Math.max(at, endsAt) + rest, planned = run.startedAt + plannedMin * MIN;
  return { idx, part, next: list[idx + 1] || null, endsAt, left, timesUp: left <= 0, done: false, behindMin: Math.max(0, Math.round((projected - planned) / MIN)), plannedMin, usedMin };
}
/** 12:05, or 1:02:05 past an hour; the absolute value (the caller says "over"). */
export function clock(ms) {
  const s = Math.max(0, Math.round(Math.abs(Number(ms) || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
