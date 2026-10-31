// Oomba Live: what the host and player pages share (docs/live-protocol.md). The socket (same origin, hello with the seat
// or host token, backoff on a drop, reconnect when the page comes back), the server clock (median of five pings), the
// game frame bridge, and avatar portraits drawn by the Oomba Kit in a hidden same-origin frame.
//
// The frame bridge (docs/safety.md §12): the game runs in the usual sandboxed frame (/live/frame/<token>: opaque origin,
// no network). Its SDK makes a MessagePort and hands it over with its first brb:ready; all live traffic goes over that
// port, never over window.postMessage. A frame that loads a second time (it navigated itself) is torn down and loaded
// again with a fresh token, so a page the game navigated to never gets the port or any roster data. Every message from
// the frame is checked again here (type, shape, size) before it goes to the server, which checks it a third time.

import { format } from '/js/i18n-format.js';
import { INTL } from '/js/i18n.js';

export const SANDBOX = 'allow-scripts allow-pointer-lock allow-orientation-lock';
const OUT_TYPES = new Set(['rdy', 'mv', 'ev', 'sc', 'it', 'an', 'em', 'st']);
const HOST_OUT = new Set(['rdy', 'ev', 'st']), PLAYER_OUT = new Set(['rdy', 'mv', 'ev', 'sc', 'it', 'an', 'em']);
// What the frame never sees: tokens, the join code, results links, report counts; and (part 3) a seat's own support
// (me: game code, maybe another child's, must never learn it), the play-again token, the host's settings and teacher
// messages (the page shows those itself), and the dashboard's data.
const PRIVATE = new Set(['fr', 'res', 'rp', 'lk', 'bye', 'me', 'again', 'cf', 'tml', 'dq', 'dp', 'sup', 'eyes', 'say']);

/** The socket. opts: { tok, view?, onMessage(m), onState('open'|'closed'|'retry'|'gone'), onClock(offset) } -> { send(t, m), close(), offset() }
 *  view: 'dash' for the teacher's dashboard (the same host token; the projector is the default). */
export function connect({ tok, view = '', onMessage, onState = () => {}, onClock = () => {} }) {
  let ws = null, tries = 0, closed = false, timer = null, pings = [], off = 0, pingTimer = null, lastPing = 0;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/ws`;
  function open() {
    if (closed) return;
    try { ws = new WebSocket(url); } catch { return retry(); }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ t: 'hello', v: 1, tok, ...(view ? { view } : {}) })); onState('open'); pings = []; ping(); };
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
      if (m.t === 'wel') {
        const { frame, lobbyFrame, code, dp, sup, dq, ...rest } = m;
        out = rest;
        if (rest.me && rest.me.acc) { const { acc, ...me } = rest.me; out = { ...rest, me }; }
      }
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
/** Templates from the server (already translated, ICU-lite: "{a} of {b}", plurals) filled in the page's language. */
export const fill = (s, vars) => { try { return format(String(s || ''), vars || {}, INTL); } catch { return String(s || ''); } };

// ---------------------------------------------------------------- part 3: teams, read aloud
/** A team's shape as inline SVG (<use> of the page's #lv-shapes sprite): drawn, never a font glyph. */
export function shapeSvg(shape, cls = 'lv-shape') {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), use = document.createElementNS(NS, 'use');
  svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('viewBox', '0 0 24 24');
  use.setAttribute('href', `#lv-shape-${shape}`); svg.append(use); return svg;
}
/** Paint an element in a team's colours (--team, --team-ink) and mark it with data-team. */
export function paintTeam(el, preset, k) {
  if (!el) return el;
  if (preset) { el.style.setProperty('--team', preset.color); el.style.setProperty('--team-ink', preset.ink); el.dataset.team = String(k || ''); }
  else { el.style.removeProperty('--team'); el.style.removeProperty('--team-ink'); delete el.dataset.team; }
  return el;
}
/** A team chip: shape, icon and name (the name is the text; the shape and icon are decoration). */
export function teamChip(preset, k, extra = '') {
  const s = document.createElement('span'); s.className = 'lv-team-chip'; paintTeam(s, preset, k);
  if (!preset) return s;
  const ic = document.createElement('span'); ic.setAttribute('aria-hidden', 'true'); ic.textContent = preset.icon;
  const nm = document.createElement('span'); nm.className = 'lv-team-name'; nm.textContent = preset.name;
  s.append(shapeSvg(preset.shape), ic, nm);
  if (extra) { const x = document.createElement('span'); x.className = 'lv-team-extra'; x.textContent = extra; s.append(x); }
  return s;
}
/** Team state from tms: { on, n, scoring, choose, locked, list: [{k, p, size}], of: Map(seat -> k) }. */
export function teamsOf(m) {
  const of = new Map(); for (const r of (m && m.m) || []) of.set(r[0], r[1]);
  return { on: !!(m && m.on), n: (m && m.n) || 0, scoring: (m && m.scoring) || 'avg', choose: !!(m && m.choose), locked: !!(m && m.locked), list: ((m && m.teams) || []).map(r => ({ k: r[0], p: r[1], size: r[2] })), of };
}
/** Team scores from ts: Map(k -> {score, rank, sum, avg}). */
export function scoresOf(rows, into = new Map()) { for (const r of rows || []) into.set(r[0], { score: r[1], rank: r[2], sum: r[3], avg: r[4] }); return into; }
/** Ordinal-free rank text: "{rank} of {count}" templates come from the server. */
/** Read text aloud in a language (speechSynthesis), if the browser has a voice for it. -> true when it spoke. */
export function speak(text, lang) {
  try {
    const ss = window.speechSynthesis; if (!ss || !text) return false;
    const u = new SpeechSynthesisUtterance(String(text)); if (lang) u.lang = lang;
    const v = voiceFor(lang); if (v) u.voice = v;
    ss.cancel(); ss.speak(u); return true;
  } catch { return false; }
}
export function voiceFor(lang) {
  try {
    const vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    const base = String(lang || '').toLowerCase().split('-')[0];
    return vs.find(v => v.lang && v.lang.toLowerCase() === String(lang || '').toLowerCase()) || vs.find(v => v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === base) || null;
  } catch { return null; }
}
/** A toast in a fixed element for ms (role=status is on the element). */
export function flash(el, text, ms = 4000) {
  if (!el) return; el.textContent = text; el.hidden = false;
  clearTimeout(el._lvT); el._lvT = setTimeout(() => { el.hidden = true; }, ms);
}
