// One 'upgrade' listener for every WebSocket on the server (docs/decisions.md "Oomba Live"). Each route matches a path
// and handles its own checks; this module only parses the path, picks the first route that matches and refuses the
// rest. Today: the Studio's live mic (services/stt-live.js, /api/studio/:id/listen) and Oomba Live
// (services/classlive-socket.js, /api/live/ws). Refusals are plain HTTP answers with no body; log lines carry a status
// and a reason only (never a path, a cookie or an address).
import { STATUS_CODES } from 'node:http';
import { isOwnOrigin } from '../site.js';
import { log } from './log.js';

/** Tests replace the logger. */
export const hooks = { log };

/** Answer an upgrade request with a plain HTTP status and close the socket. */
export function refuse(socket, status) {
  try { socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status] || ''}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`); } catch { /* gone */ }
  setTimeout(() => socket.destroy(), 50).unref?.();
}

/** A WebSocket has no CORS: without this check another site could open one with the visitor's cookie. */
export function originOk(req) {
  const origin = req.headers.origin;
  return !!origin && origin !== 'null' && isOwnOrigin(req, origin);
}

/**
 * routes: [{ name, match: RegExp, handle(req, socket, head, m) }]. The first route whose match finds the path handles
 * the request (m: the match). No route: 404. Returns the listener (so tests can remove it).
 */
export function attachUpgrades(server, routes) {
  const listener = (req, socket, head) => {
    socket.on('error', () => {});
    let path;
    try { path = new URL(req.url, 'http://x').pathname; } catch { return refuse(socket, 400); }
    for (const r of routes) {
      const m = r.match.exec(path);
      if (!m) continue;
      try { return r.handle(req, socket, head, m); } catch { return refuse(socket, 500); }
    }
    hooks.log('info', 'upgrade refused', { status: 404, why: 'path' });
    return refuse(socket, 404);
  };
  server.on('upgrade', listener);
  return listener;
}
