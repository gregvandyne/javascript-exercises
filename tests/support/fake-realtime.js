// A local stand-in for the speech services' realtime APIs (server/services/stt.js openRealtime), for unit tests: a
// WebSocket server on 127.0.0.1 that speaks OpenAI's realtime transcription protocol (/v1/realtime) and ElevenLabs'
// (/v1/speech-to-text/realtime). Each test gives it a script; it records what it was sent (event types, the URL, the
// key header and how many audio bytes, never the audio itself).
//   const fake = await startFakeRealtime(); stt.hooks.realtimeBase = fake.base;
//   fake.script = { onAudio(ctx, bytesSoFar), onCommit(ctx), onOpen(ctx), updatedDelayMs, noSessionUpdated }
//   (ctx.send(obj), ctx.close(code))
// Messages are handled one at a time, in order (a handler may be async), and every session.update is answered with
// session.updated after the handlers before it finished: as the real service answers events in order.
import { WebSocketServer } from 'ws';

export async function startFakeRealtime() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(r => wss.once('listening', r));
  const fake = {
    base: `ws://127.0.0.1:${wss.address().port}`,
    connections: [],   // { path, query, headers, events: [type], audioBytes, sessionUpdate }
    script: {},
    get last() { return fake.connections[fake.connections.length - 1]; },
    reset() { fake.connections.length = 0; fake.script = {}; },
    close: () => new Promise(r => { for (const c of wss.clients) c.terminate(); wss.close(r); }),
  };
  wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'http://x');
    const kind = u.pathname === '/v1/realtime' ? 'openai' : u.pathname === '/v1/speech-to-text/realtime' ? 'elevenlabs' : null;
    const c = { kind, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, events: [], audioBytes: 0, sessionUpdate: null, updates: [], chunks: [] };
    fake.connections.push(c);
    const ctx = { conn: c, send: obj => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }, close: (code = 1000) => ws.close(code), terminate: () => ws.terminate(), item: 0 };
    const s = fake.script;
    if (!kind) { ws.close(1008); return; }
    if (s.onOpen) s.onOpen(ctx);
    else if (kind === 'openai') ctx.send({ type: 'session.created', session: {} });
    else ctx.send({ message_type: 'session_started', session_id: 'fake' });
    let chain = Promise.resolve();
    ws.on('message', data => { chain = chain.then(() => handle(data)).catch(() => {}); });
    async function handle(data) {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      const type = m.type || m.message_type; c.events.push(type);
      if (kind === 'openai') {
        if (type === 'session.update') {
          c.sessionUpdate = c.sessionUpdate || m; c.updates.push(m);
          if (s.updatedDelayMs && c.updates.length === 1) await new Promise(r => setTimeout(r, s.updatedDelayMs));   // a slow handshake
          if (!s.noSessionUpdated) ctx.send({ type: 'session.updated', session: m.session });
        }
        else if (type === 'input_audio_buffer.append') { const n = Buffer.from(m.audio, 'base64').length; c.audioBytes += n; c.chunks.push(n); if (s.onAudio) await s.onAudio(ctx, c.audioBytes); }
        else if (type === 'input_audio_buffer.commit') { c.commits = (c.commits || 0) + 1; if (s.onCommit) await s.onCommit(ctx); }
      } else if (type === 'input_audio_chunk') {
        c.chunks.push({ sample_rate: m.sample_rate, commit: m.commit, bytes: Buffer.from(m.audio_base_64 || '', 'base64').length });
        if (m.audio_base_64) { c.audioBytes += Buffer.from(m.audio_base_64, 'base64').length; if (s.onAudio) await s.onAudio(ctx, c.audioBytes); }
        if (m.commit && s.onCommit) await s.onCommit(ctx);
      }
    }
  });
  return fake;
}

/** OpenAI-style scripted words, as the service works: one piece is heard per audio frame, but words come only for
 *  audio that is committed. With turn detection on (the session's turn_detection), a commit after every vadEvery frames
 *  (only between two words); the relay's own commits too. A committed item's deltas then stream, one per following
 *  audio frame, and its "completed" after the last; whatever is left comes at once on a commit (completed: the last
 *  item's final words instead of its pieces, completeDelayMs: its "completed" that much later). A commit with nothing
 *  heard is commit_empty, as the service answers. */
export function openaiWords(pieces, { completed = null, completeDelayMs = 0, vadEvery = 2 } = {}) {
  let i = 0, n = 0, k = 0, prev = null, heard = [], speaking = false;
  const queue = [];
  const vadOn = ctx => !!(ctx.conn.sessionUpdate && ctx.conn.sessionUpdate.session.audio.input.turn_detection);
  const commit = (ctx, byVad = false) => {
    const id = `item_${++k}`;
    if (vadOn(ctx) && speaking && byVad) { ctx.send({ type: 'input_audio_buffer.speech_stopped' }); speaking = false; }
    ctx.send({ type: 'input_audio_buffer.committed', item_id: id, previous_item_id: prev }); prev = id;
    for (const piece of heard) queue.push({ id, piece });
    queue.push({ id, done: heard.join('') });
    heard = [];
  };
  const out = (ctx, x) => (x.piece !== undefined
    ? ctx.send({ type: 'conversation.item.input_audio_transcription.delta', item_id: x.id, content_index: 0, delta: x.piece })
    : ctx.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: x.id, content_index: 0, transcript: x.done }));
  return {
    onAudio(ctx) {
      if (queue.length) out(ctx, queue.shift());
      if (i < pieces.length) { heard.push(pieces[i++]); if (vadOn(ctx) && !speaking) { speaking = true; ctx.send({ type: 'input_audio_buffer.speech_started' }); } }
      n++;
      if (vadOn(ctx) && vadEvery && n % vadEvery === 0 && heard.length && (i >= pieces.length || /^\s/.test(pieces[i]))) commit(ctx, true);
    },
    onCommit(ctx) {
      if (heard.length) commit(ctx); else ctx.send({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty' } });
      const rest = queue.splice(0);
      const last = rest.filter(x => x.done !== undefined).pop();
      if (last && completed != null) last.done = completed;
      for (const x of rest) if (x !== last) out(ctx, x);
      if (last) { if (completeDelayMs) setTimeout(() => out(ctx, last), completeDelayMs); else out(ctx, last); }
    },
  };
}
