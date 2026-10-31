// Style lint for games on the Oomba Kit: things that work but break the kit's look, feel or accessibility, and the
// kit's own traps. It never changes the safety result (scanner.js keeps its pass / flag / fail); its notes ride along
// in report.lint as { level: 'warn' | 'info', code, message } and go back to the Builder after each version and in the
// playtest, so the model fixes them like a picky art director would. Only kit games are linted (an old game keeps its
// own style). Pure function. Every pattern is linear (bounded repeats, no nested or lazy scans to the end of the file),
// and games over LINT_MAX bytes are not linted at all, so the scan of a 2 MB upload stays fast. See docs/kit.md
// (Builder) and tests/safety/stylelint.test.js.
import { ICON_NAMES } from '../../kit/src/icons.js';
import { KIT_PACKS, KIT_LATEST } from './kit.js';
import { checkHtml as liveCheckHtml, LIVE_NOTES } from './classlive-lint.js';
import * as animals from '../../kit/packs/art-animals.js';
import * as school from '../../kit/packs/art-school.js';
import * as biomes from '../../kit/packs/art-biomes.js';
import * as biomes2 from '../../kit/packs/art-biomes-2.js';
import * as props from '../../kit/packs/art-props.js';
import * as dress from '../../kit/packs/dress.js';
import { THEMES, ALIAS as THEME_ALIAS } from '../../kit/packs/dress.js';
import * as bold from '../../kit/packs/style-bold.js';

const LAYER_ID = 'brb-builder-layer';   // the Builder's tune-up layer (server/builder/layer.js) is not the game's own code
export const LINT_MAX = 300000;

