// The "tune-up layer": a small script the mock Builder adds to a game so that kid requests such as
// "make it harder", "change the colour", "change the hero to a dragon" or "add a second level" become
// real, visible changes made with ordinary edit_game find/replace edits on single, unique lines:
//   BRB_TUNE.speed = 1.25;     game clock runs faster (requestAnimationFrame / performance.now / timers)
//   BRB_TUNE.tint = "#ff5fb0"; a colour wash over the whole game
//   BRB_TUNE.hero = ["🧺","🐉"]; swap the hero emoji wherever it is drawn (canvas text and page text)
//   BRB_TUNE.name = ["Catch the Falling Things","Dragon Catch"]; swap the title text shown in the game
//   BRB_TUNE.level2 = true;    after 40 s of play the game speeds up with a "Level 2!" banner
// It uses nothing the safety scanner forbids (no network, no eval, no fast flashing).
//
// Games on the Oomba Kit (they load the pinned kit tag) get the kit layer instead: the same BRB_TUNE lines, but the
// changes are SPEC edits made through the kit's own API, never drawing over the game:
//   BRB_TUNE.speed = 1.25;          the kit's game clock (Oomba.time.scale, on top of the player's own speed setting)
//   BRB_TUNE.level2 = true;         after 40 s of play the game clock speeds up, with the kit's toast
//   BRB_TUNE.name = ["Old", "New"]; the title in Oomba.game({title}) and Oomba.ui.title
//   BRB_TUNE.look = {"fox": {"colors": {"base": "sky"}, "wear": ["wizard-hat"]}, "hero": {...}};
//                                   character specs: by species (every fox) and "hero" (the game's hero, the title,
//                                   results and anything tagged "hero"), merged into the spec before the kit draws it
//   BRB_TUNE.biome = "reef";        the world's biome
// The layer defines Oomba.__tune(changes) (not enumerable, not for games), which applies the same changes to a running
// game. It waits for the kit by watching window.Oomba being set, so it must come before the kit tag (withLayer puts it
// right after </title>). Old (non-kit) games keep the original layer, byte for byte.
export const LAYER_ID = 'brb-builder-layer';
const KEYS = ['speed', 'tint', 'hero', 'name', 'level2'];
const KIT_KEYS = ['speed', 'level2', 'name', 'look', 'biome'];
const js = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

