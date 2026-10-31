// Oomba Live: what the host and player pages share (docs/live-protocol.md). The socket (same origin, hello with the seat
// or host token, backoff on a drop, reconnect when the page comes back), the server clock (median of five pings), the
// game frame bridge, and avatar portraits drawn by the Oomba Kit in a hidden same-origin frame.
//
// The frame bridge (docs/safety.md §12): the game runs in the usual sandboxed frame (/live/frame/<token>: opaque origin,
// no network). Its SDK makes a MessagePort and hands it over with its first brb:ready; all live traffic goes over that
// port, never over window.postMessage. A frame that loads a second time (it navigated itself) is torn down and loaded
// again with a fresh token, so a page the game navigated to never gets the port or any roster data. Every message from
// the frame is checked again here (type, shape, size) before it goes to the server, which checks it a third time.

export const SANDBOX = 'allow-scripts allow-pointer-lock allow-orientation-lock';
const OUT_TYPES = new Set(['rdy', 'mv', 'ev', 'sc', 'it', 'an', 'em', 'st']);
const HOST_OUT = new Set(['rdy', 'ev', 'st']), PLAYER_OUT = new Set(['rdy', 'mv', 'ev', 'sc', 'it', 'an', 'em']);
// What the frame never sees: tokens, the join code, results links, report counts.
const PRIVATE = new Set(['fr', 'res', 'rp', 'lk', 'bye']);

