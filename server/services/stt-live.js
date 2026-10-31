// Live speech to text: words show in the Studio's chat box while the kid speaks (docs/decisions.md "Live speech to
// text"). The page streams the mic as 16-bit mono PCM over a WebSocket to this relay (same origin: the key never leaves
// the server and the CSP is unchanged); the relay forwards it to the provider's realtime API (stt.js openRealtime) and
// sends back the words so far, always tidied and with rude words starred (never a raw piece from the provider).
// - The same rules as POST /api/studio/:id/transcribe: a real kid account, the game's owner (or an admin), the Builder
//   on for the account, clips a minute (the same bucket), clips a day, the site's minutes and the AI spending caps.
//   Refusals before the upgrade are plain HTTP errors; the rest come as a message the page can show in the kid's
//   language, and the provider is never contacted for any of them.
// - One session is one clip (counted when it opens); its seconds are the audio bytes the relay received, which the page
//   can't fake, counted once when it ends. The longest recording (STT_MAX_SECONDS) is the same as for uploads.
// - Audio is never stored: each frame is forwarded and dropped. Log lines have numbers only (no words, no audio).
// - When the live link fails (provider, network, a restart, no audio reaching us), the page uploads the clip it kept in
//   memory to /transcribe once, with X-Live-Id, so that upload is not counted as a second clip (its seconds are: that
//   audio went to the service again). The ids are in SQLite (stt_live: ids only), so this holds after a restart too.
// - Frames that arrive before the provider is ready (the page sends from the first moment) are held in memory and sent
//   once it is, so the first words are never lost; they count as seconds only once they reach the provider.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { userFromRequest } from '../auth.js';
import { attachUpgrades, refuse, originOk } from './upgrade.js';
import * as games from './games.js';
import { allow } from './ratelimit.js';
import * as sttUsage from './stt-usage.js';
import { liveEnabled, openRealtime, SttError, RATE } from './stt.js';
import { allowanceFor } from '../builder/usage.js';
import { lifecycle } from './health.js';
import { log } from './log.js';
import { q } from '../db.js';
import { pickLocale, tFor, readCookie, COOKIE as LANG_COOKIE } from '../i18n/index.js';

export const PATH = /^\/api\/studio\/([A-Za-z0-9_-]{1,64})\/listen$/;
/** Largest audio frame the page may send (the page sends about 100 ms at a time: 4.8 KB at 24 kHz). */
export const MAX_FRAME = 64 * 1024;
/** Tests shorten these. */
export const hooks = { idleMs: 10000, extraMs: 15000, textEveryMs: 125, fallbackMs: 120000, log };

const open = new Map();       // userId -> socket: one live mic per account at a time
// liveId -> { userId, gameId, end }: the sessions open in this process. end(): the upload overtook the page's close,
// so the upload ends the session as failed.
const sessions = new Map();
let wss = null;
// Every session also has a row in stt_live from its start ('open', until it could last at most plus fallbackMs). One
// that ended with its words (or was cancelled, or broke the rules) loses its row; one that failed, or whose page went
// away, is 'failed' until fallbackMs after it ended. A row left 'open' by a process that stopped can still be used.
const openUntil = () => Date.now() + config.sttMaxSeconds * 1000 + hooks.extraMs + hooks.fallbackMs;

/** A live session's id, for its one fallback upload to /transcribe. -> true once, for the same user and game, if the
 *  session failed (or is ended now, as failed) and has not been used, in this process or before a restart. */
export function consumeFallback(liveId, userId, gameId) {
  const id = String(liveId || '').slice(0, 64); if (!id) return false;
  const f = sessions.get(id);
  if (f) { if (f.userId !== userId || f.gameId !== gameId) return false; f.end(); }
  return q.run('DELETE FROM stt_live WHERE id=? AND user_id=? AND game_id=? AND until>?', id, userId, gameId, Date.now()).changes === 1;
}
function forgetOld() { q.run('DELETE FROM stt_live WHERE until<=?', Date.now()); }


