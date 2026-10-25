// Graceful shutdown on SIGTERM (a deploy, a restart, a host move):
//   1. /health turns 503 and every response closes its connection, so the load balancer moves traffic away;
//   2. the server stops accepting connections; idle keep-alive connections are closed;
//   3. in-flight requests and Builder turns (also those whose phone disconnected) get up to graceMs to finish;
//   4. then the database is closed and the process exits (0 = clean, 1 = had to cut work off).
// Platforms send SIGKILL after their own grace period (Render ~30 s, Docker 10 s unless stop_grace_period is set),
// so graceMs (SHUTDOWN_GRACE_SECONDS, 25 s by default) stays below it.
import { lifecycle } from './services/health.js';

/**
 * opts: { server, graceMs, busy: () => number of running Builder turns, stop: () => void (jobs, timers),
 *         close: () => void (browser, database), log, exit, tickMs }
 * Returns shutdown(signal). A second SIGINT (Ctrl+C twice) exits at once; other repeats are ignored.
 */
export function makeShutdown({ server, graceMs, busy = () => 0, stop = () => {}, close = () => {}, log, exit = code => process.exit(code), tickMs = 200 }) {
  let started = false, timer = null;
  return function shutdown(signal) {
    if (started) { if (signal === 'SIGINT') { clearInterval(timer); log('warn', 'second interrupt: stopping now'); exit(1); } return; }
    started = true;
    lifecycle.draining = true;
    const t0 = Date.now();
    log('info', 'shutdown', { signal, graceMs, builderTurns: busy() });
    try { stop(); } catch (e) { log('error', 'shutdown: stop failed', { error: e.message }); }
    let closed = false;
    server.close(() => { closed = true; });
    server.closeIdleConnections?.();
    timer = setInterval(() => {
      // A finished response on a keep-alive connection leaves it idle: close it so server.close() can complete.
      server.closeIdleConnections?.();
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
