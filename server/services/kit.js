// The Oomba Kit: the shared visual foundation for games, self-hosted under public/vendor/oomba-kit/<version>/ and
// loaded with exactly the tag kitTag() makes (pinned version, SRI, crossorigin="anonymous": the frame is opaque-origin,
// so without crossorigin the integrity check cannot run). Version folders never change and KIT_VERSIONS only grows;
// scripts/build-kit.js writes the hashes. Pure module (no database): used by the scanner, the frame, the screenshot
// worker and (phase 2) the Builder prompt. See docs/kit.md.

export const KIT_PATH = '/vendor/oomba-kit/';
// version -> sha384 of oomba-kit.js (tests/unit/kit-platform.test.js checks these against the files on disk).
export const KIT_VERSIONS = Object.freeze({
  '1.1.4': 'sha384-zeLmUxnF20GLI7VC6XfgOcb9DiFTxC7mSAc0QTkXllv6zvdzzEFtrAWb6TsmeAIY',
  '1.1.3': 'sha384-C3W9aOBuSkvtAv0cHch+tzSi9h4GN4XCkR3u9iTN7D83Xx2nTtdr3zkPLu6EdBuH',
  '1.1.2': 'sha384-AmMbwWGTsxIxVi7l6ccbsROlhaqKEr8dP6sisHytkqLuCwTd/sMLTZyFBpp+J1Q1',
  '1.1.1': 'sha384-Wgqj2PSlFwytZeZGp8pP88yYh+9gBwHsxfR8iCSwFGanfxtFvm0nCajioExdU9cR',
  '1.1.0': 'sha384-GCejMN1YYamlsZNEJw6SRznGmZC2i6tppYwkLt8cv2gI3YTTsZq6l8eyUQuAM8qX',
  '1.0.1': 'sha384-tDcRpCvfTdRzJKs8zs3Al8GnILyvX7BJr3K5+qPukmr6z0kgKJVOSl1UJMSCDs46',
  '1.0.0': 'sha384-z+NesXSa8n9F3R0/dcZ7o60eHwzQbYE94cEyPfLu6WlUZ2zOaEO2OAS6WsmM7oUU',
});
// version -> {pack name -> sha384 of packs/<name>.js}: the optional art packs (extra species, props, biomes). A game
// loads a pack with exactly kitPackTag(name), after the kit's own tag; only games that use a pack download it.
export const KIT_PACKS = Object.freeze({
  '1.1.4': Object.freeze({ 'art-animals': 'sha384-GntsshX3KJc7NNGcJsefnPEcYLfY5lHGL5ow+tGUPHbiwbiLKzdYKFp9uciiblsG', 'art-biomes': 'sha384-7EqxxnUHM57jidVwIEmkW2+6tInN7yNz5FL4U425SDba9aG6E0pxZ4WCVUpMkutY', 'art-biomes-2': 'sha384-/D0ttsmuy/+HmihYBdD8Yiff0P5yh7D9c27jBT6R6tjyIto4VGKiX9EZQgAB2pHH', 'art-props': 'sha384-9tpA0++uM7b3UfvT/6FfH/hFFWhP5Ipvv1JEBl7UPxkukZiBOM9ADRblCr0qCzKk', 'art-school': 'sha384-VQndRmNEoGnNDs6VhEBvG5GpzW0Iwl5NJYE8VU2j403u8b7qeI44NX89zuTbzM21', 'bridge-3d': 'sha384-dZl/EUIjGYcH90e1J93U/DTNE+FYkhePQoWjUCYuSGuB0brjy8Jdple5cbF56eeL', 'dress': 'sha384-lGMyixBO/dQI5mVlIYp2m9rQk1Qiejkp7f7tcNxKKlSew+i0VKx3Soojbns6sDRo', 'live': 'sha384-V/WZAt4Rt7htCl5SRMF8bKpJwS6/1ijg3qNaqdnbhovlXPMbC2Oy6TYc5XrjXx1V', 'style-bold': 'sha384-dtsIs1XzPIodWCwlRmUUGv3b45RNWFTtMH4mSmcY+QmPfH+QqjFebkDnd+QfbB0w' }),
  '1.1.3': Object.freeze({ 'art-animals': 'sha384-BwLptTueADpqBmgLs41pCV8UhbJxHD65ThZMuvbASFcHB9IZgxh5pa60fE5tWGwP', 'art-biomes': 'sha384-piRDUZEIHwMIV7bF6cCR8hyf9pgBRUQoxoLnL9cgowVnAHPDywpL1TZlR0hkIJRc', 'art-biomes-2': 'sha384-DreIwFLRxbLjCnv8CC2hfcRObpNynlew3Pj7A1vG3BxIG4E4g1s0gXQFF8hLFswn', 'art-props': 'sha384-E2lAqpLj/Q6iEwoIdyK/MXu8x8WVmey7Q1Pipb398HbA6hQ9upXgTcs5Jnxe8PGB', 'art-school': 'sha384-FTwR3CLpBLvzyxnwZgn3NlQmKTbLdjXWzrZQY9Mam6uQyRsWmaX0XVPnU2fizTu0', 'bridge-3d': 'sha384-qyVacXBVKGGz6QtKsRiQCBS7axZV8wSw33i+b9Gr05/JlR3vRGAgv3M2tV8woPa+', 'dress': 'sha384-9wPjHho+viJMVdJg8L4+1ENGqI/oQT3z3YT7Y5WZ+WbBv2hGK7t0HR67J5LxaylI', 'live': 'sha384-O5DZlUvgxSbzmdMIma1pSVBnByXsQ3s7sM6CjwBNqnujGYfZDAj7aC5awLbbOYL7', 'style-bold': 'sha384-i+2xOZkOmn/jzS9bfDkJQWAetSPYOjUsBviaQ/UWdPf98XiqTCQFZutBNQL9GwLu' }),
  '1.1.2': Object.freeze({ 'art-animals': 'sha384-LAlaHnVYonjfYXaWIgYub5WQsRg206X2TJRUsvoyCjZbyL1+pQVBpSGEJ+OgJION', 'art-biomes': 'sha384-ncXx4zVCTio0bUVqrvpQ0uAKmvm/JcWprinhR0X/rlmHV/9UfwEw3wirHq+Hhsc+', 'art-biomes-2': 'sha384-HLqoCO2/jj82nsj7mFOu0oYfcC9/3M5xWooNfKXjsX8roLgcEPErFyk1DoLhDHES', 'art-props': 'sha384-dsw3ogA6t3JcMxKaJGuXFen3ronsQ4c4p5ef15u7YgQMUPhf+Ht4tgKG9a/QuvbA', 'art-school': 'sha384-xbmoMTLjBXfyHbxMV8HIl3jSzcl3bxEMMdgGu+KgGuyZY+WNXrh9ogBhRTpyMWO8', 'bridge-3d': 'sha384-AFvPKYnmW3Fs6eWrWCt5/XJ5bLQQ5HUXBruQp+RWtcR/T3bGMwngfsdU2Sk+ODz8', 'dress': 'sha384-JZ2+9mOMVNO4iOIJ8Geoa/9ryqx6ygcPzCxDnZ1XmwOKuMJSCM3llSYH2L4SUAYV', 'live': 'sha384-YsmClLSiQSdFK30eih8Rq+M0n5fKDuFHqKQNfz5WdmxYjdvLba6zuBqqS6IFU4IM', 'style-bold': 'sha384-pFXgoNOZ/kWWctAb2ucgoE+wLssJGKLBbeZJppwZQlTGTPqBEFYA0dOtLTst2DiH' }),
  '1.1.1': Object.freeze({ 'art-animals': 'sha384-1+gICzmVtut34LdNT/D7rRd+sZTT64OOrsRaDAb7t1teIYgUt4C+v8gPyYEkuffy', 'art-biomes': 'sha384-4cHhNf1PrNwk+hg/FOgSv6DmKZEj8xjg+QHv4d4uvaxGECpSrr4ufAi8GRvgypFq', 'art-biomes-2': 'sha384-u9YkoqK1K+ldCH7jwk+Zejoni3Vqx8D7H3LKXnSwus4KTCcu0zlOtvYBJqQA6Vrq', 'art-props': 'sha384-g3+Dl+tJaadQRMXioJmD2uWS1tG/w6VsLwkbYCk7R0msHjhFzoRyBLUneN8UbKh/', 'art-school': 'sha384-8/rWOf8YLZdCX9UybhjqQslrbsd3e8QMlwqMezsL6IwAbcCNr/oa9Dk/KTX+4j+k', 'bridge-3d': 'sha384-R/CTtC6xebHbpJ8ThLH63lWo3cK99guBfvkXhkRfRHq/ExI5IMfyrwfaS4ebuC/m', 'dress': 'sha384-vTqWJ0kg/5vWPNHKvjUbbIfH1xIJ6SlshBrz3XF7a+0PM5ksjktWUX+51fISbvgA', 'live': 'sha384-YeX04fBWdCGAP/BiIkFowgE77W/gKEQa+9aaBeHB1WWxiJiUggyVCj8MSq166q8V', 'style-bold': 'sha384-B2WLn83DNOUWH/voSVa2u4JRHQ8sxLaW2/p6FY0MXvzXCJOufUio+Wj9GB9QvEEg' }),
  '1.1.0': Object.freeze({ 'art-animals': 'sha384-0kgnnCmovTaNwWnsPFryp1c8kgX7ji/jku0tdAsfRwfiaWP9usy3eBLuIdBsh8jE', 'art-biomes': 'sha384-UVVUeKEbyMD1WPlwhrdiH/sB6bVZpbw7GKz2KoN4VJg/JMMI+hUkvx2Ts03akI3t', 'art-biomes-2': 'sha384-0ad0awdyk2fC5pFpqYc/7EABVSKTEe1ZKo2YB6cvjKZDIDA2mI1+YRUEQhOgXrHs', 'art-props': 'sha384-/RtKQ/ov2WG1EoCt4pJ98rHY07jOZjZ+lia901K+1BfS49MydEROuw7UaInBPHle', 'art-school': 'sha384-tjWzckG1fXZNGAIROedz8rciqX12aec8Bw77p9Pn81hGGnR/2i9HS7cM6023xw0P', 'bridge-3d': 'sha384-XrVZh1TfGin1ajGCc72TzhAxeqUJQM3JI3kI1weHoMgUIV4urBdPtJbZxO7wPOli', 'dress': 'sha384-ZCFgY98YAWY7Tcy+GfJLalmnJukKdzbVpg6j4ZljXuJSYgYzkWSWMPihVW/u8CqH', 'live': 'sha384-coSMEAXKgHblAGttFS4mvWXqRq7LEVGZP+rPPYCxp8BnVqWKHWjnu+kWuuB1vd2m', 'style-bold': 'sha384-k+n1lKA8kY7eQBU96sQUOp6Hb9i7/wDs/mQ3rkJFKRpyeIpcGqF0XDCcCm28Mjp0' }),
  '1.0.1': Object.freeze({ 'art-animals': 'sha384-wU/R/Sio0vUM5Mw4P+17xtobKFhB1PaOi4YGriGuERJUzBDj2tshWsDP2wbA0ReT', 'art-biomes': 'sha384-byqpnRLN3nAKB5nun+h+ZGUfHq1zKwFKr52Ohk5CbJJihjjzU3OJDufWmaRR7AD7', 'art-school': 'sha384-+RmA1hDUtGZ6RB0heExwfC91Luvng8DjQVsg8eZ71ymwMKQ5Lnjd2bqkN56Yg1fD', 'dress': 'sha384-FlNKnsCDAfpUo8lyJWlmK86r/UHiBWdr4Gxb05qBtUlK84V6/VOru7Q9ynbl9ODe', 'style-bold': 'sha384-94atha+FTu9W5Nuo+cIGWTk/EG7WlKbIRzQ7gkOgU9NobZjgayVaS3cbQul8+hIK' }),
  '1.0.0': Object.freeze({ 'art-animals': 'sha384-fIOJsCe/mBmelLUnXEhcOGl0x7/dQvXe5xKjHrOD4KegZbvOrJ9DzTizBzU9RzOD', 'art-biomes': 'sha384-0X8OvdyaknEYsK5nXvhDnMNWl1lS8XuHH/SKuJrOF7CjDIwxYbp3yQeChbVl2zhH', 'art-school': 'sha384-yCC/QOZAd0OcPMGet+ySH+2pkji2SRciYBilMG/braih3toohKVqxJGR4YoQJrqM', 'dress': 'sha384-cLr8VKytVQYDunYCBWc3ZZuc3v1GsLxrYMkqdof5zRFlOs4VKIp5cxtTLrMpBDLe', 'style-bold': 'sha384-smhSYk+V6EuNb/TjWseiOlH187FTJModZe951GNvlqgfYC5e1txwq8ST3ql1sch+' }),
});
// version -> {pack name -> [older sha384s]}: hashes an unlocked pack (not in kit/SHIPPED.json) had before it was
// rebuilt in place. Saved games (Builder games pin {{PACK_TAG:live}} as a literal hash) still name them, so the scanner
// accepts them and upgradePackPins() rewrites them to the current hash whenever a game is served, so the browser's
// integrity check passes. The live pack's files are a superset of the old API (part 3 added teams). Only grows.
export const KIT_PACKS_RETIRED = Object.freeze({
  '1.1.0': Object.freeze({ live: Object.freeze(['sha384-PoL1d2TQvVJAaM+LOoFIDiwk0wF23Ue5ASvgQgvkBEjRB/qhCQ+b0BJ93864hhig']) }),
});
const retired = (v, name, h) => !!(KIT_PACKS_RETIRED[v] && KIT_PACKS_RETIRED[v][name] && KIT_PACKS_RETIRED[v][name].includes(h));
// The version new games get (kitTag() and kitPackTag() default to it: templates, the Builder's rules, the /kit preview).
// Older versions stay servable for the saved games that pin them; their files never change (kit/SHIPPED.json).
export const KIT_LATEST = '1.1.4';
export const kitSrc = (v = KIT_LATEST) => `${KIT_PATH}${v}/oomba-kit.js`;
export const kitPackSrc = (name, v = KIT_LATEST) => `${KIT_PATH}${v}/packs/${name}.js`;

