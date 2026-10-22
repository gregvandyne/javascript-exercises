// Scheduled jobs. The Money node registers the nightly earnings roll-up here.
const jobs = [];
/** register(name, everyMs, fn) */
export function register(name, everyMs, fn) { jobs.push({ name, everyMs, fn }); }
export function startJobs() {
  const timers = jobs.map(j => setInterval(() => { try { j.fn(); } catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'job failed', job: j.name, error: e.message })); } }, j.everyMs));
  timers.forEach(t => t.unref());
  return () => timers.forEach(clearInterval);
}
