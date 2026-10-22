// The "tune-up layer": a small script the mock Builder adds to a game so that kid requests such as
// "make it harder", "change the colour", "change the hero to a dragon" or "add a second level" become
// real, visible changes made with ordinary edit_game find/replace edits on single, unique lines:
//   BRB_TUNE.speed = 1.25;     game clock runs faster (requestAnimationFrame / performance.now / timers)
//   BRB_TUNE.tint = "#ff5fb0"; a colour wash over the whole game
//   BRB_TUNE.hero = ["🧺","🐉"]; swap the hero emoji wherever it is drawn (canvas text and page text)
//   BRB_TUNE.name = ["Catch the Falling Things","Dragon Catch"]; swap the title text shown in the game
//   BRB_TUNE.level2 = true;    after 40 s of play the game speeds up with a "Level 2!" banner
// It uses nothing the safety scanner forbids (no network, no eval, no fast flashing).
export const LAYER_ID = 'brb-builder-layer';
const KEYS = ['speed', 'tint', 'hero', 'name', 'level2'];
const js = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

export const DEFAULT_TUNE = { speed: 1, tint: '', hero: ['', ''], name: ['', ''], level2: false };
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

export function layerScript(tune = {}) {
  const t = { ...DEFAULT_TUNE, ...tune };
  return `<script id="${LAYER_ID}">\n/* Builder tune-ups (speed, colour, hero, title, level 2). */\nvar BRB_TUNE = {};\n${KEYS.map(k => tuneLine(k, t[k])).join('\n')}\n${RUNTIME}\n</script>`;
}
export const hasLayer = html => String(html).includes(`<script id="${LAYER_ID}">`);

/** Put the layer right after </title> (before any game code runs), or at the very start. */
export function withLayer(html, tune) {
  const s = layerScript(tune);
  const i = html.indexOf('</title>');
  return i >= 0 ? html.slice(0, i + 8) + '\n' + s + html.slice(i + 8) : s + '\n' + html;
}
/** Current tune values read back from a game's source. */
export function readTune(html) {
  const out = { ...DEFAULT_TUNE };
  if (!hasLayer(html)) return out;
  for (const k of KEYS) {
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
    return [{ find: '</title>', replace: '</title>\n' + layerScript({ ...DEFAULT_TUNE, ...changes }) }];
  }
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
