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
    // the background), so it gets its own message and a "Try again" button that reloads the frame. The
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
        btn.addEventListener('click', function () { try { location.reload(); } catch (e) { /* ignore */ } });
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
    sfx: fx.sfx
  };
  Object.freeze(BRB.storage); Object.freeze(BRB.score);
  try { Object.defineProperty(window, 'BRB', { value: BRB, writable: false, configurable: false }); } catch (e) { window.BRB = BRB; }
  function ready() { send('brb:ready', { title: document.title || '' }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else setTimeout(ready, 0);
})();