export const DEFAULT_TUNE = { speed: 1, tint: '', hero: ['', ''], name: ['', ''], level2: false, look: {}, biome: '' };
/** Does this game load the Oomba Kit (its script tag names the kit's files)? */
export const usesKit = html => /<script\b[^>]*\bsrc\s*=\s*["']?\/vendor\/oomba-kit\/\d+\.\d+\.\d+\/oomba-kit\.js/i.test(String(html));
/** A 3D game (the pinned Three.js import map): it keeps the original layer (its own loop reads BRB_TUNE.hero / speed). */
const isThree = html => /<script\b[^>]*type\s*=\s*["']?importmap[\s\S]*?\/vendor\/three\//i.test(String(html));
/** Should this game get the kit layer? A 2D game on the kit. */
export const kitLayerFor = html => usesKit(html) && !isThree(html);
export const tuneLine = (key, value) => `BRB_TUNE.${key} = ${js(value)};`;

const RUNTIME = `(function (T) {
  var k = +T.speed > 0 ? +T.speed : 1, P = window.performance, realNow = P.now.bind(P), lastReal = realNow(), lastScaled = lastReal;
  var st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  function now() { var r = realNow(); return lastScaled + (r - lastReal) * k; }
  function setK(n) { lastScaled = now(); lastReal = realNow(); k = n; }
  if (k !== 1 || T.level2) {
    try { P.now = now; } catch (e) { /* ignore */ }
    var raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) { return raf(function () { cb(now()); }); };
    window.setTimeout = function (f, ms) { var a = [].slice.call(arguments); a[1] = (+ms || 0) / k; return st.apply(null, a); };
    window.setInterval = function (f, ms) { var a = [].slice.call(arguments); a[1] = (+ms || 0) / k; return si.apply(null, a); };
  }
  var hero = T.hero || [], name = T.name || [];
  function swap(s) {
    if (typeof s !== 'string') return s;
    var tr = s.trim();
    if (name[0] && name[1] && tr === name[0]) s = s.replace(tr, name[1]);
    if (hero[0] && hero[1] && hero[0] !== hero[1] && s.indexOf(hero[0]) >= 0) s = s.split(hero[0]).join(hero[1]);
    return s;
  }
  var C = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (C && (hero[1] || name[1])) ['fillText', 'strokeText', 'measureText'].forEach(function (m) {
    var o = C[m]; if (!o) return;
    C[m] = function () { var a = [].slice.call(arguments); a[0] = swap(String(a[0])); return o.apply(this, a); };
  });
  function fixNode(n) { var v = n.nodeValue, w = swap(v); if (w !== v) n.nodeValue = w; }
  function walk(root) {
    if (!root) return; if (root.nodeType === 3) return fixNode(root);
    if (root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE') return;
    var it = document.createTreeWalker(root, 4), n; while ((n = it.nextNode())) { var p = n.parentNode; if (p && p.nodeName !== 'SCRIPT' && p.nodeName !== 'STYLE') fixNode(n); }
  }
  if (hero[1] || name[1]) {
    try { new MutationObserver(function (list) { list.forEach(function (m) { if (m.type === 'characterData') fixNode(m.target); else m.addedNodes.forEach(walk); }); })
      .observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) { /* ignore */ }
    document.addEventListener('DOMContentLoaded', function () { walk(document.body); });
  }
  if (/^#[0-9a-f]{6}$/i.test(T.tint || '')) {
    var s = document.createElement('style');
    s.textContent = 'html::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:99990;background:' + T.tint + ';mix-blend-mode:color;opacity:.4}';
    document.documentElement.appendChild(s);
  }
  if (T.level2) {
    var started = 0;
    var begin = function () {
      if (started) return; started = 1;
      st(function () {
        setK(k * 1.35);
        var d = document.createElement('div'); d.textContent = 'Level 2! Faster! 🚀';
        d.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:99991;background:#ffc83d;color:#152036;font:900 28px system-ui,sans-serif;padding:12px 22px;border-radius:18px;box-shadow:0 6px 0 rgba(0,0,0,.2);pointer-events:none';
        (document.body || document.documentElement).appendChild(d);
        try { window.BRB.sfx.play('powerup'); } catch (e) { /* ignore */ }
        st(function () { d.remove(); }, 2200);
      }, 40000);
    };
    addEventListener('pointerdown', begin, true); addEventListener('keydown', begin, true);
  }
})(BRB_TUNE);`;

// The kit layer's runtime (see the top of this file). ES5 on purpose: it runs before the kit, in any browser.
const KIT_RUNTIME = `(function (T) {
  var W = window, held, game = null, extra = 1, played = 0;
  function own(o) { var r = {}; if (o) for (var k in o) if (k !== '__ok' && k !== 'id') r[k] = o[k]; return r; }
  function merge(a, b) { var r = own(a); for (var k in b) r[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && r[k] && typeof r[k] === 'object' ? merge(r[k], b[k]) : b[k]; return r; }
  function looks() { return T.look && typeof T.look === 'object' ? T.look : {}; }
  /** A character spec (or species name) with its tune-ups: by species, then "hero" for the hero. */
  function dress(O, spec, hero) {
    var L = looks(), s = typeof spec === 'string' ? { species: spec } : spec;
    if (!s || typeof s !== 'object' || !s.species) return spec;
    var out = L[s.species] ? merge(s, L[s.species]) : null;
    if (hero && L.hero) out = merge(out || s, L.hero);
    return out ? O.char(out) : spec;
  }
  function title(t) { var n = T.name || []; return n[0] && n[1] && t === n[0] ? n[1] : t; }
  function speed(O) { try { O.time.scale = Math.max(0.1, Math.min(2, (+O.settings.speed || 1) * (+T.speed > 0 ? +T.speed : 1) * extra)); } catch (e) { /* ignore */ } }
  function tune(O) {
    var makeGame = O.game, makeStage = O.stage, ui = O.ui, started = false;
    O.game = function (spec) {
      var s = own(spec);
      s.title = title(s.title);
      if (T.biome) s.biome = T.biome;
      var h = s.hero == null || s.hero === 'me' ? null : s.hero;
      if (looks().hero || h) s.hero = dress(O, h || O.me(), true);
      if (s.titleHero) s.titleHero = dress(O, s.titleHero, false);
      game = makeGame.call(O, s); return game;
    };
    O.stage = function (canvas, o) {
      var st = makeStage.call(O, canvas, o), add = st.add;
      if (T.biome && !(canvas && canvas.biome === 'none') && !(o && o.biome === 'none')) st.setBiome(T.biome);
      st.add = function (name, opts) {
        var L = looks(), hero = !!(opts && opts.tag === 'hero');
        if (name && typeof name === 'object') return add.call(st, dress(O, name, hero), opts);
        if (typeof name === 'string' && (L[name] || (hero && L.hero)) && O.art.species.indexOf(name) >= 0) {
          var c = { species: name }; for (var k in opts) if (['skin', 'hair', 'outfit', 'wear', 'mood', 'colors', 'body', 'char'].indexOf(k) >= 0) c[k] = opts[k];
          return add.call(st, dress(O, c, hero), opts);
        }
        return add.call(st, name, opts);
      };
      speed(O);
      if (!started) {
        started = true;
        O.settings.on('change', function () { speed(O); });
        O.every(250, function () {
          if (O.scene !== 'play' || !T.level2 || extra > 1) return;
          played += 0.25;
          if (played >= 40) { extra = 1.35; speed(O); ui.toast(O.t('level') + ' ' + O.num(2) + '!'); O.sfx('levelup'); }
        });
      }
      return st;
    };
    ['title', 'win', 'tryAgain'].forEach(function (m) {
      var f = ui[m];
      ui[m] = function (o) { o = own(o); if (m === 'title') o.title = title(o.title); if (o.hero) o.hero = dress(O, o.hero, true); return f.call(ui, o); };
    });
    Object.defineProperty(O, '__tune', { configurable: true, value: function (changes) {
      for (var k in changes || {}) T[k] = changes[k];
      speed(O);
      if (game && changes && changes.look) { var h = game.world && game.world.hero; if (h && h.spec) game.hero(dress(O, h.spec, true)); }
      return T;
    } });
  }
  try {
    if (W.Oomba) tune(W.Oomba);
    else Object.defineProperty(W, 'Oomba', { configurable: true, enumerable: true, get: function () { return held; }, set: function (v) {
      Object.defineProperty(W, 'Oomba', { configurable: true, enumerable: true, writable: true, value: v });
      held = v; if (v && typeof v.game === 'function') tune(v);
    } });
  } catch (e) { /* an old browser: the game runs untuned */ }
})(BRB_TUNE);`;

export function layerScript(tune = {}, { kit = false } = {}) {
  const t = { ...DEFAULT_TUNE, ...tune };
  if (kit) return `<script id="${LAYER_ID}" data-kit="1">\n/* Builder tune-ups for an Oomba Kit game (speed, level 2, title, character looks, biome). */\nvar BRB_TUNE = {};\n${KIT_KEYS.map(k => tuneLine(k, t[k])).join('\n')}\n${KIT_RUNTIME}\n</script>`;
  return `<script id="${LAYER_ID}">\n/* Builder tune-ups (speed, colour, hero, title, level 2). */\nvar BRB_TUNE = {};\n${KEYS.map(k => tuneLine(k, t[k])).join('\n')}\n${RUNTIME}\n</script>`;
}
export const hasLayer = html => String(html).includes(`<script id="${LAYER_ID}">`) || String(html).includes(`<script id="${LAYER_ID}" data-kit="1">`);
/** Is this game's layer the kit layer? (its tag says so: data-kit="1") */
export const hasKitLayer = html => String(html).includes(`<script id="${LAYER_ID}" data-kit="1">`);

/** Put the layer right after </title> (before any game code runs, and before the kit), or at the very start. A game
 *  on the kit gets the kit layer. */
export function withLayer(html, tune) {
  const s = layerScript(tune, { kit: kitLayerFor(html) });
  const i = html.indexOf('</title>');
  return i >= 0 ? html.slice(0, i + 8) + '\n' + s + html.slice(i + 8) : s + '\n' + html;
}
/** Current tune values read back from a game's source. */
export function readTune(html) {
  const out = { ...DEFAULT_TUNE };
  if (!hasLayer(html)) return out;
  for (const k of hasKitLayer(html) ? KIT_KEYS : KEYS) {
    const m = String(html).match(new RegExp(`^BRB_TUNE\\.${k} = (.*);$`, 'm'));
    if (m) { try { out[k] = JSON.parse(m[1]); } catch { /* keep default */ } }
  }
  return out;
}
/**
 * edit_game edits that set tune values. If the game has no layer yet, the first edit inserts it after </title>
 * (only when </title> occurs exactly once). Returns null when no safe find/replace exists.
 */
export function tuneEdits(html, changes) {
  html = String(html);
  if (!hasLayer(html)) {
    if (html.split('</title>').length !== 2) return null;
    return [{ find: '</title>', replace: '</title>\n' + layerScript({ ...DEFAULT_TUNE, ...changes }, { kit: kitLayerFor(html) }) }];
  }
  if (Object.keys(changes).some(k => !(hasKitLayer(html) ? KIT_KEYS : KEYS).includes(k))) return null;
  const cur = readTune(html); const edits = [];
  for (const [k, v] of Object.entries(changes)) {
    const find = tuneLine(k, cur[k]);
    if (html.split(find).length !== 2) return null;
    const replace = tuneLine(k, v);
    if (find !== replace) edits.push({ find, replace });
  }
  return edits;
}

/** Most-used emoji in a game's code: a good guess for "the hero" of a template. */
const UI_EMOJI = new Set(['🔊', '🔇', '⏸', '▶', '⭐', '🏆', '❤', '💔', '✅', '❌', '↻', '🔁', '🎉', '👆', '⌨', '⏱', '🥇', '🥈', '🥉', '🌟', '☁', '✨', '💥', '🔥', '⚡', '🎵', '🎶', '⏯', '🏁', '🚩']);
export function guessHero(html, icon = '') {
  const named = String(html).match(/\b(hero|player|character|mascot)\w*\s*:\s*['"]([^'"\s]{1,12})['"]/i);
  if (named && /\p{Extended_Pictographic}/u.test(named[2])) return named[2];
  const config = (String(html).match(/const CONFIG\s*=\s*\{[\s\S]*?\n\};?/) || [])[0];
  const first = config && config.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/u);
  if (first) return first[0];
  if (icon && String(html).includes(icon)) return icon;
  const scripts = (String(html).match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n') || String(html);
  const counts = new Map();
  for (const m of scripts.matchAll(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}️?)*/gu)) {
    const e = m[0]; if (UI_EMOJI.has(e.replace(/️/g, ''))) continue;
    counts.set(e, (counts.get(e) || 0) + 1);
  }
  let best = '', n = 0; for (const [e, c] of counts) if (c > n) { best = e; n = c; }
  return best;
}
export const gameTitle = html => ((String(html).match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim();
/** The title a template shows on screen (CONFIG.title when present, else <title>). */
export const shownTitle = html => ((String(html).match(/const CONFIG\s*=\s*\{[\s\S]*?\btitle\s*:\s*(['"])([^'"\n]{1,80})\1/) || [])[2] || gameTitle(html)).trim();