/** The one script tag a game uses to load the kit. */
export function kitTag(v = KIT_LATEST) {
  if (!KIT_VERSIONS[v]) throw new Error(`unknown kit version ${v}`);
  return `<script src="${kitSrc(v)}" integrity="${KIT_VERSIONS[v]}" crossorigin="anonymous"></script>`;
}

/** The tag for one art pack (it goes right after kitTag(v), same version). */
export function kitPackTag(name, v = KIT_LATEST) {
  const h = KIT_PACKS[v] && KIT_PACKS[v][name];
  if (!h) throw new Error(`unknown kit pack ${name} for ${v}`);
  return `<script src="${kitPackSrc(name, v)}" integrity="${h}" crossorigin="anonymous"></script>`;
}
/** The packs a version has. */
export const kitPacks = (v = KIT_LATEST) => Object.keys(KIT_PACKS[v] || {});

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([a-z-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
function attrs(s) {
  const out = {}; let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
}
const PIN_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/oomba-kit\.js$/;
const PACK_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/packs\/([a-z0-9-]+)\.js$/;

/** A saved game's pack tags with a retired hash (KIT_PACKS_RETIRED) get the pack's current hash; nothing else changes. */
export function upgradePackPins(html) {
  html = String(html || '');
  if (!html.includes('/packs/')) return html;
  return html.replace(SCRIPT_RE, (block, attrText) => {
    const a = attrs(attrText); const k = PACK_RE.exec(a.src || '');
    if (!k || !retired(k[1], k[2], a.integrity)) return block;
    return block.split(a.integrity).join(KIT_PACKS[k[1]][k[2]]);
  });
}

// version -> the patch release served in its place: the same API with fixes (1.0.1 and 1.1.1: the settings switch's
// knob stays inside its track on every engine and theme, the settings button is a cog, setting rows wrap on narrow
// phones; 1.1.2: in a 3D world up and W walk forward and never also jump, and the 3D bridge gains a walker, solids and
// a follow camera, so 3D maps keep the player on the ground; 1.1.4: earned stars on the results card turn yellow in
// dark mode too). Saved games keep their stored tags; upgradeKitPins()
// swaps them whenever a game is served. Only grows (an entry may move on to a later patch of the same minor version).
export const KIT_PATCHES = Object.freeze({ '1.0.0': '1.0.1', '1.1.0': '1.1.2', '1.1.1': '1.1.2', '1.1.3': '1.1.4' });

/** A saved game served on the kit's patch release (KIT_PATCHES): its core tag and every pack tag move to the patch
 *  version with their hashes. Only when every kit tag is a valid pin of the same patched version (otherwise the game
 *  is left exactly as it is, and the scanner's rules apply). Retired pack hashes are upgraded first. */
export function upgradeKitPins(html) {
  html = upgradePackPins(html);
  const from = kitVersion(html), to = from && KIT_PATCHES[from];
  if (!to) return html;
  let ok = true;
  const out = html.replace(SCRIPT_RE, (block, attrText) => {
    const a = attrs(attrText), src = a.src || '', p = PIN_RE.exec(src), k = PACK_RE.exec(src);
    if (!p && !k) return block;
    const want = p ? KIT_VERSIONS[from] : KIT_PACKS[from][k[2]], next = p ? KIT_VERSIONS[to] : KIT_PACKS[to][k && k[2]];
    if ((p || k)[1] !== from || a.integrity !== want || !next) { ok = false; return block; }
    return block.split(src).join(p ? kitSrc(to) : kitPackSrc(k[2], to)).split(a.integrity).join(next);
  });
  return ok ? out : html;
}

/** The pinned kit version a game loads, or null. */
export function kitVersion(html) {
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]); const p = PIN_RE.exec(a.src || '');
    if (p && KIT_VERSIONS[p[1]] === a.integrity && a.crossorigin === 'anonymous') return p[1];
  }
  return null;
}

