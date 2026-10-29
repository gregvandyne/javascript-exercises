/* Oomba Academy in-frame SDK. Injected (inline) into every game frame before the game's own code.
 * Games run in an opaque-origin sandbox with no network; everything they may do with the platform
 * goes through window.BRB and postMessage to the parent play page, which validates every message.
 * Docs: docs/sdk.md */
(function () {
  'use strict';

  // ---- Lockdown: runs before any game code --------------------------------------------
  // The frame CSP already blocks fetch / XHR / WebSocket / EventSource, but two gaps are not
  // covered by any CSP directive, so we close them here, before the game's scripts run:
  //   1. WebRTC. No browser has a CSP directive for it, so connect-src 'none' does not stop a
  //      data channel. We delete every WebRTC entry point from this window, non-restorable.
  //   2. Window borrowing. The sanitizer removes <iframe>/<object>/<embed>/<frame> from stored
  //      HTML, but a game can still build one at runtime and reach a fresh window through it
  //      (a new browsing context has its own, un-deleted, WebRTC + network constructors). We
  //      make that inner window unreachable: contentWindow/contentDocument return null, and a
  //      frame-making element can never be attached to the page, so no child context is created
  //      (which also means window.frames stays empty and window[0] stays undefined).
  // Everything is defined non-configurable / non-writable so game code cannot put it back.
  (function lockdown() {
    var def = function (obj, name, desc) {
      try { Object.defineProperty(obj, name, desc); return true; } catch (e) { return false; }
    };
    var hardUndefined = function (obj, names) {
      names.forEach(function (n) {
        if (!def(obj, n, { value: undefined, writable: false, configurable: false, enumerable: false })) {
          try { obj[n] = undefined; } catch (e) { /* ignore */ }
        }
      });
    };
    // WebRTC: peer connection, data channel and every helper type we know of.
    hardUndefined(window, ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection',
      'RTCDataChannel', 'webkitRTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
      'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver', 'RTCCertificate', 'RTCDtlsTransport',
      'RTCIceTransport', 'RTCSctpTransport', 'RTCDataChannelEvent', 'RTCPeerConnectionIceEvent',
      'RTCPeerConnectionIceErrorEvent', 'RTCTrackEvent', 'RTCStatsReport', 'RTCError', 'RTCErrorEvent']);

    // Inner windows/documents of frame-ish elements are off limits.
    var nullGet = { get: function () { return null; }, configurable: false, enumerable: true };
    ['HTMLIFrameElement', 'HTMLFrameElement', 'HTMLObjectElement', 'HTMLEmbedElement'].forEach(function (c) {
      var proto = window[c] && window[c].prototype; if (!proto) return;
      def(proto, 'contentWindow', nullGet);
      def(proto, 'contentDocument', nullGet);
      if ('getSVGDocument' in proto) def(proto, 'getSVGDocument', { value: function () { return null; }, writable: false, configurable: false });
    });

    // document.write/open could re-open the document and wipe these locks before the game's own
    // scripts re-run, or inject a frame; games never need them.
    def(document, 'write', { value: function () {}, writable: false, configurable: false });
    def(document, 'writeln', { value: function () {}, writable: false, configurable: false });
    def(document, 'open', { value: function () { return document; }, writable: false, configurable: false });

    // Stop a child browsing context from ever being created. If a frame-ish element never joins
    // the live document it gets no window, so there is nothing to borrow and nothing in
    // window.frames. We screen every DOM-insertion path for these tags.
    var FRAME_TAGS = { IFRAME: 1, FRAME: 1, OBJECT: 1, EMBED: 1, PORTAL: 1, FRAMESET: 1 };
    var FRAME_SEL = 'iframe,frame,object,embed,portal,frameset';
    var isFrameish = function (node) {
      try {
        if (node && node.tagName && FRAME_TAGS[node.tagName.toUpperCase()]) return true;
        // A wrapper element (nodeType 1) or a fragment (nodeType 11, e.g. from a <template> or Range) can
        // carry frame elements as descendants; querySelector finds them wherever they are.
        if (node && (node.nodeType === 1 || node.nodeType === 11) && node.querySelector && node.querySelector(FRAME_SEL)) return true;
      } catch (e) { /* ignore */ }
      return false;
    };
    var scrub = function (node) {
      // Remove frame elements from a subtree about to be inserted, leaving the rest intact.
      try {
        if (node && node.tagName && FRAME_TAGS[node.tagName.toUpperCase()]) return null;
        if (node && node.querySelectorAll) {
          var bad = node.querySelectorAll(FRAME_SEL);
          for (var i = 0; i < bad.length; i++) if (bad[i].parentNode) bad[i].parentNode.removeChild(bad[i]);
        }
      } catch (e) { /* ignore */ }
      return node;
    };
    var wrapInsert = function (proto, name) {
      if (!proto || typeof proto[name] !== 'function') return;
      var orig = proto[name];
      def(proto, name, { value: function () {
        var args = arguments;
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (a && typeof a === 'object' && a.nodeType) { if (isFrameish(a)) return a; scrub(a); }
        }
        return orig.apply(this, args);
      }, writable: false, configurable: false });
    };
    ['appendChild', 'insertBefore', 'replaceChild', 'moveBefore'].forEach(function (m) { wrapInsert(window.Node && Node.prototype, m); });
    ['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren'].forEach(function (m) {
      wrapInsert(window.Element && Element.prototype, m);
      wrapInsert(window.DocumentFragment && DocumentFragment.prototype, m);
      wrapInsert(window.Document && Document.prototype, m);
    });
    // insertAdjacentElement returns the element but never attaches a frame (nor a wrapper carrying one);
    // a safe element is scrubbed first, like the other insert paths.
    if (window.Element && typeof Element.prototype.insertAdjacentElement === 'function') {
      var origIAE = Element.prototype.insertAdjacentElement;
      def(Element.prototype, 'insertAdjacentElement', { value: function (pos, el) {
        if (el && typeof el === 'object' && el.nodeType) { if (isFrameish(el)) return el; scrub(el); }
        return origIAE.call(this, pos, el);
      }, writable: false, configurable: false });
    }
    // Range.insertNode / Range.surroundContents attach a node straight into the live document, bypassing the
    // Node/Element insert methods above, so they are screened the same way.
    ['insertNode', 'surroundContents'].forEach(function (m) { wrapInsert(window.Range && Range.prototype, m); });
    // String-based insertion (the parser builds and attaches the frame itself, with no appendChild call).
    var FRAME_RE = /<(iframe|frame|frameset|object|embed|portal)[\s/>]/i;
    var stripFrames = function (s) { return FRAME_RE.test(s) ? s.replace(/<(iframe|frame|frameset|object|embed|portal)\b[\s\S]*?(<\/\1\s*>|>)/gi, '') : s; };
    if (window.Element && typeof Element.prototype.insertAdjacentHTML === 'function') {
      var origIAH = Element.prototype.insertAdjacentHTML;
      def(Element.prototype, 'insertAdjacentHTML', { value: function (pos, html) {
        return origIAH.call(this, pos, stripFrames(String(html)));
      }, writable: false, configurable: false });
    }
    ['Element', 'ShadowRoot'].forEach(function (n) {
      var ctor = window[n]; if (!ctor || !ctor.prototype || typeof ctor.prototype.setHTMLUnsafe !== 'function') return;
      var orig = ctor.prototype.setHTMLUnsafe;
      def(ctor.prototype, 'setHTMLUnsafe', { value: function (html) { return orig.call(this, stripFrames(String(html))); }, writable: false, configurable: false });
    });
    [['Element', 'innerHTML'], ['Element', 'outerHTML'], ['ShadowRoot', 'innerHTML']].forEach(function (pair) {
      var ctor = window[pair[0]]; if (!ctor || !ctor.prototype) return;
      var d = Object.getOwnPropertyDescriptor(ctor.prototype, pair[1]); if (!d || !d.set) return;
      def(ctor.prototype, pair[1], { configurable: false, enumerable: d.enumerable,
        get: d.get, set: function (html) { d.set.call(this, stripFrames(String(html))); } });
    });
    // A detached document (DOMParser / createHTMLDocument) has defaultView === null, so it hands
    // out no usable window; Range.createContextualFragment still flows through the insert guards above.

    // Backstop: if a child browsing context ever appears (window.length > 0) through a path we did not wrap,
    // pull its frame elements back out. A child context's WebRTC is usable the instant it is attached, so this
    // is defence-in-depth behind the synchronous insert guards, not the guard itself. Gated on window.length,
    // so the common case (no child context) is one integer check, not a document query, on every mutation.
    var sweepFrames = function () {
      try {
        if (!window.length) return;
        var bad = document.querySelectorAll(FRAME_SEL);
        for (var i = 0; i < bad.length; i++) if (bad[i].parentNode) bad[i].parentNode.removeChild(bad[i]);
      } catch (e) { /* ignore */ }
    };
    try {
      if (window.MutationObserver) {
        var watch = function () { new MutationObserver(sweepFrames).observe(document.documentElement, { childList: true, subtree: true }); sweepFrames(); };
        if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
      }
    } catch (e) { /* ignore */ }
  })();

  var INIT = window.__BRB_INIT__ || {};
  var parentWin = window.parent;
  function send(type, payload) {
    try { var m = payload || {}; m.brb = 1; m.type = type; parentWin.postMessage(m, '*'); } catch (e) { /* ignore */ }
  }

  // ---- Canvas contexts: remember which kind each canvas got -----------------------------
  // A canvas can only ever have one kind of context, so BRB.fx.fit() must never make a 2D one on a
  // canvas that is (or will be) used for WebGL. We note the kind when the game creates it.
  var ctxKind = new WeakMap(), pendingScale = new WeakMap();
  try {
    var origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind) {
      var c = origGetContext.apply(this, arguments);
      if (c && !ctxKind.has(this)) {
        ctxKind.set(this, String(kind));
        // fit() ran before the game made its 2D context: start that context at the fitted scale.
        if (String(kind) === '2d' && pendingScale.has(this)) { try { var d = pendingScale.get(this); c.setTransform(d, 0, 0, d, 0, 0); } catch (e) { /* ignore */ } }
      }
      return c;
    };
  } catch (e) { /* ignore */ }

  // ---- Device check for 3D games --------------------------------------------------------
  // The server marks games that need WebGL 2 and import maps (Three.js games) in INIT.device. If this
  // browser can't do them, or the 3D picture is lost and does not come back, we show a friendly,
  // translated message instead of a blank screen.
  var DEV = INIT.device && typeof INIT.device === 'object' ? INIT.device : null;
  var devBox = null, RESTORE_MS = 4000;
  function deviceMessage(why) {
    if (!DEV || devBox) return;
    // A lost 3D picture happens on new phones and tablets too (GPU reset, memory pressure, coming back from
    // the background), so it gets its own message and a "Try again" button that asks the page to reload the game. The
    // "needs a newer device" wording is only for a browser that truly can't run the game (no import maps / WebGL 2).
    var lost = why === 'lost';
    function show() {
      if (devBox) return;
      devBox = document.createElement('div'); devBox.id = 'brb-device'; devBox.setAttribute('role', 'alert'); devBox.setAttribute('data-why', why);
      devBox.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:#1d2340;font-family:system-ui,sans-serif;text-align:center';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;color:#1d2340;border-radius:28px;padding:28px 22px;max-width:420px;width:100%;box-shadow:0 10px 0 rgba(0,0,0,.25)';
      if (INIT.user && INIT.user.dir === 'rtl') card.dir = 'rtl';
      var emo = document.createElement('div'); emo.setAttribute('aria-hidden', 'true'); emo.textContent = lost ? '\ud83c\udfae' : '\ud83d\udcf1\ud83d\udcbb';
      emo.style.cssText = 'font-size:56px;line-height:1.1';
      var h = document.createElement('h2');
      h.textContent = lost ? (typeof DEV.lostTitle === 'string' && DEV.lostTitle ? DEV.lostTitle : 'Oops, the 3D picture stopped')
        : (typeof DEV.title === 'string' && DEV.title ? DEV.title : 'This game needs a newer device or browser');
      h.style.cssText = 'margin:12px 0 8px;font:800 26px/1.15 system-ui,sans-serif';
      var p = document.createElement('p');
      p.textContent = lost ? (typeof DEV.lostText === 'string' && DEV.lostText ? DEV.lostText : 'Tap Try again to start it over.')
        : (typeof DEV.text === 'string' && DEV.text ? DEV.text : 'Try it on a newer tablet or computer, or update the browser. There are lots of other games to play too!');
      p.style.cssText = 'margin:0;font:600 18px/1.4 system-ui,sans-serif;color:#55607a';
      card.appendChild(emo); card.appendChild(h); card.appendChild(p);
      if (lost) {
        var btn = document.createElement('button'); btn.type = 'button';
        btn.textContent = typeof DEV.retry === 'string' && DEV.retry ? DEV.retry : 'Try again';
        btn.style.cssText = 'margin-top:20px;min-height:52px;padding:0 28px;border:0;border-radius:16px;background:#2f6bff;color:#fff;font:800 20px system-ui,sans-serif;cursor:pointer;box-shadow:0 5px 0 #1b47c7';
        // The page reloads the game: a reload started in here goes without the sign-in cookie, so the server refuses it.
        btn.addEventListener('click', function () { send('brb:retry'); });
        card.appendChild(btn);
      }
      devBox.appendChild(card);
      (document.body || document.documentElement).appendChild(devBox);
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
  if (DEV) {
    var missing = [];
    if (DEV.importmap) {
      // Only say import maps are missing when the browser can tell us so. A browser with no
      // HTMLScriptElement.supports() is "unknown": let it try and the template's own 20 s fallback handle it.
      var hasSupports = false, maps = true;
      try { hasSupports = typeof HTMLScriptElement.supports === 'function'; if (hasSupports) maps = !!HTMLScriptElement.supports('importmap'); } catch (e) { /* ignore */ }
      if (hasSupports && !maps) missing.push('importmap');
    }
    if (DEV.webgl2) {
      // A real (tiny) context tells us more than the API existing: a blocked graphics chip has the API but no context.
      var gl = null; try { gl = document.createElement('canvas').getContext('webgl2'); var lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { gl = null; }
      if (!gl) missing.push('webgl2');
    }
    if (missing.length) deviceMessage(missing.join(' '));
    // A lost 3D picture: if the game does not ask for it back (preventDefault), or it is not back soon, say so.
    window.addEventListener('webglcontextlost', function (e) {
      var cv = e.target;
      setTimeout(function () {   // after the game's own handlers have run
        if (!cv || !cv.isConnected) return;
        if (!e.defaultPrevented) { deviceMessage('lost'); return; }
        var t = setTimeout(function () { if (cv.isConnected) deviceMessage('lost'); }, RESTORE_MS);
        cv.addEventListener('webglcontextrestored', function () { clearTimeout(t); }, { once: true });
      }, 0);
    }, true);
    window.addEventListener('webglcontextrestored', function () {
      if (devBox && devBox.getAttribute('data-why') === 'lost') { devBox.remove(); devBox = null; }
    }, true);
  }

  // ---- Cloud save + localStorage shim -------------------------------------------------
  var store = {};
  var seed = INIT.save || {};
  Object.keys(seed).forEach(function (k) { if (typeof seed[k] === 'string') store[k] = seed[k]; });
  var MAX = 450000, timer = null;
  function size() { var n = 0; for (var k in store) n += k.length + store[k].length; return n; }
  function flush() { timer = null; send('brb:save', { data: store }); }
  function queue() { if (!INIT.canSave) return; if (timer) clearTimeout(timer); timer = setTimeout(flush, 400); }
  function makeStorage(backing, persist) {
    var api = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null; },
      setItem: function (k, v) {
        k = String(k); v = String(v); var old = backing[k]; backing[k] = v;
        if (persist && size() > MAX) { if (old === undefined) delete backing[k]; else backing[k] = old; var e = new Error('Save is full'); e.name = 'QuotaExceededError'; throw e; }
        if (persist) queue();
      },
      removeItem: function (k) { k = String(k); if (k in backing) { delete backing[k]; if (persist) queue(); } },
      clear: function () { Object.keys(backing).forEach(function (k) { delete backing[k]; }); if (persist) queue(); },
      key: function (i) { return Object.keys(backing)[i] || null; }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(backing).length; } });
    return api;
  }
  var local = makeStorage(store, true), session = makeStorage({}, false);
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return local; } }); } catch (e) { /* ignore */ }
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function () { return session; } }); } catch (e) { /* ignore */ }
  window.addEventListener('pagehide', function () { if (timer) { clearTimeout(timer); flush(); } });

  // ---- Fullscreen + orientation routed through the parent ------------------------------
  function askFullscreen() { send('brb:fullscreen', { on: true }); return Promise.resolve(); }
  try {
    Element.prototype.requestFullscreen = askFullscreen;
    Element.prototype.webkitRequestFullscreen = askFullscreen;
    Element.prototype.webkitRequestFullScreen = askFullscreen;
    Document.prototype.exitFullscreen = function () { send('brb:fullscreen', { on: false }); return Promise.resolve(); };
    Document.prototype.webkitExitFullscreen = Document.prototype.exitFullscreen;
  } catch (e) { /* ignore */ }
  try { if (screen.orientation) screen.orientation.lock = function (o) { send('brb:orientation', { value: String(o) }); return Promise.resolve(); }; } catch (e) { /* ignore */ }

  // ---- Juice helpers ------------------------------------------------------------------
  var reduced = false; try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
  var actx = null, muted = false;
  try { muted = local.getItem('__brb_muted') === '1'; } catch (e) { /* ignore */ }
  function ac() { if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); } if (actx.state === 'suspended') actx.resume(); return actx; }
  function tone(f0, f1, dur, type, vol, delay) {
    var c = ac(); if (!c) return; var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain(); o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    var c = ac(); if (!c) return; var len = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = c.createBufferSource(), g = c.createGain(); g.gain.value = vol || 0.2; s.buffer = b; s.connect(g); g.connect(c.destination); s.start();
  }
  var SFX = {
    jump: function () { tone(300, 700, 0.15, 'square', 0.12); },
    hit: function () { noise(0.15, 0.25); tone(160, 60, 0.15, 'sawtooth', 0.12); },
    coin: function () { tone(988, 0, 0.08, 'square', 0.1); tone(1319, 0, 0.18, 'square', 0.1, 0.08); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.18, 'triangle', 0.15, i * 0.12); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, f * 0.95, 0.25, 'triangle', 0.15, i * 0.2); }); },
    click: function () { tone(660, 0, 0.05, 'square', 0.08); },
    powerup: function () { tone(200, 1200, 0.35, 'sawtooth', 0.1); }
  };
  function overlayCanvas() {
    var cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646';
    cv.width = innerWidth * (devicePixelRatio || 1); cv.height = innerHeight * (devicePixelRatio || 1);
    document.body.appendChild(cv); return cv;
  }
  var fx = {
    confetti: function (opts) {
      if (reduced) return; opts = opts || {}; var cv = overlayCanvas(), c = cv.getContext('2d'), dpr = devicePixelRatio || 1;
      var colors = opts.colors || ['#2f6bff', '#ff6b5c', '#84cc16', '#ffc83d', '#a855f7', '#22d3ee'];
      var parts = []; for (var i = 0; i < (opts.count || 140); i++) parts.push({ x: cv.width / 2, y: cv.height * 0.35, vx: (Math.random() - 0.5) * 18 * dpr, vy: (-Math.random() * 16 - 4) * dpr, r: (4 + Math.random() * 5) * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, col: colors[i % colors.length] });
      var start = performance.now();
      (function step(t) {
        c.clearRect(0, 0, cv.width, cv.height);
        parts.forEach(function (p) { p.vy += 0.45 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.col; c.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); c.restore(); });
        if (t - start < 2600) requestAnimationFrame(step); else cv.remove();
      })(start);
    },
    shake: function (el, strength) {
      if (reduced) return; el = el || document.body; var s = strength || 8;
      if (el.animate) el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(' + -s + 'px,' + s / 2 + 'px)' }, { transform: 'translate(' + s + 'px,' + -s / 2 + 'px)' }, { transform: 'translate(' + -s / 2 + 'px,' + s / 3 + 'px)' }, { transform: 'translate(0,0)' }], { duration: 300 });
    },
    flash: function (color) {
      if (reduced) return; var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;background:' + (color || '#fff');
      document.body.appendChild(d);
      // One gentle flash only (never repeated quickly; see docs/safety.md).
      var a = d.animate ? d.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 250 }) : null;
      setTimeout(function () { d.remove(); }, 260); return a;
    },
    tween: function (from, to, ms, onUpdate, ease) {
      return new Promise(function (resolve) {
        var t0 = performance.now(), e = ease || function (x) { return 1 - Math.pow(1 - x, 3); };
        (function step(t) { var k = Math.min(1, (t - t0) / ms); onUpdate(from + (to - from) * e(k)); if (k < 1) requestAnimationFrame(step); else resolve(); })(t0);
      });
    },
    // A 2D canvas of w x h game pixels, scaled to fit the screen and kept crisp. It only touches a 2D
    // context the game already made (or starts the one it makes later at this scale); it never creates
    // one, so it is harmless on a WebGL canvas. For a 3D renderer use fit3d.
    fit: function (canvas, w, h) {
      function resize() {
        var dpr = devicePixelRatio || 1, scale = Math.min(innerWidth / w, innerHeight / h);
        canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w * scale + 'px'; canvas.style.height = h * scale + 'px';
        var kind = ctxKind.get(canvas);
        if (kind === '2d') { var ctx = canvas.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
        else if (!kind) pendingScale.set(canvas, dpr);
      }
      resize(); addEventListener('resize', resize); return { scale: function () { return Math.min(innerWidth / w, innerHeight / h); } };
    },
    // A 3D renderer (e.g. a Three.js WebGLRenderer) filling the screen (or opts.element): pixel ratio
    // first (capped, default 1.5), then the size, then the camera's aspect; again on every resize and
    // rotate. opts: { maxDpr, element, onResize(w, h, dpr) }. maxDpr(n) changes the cap (quality ladders).
    fit3d: function (renderer, camera, opts) {
      opts = opts || {};
      var cap = +opts.maxDpr > 0 ? +opts.maxDpr : 1.5, el = opts.element || null, tries = 0;
      function resize() {
        var w = el ? el.clientWidth : innerWidth, h = el ? el.clientHeight : innerHeight;
        // A frame that has no size yet (still being laid out): try again on the next frames.
        if ((!w || !h) && tries++ < 30) requestAnimationFrame(resize);
        w = Math.max(1, w); h = Math.max(1, h);
        var dpr = Math.min(devicePixelRatio || 1, cap);
        if (renderer && renderer.setPixelRatio) renderer.setPixelRatio(dpr);
        if (renderer && renderer.setSize) renderer.setSize(w, h);
        if (camera) { if ('aspect' in camera) camera.aspect = w / h; if (camera.updateProjectionMatrix) camera.updateProjectionMatrix(); }
        if (typeof opts.onResize === 'function') opts.onResize(w, h, dpr);
      }
      resize(); addEventListener('resize', resize);
      return {
        resize: resize,
        maxDpr: function (n) { if (+n > 0) { cap = +n; resize(); } return cap; },
        stop: function () { removeEventListener('resize', resize); }
      };
    },
    sfx: {
      play: function (name) { if (muted) return; try { (SFX[name] || SFX.click)(); } catch (e) { /* ignore */ } },
      mute: function (on) { muted = on === undefined ? !muted : !!on; try { local.setItem('__brb_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } return muted; },
      get muted() { return muted; }
    }
  };

  // ---- Speech: the most natural voice the device already has ---------------------------
  // Browsers list many voices for a language, and the first one is often the worst: an old Windows
  // "Desktop" voice, eSpeak on Linux, or one of Apple's novelty voices ("Albert", "Bad News"...), which
  // sort first alphabetically. So we score every voice and keep the best one for the language.
  // Order within the language: on-device natural voices (Natural/Neural, Premium, Siri, Enhanced), then the
  // browser's ONLINE voices (localService === false or "-network": Edge's "Microsoft Aria Online (Natural)",
  // Chrome's "Google US English"), then plain on-device voices, then eSpeak / Eloquence / novelty voices.
  // An online voice sends the spoken text to the browser vendor (Microsoft or Google). The owner accepted that
  // on 29 Oct 2026 (docs/decisions.md): games already used those voices, and without them Windows speech is
  // robotic ("Desktop" voices) or silent (no local voice for the language). With no voice at all, speak() says nothing.
  // voice-pick:start (seed-games/word-peek.html and shark-plank.html carry a copy; tests/unit/voice.test.js checks they agree)
  // The regions we prefer for each site language, best first. A voice for the exact language and region
  // wins over one for the language only (an en-GB page gets a British voice before an American one).
  //   pt: the site's pt is Brazilian Portuguese (docs/sdk.md), so pt-BR first, then pt-PT.
  //   zh-Hant: spoken as Mandarin: Taiwanese Mandarin (zh-TW) first, then mainland Mandarin (zh-CN, which reads
  //            Traditional characters fine), and Hong Kong (zh-HK) last: those voices (Apple's Sinji, Windows' Tracy,
  //            Android's yue) speak Cantonese, a different spoken language.
  //   A tag with a region that has no entry here ("en-US", "es-MX", "zh-TW") tries that region first, then the
  //   language's own list (en-US on a device with no American voice gets a British one before an Indian one).
  //   he: he-IL; Android and old browsers still say "iw", which counts as he.
  var VOICE_REGIONS = { en: ['us', 'gb', 'ca', 'au'], 'en-gb': ['gb', 'ie', 'au'], pt: ['br', 'pt'], 'zh-hant': ['tw', 'cn', 'hk'], zh: ['cn', 'tw', 'hk'],
    he: ['il'], es: ['es', 'mx', 'us'], fr: ['fr', 'ca'], de: ['de', 'at', 'ch'], it: ['it'], nl: ['nl', 'be'], ja: ['jp'], ru: ['ru'], ar: ['sa', 'eg', 'ae'] };
  // Matched against "name voiceURI". The language match is worth 100 (preferred region; 10 less for each
  // step down the list) or 40 (same language, another region), so these move a voice within its language.
  var VOICE_SCORES = [
    [/\b(natural|neural)\b/i, 30],   // Windows 11 / ChromeOS "Natural" voices (when they are on the device)
    [/premium/i, 30],                // Apple's best downloadable voices ("Ava (Premium)")
    [/siri/i, 25],                   // Apple's Siri voices, where a browser lists them
    [/enhanced/i, 25],               // Apple's larger download of a standard voice ("Samantha (Enhanced)")
    [/^google\b/i, 10],              // Google's own voices when they are local (Android, ChromeOS)
    [/\bdesktop\b/i, -15],           // Windows SAPI 5 "Microsoft David/Zira/Mark Desktop": the oldest Windows voices
    [/compact/i, -10],               // Apple's small "compact" voices: fine, but any download beats them
    [/^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i, -40],   // Apple's Eloquence voices (2022): clear but very synthetic
    // Apple's novelty and 1990s MacinTalk voices: sound effects or robots. Always last for their language.
    [/^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|agnes|bruce|princess|vicki|victoria)\b/i, -80],
    [/e-?speak/i, -60]               // eSpeak / espeak-ng (Linux): the most robotic of all
  ];
  // An online voice gets this instead of the bonuses above (penalties still count): below an on-device
  // natural voice (+25..+40), above a plain on-device one (at most +15: a local Google voice that is the default).
  var VOICE_ONLINE = 20;
  // "en_US", "iw-IL", "cmn-Hant-TW", "yue-HK" -> { lang, region } in one spelling.
  function voiceTag(t) {
    var p = String(t || '').replace(/_/g, '-').toLowerCase().split('-'), lang = p[0], region = '', script = '';
    for (var i = 1; i < p.length; i++) { if (/^[a-z]{4}$/.test(p[i])) script = p[i]; else if (!region && /^([a-z]{2}|\d{3})$/.test(p[i])) region = p[i]; }
    if (lang === 'iw') lang = 'he';
    if (lang === 'cmn' || lang === 'yue') lang = 'zh';
    if (lang === 'zh' && !region) region = script === 'hant' ? 'tw' : script === 'hans' ? 'cn' : '';
    return { lang: lang, region: region };
  }
  // The best voice in list for a BCP-47 tag ("en-GB", "pt", "zh-Hant"), or null. Ties keep list order.
  function pickVoice(list, lang) {
    var key = String(lang || 'en').replace(/_/g, '-').toLowerCase(), want = voiceTag(key);
    var regions = VOICE_REGIONS[key];
    if (!regions) { regions = want.region ? [want.region] : []; (VOICE_REGIONS[want.lang] || []).forEach(function (r) { if (regions.indexOf(r) < 0) regions.push(r); }); }
    var best = null, top = -Infinity;
    for (var i = 0; list && i < list.length; i++) {
      var v = list[i]; if (!v) continue;
      var id = String(v.name || '') + ' ' + String(v.voiceURI || '');
      var t = voiceTag(v.lang); if (t.lang !== want.lang) continue;
      var online = v.localService === false || /-network\b/i.test(id);   // the text goes to Google / Microsoft
      var r = regions.indexOf(t.region), s = r >= 0 ? 100 - 10 * r : 40;
      for (var j = 0; j < VOICE_SCORES.length; j++) if (VOICE_SCORES[j][0].test(id) && !(online && VOICE_SCORES[j][1] > 0)) s += VOICE_SCORES[j][1];
      if (online) s += VOICE_ONLINE;
      if (v.default) s += 5;           // the voice the person chose in their device settings
      if (s > top) { best = v; top = s; }
    }
    return best;
  }
  // voice-pick:end
  var synth = null, Utter = null;
  try { if (window.speechSynthesis && window.SpeechSynthesisUtterance) { synth = window.speechSynthesis; Utter = window.SpeechSynthesisUtterance; } } catch (e) { /* none */ }
  var USER_LANG = (INIT.user && typeof INIT.user.lang === 'string' && INIT.user.lang) || 'en';
  var voiceList = [], voiceCache = {}, voicesSettled = false, pendingSpeech = [], liveUtterances = [];
  function loadVoices() { try { voiceList = (synth && synth.getVoices()) || []; } catch (e) { voiceList = []; } voiceCache = {}; return voiceList; }
  function voiceFor(lang) {
    if (!synth) return null;
    if (!voiceList.length) loadVoices();
    var key = String(lang || USER_LANG);
    if (!Object.prototype.hasOwnProperty.call(voiceCache, key)) voiceCache[key] = pickVoice(voiceList, key);
    return voiceCache[key];
  }
  // Chrome stops an utterance that runs longer than about 15 seconds, so long text is spoken a sentence
  // (at most ~180 characters) at a time.
  function speechChunks(s) {
    var out = [], parts = s.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [s], cur = '';
    parts.forEach(function (p) {
      while (p.length > 180) {   // one very long sentence: break at a comma or space, else anywhere (Chinese, Japanese)
        var cut = Math.max(p.lastIndexOf(', ', 178) + 1, p.lastIndexOf(' ', 179)), end = cut >= 60 ? cut + 1 : 180;
        if (cur) { out.push(cur); cur = ''; } out.push(p.slice(0, end)); p = p.slice(end);
      }
      if ((cur + p).length > 180) { out.push(cur); cur = p; } else cur += p;
    });
    if (cur) out.push(cur);
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function num(x, lo, hi, d) { x = +x; return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; }
  function startSpeech(s, opts, lang) {
    var v = voiceFor(lang); if (!v) return false;   // no voice for this language
    var parts = speechChunks(s), rate = num(opts.rate, 0.5, 2, 1), pitch = num(opts.pitch, 0, 2, 1), vol = num(opts.volume, 0, 1, 1);
    try { if (synth.paused) synth.resume(); } catch (e) { /* ignore */ }   // iOS and Chrome can be left paused (tab switch, call)
    parts.forEach(function (p, i) {
      var u = new Utter(p); u.voice = v; u.lang = v.lang; u.rate = rate; u.pitch = pitch; u.volume = vol; markOwn(u);
      // Chrome can garbage-collect a playing utterance and never fire onend: hold on to it until it is done.
      var done = function () { var k = liveUtterances.indexOf(u); if (k >= 0) liveUtterances.splice(k, 1); };
      liveUtterances.push(u);
      u.onerror = done;
      u.onend = function () { done(); if (i === parts.length - 1 && typeof opts.onend === 'function') { try { opts.onend(); } catch (e) { /* game's own error */ } } };
      synth.speak(u);
    });
    return true;
  }
  function flushPending() {
    if (!voiceList.length && !voicesSettled) return;
    var list = pendingSpeech; pendingSpeech = [];
    list.forEach(function (a) { try { startSpeech(a[0], a[1], a[2]); } catch (e) { /* ignore */ } });
  }
  // speak(text, { lang, rate, pitch, volume, queue, onend }): true if it started (or is waiting for the
  // device's voice list, which some browsers fill a moment after the page loads); false when there is
  // no speech here or no voice for the language. A new line stops the one playing unless queue is true.
  function speak(text, opts) {
    opts = opts || {};
    if (!synth || !Utter) return false;
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); if (!s) return false;
    var lang = typeof opts.lang === 'string' && opts.lang ? opts.lang : USER_LANG;
    try {
      if (!opts.queue) { pendingSpeech = []; synth.cancel(); }
      if (!voiceList.length) loadVoices();
      if (!voiceList.length) { if (voicesSettled) return false; pendingSpeech.push([s, opts, lang]); return true; }
      return startSpeech(s, opts, lang);
    } catch (e) { return false; }
  }
  function stopSpeaking() { pendingSpeech = []; try { if (synth) synth.cancel(); } catch (e) { /* ignore */ } }

  // ---- Better voices for games that call speechSynthesis.speak directly ------------------------------
  // Older games (Builder games saved before BRB.speak existed, and some seed games) build their own
  // SpeechSynthesisUtterance and pick a voice with getVoices().find(...), which often lands on the worst one
  // (Albert, eSpeak, "Desktop"). The owner decided on 29 Oct 2026 (docs/decisions.md) to upgrade every game's
  // voices from here, without editing the games. speechSynthesis.speak is wrapped once, on the instance (so
  // 'speechSynthesis' in window, instanceof SpeechSynthesis and SpeechSynthesis.prototype are untouched), and
  // each utterance is adjusted just before the browser's own speak() gets it:
  //   - no voice set: the best voice for u.lang (empty: the game's language); no voice for it: left as it is.
  //   - a voice set by the game: replaced only when it is a penalised voice (score below 0: eSpeak, Eloquence,
  //     Apple novelty/MacinTalk, Windows "Desktop", Apple compact) AND the best voice for the same language
  //     scores at least VOICE_UPGRADE_MARGIN more. 30 means a "Desktop" (-15) or compact (-10) voice is only
  //     swapped for an on-device natural voice (+25..+30) or an online one (+20), never for another plain local
  //     voice (Microsoft Mark, 0), while the really bad ones (Eloquence -40, eSpeak -60, novelty -80) give way to
  //     any ordinary voice. A voice in another language than the utterance's is the game's choice and is kept.
  //   - a mild pitch shift (0.85..1.25, not 1) becomes 1: that is what made old games sound robotic. Stronger
  //     shifts are deliberate character voices and are kept. Rate and volume are never touched.
  // BRB.speak's own utterances are marked and passed straight through. Nothing waits: with no voice list yet,
  // the utterance is spoken as the game made it. Old games' text is not split (only BRB.speak does that).
  var VOICE_UPGRADE_MARGIN = 30;
  var ownUtterances = typeof WeakSet === 'function' ? new WeakSet() : null;
  function markOwn(u) { if (ownUtterances) ownUtterances.add(u); else { try { u.__brbOwn = true; } catch (e) { /* ignore */ } } }
  function isOwn(u) { return ownUtterances ? ownUtterances.has(u) : !!u.__brbOwn; }
  // A voice's quality alone (the scores above, without the language and region part): below 0 = penalised.
  function voiceQuality(v) {
    var id = String(v.name || '') + ' ' + String(v.voiceURI || ''), online = v.localService === false || /-network\b/i.test(id), s = online ? VOICE_ONLINE : 0;
    for (var j = 0; j < VOICE_SCORES.length; j++) if (VOICE_SCORES[j][0].test(id) && !(online && VOICE_SCORES[j][1] > 0)) s += VOICE_SCORES[j][1];
    return s;
  }
  // The game's language for an utterance without one: the player's site language, else the page's lang.
  function gameLang() {
    if (INIT.user && typeof INIT.user.lang === 'string' && INIT.user.lang) return INIT.user.lang;
    try { if (document.documentElement.lang) return document.documentElement.lang; } catch (e) { /* no document */ }
    return 'en';
  }
  function upgradeUtterance(u) {
    if (!u || typeof u !== 'object' || (Utter && !(u instanceof Utter)) || isOwn(u)) return;
    var p = u.pitch;
    if (typeof p === 'number' && p !== 1 && p >= 0.85 && p <= 1.25) u.pitch = 1;
    if (!voiceList.length) loadVoices();
    if (!voiceList.length) return;   // voices not listed yet: speak it as it is, now
    var cur = u.voice;
    if (!cur) {
      var v = voiceFor(u.lang || gameLang());
      if (v) { u.voice = v; if (!u.lang) u.lang = v.lang; }
      return;
    }
    var vl = voiceTag(cur.lang).lang;
    if (!vl || (u.lang && voiceTag(u.lang).lang !== vl)) return;   // a voice in another language: the game's choice
    var q = voiceQuality(cur); if (q >= 0) return;                   // not a penalised voice: keep it
    var best = voiceFor(cur.lang);
    if (best && best !== cur && best.name !== cur.name && voiceQuality(best) - q >= VOICE_UPGRADE_MARGIN) u.voice = best;
  }
  function installSpeakUpgrade() {
    var orig = synth.speak;
    if (typeof orig !== 'function' || orig.__brbUpgrade) return;   // once, even if the SDK runs twice
    var wrapped = function (u) {
      try { upgradeUtterance(u); } catch (e) { /* never stop the game's speech */ }
      return orig.apply(this, arguments);
    };
    wrapped.__brbUpgrade = true;
    try { synth.speak = wrapped; } catch (e) { /* read-only: leave it */ }
  }
  if (synth) {
    installSpeakUpgrade();
    loadVoices(); if (voiceList.length) voicesSettled = true;
    var onVoices = function () { loadVoices(); if (voiceList.length) voicesSettled = true; flushPending(); };
    try { if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoices); } catch (e) { /* ignore */ }
    // A browser with no voices at all never fires voiceschanged: after a moment, stop waiting.
    setTimeout(function () { if (!voiceList.length) loadVoices(); voicesSettled = true; flushPending(); }, 1500);
    // iPhones and iPads only allow speech that a tap started. A silent, empty line on the first tap or key
    // unlocks it, so a game can also speak later (after an animation or a timer).
    var unlock = function () {
      ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (n) { window.removeEventListener(n, unlock, true); });
      try { var u = new Utter(' '); u.volume = 0; markOwn(u); synth.speak(u); } catch (e) { /* ignore */ }
    };
    ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (n) { window.addEventListener(n, unlock, true); });
    window.addEventListener('pagehide', stopSpeaking);   // never keep talking after the game is closed
  }

  var BRB = {
    version: 1,
    // lang: the player's site language ("en", "fr", "ar"...); dir: "rtl" for right-to-left languages (he, ar), else "ltr".
    user: Object.freeze({ displayName: (INIT.user && INIT.user.displayName) || 'Player', avatar: (INIT.user && INIT.user.avatar) || '🙂', isGuest: !!(INIT.user && INIT.user.isGuest),
      lang: (INIT.user && typeof INIT.user.lang === 'string' && INIT.user.lang) || 'en', dir: INIT.user && INIT.user.dir === 'rtl' ? 'rtl' : 'ltr' }),
    game: Object.freeze({ id: (INIT.game && INIT.game.id) || '', title: (INIT.game && INIT.game.title) || '' }),
    preview: !!INIT.preview,
    storage: {
      get: function (k) { var v = local.getItem(k); if (v === null) return null; try { return JSON.parse(v); } catch (e) { return v; } },
      set: function (k, v) { local.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
      remove: function (k) { local.removeItem(k); }
    },
    score: { submit: function (score, label) { var n = Math.floor(+score); if (!isFinite(n) || n < 0) return; send('brb:score', { score: n, label: String(label || '').slice(0, 40) }); } },
    gameOver: function (r) { r = r || {}; send('brb:gameover', { won: !!r.won, score: isFinite(+r.score) ? Math.floor(+r.score) : null }); if (r.score != null) BRB.score.submit(r.score); },
    fullscreen: function () { return askFullscreen(); },
    orientation: function (o) { send('brb:orientation', { value: String(o || 'any') }); },
    fx: fx,
    sfx: fx.sfx,
    // Speech with the most natural voice available (see "Speech" above and docs/sdk.md).
    voice: function (lang) { try { return voiceFor(lang); } catch (e) { return null; } },
    speak: speak,
    stopSpeaking: stopSpeaking
  };
  Object.freeze(BRB.storage); Object.freeze(BRB.score);
  try { Object.defineProperty(window, 'BRB', { value: BRB, writable: false, configurable: false }); } catch (e) { window.BRB = BRB; }
  function ready() { send('brb:ready', { title: document.title || '' }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else setTimeout(ready, 0);
})();
