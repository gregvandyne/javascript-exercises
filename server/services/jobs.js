// Scheduled jobs (e.g. forgetting old visitor hashes for the admin stats). A job may be async: its promise is awaited
// and a rejection is logged, never left unhandled (that would stop Node). A job still running when its next turn comes
// is skipped, so a slow run never overlaps the next.
import { log } from './log.js';

const jobs = [];
/** register(name, everyMs, fn) */
export function register(name, everyMs, fn) { jobs.push({ name, everyMs, fn, running: false }); }
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
  timers.forEach(t => t.unref());
  return () => timers.forEach(clearInterval);
}
