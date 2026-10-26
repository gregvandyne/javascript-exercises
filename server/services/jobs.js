// Scheduled jobs (e.g. forgetting old visitor hashes for the admin stats). A job may be async: its promise is awaited
// and a rejection is logged, never left unhandled (that would stop Node). A job still running when its next turn comes
// is skipped, so a slow run never overlaps the next. A job may also ask for one run soon after start-up (firstAfterMs):
// every deploy restarts the process, so a 6-hour job that only ran on its interval might never run on a busy day.
import { log } from './log.js';

const jobs = [];
/** register(name, everyMs, fn, { firstAfterMs }): runs every everyMs, and once firstAfterMs after startJobs when given. */
export function register(name, everyMs, fn, { firstAfterMs = null } = {}) { jobs.push({ name, everyMs, fn, firstAfterMs, running: false }); }
/** Runs one job now (unless it is still running). -> a promise that never rejects: true if it ran. */
export function runJob(j) {
  if (j.running) return Promise.resolve(false);
  j.running = true;
  return Promise.resolve().then(j.fn)
    .then(() => true, e => { log('error', 'job failed', { job: j.name, error: e?.message || String(e) }); return true; })
    .finally(() => { j.running = false; });
}
/** The registered job called name (tests). */
export const job = name => jobs.find(j => j.name === name);
export function startJobs() {
  const timers = jobs.map(j => setInterval(() => { runJob(j); }, j.everyMs));
  for (const j of jobs) if (j.firstAfterMs != null) timers.push(setTimeout(() => { runJob(j); }, j.firstAfterMs));
  timers.forEach(t => t.unref());
  return () => timers.forEach(t => clearTimeout(t));   // clearTimeout clears intervals too
}