/** The checks before a socket is opened, the same as the HTTP routes (requireBuilder, loadEditable). -> { status } | { user, game } */
export function gate(req, id) {
  if (lifecycle.draining || config.maintenance || config.movedTo) return { status: 503, why: 'closed' };
  // A WebSocket has no CORS: without this, another site could open one with the kid's cookie.
  if (!originOk(req)) return { status: 403, why: 'origin' };
  const { u: user } = userFromRequest(req);
  if (!user) return { status: 401, why: 'signed out' };
  // Grown-ups build too (requireBuilder): any real account but a guest, the same as /transcribe.
  if (user.is_guest) return { status: 403, why: 'guest' };
  if (!liveEnabled()) return { status: 404, why: 'live off' };
  const game = games.getGame(id);
  if (!game || !games.canEdit(user, game)) return { status: 404, why: 'not editable' };
  return { user, game };
}

/** The live mic's route for the one upgrade listener (services/upgrade.js). */
export const route = {
  name: 'stt',
  match: PATH,
  handle(req, socket, head, m) {
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false, clientTracking: false });
    let g;
    try { g = gate(req, m[1]); } catch { return refuse(socket, 500); }
    if (g.status) { hooks.log('info', 'live mic refused', { status: g.status, why: g.why || '' }); return refuse(socket, g.status); }
    wss.handleUpgrade(req, socket, head, ws => session(ws, req, g.user, g.game));
  },
};

/** Listen for live mic sessions only (tests; server/index.js attaches every route at once). Other upgrades: 404. */
export function attachLive(server) {
  attachUpgrades(server, [route]);
  return wss;
}

/** Shutdown (server/shutdown.js): every open session is told to fall back to the upload, then closed. -> how many. */
export function drainLive() {
  let n = 0;
  for (const ws of open.values()) { n++; try { ws.oombaDrain(); } catch { /* gone */ } }
  return n;
}
export const openCount = () => open.size;

