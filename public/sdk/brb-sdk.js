/* Magic Cups in-frame SDK. Injected (inline) into every game frame before the game's own code.
 * Games run in an opaque-origin sandbox with no network; everything they may do with the platform
 * goes through window.BRB and postMessage to the parent play page, which validates every message.
 * Docs: docs/sdk.md */
(function () {
  'use strict';
  var INIT = window.__BRB_INIT__ || {};
  var parentWin = window.parent;
  function send(type, payload) {
    try { var m = payload || {}; m.brb = 1; m.type = type; parentWin.postMessage(m, '*'); } catch (e) { /* ignore */ }
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
    fit: function (canvas, w, h) {
      function resize() {
        var dpr = devicePixelRatio || 1, scale = Math.min(innerWidth / w, innerHeight / h);
        canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w * scale + 'px'; canvas.style.height = h * scale + 'px';
        var ctx = canvas.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize(); addEventListener('resize', resize); return { scale: function () { return Math.min(innerWidth / w, innerHeight / h); } };
    },
    sfx: {
      play: function (name) { if (muted) return; try { (SFX[name] || SFX.click)(); } catch (e) { /* ignore */ } },
      mute: function (on) { muted = on === undefined ? !muted : !!on; try { local.setItem('__brb_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } return muted; },
      get muted() { return muted; }
    }
  };

  var BRB = {
    version: 1,
    user: Object.freeze({ displayName: (INIT.user && INIT.user.displayName) || 'Player', avatar: (INIT.user && INIT.user.avatar) || '🙂', isGuest: !!(INIT.user && INIT.user.isGuest) }),
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
