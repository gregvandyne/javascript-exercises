// Graceful shutdown on SIGTERM (a deploy, a restart, a host move):
//   1. /health turns 503 and every response closes its connection, so the load balancer moves traffic away;
//   2. the Builder drains (runner.drain: no new builds; live streams of idle games are told to come back);
//   3. the server stops accepting connections; idle keep-alive connections are closed;
//   4. in-flight requests and Builder builds (also those nobody is watching) get up to graceMs to finish;
//   5. handoffMs before the grace ends, builds still running are handed off (runner.handOff: their reply so far is
//      saved and the next boot carries them on), so they never hold the shutdown or get cut off unsaved;
//   6. then the database is closed and the process exits (0 = clean, 1 = had to cut work off).
// Platforms send SIGKILL after their own grace period (Render ~30 s, Docker 10 s unless stop_grace_period is set),
// so graceMs (SHUTDOWN_GRACE_SECONDS, 25 s by default) stays below it.
import { lifecycle } from './services/health.js';

/**
 * opts: { server, graceMs, busy: () => number of running Builder builds, stop: () => void (jobs, timers),
 *         drain: () => void, handOff: () => number handed off, handoffMs, close: () => void (browser, database),
 *         log, exit, tickMs }
 * Returns shutdown(signal). A second SIGINT (Ctrl+C twice) exits at once; other repeats are ignored.
 */
export function makeShutdown({ server, graceMs, busy = () => 0, stop = () => {}, drain = () => {}, handOff = () => 0, handoffMs = 3000, close = () => {}, log, exit = code => process.exit(code), tickMs = 200 }) {
  let started = false, timer = null;
  return function shutdown(signal) {
    if (started) { if (signal === 'SIGINT') { clearInterval(timer); log('warn', 'second interrupt: stopping now'); exit(1); } return; }
    started = true;
    lifecycle.draining = true;
    const t0 = Date.now();
    log('info', 'shutdown', { signal, graceMs, builderTurns: busy() });
    try { stop(); } catch (e) { log('error', 'shutdown: stop failed', { error: e.message }); }
    try { drain(); } catch (e) { log('error', 'shutdown: drain failed', { error: e.message }); }
    let closed = false;
    const handAt = Math.max(0, graceMs - handoffMs);   // a short (test) grace hands off at once
    server.close(() => { closed = true; });
    server.closeIdleConnections?.();
    timer = setInterval(() => {
      // A finished response on a keep-alive connection leaves it idle: close it so server.close() can complete.
      server.closeIdleConnections?.();
      // A hand-off empties the runner, so this runs once (again only if a build somehow started after it).
      if (Date.now() - t0 >= handAt && busy() > 0) {
        try { log('info', 'handed off Builder turns', { turns: handOff() }); } catch (e) { log('error', 'shutdown: hand-off failed', { error: e.message }); }
      }
      const turns = busy();
      if (closed && !turns) return finish(0);
      if (Date.now() - t0 >= graceMs) {
        log('warn', 'shutdown: grace period over, cutting off', { graceMs, builderTurns: turns, requestsOpen: !closed });
        finish(1);
      }
    }, tickMs);
    function finish(code) {
      clearInterval(timer);
      server.closeAllConnections?.();
      try { close(); } catch (e) { log('error', 'shutdown: close failed', { error: e.message }); }
      log('info', 'stopped', { ms: Date.now() - t0, code });
      exit(code);
    }
  };
}
