// Oomba Live's realtime socket, /api/live/ws (docs/decisions.md "Oomba Live"; the protocol is docs/live-protocol.md).
// One route of the shared upgrade listener (services/upgrade.js). The gate before the upgrade: draining or maintenance
// 503, the feature off 404, a foreign Origin 403, too many sockets from one address 429. After the upgrade the first
// message must be hello with a seat or host token within 5 seconds. Then every message goes through
// classlive-protocol.parse (types, ranges, sizes, the shape of game event data) and a token bucket per type; anything
// else is dropped. Log lines carry the session id, seat numbers and a reason only: never names, codes or addresses.
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { userFromRequest, readToken } from '../auth.js';
import { refuse, originOk } from './upgrade.js';
import { allow } from './ratelimit.js';
import { lifecycle } from './health.js';
import { log } from './log.js';
import * as P from './classlive-protocol.js';
import * as LS from './classlive-sessions.js';
import * as A from './classlive-access.js';

export const PATH = /^\/api\/live\/ws$/;
export const hooks = { helloMs: 5000, pingMs: 15000, log };
/** Sockets per address a minute (a whole school behind one address reconnecting after a Wi-Fi blip fits), and per
 *  seat a minute. */
export const LIMITS = { perIp: 1200, perSeat: 20 };
let wss = null;
const live = new Set();

/** The checks before the upgrade. -> { status, why } | {} */
export function gate(req) {
  if (lifecycle.draining || config.maintenance || config.movedTo) return { status: 503, why: 'closed' };
  if (!LS.liveOn()) return { status: 404, why: 'off' };
  if (!originOk(req)) return { status: 403, why: 'origin' };
  if (!allow(`lv-ws-ip:${LS.ipKey(req)}`, LIMITS.perIp, 60e3)) return { status: 429, why: 'ip' };
  return {};
}

export const route = {
  name: 'live',
  match: PATH,
  handle(req, socket, head) {
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false, clientTracking: false });
    const g = gate(req);
    if (g.status) { hooks.log('info', 'live socket refused', { status: g.status, why: g.why }); return refuse(socket, g.status); }
    wss.handleUpgrade(req, socket, head, ws => connection(ws, req));
  },
};

function connection(ws, req) {
  live.add(ws);
  let s = null, seat = null, role = null, alive = true, pingAt = 0;
  const close = (code, why) => { if (why) hooks.log('info', 'live socket closed', { sid: s ? s.id : null, seat: seat ? seat.no : null, why }); try { ws.close(code); } catch { /* gone */ } };
  const helloTimer = setTimeout(() => { if (!s) close(4401, 'no hello'); }, hooks.helloMs);
  helloTimer.unref?.();
  // The round trip, for the quiz's timing (a device's own measure is trusted within one round trip).
  ws.on('pong', () => { alive = true; if (seat && pingAt) seat.rtt = Math.min(2000, LS.hooks.now() - pingAt); });
  const ping = setInterval(() => {
    if (!alive) { try { ws.terminate(); } catch { /* gone */ } return; }
    alive = false; pingAt = LS.hooks.now(); try { ws.ping(); } catch { /* gone */ }
  }, hooks.pingMs);
  ping.unref?.();

  ws.on('message', (data, isBinary) => {
    if (isBinary) return close(1003, 'binary');
    const raw = String(data);
    const max = role === 'host' ? P.MAX.host : P.MAX.player;
    if (raw.length > max) return close(4413, 'too big');
    if (!s) return hello(raw);
    const m = P.parse(raw, role);
    if (!m) return;
    const b = role === 'host' ? s.host.buckets : seat.buckets;
    if (b && !b.take(m.t)) { if (b.dropped(m.t)) close(4429, 'flood'); return; }
    if (s.phase === 'ended') return;
    try { (role === 'host' ? fromHost : fromPlayer)(m); } catch (e) { hooks.log('error', 'live message failed', { sid: s.id, error: e.message }); }
  });
  ws.on('close', () => {
    clearTimeout(helloTimer); clearInterval(ping); live.delete(ws);
    if (!s) return;
    if (role === 'host') LS.detachHost(s, ws); else LS.detachSeat(s, seat, ws);
  });
  ws.on('error', () => {});

  function hello(raw) {
    const m = P.parse(raw, 'host') || P.parse(raw, 'player');
    if (!m || m.t !== 'hello') return close(4401, 'no hello');
    if (m.v !== P.V) return close(4400, 'version');
    const tok = readToken(m.tok);
    const sess = tok && LS.get(tok.s);
    if (!sess || sess.phase === 'ended') { LS.sendTo(ws, { t: 'bye', why: 'ended' }); return close(4404, 'no session'); }
    const { u } = userFromRequest(req);
    if (tok.r === 'h') {
      if (!u || u.id !== sess.host.userId || tok.u !== u.id || tok.k !== sess.host.nonce) return close(4401, 'not host');
      clearTimeout(helloTimer);
      s = sess; role = 'host';
      LS.attachHost(s, ws);
      return;
    }
    if (sess.banned.has(tok.k) || (tok.u && sess.banned.has(tok.u))) { LS.sendTo(ws, { t: 'bye', why: 'removed' }); return close(4403, 'removed'); }
    const st = LS.seatFor(sess, tok);
    if (!st) { LS.sendTo(ws, { t: 'bye', why: 'expired' }); return close(4404, 'no seat'); }
    // A signed-in player's seat goes with their sign-in (a guest's with the token alone).
    if (tok.u && (!u || u.id !== tok.u)) return close(4401, 'not you');
    if (!A.seatCanView(sess, tok.u ? u : null)) { LS.sendTo(ws, { t: 'bye', why: 'takenDown' }); return close(4404, 'taken down'); }
    if (!allow(`lv-ws-seat:${sess.id}:${st.no}`, LIMITS.perSeat, 60e3)) return close(4429, 'seat reconnects');
    clearTimeout(helloTimer);
    s = sess; seat = st; role = 'player';
    LS.attachSeat(s, seat, ws);
  }

  function common(m) {
    if (m.t === 'pi') { LS.sendTo(ws, { t: 'po', c: m.c, s: LS.hooks.now() }); return true; }
    if (m.t === 'fr') { LS.sendTo(ws, { t: 'fr', f: m.f, tok: LS.frameToken(s, seat, m.f) }); return true; }
    return false;
  }
  function fromPlayer(m) {
    if (common(m)) return;
    switch (m.t) {
      case 'rdy': return LS.ready(s, seat, m.view);
      case 'mv': return LS.move(s, seat, m.p);
      case 'ev': return LS.event(s, seat, m);
      case 'sc': return LS.score(s, seat, m.n);
      case 'it': return LS.item(s, seat, m.i, m.ok);
      case 'an': return LS.answer(s, seat, m, LS.hooks.now());
      case 'em': return LS.emote(s, seat, m.e);
      default: return undefined;
    }
  }
  function fromHost(m) {
    if (common(m)) return;
    switch (m.t) {
      case 'rdy': return LS.hostReady(s, m.cfg);
      case 'h': return LS.hostAction(s, m.a, { n: m.n, at: m.at });
      case 'st': return LS.setState(s, m.d);
      case 'ev': return LS.event(s, null, m);
      default: return undefined;
    }
  }
}

/** Open live sockets (tests, shutdown). */
export const socketCount = () => live.size;
/** Shutdown: every session is saved and told to come back (bye restart), then the sockets close. */
export function drainLive() {
  const n = LS.drainLiveSessions();
  for (const ws of live) { try { ws.close(4503); } catch { /* gone */ } }
  return n;
}
