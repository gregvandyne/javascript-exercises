// The manipulatives live room's socket, /api/manipulatives/ws?s=<session id> (docs/decisions.md "Virtual math
// manipulatives: the shared room"). One route of the shared upgrade listener (services/upgrade.js), with Oomba Live's
// gate: closed while draining or in maintenance, a foreign Origin 403, too many sockets from one address 429. Then the
// same rules as the room's pages: the feature on, a signed-in session's teacher or one of its joined students (a class
// member), and the session running. Anyone else: the same 404 as an address that isn't there.
// What it carries: cursors in ({ t:'c', x, y, touch }, at most PER_SECOND a second, room pixels), a student's own hand
// ({ t:'h', up }) and, out, cursor batches every 100 ms, raised hands, "something changed" (the page reads the room again), "Bring everyone to me" and the end. Board
// changes never travel here: they go through the room's save address, cleaned and checked (services/manipulatives.js).
// Nothing a socket carries is stored or logged (log lines: a status and a reason only, never a name or a position).
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { userFromRequest } from '../auth.js';
import { refuse, originOk } from './upgrade.js';
import { allow, ipOf } from './ratelimit.js';
import { lifecycle } from './health.js';
import { log } from './log.js';
import * as M from './manipulatives.js';
import * as LIVE from './manip-live.js';

export const PATH = /^\/api\/manipulatives\/ws$/;
export const LIMITS = { perIp: 600, perSecond: 20, recheckMs: 5000 };
export const hooks = { log, pingMs: 15000 };
let wss = null;

/** The checks before the upgrade. -> { status, why } | { s, who, u } */
export function gate(req) {
  if (lifecycle.draining || config.maintenance || config.movedTo) return { status: 503, why: 'closed' };
  if (!M.on()) return { status: 404, why: 'off' };
  if (!originOk(req)) return { status: 403, why: 'origin' };
  if (!allow(`mws-ip:${ipOf(req)}`, LIMITS.perIp, 60e3)) return { status: 429, why: 'ip' };
  const { u } = userFromRequest(req);
  let sid = ''; try { sid = new URL(req.url, 'http://x').searchParams.get('s') || ''; } catch { /* no id */ }
  const s = u ? M.getSession(sid) : null, who = s && s.status === 'active' ? M.roomRole(u, s) : null;
  if (!who) return { status: 404, why: 'room' };
  return { s, who, u };
}

export const route = {
  name: 'manipulatives',
  match: PATH,
  handle(req, socket, head) {
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false, clientTracking: false });
    const g = gate(req);
    if (g.status) { hooks.log('info', 'manipulatives socket refused', { status: g.status, why: g.why }); return refuse(socket, g.status); }
    wss.handleUpgrade(req, socket, head, ws => connection(ws, g));
  },
};

function connection(ws, { s, who, u }) {
  const sid = s.id, key = who.key;
  let alive = true, checked = Date.now();
  const send = msg => { try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch { /* gone */ } };
  const off = LIVE.subscribe(sid, msg => { send(msg); if (msg.t === 'end') try { ws.close(4000); } catch { /* gone */ } });
  LIVE.connected(sid, key, 1);
  send({ t: 'hi', me: key, cur: LIVE.cursorsOf(sid), bring: LIVE.bringOf(sid), hands: LIVE.handsOf(sid) });
  // Still allowed? (removed from the class, the session ended, the feature turned off): looked up again every few seconds.
  const still = () => { const fresh = M.getSession(sid); return M.on() && fresh && fresh.status === 'active' && !!M.roomRole(u, fresh); };
  const ping = setInterval(() => {
    if (!alive || !still()) { try { ws.terminate(); } catch { /* gone */ } return; }
    alive = false; try { ws.ping(); } catch { /* gone */ }
  }, hooks.pingMs);
  ping.unref?.();
  ws.on('pong', () => { alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary || data.length > 200) return;
    if (!allow(`mws:${sid}:${key}`, LIMITS.perSecond, 1000)) return;   // a flood is dropped, not answered
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    if (!m || (m.t !== 'c' && m.t !== 'h')) return;
    if (Date.now() - checked > LIMITS.recheckMs) { checked = Date.now(); if (!still()) { try { ws.close(4403); } catch { /* gone */ } return; } }
    if (m.t === 'h') { if (who.role === 'student') M.handFor(sid, key, !!m.up); return; }   // a student's own hand only
    if (!Number.isFinite(+m.x) || !Number.isFinite(+m.y)) return;
    LIVE.setCursor(sid, key, { x: m.x, y: m.y, touch: !!m.touch });
  });
  ws.on('close', () => { clearInterval(ping); off(); LIVE.connected(sid, key, -1); });
  ws.on('error', () => {});
}