const KIT_TAG = /<script\b[^>]{0,400}\bsrc\s*=\s*["']?\/vendor\/oomba-kit\/\d+\.\d+\.\d+\/oomba-kit\.js/i;
const THREE = /<script\b[^>]{0,400}type\s*=\s*["']?importmap/i;
const sample = list => [...new Set(list)].slice(0, 3).join(', ');

/** What each art pack adds (read from the pack sources with a recorder, the same lists the Builder's rules print). */
export const PACK_ART = (() => {
  const out = {};
  for (const mod of [animals, school, biomes, biomes2, props, dress, bold]) {
    const names = new Set(), rec = n => names.add(n);
    const any = new Proxy(() => {}, { get: () => any, apply: () => any });
    try { mod.define({ P: new Proxy({}, { get: () => ['#000000', '#000000', '#000000', '#000000'] }), INK: '#000000', CREAM: '#000000', rand: () => () => 0.5, adjust: c => c, mix: c => c, text() {}, ink: any, species: rec, prop: rec, biome: rec, art() {}, dress() {}, wear: rec, kit: any, style: {}, biomes: {} }); } catch { /* lists so far */ }
    if (mod === bold) names.add('bold');   // style: 'bold' needs the style-bold pack
    out[mod.PACK.name] = names;
  }
  return out;
})();

/** Comments out, strings kept: one linear pass. */
function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); out += ' '; i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && d === '/' && src[i - 1] !== ':' && src[i - 1] !== '\\') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n && src[j] !== c && !(c !== '`' && src[j] === '\n')) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}
/** Every <tag ...>body</tag> block, found with indexOf (linear, even with unclosed tags). */
function blocks(html, tag) {
  const out = [], lower = html.toLowerCase(), open = '<' + tag, close = '</' + tag;
  let i = 0;
  while ((i = lower.indexOf(open, i)) >= 0) {
    const ch = lower[i + open.length]; if (ch && !/[\s>]/.test(ch)) { i += open.length; continue; }
    const gt = lower.indexOf('>', i); if (gt < 0) break;
    const end = lower.indexOf(close, gt); const stop = end < 0 ? html.length : end;
    out.push({ start: i, end: end < 0 ? html.length : lower.indexOf('>', end) + 1 || html.length, attrs: html.slice(i + open.length, gt), body: html.slice(gt + 1, stop) });
    i = end < 0 ? html.length : end + close.length;
  }
  return out;
}
/** The parts of a game the lint reads: its own scripts (not the Builder layer, not the kit tags), CSS, markup. */
function parts(html) {
  const scripts = [], css = [], cut = [];
  for (const b of blocks(html, 'script')) {
    cut.push(b);
    if (!new RegExp(`id\\s*=\\s*["']?${LAYER_ID}`).test(b.attrs) && !/\bsrc\s*=/.test(b.attrs) && !/type\s*=\s*["']?importmap/i.test(b.attrs)) scripts.push(stripComments(b.body));
  }
  for (const b of blocks(html, 'style')) { cut.push(b); css.push(stripComments(b.body)); }
  cut.sort((a, b) => a.start - b.start);
  let markup = '', at = 0; for (const b of cut) { if (b.start >= at) { markup += html.slice(at, b.start) + ' '; at = b.end; } } markup += html.slice(at);
  const inline = (markup.match(/\sstyle\s*=\s*("[^"]{0,2000}"|'[^']{0,2000}')/gi) || []).map(s => s.replace(/^\s*style\s*=\s*["']|["']$/g, ''));
  return { js: scripts.join('\n'), css: css.join('\n'), inline, markup };
}
/** CSS declarations ({prop, value}) in rule bodies (never selectors), in one linear pass. */
function declarations(css, inline) {
  const out = []; let depth = 0, seg = '';
  const flush = () => { const k = seg.indexOf(':'); if (k > 0) out.push({ prop: seg.slice(0, k).trim().toLowerCase(), value: seg.slice(k + 1) }); };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { depth++; seg = ''; } else if (c === '}') { if (depth > 0) flush(); depth = Math.max(0, depth - 1); seg = ''; } else if (c === ';') { if (depth > 0) flush(); seg = ''; } else seg += c;
    if (seg.length > 4000) seg = seg.slice(-4000);
  }
  for (const s of inline) for (const d of s.split(';')) { seg = d; flush(); }
  return out;
}
/** The script without its `const CONFIG = { ... };` block (the one place colour codes are fine). */
function withoutConfig(js) {
  const m = /const\s+CONFIG\s*=\s*\{/.exec(js); if (!m) return js;
  const end = js.indexOf('\n}', m.index); return end < 0 ? js : js.slice(0, m.index) + ' ' + js.slice(end + 2);
}
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const SCREEN_NAMES = new Set(['pause', 'paused', 'pause-screen', 'pausescreen', 'results', 'results-screen', 'result-screen', 'gameover', 'game-over', 'game-over-screen', 'play-again', 'playagain', 'try-again', 'tryagain', 'title-screen', 'titlescreen', 'end-screen', 'endscreen', 'win-screen', 'winscreen', 'lose-screen']);

// ---- The creative-freedom guarantee -------------------------------------------------------------------------------
// The lint never flags or "corrects" a builder's explicit creative choices. Notes about the LOOK are suggestions only
// (level 'info', look: true): a default for when the builder said nothing, never a rule over what they asked for. When
// the builder's own words (this message and their earlier ones for the game) asked for that look, the note is dropped.
export const LOOK_CODES = ['raw_hex', 'emoji_text', 'emoji_dom', 'font', 'theme_name', 'dress_missing', 'three_bridge'];
const COLOUR_WORDS = /#[0-9a-f]{3,8}\b|\b(?:colou?rs?|colou?red|red|pink|purple|violet|green|blue|yellow|orange|black|white|gr[ae]y|brown|gold(?:en)?|silver|rainbow|neon|teal|turquoise|magenta|cyan|lime|navy|maroon|beige|pastel|dark|bright|rojo|rosa|morado|verde|azul|amarillo|negro|blanco|naranja|colou?r|couleurs?|rouge|rose|vert|bleu|jaune|noir|blanc|farben?|rot|lila|gr(?:ü|ue)n|blau|gelb|schwarz|wei(?:ß|ss)|kleur(?:en)?|rood|roze|paars|groen|blauw|geel|zwart|wit|cor(?:es)?|vermelho|roxo|amarelo|preto|branco|colori?|colore|rosso|viola|blu|giallo|nero|bianco)\b|красн|розов|зел[её]н|син|ж[её]лт|ч[её]рн|бел|цвет|أحمر|أزرق|أخضر|أسود|أبيض|لون|אדום|כחול|ירוק|שחור|לבן|צבע|赤|青|緑|黒|白|ピンク|色|紅|藍|綠|顏色/i;
const EMOJI_WORDS = /\p{Extended_Pictographic}|\bemoj?is?\b|絵文字|表情符號|эмодзи|אימוג|إيموجي/iu;
const FONT_WORDS = /\b(?:fonts?|typefaces?|comic sans|handwriting|pixel letters|letter style|police|fuentes?|tipograf\w*|schrift(?:art)?|lettertype|carattere|fonte)\b|шрифт|フォント|字型|גופן|خط/i;
const PLAIN_WORDS = /\b(?:plain|simple|minimal(?:ist)?|clean|empty|bare|blank|basic|no (?:decorations?|trees|scenery|background|birds)|nothing in the background|just (?:a )?(?:white|black|plain|one colou?r)|my own (?:style|look|drawings?|art)|own style|retro|8-?bit|pixel art|sencillo|simples?|vac[ií]o|einfach|schlicht|leer|eenvoudig|kaal|semplice|vuoto|sobre|vide)\b|простой|пуст|シンプル|簡單|פשוט|بسيط/i;
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
/** The look codes a builder's own words asked for (so their notes are dropped). texts: a string or a list of messages. */
export function kidChoices(texts) {
  const s = [].concat(texts || []).map(String).join('\n');
  const out = new Set();
  if (!s.trim()) return out;
  if (COLOUR_WORDS.test(s)) out.add('raw_hex');
  if (EMOJI_WORDS.test(s)) { out.add('emoji_text'); out.add('emoji_dom'); }
  if (FONT_WORDS.test(s)) out.add('font');
  if (PLAIN_WORDS.test(s)) { out.add('dress_missing'); out.add('three_bridge'); }
  return out;
}
/** Lint notes with the creative-freedom rule applied: look notes the builder's words asked for are dropped; a made-up
 *  theme name the builder used themselves is theirs too. */
export function respectChoices(lint, texts) {
  const asked = kidChoices(texts), words = norm([].concat(texts || []).join(' ')).replace(/[^a-z0-9\u0080-\uffff]+/g, ' ');
  return (lint || []).filter(l => {
    if (asked.has(l.code)) return false;
    if (l.code === 'theme_name' && l.theme) { const w = norm(l.theme).replace(/[^a-z0-9]+/g, ' ').trim(); if (w && ` ${words} `.includes(` ${w} `)) return false; }
    return true;
  });
}

/** html -> the lint notes. o.request: the builder's own words (string or list): look notes they asked for are dropped. */
export function lintGame(html, o = {}) {
  const src = String(html || '');
  if (src.length > LINT_MAX || !KIT_TAG.test(src)) return [];
  const out = [], add = (level, code, message, extra) => { if (out.some(x => x.code === code)) return; const look = LOOK_CODES.includes(code); out.push({ level: look ? 'info' : level, code, message, ...(look ? { look: true } : {}), ...(extra || {}) }); };
  const { js, css, inline, markup } = parts(src);
  const code = withoutConfig(js), threeD = THREE.test(src) && /\/vendor\/three\//.test(src);
  const usesGame = /\b(?:Oomba|OK|O)\s*\.\s*game\s*\(/.test(js);
  const decls = declarations(css, inline);

  // 1. Colour codes outside CONFIG: CSS property values (never selectors) and colour-like spots in code (3D games
  //    colour their materials in code, so only their CSS counts).
  const hexCss = decls.map(d => (HEX.exec(d.value) || [])[0]).filter(Boolean);
  const hexJs = threeD ? [] : [...code.matchAll(/\b(?:fillStyle|strokeStyle|shadowColor|color|background(?:Color)?|borderColor|fill|stroke|tint)\s*[:=]\s*(['"`])\s{0,4}(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))\b/gi)].map(m => m[2])
    .concat([...code.matchAll(/\.style\.\w{1,30}\s*=\s*(['"`])[^'"`\n]{0,80}?(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))\b/gi)].map(m => m[2]));
  if (hexCss.length + hexJs.length) add('warn', 'raw_hex', `Uses colour codes outside CONFIG (${sample([...hexCss, ...hexJs])}). Use the kit's colours instead: a role or hue in a character spec ({colors: {base: 'sky'}}), Oomba.color('player'), or the CSS variables var(--ok-card), var(--ok-text), var(--ok-edge), so the game matches the kit by day and by night.`);
  // 2. Emoji as pictures: drawn on a canvas, or an element that is only an emoji.
  if (/\b(?:fillText|strokeText)\s*\(\s*(['"`])[^'"`\n]{0,40}\p{Extended_Pictographic}/u.test(code) || /\b(?:fillText|strokeText)\s*\([^)\n]{0,200}\b(?:emoji|icon|sprite)\w*\b/i.test(code)) add('warn', 'emoji_text', 'Draws emoji as pictures with fillText. Use the kit\'s art instead: stage.add(\'fox\'), w.spawn(\'apple\'), Oomba.icon(\'star\') or Oomba.art.toCanvas(name), so every picture is in the Oomba Ink style and reads clearly.');
  if (/<\w{1,10}\b[^<>]{0,300}>\s{0,20}\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍]{0,8}\s{0,20}<\//u.test(markup) || /\.(?:textContent|innerHTML|innerText)\s*=\s*(['"`])\s{0,4}(?:<[^<>'"`]{0,80}>)?\s{0,4}\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍]{0,8}\s{0,4}(?:<\/\w{1,10}>)?\1/u.test(code)) add('warn', 'emoji_dom', 'Uses an emoji as a picture in the page. Emoji look different on every device and are not in the Oomba Ink style: use Oomba.art.toCanvas(\'apple\', 96) (any species or prop) or Oomba.icon(\'star\') instead.');
  // 3. Fonts that are not the kit's.
  const ownFont = decls.some(d => (d.prop === 'font-family' && !/^\s*(?:inherit|var\()/i.test(d.value)) || (d.prop === 'font' && /\b(?:serif|sans-serif|monospace|cursive|system-ui|arial|helvetica|verdana|georgia|comic sans)\b/i.test(d.value)))
    || /@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(src)
    || /\.font\s*=\s*(['"`])[^'"`\n]{0,60}\d(?:px|pt|em)\s[^'"`\n]{0,60}\1/.test(code);
  if (ownFont) add('warn', 'font', 'Sets its own font. Kit games use the kit\'s font everywhere (it covers all 13 languages): leave font-family out (or use inherit / var(--ok-font)), and draw words with Oomba.draw.text or the kit\'s UI.');
  // 4. Hand-built screens in an Oomba.game game (it already has the title, how-to, pause and results screens): an id or
  //    class that IS a screen's name (never a word in the game's text, never "result-row").
  if (usesGame) {
    const names = [...markup.matchAll(/\b(?:id|class)\s*=\s*["']([^"'<>]{0,300})["']/gi)].map(m => m[1]).concat([...js.matchAll(/\b(?:id|className)\s*=\s*(['"`])([^'"`\n]{0,200})\1/g)].map(m => m[2]), [...js.matchAll(/classList\.add\(\s*(['"`])([^'"`\n]{0,80})\1/g)].map(m => m[2]));
    const own = names.flatMap(n => n.split(/\s+/)).some(t => SCREEN_NAMES.has(t.toLowerCase()));
    if (own || /(['"`])game ?over!?\1/i.test(code)) add('warn', 'own_screens', 'Builds its own pause, title or results screen, but Oomba.game already has them (with sound, captions, the best score and 13 languages). Delete the hand-built one; use the spec\'s title, howTo and hud, and w.win() / w.lose() to end a round.');
    if (/\brequestAnimationFrame\s*\(/.test(code)) add('warn', 'own_loop', 'Runs its own requestAnimationFrame loop next to Oomba.game. Put per-frame code in update(w, dt): it runs on the game clock, stops on pause and replays the same in tests.');
  }
  // 5. Timing from the wall clock (keeps running through the pause screen, a hidden tab and the quiz card).
  if (/\bDate\s*\.\s*now\s*\(|\bsetInterval\s*\(|\bsetTimeout\s*\(/.test(code)) add('warn', 'timing', 'Times things with Date.now, setTimeout or setInterval, which keep running while the game is paused. Use the game clock: Oomba.after(ms, fn), Oomba.every(ms, fn), Oomba.wait(ms), w.after / w.every in Oomba.game (or Oomba.time.real.* for menus).');
  // 6. Expensive canvas effects every frame.
  if (/\bshadowBlur\b|\.\s*filter\s*=\s*(['"`])(?!none\1)/.test(code) && /\brequestAnimationFrame\b|\.\s*(?:draw|update)\s*\(|\bupdate\s*\(\s*w\b/.test(code)) add('warn', 'slow_effect', 'Uses shadowBlur or a canvas filter while drawing frames, which is very slow on school Chromebooks. Use the kit\'s glow part ({glow: {amount: 0.6}}), stage.light(...) or a sprite instead.');
  // 7. Right and wrong shown only by colour.
  const colourCue = /\b(?:Oomba|OK|O)\s*\.\s*color\(\s*(['"])(?:correct|wrong|go|hazard)\1|\b(?:background(?:-color)?|color|fillStyle)\s*[:=][^;\n}]{0,40}?\b(?:red|green)\b/i.test(code + '\n' + css);
  const shapeCue = /(['"])(?:check|cross)\1|\.\s*banner\s*\(|\.\s*ask\s*\(|[✓✔✕✗✘]/.test(code + markup);
  if (colourCue && !shapeCue) add('info', 'colour_only', 'Shows right and wrong (or go and stop) with colour alone, which some players cannot tell apart. Add a shape or words too: a ✓ / ✕ icon (Oomba.icon(\'check\'), Oomba.icon(\'cross\')) or Oomba.ui.banner(\'correct\' | \'wrong\').');
  // 8. Pack art without its pack tag (it would be snapped to the nearest core art, with a warning nobody sees).
  //    CONFIG counts here (that is where a game names its hero, biome and theme).
  const used = new Set([...js.matchAll(/\b(?:species|biome|kind|hero|host|titleHero|sprite|style)\s*:\s*(['"])([a-z][a-z-]{1,20})\1/g)].map(m => m[2])
    .concat([...js.matchAll(/\b(?:spawn|add|toCanvas|char|portrait)\(\s*(['"])([a-z][a-z-]{1,20})\1/g)].map(m => m[2]),
      [...js.matchAll(/(?:^|[{,\s])(['"]?)[^\s'"]\1\s*:\s*(['"])([a-z][a-z-]{1,20})\2/g)].map(m => m[3])));
  const version = (/\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/oomba-kit\.js/.exec(src) || [])[1], versionPacks = KIT_PACKS[version] || KIT_PACKS[KIT_LATEST] || {};
  // 8a. Themes (kit 1.1.0+, in the dress pack): a known name, on a kit that has them, with the packs its world needs.
  for (const m of js.matchAll(/\btheme\s*:\s*(?:\{\s*name\s*:\s*)?(['"])([A-Za-z][A-Za-z _-]{1,24})\1/g)) {
    const raw = m[2].toLowerCase().replace(/[^a-z]/g, ''); if (['light', 'dark', 'auto'].includes(raw)) continue;
    const name = THEME_ALIAS[raw] || raw, th = THEMES[name];
    if (!th) { add('warn', 'theme_name', `Names a theme the kit does not have ("${m[2]}"): the kit shows the nearest world. If the builder made this world up, keep their idea: the closest theme with a recolour, or a biome. Themes: ${Object.keys(THEMES).join(', ')}.`, { theme: m[2] }); continue; }
    if (!versionPacks['art-props']) { add('warn', 'theme_kit', `Uses theme: '${name}', but kit ${version} has no themes. Load the kit with exactly the tag the rules give (and its packs): themes came with kit 1.1.0.`); continue; }
    const need = ['dress', ...th.packs].filter(p => !src.includes(`/packs/${p}.js`));
    if (need.length) add('warn', 'pack_missing', `The ${name} theme needs the ${need.join(' and ')} pack${need.length > 1 ? 's' : ''}: add ${need.length > 1 ? 'their' : 'its'} pinned tag right after the kit tag (the rules list each theme's packs), or its world falls back to ${th.alt}.`);
  }
  for (const [pack, names] of Object.entries(PACK_ART)) {
    if (!versionPacks[pack] || src.includes(`/packs/${pack}.js`)) continue;
    const miss = [...used].filter(n => names.has(n));
    if (miss.length) { add('warn', 'pack_missing', `Uses ${sample(miss)} from the ${pack} art pack without loading it. Add the pack's pinned tag right after the kit tag (start_from_template and the rules give it exactly), or use core art.`); break; }
  }
  // 8b. A 2D kit game without the dress pack: its world stays bare (no props on the hills, no framing, no birds).
  if (usesGame && versionPacks.dress && !/\/packs\/dress\.js/.test(src) && !/\bdress\s*:\s*(['"])off\1/.test(code)) add('info', 'dress_missing', "Loads no dress pack, so the world stays bare. Add the dress pack's pinned tag right after the kit tag (every template has it): it dresses the biome with trees, houses, framing leaves and birds by itself.");
  // 8c. 3D kit games: the 3D bridge (kit 1.1.0+, the bridge-3d pack) gives them the kit's look.
  if (threeD && versionPacks['bridge-3d']) {
    const bridge = /\b(?:Oomba|OK)\s*\.\s*three\s*\(/.test(code);
    if (bridge && !src.includes('/packs/bridge-3d.js')) add('warn', 'pack_missing', "Uses Oomba.three without the bridge-3d pack. Add the pack's pinned tag right after the kit tag (and the dress pack's, for themes), or the 3D world has no kit look.");
    else if (!bridge) add('info', 'three_bridge', "A 3D game without the kit's 3D bridge: its world will not look like the other Oomba games. Load the bridge-3d pack and use Oomba.three(THREE, { renderer, scene, camera, theme }) for the sky, toon materials, Ink outlines and kit characters (the 3D rules show how).");
  } else if (threeD && /\b(?:Oomba|OK)\s*\.\s*three\s*\(/.test(code)) add('warn', 'theme_kit', `Uses Oomba.three, but kit ${version} has no 3D bridge: it came with kit 1.1.0. Load the kit and its packs with exactly the tags the rules give.`);
  // 9. Icons by a name the kit does not have (howTo cards, ui.button).
  const icons = [...code.matchAll(/\bicon\s*:\s*(['"])([a-z][a-z0-9-]{0,24})\1/g)].map(m => m[2]).filter(n => !ICON_NAMES.includes(n));
  if (icons.length) add('warn', 'icon_name', `Names icons the kit does not have (${sample(icons)}). Use one of Oomba.icons (${ICON_NAMES.slice(0, 12).join(', ')}, …).`);
  // 10. Own motion with no reduced-motion path.
  const moves = decls.some(d => (d.prop === 'animation' || d.prop === 'animation-name' || d.prop === 'transition') && !/^\s*none\b/i.test(d.value));
  if (moves && !/\.ok-rm\b|prefers-reduced-motion/.test(css)) add('warn', 'motion', 'Has its own CSS animation or transition with no reduced-motion version. Add a rule under .ok-rm (the kit puts it on its root when the player or the device asks for less motion), e.g. .ok-rm .card{animation:none;transition:none}, and read Oomba.settings.reduced in code when you move things.');
  // 11. on.gate that never asks, opens or decides.
  const gm = /\bgate\s*(?::\s*(?:async\s+)?(?:function\s*)?\(|\(\s*\w{0,20}\s*(?:,\s*\w{0,20}\s*)?\)\s*\{|:\s*(?:async\s+)?\(?[\w\s,]{0,40}\)?\s*=>)/.exec(code);
  if (gm && usesGame && !/\bask\s*\(|\.open\s*\(|return\s+(?:true|false)\b/.test(code.slice(gm.index, gm.index + 1200))) add('info', 'gate_handler', 'on.gate never asks, opens the gate or returns true / false. When it returns nothing the gate asks its own question (q, a, choices); with no question it just opens. Return true to open it, false to keep it shut, or call w.ask() yourself.');
  // 12. controls 'none' with pickups, a goal or gates in the level, and nothing that moves the hero.
  if (/\bcontrols\s*:\s*(['"])none\1/.test(code)) {
    const rows = [...code.matchAll(/(['"`])([ #=~$GQPKLiBNa-zA-Z^*@.]{8,200})\1/g)].map(m => m[2]).filter(r => /[#=]/.test(r) || /^ +[^ ]/.test(r));
    const things = rows.some(r => /[$GQ]/.test(r));
    if (things && !/\bhero\s*\.\s*[xy]\s*[+\-]?=|\.x\s*\+=|\bmoveHero\b|tween\([^)]{0,40}hero/.test(code)) add('warn', 'none_world', "Has controls: 'none' but its level has pickups, a goal or a gate the hero can never reach (nothing moves the hero). Move the hero from code (w.hero.x += …, or a tween), use a control preset, or take $ G Q out of the level.");
  }
  // 13. String keys that no strings table defines (they would show as the raw key).
  const keys = [...code.matchAll(/\b(?:subtitle|text|hurtSay|trySay|fallSay|splashSay)\s*:\s*'([a-z][A-Za-z0-9_]{1,30})'/g)].map(m => m[1])
    .concat([...code.matchAll(/\b(?:Oomba|OK|O)\s*\.\s*t\(\s*'([a-z][A-Za-z0-9_]{1,30})'/g)].map(m => m[1]), [...code.matchAll(/\bw\s*\.\s*say\(\s*[\w.]{1,30}\s*,\s*'([a-z][A-Za-z0-9_]{1,30})'/g)].map(m => m[1]));
  const hasStrings = /\bstrings\s*[:(]|\bWORDS\b|\bSTRINGS\b/.test(code);
  const missing = hasStrings ? [...new Set(keys)].filter(k => !new RegExp(`(?:^|[\\s{,'"])${k}['"]?\\s*:`, 'm').test(code)) : [];
  if (missing.length) add('info', 'missing_key', `Uses string keys no strings table defines (${sample(missing)}): they show as the raw word. Add them to the strings for every language (an English fallback at least).`);
  // 14. Oomba Live (a game that loads the live pack or uses Oomba.live): what keeps it from being live-ready, and the
  //     run-time limits it should not rely on (docs/kit-api.md "Live class games"). Never blocking: hosting checks again.
  if (/\/packs\/live\.js|\b(?:Oomba|OK)\s*\.\s*live\b/.test(src)) for (const i of liveCheckHtml(src).issues) add('warn', i.code, LIVE_NOTES[i.code] || i.code);
  return o.request ? respectChoices(out, o.request) : out;
}