function session(ws, req, user, game) {
  const locale = pickLocale({ cookie: readCookie(req, LANG_COOKIE), user, acceptLanguage: req.headers['accept-language'] }).locale;
  const t = tFor(locale);
  const send = obj => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const refuseWith = (code, key, closeCode) => { send({ type: 'error', code, error: t(key), fallback: false }); ws.close(closeCode); };
  // The Builder is off for this account: no voice leaves the site (the page has no mic then; this is the guard).
  if (!user.builder_enabled) return refuseWith('builder_off', 'studio.api.buildingOff', 4403);
  if (open.has(user.id)) return refuseWith('busy', 'studio.mic.oneAtATime', 4409);
  if (!allow(`stt:${user.id}`, config.sttPerMinute, 60e3)) return refuseWith('fast', 'studio.mic.tooFast', 4429);
  const pool = allowanceFor(user).pool;
  const why = sttUsage.blocked(user.id, pool);
  if (why === 'daily') return refuseWith('daily', 'studio.mic.daily', 4429);
  if (why) return refuseWith('site', 'studio.mic.busy', 4503);

  const provider = config.sttProvider, rate = RATE[provider];
  const maxBytes = Math.floor(config.sttMaxSeconds * rate) * 2;
  const liveId = crypto.randomBytes(12).toString('base64url');
  const t0 = Date.now();
  let bytes = 0, state = 'opening', ended = false, rt = null, idle = null, textTimer = null, pending = null, lastSent = '', lastAt = 0;
  let early = [], earlyBytes = 0;   // frames before the provider is ready (memory only)
  open.set(user.id, ws);
  forgetOld();
  sessions.set(liveId, { userId: user.id, gameId: game.id, end: () => fallBack('upload') });
  q.run("INSERT INTO stt_live(id, user_id, game_id, state, until) VALUES (?,?,?,'open',?)", liveId, user.id, game.id, openUntil());
  sttUsage.record(user.id, 0, provider, pool);   // the clip, once; its seconds when it ends
  send({ type: 'open', liveId });

  const wall = setTimeout(() => (state === 'finishing' ? fallBack('timeout') : stop()), (config.sttMaxSeconds * 1000) + hooks.extraMs);
  const bumpIdle = () => { clearTimeout(idle); idle = setTimeout(() => stop(), hooks.idleMs); };
  const flushText = () => { textTimer = null; if (pending !== null && pending !== lastSent && state !== 'done') { lastSent = pending; lastAt = Date.now(); send({ type: 'text', text: pending }); } pending = null; };
  const onText = text => {
    if (state === 'done' || state === 'finishing') return;
    pending = text;
    if (textTimer) return;
    const wait = Math.max(0, hooks.textEveryMs - (Date.now() - lastAt));
    if (!wait) flushText(); else textTimer = setTimeout(flushText, wait);
  };
  function end(code) {
    if (ended) return; ended = true; state = 'done';
    clearTimeout(wall); clearTimeout(idle); clearTimeout(textTimer);
    if (rt) rt.abort();
    if (open.get(user.id) === ws) open.delete(user.id);
    early = []; earlyBytes = 0;
    // Words given, cancelled or a broken page: no upload may follow. Anything else: one, within fallbackMs.
    sessions.delete(liveId);
    if (['ok', 'cancel', 'bad'].includes(code)) q.run('DELETE FROM stt_live WHERE id=?', liveId);
    else q.run("UPDATE stt_live SET state='failed', until=? WHERE id=?", Date.now() + hooks.fallbackMs, liveId);
    const seconds = bytes / 2 / rate;
    sttUsage.addSeconds(user.id, seconds, provider, pool);
    hooks.log('info', 'speech to text', { mode: 'live', seconds: Math.round(seconds * 100) / 100, ms: Date.now() - t0, provider, code });
  }
  /** The live link failed: the page may upload its clip once instead. */
  function fallBack(code) {
    if (ended) return;
    send({ type: 'error', code, error: t(code === 'busy' ? 'studio.mic.busy' : 'studio.mic.failed'), fallback: true, liveId });
    end(code);
    ws.close(code === 'restart' ? 4503 : 4502);
  }
  ws.oombaDrain = () => fallBack('restart');
  function stop() {
    if (state !== 'live' && state !== 'opening') return;
    // No audio reached the provider (stopped before it was ready, or the page's audio never ran: an iPhone's audio
    // suspended, say): the words can't come from here, so the page uploads the clip it recorded instead.
    if (state === 'opening' || !bytes) return fallBack('silent');
    state = 'finishing'; clearTimeout(idle); clearTimeout(textTimer); textTimer = null;
    rt.finish().then(text => {
      if (ended) return;
      send({ type: 'final', text });
      end('ok'); ws.close(1000);
    }, e => fallBack(e instanceof SttError ? e.code : 'provider'));
  }
  function cancel() { if (ended) return; end('cancel'); ws.close(1000); }

  try {
    rt = openRealtime({ locale, onText, onError: e => fallBack(e instanceof SttError ? e.code : 'provider') });
  } catch (e) { return fallBack(e instanceof SttError ? e.code : 'provider'); }
  /** Audio for the provider: counted, cut at the longest recording. */
  function forward(buf) {
    const room = maxBytes - bytes;
    const part = buf.length > room ? buf.subarray(0, room) : buf;
    if (part.length) { bytes += part.length; rt.append(part); }
    if (bytes >= maxBytes) { send({ type: 'limit' }); stop(); }
  }
  rt.ready.then(() => {
    if (ended) return;
    state = 'live'; bumpIdle();
    send({ type: 'ready', rate, maxMs: config.sttMaxSeconds * 1000, liveId });
    const held = early; early = []; earlyBytes = 0;
    for (const b of held) { if (state !== 'live') break; forward(b); }
  }, e => fallBack(e instanceof SttError ? e.code : 'provider'));

  ws.on('message', (data, isBinary) => {
    if (ended) return;
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
      if (buf.length % 2) { cancelBad(); return; }
      if (state === 'opening') {
        // Before the provider is ready: held (never more than the longest recording), sent when it is.
        const room = maxBytes - earlyBytes;
        if (room > 0) { const part = buf.length > room ? Buffer.from(buf.subarray(0, room)) : buf; early.push(part); earlyBytes += part.length; }
        return;
      }
      if (state !== 'live') return;   // while finishing: dropped and not counted
      bumpIdle();
      forward(buf);
      return;
    }
    let m; try { m = JSON.parse(String(data)); } catch { m = null; }
    if (m && m.type === 'stop') return stop();
    if (m && m.type === 'cancel') return cancel();
    cancelBad();
  });
  function cancelBad() { end('bad'); ws.close(1003); }
  ws.on('close', () => {
    // The page went away (a closed tab, a lost connection) before the words came: it may upload instead.
    if (!ended) end('closed');
  });
  ws.on('error', () => {});
}
