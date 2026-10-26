// The live view of a game's Builder builds for one browser tab: an SSE response subscribed to the runner
// (runner.attach). GET /api/studio/:id/live opens one per Studio tab: hello (the running build and its transcript
// entries), the replay of what it did so far, caughtup, then live events, and it stays open between builds, so a build
// started in another tab or on another device reaches it. The streamed POST of pages loaded before builds ran on their
// own uses the same subscriber (compat: no hello/caughtup/turn, and it ends when the build does).
// Closing a stream never stops a build. A stream stays authorised: every 15 s (with the ping) the viewer's session and
// edit rights are checked again (signedout / gone, then it closes), and signing out or "sign out everywhere" closes the
// streams of those sessions at once (auth.onSessionsEnded). A slow reader is closed; it reconnects and gets a full replay.
import { sessionUser, onSessionsEnded } from '../auth.js';
import * as games from '../services/games.js';
import * as runner from './runner.js';
import * as turns from './turns.js';

export const CHECK_MS = 15e3;
const subs = new Set();
const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' };
const frame = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

/** Live streams open now (not the streamed POSTs) for a game and for a user. */
export function counts(gameId, userId) {
  let game = 0, user = 0;
  for (const s of subs) if (!s.compat) { if (s.gameId === gameId) game++; if (s.userId === userId) user++; }
  return { game, user };
}

/** Write the SSE headers (once). */
export function sseHeaders(res) {
  if (res.headersSent) return;
  res.writeHead(200, SSE_HEADERS);
  if (res.flushHeaders) res.flushHeaders();
}

/**
 * Subscribe an Express response to a game's builds. req: an authorised request (req.user can edit the game).
 * opts: { compat, job }: compat = the streamed POST of an old page, which ends once job (and the game) is idle.
 * -> the subscriber, or null when it answered 429 (too many streams for this game or this user).
 */
export function open(req, res, game, { compat = false, job = null } = {}) {
  if (!compat) {
    const n = counts(game.id, req.user.id);
    if (n.game >= runner.LIMITS.subsPerGame || n.user >= runner.LIMITS.subsPerUser) { res.status(429).json({ error: req.t('studio.api.liveBusy') }); return null; }
  }
  sseHeaders(res);
  if (!compat) res.write('retry: 3000\n\n');
  // Shutting down with no build running here: come back in a moment (the server is about to close).
  if (!compat && runner.life.draining && !runner.jobFor(game.id)) { res.end(frame('restart', { retryMs: 5000, resume: false })); return null; }
  if (res.destroyed) return null;   // the tab already went away
  const sub = {
    userId: req.user.id, sessionId: req.sessionId, locale: (req.t && req.t.locale) || 'en', compat, gameId: game.id,
    owner: req.user.id === game.owner_id, closed: false, ping: null,
    send(name, data) {
      if (sub.closed || res.writableEnded) return;
      res.write(frame(name, data));
      if (name === 'done' && sub.owner) turns.markSeen(sub.gameId);   // the owner watched it end: no "ready" news
      if (res.writableLength > runner.LIMITS.slowBytes) sub.close();
    },
    /** End the stream, after one last event (signedout, gone) when given. The build goes on. */
    close(event = null) {
      if (sub.closed) return;
      if (event && !res.writableEnded) res.write(frame(event, {}));
      gone(sub);
      if (!res.writableEnded) res.end();
    },
  };
  const gone = s => { s.closed = true; runner.detach(s); subs.delete(s); clearInterval(s.ping); };
  res.on('close', () => gone(sub));
  res.on('error', () => gone(sub));
  subs.add(sub);
  sub.ping = setInterval(() => { check(sub); if (!sub.closed && !res.writableEnded) res.write(': ping\n\n'); }, CHECK_MS);
  sub.ping.unref();
  runner.attach(game.id, sub);
  if (compat && job) runner.idle(job).then(() => sub.close(), () => sub.close());
  return sub;
}

/** Still signed in (the same rules as every request) and still allowed to edit the game? Otherwise say why and close. */
function check(sub) {
  if (sub.closed) return;
  const u = sessionUser(sub.sessionId);
  if (!u) return sub.close('signedout');
  if (!games.canEdit(u, games.getGame(sub.gameId))) return sub.close('gone');
}
/** Tests: run the 15-second checks now. */
export function _tick() { for (const sub of [...subs]) check(sub); }

// Sign out (this session) and sign out everywhere or a password change (every session of the user, but except).
onSessionsEnded(({ sessionId = null, userId = null, except = null }) => {
  for (const sub of [...subs]) {
    if ((sessionId && sub.sessionId === sessionId) || (userId && sub.userId === userId && sub.sessionId !== except)) sub.close('signedout');
  }
});
