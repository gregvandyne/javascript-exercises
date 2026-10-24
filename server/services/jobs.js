// Scheduled jobs (e.g. forgetting old visitor hashes for the admin stats).
const jobs = [];
/** register(name, everyMs, fn) */
export function register(name, everyMs, fn) { jobs.push({ name, everyMs, fn }); }
export function startJobs() {
  const timers = jobs.map(j => setInterval(() => { try { j.fn(); } catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'job failed', job: j.name, error: e.message })); } }, j.everyMs));
  timers.forEach(t => t.unref());
  return () => timers.forEach(clearInterval);
}