/** The socket. opts: { tok, onMessage(m), onState('open'|'closed'|'retry'|'gone'), onClock(offset) } -> { send(t, m), close(), offset() } */
export function connect({ tok, onMessage, onState = () => {}, onClock = () => {} }) {
  let ws = null, tries = 0, closed = false, timer = null, pings = [], off = 0, pingTimer = null, lastPing = 0;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/ws`;
  function open() {
    if (closed) return;
    try { ws = new WebSocket(url); } catch { return retry(); }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ t: 'hello', v: 1, tok })); onState('open'); pings = []; ping(); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'po') return pong(m);
      if (m.t === 'bye') { closed = ['removed', 'ended', 'replaced', 'expired', 'takenDown', 'flood', 'full', 'locked'].includes(m.why); }
      onMessage(m);
    };
    ws.onclose = ev => {
      clearInterval(pingTimer); pingTimer = null;
      // 4000 ended, 4403 removed, 4404 no session or seat, 4409 another device, 4401 not you: no point trying again.
      if ([4000, 4401, 4403, 4404, 4409, 4400].includes(ev.code)) { closed = true; onState('gone', ev.code); return; }
      if (!closed) retry();
    };
    ws.onerror = () => {};
  }
  function retry() {
    if (closed || timer) return;
    onState('retry');
    const wait = [500, 1000, 2000, 4000][Math.min(3, tries++)];
    timer = setTimeout(() => { timer = null; open(); }, wait);
  }
  // Clock: five pings a second apart at first, then one every 20 s; the offset is the median of the last five.
  function ping() {
    if (!ws || ws.readyState !== 1) return;
    lastPing = Date.now(); ws.send(JSON.stringify({ t: 'pi', c: lastPing }));
    if (!pingTimer) pingTimer = setInterval(() => { if (pings.length < 5 || Date.now() - lastPing > 20e3) ping(); }, 1100);
  }
  function pong(m) {
    const t = Date.now(), rtt = t - m.c;
    if (!(rtt >= 0 && rtt < 10e3)) return;
    pings.push(m.s - (m.c + t) / 2); if (pings.length > 5) pings.shift();
    const sorted = pings.slice().sort((a, b) => a - b); off = sorted[Math.floor(sorted.length / 2)];
    onClock(off);
  }
  // Coming back to the page (a phone woke up): reconnect at once.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !closed && (!ws || ws.readyState > 1)) { clearTimeout(timer); timer = null; tries = 0; open(); } });
  open();
  return {
    send(t, m = {}) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ ...m, t })); return true; } return false; },
    close() { closed = true; clearTimeout(timer); clearInterval(pingTimer); try { ws && ws.close(1000); } catch { /* gone */ } },
    offset: () => off,
    serverNow: () => Date.now() + off,
  };
}

/**
 * The game frame. stage: where it goes; role: 'player'|'host'; getToken(f) -> Promise<token> (a fresh frame token);
 * onReady({view, cfg}) when the frame's game says it is ready (Oomba.live.ready); onOut(t, m) for each checked message to
 * the server; title: for the iframe. -> { load(token, f, view), send(m), clock(serverNow), destroy(), get ready() }
 */
export function gameFrame({ stage, role, getToken, onReady = () => {}, onOut = () => {}, title = '' }) {
  let iframe = null, port = null, loads = 0, kind = 'game', view = '3d', ready = false, gen = 0, settled = false;
  const allowed = role === 'host' ? HOST_OUT : PLAYER_OUT;
  function onWindowMessage(e) {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== 'null') return;
    const d = e.data;
    if (!d || d.brb !== 1 || d.type !== 'brb:ready' || port || !e.ports || !e.ports[0]) return;
    // The first brb:ready of this frame's first load hands over its port; nothing else is ever accepted.
    if (loads > 1) return;
    port = e.ports[0];
    const mine = gen;
    port.onmessage = ev => { if (mine === gen) fromFrame(ev.data); };
    flushQueue();
  }
  addEventListener('message', onWindowMessage);
  let queue = [];
  function flushQueue() { const q = queue; queue = []; for (const m of q) port.postMessage(m); }
  function fromFrame(m) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !OUT_TYPES.has(m.t) || !allowed.has(m.t)) return;
    let json; try { json = JSON.stringify(m); } catch { return; }
    if (json.length > (role === 'host' ? 16 * 1024 : 2048)) return;
    if (m.t === 'rdy') {
      view = m.view === '2d' ? '2d' : '3d'; ready = true;
      const cfg = role === 'host' && m.cfg && typeof m.cfg === 'object' ? m.cfg : undefined;
      onReady({ view, cfg, kind });
      return;
    }
    const { t, ...rest } = m;
    onOut(t, rest);
  }
  function make(token, f, v) {
    destroyFrame();
    gen++; loads = 0; port = null; ready = false; kind = f; settled = false;
    iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', SANDBOX);
    iframe.setAttribute('allow', 'fullscreen; autoplay');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.title = title;
    iframe.className = 'lv-frame';
    iframe.dataset.kind = f;
    const mine = gen;
    iframe.addEventListener('load', () => {
      if (mine !== gen) return;
      loads++;
      if (loads === 1) { settled = true; return; }
      // A second load: the game navigated its own frame. Tear it down and load the game again with a new token.
      reload();
    });
    // ?okTier=low|mid|high on the page goes on to the game (the kit's device tier: Chromebook testing)
    const tier = /^(low|mid|high)$/.test(new URLSearchParams(location.search).get('okTier') || '') ? new URLSearchParams(location.search).get('okTier') : '';
    const q = [v === '2d' ? 'view=2d' : '', tier ? `okTier=${tier}` : ''].filter(Boolean).join('&');
    iframe.src = `/live/frame/${encodeURIComponent(token)}${q ? `?${q}` : ''}`;
    stage.appendChild(iframe);
  }
  let reloading = false;
  async function reload() {
    if (reloading) return; reloading = true;
    destroyFrame();
    try { const tok = await getToken(kind); if (tok) make(tok, kind, view); } finally { reloading = false; }
  }
  function destroyFrame() {
    gen++;
    if (port) { try { port.close(); } catch { /* gone */ } }
    port = null; queue = []; ready = false;
    if (iframe) { iframe.src = 'about:blank'; iframe.remove(); iframe = null; }
  }
  return {
    load(token, f = 'game', v = '3d') { view = v; make(token, f, v); },
    send(m) {
      if (!m || PRIVATE.has(m.t)) return;
      let out = m;
      if (m.t === 'wel') { const { frame, lobbyFrame, code, ...rest } = m; out = rest; }
      if (port) port.postMessage(out); else if (queue.length < 300) queue.push(out);
    },
    clock(serverNow) { this.send({ t: 'clk', s: serverNow }); },
    destroy() { destroyFrame(); removeEventListener('message', onWindowMessage); },
    reload,
    get ready() { return ready; }, get view() { return view; }, get kind() { return kind; }, get loaded() { return settled; },
    get el() { return iframe; },
  };
}

/** Can this browser draw the 3D games (WebGL 2 and import maps)? */
export function can3d() {
  let maps = true;
  try { if (typeof HTMLScriptElement.supports === 'function') maps = HTMLScriptElement.supports('importmap'); } catch { /* unknown: try */ }
  let gl = null;
  try { gl = document.createElement('canvas').getContext('webgl2'); const lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch { gl = null; }
  return !!gl && maps;
}

/** Avatar portraits: the Oomba Kit in a hidden same-origin frame (as on the Me page). kit: { src, sri }.
 *  -> { draw(canvas, spec, px) } (draws once the kit has loaded). */
export function portraits(kit) {
  let O = null; const waiting = [];
  const fr = document.createElement('iframe');
  fr.hidden = true; fr.tabIndex = -1; fr.setAttribute('aria-hidden', 'true'); fr.title = '';
  document.body.appendChild(fr);
  const doc = fr.contentDocument; doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); doc.close();
  if (kit && kit.src) {
    const s = doc.createElement('script'); s.src = kit.src; s.integrity = kit.sri; s.crossOrigin = 'anonymous';
    s.onload = () => { O = fr.contentWindow.Oomba; for (const w of waiting.splice(0)) paint(...w); O && O.fonts && O.fonts.ready.then(() => {}); };
    doc.head.appendChild(s);
  }
  function paint(canvas, spec, px) {
    try {
      const dpr = Math.min(2, devicePixelRatio || 1), src = O.ui && O.ui.portrait ? O.ui.portrait(spec || { species: 'oomba' }, { size: Math.round(px * dpr) }) : O.art.toCanvas(spec || { species: 'oomba' }, Math.round(px * dpr));
      canvas.width = src.width; canvas.height = src.height;
      const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(src, 0, 0);
    } catch { /* a portrait is a nicety */ }
  }
  return {
    draw(canvas, spec, px = 64) { if (O) paint(canvas, spec, px); else waiting.push([canvas, spec, px]); },
    get ready() { return !!O; },
  };
}

/** A small canvas for a portrait (decorative: the name next to it is the text). */
export function avatarCanvas(cls = 'lv-av', px = 48) {
  const c = document.createElement('canvas'); c.className = cls; c.width = px; c.height = px; c.setAttribute('aria-hidden', 'true'); c.style.inlineSize = c.style.blockSize = `${px}px`;
  return c;
}

export const readJson = id => { const el = document.getElementById(id); if (!el) return {}; try { return JSON.parse(el.textContent); } catch { return {}; } };
/** A roster tuple -> an object. */
export const playerOf = P => ({ seat: P[0], name: P[1], avatar: P[2] || null, team: P[3] || 0, score: P[4] || 0, connected: !!P[5], ready: !!P[6], late: !!P[7] });
export const nameOf = (nicks, name) => (typeof name === 'number' ? nicks[name] || '' : String(name || ''));
/** "{a} of {b}" style templates from the server (already translated). */
export const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