/**
 * Scanner rules -> { issues: [{level, code, message}], rest } where rest is the game with the pinned kit tags taken
 * out (so the other checks never see them). Accepted: exactly kitTag(v) for a known v (attributes in any order and
 * quoting, nothing else in the tag). Pack tags are accepted the same way (exactly kitPackTag(name, v), after the kit tag of that version).
 * Anything else that names /vendor/oomba-kit/ fails, with a message the Builder can act on.
 */
export function checkKit(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  let core = null;   // the version of the kit tag seen so far (packs must follow it)
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText);
    if (!(a.src || '').includes(KIT_PATH)) return block;
    const extra = Object.keys(a).filter(k => !['src', 'integrity', 'crossorigin'].includes(k));
    const k = PACK_RE.exec(a.src);
    if (k) {
      const h = KIT_PACKS[k[1]] && KIT_PACKS[k[1]][k[2]];
      if (!h) {
        // a pack that came with a newer kit (an old game asking for art-props): say which kit has it
        const newer = KIT_VERSIONS[k[1]] && KIT_PACKS[KIT_LATEST][k[2]];
        add('kit_pin', newer ? `The ${k[2]} pack came with Oomba Kit ${KIT_LATEST}; this game loads kit ${k[1]}. Move the game to ${kitTag()} (and its packs from ${KIT_LATEST}) to use it, or drop the pack.`
          : `Loads an Oomba Kit pack we do not have (${k[2]} for ${k[1]}). Packs: ${kitPacks(KIT_VERSIONS[k[1]] ? k[1] : KIT_LATEST).join(', ')}. Use exactly: ${kitPacks().length ? kitPackTag(kitPacks()[0]) : kitTag()}`);
        return block;
      }
      const exact = kitPackTag(k[2], k[1]);
      if (a.integrity !== h && !retired(k[1], k[2], a.integrity)) { add('kit_pin', `The Oomba Kit pack tag has the wrong integrity value. Use exactly: ${exact}`); return block; }
      if (a.crossorigin !== 'anonymous') { add('kit_pin', `The Oomba Kit pack tag needs crossorigin="anonymous". Use exactly: ${exact}`); return block; }
      if (extra.length || body.trim()) { add('kit_pin', `The Oomba Kit pack tag must be exactly: ${exact}`); return block; }
      if (core !== k[1]) { add('kit_pin', `The ${k[2]} pack must come after the Oomba Kit tag of the same version: ${kitTag(k[1])} then ${exact}`); return block; }
      return ' ';
    }
    const p = PIN_RE.exec(a.src);
    if (!p || !KIT_VERSIONS[p[1]]) { add('kit_pin', `Loads an Oomba Kit version we do not have. Use exactly: ${kitTag()}`); return block; }
    if (a.integrity !== KIT_VERSIONS[p[1]]) { add('kit_pin', `The Oomba Kit tag has the wrong integrity value. Use exactly: ${kitTag(p[1])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('kit_pin', `The Oomba Kit tag needs crossorigin="anonymous". Use exactly: ${kitTag(p[1])}`); return block; }
    if (extra.length || body.trim()) { add('kit_pin', `The Oomba Kit tag must be exactly: ${kitTag(p[1])}`); return block; }
    core = p[1];
    return ' ';
  });
  // Oomba.debug is the kit's unsupported internals: it is not there in games (only in the /kit preview), so a game that
  // names it breaks. A flag, so the Builder sees it and a person looks before Public.
  if (/\b(Oomba|OK)\s*\.\s*__pk\b/.test(rest) && !issues.some(i => i.code === 'kit_debug')) issues.push({ level: 'flag', code: 'kit_debug', message: 'Uses Oomba.__pk, the hook only the kit’s own pack files call. Load a pack with its pinned tag instead.' });
  if (/\b(Oomba|OK)\s*\.\s*debug\b/.test(rest) && !issues.some(i => i.code === 'kit_debug')) issues.push({ level: 'flag', code: 'kit_debug', message: 'Uses Oomba.debug, the kit’s internal test object, which games do not have. Use the public API instead: Oomba.test({state, start}), Oomba.scene, stage.timeOfDay.' });
  if (rest.includes(KIT_PATH) || /\/vendor\/oomba-kit\b/.test(rest)) add('kit_tag', `Uses the Oomba Kit files in a way we do not allow (only the script tag may name them). Load it with exactly: ${kitTag()}`);
  return { issues, rest };
}
